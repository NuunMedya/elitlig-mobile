/**
 * OYUN PALETİ — oyunlar uygulamanın estetiğinden ayrı bir ada değildir.
 *
 * Aynı kağıt zemin, aynı tebeşir çizgisi, aynı mercan aksiyon, aynı mavi veri.
 * Değerler doğrudan `@/theme`'den okunur; oyunlarda çıplak hex yoktur.
 *
 * TEK İSTİSNA — çim: saha oyunlarında (penaltı, slalom) zemin gerçekten çim
 * olmalıdır, çünkü orada "saha" bir arayüz yüzeyi değil oyunun DÜNYASIDIR.
 * Ama doygun bir yeşil de değil: paletin `win` tonundan türetilmiş, iki tonlu,
 * düşük doygunlukta bir biçme şeridi. Kadro sekmesindeki saha görünümü
 * (`PitchView`) arayüz olduğu için orada zemin sunken yüzeydir — ikisi bilinçli
 * olarak farklıdır.
 */

import { colors } from "@/theme";
import { withAlpha } from "@/components/ui";

export const paint = {
  /** Oyun tuvalinin zemini. */
  ground: colors.bg,
  /** Kart/HUD yüzeyi. */
  surface: colors.surface1,
  line: colors.border,

  ink: colors.textPrimary,
  inkMuted: colors.textTertiary,

  /** Aksiyon: nişan yayı, tam isabet halkası, aktif kapı. */
  action: colors.brand,
  actionPress: colors.brandStrong,

  /** Veri: skor, combo, mesafe, ilerleme. */
  data: colors.accent,

  /** Tebeşir çizgisi — saha üstünde beyaz, kağıt üstünde mürekkep. */
  chalk: colors.chalk,
  chalkInk: colors.chalkInk,

  /** Gölge — topun ve konilerin altındaki elips. */
  shadow: withAlpha(colors.textPrimary, 0.18),

  /** Çim: iki tonlu biçme şeridi, düşük doygunluk. */
  turf: withAlpha(colors.win, 0.16),
  turfAlt: withAlpha(colors.win, 0.1),

  /** Kale direği ve ağ. */
  post: colors.surface1,
  net: withAlpha(colors.textPrimary, 0.22),

  /** Uyarı/başarısızlık: kaçan atış, çarpışma. */
  miss: colors.live,
  success: colors.win,
} as const;
