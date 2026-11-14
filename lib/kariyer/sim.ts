/**
 * KARİYER YOLU — OYUN MOTORU (Skia + Reanimated).
 *
 * NE: maçın "an"larını oynatan küçük 2D motor. Üç parça:
 *   createMoment   anın başlangıç durumunu kurar (JS; tohumlu, belirlenimci)
 *   stepMoment     durumu `dt` kadar ilerletir (worklet; arayüz iş parçacığı)
 *   drawMoment     durumu bir Skia tuvaline çizer (worklet; anlık çizim)
 *
 * 2026-11 YENİLEMESİ: altı an türü (şut · pas · çalım · penaltı · frikik ·
 * kafa) ve engeller (rüzgâr, çamur, kayan müdahale, ofsayt çizgisi, hareketli
 * baraj, yağmur, usta kaleci). Sahne: tribün + kalabalık + projektör, biçilmiş
 * çim, üç boyutlu kale ağı, konturlu oyuncular, top gölgesi ve yüksekliği.
 *
 * NEDEN ANLIK ÇİZİM (Picture): sahnedeki nesne sayısı an be an değişir
 * (parçacıklar, savunmacılar, top izi). Bütün sahne tek bir worklet'te, her
 * karede bir SkPicture'a kaydedilir ve React hiç yeniden çizmez. Parmak
 * hareketi ve fizik arayüz iş parçacığında kalır; JS meşgulken bile oyun akar.
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

import { MOD_ACE, MOD_MUD, MOD_OFFSIDE, MOD_RAIN, MOD_SLIDE, MOD_WALLMOVE, type Attrs, type MomentDef } from "./levels";
import type { KariyerPalette } from "./palette";

/* ───────────────────────────── tipler ───────────────────────────── */

export const KIND_SHOT = 0;
export const KIND_PASS = 1;
export const KIND_DRIBBLE = 2;
export const KIND_PENALTY = 3;
export const KIND_FREEKICK = 4;
export const KIND_HEADER = 5;

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
export const OUT_HEADER_EARLY = 12;
export const OUT_HEADER_LATE = 13;
export const OUT_OFFSIDE = 14;
export const OUT_WALL = 15;
export const OUT_POST = 16;

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
  [OUT_HEADER_EARLY]: { title: "Erken yükseldin", tone: "bad" },
  [OUT_HEADER_LATE]: { title: "Topu kaçırdın", tone: "bad" },
  [OUT_OFFSIDE]: { title: "Ofsayt!", tone: "bad" },
  [OUT_WALL]: { title: "Baraja takıldı", tone: "bad" },
  [OUT_POST]: { title: "Direkten döndü!", tone: "ok" },
};

export interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  /** Serbest alanlar: an türüne göre (devriye sınırı, takip hızı, sayaç, bayrak). */
  a: number;
  b: number;
  c: number;
  d: number;
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
  mods: number;
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
  /** Topun yerden yüksekliği (0–1): gölge ve ölçek için. */
  z: number;
  me: Body;
  mate: Body;
  keeper: Body;
  rivals: Body[];
  /** Top izi: x,y çiftleri (en yeni sonda). */
  trail: number[];
  particles: Particle[];
  /** Tribün kalabalığı: x, y, renk üçlüleri. */
  crowd: number[];
  /** Çamur birikintileri (çalım): x, y, yarıçap üçlüleri. */
  mud: number[];
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
  /** Ofsayt çizgisi (pas); yoksa −1. */
  offsideY: number;
  /** Çalım: ilerleme (0–1), süre, savunmacı sayısı. */
  progress: number;
  duration: number;
  spawnT: number;
  spawned: number;
  total: number;
  /** Kafa: orta topunun eğrisi (başlangıç, kontrol, bitiş) ve ilerlemesi. */
  crossX0: number;
  crossY0: number;
  crossCX: number;
  crossCY: number;
  crossX1: number;
  crossY1: number;
  crossP: number;
  crossDur: number;
  /** Kafa: zamanlama penceresi (p = 1 ± win). */
  win: number;
  /** Penaltı: kalecinin atlayacağı x ve şutu okuyup okumadığı. */
  keeperGuess: number;
  keeperRead: number;
  /** Frikik: baraj merkezi ve kayma genliği. */
  wallX: number;
  wallAmp: number;
  /** Rüzgâr ve kavis ivmesi (px/sn²). */
  windX: number;
  curlX: number;
  curlY: number;
  /** Özelliklerden türeyen fizik katsayıları. */
  power: number; // şut / pas hızı
  catchR: number; // pas yakalama yarıçapı
  agility: number; // çalımda parmağı izleme hızı
  grace: number; // çalımda çarpışma payı (küçük = affedici)
  difficulty: number;
  seed: number;
  lastUp: number;
  lastTap: number;
}

/** Parmak girdisi (JS'ten yazılır, worklet okur). */
export interface TouchInput {
  down: boolean;
  x: number;
  y: number;
  sx: number;
  sy: number;
  /** Çekiş yolunun kirişten en uzak noktası (frikik kavisi). */
  bx: number;
  by: number;
  /** Her bırakışta bir artar. */
  up: number;
  /** Her dokunuşta bir artar (kafa zamanlaması). */
  taps: number;
}

export const emptyTouch = (): TouchInput => ({ down: false, x: 0, y: 0, sx: 0, sy: 0, bx: 0, by: 0, up: 0, taps: 0 });

/** Kirişe (s → e) göre p noktasının işaretli dik uzaklığı. */
export function perpDistance(sx: number, sy: number, ex: number, ey: number, px: number, py: number): number {
  "worklet";
  const dx = ex - sx;
  const dy = ey - sy;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1) return 0;
  return ((px - sx) * dy - (py - sy) * dx) / len;
}

const body = (x = 0, y = 0, r = 0): Body => ({ x, y, vx: 0, vy: 0, r, a: 0, b: 0, c: 0, d: 0 });

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

const KIND_CODE: Record<MomentDef["kind"], number> = {
  shot: KIND_SHOT,
  pass: KIND_PASS,
  dribble: KIND_DRIBBLE,
  penalty: KIND_PENALTY,
  freekick: KIND_FREEKICK,
  header: KIND_HEADER,
};

/** Kale önü anları (tribün + kale çizilir). */
export const isGoalKind = (kind: number) => kind === KIND_SHOT || kind === KIND_PENALTY || kind === KIND_FREEKICK || kind === KIND_HEADER;

/* ───────────────────────────── kurulum (JS) ───────────────────────────── */

