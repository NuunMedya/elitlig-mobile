/**
 * MAÇ SAYFASI MEDYASI — yayın bağlantısı, maçın golü / kurtarışı anları,
 * röportaj kapağı. Saf fonksiyonlar; görünüm components/matchpage/MatchMedia.tsx.
 *
 * Web istemcisiyle aynı kurallar (elitlig-client src/pages/MatchPage.js
 * `resolveBroadcast`, `interviewPosterOf`; src/live/matchHighlights.js
 * `readAwardMoment`).
 */

import { directVideoUrl } from "./video";

/* ─────────────────────────── yayın bağlantısı ─────────────────────────── */

export type BroadcastSource =
  | { kind: "youtube"; url: string; videoId: string; watchUrl: string; thumb: string }
  | { kind: "file"; url: string }
  | { kind: "link"; url: string; youtube: boolean };

const VIDEO_FILE_EXT = /\.(mp4|m4v|webm|mov|ogv|ogg|m3u8)(?:$|[?#])/i;
const PLACEHOLDER = /^(none|null|undefined|-)$/i;

/** YouTube video kimliği (watch?v=, youtu.be/, /embed/, /live/, /shorts/); yoksa null. */
export function youtubeIdOf(value: string): string | null {
  const patterns = [
    /youtube(?:-nocookie)?\.com\/(?:embed|live|shorts)\/([A-Za-z0-9_-]{6,})/i,
    /youtube\.com\/watch\?(?:[^#]*&)?v=([A-Za-z0-9_-]{6,})/i,
    /youtu\.be\/([A-Za-z0-9_-]{6,})/i,
  ];
  for (const pattern of patterns) {
    const found = value.match(pattern);
    if (found?.[1]) return found[1];
  }
  return /^[A-Za-z0-9_-]{11}$/.test(value) ? value : null;
}

/**
 * Canlı yayın linki (match_video). Maç sürerken canlı yayındır, bitince aynı
 * bağlantı "Maçın yayın kaydı" olur. "none" gibi yer tutucular yok sayılır.
 */
export function resolveBroadcast(value: unknown): BroadcastSource | null {
  const raw = String(value ?? "").trim();
  if (!raw || PLACEHOLDER.test(raw)) return null;
  const id = youtubeIdOf(raw);
  if (id) {
    return {
      kind: "youtube",
      url: raw,
      videoId: id,
      watchUrl: `https://www.youtube.com/watch?v=${id}`,
      thumb: `https://img.youtube.com/vi/${id}/hqdefault.jpg`,
    };
  }
  const m = /^(https?):\/\/([^/?#]+)([^?#]*)?(.*)$/i.exec(raw);
  if (!m) return null;
  const [, scheme, hostPort, path = "", rest = ""] = m;
  if (VIDEO_FILE_EXT.test(path + rest)) return { kind: "file", url: raw };
  if (scheme.toLowerCase() !== "https") return null;
  const host = hostPort.replace(/:\d+$/, "").replace(/^[^@]*@/, "");
  return { kind: "link", url: raw, youtube: /(^|\.)(youtube\.com|youtu\.be)$/i.test(host) };
}

/** İlk geçerli yayın bağlantısı (eski kayıtlarda farklı sütun adları). */
export function broadcastOf(match: Record<string, unknown>): BroadcastSource | null {
  for (const field of ["match_video", "live_stream_url", "canli_yayin_linki", "youtube_link", "youtube_url", "video_link"]) {
    const source = resolveBroadcast(match[field]);
    if (source) return source;
  }
  return null;
}

/* ─────────────────────────── röportaj ─────────────────────────── */

export interface InterviewMedia {
  /** Doğrudan video (MP4) — uygulama içinde oynar. */
  file: string | null;
  /** YouTube röportajı — YouTube'da / uygulama içi tarayıcıda açılır. */
  youtube: BroadcastSource | null;
  poster: string | null;
}

const isHttp = (value: unknown): value is string => /^https?:\/\//i.test(String(value ?? "").trim());

export function interviewOf(match: Record<string, unknown>): InterviewMedia | null {
  const raw = [match.match_interview, match.post_roportaj, match.interview_url]
    .map((value) => String(value ?? "").trim())
    .find((value) => value && !PLACEHOLDER.test(value));
  if (!raw) return null;
  const yt = youtubeIdOf(raw) ? resolveBroadcast(raw) : null;
  const file = yt ? null : directVideoUrl(raw);
  if (!yt && !file) return null;
  const explicit = [match.interview_poster_url, match.match_interview_poster, match.post_roportaj_poster].find(isHttp);
  // Yayın stüdyosunun yüklediği röportajlarda (interviews/<maç>/<ad>.mp4) kapak aynı adla .jpg'dir.
  const derived = file && /\/interviews\/\d+\/[^/?#]+\.mp4(?:$|[?#])/i.test(file) ? file.replace(/\.mp4(?=$|[?#])/i, ".jpg") : null;
  return {
    file,
    youtube: yt,
    poster: explicit ? String(explicit).trim() : derived ?? (yt?.kind === "youtube" ? yt.thumb : null),
  };
}

/* ─────────────────────────── maçın golü / kurtarışı ─────────────────────────── */

export type MomentKey = "best_goal" | "best_save";
export const MOMENT_KEYS: readonly MomentKey[] = ["best_goal", "best_save"];

export interface AwardMoment {
  key: MomentKey;
  playerId: number | null;
  name: string | null;
  eventId: number | null;
  minute: number | null;
  teamId: number | null;
  clipUrl: string | null;
  posterUrl: string | null;
}

const parseJson = (raw: unknown): Record<string, unknown> => {
  if (!raw) return {};
  if (typeof raw === "object") return Array.isArray(raw) ? {} : (raw as Record<string, unknown>);
  try {
    const parsed: unknown = JSON.parse(String(raw));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const numOrNull = (value: unknown): number | null => {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const textOrNull = (value: unknown): string | null => {
  const text = String(value ?? "").trim();
  return text && !PLACEHOLDER.test(text) ? text : null;
};

/**
 * "Maçın Enleri" (post_macin_enleri / post_enler) içinden maçın golü ve
 * kurtarışı. Eski kayıtlar `{key}_id` / `{key}_name` / `{key}: "Ad"` tutar;
 * yayın stüdyosu `{key}` alanını { id, name, event_id, minute, team_id,
 * clip_url, poster_url } nesnesi olarak yazar (düz `{key}_clip_url` de okunur).
 */
export function readAwardMoments(match: { post_macin_enleri?: unknown; post_enler?: unknown } | null | undefined): AwardMoment[] {
  const raw = parseJson(match?.post_macin_enleri ?? match?.post_enler);
  const out: AwardMoment[] = [];
  for (const key of MOMENT_KEYS) {
    const value = raw[key];
    const obj = isRecord(value) ? value : {};
    const pick = (...names: string[]): unknown => {
      for (const name of names) if (obj[name] != null && obj[name] !== "") return obj[name];
      for (const name of names) {
        const flat = raw[`${key}_${name}`];
        if (flat != null && flat !== "") return flat;
      }
      return null;
    };
    const playerId = numOrNull(raw[`${key}_id`] ?? obj.id ?? obj.player_id);
    const name =
      textOrNull(raw[`${key}_name`]) ?? (typeof value === "string" ? textOrNull(value) : textOrNull(obj.name ?? obj.player_name));
    if (!playerId && !name) continue;
    const clip = pick("clip_url", "video_url");
    const poster = pick("poster_url", "thumbnail_url");
    out.push({
      key,
      playerId: playerId && playerId > 0 ? playerId : null,
      name,
      eventId: numOrNull(pick("event_id", "olay_id")),
      minute: numOrNull(pick("minute", "dakika")),
      teamId: numOrNull(pick("team_id", "takim_id")),
      clipUrl: isHttp(clip) ? String(clip).trim() : null,
      posterUrl: isHttp(poster) ? String(poster).trim() : null,
    });
  }
  return out;
}

/** 185000 → "3:05"; geçersizse null. */
export function formatDuration(ms: number | null | undefined): string | null {
  const total = Math.round(Number(ms) / 1000);
  if (!Number.isFinite(total) || total <= 0) return null;
  const m = Math.floor(total / 60);
  return `${m}:${String(total % 60).padStart(2, "0")}`;
}
