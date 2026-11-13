/**
 * SOHBET PALETİ — MESAJLAR BÖLÜMÜNÜN KENDİ RENK SİSTEMİ (WhatsApp görünümü).
 *
 * Uygulamanın geri kalanı mor / pembe marka paletini kullanır (`theme/palette.ts`);
 * mesajlaşma bölümü (sohbet listesi, sohbet ekranı, alt sayfalar, kişi / grup
 * bilgisi, yeni sohbet) bilerek WhatsApp'ın renk sistemini taşır: beyaz ya da
 * koyu lacivert-yeşil zemin, yeşil vurgu, bej duvar kâğıdı, yeşil giden balon.
 *
 * KURALLAR
 *   · `app/` ve `components/` altında çıplak hex yasaktır; WhatsApp renklerinin
 *     TAMAMI burada, `LIGHT` ve `DARK` sözlüklerinde durur.
 *   · Sohbet dosyaları rengi `@/theme`den değil BURADAN alır:
 *       import { colors, elevate, chatPalette, wa } from "@/lib/chatPalette";
 *     `colors`, tema paletiyle AYNI anahtarları taşır (yalnız değerler
 *     WhatsApp'tır); böylece ortak bileşenlerin sohbet kopyaları
 *     (`components/chat/kit/*`) kaynaklarıyla satır satır aynı kalır.
 *   · Tema, modül yüklenirken donduğundan (`theme/index.ts`) seçim bir kez yapılır.
 *   · `LIGHT` / `DARK` DÜZ sözlüklerdir (her satır `ad: "değer"`):
 *     `scripts/check-tokens.mjs` bu dosyayı METİN olarak okuyup kontrast
 *     çiftlerini denetler (dosya `@/theme` içe aktardığı için Node'da yüklenemez).
 */

import { elevation, isDark, palette, type ElevationLevel, type Palette } from "@/theme";
import type { ViewStyle } from "react-native";

const LIGHT = {
  /* zeminler */
  bg: "#F4F3FB",
  surface: "#FFFFFF",
  raised: "#EEECF8",
  pressed: "#EFEDF9",
  hairline: "#E4E1F1",
  hairlineStrong: "#CFCAE6",
  overlay: "rgba(21,19,42,0.50)",
  ripple: "rgba(40,30,110,0.08)",
  /* metin */
  text: "#15132A",
  textSecondary: "#4A4766",
  textTertiary: "#5E5B7A",
  textDisabled: "#ABA8C4",
  listMeta: "#5E5B7A",
  /* yeşil vurgu */
  accent: "#5A46F0",
  accentStrong: "#4936D6",
  accentText: "#5340E6",
  accentDim: "#ECE9FE",
  accentBorder: "#D3CCFB",
  onAccent: "#FFFFFF",
  title: "#15132A",
  headerIcon: "#4A4766",
  badge: "#5A46F0",
  onBadge: "#FFFFFF",
  badgeMuted: "#6E6B8C",
  onBadgeMuted: "#FFFFFF",
  unreadTime: "#5340E6",
  fab: "#5A46F0",
  onFab: "#FFFFFF",
  send: "#5A46F0",
  onSend: "#FFFFFF",
  online: "#0C9672",
  /* süzgeç hapı, arama */
  chip: "#EEECF8",
  chipText: "#4A4766",
  chipSelected: "#ECE9FE",
  chipSelectedText: "#4936D6",
  searchField: "#EEECF8",
  /* fotoğrafsız avatar */
  avatarBg: "#E0DDF0",
  avatarGlyph: "#FFFFFF",
  avatarInk: "#4A4766",
  /* sohbet ekranı */
  wall: "#F4F3FB",
  wallPattern: "rgba(90,70,240,0.05)",
  composerBar: "#F4F3FB",
  composerField: "#FFFFFF",
  composerIcon: "#4A4766",
  bubbleMine: "#ECE9FF",
  bubbleMineEdge: "#E3EBFF",
  bubbleTheirs: "#FFFFFF",
  bubbleText: "#15132A",
  bubbleMeta: "#58557A",
  bubbleShade: "rgba(42,32,112,0.10)",
  bubbleAccentMine: "#4936D6",
  bubbleAccentTheirs: "#5340E6",
  quoteMine: "#F4F2FF",
  quoteTheirs: "#F3F1FB",
  insetMine: "#E2DEFF",
  insetTheirs: "#EEECF8",
  bubbleInset: "rgba(21,19,42,0.06)",
  bubbleLine: "rgba(21,19,42,0.12)",
  pollFill: "rgba(90,70,240,0.20)",
  tickSent: "#8C89A8",
  tickRead: "#0776AA",
  link: "#055F86",
  dayPill: "#FFFFFF",
  dayText: "#4A4766",
  highlight: "rgba(90,70,240,0.16)",
  waveIdle: "rgba(21,19,42,0.26)",
  waveActive: "#5A46F0",
  voicePlayMine: "#4A4766",
  voicePlayTheirs: "#4A4766",
  voiceMic: "#5A46F0",
  voiceMicPlayed: "#0776AA",
  /* durum renkleri */
  danger: "#C8243C",
  dangerDim: "#FDE9EC",
  warn: "#B0600A",
  warnDim: "#FEF1E2",
  positive: "#0A6E54",
  positiveDim: "#E1F6F0",
  star: "#A87300",
  info: "#06709C",
  infoDim: "#E3F4FC",
  neutralSolid: "#666383",
  skeletonBase: "#ECE9F6",
  skeletonHighlight: "#F8F7FD",
  shadow: "#2A2070",
  /* fotoğraf görüntüleyici (iki temada da siyah) */
  viewerBg: "#000000",
  viewerText: "#FFFFFF",
  viewerMuted: "rgba(255,255,255,0.7)",
  viewerChrome: "rgba(0,0,0,0.55)",
};

