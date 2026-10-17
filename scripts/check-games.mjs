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
 *   3. SLALOM: kenarda saklanmak ARTIK İŞE YARAMAZ — kaçırılan kapılar hak
 *      götürür ve tur biter. Kapıları izleyen oyuncu puan toplar; hız artar,
 *      kapılar daralır. Kayma savrulmadan oturur; jokerler (SÜPÜR, HAYALET,
 *      AĞIR ÇEKİM) işini yapar, seviye atlayan joker kazanır; rakip adı
 *      sığmazsa kısalır.
 *   4. PENALTI: seri penaltı kuralları (erken bitiş, ani ölüm) doğru; yalnız sen
 *      atarsın, rakibin atışı sırayla sayılır; köşeye vuruş gol olur, hep ortaya
 *      vuran okunur; kazanan sıradaki kulübe geçer, kaybeden turnuvayı bitirir.
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

{
  const { A, run, over } = boot("slalom");
  A.game.start();
  // Kenara saklan: parmağı sağa sürükle ve orada tut.
  A.game.down({ x: 100, y: 400 });
  A.game.move({ x: 390, y: 400 });
  A.game.move({ x: 390, y: 400 });
  run(40);
  const end = over();
  const d = A.game.debug();
  check(
    "slalom: kenarda saklanmak biter",
    Boolean(end) && d.lives === 0 && d.passed < 3,
    end ? `kenarda bekleyen oyuncu ${Math.round(d.z)} m'de elendi (geçilen kapı ${d.passed})` : `tur bitmedi, ${Math.round(d.z)} m`,
  );
}
{
  const { A, run } = boot("slalom");
  A.game.start();
  const firstGap = A.game.debug().gates[0].gap;
  const v0 = A.game.debug().speed;
  let livesAt8 = null;
  let topSpeed = 0;
  run(35, () => {
    const d = A.game.debug();
    if (d.state !== "play") return;
    topSpeed = Math.max(topSpeed, d.speed);
    const next = d.gates.find((g) => !g.done);
    if (next) d.player.target = next.cx;
    if (livesAt8 == null && d.passed >= 8) livesAt8 = d.lives;
  });
  const d = A.game.debug();
  const lastGap = d.gates[d.gates.length - 1].gap;
  check(
    "slalom: kapıları izleyen oyuncu ilerler",
    d.passed >= 15 && livesAt8 === 3 && d.points > d.passed * 10,
    `${d.passed} kapı, ${d.points} puan, 8. kapıda kalan hak ${livesAt8}`,
  );
  check(
    "slalom: zorlaşıyor",
    // En yüksek hız: bir çarpışma anlık yavaşlatır, ölçüm o ana denk gelebilir.
    topSpeed > v0 * 1.2 && lastGap < firstGap * 0.85,
    `hız ${v0.toFixed(1)} → ${topSpeed.toFixed(1)} m/sn, kapı ${firstGap.toFixed(2)} → ${lastGap.toFixed(2)} m`,
  );
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
  run(35, () => {
    const d = A.game.debug();
    const next = d.gates.find((g) => !g.done);
    if (d.state === "play" && next) d.player.target = next.cx;
  });
  const d = A.game.debug();
  const want = ["Zayıf Savunma", "Orta Savunma", "En İyi Savunma"][Math.min(d.level, 3) - 1];
  check("slalom: koşucu ve rakip savunma kadrodan gelir", d.runner === "A. Koşucu" && d.defense === want, `${d.runner}, seviye ${d.level} → ${d.defense}`);
}

