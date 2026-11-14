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
 *     değmemeli — oyuncu baraja giden yolu görür ve seçmez.
 *     ORAN = makul çekişlerden gerçek koşulda gol (pasta: isabetli pas) payı.
 *   - Kafa: dokunma zamanı (pencere katları) ve yönü taranır; pas: koşunun
 *     önüne doğru hedefler (başarı = PAS_OK / NEFİS PAS).
 *
 * Bantlar (frikik): basamak 1–2 → %74–86, 3–4 → %54–66, 5 → %44–56;
 * basamaklar arasında oran artmamalı (en çok 5 puanlık oynama); frikik
 * penaltı ve kafadan belirgin zor olmamalı ve kafadan en çok 20 puan
 * sapmalı. Tatlı nokta: barajın yanından dolanan belirgin kavis (≥0,5) düz
 * çekişten (≤0,25) en az 8 puan daha çok gol olmalı. Rüzgâr, hareketli
 * baraj, usta kaleci ve baraj+usta bir aradayken oran %40'ın altına inmemeli.
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
 * "preview" (frikik: bırakış anındaki baraj donar, kaleci uzanmaz; yalnız
 * önizlemenin gösterdiği kare sayısı kadar uçulur — oyuncunun ekranda
 * gördüğü yol baraja değiyor mu?).
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
      after += 1;
      if (after > previewFrames(s)) return { out: S.OUT_NONE, x: s.ball.x, s, crossX, x0, y0, wallY, keeperAt };
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
  const s0 = S.createMoment(def, attrsAt(lv), W, H);
  for (const at of [0.4, 0.8, 1.3, 1.9])
    for (const lead of [0.05, 0.15, 0.25, 0.35, 0.45])
      for (const off of [-0.04, 0, 0.04]) {
        const p = Math.min(1, s0.runSpeed * at + lead);
        const tx = s0.runX0 + (s0.runX1 - s0.runX0) * p + off * W;
        const ty = s0.runY0 + (s0.runY1 - s0.runY0) * p;
        const dx = tx - s0.ball.x;
        const dy = ty - s0.ball.y;
        const l = Math.sqrt(dx * dx + dy * dy);
        const len = H * 0.25;
        const sx = W / 2;
        const sy = H * 0.85;
        yield { at, touch: { down: false, sx, sy, x: sx + (dx / l) * len, y: sy + (dy / l) * len, bx: sx, by: sy }, meta: { a: lead, c: 0, p: 0 } };
      }
}

const GOOD = (kind, out) => (kind === "pass" ? out === S.OUT_PASS_OK || out === S.OUT_PASS_PERFECT : out === S.OUT_GOAL);

/** Köşe hedefi: engelsiz yolun kale çizgisinde vardığı yer orta bölgenin dışında. */
const corner = (r) => Math.abs(r.x - r.s.goalX) >= r.s.goalHalf * 0.45;

function measure(kind, def, lv) {
  const grid = kind === "header" ? headerGrid(def, lv) : kind === "pass" ? passGrid(def, lv) : shotGrid(def, lv, kind === "freekick");
  let fair = 0;
  let good = 0;
  let total = 0;
  const sweet = { fair: 0, good: 0 };
  const flat = { fair: 0, good: 0 };
  const outs = {};
  for (const sw of grid) {
    total += 1;
    const clear = runSwipe(def, lv, sw, "clear");
    if (!GOOD(kind, clear.out)) continue;
    // Makul: ipucunun söylediğini yapan çekiş (köşeye nişan; kafada iyi zamanlama).
    if (kind !== "pass" && !corner(clear)) continue;
    // Şut ve kafada ipucu "kalecinin uzağına": bırakış anında kalecinin ters yanındaki köşe.
    if ((kind === "shot" || kind === "header") && Math.sign(clear.x - clear.s.goalX) === Math.sign(clear.keeperAt - clear.s.goalX)) continue;
    if (kind === "header" && Math.abs(sw.meta.e) > 0.6) continue;
    const ok = GOOD(kind, runSwipe(def, lv, sw).out);
    if (kind === "freekick") {
      // Tatlı nokta: köşeye giden çekişlerde barajın YANINDAN dolanan belirgin
      // kavis (baraj hizasında top, düz kirişten daha uzakta) düz çekişten
      // iyi mi? Barajın içine bükülen kavis iki gruba da girmez.
      const chordX = clear.x0 + (clear.x - clear.x0) * ((clear.wallY - clear.y0) / (clear.s.goalY - clear.y0));
      const unit = W / 100;
      const around = Math.abs(clear.crossX - clear.s.wallX) > Math.abs(chordX - clear.s.wallX) + unit * 2;
      const bucket = Math.abs(sw.meta.c) >= 0.5 && around ? sweet : Math.abs(sw.meta.c) <= 0.25 ? flat : null;
      if (bucket) {
        bucket.fair += 1;
        if (ok) bucket.good += 1;
      }
      // Oyuncu ekrandaki önizlemenin baraja değdiğini görürse o çekişi seçmez.
      if (runSwipe(def, lv, sw, "preview").out === S.OUT_WALL) continue;
    }
    fair += 1;
    const out = runSwipe(def, lv, sw).out;
    outs[out] = (outs[out] ?? 0) + 1;
    if (ok) good += 1;
  }
  return { fair, good, total, sweet, flat, outs };
}

/* ───────────── rapor ───────────── */

