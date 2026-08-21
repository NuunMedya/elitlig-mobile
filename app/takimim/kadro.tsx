/**
 * KADRO YÖNETİMİ — takıma özgü oyuncu bilgileri ve takımın ideal dizilişi.
 * `/takimim/kadro?gorunum=<kadro|dizilis>&grup=<mevki|rol>`
 *
 * NE: kulübün oyuncu listesi ve her oyuncunun TAKIMA ÖZGÜ alanları (forma
 * numarası, takım mevkisi, kadro rolü). Bu alanlar oyuncunun kişisel profilini
 * değiştirmez ve yönetici onayı beklemez — sunucu doğrudan uygular.
 *
 * NEDEN İKİ GRUPLAMA: eski sürüm kadroyu yalnız `squad_role` ile üçe bölüyordu
 * (İlk Kadro / Yedek / Kadro Dışı). Bir başkanın en sık sorduğu soru ise
 * "kalecim kaç kişi, stoperim kaç kişi?" — yani MEVKİ dağılımı. Varsayılan
 * gruplama mevkiye çevrildi, eski rol görünümü segmentle korundu. Seçim
 * `?grup=` ile URL'de taşınır (derin bağlantı ve geri tuşu tutarlı kalsın).
 *
 * DÜZENLEME: satıra dokununca alt sayfa açılır. Forma numarası Stepper ile
 * (0 = numarasız → sunucuya `null` gider), mevki 11 kısaltmalı çipten biri,
 * kadro rolü Yedek/Kadro Dışı arasından seçilir.
 *
 * SUNUCU SÖZLEŞMESİ (değiştirilmedi):
 *  - PATCH /api/team-management/roster/:playerId — yalnız DEĞİŞEN alanlar
 *    gönderilir; `squad_role: "starter"` bu uçtan kabul edilmez (400).
 *  - DELETE /api/team-management/roster/:playerId — aktif sözleşmeli oyuncuda
 *    önce 409 PLAYER_HAS_ACTIVE_CONTRACT döner; kullanıcı fesih onayı verirse
 *    aynı çağrı `?force=true` ile tekrarlanır.
 *  - PUT /api/team-management/lineup — { formation, assignments[] }. İlk 8
 *    rolü SUNUCUDA bu uçtan türer; kadro tablosundan `starter` seçilemez.
 *
 * DİZİLİŞ SEGMENTİ (yeni): mobilde ideal kadro hiç düzenlenemiyordu, ekran
 * "İlk 8 düzenlemesi elitlig.com panelinden yapılır" diyordu. Artık web
 * panelindeki sahanın karşılığı burada: `components/PitchLineup.tsx` iki
 * dokunuşla (boş yuva → havuzdan oyuncu) diziliş kurar. Aynı bileşen maç
 * kadrosu ekranında da kullanılır; iki yer tek etkileşim modeli paylaşır.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import type { RefreshControlProps } from "react-native";
import {
  Alert,
  RefreshControl,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  View,
  type SectionListRenderItemInfo,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { PitchBench, PitchLineup, type PitchPlayer } from "@/components/PitchLineup";
import {
  Avatar,
  Badge,
  BottomSheet,
  Button,
  Chip,
  ChipGroup,
  EmptyState,
  ErrorState,
  ScreenHeader,
  SectionHeader,
  SegmentedControl,
  SkeletonListRow,
  Stepper,
  Touchable,
  refreshControlProps,
  useHeaderScroll,
  useRefresh,
  useToast,
  type SegmentedItem,
  type Tone,
} from "@/components/ui";
import {
  DEFAULT_FORMATION,
  FORMATIONS,
  MAX_STARTERS,
  POSITIONS,
  getTeamRoster,
  positionLabel,
  releaseRosterPlayer,
  saveLineup,
  updateRosterPlayer,
  type RosterPlayer,
  type RosterPlayerPatch,
  type SquadRole,
  type TeamRosterResponse,
} from "@/lib/api/team";
import { mediaUrl } from "@/lib/format";
import { ApiError } from "@/lib/http";
import { useAuth } from "@/providers/AuthProvider";
import { colors, hairline, layout, radius, space, textScale, type, upperTR } from "@/theme";

/* ══════════════════════════════════════════════════════════════════════════
   Sabitler ve saf yardımcılar
   ══════════════════════════════════════════════════════════════════════════ */

type GroupMode = "mevki" | "rol";

const GROUP_ITEMS: SegmentedItem<GroupMode>[] = [
  { key: "mevki", label: "Mevkiye göre" },
  { key: "rol", label: "Role göre" },
];

/** Ekranın iki ana görünümü. Seçim `?gorunum=` ile rotada taşınır. */
type ViewMode = "kadro" | "dizilis";

