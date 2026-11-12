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
 * gölge (lo) ve 3B kalınlığı veren koyu kenar (rim). Beyaz sembolün dış
 * çizgisi de `rim` rengidir.
 */

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
  frame: "#0B241B",
  frameEdge: "#1E5A43",
  /** Saha: yatay biçim şeritleri (A/B) + hafif dama (C: açık kare katmanı). */
  cellA: "#1B7438",
  cellA2: "#1F7C3E",
  cellB: "#15632F",
  cellB2: "#186A33",
  cellLine: "rgba(255, 255, 255, 0.05)",
  /** Saha çizgileri (orta saha, orta yuvarlak, taç çizgisi). */
  pitchLine: "rgba(255, 255, 255, 0.22)",
  /** Ahşap tahta çerçevesi. */
  rimHi: "#D8955A",
  rimMid: "#A2632E",
  rimLo: "#5C3313",
  rimInner: "#2B1707",
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
  comboStroke: "#0B241B",
  comboWarm: "#FFD447",
  /** Skor tabelası (HUD). */
  hudTop: "#24357A",
  hudLow: "#111C49",
  hudEdge: "#FFD447",
  hudWell: "rgba(5, 10, 35, 0.55)",
  hudText: "#FFFFFF",
  hudMuted: "rgba(255, 255, 255, 0.72)",
  movesHi: "#5FB8FF",
  movesLo: "#1A4FD6",
  movesRim: "#0A2475",
  lowHi: "#FF8A8A",
  lowLo: "#D81B2C",
  lowRim: "#6E0414",
  ribbon: "#FFD447",
  ribbonLo: "#C98A00",
  ribbonInk: "#3F2A00",
  barTrack: "rgba(0, 0, 0, 0.45)",
  barFill: "#4ADE6A",
  barDone: "#FFD447",
  check: "#22C55E",
  /** Güçlendirici düğmeleri: Krampon Darbesi (turuncu), Taktik (camgöbeği). */
  btnHammerHi: "#FFB648",
  btnHammer: "#FF7A00",
  btnHammerLo: "#A84500",
  btnShuffleHi: "#5EEBFF",
  btnShuffle: "#0BB4E0",
  btnShuffleLo: "#05688A",
  btnActiveHi: "#FFF3B0",
  btnActive: "#FFD447",
  btnActiveLo: "#B07D0B",
  badge: "#FF2E45",
  badgeEdge: "#FFFFFF",
  badgePlus: "#22C55E",
  hintBg: "rgba(5, 10, 35, 0.72)",
} as const;
