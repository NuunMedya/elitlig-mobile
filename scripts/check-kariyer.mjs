/**
 * KARİYER YOLU DENETİMİ — games/kariyer.js başsız (Node `vm`, sahte Canvas)
 * çalıştırılır; kurallar gözle değil SAYIYLA doğrulanır.
 *
 *   1. Bölüm tablosu: JS üreteci (levelSpec) ile TS ikizi
 *      (lib/puzzle/levels/kariyer.ts) LEVEL_COUNT + 50 bölümde birebir aynı;
 *      bütün bölümler geçerli, yenilik vaktinden önce gelmez, tanıtıldığı
 *      bölümde görünür, her 10. bölüm boss, 5'in katları nefes, zorluk artar.
 *   2. Mekanikler: dokunmadan kayan rakibe koşan top kaptırır, zamanında
 *      çalım geçer; arada rakip olan pas kesilir, açık pas verkaç olur;
 *      ofsayttaki arkadaşa pas ofsayt; barajın içine vurulan frikik bloke;
 *      halkanın altında zamanında kafa kaleye gider; ekrandaki dokunuş
 *      arkadaşı / kale noktasını doğru bulur.
 *   3. Bölüm modu sözleşmesi: levelInfo, over {level, won, stars, …},
 *      fail → continue (uzatma atağı) → giveUp; güçlendiriciler (krampon
 *      bölgeyi genişletir, ikinci şans atağı yeniden oynatır).
 *   4. ADALET: "yetkin" bir bot (insan benzeri tepki gecikmesi, nişan ve
 *      zamanlama hatası) bütün bölümleri birkaç tohumla oynar; basamak
 *      bantlarında kazanma oranı beklenen aralıkta olmalı (erken ≈ %75–85,
 *      üst basamak ≈ %50) ve basamaktan basamağa düşmeli.
 *
 * Çalıştırma: npm run check:kariyer   (ayrıntı: -- --verbose)
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

import * as TS from "../lib/puzzle/levels/kariyer.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const VERBOSE = process.argv.includes("--verbose");
const fails = [];
const ok = [];
const check = (name, pass, detail) => (pass ? ok : fails).push(`${name}${detail ? ` — ${detail}` : ""}`);

/* ── başsız çalışma zamanı ───────────────────────────────────────────────── */

function makeCtx() {
  const gradient = { addColorStop() {} };
  const target = {
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    measureText: (text) => ({ width: String(text).length * 7 }),
    getImageData: () => ({ data: [] }),
  };
  return new Proxy(target, {
    get(obj, key) {
      if (key in obj) return obj[key];
      return () => {};
    },
    set(obj, key, value) {
      obj[key] = value;
      return true;
    },
  });
}
function makeCanvas() {
  return { width: 0, height: 0, getContext: () => makeCtx(), addEventListener() {}, setPointerCapture() {}, getBoundingClientRect: () => ({ left: 0, top: 0 }) };
}
const SOURCES = ["core.js", "scenery.js", "kariyer.js"].map((f) => [f, readFileSync(join(root, "games", f), "utf8")]);
const SCRIPTS = SOURCES.map(([f, code]) => new vm.Script(code, { filename: f }));

/** Oyunu başsız aç. seed: Math.random tohumu (bot gürültüsü ve süs). */
export function boot(seed = 1) {
  const canvas = makeCanvas();
  const log = [];
  let s = seed >>> 0 || 1;
  const rand = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  const M = Object.create(Math);
  M.random = rand;
  const window = { innerWidth: 390, innerHeight: 720, devicePixelRatio: 2, addEventListener() {}, __arenaLog: log };
  const context = {
    window,
    document: { getElementById: () => canvas, createElement: () => makeCanvas(), addEventListener() {}, hidden: false },
    requestAnimationFrame: () => 0,
    performance: { now: () => 0 },
    setTimeout: (fn) => {
      fn();
      return 0;
    },
    Math: M,
    JSON,
    Object,
    Array,
    Number,
    String,
    console,
  };
  context.window.window = context.window;
  vm.createContext(context);
  for (const sc of SCRIPTS) sc.runInContext(context);
  const A = context.window.Arena;
  const g = () => A.game.debug();
  const step = (dt, render) => {
    A.time += dt;
    A.game.update(dt);
    if (render) {
      A.stepParticles(dt);
      A.game.render(A.ctx, dt);
    }
  };
  return { A, g, step, log, rand, over: () => log.find((m) => m.type === "over") };
}

