import { get, post } from "../http";

/**
 * Oyuncu profili bağlama — routes/User.js (sunucuda services/playerMatchService.js).
 *
 * NEDEN BU SIRA: üye önce veritabanındaki KENDİ kaydını arar ve sahiplenir;
 * yeni profil açmak en son yoldur. Yeni profil talebinde benzer isimli sahipsiz
 * kayıt varsa sunucu 409 POSSIBLE_DUPLICATE ve aday listesi döndürür; üye
 * "hiçbiri ben değilim" derse `confirmedNew: true` ile yeniden gönderilir.
 * Aynı isimli farklı oyuncular olabildiği için bu bir engel değil, sorudur.
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

/** Parametresiz: üyelik ad soyadına benzeyen sahipsiz kayıtlar. */
export const getPlayerCandidates = (params: { q?: string; teamId?: number } = {}) =>
  get<CandidateResponse>("/api/users/player-candidates", params, { retry: false });

export const getAccountRequests = () =>
  get<AccountRequest[] | { requests?: AccountRequest[]; accountRequests?: AccountRequest[] }>("/api/users/account-requests");

export const requestPlayerClaim = (playerId: number, note?: string) =>
  post<{ message: string }>("/api/users/request-player-claim", { playerId, note });

export const requestPlayerCreate = (body: PlayerCreateBody) =>
  post<{ message: string }>("/api/users/request-player-create", body);

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
