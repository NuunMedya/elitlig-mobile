/**
 * ELİT ÜÇLÜ — oyun içi renk paleti (veri).
 *
 * Tahta iki temada da aynı "gece maçı" stadıdır: taşların renk kimliği tema
 * değişince kaymamalı (oyuncu "kırmızı forma" diye öğrenir). Bu yüzden renkler
 * tema tokenı değil, oyun verisidir ve burada hex olarak durur; bileşenler
 * bu dosyayı içe aktarır (components/ altında çıplak hex yazılmaz).
 *
 * TAŞLAR = PARLAK, TIKNAZ FUTBOL NESNELERİ: her tür hem ŞEKLİYLE hem RENGİYLE
 * ayrılır (renk körlüğünde de okunur): mavi top, kırmızı forma, yeşil
 * krampon, sarı kaleci eldiveni, mor düdük, pembe köşe bayrağı. Her türün
 * tonları: açık parıltı (hi), gövde (base), gölge (lo), en koyu kenar (rim)
 * ve ayrıntı (panel: dikiş, şerit, desen).
 * Özel taşlar RENKSİZDİR (füze, dron, Röveşata, Altın Top): kendi sabit
 * renkleri `UCLU_SPECIAL`'dadır.
 */

import { CARTOON } from "@/lib/game/cartoon";

/** Kalın lacivert kontur (arcade oyunlarıyla ortak). */
export const UCLU_OUTLINE = CARTOON.outline;

export type UcluBallPattern = "classic" | "swirl" | "star";

export type UcluPieceShape = "ball" | "jersey" | "boot" | "glove" | "whistle" | "flag";

export interface UcluPieceColors {
  /** Çizim biçimi (taş türü). */
  shape: UcluPieceShape;
  base: string;
  hi: string;
  lo: string;
  /** En koyu ton (rim ışığı altı, gölge). */
  rim: string;
  /** Top panellerinin rengi (gövdenin koyu tonu). */
  panel: string;
  /** Eski sembol rengi (geriye dönük; toplar beyaz simge taşımaz). */
  ink: string;
  /** Panel deseni (renk körlüğünde komşu renkleri ayırır). */
  pattern: UcluBallPattern;
  /** Topun adı (hedef etiketleri, erişilebilirlik). */
  name: string;
}

