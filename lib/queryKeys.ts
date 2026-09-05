import type { PlayerSort, Scope } from "./types";

/**
 * Tüm React Query anahtarları tek yerde.
 *
 * Kapsam (şehir/lig/sezon) değişince ilgili sorguların tazelenmesi gerektiği
 * için kapsam anahtarın parçasıdır — böylece cache lig karıştırmaz.
 */

type ScopeKey = Pick<Scope, "cityId" | "leagueId" | "seasonId">;

const scopePart = (scope?: Partial<ScopeKey>) => [
  scope?.cityId ?? null,
  scope?.leagueId ?? null,
  scope?.seasonId ?? null,
];

export const queryKeys = {
  cities: () => ["meta", "cities"] as const,
  leagues: (cityId?: number) => ["meta", "leagues", cityId ?? null] as const,
  seasons: (cityId?: number, leagueId?: number) =>
    ["meta", "seasons", cityId ?? null, leagueId ?? null] as const,
  defaultScope: (cityId?: number) => ["meta", "default-scope", cityId ?? null] as const,

  matches: (scope?: Partial<ScopeKey>) => ["matches", "list", ...scopePart(scope)] as const,
  fixtures: (scope?: Partial<ScopeKey>) => ["matches", "fixtures", ...scopePart(scope)] as const,
  results: (scope?: Partial<ScopeKey>) => ["matches", "results", ...scopePart(scope)] as const,
  liveMatches: (scope?: Partial<ScopeKey>) => ["matches", "live", ...scopePart(scope)] as const,
  match: (id: number) => ["matches", "detail", id] as const,
  matchSnapshot: (id: number) => ["matches", "snapshot", id] as const,
  teamMatches: (teamId: number) => ["matches", "team", teamId] as const,

  standings: (scope?: Partial<ScopeKey>) => ["standings", ...scopePart(scope)] as const,

  teams: () => ["teams", "list"] as const,
  teamsByCity: (city?: string) => ["teams", "city", city ?? null] as const,
  team: (id: number) => ["teams", "detail", id] as const,

  playerRankings: (scope?: Partial<ScopeKey>, sort?: PlayerSort) =>
    ["players", "rankings", ...scopePart(scope), sort ?? null] as const,
  player: (id: number) => ["players", "detail", id] as const,

  newsFeed: (scope?: Partial<ScopeKey>) => ["news", "feed", ...scopePart(scope)] as const,
  news: (publicId: string) => ["news", "detail", publicId] as const,

  session: () => ["auth", "session"] as const,

  /* ---- Favoriler (sunucu tarafı) ---- */
  favoritesMe: () => ["favorites", "me"] as const,
  /** Bir maçı kaç kişinin takip ettiği — oturum gerektirmez. */
  matchFollowerCount: (matchId: number) => ["favorites", "match-count", matchId] as const,
  /** Favori kapsamdaki canlı maçlar (sekme rozeti) — kapsamdan bağımsızdır. */
  liveFavoriteMatches: () => ["matches", "live", "favorites"] as const,

  /* ---- Panel rozetleri ve tercihler ---- */
  /** app/mesajlarim.tsx ile AYNI anahtar: iki ekran tek önbelleği paylaşır. */
  panelMessages: () => ["panel", "messages"] as const,
  unreadNotifCount: () => ["panel", "notif-count"] as const,
  notificationPreferences: () => ["notifications", "preferences"] as const,
  /* ---- Sohbet (app/sohbet) ---- */
  chatConversations: () => ["chat", "conversations"] as const,
  chatMessages: (conversationId: number) => ["chat", "messages", conversationId] as const,
  chatUnread: () => ["chat", "unread"] as const,
  chatDirectory: (q: string) => ["chat", "directory", q] as const,
  /** Hesap silme onay ekranının özeti (app/hesap-sil.tsx). */
  accountDeletionSummary: () => ["account", "deletion-summary"] as const,
} as const;
