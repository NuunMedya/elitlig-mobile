import { get, post } from "../http";

export type ArenaGame = "seri" | "sektir" | "kimbu" | "slalom";

export interface ArenaEntry {
  rank: number;
  userId: number;
  name: string;
  teamName?: string | null;
  score: number;
  date: string;
}

export interface ArenaLeaderboard {
  game: string;
  period: string;
  cityId: number | null;
  entries: ArenaEntry[];
}

export const submitArenaScore = (game: ArenaGame, score: number) =>
  post<{ ok?: boolean }>("/api/arena/scores", { game, score });

export const getArenaLeaderboard = (
  game: ArenaGame,
  options?: { cityId?: number; period?: "weekly" | "alltime" }
) =>
  get<ArenaLeaderboard>("/api/arena/leaderboard", {
    game,
    cityId: options?.cityId,
    period: options?.period ?? "alltime",
  });

export const getMyArenaRank = (game: ArenaGame, cityId?: number) =>
  get<Record<string, unknown>>("/api/arena/leaderboard/me", { game, cityId });
