/**
 * Tipografi ölçeği.
 *
 * Kurallar (neden böyle):
 *  - Aile: sistem yazı tipi (iOS SF Pro, Android Roboto). Özel font YÜKLENMEZ;
 *    açılış maliyeti ve skor listesinde FOUT kabul edilemez.
 *  - Ağırlık tavanı "800". Android'de "900" ile "800" aynı faceye düşer,
 *    ayrım kaybolur.
 *  - TÜM rakamlar tabular (`fontVariant: ["tabular-nums"]`). Aksi hâlde canlı
 *    skor 1 → 10 olduğunda satır kayar.
 *  - Mikro ölçek yalnız BÜYÜK HARF etiketlerde (CANLI, MS, DEVRE, "O AV P").
 *  - Türkçe büyük harf dönüşümü daima toLocaleUpperCase("tr-TR") ile yapılır.
 *
 * ESKİ ADLAR: `score/title/subtitle/body/small/caption` 58 dosyada kullanılıyor;
 * yeni ölçeğe takma ad olarak bağlandılar (score→scoreLg, title→h1,
 * subtitle→h2, small→bodySm). Yeni kod doğrudan yeni adları kullanmalıdır.
 */

import type { TextStyle } from "react-native";

/** Tabular rakam karışımı — skor/dakika/puan içeren her token bunu alır. */
const numeric: Pick<TextStyle, "fontVariant"> = { fontVariant: ["tabular-nums"] };

/** Yeni ölçek — 10–20px metin, ayrı skor ölçeği. */
export const scale = {
  /* Metin ölçeği — 10–20px */
  display: { fontSize: 20, lineHeight: 24, fontWeight: "800", letterSpacing: -0.3 },
  h1:      { fontSize: 18, lineHeight: 22, fontWeight: "800", letterSpacing: -0.2 },
  h2:      { fontSize: 16, lineHeight: 20, fontWeight: "700", letterSpacing: -0.1 },
  h3:      { fontSize: 15, lineHeight: 19, fontWeight: "700", letterSpacing: 0 },
  bodyLg:  { fontSize: 15, lineHeight: 21, fontWeight: "500", letterSpacing: 0 },
  body:    { fontSize: 14, lineHeight: 20, fontWeight: "500", letterSpacing: 0 },
  bodySm:  { fontSize: 13, lineHeight: 18, fontWeight: "500", letterSpacing: 0 },
  label:   { fontSize: 12, lineHeight: 16, fontWeight: "600", letterSpacing: 0.1 },
  caption: { fontSize: 11, lineHeight: 14, fontWeight: "600", letterSpacing: 0.2 },
  micro:   { fontSize: 10, lineHeight: 13, fontWeight: "700", letterSpacing: 0.6 },

  /* Skor ölçeği — ayrı, tamamı tabular */
  scoreHero: { fontSize: 34, lineHeight: 38, fontWeight: "800", letterSpacing: -1.2, ...numeric },
  scoreLg:   { fontSize: 22, lineHeight: 26, fontWeight: "800", letterSpacing: -0.6, ...numeric },
  scoreMd:   { fontSize: 18, lineHeight: 22, fontWeight: "800", letterSpacing: -0.4, ...numeric },
  scoreSm:   { fontSize: 15, lineHeight: 18, fontWeight: "700", letterSpacing: -0.2, ...numeric },

  /* Sayısal yardımcılar */
  clock:          { fontSize: 12, lineHeight: 14, fontWeight: "700", letterSpacing: 0, ...numeric },
  tableNum:       { fontSize: 13, lineHeight: 16, fontWeight: "600", letterSpacing: 0, ...numeric },
  tableNumStrong: { fontSize: 13, lineHeight: 16, fontWeight: "800", letterSpacing: 0, ...numeric },
} as const satisfies Record<string, TextStyle>;

/**
 * Uygulamanın kullandığı sözlük: yeni ölçek + eski adlar.
 * Eski adlar geçiş bitince (bkz. theme/legacy.ts) buradan silinecek.
 */
export const type = {
  ...scale,

  /* — Eski API takma adları (58 dosya kırılmasın) — */
  /** ESKİ: büyük skor → scoreLg */
  score: scale.scoreLg,
  /** ESKİ: ekran/kart başlığı → h1 */
  title: scale.h1,
  /** ESKİ: alt başlık → h2 */
  subtitle: scale.h2,
  /** ESKİ: küçük metin → bodySm */
  small: scale.bodySm,
} as const satisfies Record<string, TextStyle>;

export type TypeToken = keyof typeof type;

/**
 * Dinamik yazı tipi ölçeği kuralları (§2.3).
 * Yoğun tablo düzeni sınırsız büyümeyi kaldıramaz; metnin işine göre tavan konur.
 */
export const textScale = {
  /** Tablo, liste satırı, skor: ölçeğe izin ver ama 1.3'te tavanla. */
  dense: { allowFontScaling: true, maxFontSizeMultiplier: 1.3 },
  /** Rozet ve mikro etiket: hiç ölçekleme, taşar. */
  badge: { allowFontScaling: false },
  /** Uzun metin (kurallar, haber, mesaj): neredeyse sınırsız. */
  long: { allowFontScaling: true, maxFontSizeMultiplier: 2 },
} as const;

/** Türkçe büyük harf — I/İ sorununu önler (CANLI, İY, MS rozetleri). */
export function upperTR(value: string): string {
  return value.toLocaleUpperCase("tr-TR");
}