/* ── yetkin bot ──────────────────────────────────────────────────────────── */

/**
 * İnsan benzeri oyuncu: her 1/30 sn karar verir; tehdidi `react` sn gecikmeyle
 * görür; çalımı kayma anına göre ±jitter ile basar (arada ıskalar), boş
 * koridora yönelir, kalabalıkta açık pası kullanır; nişanı kalecinin uzak
 * köşesine hatayla alır, güç çubuğunu ±timing sn hatayla durdurur.
 */
const SKILLS = {
  yetkin: { react: 0.2, jitter: 0.06, miss: 0.06, aimErr: 0.32, timing: 0.05, think: 0.7, passP: 0.75, headT: 0.07 },
  iyi: { react: 0.16, jitter: 0.05, miss: 0.04, aimErr: 0.22, timing: 0.035, think: 0.5, passP: 0.9, headT: 0.05 },
  acemi: { react: 0.32, jitter: 0.12, miss: 0.2, aimErr: 0.5, timing: 0.09, think: 1.0, passP: 0.4, headT: 0.12 },
};
export function makeBot(box, skill = SKILLS.yetkin, opts = {}) {
  const { g, rand } = box;
  const gauss = () => {
    const u = Math.max(1e-9, rand()), v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  let acc = 0;
  let seen = new Map(); // savunmacı → telgrafı ilk gördüğü an
  let plan = null; // nişan planı
  let shootAt = null;
  let headAt = null;
  let t = 0;
  let lastAtk = null;
  let passed = 0;
  return function tick(dt) {
    t += dt;
    acc += dt;
    const d = g();
    if (d.state === "promo" || d.state === "intro") {
      if (d.stateT > 0.8) d.act.skip();
      return;
    }
    if (d.curAtk !== lastAtk) {
      lastAtk = d.curAtk;
      seen = new Map();
      plan = null;
      shootAt = null;
      headAt = null;
      passed = 0;
    }
    if (acc < 1 / 30) return;
    acc = 0;
    const me = d.me, L = d.level;
    if (d.state === "live") {
      if (d.ball.owner !== "me") return;
      // tehditler
      let tapNow = false;
      for (const df of d.defs) {
        const dist = Math.hypot(df.x - me.x, df.z - me.z);
        if (df.st === "windup" || df.st === "slide") {
          if (!seen.has(df)) seen.set(df, { t, jit: gauss() * skill.jitter, miss: rand() < skill.miss });
          const s = seen.get(df);
          if (t - s.t < skill.react) continue;
          if (s.miss) continue;
          const lead = df.st === "windup" ? L.windup - df.t : -df.t;
          if (me.cool <= 0 && lead < 0.06 + s.jit && dist < L.lunge + 1.6) tapNow = true;
          else if (me.cool > 0) d.act.steer(me.x + (me.x >= df.x ? 3 : -3));
        } else if ((df.st === "press" || df.st === "turn") && dist < 3 && df.z < me.z + 0.3) {
          // dokunma mesafesi: ~1,3 m ± zamanlama hatası (≈5 m/sn yaklaşmada jitter sn)
          if (!seen.has(df)) seen.set(df, { t, at: 1.3 + gauss() * skill.jitter * 5, miss: rand() < skill.miss });
          const s = seen.get(df);
          if (t - s.t >= skill.react && !s.miss && me.cool <= 0 && dist < s.at) tapNow = true;
        }
      }
      if (tapNow) {
        d.act.skill();
        return;
      }
      // pas: önde kalabalık varsa ve pas açıksa
      const ahead = d.defs.filter((df) => ["hold", "press", "turn", "windup"].includes(df.st) && me.z - df.z > 0 && me.z - df.z < 10);
      if (opts.pass !== false && passed < 2 && ahead.length && d.mates.length) {
        for (let i = 0; i < d.mates.length; i++) {
          const pi = d.passInfo(d.mates[i]);
          if (pi.ok && rand() < skill.passP * 0.25 && (ahead.length >= 2 || Math.abs(ahead[0].x - me.x) < 2.5)) {
            d.act.pass(i);
            passed += 1;
            return;
          }
        }
      }
      // koridor: en açık x
      let best = me.x, bs = -1e9;
      for (let x = -12; x <= 12; x += 1) {
        let sc = -Math.abs(x) * 0.12 - Math.abs(x - me.x) * 0.05;
        for (const df of d.defs) {
          if (!["hold", "press", "turn", "windup", "slide"].includes(df.st)) continue;
          const dz = me.z - df.z;
          if (dz < -1 || dz > 14) continue;
          const gap = Math.abs(x - df.x);
          sc -= Math.max(0, 3.2 - gap) * (2.5 - dz / 7);
        }
        if (sc > bs) {
          bs = sc;
          best = x;
        }
      }
      d.act.steer(best);
      return;
    }
    if (d.state === "cross") {
      const c = d.cross;
      d.act.steer(c.L.x + gauss() * 0.15);
      if (c.t >= 0 && headAt == null) headAt = c.T - 0.1 + gauss() * skill.headT;
      if (headAt != null && c.t >= headAt && c.tap == null) {
        const side = d.keeper.x > 0 ? -1 : 1;
        d.act.header(side * (3.66 - 0.6) + gauss() * skill.aimErr * 0.6, 0.7 + rand() * 1.2);
      }
      return;
    }
    if (d.state === "aim") {
      if (!plan) {
        const kind = d.curAtk.spec.kind;
        let side = d.keeper.x > 0.15 ? -1 : d.keeper.x < -0.15 ? 1 : rand() < 0.5 ? -1 : 1;
        if (kind === "atak" || kind === "kontra") side = d.ball.x > 1 ? -1 : d.ball.x < -1 ? 1 : side;
        let y = rand() < 0.5 ? 0.5 + rand() * 0.4 : 1.5 + rand() * 0.5;
        if (kind === "frikik") {
          // ekrandaki yolu baraja değmeyen bir nokta
          let found = null;
          for (const yy of [2.15, 2.05, 1.95, 2.25, 0.45]) for (const s2 of [side, -side]) for (const xx of [2.95, 2.6]) {
            if (!found && !d.blocked(s2 * xx, yy)) found = [s2, yy, xx];
          }
          if (found) {
            side = found[0];
            y = found[1];
          }
        }
        plan = { x: side * (3.66 - 0.55) + gauss() * skill.aimErr, y: Math.max(0.2, y + gauss() * skill.aimErr * 0.5), at: d.stateT + skill.think * (0.6 + rand() * 0.8) };
      }
      if (d.stateT >= plan.at) {
        d.act.aim(plan.x, plan.y);
        d.act.lock();
      }
      return;
    }
    if (d.state === "power") {
      if (shootAt == null) {
        const z = d.zone(), mid = (z[0] + z[1]) / 2, P = L.period;
        // ibre ilk kez ortadan geçtiğinde (yükselirken) + tepki hatası
        const tc = (Math.acos(1 - 2 * mid) / (2 * Math.PI)) * P;
        shootAt = tc + gauss() * skill.timing;
        if (shootAt < 0.02) shootAt += P;
      }
      if (d.stateT >= shootAt) d.act.shoot();
      return;
    }
  };
}

/** Bir bölümü baştan sona bot ile oynat. onFail: "giveUp" | "continue". */
export function playLevel(level, { seed = 1, skill = SKILLS.yetkin, boosters = [], onFail = "giveUp", maxT = 400, botOpts = {} } = {}) {
  const box = boot(seed);
  box.A.game.command({ type: "config", levelMode: true, level, boosters });
  box.A.game.start();
  const bot = makeBot(box, skill, botOpts);
  const dt = 1 / 120;
  let fails = 0;
  for (let i = 0; i < maxT / dt; i++) {
    bot(dt);
    box.step(dt, false);
    const st = box.g().state;
    if (st === "fail") {
      fails += 1;
      box.A.game.command(onFail === "continue" && fails === 1 ? { type: "continue", extra: { attacks: box.g().lvl.need } } : { type: "giveUp" });
    }
    if (st === "over") break;
  }
  return { ...box, end: box.over(), fails };
}

/* ── 1) tablo ────────────────────────────────────────────────────────────── */

const B0 = boot(1);
const D0 = B0.g();
{
  let diff = 0, first = null;
  for (let n = 1; n <= TS.LEVEL_COUNT + 50; n += 1) {
    const a = JSON.stringify(D0.levelSpec(n)), b = JSON.stringify(TS.kariyerLevel(n));
    if (a !== b || D0.goalText(D0.levelSpec(n)) !== TS.goalText(TS.kariyerLevel(n))) {
      diff += 1;
      first = first ?? n;
    }
  }
  const same = JSON.stringify(D0.UNLOCKS) === JSON.stringify(TS.UNLOCKS) && JSON.stringify(D0.TIERS) === JSON.stringify(TS.TIERS) && D0.LEVEL_COUNT === TS.LEVEL_COUNT && TS.LEVEL_COUNT >= 120;
  check("kariyer tablo: JS üreteci TS ikiziyle aynı", diff === 0 && same, diff ? `${diff} bölüm farklı (ilk ${first})` : `${TS.LEVEL_COUNT}+50 bölüm, ${TS.UNLOCKS.length} yenilik, ${TS.TIERS.length} basamak aynı`);

  const at = Object.fromEntries(D0.UNLOCKS.map((u) => [u.key, u.level]));
  const uses = (s) => ({
    defans: s.attacks.some((a) => a.defs > 0),
    pas: s.attacks.some((a) => a.mates > 0),
    kayma: s.slide,
    penalti: s.attacks.some((a) => a.kind === "penalti"),
    derbi: s.boss,
    kaleci: s.keeperOut > 0,
    super: s.superSkill,
    frikik: s.attacks.some((a) => a.kind === "frikik"),
    kafa: s.attacks.some((a) => a.kind === "kafa"),
    pres: s.attacks.some((a) => a.press),
    ofsayt: s.attacks.some((a) => a.offside),
    yagmur: s.rain,
    takip: s.attacks.some((a) => a.chaser && a.kind === "atak"),
    kontra: s.attacks.some((a) => a.kind === "kontra"),
    kalabalik: false,
  });
  let invalid = 0, early = 0, missing = 0;
  const band = (a, b) => {
    let t = 0;
    for (let n = a; n <= b; n += 1) t += D0.levelSpec(n).diff;
    return t / (b - a + 1);
  };
  for (let n = 1; n <= D0.LEVEL_COUNT; n += 1) {
    const s = D0.levelSpec(n);
    const okA = s.attacks.length >= 3 && s.attacks.length <= 6 && s.attacks.every((a, i) => D0.TIERS && a.minute >= 2 && a.minute <= 89 && (i === 0 || a.minute > s.attacks[i - 1].minute));
    if (!okA || s.rivals > s.attacks.length - 2 || s.rivalAt.length !== s.rivals || s.reflex < 50 || s.reflex > 99 || s.star3 <= s.star2 || s.star3 > 9.7) invalid += 1;
    const u = uses(s);
    for (const k of Object.keys(u)) if (u[k] && n < at[k]) early += 1;
    const un = D0.UNLOCKS.find((x) => x.level === n);
    if (un && un.key in u && un.key !== "kalabalik" && !u[un.key]) missing += 1;
    if ((n % 10 === 0) !== s.boss) invalid += 1;
    if (n % 5 === 0 && n % 10 && !s.breather) invalid += 1;
    if (s.promo !== (n > 1 && D0.TIERS.some((t) => t.from === n))) invalid += 1;
  }
  const d1 = band(1, 30), d2 = band(61, 90), d3 = band(121, 150);
  check(
    "kariyer tablo: bölümler geçerli, yenilik vaktinden önce gelmez, boss/nefes düzeni, zorluk artar",
    invalid === 0 && early === 0 && missing === 0 && d1 < d2 && d2 < d3,
    `geçersiz ${invalid} · erken ${early} · eksik tanıtım ${missing} · ort. zorluk ${d1.toFixed(2)} → ${d2.toFixed(2)} → ${d3.toFixed(2)}`,
  );
}

/* ── 2) mekanikler ───────────────────────────────────────────────────────── */

/** N. bölümü aç, `kind` türünde bir atağı ilk sıraya koy ve canlı evreye getir. */
function openAttack(level, kind, seed = 3, extra = 0) {
  const box = boot(seed);
  box.A.game.command({ type: "config", levelMode: true, level, boosters: [] });
  box.A.game.start();
  const d = box.g();
  const i = d.timeline.findIndex((e) => e.type === "atk" && e.spec.kind === kind);
  if (i < 0) return null;
  d.timeline[0] = Object.assign({}, d.timeline[i], { idx: 0, minute: 1, extra });
  d.act.skip();
  if (box.g().state === "intro") d.act.skip();
  for (let k = 0; k < 600 && !["live", "cross", "aim"].includes(box.g().state); k += 1) box.step(1 / 120);
  return box;
}
const run = (box, sec, each) => {
  for (let k = 0; k < sec * 120; k += 1) {
    if (each && each(box.g()) === true) return;
    box.step(1 / 120);
  }
};
const lvWith = (fn) => {
  for (let n = 1; n <= 150; n += 1) if (fn(D0.levelSpec(n))) return n;
  return 0;
};
{
  // Kayarak müdahale: hareketsiz oyuncu topu kaptırır; kayma anında çalım geçer.
  const lv = lvWith((s) => s.slide && s.attacks[0].kind === "atak" && s.attacks[0].defs >= 1);
  const slideAt = (tap) => {
    const box = openAttack(lv, "atak");
    const d = box.g();
    const df = d.defs.find((x) => !x.chaser && x.st !== "markm");
    d.defs.splice(0, d.defs.length, df);
    d.mates.splice(0, d.mates.length);
    Object.assign(df, { x: d.me.x, z: d.me.z - 2.0, st: "windup", t: 0, cool: 0, slid: false });
    let tapped = false;
    run(box, 1.6, (e) => {
      if (tap && !tapped && df.st === "windup" && df.t >= e.level.windup - 0.04) {
        e.act.skill();
        tapped = true;
      }
      return e.state === "result";
    });
    const e = box.g();
    return { state: e.state, label: e.res && e.res.label, owner: e.ball.owner, beaten: df.beatenBy };
  };
  const idle = slideAt(false), dodge = slideAt(true);
  check(
    "kariyer mekanik: kayan rakibe dokunmadan koşan topu kaptırır, zamanında çalım geçer",
    idle.state === "result" && /KAYDI|KAPTIRDIN/.test(idle.label) && dodge.owner === "me" && dodge.beaten === true,
    `bölüm ${lv} · dokunmadan: ${idle.label} · çalımla: top ${dodge.owner}, rakip ${dodge.beaten ? "geçildi" : "geçilmedi"}`,
  );

  // Pas: arada rakip varsa kesilir; açık yol verkaç olur.
  const lvp = lvWith((s) => s.attacks[0].kind === "atak" && s.attacks[0].mates >= 1 && !s.attacks[0].offside && s.attacks[0].defs >= 1);
  const passWith = (blocked) => {
    const box = openAttack(lvp, "atak");
    const d = box.g();
    const m = d.mates[0];
    const df = d.defs.find((x) => !x.chaser);
    d.defs.splice(0, d.defs.length, df);
    if (blocked) Object.assign(df, { x: (d.me.x + m.x) / 2, z: (d.me.z + m.z) / 2, st: "hold", t: 0 });
    else Object.assign(df, { x: d.me.x - (m.x - d.me.x), z: d.me.z - 12, st: "hold", t: 0 });
    const info = d.passInfo(m);
    d.act.pass(0);
    run(box, 3, (e) => e.state === "result" || e.tally.oneTwos > 0);
    const e = box.g();
    return { ok: info.ok, label: e.state === "result" ? e.res.label : null, oneTwos: e.tally.oneTwos, owner: e.ball.owner };
  };
  const cut = passWith(true), open = passWith(false);
  check(
    "kariyer mekanik: arada rakip olan pas kesilir (çizgi kırmızı), açık yol verkaç olur",
    !cut.ok && cut.label === "PAS ARADA KALDI" && open.ok && open.oneTwos === 1 && open.owner === "me",
    `bölüm ${lvp} · kapalı: ${cut.label} · açık: verkaç ${open.oneTwos}, top ${open.owner}`,
  );

  // Ofsayt: son savunmacının gerisindeki arkadaşa pas.
  const lvo = lvWith((s) => s.attacks[0].offside);
  {
    const box = openAttack(lvo, "atak");
    const d = box.g();
    const m = d.mates[0];
    // tek savunmacı geride (geçilmiş): arkadaş topun ve onun önünde
    const back = d.defs.find((x) => !x.chaser);
    d.defs.splice(0, d.defs.length, back);
    Object.assign(back, { x: d.me.x + 3, z: d.me.z + 2, st: "chase" });
    m.z = d.me.z - 8;
    box.step(1 / 120);
    const info = d.passInfo(m);
    d.act.pass(0);
    run(box, 3, (e) => e.state === "result");
    const e = box.g();
    check("kariyer mekanik: ofsayttaki arkadaşa pas OFSAYT", info.offside && e.res && e.res.label === "OFSAYT!", `bölüm ${lvo} · ${e.res && e.res.label}`);
  }

  // Frikik: barajın içine giden yol kırmızı ve bloke; üstünden açık yol baraja değmez.
  const lvf = lvWith((s) => s.attacks.some((a) => a.kind === "frikik"));
  {
    let intoWall = 0, wallRes = 0, overOk = 0, tries = 0;
    for (let sd = 1; sd <= 8; sd += 1) {
      const box = openAttack(lvf, "frikik", sd, sd);
      const d = box.g();
      const w = d.wall, b = d.ball;
      const gx = b.x + ((w.x - b.x) * b.z) / (b.z - w.z);
      tries += 1;
      if (d.blocked(gx, 0.6)) intoWall += 1;
      if (["-1", "1"].some((s2) => [2.15, 2.05, 1.95].some((yy) => !d.blocked(Number(s2) * 2.9, yy)))) overOk += 1;
      d.act.aim(gx, 0.6);
      d.act.lock();
      const z = d.zone();
      run(box, 3, (e) => {
        if (e.state === "power" && e.powerV >= (z[0] + z[1]) / 2) e.act.shoot();
        return e.state === "result";
      });
      if (box.g().res && box.g().res.label === "BARAJ!") wallRes += 1;
    }
    check(
      "kariyer mekanik: frikikte baraja giden yol kırmızı görünür ve baraja çarpar; üstünden açık yol vardır",
      intoWall === tries && wallRes >= tries - 1 && overOk >= tries - 1,
      `bölüm ${lvf} · ${tries} frikik: kırmızı ${intoWall}, BARAJ ${wallRes}, üstten açık yol ${overOk}`,
    );
  }

  // Kafa: halkanın altında, halka yeşilken dokunan isabetli vurur; erken / hiç dokunmayan ıskalar.
  const lvk = lvWith((s) => s.attacks.some((a) => a.kind === "kafa"));
  {
    let onTarget = 0, n = 0;
    const head = (sd, mode) => {
      const box = openAttack(lvk, "kafa", sd, sd);
      const d = box.g();
      const c = d.cross;
      if (c.marker) d.defs.splice(d.defs.indexOf(c.marker), 1), (c.marker = null);
      let done = false;
      run(box, 4, (e) => {
        e.act.steer(c.L.x);
        const at = mode === "early" ? 0.05 : c.T - 0.1;
        if (mode !== "none" && !done && c.t >= at) {
          e.act.header(c.L.x > 0 ? -2.8 : 2.8, 0.9);
          done = true;
        }
        return e.state === "result";
      });
      return box.g().res;
    };
    for (let sd = 1; sd <= 12; sd += 1) {
      const r = head(sd, "good");
      n += 1;
      if (r && (r.good || r.label === "KURTARIŞ!" || r.label === "DİREK!")) onTarget += 1;
    }
    const early = head(5, "early"), none = head(6, "none");
    check(
      "kariyer mekanik: zamanında kafa çerçeveyi bulur, erken sıçrayan ve dokunmayan ıskalar",
      onTarget >= n * 0.8 && early && early.label === "ERKEN SIÇRADIN" && none && none.label === "ISKA!",
      `bölüm ${lvk} · ${onTarget}/${n} çerçevede · erken: ${early && early.label} · dokunmadan: ${none && none.label}`,
    );
  }

  // Girdi: ekrandaki dokunuş kale noktasını ve arkadaşı doğru bulur.
  {
    const box = openAttack(lvp, "atak");
    const A = box.A;
    A.game.render(A.ctx, 1 / 60);
    const d = box.g();
    let err = 0;
    for (const [x, y] of [[-3, 0.5], [2.5, 2], [0, 1.2]]) {
      const p = d.proj(x, y, 0);
      const q = d.unproject(p.x, p.y, 0);
      err = Math.max(err, q ? Math.hypot(q.x - x, q.y - y) : 9);
    }
    d.defs.splice(0, d.defs.length);
    const m = d.mates[0];
    const p = d.proj(m.x, 1.0, m.z);
    A.game.down({ x: p.x, y: p.y });
    A.game.up({ x: p.x, y: p.y });
    const passed = box.g().ball.owner !== "me";
    // boş yere dokunuş = çalım
    const box2 = openAttack(lvp, "atak");
    box2.A.game.render(box2.A.ctx, 1 / 60);
    box2.g().mates.splice(0);
    box2.A.game.down({ x: 20, y: 600 });
    box2.A.game.up({ x: 20, y: 600 });
    check(
      "kariyer girdi: dokunuş kale noktasını bulur; arkadaşa dokunmak pas, boşa dokunmak çalım",
      err < 0.01 && passed && box2.g().me.skill > 0,
      `ters izdüşüm hatası ${err.toFixed(4)} m · arkadaşa dokunuş ${passed ? "pas" : "pas yok"} · boş dokunuş ${box2.g().me.skill > 0 ? "çalım" : "—"}`,
    );
  }
}

/* ── 3) bölüm modu sözleşmesi ───────────────────────────────────────────── */

{
  const win = playLevel(1, { seed: 3 });
  const st = win.end && win.end.stats;
  const keys = ["level", "won", "stars", "goals", "rival", "rating", "shots", "dribbles", "passes", "attacks", "boss"];
  const info = win.log.find((m) => m.type === "levelInfo");
  check(
    "kariyer sözleşme: levelInfo, kazanınca over {level, won, stars, goals, rival, rating, …}",
    Boolean(st) && keys.every((k) => k in st) && st.level === 1 && st.won === 1 && st.stars >= 1 && st.stars <= 3 && info && info.goal === TS.goalText(TS.kariyerLevel(1)) && win.end.score === st.rating,
    st ? `bölüm 1: ${st.goals}–${st.rival}, ${st.stars}★, reyting ${st.rating / 10}, skor ${win.end.score}` : "over yok",
  );

  // Kaybetmek üzere: fail → continue (uzatma atağı) → giveUp → over (won 0).
  // takvimde tek rakip golü olan bölüm: bütün şutları dışarı at → 0–1, uzatma sorulur
  const lvc = lvWith((s) => s.rivals === 1 && s.level > 20 && !s.boss);
  const box = boot(4);
  box.A.game.command({ type: "config", levelMode: true, level: lvc, boosters: [] });
  box.A.game.start();
  const d = box.g();
  d.act.skip();
  let failMsg = null, before = 0, after = 0, overMsg = null;
  for (let k = 0; k < 400 * 120; k += 1) {
    // kontra golü olmasın: ölçülen yalnız uzatma akışı
    box.g().level.counterP = 0;
    const e = box.g();
    if (e.state === "aim") {
      e.act.aim(6, 4);
      e.act.lock();
    } else if (e.state === "power") e.act.shoot();
    else if (e.state === "intro" || e.state === "promo") e.act.skip();
    if (e.state === "fail") {
      if (!failMsg) {
        failMsg = box.log.filter((m) => m.type === "fail").pop();
        before = e.timeline.length;
        box.A.game.command({ type: "continue", extra: { attacks: failMsg.extra } });
        after = box.g().timeline.length;
      } else box.A.game.command({ type: "giveUp" });
    }
    if (e.state === "over") break;
    box.step(1 / 120);
  }
  overMsg = box.over();
  check(
    "kariyer sözleşme: berabere / geride biten maç fail {canContinue, extra}, devam uzatma atağı ekler, vazgeçince over",
    failMsg && failMsg.canContinue === true && failMsg.extra >= 1 && after === before + failMsg.extra && overMsg && overMsg.stats.won === 0 && overMsg.stats.stars === 0,
    failMsg ? `fail extra ${failMsg.extra} · atak ${before} → ${after} · over won ${overMsg && overMsg.stats.won}` : "fail yok",
  );

  // Güçlendiriciler: krampon bölgeyi %20 genişletir ve hızlandırır; ikinci şans atağı yeniden oynatır.
  const zoneW = (boosters) => {
    const b = boot(2);
    b.A.game.command({ type: "config", levelMode: true, level: 12, boosters });
    b.A.game.start();
    const z = b.g().zone();
    return z[1] - z[0];
  };
  const z0 = zoneW([]), z1 = zoneW(["krampon"]);
  const rb = openAttack(lvWith((s) => s.slide && s.attacks[0].kind === "atak" && s.attacks[0].defs >= 1), "atak", 7);
  const rd = rb.g();
  const df = rd.defs.find((x) => !x.chaser && x.st !== "markm");
  Object.assign(df, { x: rd.me.x, z: rd.me.z - 1.5, st: "windup", t: 0 });
  run(rb, 2, (e) => e.state === "result");
  const lost = rb.g().res && !rb.g().res.good && rb.g().res.retry;
  run(rb, 0.5);
  rb.g().act.retry();
  const asked = rb.log.some((m) => m.type === "useBooster" && m.key === "ikinci_sans");
  rb.A.game.command({ type: "booster", key: "ikinci_sans" });
  const again = rb.g().state === "pre" && rb.g().curAtk.idx === 0 && rb.g().results[0] === null;
  check(
    "kariyer güçlendirici: krampon yeşil bölgeyi genişletir, ikinci şans kötü biten atağı yeniden oynatır",
    z1 > z0 * 1.15 && lost && asked && again,
    `bölge ${z0.toFixed(3)} → ${z1.toFixed(3)} · top kaybı sonrası useBooster ${asked ? "istendi" : "yok"} · atak ${again ? "yeniden başladı" : "başlamadı"}`,
  );
}

/* ── 4) adalet: yetkin bot ──────────────────────────────────────────────── */

{
  const SEEDS = 3;
  const BANDS = [
    // [ilk, son, en az, en çok] kazanma oranı
    [1, 26, 0.75, 0.97],
    [27, 60, 0.65, 0.92],
    [61, 96, 0.5, 0.8],
    [97, 150, 0.38, 0.62],
  ];
  const rates = [];
  let stars3 = 0, wins = 0;
  const t0 = Date.now();
  for (const [a, b, lo, hi] of BANDS) {
    let w = 0, n = 0;
    for (let l = a; l <= b; l += 1)
      for (let s = 1; s <= SEEDS; s += 1) {
        const r = playLevel(l, { seed: s * 101 + l * 7 });
        n += 1;
        if (r.end && r.end.stats.won) {
          w += 1;
          wins += 1;
          if (r.end.stats.stars === 3) stars3 += 1;
        }
      }
    rates.push({ a, b, lo, hi, r: w / n });
  }
  const inBand = rates.every((x) => x.r >= x.lo && x.r <= x.hi);
  const falling = rates.every((x, i) => i === 0 || x.r < rates[i - 1].r + 0.03);
  check(
    "kariyer adalet: yetkin bot kazanma oranı basamakla düşer (erken ≈%80–90, üst ≈%50)",
    inBand && falling && stars3 < wins,
    rates.map((x) => `${x.a}–${x.b}: %${Math.round(x.r * 100)}`).join(" · ") + ` · 3★ ${stars3}/${wins} galibiyet · ${((Date.now() - t0) / 1000).toFixed(1)} sn`,
  );
  if (VERBOSE) console.log(rates);
}

/* ── rapor ───────────────────────────────────────────────────────────────── */

for (const line of ok) console.log(`✓ ${line}`);
for (const line of fails) console.log(`✗ ${line}`);
if (fails.length) {
  console.log(`\n${fails.length} denetim başarısız.`);
  process.exit(1);
}
console.log(`\nKariyer Yolu denetimi temiz (${ok.length} iddia).`);
process.exit(0);
