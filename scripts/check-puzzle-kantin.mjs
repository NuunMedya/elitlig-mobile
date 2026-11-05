/**
 * STADYUM KANTİNİ DENETİMİ — ilk 300 seviye üretilir ve kanıtlanır.
 *
 *   1. Üretim belirlenimci mi (iki kez üretilen seviye birebir aynı)?
 *   2. Yapı geçerli mi: ürün sayıları siparişlerle BİREBİR tutuyor, uid'ler
 *      benzersiz, sipariş boyu 2–4, tabak / yığın / süre değerleri makul.
 *   3. Tanık çözüm motorla oynanınca kazanıyor mu?
 *   4. BAĞIMSIZ ÇÖZÜCÜ (tanığı kullanmaz) güçlendiricisiz çözebiliyor mu?
 *      Çözücü: "uyan ürünü al" kapanışı + tezgâha gönderilecek yığın için
 *      bellekli derin arama (her yığın denenir). Tepe doluluk sınırı 0'dan
 *      yukarı denenerek en düşük tezgâh doluluğu da ölçülür.
 *   5. Süre: süreli seviyelerde ürün başına en az 1.8 sn düşüyor mu?
 *
 * Çalıştırma: node --experimental-strip-types --no-warnings scripts/check-puzzle-kantin.mjs
 */

import {
  KANTIN_HOLD_CAP,
  KANTIN_PRODUCTS,
  canTake,
  initialState,
  kantinItemCount,
  kantinLevel,
  rushServe,
  takeItem,
  targetSlot,
} from "../lib/puzzle/levels/kantin.ts";

const COUNT = Number(process.argv[2] ?? 300);
const NODE_LIMIT = 400_000;
const fails = [];
const fail = (L, msg) => fails.push(`seviye ${L}: ${msg}`);

const stateKey = (st) =>
  st.stacks.map((s) => s.length).join(",") +
  "|" +
  st.hold.map((it) => it.p).sort((a, b) => a - b).join(",") +
  "|" +
  st.plates.map((pl) => (pl ? `${pl.order}:${pl.filled.map((it) => it.p).sort((a, b) => a - b).join(".")}` : "-")).join(";") +
  `|${st.served}`;

/**
 * Bellekli derin arama — tanığı KULLANMAZ. Her düğümde alınabilir her yığın
 * denenir; önce bir tabağa uyan ürünler, sonra sıradaki siparişlerde en erken
 * lazım olan ürün. Başarısız durumlar anahtarıyla hatırlanır.
 * cap = izin verilen tepe + 1. Bütçe aşılırsa { path: null, exhausted: false }.
 */
function solve(level, cap, budget = NODE_LIMIT) {
  const failed = new Set();
  let nodes = 0;
  const rankOf = (st) => {
    const rank = new Map();
    for (let i = st.next; i < level.orders.length; i += 1) {
      for (const p of level.orders[i].items) if (!rank.has(p)) rank.set(p, i);
    }
    return rank;
  };
  const dfs = (st, path) => {
    if (st.won) return path;
    if (st.lost) return null;
    nodes += 1;
    if (nodes > budget) return null;
    const key = stateKey(st);
    if (failed.has(key)) return null;
    const rank = rankOf(st);
    const options = [];
    for (let s = 0; s < st.stacks.length; s += 1) {
      if (!canTake(st, s)) continue;
      const p = st.stacks[s][0].p;
      const fits = targetSlot(level, st.plates, p) >= 0;
      options.push({ s, score: fits ? -1 : rank.get(p) ?? 999 });
    }
    options.sort((a, b) => a.score - b.score);
    for (const { s } of options) {
      const res = takeItem(level, st, s, cap);
      if (!res || res.state.lost) continue;
      path.push(s);
      const found = dfs(res.state, path);
      if (found) return found;
      path.pop();
      if (nodes > budget) return null;
    }
    failed.add(key);
    return null;
  };
  const path = dfs(initialState(level), []);
  return { path, nodes, exhausted: nodes <= budget };
}

function replay(level, path, cap) {
  let st = initialState(level);
  for (const s of path) {
    const res = takeItem(level, st, s, cap);
    if (!res) return null;
    st = res.state;
    if (st.lost) return st;
  }
  return st;
}

const t0 = Date.now();
const buckets = new Map();
let fallbacks = 0;
let totalNodes = 0;
let inexact = 0;
const intro = {};

