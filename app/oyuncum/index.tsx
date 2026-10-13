/**
 * OYUNCUM — girişli üyenin KENDİ oyuncu profili.
 * `/oyuncum?tab=<ozet|maclarim|istatistik|sozlesme>`
 *
 * NE: bugüne kadar üyenin kendi oyuncu verisi üç ayrı ekrana dağılmıştı —
 * `(tabs)/profile.tsx` (panel özeti), `maclarim.tsx` (maç merkezi + yoklama),
 * `sozlesmelerim.tsx` (sözleşme listesi). Üçü de aynı kişinin aynı sorusunun
 * parçalarıydı: "benim durumum ne?". Burada tek çatı altında toplanır.
 *
 * NEDEN AYRI EKRAN (herkese açık `/oyuncu/[id]` yerine): herkese açık profil
 * yalnız yayınlanmış istatistiği gösterir; burada üyenin YALNIZ KENDİSİNİN
 * görebileceği şeyler var — bekleyen değişiklik talepleri, müsaitlik yoklaması,
 * sözleşme durumu. İkisi ayrı yetki dünyaları; ayrı ekranlar.
 *
 * ARENA DÜZENİ: herkese açık profille AYNI kimlik sahnesi (PlayerHero —
 * fotoğraf, mevki, kulüp hapı, bu sezonun sayıları); başlıkta "OYUNCU
 * PROFİLİM" etiketi ve iki eylem (herkese açık profilim, düzenle). Kâğıtta
 * merkez kalıbı (Arena §5): bekleyen işler → kulüp → sezon ayrıntısı → son
 * maçlar → kapı ızgarası. Maç ve istatistik satırları herkese açık profille
 * aynı bileşenlerdir (components/playerpage) — üye kendi sayfasını
 * başkalarının gördüğü dille görür.
 *
 * VERİ KAYNAKLARI (hepsi oturum gerektirir):
 *   GET  /api/panel/me                       profil + sezon özeti + talepler
 *   GET  /api/panel/me/statistics?scope=player   lig/sezon filtreli ayrıntı
 *   GET  /api/match-center/matches           yaklaşan/oynanan maçlar (+in_squad)
 *   GET/POST /api/match-availability/…       müsaitlik yoklaması
 *   GET  /api/contracts?scope=player         sözleşmeler
 *
 * ÖNBELLEK ORTAKLIĞI: `["panel","me"]`, `["panel","my-matches"]`,
 * `["panel","contracts"]` ve `["takim","availability-mine",id]` anahtarları
 * mevcut ekranlarla BİREBİR aynıdır; iki ekran arasında geçişte ikinci istek
 * atılmaz ve yoklama seçimi her yerde aynı anda güncellenir.
 *
 * GİRİŞ YOKSA `/giris`'e yönlendirilir. Oyuncu profili bağlı değilse
 * (sunucu 403 PLAYER_PROFILE_REQUIRED / `player: null`) boş durum çizilir ve
 * bağlama akışı için elitlig.com'a çıkılır — mobilde profil bağlama yok.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Badge,
  Chip,
  ChipGroup,
  EmptyState,
  ErrorState,
  HubGrid,
  HubTile,
  ListRow,
  ScreenHeader,
  SectionHeader,
  SegmentedControl,
  SkeletonCard,
  SkeletonListRow,
  SkeletonTable,
  Tabs,
  TeamLogo,
  Touchable,
  useHeaderScroll,
  useRefresh,
  useToast,
  withAlpha,
  type FormResult,
  type SegmentedItem,
  type TabItem,
  type Tone,
} from "@/components/ui";
import {
  BarList,
  DateBlock,
  MatchLogRow,
  PlayerHero,
  StatList,
  StatTable,
  StatTiles,
  WinBalance,
  dateWithYear,
  decimalTR,
  surfaces,
  type HeroFact,
  type StatRow,
  type StatTile,
} from "@/components/playerpage";
import {
  getMyContracts,
  getMyMatches,
  getPanelMe,
  type Contract,
  type MyMatch,
  type PanelPendingChange,
  type PanelRecentMatch,
} from "@/lib/api/panel";
import {
  AVAILABILITY_LABELS,
  getMyAvailability,
  setMyAvailability,
  type AvailabilityStatus,
} from "@/lib/api/team";
import { formatDateShort, formatTime, mediaUrl } from "@/lib/format";
import { ApiError, get } from "@/lib/http";
import { openLink } from "@/lib/links";
import { useAuth } from "@/providers/AuthProvider";
import {
  colors,
  hairline,
  layout,
  radius,
  space,
  textScale,
  type,
  upperTR,
} from "@/theme";

/* ══════════════════════════════════════════════════════════════════════════
   1) EKRANA ÖZGÜ UÇ: /api/panel/me/statistics

   `lib/api/panel.ts` bu ekranın sorumluluğunda değil; ayrıntılı istatistik ucu
   yalnız burada kullanıldığı için tanımı ekranla birlikte yaşar
   (sunucu karşılığı: services/panelDetailedStats.js → playerStatistics).
   ══════════════════════════════════════════════════════════════════════════ */

/** Gerçekten maç yapılmış lig+sezon kombinasyonu — filtre seçenekleri. */
interface StatCombo {
  league_id: number | null;
  league_name: string | null;
  season_id: number | null;
  season_name: string | null;
  matches: number;
  last_date: string | null;
}

interface StatTotals {
  matches: number;
  starts: number;
  sub_ins: number;
  captain: number;
  goals: number;
  assists: number;
  contributions: number;
  yellow_cards: number;
  red_cards: number;
  fouls: number;
  saves: number;
  chances_created: number;
  critical_blocks: number;
  aerials_won: number;
  duels_won: number;
  rating: number | null;
  best_rating: number | null;
  wins: number;
  draws: number;
  losses: number;
}

interface StatGoalTypes {
  penalty: number;
  free_kick: number;
  header: number;
  right_foot: number;
  left_foot: number;
  long_range: number;
}

interface StatPerMatch {
  goals: number;
  assists: number;
  contributions: number;
  start_ratio: number;
}

interface StatBreakdownRow {
  league_id: number | null;
  league_name: string | null;
  season_id: number | null;
  season_name: string | null;
  matches: number;
  starts: number;
  goals: number;
  assists: number;
  contributions: number;
  yellow_cards: number;
  red_cards: number;
  rating: number | null;
  last_date: string | null;
}

interface StatMatchLogRow {
  match_id: number;
  date: string | null;
  league_name: string | null;
  season_name: string | null;
  opponent: string | null;
  is_home: boolean;
  score: string;
  result: FormResult;
  goals: number;
  assists: number;
  yellow_cards: number;
  red_cards: number;
  rating: number | null;
  started: boolean;
  captain: boolean;
}

interface PlayerStatisticsResponse {
  scope: "player";
  /** Üyeye bağlı bir oyuncu kaydı yoksa yalnız bu iki alan döner. */
  linked: boolean;
  detailed_source?: boolean;
  filters?: { combos: StatCombo[] };
  selection?: {
    season_id: number | null;
    league_id: number | null;
    season_name: string | null;
    league_name: string | null;
  };
  totals?: StatTotals;
  goal_types?: StatGoalTypes;
  per_match?: StatPerMatch;
  breakdown?: StatBreakdownRow[];
  match_log?: StatMatchLogRow[];
}

