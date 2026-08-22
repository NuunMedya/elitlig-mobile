/**
 * Tipografi ölçeği — KOMPAKT ama hiyerarşik.
 *
 * İKİ AŞIRI UÇ VE ARADAKİ DOĞRU YER:
 *   · İlk sürüm 16px TAVAN koyuyordu (gövde 12, kart başlığı 14). Sonuç,
 *     telefonda hiyerarşisiz gri bir metin duvarıydı.
 *   · İkinci sürüm tavanı kaldırıp gövdeyi 15'e, sayfa başlığını 22'ye,
 *     kimlik başlığını 28'e çıkardı. Okunurluk geldi ama ekrana giren içerik
 *     belirgin biçimde azaldı; bir skor uygulaması için bu pahalı bir takas.
 *   · Sonraki sürüm ortayı tuttu (gövde 14, kimlik 22) ama hâlâ genişti.
 *   · BU SÜRÜM bir kademe daha iner: gövde 13, satır başlığı 14, kart başlığı
 *     15, sayfa başlığı 17, kimlik 19. Hiyerarşi korunur (her basamak arasında
 *     en az 1px ve net bir ağırlık farkı vardır) ama ekrana giren satır sayısı
 *     ilk sürüme göre bile fazladır. Mor sistemde yoğunluk bir kayıp değil,
 *     ürünün "şık" görünmesinin koşuludur: küçük punto + geniş boşluk + ışıklı
 *     yüzey, büyük punto + sıkışık boşluktan daha pahalı bir izlenim verir.
 *
 * KURALLAR (neden böyle):
 *  - İKİ AİLE, ÜÇ ROL: Archivo (skor/rakam), Inter (arayüz metni), Inter
 *    uppercase (yapısal etiket). Bkz. theme/fonts.ts.
 *  - `fontWeight` KULLANILMAZ. Özel fontlarda RN ağırlık uygulamaz; ağırlık
 *    ailenin adıyla seçilir (`fontFamily: fonts.semibold`). Bu dosyadaki her
 *    token doğru aileyi zaten taşır.
 *  - GÖVDE TABANI 13px, META TABANI 11px. 10px'e yalnız `caption`, 9px'e
 *    yalnız `micro`/`overline` iner; o iki token DAİMA büyük harf + geniş harf
 *    aralığı taşır ve büyük harf, o puntoda okunurluğu ayakta tutan şeydir.
 *  - HİYERARŞİ HEM PUNTO HEM TRACKING İLE kurulur: başlıklar negatif
 *    (-0.6…-0.1), büyük harf etiketler pozitif (+0.4…+1.0) tracking alır.
 *  - TÜM rakamlar tabular (`fontVariant: ["tabular-nums"]`). Aksi hâlde canlı
 *    skor 1 → 10 olduğunda satır kayar.
 *  - Türkçe büyük harf dönüşümü daima toLocaleUpperCase("tr-TR") ile yapılır.
 *
 * ÖLÇEK: 9 · 10 · 11 · 12 · 13 · 14 · 15 · 17 · 19  (metin)
 *        14 · 17 · 22 · 30                          (skor)
 * 16, 18 ve 20 bilerek YOK: iki komşu basamak birbirinden ayırt edilemiyorsa
 * hiyerarşi değil bulanıklık üretir.
 *
 * ESKİ ADLAR: `score/title/subtitle/body/small/caption` 58 dosyada kullanılıyor;
 * yeni ölçeğe takma ad olarak bağlıdır. Yeni kod doğrudan yeni adları kullanır.
 */

import type { TextStyle } from "react-native";
import { fonts } from "./fonts";

/** Tabular rakam karışımı — skor/dakika/puan içeren her token bunu alır. */
const numeric: Pick<TextStyle, "fontVariant"> = { fontVariant: ["tabular-nums"] };

