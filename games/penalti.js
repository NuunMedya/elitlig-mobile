/*
 * PENALTI — tek sürükleme jestiyle yön, güç, yükseklik ve FALSO.
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
 */
(function () {
  "use strict";
  var A = window.Arena;
  var P = A.PAL;

  /* ─────────────────────────── dünya ölçüleri (metre) ─────────────────────────── */
  var GOAL_W = 7.32, GOAL_H = 2.44, NET_BACK_H = 1.9;
  var D_GOAL = 17, D_SPOT = 6, D_NET = 19, D_KEEPER = 16.7, D_BOARDS = 21.5;
  var BALL_R = 0.14;
  var NET_COLS = 17, NET_ROWS = 9;

  var W = 0, H = 0;
  var cam = null;
  var bg = null, vignette = null;

  /* ─────────────────────────── durum ─────────────────────────── */
  var state = "attract"; // attract | aim | flight | result | over
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
  var zoom = 1, zoomTarget = 1;
  var boardFlash = 0;
  var scoreBump = 0;
  var attractT = 0;
  var path = []; // sürüklenen parmağın izi

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
    var curve = A.clamp(d.curve * 3.2, -1, 1);
    return {
      aimX: aimX,
      aimY: aimY,
      apparentX: aimX + curve * 0.22,
      curve: curve,
      power: power,
      duration: 0.46 * (1.25 - 0.45 * power),
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
    var reach = lerpD(0.16, 0.23) * (1.25 - p.power * 0.4);
    return dx < reach && L.y <= reachY ? "kurtaris" : "gol";
  }

  function keeperGuess(p) {
    var L = landing(p);
    var sigma = lerpD(0.34, 0.09);
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
    A.paintStands(c, W, roofH, boardsTop, 1907);
    A.paintRoof(c, W, roofH);
    A.paintHaze(c, W, boardsTop, H * 0.18, 1.2);

    // Çim
    var g = c.createLinearGradient(0, boardsBottom, 0, H);
    g.addColorStop(0, P.grassFar);
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
    // Kale ağzına düşen ışık
    c.save();
    c.globalCompositeOperation = "lighter";
    var gy = proj(0, 0, D_GOAL - 2).y;
    var pool = c.createRadialGradient(W / 2, gy, 0, W / 2, gy, W * 0.7);
    pool.addColorStop(0, "rgba(255,247,219,0.16)");
    pool.addColorStop(1, "rgba(255,247,219,0)");
    c.fillStyle = pool;
    c.fillRect(0, boardsBottom, W, H - boardsBottom);
    c.restore();

    // Tebeşir çizgileri
    var chalkW = (cam.fx / D_GOAL) * 0.12;
    function line(X1, D1, X2, D2, wmul) {
      var p1 = proj(X1, 0, D1), p2 = proj(X2, 0, D2);
      c.lineWidth = chalkW * (wmul || 1);
      c.beginPath();
      c.moveTo(p1.x, p1.y);
      c.lineTo(p2.x, p2.y);
      c.stroke();
    }
    c.strokeStyle = P.chalk;
    c.lineCap = "round";
    line(-40, D_GOAL, 40, D_GOAL, 1);
    var six = D_GOAL - 5.5;
    line(-9.16, D_GOAL, -9.16, six, 1.1);
    line(-9.16, six, 9.16, six, 1.1);
    line(9.16, six, 9.16, D_GOAL, 1.1);
    var box = D_GOAL - 16.5;
    line(-20.16, D_GOAL, -20.16, box + 0.3, 1.6);
    line(20.16, D_GOAL, 20.16, box + 0.3, 1.6);
    // Penaltı noktası
    var spot = proj(0, 0, D_SPOT);
    c.fillStyle = P.chalk;
    c.beginPath();
    c.ellipse(spot.x, spot.y, (cam.fx / D_SPOT) * 0.13, (cam.fx / D_SPOT) * 0.045, 0, 0, Math.PI * 2);
    c.fill();

    vignette = A.layer(W, H);
    A.paintVignette(vignette.ctx, W, H, 0.5);
    A.paintTopScrim(vignette.ctx, W, 110);
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
    A.particles.length = 0;
    A.floaters.length = 0;
    A.banner = null;
    nextShot();
    A.sound("whistle");
    A.announce("PENALTI!", "Yukarı sürükle, bırak");
  }

  function nextShot() {
    state = "aim";
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

  function shoot(d) {
    if (state !== "aim") return;
    if (d.length < DRAG_MIN || d.dy > -12) {
      drag = null;
      return;
    }
    plan = planShot(d);
    plan.wind = wind;
    flightT = 0;
    since = 0;
    trail = [];
    spin = -plan.curve * 18;
    roll = 18 + plan.power * 22;
    keeper.fromX = keeper.x;
    keeper.decideAt = lerpD(0.32, 0.12);
    keeper.target = null;
    keeper.divedAt = null;
    drag = null;
    state = "flight";
    shots += 1;
    zoomTarget = 1.08;
    A.sound("kick");
    A.haptic("medium");
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
      b.vD = speed * 0.55;
      b.vX = 0;
      b.vY = 0;
      var col = A.clamp(Math.round(L.x * (NET_COLS - 1)), 0, NET_COLS - 1);
      var row = A.clamp(Math.round((1 - Math.min(1, L.y)) * (NET_ROWS - 1)), 0, NET_ROWS - 1);
      net[row * NET_COLS + col] = 1.5;
      netAlive = true;
      confetti();
      A.shake(6);
      boardFlash = 1;
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
      if (result === "kurtaris") {
        var away = Math.sign(L.x - keeper.x) || 1;
        b.vD = -6;
        b.vX = away * 4.5;
        b.vY = 3.4;
        spin = -spin * 0.5;
        keeper.celebrate = 1;
        A.sound("tap");
        A.sound("groan");
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
      A.haptic("warning");
    }
  }

  function streakMult() {
    return streak >= 8 ? 3 : streak >= 5 ? 2 : streak >= 3 ? 1.5 : 1;
  }

  function levelUp() {
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
    A.burst(p.x, p.y, 70, {
      angle: -Math.PI / 2,
      spread: Math.PI * 1.3,
      speed: 420,
      gravity: 520,
      life: 1.6,
      size: 7,
      color: ["#5B3DF5", "#A78BFA", "#FFD24A", "#34D399", "#FB7185", "#FFFFFF", "#38BDF8"],
      shape: "confetti",
      drag: 1.4,
    });
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

    if (netAlive) {
      netAcc += dt;
      while (netAcc > 1 / 60) {
        netAcc -= 1 / 60;
        netAlive = relaxNet();
      }
    }

    var k = keeper;

    if (state === "attract") {
      attractT += dt;
      k.x = 0.5 + Math.sin(A.time * 1.4) * 0.05;
      k.crouch = 0.5 + 0.5 * Math.sin(A.time * 3);
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

    if (state === "result") {
      outcomeT += dt;
      if (outcomeT > 1.55) {
        if (misses >= LIVES) {
          state = "over";
          A.sound("over");
          A.send("over", { score: points, stats: { goals: goals, shots: shots, level: level, bestStreak: bestStreak } });
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
      k.lift = Math.sin(e * Math.PI * 0.5 + (state === "result" ? 0 : 0)) * span * (state === "result" ? Math.max(0, 1 - outcomeT * 1.2) : 1);
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
      if (trail.length > 16) trail.shift();
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
    if (zoom !== 1) {
      c.translate(W / 2, goalC.y);
      c.scale(zoom, zoom);
      c.translate(-W / 2, -goalC.y + (H / 2 - goalC.y) * (zoom - 1) * 0.6);
    }
    A.blit(bg);
    var boardsBottom = proj(0, 0, D_BOARDS).y;
    var boardH = (cam.fx * 0.95) / D_BOARDS;
    A.drawFlashes(c, W, 20, boardsBottom - boardH - 4, outcome === "gol" ? 10 : 2);
    A.drawBoards(c, W, boardsBottom - boardH, boardH, A.time, boardFlash, outcome === "gol" ? "GOOOL!  ·  " : "ELİTLİG ARENA  ·  PENALTI  ·  ");

    drawGoal(c);
    if (target && (state === "aim" || state === "flight" || (state === "result" && target.pulse > 0))) drawTarget(c);

    var ballBehind = ball.D > D_KEEPER;
    if (ballBehind) drawBallAll(c);
    drawKeeper(c);
    if (!ballBehind) drawBallAll(c);

    if (state === "aim") drawAim(c);
    c.restore();

    A.drawParticles(c);
    A.blit(vignette);
    A.drawFloaters(c, dt);
    if (state !== "attract") drawHud(c);
    if (state === "result") drawOutcome(c);
    A.drawBanner(c, W, H * 0.3, dt);
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

    // Kale içi karanlık
    c.fillStyle = "rgba(6,10,26,0.28)";
    c.beginPath();
    c.moveTo(fl.x, fl.y);
    c.lineTo(flt.x, flt.y);
    c.lineTo(frt.x, frt.y);
    c.lineTo(fr.x, fr.y);
    c.closePath();
    c.fill();

    // Arka ağ
    c.strokeStyle = "rgba(240,245,250,0.42)";
    c.lineWidth = 0.8;
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

    // Yan ve tavan ağları
    c.strokeStyle = "rgba(240,245,250,0.26)";
    c.lineWidth = 0.6;
    c.beginPath();
    for (var i = 0; i <= 6; i++) {
      var d = D_GOAL + ((D_NET - D_GOAL) * i) / 6;
      var top = GOAL_H + ((NET_BACK_H - GOAL_H) * i) / 6;
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
    for (var rr = 1; rr < 7; rr++) {
      var fr2 = rr / 7;
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

    // Direk gölgeleri
    c.strokeStyle = "rgba(0,0,0,0.25)";
    c.lineWidth = post;
    c.lineCap = "round";
    var s1 = proj(-half + 1.6, 0, D_GOAL + 2.4), s2 = proj(half + 1.6, 0, D_GOAL + 2.4);
    c.beginPath();
    c.moveTo(fl.x, fl.y);
    c.lineTo(s1.x, s1.y);
    c.moveTo(fr.x, fr.y);
    c.lineTo(s2.x, s2.y);
    c.stroke();

    // Ön çerçeve — silindir gölgeli
    function postRect(x, y1, y2) {
      var g = c.createLinearGradient(x - post / 2, 0, x + post / 2, 0);
      g.addColorStop(0, "#AEB7C4");
      g.addColorStop(0.35, "#FFFFFF");
      g.addColorStop(1, "#9AA4B2");
      c.fillStyle = g;
      c.fillRect(x - post / 2, y1, post, y2 - y1);
    }
    postRect(fl.x, flt.y - post / 2, fl.y);
    postRect(fr.x, frt.y - post / 2, fr.y);
    var gb = c.createLinearGradient(0, flt.y - post / 2, 0, flt.y + post / 2);
    gb.addColorStop(0, "#FFFFFF");
    gb.addColorStop(1, "#A7B0BD");
    c.fillStyle = gb;
    c.fillRect(flt.x - post / 2, flt.y - post / 2, frt.x - flt.x + post, post);
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
    for (var i = 0; i < trail.length; i++) {
      var tp = proj(trail[i].X, trail[i].Y, trail[i].D);
      var f = (i + 1) / trail.length;
      c.fillStyle = "rgba(255,255,255," + (f * 0.2).toFixed(3) + ")";
      c.beginPath();
      c.arc(tp.x, tp.y, tp.s * BALL_R * (0.35 + f * 0.55), 0, Math.PI * 2);
      c.fill();
    }
    A.drawBall(c, bp.x, bp.y, r, orient);
  }

  /* — Kaleci: eklemli figür, metre biriminde çizilir — */
  var limb = A.limb;

  function drawKeeper(c) {
    var k = keeper;
    var bodyX = (k.x - 0.5) * GOAL_W - k.dive * 1.05;
    var base = proj(bodyX, 0, D_KEEPER);
    var s = base.s; // px / metre
    var dive = k.dive;
    var lift = k.lift;
    var crouch = k.crouch;

    // Gölge
    c.fillStyle = "rgba(0,0,0," + (0.35 * (1 - lift * 0.5)).toFixed(3) + ")";
    c.beginPath();
    c.ellipse(base.x + dive * s * 0.6, base.y, s * (0.55 + Math.abs(dive) * 0.7), s * 0.09, 0, 0, Math.PI * 2);
    c.fill();

    c.save();
    c.translate(base.x, base.y);
    c.scale(s, s); // artık birim metre, y yukarı negatif

    var hipY = -(0.95 - crouch * 0.12) - lift * 0.75;
    var ang = dive * 1.25; // radyan
    c.translate(0, hipY);
    c.rotate(ang);

    var jersey = c.createLinearGradient(-0.3, -0.6, 0.3, 0);
    jersey.addColorStop(0, "#F2FF5A");
    jersey.addColorStop(1, "#B9C51E");
    var skin = "#E3AE86";
    var dark = "#111827";
    var a = Math.abs(dive);

    // Bacaklar: hazırda açık ve dizler kırık, dalışta birleşik ve uzanmış
    var spread = 0.2 * (1 - a) + 0.06;
    var knee = 0.08 * crouch * (1 - a);
    limb(c, -0.1, 0, -spread - knee, 0.48, 0.085, 0.07, dark);
    limb(c, -spread - knee, 0.48, -spread * 1.05, 0.9 - crouch * 0.1 * (1 - a), 0.07, 0.05, "#E6F23C");
    limb(c, 0.1, 0, spread + knee, 0.48, 0.085, 0.07, dark);
    limb(c, spread + knee, 0.48, spread * 1.05, 0.9 - crouch * 0.1 * (1 - a), 0.07, 0.05, "#E6F23C");
    // Kramponlar
    c.fillStyle = "#0B1020";
    c.beginPath();
    c.ellipse(-spread * 1.05, 0.93 - crouch * 0.1 * (1 - a), 0.09, 0.045, 0, 0, Math.PI * 2);
    c.ellipse(spread * 1.05, 0.93 - crouch * 0.1 * (1 - a), 0.09, 0.045, 0, 0, Math.PI * 2);
    c.fill();

    // Şort
    c.fillStyle = dark;
    A.roundRect(c, -0.2, -0.1, 0.4, 0.26, 0.05);
    c.fill();

    // Kollar: hazırda yana-aşağı, dalışta başın üstünde dalış yönüne
    var armUp = a; // 0 hazır, 1 tam uzanmış
    function arm(side) {
      var sx = side * 0.22, sy = -0.5;
      var readyX = side * 0.48, readyY = -0.12 + crouch * 0.05;
      var reachX = side * 0.18 + Math.sign(dive || side) * 0.1, reachY = -1.15;
      var hx = A.lerp(readyX, reachX, armUp), hy = A.lerp(readyY, reachY, armUp);
      var ex = (sx + hx) / 2 + side * 0.08 * (1 - armUp), ey = (sy + hy) / 2;
      limb(c, sx, sy, ex, ey, 0.065, 0.055, "#D7E331");
      limb(c, ex, ey, hx, hy, 0.055, 0.05, "#D7E331");
      // Eldiven
      c.fillStyle = "#F8FAFC";
      c.beginPath();
      c.arc(hx, hy, 0.085, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = "#22C55E";
      c.beginPath();
      c.arc(hx, hy + (hy > sy ? -0.06 : 0.06), 0.05, 0, Math.PI * 2);
      c.fill();
    }
    arm(-1);
    arm(1);

    // Gövde
    c.fillStyle = jersey;
    c.beginPath();
    c.moveTo(-0.2, -0.06);
    c.lineTo(-0.26, -0.55);
    c.quadraticCurveTo(0, -0.64, 0.26, -0.55);
    c.lineTo(0.2, -0.06);
    c.closePath();
    c.fill();
    // Forma detayları: yaka + omuz şeritleri
    c.strokeStyle = dark;
    c.lineWidth = 0.025;
    c.beginPath();
    c.moveTo(-0.07, -0.6);
    c.lineTo(0, -0.52);
    c.lineTo(0.07, -0.6);
    c.stroke();
    c.fillStyle = "rgba(17,24,39,0.85)";
    c.fillRect(-0.2, -0.3, 0.4, 0.035);
    c.font = "900 0.17px " + A.FONT;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillStyle = "#111827";
    c.fillText("1", 0, -0.17);

    // Baş
    c.fillStyle = skin;
    c.fillRect(-0.045, -0.7, 0.09, 0.1);
    c.beginPath();
    c.arc(0, -0.8, 0.11, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#24160F";
    c.beginPath();
    c.arc(0, -0.83, 0.112, Math.PI * 1.05, Math.PI * 1.95);
    c.fill();
    // Göz/yüz gölgesi
    c.fillStyle = "rgba(0,0,0,0.25)";
    c.beginPath();
    c.ellipse(0, -0.77, 0.07, 0.025, 0, 0, Math.PI * 2);
    c.fill();

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

    // Önizleme RÜZGÂRSIZ: rüzgârı oyuncu kendisi telafi eder.
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
    var y = H * 0.56;
    A.bigText(c, LABELS[outcome], W / 2, y, 52 * (0.5 + 0.5 * pop), good ? P.gold : "#FFFFFF", {
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

    var gl = goals + " gol";
    var gw = c.measureText(gl).width + 22;
    A.pill(c, W - 16 - gw, top + 62, gw, 26);
    c.fillStyle = "rgba(255,255,255,0.9)";
    c.fillText(gl, W - 16 - gw / 2, top + 75.5);

    if (streakMult() > 1) {
      c.font = A.font(12, 900);
      c.textAlign = "left";
      c.fillStyle = P.gold;
      c.fillText("SERİ ×" + streakMult(), 18, top + 74);
    }

    if (wind && (state === "aim" || state === "flight")) {
      var cx = W / 2, cy = top + 13;
      var strength = Math.abs(wind) / 1.4;
      A.pill(c, cx - 66, top, 132, 26);
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
    }
    c.restore();
  }

  function debug() {
    return { state: state, goals: goals, points: points, misses: misses, level: level, wind: wind, keeper: keeper, plan: plan, outcome: outcome, clock: clock };
  }

  A.register({ resize: resize, start: start, update: update, render: render, down: down, move: move, up: up, debug: debug });
})();
