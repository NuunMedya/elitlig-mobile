import { get } from "../http";

/**
 * Haftanın Enleri — GET /api/weekly-awards/public (routes/marketValues.js).
 * Yalnız yayınlanmış setler; kapsam (il/lig/sezon) ile süzülür.
 */

export type WeeklyAwardType =
  | "WEEKLY_PLAYER"
  | "WEEKLY_GOALKEEPER"
  | "WEEKLY_DEFENDER"
  | "WEEKLY_MIDFIELDER"
  | "WEEKLY_FORWARD"
  | "WEEKLY_FAIR_PLAY"
  | "WEEKLY_TEAM"
  | "WEEKLY_SQUAD_PLAYER";

export interface WeeklyAwardItem {
  id: number;
  award_type: WeeklyAwardType | string;
  position_slot: string | null;
  sort_order: number | null;
  player_id: number | null;
  player_name: string | null;
  player_img: string | null;
  player_position: string | null;
  player_team_id: number | null;
  player_team_name: string | null;
  player_team_logo: string | null;
  market_value: number | null;
  stats: { goals?: number; assists?: number; matches?: number; rating?: number | null } | null;
  team_id: number | null;
  team_name: string | null;
  team_logo: string | null;
}

export interface WeeklyAwardSet {
  id: number;
  title: string | null;
  start_date: string | null;
  end_date: string | null;
  formation: string | null;
  published_at: string | null;
  items: WeeklyAwardItem[];
}

export const getWeeklyAwards = (scope: { cityId?: number | null; leagueId?: number | null; seasonId?: number | null }) =>
  get<{ items: WeeklyAwardSet[] }>("/api/weekly-awards/public", {
    cityId: scope.cityId ?? undefined,
    leagueId: scope.leagueId ?? undefined,
    seasonId: scope.seasonId ?? undefined,
    limit: 8,
  }).then((data) => data.items ?? []);
