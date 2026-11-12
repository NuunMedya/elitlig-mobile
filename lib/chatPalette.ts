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
  bg: "#FFFFFF",
  surface: "#FFFFFF",
  raised: "#F0F2F5",
  pressed: "#F5F6F6",
  hairline: "#E9EDEF",
  hairlineStrong: "#D1D7DB",
  overlay: "rgba(11,20,26,0.50)",
  ripple: "rgba(11,20,26,0.08)",
  /* metin */
  text: "#111B21",
  textSecondary: "#54656F",
  textTertiary: "#5F6F79",
  textDisabled: "#8696A0",
  listMeta: "#667781",
  /* yeşil vurgu */
  accent: "#008069",
  accentStrong: "#006D59",
  accentText: "#00755F",
  accentDim: "#D8FDD2",
  accentBorder: "#A5E6C9",
  onAccent: "#FFFFFF",
  title: "#008069",
  headerIcon: "#54656F",
  badge: "#25D366",
  onBadge: "#0B141A",
  badgeMuted: "#667781",
  onBadgeMuted: "#FFFFFF",
  unreadTime: "#00755F",
  fab: "#00A884",
  onFab: "#FFFFFF",
  send: "#00A884",
  onSend: "#FFFFFF",
  online: "#25D366",
  /* süzgeç hapı, arama */
  chip: "#F0F2F5",
  chipText: "#54656F",
  chipSelected: "#D8FDD2",
  chipSelectedText: "#00755F",
  searchField: "#F0F2F5",
  /* fotoğrafsız avatar */
  avatarBg: "#DFE5E7",
  avatarGlyph: "#FFFFFF",
  avatarInk: "#54656F",
  /* sohbet ekranı */
  wall: "#EFEAE2",
  wallPattern: "rgba(84,70,50,0.07)",
  composerBar: "#EFEAE2",
  composerField: "#FFFFFF",
  composerIcon: "#54656F",
  bubbleMine: "#D9FDD3",
  bubbleTheirs: "#FFFFFF",
  bubbleText: "#111B21",
  bubbleMeta: "#56666F",
  bubbleShade: "rgba(11,20,26,0.13)",
  bubbleAccentMine: "#00755F",
  bubbleAccentTheirs: "#00755F",
  quoteMine: "#D1F4CC",
  quoteTheirs: "#F5F6F6",
  insetMine: "#C8EEC2",
  insetTheirs: "#F0F2F5",
  bubbleInset: "rgba(11,20,26,0.06)",
  bubbleLine: "rgba(11,20,26,0.12)",
  pollFill: "rgba(0,168,132,0.22)",
  tickSent: "#8696A0",
  tickRead: "#53BDEB",
  link: "#026E9E",
  dayPill: "#FFFFFF",
  dayText: "#54656F",
  highlight: "rgba(0,168,132,0.18)",
  waveIdle: "rgba(17,27,33,0.26)",
  waveActive: "#00A884",
  voicePlayMine: "#54656F",
  voicePlayTheirs: "#54656F",
  voiceMic: "#00A884",
  voiceMicPlayed: "#53BDEB",
  /* durum renkleri */
  danger: "#D3002F",
  dangerDim: "#FDE8EC",
  warn: "#B54708",
  warnDim: "#FEF2E4",
  positive: "#00755F",
  positiveDim: "#D8FDD2",
  star: "#C77700",
  info: "#026E9E",
  infoDim: "#E1F3FB",
  neutralSolid: "#667781",
  skeletonBase: "#E9EDEF",
  skeletonHighlight: "#F5F6F6",
  shadow: "#0B141A",
  /* fotoğraf görüntüleyici (iki temada da siyah) */
  viewerBg: "#000000",
  viewerText: "#FFFFFF",
  viewerMuted: "rgba(255,255,255,0.7)",
  viewerChrome: "rgba(0,0,0,0.55)",
};

const DARK: typeof LIGHT = {
  bg: "#0B141A",
  surface: "#111B21",
  raised: "#1F2C34",
  pressed: "#182229",
  hairline: "#222D34",
  hairlineStrong: "#2A3942",
  overlay: "rgba(0,0,0,0.60)",
  ripple: "rgba(233,237,239,0.10)",
  text: "#E9EDEF",
  textSecondary: "#8696A0",
  textTertiary: "#8696A0",
  textDisabled: "#5E6C75",
  listMeta: "#8696A0",
  accent: "#00A884",
  accentStrong: "#008F72",
  accentText: "#00A884",
  accentDim: "#0A332C",
  accentBorder: "#0E5446",
  onAccent: "#0B141A",
  title: "#E9EDEF",
  headerIcon: "#AEBAC1",
  badge: "#00A884",
  onBadge: "#0B141A",
  badgeMuted: "#8696A0",
  onBadgeMuted: "#0B141A",
  unreadTime: "#00A884",
  fab: "#00A884",
  onFab: "#0B141A",
  send: "#00A884",
  onSend: "#0B141A",
  online: "#25D366",
  chip: "#1F2C34",
  chipText: "#8696A0",
  chipSelected: "#0A332C",
  chipSelectedText: "#D8FDD2",
  searchField: "#1F2C34",
  avatarBg: "#3B4A54",
  avatarGlyph: "#AEBAC1",
  avatarInk: "#D1D7DB",
  wall: "#0B141A",
  wallPattern: "rgba(233,237,239,0.035)",
  composerBar: "#0B141A",
  composerField: "#1F2C34",
  composerIcon: "#8696A0",
  bubbleMine: "#005C4B",
  bubbleTheirs: "#1F2C34",
  bubbleText: "#E9EDEF",
  bubbleMeta: "rgba(233,237,239,0.76)",
  bubbleShade: "rgba(0,0,0,0.30)",
  bubbleAccentMine: "#7AE3C3",
  bubbleAccentTheirs: "#00A884",
  quoteMine: "#01493C",
  quoteTheirs: "#18232A",
  insetMine: "#024A3D",
  insetTheirs: "#18232A",
  bubbleInset: "rgba(0,0,0,0.20)",
  bubbleLine: "rgba(233,237,239,0.14)",
  pollFill: "rgba(0,168,132,0.38)",
  tickSent: "rgba(233,237,239,0.76)",
  tickRead: "#53BDEB",
  link: "#7FD0F5",
  dayPill: "#1D282F",
  dayText: "#AEBAC1",
  highlight: "rgba(0,168,132,0.24)",
  waveIdle: "rgba(233,237,239,0.32)",
  waveActive: "#D1D7DB",
  voicePlayMine: "#D1D7DB",
  voicePlayTheirs: "#AEBAC1",
  voiceMic: "#25D366",
  voiceMicPlayed: "#53BDEB",
  danger: "#F4707F",
  dangerDim: "#3A2227",
  warn: "#FFD279",
  warnDim: "#33290F",
  positive: "#4BE28C",
  positiveDim: "#0A332C",
  star: "#FFD279",
  info: "#53BDEB",
  infoDim: "#12303D",
  neutralSolid: "#8696A0",
  skeletonBase: "#1F2C34",
  skeletonHighlight: "#2A3942",
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
  ? ["#06CF9C", "#B7A5FF", "#53BDEB", "#FF9A4B", "#FF85AE", "#FFD279", "#7AE3C3", "#C4B5FD", "#FDBA74", "#86EFAC"]
  : ["#00755F", "#6B4FD8", "#026E9E", "#A34A08", "#C2185B", "#8A5A00", "#0A7068", "#4F46E5", "#B93815", "#127336"];

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
