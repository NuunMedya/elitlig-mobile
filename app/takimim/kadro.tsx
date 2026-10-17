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
 * PİYASA DEĞERİ: her satırda sunucudan gelen değer (ETL) ve son hesaplamaya
 * göre değişim gösterilir. Değerler TEK sorguda, takım kapsamında çekilir
 * (N+1 yok); hesaplanmamış oyuncuda sütun hiç çizilmez. Web panelindeki
 * MarketValueBadge'in karşılığıdır.
 *
 * DÜZENLEME: satıra dokununca alt sayfa açılır. Forma numarası Stepper ile
 * (0 = numarasız → sunucuya `null` gider), mevki 11 kısaltmalı çipten biri,
 * kadro rolü Yedek/Kadro Dışı arasından seçilir.
 *
 * SUNUCU SÖZLEŞMESİ (değiştirilmedi):
 *  - PATCH /api/team-management/roster/:playerId — yalnız DEĞİŞEN alanlar
 *    gönderilir; `squad_role: "starter"` bu uçtan kabul edilmez (400).
 *  - Kadrodan çıkarma ANINDA yapılmaz (yönetim onaylı kadro listesi):
 *    POST /squad-list/removals ile oyuncu "çıkarılacak" işaretlenir,
 *    POST /squad-list/submit ile liste yönetime gider; yönetim her çıkarma ve
 *    transferi tek tek onaylar (web: /editor/kadro-listeleri). Satırlarda
 *    oyuncunun bu takımda oynadığı maç sayısı GET /squad-list'ten gelir.
 *  - PUT /api/team-management/lineup — { formation, assignments[] }. İlk 8
 *    rolü SUNUCUDA bu uçtan türer; kadro tablosundan `starter` seçilemez.
 *
 * MAÇA GÖRE (`?grup=mac&sira=<takim|toplam|son|uzun|az>`): kadro düz listede
 * maç sayısına / son maç tarihine göre sıralanır. Her satırda son maç tarihi
 * ve son 5 maç şeridi (G/B/M; başka takımda oynanan maç turuncu çerçeveli)
 * görünür; ayrıntısı alt sayfada. Veri GET /squad-list → players[].history
 * (tüm takımlar, sezon süzgecinden bağımsız). "Son maçını başka takımda
 * oynamış" oyuncu satırda uyarıyla işaretlenir.
 *
 * DÖRT GÖRÜNÜM (`?gorunum=`) — başlıktaki SAYFA SEKMELERİ (Arena: sekme
 * sayfayı değiştirir, segment veriyi süzer). Eskiden üç görünüm kâğıttaki bir
 * segmentteydi ve "Transfer & Sezon" tek sekmede iki ayrı işi taşıyordu:
 * oyuncu aramak (günlük iş) ile sezon kadrosunu onaya göndermek (sezonda
 * birkaç kez) aynı uzun kaydırmanın içindeydi. Artık ayrı sekmelerdir.
 *   kadro   Oyuncu listesi ve takıma özgü alanlar (bu dosyanın çekirdeği).
 *           Arama + hızlı süzgeç çipleri (`?filtre=sozlesmesiz|hesapsiz|
 *           numarasiz|mevkisiz`): başkan "kimin sözleşmesi yok?" sorusunu
 *           listede gözle aramaz, tek dokunuşla süzer. Kulübüm'deki
 *           "Sözleşmesiz oyuncu" işi doğrudan bu süzgeçle açılır.
 *   dizilis Takımın İDEAL kadrosu — `components/PitchLineup.tsx` ile sahada
 *           iki dokunuşla kurulur (boş yuva → havuzdan oyuncu). Aynı bileşen
 *           maç kadrosu ekranında da kullanılır; iki yer tek etkileşim modeli
 *           paylaşır. Öncesinde mobilde ideal kadro hiç düzenlenemiyordu.
 *   transfer OYUNCU EKLE — `SquadBuilderView section="transfer"`: oyuncu ara
 *           → tek dokunuşla davet/teklif; bekleyen davet ve teklifler.
 *   sezon   SEZON KADROSU — `SquadBuilderView section="season"`: taslak →
 *           yönetime gönder → onay. Takım kadrosuyla karıştırılmamalı: sezon
 *           kadrosu o sezona kayıttır ve net ekleme transfer hakkı tüketir.
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
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { PitchBench, PitchLineup, type PitchPlayer } from "@/components/PitchLineup";
import { StatStrip } from "@/components/club/Panel";
import { countLines } from "@/components/club/SquadSnapshot";
import { SquadBuilderView } from "@/components/team/SquadBuilderView";
import { LastMatchesList, LastMatchesStrip, daysAgo, shortDate } from "@/components/team/PlayerMatchHistory";
import {
  Avatar,
  Badge,
  BottomSheet,
  Button,
  Chip,
  ChipGroup,
  EmptyState,
  ErrorState,
  Input,
  ScreenHeader,
  SectionHeader,
  SegmentedControl,
  SkeletonCard,
  SkeletonListRow,
  Stepper,
  Tabs,
  Touchable,
  refreshControlProps,
  useHeaderScroll,
  useRefresh,
  useToast,
  type SegmentedItem,
  type TabItem,
} from "@/components/ui";
import {
  DEFAULT_FORMATION,
  FORMATIONS,
  MAX_STARTERS,
  POSITIONS,
  getTeamRoster,
  positionLabel,
  getSquadList,
  type SquadListResponse,
  type PlayerHistory,
  markSquadRemoval,
  unmarkSquadRemoval,
  submitSquadList,
  withdrawSquadList,
  saveLineup,
  updateRosterPlayer,
  type RosterPlayer,
  type RosterPlayerPatch,
  type SquadRole,
  type TeamRosterResponse,
} from "@/lib/api/team";
import { getMarketValues, formatEtlShort } from "@/lib/api/marketValue";
import { mediaUrl } from "@/lib/format";
import { ApiError } from "@/lib/http";
import { useAuth } from "@/providers/AuthProvider";
import {
  colors,
  elevate,
  fonts,
  hairline,
  layout,
  radius,
  space,
  textScale,
  type,
  upperTR,
} from "@/theme";

