/**
 * MAÇ MERKEZİ (tek maç) — kadro/diziliş girme ve rakip analizi.
 *
 * ÜÇ SEKME (başlıkta, `?sekme=kadro|yoklama|analiz`):
 *   Kadro    bu maçın kadrosu, dizilişi, forma rengi, taktiği.
 *   Yoklama  takım içi yoklama, rejiye bildirim. Eskiden kadro sekmesinin en
 *            altında, taktik notunun üstünde kayboluyordu; maç günü başkanın
 *            en çok baktığı yer olduğu için kendi sekmesi oldu.
 *   Analiz   sunucudan gelen karar-destek raporu + skor simülasyonu
 *            (components/MatchAnalysisView.tsx).
 * "Kadroyu kaydet" listenin sonunda değil, kadro sekmesinde ALTTA SABİT bir
 * çubuktadır: sunucu kuralına takılan sorun (ör. "yalnızca bir kaptan") da
 * düğmenin hemen üstünde yazar — kullanıcı neden kaydedemediğini aramaz.
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
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { AttendanceMeter } from "@/components/club/AttendanceMeter";
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
  SkeletonListRow,
  Stepper,
  Tabs,
  Touchable,
  useToast,
  type TabItem,
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
  getMatchAttendance,
  getMatchCenterRoster,
  reportMatchLineup,
  startMatchAttendance,
  type MatchCenterRosterPlayer,
} from "@/lib/api/team";
import { ApiError } from "@/lib/http";
import { queryKeys } from "@/lib/queryKeys";
import { mediaUrl } from "@/lib/format";
import { matchWhen } from "@/components/club/NextMatchCard";
import { useAuth } from "@/providers/AuthProvider";
import { colors, elevate, hairline, haptics, layout, radius, space, textScale, type } from "@/theme";

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
type MatchTab = "kadro" | "yoklama" | "analiz";

function resolveMatchTab(raw: string | string[] | undefined): MatchTab {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === "yoklama" || value === "analiz" ? value : "kadro";
}

/**
 * FORMA RENKLERİ — bunlar tasarım tokenı DEĞİL, ALAN VERİSİDİR: kullanıcının
 * seçip sunucuya hex olarak yazdığı takım forma rengi. Bu yüzden paletten
 * gelmezler ve gelmemeleri gerekir; palet değişince bir takımın forması
 * değişmemelidir. Uygulamadaki çıplak hex istisnası burasıdır.
 *
 * Liste amatör ligde gerçekten görülen sekiz forma rengidir; kurumsal renkle
 * ilişkisi yoktur.
 */
const DEFAULT_KIT = "#1D4ED8";
const HEX = /^#[0-9a-fA-F]{6}$/;

const KIT_COLORS = [
  "#1D4ED8", "#E11D2E", "#128A4B", "#8C1C33",
  "#111827", "#F5F5F5", "#E0A106", "#EA580C",
];

