/**
 * MAÇLAR — fikstürün ve canlı skorların tam listesi.
 *
 * NE YAPAR: seçili kapsamdaki maçları GÜNE göre süzer, LİGE göre gruplar ve
 * tek dikey eksende okunan satırlar hâlinde listeler. Dört segment aynı veriyi
 * farklı pencereden gösterir: Tümü · Canlı · Bitti · Yaklaşan.
 *
 * GENEL BAKIŞ'LA İŞ BÖLÜMÜ: Genel Bakış "bugün ne var, benim işim ne" sorusunu
 * en fazla dört satırla yanıtlar ve buraya kapı açar; burası ise TAM listedir —
 * gün şeridi, lig grupları, segmentler ve takvim burada yaşar. Genel Bakış bu
 * ekrandaki hiçbir listeyi kopyalamaz, yalnız kesitini gösterir.
 *
 * NEDEN BU DÜZEN: ekran, diğer bütün sekmeler gibi MOR BLOK başlıkla açılır
 * (`ScreenHeader`: üst başlıkta lig adı, solda "Maçlar", sağda arama ve takvim
 * ikonları — tek satır, 52px). Eski beyaz başlık tek istisnaydı ve sekmeler
 * arasında geçişte çerçeve değişiyordu. Kapsam çipi, gün şeridi, segment ve
 * favori süzgeci VERİYİ SÜZEN denetimlerdir; başlığın parçası değil, kâğıda
 * aittirler — bloğun altında `bottom` yuvasında dururlar (takımlar/oyuncular
 * sekmeleriyle aynı hiza). Kaydırınca blok daralır, üst başlık söner; geri
 * kalan her piksel liste.
 *
 * NEDEN LİGE GÖRE GRUPLAMA: bir günde birden çok ligin maçı olabilir; tarih
 * başlığı (eski düzen) o gün zaten seçili olduğu için bilgi taşımıyordu. Lig
 * başlığı hem kimlik hem gezinme yüzeyidir (dokun → lig sayfası, yıldız →
 * favori lig, chevron → katla). Favori ligler listenin en üstünde durur.
 *
 * NEDEN URL PARAMETRESİ: `?tab=canli&date=2026-08-18`. Gol bildirimi ya da
 * paylaşılan bir bağlantı doğrudan doğru segmente ve güne düşsün diye segment
 * ve tarih ekran durumunda değil ROTADA taşınır.
 *
 * PERFORMANS SÖZLEŞMESİ: satır yüksekliği sabittir (metaMode="none" → 60px),
 * bölüm başlığı sabittir (48px) → `getItemLayout` kurulabiliyor ve SectionList
 * hiçbir hücreyi ölçmüyor. Satır ve başlık bileşenleri `memo`'lu; render
 * sırasında hiçbir kapanış (closure) üretilmez — dokunma işleyicileri maç
 * id'sini kendi içinde bağlayan küçük sarmalayıcılarda yaşar.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { SectionList, StyleSheet, Text, View } from "react-native";
import type { SectionListData, SectionListRenderItemInfo } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ScopeChip } from "@/components/ScopeChip";
import {
  BottomSheet,
  DateStrip,
  EmptyState,
  ErrorState,
  LeagueGroupHeader,
  LiveBadge,
  MatchRow,
  ScreenHeader,
  SegmentedControl,
  SkeletonMatchRow,
  Toggle,
  Touchable,
  matchRowHeight,
  toIsoDate,
  useHeaderScroll,
  useRefresh,
} from "@/components/ui";
import type { SegmentedItem } from "@/components/ui";
import { useAppActive } from "@/hooks/useLiveFavoriteCount";
import { useTeamLogos } from "@/hooks/useTeamLogos";
import { getLiveMatches, getMatches } from "@/lib/api/matches";
import { matchState } from "@/lib/match";
import { queryKeys } from "@/lib/queryKeys";
import { useFavorite } from "@/providers/FavoriteProvider";
import { useScope } from "@/providers/ScopeProvider";
import {
  colors,
  fonts,
  layout,
  radius,
  space,
  textScale,
  touchSlop,
  type,
} from "@/theme";
import type { ApiMatch } from "@/lib/types";

/* ═══════════════════════ SABİTLER VE KÜÇÜK YARDIMCILAR ═══════════════════════ */

type TabKey = "tumu" | "canli" | "bitti" | "yaklasan";

const TAB_KEYS: readonly string[] = ["tumu", "canli", "bitti", "yaklasan"];

/** Satır ve başlık yükseklikleri — `getItemLayout` bunlardan kurulur. */
const ROW_HEIGHT = matchRowHeight("default", "none");
/** 8px üst boşluk + 40px LeagueGroupHeader. Boşluk başlığın İÇİNDE, çünkü
 *  yapışkan başlık ekranın tepesine yapıştığında altındaki satır başlığın
 *  arkasından sızmasın diye opak zemin gerekiyor. */
const SECTION_HEADER_HEIGHT = 48;

