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
  body: "#4A4560",
  trim: "#6B6585",
  ink: "#F2F0FA",
} as const;

/** Dolap / askı çizim renkleri (koyu ahşap dolap + metal askı). */
export const SOYUNMA_LOCKER = {
  wood: "#6E4B32",
  woodDark: "#4F3422",
  rail: "#B9BCC6",
  railDark: "#7D8190",
  lockBody: "#D9A62E",
  lockDark: "#8C6A16",
  sparkle: "#FFD84D",
  crest: "#FFD84D",
  crestInk: "#5C3B00",
  /** Ahşap damarı, metal parlaklık ve iç gölge. */
  woodHi: "#8C6343",
  grain: "#3E2818",
  railHi: "#F1F3F7",
  inner: "#2E1E12",
} as const;

/** Kumaş ışığı ve gölgesi (formalar). */
export const SOYUNMA_SHADE = {
  light: "#FFFFFF",
  dark: "#000000",
  drop: "rgba(0, 0, 0, 0.35)",
  inkEdgeDark: "rgba(0, 0, 0, 0.35)",
  inkEdgeLight: "rgba(255, 255, 255, 0.4)",
} as const;
