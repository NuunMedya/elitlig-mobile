/**
 * OYUNCU PROFİLİ — `/oyuncu/[id]?tab=<genel|istatistik|maclar|kariyer>`
 *
 * NE: eski tek sütunlu, 1100 satırlık kaydırma şeridi dört segmente bölündü.
 * Bir oyuncu sayfasına gelen üç farklı soru vardı ve üçü de aynı akışın içine
 * gömülüydü: "bu oyuncu kim / bu sezon ne yaptı" (Genel), "rakamları nedir"
 * (İstatistik), "hangi maçlarda oynadı, kaç aldı" (Maçlar), "nereden geldi"
 * (Kariyer). Artık her soru kendi segmentinde ve yalnız o segmentin sorgusu
 * açılır.
 *
 * VERİ KAYNAKLARI (hepsi herkese açık uçlar):
 *   GET /api/players/:id                     kimlik + kariyer toplamları
 *   GET /api/players/:id/season-stats        sezon sezon tablo (kanonik uç)
 *   GET /api/players/:id/statistics          ayrıntılı toplamlar (asist, kurtarış…)
 *   GET /api/players/:id/market-value(+/history)  piyasa değeri ve seyri
 *   GET /oyuncu-istatistikleri/oyuncu/:id    maç maç kayıt + takım geçmişi
 *   GET /api/oyuncu-listesi                  kapsam içi sıralama (asist + sıra)
 *   GET /api/teams/:id                       amblem ve takım adı
 *
 * NEDEN `/oyuncu-istatistikleri/oyuncu/:id`: eski ekran "son maçlar" listesini
 * takımın maçlarını çekip HER MAÇIN KADROSUNU ayrı ayrı sorgulayarak kuruyordu
 * (1 + 6 istek, yalnız 6 maç, gol bilgisi yok). Bu uç aynı bilgiyi tek istekte,
 * TÜM maçlar için ve gol/kart/rakip/skor ile birlikte veriyor. Oyuncunun takım
 * geçmişi de (`profile.history.teams`) buradan gelir — Kariyer segmenti bunun
 * üstünde durur.
 *
 * İLETİŞİM BİLGİSİ: sunucu `phone`/`email` alanlarını yanıta YALNIZCA yetkili
 * görüntüleyiciye ekler (yönetim, oyuncunun kendisi, takımının başkanı —
 * routes/Players.js publicPlayer). Ekran bu kuralı yeniden uygulamaz; alan
 * geldiyse gösterir, gelmediyse bölüm hiç çizilmez.
 *
 * BOŞ ALAN İLKESİ (eski ekrandan korundu): veri yoksa satır tire ile sırıtmaz,
 * satırın kendisi çizilmez.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Sharing from "expo-sharing";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import ViewShot from "react-native-view-shot";
import {
  Avatar,
  Badge,
  BottomSheet,
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorState,
  FormChips,
  ListRow,
  ProgressRing,
  RatingPill,
  ScreenHeader,
  SectionHeader,
  SkeletonCard,
  SkeletonListRow,
  SkeletonTable,
  Sparkline,
  Tabs,
  TeamLogo,
  Touchable,
  useHeaderScroll,
  useRefresh,
  type FormResult,
  type TabItem,
  type Tone,
} from "@/components/ui";
import { getMatchKadro } from "@/lib/api/matches";
import { getPlayer, getPlayerRankings } from "@/lib/api/players";
import { getTeam } from "@/lib/api/teams";
import { formatAge, formatDateShort, formatMoney, mediaUrl } from "@/lib/format";
import { get } from "@/lib/http";
import { openLink } from "@/lib/links";
import { queryKeys } from "@/lib/queryKeys";
import { useScope } from "@/providers/ScopeProvider";
import {
  colors,
  elevate,
  fonts,
  hairline,
  layout,
  light,
  radius,
  space,
  textScale,
  type,
} from "@/theme";

/**
 * Mürekkep bloğun gradyan yönü — YATAY ve SAĞDAN SOLA.
 *
 * Köşegen ışık (0,0 → 1,1) buradaydı ve bloğa "boru" görünümü veriyordu:
 * köşeden köşeye giden bir geçiş, dikdörtgen bir yüzeyi silindir gibi
 * yuvarlıyor. Yön `GradientFill` ile birebir aynı olmak zorunda; aksi hâlde
 * aynı ekrandaki yüzeyler iki ayrı ışık kaynağından aydınlanmış gibi durur.
 */
const HERO_GRADIENT_START = { x: 1, y: 0.5 } as const;
const HERO_GRADIENT_END = { x: 0, y: 0.5 } as const;

/* ══════════════════════════════════════════════════════════════════════════
   1) EKRANA ÖZGÜ UÇ TANIMLARI

   `lib/api/players.ts` bu ekranın sorumluluğunda değil; profil sayfasının
   ihtiyacı olan dört uç burada, ekranla birlikte yaşar. Ortak bir ihtiyaç
   doğduğunda tek blok hâlinde api katmanına taşınabilir.
   ══════════════════════════════════════════════════════════════════════════ */

/** GET /api/players/:id/season-stats — services/playerSeasonStats.js. */
interface SeasonStatRow {
  season_id: number | null;
  season_label: string;
  matches: number;
  goals: number;
  /** Maç puanlarının toplamı (DECIMAL); ortalama = points / matches. */
  points: number;
  wins: number;
  draws: number;
  losses: number;
  yellow_cards: number;
}

const getSeasonStats = (playerId: number) =>
  get<SeasonStatRow[]>(`/api/players/${playerId}/season-stats`);

/** GET /api/players/:id/statistics — controllers/playerStatisticsController.js. */
interface DetailedStatistics {
  kadroda_bulundugu_mac_sayisi: number;
  oynadigi_mac_sayisi: number;
  ilk11_basladigi_mac_sayisi: number;
  yedek_basladigi_mac_sayisi: number;
  sonradan_oyuna_girdigi_mac_sayisi: number;
  kaptan_oldugu_mac_sayisi: number;
  toplam_puan: number;
  ortalama_puan: number;
  toplam_gol: number;
  sag_ayak_golu: number;
  sol_ayak_golu: number;
  kafa_golu: number;
  penalti_golu: number;
  frikik_golu: number;
  uzaktan_sag_ayak_golu: number;
  uzaktan_sol_ayak_golu: number;
  asist: number;
  kurtaris: number;
  yaratilan_pozisyon: number;
  kritik_blok: number;
  kazanilan_hava_topu: number;
  kazanilan_ikili_mucadele: number;
  faul: number;
  sari_kart: number;
  kirmizi_kart: number;
  sakatlik: number;
}

interface DetailedStatsResponse {
  success: boolean;
  playerId: number;
  statistics: DetailedStatistics;
  averages: {
    gol_ortalamasi: number;
    asist_ortalamasi: number;
    puan_ortalamasi: number;
    kurtaris_ortalamasi: number;
  };
}

const getDetailedStats = (playerId: number) =>
  get<DetailedStatsResponse>(`/api/players/${playerId}/statistics`);

/** GET /api/players/:id/market-value — services/marketValue/read.js. */
interface MarketValue {
  playerId: number;
  currentValue: number;
  previousValue: number | null;
  changeAmount: number;
  changePercentage: number;
  globalRank: number | null;
  cityRank: number | null;
  positionRank: number | null;
  percentile: number | null;
  positionGroup: string | null;
  lastCalculatedAt: string | null;
  currency: string;
}

const getMarketValue = (playerId: number) =>
  get<MarketValue>(`/api/players/${playerId}/market-value`);

interface MarketValueHistoryRow {
  id: number;
  current_value: number | string | null;
  createdAt: string;
}

const getMarketValueHistory = (playerId: number) =>
  get<{ items: MarketValueHistoryRow[] }>(`/api/players/${playerId}/market-value/history`, {
    limit: 16,
  });

/**
 * GET /oyuncu-istatistikleri/oyuncu/:id — services/playerProfileStats.js.
 * Maç maç kayıt + takım/lig/sezon geçmişi (`profile.history`).
 *
 * ALAN ADI SUNUCUDA BAŞKA: servis katmanı diziyi kendi içinde
 * `mergedStatistics` diye taşır, AMA rota onu yanıta yazarken
 * `playerStatistics` adıyla yazıyor (routes/PlayerStatistics.js). Bu ekran
 * uzun süre `mergedStatistics` okudu ve o anahtar yanıtta HİÇ YOKTU: dizi
 * daima `undefined` geliyor, `playedAppearances` boş dizi üretiyor ve
 * ekranın maçla ilgili BEŞ parçası birden sessizce boş çıkıyordu — form
 * şeridi, reyting grafiği, sezon tablosu, "Oynadığı maçlar" sekmesi ve
 * olay listesi. Kullanıcının gördüğü "maçlar gözükmüyor" buydu.
 *
 * NORMALİZASYON TEK YERDE: ham yanıt üç olası adı da tanır ve ekranın geri
 * kalanı yalnız `appearances` görür. Anahtarın adı yine değişirse düzeltme
 * altı çağrı yerine tek satırdır.
 */

/** Sunucudan gelen HAM yanıt — alan adı toleransı burada tiplenir. */
interface RawProfileStatsResponse {
  player_id: number;
  profile: { history: { teams: HistoryTeam[] }; appearances?: Appearance[] };
  /** Rotanın GERÇEKTEN yazdığı ad. */
  playerStatistics?: Appearance[] | null;
  /** Servisin iç adı — bazı sürümlerde yanıta bu adla düşüyor. */
  mergedStatistics?: Appearance[] | null;
}
interface HistoryTeam {
  id: number | null;
  name: string | null;
  logo: string | null;
  match_count: number;
  league_names: string[];
  season_names: string[];
}

interface AppearanceTeam {
  id: number | null;
  name: string | null;
  logo: string | null;
}

interface AppearanceMatch {
  id: number | null;
  date: string | null;
  time: string | null;
  status: string | null;
  home_team_id: number | null;
  away_team_id: number | null;
  home_team_name: string | null;
  away_team_name: string | null;
  home_team_score: number | null;
  away_team_score: number | null;
  league_name: string | null;
  season_name: string | null;
}

interface Appearance {
  match_id: number;
  team_id: number | null;
  number_of_goals: number;
  goals_minutes: string | null;
  yellow_card: number;
  red_card: number;
  goal_to_himself: number;
  /** Maç puanı (0–10). 0 = puanlanmamış. */
  points: number;
  played: boolean;
  lineup_is_starting: boolean | null;
  lineup_is_captain: boolean | null;
  played_for_team: AppearanceTeam | null;
  opponent_team: AppearanceTeam | null;
  season: { id: number | null; name: string | null } | null;
  league: { id: number | null; name: string | null } | null;
  match: AppearanceMatch | null;
}

