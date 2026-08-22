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
 * ÖN PLAN İKİ AİLEYE AYRILDI:
 *   `ink` / `inkMuted`  → AÇIK zemin üstüne çizilen şeyler (sektir oyununun
 *                         gökyüzü, HUD kartları).
 *   `onTurf` / `onTurfMuted` → ÇİM üstüne çizilen şeyler (kaleci, tebeşir).
 * Bu ayrım olmadan kaleci derin yeşilin üstünde mürekkeple çiziliyordu ve
 * 1,9:1 kontrastla neredeyse görünmüyordu.
 */

import { colors } from "@/theme";
import { withAlpha } from "@/components/ui";

export const paint = {
  /** Oyun tuvalinin zemini (çim dışı alanlar: gökyüzü, boşluk). */
  ground: colors.bg,
  /** Kart/HUD yüzeyi. */
  surface: colors.surface1,
  line: colors.border,

  /* — AÇIK zemin üstündeki ön plan — */
  ink: colors.textPrimary,
  inkMuted: colors.textTertiary,

  /* — ÇİM üstündeki ön plan — */
  /** Kaleci uzuvları, saha üstündeki metin. */
  onTurf: colors.onPitch,
  onTurfMuted: withAlpha(colors.onPitch, 0.55),

  /** Aksiyon: nişan yayı, tam isabet halkası, aktif kapı, kaleci forması. */
  action: colors.brand,
  actionPress: colors.brandStrong,

  /** Veri: skor, combo, mesafe, ilerleme. */
  data: colors.accent,

  /** Tebeşir çizgisi — çim üstünde beyaz. */
  chalk: withAlpha(colors.onPitch, 0.5),

  /** Gölge — topun, konilerin ve kalecinin altındaki elips. */
  shadow: withAlpha(colors.gradientInk[1], 0.45),

  /** Çim: derin yeşil zemin + beyazın %3'ü biçme şeridi. */
  turf: colors.pitchGreen,
  turfAlt: withAlpha(colors.onPitch, 0.03),

  /** Kale direği ve ağı. */
  post: colors.surface1,
  net: withAlpha(colors.onPitch, 0.3),

  /** Uyarı/başarısızlık: kaçan atış, çarpışma. */
  miss: colors.live,
  success: colors.win,
} as const;
