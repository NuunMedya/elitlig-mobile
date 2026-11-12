/**
 * ÇİZGİ FİLM OYUN TEMASI — bütün oyunların ortak görsel dili (veri).
 *
 * Arcade oyunları (games/*.js, Canvas 2D) bu dili çizer; React Native
 * oyunları (bilgi yarışmaları, Lig Yolu bulmacaları) aynı paleti buradan alır:
 *   · KALIN LACİVERT KONTUR: her şekil `CARTOON.outline` renginde 3 px kenarlı.
 *   · DOYGUN DÜZ DOLGU + üstte beyaz parlama şeridi + altta koyu "dudak"
 *     (3B basılabilir hissi: düğme basınca dudağa çöker).
 *   · GECE ŞEHRİ / STADYUM zemini: mor-lacivert gökyüzü, ışıklı pencereler.
 *   · METİN: kalın (fonts.bold), beyaz, lacivert gölgeli; büyük rakamlar.
 * Renkler iki temada da aynıdır (oyun dünyası). components/ ve app/ altında
 * çıplak hex yazılmaz: bu dosya içe aktarılır.
 */

export const CARTOON = {
  outline: "#1B1446",
  outlineSoft: "rgba(27, 20, 70, 0.55)",
  white: "#FFFFFF",
  ink: "#1F2333",
  textShadow: "rgba(27, 20, 70, 0.85)",
  shadow: "rgba(8, 6, 30, 0.45)",
  shine: "rgba(255, 255, 255, 0.35)",

  /** Ekran zemini (üst → alt). */
  night: ["#3B1F9E", "#22125F", "#120A35"] as [string, string, string],
  skyline: "#2A1A6E",
  skylineFar: "#4A2E9E",
  window: "#FFD86B",
  moon: "#FFE9A8",

  /** Paneller: beyaz kart (koyu metin) ve lacivert hap (beyaz metin). */
  card: "#FFFFFF",
  cardSoft: "#F1F0FA",
  cardInk: "#1F2333",
  cardMuted: "#5B5F7A",
  pill: ["#3A2E9E", "#1C1760"] as [string, string],

  /** Düğme dolguları (açık → koyu) ve dudakları. */
  green: ["#7CF06A", "#22B33A"] as [string, string],
  greenLip: "#127A26",
  gold: ["#FFE45C", "#F5A300"] as [string, string],
  goldLip: "#A86E00",
  goldInk: "#4A2E00",
  red: ["#FF7A7A", "#E02D3C"] as [string, string],
  redLip: "#931422",
  blue: ["#7EC8FF", "#2F80ED"] as [string, string],
  blueLip: "#1A4FA6",
  purple: ["#B79CFF", "#7C4DFF"] as [string, string],
  purpleLip: "#4A2BB0",
  pink: ["#FF9FC2", "#E63E7A"] as [string, string],
  pinkLip: "#9F1E50",
  orange: ["#FFB547", "#F0601A"] as [string, string],
  orangeLip: "#A33B08",
  teal: ["#7CF0E4", "#0EA89A"] as [string, string],
  tealLip: "#06665D",

  /** Doğru / yanlış / uyarı. */
  correct: "#22C55E",
  wrong: "#EF4444",
  warn: "#F5A300",
  star: "#FFD23F",
  heart: "#FF4D6D",
  track: "rgba(255, 255, 255, 0.18)",
  dim: "rgba(8, 6, 30, 0.7)",
} as const;
