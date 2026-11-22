/**
 * LİG YOLU HARİTASI — bölge temaları (oyun verisi).
 *
 * 2026-11 v3: harita artık şeritli düz renk değil, futbol dünyasında geçen
 * resimli bir yolculuk. Her 20 bölüm bir lig basamağı ve bir MEKÂN:
 * Mahalle Parkı (toprak patika), Sokak Sahası (asfalt), Sahil (iskele),
 * Antrenman Tesisi (koşu pisti), Kasaba Stadı (taş yol), Stadyum Bölgesi
 * (meydan), Gece Maçı (ışıklı yol), Şampiyonlar Gecesi, Altın Lig (kırmızı
 * halı). İlk altı mekânın sırası oyuna göre döner (`zoneOf(level, game)`):
 * her oyunun evi aynı bölümde bile farklı görünür. Gece ve altın basamaklar
 * her oyunda en üstte.
 *
 * Renkler tema tokenı değil oyun verisidir (iki temada aynı dünya). Ayrışma
 * kuralı: zemin açık ve yumuşak, yol zeminden belirgin (koyu kenar), geçilmiş
 * düğümler zeminle ZIT renk ailesinde, sıradaki düğüm daima yeşil (OYNA),
 * kilitli düğüm soluk arduvaz.
 */

export type MapDecor =
  | "tree"
  | "pine"
  | "palm"
  | "bush"
  | "flowers"
  | "bench"
  | "lamp"
  | "pond"
  | "house"
  | "fence"
  | "cones"
  | "ladder"
  | "dummies"
  | "ballbag"
  | "goal"
  | "stand"
  | "flood"
  | "board"
  | "flag"
  | "trophy"
  | "rock"
  | "umbrella"
  | "boat"
  | "sparkle"
  | "kiosk";

/** Zemin dokusu: çim tutamı, kum dalgası ya da döşeme taşı. */
export type GroundTexture = "grass" | "sand" | "tiles";

export type RoadStyle = "dirt" | "asphalt" | "boardwalk" | "track" | "stone" | "plaza" | "glow" | "carpet";

export interface MapZone {
  key: string;
  /** Mekânın adı (pankartta lig adının altında). */
  place: string;
  /** Zemin: ana · açık leke · koyu leke. */
  ground: [string, string, string];
  /** Çim tutamı / doku noktası. */
  tuft: string;
  texture?: GroundTexture;
  /** Yol: dolgu, kenar, iç ışık, orta çizgi. */
  road: string;
  roadEdge: string;
  roadLight: string;
  roadLine: string;
  roadStyle: RoadStyle;
  /** Geçilmiş yolun ışıklı orta çizgisi. */
  roadDone: string;
  /** Geçilmiş düğüm: açık · ana · koyu (zeminle zıt aile). */
  node: [string, string, string];
  nodeEdge: string;
  /** Pankart (lig basamağı). */
  banner: [string, string];
  /** Dekor renkleri. */
  leaf: [string, string, string];
  wood: string;
  accent: string;
  accent2: string;
  water: [string, string];
  /** Bölgenin dekor seti (tekrar = ağırlık). */
  decor: MapDecor[];
  night?: boolean;
}

const PARK: MapZone = {
  key: "park",
  place: "Mahalle Parkı",
  ground: ["#7CCB4E", "#8FD85E", "#69B940"],
  tuft: "#4E9E2E",
  road: "#F2D49B",
  roadEdge: "#A8743A",
  roadLight: "#FBE7BF",
  roadLine: "#FFFFFF",
  roadStyle: "dirt",
  roadDone: "#FFC93C",
  node: ["#FFC27A", "#FF8A1F", "#D95F00"],
  nodeEdge: "#6A2A00",
  banner: ["#3FAE4A", "#1E7A2C"],
  leaf: ["#7FD957", "#3FA83A", "#257A26"],
  wood: "#8A5A2B",
  accent: "#FF5C7A",
  accent2: "#FFE066",
  water: ["#7FD8FF", "#3AA6E8"],
  decor: ["tree", "tree", "bush", "flowers", "bench", "lamp", "pond", "tree", "goal", "bush"],
};

