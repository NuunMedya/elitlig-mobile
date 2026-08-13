import { get } from "../http";
import type { ApiTeam } from "../types";

/** Takım uçları — routes/Teams.js (`/takimlar`) */

export const getTeams = () => get<ApiTeam[]>("/takimlar");

export const getTeamsByCity = (city: string) =>
  get<ApiTeam[]>(`/takimlar/by-city/${encodeURIComponent(city)}`);

export const getTeam = (id: number) => get<ApiTeam>(`/takimlar/${id}`);
