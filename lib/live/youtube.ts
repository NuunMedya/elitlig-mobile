import { ApiError, get, post } from "../http";

/**
 * YOUTUBE CANLI YAYIN — sunucu routes/liveStreams.js (`/api/admin/live-streams`).
 *
 * Sunucu, kanalın OAuth yenileme anahtarıyla YouTube Data API v3'te maç için
 * bir "liveBroadcast" + "liveStream" açar, ikisini bağlar ve telefona RTMP
 * adresiyle yayın anahtarını verir. Telefon görüntüyü bu adrese basar; YouTube
 * görüntüyü alınca sunucu yayını "live" durumuna geçirir. İzleme bağlantısı
 * maç kaydının yayın linki alanına yazılır (sitede ve uygulamada görünür).
 *
 *   GET  /config               → YouTube bağlantısı kurulmuş mu, gizlilik
 *   POST /matches/:id          → yayını aç (varsa olanı döndürür)
 *   GET  /matches/:id          → { configured, live_stream } (YouTube'dan tazelenir)
 *   POST /matches/:id/end      → yayını bitir ("complete"; hiç canlıya
 *                                 çıkmadıysa YouTube'dan silinir: "deleted")
 *
 * YouTube yayını "otomatik başla / bitir" ile açılır: telefon görüntü göndermeye
 * başlayınca yayın kendiliğinden canlıya geçer, ayrı bir "go-live" çağrısı yok.
 *
 * KOTA: durum sorgusu YouTube kotası harcar (günde 10.000 birim); ekran durumu
 * yalnız açıkken ve 30 sn aralıkla sorar.
 *
 * Yetki: matches.live.
 */

const BASE = "/api/admin/live-streams";

export type YoutubePrivacy = "public" | "unlisted" | "private";

export interface LiveStreamConfig {
  configured: boolean;
  privacy?: YoutubePrivacy;
}

export interface MatchLiveStream {
  id?: number;
  match_id?: number;
  broadcast_id: string | null;
  stream_id: string | null;
  watch_url: string | null;
  rtmp_url: string | null;
  rtmps_url?: string | null;
  stream_key: string | null;
  /** rtmp_url + "/" + stream_key */
  rtmp_publish_url?: string | null;
  /** YouTube lifeCycleStatus: created | ready | testing | live | complete | revoked; sunucu "deleted" de yazar */
  status: string | null;
  /** YouTube'un aldığı görüntünün durumu: active | inactive | ready … */
  stream_status?: string | null;
  health_status?: string | null;
  privacy?: YoutubePrivacy | null;
  active?: boolean;
  reused?: boolean;
  created_at?: string | null;
  ended_at?: string | null;
  sync_error?: { code: string; message: string } | null;
}

export interface MatchLiveStreamStatus {
  match_id: number;
  configured: boolean;
  live_stream: MatchLiveStream | null;
}

export const getLiveStreamConfig = () => get<LiveStreamConfig>(`${BASE}/config`, undefined, { retry: false });

export const createMatchLiveStream = (matchId: number, body: { privacy?: YoutubePrivacy; title?: string } = {}) =>
  post<MatchLiveStream>(`${BASE}/matches/${matchId}`, body);

export const getMatchLiveStream = (matchId: number) =>
  get<MatchLiveStreamStatus>(`${BASE}/matches/${matchId}`, undefined, { retry: false });

export const endMatchLiveStream = (matchId: number) => post<MatchLiveStream>(`${BASE}/matches/${matchId}/end`, {});

/** RTMP adresi + anahtar → tek yayın URL'si (RootEncoder / HaishinKit bu biçimi alır). */
export function ingestUrl(stream: MatchLiveStream | null | undefined): string | null {
  if (!stream) return null;
  return stream.rtmp_publish_url || joinRtmp(stream.rtmp_url, stream.stream_key);
}

export function joinRtmp(base: string | null | undefined, key: string | null | undefined): string | null {
  const url = String(base ?? "").trim();
  const k = String(key ?? "").trim();
  if (!url) return null;
  if (!k) return url;
  return `${url.replace(/\/+$/, "")}/${k}`;
}

export const PRIVACY_LABELS: Record<YoutubePrivacy, string> = {
  public: "Herkese açık",
  unlisted: "Liste dışı",
  private: "Özel",
};

/** YouTube yayın durumunun Türkçe karşılığı. */
export function streamStatusLabel(status: string | null | undefined): string {
  switch (String(status ?? "").toLowerCase()) {
    case "created":
    case "ready":
      return "Hazır, görüntü bekleniyor";
    case "testing":
      return "Test ediliyor";
    case "live":
      return "YouTube'da yayında";
    case "complete":
      return "Yayın bitti";
    case "revoked":
      return "Yayın iptal edildi";
    case "deleted":
      return "Yayın silindi";
    case "error":
      return "YouTube hata bildirdi";
    default:
      return "Yayın açılmadı";
  }
}

/** YouTube / yayın hatalarında sunucunun Türkçe iletisini göster (424/429 dahil). */
export function liveErrorText(error: unknown, fallback: string): string {
  if (error instanceof ApiError && /^(YOUTUBE_|LIVE_STREAM_|MATCH_NOT_FOUND|INVALID_MATCH_ID|CITY_FORBIDDEN)/.test(String(error.code ?? ""))) {
    return error.message || fallback;
  }
  if (error instanceof ApiError) return error.userMessage || fallback;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
