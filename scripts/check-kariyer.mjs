/**
 * KARİYER YOLU DENGE DENETİMİ — başsız (Skia'sız) benzetimle an türlerinin
 * basamak başına "gol oranı" ölçülür ve bantlar doğrulanır.
 *
 * NASIL:
 *   - lib/kariyer/sim.ts node'da doğrudan yüklenir: Skia bir taslakla
 *     değiştirilir (çizim çağrılmaz), uzantısız "./levels" içe aktarımı .ts'e
 *     çözülür (module.register çözüm kancası).
 *   - İlk 120 seviye (FWD ve MID hatları) üretilir; her basamaktaki ilgili
 *     anlar toplanır. Oyuncu özellikleri seviyeyle büyür (bkz. attrsAt).
 *   - Her an için insan benzeri bir çekiş ızgarası taranır: kiriş hedefi
 *     (kale çizgisinde x), kavis (−1…1), güç ve bırakış anı (hareketli baraj
 *     ile devriye eden kaleci için zamanlama önemli). Başlangıç noktası
 *     fiziği etkilemez (yalnız çekiş vektörü ve kavis sayılır) ama yine de
 *     birkaç farklı başlangıçla denenir.
 *   - "MAKUL" çekiş = ipucunun söylediğini yapan çekiş: engelsiz kopyada
 *     (baraj/savunmacı yok, kaleci uzanmıyor) kaleye ve KÖŞEYE (orta
 *     bölgenin dışına) giden atış. Ek koşullar: şut ve kafada kalecinin ters
 *     yanındaki köşe; kafada iyi zamanlama (pencerenin %60'ı içinde);
 *     frikikte ekrandaki nişan önizlemesi (aimPreviewSteps kadar) baraja
 *     değmemeli — oyuncu baraja giden yolu görür ve seçmez; şutta da
 *     bırakış anında bir savunmacıya değen yol seçilmez (sonradan araya
 *     giren savunmacı zamanlama hatasıdır, sayılır).
 *     ORAN = makul çekişlerden gerçek koşulda gol (pasta: isabetli pas) payı.
 *   - Kafa: dokunma zamanı (pencere katları) ve yönü taranır. Pas: koşunun
 *     önleme noktasına (± koşu payı, ± yan) nişan; başarı = PAS_OK / NEFİS
 *     PAS. Çalım: insan benzeri parmak politikası (bakış mesafesi, tepki
 *     gecikmesi, karar sıklığı, kayma); başarı = çizgiye ulaşmak.
 *
 * Bantlar: frikik, şut, penaltı → basamak 1–2 %74–86, 3–4 %54–66, 5 %44–56;
 * kafa, pas, çalım → geniş akıl sağlığı bantları (LOOSE). Her tür için oran
 * basamaktan basamağa artmamalı (en çok 5 puanlık oynama). Beceri ödülü:
 * frikikte barajın yanından dolanan kavis, şutta kalecinin uzağı, penaltıda
 * direk dibine sert vuruş, uymayan çekişten en az 8 puan daha çok gol olmalı.
 * Engel adaleti: her (an, engel) birleşimi — baraj+usta dahil — en az %35.
 *
 * Çalıştırma: node --experimental-strip-types --no-warnings scripts/check-kariyer.mjs [--verbose]
 */

import { register } from "node:module";

const LOADER = `
export async function resolve(specifier, context, next) {
  if (specifier === "@shopify/react-native-skia") return { url: "data:text/javascript,export const Skia={};export const BlurStyle={};export const PaintStyle={};export const StrokeCap={};export const TileMode={};", shortCircuit: true };
  if (specifier.startsWith(".") && context.parentURL && context.parentURL.includes("/lib/kariyer/") && !/\\.[a-z]+$/.test(specifier)) {
    return next(specifier + ".ts", context);
  }
  return next(specifier, context);
}`;
register(`data:text/javascript,${encodeURIComponent(LOADER)}`, import.meta.url);

const VERBOSE = process.argv.includes("--verbose");
const L = await import("../lib/kariyer/levels.ts");
const S = await import("../lib/kariyer/sim.ts");

const W = 390;
const H = 660;
const DT = 1 / 60;

