import { del, get, patch, post } from "../http";

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
  /** Takip edilen iller (Cities.id). */
  cityIds: number[];
}

export type FavoriteKind = "teams" | "leagues" | "seasons" | "cities" | "matches";

export const getMyFavorites = () =>
  get<Partial<ServerFavorites>>("/api/favorites/me").then<ServerFavorites>((data) => ({
    // Eski sunucu sürümü `matchIds` göndermeyebilir; alanların hepsi normalize edilir
    // ki çağıran taraf her zaman dizi görsün.
    teamIds: data.teamIds ?? [],
    leagueIds: data.leagueIds ?? [],
    seasonIds: data.seasonIds ?? [],
    matchIds: data.matchIds ?? [],
    cityIds: data.cityIds ?? [],
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

/* ═════════════════════ TAKİP BAŞINA BİLDİRİM AYARI ═════════════════════
 * routes/favorites.js → GET /api/favorites/notifications,
 * PATCH /api/favorites/:kind/:id/notifications
 *
 * Her takip (takım, lig, sezon, il, maç) kendi bildirim ayarını taşır: hangi
 * olayların (gol, sonuç, kırmızı kart, haber…) telefona düşeceği ve takibin
 * susturulup susturulmadığı. Olay listesi, etiketleri ve hangi türde hangi
 * olayın geçerli olduğu sunucudan gelir (constants/followNotifications.js);
 * yeni bir olay mobil sürüm çıkmadan ekranda görünür.
 */

export type FollowType = "team" | "league" | "season" | "city" | "match";

export interface FollowEventInfo {
  key: string;
  label: string;
  description?: string;
}

export interface FollowTypeInfo {
  key: FollowType;
  label: string;
  events: string[];
  defaults: Record<string, boolean>;
}

export interface FollowItem {
  kind: FavoriteKind;
  type: FollowType;
  type_label: string;
  id: number;
  name: string;
  subtitle?: string | null;
  logo?: string | null;
  date?: string | null;
  muted: boolean;
  /** Üye bu takibin ayarını kendisi değiştirdi mi? (false = varsayılan) */
  customized: boolean;
  /** Bu takip türünde geçerli olaylar (sıralı). */
  events: string[];
  /** Etkin değerler — olay anahtarı → açık/kapalı. */
  prefs: Record<string, boolean>;
}

export interface FollowNotifications {
  /** Genel "Takip bildirimleri" ana anahtarı (follow_alerts). */
  enabled: boolean;
  catalog: { types: FollowTypeInfo[]; events: FollowEventInfo[] };
  follows: FollowItem[];
}

export const getFollowNotifications = () =>
  get<FollowNotifications>("/api/favorites/notifications").then((data) => ({
    enabled: data?.enabled !== false,
    catalog: { types: data?.catalog?.types ?? [], events: data?.catalog?.events ?? [] },
    follows: Array.isArray(data?.follows) ? data.follows : [],
  }));

export interface FollowSettingsPatch {
  prefs?: Record<string, boolean>;
  muted?: boolean;
  /** Ayarı silip varsayılana döndürür. */
  reset?: boolean;
}

export const updateFollowNotifications = (kind: FavoriteKind, id: number, body: FollowSettingsPatch) =>
  patch<{ message: string; follow: FollowItem }>(`/api/favorites/${kind}/${id}/notifications`, body);
