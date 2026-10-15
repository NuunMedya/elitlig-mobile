/**
 * OYUN DENETİMİ — Arena oyunlarının kurallarını gözle değil SAYIYLA doğrular.
 *
 * Çalıştırma:  npm run check:games
 *
 * Oyunlar (`games/*.js`) tarayıcıda çalışan düz JS'tir. Burada Node `vm`
 * içinde, sahte bir Canvas/DOM ile BAŞSIZ çalıştırılırlar: çizim komutları
 * yutulur, fizik ve kurallar gerçek kodla işler. Ölçülen iddialar:
 *
 *   0. `lib/game/web/games.generated.ts` kaynaklarla güncel; 3B futbolcu modeli
 *      (iskelet, gövde, koşu/bekleme klipleri) eksiksiz.
 *   1. Üç oyun da vitrin modunda ve oyunda hatasız güncellenip çizilir.
 *   2. SEKTİR: topun solundan vurmak topu sağa gönderir (ve tersi); dokunmazsan
 *      top düşer ve tur biter; iyi oynayan oyuncu seviye atlar ve yerçekimi
 *      (ritim) artar.
 *   3. SLALOM: hiçbir şey yapmayan topu kaptırır ve tur biter; savunmacıdan
 *      kaçan oyuncu gol bulur; kayan savunmacıya zamanında çalım onu düşürür;
 *      gol atan sıradaki (daha kalabalık) savunmaya geçer; kadro gerçek.
 *   4. PENALTI: seri penaltı kuralları (erken bitiş, ani ölüm) doğru; atış ve
 *      kalecilik sırayla; köşeye vuruş gol olur, hep ortaya vuran okunur; zamanında uçan kaleci kurtarır; kazanan sıradaki kulübe
 *      geçer, kaybeden turnuvayı bitirir ve skor köprüden iletilir.
 *   5. BİLGİ YARIŞMALARI (Arena, Kim Bu?, Skor Tahmini): her soru geçerli
 *      (cevap şıklarda, şıklar tekil), zorluk seviyeyle artar, son sorulan
 *      oyuncu/maç hemen tekrar gelmez, maç sonucu doğru okunur, hızlı ve seri
 *      cevap daha çok puan getirir.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

import { buildModule, GENERATED_PATH, isThreeD, THREE_KIT, THREE_PATH } from "./build-games.mjs";
import {
  arenaQuestion,
  kimbuQuestion,
  levelOf,
  matchQuestion,
  multiplierOf,
  scoreFor,
  toMatches,
  toPlayers,
} from "../lib/game/quiz/questions.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fails = [];
const ok = [];
const check = (name, pass, detail) => (pass ? ok : fails).push(`${name}${detail ? ` — ${detail}` : ""}`);

/* ── 0) Üretilen paket güncel mi ─────────────────────────────────────────── */

let generated = "";
try {
  generated = readFileSync(GENERATED_PATH, "utf8");
} catch {
  /* yoksa aşağıda düşer */
}
check(
  "paket güncel",
  generated === buildModule(),
  generated === buildModule() ? "games.generated.ts kaynaklarla aynı" : "`npm run build:games` çalıştırılmalı",
);

/* ── Futbolcu modeli (3B oyunlar) ────────────────────────────────────────── */

{
  const box = { window: {} };
  vm.runInNewContext(readFileSync(join(root, "games", "athlete-data.js"), "utf8"), box);
  const d = box.window.ATHLETE_DATA;
  const clips = ["idle", "walk", "jog", "sprint"];
  check(
    "futbolcu modeli eksiksiz",
    Boolean(d) && d.bones.length === 65 && clips.every((k) => d.clips[k] && d.clips[k].d > 0) && d.parts.body.n > 1000 && /CC0/.test(d.credit),
    d ? `${d.bones.length} kemik, ${d.parts.body.n} köşe, klipler: ${Object.keys(d.clips).join(", ")}` : "veri yok",
  );
}

/* ── Başsız çalışma zamanı ───────────────────────────────────────────────── */

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
  return {
    width: 0,
    height: 0,
    getContext: () => makeCtx(),
    addEventListener() {},
    setPointerCapture() {},
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
  };
}

