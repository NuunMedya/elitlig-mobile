/**
 * OYUNCU PROFİLİ — `/oyuncu/[id]?tab=<genel|istatistik|maclar|kariyer>`
 *
 * Bir oyuncu sayfasına gelen dört soru, dört segment: "bu oyuncu kim / şu an
 * nasıl" (Genel), "rakamları nedir" (İstatistik), "hangi maçlarda oynadı, kaç
 * aldı" (Maçlar), "nereden geldi" (Kariyer). Yalnız açık segmentin sorgusu
 * çalışır.
 *
 * SABİT SEKMELER: Genel · İstatistik · Maçlar · Kariyer — veri durumuna göre
 * gizlenmez, sırası değişmez; verisi olmayan sekme kendi içinde boş durum
 * gösterir.
 *
 * EYLEMLER (detay sayfalarının ortak sözleşmesi):
 *   - PAYLAŞ başlığın SAĞ ÜSTÜNDE tek ikon ("share-outline" → oyuncu kartı
 *     alt sayfası, ViewShot + expo-sharing). Kimlik şeridinde tekrarı yok.
 *   - TAKİP: oyuncu takibi sunucuda yok; şerit oyuncunun TAKIMINI takip eder
 *     ("Takımını takip et") ve `useFollowFlow` ile bildirim türleri alt
 *     sayfasını açar; zil aynı alt sayfayı yeniden açar.
 *
 * ARENA DÜZENİ (docs/arena-tasarim-dili.md):
 *   - SAHNE (grafit başlık + `hero`): kimlik — mevki halkalı büyük fotoğraf,
 *     mevki etiketi, ad, kulüp hapı (dokununca takım), künye, tek panelde
 *     sayı şeridi (MAÇ · GOL · ASİST · ORT. PUAN), takım takip şeridi, sekmeler.
 *     Bkz. components/playerpage/PlayerHero.tsx.
 *   - KÂĞIT: her segment kendi kartları. Genel'in ilk kartı FORM'dur (son
 *     maçlar sütun sütun) çünkü bir oyuncu sayfasına bakanın ilk sorusu "şu
 *     an formda mı?"dır; piyasa değeri, galibiyet dengesi, sıralama ve
 *     başarılar onu izler.
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
 * İKİ KAYNAK, İKİ SAYI: oyuncu kaydının toplamları (`total_*`) yalnız
 * yayınlanmış ve puanlanmış maç satırlarından, ayrıntı ucu (`/statistics`)
 * tüm kadro/olay kayıtlarından sayar; ikisi farklı çıkabilir. Kimlik ve sezon
 * tablosu kanonik toplamları, "Ayrıntılı kayıt" kartları ayrıntı ucunu
 * kullanır ve kendi başlığıyla ayrılır — iki farklı sayı aynı etiketle yan
 * yana durmaz.
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
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Sharing from "expo-sharing";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import ViewShot from "react-native-view-shot";
import {
  Avatar,
  Badge,
  BottomSheet,
  Button,
  Chip,
  EmptyState,
  ErrorState,
  ListRow,
  ScreenHeader,
  SectionHeader,
  SkeletonCard,
  SkeletonListRow,
  SkeletonTable,
  Tabs,
  TeamLogo,
  Touchable,
  useHeaderScroll,
  useRefresh,
  type FormResult,
  type TabItem,
} from "@/components/ui";
import {
  Achievements,
  BarList,
  FormStrip,
  MarketValueCard,
  MatchLogRow,
  MATCH_LOG_ROW_HEIGHT,
  PlayerHero,
  StatList,
  StatTable,
  StatTiles,
  WinBalance,
  buildAchievements,
  dateWithYear,
  decimalTR,
  rowPosition,
  surfaces,
  type FormItem,
  type HeroFact,
  type StatLine,
  type StatRow,
  type StatTile,
} from "@/components/playerpage";
import { getPlayerCareer } from "@/lib/api/career";
import { getMatchKadro } from "@/lib/api/matches";
import { getPlayer, getPlayerRankings } from "@/lib/api/players";
import { positionLabel } from "@/lib/api/team";
import { getTeam } from "@/lib/api/teams";
import { formatAge, formatDateShort, mediaUrl } from "@/lib/format";
import { ApiError, get } from "@/lib/http";
import { openLink } from "@/lib/links";
import { queryKeys } from "@/lib/queryKeys";
import { useAuth } from "@/providers/AuthProvider";
import { useFavorite } from "@/providers/FavoriteProvider";
import { useFollowFlow } from "@/providers/FollowFlowProvider";
import { useScope } from "@/providers/ScopeProvider";
import { EliteCard } from "@/components/career/EliteCard";
import { FollowActions } from "@/components/FollowActions";
import {
  colors,
  dark,
  fonts,
  hairline,
  layout,
  light,
  radius,
  ratingLabel,
  space,
  textScale,
  type,
  upperTR,
} from "@/theme";

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

/**
 * TUZAK: geçmiş satırı değeri `new_value` adıyla taşır (eski/yeni değer çifti,
 * DECIMAL dize). Ekran uzun süre `current_value` okudu — alan yanıtta yok,
 * seri daima boş çıkıyor ve piyasa değeri grafiği hiç çizilmiyordu. İki ad
 * da tanınır; sıra önemli.
 */
