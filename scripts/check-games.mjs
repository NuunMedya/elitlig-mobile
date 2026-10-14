/**
 * OYUN DENETİMİ — Arena oyunlarının kurallarını gözle değil SAYIYLA doğrular.
 *
 * Çalıştırma:  npm run check:games
 *
 * Oyunlar (`games/*.js`) tarayıcıda çalışan düz JS'tir. Burada Node `vm`
 * içinde, sahte bir Canvas/DOM ile BAŞSIZ çalıştırılırlar: çizim komutları
 * yutulur, fizik ve kurallar gerçek kodla işler. Ölçülen iddialar:
 *
 *   0. `lib/game/web/games.generated.ts` kaynaklarla güncel.
 *   1. Üç oyun da vitrin modunda ve oyunda hatasız güncellenip çizilir.
 *   2. SEKTİR: topun solundan vurmak topu sağa gönderir (ve tersi); dokunmazsan
 *      top düşer ve tur biter; iyi oynayan oyuncu seviye atlar ve yerçekimi
 *      (ritim) artar.
 *   3. SLALOM: kenarda saklanmak ARTIK İŞE YARAMAZ — kaçırılan kapılar hak
 *      götürür ve tur biter. Kapıları izleyen oyuncu puan toplar; hız artar,
 *      kapılar daralır.
 *   4. PENALTI: süre dolarsa kaçırma sayılır ve üç kaçırmada tur biter; gol
 *      puan kazandırır ve oyun sonu skoru köprüden iletilir.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

import { buildModule, GENERATED_PATH } from "./build-games.mjs";

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
  for (const file of ["core.js", "scenery.js", `${game}.js`]) {
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
  run(35, () => {
    const d = A.game.debug();
    if (d.state !== "play") return;
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
    d.speed > v0 * 1.2 && lastGap < firstGap * 0.85,
    `hız ${v0.toFixed(1)} → ${d.speed.toFixed(1)} m/sn, kapı ${firstGap.toFixed(2)} → ${lastGap.toFixed(2)} m`,
  );
}

/* ── 4) PENALTI ──────────────────────────────────────────────────────────── */

{
  const { A, run, over } = boot("penalti");
  A.game.start();
  run(3 * (8 + 1.6) + 1);
  const end = over();
  check(
    "penaltı: süre dolunca hak gider",
    Boolean(end) && end.score === 0 && A.game.debug().misses === 3,
    end ? "üç süre aşımında tur bitti" : `tur bitmedi (kaçırma ${A.game.debug().misses})`,
  );
}
{
  const { A, run, over } = boot("penalti");
  A.game.start();
  let shots = 0;
  const outcomes = [];
  for (let i = 0; i < 40 && !over(); i += 1) {
    run(0.4);
    const d = A.game.debug();
    if (d.state !== "aim") {
      run(0.5);
      continue;
    }
    // Sol/sağ üst köşeye güçlü, hafif falsolu atış.
    const side = i % 2 ? 1 : -1;
    A.game.down({ x: 195, y: 560 });
    for (let k = 1; k <= 8; k += 1) A.game.move({ x: 195 + side * 140 * (k / 8) + Math.sin((Math.PI * k) / 8) * 20, y: 560 - 230 * (k / 8) });
    A.game.up({ x: 195 + side * 140, y: 330 });
    shots += 1;
    run(1.2);
    outcomes.push(A.game.debug().outcome);
    run(1);
  }
  const goals = outcomes.filter((o) => o === "gol").length;
  const end = over();
  check(
    "penaltı: gol puan kazandırır ve seri biter",
    goals >= 1 && Boolean(end) && end.score >= goals * 100,
    `${shots} atış, ${goals} gol, skor ${end ? end.score : "—"} (${outcomes.join(" ")})`,
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