export default function MacKadrosuScreen() {
  const auth = useAuth();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();

  const params = useLocalSearchParams<{ matchId?: string; sekme?: string }>();
  const insets = useSafeAreaInsets();
  const matchId = Number(params.matchId);

  const planQuery = useQuery({
    queryKey: ["takim", "match-plan", matchId],
    queryFn: () => getTeamMatchPlan(matchId),
    enabled: Boolean(auth.user) && Number.isInteger(matchId) && matchId > 0,
  });

  // Diğer takım ekranlarıyla aynı önbellek anahtarı: kadro yönetiminde yapılan
  // ekleme/çıkarma bu ekranı da tazeler.
  const rosterQuery = useQuery({
    queryKey: ["takim", "roster"],
    queryFn: getTeamRoster,
    enabled: Boolean(auth.user),
    staleTime: 60_000,
  });
  // Misafir oyuncu seçimi: ildeki oyuncu havuzu (takım oyuncuları hariç).
  const poolQuery = useQuery({
    queryKey: ["takim", "match-center-roster"],
    queryFn: getMatchCenterRoster,
    enabled: Boolean(auth.user),
    staleTime: 60_000,
  });
  const attendanceQuery = useQuery({
    queryKey: ["takim", "attendance", matchId],
    queryFn: () => getMatchAttendance(matchId),
    enabled: Boolean(auth.user) && Number.isInteger(matchId) && matchId > 0,
    refetchInterval: (query) => (query.state.data?.active ? 20_000 : false),
  });

  const [formation, setFormation] = useState<string>(DEFAULT_FORMATION);
  const [kit, setKit] = useState<string>(DEFAULT_KIT);
  const [tactics, setTactics] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [editing, setEditing] = useState<Entry | null>(null);
  const [guestOpen, setGuestOpen] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [attendanceOpen, setAttendanceOpen] = useState(true);
  const [hydrated, setHydrated] = useState(false);
  const [tab, setTab] = useState<MatchTab>(() => resolveMatchTab(params.sekme));

  /* Sunucudaki planı bir kez forma yükle. Sonraki tazelemeler kullanıcının
     yaptığı düzenlemeyi EZMEMELİ — bu yüzden hydrated bayrağı var. */
  useEffect(() => {
    if (hydrated || !planQuery.data) return;
    // Kadro listesi gelmeden hidrasyon yapılırsa kayıtlı oyuncular kalıcı olarak
    // "Oyuncu" adıyla kalıyordu; kadro isteği bitene (başarı ya da hata) kadar bekle.
    if (rosterQuery.isPending) return;
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
  }, [planQuery.data, rosterQuery.data, rosterQuery.isPending, hydrated]);

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

  /* Havuzdan seçilen misafir: kayıtlı oyuncu id'siyle, misafir bayrağıyla eklenir. */
  const addGuestFromPool = useCallback((player: MatchCenterRosterPlayer) => {
    haptics.select();
    setEntries((prev) => {
      if (prev.some((entry) => entry.playerId === player.id)) return prev;
      return [
        ...prev,
        {
          playerId: player.id,
          isGuest: true,
          guestName: player.player_name,
          jerseyNumber: null,
          position: player.player_position ?? null,
          starter: prev.filter((entry) => entry.starter).length < MAX_STARTERS,
          captain: false,
          slot: null,
          displayName: player.player_name,
          photo: player.player_img ?? null,
        },
      ];
    });
    setGuestName("");
    setGuestOpen(false);
    toast.show({ message: `${player.player_name} misafir olarak eklendi.`, tone: "success" });
  }, [toast]);

  const guestPool = useMemo(() => {
    const term = guestName.trim().toLocaleLowerCase("tr-TR");
    const teamId = poolQuery.data?.team_id;
    const taken = new Set(entries.map((entry) => entry.playerId).filter((id): id is number => id != null));
    const pool = (poolQuery.data?.allPlayers ?? []).filter((player) => player.team_id !== teamId && !taken.has(player.id));
    if (!term) return pool.slice(0, 20);
    return pool.filter((player) => player.player_name.toLocaleLowerCase("tr-TR").includes(term)).slice(0, 30);
  }, [guestName, poolQuery.data, entries]);

  /* ── Yoklama ve reji bildirimi ── */
  const attendanceMutation = useMutation({
    mutationFn: (playerIds: number[]) => startMatchAttendance(matchId, playerIds),
    onSuccess: (data) => {
      toast.show({ message: data.without_account?.length ? `${data.message} Hesabı olmayanlar: ${data.without_account.join(", ")}` : data.message, tone: "success" });
      void queryClient.invalidateQueries({ queryKey: ["takim", "attendance", matchId] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.chatConversations() });
    },
    onError: (error) => toast.show({ message: error instanceof ApiError ? error.userMessage : "Yoklama başlatılamadı.", tone: "danger" }),
  });
  const reportMutation = useMutation({
    mutationFn: async () => {
      // Kadro henüz kaydedilmediyse önce kaydet, sonra rejiye bildir.
      if (!planQuery.data?.plan?.lineup?.length) {
        await saveTeamMatchPlan(matchId, { formation, kitColor: kit, tactics: tactics.trim() || undefined, lineup: entries.map(({ displayName: _n, photo: _p, ...row }) => row) });
      }
      return reportMatchLineup(matchId);
    },
    onSuccess: (data) => {
      toast.show({ message: data.message, tone: "success" });
      void queryClient.invalidateQueries({ queryKey: ["takim", "attendance", matchId] });
      void queryClient.invalidateQueries({ queryKey: ["takim", "match-plan", matchId] });
    },
    onError: (error) => toast.show({ message: error instanceof ApiError ? error.userMessage : "Kadro bildirilemedi.", tone: "danger" }),
  });
  const selectedRegisteredIds = useMemo(() => entries.map((entry) => entry.playerId).filter((id): id is number => id != null), [entries]);
  const syncMutation = useMutation({
    // Planı kaydeder; sunucu yoklama listesini planla eşitler.
    mutationFn: () => saveTeamMatchPlan(matchId, { formation, kitColor: kit, tactics: tactics.trim() || undefined, lineup: entries.map(({ displayName: _n, photo: _p, ...row }) => row) }),
    onSuccess: () => {
      toast.show({ message: "Yoklama listesi maç kadrosuyla eşitlendi.", tone: "success" });
      void queryClient.invalidateQueries({ queryKey: ["takim", "attendance", matchId] });
      void queryClient.invalidateQueries({ queryKey: ["takim", "match-plan", matchId] });
    },
    onError: (error) => toast.show({ message: error instanceof ApiError ? error.userMessage : "Eşitleme başarısız.", tone: "danger" }),
  });
  const startAttendance = () => {
    if (!selectedRegisteredIds.length) { toast.show({ message: "Önce kadroya oyuncu ekle.", tone: "warn" }); return; }
    if (attendanceQuery.data?.active) { syncMutation.mutate(); return; }
    attendanceMutation.mutate(selectedRegisteredIds);
  };

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
      void queryClient.invalidateQueries({ queryKey: ["takim", "match-plan", matchId] });
      void queryClient.invalidateQueries({ queryKey: ["takim", "matches"] });
      // Sunucu yoklama listesini planla eşitledi (çıkan gruptan alındı, giren eklendi).
      void queryClient.invalidateQueries({ queryKey: ["takim", "attendance", matchId] });
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
  const attendance = attendanceQuery.data;
  const tabItems: TabItem<MatchTab>[] = [
    { key: "kadro", label: "Kadro" },
    { key: "yoklama", label: "Yoklama", badge: attendance?.attendance?.counts.unanswered || undefined },
    { key: "analiz", label: "Rakip analizi" },
  ];

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader
        title={match?.opponent_name ? `vs ${match.opponent_name}` : "Maç Kadrosu"}
        subtitle={match ? matchWhen(match.date, match.time) : undefined}
        back
        tabs={<Tabs items={tabItems} value={tab} onChange={setTab} sticky />}
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
      ) : tab === "yoklama" ? (
        <ScrollView contentContainerStyle={styles.content}>
          <AttendancePanel
            attendance={attendance}
            loading={attendanceQuery.isLoading}
            error={attendanceQuery.isError ? attendanceQuery.error : null}
            onRetry={attendanceQuery.refetch}
            open={attendanceOpen}
            onToggleOpen={() => setAttendanceOpen((value) => !value)}
            squadCount={selectedRegisteredIds.length}
            problem={problem}
            starting={attendanceMutation.isPending || syncMutation.isPending}
            reporting={reportMutation.isPending}
            onStart={startAttendance}
            onReport={() => reportMutation.mutate()}
            onOpenChat={
              attendance?.conversation_id
                ? () => router.push(`/sohbet/${attendance.conversation_id}` as never)
                : undefined
            }
            onEditSquad={() => setTab("kadro")}
          />
        </ScrollView>
      ) : planQuery.isLoading ? (
        <View style={styles.loading}>
          <SkeletonListRow />
        </View>
      ) : planQuery.error ? (
        <ErrorState error={planQuery.error} onRetry={planQuery.refetch} />
      ) : (
        <ScrollView contentContainerStyle={[styles.content, styles.contentWithBar]} keyboardShouldPersistTaps="handled">
          {/* Diziliş */}
          <SectionHeader title="Diziliş" style={styles.flushHeader} />
          <ChipGroup contentPadding={0}>
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
          <SectionHeader title="Forma rengi" style={styles.flushHeader} />
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
            title="İlk kadro"
            meta={`${starters.length}/${Math.min(slots.length, MAX_STARTERS)}`}
            style={styles.flushHeader}
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
          <SectionHeader title="Yedekler" meta={String(subs.length)} style={styles.flushHeader} />
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
          <SectionHeader title="Kadroya ekle" meta={String(available.length)} style={styles.flushHeader} />
          {rosterQuery.isLoading ? (
            <SkeletonListRow />
          ) : rosterQuery.isError ? (
            <ErrorState error={rosterQuery.error} onRetry={rosterQuery.refetch} variant="banner" />
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
          <SectionHeader title="Taktik notu" style={styles.flushHeader} />
          <Input
            value={tactics}
            onChangeText={setTactics}
            placeholder="Rakip hakkında not, oyun planı… (isteğe bağlı)"
            multiline
          />

        </ScrollView>
      )}

      {/* SABİT KAYIT ÇUBUĞU — yalnız kadro sekmesinde. */}
      {tab === "kadro" && !planQuery.isLoading && !planQuery.error ? (
        <View style={[styles.bar, { paddingBottom: space.md + insets.bottom }]}>
          <View style={styles.barTexts}>
            {problem ? (
              <>
                <Text style={styles.barWarn} numberOfLines={2} {...textScale.dense}>
                  {problem}
                </Text>
              </>
            ) : (
              <>
                <Text style={styles.barTitle} {...textScale.dense}>
                  {entries.length} oyuncu
                </Text>
                <Text style={styles.barMeta} numberOfLines={1} {...textScale.dense}>
                  İlk {starters.length}/{MAX_STARTERS} · {subs.length} yedek{entries.some((entry) => entry.captain) ? " · kaptan seçildi" : ""}
                </Text>
              </>
            )}
          </View>
          <Button
            label="Kaydet"
            icon="checkmark"
            onPress={() => save.mutate()}
            loading={save.isPending}
            disabled={Boolean(problem)}
            haptic="success"
          />
        </View>
      ) : null}

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
            <ChipGroup scrollable={false} contentPadding={0}>
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
      <BottomSheet visible={guestOpen} onClose={() => setGuestOpen(false)} title="Misafir oyuncu" snap="half" scrollable={false}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.sheet}>
          <Text style={styles.hint} {...textScale.long}>
            Kadroda olmayan bir oyuncuyu bu maça özel ekler. Listeden ilinizdeki kayıtlı bir oyuncuyu seçin ya da adı yazıp yeni oyuncu olarak ekleyin.
          </Text>
          <Input value={guestName} onChangeText={setGuestName} placeholder="Oyuncu ara ya da ad soyad yaz" variant="search" leadingIcon="search" accessibilityLabel="Misafir oyuncu ara" />
          <ScrollView style={styles.guestList} keyboardShouldPersistTaps="handled">
            {poolQuery.isLoading ? (
              <SkeletonListRow count={3} avatar />
            ) : poolQuery.isError ? (
              <ErrorState error={poolQuery.error} onRetry={poolQuery.refetch} variant="banner" />
            ) : guestPool.length ? (
              guestPool.map((player) => (
                <Touchable key={player.id} feedback="row" onPress={() => addGuestFromPool(player)} style={styles.addRow} accessibilityLabel={`${player.player_name} misafir olarak ekle`}>
                  <Avatar name={player.player_name} image={player.player_img ? mediaUrl(player.player_img) : undefined} size={28} />
                  <Text style={styles.addName} numberOfLines={1}>{player.player_name}</Text>
                  <Text style={styles.addPos}>{positionLabel(player.player_position)}</Text>
                  <Ionicons name="add-circle-outline" size={20} color={colors.brandAccent} />
                </Touchable>
              ))
            ) : (
              <Text style={styles.hint}>{guestName.trim().length >= 2 ? "Eşleşen kayıtlı oyuncu yok; aşağıdan yeni oyuncu olarak ekleyebilirsin." : "İlinizdeki oyuncu havuzu boş."}</Text>
            )}
          </ScrollView>
          <Button
            label={guestName.trim().length >= 2 ? `"${guestName.trim()}" adıyla yeni oyuncu ekle` : "Yeni oyuncu eklemek için ad yaz"}
            onPress={() => guestMutation.mutate(guestName.trim())}
            loading={guestMutation.isPending}
            disabled={guestName.trim().length < 2}
            fullWidth
          />
        </KeyboardAvoidingView>
      </BottomSheet>
    </SafeAreaView>
  );
}