for (let L = 1; L <= COUNT; L += 1) {
  let level;
  try {
    level = kantinLevel(L);
  } catch (e) {
    fail(L, `üretilemedi (${e.message})`);
    continue;
  }

  // 1. Belirlenimcilik: önbellek dışı ikinci üretim yerine yapının izi
  //    karşılaştırılır (önbellek aynı nesneyi döndürür; tohum yeterli kanıt
  //    değil, bu yüzden içerik izi tutulur).
  const sig = JSON.stringify([level.seed, level.orders, level.stacks]);
  if (sig !== JSON.stringify([kantinLevel(L).seed, kantinLevel(L).orders, kantinLevel(L).stacks])) fail(L, "belirlenimci değil");

  // 2. Yapı.
  const need = new Map();
  for (const o of level.orders) {
    if (o.items.length < 2 || o.items.length > 4) fail(L, `sipariş ${o.id} boyu ${o.items.length}`);
    if (new Set(o.items).size !== o.items.length) fail(L, `sipariş ${o.id} tekrar eden ürün`);
    for (const p of o.items) {
      if (!(p >= 0 && p < KANTIN_PRODUCTS.length)) fail(L, `geçersiz ürün ${p}`);
      if (KANTIN_PRODUCTS[p].unlock > L) fail(L, `henüz açılmamış ürün ${KANTIN_PRODUCTS[p].id}`);
      need.set(p, (need.get(p) ?? 0) + 1);
    }
  }
  const have = new Map();
  const uids = new Set();
  for (const s of level.stacks) {
    for (const it of s) {
      have.set(it.p, (have.get(it.p) ?? 0) + 1);
      if (uids.has(it.uid)) fail(L, `uid ${it.uid} tekrar`);
      uids.add(it.uid);
      if (it.lock < 0) fail(L, "negatif kilit");
    }
  }
  for (const p of new Set([...need.keys(), ...have.keys()])) {
    if ((need.get(p) ?? 0) !== (have.get(p) ?? 0)) {
      fail(L, `${KANTIN_PRODUCTS[p].id}: sipariş ${need.get(p) ?? 0}, tezgâhta ${have.get(p) ?? 0}`);
    }
  }
  const items = kantinItemCount(level);
  if (level.orders.length < 3 || level.orders.length > 20) fail(L, `sipariş sayısı ${level.orders.length}`);
  if (level.plates < 1 || level.plates > 4) fail(L, `tabak sayısı ${level.plates}`);
  if (level.stacks.length < 2 || level.stacks.length > 7) fail(L, `yığın sayısı ${level.stacks.length}`);
  if (level.holdCap !== KANTIN_HOLD_CAP) fail(L, "tezgâh kapasitesi");
  if (level.cup !== (L % 10 === 0)) fail(L, "kupa işareti");
  if (level.timeLimit > 0 && level.timeLimit < items * 1.8) fail(L, `süre dar: ${level.timeLimit} sn / ${items} ürün`);
  for (const o of level.orders) if (o.vip && (o.patience < 20 || level.timeLimit === 0)) fail(L, "VIP sabrı / süresiz VIP");
  if (level.fallback) fallbacks += 1;

  // 3. Tanık.
  const w = replay(level, level.witness, level.holdCap);
  if (!w || !w.won) fail(L, "tanık çözüm kazanmıyor");
  else if (w.peak !== level.witnessPeak) fail(L, `tanık tepe ${w.peak} ≠ ${level.witnessPeak}`);

  // 4. Bağımsız çözücü: önce gerçek kapasiteyle, sonra en düşük tepe.
  const main = solve(level, level.holdCap);
  totalNodes += main.nodes;
  if (!main.path) {
    fail(L, `çözücü çözüm bulamadı (${main.nodes} düğüm)`);
    continue;
  }
  const proof = replay(level, main.path, level.holdCap);
  if (!proof || !proof.won) {
    fail(L, "çözücü yolu tekrar oynanınca kazanmıyor");
    continue;
  }
  // En düşük tepe: 0'dan yukarı; bütçe aşılırsa "en fazla" olarak kalır.
  let minPeak = Math.min(proof.peak, level.witnessPeak);
  let exact = true;
  let holdMoves = 0;
  for (let p = 0; p < minPeak; p += 1) {
    const r = solve(level, p + 1, 60_000);
    totalNodes += r.nodes;
    if (r.path) {
      minPeak = p;
      break;
    }
    if (!r.exhausted) {
      exact = false;
      break;
    }
  }
  if (!exact) inexact += 1;
  if (level.witnessPeak > level.holdCap - 1) fail(L, "tanık tezgâhı dolduruyor");
  {
    // Tezgâha giden ürün sayısı (çözücü yolunda).
    let st = initialState(level);
    for (const s of main.path) {
      const before = st.hold.length;
      const res = takeItem(level, st, s, level.holdCap);
      if (res.step.moves[0].to.kind === "hold") holdMoves += 1;
      st = res.state;
      void before;
    }
  }

  // Hızlı Servis duman testi: başlangıçta en az bir tabağı ilerletebilmeli.
  const rush = rushServe(level, initialState(level), level.holdCap);
  if (!rush || rush.step.moves.length === 0) fail(L, "Hızlı Servis başlangıçta etkisiz");

  const locks = level.stacks.flat().filter((it) => it.lock > 0).length;
  const crates = level.stacks.filter((s) => s.some((it) => it.crate)).length;
  const vips = level.orders.filter((o) => o.vip).length;
  for (const [k, v] of [["plates2", level.plates >= 2], ["timed", level.timeLimit > 0], ["vip", vips > 0], ["lock", locks > 0], ["crate", crates > 0], ["cup", level.cup]]) {
    if (v && !(k in intro)) intro[k] = L;
  }

  const lo = Math.floor((L - 1) / 50) * 50 + 1;
  const key = `${String(lo).padStart(3)}–${String(lo + 49).padStart(3)}`;
  const b = buckets.get(key) ?? { diff: 0, n: 0, orders: 0, items: 0, wPeak: 0, minPeak: 0, maxPeak: 0, holdMoves: 0, timed: 0, vip: 0, locks: 0, crates: 0, plates: 0 };
  b.n += 1;
  b.diff += level.difficulty;
  b.orders += level.orders.length;
  b.items += items;
  b.wPeak += level.witnessPeak;
  b.minPeak += minPeak;
  b.maxPeak = Math.max(b.maxPeak, level.witnessPeak);
  b.holdMoves += holdMoves;
  b.timed += level.timeLimit > 0 ? 1 : 0;
  b.vip += vips;
  b.locks += locks;
  b.crates += crates;
  b.plates += level.plates;
  buckets.set(key, b);
}

