/**
 * OYUN ANA SAYFASI — Royal Match tarzı ev ekranının renkleri (oyun verisi;
 * iki temada aynı dünya). components/gamehome/* bu dosyayı içe aktarır;
 * components/ ve app/ altında çıplak hex yazılmaz.
 */

export const GH = {
  white: "#FFFFFF",
  ink: "#1F2333",
  inkSoft: "#5B6170",
  inkShadow: "rgba(0, 0, 0, 0.35)",
  clear: "rgba(0, 0, 0, 0)",

  /** Üst şerit hapları: koyu cam + beyaz kenar. */
  pill: "rgba(14, 18, 44, 0.62)",
  pillEdge: "rgba(255, 255, 255, 0.85)",
  pillPlus: ["#7CF06A", "#1FA83A"] as [string, string],
  pillPlusLip: "#127A2A",

  coin: "#FFD23F",
  coinDeep: "#C98A00",
  heart: "#FF4D6D",
  heartDeep: "#B0123A",
  star: "#FFD23F",
  starDeep: "#C98A00",

  /** Sis (harita / sahne üstünde üst ve alt şerit). */
  scrimTop: ["rgba(10, 14, 30, 0.6)", "rgba(10, 14, 30, 0)"] as [string, string],
  scrimBottom: ["rgba(10, 14, 30, 0)", "rgba(10, 14, 30, 0.6)"] as [string, string],

  /** Büyük "Bölüm N" düğmesi: parlak yeşil, kalın alt dudak. */
  play: ["#8DF56E", "#39C447", "#1F9E33"] as [string, string, string],
  playLip: "#13702A",
  playEdge: "#FFFFFF",
  playShine: "rgba(255, 255, 255, 0.45)",
  /** Zorluk rozetleri. */
  hard: ["#FF6B8B", "#D9204F"] as [string, string],
  superHard: ["#C77DFF", "#7B2CF0"] as [string, string],
  /** "Zor" bölümde düğme rengi. */
  playHard: ["#FF8FA6", "#F0446A", "#C21D45"] as [string, string, string],
  playHardLip: "#7E0F2B",
  playSuper: ["#D9A6FF", "#9B4DFF", "#6A1FD6"] as [string, string, string],
  playSuperLip: "#40108A",

  /** Yan yuvarlak düğmeler (her biri kendi tonunda). */
  side: {
    gift: ["#FFB0D0", "#F0478A"] as [string, string],
    ad: ["#7FE3FF", "#1E9BE0"] as [string, string],
    shop: ["#C9A2FF", "#7C4DFF"] as [string, string],
    board: ["#FFE07A", "#F09A00"] as [string, string],
    rules: ["#B5F27A", "#3FAE2A"] as [string, string],
    streak: ["#FFB06B", "#F0601A"] as [string, string],
    spin: ["#FF9AE6", "#C23BD4"] as [string, string],
    settings: ["#D3DAE8", "#7F8AA3"] as [string, string],
    city: ["#8FE0FF", "#2F80ED"] as [string, string],
  },
  sideEdge: "#FFFFFF",
  sideLabel: "#FFFFFF",
  badge: "#FF3B5C",

  /** Etkinlik / sandık çubuğu. */
  bar: "rgba(14, 18, 44, 0.7)",
  barTrack: "rgba(255, 255, 255, 0.18)",
  barFill: ["#FFE45C", "#F5A300"] as [string, string],
  chest: "#C8772B",
  chestDeep: "#7A4413",
  chestBand: "#FFD23F",
  chestGlow: "rgba(255, 236, 160, 0.55)",

  /** Seri basamakları (taç). */
  crown: ["#FFE45C", "#F5A300"] as [string, string],
  crownOff: "rgba(255, 255, 255, 0.25)",

  /** Pencereler (can, kurallar, ayarlar, çark). */
  card: ["#FFFFFF", "#F2F4FA"] as [string, string],
  cardInk: "#1F2333",
  cardSoft: "#6B7385",
  panel: "#EEF1F7",
  panelEdge: "#DDE2EC",
  dim: "rgba(8, 10, 24, 0.66)",

  /** Sonsuz / bilgi oyunu sahnesi (gece stadyumu). */
  sceneSky: ["#1C2A7A", "#3B2B9E", "#7A3FC4"] as [string, string, string],
  sceneGrass: ["#45C25A", "#2A9A41"] as [string, string],
  sceneLine: "rgba(255, 255, 255, 0.55)",
  sceneStand: "#2A1E6E",
  sceneStandFar: "#3F2E96",
  sceneCrowd: ["#FF7AA8", "#FFD23F", "#7FE3FF", "#FFFFFF", "#9BE15D"] as string[],
  sceneBeam: "rgba(255, 244, 196, 0.28)",
  sceneLamp: "#FFF2B0",

  /** Çark dilimleri. */
  wheel: ["#FF6B8B", "#FFD23F", "#7FE3FF", "#9BE15D", "#C77DFF", "#FFB06B", "#5EE6D8", "#FF9AE6"] as string[],
  wheelRim: "#FFFFFF",
  wheelHub: "#1F2333",

  /** Çevrimdışı hapı. */
  offline: "rgba(14, 18, 44, 0.78)",
  offlineLight: "#EEF1F7",

  /** Oyun merkezi giriş kartı (menü). */
  entry: ["#6A3DF5", "#A43BD8", "#FF7A59"] as [string, string, string],
  entryEdge: "#FFE45C",
  entryTile: "rgba(255, 255, 255, 0.18)",
} as const;
