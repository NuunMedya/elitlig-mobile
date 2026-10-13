/**
 * CANLI — o anda oynanan bütün maçların tek akışı.
 *
 * NE: `/maclar/live` ucundan KAPSAM FİLTRESİZ çekilen maçlar lige göre
 * öbeklenmiş tek listede akar. Üstteki şerit kaç maçın oynandığını, altındaki
 * bant ise son atılan golü söyler; satıra dokunmak maç detayının canlı
 * sekmesini açar.
 *
 * NEDEN SATIR BAŞINA SOKET YOK: `useLiveMatch` her maç için bir socket.io
 * bağlantısı ve bir anlık görüntü sorgusu açar. On iki maçlık bir listede bu
 * on iki kalıcı bağlantı demektir — pil, mobil veri ve sunucu için pahalı,
 * üstelik satırda görünen tek şey skor. Bu yüzden liste TEK bir yoklamayla
 * (15 sn, yalnız uygulama ön plandayken) tazelenir; gerçek zamanlı akış maç
 * detayında başlar. Şartnamenin "soket bağlı" notu maç ekranı içindir.
 *
 * NEDEN KAPSAMDAN BAĞIMSIZ: kullanıcı Ankara 1. Lig'e bakarken favori takımı
 * başka şehirde oynuyor olabilir. Bu ekran seçili kapsamı değil ŞU AN OYNANAN
 * HER ŞEYİ gösterir; kapsamlı canlı listesi zaten Maçlar sekmesinin "Canlı"
 * segmentinde duruyor.
 *
 * NEDEN GOL BANDI PUSH'TAN DEĞİL YOKLAMADAN: gol push'u yalnız bildirime izin
 * vermiş VE o maçı/takımı favorilemiş kullanıcıya gider. Ekran açıkken golü
 * herkesin görmesi gerekir, bu yüzden bant iki yoklama arasındaki SKOR
 * FARKINDAN üretilir — ek istek yok, izin gerekmez, Expo Go'da da çalışır.
 *
 * GÖRÜNÜM: Maçlar sekmesiyle aynı dil — lig başına TEK kart; üst kapakta lig
 * kimliği, gövdede `MatchCard variant="compact"` satırları. Canlı satırın sol
 * kenarındaki kırmızı çizgi ve kırmızı skor sinyali taşır; eski düzende her
 * kartın kırmızı çerçevesi altı maçı altı alarm kutusuna çeviriyordu.
 *
 * VARIŞ NOKTASI: sekme çubuğundaki canlı rozeti ve `match_start` push'u buraya
 * düşer (bkz. lib/notifications.ts → routeFromNotif).
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshControl, SectionList, StyleSheet, Text, View } from "react-native";
import type { SectionListData, SectionListRenderItemInfo } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  EmptyState,
  ErrorState,
  LeagueGroupHeader,
  LiveBadge,
  MatchCard,
  ScreenHeader,
  SkeletonMatchRow,
  Touchable,
  matchCardHeight,
  refreshControlProps,
  useHeaderScroll,
  useRefresh,
  useToast,
} from "@/components/ui";
import { LEAGUE_GROUP_HEADER_HEIGHT } from "@/components/ui/LeagueGroupHeader";
import { useAppActive } from "@/hooks/useLiveFavoriteCount";
import { useTeamLogos } from "@/hooks/useTeamLogos";
import { getLiveMatches } from "@/lib/api/matches";
import { formatTime } from "@/lib/format";
import { queryKeys } from "@/lib/queryKeys";
import type { ApiMatch } from "@/lib/types";
import { useFavorite } from "@/providers/FavoriteProvider";
import {
  animateNextLayout,
  colors,
  haptics,
  hairline,
  layout,
  radius,
  space,
  textScale,
  touchSlop,
  type,
} from "@/theme";

/** Yoklama aralığı — şartname 15-20 sn aralığını veriyor, alt sınır seçildi. */
const LIVE_POLL_MS = 15_000;
/** Gol bandı kalıcı değildir; bu süre sonunda kendini toplar. */
const GOAL_BAND_MS = 90_000;
/** Satır (compact + saha) ve lig başlığı yükseklikleri — `getItemLayout` bunlardan kurulur. */
const ROW_HEIGHT = matchCardHeight({ variant: "compact", showVenue: true, favoritable: true });
const GROUP_GAP = space.lg;
const SECTION_HEADER_HEIGHT = GROUP_GAP + LEAGUE_GROUP_HEADER_HEIGHT;
/** Lig adı boş gelen kayıtlarda meta satırının kaybolmaması için yedek etiket. */
const LEAGUE_FALLBACK = "Lig belirtilmemiş";

