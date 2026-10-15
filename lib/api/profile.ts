import { del, get, patch, post } from "../http";

/**
 * Profil ve takım kimliği düzenleme — routes/panel.js, routes/teamManagement.js.
 *
 * İKİ AKIŞ VAR:
 *   • ONAYLI: oyuncu profili (PATCH /api/panel/me/player) ve takım kimliği
 *     (PATCH /api/panel/me/team) değişiklik TALEBİ açar; yönetim onaylayana
 *     kadar profil değişmez. Aynı türde tek bekleyen talep olabilir (409
 *     CHANGE_ALREADY_PENDING); talep DELETE /api/panel/me/changes/:id ile
 *     geri çekilir.
 *   • DOĞRUDAN: forma renkleri (PATCH /api/team-management/settings) ve
 *     takım sayfası içeriği (PATCH /api/panel/me/team/details) hemen yazılır.
 *
 * Görsel önce POST /api/panel/me/uploads/:kind ile yüklenir; dönen adres
 * talebin gövdesine girer (`player_img` / `logo`).
 */

/** Onaylı oyuncu alanları — sunucudaki PLAYER_FIELDS ile aynı. */
export interface PlayerProfilePatch {
  player_name?: string;
  player_img?: string | null;
  player_position?: string | null;
  nationality?: string | null;
  birth_date?: string | null;
  city?: string | null;
  city_id?: number | null;
  phone?: string | null;
  email?: string | null;
}

/** Onaylı takım alanları — sunucudaki TEAM_FIELDS ile aynı. */
export interface TeamProfilePatch {
  team_name?: string;
  logo?: string | null;
  city?: string | null;
  city_id?: number | null;
  founded_at?: string | null;
  colors?: string | null;
}

export interface ChangeRequest {
  id: number;
  type: string;
  status: string;
  payload?: Record<string, unknown>;
  created_at?: string;
}

export const requestPlayerUpdate = (body: PlayerProfilePatch) =>
  patch<{ message: string; change: ChangeRequest }>("/api/panel/me/player", body);

export const requestTeamUpdate = (body: TeamProfilePatch) =>
  patch<{ message: string; change: ChangeRequest }>("/api/panel/me/team", body);

export const cancelChangeRequest = (id: number) =>
  del<{ message: string }>(`/api/panel/me/changes/${id}`);

/** Galeriden seçilen görseli yükler; dönen adres talebe yazılır. */
export function uploadProfileImage(kind: "player" | "team", file: { uri: string; name: string; type: string }) {
  const form = new FormData();
  // RN fetch dosya nesnesini { uri, name, type } üçlüsüyle tanır.
  form.append("image", file as unknown as Blob);
  return post<{ url: string; message?: string }>(`/api/panel/me/uploads/${kind}`, form, { timeout: 120_000 });
}

/* ───────────────────────── Takım sayfası içeriği ───────────────────────── */

export const SOCIAL_KEYS = ["instagram", "x", "facebook", "youtube", "tiktok", "website", "whatsapp"] as const;
export type SocialKey = (typeof SOCIAL_KEYS)[number];

export interface TeamAchievement {
  title: string;
  season?: string;
  rank?: string;
  note?: string;
}

export interface TeamDetails {
  history: string;
  motto: string;
  achievements: TeamAchievement[];
  goal_music_url: string;
  goal_music_title: string;
  social: Record<SocialKey, string>;
  captain_player_id: number | null;
  homepage: Record<string, boolean>;
  updated_at: string | null;
}

export interface TeamDetailsResponse {
  team_id: number;
  details: TeamDetails;
  captain: { id: number; player_name: string } | null;
}

export const getTeamDetails = () => get<TeamDetailsResponse>("/api/panel/me/team/details");

export const updateTeamDetails = (
  body: Partial<Pick<TeamDetails, "history" | "motto" | "achievements" | "goal_music_url" | "goal_music_title">> & {
    social?: Partial<Record<SocialKey, string>>;
  },
) => patch<{ message: string } & TeamDetailsResponse>("/api/panel/me/team/details", body);

/* ───────────────────────── Ortak sözlükler ───────────────────────── */

/**
 * Mevki sözlüğü — elitlig-client src/constants/positions.js ile aynı etiketler.
 * Kişisel profilde insan-okur ETİKET saklanır (sunucu notu).
 */
export const POSITION_LABELS = [
  "Kaleci",
  "Stoper",
  "Sol Bek",
  "Sağ Bek",
  "Defansif Orta Saha",
  "Merkez Orta Saha",
  "Ofansif Orta Saha",
  "Sol Kanat",
  "Sağ Kanat",
  "Forvet",
  "Santrafor",
] as const;

/** "GG.AA.YYYY" ↔ "YYYY-AA-GG" — sunucu ISO tarih ister. */
export function toIsoDate(display: string): string | null {
  const match = display.trim().match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (!match) return null;
  const [, d, m, y] = match;
  const iso = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== iso) return null;
  return iso;
}

export function toDisplayDate(iso: string | null | undefined): string {
  const match = String(iso ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : "";
}
