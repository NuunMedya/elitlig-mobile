/**
 * Sunucunun (elitlig-server) gerçekten döndürdüğü şekiller.
 *
 * Buradaki alan adları backend modelleriyle birebir aynıdır (snake_case,
 * Türkçe alanlar dahil). Uygulama içinde kullanılan "temiz" görünümler
 * lib/normalize.ts içinde bu tiplerden türetilir; böylece backend'de bir alan
 * değişirse tek bir yerde düzeltmek yeterli olur.
 */

/* ===================== META (şehir / lig / sezon) ===================== */

/** GET /api/meta/cities → { cities: [...] } */
export interface MetaOption {
  id: number;
  label: string;
  is_archived?: boolean;
}

export interface MetaLeague extends MetaOption {
  league_priority?: number | null;
}

export interface MetaSeason extends MetaOption {
  season_priority?: number | null;
  season_year?: number | null;
}

/** GET /api/meta/default-scope?cityId=1 */
export interface DefaultScope {
  cityId: number;
  leagueId: number;
  seasonId: number;
}

/** Uygulamanın her ekranda kullandığı kapsam seçimi. */
export interface Scope {
  cityId: number;
  leagueId: number;
  seasonId: number;
  cityLabel?: string;
  leagueLabel?: string;
  seasonLabel?: string;
}

/* ===================== MAÇ ===================== */

/** models/matches.js — `mac_durumu` alanının alabildiği değerler. */
export type MacDurumu = "taslak" | "zamanlanmis" | "canli" | "yayinlanmis";

/** Uygulama içi sadeleştirilmiş durum. */
export type MatchState = "scheduled" | "live" | "finished";

/** GET /maclar, GET /maclar/:id — matches tablosu satırı. */
export interface ApiMatch {
  id: number;
  first_team_name: string;
  second_team_name: string;
  first_team_score: number | null;
  second_team_score: number | null;
  is_it_fixture: number;
  /** ISO tarih (DATE) */
  date: string;
  /** "20:00:00" */
  time: string;
  match_field?: string | null;
  league_name: string;
  match_season?: string | null;
  match_title?: string | null;
  match_comment?: string | null;
  match_picture?: string | null;
  match_video?: string | null;
  match_mvp?: number | null;
  city: string;
  city_id?: number | null;
  league_id?: number | null;
  season_id?: number | null;
  home_team_id?: number | null;
  away_team_id?: number | null;
  mac_durumu: MacDurumu | null;
  kadro_tamamlandi?: number;
  post_manset?: string | null;
  post_rapor?: string | null;
  createdAt?: string;
  updatedAt?: string;
  /** ?include=lineup ile gelir */
  lineup?: ApiLineupRow[];
  /** ?include=timeline ile gelir */
  timeline?: ApiMatchEvent[];
}

/** mac_kadrolari satırı. */
export interface ApiLineupRow {
  id: number;
  mac_id: number;
  takim_id: number;
  oyuncu_id: number | null;
  pozisyon?: string | null;
  forma_no?: number | null;
  puan?: string | number | null;
  ilk11_mi: number;
  yedek_mi: number;
  kaptan_mi: number;
  misafir_mi: number;
  misafir_adi?: string | null;
}

/**
 * GET /maclar/:id/kadro — kadro satırları oyuncu adı/fotoğrafıyla çözülmüş
 * halde, ev/deplasman ayrılmış olarak döner. Ham `mac_kadrolari` satırlarında
 * yalnızca oyuncu id'si bulunduğu için kadro ekranı bu ucu kullanır; uç ayrıca
 * kadro tablosu boş olan eski maçlarda PlayerStatistics'ten türetir.
 */
export interface KadroPlayer {
  id: number | null;
  oyuncu_id: number | null;
  playerId: number | null;
  playerName: string | null;
  playerImg: string | null;
  isGuest: boolean;
  guestName: string | null;
  team_id: number;
  takim_id: number;
  /** Forma numarası; girilmemişse boş dize. */
  number: number | string;
  position: string;
  puan: number | null;
  role: "starter" | "bench" | "reserve";
  captain: boolean;
}

export interface KadroResponse {
  meta: { match_id: number; home_team_id: number | null; away_team_id: number | null };
  home: KadroPlayer[];
  away: KadroPlayer[];
}

/** mac_olaylari satırı. constants/matchEvents.js içindeki olay_kodu değerleri. */
export interface ApiMatchEvent {
  id: number;
  mac_id: number;
  takim_id: number | null;
  oyuncu_id: number | null;
  oyuncu_cikan_id: number | null;
  oyuncu_giren_id: number | null;
  dakika: number | null;
  devre: number | null;
  olay_kodu: string;
  aciklama?: string | null;
  createdAt?: string;
}

/* ===================== CANLI ANLIK GÖRÜNTÜ ===================== */

/** GET /api/live-matches/:matchId/snapshot */
export interface LiveSnapshot {
  matchId: number;
  homeTeamId: number | null;
  awayTeamId: number | null;
  homeScore: number;
  awayScore: number;
  matchStatus: string;
  isLive: boolean;
  period: number | null;
  version: number;
  clockMs: number;
  isRunning: boolean;
  timer: {
    running: boolean;
    baseMs: number;
    baseAt: string | null;
    serverNow: string;
    seq: number;
  };
  events: ApiMatchEvent[];
  lineups?: { home: LiveLineupEntry[]; away: LiveLineupEntry[] };
}

