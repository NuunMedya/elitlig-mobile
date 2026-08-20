import { del, get, post } from "../http";

/**
 * Favoriler — routes/favorites.js (sunucu).
 *
 * Takım, lig, sezon VE MAÇ favorileri tek çatı altında. Girişli üyede sunucuya
 * yazılır (push bildirimleri sunucudan hedeflenir); misafirde
 * FavoriteProvider yalnızca cihazda saklar.
 *
 * NEDEN MAÇ FAVORİSİ AYRI BİR TÜR: sunucu `MatchFollower` tablosunu tutar ve
 * bir maçı yıldızlayan üyeye O MAÇIN gollerini (`match_goal`) ve başlama
 * bildirimini (`match_start`) gönderir — takımı favoriye almadan tek maçı
 * izlemek mümkün olsun diye.
 */

export interface ServerFavorites {
  teamIds: number[];
  leagueIds: number[];
  seasonIds: number[];
  /** Yıldızlanan maçlar — sunucu bu alanı her zaman döndürür (boş dizi olabilir). */
  matchIds: number[];
}

export type FavoriteKind = "teams" | "leagues" | "seasons" | "matches";

export const getMyFavorites = () =>
  get<Partial<ServerFavorites>>("/api/favorites/me").then<ServerFavorites>((data) => ({
    // Eski sunucu sürümü `matchIds` göndermeyebilir; alanların hepsi normalize edilir
    // ki çağıran taraf her zaman dizi görsün.
    teamIds: data.teamIds ?? [],
    leagueIds: data.leagueIds ?? [],
    seasonIds: data.seasonIds ?? [],
    matchIds: data.matchIds ?? [],
  }));

export const followFavorite = (kind: FavoriteKind, id: number) =>
  post<{ message: string; following: boolean }>(`/api/favorites/${kind}/${id}`);

export const unfollowFavorite = (kind: FavoriteKind, id: number) =>
  del<{ message: string; following: boolean }>(`/api/favorites/${kind}/${id}`);

/**
 * Bir maçı kaç kişinin takip ettiği. Oturum GEREKTİRMEZ — misafir de görür,
 * maç detayında "N kişi takip ediyor" sosyal kanıtı için kullanılır.
 */
export const getMatchFollowerCount = (matchId: number) =>
  get<{ matchId: number; count: number }>(`/api/favorites/matches/${matchId}/count`);
