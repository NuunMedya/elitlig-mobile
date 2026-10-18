import { get, put } from "../http";

/**
 * Kariyer Modu — routes/career.js, routes/predictions.js (elitlig-server).
 *
 * Elit Seviye üç katmandan beslenir (iç anahtar → ekranda görünen ad):
 * saha → Saha (gerçek maçlar), tribun → Seyirci (maçları değerlendirmek: skor
 * ve golcü tahmini, maçın oyuncusu, Fantezi), arena → Oyunlar (doğrulanmış
 * mini oyunlar). Oyunlar
 * piyasa değerine dokunmaz; saha dışı XP seviyeyi en çok 30'a taşır.
 *
 * XP üç yoldan gelir: her maç / oyun / tahminin standart XP'si, haftalık
 * görevler (20 görevlik sıra, aynı anda 5 açık) ve tüm zamanlar kariyer
 * görevleri (kademeli) + rozetler.
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
  tier?: 1 | 2 | 3;
  /** Görevi yapmak için açılacak yer (bkz. app/kariyer.tsx QUEST_ROUTES). */
  go?: string | null;
  title: string;
  description: string;
  progress: number;
  target: number;
  done: boolean;
  xp: number;
}

/** Haftanın 20 görevlik sırası: 5 açık, biten yerine sıradaki gelir. */
export interface WeeklyQuests {
  active: CareerQuest[];
  completed: CareerQuest[];
  revealed: number;
  total: number;
  done_count: number;
  locked: number;
  bonuses: { at: number; xp: number; earned: boolean }[];
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
  week: { key: string; starts_at?: string; ends_at: string };
  recent: { layer: CareerLayer; source: string; xp: number; label: string | null; created_at: string }[];
  rules: { arena_daily_cap: number; quest_xp: number; active_slots?: number; standard?: StandardXpRule[] };
}

export interface PlayerCareer {
  card: EliteCard;
  level: CareerLevel | null;
  achievements: { code: string; title: string; layer: CareerLayer; unlocked_at: string }[];
}

export const getMyCareer = () => get<CareerSummary>("/api/career/me", undefined, { retry: false });

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
}

export interface SahaLeaderboard {
  type: LeaderType;
  period: { kind: PeriodKind; key: string; starts_at: string; ends_at: string; offset: number };
  scope: { city_id: number | null; label: string };
  total: number;
  rows: SahaLeaderRow[];
  me: SahaLeaderRow | null;
}

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