/** Ekranın gördüğü NORMALİZE yanıt — dizi tek ve kesin bir adla durur. */
interface ProfileStatsResponse {
  player_id: number;
  profile: { history: { teams: HistoryTeam[] } };
  /** Maç maç kayıt. Sunucu hangi adı kullanırsa kullansın burada budur. */
  appearances: Appearance[];
}

const getProfileStats = async (playerId: number): Promise<ProfileStatsResponse> => {
  const raw = await get<RawProfileStatsResponse>(
    `/oyuncu-istatistikleri/oyuncu/${playerId}`
  );

  return {
    player_id: raw.player_id,
    profile: raw.profile,
    /* Sıra ÖNEMLİ: rotanın yazdığı ad önce denenir; `profile.appearances`
       aynı diziyi taşıyan ikinci kaynaktır; `mergedStatistics` ise sunucu
       o adı yanıta geri koyarsa diye durur. */
    appearances:
      raw.playerStatistics ?? raw.profile?.appearances ?? raw.mergedStatistics ?? [],
  };
};

/* Ekrana özgü önbellek anahtarları — paylaşılan olanlar `queryKeys` içinde. */
const key = {
  seasonStats: (id: number) => ["players", "season-stats", id] as const,
  detailedStats: (id: number) => ["players", "detailed-stats", id] as const,
  marketValue: (id: number) => ["players", "market-value", id] as const,
  marketHistory: (id: number) => ["players", "market-history", id] as const,
  profileStats: (id: number) => ["players", "profile-stats", id] as const,
};

/* ══════════════════════════════════════════════════════════════════════════
   2) SEGMENTLER VE ROTA PARAMETRESİ
   ══════════════════════════════════════════════════════════════════════════ */

type PlayerTab = "genel" | "istatistik" | "maclar" | "kariyer";

const TAB_ITEMS: TabItem<PlayerTab>[] = [
  { key: "genel", label: "Genel" },
  { key: "istatistik", label: "İstatistik" },
  { key: "maclar", label: "Maçlar" },
  { key: "kariyer", label: "Kariyer" },
];

const TAB_KEYS = TAB_ITEMS.map((item) => item.key);

/**
 * TUZAK (ligler.tsx ile aynı): `"İSTATİSTİK".toLocaleLowerCase("tr")` noktasız
 * ı üretir, düz `toLowerCase()` ise "İ" için birleşik nokta bırakır; ikisi de
 * ASCII rota anahtarıyla eşleşmez. Önce I ailesi katlanır, sonra küçültülür.
 */
function normalizeKey(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.trim().replace(/[İIı]/g, "i").toLowerCase();
}

/** Bildirimden/derin bağlantıdan gelen farklı yazımlar da doğru segmente düşer. */
const TAB_ALIASES: Record<string, PlayerTab> = {
  ozet: "genel",
  profil: "genel",
  overview: "genel",
  stats: "istatistik",
  istatistikler: "istatistik",
  matches: "maclar",
  mac: "maclar",
  career: "kariyer",
  gecmis: "kariyer",
  transferler: "kariyer",
};

function resolveTab(raw: unknown): PlayerTab {
  const normalized = normalizeKey(raw);
  if ((TAB_KEYS as string[]).includes(normalized)) return normalized as PlayerTab;
  return TAB_ALIASES[normalized] ?? "genel";
}

/** Sorgu parametresi tek değer ya da dizi olarak gelebilir. */
function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/* ══════════════════════════════════════════════════════════════════════════
   3) SAF YARDIMCILAR
   ══════════════════════════════════════════════════════════════════════════ */

const num = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/** Maç puanı 0 ise "puanlanmamış" demektir; reyting hapı boş görünsün. */
const ratingOf = (points: number): number | null => (points > 0 ? points : null);

/**
 * `active` sütunu BOOLEAN; MySQL sürücüsüne göre true, 1 ya da "1" gelebiliyor.
 * Alan hiç gelmediyse sunucu varsayılanı (aktif) kabul edilir.
 */
const isActive = (value: unknown): boolean => {
  if (value == null) return true;
  return value === true || value === 1 || value === "1" || value === "true";
};

/** Oyuncunun o maçtaki sonucu — kendi takımı esas alınır. */
function appearanceResult(row: Appearance): FormResult | null {
  const match = row.match;
  if (!match || match.home_team_score == null || match.away_team_score == null) return null;
  const isHome = match.home_team_id != null && match.home_team_id === row.team_id;
  const ours = isHome ? match.home_team_score : match.away_team_score;
  const theirs = isHome ? match.away_team_score : match.home_team_score;
  if (ours > theirs) return "W";
  if (ours < theirs) return "L";
  return "D";
}

/** Rakip adı: kayıt takım nesnesi taşımıyorsa maçın adlarından türetilir. */
function opponentName(row: Appearance): string {
  if (row.opponent_team?.name) return row.opponent_team.name;
  const match = row.match;
  if (!match) return "";
  const isHome = match.home_team_id != null && match.home_team_id === row.team_id;
  return String((isHome ? match.away_team_name : match.home_team_name) ?? "");
}

/** Kendi takımı - rakip sırasıyla skor. */
function appearanceScore(row: Appearance): string | null {
  const match = row.match;
  if (!match || match.home_team_score == null || match.away_team_score == null) return null;
  const isHome = match.home_team_id != null && match.home_team_id === row.team_id;
  return isHome
    ? `${match.home_team_score}-${match.away_team_score}`
    : `${match.away_team_score}-${match.home_team_score}`;
}

const timeOf = (row: Appearance): number => {
  const raw = row.match?.date;
  if (!raw) return 0;
  const parsed = Date.parse(String(raw).slice(0, 10));
  return Number.isFinite(parsed) ? parsed : 0;
};

/** Yeniden eskiye sıralı, gerçekten oynanmış maçlar. */
function playedAppearances(rows: Appearance[] | undefined): Appearance[] {
  return (rows ?? [])
    .filter((row) => row.played !== false && row.match != null)
    .sort((a, b) => timeOf(b) - timeOf(a));
}

/** Mevki → emoji (eski ekrandan korundu; mevki metni sunucudan serbest gelir). */

/** Grup içi konum — ListRow köşe yuvarlaması ve ayracı buradan gelir. */
function rowPosition(index: number, total: number): "single" | "first" | "middle" | "last" {
  if (total === 1) return "single";
  if (index === 0) return "first";
  if (index === total - 1) return "last";
  return "middle";
}

/* ══════════════════════════════════════════════════════════════════════════
   4) EKRAN KABUĞU
   ══════════════════════════════════════════════════════════════════════════ */

export default function PlayerDetailScreen() {
  const params = useLocalSearchParams<{ id: string; tab?: string }>();
  const router = useRouter();
  const { scrollY, scrollProps } = useHeaderScroll();

  const playerId = Number(params.id);
  const validId = Number.isFinite(playerId) && playerId > 0;

  const [tab, setTab] = useState<PlayerTab>(() => resolveTab(firstParam(params.tab)));
  const [shareOpen, setShareOpen] = useState(false);

  // Rota parametresi sonradan değişirse (derin bağlantı) görünüm ona uyar.
  const routeTab = resolveTab(firstParam(params.tab));
  useEffect(() => {
    setTab(routeTab);
    scrollY.setValue(0);
  }, [routeTab, scrollY]);

  const changeTab = useCallback(
    (next: PlayerTab) => {
      setTab(next);
      scrollY.setValue(0); // Yeni içeriğin tepesindeyiz; başlık yeniden açılsın.
      router.setParams({ tab: next });
    },
    [router, scrollY],
  );

  const playerQuery = useQuery({
    queryKey: queryKeys.player(playerId),
    queryFn: () => getPlayer(playerId),
    enabled: validId,
  });

  const player = playerQuery.data;

  const teamQuery = useQuery({
    queryKey: queryKeys.team(Number(player?.team_id)),
    queryFn: () => getTeam(Number(player?.team_id)),
    enabled: Boolean(player?.team_id),
    staleTime: 10 * 60_000,
  });

  const openShare = useCallback(() => setShareOpen(true), []);
  const closeShare = useCallback(() => setShareOpen(false), []);

  const actions = useMemo(
    () => [
      {
        icon: "share-social-outline" as const,
        onPress: openShare,
        accessibilityLabel: "Oyuncu kartını paylaş",
      },
    ],
    [openShare],
  );

  if (!validId) {
    return (
      <SafeAreaView style={styles.screen} edges={["top"]}>
        <ScreenHeader title="Oyuncu" back />
        <EmptyState
          icon="help-circle-outline"
          title="Oyuncu bulunamadı"
          body="Bağlantıdaki oyuncu numarası geçersiz."
          action={{ label: "Geri dön", onPress: () => router.back() }}
        />
      </SafeAreaView>
    );
  }

  if (playerQuery.isLoading) {
    return (
      <SafeAreaView style={styles.screen} edges={["top"]}>
        <ScreenHeader title="Oyuncu" back />
        <View style={styles.loadingBody}>
          <SkeletonCard lines={3} />
          <SkeletonTable count={4} columns={5} />
        </View>
      </SafeAreaView>
    );
  }

  if (playerQuery.isError || !player) {
    return (
      <SafeAreaView style={styles.screen} edges={["top"]}>
        <ScreenHeader title="Oyuncu" back />
        <ErrorState error={playerQuery.error} onRetry={playerQuery.refetch} />
      </SafeAreaView>
    );
  }

  const team = teamQuery.data ?? null;

  /*
   * SAVUNMA: `player_name` şemada zorunlu ama sunucu eksik/kısmi bir kayıt
   * döndürdüğünde (ör. 200 ile hata gövdesi) ekran `undefined.toLocaleUpperCase`
   * ile ÇÖKÜYORDU. Ad tek bir yerde güvenli hâle getirilir ve aşağıdaki tüm
   * kullanımlar bunu alır.
   */
  const playerName = player.player_name || "İsimsiz oyuncu";

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      {/* Alt başlık YOK: mevki, hemen altındaki kimlik kartında zaten yazıyor.
          İkisi arka arkaya durunca aynı iki satır ("Berkcan SIRT / Forvet")
          ekranda üst üste iki kez okunuyordu. Ad şeritte kalır — kaydırınca
          daralan başlıkta gereken tek bilgi odur. */}
      <ScreenHeader
        title={playerName}
        back
        actions={actions}
        scrollY={scrollY}
        tabs={<Tabs items={TAB_ITEMS} value={tab} onChange={changeTab} sticky />}
      />

      {tab === "genel" ? (
        <GeneralTab
          playerId={playerId}
          playerName={playerName}
          playerImage={player.player_img ?? null}
          position={player.player_position ?? null}
          birthDate={player.birth_date ?? null}
          nationality={player.nationality ?? null}
          active={isActive(player.active)}
          totalMatches={num(player.total_matches)}
          totalGoals={num(player.total_goals)}
          totalPoints={num(player.total_points)}
          wins={num(player.wins)}
          draws={num(player.draws)}
          losses={num(player.losses)}
          phone={player.phone ?? null}
          email={player.email ?? null}
          teamId={player.team_id ?? null}
          teamName={team?.team_name ?? null}
          teamLogo={team?.logo ?? null}
          refetchPlayer={playerQuery.refetch}
          isRefetching={playerQuery.isRefetching}
          scrollProps={scrollProps}
        />
      ) : tab === "istatistik" ? (
        <StatsTab
          playerId={playerId}
          totalMatches={num(player.total_matches)}
          totalGoals={num(player.total_goals)}
          totalPoints={num(player.total_points)}
          totalYellow={num(player.total_yellow_cards)}
          totalRed={num(player.total_red_cards)}
          scrollProps={scrollProps}
        />
      ) : tab === "maclar" ? (
        <MatchesTab playerId={playerId} scrollProps={scrollProps} />
      ) : (
        <CareerTab
          playerId={playerId}
          currentTeamId={player.team_id ?? null}
          scrollProps={scrollProps}
        />
      )}

      <ShareSheet
        visible={shareOpen}
        onClose={closeShare}
        playerName={playerName}
        playerImage={player.player_img ?? null}
        position={player.player_position ?? null}
        teamName={team?.team_name ?? null}
        matches={num(player.total_matches)}
        goals={num(player.total_goals)}
        points={num(player.total_points)}
        wins={num(player.wins)}
        draws={num(player.draws)}
        losses={num(player.losses)}
      />
    </SafeAreaView>
  );
}

