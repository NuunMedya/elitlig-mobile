/**
 * KADRO KOŞUSU BÖLÜM DENETİMİ — 250 bölümün tamamını üretir ve doğrular,
 * bir botla örnek bölümleri baştan sona oynatır.
 *
 * Çalıştırma:  node --experimental-strip-types --no-warnings scripts/check-kadro-levels.mjs [--all] [--from N --to M]
 *   (varsayılan: 1–30 ve sonrasında her 10. ile her 25. bölüm oynanır; --all hepsini oynar, birkaç dakika)
 *
 * Doğrulananlar (npm run check:games yalnız tabloları ve kısa akışları dener;
 * bu betik uzun süren tam taramadır):
 *   · games/kadro.js levelSpec(1..LEVEL_COUNT) ↔ lib/puzzle/levels/kadro.ts aynı.
 *   · Her bölüm hatasız kurulur; aynı N iki kez kurulunca yol birebir aynı (belirlenimci).
 *   · Yol yapısı: etap sayısı, kapı/rakip/engel sayısı, kale; kapı sonuçları > 0
 *     (en iyi kapı kadroyu sıfırlamaz); bölümde açılmamış özellik kullanılmaz.
 *   · Bölüm uzunluğu artar (üst bölümler ~60–120 sn).
 *   · Bot bölümleri kazanır (ilk 10 bölüm hep), yıldız 1–3 gelir.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

import * as TS from "../lib/puzzle/levels/kadro.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function makeCtx() {
  const gradient = { addColorStop() {} };
  const target = {
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    measureText: (text) => ({ width: String(text).length * 7 }),
    getImageData: () => ({ data: [] }),
  };
  return new Proxy(target, {
    get: (obj, key) => (key in obj ? obj[key] : () => {}),
    set: (obj, key, value) => ((obj[key] = value), true),
  });
}
const makeCanvas = () => ({ width: 0, height: 0, getContext: () => makeCtx(), addEventListener() {}, setPointerCapture() {}, getBoundingClientRect: () => ({ left: 0, top: 0 }) });

export function bootKadro() {
  const canvas = makeCanvas();
  const log = [];
  const window = { innerWidth: 390, innerHeight: 720, devicePixelRatio: 2, addEventListener() {}, __arenaLog: log };
  const context = {
    window,
    document: { getElementById: () => canvas, createElement: () => makeCanvas(), addEventListener() {}, hidden: false },
    requestAnimationFrame: () => 0,
    performance: { now: () => 0 },
    Path2D: class { moveTo() {} arc() {} ellipse() {} lineTo() {} },
    setTimeout: (fn) => (fn(), 0),
    Math, JSON, Object, Array, Float32Array, Number, String, console,
  };
  context.window.window = context.window;
  vm.createContext(context);
  for (const file of ["core.js", "scenery.js", "kadro.js"]) vm.runInContext(readFileSync(join(root, "games", file), "utf8"), context, { filename: file });
  const A = context.window.Arena;
  const cmd = (c) => context.window.ArenaCmd(c);
  return { A, log, cmd };
}

/** Bot: iyi kapı, yarım/gezen gruptan kaç, çubuk/barajdan uzak dur, silaha yönel, kalecinin şutundan çekil. */
export function kadroBot(A) {
  const d = A.game.debug();
  if (d.state === "intro") {
    A.game.down({ x: 100, y: 300 });
    return;
  }
  if (d.state !== "play") return;
  // grup, arkası geçilene dek (temas bölgesi z − 1,5 m) "sıradaki" sayılır
  const next = d.segs.filter((s) => !s.done && s.z > d.z - (s.type === "rivals" ? 1.6 : 0.2)).sort((a, b) => a.z - b.z)[0];
  if (d.boss && d.boss.shot) {
    d.setTarget(d.boss.shot.x > 0 ? d.boss.shot.x - 3.4 : d.boss.shot.x + 3.4);
    return;
  }
  if (!next) return;
  if (next.type === "gate") {
    if (next.hide && next.z - d.z > 10) d.setTarget(0);
    else d.setTarget(d.apply(d.n, next.left) >= d.apply(d.n, next.right) ? -2.2 : 2.2);
  } else if (next.type === "rivals" && !next.full) {
    const cx = (next.x0 + next.x1) / 2;
    d.setTarget(cx > 0 ? -3.4 : 3.4);
  } else if (next.type === "rivals") {
    const p = d.pickups.find((q) => !q.taken && !q.gone && q.z > d.z && q.z < next.z);
    if (p) d.setTarget(p.x);
  } else if (next.type === "bar") d.setTarget(next.x > 0 ? -3.4 : 3.4);
}

