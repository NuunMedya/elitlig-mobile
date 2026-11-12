/**
 * SIRALAMA TABLOLARI — ortak saf yardımcılar (dönem, tarih aralığı, sayfalama).
 *
 * Rekor tablosu (`/siralama`) ve şehir sıralaması (`/kulup-sehri-siralama`)
 * aynı dönem dilini konuşur: Bu hafta · Bu ay · Tüm zamanlar · Tarih aralığı.
 * Bütün günler Europe/Istanbul takvim günüdür (UTC+3, yaz saati yok) ve
 * `YYYY-MM-DD` biçiminde, iki uç dahil gönderilir — sunucu sözleşmesiyle aynı.
 *
 * ESKİ SUNUCU: yeni parametreleri (limit/offset/from/to) tanımayan sunucu
 * yanıtta `offset`/`limit` döndürmez. O zaman gelen liste tek sayfa sayılır
 * ve bir sonraki sayfa istenmez — aynı satırlar iki kez listelenmez.
 */

/* ───────────────────────── Dönem ───────────────────────── */

export type BoardPeriod = "week" | "month" | "alltime" | "range";

export interface DayRange {
  /** YYYY-MM-DD, dahil. */
  from: string;
  /** YYYY-MM-DD, dahil. */
  to: string;
}

export interface PeriodValue {
  period: BoardPeriod;
  /** Yalnız `range` için. */
  range?: DayRange | null;
}

export const PERIOD_OPTIONS: { key: BoardPeriod; label: string }[] = [
  { key: "week", label: "Bu hafta" },
  { key: "month", label: "Bu ay" },
  { key: "alltime", label: "Tüm zamanlar" },
  { key: "range", label: "Tarih aralığı" },
];

const ISTANBUL_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export const MONTHS_TR = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
export const MONTHS_SHORT_TR = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
export const WEEKDAYS_SHORT_TR = ["Pt", "Sa", "Ça", "Pe", "Cu", "Ct", "Pz"];

const pad = (n: number) => String(n).padStart(2, "0");

/** Yıl/ay(0-11)/gün → "YYYY-MM-DD". */
export function isoDay(year: number, month: number, day: number): string {
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

/** İstanbul'da bugünün tarihi. */
export function istanbulToday(now: number = Date.now()): string {
  return new Date(now + ISTANBUL_OFFSET_MS).toISOString().slice(0, 10);
}

/** "YYYY-MM-DD" → { y, m (0-11), d }; okunamazsa null. */
export function parseDay(value: string | null | undefined): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? ""));
  if (!match) return null;
  return { y: Number(match[1]), m: Number(match[2]) - 1, d: Number(match[3]) };
}

function dayToUtc(value: string): number {
  const p = parseDay(value);
  return p ? Date.UTC(p.y, p.m, p.d) : NaN;
}

function utcToDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(value: string, days: number): string {
  return utcToDay(dayToUtc(value) + days * DAY_MS);
}

/** Pazartesi–pazar haftası (bugünü içeren). */
export function weekRange(today: string = istanbulToday()): DayRange {
  const weekday = (new Date(dayToUtc(today)).getUTCDay() + 6) % 7; // Pt = 0
  const from = addDays(today, -weekday);
  return { from, to: addDays(from, 6) };
}

