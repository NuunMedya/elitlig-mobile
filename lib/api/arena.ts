import { get, post } from "../http";

export type ArenaGame = "seri" | "sektir" | "kimbu" | "slalom" | "gunun" | "penalti" | "tahmin";

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

/**
 * Oyun oturumu (Kariyer Modu): oyun başlarken açılır, skor bununla gönderilir.
 * Sunucu süreye bakarak skoru doğrular; yalnız doğrulanmış skor XP ve rozet
 * getirir. Oturum açılamazsa skor yine gönderilir (lider tablosuna girer).
 */
export const startArenaSession = (game: ArenaGame) =>
  post<{ sessionId: string; game: string; startedAt: string }>("/api/arena/sessions", { game }, { retry: false });

export const submitArenaScore = (game: ArenaGame, score: number, sessionId?: string | null) =>
  post<{ message?: string; entry?: { verified?: boolean } }>("/api/arena/scores", {
    game,
    score,
    v: ARENA_CLIENT_VERSION,
    ...(sessionId ? { sessionId } : {}),
  });

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

/* ───────────────────────── Penaltı kadrosu ───────────────────────── */

export interface PenaltyKit {
  primary: string;
  secondary: string;
}

/** Gerçek ligden bir oyuncu (atıcı ya da kaleci) — services/penaltyRoster.js. */
export interface PenaltyPerson {
  id: number;
  name: string;
  short: string;
  back: string;
  image: string | null;
  position: string | null;
  shirt: number | null;
  team: { id: number | null; name: string | null; kit: PenaltyKit };
  stats: { matches: number; goals: number; penalty_goals: number; free_kick_goals: number; saves: number; rating: number | null };
  /** Atıcı: power / accuracy / curve; kaleci: reflex (55–95). */
  attrs: Record<string, number>;
  mine?: boolean;
}

export interface PenaltyRoster {
  /** "city": seçili ilin oyuncuları; ilde yeterli oyuncu yoksa "all" (Türkiye geneli). */
  scope?: "city" | "all";
  shooters: PenaltyPerson[];
  /** Kurtarışa göre ARTAN: ilk seviyede ilki, son kaleci ligin en çok kurtarış yapanı. */
  keepers: PenaltyPerson[];
}

export const getPenaltyRoster = (cityId?: number | null) =>
  get<PenaltyRoster>("/api/arena/penalti/roster", { cityId: cityId ?? undefined });

/* ───────────────────────── Slalom kadrosu ───────────────────────── */

/** Slalom koşucusu: gerçek ligden top süren oyuncu (çeviklik / kontrol / hız). */
export interface SlalomRunner extends Omit<PenaltyPerson, "stats"> {
  stats: { matches: number; goals: number; assists: number; rating: number | null };
}

/** Merdivenin bir basamağı: bir takımın savunması. */
export interface SlalomDefense {
  team: { id: number; name: string | null; kit: PenaltyKit };
  conceded_per_match: number;
  matches: number;
  defenders: { id: number; short: string; back: string; shirt: number | null }[];
}

export interface SlalomRoster {
  scope?: "city" | "all";
  runners: SlalomRunner[];
  /** Maç başına yenilen gole göre AZALAN: son basamak ligin en iyi savunması. */
  defenses: SlalomDefense[];
}

export const getSlalomRoster = (cityId?: number | null) =>
  get<SlalomRoster>("/api/arena/slalom/roster", { cityId: cityId ?? undefined });
