/**
 * ÜÇLE KAZAN DENETİMİ — ilk 300 seviyenin geçerli ve ÇÖZÜLEBİLİR olduğunu
 * sayıyla kanıtlar.
 *
 * Çalıştırma:  node --experimental-strip-types --no-warnings scripts/check-puzzle-ucle.mjs
 *
 * Kurallar burada BAĞIMSIZ olarak yeniden yazılır (üreticinin kendi
 * `simulate`ına güvenilmez):
 *   1. Karo sayısı 3'ün katı; her türün adedi 3'ün katı; tür paletin içinde.
 *   2. Aynı katmanda iki karo çakışmaz; kilit grubunun anahtarı vardır;
 *      zincirli karonun en az bir komşusu vardır; ters karo başta kapalıdır.
 *   3. Tanık çözüm 7'lik rafla (güçlendiricisiz) kurallara uygun oynanır.
 *   4. Ayrıca tanıktan habersiz bir arama çözücüsü (açgözlü + geri izleme)
 *      tahtayı sıfırdan çözmeye çalışır.
 *   5. Zorluk raporu: rafın en yüksek doluluğu, dallanma (adım başına serbest
 *      karo), "sezgisel oyuncu" kazanma oranı — seviye aralıklarına göre.
 * Hata varsa çıkış kodu 1.
 */

import { generateUcleLevel } from "../lib/puzzle/levels/ucle.ts";
import { UCLE_KINDS } from "../lib/puzzle/uclePalette.ts";

const LEVELS = 300;
const RACK = 7;
const errors = [];
const fail = (lvl, msg) => errors.push(`seviye ${lvl}: ${msg}`);

/* ───────────── bağımsız kurallar ───────────── */

function relations(tiles) {
  const cov = tiles.map((t) =>
    tiles.filter((o) => o.z > t.z && Math.abs(o.x - t.x) < 2 && Math.abs(o.y - t.y) < 2).map((o) => o.id),
  );
  const nb = tiles.map((t) => tiles.filter((o) => o.z === t.z && o.y === t.y && Math.abs(o.x - t.x) === 2).map((o) => o.id));
  const key = {};
  for (const t of tiles) if (t.key != null) key[t.key] = t.id;
  return { cov, nb, key };
}

function isFree(tiles, rel, on, i) {
  if (!on[i]) return false;
  if (rel.cov[i].some((b) => on[b])) return false;
  const t = tiles[i];
  if (t.lock != null && on[rel.key[t.lock]]) return false;
  if (t.chain && rel.nb[i].every((n) => on[n])) return false;
  return true;
}

/** Hamle: raf sayaçlarını günceller; dönüş false = raf doldu. */
function take(rack, kind, size) {
  rack.set(kind, (rack.get(kind) || 0) + 1);
  if (rack.get(kind) === 3) rack.delete(kind);
  let n = 0;
  for (const v of rack.values()) n += v;
  return { ok: n < size, n };
}

function playOrder(tiles, rel, order) {
  const on = tiles.map(() => true);
  const rack = new Map();
  let peak = 0;
  let branch = 0;
  for (const i of order) {
    let free = 0;
    for (let j = 0; j < tiles.length; j++) if (isFree(tiles, rel, on, j)) free++;
    branch += free;
    if (!isFree(tiles, rel, on, i)) return { ok: false, why: `karo ${i} serbest değil` };
    on[i] = false;
    const r = take(rack, tiles[i].kind, RACK);
    peak = Math.max(peak, r.n);
    if (!r.ok) return { ok: false, why: "raf doldu" };
  }
  if (on.some(Boolean) || rack.size) return { ok: false, why: "tahta bitmedi" };
  return { ok: true, peak, branch: branch / order.length };
}

