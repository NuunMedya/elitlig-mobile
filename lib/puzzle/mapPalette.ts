/**
 * LİG YOLU HARİTASI — bölge paleti (oyun verisi).
 *
 * Harita, her 20 seviyede bir değişen "lig bölgeleri"nden geçen renkli bir
 * yoldur: Amatör Lig'in güneşli parkı, mahallenin gün batımı, gölün kıyısı …
 * Şampiyonlar Gecesi'nin lacivert gökyüzü, Elit Lig'in altını. Renkler tema
 * tokenı değil oyun verisidir (iki temada aynı dünya); bileşenler bu dosyayı
 * içe aktarır, components/ altında çıplak hex yazılmaz.
 */

export type MapDecor = "tree" | "pine" | "bush" | "flag" | "ball" | "goal" | "lamp" | "stand" | "cone" | "house" | "rock" | "star" | "trophy" | "flower";

export interface MapZone {
  /** Çim şeritleri (sıra sıra değişir: biçilmiş saha görünümü). */
  ground: [string, string];
  /** Yol dolgusu, kenarı ve orta çizgisi. */
  road: string;
  roadEdge: string;
  roadLine: string;
  /** Geçilmiş yolun orta çizgisi (ışıklı). */
  roadDone: string;
  /** Geçilmiş düğüm: açık / koyu ton (parlak şeker düğme). */
  node: [string, string];
  /** Bölge pankartı. */
  banner: [string, string];
  /** Dekor renkleri: yaprak, gövde / direk, vurgu. */
  leaf: [string, string];
  wood: string;
  accent: string;
  /** Bölgenin dekor seti. */
  decor: MapDecor[];
  /** Gece bölgesi: yıldızlar ve ışık hüzmeleri. */
  night?: boolean;
}

export const MAP_ZONES: readonly MapZone[] = [
  // Amatör Lig — güneşli park
  {
    ground: ["#63C93A", "#55B930"],
    road: "#F6DEAA",
    roadEdge: "#C9964F",
    roadLine: "#FFFFFF",
    roadDone: "#FFD23F",
    node: ["#FFB547", "#F07B12"],
    banner: ["#2E7D32", "#1B5E20"],
    leaf: ["#2E9E3A", "#1F7A2A"],
    wood: "#8A5A2B",
    accent: "#FF5A5F",
    decor: ["tree", "bush", "ball", "flower", "cone", "tree", "goal"],
  },
  // Mahalle Kupası — gün batımı sokağı
  {
    ground: ["#F7B254", "#EEA243"],
    road: "#5C5F78",
    roadEdge: "#3A3C52",
    roadLine: "#FFE9B0",
    roadDone: "#FFFFFF",
    node: ["#FF7AA8", "#E63E7A"],
    banner: ["#C2410C", "#9A3412"],
    leaf: ["#7CB342", "#558B2F"],
    wood: "#7A4A26",
    accent: "#3D8BEB",
    decor: ["house", "lamp", "tree", "ball", "flag", "house", "bush"],
  },
  // Bölgesel Amatör Lig — göl kıyısı
  {
    ground: ["#3CC3B5", "#33B0A3"],
    road: "#FFF1D2",
    roadEdge: "#D3A764",
    roadLine: "#FF8A3D",
    roadDone: "#FF5A5F",
    node: ["#7EC8FF", "#2F80ED"],
    banner: ["#0E7C74", "#0A5D57"],
    leaf: ["#1E8F5A", "#146C43"],
    wood: "#6D4C2F",
    accent: "#FFD23F",
    decor: ["pine", "rock", "flag", "bush", "pine", "ball", "flower"],
  },
  // 3. Lig — mor alacakaranlık
  {
    ground: ["#9475EC", "#8466DD"],
    road: "#FFE6AE",
    roadEdge: "#C8913E",
    roadLine: "#FFFFFF",
    roadDone: "#FFD23F",
    node: ["#5EE6A8", "#16A86A"],
    banner: ["#5B21B6", "#4C1D95"],
    leaf: ["#3FA34D", "#2B7A37"],
    wood: "#5B3A1F",
    accent: "#FF7AA8",
    decor: ["stand", "lamp", "tree", "flag", "goal", "bush", "cone"],
  },
  // 2. Lig — kırmızı toprak
  {
    ground: ["#E9685C", "#DA5A4E"],
    road: "#FFF3D6",
    roadEdge: "#B97A3A",
    roadLine: "#3A3C52",
    roadDone: "#FFD23F",
    node: ["#FFE45C", "#F5A300"],
    banner: ["#B91C1C", "#7F1D1D"],
    leaf: ["#5FA83B", "#3F7F25"],
    wood: "#5B3A1F",
    accent: "#FFFFFF",
    decor: ["cone", "flag", "stand", "rock", "ball", "lamp", "tree"],
  },
  // 1. Lig — okyanus mavisi
  {
    ground: ["#4796EE", "#3B86DD"],
    road: "#FFF6E0",
    roadEdge: "#C99A55",
    roadLine: "#FF5A5F",
    roadDone: "#FFD23F",
    node: ["#FF9F5A", "#F0601A"],
    banner: ["#1E40AF", "#1E3A8A"],
    leaf: ["#2FA36B", "#1F7A4F"],
    wood: "#5B3A1F",
    accent: "#FFD23F",
    decor: ["stand", "lamp", "flag", "goal", "trophy", "lamp", "bush"],
  },
  // Süper Lig — zümrüt gecesi
  {
    ground: ["#1FAE80", "#199B72"],
    road: "#2D3550",
    roadEdge: "#151A2C",
    roadLine: "#FFE45C",
    roadDone: "#FFFFFF",
    node: ["#FF7AA8", "#E0306B"],
    banner: ["#065F46", "#064E3B"],
    leaf: ["#0F7A55", "#0A5C40"],
    wood: "#3F2A18",
    accent: "#FFE45C",
    decor: ["lamp", "stand", "flag", "lamp", "goal", "trophy", "stand"],
    night: true,
  },
  // Şampiyonlar Gecesi — lacivert yıldızlı gök
  {
    ground: ["#26337D", "#1F2B6E"],
    road: "#C9D3F5",
    roadEdge: "#7F8DC4",
    roadLine: "#FFFFFF",
    roadDone: "#FFD23F",
    node: ["#9FD0FF", "#3D7BEB"],
    banner: ["#111A4D", "#0B1238"],
    leaf: ["#3E5BC9", "#2C45A3"],
    wood: "#9AA6D6",
    accent: "#FFFFFF",
    decor: ["star", "lamp", "trophy", "star", "flag", "stand", "star"],
    night: true,
  },
  // Elit Lig — altın
  {
    ground: ["#EDBE38", "#DEAC28"],
    road: "#FFFDF4",
    roadEdge: "#B8862A",
    roadLine: "#E63E7A",
    roadDone: "#8B5CF6",
    node: ["#B79CFF", "#7C4DFF"],
    banner: ["#8A5A00", "#6B4500"],
    leaf: ["#3F9E43", "#2C7A31"],
    wood: "#6B4500",
    accent: "#FFFFFF",
    decor: ["trophy", "stand", "star", "flag", "trophy", "lamp", "goal"],
  },
];