/** Gün şeridinin varsayılan penceresi (§2.1): dün-bir-hafta … iki-hafta sonrası. */
const STRIP_BACK_DAYS = 7;
const STRIP_FORWARD_DAYS = 14;

/** Canlı segmentinde yoklama aralığı; diğer segmentlerde daha yavaş. */
const LIVE_POLL_MS = 20_000;
const IDLE_POLL_MS = 60_000;

const MONTHS_TR = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
] as const;

/**
 * Ay adlarının bulunma hâli ekleri. Kural (ünsüz sertleşmesi + ünlü uyumu)
 * hesaplanabilir ama 12 sabit için tablo hem kısa hem kesin: "Ağustos'ta",
 * "Nisan'da", "Eylül'de".
 */
const MONTH_LOCATIVE = ["ta", "ta", "ta", "da", "ta", "da", "da", "ta", "de", "de", "da", "ta"] as const;

/** Haftanın ilk günü Pazartesi — takvim ızgarası bu sırayı izler. */
const WEEKDAYS_TR = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"] as const;

const pad2 = (value: number) => String(value).padStart(2, "0");

/** "YYYY-MM-DD" → yerel gece yarısı. `new Date(iso)` UTC okur ve gün kaydırır. */
function fromIso(iso: string): Date {
  const parts = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!parts) return new Date();
  return new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]));
}

function shiftDays(iso: string, delta: number): string {
  const date = fromIso(iso);
  date.setDate(date.getDate() + delta);
  return toIsoDate(date);
}

/** Maç kaydındaki tarih "2026-08-18T00:00:00.000Z" da olabilir; gün kısmı alınır. */
const matchDay = (match: ApiMatch) => String(match.date ?? "").slice(0, 10);

/** Başlama anı — aynı gün içindeki sıralama saate göredir. */
function kickoff(match: ApiMatch): number {
  const stamp = Date.parse(`${matchDay(match)}T${match.time || "00:00:00"}`);
  return Number.isFinite(stamp) ? stamp : 0;
}

/** Türkçe küçük harf (İ/I tuzağı) — ad karşılaştırmaları bununla yapılır. */
const normalizeName = (value: string) => value.trim().toLocaleLowerCase("tr");

/** "18 Ağustos'ta" / "Bugün" / "Dün" / "Yarın" — boş durum cümlesi için. */
function dayPhrase(iso: string, todayIso: string): string {
  if (iso === todayIso) return "Bugün";
  if (iso === shiftDays(todayIso, -1)) return "Dün";
  if (iso === shiftDays(todayIso, 1)) return "Yarın";
  const date = fromIso(iso);
  return `${date.getDate()} ${MONTHS_TR[date.getMonth()]}'${MONTH_LOCATIVE[date.getMonth()]}`;
}

function readParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value ?? undefined;
}

const normalizeTab = (value: string | undefined): TabKey =>
  value && TAB_KEYS.includes(value) ? (value as TabKey) : "tumu";

const normalizeDate = (value: string | undefined, fallback: string): string =>
  value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback;

/* ═══════════════════════════════ BÖLÜM TİPLERİ ═══════════════════════════════ */

interface LeagueSectionMeta {
  /** Bölüm kimliği — katlama durumu ve `keyExtractor` bunu kullanır. */
  key: string;
  leagueId: number | null;
  leagueName: string;
  cityName: string | null;
  favorite: boolean;
  collapsed: boolean;
  /** Katlıyken de gösterilecek gerçek maç sayısı. */
  total: number;
}

type LeagueSection = LeagueSectionMeta & { data: ApiMatch[] };

interface DayMarker {
  count: number;
  live?: boolean;
}

/* ══════════════════════════════════ EKRAN ═══════════════════════════════════ */