const DARK: typeof LIGHT = {
  bg: "#100F1A",
  surface: "#1A1929",
  raised: "#232138",
  pressed: "#201E31",
  hairline: "#27253C",
  hairlineStrong: "#3A3852",
  overlay: "rgba(6,5,14,0.66)",
  ripple: "rgba(255,255,255,0.10)",
  text: "#F4F4F8",
  textSecondary: "#B9B7D3",
  textTertiary: "#9997B6",
  textDisabled: "#55536E",
  listMeta: "#9997B6",
  accent: "#8F7BFF",
  accentStrong: "#7B69FF",
  accentText: "#ADA2FF",
  accentDim: "#221F45",
  accentBorder: "#3B3480",
  onAccent: "#0E0C1F",
  title: "#F4F4F8",
  headerIcon: "#B9B7D3",
  badge: "#8F7BFF",
  onBadge: "#0E0C1F",
  badgeMuted: "#55536E",
  onBadgeMuted: "#F4F4F8",
  unreadTime: "#ADA2FF",
  fab: "#8F7BFF",
  onFab: "#0E0C1F",
  send: "#8F7BFF",
  onSend: "#0E0C1F",
  online: "#3DDBB0",
  chip: "#232138",
  chipText: "#B9B7D3",
  chipSelected: "#221F45",
  chipSelectedText: "#C9C1FF",
  searchField: "#232138",
  avatarBg: "#2E2C45",
  avatarGlyph: "#B9B7D3",
  avatarInk: "#D6D4EA",
  wall: "#100F1A",
  wallPattern: "rgba(173,162,255,0.04)",
  composerBar: "#100F1A",
  composerField: "#232138",
  composerIcon: "#9997B6",
  bubbleMine: "#3A2F9E",
  bubbleMineEdge: "#2A3A94",
  bubbleTheirs: "#232138",
  bubbleText: "#F4F4F8",
  bubbleMeta: "rgba(244,244,248,0.74)",
  bubbleShade: "rgba(0,0,0,0.30)",
  bubbleAccentMine: "#C9C1FF",
  bubbleAccentTheirs: "#ADA2FF",
  quoteMine: "#2F2683",
  quoteTheirs: "#1C1B2E",
  insetMine: "#30278A",
  insetTheirs: "#1C1B2E",
  bubbleInset: "rgba(0,0,0,0.20)",
  bubbleLine: "rgba(244,244,248,0.14)",
  pollFill: "rgba(110,91,255,0.38)",
  tickSent: "rgba(244,244,248,0.74)",
  tickRead: "#38C6FF",
  link: "#7FDBFF",
  dayPill: "#1E1D30",
  dayText: "#B9B7D3",
  highlight: "rgba(110,91,255,0.26)",
  waveIdle: "rgba(244,244,248,0.32)",
  waveActive: "#D6D4EA",
  voicePlayMine: "#D6D4EA",
  voicePlayTheirs: "#B9B7D3",
  voiceMic: "#3DDBB0",
  voiceMicPlayed: "#38C6FF",
  danger: "#FF6378",
  dangerDim: "#3A1520",
  warn: "#FFD166",
  warnDim: "#33290F",
  positive: "#3DDBB0",
  positiveDim: "#0E2E28",
  star: "#FFD166",
  info: "#7FDBFF",
  infoDim: "#0F2A3A",
  neutralSolid: "#8F8DAC",
  skeletonBase: "#1E1D30",
  skeletonHighlight: "#2B2943",
  shadow: "#000000",
  viewerBg: "#000000",
  viewerText: "#FFFFFF",
  viewerMuted: "rgba(255,255,255,0.7)",
  viewerChrome: "rgba(0,0,0,0.55)",
};

