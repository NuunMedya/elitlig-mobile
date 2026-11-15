/**
 * STADYUM KANTİNİ PALETİ — oyun sahnesinin çizim renkleri (alan verisi).
 *
 * 2026-11 YENİLEMESİ: sahne "gece maçı stadyumu + sıcak kantin tezgâhı"
 * dünyasıdır. Lacivert gökyüzü, projektör ışığı, renkli tribün kalabalığı;
 * önde ahşap tezgâh ve çizgili tente. Sipariş balonları bilerek EN YÜKSEK
 * KONTRASTLI yüzeydir (beyaz zemin + koyu kontur): taraftarın ne istediği
 * sahnede ilk okunan şey olmalı.
 *
 * Ürün ve forma renkleri tanınırlık için sabittir. HUD ve metin zeminleri
 * de burada durur — components/ altında çıplak hex yazılmaz (check:tokens).
 */

export const kantinScene = {
  /* — tezgâh ahşabı — */
  wood: "#C4813F",
  woodDark: "#8A5226",
  woodLight: "#E3A866",
  woodEdge: "#5E3416",
  woodGrain: "rgba(94, 52, 22, 0.28)",
  counterTop: "#F3D9A8",
  counterTopEdge: "#D6AE6E",

  /* — ürün karoları ve yığın rafı — */
  tile: "#FFFDF7",
  tileLip: "#D9CDB4",
  tileLow: "#EFE6D2",
  tileLowLip: "#CDBF9F",
  shelf: "rgba(255, 255, 255, 0.08)",
  shelfEdge: "rgba(255, 255, 255, 0.16)",
  tray: "#2A2F6E",
  trayLip: "#161A47",
  traySlot: "rgba(255, 255, 255, 0.10)",
  traySlotEdge: "rgba(255, 255, 255, 0.22)",

  /* — sipariş balonu — */
  bubble: "#FFFFFF",
  bubbleEdge: "#1B1F3F",
  bubbleCell: "#F2F4FA",
  bubbleCellEdge: "#D3D8E8",
  bubbleDone: "#DDF7E6",
  bubbleDoneEdge: "#1E8A4A",
  vipBubble: "#FFF4C2",
  vipEdge: "#B7860B",
  served: "#2FCB6E",
  servedDeep: "#1E8A4A",

  /* — durum renkleri — */
  check: "#22A55A",
  checkEdge: "#FFFFFF",
  danger: "#E5484D",
  dangerDeep: "#A8262B",
  dangerText: "#FF9A9E",
  dangerSoft: "rgba(229, 72, 77, 0.22)",
  patienceGood: "#2FCB6E",
  patienceMid: "#F7B731",
  patienceLow: "#E5484D",
  patienceTrack: "rgba(27, 31, 63, 0.16)",
  coin: "#F5B70A",
  coinEdge: "#B98200",
  coinShine: "#FFE58F",
  vip: "#F2B705",
  vipDeep: "#9C7206",
  lock: "#475066",
  lockBg: "rgba(26, 30, 46, 0.62)",
  crate: "#C99A62",
  crateDark: "#8C5F31",
  crateTape: "#EBD3A3",

  /* — gece stadyumu — */
  base: "#14183F",
  skyTop: "#0B0E2C",
  skyBottom: "#232A6E",
  standHigh: "#2B3277",
  standLow: "#1C2158",
  standRail: "#3B4392",
  floodlight: "#FFF6D8",
  floodPole: "#5A6290",
  beam: "#FFF6D8",
  pitch: "#2EA45E",
  pitchDark: "#25904F",
  pitchLine: "rgba(255, 255, 255, 0.55)",
  awningA: "#E5484D",
  awningB: "#FFFFFF",
  awningEdge: "#9E2A2E",
  signBoard: "#1B1F3F",
  signText: "#FFD43B",

  /* — HUD ve dok — */
  panel: "#232860",
  panelDeep: "#151941",
  glass: "rgba(255, 255, 255, 0.09)",
  hudText: "#FFFFFF",
  hudSoft: "rgba(255, 255, 255, 0.72)",
  hudOfInk: "rgba(255, 255, 255, 0.6)",
  track: "rgba(255, 255, 255, 0.16)",
  progress: "#2FCB6E",
  dropShadow: "#05061C",
  tipCard: "#FFFFFF",
  tipInk: "#1B1F3F",
  tipAccent: "#FF8A3D",
  ink: "#1B1F3F",
  inkSoft: "#5A607F",
  white: "#FFFFFF",
  shadow: "rgba(10, 8, 30, 0.30)",
  textShadow: "rgba(0, 0, 0, 0.32)",
} as const;

/** Servis kutlaması: altın + beyaz + yeşil + turuncu. */
export const kantinConfetti = ["#FFC93C", "#FFFFFF", "#2FCB6E", "#FF8A3D", "#5DADE2"] as const;

/** Tribün kalabalığı: forma renklerinden süzülmüş, gece ışığında kısık tonlar. */
export const kantinCrowd = ["#C2464B", "#3D6BC4", "#D9B23A", "#3E9A5E", "#8A57C9", "#E07B39", "#D8DCE8"] as const;