/** Bölgeden bağımsız ortak renkler. */
export const MAP_COMMON = {
  /** Sıradaki düğüm (oyna): parlak turuncu-kırmızı. */
  current: ["#FFCF4A", "#FF6A13"] as [string, string],
  /** Kilitli düğüm: taş. */
  locked: ["#C9CDD6", "#8D93A3"] as [string, string],
  lockedInk: "#5B6170",
  /** Kupa düğümü halkası. */
  cup: "#FFD23F",
  cupDeep: "#C98A00",
  /** Düğüm kenarı ve gölgesi. */
  rim: "#FFFFFF",
  shadow: "rgba(0, 0, 0, 0.28)",
  /** Düğüm ve pankart yazısı. */
  ink: "#FFFFFF",
  inkShadow: "rgba(0, 0, 0, 0.45)",
  star: "#FFD23F",
  starEdge: "#C98A00",
  starEmpty: "rgba(0, 0, 0, 0.25)",
  /** "SEN" iğnesi. */
  pin: "#E63E7A",
  pinDeep: "#9F1E50",
  /** Dekor ortakları. */
  white: "#FFFFFF",
  black: "#1F2333",
  net: "rgba(255, 255, 255, 0.75)",
  glow: "rgba(255, 236, 160, 0.55)",
  cone: "#FF7A1A",
  rock: "#9AA0AE",
  rockDeep: "#6F7585",
  roof: "#D9483B",
  wall: "#FFF4DE",
  /** Üst şerit sisi (harita üstünden geçer). */
  scrim: "rgba(10, 14, 30, 0.55)",
  scrimClear: "rgba(10, 14, 30, 0)",
} as const;

export const zoneOf = (level: number) => MAP_ZONES[Math.min(MAP_ZONES.length - 1, Math.floor((Math.max(1, level) - 1) / 20))];
