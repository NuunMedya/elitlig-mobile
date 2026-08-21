/**
 * Tipografi ölçeği — küçük, sıkı, disiplinli.
 *
 * KURALLAR (neden böyle):
 *  - İKİ AİLE, ÜÇ ROL: Archivo (skor/rakam), Inter (arayüz metni), Inter 10px
 *    uppercase (yapısal etiket). Bkz. theme/fonts.ts.
 *  - `fontWeight` KULLANILMAZ. Özel fontlarda RN ağırlık uygulamaz; ağırlık
 *    ailenin adıyla seçilir (`fontFamily: fonts.semibold`). Bu dosyadaki her
 *    token doğru aileyi zaten taşır.
 *  - TAVAN 16px. Ekranda 16px üstü tipografi YALNIZ skor ölçeğinde ve sayfa
 *    başlığındadır. Yoğunluk küçük punto + geniş boşlukla kurulur, punto
 *    büyüterek değil. Sahte hiyerarşi (her şeyi büyütmek) yasak.
 *  - Hiyerarşi ağırlıkla değil TRACKING ile kurulur: başlıklar negatif
 *    (-0.4…-0.16), büyük harf etiketler pozitif (+0.4…+0.9) tracking alır.
 *  - TÜM rakamlar tabular (`fontVariant: ["tabular-nums"]`). Aksi hâlde canlı
 *    skor 1 → 10 olduğunda satır kayar.
 *  - Türkçe büyük harf dönüşümü daima toLocaleUpperCase("tr-TR") ile yapılır.
 *
 * ÖLÇEK ÇEVİRİSİ: brief `em` cinsinden tracking veriyor, RN `letterSpacing`i
 * PİKSEL alır. Çeviri: -0.02em @28px = -0.56 · -0.03em @40px = -1.20 ·
 * -0.01em @16px = -0.16 · +0.08em @10px = +0.80.
 *
 * ESKİ ADLAR: `score/title/subtitle/body/small/caption` 58 dosyada kullanılıyor;
 * yeni ölçeğe takma ad olarak bağlıdır. Yeni kod doğrudan yeni adları kullanır.
 */

import type { TextStyle } from "react-native";
import { fonts } from "./fonts";

/** Tabular rakam karışımı — skor/dakika/puan içeren her token bunu alır. */
const numeric: Pick<TextStyle, "fontVariant"> = { fontVariant: ["tabular-nums"] };

/** Ölçek — 10–16px metin, ayrı skor ölçeği (28/40), ayrı panel metriği. */
export const scale = {
  /* — Metin ölçeği: 10–16px, TAVAN 16 — */

  /** Sayfa başlığı. 16px tavanının iki istisnasından biri budur. */
  display: { fontSize: 16, lineHeight: 20, fontFamily: fonts.semibold, letterSpacing: -0.16 },
  h1:      { fontSize: 16, lineHeight: 20, fontFamily: fonts.semibold, letterSpacing: -0.16 },
  h2:      { fontSize: 14, lineHeight: 18, fontFamily: fonts.semibold, letterSpacing: -0.1 },
  h3:      { fontSize: 13, lineHeight: 17, fontFamily: fonts.semibold, letterSpacing: -0.05 },
  bodyLg:  { fontSize: 13, lineHeight: 19, fontFamily: fonts.regular,  letterSpacing: 0 },
  body:    { fontSize: 13, lineHeight: 18, fontFamily: fonts.regular,  letterSpacing: 0 },
  /** ARAYÜZÜN VARSAYILANI — brief §2.2 "body-sm". */
  bodySm:  { fontSize: 12, lineHeight: 17, fontFamily: fonts.regular,  letterSpacing: 0 },
  label:   { fontSize: 12, lineHeight: 16, fontFamily: fonts.semibold, letterSpacing: 0 },
  caption: { fontSize: 11, lineHeight: 15, fontFamily: fonts.medium,   letterSpacing: 0.1 },
  micro:   { fontSize: 10, lineHeight: 13, fontFamily: fonts.semibold, letterSpacing: 0.4 },
  /** Yapısal işaretçi — bölüm ve kart başlıklarının üstündeki büyük-harf satır. */
  overline:{ fontSize: 10, lineHeight: 13, fontFamily: fonts.semibold, letterSpacing: 0.8 },

  /* — Skor ölçeği: 16px tavanının ikinci istisnası, tamamı Archivo + tabular — */
  scoreHero: { fontSize: 40, lineHeight: 42, fontFamily: fonts.bold,    letterSpacing: -1.2,  ...numeric },
  scoreLg:   { fontSize: 28, lineHeight: 31, fontFamily: fonts.bold,    letterSpacing: -0.56, ...numeric },
  scoreMd:   { fontSize: 20, lineHeight: 24, fontFamily: fonts.bold,    letterSpacing: -0.4,  ...numeric },
  scoreSm:   { fontSize: 16, lineHeight: 20, fontFamily: fonts.bold,    letterSpacing: -0.16, ...numeric },

  /* — Sayısal yardımcılar — */
  clock:          { fontSize: 11, lineHeight: 14, fontFamily: fonts.display, letterSpacing: 0, ...numeric },
  tableNum:       { fontSize: 12, lineHeight: 16, fontFamily: fonts.display, letterSpacing: 0, ...numeric },
  tableNumStrong: { fontSize: 12, lineHeight: 16, fontFamily: fonts.bold,    letterSpacing: 0, ...numeric },
  /** Panel kartlarındaki tek rakam (kadro sayısı, kasa, puan). Skor ailesinden
      sayılır; 16px tavanının rakam istisnasıdır ama 20'de tutulur. */
  metric:         { fontSize: 20, lineHeight: 24, fontFamily: fonts.bold, letterSpacing: -0.4, ...numeric },
  metricSm:       { fontSize: 14, lineHeight: 18, fontFamily: fonts.bold, letterSpacing: -0.2, ...numeric },
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
 * Dinamik yazı tipi ölçeği kuralları.
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