const VIEW_ITEMS: SegmentedItem<ViewMode>[] = [
  { key: "kadro", label: "Kadro", icon: "people-outline" },
  { key: "dizilis", label: "Diziliş", icon: "grid-outline" },
];

const ROLE_LABELS: Record<SquadRole, string> = {
  starter: "İlk Kadro",
  substitute: "Yedek",
  reserve: "Kadro Dışı",
};

/** Kadro tablosundan seçilebilen roller — `starter` sunucuda dizilişe bağlı. */
const EDITABLE_ROLES: Exclude<SquadRole, "starter">[] = ["substitute", "reserve"];

type PositionLine = "GK" | "DEF" | "MID" | "FWD";

const LINE_ORDER: PositionLine[] = ["GK", "DEF", "MID", "FWD"];

const LINE_LABELS: Record<PositionLine, string> = {
  GK: "Kaleci",
  DEF: "Defans",
  MID: "Orta Saha",
  FWD: "Forvet",
};

/** Mevki kısaltması → hat. `POSITIONS` sözlüğünden bir kez türetilir. */
const LINE_BY_CODE: Record<string, PositionLine> = Object.fromEntries(
  POSITIONS.map((item) => [item.code, item.line as PositionLine])
);

interface RosterSection {
  key: string;
  title: string;
  data: RosterPlayer[];
}

/** Grup içi konum — köşe yuvarlaması ve ayraç bundan gelir. */
function rowPosition(index: number, total: number): "single" | "first" | "middle" | "last" {
  if (total <= 1) return "single";
  if (index === 0) return "first";
  if (index === total - 1) return "last";
  return "middle";
}

/** Sıralama: sunucunun `sort_order`'ı, eşitlikte forma numarası, sonra ad. */
function comparePlayers(a: RosterPlayer, b: RosterPlayer): number {
  if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
  const an = a.jersey_number ?? 999;
  const bn = b.jersey_number ?? 999;
  if (an !== bn) return an - bn;
  return a.player_name.localeCompare(b.player_name, "tr");
}

/** URL parametresini normalleştirir; tanınmayan değer sessizce "mevki" olur. */
function resolveGroup(raw: string | string[] | undefined): GroupMode {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === "rol" ? "rol" : "mevki";
}

/** Rota parametresinden görünüm — tanınmayan değer sessizce "kadro" olur. */
function resolveView(value: string | string[] | undefined): ViewMode {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === "dizilis" ? "dizilis" : "kadro";
}

/* ══════════════════════════════════════════════════════════════════════════
   Ekran
   ══════════════════════════════════════════════════════════════════════════ */

