/**
 * Paylaşım şablonlarının metin ve sıralama yardımcıları — saf işlevler.
 */

export const upper = (value: string | null | undefined) => String(value ?? "").toLocaleUpperCase("tr-TR");

/** "Doğukan Yıldırım" → "D. Yıldırım"; tek kelimelik ad olduğu gibi kalır. */
export function shortName(full: string | null | undefined): string {
  const parts = String(full ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return parts[0] ?? "";
  return `${parts[0][0]}. ${parts.slice(1).join(" ")}`;
}

/** Ad + soyad iki satıra: soyad (son kelime) ikinci satırda vurgulanır. */
export function splitName(full: string | null | undefined): { first: string; last: string } {
  const parts = String(full ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return { first: "", last: parts[0] ?? "" };
  return { first: parts.slice(0, -1).join(" "), last: parts[parts.length - 1] };
}

function parseDay(value: string | null | undefined): Date | null {
  const day = String(value ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** "12 Kasım" */
export function dayMonth(value: string | null | undefined): string {
  const date = parseDay(value);
  return date ? date.toLocaleDateString("tr-TR", { day: "numeric", month: "long" }) : "";
}

/** "Perşembe" */
export function weekday(value: string | null | undefined): string {
  const date = parseDay(value);
  return date ? date.toLocaleDateString("tr-TR", { weekday: "long" }) : "";
}

/** "12 Kasım 2026" */
export function fullDate(value: string | null | undefined): string {
  const date = parseDay(value);
  return date ? date.toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" }) : "";
}

/** "20:00:00" → "20:00" */
export const clock = (value: string | null | undefined) => String(value ?? "").slice(0, 5);

export const num = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * 10'luk pencere — odak sırası verilirse onu ORTALAR; listenin başına ya da
 * sonuna denk gelirse pencere kayar ki satır sayısı hep `size` olsun.
 * Dönüş 1 tabanlı [from, to] (dahil).
 */
export function focusWindow(total: number, focusRank: number, size = 10): [number, number] {
  if (total <= 0) return [1, 0];
  const span = Math.min(size, total);
  let from = focusRank - Math.floor((span - 1) / 2);
  from = Math.max(1, Math.min(from, total - span + 1));
  return [from, from + span - 1];
}

/** Kullanıcının seçtiği aralığı listeye ve 10 satır sınırına oturtur. */
export function clampRange(total: number, from: number, to: number, size = 10): [number, number] {
  if (total <= 0) return [1, 0];
  const a = Math.max(1, Math.min(from, total));
  const b = Math.max(a, Math.min(to, total, a + size - 1));
  return [a, b];
}

export interface ScorerGroup {
  name: string;
  minutes: string[];
  ownGoal: boolean;
}

/**
 * Gol satırlarını oyuncuya göre toplar: "B. Gönen 12' 25' 31'".
 * Bir maçta 16 gol olabiliyor; gol başına satır, afişi listeye çevirirdi.
 */
export function groupScorers(
  lines: { name: string; minute: number | null; ownGoal?: boolean }[],
): ScorerGroup[] {
  const map = new Map<string, ScorerGroup>();
  for (const line of lines) {
    const key = `${line.name}|${line.ownGoal ? 1 : 0}`;
    const group = map.get(key) ?? { name: line.name, minutes: [], ownGoal: Boolean(line.ownGoal) };
    group.minutes.push(line.minute != null ? `${line.minute}'` : "");
    map.set(key, group);
  }
  return [...map.values()].sort((a, b) => b.minutes.length - a.minutes.length);
}

/** "WDLWW" / "GBMGG" → ["W","D","L","W","W"] (en fazla 5). */
export function formLetters(last5: string | null | undefined): ("W" | "D" | "L")[] {
  const map: Record<string, "W" | "D" | "L"> = { W: "W", G: "W", D: "D", B: "D", L: "L", M: "L" };
  return String(last5 ?? "")
    .toLocaleUpperCase("tr-TR")
    .split("")
    .map((letter) => map[letter])
    .filter(Boolean)
    .slice(-5);
}
