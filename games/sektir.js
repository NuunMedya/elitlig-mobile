/*
 * TOP SEKTİR 3B — FREESTYLE. Ligin gerçek oyuncusuyla, stadyumun ortasında
 * topu yere düşürmeden sektir; sekme sayınla ligin oyuncularını geride bırak.
 *
 * MİMARİ: simülasyon (top fiziği, dokunma kuralları, puan) çizimden
 * bağımsızdır; başsız testler (scripts/check-games.mjs) yalnız onu koşturur.
 * Çizim: ortak gece stadyumu (games/stadium3d.js) + gerçek insan modeli
 * (games/three-kit.js) + saydam 2B HUD.
 *
 * TEK KURAL, DERİN RİTİM — top gerçek yerçekimiyle düşer, ZAMANLAMA her şeydir:
 *   · Ekranın SOL yarısına dokun: soldaki ayak/diz; SAĞ yarısına: sağdaki.
 *   · Dokunduğun anda topun YÜKSEKLİĞİ hangi bölgeyle vurduğunu belirler:
 *       AYAK (yere yakın, 1 puan) · DİZ (bel altı, 2 puan) · KAFA (baş hizası,
 *       3 puan). Bölge dışında dokunmak boşa gider (ERKEN / GEÇ) — top düşmeye
 *       devam eder, bir şansın daha var.
 *   · Topun etrafındaki HALKA kapanırken dokun: ideal yükseklik MÜKEMMEL'dir.
 *     Mükemmel vuruş topu tam üstüne geri getirir; kötü vuruş topu yana ve
 *     öne savurur, oyuncu yetişmek için koşar.
 *   · DOKUN VE YUKARI İT: ayak/diz vuruşunu YÜKSEK topa çevirir (+2). Yüksek
 *     top kafa bölgesine iner: kafayla sektirme ancak böyle başlar.
 *   · Sol-sağ ayak sırayla vurulursa ritim bonusu; arka arkaya mükemmel
 *     vuruşlar çarpanı büyütür (her 5'te bir, en çok ×5).
 *   · Top çime değerse tur biter.
 *
 * ÇAĞRILAR: 8. sekmeden sonra seyirci bir hareket ister (KAFA, DİZ, SOL, SAĞ,
 * YÜKSEK) — üç sekme içinde yaparsan +5 × çarpan.
 *
 * GİDEREK ZORLAŞIR: yerçekimi artar (ritim hızlanır), vuruş sapması büyür;
 * 30. sekmeden sonra RÜZGÂR (yönü ve şiddeti üstte), 60'tan sonra sertleşir.
 *
 * GERÇEK İÇERİK (RN'den {type:"config", roster:{juggler, rivals}}):
 *   · Topu seçilen gerçek oyuncu sektirir. Kontrol MÜKEMMEL penceresini ve
 *     vuruş isabetini, denge (agility) koşuyu ve rüzgâra direnci artırır.
 *   · GEÇTİĞİN OYUNCULAR: sekme sayın ligin oyuncularının sezon gol + asist
 *     sayısını geçtikçe onları geride bırakırsın; sıradaki hedef üstte.
 *
 * KOORDİNAT (metre): x yatay (kameradan bakınca sağ +), y yukarı, z kale
 * çizgisinden sahaya; oyuncu penaltı noktasının biraz önünde kameraya bakar.
 */
