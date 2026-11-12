/**
 * OYUN TEMASI — bütün oyunların ortak görsel dili (veri). "Canlı ama sade".
 *
 * Arcade oyunları (games/*.js, Canvas 2D) ve React Native oyunları (bilgi
 * yarışmaları, Lig Yolu bulmacaları) aynı paleti buradan alır:
 *   · ZEMİN: tek, sakin, derin lacivert geçiş (`night`); en çok bir yumuşak ışık.
 *   · KARTLAR: beyaz / lacivert, yumuşak gölge; kalın kontur YOK (gerekirse
 *     1–1.5 px, öğenin kendi renginin koyu tonu: `edge`, `hairline`).
 *   · TEK VURGU: birincil eylem yeşil (`green` + `greenLip`), kırmızı yalnız
 *     yıkıcı eylem. Çevre öğeleri (HUD, hap, çip) nötr: lacivert / beyaz /
 *     yarı saydam (`glass`).
 *   · Düğme derinliği: 3–4 px alt "dudak" + yumuşak gölge; parlama şeridi yok.
 *   · METİN: kalın (fonts.bold); gölge en çok hafif (`textShadow`, yumuşak).
 * Oyun taşları kendi ayırt edici renklerini korur (`outline` taş/karakter
 * çizimi içindir, çerçeve için değil). Renkler iki temada da aynıdır (oyun
 * dünyası). components/ ve app/ altında çıplak hex yazılmaz.
 */

export const CARTOON = {
  outline: "#1B1446",
  outlineSoft: "rgba(27, 20, 70, 0.55)",
  white: "#FFFFFF",
  ink: "#1F2333",
  textShadow: "rgba(10, 14, 36, 0.35)",
  shadow: "rgba(8, 6, 30, 0.45)",
  shine: "rgba(255, 255, 255, 0.22)",

  /** İnce kenar (kart / düğme üstünde 1 px), saydam gece mürekkebi. */
  hairline: "rgba(20, 27, 66, 0.08)",
  /** Koyu zemin üstünde cam yüzey (HUD hapı, yuvarlak düğme) ve kenarı. */
  glass: "rgba(255, 255, 255, 0.12)",
  glassEdge: "rgba(255, 255, 255, 0.18)",
  glassDark: "rgba(10, 14, 36, 0.5)",
  /** Kart altı yumuşak gölge rengi. */
  softShadow: "rgba(10, 14, 36, 0.28)",
  /** Lacivert yazı / ikon (beyaz kart üstünde). */
  navy: "#18204A",

  /** Ekran zemini (üst → alt): sakin, derin lacivert-çivit. */
  night: ["#1E2A63", "#141C47", "#0B1030"] as [string, string, string],
  skyline: "#2A1A6E",
  skylineFar: "#4A2E9E",
  window: "#FFD86B",
  moon: "#FFE9A8",

  /** Paneller: beyaz kart (koyu metin) ve lacivert hap (beyaz metin). */
  card: "#FFFFFF",
  cardSoft: "#F2F4F9",
  cardInk: "#1F2333",
  cardMuted: "#5B5F7A",
  pill: ["#26316E", "#18204A"] as [string, string],

  /** Düğme dolguları (açık → koyu) ve dudakları. */
  green: ["#3FD674", "#1DAA50"] as [string, string],
  greenLip: "#13813B",
  /** Yeşil yüzeyin açık zemini (simge baloncuğu, seçili satır). */
  greenSoft: "#E6F8EC",
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
  dim: "rgba(8, 11, 30, 0.66)",
  /** Yıkıcı ikincil düğmenin açık zemini ve yazısı. */
  dangerSoft: "#FDECEE",
  dangerInk: "#C8283A",
} as const;
