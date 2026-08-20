/**
 * MAÇ DETAYI — uygulamanın en çok açılan ekranı ve gol bildiriminin varış noktası.
 *
 * NE: tek bir maçın her yüzü. Üstte sabit bir tabela (armalar + skor + durum),
 * altında altı segment: Özet · Canlı · Kadrolar · İstatistik · H2H · Puan.
 *
 * NEDEN SABİT TABELA: ekran canlı maçta açık kalıyor; kullanıcı istatistiğe
 * ya da kadroya inerken skoru kaybetmemeli. Bu yüzden hero, daralan başlığın
 * (ScreenHeader 96→48) hemen altında SABİT durur ve yalnız segment içeriği
 * kaydırılır. Segment şeridi hero'ya yapışıktır.
 *
 * NEDEN URL PARAMETRESİ: `/mac/<id>?tab=canli` gol ve "maç başladı"
 * bildirimlerinin varış noktasıdır. Segment ekran durumunda değil ROTADA
 * taşınır; bildirime dokunan kullanıcı doğrudan canlı akışa düşer. Parametre
 * tanınmazsa ya da maç canlı değilse SESSİZCE "ozet" gösterilir (hata yok,
 * uyarı yok) — bildirim geldiğinde maç bitmiş olabilir.
 *
 * VERİ KAYNAKLARI (üçü birleşir, öncelik sırası korunmuştur):
 *   1. maç kaydı        — lig, saha, tarih, kesinleşmiş skor, manşet, video
 *   2. kadro ucu        — oyuncu adları/fotoğrafları çözülmüş kadrolar
 *   3. canlı görüntü    — YALNIZ maç canlıyken: skor, sayaç, olaylar
 * Canlı görüntü varken skor ve olaylar ondan okunur; maç kaydındaki skor
 * ancak maç yayınlandıktan sonra kesinleşir.
 *
 * PERFORMANS: canlı sayaç saniyede bir tikliyor. Bu tik EKRANI değil yalnız
 * `MatchClock` bileşenini yeniden çizsin diye `useLiveClock` ekran gövdesinde
 * DEĞİL o bileşenin içinde çağrılır. Aynı gerekçeyle geri sayım da kendi
 * bileşenindedir. Segmentlerin hepsi sanal liste (FlatList/SectionList) ve
 * satır bileşenleri memo'ludur.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  FlatList,
  Image,
  RefreshControl,
  SectionList,
  Share,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type RefreshControlProps,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { MatchPhotoSlider } from "@/components/MatchPhotoSlider";
import { ShareScoreCard } from "@/components/ShareScoreCard";
import { YoutubeBanner } from "@/components/YoutubeBanner";
import {
  Avatar,
  Badge,
  Card,
  EmptyState,
  ErrorState,
  FormChips,
  KeyValueRow,
  LiveBadge,
  RatingPill,
  ScreenHeader,
  SectionHeader,
  SkeletonCard,
  SkeletonListRow,
  SkeletonStandings,
  StatBar,
  Tabs,
  TeamLogo,
  Touchable,
  refreshControlProps,
  useHeaderScroll,
  useReduceMotion,
  useRefresh,
  useToast,
  type ScreenHeaderAction,
  type TabItem,
} from "@/components/ui";
import { useLiveClock, useLiveMatch } from "@/hooks/useLiveMatch";
import { useTeamLogos } from "@/hooks/useTeamLogos";
import { getMatch, getMatchKadro, getTeamMatches } from "@/lib/api/matches";
import { getStandings } from "@/lib/api/standings";
import { addMatchToCalendar } from "@/lib/calendar";
import { formatClock, formatDateLong, formatDateShort, formatTime, mediaUrl } from "@/lib/format";
import { openLink } from "@/lib/links";
import { eventKind, goalDetail, isSubstitution, isTimelineEvent, matchState } from "@/lib/match";
import { buildContributions, buildStatRows, buildTopPlayers } from "@/lib/matchStats";
import { queryKeys } from "@/lib/queryKeys";
import { youtubeChannelUrl } from "@/lib/youtube";
import { useFavorite } from "@/providers/FavoriteProvider";
import { useScope } from "@/providers/ScopeProvider";
import {
  colors,
  duration,
  easing,
  hairline,
  haptics,
  layout,
  radius,
  space,
  textScale,
  type,
} from "@/theme";
import type { ContribRow, StatRow, TopPlayer } from "@/lib/matchStats";
import type {
  ApiMatch,
  ApiMatchEvent,
  KadroPlayer,
  KadroResponse,
  LiveSnapshot,
  MatchState,
  StandingRow,
} from "@/lib/types";

/* ══════════════════════════════════════════════════════════════════════════
   1) SEGMENTLER VE ROTA PARAMETRESİ
   ══════════════════════════════════════════════════════════════════════════ */

type MatchTab = "ozet" | "canli" | "kadro" | "istatistik" | "h2h" | "puan";

const TAB_KEYS: readonly string[] = ["ozet", "canli", "kadro", "istatistik", "h2h", "puan"];

/**
 * Bildirimden/menüden gelen farklı yazımlar da doğru segmente düşsün.
 * Sunucu tarafı ve web istemcisi İngilizce anahtar gönderebiliyor.
 */
const TAB_ALIASES: Record<string, MatchTab> = {
  summary: "ozet",
  ozeti: "ozet",
  live: "canli",
  canliyayin: "canli",
  lineup: "kadro",
  lineups: "kadro",
  kadrolar: "kadro",
  stats: "istatistik",
  istatistikler: "istatistik",
  headtohead: "h2h",
  gecmis: "h2h",
  standings: "puan",
  puandurumu: "puan",
};

/**
 * Rota anahtarını normalleştirir.
 *
 * TUZAK: `"İSTATİSTİK".toLocaleLowerCase("tr")` noktasız ı üretir, düz
 * `toLowerCase()` ise "İ" için birleşik nokta bırakır; ikisi de ASCII rota
 * anahtarıyla eşleşmez. Önce I ailesi katlanır, sonra küçültülür.
 */
function normalizeKey(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.trim().replace(/[İIı]/g, "i").toLowerCase();
}

function resolveTab(raw: unknown): MatchTab {
  const key = normalizeKey(raw);
  if (TAB_KEYS.includes(key)) return key as MatchTab;
  return TAB_ALIASES[key] ?? "ozet";
}

/** Sorgu parametresi tek değer ya da dizi olarak gelebilir. */
function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/* ══════════════════════════════════════════════════════════════════════════
   2) KÜÇÜK YARDIMCILAR
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Hakem adı henüz `ApiMatch` sözleşmesinde yok; bazı kurulumlarda kayıt
 * `hakem`/`referee` alanıyla geliyor. Alan varsa gösterilir, yoksa satır hiç
 * çizilmez — `any` kullanmadan, tipi genişleterek okunur.
 */
type MatchExtras = { hakem?: string | null; referee?: string | null };

function refereeOf(match: ApiMatch): string | null {
  const extra = match as ApiMatch & MatchExtras;
  const value = (extra.hakem ?? extra.referee ?? "").toString().trim();
  return value.length > 0 ? value : null;
}

/** Maç kaydındaki tarih tam ISO da olabilir; gün kısmı ilk 10 karakterdir. */
const dayOf = (match: Pick<ApiMatch, "date">) => String(match.date ?? "").slice(0, 10);

/** Başlama anı (ms). Okunamayan tarihlerde 0 döner. */
function kickoffAt(match: Pick<ApiMatch, "date" | "time">): number {
  const stamp = Date.parse(`${dayOf(match)}T${match.time || "00:00:00"}`);
  return Number.isFinite(stamp) ? stamp : 0;
}

/** Türkçe küçük harf (İ/I tuzağı) — takım adı karşılaştırmaları bununla yapılır. */
const normalizeName = (value?: string | null) =>
  String(value ?? "").trim().toLocaleLowerCase("tr-TR");

const pad2 = (value: number) => String(value).padStart(2, "0");

/**
 * Devre arası tespiti. Sunucu `matchStatus` alanını her kurulumda aynı yazmıyor;
 * bilinen değerler eşleşmezse "canlı ama sayaç durmuş, ilk devre tamamlanmış"
 * durumu devre arası sayılır (`match_halftime` bildirimiyle aynı an).
 */
const HALFTIME_STATUSES = [
  "devre_arasi",
  "devrearasi",
  "devre arasi",
  "devre arası",
  "halftime",
  "half_time",
  "ht",
  "ara",
];

function isHalftime(snapshot: LiveSnapshot | undefined): boolean {
  if (!snapshot) return false;
  const status = String(snapshot.matchStatus ?? "").trim().toLowerCase();
  if (HALFTIME_STATUSES.includes(status)) return true;
  const timer = snapshot.timer;
  if (!timer) return false;
  return Boolean(snapshot.isLive && !timer.running && (timer.baseMs ?? 0) > 0);
}

/** Olay ailesi → ikon + renk. Zaman çizelgesinin tek görsel sözlüğü. */
const EVENT_VISUAL: Record<
  string,
  { icon: keyof typeof Ionicons.glyphMap; color: string; label: string }
> = {
  goal: { icon: "football", color: colors.win, label: "Gol" },
  ownGoal: { icon: "football-outline", color: colors.live, label: "Kendi kalesine" },
  yellow: { icon: "square", color: colors.yellowCard, label: "Sarı kart" },
  red: { icon: "square", color: colors.redCard, label: "Kırmızı kart" },
  substitution: { icon: "swap-horizontal", color: colors.textSecondary, label: "Değişiklik" },
  other: { icon: "ellipse-outline", color: colors.textTertiary, label: "Olay" },
};

const isGoalKind = (kind: string) => kind === "goal" || kind === "ownGoal";

/* ══════════════════════════════════════════════════════════════════════════
   3) EKRAN KABUĞU
   ══════════════════════════════════════════════════════════════════════════ */

