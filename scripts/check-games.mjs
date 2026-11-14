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
 *   1. Beş oyun da vitrin modunda ve oyunda hatasız güncellenip çizilir.
 *   2. SEKTİR (Flappy futbol): dokunmazsan top yere düşer ve tur biter;
 *      boşluğu izleyen oyuncu gol atar ve seviye atlar; hız artar, boşluk
 *      daralır; alçak top baraja, yüksek top direğe takılır; gol sayısı
 *      ligin oyuncularını geçer.
 *   3. SLALOM (sonsuz koşu): kıpırdamayan oyuncu elenir; yolu izleyen ilerler,
 *      hız ve seviye artar; her sırada geçilebilir bir yol vardır ve sıralar
 *      tepki payı bırakır. Şerit değiştirme savrulmadan oturur, zıplama engeli
 *      aşar; güçler (KALKAN, TURBO, ×2) işini yapar; rakip adı sığmazsa kısalır.
 *      SAVUNMA HATTI: boş saha gol yer; kart ekonomisi (güneş, dolum, kilit);
 *      forvet koridorunu korur, stoper oyalar, pres yavaşlatır, füze 3×3
 *      temizler; dalgalar ilerler, kaptan gelir. 100 bölümün hepsi üretilir ve
 *      TS ikiziyle (lib/puzzle/levels/savunma.ts) alan alan aynıdır; yenilikler
 *      oransal ve geç gelir; bölüm modu (güçlendirici, fail/continue/giveUp)
 *      sözleşmeye uyar; basit bot öğretici bölümleri kazanır.
 *      KADRO KOŞUSU: kapı aritmetiği; kötü kapılar kadroyu bitirir, iyi kapılar
 *      büyütür; rakip yalnız top değince düşer; temas kaybı bire bir görünür;
 *      kaleci düşer, bölüm atlanır.
 *   4. PENALTI: seri penaltı kuralları (erken bitiş, ani ölüm) doğru; yalnız sen
 *      atarsın, rakibin atışı sırayla sayılır; köşeye vuruş gol olur, hep ortaya
 *      vuran okunur; kazanan sıradaki kulübe geçer, kaybeden turnuvayı bitirir.
 *      Doğru güçte top tam nişana gider, güç hatası sapma yapar, rüzgâr
 *      sürükler; jokerler işini yapar; merdivende koşullar zorlaşır.
 *      BÖLÜM MODU: 150 bölümün hepsi üretilir ve TS ikiziyle
 *      (lib/puzzle/levels/penalti.ts) birebir aynıdır; yenilik açılmadan
 *      görünmez, zorluk artar; over/fail/continue/giveUp sözleşmeye uyar;
 *      baraj ve savunmacı keser, halka golü sayılır; skor sunucu tavanında.
 *   5. BİLGİ YARIŞMALARI (Arena, Kim Bu?, Skor Tahmini): her soru geçerli
 *      (cevap şıklarda, şıklar tekil), zorluk seviyeyle artar, son sorulan
 *      oyuncu/maç hemen tekrar gelmez, maç sonucu doğru okunur, hızlı ve seri
 *      cevap daha çok puan getirir.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

