/*
 * TOP SEKTİR — topu yere düşürmeden sektir.
 *
 * MEKANİZMA — TEK KURAL, ÖĞRENİLEBİLİR DERİNLİK:
 *   · Topa dokun → top HER ZAMAN aynı tepe yüksekliğine çıkar. Yükseklik
 *     şansa değil kurala bağlı: oyuncu ritmi öğrenir.
 *   · Dokunduğun YER yönü belirler: topun solundan vurursan sağa, sağından
 *     vurursan sola gider (gerçek bir vuruş gibi). Kenardan vuruş topu daha
 *     alçak ve daha yatay gönderir.
 *   · Topun MERKEZİNE yakın vuruş "TAM İSABET"tir: kombo büyür, kombo her 5
 *     tam isabette puan çarpanını bir artırır (en çok ×5).
 *   · Havadaki YILDIZLAR: topu kavisle yıldızın içinden geçir → bonus puan.
 *     Yıldızları kovalamak topu kenarlara, riske taşır — oyunun gerilimi.
 *   · Top çime değerse tur biter.
 *
 * GİDEREK ZORLAŞIR (her 8 sekmede bir seviye):
 *   · Yerçekimi artar, tepe alçalır → ritim hızlanır (1,4 sn → 0,85 sn hava).
 *   · Seviye 3: RÜZGÂR — ekranın üstünde yön ve şiddet görünür, topu iter.
 *   · Seviye 5: top küçülür (isabet zorlaşır).
 *   · Seviye 7: rüzgâr sertleşir ve sık yön değiştirir.
 *
 * Skor = puan. Rekor tablosu bu puanı sıralar.
 */
