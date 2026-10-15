/*
 * PENALTI — gerçek ligin golcüleri, gerçek ligin kalecileri.
 *
 * KADRO (RN'den {type:"config", roster:{shooter, keepers}} ile gelir; bkz.
 * elitlig-server services/penaltyRoster.js). Gelmezse oyun varsayılan bir
 * atıcı ve kaleci merdiveniyle aynen oynanır.
 *   · ATICI: oyuncunun seçtiği gerçek golcü. Arkadan görünür: formasında
 *     soyadı ve numarası, takımının forma renkleri. Üç özelliği küçük ve
 *     DENGELİ etki yapar (sunucu toplamlarını dengeler):
 *       şut    topun hızı (kalecinin erişimini biraz daraltır)   ±%6
 *       isabet nişanın sapması (düşük isabet = topu biraz kaçırır)
 *       falso  falsonun kaleciyi aldatma gücü                    ±%15
 *   · KALECİ MERDİVENİ: her seviyede (3 golde bir) sıradaki gerçek kaleci
 *     kaleye geçer; son kaleci ligin en çok kurtarış yapanıdır. Refleksi
 *     (maç başına kurtarış) karar süresini ve okuma hatasını ±%8 değiştirir.
 *
 * KURAL: üç kaçırma hakkın var; gol attıkça seri sürer ve kaleci GİDEREK
 * USTALAŞIR. Skor puandır:
 *   · Gol 100 · köşeye (yan) +50 · yükseğe +50 · falsolu gol +50
 *   · Kaledeki altın HEDEF halkasına isabet +150
 *   · Gol serisi çarpanı: 3 seri ×1,5 · 5 seri ×2 · 8 seri ×3
 *
 * JEST: ekranın alt yarısında herhangi bir yerden yukarı sürükle-bırak.
 *   YÖN       ← yatay bileşen     GÜÇ  ← uzunluk (kalecinin erişimini daraltır)
 *   YÜKSEKLİK ← dikey bileşen     FALSO ← parmağın kavisi: topun İLK yönünü
 *   saptırır, top uçuşta hedefe kıvrılır. Kaleci ilk yönü okur — falso aldatır.
 *   Bırakınca atıcı topa koşar ve vurur (kısa koşu animasyonu).
 *
 * ZORLUK (her 3 golde bir seviye):
 *   · Kalecinin tepki süresi 0,32 → 0,12 sn; okuma hatası azalır, erişimi artar,
 *     falsoyu daha iyi okur.
 *   · Atış süresi 8 → 4 sn (süre biterse kaçırma sayılır).
 *   · Seviye 3: RÜZGÂR — nişan çizgisi rüzgârı göstermez, oyuncu telafi eder.
 *   · Seviye 5: kaleci atıştan önce çizgide sağa sola oynar (yanıltır).
 *   · Hedef halkası küçülür ve köşelere kayar.
 *
 * KALECİ DÜRÜSTTÜR: kararını top ayrıldıktan SONRA verir, hatayla okur, bir kez
 * dalar ve düzeltemez. Hiçbir zaman "her şeyi" kurtarmaz.
 *
 * SUNUM: maç yayını gibi — üstte atıcı/kaleci eşleşme bandı, her atıştan
 * sonra spiker yorumu, kaleci değişiminde tanıtım kartı, tribünde atıcının
 * takım renkleri, köşelerde projektör kuleleri.
 */