/** Aktif temanın WhatsApp renkleri (ham adlarla). */
export const wa = isDark ? DARK : LIGHT;

/**
 * Sohbet ekranına özgü renkler. Adlar eski paletle aynıdır (balon, alıntı,
 * tik, gün hapı…); değerler WhatsApp'ındır.
 */
export const chatPalette = {
  wall: wa.wall,
  wallPattern: wa.wallPattern,
  bubbleMine: wa.bubbleMine,
  /** Giden balon degradesinin sol (maviye kayan) ucu — metin kontrastı `bubbleMine` ile aynı ailede. */
  bubbleMineEdge: wa.bubbleMineEdge,
  bubbleTheirs: wa.bubbleTheirs,
  bubbleText: wa.bubbleText,
  bubbleMeta: wa.bubbleMeta,
  /** Balonun alt kenarındaki ince gölge çizgisi (WhatsApp'ın 1 px gölgesi). */
  bubbleShade: wa.bubbleShade,
  /** Balon içindeki vurgulu etiket / simge (kart türü, "Haritada aç"). */
  bubbleAccentMine: wa.bubbleAccentMine,
  bubbleAccentTheirs: wa.bubbleAccentTheirs,
  quoteMine: wa.quoteMine,
  quoteTheirs: wa.quoteTheirs,
  /** Balon içi gömme kutu (anket seçeneği, takım satırı, oyuncu pulu). */
  insetMine: wa.insetMine,
  insetTheirs: wa.insetTheirs,
  /** İki balonda da çalışan yarı saydam gömme zemin, ince çizgi ve anket oy dolgusu. */
  bubbleInset: wa.bubbleInset,
  bubbleLine: wa.bubbleLine,
  pollFill: wa.pollFill,
  tickRead: wa.tickRead,
  tickSent: wa.tickSent,
  link: wa.link,
  mention: wa.link,
  dayPill: wa.dayPill,
  dayText: wa.dayText,
  systemPill: wa.dayPill,
  highlight: wa.highlight,
  waveIdle: wa.waveIdle,
  waveActive: wa.waveActive,
  voicePlayMine: wa.voicePlayMine,
  voicePlayTheirs: wa.voicePlayTheirs,
  voiceMic: wa.voiceMic,
  voiceMicPlayed: wa.voiceMicPlayed,
  viewerBg: wa.viewerBg,
  viewerText: wa.viewerText,
  viewerMuted: wa.viewerMuted,
  viewerChrome: wa.viewerChrome,
} as const;

/**
 * Mesajlar bölümünün "tema" sözlüğü: tema paletiyle aynı anahtarlar, WhatsApp
 * değerleri. Burada karşılığı olmayan anahtarlar (saha, reyting, sekme çubuğu…)
 * tema değerinde kalır; sohbet dosyaları onları kullanmaz.
 *
 * `brand` DOLGUDUR (düğme, seçili işaret), `brandAccent` METİN sürümüdür —
 * açık temada dolgu yeşili açık yeşil zeminde 4,5:1'i geçmediği için metin
 * sürümü bir ton koyudur.
 */
