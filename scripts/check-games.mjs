/**
 * OYUN MOTORU DENETİMİ — briefin oyunlarla ilgili "bitti sayılma"
 * maddelerini gözle değil SAYIYLA doğrular.
 *
 * Çalıştırma:  npm run check:games
 *
 * Ölçülen iddialar:
 *   1. Top sektirmede vuruş noktası yönü belirliyor.
 *   2. Top eğri çiziyor (Magnus) ve kavisin yönü dönüşün yönü.
 *   3. Fizik kare hızından bağımsız: 60Hz ve 144Hz aynı yörüngeyi veriyor.
 *   4. Slalomda kenara basmak ile ortaya basmak ÖLÇÜLEBİLİR biçimde farklı.
 *   5. `approach` momentumlu: hedefe ışınlanmıyor, yavaşlama hızlanmadan çabuk.
 *   6. Falso ölçümü parmağın kavisini doğru işaretle okuyor.
 *   7. Penaltıda top tam hedefe varıyor, falsolu top ilk yönünden sapıyor ve
 *      falso kaleciyi ölçülebilir biçimde aldatıyor.
 *   8. 3B top deseni: her yönelimde gerçek bir futbol topu gibi 6–7 yama
 *      görünür; dönme matrisi uzun dönüşte bozulmuyor.
 */

import { applyHit, stepBall } from "../lib/game/ballistics.ts";
import { approach, curvatureOf } from "../lib/game/math.ts";
import { ballAt, GOAL_W, keeperGuess, planShot } from "../lib/game/penalty.ts";
import { initialOrientation, rotate, visiblePatchCount } from "../lib/game/sphere.ts";
import { TUNING } from "../lib/game/tuning.ts";

const fails = [];
const ok = [];
const check = (name, pass, detail) =>
  (pass ? ok : fails).push(`${name}${detail ? ` — ${detail}` : ""}`);

const FIXED_DT = 1 / 120;

/** Topu verilen sürede simüle eder; sabit adım, tıpkı oyundaki gibi. */
function fly(offset, seconds) {
  const ball = { x: 0, y: 0, vx: 0, vy: 0, spin: 0 };
  applyHit(ball, offset);
  const steps = Math.round(seconds / FIXED_DT);
  for (let i = 0; i < steps; i += 1) stepBall(ball, FIXED_DT);
  return ball;
}

/* ── 1) Vuruş noktası yönü belirliyor ─────────────────────────────────────── */

const left = fly(-0.8, 0.5);
const right = fly(0.8, 0.5);
check(
  "vuruş yönü",
  left.x > 5 && right.x < -5,
  `sola vuruş x=${left.x.toFixed(1)} (sağa gitmeli), sağa vuruş x=${right.x.toFixed(1)} (sola gitmeli)`,
);

/* ── 2) Magnus: top eğri çiziyor, kavis dönüşün yönünde ───────────────────── */

// Dönüşü yalıtmak için: aynı başlangıç hızı, biri dönüşlü biri dönüşsüz.
function flyWithSpin(spin, seconds) {
  const ball = { x: 0, y: 0, vx: 0, vy: -700, spin };
  const steps = Math.round(seconds / FIXED_DT);
  for (let i = 0; i < steps; i += 1) stepBall(ball, FIXED_DT);
  return ball;
}

const spun = flyWithSpin(TUNING.sektir.spinK, 0.9);
const straight = flyWithSpin(0, 0.9);
const drift = spun.x - straight.x;
check(
  "Magnus etkisi",
  Math.abs(drift) > 8,
  `dönüşlü ve dönüşsüz top arasında ${drift.toFixed(1)}px yatay fark`,
);

/* ── 3) Kare hızından bağımsızlık ─────────────────────────────────────────── */

/** Accumulator kalıbıyla, verilen kare süresinde simüle eder. */
function flyAtFrameRate(offset, seconds, frameMs) {
  const ball = { x: 0, y: 0, vx: 0, vy: 0, spin: 0 };
  applyHit(ball, offset);
  let acc = 0;
  const frames = Math.round((seconds * 1000) / frameMs);
  for (let f = 0; f < frames; f += 1) {
    acc += frameMs / 1000;
    while (acc >= FIXED_DT) {
      stepBall(ball, FIXED_DT);
      acc -= FIXED_DT;
    }
  }
  return ball;
}

const at60 = flyAtFrameRate(0.5, 1, 1000 / 60);
const at144 = flyAtFrameRate(0.5, 1, 1000 / 144);
const dx = Math.abs(at60.x - at144.x);
const dy = Math.abs(at60.y - at144.y);
check(
  "kare hızı bağımsızlığı",
  dx < 6 && dy < 6,
  `60Hz ve 144Hz arasında sapma dx=${dx.toFixed(2)}px dy=${dy.toFixed(2)}px (kalan accumulator payı)`,
);

/* ── 4) Slalom kontrol eğrisi: merkez hassas, kenar agresif ───────────────── */

const S = TUNING.slalom;
const steerOf = (n) => Math.sign(n) * Math.abs(n) ** S.steerExp * S.maxLateral;

// Aynı 20% girdi farkı, merkezde ve kenarda ne kadar hız farkı üretiyor?
const nearCentre = steerOf(0.3) - steerOf(0.1);
const nearEdge = steerOf(1.0) - steerOf(0.8);
check(
  "slalom kontrol eğrisi",
  nearEdge > nearCentre * 2,
  `aynı 0.2'lik girdi farkı merkezde ${nearCentre.toFixed(0)}px/sn, kenarda ${nearEdge.toFixed(0)}px/sn üretiyor (${(nearEdge / nearCentre).toFixed(1)}× fark)`,
);