export default function MatchesScreen() {
  const router = useRouter();
  const scope = useScope();
  const teams = useTeamLogos();
  const favorite = useFavorite();
  const appActive = useAppActive();
  const params = useLocalSearchParams();
  /** Mor bloğun daralması listenin kaydırmasına bağlıdır (bkz. ScreenHeader). */
  const { scrollY, scrollProps } = useHeaderScroll();

  /** Bugün ekran ömrü boyunca bir kez hesaplanır (gece yarısı geçişi nadir). */
  const todayIso = useMemo(() => toIsoDate(new Date()), []);

  const paramTab = readParam(params.tab);
  const paramDate = readParam(params.date);

  const [tab, setTabState] = useState<TabKey>(() => normalizeTab(paramTab));
  const [date, setDateState] = useState<string>(() => normalizeDate(paramDate, todayIso));
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [collapsedKeys, setCollapsedKeys] = useState<Record<string, boolean>>({});
  const [calendarOpen, setCalendarOpen] = useState(false);

  // Ekran zaten açıkken yeni bir derin bağlantı gelirse (bildirimden dönüş)
  // rota parametresi durumu ezer — tersi değil.
  useEffect(() => {
    if (paramTab) setTabState(normalizeTab(paramTab));
  }, [paramTab]);

  useEffect(() => {
    if (paramDate) setDateState((current) => normalizeDate(paramDate, current));
  }, [paramDate]);

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
   * değiştirmek ağ turu olmadan anında sonuç verir, gün şeridindeki "maç var"
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
    enabled: scope.ready,
    staleTime: 30_000,
    refetchInterval: appActive ? 2 * IDLE_POLL_MS : false,
  });

  /**
   * Canlı maçlar AYRI ve ucuz bir uçtan gelir. Segment rozeti her zaman doğru
   * olsun diye sorgu hep açıktır; yalnız Canlı segmentinde 20 saniyeye iner.
   * Uygulama arka plandayken yoklama tamamen durur (pil).
   */
  const liveQuery = useQuery({
    queryKey: queryKeys.liveMatches(scopeKey),
    queryFn: () =>
      getLiveMatches({
        leagueId: scope.leagueId ?? undefined,
        seasonId: scope.seasonId ?? undefined,
      }),
    enabled: scope.ready,
    staleTime: 10_000,
    refetchInterval: appActive ? (tab === "canli" ? LIVE_POLL_MS : IDLE_POLL_MS) : false,
  });

  const allMatches = useMemo(() => matchesQuery.data ?? [], [matchesQuery.data]);

  /** Canlı uç henüz cevap vermediyse ana listeden türetilir — rozet boş kalmaz. */
  const liveMatches = useMemo(() => {
    if (liveQuery.data) return liveQuery.data;
    return allMatches.filter((match) => matchState(match) === "live");
  }, [liveQuery.data, allMatches]);

  /* ─────────────────────────── FAVORİLER ─────────────────────────── */

  const favoriteTeamIds = useMemo(
    () => new Set(favorite.favorites.map((team) => Number(team.id))),
    [favorite.favorites],
  );
  const favoriteTeamNames = useMemo(
    () => new Set(favorite.favorites.map((team) => normalizeName(team.name))),
    [favorite.favorites],
  );
  const favoriteLeagueIds = useMemo(
    () => new Set(favorite.favoriteLeagues.map((league) => Number(league.id))),
    [favorite.favoriteLeagues],
  );
  const favoriteSeasonIds = useMemo(
    () => new Set(favorite.favoriteSeasons.map((season) => Number(season.id))),
    [favorite.favoriteSeasons],
  );
  const favoriteMatchIds = useMemo(
    () => new Set(favorite.favoriteMatches.map(Number)),
    [favorite.favoriteMatches],
  );

  const hasAnyFavorite =
    favoriteTeamIds.size > 0 ||
    favoriteLeagueIds.size > 0 ||
    favoriteSeasonIds.size > 0 ||
    favoriteMatchIds.size > 0;

  /** "Sadece favorilerim" süzgeci: maç, takım, lig ve sezon favorilerinin birleşimi. */
  const isFavoriteContext = useCallback(
    (match: ApiMatch) =>
      favoriteMatchIds.has(Number(match.id)) ||
      (match.home_team_id != null && favoriteTeamIds.has(Number(match.home_team_id))) ||
      (match.away_team_id != null && favoriteTeamIds.has(Number(match.away_team_id))) ||
      favoriteTeamNames.has(normalizeName(match.first_team_name)) ||
      favoriteTeamNames.has(normalizeName(match.second_team_name)) ||
      (match.league_id != null && favoriteLeagueIds.has(Number(match.league_id))) ||
      (match.season_id != null && favoriteSeasonIds.has(Number(match.season_id))),
    [favoriteMatchIds, favoriteTeamIds, favoriteTeamNames, favoriteLeagueIds, favoriteSeasonIds],
  );

  // Son favori kaldırıldığında süzgeç açık kalırsa ekran sonsuza dek boş görünür.
  useEffect(() => {
    if (!hasAnyFavorite && favoritesOnly) setFavoritesOnly(false);
  }, [hasAnyFavorite, favoritesOnly]);

  /* ───────────────────── SÜZME, İŞARETLEME, GRUPLAMA ───────────────────── */

  const scopedMatches = useMemo(
    () => (favoritesOnly ? allMatches.filter(isFavoriteContext) : allMatches),
    [allMatches, favoritesOnly, isFavoriteContext],
  );

  /** Gün şeridi ve takvim noktaları — süzgeç açıkken favori günleri gösterir. */
  const markers = useMemo(() => {
    const map: Record<string, DayMarker> = {};
    for (const match of scopedMatches) {
      const day = matchDay(match);
      if (!day) continue;
      const entry = map[day] ?? { count: 0, live: false };
      entry.count += 1;
      if (matchState(match) === "live") entry.live = true;
      map[day] = entry;
    }
    return map;
  }, [scopedMatches]);

  /** Maçı olan günler (sıralı) — "İleri git" bir sonraki dolu güne atlar. */
  const daysWithMatches = useMemo(() => Object.keys(markers).sort(), [markers]);

  const visibleMatches = useMemo(() => {
    if (tab === "canli") {
      return favoritesOnly ? liveMatches.filter(isFavoriteContext) : liveMatches;
    }
    const sameDay = scopedMatches.filter((match) => matchDay(match) === date);
    if (tab === "bitti") return sameDay.filter((match) => matchState(match) === "finished");
    if (tab === "yaklasan") return sameDay.filter((match) => matchState(match) === "scheduled");
    return sameDay;
  }, [tab, date, scopedMatches, liveMatches, favoritesOnly, isFavoriteContext]);

  const { isFavoriteLeague } = favorite;

  const sections = useMemo<LeagueSection[]>(() => {
    const map = new Map<string, LeagueSection>();

    for (const match of visibleMatches) {
      const leagueName = String(match.league_name ?? "").trim() || "Diğer maçlar";
      const leagueId = match.league_id != null ? Number(match.league_id) : null;
      const key = leagueId != null ? `lig-${leagueId}` : `ad-${normalizeName(leagueName)}`;

      let section = map.get(key);
      if (!section) {
        section = {
          key,
          leagueId,
          leagueName,
          cityName: String(match.city ?? "").trim() || null,
          favorite: isFavoriteLeague(leagueId),
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
      section.data.sort((a, b) => kickoff(a) - kickoff(b));
      // Katlı bölüm başlığını korur, satırlarını bırakır.
      if (section.collapsed) section.data = [];
    }

    // Favori lig en üstte, gerisi Türkçe alfabetik.
    list.sort((a, b) => {
      if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
      return a.leagueName.localeCompare(b.leagueName, "tr");
    });

    return list;
  }, [visibleMatches, collapsedKeys, isFavoriteLeague]);

  /* ─────────────────────────── EYLEMLER ─────────────────────────── */

  const openSearch = useCallback(() => {
    router.push("/ara");
  }, [router]);

  const openCalendar = useCallback(() => setCalendarOpen(true), []);
  const closeCalendar = useCallback(() => setCalendarOpen(false), []);

  const pickCalendarDate = useCallback(
    (iso: string) => {
      setDate(iso);
      // Takvimden gün seçmek doğal olarak "Tümü" bakışına döner; kullanıcı
      // Canlı segmentindeyken tarih seçtiyse tarihli bakış istiyordur.
      if (tab === "canli") setTab("tumu");
      setCalendarOpen(false);
    },
    [setDate, setTab, tab],
  );

  const openMatch = useCallback(
    (matchId: number) => {
      router.push(`/mac/${matchId}`);
    },
    [router],
  );

  const { toggleFavoriteMatch, toggleFavoriteLeague } = favorite;

  const toggleMatchStar = useCallback(
    (matchId: number) => toggleFavoriteMatch(matchId),
    [toggleFavoriteMatch],
  );

  const toggleSection = useCallback((key: string) => {
    setCollapsedKeys((current) => ({ ...current, [key]: !current[key] }));
  }, []);

  const openLeague = useCallback(
    (leagueId: number | null) => {
      router.push(
        leagueId != null ? `/(tabs)/ligler?leagueId=${leagueId}&tab=fikstur` : "/(tabs)/ligler",
      );
    },
    [router],
  );

  const starLeague = useCallback(
    (leagueId: number | null, leagueName: string) => {
      if (leagueId == null) return;
      toggleFavoriteLeague({ id: leagueId, name: leagueName });
    },
    [toggleFavoriteLeague],
  );

  const goToNextMatchDay = useCallback(() => {
    const next = daysWithMatches.find((day) => day > date);
    setDate(next ?? shiftDays(date, 1));
  }, [daysWithMatches, date, setDate]);

  const goToToday = useCallback(() => {
    setTab("tumu");
    setDate(todayIso);
  }, [setTab, setDate, todayIso]);

  const clearFavoritesFilter = useCallback(() => setFavoritesOnly(false), []);

  const openScope = useCallback(() => scope.openScopeSheet("city"), [scope]);

  const refetchMatches = matchesQuery.refetch;
  const refetchLive = liveQuery.refetch;
  const handleRefresh = useCallback(() => {
    void refetchMatches();
    void refetchLive();
  }, [refetchMatches, refetchLive]);

  const refresh = useRefresh(handleRefresh, {
    refreshing: matchesQuery.isRefetching || liveQuery.isRefetching,
  });

  /**
   * `useRefresh().control` doğrudan bir `RefreshControl` düğümü döndürür ve
   * tipi `ReactElement<RefreshControlProps>`tir — liste bileşenine dönüşüm
   * (cast) olmadan verilir. (Kanca eskiden sarmalayıcı bir bileşen
   * döndürüyordu; bu hem tip daraltması gerektiriyor hem de Android'de
   * `cloneElement` yüzünden çalışma anında kırılıyordu — bütünleştirmede
   * `components/ui/Refresh.tsx` içinde düzeltildi.)
   */
  const refreshControl = refresh.control;

  /* ───────────────────────── LİSTE ÇİZİMİ ───────────────────────── */

  const renderItem = useCallback(
    ({ item, index, section }: SectionListRenderItemInfo<ApiMatch, LeagueSectionMeta>) => {
      /*
       * İLK SATIR "first" DEĞİL: bölümün üstünde zaten `LeagueGroupHeader`
       * duruyor ve ÜST köşeleri o yuvarlıyor. İlk satır da üst köşelerini
       * yuvarlarsa başlıkla satırın birleştiği yerde iki yandan içeri kaçan
       * bir kertik oluşuyor — grup tek kart değil, üst üste iki kart gibi
       * okunuyordu. Yuvarlak köşe grubun DIŞ sınırına aittir: üstte başlık,
       * altta son satır.
       */
      const last = index === section.data.length - 1;
      const position = last ? "last" : "middle";
      return (
        <MatchListItem
          match={item}
          homeLogo={teams.logoFor(item.home_team_id, item.first_team_name)}
          awayLogo={teams.logoFor(item.away_team_id, item.second_team_name)}
          position={position}
          isFavorite={favoriteMatchIds.has(Number(item.id))}
          onOpen={openMatch}
          onToggleStar={toggleMatchStar}
        />
      );
    },
    [teams, favoriteMatchIds, openMatch, toggleMatchStar],
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: SectionListData<ApiMatch, LeagueSectionMeta> }) => (
      <LeagueSectionHeader
        sectionKey={section.key}
        leagueId={section.leagueId}
        leagueName={section.leagueName}
        cityName={section.cityName}
        matchCount={section.total}
        collapsed={section.collapsed}
        favorite={section.favorite}
        onOpenLeague={openLeague}
        onToggleCollapse={toggleSection}
        onToggleFavorite={starLeague}
      />
    ),
    [openLeague, toggleSection, starLeague],
  );

  /**
   * SectionList düz indeks uzayı: her bölüm için [başlık, ...satırlar, altlık].
   * Altlık çizilmese bile bir indeks tüketir (VirtualizedSectionList kuralı),
   * bu yüzden sayaç bölümde `data.length + 2` ilerler.
   */
  const getItemLayout = useCallback(
    (data: SectionListData<ApiMatch, LeagueSectionMeta>[] | null, index: number) => {
      let offset = 0;
      let cursor = 0;

      for (const section of data ?? []) {
        if (index === cursor) return { length: SECTION_HEADER_HEIGHT, offset, index };
        offset += SECTION_HEADER_HEIGHT;
        cursor += 1;

        const count = section.data.length;
        if (index < cursor + count) {
          const within = index - cursor;
          return { length: ROW_HEIGHT, offset: offset + within * ROW_HEIGHT, index };
        }
        offset += count * ROW_HEIGHT;
        cursor += count;

        if (index === cursor) return { length: 0, offset, index };
        cursor += 1;
      }

      return { length: 0, offset, index };
    },
    [],
  );

  /* ─────────────────────── ÜST BANT (sabit alan) ─────────────────────── */

  const liveCount = liveMatches.length;

  const segments = useMemo<SegmentedItem<TabKey>[]>(
    () => [
      { key: "tumu", label: "Tümü" },
      { key: "canli", label: liveCount > 0 ? `Canlı ${liveCount}` : "Canlı", dot: liveCount > 0 },
      { key: "bitti", label: "Bitti" },
      { key: "yaklasan", label: "Yaklaşan" },
    ],
    [liveCount],
  );

  /** Şerit penceresi seçili günü DAİMA kapsar (takvimden uzak bir gün seçilebilir). */
  const stripRange = useMemo(() => {
    const start = shiftDays(todayIso, -STRIP_BACK_DAYS);
    const end = shiftDays(todayIso, STRIP_FORWARD_DAYS);
    return {
      start: date < start ? date : start,
      end: date > end ? date : end,
    };
  }, [todayIso, date]);

  const loading = scope.loading || (scope.ready && matchesQuery.isLoading);
  const hasData = allMatches.length > 0;
  const failed = matchesQuery.isError && !hasData;

  const listEmpty = useMemo(() => {
    if (favoritesOnly) {
      return (
        <EmptyState
          icon="star-outline"
          title="Favorilerinde maç yok"
          body="Seçili günde favori takım ve liglerinin maçı bulunmuyor."
          action={{ label: "Tüm maçları göster", onPress: clearFavoritesFilter }}
        />
      );
    }
    if (tab === "canli") {
      return (
        <EmptyState
          icon="radio-outline"
          title="Şu anda canlı maç yok"
          body="Bir maç başladığında skor burada anlık olarak akar."
          action={{ label: "Bugünün maçları", onPress: goToToday }}
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
              : "Başka bir gün seçebilir ya da takvimden ileri gidebilirsin."
        }
        action={{ label: "İleri git", onPress: goToNextMatchDay }}
        secondaryAction={date === todayIso ? undefined : { label: "Bugüne dön", onPress: goToToday }}
      />
    );
  }, [favoritesOnly, tab, date, todayIso, clearFavoritesFilter, goToToday, goToNextMatchDay]);

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      {/* MOR BLOK — diğer sekmelerle aynı çerçeve: üst başlıkta lig, solda ad,
          sağda arama ve takvim. Süzgeçler bloğun altında kâğıtta (`bottom`). */}
      <ScreenHeader
        title="Maçlar"
        overline={scope.leagueLabel || "ELİTLİG"}
        scrollY={scrollY}
        actions={[
          { icon: "search-outline", accessibilityLabel: "Ara", onPress: openSearch },
          {
            icon: "calendar-outline",
            accessibilityLabel: "Takvimden tarih seç",
            onPress: openCalendar,
          },
        ]}
        bottom={
          <>
            {/* Kapsam çipi kendi satırında: gün şeridi tam genişlik ister,
                çip onun yanına sığmaz — diğer sekmelerdeki `scopeRow` kalıbı. */}
            <View style={styles.scopeRow}>
              <ScopeChip />
            </View>

            {/* Canlı segmentinde gün kavramı yok: şerit yerini yenileme satırına bırakır. */}
            {tab === "canli" ? (
              <View style={styles.autoRow}>
                <LiveBadge compact />
                <Text style={styles.autoText} {...textScale.dense}>
                  {liveCount > 0
                    ? `${liveCount} maç oynanıyor · Otomatik yenileniyor`
                    : "Otomatik yenileniyor"}
                </Text>
              </View>
            ) : (
              <DateStrip
                value={date}
                onChange={setDate}
                markers={markers}
                range={stripRange}
                showTodayButton
              />
            )}

            <View style={styles.controls}>
              <SegmentedControl<TabKey> items={segments} value={tab} onChange={setTab} />
            </View>

            {hasAnyFavorite ? (
              <View style={styles.filterRow}>
                <Ionicons name="star" size={14} color={colors.star} />
                <Text style={styles.filterLabel} {...textScale.dense}>
                  Sadece favorilerim
                </Text>
                <Toggle
                  value={favoritesOnly}
                  onValueChange={setFavoritesOnly}
                  accessibilityLabel="Sadece favorilerim"
                />
              </View>
            ) : null}
          </>
        }
      />

      {/* Ekranda bayat veri varken hata satır olarak düşer; liste silinmez. */}
      {matchesQuery.isError && hasData ? (
        <ErrorState
          error={matchesQuery.error}
          onRetry={handleRefresh}
          variant="banner"
          style={styles.banner}
        />
      ) : null}

      {!scope.ready && !scope.loading ? (
        <EmptyState
          icon="options-outline"
          title="Lig seçilmedi"
          body="Maçları görmek için şehir, lig ve sezon seç."
          action={{ label: "Kapsam seç", onPress: openScope }}
        />
      ) : loading ? (
        <View style={styles.skeletonWrap}>
          <SkeletonMatchRow count={6} />
        </View>
      ) : failed ? (
        <ErrorState error={matchesQuery.error} onRetry={handleRefresh} />
      ) : (
        <SectionList<ApiMatch, LeagueSectionMeta>
          {...scrollProps}
          sections={sections}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          renderSectionHeader={renderSectionHeader}
          getItemLayout={getItemLayout}
          stickySectionHeadersEnabled
          contentContainerStyle={styles.list}
          ListEmptyComponent={listEmpty}
          refreshControl={refreshControl}
          initialNumToRender={12}
          maxToRenderPerBatch={12}
          windowSize={8}
          removeClippedSubviews
          keyboardShouldPersistTaps="handled"
        />
      )}

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
 * Satır sarmalayıcı. VARLIK NEDENİ: `MatchRow` memo'lu ama `onPress` her
 * render'da yeniden üretilse memo hiçbir işe yaramaz. Burada işleyiciler maç
 * id'sini kendi `useCallback`'lerinde bağlar; dışarıdan yalnız ilkel değerler
 * ve DEĞİŞMEYEN iki fonksiyon geçer.
 */
