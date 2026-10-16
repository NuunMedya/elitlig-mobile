/*
 * TOP SEKTİR 3B — topu yere düşürmeden sektir; ligin oyuncularını geç.
 *
 * MİMARİ: fizik ve dokunma kuralları EKRAN koordinatlarında (piksel) kalır;
 * başsız testler yalnız simülasyonu koşturur. Çizim three.js: top kameraya
 * bakan bir düzlemde, penaltı noktasının önünde durur; piksel → metre
 * dönüşümü kamerayla birebirdir (dokunduğun yer topun göründüğü yerdir).
 * Arkada ortak gece stadyumu (games/stadium3d.js): kale, file, tribünde
 * oyuncunun kulübünün renklerinde seyirci.
 *
 * GERÇEK İÇERİK (RN'den {type:"config", roster:{juggler, rivals}}):
 *   · Topu seçilen gerçek oyuncu sektirir (forma, soyadı, numara). Kontrol
 *     TAM İSABET penceresini ±%15, denge rüzgârın etkisini ±%10 değiştirir.
 *   · GEÇTİĞİN OYUNCULAR: sekme sayın ligin oyuncularının sezon gol + asist
 *     sayısını geçtikçe onları geride bırakırsın ("A. Yılmaz'ı geçtin · 31").
 *     Sıradaki hedef HUD'da görünür.
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
    if (R) paintCrowd();
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

  var W = 0, H = 0, S = 1;
  var groundY = 0, boardsY = 0, boardsH = 0, standTop = 0;

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
  var passedLine = null;

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
    if (!ball) resetBall();
    else ball.x = A.clamp(ball.x, 0, W);
    initGL();
    resizeGL();
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
    passedRivals = 0;
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

    var perfect = edge < 0.3 * (1 + 0.15 * attr("control"));
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

    // Geçtiğin oyuncular: sekme sayısı oyuncunun sezon gol + asist sayısını geçti.
    var rv = nextRival();
    if (rv && kicks >= rv.value) {
      passedRivals += 1;
      points += 3;
      boardFlash = 1;
      passedLine = { text: rv.short + " geçildi · " + rv.value + " gol+asist", age: 0, kit: kitOf(rv) };
      A.sound("coin");
      A.haptic("success");
    }

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
    if (passedLine) {
      passedLine.age += dt;
      if (passedLine.age > 2.4) passedLine = null;
    }
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
    // Denge: rüzgârın topa etkisi ±%10.
    ball.vx += (state === "play" ? wind * (1 - 0.1 * attr("agility")) : 0) * dt;
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
          stats: { kicks: kicks, level: level, bestCombo: bestCombo, stars: stars, passed: passedRivals, rivals: rivals.length },
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

  /* ═══════════════════════════ 3B ÇİZİM ═══════════════════════════ */

  var K = A.T3;
  var R = null;
  var glFailed = false;
  var CAM_D = 7; // kameranın top düzlemine uzaklığı (m)
  var Z0 = 10.5; // top düzlemi: penaltı noktasının önü (kale arkada)

  /** Tribün: yarısı oyuncunun kulübü, yarısı sıradaki rakibin kulübü. */
  function paintCrowd() {
    if (!R) return;
    var nr = nextRival();
    S3.paintCrowd(kitOf(juggler), nr ? kitOf(nr) : { primary: "#1E293B", secondary: "#F8FAFC" });
  }

  /** Piksel / metre: oyuncu (1,8 m) ekran yüksekliğinin ~%42'si. */
  function ppm() {
    return (0.42 * H) / 1.8;
  }
  function wx(x) {
    return (x - W / 2) / ppm();
  }
  function wy(y) {
    return (groundY - y) / ppm();
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
      scene.background = new T.Color(0x040714);
      scene.fog = new T.FogExp2(0x0b1230, 0.0065);
      R = { renderer: renderer, scene: scene, camera: new T.PerspectiveCamera(40, 1, 0.1, 400), U: { time: { value: 0 }, excite: { value: 0 } }, cast: {} };
      S3.build(R);
      buildStar();
      paintCrowd();
      resizeGL();
    } catch (e) {
      R = null;
      glFailed = true;
    }
  }

  function resizeGL() {
    if (!R || !W || !H) return;
    R.renderer.setSize(W, H, false);
    var cv = R.renderer.domElement;
    if (cv && cv.style) {
      cv.style.width = W + "px";
      cv.style.height = H + "px";
    }
    // Top düzleminde 1 piksel = 1/ppm metre olacak biçimde açı ve konum.
    var cam = R.camera;
    cam.aspect = W / H;
    cam.fov = (2 * Math.atan(H / ppm() / 2 / CAM_D) * 180) / Math.PI;
    cam.position.set(0, wy(H / 2), Z0 + CAM_D);
    cam.lookAt(0, wy(H / 2), Z0);
    cam.updateProjectionMatrix();
  }






  function buildStar() {
    var tex = K.canvasTex(128, 128, function (c) {
      c.translate(64, 64);
      var g = c.createRadialGradient(0, 0, 0, 0, 0, 64);
      g.addColorStop(0, "rgba(255,210,74,0.55)");
      g.addColorStop(1, "rgba(255,210,74,0)");
      c.fillStyle = g;
      c.fillRect(-64, -64, 128, 128);
      c.beginPath();
      for (var i = 0; i < 10; i++) {
        var rr = i % 2 ? 15 : 34;
        var a = (i / 10) * Math.PI * 2 - Math.PI / 2;
        c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      c.closePath();
      var sg = c.createLinearGradient(0, -34, 0, 34);
      sg.addColorStop(0, "#FFF3B0");
      sg.addColorStop(1, "#F59E0B");
      c.fillStyle = sg;
      c.fill();
    });
    R.star = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }));
    R.star.visible = false;
    R.scene.add(R.star);
  }



  function sync(dt) {
    var r = ball.r / ppm();
    R.U.time.value = A.time;
    R.U.excite.value = Math.max(0, boardFlash);
    R.ball.scale.setScalar(r / S3.BALL_R);
    R.ball.position.set(wx(ball.x), wy(ball.y), Z0);
    R.ballShadow.position.set(wx(ball.x), 0.006, Z0);
    R.ballShadow.scale.setScalar(r / S3.BALL_R * 0.8);
    R.ballShadow.material.opacity = 0.5 * Math.max(0.1, 1 - wy(ball.y) * 0.35);
    R.trail.line.visible = false;
    R.ball.rotation.z -= (ball.vx / ppm() / Math.max(0.05, r)) * dt;
    R.ball.rotation.x += ball.spin * dt * 0.6 - (ball.vy / ppm() / Math.max(0.05, r)) * dt * 0.15;
    if (star) {
      var appear = A.easeOutBack(star.age / 0.4);
      var fade = A.clamp((star.life - star.age) / 0.8, 0, 1);
      var blink = star.life - star.age < 1.5 ? 0.6 + 0.4 * Math.sin(star.age * 20) : 1;
      R.star.visible = true;
      R.star.position.set(wx(star.x), wy(star.y), Z0 + 0.05);
      var sz = ((star.r * 3.6) / ppm()) * appear;
      R.star.scale.set(sz, sz, 1);
      R.star.material.opacity = fade * blink;
      R.star.material.rotation = star.age * 1.4;
    } else R.star.visible = false;
    var nr = nextRival();
    S3.paintLed(kitOf(juggler).primary, "#5B3DF5");
    R.ledTex.offset.x = (A.time * 0.02) % 1;
    S3.paintBoards(
      "ELİTLİG ARENA   •   TOP SEKTİR   •   " +
        String(juggler.short).toLocaleUpperCase("tr-TR") +
        (nr ? "   •   SIRADAKİ: " + String(nr.short).toLocaleUpperCase("tr-TR") + " " + nr.value : "") +
        "   •   ",
    );
    R.boardTex.offset.x = (A.time * 0.05) % 1;
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
    var r = ball.r;
    // İz
    var speed = Math.hypot(ball.vx, ball.vy);
    if (speed > 500 * S) {
      for (var i = 0; i < trail.length - 1; i++) {
        var f = i / trail.length;
        c.globalAlpha = f * 0.16;
        c.fillStyle = "#FFFFFF";
        c.beginPath();
        c.arc(trail[i].x, trail[i].y, r * (0.5 + f * 0.45), 0, Math.PI * 2);
        c.fill();
      }
      c.globalAlpha = 1;
    }
    // Temas halkaları
    for (var k = 0; k < rings.length; k++) {
      var rg = rings[k];
      var t = rg.age / 0.45;
      c.strokeStyle = rg.perfect ? "rgba(255,210,74," + (1 - t) + ")" : "rgba(255,255,255," + 0.8 * (1 - t) + ")";
      c.lineWidth = 3 * (1 - t) + 1;
      c.beginPath();
      c.ellipse(rg.x, rg.y, r * (0.4 + t * 1.4), r * (0.18 + t * 0.6), 0, 0, Math.PI * 2);
      c.stroke();
    }
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
    A.drawFloaters(c, dt);
    if (state === "play" || state === "dying") drawHud(c);
    if (passedLine) drawPassed(c);
    A.drawBanner(c, W, H * 0.3, dt);
    if (state === "dying") {
      var t2 = A.clamp(deathT / 0.5, 0, 1);
      c.fillStyle = "rgba(251,113,133," + 0.25 * (1 - t2) + ")";
      c.fillRect(0, 0, W, H);
    }
  }

  var vignetteLayer = null;
  function drawVignette(c) {
    if (!vignetteLayer || vignetteLayer.w !== W || vignetteLayer.h !== H) {
      vignetteLayer = A.layer(W, H);
      A.paintVignette(vignetteLayer.ctx, W, H, 0.5);
      A.paintTopScrim(vignetteLayer.ctx, W, 130);
    }
    A.blit(vignetteLayer);
  }

  /** "X geçildi" bandı — altta, oyuncunun takım rengi şeritli. */
  function drawPassed(c) {
    var p = passedLine;
    var inT = A.easeOutBack(p.age / 0.3);
    var out = A.clamp((2.4 - p.age) / 0.35, 0, 1);
    c.save();
    c.globalAlpha = out;
    c.font = A.font(13, 800);
    var text = p.text;
    var tw = Math.min(W - 32, c.measureText(text).width + 40);
    var x = W / 2 - tw / 2, y = H - 64;
    c.translate(W / 2, y + 16);
    c.scale(0.8 + 0.2 * inT, 0.8 + 0.2 * inT);
    c.translate(-W / 2, -(y + 16));
    A.roundRect(c, x, y, tw, 32, 10);
    c.fillStyle = "rgba(8,10,30,0.86)";
    c.fill();
    c.fillStyle = p.kit.primary;
    c.fillRect(x, y + 6, 4, 20);
    c.fillStyle = P.gold;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(text, W / 2 + 2, y + 16.5);
    c.restore();
  }

  function drawHud(c) {
    var top = 14;
    A.drawScore(c, 18, top, "PUAN", points, scoreBump);
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

    // Sıradaki oyuncu hedefi
    drawTarget(c, top + 96);

    if (Math.abs(wind) > 8 * S) {
      var strength = A.clamp(Math.abs(wind) / (520 * S), 0, 1);
      var dir = Math.sign(wind);
      var cx = W / 2, cy = top + 13;
      A.pill(c, cx - 62, top, 124, 26);
      c.save();
      c.translate(cx, cy);
      c.fillStyle = strength > 0.6 ? P.bad : "#BFE3FF";
      for (var i = 0; i < 3; i++) {
        c.globalAlpha = strength > i / 3 - 0.05 ? 1 : 0.25;
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
      if (!A.reduceMotion) {
        c.save();
        c.strokeStyle = "rgba(220,235,255," + (0.1 + strength * 0.15) + ")";
        c.lineWidth = 1.5;
        c.lineCap = "round";
        for (var j = 0; j < 6; j++) {
          var yy = H * 0.15 + ((j * 97) % (H * 0.6));
          var xx = ((((windDrift + j * 211) % (W + 120)) + W + 120) % (W + 120)) - 60;
          c.beginPath();
          c.moveTo(xx, yy);
          c.lineTo(xx - dir * (30 + strength * 40), yy);
          c.stroke();
        }
        c.restore();
      }
    }
  }

  /** Sıradaki hedef: "Sıradaki: A. Yılmaz · 31 gol+asist" + ilerleme çubuğu. */
  function drawTarget(c, y) {
    var rv = nextRival();
    var w = Math.min(W - 32, 300), h = 30;
    var x = 18;
    c.save();
    A.roundRect(c, x, y, w, h, 8);
    c.fillStyle = "rgba(8,10,30,0.66)";
    c.fill();
    c.textBaseline = "middle";
    c.textAlign = "left";
    if (!rv) {
      c.fillStyle = P.gold;
      c.font = A.font(12, 800);
      c.fillText(rivals.length ? "Ligin bütün oyuncularını geçtin!" : (juggler.short || "") + " sektiriyor", x + 12, y + h / 2 + 0.5);
      c.restore();
      return;
    }
    var prevVal = passedRivals > 0 ? rivals[passedRivals - 1].value : 0;
    var prog = A.clamp((kicks - prevVal) / Math.max(1, rv.value - prevVal), 0, 1);
    c.fillStyle = kitOf(rv).primary;
    c.fillRect(x, y + 5, 4, h - 10);
    c.font = A.font(11, 700);
    c.fillStyle = "rgba(255,255,255,0.65)";
    c.fillText("SIRADAKİ", x + 12, y + h / 2 + 0.5);
    c.font = A.font(12, 800);
    c.fillStyle = "#FFFFFF";
    var label = rv.short + " · " + rv.value;
    var maxW = w - 90;
    while (c.measureText(label).width > maxW && label.length > 4) label = label.slice(0, -1);
    c.fillText(label, x + 74, y + h / 2 + 0.5);
    c.fillStyle = "rgba(255,255,255,0.15)";
    c.fillRect(x + 8, y + h - 4, w - 16, 2);
    c.fillStyle = P.gold;
    c.fillRect(x + 8, y + h - 4, (w - 16) * prog, 2);
    c.restore();
  }

  function debug() {
    return { state: state, kicks: kicks, points: points, level: level, combo: combo, wind: wind, ball: ball, g: gravity(), apex: apexHeight(), groundY: groundY, star: star, juggler: juggler.short, passed: passedRivals, gl: !!R };
  }

  A.register({ resize: resize, start: start, update: update, render: render, down: down, debug: debug, setRoster: setRoster });
})();