interface MarketValueHistoryRow {
  id: number;
  new_value?: number | string | null;
  current_value?: number | string | null;
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

/**
 * Puanlanmış maçların sezon ortalaması — `season-stats` ucu puanlanmamış
 * maçı 0 puan sayıp ortalamayı aşağı çekiyor (1 maç, 0 puan → "0.0", kırmızı).
 * Maç maç kayıttan yalnız gerçek puanlar ortalanır; kayıt yoksa uç değeri.
 */
function ratedAverageBySeason(rows: Appearance[]): Map<string, number> {
  const acc = new Map<string, { sum: number; count: number }>();
  rows.forEach((row) => {
    const id = row.season?.id;
    const rating = ratingOf(num(row.points));
    if (id == null || rating == null) return;
    const entry = acc.get(String(id)) ?? { sum: 0, count: 0 };
    entry.sum += rating;
    entry.count += 1;
    acc.set(String(id), entry);
  });
  const out = new Map<string, number>();
  acc.forEach((value, keyId) => out.set(keyId, value.sum / value.count));
  return out;
}

/** Maç kaydı → ortak maç satırının düz alanları. */
function logRowProps(row: Appearance) {
  return {
    matchId: row.match_id,
    date: row.match?.date ?? null,
    opponent: opponentName(row),
    opponentLogo: row.opponent_team?.logo ?? null,
    score: appearanceScore(row),
    result: appearanceResult(row),
    rating: ratingOf(num(row.points)),
    goals: num(row.number_of_goals),
    ownGoals: num(row.goal_to_himself),
    yellow: num(row.yellow_card),
    red: num(row.red_card),
    started: Boolean(row.lineup_is_starting),
    captain: Boolean(row.lineup_is_captain),
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   4) EKRAN KABUĞU
   ══════════════════════════════════════════════════════════════════════════ */

export default function PlayerDetailScreen() {
  const params = useLocalSearchParams<{ id: string; tab?: string }>();
  const router = useRouter();
  const auth = useAuth();
  const scope = useScope();
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

  const team = teamQuery.data ?? null;
  const teamId = player?.team_id ?? null;

  /*
   * SAVUNMA: `player_name` şemada zorunlu ama sunucu eksik/kısmi bir kayıt
   * döndürdüğünde (ör. 200 ile hata gövdesi) ekran `undefined.toLocaleUpperCase`
   * ile ÇÖKÜYORDU. Ad tek bir yerde güvenli hâle getirilir ve aşağıdaki tüm
   * kullanımlar bunu alır.
   */
  const playerName = player?.player_name || "İsimsiz oyuncu";

  /*
   * KİMLİK BLOĞUNUN VERİSİ — ekran kabuğunda toplanır.
   *
   * Kimlik `ScreenHeader`ın `hero` yuvasında, yani sekmelerin DIŞINDA çizilir;
   * asist, TR sırası ve forma numarası gibi kimliğe giren parçalar bu yüzden
   * burada. Sekmeler aynı sorguların bir kısmını kendi işi için yine açar;
   * anahtar aynı olduğu için React Query tek istek atar.
   */
  const scopeKey = useMemo(
    () => ({
      cityId: scope.cityId ?? undefined,
      leagueId: scope.leagueId ?? undefined,
      seasonId: scope.seasonId ?? undefined,
    }),
    [scope.cityId, scope.leagueId, scope.seasonId],
  );

  /* Asist oyuncu ucunda yok; kapsam içi sıralama listesinden zenginleştirilir
     (bulunamazsa hücre hiç çizilmez — eski ekranın kuralı korundu). */
  const rankingsQuery = useQuery({
    queryKey: queryKeys.playerRankings(scopeKey, "topScorers"),
    queryFn: () => getPlayerRankings(scopeKey, "topScorers"),
    enabled: validId && scope.ready,
    staleTime: 5 * 60_000,
  });

  /* Türkiye geneli sıralama (kapsamsız) — künyedeki "TR n." rozetinin kaynağı. */
  const trRankQuery = useQuery({
    queryKey: queryKeys.playerRankings({}, "topScorers"),
    queryFn: () => getPlayerRankings({}, "topScorers"),
    enabled: validId,
    staleTime: 10 * 60_000,
  });

  /* Maç maç kayıt — en son maçın kimliği (forma numarası, mevki) için. */
  const profileQuery = useQuery({
    queryKey: key.profileStats(playerId),
    queryFn: () => getProfileStats(playerId),
    enabled: validId,
    staleTime: 5 * 60_000,
    retry: false,
  });

  const lastMatchId = useMemo(
    () => playedAppearances(profileQuery.data?.appearances)[0]?.match?.id ?? null,
    [profileQuery.data],
  );

  /* Forma numarası oyuncu kaydında yok, mevki de çoğu kayıtta boş; ikisi de
     en son maçın kadrosundan okunur. Kadro sorgusu maç detayıyla aynı
     önbelleği paylaşır, ek maliyeti yok. */
  const kadroQuery = useQuery({
    queryKey: [...queryKeys.match(Number(lastMatchId)), "kadro"] as const,
    queryFn: () => getMatchKadro(Number(lastMatchId)),
    enabled: lastMatchId != null,
    staleTime: 60 * 60_000,
    retry: false,
  });

  const assists = useMemo(() => {
    const row = rankingsQuery.data?.players?.find((item) => Number(item.id) === playerId);
    return row ? num(row.assists) : null;
  }, [rankingsQuery.data, playerId]);

  const trRank = useMemo(() => {
    const list = trRankQuery.data?.players ?? [];
    const index = list.findIndex((item) => Number(item.id) === playerId);
    return index >= 0 ? index + 1 : null;
  }, [trRankQuery.data, playerId]);

  /* Son kadrodaki satırım: forma no ve mevki buradan. Numara girilmemişse
     boş dize gelir (bkz. KadroPlayer.number) → null, rozet çizilmez. */
  const lineup = useMemo(() => {
    const kadro = kadroQuery.data;
    const all = [...(kadro?.home ?? []), ...(kadro?.away ?? [])];
    const me = all.find((row) => Number(row.playerId ?? row.oyuncu_id ?? row.id) === playerId);
    const parsed = Number(me?.number);
    return {
      jersey: Number.isFinite(parsed) && parsed > 0 ? parsed : null,
      position: String(me?.position ?? "").trim() || null,
    };
  }, [kadroQuery.data, playerId]);

  /*
   * MEVKİ İKİ KAYNAKTAN: oyuncu kaydındaki `player_position` çoğu kayıtta
   * boş (kadro girişinde doldurulmuyor), ama son maçın kadro satırı mevkiyi
   * taşıyor ("Forvet", "STP"). Kayıt söylüyorsa kayıt kazanır; yoksa
   * oynadığı son mevki — uydurma değil, kadroya yazılmış veri. İkisi de
   * boşsa halka nötr kalır ve etiket çizilmez.
   */
  const position = String(player?.player_position ?? "").trim() || lineup.position;

  const openTeam = useCallback(() => {
    if (teamId) router.push(`/takim/${teamId}`);
  }, [router, teamId]);
  const { isFavorite } = useFavorite();
  const flow = useFollowFlow();

  /*
   * TAKİP: oyuncu takibi sunucuda YOK; şerit oyuncunun TAKIMINI takip eder
   * (etiket bunu söyler). TAKİP = BİLDİRİM akışı: takip edilir ve o takımın
   * bildirim türleri alt sayfası açılır; zil aynı alt sayfayı yeniden açar.
   */
  const teamTarget = useMemo(
    () =>
      team && teamId
        ? { type: "team" as const, id: Number(teamId), name: team.team_name || "Takım", logo: team.logo ?? null }
        : null,
    [team, teamId],
  );
  const toggleTeamFollow = useCallback(() => {
    if (teamTarget) flow.toggle(teamTarget);
  }, [flow, teamTarget]);
  const openTeamNotifications = useCallback(() => {
    if (teamTarget) flow.openSettings(teamTarget);
  }, [flow, teamTarget]);

  const openShare = useCallback(() => setShareOpen(true), []);
  const closeShare = useCallback(() => setShareOpen(false), []);

  const totalMatches = num(player?.total_matches);
  const totalPoints = num(player?.total_points);
  const careerAverage = totalMatches > 0 && totalPoints > 0 ? totalPoints / totalMatches : null;

  const hero = useMemo(() => {
    if (!player) return null;
    const age = formatAge(player.birth_date ?? null);
    const facts: HeroFact[] = [
      { key: "matches", value: String(totalMatches), label: "MAÇ" },
      { key: "goals", value: String(num(player.total_goals)), label: "GOL" },
    ];
    if (assists != null) facts.push({ key: "assists", value: String(assists), label: "ASİST" });
    if (careerAverage != null) {
      facts.push({ key: "rating", value: ratingLabel(careerAverage), label: "ORT. PUAN", rating: careerAverage });
    }
    return (
      <PlayerHero
        name={playerName}
        image={player.player_img ?? null}
        position={position}
        jersey={lineup.jersey}
        teamName={team?.team_name ?? null}
        teamLogo={mediaUrl(team?.logo ?? null)}
        onOpenTeam={teamId ? openTeam : undefined}
        details={[player.city ?? null, age !== "—" ? `${age} yaş` : null]}
        badges={
          <>
            {/* Aktif kayıt varsayılan durumdur, rozeti gürültü olur; yalnız
                pasif kayıt söylenir. */}
            {!isActive(player.active) ? <Badge label="PASİF" tone="neutral" size="xs" /> : null}
            {trRank != null ? <Badge label={`TR ${trRank}.`} tone="brand" size="xs" icon="podium" /> : null}
          </>
        }
        facts={facts}
        actions={
          teamTarget ? (
            <FollowActions
              following={isFavorite(teamTarget.id)}
              onToggleFollow={toggleTeamFollow}
              onOpenNotifications={openTeamNotifications}
              labels={{ follow: "Takımını takip et", following: "Takımı takip ediliyor" }}
            />
          ) : null
        }
      />
    );
  }, [player, playerName, position, lineup.jersey, team, trRank, totalMatches, careerAverage, assists, openTeam, teamId, teamTarget, isFavorite, toggleTeamFollow, openTeamNotifications]);

  /* PAYLAŞ: her oyuncuda başlığın SAĞ ÜSTÜNDEKİ tek ikon (detay sayfalarının
     ortak sözleşmesi). Kimlik şeridinde tekrarı yok. */
  /* TEKLİF VER: yalnız takım başkanına ve başka takımın oyuncusunda görünür
     (kendi oyuncuna teklif verilmez). Form: /takimim/teklif-ver. */
  const managedTeamId = auth.user?.managed_team_id ?? null;
  const canOffer = Boolean(managedTeamId && player && Number(player.team_id) !== Number(managedTeamId));
  const openOffer = useCallback(() => {
    if (!player) return;
    router.push(`/takimim/teklif-ver?playerId=${player.id}&playerName=${encodeURIComponent(playerName)}`);
  }, [player, playerName, router]);

  const actions = useMemo(
    () => [
      ...(canOffer
        ? [{ icon: "swap-horizontal" as const, onPress: openOffer, accessibilityLabel: "Transfer teklifi ver" }]
        : []),
      {
        icon: "share-outline" as const,
        onPress: openShare,
        accessibilityLabel: "Oyuncu kartını paylaş",
      },
    ],
    [canOffer, openOffer, openShare],
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

  /* Yükleniyor: sahne başlık + kimliğin şeklini taklit eden iskelet. Kâğıt
     başlıkla açılıp veri gelince sahneye dönmek ekranı iki kez boyuyordu. */
  if (playerQuery.isLoading) {
    return (
      <SafeAreaView style={styles.screen} edges={["top"]}>
        <ScreenHeader title="Oyuncu" back variant="stage" hero={<HeroSkeleton />} />
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
        {/* 404 bir HATA değil, bir durumdur: "tekrar dene" yerine "geri dön". */}
        {playerQuery.isError && !(playerQuery.error instanceof ApiError && playerQuery.error.status === 404) ? (
          <ErrorState error={playerQuery.error} onRetry={playerQuery.refetch} />
        ) : (
          <EmptyState
            icon="person-outline"
            title="Oyuncu bulunamadı"
            body="Bu oyuncu kaydı silinmiş ya da yayından kaldırılmış olabilir."
            action={{ label: "Geri dön", onPress: () => router.back() }}
          />
        )}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      {/* Alt başlık YOK: mevki ve kulüp kimliğin içinde yazıyor. Başlık adı da
          açık hâlde çizilmez (kimlik taşıyor); kaydırıp daraltınca satıra
          gelir — bkz. ScreenHeader. */}
      <ScreenHeader
        title={playerName}
        back
        actions={actions}
        scrollY={scrollY}
        hero={hero}
        tabs={<Tabs items={TAB_ITEMS} value={tab} onChange={changeTab} sticky />}
      />

      {tab === "genel" ? (
        <GeneralTab
          playerId={playerId}
          totalMatches={totalMatches}
          totalGoals={num(player.total_goals)}
          careerAverage={careerAverage}
          wins={num(player.wins)}
          draws={num(player.draws)}
          losses={num(player.losses)}
          phone={player.phone ?? null}
          email={player.email ?? null}
          onOpenTab={changeTab}
          refetchPlayer={playerQuery.refetch}
          isRefetching={playerQuery.isRefetching}
          scrollProps={scrollProps}
        />
      ) : tab === "istatistik" ? (
        <StatsTab
          playerId={playerId}
          totalMatches={totalMatches}
          totalGoals={num(player.total_goals)}
          careerAverage={careerAverage}
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
        position={position}
        teamName={team?.team_name ?? null}
        matches={totalMatches}
        goals={num(player.total_goals)}
        average={careerAverage}
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

/**
 * Kimlik iskeleti — sahnenin üstünde, kimliğin ölçüsünde. `Skeleton` kâğıt
 * için ayarlı (açık gri); grafit sahnede parlayan beyaz kutular olurdu. Bu
 * yüzden yer tutucular sahnenin kendi cam tonuyla çizilir.
 */
function HeroSkeleton() {
  return (
    <View style={styles.heroSkeleton} accessibilityLabel="Oyuncu yükleniyor">
      <View style={styles.heroSkeletonTop}>
        <View style={[styles.stageBlock, styles.heroSkeletonAvatar]} />
        <View style={styles.heroSkeletonBody}>
          <View style={[styles.stageBlock, { width: 72, height: 12 }]} />
          <View style={[styles.stageBlock, { width: "80%", height: 22 }]} />
          <View style={[styles.stageBlock, styles.heroSkeletonPill]} />
        </View>
      </View>
      <View style={[styles.stageBlock, styles.heroSkeletonStrip]} />
    </View>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   5) GENEL — form, piyasa değeri, galibiyet dengesi, sıralama, başarılar
   ══════════════════════════════════════════════════════════════════════════ */

interface GeneralTabProps {
  playerId: number;
  totalMatches: number;
  totalGoals: number;
  careerAverage: number | null;
  wins: number;
  draws: number;
  losses: number;
  phone: string | null;
  email: string | null;
  onOpenTab: (tab: PlayerTab) => void;
  refetchPlayer: () => unknown;
  isRefetching: boolean;
  scrollProps: ScrollChrome;
}

/** Form kartındaki sütun sayısı — 390px'te altı sütun amblemle nefes alır. */
const FORM_COUNT = 6;

function GeneralTab({
  playerId,
  totalMatches,
  totalGoals,
  careerAverage,
  wins,
  draws,
  losses,
  phone,
  email,
  onOpenTab,
  refetchPlayer,
  isRefetching,
  scrollProps,
}: GeneralTabProps) {
  const router = useRouter();
  const scope = useScope();
  const refresh = useRefresh(refetchPlayer, { refreshing: isRefetching });

  /* Kapsam içi sıralama listesi — lig içi sıralar ve başarı rozetleri buradan
     türetilir (kimlikteki asist hücresi de aynı sorguyu kabukta paylaşır). */
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

  /* Elit Kart + bağlı üyenin Elit Seviyesi ve kariyer rozetleri (Kariyer Modu). */
  const careerQuery = useQuery({
    queryKey: ["career", "player", playerId],
    queryFn: () => getPlayerCareer(playerId),
    staleTime: 10 * 60_000,
    retry: false,
  });

  const historyQuery = useQuery({
    queryKey: key.marketHistory(playerId),
    queryFn: () => getMarketValueHistory(playerId),
    enabled: marketQuery.isSuccess,
    staleTime: 30 * 60_000,
    retry: false,
  });

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

  /* FORM — son maçlar, eskiden yeniye (sağdaki en son maç). Puanlanmamış
     maç sütunda kalır (oynandı), yalnız reyting hapı boş görünür. */
  const formItems: FormItem[] = useMemo(
    () =>
      playedAppearances(profileQuery.data?.appearances)
        .slice(0, FORM_COUNT)
        .reverse()
        .map((row) => ({
          matchId: row.match_id,
          opponent: opponentName(row) || "Rakip",
          opponentLogo: row.opponent_team?.logo ?? null,
          rating: ratingOf(num(row.points)),
          result: appearanceResult(row),
          dateLabel: row.match?.date ? formatDateShort(row.match.date) : "—",
          goals: num(row.number_of_goals),
        })),
    [profileQuery.data],
  );

  const marketSeries = useMemo(
    () =>
      [...(historyQuery.data?.items ?? [])]
        .reverse()
        .map((item) => num(item.new_value ?? item.current_value))
        .filter((value) => value > 0)
        .slice(-16),
    [historyQuery.data],
  );

  const decided = wins + draws + losses;
  const winRate = decided > 0 ? wins / decided : null;

  const achievements = useMemo(
    () =>
      buildAchievements({
        goals: totalGoals,
        matches: totalMatches,
        winRate,
        pointsRank: ranks?.points ?? null,
        goalsRank: ranks?.goals ?? null,
      }),
    [totalGoals, totalMatches, winRate, ranks],
  );

  const rankTiles: StatTile[] = useMemo(() => {
    if (!ranks) return [];
    const list: StatTile[] = [];
    if (ranks.points != null) list.push({ key: "points", value: `${ranks.points}.`, label: "PUAN" });
    if (ranks.goals != null) list.push({ key: "goals", value: `${ranks.goals}.`, label: "GOL" });
    if (ranks.team != null) list.push({ key: "team", value: `${ranks.team}.`, label: "TAKIMINDA" });
    return list;
  }, [ranks]);

  const openMatch = useCallback((matchId: number) => router.push(`/mac/${matchId}`), [router]);
  const seeAllMatches = useCallback(() => onOpenTab("maclar"), [onOpenTab]);

  const market = marketQuery.data ?? null;
  const nothingYet =
    !profileQuery.isLoading && formItems.length === 0 && !market && decided === 0 && achievements.length === 0;

  return (
    <ScrollView {...scrollProps} contentContainerStyle={styles.content} refreshControl={refresh.control}>
      {/* ————— Form: son maçlar sütun sütun ————— */}
      {profileQuery.isLoading ? (
        <SkeletonCard lines={3} />
      ) : formItems.length ? (
        <FormStrip
          items={formItems}
          onOpenMatch={openMatch}
          careerAverage={careerAverage}
          onSeeAll={seeAllMatches}
          slots={FORM_COUNT}
        />
      ) : null}

      {/* ————— Elit Kart ————— */}
      {careerQuery.data?.card ? <EliteCard card={careerQuery.data.card} level={careerQuery.data.level?.level ?? null} /> : null}

      {/* ————— Piyasa değeri ————— */}
      {market ? <MarketValueCard market={market} series={marketSeries} /> : null}

      {/* ————— Galibiyet dengesi ————— */}
      <WinBalance wins={wins} draws={draws} losses={losses} />

      {/* ————— Lig içi sıralama ————— */}
      {rankTiles.length ? (
        <>
          <SectionHeader style={styles.flushHeader} title="Lig içi sıralama" meta={`${ranks?.total ?? 0} oyuncu arasında`} />
          <StatTiles tiles={rankTiles} />
        </>
      ) : null}

      {/* ————— Başarılar ————— */}
      {achievements.length ? (
        <>
          <SectionHeader style={styles.flushHeader} title="Başarılar" meta={`${achievements.length} rozet`} />
          <Achievements items={achievements} />
        </>
      ) : null}

      {/* ————— Kariyer rozetleri (Kupa Dolabı) ————— */}
      {careerQuery.data?.achievements.length ? (
        <>
          <SectionHeader style={styles.flushHeader} title="Kupa dolabı" meta={`${careerQuery.data.achievements.length} kariyer rozeti`} />
          <View style={styles.trophies}>
            {careerQuery.data.achievements.map((item) => (
              <Badge key={item.code} label={item.title} tone={item.layer === "saha" ? "win" : item.layer === "tribun" ? "info" : "brand"} size="sm" />
            ))}
          </View>
        </>
      ) : null}

      {nothingYet ? (
        <EmptyState
          icon="football-outline"
          title="Henüz maç kaydı yok"
          body="Oyuncu yayınlanmış bir maçta forma giydiğinde formu ve rakamları burada oluşur."
          variant="inline"
        />
      ) : null}

      {/* ————— İletişim: yalnız yetkili görüntüleyende alanlar yanıta girer ————— */}
      {phone || email ? (
        <>
          <SectionHeader style={styles.flushHeader} title="İletişim" meta="Yalnız yetkili görür" />
          <View>
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
   6) İSTATİSTİK — vurgu şeridi, sezon tablosu, gol kırılımı, ayrıntılı kayıt
   ══════════════════════════════════════════════════════════════════════════ */

interface StatsTabProps {
  playerId: number;
  totalMatches: number;
  totalGoals: number;
  careerAverage: number | null;
  totalYellow: number;
  totalRed: number;
  scrollProps: ScrollChrome;
}

function StatsTab({
  playerId,
  totalMatches,
  totalGoals,
  careerAverage,
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

  /* Kırmızı kart sezon ucunda yok; maç maç kayıttan sezon kırılımı çıkarılır.
     Puanlanmış sezon ortalaması da buradan gelir (bkz. ratedAverageBySeason). */
  const profileQuery = useQuery({
    queryKey: key.profileStats(playerId),
    queryFn: () => getProfileStats(playerId),
    staleTime: 5 * 60_000,
    retry: false,
  });

  const refresh = useRefresh(seasonQuery.refetch, { refreshing: seasonQuery.isRefetching });

  const played = useMemo(() => playedAppearances(profileQuery.data?.appearances), [profileQuery.data]);

  const redBySeason = useMemo(() => {
    const map = new Map<string, number>();
    played.forEach((row) => {
      const id = row.season?.id;
      if (id == null) return;
      map.set(String(id), (map.get(String(id)) ?? 0) + num(row.red_card));
    });
    return map;
  }, [played]);

  const ratedBySeason = useMemo(() => ratedAverageBySeason(played), [played]);

  const seasons = seasonQuery.data ?? [];
  const stats = detailQuery.data?.statistics ?? null;
  const averages = detailQuery.data?.averages ?? null;

  const seasonRows: StatRow[] = useMemo(() => {
    const maxGoals = seasons.reduce((acc, row) => Math.max(acc, num(row.goals)), 0);
    return seasons.map((row) => {
      const idKey = String(row.season_id);
      const fallback = num(row.matches) > 0 && num(row.points) > 0 ? num(row.points) / num(row.matches) : null;
      return {
        key: `${row.season_id ?? "yok"}-${row.season_label}`,
        title: row.season_label,
        subtitle: `${num(row.wins)}G · ${num(row.draws)}B · ${num(row.losses)}M`,
        values: [num(row.matches), num(row.goals), num(row.yellow_cards), redBySeason.get(idKey) ?? 0],
        rating: ratedBySeason.get(idKey) ?? fallback,
        share: maxGoals > 0 ? num(row.goals) / maxGoals : undefined,
      };
    });
  }, [seasons, redBySeason, ratedBySeason]);

  /* Vurgu şeridi: kariyerin üç oranı. Kaynak öncelikle ayrıntı ucu (tüm
     kayıtlar); yoksa kanonik toplamlardan gol/maç. */
  const tiles: StatTile[] = useMemo(() => {
    const list: StatTile[] = [];
    if (stats && num(stats.oynadigi_mac_sayisi) > 0) {
      const playedCount = num(stats.oynadigi_mac_sayisi);
      list.push({
        key: "gpm",
        value: decimalTR(averages ? num(averages.gol_ortalamasi) : num(stats.toplam_gol) / playedCount, 2),
        label: "GOL / MAÇ",
      });
      list.push({
        key: "ga",
        value: String(num(stats.toplam_gol) + num(stats.asist)),
        label: "GOL + ASİST",
      });
      list.push({
        key: "start",
        value: `%${Math.round((num(stats.ilk11_basladigi_mac_sayisi) / playedCount) * 100)}`,
        label: "İLK 11",
      });
    } else if (totalMatches > 0) {
      list.push({ key: "gpm", value: decimalTR(totalGoals / totalMatches, 2), label: "GOL / MAÇ" });
    }
    return list;
  }, [stats, averages, totalMatches, totalGoals]);

  const goalTypes = useMemo(() => {
    if (!stats) return [];
    return [
      { label: "Sağ ayak", value: num(stats.sag_ayak_golu) },
      { label: "Sol ayak", value: num(stats.sol_ayak_golu) },
      { label: "Kafa", value: num(stats.kafa_golu) },
      { label: "Penaltı", value: num(stats.penalti_golu) },
      { label: "Frikik", value: num(stats.frikik_golu) },
      { label: "Uzaktan (sağ)", value: num(stats.uzaktan_sag_ayak_golu) },
      { label: "Uzaktan (sol)", value: num(stats.uzaktan_sol_ayak_golu) },
    ].filter((item) => item.value > 0);
  }, [stats]);

  /* Ayrıntılı kayıt üç kartta: oyun süresi, hücum-savunma, disiplin. Sıfır
     olan satır hiç çizilmez (boş alan tire ile sırıtmaz); boş kart da. */
  const detailGroups = useMemo(() => {
    if (!stats) return [];
    const playedCount = num(stats.oynadigi_mac_sayisi);
    const perMatch = (value: number) =>
      playedCount > 0 && value > 0 ? `${decimalTR(value / playedCount, 2)} / maç` : undefined;
    const pick = (lines: StatLine[]) => lines.filter((line) => line.value !== "0");
    return [
      {
        title: "Oyun süresi",
        meta: playedCount > 0 ? `${playedCount} maç` : undefined,
        lines: pick([
          { label: "Kadroda bulunduğu", value: String(num(stats.kadroda_bulundugu_mac_sayisi)) },
          { label: "Oynadığı", value: String(playedCount) },
          {
            label: "İlk 11 başladığı",
            value: String(num(stats.ilk11_basladigi_mac_sayisi)),
            share: playedCount > 0 ? num(stats.ilk11_basladigi_mac_sayisi) / playedCount : undefined,
          },
          { label: "Yedek başladığı", value: String(num(stats.yedek_basladigi_mac_sayisi)) },
          { label: "Sonradan oyuna girdiği", value: String(num(stats.sonradan_oyuna_girdigi_mac_sayisi)) },
          { label: "Kaptanlık", value: String(num(stats.kaptan_oldugu_mac_sayisi)) },
        ]),
      },
      {
        title: "Hücum ve savunma",
        lines: pick([
          { label: "Gol", value: String(num(stats.toplam_gol)), sub: perMatch(num(stats.toplam_gol)) },
          { label: "Asist", value: String(num(stats.asist)), sub: perMatch(num(stats.asist)) },
          { label: "Yaratılan pozisyon", value: String(num(stats.yaratilan_pozisyon)) },
          { label: "Kurtarış", value: String(num(stats.kurtaris)), sub: perMatch(num(stats.kurtaris)) },
          { label: "Kritik blok", value: String(num(stats.kritik_blok)) },
          { label: "Kazanılan hava topu", value: String(num(stats.kazanilan_hava_topu)) },
          { label: "Kazanılan ikili mücadele", value: String(num(stats.kazanilan_ikili_mucadele)) },
        ]),
      },
      {
        title: "Disiplin",
        lines: pick([
          { label: "Sarı kart", value: String(num(stats.sari_kart)) },
          { label: "Kırmızı kart", value: String(num(stats.kirmizi_kart)) },
          { label: "Faul", value: String(num(stats.faul)) },
          { label: "Sakatlık", value: String(num(stats.sakatlik)) },
        ]),
      },
    ].filter((group) => group.lines.length > 0);
  }, [stats]);

  if (seasonQuery.isLoading) {
    return (
      <View style={styles.loadingBody}>
        <SkeletonCard lines={2} />
        <SkeletonTable count={5} columns={6} />
      </View>
    );
  }

  if (seasonQuery.isError) {
    return <ErrorState error={seasonQuery.error} onRetry={seasonQuery.refetch} />;
  }

  return (
    <ScrollView {...scrollProps} contentContainerStyle={styles.content} refreshControl={refresh.control}>
      <StatTiles tiles={tiles} />

      <SectionHeader style={styles.flushHeader} title="Sezon sezon" meta={`${seasons.length} sezon`} />

      {seasons.length === 0 ? (
        <EmptyState
          icon="stats-chart-outline"
          title="Sezon kaydı yok"
          body="Oyuncunun yayınlanmış maçı olduğunda sezon tablosu burada oluşur."
          variant="inline"
        />
      ) : (
        <>
          <StatTable
            columns={[
              { key: "m", label: "M" },
              { key: "g", label: "G" },
              { key: "sk", label: "SK" },
              { key: "kk", label: "KK" },
            ]}
            rows={seasonRows}
            total={{
              title: "KARİYER",
              values: [totalMatches, totalGoals, totalYellow, totalRed],
              rating: careerAverage,
            }}
          />
          <Text style={styles.note} {...textScale.long}>
            M maç · G gol · SK sarı kart · KK kırmızı kart. Puan, yalnız puanlanmış
            maçların ortalamasıdır; çizgi sezonun gol payını gösterir.
          </Text>
        </>
      )}

      {/* ————— Gol kırılımı ————— */}
      {goalTypes.length ? (
        <>
          <SectionHeader style={styles.flushHeader} title="Golleri nasıl attı" />
          <BarList title="Gol türleri" meta={`${num(stats?.toplam_gol)} gol`} items={goalTypes} />
        </>
      ) : null}

      {/* ————— Ayrıntılı kayıt ————— */}
      {detailGroups.length ? (
        <>
          <SectionHeader style={styles.flushHeader} title="Ayrıntılı kayıt" meta="Tüm kadro ve olay kayıtları" />
          {detailGroups.map((group) => (
            <StatList key={group.title} title={group.title} meta={group.meta} lines={group.lines} />
          ))}
        </>
      ) : null}

      {detailQuery.isError && seasons.length > 0 ? (
        <ErrorState error={detailQuery.error} onRetry={detailQuery.refetch} variant="banner" />
      ) : null}
    </ScrollView>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   7) MAÇLAR — sezon gruplu maç günlüğü
   ══════════════════════════════════════════════════════════════════════════ */

/** Ay başlığının sabit yüksekliği — `getItemLayout` ofsetleri buradan. */
const SEASON_HEAD_HEIGHT = 52;

type MatchListItem =
  | { kind: "head"; key: string; title: string; caption: string }
  | { kind: "row"; key: string; row: Appearance; position: ReturnType<typeof rowPosition> };

const MONTH_NAMES = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];

/**
 * Maçları AYA göre gruplar (liste zaten yeniden eskiye sıralı).
 *
 * NEDEN AY, SEZON DEĞİL: amatör ligde bir oyuncu aynı hafta iki ayrı ligde
 * (iki ayrı kulüpte) oynayabiliyor; sezona göre ardışık gruplama listeyi
 * tek maçlık başlıklara bölüyordu ("2026 GÜZ · 1 maç", "15. SEZON · 1 maç"…).
 * Ay her zaman ardışıktır; maçın ligi/sezonu satırın kendi künyesinde yazar.
 */
function groupByMonth(rows: Appearance[]): MatchListItem[] {
  const groups: { key: string; title: string; rows: Appearance[] }[] = [];
  rows.forEach((row) => {
    const match = String(row.match?.date ?? "").match(/^(\d{4})-(\d{2})/);
    const groupKey = match ? `${match[1]}-${match[2]}` : "tarihsiz";
    const title = match ? `${MONTH_NAMES[Number(match[2]) - 1] ?? ""} ${match[1]}` : "Tarihsiz maçlar";
    const last = groups[groups.length - 1];
    if (last && last.key === groupKey) last.rows.push(row);
    else groups.push({ key: groupKey, title, rows: [row] });
  });

  const items: MatchListItem[] = [];
  groups.forEach((group, groupIndex) => {
    const goals = group.rows.reduce((acc, row) => acc + num(row.number_of_goals), 0);
    const wins = group.rows.filter((row) => appearanceResult(row) === "W").length;
    const caption = [`${group.rows.length} maç`, wins > 0 ? `${wins} galibiyet` : null, goals > 0 ? `${goals} gol` : null]
      .filter(Boolean)
      .join(" · ");
    items.push({ kind: "head", key: `h-${groupIndex}-${group.key}`, title: group.title, caption });
    group.rows.forEach((row, index) => {
      items.push({
        kind: "row",
        key: `r-${row.match_id}-${groupIndex}`,
        row,
        position: rowPosition(index, group.rows.length),
      });
    });
  });
  return items;
}

function MatchesTab({ playerId, scrollProps }: { playerId: number; scrollProps: ScrollChrome }) {
  const router = useRouter();

  const profileQuery = useQuery({
    queryKey: key.profileStats(playerId),
    queryFn: () => getProfileStats(playerId),
    staleTime: 5 * 60_000,
    retry: false,
  });

  const refresh = useRefresh(profileQuery.refetch, { refreshing: profileQuery.isRefetching });

  const rows = useMemo(() => playedAppearances(profileQuery.data?.appearances), [profileQuery.data]);
  const items = useMemo(() => groupByMonth(rows), [rows]);

  /* Özet şeridi: listenin tamamından türetilir — uydurma yok. */
  const summary: StatTile[] = useMemo(() => {
    if (rows.length === 0) return [];
    const goals = rows.reduce((acc, row) => acc + num(row.number_of_goals), 0);
    const rated = rows.map((row) => ratingOf(num(row.points))).filter((v): v is number => v != null);
    const wins = rows.filter((row) => appearanceResult(row) === "W").length;
    const list: StatTile[] = [
      { key: "m", value: String(rows.length), label: "MAÇ" },
      { key: "g", value: String(goals), label: "GOL" },
      { key: "w", value: `%${Math.round((wins / rows.length) * 100)}`, label: "GALİBİYET" },
    ];
    if (rated.length) {
      list.push({
        key: "r",
        value: ratingLabel(rated.reduce((acc, v) => acc + v, 0) / rated.length),
        label: "ORT. PUAN",
      });
    }
    return list;
  }, [rows]);

  /* Özet şeridi listenin BAŞLIĞIDIR (liste ile birlikte kayar); yüksekliği
     ölçülür ve satır ofsetlerine eklenir. */
  const [headHeight, setHeadHeight] = useState(0);

  /* Sabit yükseklikli iki satır türü → ofsetler bir kez hesaplanır. */
  const offsets = useMemo(() => {
    const out: number[] = [];
    let acc = headHeight;
    items.forEach((item) => {
      out.push(acc);
      acc += item.kind === "head" ? SEASON_HEAD_HEIGHT : MATCH_LOG_ROW_HEIGHT;
    });
    return out;
  }, [items, headHeight]);

  const openMatch = useCallback((matchId: number) => router.push(`/mac/${matchId}`), [router]);

  const renderItem = useCallback(
    ({ item }: { item: MatchListItem }) =>
      item.kind === "head" ? (
        <View style={styles.seasonHead}>
          <Text style={styles.seasonTitle} numberOfLines={1} {...textScale.dense}>
            {item.title}
          </Text>
          <Text style={styles.seasonCaption} numberOfLines={1} {...textScale.dense}>
            {item.caption}
          </Text>
        </View>
      ) : (
        <MatchLogRow
          {...logRowProps(item.row)}
          venue={item.row.season?.name ?? item.row.match?.season_name ?? null}
          position={item.position}
          onPress={openMatch}
        />
      ),
    [openMatch],
  );

  const keyExtractor = useCallback((item: MatchListItem) => item.key, []);

  const getItemLayout = useCallback(
    (_data: ArrayLike<MatchListItem> | null | undefined, index: number) => ({
      length: items[index]?.kind === "head" ? SEASON_HEAD_HEIGHT : MATCH_LOG_ROW_HEIGHT,
      offset: offsets[index] ?? 0,
      index,
    }),
    [items, offsets],
  );

  if (profileQuery.isLoading) {
    return (
      <View style={styles.loadingBody}>
        <SkeletonCard lines={1} />
        <SkeletonListRow count={8} />
      </View>
    );
  }

  if (profileQuery.isError) {
    return (
      <EmptyState
        icon="football-outline"
        title="Maç kaydı alınamadı"
        body="Bu oyuncunun maç kayıtlarına şu an ulaşılamıyor."
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

  return (
    <FlatList
      {...scrollProps}
      data={items}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      getItemLayout={getItemLayout}
      contentContainerStyle={styles.listContent}
      refreshControl={refresh.control}
      initialNumToRender={14}
      windowSize={9}
      ListHeaderComponent={
        <View style={styles.matchesSummary} onLayout={(event) => setHeadHeight(event.nativeEvent.layout.height)}>
          <StatTiles tiles={summary} />
        </View>
      }
    />
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   8) KARİYER — özet, kulüp zaman çizelgesi, transferler, disiplin
   ══════════════════════════════════════════════════════════════════════════ */

/** Kariyer geçişlerinde ilk bakışta görünen satır sayısı. */
const TRANSFER_PREVIEW = 6;

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

  const appearances = useMemo(() => playedAppearances(profileQuery.data?.appearances), [profileQuery.data]);

  const teams = useMemo(() => profileQuery.data?.profile?.history?.teams ?? [], [profileQuery.data]);

  /** Kariyer özeti — takım geçmişinden türetilir (ad tekrarları büyük harfle katlanır). */
  const summary: StatTile[] = useMemo(() => {
    if (teams.length === 0) return [];
    const leagues = new Set<string>();
    const seasons = new Set<string>();
    let matches = 0;
    teams.forEach((team) => {
      (team.league_names ?? []).filter(Boolean).forEach((name) => leagues.add(upperTR(name)));
      (team.season_names ?? []).filter(Boolean).forEach((name) => seasons.add(upperTR(name)));
      matches += num(team.match_count);
    });
    const list: StatTile[] = [{ key: "clubs", value: String(teams.length), label: "KULÜP" }];
    if (leagues.size) list.push({ key: "leagues", value: String(leagues.size), label: "LİG" });
    if (seasons.size) list.push({ key: "seasons", value: String(seasons.size), label: "DÖNEM" });
    if (matches) list.push({ key: "matches", value: String(matches), label: "MAÇ" });
    return list;
  }, [teams]);

  const maxTeamMatches = useMemo(
    () => teams.reduce((acc, team) => Math.max(acc, num(team.match_count)), 0),
    [teams],
  );

  /**
   * Transferler: sunucuda herkese açık bir transfer geçmişi ucu yok. Maç maç
   * kayıt, oyuncunun HANGİ TAKIM ADINA oynadığını taşıdığı için geçişler
   * buradan çıkarılır — uydurma değil, oynanmış maçların kanıtladığı geçişler.
   *
   * NEDEN KULÜP BAŞINA BİR GEÇİŞ: amatör ligde oyuncu aynı dönemde iki ayrı
   * ligde iki ayrı kulüpte oynayabiliyor. "Her takım değişimi bir transfer"
   * sayılınca liste RED POWER → PAUL KENZİE → RED POWER … diye onlarca sahte
   * geçişle doluyordu. Artık her kulüp için YALNIZ İLK maç (kulübe katılış)
   * sayılır; "nereden" o maçtan önce en son forma giydiği kulüptür.
   */
  const transfers = useMemo(() => {
    const ascending = [...appearances].sort((a, b) => timeOf(a) - timeOf(b));
    const seen = new Set<number>();
    const list: { key: string; from: AppearanceTeam | null; to: AppearanceTeam; date: string | null }[] = [];
    let previous: AppearanceTeam | null = null;
    ascending.forEach((row) => {
      const team = row.played_for_team;
      if (!team?.id) return;
      if (!seen.has(team.id)) {
        seen.add(team.id);
        /* İlk kulüp bir "geçiş" değil, kariyerin başlangıcıdır — yine de
           listede durur ki zaman çizelgesi eksiksiz okunsun. */
        list.push({ key: `${row.match_id}-${team.id}`, from: previous?.id !== team.id ? previous : null, to: team, date: row.match?.date ?? null });
      }
      previous = team;
    });
    return list.reverse();
  }, [appearances]);

  /** Disiplin: kart görülen maçlar (herkese açık ceza ucu oyuncuya göre süzülemiyor). */
  const discipline = useMemo(
    () => appearances.filter((row) => num(row.yellow_card) > 0 || num(row.red_card) > 0),
    [appearances],
  );
  const cardTotals = useMemo(
    () =>
      discipline.reduce(
        (acc, row) => ({ yellow: acc.yellow + num(row.yellow_card), red: acc.red + num(row.red_card) }),
        { yellow: 0, red: 0 },
      ),
    [discipline],
  );

  const openTeam = useCallback((teamId: number) => router.push(`/takim/${teamId}`), [router]);
  const openMatch = useCallback((matchId: number) => router.push(`/mac/${matchId}`), [router]);

  /* Uzun kariyerde (20+ kulüp) geçiş listesi ekranı boğuyordu: ilk 6 geçiş
     görünür, gerisi tek dokunuşla açılır. */
  const [allTransfers, setAllTransfers] = useState(false);
  const shownTransfers = allTransfers ? transfers : transfers.slice(0, TRANSFER_PREVIEW);

  if (profileQuery.isLoading) {
    return (
      <View style={styles.loadingBody}>
        <SkeletonCard lines={1} />
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

  const shownDiscipline = discipline.slice(0, 20);

  return (
    <ScrollView {...scrollProps} contentContainerStyle={styles.content} refreshControl={refresh.control}>
      <StatTiles tiles={summary} />

      {/* ————— Takım geçmişi ————— */}
      {teams.length ? (
        <>
          <SectionHeader style={styles.flushHeader} title="Kulüpler" meta="Maç sayısına göre" />
          <View style={surfaces.card}>
            {teams.map((team, index) => (
              <TimelineTeam
                key={`${team.id ?? "yok"}-${index}`}
                team={team}
                current={team.id != null && team.id === currentTeamId}
                first={index === 0}
                last={index === teams.length - 1}
                share={maxTeamMatches > 0 ? num(team.match_count) / maxTeamMatches : 0}
                onPress={openTeam}
              />
            ))}
          </View>
        </>
      ) : null}

      {/* ————— Transferler ————— */}
      {transfers.length > 1 ? (
        <>
          <SectionHeader style={styles.flushHeader} title="Kulüp geçişleri" meta={`${transfers.length} kulüp`} />
          <View style={surfaces.card}>
            {shownTransfers.map((item, index) => (
              <TransferRow key={item.key} from={item.from} to={item.to} date={item.date} divider={index > 0} onOpenTeam={openTeam} />
            ))}
            {transfers.length > TRANSFER_PREVIEW ? (
              <Touchable
                feedback="row"
                haptic="selection"
                onPress={() => setAllTransfers((value) => !value)}
                accessibilityRole="button"
                style={styles.moreRow}
              >
                <Text style={styles.moreText} {...textScale.dense}>
                  {allTransfers ? "Daha az göster" : `Tümünü göster (${transfers.length})`}
                </Text>
                <Ionicons name={allTransfers ? "chevron-up" : "chevron-down"} size={14} color={colors.brandAccent} />
              </Touchable>
            ) : null}
          </View>
          <Text style={styles.note} {...textScale.long}>
            Geçişler oyuncunun forma giydiği maçlardan çıkarılır: her kulüp için o
            kulüp adına oynadığı ilk maçın tarihi katılış tarihi sayılır.
          </Text>
        </>
      ) : null}

      {/* ————— Disiplin ————— */}
      <SectionHeader
        style={styles.flushHeader}
        title="Disiplin"
        meta={
          discipline.length
            ? `${cardTotals.yellow} sarı · ${cardTotals.red} kırmızı`
            : undefined
        }
      />
      {discipline.length === 0 ? (
        <View style={[surfaces.cardPadded, styles.cleanRecord]}>
          <View style={styles.cleanIcon}>
            <Ionicons name="shield-checkmark" size={20} color={colors.win} />
          </View>
          <View style={styles.cleanBody}>
            <Text style={styles.cleanTitle} {...textScale.dense}>
              Temiz sicil
            </Text>
            <Text style={styles.cleanText} {...textScale.dense}>
              Kayıtlı maçlarında sarı ya da kırmızı kart görmedi.
            </Text>
          </View>
        </View>
      ) : (
        <View>
          {shownDiscipline.map((row, index) => (
            <MatchLogRow
              key={row.match_id}
              {...logRowProps(row)}
              position={rowPosition(index, shownDiscipline.length)}
              onPress={openMatch}
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

/**
 * Kariyer zaman çizelgesinin tek kulübü. Amblem rayın ÜSTÜNDE durur: dikey
 * çizgi amblemleri birbirine bağlar, güncel kulübün amblemi mor halkalıdır.
 * Satırın altındaki çizgi kulübün maç payıdır (en çok oynadığı kulübe göre).
 */
const TimelineTeam = React.memo(function TimelineTeam({
  team,
  current,
  first,
  last,
  share,
  onPress,
}: {
  team: HistoryTeam;
  current: boolean;
  first: boolean;
  last: boolean;
  share: number;
  onPress: (teamId: number) => void;
}) {
  const handlePress = useCallback(() => {
    if (team.id != null) onPress(team.id);
  }, [onPress, team.id]);

  const leagues = (team.league_names ?? []).filter(Boolean);
  const seasonCount = (team.season_names ?? []).filter(Boolean).length;
  const meta = [leagues.join(" · "), seasonCount ? `${seasonCount} dönem` : null].filter(Boolean).join(" · ");

  return (
    <Touchable
      feedback="row"
      haptic="selection"
      onPress={team.id != null ? handlePress : undefined}
      accessibilityRole="button"
      accessibilityLabel={`${team.name ?? "Takım"}, ${team.match_count} maç${current ? ", güncel kulüp" : ""}`}
      style={styles.timelineRow}
    >
      <View style={styles.timelineRail}>
        <View style={[styles.timelineLine, first && styles.timelineLineHidden]} />
        <View style={[styles.timelineCrest, current && styles.timelineCrestCurrent]}>
          <TeamLogo name={team.name} logo={mediaUrl(team.logo)} size={30} />
        </View>
        <View style={[styles.timelineLine, last && styles.timelineLineHidden]} />
      </View>

      <View style={[styles.timelineBody, !last && styles.timelineDivider]}>
        <View style={styles.timelineHead}>
          <View style={styles.timelineText}>
            <View style={styles.timelineNameRow}>
              <Text style={styles.timelineName} numberOfLines={1} {...textScale.dense}>
                {team.name ?? "Takım"}
              </Text>
              {current ? <Badge label="GÜNCEL" tone="brand" size="xs" /> : null}
            </View>
            {meta ? (
              <Text style={styles.timelineMeta} numberOfLines={1} {...textScale.dense}>
                {meta}
              </Text>
            ) : null}
          </View>
          <View style={styles.timelineCount}>
            <Text style={styles.timelineCountValue} {...textScale.dense}>
              {team.match_count}
            </Text>
            <Text style={styles.timelineCountLabel} {...textScale.badge}>
              MAÇ
            </Text>
          </View>
        </View>
        <View style={styles.timelineShare}>
          <View style={[styles.timelineShareFill, { flex: Math.max(0.02, share) }]} />
          <View style={{ flex: 1 - Math.max(0.02, share) }} />
        </View>
      </View>
    </Touchable>
  );
});

/** Transfer satırı: eski amblem → yeni amblem, yeni kulüp adı öne çıkar. */
const TransferRow = React.memo(function TransferRow({
  from,
  to,
  date,
  divider,
  onOpenTeam,
}: {
  /** Null: kayıtlardaki ilk kulüp (öncesinde forma giydiği kulüp yok). */
  from: AppearanceTeam | null;
  to: AppearanceTeam;
  date: string | null;
  divider: boolean;
  onOpenTeam: (teamId: number) => void;
}) {
  const open = useCallback(() => {
    if (to.id != null) onOpenTeam(to.id);
  }, [onOpenTeam, to.id]);

  return (
    <Touchable
      feedback="row"
      haptic="selection"
      onPress={to.id != null ? open : undefined}
      accessibilityRole="button"
      accessibilityLabel={`${from ? `${from.name ?? "Takım"} kulübünden ` : ""}${to.name ?? "takım"} kulübüne${date ? `, ${dateWithYear(date)}` : ""}`}
      style={[styles.transferRow, divider && styles.transferDivider]}
    >
      <View style={styles.transferCrests}>
        {from ? (
          <TeamLogo name={from.name} logo={mediaUrl(from.logo)} size={24} dimmed />
        ) : (
          <View style={styles.transferStart}>
            <Ionicons name="flag" size={12} color={colors.textTertiary} />
          </View>
        )}
        <Ionicons name="arrow-forward" size={12} color={colors.textTertiary} />
        <TeamLogo name={to.name} logo={mediaUrl(to.logo)} size={28} />
      </View>
      <View style={styles.transferBody}>
        <Text style={styles.transferTo} numberOfLines={1} {...textScale.dense}>
          {to.name ?? "Takım"}
        </Text>
        <Text style={styles.transferFrom} numberOfLines={1} {...textScale.dense}>
          {from ? `${from.name ?? "Takım"} kulübünden` : "Kayıtlardaki ilk kulübü"}
        </Text>
      </View>
      {date ? (
        <Text style={styles.transferDate} {...textScale.dense}>
          {dateWithYear(date)}
        </Text>
      ) : null}
    </Touchable>
  );
});

/* ══════════════════════════════════════════════════════════════════════════
   10) PAYLAŞ KARTI

   NEDEN SABİT RENK: bu kart ekran arayüzü değil, dışa aktarılan bir GÖRSELDİR.
   Koyu temadaki kullanıcı Instagram'a farklı tonlu bir kart göndermesin diye
   kartın paleti temadan bağımsız sabittir — Arena SAHNESİ: grafit zemin,
   beyaz rakam, cam paneller. Renkler yine palet tokenlarından okunur
   (`light` / `dark`), çıplak hex yoktur.
   ══════════════════════════════════════════════════════════════════════════ */

const SHARE = {
  ink: light.inkBlock,
  text: light.onDark,
  muted: light.onDarkMuted,
  brand: light.brandOnDark,
  brandFill: light.brand,
  tile: light.inkTile,
  tileBorder: light.inkTileBorder,
  pill: light.inkPill,
  pillBorder: light.inkPillBorder,
} as const;

const SHARE_WIDTH = 272;
const SHARE_FORMATS = {
  story: { label: "Hikâye 9:16", height: Math.round((SHARE_WIDTH * 16) / 9), avatar: 92 },
  post: { label: "Gönderi 3:4", height: Math.round((SHARE_WIDTH * 4) / 3), avatar: 64 },
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
  average,
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
  average: number | null;
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

  const decided = wins + draws + losses;
  const perMatch = matches > 0 ? decimalTR(goals / matches, 2) : "0";
  const winRate = decided > 0 ? `%${Math.round((wins / decided) * 100)}` : "—";
  const spec = SHARE_FORMATS[format];
  const story = format === "story";
  const positionText = position ? positionLabel(position) : null;
  const subline = [teamName, positionText].filter(Boolean).join(" · ");

  const stats = [
    { label: "MAÇ", value: String(matches) },
    { label: "GOL", value: String(goals) },
    { label: "GOL/MAÇ", value: perMatch },
    { label: "GALİBİYET", value: winRate },
  ];

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
          <View style={[styles.shareCard, { height: spec.height }]}>
            <View style={styles.shareHead}>
              <Text style={styles.shareBrand}>elitlig</Text>
              <Text style={styles.shareKicker}>OYUNCU KARTI</Text>
            </View>

            <View style={[styles.shareIdentity, !story && styles.shareIdentityRow]}>
              <View style={styles.shareRing}>
                <Avatar name={playerName} image={mediaUrl(playerImage)} size={spec.avatar} />
              </View>
              <View style={[styles.shareNameBlock, story ? styles.shareNameBlockCenter : styles.shareNameBlockRow]}>
                <Text style={[styles.shareName, story && styles.shareCenter]} numberOfLines={2}>
                  {playerName}
                </Text>
                {subline ? (
                  <Text style={[styles.shareSub, story && styles.shareCenter]} numberOfLines={1}>
                    {subline}
                  </Text>
                ) : null}
              </View>
            </View>

            {average != null ? (
              <View style={styles.shareRating}>
                <Text style={[styles.shareRatingValue, { color: dark.ratingGood }]}>{ratingLabel(average)}</Text>
                <Text style={styles.shareRatingLabel}>ORTALAMA MAÇ PUANI</Text>
              </View>
            ) : null}

            <View style={styles.shareGrid}>
              {stats.map((item) => (
                <View key={item.label} style={styles.shareStat}>
                  <Text style={styles.shareStatValue}>{item.value}</Text>
                  <Text style={styles.shareStatLabel}>{item.label}</Text>
                </View>
              ))}
            </View>

            <View style={styles.shareSpacer} />

            <View style={styles.shareFoot}>
              {decided > 0 ? (
                <Text style={styles.shareRecord}>
                  {wins}G · {draws}B · {losses}M
                </Text>
              ) : (
                <View />
              )}
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
  /* İçerik kabı ekran dolgusunu basıyor; başlık kendi dolgusunu basmaz. */
  flushHeader: {
    paddingHorizontal: 0,
    paddingBottom: space.xs,
  },
  trophies: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.s,
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
  matchesSummary: {
    paddingTop: space.md,
  },
  loadingBody: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.md,
    gap: space.md,
  },
  note: {
    ...type.caption,
    color: colors.textTertiary,
    paddingHorizontal: space.xs,
    marginTop: -space.xs,
  },

  /* — Kimlik iskeleti (sahnede) — */
  heroSkeleton: {
    paddingHorizontal: layout.screenPadding,
    paddingBottom: space.md,
    gap: space.lg,
  },
  heroSkeletonTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.lg,
  },
  heroSkeletonBody: {
    flex: 1,
    gap: space.sm,
  },
  stageBlock: {
    backgroundColor: colors.inkTile,
    borderRadius: radius.xs,
  },
  heroSkeletonAvatar: {
    width: 86,
    height: 86,
    borderRadius: radius.pill,
  },
  heroSkeletonPill: {
    width: 128,
    height: 26,
    borderRadius: radius.pill,
  },
  heroSkeletonStrip: {
    height: 66,
    borderRadius: radius.md,
  },

  /* — Maçlar: sezon başlığı (sabit yükseklik) — */
  seasonHead: {
    height: SEASON_HEAD_HEIGHT,
    justifyContent: "flex-end",
    paddingBottom: space.sm,
    paddingHorizontal: space.xs,
  },
  seasonTitle: {
    ...type.h3,
    color: colors.textPrimary,
  },
  seasonCaption: {
    ...type.caption,
    color: colors.textTertiary,
  },

  /* — Kariyer zaman çizelgesi — */
  timelineRow: {
    flexDirection: "row",
    alignItems: "stretch",
    paddingLeft: space.md,
  },
  timelineRail: {
    width: 40,
    alignItems: "center",
  },
  timelineLine: {
    flex: 1,
    width: 2,
    backgroundColor: colors.border,
  },
  timelineLineHidden: {
    backgroundColor: "transparent",
  },
  timelineCrest: {
    padding: 2,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: "transparent",
  },
  timelineCrestCurrent: {
    borderColor: colors.brand,
  },
  timelineBody: {
    flex: 1,
    minWidth: 0,
    paddingVertical: space.md,
    paddingLeft: space.m,
    paddingRight: space.lg,
    gap: space.s,
  },
  timelineDivider: {
    borderBottomWidth: hairline,
    borderBottomColor: colors.separator,
  },
  timelineHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  timelineText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  timelineNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.s,
  },
  timelineName: {
    ...type.h4,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  timelineMeta: {
    ...type.caption,
    color: colors.textTertiary,
  },
  timelineCount: {
    alignItems: "flex-end",
  },
  timelineCountValue: {
    ...type.scoreSm,
    color: colors.textPrimary,
  },
  timelineCountLabel: {
    ...type.micro,
    color: colors.textTertiary,
  },
  timelineShare: {
    flexDirection: "row",
    height: 3,
    borderRadius: radius.pill,
    overflow: "hidden",
    backgroundColor: colors.surface3,
  },
  timelineShareFill: {
    height: 3,
    backgroundColor: colors.accent,
  },

  /* — Transfer satırı — */
  transferRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    minHeight: layout.listRowHeightTwoLine,
    paddingHorizontal: space.lg,
    paddingVertical: space.m,
  },
  transferDivider: {
    borderTopWidth: hairline,
    borderTopColor: colors.separator,
  },
  transferCrests: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
  },
  transferStart: {
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    backgroundColor: colors.surface3,
    alignItems: "center",
    justifyContent: "center",
  },
  transferBody: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  transferTo: {
    ...type.h4,
    color: colors.textPrimary,
  },
  transferFrom: {
    ...type.caption,
    color: colors.textTertiary,
  },
  transferDate: {
    ...type.tableNum,
    color: colors.textSecondary,
  },

  moreRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.xs,
    minHeight: layout.minTouch,
    borderTopWidth: hairline,
    borderTopColor: colors.separator,
  },
  moreText: {
    ...type.label,
    color: colors.brandAccent,
  },

  /* — Temiz sicil — */
  cleanRecord: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
  },
  cleanIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.winDim,
    alignItems: "center",
    justifyContent: "center",
  },
  cleanBody: {
    flex: 1,
    gap: 2,
  },
  cleanTitle: {
    ...type.h4,
    color: colors.textPrimary,
  },
  cleanText: {
    ...type.bodySm,
    color: colors.textSecondary,
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
    padding: space.lg,
    gap: space.md,
    overflow: "hidden",
  },
  shareHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  shareBrand: {
    fontSize: 15,
    fontFamily: fonts.bold,
    color: SHARE.text,
    letterSpacing: -0.3,
  },
  shareKicker: {
    fontSize: 9,
    fontFamily: fonts.semibold,
    letterSpacing: 1.4,
    color: SHARE.brand,
  },
  shareIdentity: {
    alignItems: "center",
    gap: space.sm,
  },
  shareIdentityRow: {
    flexDirection: "row",
    gap: space.md,
  },
  shareRing: {
    padding: 3,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: SHARE.brandFill,
  },
  shareNameBlock: {
    gap: 2,
  },
  shareNameBlockRow: {
    flex: 1,
  },
  shareNameBlockCenter: {
    alignItems: "center",
  },
  shareName: {
    fontSize: 19,
    lineHeight: 23,
    fontFamily: fonts.bold,
    letterSpacing: -0.4,
    color: SHARE.text,
  },
  shareSub: {
    fontSize: 11,
    fontFamily: fonts.medium,
    color: SHARE.muted,
  },
  shareCenter: {
    textAlign: "center",
  },
  shareRating: {
    alignItems: "center",
    paddingVertical: space.s,
    borderRadius: radius.md,
    backgroundColor: SHARE.pill,
    borderWidth: 1,
    borderColor: SHARE.pillBorder,
  },
  shareRatingValue: {
    ...type.scoreLg,
  },
  shareRatingLabel: {
    fontSize: 9,
    fontFamily: fonts.semibold,
    letterSpacing: 1.2,
    color: SHARE.muted,
  },
  shareGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.s,
  },
  shareStat: {
    flexBasis: "47%",
    flexGrow: 1,
    alignItems: "center",
    paddingVertical: space.sm,
    borderRadius: radius.md,
    backgroundColor: SHARE.tile,
    borderWidth: 1,
    borderColor: SHARE.tileBorder,
  },
  shareStatValue: {
    ...type.metricSm,
    color: SHARE.text,
  },
  shareStatLabel: {
    fontSize: 9,
    fontFamily: fonts.semibold,
    letterSpacing: 1,
    color: SHARE.muted,
  },
  shareSpacer: {
    flex: 1,
  },
  shareFoot: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  shareRecord: {
    fontSize: 10,
    fontFamily: fonts.bold,
    color: SHARE.text,
    fontVariant: ["tabular-nums"],
  },
  shareFooter: {
    fontSize: 9,
    fontFamily: fonts.bold,
    letterSpacing: 2.5,
    color: SHARE.muted,
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
