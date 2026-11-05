import { del, get, patch, post } from "../../http";
import type { AuthUser } from "../../types";
import type { UploadFile } from "./leagues";
import { isNationwide } from "./lookups";
import type { PublicUser } from "./teams";

/**
 * OYUNCU yönetim uçları.
 *
 *   routes/Players.js       → /api/players/admin-list (sayfalı liste + süzgeç
 *                             seçenekleri), /oyuncular/add, PATCH/DELETE /oyuncular/:id,
 *                             PATCH /oyuncular/updateImage/:id
 *   routes/adminEntities.js → /api/admin/players/:id/overview (profil)
 *   routes/PlayerTeams.js   → /oyuncu-takimlari (takım bağı)
 *
 * PATCH /oyuncular/:id yalnız PLAYER_EDITABLE_FIELDS'i kabul eder
 * (player_name, player_img, team_id, player_position, birth_date,
 * nationality, value, season, attendence_date, active, city, city_id).
 */

/** constants/positions.js — Players.player_position insan okur ETİKET saklar. */
export const POSITIONS = [
  { code: "KL", label: "Kaleci" },
  { code: "STP", label: "Stoper" },
  { code: "SLB", label: "Sol Bek" },
  { code: "SGB", label: "Sağ Bek" },
  { code: "DOS", label: "Defansif Orta Saha" },
  { code: "MOS", label: "Merkez Orta Saha" },
  { code: "OOS", label: "Ofansif Orta Saha" },
  { code: "SLK", label: "Sol Kanat" },
  { code: "SGK", label: "Sağ Kanat" },
  { code: "FOR", label: "Forvet" },
  { code: "SNT", label: "Santrafor" },
];

const POSITION_LABEL = new Map(POSITIONS.map((p) => [p.code, p.label]));

/** Kod ("STP") ya da etiket ("Stoper") → okunur etiket. */
export const positionLabel = (value: string | null | undefined) =>
  value ? POSITION_LABEL.get(String(value).toUpperCase()) ?? String(value) : "";

export const PLAYER_SORTS = [
  { key: "recent", label: "Önce en yeni" },
  { key: "name", label: "A-Z" },
  { key: "team", label: "Takıma göre" },
  { key: "matches", label: "En çok maç" },
  { key: "goals", label: "En çok gol" },
  { key: "last-match", label: "Son maç" },
  { key: "youngest", label: "En genç" },
];

export const DEFAULT_PLAYER_IMG = "https://elitlig-space.fra1.digitaloceanspaces.com/profilePhotos/default_player.png";

export interface AdminPlayerRow {
  id: number;
  player_name: string;
  player_img: string | null;
  team_id: number | null;
  team_name: string | null;
  player_position: string | null;
  nationality: string | null;
  season: string | null;
  birth_date: string | null;
  active: boolean | number | null;
  city: string | null;
  total_matches: number | null;
  total_goals: number | null;
  value: number | null;
  last_match_date?: string | null;
  createdAt?: string | null;
}

export interface AdminPlayerPage {
  items: AdminPlayerRow[];
  total: number;
  page: number;
  totalPages: number;
  facets?: {
    teams: { id: number; team_name: string }[];
    positions: string[];
    cities: string[];
    counts: { total: number; missingPhoto: number; passive: number };
  };
}

export interface PlayerListQuery {
  page: number;
  q?: string;
  sort?: string;
  teamId?: number | null;
  position?: string | null;
  status?: "active" | "passive" | "" | null;
  city?: string | null;
  missingPhoto?: boolean;
}

export const listPlayers = (user: AuthUser | null | undefined, query: PlayerListQuery) =>
  get<AdminPlayerPage>("/api/players/admin-list", {
    page: query.page,
    pageSize: 30,
    sort: query.sort || "recent",
    scopeCity: isNationwide(user) ? undefined : user?.city ?? undefined,
    city: query.city || undefined,
    teamId: query.teamId || undefined,
    position: query.position || undefined,
    status: query.status || undefined,
    missingPhoto: query.missingPhoto ? 1 : undefined,
    q: query.q?.trim() || undefined,
  });

