/**
 * MAÇLAR (dosya adı tarihsel: `skorlar`) — uygulamanın açılış sekmesi: maç
 * listesi, canlı skorlar ve kullanıcının kendi maçları tek ekranda.
 *
 * GÖRÜNÜM GENİŞLİĞİ (`useScope().matchView`, lig seçicinin "Tümü" satırları):
 *   · league  → seçili lig + sezon; sezonun tamamı tek istekte gelir.
 *   · city    → seçili ilin BÜTÜN ligleri ("Ankara · Tüm ligler").
 *   · country → bütün iller ("Tüm Türkiye").
 *   Geniş görünümlerde sezon yoktur; maçlar bir gün penceresi kadar
 *   (`/maclar?date_from&date_to[&city_id]`) çekilir.
 *
 * NE YAPAR: seçili kapsamdaki maçları GÜNE göre süzer, LİGE
 * göre gruplar ve tek dikey eksende okunan satırlar hâlinde listeler. Dört
 * segment aynı veriyi farklı pencereden gösterir: Tümü · Canlı · Bitti ·
 * Yaklaşan. Eski üç ekranın yerini alır:
 *   · Maçlar  → gün gezgini, segmentler, lig grupları, takvim (aynen burada).
 *   · Canlı   → Canlı segmenti + "Tüm Türkiye" görünümü: `/maclar/live`
 *               KAPSAM FİLTRESİZ akışı lige göre gruplu listelenir; iki
 *               yoklama arasındaki skor farkından gol bandı üretilir. `/canli`
 *               rotası `?tab=canli&tum=1` ile buraya düşer (tum=1 → Tüm Türkiye).
 *   · Ana Sayfa → vitrin maçı (grafit sahne) ve "benim maçlarım" kesiti.
 *
 * LİSTE SIRASI (yukarıdan aşağı):
 *   1. VİTRİN — takip edilen takımın CANLI ya da BUGÜNKÜ maçı, grafit sahnede
 *      (ekrandaki tek sahne, tepede). Yoksa vitrin YOK; yedek maç uydurulmaz.
 *   2. TAKİP ETTİKLERİN — takip edilen takım / maç / lig'in o günün (Canlı'da:
 *      şu anın) maçları. Takip edilen takımın başka ligdeki maçları da gelir
 *      (`/maclar?team_id=`, takım başına bir sorgu, 5 dk taze). Grup boşsa
 *      çizilmez; yerine tek satırlık ince ipucu ("… maçı yok · Takip et").
 *      Şu an bakılan ligin takibi bu gruba KOPYALANMAZ — o lig zaten aşağıda.
 *   3. SABİTLENEN LİGLER — lig başlığındaki raptiye ile (`useScope().
 *      togglePinLeague`, cihazda). Aynı liste lig seçicide de üstte durur.
 *   4. DİĞERLERİ — takip edilen ligler önce, gerisi Türkçe alfabetik.
 *
 * BAŞLIK: kâğıt `ScreenHeader` "Maçlar", sağda arama; bantta segment
 * (Tümü · Canlı · Bitti · Yaklaşan) ve gerekirse gol bandı.
 * ALT ÇUBUK (`MatchesDock`, alt menünün hemen üstünde, TEK satır): lig/sezon
 * seçici hapı (`LeaguePicker allowAll`) ve gün gezgini ‹ Bugün › (etikete
 * dokununca takvim; Canlı'da yerini "N canlı" özetine bırakır). Kapsam bir
 * AYARDIR; yalnız hapta yazılır, kâğıtta tekrarlanmaz.
 *
 * TAKİP: maç satırındaki yıldız ve lig başlığındaki yıldız
 * `useFollowFlow().toggle` kullanır — takip edince bildirim türleri alt
 * sayfası açılır. Raptiye (sabitle) takipten AYRIDIR: düzen tercihidir,
 * bildirim değildir.
 *
 * URL: `?tab=canli&date=2026-08-18&tum=1`. Gol bildirimi ya da paylaşılan bir
 * bağlantı doğrudan doğru segmente, güne ve kapsama düşsün diye bunlar ekran
 * durumunda değil ROTADA taşınır. `tum=1` görünümü "Tüm Türkiye"ye açar.
 *
 * YOKLAMA: canlı uçlar yalnız uygulama ön plandayken yoklanır; Canlı
 * segmentinde 15-20 sn, diğerlerinde 60 sn. Kapsamsız canlı sorgu, sekme
 * rozetinin (`useLiveFavoriteCount`) önbellek anahtarını paylaşır — aynı uç
 * iki kez çekilmez. Satır başına soket yok: gerçek zamanlı akış maç
 * detayında başlar.
 *
 * PERFORMANS SÖZLEŞMESİ: satır yüksekliği sabittir (`matchCardHeight` →
 * compact + dense, 46px tek satır), bölüm başlığı sabittir → `getItemLayout` kurulur ve
 * SectionList hücre ölçmez. Liste başlığı (vitrin/ipucu) tek ölçülen öğedir;
 * `onLayout` ile ölçülüp ofsetlere eklenir. Satır ve başlık bileşenleri
 * `memo`'lu; render sırasında kapanış üretilmez — dokunma işleyicileri maçı
 * kendi içinde bağlayan küçük sarmalayıcılarda yaşar.
 */