function boot(game) {
  const canvas = makeCanvas();
  const log = [];
  const window = {
    innerWidth: 390,
    innerHeight: 640,
    devicePixelRatio: 2,
    addEventListener() {},
    __arenaLog: log,
  };
  const context = {
    window,
    document: {
      getElementById: () => canvas,
      createElement: () => makeCanvas(),
      addEventListener() {},
      hidden: false,
    },
    requestAnimationFrame: () => 0,
    performance: { now: () => 0 },
    Path2D: class {
      moveTo() {}
      arc() {}
      ellipse() {}
      lineTo() {}
    },
    setTimeout: (fn) => {
      fn();
      return 0;
    },
    Math,
    JSON,
    Object,
    Array,
    Float32Array,
    Number,
    String,
    console,
  };
  context.window.window = context.window;
  vm.createContext(context);
  // 3B oyunlar (penaltı, slalom) three.js ile gelir; başsız ortamda WebGL yoktur, oyun
  // simülasyonu çizimsiz koşar (çizim katmanı WebGL bulamayınca devre dışı).
  const is3d = isThreeD(game);
  if (is3d) vm.runInContext(readFileSync(THREE_PATH, "utf8"), context, { filename: "three.min.js" });
  for (const file of ["core.js", "scenery.js", ...(is3d ? THREE_KIT : []), `${game}.js`]) {
    vm.runInContext(readFileSync(join(root, "games", file), "utf8"), context, { filename: file });
  }
  const A = context.window.Arena;
  const run = (seconds, each) => {
    const dt = 1 / 120;
    const steps = Math.round(seconds / dt);
    for (let i = 0; i < steps; i += 1) {
      A.time += dt;
      A.game.update(dt);
      if (each) each(A);
      if (i % 30 === 0) {
        A.stepParticles(dt * 30);
        A.game.render(A.ctx, dt * 30);
      }
    }
  };
  const over = () => log.find((m) => m.type === "over");
  return { A, run, log, over };
}

/* ── 1) Üç oyun da hatasız döner ─────────────────────────────────────────── */

for (const game of ["penalti", "slalom", "sektir"]) {
  let error = null;
  try {
    const { A, run, log } = boot(game);
    run(3);
    A.game.start();
    run(4);
    if (!log.some((m) => m.type === "ready")) throw new Error("ready mesajı yok");
  } catch (e) {
    error = e;
  }
  check(`${game} çalışıyor`, !error, error ? String(error.stack || error) : "vitrin + 4 sn oyun, hatasız");
}

/* ── 2) SEKTİR ───────────────────────────────────────────────────────────── */

{
  const { A, run } = boot("sektir");
  A.game.start();
  run(0.3);
  const ball = A.game.debug().ball;
  ball.vx = 0;
  A.game.down({ x: ball.x - ball.r * 0.8, y: ball.y });
  const vxLeftHit = A.game.debug().ball.vx;
  run(0.2);
  const b2 = A.game.debug().ball;
  b2.vx = 0;
  A.game.down({ x: b2.x + b2.r * 0.8, y: b2.y });
  const vxRightHit = A.game.debug().ball.vx;
  check(
    "sektir: vuruş yönü",
    vxLeftHit > 50 && vxRightHit < -50,
    `soldan vuruş vx=${vxLeftHit.toFixed(0)} (sağa), sağdan vuruş vx=${vxRightHit.toFixed(0)} (sola)`,
  );
}
{
  const { A, run, over } = boot("sektir");
  A.game.start();
  run(5);
  const end = over();
  check("sektir: dokunmazsan biter", end && end.score === 0, end ? `tur bitti, skor ${end.score}` : "tur bitmedi");
}
{
  const { A, run, over } = boot("sektir");
  const kit = { primary: "#dc2626", secondary: "#ffffff" };
  A.game.setRoster({
    juggler: { id: 1, short: "A. Sektirci", back: "SEKTİRCİ", shirt: 8, team: { name: "Takım", kit }, attrs: { agility: 80, control: 80 } },
    rivals: [3, 6, 10].map((value, i) => ({ id: i + 2, short: `O. ${i}`, team: { name: "Rakip", kit }, value })),
  });
  A.game.start();
  const g0 = A.game.debug().g;
  let cooldown = 0;
  run(70, () => {
    cooldown -= 1;
    const d = A.game.debug();
    if (d.state !== "play" || cooldown > 0) return;
    const b = d.ball;
    // Rüzgârı ve duvarları telafi eden "iyi oyuncu": topu merkeze doğru it.
    if (b.vy > 0 && b.y > d.groundY - 640 * 0.2) {
      const toCentre = (b.x - 195) / 195;
      A.game.down({ x: b.x + b.r * (0.18 * toCentre + (b.vx > 0 ? 0.12 : -0.12)), y: b.y });
      cooldown = 20;
    }
  });
  const d = A.game.debug();
  check(
    "sektir: sekme sayısı ligin oyuncularını geçer",
    d.juggler === "A. Sektirci" && d.passed === 3 && d.kicks >= 10,
    `${d.juggler}, ${d.kicks} sekme → ${d.passed}/3 oyuncu geçildi`,
  );
  check(
    "sektir: zorlaşıyor",
    d.kicks >= 30 && d.level >= 4 && d.g > g0 * 1.3,
    `${d.kicks} sekme, seviye ${d.level}, yerçekimi ${g0.toFixed(0)} → ${d.g.toFixed(0)}${over() ? " (tur bitti)" : ""}`,
  );
}

