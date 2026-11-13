import { API_TIMEOUTS } from "../config";
import { ApiError, get, patch, post } from "../http";

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
 *   PATCH /matches/:id/youtube → { title?, … } açık yayının başlığını değiştir
 *   POST /matches/:id/thumbnail → çok parçalı `file` (JPEG ≤ 2 MB): YouTube
 *                                 kapağı (maçın kapağı boşsa ona da yazılır)
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

/* ───────── otomatik başlık ───────── */

export const TITLE_MAX = 100;
const BRAND = "ELİTLİG";

const cleanPart = (value: unknown): string => {
  const s = String(value ?? "")
    .replace(/[<>]/g, "") // YouTube başlıkta < > kabul etmez
    .replace(/\s+/g, " ")
    .trim();
  return s && !["none", "null", "-"].includes(s.toLocaleLowerCase("tr-TR")) ? s : "";
};

const squash = (s: string) => s.toLocaleLowerCase("tr-TR").replace(/[^0-9a-zçğıöşü]/g, "");
/** Marka yazısı boş ya da varsayılan "ELİT LİG" ise lig adı sayılmaz. */
const isDefaultBrand = (s: string) => ["elitlig", "elitlıg", "elıtlıg"].includes(squash(s));

function cut(text: string, max: number): string {
  if (text.length <= max) return text;
  const room = Math.max(1, max - 1);
  const head = text.slice(0, room);
  const space = head.lastIndexOf(" ");
  return `${(space > room * 0.6 ? head.slice(0, space) : head).replace(/[\s\-|·]+$/, "")}…`;
}

export interface BroadcastTitleInput {
  /** Yayın görünümündeki marka yazısı (ayarlardan değiştirilen lig adı). */
  brandName?: string | null;
  /** Maçın lig adı (marka yazısı yoksa). */
  league?: string | null;
  season?: string | null;
  home?: string | null;
  away?: string | null;
}

/**
 * YouTube yayın başlığı: `ELİTLİG {LİG ADI} - {SEZON} | {EV} - {DEPLASMAN}`
 * (Türkçe büyük harf, en çok 100 karakter; uzunsa takımlar korunur, lig /
 * sezon kısaltılır). Lig adı önce yayın görünümünün marka yazısından
 * (web "Yayın Tasarımı" › Marka yazısı) gelir; böylece ayarlardan lig adı
 * değişince başlık da değişir. Boş parçalar ayraçlarıyla birlikte atılır.
 */
export function broadcastTitle(input: BroadcastTitleInput): string {
  const up = (s: string) => s.toLocaleUpperCase("tr-TR");
  const brand = cleanPart(input.brandName);
  let league = brand && !isDefaultBrand(brand) ? brand : cleanPart(input.league);
  // "ELİTLİG ANKARA LİGİ" yazılmışsa marka iki kez geçmesin.
  league = league.replace(/^[eE][lL][iİıI][tT]\s*[lL][iİıI][gGğĞ]\s*[-|·:]?\s*/, "").trim();
  if (isDefaultBrand(league)) league = "";
  let season = cleanPart(input.season);
  // Sezon adı lig adını tekrar ediyorsa ("Kış Ligi 2026") ligi sezondan çıkar.
  if (league && season && squash(season).startsWith(squash(league))) {
    season = season.slice(league.length).replace(/^[\s\-|·]+/, "").trim();
  }
  const head = [BRAND, league].filter(Boolean).join(" ");
  const competition = [head, season].filter(Boolean).join(" - ");
  const teams = [cleanPart(input.home), cleanPart(input.away)].filter(Boolean).join(" - ");
  if (!teams) return up(cut(competition, TITLE_MAX));
  const tail = ` | ${teams}`;
  const room = TITLE_MAX - tail.length;
  const full = room >= BRAND.length + 4 ? `${cut(competition, room)}${tail}` : cut(`${BRAND}${tail}`, TITLE_MAX);
  return up(full);
}

/** Açık yayının başlığını (ve isteğe bağlı diğer alanlarını) değiştirir. */
export const updateMatchYoutube = (matchId: number, body: { title?: string; description?: string }) =>
  patch<{ ok: boolean; title?: string }>(`${BASE}/matches/${matchId}/youtube`, body);

/**
 * YouTube kapağı (küçük resim) yükler — masaüstü stüdyoyla aynı uç. `fileUri`
 * 1280×720 JPEG (≤ 2 MB). Maçın kapağı boşsa sunucu onu da bu görselle doldurur.
 */
export async function uploadMatchThumbnail(matchId: number, fileUri: string) {
  const form = new FormData();
  const uri = /^(file|content):/.test(fileUri) ? fileUri : `file://${fileUri}`;
  form.append("file", { uri, name: `kapak-${matchId}.jpg`, type: "image/jpeg" } as unknown as Blob);
  return post<{ ok: boolean; video_id?: string; cover?: { stored: boolean; url: string | null } }>(`${BASE}/matches/${matchId}/thumbnail`, form, {
    timeout: API_TIMEOUTS.HEAVY,
  });
}
