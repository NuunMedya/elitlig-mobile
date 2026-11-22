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
  /**
   * SAKİN TAHTA: hücre başına kutu YOK. Zemin, iki yakın soluk lavanta
   * tonunda yarı saydam bir damadır (A/B); altındaki yatak (well) koyu,
   * kısık bir laciverttir. Böylece göz zemine değil, önündeki renkli
   * taşlara gider.
   */
  cellA: "rgba(206, 220, 255, 0.42)",
  cellB: "rgba(190, 204, 252, 0.31)",
  /** Hücre yatağı (dama altı) ve çevresindeki ince koyu kenar / gölge. */
  well: "#37427E",
  wellEdge: "rgba(10, 14, 40, 0.55)",
  boardShadow: "rgba(4, 6, 24, 0.42)",
  /** Tahta gölgesi için opak koyu ton (grup saydamlığıyla kullanılır). */
  vignetteInk: "#04061A",
  /** Dama üstüne düşen çok hafif üst ışık. */
  cellGlow: "rgba(255, 255, 255, 0.10)",
  /** Taşların yumuşak yer gölgesi. */
  pieceShadow: "rgba(8, 10, 40, 0.5)",
  /** Çim hedefi (sade): yarı saydam toprak ve çim, ince desen. */
  turfDirt: "rgba(170, 122, 78, 0.50)",
  turfDirtLo: "rgba(96, 60, 30, 0.45)",
  turfDirtSpot: "rgba(255, 226, 186, 0.22)",
  turfGrass: "rgba(86, 200, 108, 0.46)",
  turfGrassHi: "rgba(176, 248, 176, 0.32)",
  turfBlade: "rgba(26, 112, 50, 0.60)",
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
  frameWoodHi: "#F4D48C",
  frameWood: "#C99245",
  frameWoodLo: "#8A5A22",
  frameWoodRim: "#3A230E",
  frameInset: "#1A3B1F",
  rivet: "#FFF1C4",
  /** Hücre kutucuğu: hafif kabartma kenar. */
  cellHi: "rgba(255, 255, 255, 0.18)",
  cellLo: "rgba(0, 0, 0, 0.10)",
  /** Kombo yazısı: altın gövde + koyu 3B gölge. */
  comboGold: "#FFE066",
  comboDeep: "#B4560B",
  comboInk: "#3A1A00",
  /** Çamur birikintisi (taşın altında). */
  mudHi: "#C08A55",
  mudGloss: "rgba(255, 236, 200, 0.45)",
  /** Krampon kutusu: tahta damarı, metal köşe, çivi. */
  woodGrain: "rgba(110, 58, 18, 0.45)",
  woodDeep: "#5A3110",
  metal: "#D9DEE8",
  metalHi: "#FFFFFF",
  metalLo: "#7E8798",
  /** Buz kalıbı. */
  iceHi: "rgba(255, 255, 255, 0.85)",
  iceBody: "rgba(200, 232, 255, 0.50)",
  iceLo: "rgba(120, 180, 240, 0.55)",
  iceCrack: "rgba(255, 255, 255, 0.9)",
  /** Kale ağı: ip ve direk. */
  rope: "#F4F6FA",
  ropeLo: "rgba(40, 50, 90, 0.55)",
  post: "#FFFFFF",
  postLo: "#9AA4BC",
  /** HUD kartları (sakin): koyu yarı saydam lacivert, ince sıcak kenar. */
  cardTop: "rgba(38, 44, 92, 0.94)",
  cardLow: "rgba(20, 24, 60, 0.96)",
  cardEdge: "#C99245",
  cardEdgeHi: "#F4D48C",
  cardTitle: "#F6E3B4",
  cardWell: "rgba(0, 0, 0, 0.22)",
  /** Orta arma (kulüp kalkanı). */
  crestHi: "#6C8BF0",
  crest: "#2F4DB8",
  crestLo: "#16286E",
  crestRibbon: "#D8473E",
  crestRibbonLo: "#8E1F1A",
  /** Yuvarlak güçlendirici düğmesi. */
  orbHi: "#5B67B8",
  orb: "#2E3678",
  orbLo: "#161B48",
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
  bombHi: "#8A98C8",
  bomb: "#3A4470",
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
  /*
   * KISIK, SOLUK SAHNE: tahtanın arkasındaki stat bilinçli olarak
   * doygunluğu düşük ve bulanık görünür; taşlarla yarışmaz.
   */
  skyTop: "#151A30",
  skyMid: "#232A47",
  skyLow: "#2F3656",
  standFar: "#272D4B",
  standNear: "#2E3557",
  standEdge: "#3F4769",
  crowdA: "rgba(255, 255, 255, 0.07)",
  crowdB: "rgba(255, 220, 160, 0.07)",
  crowdC: "rgba(170, 190, 255, 0.08)",
  roof: "#10142A",
  tower: "#363C5C",
  lamp: "#FFF4D6",
  lampGlow: "#FFE7B0",
  beam: "rgba(255, 244, 214, 0.045)",
  pitch: "#26392F",
  pitchHi: "#33493D",
  /** Bulanık sis bantları ve kenar kararması. */
  haze: "rgba(160, 176, 230, 0.08)",
  bokeh: "rgba(255, 236, 196, 0.10)",
  vignette: "#04050E",
} as const;
