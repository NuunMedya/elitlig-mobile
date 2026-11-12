/**
 * KARİYER YOLU — OYUN MOTORU (Skia + Reanimated).
 *
 * NE: maçın "an"larını oynatan küçük 2D motor. Üç parça:
 *   createMoment   anın başlangıç durumunu kurar (JS; tohumlu, belirlenimci)
 *   stepMoment     durumu `dt` kadar ilerletir (worklet; arayüz iş parçacığı)
 *   drawMoment     durumu bir Skia tuvaline çizer (worklet; anlık çizim)
 *
 * NEDEN ANLIK ÇİZİM (Picture): sahnedeki nesne sayısı an be an değişir
 * (parçacıklar, savunmacılar, top izi). Bildirimsel Skia ağacı her nesne için
 * bir React düğümü ister; burada bütün sahne tek bir worklet'te, her karede
 * bir SkPicture'a kaydedilir ve React hiç yeniden çizmez. Parmak hareketi ve
 * fizik arayüz iş parçacığında kalır; JS meşgulken bile oyun akar.
 *
 * DURUM düz bir nesnedir (sayılar ve sayı dizileri): paylaşılan değerde durur,
 * `modify` ile yerinde değiştirilir; nesne üretimi (çöp) en aza iner.
 *
 * KOORDİNAT: tuval `w × h` pikseldir; bütün ölçüler `w`/`h` oranıdır, yani
 * oyun her ekran genişliğinde aynı oynanır. Yukarısı rakip kale.
 *
 * Renkler lib/kariyer/palette.ts'ten gelir (oyun verisi). Metin çizilmez:
 * yazılar (dakika, hikâye, sonuç) React Native katmanındadır.
 */

import { BlurStyle, PaintStyle, Skia, StrokeCap, TileMode, type SkCanvas } from "@shopify/react-native-skia";

import type { Attrs, MomentDef } from "./levels";
import type { KariyerPalette } from "./palette";

/* ───────────────────────────── tipler ───────────────────────────── */

export const KIND_SHOT = 0;
export const KIND_PASS = 1;
export const KIND_DRIBBLE = 2;

/** Anın evresi. */
export const PHASE_READY = 0; // oyuncu hamlesini bekliyor
export const PHASE_FLIGHT = 1; // top yolda / koşu sürüyor
export const PHASE_RESULT = 2; // sonuç belli; kutlama ya da üzüntü oynuyor
export const PHASE_OVER = 3; // an bitti, JS'e haber verildi

/** Sonuç kodu (JS tarafında metne çevrilir; bkz. OUTCOME_TEXT). */
export const OUT_NONE = 0;
export const OUT_GOAL = 1;
export const OUT_SAVED = 2;
export const OUT_MISS = 3;
export const OUT_BLOCKED = 4;
export const OUT_LATE = 5;
export const OUT_PASS_PERFECT = 6;
export const OUT_PASS_OK = 7;
export const OUT_PASS_CUT = 8;
export const OUT_PASS_LONG = 9;
export const OUT_DRIBBLE_DONE = 10;
export const OUT_TACKLED = 11;

export const OUTCOME_TEXT: Record<number, { title: string; tone: "good" | "ok" | "bad" }> = {
  [OUT_GOAL]: { title: "GOL!", tone: "good" },
  [OUT_SAVED]: { title: "Kaleci çıkardı", tone: "ok" },
  [OUT_MISS]: { title: "Dışarı", tone: "bad" },
  [OUT_BLOCKED]: { title: "Savunmaya çarptı", tone: "bad" },
  [OUT_LATE]: { title: "Geç kaldın", tone: "bad" },
  [OUT_PASS_PERFECT]: { title: "Nefis pas!", tone: "good" },
  [OUT_PASS_OK]: { title: "Pas yerini buldu", tone: "ok" },
  [OUT_PASS_CUT]: { title: "Araya girdiler", tone: "bad" },
  [OUT_PASS_LONG]: { title: "Pas uzun kaldı", tone: "bad" },
  [OUT_DRIBBLE_DONE]: { title: "Hepsini geçtin!", tone: "good" },
  [OUT_TACKLED]: { title: "Topu kaptırdın", tone: "bad" },
};

export interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  /** Serbest alan: an türüne göre (devriye sınırı, şerit, faz). */
  a: number;
  b: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: number;
  spin: number;
}

export interface MomentState {
  kind: number;
  w: number;
  h: number;
  t: number;
  phase: number;
  /** Sonuç evresinde geçen süre. */
  resultT: number;
  outcome: number;
  score: number;
  /** Oyuncunun hamle için kalan süresi (sn). */
  clock: number;
  clockMax: number;
  ball: Body;
  me: Body;
  mate: Body;
  keeper: Body;
  rivals: Body[];
  /** Top izi: x,y çiftleri (en yeni sonda). */
  trail: number[];
  particles: Particle[];
  shake: number;
  flash: number;
  /** Kale: orta x, çizgi y, yarı genişlik. */
  goalX: number;
  goalY: number;
  goalHalf: number;
  /** Pas: koşunun başı / sonu ve ilerlemesi (0–1). */
  runX0: number;
  runY0: number;
  runX1: number;
  runY1: number;
  runP: number;
  runSpeed: number;
  /** Çalım: ilerleme (0–1) ve süre. */
  progress: number;
  duration: number;
  spawnT: number;
  spawned: number;
  /** Özelliklerden türeyen fizik katsayıları. */
  power: number; // şut / pas hızı
  catchR: number; // pas yakalama yarıçapı
  agility: number; // çalımda parmağı izleme hızı
  grace: number; // çalımda çarpışma payı (küçük = affedici)
  difficulty: number;
  seed: number;
  lastUp: number;
}

/** Parmak girdisi (JS'ten yazılır, worklet okur). */
export interface TouchInput {
  down: boolean;
  x: number;
  y: number;
  sx: number;
  sy: number;
  /** Her bırakışta bir artar. */
  up: number;
}