(function () {
  "use strict";
  var A = window.Arena;
  var P = A.PAL;

  var W = 0, H = 0, S = 1;
  var groundY = 0, boardsY = 0, boardsH = 0, standTop = 0;
  var bg = null, vignette = null;

  var state = "attract"; // attract | play | dying | over
  var ball, orient;
  var kicks = 0, points = 0, combo = 0, level = 1, bestCombo = 0, stars = 0;
  var lastKick = -1;
  var scoreBump = 0, boardFlash = 0;
  var wind = 0, windTarget = 0, windTimer = 0, windDrift = 0;
  var star = null, starCooldown = 0;
  var trail = [];
  var deathT = 0;
  var rings = [];
  var aiTimer = 0;

  var KICKS_PER_LEVEL = 8;

  function diff() {
    // 0 → 1, ilk ~70 sekmede yumuşakça doyar.
    return 1 - Math.exp(-kicks / 38);
  }
  function gravity() {
    return (1500 + 1100 * diff()) * S;
  }
  function apexHeight() {
    return H * (0.5 - 0.13 * diff());
  }
  function radius() {
    var r = 34 * S;
    if (level >= 5) r *= 0.86;
    if (level >= 9) r *= 0.92;
    return r;
  }

  function resetBall() {
    ball = { x: W / 2, y: groundY - H * 0.55, vx: 0, vy: 0, spin: 0, r: 34 * S };
    orient = A.orientation();
    trail = [];
  }

  function resize(w, h) {
    W = w;
    H = h;
    S = Math.min(w / 390, h / 720) * 1.0;
    S = A.clamp(S, 0.75, 1.5);
    groundY = h * 0.86;
    standTop = h * 0.07;
    boardsH = Math.max(16, h * 0.034);
    boardsY = h * 0.47;
    buildBackground();
    if (!ball) resetBall();
    else ball.x = A.clamp(ball.x, 0, W);
  }

  /* ─────────────────────────── statik arka plan ─────────────────────────── */

  function buildBackground() {
    bg = A.layer(W, H);
    var c = bg.ctx;
    A.paintSky(c, W, boardsY);
    A.paintStands(c, W, standTop + 2, boardsY, 2024);
    A.paintRoof(c, W, standTop, standTop - 2);

    // Çim — perspektifli zemin: kaçış noktası panoların çok üstünde.
    var top = boardsY + boardsH;
    var g = c.createLinearGradient(0, top, 0, H);
    g.addColorStop(0, P.grassFar);
    g.addColorStop(1, P.grassNear);
    c.fillStyle = g;
    c.fillRect(0, top, W, H - top);

    var vx = W / 2;
    var vy = top - H * 0.9;
    var stripes = 14;
    for (var i = -stripes; i < stripes; i++) {
      if (i % 2) continue;
      var x0 = W / 2 + i * (W / 6);
      var x1 = W / 2 + (i + 1) * (W / 6);
      // Çizgileri kaçış noktasına doğru uzat
      var t0 = (top - vy) / (H - vy);
      c.beginPath();
      c.moveTo(vx + (x0 - vx) * t0, top);
      c.lineTo(vx + (x1 - vx) * t0, top);
      c.lineTo(x1, H);
      c.lineTo(x0, H);
      c.closePath();
      c.fillStyle = "rgba(255,255,255,0.045)";
      c.fill();
    }
    // Yatay biçme bantları (derinlikte sıklaşır)
    for (var k = 0; k < 9; k++) {
      if (k % 2) continue;
      var a = top + (H - top) * Math.pow(k / 9, 1.6);
      var b = top + (H - top) * Math.pow((k + 1) / 9, 1.6);
      c.fillStyle = "rgba(0,0,0,0.05)";
      c.fillRect(0, a, W, b - a);
    }
    // Saha çizgileri: panoların önünde taç çizgisi, ortada orta yuvarlak
    c.strokeStyle = P.chalk;
    c.lineWidth = 2 * S;
    c.beginPath();
    c.moveTo(0, top + 10 * S);
    c.lineTo(W, top + 10 * S);
    c.stroke();
    c.save();
    c.translate(W / 2, groundY + (H - groundY) * 0.15);
    c.scale(1, 0.22);
    c.beginPath();
    c.arc(0, 0, W * 0.36, 0, Math.PI * 2);
    c.restore();
    c.lineWidth = 2.5 * S;
    c.stroke();
    c.beginPath();
    c.moveTo(W / 2, top + 10 * S);
    c.lineTo(W / 2, H);
    c.lineWidth = 2 * S;
    c.stroke();

    // Projektör ışığının çimdeki havuzu
    c.save();
    c.globalCompositeOperation = "lighter";
    var pool = c.createRadialGradient(W / 2, groundY, 0, W / 2, groundY, W * 0.75);
    pool.addColorStop(0, "rgba(255,247,219,0.14)");
    pool.addColorStop(1, "rgba(255,247,219,0)");
    c.fillStyle = pool;
    c.fillRect(0, top, W, H - top);
    c.restore();
    A.paintHaze(c, W, boardsY, H * 0.25, 1);

    vignette = A.layer(W, H);
    A.paintVignette(vignette.ctx, W, H, 0.6);
    A.paintTopScrim(vignette.ctx, W, 120);
  }

  /* ─────────────────────────── oyun akışı ─────────────────────────── */

  function start() {
    state = "play";
    kicks = 0;
    points = 0;
    combo = 0;
    bestCombo = 0;
    stars = 0;
    level = 1;
    wind = 0;
    windTarget = 0;
    windTimer = 0;
    star = null;
    starCooldown = 1.5;
    lastKick = -1;
    rings = [];
    A.particles.length = 0;
    A.floaters.length = 0;
    A.banner = null;
    resetBall();
    ball.x = W / 2;
    ball.y = groundY - H * 0.2;
    ball.vy = -Math.sqrt(2 * gravity() * H * 0.3);
    A.sound("whistle");
    A.announce("SEKTİR!", "Topa dokun, düşürme");
  }

  function kick(px, py) {
    var r = ball.r;
    var o = A.clamp((px - ball.x) / (r * 1.15), -1, 1);
    var edge = Math.abs(o);

    var g = gravity();
    var targetY = groundY - apexHeight() * (1 - 0.28 * edge);
    var rise = Math.max(ball.y - targetY, H * 0.16);
    ball.vy = -Math.sqrt(2 * g * rise);
    ball.vx = ball.vx * 0.3 - o * 430 * S;
    ball.spin = o * 14;

    var perfect = edge < 0.3;
    kicks += 1;
    if (perfect) {
      combo += 1;
      bestCombo = Math.max(bestCombo, combo);
    } else combo = 0;
    var mult = multiplier();
    points += mult;
    scoreBump = 1;

    // Efekt: temas halkası + kıvılcım
    rings.push({ x: ball.x - o * r * 0.6, y: ball.y + r * 0.6, age: 0, perfect: perfect });
    A.burst(ball.x, ball.y + r * 0.8, perfect ? 16 : 8, {
      angle: Math.PI / 2,
      spread: Math.PI * 0.9,
      speed: 260 * S,
      gravity: 500,
      life: 0.5,
      size: 3.2 * S,
      color: perfect ? [P.gold, "#FFFFFF", P.brandGlow] : ["#FFFFFF", "#CFE8D6"],
      shape: "spark",
    });
    if (perfect) {
      if (combo > 0 && combo % 5 === 0) {
        A.floatText("ÇARPAN ×" + mult, ball.x, ball.y - r * 2, P.gold, 24);
        boardFlash = 1;
        A.sound("level");
      } else A.floatText("+" + mult, ball.x + (o > 0 ? -1 : 1) * r * 1.4, ball.y - r, mult > 1 ? P.gold : "#FFFFFF", 20);
    } else {
      A.floatText("+" + mult, ball.x + (o > 0 ? -1 : 1) * r * 1.4, ball.y - r, "#FFFFFF", 18);
    }

    A.sound("kick");
    A.haptic(perfect ? "medium" : "light");

    var newLevel = 1 + Math.floor(kicks / KICKS_PER_LEVEL);
    if (newLevel > level) {
      level = newLevel;
      levelUp();
    }
  }

  function multiplier() {
    return Math.min(5, 1 + Math.floor(combo / 5));
  }

  function levelUp() {
    var sub = "Ritim hızlanıyor";
    if (level === 3) sub = "Rüzgâr çıktı — yönüne dikkat";
    else if (level === 5) sub = "Top küçüldü";
    else if (level === 7) sub = "Fırtına! Rüzgâr sertleşti";
    else if (level === 9) sub = "Top daha da küçüldü";
    A.announce("SEVİYE " + level, sub);
    A.sound("level");
    A.haptic("success");
    boardFlash = 1;
  }

  function die() {
    state = "dying";
    deathT = 0;
    combo = 0;
    A.sound("groan");
    A.haptic("error");
    A.shake(8);
  }

  /* ─────────────────────────── güncelleme ─────────────────────────── */

  function update(dt) {
    scoreBump = Math.max(0, scoreBump - dt * 5);
    boardFlash = Math.max(0, boardFlash - dt * 1.6);

    var g = gravity();
    ball.r = A.damp(ball.r, state === "play" ? radius() : 34 * S, 6, dt);
    var r = ball.r;

    /* Rüzgâr — seviye 3'ten sonra; hedefe yumuşakça yaklaşır. */
    if (state === "play" && level >= 3) {
      windTimer -= dt;
      if (windTimer <= 0) {
        var storm = level >= 7;
        var max = (storm ? 520 : 300) * S * Math.min(1, 0.55 + (level - 3) * 0.12);
        windTarget = (Math.random() < 0.5 ? -1 : 1) * A.rand(0.45, 1) * max;
        windTimer = storm ? A.rand(2.5, 4) : A.rand(4, 6.5);
      }
    } else if (state !== "play") windTarget = 0;
    wind = A.damp(wind, windTarget, 1.5, dt);
    windDrift += wind * dt * 0.9;

    /* Fizik */
    ball.vy += g * dt;
    ball.vx += (state === "play" ? wind : 0) * dt;
    ball.vx *= Math.exp(-0.25 * dt);
    ball.spin *= Math.exp(-1.2 * dt);
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;

    if (ball.x < r) {
      ball.x = r;
      ball.vx = Math.abs(ball.vx) * 0.7;
      if (state === "play") A.sound("tap");
    } else if (ball.x > W - r) {
      ball.x = W - r;
      ball.vx = -Math.abs(ball.vx) * 0.7;
      if (state === "play") A.sound("tap");
    }

    // Yuvarlanma görseli: yatay hız + dönüş
    A.rotate(orient, [0, 1, 0], (ball.vx / r) * dt * 0.9);
    A.rotate(orient, [1, 0, 0], (-ball.vy / r) * dt * 0.25);
    A.rotate(orient, [0, 0, 1], ball.spin * dt);

    trail.push({ x: ball.x, y: ball.y });
    if (trail.length > 10) trail.shift();

    /* Zemin */
    if (ball.y + r >= groundY && ball.vy > 0) {
      ball.y = groundY - r;
      if (state === "play") die();
      if (state === "attract") {
        ball.vy = -Math.sqrt(2 * g * H * 0.4);
      } else {
        ball.vy = -ball.vy * 0.45;
        ball.vx *= 0.7;
        if (Math.abs(ball.vy) < 60) ball.vy = 0;
      }
    }

    /* Vitrin modu: yapay oyuncu sektirir — giriş kartının arkası canlı. */
    if (state === "attract") {
      aiTimer -= dt;
      if (ball.vy > 0 && ball.y > groundY - H * 0.24 && aiTimer <= 0) {
        var aim = (ball.x - W / 2) / (W / 2);
        var o = A.clamp(aim * 0.6 + A.rand(-0.25, 0.25), -0.8, 0.8);
        ball.vy = -Math.sqrt(2 * g * Math.max(ball.y - (groundY - H * 0.45), H * 0.16));
        ball.vx = ball.vx * 0.3 - o * 300 * S;
        ball.spin = o * 12;
        aiTimer = 0.3;
      }
    }

    if (state === "dying") {
      deathT += dt;
      if (deathT > 1.3) {
        state = "over";
        A.sound("over");
        A.send("over", {
          score: points,
          stats: { kicks: kicks, level: level, bestCombo: bestCombo, stars: stars },
        });
      }
    }

    /* Yıldız */
    if (state === "play") {
      if (!star) {
        starCooldown -= dt;
        if (starCooldown <= 0 && kicks >= 2) spawnStar();
      } else {
        star.age += dt;
        if (star.age > star.life) {
          star = null;
          starCooldown = 1.2;
        } else if (Math.hypot(ball.x - star.x, ball.y - star.y) < r + star.r * 0.9) {
          var gain = 5 * multiplier();
          points += gain;
          stars += 1;
          scoreBump = 1;
          A.floatText("+" + gain, star.x, star.y - 10, P.gold, 26);
          A.burst(star.x, star.y, 26, { speed: 280 * S, gravity: 200, life: 0.8, size: 4 * S, color: [P.gold, "#FFF", "#FFE9A3"], shape: "spark" });
          A.sound("coin");
          A.haptic("success");
          boardFlash = 0.8;
          star = null;
          starCooldown = A.rand(1.2, 2.5);
        }
      }
    }

    for (var i = rings.length - 1; i >= 0; i--) {
      rings[i].age += dt;
      if (rings[i].age > 0.45) rings.splice(i, 1);
    }
  }

  function spawnStar() {
    var apex = groundY - apexHeight();
    star = {
      x: A.rand(W * 0.16, W * 0.84),
      y: A.rand(apex - H * 0.02, apex + apexHeight() * 0.45),
      r: 20 * S,
      age: 0,
      life: Math.max(4, 7.5 - level * 0.35),
    };
  }

  /* ─────────────────────────── girdi ─────────────────────────── */

  function down(p) {
    if (state !== "play") return;
    if (A.time - lastKick < 0.1) return;
    var r = ball.r;
    // Cömert isabet alanı: parmak topu örter, dokunmatik ekran affedici olmalı.
    var dx = (p.x - ball.x) / (r * 2.0);
    var dy = (p.y - ball.y) / (r * 2.3);
    if (dx * dx + dy * dy <= 1) {
      lastKick = A.time;
      kick(p.x, p.y);
    } else {
      // Iska: kombo bozulur — ekranı rastgele taramak ödüllendirilmez.
      if (combo > 0) A.floatText("ISKA", p.x, p.y, P.bad, 16);
      combo = 0;
    }
  }

  /* ─────────────────────────── çizim ─────────────────────────── */

  function render(c, dt) {
    A.blit(bg);
    A.drawFlashes(c, W, standTop + 4, boardsY - 4, 1 + Math.min(4, combo));
    A.drawBoards(c, W, boardsY, boardsH, A.time, boardFlash, "ELİTLİG ARENA  ·  TOP SEKTİR  ·  ");

    var r = ball.r;
    /* Gölge: top yükseldikçe büyür ve soluklaşır. */
    var height = A.clamp((groundY - ball.y - r) / (H * 0.6), 0, 1);
    c.save();
    c.globalAlpha = 0.45 * (1 - height * 0.75);
    c.fillStyle = "#000";
    c.beginPath();
    c.ellipse(ball.x, groundY + 2, r * (1 + height * 0.8), r * 0.26 * (1 + height * 0.5), 0, 0, Math.PI * 2);
    c.fill();
    c.restore();

    /* Yıldız */
    if (star) drawStar(c, star);

    /* İz */
    var speed = Math.hypot(ball.vx, ball.vy);
    if (speed > 500 * S) {
      for (var i = 0; i < trail.length - 1; i++) {
        var f = i / trail.length;
        c.globalAlpha = f * 0.18;
        c.fillStyle = "#FFFFFF";
        c.beginPath();
        c.arc(trail[i].x, trail[i].y, r * (0.5 + f * 0.45), 0, Math.PI * 2);
        c.fill();
      }
      c.globalAlpha = 1;
    }

    /* Temas halkaları */
    for (var k = 0; k < rings.length; k++) {
      var rg = rings[k];
      var t = rg.age / 0.45;
      c.strokeStyle = rg.perfect ? "rgba(255,210,74," + (1 - t) + ")" : "rgba(255,255,255," + (0.8 * (1 - t)) + ")";
      c.lineWidth = 3 * (1 - t) + 1;
      c.beginPath();
      c.ellipse(rg.x, rg.y, r * (0.4 + t * 1.4), r * (0.18 + t * 0.6), 0, 0, Math.PI * 2);
      c.stroke();
    }

    A.drawBall(c, ball.x, ball.y, r, orient);

    /* Top ekranın üstündeyse ok */
    if (ball.y + r < 0) {
      c.fillStyle = "rgba(255,255,255,0.9)";
      c.beginPath();
      c.moveTo(ball.x, 8);
      c.lineTo(ball.x - 9, 22);
      c.lineTo(ball.x + 9, 22);
      c.closePath();
      c.fill();
    }

    A.drawParticles(c);
    A.blit(vignette);
    A.drawFloaters(c, dt);

    if (state === "play" || state === "dying") drawHud(c);
    A.drawBanner(c, W, H * 0.3, dt);

    if (state === "dying") {
      var t2 = A.clamp(deathT / 0.5, 0, 1);
      c.fillStyle = "rgba(251,113,133," + (0.25 * (1 - t2)) + ")";
      c.fillRect(0, 0, W, H);
    }
  }

  function drawStar(c, s) {
    var appear = A.easeOutBack(s.age / 0.4);
    var fade = A.clamp((s.life - s.age) / 0.8, 0, 1);
    var blink = s.life - s.age < 1.5 ? 0.6 + 0.4 * Math.sin(s.age * 20) : 1;
    var R = s.r * appear;
    c.save();
    c.translate(s.x, s.y);
    c.globalAlpha = fade * blink;
    c.globalCompositeOperation = "lighter";
    var g = c.createRadialGradient(0, 0, 0, 0, 0, R * 2.4);
    g.addColorStop(0, "rgba(255,210,74,0.6)");
    g.addColorStop(1, "rgba(255,210,74,0)");
    c.fillStyle = g;
    c.fillRect(-R * 2.4, -R * 2.4, R * 4.8, R * 4.8);
    c.globalCompositeOperation = "source-over";
    c.rotate(s.age * 1.4);
    c.beginPath();
    for (var i = 0; i < 10; i++) {
      var rr = i % 2 ? R * 0.45 : R;
      var a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    c.closePath();
    var sg = c.createLinearGradient(0, -R, 0, R);
    sg.addColorStop(0, "#FFF3B0");
    sg.addColorStop(1, "#F59E0B");
    c.fillStyle = sg;
    c.fill();
    c.lineWidth = 2;
    c.strokeStyle = "rgba(120,60,0,0.6)";
    c.stroke();
    c.restore();
  }

  function drawHud(c) {
    var top = 14;
    A.drawScore(c, 18, top, "PUAN", points, scoreBump);

    // Sağ üst: seviye + sekme
    c.save();
    var label = "SEVİYE " + level;
    c.font = A.font(12, 800);
    var lw = c.measureText(label).width + 22;
    A.pill(c, W - 16 - lw, top, lw, 26, "rgba(60,36,200,0.75)");
    c.fillStyle = "#fff";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(label, W - 16 - lw / 2, top + 13.5);

    var kl = kicks + " sekme";
    c.font = A.font(12, 700);
    var kw = c.measureText(kl).width + 22;
    A.pill(c, W - 16 - kw, top + 32, kw, 26);
    c.fillStyle = "rgba(255,255,255,0.9)";
    c.fillText(kl, W - 16 - kw / 2, top + 45.5);
    c.restore();

    // Çarpan ve kombo çubuğu
    var mult = multiplier();
    var bx = 18, by = top + 66;
    var bw = 110;
    A.pill(c, bx, by, bw, 10, "rgba(8,10,30,0.55)");
    var prog = mult >= 5 ? 1 : (combo % 5) / 5;
    if (prog > 0) {
      var pg = c.createLinearGradient(bx, 0, bx + bw, 0);
      pg.addColorStop(0, P.brandGlow);
      pg.addColorStop(1, P.gold);
      c.fillStyle = pg;
      A.roundRect(c, bx + 1, by + 1, Math.max(8, (bw - 2) * prog), 8, 4);
      c.fill();
    }
    c.font = A.font(13, 900);
    c.textAlign = "left";
    c.textBaseline = "middle";
    c.fillStyle = mult > 1 ? P.gold : "rgba(255,255,255,0.75)";
    c.fillText("×" + mult, bx + bw + 8, by + 5.5);

    // Rüzgâr göstergesi
    if (Math.abs(wind) > 8 * S) {
      var strength = A.clamp(Math.abs(wind) / (520 * S), 0, 1);
      var dir = Math.sign(wind);
      var cx = W / 2, cy = top + 13;
      A.pill(c, cx - 62, top, 124, 26);
      c.save();
      c.translate(cx, cy);
      c.fillStyle = strength > 0.6 ? P.bad : "#BFE3FF";
      for (var i = 0; i < 3; i++) {
        var on = strength > i / 3 - 0.05;
        c.globalAlpha = on ? 1 : 0.25;
        var x = dir * (-16 + i * 12) + (dir > 0 ? 10 : -10);
        c.beginPath();
        c.moveTo(x + dir * 6, 0);
        c.lineTo(x - dir * 2, -6);
        c.lineTo(x - dir * 2, 6);
        c.closePath();
        c.fill();
      }
      c.globalAlpha = 1;
      c.font = A.font(11, 800);
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillStyle = "#fff";
      c.fillText("RÜZGÂR", dir > 0 ? -34 : 34, 0.5);
      c.restore();
      // Rüzgâr çizgileri sahada
      if (!A.reduceMotion) {
        c.save();
        c.strokeStyle = "rgba(220,235,255," + (0.1 + strength * 0.15) + ")";
        c.lineWidth = 1.5;
        c.lineCap = "round";
        for (var j = 0; j < 6; j++) {
          var yy = H * 0.15 + ((j * 97) % (H * 0.6));
          var xx = ((windDrift + j * 211) % (W + 120) + W + 120) % (W + 120) - 60;
          c.beginPath();
          c.moveTo(xx, yy);
          c.lineTo(xx - dir * (30 + strength * 40), yy);
          c.stroke();
        }
        c.restore();
      }
    }
  }

  function debug() {
    return { state: state, kicks: kicks, points: points, level: level, combo: combo, wind: wind, ball: ball, g: gravity(), apex: apexHeight(), groundY: groundY, star: star };
  }

  A.register({ resize: resize, start: start, update: update, render: render, down: down, debug: debug });
})();
