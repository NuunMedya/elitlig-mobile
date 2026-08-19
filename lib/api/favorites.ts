import { del, get, post } from "../http";

/**
 * Favoriler — routes/favorites.js (sunucu).
 *
 * Takım, lig ve sezon favorileri tek çatı altında. Girişli üyede sunucuya
 * yazılır (push bildirimleri sunucudan hedeflenir); misafirde
 * FavoriteProvider yalnızca cihazda saklar.
 */

export interface ServerFavorites {
  teamIds: number[];
  leagueIds: number[];
  seasonIds: number[];
}

export type FavoriteKind = "teams" | "leagues" | "seasons";

export const getMyFavorites = () => get<ServerFavorites>("/api/favorites/me");

export const followFavorite = (kind: FavoriteKind, id: number) =>
  post<{ message: string; following: boolean }>(`/api/favorites/${kind}/${id}`);

export const unfollowFavorite = (kind: FavoriteKind, id: number) =>
  del<{ message: string; following: boolean }>(`/api/favorites/${kind}/${id}`);
