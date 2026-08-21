/**
 * MAÇ MERKEZİ (tek maç) — kadro/diziliş girme ve rakip analizi.
 *
 * İKİ SEKME: "Kadro" (bu maçın kadrosu, dizilişi, forma rengi, taktiği) ve
 * "Rakip Analizi" (sunucudan gelen karar-destek raporu + skor simülasyonu,
 * bkz. components/MatchAnalysisView.tsx). Web panelindeki Maç Merkezi'nin
 * "Kadro & Ayarlar / Rakip Analizi" ayrımıyla birebir aynıdır; analiz mobilde
 * hiç yoktu.
 *
 * "İdeal kadro" (Kadro Yönetimi) takımın genel tercihidir; BURASI maça özeldir:
 * bu maçta kim ilk 8'de, kim yedek, kaptan kim, kadroda misafir oyuncu var mı.
 * Reji ekranı maç günü bu kadroyu okur.
 *
 * SUNUCU KURALLARI (services/teamMatchCenterService.js → validatePlan):
 *   · diziliş sözlükte olmalı (constants/formations.js)
 *   · forma renkleri #RRGGBB
 *   · kadro 1-20 oyuncu
 *   · forma numaraları benzersiz, aynı oyuncu iki kez olamaz
 *   · en fazla bir kaptan
 *   · maç canlıya geçtiyse 409 MATCH_ALREADY_LIVE
 * Bu kuralların hepsi burada da uygulanır ki kullanıcı sunucu hatasını
 * beklemeden uyarıyı görsün; sunucu yine de son sözü söyler.
 *
 * SAHA GÖRÜNÜMÜ: ilk sekiz artık listede değil, sahada kurulur
 * (`components/PitchLineup.tsx` — Kadro Yönetimi'ndeki ideal kadroyla AYNI
 * bileşen ve aynı iki dokunuşluk etkileşim). Neden: "kim ilk sekizde" sorusu
 * bir liste sorusu değil, bir YERLEŞİM sorusudur; düz listede kaleci ile
 * forvet aynı görünüyordu ve `slot` alanı hiç doldurulmuyordu — reji ekranı
 * da diziliş bilgisini bu alandan okuyor. Yedekler ve kadro dışı oyuncular
 * liste olarak kalır: onların yerleşimi yok, yalnız sırası var.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MatchAnalysisView } from "@/components/MatchAnalysisView";
import { PitchBench, PitchLineup, type PitchPlayer } from "@/components/PitchLineup";
import {
  Avatar,
  BottomSheet,
  Button,
  Card,
  Chip,
  ChipGroup,
  EmptyState,
  ErrorState,
  Input,
  ScreenHeader,
  SectionHeader,
  SegmentedControl,
  SkeletonListRow,
  Stepper,
  Touchable,
  useToast,
  type SegmentedItem,
} from "@/components/ui";
import {
  createGuestPlayer,
  DEFAULT_FORMATION,
  FORMATIONS,
  FORMATION_NAMES,
  getTeamMatchPlan,
  getTeamRoster,
  MAX_STARTERS,
  positionLabel,
  POSITIONS,
  saveTeamMatchPlan,
  type MatchPlanPlayer,
  type RosterPlayer,
} from "@/lib/api/team";
import { ApiError } from "@/lib/http";
import { mediaUrl } from "@/lib/format";
import { useAuth } from "@/providers/AuthProvider";
import { colors, haptics, radius, space, textScale, type } from "@/theme";

/** Ekranda tutulan satır — sunucu biçimine kaydederken MatchPlanPlayer'a çevrilir. */
interface Entry extends MatchPlanPlayer {
  /** Listede göstermek için; sunucuya gitmez. */
  displayName: string;
  photo?: string | null;
}

/**
 * Ekranın iki sekmesi — web panelindeki "Kadro & Ayarlar / Rakip Analizi"
 * ayrımının birebir karşılığı. Analiz ayrı bir ekrana konmadı: başkan kadroyu
 * kurarken analize bakıp geri dönüyor; iki ayrı ekran her geçişte kadro
 * taslağını yeniden yüklerdi.
 */
