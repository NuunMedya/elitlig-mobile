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

/**
 * Günlük giriş ödülünün bir günü. Eski sunucu yalnız `coins` (+ `boosters`)
 * yollar; yeni sunucu (Ekonomi A5) yıldız ve ekstraları da yollar.
 */
export interface DailyReward {
  coins: number;
  boosters?: Record<string, number>;
  /** Döngü günü (1–7; yeni sunucu). */
  day?: number;
  /** Kulüp Şehri yıldızı (yeni sunucu). */
  stars?: number;
  /** Gün 3: oyuncunun seçtiği 1 güçlendirici. */
  joker?: number;
  /** Gün 5: seçilen oyunun canları dolar. */
  life_refill?: boolean;
  /** Gün 7: "haftanın sandığı" (karma güçlendirici paketi). */
  chest?: boolean;
  /** Alım yanıtında: jokerin dönüştüğü güçlendirici ve canı dolan oyun. */
  joker_booster?: string;
  life_game?: PuzzleGameKey;
}

/** Uzun seri ödülü (14 · 30 · 60 · 100 gün): şehirde sembol yapı açar. */
export interface DailyMilestone {
  days: number;
  key: string;
  title: string;
  landmark?: string;
  stars?: number;
  reached?: boolean;
}

/** Seri koruyucu: haftada 1, ödüllü reklamla tek kaçırılmış gün kurtarılır. */
export interface DailySaver {
  available: boolean;
  used_this_week: boolean;
  per_week: number;
  missed_day: string | null;
  /** Korunacak seri. */
  streak: number;
  seconds: number;
}

/**
 * Günlük ödül durumu — GET /me → profile.daily ve GET /city → daily (aynı
 * nesne). Eski sunucu yalnız ilk beş alanı yollar.
 */
export interface DailyStatus {
  available: boolean;
  streak: number;
  next_streak: number;
  reward: DailyReward;
  rewards: DailyReward[];
  cycle_day?: number;
  milestones?: DailyMilestone[];
  next_milestone?: { days: number; key: string; title: string; in_days: number } | null;
  best_streak?: number;
  landmarks_unlocked?: string[];
  saver?: DailySaver;
  /** Ömür boyu günlük giriş yıldızı. */
  stars_total?: number;
}

