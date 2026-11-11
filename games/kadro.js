/*
 * KADRO KOŞUSU 3B — kapılardan geç, kadronu büyüt, rakibi şut yağmuruna tut.
 *
 * Tek oyuncuyla başlarsın. Yol boyunca çift KAPILAR gelir (+8, ×2, −5, ÷2):
 * hangi kapıdan geçersen kadron ona göre büyür ya da küçülür. Kadron önüne
 * çıkan RAKİP GRUPLARINA kendiliğinden şut atar; grup erimeden temas edersen
 * bire bir oyuncu kaybedersin. Her bölümün sonunda rakibin KALESİ var:
 * kaleciyi şutla düşür, GOL at, sıradaki rakibe geç.
 *
 * MİMARİ: simülasyon (kurallar, kapılar, hasar, puan) çizimden bağımsızdır;
 * başsız testler yalnız onu koşturur. Hasar ANALİTİKTİR (kadro × atış hızı);
 * ekrandaki toplar yalnız görseldir, kare hızı sonucu değiştirmez. Çizim
 * arcade motorunda (games/arcade3d.js): örneklenmiş mini futbolcular, GPU
 * parçacıkları, tema geçişleri.
 *
 * GERÇEK İÇERİK (RN'den {type:"config", roster:{captain, rivals}}): kadron
 * seçtiğin oyuncunun kulübünün formasını giyer; her bölüm ligin bir takımına
 * karşıdır (forması, adı, kalecisi).
 *
 * KONTROL: parmağını sağa sola kaydır; kadro parmağını izler.
 *
 * KURALLAR:
 *   · Kapı: sol/sağ yarıdan hangisinden geçtiysen o işlem uygulanır.
 *   · Rakip grubu: menzile (17 m) girince kadron şut atar; hasar = kadro ×
 *     1,1 / sn. Temasta kalan rakip sayısı kadar oyuncun gider. Yarım saha
 *     kaplayan büyük gruplardan KAÇABİLİRSİN.
 *   · Antrenman çubuğu (bölüm 2+): sağa sola kayar; değdiği oyuncular düşer.
 *   · Kale: kaleci düzenli aralıkla SERT ŞUT çeker; yerdeki kırmızı halkadan
 *     kaç. Kalecinin canı bitince GOL.
 *   · Kadro sıfırlanırsa oyun biter.
 *
 * PUAN: eritilen her grup 10 × bölüm; çubuğu kayıpsız geçmek +5; gol
 * 100 + 25 × bölüm + kalan kadronun dörtte biri (en çok +50).
 */