/** Tanıktan habersiz arama: önce üçlüyü tamamlayan, sonra çifte uyan karo. */
function solve(tiles, rel, budget = 60000) {
  const on = tiles.map(() => true);
  const rack = new Map();
  const seen = new Set();
  let nodes = 0;
  let peak = 0;
  const path = [];
  const rec = (left) => {
    if (left === 0) return true;
    if (++nodes > budget) return false;
    const sig = on.map((v) => (v ? 1 : 0)).join("") + "|" + [...rack.entries()].sort().join(";");
    if (seen.has(sig)) return false;
    seen.add(sig);
    const free = [];
    for (let j = 0; j < tiles.length; j++) if (isFree(tiles, rel, on, j)) free.push(j);
    // Aynı türden çok serbest karo varsa öne al (eş bulma şansı).
    const freeKind = new Map();
    for (const j of free) freeKind.set(tiles[j].kind, (freeKind.get(tiles[j].kind) || 0) + 1);
    free.sort((a, b) => {
      const ka = tiles[a].kind, kb = tiles[b].kind;
      const sa = (rack.get(ka) || 0) * 10 + freeKind.get(ka) - tiles[a].z * 0.01;
      const sb = (rack.get(kb) || 0) * 10 + freeKind.get(kb) - tiles[b].z * 0.01;
      return sb - sa;
    });
    for (const j of free) {
      const k = tiles[j].kind;
      const before = rack.get(k) || 0;
      on[j] = false;
      const r = take(rack, k, RACK);
      if (r.ok) {
        path.push(j);
        const p0 = peak;
        peak = Math.max(peak, r.n);
        if (rec(left - 1)) return true;
        peak = p0;
        path.pop();
      }
      on[j] = true;
      if (before === 0) rack.delete(k); else rack.set(k, before);
    }
    return false;
  };
  const ok = rec(tiles.length);
  return { ok, nodes, peak, path };
}

/** Sezgisel oyuncu: üçlüyü tamamla > çifte ekle > görünen eşi çok olan tür. 20 deneme. */
function heuristicWinRate(tiles, rel, seedBase) {
  let wins = 0;
  const N = 20;
  for (let g = 0; g < N; g++) {
    let s = (seedBase * 31 + g * 977) >>> 0;
    const rnd = () => ((s = (Math.imul(s ^ (s >>> 15), 2246822519) + 0x9e3779b9) >>> 0) / 4294967296);
    const on = tiles.map(() => true);
    const rack = new Map();
    let left = tiles.length;
    let ok = true;
    while (left > 0) {
      const free = [];
      for (let j = 0; j < tiles.length; j++) if (isFree(tiles, rel, on, j)) free.push(j);
      if (!free.length) { ok = false; break; }
      // Gerçek oyuncu gibi: görünen eşlere bakar (tür başına serbest karo sayısı).
      const vis = new Map();
      for (const j of free) vis.set(tiles[j].kind, (vis.get(tiles[j].kind) || 0) + 1);
      const score = (j) => {
        const k = tiles[j].kind;
        const inRack = rack.get(k) || 0;
        return inRack * 4 + Math.min(3 - inRack, vis.get(k)) * 2 + rnd();
      };
      let top = -1;
      let best = [];
      for (const j of free) {
        const v = score(j);
        if (v > top) { top = v; best = [j]; }
      }
      const j = best[Math.floor(rnd() * best.length)];
      on[j] = false;
      left--;
      if (!take(rack, tiles[j].kind, RACK).ok) { ok = false; break; }
    }
    if (ok) wins++;
  }
  return wins / N;
}

/* ───────────── denetim ───────────── */

const rows = [];
const t0 = Date.now();
for (let level = 1; level <= LEVELS; level++) {
  let lvl;
  try {
    lvl = generateUcleLevel(level);
  } catch (e) {
    fail(level, `üretilemedi (${e.message})`);
    continue;
  }
  const again = generateUcleLevel(level);
  if (JSON.stringify(again.tiles) !== JSON.stringify(lvl.tiles)) fail(level, "belirlenimci değil");
  const { tiles } = lvl;
  if (tiles.length % 3 !== 0) fail(level, `karo sayısı ${tiles.length} 3'ün katı değil`);
  const counts = new Map();
  for (const t of tiles) counts.set(t.kind, (counts.get(t.kind) || 0) + 1);
  for (const [k, c] of counts) {
    if (c % 3 !== 0) fail(level, `tür ${k} adedi ${c} 3'ün katı değil`);
    if (k < 0 || k >= UCLE_KINDS.length) fail(level, `tür ${k} paletin dışında`);
  }
  tiles.forEach((t, i) => { if (t.id !== i) fail(level, `karo kimliği ${t.id} ≠ dizin ${i}`); });
  const rel = relations(tiles);
  for (const a of tiles)
    for (const b of tiles)
      if (a.id < b.id && a.z === b.z && Math.abs(a.x - b.x) < 2 && Math.abs(a.y - b.y) < 2) fail(level, `karo ${a.id}/${b.id} aynı katmanda çakışıyor`);
  for (const t of tiles) {
    if (t.lock != null && rel.key[t.lock] == null) fail(level, `kilit grubu ${t.lock} anahtarsız`);
    if (t.chain && rel.nb[t.id].length === 0) fail(level, `zincirli karo ${t.id} komşusuz`);
    if (t.hidden && rel.cov[t.id].length === 0) fail(level, `ters karo ${t.id} başta açık`);
  }
  if (lvl.cup !== (level % 10 === 0)) fail(level, "kupa maçı işareti yanlış");
  if (lvl.rackSize !== RACK) fail(level, `raf ${lvl.rackSize} ≠ 7`);

  const w = playOrder(tiles, rel, lvl.solution);
  if (!w.ok) fail(level, `tanık çözüm geçersiz: ${w.why}`);
  const s = solve(tiles, rel);
  if (s.ok) {
    const check = playOrder(tiles, rel, s.path);
    if (!check.ok) fail(level, `çözücü yolu geçersiz: ${check.why}`);
  }
  rows.push({
    level,
    tiles: tiles.length,
    kinds: counts.size,
    layers: lvl.layers,
    timed: lvl.timeLimit != null,
    hidden: tiles.filter((t) => t.hidden).length,
    locks: tiles.filter((t) => t.lock != null).length,
    chains: tiles.filter((t) => t.chain).length,
    width: lvl.width,
    witnessPeak: w.ok ? w.peak : NaN,
    branch: w.ok ? w.branch : NaN,
    solved: s.ok,
    solverPeak: s.ok ? s.peak : NaN,
    nodes: s.nodes,
    winRate: heuristicWinRate(tiles, rel, level),
  });
}

