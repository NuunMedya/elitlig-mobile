/**
 * OYUN PALETİ — oyunlar uygulamanın estetiğinden ayrı bir ada değildir.
 *
 * Aynı mercan aksiyon, aynı mavi veri, aynı tebeşir dili. Değerler doğrudan
 * `@/theme`'den okunur; oyunlarda çıplak hex yoktur.
 *
 * ÇİM ARTIK GERÇEKTEN ÇİM. Önceki sürümde saha, `win` yeşilinin %16 saydam
 * hâliydi — yani açık kâğıdın üstünde soluk bir yeşil lekeydi. Oyun ekranı
 * "bir arayüzün içine çizilmiş kroki" gibi görünüyordu. Şimdi zemin `pitch`
 * (derin yeşil), biçme şeritleri beyazın %3'ü, çizgiler beyaz tebeşir.
 * Kadro sekmesindeki `PitchView` ile aynı dünyadır; iki ekran arasında geçen
 * kullanıcı aynı sahayı görür.
 *
 * ÖN PLAN TEMADAN BAĞIMSIZDIR. Tuvalin üstündeki her şey (kaleci, direk, top,
 * tebeşir) DAİMA aynı renktedir; `surface1`/`textPrimary` gibi temayla dönen
 * tokenlar buradan kaldırıldı çünkü koyu temada kale direği koyu, top koyu
 * oluyor ve derin yeşil sahada ikisi de kayboluyordu. Sahanın kuralları
 * arayüzün değil futbolun kurallarıdır: direk beyazdır, top beyazdır.
 *
 * HUD (skor, rekor, kartlar) tuvalin DIŞINDADIR ve doğrudan `@/theme`
 * tokenlarını kullanır; orada tema dönüşü doğru davranıştır.
 */

import { colors } from "@/theme";
import { withAlpha } from "@/components/ui";

export const paint = {
  /* — ÇİM üstündeki ön plan — */
  /** Kaleci uzuvları, koni konturu, saha üstündeki işaretler. */
  onTurf: colors.onPitch,
  onTurfMuted: withAlpha(colors.onPitch, 0.55),

  /** Aksiyon: nişan yayı, tam isabet halkası, aktif kapı, kaleci forması. */
  action: colors.brand,

  /** Tebeşir çizgisi — çim üstünde beyaz. */
  chalk: withAlpha(colors.onPitch, 0.5),

  /** Gölge — topun, konilerin ve kalecinin altındaki elips. */
  shadow: withAlpha(colors.gradientInk[1], 0.45),

  /** Çim: derin yeşil zemin + beyazın %3'ü biçme şeridi. */
  turf: colors.pitchGreen,
  turfAlt: withAlpha(colors.onPitch, 0.03),

  /**
   * Kale direği ve ağı — DAİMA BEYAZ.
   *
   * Önceki sürüm direği `surface1` ile çiziyordu; o token koyu temada KOYU bir
   * yüzeydir ve kale, derin yeşil sahanın üstünde neredeyse görünmez oluyordu.
   * Direk gerçek dünyada da beyazdır, temaya göre değişmez.
   */
  post: colors.onPitch,
  net: withAlpha(colors.onPitch, 0.3),

  /**
   * Top — DAİMA BEYAZ gövde + KOYU dikiş. Aynı gerekçe: `surface1` dolgulu bir
   * top koyu temada koyu bir daireye dönüyordu. Beyaz gövde hem açık gökyüzünde
   * (koyu dikiş sayesinde) hem derin yeşilde okunur.
   */
  ball: colors.onPitch,
  ballLine: withAlpha(colors.gradientInk[1], 0.75),

  /** Uyarı/başarısızlık: kaçan atış, çarpışma. */
  miss: colors.live,
} as const;