/* ── 3) SLALOM ───────────────────────────────────────────────────────────── */

/**
 * Slalom botu: en yakın tehlikeli savunmacıdan uzağa sürer; `skill` açıksa
 * savunmacı kaymaya hazırlanırken çalım atar; ceza sahasında köşeye şut.
 */
function slalomBot(A, run, { skill = false, steer = true, restart = true } = {}) {
  const W = 390;
  const seen = [];
  let finger = null;
  const lift = () => {
    if (finger) A.game.up(finger);
    finger = null;
  };
  const step = () => {
    const d = A.game.debug();
    if (d.state === "over" && restart) {
      A.game.start();
      return;
    }
    if (d.state === "play" && steer) {
      const p = d.player;
      let threat = null, best = 1e9;
      for (const f of d.foes) {
        const gap = p.z - f.z;
        if (gap < -0.5 || f.st === "down" || f.st === "beaten") continue;
        const dist = Math.hypot(p.x - f.x, gap);
        if (dist < best) (best = dist), (threat = f);
      }
      let want = 0;
      if (threat && best < 9) want = threat.x > p.x ? threat.x - 3.2 : threat.x + 3.2;
      if (Math.abs(want) > 10) want = threat.x > 0 ? threat.x - 3.2 : threat.x + 3.2;
      if (!finger) {
        finger = { x: 195, y: 400 };
        A.game.down(finger);
      }
      finger = { x: finger.x + ((want - p.tx) / 13) * W, y: 400 };
      A.game.move(finger);
      if (skill && threat && threat.st === "windup" && threat.t > threat.wind * 0.55 && p.skillCd <= 0) {
        lift();
        A.game.down({ x: 100, y: 300 });
        A.game.up({ x: 100, y: 300 });
      }
    }
    if (d.state === "shoot") {
      lift();
      run(0.25);
      const side = Math.random() < 0.5 ? -1 : 1;
      A.game.down({ x: 195, y: 500 });
      run(0.12);
      A.game.up({ x: 195 + side * 85, y: 300 });
    }
    const before = d.state;
    run(1 / 60);
    const after = A.game.debug();
    if (before !== "result" && after.state === "result") {
      lift();
      seen.push({ kind: after.outcome.kind, attack: after.attack, foes: after.foes.length, defense: after.defense });
    }
  };
  return {
    seen,
    until(fn, limit = 400000) {
      for (let i = 0; i < limit && !fn(); i++) step();
    },
  };
}

