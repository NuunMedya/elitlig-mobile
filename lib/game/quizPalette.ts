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
  navy: { fill: CARTOON.pill, lip: "#0E0B38" },
  ghost: { fill: ["#8C86B8", "#5F5990"] as Fill, lip: "#3A3570" },
} as const satisfies Record<string, QuizButtonTone>;

export type QuizToneName = keyof typeof QUIZ_TONES;

/** A·B·C·D şıklarının sırası. */
export const QUIZ_LETTER_TONES: QuizToneName[] = ["blue", "orange", "purple", "teal"];
/** 1 · X · 2 şıkları: ev mavi, beraberlik altın, deplasman kırmızı. */
export const QUIZ_TRIPLE_TONES: QuizToneName[] = ["blue", "gold", "red"];

export const QUIZ = {
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

  /** Kart parçaları. */
  cardLip: "#CFCBE8",
  hintOpen: "#FFF4C2",
  hintOpenBorder: "#F5B400",
  muted: "rgba(255, 255, 255, 0.72)",
  faint: "rgba(255, 255, 255, 0.5)",
  navyGlass: "rgba(20, 14, 60, 0.82)",

  /** Doğru / yanlış ekran parlaması. */
  flashOk: "rgba(34, 197, 94, 0.32)",
  flashBad: "rgba(239, 68, 68, 0.34)",

  /** Kurdele (MOLA, başlıklar). */
  ribbon: ["#FF7AA8", "#7C4DFF"] as Fill,
  ribbonLip: "#4A2BB0",
  ribbonGold: ["#FFE45C", "#F5A300"] as Fill,
  ribbonGreen: ["#7CF06A", "#22B33A"] as Fill,
} as const;