export default function MatchDetailScreen() {
  const params = useLocalSearchParams<{ id: string; tab?: string }>();
  const router = useRouter();
  const scope = useScope();
  const toast = useToast();
  const teams = useTeamLogos();
  const { isFavoriteMatch, toggleFavoriteMatch } = useFavorite();
  const { scrollY, scrollProps } = useHeaderScroll();

  const matchId = Number(firstParam(params.id));
  const validId = Number.isFinite(matchId) && matchId > 0;

  /* ---- Segment: rotadan gelir, rotaya yazılır ---- */
  const routeTab = resolveTab(firstParam(params.tab));
  const [tab, setTab] = useState<MatchTab>(routeTab);

  useEffect(() => {
    setTab(routeTab);
    scrollY.setValue(0);
  }, [routeTab, scrollY]);

  /* ---- Sorgular ---- */
  const matchQuery = useQuery({
    queryKey: queryKeys.match(matchId),
    queryFn: () => getMatch(matchId, ["timeline"]),
    enabled: validId,
  });

  const kadroQuery = useQuery({
    queryKey: [...queryKeys.match(matchId), "kadro"],
    queryFn: () => getMatchKadro(matchId),
    enabled: validId,
    staleTime: 5 * 60_000,
  });

  const match = matchQuery.data;
  const state: MatchState = match ? matchState(match) : "scheduled";
  const live = state === "live";

  const { snapshot, realtime } = useLiveMatch(validId ? matchId : null, live);

  /**
   * Takım kimlikleri. Eski maçlarda `home_team_id` boş olabilir; kadro ucu bu
   * durumda kadrodaki ilk iki takımı ev/deplasman olarak çözer, o da yoksa ada
   * göre eşleşme denenir.
   */
  const homeTeamId = useMemo(() => {
    if (!match) return null;
    const resolved =
      match.home_team_id ??
      kadroQuery.data?.meta?.home_team_id ??
      teams.idFor(null, match.first_team_name);
    return Number(resolved) || null;
  }, [match, kadroQuery.data, teams]);

  const awayTeamId = useMemo(() => {
    if (!match) return null;
    const resolved =
      match.away_team_id ??
      kadroQuery.data?.meta?.away_team_id ??
      teams.idFor(null, match.second_team_name);
    return Number(resolved) || null;
  }, [match, kadroQuery.data, teams]);

  /**
   * "Canlı" segmenti YALNIZ maç canlıyken vardır. Bildirimden `?tab=canli` ile
   * gelindiğinde maç verisi henüz yüklenmemiş olabilir; o yüzden düşüş, durum
   * biliniyorken TÜRETİLİR — veri gelince segment kendiliğinden açılır.
   */
  const activeTab: MatchTab = tab === "canli" && !live ? "ozet" : tab;

  const tabItems = useMemo<TabItem<MatchTab>[]>(() => {
    const items: TabItem<MatchTab>[] = [{ key: "ozet", label: "Özet" }];
    if (live) items.push({ key: "canli", label: "Canlı", badge: "dot" });
    items.push(
      { key: "kadro", label: "Kadrolar" },
      { key: "istatistik", label: "İstatistik" },
      { key: "h2h", label: "H2H" },
      { key: "puan", label: "Puan" },
    );
    return items;
  }, [live]);

  const changeTab = useCallback(
    (next: MatchTab) => {
      setTab(next);
      scrollY.setValue(0); // Yeni listenin tepesindeyiz; başlık yeniden açılsın.
      router.setParams({ tab: next });
    },
    [router, scrollY],
  );

  /* ---- Geçmiş karşılaşmalar: Özet'teki fotoğraflar ve H2H segmenti için ---- */
  const wantsTeamMatches = activeTab === "h2h" || activeTab === "ozet";

  const homeMatchesQuery = useQuery({
    queryKey: queryKeys.teamMatches(homeTeamId ?? 0),
    queryFn: () => getTeamMatches(homeTeamId as number),
    enabled: wantsTeamMatches && Boolean(homeTeamId),
    staleTime: 60_000,
  });

  const awayMatchesQuery = useQuery({
    queryKey: queryKeys.teamMatches(awayTeamId ?? 0),
    queryFn: () => getTeamMatches(awayTeamId as number),
    enabled: wantsTeamMatches && Boolean(awayTeamId),
    staleTime: 60_000,
  });

  /* ---- Puan durumu: maçın KENDİ ligi/sezonu (ekrandaki kapsam değil) ---- */
  const standingsScope = useMemo(
    () => ({
      cityId: match?.city_id ?? scope.cityId ?? undefined,
      leagueId: match?.league_id ?? undefined,
      seasonId: match?.season_id ?? undefined,
    }),
    [match?.city_id, match?.league_id, match?.season_id, scope.cityId],
  );

  const standingsQuery = useQuery({
    queryKey: queryKeys.standings(standingsScope),
    queryFn: () =>
      getStandings({
        cityId: standingsScope.cityId as number,
        leagueId: standingsScope.leagueId as number,
        seasonId: standingsScope.seasonId as number,
      }),
    enabled:
      activeTab === "puan" && Boolean(standingsScope.leagueId && standingsScope.seasonId),
    staleTime: 60_000,
  });

  /* ---- Olaylar ve türetilmiş veriler ---- */
  const events = useMemo<ApiMatchEvent[]>(
    () => snapshot?.events ?? match?.timeline ?? [],
    [snapshot?.events, match?.timeline],
  );

  /** Zaman çizelgesi: eskiden yeniye (Özet). Canlı akış bunun tersini kullanır. */
  const timeline = useMemo(
    () =>
      events
        .filter(isTimelineEvent)
        .slice()
        .sort((a, b) => (a.dakika ?? 0) - (b.dakika ?? 0) || a.id - b.id),
    [events],
  );

  const statRows = useMemo(
    () => buildStatRows(events, homeTeamId, awayTeamId),
    [events, homeTeamId, awayTeamId],
  );
  const bestPlayers = useMemo(
    () => buildTopPlayers(events, kadroQuery.data),
    [events, kadroQuery.data],
  );
  const contributions = useMemo(
    () => buildContributions(events, kadroQuery.data),
    [events, kadroQuery.data],
  );

  const nameOf = usePlayerNames(kadroQuery.data);
  const substitutions = useSubstitutions(events);

  const homeLogo = teams.logoFor(match?.home_team_id, match?.first_team_name);
  const awayLogo = teams.logoFor(match?.away_team_id, match?.second_team_name);

  const homeScore = snapshot?.homeScore ?? match?.first_team_score ?? null;
  const awayScore = snapshot?.awayScore ?? match?.second_team_score ?? null;

  const meetings = useHeadToHead({
    match,
    homeTeamId,
    awayTeamId,
    homeMatches: homeMatchesQuery.data,
    awayMatches: awayMatchesQuery.data,
  });

  /* ---- Başlık eylemleri ---- */
  const favorite = isFavoriteMatch(matchId);

  const toggleStar = useCallback(() => {
    if (!validId) return;
    toggleFavoriteMatch(matchId);
    toast.show({
      message: favorite
        ? "Maç favorilerden çıkarıldı."
        : "Maç favorilere eklendi — gollerini bildirim olarak alacaksın.",
      tone: favorite ? "neutral" : "success",
      icon: favorite ? "star-outline" : "star",
    });
  }, [favorite, matchId, toast, toggleFavoriteMatch, validId]);

  const addToCalendar = useCallback(() => {
    if (!match) return;
    void addMatchToCalendar(match);
  }, [match]);

  const shareMatch = useCallback(() => {
    if (!match) return;
    const score =
      state === "scheduled"
        ? `${formatDateShort(match.date)} ${formatTime(match.time)}`
        : `${homeScore ?? 0} - ${awayScore ?? 0}`;
    const lines = [
      `${match.first_team_name} ${score} ${match.second_team_name}`,
      [match.league_name, match.match_season].filter(Boolean).join(" · "),
      match.match_field ? `Saha: ${match.match_field}` : null,
      "ElitLig",
    ].filter(Boolean) as string[];
    void Share.share({ message: lines.join("\n") });
  }, [awayScore, homeScore, match, state]);

  const actions = useMemo<ScreenHeaderAction[]>(() => {
    if (!match) return [];
    const list: ScreenHeaderAction[] = [
      {
        icon: favorite ? "star" : "star-outline",
        tone: favorite ? "warn" : undefined,
        onPress: toggleStar,
        accessibilityLabel: favorite ? "Maçı favorilerden çıkar" : "Maçı favoriye al",
      },
    ];
    // Takvim yalnız oynanmamış maçta anlamlı.
    if (state === "scheduled") {
      list.push({
        icon: "calendar-outline",
        onPress: addToCalendar,
        accessibilityLabel: "Maçı takvime ekle",
      });
    }
    list.push({
      icon: "share-social-outline",
      onPress: shareMatch,
      accessibilityLabel: "Maçı paylaş",
    });
    return list;
  }, [addToCalendar, favorite, match, shareMatch, state, toggleStar]);

  /* ---- Yenileme: açık olan segmentin kaynaklarını tazeler ---- */
  const refetchAll = useCallback(() => {
    void matchQuery.refetch();
    void kadroQuery.refetch();
    if (wantsTeamMatches) {
      void homeMatchesQuery.refetch();
      void awayMatchesQuery.refetch();
    }
    if (activeTab === "puan") void standingsQuery.refetch();
  }, [
    activeTab,
    awayMatchesQuery,
    homeMatchesQuery,
    kadroQuery,
    matchQuery,
    standingsQuery,
    wantsTeamMatches,
  ]);

  const refresh = useRefresh(refetchAll, { refreshing: matchQuery.isRefetching });

  /* ---- Erken çıkışlar ---- */
  if (!validId) {
    return (
      <SafeAreaView style={styles.screen} edges={["top"]}>
        <ScreenHeader title="Maç" back />
        <EmptyState
          icon="alert-circle-outline"
          title="Maç bulunamadı"
          body="Bağlantıdaki maç numarası okunamadı."
          action={{ label: "Maçlara dön", onPress: () => router.replace("/") }}
        />
      </SafeAreaView>
    );
  }

  if (matchQuery.isLoading) {
    return (
      <SafeAreaView style={styles.screen} edges={["top"]}>
        <ScreenHeader title="Maç" back />
        <View style={styles.loading}>
          <SkeletonCard lines={3} />
          <SkeletonListRow count={6} />
        </View>
      </SafeAreaView>
    );
  }

  if (matchQuery.isError || !match) {
    return (
      <SafeAreaView style={styles.screen} edges={["top"]}>
        <ScreenHeader title="Maç" back />
        <ErrorState error={matchQuery.error} onRetry={matchQuery.refetch} />
      </SafeAreaView>
    );
  }

  const refreshControl = (
    <RefreshControl {...refreshControlProps(refresh.refreshing, refresh.onRefresh)} />
  );

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader
        title={`${match.first_team_name} – ${match.second_team_name}`}
        overline={match.league_name}
        subtitle={match.match_season ?? undefined}
        back
        scrollY={scrollY}
        actions={actions}
        bottom={
          <View>
            <MatchHero
              match={match}
              state={state}
              live={live}
              realtime={realtime}
              snapshot={snapshot}
              homeScore={homeScore}
              awayScore={awayScore}
              homeLogo={homeLogo}
              awayLogo={awayLogo}
              homeTeamId={homeTeamId}
              awayTeamId={awayTeamId}
            />
            <Tabs items={tabItems} value={activeTab} onChange={changeTab} sticky />
          </View>
        }
      />

      {activeTab === "ozet" ? (
        <SummaryTab
          match={match}
          state={state}
          live={live}
          timeline={timeline}
          meetings={meetings}
          homeTeamId={homeTeamId}
          nameOf={nameOf}
          bestPlayers={bestPlayers}
          statRows={statRows}
          contributions={contributions}
          homeScore={homeScore}
          awayScore={awayScore}
          homeLogo={homeLogo}
          awayLogo={awayLogo}
          scrollProps={scrollProps}
          refreshControl={refreshControl}
        />
      ) : activeTab === "canli" ? (
        <LiveTab
          match={match}
          snapshot={snapshot}
          realtime={realtime}
          timeline={timeline}
          homeTeamId={homeTeamId}
          nameOf={nameOf}
          scrollProps={scrollProps}
          refreshControl={refreshControl}
        />
      ) : activeTab === "kadro" ? (
        <LineupTab
          match={match}
          kadro={kadroQuery.data}
          loading={kadroQuery.isLoading}
          error={kadroQuery.isError ? kadroQuery.error : null}
          onRetry={kadroQuery.refetch}
          contributions={contributions}
          substitutions={substitutions}
          scrollProps={scrollProps}
          refreshControl={refreshControl}
        />
      ) : activeTab === "istatistik" ? (
        <StatsTab
          match={match}
          statRows={statRows}
          bestPlayers={bestPlayers}
          homeLogo={homeLogo}
          awayLogo={awayLogo}
          scrollProps={scrollProps}
          refreshControl={refreshControl}
        />
      ) : activeTab === "h2h" ? (
        <HeadToHeadTab
          match={match}
          meetings={meetings}
          homeTeamId={homeTeamId}
          awayTeamId={awayTeamId}
          homeMatches={homeMatchesQuery.data}
          awayMatches={awayMatchesQuery.data}
          loading={homeMatchesQuery.isLoading || awayMatchesQuery.isLoading}
          homeLogo={homeLogo}
          awayLogo={awayLogo}
          scrollProps={scrollProps}
          refreshControl={refreshControl}
        />
      ) : (
        <StandingsTab
          rows={standingsQuery.data}
          loading={standingsQuery.isLoading}
          error={standingsQuery.isError ? standingsQuery.error : null}
          onRetry={standingsQuery.refetch}
          scoped={Boolean(standingsScope.leagueId && standingsScope.seasonId)}
          homeTeamId={homeTeamId}
          awayTeamId={awayTeamId}
          scrollProps={scrollProps}
          refreshControl={refreshControl}
        />
      )}
    </SafeAreaView>
  );
}

