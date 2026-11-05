/**
 * SOYUNMA ODASI DENETİMİ — ilk 300 seviyenin üretildiğini, geçerli ve
 * ÇÖZÜLEBİLİR olduğunu kanıtlar.
 *
 * Kanıt: üreticinin sakladığı çözüm, oyunun kullandığı motorla (applyMove)
 * baştan oynatılır ve tahtayı çözülmüş duruma getirmelidir. Ayrıca:
 *   · ilk durum çözülmüş değil, başta hazır takım yok;
 *   · her renkten tam TEAM forma var, toplam = renk × TEAM;
 *   · dolaplar kapasitesini aşmıyor; tam kapasiteli dolap sayısı ≥ renk;
 *   · gizli sayısı geçerli; kilit rengi kendi dolabında yok;
 *   · her 10. seviye kupa maçı ve hamle sınırı ≥ çözüm;
 *   · üretim belirlenimci (önbellek boşaltılıp yeniden üretilince aynı).
 *
 * Çalıştırma: node --experimental-strip-types --no-warnings scripts/check-puzzle-soyunma.mjs
 */

import {
  applyMove,
  generateSoyunmaLevel,
  isRackComplete,
  isSolved,
  moveCount,
  resetSoyunmaCache,
} from "../lib/puzzle/levels/soyunma.ts";

const COUNT = 300;
const errors = [];
const fail = (level, msg) => errors.push(`seviye ${level}: ${msg}`);

const ranges = [
  [1, 10],
  [11, 50],
  [51, 100],
  [101, 150],
  [151, 200],
  [201, 250],
  [251, 300],
];
const stats = ranges.map(() => ({ n: 0, par: 0, optimal: 0, colors: 0, racks: 0 }));
const firstSeen = {};
let optimalTotal = 0;
const started = Date.now();
const snapshots = new Map();

for (let level = 1; level <= COUNT; level += 1) {
  let L;
  try {
    L = generateSoyunmaLevel(level);
  } catch (e) {
    fail(level, `üretilemedi (${e.message})`);
    continue;
  }
  const T = L.team;
  const board = { caps: L.caps, locks: L.locks, team: T, colors: L.colors };
  snapshots.set(level, JSON.stringify([L.caps, L.locks, L.racks, L.teamIds, L.solution]));

  // Yapı.
  if (L.caps.length !== L.racks.length || L.locks.length !== L.racks.length) fail(level, "dolap dizileri uyumsuz");
  const counts = new Array(L.colors).fill(0);
  let total = 0;
  L.racks.forEach((r, i) => {
    if (r.items.length > L.caps[i]) fail(level, `dolap ${i} kapasiteyi aşıyor`);
    if (r.hidden < 0 || (r.items.length > 0 && r.hidden > r.items.length - 1) || (r.items.length === 0 && r.hidden !== 0))
      fail(level, `dolap ${i} gizli sayısı geçersiz`);
    for (const c of r.items) {
      if (!Number.isInteger(c) || c < 0 || c >= L.colors) fail(level, `geçersiz renk ${c}`);
      else counts[c] += 1;
      total += 1;
    }
    const lock = L.locks[i];
    if (lock != null) {
      if (lock < 0 || lock >= L.colors) fail(level, `geçersiz kilit rengi ${lock}`);
      if (r.items.includes(lock)) fail(level, `kilitli dolap ${i} kendi kilit rengini taşıyor`);
    }
    if (isRackComplete(r, T)) fail(level, `dolap ${i} başta hazır`);
  });
  counts.forEach((n, c) => n !== T && fail(level, `renk ${c}: ${n} forma (beklenen ${T})`));
  if (total !== L.colors * T) fail(level, `toplam forma ${total} ≠ renk × takım (${L.colors * T})`);
  const fullCaps = L.caps.filter((c) => c >= T).length;
  if (fullCaps < L.colors) fail(level, `tam kapasiteli dolap ${fullCaps} < renk ${L.colors}`);
  const capSum = L.caps.reduce((a, b) => a + b, 0);
  if (capSum <= total) fail(level, "hiç boş yer yok");
  if (new Set(L.teamIds).size !== L.colors) fail(level, "takım eşlemesi tekrarlı");
  if (isSolved(board, L.racks)) fail(level, "ilk durum zaten çözülmüş");

  // Seviye takvimi.
  if ((level % 10 === 0) !== L.cup) fail(level, "kupa maçı takvimi bozuk");
  if (L.cup && (L.moveLimit == null || L.moveLimit < L.par)) fail(level, "kupa hamle sınırı çözümden kısa");
  if (!L.cup && L.moveLimit != null) fail(level, "kupa dışı seviyede hamle sınırı");
  if (!(L.par <= L.star3 && L.star3 < L.star2)) fail(level, "yıldız eşikleri tutarsız");

  // Çözümü motorla oynat — çözülebilirlik kanıtı.
  let racks = L.racks;
  let ok = true;
  for (const [s, t] of L.solution) {
    if (moveCount(board, racks, s, t) === 0) {
      fail(level, `çözüm hamlesi geçersiz (${s}→${t})`);
      ok = false;
      break;
    }
    racks = applyMove(board, racks, s, t);
  }
  if (ok && !isSolved(board, racks)) fail(level, "çözüm tahtayı bitirmiyor");
  if (L.par !== L.solution.length) fail(level, "par çözüm uzunluğuna eşit değil");

  const k = ranges.findIndex(([a, b]) => level >= a && level <= b);
  const st = stats[k];
  st.n += 1;
  st.par += L.par;
  st.colors += L.colors;
  st.racks += L.racks.length;
  if (L.optimal) {
    st.optimal += 1;
    optimalTotal += 1;
  }
  for (const [m, on] of Object.entries(L.mechanics)) if (on && !(m in firstSeen)) firstSeen[m] = level;
}

// Belirlenimcilik: önbelleği boşalt, örnek seviyeleri yeniden üret.
resetSoyunmaCache();
for (const level of [1, 8, 15, 22, 37, 99, 150, 300]) {
  const L = generateSoyunmaLevel(level);
  const again = JSON.stringify([L.caps, L.locks, L.racks, L.teamIds, L.solution]);
  if (again !== snapshots.get(level)) fail(level, "üretim belirlenimci değil");
}

console.log(`Soyunma Odası — ${COUNT} seviye denetlendi (${((Date.now() - started) / 1000).toFixed(1)} sn)`);
console.log("aralık      | seviye | ort. renk | ort. dolap | ort. çözüm hamlesi | kanıtlı en kısa");
ranges.forEach(([a, b], i) => {
  const s = stats[i];
  if (!s.n) return;
  console.log(
    `${String(a).padStart(3)}–${String(b).padEnd(3)}     | ${String(s.n).padStart(6)} | ${(s.colors / s.n).toFixed(1).padStart(9)} | ${(s.racks / s.n).toFixed(1).padStart(10)} | ${(s.par / s.n).toFixed(1).padStart(18)} | ${s.optimal}/${s.n}`,
  );
});
console.log(`kanıtlı en kısa çözüm: ${optimalTotal}/${COUNT} (kalanlar ağırlıklı A* ile bulunmuş geçerli çözüm)`);
console.log(`mekaniklerin ilk göründüğü seviye: ${JSON.stringify(firstSeen)}`);

if (errors.length) {
  console.error(`\n${errors.length} hata:`);
  for (const e of errors.slice(0, 50)) console.error("  · " + e);
  process.exit(1);
}
console.log("Tüm seviyeler geçerli ve çözülebilir.");
