/**
 * OYUN MERKEZİ — oyun-içi renkler (veri; iki temada da aynı gece-stadyum
 * dünyası). Bileşenler bu dosyayı içe aktarır; components/ ve app/ altında
 * çıplak hex yazılmaz.
 */

export const HUB = {
  /** Ekran zemini: üstten alta derin gece moru. */
  bg: ["#2A1468", "#1A0E45", "#0E0828"] as [string, string, string],
  /** Şehir kartının gökyüzü (alacakaranlık). */
  sky: ["#5B3DF5", "#B04AD8", "#FF8A5B"] as [string, string, string],
  skyline: "#2A1A6E",
  skylineFar: "#4A2E9E",
  window: "#FFD86B",
  stadium: "#FFFFFF",
  stadiumShade: "#CFC8F5",
  arch: "#FFE45C",
  grass: ["#5BE36B", "#1FA83A"] as [string, string],
  beam: "rgba(255, 244, 196, 0.35)",

  white: "#FFFFFF",
  ink: "#1F2333",
  inkShadow: "rgba(0, 0, 0, 0.45)",
  muted: "rgba(255, 255, 255, 0.72)",
  faint: "rgba(255, 255, 255, 0.5)",
  card: "rgba(255, 255, 255, 0.08)",
  cardEdge: "rgba(255, 255, 255, 0.14)",
  cardPress: "rgba(255, 255, 255, 0.14)",
  chip: "rgba(0, 0, 0, 0.28)",

  gold: ["#FFE45C", "#F5A300"] as [string, string],
  goldLip: "#B07800",
  goldInk: "#4A2E00",
  star: "#FFD23F",
  heart: "#FF4D6D",
  green: "#5BE36B",
  track: "rgba(255, 255, 255, 0.16)",

  /** Kategori kurdeleleri. */
  ribbon: {
    quiz: ["#2F80ED", "#1A4FA6"] as [string, string],
    puzzle: ["#FF7AA8", "#C2185B"] as [string, string],
    arcade: ["#FFB547", "#E8650C"] as [string, string],
    league: ["#22B33A", "#147A26"] as [string, string],
    board: ["#8B5CF6", "#5A2FC8"] as [string, string],
    career: ["#14B8C4", "#0A7A85"] as [string, string],
  },

  /** Oyun ikon kareleri (açık → koyu). */
  game: {
    gunun: ["#7EC8FF", "#2F80ED"],
    kimbu: ["#C9A2FF", "#7C4DFF"],
    seri: ["#FF9F5A", "#F0601A"],
    tahmin: ["#5EE6A8", "#16A86A"],
    uclu: ["#6BEA62", "#22B33A"],
    ucle: ["#B79CFF", "#7C4DFF"],
    soyunma: ["#7EC8FF", "#1C78D6"],
    kantin: ["#FFB547", "#E8650C"],
    kariyer: ["#5EE6D8", "#0E9E92"],
    penalti: ["#FF7AA8", "#D9306E"],
    slalom: ["#FFE45C", "#E09A00"],
    sektir: ["#8FB4FF", "#3D5AFE"],
    savunma: ["#FF8A8A", "#E02D3C"],
    kadro: ["#9BE15D", "#4C9A1A"],
    fantezi: ["#C9A2FF", "#5A2FC8"],
    tahminLigi: ["#7FD6FF", "#0B8BC4"],
    kulupArenasi: ["#FFA77A", "#D9541E"],
  } as Record<string, [string, string]>,
} as const;
