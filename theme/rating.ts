/**
 * Reyting rengi seçici — SofaScore mantığı.
 *
 * Reyting bir renk skalasıdır: 9+ elit (mor), 8+ çok iyi (koyu yeşil),
 * 7+ iyi (yeşil), 6+ orta (amber), altı kötü (kırmızı). Renk hem metinde (fg)
 * hem rozet zemininde (bg) kullanılır; ikisi birlikte kontrastı garanti eder.
 *
 * Renk tek başına anlam taşımaz: rozette daima sayının kendisi yazılır.
 */

import type { Palette } from "./palette";

export type RatingTone = "poor" | "fair" | "good" | "great" | "elite" | "none";

/** Sayısal reytingi ton adına çevirir; geçersiz/boş değer "none" olur. */
export function ratingTone(value: number | null | undefined): RatingTone {
  if (value == null || !Number.isFinite(value)) return "none";
  if (value >= 9) return "elite";
  if (value >= 8) return "great";
  if (value >= 7) return "good";
  if (value >= 6) return "fair";
  return "poor";
}

/** Reyting için ön plan (metin) ve zemin rengini verir. */
export function ratingColors(
  p: Palette,
  value: number | null | undefined,
): { fg: string; bg: string } {
  const map = {
    poor:  [p.ratingPoor,  p.ratingPoorBg],
    fair:  [p.ratingFair,  p.ratingFairBg],
    good:  [p.ratingGood,  p.ratingGoodBg],
    great: [p.ratingGreat, p.ratingGreatBg],
    elite: [p.ratingElite, p.ratingEliteBg],
    none:  [p.ratingNone,  p.ratingNoneBg],
  } as const;
  const [fg, bg] = map[ratingTone(value)];
  return { fg, bg };
}

/** Rozette gösterilecek metin — reyting yoksa tire. */
export function ratingLabel(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toFixed(1);
}