export interface LiveLineupEntry {
  id: number;
  teamId: number;
  playerId: number | null;
  playerName: string | null;
  position?: string | null;
  shirtNumber?: number | null;
  starting: boolean;
  substitute: boolean;
  captain: boolean;
  isGuest: boolean;
}

/* ===================== PUAN DURUMU ===================== */

/** GET /api/standings?cityId&leagueId&seasonId — services/standingsSerializer.js */
export interface StandingRow {
  team_id: number;
  team_name: string;
  logo: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goals_for: number;
  goals_against: number;
  goal_diff: number;
  base_points: number;
  manual_points: number;
  total_points: number;
  power_index: number;
  balance_points: number;
  balance_manual_points: number;
  balance_total_points: number;
  /** Sezon tipine göre gösterilecek puan — sunucu belirler. */
  display_points: number;
  standings_type: "standart" | "gucdengesi";
  /** Son 5 maç: "WDLWW" */
  last5: string;
}

export interface StandingsResponse {
  standings?: StandingRow[];
  rows?: StandingRow[];
  standings_type?: string;
}

/* ===================== TAKIM ===================== */

/** GET /takimlar/:id */
export interface ApiTeam {
  id: number;
  team_name: string;
  logo?: string | null;
  total_matches?: number;
  team_wins?: number;
  team_draws?: number;
  team_losses?: number;
  goals_scored?: number;
  goals_conceded?: number;
  team_points?: number;
  current_league?: string | null;
  current_season?: string | null;
  active?: number | string | boolean;
  city?: string;
  city_id?: number | null;
  founded_at?: string | null;
  colors?: string | null;
}

/* ===================== OYUNCU ===================== */

/** GET /api/players/:id → dizi döner; routes/Players.js publicPlayer alanları. */
export interface ApiPlayer {
  id: number;
  player_name: string;
  player_img?: string | null;
  team_id?: number | null;
  player_position?: string | null;
  birth_date?: string | null;
  nationality?: string | null;
  value?: number | string | null;
  season?: string | null;
  total_matches?: number;
  total_goals?: number;
  total_points?: number;
  total_yellow_cards?: number;
  total_red_cards?: number;
  wins?: number;
  draws?: number;
  losses?: number;
  active?: number | string | boolean;
  city?: string;
  city_id?: number | null;
  market_value?: string | number | null;
  market_value_currency?: string | null;
  /**
   * İletişim alanları yanıta yalnızca yetkili görüntüleyici için eklenir
   * (yönetim, oyuncunun kendisi, takımının başkanı) — bkz. publicPlayer.
   */
  phone?: string | null;
  email?: string | null;
}

/**
 * GET /api/oyuncu-listesi — ham SQL ile hesaplanan sıralama satırı.
 *
 * DİKKAT: Bu uç, Players modelinden farklı alan adları kullanır (sorgu
 * `player_name AS name`, `player_img AS image` gibi takma adlar veriyor) ve
 * toplama sonuçları MySQL sürücüsünden DİZE olarak gelir ("41", "1.95").
 * Sayısal kullanım öncesi Number() ile çevirin.
 */
export interface PlayerRankRow {
  id: number;
  name: string;
  image?: string | null;
  teamId?: number | null;
  teamName?: string | null;
  matches: number | string;
  goals: number | string;
  assists: number | string;
  yellow: number | string;
  red: number | string;
  cards: number | string;
  points: number | string;
  goalsPerMatch: number | string;
  pointsPerMatch: number | string;
}

export type PlayerSort =
  | "mostValuable"
  | "topScorers"
  | "mostMatches"
  | "mostCards"
  | "goalsPerMatch"
  | "pointsPerMatch";

export interface PlayerListResponse {
  players: PlayerRankRow[];
  filters: {
    cities: { id: number; name: string }[];
    leagues: { id: number; name: string; cityId: number | null }[];
    seasons: { id: number; name: string; cityId: number | null; leagueId: number | null }[];
  };
  total: number;
  sort: PlayerSort;
}

/* ===================== HABER ===================== */

/** GET /api/news, /api/news/feed — services/newsService.js serializeNews */
export interface NewsItem {
  kind: "news" | "transfer" | "penalty";
  id: string;
  title: string;
  summary?: string | null;
  content?: string | null;
  cover_image_url?: string | null;
  category?: string;
  category_label?: string;
  city_id?: number | null;
  league_id?: number | null;
  season_id?: number | null;
  pinned?: boolean;
  published_at?: string;
}

export interface NewsFeedResponse {
  items: NewsItem[];
  counts?: Record<string, number>;
  categories?: Record<string, string>;
}

export interface NewsListResponse {
  items: NewsItem[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/* ===================== KULLANICI ===================== */

/** routes/User.js safeUserPayload */
export interface AuthUser {
  id: number;
  username: string;
  fullName?: string | null;
  email?: string | null;
  phone?: string | null;
  teamName?: string | null;
  role: string;
  city?: string | null;
  status?: string | null;
  player_id?: number | null;
  managed_team_id?: number | null;
  profile_type?: string | null;
  profileScopes?: string[];
}

export interface LoginResponse {
  message: string;
  user: AuthUser;
  token: string;
  expiresIn: number;
}
