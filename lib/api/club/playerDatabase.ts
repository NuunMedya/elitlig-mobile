import { get, post } from "../../http";

/**
 * FUTBOLCU VERİTABANI — routes/playerDatabase.js → services/transfer/
 * playerDatabaseService.js (web: features/transfers/PlayerDatabase.js).
 *
 *   GET /api/player-database            liste + il özeti (il kilidi sunucuda)
 *   GET /api/player-database/claimable  "bu oyuncu benim" araması (tüm iller)
 *   POST /api/users/request-player-claim  sahiplenme talebi (yönetici onayı)
 *
 * Takım başkanı için satırda `canReceiveOffer` / `activeOfferPublicId` /
 * `isOwnPlayer` gelir (yalnız rolü takım olan ve takım yöneten üyeye); teklif
 * düğmesi bu alanlardan kurulur, istemci kendi kuralını UYDURMAZ.
 */

export interface DatabasePlayer {
  id: number;
  displayName: string;
  profileImage: string | null;
  position: string | null;
  birthDate: string | null;
  age: number | null;
  nationality: string | null;
  city: string | null;
  cityId: number | null;
  teamId: number | null;
  teamName: string | null;
  teamLogo: string | null;
  league: string | null;
  marketValue: number | string | null;
  currency: string;
  averageRating: number | string;
  goals: number | string;
  matches: number | string;
  assists: number | string;
  yellowCards: number | string;
  redCards: number | string;
  goalsPerMatch: number;
  isFreeAgent: boolean;
  /* Takım başkanı görünümü */
  isOwnPlayer?: boolean;
  activeOfferPublicId?: string | null;
  canReceiveOffer?: boolean;
  /* Sahiplenme */
  isClaimed?: boolean;
  hasPendingClaim?: boolean;
  canClaim?: boolean;
  isMine?: boolean;
}

export interface DatabaseResponse {
  items: DatabasePlayer[];
  page: number;
  limit: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  scope?: { locked: boolean; cityId: number | null; cityName: string | null };
  summary?: {
    totalPlayers: number;
    freeAgents: number;
    contractedPlayers: number;
    teams: number;
    averageMarketValue: number | null;
    positions: { position: string; total: number }[];
  };
}

/** Web PlayerDatabase SORTS ile aynı sıralama seçenekleri. */
export const DATABASE_SORTS = [
  { key: "averageRating:DESC", label: "Puan" },
  { key: "marketValue:DESC", label: "Piyasa değeri" },
  { key: "goals:DESC", label: "Gol" },
  { key: "assists:DESC", label: "Asist" },
  { key: "matches:DESC", label: "Maç" },
  { key: "age:DESC", label: "Genç önce" },
  { key: "name:ASC", label: "A → Z" },
  { key: "newest:DESC", label: "Yeni eklenen" },
] as const;

export type DatabaseSort = (typeof DATABASE_SORTS)[number]["key"];

export interface DatabaseQuery {
  search?: string;
  position?: string;
  isFreeAgent?: boolean;
  sort?: DatabaseSort;
  minAge?: number;
  maxAge?: number;
  minMatches?: number;
  minAverageRating?: number;
  page?: number;
  limit?: number;
}

export function searchPlayerDatabase(query: DatabaseQuery) {
  const [sort, order] = (query.sort ?? "averageRating:DESC").split(":");
  return get<DatabaseResponse>("/api/player-database", {
    search: query.search?.trim() || undefined,
    position: query.position || undefined,
    isFreeAgent: query.isFreeAgent ? "true" : undefined,
    sort,
    order,
    minAge: query.minAge ?? undefined,
    maxAge: query.maxAge ?? undefined,
    minMatches: query.minMatches ?? undefined,
    minAverageRating: query.minAverageRating ?? undefined,
    page: query.page ?? 1,
    limit: query.limit ?? 20,
  });
}

export const searchClaimable = (search: string) =>
  get<{ items: DatabasePlayer[] }>("/api/player-database/claimable", { search });

export const requestPlayerClaim = (playerId: number) =>
  post<{ message: string }>("/api/users/request-player-claim", { playerId });

/** Sunucunun hata kodlarının Türkçe karşılıkları (web TRANSFER_ERROR_MESSAGES). */
export const DATABASE_ERRORS: Record<string, string> = {
  MEMBER_CITY_REQUIRED: "Üyelik kaydında il bilgisi yok. Futbolcu veritabanını görmek için hesabından ilini güncelle.",
  PLAYER_OUT_OF_CITY: "Bu oyuncu kayıtlı olduğun ilin dışında olduğu için görüntülenemiyor.",
};