/* ═══════════════════════ SAF YARDIMCILAR (bileşen dışı) ═══════════════════ */

/** Takım adı karşılaştırması Türkçe küçük harfle yapılır (İ/I tuzağı). */
const normalizeName = (value: string) => value.trim().toLocaleLowerCase("tr");

/** Lig adlarını Türkçe alfabeye göre sıralar (Ç, Ğ, İ, Ö, Ş, Ü doğru yerde). */
const compareTr = (a: string, b: string) => a.localeCompare(b, "tr");

/** "2-1" — skorun tek dizgeye indirgenmiş hâli; karşılaştırma bunun üzerinden. */
const scoreKey = (match: ApiMatch) =>
  `${Number(match.first_team_score ?? 0)}-${Number(match.second_team_score ?? 0)}`;

/** "2-1" → 3. Toplam gol sayısı; azalış (düzeltme) ile artışı ayırmak için. */
const scoreTotal = (key: string) =>
  key.split("-").reduce((sum, part) => sum + (Number(part) || 0), 0);

/** Gol bandının gösterdiği tek olay. */
interface GoalNews {
  matchId: number;
  /** Skoru artan takım (kendi kalesine golde rakip görünür — sunucu da böyle sayar). */
  scoringTeam: string;
  homeTeam: string;
  awayTeam: string;
  /** "2-1" */
  score: string;
  /** Bandın yaşını ölçen damga; aynı skor tekrar gelirse bant yenilenmesin diye. */
  at: number;
}

/**
 * İki yoklama arasında skoru ARTAN maçı bulur.
 *
 * NEDEN YALNIZ ARTIŞ: yönetici yanlış girilen bir golü silebilir; skorun
 * düşmesi "gol" değildir ve bant yanıltıcı olur. Aynı poll'da birden çok gol
 * varsa listedeki son eşleşme kazanır — bant tek satırdır, en son bulunanı
 * gösterir.
 */
function detectGoal(previous: Map<number, string>, list: ApiMatch[]): GoalNews | null {
  let found: GoalNews | null = null;

  for (const match of list) {
    const matchId = Number(match.id);
    const before = previous.get(matchId);
    // Bu turda listeye YENİ giren maç: kıyaslanacak geçmişi yok, gol sayılmaz.
    if (before === undefined) continue;

    const now = scoreKey(match);
    if (now === before || scoreTotal(now) <= scoreTotal(before)) continue;

    const beforeHome = Number(before.split("-")[0]) || 0;
    const home = Number(match.first_team_score ?? 0);

    found = {
      matchId,
      scoringTeam: home > beforeHome ? match.first_team_name : match.second_team_name,
      homeTeam: match.first_team_name,
      awayTeam: match.second_team_name,
      score: now,
      at: Date.now(),
    };
  }

  return found;
}

/** Lig öbeği — SectionList bölümü. */
interface LiveSectionMeta {
  key: string;
  leagueId: number | null;
  label: string;
  city: string | null;
}

type LiveSection = LiveSectionMeta & { data: ApiMatch[] };

const keyExtractor = (item: ApiMatch) => String(item.id);

/* ═════════════════════════════ EKRAN ═════════════════════════════ */