/** Her segmentin listesine geçen ortak kaydırma bağlantısı. */
interface ScrollChrome {
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  scrollEventThrottle: number;
}

/* ══════════════════════════════════════════════════════════════════════════
   4) HERO — sabit tabela
   ══════════════════════════════════════════════════════════════════════════ */

const MatchHero = memo(function MatchHero({
  match,
  state,
  live,
  realtime,
  snapshot,
  homeScore,
  awayScore,
  homeLogo,
  awayLogo,
  homeTeamId,
  awayTeamId,
}: {
  match: ApiMatch;
  state: MatchState;
  live: boolean;
  realtime: boolean;
  snapshot: LiveSnapshot | undefined;
  homeScore: number | null;
  awayScore: number | null;
  homeLogo: string | null;
  awayLogo: string | null;
  homeTeamId: number | null;
  awayTeamId: number | null;
}) {
  const router = useRouter();
  const played = state !== "scheduled";

  const openHome = useCallback(() => {
    if (homeTeamId) router.push(`/takim/${homeTeamId}`);
  }, [homeTeamId, router]);
  const openAway = useCallback(() => {
    if (awayTeamId) router.push(`/takim/${awayTeamId}`);
  }, [awayTeamId, router]);

  const meta = [
    formatDateLong(match.date),
    formatTime(match.time),
    match.match_field ?? null,
    refereeOf(match) ? `Hakem: ${refereeOf(match)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <View style={styles.hero}>
      <View style={styles.heroTeams}>
        <Touchable
          style={styles.heroTeam}
          feedback="row"
          haptic="selection"
          disabled={!homeTeamId}
          onPress={openHome}
          accessibilityRole="button"
          accessibilityLabel={`${match.first_team_name} takım sayfası`}
        >
          <TeamLogo name={match.first_team_name} logo={homeLogo} size={44} />
          <Text style={styles.heroTeamName} numberOfLines={2} {...textScale.dense}>
            {match.first_team_name}
          </Text>
        </Touchable>

        <View style={styles.heroCenter}>
          {played ? (
            <Text style={[styles.heroScore, live && styles.heroScoreLive]} {...textScale.dense}>
              {homeScore ?? 0}
              <Text style={styles.heroScoreDash}> - </Text>
              {awayScore ?? 0}
            </Text>
          ) : (
            <Text style={styles.heroKickoff} {...textScale.dense}>
              {formatTime(match.time) || "—"}
            </Text>
          )}

          {live ? (
            <MatchClock snapshot={snapshot} />
          ) : state === "finished" ? (
            <Badge label="MS" tone="neutral" size="xs" />
          ) : (
            <Countdown target={kickoffAt(match)} />
          )}
        </View>

        <Touchable
          style={styles.heroTeam}
          feedback="row"
          haptic="selection"
          disabled={!awayTeamId}
          onPress={openAway}
          accessibilityRole="button"
          accessibilityLabel={`${match.second_team_name} takım sayfası`}
        >
          <TeamLogo name={match.second_team_name} logo={awayLogo} size={44} />
          <Text style={styles.heroTeamName} numberOfLines={2} {...textScale.dense}>
            {match.second_team_name}
          </Text>
        </Touchable>
      </View>

      {meta ? (
        <Text style={styles.heroMeta} numberOfLines={1} {...textScale.dense}>
          {meta}
        </Text>
      ) : null}

      {live && !realtime ? <ReconnectStrip /> : null}
    </View>
  );
});

/**
 * Canlı sayaç. `useLiveClock` SANİYEDE BİR tikler; bu yüzden ekran gövdesinde
 * değil burada çağrılır — yeniden çizilen tek şey bu küçük rozettir.
 */
const MatchClock = memo(function MatchClock({ snapshot }: { snapshot: LiveSnapshot | undefined }) {
  const clockMs = useLiveClock(snapshot);
  const halftime = isHalftime(snapshot);
  const minute = clockMs != null ? Math.floor(clockMs / 60_000) : null;

  return (
    <View style={styles.heroClock}>
      <LiveBadge minute={halftime ? null : minute} halftime={halftime} size="md" />
    </View>
  );
});

/**
 * Geri sayım — yaklaşan maçta başlama saatinin altında. Kendi bileşenidir,
 * saniyelik tik ekranın geri kalanını çizmez.
 */
const Countdown = memo(function Countdown({ target }: { target: number }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!target) return;
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [target]);

  if (!target) return null;
  const diff = target - now;
  if (diff <= 0) return <Text style={styles.heroCountdown}>Başlamak üzere</Text>;

  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor((diff % 86_400_000) / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);
  const seconds = Math.floor((diff % 60_000) / 1_000);

  const label =
    days > 0
      ? `${days} gün ${hours} sa`
      : hours > 0
        ? `${hours} sa ${pad2(minutes)} dk`
        : `${pad2(minutes)}:${pad2(seconds)}`;

  return (
    <Text style={styles.heroCountdown} {...textScale.dense}>
      {label}
    </Text>
  );
});

/** Soket koptuğunda: veri akmaya devam ediyor ama yoklamayla. */
const ReconnectStrip = memo(function ReconnectStrip() {
  return (
    <View style={styles.reconnect}>
      <Ionicons name="cloud-offline-outline" size={13} color={colors.warn} />
      <Text style={styles.reconnectText} numberOfLines={2} {...textScale.dense}>
        Anlık bağlantı kurulamadı — yeniden bağlanılıyor. Skor kısa aralıklarla yenileniyor.
      </Text>
    </View>
  );
});

/* ══════════════════════════════════════════════════════════════════════════
   5) ÖZET
   ══════════════════════════════════════════════════════════════════════════ */

function SummaryTab({
  match,
  state,
  live,
  timeline,
  meetings,
  homeTeamId,
  nameOf,
  bestPlayers,
  statRows,
  contributions,
  homeScore,
  awayScore,
  homeLogo,
  awayLogo,
  scrollProps,
  refreshControl,
}: {
  match: ApiMatch;
  state: MatchState;
  live: boolean;
  timeline: ApiMatchEvent[];
  meetings: ApiMatch[];
  homeTeamId: number | null;
  nameOf: (playerId?: number | null) => string | null;
  bestPlayers: TopPlayer[];
  statRows: StatRow[];
  contributions: { home: ContribRow[]; away: ContribRow[] };
  homeScore: number | null;
  awayScore: number | null;
  homeLogo: string | null;
  awayLogo: string | null;
  scrollProps: ScrollChrome;
  refreshControl: React.ReactElement<RefreshControlProps>;
}) {
  const router = useRouter();

  const mvpId = match.match_mvp ? Number(match.match_mvp) : null;
  const mvpName = mvpId ? nameOf(mvpId) : null;

  /**
   * "TAKIM1 vs TAKIM2" gibi otomatik başlıklar tabelayı tekrar eder; gizlenir.
   */
  const headline = useMemo(() => {
    const raw = match.match_title?.trim();
    if (!raw) return null;
    const squash = (value: string) =>
      value.toLocaleLowerCase("tr-TR").replace(/[\s·|-]+/g, " ").replace(/\bvs\.?\b/g, "vs").trim();
    const trivial = squash(raw) === squash(`${match.first_team_name} vs ${match.second_team_name}`);
    return trivial ? null : raw;
  }, [match.first_team_name, match.match_title, match.second_team_name]);

  /** Fotoğraf şeridi: bu maç + aynı eşleşmenin geçmiş maçları (fotoğrafı olanlar). */
  const photoMatches = useMemo(() => {
    const seen = new Set<number>([Number(match.id)]);
    const list: ApiMatch[] = [match];
    for (const item of meetings) {
      const id = Number(item.id);
      if (seen.has(id)) continue;
      seen.add(id);
      list.push(item);
    }
    return list;
  }, [match, meetings]);

  /** Şerit yalnız gerçekten fotoğraf varsa çizilir; bileşen boşsa null döner. */
  const hasPhotos = useMemo(
    () => photoMatches.some((item) => matchState(item) === "finished" && Boolean(item.match_picture)),
    [photoMatches],
  );

  const videoUrl = mediaUrl(match.match_video);
  const channelUrl = youtubeChannelUrl(match.city);
  const watchUrl = videoUrl || channelUrl;
  const videoId = videoUrl ? extractYouTubeId(videoUrl) : null;
  const thumbnail = videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : null;

  const openPlayer = useCallback(
    (playerId: number) => router.push(`/oyuncu/${playerId}`),
    [router],
  );

  const infoRows = useMemo(() => {
    const referee = refereeOf(match);
    const rows: { label: string; value: string }[] = [
      { label: "Lig", value: match.league_name || "—" },
    ];
    if (match.match_season) rows.push({ label: "Sezon", value: match.match_season });
    rows.push({ label: "Tarih", value: formatDateLong(match.date) || "—" });
    rows.push({ label: "Başlama", value: formatTime(match.time) || "—" });
    if (match.match_field) rows.push({ label: "Saha", value: match.match_field });
    if (referee) rows.push({ label: "Hakem", value: referee });
    if (match.city) rows.push({ label: "Şehir", value: match.city });
    rows.push({
      label: "Durum",
      value: state === "live" ? "Canlı" : state === "finished" ? "Tamamlandı" : "Oynanmadı",
    });
    return rows;
  }, [match, state]);

  const renderEvent = useCallback(
    ({ item }: { item: ApiMatchEvent }) => (
      <TimelineRow
        event={item}
        home={Number(item.takim_id) === Number(homeTeamId)}
        nameOf={nameOf}
        onOpenPlayer={openPlayer}
      />
    ),
    [homeTeamId, nameOf, openPlayer],
  );

  return (
    <FlatList
      {...scrollProps}
      data={timeline}
      keyExtractor={eventKey}
      renderItem={renderEvent}
      refreshControl={refreshControl}
      contentContainerStyle={styles.listContent}
      initialNumToRender={12}
      windowSize={9}
      ListHeaderComponent={
        <View style={styles.block}>
          {live ? (
            <View style={styles.inset}>
              <YoutubeBanner cityLabel={match.city} live />
            </View>
          ) : null}

          {state !== "live" ? (
            <View style={styles.inset}>
              <ShareScoreCard
                mode={state === "finished" ? "fulltime" : "matchday"}
                match={match}
                homeScore={homeScore}
                awayScore={awayScore}
                mvp={bestPlayers[0] ?? null}
                stats={statRows}
                contributions={contributions}
                homeLogo={homeLogo}
                awayLogo={awayLogo}
              />
            </View>
          ) : null}

          {headline ? (
            <Card title="Maç manşeti" padding="md" style={styles.inset}>
              <Text style={styles.headline} {...textScale.long}>
                {headline}
              </Text>
            </Card>
          ) : null}

          {hasPhotos ? (
            <View style={styles.photoBlock}>
              <SectionHeader title="Maç fotoğrafları" />
              <MatchPhotoSlider matches={photoMatches} />
            </View>
          ) : null}

          {mvpId && mvpName ? (
            <Touchable
              feedback="card"
              haptic="selection"
              onPress={() => openPlayer(mvpId)}
              style={styles.mvpRow}
              accessibilityRole="button"
              accessibilityLabel={`Maçın yıldızı ${mvpName}`}
            >
              <View style={styles.mvpIcon}>
                <Ionicons name="star" size={16} color={colors.star} />
              </View>
              <View style={styles.mvpBody}>
                <Text style={styles.overline} {...textScale.badge}>
                  MAÇIN YILDIZI
                </Text>
                <Text style={styles.mvpName} numberOfLines={1} {...textScale.dense}>
                  {mvpName}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
            </Touchable>
          ) : null}

          {watchUrl || match.post_rapor ? (
            <>
              <SectionHeader title="Maç içeriği" />
              <View style={styles.contentRow}>
                {watchUrl ? (
                  <Touchable
                    feedback="card"
                    haptic="light"
                    onPress={() => void openLink(watchUrl)}
                    style={styles.videoCard}
                    accessibilityRole="link"
                    accessibilityLabel={videoUrl ? "Maç videosunu izle" : "YouTube kanalına git"}
                  >
                    <View style={styles.videoThumb}>
                      {thumbnail ? (
                        <Image
                          source={{ uri: thumbnail }}
                          style={StyleSheet.absoluteFill}
                          resizeMode="cover"
                        />
                      ) : (
                        <Ionicons name="logo-youtube" size={26} color={colors.live} />
                      )}
                      {videoUrl ? (
                        <View style={styles.videoPlay}>
                          <Ionicons name="play" size={13} color={colors.textOnStatus} />
                        </View>
                      ) : null}
                    </View>
                    <Text style={styles.videoLabel} {...textScale.badge}>
                      {videoUrl ? "MAÇI İZLE" : "KANAL"}
                    </Text>
                  </Touchable>
                ) : null}

                <View style={styles.reportBox}>
                  <Text style={styles.overline} {...textScale.badge}>
                    MAÇ ÖZETİ
                  </Text>
                  {match.post_rapor ? (
                    <Text style={styles.reportText} numberOfLines={6} {...textScale.long}>
                      {match.post_rapor}
                    </Text>
                  ) : (
                    <Text style={styles.reportEmpty} {...textScale.long}>
                      Maç özeti henüz eklenmemiş.
                    </Text>
                  )}
                </View>
              </View>
            </>
          ) : null}

          <SectionHeader title="Maç akışı" meta={timeline.length ? `${timeline.length} olay` : undefined} />
        </View>
      }
      ListEmptyComponent={
        <EmptyState
          icon="time-outline"
          variant="inline"
          title="Olay yok"
          body="Bu maç için henüz gol, kart ya da değişiklik girilmemiş."
        />
      }
      ListFooterComponent={
        <View style={styles.block}>
          <SectionHeader title="Maç bilgileri" />
          <View style={styles.group}>
            {infoRows.map((row, index) => (
              <KeyValueRow
                key={row.label}
                label={row.label}
                value={row.value}
                position={rowPosition(index, infoRows.length)}
              />
            ))}
          </View>

          {match.post_manset || match.match_comment ? (
            <>
              <SectionHeader title="Maç notu" />
              <View style={styles.noteBox}>
                <Text style={styles.noteText} {...textScale.long}>
                  {match.post_manset || match.match_comment}
                </Text>
              </View>
            </>
          ) : null}
        </View>
      }
    />
  );
}

/**
 * Zaman çizelgesi satırı — ortada dakika, olay hangi takımınsa o yanda.
 * İki sütunlu düzen "kim yaptı" sorusunu okumadan yanıtlar.
 */
const TimelineRow = memo(function TimelineRow({
  event,
  home,
  nameOf,
  onOpenPlayer,
}: {
  event: ApiMatchEvent;
  home: boolean;
  nameOf: (playerId?: number | null) => string | null;
  onOpenPlayer: (playerId: number) => void;
}) {
  const kind = eventKind(event);
  const visual = EVENT_VISUAL[kind] ?? EVENT_VISUAL.other;
  const detail = kind === "goal" ? goalDetail(event) : kind === "ownGoal" ? "kendi kalesine" : null;

  const label =
    kind === "substitution"
      ? [nameOf(event.oyuncu_giren_id), nameOf(event.oyuncu_cikan_id)].filter(Boolean).join(" → ") ||
        "Oyuncu değişikliği"
      : nameOf(event.oyuncu_id) || event.aciklama || visual.label;

  const playerId = Number(event.oyuncu_id) || null;
  const open = useCallback(() => {
    if (playerId) onOpenPlayer(playerId);
  }, [onOpenPlayer, playerId]);

  const bubble = (
    <Touchable
      feedback="row"
      haptic="selection"
      disabled={!playerId}
      onPress={open}
      style={[styles.tlBubble, home ? styles.tlBubbleHome : styles.tlBubbleAway]}
      accessibilityRole={playerId ? "button" : "text"}
      accessibilityLabel={`${event.dakika ?? "?"}. dakika ${visual.label}: ${label}`}
    >
      {home ? <Ionicons name={visual.icon} size={14} color={visual.color} /> : null}
      <View style={styles.tlTexts}>
        <Text
          style={[styles.tlName, home ? styles.tlAlignLeft : styles.tlAlignRight]}
          numberOfLines={1}
          {...textScale.dense}
        >
          {label}
        </Text>
        {detail ? (
          <Text
            style={[styles.tlDetail, home ? styles.tlAlignLeft : styles.tlAlignRight]}
            numberOfLines={1}
            {...textScale.dense}
          >
            {detail}
          </Text>
        ) : null}
      </View>
      {home ? null : <Ionicons name={visual.icon} size={14} color={visual.color} />}
    </Touchable>
  );

  return (
    <View style={styles.tlRow}>
      <View style={styles.tlSide}>{home ? bubble : null}</View>

      <View style={styles.tlCenter}>
        <View style={styles.tlLine} />
        <View style={[styles.tlMinute, { borderColor: visual.color }]}>
          <Text style={[styles.tlMinuteText, { color: visual.color }]} {...textScale.badge}>
            {event.dakika != null ? `${event.dakika}'` : "—"}
          </Text>
        </View>
        <View style={styles.tlLine} />
      </View>

      <View style={styles.tlSide}>{home ? null : bubble}</View>
    </View>
  );
});

