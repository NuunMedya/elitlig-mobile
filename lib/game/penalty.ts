/**
 * PENALTI MATEMATİĞİ — kamera, yörünge ve kalecinin okuması. Saf fonksiyonlar.
 *
 * KAMERA: yayın açısı — penaltı noktasının arkasında, göz hizasında. Dünya
 * metre cinsindendir: X yanal (kale merkezi 0), Y yükseklik, D kameradan
 * derinlik. Kale çizgisi D = 17, penaltı noktası D = 6, ağın arkası D = 19.
 * Yatay ve dikey odak ayrı tutulur (stilize lens): kale kadrajın %82'sini
 * kaplar, top ile kale arasındaki çim de ekranın yarısını alır — gerçek bir
 * lensle ikisi aynı anda olmuyor.
 *
 * FALSO: parmağın çizdiği kavis topun ilk YÖNÜNÜ değiştirir, varış noktasını
 * değil. Top `apparent` noktasına doğru çıkar ve uçuş boyunca `target`a
 * kıvrılır. Kaleci topu ilk yönünden okur — falso onu aldatır. Oyunun
 * derinliği budur: köşeyi güçle değil kavisle bulmak.
 */

import { clamp, gauss } from "./math";
import { TUNING } from "./tuning";

const T = TUNING.penalti;

export const GOAL_W = 7.32;
export const GOAL_H = 2.44;
/** Ağın arka üst borusu — arka çerçeve öndekinden alçaktır. */
export const NET_BACK_H = 1.9;
export const D_GOAL = 17;
export const D_SPOT = 6;
export const D_NET = 19;
/** Kalecinin durduğu derinlik — çizginin hemen önü. */
export const D_KEEPER = 16.7;
/** LED panoların derinliği. */
export const D_BOARDS = 21.5;
export const BALL_R = 0.14;

export interface View {
  w: number;
  h: number;
  cx: number;
  /** Yatay/dikey yükseklik odağı (px·m). */
  fx: number;
  /** Zemin odağı: y = horizon + k / D. */
  k: number;
  horizon: number;
}

export function makeView(w: number, h: number): View {
  const goalPx = w * 0.82;
  const fx = (goalPx * D_GOAL) / GOAL_W;
  // Üst direğin üstünde tribüne ~%22 pay kalsın; uzun ekranda kale yukarı
  // kaçıp çimi boş bırakmasın diye taban %42'yi geçmez.
  const goalBase = Math.min(h * 0.42, h * 0.22 + (goalPx * GOAL_H) / GOAL_W);
  const spot = h * 0.86;
  const k = (spot - goalBase) / (1 / D_SPOT - 1 / D_GOAL);
  return { w, h, cx: w / 2, fx, k, horizon: goalBase - k / D_GOAL };
}

/** Dünya noktası → ekran. `s` o derinlikte metre başına piksel. */
export function project(v: View, X: number, Y: number, D: number): { x: number; y: number; s: number } {
  const d = Math.max(0.2, D);
  const s = v.fx / d;
  return { x: v.cx + X * s, y: v.horizon + v.k / d - Y * s, s };
}

/* ─────────────────────────────── atış ─────────────────────────────── */

export interface ShotPlan {
  /** Varış noktası, kale genişliği cinsinden: 0 sol direk, 1 sağ direk. */
  aimX: number;
  /** Varış yüksekliği: 0 zemin, 1 üst direk. */
  aimY: number;
  /** Topun İLK yönünün işaret ettiği nokta (kale genişliği cinsinden). */
  apparentX: number;
  /** -1..1 falso. */
  curve: number;
  /** 0.35..1 güç. */
  power: number;
  /** Uçuş süresi (sn) — güçle kısalır. */
  duration: number;
}

export interface DragLike {
  dx: number;
  dy: number;
  length: number;
  curve: number;
}

/**
 * Nişan duyarlılığı: kalenin bir ucundan diğerine gitmek yaklaşık ekran
 * genişliği kadar sürükleme ister (telefonda ölçülerek seçildi).
 */
