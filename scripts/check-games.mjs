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
 *      temizler; dalgalar ilerler, kaptan gelir.
 *      KADRO KOŞUSU: kapı aritmetiği; kötü kapılar kadroyu bitirir, iyi kapılar
 *      büyütür; şut hasarı analitiktir; kaleci düşer, bölüm atlanır.
 *   4. PENALTI: seri penaltı kuralları (erken bitiş, ani ölüm) doğru; yalnız sen
 *      atarsın, rakibin atışı sırayla sayılır; köşeye vuruş gol olur, hep ortaya
 *      vuran okunur; kazanan sıradaki kulübe geçer, kaybeden turnuvayı bitirir.
 *      Doğru güçte top tam nişana gider, güç hatası sapma yapar, rüzgâr
 *      sürükler; jokerler işini yapar; merdivende koşullar zorlaşır.
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
  A.game.start();
  run(170);
  const end = over();
  const d = A.game.debug();
  check("savunma: boş saha gol yer ve biter", Boolean(end) && d.lives === 0 && d.conceded === 3, end ? `3 gol yenildi (${d.wave}. dalga)` : `maç bitmedi, hak ${d.lives}`);
}
{
  // Kartlar: güneş (enerji) düşer, dolum süresi ve dolu kare engeller; taraftar güneş üretir.
  const { A, run } = boot("savunma");
  A.game.start();
  const d = A.game.debug();
  const e0 = d.energy;
  const ok1 = d.place("taraftar", 0, 0);
  const again = d.place("taraftar", 1, 0); // dolum süresi
  const same = d.place("forvet", 0, 0); // dolu kare
  const locked = d.place("cift", 3, 0); // ilerideki bir dalgada açılır
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
  // Stoper: 2400 can / 100 hasar ≈ 24 sn oyalar
  d.place("stoper", 0, 2);
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
  const db = B.game.debug();
  db.clearQueue();
  db.setEnergy(5000);
  db.place("stoper", 3, 0); // 3. dalga gerekmeden pres'i sınamak için serbest yerleştirme
  db.place("pres", 1, 0, true);
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
  // Dalgalar: kurulu savunma ilk dalgayı temizler, ikinci dalgada yeni kart açılır ve kaptan gelir.
  const { A, run } = boot("savunma");
  A.game.start();
  const d = A.game.debug();
  d.setEnergy(5000);
  for (let l = 0; l < 5; l += 1) {
    d.place("forvet", l, 0, true);
    d.place("forvet", l, 1, true);
    d.place("stoper", l, 4, true);
  }
  let sawBoss = false, maxWave = 1;
  run(150, (arena) => {
    const x = arena.game.debug();
    maxWave = Math.max(maxWave, x.wave);
    if (x.foes.some((f) => f.type === "kaptan")) sawBoss = true;
  });
  const x = A.game.debug();
  check(
    "savunma: dalgalar ilerler, kaptan gelir, kartlar açılır",
    maxWave >= 2 && sawBoss && x.lives === 3 && x.points >= 50 + 10 * 5 && x.usable("fuze"),
    `${maxWave}. dalga, ${x.defeated} rakip durduruldu, ${x.points} puan, hak ${x.lives}`,
  );
  const team = (id, name) => ({ id, name, kit: { primary: "#dc2626", secondary: "#ffffff" } });
  A.game.setRoster({ captain: { id: 5, short: "K. Kaptan", team: team(9, "Bizimkiler") }, rivals: [{ team: team(1, "Birinci Rakip") }, { team: team(2, "İkinci Rakip") }] });
  const r = A.game.debug();
  check("savunma: kaptan ve rakip takımlar kadrodan gelir", r.captain === "K. Kaptan" && /Rakip$/.test(r.rival), `${r.captain} · ${r.wave}. dalga → ${r.rival}`);
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
  // Grup hasarı analitik: menzilde kadro × 1,1 / sn; temas bire bir götürür.
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
