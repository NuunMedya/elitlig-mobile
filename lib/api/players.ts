import { get } from "../http";
import type { ApiPlayer, PlayerListResponse, PlayerSort, Scope } from "../types";

/**
 * Oyuncu uçları — routes/OyuncuListesi.js ve routes/Players.js
 */

/**
 * Sıralama listesi. Sunucu maç kadrolarından ve olaylarından hesaplar; yalnızca
 * yayınlanmış maçlar sayılır.
 */
export const getPlayerRankings = (
  scope: Partial<Pick<Scope, "cityId" | "leagueId" | "seasonId">> & { startDate?: string },
  sort: PlayerSort = "topScorers"
) =>
  get<PlayerListResponse>("/api/oyuncu-listesi", {
    cityId: scope.cityId,
    leagueId: scope.leagueId,
    seasonId: scope.seasonId,
    startDate: scope.startDate,
    sort,
  });

/** Oyuncu profili. Uç dizi döndürür (aynı id için tek satır). */
export const getPlayer = async (id: number) => {
  const rows = await get<ApiPlayer[] | ApiPlayer>(`/api/players/${id}`);
  return Array.isArray(rows) ? rows[0] ?? null : rows;
};

/** Bir takımın kadrosu — Players listesi team_id ile süzülür. */
export const getPlayersByCity = (city: string) =>
  get<ApiPlayer[]>(`/api/players/by-city/${encodeURIComponent(city)}`);
