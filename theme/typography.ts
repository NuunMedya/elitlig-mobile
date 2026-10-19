/**
 * Tipografi ölçeği — OKUNAKLI ve HİYERARŞİK.
 *
 * ÖLÇEK NEDEN BÜYÜTÜLDÜ (bu sürümün asıl kararı):
 *
 * Önceki sürümler ölçeği adım adım küçültüyordu; son hâlde gövde 11px,
 * ikincil metin 10px, meta 9px, rozet 8px ve sayfa başlığı 14px'ti.
 * Gerekçe dosyanın kendi cümlesiydi: "küçük punto + geniş boşluk + ışıklı
 * yüzey, büyük punto + sıkışık boşluktan daha pahalı bir izlenim verir."
 *
 * O CÜMLE DOĞRU AMA SINIRI VAR, VE SINIR AŞILMIŞTI. 11px gövde, iOS'un
 * önerdiği 17pt gövdenin ve Material'ın 14sp tabanının belirgin altındadır;
 * 9px meta ile 8px rozet, her iki platformun erişilebilirlik tabanının da
 * altına iner. Telefonda sonuç "yoğun ve şık" değil, KISIK ve YARIM
 * görünüyordu: kullanıcı ekrana yaklaşmak zorunda kalıyorsa, o arayüz pahalı
 * değil ucuz okunur. Premium spor uygulamalarının ortak imzası da bunun
 * tersidir — güvenli, iri, net bir ölçek.
 *
 * YENİ ÖLÇEK: gövde 14, ikincil 12, meta 11, rozet 10, satır başlığı 15,
 * kart başlığı 16, sayfa başlığı 19, kimlik 22. Hiyerarşi eskisinden DAHA
 * nettir: basamaklar artık 1px değil 2–3px aralıklı, yani punto farkı tek
 * başına da okunuyor (eskiden fark yalnız aile + renk ile ayakta duruyordu).
 *
 * SKOR AYRICA BÜYÜDÜ (24 → 40). Bir skor uygulamasında skorun büyüklüğü,
 * ürünün neyle ilgili olduğunu söyleyen ilk şeydir; 24px'lik bir "2–1" satır
 * başlığından yalnız iki kademe büyüktü ve kahraman gibi durmuyordu.
 *
 * YOĞUNLUK KAYBI NASIL KARŞILANDI: ekrana giren satır sayısı elbette azalır.
 * Bu, `theme/space.ts` içindeki satır yükseklikleri ve kenar boşluklarıyla
 * birlikte ayarlandı — ölçek tek başına değil, ONUNLA BİRLİKTE büyüdü;
 * yoksa iri metin 38px'lik satırların içinde kırpılırdı.
 *
 * KURALLAR (neden böyle):
 *  - İKİ AİLE: Archivo (skor/rakam), Plus Jakarta Sans (arayüz metni ve
 *    başlıklar). Bkz. theme/fonts.ts.
 *  - `fontWeight` KULLANILMAZ. Özel fontlarda RN ağırlık uygulamaz; ağırlık
 *    ailenin adıyla seçilir (`fontFamily: fonts.semibold`). Bu dosyadaki her
 *    token doğru aileyi zaten taşır.
 *  - GÖVDE TABANI 14px, META TABANI 12px. 11px'e yalnız `caption`, 10px'e
 *    yalnız `micro`/`overline` iner; o iki token DAİMA büyük harf + geniş harf
 *    aralığı taşır ve büyük harf, o puntoda okunurluğu ayakta tutan şeydir.
 *  - HİYERARŞİ HEM PUNTO HEM TRACKING İLE kurulur: başlıklar negatif
 *    (-0.6…-0.1), büyük harf etiketler pozitif (+0.4…+1.0) tracking alır.
 *  - TÜM rakamlar tabular (`fontVariant: ["tabular-nums"]`). Aksi hâlde canlı
 *    skor 1 → 10 olduğunda satır kayar.
 *  - Türkçe büyük harf dönüşümü daima toLocaleUpperCase("tr-TR") ile yapılır.
 *
 * ÖLÇEK: 10 · 11 · 12 · 13 · 14 · 15 · 17 · 19 · 24 · 28   (metin)
 *        17 · 22 · 30 · 40                            (skor)
 *
 * BASAMAKLAR 2–3px ARALIKLI. Eski ölçekte aralık 1px'ti ve hiyerarşi puntoyla
 * DEĞİL yalnız punto + aile + renk üçlüsüyle kuruluyordu; üçü birlikte iş
 * görüyordu ama tek başına punto hiçbir şey söylemiyordu. Yeni aralıkta bir
 * satır başlığı (15 semibold) ile bir gövde satırı (14 regular) arasındaki
 * fark, renk okunmadan da görülür.
 *
 * ESKİ ADLAR: `score/title/subtitle/body/small/caption` 58 dosyada kullanılıyor;
 * yeni ölçeğe takma ad olarak bağlıdır. Yeni kod doğrudan yeni adları kullanır.
 */