type MatchTab = "kadro" | "analiz";

const MATCH_TABS: SegmentedItem<MatchTab>[] = [
  { key: "kadro", label: "Kadro", icon: "people-outline" },
  { key: "analiz", label: "Rakip Analizi", icon: "analytics-outline" },
];

const DEFAULT_KIT = "#6D28D9";
const HEX = /^#[0-9a-fA-F]{6}$/;

/** Hazır forma renkleri — elle hex yazdırmak yerine. */
const KIT_COLORS = [
  "#6D28D9", "#E11D2E", "#1D4ED8", "#128A4B",
  "#111827", "#F5F5F5", "#E0A106", "#EA580C",
];

export default function MacKadrosuScreen() {
  const auth = useAuth();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();

  const params = useLocalSearchParams<{ matchId?: string }>();
  const matchId = Number(params.matchId);

  const planQuery = useQuery({
    queryKey: ["team", "match-plan", matchId],
    queryFn: () => getTeamMatchPlan(matchId),
    enabled: Boolean(auth.user) && Number.isInteger(matchId) && matchId > 0,
  });

  const rosterQuery = useQuery({
    queryKey: ["team", "roster"],
    queryFn: getTeamRoster,
    enabled: Boolean(auth.user),
    staleTime: 60_000,
  });

  const [formation, setFormation] = useState<string>(DEFAULT_FORMATION);
  const [kit, setKit] = useState<string>(DEFAULT_KIT);
  const [tactics, setTactics] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [editing, setEditing] = useState<Entry | null>(null);
  const [guestOpen, setGuestOpen] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [tab, setTab] = useState<MatchTab>("kadro");

  /* Sunucudaki planı bir kez forma yükle. Sonraki tazelemeler kullanıcının
     yaptığı düzenlemeyi EZMEMELİ — bu yüzden hydrated bayrağı var. */
  useEffect(() => {
    if (hydrated || !planQuery.data) return;
    const plan = planQuery.data.plan;
    const roster = rosterQuery.data?.roster ?? [];
    const nameOf = (id: number | null) =>
      roster.find((player: RosterPlayer) => player.id === id)?.player_name ?? "Oyuncu";
    const photoOf = (id: number | null) =>
      roster.find((player: RosterPlayer) => player.id === id)?.player_img ?? null;

    if (plan?.lineup?.length) {
      setFormation(plan.formation || DEFAULT_FORMATION);
      setKit(plan.kit_color && HEX.test(plan.kit_color) ? plan.kit_color : DEFAULT_KIT);
      setTactics(plan.tactics ?? "");
      setEntries(
        plan.lineup.map((row) => ({
          ...row,
          displayName: row.isGuest ? row.guestName || "Misafir" : nameOf(row.playerId),
          photo: row.isGuest ? null : photoOf(row.playerId),
        }))
      );
    } else if (planQuery.data.lineup?.length) {
      // Plan yok ama reji tarafında kadro satırları var: onları başlangıç kabul et.
      setEntries(
        planQuery.data.lineup.map((row) => ({
          playerId: row.oyuncu_id ?? null,
          isGuest: false,
          guestName: null,
          jerseyNumber: row.forma_no ?? null,
          position: row.mevki ?? null,
          starter: Boolean(row.ilk11_mi),
          captain: false,
          slot: null,
          displayName: row.oyuncu_adi || nameOf(row.oyuncu_id ?? null),
          photo: photoOf(row.oyuncu_id ?? null),
        }))
      );
    }
    setHydrated(true);
  }, [planQuery.data, rosterQuery.data, hydrated]);

  /* ─────────────────────────── türetilmiş durum ─────────────────────────── */

  const [activeSlot, setActiveSlot] = useState<string | null>(null);

  const starters = useMemo(() => entries.filter((entry) => entry.starter), [entries]);
  const subs = useMemo(() => entries.filter((entry) => !entry.starter), [entries]);

  /* ── Saha ────────────────────────────────────────────────────────────────
     Yuvalar dizilişten gelir; bir yuvada duran oyuncu HEM `starter` HEM de
     `slot` taşır. Sunucu ikisini birlikte bekliyor: `starter` kadro kartını,
     `slot` reji ekranındaki yerleşimi belirliyor. */
  const slots = useMemo(() => FORMATIONS[formation] ?? [], [formation]);

  const toPitchPlayer = useCallback(
    (entry: Entry): PitchPlayer => ({
      id: Number(entry.playerId),
      name: entry.displayName,
      jerseyNumber: entry.jerseyNumber,
    }),
    [],
  );

  const pitchAssignments = useMemo(() => {
    const result: Record<string, PitchPlayer | undefined> = {};
    entries.forEach((entry) => {
      if (entry.starter && entry.slot && slots.includes(entry.slot)) {
        result[entry.slot] = toPitchPlayer(entry);
      }
    });
    return result;
  }, [entries, slots, toPitchPlayer]);

  /** Sahada olmayan herkes — yedekler ve yuvası atanmamış ilk kadro oyuncuları. */
  const pitchBench = useMemo(
    () =>
      entries
        .filter((entry) => !(entry.starter && entry.slot && slots.includes(entry.slot)))
        .map(toPitchPlayer),
    [entries, slots, toPitchPlayer],
  );
  const inSquad = useMemo(
    () => new Set(entries.filter((entry) => !entry.isGuest).map((entry) => entry.playerId)),
    [entries]
  );

  const available = useMemo(
    () => (rosterQuery.data?.roster ?? []).filter((player: RosterPlayer) => !inSquad.has(player.id)),
    [rosterQuery.data, inSquad]
  );

  /** Kaydetmeden önce sunucunun uygulayacağı kuralları burada anlat. */
  const problem = useMemo<string | null>(() => {
    if (!entries.length) return "Kadroya en az bir oyuncu ekle.";
    if (entries.length > 20) return "Kadro en fazla 20 oyuncu olabilir.";
    if (starters.length > MAX_STARTERS) return `İlk kadro en fazla ${MAX_STARTERS} oyuncu olabilir.`;
    if (entries.filter((entry) => entry.captain).length > 1) return "Yalnızca bir kaptan seçebilirsin.";
    const jerseys = entries.map((entry) => entry.jerseyNumber).filter((no): no is number => no != null);
    if (new Set(jerseys).size !== jerseys.length) return "Forma numaraları benzersiz olmalı.";
    if (!HEX.test(kit)) return "Forma rengi geçersiz.";
    return null;
  }, [entries, starters.length, kit]);

  /* ─────────────────────────── eylemler ─────────────────────────── */

  const addPlayer = useCallback(
    (player: RosterPlayer) => {
      haptics.select();
      setEntries((prev) => [
        ...prev,
        {
          playerId: player.id,
          isGuest: false,
          guestName: null,
          jerseyNumber: null,
          position: player.team_position ?? player.profile_position ?? null,
          starter: prev.filter((entry) => entry.starter).length < MAX_STARTERS,
          captain: false,
          slot: null,
          displayName: player.player_name,
          photo: player.player_img ?? null,
        },
      ]);
    },
    []
  );

  const removeEntry = useCallback((target: Entry) => {
    setEntries((prev) =>
      prev.filter((entry) =>
        target.isGuest
          ? !(entry.isGuest && entry.displayName === target.displayName)
          : entry.playerId !== target.playerId
      )
    );
  }, []);

  const patchEntry = useCallback((target: Entry, patch: Partial<Entry>) => {
    setEntries((prev) =>
      prev.map((entry) => {
        const same = target.isGuest
          ? entry.isGuest && entry.displayName === target.displayName
          : entry.playerId === target.playerId;
        if (!same) return entry;
        return { ...entry, ...patch };
      })
    );
  }, []);

  const selectSlot = useCallback((slot: string) => {
    setActiveSlot((current) => (current === slot ? null : slot));
  }, []);

  /** Yuvadan çıkarılan oyuncu kadrodan DÜŞMEZ, yedeğe iner. */
  const clearSlot = useCallback((slot: string) => {
    setActiveSlot(null);
    setEntries((prev) =>
      prev.map((entry) =>
        entry.slot === slot ? { ...entry, slot: null, starter: false } : entry,
      ),
    );
  }, []);

  /** Havuzdan seçilen oyuncuyu seçili yuvaya yerleştirir. */
  const placeOnPitch = useCallback(
    (player: PitchPlayer) => {
      if (!activeSlot) return;
      haptics.select();
      setEntries((prev) =>
        prev.map((entry) => {
          // Yuva başka birindeyse o kişi yedeğe iner: bir yuva tek kişiliktir.
          if (entry.slot === activeSlot && Number(entry.playerId) !== player.id) {
            return { ...entry, slot: null, starter: false };
          }
          if (Number(entry.playerId) === player.id) {
            return { ...entry, slot: activeSlot, starter: true };
          }
          return entry;
        }),
      );
      setActiveSlot(null);
    },
    [activeSlot],
  );

  /** Kaptan tekildir: yeni kaptan seçilince eskisi düşer. */
  const setCaptain = useCallback((target: Entry) => {
    haptics.select();
    setEntries((prev) =>
      prev.map((entry) => {
        const same = target.isGuest
          ? entry.isGuest && entry.displayName === target.displayName
          : entry.playerId === target.playerId;
        return { ...entry, captain: same ? !entry.captain : false };
      })
    );
  }, []);

  const guestMutation = useMutation({
    mutationFn: (name: string) => createGuestPlayer(matchId, { name }),
    onSuccess: (data) => {
      setEntries((prev) => [
        ...prev,
        {
          playerId: data.player.id,
          isGuest: true,
          guestName: data.player.player_name,
          jerseyNumber: null,
          position: null,
          starter: prev.filter((entry) => entry.starter).length < MAX_STARTERS,
          captain: false,
          slot: null,
          displayName: data.player.player_name,
          photo: null,
        },
      ]);
      setGuestName("");
      setGuestOpen(false);
      toast.show({ message: data.message, tone: "success" });
    },
    onError: (error) => {
      toast.show({
        message: error instanceof ApiError ? error.userMessage : "Misafir oyuncu eklenemedi.",
        tone: "danger",
      });
    },
  });

  const save = useMutation({
    mutationFn: () =>
      saveTeamMatchPlan(matchId, {
        formation,
        kitColor: kit,
        tactics: tactics.trim() || undefined,
        lineup: entries.map(({ displayName: _name, photo: _photo, ...row }) => row),
      }),
    onSuccess: (data) => {
      toast.show({ message: data.message, tone: "success" });
      void queryClient.invalidateQueries({ queryKey: ["team", "match-plan", matchId] });
      void queryClient.invalidateQueries({ queryKey: ["team", "matches"] });
      router.back();
    },
    onError: (error) => {
      // 409 MATCH_ALREADY_LIVE ayrı anlatılır: kadro artık rejinin elinde.
      const conflict = error instanceof ApiError && error.status === 409;
      toast.show({
        message: conflict
          ? "Maç canlı akışa geçtiği için kadro değiştirilemiyor."
          : error instanceof ApiError
            ? error.userMessage
            : "Kadro kaydedilemedi.",
        tone: "danger",
      });
    },
  });

  /* ─────────────────────────── render ─────────────────────────── */

  if (!auth.user) return <Redirect href="/giris" />;

  if (!Number.isInteger(matchId) || matchId <= 0) {
    return (
      <SafeAreaView style={styles.screen} edges={["top"]}>
        <ScreenHeader title="Maç Kadrosu" back />
        <EmptyState icon="alert-circle-outline" title="Maç bulunamadı" body="Geçersiz maç bağlantısı." />
      </SafeAreaView>
    );
  }

  const match = planQuery.data?.match;

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader
        title="Maç Merkezi"
        subtitle={match ? `${match.opponent_name ?? "Rakip"} · ${match.date ?? ""}` : undefined}
        back
        bottom={
          <View style={styles.headerBottom}>
            <SegmentedControl items={MATCH_TABS} value={tab} onChange={setTab} />
          </View>
        }
      />

      {tab === "analiz" ? (
        <MatchAnalysisView
          matchId={matchId}
          /* Simülasyon kadroya göre hesaplanıyor: kadro hiç girilmemişse
             tahmin yanıltıcı olur. Kaydedilmiş bir plan ya da reji tarafında
             açılmış kadro satırları varsa yeterli sayılır. */
          canSimulate={Boolean(planQuery.data?.plan?.lineup?.length || entries.length)}
          onNeedPlan={() => setTab("kadro")}
        />
      ) : planQuery.isLoading ? (
        <View style={styles.loading}>
          <SkeletonListRow />
        </View>
      ) : planQuery.error ? (
        <ErrorState error={planQuery.error} onRetry={planQuery.refetch} />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {/* Diziliş */}
          <SectionHeader title="DİZİLİŞ" />
          <ChipGroup>
            {FORMATION_NAMES.map((name) => (
              <Chip
                key={name}
                label={name}
                selected={name === formation}
                onPress={() => {
                  haptics.select();
                  setFormation(name);
                  setActiveSlot(null);
                  /* Yeni dizilişte karşılığı olmayan yuvalardaki oyuncular
                     yedeğe iner; slot adları dizilişten dizilişe değişiyor
                     (3-3-1'de MID3 var, 2-2-3'te yok). Kadrodan düşürmek
                     kullanıcının emeğini boşa çıkarırdı. */
                  const nextSlots = new Set(FORMATIONS[name] ?? []);
                  setEntries((prev) =>
                    prev.map((entry) =>
                      entry.slot && !nextSlots.has(entry.slot)
                        ? { ...entry, slot: null, starter: false }
                        : entry,
                    ),
                  );
                }}
              />
            ))}
          </ChipGroup>

          {/* Forma rengi */}
          <SectionHeader title="FORMA RENGİ" />
          <View style={styles.kitRow}>
            {KIT_COLORS.map((color) => (
              <Touchable
                key={color}
                feedback="chip"
                onPress={() => {
                  haptics.select();
                  setKit(color);
                }}
                accessibilityLabel={`Forma rengi ${color}`}
                style={[
                  styles.kitDot,
                  { backgroundColor: color },
                  color === kit && styles.kitDotActive,
                ]}
              >
                {color === kit ? (
                  <Ionicons name="checkmark" size={14} color={color === "#F5F5F5" ? "#111827" : "#FFFFFF"} />
                ) : null}
              </Touchable>
            ))}
          </View>

          {/* İlk kadro — sahada kurulur */}
          <SectionHeader
            title="İLK KADRO"
            meta={`${starters.length}/${Math.min(slots.length, MAX_STARTERS)}`}
          />

          <PitchLineup
            slots={slots}
            assignments={pitchAssignments}
            activeSlot={activeSlot}
            onSelectSlot={selectSlot}
            onClearSlot={clearSlot}
          />

          <PitchBench
            players={pitchBench}
            activeSlot={activeSlot}
            onPick={placeOnPitch}
            emptyLabel="Kadrodaki herkes sahada."
          />

          {/* Sahadaki oyuncuların ayrıntısı (forma no, mevki, kaptan) satırdan
              düzenlenir: sahadaki yuva 52px, bu bilgiler oraya sığmaz. */}
          {starters.length
            ? starters.map((entry) => (
                <SquadRow
                  key={`s-${entry.isGuest ? entry.displayName : entry.playerId}`}
                  entry={entry}
                  onEdit={() => setEditing(entry)}
                  onToggleStarter={() => patchEntry(entry, { starter: false, slot: null })}
                  onCaptain={() => setCaptain(entry)}
                  onRemove={() => removeEntry(entry)}
                />
              ))
            : null}

          {/* Yedekler */}
          <SectionHeader title="YEDEKLER" meta={String(subs.length)} />
          {subs.length ? (
            subs.map((entry) => (
              <SquadRow
                key={`b-${entry.isGuest ? entry.displayName : entry.playerId}`}
                entry={entry}
                onEdit={() => setEditing(entry)}
                onToggleStarter={() =>
                  starters.length >= MAX_STARTERS
                    ? toast.show({ message: `İlk kadro dolu (${MAX_STARTERS}).`, tone: "warn" })
                    : /* Yuvasız ilk kadro: sahada yeri yok ama kadro kartında
                         ilk sekizde. Sunucu yuvasız `starter` kabul ediyor;
                         kullanıcı isterse sonra sahadan yerleştirir. */
                      patchEntry(entry, { starter: true })
                }
                onCaptain={() => setCaptain(entry)}
                onRemove={() => removeEntry(entry)}
              />
            ))
          ) : (
            <Text style={styles.hint}>Yedek yok.</Text>
          )}

          {/* Kadro dışı oyuncular */}
          <SectionHeader title="KADROYA EKLE" meta={String(available.length)} />
          {rosterQuery.isLoading ? (
            <SkeletonListRow />
          ) : available.length ? (
            available.map((player: RosterPlayer) => (
              <Touchable
                key={player.id}
                feedback="row"
                onPress={() => addPlayer(player)}
                style={styles.addRow}
                accessibilityLabel={`${player.player_name} ekle`}
              >
                <Avatar
                  name={player.player_name}
                  image={player.player_img ? mediaUrl(player.player_img) : undefined}
                  size={28}
                />
                <Text style={styles.addName} numberOfLines={1}>
                  {player.player_name}
                </Text>
                <Text style={styles.addPos}>{positionLabel(player.team_position ?? player.profile_position)}</Text>
                <Ionicons name="add-circle-outline" size={20} color={colors.brandAccent} />
              </Touchable>
            ))
          ) : (
            <Text style={styles.hint}>Kadro dışı oyuncu kalmadı.</Text>
          )}

          <Button
            label="Misafir oyuncu ekle"
            variant="ghost"
            size="sm"
            onPress={() => setGuestOpen(true)}
            fullWidth
          />

          {/* Taktik notu */}
          <SectionHeader title="TAKTİK NOTU" />
          <Input
            value={tactics}
            onChangeText={setTactics}
            placeholder="Rakip hakkında not, oyun planı… (isteğe bağlı)"
            multiline
          />

          {problem ? (
            <View style={styles.problem}>
              <Ionicons name="alert-circle-outline" size={16} color={colors.warn} />
              <Text style={styles.problemText} {...textScale.long}>
                {problem}
              </Text>
            </View>
          ) : null}

          <Button
            label="Kadroyu kaydet"
            onPress={() => save.mutate()}
            loading={save.isPending}
            disabled={Boolean(problem)}
            fullWidth
          />
        </ScrollView>
      )}

      {/* Oyuncu düzenleme */}
      <BottomSheet
        visible={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing?.displayName ?? "Oyuncu"}
      >
        {editing ? (
          <View style={styles.sheet}>
            <Text style={styles.sheetLabel}>Forma numarası</Text>
            <Stepper
              value={editing.jerseyNumber ?? 0}
              min={0}
              max={99}
              onChange={(value) => {
                const next = value === 0 ? null : value;
                patchEntry(editing, { jerseyNumber: next });
                setEditing({ ...editing, jerseyNumber: next });
              }}
            />

            <Text style={styles.sheetLabel}>Mevki</Text>
            <ChipGroup>
              {POSITIONS.map((position) => (
                <Chip
                  key={position.code}
                  label={position.label}
                  selected={editing.position === position.code}
                  onPress={() => {
                    patchEntry(editing, { position: position.code });
                    setEditing({ ...editing, position: position.code });
                  }}
                />
              ))}
            </ChipGroup>

            <Button
              label={editing.captain ? "Kaptanlığı kaldır" : "Kaptan yap"}
              variant="secondary"
              size="sm"
              onPress={() => {
                setCaptain(editing);
                setEditing(null);
              }}
              fullWidth
            />
          </View>
        ) : null}
      </BottomSheet>

      {/* Misafir oyuncu */}
      <BottomSheet visible={guestOpen} onClose={() => setGuestOpen(false)} title="Misafir oyuncu">
        <View style={styles.sheet}>
          <Text style={styles.hint} {...textScale.long}>
            Kadroda olmayan bir oyuncuyu bu maça özel ekler. Takımsız oyuncu olarak kaydedilir.
          </Text>
          <Input value={guestName} onChangeText={setGuestName} placeholder="Ad soyad" />
          <Button
            label="Ekle"
            onPress={() => guestMutation.mutate(guestName.trim())}
            loading={guestMutation.isPending}
            disabled={guestName.trim().length < 3}
            fullWidth
          />
        </View>
      </BottomSheet>
    </SafeAreaView>
  );
}