/* ══════════════════════════════════════════════════════════════════════════
   6) CANLI — dakika dakika akış (yalnız maç canlıyken)
   ══════════════════════════════════════════════════════════════════════════ */

function LiveTab({
  match,
  snapshot,
  realtime,
  timeline,
  homeTeamId,
  nameOf,
  scrollProps,
  refreshControl,
}: {
  match: ApiMatch;
  snapshot: LiveSnapshot | undefined;
  realtime: boolean;
  timeline: ApiMatchEvent[];
  homeTeamId: number | null;
  nameOf: (playerId?: number | null) => string | null;
  scrollProps: ScrollChrome;
  refreshControl: React.ReactElement<RefreshControlProps>;
}) {
  /** Akış ters okunur: en yeni olay en üstte. */
  const feed = useMemo(() => timeline.slice().reverse(), [timeline]);
  const flashId = useGoalFlash(timeline);

  const renderItem = useCallback(
    ({ item }: { item: ApiMatchEvent }) => (
      <LiveEventRow
        event={item}
        homeSide={Number(item.takim_id) === Number(homeTeamId)}
        teamName={
          Number(item.takim_id) === Number(homeTeamId)
            ? match.first_team_name
            : match.second_team_name
        }
        nameOf={nameOf}
        flash={flashId != null && Number(item.id) === flashId}
      />
    ),
    [flashId, homeTeamId, match.first_team_name, match.second_team_name, nameOf],
  );

  return (
    <FlatList
      {...scrollProps}
      data={feed}
      keyExtractor={eventKey}
      renderItem={renderItem}
      refreshControl={refreshControl}
      contentContainerStyle={styles.listContent}
      initialNumToRender={14}
      windowSize={9}
      ListHeaderComponent={
        <View style={styles.block}>
          <View style={styles.liveStatus}>
            <View style={styles.liveStatusLeft}>
              <View style={[styles.liveDot, realtime ? styles.liveDotOn : styles.liveDotOff]} />
              <Text style={styles.liveStatusText} {...textScale.dense}>
                {realtime ? "Anlık bağlantı açık" : "Yoklama yedeği çalışıyor"}
              </Text>
            </View>
            <LiveElapsed snapshot={snapshot} />
          </View>

          {!realtime ? (
            <View style={styles.inset}>
              <ReconnectStrip />
            </View>
          ) : null}

          <SectionHeader title="Olay akışı" meta="en yeni üstte" />
        </View>
      }
      ListEmptyComponent={
        <EmptyState
          icon="pulse-outline"
          variant="inline"
          title="Akış boş"
          body="Maç başladı ama henüz kayda değer bir olay yok. İlk gol geldiğinde burada belirir."
        />
      }
    />
  );
}

/** Canlı akış başlığındaki büyük sayaç — saniyelik tik yalnız burada. */
const LiveElapsed = memo(function LiveElapsed({
  snapshot,
}: {
  snapshot: LiveSnapshot | undefined;
}) {
  const clockMs = useLiveClock(snapshot);
  const halftime = isHalftime(snapshot);

  return (
    <Text style={styles.liveElapsed} {...textScale.dense}>
      {halftime ? "Devre arası" : formatClock(clockMs) || "—"}
    </Text>
  );
});

/**
 * Canlı akış satırı. Gol olayında satır vurgulanır; YENİ gelen golde ayrıca
 * kısa bir flaş çalar (üç darbe, hareket azaltma açıksa flaş yok).
 */
