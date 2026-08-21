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
  Avatar,
  Badge,
  Card,
  Chip,
  ChipGroup,
  EmptyState,
  ErrorState,
  FormChips,
  ListRow,
  RatingPill,
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
  type FormResult,
  type SegmentedItem,
  type TabItem,
  type Tone,
} from "@/components/ui";
import {
  getMyContracts,
  getMyMatches,
  getPanelMe,
  type Contract,
  type MyMatch,
  type PanelPendingChange,
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

const MATCH_FILTERS: SegmentedItem<MatchFilter>[] = [
  { key: "yaklasan", label: "Yaklaşan" },
  { key: "oynanan", label: "Oynanan" },
];

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

  const openPublicProfile = useCallback(() => {
    if (player?.id) router.push(`/oyuncu/${player.id}`);
  }, [player?.id, router]);

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
        bottom={<Tabs items={TAB_ITEMS} value={tab} onChange={changeTab} sticky />}
      />

      {tab === "ozet" ? (
        <SummaryTab
          playerId={player.id}
          playerName={player.player_name}
          playerImage={player.player_img}
          position={player.player_position}
          city={player.city}
          active={player.active}
          teamName={playerTeam?.team_name ?? null}
          teamLogo={playerTeam?.logo ?? null}
          teamId={player.team_id}
          league={playerTeam?.current_league ?? null}
          season={playerTeam?.current_season ?? null}
          stats={me.stats}
          recentMatches={me.recentMatches}
          pendingChanges={me.pendingChanges}
          unreadMessages={me.messages.filter((item) => !item.read).length}
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
   5) ÖZET — profil kartı, sezon rakamları, bekleyen talepler, kısayollar
   ══════════════════════════════════════════════════════════════════════════ */

interface SummaryTabProps {
  playerId: number;
  playerName: string;
  playerImage: string | null;
  position: string | null;
  city: string | null;
  active: boolean;
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
  recentMatches: {
    id: number;
    date: string;
    home_team: string;
    away_team: string;
    home_score: number | null;
    away_score: number | null;
  }[];
  pendingChanges: PanelPendingChange[];
  unreadMessages: number;
  onOpenTab: (tab: MyTab) => void;
  refetch: () => unknown;
  isRefetching: boolean;
  scrollProps: ScrollChrome;
}

function SummaryTab({
  playerId,
  playerName,
  playerImage,
  position,
  city,
  active,
  teamName,
  teamLogo,
  teamId,
  league,
  season,
  stats,
  recentMatches,
  pendingChanges,
  unreadMessages,
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

  const openPublic = useCallback(() => router.push(`/oyuncu/${playerId}`), [playerId, router]);

  const pending = pendingChanges.filter((change) => change.status === "pending");

  const shortcuts = useMemo(
    () => [
      {
        key: "maclarim",
        icon: "calendar" as const,
        title: "Maçlarım",
        subtitle: "Fikstür, sonuçlar ve yoklama",
        onPress: () => onOpenTab("maclarim"),
      },
      {
        key: "istatistik",
        icon: "stats-chart" as const,
        title: "İstatistiklerim",
        subtitle: "Lig ve sezon kırılımı",
        onPress: () => onOpenTab("istatistik"),
      },
      {
        key: "sozlesme",
        icon: "document-text" as const,
        title: "Sözleşmem",
        subtitle: "Yürürlükteki sözleşmen",
        onPress: () => onOpenTab("sozlesme"),
      },
      {
        key: "teklifler",
        icon: "swap-horizontal" as const,
        title: "Transfer Tekliflerim",
        subtitle: "Gelen teklifler ve yanıtların",
        onPress: () => router.push("/tekliflerim"),
      },
      {
        key: "davetler",
        icon: "mail-open" as const,
        title: "Takım Davetlerim",
        subtitle: "Gelen davetler ve başvuruların",
        onPress: () => router.push("/davetler"),
      },
      {
        key: "cezalar",
        icon: "alert-circle" as const,
        title: "Disiplin Dosyalarım",
        subtitle: "Savunma ve itiraz hakların",
        onPress: () => router.push("/cezalarim"),
      },
      {
        key: "mesajlar",
        icon: "chatbubbles" as const,
        title: "Panel Mesajlarım",
        subtitle: "Yönetimle yazışmaların",
        onPress: () => router.push("/mesajlarim"),
      },
      {
        key: "duzenle",
        icon: "create" as const,
        title: "Profilimi Düzenle",
        subtitle: "Bilgi ve fotoğraf talebi",
        onPress: () => router.push("/hesabim"),
      },
    ],
    [onOpenTab, router],
  );

  return (
    <ScrollView
      {...scrollProps}
      contentContainerStyle={styles.content}
      refreshControl={refresh.control}
    >
      {/* ————— Profil kartı ————— */}
      <Touchable
        feedback="card"
        haptic="selection"
        onPress={openPublic}
        accessibilityRole="button"
        accessibilityLabel={`${playerName}, herkese açık profilim`}
        style={styles.profileCard}
      >
        <Avatar name={playerName} image={mediaUrl(playerImage)} size={56} ring="brand" />

        <View style={styles.profileBody}>
          <Text style={styles.profileName} numberOfLines={1} {...textScale.dense}>
            {playerName}
          </Text>
          <View style={styles.profileMeta}>
            {position ? <Badge label={position} tone="brand" size="xs" /> : null}
            <Badge
              label={active ? "AKTİF" : "PASİF"}
              tone={active ? "win" : "neutral"}
              size="xs"
            />
            {city ? (
              <Text style={styles.profileCity} numberOfLines={1} {...textScale.dense}>
                {city}
              </Text>
            ) : null}
          </View>
        </View>

        <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
      </Touchable>

      {/* ————— Kulüp satırı ————— */}
      {teamName ? (
        <Touchable
          feedback="card"
          haptic="selection"
          onPress={openTeam}
          accessibilityRole="button"
          accessibilityLabel={`${teamName} takım sayfası`}
          style={styles.teamCard}
        >
          <TeamLogo name={teamName} logo={mediaUrl(teamLogo)} size={layout.crestLg} />
          <View style={styles.teamBody}>
            <Text style={styles.teamLabel} {...textScale.badge}>
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

      {/* ————— Sezon rakamları ————— */}
      {stats ? (
        <>
          <SectionHeader
            title="Sezon özetim"
            meta={stats.season ? String(stats.season) : undefined}
          />
          <View style={styles.bigRow}>
            <BigStat label="MAÇ" value={String(num(stats.matches))} />
            <View style={styles.bigDivider} />
            <BigStat label="GOL" value={String(num(stats.goals))} />
            <View style={styles.bigDivider} />
            <BigStat label="ASİST" value={String(num(stats.assists))} />
            <View style={styles.bigDivider} />
            <BigStat
              label="ORT. PUAN"
              value={stats.rating != null ? stats.rating.toFixed(1) : "—"}
              tone="brand"
            />
          </View>

          <View style={styles.group}>
            <ListRow
              leading={{ icon: "play-circle", tone: "info" }}
              title="İlk 11 başlangıcı"
              value={String(num(stats.starts))}
              chevron={false}
              position="first"
            />
            <ListRow
              leading={{ icon: "square", tone: "warn" }}
              title="Sarı kart"
              value={String(num(stats.yellow_cards))}
              chevron={false}
              position="middle"
            />
            <ListRow
              leading={{ icon: "square", tone: "danger" }}
              title="Kırmızı kart"
              value={String(num(stats.red_cards))}
              chevron={false}
              position="last"
            />
          </View>
        </>
      ) : null}

      {/* ————— Bekleyen talepler ————— */}
      {pendingChanges.length ? (
        <>
          <SectionHeader
            title="Değişiklik taleplerim"
            meta={pending.length ? `${pending.length} bekliyor` : undefined}
            action={{ label: "Hesabım", onPress: () => router.push("/hesabim") }}
          />
          <View style={styles.group}>
            {pendingChanges.slice(0, 6).map((change, index, list) => (
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
                position={rowPosition(index, Math.min(list.length, 6))}
              />
            ))}
          </View>
        </>
      ) : null}

      {/* ————— Son maçlar ————— */}
      {recentMatches.length ? (
        <>
          <SectionHeader
            title="Son maçlarım"
            action={{ label: "Tümü", onPress: () => onOpenTab("maclarim") }}
          />
          <View style={styles.group}>
            {recentMatches.slice(0, 5).map((match, index, list) => (
              <ListRow
                key={match.id}
                leading={{ icon: "football", tone: "brand" }}
                title={`${match.home_team} - ${match.away_team}`}
                subtitle={formatDateShort(match.date)}
                value={
                  match.home_score != null && match.away_score != null
                    ? `${match.home_score}-${match.away_score}`
                    : undefined
                }
                position={rowPosition(index, Math.min(list.length, 5))}
                onPress={() => router.push(`/mac/${match.id}`)}
              />
            ))}
          </View>
        </>
      ) : null}

      {/* ————— Kısayollar ————— */}
      <SectionHeader title="Kariyerim" />
      <View style={styles.group}>
        {shortcuts.map((item, index) => (
          <ListRow
            key={item.key}
            leading={{ icon: item.icon }}
            title={item.title}
            subtitle={item.subtitle}
            badge={
              item.key === "mesajlar" && unreadMessages > 0 ? (
                <Badge label={unreadMessages} tone="live" variant="solid" size="xs" />
              ) : undefined
            }
            position={rowPosition(index, shortcuts.length)}
            onPress={item.onPress}
          />
        ))}
      </View>
    </ScrollView>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   6) MAÇLARIM — maç merkezi + müsaitlik yoklaması

   MANTIK `app/maclarim.tsx` DOSYASINDAN AYNEN TAŞINDI:
   upcoming/past ayrımını sunucu yapar (saate değil maç durumuna bakar),
   `in_squad` kadroda olup olmadığını söyler, yoklama seçimi iyimser
   güncellenir ve sunucu reddederse eski seçim geri gelir. Değişen yalnız
   sunum katmanı: Alert yerine toast, elle çizilen sekme yerine
   SegmentedControl, satırlar tasarım sistemi yüzeylerinde.
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

  const header = useMemo(
    () => (
      <View style={styles.filterBar}>
        <SegmentedControl items={MATCH_FILTERS} value={filter} onChange={changeFilter} />
      </View>
    ),
    [changeFilter, filter],
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

/** Tek maç kartı: üstte maç satırı, yaklaşan maçta altında yoklama şeridi. */
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

  const resultColor =
    result === "W" ? colors.win : result === "L" ? colors.loss : colors.draw;

  return (
    <View style={styles.matchCard}>
      <Touchable
        feedback="row"
        haptic="selection"
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${opponent ?? "Rakip"} maçı`}
        style={styles.matchRow}
      >
        <View style={styles.matchWhen}>
          <Text style={styles.matchDate} {...textScale.dense}>
            {formatDateShort(match.date)}
          </Text>
          {match.time ? (
            <Text style={styles.matchTime} {...textScale.dense}>
              {formatTime(match.time)}
            </Text>
          ) : null}
        </View>

        <View style={styles.matchBody}>
          <Text style={styles.matchOpponent} numberOfLines={1} {...textScale.dense}>
            {String(opponent ?? "").toLocaleUpperCase("tr-TR")}
          </Text>
          <View style={styles.matchMeta}>
            <Text style={styles.matchMetaText} {...textScale.dense}>
              {match.is_home ? "Ev sahibi" : "Deplasman"}
            </Text>
            {match.match_field ? (
              <Text style={styles.matchMetaText} numberOfLines={1} {...textScale.dense}>
                · {match.match_field}
              </Text>
            ) : null}
            {match.in_squad ? <Badge label="KADRODA" tone="win" size="xs" /> : null}
          </View>
        </View>

        {past ? (
          <View style={styles.matchResult}>
            {result ? <FormChips form={[result]} limit={1} size="sm" /> : null}
            <Text style={styles.matchScore} {...textScale.dense}>
              {ours ?? "-"}-{theirs ?? "-"}
            </Text>
          </View>
        ) : (
          <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
        )}

        {past && result ? (
          <View style={[styles.matchRail, { backgroundColor: resultColor }]} />
        ) : null}
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
      <Text style={styles.availabilityLabel} {...textScale.badge}>
        YOKLAMA
      </Text>
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

  /** Sıfır olan ayrıntı satırı hiç çizilmez. */
  const detailRows = useMemo(() => {
    if (!totals) return [];
    return [
      { label: "İlk 11 başlangıcı", value: num(totals.starts) },
      { label: "Sonradan oyuna giriş", value: num(totals.sub_ins) },
      { label: "Kaptanlık", value: num(totals.captain) },
      { label: "Kurtarış", value: num(totals.saves) },
      { label: "Yaratılan pozisyon", value: num(totals.chances_created) },
      { label: "Kritik blok", value: num(totals.critical_blocks) },
      { label: "Kazanılan hava topu", value: num(totals.aerials_won) },
      { label: "Kazanılan ikili mücadele", value: num(totals.duels_won) },
      { label: "Faul", value: num(totals.fouls) },
      { label: "Sarı kart", value: num(totals.yellow_cards) },
      { label: "Kırmızı kart", value: num(totals.red_cards) },
    ].filter((item) => item.value > 0);
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

  const renderLogRow = useCallback(
    ({ item, index }: { item: StatMatchLogRow; index: number }) => (
      <MatchLogRow
        row={item}
        position={rowPosition(index, query.data?.match_log?.length ?? 0)}
        onOpen={openMatch}
      />
    ),
    [openMatch, query.data?.match_log?.length],
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

  const maxGoalType = goalTypes.reduce((acc, item) => Math.max(acc, item.value), 0);
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
        <View style={styles.filterBar}>
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
        </View>
      ) : null}

      {/* ————— Ana rakamlar ————— */}
      <View style={styles.bigRow}>
        <BigStat label="MAÇ" value={String(num(totals.matches))} />
        <View style={styles.bigDivider} />
        <BigStat label="GOL" value={String(num(totals.goals))} />
        <View style={styles.bigDivider} />
        <BigStat label="ASİST" value={String(num(totals.assists))} />
        <View style={styles.bigDivider} />
        <BigStat
          label="ORT. PUAN"
          value={totals.rating != null ? totals.rating.toFixed(1) : "—"}
          tone="brand"
        />
      </View>

      {/* ————— Maç başına ————— */}
      {perMatch ? (
        <Card title="Maç başına" style={styles.card}>
          <View style={styles.perMatchRow}>
            <PerMatchCell label="Gol" value={perMatch.goals.toFixed(2)} />
            <PerMatchCell label="Asist" value={perMatch.assists.toFixed(2)} />
            <PerMatchCell label="Katkı" value={perMatch.contributions.toFixed(2)} />
            <PerMatchCell label="İlk 11" value={`%${Math.round(num(perMatch.start_ratio))}`} />
          </View>
          <View style={styles.recordRow}>
            <Text style={styles.recordText} {...textScale.dense}>
              {num(totals.wins)}G · {num(totals.draws)}B · {num(totals.losses)}M
            </Text>
            {totals.best_rating != null ? (
              <View style={styles.bestRating}>
                <Text style={styles.recordText} {...textScale.dense}>
                  En iyi puan
                </Text>
                <RatingPill value={totals.best_rating} size="sm" />
              </View>
            ) : null}
          </View>
        </Card>
      ) : null}

      {/* ————— Gol kırılımı ————— */}
      {goalTypes.length ? (
        <>
          <SectionHeader title="Gollerimi nasıl attım" meta={`${num(totals.goals)} gol`} />
          <View style={styles.card}>
            {goalTypes.map((item) => (
              <View key={item.label} style={styles.goalTypeRow}>
                <Text style={styles.goalTypeLabel} numberOfLines={1} {...textScale.dense}>
                  {item.label}
                </Text>
                <View style={styles.goalTypeTrack}>
                  <View
                    style={[
                      styles.goalTypeFill,
                      { flex: maxGoalType > 0 ? item.value / maxGoalType : 0 },
                    ]}
                  />
                  <View style={{ flex: maxGoalType > 0 ? 1 - item.value / maxGoalType : 1 }} />
                </View>
                <Text style={styles.goalTypeValue} {...textScale.dense}>
                  {item.value}
                </Text>
              </View>
            ))}
          </View>
        </>
      ) : null}

      {/* ————— Lig / sezon kırılımı ————— */}
      {breakdown.length ? (
        <>
          <SectionHeader title="Dönem dönem" meta={`${breakdown.length} dönem`} />
          <View style={styles.table}>
            <View style={styles.tableHead}>
              <Text style={[styles.thText, styles.colPeriod]} {...textScale.badge}>
                DÖNEM
              </Text>
              <Text style={[styles.thText, styles.colNum]} {...textScale.badge}>
                M
              </Text>
              <Text style={[styles.thText, styles.colNum]} {...textScale.badge}>
                G
              </Text>
              <Text style={[styles.thText, styles.colNum]} {...textScale.badge}>
                A
              </Text>
              <Text style={[styles.thText, styles.colRating]} {...textScale.badge}>
                Ø
              </Text>
            </View>
            {breakdown.map((row) => (
              <View
                key={`${row.league_id ?? "x"}-${row.season_id ?? "x"}`}
                style={styles.tableRow}
              >
                <View style={styles.colPeriod}>
                  <Text style={styles.tdStrong} numberOfLines={1} {...textScale.dense}>
                    {row.league_name ?? "Bilinmeyen lig"}
                  </Text>
                  <Text style={styles.tdSub} numberOfLines={1} {...textScale.badge}>
                    {row.season_name ?? "Bilinmeyen sezon"}
                  </Text>
                </View>
                <Text style={[styles.tdNum, styles.colNum]} {...textScale.dense}>
                  {num(row.matches)}
                </Text>
                <Text style={[styles.tdNum, styles.colNum]} {...textScale.dense}>
                  {num(row.goals)}
                </Text>
                <Text style={[styles.tdNum, styles.colNum]} {...textScale.dense}>
                  {num(row.assists)}
                </Text>
                <View style={styles.colRating}>
                  <RatingPill value={row.rating} size="sm" />
                </View>
              </View>
            ))}
          </View>
        </>
      ) : null}

      {/* ————— Ayrıntılı toplamlar ————— */}
      {detailRows.length ? (
        <>
          <SectionHeader title="Ayrıntılı istatistik" />
          <View style={styles.group}>
            {detailRows.map((item, index) => (
              <ListRow
                key={item.label}
                title={item.label}
                value={String(item.value)}
                chevron={false}
                position={rowPosition(index, detailRows.length)}
              />
            ))}
          </View>
        </>
      ) : null}

      {/* ————— Maç günlüğü başlığı — satırlar listenin kendisidir ————— */}
      {matchLog.length ? (
        <SectionHeader title="Maç günlüğü" meta={`son ${matchLog.length} maç`} />
      ) : null}
        </View>
      }
    />
  );
}

/** Maç günlüğünün tek satırı: tarih · rakip · skor · gol/asist · reyting. */
const MatchLogRow = React.memo(function MatchLogRow({
  row,
  position,
  onOpen,
}: {
  row: StatMatchLogRow;
  position: "single" | "first" | "middle" | "last";
  onOpen: (matchId: number) => void;
}) {
  const onPress = useCallback(() => onOpen(row.match_id), [onOpen, row.match_id]);

  const resultColor =
    row.result === "W" ? colors.win : row.result === "L" ? colors.loss : colors.draw;

  return (
    <Touchable
      feedback="row"
      haptic="selection"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${row.opponent ?? "Rakip"} maçı, skor ${row.score}`}
      style={[
        styles.logRow,
        position === "first" && styles.groupFirst,
        position === "last" && styles.groupLast,
        position === "single" && styles.groupSingle,
        position !== "last" && position !== "single" && styles.groupDivider,
      ]}
    >
      <View style={[styles.matchRail, { backgroundColor: resultColor }]} />

      <View style={styles.logWhen}>
        <Text style={styles.matchDate} {...textScale.dense}>
          {row.date ? formatDateShort(row.date) : "—"}
        </Text>
        {row.started ? (
          <Text style={styles.logRole} {...textScale.badge}>
            İLK 11
          </Text>
        ) : null}
      </View>

      <View style={styles.logBody}>
        <Text style={styles.matchOpponent} numberOfLines={1} {...textScale.dense}>
          {String(row.opponent ?? "").toLocaleUpperCase("tr-TR")}
        </Text>
        <View style={styles.logMarks}>
          <Text style={styles.matchMetaText} {...textScale.dense}>
            {row.is_home ? "Ev" : "Dep"}
          </Text>
          {num(row.goals) > 0 ? (
            <LogMark icon="football" tone={colors.win} count={num(row.goals)} />
          ) : null}
          {num(row.assists) > 0 ? (
            <LogMark icon="navigate" tone={colors.info} count={num(row.assists)} />
          ) : null}
          {num(row.yellow_cards) > 0 ? (
            <LogMark icon="square" tone={colors.yellowCard} count={num(row.yellow_cards)} />
          ) : null}
          {num(row.red_cards) > 0 ? (
            <LogMark icon="square" tone={colors.redCard} count={num(row.red_cards)} />
          ) : null}
          {row.captain ? <LogMark icon="ribbon" tone={colors.brandAccent} count={0} /> : null}
        </View>
      </View>

      <Text style={styles.matchScore} {...textScale.dense}>
        {row.score}
      </Text>

      <RatingPill value={row.rating} size="sm" hideEmpty />
    </Touchable>
  );
});

const LogMark = React.memo(function LogMark({
  icon,
  tone,
  count,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  tone: string;
  count: number;
}) {
  return (
    <View style={styles.logMark}>
      <Ionicons name={icon} size={10} color={tone} />
      {count > 1 ? (
        <Text style={[styles.logMarkCount, { color: tone }]} {...textScale.badge}>
          {count}
        </Text>
      ) : null}
    </View>
  );
});

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
    <ScrollView
      {...scrollProps}
      contentContainerStyle={styles.content}
      refreshControl={refresh.control}
    >
      {active ? (
        <>
          <SectionHeader title="Yürürlükteki sözleşmem" />
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
          <SectionHeader title="Geçmiş sözleşmelerim" meta={`${others.length} kayıt`} />
          <View style={styles.group}>
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

      <SectionHeader title="Sözleşme işlemleri" />
      <View style={styles.group}>
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
  const start = contract.contract_start_date
    ? formatDateShort(contract.contract_start_date)
    : "?";
  const end = contract.contract_end_date ? formatDateShort(contract.contract_end_date) : "?";
  return `${start} → ${end}`;
}

/** Yürürlükteki sözleşmenin vurgulu kartı. */
const ActiveContractCard = React.memo(function ActiveContractCard({
  contract,
}: {
  contract: Contract;
}) {
  const router = useRouter();

  /* NOT: tek sözleşme detayı ekranı (`app/sozlesme/[id].tsx`) henüz yok;
     kart şimdilik sözleşme listesine iner. */
  const open = useCallback(() => router.push("/sozlesmelerim"), [router]);

  return (
    <Touchable
      feedback="card"
      haptic="selection"
      onPress={open}
      accessibilityRole="button"
      accessibilityLabel={`${contract.team?.team_name ?? "Takım"} sözleşmesi`}
      style={styles.contractCard}
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
      <Text style={styles.contractDateLabel} {...textScale.badge}>
        {label}
      </Text>
      <Text style={styles.contractDateValue} {...textScale.dense}>
        {value ? formatDateShort(value) : "—"}
      </Text>
    </View>
  );
});

/* ══════════════════════════════════════════════════════════════════════════
   9) ORTAK KÜÇÜK BİLEŞENLER
   ══════════════════════════════════════════════════════════════════════════ */

/** Büyük özet rakamı — `type.display`, tabular hizalı. */
const BigStat = React.memo(function BigStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "brand";
}) {
  return (
    <View style={styles.bigStat}>
      <Text
        style={[styles.bigValue, tone === "brand" && styles.bigValueBrand]}
        {...textScale.dense}
      >
        {value}
      </Text>
      <Text style={styles.bigLabel} numberOfLines={1} {...textScale.badge}>
        {label}
      </Text>
    </View>
  );
});

const PerMatchCell = React.memo(function PerMatchCell({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <View style={styles.perMatchCell}>
      <Text style={styles.perMatchValue} {...textScale.dense}>
        {value}
      </Text>
      <Text style={styles.perMatchLabel} numberOfLines={1} {...textScale.badge}>
        {label.toLocaleUpperCase("tr-TR")}
      </Text>
    </View>
  );
});

/* ══════════════════════════════════════════════════════════════════════════
   10) STİLLER
   ══════════════════════════════════════════════════════════════════════════ */

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    paddingHorizontal: layout.screenPadding,
    paddingBottom: space.giant,
    gap: space.sm,
  },
  listContent: {
    paddingHorizontal: layout.screenPadding,
    paddingBottom: space.giant,
  },
  /* Sanal listenin başlığı: `content` ile aynı dikey ritim, ama boşluk
     satırların ARASINA değil yalnız başlık bölümlerine uygulanır. */
  statHeader: {
    gap: space.sm,
  },
  loadingBody: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.md,
    gap: space.md,
  },
  filterBar: {
    paddingVertical: space.sm,
  },
  card: {
    marginTop: space.xs,
  },

  /* — Gruplar — */
  group: {
    borderRadius: radius.lg,
    overflow: "hidden",
  },
  groupFirst: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
  },
  groupLast: {
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
  },
  groupSingle: {
    borderRadius: radius.lg,
  },
  groupDivider: {
    borderBottomWidth: hairline,
    borderBottomColor: colors.separator,
  },

  /* — Profil kartı — */
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: space.md,
    marginTop: space.md,
  },
  profileBody: {
    flex: 1,
    gap: space.xs,
  },
  profileName: {
    ...type.h1,
    color: colors.textPrimary,
  },
  profileMeta: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: space.s,
  },
  profileCity: {
    ...type.caption,
    color: colors.textTertiary,
  },

  /* — Kulüp kartı — */
  teamCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: space.md,
  },
  teamBody: {
    flex: 1,
    gap: 1,
  },
  teamLabel: {
    ...type.micro,
    color: colors.brandAccent,
  },
  teamName: {
    ...type.h3,
    color: colors.textPrimary,
  },
  teamMeta: {
    ...type.caption,
    color: colors.textTertiary,
  },

  /* — Büyük rakamlar — */
  bigRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingVertical: space.md,
  },
  bigDivider: {
    width: hairline,
    alignSelf: "stretch",
    backgroundColor: colors.separator,
  },
  bigStat: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  bigValue: {
    ...type.display,
    fontVariant: ["tabular-nums"],
    color: colors.textPrimary,
  },
  bigValueBrand: {
    color: colors.brandAccent,
  },
  bigLabel: {
    ...type.micro,
    color: colors.textTertiary,
  },

  /* — Maç kartı — */
  matchCard: {
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
    borderRadius: radius.lg,
    marginBottom: space.sm,
    overflow: "hidden",
  },
  matchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: space.md,
    paddingVertical: space.m,
  },
  matchRail: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
  },
  matchWhen: {
    width: 52,
  },
  matchDate: {
    ...type.tableNumStrong,
    color: colors.textPrimary,
  },
  matchTime: {
    ...type.caption,
    color: colors.textTertiary,
  },
  matchBody: {
    flex: 1,
    gap: 2,
  },
  matchOpponent: {
    ...type.bodySm,
    fontFamily: fonts.bold,
    color: colors.textPrimary,
  },
  matchMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.s,
  },
  matchMetaText: {
    ...type.caption,
    color: colors.textTertiary,
    flexShrink: 1,
  },
  matchResult: {
    alignItems: "flex-end",
    gap: 3,
  },
  matchScore: {
    ...type.scoreSm,
    color: colors.textPrimary,
    minWidth: 34,
    textAlign: "right",
  },

  /* — Yoklama — */
  availability: {
    borderTopWidth: hairline,
    borderTopColor: colors.separator,
    paddingHorizontal: space.md,
    paddingVertical: space.m,
    gap: space.s,
  },
  availabilityLabel: {
    ...type.micro,
    color: colors.textTertiary,
  },
  availabilityOptions: {
    flexDirection: "row",
    gap: space.s,
  },
  availabilityChip: {
    flex: 1,
    justifyContent: "center",
  },

  /* — Maç başına — */
  perMatchRow: {
    flexDirection: "row",
  },
  perMatchCell: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  perMatchValue: {
    ...type.scoreMd,
    color: colors.textPrimary,
  },
  perMatchLabel: {
    ...type.micro,
    color: colors.textTertiary,
  },
  recordRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
    marginTop: space.md,
    paddingTop: space.sm,
    borderTopWidth: hairline,
    borderTopColor: colors.separator,
  },
  recordText: {
    ...type.caption,
    color: colors.textSecondary,
  },
  bestRating: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.s,
  },

  /* — Gol kırılımı — */
  goalTypeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingVertical: space.xs,
  },
  goalTypeLabel: {
    ...type.caption,
    color: colors.textSecondary,
    width: 84,
  },
  goalTypeTrack: {
    flex: 1,
    flexDirection: "row",
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
    backgroundColor: colors.surface3,
  },
  goalTypeFill: {
    height: 6,
    backgroundColor: colors.brand,
  },
  goalTypeValue: {
    ...type.tableNumStrong,
    color: colors.textPrimary,
    minWidth: 20,
    textAlign: "right",
  },

  /* — Dönem tablosu — */
  table: {
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
    borderRadius: radius.lg,
    overflow: "hidden",
  },
  tableHead: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface3,
    paddingHorizontal: space.md,
    paddingVertical: space.s,
    gap: space.xs,
  },
  thText: {
    ...type.micro,
    color: colors.textTertiary,
    textAlign: "center",
  },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: space.md,
    paddingVertical: space.m,
    gap: space.xs,
    borderTopWidth: hairline,
    borderTopColor: colors.separator,
  },
  colPeriod: {
    flex: 1,
    textAlign: "left",
  },
  colNum: {
    width: 30,
    textAlign: "center",
  },
  colRating: {
    width: 40,
    alignItems: "flex-end",
  },
  tdStrong: {
    ...type.bodySm,
    fontFamily: fonts.bold,
    color: colors.textPrimary,
  },
  tdSub: {
    ...type.micro,
    color: colors.textTertiary,
    letterSpacing: 0.2,
  },
  tdNum: {
    ...type.tableNum,
    color: colors.textSecondary,
  },

  /* — Maç günlüğü — */
  logRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    minHeight: 56,
    paddingRight: space.md,
    paddingLeft: space.sm,
    backgroundColor: colors.surface1,
  },
  logWhen: {
    width: 52,
  },
  logRole: {
    ...type.micro,
    color: colors.brandAccent,
  },
  logBody: {
    flex: 1,
    gap: 2,
  },
  logMarks: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.s,
  },
  logMark: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  logMarkCount: {
    ...type.micro,
  },

  /* — Sözleşme — */
  contractCard: {
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.brandBorder,
    borderRadius: radius.lg,
    padding: space.md,
    gap: space.md,
  },
  contractHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
  },
  contractHeadBody: {
    flex: 1,
    alignItems: "flex-start",
    gap: space.s,
  },
  contractTeam: {
    ...type.h2,
    color: colors.textPrimary,
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
  contractDateLabel: {
    ...type.micro,
    color: colors.textTertiary,
  },
  contractDateValue: {
    ...type.tableNumStrong,
    color: colors.textPrimary,
  },
  contractArrow: {
    paddingHorizontal: space.sm,
  },
});
