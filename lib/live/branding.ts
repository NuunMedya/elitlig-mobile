import { get } from "../http";
import { BUG } from "./scorebug";

/**
 * YAYIN GÖRÜNÜMÜ (overlay branding) — maçın skorbord logosu ve renk teması.
 *
 * Reji panelinde (web "Yayın Tasarımı") maç başına seçilir; sunucu
 * routes/MatchFlow.js `GET /api/maclar/:id/overlay-branding` (yetki
 * matches.live) → { scope, source, branding }.
 *
 *   branding = {
 *     logoUrl: null | "https://…",   // null → Elitlig logosu
 *     brandName: null | "…",
 *     scoreboard: { theme, baseColor, accentColor, font, logoScale },
 *     led:        { … },
 *   }
 *
 * Telefon yalnız `scoreboard` tasarımının renk temasını ve logo boyutunu
 * kullanır (yazı tipi uygulamada yok). Tema renkleri web
 * src/live/overlayBranding.js ile birebir aynı hesaplanır: skorbordun her
 * marka rengi, çapa renginden hedef renge olan ton/doygunluk farkı kadar
 * kaydırılır; açıklık korunur.
 *
 * Renk sabitleri yayın kimliğidir (tema değil) — bu yüzden lib/ altında durur.
 */

export interface ScreenDesign {
  theme: string;
  baseColor: string | null;
  accentColor: string | null;
  logoScale: number;
}

export interface OverlayBranding {
  logoUrl: string | null;
  brandName: string | null;
  scoreboard: ScreenDesign;
}

export const LOGO_SCALE_MIN = 40;
export const LOGO_SCALE_MAX = 200;

const BASE_ANCHOR = "#300030";
const ACCENT_ANCHOR = "#54009c";

/** Sunucu constants/overlayBranding.js OVERLAY_THEMES ile aynı anahtarlar. */
const THEMES: Record<string, { base: string; accent: string } | null> = {
  elitlig: null,
  gece: { base: "#001a3d", accent: "#0a6cff" },
  zumrut: { base: "#00301c", accent: "#00a86b" },
  kizil: { base: "#30000a", accent: "#d4002a" },
  okyanus: { base: "#002a30", accent: "#00a3c4" },
  karbon: { base: "#1e1e1e", accent: "#f5b301" },
  altin: { base: "#2e2100", accent: "#c99400" },
  custom: null,
};

export const DEFAULT_BRANDING: OverlayBranding = {
  logoUrl: null,
  brandName: null,
  scoreboard: { theme: "elitlig", baseColor: null, accentColor: null, logoScale: 100 },
};

/* ───────── renk yardımcıları (web overlayBranding.js ile aynı) ───────── */

type Rgb = [number, number, number];
type Hsl = [number, number, number];

const HEX = /^#?([0-9a-f]{6})$/i;

export function parseHex(value: unknown): Rgb | null {
  const m = HEX.exec(String(value ?? "").trim());
  if (!m) return null;
  const h = m[1];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb;
}

function rgbToHsl([r, g, b]: Rgb): Hsl {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return [h * 60, s, l];
}