const getMyStatistics = (leagueId: number | null, seasonId: number | null) =>
  get<PlayerStatisticsResponse>("/api/panel/me/statistics", {
    scope: "player",
    league_id: leagueId ?? undefined,
    season_id: seasonId ?? undefined,
  });

/* Mevcut ekranlarla ORTAK önbellek anahtarları — bkz. dosya başlığı. */
const key = {
  me: () => ["panel", "me"] as const,
  myMatches: () => ["panel", "my-matches"] as const,
  contracts: () => ["panel", "contracts"] as const,
  statistics: (leagueId: number | null, seasonId: number | null) =>
    ["panel", "me-statistics", leagueId, seasonId] as const,
  availability: (matchId: number) => ["takim", "availability-mine", matchId] as const,
};

/* ══════════════════════════════════════════════════════════════════════════
   2) SEGMENTLER VE ROTA PARAMETRELERİ
   ══════════════════════════════════════════════════════════════════════════ */

type MyTab = "ozet" | "maclarim" | "istatistik" | "sozlesme";

const TAB_ITEMS: TabItem<MyTab>[] = [
  { key: "ozet", label: "Özet" },
  { key: "maclarim", label: "Maçlarım" },
  { key: "istatistik", label: "İstatistik" },
  { key: "sozlesme", label: "Sözleşmem" },
];

const TAB_KEYS = TAB_ITEMS.map((item) => item.key);

/** Maçlarım içindeki alt görünüm — o da rotada taşınır (`?durum=`). */
type MatchFilter = "yaklasan" | "oynanan";

/** Türkçe I/İ katlanması olmadan rota anahtarı eşleşmez (bkz. ligler.tsx). */
function normalizeKey(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.trim().replace(/[İIı]/g, "i").toLowerCase();
}

const TAB_ALIASES: Record<string, MyTab> = {
  genel: "ozet",
  overview: "ozet",
  maclar: "maclarim",
  matches: "maclarim",
  stats: "istatistik",
  istatistikler: "istatistik",
  sozlesmem: "sozlesme",
  contract: "sozlesme",
  sozlesmeler: "sozlesme",
};

function resolveTab(raw: unknown): MyTab {
  const normalized = normalizeKey(raw);
  if ((TAB_KEYS as string[]).includes(normalized)) return normalized as MyTab;
  return TAB_ALIASES[normalized] ?? "ozet";
}

function resolveMatchFilter(raw: unknown): MatchFilter {
  return normalizeKey(raw) === "oynanan" ? "oynanan" : "yaklasan";
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/* ══════════════════════════════════════════════════════════════════════════
   3) SAF YARDIMCILAR
   ══════════════════════════════════════════════════════════════════════════ */

/** Web sitesi — oyuncu profili bağlama akışı orada yaşıyor. */
const SITE_URL = "https://elitlig.com";

/** ACTIVE ve PENDING_ACTIVATION birlikte "yürürlükte" sayılır. */
const ACTIVE_CONTRACT_STATUSES = new Set(["ACTIVE", "PENDING_ACTIVATION"]);

const CONTRACT_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Aktif",
  PENDING_ACTIVATION: "Aktivasyon bekliyor",
  EXPIRED: "Süresi doldu",
  TERMINATED: "Feshedildi",
};

const num = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

function changeStatusTone(status: string): Tone {
  if (status === "approved") return "win";
  if (status === "rejected") return "danger";
  return "warn";
}

function changeStatusLabel(status: string): string {
  if (status === "approved") return "ONAYLANDI";
  if (status === "rejected") return "REDDEDİLDİ";
  if (status === "pending") return "BEKLİYOR";
  return upperTR(status);
}

function rowPosition(index: number, total: number): "single" | "first" | "middle" | "last" {
  if (total === 1) return "single";
  if (index === 0) return "first";
  if (index === total - 1) return "last";
  return "middle";
}

/** Bir lig+sezon kombinasyonunun okunur etiketi. */
function comboLabel(combo: StatCombo): string {
  const parts = [combo.league_name, combo.season_name].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Bilinmeyen dönem";
}

const comboKey = (combo: StatCombo) => `${combo.league_id ?? "x"}-${combo.season_id ?? "x"}`;