/* ══════════════════════════════════════════════════════════════════════════
   Sabitler ve saf yardımcılar
   ══════════════════════════════════════════════════════════════════════════ */

type GroupMode = "mevki" | "rol" | "mac";

/** "Maça göre" görünümünün sıralamaları (`?sira=`). */
type MatchSort = "takim" | "toplam" | "son" | "uzun" | "az";

const SORT_ITEMS: { key: MatchSort; label: string }[] = [
  { key: "takim", label: "Bu takımda en çok" },
  { key: "toplam", label: "Toplamda en çok" },
  { key: "son", label: "En son oynayan" },
  { key: "uzun", label: "Uzun süredir oynamayan" },
  { key: "az", label: "En az maç" },
];

/** Kadro listesinden gelen maç bilgisi (squad-list). */
interface SquadInfo {
  matches: number;
  marked: boolean;
  history: PlayerHistory | null;
}

/** Hızlı süzgeçler — başkanın "kimde eksik var?" soruları. */
type QuickFilter = "tumu" | "sozlesmesiz" | "hesapsiz" | "numarasiz" | "mevkisiz";

const QUICK_FILTERS: { key: QuickFilter; label: string; match: (player: RosterPlayer) => boolean }[] = [
  { key: "tumu", label: "Tümü", match: () => true },
  { key: "sozlesmesiz", label: "Sözleşmesiz", match: (player) => !player.has_active_contract },
  { key: "hesapsiz", label: "Hesabı yok", match: (player) => !player.has_linked_account },
  { key: "numarasiz", label: "Numarasız", match: (player) => player.jersey_number == null },
  { key: "mevkisiz", label: "Mevkisiz", match: (player) => !player.team_position },
];

const GROUP_ITEMS: SegmentedItem<GroupMode>[] = [
  { key: "mevki", label: "Mevki" },
  { key: "rol", label: "Rol" },
  { key: "mac", label: "Maç" },
];

/** Ekranın dört görünümü. Seçim `?gorunum=` ile rotada taşınır. */
type ViewMode = "kadro" | "dizilis" | "transfer" | "sezon";

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
  return value === "rol" || value === "mac" ? value : "mevki";
}

function resolveSort(raw: string | string[] | undefined): MatchSort {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return SORT_ITEMS.some((item) => item.key === value) ? (value as MatchSort) : "takim";
}

/** "Maça göre" sıralaması; eşitlikte ad. Hiç maçı olmayan "uzun süredir"de en üstte. */
function sortByMatches(players: RosterPlayer[], sort: MatchSort, info: Map<number, SquadInfo>): RosterPlayer[] {
  const teamMatches = (p: RosterPlayer) => info.get(p.id)?.matches ?? 0;
  const total = (p: RosterPlayer) => info.get(p.id)?.history?.matches ?? 0;
  const last = (p: RosterPlayer) => info.get(p.id)?.history?.last_match_date ?? "";
  const byName = (a: RosterPlayer, b: RosterPlayer) => a.player_name.localeCompare(b.player_name, "tr");
  const compare: Record<MatchSort, (a: RosterPlayer, b: RosterPlayer) => number> = {
    takim: (a, b) => teamMatches(b) - teamMatches(a) || byName(a, b),
    toplam: (a, b) => total(b) - total(a) || byName(a, b),
    son: (a, b) => last(b).localeCompare(last(a)) || byName(a, b),
    uzun: (a, b) => (last(a) ? 1 : 0) - (last(b) ? 1 : 0) || last(a).localeCompare(last(b)) || byName(a, b),
    az: (a, b) => teamMatches(a) - teamMatches(b) || byName(a, b),
  };
  return players.slice().sort(compare[sort]);
}

/** Rota parametresinden görünüm — tanınmayan değer sessizce "kadro" olur. */
function resolveView(value: string | string[] | undefined): ViewMode {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === "dizilis" || raw === "transfer" || raw === "sezon") return raw;
  return "kadro";
}

function resolveFilter(value: string | string[] | undefined): QuickFilter {
  const raw = Array.isArray(value) ? value[0] : value;
  return QUICK_FILTERS.some((item) => item.key === raw) ? (raw as QuickFilter) : "tumu";
}

