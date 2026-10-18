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

export interface FantasyPlayer {
  id: number;
  name: string;
  image: string | null;
  position: string | null;
  line: string;
  teamId: number;
  teamName: string | null;
  teamLogo: string | null;
  value: number;
  price: number;
}

export interface FantasyLineupView {
  week: string;
  playerIds: number[];
  captainId: number;
  points: number;
  breakdown: { id: number; points: number; captain: boolean }[];
}

export interface FantasyMe {
  week: {
    key: string;
    start: string;
    end: string;
    /** Kadro seçiminin açıldığı an (Cumartesi 00:00 TR). */
    opens_at?: string;
    /** Kadro kilidi (Pazartesi 16:00 TR); bütün kadro birden kilitlenir. */
    deadline: string;
    /** Seçim penceresi dışında true. */
    locked: boolean;
    matches: number;
    /** "open": seçim açık (key = kurulan hafta) · "live": kilitli, key = oynanan hafta. */
    mode?: "open" | "live";
    /** Kilitliyken sıradaki seçimin açılışı ve haftası. */
    next_opens_at?: string | null;
    next_key?: string | null;
  };
  lineup: FantasyLineupView | null;
  /** Seçim açıkken oynanmakta olan haftanın kadrosu. */
  live?: FantasyLineupView | null;
  suggestion: { playerIds: number[]; captainId: number } | null;
  history: { week: string; points: number }[];
  rules: { budget: number; size: number; maxPerTeam: number };
}

type Scope = { leagueId: number; seasonId: number };

export const getFantasyPool = (scope: Scope) =>
  get<{ budget: number; size: number; maxPerTeam: number; players: FantasyPlayer[] }>("/api/fantasy/pool", scope);
export const getFantasyMe = (scope: Scope) => get<FantasyMe>("/api/fantasy/me", scope, { retry: false });
export const saveFantasy = (scope: Scope, playerIds: number[], captainId: number) =>
  put<{ message: string; cost: number; week: string }>("/api/fantasy/me", { ...scope, playerIds, captainId });
export const getFantasyBoard = (scope: Scope, period: "week" | "season") =>
  get<{ entries: { userId: number; rank: number; name: string; teamName: string | null; points: number; weeks: number }[]; me: { rank: number; points: number; userId: number } | null }>(
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