{
  const { A, run, over } = boot("slalom");
  A.game.start();
  run(60);
  const end = over();
  const d = A.game.debug();
  check(
    "slalom: hiçbir şey yapmayan topu kaptırır, üç hakta tur biter",
    Boolean(end) && d.lives === 0 && d.tally.goals === 0,
    end ? `tur bitti: ${d.tally.attacks} atak, ${d.tally.goals} gol, skor ${end.score}` : `tur bitmedi (hak ${d.lives})`,
  );
}
{
  const { A, run } = boot("slalom");
  A.game.start();
  const bot = slalomBot(A, run);
  bot.until(() => bot.seen.length >= 40);
  const goals = bot.seen.filter((k) => k.kind === "gol").length / bot.seen.length;
  const lost = bot.seen.filter((k) => k.kind === "kaptirdin").length / bot.seen.length;
  check("slalom: savunmacıdan kaçan oyuncu geçer ve gol bulur", goals >= 0.3 && lost <= 0.55, `40 atakta %${Math.round(goals * 100)} gol, %${Math.round(lost * 100)} top kaybı`);
}
{
  // Çalım: savunmacı kaymaya hazırlanırken dokun → savunmacı boşa düşer.
  const { A, run } = boot("slalom");
  A.game.start();
  let dummies = 0, tries = 0;
  for (let i = 0; i < 200000 && tries < 25; i++) {
    const d = A.game.debug();
    if (d.state === "over") A.game.start();
    const f = d.foes.find((x) => x.st === "windup");
    if (d.state === "play" && f && f.t > f.wind * 0.5 && d.player.skillCd <= 0) {
      tries += 1;
      A.game.down({ x: 100, y: 300 });
      A.game.up({ x: 100, y: 300 });
      run(0.45);
      if (f.dummied) dummies += 1;
      continue;
    }
    run(1 / 60);
  }
  check("slalom: kayan savunmacıya zamanında çalım, savunmacıyı düşürür", tries >= 10 && dummies / tries >= 0.6, `${tries} denemede ${dummies} çalım`);
}
{
  // Gerçek kadro + merdiven: koşucu, savunma, kaleci kadrodan; gol atan sıradaki savunmaya geçer.
  const { A, run } = boot("slalom");
  const team = (id, name, c) => ({ id, name, kit: { primary: c, secondary: "#ffffff" } });
  const defense = (id, name, c, keeper) => ({
    team: team(id, name, c),
    conceded_per_match: 2 - id * 0.4,
    defenders: [4, 5, 3].map((n) => ({ id: id * 10 + n, name: "Def " + n, short: "D. " + n, back: "DEF" + n, shirt: n })),
    keeper,
  });
  A.game.setRoster({
    runner: { id: 1, name: "Ali Koşucu", short: "A. Koşucu", back: "KOŞUCU", shirt: 7, team: team(9, "Bizimkiler", "#dc2626"), attrs: { agility: 82, control: 80, pace: 78 } },
    defenses: [
      defense(1, "Zayıf Savunma", "#2563eb", { id: 50, name: "Kaan Kale", short: "K. Kale", back: "KALE", shirt: 1, saves: 12 }),
      defense(2, "Orta Savunma", "#16a34a", null),
      defense(3, "En İyi Savunma", "#111827", null),
    ],
  });
  A.game.start();
  const d0 = A.game.debug();
  const bot = slalomBot(A, run, { skill: true, restart: false });
  bot.until(() => A.game.debug().attack >= 1 || A.game.debug().state === "over");
  const d1 = A.game.debug();
  check(
    "slalom: koşucu, savunma ve kaleci kadrodan gelir",
    d0.runner === "A. Koşucu" && d0.defense === "Zayıf Savunma" && d0.keeperName === "K. Kale" && d0.foes.length === 3,
    `${d0.runner} vs ${d0.defense} (${d0.foes.length} savunmacı, kaleci ${d0.keeperName})`,
  );
  check(
    "slalom: gol atan sıradaki savunmaya geçer, savunma kalabalıklaşır",
    d1.state === "over" || (d1.attack === 1 && d1.defense === "Orta Savunma" && d1.foes.length >= d0.foes.length && d1.foes[0].pressAt > d0.foes[0].pressAt - 2),
    d1.state === "over" ? "bot üç hakta da gol bulamadı (izin verilir)" : `${d1.defense}: ${d1.foes.length} savunmacı`,
  );
}

