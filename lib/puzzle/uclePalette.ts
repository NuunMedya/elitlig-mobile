/**
 * ÜÇLE KAZAN — karo türleri ve oyunun sabit renkleri.
 *
 * Karo renkleri OYUN VERİSİDİR (tema tokenı değil): her tür iki temada da
 * aynı renkle tanınmalı. Bu yüzden hex burada, lib/ altında durur;
 * components/ yalnız bu dosyayı içe aktarır.
 *
 * "CANLI AMA TEMİZ" dil: karolar KULÜP ARMASI rozetleridir — her türün kendi
 * silüeti ve iki renkli forma deseni, ortak altın metal çerçeve, emaye
 * parlaklığı ve gerçek bir rozet kalınlığı (kalın kontur yok).
 * Çevre arayüz (HUD, raf, düğmeler) nötr lacivert / yarı saydam beyaz; eylemler
 * için tek vurgu rengi (yeşil).
 */

/*
 * Ortak çizgi film renkleri (lib/game/cartoon.ts → CARTOON ile birebir aynı).
 * Burada içe aktarılmaz, kopyalanır: seviye denetleyicisi
 * (scripts/check-puzzle-ucle.mjs) bu dosyayı düz Node ile yükler ve "@/"
 * takma adını çözemez.
 */
const CARTOON = {
  outline: "#1B1446",
  textShadow: "rgba(27, 20, 70, 0.85)",
  pill: ["#3A2E9E", "#1C1760"],
} as const;

/**
 * Arma silueti. Her tür kendi silüetiyle okunur (renk + desen + biçim).
 */
export type UcleShape =
  | "shield"
  | "round"
  | "hex"
  | "diamond"
  | "crown"
  | "rosette"
  | "octagon"
  | "pennant"
  | "ushield"
  | "drop"
  | "star"
  | "heater"
  | "square"
  | "pentagon";

/** Forma deseni (ikinci renkle çizilir). */
export type UclePattern =
  | "stripes"
  | "hoops"
  | "halves"
  | "sash"
  | "chevron"
  | "quarters"
  | "band"
  | "hband"
  | "checks"
  | "diagonal"
  | "disc"
  | "cross"
  | "pinstripes"
  | "yoke";

/**
 * Karo türü = bir KULÜP ARMASI rozeti: kendine özgü silüet, iki renkli forma
 * deseni ve ortak altın metal çerçeve. İkon ya da harf yok; tür biçim + renk +
 * desenle tanınır.
 */
export interface UcleKind {
  /** Erişilebilirlik / hedef metinlerinde geçen ad. */
  label: string;
  shape: UcleShape;
  pattern: UclePattern;
  /** Ana (zemin) renk. */
  face: string;
  /** Desen rengi. */
  trim: string;
  /** Ana rengin koyu tonu (kıvılcım, halka). */
  deep: string;
}

export const UCLE_KINDS: UcleKind[] = [
  { label: "Kırmızı kalkan", shape: "shield", pattern: "stripes", face: "#E2283A", trim: "#FFFFFF", deep: "#9C1424" },
  { label: "Mavi yuvarlak arma", shape: "round", pattern: "hoops", face: "#1F6FE5", trim: "#FFFFFF", deep: "#0F4296" },
  { label: "Sarı altıgen", shape: "hex", pattern: "halves", face: "#FFCB1F", trim: "#1B2C6B", deep: "#B88A00" },
  { label: "Yeşil baklava", shape: "diamond", pattern: "sash", face: "#14A85A", trim: "#FFFFFF", deep: "#0A6B37" },
  { label: "Mor taç", shape: "crown", pattern: "chevron", face: "#7B3FD6", trim: "#FFFFFF", deep: "#4B2192" },
  { label: "Turuncu mühür", shape: "rosette", pattern: "quarters", face: "#FF7A1A", trim: "#1B2C6B", deep: "#B04A00" },
  { label: "Siyah sekizgen", shape: "octagon", pattern: "band", face: "#22252E", trim: "#FFFFFF", deep: "#0B0C10" },
  { label: "Pembe flama", shape: "pennant", pattern: "hband", face: "#F0388C", trim: "#FFFFFF", deep: "#A3155A" },
  { label: "Turkuaz kalkan", shape: "ushield", pattern: "checks", face: "#10B5C4", trim: "#FFFFFF", deep: "#077580" },
  { label: "Bordo damla", shape: "drop", pattern: "diagonal", face: "#8E1238", trim: "#5EC8FF", deep: "#560A21" },
  { label: "Beyaz yıldız", shape: "star", pattern: "disc", face: "#F4F6FA", trim: "#E2283A", deep: "#A9B0BF" },
  { label: "Lacivert kalkan", shape: "heater", pattern: "cross", face: "#1B2C6B", trim: "#E2283A", deep: "#0C1640" },
  { label: "Gök mavisi arma", shape: "square", pattern: "pinstripes", face: "#5EC8FF", trim: "#FFFFFF", deep: "#1E86C0" },
  { label: "Limon beşgen", shape: "pentagon", pattern: "yoke", face: "#B4E61E", trim: "#1B2C6B", deep: "#6E9408" },
];