export function createMoment(def: MomentDef, attrs: Attrs, w: number, h: number): MomentState {
  const rnd = rng(def.seed);
  const d = def.difficulty;
  const mods = def.mods ?? 0;
  const a = (key: keyof Attrs) => Math.max(0, Math.min(1, attrs[key] / 99));
  const unit = w / 100;
  const kind = KIND_CODE[def.kind] ?? KIND_SHOT;
  const ace = mods & MOD_ACE ? 1 : 0;
  const rain = mods & MOD_RAIN ? 1 : 0;

  const s: MomentState = {
    kind,
    mods,
    w,
    h,
    t: 0,
    phase: PHASE_READY,
    resultT: 0,
    outcome: OUT_NONE,
    score: 0,
    clock: 7 - d * 2.5,
    clockMax: 7 - d * 2.5,
    ball: body(w / 2, h * 0.8, unit * 2.7),
    z: 0,
    me: body(w / 2, h * 0.84, unit * 4.6),
    mate: body(-999, -999, unit * 4.4),
    keeper: body(-999, -999, unit * 4.8),
    rivals: [],
    trail: [],
    particles: [],
    crowd: [],
    mud: [],
    shake: 0,
    flash: 0,
    goalX: w / 2,
    goalY: h * 0.19,
    goalHalf: w * (0.3 - d * 0.06),
    runX0: 0,
    runY0: 0,
    runX1: 0,
    runY1: 0,
    runP: 0,
    runSpeed: 0,
    offsideY: -1,
    progress: 0,
    duration: 1,
    spawnT: 0,
    spawned: 0,
    total: 0,
    crossX0: 0,
    crossY0: 0,
    crossCX: 0,
    crossCY: 0,
    crossX1: 0,
    crossY1: 0,
    crossP: 0,
    crossDur: 1,
    win: 0.12,
    keeperGuess: w / 2,
    keeperRead: 0,
    wallX: w / 2,
    wallAmp: 0,
    windX: (def.wind ?? 0) * w * 0.32,
    curlX: 0,
    curlY: 0,
    power: 1,
    catchR: unit * 8,
    agility: 1,
    grace: 1,
    difficulty: d,
    seed: def.seed,
    lastUp: -1,
    lastTap: -1,
  };

  // Tribün kalabalığı (kale önü anlarda tribün görünür): belirlenimci desen.
  if (isGoalKind(kind)) {
    const rows = 4;
    for (let row = 0; row < rows; row += 1) {
      const step = unit * (3.2 + row * 0.2);
      for (let x = (row % 2) * step * 0.5; x < w + step; x += step) {
        s.crowd.push(x + (rnd() - 0.5) * unit, row, Math.floor(rnd() * 7));
      }
    }
  }

  // Kaleci: devriye hızı ve uzanma payı zorlukla artar, şut özelliğiyle azalır.
  const setupKeeper = () => {
    s.keeper.x = s.goalX;
    s.keeper.y = s.goalY + unit * 5;
    s.keeper.vx = (rnd() < 0.5 ? -1 : 1) * w * (0.16 + d * 0.3);
    s.keeper.a = w * (0.34 + d * 0.4) * (ace ? 1.25 : 1); // topa atılma hızı
    s.keeper.b = unit * (7.5 + d * 3.5 - a("sut") * 3) * (ace ? 1.15 : 1); // uzanma yarıçapı
  };

  if (kind === KIND_SHOT) {
    s.ball.x = w * (0.3 + rnd() * 0.4);
    s.ball.y = h * (0.72 + rnd() * 0.06);
    s.me.x = s.ball.x - unit * 2;
    s.me.y = s.ball.y + unit * 7;
    s.power = h * (1.15 + a("sut") * 0.75);
    setupKeeper();
    for (let i = 0; i < def.rivals; i += 1) {
      const rival = body(w * (0.3 + rnd() * 0.4), h * (0.38 + i * 0.1 + rnd() * 0.04), unit * 4.6);
      rival.vx = (rnd() < 0.5 ? -1 : 1) * w * (0.12 + d * 0.22 + rnd() * 0.05);
      rival.a = w * 0.16;
      rival.b = w * 0.84;
      s.rivals.push(rival);
    }
  } else if (kind === KIND_PENALTY) {
    s.goalHalf = w * (0.34 - d * 0.04);
    s.goalY = h * 0.21;
    s.ball.x = w / 2;
    s.ball.y = s.goalY + h * 0.4;
    s.me.x = s.ball.x - unit * 3;
    s.me.y = s.ball.y + unit * 9;
    s.power = h * (1.25 + a("sut") * 0.7);
    s.clock = 6;
    s.clockMax = 6;
    setupKeeper();
    s.keeper.vx = w * 0.05; // çizgide hafif kıpırdanma
    s.keeper.a = w * (0.5 + d * 0.55) * (ace ? 1.25 : 1); // atlayış hızı
    s.keeper.b = unit * (8 + d * 3 - a("sut") * 2) * (ace ? 1.15 : 1);
    const side = Math.floor(rnd() * 3) - 1;
    s.keeperGuess = s.goalX + side * s.goalHalf * 0.62;
    s.keeperRead = rnd() < 0.12 + d * 0.4 + ace * 0.2 ? 1 : 0;
  } else if (kind === KIND_FREEKICK) {
    s.ball.x = w * (0.3 + rnd() * 0.4);
    s.ball.y = h * (0.66 + rnd() * 0.05);
    s.me.x = s.ball.x - unit * 3;
    s.me.y = s.ball.y + unit * 8;
    s.power = h * (1.05 + a("sut") * 0.6);
    s.goalHalf = w * (0.33 - d * 0.05);
    setupKeeper();
    // Baraj: topla kale ortası arasındaki yolun yarısında, yakın direğe
    // kaydırılmış — uzak köşe açık kalır, kavis kaleciyi ters köşeye yatırır.
    const wy = s.ball.y + (s.goalY - s.ball.y) * 0.5;
    const k = (wy - s.ball.y) / (s.goalY - s.ball.y);
    s.wallX = s.ball.x + (s.goalX - s.ball.x) * k + (s.ball.x < w / 2 ? -1 : 1) * unit * 4;
    s.wallAmp = mods & MOD_WALLMOVE ? w * (0.08 + d * 0.06) : 0;
    // Kavisli top kalecinin tahminini şaşırtır: frikikte biraz daha geç tepki.
    s.keeper.a *= 0.85;
    const n = Math.max(2, def.rivals);
    for (let i = 0; i < n; i += 1) {
      const rival = body(0, wy, unit * 3.8);
      rival.a = (i - (n - 1) / 2) * unit * 6.2; // barajdaki ofset
      rival.x = s.wallX + rival.a;
      rival.d = 2; // baraj oyuncusu
      s.rivals.push(rival);
    }
  } else if (kind === KIND_HEADER) {
    s.goalY = h * 0.18;
    s.me.x = w * (0.38 + rnd() * 0.24);
    s.me.y = h * 0.5;
    s.power = h * (1.2 + a("sut") * 0.5);
    setupKeeper();
    s.keeper.y = s.goalY + unit * 5;
    // Kafa topu yakın mesafeden gelir: kaleci daha geç tepki verir.
    s.keeper.a *= 0.72;
    s.keeper.b *= 0.9;
    const fromLeft = rnd() < 0.5;
    s.crossX0 = fromLeft ? w * 0.03 : w * 0.97;
    s.crossY0 = s.goalY + h * 0.04;
    s.crossX1 = s.me.x;
    s.crossY1 = s.me.y - s.me.r * 1.6;
    s.crossCX = (s.crossX0 + s.crossX1) / 2;
    s.crossCY = Math.min(s.crossY0, s.crossY1) - h * 0.22;
    s.crossDur = Math.max(0.95, 1.55 - d * 0.5);
    s.win = Math.max(0.07, 0.15 - d * 0.06 + a("teknik") * 0.04);
    s.ball.x = s.crossX0;
    s.ball.y = s.crossY0;
    s.clock = s.crossDur * (1 + s.win);
    s.clockMax = s.clock;
    for (let i = 0; i < def.rivals; i += 1) {
      // Markajdaki stoper: kafa yolunu kesebilir.
      const rival = body(s.me.x + (rnd() < 0.5 ? -1 : 1) * unit * 9, s.me.y - unit * 9, unit * 4.6);
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
    s.power = h * (0.78 + a("pas") * 0.4) * (rain ? 1.06 : 1);
    s.catchR = unit * (6.5 + a("pas") * 4.5 - d * 1.5);
    s.clock = 1 / s.runSpeed;
    s.clockMax = s.clock;
    if (mods & MOD_OFFSIDE) s.offsideY = s.runY0 + (s.runY1 - s.runY0) * (0.5 + rnd() * 0.12);
    for (let i = 0; i < def.rivals; i += 1) {
      const rival = body(w * (0.2 + rnd() * 0.6), h * (0.34 + i * 0.12 + rnd() * 0.04), unit * 4.6);
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
    s.agility = (7 + a("hiz") * 9) * (rain ? 0.85 : 1);
    s.grace = 1 - a("teknik") * 0.28;
    s.spawnT = 0.5;
    s.total = def.rivals;
    s.clock = s.duration;
    s.clockMax = s.duration;
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
  for (let i = 0; i < count && s.particles.length < 180; i += 1) {
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
    burst(s, x, y, outcome === OUT_GOAL ? 120 : 90, s.h * 0.95, 6, outcome !== OUT_GOAL);
  } else if (outcome === OUT_PASS_OK || outcome === OUT_SAVED || outcome === OUT_POST) {
    burst(s, s.ball.x, s.ball.y, 18, s.h * 0.35, 6, false);
    s.shake = outcome === OUT_POST ? 0.8 : 0.4;
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

/** Topu `dt` ilerletir: rüzgâr + kavis ivmesi, sürtünme, iz. */
function flyBall(s: MomentState, dt: number, drag: number) {
  "worklet";
  const b = s.ball;
  b.vx += (s.windX + s.curlX) * dt;
  b.vy += s.curlY * dt;
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  const k = 1 - drag * dt;
  b.vx *= k;
  b.vy *= k;
  // Kavis zamanla söner (top dönüşünü kaybeder).
  s.curlX *= 1 - 0.9 * dt;
  s.curlY *= 1 - 0.9 * dt;
  s.trail.push(b.x, b.y);
  if (s.trail.length > 30) s.trail.splice(0, 2);
}

/** Kaleci uçuştaki topa (ya da penaltıda tahminine) atılır. */
function keeperTrack(s: MomentState, dt: number, guess: boolean) {
  "worklet";
  const k = s.keeper;
  const b = s.ball;
  const timeToLine = b.vy < 0 ? (s.goalY - b.y) / b.vy : 0;
  const predicted = b.x + b.vx * Math.max(0, timeToLine) + 0.5 * s.windX * timeToLine * timeToLine * 0.6;
  const lim = s.goalHalf - k.r * 0.4;
  const aim = guess ? s.keeperGuess : predicted;
  const target = Math.max(s.goalX - lim, Math.min(s.goalX + lim, aim));
  const step = k.a * dt;
  if (Math.abs(target - k.x) <= step) k.x = target;
  else k.x += target > k.x ? step : -step;
  // Atlayış göstergesi: hız yönü çizimde gövdeyi yatırır.
  k.c = target - k.x;
}

/** Top kale çizgisine vardı mı: gol / kurtarış / direk / dışarı. */
function goalCheck(s: MomentState): boolean {
  "worklet";
  const b = s.ball;
  const k = s.keeper;
  const unit = s.w / 100;
  if (b.y > s.goalY) return false;
  const off = Math.abs(b.x - s.goalX);
  if (Math.abs(off - s.goalHalf) < b.r * 1.05) {
    b.vx *= -0.5;
    b.vy = Math.abs(b.vy) * 0.45;
    finish(s, OUT_POST, 0.3);
    return true;
  }
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
  return true;
}

/** Kavis: yolun büküldüğü yana açılma payı ve geri çeken ivme katsayısı. */
const CURL_TURN = 0.55;
const CURL_PULL = 1.5;

/** Çekişten şut: yön + güç (+ frikikte kavis). Şut çekildiyse true. */
function release(s: MomentState, touch: TouchInput, curl: boolean): boolean {
  "worklet";
  const unit = s.w / 100;
  const dx = touch.x - touch.sx;
  const dy = touch.y - touch.sy;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len <= unit * 6 || dy >= -unit * 3) return false;
  const strength = Math.max(0.45, Math.min(1, len / (s.h * 0.32)));
  let ux = dx / len;
  let uy = dy / len;
  if (curl) {
    // Kavis: yol kirişin hangi yanına bükülmüşse top önce o yana açılır, sonra
    // geri döner — parmağın çizdiği eğri sahada tekrarlanır.
    const dev = perpDistance(touch.sx, touch.sy, touch.x, touch.y, touch.bx, touch.by);
    // dev > 0: yol kirişin sağına (−uy, ux yönünün tersine) bükülmüş.
    const k = Math.max(-1, Math.min(1, -dev / (s.h * 0.1)));
    const px = -uy;
    const py = ux;
    ux += px * k * CURL_TURN;
    uy += py * k * CURL_TURN;
    const l2 = Math.sqrt(ux * ux + uy * uy);
    ux /= l2;
    uy /= l2;
    const pull = s.power * strength * CURL_PULL * k;
    s.curlX = -px * pull;
    s.curlY = -py * pull;
  }
  s.ball.vx = ux * s.power * strength;
  s.ball.vy = uy * s.power * strength;
  s.phase = PHASE_FLIGHT;
  burst(s, s.ball.x, s.ball.y, 10, s.h * 0.25, 6, false);
  return true;
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
  const tapped = touch.taps !== s.lastTap && s.lastTap >= 0;
  if (s.lastTap < 0 || tapped) s.lastTap = touch.taps;
  const rain = s.mods & MOD_RAIN ? 1 : 0;

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
    s.z = Math.max(0, s.z - dt * 2);
    if (s.resultT > 1.3) {
      s.phase = PHASE_OVER;
      return true;
    }
    return false;
  }

  if (s.kind === KIND_SHOT || s.kind === KIND_PASS) for (let i = 0; i < s.rivals.length; i += 1) patrol(s.rivals[i], dt);

  /* —— ŞUT · PENALTI · FRİKİK —— */
  if (s.kind === KIND_SHOT || s.kind === KIND_PENALTY || s.kind === KIND_FREEKICK) {
    const k = s.keeper;
    // Hareketli baraj: barajın tamamı sağa sola kayar.
    if (s.kind === KIND_FREEKICK && s.wallAmp > 0) {
      const cx = s.wallX + Math.sin(s.t * 1.7) * s.wallAmp;
      for (let i = 0; i < s.rivals.length; i += 1) s.rivals[i].x = cx + s.rivals[i].a;
    }
    if (s.phase === PHASE_READY) {
      // Kaleci kale ağzında gidip gelir (penaltıda yalnız kıpırdanır).
      k.x += k.vx * dt;
      const lim = s.kind === KIND_PENALTY ? unit * 3 : s.goalHalf - k.r;
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
      if (released) release(s, touch, s.kind === KIND_FREEKICK);
      return false;
    }
    keeperTrack(s, dt, s.kind === KIND_PENALTY && !s.keeperRead);
    flyBall(s, dt, rain ? 0.15 : 0.25);
    const b = s.ball;
    for (let i = 0; i < s.rivals.length; i += 1) {
      const r = s.rivals[i];
      if (hits(b.x, b.y, b.r, r.x, r.y, r.r * 0.9)) {
        b.vx = -b.vx * 0.3;
        b.vy = Math.abs(b.vy) * 0.3;
        finish(s, s.kind === KIND_FREEKICK ? OUT_WALL : OUT_BLOCKED, 0.12);
        return false;
      }
    }
    if (goalCheck(s)) return false;
    if (b.x < -unit * 4 || b.x > w + unit * 4 || b.y > h + unit * 4 || Math.abs(b.vx) + Math.abs(b.vy) < h * 0.05) {
      finish(s, OUT_MISS, 0.05);
    }
    return false;
  }

  /* —— KAFA —— */
  if (s.kind === KIND_HEADER) {
    const b = s.ball;
    const k = s.keeper;
    if (s.phase === PHASE_READY) {
      // Kaleci orta sırasında topun düşeceği tarafa kayar.
      const lean = s.goalX + (s.crossX1 - s.goalX) * 0.35;
      k.x += Math.max(-k.a * 0.3 * dt, Math.min(k.a * 0.3 * dt, lean - k.x));
      s.crossP += dt / s.crossDur;
      const p = s.crossP;
      // Bezier üstünde ilerler; p > 1'de aynı yönde düz devam eder.
      const pp = Math.min(1, p);
      const qq = 1 - pp;
      const bx = qq * qq * s.crossX0 + 2 * qq * pp * s.crossCX + pp * pp * s.crossX1;
      const by = qq * qq * s.crossY0 + 2 * qq * pp * s.crossCY + pp * pp * s.crossY1;
      if (p <= 1) {
        b.x = bx + (s.windX * 0.04) * Math.sin(Math.PI * p);
        b.y = by;
      } else {
        const tx = 2 * (s.crossX1 - s.crossCX);
        const ty = 2 * (s.crossY1 - s.crossCY);
        b.x = s.crossX1 + tx * (p - 1);
        b.y = s.crossY1 + ty * (p - 1);
      }
      s.z = Math.max(0, Math.sin(Math.PI * Math.min(1, p)));
      s.trail.push(b.x, b.y);
      if (s.trail.length > 24) s.trail.splice(0, 2);
      s.clock = Math.max(0, s.crossDur * (1 + s.win) - s.crossP * s.crossDur);
      if (tapped) {
        const err = p - 1;
        if (err < -s.win) {
          finish(s, OUT_HEADER_EARLY, 0.1);
          return false;
        }
        if (Math.abs(err) <= s.win) {
          const quality = 1 - Math.abs(err) / s.win;
          const aimX = Math.max(s.goalX - s.goalHalf * 1.25, Math.min(s.goalX + s.goalHalf * 1.25, touch.x));
          const spread = (1 - quality) * s.goalHalf * 0.55 * (rand(s) - 0.5) * 2;
          const dx = aimX + spread - b.x;
          const dy = s.goalY - b.y;
          const len = Math.sqrt(dx * dx + dy * dy);
          const v = s.power * (0.75 + quality * 0.25);
          b.vx = (dx / len) * v;
          b.vy = (dy / len) * v;
          s.z = 0.6;
          s.phase = PHASE_FLIGHT;
          s.me.c = 1; // zıplama
          burst(s, b.x, b.y, 14, h * 0.3, 6, true);
          return false;
        }
      }
      if (p > 1 + s.win) finish(s, OUT_HEADER_LATE, 0);
      return false;
    }
    s.me.c = Math.max(0, s.me.c - dt * 2.5);
    s.z = Math.max(0, s.z - dt * 0.8);
    keeperTrack(s, dt, false);
    flyBall(s, dt, rain ? 0.12 : 0.2);
    for (let i = 0; i < s.rivals.length; i += 1) {
      const r = s.rivals[i];
      if (hits(b.x, b.y, b.r, r.x, r.y - r.r * 0.6, r.r * 0.8)) {
        b.vx = -b.vx * 0.3;
        b.vy = Math.abs(b.vy) * 0.3;
        finish(s, OUT_BLOCKED, 0.15);
        return false;
      }
    }
    if (goalCheck(s)) return false;
    if (b.x < -unit * 4 || b.x > w + unit * 4 || b.y > h + unit * 4) finish(s, OUT_MISS, 0.05);
    return false;
  }

  /* —— PAS —— */
  if (s.kind === KIND_PASS) {
    // Arkadaş koşusunu sürdürür (top yoldayken de).
    s.runP = Math.min(1, s.runP + s.runSpeed * dt);
    s.mate.x = s.runX0 + (s.runX1 - s.runX0) * s.runP;
    s.mate.y = s.runY0 + (s.runY1 - s.runY0) * s.runP;
    if (s.phase === PHASE_READY) {
      // Ofsayt varsa saat, arkadaşın çizgiyi geçmesine kalan süredir.
      if (s.offsideY > 0) {
        const pLine = (s.offsideY - s.runY0) / (s.runY1 - s.runY0);
        s.clockMax = pLine / s.runSpeed;
        s.clock = Math.max(0, (pLine - s.runP) / s.runSpeed);
      } else s.clock = (1 - s.runP) / s.runSpeed;
      if (s.runP >= 1) {
        finish(s, OUT_LATE, 0);
        return false;
      }
      if (released) {
        const dx = touch.x - touch.sx;
        const dy = touch.y - touch.sy;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len > unit * 6 && dy < -unit * 2) {
          if (s.offsideY > 0 && s.mate.y < s.offsideY - unit) {
            s.mate.d = 1; // bayrak
            finish(s, OUT_OFFSIDE, 0.05);
            return false;
          }
          s.ball.vx = (dx / len) * s.power;
          s.ball.vy = (dy / len) * s.power;
          s.phase = PHASE_FLIGHT;
        }
      }
      return false;
    }
    const b = s.ball;
    flyBall(s, dt, 0);
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
  const fieldV = h * 0.55;
  // Çamurda ayak ağırlaşır.
  let slow = 1;
  for (let i = 0; i < s.mud.length; i += 3) {
    const dx = (me.x - s.mud[i]) / s.mud[i + 2];
    const dy = (me.y - s.mud[i + 1]) / (s.mud[i + 2] * 0.55);
    if (dx * dx + dy * dy < 1) slow = 0.32;
  }
  if (touch.down) {
    const target = (touch.x - me.x) * Math.min(1, s.agility * slow * dt);
    // Yağmurda kayarak döner: hız yumuşak birikir.
    if (rain) me.vx += (target / Math.max(dt, 0.001) - me.vx) * Math.min(1, 6 * dt);
    else me.vx = target / Math.max(dt, 0.001);
  } else me.vx *= rain ? 1 - 2 * dt : 0;
  me.x += me.vx * dt;
  me.x = Math.max(me.r, Math.min(w - me.r, me.x));
  s.ball.x = me.x + Math.sin(s.t * 9) * unit * 1.6;
  s.ball.y = me.y - unit * 5.5;
  s.progress = Math.min(1, s.progress + (dt / s.duration) * (slow < 1 ? 0.6 : 1));
  s.clock = Math.max(0, (1 - s.progress) * s.duration);

  // Savunmacılar dalga dalga yukarıdan gelir; sonuncusu çizgiden önce biter.
  s.spawnT -= dt;
  if (s.spawned < s.total && s.spawnT <= 0) {
    const gap = (s.duration * 0.78) / s.total;
    s.spawnT = gap * (0.75 + rand(s) * 0.5);
    const rival: Body = { x: 0, y: -unit * 6, vx: 0, vy: 0, r: unit * 4.6, a: 0, b: 0, c: 0, d: 0 };
    rival.x = rand(s) < 0.55 ? me.x + (rand(s) - 0.5) * w * 0.2 : w * (0.12 + rand(s) * 0.76);
    rival.x = Math.max(rival.r, Math.min(w - rival.r, rival.x));
    rival.vy = h * (0.52 + s.difficulty * 0.42 + rand(s) * 0.08);
    rival.a = w * (0.05 + s.difficulty * 0.2); // yana takip hızı
    // Kayan müdahale: her üç savunmacıdan biri yaklaşınca sana doğru kayar.
    if (s.mods & MOD_SLIDE && s.spawned % 3 === 1) rival.d = 1;
    s.rivals.push(rival);
    // Çamur birikintisi savunmacılarla birlikte gelir.
    if (s.mods & MOD_MUD && s.spawned % 2 === 0) {
      s.mud.push(w * (0.15 + rand(s) * 0.7), -unit * 14, unit * (9 + rand(s) * 5));
    }
    s.spawned += 1;
  }
  for (let i = 0; i < s.mud.length; i += 3) s.mud[i + 1] += fieldV * dt;
  if (s.mud.length && s.mud[1] > h + unit * 20) s.mud.splice(0, 3);
  for (let i = s.rivals.length - 1; i >= 0; i -= 1) {
    const r = s.rivals[i];
    r.y += r.vy * dt;
    if (r.d === 1 && r.c === 0 && r.y > me.y - h * 0.24 && r.y < me.y - h * 0.1) {
      // Kayma başlar: 0.32 sn boyunca sana doğru hızla yana kayar.
      r.c = 0.32;
      r.vx = (me.x > r.x ? 1 : -1) * w * 1.25;
    }
    if (r.c > 0) {
      r.c = Math.max(0.0001, r.c - dt);
      if (r.c <= 0.0001) r.vx = 0;
      r.x += r.vx * dt;
    } else if (r.y < me.y - unit * 10) r.x += Math.max(-r.a * dt, Math.min(r.a * dt, me.x - r.x));
    r.x = Math.max(r.r, Math.min(w - r.r, r.x));
    if (hits(me.x, me.y, me.r * s.grace * 0.8, r.x, r.y, r.r * 0.8)) {
      finish(s, OUT_TACKLED, 0.15 + s.progress * 0.5);
      return false;
    }
    if (r.y > h + unit * 8) s.rivals.splice(i, 1);
  }
  if (s.progress >= 1 && s.spawned >= s.total) finish(s, OUT_DRIBBLE_DONE, 1);
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

/** Konturlar ve krampon: koyu lacivert. */
const INK = "#1B1F3F";
const BOOT = "#2B3048";
const SHADOW = "#000000";
const WHITE = "#FFFFFF";
const SKINS = ["#F2D0B0", "#E2B08C", "#C08A62", "#8A5A3C"];
const HAIRS = ["#2A1B12", "#5E3B22", "#C9963C", "#1C1C1C"];

function rrect(x: number, y: number, w: number, h: number, r: number) {
  "worklet";
  return Skia.RRectXY(Skia.XYWHRect(x, y, w, h), r, r);
}

/**
 * Oyuncu: konturlu, doğal orantılı futbolcu (küçük baş, omuzlu forma,
 * şort, tozluk, krampon). Çarpışma dairesi (x, y, r) gövdenin ortasıdır.
 * `pulse` (top sende): yumuşak halka. `lean`: yana yatış (kaleci atlayışı,
 * kayan müdahale). `stripe`: formada dikey şerit (rakip takım).
 */
function drawPlayer(
  canvas: SkCanvas,
  x: number,
  y0: number,
  r: number,
  color: string,
  halo: string,
  t: number,
  pulse: boolean,
  variant: number,
  back: boolean,
  lean: number,
  stripe: string | null,
  glove: string | null,
) {
  "worklet";
  const hop = Math.abs(Math.sin(t * 4 + variant * 1.3)) * r * 0.05;
  const y = (back ? y0 + r * 1.05 : y0) - hop;
  canvas.drawOval(Skia.XYWHRect(x - r * 0.95, y + r * 0.78, r * 1.9, r * 0.46), fill(SHADOW, 0.25));
  if (pulse) {
    canvas.drawCircle(x, y, r * 1.2, glow(halo, r * 0.6, 0.28));
    const k = (t * 1.1) % 1;
    canvas.drawCircle(x, y + r * 0.3, r * (1.0 + k * 0.9), stroke(halo, r * 0.09 * (1 - k), 0.65 * (1 - k)));
  }
  canvas.save();
  if (lean !== 0) canvas.rotate(lean * 50, x, y + r * 0.5);
  const skin = SKINS[variant % SKINS.length];
  const ink = stroke(INK, Math.max(1, r * 0.08), 0.85);
  const step = Math.sin(t * 8 + variant) * r * 0.07;
  for (let side = -1; side <= 1; side += 2) {
    const lx = x + side * r * 0.24 - r * 0.12;
    const ly = y + r * 0.38 + (side < 0 ? step : -step);
    const leg = rrect(lx, ly, r * 0.24, r * 0.56, r * 0.1);
    canvas.drawRRect(leg, fill(skin));
    canvas.drawRRect(leg, ink);
    canvas.drawRRect(rrect(lx, ly + r * 0.2, r * 0.24, r * 0.28, r * 0.08), fill(stripe ?? WHITE));
    const boot = rrect(lx - r * 0.03, ly + r * 0.44, r * 0.3, r * 0.17, r * 0.08);
    canvas.drawRRect(boot, fill(BOOT));
  }
  // şort
  const shorts = rrect(x - r * 0.52, y + r * 0.1, r * 1.04, r * 0.4, r * 0.12);
  canvas.drawRRect(shorts, fill(stripe ? INK : WHITE));
  canvas.drawRRect(shorts, ink);
  // kollar + omuzlar
  for (let side = -1; side <= 1; side += 2) {
    const arm = rrect(x + side * r * 0.62 - r * 0.1, y - r * 0.38, r * 0.2, r * 0.64, r * 0.1);
    canvas.drawRRect(arm, fill(skin));
    canvas.drawRRect(arm, ink);
    if (glove) canvas.drawCircle(x + side * r * 0.62, y + r * 0.28, r * 0.17, fill(glove));
    canvas.drawCircle(x + side * r * 0.52, y - r * 0.36, r * 0.2, fill(color));
  }
  const shirt = rrect(x - r * 0.58, y - r * 0.56, r * 1.16, r * 0.82, r * 0.22);
  canvas.drawRRect(shirt, fill(color));
  if (stripe) {
    canvas.save();
    canvas.clipRRect(shirt, 1, true);
    canvas.drawRect(Skia.XYWHRect(x - r * 0.12, y - r * 0.6, r * 0.24, r * 0.9), fill(stripe, 0.9));
    canvas.restore();
  }
  canvas.drawRRect(rrect(x + r * 0.22, y - r * 0.5, r * 0.32, r * 0.72, r * 0.14), fill(SHADOW, 0.1));
  canvas.drawRRect(shirt, ink);
  // boyun + baş
  const hr = r * 0.44;
  const hy = y - r * 0.56 - hr * 0.95;
  canvas.drawRRect(rrect(x - hr * 0.35, hy + hr * 0.6, hr * 0.7, hr * 0.6, hr * 0.2), fill(skin));
  canvas.drawCircle(x, hy, hr, fill(skin));
  canvas.drawCircle(x, hy, hr, ink);
  const hairCol = HAIRS[(variant * 3 + 1) % HAIRS.length];
  if (back) {
    canvas.drawCircle(x, hy - hr * 0.08, hr * 0.94, fill(hairCol));
    canvas.restore();
    return;
  }
  const hair = Skia.Path.Make();
  hair.addArc(Skia.XYWHRect(x - hr, hy - hr, hr * 2, hr * 2), 180, 180);
  hair.lineTo(x + hr, hy - hr * 0.05);
  hair.quadTo(x + hr * 0.2, hy - hr * 0.45, x - hr, hy - hr * 0.05);
  hair.close();
  canvas.drawPath(hair, fill(hairCol));
  for (let side = -1; side <= 1; side += 2) {
    canvas.drawCircle(x + side * hr * 0.36, hy + hr * 0.18, hr * 0.12, fill(INK));
  }
  const smile = Skia.Path.Make();
  smile.moveTo(x - hr * 0.22, hy + hr * 0.5);
  smile.quadTo(x, hy + hr * 0.64, x + hr * 0.22, hy + hr * 0.5);
  canvas.drawPath(smile, stroke(INK, Math.max(1, hr * 0.1), 0.85));
  canvas.restore();
}

/** Tribün: koyu basamaklar, renkli kalabalık, korkuluk ve reklam panoları. */
function drawStands(canvas: SkCanvas, s: MomentState, pal: KariyerPalette, bottom: number) {
  "worklet";
  const w = s.w;
  const unit = w / 100;
  canvas.drawRect(Skia.XYWHRect(0, 0, w, bottom), fill(pal.stand));
  if (bottom < unit * 8) return;
  const rowH = (bottom - unit * 4) / 4;
  for (let i = 0; i < s.crowd.length; i += 3) {
    const row = s.crowd[i + 1];
    const cx = s.crowd[i];
    const cy = unit * 1.5 + row * rowH + rowH * 0.6 + Math.sin(s.t * 6 + cx * 0.05) * unit * (s.flash > 0 ? 1.2 : 0.25);
    const col = pal.crowd[s.crowd[i + 2] % pal.crowd.length];
    canvas.drawCircle(cx, cy + unit * 1.1, unit * (1.15 + row * 0.08), fill(col, 0.8));
    canvas.drawCircle(cx, cy - unit * 0.3, unit * (0.7 + row * 0.05), fill(pal.stand, 0.85));
  }
  canvas.drawRect(Skia.XYWHRect(0, unit * 1, w, Math.max(1, unit * 0.35)), fill(pal.standRail, 0.9));
  // reklam panoları
  const boardH = unit * 3.2;
  const segs = 4;
  for (let i = 0; i < segs; i += 1) {
    const bw = w / segs;
    canvas.drawRect(Skia.XYWHRect(i * bw, bottom - boardH, bw, boardH), fill(pal.boards[i % pal.boards.length]));
    canvas.drawRect(Skia.XYWHRect(i * bw + bw * 0.2, bottom - boardH * 0.62, bw * 0.6, boardH * 0.24), fill(WHITE, 0.55));
  }
  canvas.drawRect(Skia.XYWHRect(0, bottom - boardH, w, Math.max(1, unit * 0.3)), fill(WHITE, 0.4));
  // projektör ışıkları
  canvas.drawCircle(w * 0.08, -unit * 2, w * 0.22, glow(pal.flood, w * 0.08, 0.25));
  canvas.drawCircle(w * 0.92, -unit * 2, w * 0.22, glow(pal.flood, w * 0.08, 0.25));
}

/** Zemin: gökyüzü/tribün, biçilmiş çim, çizgiler, kale. */
function drawPitch(canvas: SkCanvas, s: MomentState, pal: KariyerPalette) {
  "worklet";
  const w = s.w;
  const h = s.h;
  const unit = w / 100;
  const goalKind = isGoalKind(s.kind);
  const sky = Skia.Paint();
  sky.setShader(Skia.Shader.MakeLinearGradient({ x: 0, y: 0 }, { x: 0, y: h * 0.4 }, [Skia.Color(pal.sky[0]), Skia.Color(pal.sky[1])], null, TileMode.Clamp));
  canvas.drawRect(Skia.XYWHRect(0, 0, w, h), sky);

  const depth = h * 0.07;
  const top = goalKind ? s.goalY - depth - unit * 4 : 0;
  if (goalKind) drawStands(canvas, s, pal, top);

  // Çim: şeritler + dama biçme; çalımda şeritler aşağı akar (koşu hissi).
  const stripes = 9;
  const band = (h - top) / stripes;
  const scroll = s.kind === KIND_DRIBBLE ? (s.t * h * 0.55) % (band * 2) : 0;
  canvas.save();
  canvas.clipRect(Skia.XYWHRect(0, top, w, h - top), 1, true);
  for (let i = -2; i < stripes + 2; i += 1) {
    const y = top + i * band + scroll;
    canvas.drawRect(Skia.XYWHRect(0, y, w, band + 1), fill(pal.pitch[(i + 400) % 2]));
  }
  for (let c = 0; c < 6; c += 2) canvas.drawRect(Skia.XYWHRect((w / 6) * c, top, w / 6, h - top), fill(SHADOW, 0.035));
  const spot = Skia.Paint();
  spot.setShader(Skia.Shader.MakeRadialGradient({ x: w / 2, y: h * 0.45 }, h * 0.6, [Skia.Color("#FFFFFF1F"), Skia.Color("#FFFFFF00")], [0, 1], TileMode.Clamp));
  canvas.drawRect(Skia.XYWHRect(0, top, w, h - top), spot);
  canvas.restore();

  const line = stroke(pal.line, Math.max(1.5, w * 0.006), 0.75);
  if (goalKind) {
    // Ceza sahası, altıpas, penaltı noktası ve yay.
    const boxW = w * 0.82;
    canvas.drawRect(Skia.XYWHRect((w - boxW) / 2, s.goalY, boxW, h * 0.3), line);
    canvas.drawRect(Skia.XYWHRect(s.goalX - s.goalHalf * 0.8, s.goalY, s.goalHalf * 1.6, h * 0.1), line);
    const spotY = s.kind === KIND_PENALTY ? s.goalY + h * 0.4 : s.goalY + h * 0.22;
    canvas.drawCircle(w / 2, spotY, Math.max(2, w * 0.009), fill(pal.line, 0.85));
    const arc = Skia.Path.Make();
    arc.addArc(Skia.XYWHRect(w / 2 - w * 0.16, spotY - w * 0.16, w * 0.32, w * 0.32), 30, 120);
    canvas.drawPath(arc, line);
    canvas.drawLine(0, s.goalY, w, s.goalY, line);
    // Kale: ağ (derinlik gölgeli), ağ örgüsü, direkler (gölgeli).
    const net = Skia.XYWHRect(s.goalX - s.goalHalf, s.goalY - depth, s.goalHalf * 2, depth);
    canvas.drawRect(net, fill(SHADOW, 0.32));
    const mesh = stroke(pal.net, Math.max(1, w * 0.0022), 0.4);
    for (let i = 1; i < 14; i += 1) {
      const x = s.goalX - s.goalHalf + ((s.goalHalf * 2) / 14) * i;
      canvas.drawLine(x, s.goalY - depth, x + (x - s.goalX) * 0.04, s.goalY, mesh);
    }
    for (let i = 1; i < 4; i += 1) canvas.drawLine(s.goalX - s.goalHalf, s.goalY - (depth / 4) * i, s.goalX + s.goalHalf, s.goalY - (depth / 4) * i, mesh);
    // Gol olunca ağ dalgalanır.
    if (s.outcome === OUT_GOAL && s.resultT < 0.6) {
      const k = 1 - s.resultT / 0.6;
      canvas.drawOval(Skia.XYWHRect(s.ball.x - unit * 8 * k, s.goalY - depth * 0.9, unit * 16 * k, depth * 0.8), stroke(pal.net, unit * 0.5, 0.6 * k));
    }
    const pw = Math.max(3, w * 0.015);
    canvas.drawLine(s.goalX - s.goalHalf + pw * 0.4, s.goalY + pw * 0.4, s.goalX - s.goalHalf + pw * 0.4, s.goalY - depth, stroke(SHADOW, pw, 0.3));
    const post = stroke(pal.post, pw);
    canvas.drawLine(s.goalX - s.goalHalf, s.goalY, s.goalX - s.goalHalf, s.goalY - depth, post);
    canvas.drawLine(s.goalX + s.goalHalf, s.goalY, s.goalX + s.goalHalf, s.goalY - depth, post);
    canvas.drawLine(s.goalX - s.goalHalf, s.goalY - depth, s.goalX + s.goalHalf, s.goalY - depth, post);
  } else if (s.kind === KIND_PASS) {
    canvas.drawLine(0, h * 0.5, w, h * 0.5, line);
    canvas.drawCircle(w / 2, h * 0.5, w * 0.16, line);
    canvas.drawCircle(w / 2, h * 0.5, Math.max(2, w * 0.008), fill(pal.line, 0.85));
  } else {
    // Çalım: hedef çizgisi yaklaşır.
    const y = h * 0.12 + (1 - s.progress) * -h * 0.6;
    if (y > -h * 0.05) {
      const dash = stroke(pal.good, Math.max(3, w * 0.014), 0.95);
      dash.setPathEffect(Skia.PathEffect.MakeDash([w * 0.05, w * 0.03], s.t * 40));
      canvas.drawLine(0, y, w, y, dash);
    }
    canvas.drawLine(w * 0.02, 0, w * 0.02, h, line);
    canvas.drawLine(w * 0.98, 0, w * 0.98, h, line);
  }
}

/** Nişan: parmak çekilirken topun gideceği yol (frikikte kavisli) ve güç. */
function drawAim(canvas: SkCanvas, s: MomentState, touch: TouchInput, pal: KariyerPalette) {
  "worklet";
  if (s.phase !== PHASE_READY || !touch.down || s.kind === KIND_DRIBBLE || s.kind === KIND_HEADER) return;
  const dx = touch.x - touch.sx;
  const dy = touch.y - touch.sy;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < s.w * 0.04 || dy >= 0) return;
  const shotLike = s.kind !== KIND_PASS;
  const strength = shotLike ? Math.max(0.45, Math.min(1, len / (s.h * 0.32))) : 1;
  let ux = dx / len;
  let uy = dy / len;
  const dotP = fill(pal.aim, 0.92);
  if (s.kind === KIND_FREEKICK) {
    // Kavisli yol önizlemesi: motorla aynı fizik, kısa benzetim.
    const dev = perpDistance(touch.sx, touch.sy, touch.x, touch.y, touch.bx, touch.by);
    // dev > 0: yol kirişin sağına (−uy, ux yönünün tersine) bükülmüş.
    const k = Math.max(-1, Math.min(1, -dev / (s.h * 0.1)));
    const px = -uy;
    const py = ux;
    ux += px * k * CURL_TURN;
    uy += py * k * CURL_TURN;
    const l2 = Math.sqrt(ux * ux + uy * uy);
    ux /= l2;
    uy /= l2;
    const pull = s.power * strength * CURL_PULL * k;
    let cx = -px * pull;
    let cy = -py * pull;
    let x = s.ball.x;
    let y = s.ball.y;
    let vx = ux * s.power * strength;
    let vy = uy * s.power * strength;
    const dt = 1 / 60;
    for (let i = 0; i < 26; i += 1) {
      for (let j = 0; j < 2; j += 1) {
        vx += (s.windX + cx) * dt;
        vy += cy * dt;
        x += vx * dt;
        y += vy * dt;
        vx *= 1 - 0.25 * dt;
        vy *= 1 - 0.25 * dt;
        cx *= 1 - 0.9 * dt;
        cy *= 1 - 0.9 * dt;
      }
      if (y < s.goalY) break;
      if (i % 2 === 0) canvas.drawCircle(x, y, s.w * (0.012 - i * 0.0002), dotP);
    }
  } else {
    const reach = s.h * (shotLike ? 0.22 + strength * 0.4 : 0.5);
    const path = Skia.Path.Make();
    path.moveTo(s.ball.x, s.ball.y);
    path.lineTo(s.ball.x + ux * reach, s.ball.y + uy * reach);
    const dash = stroke(pal.aim, Math.max(2.5, s.w * 0.011), 0.9);
    dash.setPathEffect(Skia.PathEffect.MakeDash([s.w * 0.03, s.w * 0.025], -s.t * 60));
    canvas.drawPath(path, dash);
    canvas.drawCircle(s.ball.x + ux * reach, s.ball.y + uy * reach, s.w * 0.02, dotP);
  }
  if (shotLike) {
    const ring = stroke(strength > 0.92 ? pal.bad : pal.good, Math.max(3, s.w * 0.012), 0.95);
    const arc = Skia.Path.Make();
    arc.addArc(Skia.XYWHRect(s.ball.x - s.w * 0.07, s.ball.y - s.w * 0.07, s.w * 0.14, s.w * 0.14), -90, 360 * strength);
    canvas.drawPath(arc, ring);
  }
}

/** Rüzgâr bayrağı: direk + dalgalanan bayrak + güç oku (sol üst). */
function drawWind(canvas: SkCanvas, s: MomentState, pal: KariyerPalette) {
  "worklet";
  if (s.windX === 0) return;
  const unit = s.w / 100;
  const x = unit * 7;
  const y = s.h * 0.075;
  const dir = s.windX > 0 ? 1 : -1;
  const mag = Math.min(1, Math.abs(s.windX) / (s.w * 0.32));
  canvas.drawRRect(rrect(x - unit * 5, y - unit * 4, unit * 22, unit * 12, unit * 3), fill(SHADOW, 0.35));
  canvas.drawLine(x, y - unit * 2.5, x, y + unit * 6.5, stroke(WHITE, unit * 0.6));
  const flag = Skia.Path.Make();
  const wave = Math.sin(s.t * 9) * unit * 0.8;
  flag.moveTo(x, y - unit * 2.5);
  flag.quadTo(x + dir * unit * 3, y - unit * 1.5 + wave, x + dir * unit * (5 + mag * 2), y - unit * 2 + wave);
  flag.lineTo(x + dir * unit * (5 + mag * 2), y + unit * 1.6 + wave);
  flag.quadTo(x + dir * unit * 3, y + unit * 2.2 + wave, x, y + unit * 1.2);
  flag.close();
  canvas.drawPath(flag, fill(pal.flag));
  // ok (uzunluk = güç)
  const ax = x + unit * 4;
  const ay = y + unit * 4.6;
  const al = unit * (4 + mag * 9);
  const sx = dir > 0 ? ax : ax + al;
  const ex = dir > 0 ? ax + al : ax;
  const arrow = stroke(WHITE, unit * 0.9);
  canvas.drawLine(sx, ay, ex, ay, arrow);
  canvas.drawLine(ex, ay, ex - dir * unit * 1.8, ay - unit * 1.4, arrow);
  canvas.drawLine(ex, ay, ex - dir * unit * 1.8, ay + unit * 1.4, arrow);
}

export function drawMoment(canvas: SkCanvas, s: MomentState, touch: TouchInput, pal: KariyerPalette) {
  "worklet";
  const w = s.w;
  const h = s.h;
  const unit = w / 100;

  canvas.save();
  if (s.shake > 0) {
    const amp = s.shake * s.shake * unit * 2.4;
    canvas.translate(Math.sin(s.t * 71) * amp, Math.cos(s.t * 53) * amp);
  }

  drawPitch(canvas, s, pal);

  // Çamur birikintileri (çalım).
  for (let i = 0; i < s.mud.length; i += 3) {
    const r = s.mud[i + 2];
    canvas.drawOval(Skia.XYWHRect(s.mud[i] - r, s.mud[i + 1] - r * 0.55, r * 2, r * 1.1), fill(pal.mud, 0.92));
    canvas.drawOval(Skia.XYWHRect(s.mud[i] - r * 0.6, s.mud[i + 1] - r * 0.3, r * 1.2, r * 0.6), fill(pal.mudDark, 0.7));
    canvas.drawCircle(s.mud[i] - r * 0.4, s.mud[i + 1] - r * 0.2, r * 0.12, fill(WHITE, 0.25));
  }

  // PAS: koşu yolu, yakalama alanı, ofsayt çizgisi.
  if (s.kind === KIND_PASS) {
    if (s.offsideY > 0) {
      const off = stroke(pal.offside, Math.max(2.5, w * 0.01), 0.95);
      off.setPathEffect(Skia.PathEffect.MakeDash([w * 0.04, w * 0.025], s.t * 30));
      canvas.drawLine(0, s.offsideY, w, s.offsideY, off);
      // yan hakem bayrağı (ofsaytta kalkar)
      const fx = w * 0.97;
      const up = s.mate.d === 1 ? 1 : 0;
      canvas.drawLine(fx, s.offsideY, fx, s.offsideY - unit * (5 + up * 4), stroke(WHITE, unit * 0.5));
      canvas.drawRect(Skia.XYWHRect(fx - unit * 4, s.offsideY - unit * (5 + up * 4), unit * 4, unit * 3), fill(pal.offside));
    }
    const route = stroke(pal.mate, Math.max(2, w * 0.008), 0.5);
    route.setPathEffect(Skia.PathEffect.MakeDash([w * 0.025, w * 0.025], -s.t * 30));
    canvas.drawLine(s.mate.x, s.mate.y, s.runX1, s.runY1, route);
    canvas.drawCircle(s.runX1, s.runY1, unit * 2, fill(pal.mate, 0.5));
    canvas.drawCircle(s.mate.x, s.mate.y, s.catchR * (1 + Math.sin(s.t * 6) * 0.06), stroke(pal.mate, Math.max(1.5, w * 0.006), 0.65));
  }

  // Rakipler (kayan müdahale yapacak olan kırmızı okla işaretli).
  for (let i = 0; i < s.rivals.length; i += 1) {
    const r = s.rivals[i];
    const lean = r.c > 0 ? (r.vx > 0 ? 1 : -1) * 0.5 : 0;
    if (r.d === 1 && r.c === 0) {
      canvas.drawCircle(r.x, r.y - r.r * 2.2, r.r * 0.45, fill(pal.bad, 0.9));
      canvas.drawLine(r.x - r.r * 0.22, r.y - r.r * 2.2, r.x + r.r * 0.22, r.y - r.r * 2.2, stroke(WHITE, r.r * 0.12));
    }
    if (r.c > 0) canvas.drawOval(Skia.XYWHRect(r.x - r.r * 2.2 * (r.vx > 0 ? 1 : 0), r.y + r.r * 0.6, r.r * 2.2, r.r * 0.4), fill(WHITE, 0.25));
    drawPlayer(canvas, r.x, r.y, r.r, pal.rival, pal.rivalGlow, s.t + i, false, i + 1, false, lean, pal.rivalTrim, null);
  }

  if (isGoalKind(s.kind)) {
    const k = s.keeper;
    canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(k.x - k.b, k.y - k.r * 0.4, k.b * 2, k.r * 0.8), k.r * 0.4, k.r * 0.4), fill(pal.keeper, 0.22));
    const dive = s.phase === PHASE_FLIGHT || s.phase === PHASE_RESULT ? Math.max(-1, Math.min(1, k.c / (s.goalHalf * 0.6))) : 0;
    drawPlayer(canvas, k.x, k.y, k.r, pal.keeper, pal.keeper, s.t, false, 2, false, dive * 0.9, null, pal.keeperGlove);
  }
  if (s.kind === KIND_PASS) drawPlayer(canvas, s.mate.x, s.mate.y, s.mate.r, pal.mate, pal.mate, s.t, true, 3, false, 0, null, null);

  // KAFA: başın üstündeki zamanlama halkası (pencerede yeşil).
  if (s.kind === KIND_HEADER && s.phase === PHASE_READY) {
    const hx = s.crossX1;
    const hy = s.crossY1;
    const inWin = Math.abs(s.crossP - 1) <= s.win;
    const close = Math.max(0, Math.min(1, 1 - Math.abs(1 - s.crossP) * 2));
    const rr = unit * (5 + (1 - close) * 6);
    canvas.drawCircle(hx, hy, unit * 5, stroke(inWin ? pal.good : WHITE, unit * 0.9, inWin ? 1 : 0.55));
    canvas.drawCircle(hx, hy, rr, stroke(inWin ? pal.good : pal.aim, unit * 0.5, 0.5));
    if (inWin) canvas.drawCircle(hx, hy, unit * 6, glow(pal.good, unit * 2, 0.35));
  }
  const jump = s.kind === KIND_HEADER ? s.me.c * unit * 4 : 0;
  drawPlayer(canvas, s.me.x, s.me.y - jump, s.me.r, pal.me, pal.meGlow, s.t, s.phase === PHASE_READY && s.kind !== KIND_HEADER, 0, true, 0, null, null);

  // Top izi: eskiden yeniye kalınlaşan parlak şerit.
  const n = s.trail.length / 2;
  for (let i = 1; i < n; i += 1) {
    const k = i / n;
    canvas.drawLine(s.trail[(i - 1) * 2], s.trail[(i - 1) * 2 + 1], s.trail[i * 2], s.trail[i * 2 + 1], stroke(pal.trail, s.ball.r * 1.2 * k, k * 0.38));
  }

  drawAim(canvas, s, touch, pal);

  // Top: yükseklik (z) gölgeyi uzaklaştırır, topu büyütür.
  const b = s.ball;
  const zr = b.r * (1 + s.z * 0.55);
  const zy = s.z * unit * 6;
  canvas.drawOval(Skia.XYWHRect(b.x - b.r * 0.9, b.y + b.r * 0.7 + zy * 0.4, b.r * 1.8, b.r * 0.5), fill(SHADOW, 0.28 * (1 - s.z * 0.5)));
  const by = b.y - zy;
  canvas.drawCircle(b.x, by, zr * 1.35, glow(pal.trail, zr * 0.7, 0.25));
  const ballPaint = Skia.Paint();
  ballPaint.setAntiAlias(true);
  ballPaint.setShader(
    Skia.Shader.MakeRadialGradient({ x: b.x - zr * 0.35, y: by - zr * 0.4 }, zr * 1.5, [Skia.Color(WHITE), Skia.Color(pal.ball), Skia.Color("#B8C2D3")], [0, 0.55, 1], TileMode.Clamp),
  );
  canvas.drawCircle(b.x, by, zr, ballPaint);
  canvas.save();
  canvas.clipRRect(Skia.RRectXY(Skia.XYWHRect(b.x - zr, by - zr, zr * 2, zr * 2), zr, zr), 1, true);
  for (let i = 0; i < 4; i += 1) {
    const a = s.t * 7 + (i * Math.PI) / 2;
    canvas.drawCircle(b.x + Math.cos(a) * zr * 0.62, by + Math.sin(a * 0.8) * zr * 0.5, zr * 0.26, fill(INK, 0.85));
  }
  canvas.drawCircle(b.x + Math.cos(s.t * 3) * zr * 0.1, by, zr * 0.24, fill(INK, 0.85));
  canvas.restore();
  canvas.drawCircle(b.x - zr * 0.35, by - zr * 0.4, zr * 0.22, fill(WHITE, 0.55));
  canvas.drawCircle(b.x, by, zr, stroke(INK, Math.max(0.8, zr * 0.08), 0.8));

  // Yağmur: eğik ince çizgiler (rüzgâra göre yatar).
  if (s.mods & MOD_RAIN) {
    const rain = stroke(pal.rain, Math.max(1, unit * 0.25), 0.45);
    const slant = s.windX !== 0 ? (s.windX > 0 ? 1 : -1) * unit * 1.6 : unit * 0.6;
    for (let i = 0; i < 46; i += 1) {
      const rx = ((i * 37.7) % 100) * unit;
      const ry = ((i * 53.3 + s.t * 140) % 110) * (h / 100) - h * 0.05;
      canvas.drawLine(rx, ry, rx + slant, ry + unit * 4, rain);
    }
  }

  // Parçacıklar (konfeti): dönen küçük dikdörtgenler ve yıldız kıvılcımları.
  for (let i = 0; i < s.particles.length; i += 2) {
    const p = s.particles[i];
    const alpha = Math.min(1, (p.life / p.max) * 1.6);
    canvas.save();
    canvas.rotate((p.spin * (p.max - p.life) * 180) / Math.PI, p.x, p.y);
    const col = pal.confetti[p.color % pal.confetti.length];
    if (i % 3 === 0) {
      const star = Skia.Path.Make();
      for (let k = 0; k < 10; k += 1) {
        const rr = k % 2 ? p.size * 0.6 : p.size * 1.5;
        const aa = (k * Math.PI) / 5 - Math.PI / 2;
        if (k === 0) star.moveTo(p.x + Math.cos(aa) * rr, p.y + Math.sin(aa) * rr);
        else star.lineTo(p.x + Math.cos(aa) * rr, p.y + Math.sin(aa) * rr);
      }
      star.close();
      canvas.drawPath(star, fill(col, alpha));
    } else canvas.drawRect(Skia.XYWHRect(p.x - p.size, p.y - p.size * 0.5, p.size * 2, p.size), fill(col, alpha));
    canvas.restore();
  }

  canvas.restore();

  drawWind(canvas, s, pal);

  // Alt kenarda süre / ilerleme çubuğu.
  const barW = w * 0.62;
  const barX = (w - barW) / 2;
  const barY = h - unit * 4;
  const ratio = s.kind === KIND_DRIBBLE ? s.progress : Math.max(0, Math.min(1, s.clock / s.clockMax));
  canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(barX, barY, barW, unit * 1.8), unit, unit), fill(SHADOW, 0.35));
  const urgent = s.kind !== KIND_DRIBBLE && ratio < 0.3;
  if (ratio > 0) canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(barX, barY, barW * ratio, unit * 1.8), unit, unit), fill(urgent ? pal.bad : pal.good, 0.95));

  // Kenar karartması ve sonuç parlaması.
  const vignette = Skia.Paint();
  vignette.setShader(Skia.Shader.MakeRadialGradient({ x: w / 2, y: h / 2 }, h * 0.75, [Skia.Color("#00000000"), Skia.Color("#00000040")], [0.65, 1], TileMode.Clamp));
  canvas.drawRect(Skia.XYWHRect(0, 0, w, h), vignette);
  if (s.flash > 0) canvas.drawRect(Skia.XYWHRect(0, 0, w, h), fill(WHITE, s.flash * 0.5));
}

/** An türü için KariyerGame'in kullandığı dokunuş biçimi. */
export const usesTap = (kind: number) => kind === KIND_HEADER;