const LiveEventRow = memo(function LiveEventRow({
  event,
  homeSide,
  teamName,
  nameOf,
  flash,
}: {
  event: ApiMatchEvent;
  homeSide: boolean;
  teamName: string;
  nameOf: (playerId?: number | null) => string | null;
  flash: boolean;
}) {
  const kind = eventKind(event);
  const visual = EVENT_VISUAL[kind] ?? EVENT_VISUAL.other;
  const goal = isGoalKind(kind);
  const glow = useRef(new Animated.Value(0)).current;
  const reduceMotion = useReduceMotion();

  useEffect(() => {
    // Vurgu zaten satır zemininde var; flaş yalnızca hareket açıkken oynar.
    if (!flash || reduceMotion) return;
    const pulse = Animated.sequence([
      Animated.timing(glow, {
        toValue: 1,
        duration: duration.base,
        easing: easing.decelerate,
        useNativeDriver: true,
      }),
      Animated.timing(glow, {
        toValue: 0,
        duration: duration.base * 2,
        easing: easing.decelerate,
        useNativeDriver: true,
      }),
    ]);
    const loop = Animated.loop(pulse, { iterations: 3 });
    loop.start();
    return () => {
      loop.stop();
      glow.setValue(0);
    };
  }, [flash, glow, reduceMotion]);

  const label =
    kind === "substitution"
      ? [nameOf(event.oyuncu_giren_id), nameOf(event.oyuncu_cikan_id)].filter(Boolean).join(" → ") ||
        "Oyuncu değişikliği"
      : nameOf(event.oyuncu_id) || event.aciklama || visual.label;

  const detail = kind === "goal" ? goalDetail(event) : kind === "ownGoal" ? "kendi kalesine" : null;

  return (
    <View style={[styles.feedRow, goal && styles.feedRowGoal]}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.feedFlash,
          // Tam opak dolgu metni yutar; flaş bir "parlama" kadar kalır.
          { opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0, 0.3] }) },
        ]}
      />

      <View style={styles.feedMinute}>
        <Text style={styles.feedMinuteText} {...textScale.badge}>
          {event.dakika != null ? `${event.dakika}'` : "—"}
        </Text>
      </View>

      <View style={[styles.feedIcon, goal && styles.feedIconGoal]}>
        <Ionicons name={visual.icon} size={15} color={visual.color} />
      </View>

      <View style={styles.feedBody}>
        <Text style={[styles.feedName, goal && styles.feedNameGoal]} numberOfLines={1} {...textScale.dense}>
          {label}
        </Text>
        <Text style={styles.feedMeta} numberOfLines={1} {...textScale.dense}>
          {[visual.label, detail, teamName].filter(Boolean).join(" · ")}
        </Text>
      </View>

      <View style={[styles.feedSide, homeSide ? styles.feedSideHome : styles.feedSideAway]} />
    </View>
  );
});

/* ══════════════════════════════════════════════════════════════════════════
   7) KADROLAR
   ══════════════════════════════════════════════════════════════════════════ */

interface LineupSection {
  title: string;
  meta?: string;
  data: KadroPlayer[];
}

function LineupTab({
  match,
  kadro,
  loading,
  error,
  onRetry,
  contributions,
  substitutions,
  scrollProps,
  refreshControl,
}: {
  match: ApiMatch;
  kadro: KadroResponse | undefined;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  contributions: { home: ContribRow[]; away: ContribRow[] };
  substitutions: Map<number, SubInfo>;
  scrollProps: ScrollChrome;
  refreshControl: React.ReactElement<RefreshControlProps>;
}) {
  const router = useRouter();

  /** Oyuncu katkıları id ile aranır: satırın sağındaki G/A/K rozetleri buradan. */
  const contribById = useMemo(() => {
    const map = new Map<number, ContribRow>();
    for (const row of [...contributions.home, ...contributions.away]) {
      if (row.playerId) map.set(Number(row.playerId), row);
    }
    return map;
  }, [contributions]);

  const sections = useMemo<LineupSection[]>(() => {
    const build = (teamName: string, rows: KadroPlayer[] | undefined): LineupSection[] => {
      const list = rows ?? [];
      if (!list.length) return [];
      const starters = list.filter((row) => row.role === "starter");
      const subs = list.filter((row) => row.role !== "starter");
      const result: LineupSection[] = [];
      if (starters.length) {
        result.push({ title: teamName, meta: `İlk 11 · ${starters.length}`, data: starters });
      }
      if (subs.length) {
        result.push({ title: `${teamName} · Yedekler`, meta: String(subs.length), data: subs });
      }
      return result;
    };
    return [
      ...build(match.first_team_name, kadro?.home),
      ...build(match.second_team_name, kadro?.away),
    ];
  }, [kadro, match.first_team_name, match.second_team_name]);

  const openPlayer = useCallback(
    (playerId: number) => router.push(`/oyuncu/${playerId}`),
    [router],
  );

  const renderItem = useCallback(
    ({ item }: { item: KadroPlayer }) => {
      const playerId = Number(item.playerId ?? item.oyuncu_id) || null;
      return (
        <LineupPlayerRow
          player={item}
          contrib={playerId ? contribById.get(playerId) ?? null : null}
          sub={playerId ? substitutions.get(playerId) ?? null : null}
          onOpen={openPlayer}
        />
      );
    },
    [contribById, openPlayer, substitutions],
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: LineupSection }) => (
      <SectionHeader title={section.title} meta={section.meta} sticky />
    ),
    [],
  );

  if (loading) {
    return (
      <View style={styles.loading}>
        <SkeletonListRow count={8} avatar />
      </View>
    );
  }

  if (error && !kadro) {
    return <ErrorState error={error} onRetry={onRetry} />;
  }

  if (!sections.length) {
    return (
      <EmptyState
        icon="people-outline"
        title="Kadrolar açıklanmadı"
        body="Takımlar kadrolarını girdiğinde ilk 11 ve yedekler burada görünür."
      />
    );
  }

  return (
    <SectionList
      {...scrollProps}
      sections={sections}
      keyExtractor={playerKey}
      renderItem={renderItem}
      renderSectionHeader={renderSectionHeader}
      refreshControl={refreshControl}
      contentContainerStyle={styles.listContent}
      stickySectionHeadersEnabled
      initialNumToRender={14}
      windowSize={9}
    />
  );
}

/** Oyuncu değişikliği bilgisi: kaçıncı dakikada girdi / çıktı. */
interface SubInfo {
  in?: number | null;
  out?: number | null;
}

const LineupPlayerRow = memo(function LineupPlayerRow({
  player,
  contrib,
  sub,
  onOpen,
}: {
  player: KadroPlayer;
  contrib: ContribRow | null;
  sub: SubInfo | null;
  onOpen: (playerId: number) => void;
}) {
  const playerId = Number(player.playerId ?? player.oyuncu_id) || null;
  // Misafir oyuncuların kalıcı profili yoktur.
  const linkable = Boolean(playerId) && !player.isGuest;
  const name = player.playerName || player.guestName || "İsimsiz oyuncu";
  const rating = player.puan != null ? Number(player.puan) : null;
  const shirt = player.number === "" || player.number == null ? "-" : String(player.number);

  const open = useCallback(() => {
    if (playerId) onOpen(playerId);
  }, [onOpen, playerId]);

  return (
    <Touchable
      feedback="row"
      haptic="selection"
      disabled={!linkable}
      onPress={open}
      style={styles.playerRow}
      accessibilityRole={linkable ? "button" : "text"}
      accessibilityLabel={`${name}${player.position ? `, ${player.position}` : ""}`}
    >
      <Text style={styles.shirt} {...textScale.dense}>
        {shirt}
      </Text>

      <Avatar name={name} image={player.playerImg} size={28} />

      <View style={styles.playerTexts}>
        <Text style={styles.playerName} numberOfLines={1} {...textScale.dense}>
          {name}
          {player.captain ? " (K)" : ""}
        </Text>
        <Text style={styles.playerMeta} numberOfLines={1} {...textScale.dense}>
          {[player.position || null, player.isGuest ? "misafir" : null].filter(Boolean).join(" · ") ||
            " "}
        </Text>
      </View>

      {/* Katkı rozetleri: gol / asist / kart */}
      <View style={styles.contribRow}>
        {contrib && contrib.goals > 0 ? (
          <ContribBadge icon="football" color={colors.win} count={contrib.goals} />
        ) : null}
        {contrib && contrib.assists > 0 ? (
          <ContribBadge icon="navigate" color={colors.info} count={contrib.assists} />
        ) : null}
        {contrib && contrib.cards > 0 ? (
          <ContribBadge icon="square" color={colors.yellowCard} count={contrib.cards} />
        ) : null}
      </View>

      {/* Değişiklik okları */}
      {sub?.in != null ? (
        <View style={styles.subMark}>
          <Ionicons name="arrow-up" size={11} color={colors.win} />
          <Text style={[styles.subMinute, { color: colors.win }]} {...textScale.badge}>
            {sub.in}&apos;
          </Text>
        </View>
      ) : null}
      {sub?.out != null ? (
        <View style={styles.subMark}>
          <Ionicons name="arrow-down" size={11} color={colors.loss} />
          <Text style={[styles.subMinute, { color: colors.loss }]} {...textScale.badge}>
            {sub.out}&apos;
          </Text>
        </View>
      ) : null}

      <RatingPill value={rating != null && Number.isFinite(rating) && rating > 0 ? rating : null} size="sm" />
    </Touchable>
  );
});

const ContribBadge = memo(function ContribBadge({
  icon,
  color,
  count,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  count: number;
}) {
  return (
    <View style={styles.contribBadge}>
      <Ionicons name={icon} size={11} color={color} />
      {count > 1 ? (
        <Text style={styles.contribCount} {...textScale.badge}>
          {count}
        </Text>
      ) : null}
    </View>
  );
});

/* ══════════════════════════════════════════════════════════════════════════
   8) İSTATİSTİK
   ══════════════════════════════════════════════════════════════════════════ */

function StatsTab({
  match,
  statRows,
  bestPlayers,
  homeLogo,
  awayLogo,
  scrollProps,
  refreshControl,
}: {
  match: ApiMatch;
  statRows: StatRow[];
  bestPlayers: TopPlayer[];
  homeLogo: string | null;
  awayLogo: string | null;
  scrollProps: ScrollChrome;
  refreshControl: React.ReactElement<RefreshControlProps>;
}) {
  const router = useRouter();
  const meaningful = useMemo(
    () => statRows.some((row) => row.home > 0 || row.away > 0),
    [statRows],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: StatRow; index: number }) => (
      <View
        style={[
          styles.statCard,
          index === 0 && styles.statCardFirst,
          index === statRows.length - 1 && styles.statCardLast,
        ]}
      >
        <StatBar label={item.label} home={item.home} away={item.away} />
      </View>
    ),
    [statRows.length],
  );

  const openPlayer = useCallback(
    (playerId: number) => router.push(`/oyuncu/${playerId}`),
    [router],
  );

  return (
    <FlatList
      {...scrollProps}
      data={meaningful ? statRows : []}
      keyExtractor={statKey}
      renderItem={renderItem}
      refreshControl={refreshControl}
      contentContainerStyle={styles.listContent}
      ListHeaderComponent={
        <View style={styles.block}>
          <View style={styles.statHead}>
            <View style={styles.statHeadTeam}>
              <TeamLogo name={match.first_team_name} logo={homeLogo} size={layout.crestMd} />
              <Text style={styles.statHeadName} numberOfLines={1} {...textScale.dense}>
                {match.first_team_name}
              </Text>
            </View>
            <Text style={styles.statHeadVs} {...textScale.badge}>
              VS
            </Text>
            <View style={[styles.statHeadTeam, styles.statHeadTeamRight]}>
              <Text style={styles.statHeadName} numberOfLines={1} {...textScale.dense}>
                {match.second_team_name}
              </Text>
              <TeamLogo name={match.second_team_name} logo={awayLogo} size={layout.crestMd} />
            </View>
          </View>
          <SectionHeader title="Karşılaştırma" />
        </View>
      }
      ListEmptyComponent={
        <EmptyState
          icon="stats-chart-outline"
          variant="inline"
          title="İstatistik yok"
          body="Maç olayları girildikçe şut, faul, kart ve korner karşılaştırmaları burada oluşur."
        />
      }
      ListFooterComponent={
        bestPlayers.length ? (
          <View style={styles.block}>
            <SectionHeader title="En iyi oyuncular" />
            <View style={styles.group}>
              {bestPlayers.map((player, index) => (
                <TopPlayerRow
                  key={player.playerId}
                  player={player}
                  rank={index + 1}
                  position={rowPosition(index, bestPlayers.length)}
                  onOpen={openPlayer}
                />
              ))}
            </View>
          </View>
        ) : null
      }
    />
  );
}

