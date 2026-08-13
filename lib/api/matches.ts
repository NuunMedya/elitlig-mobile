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
  limit?: number;
  /** Yalnızca listelerde gereken alanlar — mobil bağlantıda yükü küçültür. */
  compact?: boolean;
}

// Not: Lig ve sezon zaten bir şehre bağlı olduğundan (routes/meta.js kapsamı
// böyle doğrular) sorgularda league_id + season_id göndermek yeterlidir.

/** Kapsamdaki tüm maçlar (tarihe göre yeniden eskiye). */
export const getMatches = (query: MatchQuery = {}) =>
  get<ApiMatch[]>("/maclar", {
    league_id: query.leagueId,
    season_id: query.seasonId,
    limit: query.limit ?? 200,
    compact: query.compact ? 1 : undefined,
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