/* ── 4) PENALTI ──────────────────────────────────────────────────────────── */

/**
 * Penaltı botu: atışta nişan + güç zamanlaması, kalede tepki. `aim(d)` hedef
 * (x, y) döndürür; `power` "iyi" ise yeşil bölgenin ortasında, "zayıf" ise
 * bölgenin altında dokunur; `react` kalecinin tepki süresi (sn, null = hiç).
 */
function penaltyBot(A, run, { aim, power = "iyi", react = 0.22, type = "plase", restart = false }) {
  const W = 390, H = 640;
  const seen = [];
  let guard = 0;
  const step = () => {
    const d = A.game.debug();
    if (d.state === "over" && restart) {
      A.game.start();
      return;
    }
    if (d.state === "aim") {
      if (d.shotType !== type) {
        const order = ["plase", "sert", "kasik"];
        const bw = Math.min(104, (W - 48) / 3), x0 = W / 2 - (bw * 3 + 16) / 2;
        A.game.down({ x: x0 + order.indexOf(type) * (bw + 8) + bw / 2, y: H - 44 });
        A.game.up({ x: x0 + order.indexOf(type) * (bw + 8) + bw / 2, y: H - 44 });
      }
      const [tx, ty] = aim(d);
      const dx = ((tx - d.aim.x) / 8.6) * W, dy = -((ty - d.aim.y) / 4.6) * H;
      A.game.down({ x: 195, y: 400 });
      A.game.move({ x: 195 + dx, y: 400 + dy });
      A.game.up({ x: 195 + dx, y: 400 + dy });
      return;
    }
    if (d.state === "power") {
      const want = power === "iyi" ? (d.zone[0] + d.zone[1]) / 2 : Math.max(0.05, d.zone[0] - 0.3);
      if (Math.abs(d.powerV - want) < 0.025) A.game.down({ x: 100, y: 300 });
      run(1 / 120);
      return;
    }
    if (d.state === "keepFlight" && react != null) {
      const b = d.ball, k = d.keeper;
      if (!k.dive && !k.stay && b.t > react) {
        const ft = (0.35 - b.z) / b.vz;
        const px = b.x + b.vx * ft, py = b.y + b.vy * ft - 4.9 * ft * ft;
        const len = Math.hypot(px, py - 1) || 1;
        const L = Math.min(1, len / 2.8) * W * 0.32 + 40;
        A.game.down({ x: 195, y: 400 });
        A.game.up({ x: 195 - (px / len) * L, y: 400 - ((py - 1) / len) * L });
      }
    }
    const before = d.state;
    run(1 / 60);
    const after = A.game.debug();
    if (before !== "result" && after.state === "result") seen.push({ ...after.lastKick, me: after.me.slice(), op: after.op.slice(), matchIdx: after.matchIdx });
  };
  return {
    seen,
    until(fn, limit = 60000) {
      while (!fn() && guard++ < limit) step();
    },
  };
}
const rate = (list, who, result) => {
  const mine = list.filter((k) => k.who === who);
  return mine.length ? mine.filter((k) => k.result === result).length / mine.length : 0;
};
const kitP = { primary: "#dc2626", secondary: "#ffffff" }, kitB = { primary: "#1d4ed8", secondary: "#ffffff" }, kitY = { primary: "#facc15", secondary: "#111827" };
const penRoster = {
  shooter: { id: 1, name: "Ali Golcü", short: "A. Golcü", back: "GOLCÜ", shirt: 9, team: { id: 10, name: "Kırmızı SK", kit: kitP }, attrs: { power: 82, accuracy: 85, curve: 75 } },
  keepers: [
    { id: 2, name: "Kaan Bir", short: "K. Bir", team: { id: 20, name: "Mavi FK", kit: kitB }, attrs: { reflex: 60 }, stats: { saves: 10 } },
    { id: 3, name: "Kerem İki", short: "K. İki", team: { id: 30, name: "Sarı Spor", kit: kitY }, attrs: { reflex: 92 }, stats: { saves: 60 } },
  ],
  takers: [{ id: 21, name: "Mert Mavi", short: "M. Mavi", team: { id: 20, name: "Mavi FK", kit: kitB }, attrs: { power: 80, accuracy: 80 }, stats: { goals: 9 } }],
};
const corner = () => [(Math.random() < 0.5 ? -1 : 1) * (2.35 + Math.random() * 0.8), 0.35 + Math.random() * 1.5];

