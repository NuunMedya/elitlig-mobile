import { get } from "../http";
import type { ApiMatch, KadroResponse, LiveSnapshot } from "../types";

/**
 * Maç uçları — routes/Matches.js (`/maclar`) ve routes/liveMatches.js
 *
 * Sunucu taslak (`taslak`) maçları public uçlarda zaten gizler; ek filtre
 * göndermeye gerek yoktur.
 */

interface MatchQuery {
  leagueId?: number;
  seasonId?: number;
  /** İl kimliği — lig seçmeden bir ilin TÜM maçları (Maçlar ▸ "Tüm ligler"). */
  cityId?: number;
  /** İl adı — `city_id`'si boş eski maç satırları için sunucuda yedek eşleşme. */
  cityName?: string;
  /** Gün penceresi ("YYYY-MM-DD", ikisi de dahil). Sunucu sınırı birer gün
   *  geniş tutar; gün süzmesi istemcide yapılır. */
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  /** Yalnızca listelerde gereken alanlar — mobil bağlantıda yükü küçültür. */
  compact?: boolean;
  /** Maç durumu süzgeci ("yayinlanmis" = oynanmış ve sonucu yayınlanmış). */
  status?: "yayinlanmis" | "zamanlanmis" | "canli";
}

// Not: Lig ve sezon zaten bir şehre bağlı olduğundan (routes/meta.js kapsamı
// böyle doğrular) sorgularda league_id + season_id göndermek yeterlidir.
// İl (`city_id`) ve gün penceresi yalnız lig seçilmeyen görünümlerde gönderilir.

/** Kapsamdaki tüm maçlar (tarihe göre yeniden eskiye). */
export const getMatches = (query: MatchQuery = {}) =>
  get<ApiMatch[]>("/maclar", {
    league_id: query.leagueId,
    season_id: query.seasonId,
    city_id: query.cityId,
    city: query.cityId ? query.cityName || undefined : undefined,
    date_from: query.dateFrom,
    date_to: query.dateTo,
    limit: query.limit ?? 200,
    compact: query.compact ? 1 : undefined,
    mac_durumu: query.status,
  });

/** Yaklaşan maçlar — `mac_durumu = zamanlanmis`, tarihe göre eskiden yeniye. */
export const getFixtures = (query: MatchQuery = {}) =>
  get<ApiMatch[]>("/maclar/fixtures", {
    league_id: query.leagueId,
    season_id: query.seasonId,
    limit: query.limit ?? 100,
  });

/** Tamamlanan maçlar — `mac_durumu = yayinlanmis`. */
export const getResults = (query: MatchQuery = {}) =>
  get<ApiMatch[]>("/maclar/results", {
    league_id: query.leagueId,
    season_id: query.seasonId,
    limit: query.limit ?? 100,
  });

/** Şu anda oynanan maçlar — `mac_durumu = canli`. */
export const getLiveMatches = (query: MatchQuery = {}) =>
  get<ApiMatch[]>("/maclar/live", {
    league_id: query.leagueId,
    season_id: query.seasonId,
    city_id: query.cityId,
    city: query.cityId ? query.cityName || undefined : undefined,
  });

/** Bir takımın tüm lig/sezonlardaki maçları. */
export const getTeamMatches = (teamId: number) =>
  get<ApiMatch[]>("/maclar", { team_id: teamId });

/** Maç detayı. Kadro ve olaylar ayrı sorgu maliyeti olduğu için istenerek çekilir. */
export const getMatch = (id: number, include: ("lineup" | "timeline" | "stats")[] = []) =>
  get<ApiMatch>(`/maclar/${id}`, include.length ? { include: include.join(",") } : undefined);

/**
 * Kadrolar — oyuncu adları ve fotoğraflarıyla çözülmüş, ev/deplasman ayrılmış.
 * Ham `?include=lineup` satırlarında yalnızca oyuncu id'si bulunur.
 */
export const getMatchKadro = (id: number) => get<KadroResponse>(`/maclar/${id}/kadro`);

/** Canlı skor + süre + olaylar. Soket kopunca bu uç yoklanır. */
export const getLiveSnapshot = (matchId: number) =>
  get<LiveSnapshot>(`/api/live-matches/${matchId}/snapshot`, undefined, { retry: false });