const TopPlayerRow = memo(function TopPlayerRow({
  player,
  rank,
  position,
  onOpen,
}: {
  player: TopPlayer;
  rank: number;
  position: "single" | "first" | "middle" | "last";
  onOpen: (playerId: number) => void;
}) {
  const open = useCallback(() => onOpen(player.playerId), [onOpen, player.playerId]);

  return (
    <Touchable
      feedback="row"
      haptic="selection"
      onPress={open}
      // Grup zaten köşeleri kırpıyor; satıra düşen tek iş üstündeki ayraç.
      style={[styles.topRow, position !== "first" && position !== "single" && styles.topRowBorder]}
      accessibilityRole="button"
      accessibilityLabel={`${rank}. ${player.name}`}
    >
      <Text style={styles.topRank} {...textScale.dense}>
        {rank}
      </Text>
      <Avatar name={player.name} image={player.image} size={32} />
      <View style={styles.topTexts}>
        <Text style={styles.topName} numberOfLines={1} {...textScale.dense}>
          {player.name}
        </Text>
        <Text style={styles.topMeta} numberOfLines={1} {...textScale.dense}>
          {`${player.goals} gol · ${player.assists} asist`}
        </Text>
      </View>
      <RatingPill value={player.rating} size="md" best={rank === 1} />
    </Touchable>
  );
});

/* ══════════════════════════════════════════════════════════════════════════
   9) H2H — geçmiş karşılaşmalar
   ══════════════════════════════════════════════════════════════════════════ */

function HeadToHeadTab({
  match,
  meetings,
  homeTeamId,
  awayTeamId,
  homeMatches,
  awayMatches,
  loading,
  homeLogo,
  awayLogo,
  scrollProps,
  refreshControl,
}: {
  match: ApiMatch;
  meetings: ApiMatch[];
  homeTeamId: number | null;
  awayTeamId: number | null;
  homeMatches: ApiMatch[] | undefined;
  awayMatches: ApiMatch[] | undefined;
  loading: boolean;
  homeLogo: string | null;
  awayLogo: string | null;
  scrollProps: ScrollChrome;
  refreshControl: React.ReactElement<RefreshControlProps>;
}) {
  const router = useRouter();
  const homeName = normalizeName(match.first_team_name);
  const awayName = normalizeName(match.second_team_name);

  /** Galibiyet dağılımı — rozetler EV SAHİBİ gözünden okunur. */
  const tally = useMemo(() => {
    let homeWins = 0;
    let draws = 0;
    let awayWins = 0;
    let homeGoals = 0;
    let awayGoals = 0;

    for (const item of meetings) {
      const first = item.first_team_score;
      const second = item.second_team_score;
      if (first == null || second == null) continue;
      const homeIsFirst = sideIsHome(item, homeTeamId, homeName);
      const ours = homeIsFirst ? first : second;
      const theirs = homeIsFirst ? second : first;
      homeGoals += ours;
      awayGoals += theirs;
      if (ours > theirs) homeWins += 1;
      else if (ours < theirs) awayWins += 1;
      else draws += 1;
    }
    return { homeWins, draws, awayWins, homeGoals, awayGoals };
  }, [homeName, homeTeamId, meetings]);

  const homeForm = useFormString(homeMatches, match.id, homeTeamId, homeName);
  const awayForm = useFormString(awayMatches, match.id, awayTeamId, awayName);

  // MeetingRow memo'lu: `onOpen` her render'da yeniden üretilmemeli.
  const openMatch = useCallback((id: number) => router.push(`/mac/${id}`), [router]);

  const renderItem = useCallback(
    ({ item }: { item: ApiMatch }) => (
      <MeetingRow meeting={item} result={resultFor(item, homeTeamId, homeName)} onOpen={openMatch} />
    ),
    [homeName, homeTeamId, openMatch],
  );

  if (loading && meetings.length === 0) {
    return (
      <View style={styles.loading}>
        <SkeletonCard lines={3} />
        <SkeletonListRow count={5} />
      </View>
    );
  }

  return (
    <FlatList
      {...scrollProps}
      data={meetings}
      keyExtractor={matchKey}
      renderItem={renderItem}
      refreshControl={refreshControl}
      contentContainerStyle={styles.listContent}
      ListHeaderComponent={
        <View style={styles.block}>
          <View style={styles.h2hHead}>
            <View style={styles.h2hTeam}>
              <TeamLogo name={match.first_team_name} logo={homeLogo} size={layout.crestLg} />
              <Text style={styles.h2hName} numberOfLines={1} {...textScale.dense}>
                {match.first_team_name}
              </Text>
              <FormChips form={homeForm} size="xs" />
            </View>

            <View style={styles.h2hMiddle}>
              <Text style={styles.h2hCount} {...textScale.dense}>
                {meetings.length}
              </Text>
              <Text style={styles.overline} {...textScale.badge}>
                KARŞILAŞMA
              </Text>
            </View>

            <View style={[styles.h2hTeam, styles.h2hTeamRight]}>
              <TeamLogo name={match.second_team_name} logo={awayLogo} size={layout.crestLg} />
              <Text style={styles.h2hName} numberOfLines={1} {...textScale.dense}>
                {match.second_team_name}
              </Text>
              <FormChips form={awayForm} size="xs" />
            </View>
          </View>

          {meetings.length > 0 ? (
            <>
              <View style={styles.h2hTally}>
                <TallyCell value={tally.homeWins} label="GALİBİYET" color={colors.win} />
                <TallyCell value={tally.draws} label="BERABERLİK" color={colors.textSecondary} />
                <TallyCell value={tally.awayWins} label="GALİBİYET" color={colors.live} />
              </View>

              <View style={styles.barsCard}>
                <StatBar label="Galibiyet" home={tally.homeWins} away={tally.awayWins} />
                <StatBar label="Atılan gol" home={tally.homeGoals} away={tally.awayGoals} />
              </View>

              <SectionHeader title="Son karşılaşmalar" meta="rozetler ev sahibi gözünden" />
            </>
          ) : null}
        </View>
      }
      ListEmptyComponent={
        <EmptyState
          icon="git-compare-outline"
          variant="inline"
          title="Karşılaşma yok"
          body="Bu iki takım daha önce tamamlanmış bir maçta karşılaşmamış."
        />
      }
    />
  );
}

const TallyCell = memo(function TallyCell({
  value,
  label,
  color,
}: {
  value: number;
  label: string;
  color: string;
}) {
  return (
    <View style={styles.tallyCell}>
      <Text style={[styles.tallyValue, { color }]} {...textScale.dense}>
        {value}
      </Text>
      <Text style={styles.overline} {...textScale.badge}>
        {label}
      </Text>
    </View>
  );
});

const MeetingRow = memo(function MeetingRow({
  meeting,
  result,
  onOpen,
}: {
  meeting: ApiMatch;
  result: "G" | "B" | "M";
  onOpen: (matchId: number) => void;
}) {
  const open = useCallback(() => onOpen(Number(meeting.id)), [meeting.id, onOpen]);

  return (
    <Touchable
      feedback="row"
      haptic="selection"
      onPress={open}
      style={styles.meetRow}
      accessibilityRole="button"
      accessibilityLabel={`${meeting.first_team_name} ${meeting.first_team_score ?? "-"} ${meeting.second_team_score ?? "-"} ${meeting.second_team_name}`}
    >
      <Text style={styles.meetDate} {...textScale.dense}>
        {formatDateShort(meeting.date)}
      </Text>
      <View
        style={[
          styles.meetChip,
          result === "G"
            ? styles.meetChipWin
            : result === "M"
              ? styles.meetChipLoss
              : styles.meetChipDraw,
        ]}
      >
        <Text style={styles.meetChipText} {...textScale.badge}>
          {result}
        </Text>
      </View>
      <Text style={styles.meetTeams} numberOfLines={1} {...textScale.dense}>
        {meeting.first_team_name} – {meeting.second_team_name}
      </Text>
      <Text style={styles.meetScore} {...textScale.dense}>
        {meeting.first_team_score ?? "-"}-{meeting.second_team_score ?? "-"}
      </Text>
    </Touchable>
  );
});

/* ══════════════════════════════════════════════════════════════════════════
   10) PUAN DURUMU — maçın ligi, iki takım vurgulu
   ══════════════════════════════════════════════════════════════════════════ */

const STANDING_ROW_HEIGHT = 48;
/** `getItemLayout` satırın DIŞ ölçüsünü ister: yükseklik + alttaki 4px boşluk. */
const STANDING_ROW_STRIDE = STANDING_ROW_HEIGHT + space.xs;

function StandingsTab({
  rows,
  loading,
  error,
  onRetry,
  scoped,
  homeTeamId,
  awayTeamId,
  scrollProps,
  refreshControl,
}: {
  rows: StandingRow[] | undefined;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  scoped: boolean;
  homeTeamId: number | null;
  awayTeamId: number | null;
  scrollProps: ScrollChrome;
  refreshControl: React.ReactElement<RefreshControlProps>;
}) {
  const router = useRouter();
  const list = rows ?? [];
  const powerBalance = list[0]?.standings_type === "gucdengesi";

  const openTeam = useCallback((teamId: number) => router.push(`/takim/${teamId}`), [router]);

  const renderItem = useCallback(
    ({ item, index }: { item: StandingRow; index: number }) => (
      <StandingItem
        rank={index + 1}
        row={item}
        highlighted={
          Number(item.team_id) === Number(homeTeamId) || Number(item.team_id) === Number(awayTeamId)
        }
        onPress={openTeam}
      />
    ),
    [awayTeamId, homeTeamId, openTeam],
  );

  if (!scoped) {
    return (
      <EmptyState
        icon="podium-outline"
        title="Puan tablosu yok"
        body="Bu maç bir lig/sezona bağlı olmadığı için tablo gösterilemiyor."
      />
    );
  }

  if (loading) return <SkeletonStandings count={10} />;
  if (error && list.length === 0) return <ErrorState error={error} onRetry={onRetry} />;

  return (
    <FlatList
      {...scrollProps}
      data={list}
      keyExtractor={standingKey}
      renderItem={renderItem}
      getItemLayout={standingLayout}
      refreshControl={refreshControl}
      contentContainerStyle={styles.listContent}
      initialNumToRender={16}
      windowSize={8}
      ListHeaderComponent={
        <View style={styles.stHead}>
          <Text style={styles.stHeadRank} {...textScale.badge}>
            #
          </Text>
          <Text style={styles.stHeadTeam} {...textScale.badge}>
            TAKIM
          </Text>
          <Text style={styles.stHeadNum} {...textScale.badge}>
            O
          </Text>
          <Text style={styles.stHeadNum} {...textScale.badge}>
            AV
          </Text>
          <Text style={styles.stHeadNum} {...textScale.badge}>
            {powerBalance ? "GP" : "P"}
          </Text>
        </View>
      }
      ListEmptyComponent={
        <EmptyState
          icon="podium-outline"
          variant="inline"
          title="Tablo boş"
          body="Bu sezonda henüz maç oynanmamış."
        />
      }
    />
  );
}

