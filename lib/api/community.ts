import { get, post, put } from "../http";

/**
 * Faz 4 — topluluk ve rekabet (elitlig-server):
 *   Kulüp Arenası, derbi düellosu      routes/arena.js
 *   Taraftar oylaması, olay tepkileri   routes/community.js
 *   Fantezi ElitLig                     routes/fantasy.js
 *   Sezon Özeti                         routes/career.js
 */

/* ───────────── Kulüp Arenası ───────────── */

export interface ClubEntry {
  rank: number | null;
  teamId: number;
  name?: string;
  logo?: string | null;
  points: number;
  members: number;
  games?: number;
}

export const getClubBoard = (cityId?: number | null) =>
  get<{ entries: ClubEntry[]; mine: ClubEntry | null; rules: { dailyGames: number; pointsPerGame: number } }>("/api/arena/clubs", {
    cityId: cityId ?? undefined,
  });

export interface DuelSide {
  teamId: number | null;
  name: string;
  score: number;
  participants: number;
  players: { playerId: number; name: string; image: string | null; best: number }[];
}

export interface Duel {
  matchId: number;
  date: string;
  time: string | null;
  kickoff: string;
  opensAt: string;
  status: "upcoming" | "open" | "closed";
  leader: "home" | "away" | null;
  home: DuelSide;
  away: DuelSide;
  rules: { game: string; top: number; days: number };
}

export const getDuel = (matchId: number) => get<Duel>(`/api/arena/duels/${matchId}`);
export const getMyDuel = () => get<{ duel: Duel | null; myTeamId?: number }>("/api/arena/duels/mine", undefined, { retry: false });

/* ───────────── Taraftar oylaması ───────────── */

export interface FanVoteCandidate {
  playerId: number;
  teamId: number | null;
  name: string;
  image: string | null;
  position: string | null;
  goals: number;
  assists: number;
  rating: number | null;
  votes: number;
  share: number;
}

export interface FanVoteState {
  matchId: number;
  open: boolean;
  closesAt: string | null;
  total: number;
  myVote: number | null;
  winner: { playerId: number; name: string; votes: number } | null;
  leader: { playerId: number; name: string; votes: number } | null;
  candidates: FanVoteCandidate[];
}

export const getFanVote = (matchId: number) => get<FanVoteState>(`/api/community/matches/${matchId}/fan-vote`);
export const castFanVote = (matchId: number, playerId: number) =>
  post<FanVoteState>(`/api/community/matches/${matchId}/fan-vote`, { playerId });

/* ───────────── Olay tepkileri ───────────── */

export type Reaction = "alkis" | "ates" | "vay" | "gulme";

export interface ReactionState {
  matchId: number;
  reactions: Reaction[];
  events: Record<string, Record<Reaction, number>>;
  mine: Record<string, Reaction>;
}

export const getReactions = (matchId: number) => get<ReactionState>(`/api/community/matches/${matchId}/reactions`);
export const sendReaction = (matchId: number, eventId: number, reaction: Reaction) =>
  post<ReactionState>(`/api/community/matches/${matchId}/reactions`, { eventId, reaction });

/* ───────────── Fantezi ElitLig ───────────── */

export type FantasyLine = "GK" | "DEF" | "MID" | "FWD" | "ANY";

export interface FantasyPlayer {
  id: number;
  name: string;
  image: string | null;
  position: string | null;
  line: FantasyLine | string;
  /** "Kaleci", "Defans", "Orta saha", "Hücum", "Mevkisiz" (yeni sunucu). */
  lineLabel?: string;
  teamId: number;
  teamName: string | null;
  teamLogo: string | null;
  value: number;
  /** Haftanın fiyatı (4,0–13,0, 0,5 adım). Hafta içinde değişmez. */
  price: number;
  /** Geçen haftanın fiyatı; veri yoksa null. */
  prevPrice?: number | null;
  trend?: "up" | "down" | "same" | "new";
  /** 0–100 fiyat reytingi. */
  rating?: number;
  /** Son 5 maçın yeniye ağırlıklı maç başı puanı. */
  form?: number | null;
  /** Sezon maç başı puanı. */
  ppm?: number | null;
  matches?: number;
  points?: number;
  goals?: number;
  assists?: number;
  /** Takımının son maçlarında oynama oranı (0–1). */
  activity?: number | null;
  /** Takımının son 3 maçında hiç oynamadı. */
  inactive?: boolean;
  /** Takımının son 5 maçındaki puanı (eskiden yeniye; oynamadıysa null). */
  last5?: (number | null)[];
}