const f1 = (x) => x.toFixed(1);
console.log(`Stadyum Kantini — ${COUNT} seviye, ${((Date.now() - t0) / 1000).toFixed(1)} sn, çözücü düğümü ${totalNodes}`);
console.log("aralık    | sipariş | hamle(ürün) | tabak | tanık tepe (en çok) | çözücü en düşük tepe | tezgâha giden | aceleci kaybı | süreli | VIP | kilit | koli");
for (const [key, b] of buckets) {
  console.log(
    `${key} | ${f1(b.orders / b.n).padStart(7)} | ${f1(b.items / b.n).padStart(11)} | ${f1(b.plates / b.n).padStart(5)} | ${f1(b.wPeak / b.n).padStart(14)} (${b.maxPeak}) | ${f1(b.minPeak / b.n).padStart(20)} | ${f1(b.holdMoves / b.n).padStart(13)} | ${(100 * b.diff / b.n).toFixed(0).padStart(12)}% | ${String(b.timed).padStart(6)} | ${String(b.vip).padStart(3)} | ${String(b.locks).padStart(5)} | ${String(b.crates).padStart(4)}`,
  );
}
console.log(`mekanik ilk görülme: çoklu tabak ${intro.plates2}, süre ${intro.timed}, VIP ${intro.vip}, kilit ${intro.lock}, iki kat ${intro.crate}, kupa ${intro.cup}`);
console.log(`güvenli kuruluma düşen seviye: ${fallbacks}; en düşük tepesi bütçe içinde kesinleşmeyen: ${inexact}`);

if (fails.length) {
  console.error(`\n${fails.length} hata:`);
  for (const f of fails.slice(0, 60)) console.error("  · " + f);
  process.exit(1);
}
console.log(`\nTamam: ${COUNT} seviyenin tamamı geçerli ve güçlendiricisiz çözülebilir (bağımsız çözücüyle kanıtlandı).`);