/** Sunucunun kimlik hatası mı? (profil bağlı değil / panel yetkisi yok) */
function isProfileMissing(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  if (error.status !== 403 && error.status !== 404) return false;
  const code = String(error.code ?? "");
  return (
    code.includes("PLAYER_PROFILE") ||
    code.includes("PLAYER_NOT_FOUND") ||
    code.includes("PANEL_FORBIDDEN") ||
    String(error.message).includes("PLAYER_PROFILE")
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   4) EKRAN KABUĞU
   ══════════════════════════════════════════════════════════════════════════ */

export default function MyPlayerScreen() {
  const auth = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string; durum?: string }>();
  const { scrollY, scrollProps } = useHeaderScroll();

  const [tab, setTab] = useState<MyTab>(() => resolveTab(firstParam(params.tab)));

  const routeTab = resolveTab(firstParam(params.tab));
  useEffect(() => {
    setTab(routeTab);
    scrollY.setValue(0);
  }, [routeTab, scrollY]);

  const changeTab = useCallback(
    (next: MyTab) => {
      setTab(next);
      scrollY.setValue(0);
      router.setParams({ tab: next });
    },
    [router, scrollY],
  );

  const meQuery = useQuery({
    queryKey: key.me(),
    queryFn: getPanelMe,
    enabled: Boolean(auth.user),
    staleTime: 60_000,
    retry: false,
  });

  const me = meQuery.data;
  const player = me?.player ?? null;
  const playerTeam = me?.playerTeam ?? me?.team ?? null;
  const stats = me?.stats ?? null;

  const openPublicProfile = useCallback(() => {
    if (player?.id) router.push(`/oyuncu/${player.id}`);
  }, [player?.id, router]);

  const openTeam = useCallback(() => {
    if (player?.team_id) router.push(`/takim/${player.team_id}`);
  }, [player?.team_id, router]);

  /* NOT: profil düzenleme + fotoğraf talebi bugün `/hesabim` içinde yaşıyor.
     `app/oyuncum/duzenle.tsx` eklendiğinde hedef oraya çevrilir; şu an olmayan
     bir rotaya bağlanıp ölü bağlantı bırakmıyoruz. */
  const openEdit = useCallback(() => router.push("/hesabim"), [router]);

  const actions = useMemo(
    () =>
      player
        ? [
            {
              icon: "eye-outline" as const,
              onPress: openPublicProfile,
              accessibilityLabel: "Herkese açık profilimi gör",
            },
            {
              icon: "create-outline" as const,
              onPress: openEdit,
              accessibilityLabel: "Oyuncu profilimi düzenle",
            },
          ]
        : undefined,
    [openEdit, openPublicProfile, player],
  );

  /*
   * KİMLİK SAHNESİ — herkese açık profille aynı bileşen. Sayı şeridi BU
   * SEZONUN rakamlarıdır (panel özeti `stats`); sezon adı künyede yazar ki
   * "79 maç" ile "bu sezon 12 maç" karışmasın.
   */
  const hero = useMemo(() => {
    if (!player) return null;
    const facts: HeroFact[] = stats
      ? [
          { key: "matches", value: String(num(stats.matches)), label: "MAÇ" },
          { key: "goals", value: String(num(stats.goals)), label: "GOL" },
          { key: "assists", value: String(num(stats.assists)), label: "ASİST" },
          ...(stats.rating != null
            ? [{ key: "rating", value: stats.rating.toFixed(1), label: "ORT. PUAN", rating: stats.rating }]
            : []),
        ]
      : [];
    return (
      <PlayerHero
        name={player.player_name || "Oyuncu"}
        image={player.player_img}
        position={player.player_position}
        teamName={playerTeam?.team_name ?? null}
        teamLogo={mediaUrl(playerTeam?.logo ?? null)}
        onOpenTeam={player.team_id ? openTeam : undefined}
        details={[player.city, stats?.season ? `Sezon: ${stats.season}` : null]}
        badges={!player.active ? <Badge label="PASİF" tone="neutral" size="xs" /> : null}
        facts={facts}
      />
    );
  }, [player, playerTeam, stats, openTeam]);

  /* — Kapılar — */

  if (auth.initializing) {
    return (
      <SafeAreaView style={styles.screen} edges={["top"]}>
        <ScreenHeader title="Oyuncu Profilim" back />
        <View style={styles.loadingBody}>
          <SkeletonCard lines={3} />
        </View>
      </SafeAreaView>
    );
  }

  if (!auth.user) {
    return <Redirect href="/giris" />;
  }

  if (meQuery.isLoading) {
    return (
      <SafeAreaView style={styles.screen} edges={["top"]}>
        <ScreenHeader title="Oyuncu Profilim" back />
        <View style={styles.loadingBody}>
          <SkeletonCard lines={3} />
          <SkeletonListRow count={5} />
        </View>
      </SafeAreaView>
    );
  }

  /* Profil bağlı değil: sunucu ya 403 döndürür ya da player alanı boş gelir. */
  if (meQuery.isError ? isProfileMissing(meQuery.error) : !player) {
    return (
      <SafeAreaView style={styles.screen} edges={["top"]}>
        <ScreenHeader title="Oyuncu Profilim" back />
        <EmptyState
          icon="person-add-outline"
          title="Oyuncu profilin bağlı değil"
          body={
            "Bu ekran hesabına bağlı bir oyuncu kaydı ister. Bağlama işlemi şimdilik " +
            "elitlig.com panelinden yapılıyor; bağlandıktan sonra maçların, " +
            "istatistiklerin ve sözleşmen burada görünür."
          }
          action={{ label: "elitlig.com'a git", onPress: () => openLink(SITE_URL) }}
          secondaryAction={{ label: "Hesap ve güvenlik", onPress: () => router.push("/hesabim") }}
        />
      </SafeAreaView>
    );
  }

  if (meQuery.isError || !me || !player) {
    return (
      <SafeAreaView style={styles.screen} edges={["top"]}>
        <ScreenHeader title="Oyuncu Profilim" back />
        <ErrorState error={meQuery.error} onRetry={meQuery.refetch} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader
        title={player.player_name}
        overline="OYUNCU PROFİLİM"
        back
        actions={actions}
        scrollY={scrollY}
        hero={hero}
        tabs={<Tabs items={TAB_ITEMS} value={tab} onChange={changeTab} sticky />}
      />

      {tab === "ozet" ? (
        <SummaryTab
          teamName={playerTeam?.team_name ?? null}
          teamLogo={playerTeam?.logo ?? null}
          teamId={player.team_id}
          league={playerTeam?.current_league ?? null}
          season={playerTeam?.current_season ?? null}
          stats={stats}
          recentMatches={me.recentMatches}
          pendingChanges={me.pendingChanges}
          onOpenTab={changeTab}
          refetch={meQuery.refetch}
          isRefetching={meQuery.isRefetching}
          scrollProps={scrollProps}
        />
      ) : tab === "maclarim" ? (
        <MyMatchesTab
          filter={resolveMatchFilter(firstParam(params.durum))}
          scrollProps={scrollProps}
        />
      ) : tab === "istatistik" ? (
        <StatisticsTab scrollProps={scrollProps} />
      ) : (
        <ContractTab scrollProps={scrollProps} />
      )}
    </SafeAreaView>
  );
}

/** Her segmentin listesine geçen ortak kaydırma bağlantısı. */
interface ScrollChrome {
  onScroll: (
    event: Parameters<ReturnType<typeof useHeaderScroll>["scrollProps"]["onScroll"]>[0],
  ) => void;
  scrollEventThrottle: number;
}

/* ══════════════════════════════════════════════════════════════════════════
   5) ÖZET — bekleyen işler, kulüp, sezon ayrıntısı, son maçlar, kapılar
   ══════════════════════════════════════════════════════════════════════════ */

interface SummaryTabProps {
  teamName: string | null;
  teamLogo: string | null;
  teamId: number | null;
  league: string | null;
  season: string | null;
  stats: {
    matches: number;
    goals: number;
    assists: number;
    yellow_cards: number;
    red_cards: number;
    rating: number | null;
    starts: number;
    season?: string | null;
  } | null;
  recentMatches: PanelRecentMatch[];
  pendingChanges: PanelPendingChange[];
  onOpenTab: (tab: MyTab) => void;
  refetch: () => unknown;
  isRefetching: boolean;
  scrollProps: ScrollChrome;
}

function SummaryTab({
  teamName,
  teamLogo,
  teamId,
  league,
  season,
  stats,
  recentMatches,
  pendingChanges,
  onOpenTab,
  refetch,
  isRefetching,
  scrollProps,
}: SummaryTabProps) {
  const router = useRouter();
  const refresh = useRefresh(refetch, { refreshing: isRefetching });

  const openTeam = useCallback(() => {
    if (teamId) router.push(`/takim/${teamId}`);
  }, [router, teamId]);

  const pending = pendingChanges.filter((change) => change.status === "pending");
  /* Önce bekleyenler: merkez kalıbında bekleyen iş kimliğin hemen altındadır. */
  const sortedChanges = useMemo(
    () =>
      [...pendingChanges]
        .sort((a, b) => Number(b.status === "pending") - Number(a.status === "pending"))
        .slice(0, 6),
    [pendingChanges],
  );

  /* Sezon ayrıntısı — kimlikte olmayan sayılar (ilk 11, kartlar). */
  const seasonTiles: StatTile[] = useMemo(() => {
    if (!stats) return [];
    const matches = num(stats.matches);
    return [
      {
        key: "starts",
        value: String(num(stats.starts)),
        label: "İLK 11",
        hint: matches > 0 ? `%${Math.round((num(stats.starts) / matches) * 100)}` : undefined,
      },
      {
        key: "ga",
        value: String(num(stats.goals) + num(stats.assists)),
        label: "GOL + ASİST",
        hint: matches > 0 ? `${decimalTR((num(stats.goals) + num(stats.assists)) / matches, 2)} / maç` : undefined,
      },
      {
        key: "cards",
        value: `${num(stats.yellow_cards)}·${num(stats.red_cards)}`,
        label: "SARI · KIRMIZI",
      },
    ];
  }, [stats]);

  return (
    <ScrollView {...scrollProps} contentContainerStyle={styles.content} refreshControl={refresh.control}>
      {/* ————— Bekleyen talepler ————— */}
      {sortedChanges.length ? (
        <>
          <SectionHeader
            style={styles.flushHeader}
            title="Değişiklik taleplerim"
            meta={pending.length ? `${pending.length} bekliyor` : undefined}
            action={{ label: "Hesabım", onPress: () => router.push("/hesabim") }}
          />
          <View>
            {sortedChanges.map((change, index, list) => (
              <ListRow
                key={change.id}
                leading={{ icon: "document-attach", tone: changeStatusTone(change.status) }}
                title={change.type === "player_update" ? "Oyuncu bilgisi" : change.type}
                subtitle={change.created_at ? formatDateShort(change.created_at) : undefined}
                badge={
                  <Badge
                    label={changeStatusLabel(change.status)}
                    tone={changeStatusTone(change.status)}
                    size="xs"
                  />
                }
                chevron={false}
                position={rowPosition(index, list.length)}
              />
            ))}
          </View>
        </>
      ) : null}

      {/* ————— Kulübüm ————— */}
      {teamName ? (
        <Touchable
          feedback="card"
          haptic="selection"
          onPress={openTeam}
          accessibilityRole="button"
          accessibilityLabel={`${teamName} takım sayfası`}
          style={[surfaces.cardPadded, styles.teamCard]}
        >
          <TeamLogo name={teamName} logo={mediaUrl(teamLogo)} size={layout.crestXl} />
          <View style={styles.teamBody}>
            <Text style={styles.overline} {...textScale.badge}>
              KULÜBÜM
            </Text>
            <Text style={styles.teamName} numberOfLines={1} {...textScale.dense}>
              {teamName}
            </Text>
            {league || season ? (
              <Text style={styles.teamMeta} numberOfLines={1} {...textScale.dense}>
                {[league, season].filter(Boolean).join(" · ")}
              </Text>
            ) : null}
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
        </Touchable>
      ) : (
        <EmptyState
          icon="shield-outline"
          title="Kulübün yok"
          body="Bir takıma katıldığında kulüp bilgin burada görünür."
          variant="inline"
          compact
          action={{ label: "Takım davetlerim", onPress: () => router.push("/davetler") }}
        />
      )}

      {/* ————— Sezon ayrıntısı ————— */}
      {seasonTiles.length ? (
        <>
          <SectionHeader
            style={styles.flushHeader}
            title="Sezonum"
            meta={stats?.season ? String(stats.season) : undefined}
            action={{ label: "Ayrıntı", onPress: () => onOpenTab("istatistik") }}
          />
          <StatTiles tiles={seasonTiles} />
        </>
      ) : null}

      {/* ————— Son maçlar ————— */}
      <SectionHeader
        style={styles.flushHeader}
        title="Son maçlarım"
        action={recentMatches.length ? { label: "Tümü", onPress: () => onOpenTab("maclarim") } : undefined}
      />
      {recentMatches.length ? (
        <View style={surfaces.card}>
          {recentMatches.slice(0, 5).map((match, index) => (
            <RecentMatchRow
              key={match.id}
              match={match}
              divider={index > 0}
              onPress={() => router.push(`/mac/${match.id}`)}
            />
          ))}
        </View>
      ) : (
        <EmptyState
          icon="football-outline"
          title="Henüz maçın yok"
          body="Takımın yayınlanmış bir maç oynadığında burada görünür."
          variant="inline"
          compact
        />
      )}

      {/* ————— Kapılar ————— */}
      <SectionHeader style={styles.flushHeader} title="Kariyerim" />
      {/*
       * TEKLİFLER · DAVETLER · DİSİPLİN · MESAJLAR BURADA YOK: dördü de Profil
       * sekmesinde ("Kariyerim" ve "Kulübüm" bölümleri) aynı başlıklarla
       * duruyor; bu ekran onların ikinci kopyası olmaz. Burada yalnız BU
       * EKRANIN kendi sekmeleri ve düzenleme kalır (herkese açık profil
       * başlıktaki göz ikonundadır).
       */}
      <HubGrid style={styles.flushGrid}>
        <HubTile icon="calendar" title="Maçlarım" subtitle="Fikstür ve yoklama" tone="brand" onPress={() => onOpenTab("maclarim")} />
        <HubTile icon="stats-chart" title="İstatistiklerim" subtitle="Lig ve sezon kırılımı" tone="accent" onPress={() => onOpenTab("istatistik")} />
        <HubTile icon="document-text" title="Sözleşmem" subtitle="Yürürlükteki sözleşmen" tone="info" onPress={() => onOpenTab("sozlesme")} />
        <HubTile icon="create" title="Profilimi düzenle" subtitle="Bilgi ve fotoğraf talebi" tone="neutral" onPress={() => router.push("/hesabim")} />
      </HubGrid>
    </ScrollView>
  );
}

/**
 * Son maç satırı — panel özeti takımların adını ve skoru verir, oyuncunun
 * hangi tarafta olduğunu vermez; bu yüzden sonuç rengi UYDURULMAZ. Satır iki
 * takımı alt alta, skorları sağda hizalı yazar (skor listesi kalıbı); kazanan
 * taraf kalın, kaybeden sönük.
 */
const RecentMatchRow = React.memo(function RecentMatchRow({
  match,
  divider,
  onPress,
}: {
  match: PanelRecentMatch;
  divider: boolean;
  onPress: () => void;
}) {
  const hasScore = match.home_score != null && match.away_score != null;
  const homeWon = hasScore && Number(match.home_score) > Number(match.away_score);
  const awayWon = hasScore && Number(match.away_score) > Number(match.home_score);

  return (
    <Touchable
      feedback="row"
      haptic="selection"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${match.home_team} ${match.home_score ?? ""}, ${match.away_team} ${match.away_score ?? ""}`}
      style={[styles.recentRow, divider && styles.rowDivider]}
    >
      <DateBlock date={match.date} />
      <View style={styles.recentTeams}>
        <View style={styles.recentLine}>
          <Text style={[styles.recentTeam, awayWon && styles.recentLoser]} numberOfLines={1} {...textScale.dense}>
            {match.home_team}
          </Text>
          <Text style={[styles.recentScore, awayWon && styles.recentLoser]} {...textScale.dense}>
            {match.home_score ?? "–"}
          </Text>
        </View>
        <View style={styles.recentLine}>
          <Text style={[styles.recentTeam, homeWon && styles.recentLoser]} numberOfLines={1} {...textScale.dense}>
            {match.away_team}
          </Text>
          <Text style={[styles.recentScore, homeWon && styles.recentLoser]} {...textScale.dense}>
            {match.away_score ?? "–"}
          </Text>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={14} color={colors.textTertiary} />
    </Touchable>
  );
});

/* ══════════════════════════════════════════════════════════════════════════
   6) MAÇLARIM — maç merkezi + müsaitlik yoklaması

   MANTIK `app/maclarim.tsx` DOSYASINDAN AYNEN TAŞINDI:
   upcoming/past ayrımını sunucu yapar (saate değil maç durumuna bakar),
   `in_squad` kadroda olup olmadığını söyler, yoklama seçimi iyimser
   güncellenir ve sunucu reddederse eski seçim geri gelir. Değişen yalnız
   sunum katmanı.
   ══════════════════════════════════════════════════════════════════════════ */

/** Satır yüksekliği sabit değil (yoklama satırı ekleniyor); getItemLayout yok. */
function MyMatchesTab({
  filter,
  scrollProps,
}: {
  filter: MatchFilter;
  scrollProps: ScrollChrome;
}) {
  const router = useRouter();

  const query = useQuery({
    queryKey: key.myMatches(),
    queryFn: getMyMatches,
    staleTime: 60_000,
    retry: false,
  });

  const refresh = useRefresh(query.refetch, { refreshing: query.isRefetching });

  const changeFilter = useCallback(
    (next: MatchFilter) => router.setParams({ tab: "maclarim", durum: next }),
    [router],
  );

  const past = filter === "oynanan";
  const rows = past ? query.data?.past ?? [] : query.data?.upcoming ?? [];

  const renderItem = useCallback(
    ({ item }: { item: MyMatch }) => (
      <MyMatchCard match={item} past={past} onPress={() => router.push(`/mac/${item.id}`)} />
    ),
    [past, router],
  );

  const keyExtractor = useCallback((item: MyMatch) => String(item.id), []);

  /* Segment etiketinde sayılar: hangi tarafta kaç maç olduğu seçmeden görünür. */
  const filters: SegmentedItem<MatchFilter>[] = useMemo(() => {
    const upcoming = query.data?.upcoming?.length;
    const played = query.data?.past?.length;
    return [
      { key: "yaklasan", label: upcoming ? `Yaklaşan · ${upcoming}` : "Yaklaşan" },
      { key: "oynanan", label: played ? `Oynanan · ${played}` : "Oynanan" },
    ];
  }, [query.data]);

  const header = useMemo(
    () => (
      <View style={styles.filterBar}>
        <SegmentedControl items={filters} value={filter} onChange={changeFilter} />
      </View>
    ),
    [changeFilter, filter, filters],
  );

  if (query.isLoading) {
    return (
      <View style={styles.loadingBody}>
        <SkeletonListRow count={6} avatar={false} />
      </View>
    );
  }

  if (query.isError) {
    return isProfileMissing(query.error) ? (
      <EmptyState
        icon="person-add-outline"
        title="Oyuncu profili gerekli"
        body="Maçlarım için hesabına bağlı bir oyuncu profili olmalı. Profil bağlama şimdilik web panelinden yapılıyor."
        action={{ label: "elitlig.com'a git", onPress: () => openLink(SITE_URL) }}
      />
    ) : (
      <ErrorState error={query.error} onRetry={query.refetch} />
    );
  }

  return (
    <FlatList
      {...scrollProps}
      data={rows}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      contentContainerStyle={styles.listContent}
      refreshControl={refresh.control}
      ListHeaderComponent={header}
      initialNumToRender={8}
      ListEmptyComponent={
        <EmptyState
          icon="calendar-outline"
          title={past ? "Oynanan maç yok" : "Yaklaşan maç yok"}
          body={
            past
              ? "Takımının oynadığı maçlar burada listelenir."
              : "Takımının programına maç eklendiğinde burada görünür."
          }
          variant="inline"
        />
      }
    />
  );
}

const RESULT_COLOR: Record<FormResult, string> = { W: colors.win, D: colors.draw, L: colors.loss };
const RESULT_DIM: Record<FormResult, string> = { W: colors.winDim, D: colors.drawDim, L: colors.lossDim };

/**
 * Tek maç kartı: tarih bloğu · rakip + künye · sağda saat (yaklaşan) ya da
 * SONUÇ RENKLİ skor kutusu (oynanan). Yaklaşan maçta altında yoklama şeridi.
 */
const MyMatchCard = React.memo(function MyMatchCard({
  match,
  past,
  onPress,
}: {
  match: MyMatch;
  past: boolean;
  onPress: () => void;
}) {
  const ours = match.is_home ? match.first_team_score : match.second_team_score;
  const theirs = match.is_home ? match.second_team_score : match.first_team_score;
  const result: FormResult | null =
    ours == null || theirs == null ? null : ours > theirs ? "W" : ours < theirs ? "L" : "D";
  const opponent =
    match.opponent_name ?? (match.is_home ? match.second_team_name : match.first_team_name);

  const meta = [
    match.is_home ? "Ev sahibi" : "Deplasman",
    match.match_field,
    past && !match.in_squad ? "Kadroda değildin" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <View style={[surfaces.card, styles.matchCard]}>
      <Touchable
        feedback="row"
        haptic="selection"
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${opponent ?? "Rakip"} maçı, ${formatDateShort(match.date)}`}
        style={styles.matchRow}
      >
        <DateBlock date={match.date} />

        <View style={styles.matchBody}>
          <View style={styles.matchTitleRow}>
            <Text style={styles.matchOpponent} numberOfLines={1} {...textScale.dense}>
              {upperTR(opponent ?? "Rakip")}
            </Text>
            {/* Yaklaşan maçta "kadrodasın" bir haberdir; oynanan maçta her
                kartta tekrarlanan rozet gürültüdür — orada yalnız kadroda
                OLMADIĞI maç künyede söylenir. */}
            {!past && match.in_squad ? <Badge label="KADRODA" tone="win" size="xs" /> : null}
          </View>
          <Text style={styles.matchMeta} numberOfLines={1} {...textScale.dense}>
            {meta}
          </Text>
        </View>

        {past ? (
          <View
            style={[
              styles.scoreBox,
              result
                ? { backgroundColor: RESULT_DIM[result], borderColor: withAlpha(RESULT_COLOR[result], 0.4) }
                : null,
            ]}
          >
            <Text style={styles.scoreText} {...textScale.badge}>
              {ours ?? "–"}-{theirs ?? "–"}
            </Text>
          </View>
        ) : match.time ? (
          <View style={styles.timeBox}>
            <Text style={styles.timeText} {...textScale.badge}>
              {formatTime(match.time)}
            </Text>
          </View>
        ) : (
          <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
        )}
      </Touchable>

      {/* Yaklaşan maçta müsaitlik yoklaması */}
      {!past ? <AvailabilityStrip matchId={match.id} /> : null}
    </View>
  );
});

