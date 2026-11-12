/**
 * ELİT ÜÇLÜ — oyun içi renk paleti (veri).
 *
 * Tahta iki temada da aynı "gece maçı" sahasıdır: taşların renk kimliği tema
 * değişince kaymamalı (oyuncu "mavi = top" diye öğrenir). Bu yüzden renkler
 * tema tokenı değil, oyun verisidir ve burada hex olarak durur; bileşenler
 * bu dosyayı içe aktarır (components/ altında çıplak hex yazılmaz).
 *
 * Taş renkleri bilerek DOYGUN ve birbirinden UZAK seçildi (mavi, kırmızı,
 * limon yeşili, turuncu, mor, pembe); ayrıca her rengin kendi şekli vardır
 * (renk körlüğü). Her taşın dört tonu var: açık parıltı (hi), gövde (base),
 * gölge (lo) ve 3B "dudak"ı veren koyu kenar (rim). ÇİZGİ FİLM dili
 * (lib/game/cartoon.ts): her taşın ve beyaz sembolün dış çizgisi kalın
 * lacivert `UCLU_OUTLINE`'dır; saha arcade sahasıyla aynı parlak yeşildir.
 */

import { CARTOON } from "@/lib/game/cartoon";

/** Kalın lacivert kontur (arcade oyunlarıyla ortak). */
export const UCLU_OUTLINE = CARTOON.outline;

export interface UcluPieceColors {
  base: string;
  hi: string;
  lo: string;
  /** 3B taban ve dış çizgi (en koyu ton). */
  rim: string;
  /** Sembolün rengi (taşın üstünde). */
  ink: string;
}

/** Sıra = taş dizini: top, forma, krampon, eldiven, düdük, kupa. */
export const UCLU_PIECE_COLORS: readonly UcluPieceColors[] = [
  { base: "#1E7BFF", hi: "#9AD0FF", lo: "#0B47C4", rim: "#06296F", ink: "#FFFFFF" },
  { base: "#FF2E45", hi: "#FFA3AD", lo: "#C30C27", rim: "#6E0414", ink: "#FFFFFF" },
  { base: "#3BD43A", hi: "#B5F7A0", lo: "#169A27", rim: "#0A5216", ink: "#FFFFFF" },
  { base: "#FF8A00", hi: "#FFD58A", lo: "#D45200", rim: "#7A2C00", ink: "#FFFFFF" },
  { base: "#A64DFF", hi: "#E0BAFF", lo: "#6C1FD0", rim: "#3B0A80", ink: "#FFFFFF" },
  { base: "#FF3DBE", hi: "#FFB0E6", lo: "#C8128D", rim: "#6A044B", ink: "#FFFFFF" },
];

export const UCLU_BOARD = {
  /** Tahta çerçevesi ve zemini. */
  frame: "#1B1446",
  frameEdge: "#3A2E9E",
  /** Saha: yatay biçim şeritleri (A/B) + hafif dama (C: açık kare katmanı). */
  cellA: "#74DA64",
  cellA2: "#79DE69",
  cellB: "#58BE4B",
  cellB2: "#5DC350",
  cellLine: "rgba(255, 255, 255, 0.08)",
  /** Saha çizgileri (orta saha, orta yuvarlak, taç çizgisi). */
  pitchLine: "rgba(255, 255, 255, 0.7)",
  /** Ahşap tahta çerçevesi. */
  rimHi: "#5A48D6",
  rimMid: "#3A2E9E",
  rimLo: "#1C1760",
  rimInner: "#1B1446",
  /** Seçim halkası ve ipucu ışığı. */
  select: "#FFFFFF",
  selectGlow: "rgba(255, 255, 255, 0.28)",
  /** Çamur. */
  mud: "#A0693A",
  mudDeep: "#6E4220",
  mudSpot: "rgba(255, 220, 170, 0.32)",
  /** Krampon kutusu. */
  wood: "#D98C3F",
  woodHi: "#F2B36A",
  woodLo: "#9A5A1E",
  strap: "#C9CED6",
  strapLo: "#7D8590",
  /** Kar ve kale ağı. */
  snow: "rgba(226, 242, 255, 0.58)",
  snowEdge: "#FFFFFF",
  snowInk: "#2F80ED",
  net: "rgba(255, 255, 255, 0.88)",
  netShade: "rgba(10, 30, 22, 0.35)",
  /** Altın Top ve şampiyonluk kupası. */
  gold: "#F6C344",
  goldHi: "#FFF0B8",
  goldLo: "#B07D0B",
  goldInk: "#6B4A00",
  goldDeep: "#7A4E00",
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
  /** Özel taş parlaması: füze (soğuk beyaz-mavi) ve röveşata (sıcak). */
  glowCool: "#CFF3FF",
  glowWarm: "#FFB938",
  /** Bonus anı ve kombo metni. */
  comboText: "#FFFFFF",
  comboStroke: "#1B1446",
  comboWarm: "#FFD447",
  /** Skor tabelası (HUD). */
  hudTop: "#3A2E9E",
  hudLow: "#1C1760",
  hudEdge: "#1B1446",
  hudWell: "#17114A",
  hudText: "#FFFFFF",
  hudMuted: "rgba(255, 255, 255, 0.72)",
  movesHi: "#7EC8FF",
  movesLo: "#2F80ED",
  movesRim: "#1A4FA6",
  lowHi: "#FF7A7A",
  lowLo: "#E02D3C",
  lowRim: "#931422",
  ribbon: "#FFD23F",
  ribbonLo: "#A86E00",
  ribbonInk: "#4A2E00",
  barTrack: "rgba(255, 255, 255, 0.18)",
  barFill: "#7CF06A",
  barDone: "#FFD447",
  check: "#22C55E",
  /** Güçlendirici düğmeleri: Krampon Darbesi (turuncu), Taktik (camgöbeği). */
  btnHammerHi: "#FFB547",
  btnHammer: "#F0601A",
  btnHammerLo: "#A33B08",
  btnShuffleHi: "#7CF0E4",
  btnShuffle: "#0EA89A",
  btnShuffleLo: "#06665D",
  btnActiveHi: "#FFE45C",
  btnActive: "#F5A300",
  btnActiveLo: "#A86E00",
  badge: "#E02D3C",
  badgeEdge: "#FFFFFF",
  badgePlus: "#22C55E",
  hintBg: "#FFFFFF",
  hintInk: "#1F2333",
} as const;
