/**
 * BİLGİ YARIŞMALARI — çizgi film temasının yarışmaya özgü renkleri (veri).
 *
 * Ortak dil `lib/game/cartoon.ts`tedir (`CARTOON`); burada yalnız bilgi
 * yarışmalarının (Kim Bu?, Gol Düellosu, Kim Kazandı?, Günün Testi) ek
 * renkleri durur: gece stadyumu zemininin parçaları, şık düğmelerinin sıra
 * renkleri ve doğru/yanlış parlaması. İki temada aynıdır (oyun dünyası).
 */

import { CARTOON } from "./cartoon";

type Fill = readonly [string, string];

/** Şık düğmesi: dolgu (açık → koyu) + dudak. */
export interface QuizButtonTone {
  fill: Fill;
  lip: string;
}

export const QUIZ_TONES = {
  green: { fill: CARTOON.green, lip: CARTOON.greenLip },
  gold: { fill: CARTOON.gold, lip: CARTOON.goldLip },
  red: { fill: CARTOON.red, lip: CARTOON.redLip },
  blue: { fill: CARTOON.blue, lip: CARTOON.blueLip },
  purple: { fill: CARTOON.purple, lip: CARTOON.purpleLip },
  pink: { fill: CARTOON.pink, lip: CARTOON.pinkLip },
  orange: { fill: CARTOON.orange, lip: CARTOON.orangeLip },
  teal: { fill: CARTOON.teal, lip: CARTOON.tealLip },
  navy: { fill: ["rgba(255, 255, 255, 0.16)", "rgba(255, 255, 255, 0.10)"] as Fill, lip: "rgba(6, 5, 28, 0.35)" },
  /** Şıkların TEK nötr tonu: sakin indigo; doğru/yanlış yalnız yeşil/kırmızı. */
  option: { fill: ["#4C55C9", "#3B42A8"] as Fill, lip: "#272C78" },
  /** Marka vurgusu (kurallar, kabarcıklar): tek renk. */
  indigo: { fill: ["#6E7BFF", "#4F5BE6"] as Fill, lip: "#343EB0" },
  ghost: { fill: ["#5A5F96", "#484C80"] as Fill, lip: "#2E3160" },
} as const satisfies Record<string, QuizButtonTone>;

export type QuizToneName = keyof typeof QUIZ_TONES;

/** A·B·C·D şıklarının sırası. */
export const QUIZ_LETTER_TONES: QuizToneName[] = ["option", "option", "option", "option"];
/** 1 · X · 2 şıkları: aynı nötr ton; işaret (1/X/2) ayırt eder. */
export const QUIZ_TRIPLE_TONES: QuizToneName[] = ["option", "option", "option"];

export const QUIZ = {
  /** SADE GÖRÜNÜM (2026-11 düzeltmesi): kontur yok, yumuşak gölge + ince kenar. */
  base: ["#1E1B4F", "#141238", "#0B0A22"] as [string, string, string],
  glow: "#6E7BFF",
  pitchFaint: "rgba(255, 255, 255, 0.06)",
  edge: "rgba(12, 10, 40, 0.10)",
  edgeLight: "rgba(255, 255, 255, 0.12)",
  textShadow: "rgba(6, 5, 28, 0.35)",
  cardShadow: "#05041A",
  cardLipSoft: "rgba(6, 5, 28, 0.28)",
  hudPill: "rgba(8, 7, 32, 0.45)",
  hudPillHot: "rgba(255, 176, 32, 0.22)",
  accent: "#FFC23D",
  accentSoft: "rgba(255, 194, 61, 0.35)",
  indigoInk: "#3B42A8",
  indigoTint: "rgba(79, 91, 230, 0.10)",
  shineSoft: "rgba(255, 255, 255, 0.16)",
  /** Düğme üst yarısındaki çok hafif ışık (şerit değil, yumuşak ton farkı). */
  shineFaint: "rgba(255, 255, 255, 0.08)",
  markBg: "rgba(255, 255, 255, 0.18)",
  track: "rgba(255, 255, 255, 0.12)",
  /** Gece stadyumu zemini. */
  beam: "rgba(255, 244, 196, 0.10)",
  beamCore: "rgba(255, 244, 196, 0.16)",
  lamp: "#FFF4C4",
  pole: "#6B5BC4",
  stand: "#2C1C78",
  standTop: "#3E2A9A",
  crowd: "rgba(255, 255, 255, 0.10)",
  pitch: ["#2FBF4E", "#178A34"] as Fill,
  pitchLine: "rgba(255, 255, 255, 0.55)",
  star: "rgba(255, 255, 255, 0.55)",
  /** Canlı zemin: gökyüzüne uzanan projektör hüzmesi (uç saydam → dip parlak). */
  beamTip: "rgba(255, 244, 196, 0)",
  beamBase: "rgba(255, 244, 196, 0.22)",
  moonHalo: "rgba(255, 233, 168, 0.18)",
  sparkle: "#FFF3B0",
  crowdWave: "rgba(255, 216, 107, 0.55)",
  /** Seri ateşi halkası ve son saniye kırmızı halesi. */
  fireGlow: "rgba(255, 194, 61, 0.45)",
  dangerGlow: "rgba(255, 80, 96, 0.35)",
  /** Düğmelerdeki kayan parlama şeridi. */
  glint: "rgba(255, 255, 255, 0.22)",

  /** Kart parçaları. */
  cardLip: "#CFCBE8",
  hintOpen: "#FFF4C2",
  hintOpenBorder: "#F5B400",
  muted: "rgba(255, 255, 255, 0.72)",
  faint: "rgba(255, 255, 255, 0.5)",
  navyGlass: "rgba(20, 14, 60, 0.82)",

  /** Doğru / yanlış ekran parlaması. */
  flashOk: "rgba(34, 197, 94, 0.16)",
  flashBad: "rgba(239, 68, 68, 0.2)",

  /** Kurdele (MOLA, başlıklar). */
  ribbon: ["#5A66F0", "#4652D8"] as Fill,
  ribbonLip: "#4A2BB0",
  ribbonGold: ["#FFE45C", "#F5A300"] as Fill,
  ribbonGreen: ["#7CF06A", "#22B33A"] as Fill,
} as const;
