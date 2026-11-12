/**
 * ÜÇLE KAZAN — karo türleri ve oyunun sabit renkleri.
 *
 * Karo renkleri OYUN VERİSİDİR (tema tokenı değil): her tür iki temada da
 * aynı renkle tanınmalı. Bu yüzden hex burada, lib/ altında durur;
 * components/ yalnız bu dosyayı içe aktarır.
 */

export interface UcleKind {
  /** MaterialCommunityIcons adı. */
  icon: string;
  label: string;
  /** Karo yüzü. */
  face: string;
  /** Karo kalınlığı (alt yüz) — yüzün koyu tonu. */
  deep: string;
  /** İkon rengi. */
  ink: string;
}

export const UCLE_KINDS: UcleKind[] = [
  { icon: "soccer", label: "Top", face: "#22A45D", deep: "#14703D", ink: "#FFFFFF" },
  { icon: "tshirt-crew", label: "Forma", face: "#E5383B", deep: "#9E1F22", ink: "#FFFFFF" },
  { icon: "shoe-cleat", label: "Krampon", face: "#F28C28", deep: "#A85810", ink: "#FFFFFF" },
  { icon: "hand-back-left", label: "Eldiven", face: "#2F7DE1", deep: "#1A4F99", ink: "#FFFFFF" },
  { icon: "whistle", label: "Düdük", face: "#8E44AD", deep: "#5B2871", ink: "#FFFFFF" },
  { icon: "trophy", label: "Kupa", face: "#F2C230", deep: "#B08410", ink: "#3A2A00" },
  { icon: "flag-variant", label: "Bayrak", face: "#16A3B8", deep: "#0C6A78", ink: "#FFFFFF" },
  { icon: "medal", label: "Madalya", face: "#D81B72", deep: "#8E0F49", ink: "#FFFFFF" },
  { icon: "soccer-field", label: "Kale", face: "#5E9E2F", deep: "#3B661A", ink: "#FFFFFF" },
  { icon: "scoreboard", label: "Skorboard", face: "#455A64", deep: "#263238", ink: "#FFFFFF" },
  { icon: "bullhorn", label: "Megafon", face: "#FF7A59", deep: "#B8452A", ink: "#FFFFFF" },
  { icon: "ticket-confirmation", label: "Bilet", face: "#8D6E63", deep: "#5D4037", ink: "#FFFFFF" },
  { icon: "card", label: "Hakem kartı", face: "#FFE14D", deep: "#C7A600", ink: "#7A1010" },
  { icon: "timer-outline", label: "Kronometre", face: "#5C6BC0", deep: "#35408A", ink: "#FFFFFF" },
];

export const UCLE_COLORS = {
  /** Ters karonun sırtı. */
  back: "#3B2A6B",
  backDeep: "#221846",
  backInk: "#9C8BE0",
  /** Üstü kapalı karonun karartması. */
  shade: "rgba(12, 10, 28, 0.52)",
  /** Karo gölgesi. */
  shadow: "rgba(0, 0, 0, 0.28)",
  /** Yüzün üst parlaklık şeridi. */
  shine: "rgba(255, 255, 255, 0.22)",
  /** Kilit grupları (anahtar rozeti ve kilit halkası aynı renk). */
  locks: ["#FFC21A", "#22D3EE", "#FF5CAA"],
  lockInk: "#1B1530",
  chain: "#C9CED6",
  chainInk: "#2B2F36",
  /** Patlama parçacıkları. */
  sparks: ["#FFD24A", "#FFFFFF", "#7CF29A", "#FF7AB6", "#6EC3FF"],
  /** İpucu parlaması. */
  glow: "#FFE066",
  white: "#FFFFFF",
};

/**
 * Oyun içi arayüz (HUD, tahta çerçevesi, raf, güçlendiriciler). Tema
 * tokenından bağımsız: oyun sahnesi iki temada da aynı "stadyum gecesi"
 * atmosferini taşır.
 */
export const UCLE_UI = {
  /** HUD paneli — gece moru. */
  panel: "#2A1E6E",
  panelDeep: "#150E3F",
  panelRim: "#4B3BB0",
  /** Seviye rozeti / kupa altını. */
  gold: "#FFC531",
  goldDeep: "#C47F00",
  goldInk: "#4A2E00",
  /** İlerleme yeşili. */
  green: "#41E070",
  greenDeep: "#1C9C43",
  /** Uyarı kırmızısı (süre azaldı, raf doluyor). */
  red: "#FF4D5E",
  redDeep: "#B11C2C",
  /** Güçlendirici mavisi ve turuncusu. */
  blue: "#3FA9FF",
  blueDeep: "#1A63B8",
  orange: "#FF9A2E",
  orangeDeep: "#C25E00",
  /** Kilit / zincir çipleri. */
  lockChip: "#FFB020",
  lockChipDeep: "#B06F00",
  chainChip: "#8C96A8",
  chainChipDeep: "#555E70",
  barTrack: "rgba(0, 0, 0, 0.38)",
  barShine: "rgba(255, 255, 255, 0.35)",
  /** Tahta: çim keçe + ahşap çerçeve. */
  felt: "#2FA352",
  feltStripe: "#27904A",
  feltDeep: "#1D6E37",
  feltLine: "rgba(255, 255, 255, 0.16)",
  rim: "#8A5528",
  rimHi: "#B97A3E",
  rimDeep: "#4C2A10",
  /** Raf tepsisi. */
  tray: "#3B2416",
  trayHi: "#5A3820",
  trayDeep: "#1F1209",
  cell: "rgba(0, 0, 0, 0.32)",
  cellRim: "rgba(255, 255, 255, 0.12)",
  /** Metin. */
  text: "#FFFFFF",
  textSoft: "rgba(255, 255, 255, 0.72)",
  textShadow: "rgba(0, 0, 0, 0.45)",
  /** Pencere arka örtüsü ve kart. */
  scrim: "rgba(10, 6, 30, 0.62)",
  card: "#33247F",
  cardDeep: "#1A1150",
  /** İpucu balonu. */
  tipFace: "#FFF3C4",
  tipDeep: "#E2B93B",
  tipInk: "#4A3500",
} as const;
