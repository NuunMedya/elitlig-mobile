/**
 * OYUN ANA SAYFASI — ev ekranının renkleri (oyun verisi; iki temada aynı
 * dünya). components/gamehome/* bu dosyayı içe aktarır; components/ ve app/
 * altında çıplak hex yazılmaz.
 *
 * 2026-11 SADELEŞTİRME: ana sayfa "parlak ve iri" olmaktan çıktı. Üst ve alt
 * şerit düz, yarı saydam koyu yüzeyler (`hud`); tek vurgu yeşil OYNA düğmesi
 * (düz renk + ince alt kenar, parlama yok); renkler biraz daha yumuşak.
 * Eski parlak anahtarlar (pill, side …) Kulüp Şehri ve pencereler kullandığı
 * için duruyor.
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
} as const;
