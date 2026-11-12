/**
 * LİG YOLU OYUN SAHNESİ — oyun başına arka plan paleti (oyun verisi).
 *
 * Her oyunun kendi atmosferi var: Elit Üçlü gece maçının yeşili, Üçle Kazan
 * mor ışıklı tribün, Soyunma Odası mavi fayans, Kantin sıcak turuncu, Kariyer
 * Yolu turkuaz projektör gecesi. Renkler iki temada da aynıdır (oyun dünyası);
 * bileşenler bu dosyayı içe aktarır.
 */

import type { PuzzleGameKey } from "./types";

export interface StageTheme {
  /** Dikey zemin: üst → alt. */
  sky: [string, string, string];
  /** İki köşe projektörü ve orta parıltı. */
  beamA: string;
  beamB: string;
  glow: string;
  /** Tribün siluetinin rengi ve kalabalık ışıkları. */
  crowd: string;
  sparkle: string;
  /** Üst şerit düğmeleri ve seviye kurdelesi. */
  button: [string, string];
  ribbon: [string, string];
}

export const STAGE_THEMES: Record<PuzzleGameKey, StageTheme> = {
  uclu: {
    sky: ["#0B3B2A", "#0F5A3C", "#0A2E22"],
    beamA: "#B9FFDA",
    beamB: "#FFF3B0",
    glow: "#3DFFA0",
    crowd: "#072519",
    sparkle: "#FFE45C",
    button: ["#2BD47D", "#12894D"],
    ribbon: ["#FFB547", "#E8650C"],
  },
  ucle: {
    sky: ["#2A1460", "#4B22A8", "#1D0E45"],
    beamA: "#E2D3FF",
    beamB: "#FFC2E2",
    glow: "#B07CFF",
    crowd: "#170A36",
    sparkle: "#FFE45C",
    button: ["#A47BFF", "#6A3BE0"],
    ribbon: ["#FF7AA8", "#D9306E"],
  },
  soyunma: {
    sky: ["#0D3A6E", "#1763B5", "#0A2A52"],
    beamA: "#D6EEFF",
    beamB: "#FFFFFF",
    glow: "#5CC4FF",
    crowd: "#08223F",
    sparkle: "#FFFFFF",
    button: ["#4DB5FF", "#1C78D6"],
    ribbon: ["#FFD23F", "#E09A00"],
  },
  kantin: {
    sky: ["#6B2A0E", "#C2541B", "#4A1C08"],
    beamA: "#FFE6C2",
    beamB: "#FFF7D6",
    glow: "#FFB347",
    crowd: "#3A1505",
    sparkle: "#FFF3B0",
    button: ["#FFB547", "#E8650C"],
    ribbon: ["#3DD68C", "#16A363"],
  },
  kariyer: {
    sky: ["#06303A", "#0B5E6E", "#04222A"],
    beamA: "#C9FBFF",
    beamB: "#FFF3B0",
    glow: "#35E0F0",
    crowd: "#031A20",
    sparkle: "#FFE45C",
    button: ["#35D0E0", "#0E8C9E"],
    ribbon: ["#FF7A59", "#D9441E"],
  },
};

/** Ortak sahne renkleri. */
export const STAGE_COMMON = {
  white: "#FFFFFF",
  ink: "#FFFFFF",
  inkShadow: "rgba(0, 0, 0, 0.45)",
  shadow: "rgba(0, 0, 0, 0.3)",
  heart: "#FF4D6D",
  heartDeep: "#B3123A",
  dim: "rgba(5, 8, 20, 0.62)",
  card: ["#FFFFFF", "#EEF1F8"] as [string, string],
  cardInk: "#1F2333",
  cardSoft: "#5B6170",
  /** Büyük OYNA düğmesi (yeşil, alt dudaklı 3B). */
  play: ["#6BEA62", "#22B33A"] as [string, string],
  playLip: "#147A26",
  /** Kırmızı düğme / rozet. */
  danger: ["#FF6B6B", "#E02D3C"] as [string, string],
  dangerLip: "#9E1622",
  badge: "#FF3B5C",
  check: "#22C55E",
  gold: "#FFD23F",
  goldDeep: "#C98A00",
  starEmpty: "#D5D9E3",
  tip: "#FFF4CC",
  tipInk: "#7A4B00",
  panel: "#F1F4FA",
  panelEdge: "#DCE2EE",
} as const;