const STREET: MapZone = {
  key: "street",
  place: "Sokak Sahası",
  ground: ["#EBC6A4", "#F4D7BC", "#DDB08C"],
  tuft: "#C9967A",
  texture: "tiles",
  road: "#59627E",
  roadEdge: "#2C3248",
  roadLight: "#6C7592",
  roadLine: "#FFD84A",
  roadStyle: "asphalt",
  roadDone: "#FFFFFF",
  node: ["#8FD3FF", "#2F8CF0", "#1A5FC0"],
  nodeEdge: "#0B2A66",
  banner: ["#F07B2E", "#B8460E"],
  leaf: ["#9BD95A", "#5FAE34", "#3F8424"],
  wood: "#7A4A26",
  accent: "#3D8BEB",
  accent2: "#FF6B5A",
  water: ["#7FD8FF", "#3AA6E8"],
  decor: ["house", "house", "lamp", "fence", "cones", "tree", "goal", "kiosk", "house", "bush"],
};

const COAST: MapZone = {
  key: "coast",
  place: "Sahil",
  ground: ["#F4DCA0", "#FBE9BE", "#E6C985"],
  tuft: "#D6B36C",
  texture: "sand",
  road: "#C58A52",
  roadEdge: "#6E4320",
  roadLight: "#D9A36E",
  roadLine: "#8E5A2E",
  roadStyle: "boardwalk",
  roadDone: "#FFFFFF",
  node: ["#FF9DB4", "#F2436E", "#C01F4C"],
  nodeEdge: "#5A0820",
  banner: ["#1FB5C8", "#0B7A8C"],
  leaf: ["#7ED957", "#38A83E", "#1F7A2E"],
  wood: "#8A5A2B",
  accent: "#FF6B5A",
  accent2: "#2FB8E0",
  water: ["#5FD6F0", "#1E9BD0"],
  decor: ["palm", "palm", "umbrella", "rock", "boat", "pond", "umbrella", "palm", "flag", "rock"],
};

const TRAINING: MapZone = {
  key: "training",
  place: "Antrenman Tesisi",
  ground: ["#5DBB5A", "#6CC866", "#4FA84D"],
  tuft: "#3E8E3C",
  road: "#D9583B",
  roadEdge: "#7A2412",
  roadLight: "#FFFFFF",
  roadLine: "#FFFFFF",
  roadStyle: "track",
  roadDone: "#FFE066",
  node: ["#C9A2FF", "#8A4DF0", "#5B23C0"],
  nodeEdge: "#2A0B66",
  banner: ["#2F8CF0", "#1A5FC0"],
  leaf: ["#7FD957", "#3FA83A", "#257A26"],
  wood: "#6D4C2F",
  accent: "#FF7A1A",
  accent2: "#FFE066",
  water: ["#7FD8FF", "#3AA6E8"],
  decor: ["cones", "ladder", "dummies", "ballbag", "goal", "cones", "bench", "flag", "dummies", "pine"],
};

const TOWN: MapZone = {
  key: "town",
  place: "Kasaba Stadı",
  ground: ["#A9C95A", "#BAD670", "#94B447"],
  tuft: "#7A9A36",
  road: "#D8D2C2",
  roadEdge: "#7E7666",
  roadLight: "#ECE7DA",
  roadLine: "#B8B09E",
  roadStyle: "stone",
  roadDone: "#FFC93C",
  node: ["#7FE0FF", "#1EA8E0", "#0B70A8"],
  nodeEdge: "#06355A",
  banner: ["#D93A4A", "#9A1A2A"],
  leaf: ["#8FD957", "#4FAE34", "#2F8424"],
  wood: "#7A4A26",
  accent: "#D93A4A",
  accent2: "#FFFFFF",
  water: ["#7FD8FF", "#3AA6E8"],
  decor: ["stand", "flood", "flag", "tree", "kiosk", "board", "stand", "bush", "lamp", "fence"],
};

