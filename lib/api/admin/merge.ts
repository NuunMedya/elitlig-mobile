import { get, post } from "../../http";

/**
 * BİRLEŞTİRME MERKEZLERİ — mükerrer takım ve oyuncu kayıtları.
 *
 *   routes/Teams.js   → /takimlar/merge-center/{related,preview,execute,history,:id/undo}
 *   routes/Players.js → /api/players/merge-center/{related,preview,execute,history,distinct,:id/undo}
 *
 * Akış (web TeamMergeCenter / PlayerMergeCenter ile aynı): benzer kayıt
 * grubunu aç → birleştirilecekleri işaretle (hiçbiri seçili gelmez) → asıl
 * kaydı ve çakışan her alanın değerini seç → önizle → onayla. Geçmişten geri
 * alınabilir.
 */

export interface MergeConflict<K extends "team_id" | "player_id"> {
  field: string;
  label: string;
  kind?: "text" | "image" | "date" | "json" | string;
  conflict: boolean;
  options: ({ value: unknown } & Record<K, number>)[];
}

/* ===================== TAKIM ===================== */

export const TEAM_MERGE_RULES = [
  { key: "same_name", label: "Ad aynı" },
  { key: "similar_name", label: "Ad benzer" },
];

export interface TeamMergeGroup {
  key: string;
  reasons: string[];
  played_each_other: number;
  strength?: number;
  teams: { id: number; team_name: string; logo?: string | null; city?: string | null; roster_size: number; match_count: number; last_match?: string | null }[];
}

export const getTeamMergeGroups = (rules: string[], q: string) =>
  get<{ groups?: TeamMergeGroup[] }>("/takimlar/merge-center/related", { rules: rules.join(","), q: q.trim() || undefined }).then(
    (d) => d.groups ?? []
  );

export interface TeamMergeView {
  profiles: {
    id: number;
    fields: { team_name: string; logo?: string | null; city?: string | null } & Record<string, unknown>;
    stats: { players: number; matches: number; first_match?: string | null; last_match?: string | null; followers?: number };
    seasons: { name: string }[];
    managers: { fullName?: string | null; username?: string | null }[];
    roster: { id: number; player_name: string; jersey_number?: number | null }[];
  }[];
  conflicts: MergeConflict<"team_id">[];
  shared_matches?: { label: string; date?: string | null }[];
  shared_seasons?: { name: string }[];
  shared_players?: unknown[];
  same_name_players?: { player_name: string }[];
}

export const previewTeamMerge = (ids: number[]) =>
  get<TeamMergeView>("/takimlar/merge-center/preview", { ids: ids.join(",") });

export interface TeamMergeChoices {
  targetId: number | null;
  fields: Record<string, number | null>;
}

export const executeTeamMerge = (teamIds: number[], choices: TeamMergeChoices) =>
  post<{ message?: string; standings_failed?: unknown[] }>("/takimlar/merge-center/execute", { teamIds, choices }, { timeout: 120_000 });

export interface MergeHistoryRow {
  id: number;
  status: "merged" | "undone" | string;
  created_at?: string | null;
  undone_at?: string | null;
  created_by?: { name?: string } | null;
  undone_by?: { name?: string } | null;
  summary?: Record<string, number>;
  target_name?: string;
  target_team_id?: number;
  target_player_id?: number;
  target?: { team_name?: string; player_name?: string; logo?: string | null; player_img?: string | null } | null;
  sources: { id: number; team_name?: string; player_name?: string; logo?: string | null; player_img?: string | null; city?: string | null }[];
}

export const getTeamMergeHistory = () =>
  get<{ merges?: MergeHistoryRow[] }>("/takimlar/merge-center/history").then((d) => d.merges ?? []);

export const undoTeamMerge = (id: number) => post<{ message?: string }>(`/takimlar/merge-center/${id}/undo`, {}, { timeout: 120_000 });

export const TEAM_COUNT_LABELS: Record<string, string> = {
  Players: "oyuncu",
  PlayerTeams: "kadro bağı",
  Matches: "maç",
  PlayerStatistics: "oyuncu istatistiği",
  OyuncuIstatistik: "maç istatistiği",
  MacKadrolari: "maç kadrosu satırı",
  MacOlaylari: "maç olayı",
  Standings: "puan durumu satırı",
  TeamSeasonParticipation: "sezon kaydı",
  TeamSeasonRoster: "sezon kadrosu",
  TeamSeasonRosterMember: "sezon kadrosu üyesi",
  TeamFollower: "takipçi",
  User: "yönetici",
};

/* ===================== OYUNCU ===================== */

export const PLAYER_MERGE_RULES = [
  { key: "same_name", label: "Ad soyad aynı" },
  { key: "name_typo", label: "Yazım farkı" },
  { key: "same_team_partial", label: "Aynı takımda, ad eksik" },
];

