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
 * DÖRT GÖRSEL STİL (stüdyodaki stil hapları) — hepsi aynı yerleşimi taşır,
 * yalnız "yayın paketi" değişir:
 *   gece     — koyu mor gece, kısık mor → camgöbeği ışık (varsayılan, marka sesi)
 *   saha     — gece yeşili çim: biçilmiş çim bantları, tebeşir çizgisi, altın
 *              vurgu (klasik maç yayını havası)
 *   neon     — aynı gece, pembe + mor ışık (maç sonu, kutlama)
 *   minimal  — açık kâğıt: ışık yok, ızgara yok, koyu mürekkep; beyaz
 *              akışlarda ve baskıda temiz durur
 *
 * TARAF RENKLERİ (`sideA` / `sideB`): karşılaştırma ve düello şablonlarında
 * sol taraf daima `sideA`, sağ taraf daima `sideB` boyanır. Uygulamadaki
 * düello dili (A camgöbeği, B mor) gece stilinde birebir korunur.
 */

import { dark, light, type Palette } from "@/theme/palette";

export type ShareThemeKey = "gece" | "saha" | "neon" | "minimal";

/** Zemin dokusu: ışıklı gece, biçilmiş çim, düz kâğıt. */
export type ShareTexture = "aurora" | "pitch" | "paper";

