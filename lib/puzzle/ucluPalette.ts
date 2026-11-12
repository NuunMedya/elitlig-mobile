/**
 * ELİT ÜÇLÜ — oyun içi renk paleti (veri).
 *
 * Tahta iki temada da aynı "gece maçı" sahasıdır: taşların renk kimliği tema
 * değişince kaymamalı (oyuncu "mavi = top" diye öğrenir). Bu yüzden renkler
 * tema tokenı değil, oyun verisidir ve burada hex olarak durur; bileşenler
 * bu dosyayı içe aktarır (components/ altında çıplak hex yazılmaz).
 */

export interface UcluPieceColors {
  base: string;
  hi: string;
  lo: string;
  /** İkonun rengi (taşın üstünde). */
  ink: string;
}

/** Sıra = taş dizini: top, forma, krampon, eldiven, düdük, kupa. */
export const UCLU_PIECE_COLORS: readonly UcluPieceColors[] = [
  { base: "#2F80ED", hi: "#7DB8FF", lo: "#1A4FA6", ink: "#FFFFFF" },
  { base: "#E5484D", hi: "#FF9497", lo: "#A11D24", ink: "#FFFFFF" },
  { base: "#22A861", hi: "#6EE7A4", lo: "#12703F", ink: "#FFFFFF" },
  { base: "#F59E0B", hi: "#FFD47F", lo: "#B25406", ink: "#FFFFFF" },
  { base: "#8B5CF6", hi: "#C9B6FF", lo: "#5A2FC8", ink: "#FFFFFF" },
  { base: "#14B8C4", hi: "#86ECF1", lo: "#0A7A85", ink: "#FFFFFF" },
];

export const UCLU_BOARD = {
  /** Tahta çerçevesi ve zemini. */
  frame: "#0B241B",
  frameEdge: "#1E5A43",
  cellA: "#16402F",
  cellB: "#1B4A37",
  cellLine: "rgba(255, 255, 255, 0.05)",
  /** Seçim halkası ve ipucu ışığı. */
  select: "#FFFFFF",
  selectGlow: "rgba(255, 255, 255, 0.28)",
  /** Çamur. */
  mud: "#7B5432",
  mudDeep: "#563719",
  mudSpot: "rgba(255, 220, 170, 0.16)",
  /** Krampon kutusu. */
  wood: "#B97A3E",
  woodHi: "#D9A066",
  woodLo: "#7A4A1C",
  strap: "#C9CED6",
  strapLo: "#7D8590",
  /** Kar ve kale ağı. */
  snow: "rgba(226, 242, 255, 0.58)",
  snowEdge: "#FFFFFF",
  snowInk: "#5C9BD6",
  net: "rgba(255, 255, 255, 0.88)",
  netShade: "rgba(10, 30, 22, 0.35)",
  /** Altın Top ve şampiyonluk kupası. */
  gold: "#F6C344",
  goldHi: "#FFF0B8",
  goldLo: "#B07D0B",
  goldInk: "#6B4A00",
  /** Efektler. */
  beam: "#FFF4B8",
  beamCore: "#FFFFFF",
  flash: "rgba(255, 255, 255, 0.85)",
  shine: "rgba(255, 255, 255, 0.32)",
  shadow: "rgba(0, 0, 0, 0.32)",
  /** Taş ikonunun gölgesi ve kubbenin koyu ucu. */
  iconShadow: "rgba(0, 0, 0, 0.28)",
  ink: "#000000",
  /** Tahta: altın çerçeve ve projektör ışığı. */
  trimHi: "#FFE9A3",
  trimLo: "#A87410",
  floodlight: "#FFFFFF",
  /** Bonus anı ve kombo metni. */
  comboText: "#FFFFFF",
  comboStroke: "#0B241B",
  comboWarm: "#FFD447",
} as const;