export interface MergePlayerCard {
  id: number;
  player_name: string;
  player_img?: string | null;
  city?: string | null;
  birth_year?: number | null;
  total_matches?: number;
  total_goals?: number;
  teams?: { id: number; team_name: string }[];
}

export interface PlayerMergeGroup {
  key: string;
  reasons: string[];
  players: MergePlayerCard[];
  links?: { a: number; b: number; reasons: string[]; teams: string[] }[];
}

export const getPlayerMergeGroups = (q: { rules: string[]; q: string; teamId?: number | null }) =>
  get<{ groups?: PlayerMergeGroup[] }>("/api/players/merge-center/related", {
    rules: q.rules.join(","),
    q: q.q.trim() || undefined,
    teamId: q.teamId || undefined,
  }).then((d) => d.groups ?? []);

export interface PlayerMergeView {
  profiles: {
    id: number;
    team_id?: number | null;
    fields: { player_name: string; player_img?: string | null; city?: string | null } & Record<string, unknown>;
    teams: { id: number; team_name: string }[];
    stats: { matches: number; goals: number; recorded_matches?: number; first_match?: string | null; last_match?: string | null };
    user?: { id: number; username: string; fullName?: string | null } | null;
  }[];
  conflicts: MergeConflict<"player_id">[];
  teams: { id: number; team_name: string; logo?: string | null; player_ids: number[] }[];
  users: { id: number; username: string; fullName?: string | null; city?: string | null; player_id: number }[];
  shared_matches?: { a: number; b: number; count: number }[];
}

export const previewPlayerMerge = (playerIds: number[]) =>
  post<PlayerMergeView>("/api/players/merge-center/preview", { playerIds });

export interface PlayerMergeChoices {
  targetId: number | null;
  fields: Record<string, number | null>;
  keepTeamIds: number[];
  primaryTeamId: number | null;
  /** Birden fazla üye bağlıysa zorunlu; null = hiçbiri. */
  userId?: number | null;
}

export const executePlayerMerge = (playerIds: number[], choices: PlayerMergeChoices) =>
  post<{ message?: string }>("/api/players/merge-center/execute", { playerIds, choices }, { timeout: 120_000 });

/** Seçilenleri "farklı kişiler" olarak işaretler; bir daha önerilmez. */
export const markPlayersDistinct = (playerIds: number[]) =>
  post<{ message?: string }>("/api/players/merge-center/distinct", { playerIds });

export const getPlayerMergeHistory = () =>
  get<{ merges?: MergeHistoryRow[] }>("/api/players/merge-center/history").then((d) => d.merges ?? []);

export const undoPlayerMerge = (id: number) =>
  post<{ message?: string }>(`/api/players/merge-center/${id}/undo`, {}, { timeout: 120_000 });

/** Elle ekleme araması — GET /api/users/player-candidates?q. */
export const searchPlayerCandidates = (q: string) =>
  get<{ candidates?: (MergePlayerCard & { birth_year?: number | null })[] }>("/api/users/player-candidates", { q }).then(
    (d) => d.candidates ?? []
  );

export const PLAYER_COUNT_LABELS: Record<string, string> = {
  PlayerStatistics: "maç istatistiği",
  MacKadrolari: "maç kadrosu",
  MacOlaylari: "maç olayı",
  OyuncuMacIstatistikleri: "detaylı istatistik",
  PlayerTeams: "takım bağı",
  TeamSeasonRosterMember: "sezon kadrosu",
  User: "üye bağı",
  Penalty: "ceza",
  PlayerAward: "ödül",
  TransferOffer: "transfer teklifi",
};

/** Seçim gerektiren ama seçilmemiş çakışmalar. */
export const unresolvedConflicts = <K extends "team_id" | "player_id">(
  conflicts: MergeConflict<K>[],
  fields: Record<string, number | null>
) => conflicts.filter((c) => c.conflict && c.options.length && fields[c.field] === undefined);

/** Alan değeri metni (görsel/json özetlenir). */
export function conflictValueText(kind: string | undefined, value: unknown): string {
  if (value == null || value === "") return "Boş";
  if (kind === "image") return "Görsel";
  if (kind === "date") {
    const d = new Date(String(value));
    return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString("tr-TR");
  }
  if (kind === "json") {
    let data: unknown = value;
    if (typeof data === "string") {
      try {
        data = JSON.parse(data);
      } catch {
        return String(value).slice(0, 80);
      }
    }
    const keys = data && typeof data === "object" ? Object.keys(data as object).filter((k) => (data as Record<string, unknown>)[k] != null) : [];
    return keys.length ? `${keys.length} bölüm dolu` : "Boş";
  }
  return String(value);
}