const CITY: MapZone = {
  key: "city",
  place: "Stadyum Bölgesi",
  ground: ["#A9B7CF", "#BCC8DC", "#95A3BE"],
  tuft: "#8391AC",
  texture: "tiles",
  road: "#F2EEE4",
  roadEdge: "#6C7590",
  roadLight: "#FFFFFF",
  roadLine: "#D8D2C2",
  roadStyle: "plaza",
  roadDone: "#FF8A1F",
  node: ["#FFC27A", "#FF7A1A", "#D24E00"],
  nodeEdge: "#5A1E00",
  banner: ["#5B48E6", "#3A2AB0"],
  leaf: ["#7FD957", "#3FA83A", "#257A26"],
  wood: "#6D4C2F",
  accent: "#5B48E6",
  accent2: "#FFC93C",
  water: ["#7FD8FF", "#3AA6E8"],
  decor: ["stand", "flood", "kiosk", "flag", "board", "tree", "stand", "lamp", "flood", "trophy"],
};

const NIGHT: MapZone = {
  key: "night",
  place: "Gece Maçı",
  ground: ["#1E6E58", "#24806A", "#185C49"],
  tuft: "#14503F",
  road: "#2E3758",
  roadEdge: "#0E1328",
  roadLight: "#47527A",
  roadLine: "#FFE066",
  roadStyle: "glow",
  roadDone: "#FFFFFF",
  node: ["#9FF0FF", "#2FC4E8", "#127EA8"],
  nodeEdge: "#06304A",
  banner: ["#0F7A5E", "#064E3B"],
  leaf: ["#3FAE6E", "#1F8A55", "#0F6A40"],
  wood: "#3F2A18",
  accent: "#FFE066",
  accent2: "#FF5C7A",
  water: ["#3A8FD0", "#1E5FA0"],
  decor: ["flood", "lamp", "stand", "flood", "board", "flag", "lamp", "stand", "sparkle", "trophy"],
  night: true,
};

const CHAMPIONS: MapZone = {
  key: "champions",
  place: "Şampiyonlar Gecesi",
  ground: ["#27347E", "#303F92", "#1F2A6C"],
  tuft: "#1A2560",
  road: "#C9D3F5",
  roadEdge: "#5A68B0",
  roadLight: "#E8EDFF",
  roadLine: "#FFFFFF",
  roadStyle: "glow",
  roadDone: "#FFC93C",
  node: ["#FFB0E0", "#E8459A", "#B01E6E"],
  nodeEdge: "#4A0A2E",
  banner: ["#111A4D", "#0B1238"],
  leaf: ["#4E6BD9", "#3A52B8", "#2A3E95"],
  wood: "#9AA6D6",
  accent: "#FFFFFF",
  accent2: "#FFC93C",
  water: ["#5A7BE0", "#3A55B8"],
  decor: ["sparkle", "flood", "trophy", "sparkle", "flag", "stand", "sparkle", "lamp", "flood", "sparkle"],
  night: true,
};

const GOLD: MapZone = {
  key: "gold",
  place: "Altın Lig",
  ground: ["#F2C84E", "#F9D86E", "#E3B53A"],
  tuft: "#C9962A",
  road: "#C8243A",
  roadEdge: "#6A0A18",
  roadLight: "#E0485C",
  roadLine: "#FFD84A",
  roadStyle: "carpet",
  roadDone: "#FFFFFF",
  node: ["#C9A2FF", "#8A4DF0", "#5B23C0"],
  nodeEdge: "#2A0B66",
  banner: ["#8A5A00", "#6B4500"],
  leaf: ["#7FD957", "#3FA83A", "#257A26"],
  wood: "#6B4500",
  accent: "#C8243A",
  accent2: "#FFFFFF",
  water: ["#7FD8FF", "#3AA6E8"],
  decor: ["trophy", "flag", "sparkle", "stand", "trophy", "flood", "flag", "sparkle", "kiosk", "trophy"],
};

/** Gündüz mekânları (oyuna göre döner) ve en üstteki gece/altın basamaklar. */
const DAY: readonly MapZone[] = [PARK, STREET, COAST, TRAINING, TOWN, CITY];
const TOP_ZONES: readonly MapZone[] = [NIGHT, CHAMPIONS, GOLD];

/** Oyunun ilk mekânı: her ev aynı bölümde bile farklı bir dünyada başlar. */
const GAME_OFFSET: Record<string, number> = {
  uclu: 0,
  kadro: 1,
  kariyer: 2,
  penalti: 3,
  kantin: 4,
  soyunma: 5,
  ucle: 2,
  savunma: 3,
};