check(
  "merkez hassasiyeti",
  Math.abs(steerOf(0.1)) < S.maxLateral * 0.05,
  `%10 girdi yalnız ${steerOf(0.1).toFixed(0)}px/sn veriyor (tavanın %${((steerOf(0.1) / S.maxLateral) * 100).toFixed(1)}'i)`,
);

/* ── 5) approach: momentum var, durmak hızlanmaktan çabuk ─────────────────── */

let v = 0;
let ticks = 0;
while (v < S.maxLateral - 1 && ticks < 10_000) {
  v = approach(v, S.maxLateral, S.accel, S.decel, FIXED_DT);
  ticks += 1;
}
const accelTicks = ticks;

ticks = 0;
while (v > 1 && ticks < 10_000) {
  v = approach(v, 0, S.accel, S.decel, FIXED_DT);
  ticks += 1;
}
const decelTicks = ticks;

check(
  "momentum",
  accelTicks > 10,
  `tam hıza ${(accelTicks * FIXED_DT * 1000).toFixed(0)}ms'de ulaşıyor (anında değil)`,
);
check(
  "durmak hızlanmaktan çabuk",
  decelTicks < accelTicks,
  `hızlanma ${accelTicks} adım, durma ${decelTicks} adım`,
);

/* ── 6) Falso ölçümü ──────────────────────────────────────────────────────── */

const straightPath = [
  { x: 0, y: 0 },
  { x: 50, y: -50 },
  { x: 100, y: -100 },
];
// Sağa kavis: orta nokta doğrunun sağında.
const rightCurve = [
  { x: 0, y: 0 },
  { x: 80, y: -30 },
  { x: 100, y: -100 },
];
const leftCurve = [
  { x: 0, y: 0 },
  { x: 20, y: -80 },
  { x: 100, y: -100 },
];

check("düz yolda falso yok", Math.abs(curvatureOf(straightPath)) < 0.01,
  `ölçüm ${curvatureOf(straightPath).toFixed(4)}`);
check("sağa kavis pozitif", curvatureOf(rightCurve) > 0.05,
  `ölçüm ${curvatureOf(rightCurve).toFixed(3)}`);
check("sola kavis negatif", curvatureOf(leftCurve) < -0.05,
  `ölçüm ${curvatureOf(leftCurve).toFixed(3)}`);

/* ── 7) Penaltı: varış, falso ve kalecinin aldanması ─────────────────────── */

const W = 360;
const H = 640;
const straightShot = planShot({ dx: 120, dy: -200, length: 233, curve: 0 }, W, H);
const curledShot = planShot({ dx: 120, dy: -200, length: 233, curve: -0.004 }, W, H);

const landed = ballAt(curledShot, 1);
const landedX = landed.X / GOAL_W + 0.5;
check(
  "top hedefe varıyor",
  Math.abs(landedX - curledShot.aimX) < 1e-9,
  `varış ${landedX.toFixed(3)}, hedef ${curledShot.aimX.toFixed(3)}`,
);

// İlk %15'lik uçuşta falsolu top, falsosuzdan ayrışmış olmalı (ters yöne çıkar).
const early = ballAt(curledShot, 0.15).X - ballAt(straightShot, 0.15).X;
check(
  "falso ilk yönü saptırıyor",
  Math.abs(early) > 0.15,
  `uçuşun %15'inde ${early.toFixed(2)}m yanal fark`,
);

const mean = (plan, n = 4000) => {
  let sum = 0;
  for (let i = 0; i < n; i += 1) sum += keeperGuess(plan, 1);
  return sum / n;
};
const missStraight = Math.abs(mean(straightShot) - straightShot.aimX);
const missCurled = Math.abs(mean(curledShot) - curledShot.aimX);
check(
  "falso kaleciyi aldatıyor",
  missCurled > missStraight + 0.05,
  `kalecinin ortalama sapması falsosuz ${(missStraight * GOAL_W).toFixed(2)}m, falsolu ${(missCurled * GOAL_W).toFixed(2)}m`,
);

/* ── 8) 3B top ────────────────────────────────────────────────────────────── */

const orient = initialOrientation();
let minPatches = 12;
let maxPatches = 0;
for (let i = 0; i < 2000; i += 1) {
  rotate(orient, [1, 0.3, 0.2], 0.07);
  const count = visiblePatchCount(orient);
  minPatches = Math.min(minPatches, count);
  maxPatches = Math.max(maxPatches, count);
}
const det =
  orient[0] * (orient[4] * orient[8] - orient[5] * orient[7]) -
  orient[1] * (orient[3] * orient[8] - orient[5] * orient[6]) +
  orient[2] * (orient[3] * orient[7] - orient[4] * orient[6]);
check(
  "top deseni",
  minPatches >= 5 && maxPatches <= 9,
  `görünen yama ${minPatches}–${maxPatches} (gerçek topta 6–7 civarı)`,
);
check(
  "dönme matrisi kararlı",
  Math.abs(det - 1) < 1e-6,
  `2000 dönüş sonra determinant ${det.toFixed(9)}`,
);

/* ── rapor ────────────────────────────────────────────────────────────────── */

for (const line of ok) console.log("  ✓ " + line);

if (fails.length === 0) {
  console.log(`\nOyun motoru denetimi temiz: ${ok.length} ölçüm geçti.`);
  process.exit(0);
}
console.error(`\nOyun motoru denetimi ${fails.length} ihlal buldu:`);
for (const line of fails) console.error("  ✗ " + line);
process.exit(1);
