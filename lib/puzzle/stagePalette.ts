/**
 * LİG YOLU OYUN SAHNESİ — oyun başına arka plan paleti (oyun verisi).
 *
 * Sade dil: her oyunun zemini aynı sakin derin lacivertin o oyuna çalan bir
 * tonudur (Elit Üçlü yeşile, Üçle Kazan mora, Soyunma Odası maviye, Kantin
 * sıcak tona, Kariyer Yolu turkuaza) ve tahtanın arkasında TEK yumuşak ışık
 * vardır. Kurdele, projektör, tribün ışığı yok. Çevre öğeleri (üst şerit,
 * kartlar) nötrdür; `tint` yalnız küçük ayrıntılarda (güçlendirici ikonu)
 * oyunu hatırlatır. Renkler iki temada da aynıdır (oyun dünyası).
 */

import type { PuzzleGameKey } from "./types";

export interface StageTheme {
  /** Dikey zemin: üst → alt. */
  sky: [string, string, string];
  /** Tahtanın arkasındaki tek yumuşak ışık. */
  glow: string;
  /** Oyunun imza rengi (küçük ayrıntılar: güçlendirici ikonu). */
  tint: string;
}

export const STAGE_THEMES: Record<PuzzleGameKey, StageTheme> = {
  uclu: { sky: ["#14403A", "#0E2B33", "#0A1A26"], glow: "#2FD18B", tint: "#14A35E" },
  ucle: { sky: ["#2C2470", "#1C1A4C", "#0F1030"], glow: "#8F6BFF", tint: "#6A45E0" },
  soyunma: { sky: ["#163E73", "#102A55", "#0A1835"], glow: "#4FB3FF", tint: "#1F7AD6" },
  kantin: { sky: ["#4A2C34", "#2C1E36", "#141228"], glow: "#FF9F45", tint: "#E0701A" },
  kariyer: { sky: ["#0F3E4C", "#0B2A3A", "#081828"], glow: "#2FD0E0", tint: "#0E8C9E" },
};

/** Ortak sahne renkleri. */
export const STAGE_COMMON = {
  white: "#FFFFFF",
  ink: "#FFFFFF",
  inkShadow: "rgba(0, 0, 0, 0.25)",
  shadow: "rgba(0, 0, 0, 0.3)",
  /** Koyu zemin üstünde cam yüzey (üst şerit hapı, yuvarlak düğme). */
  glass: "rgba(255, 255, 255, 0.12)",
  glassEdge: "rgba(255, 255, 255, 0.16)",
  /** Hedef panelindeki baloncuk ve sayaç (koyu panel üstünde). */
  glassStrong: "rgba(255, 255, 255, 0.16)",
  inkSoft: "rgba(255, 255, 255, 0.7)",
  heart: "#FF4D6D",
  heartDeep: "#B3123A",
  dim: "rgba(5, 8, 20, 0.62)",
  card: ["#FFFFFF", "#F7F8FC"] as [string, string],
  cardInk: "#18204A",
  cardSoft: "#5B6170",
  /** Kart altı yumuşak gölge. */
  cardShadow: "#0A0E24",
  /** Büyük OYNA düğmesi (tek vurgu: yeşil, 4 px alt dudak). */
  play: ["#3FD674", "#1DAA50"] as [string, string],
  playLip: "#13813B",
  playSoft: "#E6F8EC",
  /** Yıkıcı eylem: açık kırmızı zemin, kırmızı yazı (dolgu düğme değil). */
  danger: ["#FF6B6B", "#E02D3C"] as [string, string],
  dangerLip: "#9E1622",
  dangerSoft: "#FDECEE",
  dangerInk: "#C8283A",
  badge: "#FF3B5C",
  check: "#22C55E",
  gold: "#FFD23F",
  goldDeep: "#C98A00",
  starEmpty: "#D5D9E3",
  goldSoft: "#FFF5D6",
  tip: "#F2F4F9",
  tipInk: "#3D4466",
  panel: "#F2F4F9",
  panelEdge: "#E3E7F0",
  navySoft: "#E8EBF5",
} as const;