export default function SquadManagementScreen() {
  const auth = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ grup?: string; gorunum?: string }>();
  const { scrollY, scrollProps } = useHeaderScroll();

  const [editing, setEditing] = useState<RosterPlayer | null>(null);

  const group = resolveGroup(params.grup);
  const view = resolveView(params.gorunum);

  const query = useQuery({
    queryKey: ["takim", "roster"],
    queryFn: getTeamRoster,
    enabled: Boolean(auth.user),
    staleTime: 30_000,
    retry: false,
  });

  const refresh = useRefresh(query.refetch, { refreshing: query.isRefetching });
  const refreshControl = (
    <RefreshControl {...refreshControlProps(refresh.refreshing, refresh.onRefresh)} />
  );

  const roster = useMemo(() => query.data?.roster ?? [], [query.data]);

  const sections = useMemo<RosterSection[]>(() => {
    if (roster.length === 0) return [];

    if (group === "rol") {
      return (["starter", "substitute", "reserve"] as const)
        .map((role) => ({
          key: role,
          title: ROLE_LABELS[role],
          data: roster.filter((player) => player.squad_role === role).sort(comparePlayers),
        }))
        .filter((section) => section.data.length > 0);
    }

    const byLine = LINE_ORDER.map((line) => ({
      key: line,
      title: LINE_LABELS[line],
      data: roster
        .filter((player) => LINE_BY_CODE[player.team_position ?? ""] === line)
        .sort(comparePlayers),
    })).filter((section) => section.data.length > 0);

    const unknown = roster
      .filter((player) => !LINE_BY_CODE[player.team_position ?? ""])
      .sort(comparePlayers);

    return unknown.length > 0
      ? [...byLine, { key: "bilinmiyor", title: "Mevkisi belirlenmemiş", data: unknown }]
      : byLine;
  }, [group, roster]);

  const withoutContract = useMemo(
    () => roster.filter((player) => !player.has_active_contract).length,
    [roster]
  );

  const changeGroup = useCallback(
    (next: GroupMode) => {
      scrollY.setValue(0);
      router.setParams({ grup: next });
    },
    [router, scrollY]
  );

  const changeView = useCallback(
    (next: ViewMode) => {
      scrollY.setValue(0);
      router.setParams({ gorunum: next });
    },
    [router, scrollY]
  );

  const openEditor = useCallback((player: RosterPlayer) => setEditing(player), []);
  const closeEditor = useCallback(() => setEditing(null), []);
  const openInvites = useCallback(() => router.push("/davetler"), [router]);

  const renderItem = useCallback(
    ({ item, index, section }: SectionListRenderItemInfo<RosterPlayer, RosterSection>) => (
      <PlayerRow
        player={item}
        position={rowPosition(index, section.data.length)}
        onPress={openEditor}
      />
    ),
    [openEditor]
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: RosterSection }) => (
      <SectionHeader title={section.title} meta={`${section.data.length} oyuncu`} />
    ),
    []
  );

  const renderSectionFooter = useCallback(() => <View style={styles.sectionGap} />, []);

  if (!auth.user) {
    return <Redirect href="/giris" />;
  }

  const noAccess =
    query.isError && query.error instanceof ApiError && query.error.status === 403;

  const header = (
    <ScreenHeader
      title="Kadro Yönetimi"
      subtitle={query.data?.team?.team_name}
      back
      scrollY={scrollY}
      bottom={
        roster.length > 0 ? (
          <View style={styles.headerBottom}>
            <SegmentedControl items={VIEW_ITEMS} value={view} onChange={changeView} />
            {/* Gruplama YALNIZ kadro listesinde anlamlı; diziliş görünümünde
                iki segmentli çubuk üst üste binip 76px yer yerdi. */}
            {view === "kadro" ? (
              <SegmentedControl
                items={GROUP_ITEMS}
                value={group}
                onChange={changeGroup}
                size="sm"
              />
            ) : null}
          </View>
        ) : undefined
      }
    />
  );

  if (query.isLoading && !query.data) {
    return (
      <SafeAreaView style={styles.screen} edges={["top"]}>
        {header}
        <View style={styles.loading}>
          <SkeletonListRow count={8} avatar />
        </View>
      </SafeAreaView>
    );
  }

  if (noAccess) {
    return (
      <SafeAreaView style={styles.screen} edges={["top"]}>
        {header}
        <EmptyState
          icon="shield-outline"
          title="Takım başkanlığı gerekli"
          body="Kadro yönetimi yalnızca takımının yönetimini üstlenen başkanlara açıktır."
        />
      </SafeAreaView>
    );
  }

  if (query.isError && !query.data) {
    return (
      <SafeAreaView style={styles.screen} edges={["top"]}>
        {header}
        <ErrorState error={query.error} onRetry={query.refetch} />
      </SafeAreaView>
    );
  }

  if (roster.length === 0) {
    return (
      <SafeAreaView style={styles.screen} edges={["top"]}>
        {header}
        <EmptyState
          icon="people-outline"
          title="Kadro boş"
          body="Kadronu kurmak için 'Oyuncu Arıyoruz' ilanı açabilir, gelen katılım başvurularını onaylayabilirsin."
          action={{ label: "Davet ve Başvurular", onPress: openInvites }}
        />
      </SafeAreaView>
    );
  }

  if (view === "dizilis" && query.data) {
    return (
      <SafeAreaView style={styles.screen} edges={["top"]}>
        {header}
        {/* `key`: diziliş taslağı bileşenin YEREL durumudur. Sunucu kadrosu
            değiştiğinde (oyuncu eklendi/çıkarıldı) taslak baştan kurulmalı;
            aksi hâlde kadroda olmayan bir oyuncu sahada asılı kalırdı. */}
        <LineupEditor
          key={`${query.data.roster.length}-${query.data.settings?.formation ?? ""}`}
          data={query.data}
          refreshControl={refreshControl}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      {header}

      <SectionList
        {...scrollProps}
        sections={sections}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        renderSectionHeader={renderSectionHeader}
        renderSectionFooter={renderSectionFooter}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={styles.content}
        refreshControl={refreshControl}
        initialNumToRender={12}
        ListHeaderComponent={
          <SquadSummary
            total={roster.length}
            contracted={roster.length - withoutContract}
            withoutContract={withoutContract}
            stale={query.isError}
            error={query.error}
            onRetry={query.refetch}
          />
        }
      />

      {editing ? (
        <PlayerEditorSheet player={editing} onClose={closeEditor} />
      ) : null}
    </SafeAreaView>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   DİZİLİŞ — takımın ideal kadrosu
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Takımın ideal dizilişini kuran görünüm.
 *
 * SUNUCU SÖZLEŞMESİ: `PUT /api/team-management/lineup` gövdesi
 * `{ formation, assignments: [{ playerId, slot }] }`. Sunucu bu kayda göre
 * oyuncuların `squad_role` alanını `starter` yapar; kadro tablosundan
 * `starter` seçilemez (bkz. dosya başlığı). Yani "İlk 8" burada belirlenir.
 *
 * NEDEN YEREL TASLAK: sahadaki her dokunuş sunucuya gitseydi diziliş kurmak
 * 8 ayrı istek olurdu ve yarım kalmış bir diziliş kaydedilirdi. Değişiklikler
 * bellekte birikir, "Kaydet" tek istekte gönderir. Kaydedilmemiş değişiklik
 * varken düğme etkin olur ve başlıkta sayaç görünür.
 *
 * DİZİLİŞ DEĞİŞTİRİLİRSE: slot adları dizilişten dizilişe farklı olduğu için
 * (3-3-1'de MID3 var, 2-2-3'te yok) yerleşim korunmaya ÇALIŞILIR: aynı adlı
 * slotlar taşınır, karşılığı olmayanlar havuza döner. Tümünü silmek
 * kullanıcının emeğini boşa çıkarırdı; sessizce yanlış slota taşımak ise daha
 * kötü olurdu.
 */
const LineupEditor = React.memo(function LineupEditor({
  data,
  refreshControl,
}: {
  data: TeamRosterResponse;
  /* RN'in `refreshControl` prop'u `ReactElement<RefreshControlProps>` bekler;
     tipi burada daraltmazsak ScrollView'a geçerken uyuşmazlık verir. */
  refreshControl: React.ReactElement<RefreshControlProps>;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();

  const roster = data.roster;

  /** Sunucudaki diziliş sözlüğü varsa o, yoksa istemcideki sabit liste. */
  const formations = useMemo(
    () => (Object.keys(data.formations ?? {}).length ? data.formations : FORMATIONS),
    [data.formations],
  );

  const formationNames = useMemo(() => Object.keys(formations), [formations]);

  const initialFormation =
    data.settings?.formation && formations[data.settings.formation]
      ? data.settings.formation
      : (formationNames[0] ?? DEFAULT_FORMATION);

  const [formation, setFormation] = useState(initialFormation);
  const [assignments, setAssignments] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    roster.forEach((player) => {
      if (player.squad_role === "starter" && player.lineup_slot) {
        initial[player.lineup_slot] = player.id;
      }
    });
    return initial;
  });
  const [activeSlot, setActiveSlot] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const slots = useMemo(() => formations[formation] ?? [], [formation, formations]);

  const playerById = useMemo(() => {
    const map = new Map<number, RosterPlayer>();
    roster.forEach((player) => map.set(player.id, player));
    return map;
  }, [roster]);

  const toPitchPlayer = useCallback(
    (player: RosterPlayer): PitchPlayer => ({
      id: player.id,
      name: player.player_name,
      jerseyNumber: player.jersey_number,
    }),
    [],
  );

  /** slot → PitchPlayer. Kadrodan düşmüş bir kimlik varsa yuva boş görünür. */
  const pitchAssignments = useMemo(() => {
    const result: Record<string, PitchPlayer | undefined> = {};
    Object.entries(assignments).forEach(([slot, playerId]) => {
      const player = playerById.get(playerId);
      if (player) result[slot] = toPitchPlayer(player);
    });
    return result;
  }, [assignments, playerById, toPitchPlayer]);

  const assignedIds = useMemo(() => new Set(Object.values(assignments)), [assignments]);

  const bench = useMemo(
    () => roster.filter((player) => !assignedIds.has(player.id)).map(toPitchPlayer),
    [assignedIds, roster, toPitchPlayer],
  );

  const benchSubtitle = useCallback(
    (player: PitchPlayer) => {
      const source = playerById.get(player.id);
      if (!source) return undefined;
      return [
        positionLabel(source.team_position) || source.profile_position || "Mevki yok",
        source.jersey_number ? `#${source.jersey_number}` : null,
      ]
        .filter(Boolean)
        .join(" · ");
    },
    [playerById],
  );

  /* ------------------------------ eylemler ------------------------------- */

  const changeFormation = useCallback(
    (next: string) => {
      setFormation(next);
      setActiveSlot(null);
      setDirty(true);
      // Karşılığı olan slotları taşı, olmayanları havuza bırak.
      const nextSlots = new Set(formations[next] ?? []);
      setAssignments((prev) =>
        Object.fromEntries(Object.entries(prev).filter(([slot]) => nextSlots.has(slot))),
      );
    },
    [formations],
  );

  const selectSlot = useCallback((slot: string) => {
    setActiveSlot((current) => (current === slot ? null : slot));
  }, []);

  const clearSlot = useCallback((slot: string) => {
    setDirty(true);
    setActiveSlot(null);
    setAssignments((prev) => {
      const next = { ...prev };
      delete next[slot];
      return next;
    });
  }, []);

  const placePlayer = useCallback(
    (player: PitchPlayer) => {
      if (!activeSlot) return;
      setDirty(true);
      setAssignments((prev) => {
        // Oyuncu başka bir yuvadaysa oradan düşer: aynı kişi iki yerde olamaz.
        const next = Object.fromEntries(
          Object.entries(prev).filter(([, id]) => id !== player.id),
        );
        next[activeSlot] = player.id;
        return next;
      });
      setActiveSlot(null);
    },
    [activeSlot],
  );

  const filled = Object.keys(pitchAssignments).length;

  const save = useMutation({
    mutationFn: () =>
      saveLineup(
        formation,
        Object.entries(assignments).map(([slot, playerId]) => ({ slot, playerId })),
      ),
    onSuccess: () => {
      setDirty(false);
      toast.show({ message: "İdeal kadron kaydedildi.", tone: "success" });
      // Kadro listesindeki `squad_role` ve `lineup_slot` sunucuda değişti.
      void queryClient.invalidateQueries({ queryKey: ["takim", "roster"] });
      void queryClient.invalidateQueries({ queryKey: ["takim", "dashboard"] });
    },
    onError: (error) => {
      toast.show({
        message: error instanceof ApiError ? error.userMessage : "İdeal kadro kaydedilemedi.",
        tone: "danger",
      });
    },
  });

  return (
    <ScrollView
      contentContainerStyle={styles.lineupContent}
      refreshControl={refreshControl}
      keyboardShouldPersistTaps="handled"
    >
      {/* Diziliş seçimi */}
      <Text style={styles.fieldLabel} {...textScale.badge}>
        {upperTR("Diziliş")}
      </Text>
      <ChipGroup>
        {formationNames.map((name) => (
          <FormationChip
            key={name}
            name={name}
            selected={name === formation}
            onPress={changeFormation}
          />
        ))}
      </ChipGroup>

      <View style={styles.lineupMeta}>
        <Text style={styles.lineupCount} {...textScale.dense}>
          Sahada {filled}/{Math.min(slots.length, MAX_STARTERS)}
        </Text>
        {dirty ? (
          <Text style={styles.lineupDirty} {...textScale.dense}>
            Kaydedilmemiş değişiklik var
          </Text>
        ) : null}
      </View>

      <PitchLineup
        slots={slots}
        assignments={pitchAssignments}
        activeSlot={activeSlot}
        onSelectSlot={selectSlot}
        onClearSlot={clearSlot}
      />

      <PitchBench
        players={bench}
        activeSlot={activeSlot}
        onPick={placePlayer}
        subtitleOf={benchSubtitle}
        emptyLabel="Kadrodaki herkes sahada."
      />

      <Button
        label="İdeal kadroyu kaydet"
        icon="save-outline"
        onPress={() => save.mutate()}
        loading={save.isPending}
        disabled={!dirty || save.isPending}
        fullWidth
      />

      <Text style={styles.lineupHint} {...textScale.long}>
        Sahaya yerleştirdiğin oyuncular kadro tablosunda “İlk Kadro” rolüne
        geçer; bu rol yalnız buradan değişir. Maça özel kadro (kaptan, misafir
        oyuncu, forma rengi) Maç Merkezi’ndeki maç kartından girilir.
      </Text>
    </ScrollView>
  );
});

/** Diziliş çipi — memo'lu olsun diye adı geri verir. */
const FormationChip = React.memo(function FormationChip({
  name,
  selected,
  onPress,
}: {
  name: string;
  selected: boolean;
  onPress: (name: string) => void;
}) {
  const handlePress = useCallback(() => onPress(name), [name, onPress]);
  return <Chip label={name} selected={selected} onPress={handlePress} size="sm" />;
});

/* ══════════════════════════════════════════════════════════════════════════
   Alt bileşenler
   ══════════════════════════════════════════════════════════════════════════ */

/** Liste başlığı: kadro büyüklüğü ve sözleşme dökümü + bayat veri bandı. */
const SquadSummary = React.memo(function SquadSummary({
  total,
  contracted,
  withoutContract,
  stale,
  error,
  onRetry,
}: {
  total: number;
  contracted: number;
  withoutContract: number;
  stale: boolean;
  error: unknown;
  onRetry: () => void;
}) {
  return (
    <View style={styles.summary}>
      {stale ? <ErrorState error={error} onRetry={onRetry} variant="banner" /> : null}
      <View style={styles.kpiRow}>
        <StatTile label="KADRO" value={String(total)} />
        <StatTile label="SÖZLEŞMELİ" value={String(contracted)} tone="win" />
        <StatTile
          label="SÖZLEŞMESİZ"
          value={String(withoutContract)}
          tone={withoutContract > 0 ? "warn" : "neutral"}
        />
      </View>
    </View>
  );
});

const StatTile = React.memo(function StatTile({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: Tone;
}) {
  const color =
    tone === "win" ? colors.win : tone === "warn" ? colors.warn : colors.textPrimary;
  return (
    <View style={styles.tile}>
      <Text style={[styles.tileValue, { color }]} numberOfLines={1} {...textScale.dense}>
        {value}
      </Text>
      <Text style={styles.tileLabel} numberOfLines={1} {...textScale.badge}>
        {label}
      </Text>
    </View>
  );
});

/**
 * Kadro satırı — forma numarası sütunu + avatar + ad/mevki + sözleşme rozeti.
 *
 * NEDEN ListRow DEĞİL: `ListRow.leading` 24×24'lük tek bir ikon yuvasıdır;
 * burada solda hem sabit genişlikli numara sütunu hem 36px avatar var. Satır
 * ölçüleri (64px yükseklik, 12px yatay boşluk, hairline ayraç, grup köşeleri)
 * ListRow ile birebir aynı tutulur.
 */
const PlayerRow = React.memo(function PlayerRow({
  player,
  position,
  onPress,
}: {
  player: RosterPlayer;
  position: "single" | "first" | "middle" | "last";
  onPress: (player: RosterPlayer) => void;
}) {
  const handlePress = useCallback(() => onPress(player), [onPress, player]);

  const meta = [
    positionLabel(player.team_position) || player.profile_position || "Mevki seçilmedi",
    ROLE_LABELS[player.squad_role],
    player.has_linked_account ? null : "Hesabı yok",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Touchable
      feedback="row"
      haptic="selection"
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`${player.player_name}. ${meta}. Düzenle`}
      style={[
        styles.row,
        position === "single" ? styles.rowSingle : null,
        position === "first" ? styles.rowFirst : null,
        position === "last" ? styles.rowLast : null,
      ]}
    >
      <Text style={styles.jersey} numberOfLines={1} {...textScale.badge}>
        {player.jersey_number != null ? player.jersey_number : "—"}
      </Text>

      <Avatar name={player.player_name} image={mediaUrl(player.player_img)} size={36} />

      <View style={styles.rowTexts}>
        <Text style={styles.rowName} numberOfLines={1} {...textScale.dense}>
          {player.player_name}
        </Text>
        <Text style={styles.rowMeta} numberOfLines={1} {...textScale.dense}>
          {meta}
        </Text>
      </View>

      {player.has_active_contract ? (
        <Badge label="SÖZLEŞMELİ" tone="win" size="xs" />
      ) : (
        <Badge label="SERBEST" tone="warn" size="xs" />
      )}

      <Ionicons name="create-outline" size={16} color={colors.textTertiary} />

      {position === "first" || position === "middle" ? (
        <View pointerEvents="none" style={styles.rowDivider} />
      ) : null}
    </Touchable>
  );
});