/**
 * POST /oyuncular/add — multipart; takım zorunlu, foto isteğe bağlı. Sunucu
 * yalnız ad, takım, mevki, katılım tarihi ve ili yazar; doğum tarihi ve uyruk
 * gibi alanlar ardından PATCH ile işlenir (bkz. createPlayerWithDetails).
 */
export function createPlayer(body: {
  player_name: string;
  team_id: number;
  player_position?: string | null;
  city?: string | null;
  image?: UploadFile | null;
}) {
  const form = new FormData();
  form.append("player_name", body.player_name.trim());
  form.append("team_id", String(body.team_id));
  if (body.player_position) form.append("player_position", body.player_position);
  form.append("attendence_date", new Date().toISOString().slice(0, 10));
  if (body.city) form.append("city", body.city);
  if (body.image) form.append("player_img", body.image as unknown as Blob);
  return post<{ message?: string; player?: { id: number } }>("/oyuncular/add", form, { timeout: 120_000 });
}

/** Ekle + ek alanları (doğum tarihi, uyruk) tek akışta yazar. */
export async function createPlayerWithDetails(
  body: Parameters<typeof createPlayer>[0] & { birth_date?: string | null; nationality?: string | null }
) {
  const created = await createPlayer(body);
  const id = created.player?.id;
  const extra: PlayerPatch = {};
  if (body.birth_date) extra.birth_date = body.birth_date;
  if (body.nationality) extra.nationality = body.nationality;
  if (id && Object.keys(extra).length) await updatePlayer(id, extra);
  return created;
}

export type PlayerPatch = Partial<{
  player_name: string;
  team_id: number | null;
  player_position: string | null;
  birth_date: string | null;
  nationality: string | null;
  season: string | null;
  attendence_date: string | null;
  city: string | null;
  active: boolean;
  value: number;
}>;

export const updatePlayer = (id: number, body: PlayerPatch) => patch<{ message?: string }>(`/oyuncular/${id}`, body);

export function uploadPlayerImage(id: number, file: UploadFile) {
  const form = new FormData();
  form.append("player_img", file as unknown as Blob);
  return patch<{ message?: string; photoUrl?: string; url?: string }>(`/oyuncular/updateImage/${id}`, form, {
    timeout: 120_000,
  });
}

export const deletePlayer = (id: number) => del<{ message?: string }>(`/oyuncular/${id}`);

/* ---------- profil özeti ---------- */

export interface PlayerTeamLink {
  id: number;
  team_id: number;
  jersey_number?: number | null;
  team_position?: string | null;
  squad_role?: string | null;
  team?: { id: number; team_name: string; logo?: string | null; city?: string | null } | null;
}

export interface PlayerOverview {
  player: AdminPlayerRow & Record<string, unknown>;
  team: { id: number; team_name: string; logo?: string | null } | null;
  owner: PublicUser | null;
  teams: PlayerTeamLink[];
  loans: {
    id: number;
    status: string;
    start_date?: string | null;
    end_date?: string | null;
    team?: { team_name: string } | null;
    from_team?: { team_name: string } | null;
  }[];
  contracts: {
    id: number;
    public_id?: string;
    status: string;
    transfer_type: string;
    start_date?: string | null;
    end_date?: string | null;
    team?: { team_name: string } | null;
  }[];
  memberships: {
    id: number;
    team_id: number | null;
    team?: { team_name: string; logo?: string | null } | null;
    season?: { season_name: string; league_name?: string | null } | null;
    membership_status: string;
    membership_kind: string;
    is_licensed: boolean;
    joined_at?: string | null;
  }[];
  pending: { changes: unknown[]; requests: unknown[]; photo_requests: unknown[] };
}

export const getPlayerOverview = (playerId: number) => get<PlayerOverview>(`/api/admin/players/${playerId}/overview`);

export const CONTRACT_STATUS_LABELS: Record<string, string> = {
  PENDING_ACTIVATION: "Aktivasyon bekliyor",
  ACTIVE: "Aktif",
  COMPLETED: "Tamamlandı",
  TERMINATED: "Feshedildi",
  CANCELLED: "İptal edildi",
};

export const ageOf = (birth?: string | null): number | null => {
  if (!birth) return null;
  const d = new Date(birth);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) age -= 1;
  return age > 0 && age < 100 ? age : null;
};