export const emptyTouch = (): TouchInput => ({ down: false, x: 0, y: 0, sx: 0, sy: 0, up: 0 });

const body = (x = 0, y = 0, r = 0): Body => ({ x, y, vx: 0, vy: 0, r, a: 0, b: 0 });

/** Tohumlu rastgele (mulberry32) — JS tarafı. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ───────────────────────────── kurulum (JS) ───────────────────────────── */

export function createMoment(def: MomentDef, attrs: Attrs, w: number, h: number): MomentState {
  const rnd = rng(def.seed);
  const d = def.difficulty;
  const a = (key: keyof Attrs) => Math.max(0, Math.min(1, attrs[key] / 99));
  const unit = w / 100;
  const kind = def.kind === "shot" ? KIND_SHOT : def.kind === "pass" ? KIND_PASS : KIND_DRIBBLE;

  const s: MomentState = {
    kind,
    w,
    h,
    t: 0,
    phase: PHASE_READY,
    resultT: 0,
    outcome: OUT_NONE,
    score: 0,
    clock: kind === KIND_DRIBBLE ? 0 : 7 - d * 2.5,
    clockMax: kind === KIND_DRIBBLE ? 1 : 7 - d * 2.5,
    ball: body(w / 2, h * 0.8, unit * 2.6),
    me: body(w / 2, h * 0.84, unit * 4.4),
    mate: body(-999, -999, unit * 4.2),
    keeper: body(-999, -999, unit * 4.6),
    rivals: [],
    trail: [],
    particles: [],
    shake: 0,
    flash: 0,
    goalX: w / 2,
    goalY: h * 0.13,
    goalHalf: w * (0.3 - d * 0.06),
    runX0: 0,
    runY0: 0,
    runX1: 0,
    runY1: 0,
    runP: 0,
    runSpeed: 0,
    progress: 0,
    duration: 1,
    spawnT: 0,
    spawned: 0,
    power: 1,
    catchR: unit * 8,
    agility: 1,
    grace: 1,
    difficulty: d,
    seed: def.seed,
    lastUp: -1,
  };

  if (kind === KIND_SHOT) {
    // Top ceza sahası dışında, her seferinde biraz farklı bir açıda.
    s.ball.x = w * (0.3 + rnd() * 0.4);
    s.ball.y = h * (0.72 + rnd() * 0.06);
    s.me.x = s.ball.x - unit * 2;
    s.me.y = s.ball.y + unit * 7;
    s.power = h * (1.15 + a("sut") * 0.75);
    // Kaleci: devriye hızı ve uzanma payı zorlukla artar, şut özelliğiyle azalır.
    s.keeper.x = s.goalX;
    s.keeper.y = s.goalY + unit * 5;
    s.keeper.vx = (rnd() < 0.5 ? -1 : 1) * w * (0.16 + d * 0.3);
    s.keeper.a = w * (0.34 + d * 0.5); // topa atılma hızı
    s.keeper.b = unit * (7.5 + d * 4.5 - a("sut") * 2.5); // uzanma yarıçapı
    for (let i = 0; i < def.rivals; i += 1) {
      const rival = body(w * (0.3 + rnd() * 0.4), h * (0.36 + i * 0.1 + rnd() * 0.04), unit * 4.4);
      rival.vx = (rnd() < 0.5 ? -1 : 1) * w * (0.12 + d * 0.22 + rnd() * 0.05);
      rival.a = w * 0.16;
      rival.b = w * 0.84;
      s.rivals.push(rival);
    }
  } else if (kind === KIND_PASS) {
    const fromLeft = rnd() < 0.5;
    s.ball.x = w * (0.42 + rnd() * 0.16);
    s.ball.y = h * 0.8;
    s.me.x = s.ball.x;
    s.me.y = s.ball.y + unit * 7;
    s.runX0 = w * (fromLeft ? 0.1 : 0.9);
    s.runY0 = h * (0.56 + rnd() * 0.06);
    s.runX1 = w * (fromLeft ? 0.82 + rnd() * 0.08 : 0.18 - rnd() * 0.08);
    s.runY1 = h * (0.16 + rnd() * 0.06);
    s.runSpeed = 0.17 + d * 0.13; // koşunun saniyedeki payı
    s.mate.x = s.runX0;
    s.mate.y = s.runY0;
    s.power = h * (0.78 + a("pas") * 0.4);
    s.catchR = unit * (6.5 + a("pas") * 4.5 - d * 1.5);
    s.clock = 1 / s.runSpeed;
    s.clockMax = s.clock;
    for (let i = 0; i < def.rivals; i += 1) {
      const rival = body(w * (0.2 + rnd() * 0.6), h * (0.34 + i * 0.12 + rnd() * 0.04), unit * 4.4);
      rival.vx = (rnd() < 0.5 ? -1 : 1) * w * (0.1 + d * 0.24 + rnd() * 0.06);
      rival.a = w * 0.1;
      rival.b = w * 0.9;
      s.rivals.push(rival);
    }
  } else {
    s.me.x = w / 2;
    s.me.y = h * 0.8;
    s.ball.x = s.me.x;
    s.ball.y = s.me.y - unit * 5.5;
    s.duration = 6 + d * 3;
    s.agility = 7 + a("hiz") * 9;
    s.grace = 1 - a("teknik") * 0.28;
    // Rakip sayısı = bu koşuda karşına çıkacak savunmacı.
    s.spawned = 0;
    s.spawnT = 0.5;
    s.runSpeed = def.rivals; // toplam savunmacı (alan yeniden kullanılıyor)
  }
  return s;
}

/* ───────────────────────────── yardımcılar (worklet) ───────────────────────────── */

