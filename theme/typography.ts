/**
 * Tipografi ölçeği.
 *
 * Kurallar (neden böyle):
 *  - Aile: sistem yazı tipi (iOS SF Pro, Android Roboto). Özel font YÜKLENMEZ;
 *    açılış maliyeti ve skor listesinde FOUT kabul edilemez.
 *  - METİN ağırlık tavanı "700"; "800" yalnız SKOR ölçeğindedir. Android'de
 *    "900" ile "800" aynı faceye düşer, ayrım kaybolur — bu yüzden 900 hiç yok.
 *  - Hiyerarşi ağırlıkla değil TRACKING ile kurulur: başlıklar negatif
 *    (-0.4…-0.1), büyük harf etiketler pozitif (+0.4…+0.9) tracking alır.
 *    Kalabalık bir ekranda "her şey kalın" olduğunda hiçbir şey öne çıkmaz.
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

/** Ölçek — 10–19px metin, ayrı skor ölçeği, ayrı panel metriği. */
export const scale = {
  /* Metin ölçeği — 10–19px.
     AĞIRLIK TAVANI 700'e İNDİ: eski ölçekte h1/h2/display "800" idi ve koyu
     zeminde sistem yazı tipinin 800 kesimi tıknaz, "ucuz" bir izlenim
     bırakıyordu. Minimal görünüm ağırlıkla değil HİYERARŞİYLE kurulur:
     başlık 700 + sıkı tracking, üstündeki etiket 600 + geniş tracking.
     800 yalnız SKOR ölçeğinde kalır — orada kalınlık okunurluk içindir. */
  display: { fontSize: 19, lineHeight: 23, fontWeight: "700", letterSpacing: -0.4 },
  h1:      { fontSize: 17, lineHeight: 21, fontWeight: "700", letterSpacing: -0.3 },
  h2:      { fontSize: 15, lineHeight: 19, fontWeight: "700", letterSpacing: -0.2 },
  h3:      { fontSize: 14, lineHeight: 18, fontWeight: "600", letterSpacing: -0.1 },
  bodyLg:  { fontSize: 14, lineHeight: 20, fontWeight: "400", letterSpacing: 0 },
  body:    { fontSize: 13, lineHeight: 18, fontWeight: "400", letterSpacing: 0 },
  bodySm:  { fontSize: 12, lineHeight: 17, fontWeight: "400", letterSpacing: 0 },
  label:   { fontSize: 12, lineHeight: 15, fontWeight: "600", letterSpacing: 0 },
  caption: { fontSize: 11, lineHeight: 14, fontWeight: "500", letterSpacing: 0.1 },
  micro:   { fontSize: 10, lineHeight: 12, fontWeight: "600", letterSpacing: 0.4 },
  /* Üst etiket — kart ve bölüm başlıklarının üstündeki küçük büyük-harf satır.
     Hiyerarşinin "ağırlık yerine tracking" ayağı budur. */
  overline: { fontSize: 10, lineHeight: 12, fontWeight: "700", letterSpacing: 0.9 },

  /* Skor ölçeği — ayrı, tamamı tabular */
  scoreHero: { fontSize: 32, lineHeight: 34, fontWeight: "800", letterSpacing: -1.4, ...numeric },
  scoreLg:   { fontSize: 21, lineHeight: 24, fontWeight: "800", letterSpacing: -0.8, ...numeric },
  scoreMd:   { fontSize: 17, lineHeight: 20, fontWeight: "700", letterSpacing: -0.5, ...numeric },
  scoreSm:   { fontSize: 14, lineHeight: 17, fontWeight: "700", letterSpacing: -0.2, ...numeric },

  /* Sayısal yardımcılar */
  clock:          { fontSize: 11, lineHeight: 13, fontWeight: "600", letterSpacing: 0, ...numeric },
  tableNum:       { fontSize: 12, lineHeight: 15, fontWeight: "500", letterSpacing: 0, ...numeric },
  tableNumStrong: { fontSize: 12, lineHeight: 15, fontWeight: "700", letterSpacing: 0, ...numeric },
  /* Panel kartlarındaki büyük tek rakam (kadro sayısı, kasa, puan). */
  metric:         { fontSize: 22, lineHeight: 25, fontWeight: "700", letterSpacing: -0.8, ...numeric },
  metricSm:       { fontSize: 16, lineHeight: 19, fontWeight: "700", letterSpacing: -0.4, ...numeric },
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
