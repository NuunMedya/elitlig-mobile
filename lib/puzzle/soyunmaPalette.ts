/**
 * SOYUNMA ODASI — forma paleti (alan verisi; lib/ altında hex serbest).
 *
 * Renk körlüğü için her takımın rengi DESENLE (düz / dikey çizgi / yatay
 * bant / yarım / çapraz kuşak / V yaka şeridi) ve göğüs NUMARASIYLA birlikte
 * ayırt edilir: iki takım aynı tona yakın görünse bile desen + numara farklıdır.
 */

export type SoyunmaPattern = "duz" | "cizgili" | "bantli" | "yarim" | "kusak" | "omuz";

export interface SoyunmaTeam {
  /** Takım adı (kurgusal) — erişilebilirlik etiketlerinde okunur. */
  name: string;
  /** Gövde rengi. */
  primary: string;
  /** Desen rengi (çizgi, bant, kuşak). */
  secondary: string;
  /** Numara rengi — gövde üstünde okunaklı. */
  ink: string;
  pattern: SoyunmaPattern;
  /** Göğüs numarası. */
  number: number;
}

/** Sıra önemlidir: ilk seviyelerde ilk renkler (en ayrık tonlar) kullanılır. */
export const SOYUNMA_TEAMS: readonly SoyunmaTeam[] = [
  { name: "Kızıl Şimşekler", primary: "#E5383B", secondary: "#FFFFFF", ink: "#FFFFFF", pattern: "duz", number: 1 },
  { name: "Mavi Dalgalar", primary: "#1E6FD9", secondary: "#FFFFFF", ink: "#FFFFFF", pattern: "cizgili", number: 2 },
  { name: "Sarı Arılar", primary: "#F7C531", secondary: "#1B1B1B", ink: "#1B1B1B", pattern: "bantli", number: 3 },
  { name: "Yeşil Vadi", primary: "#2BA84A", secondary: "#0B3D1C", ink: "#FFFFFF", pattern: "kusak", number: 4 },
  { name: "Mor Kartallar", primary: "#7B3FC4", secondary: "#E9DBFF", ink: "#FFFFFF", pattern: "yarim", number: 5 },
  { name: "Turuncu Güneş", primary: "#F47B20", secondary: "#FFE3C7", ink: "#1B1B1B", pattern: "omuz", number: 6 },
  { name: "Kara Kartal", primary: "#2B2B33", secondary: "#E6E6EA", ink: "#FFFFFF", pattern: "cizgili", number: 7 },
  { name: "Pembe Panterler", primary: "#E85D9E", secondary: "#FFE0EF", ink: "#1B1B1B", pattern: "bantli", number: 8 },
  { name: "Turkuaz Yıldız", primary: "#14B8B0", secondary: "#063E3B", ink: "#06302E", pattern: "yarim", number: 9 },
  { name: "Kahve Değirmen", primary: "#8A5A35", secondary: "#F2D9BF", ink: "#FFFFFF", pattern: "kusak", number: 10 },
  { name: "Beyaz Atlar", primary: "#F2F2F5", secondary: "#2A62C9", ink: "#1B1B1B", pattern: "omuz", number: 11 },
  { name: "Lacivert Gece", primary: "#1C2A5C", secondary: "#F7C531", ink: "#F7C531", pattern: "duz", number: 12 },
];

/** Gizli formanın ("?") renkleri. */
export const SOYUNMA_HIDDEN = {
  body: "#59607E",
  trim: "#737A98",
  ink: "#F2F3FA",
} as const;

/**
 * Dolap / askı çizim renkleri — sade çelik dolap: açık gri-mavi gövde,
 * aydınlık iç boşluk (formalar her tonda okunur), ince koyu kenar.
 */
export const SOYUNMA_LOCKER = {
  rail: "#B7BDCE",
  railDark: "#8C93A8",
  railHi: "#EEF0F6",
  lockBody: "#FFFFFF",
  lockDark: "#3A4166",
  sparkle: "#FFD84D",
  crest: "#FFC93C",
  crestEdge: "#C99412",
  crestInk: "#5C3B00",
  crestShine: "rgba(255, 255, 255, 0.6)",
  /** Çelik gövde (soldan ışık) ve kenarı. */
  lockerHi: "#E9EDF6",
  locker: "#D5DBEA",
  lockerLo: "#BCC4D9",
  lockerEdge: "#A3ACC4",
  cavity: "#F5F7FC",
  cavityLo: "#E3E8F3",
  vent: "#A7B0C7",
  ghost: "#C3CADC",
  /** Kilitli dolap kapısı: koyu arduvaz. */
  door: "#4A5274",
  doorHi: "#5A6386",
  doorLo: "#3A4160",
} as const;

/** Kumaş ışığı ve gölgesi (formalar). */
export const SOYUNMA_SHADE = {
  light: "#FFFFFF",
  dark: "#000000",
  drop: "rgba(20, 24, 60, 0.18)",
  inkEdgeDark: "rgba(0, 0, 0, 0.35)",
  inkEdgeLight: "rgba(255, 255, 255, 0.4)",
} as const;

/**
 * Oyun içi arayüz: HUD, oda zemini, güçlendirici. Sade dil: nötr lacivert
 * paneller, tek vurgu (yeşil ilerleme), yıldızlar altın, uyarı kırmızı.
 */
export const SOYUNMA_UI = {
  /** HUD paneli. */
  panel: "#232860",
  panelDeep: "#1A1E4C",
  /** İlerleme yeşili (tek vurgu). */
  green: "#2FCB6E",
  greenDeep: "#22B35E",
  /** Yıldız ve skor altını. */
  gold: "#FFC93C",
  goldInk: "#4A3300",
  /** Uyarı (az hamle kaldı). */
  red: "#E5484D",
  /** Oda: koyu lacivert, yumuşak üst ışık, ince zemin çizgisi. */
  roomTop: "#262C66",
  roomBottom: "#1A1E4A",
  roomGlow: "#3A4290",
  floor: "#151838",
  floorLine: "rgba(255, 255, 255, 0.10)",
  starOff: "rgba(255, 255, 255, 0.22)",
  barTrack: "rgba(255, 255, 255, 0.14)",
  text: "#FFFFFF",
  textSoft: "rgba(255, 255, 255, 0.68)",
  textShadow: "rgba(8, 10, 35, 0.35)",
  scrim: "rgba(10, 12, 36, 0.62)",
  card: "#FFFFFF",
  cardInk: "#1B1F3F",
  cardMuted: "#6A6F8C",
  selected: "#FFFFFF",
  tipFace: "#FFFFFF",
  tipInk: "#1B1F3F",
  tipIcon: "#FFF4D0",
  tipIconInk: "#9A6B00",
} as const;