const AIM_SPAN = 1.05;
const AIM_RISE = 0.55;

/** Jestten atış planı. Hem atışta hem sürüklerken önizlemede kullanılır. */
export function planShot(drag: DragLike, w: number, h: number): ShotPlan {
  const power = clamp(
    T.powerMin + ((drag.length - T.dragMin) / (T.dragMax - T.dragMin)) * (T.powerMax - T.powerMin),
    T.powerMin,
    T.powerMax,
  );
  const aimX = clamp(0.5 + drag.dx / Math.max(1, w * AIM_SPAN), -0.2, 1.2);
  const aimY = clamp(-drag.dy / Math.max(1, h * AIM_RISE), 0, 1.3);
  const curve = clamp(drag.curve * T.curveK, -1, 1);
  return {
    aimX,
    aimY,
    apparentX: aimX + curve * T.curveBend,
    curve,
    power,
    duration: T.flight * (1.25 - 0.45 * power),
  };
}

/**
 * Uçuştaki topun dünya konumu, `t` 0→1.
 *
 * Yanal: X(t) = A·t + (F − A)·t² — t=0'da teğet A'ya (görünen yön) bakar,
 * t=1'de F'ye (varış) ulaşır. Yükseklik: doğrusal + güçsüz vuruşta kubbe
 * (aşırtma). Derinlik doğrusal.
 */
export function ballAt(plan: ShotPlan, t: number): { X: number; Y: number; D: number } {
  const A = (plan.apparentX - 0.5) * GOAL_W;
  const F = (plan.aimX - 0.5) * GOAL_W;
  const X = A * t + (F - A) * t * t;
  const chip = (1 - plan.power) * 1.1;
  const Y = BALL_R + (plan.aimY * GOAL_H - BALL_R) * t + chip * 4 * t * (1 - t);
  const D = D_SPOT + (D_GOAL - D_SPOT) * t;
  return { X, Y, D };
}

/* ─────────────────────────────── kaleci ─────────────────────────────── */

/**
 * Kalecinin dalış hedefi (kale genişliği cinsinden). Top AYRILDIKTAN sonra,
 * gecikmeyle ve hatayla verilir; bir kez verilir.
 *
 * Kaleci topun İLK yönünü okur: tahmin, varış noktasından görünen yöne doğru
 * `curveFool` kadar kaymıştır. Falsosuz atışta görünen = varış, yani kaleci
 * yalnız gauss hatasıyla yanılır.
 */
export function keeperGuess(plan: ShotPlan, difficulty: number): number {
  const sigma = T.keeperSigmaEasy + (T.keeperSigmaHard - T.keeperSigmaEasy) * difficulty;
  const read = plan.aimX + (plan.apparentX - plan.aimX) * T.curveFool;
  return clamp(gauss(read, sigma), 0.02, 0.98);
}

export type Outcome = "gol" | "kurtaris" | "aut" | "direk";

/**
 * Sonuç. Kalecinin eli topun geçtiği noktaya `reach` kadar yakınsa kurtarış;
 * hedef direklerin dışındaysa aut; direğe çok yakınsa direk. Yükseklik de
 * sayılır: üst köşeye giden topa yerde duran kaleci yetişemez.
 */
export function resolveShot(plan: ShotPlan, keeperX: number, keeperLift: number): Outcome {
  if (plan.aimX < 0.03 || plan.aimX > 0.97 || plan.aimY > 1.04) return "aut";
  if (plan.aimX < 0.075 || plan.aimX > 0.925 || plan.aimY > 0.93) return "direk";

  const dx = Math.abs(plan.aimX - keeperX);
  const reachY = 0.42 + keeperLift * 0.55;
  const reach = T.keeperReach * (1.25 - plan.power * 0.4);
  return dx < reach && plan.aimY <= reachY ? "kurtaris" : "gol";
}
