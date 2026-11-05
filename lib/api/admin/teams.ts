import { del, get, patch, post } from "../../http";
import type { AuthUser } from "../../types";
import type { UploadFile } from "./leagues";
import { fetchScopedTeams, type LookupTeam } from "./lookups";

/**
 * TAKIM yönetim uçları.
 *
 *   routes/Teams.js              → /takimlar (liste, ekle, PATCH, logo, sil)
 *   routes/adminTeamsOverview.js → /api/admin/teams-overview (oyuncu/maç özeti)
 *   routes/adminEntities.js      → /api/admin/teams/:id/overview (profil)
 *   routes/PlayerTeams.js        → /oyuncu-takimlari (kadro bağı, transfer)
 *   routes/teamSeasonRoster.js   → /api/teams/:id/seasons (sezon katılımı ve kadrosu)
 *
 * PATCH /takimlar/:id yalnız TEAM_EDITABLE_FIELDS'i kabul eder
 * (team_name, logo, current_league, current_season, active, city, city_id,
 * founded_at, colors, attendence_date).
 */

export interface Team extends LookupTeam {
  founded_at?: string | null;
  colors?: string | null;
  attendence_date?: string | null;
  team_points?: number | null;
  createdAt?: string | null;
}

export const DEFAULT_TEAM_LOGO = "https://elitlig-space.fra1.digitaloceanspaces.com/teamLogos/default_team.png";

/** Varsayılan arma "logo yok" sayılır (Editor_Teams.hasLogo). */
export const hasRealLogo = (team: { logo?: string | null }) =>
  Boolean(team.logo) && team.logo !== DEFAULT_TEAM_LOGO && !String(team.logo).includes("elitlig_logo.png");

/** Takım kaydında boş lig/sezon "0" saklanabiliyor. */
export const cleanLabel = (value: unknown) => (value && String(value) !== "0" ? String(value) : "");

export const listTeams = (user: AuthUser | null | undefined) => fetchScopedTeams(user) as Promise<Team[]>;

export interface TeamOverviewRow {
  team_id: number;
  player_count: number;
  played_matches: number;
  last_match_date: string | null;
}

export const getTeamsOverview = () =>
  get<{ items?: TeamOverviewRow[] }>("/api/admin/teams-overview").then((d) => d.items ?? []);

export const TEAM_SORTS = [
  { key: "created:desc", label: "Önce en yeni" },
  { key: "name:asc", label: "A-Z" },
  { key: "players:desc", label: "Oyuncu sayısı" },
  { key: "matches:desc", label: "Oynanan maç" },
  { key: "lastMatch:desc", label: "Son maç" },
];

/* ---------- oluştur / güncelle / sil ---------- */

/** POST /takimlar/add — multipart; logo isteğe bağlı. 201 dışı yanıt (ör. aynı ad) hata sayılır. */
export async function createTeam(body: {
  team_name: string;
  current_league: string;
  current_season: string;
  city?: string | null;
  team_points?: number;
  contact?: Record<string, string>;
  logo?: UploadFile | null;
}) {
  const form = new FormData();
  form.append("team_name", body.team_name.trim());
  form.append("current_league", body.current_league);
  form.append("current_season", body.current_season);
  if (body.city) form.append("city", body.city);
  form.append("team_points", String(body.team_points ?? 0));
  if (body.contact && Object.keys(body.contact).length) form.append("contact", JSON.stringify(body.contact));
  if (body.logo) form.append("logo", body.logo as unknown as Blob);
  const result = await post<{ message?: string; id?: number; team?: Team; contact_error?: string }>("/takimlar/add", form, {
    timeout: 120_000,
  });
  // Sunucu aynı adlı takımda 200 + mesaj döndürüyor; kayıt oluşmadı demektir.
  if (result && !result.id && !result.team && result.message && /zaten var/i.test(result.message)) {
    throw new Error(result.message);
  }
  return result;
}

export type TeamPatch = Partial<
  Pick<Team, "team_name" | "current_league" | "current_season" | "active" | "city" | "founded_at" | "colors" | "attendence_date">
>;

export const updateTeam = (id: number, body: TeamPatch) => patch<{ message?: string }>(`/takimlar/${id}`, body);

export function uploadTeamLogo(id: number, file: UploadFile) {
  const form = new FormData();
  form.append("logo", file as unknown as Blob);
  return patch<{ message?: string; logo?: string; url?: string }>(`/takimlar/updateLogo/${id}`, form, { timeout: 120_000 });
}

export const deleteTeam = (id: number) => del<{ message?: string }>(`/takimlar/delete/${id}`);

/* ---------- profil özeti ---------- */

export interface PublicUser {
  id: number;
  username?: string | null;
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  role?: string | null;
  status?: string | null;
  created_at?: string | null;
}