import { useQueries, useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SectionList, StyleSheet, Text, View } from "react-native";
import type { LayoutChangeEvent, SectionListData, SectionListRenderItemInfo } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { CalendarSheet, type DayMarker } from "@/components/scores/CalendarSheet";
import { FollowedHint, FollowedSpotlight } from "@/components/scores/FollowedSpotlight";
import { GoalBand } from "@/components/scores/GoalBand";
import { MatchesDock } from "@/components/scores/MatchesDock";
import {
  byKickoff,
  dayPhrase,
  detectGoal,
  matchDay,
  normalizeName,
  scoreKey,
  shiftDays,
  type GoalNews,
  toIsoDate,
} from "@/components/scores/scoreUtils";
import { LEAGUE_GROUP_HEADER_HEIGHT } from "@/components/ui/LeagueGroupHeader";
import {
  EmptyState,
  ErrorState,
  LeagueGroupHeader,
  MatchCard,
  matchDayLabel,
  ScreenHeader,
  SegmentedControl,
  SkeletonMatchRow,
  matchCardHeight,
  useHeaderScroll,
  useRefresh,
} from "@/components/ui";
import type { SegmentedItem } from "@/components/ui";
import { ALL_LIVE_POLL_MS, ALL_LIVE_STALE_MS, useAppActive } from "@/hooks/useLiveFavoriteCount";
import { useScreenFocused } from "@/hooks/useScreenFocused";
import { useTeamLogos } from "@/hooks/useTeamLogos";
import { haptics } from "@/lib/haptics";
import { getLiveMatches, getMatches, getTeamMatches } from "@/lib/api/matches";
import { matchState } from "@/lib/match";
import { queryKeys } from "@/lib/queryKeys";
import type { ApiMatch } from "@/lib/types";
import { useFavorite } from "@/providers/FavoriteProvider";
import { useFollowFlow } from "@/providers/FollowFlowProvider";
import { useScope } from "@/providers/ScopeProvider";
import { animateNextLayout, colors, hairline, layout, radius, space } from "@/theme";

/* ═══════════════════════ SABİTLER VE KÜÇÜK YARDIMCILAR ═══════════════════════ */

type TabKey = "tumu" | "canli" | "bitti" | "yaklasan";

const TAB_KEYS: readonly string[] = ["tumu", "canli", "bitti", "yaklasan"];

/** Satır ve başlık yükseklikleri — `getItemLayout` bunlardan kurulur. */
const ROW_HEIGHT = matchCardHeight({ variant: "compact", dense: true });
/** Gruplar arası boşluk + lig başlığı. Boşluk başlığın İÇİNDE: yapışkan başlık
 *  tepeye yapıştığında altından kayan satır sızmasın diye opak zemin gerekir. */
const GROUP_GAP = space.md;
const SECTION_HEADER_HEIGHT = GROUP_GAP + LEAGUE_GROUP_HEADER_HEIGHT;

/** Geniş görünümde çekilen gün penceresi: bir hafta önce … iki hafta sonrası
 *  (takvim noktaları da bu pencereden çıkar). */
const STRIP_BACK_DAYS = 7;
const STRIP_FORWARD_DAYS = 14;

/** Canlı segmentinde yoklama. Kapsamsız akış sekme rozetiyle ortak aralıkta
 *  (ALL_LIVE_POLL_MS, hooks/useLiveFavoriteCount). */
const LIVE_POLL_MS = 20_000;
const IDLE_POLL_MS = 60_000;
/** Gol bandı kalıcı değildir; bu süre sonunda kendini toplar. */
const GOAL_BAND_MS = 90_000;
/** Geniş görünümde (il / Türkiye) tek istekte gelebilecek en çok maç. */
const WINDOW_LIMIT = 5000;
/** Takım başına sorgu açılır; takip listesi uzarsa ilk N takım yeter. */
const MAX_FOLLOWED_TEAM_QUERIES = 12;
const TEAM_MATCHES_STALE_MS = 5 * 60_000;

const FOLLOWED_KEY = "takip";

function readParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value ?? undefined;
}

const normalizeTab = (value: string | undefined): TabKey =>
  value && TAB_KEYS.includes(value) ? (value as TabKey) : "tumu";

const normalizeDate = (value: string | undefined, fallback: string): string =>
  value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback;

/** Aynı maç birden çok kaynaktan gelebilir; SONRA gelen (daha taze) kazanır. */
function mergeById(...lists: (ApiMatch[] | undefined)[]): ApiMatch[] {
  const map = new Map<number, ApiMatch>();
  for (const list of lists) {
    if (!list) continue;
    for (const match of list) map.set(Number(match.id), match);
  }
  return Array.from(map.values());
}

/* ═══════════════════════════════ BÖLÜM TİPLERİ ═══════════════════════════════ */

interface ScoreSectionMeta {
  /** Bölüm kimliği — katlama durumu ve SectionList anahtarı bunu kullanır. */
  key: string;
  kind: "followed" | "league";
  leagueId: number | null;
  leagueName: string;
  cityId: number | null;
  cityName: string | null;
  pinned: boolean;
  following: boolean;
  collapsed: boolean;
  /** Katlıyken de gösterilecek gerçek maç sayısı. */
  total: number;
}

type ScoreSection = ScoreSectionMeta & { data: ApiMatch[] };

/* ══════════════════════════════════ EKRAN ═══════════════════════════════════ */

