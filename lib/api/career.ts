import { get, put } from "../http";

/**
 * Kariyer Modu — routes/career.js, routes/predictions.js (elitlig-server).
 *
 * Elit Seviye üç katmandan beslenir (iç anahtar → ekranda görünen ad):
 * saha → Saha (gerçek maçlar), tribun → Seyirci (Tahmin Ligi, taraftar oyu,
 * tepkiler, Fantezi), arena → Oyunlar (doğrulanmış mini oyunlar). Oyunlar
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
  prediction: { home: number; away: number; points: number | null; outcome: "exact" | "diff" | "result" | "miss" | "void" | null } | null;
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

export const savePrediction = (matchId: number, home: number, away: number) =>
  put<{ match_id: number; home: number; away: number; message: string }>(`/api/predictions/${matchId}`, { home, away });

export const getPredictionBoard = (
  period: "weekly" | "season",
  scope: { cityId?: number | null; leagueId?: number | null; seasonId?: number | null },
) =>
  get<{ period: string; entries: PredictionBoardEntry[]; me: PredictionBoardEntry | null; totalPlayers: number }>(
    "/api/predictions/leaderboard",
    { period, cityId: scope.cityId ?? undefined, leagueId: scope.leagueId ?? undefined, seasonId: scope.seasonId ?? undefined },
  );

export const LAYER_LABELS: Record<CareerLayer, string> = { saha: "Saha", tribun: "Seyirci", arena: "Oyunlar" };
