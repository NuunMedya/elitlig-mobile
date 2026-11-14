/**
 * ELİT ÜÇLÜ DENETİMİ — seviyelerin geçerli ve ÇÖZÜLEBİLİR olduğunu sayıyla kanıtlar.
 *
 * Çalıştırma:
 *   node --experimental-strip-types --no-warnings scripts/check-puzzle-uclu.mjs [ekSeviye]
 *     → tablodaki TÜM seviyeler + tablodan sonraki `ekSeviye` (varsayılan 20)
 *       üretilmiş seviye denetlenir.
 *   … check-puzzle-uclu.mjs --uret 121 140
 *     → 121–140 için üreteçten aday satırlar basar; hamle sayısı botla
 *       ayarlanır. Çıktı `UCLU_LEVELS` dizisinin SONUNA yapıştırılır.
 *   … --detay → seviye başına satır (hamle, botun harcadığı, hedefler).
 *
 * Ölçülen iddialar:
 *   1. Biçim: sürüm 1, 8×8 ızgara, bilinen karakterler, hamle 10–50, 4–6 taş
 *      türü, hedefler geçerli; 10'un katları zor (Z/S), süper zor seviye var.
 *   2. Başlangıç tahtası: hazır eşleşme (3'lü ya da 2×2) YOK, en az bir olası
 *      hamle VAR; motor "son çare karıştırma"ya düşmez.
 *   3. Hedefler tahtada ulaşılabilir: renk hedefi geçerli renk; engel sayıları
 *      tahtadakiyle tutarlı; her hücre bir 3'lü çizgiye girebilir; kupanın
 *      düşeceği yer var; çim hedefinde en az bir çimli tohum var.
 *   4. ADİL açgözlü bot (yeni gelecek taşları BİLMEZ) seviyelerin çoğunluğunu
 *      hamle sınırında kazanır — kazanma oranı eğrisi basılır.
 *   5. KANIT: motor belirlenimci olduğundan, her seviye için hamle sınırında
 *      kazanan somut bir hamle dizisi bulunur. Bulunamayan varsa çıkış kodu 1.
 *   6. Tablo satırları değişmezlik için parmak iziyle basılır (eklemek serbest,
 *      var olanı değiştirmek değil — gözden geçirmede fark görülür).
 */

import {
  parseUcluLevel, ucluGenerate, ucluLevel, UCLU_LEVELS, UCLU_LEVEL_COUNT, UCLU_PIECES,
} from "../lib/puzzle/levels/uclu.ts";
import {
  allMoves, cloneState, createGame, findGroups, findMove, goalsDone, shuffleBoard, trySwap, H, W,
} from "../lib/puzzle/ucluEngine.ts";

const args = process.argv.slice(2);
const DETAIL = args.includes("--detay");
const GEN = args.indexOf("--uret");
const VALID = new Set([..."#.012345RVDOGmMbBCsnkKg*t"]);
const errors = [];
const fail = (lvl, msg) => errors.push(`seviye ${lvl}: ${msg}`);

/* ───────────────────────────── bot ───────────────────────────── */

function features(s) {
  let crateHp = 0, mud = 0, snow = 0, net = 0, cone = 0, turf = 0, trophyDepth = 0, specials = 0;
  s.cells.forEach((c, i) => {
    crateHp += c.crate;
    mud += c.mud;
    snow += c.snow;
    net += c.net;
    if (c.turf === 2) turf++;
    if (c.tile?.kind === "cone") cone += c.tile.hp ?? 1;
    if (c.tile?.kind === "trophy") trophyDepth += Math.floor(i / W) + 1;
    if (c.tile && c.tile.special !== "none") specials += c.tile.special === "ball" ? 2.2 : c.tile.special === "bomb" ? 1.6 : 1.3;
  });
  const left = s.goals.reduce((n, g) => n + Math.max(0, g.left) * (g.type === "trophy" ? 8 : g.type === "color" ? 1 : 2), 0);
  return { crateHp, mud, snow, net, cone, turf, trophyDepth, specials, left };
}

function value(before, after, s) {
  const has = (t) => s.goals.some((g) => g.type === t && g.left > 0);
  let v = (before.left - after.left) * 10;
  if (has("crate")) v += (before.crateHp - after.crateHp) * 4;
  if (has("cone")) v += (before.cone - after.cone) * 4;
  if (has("mud")) v += (before.mud - after.mud) * 3;
  if (has("snow")) v += (before.snow - after.snow) * 3;
  if (has("turf")) v += (after.turf - before.turf) * 3;
  if (has("trophy")) v += (after.trophyDepth - before.trophyDepth) * 3;
  v += (before.net - after.net) * (has("net") ? 3 : 1.2);
  v += (after.specials - before.specials) * 2.5;
  return v;
}

