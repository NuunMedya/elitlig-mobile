import { get, post } from "../http";

export type ArenaGame = "seri" | "sektir" | "kimbu" | "slalom" | "gunun" | "penalti";

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

/**
 * Oyun kuralları sürümü. Penaltı, slalom ve top sektir v3'te baştan yazıldı;
 * sunucu bu oyunlarda `v`si 3'ten küçük (eski uygulama) skorları reddeder ki
 * eski kurallarla yapılmış skorlar yeni tabloya karışmasın.
 */
export const ARENA_CLIENT_VERSION = 3;

export const submitArenaScore = (game: ArenaGame, score: number) =>
  post<{ ok?: boolean }>("/api/arena/scores", { game, score, v: ARENA_CLIENT_VERSION });

export const getArenaLeaderboard = (
  game: ArenaGame,
  options?: { cityId?: number; period?: "weekly" | "alltime" }
) =>
  get<ArenaLeaderboard>("/api/arena/leaderboard", {
    game,
    cityId: options?.cityId,
    period: options?.period ?? "alltime",
  });

export const getMyArenaRank = (game: ArenaGame, cityId?: number, period?: "weekly" | "alltime") =>
  get<Record<string, unknown>>("/api/arena/leaderboard/me", { game, cityId, period });
