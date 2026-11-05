/**
 * Rehber → Takımlar: "son bakılan takımlar" (web localStorage karşılığı).
 * Cihazda en çok 6 takım tutulur; okunamazsa boş liste döner.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "elitlig:rehber-recent-teams";

export interface RecentTeam {
  team_id: number;
  team_name: string;
  logo: string | null;
  city: string | null;
}

export async function readRecentTeams(): Promise<RecentTeam[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export async function pushRecentTeam(team: RecentTeam): Promise<RecentTeam[]> {
  try {
    const current = await readRecentTeams();
    const next = [
      { team_id: team.team_id, team_name: team.team_name, logo: team.logo || null, city: team.city || null },
      ...current.filter((t) => t.team_id !== team.team_id),
    ].slice(0, 6);
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
    return next;
  } catch {
    return [];
  }
}