export default function ScoresScreen() {
  const router = useRouter();
  const scope = useScope();
  const teams = useTeamLogos();
  const favorite = useFavorite();
  const flow = useFollowFlow();
  const appActive = useAppActive();
  // Sekme ekranı başka sekmedeyken de mount kalır: görünmüyorsa yoklama yok.
  const screenFocused = useScreenFocused();
  const polling = appActive && screenFocused;
  const params = useLocalSearchParams();
  /** Başlığın daralması listenin kaydırmasına bağlıdır (bkz. ScreenHeader). */
  const { scrollY, scrollProps } = useHeaderScroll();

  /** Bugün ekran ömrü boyunca bir kez hesaplanır (gece yarısı geçişi nadir). */
  const todayIso = useMemo(() => toIsoDate(new Date()), []);

  const paramTab = readParam(params.tab);
  const paramDate = readParam(params.date);
  const paramAll = readParam(params.tum);

  const [tab, setTabState] = useState<TabKey>(() => normalizeTab(paramTab));
  const [date, setDateState] = useState<string>(() => normalizeDate(paramDate, todayIso));
  const [collapsedKeys, setCollapsedKeys] = useState<Record<string, boolean>>({});
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [listHeaderHeight, setListHeaderHeight] = useState(0);

  // Ekran zaten açıkken yeni bir derin bağlantı gelirse (bildirimden dönüş)
  // rota parametresi durumu ezer — tersi değil.
  useEffect(() => {
    if (paramTab) setTabState(normalizeTab(paramTab));
  }, [paramTab]);

  useEffect(() => {
    if (paramDate) setDateState((current) => normalizeDate(paramDate, current));
  }, [paramDate]);

  /** Görünüm genişliği kapsam sağlayıcısında yaşar (cihazda saklı). */
  const { matchView: view, setMatchView } = scope;
  const wide = view !== "league";

  // `/canli` ve gol bildirimleri `tum=1` taşır: görünüm Tüm Türkiye'ye açılır.
  useEffect(() => {
    if (paramAll === "1") setMatchView("country");
  }, [paramAll, setMatchView]);

  const setTab = useCallback(
    (next: TabKey) => {
      setTabState(next);
      router.setParams({ tab: next });
    },
    [router],
  );

  const setDate = useCallback(
    (next: string) => {
      setDateState(next);
      router.setParams({ date: next });
    },
    [router],
  );

  const isLive = tab === "canli";
  /** Canlı segmenti + Tüm Türkiye: kapsamsız canlı akış. */
  const showAllLive = isLive && view === "country";

  /* ─────────────────────────── TAKİPLER ─────────────────────────── */

  const followedTeams = favorite.favorites;
  const followedTeamIds = useMemo(() => new Set(followedTeams.map((team) => Number(team.id))), [followedTeams]);
  const followedTeamNames = useMemo(
    () => new Set(followedTeams.map((team) => normalizeName(team.name))),
    [followedTeams],
  );
  const followedLeagueIds = useMemo(
    () => new Set(favorite.favoriteLeagues.map((league) => Number(league.id))),
    [favorite.favoriteLeagues],
  );
  const followedSeasonIds = useMemo(
    () => new Set(favorite.favoriteSeasons.map((season) => Number(season.id))),
    [favorite.favoriteSeasons],
  );
  const followedMatchIds = useMemo(() => new Set(favorite.favoriteMatches.map(Number)), [favorite.favoriteMatches]);

  const hasAnyFollow =
    followedTeamIds.size > 0 || followedLeagueIds.size > 0 || followedSeasonIds.size > 0 || followedMatchIds.size > 0;

  /** Takip edilen TAKIMIN maçı mı? Kompakt yanıtta id gelmeyebilir → ad yedeği. */
  const involvesFollowedTeam = useCallback(
    (match: ApiMatch) =>
      (match.home_team_id != null && followedTeamIds.has(Number(match.home_team_id))) ||
      (match.away_team_id != null && followedTeamIds.has(Number(match.away_team_id))) ||
      followedTeamNames.has(normalizeName(match.first_team_name)) ||
      followedTeamNames.has(normalizeName(match.second_team_name)),
    [followedTeamIds, followedTeamNames],
  );

  /**
   * "Takip ettiklerin" grubuna girer mi: takip edilen maç, takım, lig ya da
   * sezon. Şu an bakılan lig/sezonun takibi gruba sayılmaz — o maçlar zaten
   * aşağıdaki kendi lig grubunda duruyor; kopyalamak listeyi ikiye katlardı.
   */
  const isFollowedMatch = useCallback(
    (match: ApiMatch) =>
      followedMatchIds.has(Number(match.id)) ||
      involvesFollowedTeam(match) ||
      // Geniş görünümde takip edilen ligler zaten kendi gruplarında (en üstte)
      // durur; lig/sezon takibi gruba yalnız tek lig görünümünde kopyalanır.
      (!wide &&
        match.league_id != null &&
        Number(match.league_id) !== scope.leagueId &&
        followedLeagueIds.has(Number(match.league_id))) ||
      (!wide &&
        match.season_id != null &&
        Number(match.season_id) !== scope.seasonId &&
        followedSeasonIds.has(Number(match.season_id))),
    [followedMatchIds, involvesFollowedTeam, followedLeagueIds, followedSeasonIds, scope.leagueId, scope.seasonId, wide],
  );

  /* ───────────────────────────── VERİ ───────────────────────────── */

  const scopeKey = useMemo(
    () => ({
      cityId: scope.cityId ?? undefined,
      leagueId: scope.leagueId ?? undefined,
      seasonId: scope.seasonId ?? undefined,
    }),
    [scope.cityId, scope.leagueId, scope.seasonId],
  );

  /**
   * Sezonun tamamı tek istekte gelir ve gün süzmesi istemcide yapılır: gün
   * değiştirmek ağ turu olmadan anında sonuç verir, takvimdeki "maç var"
   * noktaları da aynı veriden çıkar.
   */
  const matchesQuery = useQuery({
    queryKey: queryKeys.matches(scopeKey),
    queryFn: () =>
      getMatches({
        leagueId: scope.leagueId ?? undefined,
        seasonId: scope.seasonId ?? undefined,
        limit: 1000,
      }),
    enabled: scope.ready && !wide,
    staleTime: 30_000,
    refetchInterval: polling ? 2 * IDLE_POLL_MS : false,
  });

  /** Pencere seçili günü DAİMA kapsar (takvimden uzak bir gün seçilebilir). */
  const stripRange = useMemo(() => {
    const start = shiftDays(todayIso, -STRIP_BACK_DAYS);
    const end = shiftDays(todayIso, STRIP_FORWARD_DAYS);
    return { start: date < start ? date : start, end: date > end ? date : end };
  }, [todayIso, date]);

  /** Geniş görünümün il kimliği: il → seçili il, Türkiye → yok. */
  const windowCityId = view === "city" ? scope.cityId : null;

  /**
   * GENİŞ GÖRÜNÜM (bir ilin bütün ligleri / tüm Türkiye): sezon kavramı yok;
   * bir gün penceresi kadar maç tek istekte gelir, gün süzmesi yine
   * istemcide yapılır.
   */
  const windowQuery = useQuery({
    queryKey: queryKeys.matchesWindow(windowCityId, stripRange.start, stripRange.end),
    queryFn: () =>
      getMatches({
        cityId: windowCityId ?? undefined,
        cityName: scope.cityLabel || undefined,
        dateFrom: stripRange.start,
        dateTo: stripRange.end,
        limit: WINDOW_LIMIT,
      }),
    enabled: wide && (view === "country" || windowCityId != null),
    staleTime: 30_000,
    refetchInterval: polling ? 2 * IDLE_POLL_MS : false,
    placeholderData: (previous) => previous,
  });

  /**
   * Kapsamlı canlı maçlar — segment rozeti her zaman doğru olsun diye hep
   * açık. İl görünümünde ilin tamamı; Türkiye görünümünde kapsamsız akış
   * (`allLiveQuery`) kullanılır, bu sorgu kapanır.
   */
  const liveQuery = useQuery({
    queryKey:
      view === "city"
        ? queryKeys.liveMatches({ cityId: scope.cityId ?? undefined })
        : queryKeys.liveMatches(scopeKey),
    queryFn: () =>
      view === "city"
        ? getLiveMatches({ cityId: scope.cityId ?? undefined, cityName: scope.cityLabel || undefined })
        : getLiveMatches({
            leagueId: scope.leagueId ?? undefined,
            seasonId: scope.seasonId ?? undefined,
          }),
    enabled: view === "league" ? scope.ready : view === "city" ? scope.cityId != null : false,
    staleTime: 10_000,
    refetchInterval: polling ? (isLive ? LIVE_POLL_MS : IDLE_POLL_MS) : false,
  });

  /**
   * KAPSAMSIZ canlı akış (eski Canlı ekranı). Anahtar sekme rozetiyle ortak
   * (`useLiveFavoriteCount` aynı ucu aynı anahtarla yoklar) → tek önbellek.
   * Takip varken rozet kancası (sekme çubuğu, hep mount) bu anahtarı zaten
   * ALL_LIVE_POLL_MS ile yokluyor; burada ikinci bir zamanlayıcı kurulmaz.
   * Takip yokken (yalnız Türkiye görünümü) yoklamayı bu ekran yapar.
   * Yalnız "Tüm Türkiye" görünümünde ya da takip varken (başka ligdeki takip
   * edilen takımın canlı maçı vitrine çıksın diye) açılır.
   */
  const allLiveEnabled = view === "country" || hasAnyFollow;
  const allLiveQuery = useQuery({
    queryKey: queryKeys.liveFavoriteMatches(),
    queryFn: () => getLiveMatches(),
    enabled: allLiveEnabled,
    staleTime: ALL_LIVE_STALE_MS,
    refetchInterval: polling && !hasAnyFollow ? (isLive ? ALL_LIVE_POLL_MS : IDLE_POLL_MS) : false,
  });

  /**
   * Takip edilen takımların TÜM lig/sezonlardaki maçları — takım başına bir
   * sorgu (Takip sekmesiyle aynı anahtar → ortak önbellek). Takip sayısı
   * küçüktür; yine de üst sınır ve uzun tazelik süresi var.
   */
  const teamQueries = useQueries({
    queries: followedTeams.slice(0, MAX_FOLLOWED_TEAM_QUERIES).map((team) => ({
      queryKey: queryKeys.teamMatches(Number(team.id)),
      queryFn: () => getTeamMatches(Number(team.id)),
      staleTime: TEAM_MATCHES_STALE_MS,
    })),
  });

  const teamQueryData = teamQueries.map((query) => query.data);
  const teamDataStamp = teamQueries.map((query) => query.dataUpdatedAt).join(",");
  const followedTeamMatches = useMemo(
    () => mergeById(...teamQueryData),
    // `useQueries` her render'da yeni dizi döndürür; damga değişmedikçe aynı veri.
    [teamDataStamp],
  );

  const listQuery = wide ? windowQuery : matchesQuery;
  const allMatches = useMemo(() => listQuery.data ?? [], [listQuery.data]);

  const allLive = useMemo(() => allLiveQuery.data ?? [], [allLiveQuery.data]);

  /** Kapsamlı canlı uç henüz cevap vermediyse ana listeden türetilir — rozet boş kalmaz. */
  const scopedLive = useMemo(() => {
    if (view === "country" && allLiveQuery.data) return allLiveQuery.data;
    if (view !== "country" && liveQuery.data) return liveQuery.data;
    return allMatches.filter((match) => matchState(match) === "live");
  }, [view, allLiveQuery.data, liveQuery.data, allMatches]);

  /** Canlı segmentinde gösterilen akış: anahtara göre kapsamlı ya da kapsamsız. */
  const liveSource = showAllLive ? allLive : scopedLive;

  /** Bilinen bütün canlı maçlar (vitrin ve takip grubu için). */
  const knownLive = useMemo(() => mergeById(scopedLive, allLive), [scopedLive, allLive]);

  /** Takip grubunun havuzu: takım maçları < kapsam < canlı (taze olan kazanır). */
  const followPool = useMemo(
    () => (hasAnyFollow ? mergeById(followedTeamMatches, allMatches, knownLive) : []),
    [hasAnyFollow, followedTeamMatches, allMatches, knownLive],
  );

  /* ───────────────────── İŞARETLEME VE SÜZME ───────────────────── */

  /** Gün şeridi ve takvim noktaları. */
  const markers = useMemo(() => {
    const map: Record<string, DayMarker> = {};
    for (const match of allMatches) {
      const day = matchDay(match);
      if (!day) continue;
      const entry = map[day] ?? { count: 0, live: false };
      entry.count += 1;
      if (matchState(match) === "live") entry.live = true;
      map[day] = entry;
    }
    return map;
  }, [allMatches]);

  /** Maçı olan günler (sıralı) — "İleri git" bir sonraki dolu güne atlar. */
  const daysWithMatches = useMemo(() => Object.keys(markers).sort(), [markers]);

  /** Segment + gün süzgeci — hem lig grupları hem takip grubu aynı kuralı izler. */
  const passesSegment = useCallback(
    (match: ApiMatch) => {
      if (matchDay(match) !== date) return false;
      if (tab === "bitti") return matchState(match) === "finished";
      if (tab === "yaklasan") return matchState(match) === "scheduled";
      return true;
    },
    [tab, date],
  );

  const visibleMatches = useMemo(
    () => (isLive ? liveSource : allMatches.filter(passesSegment)),
    [isLive, liveSource, allMatches, passesSegment],
  );

  /**
   * VİTRİN — takip edilen TAKIMIN maçı: önce canlı, yoksa bugünün ilk
   * oynanmamış maçı, o da yoksa bugün biten son maçı. Hiçbiri yoksa vitrin
   * çizilmez (yer tutucu ya da "ligin sıradaki maçı" yedeği YOK).
   */
  const spotlight = useMemo<ApiMatch | null>(() => {
    if (!followedTeamIds.size && !followedTeamNames.size) return null;
    const live = knownLive.filter(involvesFollowedTeam).sort(byKickoff);
    if (live.length) return live[0];
    const today = followPool
      .filter((match) => matchDay(match) === todayIso && involvesFollowedTeam(match))
      .sort(byKickoff);
    const upcoming = today.find((match) => matchState(match) !== "finished");
    if (upcoming) return upcoming;
    return today.length ? today[today.length - 1] : null;
  }, [followedTeamIds.size, followedTeamNames.size, knownLive, followPool, involvesFollowedTeam, todayIso]);

  const spotlightId = spotlight ? Number(spotlight.id) : null;

  /** Takip grubu — vitrindeki maç hariç (aynı maç ekranda iki kez görünmez). */
  const followedMatches = useMemo(() => {
    if (!hasAnyFollow) return [];
    const source = isLive ? knownLive : followPool.filter(passesSegment);
    return source
      .filter((match) => isFollowedMatch(match) && Number(match.id) !== spotlightId)
      .sort(byKickoff);
  }, [hasAnyFollow, isLive, knownLive, followPool, passesSegment, isFollowedMatch, spotlightId]);

  const { isPinnedLeague } = scope;
  const cities = scope.cities;

  const sections = useMemo<ScoreSection[]>(() => {
    const map = new Map<string, ScoreSection>();

    for (const match of visibleMatches) {
      const leagueName = String(match.league_name ?? "").trim() || "Diğer maçlar";
      const leagueId = match.league_id != null ? Number(match.league_id) : null;
      const key = leagueId != null ? `lig-${leagueId}` : `ad-${normalizeName(leagueName)}`;

      let section = map.get(key);
      if (!section) {
        const cityName = String(match.city ?? "").trim() || null;
        const cityId =
          match.city_id != null
            ? Number(match.city_id)
            : (cities.find((city) => cityName && normalizeName(city.label) === normalizeName(cityName))?.id ??
              null);
        section = {
          key,
          kind: "league",
          leagueId,
          leagueName,
          cityId,
          cityName,
          pinned: isPinnedLeague(leagueId),
          following: leagueId != null && followedLeagueIds.has(leagueId),
          collapsed: collapsedKeys[key] === true,
          total: 0,
          data: [],
        };
        map.set(key, section);
      }
      section.total += 1;
      section.data.push(match);
    }

    const list = Array.from(map.values());
    for (const section of list) {
      section.data.sort(byKickoff);
      // Katlı bölüm başlığını korur, satırlarını bırakır.
      if (section.collapsed) section.data = [];
    }

    // Sabitlenen ligler önce, sonra takip edilen ligler, gerisi Türkçe alfabetik.
    list.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      if (a.following !== b.following) return a.following ? -1 : 1;
      return a.leagueName.localeCompare(b.leagueName, "tr");
    });

    if (followedMatches.length) {
      const collapsed = collapsedKeys[FOLLOWED_KEY] === true;
      list.unshift({
        key: FOLLOWED_KEY,
        kind: "followed",
        leagueId: null,
        leagueName: "Takip ettiklerin",
        cityId: null,
        cityName: null,
        pinned: false,
        following: false,
        collapsed,
        total: followedMatches.length,
        data: collapsed ? [] : followedMatches,
      });
    }

    return list;
  }, [visibleMatches, followedMatches, collapsedKeys, isPinnedLeague, followedLeagueIds, cities]);

  /* ───────────────────────── SON GOL BANDI ───────────────────────── */

  const previousScores = useRef<{ source: string; map: Map<number, string> } | null>(null);
  const [goal, setGoal] = useState<GoalNews | null>(null);
  const liveSourceKey =
    view === "country"
      ? "tum"
      : view === "city"
        ? `il-${scope.cityId ?? ""}`
        : `kapsam-${scope.leagueId ?? ""}-${scope.seasonId ?? ""}`;

  useEffect(() => {
    if (!isLive) {
      previousScores.current = null;
      return;
    }
    const next = new Map<number, string>();
    liveSource.forEach((match) => next.set(Number(match.id), scoreKey(match)));

    const previous = previousScores.current;
    previousScores.current = { source: liveSourceKey, map: next };
    // İlk yanıtta ya da akış değiştiğinde kıyaslanacak geçmiş yok: "GOL!" yazılmaz.
    if (!previous || previous.source !== liveSourceKey) return;

    const news = detectGoal(previous.map, liveSource);
    if (!news) return;

    animateNextLayout();
    setGoal(news);
    if (followedMatchIds.has(news.matchId)) haptics.goal();
    else haptics.light();
  }, [isLive, liveSource, liveSourceKey, followedMatchIds]);

  useEffect(() => {
    if (!goal) return;
    const timer = setTimeout(() => {
      animateNextLayout();
      setGoal(null);
    }, GOAL_BAND_MS);
    return () => clearTimeout(timer);
  }, [goal]);

  /* ─────────────────────────── EYLEMLER ─────────────────────────── */

  const openSearch = useCallback(() => router.push("/ara"), [router]);
  const openCalendar = useCallback(() => setCalendarOpen(true), []);
  const closeCalendar = useCallback(() => setCalendarOpen(false), []);
  const openFollow = useCallback(() => router.push("/(tabs)/takip"), [router]);

  const pickCalendarDate = useCallback(
    (iso: string) => {
      setDate(iso);
      // Takvimden gün seçmek tarihli bakış ister; Canlı'da gün kavramı yok.
      if (tab === "canli") setTab("tumu");
      setCalendarOpen(false);
    },
    [setDate, setTab, tab],
  );

  /** Canlı maçın doğal varış noktası detayın canlı sekmesidir. */
  const openMatch = useCallback(
    (match: ApiMatch) => {
      const id = String(match.id);
      if (matchState(match) === "live") {
        router.push({ pathname: "/mac/[id]", params: { id, tab: "canli" } });
      } else {
        router.push({ pathname: "/mac/[id]", params: { id } });
      }
    },
    [router],
  );

  const { toggle: toggleFollow } = flow;

  const toggleMatchFollow = useCallback(
    (match: ApiMatch) =>
      toggleFollow({
        type: "match",
        id: Number(match.id),
        name: `${match.first_team_name} – ${match.second_team_name}`,
      }),
    [toggleFollow],
  );

  const toggleLeagueFollow = useCallback(
    (leagueId: number | null, leagueName: string) => {
      if (leagueId == null) return;
      toggleFollow({ type: "league", id: leagueId, name: leagueName });
    },
    [toggleFollow],
  );

  const { togglePinLeague } = scope;
  const toggleLeaguePin = useCallback(
    (leagueId: number | null, leagueName: string, cityId: number | null, cityName: string | null) => {
      if (leagueId == null || cityId == null) return;
      togglePinLeague({ cityId, cityLabel: cityName ?? "", leagueId, label: leagueName });
    },
    [togglePinLeague],
  );

  const toggleSection = useCallback((key: string) => {
    setCollapsedKeys((current) => ({ ...current, [key]: !current[key] }));
  }, []);

  const openLeague = useCallback(
    (leagueId: number | null) => {
      router.push(leagueId != null ? `/(tabs)/ligler?leagueId=${leagueId}&tab=fikstur` : "/(tabs)/ligler");
    },
    [router],
  );

  /** Seçili günden sonraki ilk maç günü — boş durum düğmesi onu adıyla söyler. */
  const nextMatchDay = useMemo(() => daysWithMatches.find((day) => day > date) ?? null, [daysWithMatches, date]);

  const goToNextMatchDay = useCallback(() => {
    setDate(nextMatchDay ?? shiftDays(date, 1));
  }, [nextMatchDay, date, setDate]);

  const goToPrevDay = useCallback(() => setDate(shiftDays(date, -1)), [date, setDate]);
  const goToNextDay = useCallback(() => setDate(shiftDays(date, 1)), [date, setDate]);

  const goToToday = useCallback(() => {
    setTab("tumu");
    setDate(todayIso);
  }, [setTab, setDate, todayIso]);

  const showAllCities = useCallback(() => setMatchView("country"), [setMatchView]);
  const { openScopeSheet } = scope;
  const openScope = useCallback(() => openScopeSheet("city", { allowAll: true }), [openScopeSheet]);

  const openGoalMatch = useCallback(() => {
    if (!goal) return;
    router.push({ pathname: "/mac/[id]", params: { id: String(goal.matchId), tab: "canli" } });
  }, [goal, router]);

  const dismissGoal = useCallback(() => {
    animateNextLayout();
    setGoal(null);
  }, []);

  const refetchList = listQuery.refetch;
  const refetchLive = liveQuery.refetch;
  const refetchAllLive = allLiveQuery.refetch;
  const liveEnabled = view !== "country";
  const handleRefresh = useCallback(() => {
    void refetchList();
    if (liveEnabled) void refetchLive();
    if (allLiveEnabled) void refetchAllLive();
    teamQueries.forEach((query) => void query.refetch());
  }, [refetchList, refetchLive, refetchAllLive, liveEnabled, allLiveEnabled, teamDataStamp]);

  const refresh = useRefresh(handleRefresh, {
    refreshing: listQuery.isRefetching || liveQuery.isRefetching || allLiveQuery.isRefetching,
  });

  /* ───────────────────────── LİSTE ÇİZİMİ ───────────────────────── */

  const { logoFor } = teams;

  const renderItem = useCallback(
    ({ item, index, section }: SectionListRenderItemInfo<ApiMatch, ScoreSectionMeta>) => (
      <MatchListItem
        match={item}
        last={index === section.data.length - 1}
        homeLogo={logoFor(item.home_team_id, item.first_team_name)}
        awayLogo={logoFor(item.away_team_id, item.second_team_name)}
        isFollowing={followedMatchIds.has(Number(item.id))}
        onOpen={openMatch}
        onToggleStar={toggleMatchFollow}
      />
    ),
    [logoFor, followedMatchIds, openMatch, toggleMatchFollow],
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: SectionListData<ApiMatch, ScoreSectionMeta> }) => (
      <ScoreSectionHeader
        sectionKey={section.key}
        kind={section.kind}
        leagueId={section.leagueId}
        leagueName={section.leagueName}
        cityId={section.cityId}
        cityName={section.cityName}
        matchCount={section.total}
        collapsed={section.collapsed}
        following={section.following}
        pinned={section.pinned}
        onOpenLeague={openLeague}
        onToggleCollapse={toggleSection}
        onToggleFollow={toggleLeagueFollow}
        onTogglePin={toggleLeaguePin}
      />
    ),
    [openLeague, toggleSection, toggleLeagueFollow, toggleLeaguePin],
  );

  /**
   * SectionList düz indeks uzayı: her bölüm için [başlık, ...satırlar, altlık].
   * Altlık çizilmese bile bir indeks tüketir (VirtualizedSectionList kuralı).
   * Ofsetler içerik başına göredir; liste başlığı (vitrin/ipucu) ölçülüp eklenir.
   */
  const getItemLayout = useCallback(
    (data: SectionListData<ApiMatch, ScoreSectionMeta>[] | null, index: number) => {
      let offset = listHeaderHeight;
      let cursor = 0;

      for (const section of data ?? []) {
        if (index === cursor) return { length: SECTION_HEADER_HEIGHT, offset, index };
        offset += SECTION_HEADER_HEIGHT;
        cursor += 1;

        const count = section.data.length;
        if (index < cursor + count) {
          return { length: ROW_HEIGHT, offset: offset + (index - cursor) * ROW_HEIGHT, index };
        }
        offset += count * ROW_HEIGHT;
        cursor += count;

        if (index === cursor) return { length: 0, offset, index };
        cursor += 1;
      }

      return { length: 0, offset, index };
    },
    [listHeaderHeight],
  );

  const onListHeaderLayout = useCallback((event: LayoutChangeEvent) => {
    const height = Math.round(event.nativeEvent.layout.height);
    setListHeaderHeight((current) => (current === height ? current : height));
  }, []);

  /* ─────────────────────── ÜST BANT VE DURUMLAR ─────────────────────── */

  const liveCount = liveSource.length;

  const segments = useMemo<SegmentedItem<TabKey>[]>(
    () => [
      { key: "tumu", label: "Tümü" },
      { key: "canli", label: liveCount > 0 ? `Canlı ${liveCount}` : "Canlı", dot: liveCount > 0 },
      { key: "bitti", label: "Bitti" },
      { key: "yaklasan", label: "Yaklaşan" },
    ],
    [liveCount],
  );

  const liveSourceQuery = view === "country" ? allLiveQuery : liveQuery;

  // Tüm Türkiye kapsam istemez; il görünümü yalnız ili, tek lig üçünü ister.
  const scopeMissing =
    view === "country" ? false : view === "city" ? !scope.cityId && !scope.loading : !scope.ready && !scope.loading;
  const loading = showAllLive
    ? allLiveQuery.isLoading
    : view === "country"
      ? isLive
        ? allLiveQuery.isLoading && windowQuery.isLoading
        : windowQuery.isLoading
      : scope.loading ||
        (isLive ? liveQuery.isLoading && listQuery.isLoading : listQuery.isLoading);
  const primaryQuery = isLive ? liveSourceQuery : listQuery;
  const hasData = showAllLive ? allLive.length > 0 : allMatches.length > 0 || scopedLive.length > 0;
  const failed = primaryQuery.isError && !hasData;

  const listEmpty = useMemo(() => {
    if (isLive) {
      return view === "country" ? (
        <EmptyState
          icon="radio-outline"
          title="Şu anda canlı maç yok"
          body="Hiçbir şehirde oynanan maç yok. Maç başladığı anda burada belirir."
          action={{ label: "Bugünün maçları", onPress: goToToday }}
        />
      ) : (
        <EmptyState
          icon="radio-outline"
          title={view === "city" ? "Bu ilde canlı maç yok" : "Bu ligde canlı maç yok"}
          body="Türkiye genelinde oynanan maçlara bakabilirsin."
          action={{ label: "Tüm Türkiye'yi göster", onPress: showAllCities }}
          secondaryAction={{ label: "Bugünün maçları", onPress: goToToday }}
        />
      );
    }
    const phrase = dayPhrase(date, todayIso);
    return (
      <EmptyState
        icon="calendar-outline"
        title={`${phrase} maç yok`}
        body={
          tab === "bitti"
            ? "Bu günde tamamlanmış maç bulunmuyor."
            : tab === "yaklasan"
              ? "Bu günde oynanacak maç bulunmuyor."
              : nextMatchDay
                ? `En yakın maç günü: ${matchDayLabel(nextMatchDay)}.`
                : "Başka bir gün seçebilir ya da takvimden ileri gidebilirsin."
        }
        action={{ label: nextMatchDay ? "Sıradaki maç gününe git" : "İleri git", onPress: goToNextMatchDay }}
        secondaryAction={date === todayIso ? undefined : { label: "Bugüne dön", onPress: goToToday }}
      />
    );
  }, [isLive, view, tab, date, todayIso, goToToday, showAllCities, goToNextMatchDay, nextMatchDay]);

  /**
   * Takip grubu boşken tek satırlık ipucu. Takip hiç yoksa davet eder; varsa
   * o gün/şu an maçları olmadığını söyler. Vitrin varsa ipucu gereksizdir —
   * kullanıcının maçı zaten tepede.
   */
  const followedHint = useMemo(() => {
    if (spotlight || followedMatches.length) return null;
    if (!hasAnyFollow) return { text: "Takip ettiğin takım yok", action: "Takip et" };
    if (isLive) return { text: "Takip ettiklerinin canlı maçı yok", action: "Takip et" };
    return { text: `${dayPhrase(date, todayIso)} takip ettiklerinin maçı yok`, action: "Takip et" };
  }, [spotlight, followedMatches.length, hasAnyFollow, isLive, date, todayIso]);

  const listHeader = (
    <View onLayout={onListHeaderLayout}>
      {spotlight ? (
        <FollowedSpotlight
          match={spotlight}
          homeLogo={logoFor(spotlight.home_team_id, spotlight.first_team_name)}
          awayLogo={logoFor(spotlight.away_team_id, spotlight.second_team_name)}
          onOpen={openMatch}
        />
      ) : null}
      {followedHint ? (
        <FollowedHint text={followedHint.text} actionLabel={followedHint.action} onAction={openFollow} />
      ) : null}
    </View>
  );

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      {/* KÂĞIT BAŞLIK — "Maçlar", sağda arama. Süzgeçler altta (MatchesDock);
          bantta yalnız canlı gol bandı durur. */}
      <ScreenHeader
        title="Maçlar"
        scrollY={scrollY}
        actions={[{ icon: "search-outline", accessibilityLabel: "Ara", onPress: openSearch }]}
        bottom={
          <>
            <View style={styles.controls}>
              <SegmentedControl<TabKey> items={segments} value={tab} onChange={setTab} size="sm" />
            </View>
            {isLive && goal ? (
              <View style={styles.band}>
                <GoalBand goal={goal} onOpen={openGoalMatch} onDismiss={dismissGoal} />
              </View>
            ) : null}
          </>
        }
      />

      {/* Ekranda bayat veri varken hata satır olarak düşer; liste silinmez. */}
      {primaryQuery.isError && hasData ? (
        <ErrorState error={primaryQuery.error} onRetry={handleRefresh} variant="banner" style={styles.band} />
      ) : null}

      <View style={styles.body}>
        {scopeMissing ? (
          <EmptyState
            icon="options-outline"
            title={view === "city" ? "İl seçilmedi" : "Lig seçilmedi"}
            body="Maçları görmek için il, lig ve sezon seç ya da Tüm Türkiye'ye bak."
            action={{ label: "Lig seç", onPress: openScope }}
          />
        ) : loading ? (
          <View style={styles.skeletonWrap}>
            <View style={styles.skeletonGroup}>
              <SkeletonMatchRow count={6} />
            </View>
          </View>
        ) : failed ? (
          <ErrorState error={primaryQuery.error} onRetry={handleRefresh} />
        ) : (
          <SectionList<ApiMatch, ScoreSectionMeta>
            {...scrollProps}
            sections={sections}
            keyExtractor={keyExtractor}
            renderItem={renderItem}
            renderSectionHeader={renderSectionHeader}
            getItemLayout={getItemLayout}
            stickySectionHeadersEnabled
            contentContainerStyle={styles.list}
            ListHeaderComponent={listHeader}
            ListEmptyComponent={listEmpty}
            refreshControl={refresh.control}
            initialNumToRender={12}
            maxToRenderPerBatch={12}
            windowSize={8}
            removeClippedSubviews
            keyboardShouldPersistTaps="handled"
          />
        )}
      </View>

      {/* ALT ÇUBUK — alt menünün hemen üstünde: lig seçici + gün gezgini. */}
      <MatchesDock
        live={isLive}
        liveCount={liveCount}
        dayLabel={matchDayLabel(date)}
        isToday={date === todayIso}
        hasMatches={Boolean(markers[date]?.count)}
        hasLive={Boolean(markers[date]?.live)}
        onPrevDay={goToPrevDay}
        onNextDay={goToNextDay}
        onToday={goToToday}
        onOpenCalendar={openCalendar}
      />

      <CalendarSheet
        visible={calendarOpen}
        onClose={closeCalendar}
        value={date}
        todayIso={todayIso}
        markers={markers}
        onSelect={pickCalendarDate}
      />
    </SafeAreaView>
  );
}

