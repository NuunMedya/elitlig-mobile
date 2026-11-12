/**
 * ÜÇLE KAZAN — karo türleri ve oyunun sabit renkleri.
 *
 * Karo renkleri OYUN VERİSİDİR (tema tokenı değil): her tür iki temada da
 * aynı renkle tanınmalı. Bu yüzden hex burada, lib/ altında durur;
 * components/ yalnız bu dosyayı içe aktarır.
 *
 * ÇİZGİ FİLM dili (lib/game/cartoon.ts, arcade oyunlarıyla ortak): karolar,
 * raf, HUD ve düğmeler kalın lacivert `UCLE_OUTLINE` konturlu; dolgular düz
 * ve doygun, üstte beyaz parlama şeridi, altta koyu "dudak"; saha arcade
 * sahasıyla aynı parlak yeşil biçim şeritlerindedir.
 */

/*
 * Ortak çizgi film renkleri (lib/game/cartoon.ts → CARTOON ile birebir aynı).
 * Burada içe aktarılmaz, kopyalanır: seviye denetleyicisi
 * (scripts/check-puzzle-ucle.mjs) bu dosyayı düz Node ile yükler ve "@/"
 * takma adını çözemez.
 */
const CARTOON = {
  outline: "#1B1446",
  textShadow: "rgba(27, 20, 70, 0.85)",
  pill: ["#3A2E9E", "#1C1760"],
} as const;

/** Kalın lacivert kontur. */
export const UCLE_OUTLINE = CARTOON.outline;

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
  { icon: "scoreboard", label: "Skorboard", face: "#4F6DA8", deep: "#2E4573", ink: "#FFFFFF" },
  { icon: "bullhorn", label: "Megafon", face: "#FF7A59", deep: "#B8452A", ink: "#FFFFFF" },
  { icon: "ticket-confirmation", label: "Bilet", face: "#B5774A", deep: "#7A4A26", ink: "#FFFFFF" },
  { icon: "card", label: "Hakem kartı", face: "#FFE14D", deep: "#C7A600", ink: "#7A1010" },
  { icon: "timer-outline", label: "Kronometre", face: "#5C6BC0", deep: "#35408A", ink: "#FFFFFF" },
];

export const UCLE_COLORS = {
  /** Ters karonun sırtı. */
  back: "#5A48D6",
  backDeep: "#2E2380",
  backInk: "#B9ACFF",
  /** Üstü kapalı karonun karartması. */
  shade: "rgba(12, 10, 28, 0.52)",
  /** Karo gölgesi. */
  shadow: "rgba(8, 6, 30, 0.35)",
  /** Yüzün üst parlaklık şeridi. */
  shine: "rgba(255, 255, 255, 0.55)",
  /** Karo yüzünün alt koyu bandı (düz iki ton). */
  faceLow: "rgba(8, 6, 30, 0.16)",
  outline: CARTOON.outline,
  /** Kilit grupları (anahtar rozeti ve kilit halkası aynı renk). */
  locks: ["#FFC21A", "#22D3EE", "#FF5CAA"],
  lockInk: "#1B1446",
  chain: "#C9CED6",
  chainInk: "#1B1446",
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
  panel: CARTOON.pill[0],
  panelDeep: CARTOON.pill[1],
  panelRim: CARTOON.outline,
  outline: CARTOON.outline,
  well: "#17114A",
  /** Seviye rozeti / kupa altını. */
  gold: "#FFD23F",
  goldDeep: "#A86E00",
  goldInk: "#4A2E00",
  /** İlerleme yeşili. */
  green: "#7CF06A",
  greenDeep: "#22B33A",
  /** Uyarı kırmızısı (süre azaldı, raf doluyor). */
  red: "#E02D3C",
  redDeep: "#931422",
  /** Güçlendirici mavisi ve turuncusu. */
  blue: "#2F80ED",
  blueDeep: "#1A4FA6",
  orange: "#F0601A",
  orangeDeep: "#A33B08",
  /** Kilit / zincir çipleri. */
  lockChip: "#F5A300",
  lockChipDeep: "#A86E00",
  chainChip: "#8C96A8",
  chainChipDeep: "#555E70",
  barTrack: "#17114A",
  barShine: "rgba(255, 255, 255, 0.35)",
  /** Tahta: çim keçe + ahşap çerçeve. */
  felt: "#74DA64",
  feltStripe: "#5BC24E",
  feltDeep: "#2F8F2E",
  feltLine: "rgba(255, 255, 255, 0.7)",
  rim: "#3A2E9E",
  rimHi: "#5A48D6",
  rimDeep: "#1C1760",
  /** Raf tepsisi. */
  tray: "#3A2E9E",
  trayHi: "#5A48D6",
  trayDeep: "#1C1760",
  cell: "#17114A",
  cellRim: "rgba(255, 255, 255, 0.16)",
  /** Metin. */
  text: "#FFFFFF",
  textSoft: "rgba(255, 255, 255, 0.72)",
  textShadow: CARTOON.textShadow,
  /** Pencere arka örtüsü ve kart. */
  scrim: "rgba(10, 6, 30, 0.62)",
  card: "#3A2E9E",
  cardDeep: "#1C1760",
  /** İpucu balonu. */
  tipFace: "#FFFFFF",
  tipDeep: CARTOON.outline,
  tipInk: "#1F2333",
  shine: "rgba(255, 255, 255, 0.4)",
} as const;
