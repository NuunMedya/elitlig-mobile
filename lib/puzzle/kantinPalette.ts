/**
 * STADYUM KANTİNİ PALETİ — oyun sahnesinin çizim renkleri (alan verisi).
 *
 * Kantin sahnesi iki temada da aynı "ahşap tezgâh + beyaz tabak" dünyasıdır;
 * ürün ve forma renkleri tanınırlık için sabittir. HUD ve metin zeminleri
 * tema tokenlarından gelir (components/ altında çıplak hex yazılmaz).
 */

export const kantinScene = {
  wood: "#B97A45",
  woodDark: "#8A552C",
  woodLight: "#D9A066",
  woodEdge: "#6E4222",
  counter: "#F1DFC2",
  counterEdge: "#D7BC93",
  shelf: "#E7CFA8",
  tile: "#FFFDF8",
  tileEdge: "#E3CFAE",
  tileDim: "#F4E8D3",
  plate: "#FFFFFF",
  plateRim: "#D5DBE5",
  plateShadow: "rgba(60, 40, 20, 0.18)",
  holdSlot: "#FBF2E2",
  holdEdge: "#C9A273",
  danger: "#E5484D",
  dangerSoft: "rgba(229, 72, 77, 0.16)",
  ink: "#3A271A",
  inkSoft: "#6B4F3A",
  bubble: "#FFFFFF",
  bubbleEdge: "#E4D6C1",
  check: "#2FA35A",
  coin: "#F5B70A",
  coinEdge: "#C98E00",
  coinShine: "#FFE28A",
  vip: "#F2B705",
  vipDeep: "#B7860B",
  lock: "#5B6472",
  lockBg: "rgba(40, 46, 58, 0.55)",
  crate: "#C99A62",
  crateDark: "#94693B",
  crateTape: "#E9D2A6",
  patienceGood: "#2FA35A",
  patienceMid: "#F2B705",
  patienceLow: "#E5484D",
  white: "#FFFFFF",
  shadow: "rgba(40, 25, 10, 0.25)",
} as const;

export const kantinConfetti = ["#F2B705", "#E5484D", "#2E8BEA", "#2FA35A", "#9B5DE5", "#FF8A3D"] as const;

export const kantinSkins = ["#F7D7B8", "#EBB894", "#C98D63", "#8D5A3B"] as const;
export const kantinHair = ["#2B1D14", "#6B4226", "#D9A441", "#1C1C1C", "#A0522D", "#4A3426"] as const;
export const kantinCheek = "rgba(240, 110, 110, 0.35)";
export const kantinMouth = "#9E2B2B";

/** Forma çeşitleri — `style`: düz / çubuklu / kuşak / ikiye bölünmüş. */
export const kantinJerseys = [
  { body: "#E5484D", trim: "#FFFFFF", style: "stripes" },
  { body: "#2E6FE0", trim: "#FFD43B", style: "plain" },
  { body: "#1F9D55", trim: "#FFFFFF", style: "sash" },
  { body: "#FFD43B", trim: "#1B3A8A", style: "half" },
  { body: "#7B3FD1", trim: "#F2B705", style: "plain" },
  { body: "#111827", trim: "#E5E7EB", style: "stripes" },
  { body: "#FF7A1A", trim: "#1F2937", style: "sash" },
  { body: "#7A1E2C", trim: "#5DADE2", style: "half" },
] as const;

/** Ürün çizim renkleri (ürün kimliğine göre). */
export const kantinFood = {
  crust: "#B8742E",
  crustLight: "#E0A458",
  sesame: "#FFF1CC",
  cupWhite: "#FFFFFF",
  cupEdge: "#C9D2DE",
  ayranBlue: "#2E7BD6",
  foil: "#DDE3EA",
  foilEdge: "#AEB7C2",
  toast: "#F2C67E",
  toastDark: "#A86424",
  cheese: "#FFD23F",
  glass: "rgba(255, 255, 255, 0.75)",
  glassEdge: "#B9C3CF",
  tea: "#B3341C",
  teaLight: "#D9573A",
  corn: "#FFCF33",
  cornDark: "#E0A800",
  husk: "#59A84B",
  huskDark: "#3E7F34",
  water: "#CDEBFF",
  waterEdge: "#5AA6E6",
  waterLabel: "#2E8BEA",
  waterCap: "#1B5FB0",
  paper: "#F6EEE1",
  paperEdge: "#D9C6A8",
  paperStripe: "#E5484D",
  lavash: "#E9C48A",
  meat: "#8E4F25",
  meatDark: "#6B3416",
  lettuce: "#4CAF50",
  tomato: "#E53935",
  cola: "#D9262B",
  colaDark: "#A81C20",
  can: "#C9CED6",
  gazoz: "#2FA35A",
  gazozDark: "#1E7A40",
  gazozCap: "#E8B023",
  gazozLabel: "#FFF4D6",
  orange: "#FF8A3D",
  potatoSkin: "#C68A4E",
  potato: "#F7E3A6",
  pickle: "#6BA539",
  olive: "#2D2A26",
  sausage: "#C0392B",
  sausageDot: "#F2A7A0",
  bread: "#E3A65A",
  breadDark: "#B97A34",
} as const;
