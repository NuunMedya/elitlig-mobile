import { get, post } from "../http";
import type { PuzzleGameKey } from "./types";

/**
 * LİG YOLU API — elitlig-server routes/puzzle.js (services/puzzle).
 *
 * İlerleme sunucuda tutulur: telefon değişse de seviye, yıldız, jeton, can,
 * güçlendirici ve stadyum korunur. Kurallar sunucudadır (rules.js); istemci
 * yalnız gösterir ve sonucu bildirir.
 */

export interface StadiumItem {
  key: string;
  id: string;
  title: string;
  cost: number;
  built: boolean;
}

export interface StadiumZone {
  key: string;
  title: string;
  index: number;
  items: StadiumItem[];
  done: boolean;
}

export interface StadiumState {
  built: string[];
  spent: number;
  available: number;
  zones: StadiumZone[];
  activeZone: string | null;
  progress: { built: number; total: number };
}

export interface DailyReward {
  coins: number;
  boosters?: Record<string, number>;
}

export interface PuzzleProfile {
  coins: number;
  lives: number;
  max_lives: number;
  next_life_at: string | null;
  life_minutes: number;
  boosters: Record<string, number>;
  /** Bütün oyunlarda kazanılan toplam yıldız. */
  stars: number;
  stadium: StadiumState;
  daily: { available: boolean; streak: number; next_streak: number; reward: DailyReward; rewards: DailyReward[] };
}

export interface PuzzleGameProgress {
  game: PuzzleGameKey;
  title: string;
  /** Geçilmiş son seviye (0 = hiç). Oynanabilir seviye level + 1. */
  level: number;
  stars: Record<string, number>;
  total_stars: number;
}

export interface ShopItem {
  title: string;
  price: number;
  lives?: number;
  booster?: string;
  count?: number;
}

export interface PuzzleMe {
  profile: PuzzleProfile;
  games: Record<PuzzleGameKey, PuzzleGameProgress>;
  catalog: {
    boosters: Record<string, { game: PuzzleGameKey; title: string; price: number }>;
    shop: Record<string, ShopItem>;
  };
}

export interface FinishResponse {
  won: boolean;
  reward: { coins: number; xp: number; firstClear: boolean; starsGained: number } | null;
  game: PuzzleGameProgress;
  profile: PuzzleProfile;
}

export interface LeaderboardRow {
  rank: number;
  user_id: number;
  name: string;
  city: string | null;
  stars: number;
  level: number;
  me: boolean;
}

export const puzzleKeys = {
  all: ["puzzle"] as const,
  me: () => ["puzzle", "me"] as const,
  leaderboard: (game: string, scope: string) => ["puzzle", "leaderboard", game, scope] as const,
};

export const getPuzzleMe = () => get<PuzzleMe>("/api/puzzle/me", undefined, { retry: false });
export const startLevel = (game: PuzzleGameKey, level: number) =>
  post<{ ok: true; level: number; profile: PuzzleProfile }>(`/api/puzzle/${game}/start`, { level }, { retry: false });
export const finishLevel = (
  game: PuzzleGameKey,
  body: { level: number; won: boolean; stars: number; boosters_used: Record<string, number> }
) => post<FinishResponse>(`/api/puzzle/${game}/finish`, body, { retry: false });
export const buyItem = (item: string) => post<{ item: string; profile: PuzzleProfile }>("/api/puzzle/shop", { item });
export const buildStadium = (id: string) =>
  post<{ item: StadiumItem; zone_done: boolean; bonus_coins: number; profile: PuzzleProfile }>("/api/puzzle/stadium/build", { id });
export const claimDaily = () =>
  post<{ reward: DailyReward; streak: number; profile: PuzzleProfile }>("/api/puzzle/daily");
export const getLeaderboard = (game: string, scope: "all" | "city") =>
  get<{ game: string; scope: string; items: LeaderboardRow[] }>("/api/puzzle/leaderboard", { game, scope });