/* ══════════════════════════════════════════════════════════════════════════
   Düzenleme alt sayfası
   ══════════════════════════════════════════════════════════════════════════ */

/** Forma numarası 0 gösterildiğinde sunucuya `null` gider (numarasız). */
const NO_JERSEY = 0;

function PlayerEditorSheet({
  player,
  onClose,
}: {
  player: RosterPlayer;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();

  const [jersey, setJersey] = useState<number>(player.jersey_number ?? NO_JERSEY);
  const [position, setPosition] = useState<string | null>(player.team_position);
  const [role, setRole] = useState<SquadRole>(player.squad_role);

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["takim", "roster"] });
    void queryClient.invalidateQueries({ queryKey: ["takim", "dashboard"] });
  }, [queryClient]);

  const saveMutation = useMutation({
    mutationFn: (body: RosterPlayerPatch) => updateRosterPlayer(player.id, body),
    onSuccess: () => {
      invalidate();
      toast.show({ message: `${player.player_name} güncellendi.`, tone: "success" });
      onClose();
    },
    onError: (error: unknown) => {
      toast.show({
        message: error instanceof ApiError ? error.userMessage : "Kaydedilemedi.",
        tone: "danger",
      });
    },
  });

  const releaseMutation = useMutation({
    mutationFn: (force: boolean) => releaseRosterPlayer(player.id, force),
    onSuccess: (result) => {
      invalidate();
      toast.show({ message: result.message, tone: "success" });
      onClose();
    },
    onError: (error: unknown) => {
      /**
       * Aktif sözleşme: sunucu ilk çağrıda 409 döner. İKİNCİ ONAY alınır ve
       * aynı istek `force=true` ile tekrarlanır — sözleşme feshedilir.
       */
      if (error instanceof ApiError && error.code === "PLAYER_HAS_ACTIVE_CONTRACT") {
        Alert.alert(
          "Sözleşmesi aktif",
          `${player.player_name} ile aktif bir sözleşme var. Kadrodan çıkarmak bu sözleşmeyi feshedecek ve varsa açık teklifleri geri çekecek. Yine de çıkarılsın mı?`,
          [
            { text: "Vazgeç", style: "cancel" },
            {
              text: "Feshet ve çıkar",
              style: "destructive",
              onPress: () => releaseMutation.mutate(true),
            },
          ]
        );
        return;
      }
      toast.show({
        message: error instanceof ApiError ? error.userMessage : "Çıkarılamadı.",
        tone: "danger",
      });
    },
  });

  const confirmRelease = useCallback(() => {
    Alert.alert(
      "Kadrodan çıkar",
      `${player.player_name} kadrondan çıkarılacak. Emin misin?`,
      [
        { text: "Vazgeç", style: "cancel" },
        {
          text: "Çıkar",
          style: "destructive",
          onPress: () => releaseMutation.mutate(false),
        },
      ]
    );
  }, [player.player_name, releaseMutation]);

  const togglePosition = useCallback((code: string) => {
    setPosition((prev) => (prev === code ? null : code));
  }, []);

  const save = useCallback(() => {
    const body: RosterPlayerPatch = {};

    const nextJersey = jersey === NO_JERSEY ? null : jersey;
    if (nextJersey !== (player.jersey_number ?? null)) body.jersey_number = nextJersey;
    if (position !== player.team_position) body.team_position = position;
    if (role !== player.squad_role && role !== "starter") body.squad_role = role;

    if (Object.keys(body).length === 0) {
      onClose();
      return;
    }
    saveMutation.mutate(body);
  }, [jersey, onClose, player.jersey_number, player.team_position, player.squad_role, position, role, saveMutation]);

  const busy = saveMutation.isPending || releaseMutation.isPending;

  return (
    <BottomSheet
      visible
      onClose={onClose}
      title={player.player_name}
      snap="content"
      footer={
        <View style={styles.sheetFooter}>
          <Button
            label="Kadrodan çıkar"
            variant="danger"
            icon="person-remove-outline"
            onPress={confirmRelease}
            loading={releaseMutation.isPending}
            disabled={busy}
            style={styles.footerButton}
          />
          <Button
            label="Kaydet"
            icon="checkmark"
            onPress={save}
            loading={saveMutation.isPending}
            disabled={busy}
            haptic="success"
            style={styles.footerButton}
          />
        </View>
      }
    >
      <View style={styles.sheetBody}>
        {/* Kimlik */}
        <View style={styles.sheetHead}>
          <Avatar name={player.player_name} image={mediaUrl(player.player_img)} size={44} />
          <View style={styles.rowTexts}>
            <Text style={styles.sheetName} numberOfLines={1} {...textScale.dense}>
              {player.player_name}
            </Text>
            <Text style={styles.rowMeta} numberOfLines={1} {...textScale.dense}>
              Profil mevkisi: {player.profile_position || "—"}
            </Text>
          </View>
          {player.has_active_contract ? (
            <Badge label="SÖZLEŞMELİ" tone="win" size="xs" />
          ) : (
            <Badge label="SERBEST" tone="warn" size="xs" />
          )}
        </View>

        {/* Forma numarası */}
        <Text style={styles.fieldLabel} {...textScale.badge}>
          {upperTR("Forma numarası")}
        </Text>
        <View style={styles.jerseyRow}>
          <Stepper
            value={jersey}
            onChange={setJersey}
            min={NO_JERSEY}
            max={99}
            repeatOnHold
            accessibilityLabel="Forma numarası"
          />
          <Text style={styles.fieldHint} {...textScale.dense}>
            {jersey === NO_JERSEY ? "Numarasız" : `${jersey} numaralı forma`}
          </Text>
        </View>

        {/* Takım mevkisi */}
        <Text style={styles.fieldLabel} {...textScale.badge}>
          {upperTR("Takım mevkisi")}
        </Text>
        <ChipGroup scrollable={false} contentPadding={0}>
          {POSITIONS.map((item) => (
            <PositionChip
              key={item.code}
              code={item.code}
              label={item.code}
              selected={position === item.code}
              onPress={togglePosition}
            />
          ))}
        </ChipGroup>
        <Text style={styles.fieldHint} {...textScale.dense}>
          {position ? positionLabel(position) : "Mevki seçilmedi — çipe ikinci kez dokunmak seçimi kaldırır."}
        </Text>

        {/* Kadro rolü */}
        <Text style={styles.fieldLabel} {...textScale.badge}>
          {upperTR("Kadro rolü")}
        </Text>
        <ChipGroup scrollable={false} contentPadding={0}>
          {player.squad_role === "starter" ? (
            <Chip label={ROLE_LABELS.starter} selected disabled tone="brand" />
          ) : null}
          {EDITABLE_ROLES.map((value) => (
            <RoleChip key={value} value={value} selected={role === value} onPress={setRole} />
          ))}
        </ChipGroup>
        <Text style={styles.fieldHint} {...textScale.long}>
          İlk 8 rolü sunucuda takımın diziliş kaydına bağlıdır; bu alandan
          değiştirilemez. Oyuncuyu ilk sekize almak için üstteki “Diziliş”
          görünümünde sahaya yerleştir.
        </Text>
      </View>
    </BottomSheet>
  );
}

