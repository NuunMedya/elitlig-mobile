import { get } from "../http";
import type { ApiPlayer, PlayerListResponse, PlayerRankRow, PlayerSort, Scope } from "../types";

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

/**
 * Uygulama geneli oyuncu adı araması (routes/Players.js `GET /api/players?search=`).
 * Sunucu adı Türkçe karakter/büyük harf farkı gözetmeden kelime başlarıyla
 * eşler; sonuç `limit` (en çok 100) ile sınırlıdır.
 */
export const searchPlayers = (term: string, limit = 30) =>
  get<ApiPlayer[]>("/api/players", { search: term.trim(), limit });

/**
 * Arama satırını sıralama satırı biçimine çevirir (kariyer toplamlarıyla);
 * aynı liste bileşeni iki kaynağı birlikte çizebilsin diye.
 */
export const playerSearchRow = (player: ApiPlayer & { team_name?: string | null }): PlayerRankRow => {
  const yellow = Number(player.total_yellow_cards ?? 0);
  const red = Number(player.total_red_cards ?? 0);
  const matches = Number(player.total_matches ?? 0);
  const goals = Number(player.total_goals ?? 0);
  const points = Number(player.total_points ?? 0);
  return {
    id: Number(player.id),
    name: player.player_name ?? "",
    image: player.player_img ?? null,
    teamId: player.team_id ?? null,
    teamName: player.team_name ?? null,
    city: player.city ?? null,
    cityId: player.city_id ?? null,
    matches,
    goals,
    assists: 0,
    yellow,
    red,
    cards: yellow + red,
    points,
    goalsPerMatch: matches ? goals / matches : 0,
    pointsPerMatch: matches ? points / matches : 0,
  };
};
