/**
 * LİG YOLU OYUN KİTİ — "canlı ama sade" arayüz paleti (alan verisi).
 *
 * Soyunma Odası, Stadyum Kantini ve Kariyer Yolu'nun oyun-içi çerçevesi
 * (HUD, paneller, düğmeler, rozetler) buradan beslenir:
 *   · tek sakin koyu zemin (lacivert-çivit), beyaz / yarı saydam paneller
 *   · TEK vurgu: birincil eylem yeşili; kırmızı yalnız tehlike / yıkıcı eylem
 *   · kalın kontur yok: derinlik yumuşak gölge + 2–4 px'lik alt "dudak"la
 * Oyun parçaları (forma, ürün, oyuncu) kendi renklerini korur; çevreleri nötr.
 */

export const KIT = {
  /** Koyu zemin ve panel tonları. */
  base: "#171B45",
  panel: "#232860",
  panelHi: "#2C3270",
  panelLo: "#1A1E4C",
  panelLip: "#11143A",
  panelEdge: "rgba(255, 255, 255, 0.10)",
  glass: "rgba(255, 255, 255, 0.08)",
  glassEdge: "rgba(255, 255, 255, 0.14)",
  track: "rgba(255, 255, 255, 0.14)",
  trackDark: "rgba(10, 12, 40, 0.45)",

  /** Metin. */
  text: "#FFFFFF",
  textSoft: "rgba(255, 255, 255, 0.72)",
  textFaint: "rgba(255, 255, 255, 0.45)",
  textShadow: "rgba(8, 10, 35, 0.35)",

  /** Beyaz kart. */
  card: "#FFFFFF",
  cardSoft: "#F4F5FA",
  cardEdge: "#E2E4EE",
  cardInk: "#1B1F3F",
  cardMuted: "#6A6F8C",

  /** Birincil vurgu (oyna / devam). */
  accent: "#2FCB6E",
  accentHi: "#45DA82",
  accentLo: "#22B35E",
  accentLip: "#17894A",

  /** Tehlike / yıkıcı. */
  danger: "#E5484D",
  dangerHi: "#F26266",
  dangerLip: "#A9282D",

  /** Yıldız (yalnız yıldız ve skor). */
  star: "#FFC93C",
  starOff: "rgba(255, 255, 255, 0.22)",
  starInk: "#4A3300",

  /** Yumuşak gölge. */
  shadow: "#060824",
  shine: "rgba(255, 255, 255, 0.06)",
  scrim: "rgba(10, 12, 36, 0.62)",
  white: "#FFFFFF",
} as const;
