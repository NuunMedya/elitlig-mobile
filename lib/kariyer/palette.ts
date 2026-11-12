/**
 * KARİYER YOLU — sahne paletleri (oyun VERİSİ; tema rengi değildir).
 *
 * Her kariyer basamağının kendi atmosferi vardır: mahalle sahası
 * alacakaranlığı, amatör lig gece maçı. Sade dil: zemin sakin, oyuncu
 * renkleri ayırt edici (sen sarı, arkadaş mavi, rakip kırmızı, kaleci mor).
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
  // 1 · MAHALLE SAHASI — alacakaranlık (sade, düşük doygunluk zemin)
  {
    sky: ["#3A3F7E", "#252A62"],
    pitch: ["#3BB26C", "#35A563"],
    line: "#F4FFF8",
    me: "#FFC93C",
    meGlow: "#FFE08A",
    mate: "#3B9BFF",
    rival: "#E5484D",
    rivalGlow: "#F58A8D",
    keeper: "#8E6BE8",
    ball: "#FFFFFF",
    trail: "#FFFFFF",
    net: "#FFFFFF",
    post: "#FFFFFF",
    confetti: ["#FFC93C", "#FFFFFF", "#2FCB6E"],
    aim: "#FFFFFF",
    good: "#7BE495",
    bad: "#FF6B6E",
  },
  // 2 · AMATÖR LİG — gece maçı
  {
    sky: ["#161B4A", "#1F2A66"],
    pitch: ["#2EAA74", "#299C6A"],
    line: "#E9FFFA",
    me: "#FFC93C",
    meGlow: "#FFE08A",
    mate: "#3B9BFF",
    rival: "#E5484D",
    rivalGlow: "#F58A8D",
    keeper: "#8E6BE8",
    ball: "#FFFFFF",
    trail: "#FFFFFF",
    net: "#E9FFFA",
    post: "#FFFFFF",
    confetti: ["#FFC93C", "#FFFFFF", "#2FCB6E"],
    aim: "#FFFFFF",
    good: "#7BE495",
    bad: "#FF6B6E",
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
  scrim: "rgba(12, 14, 40, 0.72)",
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
  good: "#2FCB6E",
  goodEdge: "#1E8A3E",
  bad: "#E5484D",
  badEdge: "#B02A44",
  ok: "#FFB020",
  okEdge: "#B87700",
} as const;