import { buildModule, GENERATED_PATH, isThreeD, kitFiles, THREE_PATH } from "./build-games.mjs";
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
import * as TS_SAVUNMA from "../lib/puzzle/levels/savunma.ts";
import * as TS_PENALTI from "../lib/puzzle/levels/penalti.ts";
import * as TS_KADRO from "../lib/puzzle/levels/kadro.ts";

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
    // three.js'in UMD derlemesi her yüklemede kullanımdan kaldırma uyarısı basar; gürültü.
    console: { ...console, warn: (...args) => (/build\/three/.test(String(args[0])) ? undefined : console.warn(...args)) },
  };
  context.window.window = context.window;
  vm.createContext(context);
  // 3B oyunlar (penaltı, slalom) three.js ile gelir; başsız ortamda WebGL yoktur, oyun
  // simülasyonu çizimsiz koşar (çizim katmanı WebGL bulamayınca devre dışı).
  const is3d = isThreeD(game);
  if (is3d) vm.runInContext(readFileSync(THREE_PATH, "utf8"), context, { filename: "three.min.js" });
  for (const file of ["core.js", "scenery.js", ...(is3d ? kitFiles(game) : []), `${game}.js`]) {
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

/** RN → oyun komutu (window.ArenaCmd) başsız ortamda. */
function window_cmd(A, cmd) {
  if (A.game.command) A.game.command(cmd);
}

/* ── 1) Beş oyun da hatasız döner ─────────────────────────────────────────── */

for (const game of ["penalti", "slalom", "sektir", "savunma", "kadro", "sehir"]) {
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

/** Sektir botu: sıradaki boşluğun ortasının biraz altına inince dokunur. */
function sektirBot(A, { hold = null } = {}) {
  return () => {
    const d = A.game.debug();
    if (d.state === "ready") {
      A.game.down({ x: 100, y: 300 });
      return;
    }
    if (d.state !== "play") return;
    let want;
    if (hold != null) want = hold;
    else {
      const g = d.gates.find((x) => x.x + d.GATE_HW > d.ball.x - d.BR);
      want = g ? g.gc + g.off - g.gap * 0.18 : 3;
    }
    if (d.ball.vy < 0.3 && d.ball.y < want) A.game.down({ x: 100, y: 300 });
  };
}
{
  const { A, run, over } = boot("sektir");
  A.game.start();
  run(0.5);
  const ready = A.game.debug().state === "ready";
  A.game.down({ x: 100, y: 300 }); // başlama vuruşu
  run(4);
  const end = over();
  check("sektir: dokunmazsan top yere düşer, tur biter", ready && end && end.score === 0 && A.game.debug().death === "yer", end ? `tur bitti (${A.game.debug().death}), skor ${end.score}` : "tur bitmedi");
}
{
  const { A, run, over } = boot("sektir");
  A.game.start();
  const d0 = A.game.debug();
  const s0 = d0.speed, gap0 = d0.gap;
  const bot = sektirBot(A);
  run(60, bot);
  const d = A.game.debug();
  check("sektir: boşluğu izleyen oyuncu gol atar", d.goals >= 30 && d.level >= 3, `${d.goals} gol, ${d.points} puan, seviye ${d.level}${over() ? " (tur bitti: " + d.death + ")" : ""}`);
  check(
    "sektir: zorlaşıyor (hız artar, boşluk daralır)",
    d.speed > s0 * 1.25 && d.gap < gap0 * 0.85,
    `hız ${s0.toFixed(1)} → ${d.speed.toFixed(1)} m/sn · boşluk ${gap0.toFixed(2)} → ${d.gap.toFixed(2)} m`,
  );
}
{
  // alçakta kalan baraja, yüksekte kalan kalenin direğine çarpar
  const { A, run } = boot("sektir");
  A.game.start();
  run(12, sektirBot(A, { hold: 0.7 }));
  const low = A.game.debug().death;
  const { A: B, run: runB } = boot("sektir");
  B.game.start();
  runB(12, sektirBot(B, { hold: 6.2 }));
  const high = B.game.debug().death;
  check("sektir: alçak top baraja, yüksek top direğe takılır", low === "baraj" && high === "direk", `alçak → ${low || "-"} · yüksek → ${high || "-"}`);
}
{
  const { A, run } = boot("sektir");
  const kit = { primary: "#dc2626", secondary: "#ffffff" };
  A.game.setRoster({
    juggler: { id: 1, short: "A. Sektirci", back: "SEKTİRCİ", shirt: 8, team: { name: "Takım", kit }, attrs: { agility: 80, control: 80 } },
    rivals: [3, 8, 15].map((v, i) => ({ id: 10 + i, short: "R. Rakip" + i, name: "Rakip Oyuncu " + i, shirt: 4 + i, team: { name: "Rakip " + i, kit }, value: v })),
  });
  A.game.start();
  run(40, sektirBot(A));
  const d = A.game.debug();
  const ctx = { measureText: (t) => ({ width: t.length * 7 }) };
  const full = d.fitName(ctx, { name: "Mehmet Yıldırım", short: "M. Yıldırım" }, 140);
  const cut = d.fitName(ctx, { name: "Muhammed Abdurrahman Karaosmanoğlu", short: "M. Karaosmanoğlu" }, 60);
  check(
    "sektir: gol sayısı ligin oyuncularını geçer, baraj adları sığar",
    d.juggler === "A. Sektirci" && d.passed >= 2 && full === "Mehmet Yıldırım" && cut.endsWith("…"),
    `${d.juggler}, ${d.goals} gol → ${d.passed}/3 oyuncu geçildi · "${full}" · "${cut}"`,
  );
}

/* ── 3) SLALOM (sonsuz koşu) ─────────────────────────────────────────────── */

/** Koşu botu: oyunun kendi vitrin pilotu (yol şeridine geçer, zıplar, kayar). */
const pilot = (A) => {
  const d = A.game.debug();
  if (d.state === "play") d.autopilot();
};

{
  // Hiçbir şey yapmayan oyuncu: engellere çarpa çarpa hakları biter.
  const { A, run, over } = boot("slalom");
  A.game.start();
  run(60);
  const end = over();
  const d = A.game.debug();
  check(
    "slalom: kıpırdamayan oyuncu elenir",
    Boolean(end) && d.lives === 0,
    end ? `${Math.round(d.z)} m'de elendi (geçilen sıra ${d.passed})` : `tur bitmedi, ${Math.round(d.z)} m`,
  );
}
{
  // Yolu izleyen oyuncu: sıralar hatasız geçilir, puan ve hız artar.
  const { A, run } = boot("slalom");
  A.game.start();
  const v0 = A.game.debug().speed;
  let topSpeed = 0, livesAt14 = null;
  run(45, (arena) => {
    pilot(arena);
    const d = arena.game.debug();
    topSpeed = Math.max(topSpeed, d.speed);
    if (livesAt14 == null && d.passed >= 14) livesAt14 = d.lives;
  });
  const d = A.game.debug();
  check(
    "slalom: yolu izleyen oyuncu ilerler",
    d.passed >= 30 && livesAt14 === 3 && d.points > d.passed * 3 && d.coins > 20,
    `${d.passed} sıra, ${d.points} puan, ${d.coins} altın, 14. sırada kalan hak ${livesAt14}`,
  );
  check("slalom: zorlaşıyor", topSpeed > v0 * 1.25 && d.level >= 3, `hız ${v0.toFixed(1)} → ${topSpeed.toFixed(1)} m/sn, seviye ${d.level}`);
  // Her sırada geçilebilir bir yol var; yol bir sıradan ötekine en çok bir şerit kayar.
  const rows = d.rows;
  const fair = rows.every((r, i) => {
    const cell = r.cells[r.path + 1];
    const passable = cell == null || cell === "hurdle" || cell === "bar" || cell === "tackler";
    return passable && (i === 0 || Math.abs(r.path - rows[i - 1].path) <= 1);
  });
  const gaps = rows.slice(1).map((r, i) => r.z - rows[i].z);
  check("slalom: her sırada yol var, sıralar tepki payı bırakır", fair && Math.min(...gaps) >= 11.5, `${rows.length} sıra, en dar aralık ${Math.min(...gaps).toFixed(1)} m`);
}
{
  // Gerçek kadro: koşucu kadrodan gelir, her seviyede sıradaki takımın savunması.
  const { A, run } = boot("slalom");
  const team = (id, name) => ({ id, name, kit: { primary: "#dc2626", secondary: "#ffffff" } });
  const defense = (id, name) => ({ team: team(id, name), conceded_per_match: 1, defenders: [{ id: id * 10, short: "D. Bir", back: "BİR", shirt: 4 }] });
  A.game.setRoster({
    runner: { id: 1, short: "A. Koşucu", back: "KOŞUCU", shirt: 7, team: team(9, "Bizimkiler"), attrs: { agility: 80, control: 80, pace: 70 } },
    defenses: [defense(1, "Zayıf Savunma"), defense(2, "Orta Savunma"), defense(3, "En İyi Savunma")],
  });
  A.game.start();
  run(40, pilot);
  const d = A.game.debug();
  const want = ["Zayıf Savunma", "Orta Savunma", "En İyi Savunma"][Math.min(d.level, 3) - 1];
  const who = d.obstacles.find((o) => o.who);
  check(
    "slalom: koşucu ve rakip savunma kadrodan gelir",
    d.runner === "A. Koşucu" && d.defense === want && d.level >= 2 && (!who || who.who.short === "D. Bir"),
    `${d.runner}, seviye ${d.level} → ${d.defense}`,
  );
}
{
  // Hareket: şerit değiştirme hızlı oturur, savrulmaz; zıplama engeli aşar, kayma pankartın altından geçirir.
  const { A, run } = boot("slalom");
  A.game.start();
  const d = A.game.debug();
  const p = d.player;
  d.shift(1);
  let maxX = 0, t90 = null, t = 0;
  run(0.6, () => {
    t += 1 / 120;
    maxX = Math.max(maxX, p.x);
    if (t90 == null && p.x >= 2.3 * 0.9) t90 = t;
  });
  const edge = d.shift(1) === false && p.lane === 1;
  check(
    "slalom: şerit değiştirme dengeli (hızlı oturur, savrulmaz)",
    t90 != null && t90 < 0.25 && maxX <= 2.3 + 0.01 && Math.abs(p.x - 2.3) < 0.02 && edge,
    `%90'a ${t90 == null ? "—" : t90.toFixed(2)} sn, en çok ${maxX.toFixed(2)} m (şerit 2,30)`,
  );
  d.jump();
  let top = 0, air = 0;
  run(1, () => {
    top = Math.max(top, p.y);
    if (p.y > 0.7) air += 1 / 120;
  });
  d.slide();
  const sliding = p.slide > 0.5;
  run(1);
  check(
    "slalom: zıplama engeli aşar, kayma biter",
    top > 1.5 && top < 2 && air > 0.35 && sliding && p.slide === 0 && p.y === 0,
    `tepe ${top.toFixed(2)} m, engel üstünde ${air.toFixed(2)} sn`,
  );
}
{
  // Güçler: KALKAN bir çarpışmayı affeder, TURBO engelleri devirir, ×2 çarpanı katlar.
  const { A, run } = boot("slalom");
  A.game.start();
  const d = A.game.debug();
  d.grant("shield");
  // kıpırdamadan: ilk çarpışmayı kalkan alır, hak gitmez
  let afterShield = null;
  run(16, (arena) => {
    const x = arena.game.debug();
    if (!afterShield && x.active.shield === 0) afterShield = { lives: x.lives, z: x.z };
  });
  const shieldSaved = Boolean(afterShield) && afterShield.lives === 3 && afterShield.z > 20;
  const { A: B, run: runB } = boot("slalom");
  B.game.start();
  const db = B.game.debug();
  runB(4, pilot);
  db.grant("turbo");
  const m1 = db.multiplier();
  db.grant("x2");
  const m2 = db.multiplier();
  runB(3.5); // pilot yok: turbo boyunca çarpışmalar hak götürmez
  const dt = B.game.debug();
  check(
    "slalom: güçler işini yapar",
    shieldSaved && dt.lives === 3 && m2 === m1 * 2 && dt.active.turbo > 0,
    `kalkan sonrası hak ${afterShield ? afterShield.lives : "—"}, turbo boyunca hak ${dt.lives}, çarpan ×${m1} → ×${m2}`,
  );
  const ctx = { measureText: (t) => ({ width: t.length * 7 }) };
  const full = d.foeLabel(ctx, { name: "Mehmet Yıldırım", short: "M. Yıldırım" }, 150);
  const mid = d.foeLabel(ctx, { name: "Muhammed Abdurrahman Karaosmanoğlu", short: "M. Karaosmanoğlu" }, 150);
  const tiny = d.foeLabel(ctx, { name: "Muhammed Abdurrahman Karaosmanoğlu", short: "M. Karaosmanoğlu" }, 70);
  check(
    "slalom: rakip adı tam ya da kısaltılmış",
    full === "Mehmet Yıldırım" && mid === "M. Karaosmanoğlu" && tiny.endsWith("…") && tiny.length * 7 <= 70,
    `"${full}" · "${mid}" · "${tiny}"`,
  );
}

/* ── 3b) SAVUNMA HATTI ───────────────────────────────────────────────────── */

{
  // Savunmasız kale: rakipler yürür, üç gol yenir, maç biter.
  const { A, run, over } = boot("savunma");
  A.game.start(); // tuvalde BÖLÜM SEÇ açılır
  const sel = A.game.debug().state;
  A.game.debug().play(1);
  run(170);
  const end = over();
  const d = A.game.debug();
  check(
    "savunma: bölüm seçilir; boş saha gol yer ve bölüm kaybedilir",
    sel === "select" && Boolean(end) && d.lives === 0 && d.conceded === 3 && end.stats.level === 1 && end.stats.won === 0,
    end ? `3 gol yenildi (${d.level}. bölüm, ${d.wave}. dalga)` : `bölüm bitmedi, hak ${d.lives}`,
  );
}
{
  // Kartlar: güneş (enerji) düşer, dolum süresi ve dolu kare engeller; taraftar güneş üretir.
  const { A, run } = boot("savunma");
  A.game.start();
  A.game.debug().play(1);
  const d = A.game.debug();
  const e0 = d.energy;
  const ok1 = d.place("taraftar", 0, 0);
  const again = d.place("taraftar", 1, 0); // dolum süresi
  const same = d.place("forvet", 0, 0); // dolu kare
  const locked = d.place("cift", 3, 0); // ilerideki bir bölümde açılır
  const e1 = A.game.debug().energy;
  d.clearQueue();
  let made = 0;
  for (let i = 0; i < 2; i += 1) {
    run(i === 0 ? 6 : 9);
    const orbs = A.game.debug().orbs.filter((o) => !o.taken && !o.sky);
    orbs.forEach((o) => d.collect(o));
    made += orbs.length;
  }
  const e2 = A.game.debug().energy;
  check(
    "savunma: kart ekonomisi",
    // (rakipsiz dalga "temiz" sayılır ve güneş verir; üretim 25'in katıdır)
    ok1 && !again && !same && !locked && e1 === e0 - 50 && made === 2 && e2 >= e1 + 50 && (e2 - e1) % 25 === 0,
    `enerji ${e0} → ${e1} → ${e2} (${made} üretim)`,
  );
}
{
  // Forvet koridorundaki rakibi durdurur; boş koridor gol yer. Pres yavaşlatır, stoper oyalar, füze temizler.
  const { A, run } = boot("savunma");
  A.game.start();
  A.game.debug().play(1);
  const d = A.game.debug();
  d.clearQueue();
  d.setEnergy(5000);
  d.place("forvet", 2, 0);
  const guarded = d.spawn("hucum", 2);
  const open = d.spawn("hucum", 4);
  // koşu yolu uzun: hücumcu ekran dışında doğar, kaleye ~44 sn'de ulaşır
  run(50);
  const mid = A.game.debug();
  check(
    "savunma: forvet koridorunu korur, boş koridor gol yer",
    guarded.dead && mid.defeated === 1 && mid.conceded === 1 && mid.points >= 10 && !open.dead,
    `korunan koridorda rakip ${guarded.dead ? "durduruldu" : "geçti"}, boş koridordan ${mid.conceded} gol`,
  );
  // Stoper: 2400 can / 100 hasar ≈ 24 sn oyalar (stoper 4. bölümde açılır: serbest yerleştirme)
  d.place("stoper", 0, 2, true);
  const eater = d.spawn("hucum", 0, 9);
  let held = 0;
  run(34, (arena) => {
    const x = arena.game.debug();
    x.clearQueue(); // yalnız sınanan rakip sahada kalsın
    if (x.state === "play" && eater.eating) held += 1 / 120;
  });
  // Pres: yavaşlatılan rakip aynı sürede daha az yol alır
  const { A: B, run: runB } = boot("savunma");
  B.game.start();
  B.game.debug().play(1);
  const db = B.game.debug();
  db.clearQueue();
  db.setEnergy(5000);
  db.place("pres", 1, 0, true); // 52. bölüm gerekmeden pres'i sınamak için serbest yerleştirme
  const slowed = db.spawn("santrfor", 1);
  const free = db.spawn("santrfor", 3);
  runB(9);
  check(
    "savunma: stoper oyalar, pres yavaşlatır",
    held > 15 && held < 30 && slowed.slow > 0 && slowed.z > free.z + 0.4,
    `stoper ${held.toFixed(0)} sn oyaladı; yavaşlatılan ${slowed.z.toFixed(1)} m, serbest ${free.z.toFixed(1)} m`,
  );
  // Füze: 3×3 alanı temizler, alan dışına dokunmaz
  db.place("fuze", 2, 3, true);
  const near = [db.spawn("hucum", 1, 9.6), db.spawn("hucum", 2, 10.5), db.spawn("hucum", 3, 8.2)];
  const farLane = db.spawn("hucum", 0, 9.6);
  runB(1.2);
  check("savunma: füze 3×3 alanı temizler", near.every((f) => f.dead) && !farLane.dead && !db.units.some((u) => u.type === "fuze"), `${near.filter((f) => f.dead).length}/3 rakip, alan dışındaki ayakta`);
}
{
  // Bölüm: kurulu savunma 3. bölümün dalgalarını temizler, son hücumda kaptan gelir (3.
  // bölümden itibaren); bölüm kazanılır (yıldız + kayıt mesajı), 4. bölümde STOPER açılır.
  const { A, run, log, over } = boot("savunma");
  A.game.start();
  const d = A.game.debug();
  d.play(3);
  d.setEnergy(5000);
  for (let l = 0; l < 5; l += 1) {
    d.place("forvet", l, 0, true);
    d.place("forvet", l, 1, true);
    d.place("stoper", l, 4, true);
  }
  let sawBoss = false, maxWave = 1;
  run(240, (arena) => {
    const x = arena.game.debug();
    maxWave = Math.max(maxWave, x.wave);
    if (x.foes.some((f) => f.type === "kaptan")) sawBoss = true;
  });
  const x = A.game.debug();
  const end = over();
  const saved = log.filter((m) => m.type === "store").pop();
  check(
    "savunma: bölüm dalgaları ilerler, kaptan gelir, bölüm kazanılır",
    maxWave >= 2 && sawBoss && x.lives === 3 && x.points >= 50 + 10 * 5 && x.state === "won" && end && end.stats.won === 1 && end.stats.level === 3 && end.stats.stars === 3,
    `${maxWave}. dalga, ${x.defeated} rakip durduruldu, ${x.points} puan, hak ${x.lives}, ${end ? end.stats.stars + " yıldız" : "bitmedi"}`,
  );
  check(
    "savunma: ilerleme RN'ye kaydedilir ve geri yüklenir",
    saved && saved.data.unlocked === 4 && saved.data.stars["3"] === 3 && (() => {
      const { A: C } = boot("savunma");
      C.game.storeLoaded({ unlocked: 5, stars: { 1: 3, 2: 1, 4: 2 } });
      const p = C.game.debug().progress;
      return p.unlocked === 5 && p.stars[4] === 2;
    })(),
    saved ? JSON.stringify(saved.data) : "store mesajı yok",
  );
  const lockedBefore = !x.usable("stoper");
  d.play(4);
  const y = A.game.debug();
  check("savunma: sonraki bölümde yeni kart açılır", lockedBefore && y.usable("stoper") && y.pops.some((p) => p.key === "stoper"), `4. bölüm kartları: ${y.cards().map((c) => c.key).join(", ")}`);
  const team = (id, name) => ({ id, name, kit: { primary: "#dc2626", secondary: "#ffffff" } });
  A.game.setRoster({ captain: { id: 5, short: "K. Kaptan", team: team(9, "Bizimkiler") }, rivals: [{ team: team(1, "Birinci Rakip") }, { team: team(2, "İkinci Rakip") }] });
  const r = A.game.debug();
  check("savunma: kaptan ve rakip takımlar kadrodan gelir", r.captain === "K. Kaptan" && /Rakip$/.test(r.rival), `${r.captain} · ${r.wave}. dalga → ${r.rival}`);
}

/* ── 3b-2) SAVUNMA HATTI: 100 bölüm, TS ikizi, bölüm modu, bot ──────────── */

{
  // TS ikizi (lib/puzzle/levels/savunma.ts) JS tablosuyla alan alan aynı; 100 bölümün hepsi
  // üretilir (dalga kuyruğu geçerli, tanıtılmamış rakip yok); yenilikler oransal ve geç gelir.
  const { A } = boot("savunma");
  const d = A.game.debug();
  const sameUnlocks =
    TS_SAVUNMA.UNLOCKS.length === d.PLAN.length &&
    TS_SAVUNMA.UNLOCKS.every((u, i) => {
      const p = d.PLAN[i];
      const D = u.kind === "unit" ? d.UNITS[u.key] : u.kind === "foe" ? d.FOES[u.key] : d.FEATURES[u.key];
      return p[0] === u.level && p[1] === u.kind && p[2] === u.key && D && D.name === u.name && D.desc === u.desc;
    });
  const fields = ["n", "d", "waves", "lanes", "start", "hp", "boss", "kaptans", "cup", "rain", "mud", "night", "newFoe"];
  const diffs = [];
  const bad = [];
  for (let n = 1; n <= TS_SAVUNMA.LEVEL_COUNT; n += 1) {
    const js = d.levelInfo(n);
    const ts = TS_SAVUNMA.savunmaLevel(n);
    for (const f of fields) if (js[f] !== ts[f]) diffs.push(`${n}.${f}: js ${js[f]} ts ${ts[f]}`);
    if (JSON.stringify(js.newCards) !== JSON.stringify(ts.newCards) || JSON.stringify(js.news) !== JSON.stringify(ts.news)) diffs.push(`${n}.news`);
    const g = TS_SAVUNMA.goalSummary(n);
    if (!g.limit || !g.goals.length) bad.push(`${n}: hedef yok`);
    // dalgaları kur: her dalga dolu, yalnız tanıtılmış türler; son dalgada kaptan(lar)
    d.play(n);
    const x = A.game.debug();
    for (let w = 1; w <= x.info.waves; w += 1) {
      x.setWave(w);
      const q = A.game.debug().queue;
      const intro = (t) => t === "hucum" || t === "kaptan" || (TS_SAVUNMA.UNLOCKS.find((u) => u.key === t)?.level ?? 1e9) <= n;
      if (!q.length || !q.every((e) => x.FOES[e.type] && intro(e.type) && e.lane >= 0)) bad.push(`${n}/${w}: kuyruk`);
      const bosses = q.filter((e) => e.type === "kaptan").length;
      if (bosses !== (w === x.info.waves ? x.info.kaptans : 0)) bad.push(`${n}/${w}: kaptan ${bosses}`);
    }
    if (x.info.mud && Object.keys(x.mudCells(n, x.info.lanes)).length < 2) bad.push(`${n}: çamur`);
  }
  check(
    "savunma: TS bölüm tablosu (lib/puzzle/levels/savunma.ts) oyunla aynı",
    sameUnlocks && diffs.length === 0 && TS_SAVUNMA.LEVEL_COUNT >= 100 && d.LEVEL_COUNT === TS_SAVUNMA.LEVEL_COUNT,
    diffs.length ? diffs.slice(0, 4).join(" · ") : `${TS_SAVUNMA.LEVEL_COUNT} bölüm, ${d.PLAN.length} yenilik eşleşti`,
  );
  check("savunma: 100 bölümün hepsi üretilir (dalgalar, kaptanlar, çamur)", bad.length === 0, bad.length ? bad.slice(0, 5).join(" · ") : `${TS_SAVUNMA.LEVEL_COUNT} bölüm × dalgalar geçerli`);
  // Oransal ve geç: ilk 3 bölüm yeniliksiz, aynı bölümde iki yenilik yok, aralar 3–6 bölüm,
  // bütün oyuncular ve rakipler 90. bölüme kadar gelir; zorluk testereli ama genel olarak artar.
  const lv = TS_SAVUNMA.UNLOCKS.map((u) => u.level);
  const gaps = lv.slice(1).map((v, i) => v - lv[i]);
  const allUnits = d.ORDER.every((k) => d.UNITS[k].unlock <= 90);
  const allFoes = Object.keys(d.FOES).filter((k) => k !== "kaptan").every((k) => k === "hucum" || lv.includes(TS_SAVUNMA.UNLOCKS.find((u) => u.key === k)?.level));
  const dAt = (n) => TS_SAVUNMA.savunmaDifficulty(n);
  const rising = [1, 2, 3, 4, 5, 6, 7, 8, 9].every((k) => dAt(k * 10 + 5) > dAt((k - 1) * 10 + 5)) && dAt(100) > dAt(50) * 1.6;
  check(
    "savunma: yenilikler oransal ve geç gelir, zorluk artar",
    lv[0] >= 4 && new Set(lv).size === lv.length && Math.min(...gaps) >= 3 && Math.max(...gaps) <= 6 && allUnits && allFoes && rising,
    `ilk ${lv[0]}. bölüm, aralar ${Math.min(...gaps)}–${Math.max(...gaps)}, son ${lv[lv.length - 1]}; zorluk 1:${dAt(1)} · 50:${dAt(50)} · 100:${dAt(100)}`,
  );
}
{
  // Bölüm modu: config + start doğrudan N. bölümü oynatır (seçim ekranı yok, kayıt yok);
  // güçlendiriciler; üçüncü golde "fail" → continue (+1 hak, koridor temiz) → giveUp → over.
  const { A, run, log, over } = boot("savunma");
  A.game.config({ levelMode: true, level: 13, boosters: ["gunes", "duvar", "bilinmeyen"] });
  A.game.start();
  const d = A.game.debug();
  const info = log.find((m) => m.type === "levelInfo");
  const walls = d.units.filter((u) => u.type === "stoper").length;
  check(
    "savunma: bölüm modu N. bölümü açar, güçlendiriciler uygulanır",
    d.state === "play" && d.level === 13 && d.energy === d.info.start + 150 && walls === 3 && info && info.level === 13 && /FÜZE/.test(info.tip || ""),
    `durum ${d.state}, bölüm ${d.level}, güneş ${d.energy} (başlangıç ${d.info.start}), duvar ${walls}, ipucu ${info && info.tip}`,
  );
  // canlı güçlendirici
  const e0 = d.energy;
  window_cmd(A, { type: "booster", key: "gunes" });
  const liveSun = A.game.debug().energy === e0 + 150;
  // savunmasız saha: üçüncü golde bekler
  d.skipPops();
  let failMsg = null;
  for (let i = 0; i < 60 && !failMsg; i += 1) {
    run(5);
    failMsg = log.find((m) => m.type === "fail");
  }
  const waiting = A.game.debug().state === "await";
  run(5); // beklerken zaman akmaz, bölüm bitmez
  const still = A.game.debug().state === "await" && !over();
  window_cmd(A, { type: "continue" });
  const resumed = A.game.debug();
  const cleared = !resumed.foes.some((f) => !f.dead && f.z < 3);
  // devam hakkı bitti: bir sonraki gol bölümü bitirir (ikinci fail yok)
  for (let i = 0; i < 80 && !over(); i += 1) run(5);
  const fails = log.filter((m) => m.type === "fail").length;
  const end = over();
  // pes: ayrı bir oyunda fail → giveUp → over
  const { A: G, run: runG, log: logG, over: overG } = boot("savunma");
  G.game.config({ levelMode: true, level: 2 });
  G.game.start();
  for (let i = 0; i < 60 && !logG.some((m) => m.type === "fail"); i += 1) runG(5);
  window_cmd(G, { type: "giveUp" });
  runG(4);
  const quit = overG();
  check(
    "savunma: bölüm modunda devam / pes (fail → continue → giveUp → over)",
    liveSun && failMsg && failMsg.level === 13 && failMsg.canContinue === true && waiting && still && resumed.state === "play" && resumed.lives === 1 && cleared &&
      fails === 1 && end && end.stats.won === 0 && end.stats.stars === 0 && end.stats.level === 13 && end.stats.conceded === 4 && !log.some((m) => m.type === "store") &&
      quit && quit.stats.won === 0 && quit.stats.level === 2,
    `fail ${fails} kez, devamdan sonra hak ${resumed.lives}, bitiş ${end ? JSON.stringify(end.stats) : "yok"}, pes ${quit ? "→ over" : "yok"}`,
  );
  // Eski mod da çalışır: seçim ekranı 20'lik sayfalar, 100 bölüm.
  const { A: B } = boot("savunma");
  B.game.storeLoaded({ unlocked: 37, stars: { 36: 2 } });
  B.game.start();
  const sl = B.game.debug().selectLayout();
  check("savunma: eski mod bölüm seçimi sayfalı (100 bölüm)", B.game.debug().state === "select" && sl[0].n === 21 && sl.length === 20 && sl.prev && sl.next, `sayfa ${sl.pageLabel.text}`);
}
{
  // Basit bot (güneşi toplar, taraftar → forvet → stoper → forvet dizer; yalnız açık ve
  // parası yeten kartlar) ilk bölümleri kazanır: öğretici bölümler gerçekten oynanabilir.
  const results = [];
  for (const n of [1, 2, 3, 4, 7, 10]) {
    const { A, run, over } = boot("savunma");
    A.game.config({ levelMode: true, level: n });
    A.game.start();
    A.game.debug().skipPops();
    let tick = 0;
    for (let i = 0; i < 100 && !over(); i += 1)
      run(4, (arena) => {
        if (++tick % 12) return;
        const x = arena.game.debug();
        if (x.state === "await") arena.game.command({ type: "giveUp" });
        if (x.state !== "play") return;
        x.orbs.filter((o) => !o.taken).forEach((o) => x.collect(o));
        const order = [];
        for (const [ty, r] of [["taraftar", 0], ["forvet", 1], ["stoper", 5], ["forvet", 2], ["taraftar", 3], ["forvet", 4]]) for (let l = 0; l < x.lanes; l += 1) order.push([ty, l, r]);
        for (const [ty, l, r] of order) if (x.usable(ty) && x.place(ty, l, r)) break;
      });
    const end = over();
    results.push(`${n}:${end && end.stats.won ? end.stats.stars + "★" : "×"}`);
  }
  check("savunma: basit bot ilk bölümleri kazanır", results.every((r) => /★/.test(r)), results.join(" "));
}

/* ── 3c) KADRO KOŞUSU ────────────────────────────────────────────────────── */

/** Kadro botu: iyi kapıyı seçer, yarım sahadaki gruptan kaçar, kalecinin şutundan çekilir. */
const squadBot = (A) => {
  const d = A.game.debug();
  if (d.state !== "play") return;
  const next = d.segs.find((s) => !s.done && s.z > d.z);
  if (d.boss && d.boss.shot) d.setTarget(d.boss.shot.x > 0 ? d.boss.shot.x - 3.4 : d.boss.shot.x + 3.4);
  else if (next && next.type === "gate") d.setTarget(d.apply(d.n, next.left) >= d.apply(d.n, next.right) ? -2.2 : 2.2);
  else if (next && next.type === "rivals" && !next.full) d.setTarget(next.x0 < -4 ? 3.2 : -3.2);
  else if (next && next.type === "bar") d.setTarget(next.x > 0 ? -3.4 : 3.4);
};

{
  // Kapı aritmetiği ve kötü kapı: hep küçülten kapıyı seçen kadro tükenir.
  const { A, run, over } = boot("kadro");
  A.game.start();
  const d = A.game.debug();
  const math = d.apply(10, { op: "+", v: 5 }) === 15 && d.apply(10, { op: "x", v: 3 }) === 30 && d.apply(10, { op: "-", v: 4 }) === 6 && d.apply(9, { op: "/", v: 2 }) === 5 && d.apply(900, { op: "x", v: 3 }) === 999;
  run(120, (arena) => {
    const x = arena.game.debug();
    const next = x.segs.find((s) => !s.done && s.z > x.z && s.type === "gate");
    if (x.state === "play" && next) x.setTarget(x.apply(x.n, next.left) <= x.apply(x.n, next.right) ? -2.2 : 2.2);
  });
  const end = over();
  const x = A.game.debug();
  check("kadro: kapı aritmetiği doğru, kötü kapılar kadroyu bitirir", math && Boolean(end) && x.n === 0 && x.goals <= 1, end ? `kadro ${Math.round(x.z)} m'de tükendi` : `tur bitmedi (kadro ${x.n})`);
}
{
  // İyi oynayan kadro: büyür, grupları eritir, kaleciyi düşürür, bölüm atlar.
  const { A, run } = boot("kadro");
  const team = (id, name) => ({ id, name, kit: { primary: "#dc2626", secondary: "#ffffff" } });
  A.game.setRoster({ captain: { id: 5, short: "K. Kaptan", team: team(9, "Bizimkiler") }, rivals: [{ team: team(1, "Birinci Rakip"), keeper: { short: "K. Eldiven" } }, { team: team(2, "İkinci Rakip") }] });
  A.game.start();
  const first = A.game.debug().rival;
  let maxLevel = 1;
  run(75, (arena) => {
    squadBot(arena);
    maxLevel = Math.max(maxLevel, arena.game.debug().level);
  });
  const x = A.game.debug();
  check(
    "kadro: iyi kapılar kadroyu büyütür, kaleci düşer, bölüm atlanır",
    x.maxN >= 15 && x.goals >= 1 && maxLevel >= 2 && x.cleared >= 2 && x.points >= 125 + 20,
    `en kalabalık ${x.maxN}, ${x.goals} gol, ${x.cleared} grup, bölüm ${maxLevel}, ${x.points} puan`,
  );
  check("kadro: kaptan ve rakip takımlar kadrodan gelir", x.captain === "K. Kaptan" && first === "Birinci Rakip", `${x.captain} · ilk rakip ${first}`);
}
{
  // Menzilde kadro × 1,1 / sn hasar (toplar değdikçe); temas bire bir götürür.
  const { A, run } = boot("kadro");
  A.game.start();
  const d = A.game.debug();
  d.setN(20);
  d.segs.forEach((s) => {
    if (s.type === "gate") s.done = true; // kapılar kadroyu değiştirmesin
  });
  const g = d.segs.find((s) => s.type === "rivals");
  g.hp = g.hp0 = 500; // eritilemeyecek kadar kalabalık
  g.x0 = -4.4;
  g.x1 = 4.4;
  let n0 = null;
  run(12, (arena) => {
    const x = arena.game.debug();
    if (n0 == null && g.z - x.z < 1.4) n0 = { n: x.n, hp: g.hp };
  });
  const x = A.game.debug();
  check(
    "kadro: şut hasarı ve temas kaybı",
    n0 != null && n0.n === 20 && n0.hp < 500 - 20 && x.n === 0 && x.state !== "play",
    n0 ? `temasa kadar ${Math.round(500 - n0.hp)} hasar; kalabalık grup kadroyu bitirdi` : "temas olmadı",
  );
}
{
  // Rakip yalnız TOP DEĞİNCE düşer: ilk hasar ilk topun uçuşundan sonra gelir, her
  // "ball" ölümü bir isabet karesinde olur; temas kaybı kadroda bire bir görünür.
  const { A, run } = boot("kadro");
  A.game.start();
  const d = A.game.debug();
  d.setN(30);
  d.segs.forEach((s) => {
    if (s.type === "gate") s.done = true;
  });
  d.pickups.forEach((p) => (p.gone = true)); // silahsız
  const g = d.segs.find((s) => s.type === "rivals");
  g.hp = g.hp0 = 90;
  g.x0 = -4.4;
  g.x1 = 4.4;
  let firstShot = null, firstDmg = null, early = 0, offBeat = 0, hitsPrev = 0, deadPrev = 0, visBad = 0, contact = false;
  run(8, (arena) => {
    const x = arena.game.debug();
    if (firstShot == null && x.shots.some((s) => s.tgt === g)) firstShot = arena.time;
    const dead = g.men ? g.men.filter((m) => !m.alive && m.cause === "ball").length : 0;
    if (firstDmg == null && g.hp < 90) {
      firstDmg = arena.time;
      if (g.hits === 0) early += 1;
    }
    if (g.hits === 0 && (dead > 0 || g.hp < 90)) early += 1;
    if (dead > deadPrev && g.hits === hitsPrev) offBeat += 1; // isabetsiz ölüm
    if (g.z - x.z < 1.3) contact = true;
    if (x.members !== Math.min(x.n, 70)) visBad += 1;
    hitsPrev = g.hits;
    deadPrev = dead;
  });
  const flight = firstShot != null && firstDmg != null ? firstDmg - firstShot : -1;
  check(
    "kadro: rakip yalnız top değince düşer (görünen şutla eş zamanlı)",
    firstShot != null && firstDmg != null && flight >= 0.15 && early === 0 && offBeat === 0 && visBad === 0,
    `ilk top → ilk hasar ${flight.toFixed(2)} sn, isabetsiz düşüş ${offBeat}, erken hasar ${early}, ${g.hits} isabet${contact ? ", temas" : ""}`,
  );
}
{
  // Temas: kaybedilen her oyuncu kadrodan düşen bir figür olarak görünür, sayaç ile
  // görünen kadro her karede aynı.
  const { A, run } = boot("kadro");
  A.game.start();
  const d = A.game.debug();
  d.setN(24);
  d.segs.forEach((s) => {
    if (s.type === "gate") s.done = true;
  });
  d.pickups.forEach((p) => (p.gone = true));
  const g = d.segs.find((s) => s.type === "rivals");
  g.hp = g.hp0 = 60;
  g.x0 = -4.4;
  g.x1 = 4.4;
  let bad = 0, maxFallen = 0, meleeKills = 0;
  run(8, (arena) => {
    const x = arena.game.debug();
    if (x.members !== Math.min(x.n, 70) || x.fallenTotal !== x.lostTotal) bad += 1;
    maxFallen = Math.max(maxFallen, x.fallen);
    meleeKills = g.men ? g.men.filter((m) => !m.alive && m.cause === "melee").length : 0;
  });
  const x = A.game.debug();
  check(
    "kadro: temas kaybı bire bir görünür (düşen figür = kaybedilen oyuncu)",
    bad === 0 && x.lostTotal > 0 && x.fallenTotal === x.lostTotal && maxFallen > 0 && meleeKills > 0,
    `${x.lostTotal} kayıp · ${x.fallenTotal} düşen figür · ${meleeKills} rakip temasla düştü · uyumsuz kare ${bad}`,
  );
}

/* ── 3c') KADRO KOŞUSU · bölüm modu ─────────────────────────────────────────
 * Tam tarama (250 bölümün hepsi kurulur, bot örnek bölümleri oynar):
 * scripts/check-kadro-levels.mjs. Burada: TS ↔ JS tablolar, tek bölüm akışı,
 * güçlendiriciler, "devam?" akışı. */

/** Bölüm modu botu: tanıtım kartını geçer, grubu arkası geçilene dek "sıradaki" sayar. */
const levelBot = (A) => {
  const d = A.game.debug();
  if (d.state === "intro") A.game.down({ x: 100, y: 300 });
  if (d.state !== "play") return;
  const next = d.segs.filter((s) => !s.done && s.z > d.z - (s.type === "rivals" ? 1.6 : 0.2)).sort((a, b) => a.z - b.z)[0];
  if (d.boss && d.boss.shot) d.setTarget(d.boss.shot.x > 0 ? d.boss.shot.x - 3.4 : d.boss.shot.x + 3.4);
  else if (next && next.type === "gate") d.setTarget(next.hide && next.z - d.z > 10 ? 0 : d.apply(d.n, next.left) >= d.apply(d.n, next.right) ? -2.2 : 2.2);
  else if (next && next.type === "rivals" && !next.full) d.setTarget((next.x0 + next.x1) / 2 > 0 ? -3.4 : 3.4);
  else if (next && next.type === "bar") d.setTarget(next.x > 0 ? -3.4 : 3.4);
};
function kadroLevel(level, boosters = []) {
  const b = boot("kadro");
  b.A.game.configure({ type: "config", levelMode: true, level, boosters });
  b.A.game.start();
  return b;
}
{
  const { A } = boot("kadro");
  const d = A.game.debug();
  const bad = [];
  for (let L = 1; L <= 400; L += 1) if (JSON.stringify(d.levelSpec(L)) !== JSON.stringify(TS_KADRO.kadroLevelSpec(L))) bad.push(L);
  const sameU = JSON.stringify(d.UNLOCKS) === JSON.stringify(TS_KADRO.KADRO_UNLOCKS);
  check(
    "kadro: TS bölüm tablosu oyunla aynı (LEVEL_COUNT, UNLOCKS, levelSpec 1–400)",
    d.LEVEL_COUNT === TS_KADRO.LEVEL_COUNT && d.LEVEL_COUNT >= 250 && sameU && bad.length === 0,
    `${d.LEVEL_COUNT} bölüm, ${d.UNLOCKS.length} açılış, fark: ${bad.slice(0, 5).join(",") || "yok"}`,
  );
  const s1 = d.levelSpec(1), s9 = d.levelSpec(9), s10 = d.levelSpec(10), s15 = d.levelSpec(15), s200 = d.levelSpec(200);
  check(
    "kadro: zorluk eğrisi (uzar, sertleşir; 10'lar kupa, 5'ler nefes)",
    s200.meters > 3 * s1.meters && s200.tough > s9.tough && s9.tough > s1.tough && s10.cup && s10.tough > s9.tough && s15.breather && s15.tough < d.levelSpec(14).tough,
    `1: ${s1.meters} m ×${s1.tough} · 10 (kupa): ×${s10.tough} · 15 (nefes): ×${s15.tough} · 200: ${s200.meters} m ×${s200.tough}`,
  );
}
{
  // Bölüm 1: tanıtım kartı → oyun → gol → `over` (won, 1–3★); sonraki bölüme GEÇMEZ.
  const { A, run, log, over } = kadroLevel(1);
  const intro = A.game.debug().state === "intro";
  run(90, levelBot);
  const end = over();
  const x = A.game.debug();
  const info = log.find((m) => m.type === "levelInfo");
  check(
    "kadro bölüm modu: bölüm 1 oynanır, over {won, stars} gelir, sonraki bölüme geçilmez",
    intro && Boolean(info) && info.level === 1 && end && end.stats.won === 1 && end.stats.level === 1 && end.stats.stars >= 1 && end.stats.stars <= 3 && x.level === 1 && log.filter((m) => m.type === "over").length === 1,
    end ? `${end.stats.stars}★, kadro ${end.stats.kept}/${end.stats.par}, ${end.score} puan` : "over gelmedi",
  );
  // Aynı bölüm iki kez kurulunca aynı yol (belirlenimci).
  const a = kadroLevel(37).A.game.debug(), b2 = kadroLevel(37).A.game.debug();
  const sig = (q) => JSON.stringify(q.segs.map((s) => [s.type, s.z, s.left, s.right, s.hp, s.look, s.fx]).concat(q.pickups.map((p) => [p.type, p.x, p.z])));
  check("kadro bölüm modu: aynı bölüm her kurulumda aynı", sig(a) === sig(b2) && a.segs.length > 20, `bölüm 37: ${a.segs.length} dilim, ${a.pickups.length} silah`);
}
{
  // Güçlendiriciler: takviye +5, kalkan ilk teması kayıpsız geçirir.
  const t = kadroLevel(5, ["takviye"]).A.game.debug();
  const { A, run } = kadroLevel(5, ["kalkan"]);
  const d = A.game.debug();
  d.segs.forEach((s) => (s.type === "gate" || s.type === "bar") && (s.done = true));
  d.pickups.forEach((p) => (p.gone = true));
  d.setN(20);
  const g = d.segs.find((s) => s.type === "rivals");
  g.hp = g.hp0 = 120;
  g.x0 = -4.4;
  g.x1 = 4.4;
  let lostAtG = null;
  run(12, (arena) => {
    const x = arena.game.debug();
    if (x.state === "intro") arena.game.down({ x: 1, y: 1 });
    if (lostAtG == null && x.z > g.z + 2) lostAtG = x.lostTotal;
  });
  check("kadro bölüm modu: takviye +5, kalkan ilk teması kayıpsız geçirir", t.n === 6 && d.shield === 1 && lostAtG === 0 && A.game.debug().shield === 0, `takviye kadro ${t.n}, kalkanla temas kaybı ${lostAtG}`);
}
{
  // Kadro tükenir → fail {canContinue:true}; continue → küçük kadroyla sürer; ikinci kez → over.
  const skip = (arena) => arena.game.debug().state === "intro" && arena.game.down({ x: 1, y: 1 });
  const { A, run, log } = kadroLevel(3);
  const d = A.game.debug();
  run(1, skip);
  d.setN(3);
  const g = A.game.debug().segs.find((s) => s.type === "rivals");
  A.game.debug().segs.forEach((s) => s.type === "gate" && (s.done = true));
  g.hp = g.hp0 = 999;
  g.x0 = -4.4;
  g.x1 = 4.4;
  run(12);
  const fail1 = log.find((m) => m.type === "fail");
  const waiting = A.game.debug().state === "failwait";
  A.game.command({ type: "continue" });
  const revived = A.game.debug().state === "play" && A.game.debug().n >= 5;
  A.game.debug().setShield(0); // devamın kalkanı bu denemede kapalı
  A.game.debug().setN(1);
  const g2 = A.game.debug().segs.find((s) => s.type === "rivals" && !s.done);
  if (g2) {
    g2.hp = g2.hp0 = 999;
    g2.x0 = -4.4;
    g2.x1 = 4.4;
  }
  A.game.debug().segs.forEach((s) => s.type === "gate" && (s.done = true));
  run(30);
  const fails = log.filter((m) => m.type === "fail");
  const end = log.find((m) => m.type === "over");
  check(
    "kadro bölüm modu: tükenince fail → continue ile sürer, ikinci kayıpta over (won 0)",
    fail1 && fail1.canContinue === true && waiting && revived && fails.length === 2 && fails[1].canContinue === false && end && end.stats.won === 0 && end.stats.stars === 0 && end.stats.continued === 1,
    `${fails.length} fail, over ${end ? `won ${end.stats.won}` : "yok"}`,
  );
  // Yanıt gelmezse (ya da giveUp) bekleme `over` ile biter.
  const k = kadroLevel(3);
  k.run(1, skip);
  k.A.game.debug().setN(1);
  k.A.game.debug().segs.forEach((s) => s.type === "gate" && (s.done = true));
  const g3 = k.A.game.debug().segs.find((s) => s.type === "rivals");
  g3.hp = g3.hp0 = 999;
  g3.x0 = -4.4;
  g3.x1 = 4.4;
  k.run(40);
  const k2 = kadroLevel(2);
  k2.A.game.command({ type: "giveUp" });
  check(
    "kadro bölüm modu: yanıtsız fail ve giveUp over gönderir",
    Boolean(k.over()) && k.over().stats.won === 0 && Boolean(k2.over()) && k2.over().stats.won === 0,
    "bekleme süresi doldu → over; giveUp → over",
  );
}

/* ── 3d) KULÜP ŞEHRİ (sahne) ─────────────────────────────────────────────── */

{
  // Sahne yalnız çizer: seviyeleri ve odak komutlarını alır, başsızda çökmez.
  const { A, run } = boot("sehir");
  window_cmd(A, { type: "city", levels: { saha: 3, kantin: 2, bilinmeyen: 9 }, kit: { primary: "#dc2626", secondary: "#ffffff" }, marks: { kantin: "up" }, focus: "kantin" });
  run(2);
  window_cmd(A, { type: "focus", key: null });
  window_cmd(A, { type: "celebrate" });
  run(1);
  const d = A.game.debug();
  check("kulüp şehri: seviyeleri alır, odaklanır, kutlar", d.levels.saha === 3 && d.levels.kantin === 2 && d.levels.bilinmeyen === undefined && d.focus.tx === 0, `saha ${d.levels.saha}, kafeterya ${d.levels.kantin}`);
}

/* ── 4) PENALTI ──────────────────────────────────────────────────────────── */

/**
 * Penaltı botu: nişan + güç zamanlaması. `aim(d)` hedef (x, y) döndürür;
 * `power` "iyi" ise yeşil bölgenin ortasında, "zayıf" ise bölgenin altında dokunur.
 */
function penaltyBot(A, run, { aim, power = "iyi", type = "plase", restart = false }) {
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
      let [tx, ty] = aim(d);
      if (power === "iyi" && d.predict) {
        // iyi oyuncu rüzgârı nişanla telafi eder
        const v = (d.zone[0] + d.zone[1]) / 2;
        let ax = tx, ay = ty;
        for (let k = 0; k < 3; k++) {
          const pr = d.predict(type, ax, ay, v, false);
          ax += tx - pr.x;
          ay += ty - pr.y;
        }
        tx = ax;
        ty = ay;
      }
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
const A_clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

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
  bot.until(() => bot.seen.length >= 3);
  const d1 = A.game.debug();
  const fair = bot.seen.every((k) => k.who === "me") && Math.abs(d1.me.length - d1.op.length) <= 1 && d1.op.length >= 2;
  check("penaltı: yalnız sen atarsın, rakibin atışı sırayla sayılır", fair, `senin ${d1.me.length} atışın, rakibin ${d1.op.length} atışı (${d1.op.join("")})`);
}
{
  const { A, run } = boot("penalti");
  A.game.setRoster(penRoster);
  A.game.start();
  const good = penaltyBot(A, run, { aim: corner, restart: true });
  good.until(() => good.seen.filter((k) => k.who === "me").length >= 80);
  const { A: B, run: runB } = boot("penalti");
  B.game.setRoster(penRoster);
  B.game.start();
  const weak = penaltyBot(B, runB, { aim: () => [A.rand(-0.4, 0.4), 0.6], restart: true });
  weak.until(() => weak.seen.filter((k) => k.who === "me").length >= 80);
  const gGood = rate(good.seen, "me", "gol"), gWeak = rate(weak.seen, "me", "gol");
  check("penaltı: köşeye vuruş gol, hep ortaya vuran okunur", gGood >= 0.7 && gWeak <= 0.62 && gGood > gWeak + 0.22, `köşe %${Math.round(gGood * 100)} gol · hep orta %${Math.round(gWeak * 100)} gol`);
}
{
  // İyi oynayan: kazanır, sıradaki kulübe geçer. Kötü oynayan: kaybeder, tur biter.
  const { A, run, over } = boot("penalti");
  A.game.setRoster(penRoster);
  A.game.start();
  const bot = penaltyBot(A, run, { aim: corner });
  bot.until(() => A.game.debug().matchIdx >= 1 || A.game.debug().state === "over");
  const d = A.game.debug();
  const advanced = d.matchIdx === 1 && d.tally.wins === 1 && d.points >= 400 && d.opponent === "Sarı Spor";
  const { A: B, run: runB, over: overB } = boot("penalti");
  B.game.setRoster(penRoster);
  B.game.start();
  const loser = penaltyBot(B, runB, { aim: () => [0, 0.4], power: "zayıf" });
  loser.until(() => B.game.debug().state === "over");
  const end = overB();
  check(
    "penaltı: kazanan sıradaki kulübe geçer, kaybeden turnuvayı bitirir",
    (advanced || Boolean(over())) && Boolean(end) && end.stats && end.stats.wins < 2 && !end.stats.champion && end.stats.keepers === 2,
    `iyi oyuncu: ${advanced ? "2. maça geçti (" + d.opponent + ")" : "ilk maçı kaybetti"} · kötü oyuncu: ${end ? "tur bitti, skor " + end.score : "bitmedi"}`,
  );
}

{
  // Atış modeli: doğru ayarda top TAM nişana; güç hatası sapma; rüzgâr sürükler.
  const { A, run } = boot("penalti");
  A.game.setRoster(penRoster);
  A.game.start();
  const d = A.game.debug();
  d.cond.wind = 0;
  d.cond.windZ = 0;
  const targets = [[-3.0, 0.4], [2.9, 2.1], [0.8, 1.2], [-1.6, 1.9]];
  let worst = 0;
  for (const type of ["plase", "sert", "kasik"]) {
    for (const [tx, ty] of targets) {
      if (type === "kasik" && Math.abs(tx) > 2.6) continue;
      const z = d.zoneOf ? d.zoneOf(type) : d.zone;
      for (const v of [z[0] + 0.005, (z[0] + z[1]) / 2, z[1] - 0.005]) {
        const p = d.predict(type, tx, ty, v, false);
        worst = Math.max(worst, Math.hypot(p.x - p.tx, p.y - p.ty), Math.hypot(p.tx - tx, p.ty - Math.max(type === "kasik" ? 0.9 : 0, ty)));
      }
    }
  }
  check("penaltı: güç yeşil bölgede → top tam nişana gider", worst < 0.02, `en büyük sapma ${(worst * 100).toFixed(1)} cm (3 tür × 4 hedef × 3 güç)`);
  const z = d.zoneOf("plase");
  const ok = d.predict("plase", 2.4, 1.5, (z[0] + z[1]) / 2, false);
  const hi = d.predict("plase", 2.4, 1.5, Math.min(1, z[1] + 0.12), false);
  const lo = d.predict("plase", 2.4, 1.5, Math.max(0, z[0] - 0.15), false);
  check(
    "penaltı: fazla güç topu yükseltip dışarı açar, az güç alçaltıp yavaşlatır",
    hi.y > ok.y + 0.4 && hi.x > ok.x + 0.08 && lo.y < ok.y - 0.25 && Math.abs(lo.x) < Math.abs(ok.x) && lo.speed < ok.speed * 0.9,
    `doğru (${ok.x.toFixed(2)}, ${ok.y.toFixed(2)}) · fazla (${hi.x.toFixed(2)}, ${hi.y.toFixed(2)}) · az (${lo.x.toFixed(2)}, ${lo.y.toFixed(2)}, ${lo.speed.toFixed(1)} m/sn)`,
  );
  d.cond.wind = 5;
  const wp = d.predict("plase", 0, 1.2, (z[0] + z[1]) / 2, false);
  const wk = d.predict("kasik", 0, 1.2, d.zoneOf("kasik")[0] + 0.05, false);
  const wr = d.predict("plase", 0, 1.2, 0, true);
  d.cond.wind = 0;
  check(
    "penaltı: rüzgâr topu sürükler (yavaş top daha çok, FÜZE az)",
    wp.x > 0.15 && wk.x > wp.x * 2 && wr.x < wp.x * 0.5,
    `5 m/sn rüzgârda plase ${wp.x.toFixed(2)} m · kaşık ${wk.x.toFixed(2)} m · füze ${wr.x.toFixed(2)} m`,
  );
  // Gerçek uçuş tahminle aynı: kaleciyi uzaklaştır, kale çizgisinde topun yerini ölç.
  const bot = penaltyBot(A, run, { aim: () => [2.6, 1.7] });
  let cross = null;
  bot.until(() => {
    const e = A.game.debug();
    if (e.state === "runup") e.keeper.x = 40;
    if (e.state === "flight" && !cross && e.ball.z <= 0.02) cross = { x: e.ball.x, y: e.ball.y, s: e.shot };
    return cross || e.state === "result";
  }, 20000);
  const pr = cross && d.predict("plase", cross.s.aimX, cross.s.aimY, cross.s.v, false);
  check("penaltı: oyundaki uçuş tahminle aynı yere gider", cross && Math.hypot(cross.x - pr.x, cross.y - pr.y) < 0.08, cross ? `uçuş (${cross.x.toFixed(2)}, ${cross.y.toFixed(2)}) · tahmin (${pr.x.toFixed(2)}, ${pr.y.toFixed(2)})` : "atış yok");
}
{
  // Jokerler: KALECİ GÖZÜ kararı gösterir ve kaleci ona uyar; FÜZE kusursuz ve hızlı; DEV KALE büyütür.
  const { A, run } = boot("penalti");
  A.game.setRoster(penRoster);
  A.game.start();
  let d = A.game.debug();
  run(5, () => A.game.debug().state === "aim");
  for (let i = 0; i < 2000 && A.game.debug().state !== "aim"; i++) run(1 / 60);
  d = A.game.debug();
  const usedEye = d.useJoker("eye"), usedRocket = d.useJoker("rocket"), usedBig = d.useJoker("big"), again = d.useJoker("eye");
  const plan = A.game.debug().kplan;
  const g = A.game.debug().goal;
  // nişan: normal kalenin dışı, büyük kalenin içi
  A.game.down({ x: 195, y: 400 });
  A.game.move({ x: 195 + ((4.0 - d.aim.x) / 8.6) * 390, y: 400 - ((1.0 - d.aim.y) / 4.6) * 640 });
  A.game.up({ x: 195 + ((4.0 - d.aim.x) / 8.6) * 390, y: 400 });
  const sh = A.game.debug().shot;
  let dive = null;
  for (let i = 0; i < 4000 && A.game.debug().state !== "result"; i++) {
    run(1 / 120);
    const e = A.game.debug();
    if (!dive && e.keeper.dive) dive = e.keeper.dive;
  }
  const after = A.game.debug();
  const keeperObeyed = plan.mode === "commit" ? dive && Math.sign(dive.dx) === plan.side : plan.mode === "stay" ? !dive : true;
  check(
    "penaltı: jokerler — göz kararı gösterir, füze kusursuz ve hızlı, dev kale büyür",
    usedEye && usedRocket && usedBig && !again && keeperObeyed && sh && sh.rocket && sh.q === 1 && sh.speed >= 33 && g.half > 4.3 && after.jokers.eye === 0,
    `kaleci: ${plan.mode}${plan.side ? (plan.side < 0 ? " sol" : " sağ") : ""} → ${dive ? (dive.dx < 0 ? "sola uçtu" : "sağa uçtu") : "yerinde"} · füze ${sh ? sh.speed.toFixed(1) : "-"} m/sn · kale yarı genişlik ${g.half.toFixed(2)} m · sonuç ${after.lastKick && after.lastKick.result}`,
  );
}
{
  // Zorluk merdiveni: ilk maç sakin; son basamakta rüzgâr, dar bölge, hızlı çubuk, titreyen nişan.
  const { A } = boot("penalti");
  A.game.setRoster(penRoster);
  A.game.start();
  const d0 = A.game.debug();
  const easy = { zone: d0.zoneOf("plase"), period: d0.cond.period, wind: d0.cond.wind, sway: d0.cond.sway };
  d0.startMatch(1);
  const d1 = A.game.debug();
  d1.nextKick();
  const d2 = A.game.debug();
  const hard = { zone: d2.zoneOf("plase"), period: d2.cond.period, wind: d2.cond.wind, sway: d2.cond.sway };
  const w = (z) => z[1] - z[0];
  check(
    "penaltı: merdivende zorlaşır (rüzgâr, dar bölge, hızlı güç, titreyen nişan)",
    easy.wind === 0 && Math.abs(hard.wind) > 1 && w(hard.zone) < w(easy.zone) * 0.75 && hard.period < easy.period * 0.85 && hard.sway > easy.sway * 2,
    `bölge ${w(easy.zone).toFixed(2)} → ${w(hard.zone).toFixed(2)} · çubuk ${easy.period.toFixed(2)} → ${hard.period.toFixed(2)} sn · rüzgâr ${easy.wind.toFixed(1)} → ${Math.abs(hard.wind).toFixed(1)} m/sn · titreme ${easy.sway.toFixed(2)} → ${hard.sway.toFixed(2)} m`,
  );
}

/* ── 4b) PENALTI · bölüm modu (Lig Yolu) ─────────────────────────────────── */

{
  // Tablo: JS üreteci ile TS ikizi (lib/puzzle/levels/penalti.ts) bütün bölümlerde birebir aynı.
  const { A } = boot("penalti");
  const d = A.game.debug();
  let diff = 0, first = null;
  for (let n = 1; n <= TS_PENALTI.LEVEL_COUNT + 50; n += 1) {
    const a = JSON.stringify(d.levelSpec(n)), b = JSON.stringify(TS_PENALTI.penaltiLevel(n));
    if (a !== b || d.goalText(d.levelSpec(n)) !== TS_PENALTI.goalText(TS_PENALTI.penaltiLevel(n))) {
      diff += 1;
      first = first ?? n;
    }
  }
  const sameTables = JSON.stringify(d.UNLOCKS) === JSON.stringify(TS_PENALTI.UNLOCKS) && d.LEVEL_COUNT === TS_PENALTI.LEVEL_COUNT && d.LEVEL_COUNT >= 150;
  check("penaltı bölüm: JS tablosu TS ikiziyle aynı", diff === 0 && sameTables, diff ? `${diff} bölüm farklı (ilk ${first})` : `${TS_PENALTI.LEVEL_COUNT}+50 bölüm, ${d.UNLOCKS.length} yenilik aynı`);

  // 150 bölümün hepsi geçerli; yenilik açılmadan görünmez; zorluk artar; boss / nefes düzeni.
  const at = Object.fromEntries(d.UNLOCKS.map((u) => [u.key, u.level]));
  const uses = (s) => ({ ruzgar: s.wind > 0, halka: s.goal === "targets", sure: s.clock > 0, savunmaci: s.defenders > 0, ani: s.goal === "sudden", yagmur: s.rain, baraj: !!s.wall, gece: s.night, sis: s.fog, oynak: s.hoopMove > 0, iki_savunmaci: s.defenders > 1, firtina: s.gust, seri: s.goal === "shootout" });
  let invalid = 0, early = 0, introMissing = 0;
  const band = (a, b) => {
    let t = 0;
    for (let n = a; n <= b; n += 1) t += d.levelSpec(n).diff;
    return t / (b - a + 1);
  };
  for (let n = 1; n <= d.LEVEL_COUNT; n += 1) {
    const s = d.levelSpec(n);
    const okGoal = ["score", "targets", "shootout", "sudden"].includes(s.goal);
    const okNeed = s.goal === "score" || s.goal === "targets" ? s.need >= 1 && s.need <= s.shots : s.need === 0;
    const okHoops = s.goal !== "targets" || (s.hoops.length === 3 && s.hoops.every((h) => Math.abs(h.x) + h.r < 3.66 + 0.4 && h.y - h.r > 0));
    if (!okGoal || !okNeed || !okHoops || s.reflex < 50 || s.reflex > 99 || s.zoneK <= 0.3) invalid += 1;
    const u = uses(s);
    for (const k of Object.keys(u)) if (u[k] && n < at[k]) early += 1;
    const un = d.UNLOCKS.find((x) => x.level === n);
    if (un && un.key in u && !u[un.key]) introMissing += 1;
    if (n % 10 === 0 && !s.boss) invalid += 1;
    if (n % 5 === 0 && n % 10 && !s.breather) invalid += 1;
  }
  const d1 = band(1, 30), d2 = band(61, 90), d3 = band(121, 150);
  check(
    "penaltı bölüm: 150 bölüm geçerli, yenilik vaktinden önce gelmez, zorluk artar",
    invalid === 0 && early === 0 && introMissing === 0 && d1 < d2 && d2 < d3 && d.levelSpec(45).diff < d.levelSpec(44).diff && d.levelSpec(60).diff > d.levelSpec(59).diff,
    `geçersiz ${invalid} · erken yenilik ${early} · eksik tanıtım ${introMissing} · ort. zorluk ${d1.toFixed(2)} → ${d2.toFixed(2)} → ${d3.toFixed(2)}`,
  );
}
{
  // Bölüm modu akışı: yalnız N. bölüm; levelInfo; iyi oyuncu kazanır (over: level/won/stars…),
  // kaybetmek üzereyken fail → continue +1 şut → giveUp over. Belirlenimci koşullar.
  const play = (level, aim, power, onFail) => {
    const box = boot("penalti");
    box.A.game.command({ type: "config", levelMode: true, level, boosters: [] });
    box.A.game.start();
    const bot = penaltyBot(box.A, box.run, { aim, power });
    const fails = [];
    bot.until(() => {
      const st = box.A.game.debug().state;
      if (st === "fail") {
        fails.push(box.A.game.debug().lvl.shots);
        onFail(box.A, fails.length);
      }
      return box.A.game.debug().state === "over";
    }, 80000);
    return { ...box, fails, end: box.over(), info: box.log.find((m) => m.type === "levelInfo") };
  };
  const win = play(1, corner, "iyi", (A) => A.game.command({ type: "giveUp" }));
  const keys = ["level", "won", "stars", "goals", "shots", "saves", "wins", "perfect", "champion"];
  const st = win.end && win.end.stats;
  check(
    "penaltı bölüm: yalnız N. bölüm oynar, kazanınca over {level, won, stars, …}",
    Boolean(st) && keys.every((k) => k in st) && st.level === 1 && st.won === 1 && st.stars >= 1 && st.stars <= 3 && st.goals >= 3 && win.info && win.info.goal === "5 şutta 3 gol at" && win.A.game.debug().matchIdx === 0,
    st ? `bölüm ${st.level}: ${st.goals}/${st.shots} gol, ${st.stars}★, skor ${win.end.score}` : "over yok",
  );
  const lose = play(1, () => [5.5, 1.2], "iyi", (A, k) => A.game.command(k === 1 ? { type: "continue" } : { type: "giveUp" }));
  const lst = lose.end && lose.end.stats;
  check(
    "penaltı bölüm: kaybetmek üzereyken fail, devam +1 şut, vazgeçince over",
    lose.fails.length >= 2 && lose.fails[1] === lose.fails[0] + 1 && Boolean(lst) && lst.won === 0 && lst.stars === 0 && lose.log.some((m) => m.type === "fail" && m.canContinue === true),
    `fail ${lose.fails.length} kez (şut hakkı ${lose.fails.join(" → ")}) · ${lst ? `${lst.won ? "kazanç" : "kayıp"}, ${lst.goals}/${lst.shots}` : "over yok"}`,
  );
  // Belirlenimci: aynı bölüm, aynı atış → aynı rüzgâr ve kaleci kararı (Math.random'dan bağımsız).
  const cond = (seed) => {
    const { A, run } = boot("penalti");
    let s = seed;
    const real = Math.random;
    Math.random = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    A.game.command({ type: "config", levelMode: true, level: 57, boosters: [] });
    A.game.start();
    for (let i = 0; i < 2000 && A.game.debug().state !== "aim"; i += 1) run(1 / 60);
    const e = A.game.debug();
    Math.random = real;
    return JSON.stringify([e.cond.wind0, e.cond.windZ, e.kplan]);
  };
  check("penaltı bölüm: koşullar belirlenimci (aynı bölüm aynı atış)", cond(3) === cond(99), cond(3).slice(0, 60));
}
{
  // Engeller: baraj ve çizgideki savunmacı önünden geçen topu keser; halka golü sayılır;
  // güçlendiriciler (nisan: geniş bölge, ek_sut: +1 şut) ve sunucu tavanı.
  const find = (fn) => {
    for (let n = 1; n <= 150; n += 1) if (fn(boot("penalti").A.game.debug().levelSpec(n))) return n;
    return 0;
  };
  const shootAt = (level, pick) => {
    const { A, run } = boot("penalti");
    A.game.command({ type: "config", levelMode: true, level, boosters: [] });
    A.game.start();
    // engelleri durdur: ölçüm konuma bağlı olsun, zamanlamaya değil
    const L = A.game.debug().level;
    if (L.wall) L.wall.speed = 0;
    L.defSpeed = 0;
    L.hoopMove = 0;
    let res = null;
    const bot = penaltyBot(A, run, { aim: (d) => pick(d) });
    bot.until(() => {
      const d = A.game.debug();
      if (d.state === "runup") d.keeper.x = 40; // kaleciyi uzaklaştır: yalnız engel ölçülsün
      if (d.state === "result" && !res) res = d.lastKick;
      return res || d.state === "over" || d.state === "fail";
    }, 30000);
    return res;
  };
  const wallLv = find((s) => s.wall && !s.defenders && !s.wind);
  const defLv = find((s) => s.defenders === 1 && !s.wall && !s.wind && s.goal !== "targets");
  const hoopLv = find((s) => s.goal === "targets" && !s.hoopMove && !s.defenders && !s.wall && !s.wind);
  // barajın arkası: topun z = 1,85'teki x'i ≈ 0,83·hedef — hedefi barajın şu anki yerine göre seç
  const intoWall = shootAt(wallLv, (d) => [A_clamp(d.obstacles.wall.x / 0.83, -3, 3), 1.0]);
  const intoDef = shootAt(defLv, (d) => [A_clamp(d.obstacles.defenders[0], -3, 3), 0.8]);
  const intoHoop = shootAt(hoopLv, (d) => [d.obstacles.hoops[0].x, d.obstacles.hoops[0].y]);
  check(
    "penaltı bölüm: baraj ve savunmacı topu keser, halkadan geçen gol sayılır",
    intoWall && intoWall.result === "baraj" && intoDef && intoDef.result === "savunma" && intoHoop && intoHoop.result === "gol" && intoHoop.tags.includes("HALKA"),
    `baraj (${wallLv}. bölüm) ${intoWall && intoWall.result} · savunmacı (${defLv}.) ${intoDef && intoDef.result} · halka (${hoopLv}.) ${intoHoop && intoHoop.result} ${intoHoop ? intoHoop.tags.join(",") : ""}`,
  );
  const { A } = boot("penalti");
  A.game.command({ type: "config", levelMode: true, level: 3, boosters: ["ek_sut"] });
  A.game.start();
  const before = A.game.debug();
  for (let i = 0; i < 2000 && A.game.debug().state !== "aim"; i += 1) A.game.update(1 / 60);
  const z0 = A.game.debug().zoneOf("plase");
  A.game.command({ type: "booster", key: "nisan" });
  const z1 = A.game.debug().zoneOf("plase");
  const w = (z) => z[1] - z[0];
  // sunucu tavanı (elitlig-server services/arenaPlausibility.js CEILINGS.penalti) ile aynı formül
  const ceil = (s) => s.goals * 450 + 25 * (s.shots + 10) + 400 * s.wins + 100 * s.wins * Math.max(0, s.wins - 1) + 300 * s.perfect + 1500 * (s.champion ? 1 : 0);
  let over = 0, maxRatio = 0;
  for (const lv of [10, 16, 40, 66]) {
    const box = boot("penalti");
    box.A.game.command({ type: "config", levelMode: true, level: lv, boosters: ["nisan"] });
    box.A.game.start();
    const bot = penaltyBot(box.A, box.run, { aim: corner });
    bot.until(() => {
      if (box.A.game.debug().state === "fail") box.A.game.command({ type: "giveUp" });
      return box.A.game.debug().state === "over";
    }, 80000);
    const e = box.over();
    if (e) {
      maxRatio = Math.max(maxRatio, e.score / ceil(e.stats));
      if (e.score > ceil(e.stats)) over += 1;
    }
  }
  check(
    "penaltı bölüm: güçlendiriciler (ek şut +1, nişan bölgeyi genişletir) ve skor sunucu tavanında",
    before.lvl.shots === before.level.shots + 1 && w(z1) > w(z0) * 1.2 && A.game.debug().lvl.aimHelp && over === 0,
    `şut ${before.level.shots} → ${before.lvl.shots} · bölge ${w(z0).toFixed(3)} → ${w(z1).toFixed(3)} · skor/tavan en çok %${Math.round(maxRatio * 100)}`,
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