/** Eski düz liste (9 basamak, Elit Üçlü sırası). */
export const MAP_ZONES: readonly MapZone[] = [...DAY, ...TOP_ZONES];

/** Bölümün mekânı: her 20 bölümde bir basamak; ilk altısı oyuna göre döner. */
export const zoneOf = (level: number, game?: string | null): MapZone => {
  const tier = Math.floor((Math.max(1, level) - 1) / 20);
  if (tier >= DAY.length) return TOP_ZONES[Math.min(TOP_ZONES.length - 1, tier - DAY.length)];
  const off = (game && GAME_OFFSET[game]) || 0;
  return DAY[(tier + off) % DAY.length];
};

/** Bölgeden bağımsız ortak renkler. */
export const MAP_COMMON = {
  /** Sıradaki düğüm (OYNA): parlak yeşil, beyaz halka, ışıma. */
  current: ["#B6FF7A", "#4CD13F", "#1F9A2E"] as [string, string, string],
  currentEdge: "#0B4A16",
  currentInk: "#FFFFFF",
  halo: "rgba(255, 255, 255, 0.55)",
  haloClear: "rgba(255, 255, 255, 0)",
  /** Kilitli düğüm: soluk arduvaz. */
  locked: ["#C3CBDD", "#98A2BC", "#717C98"] as [string, string, string],
  lockedEdge: "#3A4260",
  lockedInk: "#4A5272",
  /** Düğüm halkası. */
  rim: "#FFFFFF",
  /** Zor (her 5.) düğüm halkası. */
  hardRim: "#FF8A3D",
  /** Kupa / patron düğümü (her 10.). */
  boss: ["#FF8FA0", "#E0304A", "#9A0E24"] as [string, string, string],
  bossEdge: "#4A0410",
  cup: "#FFC93C",
  cupDeep: "#C98A00",
  /** Düğüm yazısı. */
  ink: "#FFFFFF",
  inkShadow: "rgba(20, 8, 40, 0.65)",
  star: "#FFC93C",
  starEdge: "#7A3A00",
  starEmpty: "rgba(20, 24, 60, 0.45)",
  starEmptyEdge: "rgba(20, 24, 60, 0.6)",
  shadow: "rgba(20, 30, 10, 0.28)",
  shadowSoft: "rgba(20, 30, 10, 0.16)",
  /** "SEN" iğnesi. */
  avatar: ["#B07BFF", "#6A2FE0"] as [string, string],
  avatarEdge: "#24085A",
  pinTag: "rgba(16, 20, 40, 0.82)",
  /** Dekor ortakları. */
  white: "#FFFFFF",
  black: "#1F2333",
  outline: "#2A1C10",
  net: "rgba(255, 255, 255, 0.8)",
  glow: "rgba(255, 236, 160, 0.6)",
  glowClear: "rgba(255, 236, 160, 0)",
  beam: "rgba(255, 250, 220, 0.16)",
  cone: "#FF7A1A",
  rock: ["#B9C0CE", "#8A92A6", "#666E84"] as [string, string, string],
  roof: ["#E8574A", "#4A86E8", "#F2A93B", "#8E5BE0"] as string[],
  wall: ["#FFF4DE", "#FFE3C2", "#E8F0FF", "#FFF0F4"] as string[],
  window: "#FFE58A",
  windowDark: "#5A6A8E",
  crowd: ["#FF5C7A", "#FFC93C", "#5CD6FF", "#FFFFFF", "#8AF56A", "#C77DFF"] as string[],
  steel: "#8A94AC",
  steelDark: "#545D78",
  board: "#1B2242",
  boardInk: "#FFE066",
  umbrella: ["#FF5C7A", "#FFFFFF"] as [string, string],
  sail: "#FFFFFF",
  hull: "#C2563A",
  cloud: "rgba(255, 255, 255, 0.9)",
  fog: ["rgba(255, 255, 255, 0)", "rgba(240, 246, 255, 0.92)"] as [string, string],
  /** Pankart yazısı. */
  bannerInk: "#FFFFFF",
  /** Başlangıç kapısı. */
  gate: ["#FFFFFF", "#DCE3F2"] as [string, string],
  gateRibbon: ["#FF7AA6", "#D6286E"] as [string, string],
} as const;
