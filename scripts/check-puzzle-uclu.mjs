/**
 * ELİT ÜÇLÜ DENETİMİ — seviyelerin geçerli ve ÇÖZÜLEBİLİR olduğunu sayıyla kanıtlar.
 *
 * Çalıştırma:
 *   node --experimental-strip-types --no-warnings scripts/check-puzzle-uclu.mjs [seviyeSayısı]
 *
 * Ölçülen iddialar (ilk 300 seviye, varsayılan):
 *   1. Yapı: 8×8 ızgara, bilinen karakterler, hamle 14–42, 5–6 taş türü,
 *      her 10. seviye kupa maçı, tanıtım ipuçları takvimde.
 *   2. Başlangıç tahtası: hazır eşleşme YOK, en az bir olası hamle VAR.
 *   3. Hedefler tahtada ulaşılabilir: renk hedefi geçerli renk; çamur/kutu/kar
 *      sayısı tahtadakiyle aynı; her hücre bir 3'lü çizgiye dahil olabilir
 *      (çamur altındaki taş eşleşebilir); kupanın düşeceği sütun var.
 *   4. ADİL açgözlü bot (yeni gelecek taşları BİLMEZ) seviyelerin çoğunluğunu
 *      hamle sınırında kazanır — kazanma oranı eğrisi basılır.
 *   5. KANIT: motor belirlenimci olduğundan (aynı seviye + aynı hamleler = aynı
 *      sonuç), her seviye için hamle sınırında kazanan somut bir hamle dizisi
 *      bulunur. Bulunamayan seviye varsa çıkış kodu 1.
 */

import { ucluLevel, UCLU_PIECES } from "../lib/puzzle/levels/uclu.ts";
import {
  allMoves, cloneState, createGame, findGroups, findMove, goalsDone, shuffleBoard, trySwap, H, W,
} from "../lib/puzzle/ucluEngine.ts";

const COUNT = Number(process.argv[2]) || 300;
/** `--detay`: seviye başına satır (ayar için): hamle, sınırsız hamlede botun harcadığı. */
const DETAIL = process.argv.includes("--detay");
const VALID = new Set([..."#.012345RVOGmMbBCsnt"]);
const errors = [];
const fail = (lvl, msg) => errors.push(`seviye ${lvl}: ${msg}`);

/* ───────────────────────────── değerlendirme ───────────────────────────── */

function features(s) {
  let crateHp = 0, mud = 0, snow = 0, net = 0, trophyDepth = 0, specials = 0;
  s.cells.forEach((c, i) => {
    crateHp += c.crate;
    mud += c.mud;
    snow += c.snow;
    net += c.net;
    if (c.tile?.kind === "trophy") trophyDepth += Math.floor(i / W) + 1;
    if (c.tile && c.tile.special !== "none") specials += c.tile.special === "ball" ? 2.2 : c.tile.special === "bomb" ? 1.6 : 1.3;
  });
  const left = s.goals.reduce((n, g) => n + Math.max(0, g.left) * (g.type === "trophy" ? 8 : g.type === "color" ? 1 : 2), 0);
  return { crateHp, mud, snow, net, trophyDepth, specials, left };
}

function value(before, after, s) {
  const has = (t) => s.goals.some((g) => g.type === t && g.left > 0);
  let v = (before.left - after.left) * 10;
  if (has("crate")) v += (before.crateHp - after.crateHp) * 4;
  if (has("mud")) v += (before.mud - after.mud) * 3;
  if (has("snow")) v += (before.snow - after.snow) * 3;
  if (has("trophy")) v += (after.trophyDepth - before.trophyDepth) * 3;
  v += (before.net - after.net) * 1.2;
  v += (after.specials - before.specials) * 2.5;
  return v;
}

/** Kupanın altındaki hücreler (kupa sütununda temizlenen her taş kupayı indirir). */
function trophyLanes(s) {
  const lanes = new Set();
  s.cells.forEach((c, i) => {
    if (c.tile?.kind !== "trophy") return;
    for (let r = Math.floor(i / W) + 1; r < H; r++) lanes.add(r * W + (i % W));
  });
  return lanes;
}