/* ═══════════════════════════ YOKLAMA PANELİ ═══════════════════════════ */

const ATTENDANCE_ICON: Record<string, { icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  coming: { icon: "checkmark-circle", color: colors.win },
  not_coming: { icon: "close-circle", color: colors.danger },
  maybe: { icon: "help-circle", color: colors.warn },
};

/**
 * Yoklama sekmesi: durum → ölçer → iki eylem → yanıt listesi.
 *
 * İKİ YOL: (1) "Takımda yoklama yap" seçilen oyuncularla sohbet grubu kurar,
 * herkes geliyorum / gelemiyorum der; yoklama açıkken aynı düğme "kadroyla
 * eşitle"ye döner. (2) "Rejiye bildir" kadroyu doğrudan reji paneline yollar.
 */
function AttendancePanel({
  attendance,
  loading,
  error,
  onRetry,
  open,
  onToggleOpen,
  squadCount,
  problem,
  starting,
  reporting,
  onStart,
  onReport,
  onOpenChat,
  onEditSquad,
}: {
  attendance: Awaited<ReturnType<typeof getMatchAttendance>> | undefined;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  open: boolean;
  onToggleOpen: () => void;
  squadCount: number;
  problem: string | null;
  starting: boolean;
  reporting: boolean;
  onStart: () => void;
  onReport: () => void;
  onOpenChat?: () => void;
  onEditSquad: () => void;
}) {
  if (loading) return <SkeletonListRow count={4} />;
  if (error) return <ErrorState error={error} onRetry={onRetry} variant="inline" />;

  const active = Boolean(attendance?.active);
  const meta = attendance?.attendance ?? null;

  return (
    <>
      <Card>
        <View style={styles.panelHead}>
          <View style={[styles.panelPip, active ? styles.panelPipOn : null]}>
            <Ionicons name={active ? "radio" : "people-outline"} size={18} color={active ? colors.win : colors.brandAccent} />
          </View>
          <View style={styles.panelTexts}>
            <Text style={styles.panelTitle} {...textScale.dense}>
              {active ? "Yoklama açık" : "Yoklama başlamadı"}
            </Text>
            <Text style={styles.hint} {...textScale.long}>
              {active
                ? "Gelemeyenin yerine kadroya oyuncu ekle, sonra kadroyla eşitle."
                : squadCount
                  ? `Kadrodaki ${squadCount} oyuncuyla sohbet grubu kurulur; herkes geliyorum / gelemiyorum der.`
                  : "Önce Kadro sekmesinden maç kadrosunu seç."}
            </Text>
          </View>
        </View>

        {meta ? <AttendanceMeter counts={meta.counts} need={MAX_STARTERS} style={styles.meter} /> : null}

        <View style={styles.attendanceActions}>
          {squadCount ? (
            <Button
              label={active ? "Kadroyla eşitle" : "Takımda yoklama yap"}
              variant={active ? "secondary" : "primary"}
              size="sm"
              icon={active ? "sync-outline" : "people-outline"}
              onPress={onStart}
              loading={starting}
              style={styles.flex}
            />
          ) : (
            <Button label="Kadroyu seç" size="sm" icon="people-outline" onPress={onEditSquad} style={styles.flex} />
          )}
          <Button
            label={active ? "Son hâli bildir" : "Rejiye bildir"}
            variant={active ? "primary" : "secondary"}
            size="sm"
            icon="paper-plane-outline"
            onPress={onReport}
            loading={reporting}
            disabled={Boolean(problem)}
            style={styles.flex}
          />
        </View>
        {problem ? (
          <Text style={styles.barWarn} {...textScale.long}>
            Bildirmeden önce: {problem}
          </Text>
        ) : null}
      </Card>

      {meta && meta.players.length ? (
        <>
          <SectionHeader
            title="Yanıtlar"
            meta={`${meta.players.length} oyuncu`}
            action={{ label: open ? "Gizle" : "Göster", onPress: onToggleOpen }}
            style={styles.flushHeader}
          />
          {open ? (
            <View style={styles.group}>
              {meta.players.map((p, index) => {
                const look = (p.status && ATTENDANCE_ICON[p.status]) || { icon: "time-outline" as const, color: colors.textTertiary };
                return (
                  <View key={p.player_id} style={[styles.attendanceRow, index ? styles.rowDivided : null]}>
                    <Ionicons name={look.icon} size={18} color={look.color} />
                    <Text style={styles.attendanceName} numberOfLines={1} {...textScale.dense}>
                      {p.name}
                      {p.role ? ` · ${p.role === "starter" ? "AS" : "YEDEK"}` : ""}
                    </Text>
                    <Text style={styles.attendanceStatus} {...textScale.dense}>
                      {p.status_label}
                      {p.has_account ? "" : " · hesabı yok"}
                    </Text>
                  </View>
                );
              })}
            </View>
          ) : null}
        </>
      ) : null}

      {onOpenChat ? (
        <Button label="Yoklama grubunu aç" variant="secondary" size="sm" icon="chatbubbles-outline" onPress={onOpenChat} fullWidth />
      ) : null}
    </>
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
    <View style={styles.squadRow}>
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
        <Touchable feedback="icon" onPress={onCaptain} accessibilityLabel="Kaptan yap" style={styles.iconButton}>
          <Ionicons
            name={entry.captain ? "ribbon" : "ribbon-outline"}
            size={20}
            color={entry.captain ? colors.warn : colors.textTertiary}
          />
        </Touchable>
        <Touchable feedback="icon" onPress={onToggleStarter} accessibilityLabel={entry.starter ? "Yedeğe al" : "İlk kadroya al"} style={styles.iconButton}>
          <Ionicons
            name={entry.starter ? "arrow-down-circle-outline" : "arrow-up-circle-outline"}
            size={20}
            color={colors.textSecondary}
          />
        </Touchable>
        <Touchable feedback="icon" onPress={onRemove} accessibilityLabel="Kadrodan çıkar" style={styles.iconButton}>
          <Ionicons name="close-circle-outline" size={20} color={colors.danger} />
        </Touchable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  loading: { padding: layout.screenPadding },
  content: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.md,
    gap: space.sm,
    paddingBottom: space.giant,
  },
  contentWithBar: { paddingBottom: 120 },
  flushHeader: { paddingHorizontal: 0 },
  flex: { flex: 1 },
  group: {
    borderRadius: radius.lg,
    borderWidth: hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface1,
    overflow: "hidden",
  },
  rowDivided: { borderTopWidth: hairline, borderTopColor: colors.separator },
  panelHead: { flexDirection: "row", alignItems: "flex-start", gap: space.md },
  panelPip: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brandDim,
  },
  panelPipOn: { backgroundColor: colors.winDim },
  panelTexts: { flex: 1, gap: 2 },
  panelTitle: { ...type.h3, color: colors.textPrimary },
  meter: { marginTop: space.md },
  iconButton: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  bar: {
    ...elevate(2),
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.md,
    backgroundColor: colors.surface1,
    borderTopWidth: hairline,
    borderTopColor: colors.border,
  },
  barTexts: { flex: 1, minWidth: 0, gap: 2 },
  barTitle: { ...type.h3, color: colors.textPrimary },
  barMeta: { ...type.caption, color: colors.textTertiary },
  barWarn: { ...type.bodySm, color: colors.warn },

  kitRow: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  kitDot: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.border,
  },
  kitDotActive: { borderColor: colors.textPrimary },

  hint: { ...type.bodySm, color: colors.textSecondary, paddingVertical: space.xs },
  guestList: { maxHeight: 280 },
  attendanceActions: { flexDirection: "row", gap: space.sm, marginTop: space.md },
  attendanceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    minHeight: layout.listRowHeight,
    paddingHorizontal: space.md,
  },
  attendanceName: { ...type.body, color: colors.textPrimary, flex: 1 },
  attendanceStatus: { ...type.caption, color: colors.textSecondary },

  squadRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    minHeight: layout.listRowHeightTwoLine - space.sm,
    paddingLeft: space.md,
    paddingRight: space.xs,
    borderRadius: radius.md,
    borderWidth: hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface1,
  },
  squadMain: { flexDirection: "row", alignItems: "center", gap: space.sm, flex: 1 },
  squadText: { flex: 1 },
  squadName: { ...type.body, color: colors.textPrimary },
  squadMeta: { ...type.caption, color: colors.textTertiary, marginTop: 1 },
  squadActions: { flexDirection: "row", alignItems: "center" },

  addRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    backgroundColor: colors.surface1,
    borderRadius: radius.md,
    borderWidth: hairline,
    borderColor: colors.border,
    paddingHorizontal: space.md,
    minHeight: layout.listRowHeight,
  },
  addName: { ...type.body, color: colors.textPrimary, flex: 1 },
  addPos: { ...type.caption, color: colors.textTertiary },


  sheet: { gap: space.md, paddingBottom: space.md },
  sheetLabel: { ...type.label, color: colors.textSecondary },
});