(function () {
  "use strict";
  var A = window.Arena;
  var P = A.PAL;
  var T = window.THREE || (typeof THREE !== "undefined" ? THREE : null); // eslint-disable-line no-undef
  var G3 = A.G3;
  var K = A.T3;

  /* ─────────────────────────── kadro ─────────────────────────── */
  var DEFAULT_CAPTAIN = { id: 0, short: "ElitLig", name: "ElitLig", shirt: 10, team: { name: "ElitLig", kit: { primary: "#5B3DF5", secondary: "#FFFFFF" } } };
  var DEFAULT_RIVALS = [
    ["Kırmızılar", "#DC2626", "#FFFFFF", "M. Polat"],
    ["Sarı-Lacivert", "#FACC15", "#1E3A8A", "E. Kara"],
    ["Yeşiller", "#16A34A", "#FFFFFF", "S. Aydın"],
    ["Turuncular", "#F97316", "#111827", "B. Yıldız"],
    ["Siyahlar", "#111827", "#F8FAFC", "K. Demir"],
  ].map(function (d, i) {
    return { team: { id: -1 - i, name: d[0], kit: { primary: d[1], secondary: d[2] } }, keeper: { short: d[3] } };
  });
  var captain = DEFAULT_CAPTAIN;
  var rivals = DEFAULT_RIVALS;
  var rosterSig = "";
  var lookKey = "";
  function setRoster(r) {
    var cp = r && r.captain && r.captain.team ? r.captain : null;
    var rv = r && Array.isArray(r.rivals) ? r.rivals.filter(function (d) { return d && d.team && d.team.kit; }) : [];
    var sig = (cp ? cp.id : "d") + ":" + rv.map(function (d) { return d.team.id; }).join(",");
    if (sig === rosterSig) return;
    rosterSig = sig;
    captain = cp || DEFAULT_CAPTAIN;
    rivals = rv.length ? rv : DEFAULT_RIVALS;
    lookKey = "";
  }
  function rivalAt(lvl) {
    return rivals[(Math.max(1, lvl) - 1) % rivals.length];
  }
  function kitOf(person) {
    var k = person && person.team && person.team.kit ? person.team.kit : {};
    return { primary: k.primary || "#5B3DF5", secondary: k.secondary || "#FFFFFF" };
  }

  /* ─────────────────────────── dünya (metre) ─────────────────────────── */
  var FIELD = 4.4; // yolun yarı genişliği
  var RANGE = 17; // şut menzili
  var FIRE = 1.1; // oyuncu başına saniyedeki hasar
  var SEG = 20; // kapı / grup aralığı
  var STOP = 12; // kale önünde durulan çizginin kaleye uzaklığı
  var MAX_N = 999;
  var THEME_ORDER = ["day", "sunset", "night"];

  var W = 0, H = 0;
  var state = "attract"; // attract | play | goal | dying | over
  var z = 0, x = 0, target = 0, speed = 0;
  var n = 1, maxN = 1, level = 1, points = 0, goals = 0, cleared = 0;
  var segs = []; // { type:"gate"|"rivals"|"bar", z, ... }
  var boss = null; // { z, hp, hp0, next, shot:{ x, at, land } | null, k }
  var expect = 1;
  var scoreBump = 0, flashRed = 0, countBump = 0, stateT = 0, levelZ0 = 0;
  var lastTouchX = null;
  var uid = 0;
  var fallen = []; // { x, z, at, look, dir } — düşen oyuncular (görsel)
  var shots = []; // { x, z, y, tx, tz, t, dur } — görsel toplar
  var shotAcc = 0;
  var born = []; // kadro yuvasının doğduğu an (büyüme animasyonu)

  function levelSpeed() {
    return Math.min(11.5, 8.2 + 0.4 * (level - 1));
  }
  function apply(v, op) {
    var out = op.op === "+" ? v + op.v : op.op === "-" ? v - op.v : op.op === "x" ? v * op.v : Math.ceil(v / op.v);
    return Math.min(MAX_N, out);
  }
  function opLabel(op) {
    return (op.op === "+" ? "+" : op.op === "-" ? "−" : op.op === "x" ? "×" : "÷") + op.v;
  }
  function isGood(op) {
    return op.op === "+" || op.op === "x";
  }
  function goodOp(e) {
    if (e >= 4 && Math.random() < 0.3) return { op: "x", v: e < 40 && Math.random() < 0.25 ? 3 : 2 };
    return { op: "+", v: Math.round(A.rand(3, 7) + level * 2 + e * 0.22) };
  }
  function badOp(e, good) {
    var r = Math.random();
    if (r < 0.4) return { op: "-", v: Math.max(1, Math.round(e * A.rand(0.15, 0.4))) };
    if (r < 0.6 && e >= 4) return { op: "/", v: 2 };
    return { op: "+", v: Math.max(1, Math.round((apply(e, good) - e) * A.rand(0.2, 0.45))) };
  }

  /** Bir bölümün yolu: kapı · rakip · kapı · (çubuk|rakip) … · KALE. */
  function buildLevel(from) {
    segs = [];
    var zz = from + 16;
    var count = 5 + Math.min(level, 4);
    for (var i = 0; i < count; i++) {
      if (i % 2 === 0) {
        var g = goodOp(expect);
        var other = Math.random() < 0.22 ? goodOp(expect) : badOp(expect, g);
        var flip = Math.random() < 0.5;
        segs.push({ type: "gate", z: zz, left: flip ? other : g, right: flip ? g : other, done: false, pick: 0, at: 0, id: ++uid });
        expect = Math.min(600, Math.max(apply(expect, g), apply(expect, other)));
      } else if (level >= 2 && i % 4 === 3) {
        segs.push({ type: "bar", z: zz, w: 1.7 + Math.min(1.2, level * 0.15), phase: Math.random() * 6.28, rate: 1.1 + level * 0.08, done: false, x: 0, id: ++uid });
      } else {
        var roll = Math.random();
        var span = roll < 0.5 || level === 1 ? [-FIELD, FIELD] : roll < 0.75 ? [-FIELD, 0.5] : [-0.5, FIELD];
        var full = span[0] === -FIELD && span[1] === FIELD;
        var hp = Math.max(2, Math.round(expect * (full ? A.rand(0.5, 1.35) : A.rand(1.6, 2.8)) * (0.85 + 0.05 * level)));
        segs.push({ type: "rivals", z: zz, x0: span[0], x1: span[1], hp: hp, hp0: hp, full: full, done: false, hitAt: -9, id: ++uid });
        if (full) expect = Math.max(2, expect - Math.max(0, hp - 1.9 * expect));
      }
      zz += SEG;
    }
    var bhp = Math.round(expect * (2.1 + 0.3 * level)) + 8;
    boss = { z: zz + 10, hp: bhp, hp0: bhp, next: 1.4, shot: null, k: 0, hitAt: -9, id: ++uid };
    levelZ0 = from;
  }

  function resetRun() {
    z = 0;
    x = 0;
    target = 0;
    speed = 0;
    n = 1;
    maxN = 1;
    level = 1;
    points = 0;
    goals = 0;
    cleared = 0;
    expect = 1;
    fallen = [];
    shots = [];
    born = [];
    buildLevel(0);
  }

  function start() {
    resetRun();
    state = "play";
    stateT = 0;
    A.particles.length = 0;
    A.floaters.length = 0;
    A.banner = null;
    A.sound("whistle");
    A.announce("KADRO KOŞUSU", "Kapılardan geç, kadronu büyüt");
    if (R) G3.setTheme(R, THEME_ORDER[0]);
  }

  /* ─────────────────────────── kayıp / kazanç ─────────────────────────── */

  function squadRadius(count) {
    return Math.min(3.3, 0.34 * Math.sqrt(Math.max(1, Math.min(count, 70))) + 0.2);
  }
  /** i. yuvanın kadro merkezine göre yeri (ayçiçeği dizilimi). */
  function slot(i, count) {
    var vis = Math.min(count, 70);
    var k = vis > 1 ? squadRadius(count) / Math.sqrt(vis) : 0;
    var r = k * Math.sqrt(i + 0.35), th = i * 2.39996;
    return { x: Math.cos(th) * r, z: Math.sin(th) * r * 0.9 };
  }

  function lose(k, why) {
    if (k <= 0 || state !== "play") return;
    k = Math.min(n, Math.ceil(k));
    var vis = Math.min(n, 70);
    var show = Math.min(k, 10);
    for (var i = 0; i < show; i++) {
      var s = slot(Math.max(0, vis - 1 - i), n);
      fallen.push({ x: A.clamp(x + s.x, -FIELD + 0.3, FIELD - 0.3), z: z + s.z, at: A.time + i * 0.02, mine: true, dir: Math.random() < 0.5 ? -1 : 1 });
    }
    if (fallen.length > 40) fallen.splice(0, fallen.length - 40);
    n -= k;
    countBump = -1;
    flashRed = Math.max(flashRed, why === "boss" ? 0.9 : 0.5);
    A.haptic(why === "boss" ? "error" : "warning");
    if (n <= 0) {
      n = 0;
      state = "dying";
      stateT = 0;
      A.sound("crash");
      A.shake(10);
    }
  }
  function gain(to) {
    var from = n;
    n = Math.max(0, Math.min(MAX_N, to));
    maxN = Math.max(maxN, n);
    for (var i = Math.min(from, 70); i < Math.min(n, 70); i++) born[i] = A.time + (i - from) * 0.012;
    countBump = n > from ? 1 : -1;
  }

  /* ─────────────────────────── güncelleme ─────────────────────────── */

  function update(dt) {
    stateT += dt;
    scoreBump = Math.max(0, scoreBump - dt * 4);
    flashRed = Math.max(0, flashRed - dt * 2.4);
    countBump = A.damp(countBump, 0, 7, dt);
    var playing = state === "play";

    /* Vitrin: kadro iyi kapıya yönelir, asla bitmez. */
    if (state === "attract") {
      var ng = null;
      for (var a = 0; a < segs.length; a++)
        if (!segs[a].done && segs[a].z > z) {
          ng = segs[a];
          break;
        }
      if (ng && ng.type === "gate") target = apply(n, ng.left) >= apply(n, ng.right) ? -FIELD / 2 : FIELD / 2;
      else if (ng && ng.type === "rivals" && !ng.full) target = ng.x0 === -FIELD ? FIELD * 0.65 : -FIELD * 0.65;
      else if (boss && boss.shot) target = boss.shot.x > 0 ? -2.4 : 2.4;
      if (n < 4) n = 4;
    }

    /* Yanal hareket */
    var lim = FIELD - 0.35;
    target = A.clamp(target, -lim, lim);
    x = A.damp(x, target, 15, dt);

    /* İleri hız: grupla temasta ve kale önünde durur */
    var want = state === "dying" || state === "over" ? 0 : levelSpeed();
    var blocked = false;
    var atBoss = boss && z >= boss.z - STOP;
    if (atBoss && state !== "goal") want = 0;

    /* Kapılar, gruplar, çubuklar */
    var dps = FIRE * n;
    var firing = null;
    for (var i = 0; i < segs.length; i++) {
      var s = segs[i];
      if (s.done) continue;
      var d = s.z - z;
      if (s.type === "gate") {
        if (d <= 0) {
          s.done = true;
          s.at = A.time;
          s.pick = x < 0 ? -1 : 1;
          var op = s.pick < 0 ? s.left : s.right;
          var before = n;
          if (state === "play" || state === "attract") {
            gain(Math.max(0, apply(n, op)));
            if (playing) {
              A.sound(isGood(op) ? "pop" : "bad");
              A.haptic(isGood(op) ? "light" : "warning");
              if (n <= 0) {
                n = before;
                lose(before, "gate");
              }
            }
          }
        }
      } else if (s.type === "rivals") {
        var inSpan = x > s.x0 - 0.7 && x < s.x1 + 0.7;
        if (d < -1.5) {
          s.done = true; // kaçıldı
          continue;
        }
        if (inSpan && d < RANGE && d > -1 && (playing || state === "attract")) {
          firing = s;
          s.hp -= dps * dt;
          s.hitAt = A.time;
        }
        if (inSpan && d < 1.3 && s.hp > 0 && (playing || state === "attract")) {
          blocked = true;
          var rate = Math.max(30, n * 1.6) * dt;
          var k = Math.min(rate, s.hp, n);
          s.hp -= k;
          s.melee = (s.melee || 0) + k;
          if (s.melee >= 1) {
            var whole = Math.floor(s.melee);
            s.melee -= whole;
            if (playing) lose(whole, "melee");
            else n = Math.max(4, n - whole);
          }
        }
        if (s.hp <= 0) {
          s.done = true;
          s.at = A.time;
          s.dead = true;
          if (playing) {
            cleared += 1;
            var gp = 10 * level;
            points += gp;
            scoreBump = 1;
            A.sound("gate");
            A.haptic("light");
            floatAt("+" + gp, (s.x0 + s.x1) / 2, 2.4, s.z, P.gold, 22);
          }
        }
      } else if (s.type === "bar") {
        s.x = Math.sin(A.time * s.rate + s.phase) * (FIELD - s.w / 2 - 0.2);
        if (d <= 0) {
          s.done = true;
          var rad = squadRadius(n);
          var lo = Math.max(x - rad, s.x - s.w / 2), hi = Math.min(x + rad, s.x + s.w / 2);
          var frac = Math.max(0, hi - lo) / (2 * rad);
          if (playing) {
            if (frac > 0.02) {
              lose(Math.max(1, n * frac * 0.8), "bar");
              A.sound("thud");
              A.shake(5);
            } else {
              points += 5;
              scoreBump = 0.7;
              floatAt("TEMİZ +5", x, 2.2, z, "#7DD3FC", 18);
            }
          }
        }
      }
    }
    if (blocked) want = 0;
    speed = A.approach(speed, want, (speed < want ? 14 : 40) * dt);
    if (state === "dying") {
      speed = 0;
      if (stateT > 1.3) {
        state = "over";
        A.sound("over");
        A.send("over", { score: points, stats: { level: level, goals: goals, squad: maxN, rivals: cleared, teams: rivals.length } });
      }
    }
    z += speed * dt;

    /* Kale: kaleciye şut, kalecinin sert şutundan kaç */
    if (boss && atBoss && (playing || state === "attract")) {
      z = Math.min(z, boss.z - STOP);
      firing = boss;
      boss.hp -= dps * dt;
      boss.hitAt = A.time;
      boss.next -= dt;
      if (!boss.shot && boss.next <= 0) {
        boss.shot = { x: x, at: A.time, land: A.time + 0.95 };
        boss.k += 1;
        if (playing) A.sound("whoosh");
      }
      if (boss.shot && A.time >= boss.shot.land) {
        var miss = Math.abs(x - boss.shot.x) > 1.55 + squadRadius(n) * 0.25;
        if (playing) {
          if (!miss) {
            lose(Math.ceil(n * 0.22) + level, "boss");
            A.sound("boom");
            A.shake(9);
          } else {
            floatAt("KAÇTIN!", x, 2.4, z, "#7DD3FC", 18);
            A.haptic("light");
          }
        }
        boss.landed = { x: boss.shot.x, at: A.time };
        boss.shot = null;
        boss.next = Math.max(0.85, 1.5 - 0.06 * level);
      }
      if (boss.hp <= 0 && state === "play") {
        goals += 1;
        var bonus = 100 + 25 * level + Math.min(50, Math.floor(n / 4));
        points += bonus;
        scoreBump = 1;
        state = "goal";
        stateT = 0;
        boss.shot = null;
        A.sound("cheer");
        A.sound("net");
        A.haptic("success");
        A.announce("GOOOL!", "+" + bonus + " puan · " + String(rivalAt(level).team.name || "Rakip") + " geçildi");
      } else if (boss.hp <= 0 && state === "attract") {
        // vitrin: aynı bölüm baştan
        expect = Math.max(4, Math.round(n * 0.3));
        n = expect;
        buildLevel(boss.z + 6);
        speed = levelSpeed();
      }
    }

    /* Gol sevinci → sıradaki bölüm */
    if (state === "goal" && stateT > 2.3) {
      level += 1;
      var keep = A.clamp(Math.round(n * 0.35), 3, 40);
      n = keep;
      expect = keep;
      born = [];
      buildLevel(boss.z + 8);
      z = levelZ0;
      state = "play";
      stateT = 0;
      shots = [];
      fallen = [];
      var rv = rivalAt(level);
      A.announce("BÖLÜM " + level, "Rakip: " + String(rv.team.name || "Rakip"));
      A.sound("level");
      if (R) G3.setTheme(R, THEME_ORDER[(level - 1) % THEME_ORDER.length]);
    }

    /* Görsel toplar (hasar analitik; bunlar yalnız süs) */
    if (firing && n > 0 && !A.reduceMotion) {
      shotAcc += dt * Math.min(26, 3 + n * 0.5);
      var tz = firing === boss ? boss.z - 0.6 : firing.z - 0.4;
      while (shotAcc >= 1) {
        shotAcc -= 1;
        var sl = slot((Math.random() * Math.min(n, 70)) | 0, n);
        var sx = A.clamp(x + sl.x, -FIELD + 0.3, FIELD - 0.3);
        var tx = firing === boss ? A.rand(-2.8, 2.8) : A.clamp(sx + A.rand(-0.5, 0.5), firing.x0 + 0.3, firing.x1 - 0.3);
        var dist = Math.max(2, tz - (z + sl.z));
        shots.push({ x: sx, z: z + sl.z + 0.5, tx: tx, tz: tz, t: 0, dur: dist / 30, arc: firing === boss ? A.rand(0.6, 1.8) : A.rand(0.2, 0.8), boss: firing === boss });
        if (shots.length > 70) shots.shift();
      }
      if (playing && Math.random() < dt * 9) A.sound("shoot");
    }
    for (var q = shots.length - 1; q >= 0; q--) {
      shots[q].t += dt / shots[q].dur;
      if (shots[q].t >= 1) {
        if (fxHit) fxHit(shots[q]);
        shots.splice(q, 1);
      }
    }
    for (var f = fallen.length - 1; f >= 0; f--) if (A.time - fallen[f].at > 1.3) fallen.splice(f, 1);

    /* Temizlik: geride kalanlar */
    segs = segs.filter(function (s2) {
      return s2.z > z - 14;
    });
  }

  /* ─────────────────────────── girdi ─────────────────────────── */

  function down(p) {
    lastTouchX = p.x;
  }
  function move(p) {
    if (state !== "play" || lastTouchX == null) return;
    var mpp = (FIELD * 2 + 2.4) / Math.max(1, W);
    target = A.clamp(target + (p.x - lastTouchX) * mpp * 1.25, -FIELD + 0.35, FIELD - 0.35);
    lastTouchX = p.x;
  }
  function up() {
    lastTouchX = null;
  }

  /* ═══════════════════════════ 3B ÇİZİM ═══════════════════════════ */

  var R = null, glFailed = false;
  var STRIP = 220;
  var fxHit = null;
  function wz(Z) {
    return -Z;
  }

  function resize(w, h) {
    W = w;
    H = h;
    if (!segs.length) resetRun();
    initGL();
    if (R) G3.resize(R, W, H, function (aspect) { return A.clamp((2 * Math.atan(0.46 / aspect) * 180) / Math.PI, 42, 74); });
  }

  function initGL() {
    if (R || glFailed) return;
    try {
      R = G3.stage({ theme: "day", fog: [48, 150], far: 400, shadow: { size: 1536, box: [-11, 11, 20, -12], far: 150 } });
      if (!R) {
        glFailed = true;
        return;
      }
      buildWorld();
      fxHit = function (s) {
        R.fx.burst(3, { x: s.tx, y: s.boss ? 1.2 : 0.9, z: wz(s.tz), speed: 3.5, life: 0.3, size: 0.28, color: ["#FFFFFF", "#FDE68A"], gravity: 4 });
      };
    } catch (e) {
      A.glError = String((e && e.stack) || e);
      R = null;
      glFailed = true;
    }
  }

  function buildWorld() {
    var s = R.scene;
    // Yol: dama desenli parlak çim + tebeşir kenarlar
    var turf = K.canvasTex(256, 256, function (c, w, h) {
      for (var r = 0; r < 4; r++) {
        c.fillStyle = r % 2 ? "#46b558" : "#3da650";
        c.fillRect(0, (r * h) / 4, w, h / 4);
      }
      var rnd = A.seeded(4);
      for (var k = 0; k < 5000; k++) {
        c.fillStyle = rnd() < 0.5 ? "rgba(255,255,255,0.05)" : "rgba(0,50,0,0.06)";
        c.fillRect(rnd() * w, rnd() * h, 1.5, 2 + rnd() * 4);
      }
      c.fillStyle = "rgba(255,255,255,0.95)";
      c.fillRect(0, 0, 7, h);
      c.fillRect(w - 7, 0, 7, h);
      c.fillStyle = "rgba(255,255,255,0.16)";
      c.fillRect(w / 2 - 2, 0, 4, h);
    }, true);
    turf.repeat.set(1, STRIP / 16);
    R.turf = turf;
    R.track = K.mesh(new T.PlaneGeometry(FIELD * 2, STRIP), K.std(0xffffff, 0.92, 0, { map: turf, envMapIntensity: 0.3 }), false, true);
    R.track.rotation.x = -Math.PI / 2;
    s.add(R.track);
    var apron = K.mesh(new T.PlaneGeometry(90, STRIP), K.std(0x2f8f45, 0.95, 0, { envMapIntensity: 0.25 }), false, true);
    apron.rotation.x = -Math.PI / 2;
    apron.position.y = -0.03;
    s.add(apron);
    R.apron = apron;

    // Kenar LED panoları
    R.boardTex = K.canvasTex(1024, 64, function () {}, true);
    R.boardTex.repeat.set(STRIP / 26, 1);
    var boardMat = new T.MeshBasicMaterial({ map: R.boardTex, toneMapped: false });
    var dark = K.std(0x16204a, 0.6);
    R.boards = [-1, 1].map(function (side) {
      var b = K.mesh(new T.BoxGeometry(0.22, 1.0, STRIP), [side < 0 ? dark : boardMat, side < 0 ? boardMat : dark, dark, dark, dark, dark], true, true);
      b.position.set(side * (FIELD + 1.0), 0.5, 0);
      s.add(b);
      return b;
    });
    // Tribünler
    R.crowdTex = G3.crowdTexture(kitOf(captain), kitOf(rivalAt(1)));
    R.stands = [-1, 1].map(function (side) {
      return G3.standStrip(R, STRIP, side, FIELD + 2.2, R.crowdTex, { depth: 10, rise: 7 });
    });

    R.crowd = G3.minis(R, 190);
    R.balls = G3.balls(R, 90, 0.2);

    // Kapı panelleri (havuz)
    R.panels = [];
    for (var i = 0; i < 8; i++) {
      var tex = K.canvasTex(256, 160, function () {});
      var m = new T.Mesh(new T.PlaneGeometry(FIELD - 0.2, 2.7), new T.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: T.DoubleSide, toneMapped: false }));
      m.visible = false;
      m.renderOrder = 3;
      s.add(m);
      R.panels.push({ mesh: m, tex: tex, key: "" });
    }
    var postMat = K.std(0xf8fafc, 0.3, 0.1);
    R.posts = [];
    for (var p = 0; p < 12; p++) {
      var post = K.mesh(new T.CylinderGeometry(0.09, 0.09, 3.0, 12), postMat);
      post.visible = false;
      s.add(post);
      R.posts.push(post);
    }
    // Antrenman çubuğu
    R.bars = [0, 1].map(function () {
      var g = new T.Group();
      var bar = K.mesh(new T.BoxGeometry(1, 0.34, 0.34), new T.MeshStandardMaterial({ color: 0xf43f5e, roughness: 0.4, emissive: 0x7f1d1d, emissiveIntensity: 0.4 }));
      bar.position.y = 0.75;
      var stripe = K.mesh(new T.BoxGeometry(1.02, 0.12, 0.36), K.std(0xffffff, 0.4));
      stripe.position.y = 0.75;
      g.add(bar, stripe);
      [-1, 1].forEach(function (sd) {
        var leg = K.mesh(new T.CylinderGeometry(0.07, 0.11, 0.75, 10), K.std(0x1f2937, 0.5));
        leg.position.set(sd * 0.45, 0.375, 0);
        leg.userData.side = sd;
        g.add(leg);
      });
      g.visible = false;
      s.add(g);
      return g;
    });

    // Kale
    var goal = new T.Group();
    var white = new T.MeshPhysicalMaterial({ color: 0xf8fafc, roughness: 0.25, clearcoat: 0.5 });
    var GW = 7.0, GH = 2.8, GD = 2.2;
    [-1, 1].forEach(function (sd) {
      var gp = K.mesh(new T.CylinderGeometry(0.11, 0.11, GH, 16), white);
      gp.position.set((sd * GW) / 2, GH / 2, 0);
      goal.add(gp);
    });
    var bar2 = K.mesh(new T.CylinderGeometry(0.11, 0.11, GW + 0.22, 16), white);
    bar2.rotation.z = Math.PI / 2;
    bar2.position.y = GH;
    goal.add(bar2);
    var netTex = A.S3.netTexture();
    function net(w, h2, rx, ry) {
      var t = netTex.clone();
      t.needsUpdate = true;
      t.repeat.set(rx, ry);
      return new T.Mesh(new T.PlaneGeometry(w, h2), new T.MeshBasicMaterial({ map: t, transparent: true, alphaTest: 0.1, side: T.DoubleSide, depthWrite: false }));
    }
    var back = net(GW, GH, 22, 9);
    back.position.set(0, GH / 2, -GD);
    goal.add(back);
    R.goalNet = back;
    [-1, 1].forEach(function (sd) {
      var side = net(GD, GH, 7, 9);
      side.rotation.y = Math.PI / 2;
      side.position.set((sd * GW) / 2, GH / 2, -GD / 2);
      goal.add(side);
    });
    var top = net(GW, GD, 22, 7);
    top.rotation.x = Math.PI / 2;
    top.position.set(0, GH, -GD / 2);
    goal.add(top);
    s.add(goal);
    R.goal = goal;
    // kale çizgisi + ceza yayı (yere serili)
    var line = new T.Mesh(new T.PlaneGeometry(FIELD * 2, 0.16), new T.MeshBasicMaterial({ color: 0xffffff }));
    line.rotation.x = -Math.PI / 2;
    line.position.y = 0.012;
    goal.add(line);
    var stop = new T.Mesh(new T.RingGeometry(3.9, 4.05, 48, 1, 0, Math.PI), new T.MeshBasicMaterial({ color: 0xffffff, side: T.DoubleSide }));
    stop.rotation.x = -Math.PI / 2;
    stop.position.set(0, 0.012, STOP - 4);
    goal.add(stop);

    // Kalecinin sert şutu: yerde hedef halkası + iri top
    R.ring = new T.Mesh(new T.RingGeometry(1.25, 1.55, 40), new T.MeshBasicMaterial({ color: 0xff3355, transparent: true, depthWrite: false, side: T.DoubleSide, toneMapped: false }));
    R.ring.rotation.x = -Math.PI / 2;
    R.ring.visible = false;
    s.add(R.ring);
    R.disc = new T.Mesh(new T.CircleGeometry(1.25, 40), new T.MeshBasicMaterial({ color: 0xff3355, transparent: true, opacity: 0.25, depthWrite: false, toneMapped: false }));
    R.disc.rotation.x = -Math.PI / 2;
    R.disc.visible = false;
    s.add(R.disc);
    R.bigBall = G3.ball(R, 0.42);
    R.bigBall.visible = false;
  }

  function paintBoards(text) {
    if (text === R.boardText) return;
    R.boardText = text;
    var c = R.boardTex.userData.ctx, cw = 1024, ch = 64;
    var g = c.createLinearGradient(0, 0, 0, ch);
    g.addColorStop(0, "#5B3DF5");
    g.addColorStop(1, "#2A1680");
    c.fillStyle = g;
    c.fillRect(0, 0, cw, ch);
    c.font = "900 36px " + A.FONT;
    c.textBaseline = "middle";
    c.fillStyle = "#FFFFFF";
    var unit = c.measureText(text).width || 200;
    for (var px = 0; px < cw; px += unit) c.fillText(text, px, ch * 0.55);
    R.boardTex.needsUpdate = true;
  }

  function paintPanel(panel, op, state2) {
    var key = opLabel(op) + state2;
    if (panel.key === key) return;
    panel.key = key;
    var c = panel.tex.userData.ctx, w = 256, h = 160;
    var good = isGood(op);
    c.clearRect(0, 0, w, h);
    var g = c.createLinearGradient(0, 0, 0, h);
    if (good) {
      g.addColorStop(0, "rgba(56,189,248,0.62)");
      g.addColorStop(1, "rgba(37,99,235,0.8)");
    } else {
      g.addColorStop(0, "rgba(251,113,133,0.62)");
      g.addColorStop(1, "rgba(225,29,72,0.8)");
    }
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    c.strokeStyle = good ? "#BAE6FD" : "#FECDD3";
    c.lineWidth = 8;
    c.strokeRect(4, 4, w - 8, h - 8);
    c.fillStyle = "rgba(255,255,255,0.14)";
    for (var y = 0; y < h; y += 16) c.fillRect(0, y, w, 6);
    c.font = "900 96px " + A.FONT;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.lineJoin = "round";
    c.lineWidth = 12;
    c.strokeStyle = good ? "#0B2A6B" : "#5B0A1E";
    c.strokeText(opLabel(op), w / 2, h / 2 + 4);
    c.fillStyle = "#FFFFFF";
    c.fillText(opLabel(op), w / 2, h / 2 + 4);
    panel.tex.needsUpdate = true;
  }

  var looks = { mine: null, foe: null, keeper: null };
  function refreshLooks() {
    var rv = rivalAt(level);
    var key = rosterSig + ":" + level;
    if (key === lookKey) return;
    lookKey = key;
    looks.mine = [0, 1, 2, 3, 4, 5].map(function (i) { return G3.look(kitOf(captain), i * 37 + 5); });
    looks.foe = [0, 1, 2, 3, 4, 5].map(function (i) { return G3.look(kitOf(rv), i * 53 + 11); });
    var gk = A.S3.asKeeper({ team: rv.team }, kitOf(captain).primary);
    looks.keeper = G3.look(kitOf(gk), 3);
    G3.paintCrowd(R.crowdTex, kitOf(captain), kitOf(rv));
    paintBoards("ELİTLİG ARENA  •  KADRO KOŞUSU  •  RAKİP: " + String(rv.team.name || "").toLocaleUpperCase("tr-TR") + "  •  ");
  }

  var camPos = null, camLook = null;
  function sync(dt) {
    refreshLooks();
    var c = R.camera;
    var atBoss = boss && z >= boss.z - STOP - 6;
    var wantPos = new T.Vector3(x * 0.45, atBoss ? 8.6 : 9.6, wz(z - (atBoss ? 10.5 : 9.5)));
    var wantLook = new T.Vector3(x * 0.55, 0.8, wz(z + (atBoss ? 8 : 9)));
    if (A.shakeAmt > 0.2) {
      wantPos.x += (Math.random() - 0.5) * A.shakeAmt * 0.02;
      wantPos.y += (Math.random() - 0.5) * A.shakeAmt * 0.02;
    }
    if (!camPos) {
      camPos = wantPos.clone();
      camLook = wantLook.clone();
    } else {
      var k = 1 - Math.exp(-8 * dt);
      camPos.lerp(wantPos, k);
      camLook.lerp(wantLook, k);
      if (Math.abs(camPos.z - wantPos.z) > 14) {
        camPos.copy(wantPos);
        camLook.copy(wantLook);
      }
    }
    c.position.copy(camPos);
    c.lookAt(camLook);
    G3.focus(R, x * 0.5, 0, wz(z + 6));

    var mid = z + STRIP * 0.36;
    R.track.position.z = wz(mid);
    R.turf.offset.y = ((mid % 16) / 16) % 1;
    R.apron.position.z = wz(mid);
    R.boards.forEach(function (b) {
      b.position.z = wz(mid);
    });
    R.boardTex.offset.x = (mid / 26 + A.time * 0.03) % 1;
    R.stands.forEach(function (st) {
      st.position.z = wz(mid);
      st.userData.seats.material.map.offset.x = (mid / 9) % 1;
    });

    /* Kapılar ve çubuklar */
    var pi = 0, qi = 0, bi = 0;
    segs.forEach(function (s) {
      if (s.type === "gate") {
        var fade = s.done ? A.clamp(1 - (A.time - s.at) / 0.35, 0, 1) : 1;
        if (fade <= 0) return;
        [-1, 1].forEach(function (side) {
          var panel = R.panels[pi++];
          if (!panel) return;
          var op = side < 0 ? s.left : s.right;
          paintPanel(panel, op, "");
          var m = panel.mesh;
          m.visible = true;
          var picked = s.done && s.pick === side;
          m.position.set((side * FIELD) / 2, 1.45 + (picked ? (1 - fade) * 1.2 : 0), wz(s.z));
          m.material.opacity = picked ? fade : fade * (s.done ? 0.5 : 1);
          m.scale.setScalar(picked ? 1 + (1 - fade) * 0.35 : 1);
        });
        [-FIELD, 0, FIELD].forEach(function (px) {
          var post = R.posts[qi++];
          if (!post) return;
          post.visible = true;
          post.position.set(px, 1.5, wz(s.z));
        });
      } else if (s.type === "bar" && !s.done) {
        var g = R.bars[bi++];
        if (!g) return;
        g.visible = true;
        g.position.set(s.x, 0, wz(s.z));
        g.children[0].scale.x = s.w;
        g.children[1].scale.x = s.w;
        g.children.forEach(function (ch) {
          if (ch.userData.side) ch.position.x = ch.userData.side * (s.w / 2 - 0.1);
        });
      }
    });
    for (; pi < R.panels.length; pi++) R.panels[pi].mesh.visible = false;
    for (; qi < R.posts.length; qi++) R.posts[qi].visible = false;
    for (; bi < R.bars.length; bi++) R.bars[bi].visible = false;

    /* Kale */
    if (boss) {
      R.goal.position.set(0, 0, wz(boss.z + 1.2));
      R.goal.visible = true;
      var sh = boss.shot;
      R.ring.visible = R.disc.visible = !!sh;
      R.bigBall.visible = !!sh;
      if (sh) {
        var u = A.clamp((A.time - sh.at) / (sh.land - sh.at), 0, 1);
        R.ring.position.set(sh.x, 0.03, wz(z));
        R.disc.position.set(sh.x, 0.025, wz(z));
        R.ring.scale.setScalar(1.6 - 0.6 * u);
        R.ring.material.opacity = 0.5 + 0.5 * Math.sin(A.time * 22);
        R.disc.material.opacity = 0.15 + 0.3 * u;
        R.bigBall.position.set(A.lerp(0, sh.x, u), 1.2 + Math.sin(u * Math.PI) * 4.2, wz(A.lerp(boss.z - 0.5, z, u)));
        R.bigBall.rotation.x -= dt * 14;
      }
      if (boss.landed && A.time - boss.landed.at < 0.05) {
        R.dust.burst(26, { x: boss.landed.x, y: 0.2, z: wz(z), speed: 6, life: 0.7, size: 0.5, size2: 1.3, color: ["#C8E6A0", "#8BC34A", "#F1F5F9"], gravity: 6, alpha: 0.75 });
        R.fx.burst(14, { x: boss.landed.x, y: 0.4, z: wz(z), speed: 8, life: 0.45, size: 0.45, color: ["#FCA5A5", "#FFFFFF", "#FDBA74"] });
        boss.landed.at = -9;
      }
    }

    /* Mini futbolcular */
    var cr = R.crowd;
    cr.begin();
    var vis = Math.min(n, 70);
    var goal = state === "goal";
    var stopped = speed < 0.5;
    for (var i = 0; i < vis; i++) {
      var sl = slot(i, n);
      var mx = A.clamp(x + sl.x, -FIELD + 0.3, FIELD - 0.3), mz = z + sl.z;
      var b = born[i] ? A.clamp((A.time - born[i]) / 0.28, 0, 1) : 1;
      if (b <= 0) continue;
      var anim = "run", t = A.time * (8 + speed * 0.75) + i * 1.7;
      if (goal) {
        anim = "cheer";
        t = A.time * 2.2 + i * 0.6;
      } else if (stopped) {
        var kp = (A.time * 1.6 + i * 0.37) % 1;
        anim = "kick";
        t = kp;
      }
      cr.add({ x: mx, y: 0, z: wz(mz), ry: Math.PI, s: 1.25 * A.easeOutBack(b), anim: anim, t: t, look: looks.mine[i % 6], sy: b < 1 ? 0.8 + 0.2 * b : 1 });
    }
    // rakip grupları
    segs.forEach(function (s) {
      if (s.type !== "rivals") return;
      var frac = Math.max(0, s.hp) / s.hp0;
      var dead = s.dead ? A.clamp((A.time - s.at) / 0.5, 0, 1) : 0;
      if (dead >= 1 || (s.done && !s.dead && s.z < z - 8)) return;
      var w = s.x1 - s.x0;
      var cols = Math.max(2, Math.round(w / 1.05)), rows = s.hp0 > 40 ? 3 : s.hp0 > 12 ? 2 : 1;
      var total = cols * rows;
      var alive = Math.ceil(total * frac);
      var hit = A.clamp(1 - (A.time - s.hitAt) / 0.12, 0, 1) * 0.35;
      for (var k = 0; k < total; k++) {
        var cx = s.x0 + ((k % cols) + 0.5) * (w / cols), rz = s.z + Math.floor(k / cols) * 0.95;
        if (k < alive && !s.dead) cr.add({ x: cx, y: 0, z: wz(rz), ry: 0, s: 1.25, anim: "ready", t: A.time + k, look: looks.foe[k % 6], flash: hit });
        else if (s.dead && k < 8) cr.add({ x: cx, y: 0, z: wz(rz - dead * 1.5), ry: 0, s: 1.25 * (1 - dead * dead), anim: "fall", t: dead * 1.2, look: looks.foe[k % 6] });
      }
    });
    // kaleci + baraj
    if (boss) {
      var bh = A.clamp(1 - (A.time - boss.hitAt) / 0.12, 0, 1) * 0.3;
      var down2 = boss.hp <= 0;
      var kt = down2 ? A.clamp(stateT / 0.6, 0, 1) : 0;
      var kx = Math.sin(A.time * 1.7) * 1.6 * (down2 ? 0 : 1);
      cr.add({ x: kx, y: 0, z: wz(boss.z + 0.4), ry: 0, s: 2.3, anim: down2 ? "fall" : boss.shot && A.time - boss.shot.at < 0.4 ? "kick" : "keeper", t: down2 ? kt : boss.shot ? (A.time - boss.shot.at) / 0.4 : A.time, look: looks.keeper, flash: bh });
      var wall = Math.ceil(5 * Math.max(0, boss.hp / boss.hp0));
      for (var w2 = 0; w2 < wall; w2++) cr.add({ x: (w2 - 2) * 1.2, y: 0, z: wz(boss.z - 2.2), ry: 0, s: 1.3, anim: "block", t: A.time + w2, look: looks.foe[w2 % 6], flash: bh });
    }
    // düşenler
    fallen.forEach(function (f, i2) {
      var t2 = (A.time - f.at) / 0.9;
      if (t2 < 0) return;
      cr.add({ x: f.x + f.dir * t2 * 0.8, y: 0, z: wz(f.z - t2 * 1.2), ry: Math.PI + f.dir * 0.6, s: 1.25 * (1 - Math.max(0, t2 - 0.7) * 3.3), anim: "fall", t: t2, look: looks.mine[i2 % 6], flash: Math.max(0, 0.6 - t2 * 2) });
    });
    cr.end();

    /* Toplar */
    var bl = R.balls;
    bl.begin();
    shots.forEach(function (s) {
      var u2 = s.t;
      bl.add(A.lerp(s.x, s.tx, u2), 0.35 + Math.sin(u2 * Math.PI) * s.arc + (s.boss ? u2 * 0.9 : u2 * 0.5), wz(A.lerp(s.z, s.tz, u2)), A.time * 20 + s.x);
    });
    bl.end();

    /* Toz: koşan kadronun ayakları */
    if (speed > 3 && !A.reduceMotion && Math.random() < 0.5 && n > 0) {
      var sd = slot((Math.random() * vis) | 0, n);
      R.dust.emit({ x: x + sd.x, y: 0.08, z: wz(z + sd.z - 0.3), vx: A.rand(-0.5, 0.5), vy: A.rand(0.6, 1.4), vz: 1.5, life: 0.45, size: 0.22, size2: 0.5, color: "#CFE8B4", alpha: 0.5, gravity: 1 });
    }
    if (state === "goal" && !A.reduceMotion && Math.random() < 0.7)
      R.dust.emit({ x: A.rand(-5, 5), y: A.rand(5, 8), z: wz(z + A.rand(0, 12)), vx: A.rand(-1, 1), vy: -1, vz: A.rand(-1, 1), life: 1.8, size: 0.22, size2: 0.2, color: [P.gold, "#F43F5E", "#38BDF8", "#FFFFFF", "#A78BFA"], gravity: 2.2, drag: 1.2 });
    R.goalNet.position.z = -2.2 - (state === "goal" ? Math.sin(Math.min(1, stateT * 3) * Math.PI) * 0.5 : 0);
  }

  function floatAt(text, wx, wy, Z, color, size) {
    if (R) {
      var p = G3.project(R, wx, wy, wz(Z));
      A.floatText(text, p.x, p.y, color, size);
    } else A.floatText(text, W / 2, H / 2, color, size);
  }

  /* ═══════════════════════════ ÇİZİM GİRİŞİ ═══════════════════════════ */

  function render(c, dt) {
    if (R) {
      try {
        G3.adapt(R, dt, state === "attract");
        sync(dt);
        G3.tick(R, dt);
        G3.draw(R);
      } catch (e) {
        A.glError = String((e && e.stack) || e);
        glFailed = true;
        R = null;
      }
    }
    if (glFailed && !R && A.is3d) {
      c.fillStyle = "#0A0E24";
      c.fillRect(0, 0, W, H);
      c.fillStyle = "rgba(255,255,255,0.8)";
      c.font = A.font(14, 700);
      c.textAlign = "center";
      c.fillText("3B grafik bu cihazda açılamadı.", W / 2, H / 2);
    }
    drawScrim(c);
    if (R) drawWorldLabels(c);
    A.drawParticles(c);
    A.drawFloaters(c, dt);
    if (state !== "attract") drawHud(c);
    A.drawBanner(c, W, Math.max(170, H * 0.26), dt);
    if (flashRed > 0) {
      c.fillStyle = "rgba(251,113,133," + (0.26 * flashRed).toFixed(3) + ")";
      c.fillRect(0, 0, W, H);
    }
  }

  var scrim = null;
  function drawScrim(c) {
    if (!scrim || scrim.w !== W || scrim.h !== H) {
      scrim = A.layer(W, H);
      A.paintVignette(scrim.ctx, W, H, 0.28);
      A.paintTopScrim(scrim.ctx, W, 120);
    }
    A.blit(scrim);
  }

  /** Dünyaya bağlı yazılar: kadro sayısı, rakip canları. */
  function drawWorldLabels(c) {
    if (n > 0 && state !== "attract") {
      var p = G3.project(R, x, 2.5 + squadRadius(n) * 0.25, wz(z));
      var size = 20 * (1 + Math.abs(countBump) * 0.35);
      G3.tag(c, String(n), p.x, p.y, size, "#FFFFFF", countBump < -0.15 ? "rgba(225,29,72,0.92)" : "rgba(37,99,235,0.92)");
    }
    segs.forEach(function (s) {
      if (s.type !== "rivals" || s.done || s.z - z > 60) return;
      var q = G3.project(R, (s.x0 + s.x1) / 2, 2.6, wz(s.z));
      if (q.behind) return;
      G3.tag(c, String(Math.ceil(s.hp)), q.x, q.y, A.clamp(q.s * 0.9, 12, 22), "#FFFFFF", "rgba(225,29,72,0.92)");
    });
  }

  function drawHud(c) {
    var top = 14;
    A.drawScore(c, 18, top, "PUAN", points, scoreBump);
    c.save();
    c.textBaseline = "middle";
    var lbl = "BÖLÜM " + level;
    c.font = A.font(12, 800);
    var lw = c.measureText(lbl).width + 22;
    A.pill(c, W - 16 - lw, top + 4, lw, 26, "rgba(60,36,200,0.8)");
    c.fillStyle = "#fff";
    c.textAlign = "center";
    c.fillText(lbl, W - 16 - lw / 2, top + 17.5);
    var gl = goals + " gol";
    var gw = c.measureText(gl).width + 22;
    A.pill(c, W - 16 - gw, top + 36, gw, 26);
    c.fillStyle = "rgba(255,255,255,0.9)";
    c.fillText(gl, W - 16 - gw / 2, top + 49.5);

    // Bölüm ilerlemesi + rakip
    var rv = rivalAt(level);
    var w = Math.min(W - 36, 330), bx = W / 2 - w / 2, by = top + 78;
    A.roundRect(c, bx, by, w, 30, 9);
    c.fillStyle = "rgba(8,10,30,0.62)";
    c.fill();
    c.fillStyle = kitOf(captain).primary;
    c.fillRect(bx, by + 6, 4, 18);
    c.fillStyle = kitOf(rv).primary;
    c.fillRect(bx + w - 4, by + 6, 4, 18);
    c.font = A.font(11, 800);
    c.textAlign = "left";
    c.fillStyle = "#FFFFFF";
    c.fillText(clip(c, String(captain.short || "Sen"), w * 0.3), bx + 12, by + 11);
    c.textAlign = "right";
    c.fillText(clip(c, String(rv.team.name || "Rakip"), w * 0.42), bx + w - 12, by + 11);
    var total = boss ? boss.z - STOP - levelZ0 : 1;
    var prog = boss ? A.clamp((z - levelZ0) / total, 0, 1) : 0;
    A.roundRect(c, bx + 12, by + 20, w - 24, 5, 2.5);
    c.fillStyle = "rgba(255,255,255,0.16)";
    c.fill();
    var pg = c.createLinearGradient(bx, 0, bx + w, 0);
    pg.addColorStop(0, P.brandGlow);
    pg.addColorStop(1, P.gold);
    c.fillStyle = pg;
    A.roundRect(c, bx + 12, by + 20, Math.max(5, (w - 24) * prog), 5, 2.5);
    c.fill();

    // Kaleci can çubuğu
    if (boss && z >= boss.z - STOP - 20 && boss.hp > 0) {
      var bw = Math.min(W - 60, 280), hx = W / 2 - bw / 2, hy = by + 44;
      var name = rv.keeper && (rv.keeper.short || rv.keeper.name) ? String(rv.keeper.short || rv.keeper.name) : "Kaleci";
      c.textAlign = "center";
      c.font = A.font(11, 900);
      c.fillStyle = "#FFFFFF";
      c.fillText("KALECİ · " + clip(c, name, bw * 0.6) + " · " + Math.ceil(boss.hp), W / 2, hy);
      A.roundRect(c, hx, hy + 10, bw, 12, 6);
      c.fillStyle = "rgba(8,10,30,0.7)";
      c.fill();
      c.fillStyle = "#F43F5E";
      A.roundRect(c, hx + 2, hy + 12, Math.max(6, (bw - 4) * A.clamp(boss.hp / boss.hp0, 0, 1)), 8, 4);
      c.fill();
    }
    c.restore();
  }
  function clip(c, text, max) {
    var t = text;
    while (t.length > 3 && c.measureText(t).width > max) t = t.slice(0, -1);
    return t === text ? t : t + "…";
  }

  function debug() {
    return {
      state: state, z: z, x: x, n: n, maxN: maxN, level: level, points: points, goals: goals, cleared: cleared, speed: speed,
      segs: segs, boss: boss, gl: !!R, captain: captain.short, rival: rivalAt(level).team.name,
      setTarget: function (v) { target = v; },
      setN: function (v) { gain(v); },
      apply: apply,
    };
  }

  A.register({ resize: resize, start: start, update: update, render: render, down: down, move: move, up: up, debug: debug, setRoster: setRoster });
})();