export interface ShareTheme {
  key: ShareThemeKey;
  label: string;
  /** Stüdyodaki stil hapının iki rengi. */
  swatch: readonly [string, string];
  dark: boolean;
  texture: ShareTexture;
  /** Zemin: dikey geçiş (üst → alt). */
  bgTop: string;
  bgBottom: string;
  /** Işıklar (opak renk; saydamlık tuvalde verilir). */
  glowA: string;
  glowB: string;
  glowC: string;
  /** Işıkların gücü 0–1. Açık zeminde ışık daha kısık olmalı. */
  glowPower: number;
  /** İnce doku çizgisi (çapraz tarama / çim bandı / tebeşir). */
  grid: string;
  /** Metin: birincil / ikincil / sönük. */
  ink: string;
  inkSoft: string;
  inkMuted: string;
  /** Kıl çizgi ve kart. */
  line: string;
  glass: string;
  glassStrong: string;
  glassLine: string;
  /** İmza degrade — yalnız grafik işaret, metin taşımaz. */
  sigA: string;
  sigB: string;
  /** Vurgu metni ve marka metni. */
  accent: string;
  brand: string;
  hot: string;
  /** Degrade dolgu üstündeki metin. */
  onFill: string;
  /** Karşılaştırmada sol (A) ve sağ (B) taraf. */
  sideA: string;
  sideB: string;
  win: string;
  draw: string;
  loss: string;
  gold: readonly [string, string];
  silver: readonly [string, string];
  bronze: readonly [string, string];
  medalInk: string;
  /** Altın METİN (madalya dolgusu değil): açık zeminde koyulaşır. */
  goldText: string;
  /** Parlak rozet (form harfi) üstündeki mürekkep. */
  chipInk: string;
  /** Arma karosu ve yedek baş harf mürekkebi. */
  crestTile: string;
  crestInk: string;
  /** Beyaz logo çiziminin boyanacağı renk (açık zeminde marka moru). */
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
   gölge rengine doğru bir tık daha iner ki ışık "derinde" parlasın. */
const NIGHT_TOP = mix(dark.gradientInk[1], dark.bg, 0.3);
const NIGHT_BOTTOM = mix(dark.bg, dark.shadowColor, 0.5);

const gece: ShareTheme = {
  key: "gece",
  label: "Gece",
  swatch: dark.gradientSignature,
  dark: true,
  texture: "aurora",
  bgTop: NIGHT_TOP,
  bgBottom: NIGHT_BOTTOM,
  glowA: dark.brand,
  glowB: dark.accent,
  glowC: dark.live,
  glowPower: 0.85,
  grid: alpha(dark.onDark, 0.035),
  ink: dark.onDark,
  inkSoft: alpha(dark.onDark, 0.8),
  inkMuted: alpha(dark.onDark, 0.56),
  line: alpha(dark.onDark, 0.12),
  glass: alpha(dark.onDark, 0.055),
  glassStrong: alpha(dark.onDark, 0.1),
  glassLine: alpha(dark.onDark, 0.13),
  sigA: dark.gradientSignature[0],
  sigB: dark.gradientSignature[1],
  accent: dark.accentText,
  brand: dark.brandOnDark,
  hot: dark.liveOnDark,
  onFill: dark.onDark,
  sideA: dark.accent,
  sideB: dark.brandAccent,
  win: dark.win,
  draw: dark.draw,
  loss: dark.loss,
  gold: dark.medalGold,
  silver: dark.medalSilver,
  bronze: dark.medalBronze,
  medalInk: dark.medalInk,
  goldText: dark.medalGold[0],
  chipInk: NIGHT_BOTTOM,
  crestTile: alpha(dark.onDark, 0.95),
  crestInk: light.inverse,
  logoTint: null,
  zones: dark,
};

/* Saha: çimin gece tonu; üstte bir tık ışık, dipte koyu. */
const PITCH_TOP = mix(dark.gradientPitch[0], dark.pitch, 0.2);
const PITCH_BOTTOM = mix(dark.gradientPitch[1], dark.shadowColor, 0.45);

const saha: ShareTheme = {
  ...gece,
  key: "saha",
  label: "Saha",
  swatch: [dark.gradientPitch[0], dark.medalGold[1]],
  texture: "pitch",
  bgTop: PITCH_TOP,
  bgBottom: PITCH_BOTTOM,
  glowA: dark.win,
  glowB: dark.medalGold[0],
  glowC: dark.accent,
  glowPower: 0.5,
  grid: dark.chalk,
  glass: alpha(dark.onDark, 0.06),
  glassStrong: alpha(dark.onDark, 0.11),
  glassLine: alpha(dark.onDark, 0.16),
  sigA: dark.win,
  sigB: dark.medalGold[1],
  accent: dark.medalGold[0],
  brand: dark.win,
  hot: dark.medalGold[0],
  sideA: dark.win,
  sideB: dark.medalGold[0],
  chipInk: PITCH_BOTTOM,
};

const neon: ShareTheme = {
  ...gece,
  key: "neon",
  label: "Neon",
  swatch: [dark.live, dark.brand],
  bgTop: mix(dark.liveDim, NIGHT_TOP, 0.4),
  bgBottom: NIGHT_BOTTOM,
  glowA: dark.live,
  glowB: dark.brand,
  glowC: dark.accent,
  glowPower: 1,
  sigA: dark.gradientLive[0],
  sigB: dark.brand,
  accent: dark.liveOnDark,
  hot: dark.accent,
  sideA: dark.liveOnDark,
  sideB: dark.brandAccent,
};

const minimal: ShareTheme = {
  key: "minimal",
  label: "Minimal",
  swatch: [light.surface1, light.brand],
  dark: false,
  texture: "paper",
  bgTop: light.surface1,
  bgBottom: mix(light.bg, light.surface1, 0.35),
  glowA: light.brand,
  glowB: light.accent,
  glowC: light.live,
  glowPower: 0,
  grid: alpha(light.inverse, 0.05),
  ink: light.textPrimary,
  inkSoft: light.textSecondary,
  inkMuted: light.textTertiary,
  line: alpha(light.inverse, 0.1),
  glass: alpha(light.inverse, 0.035),
  glassStrong: alpha(light.inverse, 0.06),
  glassLine: alpha(light.inverse, 0.1),
  sigA: light.gradientSignature[0],
  sigB: light.gradientSignature[1],
  accent: light.brand,
  brand: light.brandAccent,
  hot: light.live,
  onFill: light.textOnBrand,
  sideA: light.accent,
  sideB: light.brand,
  win: light.win,
  draw: light.draw,
  loss: light.loss,
  gold: light.medalGold,
  silver: light.medalSilver,
  bronze: light.medalBronze,
  medalInk: light.medalInk,
  goldText: light.draw,
  chipInk: light.textOnBrand,
  crestTile: light.surface1,
  crestInk: light.inverse,
  logoTint: light.brand,
  zones: light,
};

export const SHARE_THEMES: readonly ShareTheme[] = [gece, saha, neon, minimal];

export function shareTheme(key: ShareThemeKey): ShareTheme {
  return SHARE_THEMES.find((item) => item.key === key) ?? gece;
}
