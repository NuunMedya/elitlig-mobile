/**
 * YEREL KAYIT — yayının tamamını telefon hafızasına yazmanın hesapları ve metinleri.
 *
 * Yerel modül yayına giden kodlanmış görüntüyü (kamera + gömülü skorbord + ses)
 * olduğu gibi MP4'e yazar; dosya boyutu bu yüzden doğrudan seçili bit hızından
 * hesaplanır. Bu dosya yalnız saf işlevler içerir (arayüz yok).
 */

import type { EncoderConfig } from "./rig";

/** Ses (AAC) bit hızı — yayınla aynı. */
const AUDIO_KBPS = 128;
/** MP4 kap yükü + bit hızı dalgalanması için pay. */
const OVERHEAD = 1.03;
/** Ön kontrol ve uyarılar bu maç süresine göre yapılır. */
export const MATCH_MINUTES = 90;
/** Yerel modüldeki güvenlik tabanı (LocalRecorder.MIN_FREE_BYTES). */
export const MIN_FREE_BYTES = 300 * 1024 * 1024;

const MB = 1_000_000;
const GB = 1_000_000_000;

const tr = (n: number, digits: number) => n.toFixed(digits).replace(".", ",");

/** "23,4 GB" / "640 MB" — telefon ayarlarındaki gibi ondalık birimlerle. */
export function formatBytes(bytes: number | null | undefined): string {
  const b = Number(bytes);
  if (!Number.isFinite(b) || b <= 0) return "0 MB";
  if (b >= 100 * GB) return `${Math.round(b / GB)} GB`;
  if (b >= GB) return `${tr(b / GB, 1)} GB`;
  return `${Math.max(1, Math.round(b / MB))} MB`;
}

/** Seçili kalitede bir dakikalık kaydın boyutu (bayt). */
export function bytesPerMinute(encoder: Pick<EncoderConfig, "videoBitrateKbps">): number {
  return (((encoder.videoBitrateKbps + AUDIO_KBPS) * 1000) / 8) * 60 * OVERHEAD;
}

export interface StorageEstimate {
  perMinute: number;
  /** 90 dakikalık maçın yaklaşık boyutu. */
  match: number;
  /** Güvenlik tabanına kadar kaç dakika kayıt sığar (boş alan bilinmiyorsa null). */
  minutesLeft: number | null;
  /** Boş alan güvenlik tabanının altında: kayıt başlatılamaz. */
  belowFloor: boolean;
  /** Boş alan 90 dakikalık maça yetmiyor (ama kayıt başlayabilir). */
  tight: boolean;
}

export function estimateStorage(encoder: Pick<EncoderConfig, "videoBitrateKbps">, freeBytes: number | null | undefined, minFreeBytes = MIN_FREE_BYTES): StorageEstimate {
  const perMinute = bytesPerMinute(encoder);
  const match = perMinute * MATCH_MINUTES;
  const free = Number(freeBytes);
  if (freeBytes == null || !Number.isFinite(free) || free < 0) {
    return { perMinute, match, minutesLeft: null, belowFloor: false, tight: false };
  }
  const usable = Math.max(0, free - minFreeBytes);
  const minutesLeft = Math.floor(usable / perMinute);
  const belowFloor = free < minFreeBytes;
  return { perMinute, match, minutesLeft, belowFloor, tight: !belowFloor && minutesLeft < MATCH_MINUTES };
}

/** "~19 saat" / "~1 sa 20 dk" / "~45 dakika" */
export function durationText(minutes: number): string {
  const m = Math.max(0, Math.floor(minutes));
  if (m >= 600) return `~${Math.round(m / 60)} saat`;
  if (m >= 60) {
    const rest = m % 60;
    return rest >= 5 ? `~${Math.floor(m / 60)} sa ${rest} dk` : `~${Math.floor(m / 60)} saat`;
  }
  return `~${m} dakika`;
}

/** "Bu kalitede dakikada ~20 MB · 90 dakikalık maç ~1,8 GB · boş alan ~19 saat kayda yeter" */
export function estimateText(e: StorageEstimate): string {
  const parts = [`Bu kalitede dakikada ~${formatBytes(e.perMinute)}`, `${MATCH_MINUTES} dakikalık maç ~${formatBytes(e.match)}`];
  if (e.minutesLeft != null && !e.belowFloor) parts.push(`boş alan ${durationText(e.minutesLeft)} kayda yeter`);
  return parts.join(" · ");
}

const TR_ASCII: Record<string, string> = { ç: "c", Ç: "C", ğ: "g", Ğ: "G", ı: "i", İ: "I", ö: "o", Ö: "O", ş: "s", Ş: "S", ü: "u", Ü: "U", â: "a", Â: "A", î: "i", Î: "I", û: "u", Û: "U" };

/** Takım adını dosya adına uygun ASCII parçaya çevirir ("Çınar Gücü SK" → "Cinar-Gucu-SK"). */
export function asciiSlug(value: string, max = 24): string {
  const mapped = Array.from(String(value ?? ""))
    .map((ch) => TR_ASCII[ch] ?? ch)
    .join("")
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return mapped.slice(0, max).replace(/-+$/g, "");
}

/** `ElitLig_<ev>-<deplasman>_<YYYY-AA-GG_SS-dd>` (uzantısız; yerel taraf .mp4 ekler). */
export function recordingFileName(home: string, away: string, at: Date = new Date()): string {
  const two = (n: number) => String(n).padStart(2, "0");
  const stamp = `${at.getFullYear()}-${two(at.getMonth() + 1)}-${two(at.getDate())}_${two(at.getHours())}-${two(at.getMinutes())}`;
  const h = asciiSlug(home) || "Ev";
  const a = asciiSlug(away) || "Deplasman";
  return `ElitLig_${h}-${a}_${stamp}`;
}

/** Kullanıcıya gösterilecek kayıt yeri. */
export function saveLocationText(info: { location: string; gallery: boolean } | null | undefined): string {
  if (!info) return "telefon hafızası";
  if (info.gallery) return `Galeri ▸ ${info.location || "Movies/ElitLig"}`;
  return info.location || "telefon hafızası";
}

/** Yolun son parçası (dosya adı). */
export const fileNameOf = (path: string | null | undefined) => String(path ?? "").split("/").filter(Boolean).pop() ?? "";
