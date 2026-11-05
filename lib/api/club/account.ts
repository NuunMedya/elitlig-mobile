import { del, get, post } from "../../http";

/**
 * TAKIM YÖNETİM YETKİSİ — routes/User.js (web PlayerTeamPanel "Takımı devret"
 * ve "Takımdan istifa" eylemleri). Hepsi yönetici onaylı TALEPTİR.
 *
 *   GET    /api/users/account-requests        üyenin talepleri
 *   DELETE /api/users/account-requests/:id    bekleyen talebi geri çek
 *   POST   /api/users/request-team-resign     { note? }
 *   GET    /api/users/handover-candidates?q=  devir adayı arama (≥ 2 harf)
 *   POST   /api/users/request-team-transfer   { targetUsername, note? }
 */

export interface AccountRequest {
  id: number;
  type: string;
  status: "pending" | "approved" | "rejected" | "cancelled" | string;
  createdAt?: string;
  created_at?: string;
  adminNote?: string | null;
  admin_note?: string | null;
  reviewNote?: string | null;
}

export interface HandoverCandidate {
  username: string;
  fullName: string | null;
  city: string | null;
  hasTeam: boolean;
}

export const ACCOUNT_REQUEST_LABELS: Record<string, string> = {
  player_claim: "Oyuncu profilini sahiplenme",
  player_create: "Yeni oyuncu profili",
  player_unlink: "Oyuncu bağlantısını koparma",
  team_management: "Takım yönetimi yetkisi",
  team_create: "Yeni takım",
  team_resign: "Takımdan istifa",
  team_transfer: "Takımı devretme",
};

/** Takım kapsamındaki talep türleri — kimlik ekranı yalnız bunları listeler. */
export const TEAM_REQUEST_TYPES = new Set(["team_management", "team_create", "team_resign", "team_transfer"]);

export const getAccountRequests = () => get<{ requests: AccountRequest[] }>("/api/users/account-requests");

export const cancelAccountRequest = (id: number) => del<{ message: string }>(`/api/users/account-requests/${id}`);

export const requestTeamResign = (note?: string) =>
  post<{ message: string }>("/api/users/request-team-resign", note ? { note } : {});

export const searchHandoverCandidates = (q: string) =>
  get<{ candidates: HandoverCandidate[] }>("/api/users/handover-candidates", { q });

export const requestTeamTransfer = (targetUsername: string, note?: string) =>
  post<{ message: string }>("/api/users/request-team-transfer", { targetUsername, ...(note ? { note } : {}) });
