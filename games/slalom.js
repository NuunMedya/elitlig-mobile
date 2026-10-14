/*
 * SLALOM — topu sürerek KAPILARDAN geç.
 *
 * NEDEN BAŞTAN: eski sürümde tek tek koniler vardı ve konilerden kaçmak
 * yetiyordu; oyuncu kenara saklanıp sonsuza dek ilerleyebiliyordu. Gerçek
 * slalomda olduğu gibi artık iki direkten oluşan KAPILAR var ve HER KAPIDAN
 * GEÇMEK ZORUNLU:
 *   · Kapının dışından geçmek  → "KAPI KAÇTI", bir hak gider.
 *   · Direğe / rakibe çarpmak  → düşersin, bir hak gider, hız düşer.
 *   · Üç hak bitince tur biter. Kenarda beklemek artık hiçbir şey kazandırmaz.
 *
 * KONTROL: parmağını sağa sola KAYDIR — oyuncu parmağını izler (göreli
 * sürükleme, ekranın neresinden başladığın önemsiz). Momentum vardır: sert
 * dönüş hız ister, gövde dönüşe yatar.
 *
 * PUAN: her kapı 10 × çarpan; kapının tam ortasından geçmek +5 (MÜKEMMEL);
 * yoldaki altın toplar +2. Arka arkaya her 5 kapı çarpanı bir artırır (en çok
 * ×5); hata çarpanı sıfırlar.
 *
 * GİDEREK ZORLAŞIR (her 8 kapıda bir seviye):
 *   · Koşu hızı 9 → 21 m/sn (≈650 m ölçeğinde); kapılar daralır (4,6 → 2,1 m), sıklaşır ve
 *     sahanın iki yanına daha çok savrulur.
 *   · Seviye 3: kapıların arasına RAKİP savunmacılar girer.
 *   · Seviye 4: bazı kapılar sağa sola KAYAR.
 *   · Seviye 5: savunmacılar da kayar.
 */