{
  // Yanal hareket: hedefe hızla ve savrulmadan oturur.
  const { A, run } = boot("slalom");
  A.game.start();
  const p = A.game.debug().player;
  let maxX = 0, t90 = null, t = 0;
  p.target = 3;
  run(1.2, () => {
    t += 1 / 120;
    maxX = Math.max(maxX, p.x);
    if (t90 == null && p.x >= 2.7) t90 = t;
  });
  check(
    "slalom: kayma dengeli (hızlı oturur, savrulmaz)",
    t90 != null && t90 < 0.6 && maxX < 3.12 && Math.abs(p.x - 3) < 0.05,
    `%90'a ${t90 == null ? "—" : t90.toFixed(2)} sn, en çok ${maxX.toFixed(2)} m (hedef 3)`,
  );
}
{
  // Jokerler: SÜPÜR önü boşaltır, HAYALET hak kaybettirmez, AĞIR ÇEKİM yavaşlatır.
  const { A, run } = boot("slalom");
  A.game.start();
  const d0 = A.game.debug();
  const edge = () => {
    const d = A.game.debug();
    const g = d.gates.find((x) => !x.done);
    if (g) d.player.target = g.cx > 0 ? -5.3 : 5.3; // hep kapının dışından
  };
  // kapının dışından giden oyuncu: SÜPÜR ile 2 sn boyunca hak gitmez, kapılar sayılır
  run(1.2);
  const first = A.game.debug().gates.find((x) => !x.done);
  run(Math.max(0, (first.z - A.game.debug().z - 10) / A.game.debug().speed), edge);
  const used = d0.useJoker("clear");
  const twice = d0.useJoker("clear");
  const p0 = A.game.debug().passed;
  run(2, edge);
  const dc = A.game.debug();
  check(
    "slalom: SÜPÜR önünü boşaltır",
    used && !twice && dc.lives === 3 && dc.passed > p0 && dc.jokers.clear === 0,
    `${dc.passed - p0} kapı kendiliğinden geçildi, hak ${dc.lives}, kalan SÜPÜR ${dc.jokers.clear}`,
  );
  d0.useJoker("ghost");
  run(4.5, edge);
  const dg = A.game.debug();
  check("slalom: HAYALET hak kaybettirmez", dg.lives === 3 && dg.active.ghost > 0, `kapının dışından 4,5 sn: hak ${dg.lives}`);
  run(3, () => {
    const d = A.game.debug();
    const g = d.gates.find((x) => !x.done);
    if (g) d.player.target = g.cx;
  });
  const v0 = A.game.debug().speed;
  d0.useJoker("slow");
  run(3, () => {
    const d = A.game.debug();
    const g = d.gates.find((x) => !x.done);
    if (g) d.player.target = g.cx;
  });
  const ds = A.game.debug();
  check("slalom: AĞIR ÇEKİM yavaşlatır", ds.speed < v0 * 0.72 && ds.active.slow > 16, `hız ${v0.toFixed(1)} → ${ds.speed.toFixed(1)} m/sn`);
}
{
  // Joker kazanma: seviye atlayan oyuncuya yeni joker, savunmacı adı sığmazsa kısalır.
  const { A, run } = boot("slalom");
  A.game.start();
  const d0 = A.game.debug();
  d0.useJoker("clear");
  d0.useJoker("ghost");
  d0.useJoker("slow");
  run(30, () => {
    const d = A.game.debug();
    const g = d.gates.find((x) => !x.done);
    if (d.state === "play" && g) d.player.target = g.cx;
  });
  const d = A.game.debug();
  const total = d.jokers.clear + d.jokers.ghost + d.jokers.slow;
  const ctx = { measureText: (t) => ({ width: t.length * 7 }) };
  const full = d.foeLabel(ctx, { name: "Mehmet Yıldırım", short: "M. Yıldırım" }, 150);
  const mid = d.foeLabel(ctx, { name: "Muhammed Abdurrahman Karaosmanoğlu", short: "M. Karaosmanoğlu" }, 150);
  const tiny = d.foeLabel(ctx, { name: "Muhammed Abdurrahman Karaosmanoğlu", short: "M. Karaosmanoğlu" }, 70);
  check(
    "slalom: seviye atlayan joker kazanır, rakip adı tam ya da kısaltılmış",
    d.level >= 2 && total >= d.level - 1 && full === "Mehmet Yıldırım" && mid === "M. Karaosmanoğlu" && tiny.endsWith("…") && tiny.length * 7 <= 70,
    `seviye ${d.level}, ${total} joker · "${full}" · "${mid}" · "${tiny}"`,
  );
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
