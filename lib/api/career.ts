import { get, put } from "../http";

/**
 * Kariyer Modu — routes/career.js, routes/predictions.js (elitlig-server).
 *
 * EKONOMİ (Kasım 2026): XP yalnız SAHADAN (gerçek maç performansı) ve
 * GÖREVLERDEN (haftalık + kariyer görevleri, rozetler) gelir; Elit Seviye ve
 * XP sıralaması bundan kurulur. Oyunlar, Tahmin Ligi ve Fantezi XP VERMEZ:
 * Kulüp Şehri'ne YILDIZ verir. XP de yıldıza çevrilir (10 XP = 1 yıldız).
 * Katmanlar (saha · tribun · arena) XP defterindeki eski ayrımdır; eski oyun
 * ve tahmin XP'si geçmişte kalır, oyun görevlerinin XP'si arena katmanına
 * yazılabilir.
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

/**
 * Görev kategorisi (ekrandaki sekmeler): saha (gerçek maç) · oyun (mini oyunlar,
 * bulmacalar) · sehir (Kulüp Şehri) · tribun (Tahmin Ligi, Fantezi, maçın
 * oyuncusu). Eski sunucu `kesif` (keşif / topluluk) da gönderebilir: ekranda
 * Tribün sekmesine düşer. Hiç göndermezse katmandan türetilir (lib/quests.ts).
 */
export type QuestCategory = "saha" | "oyun" | "sehir" | "tribun" | "kesif";

export type QuestDifficulty = "kolay" | "orta" | "zor";

/** Görev ilerlemesi (yeni sözleşme). Eski sunucu `progress`i düz sayı gönderir. */
export interface QuestProgressShape {
  current: number;
  target: number;
  /** "maç", "gol", "bölüm", "tahmin"… */
  unit?: string | null;
}

/**
 * Ekranın kullandığı (normalize edilmiş) görev. Sunucudan gelen ham görev
 * `normalizeQuest` ile bu biçime çevrilir: `progress` hep sayıdır, `xp` hep
 * ödül XP'sidir (`rewardXp` varsa o), `stars` bonus yıldızdır (yoksa 0).
 */
export interface CareerQuest {
  code: string;
  /** XP'nin yazıldığı katman. */
  layer: CareerLayer;
  category?: QuestCategory;
  tier?: 1 | 2 | 3;
  difficulty?: QuestDifficulty;
  /** Görevin kendi simgesi (Ionicons adı); yoksa kategori simgesi. */
  icon?: string | null;
  /** Görevi yapmak için açılacak uygulama içi bağlantı ("/savunma"…); yoksa `go`. */
  route?: string | null;
  /** Görevi yapmak için açılacak yer (eski anahtar; bkz. lib/quests.ts QUEST_ROUTES). */
  go?: string | null;
  /** Görev tek bir mini oyuna bağlıysa oyun anahtarı. */
  game?: string | null;
  /** Haftanın oyununun görevi. */
  featured?: boolean;
  /** Üyenin geçen haftaki sırasında olmayan görev. */
  is_new?: boolean;
  title: string;
  description: string;
  progress: number;
  target: number;
  /** İlerlemenin birimi ("maç", "bölüm"…); yoksa yalnız sayı yazılır. */
  unit?: string | null;
  done: boolean;
  /** Ödül XP'si. */
  xp: number;
  /** Ödülle gelen bonus yıldız (Kulüp Şehri); yoksa 0. */
  stars?: number;
}

/** Sunucudan gelen ham görev (eski + yeni alanlar, hepsi isteğe bağlı olabilir). */
type CareerQuestWire = Omit<CareerQuest, "progress" | "xp" | "stars" | "target"> & {
  progress?: number | QuestProgressShape | null;
  /** Sunucu `progress`i eski istemciler için sayı tutar; nesne biçimi buradadır. */
  progress_detail?: QuestProgressShape | null;
  target?: number | null;
  xp?: number | null;
  rewardXp?: number | null;
  rewardStars?: number | null;
  reward_xp?: number | null;
  reward_stars?: number | null;
};

const finite = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);
const TIER_OF: Record<QuestDifficulty, 1 | 2 | 3> = { kolay: 1, orta: 2, zor: 3 };
const DIFFICULTY_OF: Record<number, QuestDifficulty> = { 1: "kolay", 2: "orta", 3: "zor" };

/** Ham görevi ekran biçimine çevirir; eksik yeni alanlar eski alanlardan doldurulur. */
export function normalizeQuest(raw: CareerQuestWire): CareerQuest {
  const shaped =
    raw.progress_detail && typeof raw.progress_detail === "object"
      ? raw.progress_detail
      : raw.progress && typeof raw.progress === "object"
        ? raw.progress
        : null;
  const target = Math.max(0, finite(shaped?.target) ?? finite(raw.target) ?? 1);
  const current = Math.max(0, finite(shaped?.current) ?? finite(raw.progress) ?? 0);
  const difficulty = raw.difficulty ?? (raw.tier ? DIFFICULTY_OF[raw.tier] : undefined);
  return {
    ...raw,
    tier: raw.tier ?? (difficulty ? TIER_OF[difficulty] : undefined),
    difficulty,
    progress: raw.done ? Math.max(current, target) : Math.min(current, target || current),
    target,
    unit: shaped?.unit ?? raw.unit ?? null,
    xp: Math.max(0, finite(raw.rewardXp) ?? finite(raw.reward_xp) ?? finite(raw.xp) ?? 0),
    stars: Math.max(0, finite(raw.rewardStars) ?? finite(raw.reward_stars) ?? 0),
  };
}