export interface FantasyBreakdownItem {
  id: number;
  points: number;
  captain: boolean;
  vice?: boolean;
  base?: number;
  multiplier?: number;
  played?: boolean;
  /** Takımının bu haftada yayınlanmamış maçı var: puan henüz kesin değil. */
  pending?: boolean;
}

export interface FantasyLineupView {
  week: string;
  playerIds: number[];
  captainId: number;
  viceCaptainId?: number | null;
  points: number;
  breakdown: FantasyBreakdownItem[];
}

export interface FantasyRules {
  budget: number;
  size: number;
  maxPerTeam: number;
  maxPerLine?: number;
  goalkeepers?: number;
  requireGoalkeeper?: boolean;
  captainMultiplier?: number;
  viceCaptain?: boolean;
  priceMin?: number;
  priceMax?: number;
  points?: Record<string, unknown>;
}

export interface FantasyMe {
  week: {
    key: string;
    start: string;
    end: string;
    /** İlk başlamamış maçın saati (o an bir takımın oyuncuları kilitlenir). */
    deadline: string;
    /** Eski sunucu: true ise bütün hafta kilitli. Yeni sunucuda hep false. */
    locked: boolean;
    matches: number;
    /** "current": bu haftanın kadrosu düzenleniyor · "next": bu hafta bitti, gelecek hafta. */
    mode?: "current" | "next";
    current_key?: string;
    last_kickoff?: string | null;
    /** Bu haftaki maçı başlamış takımlar: oyuncuları eklenemez/çıkarılamaz. */
    lockedTeamIds?: number[];
  };
  lineup: FantasyLineupView | null;
  /** Gelecek hafta düzenlenirken bu haftanın oynanmış kadrosu. */
  live?: FantasyLineupView | null;
  suggestion: { playerIds: number[]; captainId: number; viceCaptainId?: number | null } | null;
  history: { week: string; points: number }[];
  rules: FantasyRules;
}

export interface FantasyPool {
  budget: number;
  size: number;
  maxPerTeam: number;
  /** Fiyatların geçerli olduğu hafta. */
  week?: string;
  rules?: FantasyRules;
  players: FantasyPlayer[];
}

export interface FantasyBoardEntry {
  userId: number;
  rank: number;
  name: string;
  teamName: string | null;
  points: number;
  weeks: number;
  bestWeek?: number;
}

type Scope = { leagueId: number; seasonId: number };

export const getFantasyPool = (scope: Scope) => get<FantasyPool>("/api/fantasy/pool", scope);
export const getFantasyMe = (scope: Scope) => get<FantasyMe>("/api/fantasy/me", scope, { retry: false });
export const saveFantasy = (scope: Scope, playerIds: number[], captainId: number, viceCaptainId?: number | null) =>
  put<{ message: string; cost: number; week: string; remaining?: number; viceCaptainId?: number | null }>("/api/fantasy/me", {
    ...scope,
    playerIds,
    captainId,
    ...(viceCaptainId ? { viceCaptainId } : {}),
  });
export const getFantasyBoard = (scope: Scope, period: "week" | "season") =>
  get<{ period?: string; week?: string | null; entries: FantasyBoardEntry[]; me: FantasyBoardEntry | null; totalPlayers?: number }>(
    "/api/fantasy/leaderboard",
    { ...scope, period },
  );

/* ───────────── Sezon Özeti ───────────── */

export interface SeasonSummary {
  season: { id: number; name: string | null; league: string | null };
  seasons: number[];
  player: { id: number; name: string; image: string | null; position: string | null };
  totals: { matches: number; goals: number; assists: number; saves: number; yellow: number; red: number; rating: number | null };
  record: { wins: number; draws: number; losses: number };
  bestMatch: { matchId: number; label: string; date: string; goals: number; assists: number; rating: number | null } | null;
  awards: { motm: number; weekly: number; total: number };
  goalRank: { rank: number; of: number; percentile: number | null } | null;
  fanVoteWins: number;
  predictions: { points: number; exact: number };
  card: import("./career").EliteCard;
}

export const getSeasonSummary = (seasonId?: number | null) =>
  get<SeasonSummary>("/api/career/season-summary", { seasonId: seasonId ?? undefined }, { retry: false });