const MatchListItem = memo(function MatchListItem({
  match,
  homeLogo,
  awayLogo,
  position,
  isFavorite,
  onOpen,
  onToggleStar,
}: {
  match: ApiMatch;
  homeLogo: string | null;
  awayLogo: string | null;
  position: "single" | "first" | "middle" | "last";
  isFavorite: boolean;
  onOpen: (matchId: number) => void;
  onToggleStar: (matchId: number) => void;
}) {
  const matchId = Number(match.id);
  const handlePress = useCallback(() => onOpen(matchId), [onOpen, matchId]);
  const handleStar = useCallback(() => onToggleStar(matchId), [onToggleStar, matchId]);

  return (
    <MatchRow
      match={match}
      homeLogo={homeLogo}
      awayLogo={awayLogo}
      position={position}
      isFavorite={isFavorite}
      onToggleFavorite={handleStar}
      onPress={handlePress}
      flashOnScoreChange
    />
  );
});

/** Bölüm başlığı sarmalayıcısı — aynı memo gerekçesi (bkz. MatchListItem). */
const LeagueSectionHeader = memo(function LeagueSectionHeader({
  sectionKey,
  leagueId,
  leagueName,
  cityName,
  matchCount,
  collapsed,
  favorite,
  onOpenLeague,
  onToggleCollapse,
  onToggleFavorite,
}: {
  sectionKey: string;
  leagueId: number | null;
  leagueName: string;
  cityName: string | null;
  matchCount: number;
  collapsed: boolean;
  favorite: boolean;
  onOpenLeague: (leagueId: number | null) => void;
  onToggleCollapse: (key: string) => void;
  onToggleFavorite: (leagueId: number | null, leagueName: string) => void;
}) {
  const handleOpen = useCallback(() => onOpenLeague(leagueId), [onOpenLeague, leagueId]);
  const handleToggle = useCallback(() => onToggleCollapse(sectionKey), [onToggleCollapse, sectionKey]);
  const handleFavorite = useCallback(
    () => onToggleFavorite(leagueId, leagueName),
    [onToggleFavorite, leagueId, leagueName],
  );

  return (
    <View style={styles.sectionHeader}>
      <LeagueGroupHeader
        leagueName={leagueName}
        cityName={cityName}
        matchCount={matchCount}
        collapsed={collapsed}
        onToggle={handleToggle}
        isFavorite={favorite}
        onToggleFavorite={leagueId != null ? handleFavorite : undefined}
        onPress={handleOpen}
        sticky
      />
    </View>
  );
});