export interface TeamPlayerRow {
  id: number;
  name: string;
  image: string | null;
  position: string | null;
  nationality: string | null;
  birth_date: string | null;
  active: boolean;
  is_loan: boolean;
  own_team_id: number | null;
  jersey_number: number | null;
  team_position: string | null;
  squad_role: string | null;
  linked_user_id: number | null;
  history?: { matches?: number; team_matches?: number; goals?: number; last_match_date?: string | null } | null;
}

export interface RosterCap {
  cap?: number | null;
  unlimited?: boolean;
  none?: boolean;
}

export interface TeamSeasonRoster {
  season_id: number;
  season?: { id?: number; season_name?: string; league_name?: string | null; is_archived?: boolean } | null;
  league_id: number | null;
  status?: {
    applies?: boolean;
    general?: RosterCap;
    licensed?: RosterCap;
    transferRights?: { unlimited?: boolean; none?: boolean; available?: number };
  } | null;
  draft?: { id: number; status: string; submitted_at?: string | null; last_decision?: string | null } | null;
  members: {
    id: number;
    player_id: number;
    membership_status: string;
    membership_kind: string;
    is_licensed: boolean;
    joined_at?: string | null;
    name: string;
    image?: string | null;
    position?: string | null;
  }[];
}

export interface TeamOverview {
  team: Team & Record<string, unknown>;
  manager: PublicUser | null;
  managers: PublicUser[];
  players: TeamPlayerRow[];
  loans: unknown[];
  seasons: TeamSeasonRoster[];
  pending: { changes: unknown[]; requests: unknown[]; photo_requests: unknown[] };
  inbox?: { conversation_id: number } | null;
}

export const getTeamOverview = (teamId: number) => get<TeamOverview>(`/api/admin/teams/${teamId}/overview`);

/* ---------- kadro bağı (oyuncu-takım) ---------- */

export const addPlayerToTeam = (b: { playerId: number; playerName: string; teamId: number; teamName: string }) =>
  post<{ message?: string }>("/oyuncu-takimlari/add", {
    player_id: b.playerId,
    player_name: b.playerName,
    team_id: b.teamId,
    team_name: b.teamName,
  });

export const removePlayerFromTeam = (playerId: number, teamId: number) =>
  del<{ message?: string }>(`/oyuncu-takimlari/${playerId}/${teamId}`);

export const removePlayersFromTeam = (teamId: number, playerIds: number[]) =>
  post<{ message?: string }>("/oyuncu-takimlari/remove-many", { team_id: teamId, player_ids: playerIds });

/** Yönetim transferi: eski bağ kalkar, yeni takıma bağlanır, ana takım değişir. */
export const transferPlayer = (b: { playerId: number; fromTeamId: number | null; toTeamId: number }) =>
  post<{ message?: string }>("/oyuncu-takimlari/transfer", {
    player_id: b.playerId,
    from_team_id: b.fromTeamId,
    to_team_id: b.toTeamId,
  });

/* ---------- sezon katılımı ve sezon kadrosu ---------- */

export interface TeamSeasonParticipation {
  season_id: number;
  league_id?: number | null;
  season?: { season_name?: string; league_name?: string | null } | null;
  league?: { league_name?: string } | null;
}

export const listTeamSeasons = (teamId: number) =>
  get<{ seasons?: TeamSeasonParticipation[] }>(`/api/teams/${teamId}/seasons`, { includeArchived: 1 }).then(
    (d) => d.seasons ?? []
  );

export const addTeamSeason = (teamId: number, seasonId: number, leagueId?: number | null) =>
  post<{ participation: unknown }>(`/api/teams/${teamId}/seasons`, { seasonId, leagueId: leagueId ?? null });

export const removeTeamSeason = (teamId: number, seasonId: number) =>
  del<{ message?: string }>(`/api/teams/${teamId}/seasons/${seasonId}`);

export const addSeasonRosterPlayer = (teamId: number, seasonId: number, playerId: number, isLicensed = false) =>
  post<{ member: unknown }>(`/api/teams/${teamId}/seasons/${seasonId}/roster/players`, { playerId, isLicensed });

export const removeSeasonRosterPlayer = (teamId: number, seasonId: number, playerId: number) =>
  del<unknown>(`/api/teams/${teamId}/seasons/${seasonId}/roster/players/${playerId}`);

export const MEMBERSHIP_STATUS_LABELS: Record<string, string> = {
  active: "Aktif",
  pending: "Onay bekliyor",
  removed: "Çıkarıldı",
};

export const capText = (cap?: RosterCap | null) =>
  !cap ? "—" : cap.unlimited ? "Sınırsız" : cap.none ? "0" : cap.cap != null ? String(cap.cap) : "—";

