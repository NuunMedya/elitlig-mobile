import { get, post } from "../../http";

/**
 * KADROLAR — takımların yönetime gönderdiği iki tür kadro talebi.
 *
 *   sezon  — sezon kadrosu taslağı (routes/rosterDrafts.js → /api/roster-drafts/admin):
 *            fark (eklenen / çıkarılan / lisansı değişen) onaylanınca aktif kadroya işlenir.
 *   liste  — "Tüm Oyuncularım" listesi (routes/adminRosterSubmissions.js →
 *            /api/admin/roster-submissions): çıkarma ve transfer kalemleri tek tek
 *            karara bağlanır.
 *
 * Satır modeli web editor_pages/rosters/rosterItems.js ile aynıdır.
 */

export interface DraftMember {
  player_id: number;
  name: string;
  image?: string | null;
  position?: string | null;
  is_licensed?: boolean;
  kind?: string;
}

export interface RosterDraft {
  id: number;
  team_id: number;
  team?: { id: number; name: string; logo?: string | null; city?: string | null } | null;
  season?: { id: number; name: string; league_id?: number | null; league_name?: string | null } | null;
  status: string;
  submitted_at?: string | null;
  last_decision?: "approved" | "rejected" | null;
  last_decision_at?: string | null;
  last_decision_note?: string | null;
  note?: string | null;
  members?: DraftMember[];
  diff?: { additions?: DraftMember[]; removals?: DraftMember[]; license_changes?: DraftMember[] } | null;
  rules?: {
    applies?: boolean;
    general?: { cap?: number; unlimited?: boolean } | null;
    licensed?: { cap?: number; unlimited?: boolean } | null;
    transfer_rights?: { unlimited?: boolean; none?: boolean; available?: number } | null;
    rights_after?: number | null;
    rights_needed?: number | null;
  } | null;
  errors?: { code: string; message: string }[];
  scope?: { nationwide?: boolean; city?: string | null } | null;
}

export const listRosterDrafts = (status: "submitted" | "all") =>
  get<{ items?: RosterDraft[] }>("/api/roster-drafts/admin", { status }).then((d) => d.items ?? []);

export const approveRosterDraft = (id: number, note = "") =>
  post<{ message?: string }>(`/api/roster-drafts/admin/${id}/approve`, { note });

export const rejectRosterDraft = (id: number, note = "") =>
  post<{ message?: string }>(`/api/roster-drafts/admin/${id}/reject`, { note });

export interface SubmissionItem {
  index: number;
  type: "add" | "remove";
  kind?: string;
  player_id: number;
  decision: "pending" | "approved" | "rejected";
  decision_note?: string | null;
  note?: string | null;
  result?: { error?: string } | null;
  player?: {
    player_name?: string;
    player_img?: string | null;
    player_position?: string | null;
    current_team?: string | null;
    has_active_contract?: boolean;
    has_linked_account?: boolean;
    is_loan?: boolean;
    stats?: PlayerTeamStats | null;
  } | null;
  team_stats?: PlayerTeamStats | null;
  addition?: {
    status?: string;
    kind?: string;
    awaiting_admin?: boolean;
    terms?: { transfer_type?: string; transfer_fee?: number | string | null; currency?: string; contract_end_date?: string | null; guest_play_allowed?: boolean };
  } | null;
}

export interface PlayerTeamStats {
  matches: number;
  goals: number;
  guest_matches?: number;
  last_match_at?: string | null;
  seasons?: { label: string; matches: number }[];
}

export interface RosterSubmission {
  id: number;
  status: string;
  team?: { id: number; team_name: string; logo?: string | null; city?: string | null } | null;
  items?: SubmissionItem[];
  player_count?: number;
  submitted_at?: string | null;
  reviewed_at?: string | null;
  note?: string | null;
  submitted_by?: { username?: string; fullName?: string; phone?: string | null } | null;
}

export interface SubmissionDetail {
  submission: RosterSubmission;
  team: RosterSubmission["team"];
  items: SubmissionItem[];
  players: {
    id: number;
    player_name: string;
    player_img?: string | null;
    jersey_number?: number | null;
    team_position?: string | null;
    profile_position?: string | null;
    has_active_contract?: boolean;
    has_linked_account?: boolean;
    is_loan?: boolean;
    marked_for_removal?: boolean;
    stats: PlayerTeamStats;
  }[];
  seasons?: { id: number; label: string; matches: number }[];
}