function rand(s: MomentState): number {
  "worklet";
  // Durumdaki tohumu ilerletir: parçacıklar ve çalım dalgaları için.
  s.seed = (s.seed + 0x6d2b79f5) >>> 0;
  let t = s.seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function burst(s: MomentState, x: number, y: number, count: number, speed: number, colors: number, up: boolean) {
  "worklet";
  for (let i = 0; i < count && s.particles.length < 160; i += 1) {
    const angle = up ? -Math.PI / 2 + (rand(s) - 0.5) * 2.4 : rand(s) * Math.PI * 2;
    const v = speed * (0.35 + rand(s) * 0.75);
    const life = 0.7 + rand(s) * 0.9;
    s.particles.push({
      x,
      y,
      vx: Math.cos(angle) * v,
      vy: Math.sin(angle) * v,
      life,
      max: life,
      size: (s.w / 100) * (0.9 + rand(s) * 1.5),
      color: Math.floor(rand(s) * colors),
      spin: (rand(s) - 0.5) * 12,
    });
  }
}

function finish(s: MomentState, outcome: number, score: number) {
  "worklet";
  if (s.phase >= PHASE_RESULT) return;
  s.phase = PHASE_RESULT;
  s.resultT = 0;
  s.outcome = outcome;
  s.score = score;
  const good = outcome === OUT_GOAL || outcome === OUT_PASS_PERFECT || outcome === OUT_DRIBBLE_DONE;
  if (good) {
    s.shake = 1;
    s.flash = 1;
    const x = outcome === OUT_GOAL ? s.goalX : outcome === OUT_DRIBBLE_DONE ? s.me.x : s.mate.x;
    const y = outcome === OUT_GOAL ? s.goalY + s.h * 0.04 : outcome === OUT_DRIBBLE_DONE ? s.me.y : s.mate.y;
    burst(s, x, y, 90, s.h * 0.9, 6, outcome === OUT_GOAL ? false : true);
  } else if (outcome === OUT_PASS_OK || outcome === OUT_SAVED) {
    burst(s, s.ball.x, s.ball.y, 16, s.h * 0.35, 6, false);
    s.shake = 0.4;
  } else {
    s.shake = 0.6;
  }
}

function hits(ax: number, ay: number, ar: number, bx: number, by: number, br: number): boolean {
  "worklet";
  const dx = ax - bx;
  const dy = ay - by;
  const r = ar + br;
  return dx * dx + dy * dy < r * r;
}

/** Devriye: sınırlar arasında gidip gelir. */
function patrol(b: Body, dt: number) {
  "worklet";
  b.x += b.vx * dt;
  if (b.x < b.a) {
    b.x = b.a;
    b.vx = Math.abs(b.vx);
  } else if (b.x > b.b) {
    b.x = b.b;
    b.vx = -Math.abs(b.vx);
  }
}

/* ───────────────────────────── adım (worklet) ───────────────────────────── */

/**
 * Durumu `dt` saniye ilerletir. Anın bittiği karede `true` döner (çağıran
 * JS'e haber verir); sonraki çağrılarda yalnız parçacıklar söner.
 */
export function stepMoment(s: MomentState, dt: number, touch: TouchInput): boolean {
  "worklet";
  s.t += dt;
  const w = s.w;
  const h = s.h;
  const unit = w / 100;
  const released = touch.up !== s.lastUp && s.lastUp >= 0;
  if (s.lastUp < 0 || released) s.lastUp = touch.up;

  // Parçacıklar, sarsıntı, parlama her evrede söner.
  for (let i = s.particles.length - 1; i >= 0; i -= 1) {
    const p = s.particles[i];
    p.life -= dt;
    if (p.life <= 0) {
      s.particles.splice(i, 1);
      continue;
    }
    p.vy += h * 1.3 * dt;
    p.vx *= 1 - 1.2 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
  s.shake = Math.max(0, s.shake - dt * 2.4);
  s.flash = Math.max(0, s.flash - dt * 1.8);

  if (s.phase === PHASE_OVER) return false;
  if (s.phase === PHASE_RESULT) {
    s.resultT += dt;
    // Sonuçtan sonra top yavaşlayarak akar (ağa takılır / dışarı çıkar).
    s.ball.x += s.ball.vx * dt;
    s.ball.y += s.ball.vy * dt;
    s.ball.vx *= 1 - 5 * dt;
    s.ball.vy *= 1 - 5 * dt;
    if (s.resultT > 1.25) {
      s.phase = PHASE_OVER;
      return true;
    }
    return false;
  }

  for (let i = 0; i < s.rivals.length; i += 1) if (s.kind !== KIND_DRIBBLE) patrol(s.rivals[i], dt);

  /* —— ŞUT —— */
  if (s.kind === KIND_SHOT) {
    const k = s.keeper;
    if (s.phase === PHASE_READY) {
      // Kaleci kale ağzında gidip gelir.
      k.x += k.vx * dt;
      const lim = s.goalHalf - k.r;
      if (k.x < s.goalX - lim) {
        k.x = s.goalX - lim;
        k.vx = Math.abs(k.vx);
      } else if (k.x > s.goalX + lim) {
        k.x = s.goalX + lim;
        k.vx = -Math.abs(k.vx);
      }
      s.clock -= dt;
      if (s.clock <= 0) {
        finish(s, OUT_LATE, 0);
        return false;
      }
      if (released) {
        const dx = touch.x - touch.sx;
        const dy = touch.y - touch.sy;
        const len = Math.sqrt(dx * dx + dy * dy);
        // Yukarı doğru, yeterince uzun bir çekiş şuttur.
        if (len > unit * 6 && dy < -unit * 3) {
          const strength = Math.max(0.45, Math.min(1, len / (h * 0.32)));
          s.ball.vx = (dx / len) * s.power * strength;
          s.ball.vy = (dy / len) * s.power * strength;
          s.phase = PHASE_FLIGHT;
          burst(s, s.ball.x, s.ball.y, 10, h * 0.25, 6, false);
        }
      }
      return false;
    }
    // Uçuş: kaleci topun kale çizgisine varacağı noktaya atılır.
    const b = s.ball;
    const timeToLine = b.vy < 0 ? (s.goalY - b.y) / b.vy : 0;
    const predicted = b.x + b.vx * Math.max(0, timeToLine);
    const lim = s.goalHalf - k.r * 0.4;
    const target = Math.max(s.goalX - lim, Math.min(s.goalX + lim, predicted));
    const step = k.a * dt;
    if (Math.abs(target - k.x) <= step) k.x = target;
    else k.x += target > k.x ? step : -step;

    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.vx *= 1 - 0.25 * dt;
    b.vy *= 1 - 0.25 * dt;
    s.trail.push(b.x, b.y);
    if (s.trail.length > 28) s.trail.splice(0, 2);

    for (let i = 0; i < s.rivals.length; i += 1) {
      const r = s.rivals[i];
      if (hits(b.x, b.y, b.r, r.x, r.y, r.r * 0.9)) {
        b.vx = -b.vx * 0.3;
        b.vy = Math.abs(b.vy) * 0.3;
        finish(s, OUT_BLOCKED, 0.12);
        return false;
      }
    }
    if (b.y <= s.goalY) {
      const off = Math.abs(b.x - s.goalX);
      if (off < s.goalHalf - b.r * 0.5) {
        if (Math.abs(b.x - k.x) < k.b) {
          b.vx *= -0.4;
          b.vy = Math.abs(b.vy) * 0.5;
          finish(s, OUT_SAVED, 0.45);
        } else {
          b.vy *= 0.5;
          finish(s, OUT_GOAL, 1);
        }
      } else {
        // Direğin dibinden kaçan top "az farkla" sayılır.
        finish(s, OUT_MISS, off < s.goalHalf + unit * 6 ? 0.25 : 0.1);
      }
      return false;
    }
    if (b.x < -unit * 4 || b.x > w + unit * 4 || b.y > h + unit * 4 || Math.abs(b.vx) + Math.abs(b.vy) < h * 0.05) {
      finish(s, OUT_MISS, 0.05);
    }
    return false;
  }

  /* —— PAS —— */
  if (s.kind === KIND_PASS) {
    // Arkadaş koşusunu sürdürür (top yoldayken de).
    s.runP = Math.min(1, s.runP + s.runSpeed * dt);
    s.mate.x = s.runX0 + (s.runX1 - s.runX0) * s.runP;
    s.mate.y = s.runY0 + (s.runY1 - s.runY0) * s.runP;
    if (s.phase === PHASE_READY) {
      s.clock = (1 - s.runP) / s.runSpeed;
      if (s.runP >= 1) {
        finish(s, OUT_LATE, 0);
        return false;
      }
      if (released) {
        const dx = touch.x - touch.sx;
        const dy = touch.y - touch.sy;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len > unit * 6 && dy < -unit * 2) {
          s.ball.vx = (dx / len) * s.power;
          s.ball.vy = (dy / len) * s.power;
          s.ball.a = s.runP; // pasın atıldığı andaki koşu payı
          s.phase = PHASE_FLIGHT;
        }
      }
      return false;
    }
    const b = s.ball;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    s.trail.push(b.x, b.y);
    if (s.trail.length > 22) s.trail.splice(0, 2);
    for (let i = 0; i < s.rivals.length; i += 1) {
      const r = s.rivals[i];
      if (hits(b.x, b.y, b.r, r.x, r.y, r.r * 0.95)) {
        b.vx *= -0.25;
        b.vy *= -0.25;
        finish(s, OUT_PASS_CUT, 0.1);
        return false;
      }
    }
    if (hits(b.x, b.y, b.r, s.mate.x, s.mate.y, s.catchR)) {
      // Koşunun ileri yarısında buluşan pas "nefis"tir.
      const dx = b.x - s.mate.x;
      const dy = b.y - s.mate.y;
      const close = Math.sqrt(dx * dx + dy * dy) < s.catchR * 0.6;
      b.vx = 0;
      b.vy = 0;
      b.x = s.mate.x;
      b.y = s.mate.y - s.mate.r;
      if (s.runP > 0.4 && close) finish(s, OUT_PASS_PERFECT, 1);
      else finish(s, OUT_PASS_OK, 0.72);
      return false;
    }
    if (b.x < -unit * 4 || b.x > w + unit * 4 || b.y < -unit * 4 || b.y > h + unit * 4) {
      finish(s, OUT_PASS_LONG, 0.15);
    }
    return false;
  }

  /* —— ÇALIM —— */
  const me = s.me;
  if (touch.down) {
    const k = Math.min(1, s.agility * dt);
    me.x += (touch.x - me.x) * k;
  }
  me.x = Math.max(me.r, Math.min(w - me.r, me.x));
  s.ball.x = me.x + Math.sin(s.t * 9) * unit * 1.6;
  s.ball.y = me.y - unit * 5.5;
  s.progress = Math.min(1, s.progress + dt / s.duration);

  // Savunmacılar dalga dalga yukarıdan gelir; sonuncusu çizgiden önce biter.
  const total = Math.round(s.runSpeed);
  s.spawnT -= dt;
  if (s.spawned < total && s.spawnT <= 0) {
    const gap = (s.duration * 0.78) / total;
    s.spawnT = gap * (0.75 + rand(s) * 0.5);
    const rival: Body = { x: 0, y: -unit * 6, vx: 0, vy: 0, r: unit * 4.4, a: 0, b: 0 };
    // İkisinden biri oyuncunun üstüne, diğeri rastgele bir şeride gelir.
    rival.x = rand(s) < 0.55 ? me.x + (rand(s) - 0.5) * w * 0.2 : w * (0.12 + rand(s) * 0.76);
    rival.x = Math.max(rival.r, Math.min(w - rival.r, rival.x));
    rival.vy = h * (0.52 + s.difficulty * 0.42 + rand(s) * 0.08);
    rival.a = w * (0.05 + s.difficulty * 0.2); // yana takip hızı
    s.rivals.push(rival);
    s.spawned += 1;
  }
  for (let i = s.rivals.length - 1; i >= 0; i -= 1) {
    const r = s.rivals[i];
    r.y += r.vy * dt;
    // Oyuncuyu geçene kadar hafifçe ona doğru kayar.
    if (r.y < me.y - unit * 10) r.x += Math.max(-r.a * dt, Math.min(r.a * dt, me.x - r.x));
    if (hits(me.x, me.y, me.r * s.grace * 0.8, r.x, r.y, r.r * 0.8)) {
      finish(s, OUT_TACKLED, 0.15 + s.progress * 0.5);
      return false;
    }
    if (r.y > h + unit * 8) s.rivals.splice(i, 1);
  }
  if (s.progress >= 1 && s.spawned >= total) finish(s, OUT_DRIBBLE_DONE, 1);
  return false;
}

/* ───────────────────────────── çizim (worklet) ───────────────────────────── */

function fill(color: string, alpha = 1) {
  "worklet";
  const paint = Skia.Paint();
  paint.setAntiAlias(true);
  paint.setColor(Skia.Color(color));
  if (alpha < 1) paint.setAlphaf(Math.max(0, alpha));
  return paint;
}

function stroke(color: string, width: number, alpha = 1) {
  "worklet";
  const paint = fill(color, alpha);
  paint.setStyle(PaintStyle.Stroke);
  paint.setStrokeWidth(width);
  paint.setStrokeCap(StrokeCap.Round);
  return paint;
}

function glow(color: string, sigma: number, alpha = 1) {
  "worklet";
  const paint = fill(color, alpha);
  paint.setMaskFilter(Skia.MaskFilter.MakeBlur(BlurStyle.Normal, sigma, true));
  return paint;
}

const INK = "#1B1446";
const SKINS = ["#F7D7B8", "#EBB894", "#C98D63", "#8D5A3B"];
const HAIRS = ["#2A1B12", "#6B4226", "#D9A441", "#1C1C1C"];

function rrect(x: number, y: number, w: number, h: number, r: number) {
  "worklet";
  return Skia.RRectXY(Skia.XYWHRect(x, y, w, h), r, r);
}

/**
 * Oyuncu: arcade oyunlarının iri kafalı çizgi film futbolcusu (lacivert
 * kontur, düz forma + parlama, beyaz şort, tozluk, pembe yanaklar).
 * Çarpışma dairesi (x, y, r) gövdenin ortasıdır; kafa yukarı taşar.
 * `pulse` (top sende): genişleyip sönen halka.
 */
function drawPlayer(canvas: SkCanvas, x: number, y0: number, r: number, color: string, halo: string, t: number, pulse: boolean, variant = 0, back = false) {
  "worklet";
  // Arkadan görünen (sen): figür topun gerisinde, kafa çarpışma noktasında.
  // Hafif zıplama (idle): her oyuncu kendi fazında.
  const hop = Math.abs(Math.sin(t * 5 + variant * 1.3)) * r * 0.1;
  const y = (back ? y0 + r * 1.05 : y0) - hop;
  const lw = Math.max(1.6, r * 0.13);
  const ink = stroke(INK, lw);
  canvas.drawOval(Skia.XYWHRect(x - r * 1.0, y + r * 0.78, r * 2.0, r * 0.5), fill("#000000", 0.25));
  const breathe = pulse ? 1 + Math.sin(t * 5) * 0.08 : 1;
  canvas.drawCircle(x, y, r * 1.25 * breathe, glow(halo, r * 0.7, 0.45));
  if (pulse) {
    const k = (t * 1.4) % 1;
    canvas.drawCircle(x, y + r * 0.2, r * (1.1 + k * 1.2), stroke(halo, r * 0.14 * (1 - k), 0.8 * (1 - k)));
  }
  // koşu adımı: bacaklar karşılıklı oynar
  const step = Math.sin(t * 9 + variant) * r * 0.08;
  for (let side = -1; side <= 1; side += 2) {
    const lx = x + side * r * 0.3 - r * 0.15;
    const ly = y + r * 0.35 + (side < 0 ? step : -step);
    const leg = rrect(lx, ly, r * 0.3, r * 0.55, r * 0.12);
    canvas.drawRRect(leg, fill("#FFFFFF"));
    canvas.drawRRect(rrect(lx, ly + r * 0.36, r * 0.3, r * 0.2, r * 0.1), fill(INK));
    canvas.drawRRect(leg, ink);
  }
  // şort
  const shorts = rrect(x - r * 0.62, y + r * 0.08, r * 1.24, r * 0.45, r * 0.16);
  canvas.drawRRect(shorts, fill("#FFFFFF"));
  canvas.drawRRect(shorts, ink);
  // kollar (ten) + forma gövdesi
  for (let side = -1; side <= 1; side += 2) {
    const ax = x + side * r * 0.78;
    canvas.drawCircle(ax, y + r * 0.08, r * 0.17, fill(SKINS[variant % SKINS.length]));
    canvas.drawCircle(ax, y + r * 0.08, r * 0.17, ink);
    canvas.drawCircle(x + side * r * 0.62, y - r * 0.28, r * 0.24, fill(color));
    canvas.drawCircle(x + side * r * 0.62, y - r * 0.28, r * 0.24, ink);
  }
  const shirt = rrect(x - r * 0.66, y - r * 0.52, r * 1.32, r * 0.82, r * 0.26);
  canvas.drawRRect(shirt, fill(color));
  canvas.drawRRect(rrect(x - r * 0.5, y - r * 0.44, r * 0.22, r * 0.5, r * 0.11), fill("#FFFFFF", 0.4));
  canvas.drawRRect(shirt, ink);
  // iri kafa
  const hy = y - r * 1.05;
  const hr = r * 0.74;
  const skin = SKINS[variant % SKINS.length];
  canvas.drawCircle(x - hr * 0.98, hy + hr * 0.1, hr * 0.2, fill(skin));
  canvas.drawCircle(x - hr * 0.98, hy + hr * 0.1, hr * 0.2, ink);
  canvas.drawCircle(x + hr * 0.98, hy + hr * 0.1, hr * 0.2, fill(skin));
  canvas.drawCircle(x + hr * 0.98, hy + hr * 0.1, hr * 0.2, ink);
  canvas.drawCircle(x, hy, hr, fill(skin));
  // saç: üst yarım daire + kakül
  const hair = Skia.Path.Make();
  hair.addArc(Skia.XYWHRect(x - hr, hy - hr, hr * 2, hr * 2), 180, 180);
  hair.lineTo(x + hr * 0.95, hy - hr * 0.1);
  hair.quadTo(x + hr * 0.2, hy - hr * 0.55, x - hr * 0.95, hy - hr * 0.05);
  hair.close();
  canvas.drawPath(hair, fill(HAIRS[(variant * 3 + 1) % HAIRS.length]));
  if (back) {
    // ense: saç başın tamamını örter, altta ten rengi boyun şeridi
    canvas.drawCircle(x, hy - hr * 0.06, hr * 0.94, fill(HAIRS[(variant * 3 + 1) % HAIRS.length]));
    canvas.drawCircle(x, hy, hr, ink);
    canvas.drawOval(Skia.XYWHRect(x - hr * 0.62, hy - hr * 0.72, hr * 0.42, hr * 0.22), fill("#FFFFFF", 0.3));
    return;
  }
  canvas.drawCircle(x, hy, hr, ink);
  // yüz: iri gözler (parıltılı), pembe yanaklar, gülümseme
  for (let side = -1; side <= 1; side += 2) {
    const ex = x + side * hr * 0.36;
    canvas.drawOval(Skia.XYWHRect(ex - hr * 0.12, hy + hr * 0.02, hr * 0.24, hr * 0.32), fill(INK));
    canvas.drawCircle(ex + hr * 0.04, hy + hr * 0.1, hr * 0.06, fill("#FFFFFF"));
    canvas.drawOval(Skia.XYWHRect(x + side * hr * 0.62 - hr * 0.15, hy + hr * 0.34, hr * 0.3, hr * 0.18), fill("#FF6B81", 0.6));
  }
  const smile = Skia.Path.Make();
  smile.moveTo(x - hr * 0.2, hy + hr * 0.5);
  smile.quadTo(x, hy + hr * 0.68, x + hr * 0.2, hy + hr * 0.5);
  canvas.drawPath(smile, stroke(INK, Math.max(1.2, lw * 0.75)));
  canvas.drawOval(Skia.XYWHRect(x - hr * 0.62, hy - hr * 0.72, hr * 0.42, hr * 0.22), fill("#FFFFFF", 0.35));
}

/** Zemin: gökyüzü, şeritli çim, çizgiler, köşelerde karartma. */
function drawPitch(canvas: SkCanvas, s: MomentState, pal: KariyerPalette) {
  "worklet";
  const w = s.w;
  const h = s.h;
  const sky = Skia.Paint();
  sky.setShader(
    Skia.Shader.MakeLinearGradient({ x: 0, y: 0 }, { x: 0, y: h * 0.5 }, [Skia.Color(pal.sky[0]), Skia.Color(pal.sky[1])], null, TileMode.Clamp),
  );
  canvas.drawRect(Skia.XYWHRect(0, 0, w, h), sky);
  // uzak tribün: kalabalığın flaşları ve iki projektör parlaması
  for (let i = 0; i < 28; i += 1) {
    const fx = ((i * 37) % 100) / 100 * w;
    const fy = h * (0.02 + ((i * 13) % 10) / 100);
    const tw = 0.35 + 0.35 * Math.sin(s.t * 3 + i * 1.7);
    canvas.drawCircle(fx, fy, w * 0.006, fill("#FFFFFF", tw));
  }
  canvas.drawCircle(w * 0.08, h * 0.015, w * 0.12, glow("#FFF6D8", w * 0.06, 0.55));
  canvas.drawCircle(w * 0.92, h * 0.015, w * 0.12, glow("#FFF6D8", w * 0.06, 0.55));

  // Çim: çalımda şeritler aşağı akar (koşu hissi).
  const top = s.kind === KIND_SHOT ? s.goalY - h * 0.02 : 0;
  const stripes = 9;
  const band = (h - top) / stripes;
  const scroll = s.kind === KIND_DRIBBLE ? (s.t * h * 0.55) % (band * 2) : 0;
  canvas.save();
  canvas.clipRect(Skia.XYWHRect(0, top, w, h - top), 1, true);
  for (let i = -2; i < stripes + 2; i += 1) {
    const y = top + i * band + scroll;
    canvas.drawRect(Skia.XYWHRect(0, y, w, band + 1), fill(pal.pitch[(i + 400) % 2]));
    // dama biçme: yarım sütunlarda hafif koyulaşma
    for (let c = 0; c < 6; c += 2) canvas.drawRect(Skia.XYWHRect((w / 6) * c, y, w / 6, band + 1), fill("#000000", 0.035));
  }
  // projektör ışığı: sahanın ortasına düşen yumuşak aydınlık
  const spot = Skia.Paint();
  spot.setShader(
    Skia.Shader.MakeRadialGradient({ x: w / 2, y: h * 0.45 }, h * 0.6, [Skia.Color("#FFFFFF2E"), Skia.Color("#FFFFFF00")], [0, 1], TileMode.Clamp),
  );
  canvas.drawRect(Skia.XYWHRect(0, top, w, h - top), spot);
  canvas.restore();

  const line = stroke(pal.line, Math.max(1.5, w * 0.006), 0.7);
  if (s.kind === KIND_SHOT) {
    // Ceza sahası ve kale.
    const boxW = w * 0.78;
    canvas.drawRect(Skia.XYWHRect((w - boxW) / 2, s.goalY, boxW, h * 0.3), line);
    canvas.drawRect(Skia.XYWHRect(s.goalX - s.goalHalf * 0.75, s.goalY, s.goalHalf * 1.5, h * 0.11), line);
    canvas.drawCircle(w / 2, s.goalY + h * 0.22, w * 0.008, fill(pal.line, 0.8));
    const depth = h * 0.07;
    const net = Skia.XYWHRect(s.goalX - s.goalHalf, s.goalY - depth, s.goalHalf * 2, depth);
    canvas.drawRect(net, fill("#000000", 0.28));
    const mesh = stroke(pal.net, Math.max(1, w * 0.002), 0.35);
    for (let i = 1; i < 12; i += 1) {
      const x = s.goalX - s.goalHalf + ((s.goalHalf * 2) / 12) * i;
      canvas.drawLine(x, s.goalY - depth, x, s.goalY, mesh);
    }
    for (let i = 1; i < 4; i += 1) canvas.drawLine(s.goalX - s.goalHalf, s.goalY - (depth / 4) * i, s.goalX + s.goalHalf, s.goalY - (depth / 4) * i, mesh);
    const pw = Math.max(3, w * 0.014);
    const postInk = stroke(INK, pw + Math.max(3, w * 0.008));
    canvas.drawLine(s.goalX - s.goalHalf, s.goalY, s.goalX - s.goalHalf, s.goalY - depth, postInk);
    canvas.drawLine(s.goalX + s.goalHalf, s.goalY, s.goalX + s.goalHalf, s.goalY - depth, postInk);
    canvas.drawLine(s.goalX - s.goalHalf, s.goalY - depth, s.goalX + s.goalHalf, s.goalY - depth, postInk);
    const post = stroke(pal.post, pw);
    canvas.drawLine(s.goalX - s.goalHalf, s.goalY, s.goalX - s.goalHalf, s.goalY - depth, post);
    canvas.drawLine(s.goalX + s.goalHalf, s.goalY, s.goalX + s.goalHalf, s.goalY - depth, post);
    canvas.drawLine(s.goalX - s.goalHalf, s.goalY - depth, s.goalX + s.goalHalf, s.goalY - depth, post);
  } else if (s.kind === KIND_PASS) {
    canvas.drawLine(0, h * 0.5, w, h * 0.5, line);
    canvas.drawCircle(w / 2, h * 0.5, w * 0.16, line);
  } else {
    // Çalım: hedef çizgisi yaklaşır.
    const y = h * 0.12 + (1 - s.progress) * -h * 0.6;
    if (y > -h * 0.05) {
      const dash = stroke(pal.good, Math.max(3, w * 0.014), 0.9);
      dash.setPathEffect(Skia.PathEffect.MakeDash([w * 0.05, w * 0.03], s.t * 40));
      canvas.drawLine(0, y, w, y, dash);
    }
    canvas.drawLine(w * 0.02, 0, w * 0.02, h, line);
    canvas.drawLine(w * 0.98, 0, w * 0.98, h, line);
  }
}

/** Nişan: parmak çekilirken topun gideceği yön (kesikli) ve güç. */
function drawAim(canvas: SkCanvas, s: MomentState, touch: TouchInput, pal: KariyerPalette) {
  "worklet";
  if (s.phase !== PHASE_READY || !touch.down || s.kind === KIND_DRIBBLE) return;
  const dx = touch.x - touch.sx;
  const dy = touch.y - touch.sy;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < s.w * 0.04 || dy >= 0) return;
  const strength = s.kind === KIND_SHOT ? Math.max(0.45, Math.min(1, len / (s.h * 0.32))) : 1;
  const reach = s.h * (s.kind === KIND_SHOT ? 0.22 + strength * 0.4 : 0.5);
  const ux = dx / len;
  const uy = dy / len;
  const path = Skia.Path.Make();
  path.moveTo(s.ball.x, s.ball.y);
  path.lineTo(s.ball.x + ux * reach, s.ball.y + uy * reach);
  const dash = stroke(pal.aim, Math.max(2.5, s.w * 0.011), 0.9);
  dash.setPathEffect(Skia.PathEffect.MakeDash([s.w * 0.03, s.w * 0.025], -s.t * 60));
  canvas.drawPath(path, dash);
  canvas.drawCircle(s.ball.x + ux * reach, s.ball.y + uy * reach, s.w * 0.02, fill(pal.aim, 0.9));
  // Güç halkası (şutta dolar).
  if (s.kind === KIND_SHOT) {
    const ring = stroke(strength > 0.92 ? pal.bad : pal.good, Math.max(3, s.w * 0.012), 0.95);
    const arc = Skia.Path.Make();
    arc.addArc(Skia.XYWHRect(s.ball.x - s.w * 0.07, s.ball.y - s.w * 0.07, s.w * 0.14, s.w * 0.14), -90, 360 * strength);
    canvas.drawPath(arc, ring);
  }
}