const StandingItem = memo(function StandingItem({
  rank,
  row,
  highlighted,
  onPress,
}: {
  rank: number;
  row: StandingRow;
  highlighted: boolean;
  onPress: (teamId: number) => void;
}) {
  const open = useCallback(() => onPress(Number(row.team_id)), [onPress, row.team_id]);
  const diff = Number(row.goal_diff ?? 0);

  return (
    <Touchable
      feedback="row"
      haptic="selection"
      onPress={open}
      style={[styles.stRow, highlighted && styles.stRowActive]}
      accessibilityRole="button"
      accessibilityLabel={`${rank}. ${row.team_name}, ${row.display_points} puan`}
    >
      <Text style={styles.stRank} {...textScale.dense}>
        {rank}
      </Text>
      <TeamLogo name={row.team_name} logo={row.logo} size={layout.crestMd} />
      <Text
        style={[styles.stName, highlighted && styles.stNameActive]}
        numberOfLines={1}
        {...textScale.dense}
      >
        {row.team_name}
      </Text>
      <Text style={[styles.stNum, styles.stMuted]} {...textScale.dense}>
        {row.played}
      </Text>
      <Text
        style={[styles.stNum, diff > 0 ? styles.stPos : diff < 0 ? styles.stNeg : styles.stMuted]}
        {...textScale.dense}
      >
        {diff > 0 ? `+${diff}` : diff}
      </Text>
      <Text style={[styles.stNum, styles.stPoints]} {...textScale.dense}>
        {row.display_points}
      </Text>
    </Touchable>
  );
});

const standingKey = (row: StandingRow) => String(row.team_id);
const standingLayout = (_data: ArrayLike<StandingRow> | null | undefined, index: number) => ({
  length: STANDING_ROW_STRIDE,
  offset: STANDING_ROW_STRIDE * index,
  index,
});

/* ══════════════════════════════════════════════════════════════════════════
   11) ORTAK HOOK'LAR VE ANAHTAR ÜRETİCİLER
   ══════════════════════════════════════════════════════════════════════════ */

const eventKey = (event: ApiMatchEvent, index: number) => `${event.id ?? "olay"}-${index}`;
const matchKey = (item: ApiMatch) => String(item.id);
const statKey = (row: StatRow) => row.label;
/** Aynı index iki bölümde de geçtiği için anahtar TAKIMI da taşır. */
const playerKey = (player: KadroPlayer, index: number) =>
  `${player.team_id ?? player.takim_id ?? "t"}-${player.playerId ?? player.oyuncu_id ?? "misafir"}-${index}`;

/** Gruplanmış satır listesinde köşe/ayraç konumu. */
function rowPosition(index: number, total: number): "single" | "first" | "middle" | "last" {
  if (total <= 1) return "single";
  if (index === 0) return "first";
  if (index === total - 1) return "last";
  return "middle";
}

/** Olay satırlarındaki oyuncu adları kadro ucundan çözülür. */
function usePlayerNames(kadro: KadroResponse | undefined) {
  return useMemo(() => {
    const byId = new Map<number, string>();
    [...(kadro?.home ?? []), ...(kadro?.away ?? [])].forEach((row) => {
      const playerId = row.playerId ?? row.oyuncu_id;
      const name = row.playerName ?? row.guestName;
      if (playerId != null && name) byId.set(Number(playerId), name);
    });
    return (playerId?: number | null) =>
      playerId != null ? byId.get(Number(playerId)) ?? null : null;
  }, [kadro]);
}

/** Oyuncu id → giriş/çıkış dakikası. Kadro satırındaki oklar buradan çizilir. */
function useSubstitutions(events: ApiMatchEvent[]): Map<number, SubInfo> {
  return useMemo(() => {
    const map = new Map<number, SubInfo>();
    for (const event of events) {
      if (!isSubstitution(event)) continue;
      const entered = Number(event.oyuncu_giren_id) || null;
      const left = Number(event.oyuncu_cikan_id) || null;
      if (entered) map.set(entered, { ...(map.get(entered) ?? {}), in: event.dakika });
      if (left) map.set(left, { ...(map.get(left) ?? {}), out: event.dakika });
    }
    return map;
  }, [events]);
}

/**
 * Yeni gelen golü bulur.
 *
 * İLK YÜKLEMEDE FLAŞ YOK: ekran açıldığında geçmiş goller "yeni" sayılsaydı
 * bitmiş bir maçı açan herkes titreşim alırdı. İlk turda yalnız kayıt tutulur.
 */
function useGoalFlash(events: ApiMatchEvent[]): number | null {
  const [flashId, setFlashId] = useState<number | null>(null);
  const seenRef = useRef<Set<number> | null>(null);

  useEffect(() => {
    const goalIds = events
      .filter((event) => isGoalKind(eventKind(event)))
      .map((event) => Number(event.id))
      .filter((id) => Number.isFinite(id));

    const known = seenRef.current;
    const next = new Set(goalIds);
    seenRef.current = next;

    if (known == null) return; // ilk tur: yalnız kayıt
    const fresh = goalIds.find((id) => !known.has(id));
    if (fresh == null) return;

    haptics.goal();
    setFlashId(fresh);
    const timer = setTimeout(() => setFlashId(null), 4_000);
    return () => clearTimeout(timer);
  }, [events]);

  return flashId;
}

/**
 * İki takımın aralarındaki tamamlanmış maçlar.
 *
 * Kimlik numarası varsa onunla, yoksa takım adlarıyla eşleştirilir — eski
 * kayıtlarda `home_team_id` boş olabiliyor (app/h2h.tsx ile aynı kural).
 */
function useHeadToHead({
  match,
  homeTeamId,
  awayTeamId,
  homeMatches,
  awayMatches,
}: {
  match: ApiMatch | undefined;
  homeTeamId: number | null;
  awayTeamId: number | null;
  homeMatches: ApiMatch[] | undefined;
  awayMatches: ApiMatch[] | undefined;
}): ApiMatch[] {
  return useMemo(() => {
    if (!match) return [];
    const homeName = normalizeName(match.first_team_name);
    const awayName = normalizeName(match.second_team_name);
    if (!homeName || !awayName) return [];

    const involvesBoth = (item: ApiMatch) => {
      const first = Number(item.home_team_id);
      const second = Number(item.away_team_id);
      if (homeTeamId && awayTeamId && first && second) {
        return (
          (first === homeTeamId && second === awayTeamId) ||
          (first === awayTeamId && second === homeTeamId)
        );
      }
      const a = normalizeName(item.first_team_name);
      const b = normalizeName(item.second_team_name);
      return (a === homeName && b === awayName) || (a === awayName && b === homeName);
    };

    // Ev sahibinin listesi yeterlidir; eksikse deplasmanınki tamamlar.
    const pool = [...(homeMatches ?? []), ...(awayMatches ?? [])];
    const unique = new Map<number, ApiMatch>();
    for (const item of pool) {
      const id = Number(item.id);
      if (!id || id === Number(match.id)) continue;
      if (matchState(item) !== "finished") continue;
      if (!involvesBoth(item)) continue;
      unique.set(id, item);
    }

    return Array.from(unique.values())
      .sort((a, b) => kickoffAt(b) - kickoffAt(a))
      .slice(0, 10);
  }, [awayMatches, awayTeamId, homeMatches, homeTeamId, match]);
}

/** Takımın son 5 maçının form dizisi ("GBMGG") — FormChips bunu okur. */
function useFormString(
  matches: ApiMatch[] | undefined,
  currentMatchId: number,
  teamId: number | null,
  teamName: string,
): string {
  return useMemo(() => {
    const list = (matches ?? [])
      .filter((item) => matchState(item) === "finished" && Number(item.id) !== Number(currentMatchId))
      .sort((a, b) => kickoffAt(b) - kickoffAt(a))
      .slice(0, 5)
      .reverse();

    return list.map((item) => resultFor(item, teamId, teamName)).join("");
  }, [currentMatchId, matches, teamId, teamName]);
}

/** Bir maçta bakılan takım ev sahibi tarafta mı? */
function sideIsHome(item: ApiMatch, teamId: number | null, teamName: string): boolean {
  if (teamId && Number(item.home_team_id)) return Number(item.home_team_id) === teamId;
  return normalizeName(item.first_team_name) === teamName;
}

/** Bir maçın bakılan takım gözünden sonucu. */
function resultFor(item: ApiMatch, teamId: number | null, teamName: string): "G" | "B" | "M" {
  const homeSide = sideIsHome(item, teamId, teamName);
  const ours = homeSide ? item.first_team_score : item.second_team_score;
  const theirs = homeSide ? item.second_team_score : item.first_team_score;
  if (ours == null || theirs == null) return "B";
  if (ours > theirs) return "G";
  if (ours < theirs) return "M";
  return "B";
}

