/**
 * SONSUZ / BİLGİ OYUNU EVİ — kahraman sahnelerinin renkleri (oyun verisi;
 * iki temada aynı dünya). components/gamehome/HeroScenes.tsx kullanır.
 *
 * Her sahne kendi renk ailesinde, HUD'un lacivert kapsüllerinden ve yeşil
 * OYNA'dan ayrışır: Slalom gün batımı sokağı (turuncu-mor), Top Sektir
 * güneşli meydan (gök mavisi-krem), bilgi yarışmaları TV stüdyosu
 * (mor-lacivert + neon), Günün Testi takvim sahnesi (sıcak altın-mercan).
 */

export const HERO = {
  outline: "#1B1030",
  shade: "rgba(20, 8, 40, 0.28)",
  white: "#FFFFFF",
  shine: "rgba(255, 255, 255, 0.6)",
  shineSoft: "rgba(255, 255, 255, 0.25)",

  /** Futbolcu (özgün karakter). */
  skin: ["#F6CBA4", "#E0A47A"] as [string, string],
  hair: "#3B2414",
  boot: "#1F2333",
  bootStud: "#C8CEDC",
  shorts: "#FFFFFF",
  kit: {
    slalom: { shirt: ["#FFE45C", "#F2A500"] as [string, string], trim: "#1F2A6B", sock: "#1F2A6B", shorts: "#1F2A6B" },
    sektir: { shirt: ["#7FB8FF", "#2F6BE0"] as [string, string], trim: "#FFFFFF", sock: "#FFFFFF", shorts: "#FFFFFF" },
  },

  /** Slalom: gün batımı şehir sokağı. */
  street: {
    sky: ["#FF9E6B", "#F06A8A", "#7A4FC8", "#3A2A7A"] as [string, string, string, string],
    sun: "#FFE08A",
    sunGlow: "rgba(255, 224, 138, 0.45)",
    sunClear: "rgba(255, 224, 138, 0)",
    far: "#5A3E9E",
    farWin: "rgba(255, 220, 140, 0.55)",
    mid: ["#7A5AC0", "#9A5AB8", "#C0608E", "#6A4AB0"] as string[],
    midWin: "#FFD88A",
    midWinOff: "rgba(40, 20, 80, 0.45)",
    sidewalk: ["#C9B8E8", "#A895D0"] as [string, string],
    curb: "#6E5AA0",
    road: ["#5A5070", "#3E3658"] as [string, string],
    roadLine: "#FFD84A",
    cone: ["#FFA24A", "#F06A12"] as [string, string],
    coneStripe: "#FFFFFF",
    lamp: "#2A2050",
    lampGlow: "rgba(255, 220, 140, 0.55)",
    lampClear: "rgba(255, 220, 140, 0)",
  },

  /** Top Sektir: güneşli meydan. */
  plaza: {
    sky: ["#6FD0FF", "#A8E4FF", "#E6F7FF"] as [string, string, string],
    cloud: "rgba(255, 255, 255, 0.95)",
    facade: ["#FFD6A0", "#FFB8A8", "#C8E0A8", "#B8D0F0"] as string[],
    facadeShade: "rgba(120, 60, 40, 0.18)",
    roof: "#D9654A",
    window: "#5A8ACB",
    windowFrame: "#FFFFFF",
    arch: "#8A5A3A",
    tiles: ["#F2DDB8", "#E6CB9C"] as [string, string],
    tileLine: "rgba(140, 100, 60, 0.25)",
    fountain: ["#E8E2D4", "#BDB4A0"] as [string, string],
    water: ["#9BE6FF", "#3AB0E8"] as [string, string],
    tree: ["#7FD957", "#3FA83A", "#257A26"] as [string, string, string],
    trunk: "#8A5A2B",
    bird: "#3A3A4A",
  },

  /** Bilgi yarışmaları: TV stüdyosu. */
  studio: {
    back: ["#2A1A6A", "#1A1048", "#120A30"] as [string, string, string],
    beam: "rgba(200, 180, 255, 0.16)",
    beamClear: "rgba(200, 180, 255, 0)",
    truss: "#3A2E7A",
    light: "#FFF2B0",
    screen: ["#2E5BFF", "#1A2FA8"] as [string, string],
    screenFrame: "#0C0A24",
    screenGlow: "rgba(90, 140, 255, 0.35)",
    floor: ["#3A2A8A", "#1E1450"] as [string, string],
    floorShine: "rgba(255, 255, 255, 0.08)",
    ring: ["#FF5CC8", "#5CD6FF", "#FFC93C"] as [string, string, string],
    podium: ["#5A48E6", "#3A2AB0", "#22187A"] as [string, string, string],
    podiumPanel: "rgba(255, 255, 255, 0.14)",
    buzzer: ["#FF6B6B", "#C81E3C"] as [string, string],
    buzzerBase: "#E8E8F2",
    bokeh: ["rgba(255, 92, 200, 0.35)", "rgba(92, 214, 255, 0.35)", "rgba(255, 201, 60, 0.35)"] as string[],
    neon: "#5CD6FF",
    neonPink: "#FF5CC8",
    ink: "#FFFFFF",
    silhouette: "#0C0A24",
  },

  /** Günün Testi: takvim sahnesi. */
  daily: {
    sky: ["#FFB36B", "#FF7A6B", "#C84A8A"] as [string, string, string],
    rays: "rgba(255, 240, 200, 0.18)",
    stage: ["#7A2A6A", "#4A1A4A"] as [string, string],
    stageTop: "#A84A8A",
    page: ["#FFFFFF", "#F2EEE6"] as [string, string],
    pageHead: ["#FF5C6B", "#D6283C"] as [string, string],
    pageInk: "#2A1C30",
    ring: "#8A8FA8",
    pedestal: ["#F2F2FA", "#B8BCD0"] as [string, string],
    confetti: ["#FFC93C", "#5CD6FF", "#8AF56A", "#FF5C7A", "#C77DFF", "#FFFFFF"] as string[],
  },

  /** Başlık kurdelesi (oyun rengi oyundan gelir). */
  ribbonEdge: "#1B1030",
  titleShadow: "rgba(10, 6, 30, 0.85)",

  /** Bilgi kartları (rekor · bugünkü yıldız). */
  card: ["#25336E", "#141C47"] as [string, string],
  cardEdge: "#070B22",
  cardRim: "rgba(255, 255, 255, 0.2)",
  cardLabel: "rgba(255, 255, 255, 0.75)",
} as const;
