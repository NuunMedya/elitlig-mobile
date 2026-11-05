/**
 * YÖNETİM BİÇİMLENDİRİCİLERİ — para, tarih, sayı ve göreli zaman.
 *
 * Web panelindeki (elitlig-client tools/toolsUi.js) yardımcıların mobil
 * karşılığı. Hepsi Europe/Istanbul saatine ve tr-TR biçimine sabittir:
 * yönetim kayıtları Türkiye saatiyle tutulur, cihazın saat dilimi ne olursa
 * olsun aynı günü göstermelidir.
 */

export const TZ = "Europe/Istanbul";

const moneyFmt = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 2 });
const moneyShortFmt = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 });
const numberFmt = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 });

/** "₺1.250,50" — boş/geçersiz değer "₺0". */
export function formatMoney(value: unknown, short = false): string {
  const n = toNumber(value);
  return (short ? moneyShortFmt : moneyFmt).format(n ?? 0);
}

/** "1.250,5" */
export function formatNumber(value: unknown): string {
  const n = toNumber(value);
  return n == null ? "—" : numberFmt.format(n);
}

/** "12,5%" */
export function formatPercent(value: unknown, digits = 1): string {
  const n = toNumber(value);
  return n == null ? "—" : `%${n.toLocaleString("tr-TR", { maximumFractionDigits: digits })}`;
}

/** Türkçe ondalık ("1.250,5") ve noktalı yazımı sayıya çevirir. */
export function toNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  let text = String(value).trim().replace(/[₺\s]/g, "");
  if (text.includes(",")) text = text.replace(/\./g, "").replace(",", ".");
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

function parse(value: unknown): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "12 Eki 2026" */
export function formatDate(value: unknown, withYear = true): string {
  const d = parse(value);
  if (!d) return "—";
  return d.toLocaleDateString("tr-TR", { day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}), timeZone: TZ });
}

/** "12 Eki 2026 14:30" */
export function formatDateTime(value: unknown): string {
  const d = parse(value);
  if (!d) return "—";
  return `${formatDate(d)} ${formatTime(d)}`;
}

/** "14:30" */
export function formatTime(value: unknown): string {
  const d = parse(value);
  if (!d) return "—";
  return d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
}

/** "Pazartesi, 12 Ekim" */
export function formatLongDay(value: unknown): string {
  const d = parse(value);
  if (!d) return "—";
  return d.toLocaleDateString("tr-TR", { weekday: "long", day: "numeric", month: "long", timeZone: TZ });
}

/** İstanbul saatine göre YYYY-MM-DD. */
export function isoDay(value: unknown = new Date()): string {
  const d = parse(value) ?? new Date();
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  return parts;
}

/** "Bugün", "Yarın", "Dün", "3 gün sonra", "12 Eki" */
export function relativeDay(value: unknown): string {
  const d = parse(value);
  if (!d) return "—";
  const today = new Date(`${isoDay()}T00:00:00`);
  const that = new Date(`${isoDay(d)}T00:00:00`);
  const diff = Math.round((that.getTime() - today.getTime()) / 86_400_000);
  if (diff === 0) return "Bugün";
  if (diff === 1) return "Yarın";
  if (diff === -1) return "Dün";
  if (diff > 1 && diff < 7) return `${diff} gün sonra`;
  if (diff < -1 && diff > -7) return `${-diff} gün önce`;
  return formatDate(d, that.getFullYear() !== today.getFullYear());
}

/** "az önce", "5 dk önce", "3 sa önce", "2 gün önce", "12 Eki" */
export function timeAgo(value: unknown): string {
  const d = parse(value);
  if (!d) return "—";
  const sec = Math.round((Date.now() - d.getTime()) / 1000);
  if (sec < 45) return "az önce";
  if (sec < 3600) return `${Math.round(sec / 60)} dk önce`;
  if (sec < 86_400) return `${Math.round(sec / 3600)} sa önce`;
  if (sec < 7 * 86_400) return `${Math.round(sec / 86_400)} gün önce`;
  return formatDate(d);
}

/** Ad soyaddan iki harflik monogram. */
export function initialsOf(name: string | null | undefined): string {
  const parts = String(name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : parts[0].slice(0, 2);
  return letters.toLocaleUpperCase("tr-TR");
}

/** Telefonu "0532 123 45 67" biçimine getirir (yalnız TR cep numaraları). */
export function formatPhone(value: string | null | undefined): string {
  const digits = String(value ?? "").replace(/\D/g, "");
  const local = digits.startsWith("90") && digits.length === 12 ? `0${digits.slice(2)}` : digits.length === 10 ? `0${digits}` : digits;
  if (local.length !== 11) return String(value ?? "");
  return `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7, 9)} ${local.slice(9)}`;
}

/** WhatsApp/arama için uluslararası numara ("905321234567"). */
export function intlPhone(value: string | null | undefined): string | null {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("90") && digits.length === 12) return digits;
  if (digits.startsWith("0") && digits.length === 11) return `9${digits}`;
  if (digits.length === 10) return `90${digits}`;
  return digits;
}
