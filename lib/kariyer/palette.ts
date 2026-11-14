/**
 * KARİYER YOLU — sahne paletleri (oyun VERİSİ; tema rengi değildir).
 *
 * 2026-11 YENİLEMESİ: beş basamağın her biri kendi atmosferini taşır —
 * mahalle sahası alacakaranlığı, amatör lig akşamı, bölgesel lig gece maçı,
 * süper amatör projektör ışığı, elit lig altın gecesi. Oyuncu renkleri her
 * basamakta aynı kalır (sen sarı, arkadaş mavi, rakip kırmızı, kaleci mor)
 * ki oyuncu kimin kim olduğunu bir kez öğrensin.
 *
 * Tasarım denetimi app/ ve components/ altında çıplak hex'i yasaklar; oyun
 * renkleri bu yüzden lib/ altında durur ve çizim kodu (lib/kariyer/sim.ts)
 * buradan okur.
 */

export interface KariyerPalette {
  /** Gökyüzü / tribün arkası: üstten alta. */
  sky: [string, string];
  /** Tribün katı (koyu) ve korkuluk ışığı. */
  stand: string;
  standRail: string;
  /** Tribün kalabalığı renkleri. */
  crowd: string[];
  /** Saha kenarı reklam panoları. */
  boards: string[];
  /** Projektör ışığı tonu. */
  flood: string;
  /** Çim: açık ve koyu şerit. */
  pitch: [string, string];
  line: string;
  /** Oyuncunun (senin) forma rengi ve parıltısı. */
  me: string;
  meGlow: string;
  mate: string;
  rival: string;
  rivalTrim: string;
  rivalGlow: string;
  keeper: string;
  keeperGlove: string;
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
  /** Engeller: çamur, yağmur, ofsayt çizgisi, rüzgâr bayrağı. */
  mud: string;
  mudDark: string;
  rain: string;
  offside: string;
  flag: string;
}

const PLAYERS = {
  me: "#FFC93C",
  meGlow: "#FFE08A",
  mate: "#3B9BFF",
  rival: "#E5484D",
  rivalTrim: "#FFFFFF",
  rivalGlow: "#F58A8D",
  keeper: "#8E6BE8",
  keeperGlove: "#7BE495",
  ball: "#FFFFFF",
  trail: "#FFFFFF",
  net: "#FFFFFF",
  post: "#FFFFFF",
  aim: "#FFFFFF",
  good: "#7BE495",
  bad: "#FF6B6E",
  mud: "#7A5232",
  mudDark: "#4E3220",
  rain: "#CFE3FF",
  offside: "#FFD23F",
  flag: "#FF8A3D",
} as const;

const CROWD = ["#E5484D", "#FFC93C", "#3B9BFF", "#FFFFFF", "#2FCB6E", "#8E6BE8", "#FF8A3D"];