/** Ölçek — 9–19px metin, ayrı skor ölçeği (14–30), ayrı panel metriği. */
export const scale = {
  /* — Metin ölçeği — */

  /** Ekranın kimlik başlığı: takım adı, oyuncu adı, genişletilmiş sayfa başlığı. */
  display: { fontSize: 19, lineHeight: 24, fontFamily: fonts.bold, letterSpacing: -0.4 },
  /** Sayfa/ekran başlığı. */
  h1:      { fontSize: 17, lineHeight: 22, fontFamily: fonts.semibold, letterSpacing: -0.3 },
  /** Kart ve bölüm başlığı. */
  h2:      { fontSize: 15, lineHeight: 20, fontFamily: fonts.semibold, letterSpacing: -0.2 },
  /** Satır başlığı — liste satırındaki isim, en sık kullanılan başlık. */
  h3:      { fontSize: 14, lineHeight: 18, fontFamily: fonts.semibold, letterSpacing: -0.12 },
  /** Alt başlık / güçlü satır metni. */
  h4:      { fontSize: 13, lineHeight: 17, fontFamily: fonts.semibold, letterSpacing: -0.08 },
  /** Uzun metin (haber gövdesi, kurallar, mesaj). */
  bodyLg:  { fontSize: 14, lineHeight: 21, fontFamily: fonts.regular,  letterSpacing: 0 },
  /** ARAYÜZÜN VARSAYILANI. */
  body:    { fontSize: 13, lineHeight: 18, fontFamily: fonts.regular,  letterSpacing: 0 },
  /** İkincil satır, meta metni. */
  bodySm:  { fontSize: 11, lineHeight: 15, fontFamily: fonts.regular,  letterSpacing: 0 },
  /** Buton, sekme, form etiketi. */
  label:   { fontSize: 12, lineHeight: 16, fontFamily: fonts.semibold, letterSpacing: -0.04 },
  /** Küçük meta — tarih, saha adı, satır altı açıklama. */
  caption: { fontSize: 10, lineHeight: 14, fontFamily: fonts.medium,   letterSpacing: 0.05 },
  /** Rozet içi metin — daima büyük harf. */
  micro:   { fontSize: 9,  lineHeight: 12, fontFamily: fonts.semibold, letterSpacing: 0.4 },
  /** Yapısal işaretçi — bölüm ve kart başlıklarının üstündeki büyük-harf satır. */
  overline:{ fontSize: 9,  lineHeight: 12, fontFamily: fonts.semibold, letterSpacing: 0.9 },

  /* — Skor ölçeği: tamamı Archivo + tabular — */
  scoreHero: { fontSize: 30, lineHeight: 33, fontFamily: fonts.bold, letterSpacing: -1.0, ...numeric },
  scoreLg:   { fontSize: 22, lineHeight: 25, fontFamily: fonts.bold, letterSpacing: -0.6, ...numeric },
  scoreMd:   { fontSize: 17, lineHeight: 21, fontFamily: fonts.bold, letterSpacing: -0.4, ...numeric },
  scoreSm:   { fontSize: 14, lineHeight: 18, fontFamily: fonts.bold, letterSpacing: -0.2, ...numeric },

  /* — Sayısal yardımcılar — */
  clock:          { fontSize: 10, lineHeight: 13, fontFamily: fonts.display, letterSpacing: 0, ...numeric },
  tableNum:       { fontSize: 11, lineHeight: 15, fontFamily: fonts.display, letterSpacing: 0, ...numeric },
  tableNumStrong: { fontSize: 11, lineHeight: 15, fontFamily: fonts.bold,    letterSpacing: 0, ...numeric },
  /** Panel kartlarındaki tek rakam (kadro sayısı, kasa, puan). */
  metric:         { fontSize: 19, lineHeight: 23, fontFamily: fonts.bold, letterSpacing: -0.5, ...numeric },
  metricSm:       { fontSize: 14, lineHeight: 18, fontFamily: fonts.bold, letterSpacing: -0.2, ...numeric },
} as const satisfies Record<string, TextStyle>;

/**
 * Uygulamanın kullandığı sözlük: yeni ölçek + eski adlar.
 *
 * TAKMA AD EŞLEMESİ (eski kod kırılmasın ama görünürlük kazansın):
 *   title    → h2 (15)  · kart/satır başlığı
 *   subtitle → h4 (13)  · alt başlık
 *   small    → bodySm (11) · ikincil metin
 *   score    → scoreLg (22) · büyük skor
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

/**
 * Türkçe büyük harf — I/İ sorununu önler (CANLI, İY, MS rozetleri).
 *
 * DEĞER TİPİ GEVŞEK TUTULUR: alan adları şemada zorunlu görünse de sunucu
 * kısmi kayıt döndürdüğünde (200 gövdesinde hata, eksik sütun) buraya
 * `undefined` geliyordu ve `undefined.toLocaleUpperCase` TÜM EKRANI
 * çökertiyordu. Bir rozetin metni yüzünden sayfa kaybedilmez.
 */
export function upperTR(value: string | null | undefined): string {
  return String(value ?? "").toLocaleUpperCase("tr-TR");
}