/** Her segmentin listesine geçen ortak kaydırma bağlantısı. */
interface ScrollChrome {
  onScroll: (event: Parameters<ReturnType<typeof useHeaderScroll>["scrollProps"]["onScroll"]>[0]) => void;
  scrollEventThrottle: number;
}

/* ══════════════════════════════════════════════════════════════════════════
   5) GENEL — kimlik, sezon özeti, piyasa değeri, son 5 maç
   ══════════════════════════════════════════════════════════════════════════ */

interface GeneralTabProps {
  playerId: number;
  playerName: string;
  playerImage: string | null;
  position: string | null;
  birthDate: string | null;
  nationality: string | null;
  active: boolean;
  totalMatches: number;
  totalGoals: number;
  totalPoints: number;
  wins: number;
  draws: number;
  losses: number;
  phone: string | null;
  email: string | null;
  teamId: number | null;
  teamName: string | null;
  teamLogo: string | null;
  refetchPlayer: () => unknown;
  isRefetching: boolean;
  scrollProps: ScrollChrome;
}

function GeneralTab({
  playerId,
  playerName,
  playerImage,
  position,
  birthDate,
  nationality,
  active,
  totalMatches,
  totalGoals,
  totalPoints,
  wins,
  draws,
  losses,
  phone,
  email,
  teamId,
  teamName,
  teamLogo,
  refetchPlayer,
  isRefetching,
  scrollProps,
}: GeneralTabProps) {
  const router = useRouter();
  const scope = useScope();
  const { width } = useWindowDimensions();
  const refresh = useRefresh(refetchPlayer, { refreshing: isRefetching });
  /* Sparkline ölçüyü kendi hesaplamaz; ekran kenarları düşülür. */
  const trendWidth = width - layout.screenPadding * 2;

  /* Asist oyuncu ucunda yok; kapsam içi sıralama listesinden zenginleştirilir
     (bulunamazsa rakam hiç gösterilmez — eski ekranın kuralı korundu). */
  const scopeKey = useMemo(
    () => ({
      cityId: scope.cityId ?? undefined,
      leagueId: scope.leagueId ?? undefined,
      seasonId: scope.seasonId ?? undefined,
    }),
    [scope.cityId, scope.leagueId, scope.seasonId],
  );

  const rankingsQuery = useQuery({
    queryKey: queryKeys.playerRankings(scopeKey, "topScorers"),
    queryFn: () => getPlayerRankings(scopeKey, "topScorers"),
    enabled: scope.ready,
    staleTime: 5 * 60_000,
  });

  /* Türkiye geneli sıralama (kapsamsız) — hero'daki "TR n." rozetinin kaynağı. */
  const trRankQuery = useQuery({
    queryKey: queryKeys.playerRankings({}, "topScorers"),
    queryFn: () => getPlayerRankings({}, "topScorers"),
    staleTime: 10 * 60_000,
  });

  const profileQuery = useQuery({
    queryKey: key.profileStats(playerId),
    queryFn: () => getProfileStats(playerId),
    staleTime: 5 * 60_000,
    retry: false,
  });

  const marketQuery = useQuery({
    queryKey: key.marketValue(playerId),
    queryFn: () => getMarketValue(playerId),
    staleTime: 30 * 60_000,
    retry: false,
  });

  const historyQuery = useQuery({
    queryKey: key.marketHistory(playerId),
    queryFn: () => getMarketValueHistory(playerId),
    enabled: marketQuery.isSuccess,
    staleTime: 30 * 60_000,
    retry: false,
  });

  const assists = useMemo(() => {
    const row = rankingsQuery.data?.players?.find((item) => Number(item.id) === playerId);
    return row ? num(row.assists) : null;
  }, [rankingsQuery.data, playerId]);

  const trRank = useMemo(() => {
    const list = trRankQuery.data?.players ?? [];
    const index = list.findIndex((item) => Number(item.id) === playerId);
    return index >= 0 ? { rank: index + 1, total: list.length } : null;
  }, [trRankQuery.data, playerId]);

  /* Lig içi sıralamalar — zaten çekilen listeden türetilir, ek istek yok. */
  const ranks = useMemo(() => {
    const players = rankingsQuery.data?.players ?? [];
    if (players.length === 0) return null;
    const me = players.find((item) => Number(item.id) === playerId);
    if (!me) return null;
    const rankBy = (field: "points" | "goals") => {
      const sorted = [...players].sort((a, b) => num(b[field]) - num(a[field]));
      const index = sorted.findIndex((item) => Number(item.id) === playerId);
      return index >= 0 ? index + 1 : null;
    };
    const mates = players
      .filter((item) => Number(item.teamId) === Number(me.teamId))
      .sort((a, b) => num(b.points) - num(a.points));
    const mateIndex = mates.findIndex((item) => Number(item.id) === playerId);
    return {
      points: rankBy("points"),
      goals: rankBy("goals"),
      team: mateIndex >= 0 ? mateIndex + 1 : null,
      total: players.length,
    };
  }, [rankingsQuery.data, playerId]);

  const recent = useMemo(
    () => playedAppearances(profileQuery.data?.appearances).slice(0, 5),
    [profileQuery.data],
  );

  /*
    FORM GRAFİĞİ — son 10 maçın puan seyri, eskiden yeniye.

    Puanlanmamış maçlar (points = 0) DİZİYE HİÇ GİRMEZ; sıfır olarak
    çizilseydi grafik her puanlanmamış maçta tabana çakılır ve oyuncu kötü
    oynamış gibi görünürdü. Beş gerçek puan yoksa grafik hiç çizilmez —
    üç noktalı bir "seyir" seyir değildir.
  */
  const ratingTrend = useMemo(() => {
    const values = playedAppearances(profileQuery.data?.appearances)
      .slice(0, 10)
      .map((row) => ratingOf(num(row.points)))
      .filter((value): value is number => value != null)
      .reverse();
    return values.length >= 5 ? values : [];
  }, [profileQuery.data]);

  /* Form şeridi soldan sağa eskiden yeniye okunur. */
  const form = useMemo<FormResult[]>(
    () =>
      recent
        .map(appearanceResult)
        .filter((value): value is FormResult => value != null)
        .reverse(),
    [recent],
  );

  /* Forma numarası oyuncu kaydında yok; en son maçın kadrosundan okunur.
     Kadro sorgusu maç detayıyla aynı önbelleği paylaşır, ek maliyeti yok. */
  const lastMatchId = recent[0]?.match?.id ?? null;
  const kadroQuery = useQuery({
    queryKey: [...queryKeys.match(Number(lastMatchId)), "kadro"] as const,
    queryFn: () => getMatchKadro(Number(lastMatchId)),
    enabled: lastMatchId != null,
    staleTime: 60 * 60_000,
    retry: false,
  });

  const jersey = useMemo(() => {
    const kadro = kadroQuery.data;
    if (!kadro) return null;
    const all = [...(kadro.home ?? []), ...(kadro.away ?? [])];
    const me = all.find((row) => Number(row.playerId ?? row.oyuncu_id ?? row.id) === playerId);
    const parsed = Number(me?.number);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }, [kadroQuery.data, playerId]);

  const decided = wins + draws + losses;
  const winRate = decided > 0 ? wins / decided : null;
  const averageRating = totalMatches > 0 ? totalPoints / totalMatches : null;
  const age = formatAge(birthDate);

  const openTeam = useCallback(() => {
    if (teamId) router.push(`/takim/${teamId}`);
  }, [router, teamId]);

  const openMatch = useCallback(
    (matchId: number) => router.push(`/mac/${matchId}`),
    [router],
  );

  const market = marketQuery.data ?? null;

  return (
    <ScrollView
      {...scrollProps}
      contentContainerStyle={styles.content}
      refreshControl={refresh.control}
    >
      {/*
        ————— Kimlik —————

        DÜZEN: fotoğraf SOLDA, künye SAĞDA. Eski hâl her şeyi ortalıyordu ve
        ad, rozetler, künye alt alta dizilince blok ekranın üçte birini
        kaplıyordu; asıl veri (sezon rakamları) kaydırmadan görünmüyordu.

        FOTOĞRAF KARE: 88px dairesel bir fotoğraf, hemen altındaki dairesel
        TAKIM AMBLEMİYLE aynı silueti paylaşıyor ve ikisi bir an karışıyordu.
        Yuvarlatılmış kare oyuncuyu kulüpten ayırır.

        MÜREKKEP KART: kimlik bloğu koyu bir karttır — maç detayının skor
        şeridi ve takım profilinin kapağıyla aynı yüzey. Oyuncu adı burada
        `display` ölçeğindedir; bir profil sayfasının ilk söylediği şey kimin
        profili olduğudur.
      */}
      <View style={styles.hero}>
        <LinearGradient
          colors={colors.gradientInk}
          start={HERO_GRADIENT_START}
          end={HERO_GRADIENT_END}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <View style={styles.heroTop}>
          <Avatar
            name={playerName}
            image={mediaUrl(playerImage)}
            size={60}
            shape="square"
            jersey={jersey}
          />

          <View style={styles.heroIdentity}>
            <Text style={styles.heroName} numberOfLines={2} {...textScale.dense}>
              {playerName}
            </Text>

            {/* Künye tek satır, 11px: pozisyon · forma · yaş · uyruk. */}
            <Text style={styles.heroMeta} numberOfLines={2} {...textScale.dense}>
              {[
                position || null,
                jersey != null ? `#${jersey}` : null,
                age !== "—" ? `${age} yaş` : null,
                nationality || null,
              ]
                .filter(Boolean)
                .join(" · ") || "Künye girilmedi"}
            </Text>

            <View style={styles.heroBadges}>
              {/* Sunucuda ayrı bir "doğrulanmış" alanı yok; aktif oyuncu kaydı
                  lisanslı/doğrulanmış kaydın kendisidir (models/players.js). */}
              <Badge
                label={active ? "AKTİF" : "PASİF"}
                tone={active ? "win" : "neutral"}
                size="xs"
              />
              {trRank ? <Badge label={`TR ${trRank.rank}.`} tone="info" size="xs" /> : null}
            </View>
          </View>
        </View>

        {/* Takım satırı — dokununca takım profiline iner. */}
        {teamName ? (
          <Touchable
            feedback="card"
            haptic="selection"
            onPress={openTeam}
            accessibilityRole="button"
            accessibilityLabel={`${teamName} takım sayfası`}
            style={styles.heroTeam}
          >
            <TeamLogo name={teamName} logo={mediaUrl(teamLogo)} size={layout.crestLg} />
            <View style={styles.heroTeamBody}>
              <Text style={styles.heroTeamLabel} {...textScale.badge}>
                KULÜBÜ
              </Text>
              <Text style={styles.heroTeamName} numberOfLines={1} {...textScale.dense}>
                {teamName}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={14} color={colors.onDarkMuted} />
          </Touchable>
        ) : (
          <Badge label="TAKIMSIZ" tone="neutral" size="sm" />
        )}

        {/* Son maçların sonucu — künye yukarı taşındığı için burada yalnız bu kalır. */}
        {form.length ? (
          <View style={styles.metaRow}>
            <View style={styles.formBox}>
              <Text style={styles.heroMetaLabel} {...textScale.badge}>
                SON {form.length}
              </Text>
              <FormChips form={form} limit={5} size="xs" />
            </View>
          </View>
        ) : null}
      </View>

      {/* ————— Sezon özeti: büyük rakamlar ————— */}
      <View style={styles.bigRow}>
        <BigStat label="MAÇ" value={String(totalMatches)} />
        <View style={styles.bigDivider} />
        <BigStat label="GOL" value={String(totalGoals)} />
        {assists != null ? (
          <>
            <View style={styles.bigDivider} />
            <BigStat label="ASİST" value={String(assists)} />
          </>
        ) : null}
        <View style={styles.bigDivider} />
        <BigStat
          label="ORT. PUAN"
          value={averageRating != null ? averageRating.toFixed(1) : "—"}
          tone="brand"
        />
      </View>

      {/* ————— Form grafiği: son maçların puan seyri ————— */}
      {ratingTrend.length ? (
        <View style={styles.trend}>
          <View style={styles.trendHead}>
            <Text style={styles.metaLabel} {...textScale.badge}>
              SON {ratingTrend.length} MAÇ PUANI
            </Text>
            <Text style={styles.trendRange} {...textScale.dense}>
              {Math.min(...ratingTrend).toFixed(1)} – {Math.max(...ratingTrend).toFixed(1)}
            </Text>
          </View>
          <Sparkline values={ratingTrend} width={trendWidth} height={36} />
        </View>
      ) : null}

      {/* ————— Galibiyet dengesi ————— */}
      {decided > 0 ? (
        <Card title="Galibiyet dengesi" style={styles.card}>
          <View style={styles.balanceRow}>
            <ProgressRing
              value={winRate ?? 0}
              size={64}
              thickness={6}
              tone="win"
              label={winRate != null ? `%${Math.round(winRate * 100)}` : "—"}
              sublabel="galibiyet"
            />
            <View style={styles.balanceStats}>
              <BalanceLine label="Galibiyet" value={wins} total={decided} tone="win" />
              <BalanceLine label="Beraberlik" value={draws} total={decided} tone="neutral" />
              <BalanceLine label="Mağlubiyet" value={losses} total={decided} tone="danger" />
            </View>
          </View>
        </Card>
      ) : null}

      {/* ————— Piyasa değeri ————— */}
      {market ? (
        <MarketValueCard market={market} history={historyQuery.data?.items ?? []} />
      ) : null}

      {/* ————— Lig içi sıralamalar ————— */}
      {ranks ? (
        <>
          <SectionHeader title="Lig içi sıralama" meta={`${ranks.total} oyuncu`} />
          <View style={styles.rankRow}>
            {ranks.points != null ? (
              <RankTile label="PUAN" value={`${ranks.points}.`} />
            ) : null}
            {ranks.goals != null ? (
              <RankTile label="GOL KRALLIĞI" value={`${ranks.goals}.`} />
            ) : null}
            {ranks.team != null ? (
              <RankTile label="TAKIMINDA" value={`${ranks.team}.`} />
            ) : null}
          </View>
        </>
      ) : null}

      {/* ————— Başarı rozetleri ————— */}
      <Achievements
        goals={totalGoals}
        matches={totalMatches}
        winRate={winRate}
        pointsRank={ranks?.points ?? null}
        goalsRank={ranks?.goals ?? null}
      />

      {/* ————— Son 5 maç ————— */}
      <SectionHeader title="Son maçlar" meta={recent.length ? `${recent.length} maç` : undefined} />
      {profileQuery.isLoading ? (
        <SkeletonListRow count={4} />
      ) : recent.length === 0 ? (
        <EmptyState
          icon="football-outline"
          title="Kayıtlı maç yok"
          body="Oyuncunun yayınlanmış bir maç kaydı bulunmuyor."
          variant="inline"
          compact
        />
      ) : (
        <View style={styles.group}>
          {recent.map((row, index) => (
            <AppearanceRow
              key={row.match_id}
              row={row}
              position={rowPosition(index, recent.length)}
              onPress={openMatch}
            />
          ))}
        </View>
      )}

      {/* ————— İletişim: yalnız yetkili görüntüleyende alanlar yanıta girer ————— */}
      {phone || email ? (
        <>
          <SectionHeader title="İletişim" meta="Yalnız yetkili görür" />
          <View style={styles.group}>
            {phone ? (
              <ListRow
                leading={{ icon: "call", tone: "brand" }}
                title="Telefon"
                value={phone}
                position={email ? "first" : "single"}
                onPress={() => openLink(`tel:${phone}`)}
              />
            ) : null}
            {email ? (
              <ListRow
                leading={{ icon: "mail", tone: "brand" }}
                title="E-posta"
                value={email}
                position={phone ? "last" : "single"}
                onPress={() => openLink(`mailto:${email}`)}
              />
            ) : null}
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   6) İSTATİSTİK — sezon tablosu + kariyer toplamı + ayrıntı kırılımı
   ══════════════════════════════════════════════════════════════════════════ */

interface StatsTabProps {
  playerId: number;
  totalMatches: number;
  totalGoals: number;
  totalPoints: number;
  totalYellow: number;
  totalRed: number;
  scrollProps: ScrollChrome;
}

function StatsTab({
  playerId,
  totalMatches,
  totalGoals,
  totalPoints,
  totalYellow,
  totalRed,
  scrollProps,
}: StatsTabProps) {
  const seasonQuery = useQuery({
    queryKey: key.seasonStats(playerId),
    queryFn: () => getSeasonStats(playerId),
    staleTime: 5 * 60_000,
  });

  const detailQuery = useQuery({
    queryKey: key.detailedStats(playerId),
    queryFn: () => getDetailedStats(playerId),
    staleTime: 5 * 60_000,
    retry: false,
  });

  /* Kırmızı kart sezon ucunda yok; maç maç kayıttan sezon kırılımı çıkarılır. */
  const profileQuery = useQuery({
    queryKey: key.profileStats(playerId),
    queryFn: () => getProfileStats(playerId),
    staleTime: 5 * 60_000,
    retry: false,
  });

  const refresh = useRefresh(seasonQuery.refetch, { refreshing: seasonQuery.isRefetching });

  const redBySeason = useMemo(() => {
    const map = new Map<string, number>();
    playedAppearances(profileQuery.data?.appearances).forEach((row) => {
      const id = row.season?.id;
      if (id == null) return;
      map.set(String(id), (map.get(String(id)) ?? 0) + num(row.red_card));
    });
    return map;
  }, [profileQuery.data]);

  const seasons = seasonQuery.data ?? [];
  const stats = detailQuery.data?.statistics ?? null;

  /* Ayrıntı satırları: sıfır olan hiç çizilmez (boş alan tire ile sırıtmaz). */
  const detailRows = useMemo(() => {
    if (!stats) return [];
    const candidates: { label: string; value: number }[] = [
      { label: "Asist", value: stats.asist },
      { label: "İlk kadro başlangıcı", value: stats.ilk11_basladigi_mac_sayisi },
      { label: "Sonradan oyuna girdiği", value: stats.sonradan_oyuna_girdigi_mac_sayisi },
      { label: "Kaptanlık", value: stats.kaptan_oldugu_mac_sayisi },
      { label: "Kurtarış", value: stats.kurtaris },
      { label: "Yaratılan pozisyon", value: stats.yaratilan_pozisyon },
      { label: "Kritik blok", value: stats.kritik_blok },
      { label: "Kazanılan hava topu", value: stats.kazanilan_hava_topu },
      { label: "Kazanılan ikili mücadele", value: stats.kazanilan_ikili_mucadele },
      { label: "Faul", value: stats.faul },
      { label: "Sakatlık", value: stats.sakatlik },
    ];
    return candidates.filter((item) => num(item.value) > 0);
  }, [stats]);

  const goalTypes = useMemo(() => {
    if (!stats) return [];
    const candidates: { label: string; value: number }[] = [
      { label: "Sağ ayak", value: stats.sag_ayak_golu },
      { label: "Sol ayak", value: stats.sol_ayak_golu },
      { label: "Kafa", value: stats.kafa_golu },
      { label: "Penaltı", value: stats.penalti_golu },
      { label: "Frikik", value: stats.frikik_golu },
      { label: "Uzaktan (sağ)", value: stats.uzaktan_sag_ayak_golu },
      { label: "Uzaktan (sol)", value: stats.uzaktan_sol_ayak_golu },
    ];
    return candidates.filter((item) => num(item.value) > 0);
  }, [stats]);

  if (seasonQuery.isLoading) {
    return (
      <View style={styles.loadingBody}>
        <SkeletonTable count={5} columns={6} />
      </View>
    );
  }

  if (seasonQuery.isError) {
    return <ErrorState error={seasonQuery.error} onRetry={seasonQuery.refetch} />;
  }

  const careerAverage = totalMatches > 0 ? totalPoints / totalMatches : null;
  const maxGoalType = goalTypes.reduce((acc, item) => Math.max(acc, item.value), 0);

  return (
    <ScrollView
      {...scrollProps}
      contentContainerStyle={styles.content}
      refreshControl={refresh.control}
    >
      <SectionHeader title="Sezon sezon" meta={`${seasons.length} sezon`} />

      {seasons.length === 0 ? (
        <EmptyState
          icon="stats-chart-outline"
          title="Sezon kaydı yok"
          body="Oyuncunun yayınlanmış maçı olduğunda sezon tablosu burada oluşur."
          variant="inline"
        />
      ) : (
        <View style={styles.table}>
          {/* Başlık satırı — tüm sayısal sütunlar sabit genişlikte ve tabular. */}
          <View style={styles.tableHead}>
            <Text style={[styles.thText, styles.colSeason]} {...textScale.badge}>
              SEZON
            </Text>
            <Text style={[styles.thText, styles.colNum]} {...textScale.badge}>
              M
            </Text>
            <Text style={[styles.thText, styles.colNum]} {...textScale.badge}>
              G
            </Text>
            <Text style={[styles.thText, styles.colNum]} {...textScale.badge}>
              SK
            </Text>
            <Text style={[styles.thText, styles.colNum]} {...textScale.badge}>
              KK
            </Text>
            <Text style={[styles.thText, styles.colRating]} {...textScale.badge}>
              Ø
            </Text>
          </View>

          {seasons.map((season) => (
            <SeasonRow
              key={`${season.season_id ?? "yok"}-${season.season_label}`}
              row={season}
              red={redBySeason.get(String(season.season_id)) ?? 0}
            />
          ))}

          {/* Kariyer toplamı — oyuncu kaydındaki kanonik toplamlar. */}
          <View style={[styles.tableRow, styles.totalRow]}>
            <Text style={[styles.tdStrong, styles.colSeason]} numberOfLines={1} {...textScale.dense}>
              KARİYER
            </Text>
            <Text style={[styles.tdNumStrong, styles.colNum]} {...textScale.dense}>
              {totalMatches}
            </Text>
            <Text style={[styles.tdNumStrong, styles.colNum]} {...textScale.dense}>
              {totalGoals}
            </Text>
            <Text style={[styles.tdNumStrong, styles.colNum]} {...textScale.dense}>
              {totalYellow}
            </Text>
            <Text style={[styles.tdNumStrong, styles.colNum]} {...textScale.dense}>
              {totalRed}
            </Text>
            <View style={styles.colRating}>
              <RatingPill value={careerAverage} size="sm" />
            </View>
          </View>
        </View>
      )}

      <Text style={styles.tableNote} {...textScale.long}>
        M maç · G gol · SK sarı kart · KK kırmızı kart · Ø maç puanı ortalaması.
        Yalnızca yayınlanmış maçlar sayılır.
      </Text>

      {/* ————— Gol kırılımı ————— */}
      {goalTypes.length ? (
        <>
          <SectionHeader title="Golleri nasıl attı" meta={`${totalGoals} gol`} />
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

      {detailQuery.isError && seasons.length > 0 ? (
        <ErrorState
          error={detailQuery.error}
          onRetry={detailQuery.refetch}
          variant="banner"
          style={styles.banner}
        />
      ) : null}
    </ScrollView>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   7) MAÇLAR — oynadığı tüm maçlar, reyting ve gol/kart işaretleriyle
   ══════════════════════════════════════════════════════════════════════════ */

/** Satır yüksekliği sabittir; `getItemLayout` bundan kurulur. */
const APPEARANCE_ROW_HEIGHT = 56;

function MatchesTab({ playerId, scrollProps }: { playerId: number; scrollProps: ScrollChrome }) {
  const router = useRouter();

  const profileQuery = useQuery({
    queryKey: key.profileStats(playerId),
    queryFn: () => getProfileStats(playerId),
    staleTime: 5 * 60_000,
    retry: false,
  });

  const refresh = useRefresh(profileQuery.refetch, { refreshing: profileQuery.isRefetching });

  const rows = useMemo(
    () => playedAppearances(profileQuery.data?.appearances),
    [profileQuery.data],
  );

  const openMatch = useCallback((matchId: number) => router.push(`/mac/${matchId}`), [router]);

  const renderItem = useCallback(
    ({ item, index }: { item: Appearance; index: number }) => (
      <AppearanceRow row={item} position={rowPosition(index, rows.length)} onPress={openMatch} />
    ),
    [openMatch, rows.length],
  );

  const keyExtractor = useCallback((item: Appearance) => String(item.match_id), []);

  const getItemLayout = useCallback(
    (_data: ArrayLike<Appearance> | null | undefined, index: number) => ({
      length: APPEARANCE_ROW_HEIGHT,
      offset: APPEARANCE_ROW_HEIGHT * index,
      index,
    }),
    [],
  );

  if (profileQuery.isLoading) {
    return (
      <View style={styles.loadingBody}>
        <SkeletonListRow count={8} />
      </View>
    );
  }

  if (profileQuery.isError) {
    return (
      <EmptyState
        icon="football-outline"
        title="Maç kaydı yok"
        body="Bu oyuncu için kayıtlı maç istatistiği bulunamadı."
        action={{ label: "Tekrar dene", onPress: () => profileQuery.refetch(), haptic: "light" }}
      />
    );
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        icon="football-outline"
        title="Henüz maç yok"
        body="Oyuncu yayınlanmış bir maçta forma giydiğinde listesi burada oluşur."
      />
    );
  }

  /* Başlık listenin İÇİNDE değil ÜSTÜNDE duruyor: `getItemLayout` sabit satır
     yüksekliğinden kuruluyor ve liste başlığı bu hesabı bozardı. */
  return (
    <View style={styles.tabBody}>
      <View style={styles.tabHeading}>
        <SectionHeader title="Oynadığı maçlar" meta={`${rows.length} maç`} />
      </View>

      <FlatList
        {...scrollProps}
        data={rows}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        getItemLayout={getItemLayout}
        contentContainerStyle={styles.listContent}
        refreshControl={refresh.control}
        initialNumToRender={14}
        windowSize={9}
      />
    </View>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   8) KARİYER — takım geçmişi, transferler, disiplin kayıtları
   ══════════════════════════════════════════════════════════════════════════ */

function CareerTab({
  playerId,
  currentTeamId,
  scrollProps,
}: {
  playerId: number;
  currentTeamId: number | null;
  scrollProps: ScrollChrome;
}) {
  const router = useRouter();

  const profileQuery = useQuery({
    queryKey: key.profileStats(playerId),
    queryFn: () => getProfileStats(playerId),
    staleTime: 5 * 60_000,
    retry: false,
  });

  const refresh = useRefresh(profileQuery.refetch, { refreshing: profileQuery.isRefetching });

  const appearances = useMemo(
    () => playedAppearances(profileQuery.data?.appearances),
    [profileQuery.data],
  );

  const teams = profileQuery.data?.profile?.history?.teams ?? [];

  /**
   * Transferler: sunucuda herkese açık bir transfer geçmişi ucu yok. Maç maç
   * kayıt, oyuncunun HANGİ TAKIM ADINA oynadığını taşıdığı için takım
   * değişimleri kronolojik sırayla buradan çıkarılır — uydurma değil, oynanmış
   * maçların kanıtladığı geçişler.
   */
  const transfers = useMemo(() => {
    const ascending = [...appearances].sort((a, b) => timeOf(a) - timeOf(b));
    const list: { key: string; from: AppearanceTeam | null; to: AppearanceTeam; date: string | null }[] = [];
    let previous: AppearanceTeam | null = null;
    ascending.forEach((row) => {
      const team = row.played_for_team;
      if (!team?.id) return;
      if (previous?.id === team.id) return;
      list.push({
        key: `${row.match_id}-${team.id}`,
        from: previous,
        to: team,
        date: row.match?.date ?? null,
      });
      previous = team;
    });
    return list.reverse();
  }, [appearances]);

  /** Disiplin: kart görülen maçlar (herkese açık ceza ucu oyuncuya göre süzülemiyor). */
  const discipline = useMemo(
    () => appearances.filter((row) => num(row.yellow_card) > 0 || num(row.red_card) > 0),
    [appearances],
  );

  const openTeam = useCallback((teamId: number) => router.push(`/takim/${teamId}`), [router]);
  const openMatch = useCallback((matchId: number) => router.push(`/mac/${matchId}`), [router]);

  if (profileQuery.isLoading) {
    return (
      <View style={styles.loadingBody}>
        <SkeletonCard lines={3} />
        <SkeletonListRow count={5} />
      </View>
    );
  }

  if (profileQuery.isError || (teams.length === 0 && appearances.length === 0)) {
    return (
      <EmptyState
        icon="time-outline"
        title="Kariyer kaydı yok"
        body="Oyuncunun yayınlanmış maçı olduğunda takım geçmişi burada oluşur."
        action={
          profileQuery.isError
            ? { label: "Tekrar dene", onPress: () => profileQuery.refetch(), haptic: "light" }
            : undefined
        }
      />
    );
  }

  return (
    <ScrollView
      {...scrollProps}
      contentContainerStyle={styles.content}
      refreshControl={refresh.control}
    >
      {/* ————— Takım geçmişi ————— */}
      <SectionHeader title="Takım geçmişi" meta={`${teams.length} kulüp`} />
      <View style={styles.timeline}>
        {teams.map((team, index) => (
          <TimelineTeam
            key={`${team.id ?? "yok"}-${index}`}
            team={team}
            current={team.id != null && team.id === currentTeamId}
            first={index === 0}
            last={index === teams.length - 1}
            onPress={openTeam}
          />
        ))}
      </View>

      {/* ————— Transferler ————— */}
      {transfers.length > 1 ? (
        <>
          <SectionHeader title="Transferler" meta={`${transfers.length - 1} geçiş`} />
          <View style={styles.group}>
            {transfers
              .filter((item) => item.from != null)
              .map((item, index, list) => (
                <ListRow
                  key={item.key}
                  leading={{ icon: "swap-horizontal", tone: "info" }}
                  title={`${item.from?.name ?? "?"} → ${item.to.name ?? "?"}`}
                  subtitle={item.date ? formatDateShort(item.date) : undefined}
                  chevron={false}
                  position={rowPosition(index, list.length)}
                />
              ))}
          </View>
          <Text style={styles.tableNote} {...textScale.long}>
            Geçişler, oyuncunun forma giydiği maçlardan çıkarılır: ilk kez başka
            bir kulüp adına oynadığı maçın tarihi geçiş tarihi sayılır.
          </Text>
        </>
      ) : null}

      {/* ————— Disiplin ————— */}
      <SectionHeader
        title="Disiplin kayıtları"
        meta={discipline.length ? `${discipline.length} maç` : undefined}
      />
      {discipline.length === 0 ? (
        <EmptyState
          icon="shield-checkmark-outline"
          title="Kart görmedi"
          body="Oyuncunun kayıtlı sarı veya kırmızı kartı yok."
          variant="inline"
          compact
        />
      ) : (
        <View style={styles.group}>
          {discipline.slice(0, 20).map((row, index, list) => (
            <ListRow
              key={row.match_id}
              leading={{
                icon: num(row.red_card) > 0 ? "close-circle" : "square",
                tone: num(row.red_card) > 0 ? "danger" : "warn",
              }}
              title={opponentName(row) || "Maç"}
              subtitle={row.match?.date ? formatDateShort(row.match.date) : undefined}
              badge={
                <View style={styles.cardBadges}>
                  {num(row.yellow_card) > 0 ? (
                    <Badge label={`${row.yellow_card} SK`} tone="warn" size="xs" />
                  ) : null}
                  {num(row.red_card) > 0 ? (
                    <Badge label={`${row.red_card} KK`} tone="danger" size="xs" />
                  ) : null}
                </View>
              }
              position={rowPosition(index, Math.min(list.length, 20))}
              onPress={() => openMatch(row.match_id)}
            />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   9) ALT BİLEŞENLER
   ══════════════════════════════════════════════════════════════════════════ */

/** Büyük özet rakamı — `type.display` ile okunur, tabular hizalı. */
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

/** Kimlik künyesindeki küçük etiket–değer kutusu. */
const MetaChip = React.memo(function MetaChip({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <View style={styles.metaChip}>
      <Text style={styles.metaLabel} {...textScale.badge}>
        {label.toLocaleUpperCase("tr-TR")}
      </Text>
      <Text style={styles.metaValue} {...textScale.dense}>
        {value}
      </Text>
    </View>
  );
});

/** Galibiyet dengesinin tek satırı: oranlı çubuk + sayı. */
const BalanceLine = React.memo(function BalanceLine({
  label,
  value,
  total,
  tone,
}: {
  label: string;
  value: number;
  total: number;
  tone: Tone;
}) {
  const share = total > 0 ? value / total : 0;
  const fill =
    tone === "win" ? colors.win : tone === "danger" ? colors.loss : colors.draw;

  return (
    <View style={styles.balanceLine}>
      <Text style={styles.balanceLabel} numberOfLines={1} {...textScale.dense}>
        {label}
      </Text>
      <View style={styles.balanceTrack}>
        <View style={[styles.balanceFill, { flex: share, backgroundColor: fill }]} />
        <View style={{ flex: 1 - share }} />
      </View>
      <Text style={styles.balanceValue} {...textScale.dense}>
        {value}
      </Text>
    </View>
  );
});

/** Lig içi sıralama kutusu. */
const RankTile = React.memo(function RankTile({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <View style={styles.rankTile}>
      <Text style={styles.rankValue} {...textScale.dense}>
        {value}
      </Text>
      <Text style={styles.rankLabel} numberOfLines={1} {...textScale.badge}>
        {label}
      </Text>
    </View>
  );
});

/**
 * Piyasa değeri kartı — değer, değişim, sıralar ve son 16 ölçümün seyri.
 * Grafik SVG değil basit bir sütun şeridi: 16 nokta için kütüphane maliyeti
 * gereksiz, üstelik tema renkleriyle boyanabiliyor.
 */
const MarketValueCard = React.memo(function MarketValueCard({
  market,
  history,
}: {
  market: MarketValue;
  history: MarketValueHistoryRow[];
}) {
  const series = useMemo(() => {
    const values = [...history]
      .reverse()
      .map((item) => num(item.current_value))
      .filter((value) => value > 0);
    return values.slice(-16);
  }, [history]);

  const max = series.reduce((acc, value) => Math.max(acc, value), 0);
  const rising = market.changeAmount > 0;
  const falling = market.changeAmount < 0;

  return (
    <Card title="Piyasa değeri" style={styles.card}>
      <View style={styles.marketTop}>
        {/*
          TEK SATIR: "206.900.000 ETL" 34px'te iki satıra taşıp kartın yarısını
          kaplıyordu. Rakam satıra sığmıyorsa punto küçülür, satır BÖLÜNMEZ —
          para birimi rakamdan koparsa değer okunmaz hâle gelir.
        */}
        <Text
          style={styles.marketValue}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.6}
          {...textScale.dense}
        >
          {formatMoney(market.currentValue, market.currency)}
        </Text>
        {market.changeAmount !== 0 ? (
          <Badge
            label={`${rising ? "+" : ""}${market.changePercentage.toFixed(1)}%`}
            tone={rising ? "win" : falling ? "danger" : "neutral"}
            icon={rising ? "trending-up" : "trending-down"}
            size="sm"
          />
        ) : null}
      </View>

      {series.length > 1 ? (
        <View style={styles.spark}>
          {series.map((value, index) => (
            <View
              key={`${index}-${value}`}
              style={[
                styles.sparkBar,
                { height: Math.max(4, Math.round((value / (max || 1)) * 40)) },
                index === series.length - 1 && styles.sparkBarLast,
              ]}
            />
          ))}
        </View>
      ) : null}

      <View style={styles.marketRanks}>
        {market.globalRank != null ? (
          <MetaChip label="Türkiye" value={`${market.globalRank}.`} />
        ) : null}
        {market.cityRank != null ? (
          <MetaChip label="Şehir" value={`${market.cityRank}.`} />
        ) : null}
        {market.positionRank != null ? (
          <MetaChip label="Mevki" value={`${market.positionRank}.`} />
        ) : null}
        {market.percentile != null ? (
          <MetaChip label="Yüzdelik" value={`%${Math.round(market.percentile)}`} />
        ) : null}
      </View>
    </Card>
  );
});

/**
 * Eşiklerden otomatik kazanılan rozetler (eski ekrandan korundu).
 * Hiçbir eşik tutmuyorsa bölüm hiç çizilmez.
 */
const Achievements = React.memo(function Achievements({
  goals,
  matches,
  winRate,
  pointsRank,
  goalsRank,
}: {
  goals: number;
  matches: number;
  winRate: number | null;
  pointsRank: number | null;
  goalsRank: number | null;
}) {
  const badges = useMemo(() => {
    /* EMOJİ YOK: rozetlerin başında 👑 ⚽ 💯 gibi emojiler vardı. Emoji
       cihazın yazı tipine göre değişir, renk tokenlarına uymaz ve ekran
       okuyucuda "yüz" diye okunur. Anlamı metnin kendisi taşır; görsel
       ağırlık gerekiyorsa Badge'in kendi Ionicons ikonu kullanılır. */
    const list: { label: string; tone: Tone }[] = [];
    if (pointsRank === 1) list.push({ label: "Puan lideri", tone: "warn" });
    if (goalsRank === 1) list.push({ label: "Gol kralı", tone: "warn" });
    if (goals >= 100) list.push({ label: "100 gol kulübü", tone: "brand" });
    else if (goals >= 50) list.push({ label: "50+ gol", tone: "brand" });
    if (matches >= 100) list.push({ label: "100+ maç", tone: "info" });
    else if (matches >= 50) list.push({ label: "50+ maç", tone: "info" });
    if (winRate != null && winRate >= 0.6 && matches >= 10) {
      list.push({ label: "%60+ galibiyet", tone: "win" });
    }
    return list;
  }, [goals, goalsRank, matches, pointsRank, winRate]);

  if (badges.length === 0) return null;

  /* NEDEN Chip DEĞİL Badge: rozetler basılabilir değil; `Chip` onPress'siz
     kullanıldığında kendini devre dışı sayıp soluk boyanıyor. */
  return (
    <>
      <SectionHeader title="Başarılar" />
      <View style={styles.badgeWrap}>
        {badges.map((badge) => (
          <Badge key={badge.label} label={badge.label} tone={badge.tone} size="sm" />
        ))}
      </View>
    </>
  );
});

/** Tek maç satırı: tarih · rakip · skor · gol/kart · reyting. */
const AppearanceRow = React.memo(function AppearanceRow({
  row,
  position,
  onPress,
}: {
  row: Appearance;
  position: "single" | "first" | "middle" | "last";
  onPress: (matchId: number) => void;
}) {
  const handlePress = useCallback(() => onPress(row.match_id), [onPress, row.match_id]);

  const result = appearanceResult(row);
  const score = appearanceScore(row);
  const goals = num(row.number_of_goals);
  const ownGoals = num(row.goal_to_himself);
  const yellow = num(row.yellow_card);
  const red = num(row.red_card);

  const resultColor =
    result === "W" ? colors.win : result === "L" ? colors.loss : colors.draw;

  return (
    <Touchable
      feedback="row"
      haptic="selection"
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`${opponentName(row)} maçı, skor ${score ?? "yok"}`}
      style={[
        styles.appearRow,
        position === "first" && styles.groupFirst,
        position === "last" && styles.groupLast,
        position === "single" && styles.groupSingle,
        position !== "last" && position !== "single" && styles.groupDivider,
      ]}
    >
      {/* Sonuç rayı — G/B/M rengini satırın soluna taşır. */}
      <View style={[styles.resultRail, { backgroundColor: result ? resultColor : colors.border }]} />

      <View style={styles.appearDateBox}>
        <Text style={styles.appearDate} {...textScale.dense}>
          {row.match?.date ? formatDateShort(row.match.date) : "—"}
        </Text>
        {row.lineup_is_starting ? (
          <Text style={styles.appearRole} {...textScale.badge}>
            İLK 11
          </Text>
        ) : null}
      </View>

      <View style={styles.appearBody}>
        <Text style={styles.appearOpponent} numberOfLines={1} {...textScale.dense}>
          {opponentName(row).toLocaleUpperCase("tr-TR")}
        </Text>
        <View style={styles.appearMarks}>
          {goals > 0 ? <Mark icon="football" tone={colors.win} count={goals} /> : null}
          {ownGoals > 0 ? <Mark icon="football-outline" tone={colors.loss} count={ownGoals} /> : null}
          {yellow > 0 ? <Mark icon="square" tone={colors.yellowCard} count={yellow} /> : null}
          {red > 0 ? <Mark icon="square" tone={colors.redCard} count={red} /> : null}
          {row.lineup_is_captain ? <Mark icon="ribbon" tone={colors.brandAccent} count={0} /> : null}
        </View>
      </View>

      <Text style={styles.appearScore} {...textScale.dense}>
        {score ?? "—"}
      </Text>

      <RatingPill value={ratingOf(num(row.points))} size="sm" hideEmpty />
    </Touchable>
  );
});

/** Gol/kart işareti — sayı 1'den büyükse yanına adet yazılır. */
const Mark = React.memo(function Mark({
  icon,
  tone,
  count,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  tone: string;
  count: number;
}) {
  return (
    <View style={styles.mark}>
      <Ionicons name={icon} size={10} color={tone} />
      {count > 1 ? (
        <Text style={[styles.markCount, { color: tone }]} {...textScale.badge}>
          {count}
        </Text>
      ) : null}
    </View>
  );
});

/** Sezon tablosunun tek satırı. */
const SeasonRow = React.memo(function SeasonRow({
  row,
  red,
}: {
  row: SeasonStatRow;
  red: number;
}) {
  const average = row.matches > 0 ? row.points / row.matches : null;

  return (
    <View style={styles.tableRow}>
      <View style={styles.colSeason}>
        <Text style={styles.tdStrong} numberOfLines={1} {...textScale.dense}>
          {row.season_label}
        </Text>
        <Text style={styles.tdSub} numberOfLines={1} {...textScale.badge}>
          {row.wins}G · {row.draws}B · {row.losses}M
        </Text>
      </View>
      <Text style={[styles.tdNum, styles.colNum]} {...textScale.dense}>
        {row.matches}
      </Text>
      <Text style={[styles.tdNum, styles.colNum]} {...textScale.dense}>
        {row.goals}
      </Text>
      <Text style={[styles.tdNum, styles.colNum]} {...textScale.dense}>
        {row.yellow_cards}
      </Text>
      <Text style={[styles.tdNum, styles.colNum]} {...textScale.dense}>
        {red}
      </Text>
      <View style={styles.colRating}>
        <RatingPill value={average} size="sm" />
      </View>
    </View>
  );
});

/** Kariyer zaman çizelgesinin tek kulübü. */
const TimelineTeam = React.memo(function TimelineTeam({
  team,
  current,
  first,
  last,
  onPress,
}: {
  team: HistoryTeam;
  current: boolean;
  first: boolean;
  last: boolean;
  onPress: (teamId: number) => void;
}) {
  const handlePress = useCallback(() => {
    if (team.id != null) onPress(team.id);
  }, [onPress, team.id]);

  const seasons = team.season_names?.filter(Boolean) ?? [];
  const leagues = team.league_names?.filter(Boolean) ?? [];

  return (
    <Touchable
      feedback="row"
      haptic="selection"
      onPress={team.id != null ? handlePress : undefined}
      accessibilityRole="button"
      accessibilityLabel={`${team.name ?? "Takım"}, ${team.match_count} maç`}
      style={styles.timelineRow}
    >
      {/* Sol sütun: nokta + bağlantı çizgisi. */}
      <View style={styles.timelineRail}>
        <View style={[styles.timelineLine, first && styles.timelineLineHidden]} />
        <View style={[styles.timelineDot, current && styles.timelineDotCurrent]} />
        <View style={[styles.timelineLine, last && styles.timelineLineHidden]} />
      </View>

      <TeamLogo name={team.name} logo={mediaUrl(team.logo)} size={layout.crestLg} />

      <View style={styles.timelineBody}>
        <View style={styles.timelineHeadRow}>
          <Text style={styles.timelineName} numberOfLines={1} {...textScale.dense}>
            {team.name ?? "Takım"}
          </Text>
          {current ? <Badge label="GÜNCEL" tone="win" size="xs" /> : null}
        </View>
        {leagues.length ? (
          <Text style={styles.timelineMeta} numberOfLines={1} {...textScale.dense}>
            {leagues.join(" · ")}
          </Text>
        ) : null}
        {seasons.length ? (
          <Text style={styles.timelineMeta} numberOfLines={1} {...textScale.badge}>
            {seasons.join(", ")}
          </Text>
        ) : null}
      </View>

      <Text style={styles.timelineCount} {...textScale.dense}>
        {team.match_count}
      </Text>
    </Touchable>
  );
});

/* ══════════════════════════════════════════════════════════════════════════
   10) PAYLAŞ KARTI

   NEDEN SABİT RENK: bu kart ekran arayüzü değil, dışa aktarılan bir GÖRSELDİR.
   Koyu temadaki kullanıcı Instagram'a koyu zeminli, okunmaz bir kart
   göndermesin diye kartın paleti temadan bağımsız sabittir. Uygulama
   arayüzünün hiçbir yerinde sabit renk kullanılmaz; istisna burada başlar ve
   burada biter.
   ══════════════════════════════════════════════════════════════════════════ */

const SHARE = {
  ink: light.inverse,
  /** Yalnız DOLGU. Mercan metin olarak kağıt üstünde AA'yı geçmez. */
  brand: light.brand,
  brandDeep: light.brandStrong,
  /** Mercanın metin sürümü (koyu mercan, 4,70:1). */
  brandText: light.brandAccent,
  paperTop: light.brandDim,
  paperMid: light.bg,
  paperBottom: light.surface1,
  muted: light.textTertiary,
  panel: "rgba(255,255,255,0.72)",
} as const;

const SHARE_WIDTH = 272;
const SHARE_FORMATS = {
  story: { label: "Hikâye 9:16", height: Math.round((SHARE_WIDTH * 16) / 9) },
  post: { label: "Gönderi 3:4", height: Math.round((SHARE_WIDTH * 4) / 3) },
} as const;

type ShareFormat = keyof typeof SHARE_FORMATS;

function ShareSheet({
  visible,
  onClose,
  playerName,
  playerImage,
  position,
  teamName,
  matches,
  goals,
  points,
  wins,
  draws,
  losses,
}: {
  visible: boolean;
  onClose: () => void;
  playerName: string;
  playerImage: string | null;
  position: string | null;
  teamName: string | null;
  matches: number;
  goals: number;
  points: number;
  wins: number;
  draws: number;
  losses: number;
}) {
  const [format, setFormat] = useState<ShareFormat>("story");
  const [busy, setBusy] = useState(false);
  const shotRef = useRef<ViewShot | null>(null);

  const share = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const uri = await shotRef.current?.capture?.();
      if (uri) await Sharing.shareAsync(uri, { mimeType: "image/png" });
    } catch {
      // Paylaşım iptal edilebilir ya da cihazda paylaşım sayfası olmayabilir;
      // kullanıcı zaten sayfayı görüyor, ayrıca uyarı göstermeye gerek yok.
    } finally {
      setBusy(false);
    }
  }, [busy]);

  const average = matches > 0 ? (points / matches).toFixed(1) : "0.0";
  const perMatch = matches > 0 ? (goals / matches).toFixed(2) : "0.00";
  const decided = wins + draws + losses;

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Oyuncu kartını paylaş"
      snap="full"
      footer={
        <View style={styles.shareActions}>
          <Button label="Kapat" variant="secondary" onPress={onClose} style={styles.shareButton} />
          <Button
            label={busy ? "Hazırlanıyor…" : "Paylaş"}
            icon="share-social"
            loading={busy}
            onPress={share}
            style={styles.shareButton}
          />
        </View>
      }
    >
      <View style={styles.shareBodyWrap}>
        <View style={styles.shareFormats}>
          {(Object.keys(SHARE_FORMATS) as ShareFormat[]).map((item) => (
            <Chip
              key={item}
              label={SHARE_FORMATS[item].label}
              selected={format === item}
              size="sm"
              onPress={() => setFormat(item)}
            />
          ))}
        </View>

        <ViewShot ref={shotRef} options={{ format: "png", quality: 1 }}>
          <View style={[styles.shareCard, { height: SHARE_FORMATS[format].height }]}>
            {/* Düz dolgu — gradient yalnız okunabilirlik scrim'i için. */}
            <View style={styles.shareStrip} />
            {/* Düz kağıt: kartın üç duraklı gradyanı hiçbir bilgi taşımıyordu
                ve bu üründe gradient yalnız görsel üstü okunabilirlik scrim'i
                için meşru. */}
            <View style={styles.shareBody}>
              <View style={styles.shareHead}>
                <Text style={styles.shareBrand}>elitlig</Text>
                <Text style={styles.shareBrandRight}>ELİTLİG MOBİL</Text>
              </View>

              <Text style={styles.shareKicker}>OYUNCU PROFİLİ</Text>

              <View style={styles.shareIdentity}>
                <Avatar name={playerName} image={mediaUrl(playerImage)} size={56} />
                <View style={styles.shareIdentityBody}>
                  <Text style={styles.shareName} numberOfLines={2}>
                    {playerName.toLocaleUpperCase("tr-TR")}
                  </Text>
                  {teamName ? (
                    <Text style={styles.shareTeam} numberOfLines={1}>
                      {teamName}
                    </Text>
                  ) : null}
                  {position ? <Text style={styles.sharePosition}>{position}</Text> : null}
                </View>
              </View>

              <View style={styles.shareStats}>
                {[
                  { label: "MAÇ", value: String(matches) },
                  { label: "GOL", value: String(goals) },
                  { label: "ORT", value: average },
                  { label: "GOL/MAÇ", value: perMatch },
                ].map((item) => (
                  <View key={item.label} style={styles.shareStat}>
                    <Text style={styles.shareStatValue}>{item.value}</Text>
                    <Text style={styles.shareStatLabel}>{item.label}</Text>
                  </View>
                ))}
              </View>

              {decided > 0 ? (
                <View style={styles.shareSecondary}>
                  <Text style={styles.shareSecondaryText}>
                    {wins}G · {draws}B · {losses}M
                  </Text>
                </View>
              ) : null}

              <View style={styles.shareSpacer} />
              <Text style={styles.shareFooter}>ELİTLİG.COM</Text>
            </View>
          </View>
        </ViewShot>

        <Text style={styles.shareHint} {...textScale.long}>
          Görseli kaydetmek için: Paylaş → &quot;Görüntüyü Kaydet&quot;
        </Text>
      </View>
    </BottomSheet>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   11) STİLLER
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
  tabBody: {
    flex: 1,
  },
  tabHeading: {
    paddingHorizontal: layout.screenPadding,
  },
  loadingBody: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.md,
    gap: space.md,
  },
  banner: {
    marginTop: space.sm,
  },

  /* — Kimlik: mürekkep kart — */
  hero: {
    gap: space.md,
    padding: space.md,
    marginTop: space.s,
    ...elevate(2),
    borderWidth: 0,
    borderRadius: radius.xxl,
    overflow: "hidden",
    // Gradyan yüklenemezse düz mürekkep zemin altta durur. `elevate` kendi
    // zeminini taşıdığı için bu satır ondan SONRA gelmek zorunda.
    backgroundColor: colors.inkBlock,
  },
  /* Fotoğraf solda, künye sağda — blok ekranın üçte birini kaplamasın. */
  heroTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
  },
  heroIdentity: {
    flex: 1,
    gap: space.s,
  },
  heroName: {
    ...type.display,
    color: colors.onDark,
  },
  heroMeta: {
    ...type.bodySm,
    color: colors.onDarkMuted,
  },
  heroBadges: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.s,
  },
  /* Form grafiği: kutu değil, hairline ile ayrılmış bir şerit. */
  trend: {
    gap: space.s,
    paddingTop: space.md,
    paddingBottom: space.sm,
    borderTopWidth: hairline,
    borderTopColor: colors.border,
  },
  trendHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  trendRange: {
    ...type.tableNum,
    color: colors.textTertiary,
  },
  /* Kulüp satırı mürekkep kartın İÇİNDE: cam pul (beyazın %22'si + tebeşir). */
  heroTeam: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    alignSelf: "stretch",
    backgroundColor: colors.chalk,
    borderWidth: 1,
    borderColor: colors.chalk,
    borderRadius: radius.md,
    paddingHorizontal: space.m,
    paddingVertical: space.s,
  },
  heroTeamBody: {
    flex: 1,
    gap: 1,
  },
  /* Mürekkep kart üstünde marka rengi açık lavantadır. */
  heroTeamLabel: {
    ...type.overline,
    color: colors.brandOnDark,
  },
  heroTeamName: {
    ...type.h4,
    color: colors.onDark,
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: space.s,
  },
  metaChip: {
    alignItems: "center",
    backgroundColor: colors.surface2,
    borderRadius: radius.md,
    paddingHorizontal: space.m,
    paddingVertical: space.xs,
    minWidth: 56,
  },
  metaLabel: {
    ...type.overline,
    color: colors.textTertiary,
  },
  /** Aynı etiketin mürekkep kimlik kartı içindeki sürümü. */
  heroMetaLabel: {
    ...type.overline,
    color: colors.onDarkMuted,
  },
  metaValue: {
    ...type.tableNumStrong,
    color: colors.textPrimary,
  },
  formBox: {
    alignItems: "center",
    gap: 2,
    backgroundColor: colors.surface2,
    borderRadius: radius.md,
    paddingHorizontal: space.m,
    paddingVertical: space.xs,
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

  /* — Kart, grup — */
  card: {
    marginTop: space.xs,
  },
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

  /* — Galibiyet dengesi — */
  balanceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
  },
  balanceStats: {
    flex: 1,
    gap: space.s,
  },
  balanceLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  balanceLabel: {
    ...type.caption,
    color: colors.textSecondary,
    width: 74,
  },
  balanceTrack: {
    flex: 1,
    flexDirection: "row",
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
    backgroundColor: colors.surface3,
  },
  balanceFill: {
    height: 6,
  },
  balanceValue: {
    ...type.tableNumStrong,
    color: colors.textPrimary,
    minWidth: 22,
    textAlign: "right",
  },

  /* — Piyasa değeri — */
  marketTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  marketValue: {
    ...type.scoreLg,
    color: colors.textPrimary,
    flex: 1,
  },
  marketRanks: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.s,
    marginTop: space.sm,
  },
  spark: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 3,
    height: 44,
    marginTop: space.md,
  },
  sparkBar: {
    flex: 1,
    borderRadius: 2,
    backgroundColor: colors.brandDim,
  },
  sparkBarLast: {
    backgroundColor: colors.brand,
  },

  /* — Sıralama kutuları — */
  rankRow: {
    flexDirection: "row",
    gap: space.sm,
  },
  rankTile: {
    flex: 1,
    alignItems: "center",
    gap: 2,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingVertical: space.m,
  },
  rankValue: {
    ...type.scoreMd,
    color: colors.brandAccent,
  },
  rankLabel: {
    ...type.micro,
    color: colors.textTertiary,
  },

  /* — Maç satırı — */
  appearRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    height: APPEARANCE_ROW_HEIGHT,
    paddingRight: space.md,
    backgroundColor: colors.surface1,
  },
  resultRail: {
    width: 3,
    alignSelf: "stretch",
  },
  appearDateBox: {
    width: 52,
    paddingLeft: space.s,
  },
  appearDate: {
    ...type.tableNum,
    color: colors.textSecondary,
  },
  appearRole: {
    ...type.micro,
    color: colors.brandAccent,
  },
  appearBody: {
    flex: 1,
    gap: 2,
  },
  appearOpponent: {
    ...type.bodySm,
    fontFamily: fonts.bold,
    color: colors.textPrimary,
  },
  appearMarks: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.s,
  },
  mark: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  markCount: {
    ...type.micro,
  },
  appearScore: {
    ...type.scoreSm,
    color: colors.textPrimary,
    minWidth: 34,
    textAlign: "right",
  },

  /* — Sezon tablosu — */
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
  totalRow: {
    backgroundColor: colors.surface2,
  },
  colSeason: {
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
  tdNumStrong: {
    ...type.tableNumStrong,
    color: colors.textPrimary,
  },
  tableNote: {
    ...type.caption,
    color: colors.textTertiary,
    paddingHorizontal: space.xs,
    paddingTop: space.xs,
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
    width: 96,
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

  /* — Kariyer zaman çizelgesi — */
  timeline: {
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
    borderRadius: radius.lg,
    overflow: "hidden",
  },
  timelineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingRight: space.md,
    paddingVertical: space.m,
  },
  timelineRail: {
    width: 24,
    alignSelf: "stretch",
    alignItems: "center",
  },
  timelineLine: {
    flex: 1,
    width: hairline * 2,
    backgroundColor: colors.border,
  },
  timelineLineHidden: {
    backgroundColor: "transparent",
  },
  timelineDot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.textTertiary,
    marginVertical: 2,
  },
  timelineDotCurrent: {
    backgroundColor: colors.brand,
    width: 10,
    height: 10,
  },
  timelineBody: {
    flex: 1,
    gap: 1,
  },
  timelineHeadRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.s,
  },
  timelineName: {
    ...type.h3,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  timelineMeta: {
    ...type.caption,
    color: colors.textTertiary,
  },
  timelineCount: {
    ...type.tableNumStrong,
    color: colors.textSecondary,
    minWidth: 24,
    textAlign: "right",
  },
  cardBadges: {
    flexDirection: "row",
    gap: space.xs,
  },
  badgeWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.s,
    paddingVertical: space.xs,
  },

  /* — Paylaş kartı (sabit palet: dışa aktarılan görsel) — */
  shareBodyWrap: {
    alignItems: "center",
    gap: space.md,
    paddingBottom: space.md,
  },
  shareFormats: {
    flexDirection: "row",
    gap: space.sm,
  },
  shareCard: {
    width: SHARE_WIDTH,
    backgroundColor: SHARE.ink,
    borderRadius: radius.xl,
    padding: 7,
    overflow: "hidden",
  },
  shareStrip: {
    backgroundColor: SHARE.brand,
    height: 7,
    borderTopLeftRadius: radius.md,
    borderTopRightRadius: radius.md,
  },
  shareBody: {
    backgroundColor: SHARE.paperBottom,
    flex: 1,
    borderBottomLeftRadius: radius.md,
    borderBottomRightRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    gap: space.s,
    overflow: "hidden",
  },
  shareHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  shareBrand: {
    fontSize: 12,
    fontFamily: fonts.bold,
    color: SHARE.brand,
  },
  shareBrandRight: {
    fontSize: 7,
    fontFamily: fonts.bold,
    letterSpacing: 1.2,
    color: SHARE.brand,
    opacity: 0.7,
  },
  shareKicker: {
    fontSize: 8,
    fontFamily: fonts.bold,
    letterSpacing: 0.8,
    color: SHARE.brand,
    opacity: 0.85,
  },
  shareIdentity: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    backgroundColor: SHARE.panel,
    borderRadius: radius.lg,
    padding: space.sm,
  },
  shareIdentityBody: {
    flex: 1,
    gap: 2,
  },
  shareName: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: fonts.bold,
    color: SHARE.ink,
  },
  shareTeam: {
    fontSize: 9,
    fontFamily: fonts.bold,
    color: SHARE.brand,
  },
  sharePosition: {
    fontSize: 9,
    fontFamily: fonts.semibold,
    color: SHARE.muted,
  },
  shareStats: {
    flexDirection: "row",
    backgroundColor: SHARE.panel,
    borderRadius: radius.lg,
    padding: space.sm,
  },
  shareStat: {
    flex: 1,
    alignItems: "center",
    gap: 1,
  },
  shareStatValue: {
    fontSize: 15,
    fontFamily: fonts.bold,
    color: SHARE.brandText,
    fontVariant: ["tabular-nums"],
  },
  shareStatLabel: {
    fontSize: 7,
    fontFamily: fonts.bold,
    letterSpacing: 0.5,
    color: SHARE.muted,
  },
  shareSecondary: {
    alignSelf: "flex-start",
    backgroundColor: SHARE.panel,
    borderRadius: radius.md,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
  },
  shareSecondaryText: {
    fontSize: 10,
    fontFamily: fonts.bold,
    color: SHARE.brandText,
    fontVariant: ["tabular-nums"],
  },
  shareSpacer: {
    flex: 1,
  },
  shareFooter: {
    fontSize: 8,
    fontFamily: fonts.bold,
    letterSpacing: 2.5,
    color: SHARE.muted,
    textAlign: "center",
  },
  shareActions: {
    flexDirection: "row",
    gap: space.sm,
    alignSelf: "stretch",
  },
  shareButton: {
    flex: 1,
  },
  shareHint: {
    ...type.caption,
    color: colors.textTertiary,
  },
});