/* ═════════════════════════════ AY TAKVİMİ ══════════════════════════════ */

/**
 * Aylık takvim — harici takvim paketi YOK, ızgara elle çizilir.
 *
 * NEDEN: tek ihtiyaç "uzak bir güne atla"; hazır takvim kütüphaneleri kendi
 * tema/dil katmanını getiriyor ve paketi ~200KB büyütüyor. Burada 42 hücrelik
 * bir ızgara + iki ok yeterli. Hafta Pazartesi başlar (Türkiye kullanımı).
 */
const CalendarSheet = memo(function CalendarSheet({
  visible,
  onClose,
  value,
  todayIso,
  markers,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  value: string;
  todayIso: string;
  markers: Record<string, DayMarker>;
  onSelect: (iso: string) => void;
}) {
  const [cursor, setCursor] = useState(() => value.slice(0, 7));

  // Sayfa her açılışta seçili ayı gösterir (kullanıcı geçen sefer nereye
  // kaydırdıysa orada başlamak kafa karıştırıcı olurdu).
  useEffect(() => {
    if (visible) setCursor(value.slice(0, 7));
  }, [visible, value]);

  const year = Number(cursor.slice(0, 4));
  const month = Number(cursor.slice(5, 7)) - 1;

  const goPrev = useCallback(() => {
    const date = new Date(year, month - 1, 1);
    setCursor(`${date.getFullYear()}-${pad2(date.getMonth() + 1)}`);
  }, [year, month]);

  const goNext = useCallback(() => {
    const date = new Date(year, month + 1, 1);
    setCursor(`${date.getFullYear()}-${pad2(date.getMonth() + 1)}`);
  }, [year, month]);

  /** Ay ızgarası: baştaki boş hücreler + ayın günleri (tam haftalara tamamlanır). */
  const cells = useMemo(() => {
    const first = new Date(year, month, 1);
    const lead = (first.getDay() + 6) % 7; // Pazartesi = 0
    const days = new Date(year, month + 1, 0).getDate();
    const list: (string | null)[] = [];
    for (let i = 0; i < lead; i += 1) list.push(null);
    for (let day = 1; day <= days; day += 1) list.push(`${year}-${pad2(month + 1)}-${pad2(day)}`);
    while (list.length % 7 !== 0) list.push(null);
    return list;
  }, [year, month]);

  const jumpToToday = useCallback(() => onSelect(todayIso), [onSelect, todayIso]);

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Tarih seç" snap="content">
      <View style={styles.calNav}>
        <Touchable
          feedback="icon"
          haptic="selection"
          onPress={goPrev}
          hitSlop={touchSlop(32)}
          accessibilityLabel="Önceki ay"
          style={styles.calNavButton}
        >
          <Ionicons name="chevron-back" size={20} color={colors.textSecondary} />
        </Touchable>

        <Text style={styles.calTitle} {...textScale.dense}>
          {`${MONTHS_TR[month] ?? ""} ${year}`}
        </Text>

        <Touchable
          feedback="icon"
          haptic="selection"
          onPress={goNext}
          hitSlop={touchSlop(32)}
          accessibilityLabel="Sonraki ay"
          style={styles.calNavButton}
        >
          <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
        </Touchable>
      </View>

      <View style={styles.calGrid}>
        {WEEKDAYS_TR.map((label) => (
          <View key={label} style={styles.calCell}>
            <Text style={styles.calWeekday} {...textScale.badge}>
              {label}
            </Text>
          </View>
        ))}

        {cells.map((iso, index) =>
          iso === null ? (
            <View key={`bos-${index}`} style={styles.calCell} />
          ) : (
            <CalendarDay
              key={iso}
              iso={iso}
              selected={iso === value}
              today={iso === todayIso}
              marker={markers[iso]}
              onSelect={onSelect}
            />
          ),
        )}
      </View>

      <Touchable
        feedback="button"
        haptic="selection"
        onPress={jumpToToday}
        accessibilityLabel="Bugüne git"
        style={styles.calToday}
      >
        <Ionicons name="today-outline" size={15} color={colors.brandAccent} />
        <Text style={styles.calTodayText} {...textScale.dense}>
          Bugüne git
        </Text>
      </Touchable>
    </BottomSheet>
  );
});

