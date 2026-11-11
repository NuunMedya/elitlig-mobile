import { get } from "../http";
import type { StandingRow } from "../types";

/**
 * Sezon grupları ve eleme etapları — routes/SeasonGroups.js (herkese açık
 * okuma uçları). Web'deki `services/seasonGroupsApi.js` ile aynı sözleşme.
 *
 * Bir sezon gruplara ("grup": puan tablosu) ve etaplara ("etap": eşleşme /
 * eleme turu) bölünebilir. Grup tanımlanmamış sezonda `groups` boştur ve
 * ekranlar bugünkü tek tabloyla çalışır.
 */

export type GroupKind = "grup" | "etap";
export type SlotSource = "EMPTY" | "TEAM" | "OVERALL_RANK" | "GROUP_RANK" | "MATCH_WINNER" | "MATCH_LOSER";

export interface GroupTeam {
  team_id: number;
  team_name: string;
  logo?: string | null;
}

export interface GroupSlot {
  id: number;
  slot_order?: number | null;
  source_type: SlotSource;
  team_id?: number | null;
  source_group_id?: number | null;
  source_rank?: number | null;
  source_matchup?: number | null;
  source_label?: string | null;
}

export interface MatchupSide {
  slot_id?: number | null;
  source_type?: SlotSource;
  /** Takım belli değilken gösterilen kaynak adı ("Son 16 2. eşleşme galibi"). */
  label?: string | null;
  team?: GroupTeam | null;
}

export interface MatchupMatch {
  id: number;
  home_team_id?: number | null;
  away_team_id?: number | null;
  home_score?: number | null;
  away_score?: number | null;
  date?: string | null;
  time?: string | null;
  venue?: string | null;
  /** "yayinlanmis" (bitti) · "canli" · "zamanlandi" … */
  status?: string | null;
}

export interface GroupMatchup {
  key?: string;
  index: number;
  leg?: number;
  home_slot_id?: number | null;
  away_slot_id?: number | null;
  home?: MatchupSide | null;
  away?: MatchupSide | null;
  match?: MatchupMatch | null;
  winner_team_id?: number | null;
  loser_team_id?: number | null;
  drawn?: boolean;
  /** "score" · "manual" (penaltılar / kura). */
  decided_by?: string | null;
  aggregate?: { home?: number | null; away?: number | null } | null;
}

export interface GroupRound {
  round: number;
  round_label?: string | null;
  leg?: number;
  meetings?: GroupMatchup[];
}

export interface SeasonGroup {
  id: number;
  season_id?: number;
  group_name: string;
  group_priority?: number | null;
  group_kind: GroupKind;
  double_round?: boolean;
  show_in_bracket?: boolean;
  /** Sezonun tamamını temsil eden varsayılan "Lig Aşaması" grubu. */
  is_default?: boolean;
  depth?: number;
  slots?: GroupSlot[];
  teams?: GroupTeam[];
  team_count?: number;
  matchups?: GroupMatchup[];
  schedule?: GroupRound[];
}

export interface QualificationZone {
  rank: number;
  targets?: { group_id: number; group_name: string; group_kind?: GroupKind }[];
}

export interface SeasonOverview {
  settings: {
    season_id?: number;
    show_overall_standings?: boolean;
    /** "sekme" · "agac" */
    group_display_mode?: string;
    standings_type?: string;
  } | null;
  groups: SeasonGroup[];
  qualification: { overall: QualificationZone[]; groups: Record<string, QualificationZone[]> };
}

const EMPTY: SeasonOverview = { settings: null, groups: [], qualification: { overall: [], groups: {} } };

/** Görünüm ayarları + gruplar + eleme bölgeleri (tek istek). */
export async function getSeasonOverview(seasonId: number): Promise<SeasonOverview> {
  const data = await get<Partial<SeasonOverview> | null>(`/api/season-groups/season/${seasonId}`);
  if (!data || typeof data !== "object") return EMPTY;
  return {
    settings: data.settings ?? null,
    groups: Array.isArray(data.groups) ? data.groups : [],
    qualification: {
      overall: Array.isArray(data.qualification?.overall) ? data.qualification.overall : [],
      groups:
        data.qualification?.groups && typeof data.qualification.groups === "object"
          ? data.qualification.groups
          : {},
    },
  };
}

/** Grubun KENDİ maçlarından hesaplanan puan tablosu. */
export async function getGroupStandings(groupId: number): Promise<StandingRow[]> {
  const data = await get<{ standings?: StandingRow[] } | StandingRow[] | null>(
    `/api/season-groups/${groupId}/standings`,
  );
  if (Array.isArray(data)) return data;
  return Array.isArray(data?.standings) ? data.standings : [];
}

export const seasonGroupKeys = {
  overview: (seasonId?: number | null) => ["season-groups", "overview", seasonId ?? null] as const,
  standings: (groupId?: number | null) => ["season-groups", "standings", groupId ?? null] as const,
};