function hslToRgb([h, s, l]: Hsl): Rgb {
  const hue = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - c / 2;
  let rgb: [number, number, number];
  if (hue < 60) rgb = [c, x, 0];
  else if (hue < 120) rgb = [x, c, 0];
  else if (hue < 180) rgb = [0, c, x];
  else if (hue < 240) rgb = [0, x, c];
  else if (hue < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  return rgb.map((v) => Math.round(Math.min(1, Math.max(0, v + m)) * 255)) as Rgb;
}

const toHex = (rgb: Rgb) => `#${rgb.map((v) => v.toString(16).padStart(2, "0")).join("")}`;

function shift(hex: string, anchor: string, target: string): Rgb {
  const source = rgbToHsl(parseHex(hex) as Rgb);
  const from = rgbToHsl(parseHex(anchor) as Rgb);
  const to = rgbToHsl(parseHex(target) as Rgb);
  const satFactor = from[1] > 0 ? to[1] / from[1] : 1;
  return hslToRgb([source[0] + (to[0] - from[0]), Math.min(1, Math.max(0, source[1] * satFactor)), source[2]]);
}

/** Tasarımın tema renkleri; Elitlig varsayılanında null (özgün renkler kalır). */
export function resolveThemeColors(design: ScreenDesign | null | undefined): { base: string; accent: string } | null {
  if (!design) return null;
  if (design.theme === "custom") {
    const base = parseHex(design.baseColor) ? String(design.baseColor) : BASE_ANCHOR;
    const accent = parseHex(design.accentColor) ? String(design.accentColor) : ACCENT_ANCHOR;
    if (base.toLowerCase() === BASE_ANCHOR && accent.toLowerCase() === ACCENT_ANCHOR) return null;
    return { base, accent };
  }
  return THEMES[design.theme] ?? null;
}

/** Skorbord renk takımı: BUG.colors ile aynı anahtarlar. */
export type BugPalette = { [K in keyof typeof BUG.colors]: string } & { v800: string };

const V800 = "#3d0070";

/**
 * Skorbordun renk takımı. Zemin ailesi (patlıcan moru) `base`e, aksan ailesi
 * (menekşe) `accent`e göre kaydırılır. Canlı noktası, beyaz ve olay bandı
 * renkleri anlam taşıdığı için değişmez.
 */
export function bugPalette(design: ScreenDesign | null | undefined): BugPalette {
  const colors = resolveThemeColors(design);
  const base: BugPalette = { ...BUG.colors, v800: V800 };
  if (!colors) return base;
  const b = (hex: string) => toHex(shift(hex, BASE_ANCHOR, colors.base));
  const a = (hex: string) => toHex(shift(hex, ACCENT_ANCHOR, colors.accent));
  const hair = shift("#d8bfff", ACCENT_ANCHOR, colors.accent);
  return {
    ...base,
    barTop: b(BUG.colors.barTop),
    barBottom: b(BUG.colors.barBottom),
    p900: b(BUG.colors.p900),
    v700: a(BUG.colors.v700),
    v400: a(BUG.colors.v400),
    v800: a(V800),
    hair: `rgba(${hair.join(", ")}, 0.14)`,
  };
}

/** Elitlig varsayılan renk takımı (tema seçilmemiş). */
export const DEFAULT_PALETTE: BugPalette = bugPalette(null);

export function normalizeLogoScale(value: unknown): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return 100;
  return Math.min(LOGO_SCALE_MAX, Math.max(LOGO_SCALE_MIN, n));
}

function normalizeDesign(input: unknown): ScreenDesign {
  const src = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const theme = typeof src.theme === "string" && src.theme in THEMES ? src.theme : "elitlig";
  return {
    theme,
    baseColor: parseHex(src.baseColor) ? String(src.baseColor).toLowerCase() : null,
    accentColor: parseHex(src.accentColor) ? String(src.accentColor).toLowerCase() : null,
    logoScale: src.logoScale == null ? 100 : normalizeLogoScale(src.logoScale),
  };
}

export function normalizeBranding(input: unknown): OverlayBranding {
  const src = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const logo = typeof src.logoUrl === "string" ? src.logoUrl.trim() : "";
  const brand = typeof src.brandName === "string" ? src.brandName.trim().slice(0, 40) : "";
  return {
    logoUrl: /^https?:\/\//i.test(logo) ? logo : null,
    brandName: brand || null,
    scoreboard: normalizeDesign(src.scoreboard),
  };
}

/**
 * Maçın yayın görünümü. Hata / yetki yok / uç yoksa Elitlig varsayılanı döner
 * (skorbord asla bu yüzden boş kalmaz).
 */
export async function fetchOverlayBranding(matchId: number): Promise<OverlayBranding> {
  try {
    const res = await get<{ branding?: unknown }>(`/api/maclar/${encodeURIComponent(String(matchId))}/overlay-branding`);
    return normalizeBranding(res?.branding);
  } catch {
    return DEFAULT_BRANDING;
  }
}
