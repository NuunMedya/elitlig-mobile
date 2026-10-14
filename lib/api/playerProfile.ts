import { get, post, put } from "../http";

/**
 * Oyuncu profili / takım bağlama — routes/User.js (sunucuda services/playerMatchService.js).
 *
 * BİRLEŞİK AKIŞ: üye tek kutuya adını (ya da takım adını) yazar; benzer
 * kayıtlar listelenir. Ya listeden seçer (sahiplenme / yönetim talebi) ya da
 * aynı yerden yazdığı adla yeni kayıt açar. Yeni oyuncu talebi, üye adayları
 * gördükten sonra gönderildiği için `confirmedNew: true` taşır. Aynı isimli
 * farklı kayıtlar olabildiği için hiçbir aşama engel değildir.
 */

export interface PlayerCandidate {
  id: number;
  player_name: string;
  player_img: string | null;
  player_position: string | null;
  birth_year: number | null;
  city: string | null;
  total_matches: number;
  total_goals: number;
  teams: { id: number; team_name: string | null; logo: string | null }[];
  owned: boolean;
  score?: number;
}

export interface TeamCandidate {
  id: number;
  team_name: string;
  logo: string | null;
  city: string | null;
  roster_size: number;
  managed: boolean;
}

export interface CandidateResponse {
  mode: "suggested" | "search" | "team";
  query?: string;
  candidates: PlayerCandidate[];
}

export interface AccountRequest {
  id: number;
  type: string;
  status: string;
  target_id?: number | null;
  payload?: Record<string, unknown> | null;
  createdAt?: string;
}

export interface PlayerCreateBody {
  player_name: string;
  player_position?: string;
  birth_date?: string;
  city?: string;
  note?: string;
  confirmedNew?: boolean;
}

export const getPlayerCandidates = (q: string) =>
  get<CandidateResponse>("/api/users/player-candidates", { q }, { retry: false });

export const getTeamCandidates = (q: string) =>
  get<{ candidates: TeamCandidate[] }>("/api/users/team-candidates", { q }, { retry: false });

export const requestTeamManagement = (teamId: number, note?: string) =>
  put<{ message: string }>("/api/users/request-team-management", { teamId, note });

export const requestTeamCreate = (body: { team_name: string; founded_at?: string; colors?: string; city?: string; note?: string }) =>
  post<{ message: string }>("/api/users/request-team-create", body);

export const getAccountRequests = () =>
  get<AccountRequest[] | { requests?: AccountRequest[]; accountRequests?: AccountRequest[] }>("/api/users/account-requests");

export const requestPlayerClaim = (playerId: number, note?: string) =>
  post<{ message: string }>("/api/users/request-player-claim", { playerId, note });

export const requestPlayerCreate = (body: PlayerCreateBody) =>
  post<{ message: string }>("/api/users/request-player-create", body);

export function teamFacts(team: TeamCandidate): string {
  return [team.city || "İl bilgisi yok", `${team.roster_size || 0} oyuncu`].join(" · ");
}

/** Adayı ayırt eden bilgiler tek satırda: takım · mevki · doğum yılı · il · maç. */
export function candidateFacts(player: PlayerCandidate): string {
  return [
    player.teams?.length ? player.teams.map((t) => t.team_name).filter(Boolean).join(", ") : "Takım bilgisi yok",
    player.player_position,
    player.birth_year ? `${player.birth_year} doğumlu` : null,
    player.city,
    `${player.total_matches || 0} maç${player.total_goals ? ` · ${player.total_goals} gol` : ""}`,
  ].filter(Boolean).join(" · ");
}