/**
 * Açgözlü bot. `fair`: değerlendirme kopyasında rastgele üreteç bozulur, yani
 * bot yeni düşecek taşları göremez (insan gibi). `noise`: eşit-yakın hamleler
 * arasında tohumlu rastgelelik (kanıt aramasında farklı yollar denemek için).
 */
function play(level, { fair, noise = 0, seed = 1, unlimited = false }) {
  const s = createGame(level);
  if (unlimited) s.moves = 400;
  let used = 0;
  let x = seed >>> 0;
  const r = () => {
    x = (x + 0x6d2b79f5) >>> 0;
    let t = Math.imul(x ^ (x >>> 15), x | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  let shuffles = 0;
  while (s.moves > 0 && !goalsDone(s)) {
    let moves = allMoves(s);
    if (!moves.length) {
      shuffles++;
      if (!shuffleBoard(s)) return { won: false, left: s.moves, shuffles };
      moves = allMoves(s);
      if (!moves.length) return { won: false, left: s.moves, shuffles };
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
    if (!best) return { won: false, left: s.moves, shuffles };
    trySwap(s, best[0], best[1], false);
    used++;
  }
  return { won: goalsDone(s), left: s.moves, shuffles, used };
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
  if (L.moves < 14 || L.moves > 42) fail(n, `hamle sayısı makul değil (${L.moves})`);
  if (L.colors < 5 || L.colors > 6) fail(n, `taş türü ${L.colors}`);
  if ((n % 10 === 0) !== L.cup) fail(n, "kupa maçı işareti yanlış");
  if (!L.goals.length) fail(n, "hedef yok");
  const count = (set) => L.layout.reduce((k, row) => k + [...row].filter((ch) => set.includes(ch)).length, 0);
  for (const g of L.goals) {
    if (g.count <= 0) fail(n, `hedef sayısı ${g.count}`);
    if (g.type === "color" && !(g.color >= 0 && g.color < L.colors)) fail(n, `renk hedefi geçersiz (${g.color})`);
    if (g.type === "mud" && g.count !== count("mM")) fail(n, `çamur hedefi ${g.count} ≠ tahtadaki ${count("mM")}`);
    if (g.type === "crate" && g.count > count("bBC")) fail(n, `kutu hedefi ${g.count} > tahtadaki ${count("bBC")}`);
    if (g.type === "snow" && g.count !== count("s")) fail(n, `kar hedefi ${g.count} ≠ tahtadaki ${count("s")}`);
    if (g.type === "trophy") {
      if (g.count !== count("t") + L.trophySpawn) fail(n, "kupa hedefi sahadaki + gelecek kupaya eşit değil");
      // Kupa sahadaki sütununda en alta inebilmeli: altında en az bir açık hücre.
      L.layout.forEach((row, r) => [...row].forEach((ch, c) => {
        if (ch !== "t") return;
        let below = 0;
        for (let k = r + 1; k < H; k++) if (L.layout[k][c] !== "#") below++;
        if (below === 0) fail(n, `kupa (${r},${c}) zaten en altta`);
      }));
    }
  }
  // Her açık hücre bir 3'lü çizgiye girebilmeli (çamur, kar, ağ altındaki taş eşleşebilir).
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    if (L.layout[r][c] !== "#" && !lineable(L.layout, r, c)) fail(n, `(${r},${c}) hiçbir 3'lü çizgiye girmiyor`);
  }
  // Her sütunun en az bir açık hücresi (yeni taş girişi) olmalı.
  for (let c = 0; c < W; c++) if (L.layout.every((row) => row[c] === "#")) fail(n, `${c}. sütun tamamen boş`);
  const s = createGame(L);
  if (findGroups(s).length) fail(n, "başlangıç tahtasında hazır eşleşme var");
  if (!findMove(s)) fail(n, "başlangıç tahtasında olası hamle yok");
  if (L.tip && typeof L.tip !== "string") fail(n, "ipucu metni değil");
}

/* ───────────────────────────── çalıştır ───────────────────────────── */

const t0 = Date.now();
const levels = [];
for (let n = 1; n <= COUNT; n++) {
  const L = ucluLevel(n);
  if (L.level !== n) fail(n, "seviye numarası tutmuyor");
  // Belirlenimcilik: iki üretim birebir aynı.
  const again = JSON.stringify(ucluLevel(n));
  if (again !== JSON.stringify(L)) fail(n, "üretim belirlenimci değil");
  structural(L);
  levels.push(L);
}
const tStruct = Date.now();

const BUCKET = 30;
const curve = [];
let fairWins = 0;
let proved = 0;
const unproved = [];
const mechs = { mud: 0, crate: 0, snow: 0, trophy: 0, net: 0, shaped: 0, six: 0, cup: 0 };
let movesSum = 0;
const cupStats = { wins: 0, total: 0 };
let minMoves = 99;
let maxMoves = 0;

for (const L of levels) {
  const has = (set) => L.layout.some((row) => [...row].some((ch) => set.includes(ch)));
  if (has("mM")) mechs.mud++;
  if (has("bBC")) mechs.crate++;
  if (has("s")) mechs.snow++;
  if (L.goals.some((g) => g.type === "trophy")) mechs.trophy++;
  if (has("n")) mechs.net++;
  if (has("#")) mechs.shaped++;
  if (L.colors === 6) mechs.six++;
  if (L.cup) mechs.cup++;
  movesSum += L.moves;
  minMoves = Math.min(minMoves, L.moves);
  maxMoves = Math.max(maxMoves, L.moves);

  const fair = play(L, { fair: true });
  if (L.cup) {
    cupStats.total++;
    if (fair.won) cupStats.wins++;
  }
  if (DETAIL) {
    const used = [1, 2, 3].map((k) => play({ ...L, seed: L.seed }, { fair: true, unlimited: true, noise: k === 1 ? 0 : 2, seed: k }).used);
    console.log(
      `${L.level}\thamle ${L.moves}\tbot ${used.join(",")}\t${fair.won ? "K" : "-"}\t${L.colors}\t` +
        L.goals.map((g) => `${g.type}${g.count}`).join(" "),
    );
  }
  if (fair.won) fairWins++;
  const b = Math.floor((L.level - 1) / BUCKET);
  curve[b] ??= { wins: 0, total: 0, left: 0 };
  curve[b].total++;
  if (fair.won) {
    curve[b].wins++;
    curve[b].left += fair.left / L.moves;
  }

  // Kanıt araması: belirlenimci motorda kazanan bir hamle dizisi.
  let ok = fair.won;
  for (let attempt = 0; !ok && attempt < 8; attempt++) {
    ok = play(L, { fair: false, noise: attempt === 0 ? 0 : 3 + attempt * 2, seed: L.seed + attempt * 101 }).won;
  }
  if (ok) proved++;
  else unproved.push(L.level);
}
const tBot = Date.now();

console.log(`ELİT ÜÇLÜ — ${COUNT} seviye üretildi ve doğrulandı (${tStruct - t0} ms yapı, ${tBot - tStruct} ms bot).`);
console.log(`Hamle aralığı ${minMoves}–${maxMoves}, ortalama ${(movesSum / COUNT).toFixed(1)}.`);
console.log(
  `Mekanik dağılımı: çamur ${mechs.mud}, krampon kutusu ${mechs.crate}, kar ${mechs.snow}, kupa indir ${mechs.trophy}, ` +
    `kale ağı ${mechs.net}, şekilli tahta ${mechs.shaped}, 6 taş türü ${mechs.six}, kupa maçı ${mechs.cup}.`,
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
const fairPct = Math.round((fairWins / COUNT) * 100);
console.log(`\nAdil bot toplam: ${fairWins}/${COUNT} (%${fairPct}); kupa maçları ${cupStats.wins}/${cupStats.total}.`);
console.log(`Kanıtlı çözülebilir (hamle sınırında kazanan somut dizi): ${proved}/${COUNT}.`);
if (unproved.length) fail("-", `kanıt bulunamayan seviyeler: ${unproved.join(", ")}`);
if (fairPct < 55) fail("-", `adil bot kazanma oranı %${fairPct} < %55 (seviyelerin çoğunluğu kazanılabilir olmalı)`);

if (errors.length) {
  console.error(`\n${errors.length} hata:`);
  for (const e of errors.slice(0, 60)) console.error("  · " + e);
  process.exit(1);
}
console.log("\nTüm denetimler geçti.");