(function () {
  "use strict";
  var A = window.Arena;
  var P = A.PAL;
  var T = window.THREE || (typeof THREE !== "undefined" ? THREE : null); // eslint-disable-line no-undef
  var S3 = A.S3;

  /* ═══════════════════════════ SİMÜLASYON ═══════════════════════════ */

  var Z0 = 10.5; // oyuncunun durduğu yer
  var FRONT = 0.36; // top gövdenin bu kadar önünde vurulur
  var BALL_R = 0.11, G0 = 9.81;
  var HIGH_APEX = 3.4;
  var PARTS = {
    foot: { lo: 0.12, hi: 0.58, ideal: 0.3, apex: 1.55, pts: 1, label: "AYAK", reach: 0.52 },
    thigh: { lo: 0.66, hi: 1.08, ideal: 0.86, apex: 1.7, pts: 2, label: "DİZ", reach: 0.46 },
    head: { lo: 1.58, hi: 2.02, ideal: 1.8, apex: 2.5, pts: 3, label: "KAFA", reach: 0.36 },
  };
  var ORDER = ["foot", "thigh", "head"];

  var W = 390, H = 640;

  /* ─────────────── kadro ─────────────── */

  var DEFAULT_JUGGLER = {
    id: 0,
    name: "Elit Oyuncu",
    short: "E. Oyuncu",
    back: "OYUNCU",
    shirt: 10,
    team: { id: 900, name: "ElitLig", kit: { primary: "#5B3DF5", secondary: "#FFFFFF" } },
    attrs: { agility: 78, control: 78 },
  };
  var juggler = DEFAULT_JUGGLER;
  var rivals = []; // { short, name, team, value } — value ARTAN
  var rosterSig = "";
  function setRoster(r) {
    var j = r && r.juggler && r.juggler.team ? r.juggler : null;
    var rv = r && Array.isArray(r.rivals) ? r.rivals.filter(function (x) { return x && x.value > 0; }) : [];
    var sig = (j ? j.id : "d") + ":" + rv.map(function (x) { return x.id + "=" + x.value; }).join(",");
    if (sig === rosterSig) return;
    rosterSig = sig;
    juggler = j || DEFAULT_JUGGLER;
    rivals = rv.slice().sort(function (a, b) {
      return a.value - b.value;
    });
    if (R) rebuildCast();
  }
  function attr(key) {
    var v = juggler && juggler.attrs ? Number(juggler.attrs[key]) : NaN;
    return Number.isFinite(v) ? A.clamp((A.clamp(v, 50, 99) - 77.5) / 17.5, -1, 1) : 0;
  }
  function kitOf(person) {
    var k = person && person.team && person.team.kit ? person.team.kit : {};
    return { primary: k.primary || "#5B3DF5", secondary: k.secondary || "#FFFFFF" };
  }
  function teamName(person) {
    return (person && person.team && person.team.name) || "ElitLig";
  }
  function upperTR(s) {
    try {
      return String(s || "").toLocaleUpperCase("tr-TR");
    } catch (e) {
      return String(s || "").toUpperCase();
    }
  }

  /* ─────────────── durum ─────────────── */

  var state = "attract"; // attract | intro | play | drop | over
  var stateT = 0;
  var ball = null, player = null;
  var touches = 0, points = 0, combo = 0, bestCombo = 0, perfects = 0, headers = 0, highs = 0;
  var lastSide = null, sideStreak = 0;
  var passed = 0;
  var scoreBump = 0;
  var callout = null; // { kind, left, at }
  var calls = 0, callsDone = 0;
  var wind = 0, windTarget = 0, windT = 0;
  var cooldown = 0;
  var lastTouch = null; // { t, part, side, upgradable, y }
  var feedback = null; // { text, color, t }
  var line = null, lineT = 0;
  var excite = 0;

  function newBall() {
    return { x: 0, y: 1.35, z: Z0 + FRONT, vx: 0, vy: 0.4, vz: 0, wx: 0, wy: 0, wz: 0, live: true };
  }
  function newPlayer() {
    return { x: 0, z: Z0, vx: 0, vz: 0, touchAt: -9, part: "foot", side: "R", high: false, stride: 0 };
  }
  ball = newBall();
  player = newPlayer();

  function gScale() {
    return 1 + Math.min(0.55, touches / 90);
  }
  function drift() {
    return Math.min(0.42, 0.06 + touches / 160);
  }
  function multiplier() {
    return Math.min(5, 1 + Math.floor(combo / 5));
  }
  function nextRival() {
    return rivals[passed] || null;
  }

  function start() {
    ball = newBall();
    player = newPlayer();
    touches = 0;
    points = 0;
    combo = 0;
    bestCombo = 0;
    perfects = 0;
    headers = 0;
    highs = 0;
    lastSide = null;
    sideStreak = 0;
    passed = 0;
    callout = null;
    calls = 0;
    callsDone = 0;
    wind = 0;
    windTarget = 0;
    windT = 0;
    cooldown = 0;
    lastTouch = null;
    feedback = null;
    line = null;
    A.particles.length = 0;
    A.floaters.length = 0;
    A.banner = null;
    setState("intro");
    A.sound("whistle");
  }
  function setState(s) {
    state = s;
    stateT = 0;
  }

  /* ─────────────── fizik ─────────────── */

  function stepBall(dt) {
    var b = ball;
    var g = G0 * gScale();
    b.vy -= g * dt;
    b.vx += wind * (1 - 0.1 * attr("agility")) * dt;
    b.vx *= 1 - 0.05 * dt;
    b.vz *= 1 - 0.05 * dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.z += b.vz * dt;
    b.wx += b.wz * dt;
    if (b.y <= BALL_R) {
      b.y = BALL_R;
      if (state === "play") drop();
      b.vy = Math.abs(b.vy) > 1 ? -b.vy * 0.45 : 0;
      b.vx *= 0.7;
      b.vz *= 0.7;
    }
  }
  /** Oyuncu topun altına koşar (çeviklikle sınırlı hız). */
  function stepPlayer(dt) {
    var p = player;
    var vmax = 2.7 * (1 + 0.1 * attr("agility"));
    var tx = ball.x, tz = ball.z - FRONT;
    var wantX = A.clamp((tx - p.x) * 6, -vmax, vmax), wantZ = A.clamp((tz - p.z) * 6, -vmax, vmax);
    p.vx = A.approach(p.vx, wantX, 14 * dt);
    p.vz = A.approach(p.vz, wantZ, 14 * dt);
    p.x += p.vx * dt;
    p.z += p.vz * dt;
    p.stride += dt * Math.hypot(p.vx, p.vz) * 3.5;
  }
  function stepWind(dt) {
    if (touches < 30) {
      wind = A.damp(wind, 0, 2, dt);
      return;
    }
    windT -= dt;
    if (windT <= 0) {
      var max = touches >= 60 ? 1.6 : 0.9;
      windTarget = (Math.random() < 0.5 ? -1 : 1) * A.rand(0.3, 1) * max;
      windT = touches >= 60 ? A.rand(2.5, 4) : A.rand(4, 6);
    }
    wind = A.damp(wind, windTarget, 1.2, dt);
  }

  /* ─────────────── vuruş ─────────────── */

  /** Topun yüksekliğine göre bölge; yoksa null. */
  function partAt(y) {
    for (var i = 0; i < ORDER.length; i++) {
      var p = PARTS[ORDER[i]];
      if (y >= p.lo && y <= p.hi) return ORDER[i];
    }
    return null;
  }
  /** Bölge dışı dokunuş: en yakın bölgeye göre erken mi geç mi? */
  function missKind(y) {
    var best = null, bd = 1e9;
    ORDER.forEach(function (k) {
      var p = PARTS[k];
      var d = y > p.hi ? y - p.hi : p.lo - y;
      if (d >= 0 && d < bd) {
        bd = d;
        best = { k: k, early: y > p.hi };
      }
    });
    return best && best.early ? "ERKEN" : "GEÇ";
  }

  /** side: "L" (ekranın solu, oyuncunun sağ bacağı) | "R". */
  function touch(side) {
    if (state !== "play" || cooldown > 0) return null;
    cooldown = 0.1;
    var b = ball;
    var part = b.vy < 0.8 ? partAt(b.y) : null;
    if (!part) {
      flash(missKind(b.y), "#FFFFFF");
      A.sound("tap");
      return null;
    }
    var pp = PARTS[part];
    var dx = b.x - player.x, dz = b.z - (player.z + FRONT);
    var dist = Math.hypot(dx, dz);
    if (dist > pp.reach) {
      flash("YETİŞEMEDİ", P.bad);
      return null;
    }
    var ctrl = attr("control");
    var half = (pp.hi - pp.lo) / 2;
    var q = 1 - Math.abs(b.y - pp.ideal) / half;
    q = A.clamp(q, 0, 1) * (1 - Math.pow(dist / pp.reach, 2) * 0.45);
    var perfect = q > 0.7 - 0.07 * ctrl;
    launch(pp.apex, q, dx, dz);
    // sayım ve puan
    touches += 1;
    var gain = pp.pts;
    var tags = [];
    if (perfect) {
      combo += 1;
      perfects += 1;
      bestCombo = Math.max(bestCombo, combo);
      gain += 1;
      tags.push("MÜKEMMEL");
    } else combo = 0;
    if (part === "head") headers += 1;
    if (part !== "head") {
      if (lastSide && lastSide !== side) {
        sideStreak += 1;
        if (sideStreak >= 2) {
          gain += 1;
          tags.push("SAĞ-SOL");
        }
      } else sideStreak = 0;
      lastSide = side;
    }
    gain *= multiplier();
    // çağrı
    if (callout && callout.left > 0) {
      var ok = (callout.kind === "head" && part === "head") || (callout.kind === "thigh" && part === "thigh") || (callout.kind === "L" && side === "L" && part !== "head") || (callout.kind === "R" && side === "R" && part !== "head");
      if (ok) completeCallout();
      else {
        callout.left -= 1;
        if (callout.left <= 0) callout = null;
      }
    }
    points += gain;
    scoreBump = 1;
    player.touchAt = A.time;
    player.part = part;
    player.side = side;
    player.high = false;
    lastTouch = { t: A.time, part: part, side: side, upgradable: part !== "head", y: b.y };
    feedback = { text: (perfect ? "MÜKEMMEL · " : "") + pp.label + " +" + gain, color: perfect ? P.gold : "#FFFFFF", t: 0 };
    A.sound(perfect ? "coin" : "tap");
    A.haptic(perfect ? "medium" : "light");
    if (perfect && combo % 5 === 0) {
      A.floatText("ÇARPAN ×" + multiplier(), W / 2, H * 0.38, P.gold, 22);
      A.sound("level");
    }
    checkRivals();
    maybeCallout();
    return { part: part, perfect: perfect, q: q, gain: gain };
  }

  /** Top tepe yüksekliğine çıkacak şekilde; kalite sapmayı ve geri toplamayı belirler. */
  function launch(apex, q, dx, dz) {
    var b = ball;
    var g = G0 * gScale();
    b.vy = Math.sqrt(2 * g * Math.max(0.3, apex - b.y));
    var ctrl = attr("control");
    var err = ((1 - q) * 0.85 + drift()) * (1 - 0.15 * ctrl);
    // iyi vuruş topu gövdenin önüne geri getirir
    b.vx = -dx * 1.3 * q + A.gauss(0, err * 0.55);
    b.vz = -dz * 1.3 * q + A.gauss(0, err * 0.3);
    b.wz = A.gauss(0, 10);
    b.wx = -8;
  }

  /** Dokun ve yukarı it: son ayak/diz vuruşunu yüksek topa çevir. */
  function upgradeHigh() {
    var lt = lastTouch;
    if (!lt || !lt.upgradable || A.time - lt.t > 0.22 || state !== "play") return;
    lt.upgradable = false;
    var g = G0 * gScale();
    ball.vy = Math.sqrt(2 * g * Math.max(0.5, HIGH_APEX - ball.y));
    ball.vx *= 1.25;
    highs += 1;
    var gain = 2 * multiplier();
    points += gain;
    player.high = true;
    feedback = { text: "YÜKSEK +" + gain, color: "#93C5FD", t: 0 };
    A.sound("whoosh");
    if (callout && callout.kind === "high" && callout.left > 0) completeCallout();
  }

  function flash(text, color) {
    feedback = { text: text, color: color, t: 0 };
  }

  var CALL_KINDS = { head: "KAFA!", thigh: "DİZ!", L: "◀ SOL", R: "SAĞ ▶", high: "YÜKSEK!" };
  function maybeCallout() {
    if (callout || touches < 8) return;
    if (touches % 6 !== 2) return;
    var pool = ["thigh", "L", "R", "high"];
    if (touches > 14) pool.push("head", "head");
    var kind = A.pick(pool);
    callout = { kind: kind, left: kind === "head" ? 4 : 3, at: A.time };
    calls += 1;
    A.sound("whistle");
  }
  function completeCallout() {
    var gain = 5 * multiplier();
    points += gain;
    callsDone += 1;
    excite = 1;
    A.floatText("ÇAĞRI +" + gain, W / 2, H * 0.3, P.good, 22);
    A.sound("cheer");
    callout = null;
  }

  function checkRivals() {
    var r = nextRival();
    while (r && touches > r.value) {
      passed += 1;
      line = { text: (r.short || r.name) + " geride kaldı · " + r.value + " gol + asist", good: true };
      lineT = 0;
      excite = Math.max(excite, 0.7);
      A.sound("level");
      r = nextRival();
    }
  }

  function drop() {
    setState("drop");
    combo = 0;
    A.sound("groan");
    A.haptic("error");
    A.shake(5);
  }

  /* ─────────────── güncelleme ─────────────── */

  function update(dt) {
    stateT += dt;
    scoreBump = Math.max(0, scoreBump - dt * 4);
    excite = Math.max(0, excite - dt * 0.4);
    lineT += dt;
    cooldown = Math.max(0, cooldown - dt);
    if (feedback) feedback.t += dt;
    if (state === "attract") {
      // vitrin: yapay oyuncu kusursuz sektirir
      stepBall(dt);
      stepPlayer(dt);
      if (ball.vy < 0 && ball.y < PARTS.foot.ideal + 0.02) {
        var dx = ball.x - player.x, dz = ball.z - (player.z + FRONT);
        launch(PARTS.foot.apex, 1, dx, dz);
        player.touchAt = A.time;
        player.part = "foot";
        player.side = player.side === "L" ? "R" : "L";
      }
      if (ball.y <= BALL_R + 0.001) ball = newBall();
      return;
    }
    if (state === "intro") {
      // top elden bırakılır
      ball.x = player.x;
      ball.z = player.z + FRONT;
      ball.y = 1.35;
      ball.vy = 0;
      if (stateT > 1.4) {
        setState("play");
        ball.vy = 0.6;
      }
      return;
    }
    if (state === "play") {
      stepWind(dt);
      stepBall(dt);
      stepPlayer(dt);
      return;
    }
    if (state === "drop") {
      stepBall(dt);
      if (stateT > 1.5) {
        setState("over");
        A.sound("over");
        A.send("over", { score: points, stats: { kicks: touches, perfect: perfects, bestCombo: bestCombo, headers: headers, highs: highs, calls: callsDone, passed: passed, rivals: rivals.length } });
      }
    }
  }

  /* ─────────────── girdi ─────────────── */

  var finger = null;
  function down(p) {
    finger = { x: p.x, y: p.y, t: A.time, high: false };
    if (state === "play") touch(p.x < W / 2 ? "L" : "R");
  }
  function move(p) {
    if (!finger) return;
    if (!finger.high && finger.y - p.y > 40 && A.time - finger.t < 0.22) {
      finger.high = true;
      upgradeHigh();
    }
  }
  function up() {
    finger = null;
  }

  /* ═══════════════════════════ 3B ÇİZİM ═══════════════════════════ */

  var K = A.T3;
  var R = null;
  var glFailed = false;
  var tmpV = null;

  function screenOf(x, y, z) {
    if (!R) return { x: W / 2 + x * 60, y: H * 0.78 - y * 140, s: 140 };
    tmpV.set(x, y, z);
    var dist = R.camera.position.distanceTo(tmpV);
    tmpV.project(R.camera);
    var s = H / (2 * Math.tan((R.camera.fov * Math.PI) / 360) * Math.max(0.3, dist));
    return { x: (tmpV.x * 0.5 + 0.5) * W, y: (-tmpV.y * 0.5 + 0.5) * H, s: s };
  }
  function hasWebGL() {
    try {
      var cv = document.getElementById("gl");
      if (!cv || !T || !cv.getContext) return false;
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
      var cv = document.getElementById("gl");
      var renderer = new T.WebGLRenderer({ canvas: cv, antialias: true, powerPreference: "high-performance", stencil: false });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = T.PCFSoftShadowMap;
      renderer.toneMapping = T.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.0;
      renderer.outputColorSpace = T.SRGBColorSpace;
      K.init(renderer);
      var scene = new T.Scene();
      scene.background = new T.Color(0x040714);
      scene.fog = new T.FogExp2(0x0b1230, 0.0065);
      var camera = new T.PerspectiveCamera(42, 1, 0.1, 500);
      tmpV = new T.Vector3();
      R = { renderer: renderer, scene: scene, camera: camera, U: { time: { value: 0 }, excite: { value: 0 } }, cast: {} };
      S3.build(R);
      rebuildCast();
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
    R.camera.updateProjectionMatrix();
  }

  function rebuildCast() {
    if (!R) return;
    var cur = R.cast.juggler;
    var sig = juggler.id + ":" + kitOf(juggler).primary;
    if (!cur || cur.sig !== sig) {
      if (cur) {
        R.scene.remove(cur.a.root);
        K.disposeTree(cur.a.root);
      }
      var a = K.makeAthlete(juggler, { keeper: false });
      R.scene.add(a.root);
      R.cast.juggler = { a: a, sig: sig, shadows: cur ? cur.shadows : S3.shadowSet() };
    }
    // tribün: yarısı oyuncunun kulübü, yarısı ligin karışık renkleri
    var other = rivals.length ? rivals[rivals.length - 1] : null;
    S3.paintCrowd(kitOf(juggler), other ? kitOf(other) : { primary: "#1E293B", secondary: "#F8FAFC" });
  }

  /* ─────────────── poz ─────────────── */

  /**
   * Sektirme pozu: dengede bekleyiş + son vuruşun hareketi (ayak, diz, kafa,
   * yüksek). Ekranın solu oyuncunun sağ bacağıdır ("b", −x).
   */
  function poseJuggler(a) {
    var J = a.J;
    K.rest(a);
    var p = player;
    a.root.position.set(p.x, 0, p.z);
    a.root.rotation.y = 0;
    var moving = Math.hypot(p.vx, p.vz);
    if (moving > 0.35) K.runCycle(a, p.stride, Math.min(0.6, moving / 3));
    else {
      // denge: dizler hafif kırık, kollar açık
      J.hips.position.y = 0.92;
      J.hpa.rotation.x = -0.15;
      J.hpb.rotation.x = -0.15;
      J.kna.rotation.x = 0.3;
      J.knb.rotation.x = 0.3;
      J.sha.rotation.z = 0.45;
      J.shb.rotation.z = -0.45;
      J.ela.rotation.x = -0.4;
      J.elb.rotation.x = -0.4;
    }
    // göz topta
    J.head.rotation.x = -A.clamp((ball.y - 1.5) * 0.35, -0.3, 0.6);
    if (state === "drop" || state === "over") {
      var d = Math.min(1, stateT / 0.5);
      J.sha.rotation.x = -2.5 * d;
      J.shb.rotation.x = -2.5 * d;
      J.sha.rotation.z = 0.7 * d;
      J.shb.rotation.z = -0.7 * d;
      J.ela.rotation.x = -2.1 * d;
      J.elb.rotation.x = -2.1 * d;
      J.head.rotation.x = 0.4 * d;
      return;
    }
    var t = (A.time - p.touchAt) / 0.34;
    if (t < 0 || t > 1) return;
    var k = Math.sin(t * Math.PI);
    var leg = p.side === "L" ? "b" : "a";
    var other = leg === "a" ? "b" : "a";
    var inward = leg === "a" ? -1 : 1;
    if (p.part === "foot") {
      J["hp" + leg].rotation.x = (p.high ? -1.25 : -0.85) * k;
      J["hp" + leg].rotation.z = inward * 0.22 * k;
      J["kn" + leg].rotation.x = (p.high ? 0.25 : 0.55) * k;
      J["ft" + leg].rotation.x = -0.35 * k;
      J["kn" + other].rotation.x = 0.35;
      J.spine.rotation.x = -0.08 * k;
    } else if (p.part === "thigh") {
      J["hp" + leg].rotation.x = -1.55 * k;
      J["kn" + leg].rotation.x = 1.75 * k;
      J["kn" + other].rotation.x = 0.3;
      J.spine.rotation.x = -0.12 * k;
    } else {
      // kafa: hafif sıçrama, boyun geriye, kollar açık
      J.hips.position.y = 0.94 + 0.12 * k;
      J.spine.rotation.x = -0.2 * k;
      J.head.rotation.x = -0.55 * k;
      J.sha.rotation.z = 0.9;
      J.shb.rotation.z = -0.9;
      J.kna.rotation.x = 0.4 * (1 - k);
      J.knb.rotation.x = 0.4 * (1 - k);
    }
  }

  /* ─────────────── kamera ─────────────── */

  var camPos = null, camLook = null;
  function placeCamera(dt) {
    var cam = R.camera;
    var p = player;
    var want, look, fov = 40;
    if (state === "attract") {
      var a = A.time * 0.15;
      want = new T.Vector3(Math.sin(a) * 6, 2.4, Z0 + Math.cos(a) * 6);
      look = new T.Vector3(0, 1.1, Z0);
    } else if (state === "intro") {
      var e = A.smooth(Math.min(1, stateT / 1.3));
      want = new T.Vector3(A.lerp(4, 1.1, e), A.lerp(3.6, 1.6, e), A.lerp(Z0 + 9, Z0 + 5.6, e));
      look = new T.Vector3(p.x, 1.1, p.z);
    } else {
      // önden, hafif sağdan; yüksek topta kamera yukarı bakar ve geri çekilir
      var hi = A.clamp((ball.y - 1.8) / 2, 0, 1);
      want = new T.Vector3(p.x * 0.6 + 1.1, 1.6 + hi * 0.5, p.z + 5.6 + hi * 1.4);
      look = new T.Vector3(p.x * 0.85, 1.15 + hi * 0.9, p.z);
      fov = 40 + hi * 6;
    }
    if (A.shakeAmt > 0.2) {
      want.x += (Math.random() - 0.5) * A.shakeAmt * 0.008;
      want.y += (Math.random() - 0.5) * A.shakeAmt * 0.008;
    }
    if (!camPos) {
      camPos = want.clone();
      camLook = look.clone();
    } else {
      var k = 1 - Math.exp(-4 * dt);
      camPos.lerp(want, k);
      camLook.lerp(look, k);
    }
    cam.position.copy(camPos);
    cam.lookAt(camLook);
    if (Math.abs(cam.fov - fov) > 0.05) {
      cam.fov += (fov - cam.fov) * Math.min(1, dt * 4);
      cam.updateProjectionMatrix();
    }
  }

  function sync(dt) {
    R.U.time.value = A.time;
    R.U.excite.value = Math.max(excite, state === "attract" ? 0 : 0);
    var mk = kitOf(juggler);
    S3.paintLed(mk.primary, "#5B3DF5");
    var nr = nextRival();
    S3.paintBoards("ELİTLİG ARENA   •   TOP SEKTİR   •   " + upperTR(juggler.short) + (nr ? "   •   SIRADAKİ: " + upperTR(nr.short || nr.name) + " " + nr.value : "") + "   •   ");
    R.boardTex.offset.x = (A.time * 0.04) % 1;
    R.ledTex.offset.x = (A.time * 0.02) % 1;
    R.ball.position.set(ball.x, ball.y, ball.z);
    R.ball.rotation.set(R.ball.rotation.x + ball.wx * dt * 0.1, R.ball.rotation.y + ball.wz * dt * 0.1, 0);
    R.ballShadow.position.set(ball.x, 0.006, ball.z);
    R.ballShadow.material.opacity = 0.55 * Math.max(0.15, 1 - ball.y * 0.4);
    R.trail.line.visible = false;
    var c = R.cast.juggler;
    poseJuggler(c.a);
    S3.placeShadows(c.shadows, c.a, true);
    placeCamera(dt);
  }

  function resize(w, h) {
    W = w;
    H = h;
    initGL();
    resizeGL();
  }

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
        if (o.material) o.material.needsUpdate = true;
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
    if (glFailed && !R && A.is3d) drawNoGL(c);
    drawHUD(c, dt);
  }

  /* ═══════════════════════════ HUD ═══════════════════════════ */

  var GOLD = "#FFD24A", GLASS = "rgba(9,11,32,0.8)", LINE = "rgba(255,255,255,0.12)";
  var ZONE_COL = { foot: "#34D399", thigh: "#60A5FA", head: "#F472B6" };

  function drawNoGL(c) {
    c.save();
    c.fillStyle = "#0A0E24";
    c.fillRect(0, 0, W, H);
    c.fillStyle = "rgba(255,255,255,0.8)";
    c.font = A.font(14, 700);
    c.textAlign = "center";
    c.fillText("3B grafik bu cihazda açılamadı.", W / 2, H / 2);
    c.restore();
  }
  var vignetteLayer = null;
  function drawVignette(c) {
    if (!vignetteLayer || vignetteLayer.w !== W || vignetteLayer.h !== H) {
      vignetteLayer = A.layer(W, H);
      var v = vignetteLayer.ctx;
      A.paintVignette(v, W, H, 0.34);
      var g = v.createLinearGradient(0, 0, 0, 150);
      g.addColorStop(0, "rgba(3,5,16,0.72)");
      g.addColorStop(1, "rgba(3,5,16,0)");
      v.fillStyle = g;
      v.fillRect(0, 0, W, 150);
    }
    A.blit(vignetteLayer);
  }
  function glass(c, x, y, w, h, r, fill) {
    A.roundRect(c, x, y, w, h, r);
    c.fillStyle = fill || GLASS;
    c.fill();
    c.strokeStyle = LINE;
    c.lineWidth = 1;
    c.stroke();
  }
  function fit(c, text, max) {
    var t = String(text || "");
    if (c.measureText(t).width <= max) return t;
    while (c.measureText(t + "…").width > max && t.length > 2) t = t.slice(0, -1);
    return t + "…";
  }

  /** Üst: büyük sekme sayacı, puan, çarpan. */
  function drawTop(c) {
    c.save();
    c.textAlign = "center";
    c.textBaseline = "middle";
    var s = 1 + 0.2 * scoreBump;
    c.translate(W / 2, 46);
    c.scale(s, s);
    A.bigText(c, String(touches), 0, 0, 52, "#FFFFFF");
    c.restore();
    c.save();
    c.font = A.font(10, 900);
    c.fillStyle = "rgba(255,255,255,0.65)";
    c.textAlign = "center";
    if ("letterSpacing" in c) c.letterSpacing = "2px";
    c.fillText("SEKME", W / 2, 84);
    if ("letterSpacing" in c) c.letterSpacing = "0px";
    var label = "PUAN " + points.toLocaleString("tr-TR");
    c.font = A.font(12, 900);
    var w = c.measureText(label).width + 22;
    A.pill(c, 14, 16, w, 26, "rgba(9,11,32,0.7)");
    c.fillStyle = "#FFFFFF";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(label, 14 + w / 2, 29.5);
    if (multiplier() > 1) {
      var ml = "×" + multiplier();
      var mw = c.measureText(ml).width + 20;
      A.pill(c, W - 14 - mw, 16, mw, 26, "rgba(69,39,214,0.9)");
      c.fillStyle = GOLD;
      c.fillText(ml, W - 14 - mw / 2, 29.5);
    }
    if (Math.abs(wind) > 0.15) {
      var dir = Math.sign(wind);
      var ww = 98;
      A.pill(c, 14, 48, ww, 24, "rgba(9,11,32,0.7)");
      c.fillStyle = Math.abs(wind) > 1 ? P.bad : "#BFE3FF";
      c.font = A.font(10, 900);
      c.fillText("RÜZGÂR " + (dir > 0 ? "→" : "←"), 14 + ww / 2, 60.5);
    }
    c.restore();
  }

  /** Sıradaki rakip: ad, takım, ilerleme. */
  function drawRival(c) {
    var r = nextRival();
    if (!r) return;
    var w = Math.min(W - 28, 300), h = 40, x = W / 2 - w / 2, y = 96;
    c.save();
    glass(c, x, y, w, h, 12, "rgba(9,11,32,0.66)");
    var kit = kitOf(r);
    c.fillStyle = kit.primary;
    c.fillRect(x, y + 8, 4, h - 16);
    c.textAlign = "left";
    c.textBaseline = "middle";
    c.font = A.font(9, 900);
    c.fillStyle = GOLD;
    c.fillText("SIRADAKİ · " + (passed + 1) + "/" + rivals.length, x + 14, y + 13);
    c.font = A.font(12, 800);
    c.fillStyle = "#FFFFFF";
    c.fillText(fit(c, (r.short || r.name) + " · " + teamName(r), w - 90), x + 14, y + 28);
    c.textAlign = "right";
    c.font = A.font(15, 900);
    c.fillText(touches + "/" + (r.value + 1), x + w - 12, y + 21);
    var prev = passed > 0 ? rivals[passed - 1].value : 0;
    var f = A.clamp((touches - prev) / Math.max(1, r.value + 1 - prev), 0, 1);
    c.fillStyle = "rgba(255,255,255,0.12)";
    c.fillRect(x + 4, y + h - 3, w - 8, 3);
    c.fillStyle = P.good;
    c.fillRect(x + 4, y + h - 3, (w - 8) * f, 3);
    c.restore();
  }

  /** Sağ kenar: yükseklik göstergesi — üç bölge ve topun anlık yüksekliği. */
  function drawGauge(c) {
    var x = W - 22, top = H * 0.3, bot = H * 0.78, h = bot - top;
    var maxY = 3.6;
    var Y = function (v) {
      return bot - (v / maxY) * h;
    };
    c.save();
    c.fillStyle = "rgba(9,11,32,0.55)";
    A.roundRect(c, x - 7, top - 6, 14, h + 12, 7);
    c.fill();
    ORDER.forEach(function (k) {
      var p = PARTS[k];
      c.fillStyle = ZONE_COL[k];
      c.globalAlpha = partAt(ball.y) === k ? 0.95 : 0.4;
      c.fillRect(x - 5, Y(p.hi), 10, Y(p.lo) - Y(p.hi));
      c.globalAlpha = 1;
      c.fillStyle = "#FFFFFF";
      c.fillRect(x - 6, Y(p.ideal) - 1, 12, 2);
    });
    var by = Y(Math.min(maxY, ball.y));
    c.fillStyle = "#FFFFFF";
    c.beginPath();
    c.arc(x, by, 6, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = "#0B1020";
    c.lineWidth = 2;
    c.stroke();
    c.font = A.font(8, 900);
    c.textAlign = "right";
    c.fillStyle = "rgba(255,255,255,0.7)";
    c.fillText("KAFA", x - 10, Y(PARTS.head.ideal) + 3);
    c.fillText("DİZ", x - 10, Y(PARTS.thigh.ideal) + 3);
    c.fillText("AYAK", x - 10, Y(PARTS.foot.ideal) + 3);
    c.restore();
  }

  /**
   * Zamanlama halkası: top düşerken yaklaştığı bölgenin ideal yüksekliğine
   * göre kapanır; topun çevresine oturduğu an MÜKEMMEL'dir.
   */
  function drawRing(c) {
    if (state !== "play" || ball.vy > 0) return;
    var target = null;
    for (var i = ORDER.length - 1; i >= 0; i--) {
      var p = PARTS[ORDER[i]];
      if (ball.y >= p.ideal - 0.12 && ball.y <= p.hi + 0.55) {
        target = ORDER[i];
        break;
      }
    }
    if (!target) return;
    var pp = PARTS[target];
    var s = screenOf(ball.x, ball.y, ball.z);
    var br = Math.max(8, s.s * BALL_R);
    var d = A.clamp((ball.y - pp.ideal) / (pp.hi + 0.55 - pp.ideal), -0.3, 1);
    var r = br * (1.15 + Math.max(0, d) * 2.6);
    c.save();
    c.strokeStyle = ZONE_COL[target];
    c.globalAlpha = d < 0 ? 0.4 : 0.9;
    c.lineWidth = 3;
    c.beginPath();
    c.arc(s.x, s.y, r, 0, Math.PI * 2);
    c.stroke();
    c.globalAlpha = 0.6;
    c.lineWidth = 1.5;
    c.beginPath();
    c.arc(s.x, s.y, br * 1.15, 0, Math.PI * 2);
    c.stroke();
    c.restore();
  }

  function drawCallout(c) {
    if (!callout) return;
    var t = A.time - callout.at;
    var pop = A.easeOutBack(Math.min(1, t / 0.35));
    c.save();
    c.translate(W / 2, H * 0.23);
    c.scale(0.6 + 0.4 * pop, 0.6 + 0.4 * pop);
    var text = CALL_KINDS[callout.kind];
    c.font = A.font(20, 900);
    var w = c.measureText(text).width + 64;
    glass(c, -w / 2, -22, w, 44, 22, "rgba(16,185,129,0.85)");
    c.fillStyle = "#FFFFFF";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(text, -10, 1);
    for (var i = 0; i < 4; i++) {
      c.fillStyle = i < callout.left ? "#FFFFFF" : "rgba(255,255,255,0.3)";
      c.beginPath();
      c.arc(w / 2 - 34 + i * 7, 1, 2.5, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
  }

  function drawFeedback(c) {
    if (!feedback || feedback.t > 0.9) return;
    var s = screenOf(ball.x, ball.y, ball.z);
    c.save();
    c.globalAlpha = A.clamp((0.9 - feedback.t) / 0.3, 0, 1);
    c.font = A.font(15, 900);
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.lineWidth = 4;
    c.strokeStyle = "rgba(9,11,32,0.8)";
    var y = s.y - 30 - feedback.t * 40;
    c.strokeText(feedback.text, s.x, y);
    c.fillStyle = feedback.color;
    c.fillText(feedback.text, s.x, y);
    c.restore();
  }

  function drawHints(c) {
    if (state !== "play" && state !== "intro") return;
    if (touches > 6 || stateT > 12) return;
    c.save();
    var a = state === "intro" ? 1 : A.clamp((6 - touches) / 2, 0, 1);
    c.globalAlpha = a;
    // ekranı ikiye bölen ince çizgi + iki etiket
    c.strokeStyle = "rgba(255,255,255,0.18)";
    c.setLineDash([4, 6]);
    c.beginPath();
    c.moveTo(W / 2, H * 0.62);
    c.lineTo(W / 2, H - 70);
    c.stroke();
    c.setLineDash([]);
    var w = Math.min(W - 24, 360), x = W / 2 - w / 2, y = H - 64;
    glass(c, x, y, w, 46, 14, "rgba(9,11,32,0.72)");
    var items = [["◀", "Sol yarı: sol ayak"], ["◉", "Halka kapanınca dokun"], ["▶", "Sağ yarı: sağ ayak"]];
    var cw = w / 3;
    items.forEach(function (it, i) {
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.font = A.font(14, 900);
      c.fillStyle = GOLD;
      c.fillText(it[0], x + cw * i + cw / 2, y + 15);
      c.font = A.font(10, 800);
      c.fillStyle = "#FFFFFF";
      c.fillText(it[1], x + cw * i + cw / 2, y + 33);
    });
    c.font = A.font(10.5, 800);
    c.fillStyle = "rgba(255,255,255,0.75)";
    c.textAlign = "center";
    c.fillText("Dokun ve yukarı it: yüksek top → kafayla sektir", W / 2, y - 12);
    c.restore();
  }

  function drawIntro(c) {
    var t = stateT;
    var a = A.clamp(Math.min(t / 0.3, (1.4 - t) / 0.3), 0, 1);
    c.save();
    c.globalAlpha = a;
    var w = Math.min(W - 28, 320), h = 70, x = W / 2 - w / 2, y = H * 0.36;
    glass(c, x, y, w, h, 18, "rgba(9,11,32,0.85)");
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.font = A.font(11, 900);
    c.fillStyle = GOLD;
    c.fillText("TOP SEKTİR · FREESTYLE", W / 2, y + 20);
    c.font = A.font(17, 900);
    c.fillStyle = "#FFFFFF";
    c.fillText(fit(c, (juggler.shirt ? juggler.shirt + " · " : "") + (juggler.name || juggler.short), w - 30), W / 2, y + 46);
    c.restore();
  }

  function drawDrop(c) {
    var t = stateT;
    var pop = A.easeOutBack(Math.min(1, t / 0.35));
    c.save();
    A.bigText(c, "TOP DÜŞTÜ", W / 2, H * 0.42, 40 * (0.5 + 0.5 * pop), "#FFFFFF", { stroke: "rgba(160,20,50,0.9)" });
    c.font = A.font(13, 800);
    c.fillStyle = "rgba(255,255,255,0.9)";
    c.textAlign = "center";
    c.fillText(touches + " sekme · " + passed + " oyuncu geçildi", W / 2, H * 0.42 + 36);
    c.restore();
  }

  function drawLine(c) {
    if (!line || lineT > 2.6) return;
    c.save();
    c.globalAlpha = A.clamp((2.6 - lineT) / 0.35, 0, 1);
    c.font = A.font(12.5, 700);
    var text = fit(c, line.text, W - 66);
    var tw = Math.min(W - 32, c.measureText(text).width + 34);
    var x = W / 2 - tw / 2, y = 144;
    A.roundRect(c, x, y, tw, 30, 10);
    c.fillStyle = "rgba(9,11,32,0.82)";
    c.fill();
    c.fillStyle = P.good;
    c.fillRect(x, y + 6, 4, 18);
    c.fillStyle = "#FFFFFF";
    c.textAlign = "left";
    c.textBaseline = "middle";
    c.fillText(text, x + 16, y + 15.5);
    c.restore();
  }

  function drawHUD(c, dt) {
    drawVignette(c);
    A.drawParticles(c);
    A.drawFloaters(c, dt);
    if (state === "attract" || state === "over") return;
    drawTop(c);
    drawRival(c);
    if (state === "intro") drawIntro(c);
    if (state === "play") {
      drawRing(c);
      drawGauge(c);
      drawCallout(c);
      drawFeedback(c);
    }
    drawHints(c);
    if (state === "drop") drawDrop(c);
    drawLine(c);
    A.drawBanner(c, W, H * 0.34, dt);
  }

  function debug() {
    return {
      state: state,
      ball: ball,
      player: player,
      touches: touches,
      points: points,
      combo: combo,
      perfects: perfects,
      headers: headers,
      highs: highs,
      passed: passed,
      callout: callout,
      g: G0 * gScale(),
      wind: wind,
      parts: PARTS,
      juggler: juggler.short,
      gl: !!R,
    };
  }

  A.register({ resize: resize, start: start, update: update, render: render, down: down, move: move, up: up, debug: debug, setRoster: setRoster });
})();