/* ═══════════════════════════ KADRO SATIRI ═══════════════════════════ */

function SquadRow({
  entry,
  onEdit,
  onToggleStarter,
  onCaptain,
  onRemove,
}: {
  entry: Entry;
  onEdit: () => void;
  onToggleStarter: () => void;
  onCaptain: () => void;
  onRemove: () => void;
}) {
  return (
    <Card padding="sm" style={styles.squadRow}>
      <Touchable feedback="row" onPress={onEdit} style={styles.squadMain} accessibilityLabel={`${entry.displayName} düzenle`}>
        <Avatar
          name={entry.displayName}
          image={entry.photo ? mediaUrl(entry.photo) : undefined}
          size={30}
        />
        <View style={styles.squadText}>
          <Text style={styles.squadName} numberOfLines={1}>
            {entry.displayName}
            {entry.captain ? " (K)" : ""}
          </Text>
          <Text style={styles.squadMeta} numberOfLines={1}>
            {entry.jerseyNumber ? `#${entry.jerseyNumber} · ` : ""}
            {entry.position ? positionLabel(entry.position) : "Mevki yok"}
            {entry.isGuest ? " · Misafir" : ""}
          </Text>
        </View>
      </Touchable>

      <View style={styles.squadActions}>
        <Touchable feedback="icon" onPress={onCaptain} accessibilityLabel="Kaptan yap">
          <Ionicons
            name={entry.captain ? "ribbon" : "ribbon-outline"}
            size={18}
            color={entry.captain ? colors.warn : colors.textTertiary}
          />
        </Touchable>
        <Touchable feedback="icon" onPress={onToggleStarter} accessibilityLabel={entry.starter ? "Yedeğe al" : "İlk kadroya al"}>
          <Ionicons
            name={entry.starter ? "arrow-down-circle-outline" : "arrow-up-circle-outline"}
            size={18}
            color={colors.textSecondary}
          />
        </Touchable>
        <Touchable feedback="icon" onPress={onRemove} accessibilityLabel="Kadrodan çıkar">
          <Ionicons name="close-circle-outline" size={18} color={colors.danger} />
        </Touchable>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  headerBottom: {
    paddingHorizontal: space.md,
    paddingBottom: space.sm,
  },
  loading: { padding: space.md },
  content: { padding: space.md, gap: space.sm, paddingBottom: space.giant },

  kitRow: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  kitDot: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.border,
  },
  kitDotActive: { borderColor: colors.textPrimary },

  hint: { ...type.bodySm, color: colors.textSecondary, paddingVertical: space.xs },

  squadRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  squadMain: { flexDirection: "row", alignItems: "center", gap: space.sm, flex: 1 },
  squadText: { flex: 1 },
  squadName: { ...type.body, color: colors.textPrimary },
  squadMeta: { ...type.caption, color: colors.textTertiary, marginTop: 1 },
  squadActions: { flexDirection: "row", alignItems: "center", gap: space.sm },

  addRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    backgroundColor: colors.surface1,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  addName: { ...type.body, color: colors.textPrimary, flex: 1 },
  addPos: { ...type.caption, color: colors.textTertiary },

  problem: {
    flexDirection: "row",
    gap: space.sm,
    backgroundColor: colors.warnDim,
    borderRadius: radius.md,
    padding: space.md,
  },
  problemText: { ...type.bodySm, color: colors.textPrimary, flex: 1, lineHeight: 19 },

  sheet: { gap: space.md, paddingBottom: space.md },
  sheetLabel: { ...type.label, color: colors.textSecondary },
});
