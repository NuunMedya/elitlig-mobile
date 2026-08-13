import { API_BASE_URL } from "./config";

/** Tarih, saat, skor ve görsel adresi biçimlendirme yardımcıları. */

const TR = "tr-TR";

const parseDate = (value?: string | null): Date | null => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

/** "14 Ağustos Perşembe" */
export function formatDateLong(value?: string | null): string {
  const date = parseDate(value);
  if (!date) return "";
  return date.toLocaleDateString(TR, { day: "numeric", month: "long", weekday: "long" });
}

/** "14 Ağu" — liste başlıkları için kısa biçim. */
export function formatDateShort(value?: string | null): string {
  const date = parseDate(value);
  if (!date) return "";
  return date.toLocaleDateString(TR, { day: "numeric", month: "short" });
}

/** Gün başlıkları: bugün / dün / yarın özel adlandırılır. */
export function formatDayHeading(value?: string | null): string {
  const date = parseDate(value);
  if (!date) return "Tarihi belirsiz";

  const startOfDay = (input: Date) => new Date(input.getFullYear(), input.getMonth(), input.getDate()).getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  const diff = Math.round((startOfDay(date) - startOfDay(new Date())) / dayMs);

  if (diff === 0) return "Bugün";
  if (diff === -1) return "Dün";
  if (diff === 1) return "Yarın";
  return date.toLocaleDateString(TR, { day: "numeric", month: "long", weekday: "long" });
}

/** Sunucu saati "20:00:00" biçiminde tutar; saniye gösterilmez. */
export function formatTime(value?: string | null): string {
  if (!value) return "";
  const match = String(value).match(/^(\d{1,2}):(\d{2})/);
  if (!match) return String(value);
  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

/** Canlı sayaç: milisaniyeyi "38'" biçimine çevirir. */
export function formatClock(clockMs?: number | null): string {
  if (clockMs == null || !Number.isFinite(clockMs)) return "";
  const minutes = Math.floor(clockMs / 60000);
  return `${minutes}'`;
}

/** Skor gösterimi: henüz oynanmadıysa tire. */
export const formatScore = (value: number | null | undefined) =>
  value == null ? "-" : String(value);

/** Piyasa değeri: 1.250.000 ₺ */
export function formatMoney(value?: string | number | null, currency = "TRY"): string {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return "—";
  const symbol = currency === "TRY" ? "₺" : currency;
  return `${amount.toLocaleString(TR, { maximumFractionDigits: 0 })} ${symbol}`;
}

/** Doğum tarihinden yaş. */
export function formatAge(birthDate?: string | null): string {
  const date = parseDate(birthDate);
  if (!date) return "—";
  const now = new Date();
  let age = now.getFullYear() - date.getFullYear();
  const monthDiff = now.getMonth() - date.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < date.getDate())) age -= 1;
  return age > 0 && age < 120 ? `${age}` : "—";
}

/**
 * Görsel adresleri veritabanında üç ayrı biçimde duruyor: tam URL (S3),
 * `/uploads/...` ile başlayan sunucu yolu ve eski `../uploads/...` göreli yol.
 * Hepsi tek biçime indirilir.
 */
export function mediaUrl(value?: string | null): string | null {
  const raw = String(value ?? "").trim();
  if (!raw || raw === "none" || raw === "null") return null;
  if (/^https?:\/\//i.test(raw)) return raw;

  const path = raw.replace(/^\.{0,2}\//, "");
  return `${API_BASE_URL}/${path}`;
}

/** Takım adından iki harfli amblem yedeği ("Kartal Gücü" → "KG"). */
export function initials(name?: string | null): string {
  const words = String(name ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toLocaleUpperCase(TR);
  return (words[0][0] + words[1][0]).toLocaleUpperCase(TR);
}

/** Haber içeriği HTML olarak saklanıyor; listelerde düz metin özeti gerekir. */
export function stripHtml(value?: string | null, limit = 200): string {
  const text = String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > limit ? `${text.slice(0, limit).trimEnd()}…` : text;
}

/** "3 saat önce" — haber akışında yayın zamanı. */
export function timeAgo(value?: string | null): string {
  const date = parseDate(value);
  if (!date) return "";
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "az önce";
  if (minutes < 60) return `${minutes} dakika önce`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} saat önce`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} gün önce`;
  return formatDateShort(value);
}
