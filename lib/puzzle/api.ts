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
  /** Reklamla can: bugün kalan hak (eski sunucuda yok). */
  ad_lives?: { left: number; per_day: number; seconds: number };
  /** Oyun başına can (her oyunun kendi 5 canı; eski sunucuda yok). */
  lives_by_game?: Partial<Record<PuzzleGameKey, { lives: number; next_life_at: string | null }>>;
  /** `livesFor` ile üretilen görünümde: canların ait olduğu oyun. */
  life_game?: PuzzleGameKey;
}

/**
 * Profilin bir oyuna göre görünümü: `lives` / `next_life_at` o oyunun canı olur.
 * Cüzdan, can doldurma ve reklamla can bu görünümle çalışır. Eski sunucu
 * (tek havuz) için profil olduğu gibi döner.
 */
export function livesFor<T extends PuzzleProfile | undefined>(profile: T, game: PuzzleGameKey | null | undefined): T {
  if (!profile || !game) return profile;
  const g = profile.lives_by_game?.[game];
  return (g ? { ...profile, lives: g.lives, next_life_at: g.next_life_at, life_game: game } : { ...profile, life_game: game }) as T;
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
  /** Kulüp Şehri (yeni sunucu); eski sunucuda yok. */
  city?: CityState;
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
export const buyItem = (item: string, game?: PuzzleGameKey | null) =>
  post<{ item: string; profile: PuzzleProfile }>("/api/puzzle/shop", game ? { item, game } : { item });
export const buildStadium = (id: string) =>
  post<{ item: StadiumItem; zone_done: boolean; bonus_coins: number; profile: PuzzleProfile }>("/api/puzzle/stadium/build", { id });
/** Ödüllü reklam: başlat (jeton) → reklam biter → ödülü iste (+1 can). */
export const startAdLife = (game?: PuzzleGameKey | null) =>
  post<{ token: string; seconds: number; left: number }>("/api/puzzle/ad-life/start", game ? { game } : undefined, { retry: false });
export const claimAdLife = (token: string) =>
  post<{ lives_added: number; profile: PuzzleProfile }>("/api/puzzle/ad-life/claim", { token }, { retry: false });
export const claimDaily = () =>
  post<{ reward: DailyReward; streak: number; profile: PuzzleProfile }>("/api/puzzle/daily");
/* ───────────────────────── KULÜP ŞEHRİ ───────────────────────── */

/** Bir birim (saha, kafeterya, kamp oteli…) — sunucu services/puzzle/city.js. */
export interface CityBuilding {
  key: string;
  title: string;
  icon: string;
  level: number;
  max: number;
  current: { title: string; desc: string | null } | null;
  next: { level: number; title: string; desc: string | null; cost: number; dev: number } | null;
  locked: { code: "TIER" | "REQ"; text: string; tier?: number; building?: string; level?: number } | null;
  steps: { level: number; title: string; cost: number; tier: number; done: boolean }[];
}

export interface CityTier {
  index: number;
  key: string;
  title: string;
  min: number;
}

export interface CityState {
  levels: Record<string, number>;
  spent: number;
  /** Gelişim puanı. */
  dev: number;
  tier: CityTier;
  next_tier: CityTier | null;
  stars: {
    puzzle: number;
    arena: number;
    xp: number;
    total: number;
    spent: number;
    available: number;
    arena_today?: number;
    arena_by_game?: Record<string, number>;
  };
  xp: { per_star: number; pending: number; claimable_stars: number; claimed: number };
  buildings: CityBuilding[];
  progress: { built: number; total: number };
}

export interface CityLeaderRow {
  rank: number;
  user_id: number;
  name: string;
  city: string | null;
  dev: number;
  tier: string;
  /** Yeni sunucu: statü basamağı (0 = Okul takımı … 9 = Avrupa devi). */
  tier_index?: number | null;
  /** Yeni sunucu: toplam kazanılan yıldız. */
  stars_total?: number | null;
  /** Yeni sunucu: [from, to] penceresinde kazanılan yıldız. */
  stars_period?: number | null;
  levels: Record<string, number>;
  me: boolean;
}

/** dev = gelişim puanı · stars = toplam yıldız · period_stars = aralıkta kazanılan yıldız. */
export type CityBoardMetric = "dev" | "stars" | "period_stars";

export interface CityBoardOptions {
  metric?: CityBoardMetric;
  /** period_stars için kısayol (sunucu haftayı/ayı kendi hesaplar). */
  period?: "week" | "month" | "alltime";
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

export interface CityLeaderboard {
  scope: string;
  /** Yeni sunucu alanları (eski sunucuda yok → gelişim puanı, tek sayfa). */
  metric?: CityBoardMetric;
  from?: string | null;
  to?: string | null;
  total?: number | null;
  limit?: number | null;
  offset?: number | null;
  items: CityLeaderRow[];
  me?: { rank: number | null; dev?: number | null; stars_total?: number | null; stars_period?: number | null } | null;
}

export const cityKeys = {
  me: () => ["puzzle", "city"] as const,
  leaderboard: (scope: string, ...extra: (string | number | null | undefined)[]) =>
    ["puzzle", "city", "leaderboard", scope, ...extra] as const,
};

export const getCity = () => get<{ city: CityState; tiers: Omit<CityTier, "index">[] }>("/api/puzzle/city", undefined, { retry: false });
export const upgradeCity = (building: string) =>
  post<{ building: string; level: number; step: { title: string; desc: string | null; cost: number }; tier_up: { index: number; title: string } | null; city: CityState }>(
    "/api/puzzle/city/upgrade",
    { building },
    { retry: false },
  );
export const collectCityStars = () => post<{ stars: number; xp: number; city: CityState }>("/api/puzzle/city/collect", undefined, { retry: false });
export const getCityLeaderboard = (scope: "all" | "city", options?: CityBoardOptions) =>
  get<CityLeaderboard>("/api/puzzle/city/leaderboard", {
    scope,
    metric: options?.metric,
    period: options?.period,
    from: options?.from,
    to: options?.to,
    limit: options?.limit,
    offset: options?.offset || undefined,
  });

export const getLeaderboard = (game: string, scope: "all" | "city") =>
  get<{ game: string; scope: string; items: LeaderboardRow[] }>("/api/puzzle/leaderboard", { game, scope });
