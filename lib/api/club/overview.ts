import { get } from "../../http";

/**
 * TAKIM ÖZETİ ve DETAYLI İSTATİSTİK — routes/panel.js (scope=team).
 *
 *   GET /api/panel/me/overview?scope=team     services/panelOverviewService.js
 *       teamOverview(): kimlik, puan durumu sırası, son 5 maç formu, kadro
 *       dökümü, gol katkısı sıralaması, açık teklif / disiplin sayaçları.
 *   GET /api/panel/me/statistics?scope=team   services/panelDetailedStats.js
 *       teamStatistics(): lig-sezon kombinasyonları, toplamlar, iç/dış saha,
 *       maç başı ortalamalar, en iyi oyuncular, kırılım ve maç kaydı.
 *
 * NEDEN AYRI DOSYA: web panelinin "Takım Özeti" ve "Detaylı İstatistikler"
 * ekranları bu iki uçtan beslenir; mobilde ikisinin de karşılığı yoktu.
 * Yanıt alanları sunucudaki adlarla birebir aynıdır (snake_case).
 */

export type MatchResult = "W" | "D" | "L";

export interface OverviewMatch {
  id: number;
  date: string | null;
  time: string | null;
  field: string | null;
  is_home: boolean;
  opponent: string | null;
  opponent_team_id: number | null;
  goals_for: number;
  goals_against: number;
  score: string;
  result: MatchResult;
  status: string | null;
}

export interface OverviewStanding {
  position: number | null;
  team_count: number | null;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goals_for: number;
  goals_against: number;
  goal_diff: number;
  points: number;
  last5: string;
}

export interface OverviewContributor {
  id: number;
  name: string;
  image: string | null;
  position: string | null;
  matches: number;
  goals: number;
  assists: number;
  rating: number | null;
}

export interface TeamOverview {
  scope: "team";
  linked: boolean;
  team?: {
    id: number;
    name: string;
    logo: string | null;
    city: string | null;
    league: string | null;
    season: string | null;
    founded_at: string | null;
    colors: string | null;
  };
  season?: { id: number | null; name: string | null };
  squad?: { total: number; contracted: number; without_contract: number; season_roster: number };
  standings?: OverviewStanding | null;
  form?: {
    played: number;
    wins: number;
    draws: number;
    losses: number;
    scored: number;
    conceded: number;
    avg_scored: number;
    avg_conceded: number;
    /** Eskiden yeniye. */
    results: MatchResult[];
  };
  recent_matches?: OverviewMatch[];
  next_match?: OverviewMatch | null;
  top_contributors?: OverviewContributor[];
  offers?: { active: number };
  contracts?: { total: number; active: number };
  discipline?: { total: number; open: number; pending_reviews: number };
  pending_changes?: number;
}

export const getTeamOverview = () => get<TeamOverview>("/api/panel/me/overview", { scope: "team" });

/* ─────────────────────────── Detaylı istatistik ─────────────────────────── */

export interface StatCombo {
  league_id: number | null;
  league_name: string | null;
  season_id: number | null;
  season_name: string | null;
  matches: number;
  last_date: string | null;
}

export interface SideTotals {
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goals_for: number;
  goals_against: number;
}

export interface TeamStatTotals extends SideTotals {
  goal_diff: number;
  clean_sheets: number;
  failed_to_score: number;
  home: SideTotals;
  away: SideTotals;
  biggest_win: { opponent: string | null; score: string; date: string | null } | null;
  biggest_loss: { opponent: string | null; score: string; date: string | null } | null;
  points?: number;
}

export interface TeamStatPlayer {
  id: number;
  name: string;
  image: string | null;
  position: string | null;
  matches: number;
  goals: number;
  assists: number;
  contributions: number;
  rating: number | null;
}

export interface TeamStatBreakdown extends SideTotals {
  league_id: number | null;
  league_name: string | null;
  season_id: number | null;
  season_name: string | null;
  points: number;
  goal_diff: number;
  last_date: string | null;
}

export interface TeamStatMatch {
  match_id: number;
  date: string | null;
  league_name: string | null;
  season_name: string | null;
  opponent: string | null;
  is_home: boolean;
  score: string;
  result: MatchResult;
}

export interface TeamStatistics {
  scope: "team";
  linked: boolean;
  filters?: { combos: StatCombo[] };
  selection?: { season_id: number | null; league_id: number | null; season_name: string | null; league_name: string | null };
  totals?: TeamStatTotals;
  per_match?: { scored: number; conceded: number; points: number; win_ratio: number };
  form?: MatchResult[];
  standings?: { position: number | null; team_count: number | null; points: number; played: number; last5: string } | null;
  top_players?: TeamStatPlayer[];
  breakdown?: TeamStatBreakdown[];
  match_log?: TeamStatMatch[];
}

export const getTeamStatistics = (filter: { seasonId?: number | null; leagueId?: number | null } = {}) =>
  get<TeamStatistics>("/api/panel/me/statistics", {
    scope: "team",
    season_id: filter.seasonId ?? undefined,
    league_id: filter.leagueId ?? undefined,
  });