const keyExtractor = (item: ApiMatch) => String(item.id);

/* ═══════════════════════════ LİSTE PARÇALARI ════════════════════════════ */

/**
 * Satır sarmalayıcı. VARLIK NEDENİ: `MatchCard` memo'lu ama `onPress` her
 * render'da yeniden üretilse memo işe yaramaz. İşleyiciler maçı kendi
 * `useCallback`'lerinde bağlar; dışarıdan yalnız ilkel değerler ve DEĞİŞMEYEN
 * iki fonksiyon geçer.
 */
const MatchListItem = memo(function MatchListItem({
  match,
  last,
  homeLogo,
  awayLogo,
  isFollowing,
  onOpen,
  onToggleStar,
}: {
  match: ApiMatch;
  /** Grubun son satırı — kartın alt köşelerini çizer. */
  last: boolean;
  homeLogo: string | null;
  awayLogo: string | null;
  isFollowing: boolean;
  onOpen: (match: ApiMatch) => void;
  onToggleStar: (match: ApiMatch) => void;
}) {
  const handlePress = useCallback(() => onOpen(match), [onOpen, match]);
  const handleStar = useCallback(() => onToggleStar(match), [onToggleStar, match]);

  return (
    <MatchCard
      variant="compact"
      dense
      position={last ? "last" : "middle"}
      match={match}
      homeLogo={homeLogo}
      awayLogo={awayLogo}
      isFavorite={isFollowing}
      onToggleFavorite={handleStar}
      onPress={handlePress}
    />
  );
});