export function drawMoment(canvas: SkCanvas, s: MomentState, touch: TouchInput, pal: KariyerPalette) {
  "worklet";
  const w = s.w;
  const h = s.h;
  const unit = w / 100;

  canvas.save();
  if (s.shake > 0) {
    const amp = s.shake * s.shake * unit * 2.2;
    canvas.translate(Math.sin(s.t * 71) * amp, Math.cos(s.t * 53) * amp);
  }

  drawPitch(canvas, s, pal);

  // PAS: arkadaşın koşu yolu ve yakalama alanı.
  if (s.kind === KIND_PASS) {
    const route = stroke(pal.mate, Math.max(2, w * 0.008), 0.45);
    route.setPathEffect(Skia.PathEffect.MakeDash([w * 0.025, w * 0.025], -s.t * 30));
    canvas.drawLine(s.mate.x, s.mate.y, s.runX1, s.runY1, route);
    canvas.drawCircle(s.runX1, s.runY1, unit * 2, fill(pal.mate, 0.5));
    canvas.drawCircle(s.mate.x, s.mate.y, s.catchR * (1 + Math.sin(s.t * 6) * 0.06), stroke(pal.mate, Math.max(1.5, w * 0.006), 0.6));
  }

  // Rakipler.
  for (let i = 0; i < s.rivals.length; i += 1) {
    const r = s.rivals[i];
    drawPlayer(canvas, r.x, r.y, r.r, pal.rival, pal.rivalGlow, s.t + i, false, i + 1);
  }

  if (s.kind === KIND_SHOT) {
    const k = s.keeper;
    // Kalecinin uzanma alanı: zemin üstünde soluk bir bant.
    canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(k.x - k.b, k.y - k.r * 0.4, k.b * 2, k.r * 0.8), k.r * 0.4, k.r * 0.4), fill(pal.keeper, 0.25));
    drawPlayer(canvas, k.x, k.y, k.r, pal.keeper, pal.keeper, s.t, false, 2);
  }
  if (s.kind === KIND_PASS) drawPlayer(canvas, s.mate.x, s.mate.y, s.mate.r, pal.mate, pal.mate, s.t, true, 3);
  drawPlayer(canvas, s.me.x, s.me.y, s.me.r, pal.me, pal.meGlow, s.t, s.phase === PHASE_READY, 0, true);

  // Top izi: eskiden yeniye kalınlaşan parlak şerit.
  const n = s.trail.length / 2;
  for (let i = 1; i < n; i += 1) {
    const k = i / n;
    canvas.drawLine(s.trail[(i - 1) * 2], s.trail[(i - 1) * 2 + 1], s.trail[i * 2], s.trail[i * 2 + 1], stroke(pal.trail, s.ball.r * 1.6 * k, k * 0.7));
  }

  drawAim(canvas, s, touch, pal);

  // Top.
  const b = s.ball;
  canvas.drawOval(Skia.XYWHRect(b.x - b.r * 0.9, b.y + b.r * 0.7, b.r * 1.8, b.r * 0.5), fill("#000000", 0.25));
  canvas.drawCircle(b.x, b.y, b.r * 1.6, glow(pal.trail, b.r * 0.9, 0.6));
  const ballPaint = Skia.Paint();
  ballPaint.setAntiAlias(true);
  ballPaint.setShader(
    Skia.Shader.MakeRadialGradient({ x: b.x - b.r * 0.35, y: b.y - b.r * 0.4 }, b.r * 1.5, [Skia.Color("#FFFFFF"), Skia.Color(pal.ball), Skia.Color("#B8C2D3")], [0, 0.55, 1], TileMode.Clamp),
  );
  canvas.drawCircle(b.x, b.y, b.r, ballPaint);
  // dönen beşgenler (top yuvarlanıyor)
  canvas.save();
  canvas.clipRRect(Skia.RRectXY(Skia.XYWHRect(b.x - b.r, b.y - b.r, b.r * 2, b.r * 2), b.r, b.r), 1, true);
  for (let i = 0; i < 4; i += 1) {
    const a = s.t * 7 + (i * Math.PI) / 2;
    canvas.drawCircle(b.x + Math.cos(a) * b.r * 0.62, b.y + Math.sin(a * 0.8) * b.r * 0.5, b.r * 0.26, fill("#1B1B2F", 0.85));
  }
  canvas.drawCircle(b.x + Math.cos(s.t * 3) * b.r * 0.1, b.y, b.r * 0.24, fill("#1B1B2F", 0.85));
  canvas.restore();
  canvas.drawCircle(b.x - b.r * 0.35, b.y - b.r * 0.4, b.r * 0.28, fill("#FFFFFF", 0.7));
  canvas.drawCircle(b.x, b.y, b.r, stroke(INK, Math.max(1.5, b.r * 0.16)));

  // Parçacıklar (konfeti): dönen küçük dikdörtgenler.
  for (let i = 0; i < s.particles.length; i += 1) {
    const p = s.particles[i];
    const alpha = Math.min(1, (p.life / p.max) * 1.6);
    canvas.save();
    canvas.rotate((p.spin * (p.max - p.life) * 180) / Math.PI, p.x, p.y);
    const col = pal.confetti[p.color % pal.confetti.length];
    if (i % 3 === 0) {
      // yıldız kıvılcımı (parlak)
      const star = Skia.Path.Make();
      for (let k = 0; k < 10; k += 1) {
        const rr = k % 2 ? p.size * 0.6 : p.size * 1.5;
        const aa = (k * Math.PI) / 5 - Math.PI / 2;
        if (k === 0) star.moveTo(p.x + Math.cos(aa) * rr, p.y + Math.sin(aa) * rr);
        else star.lineTo(p.x + Math.cos(aa) * rr, p.y + Math.sin(aa) * rr);
      }
      star.close();
      canvas.drawPath(star, glow(col, p.size * 0.6, alpha));
      canvas.drawPath(star, fill(col, alpha));
    } else canvas.drawRect(Skia.XYWHRect(p.x - p.size, p.y - p.size * 0.5, p.size * 2, p.size), fill(col, alpha));
    canvas.restore();
  }

  canvas.restore();

  // Üst kenarda süre / ilerleme çubuğu.
  const barW = w * 0.9;
  const barX = (w - barW) / 2;
  const barY = h * 0.022;
  const ratio = s.kind === KIND_DRIBBLE ? s.progress : Math.max(0, s.clock / s.clockMax);
  canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(barX, barY, barW, unit * 1.6), unit, unit), fill("#000000", 0.3));
  const urgent = s.kind !== KIND_DRIBBLE && ratio < 0.3;
  canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(barX, barY, barW * ratio, unit * 1.6), unit, unit), fill(urgent ? pal.bad : pal.good, 0.95));

  // Kenar karartması ve sonuç parlaması.
  const vignette = Skia.Paint();
  vignette.setShader(
    Skia.Shader.MakeRadialGradient({ x: w / 2, y: h / 2 }, h * 0.75, [Skia.Color("#00000000"), Skia.Color("#00000066")], [0.6, 1], TileMode.Clamp),
  );
  canvas.drawRect(Skia.XYWHRect(0, 0, w, h), vignette);
  if (s.flash > 0) canvas.drawRect(Skia.XYWHRect(0, 0, w, h), fill("#FFFFFF", s.flash * 0.55));
}