export const colors: Palette = {
  ...palette,
  bg: wa.bg,
  surface1: wa.surface,
  surface2: wa.raised,
  surface3: wa.raised,
  elevated: wa.surface,
  overlay: wa.overlay,
  pressed: wa.pressed,
  ripple: wa.ripple,

  textPrimary: wa.text,
  textSecondary: wa.textSecondary,
  textTertiary: wa.textTertiary,
  textDisabled: wa.textDisabled,
  textOnBrand: wa.onAccent,
  textOnAccent: wa.onAccent,
  textOnStatus: wa.onAccent,

  border: wa.hairline,
  borderStrong: wa.hairlineStrong,
  separator: wa.hairline,

  brand: wa.accent,
  brandStrong: wa.accentStrong,
  brandAccent: wa.accentText,
  brandDim: wa.accentDim,
  brandBorder: wa.accentBorder,

  accent: wa.accent,
  accentStrong: wa.accentStrong,
  accentText: wa.accentText,
  accentDim: wa.accentDim,
  accentBorder: wa.accentBorder,

  slate: wa.neutralSolid,
  slateSoft: wa.hairlineStrong,

  live: wa.danger,
  liveDim: wa.dangerDim,
  win: wa.positive,
  winDim: wa.positiveDim,
  draw: wa.neutralSolid,
  drawDim: wa.raised,
  loss: wa.danger,
  lossDim: wa.dangerDim,
  warn: wa.warn,
  warnDim: wa.warnDim,
  danger: wa.danger,
  dangerDim: wa.dangerDim,
  info: wa.info,
  infoDim: wa.infoDim,

  star: wa.star,
  starEmpty: wa.hairlineStrong,

  shadowColor: wa.shadow,
  skeletonBase: wa.skeletonBase,
  skeletonHighlight: wa.skeletonHighlight,
};

/** `theme.elevate`in sohbet paletiyle çalışan sürümü (alt sayfa, yüzen düğme). */
export function elevate(level: ElevationLevel): ViewStyle {
  return elevation(level, colors, isDark);
}

/**
 * Grup sohbetinde gönderen adı ve yanıt çubuğu renkleri (WhatsApp'ın kişi
 * renkleri). Açık temada beyaz ve açık yeşil balonda okunacak koyu tonlar,
 * koyu temada WhatsApp'ın parlak tonları (mor ve pembe, koyu yeşil alıntı
 * zemininde 4,5:1'i geçsin diye bir ton açıktır). Hepsi `check:tokens`ta ölçülür.
 */
const NAME_COLORS = isDark
  ? ["#3DDBB0", "#ADA2FF", "#7FDBFF", "#FFB547", "#FF8CB5", "#FFD166", "#7AE3C3", "#C9C1FF", "#FDBA74", "#86EFAC"]
  : ["#0A6E54", "#5A46F0", "#06709C", "#94420A", "#B01F57", "#8A5A00", "#0A7068", "#4936D6", "#B93815", "#127336"];

export function senderColor(id: number | string | null | undefined): string {
  const n = Math.abs(Number(id) || String(id ?? "").length);
  return NAME_COLORS[n % NAME_COLORS.length];
}

/** Ek menüsündeki renkli daireler (WhatsApp ataş ızgarası). */
export const attachTones = {
  photo: "#BF59CF",
  camera: "#E91E63",
  video: "#7F66FF",
  doc: "#5157AE",
  audio: "#F0682A",
  poll: "#02A698",
  location: "#1FA855",
  matches: "#0795DC",
  signup: "#02A698",
  award: "#C87708",
  onTone: "#FFFFFF",
} as const;

/**
 * Fotoğrafı olmayan avatar: WhatsApp'ın yumuşak gri dairesi. Simge (kişi /
 * grup silueti) açık renkle, baş harfler okunabilir koyu griyle çizilir.
 * Renk sohbete göre değişmez — liste sakin kalır, renk yalnız fotoğraflardan gelir.
 */
export const avatarTone = { bg: wa.avatarBg, glyph: wa.avatarGlyph, ink: wa.avatarInk } as const;