export const listRosterSubmissions = (status: "submitted" | "all") =>
  get<{ submissions?: RosterSubmission[] }>("/api/admin/roster-submissions", { status }).then((d) => d.submissions ?? []);

export const getRosterSubmission = (id: number, seasonId?: number | null) =>
  get<SubmissionDetail>(`/api/admin/roster-submissions/${id}`, { seasonId: seasonId || undefined });

export const decideRosterSubmission = (
  id: number,
  decisions: { index: number; decision: "approved" | "rejected"; note: string }[],
  note: string
) =>
  post<{ message: string; results?: { result?: { error?: string } }[] }>(`/api/admin/roster-submissions/${id}/decide`, {
    decisions,
    note,
  });

/* ---------- ortak satır ---------- */

export type RowStatus = "pending" | "approved" | "partial" | "rejected";

export const ROW_STATUS_LABELS: Record<RowStatus, string> = {
  pending: "Onay bekliyor",
  approved: "Onaylandı",
  partial: "Kısmen onaylandı",
  rejected: "Reddedildi",
};

export interface RosterRow {
  key: string;
  kind: "sezon" | "liste";
  id: number;
  status: RowStatus | null;
  team: { id?: number; name: string; logo: string | null; city: string };
  season: { id: number; name: string } | null;
  league: { id: number; name: string } | null;
  at: string | null;
  counts: { add: number; remove: number; license: number; players: number };
  problems: number;
  draft?: RosterDraft;
  submission?: RosterSubmission;
}

export function draftRow(item: RosterDraft): RosterRow {
  const status: RowStatus | null =
    item.status === "submitted" ? "pending" : item.last_decision === "approved" ? "approved" : item.last_decision === "rejected" ? "rejected" : null;
  const diff = item.diff || {};
  return {
    key: `sezon:${item.id}`,
    kind: "sezon",
    id: item.id,
    status,
    team: { id: item.team?.id ?? item.team_id, name: item.team?.name || `Takım #${item.team_id}`, logo: item.team?.logo || null, city: item.team?.city || "" },
    season: item.season ? { id: item.season.id, name: item.season.name } : null,
    league: item.season?.league_id ? { id: item.season.league_id, name: item.season.league_name || `Lig #${item.season.league_id}` } : null,
    at: (item.status === "submitted" ? item.submitted_at : item.last_decision_at || item.submitted_at) ?? null,
    counts: { add: diff.additions?.length || 0, remove: diff.removals?.length || 0, license: diff.license_changes?.length || 0, players: 0 },
    problems: (item.errors || []).length,
    draft: item,
  };
}

export function submissionRow(item: RosterSubmission): RosterRow {
  const items = item.items || [];
  let status: RowStatus = "pending";
  if (item.status !== "submitted") {
    const approved = items.filter((i) => i.decision === "approved").length;
    const rejected = items.filter((i) => i.decision === "rejected").length;
    status = approved && rejected ? "partial" : rejected && !approved ? "rejected" : "approved";
  }
  return {
    key: `liste:${item.id}`,
    kind: "liste",
    id: item.id,
    status,
    team: { id: item.team?.id, name: item.team?.team_name || `Takım #${item.team?.id ?? "?"}`, logo: item.team?.logo || null, city: item.team?.city || "" },
    season: null,
    league: null,
    at: (item.status === "submitted" ? item.submitted_at : item.reviewed_at || item.submitted_at) ?? null,
    counts: {
      add: items.filter((i) => i.type === "add").length,
      remove: items.filter((i) => i.type === "remove").length,
      license: 0,
      players: item.player_count || 0,
    },
    problems: 0,
    submission: item,
  };
}

export function rowSummary(row: RosterRow): string {
  const parts: string[] = [];
  if (row.counts.add) parts.push(`${row.counts.add} ${row.kind === "liste" ? "transfer" : "ekleme"}`);
  if (row.counts.remove) parts.push(`${row.counts.remove} çıkarma`);
  if (row.counts.license) parts.push(`${row.counts.license} lisans`);
  if (row.kind === "liste" && row.counts.players) parts.push(`${row.counts.players} oyuncu`);
  return parts.join(" · ") || "Değişiklik yok";
}

/** "Onaylı" süzgeci kısmen onaylananları da kapsar. */
export const statusMatches = (row: RosterRow, filter: string) =>
  filter === "all" || row.status === filter || (filter === "approved" && row.status === "partial");
