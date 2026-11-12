/**
 * SOHBET TONLARI — `components/ui/Badge.tsx` içindeki `toneColors`un sohbet
 * paletiyle çalışan karşılığı. `ListRow` (baştaki simge kutusu) ve `Chip`
 * kopyaları rengi buradan alır; "brand" tonu mor değil WhatsApp yeşilidir.
 */

import type { Tone, ToneColors } from "@/components/ui/Badge";
import { colors } from "@/lib/chatPalette";

export { withAlpha } from "@/components/ui/Badge";
export type { Tone, ToneColors };

const brand: ToneColors = { fg: colors.brandAccent, dim: colors.brandDim, solidBg: colors.brand, solidFg: colors.textOnBrand };

const TONES: Record<Tone, ToneColors> = {
  neutral: { fg: colors.textSecondary, dim: colors.surface3, solidBg: colors.draw, solidFg: colors.textOnStatus },
  brand,
  accent: brand,
  live: { fg: colors.live, dim: colors.liveDim, solidBg: colors.live, solidFg: colors.textOnStatus },
  win: { fg: colors.win, dim: colors.winDim, solidBg: colors.win, solidFg: colors.textOnStatus },
  warn: { fg: colors.warn, dim: colors.warnDim, solidBg: colors.warn, solidFg: colors.textOnStatus },
  danger: { fg: colors.danger, dim: colors.dangerDim, solidBg: colors.danger, solidFg: colors.textOnStatus },
  info: { fg: colors.info, dim: colors.infoDim, solidBg: colors.info, solidFg: colors.textOnStatus },
};

export function toneColors(tone: Tone = "neutral"): ToneColors {
  return TONES[tone];
}
