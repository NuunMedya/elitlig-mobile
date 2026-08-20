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
 * VARIŞ NOKTASI: sekme çubuğundaki canlı rozeti ve `match_start` push'u buraya
 * düşer (bkz. lib/notifications.ts → routeFromNotif).
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  EmptyState,
  ErrorState,
  LiveBadge,
  MatchRow,
  ScreenHeader,
  SkeletonMatchRow,
  Touchable,
  matchRowHeight,
  refreshControlProps,
  useHeaderScroll,
  useRefresh,
  useToast,
} from "@/components/ui";
import type { MatchRowPosition } from "@/components/ui";
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
/** Her satırda lig adı (meta) çizildiği için yükseklik tek değerdir. */
const ROW_HEIGHT = matchRowHeight("default", "league");
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

/** Listeye giren tek satır: maç + grup içi konumu (köşe ve ayraç için). */
interface LiveRow {
  match: ApiMatch;
  position: MatchRowPosition;
}

const keyExtractor = (item: LiveRow) => String(item.match.id);

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

  const rows = useMemo<LiveRow[]>(() => {
    const list = query.data ?? [];
    if (!list.length) return [];

    const groups = new Map<string, { label: string; followed: boolean; matches: ApiMatch[] }>();

    list.forEach((match) => {
      const label = String(match.league_name ?? "").trim() || LEAGUE_FALLBACK;
      // Eski kayıtlarda lig id'si boş olabilir; o zaman ad anahtar olur.
      const key = match.league_id != null ? `id:${match.league_id}` : `ad:${normalizeName(label)}`;
      const group = groups.get(key) ?? { label, followed: false, matches: [] };
      group.matches.push(match);
      if (isFollowed(match)) group.followed = true;
      groups.set(key, group);
    });

    // Favori takımın oynadığı lig en üstte; gerisi Türkçe alfabetik.
    const ordered = Array.from(groups.values()).sort((a, b) => {
      if (a.followed !== b.followed) return a.followed ? -1 : 1;
      return compareTr(a.label, b.label);
    });

    const result: LiveRow[] = [];
    ordered.forEach((group) => {
      const sorted = [...group.matches].sort(
        (a, b) =>
          formatTime(a.time).localeCompare(formatTime(b.time)) || Number(a.id) - Number(b.id),
      );

      sorted.forEach((match, index) => {
        const position: MatchRowPosition =
          sorted.length === 1
            ? "single"
            : index === 0
              ? "first"
              : index === sorted.length - 1
                ? "last"
                : "middle";

        /**
         * Lig adı boşsa MatchRow meta satırını çizmez ve satır 12px kısalır;
         * `getItemLayout` sabit yüksekliğe göre kurulduğu için liste kayar.
         * Yedek etiketle bütün satırlar aynı yükseklikte kalır.
         */
        const safeMatch = String(match.league_name ?? "").trim()
          ? match
          : { ...match, league_name: LEAGUE_FALLBACK };

        result.push({ match: safeMatch, position });
      });
    });

    return result;
  }, [query.data, isFollowed]);

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

  const { logoFor } = logos;

  const renderItem = useCallback(
    ({ item }: { item: LiveRow }) => (
      <LiveMatchItem
        match={item.match}
        position={item.position}
        homeLogo={logoFor(item.match.home_team_id, item.match.first_team_name)}
        awayLogo={logoFor(item.match.away_team_id, item.match.second_team_name)}
        isFavorite={favoriteMatchIds.has(Number(item.match.id))}
        onOpen={openMatch}
        onToggleStar={toggleStar}
      />
    ),
    [logoFor, favoriteMatchIds, openMatch, toggleStar],
  );

  const getItemLayout = useCallback(
    (_data: ArrayLike<LiveRow> | null | undefined, index: number) => ({
      length: ROW_HEIGHT,
      offset: ROW_HEIGHT * index,
      index,
    }),
    [],
  );

  /* ─────────────────────────── GÖRÜNÜM ─────────────────────────── */

  const count = rows.length;
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
        {count > 0 ? <LiveBadge size="sm" /> : null}
        <Text style={styles.summaryText} numberOfLines={1} {...textScale.dense}>
          {query.isLoading
            ? "Canlı maçlar yükleniyor"
            : count > 0
              ? `${count} maç canlı`
              : "Şu an canlı maç yok"}
        </Text>
        {updatedLabel ? (
          <Text
            style={styles.updated}
            accessibilityLabel={`Son güncelleme ${updatedLabel}`}
            {...textScale.badge}
          >
            {updatedLabel}
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
      {query.error && rows.length > 0 ? (
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
    <SkeletonMatchRow count={5} />
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

      <FlatList
        {...scrollProps}
        data={rows}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
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
  position,
  homeLogo,
  awayLogo,
  isFavorite,
  onOpen,
  onToggleStar,
}: {
  match: ApiMatch;
  position: MatchRowPosition;
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
    <MatchRow
      match={match}
      position={position}
      metaMode="league"
      homeLogo={homeLogo}
      awayLogo={awayLogo}
      isFavorite={isFavorite}
      onToggleFavorite={handleStar}
      onPress={handlePress}
      flashOnScoreChange
    />
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
    ...type.bodySm,
    color: colors.textSecondary,
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
});
