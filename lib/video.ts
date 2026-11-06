/**
 * Doğrudan oynatılabilir video adresi (ör. Spaces'teki MP4) — YouTube ya da
 * başka bir video SAYFASI değil.
 *
 * Maç röportajı (`post_roportaj`) eskiden YouTube bağlantısıydı; artık yayın
 * stüdyosu doğrudan MP4 yükleyebiliyor. Web src/pages/MatchPage.js
 * `toDirectVideoUrl` ile aynı kural: dosya uzantısı varsa http(s) kabul;
 * uzantısızsa yalnız https ve bilinen video sayfası sitesi değilse.
 */

const VIDEO_FILE_EXT = /\.(mp4|m4v|webm|mov|ogv|ogg|m3u8)(?:$|[?#])/i;
const VIDEO_PAGE_HOSTS =
  /(^|\.)(youtube\.com|youtu\.be|youtube-nocookie\.com|vimeo\.com|instagram\.com|facebook\.com|fb\.watch|tiktok\.com|twitch\.tv|dailymotion\.com|x\.com|twitter\.com)$/i;

export function directVideoUrl(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  const m = /^(https?):\/\/([^/?#]+)([^?#]*)?(.*)$/i.exec(raw);
  if (!m) return null;
  const [, scheme, hostPort, path = "", rest = ""] = m;
  const host = hostPort.replace(/:\d+$/, "").replace(/^[^@]*@/, "");
  if (VIDEO_FILE_EXT.test(path + rest)) return raw;
  if (scheme.toLowerCase() !== "https") return null;
  return VIDEO_PAGE_HOSTS.test(host) ? null : raw;
}