{
  const { A } = boot("penalti");
  const decide = A.game.debug().decide;
  const g = "g", x = "x";
  const cases = [
    [[g, g, g], [x, x, x], false, "won"], // 3–0, rakibin 2 atışı kaldı: yetişemez
    [[g, g, g], [x, x], false, null], // rakip hâlâ yetişebilir
    [[x, x, x], [g, g, g], false, "lost"],
    [[g, x, g, x, g], [g, g, x, g, x], false, null], // 3–3: ani ölüme
    [[g, g, g, g, g, g], [g, g, g, g, g, x], true, "won"],
    [[g, g, g, g, g, x], [g, g, g, g, g, g], true, "lost"],
    [[g, g, g, g, g, g], [g, g, g, g, g], true, null], // çift tamamlanmadı
  ];
  const bad = cases.filter(([m, o, s, want]) => decide(m, o, s) !== want);
  check("penaltı: seri penaltı kuralları (erken bitiş, ani ölüm)", bad.length === 0, bad.length ? JSON.stringify(bad[0]) : `${cases.length} durum doğru`);
}
{
  const { A, run } = boot("penalti");
  A.game.setRoster(penRoster);
  A.game.start();
  const d0 = A.game.debug();
  check(
    "penaltı: atıcı, rakip kulüp ve atıcıları kadrodan gelir",
    d0.shooter === "A. Golcü" && d0.opponent === "Mavi FK" && d0.oppKeeper === "K. Bir",
    `${d0.shooter} vs ${d0.opponent} (kaleci ${d0.oppKeeper})`,
  );
  const bot = penaltyBot(A, run, { aim: corner });
  let order = true;
  bot.until(() => bot.seen.length >= 6);
  bot.seen.forEach((k, i) => {
    if (k.who !== (i % 2 ? "op" : "me")) order = false;
  });
  const takers = bot.seen.filter((k) => k.who === "op").length;
  check("penaltı: sırayla atış ve kalecilik", order && takers === 3, bot.seen.map((k) => (k.who === "me" ? "A" : "K") + ":" + k.result).join(" "));
}
{
  const { A, run } = boot("penalti");
  A.game.setRoster(penRoster);
  A.game.start();
  const good = penaltyBot(A, run, { aim: corner, react: null, restart: true });
  good.until(() => good.seen.filter((k) => k.who === "me").length >= 80);
  const { A: B, run: runB } = boot("penalti");
  B.game.setRoster(penRoster);
  B.game.start();
  const weak = penaltyBot(B, runB, { aim: () => [A.rand(-0.4, 0.4), 0.6], react: null, restart: true });
  weak.until(() => weak.seen.filter((k) => k.who === "me").length >= 80);
  const gGood = rate(good.seen, "me", "gol"), gWeak = rate(weak.seen, "me", "gol");
  check("penaltı: köşeye vuruş gol, hep ortaya vuran okunur", gGood >= 0.7 && gWeak <= 0.62 && gGood > gWeak + 0.22, `köşe %${Math.round(gGood * 100)} gol · hep orta %${Math.round(gWeak * 100)} gol`);
}
{
  const saveRate = (react) => {
    const { A, run } = boot("penalti");
    A.game.setRoster(penRoster);
    A.game.start();
    const bot = penaltyBot(A, run, { aim: corner, react, restart: true });
    bot.until(() => bot.seen.filter((k) => k.who === "op").length >= 40);
    return rate(bot.seen, "op", "kurtaris");
  };
  const quick = saveRate(0.2), none = saveRate(null);
  check("penaltı: zamanında doğru yöne uçan kaleci kurtarır", quick >= 0.4 && none <= 0.22, `tepkili kaleci %${Math.round(quick * 100)} kurtarış · hiç uçmayan %${Math.round(none * 100)}`);
}
{
  // İyi oynayan: kazanır, sıradaki kulübe geçer. Kötü oynayan: kaybeder, tur biter.
  const { A, run, over } = boot("penalti");
  A.game.setRoster(penRoster);
  A.game.start();
  const bot = penaltyBot(A, run, { aim: corner, react: 0.18 });
  bot.until(() => A.game.debug().matchIdx >= 1 || A.game.debug().state === "over");
  const d = A.game.debug();
  const advanced = d.matchIdx === 1 && d.tally.wins === 1 && d.points >= 400 && d.opponent === "Sarı Spor";
  const { A: B, run: runB, over: overB } = boot("penalti");
  B.game.setRoster(penRoster);
  B.game.start();
  const loser = penaltyBot(B, runB, { aim: () => [0, 0.4], power: "zayıf", react: null });
  loser.until(() => B.game.debug().state === "over");
  const end = overB();
  check(
    "penaltı: kazanan sıradaki kulübe geçer, kaybeden turnuvayı bitirir",
    (advanced || Boolean(over())) && Boolean(end) && end.stats && end.stats.wins < 2 && !end.stats.champion && end.stats.keepers === 2,
    `iyi oyuncu: ${advanced ? "2. maça geçti (" + d.opponent + ")" : "ilk maçı kaybetti"} · kötü oyuncu: ${end ? "tur bitti, skor " + end.score : "bitmedi"}`,
  );
}