/** Haftanın 40 görevlik sırası: 20 açık, biten yerine sıradaki gelir. */
export interface WeeklyQuests {
  active: CareerQuest[];
  completed: CareerQuest[];
  revealed: number;
  total: number;
  done_count: number;
  locked: number;
  bonuses: { at: number; xp: number; earned: boolean }[];
  /** Açık görevlerin kategori dökümü (yeni sunucu). */
  categories?: { key: QuestCategory; label: string; total: number; done: number }[];
  /** Haftanın oyunu: görevleri sıraya öncelikli girer. */
  featured?: { game: string; title: string } | null;
  /** Açık ve bitmemiş "bu hafta yeni" görev sayısı. */
  new_count?: number;
  /** Aynı anda açık görev sayısı (yeni sunucu). */
  slots?: number;
}

/** Tüm zamanlar kariyer görevi: zincirin sıradaki kademesi. */
export interface CareerChain {
  code: string;
  layer: CareerLayer;
  title: string;
  description: string;
  tier: number;
  tiers: number;
  completed_tiers: number;
  value: number;
  progress: number;
  target: number;
  xp: number;
  done: boolean;
}

export interface StandardXpRule {
  layer: CareerLayer;
  label: string;
  xp: number;
}

export interface CareerSummary {
  level: CareerLevel;
  layers: Record<CareerLayer, number>;
  /** Bu hafta (Pazartesi'den beri) kazanılan XP; eski sunucuda yok. */
  layers_week?: Record<CareerLayer, number>;
  card: EliteCard | null;
  achievements: CareerAchievement[];
  new_achievements: string[];
  quests: CareerQuest[];
  weekly_quests?: WeeklyQuests;
  career_quests?: CareerChain[];
  /** Hafta Türkiye saatiyle döner (Pazartesi 00:00). server_time: sunucunun "şimdi"si. */
  week: { key: string; starts_at?: string; ends_at: string; server_time?: string };
  recent: { layer: CareerLayer; source: string; xp: number; label: string | null; created_at: string }[];
  rules: {
    arena_daily_cap: number;
    quest_xp: number;
    quest_tier_xp?: Record<string, number>;
    quest_bonus?: Record<string, number>;
    quest_categories?: { key: QuestCategory; label: string }[];
    active_slots?: number;
    standard?: StandardXpRule[];
  };
}

export interface PlayerCareer {
  card: EliteCard;
  level: CareerLevel | null;
  achievements: { code: string; title: string; layer: CareerLayer; unlocked_at: string }[];
}

type CareerSummaryWire = Omit<CareerSummary, "quests" | "weekly_quests"> & {
  quests?: CareerQuestWire[] | null;
  weekly_quests?: (Omit<WeeklyQuests, "active" | "completed"> & { active?: CareerQuestWire[] | null; completed?: CareerQuestWire[] | null }) | null;
};

/** Görevler hep aynı biçimde gelsin diye yanıt burada normalize edilir (eski + yeni sunucu). */
export function normalizeCareer(raw: CareerSummaryWire): CareerSummary {
  const list = (items?: CareerQuestWire[] | null) => (Array.isArray(items) ? items.map(normalizeQuest) : []);
  const weekly = raw.weekly_quests;
  return {
    ...raw,
    quests: list(raw.quests),
    weekly_quests: weekly
      ? { ...weekly, active: list(weekly.active), completed: list(weekly.completed), bonuses: Array.isArray(weekly.bonuses) ? weekly.bonuses : [] }
      : undefined,
  };
}

export const getMyCareer = () => get<CareerSummaryWire>("/api/career/me", undefined, { retry: false }).then(normalizeCareer);

export const getPlayerCareer = (playerId: number) => get<PlayerCareer>(`/api/career/players/${playerId}`);

/* ───────────────────────── Takım görevleri + saha sıralaması ───────────────────────── */

/** Dönem: haftalık (ISO hafta, Pazartesi) ya da aylık (takvim ayı). */
export type PeriodKind = "week" | "month";

/** Takımın ortak hedefi: biten görev takıma puan, o dönemde oynayan üyeye XP. */
export interface TeamQuest {
  code: string;
  title: string;
  description: string;
  progress: number;
  target: number;
  done: boolean;
  points: number;
  xp: number;
}

export interface TeamRank {
  turkey: number | null;
  turkey_total: number;
  city: number | null;
  city_total: number;
  city_id: number | null;
  city_name: string | null;
}

