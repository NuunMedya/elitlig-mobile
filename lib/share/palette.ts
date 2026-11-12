/**
 * PAYLAŞIM TUVALİ PALETİ — dışa aktarılan PNG'nin renkleri.
 *
 * NEDEN AYRI BİR PALET: paylaşım görseli Instagram'a, WhatsApp durumuna
 * gider; paylaşanın telefonunda koyu ya da açık tema açık olmasına göre
 * DEĞİŞMEMELİDİR. Bu yüzden tuval aktif paleti (`colors`) okumaz; seçilen
 * görsel temasına göre DONMUŞ paletlerden (`dark`, `light`) türetilir.
 * Değerler yine tema tokenlarından gelir — burada yeni bir renk icat
 * edilmez, yalnız iki token karıştırılır ya da saydamlık verilir.
 *
 * ÜÇ GÖRSEL TEMA (stüdyodaki renk noktaları):
 *   gece    — koyu mor gece, mor → camgöbeği aurora (varsayılan, marka sesi)
 *   neon    — aynı gece, pembe + mor ışık (maç sonu, kutlama)
 *   gunduz  — lavanta sis: açık zemin, koyu mürekkep (beyaz akışlarda okunur)
 */

import { dark, light, type Palette } from "@/theme/palette";

export type ShareThemeKey = "gece" | "neon" | "gunduz";

export interface ShareTheme {
  key: ShareThemeKey;
  label: string;
  /** Stüdyodaki renk noktası. */
  swatch: readonly [string, string];
  dark: boolean;
  /** Zemin: dikey geçiş (üst → alt). */
  bgTop: string;
  bgBottom: string;
  /** Aurora ışıkları (opak renk; saydamlık tuvalde verilir). */
  glowA: string;
  glowB: string;
  glowC: string;
  /** Işıkların gücü 0–1. Açık zeminde ışık daha kısık olmalı. */
  glowPower: number;
  /** İnce ızgara çizgisi. */
  grid: string;
  /** Metin: birincil / ikincil / sönük. */
  ink: string;
  inkSoft: string;
  inkMuted: string;
  /** Kıl çizgi ve cam kart. */
  line: string;
  glass: string;
  glassStrong: string;
  glassLine: string;
  /** İmza degrade — yalnız grafik işaret, metin taşımaz. */
  sigA: string;
  sigB: string;
  /** Vurgu metni (camgöbeği / pembe) ve marka metni (lavanta). */
  accent: string;
  brand: string;
  hot: string;
  /** Degrade dolgu üstündeki metin. */
  onFill: string;
  win: string;
  draw: string;
  loss: string;
  gold: readonly [string, string];
  silver: readonly [string, string];
  bronze: readonly [string, string];
  medalInk: string;
  /** Arma karosu ve yedek baş harf mürekkebi. */
  crestTile: string;
  crestInk: string;
  /** Beyaz logo çiziminin boyanacağı renk (açık zeminde koyu). */
  logoTint: string | null;
  /** Bölge renkleri için kaynak palet (`zoneColor`). */
  zones: Palette;
}

/* ─── küçük renk yardımcıları (yalnız #RRGGBB) ─── */

function rgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Rengi saydamlıkla `rgba()` olarak verir. rgba girdisi olduğu gibi döner. */
export function alpha(color: string, opacity: number): string {
  if (!color.startsWith("#")) return color;
  const [r, g, b] = rgb(color);
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, opacity))})`;
}

/** İki hex rengi karıştırır (t = 0 → a, t = 1 → b). */
export function mix(a: string, b: string, t: number): string {
  const [ar, ag, ab] = rgb(a);
  const [br, bg, bb] = rgb(b);
  const ch = (x: number, y: number) => Math.round(x + (y - x) * t).toString(16).padStart(2, "0");
  return `#${ch(ar, br)}${ch(ag, bg)}${ch(ab, bb)}`;
}

/* Gece moru: mürekkep bloğunun koyu ucu ile zeminin arası; dipte zemin
   gölge rengine doğru bir tık daha iner ki aurora "derinde" parlasın. */
const NIGHT_TOP = mix(dark.gradientInk[1], dark.bg, 0.35);
const NIGHT_BOTTOM = mix(dark.bg, dark.shadowColor, 0.45);

const gece: ShareTheme = {
  key: "gece",
  label: "Gece",
  swatch: dark.gradientSignature,
  dark: true,
  bgTop: NIGHT_TOP,
  bgBottom: NIGHT_BOTTOM,
  glowA: dark.brand,
  glowB: dark.accent,
  glowC: dark.live,
  glowPower: 1,
  grid: alpha(dark.onDark, 0.05),
  ink: dark.onDark,
  inkSoft: alpha(dark.onDark, 0.78),
  inkMuted: alpha(dark.onDark, 0.56),
  line: alpha(dark.onDark, 0.12),
  glass: alpha(dark.onDark, 0.06),
  glassStrong: alpha(dark.onDark, 0.1),
  glassLine: alpha(dark.onDark, 0.14),
  sigA: dark.gradientSignature[0],
  sigB: dark.gradientSignature[1],
  accent: dark.accent,
  brand: dark.brandOnDark,
  hot: dark.liveOnDark,
  onFill: dark.onDark,
  win: dark.win,
  draw: dark.draw,
  loss: dark.loss,
  gold: dark.medalGold,
  silver: dark.medalSilver,
  bronze: dark.medalBronze,
  medalInk: dark.medalInk,
  crestTile: alpha(dark.onDark, 0.94),
  crestInk: light.inverse,
  logoTint: null,
  zones: dark,
};

const neon: ShareTheme = {
  ...gece,
  key: "neon",
  label: "Neon",
  swatch: [dark.live, dark.brand],
  bgTop: mix(dark.liveDim, NIGHT_TOP, 0.45),
  bgBottom: NIGHT_BOTTOM,
  glowA: dark.live,
  glowB: dark.brand,
  glowC: dark.accent,
  sigA: dark.gradientLive[0],
  sigB: dark.brand,
  accent: dark.liveOnDark,
  hot: dark.accent,
};

const gunduz: ShareTheme = {
  key: "gunduz",
  label: "Gündüz",
  swatch: [light.brandDim, light.brand],
  dark: false,
  bgTop: light.surface1,
  bgBottom: mix(light.bg, light.brandDim, 0.6),
  glowA: light.brand,
  glowB: light.accent,
  glowC: light.live,
  glowPower: 0.55,
  grid: alpha(light.inverse, 0.05),
  ink: light.textPrimary,
  inkSoft: light.textSecondary,
  inkMuted: light.textTertiary,
  line: alpha(light.inverse, 0.1),
  glass: alpha(light.surface1, 0.72),
  glassStrong: alpha(light.surface1, 0.9),
  glassLine: alpha(light.inverse, 0.1),
  sigA: light.gradientSignature[0],
  sigB: light.gradientSignature[1],
  accent: light.accentText,
  brand: light.brandAccent,
  hot: light.live,
  onFill: light.textOnBrand,
  win: light.win,
  draw: light.draw,
  loss: light.loss,
  gold: light.medalGold,
  silver: light.medalSilver,
  bronze: light.medalBronze,
  medalInk: light.medalInk,
  crestTile: light.surface1,
  crestInk: light.inverse,
  logoTint: light.brand,
  zones: light,
};

export const SHARE_THEMES: readonly ShareTheme[] = [gece, neon, gunduz];

export function shareTheme(key: ShareThemeKey): ShareTheme {
  return SHARE_THEMES.find((item) => item.key === key) ?? gece;
}