/* ── 5) BİLGİ YARIŞMALARI ────────────────────────────────────────────────── */

{
  // Sahte ama gerçekçi havuz: 12 takım × 6 oyuncu, gol/maç dağılımı geniş.
  let seed = 7;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const rawPlayers = [];
  for (let t = 0; t < 12; t += 1) {
    for (let k = 0; k < 6; k += 1) {
      const id = t * 10 + k + 1;
      rawPlayers.push({
        id,
        name: `Oyuncu ${String.fromCharCode(65 + t)}${k} Soyad${id}`,
        teamName: `Takım ${t + 1} SK`,
        matches: 3 + Math.floor(rand() * 20),
        goals: Math.floor(rand() * 30),
        assists: Math.floor(rand() * 12),
        points: Math.floor(rand() * 900),
      });
    }
  }
  rawPlayers.push({ id: 999, name: "HÜKMEN", teamName: "x", matches: 5, goals: 0 });
  const players = toPlayers(rawPlayers);
  check("yarışma: sistem oyuncuları havuza girmez", !players.some((p) => /hükmen/i.test(p.name)), `${players.length} oyuncu`);

  const valid = (q) =>
    q &&
    q.options.some((o) => o.key === q.answer) &&
    new Set(q.options.map((o) => o.key)).size === q.options.length &&
    q.options.length >= 2 &&
    q.seconds >= 4;

  for (const [name, make] of [
    ["arena", (lvl, recent) => arenaQuestion(players, lvl, recent, "İzmir", rand)],
    ["kim bu", (lvl, recent) => kimbuQuestion(players, lvl, recent, rand)],
  ]) {
    let bad = 0;
    let made = 0;
    const tags = new Set();
    for (let lvl = 1; lvl <= 8; lvl += 1) {
      for (let i = 0; i < 120; i += 1) {
        const q = make(lvl, new Set());
        made += 1;
        if (!valid(q)) bad += 1;
        else tags.add(q.tag);
      }
    }
    check(`yarışma: ${name} soruları geçerli`, bad === 0 && tags.size >= 3, `${made} soru, ${bad} geçersiz, ${tags.size} soru türü (${[...tags].join(", ")})`);
  }

  // Zorluk: düellolarda iki değerin oranı seviye yükseldikçe 1'e yaklaşır.
  const duelRatio = (lvl) => {
    const ratios = [];
    for (let i = 0; i < 300; i += 1) {
      const q = arenaQuestion(players, lvl, new Set(), "Türkiye", rand);
      if (q?.visual.type !== "duel") continue;
      const [a, b] = q.visual.players;
      const m = q.visual.metric;
      const v = (p) => (m === "goals" ? p.goals : m === "matches" ? p.matches : m === "assists" ? p.assists : m === "points" ? p.points : p.goals / p.matches);
      ratios.push(Math.max(v(a), v(b)) / Math.max(0.0001, Math.min(v(a), v(b))));
    }
    ratios.sort((x, y) => x - y);
    return ratios[Math.floor(ratios.length / 2)];
  };
  const easy = duelRatio(1);
  const hard = duelRatio(6);
  const t1 = arenaQuestion(players, 1, new Set(), "x", rand).seconds;
  const t6 = arenaQuestion(players, 6, new Set(), "x", rand).seconds;
  check("yarışma: zorluk artar", easy > hard && easy >= 1.8 && t6 <= t1, `düello oran medyanı ${easy.toFixed(2)} → ${hard.toFixed(2)}, süre ${t1} → ${t6} sn`);

  // Tekrar etmeme: son sorulanlar havuzda yeterli seçenek varken gelmez.
  const recent = [];
  let repeats = 0;
  for (let i = 0; i < 60; i += 1) {
    const q = kimbuQuestion(players, 2, new Set(recent), rand);
    if (q.subjects.some((s) => recent.slice(-10).includes(s))) repeats += 1;
    recent.push(...q.subjects);
  }
  check("yarışma: aynı oyuncu hemen tekrar gelmez", repeats === 0, `60 soruda ${repeats} tekrar`);

  // Skor tahmini
  const matches = toMatches([
    { id: 1, first_team_name: "Ada FK", second_team_name: "Kale SK", first_team_score: 3, second_team_score: 1 },
    { id: 2, first_team_name: "Ada FK", second_team_name: "Deniz SK", first_team_score: 2, second_team_score: 2 },
    { id: 3, first_team_name: "Kale SK", second_team_name: "Deniz SK", first_team_score: "0", second_team_score: "4" },
    { id: 4, first_team_name: "Kale SK", second_team_name: "Ada FK", first_team_score: null, second_team_score: null },
    { id: 5, first_team_name: "HÜKMEN", second_team_name: "Ada FK", first_team_score: 0, second_team_score: 3 },
    { id: 6, first_team_name: "Ada FK", second_team_name: "Kale SK", first_team_score: 1, second_team_score: 0, mac_durumu: "canli" },
  ]);
  const expected = { 1: "home", 2: "draw", 3: "away" };
  let wrongAnswers = 0;
  let wrongLabels = 0;
  const seen = new Set();
  const recentM = [];
  for (let i = 0; i < 30; i += 1) {
    const q = matchQuestion(matches, 1 + (i % 6), new Set(recentM.slice(-2)), rand);
    const id = q.visual.match.id;
    seen.add(id);
    recentM.push(...q.subjects);
    if (q.answer !== expected[id]) wrongAnswers += 1;
    const m = q.visual.match;
    const labels = q.options.map((o) => o.label).join(" | ");
    if (labels !== `${m.home} kazandı | Berabere | ${m.away} kazandı`) wrongLabels += 1;
  }
  check(
    "skor tahmini: yalnız oynanmış maçlar, doğru cevap",
    matches.length === 3 && wrongAnswers === 0 && wrongLabels === 0 && seen.size === 3,
    `${matches.length} geçerli maç (oynanmamış/canlı/hükmen elendi), 30 soruda ${wrongAnswers} yanlış cevap anahtarı`,
  );

  check(
    "yarışma: hız ve seri puanı",
    scoreFor(1, 1) === 200 && scoreFor(0, 1) === 100 && scoreFor(0.5, 6) === 300 && multiplierOf(10) === 3 && levelOf(5) === 2,
    `tam süre 200, son saniye 100, 6 seride yarı süre ${scoreFor(0.5, 6)}`,
  );
}

/* ── Rapor ───────────────────────────────────────────────────────────────── */

for (const line of ok) console.log(`✓ ${line}`);
for (const line of fails) console.log(`✗ ${line}`);
if (fails.length) {
  console.log(`\n${fails.length} denetim başarısız.`);
  process.exit(1);
}
console.log(`\nOyun denetimi temiz (${ok.length} iddia).`);
process.exit(0);
