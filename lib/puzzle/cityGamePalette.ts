/**
 * KULÜP ŞEHRİ — tam ekran oyun arayüzünün renkleri (oyun verisi; iki temada
 * aynı dünya). Royal Match tarzı ev ekranının (lib/game/gameHomePalette.ts)
 * şehir ağzı: ahşap çerçeve, altın kurdele, krem parşömen, parlak düğmeler.
 * components/city2/game/* bu dosyayı içe aktarır; components/ ve app/ altında
 * çıplak hex yazılmaz.
 */

export const CG = {
  white: "#FFFFFF",
  ink: "#3A2412",
  inkSoft: "#7A5A3A",
  inkShadow: "rgba(0, 0, 0, 0.35)",
  clear: "rgba(0, 0, 0, 0)",

  /** Ahşap çerçeve: açık → koyu tahta, en dışta koyu dudak. */
  wood: ["#C98A4B", "#9A5B2A", "#7A4119"] as [string, string, string],
  woodLip: "#4E260C",
  woodEdge: "#E7B57A",
  /** Çerçeve köşesindeki altın perçin. */
  rivet: ["#FFE89A", "#E0A21C"] as [string, string],

  /** Parşömen iç kart (krem). */
  paper: ["#FFF7E6", "#F6E6C4"] as [string, string],
  paperEdge: "#E3C891",
  paperDeep: "#EBD7AC",
  paperRow: "rgba(122, 65, 25, 0.08)",
  paperRowOn: "rgba(34, 179, 58, 0.16)",

  /** Kurdele (pencere başlığı): kırmızı kumaş, koyu katlar. */
  ribbon: ["#FF6B5E", "#D9302A"] as [string, string],
  ribbonFold: "#8E1A16",
  ribbonInk: "#FFFFFF",
  /** Lig şeridi (mor kurdele). */
  league: ["#9B7CFF", "#5B3DF5"] as [string, string],
  leagueFold: "#2E1B8C",

  /** Düğme tonları: [açık, koyu] + dudak. */
  btn: {
    green: { fill: ["#8DF56E", "#2FB83F"] as [string, string], lip: "#13702A", ink: "#FFFFFF" },
    gold: { fill: ["#FFE45C", "#F5A300"] as [string, string], lip: "#A86A00", ink: "#4A2C00" },
    blue: { fill: ["#7FD3FF", "#1E88E5"] as [string, string], lip: "#0D4F8F", ink: "#FFFFFF" },
    red: { fill: ["#FF8A8A", "#E0303C"] as [string, string], lip: "#8A1420", ink: "#FFFFFF" },
    teal: { fill: ["#7BF1DD", "#0FA493"] as [string, string], lip: "#06655B", ink: "#FFFFFF" },
    purple: { fill: ["#C9A2FF", "#7C4DFF"] as [string, string], lip: "#3F1FA8", ink: "#FFFFFF" },
    grey: { fill: ["#E3E6EE", "#A9B0C0"] as [string, string], lip: "#6B7385", ink: "#3A3F4D" },
  },
  btnEdge: "#FFFFFF",
  shine: "rgba(255, 255, 255, 0.45)",

  /** Durum renkleri (parşömen üstünde okunur). */
  ok: "#1F9E33",
  warn: "#D97706",
  bad: "#D9302A",
  star: "#FFC233",
  starDeep: "#B07800",
  el: "#0F8F82",
  lock: "#8C7A66",

  /** İlerleme çubuğu. */
  track: "rgba(78, 38, 12, 0.18)",
  barGreen: ["#8DF56E", "#2FB83F"] as [string, string],
  barGold: ["#FFE45C", "#F5A300"] as [string, string],
  barEl: ["#7BF1DD", "#0FA493"] as [string, string],
  barWarn: ["#FFC27A", "#E8650C"] as [string, string],

  /** Sahne sisleri ve kararma. */
  scrimTop: ["rgba(10, 14, 30, 0.55)", "rgba(10, 14, 30, 0)"] as [string, string],
  scrimBottom: ["rgba(10, 14, 30, 0)", "rgba(10, 14, 30, 0.55)"] as [string, string],
  dim: "rgba(8, 10, 24, 0.6)",
  /** Tam ekran pencerelerin zemini (gece mavisi). */
  windowBg: ["#2B3A8C", "#1A1F5C", "#120F3A"] as [string, string, string],

  /** Yan düğmelerin şehir tonları. */
  side: {
    academy: ["#8FB4FF", "#3D5AFE"] as [string, string],
    season: ["#FFE07A", "#F09A00"] as [string, string],
    team: ["#5EF0B0", "#0E9E6A"] as [string, string],
    visit: ["#7FE3FF", "#1E9BE0"] as [string, string],
    board: ["#FFB06B", "#F0601A"] as [string, string],
    marks: ["#FF9AE6", "#C23BD4"] as [string, string],
    ladder: ["#C9A2FF", "#7C4DFF"] as [string, string],
    gift: ["#FFB0D0", "#F0478A"] as [string, string],
    prestige: ["#FFE89A", "#C98A00"] as [string, string],
    kit: ["#FF8A8A", "#E0303C"] as [string, string],
  },
  sideEdge: "#FFFFFF",
  badge: "#FF3B5C",

  /** Alt dock'un tahta rafı. */
  dock: ["rgba(122, 65, 25, 0.92)", "rgba(78, 38, 12, 0.96)"] as [string, string],
  dockEdge: "#E7B57A",
} as const;

export type CityBtnTone = keyof typeof CG.btn;
export type CitySideTone = keyof typeof CG.side;
