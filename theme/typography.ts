/**
 * Tipografi ölçeği — okunur, hiyerarşik, premium.
 *
 * NEDEN DEĞİŞTİ (önceki sürümün hatası): eski ölçek "yoğunluk" adına 16px
 * tavan koyuyordu; arayüzün varsayılanı 12px, kart başlığı 14px, sayfa başlığı
 * 16px idi. Sonuç, telefonda gri bir metin duvarıydı: hiyerarşi yok, nefes yok,
 * hiçbir şey öne çıkmıyor. Bir skor uygulaması yoğun OLMALI ama yoğunluk küçük
 * puntoyla değil, DOĞRU RİTİMLE kurulur — büyük başlık, rahat gövde, sıkı meta.
 *
 * KURALLAR (neden böyle):
 *  - İKİ AİLE, ÜÇ ROL: Archivo (skor/rakam), Inter (arayüz metni), Inter
 *    uppercase (yapısal etiket). Bkz. theme/fonts.ts.
 *  - `fontWeight` KULLANILMAZ. Özel fontlarda RN ağırlık uygulamaz; ağırlık
 *    ailenin adıyla seçilir (`fontFamily: fonts.semibold`). Bu dosyadaki her
 *    token doğru aileyi zaten taşır.
 *  - GÖVDE TABANI 15px, META TABANI 13px. 13px'in altına yalnız rozet ve
 *    yapısal etiket iner (11–12). 10px arayüzden tamamen kalktı — telefonda
 *    10px metin okunmaz, "kalabalık" hissi verir.
 *  - HİYERARŞİ HEM PUNTO HEM TRACKING İLE kurulur: başlıklar negatif
 *    (-0.6…-0.1), büyük harf etiketler pozitif (+0.4…+1.0) tracking alır.
 *  - TÜM rakamlar tabular (`fontVariant: ["tabular-nums"]`). Aksi hâlde canlı
 *    skor 1 → 10 olduğunda satır kayar.
 *  - Türkçe büyük harf dönüşümü daima toLocaleUpperCase("tr-TR") ile yapılır.
 *
 * ÖLÇEK: 11 · 12 · 13 · 15 · 16 · 18 · 22 · 28  (metin)
 *        18 · 24 · 34 · 46                      (skor)
 * Aradaki 14 ve 17 bilerek YOK: iki komşu basamak birbirinden ayırt
 * edilemiyorsa hiyerarşi değil bulanıklık üretir.
 *
 * ESKİ ADLAR: `score/title/subtitle/body/small/caption` 58 dosyada kullanılıyor;
 * yeni ölçeğe takma ad olarak bağlıdır. Yeni kod doğrudan yeni adları kullanır.
 */

import type { TextStyle } from "react-native";
import { fonts } from "./fonts";

/** Tabular rakam karışımı — skor/dakika/puan içeren her token bunu alır. */
const numeric: Pick<TextStyle, "fontVariant"> = { fontVariant: ["tabular-nums"] };