export const UCLE_COLORS = {
  /** Arma rozetlerinin ortak metal çerçevesi (altın) ve kalınlığı. */
  rim: "#F6C945",
  rimHi: "#FFF1B8",
  rimDeep: "#A86E12",
  rimEdge: "#7A4C08",
  /** Emaye parlaklığının koyu ucu. */
  dark: "#0B0A24",
  /** Ters karonun sırtı. */
  back: "#4B3FC4",
  backDeep: "#2E2380",
  backInk: "#8F84F0",
  /** Üstü kapalı karonun karartması (rozet silüetinde). */
  shade: "#141A33",
  /** Kilitli karonun örtüsü. */
  veil: "#141A33",
  /** Karo gölgesi. */
  shadow: "rgba(8, 6, 30, 0.35)",
  /** Yüzün üst parlaklık şeridi. */
  shine: "rgba(255, 255, 255, 0.35)",
  /** Karo yüzünün alt koyu bandı (düz iki ton). */
  faceLow: "rgba(8, 6, 30, 0.16)",
  /** İnce, yumuşak kenar (kalın lacivert kontur yok — "canlı ama temiz"). */
  outline: "rgba(10, 8, 40, 0.3)",
  /** Kilit grupları (anahtar rozeti ve kilit halkası aynı renk). */
  locks: ["#FFC21A", "#22D3EE", "#FF5CAA"],
  lockInk: "#1B1446",
  chain: "#C9CED6",
  chainInk: "#1B1446",
  /** Patlama parçacıkları. */
  sparks: ["#FFD24A", "#FFFFFF", "#7CF29A", "#FF7AB6", "#6EC3FF"],
  /** İpucu parlaması. */
  glow: "#7DF9FF",
  white: "#FFFFFF",
};

/**
 * Oyun içi arayüz (HUD, tahta çerçevesi, raf, güçlendiriciler). Tema
 * tokenından bağımsız: oyun sahnesi iki temada da aynı "stadyum gecesi"
 * atmosferini taşır.
 */
export const UCLE_UI = {
  /** HUD paneli — gece moru. */
  panel: "#2A2470",
  panelDeep: "#1C1856",
  panelRim: CARTOON.outline,
  /** İnce, yumuşak kenar (kalın kontur yerine). */
  outline: "rgba(255, 255, 255, 0.1)",
  /** Nötr çerçeve: yarı saydam beyaz paneller, koyu dudak, TEK vurgu (yeşil). */
  chrome: "rgba(255, 255, 255, 0.08)",
  chromeHi: "rgba(255, 255, 255, 0.14)",
  lip: "rgba(0, 0, 0, 0.28)",
  accent: "#22C55E",
  accentDeep: "#15803D",
  ink: "#1F2333",
  inkSoft: "rgba(31, 35, 51, 0.6)",
  white: "#FFFFFF",
  pitchFrame: "#1F1A5E",
  pitchEdge: "#1F7A3A",
  well: "#17114A",
  /** Seviye rozeti / kupa altını. */
  gold: "#FFD23F",
  goldDeep: "#A86E00",
  goldInk: "#4A2E00",
  /** İlerleme yeşili. */
  green: "#7CF06A",
  greenDeep: "#22B33A",
  /** Uyarı kırmızısı (süre azaldı, raf doluyor). */
  red: "#E02D3C",
  redDeep: "#931422",
  /** Güçlendirici mavisi ve turuncusu. */
  blue: "#2F80ED",
  blueDeep: "#1A4FA6",
  orange: "#F0601A",
  orangeDeep: "#A33B08",
  /** Kilit / zincir çipleri. */
  lockChip: "#F5A300",
  lockChipDeep: "#A86E00",
  chainChip: "#8C96A8",
  chainChipDeep: "#555E70",
  barTrack: "#17114A",
  barShine: "rgba(255, 255, 255, 0.35)",
  /** Tahta: çim keçe + ahşap çerçeve. */
  felt: "#33A653",
  feltStripe: "#2D984B",
  feltDeep: "#2F8F2E",
  feltLine: "rgba(255, 255, 255, 0.55)",
  rim: "#3A2E9E",
  rimHi: "#5A48D6",
  rimDeep: "#1C1760",
  /** Raf tepsisi. */
  tray: "#2A2470",
  trayHi: "#3A3390",
  trayDeep: "#1C1856",
  cell: "#17114A",
  cellRim: "rgba(255, 255, 255, 0.16)",
  /** Metin. */
  text: "#FFFFFF",
  textSoft: "rgba(255, 255, 255, 0.72)",
  textShadow: "rgba(0, 0, 0, 0.25)",
  /** Pencere arka örtüsü ve kart. */
  scrim: "rgba(10, 6, 30, 0.62)",
  card: "#2A2470",
  cardDeep: "#1C1856",
  /** İpucu balonu. */
  tipFace: "#FFFFFF",
  tipDeep: CARTOON.outline,
  tipInk: "#1F2333",
  shine: "rgba(255, 255, 255, 0.4)",
} as const;
