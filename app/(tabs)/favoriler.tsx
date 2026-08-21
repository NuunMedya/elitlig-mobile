/**
 * Favoriler sekmesi — kullanıcının yıldızladığı her şeyin tek adresi.
 *
 * NE: üç görünüm tek segment denetimiyle değişir —
 *   MAÇLAR   favori takım ∪ favori maç ∪ favori lig/sezon kaynaklarından
 *            birleştirilmiş program: CANLI → BUGÜN → YAKLAŞAN → SON 7 GÜN
 *   TAKIMLAR yıldızlı takımlar; her satırda lig ve sıradaki maç özeti
 *   LİGLER   yıldızlı lig ve sezonlar; dokununca Ligler sekmesi o kapsamla açılır
 *
 * NEDEN PROGRAM ÖNCE: eski `app/favorilerim.tsx` yalnızca "ne favoriledim"
 * dökümüydü. Kullanıcının gerçekten merak ettiği şey favorilerinin BUGÜN NE
 * YAPTIĞIDIR; bu yüzden varsayılan görünüm düz liste değil, zamana göre
 * bölümlenmiş maç programıdır. Ham favori listesi ikinci ve üçüncü sekmeye
 * çekilmiştir.
 *
 * NEDEN BİRLEŞTİRME İSTEMCİDE: sunucuda "favorilerimin maçları" diye tek bir uç
 * yok; takım (`/maclar?team_id=`), lig ve sezon (`/maclar?league_id=`) uçları
 * ayrı. Favori sayısı küçük olduğundan (tipik 1-5) her kaynak kendi sorgusuyla
 * çekilir ve maç id'sine göre tekilleştirilir. CANLI bölüm ayrıca
 * `useLiveFavoriteCount` yoklamasından (20 sn, yalnız ön planda) beslenir —
 * o kanca zaten sekme rozetini besliyor, ikinci bir zamanlayıcı açılmaz.
 *
 * NEDEN GİRİŞSİZ DE ÇALIŞIR: favoriler cihazda saklanır. Giriş yalnızca push
 * bildirimlerini (gol, maç başladı) açar; üst bant bunu anlatır.
 *
 * DERİN BAĞLANTI: /(tabs)/favoriler?tab=maclar | takimlar | ligler
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  FlatList,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  View,
  type SectionListRenderItemInfo,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Button,
  EmptyState,
  ErrorState,
  ListRow,
  MatchRow,
  ScreenHeader,
  SectionHeader,
  SegmentedControl,
  SkeletonMatchRow,
  Surface,
  TeamLogo,
  Touchable,
  refreshControlProps,
  useHeaderScroll,
  useRefresh,
  useToast,
} from "@/components/ui";
import type { MatchRowPosition, SegmentedItem } from "@/components/ui";
import { useLiveFavoriteCount } from "@/hooks/useLiveFavoriteCount";
import { useTeamLogos } from "@/hooks/useTeamLogos";
import { getMatch, getMatches, getTeamMatches } from "@/lib/api/matches";
import { formatDayHeading, formatTime } from "@/lib/format";
import { matchState } from "@/lib/match";
import { queryKeys } from "@/lib/queryKeys";
import type { ApiMatch } from "@/lib/types";
import { useAuth } from "@/providers/AuthProvider";
import { useFavorite, type FavoriteScope, type FavoriteTeam } from "@/providers/FavoriteProvider";
import { useScope } from "@/providers/ScopeProvider";
import { colors, layout, radius, space, textScale, touchSlop, type } from "@/theme";

/* ===================== YARDIMCILAR (saf, bileşen dışı) ===================== */

type FavTab = "maclar" | "takimlar" | "ligler";

