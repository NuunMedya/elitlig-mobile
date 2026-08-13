import { get } from "../http";
import type { Scope, StandingRow } from "../types";

/**
 * Puan durumu — routes/Standings.js
 *
 * Sunucu `display_points` alanını sezon tipine (standart / güç dengesi) göre
 * kendisi doldurur; istemci hangi puanı göstereceğine karar vermez.
 * Canlı maçlar varsayılan olarak tabloya geçici yansır (?includeLive=0 kapatır).
 */
export async function getStandings(scope: Pick<Scope, "cityId" | "leagueId" | "seasonId">) {
  const data = await get<StandingRow[] | { standings?: StandingRow[]; rows?: StandingRow[] }>(
    "/api/standings",
    { cityId: scope.cityId, leagueId: scope.leagueId, seasonId: scope.seasonId }
  );

  // Uç, sürüme göre düz dizi ya da sarmalanmış nesne dönebiliyor.
  if (Array.isArray(data)) return data;
  return data.standings ?? data.rows ?? [];
}