/** Takvim ayı (bugünü içeren). */
export function monthRange(today: string = istanbulToday()): DayRange {
  const p = parseDay(today);
  if (!p) return { from: today, to: today };
  return { from: isoDay(p.y, p.m, 1), to: isoDay(p.y, p.m, daysInMonth(p.y, p.m)) };
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/** Ayın ilk gününün haftanın kaçıncı günü olduğu (Pt = 0). */
export function firstWeekday(year: number, month: number): number {
  return (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7;
}

/** "2026-11-03" → "3 Kas" (yıl farklıysa "3 Kas 2025"). */
export function formatDay(value: string, withYear = false): string {
  const p = parseDay(value);
  if (!p) return value;
  return `${p.d} ${MONTHS_SHORT_TR[p.m]}${withYear ? ` ${p.y}` : ""}`;
}

/** { 3 Kas – 9 Kas } → "3–9 Kas", ay/yıl farkına göre kısaltır. */
export function formatRange(range: DayRange): string {
  const a = parseDay(range.from);
  const b = parseDay(range.to);
  if (!a || !b) return `${range.from} – ${range.to}`;
  const thisYear = parseDay(istanbulToday())?.y;
  const showYear = a.y !== b.y || a.y !== thisYear;
  if (range.from === range.to) return formatDay(range.from, showYear);
  if (a.y === b.y && a.m === b.m) return `${a.d}–${b.d} ${MONTHS_SHORT_TR[a.m]}${showYear ? ` ${a.y}` : ""}`;
  return `${formatDay(range.from, a.y !== b.y)} – ${formatDay(range.to, showYear)}`;
}

/** Ekranda kısa dönem yazısı: "bu hafta", "tüm zamanlar", "3–9 Kas". */
export function periodCaption(value: PeriodValue): string {
  if (value.period === "range" && value.range) return formatRange(value.range);
  if (value.period === "week") return "bu hafta";
  if (value.period === "month") return "bu ay";
  return "tüm zamanlar";
}

/** Dönemin gerçek gün aralığı (tüm zamanlarda null). */
export function resolveRange(value: PeriodValue, today: string = istanbulToday()): DayRange | null {
  if (value.period === "week") return weekRange(today);
  if (value.period === "month") return monthRange(today);
  if (value.period === "range") return value.range ?? null;
  return null;
}

/** Rota parametresinden dönem: `weekly|week`, `monthly|month`, `alltime`, `range` (+from/to). */
export function periodFromParams(
  raw: { period?: string | string[]; from?: string | string[]; to?: string | string[] },
  fallback: BoardPeriod,
): PeriodValue {
  const one = (v?: string | string[]) => (Array.isArray(v) ? v[0] : v);
  const period = one(raw.period);
  const from = one(raw.from);
  const to = one(raw.to);
  if (from && to && parseDay(from) && parseDay(to)) {
    return { period: "range", range: from <= to ? { from, to } : { from: to, to: from } };
  }
  if (period === "weekly" || period === "week") return { period: "week" };
  if (period === "monthly" || period === "month") return { period: "month" };
  if (period === "alltime" || period === "all") return { period: "alltime" };
  return { period: fallback };
}

/* ───────────────────────── Sayfalama ───────────────────────── */

/** Bir sayfadaki satır sayısı — sözleşmedeki varsayılan. */
export const BOARD_PAGE_SIZE = 50;

export interface PageMeta {
  total?: number | null;
  limit?: number | null;
  offset?: number | null;
}

/**
 * Bir sonraki sayfanın `offset`'i; liste bittiyse `undefined`.
 * Eski sunucu `offset`/`limit` döndürmez: gelen her şey tek sayfadır.
 */
export function nextPageOffset(meta: PageMeta, requestedOffset: number, received: number): number | undefined {
  if (meta.offset == null && meta.limit == null) return undefined;
  if (received === 0) return undefined;
  const loaded = requestedOffset + received;
  if (typeof meta.total === "number") return loaded < meta.total ? loaded : undefined;
  return received >= (meta.limit ?? BOARD_PAGE_SIZE) ? loaded : undefined;
}

/** Sayfaları birleştirir; aynı oyuncu iki sayfada görünürse (sıra kayması) ilki kalır. */
export function mergePages<T>(pages: T[][], keyOf: (row: T) => string | number): T[] {
  const seen = new Set<string | number>();
  const out: T[] = [];
  for (const page of pages) {
    for (const row of page) {
      const key = keyOf(row);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(row);
    }
  }
  return out;
}

/** 1240 → "1.240". */
export function formatCount(value: number | null | undefined): string {
  const n = Math.round(Number(value) || 0);
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/* ───────────────────────── Kulüp Şehri birimleri ───────────────────────── */

/**
 * Şehir seviyesi satırındaki mini çubuklar için birimler ve tavan seviyeleri
 * (sunucu `services/puzzle/city.js` BUILDINGS ile aynı sıra). Sunucu yeni bir
 * birim eklerse çubuk yine çizilir; tavanı bilinmiyorsa 8 sayılır.
 */
export const CITY_BUILDINGS: { key: string; title: string; max: number }[] = [
  { key: "saha", title: "Ana saha", max: 7 },
  { key: "soyunma", title: "Soyunma odası", max: 6 },
  { key: "kantin", title: "Kafeterya", max: 6 },
  { key: "kulup", title: "Kulüp binası", max: 6 },
  { key: "tribun", title: "Tribün", max: 7 },
  { key: "magaza", title: "Mağaza", max: 5 },
  { key: "antrenman", title: "Antrenman sahası", max: 6 },
  { key: "saglik", title: "Sağlık merkezi", max: 5 },
  { key: "kamp", title: "Kamp oteli", max: 5 },
  { key: "akademi", title: "Akademi", max: 4 },
  { key: "medya", title: "Medya merkezi", max: 5 },
  { key: "ulasim", title: "Ulaşım", max: 6 },
];

/** Kulüp statüsü basamak sayısı (Okul takımı … Avrupa devi). */
export const CITY_TIER_COUNT = 10;