/** Türkçe büyük/küçük harf duyarsız arama anahtarı. */
const searchKey = (value: string) => value.toLocaleLowerCase("tr-TR").trim();

/* ══════════════════════════════════════════════════════════════════════════
   Ekran
   ══════════════════════════════════════════════════════════════════════════ */

export default function SquadManagementScreen() {
  const auth = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ grup?: string; gorunum?: string; filtre?: string; sira?: string }>();
  const { scrollY, scrollProps } = useHeaderScroll();

  const [editing, setEditing] = useState<RosterPlayer | null>(null);
  const [term, setTerm] = useState("");

  const group = resolveGroup(params.grup);
  const view = resolveView(params.gorunum);
  const quick = resolveFilter(params.filtre);
  const sort = resolveSort(params.sira);

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

  /* KADRO LİSTESİ — bu takımdaki maç sayıları, çıkarılacak işaretleri ve
     yönetime gönderim durumu. Hata hâlinde liste yine çizilir. */
  const squadQuery = useQuery({
    queryKey: ["takim", "squad-list"],
    queryFn: () => getSquadList(),
    enabled: Boolean(auth.user),
    staleTime: 30_000,
    retry: false,
  });
  const squadById = useMemo(() => {
    const map = new Map<number, SquadInfo>();
    (squadQuery.data?.players ?? []).forEach((p) =>
      map.set(Number(p.id), { matches: p.stats?.matches ?? 0, marked: Boolean(p.marked_for_removal), history: p.history ?? null }),
    );
    return map;
  }, [squadQuery.data]);
  const listLocked = squadQuery.data?.submission?.status === "submitted";

  /* PİYASA DEĞERLERİ — TEK sorguda, takım kapsamında (N+1 yok; web paneli de
     aynı yolu kullanır). Uç herkese açık ve kadro olmadan anlamsız olduğu için
     yalnız takım kimliği çözüldüğünde açılır. Hata hâlinde satırlar değer
     sütunu olmadan çizilir — kadro yönetimi buna bağlı değil. */
  const teamId = query.data?.team?.id ?? null;

  const marketQuery = useQuery({
    queryKey: ["takim", "market-values", teamId],
    queryFn: () => getMarketValues({ teamId: teamId as number }),
    enabled: Boolean(teamId),
    staleTime: 10 * 60_000,
    retry: false,
  });

  const marketByPlayer = useMemo(() => {
    const map = new Map<number, { value: number; change: number }>();
    (marketQuery.data?.items ?? []).forEach((item) => {
      map.set(Number(item.playerId), {
        value: item.currentValue,
        change: item.changeAmount,
      });
    });
    return map;
  }, [marketQuery.data]);

  /** Her hızlı süzgecin sayacı — çipte gösterilir, 0 olan çip sönük kalır. */
  const quickCounts = useMemo(() => {
    const result = {} as Record<QuickFilter, number>;
    QUICK_FILTERS.forEach((item) => {
      result[item.key] = roster.filter(item.match).length;
    });
    return result;
  }, [roster]);

  /** Süzgeç + arama sonrası görünen oyuncular. */
  const filtered = useMemo(() => {
    const def = QUICK_FILTERS.find((item) => item.key === quick) ?? QUICK_FILTERS[0];
    const needle = searchKey(term);
    return roster.filter(
      (player) =>
        def.match(player) &&
        (!needle ||
          searchKey(player.player_name).includes(needle) ||
          String(player.jersey_number ?? "") === needle),
    );
  }, [quick, roster, term]);

  const sections = useMemo<RosterSection[]>(() => {
    if (filtered.length === 0) return [];

    if (group === "mac") {
      const label = SORT_ITEMS.find((item) => item.key === sort)?.label ?? "";
      return [{ key: "mac", title: label, data: sortByMatches(filtered, sort, squadById) }];
    }

    if (group === "rol") {
      return (["starter", "substitute", "reserve"] as const)
        .map((role) => ({
          key: role,
          title: ROLE_LABELS[role],
          data: filtered.filter((player) => player.squad_role === role).sort(comparePlayers),
        }))
        .filter((section) => section.data.length > 0);
    }

    const byLine = LINE_ORDER.map((line) => ({
      key: line,
      title: LINE_LABELS[line],
      data: filtered
        .filter((player) => LINE_BY_CODE[player.team_position ?? ""] === line)
        .sort(comparePlayers),
    })).filter((section) => section.data.length > 0);

    const unknown = filtered
      .filter((player) => !LINE_BY_CODE[player.team_position ?? ""])
      .sort(comparePlayers);

    return unknown.length > 0
      ? [...byLine, { key: "bilinmiyor", title: "Mevkisi belirlenmemiş", data: unknown }]
      : byLine;
  }, [filtered, group, sort, squadById]);

  const lines = useMemo(() => countLines(roster.map((player) => player.team_position)), [roster]);
  const contracted = useMemo(() => roster.filter((player) => player.has_active_contract).length, [roster]);
  /** Kadronun toplam piyasa değeri — yalnız hesaplanmış oyuncuların toplamı. */
  const squadValue = useMemo(() => {
    let total = 0;
    let known = 0;
    roster.forEach((player) => {
      const entry = marketByPlayer.get(player.id);
      if (entry) {
        total += entry.value;
        known += 1;
      }
    });
    return known ? total : null;
  }, [marketByPlayer, roster]);

  /** Forma numarası → oyuncu adı; düzenleyicide çakışma uyarısı için. */
  const jerseyOwners = useMemo(() => {
    const map = new Map<number, { id: number; name: string }>();
    roster.forEach((player) => {
      if (player.jersey_number != null) map.set(player.jersey_number, { id: player.id, name: player.player_name });
    });
    return map;
  }, [roster]);

  const changeGroup = useCallback(
    (next: GroupMode) => {
      router.setParams({ grup: next });
    },
    [router]
  );

  const changeSort = useCallback(
    (next: MatchSort) => {
      router.setParams({ sira: next });
    },
    [router]
  );

  const changeQuick = useCallback(
    (next: QuickFilter) => {
      router.setParams({ filtre: next });
    },
    [router]
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

  const renderItem = useCallback(
    ({ item, index, section }: SectionListRenderItemInfo<RosterPlayer, RosterSection>) => (
      <PlayerRow
        player={item}
        position={rowPosition(index, section.data.length)}
        marketValue={marketByPlayer.get(item.id)?.value ?? null}
        marketChange={marketByPlayer.get(item.id)?.change ?? null}
        matches={squadById.get(item.id)?.matches ?? null}
        marked={squadById.get(item.id)?.marked ?? false}
        history={squadById.get(item.id)?.history ?? null}
        teamId={teamId}
        onPress={openEditor}
      />
    ),
    [marketByPlayer, openEditor, squadById, teamId]
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: RosterSection }) => (
      <SectionHeader title={section.title} meta={`${section.data.length} oyuncu`} size="group" style={styles.flushHeader} />
    ),
    []
  );

  const renderSectionFooter = useCallback(() => <View style={styles.sectionGap} />, []);

  const tabItems = useMemo<TabItem<ViewMode>[]>(
    () => [
      { key: "kadro", label: "Kadro" },
      { key: "dizilis", label: "Diziliş" },
      { key: "transfer", label: "Transfer" },
      { key: "sezon", label: "Sezon kadrosu" },
    ],
    []
  );

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
      tabs={
        roster.length > 0 ? (
          <Tabs items={tabItems} value={view} onChange={changeView} sticky />
        ) : undefined
      }
    />
  );

  if (query.isLoading && !query.data) {
    return (
      <SafeAreaView style={styles.screen} edges={["top"]}>
        {header}
        <View style={styles.loading}>
          <SkeletonCard lines={2} />
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
          action={{ label: "Yönetim'e dön", onPress: () => router.replace("/kulubum") }}
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

  /* Kadro boşken sekme şeridi gizlidir; başkanı boş ekranla bırakmak yerine
     doğrudan oyuncu arayıp kadroya katabileceği kurucu görünüm açılır. */
  if (roster.length === 0) {
    return (
      <SafeAreaView style={styles.screen} edges={["top"]}>
        {header}
        <SquadBuilderView section="transfer" refreshControl={refreshControl} />
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

  if (view === "transfer" || view === "sezon") {
    return (
      <SafeAreaView style={styles.screen} edges={["top"]}>
        {header}
        <SquadBuilderView key={view} section={view === "transfer" ? "transfer" : "season"} refreshControl={refreshControl} />
      </SafeAreaView>
    );
  }

  const listHeader = (
    <View style={styles.summary}>
      {query.isError ? (
        <ErrorState error={query.error} onRetry={query.refetch} variant="banner" />
      ) : null}

      {/* Kadro dengesi — tek ince şerit: hat sayıları ve sözleşme sağlığı.
          Sayıya dokunmak ilgili süzgeci açar (mevki boşsa "mevkisiz"). */}
      <StatStrip
        items={[
          { label: "Kaleci", value: String(lines.GK), tone: lines.GK === 0 ? "danger" : "neutral" },
          { label: "Defans", value: String(lines.DEF) },
          { label: "Orta", value: String(lines.MID) },
          { label: "Forvet", value: String(lines.FWD) },
          {
            label: "Sözleşme",
            value: `${contracted}/${roster.length}`,
            tone: contracted < roster.length ? "danger" : "win",
            onPress: contracted < roster.length ? () => changeQuick("sozlesmesiz") : undefined,
          },
        ]}
      />

      <Input
        variant="search"
        value={term}
        onChangeText={setTerm}
        placeholder="Oyuncu adı ya da forma no"
        autoCorrect={false}
        returnKeyType="search"
        accessibilityLabel="Kadroda ara"
      />

      <ChipGroup contentPadding={0}>
        {QUICK_FILTERS.map((item) => (
          <QuickChip
            key={item.key}
            value={item.key}
            label={item.label}
            count={item.key === "tumu" ? undefined : quickCounts[item.key]}
            selected={quick === item.key}
            onPress={changeQuick}
          />
        ))}
      </ChipGroup>

      <View style={styles.listBar}>
        <Text style={styles.listCount} {...textScale.dense}>
          {filtered.length === roster.length ? `${roster.length} oyuncu` : `${filtered.length} / ${roster.length} oyuncu`}
          {squadValue != null ? ` · ${formatEtlShort(squadValue)}` : ""}
        </Text>
        <SegmentedControl items={GROUP_ITEMS} value={group} onChange={changeGroup} size="sm" stretch={false} />
      </View>

      {group === "mac" ? (
        <ChipGroup contentPadding={0}>
          {SORT_ITEMS.map((item) => (
            <SortChip key={item.key} value={item.key} label={item.label} selected={sort === item.key} onPress={changeSort} />
          ))}
        </ChipGroup>
      ) : null}
    </View>
  );

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
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        initialNumToRender={12}
        ListHeaderComponent={listHeader}
        ListFooterComponent={squadQuery.data ? <SquadListSubmitCard data={squadQuery.data} /> : null}
        ListEmptyComponent={
          <EmptyState
            icon={term ? "search-outline" : "checkmark-circle-outline"}
            title={term ? "Eşleşen oyuncu yok" : "Bu süzgeçte oyuncu yok"}
            body={
              term
                ? `“${term.trim()}” kadronda bulunamadı. Yeni oyuncu için Transfer sekmesini kullan.`
                : "Bu konuda eksik yok — kadronun bu bilgisi tam."
            }
            action={
              term
                ? { label: "Transfer'de ara", onPress: () => changeView("transfer") }
                : { label: "Tüm kadroyu göster", onPress: () => changeQuick("tumu") }
            }
            variant="inline"
            compact
          />
        }
      />

      {editing ? (
        <PlayerEditorSheet
          player={editing}
          marked={squadById.get(editing.id)?.marked ?? false}
          history={squadById.get(editing.id)?.history ?? null}
          teamId={teamId}
          locked={listLocked}
          jerseyOwners={jerseyOwners}
          onClose={closeEditor}
          onOpenProfile={(id) => {
            closeEditor();
            router.push(`/oyuncu/${id}`);
          }}
        />
      ) : null}
    </SafeAreaView>
  );
}

/** Sıralama çipi ("Maça göre" görünümü). */
const SortChip = React.memo(function SortChip({
  value,
  label,
  selected,
  onPress,
}: {
  value: MatchSort;
  label: string;
  selected: boolean;
  onPress: (value: MatchSort) => void;
}) {
  const handlePress = useCallback(() => onPress(value), [onPress, value]);
  return <Chip label={label} selected={selected} onPress={handlePress} />;
});

/** Hızlı süzgeç çipi — memo'lu olsun diye anahtarı geri verir. */
const QuickChip = React.memo(function QuickChip({
  value,
  label,
  count,
  selected,
  onPress,
}: {
  value: QuickFilter;
  label: string;
  count?: number;
  selected: boolean;
  onPress: (value: QuickFilter) => void;
}) {
  const handlePress = useCallback(() => onPress(value), [onPress, value]);
  return (
    <Chip
      label={label}
      count={count}
      selected={selected}
      onPress={handlePress}
      size="sm"
      disabled={count === 0 && !selected}
    />
  );
});

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
  const insets = useSafeAreaInsets();

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
    <View style={styles.flex}>
      <ScrollView
        contentContainerStyle={styles.lineupContent}
        refreshControl={refreshControl}
        keyboardShouldPersistTaps="handled"
      >
        {/* Diziliş seçimi */}
        <Text style={styles.fieldLabel} {...textScale.badge}>
          {upperTR("Diziliş")}
        </Text>
        <ChipGroup contentPadding={0}>
          {formationNames.map((name) => (
            <FormationChip
              key={name}
              name={name}
              selected={name === formation}
              onPress={changeFormation}
            />
          ))}
        </ChipGroup>

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

        <Text style={styles.lineupHint} {...textScale.long}>
          Sahaya yerleştirdiğin oyuncular kadro tablosunda “İlk Kadro” rolüne
          geçer; bu rol yalnız buradan değişir. Maça özel kadro (kaptan, misafir
          oyuncu, forma rengi) Maç Merkezi’ndeki maç kartından girilir.
        </Text>
      </ScrollView>

      {/* SABİT KAYIT ÇUBUĞU — sahadaki doluluk ve kaydedilmemiş değişiklik
          her an görünür; kaydetmek için yedek havuzunun sonuna inilmez. */}
      <View style={[styles.bar, { paddingBottom: space.md + insets.bottom }]}>
        <View style={styles.barTexts}>
          <Text style={styles.barTitle} {...textScale.dense}>
            Sahada {filled}/{Math.min(slots.length, MAX_STARTERS)}
          </Text>
          <Text style={[styles.barMeta, dirty ? styles.barDirty : null]} numberOfLines={1} {...textScale.dense}>
            {dirty ? "Kaydedilmemiş değişiklik var" : "İdeal kadro kayıtlı"}
          </Text>
        </View>
        <Button
          label="Kaydet"
          icon="checkmark"
          onPress={() => save.mutate()}
          loading={save.isPending}
          disabled={!dirty || save.isPending}
          haptic="success"
        />
      </View>
    </View>
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

/**
 * Kadro satırı — forma numarası sütunu + avatar + ad/mevki + sözleşme rozeti.
 *
 * NEDEN ListRow DEĞİL: `ListRow.leading` 24×24'lük tek bir ikon yuvasıdır;
 * burada solda hem sabit genişlikli numara sütunu hem 36px avatar var. Satır
 * ölçüleri (64px yükseklik, 12px yatay boşluk, hairline ayraç, grup köşeleri)
 * ListRow ile birebir aynı tutulur.
 */
/* ══════════════════════════════════════════════════════════════════════════
   Kadro listesini yönetime gönder
   ══════════════════════════════════════════════════════════════════════════ */

function SquadListSubmitCard({ data }: { data: SquadListResponse }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const submission = data.submission;
  const locked = submission?.status === "submitted";
  const removals = data.players.filter((p) => p.marked_for_removal).length;
  const additions = data.additions.length;
  const review = data.last_review;

  const mutation = useMutation({
    mutationFn: () => (locked ? withdrawSquadList() : submitSquadList()),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["takim", "squad-list"] });
      toast.show({ message: result.message, tone: "success" });
    },
    onError: (error: unknown) => {
      toast.show({ message: error instanceof ApiError ? error.message || error.userMessage : "İşlem yapılamadı.", tone: "danger" });
    },
  });

  const confirm = useCallback(() => {
    if (locked) {
      Alert.alert("Gönderimi geri çek", "Liste yönetimden geri çekilecek; yeniden düzenleyip gönderebilirsin.", [
        { text: "Vazgeç", style: "cancel" },
        { text: "Geri çek", onPress: () => mutation.mutate() },
      ]);
      return;
    }
    Alert.alert(
      "Listeyi yönetime gönder",
      `${data.players.length} oyunculuk kadro listen yönetime gönderilecek: ${removals} çıkarma, ${additions} transfer/davet. ` +
        "Yönetim her çıkarma ve transferi tek tek onaylar; sonuç bildirim olarak gelir.",
      [
        { text: "Vazgeç", style: "cancel" },
        { text: "Gönder", onPress: () => mutation.mutate() },
      ]
    );
  }, [additions, data.players.length, locked, mutation, removals]);

  return (
    <View style={styles.submitCard}>
      <Text style={styles.submitTitle} {...textScale.dense}>
        {locked ? "Liste yönetimde inceleniyor" : "Kadro listesini yönetime gönder"}
      </Text>
      <Text style={styles.submitMeta} {...textScale.long}>
        {removals} çıkarılacak · {additions} transfer/davet
        {review && !locked
          ? ` · Son inceleme: ${review.items.filter((i) => i.decision === "approved").length} onay, ${review.items.filter((i) => i.decision === "rejected").length} ret`
          : ""}
      </Text>
      <Button
        label={locked ? "Gönderimi geri çek" : "Listeyi gönder"}
        variant={locked ? "secondary" : "primary"}
        icon={locked ? "arrow-undo-outline" : "paper-plane-outline"}
        onPress={confirm}
        loading={mutation.isPending}
        fullWidth
      />
    </View>
  );
}