export default function LiveCenterScreen() {
  const router = useRouter();
  const toast = useToast();
  const appActive = useAppActive();
  const logos = useTeamLogos();
  const favorite = useFavorite();
  const { scrollY, scrollProps } = useHeaderScroll();

  /**
   * Kapsamsız canlı listesi. Anahtar `queryKeys.liveMatches()` — parametresiz
   * çağrı "şehir/lig/sezon yok" demektir, Maçlar sekmesinin kapsamlı sorgusuyla
   * aynı önbelleğe düşmez.
   */
  const query = useQuery({
    queryKey: queryKeys.liveMatches(),
    queryFn: () => getLiveMatches(),
    staleTime: 5_000,
    // Arka planda yoklama yok: kimsenin görmediği veri için pil harcanmaz.
    refetchInterval: appActive ? LIVE_POLL_MS : false,
  });

  const refresh = useRefresh(query.refetch, { refreshing: query.isRefetching });

  /* ─────────────────────────── FAVORİLER ─────────────────────────── */

  const favoriteTeamIds = useMemo(
    () => new Set(favorite.favorites.map((team) => Number(team.id))),
    [favorite.favorites],
  );
  const favoriteTeamNames = useMemo(
    () => new Set(favorite.favorites.map((team) => normalizeName(team.name))),
    [favorite.favorites],
  );
  const favoriteMatchIds = useMemo(
    () => new Set(favorite.favoriteMatches.map(Number)),
    [favorite.favoriteMatches],
  );

  /**
   * Maç kullanıcıyı ilgilendiriyor mu? Kompakt yanıtta takım id'si gelmeyebilir,
   * bu yüzden ada göre eşleşme yedeği vardır (useLiveFavoriteCount ile aynı kural).
   */
  const isFollowed = useCallback(
    (match: ApiMatch) =>
      favoriteMatchIds.has(Number(match.id)) ||
      (match.home_team_id != null && favoriteTeamIds.has(Number(match.home_team_id))) ||
      (match.away_team_id != null && favoriteTeamIds.has(Number(match.away_team_id))) ||
      favoriteTeamNames.has(normalizeName(match.first_team_name ?? "")) ||
      favoriteTeamNames.has(normalizeName(match.second_team_name ?? "")),
    [favoriteMatchIds, favoriteTeamIds, favoriteTeamNames],
  );

  /* ─────────────────────── LİSTE (lig öbekleri) ─────────────────────── */

  const sections = useMemo<LiveSection[]>(() => {
    const list = query.data ?? [];
    if (!list.length) return [];

    const groups = new Map<string, LiveSection & { followed: boolean }>();

    list.forEach((match) => {
      const label = String(match.league_name ?? "").trim() || LEAGUE_FALLBACK;
      // Eski kayıtlarda lig id'si boş olabilir; o zaman ad anahtar olur.
      const key = match.league_id != null ? `id:${match.league_id}` : `ad:${normalizeName(label)}`;
      const group = groups.get(key) ?? {
        key,
        leagueId: match.league_id != null ? Number(match.league_id) : null,
        label,
        city: String(match.city ?? "").trim() || null,
        followed: false,
        data: [],
      };
      group.data.push(match);
      if (isFollowed(match)) group.followed = true;
      groups.set(key, group);
    });

    // Favori takımın oynadığı lig en üstte; gerisi Türkçe alfabetik.
    const ordered = Array.from(groups.values()).sort((a, b) => {
      if (a.followed !== b.followed) return a.followed ? -1 : 1;
      return compareTr(a.label, b.label);
    });

    return ordered.map(({ followed: _followed, ...group }) => ({
      ...group,
      data: [...group.data].sort(
        (a, b) => formatTime(a.time).localeCompare(formatTime(b.time)) || Number(a.id) - Number(b.id),
      ),
    }));
  }, [query.data, isFollowed]);

  const count = useMemo(() => sections.reduce((sum, section) => sum + section.data.length, 0), [sections]);

  /* ───────────────────────── SON GOL BANDI ───────────────────────── */

  const previousScores = useRef<Map<number, string> | null>(null);
  const [goal, setGoal] = useState<GoalNews | null>(null);

  useEffect(() => {
    const list = query.data;
    if (!list) return;

    const next = new Map<number, string>();
    list.forEach((match) => next.set(Number(match.id), scoreKey(match)));

    const previous = previousScores.current;
    previousScores.current = next;
    // İlk yanıtta kıyaslanacak geçmiş yok: ekrana girer girmez "GOL!" yazmaz.
    if (!previous) return;

    const news = detectGoal(previous, list);
    if (!news) return;

    // Bant başlığın altına girerken liste sıçramasın.
    animateNextLayout();
    setGoal(news);
    // Ağır titreşim yalnız kullanıcının takip ettiği maçta (bkz. haptics.goal).
    if (favoriteMatchIds.has(news.matchId)) haptics.goal();
    else haptics.light();
  }, [query.data, favoriteMatchIds]);

  useEffect(() => {
    if (!goal) return;
    const timer = setTimeout(() => {
      animateNextLayout();
      setGoal(null);
    }, GOAL_BAND_MS);
    return () => clearTimeout(timer);
  }, [goal]);

  /* ─────────────────────────── EYLEMLER ─────────────────────────── */

  const openMatch = useCallback(
    (matchId: number) => {
      // Canlı maçın doğal varış noktası detayın canlı sekmesidir.
      router.push({ pathname: "/mac/[id]", params: { id: String(matchId), tab: "canli" } });
    },
    [router],
  );

  const { isFavoriteMatch, toggleFavoriteMatch } = favorite;

  const toggleStar = useCallback(
    (matchId: number) => {
      const willFollow = !isFavoriteMatch(matchId);
      toggleFavoriteMatch(matchId);
      toast.show({
        message: willFollow
          ? "Maç favorilerine eklendi — golleri bildirim olarak gelir."
          : "Maç favorilerinden çıkarıldı.",
        tone: willFollow ? "success" : "neutral",
      });
    },
    [isFavoriteMatch, toggleFavoriteMatch, toast],
  );

  const openGoalMatch = useCallback(() => {
    if (goal) openMatch(goal.matchId);
  }, [goal, openMatch]);

  const dismissGoal = useCallback(() => {
    animateNextLayout();
    setGoal(null);
  }, []);

  /**
   * Canlı maç yokken tek anlamlı yer bugünün programıdır. `replace` kullanılır:
   * kullanıcı Maçlar'a geçtikten sonra geri tuşuyla boş "Canlı" ekranına
   * dönmek istemez.
   */
  const goToFixtures = useCallback(() => {
    router.replace("/(tabs)");
  }, [router]);

  const openLeague = useCallback(
    (leagueId: number | null) => {
      router.push(
        leagueId != null ? `/(tabs)/ligler?leagueId=${leagueId}&tab=fikstur` : "/(tabs)/ligler",
      );
    },
    [router],
  );

  const { logoFor } = logos;

  const renderItem = useCallback(
    ({ item, index, section }: SectionListRenderItemInfo<ApiMatch, LiveSectionMeta>) => (
      <LiveMatchItem
        match={item}
        last={index === section.data.length - 1}
        homeLogo={logoFor(item.home_team_id, item.first_team_name)}
        awayLogo={logoFor(item.away_team_id, item.second_team_name)}
        isFavorite={favoriteMatchIds.has(Number(item.id))}
        onOpen={openMatch}
        onToggleStar={toggleStar}
      />
    ),
    [logoFor, favoriteMatchIds, openMatch, toggleStar],
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: SectionListData<ApiMatch, LiveSectionMeta> }) => (
      <LiveSectionHeader
        leagueId={section.leagueId}
        label={section.label}
        city={section.city}
        count={section.data.length}
        onOpenLeague={openLeague}
      />
    ),
    [openLeague],
  );

  /**
   * SectionList düz indeks uzayı: her bölüm için [başlık, ...satırlar, altlık].
   * Altlık çizilmese bile bir indeks tüketir (VirtualizedSectionList kuralı).
   */
  const getItemLayout = useCallback(
    (data: SectionListData<ApiMatch, LiveSectionMeta>[] | null, index: number) => {
      let offset = 0;
      let cursor = 0;
      for (const section of data ?? []) {
        if (index === cursor) return { length: SECTION_HEADER_HEIGHT, offset, index };
        offset += SECTION_HEADER_HEIGHT;
        cursor += 1;
        const rowsInSection = section.data.length;
        if (index < cursor + rowsInSection) {
          return { length: ROW_HEIGHT, offset: offset + (index - cursor) * ROW_HEIGHT, index };
        }
        offset += rowsInSection * ROW_HEIGHT;
        cursor += rowsInSection;
        if (index === cursor) return { length: 0, offset, index };
        cursor += 1;
      }
      return { length: 0, offset, index };
    },
    [],
  );

  /* ─────────────────────────── GÖRÜNÜM ─────────────────────────── */

  const updatedLabel = useMemo(() => {
    if (!query.dataUpdatedAt) return "";
    return new Date(query.dataUpdatedAt).toLocaleTimeString("tr-TR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }, [query.dataUpdatedAt]);

  const headerBottom = (
    <View style={styles.headerBottom}>
      <View style={styles.summary}>
        {/* Nabız yalnız gerçekten maç varken atar; boş listede yanıp sönmesi yalan olur. */}
        {count > 0 ? <LiveBadge compact /> : null}
        <Text style={styles.summaryText} numberOfLines={1} {...textScale.dense}>
          {query.isLoading
            ? "Canlı maçlar yükleniyor"
            : count > 0
              ? `${count} maç oynanıyor · ${sections.length} lig`
              : "Şu an canlı maç yok"}
        </Text>
        {updatedLabel ? (
          <Text
            style={styles.updated}
            accessibilityLabel={`Son güncelleme ${updatedLabel}`}
            {...textScale.badge}
          >
            {`Güncellendi ${updatedLabel}`}
          </Text>
        ) : null}
      </View>

      {/**
       * Ekranda BAYAT VERİ varken hata gösterimi banttır: 15 saniyede bir
       * yoklanan bir listede tek bir başarısız istek yüzünden canlı skorları
       * silmek yanlış olur (§5.6). Liste boşken tam ekran ErrorState çıkar.
       *
       * NEDEN LİSTENİN İÇİNDE DEĞİL: `ListHeaderComponent` eklenirse
       * `getItemLayout` ofsetleri başlığın yüksekliği kadar kayar (RN ofsete
       * başlığı katmaz) ve `removeClippedSubviews` ile satırlar yanlış kırpılır.
       */}
      {query.error && count > 0 ? (
        <ErrorState error={query.error} onRetry={query.refetch} variant="banner" />
      ) : null}

      {goal ? (
        <Touchable
          feedback="row"
          haptic="selection"
          onPress={openGoalMatch}
          style={styles.goalBand}
          accessibilityRole="button"
          accessibilityLabel={`Gol. ${goal.scoringTeam}. ${goal.homeTeam} ${goal.score} ${goal.awayTeam}. Maçı açmak için dokun.`}
        >
          <Ionicons name="football" size={14} color={colors.live} />
          <Text style={styles.goalTitle} {...textScale.badge}>
            GOL
          </Text>
          <Text style={styles.goalText} numberOfLines={1} {...textScale.dense}>
            {goal.scoringTeam} · {goal.homeTeam} {goal.score} {goal.awayTeam}
          </Text>
          <Touchable
            feedback="icon"
            onPress={dismissGoal}
            hitSlop={touchSlop(20)}
            accessibilityRole="button"
            accessibilityLabel="Gol bandını kapat"
          >
            <Ionicons name="close" size={16} color={colors.textSecondary} />
          </Touchable>
        </Touchable>
      ) : null}
    </View>
  );

  /**
   * `refresh.control` hazır bir düğüm döndürür ama tipi `ReactElement<unknown>`;
   * RN'in `refreshControl` prop'u `ReactElement<RefreshControlProps>` bekler.
   * Prop demeti aynı temayı verir, tip de doğru olur.
   */
  const refreshControl = (
    <RefreshControl {...refreshControlProps(refresh.refreshing, refresh.onRefresh)} />
  );

  const listEmpty = query.isLoading ? (
    <View style={styles.skeletonGroup}>
      <SkeletonMatchRow count={5} />
    </View>
  ) : query.error ? (
    <ErrorState error={query.error} onRetry={query.refetch} />
  ) : (
    <EmptyState
      icon="football-outline"
      title="Şu anda canlı maç yok"
      body="Maç başladığı anda burada belirir. Maçı yıldızlarsan başlama ve gol bildirimlerini de alırsın."
      action={{ label: "Bugünün maçları", onPress: goToFixtures }}
    />
  );

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader title="Canlı" back scrollY={scrollY} bottom={headerBottom} />

      <SectionList<ApiMatch, LiveSectionMeta>
        {...scrollProps}
        sections={sections}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        renderSectionHeader={renderSectionHeader}
        stickySectionHeadersEnabled
        getItemLayout={getItemLayout}
        contentContainerStyle={styles.list}
        ListEmptyComponent={listEmpty}
        refreshControl={refreshControl}
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={8}
        removeClippedSubviews
      />
    </SafeAreaView>
  );
}

/* ═══════════════════════════ LİSTE PARÇALARI ═══════════════════════════ */

/**
 * Satır sarmalayıcı. VARLIK NEDENİ: `MatchRow` memo'lu ama `onPress` her
 * render'da yeniden üretilirse memo hiçbir işe yaramaz. İşleyiciler maç
 * id'sini burada, kendi `useCallback`'lerinde bağlar; dışarıdan yalnız ilkel
 * değerler ve DEĞİŞMEYEN iki fonksiyon geçer.
 */
const LiveMatchItem = memo(function LiveMatchItem({
  match,
  last,
  homeLogo,
  awayLogo,
  isFavorite,
  onOpen,
  onToggleStar,
}: {
  match: ApiMatch;
  /** Öbeğin son satırı — kartın alt köşelerini çizer. */
  last: boolean;
  homeLogo: string | null;
  awayLogo: string | null;
  isFavorite: boolean;
  onOpen: (matchId: number) => void;
  onToggleStar: (matchId: number) => void;
}) {
  const matchId = Number(match.id);
  const handlePress = useCallback(() => onOpen(matchId), [onOpen, matchId]);
  const handleStar = useCallback(() => onToggleStar(matchId), [onToggleStar, matchId]);

  return (
    <MatchCard
      variant="compact"
      position={last ? "last" : "middle"}
      match={match}
      homeLogo={homeLogo}
      awayLogo={awayLogo}
      showVenue
      isFavorite={isFavorite}
      onToggleFavorite={handleStar}
      onPress={handlePress}
    />
  );
});

/** Lig öbeğinin başlığı — aynı memo gerekçesi (bkz. LiveMatchItem). */
const LiveSectionHeader = memo(function LiveSectionHeader({
  leagueId,
  label,
  city,
  count,
  onOpenLeague,
}: {
  leagueId: number | null;
  label: string;
  city: string | null;
  count: number;
  onOpenLeague: (leagueId: number | null) => void;
}) {
  const handleOpen = useCallback(() => onOpenLeague(leagueId), [onOpenLeague, leagueId]);
  return (
    <View style={styles.sectionHeader}>
      <LeagueGroupHeader leagueName={label} cityName={city} matchCount={count} onPress={handleOpen} sticky />
    </View>
  );
});

/* ═══════════════════════════ STİLLER ═══════════════════════════ */

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },

  headerBottom: {
    backgroundColor: colors.bg,
    paddingHorizontal: layout.screenPadding,
    paddingBottom: space.sm,
    gap: space.sm,
  },
  summary: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  summaryText: {
    ...type.label,
    color: colors.textPrimary,
    flex: 1,
  },
  updated: {
    ...type.caption,
    color: colors.textTertiary,
  },

  goalBand: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    backgroundColor: colors.liveDim,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  goalTitle: {
    ...type.micro,
    color: colors.live,
  },
  goalText: {
    ...type.bodySm,
    color: colors.textPrimary,
    flex: 1,
  },

  list: {
    paddingHorizontal: layout.screenPadding,
    paddingBottom: space.giant,
    flexGrow: 1,
  },
  sectionHeader: {
    height: SECTION_HEADER_HEIGHT,
    paddingTop: GROUP_GAP,
    backgroundColor: colors.bg,
  },
  skeletonGroup: {
    marginTop: GROUP_GAP,
    borderRadius: radius.xl,
    borderWidth: hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface1,
    overflow: "hidden",
  },
});
