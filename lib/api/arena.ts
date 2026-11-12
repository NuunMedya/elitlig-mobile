import { get, post } from "../http";

export type ArenaGame = "seri" | "sektir" | "kimbu" | "slalom" | "gunun" | "penalti" | "tahmin" | "savunma" | "kadro";

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
 * v4'te Slalom üç şeritli sonsuz koşuya dönüştü (kapılar gitti; şerit, zıplama,
 * kayma) ve Savunma Hattı ile Kadro Koşusu eklendi. Sunucu her oyunda kendi
 * alt sürümünden küçük `v` ile gelen skorları reddeder ki eski kurallarla
 * yapılmış skorlar yeni tabloya karışmasın.
 */
export const ARENA_CLIENT_VERSION = 4;

/**
 * Oyun oturumu (Kariyer Modu): oyun başlarken açılır, skor bununla gönderilir.
 * Sunucu süreye bakarak skoru doğrular; yalnız doğrulanmış skor XP ve rozet
 * getirir. Oturum açılamazsa skor yine gönderilir (lider tablosuna girer).
 */
export const startArenaSession = (game: ArenaGame) =>
  post<{ sessionId: string; game: string; startedAt: string }>("/api/arena/sessions", { game }, { retry: false });

/**
 * Skor kaydının yanıtı. Rekor bilgisi SUNUCUDAN gelir (eski sunucuda yok):
 * cihazdaki rekor yalnız o telefonundur; yeni cihazda ilk skor "rekor" görünürdü.
 */
export interface ArenaScoreEntry {
  verified?: boolean;
  /** Bu skordan önceki en iyi; ilk skorsa null. */
  previousBest?: number | null;
  /** Bu skor dahil en iyi. */
  best?: number;
  /** Önceki en iyi geçildi (ilk skor rekor sayılmaz; görevlerdeki "rekor kır" ile aynı kural). */
  record?: boolean;
  /** Bu oyundaki ilk skor. */
  first?: boolean;
  /** Kulüp Şehri'ne giden yıldız (doğrulanmış skor, günlük tavanlar içinde). */
  stars?: number;
}

export const submitArenaScore = (game: ArenaGame, score: number, sessionId?: string | null) =>
  post<{ message?: string; entry?: ArenaScoreEntry }>("/api/arena/scores", {
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

/** GET /api/arena/leaderboard/me — kullanıcının o kapsamdaki en iyi skoru ve sırası. */
export interface ArenaStanding {
  game: string;
  period: string;
  cityId: number | null;
  /** Bu kapsamda skoru olan FARKLI oyuncu sayısı. */
  totalPlayers: number;
  /** Hiç oynamadıysa null. */
  entry: (Omit<ArenaEntry, "date"> & { date: string | null }) | null;
}

export const getMyArenaRank = (game: ArenaGame, cityId?: number, period?: "weekly" | "alltime") =>
  get<ArenaStanding>("/api/arena/leaderboard/me", { game, cityId, period }, { retry: false });

/** Bir oyundaki kişisel durum: rekor + sıra (tüm zamanlar) ve son 7 günün en iyisi + sırası. */
export interface ArenaGameSummary {
  best: number | null;
  rank: number | null;
  weekBest: number | null;
  weekRank: number | null;
}

/**
 * GET /api/arena/me — oyun merkezinin tek isteği: bütün oyunlarda kişisel rekor
 * ve sıra (Türkiye geneli). Eski sunucuda uç yoktur (404): çağıran taraf
 * cihazdaki rekora düşer.
 */
export const getMyArenaSummary = () =>
  get<{ games: Partial<Record<ArenaGame, ArenaGameSummary>>; weekStartsAt?: string; serverTime?: string }>(
    "/api/arena/me",
    undefined,
    { retry: false },
  );

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
  defenders: { id: number; name?: string; short: string; back: string; shirt: number | null }[];
  /** Takımın en çok kurtarış yapan kalecisi (atağın sonunda karşına çıkar). */
  keeper?: { id: number; name: string; short: string; back: string; shirt: number | null; saves: number } | null;
}

export interface SlalomRoster {
  scope?: "city" | "all";
  runners: SlalomRunner[];
  /** Maç başına yenilen gole göre AZALAN: son basamak ligin en iyi savunması. */
  defenses: SlalomDefense[];
}

export const getSlalomRoster = (cityId?: number | null) =>
  get<SlalomRoster>("/api/arena/slalom/roster", { cityId: cityId ?? undefined });