(function () {
  "use strict";
  var A = window.Arena;
  var P = A.PAL;

  /* ─────────────────────────── dünya ölçüleri (metre) ─────────────────────────── */
  var GOAL_W = 7.32, GOAL_H = 2.44, NET_BACK_H = 1.9;
  var D_GOAL = 17, D_SPOT = 6, D_NET = 19, D_KEEPER = 16.7, D_BOARDS = 21.5;
  var BALL_R = 0.14;
  var NET_COLS = 25, NET_ROWS = 12;
  var RUNUP = 0.34; // bırakıştan vuruşa kadar koşu (sn)
  var INTRO = 1.25; // eşleşme / yeni kaleci tanıtımı (sn)

  var W = 0, H = 0;
  var cam = null;
  var bg = null, vignette = null;

  /* ─────────────────────────── kadro ─────────────────────────── */
  var DEFAULT_SHOOTER = {
    id: 0,
    short: "ElitLig",
    back: "ELİTLİG",
    shirt: 10,
    team: { name: "ElitLig", kit: { primary: "#5B3DF5", secondary: "#FFFFFF" } },
    attrs: { power: 78, accuracy: 78, curve: 78 },
    stats: { goals: 0 },
  };
  var DEFAULT_KEEPERS = [
    ["Çaylak", "#0EA5E9", 62],
    ["Amatör", "#F97316", 68],
    ["Usta", "#16A34A", 75],
    ["Kaptan", "#DC2626", 82],
    ["Efsane", "#111827", 90],
  ].map(function (k, i) {
    return {
      id: -1 - i,
      short: k[0] + " Kaleci",
      back: k[0].toLocaleUpperCase("tr-TR"),
      shirt: 1,
      team: { name: "ElitLig", kit: { primary: k[1], secondary: "#FFFFFF" } },
      attrs: { reflex: k[2] },
      stats: { saves: 0 },
    };
  });
  var shooter = DEFAULT_SHOOTER;
  var keepers = DEFAULT_KEEPERS;
  var keeperIdx = 0;
  var rosterSig = "";

  function setRoster(r) {
    var s = r && r.shooter && r.shooter.team ? r.shooter : null;
    var ks = r && Array.isArray(r.keepers) && r.keepers.length ? r.keepers.filter(function (k) { return k && k.team; }) : [];
    var sig = (s ? s.id : "d") + ":" + ks.map(function (k) { return k.id; }).join(",");
    if (sig === rosterSig) return;
    rosterSig = sig;
    shooter = s || DEFAULT_SHOOTER;
    keepers = ks.length ? ks : DEFAULT_KEEPERS;
    keeperIdx = 0;
    if (W) buildBackground();
  }
  function keeperNow() {
    return keepers[Math.min(keeperIdx, keepers.length - 1)];
  }
  function attr(obj, key, fallback) {
    var v = obj && obj.attrs ? Number(obj.attrs[key]) : NaN;
    return Number.isFinite(v) ? A.clamp(v, 50, 99) : fallback;
  }
  /** Özellik → [-1, 1] (77,5 nötr). */
  function norm(v) {
    return A.clamp((v - 77.5) / 17.5, -1, 1);
  }

  /* ─────────────────────────── renk yardımcıları ─────────────────────────── */
  function hexRgb(hex) {
    var h = String(hex || "").replace("#", "");
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    if (!Number.isFinite(n) || h.length !== 6) return [91, 61, 245];
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function shade(hex, amt) {
    var c = hexRgb(hex);
    var f = function (v) {
      return Math.round(A.clamp(amt >= 0 ? v + (255 - v) * amt : v * (1 + amt), 0, 255));
    };
    return "rgb(" + f(c[0]) + "," + f(c[1]) + "," + f(c[2]) + ")";
  }
  function rgba(hex, a) {
    var c = hexRgb(hex);
    return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + a + ")";
  }
  function luma(hex) {
    var c = hexRgb(hex);
    return (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255;
  }
  /** Formanın üstündeki yazı rengi: ikincil renk yeterince ayrışmıyorsa siyah/beyaz. */
  function inkOn(kit) {
    var p = kit.primary, s = kit.secondary;
    return Math.abs(luma(p) - luma(s)) > 0.3 ? s : luma(p) > 0.55 ? "#0B1020" : "#FFFFFF";
  }
  function kitOf(person) {
    var k = person && person.team && person.team.kit ? person.team.kit : {};
    return { primary: k.primary || "#5B3DF5", secondary: k.secondary || "#FFFFFF" };
  }

  /* ─────────────────────────── durum ─────────────────────────── */
  var state = "attract"; // attract | intro | aim | runup | flight | result | over
  var goals = 0, points = 0, misses = 0, streak = 0, bestStreak = 0, shots = 0;
  var level = 1;
  var LIVES = 3;
  var plan = null, flightT = 0, since = 0, slowmo = 1;
  var ball = null, orient = null, spin = 0, roll = 0;
  var trail = [];
  var keeper = null;
  var net = new Float32Array(NET_COLS * NET_ROWS);
  var netAlive = false;
  var drag = null;
  var outcome = null, outcomeT = 0, outcomeGain = 0, outcomeTags = [];
  var clock = 0, clockMax = 8;
  var wind = 0;
  var target = null;
  var zoom = 1, zoomTarget = 1, panX = 0;
  var boardFlash = 0;
  var scoreBump = 0;
  var path = []; // sürüklenen parmağın izi
  var runT = 0, pendingShot = null;
  var introT = 0, introKind = "match"; // match | keeper
  var keeperEnter = 1; // 0 → 1: yeni kalecinin kaleye yürüyüşü
  var line = null, lineT = 0; // spiker yorumu
  var pose = { run: 0, kick: 0, celebrate: 0, despair: 0 };

  function difficulty() {
    return 1 - Math.exp(-goals / 9);
  }
  function lerpD(a, b) {
    return a + (b - a) * difficulty();
  }

  /* ─────────────────────────── kamera ─────────────────────────── */

  function makeView(w, h) {
    var goalPx = w * 0.8;
    var fx = (goalPx * D_GOAL) / GOAL_W;
    var goalBase = Math.min(h * 0.43, h * 0.24 + (goalPx * GOAL_H) / GOAL_W);
    var spot = h * 0.85;
    var k = (spot - goalBase) / (1 / D_SPOT - 1 / D_GOAL);
    return { w: w, h: h, cx: w / 2, fx: fx, k: k, horizon: goalBase - k / D_GOAL };
  }
  function proj(X, Y, D) {
    var d = Math.max(0.2, D);
    var s = cam.fx / d;
    return { x: cam.cx + X * s, y: cam.horizon + cam.k / d - Y * s, s: s };
  }

  /* ─────────────────────────── atış planı ─────────────────────────── */

  var DRAG_MIN = 34, DRAG_MAX = 250;

  function planShot(d) {
    var power = A.clamp(0.35 + ((d.length - DRAG_MIN) / (DRAG_MAX - DRAG_MIN)) * 0.65, 0.35, 1);
    var aimX = A.clamp(0.5 + d.dx / Math.max(1, W * 1.0), -0.25, 1.25);
    var aimY = A.clamp(-d.dy / Math.max(1, H * 0.5), 0, 1.35);
    var curveSkill = 1 + norm(attr(shooter, "curve", 78)) * 0.15;
    var curve = A.clamp(d.curve * 3.2, -1, 1);
    var pw = norm(attr(shooter, "power", 78));
    return {
      aimX: aimX,
      aimY: aimY,
      apparentX: aimX + curve * 0.22 * curveSkill,
      curve: curve,
      power: power,
      duration: 0.46 * (1.25 - 0.45 * power) * (1 - 0.06 * pw),
      wind: 0,
    };
  }

  function ballAt(p, t) {
    var Aa = (p.apparentX - 0.5) * GOAL_W;
    var F = (p.aimX - 0.5) * GOAL_W;
    var X = Aa * t + (F - Aa) * t * t + p.wind * t * t;
    var chip = (1 - p.power) * 1.1;
    var Y = BALL_R + (p.aimY * GOAL_H - BALL_R) * t + chip * 4 * t * (1 - t);
    var D = D_SPOT + (D_GOAL - D_SPOT) * t;
    return { X: X, Y: Y, D: D };
  }

  /** Rüzgârla birlikte topun kale çizgisindeki GERÇEK varış noktası. */
  function landing(p) {
    var end = ballAt(p, 1);
    return { x: end.X / GOAL_W + 0.5, y: (end.Y - BALL_R) / GOAL_H };
  }

  function resolve(p, kx, klift) {
    var L = landing(p);
    if (L.x < 0.025 || L.x > 0.975 || L.y > 1.03) return "aut";
    if (L.x < 0.07 || L.x > 0.93 || L.y > 0.93) return "direk";
    var dx = Math.abs(L.x - kx);
    var reachY = 0.42 + klift * 0.58;
    var pw = norm(attr(shooter, "power", 78));
    var reach = lerpD(0.16, 0.23) * (1.25 - p.power * 0.4) * (1 - 0.05 * pw);
    return dx < reach && L.y <= reachY ? "kurtaris" : "gol";
  }

  function keeperGuess(p) {
    var L = landing(p);
    var rf = norm(attr(keeperNow(), "reflex", 75));
    var sigma = lerpD(0.34, 0.09) * (1 - 0.08 * rf);
    var fool = lerpD(0.6, 0.35);
    var apparent = L.x + (p.apparentX - p.aimX);
    var read = L.x + (apparent - L.x) * fool;
    return A.clamp(A.gauss(read, sigma), 0.03, 0.97);
  }

  /* ─────────────────────────── kurulum ─────────────────────────── */

  function restingKeeper() {
    return { x: 0.5, fromX: 0.5, target: null, decideAt: 0, divedAt: null, dive: 0, lift: 0, crouch: 0, celebrate: 0 };
  }
  function spotBall() {
    return { X: 0, Y: BALL_R, D: D_SPOT, vX: 0, vY: 0, vD: 0, free: false };
  }

  function resize(w, h) {
    W = w;
    H = h;
    cam = makeView(w, h);
    buildBackground();
    if (!ball) {
      ball = spotBall();
      orient = A.orientation();
      keeper = restingKeeper();
    }
  }

  function buildBackground() {
    bg = A.layer(W, H);
    var c = bg.ctx;
    var boardsBottom = proj(0, 0, D_BOARDS).y;
    var boardH = (cam.fx * 0.95) / D_BOARDS;
    var boardsTop = boardsBottom - boardH;
    var roofH = Math.max(18, boardsTop * 0.15);

    A.paintSky(c, W, boardsTop);
    // Tribün atıcının takım renkleriyle dolar (iç saha atmosferi).
    var kit = kitOf(shooter);
    var saved = P.crowd;
    P.crowd = saved.concat([kit.primary, kit.primary, kit.primary, kit.secondary, kit.secondary, shade(kit.primary, -0.3)]);
    A.paintStands(c, W, roofH, boardsTop, 1907);
    P.crowd = saved;
    A.paintRoof(c, W, roofH);
    paintTowers(c, roofH);
    A.paintHaze(c, W, boardsTop, H * 0.18, 1.2);

    // Çim
    var g = c.createLinearGradient(0, boardsBottom, 0, H);
    g.addColorStop(0, P.grassFar);
    g.addColorStop(0.45, "#2B9150");
    g.addColorStop(1, P.grassNear);
    c.fillStyle = g;
    c.fillRect(0, boardsBottom, W, H - boardsBottom);
    // Kale çizgisine paralel biçme bantları
    var i = 0;
    for (var d = D_BOARDS; d > 1.6; d -= 1.7, i++) {
      if (i % 2) continue;
      var y1 = proj(0, 0, d).y, y2 = proj(0, 0, d - 1.7).y;
      c.fillStyle = "rgba(255,255,255,0.05)";
      c.fillRect(0, y1, W, y2 - y1);
    }
    // Boyuna şeritler — dama deseni
    for (var X = -34; X < 34; X += 8) {
      var a = proj(X, 0, D_BOARDS), b = proj(X + 4, 0, D_BOARDS), cc = proj(X + 4, 0, 1.2), dd = proj(X, 0, 1.2);
      c.beginPath();
      c.moveTo(a.x, a.y);
      c.lineTo(b.x, b.y);
      c.lineTo(cc.x, cc.y);
      c.lineTo(dd.x, dd.y);
      c.closePath();
      c.fillStyle = "rgba(0,0,0,0.06)";
      c.fill();
    }
    paintGrassBlades(c, boardsBottom);

    // Kale ağzına düşen ışık + iki projektörden çapraz gölgeler
    c.save();
    c.globalCompositeOperation = "lighter";
    var gy = proj(0, 0, D_GOAL - 2).y;
    var pool = c.createRadialGradient(W / 2, gy, 0, W / 2, gy, W * 0.7);
    pool.addColorStop(0, "rgba(255,247,219,0.16)");
    pool.addColorStop(1, "rgba(255,247,219,0)");
    c.fillStyle = pool;
    c.fillRect(0, boardsBottom, W, H - boardsBottom);
    var sy = proj(0, 0, D_SPOT).y;
    var spotPool = c.createRadialGradient(W / 2, sy, 0, W / 2, sy, W * 0.45);
    spotPool.addColorStop(0, "rgba(255,247,219,0.10)");
    spotPool.addColorStop(1, "rgba(255,247,219,0)");
    c.fillStyle = spotPool;
    c.fillRect(0, sy - W * 0.45, W, W * 0.9);
    c.restore();

    // Tebeşir çizgileri
    var chalkW = (cam.fx / D_GOAL) * 0.12;
    function seg(X1, D1, X2, D2, wmul) {
      var p1 = proj(X1, 0, D1), p2 = proj(X2, 0, D2);
      c.lineWidth = chalkW * (wmul || 1);
      c.beginPath();
      c.moveTo(p1.x, p1.y);
      c.lineTo(p2.x, p2.y);
      c.stroke();
    }
    c.strokeStyle = P.chalk;
    c.lineCap = "round";
    seg(-40, D_GOAL, 40, D_GOAL, 1);
    var six = D_GOAL - 5.5;
    seg(-9.16, D_GOAL, -9.16, six, 1.1);
    seg(-9.16, six, 9.16, six, 1.1);
    seg(9.16, six, 9.16, D_GOAL, 1.1);
    var box = D_GOAL - 16.5;
    seg(-20.16, D_GOAL, -20.16, box + 0.3, 1.6);
    seg(20.16, D_GOAL, 20.16, box + 0.3, 1.6);
    // Penaltı noktası (hafif aşınmış)
    var spot = proj(0, 0, D_SPOT);
    c.fillStyle = P.chalk;
    c.beginPath();
    c.ellipse(spot.x, spot.y, (cam.fx / D_SPOT) * 0.13, (cam.fx / D_SPOT) * 0.045, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "rgba(60,40,20,0.18)";
    c.beginPath();
    c.ellipse(spot.x, spot.y + 2, (cam.fx / D_SPOT) * 0.32, (cam.fx / D_SPOT) * 0.09, 0, 0, Math.PI * 2);
    c.fill();

    vignette = A.layer(W, H);
    A.paintVignette(vignette.ctx, W, H, 0.5);
    A.paintTopScrim(vignette.ctx, W, 150);
    var bot = vignette.ctx.createLinearGradient(0, H - 90, 0, H);
    bot.addColorStop(0, "rgba(4,6,18,0)");
    bot.addColorStop(1, "rgba(4,6,18,0.45)");
    vignette.ctx.fillStyle = bot;
    vignette.ctx.fillRect(0, H - 90, W, 90);
  }

  /** Köşelerde projektör kuleleri: ızgara lambalar + geniş parlama. */
  function paintTowers(c, roofH) {
    var size = Math.max(26, W * 0.085);
    [W * 0.07, W * 0.93].forEach(function (x, side) {
      var y = roofH * 0.55;
      // Direk
      c.fillStyle = "#070A18";
      c.fillRect(x - 2, y, 4, roofH * 2.2);
      c.save();
      c.globalCompositeOperation = "lighter";
      var glow = c.createRadialGradient(x, y, 0, x, y, size * 4.2);
      glow.addColorStop(0, "rgba(" + P.flood + ",0.55)");
      glow.addColorStop(0.18, "rgba(" + P.flood + ",0.18)");
      glow.addColorStop(1, "rgba(" + P.flood + ",0)");
      c.fillStyle = glow;
      c.fillRect(x - size * 4.2, y - size * 4.2, size * 8.4, size * 8.4);
      // Sahaya inen hüzme
      var beam = c.createLinearGradient(x, y, W / 2, H * 0.55);
      beam.addColorStop(0, "rgba(" + P.flood + ",0.10)");
      beam.addColorStop(1, "rgba(" + P.flood + ",0)");
      c.fillStyle = beam;
      c.beginPath();
      c.moveTo(x - size * 0.5, y);
      c.lineTo(x + size * 0.5, y);
      c.lineTo(side ? W * 0.25 : W * 0.75, H * 0.6);
      c.lineTo(side ? W * 0.05 : W * 0.95, H * 0.6);
      c.closePath();
      c.fill();
      c.restore();
      // Lamba ızgarası
      var cols = 4, rows = 3, cw = size / cols, ch = (size * 0.6) / rows;
      c.fillStyle = "#1B2140";
      A.roundRect(c, x - size / 2 - 2, y - size * 0.3 - 2, size + 4, size * 0.6 + 4, 3);
      c.fill();
      for (var r = 0; r < rows; r++)
        for (var q = 0; q < cols; q++) {
          c.fillStyle = "#FFFDF0";
          c.fillRect(x - size / 2 + q * cw + 1, y - size * 0.3 + r * ch + 1, cw - 2, ch - 2);
        }
    });
  }

  /** Çim dokusu: binlerce kısa sap, uzakta küçük ve sık; iki renkte tek yol. */
  function paintGrassBlades(c, top) {
    var rand = A.seeded(4242);
    var light = new Path2D(), dark = new Path2D();
    var n = Math.round((W * (H - top)) / 90);
    for (var i = 0; i < n; i++) {
      var y = top + Math.pow(rand(), 0.8) * (H - top);
      var depth = (y - top) / Math.max(1, H - top);
      var x = rand() * W;
      var len = 1 + depth * 4;
      var p = rand() < 0.5 ? light : dark;
      p.moveTo(x, y);
      p.lineTo(x + (rand() - 0.5) * len * 0.6, y - len);
    }
    c.lineWidth = 1;
    c.strokeStyle = "rgba(190,255,190,0.07)";
    c.stroke(light);
    c.strokeStyle = "rgba(0,30,10,0.12)";
    c.stroke(dark);
  }

  /* ─────────────────────────── akış ─────────────────────────── */

  function start() {
    goals = 0;
    points = 0;
    misses = 0;
    streak = 0;
    bestStreak = 0;
    shots = 0;
    level = 1;
    keeperIdx = 0;
    A.particles.length = 0;
    A.floaters.length = 0;
    A.banner = null;
    line = null;
    prepareShot();
    state = "intro";
    introKind = "match";
    introT = 0;
    keeperEnter = 1;
    A.sound("whistle");
  }

  /** Atış öncesi sahneyi kurar (kaleci, top, rüzgâr, hedef, süre). */
  function prepareShot() {
    plan = null;
    flightT = 0;
    since = 0;
    slowmo = 1;
    ball = spotBall();
    trail = [];
    spin = 0;
    roll = 0;
    keeper = restingKeeper();
    outcome = null;
    drag = null;
    zoomTarget = 1;
    runT = 0;
    pendingShot = null;
    pose = { run: 0, kick: 0, celebrate: 0, despair: 0 };
    // Kariyer avantajı: gerçek penaltı/frikik golü olan oyuncunun atış süresi
    // en çok %10 uzar (Elit Kart perks.penalti.aimBonus). Beceri belirleyici kalır.
    var bonus = A.perks && A.perks.penalti ? A.clamp(Number(A.perks.penalti.aimBonus) || 0, 0, 0.1) : 0;
    clockMax = lerpD(8, 4) * (1 + bonus);
    clock = clockMax;
    // Rüzgâr: seviye 3'ten sonra her atışta yeni yön/şiddet (metre sapma).
    if (level >= 3) {
      var max = level >= 6 ? 1.4 : level >= 4 ? 1.0 : 0.7;
      wind = (Math.random() < 0.5 ? -1 : 1) * A.rand(0.25, 1) * max;
    } else wind = 0;
    // Hedef halkası: seviye yükseldikçe küçülür, köşeye kayar.
    var corner = Math.min(1, 0.35 + difficulty() * 0.8);
    var side = Math.random() < 0.5 ? -1 : 1;
    target = {
      x: 0.5 + side * A.rand(0.12, 0.38) * (0.6 + 0.4 * corner),
      y: A.rand(0.25, 0.55 + 0.3 * corner),
      r: lerpD(0.62, 0.36),
      pulse: 0,
    };
  }

  function nextShot() {
    prepareShot();
    var want = Math.min(level - 1, keepers.length - 1);
    if (want !== keeperIdx) {
      keeperIdx = want;
      state = "intro";
      introKind = "keeper";
      introT = 0;
      keeperEnter = 0;
      A.sound("level");
      return;
    }
    state = "aim";
  }

  function shoot(d) {
    if (state !== "aim") return;
    if (d.length < DRAG_MIN || d.dy > -12) {
      drag = null;
      return;
    }
    var p = planShot(d);
    // İsabet: düşük isabetli atıcının topu nişandan biraz sapar.
    var acc = attr(shooter, "accuracy", 78);
    var sigma = 0.004 + ((95 - acc) / 40) * 0.024;
    p.aimX += A.gauss(0, sigma);
    p.aimY = Math.max(0, p.aimY + A.gauss(0, sigma * 0.7));
    p.wind = wind;
    pendingShot = p;
    drag = null;
    runT = 0;
    state = "runup";
    shots += 1;
  }

  /** Koşu bitti: top ayrılır. */
  function strike() {
    plan = pendingShot;
    pendingShot = null;
    flightT = 0;
    since = 0;
    trail = [];
    spin = -plan.curve * 18;
    roll = 18 + plan.power * 22;
    keeper.fromX = keeper.x;
    keeper.decideAt = lerpD(0.32, 0.12) * (1 - 0.08 * norm(attr(keeperNow(), "reflex", 75)));
    keeper.target = null;
    keeper.divedAt = null;
    state = "flight";
    zoomTarget = 1.08;
    pose.kick = 1;
    A.sound("kick");
    A.haptic("medium");
    // Çim parçaları
    var sp = proj(0, 0, D_SPOT);
    A.burst(sp.x, sp.y, 16, { angle: -Math.PI / 2, spread: 1.6, speed: 160, gravity: 520, life: 0.6, size: 3, color: ["#1F7A3D", "#2E9B53", "#7C5A35"] });
  }

  function land(result) {
    outcome = result;
    outcomeT = 0;
    outcomeTags = [];
    outcomeGain = 0;
    state = "result";
    if (result === "sure") {
      // Süre doldu: atış yok, top noktada kalır.
      streak = 0;
      misses += 1;
      pose.despair = 1;
      say("sure", null);
      A.sound("whistle");
      A.haptic("warning");
      return;
    }
    var L = landing(plan);
    var b = ball;
    b.free = true;
    var speed = 11 / plan.duration;

    if (result === "gol") {
      goals += 1;
      streak += 1;
      bestStreak = Math.max(bestStreak, streak);
      var base = 100;
      if (Math.abs(L.x - 0.5) > 0.3) {
        base += 50;
        outcomeTags.push("KÖŞE");
      }
      if (L.y > 0.62) {
        base += 50;
        outcomeTags.push("YÜKSEK");
      }
      if (Math.abs(plan.curve) > 0.4) {
        base += 50;
        outcomeTags.push("FALSO");
      }
      var tx = (target.x - L.x) * GOAL_W, ty = (target.y - L.y) * GOAL_H;
      if (Math.hypot(tx, ty) < target.r) {
        base += 150;
        outcomeTags.unshift("HEDEF");
        target.pulse = 1;
        A.sound("coin");
      }
      var mult = streakMult();
      outcomeGain = Math.round(base * mult);
      points += outcomeGain;
      scoreBump = 1;
      pose.celebrate = 1;
      b.vD = speed * 0.55;
      b.vX = 0;
      b.vY = 0;
      var col = A.clamp(Math.round(L.x * (NET_COLS - 1)), 0, NET_COLS - 1);
      var row = A.clamp(Math.round((1 - Math.min(1, L.y)) * (NET_ROWS - 1)), 0, NET_ROWS - 1);
      net[row * NET_COLS + col] = 1.6;
      netAlive = true;
      confetti();
      A.shake(6);
      boardFlash = 1;
      say("gol", L);
      A.sound("net");
      A.sound("cheer");
      A.haptic("success");
      var newLevel = 1 + Math.floor(goals / 3);
      if (newLevel > level) {
        level = newLevel;
        setTimeout(levelUp, 700);
      }
    } else {
      streak = 0;
      misses += 1;
      pose.despair = 1;
      if (result === "kurtaris") {
        var away = Math.sign(L.x - keeper.x) || 1;
        b.vD = -6;
        b.vX = away * 4.5;
        b.vY = 3.4;
        spin = -spin * 0.5;
        keeper.celebrate = 1;
        A.sound("tap");
        A.sound("groan");
        var kp = proj(b.X, b.Y, b.D);
        A.burst(kp.x, kp.y, 14, { speed: 220, gravity: 300, life: 0.45, size: 3, color: ["#FFFFFF", "#E2E8F0"], shape: "spark" });
      } else if (result === "direk") {
        b.vD = -7.5;
        b.vX = -Math.sign(b.X || 1) * 2.4;
        b.vY = 2;
        A.shake(5);
        A.sound("post");
        A.sound("groan");
      } else {
        b.vD = speed * 0.8;
        b.vX = Math.sign(b.X || 1) * 2;
        b.vY = b.Y > GOAL_H ? 1.5 : 0;
        A.sound("groan");
      }
      say(result, L);
      A.haptic("warning");
    }
  }

  function streakMult() {
    return streak >= 8 ? 3 : streak >= 5 ? 2 : streak >= 3 ? 1.5 : 1;
  }

  function levelUp() {
    // Kaleci değişiyorsa tanıtım kartı zaten seviyeyi anlatır; bant üst üste binmesin.
    if (Math.min(level - 1, keepers.length - 1) !== keeperIdx) return;
    var sub = "Kaleci daha hızlı";
    if (level === 3) sub = "Rüzgâr çıktı — nişanı telafi et";
    else if (level === 4) sub = "Rüzgâr sertleşiyor";
    else if (level === 5) sub = "Kaleci çizgide oynuyor";
    else if (level === 6) sub = "Fırtına! Süre kısalıyor";
    A.announce("SEVİYE " + level, sub);
    A.sound("level");
  }

  function confetti() {
    var p = proj(ball.X, ball.Y, ball.D);
    var kit = kitOf(shooter);
    A.burst(p.x, p.y, 80, {
      angle: -Math.PI / 2,
      spread: Math.PI * 1.3,
      speed: 440,
      gravity: 520,
      life: 1.7,
      size: 7,
      color: [kit.primary, kit.secondary, kit.primary, "#FFD24A", "#FFFFFF"],
      shape: "confetti",
      drag: 1.4,
    });
  }

  /* ─────────────────────────── spiker ─────────────────────────── */

  function zoneOf(L) {
    var h = L.x < 0.34 ? "sol" : L.x > 0.66 ? "sağ" : "orta";
    var v = L.y > 0.6 ? "üst" : "alt";
    return h === "orta" ? (v === "üst" ? "doksana yakın orta" : "ortadan") : h + " " + v + " köşe";
  }
  function say(kind, L) {
    var S = shooter.short, K = keeperNow().short;
    var list;
    if (kind === "gol") {
      var z = zoneOf(L);
      list = outcomeTags[0] === "HEDEF"
        ? [S + " tam hedefe! " + K + " izledi.", "Jilet gibi! " + S + " hedefi buldu."]
        : outcomeTags.indexOf("FALSO") >= 0
          ? [S + " falsoyla aldattı, " + K + " ters köşe!", "Kavisli vuruş, file havalandı! " + S]
          : [S + " " + (z === "ortadan" ? "ortadan" : z + "ye") + " gönderdi, " + K + " çaresiz!", "Ağlar havalandı! " + S + " affetmedi.", S + " soğukkanlı, gol!"];
      if (streak >= 3) list = [S + " durdurulamıyor! " + streak + " gol üst üste."];
    } else if (kind === "kurtaris") {
      list = [K + " uçtu, kurtardı!", K + " köşeyi okudu!", "Müthiş refleks: " + K + "!"];
    } else if (kind === "direk") {
      list = ["Direkten döndü!", S + " direği sarstı!"];
    } else if (kind === "aut") {
      list = [S + " auta gönderdi.", "Top tribünlere gitti!"];
    } else {
      list = [S + " vuruşu geciktirdi, süre doldu."];
    }
    line = { text: A.pick(list), good: kind === "gol" };
    lineT = 0;
  }

  /* ─────────────────────────── güncelleme ─────────────────────────── */

  function relaxNet() {
    var next = new Float32Array(net.length);
    var alive = false;
    for (var r = 0; r < NET_ROWS; r++) {
      for (var c2 = 0; c2 < NET_COLS; c2++) {
        var i = r * NET_COLS + c2;
        var sum = 0, n = 0;
        if (c2 > 0) (sum += net[i - 1]), n++;
        if (c2 < NET_COLS - 1) (sum += net[i + 1]), n++;
        if (r > 0) (sum += net[i - NET_COLS]), n++;
        if (r < NET_ROWS - 1) (sum += net[i + NET_COLS]), n++;
        next[i] = (net[i] + (sum / n - net[i]) * 0.22) * 0.86;
      }
    }
    for (var j = 0; j < net.length; j++) {
      net[j] = Math.abs(next[j]) < 0.003 ? 0 : next[j];
      if (net[j]) alive = true;
    }
    return alive;
  }

  var netAcc = 0;
  function update(dt) {
    scoreBump = Math.max(0, scoreBump - dt * 4);
    boardFlash = Math.max(0, boardFlash - dt * 1.2);
    if (target) target.pulse = Math.max(0, target.pulse - dt * 1.5);
    zoom = A.damp(zoom, zoomTarget, 4, dt);
    lineT += dt;
    keeperEnter = Math.min(1, keeperEnter + dt / 0.9);
    pose.kick = Math.max(0, pose.kick - dt * 1.6);
    if (state === "result") {
      pose.celebrate = pose.celebrate > 0 ? Math.min(1, pose.celebrate + dt) : 0;
      pose.despair = pose.despair > 0 ? Math.min(1, pose.despair + dt) : 0;
    }
    // Kamera topu hafifçe izler
    var wantPan = state === "flight" || state === "result" ? -ball.X * 0.06 : 0;
    panX = A.damp(panX, wantPan, 3, dt);

    if (netAlive) {
      netAcc += dt;
      while (netAcc > 1 / 60) {
        netAcc -= 1 / 60;
        netAlive = relaxNet();
      }
    }

    var k = keeper;

    if (state === "attract") {
      k.x = 0.5 + Math.sin(A.time * 1.4) * 0.05;
      k.crouch = 0.5 + 0.5 * Math.sin(A.time * 3);
      return;
    }

    if (state === "intro") {
      introT += dt;
      k.x = 0.5 + Math.sin(A.time * 1.4) * 0.04;
      k.crouch = 0.5 + 0.5 * Math.sin(A.time * 3);
      if (introT >= INTRO) {
        state = "aim";
        if (introKind === "match") A.announce("PENALTI!", "Yukarı sürükle, bırak");
      }
      return;
    }

    if (state === "aim") {
      // Seviye 5+: kaleci çizgide geniş oynar — atış anındaki yeri dalışın başlangıcıdır.
      var sway = level >= 5 ? 0.11 + 0.02 * Math.min(4, level - 5) : 0.035;
      var freq = level >= 5 ? 1.25 : 1.7;
      k.x = 0.5 + Math.sin(A.time * freq) * sway + (level >= 7 ? Math.sin(A.time * 2.9) * 0.04 : 0);
      k.crouch = 0.5 + 0.5 * Math.sin(A.time * 3.4);
      clock -= dt;
      if (clock <= 0) {
        clock = 0;
        // Parmak hâlâ sürüklüyorsa süre bitiminde atış o anki jestle çıkar.
        if (path.length > 1) {
          var held = summarize(path);
          path = [];
          if (held.length >= DRAG_MIN && held.dy <= -12) {
            shoot(held);
            return;
          }
        }
        plan = null;
        land("sure");
      }
      return;
    }

    if (state === "runup") {
      runT += dt;
      pose.run = A.clamp(runT / RUNUP, 0, 1);
      k.crouch = 0.8;
      if (runT >= RUNUP) strike();
      return;
    }

    if (state === "result") {
      outcomeT += dt;
      if (outcomeT > 1.55) {
        if (misses >= LIVES) {
          state = "over";
          A.sound("over");
          A.send("over", { score: points, stats: { goals: goals, shots: shots, level: level, bestStreak: bestStreak, keeper: Math.min(keeperIdx, keepers.length - 1) + 1, keepers: keepers.length } });
          return;
        }
        nextShot();
        return;
      }
    }

    if (!plan) return;
    var sdt = dt * slowmo;
    since += sdt;

    if (k.target == null && since >= k.decideAt) {
      k.target = keeperGuess(plan);
      k.divedAt = since;
    }
    if (k.target != null && k.divedAt != null) {
      var dive = 0.28 - difficulty() * 0.05;
      var p = A.clamp((since - k.divedAt) / dive, 0, 1);
      var e = A.smooth(p);
      var span = Math.min(1, Math.abs(k.target - k.fromX) * 2.6);
      k.x = k.fromX + (k.target - k.fromX) * e;
      k.dive = Math.sign(k.target - k.fromX) * span * Math.min(1, e * 1.6);
      k.lift = Math.sin(e * Math.PI * 0.5) * span * (state === "result" ? Math.max(0, 1 - outcomeT * 1.2) : 1);
      k.crouch = 0;
    }

    A.rotate(orient, [0, 0, 1], spin * sdt);
    A.rotate(orient, [1, 0, 0], -roll * sdt);

    if (state === "flight") {
      var close = Math.abs(landing(plan).x - k.x) < 0.25;
      slowmo = flightT > 0.78 && close && !A.reduceMotion ? 0.32 : 1;
      flightT = Math.min(1, flightT + sdt / plan.duration);
      var pos = ballAt(plan, flightT);
      ball.X = pos.X;
      ball.Y = pos.Y;
      ball.D = pos.D;
      trail.push({ X: pos.X, Y: pos.Y, D: pos.D });
      if (trail.length > 18) trail.shift();
      if (flightT >= 1) {
        slowmo = 1;
        land(resolve(plan, k.x, k.lift));
      }
      return;
    }

    /* Sonrası: serbest top */
    var b = ball;
    if (trail.length) trail.shift();
    b.vY -= 9.8 * sdt;
    b.X += b.vX * sdt;
    b.Y += b.vY * sdt;
    b.D += b.vD * sdt;
    if (b.Y < BALL_R) {
      b.Y = BALL_R;
      b.vY = Math.abs(b.vY) > 1 ? -b.vY * 0.45 : 0;
      b.vX *= 0.86;
      b.vD *= 0.86;
    }
    if (outcome === "gol" && b.D > D_GOAL + 0.25) {
      b.vD *= Math.exp(-9 * sdt);
      b.vX *= Math.exp(-6 * sdt);
      b.D = Math.min(b.D, D_NET - 0.25);
    }
    if (b.D > D_BOARDS - 0.4) {
      b.D = D_BOARDS - 0.4;
      b.vD = -Math.abs(b.vD) * 0.25;
    }
    spin *= Math.exp(-1.5 * sdt);
    roll = Math.hypot(b.vD, b.vX) * 2.2;
  }

  /* ─────────────────────────── girdi ─────────────────────────── */

  function down(p) {
    if (state !== "aim") return;
    path = [p];
    drag = null;
  }
  function move(p) {
    if (state !== "aim" || !path.length) return;
    if (path.length < 40) path.push(p);
    else path[path.length - 1] = p;
    drag = summarize(path);
  }
  function up(p) {
    if (state !== "aim" || !path.length) return;
    path.push(p);
    var d = summarize(path);
    path = [];
    shoot(d);
  }
  function summarize(pts) {
    var a = pts[0], b = pts[pts.length - 1];
    var dx = b.x - a.x, dy = b.y - a.y;
    var len = Math.hypot(dx, dy);
    var best = 0;
    if (len > 1 && pts.length > 2) {
      for (var i = 1; i < pts.length - 1; i++) {
        var q = pts[i];
        var cr = (dx * (q.y - a.y) - dy * (q.x - a.x)) / len;
        if (Math.abs(cr) > Math.abs(best)) best = cr;
      }
    }
    return { dx: dx, dy: dy, length: len, curve: len > 1 ? best / len : 0, start: a, end: b };
  }

  /* ─────────────────────────── çizim ─────────────────────────── */

  function render(c, dt) {
    var goalC = proj(0, GOAL_H * 0.5, D_GOAL);
    c.save();
    c.translate(panX * (cam.fx / D_GOAL), 0);
    if (zoom !== 1) {
      c.translate(W / 2, goalC.y);
      c.scale(zoom, zoom);
      c.translate(-W / 2, -goalC.y + (H / 2 - goalC.y) * (zoom - 1) * 0.6);
    }
    A.blit(bg);
    var boardsBottom = proj(0, 0, D_BOARDS).y;
    var boardH = (cam.fx * 0.95) / D_BOARDS;
    A.drawFlashes(c, W, 20, boardsBottom - boardH - 4, outcome === "gol" ? 12 : 2);
    var kTeam = keeperNow().team && keeperNow().team.name ? keeperNow().team.name : "ElitLig";
    var sTeam = shooter.team && shooter.team.name ? shooter.team.name : "ElitLig";
    A.drawBoards(
      c,
      W,
      boardsBottom - boardH,
      boardH,
      A.time,
      boardFlash,
      outcome === "gol" && state === "result"
        ? "GOOOL!  " + shooter.back + "  ·  "
        : "ELİTLİG ARENA  ·  " + sTeam.toLocaleUpperCase("tr-TR") + "  vs  " + kTeam.toLocaleUpperCase("tr-TR") + "  ·  ",
    );

    drawNetShadow(c);
    drawGoal(c);
    if (target && (state === "aim" || state === "runup" || state === "flight" || (state === "result" && target.pulse > 0))) drawTarget(c);

    var ballBehind = ball.D > D_KEEPER;
    if (ballBehind) drawBallAll(c);
    drawKeeper(c);
    if (!ballBehind) drawBallAll(c);
    drawShooter(c);

    if (state === "aim") drawAim(c);
    c.restore();

    drawFlare(c);
    A.drawParticles(c);
    A.blit(vignette);
    A.drawFloaters(c, dt);
    if (state !== "attract") drawHud(c);
    if (state === "intro") drawIntro(c);
    if (state === "result") drawOutcome(c);
    drawLine(c);
    A.drawBanner(c, W, H * 0.3, dt);
  }

  /** Projektör parlaması: hafif titreşen yatay ışık çizgileri (lens). */
  function drawFlare(c) {
    if (A.reduceMotion) return;
    c.save();
    c.globalCompositeOperation = "lighter";
    var roofH = Math.max(18, (proj(0, 0, D_BOARDS).y - (cam.fx * 0.95) / D_BOARDS) * 0.15);
    [W * 0.07, W * 0.93].forEach(function (x, i) {
      var y = roofH * 0.55;
      var a = 0.12 + 0.04 * Math.sin(A.time * 2.3 + i * 1.7) + boardFlash * 0.15;
      var g = c.createLinearGradient(x - W * 0.35, y, x + W * 0.35, y);
      g.addColorStop(0, "rgba(180,200,255,0)");
      g.addColorStop(0.5, "rgba(220,230,255," + a.toFixed(3) + ")");
      g.addColorStop(1, "rgba(180,200,255,0)");
      c.fillStyle = g;
      c.fillRect(x - W * 0.35, y - 1.5, W * 0.7, 3);
    });
    c.restore();
  }

  function drawNetShadow(c) {
    var half = GOAL_W / 2;
    var a = proj(-half + 0.9, 0, D_GOAL + 0.1), b = proj(half + 0.9, 0, D_GOAL + 0.1);
    var e = proj(half + 1.9, 0, D_NET + 1.6), f = proj(-half + 1.9, 0, D_NET + 1.6);
    c.fillStyle = "rgba(0,0,0,0.16)";
    c.beginPath();
    c.moveTo(a.x, a.y);
    c.lineTo(b.x, b.y);
    c.lineTo(e.x, e.y);
    c.lineTo(f.x, f.y);
    c.closePath();
    c.fill();
  }

  function drawGoal(c) {
    var half = GOAL_W / 2;
    function node(col, row) {
      var X = -half + (GOAL_W * col) / (NET_COLS - 1);
      var Y = NET_BACK_H * (1 - row / (NET_ROWS - 1));
      var push = net[row * NET_COLS + col];
      return proj(X * (1 - push * 0.05), Y, D_NET + push * 1.2);
    }
    var fl = proj(-half, 0, D_GOAL), flt = proj(-half, GOAL_H, D_GOAL), frt = proj(half, GOAL_H, D_GOAL), fr = proj(half, 0, D_GOAL);
    var bl = proj(-half, 0, D_NET), blt = proj(-half, NET_BACK_H, D_NET), brt = proj(half, NET_BACK_H, D_NET), br = proj(half, 0, D_NET);

    // Kale içi karanlık (üstte daha koyu)
    var inside = c.createLinearGradient(0, flt.y, 0, fl.y);
    inside.addColorStop(0, "rgba(6,10,26,0.42)");
    inside.addColorStop(1, "rgba(6,10,26,0.18)");
    c.fillStyle = inside;
    c.beginPath();
    c.moveTo(fl.x, fl.y);
    c.lineTo(flt.x, flt.y);
    c.lineTo(frt.x, frt.y);
    c.lineTo(fr.x, fr.y);
    c.closePath();
    c.fill();

    // Arka ağ
    c.strokeStyle = "rgba(240,245,250,0.40)";
    c.lineWidth = 0.7;
    c.beginPath();
    for (var col = 0; col < NET_COLS; col++)
      for (var row = 0; row < NET_ROWS; row++) {
        var p = node(col, row);
        if (row === 0) c.moveTo(p.x, p.y);
        else c.lineTo(p.x, p.y);
      }
    for (var r2 = 0; r2 < NET_ROWS; r2++)
      for (var c2 = 0; c2 < NET_COLS; c2++) {
        var q = node(c2, r2);
        if (c2 === 0) c.moveTo(q.x, q.y);
        else c.lineTo(q.x, q.y);
      }
    c.stroke();
    // Ağ düğümlerinde ışık
    c.fillStyle = "rgba(255,255,255,0.22)";
    for (var rr0 = 0; rr0 < NET_ROWS; rr0 += 2)
      for (var cc0 = 0; cc0 < NET_COLS; cc0 += 2) {
        var nn = node(cc0, rr0);
        c.fillRect(nn.x - 0.6, nn.y - 0.6, 1.2, 1.2);
      }

    // Yan ve tavan ağları
    c.strokeStyle = "rgba(240,245,250,0.24)";
    c.lineWidth = 0.6;
    c.beginPath();
    for (var i = 0; i <= 8; i++) {
      var d = D_GOAL + ((D_NET - D_GOAL) * i) / 8;
      var top = GOAL_H + ((NET_BACK_H - GOAL_H) * i) / 8;
      var a = proj(-half, 0, d), b = proj(-half, top, d), e = proj(half, top, d), f = proj(half, 0, d);
      c.moveTo(a.x, a.y);
      c.lineTo(b.x, b.y);
      c.lineTo(e.x, e.y);
      c.lineTo(f.x, f.y);
    }
    for (var cc = 0; cc < NET_COLS; cc++) {
      var X = -half + (GOAL_W * cc) / (NET_COLS - 1);
      var u = proj(X, GOAL_H, D_GOAL), v = proj(X, NET_BACK_H, D_NET);
      c.moveTo(u.x, u.y);
      c.lineTo(v.x, v.y);
    }
    for (var rr = 1; rr < 9; rr++) {
      var fr2 = rr / 9;
      [-half, half].forEach(function (XX) {
        var u2 = proj(XX, GOAL_H * fr2, D_GOAL), v2 = proj(XX, NET_BACK_H * fr2, D_NET);
        c.moveTo(u2.x, u2.y);
        c.lineTo(v2.x, v2.y);
      });
    }
    c.stroke();

    // Arka çerçeve
    var post = fl.s * 0.12;
    c.strokeStyle = "rgba(184,192,204,0.9)";
    c.lineWidth = post * 0.35;
    c.lineJoin = "round";
    c.beginPath();
    c.moveTo(fl.x, fl.y);
    c.lineTo(bl.x, bl.y);
    c.lineTo(blt.x, blt.y);
    c.lineTo(brt.x, brt.y);
    c.lineTo(br.x, br.y);
    c.lineTo(fr.x, fr.y);
    c.moveTo(flt.x, flt.y);
    c.lineTo(blt.x, blt.y);
    c.moveTo(frt.x, frt.y);
    c.lineTo(brt.x, brt.y);
    c.stroke();

    // Direk gölgeleri (iki projektörden)
    c.strokeStyle = "rgba(0,0,0,0.22)";
    c.lineWidth = post;
    c.lineCap = "round";
    var s1 = proj(-half + 1.6, 0, D_GOAL + 2.4), s2 = proj(half + 1.6, 0, D_GOAL + 2.4);
    var s3 = proj(-half - 1.2, 0, D_GOAL + 2.0), s4 = proj(half - 1.2, 0, D_GOAL + 2.0);
    c.beginPath();
    c.moveTo(fl.x, fl.y);
    c.lineTo(s1.x, s1.y);
    c.moveTo(fr.x, fr.y);
    c.lineTo(s2.x, s2.y);
    c.stroke();
    c.strokeStyle = "rgba(0,0,0,0.12)";
    c.beginPath();
    c.moveTo(fl.x, fl.y);
    c.lineTo(s3.x, s3.y);
    c.moveTo(fr.x, fr.y);
    c.lineTo(s4.x, s4.y);
    c.stroke();

    // Ön çerçeve — silindir gölgeli, parlak
    function postRect(x, y1, y2) {
      var g = c.createLinearGradient(x - post / 2, 0, x + post / 2, 0);
      g.addColorStop(0, "#AEB7C4");
      g.addColorStop(0.35, "#FFFFFF");
      g.addColorStop(0.6, "#E9EDF3");
      g.addColorStop(1, "#8E98A7");
      c.fillStyle = g;
      c.fillRect(x - post / 2, y1, post, y2 - y1);
    }
    postRect(fl.x, flt.y - post / 2, fl.y);
    postRect(fr.x, frt.y - post / 2, fr.y);
    var gb = c.createLinearGradient(0, flt.y - post / 2, 0, flt.y + post / 2);
    gb.addColorStop(0, "#FFFFFF");
    gb.addColorStop(0.6, "#E2E7EE");
    gb.addColorStop(1, "#97A1AF");
    c.fillStyle = gb;
    c.fillRect(flt.x - post / 2, flt.y - post / 2, frt.x - flt.x + post, post);
    if (outcome === "direk" && state === "result" && outcomeT < 0.5) {
      c.save();
      c.globalCompositeOperation = "lighter";
      c.strokeStyle = "rgba(255,255,255," + (0.6 * (1 - outcomeT / 0.5)).toFixed(3) + ")";
      c.lineWidth = post * 1.6;
      c.beginPath();
      c.moveTo(fl.x, fl.y);
      c.lineTo(flt.x, flt.y);
      c.lineTo(frt.x, frt.y);
      c.lineTo(fr.x, fr.y);
      c.stroke();
      c.restore();
    }
  }

  function drawTarget(c) {
    var X = (target.x - 0.5) * GOAL_W;
    var Y = target.y * GOAL_H + BALL_R;
    var p = proj(X, Y, D_GOAL - 0.05);
    var r = target.r * p.s;
    var pulse = 1 + 0.06 * Math.sin(A.time * 5) + target.pulse * 0.5;
    c.save();
    c.translate(p.x, p.y);
    c.scale(pulse, pulse);
    c.globalCompositeOperation = "lighter";
    var g = c.createRadialGradient(0, 0, r * 0.2, 0, 0, r * 1.3);
    g.addColorStop(0, "rgba(255,210,74,0.0)");
    g.addColorStop(0.7, "rgba(255,210,74,0.22)");
    g.addColorStop(1, "rgba(255,210,74,0)");
    c.fillStyle = g;
    c.beginPath();
    c.arc(0, 0, r * 1.3, 0, Math.PI * 2);
    c.fill();
    c.globalCompositeOperation = "source-over";
    c.strokeStyle = "rgba(255,210,74,0.95)";
    c.lineWidth = Math.max(2, r * 0.09);
    c.setLineDash([r * 0.25, r * 0.16]);
    c.lineDashOffset = -A.time * r * 0.6;
    c.beginPath();
    c.arc(0, 0, r, 0, Math.PI * 2);
    c.stroke();
    c.setLineDash([]);
    c.fillStyle = "rgba(255,210,74,0.9)";
    c.beginPath();
    c.arc(0, 0, Math.max(2, r * 0.12), 0, Math.PI * 2);
    c.fill();
    c.font = A.font(Math.max(9, r * 0.32), 900);
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillStyle = "rgba(255,230,150,0.95)";
    c.fillText("+150", 0, -r - Math.max(8, r * 0.25));
    c.restore();
  }

  function drawBallAll(c) {
    var b = ball;
    var bp = proj(b.X, b.Y, b.D);
    var gp = proj(b.X, 0, b.D);
    var r = bp.s * BALL_R;
    var hgt = A.clamp((b.Y - BALL_R) / 2.5, 0, 1);
    c.fillStyle = "rgba(0,0,0," + (0.42 * (1 - hgt * 0.7)).toFixed(3) + ")";
    c.beginPath();
    c.ellipse(gp.x + r * 0.2, gp.y, r * (1.1 + hgt * 0.6), r * 0.32, 0, 0, Math.PI * 2);
    c.fill();
    // Hız izi: kuyrukta incelen, parlayan şerit
    if (trail.length > 2) {
      c.save();
      c.globalCompositeOperation = "lighter";
      c.lineCap = "round";
      for (var i = 1; i < trail.length; i++) {
        var p0 = proj(trail[i - 1].X, trail[i - 1].Y, trail[i - 1].D);
        var p1 = proj(trail[i].X, trail[i].Y, trail[i].D);
        var f = i / trail.length;
        c.strokeStyle = "rgba(255,255,255," + (f * 0.28).toFixed(3) + ")";
        c.lineWidth = p1.s * BALL_R * 1.6 * f;
        c.beginPath();
        c.moveTo(p0.x, p0.y);
        c.lineTo(p1.x, p1.y);
        c.stroke();
      }
      c.restore();
    }
    A.drawBall(c, bp.x, bp.y, r, orient);
  }

  /* — Figürler: eklemli, metre biriminde çizilir — */
  var limb = A.limb;

  function drawKeeper(c) {
    var k = keeper;
    var kp = keeperNow();
    var kit = kitOf(kp);
    var enter = A.smooth(keeperEnter);
    var bodyX = (k.x - 0.5) * GOAL_W - k.dive * 1.05 + (1 - enter) * (GOAL_W * 0.75);
    var base = proj(bodyX, 0, D_KEEPER);
    var s = base.s; // px / metre
    var dive = k.dive;
    var lift = k.lift;
    var crouch = k.crouch;
    var cheer = state === "result" && outcome === "kurtaris" ? A.clamp((outcomeT - 0.45) / 0.3, 0, 1) : 0;
    if (cheer > 0) {
      dive *= 1 - cheer;
      lift *= 1 - cheer;
    }

    // Gölge (iki ışık kaynağı)
    c.fillStyle = "rgba(0,0,0," + (0.32 * (1 - lift * 0.5)).toFixed(3) + ")";
    c.beginPath();
    c.ellipse(base.x + dive * s * 0.6, base.y, s * (0.55 + Math.abs(dive) * 0.7), s * 0.09, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "rgba(0,0,0,0.12)";
    c.beginPath();
    c.ellipse(base.x + s * 0.5, base.y + s * 0.02, s * 0.6, s * 0.07, -0.2, 0, Math.PI * 2);
    c.fill();

    c.save();
    c.translate(base.x, base.y);
    c.scale(s, s); // artık birim metre, y yukarı negatif

    var hipY = -(0.95 - crouch * 0.12) - lift * 0.75 - cheer * 0.12 * Math.abs(Math.sin(A.time * 9));
    var ang = dive * 1.25; // radyan
    c.translate(0, hipY);
    c.rotate(ang);

    var jersey = c.createLinearGradient(-0.3, -0.6, 0.3, 0);
    jersey.addColorStop(0, shade(kit.primary, 0.2));
    jersey.addColorStop(0.55, kit.primary);
    jersey.addColorStop(1, shade(kit.primary, -0.35));
    var sleeve = shade(kit.primary, -0.1);
    var skin = "#E3AE86";
    var shorts = shade(kit.primary, -0.55);
    var sock = kit.secondary;
    var a = Math.abs(dive);

    // Bacaklar: hazırda açık ve dizler kırık, dalışta birleşik ve uzanmış
    var spread = 0.2 * (1 - a) + 0.06;
    var knee = 0.08 * crouch * (1 - a);
    var footY = 0.9 - crouch * 0.1 * (1 - a);
    limb(c, -0.1, 0, -spread - knee, 0.48, 0.09, 0.07, shorts);
    limb(c, -spread - knee, 0.48, -spread * 1.05, footY, 0.07, 0.05, sock);
    limb(c, 0.1, 0, spread + knee, 0.48, 0.09, 0.07, shorts);
    limb(c, spread + knee, 0.48, spread * 1.05, footY, 0.07, 0.05, sock);
    // Kramponlar
    c.fillStyle = "#0B1020";
    c.beginPath();
    c.ellipse(-spread * 1.05, footY + 0.03, 0.09, 0.045, 0, 0, Math.PI * 2);
    c.ellipse(spread * 1.05, footY + 0.03, 0.09, 0.045, 0, 0, Math.PI * 2);
    c.fill();

    // Şort
    c.fillStyle = shorts;
    A.roundRect(c, -0.21, -0.1, 0.42, 0.28, 0.05);
    c.fill();

    // Kollar: hazırda yana-aşağı (eller açık), dalışta başın üstünde, sevinçte yumruk havada
    var armUp = Math.max(a, cheer);
    function arm(side) {
      var sx = side * 0.22, sy = -0.5;
      var readyX = side * 0.5, readyY = -0.18 + crouch * 0.06;
      var reachX = side * 0.18 + Math.sign(dive || side) * 0.1, reachY = -1.15;
      if (cheer > 0 && side === 1) {
        reachX = 0.3;
        reachY = -1.2;
      }
      var hx = A.lerp(readyX, reachX, armUp), hy = A.lerp(readyY, reachY, armUp);
      var ex = (sx + hx) / 2 + side * 0.1 * (1 - armUp), ey = (sy + hy) / 2;
      limb(c, sx, sy, ex, ey, 0.07, 0.058, sleeve);
      limb(c, ex, ey, hx, hy, 0.058, 0.052, sleeve);
      // Eldiven: geniş avuç + bilek bandı
      c.fillStyle = "#F8FAFC";
      c.beginPath();
      c.ellipse(hx, hy, 0.1, 0.085, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = kit.secondary === "#FFFFFF" || luma(kit.secondary) > 0.85 ? "#22C55E" : kit.secondary;
      c.beginPath();
      c.ellipse(hx, hy + (hy > sy ? -0.07 : 0.07), 0.07, 0.03, 0, 0, Math.PI * 2);
      c.fill();
    }
    arm(-1);
    arm(1);

    // Gövde
    c.fillStyle = jersey;
    c.beginPath();
    c.moveTo(-0.21, -0.06);
    c.lineTo(-0.27, -0.55);
    c.quadraticCurveTo(0, -0.66, 0.27, -0.55);
    c.lineTo(0.21, -0.06);
    c.closePath();
    c.fill();
    // Göğüste dikey ışık
    c.fillStyle = "rgba(255,255,255,0.10)";
    c.fillRect(-0.1, -0.58, 0.06, 0.5);
    // Yaka + numara
    var ink = inkOn(kit);
    c.strokeStyle = ink;
    c.lineWidth = 0.028;
    c.beginPath();
    c.moveTo(-0.07, -0.6);
    c.lineTo(0, -0.52);
    c.lineTo(0.07, -0.6);
    c.stroke();
    c.font = "900 0.2px " + A.FONT;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillStyle = ink;
    c.fillText(String(kp.shirt || 1), 0, -0.27);

    // Baş
    c.fillStyle = skin;
    c.fillRect(-0.045, -0.7, 0.09, 0.1);
    c.beginPath();
    c.arc(0, -0.8, 0.11, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#24160F";
    c.beginPath();
    c.arc(0, -0.83, 0.113, Math.PI * 1.05, Math.PI * 1.95);
    c.fill();
    c.fillStyle = "rgba(0,0,0,0.25)";
    c.beginPath();
    c.ellipse(0, -0.77, 0.07, 0.025, 0, 0, Math.PI * 2);
    c.fill();

    c.restore();
  }

  /**
   * Atıcı — arkadan, topun sol arkasında. Formanın sırtında soyadı ve numarası.
   * Koşu: üç adımda topa gelir; vuruş: sağ bacak ileri savrulur; sonra gol
   * sevinci (kollar havada, zıplar) ya da hayal kırıklığı (eller başta).
   */
  function drawShooter(c) {
    var kit = kitOf(shooter);
    var run = state === "runup" ? pose.run : state === "flight" || state === "result" || state === "over" ? 1 : 0;
    var e = A.smooth(run);
    var X = A.lerp(-0.78, -0.34, e);
    var D = A.lerp(D_SPOT - 1.3, D_SPOT - 0.42, e);
    var cel = state === "result" ? pose.celebrate : 0;
    var des = state === "result" ? pose.despair : 0;
    var hop = cel > 0 ? Math.abs(Math.sin(A.time * 8)) * 0.22 * Math.min(1, cel * 3) : 0;
    var base = proj(X, 0, D);
    var s = base.s;
    // Bekleme: hafif nefes; koşu: gövde öne eğik, iner-kalkar
    var breathe = state === "aim" || state === "intro" ? Math.sin(A.time * 2.2) * 0.01 : 0;
    var bob = state === "runup" ? Math.abs(Math.sin(run * Math.PI * 3)) * 0.05 : 0;
    var lean = state === "runup" ? 0.12 : pose.kick > 0 ? 0.18 * pose.kick : 0;

    c.save();
    // Gölge
    c.fillStyle = "rgba(0,0,0,0.3)";
    c.beginPath();
    c.ellipse(base.x + s * 0.15, base.y, s * 0.42, s * 0.08, 0, 0, Math.PI * 2);
    c.fill();

    c.translate(base.x, base.y);
    c.scale(s, s);
    c.translate(0, -hop - bob);

    var jersey = c.createLinearGradient(-0.3, -1.5, 0.3, -0.9);
    jersey.addColorStop(0, shade(kit.primary, 0.18));
    jersey.addColorStop(0.5, kit.primary);
    jersey.addColorStop(1, shade(kit.primary, -0.4));
    var shorts = luma(kit.secondary) > 0.85 ? "#F1F5F9" : kit.secondary;
    var sock = kit.primary;
    var skin = "#D9A27C";

    // Bacaklar (arkadan): koşuda sırayla, vuruşta sağ bacak ileri (yukarı-küçük)
    var stride = state === "runup" ? Math.sin(run * Math.PI * 3) : 0;
    var kick = pose.kick;
    function leg(side, phase) {
      var hipX = side * 0.1, hipY = -0.92;
      var footX = side * 0.16;
      var footY = -0.02 - Math.max(0, phase) * 0.18;
      var kneeX = side * 0.13, kneeY = -0.48 - Math.max(0, phase) * 0.12;
      if (side === 1 && kick > 0) {
        // Vuruş: ayak ileri savrulur → arkadan bakınca yukarı kalkar, kısalır
        footY = -0.25 - kick * 0.35;
        footX = 0.05;
        kneeY = -0.62 - kick * 0.1;
        kneeX = 0.1;
      }
      limb(c, hipX, hipY, kneeX, kneeY, 0.085, 0.07, skin);
      limb(c, kneeX, kneeY, footX, footY, 0.068, 0.055, sock);
      c.fillStyle = "#0B1020";
      c.beginPath();
      c.ellipse(footX, footY + 0.02, 0.07, 0.04, 0, 0, Math.PI * 2);
      c.fill();
    }
    leg(-1, -stride);
    leg(1, stride);

    // Şort
    c.fillStyle = shorts;
    A.roundRect(c, -0.2, -1.04, 0.4, 0.26, 0.05);
    c.fill();
    c.fillStyle = "rgba(0,0,0,0.12)";
    c.fillRect(-0.005, -1.0, 0.01, 0.2);

    c.save();
    c.translate(0, -0.98);
    c.rotate(-lean * 0.3);

    // Kollar
    function arm(side) {
      var sx = side * 0.24, sy = -0.46;
      var hx, hy;
      if (cel > 0) {
        hx = side * 0.36;
        hy = -0.98 - Math.sin(A.time * 8 + side) * 0.03;
      } else if (des > 0) {
        hx = side * 0.1;
        hy = -0.66;
      } else if (state === "runup") {
        hx = side * 0.3;
        hy = -0.08 - side * stride * 0.12;
      } else if (kick > 0) {
        hx = side * 0.45;
        hy = -0.35 + side * 0.08;
      } else {
        hx = side * 0.3;
        hy = -0.02 + breathe;
      }
      var ex = (sx + hx) / 2 + side * 0.07, ey = (sy + hy) / 2;
      limb(c, sx, sy, ex, ey, 0.065, 0.055, shade(kit.primary, -0.08));
      limb(c, ex, ey, hx, hy, 0.052, 0.045, skin);
    }
    arm(-1);
    arm(1);

    // Sırt
    c.fillStyle = jersey;
    c.beginPath();
    c.moveTo(-0.2, 0.04);
    c.lineTo(-0.26, -0.44);
    c.quadraticCurveTo(0, -0.54 + breathe, 0.26, -0.44);
    c.lineTo(0.2, 0.04);
    c.closePath();
    c.fill();
    // Omuz dikişi + yan şerit
    c.fillStyle = rgba(kit.secondary, 0.55);
    c.fillRect(-0.25, -0.43, 0.035, 0.36);
    c.fillRect(0.215, -0.43, 0.035, 0.36);
    // Sırtta soyadı ve numara
    var ink = inkOn(kit);
    c.fillStyle = ink;
    c.textAlign = "center";
    c.textBaseline = "middle";
    var nm = String(shooter.back || "").slice(0, 12);
    var fs = nm.length > 8 ? 0.055 : 0.07;
    c.font = "800 " + fs + "px " + A.FONT;
    c.fillText(nm, 0, -0.37);
    c.font = "900 0.22px " + A.FONT;
    c.fillText(String(shooter.shirt || 10), 0, -0.17);

    // Baş (arkadan): saç
    c.fillStyle = skin;
    c.fillRect(-0.045, -0.56, 0.09, 0.08);
    c.fillStyle = "#1E140E";
    c.beginPath();
    c.arc(0, -0.65, 0.105, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "rgba(255,255,255,0.07)";
    c.beginPath();
    c.arc(-0.03, -0.69, 0.05, 0, Math.PI * 2);
    c.fill();
    // Kulaklar
    c.fillStyle = skin;
    c.beginPath();
    c.ellipse(-0.105, -0.64, 0.02, 0.03, 0, 0, Math.PI * 2);
    c.ellipse(0.105, -0.64, 0.02, 0.03, 0, 0, Math.PI * 2);
    c.fill();
    c.restore();

    c.restore();
  }

  function drawAim(c) {
    var spot = proj(0, BALL_R, D_SPOT);
    var r = spot.s * BALL_R;

    // Atış süresi halkası — topun etrafında
    var frac = clock / clockMax;
    c.save();
    c.lineWidth = 4;
    c.strokeStyle = "rgba(255,255,255,0.18)";
    c.beginPath();
    c.arc(spot.x, spot.y, r * 2.3, 0, Math.PI * 2);
    c.stroke();
    c.strokeStyle = frac < 0.3 ? P.bad : "rgba(255,255,255,0.75)";
    c.lineCap = "round";
    c.beginPath();
    c.arc(spot.x, spot.y, r * 2.3, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
    c.stroke();
    c.restore();

    if (!drag || drag.length < DRAG_MIN) {
      for (var i = 0; i < 3; i++) {
        var y = spot.y - r * 3 - i * r * 1.4;
        var al = 0.25 + 0.55 * Math.max(0, Math.sin(A.time * 3.2 - i * 0.9));
        c.strokeStyle = "rgba(255,255,255," + al.toFixed(3) + ")";
        c.lineWidth = Math.max(2.5, r * 0.24);
        c.lineCap = "round";
        c.lineJoin = "round";
        c.beginPath();
        c.moveTo(spot.x - r * 0.85, y + r * 0.45);
        c.lineTo(spot.x, y - r * 0.2);
        c.lineTo(spot.x + r * 0.85, y + r * 0.45);
        c.stroke();
      }
      return;
    }

    // Önizleme RÜZGÂRSIZ ve sapmasız: rüzgârı ve isabeti oyuncu kendisi yönetir.
    var pl = planShot(drag);
    var L = { x: pl.aimX, y: pl.aimY };
    var on = L.x >= 0.025 && L.x <= 0.975 && L.y <= 1.03;
    var tint = on ? "255,255,255" : "251,113,133";
    for (var j = 1; j <= 18; j++) {
      var t = j / 18;
      var bp = ballAt(pl, t);
      var sp = proj(bp.X, bp.Y, bp.D);
      c.fillStyle = "rgba(" + tint + "," + (0.3 + 0.6 * (1 - t)).toFixed(3) + ")";
      c.beginPath();
      c.arc(sp.x, sp.y, Math.max(1.4, sp.s * 0.05), 0, Math.PI * 2);
      c.fill();
    }
    var end = ballAt(pl, 1);
    var tp = proj(end.X, end.Y, D_GOAL);
    var tr = tp.s * 0.3;
    c.strokeStyle = "rgba(" + tint + ",0.95)";
    c.fillStyle = "rgba(" + tint + ",0.12)";
    c.lineWidth = 2;
    c.beginPath();
    c.arc(tp.x, tp.y, tr, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    c.beginPath();
    c.moveTo(tp.x - tr * 1.6, tp.y);
    c.lineTo(tp.x - tr * 0.5, tp.y);
    c.moveTo(tp.x + tr * 0.5, tp.y);
    c.lineTo(tp.x + tr * 1.6, tp.y);
    c.moveTo(tp.x, tp.y - tr * 1.6);
    c.lineTo(tp.x, tp.y - tr * 0.5);
    c.moveTo(tp.x, tp.y + tr * 0.5);
    c.lineTo(tp.x, tp.y + tr * 1.6);
    c.stroke();

    // Güç halkası
    var pf = (pl.power - 0.35) / 0.65;
    var ring = r * 1.75;
    c.lineWidth = 5;
    c.strokeStyle = "rgba(255,255,255,0.2)";
    c.beginPath();
    c.arc(spot.x, spot.y, ring, 0, Math.PI * 2);
    c.stroke();
    c.strokeStyle = pf > 0.85 ? P.gold : P.good;
    c.lineCap = "round";
    c.beginPath();
    c.arc(spot.x, spot.y, ring, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (0.12 + pf * 0.88));
    c.stroke();

    // Falso göstergesi
    if (Math.abs(pl.curve) > 0.15) {
      c.font = A.font(12, 900);
      c.textAlign = "center";
      c.fillStyle = P.gold;
      c.fillText("FALSO " + (pl.curve > 0 ? "→" : "←"), spot.x, spot.y + ring + 18);
    }
  }

  var LABELS = { gol: "GOL!", kurtaris: "KURTARDI!", aut: "AUT!", direk: "DİREK!", sure: "SÜRE DOLDU" };

  function drawOutcome(c) {
    var t = outcomeT;
    var pop = A.easeOutBack(t / 0.35);
    var fade = A.clamp((1.55 - t) / 0.3, 0, 1);
    var good = outcome === "gol";
    c.save();
    c.globalAlpha = fade;
    var y = H * 0.5;
    A.bigText(c, LABELS[outcome], W / 2, y, 54 * (0.5 + 0.5 * pop), good ? P.gold : "#FFFFFF", {
      stroke: good ? "rgba(60,36,200,0.95)" : "rgba(160,20,50,0.9)",
    });
    if (good) {
      A.bigText(c, "+" + outcomeGain, W / 2, y + 44, 26 * pop, "#FFFFFF");
      if (outcomeTags.length) {
        c.font = A.font(12, 800);
        c.textAlign = "center";
        var tags = outcomeTags.join("  ·  ");
        var tw = c.measureText(tags).width + 24;
        A.pill(c, W / 2 - tw / 2, y + 66, tw, 24, "rgba(60,36,200,0.85)");
        c.fillStyle = "#FFFFFF";
        c.textBaseline = "middle";
        c.fillText(tags, W / 2, y + 78.5);
      }
      if (streakMult() > 1) {
        c.font = A.font(13, 900);
        c.fillStyle = P.gold;
        c.textAlign = "center";
        c.fillText(streak + " GOL SERİ · ×" + streakMult(), W / 2, y + 108);
      }
    } else {
      var left = LIVES - misses;
      c.font = A.font(14, 800);
      c.textAlign = "center";
      c.fillStyle = "rgba(255,255,255,0.9)";
      c.fillText(left > 0 ? left + " hakkın kaldı" : "Hakların bitti", W / 2, y + 40);
    }
    c.restore();
  }

  /** Spiker yorumu — alt bant, sola yaslı, takım rengi şeritli. */
  function drawLine(c) {
    if (!line || state === "attract") return;
    var life = 2.6;
    if (lineT > life) return;
    var inT = A.easeOut(lineT / 0.25);
    var out = A.clamp((life - lineT) / 0.35, 0, 1);
    c.save();
    c.globalAlpha = out;
    c.font = A.font(13, 700);
    var text = line.text;
    var maxW = W - 48;
    while (c.measureText(text).width > maxW - 30 && text.length > 8) text = text.slice(0, -2);
    if (text !== line.text) text += "…";
    var tw = Math.min(maxW, c.measureText(text).width + 34);
    var x = 16 - (1 - inT) * 40, y = H - 52;
    A.roundRect(c, x, y, tw, 32, 10);
    c.fillStyle = "rgba(8,10,30,0.82)";
    c.fill();
    c.fillStyle = line.good ? kitOf(shooter).primary : kitOf(keeperNow()).primary;
    c.fillRect(x, y + 6, 4, 20);
    c.fillStyle = "#FFFFFF";
    c.textAlign = "left";
    c.textBaseline = "middle";
    c.fillText(text, x + 16, y + 16.5);
    c.restore();
  }

  /** Eşleşme / yeni kaleci tanıtım kartı (yayın grafiği gibi). */
  function drawIntro(c) {
    var t = introT;
    var inT = A.easeOutBack(t / 0.35);
    var out = A.clamp((INTRO - t) / 0.25, 0, 1);
    var kp = keeperNow();
    c.save();
    c.globalAlpha = out;
    var cw = Math.min(W - 32, 340), ch = 96;
    var x = W / 2 - cw / 2, y = H * 0.42 - ch / 2;
    c.translate(W / 2, y + ch / 2);
    c.scale(0.85 + 0.15 * inT, 0.85 + 0.15 * inT);
    c.translate(-W / 2, -(y + ch / 2));
    A.roundRect(c, x, y, cw, ch, 16);
    c.fillStyle = "rgba(8,10,30,0.9)";
    c.fill();
    c.strokeStyle = "rgba(255,255,255,0.14)";
    c.lineWidth = 1;
    c.stroke();
    c.textBaseline = "middle";
    if (introKind === "keeper") {
      c.fillStyle = kitOf(kp).primary;
      c.fillRect(x, y + 14, 5, ch - 28);
      c.textAlign = "left";
      c.font = A.font(11, 900);
      c.fillStyle = P.gold;
      c.fillText("SEVİYE " + level + " · YENİ KALECİ " + (Math.min(keeperIdx, keepers.length - 1) + 1) + "/" + keepers.length + (keeperIdx >= keepers.length - 1 ? " · FİNAL" : ""), x + 20, y + 22);
      c.font = A.font(22, 900);
      c.fillStyle = "#FFFFFF";
      c.fillText(kp.short, x + 20, y + 48);
      c.font = A.font(12, 700);
      c.fillStyle = "rgba(255,255,255,0.75)";
      var saves = kp.stats && kp.stats.saves ? kp.stats.saves + " kurtarış" : "";
      c.fillText([kp.team && kp.team.name, saves, "Refleks " + attr(kp, "reflex", 75)].filter(Boolean).join("  ·  "), x + 20, y + 74);
    } else {
      var sk = kitOf(shooter), kk = kitOf(kp);
      c.fillStyle = sk.primary;
      c.fillRect(x, y + 14, 5, ch - 28);
      c.fillStyle = kk.primary;
      c.fillRect(x + cw - 5, y + 14, 5, ch - 28);
      c.font = A.font(11, 900);
      c.fillStyle = P.gold;
      c.textAlign = "center";
      c.fillText("PENALTI DÜELLOSU", W / 2, y + 20);
      c.font = A.font(18, 900);
      c.fillStyle = "#FFFFFF";
      c.textAlign = "left";
      c.fillText(shooter.short, x + 18, y + 50);
      c.textAlign = "right";
      c.fillText(kp.short, x + cw - 18, y + 50);
      c.textAlign = "center";
      c.font = A.font(14, 900);
      c.fillStyle = "rgba(255,255,255,0.6)";
      c.fillText("vs", W / 2, y + 50);
      c.font = A.font(11, 700);
      c.fillStyle = "rgba(255,255,255,0.7)";
      c.textAlign = "left";
      c.fillText((shooter.team && shooter.team.name) || "", x + 18, y + 74);
      c.textAlign = "right";
      c.fillText((kp.team && kp.team.name) || "", x + cw - 18, y + 74);
    }
    c.restore();
  }

  function drawHud(c) {
    var top = 14;
    A.drawScore(c, 18, top, "PUAN", points, scoreBump);
    A.drawLives(c, W - 26, top + 12, LIVES - misses, LIVES, 9);

    c.save();
    var lbl = "SEVİYE " + level;
    c.font = A.font(12, 800);
    var lw = c.measureText(lbl).width + 22;
    A.pill(c, W - 16 - lw, top + 30, lw, 26, "rgba(60,36,200,0.75)");
    c.fillStyle = "#fff";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(lbl, W - 16 - lw / 2, top + 43.5);

    if (streakMult() > 1) {
      c.font = A.font(12, 900);
      c.textAlign = "left";
      c.fillStyle = P.gold;
      c.fillText("SERİ ×" + streakMult(), 18, top + 74);
    }

    if (wind && (state === "aim" || state === "runup" || state === "flight")) {
      var cx = W / 2, cy = top + 13;
      var strength = Math.abs(wind) / 1.4;
      A.pill(c, cx - 66, top, 132, 26);
      c.save();
      c.translate(cx, cy);
      var dir = Math.sign(wind);
      c.fillStyle = strength > 0.6 ? P.bad : "#BFE3FF";
      for (var i = 0; i < 3; i++) {
        c.globalAlpha = strength > i / 3 - 0.05 ? 1 : 0.25;
        var x = dir * (-12 + i * 11) + (dir > 0 ? 18 : -18);
        c.beginPath();
        c.moveTo(x + dir * 6, 0);
        c.lineTo(x - dir * 2, -6);
        c.lineTo(x - dir * 2, 6);
        c.closePath();
        c.fill();
      }
      c.globalAlpha = 1;
      c.font = A.font(11, 800);
      c.fillStyle = "#fff";
      c.textAlign = "center";
      c.fillText("RÜZGÂR", dir > 0 ? -28 : 28, 0.5);
      c.restore();
    }
    c.restore();
    drawMatchup(c, top + 88);
  }

  /** Yayın bandı: atıcı (sol) — gol sayısı — kaleci (sağ) + kaleci merdiveni. */
  function drawMatchup(c, y) {
    var kp = keeperNow();
    var sk = kitOf(shooter), kk = kitOf(kp);
    var w = Math.min(W - 32, 360), h = 30;
    var x = W / 2 - w / 2;
    c.save();
    A.roundRect(c, x, y, w, h, 8);
    c.fillStyle = "rgba(8,10,30,0.72)";
    c.fill();
    // Takım şeritleri
    c.fillStyle = sk.primary;
    c.fillRect(x, y + 5, 4, h - 10);
    c.fillStyle = kk.primary;
    c.fillRect(x + w - 4, y + 5, 4, h - 10);
    // Orta: gol sayısı kutusu
    var bw = 46;
    A.roundRect(c, W / 2 - bw / 2, y + 3, bw, h - 6, 6);
    c.fillStyle = "rgba(255,255,255,0.12)";
    c.fill();
    c.textBaseline = "middle";
    c.textAlign = "center";
    c.font = A.font(14, 900);
    c.fillStyle = "#FFFFFF";
    c.fillText(goals + "–" + misses, W / 2, y + h / 2 + 0.5);
    var half = w / 2 - bw / 2 - 14;
    function fit(text, max) {
      var t = text;
      while (c.measureText(t).width > max && t.length > 3) t = t.slice(0, -1);
      return t === text ? t : t + "…";
    }
    c.font = A.font(12, 800);
    c.textAlign = "left";
    c.fillText(fit((shooter.shirt ? shooter.shirt + " " : "") + shooter.short, half), x + 12, y + h / 2 + 0.5);
    c.textAlign = "right";
    c.fillText(fit(kp.short, half - 26), x + w - 12, y + h / 2 + 0.5);
    // Kaleci merdiveni noktaları (sağ altta)
    var n = keepers.length;
    if (n > 1) {
      var dotW = Math.min(8, (half - 10) / n);
      for (var i = 0; i < n; i++) {
        c.fillStyle = i < keeperIdx ? "rgba(255,255,255,0.35)" : i === Math.min(keeperIdx, n - 1) ? P.gold : "rgba(255,255,255,0.15)";
        c.fillRect(x + w - 12 - (n - i) * dotW, y + h + 3, dotW - 2, 3);
      }
    }
    c.restore();
  }

  function debug() {
    return { state: state, goals: goals, points: points, misses: misses, level: level, wind: wind, keeper: keeper, keeperIdx: keeperIdx, shooter: shooter.short, plan: plan, outcome: outcome, clock: clock };
  }

  A.register({ resize: resize, start: start, update: update, render: render, down: down, move: move, up: up, debug: debug, setRoster: setRoster });
})();