function trophyLanes(s) {
  const lanes = new Set();
  s.cells.forEach((c, i) => {
    if (c.tile?.kind !== "trophy") return;
    for (let r = Math.floor(i / W) + 1; r < H; r++) lanes.add(r * W + (i % W));
  });
  return lanes;
}

function mkRand(seed) {
  let x = seed >>> 0;
  return () => {
    x = (x + 0x6d2b79f5) >>> 0;
    let t = Math.imul(x ^ (x >>> 15), x | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Açgözlü bot. `fair`: değerlendirme kopyasında rastgele üreteç bozulur, yani
 * bot yeni düşecek taşları göremez (insan gibi). `noise`: eşit-yakın hamleler
 * arasında tohumlu rastgelelik (farklı yollar denemek için).
 */
function play(level, { fair, noise = 0, seed = 1, unlimited = false }) {
  const s = createGame(level);
  if (unlimited) s.moves = 300;
  let used = 0;
  const r = mkRand(seed);
  let shuffles = 0;
  while (s.moves > 0 && !goalsDone(s)) {
    let moves = allMoves(s);
    if (!moves.length) {
      shuffles++;
      if (!shuffleBoard(s)) return { won: false, left: s.moves, shuffles, used };
      moves = allMoves(s);
      if (!moves.length) return { won: false, left: s.moves, shuffles, used };
    }
    const base = features(s);
    const lanes = trophyLanes(s);
    let best = null;
    let bestV = -Infinity;
    for (const [a, b] of moves) {
      for (const [p, q] of [[a, b], [b, a]]) {
        const c = cloneState(s);
        if (fair) c.rng = (c.rng ^ 0x9e3779b9) >>> 0;
        const res = trySwap(c, p, q, false);
        if (!res.ok) continue;
        let lane = 0;
        if (lanes.size) for (const st of res.steps) for (const cl of st.cleared) if (lanes.has(cl.cell)) lane++;
        const v = value(base, features(c), c) + lane * 2 + (goalsDone(c) ? 1000 : 0) + (noise ? r() * noise : 0);
        if (v > bestV) {
          bestV = v;
          best = [p, q];
        }
      }
    }
    if (!best) return { won: false, left: s.moves, shuffles, used };
    trySwap(s, best[0], best[1], false);
    used++;
  }
  return { won: goalsDone(s), left: s.moves, shuffles, used };
}

/* ───────────────────────────── aday üretimi (--uret) ───────────────────────────── */

if (GEN >= 0) {
  const from = Number(args[GEN + 1]) || UCLU_LEVEL_COUNT + 1;
  const to = Number(args[GEN + 2]) || from + 19;
  for (let n = from; n <= to; n++) {
    // İş yükü botla ölçülür; çok kısa / çok uzun seviye ölçeklenip yeniden üretilir.
    const d = Math.min(1, 0.25 + n / 160);
    const lo = 9 + d * 9;
    const hi = 30;
    let boost = 1;
    let p70 = 0;
    let draft;
    for (let k = 0; k < 5; k++) {
      draft = parseUcluLevel(n, ucluGenerate(n, undefined, boost), false);
      const runs = [1, 2, 3, 4, 5, 6].map((j) => play(draft, { fair: true, unlimited: true, noise: j === 1 ? 0 : 2 + j, seed: n * 31 + j }).used ?? 300);
      runs.sort((a, b) => a - b);
      p70 = runs[Math.floor(runs.length * 0.7)];
      if (DETAIL) console.error(n, boost.toFixed(2), runs.join(","));
      if (draft.breather || (p70 >= lo && p70 <= hi)) break;
      boost *= p70 < lo ? 1.3 : 0.8;
    }
    const slack = draft.hardness === "super" ? 0.9 : draft.hardness === "zor" ? 0.98 : draft.breather ? 1.4 : 1.08 + 0.1 * Math.sin(n * 0.9);
    let moves = Math.max(12, Math.min(48, Math.round(p70 * slack + 2)));
    // Kanıt: hamle sınırında kazanan dizi bulunana dek pay artar.
    for (let k = 0; k < 6; k++) {
      const L = parseUcluLevel(n, ucluGenerate(n, moves, boost), false);
      let ok = play(L, { fair: true }).won;
      for (let a = 0; !ok && a < 6; a++) ok = play(L, { fair: false, noise: 3 + a * 2, seed: L.seed + a * 101 }).won;
      if (ok) break;
      moves += 2;
    }
    console.log(`  /* ${n} */ ${JSON.stringify(ucluGenerate(n, moves, boost))},`);
  }
  process.exit(0);
}

/* ───────────────────────────── yapısal denetim ───────────────────────────── */

function lineable(layout, r, c) {
  const open = (rr, cc) => rr >= 0 && rr < H && cc >= 0 && cc < W && layout[rr][cc] !== "#";
  for (let k = -2; k <= 0; k++) {
    if (open(r, c + k) && open(r, c + k + 1) && open(r, c + k + 2)) return true;
    if (open(r + k, c) && open(r + k + 1, c) && open(r + k + 2, c)) return true;
  }
  return false;
}

function structural(L) {
  const n = L.level;
  if (L.layout.length !== H || L.layout.some((row) => row.length !== W)) return fail(n, "ızgara 8×8 değil");
  for (const row of L.layout) for (const ch of row) if (!VALID.has(ch)) fail(n, `bilinmeyen karakter '${ch}'`);
  if (L.moves < 10 || L.moves > 50) fail(n, `hamle sayısı makul değil (${L.moves})`);
  if (L.colors < 4 || L.colors > 6) fail(n, `taş türü ${L.colors}`);
  if (L.fixed && n % 10 === 0 && L.hardness === "normal") fail(n, "10'un katı seviye zor değil");
  if (!L.goals.length) fail(n, "hedef yok");
  const count = (set) => L.layout.reduce((k, row) => k + [...row].filter((ch) => set.includes(ch)).length, 0);
  for (const g of L.goals) {
    if (g.count <= 0) fail(n, `hedef sayısı ${g.count} (${g.type})`);
    if (g.type === "color" && !(g.color >= 0 && g.color < L.colors)) fail(n, `renk hedefi geçersiz (${g.color})`);
    const sets = { mud: "mM", crate: "bBC", snow: "s", net: "n", turf: "g", cone: "kK" };
    if (sets[g.type] && g.count > count(sets[g.type])) fail(n, `${g.type} hedefi ${g.count} > tahtadaki ${count(sets[g.type])}`);
    if (g.type === "turf" && count("*") === 0) fail(n, "çim hedefi var ama çimli tohum yok");
    if (g.type === "trophy") {
      if (g.count !== count("t") + L.trophySpawn) fail(n, "kupa hedefi sahadaki + gelecek kupaya eşit değil");
      L.layout.forEach((row, r) => [...row].forEach((ch, c) => {
        if (ch !== "t") return;
        let below = 0;
        for (let k = r + 1; k < H; k++) if (L.layout[k][c] !== "#") below++;
        if (below === 0) fail(n, `kupa (${r},${c}) zaten en altta`);
      }));
    }
  }
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    if (L.layout[r][c] !== "#" && !lineable(L.layout, r, c)) fail(n, `(${r},${c}) hiçbir 3'lü çizgiye girmiyor`);
  }
  for (let c = 0; c < W; c++) if (L.layout.every((row) => row[c] === "#")) fail(n, `${c}. sütun tamamen boş`);
  const s = createGame(L);
  if (findGroups(s).length) fail(n, "başlangıç tahtasında hazır eşleşme var");
  if (!findMove(s)) fail(n, "başlangıç tahtasında olası hamle yok");
  // Sabit karakterler korunmuş mu (son çare karıştırma bozmamış)?
  L.layout.forEach((row, r) => [...row].forEach((ch, c) => {
    if (ch >= "0" && ch <= "5") {
      const t = s.cells[r * W + c].tile;
      if (!t || t.color !== Number(ch) % L.colors) fail(n, `sabit taş (${r},${c}) korunmadı`);
    }
  }));
}

/* ───────────────────────────── çalıştır ───────────────────────────── */

const EXTRA = Number(args.find((a) => /^\d+$/.test(a))) || 20;
const COUNT = UCLU_LEVEL_COUNT + EXTRA;
const t0 = Date.now();
const levels = [];
if (UCLU_LEVEL_COUNT < 100) fail("-", `tabloda ${UCLU_LEVEL_COUNT} seviye var (en az 100 olmalı)`);
for (let n = 1; n <= COUNT; n++) {
  let L;
  try {
    L = ucluLevel(n);
  } catch (e) {
    fail(n, String(e.message ?? e));
    continue;
  }
  if (L.level !== n) fail(n, "seviye numarası tutmuyor");
  if (n <= UCLU_LEVEL_COUNT && !L.fixed) fail(n, "tablo seviyesi değil");
  structural(L);
  levels.push(L);
}
const tStruct = Date.now();

const BUCKET = 20;
const curve = [];
let fairWins = 0;
let proved = 0;
const unproved = [];
const mechs = { mud: 0, crate: 0, snow: 0, net: 0, turf: 0, cone: 0, trophy: 0, shaped: 0, six: 0, zor: 0, super: 0 };
let movesSum = 0;
const hardStats = { wins: 0, total: 0 };
let minMoves = 99;
let maxMoves = 0;

for (const L of levels) {
  const has = (set) => L.layout.some((row) => [...row].some((ch) => set.includes(ch)));
  if (has("mM")) mechs.mud++;
  if (has("bBC")) mechs.crate++;
  if (has("s")) mechs.snow++;
  if (has("n")) mechs.net++;
  if (has("g")) mechs.turf++;
  if (has("kK")) mechs.cone++;
  if (L.goals.some((g) => g.type === "trophy")) mechs.trophy++;
  if (has("#")) mechs.shaped++;
  if (L.colors === 6) mechs.six++;
  if (L.hardness === "zor") mechs.zor++;
  if (L.hardness === "super") mechs.super++;
  movesSum += L.moves;
  minMoves = Math.min(minMoves, L.moves);
  maxMoves = Math.max(maxMoves, L.moves);

  const fair = play(L, { fair: true });
  if (L.cup) {
    hardStats.total++;
    if (fair.won) hardStats.wins++;
  }
  if (DETAIL) {
    const used = [1, 2, 3].map((k) => play(L, { fair: true, unlimited: true, noise: k === 1 ? 0 : 3, seed: k }).used);
    console.log(`${L.level}\thamle ${L.moves}\tbot ${used.join(",")}\t${fair.won ? "K" : "-"}\t${L.hardness}\t` + L.goals.map((g) => `${g.type}${g.count}`).join(" "));
  }
  if (fair.won) fairWins++;
  const b = Math.floor((L.level - 1) / BUCKET);
  curve[b] ??= { wins: 0, total: 0, left: 0 };
  curve[b].total++;
  if (fair.won) {
    curve[b].wins++;
    curve[b].left += fair.left / L.moves;
  }

  let ok = fair.won;
  for (let attempt = 0; !ok && attempt < 8; attempt++) {
    ok = play(L, { fair: false, noise: attempt === 0 ? 0 : 3 + attempt * 2, seed: L.seed + attempt * 101 }).won;
  }
  if (ok) proved++;
  else unproved.push(L.level);
}
const tBot = Date.now();

// Parmak izi: tablo satırlarının özeti (değişirse gözden geçirmede görünür).
let fp = 0;
for (const line of UCLU_LEVELS) for (let k = 0; k < line.length; k++) fp = (Math.imul(fp, 31) + line.charCodeAt(k)) >>> 0;

console.log(`ELİT ÜÇLÜ — tablo ${UCLU_LEVEL_COUNT} seviye + ${EXTRA} üretilmiş; ${levels.length} seviye doğrulandı (${tStruct - t0} ms yapı, ${tBot - tStruct} ms bot).`);
console.log(`Tablo parmak izi: ${fp.toString(16)} (biçim 1).`);
console.log(`Hamle aralığı ${minMoves}–${maxMoves}, ortalama ${(movesSum / Math.max(1, levels.length)).toFixed(1)}.`);
console.log(
  `Mekanik dağılımı: çamur ${mechs.mud}, kutu ${mechs.crate}, buz ${mechs.snow}, ağ ${mechs.net}, çim ${mechs.turf}, ` +
    `koni ${mechs.cone}, kupa indir ${mechs.trophy}, şekilli ${mechs.shaped}, 6 tür ${mechs.six}, zor ${mechs.zor}, süper zor ${mechs.super}.`,
);
console.log(`Taş türleri: ${UCLU_PIECES.map((p) => p.name).join(", ")}.`);
console.log("\nAdil açgözlü bot — kazanma oranı eğrisi (yeni taşları bilmeden):");
curve.forEach((c, i) => {
  const from = i * BUCKET + 1;
  const to = Math.min(COUNT, (i + 1) * BUCKET);
  const pct = Math.round((c.wins / c.total) * 100);
  const bar = "#".repeat(Math.round(pct / 5)).padEnd(20, ".");
  const spare = c.wins ? Math.round((c.left / c.wins) * 100) : 0;
  console.log(`  ${String(from).padStart(3)}–${String(to).padEnd(3)} ${bar} ${String(pct).padStart(3)}%  (kazanınca kalan hamle ort. %${spare})`);
});
const fairPct = Math.round((fairWins / Math.max(1, levels.length)) * 100);
console.log(`\nAdil bot toplam: ${fairWins}/${levels.length} (%${fairPct}); zor/süper zor ${hardStats.wins}/${hardStats.total}.`);
console.log(`Kanıtlı çözülebilir (hamle sınırında kazanan somut dizi): ${proved}/${levels.length}.`);
if (unproved.length) fail("-", `kanıt bulunamayan seviyeler: ${unproved.join(", ")}`);
if (fairPct < 55) fail("-", `adil bot kazanma oranı %${fairPct} < %55 (seviyelerin çoğunluğu kazanılabilir olmalı)`);
if (!mechs.super) fail("-", "süper zor seviye yok");

if (errors.length) {
  console.error(`\n${errors.length} hata:`);
  for (const e of errors.slice(0, 60)) console.error("  · " + e);
  process.exit(1);
}
console.log("\nTüm denetimler geçti.");