/** Yoklama seçenekleri sabit sırada; renk seçime göre değişir. */
const AVAILABILITY_OPTIONS: { status: AvailabilityStatus; tone: Tone }[] = [
  { status: "coming", tone: "win" },
  { status: "maybe", tone: "warn" },
  { status: "not_coming", tone: "danger" },
];

function AvailabilityStrip({ matchId }: { matchId: number }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const queryKey = key.availability(matchId);

  const query = useQuery({
    queryKey,
    queryFn: () => getMyAvailability(matchId),
    staleTime: 60_000,
    retry: false,
  });

  const mutation = useMutation({
    mutationFn: (status: AvailabilityStatus) => setMyAvailability(matchId, status),
    // İyimser güncelleme: seçim anında boyanır, hata olursa geri alınır.
    onMutate: async (status) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<{ status: AvailabilityStatus | null }>(queryKey);
      queryClient.setQueryData(queryKey, { status });
      return { previous };
    },
    onError: (error, _status, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
      toast.show({
        message: error instanceof ApiError ? error.userMessage : "Yanıt kaydedilemedi.",
        tone: "danger",
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const current = query.data?.status ?? null;

  const choose = useCallback(
    (status: AvailabilityStatus) => {
      if (current === status || mutation.isPending) return;
      mutation.mutate(status);
    },
    [current, mutation],
  );

  return (
    <View style={styles.availability}>
      <View style={styles.availabilityHead}>
        <Text style={styles.overline} {...textScale.badge}>
          KATILIM DURUMUN
        </Text>
        {/* Yanıt verilmediyse küçük bir hatırlatma; verildiyse seçim çipte görünür. */}
        {current == null && !query.isLoading ? (
          <Text style={styles.availabilityHint} {...textScale.dense}>
            Henüz yanıt vermedin
          </Text>
        ) : null}
      </View>
      <View style={styles.availabilityOptions}>
        {AVAILABILITY_OPTIONS.map((option) => (
          <Chip
            key={option.status}
            label={AVAILABILITY_LABELS[option.status]}
            selected={current === option.status}
            tone={option.tone}
            size="sm"
            disabled={mutation.isPending}
            onPress={() => choose(option.status)}
            style={styles.availabilityChip}
          />
        ))}
      </View>
    </View>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   7) İSTATİSTİK — lig/sezon filtreli ayrıntılı istatistikler
   ══════════════════════════════════════════════════════════════════════════ */

function StatisticsTab({ scrollProps }: { scrollProps: ScrollChrome }) {
  const router = useRouter();
  const [selected, setSelected] = useState<{ leagueId: number | null; seasonId: number | null }>({
    leagueId: null,
    seasonId: null,
  });

  const query = useQuery({
    queryKey: key.statistics(selected.leagueId, selected.seasonId),
    queryFn: () => getMyStatistics(selected.leagueId, selected.seasonId),
    staleTime: 60_000,
    retry: false,
    // Filtre değişince eski rakamlar ekranda kalsın, boş kart yanıp sönmesin.
    placeholderData: (previous) => previous,
  });

  const refresh = useRefresh(query.refetch, { refreshing: query.isRefetching });

  const data = query.data;
  const combos = data?.filters?.combos ?? [];
  const totals = data?.totals ?? null;
  const perMatch = data?.per_match ?? null;
  const breakdown = data?.breakdown ?? [];
  const matchLog = data?.match_log ?? [];

  const goalTypes = useMemo(() => {
    const types = data?.goal_types;
    if (!types) return [];
    return [
      { label: "Sağ ayak", value: num(types.right_foot) },
      { label: "Sol ayak", value: num(types.left_foot) },
      { label: "Kafa", value: num(types.header) },
      { label: "Penaltı", value: num(types.penalty) },
      { label: "Frikik", value: num(types.free_kick) },
      { label: "Uzaktan", value: num(types.long_range) },
    ].filter((item) => item.value > 0);
  }, [data?.goal_types]);

  /* Vurgu şeridi: maç başına oranlar — sunucunun kendi hesapladığı değerler. */
  const rateTiles: StatTile[] = useMemo(() => {
    if (!perMatch) return [];
    return [
      { key: "g", value: decimalTR(num(perMatch.goals), 2), label: "GOL / MAÇ" },
      { key: "a", value: decimalTR(num(perMatch.assists), 2), label: "ASİST / MAÇ" },
      { key: "c", value: decimalTR(num(perMatch.contributions), 2), label: "KATKI / MAÇ" },
      { key: "s", value: `%${Math.round(num(perMatch.start_ratio))}`, label: "İLK 11" },
    ];
  }, [perMatch]);

  const totalTiles: StatTile[] = useMemo(() => {
    if (!totals) return [];
    const list: StatTile[] = [
      { key: "m", value: String(num(totals.matches)), label: "MAÇ" },
      { key: "g", value: String(num(totals.goals)), label: "GOL" },
      { key: "a", value: String(num(totals.assists)), label: "ASİST" },
    ];
    if (totals.rating != null) {
      list.push({
        key: "r",
        value: totals.rating.toFixed(1),
        label: "ORT. PUAN",
        hint: totals.best_rating != null ? `en iyi ${totals.best_rating.toFixed(1)}` : undefined,
      });
    }
    return list;
  }, [totals]);

  const breakdownRows: StatRow[] = useMemo(() => {
    const maxGoals = breakdown.reduce((acc, row) => Math.max(acc, num(row.goals)), 0);
    return breakdown.map((row) => ({
      key: `${row.league_id ?? "x"}-${row.season_id ?? "x"}`,
      title: row.league_name ?? "Bilinmeyen lig",
      subtitle: row.season_name ?? "Bilinmeyen sezon",
      values: [num(row.matches), num(row.goals), num(row.assists)],
      rating: row.rating,
      share: maxGoals > 0 ? num(row.goals) / maxGoals : undefined,
    }));
  }, [breakdown]);

  /** Sıfır olan ayrıntı satırı hiç çizilmez. */
  const detailGroups = useMemo(() => {
    if (!totals) return [];
    const matches = num(totals.matches);
    const pick = (lines: { label: string; value: number; share?: number }[]) =>
      lines.filter((line) => line.value > 0).map((line) => ({ ...line, value: String(line.value) }));
    return [
      {
        title: "Oyun süresi",
        lines: pick([
          { label: "İlk kadro başlangıcı", value: num(totals.starts), share: matches > 0 ? num(totals.starts) / matches : undefined },
          { label: "Sonradan oyuna giriş", value: num(totals.sub_ins) },
          { label: "Kaptanlık", value: num(totals.captain) },
        ]),
      },
      {
        title: "Hücum ve savunma",
        lines: pick([
          { label: "Yaratılan pozisyon", value: num(totals.chances_created) },
          { label: "Kurtarış", value: num(totals.saves) },
          { label: "Kritik blok", value: num(totals.critical_blocks) },
          { label: "Kazanılan hava topu", value: num(totals.aerials_won) },
          { label: "Kazanılan ikili mücadele", value: num(totals.duels_won) },
        ]),
      },
      {
        title: "Disiplin",
        lines: pick([
          { label: "Sarı kart", value: num(totals.yellow_cards) },
          { label: "Kırmızı kart", value: num(totals.red_cards) },
          { label: "Faul", value: num(totals.fouls) },
        ]),
      },
    ].filter((group) => group.lines.length > 0);
  }, [totals]);

  const selectAll = useCallback(() => setSelected({ leagueId: null, seasonId: null }), []);

  const selectCombo = useCallback(
    (combo: StatCombo) =>
      setSelected({ leagueId: combo.league_id, seasonId: combo.season_id }),
    [],
  );

  /* Maç günlüğü sanal listedir: sunucu bütün sezonu döndürebilir ve satır
     sayısının üst sınırı yoktur. Satır bileşeni memo'lu olduğu için açma
     geri çağrısı burada, erken dönüşlerin ÜSTÜNDE sabitlenir. */
  const openMatch = useCallback((matchId: number) => router.push(`/mac/${matchId}`), [router]);

  const logLength = query.data?.match_log?.length ?? 0;
  const renderLogRow = useCallback(
    ({ item, index }: { item: StatMatchLogRow; index: number }) => (
      <MatchLogRow
        matchId={item.match_id}
        date={item.date}
        opponent={item.opponent ?? "Rakip"}
        score={item.score || null}
        result={item.result}
        rating={item.rating}
        goals={num(item.goals)}
        assists={num(item.assists)}
        yellow={num(item.yellow_cards)}
        red={num(item.red_cards)}
        started={item.started}
        captain={item.captain}
        venue={[item.is_home ? "Ev" : "Dep", item.season_name].filter(Boolean).join(" · ")}
        position={rowPosition(index, logLength)}
        onPress={openMatch}
      />
    ),
    [openMatch, logLength],
  );

  const logKey = useCallback((item: StatMatchLogRow) => String(item.match_id), []);

  if (query.isLoading) {
    return (
      <View style={styles.loadingBody}>
        <SkeletonCard lines={2} />
        <SkeletonTable count={6} columns={5} />
      </View>
    );
  }

  if (query.isError) {
    return isProfileMissing(query.error) ? (
      <EmptyState
        icon="person-add-outline"
        title="Oyuncu profili gerekli"
        body="İstatistiklerin için hesabına bağlı bir oyuncu profili olmalı."
        action={{ label: "elitlig.com'a git", onPress: () => openLink(SITE_URL) }}
      />
    ) : (
      <ErrorState error={query.error} onRetry={query.refetch} />
    );
  }

  if (!data?.linked) {
    return (
      <EmptyState
        icon="person-add-outline"
        title="Oyuncu profilin bağlı değil"
        body="Bağlandıktan sonra lig ve sezon kırılımlı istatistiklerin burada oluşur."
        action={{ label: "elitlig.com'a git", onPress: () => openLink(SITE_URL) }}
      />
    );
  }

  if (!totals || totals.matches === 0) {
    return (
      <EmptyState
        icon="stats-chart-outline"
        title="Henüz istatistik yok"
        body="Yayınlanmış bir maçta forma giydiğinde rakamların burada birikir."
      />
    );
  }

  const anyFilter = selected.leagueId != null || selected.seasonId != null;

  return (
    <FlatList
      {...scrollProps}
      data={matchLog}
      renderItem={renderLogRow}
      keyExtractor={logKey}
      contentContainerStyle={styles.listContent}
      refreshControl={refresh.control}
      initialNumToRender={10}
      windowSize={9}
      removeClippedSubviews
      ListHeaderComponent={
        <View style={styles.statHeader}>
          {/* ————— Lig / sezon filtresi ————— */}
          {combos.length > 1 ? (
            <ChipGroup contentPadding={0}>
              <Chip label="Tüm dönemler" selected={!anyFilter} size="sm" onPress={selectAll} />
              {combos.map((combo) => (
                <Chip
                  key={comboKey(combo)}
                  label={comboLabel(combo)}
                  count={combo.matches}
                  size="sm"
                  selected={
                    selected.leagueId === combo.league_id && selected.seasonId === combo.season_id
                  }
                  onPress={() => selectCombo(combo)}
                />
              ))}
            </ChipGroup>
          ) : null}

          {/* ————— Ana rakamlar + maç başına ————— */}
          <StatTiles tiles={totalTiles} />
          <StatTiles tiles={rateTiles} />

          {/* ————— Galibiyet dengesi ————— */}
          <WinBalance wins={num(totals.wins)} draws={num(totals.draws)} losses={num(totals.losses)} />

          {/* ————— Gol kırılımı ————— */}
          {goalTypes.length ? (
            <BarList title="Gollerimi nasıl attım" meta={`${num(totals.goals)} gol`} items={goalTypes} />
          ) : null}

          {/* ————— Lig / sezon kırılımı ————— */}
          {breakdownRows.length ? (
            <>
              <SectionHeader style={styles.flushHeader} title="Dönem dönem" meta={`${breakdownRows.length} dönem`} />
              <StatTable
                columns={[
                  { key: "m", label: "M" },
                  { key: "g", label: "G" },
                  { key: "a", label: "A" },
                ]}
                rows={breakdownRows}
              />
            </>
          ) : null}

          {/* ————— Ayrıntılı toplamlar ————— */}
          {detailGroups.length ? (
            <>
              <SectionHeader style={styles.flushHeader} title="Ayrıntılı istatistik" />
              {detailGroups.map((group) => (
                <StatList key={group.title} title={group.title} lines={group.lines} />
              ))}
            </>
          ) : null}

          {/* ————— Maç günlüğü başlığı — satırlar listenin kendisidir ————— */}
          {matchLog.length ? (
            <SectionHeader style={styles.flushHeader} title="Maç günlüğü" meta={`son ${matchLog.length} maç`} />
          ) : null}
        </View>
      }
    />
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   8) SÖZLEŞMEM — yürürlükteki sözleşme + kısayollar
   ══════════════════════════════════════════════════════════════════════════ */

function ContractTab({ scrollProps }: { scrollProps: ScrollChrome }) {
  const router = useRouter();

  /* scope=player ŞART: hem oyuncu hem başkan olan üyeye (double) takım
     sözleşmeleri karışmasın — sunucu dökümündeki tuzak. */
  const query = useQuery({
    queryKey: key.contracts(),
    queryFn: () => getMyContracts(),
    staleTime: 60_000,
    retry: false,
  });

  const refresh = useRefresh(query.refetch, { refreshing: query.isRefetching });

  const items = query.data?.items ?? [];
  const active = items.find((item) => ACTIVE_CONTRACT_STATUSES.has(item.status)) ?? null;
  const others = items.filter((item) => item !== active);

  if (query.isLoading) {
    return (
      <View style={styles.loadingBody}>
        <SkeletonCard lines={3} />
      </View>
    );
  }

  if (query.isError) {
    return <ErrorState error={query.error} onRetry={query.refetch} />;
  }

  return (
    <ScrollView {...scrollProps} contentContainerStyle={styles.content} refreshControl={refresh.control}>
      {active ? (
        <>
          <SectionHeader style={styles.flushHeader} title="Yürürlükteki sözleşmem" />
          <ActiveContractCard contract={active} />
        </>
      ) : (
        <EmptyState
          icon="document-text-outline"
          title="Aktif sözleşmen yok"
          body="Bir transfer teklifini kabul ettiğinde sözleşmen burada görünür."
          variant="inline"
          action={{ label: "Tekliflerime bak", onPress: () => router.push("/tekliflerim") }}
        />
      )}

      {others.length ? (
        <>
          <SectionHeader style={styles.flushHeader} title="Geçmiş sözleşmelerim" meta={`${others.length} kayıt`} />
          <View>
            {others.map((contract, index) => (
              <ListRow
                key={contract.public_id}
                leading={
                  <TeamLogo
                    name={contract.team?.team_name}
                    logo={mediaUrl(contract.team?.logo ?? null)}
                    size={layout.crestMd}
                  />
                }
                title={contract.team?.team_name ?? "Takım"}
                subtitle={contractPeriod(contract)}
                badge={
                  <Badge
                    label={CONTRACT_STATUS_LABELS[contract.status] ?? contract.status}
                    tone="neutral"
                    size="xs"
                  />
                }
                position={rowPosition(index, others.length)}
                onPress={() => router.push("/sozlesmelerim")}
              />
            ))}
          </View>
        </>
      ) : null}

      <SectionHeader style={styles.flushHeader} title="Sözleşme işlemleri" />
      <View>
        <ListRow
          leading={{ icon: "documents", tone: "brand" }}
          title="Sözleşmelerim"
          subtitle="Tüm sözleşme kayıtların"
          position="first"
          onPress={() => router.push("/sozlesmelerim")}
        />
        <ListRow
          leading={{ icon: "swap-horizontal", tone: "info" }}
          title="Transfer Tekliflerim"
          subtitle="Gelen teklifleri kabul et veya reddet"
          position="last"
          onPress={() => router.push("/tekliflerim")}
        />
      </View>
    </ScrollView>
  );
}

function contractPeriod(contract: Contract): string {
  const start = dateWithYear(contract.contract_start_date) || "?";
  const end = dateWithYear(contract.contract_end_date) || "?";
  return `${start} → ${end}`;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Sözleşmenin zaman çizgisi — başlangıç ve bitiş tarihinden hesaplanır.
 * Tarihlerden biri yoksa ya da okunamıyorsa null (çizgi çizilmez).
 */
function contractProgress(contract: Contract): { elapsed: number; daysLeft: number } | null {
  const start = Date.parse(String(contract.contract_start_date ?? "").slice(0, 10));
  const end = Date.parse(String(contract.contract_end_date ?? "").slice(0, 10));
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  const now = Date.now();
  const elapsed = Math.max(0, Math.min(1, (now - start) / (end - start)));
  const daysLeft = Math.max(0, Math.ceil((end - now) / DAY_MS));
  return { elapsed, daysLeft };
}

/**
 * Yürürlükteki sözleşmenin kartı: amblem + kulüp + durum, altında süre
 * çizgisi (geçen pay + "kalan N gün") ve iki tarih. Süre çizgisi tarihlerden
 * hesaplanır; uydurma bir değer değildir.
 */
const ActiveContractCard = React.memo(function ActiveContractCard({
  contract,
}: {
  contract: Contract;
}) {
  const router = useRouter();

  /* NOT: tek sözleşme detayı ekranı (`app/sozlesme/[id].tsx`) henüz yok;
     kart şimdilik sözleşme listesine iner. */
  const open = useCallback(() => router.push("/sozlesmelerim"), [router]);
  const progress = contractProgress(contract);

  return (
    <Touchable
      feedback="card"
      haptic="selection"
      onPress={open}
      accessibilityRole="button"
      accessibilityLabel={`${contract.team?.team_name ?? "Takım"} sözleşmesi${progress ? `, kalan ${progress.daysLeft} gün` : ""}`}
      style={[surfaces.cardPadded, styles.contractCard]}
    >
      <View style={styles.contractHead}>
        <TeamLogo
          name={contract.team?.team_name}
          logo={mediaUrl(contract.team?.logo ?? null)}
          size={layout.crestXl}
        />
        <View style={styles.contractHeadBody}>
          <Text style={styles.contractTeam} numberOfLines={1} {...textScale.dense}>
            {contract.team?.team_name ?? "Takım"}
          </Text>
          <Badge
            label={CONTRACT_STATUS_LABELS[contract.status] ?? contract.status}
            tone={contract.status === "ACTIVE" ? "win" : "warn"}
            size="sm"
          />
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
      </View>

      {progress ? (
        <View style={styles.contractProgress}>
          <View style={styles.contractTrack}>
            <View style={[styles.contractFill, { flex: progress.elapsed }]} />
            <View style={{ flex: 1 - progress.elapsed }} />
          </View>
          <Text style={styles.contractLeft} {...textScale.dense}>
            {progress.daysLeft > 0 ? `Kalan ${progress.daysLeft} gün` : "Süre doldu"}
          </Text>
        </View>
      ) : null}

      <View style={styles.contractDates}>
        <ContractDate label="BAŞLANGIÇ" value={contract.contract_start_date} />
        <View style={styles.contractArrow}>
          <Ionicons name="arrow-forward" size={14} color={colors.textTertiary} />
        </View>
        <ContractDate label="BİTİŞ" value={contract.contract_end_date} />
      </View>
    </Touchable>
  );
});

const ContractDate = React.memo(function ContractDate({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  return (
    <View style={styles.contractDate}>
      <Text style={styles.overline} {...textScale.badge}>
        {label}
      </Text>
      <Text style={styles.contractDateValue} {...textScale.dense}>
        {value ? dateWithYear(value) : "—"}
      </Text>
    </View>
  );
});

/* ══════════════════════════════════════════════════════════════════════════
   9) STİLLER
   ══════════════════════════════════════════════════════════════════════════ */

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.md,
    paddingBottom: space.giant,
    gap: space.md,
  },
  listContent: {
    paddingHorizontal: layout.screenPadding,
    paddingBottom: space.giant,
  },
  /* Sanal listenin başlığı: `content` ile aynı dikey ritim, ama boşluk
     satırların ARASINA değil yalnız başlık bölümlerine uygulanır. */
  statHeader: {
    gap: space.md,
    paddingTop: space.md,
  },
  /* İçerik kabı ekran dolgusunu basıyor; başlık kendi dolgusunu basmaz. */
  flushHeader: {
    paddingHorizontal: 0,
    paddingBottom: space.xs,
  },
  /* Izgara kendi ekran dolgusunu basar; içerik kabı zaten basıyor. */
  flushGrid: {
    paddingHorizontal: 0,
  },
  loadingBody: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.md,
    gap: space.md,
  },
  filterBar: {
    paddingVertical: space.md,
  },
  overline: {
    ...type.overline,
    color: colors.textTertiary,
  },
  rowDivider: {
    borderTopWidth: hairline,
    borderTopColor: colors.separator,
  },

  /* — Kulüp kartı — */
  teamCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
  },
  teamBody: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  teamName: {
    ...type.h2,
    color: colors.textPrimary,
  },
  teamMeta: {
    ...type.caption,
    color: colors.textTertiary,
  },

  /* — Son maç satırı (iki takım alt alta) — */
  recentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: space.md,
    paddingVertical: space.m,
  },
  recentTeams: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  recentLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  recentTeam: {
    ...type.h4,
    color: colors.textPrimary,
    flex: 1,
  },
  recentScore: {
    ...type.tableNumStrong,
    fontSize: 15,
    color: colors.textPrimary,
    minWidth: 20,
    textAlign: "right",
  },
  recentLoser: {
    color: colors.textTertiary,
  },

  /* — Maç kartı — */
  matchCard: {
    marginBottom: space.sm,
  },
  matchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
  },
  matchBody: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  matchTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.s,
  },
  matchOpponent: {
    ...type.h4,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  matchMeta: {
    ...type.caption,
    color: colors.textTertiary,
  },
  scoreBox: {
    minWidth: 48,
    height: 28,
    paddingHorizontal: space.s,
    borderRadius: radius.xs,
    borderWidth: hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface2,
    alignItems: "center",
    justifyContent: "center",
  },
  scoreText: {
    ...type.tableNumStrong,
    color: colors.textPrimary,
  },
  timeBox: {
    minWidth: 52,
    height: 28,
    paddingHorizontal: space.s,
    borderRadius: radius.xs,
    backgroundColor: colors.surface3,
    alignItems: "center",
    justifyContent: "center",
  },
  timeText: {
    ...type.clock,
    color: colors.textPrimary,
  },

  /* — Yoklama — */
  availability: {
    borderTopWidth: hairline,
    borderTopColor: colors.separator,
    paddingHorizontal: space.md,
    paddingVertical: space.m,
    gap: space.sm,
  },
  availabilityHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
  },
  availabilityHint: {
    ...type.caption,
    color: colors.warn,
  },
  availabilityOptions: {
    flexDirection: "row",
    gap: space.s,
  },
  availabilityChip: {
    flex: 1,
    justifyContent: "center",
  },

  /* — Sözleşme — */
  contractCard: {
    gap: space.md,
  },
  contractHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
  },
  contractHeadBody: {
    flex: 1,
    minWidth: 0,
    alignItems: "flex-start",
    gap: space.s,
  },
  contractTeam: {
    ...type.h2,
    color: colors.textPrimary,
  },
  contractProgress: {
    gap: space.s,
  },
  contractTrack: {
    flexDirection: "row",
    height: 6,
    borderRadius: radius.pill,
    overflow: "hidden",
    backgroundColor: colors.surface3,
  },
  contractFill: {
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  contractLeft: {
    ...type.caption,
    color: colors.textSecondary,
  },
  contractDates: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface2,
    borderRadius: radius.md,
    padding: space.md,
  },
  contractDate: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  contractDateValue: {
    ...type.tableNumStrong,
    color: colors.textPrimary,
  },
  contractArrow: {
    paddingHorizontal: space.sm,
  },
});