/** YouTube video kimliğini adresten çıkarır. */
function extractYouTubeId(url: string): string | null {
  const patterns = [/[?&]v=([^&#]+)/, /youtu[.]be[/]([^?&#]+)/, /youtube[.]com[/]embed[/]([^?&#]+)/];
  for (const pattern of patterns) {
    const found = url.match(pattern);
    if (found?.[1]) return found[1];
  }
  return null;
}

/* ══════════════════════════════════════════════════════════════════════════
   12) STİLLER
   ══════════════════════════════════════════════════════════════════════════ */

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  loading: {
    padding: layout.screenPadding,
    gap: space.md,
  },
  listContent: {
    paddingBottom: space.giant,
  },
  /**
   * Segment gövdesindeki kart kümesi. Yatay boşluk BLOĞUN DEĞİL kartların
   * kendisindedir (`inset`) — çünkü SectionHeader kendi `screenPadding`'ini
   * zaten çiziyor; blok da paylaşsaydı başlıklar kartlardan içeride kalırdı.
   */
  block: {
    paddingTop: space.md,
    gap: space.md,
  },
  inset: {
    marginHorizontal: layout.screenPadding,
  },
  group: {
    backgroundColor: colors.surface1,
    borderRadius: radius.lg,
    marginHorizontal: layout.screenPadding,
    overflow: "hidden",
  },
  overline: {
    ...type.micro,
    color: colors.textTertiary,
  },

  /* ---- Hero ---- */
  hero: {
    backgroundColor: colors.surface1,
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.m,
    paddingBottom: space.sm,
    gap: space.s,
  },
  heroTeams: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  heroTeam: {
    flex: 1,
    alignItems: "center",
    gap: space.xs,
    paddingVertical: space.xxs,
    borderRadius: radius.md,
  },
  heroTeamName: {
    ...type.caption,
    color: colors.textPrimary,
    textAlign: "center",
    minHeight: 28,
  },
  heroCenter: {
    minWidth: 104,
    alignItems: "center",
    justifyContent: "flex-start",
    gap: space.xs,
    paddingTop: space.s,
  },
  heroScore: {
    ...type.scoreHero,
    color: colors.textPrimary,
  },
  heroScoreLive: {
    color: colors.brandAccent,
  },
  heroScoreDash: {
    color: colors.textTertiary,
  },
  heroKickoff: {
    ...type.scoreLg,
    color: colors.textPrimary,
  },
  heroClock: {
    alignItems: "center",
  },
  heroCountdown: {
    ...type.caption,
    color: colors.textSecondary,
  },
  heroMeta: {
    ...type.caption,
    color: colors.textSecondary,
    textAlign: "center",
  },

  /* ---- Yeniden bağlanma şeridi ---- */
  reconnect: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    backgroundColor: colors.warnDim,
    borderRadius: radius.md,
    paddingHorizontal: space.m,
    paddingVertical: space.sm,
  },
  reconnectText: {
    ...type.caption,
    color: colors.warn,
    flex: 1,
  },

  /* ---- Özet ---- */
  headline: {
    ...type.body,
    color: colors.textPrimary,
  },
  /** Fotoğraf şeridi ekranın iki kenarına kadar akar; kendi iç boşluğu var. */
  photoBlock: {
    gap: space.sm,
  },
  mvpRow: {
    marginHorizontal: layout.screenPadding,
    flexDirection: "row",
    alignItems: "center",
    gap: space.m,
    backgroundColor: colors.surface1,
    borderRadius: radius.lg,
    paddingHorizontal: space.md,
    paddingVertical: space.m,
  },
  mvpIcon: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    backgroundColor: colors.warnDim,
    alignItems: "center",
    justifyContent: "center",
  },
  mvpBody: {
    flex: 1,
    gap: space.xxs,
  },
  mvpName: {
    ...type.h3,
    color: colors.textPrimary,
  },
  contentRow: {
    marginHorizontal: layout.screenPadding,
    flexDirection: "row",
    gap: space.md,
  },
  videoCard: {
    width: 92,
    gap: space.xs,
  },
  videoThumb: {
    height: 62,
    borderRadius: radius.md,
    backgroundColor: colors.surface3,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  videoPlay: {
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    backgroundColor: colors.live,
    alignItems: "center",
    justifyContent: "center",
  },
  videoLabel: {
    ...type.micro,
    color: colors.textSecondary,
    textAlign: "center",
  },
  reportBox: {
    flex: 1,
    backgroundColor: colors.surface1,
    borderRadius: radius.lg,
    padding: space.md,
    gap: space.xs,
  },
  reportText: {
    ...type.bodySm,
    color: colors.textSecondary,
  },
  reportEmpty: {
    ...type.bodySm,
    color: colors.textTertiary,
  },
  noteBox: {
    marginHorizontal: layout.screenPadding,
    backgroundColor: colors.surface1,
    borderRadius: radius.lg,
    padding: space.md,
  },
  noteText: {
    ...type.bodySm,
    color: colors.textSecondary,
  },

  /* ---- Zaman çizelgesi ---- */
  tlRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: layout.screenPadding,
  },
  tlSide: {
    flex: 1,
  },
  tlBubble: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    borderRadius: radius.md,
    paddingHorizontal: space.sm,
    paddingVertical: space.s,
  },
  tlBubbleHome: {
    justifyContent: "flex-start",
  },
  tlBubbleAway: {
    justifyContent: "flex-end",
  },
  tlTexts: {
    flexShrink: 1,
  },
  tlName: {
    ...type.bodySm,
    color: colors.textPrimary,
  },
  tlDetail: {
    ...type.caption,
    color: colors.textTertiary,
  },
  tlAlignLeft: {
    textAlign: "left",
  },
  tlAlignRight: {
    textAlign: "right",
  },
  tlCenter: {
    width: 44,
    alignItems: "center",
  },
  tlLine: {
    width: 1,
    height: 10,
    backgroundColor: colors.separator,
  },
  tlMinute: {
    minWidth: 34,
    paddingHorizontal: space.xs,
    paddingVertical: 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: "center",
    backgroundColor: colors.surface1,
  },
  tlMinuteText: {
    ...type.micro,
  },

  /* ---- Canlı akış ---- */
  liveStatus: {
    marginHorizontal: layout.screenPadding,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surface1,
    borderRadius: radius.lg,
    paddingHorizontal: space.md,
    paddingVertical: space.m,
  },
  liveStatusLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  liveDotOn: {
    backgroundColor: colors.win,
  },
  liveDotOff: {
    backgroundColor: colors.warn,
  },
  liveStatusText: {
    ...type.caption,
    color: colors.textSecondary,
  },
  liveElapsed: {
    ...type.scoreSm,
    color: colors.brandAccent,
  },
  feedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.m,
    marginHorizontal: layout.screenPadding,
    marginTop: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.m,
    borderRadius: radius.lg,
    backgroundColor: colors.surface1,
    overflow: "hidden",
  },
  feedRowGoal: {
    backgroundColor: colors.winDim,
  },
  feedFlash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.win,
  },
  feedMinute: {
    width: 34,
    alignItems: "center",
  },
  feedMinuteText: {
    ...type.micro,
    color: colors.textSecondary,
  },
  feedIcon: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    backgroundColor: colors.surface3,
    alignItems: "center",
    justifyContent: "center",
  },
  feedIconGoal: {
    backgroundColor: colors.surface1,
  },
  feedBody: {
    flex: 1,
    gap: space.xxs,
  },
  feedName: {
    ...type.body,
    color: colors.textPrimary,
  },
  feedNameGoal: {
    ...type.h3,
    color: colors.textPrimary,
  },
  feedMeta: {
    ...type.caption,
    color: colors.textSecondary,
  },
  feedSide: {
    width: 3,
    alignSelf: "stretch",
    borderRadius: 2,
  },
  feedSideHome: {
    backgroundColor: colors.brandAccent,
  },
  feedSideAway: {
    backgroundColor: colors.borderStrong,
  },

  /* ---- Kadrolar ---- */
  playerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.m,
    marginHorizontal: layout.screenPadding,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    backgroundColor: colors.surface1,
    borderRadius: radius.md,
    marginTop: space.xs,
    minHeight: layout.listRowHeight,
  },
  shirt: {
    ...type.tableNum,
    color: colors.textTertiary,
    width: 20,
    textAlign: "center",
  },
  playerTexts: {
    flex: 1,
    gap: space.xxs,
  },
  playerName: {
    ...type.bodySm,
    color: colors.textPrimary,
  },
  playerMeta: {
    ...type.caption,
    color: colors.textTertiary,
  },
  contribRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
  },
  contribBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 1,
  },
  contribCount: {
    ...type.micro,
    color: colors.textSecondary,
  },
  subMark: {
    flexDirection: "row",
    alignItems: "center",
    gap: 1,
  },
  subMinute: {
    ...type.micro,
  },

  /* ---- İstatistik ---- */
  statHead: {
    marginHorizontal: layout.screenPadding,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    backgroundColor: colors.surface1,
    borderRadius: radius.lg,
    paddingHorizontal: space.md,
    paddingVertical: space.m,
  },
  statHeadTeam: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  statHeadTeamRight: {
    justifyContent: "flex-end",
  },
  statHeadName: {
    ...type.caption,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  statHeadVs: {
    ...type.micro,
    color: colors.textTertiary,
  },
  /** Karşılaştırma barları TEK kart gibi okunsun diye satırlar bitişiktir;
   *  yalnız ilk ve son satır köşe yuvarlar. */
  statCard: {
    backgroundColor: colors.surface1,
    marginHorizontal: layout.screenPadding,
    paddingHorizontal: space.md,
  },
  statCardFirst: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingTop: space.xs,
  },
  statCardLast: {
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
    paddingBottom: space.xs,
  },
  barsCard: {
    backgroundColor: colors.surface1,
    borderRadius: radius.lg,
    marginHorizontal: layout.screenPadding,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.m,
    paddingHorizontal: space.md,
    paddingVertical: space.m,
  },
  topRowBorder: {
    borderTopWidth: hairline,
    borderTopColor: colors.separator,
  },
  topRank: {
    ...type.tableNumStrong,
    color: colors.textTertiary,
    width: 16,
    textAlign: "center",
  },
  topTexts: {
    flex: 1,
    gap: space.xxs,
  },
  topName: {
    ...type.bodySm,
    color: colors.textPrimary,
  },
  topMeta: {
    ...type.caption,
    color: colors.textSecondary,
  },

  /* ---- H2H ---- */
  h2hHead: {
    marginHorizontal: layout.screenPadding,
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: colors.surface1,
    borderRadius: radius.lg,
    padding: space.md,
  },
  h2hTeam: {
    flex: 1,
    alignItems: "center",
    gap: space.xs,
  },
  h2hTeamRight: {
    alignItems: "center",
  },
  h2hName: {
    ...type.caption,
    color: colors.textPrimary,
    textAlign: "center",
  },
  h2hMiddle: {
    minWidth: 72,
    alignItems: "center",
    gap: space.xxs,
    paddingTop: space.s,
  },
  h2hCount: {
    ...type.scoreLg,
    color: colors.brandAccent,
  },
  h2hTally: {
    marginHorizontal: layout.screenPadding,
    flexDirection: "row",
    backgroundColor: colors.surface1,
    borderRadius: radius.lg,
    overflow: "hidden",
  },
  tallyCell: {
    flex: 1,
    alignItems: "center",
    gap: space.xxs,
    paddingVertical: space.md,
  },
  tallyValue: {
    ...type.scoreLg,
  },
  meetRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.m,
    marginHorizontal: layout.screenPadding,
    marginTop: space.xs,
    paddingHorizontal: space.md,
    paddingVertical: space.m,
    backgroundColor: colors.surface1,
    borderRadius: radius.md,
  },
  meetDate: {
    ...type.caption,
    color: colors.textTertiary,
    width: 48,
  },
  meetChip: {
    width: 20,
    height: 20,
    borderRadius: radius.xs,
    alignItems: "center",
    justifyContent: "center",
  },
  meetChipWin: {
    backgroundColor: colors.win,
  },
  meetChipDraw: {
    backgroundColor: colors.draw,
  },
  meetChipLoss: {
    backgroundColor: colors.loss,
  },
  meetChipText: {
    ...type.micro,
    color: colors.textOnStatus,
  },
  meetTeams: {
    flex: 1,
    ...type.bodySm,
    color: colors.textPrimary,
  },
  meetScore: {
    ...type.tableNumStrong,
    color: colors.textPrimary,
  },

  /* ---- Puan durumu ---- */
  stHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: layout.screenPadding + space.md,
    paddingVertical: space.sm,
  },
  stHeadRank: {
    ...type.micro,
    color: colors.textTertiary,
    width: 18,
    textAlign: "center",
  },
  stHeadTeam: {
    ...type.micro,
    color: colors.textTertiary,
    flex: 1,
    marginLeft: layout.crestMd + space.sm,
  },
  stHeadNum: {
    ...type.micro,
    color: colors.textTertiary,
    width: 28,
    textAlign: "center",
  },
  stRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    height: STANDING_ROW_HEIGHT,
    marginHorizontal: layout.screenPadding,
    paddingHorizontal: space.md,
    backgroundColor: colors.surface1,
    borderRadius: radius.md,
    marginBottom: space.xs,
  },
  stRowActive: {
    backgroundColor: colors.brandDim,
    borderWidth: 1,
    borderColor: colors.brandBorder,
  },
  stRank: {
    ...type.tableNum,
    color: colors.textTertiary,
    width: 18,
    textAlign: "center",
  },
  stName: {
    ...type.bodySm,
    color: colors.textPrimary,
    flex: 1,
  },
  stNameActive: {
    ...type.h3,
    color: colors.textPrimary,
  },
  stNum: {
    ...type.tableNum,
    width: 28,
    textAlign: "center",
  },
  stMuted: {
    color: colors.textSecondary,
  },
  stPos: {
    color: colors.win,
  },
  stNeg: {
    color: colors.loss,
  },
  stPoints: {
    ...type.tableNumStrong,
    color: colors.textPrimary,
  },
});