/** Seviyede beklenen oyuncu: 30'dan başlar, seviye başına ~0,4 puan; 80'de durur. */
const attrsAt = (lv) => {
  const v = Math.min(80, Math.round(30 + (lv - 1) * 0.4));
  return { sut: v, pas: v, teknik: v, hiz: v };
};

/* ───────────── an toplama ───────────── */

const TIERS = [1, 2, 3, 4, 5];
const byTier = new Map(); // `${tier}:${kind}` → [{lv, def}]
for (let lv = 1; lv <= L.KARIYER_LEVEL_COUNT; lv += 1) {
  const seen = new Set();
  for (const line of ["FWD", "MID"]) {
    const level = L.generateKariyerLevel(lv, line);
    for (const def of level.moments) {
      const key = `${def.kind}:${def.seed}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const k = `${level.tier}:${def.kind}`;
      if (!byTier.has(k)) byTier.set(k, []);
      byTier.get(k).push({ lv, def });
    }
  }
}

/* ───────────── benzetim ───────────── */

/** Engelsiz kopya: baraj/savunmacı yok, kaleci uzanmıyor. */
function clearState(s) {
  s.rivals.length = 0;
  s.keeper.b = -1;
  return s;
}

/**
 * Bir çekişi oynatır. mode: "real" (gerçek), "clear" (engelsiz),
 * "preview" (bırakış anındaki baraj / savunmacılar donar, kaleci uzanmaz;
 * frikikte yalnız önizlemenin gösterdiği kare sayısı kadar uçulur —
 * oyuncunun bırakırken ekranda gördüğü yol bir rakibe değiyor mu?).
 */
function runSwipe(def, lv, swipe, mode = "real") {
  const s = S.createMoment(def, attrsAt(lv), W, H);
  const wallY = s.rivals.length ? s.rivals[0].y : -1;
  const x0 = s.ball.x;
  const y0 = s.ball.y;
  let crossX = NaN; // topun baraj hizasından geçtiği x
  let keeperAt = NaN; // bırakış anında kalecinin x'i
  if (mode === "clear") clearState(s);
  if (mode === "preview") s.keeper.b = -1;
  const touch = S.emptyTouch();
  let released = false;
  let after = 0;
  for (let i = 0; i < 60 * 12; i += 1) {
    if (!released && s.t >= swipe.at) {
      released = true;
      keeperAt = s.keeper.x;
      if (swipe.tap) {
        touch.x = swipe.x;
        touch.taps += 1;
      } else {
        Object.assign(touch, swipe.touch);
        touch.up += 1;
      }
    }
    const prevY = s.ball.y;
    S.stepMoment(s, DT, touch);
    if (Number.isNaN(crossX) && prevY > wallY && s.ball.y <= wallY) crossX = s.ball.x;
    if (released && mode === "preview") {
      s.wallAmp = 0;
      for (const r of s.rivals) r.vx = 0;
      after += 1;
      if (s.kind === S.KIND_FREEKICK && after > previewFrames(s)) return { out: S.OUT_NONE, x: s.ball.x, s, crossX, x0, y0, wallY, keeperAt };
    }
    if (s.phase >= S.PHASE_RESULT) return { out: s.outcome, x: s.ball.x, s, crossX, x0, y0, wallY, keeperAt };
  }
  return { out: s.outcome, x: s.ball.x, s, crossX, x0, y0, wallY, keeperAt };
}

/** Önizlemenin kaç kare (1/60 sn) ileriyi gösterdiği: oyunla aynı kaynak. */
const previewFrames = (s) => (typeof S.aimPreviewSteps === "function" ? S.aimPreviewSteps(s.difficulty) : 26) * 2;

/** Kiriş (bırakış vektörü) + kavis noktası: motorun okuduğu çekiş. */
function swipeTouch(s0, tx, ty, strength, curl, start) {
  const dx = tx - s0.ball.x;
  const dy = ty - s0.ball.y;
  const len0 = Math.sqrt(dx * dx + dy * dy);
  const ux = dx / len0;
  const uy = dy / len0;
  const len = strength * H * 0.32;
  const sx = start.x;
  const sy = start.y;
  const ex = sx + ux * len;
  const ey = sy + uy * len;
  // dev = −k · h · 0,1 (sim.ts release ile ters): kavis noktası kiriş ortasından (uy, −ux) yönünde.
  const dev = -curl * H * 0.1;
  return { down: false, sx, sy, x: ex, y: ey, bx: (sx + ex) / 2 + uy * dev, by: (sy + ey) / 2 - ux * dev };
}

const STARTS = [
  { x: W * 0.5, y: H * 0.85 },
  { x: W * 0.3, y: H * 0.78 },
  { x: W * 0.7, y: H * 0.9 },
];

function* shotGrid(def, lv, withCurl) {
  const s0 = S.createMoment(def, attrsAt(lv), W, H);
  const aims = withCurl ? [-1.5, -1.2, -0.9, -0.6, -0.3, 0, 0.3, 0.6, 0.9, 1.2, 1.5] : [-0.95, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 0.95];
  const curls = withCurl ? [-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1] : [0];
  const powers = [0.6, 0.75, 0.9, 1];
  const times = [0.5, 1.2, 2.0, 2.9];
  let n = 0;
  for (const a of aims)
    for (const c of curls)
      for (const p of powers)
        for (const at of times) {
          const start = STARTS[n++ % STARTS.length];
          const touch = swipeTouch(s0, s0.goalX + a * s0.goalHalf, s0.goalY, p, c, start);
          yield { at, touch, meta: { a, c, p } };
        }
}

function* headerGrid(def, lv) {
  const s0 = S.createMoment(def, attrsAt(lv), W, H);
  // Dokunma: orta topunun varışına göre zaman hatası (pencerenin katları).
  for (const e of [-0.9, -0.6, -0.3, 0, 0.3, 0.6, 0.9])
    for (const a of [-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1]) {
      const at = s0.crossDur * (1 + e * s0.win);
      yield { at, tap: true, x: s0.goalX + a * s0.goalHalf, meta: { a, c: 0, p: 0, e } };
    }
}

function* passGrid(def, lv) {
  // İnsan koşunun buluşma noktasına nişan alır (topun hızına göre hesaplanan
  // önleme noktası) ve biraz yanılır: koşu payında ±, yanlara ±.
  const s0 = S.createMoment(def, attrsAt(lv), W, H);
  const at0 = (p) => ({ x: s0.runX0 + (s0.runX1 - s0.runX0) * p, y: s0.runY0 + (s0.runY1 - s0.runY0) * p });
  for (const at of [0.4, 0.8, 1.3, 1.9]) {
    let T = 0.5;
    for (let i = 0; i < 8; i += 1) {
      const m = at0(Math.min(1, s0.runSpeed * (at + T)));
      T = Math.hypot(m.x - s0.ball.x, m.y - s0.ball.y) / s0.power;
    }
    const pHit = s0.runSpeed * (at + T);
    for (const dp of [-0.1, -0.05, 0, 0.05, 0.1])
      for (const off of [-0.03, 0, 0.03]) {
        const m = at0(Math.min(1, pHit + dp));
        const dx = m.x + off * W - s0.ball.x;
        const dy = m.y - s0.ball.y;
        const l = Math.sqrt(dx * dx + dy * dy);
        const len = H * 0.25;
        const sx = W / 2;
        const sy = H * 0.85;
        yield { at, touch: { down: false, sx, sy, x: sx + (dx / l) * len, y: sy + (dy / l) * len, bx: sx, by: sy }, meta: { a: dp, c: 0, p: 0 } };
      }
  }
}

const GOOD = (kind, out) => (kind === "pass" ? out === S.OUT_PASS_OK || out === S.OUT_PASS_PERFECT : out === S.OUT_GOAL);

/** Köşe hedefi: engelsiz yolun kale çizgisinde vardığı yer orta bölgenin dışında. */
const corner = (r) => Math.abs(r.x - r.s.goalX) >= r.s.goalHalf * 0.45;

/** Çekiş başarısı (pasta isabetli pas, gol anlarında gol). */
function measure(kind, def, lv) {
  if (kind === "dribble") return measureDribble(def, lv);
  const grid = kind === "header" ? headerGrid(def, lv) : kind === "pass" ? passGrid(def, lv) : shotGrid(def, lv, kind === "freekick");
  let fair = 0;
  let good = 0;
  let total = 0;
  // Beceri kıyası: hi = ipucuna tam uyan çekiş, lo = uymayan (oran farkı ödülü gösterir).
  const hi = { fair: 0, good: 0 };
  const lo = { fair: 0, good: 0 };
  const add = (bucket, ok) => {
    bucket.fair += 1;
    if (ok) bucket.good += 1;
  };
  const outs = {};
  for (const sw of grid) {
    total += 1;
    const clear = runSwipe(def, lv, sw, "clear");
    if (!GOOD(kind, clear.out)) continue;
    if (kind === "header" && Math.abs(sw.meta.e) > 0.6) continue;
    // Oyuncu bırakırken yolun bir rakibe (baraj / savunmacı) değdiğini görürse o çekişi seçmez.
    if ((kind === "freekick" || kind === "shot") && [S.OUT_WALL, S.OUT_BLOCKED].includes(runSwipe(def, lv, sw, "preview").out)) {
      if (kind !== "freekick") continue;
    }
    const real = runSwipe(def, lv, sw).out;
    const ok = GOOD(kind, real);
    const isCorner = kind !== "pass" && corner(clear);
    const awayKeeper = Math.sign(clear.x - clear.s.goalX) !== Math.sign(clear.keeperAt - clear.s.goalX);
    if (kind === "shot") {
      // Beceri: kalecinin uzağına köşe vs kalecinin bulunduğu yana köşe.
      if (isCorner) add(awayKeeper ? hi : lo, ok);
    } else if (kind === "penalty") {
      // Beceri: direk dibine sert (|nişan| ≥ 0,75, güç ≥ 0,9) vs ortaya yakın ya da yumuşak.
      const deep = Math.abs(sw.meta.a) >= 0.75 && sw.meta.p >= 0.9;
      add(deep ? hi : lo, ok);
    } else if (kind === "freekick" && isCorner) {
      // Tatlı nokta: köşeye giden çekişlerde barajın YANINDAN dolanan belirgin
      // kavis (baraj hizasında top, düz kirişten daha uzakta) düz çekişten
      // iyi mi? Barajın içine bükülen kavis iki gruba da girmez.
      const chordX = clear.x0 + (clear.x - clear.x0) * ((clear.wallY - clear.y0) / (clear.s.goalY - clear.y0));
      const unit = W / 100;
      const around = Math.abs(clear.crossX - clear.s.wallX) > Math.abs(chordX - clear.s.wallX) + unit * 2;
      if (Math.abs(sw.meta.c) >= 0.5 && around) add(hi, ok);
      else if (Math.abs(sw.meta.c) <= 0.25) add(lo, ok);
    }
    // Makul: ipucunun söylediğini yapan çekiş (köşeye nişan; şut ve kafada kalecinin uzağına).
    if (kind !== "pass" && !isCorner) continue;
    if ((kind === "shot" || kind === "header") && !awayKeeper) continue;
    if (kind === "freekick" && runSwipe(def, lv, sw, "preview").out === S.OUT_WALL) continue;
    fair += 1;
    outs[real] = (outs[real] ?? 0) + 1;
    if (ok) good += 1;
  }
  return { fair, good, total, hi, lo, outs };
}

/**
 * Çalım: insan benzeri bir parmak politikası taranır. Oyuncu her `every` sn'de
 * bir, `look` kadar yukarıdaki savunmacılara bakıp onlardan en uzak şeridi
 * seçer; kararı `lag` sn gecikmeyle uygular (tepki süresi) ve `jitter` kadar
 * kayar. Başarı = çizgiye ulaşmak.
 */
function measureDribble(def, lv) {
  let fair = 0;
  let good = 0;
  const outs = {};
  const lanes = Array.from({ length: 11 }, (_, i) => W * (0.08 + i * 0.084));
  for (const look of [0.42, 0.52, 0.62])
    for (const lag of [0.15, 0.22, 0.3])
      for (const every of [0.12, 0.25])
        for (const jitter of [-0.03, 0, 0.03]) {
          const s = S.createMoment(def, attrsAt(lv), W, H);
          const touch = S.emptyTouch();
          touch.down = true;
          touch.x = s.me.x;
          const queue = [];
          let next = 0;
          for (let i = 0; i < 60 * 15 && s.phase < S.PHASE_RESULT; i += 1) {
            if (s.t >= next) {
              next = s.t + every;
              const threats = s.rivals.filter((r) => r.y < s.me.y + r.r && r.y > s.me.y - H * look);
              let best = touch.x;
              let bestScore = -Infinity;
              for (const x of lanes) {
                let m = Infinity;
                for (const r of threats) {
                  // Yakın savunmacı daha önemli; kayan müdahaleci yana da uzanır.
                  const dist = Math.abs(r.x - x) - (r.d === 1 ? W * 0.12 : 0);
                  m = Math.min(m, dist + (s.me.y - r.y) * 0.25);
                }
                const score = m - Math.abs(x - s.me.x) * 0.15; // az yer değiştir
                if (score > bestScore) {
                  bestScore = score;
                  best = x;
                }
              }
              queue.push({ at: s.t + lag, x: best + jitter * W });
            }
            while (queue.length && queue[0].at <= s.t) touch.x = queue.shift().x;
            S.stepMoment(s, DT, touch);
          }
          fair += 1;
          outs[s.outcome] = (outs[s.outcome] ?? 0) + 1;
          if (s.outcome === S.OUT_DRIBBLE_DONE) good += 1;
        }
  return { fair, good, total: fair, hi: { fair: 0, good: 0 }, lo: { fair: 0, good: 0 }, outs };
}

/* ───────────── rapor ───────────── */

const KINDS = ["freekick", "shot", "penalty", "header", "pass", "dribble"];
const LABEL = { freekick: "frikik", shot: "şut", penalty: "penaltı", header: "kafa", pass: "pas", dribble: "çalım" };
const MOD_KEYS = [
  ["rüzgâr", L.MOD_WIND],
  ["çamur", L.MOD_MUD],
  ["kayan", L.MOD_SLIDE],
  ["ofsayt", L.MOD_OFFSIDE],
  ["baraj", L.MOD_WALLMOVE],
  ["yağmur", L.MOD_RAIN],
  ["usta", L.MOD_ACE],
  ["baraj+usta", L.MOD_WALLMOVE | L.MOD_ACE],
];
const rate = (g, f) => (f ? g / f : NaN);
const pct = (x) => (Number.isNaN(x) ? "  –  " : `${(x * 100).toFixed(0).padStart(3)}%`);
const table = {};
const skill = {};
const mods = {}; // `${kind}:${mod}` → [gol, makul]

for (const tier of TIERS) {
  table[tier] = {};
  skill[tier] = {};
  for (const kind of KINDS) {
    const list = byTier.get(`${tier}:${kind}`) ?? [];
    let fair = 0;
    let good = 0;
    const hi = [0, 0];
    const lo = [0, 0];
    for (const { lv, def } of list) {
      const m = measure(kind, def, lv);
      fair += m.fair;
      good += m.good;
      hi[0] += m.hi.good; hi[1] += m.hi.fair;
      lo[0] += m.lo.good; lo[1] += m.lo.fair;
      for (const [key, bit] of MOD_KEYS) {
        if ((def.mods & bit) !== bit) continue;
        const k = `${kind}:${key}`;
        mods[k] ??= [0, 0];
        mods[k][0] += m.good;
        mods[k][1] += m.fair;
      }
      if (VERBOSE) console.log(`  ${LABEL[kind]} L${String(lv).padStart(3)} d=${def.difficulty.toFixed(2)} mods=${def.mods} makul=${m.fair}/${m.total} oran=${pct(rate(m.good, m.fair))} çıktılar=${JSON.stringify(m.outs)}`);
    }
    table[tier][kind] = { rate: rate(good, fair), n: list.length };
    skill[tier][kind] = { hi: rate(hi[0], hi[1]), lo: rate(lo[0], lo[1]) };
  }
}

console.log("\nKariyer Yolu — makul girdilerden gol/başarı oranı (an sayısı parantezde)\n");
console.log("basamak  " + KINDS.map((k) => LABEL[k].padEnd(12)).join(""));
for (const tier of TIERS) {
  console.log(`   ${tier}     ` + KINDS.map((k) => `${pct(table[tier][k].rate)} (${String(table[tier][k].n).padStart(2)})`.padEnd(12)).join(""));
}
console.log("\nbeceri ödülü (ipucuna uyan / uymayan çekiş):");
console.log("   frikik: barajın yanından kavis / düz · şut: kalecinin uzağı / yakını · penaltı: direk dibi sert / diğer");
for (const tier of TIERS) {
  console.log(`   ${tier}     ` + ["freekick", "shot", "penalty"].map((k) => `${LABEL[k]} ${pct(skill[tier][k].hi)} / ${pct(skill[tier][k].lo)}`).join("   "));
}
console.log("\nengeller: " + Object.entries(mods).map(([k, [g, f]]) => `${k} ${pct(rate(g, f))}`).join(" · "));

/* ───────────── bantlar ───────────── */

const fails = [];
// Gol anları (frikik, şut, penaltı): hedef bantlar.
const STRICT = { 1: [0.74, 0.86], 2: [0.74, 0.86], 3: [0.54, 0.66], 4: [0.54, 0.66], 5: [0.44, 0.56] };
// Kafa, pas, çalım: daha geniş akıl sağlığı bantları (yine zorlaşmalı, ama
// hiçbir basamakta imkânsız ya da bedava olmamalı). Pas bilerek daha
// kolaydır: hazırlık anıdır, isabetli pas 0,72 puan, "nefis pas" 1 puan.
const LOOSE = { 1: [0.7, 0.99], 2: [0.7, 0.98], 3: [0.5, 0.94], 4: [0.42, 0.86], 5: [0.36, 0.8] };
const band = (kind) => (["freekick", "shot", "penalty"].includes(kind) ? STRICT : LOOSE);
for (const kind of KINDS) {
  for (const tier of TIERS) {
    const { rate: r, n } = table[tier][kind];
    if (!n) continue;
    const [lo, hi] = band(kind)[tier];
    if (!(r >= lo && r <= hi)) fails.push(`${LABEL[kind]} basamak ${tier}: %${(r * 100).toFixed(0)} bant dışı (%${Math.round(lo * 100)}–%${Math.round(hi * 100)})`);
    const prev = table[tier - 1]?.[kind];
    if (prev?.n && r > prev.rate + 0.05) fails.push(`${LABEL[kind]} basamak ${tier}: önceki basamaktan kolay`);
  }
}
// Beceri ödülü: ipucuna uyan çekiş belirgin daha çok gol olmalı.
for (const tier of TIERS) {
  for (const [kind, gap] of [["freekick", 0.08], ["shot", 0.08], ["penalty", 0.08]]) {
    const sk = skill[tier][kind];
    if (Number.isNaN(sk.hi) || Number.isNaN(sk.lo)) continue;
    if (!(sk.hi >= sk.lo + gap)) fails.push(`${LABEL[kind]} basamak ${tier}: beceri ödülsüz (${pct(sk.hi)} / ${pct(sk.lo)})`);
  }
}
// Engel adaleti: hiçbir engel (ya da baraj+usta birleşimi) anı imkânsıza yakın kılmamalı.
for (const [key, [g, f]] of Object.entries(mods)) {
  if (f >= 100 && g / f < 0.35) fails.push(`${key}: %${((g / f) * 100).toFixed(0)} — engel adil değil (< %35)`);
}

// Belirlenimcilik: aynı seviye iki kez aynı anları üretmeli.
for (const lv of [19, 63, 80, 120]) {
  if (JSON.stringify(L.generateKariyerLevel(lv)) !== JSON.stringify(L.generateKariyerLevel(lv))) fails.push(`seviye ${lv}: belirlenimci değil`);
}

if (fails.length) {
  console.error("\nBAŞARISIZ:\n  " + fails.join("\n  "));
  process.exit(1);
}
console.log("\nTamam: bütün an türleri bantlarda; beceri ödüllü, engeller adil, seviyeler belirlenimci.");