/**
 * Bölüm başlığı sarmalayıcısı — aynı memo gerekçesi. Lig grubunda: gövde ligi
 * açar, raptiye sabitler, yıldız takip eder, chevron katlar. "Takip
 * ettiklerin" grubunda yalnız katlama vardır (bir lig değildir).
 */
const ScoreSectionHeader = memo(function ScoreSectionHeader({
  sectionKey,
  kind,
  leagueId,
  leagueName,
  cityId,
  cityName,
  matchCount,
  collapsed,
  following,
  pinned,
  onOpenLeague,
  onToggleCollapse,
  onToggleFollow,
  onTogglePin,
}: {
  sectionKey: string;
  kind: ScoreSectionMeta["kind"];
  leagueId: number | null;
  leagueName: string;
  cityId: number | null;
  cityName: string | null;
  matchCount: number;
  collapsed: boolean;
  following: boolean;
  pinned: boolean;
  onOpenLeague: (leagueId: number | null) => void;
  onToggleCollapse: (key: string) => void;
  onToggleFollow: (leagueId: number | null, leagueName: string) => void;
  onTogglePin: (leagueId: number | null, leagueName: string, cityId: number | null, cityName: string | null) => void;
}) {
  const handleOpen = useCallback(() => onOpenLeague(leagueId), [onOpenLeague, leagueId]);
  const handleToggle = useCallback(() => onToggleCollapse(sectionKey), [onToggleCollapse, sectionKey]);
  const handleFollow = useCallback(() => onToggleFollow(leagueId, leagueName), [onToggleFollow, leagueId, leagueName]);
  const handlePin = useCallback(
    () => onTogglePin(leagueId, leagueName, cityId, cityName),
    [onTogglePin, leagueId, leagueName, cityId, cityName],
  );

  if (kind === "followed") {
    return (
      <View style={styles.sectionHeader}>
        <LeagueGroupHeader
          leagueName={leagueName}
          icon="star"
          matchCount={matchCount}
          collapsed={collapsed}
          onToggle={handleToggle}
          sticky
        />
      </View>
    );
  }

  const isLeague = leagueId != null;
  return (
    <View style={styles.sectionHeader}>
      <LeagueGroupHeader
        leagueName={leagueName}
        cityName={cityName}
        matchCount={matchCount}
        collapsed={collapsed}
        onToggle={handleToggle}
        isPinned={pinned}
        onTogglePin={isLeague && cityId != null ? handlePin : undefined}
        isFavorite={following}
        onToggleFavorite={isLeague ? handleFollow : undefined}
        onPress={handleOpen}
        sticky
      />
    </View>
  );
});

/* ═══════════════════════════════ STİLLER ═══════════════════════════════ */

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },

  controls: {
    paddingHorizontal: layout.screenPadding,
    paddingBottom: space.sm,
  },

  /** Liste alanı — alt çubuk kendi yüksekliğini alır, kalan her şey liste. */
  body: {
    flex: 1,
  },

  band: {
    marginHorizontal: layout.screenPadding,
    marginBottom: space.sm,
  },

  skeletonWrap: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: GROUP_GAP,
  },
  skeletonGroup: {
    borderRadius: radius.xl,
    borderWidth: hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface1,
    overflow: "hidden",
  },

  /* Liste — contentContainer'a ÜST dolgu verilmez: `getItemLayout` ofsetleri
     içerik başlangıcına göredir (liste başlığı ölçülüp eklenir). */
  list: {
    paddingHorizontal: layout.screenPadding,
    // Alt panel listenin ALTINDA ayrı durur; yalnız nefes payı yeter.
    paddingBottom: space.lg,
    flexGrow: 1,
  },
  sectionHeader: {
    height: SECTION_HEADER_HEIGHT,
    paddingTop: GROUP_GAP,
    backgroundColor: colors.bg,
  },
});