import type { TextStyle } from "react-native";
import { fonts } from "./fonts";

/** Tabular rakam karışımı — skor/dakika/puan içeren her token bunu alır. */
const numeric: Pick<TextStyle, "fontVariant"> = { fontVariant: ["tabular-nums"] };

/** Ölçek — 8–15px metin, ayrı skor ölçeği (12–24), ayrı panel metriği. */
export const scale = {
  /* — Metin ölçeği — */

  /**
   * BÜYÜK BAŞLIK — sekme köklerinin ekran adı ("Maçlar", "Menü").
   * iOS'un 34pt büyük başlığı ile Material'ın 28sp başlığı arasında; sekme
   * kökü, sayfanın ne olduğunu ilk bakışta ve tek kelimeyle söylemeli.
   */
  largeTitle: { fontSize: 28, lineHeight: 34, fontFamily: fonts.heading, letterSpacing: -0.7 },
  /** Ekranın kimlik başlığı: takım adı, oyuncu adı, genişletilmiş sayfa başlığı. */
  display: { fontSize: 24, lineHeight: 30, fontFamily: fonts.heading, letterSpacing: -0.6 },
  /** Sayfa/ekran başlığı (geri düğmeli ekranlar). */
  h1:      { fontSize: 19, lineHeight: 25, fontFamily: fonts.heading, letterSpacing: -0.4 },
  /** Kart ve bölüm başlığı. */
  h2:      { fontSize: 17, lineHeight: 22, fontFamily: fonts.heading, letterSpacing: -0.3 },
  /** Satır başlığı — liste satırındaki isim, en sık kullanılan başlık. */
  h3:      { fontSize: 15, lineHeight: 20, fontFamily: fonts.semibold, letterSpacing: -0.2 },
  /** Alt başlık / güçlü satır metni. */
  h4:      { fontSize: 13, lineHeight: 18, fontFamily: fonts.semibold, letterSpacing: -0.1 },
  /** Uzun metin (haber gövdesi, kurallar, mesaj). */
  bodyLg:  { fontSize: 15, lineHeight: 24, fontFamily: fonts.regular,  letterSpacing: 0 },
  /** ARAYÜZÜN VARSAYILANI. */
  body:    { fontSize: 14, lineHeight: 20, fontFamily: fonts.regular,  letterSpacing: 0 },
  /** İkincil satır, meta metni. */
  bodySm:  { fontSize: 12, lineHeight: 17, fontFamily: fonts.regular,  letterSpacing: 0 },
  /** Buton, sekme, form etiketi. */
  label:   { fontSize: 13, lineHeight: 17, fontFamily: fonts.semibold, letterSpacing: 0 },
  /** Küçük meta — tarih, saha adı, satır altı açıklama. */
  caption: { fontSize: 11, lineHeight: 15, fontFamily: fonts.medium,   letterSpacing: 0.05 },
  /** Rozet içi metin — daima büyük harf. */
  micro:   { fontSize: 10, lineHeight: 13, fontFamily: fonts.semibold, letterSpacing: 0.4 },
  /**
   * Yapısal işaretçi — kart başlıklarının üstündeki büyük-harf satır.
   * Sade dilde bağırmaz: harf aralığı 1.2 → 0.8, rengi daima üçüncül metin.
   */
  overline:{ fontSize: 10, lineHeight: 13, fontFamily: fonts.semibold, letterSpacing: 0.8 },

  /* — Yoğun basamaklar —
     Lig tabloları, liderlik listeleri ve maç kartı gibi sıkı düzenler eskiden
     tokenı yayıp `fontSize`'ı elle eziyordu (`...type.label, fontSize: 12`);
     34 dosyada 112 elle punto birikmişti ve ölçek fiilen ikiye bölünmüştü.
     Sık tekrarlanan her ezme burada adlı bir basamak oldu; ekranlar artık
     punto yazmaz (scripts/check-tokens.mjs denetler). */
  /** Sıkı satır etiketi (takım adı kısaltması, liste ikincil başlığı). */
  labelSm: { fontSize: 12, lineHeight: 16, fontFamily: fonts.semibold, letterSpacing: 0 },
  /** En sıkı etiket (podyum adı, yan yana iki takım adı). */
  labelXs: { fontSize: 11, lineHeight: 14, fontFamily: fonts.semibold, letterSpacing: 0 },
  /** Küçük meta — cümle düzeninde (büyük harf değil) 10px açıklama. */
  meta:    { fontSize: 10, lineHeight: 13, fontFamily: fonts.medium,   letterSpacing: 0.1 },
  /** Haber/makale gövdesi — uzun okuma. */
  article: { fontSize: 16, lineHeight: 26, fontFamily: fonts.regular,  letterSpacing: 0 },

  /* — Skor ölçeği: tamamı Archivo + tabular —
     Skor ekranın KAHRAMANIDIR. 24px'lik bir "2–1", satır başlığından yalnız
     iki kademe büyüktü; bir skor uygulamasında skorun büyüklüğü, o ürünün
     neyle ilgili olduğunu söyleyen ilk şeydir. */
  /** Oyun sonucu ve paylaşım kartının dev sayısı. */
  scoreJumbo:{ fontSize: 48, lineHeight: 52, fontFamily: fonts.bold, letterSpacing: -1.6, ...numeric },
  scoreHero: { fontSize: 40, lineHeight: 44, fontFamily: fonts.bold, letterSpacing: -1.4, ...numeric },
  scoreLg:   { fontSize: 30, lineHeight: 34, fontFamily: fonts.bold, letterSpacing: -1, ...numeric },
  scoreMd:   { fontSize: 22, lineHeight: 26, fontFamily: fonts.bold, letterSpacing: -0.6, ...numeric },
  scoreSm:   { fontSize: 17, lineHeight: 21, fontFamily: fonts.bold, letterSpacing: -0.3, ...numeric },
  /** Liste içi küçük skor/metrik (yoğun maç kartı, podyum sayısı). */
  scoreXs:   { fontSize: 15, lineHeight: 19, fontFamily: fonts.bold, letterSpacing: -0.2, ...numeric },

  /* — Sayısal yardımcılar — */
  clock:          { fontSize: 12, lineHeight: 16, fontFamily: fonts.display, letterSpacing: 0, ...numeric },
  tableNum:       { fontSize: 13, lineHeight: 18, fontFamily: fonts.display, letterSpacing: 0, ...numeric },
  tableNumStrong: { fontSize: 13, lineHeight: 18, fontFamily: fonts.bold,    letterSpacing: 0, ...numeric },
  /** Panel kartlarındaki tek rakam (kadro sayısı, kasa, puan). */
  metric:         { fontSize: 26, lineHeight: 31, fontFamily: fonts.bold, letterSpacing: -0.8, ...numeric },
  metricSm:       { fontSize: 18, lineHeight: 22, fontFamily: fonts.bold, letterSpacing: -0.4, ...numeric },
  /** Sıkı tablo rakamı (puan tablosu sütunları, oran). */
  numSm:          { fontSize: 11, lineHeight: 15, fontFamily: fonts.display, letterSpacing: 0, ...numeric },
  /** Sıkı tablo rakamı, vurgulu (puan, gol sayısı). */
  numSmStrong:    { fontSize: 12, lineHeight: 16, fontFamily: fonts.bold,    letterSpacing: 0, ...numeric },
  /** Rozet içi en küçük rakam — saha üstü forma numarası, reyting pulu. */
  nano:           { fontSize: 9,  lineHeight: 12, fontFamily: fonts.bold,    letterSpacing: 0, ...numeric },
} as const satisfies Record<string, TextStyle>;

/**
 * Uygulamanın kullandığı sözlük: yeni ölçek + eski adlar.
 *
 * TAKMA AD EŞLEMESİ (eski kod kırılmasın ama görünürlük kazansın):
 *   title    → h2 (16)  · kart/satır başlığı
 *   subtitle → h4 (13)  · alt başlık
 *   small    → bodySm (12) · ikincil metin
 *   score    → scoreLg (30) · büyük skor
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