export const TIER_PALETTES: KariyerPalette[] = [
  // 1 · MAHALLE SAHASI — alacakaranlık, toprak kenarlı saha
  {
    ...PLAYERS,
    sky: ["#3A3F7E", "#6A4C8C"],
    stand: "#2A2E5E",
    standRail: "#4A4F8E",
    crowd: CROWD,
    boards: ["#FF8A3D", "#2E6FE0", "#2FCB6E"],
    flood: "#FFE7B0",
    pitch: ["#3BB26C", "#34A562"],
    line: "#F4FFF8",
    confetti: ["#FFC93C", "#FFFFFF", "#2FCB6E", "#FF8A3D"],
  },
  // 2 · AMATÖR LİG — akşam
  {
    ...PLAYERS,
    sky: ["#1F2766", "#3E3478"],
    stand: "#1E2352",
    standRail: "#3B4290",
    crowd: CROWD,
    boards: ["#12C2E9", "#FFC93C", "#E5484D"],
    flood: "#FFF2CF",
    pitch: ["#2FAE70", "#2AA066"],
    line: "#EFFFF8",
    confetti: ["#FFC93C", "#FFFFFF", "#2FCB6E", "#12C2E9"],
  },
  // 3 · BÖLGESEL LİG — gece maçı
  {
    ...PLAYERS,
    sky: ["#0E1340", "#1E2A66"],
    stand: "#151A45",
    standRail: "#2F3A85",
    crowd: CROWD,
    boards: ["#2FCB6E", "#FFFFFF", "#3B9BFF"],
    flood: "#E8F4FF",
    pitch: ["#2AA874", "#24996A"],
    line: "#E9FFFA",
    confetti: ["#FFC93C", "#FFFFFF", "#2FCB6E", "#3B9BFF"],
  },
  // 4 · SÜPER AMATÖR — projektör ışığı
  {
    ...PLAYERS,
    sky: ["#0A0F33", "#22195A"],
    stand: "#130F3A",
    standRail: "#3A2F8A",
    crowd: CROWD,
    boards: ["#FF4D6D", "#FFC93C", "#FFFFFF"],
    flood: "#FFFFFF",
    pitch: ["#27A96F", "#219A64"],
    line: "#F0FFF8",
    confetti: ["#FFC93C", "#FFFFFF", "#FF4D6D", "#2FCB6E"],
  },
  // 5 · ELİT LİG — altın gece
  {
    ...PLAYERS,
    sky: ["#08061E", "#2A1A4E"],
    stand: "#120B30",
    standRail: "#6A4F1E",
    crowd: CROWD,
    boards: ["#FFD23F", "#FFFFFF", "#C99A00"],
    flood: "#FFF4D0",
    pitch: ["#26AB70", "#1F9B63"],
    line: "#FFFBEA",
    confetti: ["#FFD23F", "#FFFFFF", "#FFC93C", "#2FCB6E"],
  },
];

export const paletteForTier = (tier: number): KariyerPalette => TIER_PALETTES[Math.max(0, Math.min(TIER_PALETTES.length - 1, tier - 1))];

/** Arayüz (RN görünümleri) için basamak vurgu renkleri. */
export const TIER_UI = [
  { accent: "#FF8A5B", edge: "#C2521F", soft: "rgba(255, 138, 91, 0.18)", ink: "#3D1404", panel: "#3B1E6E", panelEdge: "#241046" },
  { accent: "#12C2E9", edge: "#0A7F9C", soft: "rgba(18, 194, 233, 0.18)", ink: "#04222B", panel: "#10265F", panelEdge: "#081639" },
  { accent: "#2FCB6E", edge: "#1E8A3E", soft: "rgba(47, 203, 110, 0.18)", ink: "#06240F", panel: "#0F2A4F", panelEdge: "#071833" },
  { accent: "#FF4D6D", edge: "#B02A44", soft: "rgba(255, 77, 109, 0.18)", ink: "#2B0710", panel: "#24124F", panelEdge: "#140833" },
  { accent: "#FFD23F", edge: "#C99A00", soft: "rgba(255, 210, 63, 0.2)", ink: "#2B2200", panel: "#22143F", panelEdge: "#120A26" },
];
export const uiForTier = (tier: number) => TIER_UI[Math.max(0, Math.min(TIER_UI.length - 1, tier - 1))];

/** Özellik renkleri (kart ve çubuklar). */
export const ATTR_COLORS = { sut: "#FF4D6D", pas: "#3ABEFF", teknik: "#FFD23F", hiz: "#2FBF71" } as const;

/** HUD üstündeki koyu cam yüzeyi. */
export const HUD = {
  glass: "rgba(10, 8, 24, 0.55)",
  glassBorder: "rgba(255, 255, 255, 0.18)",
  text: "#FFFFFF",
  muted: "rgba(255, 255, 255, 0.76)",
  scrim: "rgba(12, 14, 40, 0.74)",
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
  starOff: "rgba(255, 255, 255, 0.22)",
} as const;
