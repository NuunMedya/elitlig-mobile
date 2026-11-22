/**
 * OYUN ANA SAYFASI — ev ekranının renkleri (oyun verisi; iki temada aynı
 * dünya). components/gamehome/* bu dosyayı içe aktarır; components/ ve app/
 * altında çıplak hex yazılmaz.
 *
 * 2026-11 v3 "PREMIUM, AMA AYRIŞAN": v2'nin düz koyu hapları haritaya
 * karışıyordu. Şimdi her öğe türü KENDİ renk ailesinde: jeton altın, can
 * kırmızı, yıldız sarı-turuncu, ödüller mor/pembe, araçlar mavi/camgöbeği,
 * OYNA yeşil (tek odak). Yüzeyler katmanlı: koyu dış kontur, üstten alta
 * gradyan, ince iç ışık (rim) ve alt gölge dudağı. Arka plan (harita/sahne)
 * parlak ve açık; HUD lacivert kapsül, böylece hiçbir öğe zemine karışmaz.
 * `art` altındaki duraklar SVG ikonlarının (components/gamehome/GameArt)
 * çizimi içindir.
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

  /** Sis (harita / sahne üstünde üst ve alt şerit) — hafif. */
  scrimTop: ["rgba(10, 14, 30, 0.42)", "rgba(10, 14, 30, 0)"] as [string, string],
  scrimBottom: ["rgba(10, 14, 30, 0)", "rgba(10, 14, 30, 0.6)"] as [string, string],

  /** Düz HUD yüzeyi: üst şerit hapları, eylem çipleri, ilerleme satırı. */
  hud: "rgba(16, 20, 40, 0.8)",
  hudEdge: "rgba(255, 255, 255, 0.14)",
  hudSoft: "rgba(255, 255, 255, 0.72)",
  hudTrack: "rgba(255, 255, 255, 0.2)",
  /** Bildirim noktası (yalnız alınacak ödül varken). */
  dot: "#FF5A6E",

  /** OYNA düğmesi: düz yeşil + ince koyu alt kenar (tek odak). */
  playFlat: "#2BAE4E",
  playFlatEdge: "#1D8139",
  /** Zor (her 5.) ve süper zor (her 10.) bölümde düğme rengi — yumuşak. */
  playFlatHard: "#D9506E",
  playFlatHardEdge: "#A8344F",
  playFlatSuper: "#8957D8",
  playFlatSuperEdge: "#6538B0",

  /** Pencere satırı ikon tonları (eski yan düğme renkleri). */
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

  /** Koyu yarı saydam zemin (seri tacı). */
  bar: "rgba(14, 18, 44, 0.7)",
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

  /** Sonsuz / bilgi oyunu sahnesi (sakin gece stadyumu). */
  sceneSky: ["#1E2A5E", "#2B3274", "#39408A"] as [string, string, string],
  sceneGrass: ["#3E9E58", "#348C4C"] as [string, string],
  sceneLine: "rgba(255, 255, 255, 0.35)",
  sceneStand: "#232A63",
  sceneStandFar: "#2E3678",
  /** Sahne ortasındaki bilgi kartı (rekor, bugünkü yıldız). */
  sceneCard: "rgba(16, 20, 40, 0.55)",

  /** Çark dilimleri. */
  wheel: ["#FF6B8B", "#FFD23F", "#7FE3FF", "#9BE15D", "#C77DFF", "#FFB06B", "#5EE6D8", "#FF9AE6"] as string[],
  wheelRim: "#FFFFFF",
  wheelHub: "#1F2333",

  /** Çevrimdışı hapı. */
  offline: "rgba(14, 18, 44, 0.78)",
  offlineLight: "#EEF1F7",

  /** Oyun merkezi giriş kartı (menü). */
  entry: ["#6A3DF5", "#A43BD8", "#FF7A59"] as [string, string, string],
  entryTile: "rgba(255, 255, 255, 0.18)",

  /* ═══════════════════════ v3: KATMANLI OYUN YÜZEYLERİ ═══════════════════════ */

  /** HUD kapsülü: koyu lacivert cam, koyu kontur, üstte ince ışık. */
  hudCap: ["#25336E", "#141C47"] as [string, string],
  hudCapEdge: "#070B22",
  hudCapRim: "rgba(255, 255, 255, 0.22)",
  /** Kapsülün renk ailesine göre ince kenar tonu (ayrışma). */
  hudTint: { lives: "#FF5C7A", coins: "#FFC93C", stars: "#FFA53A", gear: "#8FA2E8" },
  /** Yazı gölgesi (oyun yazısı: koyu kontur hissi). */
  textShadow: "rgba(4, 8, 30, 0.75)",
  textShadowSoft: "rgba(4, 8, 30, 0.45)",

  /** Yüzeylerin üst yarısındaki yumuşak parlama. */
  shineTop: "rgba(255, 255, 255, 0.22)",
  /** Pencere kapat düğmesi (renkli bandın üstünde). */
  closeBg: "rgba(10, 14, 40, 0.45)",
  closeEdge: "rgba(255, 255, 255, 0.7)",

  /** "+" düğmesi (jeton, can). */
  plus: ["#8AF56A", "#24A83A"] as [string, string],
  plusEdge: "#0D5A1D",

  /** Yuvarlak araç düğmesi (geri, ayarlar). */
  roundBtn: ["#5A6BC0", "#2E3A80"] as [string, string],
  roundBtnEdge: "#0B1033",

  /** OYNA: parlak yeşil, koyu kontur, alt dudak. */
  play: ["#9BF266", "#46C83F", "#24A033"] as [string, string, string],
  playEdge: "#0E4D1A",
  playLip: "#177A28",
  playGloss: "rgba(255, 255, 255, 0.38)",
  playGlossClear: "rgba(255, 255, 255, 0)",
  playInk: "#FFFFFF",
  /** Zorluk etiketi. */
  tagHard: ["#FFA24A", "#E8471C"] as [string, string],
  tagSuper: ["#D07BFF", "#7B2BE0"] as [string, string],
  tagEdge: "#3A1206",
  tagSuperEdge: "#2A0B57",

  /** Yan raf düğmeleri: ödüller mor/pembe ailesi, araçlar mavi/camgöbeği. */
  rail: {
    gift: ["#FF9BD2", "#E0459A"] as [string, string],
    wheel: ["#D79BFF", "#8A3BF0"] as [string, string],
    chest: ["#FF8FB0", "#D9346E"] as [string, string],
    penalty: ["#A8A0FF", "#5B48E6"] as [string, string],
    board: ["#79D8FF", "#1E86E0"] as [string, string],
    shop: ["#6FF0DE", "#0FA39C"] as [string, string],
    more: ["#B8C4E0", "#6274A3"] as [string, string],
  },
  railEdge: "#1A0B3D",
  railEdgeCool: "#06214A",
  railRim: "rgba(255, 255, 255, 0.55)",
  railLabelBg: "rgba(10, 14, 40, 0.78)",

  /** Bildirim rozeti (yalnız alınacak ödül varken). */
  badge: ["#FF6B6B", "#E01E3C"] as [string, string],
  badgeEdge: "#FFFFFF",

  /** Etkinlik şeridi (yıldız sandığı). */
  stripTrack: "#0A1033",
  stripFill: ["#FFE35A", "#FFB01F", "#FF7A1A"] as [string, string, string],
  stripStripe: "rgba(255, 255, 255, 0.28)",

  /** Pencere başlık bantları (ödül pencereleri kendi renginde). */
  modalHead: ["#3D4FB8", "#24307E"] as [string, string],
  modalHeadWheel: ["#B25CFF", "#6324D6"] as [string, string],
  modalHeadChest: ["#FF7AA6", "#C42566"] as [string, string],
  modalHeadPenalty: ["#7F8CFF", "#3B2FC4"] as [string, string],
  modalHeadGold: ["#FFC94A", "#E07A0C"] as [string, string],
  modalHeadInk: "#FFFFFF",
  modalBody: ["#FFFFFF", "#EEF1FA"] as [string, string],

  /** Günün Penaltısı: güç çubuğu, hedefler, gece stadı, kaleci. */
  meter: { bad: "#F0445A", mid: "#FFC93C", good: "#3CC85A" },
  penTarget: "rgba(255, 255, 255, 0.16)",
  penTargetOn: "rgba(255, 201, 60, 0.4)",
  pen: {
    sky: ["#1B2560", "#2E3C8C", "#3B4CA0"] as [string, string, string],
    flood: "rgba(255, 246, 200, 0.45)",
    stand: "#1A2050",
    crowd: ["#FF6B8B", "#FFC93C", "#5CD6FF", "#FFFFFF", "#8AF56A"] as string[],
    grass: ["#4CC064", "#2E9A48"] as [string, string],
    stripe: "rgba(255, 255, 255, 0.07)",
    line: "rgba(255, 255, 255, 0.85)",
    shorts: "#1F2A6B",
    sock: "#FFB547",
    glove: "#7FE36A",
    skin: "#F2C29B",
    hair: "#3B2414",
  },
  /** Sandık Seç: seçilen sandığın kaidesi. */
  chestPlinthOn: "#FFF3C4",
  /** Oyun Merkezi "Günlük ödüller" şeridi (mor gece). */
  dstrip: ["#4A2A9E", "#2A1A6A"] as [string, string],

  /** Ödül patlaması (sonuç kartı): ışın ve konfeti. */
  burst: "rgba(255, 228, 120, 0.55)",
  burstClear: "rgba(255, 228, 120, 0)",
  confetti: ["#FF5C7A", "#FFC93C", "#5CD6FF", "#8AF56A", "#C77DFF"] as string[],

  /**
   * SVG ikon sanatı: her ikon üç durak (açık · ana · koyu) + kontur.
   * Renk aileleri birbirinden ayrık: jeton altın, can kırmızı, yıldız
   * sarı-turuncu, sandık ahşap-altın, çark mor, hediye pembe.
   */
  art: {
    outline: "#1B0F2E",
    shine: "rgba(255, 255, 255, 0.75)",
    shineSoft: "rgba(255, 255, 255, 0.35)",
    shade: "rgba(20, 8, 40, 0.25)",
    coin: ["#FFF3A0", "#FFC928", "#D98A00"] as [string, string, string],
    coinEdge: "#7A4500",
    heart: ["#FF9AAE", "#FF3D62", "#C0103A"] as [string, string, string],
    heartEdge: "#6A0420",
    star: ["#FFF2A0", "#FFC52E", "#FF8A1F"] as [string, string, string],
    starEdge: "#7A3A00",
    starOff: ["#5A6390", "#3C4470", "#2A3058"] as [string, string, string],
    wood: ["#E89A4F", "#B8662A", "#7E3F14"] as [string, string, string],
    woodEdge: "#3E1C06",
    gold: ["#FFF0A0", "#FFC93C", "#D8890A"] as [string, string, string],
    goldEdge: "#6B3D00",
    gem: ["#B8F5FF", "#4FC8F5", "#1A7FC8"] as [string, string, string],
    /** Çark dilimleri: jeton/yıldız/şimşek sarı olduğu için hiçbir dilim sarı değil. */
    wheel: ["#FF6B8B", "#A07BFF", "#4FC8F5", "#7FE35A", "#FF7AD0", "#3FD6C4", "#FF9F4A", "#6F7BFF"] as string[],
    wheelRim: ["#FFE680", "#F2A814", "#9A5A00"] as [string, string, string],
    wheelHub: ["#FFFFFF", "#D8DEF0"] as [string, string],
    bulb: "#FFF7CC",
    ribbon: ["#FF7AC0", "#D6287F"] as [string, string],
    giftBox: ["#C68BFF", "#7E35E0", "#4E1A9E"] as [string, string, string],
    ball: ["#FFFFFF", "#E4E8F2", "#AEB6CC"] as [string, string, string],
    ballPatch: "#1F2333",
    net: "rgba(255, 255, 255, 0.85)",
    netShade: "rgba(30, 40, 90, 0.35)",
    post: "#FFFFFF",
    podium: ["#7FD3FF", "#2B8FE0", "#145AA8"] as [string, string, string],
    bolt: ["#FFF6A8", "#FFD33C", "#F09A00"] as [string, string, string],
    gear: ["#F2F5FF", "#C6CFEA", "#8792B8"] as [string, string, string],
    lock: ["#E6EAF5", "#A9B2CC", "#6E7896"] as [string, string, string],
    keeper: ["#FFB547", "#F07B12"] as [string, string],
  },
} as const;
