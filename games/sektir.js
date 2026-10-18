/*
 * TOP SEKTİR 3B — FLAPPY FUTBOL. Top stadyum boyunca kendiliğinden ilerler;
 * ekrana her dokunuşta havalanır. Önüne çıkan BARAJLARIN (rakip savunmacılardan
 * kule) üstünden, TERS ASILI KALELERİN altından geç: aradaki boşluktan her
 * geçiş bir GOL. Top çime, baraja ya da direğe değerse tur biter.
 *
 * MİMARİ: simülasyon dünya koordinatlarında (metre; x ileri, y yukarı) ve
 * çizimden bağımsızdır; başsız testler yalnız onu koşturur. Çizim three.js:
 * yandan yayın kamerası topu izler; arkada ortak stadyumun (games/stadium3d.js)
 * iki katlı tribün parçaları, LED panolar ve gece ışıkları yol boyunca akar.
 *
 * GERÇEK İÇERİK (RN'den {type:"config", roster:{juggler, rivals}}):
 *   · Topu seçilen gerçek oyuncu başlama vuruşuyla havalandırır (forma,
 *     soyadı, numara). Kontrol TAM ORTA penceresini ±%15, denge yerçekimini
 *     ±%4 değiştirir.
 *   · BARAJLAR ligin gerçek oyuncularıdır (kulüp formasıyla, adı üstünde).
 *   · GEÇTİĞİN OYUNCULAR: gol sayın ligin oyuncularının sezon gol + asist
 *     sayısını geçtikçe onları geride bırakırsın; sıradaki hedef HUD'da.
 *
 * MEKANİZMA:
 *   · Dokun → top her seferinde ~0,62 m yukarı sıçrar (kural, şans değil).
 *     Başlamak için ilk dokunuş.
 *   · Boşluğun tam ortasından geçiş "TAM ORTA": kombo büyür, her 5 tam ortada
 *     çarpan bir artar (en çok ×5). Gol 10 × çarpan (+5 tam orta).
 *   · ALTIN YILDIZ: boşluklarda ya da aralarda; +5.
 *   · ALTIN KRAMPON: nadiren yolda; bir çarpışmayı affeder (kalkan).
 *   · Tavan açıktır: tribün çatısına çarpan top aşağı döner, tur bitmez.
 *
 * GİDEREK ZORLAŞIR (her 10 golde bir seviye; ilk ~60 golde doyar):
 *   · Top hızlanır (3,1 → 4,6 m/sn), boşluk daralır (2,15 → 1,55 m),
 *     kapılar sıklaşır, yerçekimi artar.
 *   · Seviye 3: BARAJ ZIPLAR — top yaklaşınca en üstteki savunmacı sıçrar.
 *   · Seviye 5: kayan kapılar — baraj ve kale birlikte yukarı aşağı oynar.
 *
 * Skor = puan. Rekor tablosu bu puanı sıralar.
 */
