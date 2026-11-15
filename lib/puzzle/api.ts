import { get, post } from "../http";
import type { PuzzleGameKey } from "./types";

/**
 * Canı olan bütün oyunlar (sözleşme §4, sunucu rules.LIFE_GAMES): bölümlü
 * oyunlar + sonsuz (slalom, sektir) + bilgi (seri, kimbu, tahmin). Günün Testi
 * canı yoktur (zaten günde 1).
 */
export type LifeGameKey = PuzzleGameKey | "slalom" | "sektir" | "seri" | "kimbu" | "tahmin";

/** Genel ödüllü reklam türleri (sözleşme §5; sunucu rules.ADS). */
export type AdKind = "life" | "double_coins" | "booster" | "spin";

/**
 * Bölüm kazancıyla gelen hediye (sözleşme §5): seri hediyesi, yıldız sandığı
 * (her 40 bölüm yıldızında), bölüm sandığı (her 10 bölümde).
 */
export interface PuzzleGift {
  kind: "streak" | "chest" | "star_chest" | "level_chest";
  title: string;
  coins?: number;
  boosters?: Record<string, number>;
  stars?: number;
}

/** Oyun başına üst üste kazanma serisi (0–3 basamak). */
export interface PuzzleStreak {
  wins: number;
  /** 0 = seri yok · 1/2/3 = basamak (sonraki bölümde ücretsiz güçlendirici). */
  tier: number;
  /** Bir sonraki basamak için gereken üst üste kazanç (son basamakta null). */
  next_at: number | null;
}

/** Ödüllü reklamın bugünkü hakkı. */
export interface AdQuota {
  left: number;
  per_day: number;
  seconds: number;
}

/** Hediye ilerlemesi (GET /me → profile.gifts; eski sunucuda yok). */
export interface PuzzleGiftsState {
  streaks: Partial<Record<PuzzleGameKey, PuzzleStreak>>;
  /** Yıldız sandığı: `progress` / `every` bölüm yıldızı; dolunca sandık açılır. */
  star_chest: { progress: number; every: number; opened: number };
  /** Bölüm sandığı: her `every` bölümde bir (ilk geçişte). */
  level_chest: { every: number };
}

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
  /**
   * Oyun başına can (her oyunun kendi 5 canı; eski sunucuda yok). Yeni sunucu
   * bütün LifeGameKey oyunlarını döndürür (sonsuz ve bilgi oyunları dahil).
   */
  lives_by_game?: Partial<Record<LifeGameKey, { lives: number; next_life_at: string | null }>>;
  /** `livesFor` ile üretilen görünümde: canların ait olduğu oyun. */
  life_game?: LifeGameKey;
  /** Genel ödüllü reklam hakları (yeni sunucu). */
  ads?: Partial<Record<AdKind, AdQuota>>;
  /** Seri / sandık hediyelerinin ilerlemesi (yeni sunucu). */
  gifts?: PuzzleGiftsState;
  /** Şehir 2.1: jeton harcama yerleri (eski sunucuda yok). */
  coin_shop?: CoinShop;
}

export interface CoinShop {
  trade: { week: string; used: number; left: number; per_week: number; coins: number; stars: number };
  saver_coins: number;
  kits: { key: string; title: string; price: number; owned: boolean }[];
}

/** 1.000 jeton → 10 Kulüp Şehri yıldızı (haftada sınırlı). */
export const tradeCoinsForStars = () => post<{ stars: number; coins: number; profile: PuzzleProfile }>("/api/puzzle/coins/stars", undefined, { retry: false });
/** Özel kulüp rengi (kozmetik). */
export const buyClubKit = (key: string) => post<{ kit: string; price: number; profile: PuzzleProfile }>(`/api/puzzle/kits/${encodeURIComponent(key)}`, undefined, { retry: false });
/** Seri koruyucu jetonla (reklam yerine). */
export const saveStreakWithCoins = () => post<{ saved: true; coins: number; streak: number; missed_day: string; daily: DailyStatus }>("/api/puzzle/daily/save-streak/coins", undefined, { retry: false });

