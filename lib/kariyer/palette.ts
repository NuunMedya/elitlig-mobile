/**
 * KARİYER YOLU — sahne paletleri (oyun VERİSİ; tema rengi değildir).
 *
 * Her kariyer basamağının kendi atmosferi vardır: mahalle sahası gün batımı
 * turuncusu ve asfalt yeşili, amatör lig gece maçı (projektör, canlı çim).
 * Tasarım denetimi app/ ve components/ altında çıplak hex'i yasaklar; oyun
 * renkleri bu yüzden lib/ altında durur ve çizim kodu (lib/kariyer/sim.ts)
 * buradan okur.
 */

export interface KariyerPalette {
  /** Gökyüzü / tribün arkası: üstten alta. */
  sky: [string, string];
  /** Çim: açık ve koyu şerit. */
  pitch: [string, string];
  line: string;
  /** Oyuncunun (senin) forma rengi ve parıltısı. */
  me: string;
  meGlow: string;
  mate: string;
  rival: string;
  rivalGlow: string;
  keeper: string;
  ball: string;
  trail: string;
  net: string;
  post: string;
  /** Kutlama parçacıkları. */
  confetti: string[];
  /** Nişan çizgisi ve vurgu. */
  aim: string;
  good: string;
  bad: string;
}

export const TIER_PALETTES: KariyerPalette[] = [
  // 1 · MAHALLE SAHASI — gün batımı
  {
    sky: ["#FF8A5B", "#7B2FF7"],
    pitch: ["#2FBF71", "#25A862"],
    line: "#F4FFF8",
    me: "#FFD23F",
    meGlow: "#FFE98A",
    mate: "#3ABEFF",
    rival: "#FF4D6D",
    rivalGlow: "#FF8FA3",
    keeper: "#9B5DE5",
    ball: "#FFFFFF",
    trail: "#FFE98A",
    net: "#FFFFFF",
    post: "#FFFFFF",
    confetti: ["#FFD23F", "#FF4D6D", "#3ABEFF", "#9B5DE5", "#2FBF71", "#FFFFFF"],
    aim: "#FFFFFF",
    good: "#B8FF6A",
    bad: "#FF4D6D",
  },
  // 2 · AMATÖR LİG — gece maçı
  {
    sky: ["#0B1E5B", "#12C2E9"],
    pitch: ["#11C58F", "#0EAE7E"],
    line: "#E9FFFA",
    me: "#F15BB5",
    meGlow: "#FF9BD8",
    mate: "#FEE440",
    rival: "#5A6BFF",
    rivalGlow: "#A0AAFF",
    keeper: "#FF9F1C",
    ball: "#FFFFFF",
    trail: "#9BF6FF",
    net: "#E9FFFA",
    post: "#FFFFFF",
    confetti: ["#F15BB5", "#FEE440", "#00F5D4", "#9B5DE5", "#00BBF9", "#FFFFFF"],
    aim: "#FFFFFF",
    good: "#00F5D4",
    bad: "#FF5C7A",
  },
];

export const paletteForTier = (tier: number): KariyerPalette => TIER_PALETTES[Math.max(0, Math.min(TIER_PALETTES.length - 1, tier - 1))];

/** Arayüz (RN görünümleri) için basamak vurgu renkleri. */
export const TIER_UI = [
  { accent: "#FF8A5B", edge: "#C2521F", soft: "rgba(255, 138, 91, 0.16)", ink: "#3D1404", panel: "#3B1E6E", panelEdge: "#241046" },
  { accent: "#12C2E9", edge: "#0A7F9C", soft: "rgba(18, 194, 233, 0.16)", ink: "#04222B", panel: "#10265F", panelEdge: "#081639" },
];
export const uiForTier = (tier: number) => TIER_UI[Math.max(0, Math.min(TIER_UI.length - 1, tier - 1))];

/** Özellik renkleri (kart ve çubuklar). */
export const ATTR_COLORS = { sut: "#FF4D6D", pas: "#3ABEFF", teknik: "#FFD23F", hiz: "#2FBF71" } as const;

/** HUD üstündeki koyu cam yüzeyi. */
export const HUD = {
  glass: "rgba(10, 8, 24, 0.55)",
  glassBorder: "rgba(255, 255, 255, 0.18)",
  text: "#FFFFFF",
  muted: "rgba(255, 255, 255, 0.72)",
  scrim: "rgba(10, 8, 24, 0.72)",
  /** Hiper-casual 3B parçalar: çip yüzü, çubuk rayı, metin gölgesi, altın. */
  chip: "rgba(255, 255, 255, 0.12)",
  track: "rgba(255, 255, 255, 0.16)",
  shadow: "rgba(0, 0, 0, 0.35)",
  gold: "#FFD23F",
  goldEdge: "#C99A00",
  card: "#FFFFFF",
  cardEdge: "#D7D2E8",
  cardInk: "#1E1440",
  cardMuted: "#6B6390",
  badge: "#FF4D6D",
  good: "#2FBF5A",
  goodEdge: "#1E8A3E",
  bad: "#FF4D6D",
  badEdge: "#B02A44",
  ok: "#FFB020",
  okEdge: "#B87700",
} as const;
