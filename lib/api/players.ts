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

/**
 * Oyuncunun Türkiye geneli sırası (gol krallığı). Sunucu `playerId` ile yalnız
 * oyuncunun satırını ve sırasını döner; eski sunucu tüm listeyi döner, o
 * durumda sıra listeden bulunur.
 */
export const getPlayerNationalRank = async (playerId: number, sort: PlayerSort = "topScorers"): Promise<number | null> => {
  const data = await get<PlayerListResponse & { rank?: number | null }>("/api/oyuncu-listesi", { playerId, sort });
  if (data && "rank" in data) return data.rank ?? null;
  const index = (data?.players ?? []).findIndex((item) => Number(item.id) === playerId);
  return index >= 0 ? index + 1 : null;
};

/** Oyuncu profili. Uç dizi döndürür (aynı id için tek satır). */
export const getPlayer = async (id: number) => {
  const rows = await get<ApiPlayer[] | ApiPlayer>(`/api/players/${id}`);
  return Array.isArray(rows) ? rows[0] ?? null : rows;
};

/** Bir takımın kadrosu — Players listesi team_id ile süzülür. */
export const getPlayersByCity = (city: string) =>
  get<ApiPlayer[]>(`/api/players/by-city/${encodeURIComponent(city)}`);