/**
 * Profilin bir oyuna göre görünümü: `lives` / `next_life_at` o oyunun canı olur.
 * Cüzdan, can doldurma ve reklamla can bu görünümle çalışır. Eski sunucu
 * (tek havuz) için profil olduğu gibi döner.
 */
export function livesFor<T extends PuzzleProfile | undefined>(profile: T, game: LifeGameKey | null | undefined): T {
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

export interface FinishReward {
  coins: number;
  xp: number;
  firstClear: boolean;
  /** Bu kazançla gelen bölüm yıldızı (1–3 farkı) + bölüm primi. */
  starsGained: number;
  /** İlk geçişte bölüm primi (rules.levelBonus; yeni sunucu). */
  level_bonus?: number;
  /** Seri / sandık hediyeleri (yeni sunucu; jeton ve güçlendiriciler eklenmiş olarak gelir). */
  gifts?: PuzzleGift[];
  /** Bu oyundaki üst üste kazanma serisi (yeni sunucu). */
  streak?: PuzzleStreak;
  /** Reklamla 2 kat jeton hakkı (startAd("double_coins", game)). */
  ad_double?: { token_kind: "double_coins"; coins: number } | null;
}

export interface FinishResponse {
  won: boolean;
  reward: FinishReward | null;
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
/**
 * Seviyeyi başlatır. `play`: tek kullanımlık oyun jetonu; kazanç yalnız bu
 * jetonla yazılır (sunucu en kısa süreye ve günlük kazanç sınırına da bakar,
 * `wins_left`: bugün kalan kazanç hakkı). Eski sunucu ikisini de göndermez.
 */
export interface StartLevelResponse {
  ok: true;
  level: number;
  play?: string;
  wins_left?: number;
  /**
   * Seri hediyesi (yeni sunucu): bu bölümde ÜCRETSİZ kullanılacak
   * güçlendiriciler. Stoktan düşülmez; `finishLevel` boosters_used içine
   * YAZILMAZ (sunucu zaten saymaz). Boş nesne = seri yok.
   */
  streak_boosters?: Record<string, number>;
  streak?: PuzzleStreak;
  profile: PuzzleProfile;
}
export const startLevel = (game: PuzzleGameKey, level: number) =>
  post<StartLevelResponse>(`/api/puzzle/${game}/start`, { level }, { retry: false });
export const finishLevel = (
  game: PuzzleGameKey,
  body: { level: number; won: boolean; stars: number; boosters_used: Record<string, number>; play?: string }
) => post<FinishResponse>(`/api/puzzle/${game}/finish`, body, { retry: false });
export const buyItem = (item: string, game?: LifeGameKey | null) =>
  post<{ item: string; profile: PuzzleProfile }>("/api/puzzle/shop", game ? { item, game } : { item });
export const buildStadium = (id: string) =>
  post<{ item: StadiumItem; zone_done: boolean; bonus_coins: number; profile: PuzzleProfile }>("/api/puzzle/stadium/build", { id });
/** Ödüllü reklam: başlat (jeton) → reklam biter → ödülü iste (+1 can). */
export const startAdLife = (game?: LifeGameKey | null) =>
  post<{ token: string; seconds: number; left: number }>("/api/puzzle/ad-life/start", game ? { game } : undefined, { retry: false });
export const claimAdLife = (token: string) =>
  post<{ lives_added: number; profile: PuzzleProfile }>("/api/puzzle/ad-life/claim", { token }, { retry: false });
/**
 * Genel ödüllü reklam (sözleşme §5): başlat → reklam biter (en az `seconds`)
 * → ödülü iste. kind: life (game'in +1 canı) · double_coins (son kazancın
 * jetonu kadar ek jeton; kazanç başına 1) · booster (o oyundan 1 ücretsiz
 * güçlendirici) · spin (günlük çark). Günlük hak dolunca 429 AD_LIMIT.
 */
export const startAd = (kind: AdKind, game?: LifeGameKey | null) =>
  post<{ token: string; kind: AdKind; game: LifeGameKey | null; seconds: number; left: number }>(
    "/api/puzzle/ad/start",
    game ? { kind, game } : { kind },
    { retry: false },
  );
export interface AdClaimResponse {
  kind: AdKind;
  game: LifeGameKey | null;
  reward: { lives?: number; coins?: number; boosters?: Record<string, number>; stars?: number; title?: string };
  profile: PuzzleProfile;
}
export const claimAd = (token: string) => post<AdClaimResponse>("/api/puzzle/ad/claim", { token }, { retry: false });
/* ───────────────────────── ÇEVRİMDIŞI EŞİTLEME (sözleşme §7) ───────────────────────── */

interface OfflineEventBase {
  /** Cihazda üretilen uuid (sunucu tekrarı `dup` sayar). */
  id: string;
  /** Cihaz saati (ms). */
  startedAt: number;
  finishedAt: number;
  /** Monotonik ölçülen oyun süresi (ms). */
  durationMs: number;
}
export interface OfflineLevelEvent extends OfflineEventBase {
  kind: "level";
  game: PuzzleGameKey;
  level: number;
  won: boolean;
  stars: number;
  score?: number;
  boosters_used?: Record<string, number>;
}
export interface OfflineArenaEvent extends OfflineEventBase {
  kind: "arena";
  /** lib/api/arena ArenaGame. */
  game: string;
  score: number;
  stats?: Record<string, number> | null;
  v?: number;
}
export type OfflineEvent = OfflineLevelEvent | OfflineArenaEvent;

export interface SyncEventResult {
  id: string;
  status: "ok" | "dup" | "rejected";
  /** rejected: LEVEL_LOCKED · TOO_SHORT · TOO_OLD · FUTURE · DAILY_WIN_LIMIT · IMPLAUSIBLE · BAD_EVENT … */
  reason: string | null;
  /** ok olaylarda: bu olayın getirdiği yıldız / jeton. */
  stars?: number;
  coins?: number;
  /** arena: doğrulandı mı (yıldız yalnız doğrulanmışa). */
  verified?: boolean;
}
export interface SyncResponse {
  results: SyncEventResult[];
  gained: { stars: number; coins: number };
  profile: PuzzleProfile;
  games: Record<PuzzleGameKey, PuzzleGameProgress>;
}
/** Kuyruktaki çevrimdışı sonuçları tek istekte gönderir (en çok 100 olay). */
export const syncOffline = (events: OfflineEvent[]) => post<SyncResponse>("/api/puzzle/sync", { events }, { retry: false });

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

/**
 * XP kovası. Eski (3 günlük) sunucu: bir İstanbul günü, D+3 00:00'da yanar.
 * Haftalık sunucu (Ekonomi v3, `CityXp.mode === "weekly"`): bir İstanbul
 * haftası; `day` = haftanın Pazartesi'si, `claimable` = şu an toplanabilir
 * (geçen hafta, Pzt–Çar), `opens_at` = yıldıza dönüştüğü an (sonraki Pazartesi).
 */
export interface XpBucket {
  day: string;
  xp: number;
  expires_at: string;
  week?: string;
  claimable?: boolean;
  opens_at?: string;
}

/** Haftalık XP (Ekonomi v3): biriken hafta. */
export interface XpWeek {
  /** Haftanın Pazartesi'si (YYYY-MM-DD). */
  key: string;
  xp: number;
  /** Bu XP'nin yıldız karşılığı (10 XP = 1★; Pazartesi toplanabilir olur). */
  stars: number;
  /** Yıldıza dönüşeceği an (sonraki Pazartesi 00:00 İstanbul). */
  converts_at: string;
  /** Toplanabileceği son an (Perşembe 00:00 İstanbul). */
  claim_until: string;
}

/** Haftalık XP (Ekonomi v3): şu an toplanabilir hafta (Pzt–Çar). */
export interface XpClaimWeek {
  key: string;
  xp: number;
  stars: number;
  expires_at: string;
  /** Toplamanın son günü (Çarşamba, YYYY-MM-DD). */
  last_day: string;
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
  /** Şu an TOPLANABİLİR XP (haftalık sunucuda: geçen haftanın, Pzt–Çar). */
  pending: number;
  claimable_stars: number;
  claimed: number;
  /** "weekly": Ekonomi v3 (XP haftalık; Pazartesi dönüşür, 3 gün toplanır). Yoksa 3 günlük kural. */
  mode?: "weekly";
  /** Haftalık sunucu: biriken bu hafta. */
  week?: XpWeek;
  /** Haftalık sunucu: toplanabilir hafta (yalnız Pzt–Çar). */
  claim_week?: XpClaimWeek | null;
  /** Toplama penceresi (gün): eski kuralda kova ömrü, haftalıkta Pzt–Çar = 3. */
  window_days?: number;
  /**
   * Eski: 3 canlı gün, eskiden yeniye. Haftalık: [toplanabilir hafta?, bu hafta].
   */
  buckets?: XpBucket[];
  /** Sıradaki İstanbul gece yarısında yanacak XP (haftalıkta yalnız Çarşamba dolu). */
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
  /** Faz 5 · metric=season: sezon puanı; prestij seviyesi (step/season tablolarında). */
  season_score?: number | null;
  prestige?: number | null;
  me: boolean;
}

/** Faz 5 · metric=team: takım tesisleri sıralaması (satır bir takımdır). */
export interface CityTeamRow {
  rank: number;
  team_id: number;
  name: string;
  level: number;
  stage_title: string | null;
  points: number;
  contributors: number;
  size: number;
  el_pct: number;
  me: boolean;
}

/**
 * dev = gelişim puanı · stars = toplam yıldız · period_stars = aralıkta kazanılan yıldız ·
 * step = Şehir 2.0 merdiven basamağı (eşitlikte 2.0 gelişim) · beauty = güzellik puanı ·
 * el = dönemde kazanılan Elit Lira (period/from/to; varsayılan bu hafta) ·
 * transfer = dönemde akademiden oyuncu satışıyla kazanılan EL (Faz 3; aynı pencere kuralları).
 */
export type CityBoardMetric = "dev" | "stars" | "period_stars" | "step" | "beauty" | "el" | "transfer" | "season" | "team";

export interface CityBoardOptions {
  metric?: CityBoardMetric;
  /** Faz 5 · metric=season: sezon numarası (varsayılan şimdiki) ve yalnız takımım. */
  season?: number;
  team?: boolean;
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
  /** Faz 5 · metric=season: sezon, takım süzgeci (false: süzgeç yok · null: takımın yok). */
  season?: { id: number; title: string; name: string; range_text: string } | null;
  preseason?: { text: string; starts_at: string } | null;
  team?: false | null | { id: number; name: string };
  me?: {
    rank: number | null;
    season_score?: number | null;
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
    season: options?.season,
    team: options?.team ? 1 : undefined,
  });

/** Faz 5 · takım tesisleri sıralaması (metric=team; eski sunucuda `metric` yok). */
export interface CityTeamBoard {
  metric?: CityBoardMetric;
  total?: number | null;
  limit?: number | null;
  offset?: number | null;
  items: CityTeamRow[];
  me?: CityTeamRow | null;
}
export const getCityTeamBoard = (options?: { limit?: number; offset?: number }) =>
  get<CityTeamBoard>("/api/puzzle/city/leaderboard", { metric: "team", limit: options?.limit, offset: options?.offset || undefined });

export const getLeaderboard = (game: string, scope: "all" | "city") =>
  get<{ game: string; scope: string; items: LeaderboardRow[] }>("/api/puzzle/leaderboard", { game, scope });
