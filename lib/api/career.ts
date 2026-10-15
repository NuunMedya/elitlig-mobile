import { get, put } from "../http";

/**
 * Kariyer Modu — routes/career.js, routes/predictions.js (elitlig-server).
 *
 * Elit Seviye üç katmandan beslenir: saha (gerçek maçlar), tribün (Tahmin
 * Ligi, katılım bildirimi), arena (doğrulanmış mini oyunlar). Oyunlar piyasa
 * değerine dokunmaz; saha dışı XP seviyeyi en çok 30'a taşır.
 */

export type CareerLayer = "saha" | "tribun" | "arena";

export interface EliteCard {
  player_id: number;
  name: string;
  image: string | null;
  position: string | null;
  line: "GK" | "DEF" | "MID" | "FWD" | "ANY";
  ovr: number;
  tier: "caylak" | "bronz" | "gumus" | "altin" | "elit";
  tier_label: string;
  in_form: boolean;
  stats: { sut: number; pas: number; savunma: number; kalecilik: number; form: number; disiplin: number; tecrube: number };
  totals: { matches: number; goals: number; assists: number; saves: number; rating: number | null };
  perks: { penalti?: { aimBonus: number } };
}

export interface CareerLevel {
  level: number;
  xp: number;
  total: number;
  current: number;
  next: number | null;
  progress: number;
  fan_capped: boolean;
  fan_level_cap: number;
}

export interface CareerAchievement {
  code: string;
  layer: CareerLayer;
  title: string;
  description: string;
  xp: number;
  progress: number;
  target: number;
  unlocked: boolean;
  unlocked_at: string | null;
}

export interface CareerQuest {
  code: string;
  layer: CareerLayer;
  title: string;
  description: string;
  progress: number;
  target: number;
  done: boolean;
  xp: number;
}

export interface CareerSummary {
  level: CareerLevel;
  layers: Record<CareerLayer, number>;
  card: EliteCard | null;
  achievements: CareerAchievement[];
  new_achievements: string[];
  quests: CareerQuest[];
  week: { key: string; ends_at: string };
  recent: { layer: CareerLayer; source: string; xp: number; label: string | null; created_at: string }[];
  rules: { arena_daily_cap: number; quest_xp: number };
}

export interface PlayerCareer {
  card: EliteCard;
  level: CareerLevel | null;
  achievements: { code: string; title: string; layer: CareerLayer; unlocked_at: string }[];
}

export const getMyCareer = () => get<CareerSummary>("/api/career/me", undefined, { retry: false });

export const getPlayerCareer = (playerId: number) => get<PlayerCareer>(`/api/career/players/${playerId}`);

/* ───────────────────────── Tahmin Ligi ───────────────────────── */

export interface PredictionMatch {
  id: number;
  date: string;
  time: string | null;
  kickoff: string | null;
  league_name: string | null;
  home: { id: number | null; name: string };
  away: { id: number | null; name: string };
  status: "scheduled" | "live" | "finished";
  score: { home: number; away: number } | null;
  can_predict: boolean;
  own_match: boolean;
  prediction: { home: number; away: number; points: number | null; outcome: "exact" | "diff" | "result" | "miss" | "void" | null } | null;
}

export interface PredictionBoardEntry {
  userId: number;
  rank: number;
  name: string;
  teamName: string | null;
  points: number;
  exact: number;
  predictions: number;
}

export const getPredictionMatches = (scope: { cityId?: number | null; leagueId?: number | null; seasonId?: number | null }) =>
  get<{ upcoming: PredictionMatch[]; recent: PredictionMatch[]; points: Record<string, number> }>("/api/predictions/matches", {
    cityId: scope.cityId ?? undefined,
    leagueId: scope.leagueId ?? undefined,
    seasonId: scope.seasonId ?? undefined,
  });

export const savePrediction = (matchId: number, home: number, away: number) =>
  put<{ match_id: number; home: number; away: number; message: string }>(`/api/predictions/${matchId}`, { home, away });

export const getPredictionBoard = (
  period: "weekly" | "season",
  scope: { cityId?: number | null; leagueId?: number | null; seasonId?: number | null },
) =>
  get<{ period: string; entries: PredictionBoardEntry[]; me: PredictionBoardEntry | null; totalPlayers: number }>(
    "/api/predictions/leaderboard",
    { period, cityId: scope.cityId ?? undefined, leagueId: scope.leagueId ?? undefined, seasonId: scope.seasonId ?? undefined },
  );

export const LAYER_LABELS: Record<CareerLayer, string> = { saha: "Saha", tribun: "Tribün", arena: "Arena" };
