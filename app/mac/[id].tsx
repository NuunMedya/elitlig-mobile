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
import { LinearGradient } from "expo-linear-gradient";
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
  useWindowDimensions,
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
  BottomSheet,
  Button,
  Card,
  ChalkArc,
  EmptyState,
  ErrorState,
  EventIcon,
  FormChips,
  PitchView,
  KeyValueRow,
  MinuteRing,
  RatingPill,
  ScreenHeader,
  SectionHeader,
  SegmentedControl,
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
  type EventIconKind,
  type PitchPlayerView,
  type SegmentedItem,
} from "@/components/ui";
import { useLiveClock, useLiveMatch } from "@/hooks/useLiveMatch";
import { useTeamLogos } from "@/hooks/useTeamLogos";
import { getMatch, getMatchKadro, getTeamMatches } from "@/lib/api/matches";
import { getStandings } from "@/lib/api/standings";
import { addMatchToCalendar } from "@/lib/calendar";
import { formatClock, formatDateLong, formatDateShort, formatTime, mediaUrl } from "@/lib/format";
import { openLink } from "@/lib/links";
import {
  EVENT_LABEL,
  eventKind,
  goalDetail,
  isGoal,
  isOwnGoal,
  isSubstitution,
  isTimelineEvent,
  matchState,
  scoreDelta,
} from "@/lib/match";
import { buildContributions, buildStatRows, buildTopPlayers } from "@/lib/matchStats";
import { positionLabel, positionLine } from "@/lib/api/team";
import { queryKeys } from "@/lib/queryKeys";
import { youtubeChannelUrl } from "@/lib/youtube";
import { useFavorite } from "@/providers/FavoriteProvider";
import { useScope } from "@/providers/ScopeProvider";
import {
  colors,
  duration,
  easing,
  elevate,
  hairline,
  haptics,
  layout,
  radius,
  space,
  textScale,
  type,
  upperTR,
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

/**
 * Oyuncu adını dar bir sütuna sığdır: "Muhammed Enes YAZICIOĞLU" ne skor
 * bloğunun iki sütununa ne de zaman tünelinin baloncuğuna sığıyor; ikisinde de
 * "Muhammed…" diye kırpılıyor ve satır, kimin ne yaptığını söylemiyordu.
 * İlk adın baş harfi + kalanı ("M. Enes YAZICIOĞLU") hem ayırt edici hem kısa;
 * tek kelimelik adlar olduğu gibi kalır.
 */
function shortName(full: string): string {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return full;
  return `${parts[0].slice(0, 1)}. ${parts.slice(1).join(" ")}`;
}

/**
 * Zaman tünelinin baloncuğu için DAHA DA kısa ad: baş harf + SOYADI.
 *
 * Baloncuk, iki sütunlu düzende ~140px'tir ve 16px'lik "M. Ali GÜRER" oraya da
 * sığmayıp "M. Ali GÜR…" oluyordu. Göbek adı düşer: "M. GÜRER". Televizyon
 * grafiklerinin kullandığı biçim budur ve bir gol satırında ayırt edici olan
 * da soyadıdır.
 */
function compactName(full: string): string {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return full;
  return `${parts[0].slice(0, 1)}. ${parts[parts.length - 1]}`;
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
  const scorers = useGoalScorers(events, homeTeamId, awayTeamId, nameOf);

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
      {/*
        BAŞLIK LİG ADINI TAŞIR, TAKIM ADLARINI DEĞİL. İki takım adı tek satıra
        sığmıyor ve "ÇAYKARA FC – ŞANLI B…" gibi kırpılıyordu; üstelik hemen
        altındaki mürekkep blok ikisini de armalarıyla birlikte zaten
        gösteriyor. Başlık artık tekrar etmeyen bağlamı verir.
      */}
      <ScreenHeader
        title={match.league_name ?? "Maç detayı"}
        overline="MAÇ"
        subtitle={[match.match_season, match.match_field].filter(Boolean).join(" · ") || undefined}
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
              scorers={scorers}
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
          awayTeamId={awayTeamId}
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

/** Skor bloğunun altındaki tek golcü satırı. */
interface ScorerLine {
  key: string;
  name: string;
  minute: number | null;
  /** Kendi kalesine — adın yanında (k.k.) notu çıkar. */
  ownGoal: boolean;
}

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
  scorers,
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
  scorers: { home: ScorerLine[]; away: ScorerLine[] };
}) {
  const router = useRouter();
  const { width } = useWindowDimensions();
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

  const hasScorers = scorers.home.length > 0 || scorers.away.length > 0;

  return (
    <View style={styles.hero}>
      {/*
        MÜREKKEP BLOK. Skor, uygulamanın en önemli tek bilgisidir ve kendi
        yüzeyini hak eder. Beyaz kart üstünde duran skor, altındaki liste
        satırlarıyla aynı ağırlıkta görünüyordu; koyu blok onu ekrandan
        AYIRIR ve sayfaya bir kimlik verir.

        Gradyan YATAY (sol→sağ) uygulanır: blok, üstündeki başlık şeridiyle
        aynı gradyanı paylaşabilsin ve dikeyde eklendiğinde dikiş izi
        oluşmasın diye.
      */}
      <LinearGradient
        colors={colors.gradientInk}
        start={HERO_GRADIENT_START}
        end={HERO_GRADIENT_END}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {/* İmza öğesi: skor bloğunun arkasında tebeşir orta yuvarlak yayı. */}
      <ChalkArc width={width} height={HERO_ARC_HEIGHT} color={colors.chalk} />

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
          <TeamLogo name={match.first_team_name} logo={homeLogo} size={layout.crestXl} />
          <Text style={styles.heroTeamName} numberOfLines={2} {...textScale.dense}>
            {match.first_team_name}
          </Text>
        </Touchable>

        <View style={styles.heroCenter}>
          {played ? (
            <Text style={styles.heroScore} {...textScale.dense}>
              {homeScore ?? 0}
              <Text style={styles.heroScoreDash}>{" – "}</Text>
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
            // Mürekkep blok üstünde `Badge` sönük kalırdı: tebeşir çerçeveli pul.
            <View style={styles.heroChip}>
              <Text style={styles.heroChipText} {...textScale.badge}>
                MS
              </Text>
            </View>
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
          <TeamLogo name={match.second_team_name} logo={awayLogo} size={layout.crestXl} />
          <Text style={styles.heroTeamName} numberOfLines={2} {...textScale.dense}>
            {match.second_team_name}
          </Text>
        </Touchable>
      </View>

      {/*
        GOL ATANLAR — iki sütun, ortada hairline. Ev sahibi SAĞA, deplasman
        SOLA hizalıdır; yani her iki liste de ortadaki eksene yaslanır ve
        gözün tek bir dikey çizgiyi takip etmesi yeter. Tek satıra sıkıştırmak
        ("Demir 12', Ateş 78', Yılmaz 45'") üç golden sonra okunmaz oluyordu.
      */}
      {hasScorers ? (
        <View style={styles.scorers}>
          <ScorerColumn lines={scorers.home} side="home" />
          <View style={styles.scorerAxis} />
          <ScorerColumn lines={scorers.away} side="away" />
        </View>
      ) : null}

      {meta ? (
        <Text style={styles.heroMeta} numberOfLines={1} {...textScale.dense}>
          {meta}
        </Text>
      ) : null}

      {live && !realtime ? <ReconnectStrip /> : null}
    </View>
  );
});

/** Skor bloğunun arkasındaki yayın yüksekliği — armalar + skor + golcüler. */
const HERO_ARC_HEIGHT = 160;

/** Mürekkep bloğun gradyan yönü — YATAY, bkz. MatchHero içindeki gerekçe. */
const HERO_GRADIENT_START = { x: 0, y: 0 } as const;
const HERO_GRADIENT_END = { x: 1, y: 0 } as const;

/**
 * Bir takımın golcü sütunu.
 *
 * EN ÇOK `SCORER_LIMIT` SATIR: amatör ligde 9-5 biten maçlar var ve tam liste
 * skor bloğunu ekranın tamamına yayıyordu — skor, sekiz satırlık bir dökümün
 * içinde kayboluyordu. Fazlası tek satırlık bir sayaca iner; tam döküm zaten
 * "Maç akışı" sekmesindedir.
 */
const SCORER_LIMIT = 5;

const ScorerColumn = memo(function ScorerColumn({
  lines,
  side,
}: {
  lines: ScorerLine[];
  side: "home" | "away";
}) {
  const shown = lines.slice(0, SCORER_LIMIT);
  const rest = lines.length - shown.length;

  return (
    <View style={styles.scorerColumn}>
      {shown.map((line) => (
        <ScorerRow key={line.key} line={line} side={side} />
      ))}
      {rest > 0 ? (
        <Text
          style={[styles.scorerMore, side === "home" && styles.scorerTextHome]}
          {...textScale.badge}
        >
          {`+${rest} gol daha`}
        </Text>
      ) : null}
    </View>
  );
});

/** Tek golcü satırı: ev sahibinde top ikonu SAĞDA, deplasmanda SOLDA durur. */
const ScorerRow = memo(function ScorerRow({
  line,
  side,
}: {
  line: ScorerLine;
  side: "home" | "away";
}) {
  const label = line.ownGoal ? `${shortName(line.name)} (k.k.)` : shortName(line.name);
  const minute = line.minute != null ? `${line.minute}'` : "";

  /*
   * DAKİKA AYRI BİR `Text`: tek metin olduğunda uzun bir ad, satırı ele
   * geçirip dakikayı da birlikte kırpıyordu ("ABDULLAH TOKSOY …") — yani gol
   * satırının en önemli iki bilgisinden biri kayboluyordu. Ad kırpılabilir,
   * dakika kırpılamaz.
   */
  return (
    <View style={[styles.scorerRow, side === "home" && styles.scorerRowHome]}>
      <EventIcon kind={line.ownGoal ? "ownGoal" : "goal"} size={13} onDark />
      <Text
        style={[styles.scorerText, side === "home" && styles.scorerTextHome]}
        numberOfLines={1}
        {...textScale.dense}
      >
        {label}
      </Text>
      {minute ? (
        <Text style={styles.scorerMinute} {...textScale.badge}>
          {minute}
        </Text>
      ) : null}
    </View>
  );
});

/**
 * Canlı sayaç. `useLiveClock` SANİYEDE BİR tikler; bu yüzden ekran gövdesinde
 * değil burada çağrılır — yeniden çizilen tek şey bu küçük halkadır.
 *
 * NEDEN ROZET DEĞİL HALKA: eski sürüm nabız atan kırmızı noktalı bir "CANLI"
 * rozeti çiziyordu. Rozet yalnız "canlı" der; halka aynı yeri kaplayarak hem
 * canlılığı hem maçın nerede olduğunu söyler (90 dakikanın tamamlanan payı).
 * Ekrandan sürekli hareket eden bir öğe de böylece kalkmış olur.
 */
const MatchClock = memo(function MatchClock({ snapshot }: { snapshot: LiveSnapshot | undefined }) {
  const clockMs = useLiveClock(snapshot);
  const halftime = isHalftime(snapshot);
  const minute = clockMs != null ? Math.floor(clockMs / 60_000) : null;
  // 90+ uzatma: halka dolu kalır, dakika "90+3" yazılır.
  const added = minute != null && minute > 90 ? minute - 90 : null;

  return (
    <View style={styles.heroClock}>
      <MinuteRing
        minute={halftime ? null : added != null ? 90 : minute}
        addedTime={added}
        halftime={halftime}
        size={48}
        onDark
      />
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
      <Ionicons name="cloud-offline-outline" size={16} color={colors.onDarkMuted} />
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
  awayTeamId,
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
  awayTeamId: number | null;
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

  /*
    SIRA VARSAYILANI "EN YENİ ÖNCE": maç detayı en çok canlı maçta ve maç biter
    bitmez açılıyor; o anda merak edilen son olaydır, ilk düdük değil. Maçın
    hikâyesini baştan okumak isteyen tek dokunuşla "Maç akışı"na geçer.
  */
  const [order, setOrder] = useState<TimelineOrder>("yeni");
  const items = useTimelineItems(timeline, homeTeamId, awayTeamId, state === "finished", order);

  const renderEvent = useCallback(
    ({ item }: { item: TimelineItem }) =>
      item.kind === "break" ? (
        <TimelineBreak label={item.label} />
      ) : (
        <TimelineRow
          event={item.event}
          home={item.home}
          score={item.score}
          nameOf={nameOf}
          onOpenPlayer={openPlayer}
        />
      ),
    [nameOf, openPlayer],
  );

  return (
    <FlatList
      {...scrollProps}
      data={items}
      keyExtractor={timelineKey}
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

          <SectionHeader
            title="Maç akışı"
            meta={timeline.length ? `${timeline.length} olay` : undefined}
            action={
              timeline.length > 1
                ? {
                    // Etiket bölüm başlığıyla aynı olamaz: "Maç akışı" başlığının
                    // yanında yine "Maç akışı" yazan bir düğme, ne yapacağını
                    // söylemiyordu. Etiket artık GİDİLECEK sıralamayı söyler.
                    label: order === "yeni" ? "Eskiden yeniye" : "Yeniden eskiye",
                    onPress: () => setOrder((current) => (current === "yeni" ? "akis" : "yeni")),
                  }
                : undefined
            }
          />
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
 * Zaman çizelgesinin bir öğesi: ya bir olay ya da bir devre ayracı.
 *
 * Ayraçlar veriden türetilir (olayların `devre` alanı değişince) — sunucudan
 * "devre arası" diye bir olay gelmiyor. Bu yüzden liste düz bir olay dizisi
 * değil, ayraçlarla dokunmuş bir dizidir.
 */
/** Zaman çizelgesi sırası: en yeni önce (varsayılan) ya da maçın akışı. */
type TimelineOrder = "yeni" | "akis";

type TimelineItem =
  | { kind: "event"; key: string; event: ApiMatchEvent; home: boolean; score: string | null }
  | { kind: "break"; key: string; label: string };

/**
 * Olayları zaman tüneli öğelerine çevirir: devre ayraçlarını ekler ve her
 * golün YANINA O ANKİ SKORU yazar.
 *
 * NEDEN KOŞAN SKOR: "78' Ateş" satırı golün atıldığını söyler ama maçın o an
 * kaç kaç olduğunu söylemez; okuyucu yukarı çıkıp saymak zorunda kalıyordu.
 * `1–2` etiketi bunu satırın içinde bitiriyor.
 *
 * SIRA: `order` "yeni" ise ters kronolojik (varsayılan — canlı maçta en yeni
 * olay en üstte olmalı), "akis" ise maçın gerçek akışı.
 */
function useTimelineItems(
  timeline: ApiMatchEvent[],
  homeTeamId: number | null,
  awayTeamId: number | null,
  finished: boolean,
  order: TimelineOrder,
): TimelineItem[] {
  return useMemo(() => {
    const items: TimelineItem[] = [];
    let home = 0;
    let away = 0;
    let period: number | null = null;

    timeline.forEach((event, index) => {
      // Devre değişimi: ilk devrenin sonuna ayraç.
      const current = event.devre ?? null;
      if (period != null && current != null && current !== period) {
        items.push({ kind: "break", key: `break-${current}`, label: "Devre arası" });
      }
      period = current ?? period;

      const delta = scoreDelta(event, homeTeamId, awayTeamId);
      const scored = delta.home > 0 || delta.away > 0;
      home += delta.home;
      away += delta.away;

      items.push({
        kind: "event",
        key: eventKey(event, index),
        event,
        home: Number(event.takim_id) === Number(homeTeamId),
        score: scored ? `${home}–${away}` : null,
      });
    });

    if (finished && items.length) {
      items.push({ kind: "break", key: "break-full", label: "Maç sonu" });
    }

    return order === "yeni" ? items.slice().reverse() : items;
  }, [timeline, homeTeamId, awayTeamId, finished, order]);
}

/**
 * Zaman çizelgesi satırı — ortada dakika, olay hangi takımınsa o yanda.
 * İki sütunlu düzen "kim yaptı" sorusunu okumadan yanıtlar.
 *
 * GOL AYRI BİR AĞIRLIKTA: gol satırı zeminli bir kart olur ve o anki skoru
 * taşır; kart, değişiklik ve diğerleri tek satır kalır. Bütün olayları aynı
 * ağırlıkta çizmek, maçın hikâyesini düz bir döküme çeviriyordu — 90 dakikada
 * olan tek önemli şey gollerdir, çizelge de bunu söylemeli.
 *
 * İKONLAR INLINE SVG (`EventIcon`): Ionicons'ta dikey sarı kart yok, en yakını
 * yuvarlak köşeli genel bir kare — futbolda kart keskin köşelidir.
 */
const TimelineRow = memo(function TimelineRow({
  event,
  home,
  score,
  nameOf,
  onOpenPlayer,
}: {
  event: ApiMatchEvent;
  home: boolean;
  score: string | null;
  nameOf: (playerId?: number | null) => string | null;
  onOpenPlayer: (playerId: number) => void;
}) {
  const kind = eventKind(event);
  const goal = isGoalKind(kind);
  const detail = kind === "goal" ? goalDetail(event) : kind === "ownGoal" ? "kendi kalesine" : null;

  /*
   * Adlar `compactName` ile kısaltılır (baş harf + soyadı): baloncuk, iki
   * sütunlu düzende ~140px genişliktedir ve 16px'lik tam ad oraya sığmayıp
   * "ABDULLAH…" diye kırpılıyordu — yani satırın söylediği tek şey
   * kayboluyordu.
   */
  const label =
    kind === "substitution"
      ? [nameOf(event.oyuncu_giren_id), nameOf(event.oyuncu_cikan_id)]
          .filter((value): value is string => Boolean(value))
          .map(compactName)
          .join(" → ") || "Oyuncu değişikliği"
      : (() => {
          const player = nameOf(event.oyuncu_id);
          return player ? compactName(player) : event.aciklama || EVENT_LABEL[kind] || "Olay";
        })();

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
      style={[
        styles.tlBubble,
        home ? styles.tlBubbleHome : styles.tlBubbleAway,
        goal && styles.tlBubbleGoal,
      ]}
      accessibilityRole={playerId ? "button" : "text"}
      accessibilityLabel={`${event.dakika ?? "?"}. dakika ${EVENT_LABEL[kind] || "olay"}: ${label}${
        score ? `, skor ${score}` : ""
      }`}
    >
      {home ? <EventIcon kind={kind} size={16} /> : null}
      <View style={styles.tlTexts}>
        <Text
          style={[
            styles.tlName,
            goal && styles.tlNameGoal,
            home ? styles.tlAlignLeft : styles.tlAlignRight,
          ]}
          numberOfLines={1}
          {...textScale.dense}
        >
          {label}
        </Text>
        {detail || score ? (
          <Text
            style={[styles.tlDetail, home ? styles.tlAlignLeft : styles.tlAlignRight]}
            numberOfLines={1}
            {...textScale.dense}
          >
            {[score, detail].filter(Boolean).join(" · ")}
          </Text>
        ) : null}
      </View>
      {home ? null : <EventIcon kind={kind} size={16} />}
    </Touchable>
  );

  return (
    <View style={styles.tlRow}>
      <View style={styles.tlSide}>{home ? bubble : null}</View>

      <View style={styles.tlCenter}>
        <View style={styles.tlLine} />
        <View style={[styles.tlMinute, goal && styles.tlMinuteGoal]}>
          <Text style={[styles.tlMinuteText, goal && styles.tlMinuteTextGoal]} {...textScale.badge}>
            {event.dakika != null ? `${event.dakika}'` : "—"}
          </Text>
        </View>
        <View style={styles.tlLine} />
      </View>

      <View style={styles.tlSide}>{home ? null : bubble}</View>
    </View>
  );
});

/** Devre arası / maç sonu — tam genişlik, etiketli ayraç. */
const TimelineBreak = memo(function TimelineBreak({ label }: { label: string }) {
  return (
    <View style={styles.tlBreak} accessibilityRole="header">
      <View style={styles.tlBreakLine} />
      <Text style={styles.tlBreakLabel} {...textScale.badge}>
        {upperTR(label)}
      </Text>
      <View style={styles.tlBreakLine} />
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

/** Kadro sekmesinin iki görünümü. */
type LineupMode = "saha" | "liste";
type LineupSide = "home" | "away";

/**
 * Dizilişi kadro satırlarından türetir: "3-3-1".
 *
 * Sunucu maç kadrosunda diziliş SAKLAMAZ (yalnız takımın ideal kadrosunda
 * vardır), bu yüzden ilk kadronun pozisyon kodları hatlara sayılıp yazılır.
 * Kaleci dizilişte gösterilmez — futbolun yazım kuralı budur (3-3-1, 1+3-3-1
 * değil).
 */
function formationOf(rows: KadroPlayer[]): string | null {
  const count: Record<"DEF" | "MID" | "FWD", number> = { DEF: 0, MID: 0, FWD: 0 };
  let keeper = 0;
  for (const row of rows) {
    const line = positionLine(row.position);
    if (line === "GK") keeper += 1;
    else count[line] += 1;
  }
  const outfield = count.DEF + count.MID + count.FWD;
  if (outfield === 0 && keeper === 0) return null;
  return `${count.DEF}-${count.MID}-${count.FWD}`;
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
  const { width } = useWindowDimensions();

  /**
   * MOBİLDE TEK TAKIM: iki kadroyu aynı sahaya koymak 36px avatarları 22px'e
   * indirmeyi ve soyadlarını kısaltmayı gerektiriyordu. Takım segmenti
   * okunurluğu koruyor ve tek dokunuşla diğer tarafa geçiriyor.
   */
  const [side, setSide] = useState<LineupSide>("home");
  const [mode, setMode] = useState<LineupMode>("saha");
  const [sheetPlayer, setSheetPlayer] = useState<KadroPlayer | null>(null);

  /** Oyuncu katkıları id ile aranır: satırın sağındaki G/A/K rozetleri buradan. */
  const contribById = useMemo(() => {
    const map = new Map<number, ContribRow>();
    for (const row of [...contributions.home, ...contributions.away]) {
      if (row.playerId) map.set(Number(row.playerId), row);
    }
    return map;
  }, [contributions]);

  const teamName = side === "home" ? match.first_team_name : match.second_team_name;
  const rows = useMemo(
    () => (side === "home" ? kadro?.home : kadro?.away) ?? [],
    [kadro, side],
  );
  const starters = useMemo(() => rows.filter((row) => row.role === "starter"), [rows]);
  const bench = useMemo(() => rows.filter((row) => row.role !== "starter"), [rows]);

  const sideItems = useMemo<SegmentedItem<LineupSide>[]>(
    () => [
      { key: "home", label: match.first_team_name },
      { key: "away", label: match.second_team_name },
    ],
    [match.first_team_name, match.second_team_name],
  );

  const openPlayer = useCallback(
    (playerId: number) => router.push(`/oyuncu/${playerId}`),
    [router],
  );

  /* Sahadaki oyuncular: avatarın sağ üstündeki rozetler gerçek olaylardan. */
  const pitchPlayers = useMemo<PitchPlayerView[]>(
    () =>
      starters.map((row, index) => {
        const playerId = Number(row.playerId ?? row.oyuncu_id) || null;
        const contrib = playerId ? contribById.get(playerId) : null;
        const sub = playerId ? substitutions.get(playerId) : null;
        const events: EventIconKind[] = [];
        if (contrib?.goals) events.push("goal");
        if (contrib?.cards) events.push("yellow");
        if (sub?.out != null) events.push("substitution");
        return {
          key: playerKey(row, index),
          name: row.playerName || row.guestName || "İsimsiz oyuncu",
          photo: row.playerImg,
          number: row.number,
          position: row.position,
          events,
          onPress: () => setSheetPlayer(row),
        };
      }),
    [starters, contribById, substitutions],
  );

  const formation = useMemo(() => formationOf(starters), [starters]);

  /* Liste görünümünde bölümler; saha görünümünde yalnız yedekler. */
  const sections = useMemo<LineupSection[]>(() => {
    const out: LineupSection[] = [];
    if (mode === "liste" && starters.length) {
      out.push({ title: `${teamName} · İlk kadro`, meta: String(starters.length), data: starters });
    }
    if (bench.length) {
      out.push({ title: "Yedekler", meta: String(bench.length), data: bench });
    }
    return out;
  }, [mode, starters, bench, teamName]);

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
      <SectionHeader title={section.title} meta={section.meta} size="group" sticky />
    ),
    [],
  );

  const header = useMemo(
    () => (
      <View style={styles.lineupHead}>
        <SegmentedControl items={sideItems} value={side} onChange={setSide} size="sm" />

        {mode === "saha" ? (
          starters.length ? (
            <PitchView
              players={pitchPlayers}
              width={width - layout.screenPadding * 2}
              formation={formation}
              style={styles.pitchWrap}
            />
          ) : (
            <EmptyState
              icon="people-outline"
              title="İlk kadro girilmedi"
              body={`${teamName} bu maçın ilk kadrosunu açıklamadı. Yedekler aşağıda görünüyor.`}
            />
          )
        ) : null}

        <Touchable
          feedback="button"
          haptic="selection"
          onPress={() => setMode((current) => (current === "saha" ? "liste" : "saha"))}
          accessibilityRole="button"
          style={styles.lineupToggle}
        >
          <Ionicons
            name={mode === "saha" ? "list-outline" : "football-outline"}
            size={14}
            color={colors.brandAccent}
          />
          <Text style={styles.lineupToggleText} {...textScale.dense}>
            {mode === "saha" ? "Kadroyu liste olarak gör" : "Sahaya dön"}
          </Text>
        </Touchable>
      </View>
    ),
    [sideItems, side, mode, starters.length, pitchPlayers, width, formation, teamName],
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

  if (!(kadro?.home?.length || kadro?.away?.length)) {
    return (
      <EmptyState
        icon="people-outline"
        title="Kadrolar açıklanmadı"
        body="Takımlar kadrolarını girdiğinde saha görünümü ve yedekler burada çıkar."
      />
    );
  }

  return (
    <>
      <SectionList
        {...scrollProps}
        sections={sections}
        keyExtractor={playerKey}
        renderItem={renderItem}
        renderSectionHeader={renderSectionHeader}
        ListHeaderComponent={header}
        refreshControl={refreshControl}
        contentContainerStyle={styles.listContent}
        stickySectionHeadersEnabled
        initialNumToRender={14}
        windowSize={9}
      />

      <PlayerSheet
        player={sheetPlayer}
        contrib={
          sheetPlayer
            ? contribById.get(Number(sheetPlayer.playerId ?? sheetPlayer.oyuncu_id)) ?? null
            : null
        }
        onClose={() => setSheetPlayer(null)}
        onOpen={openPlayer}
      />
    </>
  );
}

/**
 * Oyuncuya dokununca açılan kart.
 *
 * NEDEN SAYFAYA GİTMİYOR: sahada bir oyuncuya dokunmanın en sık sebebi "bu kim
 * ve nasıl oynadı" sorusudur; tam sayfaya gitmek kadroyu kaybettiriyor ve geri
 * dönüşte sekme sıfırlanıyordu. Sheet soruyu yerinde yanıtlıyor, sayfaya
 * gitmek isteyen için de tek düğme bırakıyor.
 *
 * ISI HARİTASI YOK: sunucu oyuncu konum verisi tutmuyor. Uydurma bir ısı
 * haritası, gerçek verinin yanında duran sahte bir grafik olurdu.
 */
const PlayerSheet = memo(function PlayerSheet({
  player,
  contrib,
  onClose,
  onOpen,
}: {
  player: KadroPlayer | null;
  contrib: ContribRow | null;
  onClose: () => void;
  onOpen: (playerId: number) => void;
}) {
  const playerId = player ? Number(player.playerId ?? player.oyuncu_id) || null : null;
  const linkable = Boolean(playerId) && !player?.isGuest;
  const name = player?.playerName || player?.guestName || "İsimsiz oyuncu";
  const rating = player?.puan != null ? Number(player.puan) : null;

  return (
    <BottomSheet visible={player != null} onClose={onClose} title={name}>
      {player ? (
        <View style={styles.sheetBody}>
          <View style={styles.sheetHead}>
            <Avatar name={name} image={player.playerImg} size={56} />
            <View style={styles.sheetTexts}>
              <Text style={styles.sheetMeta} numberOfLines={1} {...textScale.dense}>
                {[
                  positionLabel(player.position) || null,
                  player.number !== "" && player.number != null ? `Forma ${player.number}` : null,
                  player.captain ? "Kaptan" : null,
                  player.isGuest ? "Misafir" : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </Text>
              {rating != null ? <RatingPill value={rating} /> : null}
            </View>
          </View>

          <View style={styles.sheetStats}>
            <SheetStat label="Gol" value={contrib?.goals ?? 0} />
            <View style={styles.sheetStatAxis} />
            <SheetStat label="Asist" value={contrib?.assists ?? 0} />
            <View style={styles.sheetStatAxis} />
            <SheetStat label="Kart" value={contrib?.cards ?? 0} />
          </View>

          {linkable && playerId ? (
            <Button
              label="Oyuncu sayfasına git"
              icon="arrow-forward"
              fullWidth
              onPress={() => {
                onClose();
                onOpen(playerId);
              }}
            />
          ) : null}
        </View>
      ) : null}
    </BottomSheet>
  );
});

const SheetStat = memo(function SheetStat({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.sheetStat}>
      <Text style={styles.sheetStatValue} {...textScale.dense}>
        {value}
      </Text>
      <Text style={styles.sheetStatLabel} {...textScale.badge}>
        {upperTR(label)}
      </Text>
    </View>
  );
});

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

      <Avatar name={name} image={player.playerImg} size={36} />

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
          <Ionicons name="arrow-up" size={13} color={colors.win} />
          <Text style={[styles.subMinute, { color: colors.win }]} {...textScale.badge}>
            {sub.in}&apos;
          </Text>
        </View>
      ) : null}
      {sub?.out != null ? (
        <View style={styles.subMark}>
          <Ionicons name="arrow-down" size={13} color={colors.loss} />
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
      <Ionicons name={icon} size={14} color={color} />
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

/**
 * İstatistik grupları.
 *
 * NEDEN GRUPLU: on iki satırı düz sıralamak, hepsini eşit önemde gösteren bir
 * döküm üretiyordu; okuyucu "bu takım nerede iyi" sorusunu ancak tek tek
 * karşılaştırarak yanıtlayabiliyordu. Üç blok soruyu blok başlığında yanıtlar.
 *
 * NEDEN BU ÜÇ BLOK: sunucunun gerçekten tuttuğu olay kodları bu üç aileye
 * ayrılıyor. TOPLA OYNAMA YÜZDESİ VE xG BİLEREK YOK — şemada karşılıkları
 * bulunmuyor ve uydurulmuş bir yüzde, gerçek verinin yanında duran sahte bir
 * sayı olurdu.
 *
 * Tanınmayan kodlar "Mücadele"ye düşer: sunucuya yeni bir olay kodu eklendiğinde
 * ekran onu sessizce yutmaz, bir yerde gösterir.
 */
const STAT_GROUPS: { title: string; labels: string[] }[] = [
  { title: "Hücum", labels: ["Goller", "Asistler", "Fırsat Yarat."] },
  { title: "Mücadele", labels: ["Kurtarışlar", "Kritik Blok", "Hava Topu", "İkili Müc."] },
  { title: "Disiplin", labels: ["Fauller", "Sarı Kart", "Kırmızı Kart", "Sakatlık", "Değişiklik"] },
];

interface StatSection {
  title: string;
  data: StatRow[];
}

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

  /*
    Sıfır satırlar elenir — "Kırmızı Kart 0–0" barı hiçbir şey söylemez ve
    ekranda gerçek veriyle aynı yeri kaplar. Goller tek istisnadır: 0–0 da bir
    sonuçtur ve gösterilmesi gerekir.
  */
  const sections = useMemo<StatSection[]>(() => {
    const byLabel = new Map(statRows.map((row) => [row.label, row]));
    const known = new Set(STAT_GROUPS.flatMap((group) => group.labels));
    const unknown = statRows.filter((row) => !known.has(row.label));

    const keep = (row: StatRow) => row.label === "Goller" || row.home > 0 || row.away > 0;

    return STAT_GROUPS.map((group) => {
      const rows = group.labels
        .map((label) => byLabel.get(label))
        .filter((row): row is StatRow => row != null);
      // Tanınmayan kodlar Mücadele bloğunun sonuna eklenir.
      const data = (group.title === "Mücadele" ? [...rows, ...unknown] : rows).filter(keep);
      return { title: group.title, data };
    }).filter((section) => section.data.length > 0);
  }, [statRows]);

  const renderItem = useCallback(
    ({ item, index, section }: { item: StatRow; index: number; section: StatSection }) => (
      <View
        style={[
          styles.statCard,
          index === 0 && styles.statCardFirst,
          index === section.data.length - 1 && styles.statCardLast,
        ]}
      >
        <StatBar label={item.label} home={item.home} away={item.away} />
      </View>
    ),
    [],
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: StatSection }) => <SectionHeader title={section.title} />,
    [],
  );

  const openPlayer = useCallback(
    (playerId: number) => router.push(`/oyuncu/${playerId}`),
    [router],
  );

  return (
    <SectionList
      {...scrollProps}
      sections={sections}
      keyExtractor={statKey}
      renderItem={renderItem}
      renderSectionHeader={renderSectionHeader}
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
        </View>
      }
      ListEmptyComponent={
        <EmptyState
          icon="stats-chart-outline"
          variant="inline"
          title="İstatistik girilmedi"
          body="Bu maçın olayları girildikçe gol, kurtarış, ikili mücadele ve kart karşılaştırmaları burada oluşur."
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
/** Zaman çizelgesi öğesi (olay ya da ayraç) — anahtar zaten öğenin içinde. */
const timelineKey = (item: TimelineItem) => item.key;
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
/**
 * Gol atanlar — skor bloğunun altındaki iki sütun.
 *
 * NEDEN AYRI KANCA: skor bloğu, "kim attı" sorusunu zaman tüneline inmeden
 * yanıtlamalı; bu maç detayının en çok sorulan sorusudur. Olay listesini
 * hero'nun içinde filtrelemek her canlı olayda hero'yu yeniden çizerdi.
 *
 * KENDİ KALESİNE GOL, SKORU HANGİ TAKIMA YAZIYORSA O SÜTUNDA görünür (skor
 * tablosuyla tutarlı olması için) ama adın yanında (k.k.) notu taşır — aksi
 * hâlde oyuncu, rakip takımın golcüsü gibi okunurdu.
 */
function useGoalScorers(
  events: ApiMatchEvent[],
  homeTeamId: number | null,
  awayTeamId: number | null,
  nameOf: (playerId?: number | null) => string | null,
): { home: ScorerLine[]; away: ScorerLine[] } {
  return useMemo(() => {
    const home: ScorerLine[] = [];
    const away: ScorerLine[] = [];

    for (const event of events) {
      const goal = isGoal(event);
      const own = isOwnGoal(event);
      if (!goal && !own) continue;

      const scoredBy = Number(event.takim_id);
      // Kendi kalesine golde sayı RAKİBE yazılır; sütun da ona göre seçilir.
      const creditedHome = own ? scoredBy !== Number(homeTeamId) : scoredBy === Number(homeTeamId);
      const creditedAway = own ? scoredBy !== Number(awayTeamId) : scoredBy === Number(awayTeamId);

      const line: ScorerLine = {
        key: String(event.id),
        name: nameOf(event.oyuncu_id) ?? "Bilinmeyen oyuncu",
        minute: event.dakika ?? null,
        ownGoal: own,
      };

      if (creditedHome) home.push(line);
      else if (creditedAway) away.push(line);
    }

    const byMinute = (a: ScorerLine, b: ScorerLine) => (a.minute ?? 0) - (b.minute ?? 0);
    return { home: home.sort(byMinute), away: away.sort(byMinute) };
  }, [events, homeTeamId, awayTeamId, nameOf]);
}

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
  }, [events]);

  /**
   * Vurguyu ayrı efekt sıfırlar.
   *
   * Zamanlayıcı yukarıdaki tespit efektinde kurulsaydı: o efekt `events` her
   * değiştiğinde yeniden koşar, temizleyici bekleyen zamanlayıcıyı iptal eder
   * ve yeni gol olmadığı için (`fresh == null`) bir daha kurulmazdı — `flashId`
   * bir sonraki gole kadar dolu kalırdı.
   */
  useEffect(() => {
    if (flashId == null) return;
    const timer = setTimeout(() => setFlashId(null), 4_000);
    return () => clearTimeout(timer);
  }, [flashId]);

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

  /* ---- Hero: mürekkep blok ---- */
  hero: {
    // Gradyan yüklenemezse düz mürekkep zemin altta durur.
    backgroundColor: colors.inkBlock,
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.lg,
    paddingBottom: space.lg,
    gap: space.md,
    // Alt köşeler yuvarlak: blok "sayfaya oturmuş bir panel" olur, ekranı
    // ikiye bölen düz bir bant değil.
    borderBottomLeftRadius: radius.xxl,
    borderBottomRightRadius: radius.xxl,
    overflow: "hidden",
  },
  heroTeams: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  heroTeam: {
    flex: 1,
    alignItems: "center",
    gap: space.sm,
    paddingVertical: space.xxs,
    borderRadius: radius.md,
  },
  /* 14px (label) — 15px'te "ŞANLI BERKCAN GÜCÜ" ikinci satırda da kırpılıyordu.
     İki satır + 14px, üç kelimelik takım adlarını tam gösteriyor. */
  heroTeamName: {
    ...type.label,
    color: colors.onDark,
    textAlign: "center",
    minHeight: 40,
  },
  heroCenter: {
    minWidth: 118,
    alignItems: "center",
    justifyContent: "flex-start",
    gap: space.m,
    paddingTop: space.sm,
  },
  heroScore: {
    ...type.scoreHero,
    color: colors.onDark,
  },
  /* Tire skordan sönük: göz iki rakamı görsün, aradaki işareti değil. */
  heroScoreDash: {
    color: colors.onDarkMuted,
  },
  /** "MS" pulu — mürekkep blok üstünde tebeşir çerçeveli. */
  heroChip: {
    paddingHorizontal: space.m,
    paddingVertical: space.xxs,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.chalk,
  },
  heroChipText: {
    ...type.micro,
    color: colors.onDarkMuted,
  },

  /* ---- Gol atanlar: iki sütun, ortada eksen ---- */
  scorers: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space.md,
  },
  scorerColumn: {
    flex: 1,
    gap: space.xs,
  },
  /* Ortadaki hairline — iki sütunun hangi eksene yaslandığını söyler. */
  scorerAxis: {
    width: 1,
    alignSelf: "stretch",
    backgroundColor: colors.chalk,
  },
  scorerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
  },
  /* Ev sahibi sütunu SAĞA yaslanır: ikon da metnin sağına geçer. */
  scorerRowHome: {
    flexDirection: "row-reverse",
  },
  scorerText: {
    ...type.bodySm,
    color: colors.onDarkMuted,
    flexShrink: 1,
  },
  /** Dakika asla kırpılmaz: sabit genişlikli, tabular. */
  scorerMinute: {
    ...type.clock,
    color: colors.onDarkMuted,
  },
  scorerMore: {
    ...type.micro,
    color: colors.onDarkMuted,
    opacity: 0.8,
  },
  scorerTextHome: {
    textAlign: "right",
  },
  heroKickoff: {
    ...type.scoreLg,
    color: colors.onDark,
  },
  heroClock: {
    alignItems: "center",
  },
  heroCountdown: {
    ...type.bodySm,
    color: colors.onDarkMuted,
  },
  heroMeta: {
    ...type.caption,
    color: colors.onDarkMuted,
    textAlign: "center",
  },

  /* ---- Kadro sekmesi: saha başlığı, görünüm düğmesi, oyuncu kartı ---- */
  lineupHead: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.md,
    gap: space.md,
  },
  pitchWrap: {
    alignSelf: "center",
  },
  lineupToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.s,
    paddingVertical: space.m,
    borderRadius: radius.md,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  lineupToggleText: {
    ...type.label,
    color: colors.brandAccent,
  },
  sheetBody: {
    gap: space.lg,
    paddingBottom: space.sm,
  },
  sheetHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
  },
  sheetTexts: {
    flex: 1,
    gap: space.s,
    alignItems: "flex-start",
  },
  sheetMeta: {
    ...type.caption,
    color: colors.textSecondary,
  },
  /* Sayı bloğu KUTU DEĞİL: hairline ile bölünmüş üç sütun. */
  sheetStats: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  sheetStat: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  sheetStatAxis: {
    width: hairline,
    backgroundColor: colors.separator,
  },
  sheetStatValue: {
    ...type.metric,
    color: colors.textPrimary,
  },
  sheetStatLabel: {
    ...type.overline,
    color: colors.textTertiary,
  },

  /* ---- Yeniden bağlanma şeridi ---- */
  /* Şerit mürekkep bloğun İÇİNDE durur: açık bej bir kutu orada alarm gibi
     parlıyordu. Tebeşir çerçeve + kısılmış beyaz, bilgiyi verir ama skoru
     bastırmaz. */
  reconnect: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.chalk,
    paddingHorizontal: space.md,
    paddingVertical: space.m,
  },
  reconnectText: {
    ...type.bodySm,
    color: colors.onDarkMuted,
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
    paddingVertical: space.xxs,
  },
  tlSide: {
    flex: 1,
  },
  tlBubble: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.m,
    borderRadius: radius.md,
    paddingHorizontal: space.m,
    paddingVertical: space.sm,
  },
  tlBubbleHome: {
    justifyContent: "flex-start",
  },
  /* Gol satırı zeminli kart olur: 90 dakikada olan tek önemli şey odur.
     Yumuşak gölge, gol kartını akışın diğer satırlarından bir kat yukarı
     kaldırır — çizgi tek başına bunu yapamıyordu. */
  tlBubbleGoal: {
    ...elevate(1),
    borderRadius: radius.md,
  },
  tlBubbleAway: {
    justifyContent: "flex-end",
  },
  tlTexts: {
    flexShrink: 1,
  },
  tlName: {
    ...type.body,
    color: colors.textSecondary,
  },
  tlNameGoal: {
    ...type.h3,
    color: colors.textPrimary,
  },
  tlDetail: {
    ...type.bodySm,
    color: colors.textTertiary,
  },
  tlAlignLeft: {
    textAlign: "left",
  },
  tlAlignRight: {
    textAlign: "right",
  },
  tlCenter: {
    width: 56,
    alignItems: "center",
  },
  /* Dikey ray: satırların ortasından geçen sürekli çizgi hissini kurar. */
  tlLine: {
    width: 1.5,
    height: 14,
    backgroundColor: colors.border,
  },
  tlMinute: {
    minWidth: 42,
    paddingHorizontal: space.s,
    paddingVertical: 3,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    backgroundColor: colors.surface1,
  },
  tlMinuteText: {
    ...type.tableNumStrong,
    color: colors.textTertiary,
  },
  /* Golün dakikası da vurgulanır: çizginin üstünde dolu bir işaret olur. */
  tlMinuteGoal: {
    backgroundColor: colors.textPrimary,
    borderColor: colors.textPrimary,
  },
  tlMinuteTextGoal: {
    color: colors.surface1,
  },

  /* ---- Devre ayracı: tam genişlik, etiketli ---- */
  tlBreak: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.lg,
    paddingHorizontal: layout.screenPadding,
    paddingVertical: space.lg,
  },
  tlBreakLine: {
    flex: 1,
    height: hairline,
    backgroundColor: colors.border,
  },
  tlBreakLabel: {
    ...type.overline,
    color: colors.textTertiary,
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
    gap: space.md,
    marginHorizontal: layout.screenPadding,
    paddingHorizontal: space.md,
    paddingVertical: space.m,
    borderRadius: radius.md,
    marginTop: space.s,
    minHeight: layout.listRowHeight,
    ...elevate(1),
  },
  /** Forma numarası kendi kutusunda durur: sütun hizası rakam uzasa da bozulmaz. */
  shirt: {
    ...type.tableNumStrong,
    color: colors.textTertiary,
    width: 26,
    textAlign: "center",
  },
  playerTexts: {
    flex: 1,
    gap: space.xxs,
  },
  playerName: {
    ...type.h4,
    color: colors.textPrimary,
  },
  playerMeta: {
    ...type.bodySm,
    color: colors.textTertiary,
  },
  contribRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.s,
  },
  contribBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
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