(function () {
  "use strict";
  var A = window.Arena;
  var P = A.PAL;
  var T = window.THREE || (typeof THREE !== "undefined" ? THREE : null); // eslint-disable-line no-undef
  var S3 = A.S3;

  /* ─────────────── kadro ─────────────── */
  var DEFAULT_JUGGLER = {
    id: 0,
    short: "ElitLig",
    back: "ELİTLİG",
    shirt: 10,
    team: { name: "ElitLig", kit: { primary: "#5B3DF5", secondary: "#FFFFFF" } },
    attrs: { agility: 78, control: 78 },
  };
  var FALLBACK_WALL = [
    { id: -1, short: "H. Demir", name: "Hakan Demir", shirt: 4, team: { name: "Bornova Spor", kit: { primary: "#DC2626", secondary: "#FFFFFF" } } },
    { id: -2, short: "S. Kaya", name: "Serkan Kaya", shirt: 5, team: { name: "Buca Yıldız", kit: { primary: "#FACC15", secondary: "#1E3A8A" } } },
    { id: -3, short: "O. Şahin", name: "Onur Şahin", shirt: 3, team: { name: "Karşıyaka Gençlik", kit: { primary: "#16A34A", secondary: "#DC2626" } } },
    { id: -4, short: "M. Çelik", name: "Murat Çelik", shirt: 6, team: { name: "Altay Gücü", kit: { primary: "#111827", secondary: "#FFFFFF" } } },
  ];
  var juggler = DEFAULT_JUGGLER;
  var rivals = []; // [{ short, team, value }] — value ARTAN
  var passedRivals = 0;
  var rosterSig = "";
  function setRoster(r) {
    var j = r && r.juggler && r.juggler.team ? r.juggler : null;
    var rv = r && Array.isArray(r.rivals) ? r.rivals.filter(function (x) { return x && x.value > 0; }) : [];
    var sig = (j ? j.id : "d") + ":" + rv.map(function (x) { return x.id + "=" + x.value; }).join(",");
    if (sig === rosterSig) return;
    rosterSig = sig;
    juggler = j || DEFAULT_JUGGLER;
    rivals = rv.slice().sort(function (a, b) { return a.value - b.value; });
    if (R) {
      paintCrowd();
      buildJuggler();
    }
  }
  function attr(key) {
    var v = juggler && juggler.attrs ? Number(juggler.attrs[key]) : NaN;
    return Number.isFinite(v) ? A.clamp((A.clamp(v, 50, 99) - 77.5) / 17.5, -1, 1) : 0;
  }
  function kitOf(person) {
    var k = person && person.team && person.team.kit ? person.team.kit : {};
    return { primary: k.primary || "#5B3DF5", secondary: k.secondary || "#FFFFFF" };
  }
  function nextRival() {
    return rivals[passedRivals] || null;
  }
  /** Barajdaki savunmacı: ligin oyuncuları sırayla (kadro yoksa örnek kulüpler). */
  function wallPerson(i) {
    var list = rivals.length ? rivals : FALLBACK_WALL;
    return list[((i % list.length) + list.length) % list.length];
  }

  /* ─────────────── dünya (metre) ─────────────── */
  var BR = 0.22; // top yarıçapı (sahne topu, okunurluk için iri)
  var TOP = 6.6; // tavan (tribün çatısı hizası)
  var GATE_HW = 0.36; // baraj / kale yarı genişliği
  var LEVEL_STEP = 1.42; // omuz üstüne çıkan her savunmacı bu kadar yükseltir
  var GOALS_PER_LEVEL = 10;
  var START_X = 0;

  var W = 390, H = 640;

  /* ─────────────── durum ─────────────── */
  var state = "attract"; // attract | ready | play | dying | over
  var stateT = 0;
  var ball = { x: START_X, y: 3, vy: 0, rot: 0 };
  var gates = [], stars = [], boots = [];
  var nextGateX = 0, gateCount = 0, lastGc = 3;
  var goals = 0, points = 0, combo = 0, bestCombo = 0, level = 1, starCount = 0, taps = 0;
  var shield = 0, invuln = 0;
  var scoreBump = 0, flash = 0, deathT = 0, deathKind = "";
  var passedLine = null;
  var kickT = -9; // başlama vuruşu anı (çizim)
  var uid = 0;

  function diff() {
    return 1 - Math.exp(-goals / 30);
  }
  function gapSize() {
    return 2.15 - 0.6 * diff();
  }
  function spacing() {
    return 3.3 - 0.55 * diff();
  }
  function runSpeed() {
    return 3.1 + 1.5 * diff();
  }
  function gravity() {
    return (14 + 3 * diff()) * (1 - 0.04 * attr("agility"));
  }
  /** Her dokunuşta aynı sıçrama: tepe ~0,62 m yukarıda (boşluğun üçte biri kadar). */
  var FLAP_RISE = 0.62;
  function flapV() {
    return Math.sqrt(2 * gravity() * FLAP_RISE);
  }
  function multiplier() {
    return Math.min(5, 1 + Math.floor(combo / 5));
  }

  /* ─────────────── kapı üretimi ─────────────── */

  function levelAt(n) {
    return 1 + Math.floor(n / GOALS_PER_LEVEL);
  }
  function spawnGate() {
    var lvl = levelAt(gateCount);
    var jumper = lvl >= 3 && Math.random() < Math.min(0.7, 0.35 + (lvl - 3) * 0.1);
    var moving = lvl >= 5 && Math.random() < Math.min(0.6, 0.3 + (lvl - 5) * 0.08);
    var gap = gapSize() + (jumper ? 0.28 : 0) + (moving ? 0.12 : 0);
    var amp = moving ? 0.45 : 0;
    var lo = 1.2 + gap / 2 + amp, hi = TOP - 0.8 - gap / 2 - amp;
    var swing = 1.4 + 1.2 * diff();
    var gc = gateCount < 2 ? 3.1 : A.clamp(lastGc + A.rand(-swing, swing), lo, hi);
    lastGc = gc;
    var g = {
      id: ++uid,
      x: nextGateX,
      gc: gc,
      gap: gap,
      off: 0,
      amp: amp,
      phase: Math.random() * Math.PI * 2,
      jumper: jumper,
      jumpAt: -9,
      passed: false,
      hit: null,
      hitAt: 0,
      netAt: -9,
      wall: gateCount * 3,
    };
    gates.push(g);
    // yıldız: üç kapıda bir boşlukta, arada bir iki kapı arasında
    if (gateCount % 3 === 2) stars.push({ id: ++uid, x: g.x, y: gc + A.rand(-0.25, 0.25) * gap, taken: false, at: 0 });
    else if (gateCount % 4 === 1 && gates.length > 1) {
      var pv = gates[gates.length - 2];
      stars.push({ id: ++uid, x: (pv.x + g.x) / 2, y: (pv.gc + gc) / 2, taken: false, at: 0 });
    }
    // altın krampon: kalkan yoksa ara sıra
    if (gateCount > 6 && gateCount % 13 === 6 && gates.length > 1) {
      var pb = gates[gates.length - 2];
      boots.push({ id: ++uid, x: (pb.x + g.x) / 2, y: (pb.gc + gc) / 2 + 0.2, taken: false, at: 0 });
    }
    gateCount += 1;
    nextGateX += spacing() * A.rand(0.95, 1.08);
  }
  /** Baraj yüksekliği (zıplama ve kayma dahil). */
  function jumpH(g) {
    if (!g.jumper) return 0;
    var t = (A.time - g.jumpAt) / 0.6;
    return t > 0 && t < 1 ? 0.34 * Math.sin(Math.PI * t) : 0;
  }
  function wallTop(g) {
    return g.gc + g.off - g.gap / 2 + jumpH(g);
  }
  function goalBottom(g) {
    return g.gc + g.off + g.gap / 2;
  }

  function resetWorld() {
    ball = { x: START_X, y: 3, vy: 0, rot: 0 };
    gates = [];
    stars = [];
    boots = [];
    nextGateX = START_X + 6.5;
    gateCount = 0;
    lastGc = 3.1;
    while (nextGateX < ball.x + 16) spawnGate();
  }

  /* ─────────────── akış ─────────────── */

  function resize(w, h) {
    W = w;
    H = h;
    if (!gates.length) resetWorld();
    initGL();
    resizeGL();
  }

  function setState(s) {
    state = s;
    stateT = 0;
  }

  function start() {
    goals = 0;
    points = 0;
    combo = 0;
    bestCombo = 0;
    level = 1;
    starCount = 0;
    taps = 0;
    shield = 0;
    invuln = 0;
    passedRivals = 0;
    passedLine = null;
    A.particles.length = 0;
    A.floaters.length = 0;
    A.banner = null;
    resetWorld();
    setState("ready");
    A.sound("whistle");
    A.announce("TOP SEKTİR!", "Dokun: top havalansın · barajı aş");
  }

  /** İlk dokunuş: başlama vuruşu — oyun başlar. */
  function kickoff() {
    setState("play");
    kickT = A.time;
    flap();
  }

  function flap() {
    ball.vy = flapV();
    taps += 1;
    A.sound("kick");
    A.haptic("light");
    if (R) {
      var p = screenOf(ball.x, ball.y - BR, 0);
      A.burst(p.x, p.y, 8, { angle: Math.PI / 2, spread: 1.4, speed: 160, gravity: 300, life: 0.4, size: 3, color: ["#FFFFFF", "#CFE8D6", P.gold], shape: "spark" });
    }
  }

  function scoreGate(g) {
    g.passed = true;
    g.netAt = A.time;
    goals += 1;
    var center = Math.abs(ball.y - (g.gc + g.off)) < g.gap * 0.17 * (1 + 0.15 * attr("control"));
    if (center) {
      combo += 1;
      bestCombo = Math.max(bestCombo, combo);
    } else combo = 0;
    var mult = multiplier();
    var gain = 10 * mult + (center ? 5 : 0);
    points += gain;
    scoreBump = 1;
    var sp = screenOf(ball.x, ball.y + 0.6, 0);
    A.floatText((center ? "TAM ORTA +" : "GOL +") + gain, sp.x, sp.y, center ? P.gold : "#FFFFFF", center ? 22 : 19);
    if (center && combo % 5 === 0) {
      A.floatText("ÇARPAN ×" + multiplier(), W / 2, H * 0.36, P.gold, 24);
      A.sound("level");
      flash = 1;
    } else A.sound("net");
    A.haptic(center ? "medium" : "light");
    // geçtiğin oyuncular
    var rv = nextRival();
    if (rv && goals >= rv.value) {
      passedRivals += 1;
      points += 15;
      passedLine = { text: rv.short + " geçildi · " + rv.value + " gol+asist", age: 0, kit: kitOf(rv) };
      A.sound("coin");
      A.haptic("success");
      if (R) paintCrowd();
    }
    var nl = levelAt(goals);
    if (nl > level) {
      level = nl;
      var sub = "Top hızlanıyor, boşluk daralıyor";
      if (level === 3) sub = "Baraj zıplıyor — erken yüksel";
      else if (level === 5) sub = "Kapılar kayıyor";
      A.announce("SEVİYE " + level, sub);
      A.sound("level");
      A.haptic("success");
      flash = 1;
    }
  }

  function crash(kind, g) {
    if (invuln > 0) return;
    if (shield > 0) {
      // ALTIN KRAMPON kalkanı: çarpışma affedilir
      shield = 0;
      invuln = 1.1;
      flash = 1;
      if (g) {
        g.hit = kind;
        g.hitAt = A.time;
      }
      ball.vy = kind === "direk" ? -2 : flapV();
      A.sound("post");
      A.shake(6);
      A.haptic("medium");
      var sp = screenOf(ball.x, ball.y + 0.5, 0);
      A.floatText("KALKAN!", sp.x, sp.y, P.gold, 22);
      return;
    }
    if (g) {
      g.hit = kind;
      g.hitAt = A.time;
    }
    deathKind = kind;
    setState("dying");
    deathT = 0;
    combo = 0;
    ball.vy = Math.min(ball.vy, kind === "direk" ? -1.5 : 1.5);
    A.sound(kind === "direk" ? "post" : kind === "yer" ? "groan" : "crash");
    A.haptic("error");
    A.shake(9);
  }

  /* ─────────────── güncelleme ─────────────── */

  function update(dt) {
    stateT += dt;
    scoreBump = Math.max(0, scoreBump - dt * 4);
    flash = Math.max(0, flash - dt * 1.8);
    invuln = Math.max(0, invuln - dt);
    if (passedLine) {
      passedLine.age += dt;
      if (passedLine.age > 2.4) passedLine = null;
    }

    if (state === "over") return;
    if (state === "ready") {
      // başlama noktasında süzülür
      ball.y = 3 + Math.sin(A.time * 3) * 0.12;
      ball.vy = 0;
      ball.rot += dt * 1.5;
      return;
    }

    var playing = state === "play";
    var g0 = gravity();
    if (state !== "dying") ball.x += (state === "attract" ? 3.2 : runSpeed()) * dt;
    else ball.x += Math.max(0, 1.2 - deathT) * dt;
    ball.vy -= g0 * dt;
    ball.y += ball.vy * dt;
    ball.rot += (state === "dying" ? 2 : 6) * dt;

    // tavan: çatıdan seker
    if (ball.y > TOP - BR) {
      ball.y = TOP - BR;
      ball.vy = Math.min(ball.vy, -0.5);
    }
    // zemin
    if (ball.y < BR) {
      ball.y = BR;
      if (playing) crash("yer", null);
      else if (state === "attract") {
        ball.vy = flapV();
      } else {
        ball.vy = Math.abs(ball.vy) > 1.2 ? -ball.vy * 0.45 : 0;
      }
    }

    // vitrin: yapay oyuncu sıradaki boşluğa göre dokunur
    if (state === "attract") {
      var ng = null;
      for (var i = 0; i < gates.length; i++)
        if (gates[i].x + GATE_HW > ball.x - BR) {
          ng = gates[i];
          break;
        }
      var want = ng ? ng.gc + ng.off - ng.gap * 0.2 : 3;
      if (ball.vy < 0.5 && ball.y < want) ball.vy = flapV();
    }

    // kapılar
    for (var k = 0; k < gates.length; k++) {
      var g = gates[k];
      if (g.amp) g.off = Math.sin(A.time * 1.5 + g.phase) * g.amp;
      if (g.jumper && g.jumpAt < 0 && g.x - ball.x < 1.7 && g.x > ball.x) g.jumpAt = A.time;
      if (state === "attract" || state === "dying") {
        if (!g.passed && ball.x > g.x + GATE_HW) g.passed = true;
        continue;
      }
      if (!playing) continue;
      var dxg = Math.abs(ball.x - g.x);
      if (dxg < GATE_HW + BR) {
        // daire–dikdörtgen: dikdörtgenin en yakın noktası
        var nx = A.clamp(ball.x, g.x - GATE_HW, g.x + GATE_HW);
        var wt = wallTop(g), gb = goalBottom(g);
        var ny1 = Math.min(ball.y, wt);
        if (Math.hypot(ball.x - nx, ball.y - ny1) < BR * 0.92) crash("baraj", g);
        else {
          var ny2 = Math.max(ball.y, gb);
          if (Math.hypot(ball.x - nx, ball.y - ny2) < BR * 0.92) crash("direk", g);
        }
        if (state !== "play") break;
      }
      if (!g.passed && ball.x > g.x + GATE_HW) scoreGate(g);
    }

    // yıldızlar ve krampon
    if (playing) {
      stars.forEach(function (s) {
        if (!s.taken && Math.hypot(ball.x - s.x, ball.y - s.y) < BR + 0.28) {
          s.taken = true;
          s.at = A.time;
          starCount += 1;
          points += 5;
          scoreBump = 0.7;
          A.sound("coin");
          var sp = screenOf(s.x, s.y, 0);
          A.burst(sp.x, sp.y, 12, { speed: 180, gravity: 120, life: 0.5, size: 3, color: [P.gold, "#FFF"], shape: "spark" });
        }
      });
      boots.forEach(function (b) {
        if (!b.taken && Math.hypot(ball.x - b.x, ball.y - b.y) < BR + 0.32) {
          b.taken = true;
          b.at = A.time;
          shield = 1;
          A.sound("level");
          A.haptic("success");
          var sp = screenOf(b.x, b.y + 0.4, 0);
          A.floatText("ALTIN KRAMPON · KALKAN", sp.x, sp.y, P.gold, 18);
        }
      });
    }

    if (state === "dying") {
      deathT += dt;
      if (deathT > 1.3) {
        setState("over");
        A.sound("over");
        A.send("over", {
          score: points,
          stats: { goals: goals, level: level, bestCombo: bestCombo, stars: starCount, passed: passedRivals, rivals: rivals.length, taps: taps },
        });
      }
    }

    // temizlik ve üretim
    var cut = ball.x - 8;
    gates = gates.filter(function (o) {
      return o.x > cut;
    });
    stars = stars.filter(function (o) {
      return o.x > cut;
    });
    boots = boots.filter(function (o) {
      return o.x > cut;
    });
    while (nextGateX < ball.x + 16) spawnGate();
    if (state === "attract" && ball.x > 4000) resetWorld();
  }

  /* ─────────────── girdi ─────────────── */

  function down() {
    if (state === "ready") {
      kickoff();
      return;
    }
    if (state === "play") flap();
  }

  /* ═══════════════════════════ 3B ÇİZİM ═══════════════════════════ */

  var K = A.T3;
  var R = null;
  var glFailed = false;
  var tmpV = null;
  var CAM_D = 11.5, CAM_Y = 5.0, LOOK_Y = 3.2, LOOK_AHEAD = 1.6; // yandan, hafif yukarıdan yayın kamerası
  var SEG = 44, SEGS = 4; // tribün parçaları (yol boyunca dönüşümlü)
  var STAND_Z = -7.5;
  var STRIP = 140;

  function screenOf(x, y, z) {
    if (!R) return { x: W * 0.3, y: H * 0.5, s: 40 };
    tmpV.set(x, y, z);
    var dist = R.camera.position.distanceTo(tmpV);
    tmpV.project(R.camera);
    var s = H / (2 * Math.tan((R.camera.fov * Math.PI) / 360) * Math.max(0.3, dist));
    return { x: (tmpV.x * 0.5 + 0.5) * W, y: (-tmpV.y * 0.5 + 0.5) * H, s: s };
  }

  function hasWebGL() {
    try {
      var cv = document.getElementById("gl");
      if (!cv || !T || !K || !cv.getContext) return false;
      var gl = cv.getContext("webgl2") || cv.getContext("webgl");
      if (!gl || typeof gl.getParameter !== "function") return false;
      var v = gl.getParameter(gl.VERSION);
      return typeof v === "string" && v.length > 0;
    } catch (e) {
      return false;
    }
  }

  function initGL() {
    if (R || glFailed) return;
    if (!hasWebGL()) {
      glFailed = true;
      return;
    }
    try {
      var renderer = new T.WebGLRenderer({ canvas: document.getElementById("gl"), antialias: true, powerPreference: "high-performance", stencil: false });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = T.PCFSoftShadowMap;
      renderer.toneMapping = T.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.0;
      renderer.outputColorSpace = T.SRGBColorSpace;
      K.init(renderer);
      var scene = new T.Scene();
      scene.background = new T.Color(0x070b1e);
      scene.fog = new T.Fog(0x121a3c, 30, 90);
      tmpV = new T.Vector3();
      R = {
        renderer: renderer,
        scene: scene,
        camera: new T.PerspectiveCamera(40, 1, 0.1, 700),
        U: { time: { value: 0 }, excite: { value: 0 } },
        gates: new Map(),
        stars: new Map(),
        boots: new Map(),
        idle: {}, // savunmacı havuzu: kişi → boştaki sporcular
      };
      S3.atmosphere(R);
      buildLights();
      buildWorld();
      R.ball = S3.ball(BR);
      R.ballShadow = S3.blob(BR * 3, 0.5);
      buildJuggler();
      paintCrowd();
      resizeGL();
    } catch (e) {
      R = null;
      glFailed = true;
    }
  }

  function resizeGL() {
    if (!R) return;
    R.renderer.setSize(W, H, false);
    var cv = R.renderer.domElement;
    if (cv && cv.style) {
      cv.style.width = W + "px";
      cv.style.height = H + "px";
    }
    R.camera.aspect = W / Math.max(1, H);
    // dikeyde zeminden tavana (~8 m) sığsın; çok geniş ekranda yatay sınırla
    var vfov = (2 * Math.atan(4.9 / CAM_D) * 180) / Math.PI;
    var hfovNeed = (2 * Math.atan(7 / CAM_D / R.camera.aspect) * 180) / Math.PI;
    R.camera.fov = Math.min(vfov, Math.max(28, hfovNeed));
    R.camera.updateProjectionMatrix();
  }

  function buildLights() {
    var s = R.scene;
    s.add(new T.HemisphereLight(0x9fb4ff, 0x1d3a22, 0.55));
    var key = new T.DirectionalLight(0xfff4e0, 2.3);
    key.castShadow = true;
    key.shadow.mapSize.set(1536, 1536);
    var sc = key.shadow.camera;
    sc.left = -10;
    sc.right = 10;
    sc.top = 10;
    sc.bottom = -4;
    sc.near = 2;
    sc.far = 60;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.02;
    s.add(key);
    s.add(key.target);
    var fill = new T.DirectionalLight(0xdfe8ff, 0.7);
    fill.position.set(-20, 18, 25);
    s.add(fill);
    var rim = new T.DirectionalLight(0xb9c8ff, 0.8);
    rim.position.set(10, 14, -30);
    s.add(rim);
    R.key = key;
  }

  /** Saha şeridi, panolar, tribünler, uzak projektörler. */
  function buildWorld() {
    var s = R.scene;
    // çim: biçme bantları x boyunca (5 m), kenar çizgisi
    var grass = K.canvasTex(512, 256, function (c, cw, ch) {
      c.fillStyle = "#2f8a47";
      c.fillRect(0, 0, cw, ch);
      c.fillStyle = "#378f4d";
      c.fillRect(0, 0, cw / 2, ch);
      var rand = A.seeded(5);
      for (var n = 0; n < 7000; n++) {
        c.fillStyle = rand() < 0.5 ? "rgba(255,255,255,0.04)" : "rgba(0,20,0,0.07)";
        c.fillRect(rand() * cw, rand() * ch, 1, 1 + rand() * 2);
      }
      // kenar çizgisi (dokunun alt bölümünde, z ≈ −3)
      c.fillStyle = "rgba(246,248,240,0.95)";
      c.fillRect(0, ch * 0.2, cw, ch * 0.012);
    }, true);
    grass.repeat.set(STRIP / 10, 1);
    var gN = S3.grassNormal();
    gN.repeat.set(STRIP / 3, 14 / 3);
    var ground = K.mesh(new T.PlaneGeometry(STRIP, 18), K.std(0xffffff, 0.9, 0, { map: grass, normalMap: gN, normalScale: new T.Vector2(0.55, 0.55), envMapIntensity: 0.35 }), false, true);
    ground.rotation.x = -Math.PI / 2;
    ground.position.z = 1;
    s.add(ground);
    R.ground = ground;
    R.grass = grass;
    R.grassN = gN;
    // koyu pist + LED panolar (tribün önü)
    var track = K.mesh(new T.PlaneGeometry(STRIP, 3), K.std(0x16251e, 0.95), false, true);
    track.rotation.x = -Math.PI / 2;
    track.position.set(0, 0.004, STAND_Z + 1.6);
    s.add(track);
    R.track = track;
    R.boardTex = K.canvasTex(2048, 64, function () {}, true);
    R.boardTex.repeat.set(STRIP / 40, 1);
    var boardMat = new T.MeshBasicMaterial({ map: R.boardTex, toneMapped: false });
    var dark = K.std(0x111827, 0.6);
    var board = K.mesh(new T.BoxGeometry(STRIP, 0.95, 0.2), [dark, dark, dark, dark, boardMat, dark], true, true);
    board.position.set(0, 0.475, STAND_Z + 3.2);
    s.add(board);
    R.board = board;
    R.boardText = "";
    // tribünler: ortak stadyumun parçaları, oyuncunun tarafında ev sahibi seyirci
    R.stands = [];
    for (var k = 0; k < SEGS; k++) {
      var seg = S3.standSegment(SEG, {
        seed: 61 + k,
        density: 0.9,
        seamless: true,
        side: function (lx) {
          return lx < 0 ? 1 : (lx * 7) % 3 < 1 ? 0 : 1;
        },
      });
      seg.position.z = STAND_Z;
      s.add(seg);
      R.stands.push(seg);
    }
    // uzak projektör kuleleri (çatı üstü)
    var glowMat = new T.SpriteMaterial({ map: K.glowTexture(), color: 0xfff1d6, transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: 0.85, fog: false });
    R.lamps = [];
    for (var i = 0; i < 3; i++) {
      var gl = new T.Sprite(glowMat);
      gl.scale.set(26, 26, 1);
      s.add(gl);
      R.lamps.push(gl);
    }
    // ortak kapı malzemeleri
    var net = S3.netTexture();
    net.repeat.set(4, 6);
    R.mat = {
      post: new T.MeshPhysicalMaterial({ color: 0xf4f6f9, roughness: 0.22, metalness: 0.05, clearcoat: 0.6, clearcoatRoughness: 0.15 }),
      net: new T.MeshStandardMaterial({ map: net, transparent: true, alphaTest: 0.08, side: T.DoubleSide, roughness: 0.9, depthWrite: false, envMapIntensity: 0.3 }),
      star: new T.MeshStandardMaterial({ color: 0xffd24a, emissive: 0x8a5a00, emissiveIntensity: 0.7, roughness: 0.25, metalness: 0.85 }),
      boot: new T.MeshStandardMaterial({ color: 0xffc83d, emissive: 0x6b4a00, emissiveIntensity: 0.6, roughness: 0.2, metalness: 0.95 }),
      glow: new T.SpriteMaterial({ map: K.glowTexture(), color: 0xffd24a, transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: 0.6 }),
    };
    R.geo = {
      post: new T.CylinderGeometry(0.06, 0.06, 1, 16),
      bar: new T.CylinderGeometry(0.06, 0.06, GATE_HW * 2 + 0.12, 16),
      knob: new T.SphereGeometry(0.06, 12, 8),
      net: new T.PlaneGeometry(GATE_HW * 2, 1),
      star: starGeometry(),
      boot: bootGeometry(),
    };
  }

  /** Beş köşeli yıldız (ekstrüde). */
  function starGeometry() {
    var sh = new T.Shape();
    for (var i = 0; i < 10; i++) {
      var r = i % 2 ? 0.11 : 0.26, a = (i / 10) * Math.PI * 2 + Math.PI / 2;
      if (i === 0) sh.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else sh.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    sh.closePath();
    var g = new T.ExtrudeGeometry(sh, { depth: 0.06, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 2 });
    g.center();
    return g;
  }
  /** Krampon: taban + gövde + krampon dişleri (basit, okunur). */
  function bootGeometry() {
    var sh = new T.Shape();
    sh.moveTo(-0.24, 0);
    sh.lineTo(0.22, 0);
    sh.quadraticCurveTo(0.3, 0.02, 0.28, 0.08);
    sh.lineTo(0.06, 0.12);
    sh.lineTo(-0.02, 0.26);
    sh.lineTo(-0.2, 0.26);
    sh.lineTo(-0.24, 0.1);
    sh.closePath();
    var g = new T.ExtrudeGeometry(sh, { depth: 0.12, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.015, bevelSegments: 2 });
    g.center();
    return g;
  }

  function paintCrowd() {
    if (!R) return;
    var nr = nextRival();
    S3.paintCrowd(kitOf(juggler), nr ? kitOf(nr) : { primary: "#1E293B", secondary: "#F8FAFC" });
    S3.paintLed(kitOf(juggler).primary, nr ? kitOf(nr).primary : "#5B3DF5");
  }

  function paintBoards(text) {
    if (text === R.boardText) return;
    R.boardText = text;
    var c = R.boardTex.userData.ctx, cw = R.boardTex.userData.canvas.width, ch = R.boardTex.userData.canvas.height;
    var g = c.createLinearGradient(0, 0, 0, ch);
    g.addColorStop(0, "#3B1FD1");
    g.addColorStop(1, "#1E0F7A");
    c.fillStyle = g;
    c.fillRect(0, 0, cw, ch);
    c.font = "900 38px " + A.FONT;
    c.textBaseline = "middle";
    c.fillStyle = "#FFFFFF";
    var unit = c.measureText(text).width || 200;
    for (var x = 0; x < cw; x += unit) c.fillText(text, x, ch * 0.55);
    c.fillStyle = "rgba(0,0,0,0.2)";
    for (var y = 1; y < ch; y += 3) c.fillRect(0, y, cw, 1);
    R.boardTex.needsUpdate = true;
  }

  /* ── oyuncular ── */

  function buildJuggler() {
    if (R.juggler) {
      R.scene.remove(R.juggler.root);
      K.disposeTree(R.juggler.root);
    }
    R.juggler = K.makeAthlete(juggler, { keeper: false });
    R.scene.add(R.juggler.root);
  }
  /** Havuzdan bir savunmacı (aynı kişi için yeniden kullanılır). */
  function takeDefender(person) {
    var key = String(person.id) + ":" + kitOf(person).primary;
    var list = R.idle[key] || (R.idle[key] = []);
    var a = list.pop();
    if (!a) {
      a = K.makeAthlete(person, { keeper: false, detail: "lo" });
      a.poolKey = key;
      R.scene.add(a.root);
    }
    a.root.visible = true;
    return a;
  }
  function freeDefender(a) {
    a.root.visible = false;
    R.idle[a.poolKey].push(a);
  }

  /** Kapı görseli: savunmacı kulesi (aşağıda) + ters asılı kale (yukarıda). */
  function makeGate(g) {
    var grp = new T.Group();
    var M = R.mat, G = R.geo;
    // ters kale: iki direk yukarı, üst direk (aşağıda) yatay, arkada file
    var goal = new T.Group();
    var pl = K.mesh(G.post, M.post), pr = K.mesh(G.post, M.post);
    pl.position.x = -GATE_HW;
    pr.position.x = GATE_HW;
    var bar = K.mesh(G.bar, M.post);
    bar.rotation.z = Math.PI / 2;
    var kl = K.mesh(G.knob, M.post), kr = K.mesh(G.knob, M.post);
    kl.position.x = -GATE_HW - 0.06;
    kr.position.x = GATE_HW + 0.06;
    var net = K.mesh(G.net, M.net, false, false);
    net.position.z = -0.35;
    var side1 = K.mesh(new T.PlaneGeometry(0.35, 1), M.net, false, false);
    side1.rotation.y = Math.PI / 2;
    side1.position.set(-GATE_HW, 0, -0.175);
    var side2 = side1.clone();
    side2.position.x = GATE_HW;
    goal.add(pl, pr, bar, kl, kr, net, side1, side2);
    goal.userData = { posts: [pl, pr], net: net, sides: [side1, side2] };
    grp.add(goal);
    grp.userData = { goal: goal, men: [] };
    R.scene.add(grp);
    return grp;
  }
  function syncGate(g, m) {
    m.position.set(g.x, 0, 0);
    // kale: üst direk boşluğun üstünde, direkler tavana
    var gb = goalBottom(g), len = TOP + 2.5 - gb;
    var u = m.userData.goal.userData;
    m.userData.goal.position.y = gb;
    u.posts.forEach(function (p) {
      p.scale.y = len;
      p.position.y = len / 2;
    });
    // gol olunca file dalgalanır
    var wob = Math.max(0, 1 - (A.time - g.netAt) / 0.8);
    u.net.scale.y = len;
    u.net.position.y = len / 2;
    u.net.position.z = -0.35 - Math.sin((A.time - g.netAt) * 18) * 0.12 * wob;
    u.sides.forEach(function (sd) {
      sd.scale.y = len;
      sd.position.y = len / 2;
    });
    // direğe çarpınca kale sallanır
    var shake = g.hit === "direk" ? Math.max(0, 1 - (A.time - g.hitAt) / 0.6) : 0;
    m.userData.goal.rotation.z = Math.sin((A.time - g.hitAt) * 30) * 0.05 * shake;

    // baraj kulesi: k kat; en üstteki savunmacının pozu tepe yüksekliğine uyar
    var hb = wallTop(g);
    var baseH = g.gc + g.off - g.gap / 2; // zıplamasız
    var k = 1 + Math.floor(Math.max(0, baseH - 1.25) / LEVEL_STEP);
    k = Math.min(4, k);
    var men = m.userData.men;
    while (men.length < k) men.push(takeDefender(wallPerson(g.wall + men.length)));
    while (men.length > k) freeDefender(men.pop());
    var knocked = g.hit === "baraj" ? A.clamp((A.time - g.hitAt) / 0.5, 0, 1) : 0;
    for (var i = 0; i < k; i++) {
      var a = men[i], J = a.J;
      K.rest(a);
      var top = i === k - 1;
      a.root.position.set(g.x + Math.sin(i * 1.7 + g.id) * 0.03, LEVEL_STEP * i, 0);
      a.root.rotation.y = -0.15; // kameraya (+z) dönük, hafif topa
      if (!top) {
        // alttakiler: üstündekinin baldırlarını tutar, dizler hafif bükük
        J.sha.rotation.x = -2.3;
        J.shb.rotation.x = -2.3;
        J.ela.rotation.x = -0.9;
        J.elb.rotation.x = -0.9;
        J.kna.rotation.x = J.knb.rotation.x = 0.15;
        J.hpa.rotation.z = 0.12;
        J.hpb.rotation.z = -0.12;
        J.head.rotation.x = -0.2;
        continue;
      }
      var hr = hb - LEVEL_STEP * i;
      var crouch = A.clamp((1.78 - hr) / 0.6, 0, 0.9);
      var arms = A.clamp((hr - 1.78) / 0.5, 0, 1);
      var lift = Math.max(0, hr - 2.28);
      J.hips.position.y = 0.94 - crouch * 0.42;
      J.hpa.rotation.x = J.hpb.rotation.x = -0.9 * crouch;
      J.kna.rotation.x = J.knb.rotation.x = 1.8 * crouch + (lift > 0 ? 0.25 : 0);
      J.fta.rotation.x = J.ftb.rotation.x = -0.6 * crouch + (lift > 0 ? 0.5 : 0);
      J.spine.rotation.x = 0.35 * crouch;
      J.hpa.rotation.z = 0.18;
      J.hpb.rotation.z = -0.18;
      // kollar: alçakta yanda, yüksekte havada (top kesme)
      J.sha.rotation.z = A.lerp(0.5, 0.25, arms);
      J.shb.rotation.z = -A.lerp(0.5, 0.25, arms);
      J.sha.rotation.x = A.lerp(-0.3, -2.9, arms);
      J.shb.rotation.x = A.lerp(-0.3, -2.9, arms);
      J.head.rotation.x = -0.15 - 0.2 * arms;
      a.root.position.y += lift;
      if (knocked > 0) {
        a.root.rotation.z = knocked * 1.1;
        a.root.position.x += knocked * 0.6;
        a.root.position.y = Math.max(0, a.root.position.y - knocked * 1.5);
      }
    }
  }
  function dropGate(m) {
    m.userData.men.forEach(freeDefender);
    m.userData.men = [];
    R.scene.remove(m);
  }

  function syncPools() {
    var seen = new Set();
    gates.forEach(function (g) {
      seen.add(g.id);
      var m = R.gates.get(g.id);
      if (!m) {
        m = makeGate(g);
        R.gates.set(g.id, m);
      }
      syncGate(g, m);
    });
    R.gates.forEach(function (m, id) {
      if (seen.has(id)) return;
      dropGate(m);
      R.gates.delete(id);
    });
    syncItems(stars, R.stars, function () {
      var grp = new T.Group();
      grp.add(K.mesh(R.geo.star, R.mat.star));
      var gl = new T.Sprite(R.mat.glow);
      gl.scale.set(1.1, 1.1, 1);
      grp.add(gl);
      return grp;
    });
    syncItems(boots, R.boots, function () {
      var grp = new T.Group();
      var b = K.mesh(R.geo.boot, R.mat.boot);
      grp.add(b);
      var gl = new T.Sprite(R.mat.glow);
      gl.scale.set(1.4, 1.4, 1);
      grp.add(gl);
      return grp;
    });
  }
  function syncItems(list, pool, make) {
    var seen = new Set();
    list.forEach(function (it) {
      seen.add(it.id);
      var m = pool.get(it.id);
      if (!m) {
        m = make();
        R.scene.add(m);
        pool.set(it.id, m);
      }
      var t = it.taken ? A.clamp((A.time - it.at) / 0.3, 0, 1) : 0;
      m.visible = t < 1;
      m.position.set(it.x, it.y + Math.sin(A.time * 3 + it.id) * 0.08 + t * 0.8, 0);
      m.rotation.y = A.time * 2.5 + it.id;
      m.scale.setScalar(1 + t);
    });
    pool.forEach(function (m, id) {
      if (seen.has(id)) return;
      R.scene.remove(m);
      pool.delete(id);
    });
  }

  /** Başlama vuruşu yapan oyuncu: topun yanında bekler, ilk dokunuşta vurur. */
  function poseJuggler() {
    var a = R.juggler, J = a.J;
    K.rest(a);
    a.root.position.set(START_X - 0.55, 0, 0.15);
    a.root.rotation.y = Math.PI / 2 - 0.25; // topa (+x) dönük
    var k = A.time - kickT;
    if (state === "play" || state === "dying" || state === "over") {
      if (k < 0.6 && k >= 0) {
        // vuruş: bacak geri → öne, kollar denge
        var sw = A.smooth(A.clamp(k / 0.18, 0, 1)), rec = A.smooth(A.clamp((k - 0.25) / 0.35, 0, 1));
        J.hpb.rotation.x = A.lerp(A.lerp(0.6, -1.3, sw), 0, rec);
        J.knb.rotation.x = A.lerp(A.lerp(1.4, 0.1, sw), 0.1, rec);
        J.sha.rotation.z = 1.0 * (1 - rec);
        J.shb.rotation.x = -0.6 * (1 - rec);
        J.spine.rotation.x = -0.1 * sw * (1 - rec);
      } else {
        // topun ardından bakar, alkışlar
        J.head.rotation.y = 0.4;
        J.sha.rotation.x = J.shb.rotation.x = -1.2;
        J.ela.rotation.x = J.elb.rotation.x = -1.2 - Math.max(0, Math.sin(A.time * 12)) * 0.25;
      }
      return;
    }
    // hazır: topu izler, hafif yaylanır
    J.hips.position.y = 0.94 - 0.03 + Math.max(0, Math.sin(A.time * 4)) * 0.02;
    J.kna.rotation.x = J.knb.rotation.x = 0.15;
    J.spine.rotation.x = 0.1;
    J.head.rotation.x = -0.25;
  }

  /* ── kamera + sahne ── */

  var camX = null;
  function sync(dt) {
    var c = R.camera;
    var want = ball.x + LOOK_AHEAD;
    if (camX == null || state === "ready") camX = want;
    else camX = state === "dying" ? A.damp(camX, want, 2, dt) : want;
    var sx = 0, sy = 0;
    if (A.shakeAmt > 0.2) {
      sx = (Math.random() - 0.5) * A.shakeAmt * 0.012;
      sy = (Math.random() - 0.5) * A.shakeAmt * 0.012;
    }
    c.position.set(camX + sx, CAM_Y + sy, CAM_D);
    c.lookAt(camX, LOOK_Y, 0);

    // akan şeritler
    R.ground.position.x = camX;
    R.grass.offset.x = ((camX % 10) / 10) % 1;
    R.grassN.offset.x = ((camX % 3) / 3) % 1;
    R.track.position.x = camX;
    R.board.position.x = camX;
    R.boardTex.offset.x = (A.time * 0.04 + camX / 40) % 1;
    var first = Math.floor((camX - SEG * 1.5) / SEG);
    for (var j = 0; j < SEGS; j++) {
      var slot = first + j;
      R.stands[((slot % SEGS) + SEGS) % SEGS].position.x = slot * SEG + SEG / 2;
    }
    R.lamps.forEach(function (l, i) {
      var sp = 34, base = Math.floor(camX / sp) * sp;
      l.position.set(base + (i - 1) * sp, 30, STAND_Z - 26);
    });
    R.sky.position.set(camX, 0, 0);
    R.key.position.set(camX + 6, 16, 12);
    R.key.target.position.set(camX, 0, 0);
    R.U.time.value = A.time;
    R.U.excite.value = A.clamp(R.U.excite.value + ((combo >= 5 || flash > 0.3 ? 1 : 0) - R.U.excite.value) * Math.min(1, dt * 2), 0, 1);
    var nr = nextRival();
    paintBoards("ELİTLİG ARENA   •   TOP SEKTİR   •   " + String(juggler.short || "").toLocaleUpperCase("tr-TR") + (nr ? "   •   HEDEF: " + String(nr.short || "").toLocaleUpperCase("tr-TR") : "") + "   •   ");

    // top
    R.ball.position.set(ball.x, ball.y, 0);
    R.ball.rotation.set(0, 0, -ball.rot);
    R.ball.visible = !(invuln > 0 && Math.sin(A.time * 40) > 0.3);
    R.ballShadow.position.set(ball.x, 0.006, 0);
    R.ballShadow.material.opacity = 0.5 * A.clamp(1 - ball.y / 5, 0.12, 1);

    syncPools();
    poseJuggler();
  }

  /* ═══════════════════════════ ÇİZİM GİRİŞİ ═══════════════════════════ */

  var perf = { acc: 0, n: 0, step: 0 };
  function adaptQuality(dt) {
    if (!dt || perf.step >= 2 || state === "attract") return;
    perf.acc += dt;
    perf.n += 1;
    if (perf.acc < 2) return;
    var avg = perf.acc / perf.n;
    perf.acc = 0;
    perf.n = 0;
    if (avg < 0.024) return;
    perf.step += 1;
    if (perf.step === 1) {
      R.renderer.setPixelRatio(1);
      resizeGL();
    } else {
      R.renderer.shadowMap.enabled = false;
      R.scene.traverse(function (o) {
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { m.needsUpdate = true; });
      });
    }
  }

  function render(c, dt) {
    if (R) {
      try {
        adaptQuality(dt);
        sync(dt);
        K.syncAll();
        R.renderer.render(R.scene, R.camera);
      } catch (e) {
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
    drawVignette(c);
    if (R && (state === "play" || state === "attract")) drawWallLabels(c);
    A.drawParticles(c);
    A.drawFloaters(c, dt);
    if (state !== "attract") drawHud(c);
    if (state === "ready") drawReady(c);
    if (state === "dying" || state === "over") drawDeath(c);
    A.drawBanner(c, W, H * 0.24, dt);
    if (flash > 0) {
      c.fillStyle = "rgba(255,210,74," + (0.12 * flash).toFixed(3) + ")";
      c.fillRect(0, 0, W, H);
    }
  }

  /* ═══════════════════════════ HUD ═══════════════════════════ */

  var vignetteLayer = null;
  function drawVignette(c) {
    if (!vignetteLayer || vignetteLayer.w !== W || vignetteLayer.h !== H) {
      vignetteLayer = A.layer(W, H);
      A.paintVignette(vignetteLayer.ctx, W, H, 0.4);
      A.paintTopScrim(vignetteLayer.ctx, W, 150);
    }
    A.blit(vignetteLayer);
  }

  /** Ad soyad; sığmazsa "A. Soyadı", o da sığmazsa "…" ile kısaltılır. */
  function fitName(c, who, max) {
    var full = String(who.name || who.short || "").trim();
    if (c.measureText(full).width <= max) return full;
    var t = String(who.short || full);
    if (c.measureText(t).width <= max) return t;
    while (t.length > 2 && c.measureText(t + "…").width > max) t = t.slice(0, -1);
    return t + "…";
  }

  /** Yaklaşan barajın tepesinde savunmacının numarası + adı. */
  function drawWallLabels(c) {
    c.save();
    c.textAlign = "center";
    c.textBaseline = "middle";
    gates.forEach(function (g) {
      var d = g.x - ball.x;
      if (d < 0.4 || d > 5.5 || g.hit) return;
      var men = Math.min(4, 1 + Math.floor(Math.max(0, g.gc + g.off - g.gap / 2 - 1.25) / LEVEL_STEP));
      var who = wallPerson(g.wall + men - 1);
      var p = screenOf(g.x, wallTop(g) + 0.32, 0.3);
      c.font = A.font(10, 800);
      var label = fitName(c, who, Math.min(140, W * 0.36));
      var num = who.shirt ? String(who.shirt) : "";
      var tw = c.measureText(label).width, nw = num ? 20 : 0;
      var bw = tw + nw + 12, bx = p.x - bw / 2;
      c.globalAlpha = A.clamp((5.5 - d) / 1.2, 0, 1) * A.clamp((d - 0.4) / 0.6, 0, 1);
      A.roundRect(c, bx, p.y - 10, bw, 20, 6);
      c.fillStyle = "rgba(8,10,30,0.8)";
      c.fill();
      if (num) {
        A.roundRect(c, bx + 3, p.y - 7, 18, 14, 4);
        c.fillStyle = kitOf(who).primary;
        c.fill();
        c.font = A.font(9, 900);
        c.fillStyle = "#FFFFFF";
        c.fillText(num, bx + 12, p.y + 0.5);
        c.font = A.font(10, 800);
      }
      c.fillStyle = "#FFFFFF";
      c.fillText(label, bx + nw + 6 + tw / 2, p.y + 0.5);
    });
    c.restore();
  }

  function drawHud(c) {
    // büyük gol sayacı (ortada, Flappy gibi)
    c.save();
    var s = 1 + 0.22 * scoreBump;
    c.translate(W / 2, 62);
    c.scale(s, s);
    A.bigText(c, String(goals), 0, 0, 46, "#FFFFFF", { stroke: "rgba(8,10,30,0.85)" });
    c.restore();
    c.save();
    c.textAlign = "center";
    c.font = A.font(10, 900);
    c.fillStyle = "rgba(255,255,255,0.75)";
    if ("letterSpacing" in c) c.letterSpacing = "2px";
    c.fillText("GOL", W / 2, 96);
    if ("letterSpacing" in c) c.letterSpacing = "0px";
    c.restore();
    // puan (sol), seviye + kalkan (sağ)
    c.save();
    var pts = "PUAN " + points.toLocaleString("tr-TR");
    c.font = A.font(12, 900);
    var pw = c.measureText(pts).width + 22;
    A.pill(c, 14, 18, pw, 26, "rgba(9,11,32,0.72)");
    c.fillStyle = scoreBump > 0.2 ? P.gold : "#FFFFFF";
    c.textBaseline = "middle";
    c.textAlign = "left";
    c.fillText(pts, 25, 31.5);
    var mult = multiplier();
    if (mult > 1) {
      var ml = "×" + mult;
      var mw = c.measureText(ml).width + 18;
      A.pill(c, 14, 50, mw, 24, "rgba(60,36,200,0.85)");
      c.fillStyle = P.gold;
      c.fillText(ml, 23, 62.5);
    }
    var lv = "SEVİYE " + level;
    var lw = c.measureText(lv).width + 22;
    A.pill(c, W - 14 - lw, 18, lw, 26, "rgba(60,36,200,0.75)");
    c.fillStyle = "#FFFFFF";
    c.textAlign = "center";
    c.fillText(lv, W - 14 - lw / 2, 31.5);
    if (shield) {
      A.pill(c, W - 14 - 96, 50, 96, 24, "rgba(255,210,74,0.9)");
      c.fillStyle = "#0B1030";
      c.font = A.font(10, 900);
      c.fillText("KALKAN AKTİF", W - 14 - 48, 62.5);
    }
    c.restore();
    // sıradaki hedef / geçilen oyuncu
    var nr = nextRival();
    if (passedLine) drawStrip(c, passedLine.text, passedLine.kit.primary, A.clamp((2.4 - passedLine.age) / 0.3, 0, 1), P.gold);
    else if (nr && state === "play") drawStrip(c, "Sıradaki: " + nr.short + " · " + nr.value + " gol+asist", kitOf(nr).primary, 0.9, "#FFFFFF");
  }
  function drawStrip(c, text, color, alpha, ink) {
    c.save();
    c.globalAlpha = alpha;
    c.font = A.font(11.5, 800);
    var tw = Math.min(W - 40, c.measureText(text).width + 28);
    var x = W / 2 - tw / 2, y = 108;
    A.roundRect(c, x, y, tw, 26, 9);
    c.fillStyle = "rgba(9,11,32,0.78)";
    c.fill();
    c.fillStyle = color;
    c.fillRect(x, y + 5, 4, 16);
    c.fillStyle = ink;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(text, W / 2 + 2, y + 13.5);
    c.restore();
  }
  function drawReady(c) {
    var y = H * 0.68;
    var a = 0.75 + 0.25 * Math.sin(A.time * 4);
    c.save();
    c.globalAlpha = a;
    // dokunan parmak
    var p = screenOf(ball.x, ball.y - 0.9, 0);
    c.strokeStyle = "rgba(255,255,255,0.8)";
    c.lineWidth = 3;
    var r = 12 + 6 * (A.time % 1);
    c.beginPath();
    c.arc(p.x, p.y, r, 0, Math.PI * 2);
    c.stroke();
    c.font = A.font(13, 900);
    var text = "Dokun: başlama vuruşu";
    var w = c.measureText(text).width + 30;
    A.pill(c, W / 2 - w / 2, y - 15, w, 30, "rgba(9,11,32,0.78)");
    c.fillStyle = "#FFFFFF";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(text, W / 2, y + 0.5);
    c.globalAlpha = 0.8;
    c.font = A.font(11, 700);
    c.fillText("Her dokunuş topu havalandırır · barajın üstünden, kalenin altından geç", W / 2, y + 30);
    c.restore();
  }
  var DEATH = { baraj: "BARAJA TAKILDI", direk: "DİREKTEN DÖNDÜ", yer: "TOP YERDE" };
  function drawDeath(c) {
    var t = state === "dying" ? deathT : 1.3 + stateT;
    var pop = A.easeOutBack(Math.min(1, t / 0.35));
    c.save();
    c.globalAlpha = A.clamp(t / 0.2, 0, 1);
    A.bigText(c, DEATH[deathKind] || "", W / 2, H * 0.42, 30 * (0.6 + 0.4 * pop), "#FFFFFF", { stroke: "rgba(160,20,50,0.9)" });
    c.restore();
  }

  function debug() {
    return {
      state: state, death: deathKind, goals: goals, points: points, level: level, combo: combo, ball: ball, gates: gates, stars: stars, boots: boots, shield: shield,
      speed: runSpeed(), gap: gapSize(), g: gravity(), flap: flapV(), juggler: juggler.short, passed: passedRivals, gl: !!R, wallTop: wallTop, goalBottom: goalBottom, BR: BR, TOP: TOP, GATE_HW: GATE_HW, fitName: fitName,
    };
  }

  A.register({ resize: resize, start: start, update: update, render: render, down: down, debug: debug, setRoster: setRoster });
})();
