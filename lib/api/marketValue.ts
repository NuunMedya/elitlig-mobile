/**
 * Piyasa değeri uçları — routes/marketValues.js
 *
 * NE: her oyuncunun sunucuda hesaplanan piyasa değeri (ETL) ve son
 * hesaplamaya göre değişimi. Değer TAMAMEN sunucuda üretilir
 * (services/marketValue/*): performans, form, disiplin ve yaş gibi bileşenler
 * orada ağırlıklandırılır. İstemci hiçbir bileşeni yeniden hesaplamaz.
 *
 * NEDEN LİSTE UCU: kadro ekranı 20 oyuncu gösteriyor; oyuncu başına ayrı
 * istek atmak (N+1) hem yavaş hem gereksiz. `teamId` süzgeciyle tek çağrıda
 * takımın tamamı gelir ve `playerId → değer` haritasına çevrilir. Web paneli
 * de aynı yolu kullanır (src/hooks/useMarketValues.js).
 */

import { get } from "../http";

export interface MarketValueItem {
  playerId: number;
  playerName: string;
  playerImg: string | null;
  teamId: number | null;
  position: string | null;
  currentValue: number;
  previousValue: number | null;
  /** Bir önceki hesaplamaya göre fark; önceki değer yoksa 0. */
  changeAmount: number;
  changePercentage: number;
  globalRank: number | null;
  cityRank: number | null;
  positionRank: number | null;
  currency: string;
}

export interface MarketValueListResponse {
  total: number;
  limit: number;
  offset: number;
  items: MarketValueItem[];
}

export const getMarketValues = (query: { teamId?: number; cityId?: number; limit?: number } = {}) =>
  get<MarketValueListResponse>("/api/market-values", {
    teamId: query.teamId,
    cityId: query.cityId,
    limit: query.limit ?? 500,
  });

/**
 * "3.450.000 ETL" — web'deki `formatEtl` ile aynı biçim.
 *
 * Binlik ayracı Türkçe yerel ayarla konur; sayı yuvarlanır çünkü kuruş
 * bilgisinin bu ekranlarda bir karşılığı yok.
 */
export function formatEtl(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  return `${Math.round(Number(value)).toLocaleString("tr-TR")} ETL`;
}

/** Kısa biçim — liste satırına sığması için: "3,4 M" / "450 B". */
export function formatEtlShort(value: number | null | undefined): string {
  const amount = Number(value);
  if (value == null || !Number.isFinite(amount)) return "—";
  if (Math.abs(amount) >= 1_000_000) return `${(amount / 1_000_000).toFixed(1).replace(".", ",")} M`;
  if (Math.abs(amount) >= 1_000) return `${Math.round(amount / 1_000)} B`;
  return String(Math.round(amount));
}