/** N. bölümü bölüm modunda oynatır; sonuç mesajı ve süre. */
export function playLevel(level, { boosters = [], maxSec = 260, bot = kadroBot, onFail = null } = {}) {
  const { A, log, cmd } = bootKadro();
  cmd({ type: "config", levelMode: true, level, boosters, sound: false });
  cmd({ type: "start" });
  const dt = 1 / 60;
  let t = 0, playT = 0, fails = 0;
  for (; t < maxSec; t += dt) {
    A.time += dt;
    A.game.update(dt);
    if (A.game.debug().state === "play") playT += dt;
    if (bot) bot(A);
    const f = log.filter((m) => m.type === "fail").length;
    if (f > fails) {
      fails = f;
      if (onFail) onFail(cmd, log[log.length - 1]);
    }
    if (log.some((m) => m.type === "over")) break;
  }
  return { over: log.find((m) => m.type === "over") || null, fails: log.filter((m) => m.type === "fail"), info: log.find((m) => m.type === "levelInfo"), secs: t, playT, A };
}

/* ───────────────────────────── ana tarama ───────────────────────────── */

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const fails = [];
  const ok = [];
  const check = (name, pass, detail) => (pass ? ok : fails).push(`${name}${detail ? ` — ${detail}` : ""}`);

  const { A, cmd } = bootKadro();
  const d0 = A.game.debug();
  const N = d0.LEVEL_COUNT;

  // 1) JS ↔ TS tabloları
  const jsU = JSON.stringify(d0.UNLOCKS);
  const tsU = JSON.stringify(TS.KADRO_UNLOCKS);
  let specBad = [];
  for (let L = 1; L <= Math.max(N, 400); L += 1) if (JSON.stringify(d0.levelSpec(L)) !== JSON.stringify(TS.kadroLevelSpec(L))) specBad.push(L);
  check("JS ↔ TS tablolar aynı", N === TS.LEVEL_COUNT && jsU === tsU && specBad.length === 0, `LEVEL_COUNT ${N}/${TS.LEVEL_COUNT}, UNLOCKS ${jsU === tsU ? "aynı" : "FARKLI"}, levelSpec farkı: ${specBad.slice(0, 5).join(",") || "yok"}`);

  // 2) Her bölüm kurulur, belirlenimci, yapısı doğru
  const layoutOf = () => {
    const x = A.game.debug();
    return JSON.stringify({ segs: x.segs.map((s) => [s.type, s.z, s.left, s.right, s.hp, s.x0, s.x1, s.look, s.w, s.fx, s.swap, s.hide, s.armor, s.sway]), p: x.pickups.map((p) => [p.type, p.x, p.z]), b: x.boss.hp0 });
  };
  let buildBad = [], detBad = [], structBad = [], lockBad = [], gateBad = [];
  let prevMeters = 0, shorter = [];
  const kinds = {};
  for (let L = 1; L <= N; L += 1) {
    try {
      cmd({ type: "config", levelMode: true, level: L, boosters: [] });
      A.game.start();
      const a = layoutOf();
      A.game.start();
      if (layoutOf() !== a) detBad.push(L);
      const x = A.game.debug();
      const sp = x.spec;
      const gates = x.segs.filter((s) => s.type === "gate");
      const rivals = x.segs.filter((s) => s.type === "rivals");
      const bars = x.segs.filter((s) => s.type === "bar");
      if (x.sectionZ.length !== sp.sections || gates.length !== sp.segs / 2 || !x.boss || x.boss.hp0 <= 0 || rivals.length < sp.sections) structBad.push(L);
      // en iyi kapı kadroyu sıfırlamaz (beklenen kadroyla)
      let e = 1;
      for (const s of x.segs) {
        if (s.type !== "gate") continue;
        const best = Math.max(x.apply(e, s.left), x.apply(e, s.right));
        if (best <= 0) gateBad.push(L);
        e = best;
      }
      const used = new Set();
      for (const s of gates) {
        for (const op of [s.left, s.right]) used.add(op.op === "x" ? "carpi" : op.op === "/" ? "bolu" : "kapi");
        const bad = (op) => op.op === "-" || op.op === "/";
        if (bad(s.left) && bad(s.right)) used.add("ciftKotu");
        if (s.swap) used.add("degisken");
        if (s.hide) used.add("gizli");
      }
      for (const s of rivals) {
        if (!s.full && !s.sway) used.add("yarim");
        if (s.sway) used.add("gezen");
        if (s.armor) used.add("zirhli");
        if (s.mega) used.add("devGrup");
      }
      for (const s of bars) used.add(s.look === "wall" ? "baraj" : s.look === "slide" ? "kayan" : "cubuk");
      if (bars.filter((s) => s.look === "bar").length >= 2 && x.segs.some((s, i) => s.type === "bar" && x.segs[i + 1] && x.segs[i + 1].type === "bar" && x.segs[i + 1].z - s.z < 8)) used.add("ciftCubuk");
      for (const p of x.pickups) used.add(p.type);
      if (sp.double) used.add("ciftSut");
      if (sp.aim) used.add("usta");
      for (const k of used) {
        const at = k === "sack" ? 1 : (d0.UNLOCKS.find((u) => u.key === k) || { level: 1e9 }).level;
        if (at > L) lockBad.push(`${L}:${k}`);
        kinds[k] = kinds[k] || L;
      }
      if (sp.meters < prevMeters && !sp.breather && !d0.levelSpec(L - 1).cup) shorter.push(L);
      prevMeters = sp.breather ? prevMeters : sp.meters;
    } catch (err) {
      buildBad.push(`${L}: ${err.message}`);
    }
  }
  check(`${N} bölüm hatasız kurulur`, buildBad.length === 0, buildBad.slice(0, 3).join(" · ") || "hepsi kuruldu");
  check("bölümler belirlenimci (aynı N → aynı yol)", detBad.length === 0, detBad.length ? `farklı: ${detBad.slice(0, 5)}` : "iki kurulum birebir aynı");
  check("yapı: etap, kapı, rakip, kale", structBad.length === 0, structBad.length ? `bozuk: ${structBad.slice(0, 5)}` : "hepsi tamam");
  check("en iyi kapı kadroyu hiç sıfırlamaz", gateBad.length === 0, gateBad.length ? `${gateBad.slice(0, 5)}` : "tamam");
  check("açılmamış özellik kullanılmaz", lockBad.length === 0, lockBad.length ? lockBad.slice(0, 6).join(", ") : "tamam");
  const firstUse = d0.UNLOCKS.map((u) => `${u.key}@${kinds[u.key] ?? "—"}/${u.level}`).join(" ");
  check("her yeni özellik açıldığı bölümde yola çıkar", d0.UNLOCKS.every((u) => kinds[u.key] != null && kinds[u.key] === u.level), firstUse);
  check("bölümler uzar", shorter.length === 0 && d0.levelSpec(N).meters >= 3 * d0.levelSpec(1).meters, `1: ${d0.levelSpec(1).meters} m → ${N}: ${d0.levelSpec(N).meters} m`);

  // 3) Bot oyunu
  const argv = process.argv;
  const from = argv.includes("--from") ? +argv[argv.indexOf("--from") + 1] : null;
  const to = argv.includes("--to") ? +argv[argv.indexOf("--to") + 1] : null;
  let sample = [];
  if (from) for (let L = from; L <= (to || from); L += 1) sample.push(L);
  else if (argv.includes("--all")) sample = Array.from({ length: N }, (_, i) => i + 1);
  else {
    for (let L = 1; L <= 30; L += 1) sample.push(L);
    for (let L = 40; L <= N; L += 10) sample.push(L);
    for (let L = 35; L <= N; L += 25) if (!sample.includes(L)) sample.push(L);
    sample.sort((a, b) => a - b);
  }
  const rows = [];
  let earlyLoss = [];
  let wins = 0;
  const starHist = [0, 0, 0, 0];
  for (const L of sample) {
    const r = playLevel(L);
    const st = r.over ? r.over.stats : null;
    const won = st && st.won === 1;
    if (won) wins += 1;
    if (L <= 10 && !won) earlyLoss.push(L);
    if (st) starHist[st.stars] += 1;
    rows.push(`${String(L).padStart(3)} ${won ? "✓" : "✗"} ${st ? st.stars : "-"}★ ${r.playT.toFixed(0).padStart(3)} sn  kadro ${st ? `${st.kept}/${st.squad}` : "-"}  kayıp ${st ? st.lost : "-"}`);
  }
  if (argv.includes("--verbose") || from) console.log(rows.join("\n"));
  check("bot ilk 10 bölümü geçer", earlyLoss.length === 0, earlyLoss.length ? `kaybedilen: ${earlyLoss}` : "hepsi geçildi");
  check("bot örnek bölümlerin çoğunu geçer", wins >= sample.length * 0.7, `${wins}/${sample.length} kazanıldı · yıldız dağılımı 1★ ${starHist[1]} · 2★ ${starHist[2]} · 3★ ${starHist[3]}`);
  const longL = playLevel(Math.min(N, 200));
  check("üst bölümler uzun (60–150 sn)", longL.playT >= 60 && longL.playT <= 150, `bölüm ${Math.min(N, 200)}: ${longL.playT.toFixed(0)} sn`);

  for (const line of ok) console.log(`✓ ${line}`);
  for (const line of fails) console.log(`✗ ${line}`);
  if (fails.length) {
    console.log(`\n${fails.length} denetim başarısız.`);
    process.exit(1);
  }
  console.log(`\nKadro bölüm denetimi temiz (${ok.length} iddia).`);
}