// Mekanik takvimi: tanıtım seviyelerinde mekanik gerçekten var mı?
const at = (n) => rows.find((r) => r.level === n);
if (at(1) && at(1).layers !== 1) errors.push("seviye 1 tek katman olmalı");
if (at(4) && at(4).layers < 2) errors.push("seviye 4 katmanlı olmalı");
if (at(9) && at(9).hidden === 0) errors.push("seviye 9'da ters karo yok");
if (at(15) && !at(15).timed) errors.push("seviye 15 süreli olmalı");
if (at(20) && at(20).locks === 0) errors.push("seviye 20'de kilit yok");
if (at(30) && at(30).chains === 0) errors.push("seviye 30'da zincir yok");
for (const r of rows) if (r.level < 9 && (r.hidden || r.locks || r.chains || r.timed)) errors.push(`seviye ${r.level}: mekanik erken geldi`);

/* ───────────── rapor ───────────── */

const ranges = [[1, 10], [11, 30], [31, 60], [61, 100], [101, 150], [151, 200], [201, 250], [251, 300]];
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const f1 = (v) => v.toFixed(1).padStart(5);
console.log("ÜÇLE KAZAN — seviye denetimi (7'lik raf, güçlendiricisiz)\n");
console.log("aralık    karo  tür  katman  tanıkTepe  çözücüTepe  dallanma  sezgiselKazanç  süreli kilit zincir ters  kupaKaro");
for (const [a, b] of ranges) {
  const rs = rows.filter((r) => r.level >= a && r.level <= b);
  if (!rs.length) continue;
  const cups = rs.filter((r) => r.level % 10 === 0);
  console.log(
    `${String(a).padStart(3)}–${String(b).padEnd(4)} ${f1(avg(rs.map((r) => r.tiles)))} ${f1(avg(rs.map((r) => r.kinds)))} ${f1(avg(rs.map((r) => r.layers)))}` +
      `   ${f1(avg(rs.map((r) => r.witnessPeak)))} (en ${String(Math.max(...rs.map((r) => r.witnessPeak))).padStart(1)})` +
      `  ${f1(avg(rs.filter((r) => r.solved).map((r) => r.solverPeak)))}     ${f1(avg(rs.map((r) => r.branch)))}` +
      `       %${(avg(rs.map((r) => r.winRate)) * 100).toFixed(0).padStart(3)}` +
      `        ${String(rs.filter((r) => r.timed).length).padStart(3)}  ${String(rs.filter((r) => r.locks).length).padStart(4)}  ${String(rs.filter((r) => r.chains).length).padStart(5)} ${String(rs.filter((r) => r.hidden).length).padStart(4)}   ${f1(avg(cups.map((r) => r.tiles)))}`,
  );
}
const solved = rows.filter((r) => r.solved).length;
console.log(`\nÜretilen: ${rows.length}/${LEVELS} · tanıkla kanıtlanan: ${rows.filter((r) => !Number.isNaN(r.witnessPeak)).length} · arama çözücüsünün sıfırdan çözdüğü: ${solved}`);
console.log(`En büyük tahta: ${Math.max(...rows.map((r) => r.tiles))} karo · süre: ${Date.now() - t0} ms`);

if (errors.length) {
  console.error(`\n${errors.length} hata:`);
  for (const e of errors.slice(0, 40)) console.error("  · " + e);
  process.exit(1);
}
console.log("Bütün seviyeler geçerli ve 7'lik rafla çözülebilir.");