const KINDS = ["freekick", "shot", "penalty", "header", "pass"];
const rate = (g, f) => (f ? g / f : NaN);
const pct = (x) => (Number.isNaN(x) ? "  –  " : `${(x * 100).toFixed(0).padStart(3)}%`);
const table = {};
const special = { wind: [0, 0], wallmove: [0, 0], ace: [0, 0], stack: [0, 0] };
const sweetT = {};

for (const tier of TIERS) {
  table[tier] = {};
  for (const kind of KINDS) {
    const list = byTier.get(`${tier}:${kind}`) ?? [];
    let fair = 0;
    let good = 0;
    let sf = 0, sg = 0, ff = 0, fg = 0;
    for (const { lv, def } of list) {
      const m = measure(kind, def, lv);
      fair += m.fair;
      good += m.good;
      if (kind === "freekick") {
        sf += m.sweet.fair; sg += m.sweet.good; ff += m.flat.fair; fg += m.flat.good;
        const r = [m.good, m.fair];
        const add = (key) => { special[key][0] += r[0]; special[key][1] += r[1]; };
        if (def.mods & L.MOD_WIND) add("wind");
        if (def.mods & L.MOD_WALLMOVE) add("wallmove");
        if (def.mods & L.MOD_ACE) add("ace");
        if (def.mods & L.MOD_WALLMOVE && def.mods & L.MOD_ACE) add("stack");
        if (VERBOSE) console.log(`  L${String(lv).padStart(3)} d=${def.difficulty.toFixed(2)} mods=${def.mods} makul=${m.fair}/${m.total} gol=${pct(rate(m.good, m.fair))} çıktılar=${JSON.stringify(m.outs)}`);
      }
    }
    table[tier][kind] = { rate: rate(good, fair), n: list.length };
    if (kind === "freekick") sweetT[tier] = { sweet: rate(sg, sf), flat: rate(fg, ff) };
  }
}

console.log("\nKariyer Yolu — makul çekişlerden gol/başarı oranı (an sayısı parantezde)\n");
console.log("basamak  " + KINDS.map((k) => k.padEnd(12)).join(""));
for (const tier of TIERS) {
  console.log(`   ${tier}     ` + KINDS.map((k) => `${pct(table[tier][k].rate)} (${String(table[tier][k].n).padStart(2)})`.padEnd(12)).join(""));
}
console.log("\nfrikik tatlı nokta (kavis ≥0,5) / düz (kavis ≤0,25):");
for (const tier of TIERS) console.log(`   ${tier}     ${pct(sweetT[tier].sweet)} / ${pct(sweetT[tier].flat)}`);
console.log("\nfrikik engelleri: " + Object.entries(special).map(([k, [g, f]]) => `${k} ${pct(rate(g, f))} (${f})`).join(" · "));

/* ───────────── bantlar ───────────── */

const fails = [];
const BANDS = { 1: [0.74, 0.86], 2: [0.74, 0.86], 3: [0.54, 0.66], 4: [0.54, 0.66], 5: [0.44, 0.56] };
for (const tier of TIERS) {
  const r = table[tier].freekick.rate;
  const [lo, hi] = BANDS[tier];
  if (!(r >= lo && r <= hi)) fails.push(`frikik basamak ${tier}: %${(r * 100).toFixed(0)} bant dışı (%${Math.round(lo * 100)}–%${Math.round(hi * 100)})`);
  if (tier > 1 && r > table[tier - 1].freekick.rate + 0.05) fails.push(`frikik basamak ${tier}: önceki basamaktan kolay`);
  // Diğer anlarla kıyas: frikik basamağın en zor gol anı olmamalı (penaltı ve
  // kafaya göre) ve kafa vuruşundan (en benzer beceri anı) en çok 20 puan sapmalı.
  const pen = table[tier].penalty.rate;
  const head = table[tier].header.rate;
  const peers = [pen, head].filter((x) => !Number.isNaN(x));
  if (peers.length && r < Math.min(...peers) - 0.05) fails.push(`frikik basamak ${tier}: penaltı/kafadan belirgin zor (yine zayıf halka)`);
  if (!Number.isNaN(head) && Math.abs(r - head) > 0.2) fails.push(`frikik basamak ${tier}: kafadan (%${(head * 100).toFixed(0)}) çok farklı`);
  const sw = sweetT[tier];
  if (!(sw.sweet >= sw.flat + 0.08)) fails.push(`frikik basamak ${tier}: kavisli çekiş düz çekişten belirgin iyi değil (${pct(sw.sweet)} / ${pct(sw.flat)})`);
}
for (const [key, [g, f]] of Object.entries(special)) {
  if (f && g / f < 0.4) fails.push(`frikik ${key}: %${((g / f) * 100).toFixed(0)} — engel adil değil (< %40)`);
}

// Belirlenimcilik: aynı seviye iki kez aynı anları üretmeli.
for (const lv of [19, 63, 80, 120]) {
  if (JSON.stringify(L.generateKariyerLevel(lv)) !== JSON.stringify(L.generateKariyerLevel(lv))) fails.push(`seviye ${lv}: belirlenimci değil`);
}

if (fails.length) {
  console.error("\nBAŞARISIZ:\n  " + fails.join("\n  "));
  process.exit(1);
}
console.log("\nTamam: frikik bantları, tekdüzelik, tatlı nokta ve engel adaleti geçti.");