export const kantinSkins = ["#F7D7B8", "#EBB894", "#C98D63", "#8D5A3B"] as const;
export const kantinSkinShade = ["#E4BB97", "#D49E78", "#AE7550", "#74462C"] as const;
export const kantinHair = ["#2B1D14", "#6B4226", "#D9A441", "#1C1C1C", "#A0522D", "#4A3426"] as const;
export const kantinMouth = "#7A2E26";
export const kantinTongue = "#E8807A";
export const kantinCheek = "rgba(240, 110, 100, 0.35)";
/** Yüz çizgileri (göz, kaş, ağız) ve figür konturu. */
export const kantinFaceInk = "#2A1D18";
export const kantinOutline = "#1B1F3F";

/**
 * Forma çeşitleri — `style`: düz / çubuklu / kuşak / ikiye bölünmüş.
 * `scarf`: atkı iki rengi (taraftar kimliği), `num`: sırt numarası rengi.
 */
export const kantinJerseys = [
  { body: "#E5484D", trim: "#FFFFFF", style: "stripes", scarf: ["#E5484D", "#FFFFFF"] },
  { body: "#2E6FE0", trim: "#FFD43B", style: "plain", scarf: ["#2E6FE0", "#FFD43B"] },
  { body: "#1F9D55", trim: "#FFFFFF", style: "sash", scarf: ["#1F9D55", "#FFFFFF"] },
  { body: "#FFD43B", trim: "#1B3A8A", style: "half", scarf: ["#FFD43B", "#1B3A8A"] },
  { body: "#7B3FD1", trim: "#F2B705", style: "plain", scarf: ["#7B3FD1", "#F2B705"] },
  { body: "#232838", trim: "#E5E7EB", style: "stripes", scarf: ["#232838", "#E5E7EB"] },
  { body: "#FF7A1A", trim: "#1F2937", style: "sash", scarf: ["#FF7A1A", "#1F2937"] },
  { body: "#7A1E2C", trim: "#5DADE2", style: "half", scarf: ["#7A1E2C", "#5DADE2"] },
] as const;

/** Ürün çizim renkleri (ürün kimliğine göre). */
export const kantinFood = {
  outline: "#3A2418",
  shine: "rgba(255, 255, 255, 0.65)",
  shade: "rgba(58, 36, 24, 0.18)",
  ground: "rgba(20, 16, 40, 0.18)",

  crust: "#B8682A",
  crustDark: "#8A4A18",
  crustLight: "#E7A85A",
  sesame: "#FFF1CC",
  cupWhite: "#FFFFFF",
  cupShade: "#DDE3EE",
  ayranBlue: "#2E7BD6",
  ayranFoam: "#F4F8FF",
  foil: "#E3E8EF",
  foilEdge: "#9CA5BE",
  toast: "#F4C77E",
  toastDark: "#A86424",
  toastGrill: "#7A4416",
  cheese: "#FFD23F",
  cheeseDark: "#E2A400",
  glass: "rgba(255, 255, 255, 0.78)",
  glassEdge: "#A9B1C8",
  saucer: "#FFFFFF",
  saucerEdge: "#C6CCDA",
  tea: "#B3341C",
  teaLight: "#E0603F",
  teaGold: "#F0B23A",
  steam: "rgba(255, 255, 255, 0.9)",
  corn: "#FFCF33",
  cornDark: "#E09E00",
  husk: "#59A84B",
  huskDark: "#3E7F34",
  water: "#CDEBFF",
  waterDeep: "#8CC6F0",
  waterLabel: "#2E8BEA",
  waterCap: "#1B5FB0",
  paper: "#F6EEE1",
  paperEdge: "#C9BBA4",
  paperStripe: "#E5484D",
  lavash: "#EBC68C",
  lavashDark: "#C9984E",
  meat: "#8E4F25",
  meatDark: "#5E2E12",
  meatLight: "#B8743E",
  lettuce: "#4CAF50",
  lettuceDark: "#2F7D33",
  tomato: "#E53935",
  onion: "#F3E3F0",
  cola: "#D9262B",
  colaDark: "#9C161A",
  colaLabel: "#FFFFFF",
  can: "#D9DDE4",
  canDark: "#9AA2B1",
  gazoz: "#3DB56A",
  gazozDark: "#1E7A40",
  gazozCap: "#E8B023",
  gazozLabel: "#FFF4D6",
  bubbles: "rgba(255, 255, 255, 0.85)",
  orange: "#FF8A3D",
  potatoSkin: "#B9793F",
  potatoSkinDark: "#8A5426",
  potato: "#F7E3A6",
  butter: "#FFE27A",
  pickle: "#6BA539",
  olive: "#2D2A26",
  sausage: "#C0392B",
  sausageDark: "#8E2418",
  sausageDot: "#F2A7A0",
  bread: "#E3A65A",
  breadDark: "#B97A34",
  breadLight: "#F5CA86",
  parsley: "#3E9A3A",
  lemon: "#FFE14D",
  lemonDark: "#E0B400",
  lemonade: "#FFF3A6",
  straw: "#E5484D",
  cone: "#E2A65B",
  coneDark: "#B47630",
  creamPink: "#FF9EBB",
  creamPinkDark: "#E06A90",
  creamVanilla: "#FFF2CC",
  creamChoco: "#7A4A2A",
  cherry: "#D7263D",
  kokorec: "#A0612C",
  kokorecDark: "#6E3C14",
  pepper: "#D93B22",
} as const;