const CalendarDay = memo(function CalendarDay({
  iso,
  selected,
  today,
  marker,
  onSelect,
}: {
  iso: string;
  selected: boolean;
  today: boolean;
  marker?: DayMarker;
  onSelect: (iso: string) => void;
}) {
  const handlePress = useCallback(() => onSelect(iso), [onSelect, iso]);
  const day = Number(iso.slice(8, 10));

  return (
    <View style={styles.calCell}>
      <Touchable
        feedback="chip"
        haptic="selection"
        onPress={handlePress}
        accessibilityLabel={`${day} ${MONTHS_TR[Number(iso.slice(5, 7)) - 1]}`}
        accessibilityState={{ selected }}
        style={[styles.calDay, selected && styles.calDaySelected]}
      >
        <Text
          style={[
            styles.calDayText,
            today && !selected && styles.calDayToday,
            selected && styles.calDayTextSelected,
          ]}
          {...textScale.dense}
        >
          {day}
        </Text>
        <View
          style={[
            styles.calDot,
            marker ? (marker.live ? styles.calDotLive : styles.calDotOn) : null,
            selected && marker ? styles.calDotSelected : null,
          ]}
        />
      </Touchable>
    </View>
  );
});

/* ═══════════════════════════════ STİLLER ═══════════════════════════════ */

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },

  /* Kapsam çipi — mor bloğun hemen altında, kâğıtta; takımlar/oyuncular ile
     aynı sol hiza. Alt boşluk yok: gün şeridi (56px) kendi dikey alanını taşır. */
  scopeRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: layout.screenPadding,
  },

  /* Canlı segmentinin şerit yerine geçen satırı */
  autoRow: {
    height: layout.dateStripHeight,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: layout.screenPadding,
  },
  autoText: {
    ...type.bodySm,
    color: colors.textSecondary,
    flex: 1,
  },

  controls: {
    paddingHorizontal: layout.screenPadding,
    paddingBottom: space.sm,
  },

  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    marginHorizontal: layout.screenPadding,
    marginBottom: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    backgroundColor: colors.surface1,
    borderRadius: radius.md,
  },
  filterLabel: {
    ...type.bodySm,
    color: colors.textSecondary,
    flex: 1,
  },

  banner: {
    marginHorizontal: layout.screenPadding,
    marginBottom: space.sm,
  },

  skeletonWrap: {
    paddingHorizontal: layout.screenPadding,
  },

  /* Liste — contentContainer'a ÜST boşluk verilmez: `getItemLayout`
     ofsetleri içerik başlangıcına göredir, üst dolgu onları kaydırır. */
  list: {
    paddingHorizontal: layout.screenPadding,
    paddingBottom: layout.tabBarHeight + space.xxl,
    flexGrow: 1,
  },
  sectionHeader: {
    height: SECTION_HEADER_HEIGHT,
    paddingTop: space.sm,
    backgroundColor: colors.bg,
  },

  /* Takvim sayfası */
  calNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: space.sm,
  },
  calNavButton: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  calTitle: {
    ...type.h2,
    color: colors.textPrimary,
  },
  calGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  calCell: {
    width: "14.2857%",
    alignItems: "center",
    justifyContent: "center",
  },
  calWeekday: {
    ...type.micro,
    color: colors.textTertiary,
    paddingVertical: space.xs,
  },
  calDay: {
    width: 38,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    gap: space.xxs,
  },
  calDaySelected: {
    backgroundColor: colors.brand,
  },
  calDayText: {
    ...type.tableNum,
    color: colors.textPrimary,
  },
  calDayToday: {
    color: colors.brandAccent,
    fontFamily: fonts.bold,
  },
  calDayTextSelected: {
    color: colors.textOnBrand,
    fontFamily: fonts.bold,
  },
  // Nokta her hücrede yer tutar; böylece maçlı/maçsız günlerde rakam zıplamaz.
  calDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "transparent",
  },
  calDotOn: {
    backgroundColor: colors.brandAccent,
  },
  calDotLive: {
    backgroundColor: colors.live,
  },
  calDotSelected: {
    backgroundColor: colors.textOnBrand,
  },
  calToday: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.s,
    marginTop: space.md,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.brandDim,
  },
  calTodayText: {
    ...type.label,
    color: colors.brandAccent,
  },
});