const PlayerRow = React.memo(function PlayerRow({
  player,
  position,
  marketValue,
  marketChange,
  matches,
  marked,
  history,
  teamId,
  onPress,
}: {
  player: RosterPlayer;
  /** Bu takımda oynadığı maç sayısı (kadro listesinden). */
  matches?: number | null;
  /** Tüm takımlardaki maç geçmişi: son maç ve son 5 maç. */
  history?: PlayerHistory | null;
  teamId?: number | null;
  /** Yönetime gönderilecek listede "çıkarılacak" işaretli mi. */
  marked?: boolean;
  position: "single" | "first" | "middle" | "last";
  /** Sunucudan gelen piyasa değeri (ETL); yoksa satırda gösterilmez. */
  marketValue?: number | null;
  /** Son hesaplamaya göre değişim — işaretine göre renklenir. */
  marketChange?: number | null;
  onPress: (player: RosterPlayer) => void;
}) {
  const handlePress = useCallback(() => onPress(player), [onPress, player]);
  /** Son maçını başka bir takımda oynadıysa o takımın adı. */
  const lastMatch = history?.last_matches[0];
  const otherTeamLast =
    lastMatch && lastMatch.team_id != null && teamId != null && Number(lastMatch.team_id) !== Number(teamId)
      ? lastMatch.team_name
      : null;

  const meta = [
    matches != null ? `${matches} maç` : null,
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
      accessibilityLabel={`${player.player_name}. ${meta}.${history?.last_match_date ? ` Son maç ${shortDate(history.last_match_date)}${otherTeamLast ? `, ${otherTeamLast} takımında` : ""}.` : ""} Düzenle`}
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

      <Avatar name={player.player_name} image={mediaUrl(player.player_img)} size={30} />

      <View style={styles.rowTexts}>
        <Text style={styles.rowName} numberOfLines={1} {...textScale.dense}>
          {player.player_name}
        </Text>
        <Text style={styles.rowMeta} numberOfLines={1} {...textScale.dense}>
          {meta}
        </Text>
        {history && history.last_matches.length > 0 ? (
          <View style={styles.historyLine}>
            <LastMatchesStrip matches={history.last_matches} teamId={teamId} />
            <Text
              style={[styles.historyText, otherTeamLast ? styles.historyWarn : null]}
              numberOfLines={1}
              {...textScale.dense}
            >
              {otherTeamLast ? `Son: ${otherTeamLast}` : `Son maç ${shortDate(history.last_match_date)}`}
            </Text>
          </View>
        ) : history ? (
          <Text style={styles.rowMeta} numberOfLines={1} {...textScale.dense}>
            Kayıtlı maçı yok
          </Text>
        ) : null}
      </View>

      {/* Piyasa değeri sözleşme rozetinin YERİNE geçmez, üstüne biner:
          rozet oyuncunun kulüple bağını, değer piyasadaki karşılığını söyler.
          Değer yoksa (henüz hesaplanmamış oyuncu) sütun hiç çizilmez ve
          rozet eski yerinde kalır. */}
      {marketValue != null ? (
        <View style={styles.marketBox}>
          <Text style={styles.marketValue} numberOfLines={1} {...textScale.badge}>
            {formatEtlShort(marketValue)}
          </Text>
          {marketChange ? (
            <Text
              style={[
                styles.marketChange,
                { color: marketChange > 0 ? colors.win : colors.loss },
              ]}
              numberOfLines={1}
              {...textScale.badge}
            >
              {marketChange > 0 ? "▲" : "▼"} {formatEtlShort(Math.abs(marketChange))}
            </Text>
          ) : null}
        </View>
      ) : null}

      {/* Renk sinyaldir (Arena §1): sözleşmeli olmak NORMAL hâldir ve rozet
          taşımaz; yalnız eksik olan işaretlenir. On altı yeşil rozetin
          arasında iki turuncu kayboluyordu. */}
      {marked ? <Badge label="ÇIKAR" tone="danger" size="xs" /> : null}
      {player.has_active_contract ? null : (
        <View style={styles.flag} accessibilityLabel="Sözleşmesiz">
          <Ionicons name="document-text" size={11} color={colors.warn} />
        </View>
      )}

      <Ionicons name="chevron-forward" size={13} color={colors.textTertiary} />

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
  marked,
  history,
  teamId,
  locked,
  jerseyOwners,
  onClose,
  onOpenProfile,
}: {
  player: RosterPlayer;
  /** Oyuncu yönetime gidecek listede "çıkarılacak" işaretli mi. */
  marked: boolean;
  /** Tüm takımlardaki maç geçmişi (son 5 maç). */
  history: PlayerHistory | null;
  teamId: number | null;
  /** Liste yönetimde inceleniyorsa işaret değiştirilemez. */
  locked: boolean;
  /** Forma numarası → sahibi; aynı numarayı iki oyuncuya vermeyi önceden uyarır. */
  jerseyOwners: Map<number, { id: number; name: string }>;
  onClose: () => void;
  onOpenProfile: (playerId: number) => void;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();

  const [jersey, setJersey] = useState<number>(player.jersey_number ?? NO_JERSEY);
  const [position, setPosition] = useState<string | null>(player.team_position);
  const [role, setRole] = useState<SquadRole>(player.squad_role);

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["takim", "roster"] });
    void queryClient.invalidateQueries({ queryKey: ["takim", "dashboard"] });
    void queryClient.invalidateQueries({ queryKey: ["takim", "squad-list"] });
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

  /* Kadrodan çıkarma yönetim onaylıdır: oyuncu yalnız "çıkarılacak" olarak
     işaretlenir; liste yönetime gönderildiğinde yönetim karar verir. */
  const removalMutation = useMutation({
    mutationFn: () => (marked ? unmarkSquadRemoval(player.id) : markSquadRemoval(player.id)),
    onSuccess: (result) => {
      invalidate();
      toast.show({ message: result.message, tone: "success" });
      onClose();
    },
    onError: (error: unknown) => {
      toast.show({
        message: error instanceof ApiError ? error.message || error.userMessage : "İşlem yapılamadı.",
        tone: "danger",
      });
    },
  });

  const confirmRemoval = useCallback(() => {
    if (marked) {
      removalMutation.mutate();
      return;
    }
    Alert.alert(
      "Takımdan çıkar",
      `${player.player_name} takımdan çıkarılacaklar listesine alınacak. Oyuncu hemen çıkarılmaz: listeyi yönetime gönderdiğinde yönetim onaylarsa kadrodan çıkar` +
        (player.has_active_contract ? " ve aktif sözleşmesi feshedilir." : "."),
      [
        { text: "Vazgeç", style: "cancel" },
        { text: "Çıkarılacaklara ekle", style: "destructive", onPress: () => removalMutation.mutate() },
      ]
    );
  }, [marked, player.has_active_contract, player.player_name, removalMutation]);

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

  const busy = saveMutation.isPending || removalMutation.isPending;

  /** Seçilen numara kadroda başka birinde mi? Sunucu engellemiyor; maç
      kadrosunda "forma numaraları benzersiz" kuralına takılmadan uyarılır. */
  const owner = jersey !== NO_JERSEY ? jerseyOwners.get(jersey) : undefined;
  const clash = owner && owner.id !== player.id ? owner : null;

  return (
    <BottomSheet
      visible
      onClose={onClose}
      title={player.player_name}
      snap="content"
      footer={
        <View style={styles.sheetFooter}>
          <Button
            label={marked ? "Çıkarmayı geri al" : "Takımdan çıkar"}
            variant={marked ? "secondary" : "danger"}
            icon={marked ? "arrow-undo-outline" : "person-remove-outline"}
            onPress={confirmRemoval}
            loading={removalMutation.isPending}
            disabled={busy || locked}
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
            <Badge label="SÖZLEŞMESİZ" tone="warn" size="xs" />
          )}
        </View>
        <View style={styles.sheetLinks}>
          <Button
            label="Oyuncu profili"
            icon="person-outline"
            size="sm"
            variant="secondary"
            onPress={() => onOpenProfile(player.id)}
          />
          {player.has_linked_account ? null : (
            <Text style={styles.fieldHint} {...textScale.dense}>
              Panel hesabı yok — yoklama ve bildirim alamaz.
            </Text>
          )}
        </View>

        {/* Son 5 maç — başka takımda oynananlar dahil */}
        {history ? (
          <>
            <Text style={styles.fieldLabel} {...textScale.badge}>
              {upperTR("Son 5 maç")}
            </Text>
            <Text style={styles.fieldHint} {...textScale.dense}>
              {history.matches
                ? `Tüm takımlarda ${history.matches} maç (${history.team_matches} bu takımda) · son maç ${shortDate(history.last_match_date)}${daysAgo(history.last_match_date) ? `, ${daysAgo(history.last_match_date)}` : ""}`
                : "Henüz maç kaydı yok."}
            </Text>
            <LastMatchesList matches={history.last_matches} teamId={teamId} />
          </>
        ) : null}

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
          <Text style={[styles.fieldHint, clash ? styles.fieldWarn : null]} {...textScale.dense}>
            {jersey === NO_JERSEY
              ? "Numarasız"
              : clash
                ? `${jersey} numara ${clash.name} oyuncusunda`
                : `${jersey} numaralı forma`}
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
  submitCard: {
    marginTop: space.lg,
    padding: space.lg,
    gap: space.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  submitTitle: { ...type.h3, color: colors.textPrimary },
  submitMeta: { ...type.bodySm, color: colors.textSecondary },
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
    paddingBottom: 120,
    gap: space.md,
  },
  flex: {
    flex: 1,
  },
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
  barTexts: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  barTitle: {
    ...type.h3,
    color: colors.textPrimary,
  },
  barMeta: {
    ...type.caption,
    color: colors.textTertiary,
  },
  barDirty: {
    color: colors.warn,
  },
  lineupHint: {
    ...type.caption,
    color: colors.textTertiary,
  },

  /* Piyasa değeri sütunu */
  marketBox: {
    alignItems: "flex-end",
    minWidth: 48,
  },
  marketValue: {
    ...type.tableNumStrong,
    color: colors.accentText,
  },
  marketChange: {
    ...type.micro,
    letterSpacing: 0,
  },


  /* Özet */
  summary: {
    paddingTop: space.md,
    paddingBottom: space.xs,
    gap: space.md,
  },

  /* Kadro satırı — ListRow ölçüleriyle birebir. */
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.m,
    minHeight: 50,
    paddingHorizontal: space.md,
    paddingVertical: space.s,
    backgroundColor: colors.surface1,
  },
  flag: {
    width: 20,
    height: 20,
    borderRadius: radius.pill,
    backgroundColor: colors.warnDim,
    alignItems: "center",
    justifyContent: "center",
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
    left: space.md + 22 + space.m,
    right: 0,
    bottom: 0,
    height: hairline,
    backgroundColor: colors.separator,
  },
  jersey: {
    ...type.caption,
    fontFamily: fonts.bold,
    color: colors.brandAccent,
    width: 22,
    textAlign: "center",
  },
  rowTexts: {
    flex: 1,
    gap: 2,
  },
  rowName: {
    ...type.h4,
    color: colors.textPrimary,
  },
  rowMeta: {
    ...type.caption,
    color: colors.textTertiary,
  },
  historyLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.s,
    marginTop: 2,
  },
  historyText: {
    ...type.caption,
    color: colors.textSecondary,
    flexShrink: 1,
  },
  historyWarn: {
    color: colors.warn,
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
  sheetLinks: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
  },
  fieldWarn: {
    color: colors.warn,
  },
  flush: {
    marginHorizontal: 0,
  },
  flushHeader: {
    paddingHorizontal: 0,
  },
  listBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
  },
  listCount: {
    ...type.label,
    color: colors.textSecondary,
  },
  sheetFooter: {
    flexDirection: "row",
    gap: space.sm,
  },
  footerButton: {
    flex: 1,
  },
});