/** Sıra = taş (renk) dizini; motorun renk sayısı (4–6) bu sırayla kullanılır. */
export const UCLU_PIECE_COLORS: readonly UcluPieceColors[] = [
  {
    base: "#1E7BFF",
    hi: "#9AD8FF",
    lo: "#0B47C4",
    rim: "#06296F",
    panel: "#0A36A0",
    ink: "#FFFFFF",
    pattern: "classic",
    shape: "ball",
    name: "Mavi top",
  },
  {
    base: "#FF2E45",
    hi: "#FFB0B8",
    lo: "#C30C27",
    rim: "#6E0414",
    panel: "#A3061E",
    ink: "#FFFFFF",
    pattern: "swirl",
    shape: "jersey",
    name: "Kırmızı forma",
  },
  {
    base: "#2FD447",
    hi: "#C4FAAE",
    lo: "#139A2A",
    rim: "#0A5216",
    panel: "#0C7A20",
    ink: "#FFFFFF",
    pattern: "classic",
    shape: "boot",
    name: "Yeşil krampon",
  },
  {
    base: "#FFC21A",
    hi: "#FFF6B8",
    lo: "#E89A00",
    rim: "#7A4A00",
    panel: "#D07E00",
    ink: "#FFFFFF",
    pattern: "star",
    shape: "glove",
    name: "Sarı eldiven",
  },
  {
    base: "#A64DFF",
    hi: "#E6C6FF",
    lo: "#6C1FD0",
    rim: "#3B0A80",
    panel: "#5512B0",
    ink: "#FFFFFF",
    pattern: "swirl",
    shape: "whistle",
    name: "Mor düdük",
  },
  {
    base: "#FF45C4",
    hi: "#FFC2EC",
    lo: "#C8128D",
    rim: "#6A044B",
    panel: "#A80A78",
    ink: "#FFFFFF",
    pattern: "classic",
    shape: "flag",
    name: "Pembe bayrak",
  },
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
  /** Kupa balonu (cam küre). */
  bubble: "rgba(200, 236, 255, 0.42)",
  bubbleRim: "#E8F7FF",
  /** Füze hız çizgileri ve Röveşata patlama halkası. */
  speed: "#FFFFFF",
  burstHot: "#FF7A1A",
  /*
   * SADE ÇERÇEVE ("canlı ama temiz"): çevre arayüz nötr — koyu lacivert
   * zemin, yarı saydam beyaz paneller, TEK vurgu rengi (yeşil) eylemler için.
   * Kalın lacivert kontur yok; derinlik yumuşak gölge ve ince alt dudakla.
   */
  chrome: "rgba(255, 255, 255, 0.08)",
  cardSoft: "#E6E9F5",
  chromeHi: "rgba(255, 255, 255, 0.14)",
  chromeEdge: "rgba(255, 255, 255, 0.12)",
  chromeLip: "rgba(0, 0, 0, 0.28)",
  panelTop: "#2A2470",
  panelLow: "#1C1856",
  accent: "#22C55E",
  accentHi: "#4ADE80",
  accentLo: "#15803D",
  accentInk: "#FFFFFF",
  textShadowSoft: "rgba(0, 0, 0, 0.25)",
  /** Saha çerçevesi (ince, kendi tonunda). */
  pitchEdge: "#3E9E36",
  pitchFrame: "#1F1A5E",
  crateEdge: "#8A4F18",
  hintBg: "#FFFFFF",
  hintInk: "#1F2333",
  /** Çim hedefi: çıplak toprak ve çimlenmiş hücre. */
  dirt: "#B9824A",
  dirtLo: "#8A5A2B",
  dirtSpot: "rgba(255, 228, 190, 0.28)",
  grass: "#3FD45A",
  grassHi: "#8BF28C",
  grassLo: "#1E9A38",
  /** Tahta çerçevesi: kalın, parlak altın-ahşap kasa. */
  frameWoodHi: "#FFD27A",
  frameWood: "#E79A32",
  frameWoodLo: "#9C5A12",
  frameWoodRim: "#5E3208",
  frameInset: "#1A3B1F",
  rivet: "#FFF1C4",
  /** Hücre kutucuğu: hafif kabartma kenar. */
  cellHi: "rgba(255, 255, 255, 0.18)",
  cellLo: "rgba(0, 0, 0, 0.10)",
  /** Kombo yazısı: altın gövde + koyu 3B gölge. */
  comboGold: "#FFE066",
  comboDeep: "#B4560B",
  comboInk: "#3A1A00",
  /** Kartal bakışı ışın ve şok dalgası. */
  shock: "rgba(255, 236, 160, 0.55)",
  ballBeam: "#FFF6C8",
} as const;

/** Renksiz özel taşlar ve engeller (füze, dron, Röveşata, koni). */
export const UCLU_SPECIAL = {
  rocketBody: "#FFFFFF",
  rocketBodyLo: "#C9D3E6",
  rocketNose: "#FF3B4E",
  rocketNoseHi: "#FF9AA4",
  rocketNoseLo: "#A8102A",
  rocketBand: "#FFC93C",
  rocketBandLo: "#C47E00",
  rocketRim: "#3A1430",
  flame: "#FFB238",
  flameCore: "#FFF3B0",
  droneBody: "#22C7C1",
  droneHi: "#A6FFF6",
  droneLo: "#0B7C7A",
  droneRim: "#063F3E",
  droneArm: "#2C3550",
  rotor: "rgba(235, 248, 255, 0.55)",
  rotorEdge: "rgba(255, 255, 255, 0.9)",
  droneEye: "#1B1446",
  droneLed: "#FF4D5E",
  bombHi: "#6D7BA8",
  bomb: "#2D3557",
  bombLo: "#121733",
  bombPanel: "#FFC93C",
  fuse: "#C8A06A",
  spark: "#FFE680",
  sparkHot: "#FF7A1A",
  coneHi: "#FFB36B",
  cone: "#FF7A1A",
  coneLo: "#C44A00",
  coneRim: "#6B2400",
  coneStripe: "#FFFFFF",
  coneBase: "#3B3F55",
} as const;

/** Stadyum arka planı (tahtanın arkasındaki sahne). */
export const UCLU_STADIUM = {
  skyTop: "#0B1240",
  skyMid: "#1C2A78",
  skyLow: "#2D3FA0",
  standFar: "#1A2163",
  standNear: "#232C80",
  standEdge: "#3443A8",
  crowdA: "rgba(255, 255, 255, 0.22)",
  crowdB: "rgba(255, 210, 90, 0.28)",
  crowdC: "rgba(255, 90, 120, 0.24)",
  roof: "#0E1650",
  tower: "#2B336E",
  lamp: "#FFFBE6",
  lampGlow: "#FFF2B8",
  beam: "rgba(255, 248, 210, 0.10)",
  pitch: "#1F7A34",
  pitchHi: "#2E9A45",
} as const;