(function () {
  "use strict";
  var A = window.Arena;
  var P = A.PAL;

  /* ─────────────────────────── dünya (metre) ─────────────────────────── */
  var FIELD = 5.6; // taç çizgisi
  var CAM_H = 11;
  var CAM_BACK = 13;
  var VIEW_HALF = 6.4; // oyuncu derinliğinde ekranın yarı genişliği (m)
  var FAR = 150;
  var LINE_FAR = 600;
  var POLE_H = 1.75;
  var LIVES = 3;
  var GATES_PER_LEVEL = 8;

  var W = 0, H = 0, horizon = 0, f = 1, feetY = 0;
  var sky = null, vignette = null;

  /* ─────────────────────────── durum ─────────────────────────── */
  var state = "attract"; // attract | play | dying | over
  var z = 0; // oyuncunun ileri konumu
  var speed = 9;
  var player = { x: 0, target: 0, vx: 0, lean: 0, stride: 0, stumble: 0, invuln: 0 };
  var camX = 0;
  var gates = [], foes = [], coins = [];
  var nextGateZ = 0, gateSide = 1, gateCount = 0;
  var passed = 0, points = 0, combo = 0, bestCombo = 0, lives = LIVES, level = 1, coinCount = 0;
  var orient = null;
  var scoreBump = 0, flashRed = 0, dyingT = 0;
  var lastTouchX = null;
  var boardOffset = 0;

  function n() {
    return passed;
  }
  function gateGap() {
    return 2.1 + 2.5 * Math.exp(-n() / 22);
  }
  function gateSpacing() {
    return 12 + 10 * Math.exp(-n() / 26);
  }
  function gateAmp(gap) {
    return Math.min(FIELD - gap / 2 - 0.35, 1.3 + n() * 0.1);
  }
  function runSpeed() {
    return 9 + 12 * (1 - Math.exp(-z / 650));
  }

  /* ─────────────────────────── kamera ─────────────────────────── */

  function resize(w, h) {
    W = w;
    H = h;
    f = ((W * 0.5) / VIEW_HALF) * CAM_BACK;
    feetY = H * 0.83;
    horizon = Math.max(H * 0.2, feetY - (f * CAM_H) / CAM_BACK);
    buildStatic();
    if (!orient) {
      orient = A.orientation();
      resetWorld();
    }
  }

  /** Dünya → ekran. dz: kameradan derinlik. */
  function proj(X, Y, Z) {
    var dz = Math.max(0.3, Z - (z - CAM_BACK));
    var s = f / dz;
    return { x: W / 2 + (X - camX) * s, y: horizon + (CAM_H - Y) * s, s: s };
  }

  function buildStatic() {
    sky = A.layer(W, Math.max(1, horizon + 2));
    var c = sky.ctx;
    A.paintSky(c, W, horizon + 2);
    // Ufuktaki stadyum: kavisli tribün silüeti, ışıklı kenar, kalabalık
    var standTop = horizon - Math.max(26, H * 0.075);
    c.fillStyle = P.standBack;
    c.beginPath();
    c.moveTo(0, horizon + 2);
    c.lineTo(0, standTop + 14);
    c.quadraticCurveTo(W * 0.5, standTop - 12, W, standTop + 14);
    c.lineTo(W, horizon + 2);
    c.closePath();
    c.fill();
    var rand = A.seeded(3301);
    for (var i = 0; i < W / 3.2; i++) {
      var x = rand() * W;
      var t = Math.abs(x / W - 0.5) * 2;
      var top = standTop + 14 - (1 - t * t) * 26 + 4;
      var y = top + rand() * (horizon - top - 2);
      c.globalAlpha = 0.5;
      c.fillStyle = A.pick(P.crowd);
      c.beginPath();
      c.arc(x, y, 0.9 + rand() * 0.6, 0, Math.PI * 2);
      c.fill();
    }
    c.globalAlpha = 1;
    c.strokeStyle = "rgba(139,123,255,0.6)";
    c.lineWidth = 1.2;
    c.beginPath();
    c.moveTo(0, standTop + 14);
    c.quadraticCurveTo(W * 0.5, standTop - 12, W, standTop + 14);
    c.stroke();
    // Projektör kuleleri
    [0.06, 0.28, 0.72, 0.94].forEach(function (fx, k) {
      var tx = fx * W;
      var tt = standTop - H * (k === 0 || k === 3 ? 0.11 : 0.085);
      c.fillStyle = "#0B1028";
      c.beginPath();
      c.moveTo(tx - 1.8, horizon);
      c.lineTo(tx - 0.8, tt);
      c.lineTo(tx + 0.8, tt);
      c.lineTo(tx + 1.8, horizon);
      c.fill();
      c.save();
      c.globalCompositeOperation = "lighter";
      var g = c.createRadialGradient(tx, tt, 0, tx, tt, W * 0.16);
      g.addColorStop(0, "rgba(255,247,219,0.55)");
      g.addColorStop(1, "rgba(255,247,219,0)");
      c.fillStyle = g;
      c.fillRect(tx - W * 0.16, tt - W * 0.16, W * 0.32, W * 0.32);
      c.restore();
      c.fillStyle = "#FFFDF2";
      A.roundRect(c, tx - 8, tt - 4, 16, 6, 1.5);
      c.fill();
    });
    A.paintHaze(c, W, horizon, H * 0.12, 1.4);

    vignette = A.layer(W, H);
    var vc = vignette.ctx;
    // Ufuk sisi — uzaktaki kapılar sisten çıkar
    var fog = vc.createLinearGradient(0, horizon - 2, 0, horizon + H * 0.12);
    fog.addColorStop(0, "rgba(38,48,107,0.75)");
    fog.addColorStop(1, "rgba(38,48,107,0)");
    vc.fillStyle = fog;
    vc.fillRect(0, horizon - 2, W, H * 0.12 + 2);
    A.paintVignette(vc, W, H, 0.55);
    A.paintTopScrim(vc, W, 110);
  }

  /* ─────────────────────────── dünya üretimi ─────────────────────────── */

  function resetWorld() {
    z = 0;
    speed = 9;
    player = { x: 0, target: 0, vx: 0, lean: 0, stride: 0, stumble: 0, invuln: 0, fallen: 0 };
    camX = 0;
    gates = [];
    foes = [];
    coins = [];
    nextGateZ = 28;
    gateSide = Math.random() < 0.5 ? -1 : 1;
    gateCount = 0;
    passed = 0;
    while (nextGateZ < z + FAR) spawnGate();
  }

  function spawnGate() {
    var gap = gateGap();
    var amp = gateAmp(gap);
    // Taraf değiştir; yüksek seviyede ara sıra aynı tarafta kal (sürpriz)
    if (!(gateCount > 16 && Math.random() < 0.2)) gateSide = -gateSide;
    var cx = gateSide * A.rand(0.35, 1) * amp;
    if (gateCount < 2) cx = gateSide * 1.2;
    var lvl = 1 + Math.floor(gateCount / GATES_PER_LEVEL);
    var moving = lvl >= 4 && Math.random() < Math.min(0.55, 0.2 + (lvl - 4) * 0.1);
    var gate = {
      z: nextGateZ,
      cx: cx,
      baseX: cx,
      gap: gap,
      color: gateCount % 2 ? "blue" : "red",
      moving: moving,
      phase: Math.random() * 6.28,
      amp: moving ? Math.min(1.4, FIELD - Math.abs(cx) - gap / 2 - 0.2) : 0,
      done: false,
      result: null,
      at: 0,
      hitPole: 0,
    };
    gates.push(gate);

    // Önceki kapıdan buna giden yola altın toplar
    var prev = gates[gates.length - 2];
    if (prev && gateCount % 2 === 0) {
      for (var i = 1; i <= 3; i++) {
        var t = i / 4;
        coins.push({ z: A.lerp(prev.z, gate.z, t), x: A.lerp(prev.baseX, gate.baseX, A.smooth(t)), taken: false, at: 0 });
      }
    }

    // Seviye 3+: kapı aralarına savunmacı (yolun dışına değil, yolun ÜSTÜNE)
    if (prev && lvl >= 3 && Math.random() < Math.min(0.75, 0.35 + (lvl - 3) * 0.1)) {
      var mz = A.lerp(prev.z, gate.z, A.rand(0.42, 0.58));
      var line = A.lerp(prev.baseX, gate.baseX, 0.5);
      var off = (Math.random() < 0.5 ? -1 : 1) * A.rand(0.6, 1.6);
      var fx = A.clamp(line + off, -FIELD + 0.6, FIELD - 0.6);
      var slide = lvl >= 5 && Math.random() < 0.5;
      foes.push({ z: mz, x: fx, baseX: fx, slide: slide, phase: Math.random() * 6.28, amp: slide ? A.rand(1, 2) : 0, done: false, hit: false, at: 0 });
    }

    gateCount += 1;
    nextGateZ += gateSpacing() * A.rand(0.9, 1.1);
  }

  /* ─────────────────────────── akış ─────────────────────────── */

  function start() {
    resetWorld();
    state = "play";
    points = 0;
    combo = 0;
    bestCombo = 0;
    lives = LIVES;
    level = 1;
    coinCount = 0;
    A.particles.length = 0;
    A.floaters.length = 0;
    A.banner = null;
    A.sound("whistle");
    A.announce("SLALOM!", "Parmağını kaydır, kapılardan geç");
  }

  function multiplier() {
    return Math.min(5, 1 + Math.floor(combo / 5));
  }

  function loseLife(kind, x, y) {
    combo = 0;
    lives -= 1;
    flashRed = 1;
    A.haptic("error");
    if (kind === "crash") {
      player.stumble = 1;
      player.invuln = 1.3;
      speed *= 0.55;
      A.shake(9);
      A.sound("crash");
      A.floatText("ÇARPTIN!", x, y, P.bad, 24);
    } else {
      player.invuln = 0.6;
      speed *= 0.82;
      A.shake(4);
      A.sound("groan");
      A.floatText("KAPI KAÇTI", x, y, P.bad, 22);
    }
    if (lives <= 0) {
      state = "dying";
      dyingT = 0;
      player.fallen = 1;
    }
  }

  function levelUp() {
    var sub = "Hız artıyor, kapılar daralıyor";
    if (level === 3) sub = "Rakip savunmacılar sahada!";
    else if (level === 4) sub = "Kayan kapılara dikkat";
    else if (level === 5) sub = "Savunmacılar da kayıyor";
    A.announce("SEVİYE " + level, sub);
    A.sound("level");
    A.haptic("success");
  }

  /* ─────────────────────────── güncelleme ─────────────────────────── */

  function update(dt) {
    scoreBump = Math.max(0, scoreBump - dt * 4);
    flashRed = Math.max(0, flashRed - dt * 2.5);
    player.invuln = Math.max(0, player.invuln - dt);
    player.stumble = Math.max(0, player.stumble - dt * 1.6);

    var target = state === "dying" ? 0 : state === "attract" ? 9 : runSpeed();
    if (state === "dying") {
      speed = A.damp(speed, 0, 2.2, dt);
      dyingT += dt;
      if (dyingT > 1.4 && state !== "over") {
        state = "over";
        A.sound("over");
        A.send("over", { score: points, stats: { gates: passed, level: level, bestCombo: bestCombo, coins: coinCount, metres: Math.round(z) } });
      }
    } else speed = A.approach(speed, target, (speed < target ? 3.5 : 6) * dt);
    if (state === "over") speed = 0;

    var dz = speed * dt;
    z += dz;
    boardOffset += dz;

    /* Vitrin: yapay oyuncu kapıların ortasına yönelir */
    if (state === "attract") {
      var ng = null;
      for (var i = 0; i < gates.length; i++)
        if (!gates[i].done) {
          ng = gates[i];
          break;
        }
      if (ng) player.target = ng.cx * (ng.z - z < 14 ? 1 : 0.6);
    }

    /* Yanal hareket — hedefe momentumla */
    var maxLat = 6 + speed * 0.42;
    var desired = A.clamp((player.target - player.x) * 9, -maxLat, maxLat);
    if (state === "dying" || state === "over") desired = 0;
    player.vx = A.approach(player.vx, desired, 60 * dt);
    player.x = A.clamp(player.x + player.vx * dt, -FIELD + 0.25, FIELD - 0.25);
    player.lean = A.damp(player.lean, player.vx / maxLat, 10, dt);
    player.stride += dt * (5 + speed * 0.55);
    camX = A.damp(camX, player.x * 0.6, 6, dt);

    A.rotate(orient, [1, 0, 0], -(speed / 0.11) * dt * 0.5);
    A.rotate(orient, [0, 1, 0], (player.vx / 0.11) * dt * 0.3);

    /* Hareketli kapı ve savunmacılar */
    for (var g = 0; g < gates.length; g++) {
      var gt = gates[g];
      if (gt.moving && !gt.done) gt.cx = gt.baseX + Math.sin(A.time * 1.6 + gt.phase) * gt.amp;
    }
    for (var q = 0; q < foes.length; q++) {
      var fo = foes[q];
      if (fo.slide && !fo.done) fo.x = A.clamp(fo.baseX + Math.sin(A.time * 1.9 + fo.phase) * fo.amp, -FIELD + 0.5, FIELD - 0.5);
    }

    /* Kapı geçişi — oyuncu kapının çizgisini geçtiği AN değerlendirilir */
    var playing = state === "play";
    for (var k = 0; k < gates.length; k++) {
      var gate = gates[k];
      if (gate.done || gate.z > z) continue;
      gate.done = true;
      gate.at = A.time;
      if (!playing) {
        gate.result = "pass";
        continue;
      }
      var half = gate.gap / 2;
      var dx = player.x - gate.cx;
      var poleL = gate.cx - half, poleR = gate.cx + half;
      var nearPole = Math.min(Math.abs(player.x - poleL), Math.abs(player.x - poleR));
      var sp = proj(player.x, 1.2, z);
      if (nearPole < 0.42 && player.invuln <= 0) {
        gate.result = "pole";
        gate.hitPole = Math.abs(player.x - poleL) < Math.abs(player.x - poleR) ? -1 : 1;
        loseLife("crash", sp.x, sp.y - 40);
      } else if (Math.abs(dx) < half) {
        gate.result = "pass";
        passed += 1;
        combo += 1;
        bestCombo = Math.max(bestCombo, combo);
        var mult = multiplier();
        var gain = 10 * mult;
        var perfect = Math.abs(dx) < half * 0.28;
        if (perfect) gain += 5;
        points += gain;
        scoreBump = 1;
        A.floatText((perfect ? "MÜKEMMEL +" : "+") + gain, sp.x, sp.y - 50, perfect ? P.gold : "#FFFFFF", perfect ? 22 : 20);
        if (combo % 5 === 0) {
          A.floatText("ÇARPAN ×" + multiplier(), W / 2, H * 0.42, P.gold, 24);
          A.sound("level");
        } else A.sound("gate");
        A.haptic(perfect ? "medium" : "light");
        var lp = proj(gate.cx, 0.2, gate.z);
        A.burst(lp.x, lp.y, perfect ? 22 : 10, {
          angle: -Math.PI / 2,
          spread: Math.PI,
          speed: 220,
          gravity: 300,
          life: 0.6,
          size: 3.5,
          color: gate.color === "red" ? ["#FCA5A5", "#FFFFFF", P.gold] : ["#93C5FD", "#FFFFFF", P.gold],
          shape: "spark",
        });
        var lvl = 1 + Math.floor(passed / GATES_PER_LEVEL);
        if (lvl > level) {
          level = lvl;
          levelUp();
        }
      } else if (player.invuln <= 0) {
        gate.result = "miss";
        loseLife("miss", sp.x, sp.y - 40);
      } else gate.result = "miss";
      if (state !== "play") break;
    }

    /* Savunmacılar */
    for (var m = 0; m < foes.length; m++) {
      var foe = foes[m];
      if (foe.done || foe.z > z + 0.3) continue;
      if (foe.z < z - 0.5) {
        foe.done = true;
        continue;
      }
      if (playing && !foe.hit && Math.abs(player.x - foe.x) < 0.78 && player.invuln <= 0) {
        foe.hit = true;
        foe.at = A.time;
        foe.done = true;
        var fp = proj(player.x, 1.2, z);
        loseLife("crash", fp.x, fp.y - 40);
      }
    }

    /* Altın toplar */
    for (var cI = 0; cI < coins.length; cI++) {
      var co = coins[cI];
      if (co.taken || co.z > z + 0.4 || co.z < z - 0.6) continue;
      if (playing && Math.abs(player.x - co.x) < 0.7) {
        co.taken = true;
        co.at = A.time;
        points += 2;
        coinCount += 1;
        scoreBump = 0.6;
        A.sound("coin");
        var cp = proj(co.x, 0.4, co.z);
        A.burst(cp.x, cp.y, 8, { speed: 160, gravity: 200, life: 0.45, size: 3, color: [P.gold, "#FFF"], shape: "spark" });
      }
    }

    /* Çim tozu — dönüşlerde ayaktan */
    if (playing && Math.abs(player.vx) > 4 && Math.random() < 0.5 && !A.reduceMotion) {
      var pp = proj(player.x, 0, z);
      A.burst(pp.x, pp.y, 1, { angle: Math.PI + (player.vx > 0 ? 0.3 : -0.3) * -1 - Math.PI / 2 - Math.sign(player.vx) * 1.2, spread: 0.6, speed: 140, gravity: 500, life: 0.4, size: 2.5, color: ["#5BC27F", "#2F9A55", "#A7E3B9"] });
    }

    /* Temizlik ve üretim */
    var cut = z - CAM_BACK + 0.6;
    gates = gates.filter(function (o) {
      return o.z > cut;
    });
    foes = foes.filter(function (o) {
      return o.z > cut;
    });
    coins = coins.filter(function (o) {
      return o.z > cut;
    });
    while (nextGateZ < z + FAR) spawnGate();
  }

  /* ─────────────────────────── girdi ─────────────────────────── */

  function down(p) {
    lastTouchX = p.x;
  }
  function move(p) {
    if (state !== "play" || lastTouchX == null) return;
    var mpp = (VIEW_HALF * 2) / W; // metre / piksel (oyuncu derinliğinde)
    player.target = A.clamp(player.target + (p.x - lastTouchX) * mpp * 1.35, -FIELD + 0.25, FIELD - 0.25);
    lastTouchX = p.x;
  }
  function up() {
    lastTouchX = null;
  }

  /* ─────────────────────────── çizim ─────────────────────────── */

  function render(c, dt) {
    c.fillStyle = P.grassFar;
    c.fillRect(0, 0, W, H);
    A.blit(sky);
    drawGround(c);
    drawBoards(c);

    // Nesneleri uzaktan yakına sırala
    var items = [];
    gates.forEach(function (g) {
      items.push({ z: g.z, draw: drawGate, o: g });
    });
    foes.forEach(function (fo) {
      items.push({ z: fo.z, draw: drawFoe, o: fo });
    });
    coins.forEach(function (co) {
      if (!co.taken || A.time - co.at < 0.3) items.push({ z: co.z, draw: drawCoin, o: co });
    });
    items.push({ z: z, draw: drawPlayer, o: null });
    items.sort(function (a, b) {
      return b.z - a.z;
    });
    for (var i = 0; i < items.length; i++) items[i].draw(c, items[i].o);

    drawSpeedLines(c);
    A.drawParticles(c);
    A.blit(vignette);
    A.drawFloaters(c, dt);
    if (state !== "attract") drawHud(c);
    A.drawBanner(c, W, H * 0.3, dt);
    if (flashRed > 0) {
      c.fillStyle = "rgba(251,113,133," + (0.28 * flashRed).toFixed(3) + ")";
      c.fillRect(0, 0, W, H);
    }
  }

  function drawGround(c) {
    var nearZ = z - CAM_BACK + 0.4;
    // Taban
    var g = c.createLinearGradient(0, horizon, 0, H);
    g.addColorStop(0, "#3C9C60");
    g.addColorStop(1, "#1C6B3A");
    c.fillStyle = g;
    c.fillRect(0, horizon, W, H - horizon);

    // Biçme bantları — dünya ile birlikte akar (6 m)
    var band = 6;
    var startZ = Math.floor(nearZ / band) * band;
    c.fillStyle = "rgba(255,255,255,0.06)";
    for (var bz = startZ; bz < z + 220; bz += band) {
      if (Math.round(bz / band) % 2) continue;
      var a = proj(0, 0, Math.max(bz, nearZ)), b = proj(0, 0, bz + band);
      c.fillRect(0, b.y, W, a.y - b.y);
    }

    // Taç dışı: koyu şerit
    function side(sign) {
      var x0 = sign * FIELD, x1 = sign * (FIELD + 12);
      var n0 = proj(x0, 0, nearZ), n1 = proj(x1, 0, nearZ), f0 = proj(x0, 0, z + LINE_FAR), f1 = proj(x1, 0, z + LINE_FAR);
      c.beginPath();
      c.moveTo(n0.x, n0.y);
      c.lineTo(f0.x, f0.y);
      c.lineTo(f1.x, f1.y);
      c.lineTo(n1.x, n1.y);
      c.closePath();
      c.fillStyle = "rgba(6,30,18,0.35)";
      c.fill();
    }
    side(-1);
    side(1);

    // Taç çizgileri (perspektifli kalınlık)
    function chalk(X) {
      var n0 = proj(X - 0.08, 0, nearZ), n1 = proj(X + 0.08, 0, nearZ), f0 = proj(X - 0.08, 0, z + LINE_FAR), f1 = proj(X + 0.08, 0, z + LINE_FAR);
      c.beginPath();
      c.moveTo(n0.x, n0.y);
      c.lineTo(f0.x, f0.y);
      c.lineTo(f1.x, f1.y);
      c.lineTo(n1.x, n1.y);
      c.closePath();
      c.fillStyle = P.chalk;
      c.fill();
    }
    chalk(-FIELD);
    chalk(FIELD);

    // Her 50 metrede boyalı mesafe çizgisi
    for (var mz = Math.ceil(nearZ / 50) * 50; mz < z + 70; mz += 50) {
      if (mz <= 0) continue;
      var l = proj(-FIELD, 0, mz), r = proj(FIELD, 0, mz);
      var th = Math.max(1, 0.12 * l.s);
      c.fillStyle = "rgba(245,248,242,0.55)";
      c.fillRect(l.x, l.y - th / 2, r.x - l.x, th);
      c.save();
      c.font = A.font(Math.max(6, 1.1 * l.s), 900);
      c.textAlign = "center";
      c.fillStyle = "rgba(245,248,242,0.5)";
      var tp = proj(-FIELD + 1.4, 0, mz - 0.9);
      c.translate(tp.x, tp.y);
      c.scale(1, 0.45);
      c.fillText(mz + "m", 0, 0);
      c.restore();
    }
  }

  function drawBoards(c) {
    // Taç çizgisi boyunca LED panolar — hız hissinin taşıyıcısı
    var nearZ = z - CAM_BACK + 0.5;
    var seg = 6;
    var start = Math.floor(nearZ / seg) * seg;
    var bx = FIELD + 1.6;
    for (var sgn = -1; sgn <= 1; sgn += 2) {
      for (var sz = z + 90; sz >= start; sz -= seg) {
        var z0 = Math.max(sz, nearZ), z1 = sz + seg - 0.15;
        if (z1 <= nearZ) continue;
        var a = proj(sgn * bx, 0, z0), b = proj(sgn * bx, 0.9, z0), cc = proj(sgn * bx, 0.9, z1), d = proj(sgn * bx, 0, z1);
        var lit = Math.round(sz / seg) % 3 === 0;
        c.beginPath();
        c.moveTo(a.x, a.y);
        c.lineTo(b.x, b.y);
        c.lineTo(cc.x, cc.y);
        c.lineTo(d.x, d.y);
        c.closePath();
        c.fillStyle = lit ? "#4A2BE0" : "#2A1680";
        c.fill();
        // üst parlak kenar
        c.strokeStyle = "rgba(196,181,253,0.7)";
        c.lineWidth = Math.max(0.5, b.s * 0.04);
        c.beginPath();
        c.moveTo(b.x, b.y);
        c.lineTo(cc.x, cc.y);
        c.stroke();
      }
    }
  }

  function drawGate(c, g) {
    var half = g.gap / 2;
    var L = proj(g.cx - half, 0, g.z), R = proj(g.cx + half, 0, g.z);
    if (L.s < 1.2) return;
    var fade = A.clamp((z + FAR - g.z) / 25, 0, 1);
    var red = g.color === "red";
    var main = red ? "#EF4444" : "#2563EB";
    var light = red ? "#FCA5A5" : "#93C5FD";
    c.save();
    c.globalAlpha = fade;

    // Zemindeki kapı çizgisi — sıradaki kapı parlar
    var upcoming = !g.done && g.z - z < 40;
    if (!g.done || A.time - g.at < 0.4) {
      var th = Math.max(1, 0.14 * L.s);
      var col = g.done ? (g.result === "pass" ? "52,211,153" : "251,113,133") : upcoming ? "255,255,255" : "255,255,255";
      var al = g.done ? 0.9 * (1 - (A.time - g.at) / 0.4) : upcoming ? 0.45 + 0.2 * Math.sin(A.time * 8) : 0.18;
      c.fillStyle = "rgba(" + col + "," + al.toFixed(3) + ")";
      c.fillRect(L.x, L.y - th / 2, R.x - L.x, th);
    }

    [-1, 1].forEach(function (sideSign) {
      var X = g.cx + sideSign * half;
      var base = proj(X, 0, g.z);
      var top = proj(X, POLE_H, g.z);
      var s = base.s;
      var lean = g.hitPole === sideSign ? Math.min(1, (A.time - g.at) * 5) * 0.9 * sideSign : 0;
      var tx = top.x + lean * (base.y - top.y) * 0.8;
      var ty = top.y + Math.abs(lean) * (base.y - top.y) * 0.4;
      // gölge
      c.strokeStyle = "rgba(0,0,0,0.25)";
      c.lineWidth = Math.max(1, 0.07 * s);
      c.beginPath();
      c.moveTo(base.x, base.y);
      c.lineTo(base.x + 0.5 * s, base.y - 0.05 * s);
      c.stroke();
      // taban
      c.fillStyle = "#111827";
      c.beginPath();
      c.ellipse(base.x, base.y, 0.16 * s, 0.05 * s, 0, 0, Math.PI * 2);
      c.fill();
      // direk — beyaz/renk şeritli
      var pw = Math.max(1.4, 0.1 * s);
      var segs = 5;
      for (var i = 0; i < segs; i++) {
        var t0 = i / segs, t1 = (i + 1) / segs;
        c.strokeStyle = i % 2 ? "#F8FAFC" : main;
        c.lineWidth = pw;
        c.lineCap = "butt";
        c.beginPath();
        c.moveTo(A.lerp(base.x, tx, t0), A.lerp(base.y, ty, t0));
        c.lineTo(A.lerp(base.x, tx, t1), A.lerp(base.y, ty, t1));
        c.stroke();
      }
      // bayrak — içe doğru dalgalanan
      var fw = 0.7 * s * -sideSign;
      var fh = 0.5 * s;
      var wave = Math.sin(A.time * 9 + g.z) * 0.12 * s;
      var fg = c.createLinearGradient(tx, ty, tx + fw, ty);
      fg.addColorStop(0, main);
      fg.addColorStop(1, light);
      c.fillStyle = fg;
      c.beginPath();
      c.moveTo(tx, ty);
      c.quadraticCurveTo(tx + fw * 0.5, ty + wave, tx + fw, ty + fh * 0.12 + wave * 0.6);
      c.lineTo(tx + fw, ty + fh + wave * 0.6);
      c.quadraticCurveTo(tx + fw * 0.5, ty + fh + wave, tx, ty + fh);
      c.closePath();
      c.fill();
    });
    c.restore();
  }

  function drawCoin(c, co) {
    var p = proj(co.x, 0.45, co.z);
    if (p.s < 1.5) return;
    var r = 0.24 * p.s;
    var t = co.taken ? (A.time - co.at) / 0.3 : 0;
    var spinW = Math.abs(Math.cos(A.time * 4 + co.z));
    c.save();
    c.globalAlpha = A.clamp((z + FAR - co.z) / 20, 0, 1) * (1 - t);
    c.translate(p.x, p.y - t * 30);
    c.globalCompositeOperation = "lighter";
    var g = c.createRadialGradient(0, 0, 0, 0, 0, r * 2.2);
    g.addColorStop(0, "rgba(255,210,74,0.45)");
    g.addColorStop(1, "rgba(255,210,74,0)");
    c.fillStyle = g;
    c.fillRect(-r * 2.2, -r * 2.2, r * 4.4, r * 4.4);
    c.globalCompositeOperation = "source-over";
    c.scale(0.25 + 0.75 * spinW, 1);
    var cg = c.createLinearGradient(0, -r, 0, r);
    cg.addColorStop(0, "#FFF1A8");
    cg.addColorStop(1, "#E8A20C");
    c.fillStyle = cg;
    c.beginPath();
    c.arc(0, 0, r, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = "rgba(140,80,0,0.6)";
    c.lineWidth = Math.max(1, r * 0.14);
    c.stroke();
    c.font = A.font(r * 1.2, 900);
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillStyle = "rgba(140,80,0,0.75)";
    c.fillText("E", 0, r * 0.06);
    c.restore();
  }

  /* — Figürler: metre biriminde, y yukarı negatif — */
  var limb = A.limb;

  function drawRunner(c, x, y, s, o) {
    // o: {phase, lean, back, kit:{shirt,shirtDark,shorts,sock,skin,hair,num}, alpha, fall}
    var ph = o.phase;
    var k = o.kit;
    c.save();
    c.translate(x, y);
    c.scale(s, s);
    // gölge
    c.fillStyle = "rgba(0,0,0,0.3)";
    c.beginPath();
    c.ellipse(0, 0, 0.42, 0.1, 0, 0, Math.PI * 2);
    c.fill();
    if (o.alpha != null) c.globalAlpha = o.alpha;
    c.rotate(o.lean * 0.32 + (o.fall || 0) * 1.3);

    var hip = -0.95 + Math.abs(Math.sin(ph)) * 0.05;
    // Bacaklar: arkadan bakışta ayak yukarı kalkar (topuk kalçaya)
    function leg(side, phase) {
      var lift = Math.max(0, Math.sin(phase));
      var hx = side * 0.1;
      var kx = side * 0.13, ky = hip + 0.46 - lift * 0.12;
      var fx = side * 0.12, fy = -0.02 - lift * (o.back ? 0.38 : 0.22);
      limb(c, hx, hip + 0.05, kx, ky, 0.085, 0.07, k.skin);
      limb(c, kx, ky, fx, fy, 0.07, 0.052, k.sock);
      c.fillStyle = "#0B1020";
      c.beginPath();
      c.ellipse(fx, fy + 0.03, 0.075, 0.05, 0, 0, Math.PI * 2);
      c.fill();
      if (o.back && lift > 0.3) {
        c.fillStyle = "#F97316";
        c.fillRect(fx - 0.06, fy + 0.04, 0.12, 0.025);
      }
    }
    // önce geri kalan bacak
    if (Math.sin(ph) > 0) {
      leg(-1, ph);
      leg(1, ph + Math.PI);
    } else {
      leg(1, ph + Math.PI);
      leg(-1, ph);
    }
    // Şort
    c.fillStyle = k.shorts;
    c.beginPath();
    c.moveTo(-0.2, hip - 0.08);
    c.lineTo(0.2, hip - 0.08);
    c.lineTo(0.22, hip + 0.18);
    c.lineTo(0.02, hip + 0.16);
    c.lineTo(0, hip + 0.1);
    c.lineTo(-0.02, hip + 0.16);
    c.lineTo(-0.22, hip + 0.18);
    c.closePath();
    c.fill();
    // Kollar — zıt fazda sallanır
    function arm(side, phase) {
      var sw = Math.sin(phase);
      var sx = side * 0.24, sy = hip - 0.5;
      var ex = side * 0.33, ey = sy + 0.24 + sw * 0.04;
      var hx = side * 0.28, hy = ey + 0.18 - sw * 0.12;
      limb(c, sx, sy, ex, ey, 0.06, 0.05, k.shirt);
      limb(c, ex, ey, hx, hy, 0.048, 0.042, k.skin);
    }
    arm(-1, ph + Math.PI);
    arm(1, ph);
    // Gövde
    var tg = c.createLinearGradient(-0.25, 0, 0.25, 0);
    tg.addColorStop(0, k.shirtDark);
    tg.addColorStop(0.5, k.shirt);
    tg.addColorStop(1, k.shirtDark);
    c.fillStyle = tg;
    c.beginPath();
    c.moveTo(-0.2, hip - 0.04);
    c.lineTo(-0.27, hip - 0.52);
    c.quadraticCurveTo(0, hip - 0.62, 0.27, hip - 0.52);
    c.lineTo(0.2, hip - 0.04);
    c.closePath();
    c.fill();
    if (o.back) {
      c.font = "900 0.24px " + A.FONT;
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillStyle = "#FFFFFF";
      c.fillText(k.num, 0, hip - 0.27);
    } else {
      c.fillStyle = "rgba(255,255,255,0.85)";
      c.fillRect(-0.12, hip - 0.43, 0.06, 0.06);
    }
    // Baş
    c.fillStyle = k.skin;
    c.fillRect(-0.045, hip - 0.66, 0.09, 0.1);
    c.beginPath();
    c.arc(0, hip - 0.76, 0.11, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = k.hair;
    c.beginPath();
    if (o.back) c.arc(0, hip - 0.77, 0.113, 0, Math.PI * 2);
    else c.arc(0, hip - 0.79, 0.113, Math.PI * 1.05, Math.PI * 1.95);
    c.fill();
    c.restore();
  }

  var HOME = { shirt: "#6D4AFF", shirtDark: "#3A1FB8", shorts: "#F8FAFC", sock: "#6D4AFF", skin: "#E3AE86", hair: "#24160F", num: "10" };
  var AWAY = { shirt: "#E11D48", shirtDark: "#9F1239", shorts: "#111827", sock: "#E11D48", skin: "#C68B63", hair: "#1B120C", num: "4" };

  function drawPlayer(c) {
    var base = proj(player.x, 0, z);
    var s = base.s * 1.35; // oyuncu figürü biraz büyük: okunurluk
    var alpha = player.invuln > 0 && state === "play" ? 0.55 + 0.35 * Math.sin(A.time * 30) : 1;
    // Top: oyuncunun önünde, ayakla birlikte ileri-geri oynar
    var touch = Math.abs(Math.sin(player.stride));
    var bz = z + 1.25 + touch * 0.3;
    var bxw = player.x + 0.28 + player.lean * 0.5;
    var bp = proj(bxw, 0.11, bz);
    var bg = proj(bxw, 0, bz);
    var br = 0.15 * bp.s * 1.35;
    if (state !== "dying" && state !== "over") {
      c.fillStyle = "rgba(0,0,0,0.3)";
      c.beginPath();
      c.ellipse(bg.x, bg.y, br * 1.1, br * 0.35, 0, 0, Math.PI * 2);
      c.fill();
      A.drawBall(c, bp.x, bp.y - br * 0.2, br, orient, alpha);
    }
    drawRunner(c, base.x, base.y, s, {
      phase: player.stride,
      lean: player.lean - player.stumble * 0.5 * Math.sign(player.lean || 1),
      back: true,
      kit: HOME,
      alpha: alpha,
      fall: state === "dying" || state === "over" ? A.clamp(dyingT * 2, 0, 1) * 0.6 : 0,
    });
  }

  function drawFoe(c, fo) {
    var base = proj(fo.x, 0, fo.z);
    if (base.s < 1.5) return;
    var s = base.s * 1.3;
    var fade = A.clamp((z + FAR - fo.z) / 25, 0, 1);
    c.save();
    c.globalAlpha = fade;
    var lean = fo.slide ? Math.cos(A.time * 1.9 + fo.phase) * 0.5 : 0;
    if (fo.hit) {
      var t = A.clamp((A.time - fo.at) * 3, 0, 1);
      c.translate(0, 0);
      lean = (player.x > fo.x ? -1 : 1) * t * 2.5;
    }
    drawRunner(c, base.x, base.y, s, {
      phase: fo.slide ? A.time * 9 + fo.phase : Math.sin(A.time * 3 + fo.phase) * 0.3,
      lean: lean,
      back: false,
      kit: AWAY,
    });
    c.restore();
  }

  function drawSpeedLines(c) {
    var t = A.clamp((speed - 12) / 9, 0, 1);
    if (t <= 0 || A.reduceMotion) return;
    c.save();
    c.strokeStyle = "rgba(255,255,255," + (0.25 * t).toFixed(3) + ")";
    c.lineCap = "round";
    for (var i = 0; i < 10; i++) {
      var sgn = i % 2 ? 1 : -1;
      var X = sgn * (FIELD + 0.4 + (i % 5) * 0.9);
      var zz = z + ((((i * 37.3 - z * 1.6) % 60) + 60) % 60);
      var a = proj(X, 0.6 + (i % 3) * 0.7, zz), b = proj(X, 0.6 + (i % 3) * 0.7, zz - 4 - t * 4);
      c.lineWidth = Math.max(1, b.s * 0.05);
      c.beginPath();
      c.moveTo(a.x, a.y);
      c.lineTo(b.x, b.y);
      c.stroke();
    }
    c.restore();
  }

  function drawHud(c) {
    var top = 14;
    A.drawScore(c, 18, top, "PUAN", points, scoreBump);
    A.drawLives(c, W - 26, top + 12, lives, LIVES, 9);
    c.save();
    var lbl = "SEVİYE " + level;
    c.font = A.font(12, 800);
    var lw = c.measureText(lbl).width + 22;
    A.pill(c, W - 16 - lw, top + 30, lw, 26, "rgba(60,36,200,0.75)");
    c.fillStyle = "#fff";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(lbl, W - 16 - lw / 2, top + 43.5);
    var sp = Math.round(speed * 3.6) + " km/s";
    var sw = c.measureText(sp).width + 22;
    A.pill(c, W - 16 - sw, top + 62, sw, 26);
    c.fillStyle = "rgba(255,255,255,0.9)";
    c.fillText(sp, W - 16 - sw / 2, top + 75.5);

    // Çarpan çubuğu
    var mult = multiplier();
    var bx = 18, by = top + 66, bw = 110;
    A.pill(c, bx, by, bw, 10);
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
    c.fillStyle = mult > 1 ? P.gold : "rgba(255,255,255,0.75)";
    c.fillText("×" + mult, bx + bw + 8, by + 5.5);
    c.font = A.font(11, 700);
    c.fillStyle = "rgba(255,255,255,0.7)";
    c.fillText(passed + " kapı · " + Math.round(z) + " m", bx, by + 24);
    c.restore();
  }

  function debug() {
    return { state: state, z: z, speed: speed, passed: passed, points: points, lives: lives, level: level, player: player, gates: gates.slice(0, 4), foes: foes.length };
  }

  A.register({ resize: resize, start: start, update: update, render: render, down: down, move: move, up: up, debug: debug });
})();