export interface DailyClaimResponse {
  reward: DailyReward;
  streak: number;
  profile: PuzzleProfile;
  /** Bu alımla eklenen bütün yıldız (gün + uzun seri; yeni sunucu). */
  stars?: number;
  milestone?: (DailyMilestone & { stars?: number }) | null;
  landmarks_unlocked?: string[];
  daily?: DailyStatus;
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
  daily: DailyStatus;
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
/** joker: gün 3'ün güçlendiricisi · game: gün 5'te canı dolacak oyun (eski sunucu yok sayar). */
export const claimDaily = (body?: { joker?: string; game?: PuzzleGameKey }) =>
  post<DailyClaimResponse>("/api/puzzle/daily", body && (body.joker || body.game) ? body : undefined, { retry: false });
/** Seri koruyucu reklamı: başlat (jeton) → reklam biter → kurtar. */
export const startStreakSaver = () => post<{ token: string; seconds: number }>("/api/puzzle/daily/save-streak/start", undefined, { retry: false });
export const claimStreakSaver = (token: string) =>
  post<{ saved: boolean; streak: number; missed_day?: string | null; daily: DailyStatus }>("/api/puzzle/daily/save-streak", { token }, { retry: false });
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

/** Bir İstanbul gününün XP kovası: D gününün XP'si D+3 00:00'da yanar. */
export interface XpBucket {
  day: string;
  xp: number;
  expires_at: string;
}

/** Geçmiş XP'nin tek seferlik aktarımı (100 XP = 1 yıldız). */
export interface XpTransfer {
  at: string;
  xp: number;
  stars: number;
  rate: number;
  /** Yalnız aktarımın olduğu yanıtta true. */
  just_now?: boolean;
}

export interface CityXp {
  per_star: number;
  pending: number;
  claimable_stars: number;
  claimed: number;
  /** Yeni sunucu (3 günlük birikim); eskisinde yok. */
  window_days?: number;
  /** Her zaman 3 canlı gün, eskiden yeniye (önceki gün, dün, bugün). */
  buckets?: XpBucket[];
  /** Sıradaki İstanbul gece yarısında yanacak XP (en eski kova). */
  expiring_tomorrow?: number;
  expiring_at?: string | null;
  expired_total?: number;
  expired_recent?: { day: string; xp: number }[];
  transfer?: XpTransfer | null;
}

export interface MatchStarsBreakdown {
  goal: number;
  assist: number;
  rating: number;
  win: number;
  clean_sheet: number;
  motm: number;
}

export interface MatchStarsEntry {
  match_id: number;
  date: string;
  label: string;
  stars: number;
  base: number;
  bonus: number;
  /** false: haftalık 2 maç sınırının dışında (0 yıldız). */
  counted: boolean;
  breakdown: Partial<MatchStarsBreakdown>;
}

/** Maç yıldızı ayrıntısı (yeni sunucu). */
export interface MatchStarsDetail {
  week: { key: string; matches: number; cap_matches: number; stars: number; cap_stars: number };
  recent: MatchStarsEntry[];
  rules: {
    base: number;
    goal: number;
    assist: number;
    rating75: number;
    rating85: number;
    win: number;
    clean_sheet: number;
    motm: number;
    bonus_cap: number;
    week_matches: number;
  };
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
    /** Tahmin Ligi + Fantezi yıldızı (yeni sunucu; eskisinde yok). */
    tribun?: number;
    tribun_detail?: {
      predictions: number;
      fantasy: number;
      week: { predictions: number; fantasy: number; cap_predictions: number; cap_fantasy: number };
    };
    xp: number;
    /** Gerçek maç yıldızı (ömür boyu; yeni sunucu). */
    match?: number;
    match_detail?: MatchStarsDetail;
    /** Günlük giriş yıldızı (ömür boyu; yeni sunucu). */
    daily?: number;
    total: number;
    spent: number;
    available: number;
    arena_today?: number;
    arena_by_game?: Record<string, number>;
  };
  xp: CityXp;
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
  /** Kulüp Şehri 2.0 alanları — yalnız metric=step|beauty yanıtlarında. */
  step?: number | null;
  step_label?: string | null;
  step_title?: string | null;
  rung?: number | null;
  beauty?: number | null;
  dev2?: number | null;
  /** Faz 2 · metric=el: dönemde kazanılan EL ve (kazanılan − gider). */
  el?: number | null;
  el_net?: number | null;
  /** Faz 3 · metric=el|transfer: dönemde oyuncu satışından kazanılan EL. */
  transfer?: number | null;
  me: boolean;
}

/**
 * dev = gelişim puanı · stars = toplam yıldız · period_stars = aralıkta kazanılan yıldız ·
 * step = Şehir 2.0 merdiven basamağı (eşitlikte 2.0 gelişim) · beauty = güzellik puanı ·
 * el = dönemde kazanılan Elit Lira (period/from/to; varsayılan bu hafta) ·
 * transfer = dönemde akademiden oyuncu satışıyla kazanılan EL (Faz 3; aynı pencere kuralları).
 */
export type CityBoardMetric = "dev" | "stars" | "period_stars" | "step" | "beauty" | "el" | "transfer";

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
  me?: {
    rank: number | null;
    dev?: number | null;
    stars_total?: number | null;
    stars_period?: number | null;
    step?: number | null;
    step_label?: string | null;
    step_title?: string | null;
    rung?: number | null;
    beauty?: number | null;
    dev2?: number | null;
    el?: number | null;
    el_net?: number | null;
    transfer?: number | null;
  } | null;
}

export const cityKeys = {
  me: () => ["puzzle", "city"] as const,
  leaderboard: (scope: string, ...extra: (string | number | null | undefined)[]) =>
    ["puzzle", "city", "leaderboard", scope, ...extra] as const,
};

export interface CityResponse {
  city: CityState;
  tiers: Omit<CityTier, "index">[];
  /** Günlük giriş ödülü (yeni sunucu; /me → profile.daily ile aynı). */
  daily?: DailyStatus;
}

export const getCity = () => get<CityResponse>("/api/puzzle/city", undefined, { retry: false });
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