/** Ölçek — 11–28px metin, ayrı skor ölçeği (18–46), ayrı panel metriği. */
export const scale = {
  /* — Metin ölçeği — */

  /** Ekranın kimlik başlığı: takım adı, oyuncu adı, genişletilmiş sayfa başlığı. */
  display: { fontSize: 28, lineHeight: 33, fontFamily: fonts.bold, letterSpacing: -0.6 },
  /** Sayfa/ekran başlığı. */
  h1:      { fontSize: 22, lineHeight: 27, fontFamily: fonts.semibold, letterSpacing: -0.4 },
  /** Kart ve bölüm başlığı. */
  h2:      { fontSize: 18, lineHeight: 23, fontFamily: fonts.semibold, letterSpacing: -0.25 },
  /** Satır başlığı — liste satırındaki isim, en sık kullanılan başlık. */
  h3:      { fontSize: 16, lineHeight: 21, fontFamily: fonts.semibold, letterSpacing: -0.15 },
  /** Alt başlık / güçlü satır metni. */
  h4:      { fontSize: 15, lineHeight: 20, fontFamily: fonts.semibold, letterSpacing: -0.1 },
  /** Uzun metin (haber gövdesi, kurallar, mesaj). */
  bodyLg:  { fontSize: 16, lineHeight: 24, fontFamily: fonts.regular,  letterSpacing: 0 },
  /** ARAYÜZÜN VARSAYILANI. */
  body:    { fontSize: 15, lineHeight: 21, fontFamily: fonts.regular,  letterSpacing: 0 },
  /** İkincil satır, meta metni. */
  bodySm:  { fontSize: 13, lineHeight: 18, fontFamily: fonts.regular,  letterSpacing: 0 },
  /** Buton, sekme, form etiketi. */
  label:   { fontSize: 14, lineHeight: 18, fontFamily: fonts.semibold, letterSpacing: -0.05 },
  /** Küçük meta — tarih, saha adı, satır altı açıklama. */
  caption: { fontSize: 12, lineHeight: 16, fontFamily: fonts.medium,   letterSpacing: 0.05 },
  /** Rozet içi metin. */
  micro:   { fontSize: 11, lineHeight: 14, fontFamily: fonts.semibold, letterSpacing: 0.4 },
  /** Yapısal işaretçi — bölüm ve kart başlıklarının üstündeki büyük-harf satır. */
  overline:{ fontSize: 11, lineHeight: 14, fontFamily: fonts.semibold, letterSpacing: 1.0 },

  /* — Skor ölçeği: tamamı Archivo + tabular — */
  scoreHero: { fontSize: 46, lineHeight: 50, fontFamily: fonts.bold, letterSpacing: -1.6, ...numeric },
  scoreLg:   { fontSize: 34, lineHeight: 38, fontFamily: fonts.bold, letterSpacing: -1.0, ...numeric },
  scoreMd:   { fontSize: 24, lineHeight: 28, fontFamily: fonts.bold, letterSpacing: -0.6, ...numeric },
  scoreSm:   { fontSize: 18, lineHeight: 22, fontFamily: fonts.bold, letterSpacing: -0.3, ...numeric },

  /* — Sayısal yardımcılar — */
  clock:          { fontSize: 12, lineHeight: 15, fontFamily: fonts.display, letterSpacing: 0, ...numeric },
  tableNum:       { fontSize: 14, lineHeight: 18, fontFamily: fonts.display, letterSpacing: 0, ...numeric },
  tableNumStrong: { fontSize: 14, lineHeight: 18, fontFamily: fonts.bold,    letterSpacing: 0, ...numeric },
  /** Panel kartlarındaki tek rakam (kadro sayısı, kasa, puan). */
  metric:         { fontSize: 26, lineHeight: 30, fontFamily: fonts.bold, letterSpacing: -0.7, ...numeric },
  metricSm:       { fontSize: 18, lineHeight: 22, fontFamily: fonts.bold, letterSpacing: -0.3, ...numeric },
} as const satisfies Record<string, TextStyle>;

/**
 * Uygulamanın kullandığı sözlük: yeni ölçek + eski adlar.
 *
 * TAKMA AD EŞLEMESİ (eski kod kırılmasın ama görünürlük kazansın):
 *   title    → h2 (18)  · kart/satır başlığı; eskiden 16 idi
 *   subtitle → h4 (15)  · alt başlık; eskiden 14 idi
 *   small    → bodySm (13) · eskiden 12 idi
 *   score    → scoreLg (34) · eskiden 28 idi
 */
export const type = {
  ...scale,

  /* — Eski API takma adları (58 dosya kırılmasın) — */
  /** ESKİ: büyük skor → scoreLg */
  score: scale.scoreLg,
  /** ESKİ: ekran/kart başlığı → h2 */
  title: scale.h2,
  /** ESKİ: alt başlık → h4 */
  subtitle: scale.h4,
  /** ESKİ: küçük metin → bodySm */
  small: scale.bodySm,
} as const satisfies Record<string, TextStyle>;

export type TypeToken = keyof typeof type;

/**
 * Dinamik yazı tipi ölçeği kuralları.
 * Yoğun tablo düzeni sınırsız büyümeyi kaldıramaz; metnin işine göre tavan konur.
 */
export const textScale = {
  /** Tablo, liste satırı, skor: ölçeğe izin ver ama 1.25'te tavanla. */
  dense: { allowFontScaling: true, maxFontSizeMultiplier: 1.25 },
  /** Rozet ve mikro etiket: hiç ölçekleme, taşar. */
  badge: { allowFontScaling: false },
  /** Uzun metin (kurallar, haber, mesaj): neredeyse sınırsız. */
  long: { allowFontScaling: true, maxFontSizeMultiplier: 2 },
} as const;

/** Türkçe büyük harf — I/İ sorununu önler (CANLI, İY, MS rozetleri). */
export function upperTR(value: string): string {
  return value.toLocaleUpperCase("tr-TR");
}