/** Mevki çipi — memo'lu olsun diye `onPress` kodu geri verir. */
const PositionChip = React.memo(function PositionChip({
  code,
  label,
  selected,
  onPress,
}: {
  code: string;
  label: string;
  selected: boolean;
  onPress: (code: string) => void;
}) {
  const handlePress = useCallback(() => onPress(code), [code, onPress]);
  return <Chip label={label} selected={selected} onPress={handlePress} size="sm" />;
});

const RoleChip = React.memo(function RoleChip({
  value,
  selected,
  onPress,
}: {
  value: Exclude<SquadRole, "starter">;
  selected: boolean;
  onPress: (value: SquadRole) => void;
}) {
  const handlePress = useCallback(() => onPress(value), [onPress, value]);
  return <Chip label={ROLE_LABELS[value]} selected={selected} onPress={handlePress} />;
});

/* ══════════════════════════════════════════════════════════════════════════
   Stiller
   ══════════════════════════════════════════════════════════════════════════ */

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  headerBottom: {
    gap: space.s,
    paddingHorizontal: layout.screenPadding,
    paddingBottom: space.sm,
  },
  content: {
    paddingHorizontal: layout.screenPadding,
    paddingBottom: space.xxxl,
  },
  loading: {
    paddingHorizontal: layout.screenPadding,
  },
  sectionGap: {
    height: space.md,
  },

  /* Diziliş görünümü */
  lineupContent: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.md,
    paddingBottom: space.huge,
    gap: space.md,
  },
  lineupMeta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
  },
  lineupCount: {
    ...type.label,
    color: colors.textSecondary,
  },
  lineupDirty: {
    ...type.caption,
    color: colors.warn,
  },
  lineupHint: {
    ...type.caption,
    color: colors.textTertiary,
  },

  /* Özet */
  summary: {
    paddingTop: space.sm,
    gap: space.sm,
  },
  kpiRow: {
    flexDirection: "row",
    gap: space.sm,
  },
  tile: {
    flex: 1,
    alignItems: "center",
    gap: 2,
    borderRadius: radius.lg,
    borderWidth: hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface1,
    paddingVertical: space.m,
    paddingHorizontal: space.xs,
  },
  tileValue: {
    ...type.scoreSm,
  },
  tileLabel: {
    ...type.micro,
    color: colors.textTertiary,
  },

  /* Kadro satırı — ListRow ölçüleriyle birebir. */
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.m,
    minHeight: layout.listRowHeightTwoLine,
    paddingHorizontal: layout.rowPaddingH,
    backgroundColor: colors.surface1,
  },
  rowSingle: {
    borderRadius: radius.lg,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  rowFirst: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
  },
  rowLast: {
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
  },
  rowDivider: {
    position: "absolute",
    left: layout.rowPaddingH + 24 + space.m,
    right: 0,
    bottom: 0,
    height: hairline,
    backgroundColor: colors.separator,
  },
  jersey: {
    ...type.tableNumStrong,
    color: colors.brandAccent,
    width: 24,
    textAlign: "center",
  },
  rowTexts: {
    flex: 1,
    gap: 2,
  },
  rowName: {
    ...type.body,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  rowMeta: {
    ...type.caption,
    color: colors.textSecondary,
  },

  /* Alt sayfa */
  sheetBody: {
    gap: space.xs,
    paddingBottom: space.sm,
  },
  sheetHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingBottom: space.sm,
  },
  sheetName: {
    ...type.h2,
    color: colors.textPrimary,
  },
  fieldLabel: {
    ...type.micro,
    color: colors.textTertiary,
    marginTop: space.md,
  },
  jerseyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    marginTop: space.xs,
  },
  fieldHint: {
    ...type.caption,
    color: colors.textTertiary,
    marginTop: space.xs,
    flexShrink: 1,
  },
  sheetFooter: {
    flexDirection: "row",
    gap: space.sm,
  },
  footerButton: {
    flex: 1,
  },
});