export interface TeamPeriod {
  key: string;
  starts_at: string;
  ends_at: string;
  metrics: { matches: number; wins: number; draws: number; goals: number; requests: number; approved: number; players: number; rsvpPlayers: number; matchWeeks: number };
  quests: TeamQuest[];
  score: number;
  quest_points: number;
  /** Üye bu dönemde takımın bir maçında forma giydi mi (görev XP'si yalnız oynayana). */
  contributed: boolean;
  rank: TeamRank | null;
}

export interface MyTeamQuests {
  team: { id: number; name: string; logo: string | null; city: string | null; city_id: number | null } | null;
  periods?: Record<PeriodKind, TeamPeriod>;
  rules?: { match_points: number; win_points: number };
}

export const getMyTeamQuests = () => get<MyTeamQuests>("/api/career/team", undefined, { retry: false });

export type LeaderType = "players" | "teams";

export interface SahaLeaderRow {
  rank: number;
  /** Oyuncuda dönemin saha XP'si, takımda takım puanı. */
  score: number;
  matches: number;
  goals: number;
  name: string;
  city: string | null;
  city_id: number | null;
  // oyuncu
  player_id?: number;
  image?: string | null;
  assists?: number;
  team?: { id: number; name: string; logo: string | null } | null;
  // takım
  id?: number;
  logo?: string | null;
  wins?: number;
  quests_done?: number;
  quests_total?: number;
  // XP sıralaması (ekranda ortak satıra çevrilir)
  user_id?: number;
  team_name?: string | null;
  level?: number | null;
  layers?: Record<CareerLayer, number>;
}

export interface SahaLeaderboard {
  type: LeaderType;
  period: { kind: PeriodKind; key: string; starts_at: string; ends_at: string; offset: number };
  scope: { city_id: number | null; label: string };
  total: number;
  rows: SahaLeaderRow[];
  me: SahaLeaderRow | null;
}

/** Elit Seviye XP sıralaması: haftalık (bu hafta kazanılan) ya da tüm zamanlar. */
export type XpPeriod = "week" | "all";

export interface XpLeaderRow {
  rank: number;
  user_id: number;
  name: string;
  image: string | null;
  player_id: number | null;
  team_name: string | null;
  city: string | null;
  city_id: number | null;
  xp: number;
  layers: Record<CareerLayer, number>;
  /** Yalnız tüm zamanlarda. */
  level: number | null;
}

export interface XpLeaderboard {
  period: { kind: XpPeriod; key: string; starts_at: string | null; ends_at: string | null };
  scope: { city_id: number | null; label: string };
  total: number;
  rows: XpLeaderRow[];
  me: XpLeaderRow | null;
}

export const getXpLeaderboard = (params: { period: XpPeriod; cityId?: number | null }) =>
  get<XpLeaderboard>("/api/career/xp-leaderboard", { period: params.period, ...(params.cityId ? { cityId: params.cityId } : {}) });

export const getSahaLeaderboard = (params: { type: LeaderType; period: PeriodKind; offset?: number; cityId?: number | null }) =>
  get<SahaLeaderboard>("/api/career/leaderboard", {
    type: params.type,
    period: params.period,
    offset: params.offset ?? 0,
    ...(params.cityId ? { cityId: params.cityId } : {}),
  });

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
  prediction: {
    home: number;
    away: number;
    points: number | null;
    outcome: "exact" | "diff" | "result" | "miss" | "void" | null;
    /** Golcü tahmini (isteğe bağlı); tutarsa +3 puan. */
    scorer?: { id: number; name: string } | null;
    scorer_hit?: boolean | null;
  } | null;
}

export interface ScorerOption {
  id: number;
  name: string;
  image: string | null;
  position: string | null;
  goals: number;
}

export interface ScorerOptions {
  match_id: number;
  points: number;
  home: { team_id: number | null; name: string; players: ScorerOption[] };
  away: { team_id: number | null; name: string; players: ScorerOption[] };
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

/** `scorer` verilmezse sunucudaki golcü korunur; null temizler. */
export const savePrediction = (matchId: number, home: number, away: number, scorer?: number | null) =>
  put<{ match_id: number; home: number; away: number; scorer: number | null; message: string }>(
    `/api/predictions/${matchId}`,
    scorer === undefined ? { home, away } : { home, away, scorer },
  );

export const getScorerOptions = (matchId: number) => get<ScorerOptions>(`/api/predictions/${matchId}/scorers`);

export const getPredictionBoard = (
  period: "weekly" | "season",
  scope: { cityId?: number | null; leagueId?: number | null; seasonId?: number | null },
) =>
  get<{ period: string; entries: PredictionBoardEntry[]; me: PredictionBoardEntry | null; totalPlayers: number }>(
    "/api/predictions/leaderboard",
    { period, cityId: scope.cityId ?? undefined, leagueId: scope.leagueId ?? undefined, seasonId: scope.seasonId ?? undefined },
  );

export const LAYER_LABELS: Record<CareerLayer, string> = { saha: "Saha", tribun: "Seyirci", arena: "Oyunlar" };