/**
 * ?tab= değeri — bilinmeyen/eksik değerde varsayılan görünüme düşer.
 *
 * DİKKAT — I/İ TUZAĞI: rota anahtarları ASCII'dir ama parametre büyük harfle ya
 * da Türkçe harfle gelebilir. `"TAKIMLAR".toLocaleLowerCase("tr")` noktasız
 * "takımlar", düz `"LİG".toLowerCase()` ise birleşik noktalı "li̇g" üretir;
 * ikisi de eşleşmeyi kaçırır. Bu yüzden önce I ailesi ASCII "i"ye katlanır,
 * sonra küçültme yapılır.
 */
function normalizeTab(value?: string | string[]): FavTab {
  const raw = Array.isArray(value) ? value[0] : value;
  const key = String(raw ?? "")
    .trim()
    .replace(/[İIı]/g, "i")
    .toLowerCase();
  if (key === "takimlar" || key === "takim" || key === "teams") return "takimlar";
  if (key === "ligler" || key === "lig" || key === "leagues") return "ligler";
  return "maclar";
}

/** Yerel takvime göre "YYYY-MM-DD". */
function dayKeyOf(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * Maç kaydının gün anahtarı. Sunucu `date` alanını hem "2026-08-19" hem
 * "2026-08-19T00:00:00.000Z" biçiminde döndürebiliyor; ilk on karakter varsa
 * doğrudan okunur — UTC gece yarısını yerel saate çevirmek negatif zaman
 * diliminde günü bir geri kaydırırdı.
 */
function matchDayKey(match: ApiMatch): string {
  const raw = String(match.date ?? "").trim();
  const direct = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (direct) return direct[1];
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? "" : dayKeyOf(parsed);
}

/** Kronolojik sıralama anahtarı: "YYYY-MM-DD HH:MM" dizi karşılaştırmasıyla doğru sıralanır. */
function matchSortKey(match: ApiMatch): string {
  return `${matchDayKey(match)} ${formatTime(match.time) || "00:00"}`;
}

/** Gün anahtarını takvim aritmetiğiyle kaydırır (ay/yıl sınırı doğru geçilir). */
function shiftDayKey(key: string, days: number): string {
  const [year, month, day] = key.split("-").map(Number);
  if (!year || !month || !day) return key;
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return dayKeyOf(date);
}

/** Takım adı karşılaştırması Türkçe küçük harfle yapılır (İ/I tuzağı). */
const normalizeName = (value?: string | null) => String(value ?? "").trim().toLocaleLowerCase("tr");

/** Eski maç kayıtlarında takım id'si boş olabilir; ada göre eşleşme yedeği şart. */
function belongsToTeam(match: ApiMatch, team: FavoriteTeam): boolean {
  if (match.home_team_id != null && Number(match.home_team_id) === team.id) return true;
  if (match.away_team_id != null && Number(match.away_team_id) === team.id) return true;
  const name = normalizeName(team.name);
  return normalizeName(match.first_team_name) === name || normalizeName(match.second_team_name) === name;
}

/** Favori takımın o maçtaki rakibi. */
function opponentName(match: ApiMatch, team: FavoriteTeam): string {
  const isHome =
    (match.home_team_id != null && Number(match.home_team_id) === team.id) ||
    normalizeName(match.first_team_name) === normalizeName(team.name);
  return (isHome ? match.second_team_name : match.first_team_name) ?? "";
}

/** Grup içi konum — ayraç ve köşe yuvarlaması için. */
function rowPosition(index: number, total: number): MatchRowPosition {
  if (total <= 1) return "single";
  if (index === 0) return "first";
  if (index === total - 1) return "last";
  return "middle";
}

const byKeyAsc = (a: ApiMatch, b: ApiMatch) => (matchSortKey(a) < matchSortKey(b) ? -1 : 1);
const byKeyDesc = (a: ApiMatch, b: ApiMatch) => (matchSortKey(a) > matchSortKey(b) ? -1 : 1);

interface MatchSection {
  key: string;
  title: string;
  data: ApiMatch[];
}

interface ScopeSection {
  key: string;
  title: string;
  kind: "league" | "season";
  data: FavoriteScope[];
}

interface TeamSummary {
  /** Takımın oynadığı lig — son/sıradaki maç kaydından okunur. */
  league: string | null;
  next: ApiMatch | null;
}

/** YAKLAŞAN bölümü sonsuza kadar uzamasın: bir sezonun tamamı listelenmez. */
const UPCOMING_LIMIT = 50;
/** Geçmiş penceresi — şartname §2.2. */
const RECENT_DAYS = 7;

/* ===================== KÜÇÜK BİLEŞENLER ===================== */

/** Favoriden çıkarma yıldızı — satır içinde ayrı dokunma alanı. */
const StarButton = React.memo(function StarButton({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <Touchable
      feedback="icon"
      haptic="selection"
      onPress={onPress}
      hitSlop={touchSlop(22)}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons name="star" size={20} color={colors.star} />
    </Touchable>
  );
});

/**
 * Girişsiz üst bandı. Favoriler cihazda çalışır ama push hedeflemesi sunucudaki
 * kayda göre yapılır — kullanıcıya kaybettiği şey (gol bildirimi) söylenir.
 */
const GuestBanner = React.memo(function GuestBanner({ onSignIn }: { onSignIn: () => void }) {
  return (
    <Surface level={1} radius="lg" style={styles.banner}>
      <Ionicons name="notifications-outline" size={18} color={colors.brandAccent} />
      <Text style={styles.bannerText} {...textScale.dense}>
        Favorilerin bu cihazda. Giriş yap, gol bildirimlerini al.
      </Text>
      <Button label="Giriş yap" size="sm" variant="primary" onPress={onSignIn} />
    </Surface>
  );
});

/** Maç satırı — `onPress`/`onToggleFavorite` içeride sabitlenir ki memo işe yarasın. */
const FavoriteMatchRow = React.memo(function FavoriteMatchRow({
  match,
  position,
  homeLogo,
  awayLogo,
  starred,
  onOpen,
  onToggleStar,
}: {
  match: ApiMatch;
  position: MatchRowPosition;
  homeLogo?: string | null;
  awayLogo?: string | null;
  starred: boolean;
  onOpen: (matchId: number) => void;
  onToggleStar: (matchId: number) => void;
}) {
  const open = useCallback(() => onOpen(match.id), [onOpen, match.id]);
  const toggle = useCallback(() => onToggleStar(match.id), [onToggleStar, match.id]);

  return (
    <MatchRow
      match={match}
      position={position}
      homeLogo={homeLogo}
      awayLogo={awayLogo}
      metaMode="league"
      showFavorite
      isFavorite={starred}
      onToggleFavorite={toggle}
      onPress={open}
      flashOnScoreChange
    />
  );
});

/** Favori takım satırı. */
const FavoriteTeamRow = React.memo(function FavoriteTeamRow({
  team,
  subtitle,
  position,
  onOpen,
  onRemove,
}: {
  team: FavoriteTeam;
  subtitle: string;
  position: MatchRowPosition;
  onOpen: (teamId: number) => void;
  onRemove: (team: FavoriteTeam) => void;
}) {
  const open = useCallback(() => onOpen(team.id), [onOpen, team.id]);
  const remove = useCallback(() => onRemove(team), [onRemove, team]);

  return (
    <ListRow
      leading={<TeamLogo name={team.name} logo={team.logo} size={layout.crestLg} />}
      title={team.name}
      subtitle={subtitle}
      position={position}
      onPress={open}
      trailing={<StarButton label={`${team.name} favorilerden çıkar`} onPress={remove} />}
    />
  );
});

/** Favori lig / sezon satırı. */
const FavoriteScopeRow = React.memo(function FavoriteScopeRow({
  item,
  kind,
  position,
  onOpen,
  onRemove,
}: {
  item: FavoriteScope;
  kind: "league" | "season";
  position: MatchRowPosition;
  onOpen: (item: FavoriteScope, kind: "league" | "season") => void;
  onRemove: (item: FavoriteScope, kind: "league" | "season") => void;
}) {
  const open = useCallback(() => onOpen(item, kind), [onOpen, item, kind]);
  const remove = useCallback(() => onRemove(item, kind), [onRemove, item, kind]);

  return (
    <ListRow
      leading={{ icon: kind === "league" ? "trophy-outline" : "calendar-outline", tone: "brand" }}
      title={item.name}
      subtitle={kind === "league" ? "Ligler sekmesinde aç" : "Sezonu Ligler sekmesinde aç"}
      position={position}
      onPress={open}
      trailing={<StarButton label={`${item.name} favorilerden çıkar`} onPress={remove} />}
    />
  );
});

/* ===================== EKRAN ===================== */

export default function FavorilerScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();
  const auth = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { selectLeague, selectSeason } = useScope();
  const { logoFor } = useTeamLogos();
  const live = useLiveFavoriteCount();
  const { scrollY, scrollProps } = useHeaderScroll();

  const {
    favorites,
    favoriteLeagues,
    favoriteSeasons,
    favoriteMatches,
    addFavorite,
    removeFavorite,
    isFavoriteMatch,
    toggleFavoriteMatch,
    toggleFavoriteLeague,
    toggleFavoriteSeason,
  } = useFavorite();

  const [tab, setTab] = useState<FavTab>(() => normalizeTab(params.tab));

  // Derin bağlantı sonradan da gelebilir (bildirime dokunma): parametre
  // değişince görünüm ona uyar, kullanıcının elle seçimi ezilmez.
  const paramTab = params.tab;
  useEffect(() => {
    if (paramTab) setTab(normalizeTab(paramTab));
  }, [paramTab]);

  // Sekme değişince yeni liste tepeden başlar; başlığın daralma ilerlemesi de
  // sıfırlanmazsa başlık boşuna küçük kalır.
  useEffect(() => {
    scrollY.setValue(0);
  }, [tab, scrollY]);

  /* ---- Kaynak sorgular: takım / lig / sezon ---- */

  const teamQueries = useQueries({
    queries: favorites.map((team) => ({
      queryKey: queryKeys.teamMatches(team.id),
      queryFn: () => getTeamMatches(team.id),
      staleTime: 60_000,
    })),
  });

  const leagueQueries = useQueries({
    queries: favoriteLeagues.map((league) => ({
      queryKey: queryKeys.matches({ leagueId: league.id }),
      queryFn: () => getMatches({ leagueId: league.id, limit: 120 }),
      staleTime: 60_000,
    })),
  });

  const seasonQueries = useQueries({
    queries: favoriteSeasons.map((season) => ({
      queryKey: queryKeys.matches({ seasonId: season.id }),
      queryFn: () => getMatches({ seasonId: season.id, limit: 120 }),
      staleTime: 60_000,
    })),
  });

  /**
   * Toplu kaynaklardan gelen maçlar. Tek tek yıldızlanmış maçların hangilerinin
   * AYRICA çekilmesi gerektiği BURADAN hesaplanır; tekil maç sonuçları bu
   * haritaya KATILMAZ — katılsaydı sorgu listesi kendi sonucuyla küçülüp
   * büyüyerek salınırdı.
   */
  const bulkMatches = useMemo(() => {
    const map = new Map<number, ApiMatch>();
    const collect = (rows?: ApiMatch[]) => {
      rows?.forEach((row) => {
        if (row?.id != null) map.set(Number(row.id), row);
      });
    };
    teamQueries.forEach((query) => collect(query.data));
    leagueQueries.forEach((query) => collect(query.data));
    seasonQueries.forEach((query) => collect(query.data));
    return map;
  }, [teamQueries, leagueQueries, seasonQueries]);

  const missingMatchIds = useMemo(
    () => favoriteMatches.filter((id) => !bulkMatches.has(id)),
    [favoriteMatches, bulkMatches]
  );

  const matchQueries = useQueries({
    queries: missingMatchIds.map((id) => ({
      queryKey: queryKeys.match(id),
      queryFn: () => getMatch(id),
      staleTime: 60_000,
    })),
  });

  /* ---- Birleştirme ---- */

  const hasAnyFavorite =
    favorites.length > 0 ||
    favoriteLeagues.length > 0 ||
    favoriteSeasons.length > 0 ||
    favoriteMatches.length > 0;

  const pool = useMemo(() => {
    const map = new Map<number, ApiMatch>(bulkMatches);
    matchQueries.forEach((query) => {
      const match = query.data;
      if (match?.id != null) map.set(Number(match.id), match);
    });
    // Canlı yoklaması en taze skoru taşır; aynı id varsa onu ezer.
    live.matches.forEach((match) => map.set(Number(match.id), match));
    return Array.from(map.values());
  }, [bulkMatches, matchQueries, live.matches]);

  const sections = useMemo<MatchSection[]>(() => {
    const today = dayKeyOf(new Date());
    const floor = shiftDayKey(today, -RECENT_DAYS);
    const liveIds = new Set(live.matches.map((match) => Number(match.id)));

    const liveRows: ApiMatch[] = [];
    const todayRows: ApiMatch[] = [];
    const upcomingRows: ApiMatch[] = [];
    const recentRows: ApiMatch[] = [];

    pool.forEach((match) => {
      const day = matchDayKey(match);
      if (!day) return;
      if (liveIds.has(Number(match.id)) || matchState(match) === "live") {
        liveRows.push(match);
        return;
      }
      if (day === today) {
        todayRows.push(match);
        return;
      }
      if (day > today) {
        upcomingRows.push(match);
        return;
      }
      if (day >= floor) recentRows.push(match);
    });

    const result: MatchSection[] = [];
    if (liveRows.length) result.push({ key: "live", title: "Canlı", data: liveRows.sort(byKeyAsc) });
    if (todayRows.length) result.push({ key: "today", title: "Bugün", data: todayRows.sort(byKeyAsc) });
    if (upcomingRows.length) {
      result.push({
        key: "upcoming",
        title: "Yaklaşan",
        data: upcomingRows.sort(byKeyAsc).slice(0, UPCOMING_LIMIT),
      });
    }
    if (recentRows.length) {
      result.push({ key: "recent", title: `Son ${RECENT_DAYS} gün`, data: recentRows.sort(byKeyDesc) });
    }
    return result;
  }, [pool, live.matches]);

  /** Takım sekmesinin alt satırı: lig + sıradaki maç. */
  const teamSummaries = useMemo(() => {
    const today = dayKeyOf(new Date());
    const map = new Map<number, TeamSummary>();

    favorites.forEach((team) => {
      const rows = pool.filter((match) => matchDayKey(match) !== "" && belongsToTeam(match, team));
      const ahead = rows.filter((match) => matchDayKey(match) >= today).sort(byKeyAsc);
      const behind = rows.filter((match) => matchDayKey(match) < today).sort(byKeyDesc);
      const next = ahead[0] ?? null;
      const reference = next ?? behind[0] ?? null;
      map.set(team.id, { league: reference?.league_name ?? null, next });
    });

    return map;
  }, [favorites, pool]);

  const scopeSections = useMemo<ScopeSection[]>(() => {
    const result: ScopeSection[] = [];
    if (favoriteLeagues.length) {
      result.push({ key: "leagues", title: "Ligler", kind: "league", data: favoriteLeagues });
    }
    if (favoriteSeasons.length) {
      result.push({ key: "seasons", title: "Sezonlar", kind: "season", data: favoriteSeasons });
    }
    return result;
  }, [favoriteLeagues, favoriteSeasons]);

  /* ---- Durum: yükleniyor / hata / yenileniyor ---- */

  const allQueries = [...teamQueries, ...leagueQueries, ...seasonQueries, ...matchQueries];
  const loading = hasAnyFavorite && pool.length === 0 && allQueries.some((query) => query.isLoading);
  const firstError = allQueries.find((query) => query.isError)?.error ?? null;
  const refreshing = allQueries.some((query) => query.isRefetching);

  const refetchAll = useCallback(() => {
    // Tek tek `refetch()` çağırmak yerine önek geçersizleştirme: sorgu dizisi
    // her render'da yeniden kurulduğu için kararlı bir geri çağrı gerekiyor.
    void queryClient.invalidateQueries({ queryKey: ["matches"] });
    void queryClient.invalidateQueries({ queryKey: ["favorites"] });
  }, [queryClient]);

  const refresh = useRefresh(refetchAll, { refreshing });
  /**
   * `refresh.control` hazır bir düğüm döndürür ama tipi `ReactElement<unknown>`;
   * RN'in `refreshControl` prop'u `ReactElement<RefreshControlProps>` bekler.
   * Bu yüzden aynı davranış (en az 450ms görünürlük + seçim titreşimi) kancanın
   * `refreshing`/`onRefresh` alanlarıyla ve ortak renk sözlüğüyle kurulur.
   */
  const refreshControl = (
    <RefreshControl {...refreshControlProps(refresh.refreshing, refresh.onRefresh)} />
  );

  /* ---- Gezinme ---- */

  const openMatch = useCallback((matchId: number) => router.push(`/mac/${matchId}`), [router]);
  const openTeam = useCallback((teamId: number) => router.push(`/takim/${teamId}`), [router]);
  const openTeamSearch = useCallback(() => router.push("/ara?tip=takim"), [router]);
  const openLeagues = useCallback(() => router.push("/(tabs)/ligler"), [router]);
  const openSignIn = useCallback(() => router.push("/giris"), [router]);

  const openScopeTab = useCallback(
    (item: FavoriteScope, kind: "league" | "season") => {
      // Sezon kaydında bağlı olduğu lig tutulmuyor; ScopeProvider seçili lig
      // listesinde bulamazsa ilk geçerli sezona kayar — kapsam tutarsız kalmaz.
      if (kind === "league") selectLeague(item.id);
      else selectSeason(item.id);
      router.push("/(tabs)/ligler");
    },
    [router, selectLeague, selectSeason]
  );

  /* ---- Favoriden çıkarma (geri alınabilir) ---- */

  const removeTeam = useCallback(
    (team: FavoriteTeam) => {
      removeFavorite(team.id);
      toast.show({
        message: `${team.name} favorilerden çıkarıldı`,
        action: { label: "Geri al", onPress: () => addFavorite(team) },
      });
    },
    [addFavorite, removeFavorite, toast]
  );

  const removeScope = useCallback(
    (item: FavoriteScope, kind: "league" | "season") => {
      if (kind === "league") toggleFavoriteLeague(item);
      else toggleFavoriteSeason(item);
      toast.show({
        message: `${item.name} favorilerden çıkarıldı`,
        action: {
          label: "Geri al",
          onPress: () => (kind === "league" ? toggleFavoriteLeague(item) : toggleFavoriteSeason(item)),
        },
      });
    },
    [toast, toggleFavoriteLeague, toggleFavoriteSeason]
  );

  /* ---- Başlık ---- */

  const segments = useMemo<SegmentedItem<FavTab>[]>(
    () => [
      { key: "maclar", label: "Maçlar", dot: live.count > 0 },
      { key: "takimlar", label: favorites.length ? `Takımlar ${favorites.length}` : "Takımlar" },
      {
        key: "ligler",
        label:
          favoriteLeagues.length + favoriteSeasons.length
            ? `Ligler ${favoriteLeagues.length + favoriteSeasons.length}`
            : "Ligler",
      },
    ],
    [live.count, favorites.length, favoriteLeagues.length, favoriteSeasons.length]
  );

  const header = (
    <ScreenHeader
      title="Favoriler"
      back
      /* Bu ekran sekme çubuğunda yuvası olmayan bir sekmedir (href: null) ve
         Menü'den açılır. Sekme gezgininde geri yığını olmayabilir; o durumda
         geldiği yere, yani Menü'ye dönülür. */
      onBack={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/menu"))}
      scrollY={scrollY}
      /* BAŞLIKTA MESAJ DÜĞMESİ YOK: yazışmaya artık her ekranda duran yüzen
         mesaj balonundan ulaşılıyor (components/MessageSticker.tsx). İkisini
         birden çizmek aynı hedefe iki kapı açar ve rozet iki yerde sayılırdı. */
      bottom={
        <View style={styles.segmentWrap}>
          <SegmentedControl<FavTab> items={segments} value={tab} onChange={setTab} />
        </View>
      }
    />
  );

  const guestBanner = auth.user ? null : <GuestBanner onSignIn={openSignIn} />;

  /* ---- Liste çizimleri ---- */

  const renderMatch = useCallback(
    ({ item, index, section }: SectionListRenderItemInfo<ApiMatch, MatchSection>) => (
      <FavoriteMatchRow
        match={item}
        position={rowPosition(index, section.data.length)}
        homeLogo={logoFor(item.home_team_id, item.first_team_name)}
        awayLogo={logoFor(item.away_team_id, item.second_team_name)}
        starred={isFavoriteMatch(item.id)}
        onOpen={openMatch}
        onToggleStar={toggleFavoriteMatch}
      />
    ),
    [logoFor, isFavoriteMatch, openMatch, toggleFavoriteMatch]
  );

  const renderMatchSectionHeader = useCallback(
    ({ section }: { section: MatchSection }) => (
      <SectionHeader title={section.title} meta={`${section.data.length} maç`} />
    ),
    []
  );

  const renderTeam = useCallback(
    ({ item, index }: { item: FavoriteTeam; index: number }) => {
      const summary = teamSummaries.get(item.id);
      const parts: string[] = [];
      if (summary?.league) parts.push(summary.league);
      if (summary?.next) {
        parts.push(
          `${formatDayHeading(summary.next.date)} ${formatTime(summary.next.time)} · ${opponentName(
            summary.next,
            item
          )}`.trim()
        );
      } else {
        parts.push("Yaklaşan maç yok");
      }

      return (
        <FavoriteTeamRow
          team={item}
          subtitle={parts.join(" · ")}
          position={rowPosition(index, favorites.length)}
          onOpen={openTeam}
          onRemove={removeTeam}
        />
      );
    },
    [teamSummaries, favorites.length, openTeam, removeTeam]
  );

  const renderScope = useCallback(
    ({ item, index, section }: SectionListRenderItemInfo<FavoriteScope, ScopeSection>) => (
      <FavoriteScopeRow
        item={item}
        kind={section.kind}
        position={rowPosition(index, section.data.length)}
        onOpen={openScopeTab}
        onRemove={removeScope}
      />
    ),
    [openScopeTab, removeScope]
  );

  const renderScopeSectionHeader = useCallback(
    ({ section }: { section: ScopeSection }) => <SectionHeader title={section.title} />,
    []
  );

  const sectionFooter = useCallback(() => <View style={styles.sectionGap} />, []);

  /** Boş/yükleniyor/hata gövdesi — liste yerine değil, listenin İÇİNDE çizilir
   *  ki aşağı çekip yenileme her durumda çalışsın. */
  const matchesPlaceholder = loading ? (
    <SkeletonMatchRow count={6} />
  ) : firstError ? (
    <ErrorState error={firstError} onRetry={refetchAll} />
  ) : hasAnyFavorite ? (
    // Favori VAR ama pencerede maç yok: kullanıcıya "favorile" demek yanlış olur.
    <EmptyState
      icon="calendar-outline"
      title="Yaklaşan maç yok"
      body="Favorilerinin son 7 gün ve sonrası için maçı yok. Fikstür açılınca burada görünür."
      action={{ label: "Ligleri gez", onPress: openLeagues }}
    />
  ) : (
    <EmptyState
      icon="star-outline"
      title="Favori maçın yok"
      body="Takım veya lig favorile, maçları burada topla."
      action={{ label: "Ligleri gez", onPress: openLeagues }}
      secondaryAction={{ label: "Takım ara", onPress: openTeamSearch }}
    />
  );

  // Takım listesi cihazdan gelir (ağ yok): iskelet göstermek yanıltıcı olur.
  const teamsPlaceholder = (
    <EmptyState
      icon="shield-outline"
      title="Favori takımın yok"
      body="Takımını yıldızla; maçlarını, sonuçlarını ve gollerini kaçırma."
      action={{ label: "Takım ara", onPress: openTeamSearch }}
    />
  );

  const scopesPlaceholder = (
    <EmptyState
      icon="trophy-outline"
      title="Favori lig veya sezon yok"
      body="Ligi yıldızla; o ligin bütün maçları favorilerinde toplansın."
      action={{ label: "Ligleri gez", onPress: openLeagues }}
    />
  );

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      {header}

      {tab === "maclar" ? (
        <SectionList
          {...scrollProps}
          sections={sections}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderMatch}
          renderSectionHeader={renderMatchSectionHeader}
          renderSectionFooter={sectionFooter}
          stickySectionHeadersEnabled={false}
          ListHeaderComponent={guestBanner}
          ListEmptyComponent={matchesPlaceholder}
          contentContainerStyle={styles.content}
          refreshControl={refreshControl}
          initialNumToRender={12}
          windowSize={9}
        />
      ) : null}

      {tab === "takimlar" ? (
        <FlatList
          {...scrollProps}
          data={favorites}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderTeam}
          getItemLayout={(_, index) => ({
            length: layout.listRowHeightTwoLine,
            offset: layout.listRowHeightTwoLine * index,
            index,
          })}
          ListHeaderComponent={guestBanner}
          ListEmptyComponent={teamsPlaceholder}
          ListFooterComponent={
            // Liste boşken EmptyState'in kendi "Takım ara" eylemi var; iki ayrı
            // giriş noktası göstermek gürültü olur.
            favorites.length ? (
              <ListRow
                leading={{ icon: "add-circle-outline", tone: "brand" }}
                title="Takım ekle"
                position="single"
                onPress={openTeamSearch}
                style={styles.addRow}
              />
            ) : null
          }
          contentContainerStyle={styles.content}
          refreshControl={refreshControl}
        />
      ) : null}

      {tab === "ligler" ? (
        <SectionList
          {...scrollProps}
          sections={scopeSections}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderScope}
          renderSectionHeader={renderScopeSectionHeader}
          renderSectionFooter={sectionFooter}
          stickySectionHeadersEnabled={false}
          ListHeaderComponent={guestBanner}
          ListEmptyComponent={scopesPlaceholder}
          contentContainerStyle={styles.content}
          refreshControl={refreshControl}
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  segmentWrap: {
    paddingHorizontal: layout.screenPadding,
    paddingBottom: space.sm,
    backgroundColor: colors.bg,
  },
  content: {
    paddingHorizontal: layout.screenPadding,
    paddingBottom: layout.tabBarHeight + space.xxl,
    flexGrow: 1,
  },
  sectionGap: {
    height: layout.sectionGap,
  },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    padding: space.md,
    marginBottom: space.md,
    borderRadius: radius.lg,
  },
  bannerText: {
    ...type.bodySm,
    color: colors.textSecondary,
    flex: 1,
  },
  addRow: {
    marginTop: space.md,
  },
});
