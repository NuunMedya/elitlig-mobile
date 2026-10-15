/*
 * PENALTI 3B — gerçek ligin golcüleri, gerçek ligin kalecileri; WebGL sahnesi.
 *
 * MİMARİ: oyun iki katmandır.
 *   SİMÜLASYON  kurallar, fizik, kaleci zekâsı, puanlama. Çizimden bağımsızdır;
 *               başsız testler (scripts/check-games.mjs) yalnız bunu koşturur.
 *   ÇİZİM       three.js (WebGL) sahnesi alttaki #gl tuvalinde: fiziksel tabanlı
 *               malzemeler, üç projektör ışığı, yumuşak gölgeler, ACES ton
 *               eşleme. Eklemli 3B oyuncular (atıcı + kaleci) işlemsel
 *               animasyonla koşar, vurur, uçar, sevinir. Tribün binlerce
 *               örneklenmiş (instanced) seyirciden oluşur, golde ayağa kalkar.
 *               File deforme olur. Golden sonra yan kameradan yavaş çekim tekrar.
 *               HUD (puan, nişan, yayın bandı, spiker) üstteki saydam 2B tuvalde.
 *   WebGL açılamazsa simülasyon yine çalışır ve HUD uyarı gösterir.
 *
 * KADRO (RN'den {type:"config", roster:{shooter, keepers}}; bkz. elitlig-server
 * services/penaltyRoster.js). Gelmezse varsayılan atıcı ve kaleci merdiveni.
 *   · ATICI: gerçek golcü; formasında soyadı ve numarası, takım renkleri. Üç
 *     özelliği küçük ve DENGELİ etki yapar: şut (topun hızı, kalecinin
 *     erişimi ±%5), isabet (nişanın sapması), falso (aldatma gücü ±%15).
 *   · KALECİ MERDİVENİ: her seviyede (3 golde bir) sıradaki gerçek kaleci;
 *     sonuncusu ligin en çok kurtarış yapanı. Refleks ±%8.
 *
 * KURAL: üç kaçırma hakkın var; gol attıkça seri sürer ve kaleci GİDEREK
 * USTALAŞIR. Skor puandır:
 *   · Gol 100 · köşeye (yan) +50 · yükseğe +50 · falsolu gol +50
 *   · Kaledeki altın HEDEF halkasına isabet +150
 *   · Gol serisi çarpanı: 3 seri ×1,5 · 5 seri ×2 · 8 seri ×3
 *
 * JEST: ekranın alt yarısında yukarı sürükle-bırak. Yatay bileşen yön, dikey
 * yükseklik, uzunluk güç, parmağın kavisi FALSO. Bırakınca atıcı topa koşar.
 *
 * ZORLUK (her 3 golde bir seviye): kalecinin tepki süresi 0,32 → 0,12 sn,
 * okuma hatası azalır; atış süresi 8 → 4 sn; seviye 3 rüzgâr, seviye 5
 * kaleci çizgide oynar; hedef halkası küçülür ve köşeye kayar.
 *
 * KALECİ DÜRÜSTTÜR: kararını top ayrıldıktan SONRA verir, hatayla okur, bir kez
 * dalar ve düzeltemez.
 *
 * KOORDİNAT: simülasyon (X yatay, Y yükseklik, D kameradan uzaklık) birimi
 * metredir; dünyada x = X, y = Y, z = D_GOAL − D (kale çizgisi z = 0, penaltı
 * noktası z = 11, kamera z ≈ 20 — kaleye bakar).
 */
(function () {
  "use strict";
  var A = window.Arena;
  var P = A.PAL;
  var T = window.THREE || (typeof THREE !== "undefined" ? THREE : null); // eslint-disable-line no-undef

  /* ═══════════════════════════ SİMÜLASYON ═══════════════════════════ */

  var GOAL_W = 7.32, GOAL_H = 2.44, NET_BACK_H = 1.9;
  var D_GOAL = 17, D_SPOT = 6, D_NET = 19;
  var BALL_R = 0.11;
  var NET_COLS = 29, NET_ROWS = 14;
  var RUNUP = 0.8; // bırakıştan vuruşa kadar koşu (sn): ~2,2 m düz, tempolu yaklaşma
  var INTRO = 1.4; // eşleşme / yeni kaleci tanıtımı (sn)
  var RESULT = 1.55; // sonuç ekranı
  var REPLAY_AT = 1.0, REPLAY_LEN = 2.3; // gol tekrarı (yalnız gol)

  var W = 0, H = 0;
  var CAM_Y = 1.95, CAM_Z = 20.2; // yayın kamerası: atıcının arkası, göz hizasının biraz üstü

  /* ─────────────── kadro ─────────────── */
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
    var ks = r && Array.isArray(r.keepers) ? r.keepers.filter(function (k) { return k && k.team; }) : [];
    var sig = (s ? s.id : "d") + ":" + ks.map(function (k) { return k.id; }).join(",");
    if (sig === rosterSig) return;
    rosterSig = sig;
    shooter = s || DEFAULT_SHOOTER;
    keepers = ks.length ? ks : DEFAULT_KEEPERS;
    keeperIdx = 0;
    if (R) {
      buildShooter();
      buildKeeper();
      paintCrowdColors();
      boardText = "";
    }
  }
  function keeperNow() {
    return keepers[Math.min(keeperIdx, keepers.length - 1)];
  }
  function attr(obj, key, fallback) {
    var v = obj && obj.attrs ? Number(obj.attrs[key]) : NaN;
    return Number.isFinite(v) ? A.clamp(v, 50, 99) : fallback;
  }
  function norm(v) {
    return A.clamp((v - 77.5) / 17.5, -1, 1);
  }
  function kitOf(person) {
    var k = person && person.team && person.team.kit ? person.team.kit : {};
    return { primary: k.primary || "#5B3DF5", secondary: k.secondary || "#FFFFFF" };
  }

  /* ─────────────── durum ─────────────── */
  var state = "attract"; // attract | intro | aim | runup | flight | result | over
  var goals = 0, points = 0, misses = 0, streak = 0, bestStreak = 0, shots = 0;
  var level = 1;
  var LIVES = 3;
  var plan = null, flightT = 0, since = 0, slowmo = 1;
  var ball = null, spin = 0, roll = 0, spinAngle = 0, rollAngle = 0;
  var keeper = null;
  var net = new Float32Array(NET_COLS * NET_ROWS);
  var netAlive = false;
  var drag = null;
  var outcome = null, outcomeT = 0, outcomeGain = 0, outcomeTags = [];
  var clock = 0, clockMax = 8;
  var wind = 0;
  var target = null;
  var scoreBump = 0;
  var path = [];
  var runT = 0, pendingShot = null, afterStrike = 0;
  var introT = 0, introKind = "match";
  var keeperEnter = 1;
  var line = null, lineT = 0;
  var replay = null; // { plan, k: {fromX, target, divedAt} }
  var resultLen = RESULT;
  var excite = 0;

  function difficulty() {
    return 1 - Math.exp(-goals / 9);
  }
  function lerpD(a, b) {
    return a + (b - a) * difficulty();
  }

  /* ─────────────── atış planı ─────────────── */

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

  /** Kalecinin dalışı: karar anından sonraki süreye göre (canlı ve tekrar ortak). */
  function diveAt(k, t, settle) {
    var dur = 0.28 - difficulty() * 0.05;
    var p = A.clamp((t - k.divedAt) / dur, 0, 1);
    var e = A.smooth(p);
    var span = Math.min(1, Math.abs(k.target - k.fromX) * 2.6);
    return {
      x: k.fromX + (k.target - k.fromX) * e,
      dive: Math.sign(k.target - k.fromX) * span * Math.min(1, e * 1.6),
      lift: Math.sin(e * Math.PI * 0.5) * span * (settle == null ? 1 : settle),
    };
  }

  /* ─────────────── akış ─────────────── */

  function restingKeeper() {
    return { x: 0.5, fromX: 0.5, target: null, decideAt: 0, divedAt: null, dive: 0, lift: 0, crouch: 0, celebrate: 0 };
  }
  function spotBall() {
    return { X: 0, Y: BALL_R, D: D_SPOT, vX: 0, vY: 0, vD: 0, free: false };
  }

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
    if (R) buildKeeper();
    prepareShot();
    state = "intro";
    introKind = "match";
    introT = 0;
    keeperEnter = 1;
    A.sound("whistle");
  }

  function prepareShot() {
    plan = null;
    flightT = 0;
    since = 0;
    slowmo = 1;
    ball = spotBall();
    spin = 0;
    roll = 0;
    spinAngle = 0;
    rollAngle = 0;
    keeper = restingKeeper();
    outcome = null;
    drag = null;
    runT = 0;
    afterStrike = 0;
    pendingShot = null;
    replay = null;
    resultLen = RESULT;
    netAlive = false;
    net.fill(0);
    if (R) {
      R.netDirty = true;
      R.trail.pts.length = 0;
    }
    var bonus = A.perks && A.perks.penalti ? A.clamp(Number(A.perks.penalti.aimBonus) || 0, 0, 0.1) : 0;
    clockMax = lerpD(8, 4) * (1 + bonus);
    clock = clockMax;
    if (level >= 3) {
      var max = level >= 6 ? 1.4 : level >= 4 ? 1.0 : 0.7;
      wind = (Math.random() < 0.5 ? -1 : 1) * A.rand(0.25, 1) * max;
    } else wind = 0;
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
      if (R) buildKeeper();
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

  function strike() {
    plan = pendingShot;
    pendingShot = null;
    flightT = 0;
    since = 0;
    afterStrike = 0;
    spin = -plan.curve * 18;
    roll = 18 + plan.power * 22;
    keeper.fromX = keeper.x;
    keeper.decideAt = lerpD(0.32, 0.12) * (1 - 0.08 * norm(attr(keeperNow(), "reflex", 75)));
    keeper.target = null;
    keeper.divedAt = null;
    state = "flight";
    A.sound("kick");
    A.haptic("medium");
    var sp = screenOf(0, 0, D_SPOT);
    A.burst(sp.x, sp.y, 14, { angle: -Math.PI / 2, spread: 1.6, speed: 150, gravity: 520, life: 0.55, size: 3, color: ["#1F7A3D", "#2E9B53", "#6B4E2E"] });
  }

  function land(result) {
    outcome = result;
    outcomeT = 0;
    outcomeTags = [];
    outcomeGain = 0;
    state = "result";
    if (result === "sure") {
      streak = 0;
      misses += 1;
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
      outcomeGain = Math.round(base * streakMult());
      points += outcomeGain;
      scoreBump = 1;
      excite = 1;
      b.vD = speed * 0.55;
      b.vX = 0;
      b.vY = 0;
      var col = A.clamp(Math.round(L.x * (NET_COLS - 1)), 0, NET_COLS - 1);
      var row = A.clamp(Math.round((1 - Math.min(1, L.y)) * (NET_ROWS - 1)), 0, NET_ROWS - 1);
      net[row * NET_COLS + col] = 1.8;
      netAlive = true;
      // Tekrar: gol anının planı ve kalecinin kararı saklanır.
      if (!A.reduceMotion && R) {
        replay = { plan: plan, k: { fromX: keeper.fromX, target: keeper.target, divedAt: keeper.divedAt } };
        resultLen = REPLAY_AT + REPLAY_LEN + 0.2;
      }
      confetti();
      A.shake(6);
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
      if (result === "kurtaris") {
        var away = Math.sign(L.x - keeper.x) || 1;
        b.vD = -6;
        b.vX = away * 4.5;
        b.vY = 3.4;
        spin = -spin * 0.5;
        keeper.celebrate = 1;
        A.sound("tap");
        A.sound("groan");
        var kp = screenOf(b.X, b.Y, b.D);
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
    var p = screenOf(ball.X, ball.Y, ball.D);
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

  /* ─────────────── spiker ─────────────── */

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

  /* ─────────────── güncelleme ─────────────── */

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
        next[i] = (net[i] + (sum / n - net[i]) * 0.22) * 0.88;
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
    if (target) target.pulse = Math.max(0, target.pulse - dt * 1.5);
    lineT += dt;
    excite = Math.max(0, excite - dt * 0.35);
    keeperEnter = Math.min(1, keeperEnter + dt / 1.0);
    if (state === "flight" || state === "result") afterStrike += dt;

    if (netAlive) {
      netAcc += dt;
      while (netAcc > 1 / 60) {
        netAcc -= 1 / 60;
        netAlive = relaxNet();
      }
    }

    var k = keeper;

    if (state === "attract" || state === "intro") {
      k.x = 0.5 + Math.sin(A.time * 1.4) * 0.04;
      k.crouch = 0.5 + 0.5 * Math.sin(A.time * 3);
      if (state === "intro") {
        introT += dt;
        if (introT >= INTRO) {
          state = "aim";
          if (introKind === "match") A.announce("PENALTI!", "Yukarı sürükle, bırak");
        }
      }
      return;
    }

    if (state === "aim") {
      var sway = level >= 5 ? 0.11 + 0.02 * Math.min(4, level - 5) : 0.035;
      var freq = level >= 5 ? 1.25 : 1.7;
      k.x = 0.5 + Math.sin(A.time * freq) * sway + (level >= 7 ? Math.sin(A.time * 2.9) * 0.04 : 0);
      k.crouch = 0.5 + 0.5 * Math.sin(A.time * 3.4);
      clock -= dt;
      if (clock <= 0) {
        clock = 0;
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
      k.crouch = 0.85;
      if (runT >= RUNUP) strike();
      return;
    }

    if (state === "result") {
      outcomeT += dt;
      if (outcomeT > resultLen) {
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
      var dv = diveAt(k, since, state === "result" ? Math.max(0, 1 - outcomeT * 1.2) : 1);
      k.x = dv.x;
      k.dive = dv.dive;
      k.lift = dv.lift;
      k.crouch = 0;
    }

    spinAngle += spin * sdt;
    rollAngle += roll * sdt;

    if (state === "flight") {
      var close = Math.abs(landing(plan).x - k.x) < 0.25;
      slowmo = flightT > 0.78 && close && !A.reduceMotion ? 0.32 : 1;
      flightT = Math.min(1, flightT + sdt / plan.duration);
      var pos = ballAt(plan, flightT);
      ball.X = pos.X;
      ball.Y = pos.Y;
      ball.D = pos.D;
      if (flightT >= 1) {
        slowmo = 1;
        land(resolve(plan, k.x, k.lift));
      }
      return;
    }

    var b = ball;
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
    if (b.D > 21) {
      b.D = 21;
      b.vD = -Math.abs(b.vD) * 0.25;
    }
    spin *= Math.exp(-1.5 * sdt);
    roll = Math.hypot(b.vD, b.vX) * 2.2;
  }

  /* ─────────────── girdi ─────────────── */

  function down(p) {
    // Gol tekrarı dokunuşla geçilir.
    if (state === "result" && replay && outcomeT > REPLAY_AT && outcomeT < resultLen - 0.1) {
      outcomeT = resultLen - 0.05;
      return;
    }
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

  /* ═══════════════════════════ 3B ÇİZİM ═══════════════════════════ */

  var K = A.T3;
  var std = K.std, mesh = K.mesh, canvasTex = K.canvasTex, glowTexture = K.glowTexture;
  var makeAthlete = K.makeAthlete, disposeTree = K.disposeTree, rest = K.rest, runCycle = K.runCycle;
  var R = null; // { renderer, scene, camera, ... }
  var glFailed = false;
  var boardText = "";
  var tmpV = null, tmpW = null;

  function zOf(D) {
    return D_GOAL - D;
  }

  /** Simülasyon noktasının ekran konumu (HUD için); s = metre başına piksel. */
  function screenOf(X, Y, D) {
    if (!R) return { x: W / 2, y: H * 0.8, s: 40 };
    tmpV.set(X, Y, zOf(D));
    var dist = R.camera.position.distanceTo(tmpV);
    tmpV.project(R.camera);
    var s = H / (2 * Math.tan((R.camera.fov * Math.PI) / 360) * Math.max(0.5, dist));
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
      renderer.toneMappingExposure = 1.08;
      renderer.outputColorSpace = T.SRGBColorSpace;
      K.init(renderer);
      var scene = new T.Scene();
      scene.background = new T.Color(0x070b1c);
      scene.fog = new T.Fog(0x0a1030, 28, 95);
      var camera = new T.PerspectiveCamera(45, 1, 0.1, 400);
      tmpV = new T.Vector3();
      tmpW = new T.Vector3();
      R = { renderer: renderer, scene: scene, camera: camera, U: { time: { value: 0 }, excite: { value: 0 } } };
      buildLights();
      buildPitch();
      buildGoal();
      buildStadium();
      buildBall();
      buildTarget();
      buildShooter();
      buildKeeper();
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
    var aspect = W / Math.max(1, H);
    R.camera.aspect = aspect;
    // Kale genişliği ekranın ~%80'i: yatay açıdan dikey açıya.
    var tanH = GOAL_W / 2 / 0.78 / CAM_Z;
    R.baseFov = A.clamp((2 * Math.atan(tanH / aspect) * 180) / Math.PI, 24, 62);
    R.camera.fov = wasReplay ? Math.min(70, R.baseFov * 1.45) : R.baseFov;
    R.camera.updateProjectionMatrix();
  }

  /* Malzeme, doku ve eklemli futbolcu: games/three-kit.js (A.T3). */

  /* ─────────────── ışık ─────────────── */

  function buildLights() {
    var s = R.scene;
    s.add(new T.HemisphereLight(0x9fb4ff, 0x1d3a22, 0.55));
    // Ana projektör: kameranın sağ arkası, yüksek — gölgeler kaleye düşer.
    var key = new T.DirectionalLight(0xfff4e0, 2.6);
    key.position.set(14, 32, 34);
    key.target.position.set(0, 0, 4);
    key.castShadow = true;
    key.shadow.mapSize.set(1536, 1536);
    var sc = key.shadow.camera;
    sc.left = -14;
    sc.right = 14;
    sc.top = 16;
    sc.bottom = -16;
    sc.near = 5;
    sc.far = 90;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.02;
    key.shadow.radius = 3;
    s.add(key);
    s.add(key.target);
    // İkinci projektör: sol arka, gölgesiz dolgu.
    var fill = new T.DirectionalLight(0xdfe8ff, 0.9);
    fill.position.set(-20, 26, 30);
    s.add(fill);
    // Kontra ışık: kalenin arkasından — oyunculara kenar parlaklığı.
    var rim = new T.DirectionalLight(0xb9c8ff, 1.1);
    rim.position.set(-6, 22, -40);
    s.add(rim);
  }

  /* ─────────────── saha ─────────────── */

  function buildPitch() {
    var X0 = -36, X1 = 36, Z0 = -6, Z1 = 30;
    var tex = canvasTex(2048, 1024, function (c, cw, ch) {
      var sx = cw / (X1 - X0), sz = ch / (Z1 - Z0);
      var px = function (x) { return (x - X0) * sx; };
      var pz = function (z) { return (z - Z0) * sz; };
      // Biçme bantları (kaleye paralel, 5,5 m)
      for (var z = Z0, i = 0; z < Z1; z += 5.5, i++) {
        c.fillStyle = i % 2 ? "#2f8a47" : "#378f4d";
        c.fillRect(0, pz(z), cw, 5.5 * sz + 1);
      }
      // Boyuna hafif bantlar (dama)
      for (var x = X0, j = 0; x < X1; x += 6, j++) {
        if (j % 2) continue;
        c.fillStyle = "rgba(0,0,0,0.045)";
        c.fillRect(px(x), 0, 6 * sx, ch);
      }
      // Çim gürültüsü
      var rand = A.seeded(99);
      for (var n = 0; n < 90000; n++) {
        c.fillStyle = rand() < 0.5 ? "rgba(255,255,255,0.035)" : "rgba(0,20,0,0.06)";
        c.fillRect(rand() * cw, rand() * ch, 1 + rand() * 1.5, 1 + rand() * 2.5);
      }
      // Aşınma: penaltı noktası ve kale ağzı
      function wear(x0, z0, r, a) {
        var g = c.createRadialGradient(px(x0), pz(z0), 0, px(x0), pz(z0), r * sx);
        g.addColorStop(0, "rgba(120,96,58," + a + ")");
        g.addColorStop(1, "rgba(120,96,58,0)");
        c.fillStyle = g;
        c.fillRect(px(x0) - r * sx, pz(z0) - r * sz, r * 2 * sx, r * 2 * sz);
      }
      wear(0, 11, 1.4, 0.35);
      wear(0, 0.8, 2.6, 0.22);
      // Çizgiler
      c.strokeStyle = "rgba(246,248,240,0.95)";
      c.lineWidth = 0.12 * sx;
      c.lineCap = "round";
      function seg(xa, za, xb, zb) {
        c.beginPath();
        c.moveTo(px(xa), pz(za));
        c.lineTo(px(xb), pz(zb));
        c.stroke();
      }
      seg(X0, 0, X1, 0);
      seg(-9.16, 0, -9.16, 5.5);
      seg(-9.16, 5.5, 9.16, 5.5);
      seg(9.16, 5.5, 9.16, 0);
      seg(-20.16, 0, -20.16, 16.5);
      seg(-20.16, 16.5, 20.16, 16.5);
      seg(20.16, 16.5, 20.16, 0);
      // Ceza yayı: penaltı noktasından 9,15 m, ceza sahası dışı
      c.beginPath();
      var first = true;
      for (var a = -Math.PI / 2; a <= Math.PI / 2; a += 0.02) {
        var ax = Math.sin(a) * 9.15, az = 11 + Math.cos(a) * 9.15;
        if (az < 16.5) {
          first = true;
          continue;
        }
        if (first) c.moveTo(px(ax), pz(az));
        else c.lineTo(px(ax), pz(az));
        first = false;
      }
      c.stroke();
      c.fillStyle = "rgba(246,248,240,0.95)";
      c.beginPath();
      c.arc(px(0), pz(11), 0.13 * sx, 0, Math.PI * 2);
      c.fill();
    });
    var pitch = mesh(new T.PlaneGeometry(X1 - X0, Z1 - Z0), std(0xffffff, 0.92, 0, { map: tex }), false, true);
    pitch.rotation.x = -Math.PI / 2;
    pitch.position.set((X0 + X1) / 2, 0, (Z0 + Z1) / 2);
    R.scene.add(pitch);
    var outer = mesh(new T.PlaneGeometry(200, 200), std(0x2b7c41, 0.95), false, true);
    outer.rotation.x = -Math.PI / 2;
    outer.position.y = -0.01;
    R.scene.add(outer);
  }

  /* ─────────────── kale ve file ─────────────── */

  function buildGoal() {
    var g = new T.Group();
    var white = std(0xf4f6fa, 0.28, 0.15);
    var r = 0.06;
    var half = GOAL_W / 2;
    var post = new T.CylinderGeometry(r, r, GOAL_H + r, 20);
    var pl = mesh(post, white), pr = mesh(post, white);
    pl.position.set(-half - r, (GOAL_H + r) / 2, 0);
    pr.position.set(half + r, (GOAL_H + r) / 2, 0);
    var bar = mesh(new T.CylinderGeometry(r, r, GOAL_W + 4 * r, 20), white);
    bar.rotation.z = Math.PI / 2;
    bar.position.set(0, GOAL_H + r / 2, 0);
    g.add(pl, pr, bar);
    R.posts = [pl, pr, bar];
    var thin = std(0xcfd6df, 0.4, 0.3);
    var back = 2;
    function rod(x1, y1, z1, x2, y2, z2, rr) {
      var a = new T.Vector3(x1, y1, z1), b = new T.Vector3(x2, y2, z2);
      var len = a.distanceTo(b);
      var m = mesh(new T.CylinderGeometry(rr, rr, len, 8), thin);
      m.position.copy(a).add(b).multiplyScalar(0.5);
      m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      g.add(m);
    }
    rod(-half, GOAL_H, 0, -half, NET_BACK_H, -back, 0.02);
    rod(half, GOAL_H, 0, half, NET_BACK_H, -back, 0.02);
    rod(-half, NET_BACK_H, -back, half, NET_BACK_H, -back, 0.02);
    rod(-half, 0.02, -back, half, 0.02, -back, 0.025);
    rod(-half, 0.02, 0, -half, 0.02, -back, 0.025);
    rod(half, 0.02, 0, half, 0.02, -back, 0.025);
    rod(-half, 0, -back, -half, NET_BACK_H, -back, 0.02);
    rod(half, 0, -back, half, NET_BACK_H, -back, 0.02);
    R.scene.add(g);

    // File: arka (deforme olur) + yanlar + tavan, çizgi parçaları.
    var netMat = new T.LineBasicMaterial({ color: 0xeef2f7, transparent: true, opacity: 0.62 });
    var segs = (NET_COLS - 1) * NET_ROWS + NET_COLS * (NET_ROWS - 1);
    var backGeo = new T.BufferGeometry();
    backGeo.setAttribute("position", new T.BufferAttribute(new Float32Array(segs * 6), 3));
    var backNet = new T.LineSegments(backGeo, netMat);
    backNet.frustumCulled = false;
    R.scene.add(backNet);
    R.backNet = backNet;
    var fixed = [];
    function L(ax, ay, az, bx, by, bz) {
      fixed.push(ax, ay, az, bx, by, bz);
    }
    var steps = 10;
    for (var i = 0; i <= steps; i++) {
      var f = i / steps, z = -back * f, top = GOAL_H + (NET_BACK_H - GOAL_H) * f;
      L(-half, 0, z, -half, top, z);
      L(half, 0, z, half, top, z);
    }
    for (var j = 1; j <= 12; j++) {
      var yf = j / 12;
      L(-half, GOAL_H * yf, 0, -half, NET_BACK_H * yf, -back);
      L(half, GOAL_H * yf, 0, half, NET_BACK_H * yf, -back);
    }
    for (var c = 0; c < NET_COLS; c++) {
      var x = -half + (GOAL_W * c) / (NET_COLS - 1);
      L(x, GOAL_H, 0, x, NET_BACK_H, -back);
    }
    for (var k = 1; k < steps; k++) {
      var kf = k / steps;
      L(-half, GOAL_H + (NET_BACK_H - GOAL_H) * kf, -back * kf, half, GOAL_H + (NET_BACK_H - GOAL_H) * kf, -back * kf);
    }
    var fixedGeo = new T.BufferGeometry();
    fixedGeo.setAttribute("position", new T.BufferAttribute(new Float32Array(fixed), 3));
    R.scene.add(new T.LineSegments(fixedGeo, new T.LineBasicMaterial({ color: 0xeef2f7, transparent: true, opacity: 0.4 })));
    var shade = mesh(new T.PlaneGeometry(GOAL_W, back), new T.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.18, depthWrite: false }), false, false);
    shade.rotation.x = -Math.PI / 2;
    shade.position.set(0, 0.005, -back / 2);
    R.scene.add(shade);
    updateNet();
  }

  function updateNet() {
    var arr = R.backNet.geometry.attributes.position.array;
    var half = GOAL_W / 2;
    var i = 0;
    var a = [0, 0, 0], b = [0, 0, 0];
    function node(col, row, out) {
      var push = net[row * NET_COLS + col];
      out[0] = (-half + (GOAL_W * col) / (NET_COLS - 1)) * (1 - push * 0.03);
      out[1] = NET_BACK_H * (1 - row / (NET_ROWS - 1));
      out[2] = -2 - push * 0.9;
    }
    function put(p) {
      arr[i++] = p[0];
      arr[i++] = p[1];
      arr[i++] = p[2];
    }
    for (var r = 0; r < NET_ROWS; r++)
      for (var c = 0; c < NET_COLS - 1; c++) {
        node(c, r, a);
        node(c + 1, r, b);
        put(a);
        put(b);
      }
    for (var c2 = 0; c2 < NET_COLS; c2++)
      for (var r2 = 0; r2 < NET_ROWS - 1; r2++) {
        node(c2, r2, a);
        node(c2, r2 + 1, b);
        put(a);
        put(b);
      }
    R.backNet.geometry.attributes.position.needsUpdate = true;
  }

  /* ─────────────── stadyum ─────────────── */

  var ROWS = 26;

  function buildStadium() {
    var s = R.scene;
    // LED reklam panoları: kale arkası ve yanlar
    R.boardTex = canvasTex(2048, 64, function () {}, true);
    R.boardTex.repeat.set(3, 1);
    var boardMat = new T.MeshBasicMaterial({ map: R.boardTex, toneMapped: false });
    var dark = std(0x111827, 0.6);
    var boardBack = mesh(new T.BoxGeometry(70, 0.9, 0.2), [dark, dark, dark, dark, boardMat, dark], true, true);
    boardBack.position.set(0, 0.45, -5);
    s.add(boardBack);
    [-1, 1].forEach(function (side) {
      var b = mesh(new T.BoxGeometry(0.2, 0.9, 40), [side > 0 ? dark : boardMat, side > 0 ? boardMat : dark, dark, dark, dark, dark], true, true);
      b.position.set(side * 26, 0.45, 14);
      s.add(b);
    });
    // Tribün kademeleri (beton) — arka + iki yan
    var concrete = std(0x1b2238, 0.9);
    function tier(cx, cz, w, rows, rotY) {
      var grp = new T.Group();
      for (var r = 0; r < rows; r++) {
        var step = mesh(new T.BoxGeometry(w, 0.45 * (r + 1), 0.8), concrete, false, true);
        step.position.set(0, (0.45 * (r + 1)) / 2 + 1.2, -r * 0.8);
        grp.add(step);
      }
      grp.position.set(cx, 0, cz);
      grp.rotation.y = rotY || 0;
      s.add(grp);
    }
    tier(0, -11, 84, ROWS, 0);
    tier(-30, 14, 50, 18, Math.PI / 2);
    tier(30, 14, 50, 18, -Math.PI / 2);
    var wall = mesh(new T.BoxGeometry(84, 1.2, 0.4), std(0x10152a, 0.8), false, true);
    wall.position.set(0, 0.6, -10.6);
    s.add(wall);
    // Panolarla tribün arası: koyu servis yolu
    var track = mesh(new T.PlaneGeometry(90, 6), std(0x1a2a22, 0.95), false, true);
    track.rotation.x = -Math.PI / 2;
    track.position.set(0, 0.005, -8);
    s.add(track);
    var roofY = 1.2 + ROWS * 0.45 + 3.2;
    var roof = mesh(new T.BoxGeometry(84, 0.6, 16), std(0x090c18, 0.9), false, false);
    roof.position.set(0, roofY, -11 - ROWS * 0.8 + 4);
    s.add(roof);
    // Çatı altı projektör sırası (ışıyan paneller + parlama)
    var panelMat = new T.MeshBasicMaterial({ color: 0xfffbea, toneMapped: false });
    var glowMat = new T.SpriteMaterial({ map: glowTexture(), color: 0xfff1d6, transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: 0.85 });
    for (var i = -6; i <= 6; i++) {
      var panel = mesh(new T.BoxGeometry(2.2, 0.7, 0.2), panelMat, false, false);
      panel.position.set(i * 5.5, roofY - 0.6, -11 - ROWS * 0.8 + 11.8);
      panel.rotation.x = 0.5;
      s.add(panel);
      var glow = new T.Sprite(glowMat);
      glow.position.copy(panel.position).add(new T.Vector3(0, 0, 0.6));
      glow.scale.set(9, 9, 1);
      s.add(glow);
    }
    [-1, 1].forEach(function (side) {
      var mast = mesh(new T.CylinderGeometry(0.35, 0.5, 34, 10), std(0x0c1022, 0.7, 0.4), false, false);
      mast.position.set(side * 36, 17, -22);
      s.add(mast);
      var head = mesh(new T.BoxGeometry(7, 4, 0.5), panelMat, false, false);
      head.position.set(side * 36, 34, -21.5);
      head.rotation.y = -side * 0.5;
      s.add(head);
      var g2 = new T.Sprite(glowMat);
      g2.position.set(side * 36, 34, -20.5);
      g2.scale.set(30, 30, 1);
      s.add(g2);
    });

    // Seyirciler: örneklenmiş gövde + baş; aPhase ile bağımsız salınım.
    var spots = [];
    var rnd = A.seeded(31);
    function seats(cx, cz, w, rows, rotY, dens) {
      var cos = Math.cos(rotY || 0), sin = Math.sin(rotY || 0);
      for (var r = 0; r < rows; r++)
        for (var x = -w / 2 + 0.35; x < w / 2; x += 0.62) {
          if (rnd() > dens) continue;
          var lx = x + (rnd() - 0.5) * 0.15, lz = -r * 0.8 - 0.2;
          spots.push({ x: cx + lx * cos + lz * sin, y: 1.2 + 0.45 * (r + 1), z: cz - lx * sin + lz * cos, rot: rotY || 0 });
        }
    }
    seats(0, -11, 82, ROWS, 0, 0.9);
    seats(-30, 14, 48, 18, Math.PI / 2, 0.85);
    seats(30, 14, 48, 18, -Math.PI / 2, 0.85);
    var n = spots.length;
    var bodyGeo = new T.BoxGeometry(0.44, 0.62, 0.3);
    bodyGeo.translate(0, 0.31, 0);
    var headGeo = new T.IcosahedronGeometry(0.12, 0);
    headGeo.translate(0, 0.76, 0);
    var phase = new Float32Array(n);
    for (var p = 0; p < n; p++) phase[p] = rnd();
    bodyGeo.setAttribute("aPhase", new T.InstancedBufferAttribute(phase, 1));
    headGeo.setAttribute("aPhase", new T.InstancedBufferAttribute(phase, 1));
    function crowdMat() {
      // Tribün sahadan loş: örnek rengi bu tonla çarpılır.
      var m = std(0x7c8090, 0.9);
      m.onBeforeCompile = function (sh) {
        sh.uniforms.uTime = R.U.time;
        sh.uniforms.uExcite = R.U.excite;
        sh.vertexShader =
          "attribute float aPhase;\nuniform float uTime;\nuniform float uExcite;\n" +
          sh.vertexShader.replace(
            "#include <begin_vertex>",
            "#include <begin_vertex>\n" +
              "float jump = uExcite * max(0.0, sin(uTime * 9.0 + aPhase * 37.0)) * (0.25 + 0.2 * aPhase);\n" +
              "transformed.y += 0.025 * sin(uTime * 1.7 + aPhase * 6.283) + jump;\n",
          );
      };
      return m;
    }
    var bodies = new T.InstancedMesh(bodyGeo, crowdMat(), n);
    var heads = new T.InstancedMesh(headGeo, crowdMat(), n);
    var m4 = new T.Matrix4(), q = new T.Quaternion(), sc = new T.Vector3(1, 1, 1), pos = new T.Vector3(), up = new T.Vector3(0, 1, 0);
    for (var ii = 0; ii < n; ii++) {
      var sp = spots[ii];
      q.setFromAxisAngle(up, sp.rot);
      var k = 0.9 + rnd() * 0.2;
      sc.set(k, k, k);
      pos.set(sp.x, sp.y, sp.z);
      m4.compose(pos, q, sc);
      bodies.setMatrixAt(ii, m4);
      heads.setMatrixAt(ii, m4);
    }
    bodies.frustumCulled = false;
    heads.frustumCulled = false;
    s.add(bodies, heads);
    R.crowd = { bodies: bodies, heads: heads, n: n };
    paintCrowdColors();
  }

  function paintCrowdColors() {
    if (!R || !R.crowd) return;
    var kit = kitOf(shooter);
    var home = [kit.primary, kit.primary, kit.secondary];
    var others = P.crowd;
    var skins = ["#F1C9A5", "#E0AC84", "#C68B63", "#8D5A3B", "#F8D7B5"];
    var col = new T.Color();
    var rand = A.seeded(7);
    for (var i = 0; i < R.crowd.n; i++) {
      col.set(rand() < 0.45 ? home[(rand() * home.length) | 0] : others[(rand() * others.length) | 0]);
      R.crowd.bodies.setColorAt(i, col);
      col.set(skins[(rand() * skins.length) | 0]);
      R.crowd.heads.setColorAt(i, col);
    }
    R.crowd.bodies.instanceColor.needsUpdate = true;
    R.crowd.heads.instanceColor.needsUpdate = true;
  }

  function paintBoards(text) {
    if (text === boardText) return;
    boardText = text;
    var c = R.boardTex.userData.ctx, cw = R.boardTex.userData.canvas.width, ch = R.boardTex.userData.canvas.height;
    var g = c.createLinearGradient(0, 0, 0, ch);
    g.addColorStop(0, "#3B1FD1");
    g.addColorStop(1, "#1E0F7A");
    c.fillStyle = g;
    c.fillRect(0, 0, cw, ch);
    c.font = "900 40px " + A.FONT;
    c.textBaseline = "middle";
    c.fillStyle = "#FFFFFF";
    var unit = c.measureText(text).width || 200;
    for (var x = 0; x < cw; x += unit) c.fillText(text, x, ch * 0.55);
    c.fillStyle = "rgba(0,0,0,0.2)";
    for (var y = 1; y < ch; y += 3) c.fillRect(0, y, cw, 1);
    R.boardTex.needsUpdate = true;
  }

  /* ─────────────── top ─────────────── */

  function buildBall() {
    var geo = new T.SphereGeometry(BALL_R, 48, 32);
    var PHI = (1 + Math.sqrt(5)) / 2;
    var centres = [
      [0, 1, PHI], [0, -1, PHI], [0, 1, -PHI], [0, -1, -PHI],
      [1, PHI, 0], [-1, PHI, 0], [1, -PHI, 0], [-1, -PHI, 0],
      [PHI, 0, 1], [-PHI, 0, 1], [PHI, 0, -1], [-PHI, 0, -1],
    ].map(function (v) {
      var l = Math.hypot(v[0], v[1], v[2]);
      return [v[0] / l, v[1] / l, v[2] / l];
    });
    var nrm = geo.attributes.normal;
    var colors = new Float32Array(nrm.count * 3);
    for (var i = 0; i < nrm.count; i++) {
      var x = nrm.getX(i), y = nrm.getY(i), z = nrm.getZ(i);
      var best = 0;
      for (var k = 0; k < 12; k++) best = Math.max(best, x * centres[k][0] + y * centres[k][1] + z * centres[k][2]);
      var v = best > 0.925 ? 0.06 : best > 0.905 ? 0.45 : 0.95;
      colors[i * 3] = v;
      colors[i * 3 + 1] = v;
      colors[i * 3 + 2] = v * 1.02;
    }
    geo.setAttribute("color", new T.BufferAttribute(colors, 3));
    var m = mesh(geo, new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.38, metalness: 0.0 }));
    R.scene.add(m);
    R.ball = m;
    // Hız izi (kuyruk)
    var trailGeo = new T.BufferGeometry();
    trailGeo.setAttribute("position", new T.BufferAttribute(new Float32Array(24 * 3), 3));
    var trail = new T.Line(trailGeo, new T.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 }));
    trail.frustumCulled = false;
    R.scene.add(trail);
    R.trail = { line: trail, pts: [] };
  }

  function buildTarget() {
    var ring = mesh(new T.TorusGeometry(1, 0.035, 8, 48), new T.MeshBasicMaterial({ color: 0xffd24a, transparent: true, opacity: 0.9, toneMapped: false }), false, false);
    var disc = mesh(new T.CircleGeometry(1, 40), new T.MeshBasicMaterial({ color: 0xffd24a, transparent: true, opacity: 0.12, depthWrite: false, toneMapped: false }), false, false);
    var grp = new T.Group();
    grp.add(ring, disc);
    R.scene.add(grp);
    R.target = grp;
  }

  /* ─────────────── oyuncular (eklemli figür: three-kit.js) ─────────────── */

  function buildShooter() {
    if (R.shooter) {
      R.scene.remove(R.shooter.root);
      disposeTree(R.shooter.root);
    }
    R.shooter = makeAthlete(shooter, { keeper: false });
    R.scene.add(R.shooter.root);
  }
  function buildKeeper() {
    if (R.keeper) {
      R.scene.remove(R.keeper.root);
      disposeTree(R.keeper.root);
    }
    R.keeper = makeAthlete(keeperNow(), { keeper: true });
    R.scene.add(R.keeper.root);
  }

  /* ─────────────── poz: atıcı ─────────────── */

  /*
   * Koşu yolu: topun 2,2 m gerisinden ~22° açıyla DÜZ bir çizgi. Destek (sol)
   * ayağı topun yanına basar, vuran (sağ) bacak geriden gelir. Koşu, gerçek
   * hareket yakalama "jog" klibidir; klibin zamanı vuruş anında sağ bacağın
   * geride, sol ayağın yerde olduğu ana (JOG_PLANT) denk gelecek şekilde
   * geriye doğru kurulur — son adım kendiliğinden vuruşa bağlanır.
   */
  var START = { x: -0.95, z: 13.25 }, KICK = { x: -0.14, z: 11.22 };
  var JOG_PLANT = 0.78;

  function poseShooter() {
    var a = R.shooter;
    var J = a.J;
    rest(a);
    var root = a.root;
    var heading = Math.atan2(KICK.x - START.x, KICK.z - START.z); // koşu yönü
    var face = Math.PI + heading * 0.12 - Math.PI * 0.12; // vuruşta kaleye dönük (hafif açık kalça)
    var t = A.time;
    if (state === "runup") {
      var p = A.clamp(runT / RUNUP, 0, 1);
      // sabit tempo, son adımda hafif yavaşlama (destek ayağına basış)
      var e = p * (1.18 - 0.18 * p);
      root.position.set(A.lerp(START.x, KICK.x, e), 0, A.lerp(START.z, KICK.z, e));
      var turn = A.smooth(A.clamp((p - 0.55) / 0.45, 0, 1));
      root.rotation.y = A.lerp(heading, face, turn);
      // son adım: klip ağırlığı azalır, vuruş öncesi duruşa (geri savrulan bacak) geçilir
      var w = A.smooth(A.clamp((p - 0.7) / 0.3, 0, 1));
      K.play(a, "jog", JOG_PLANT - (RUNUP - runT) * 1.02, 1 - w);
      J.hpb.rotation.x = 0.85 * w;
      J.knb.rotation.x = 1.5 * w;
      J.hpa.rotation.x = -0.15 * w;
      J.kna.rotation.x = 0.2 * w;
      J.shb.rotation.z = -0.5 * w;
      J.sha.rotation.z = 1.0 * w;
      J.sha.rotation.x = 0.3 * w;
      J.spine.rotation.x = 0.08 * w;
      J.hips.position.y = 0.94 - 0.02 * w;
      return;
    }
    if (state === "aim" || state === "intro" || state === "attract" || (state === "result" && outcome === "sure")) {
      // Bekleyiş: koşu çizgisinde, topa bakar; gerçek "bekleme" klibi nefes alır
      root.position.set(START.x, 0, START.z);
      root.rotation.y = heading;
      J.spine.rotation.x = 0.05 + Math.sin(t * 2.1) * 0.015;
      J.head.rotation.x = 0.12;
      return;
    }
    root.position.set(KICK.x, 0, KICK.z);
    root.rotation.y = face;
    if (inReplay()) {
      // Tekrarda vuruş anı yeniden oynar
      var rt = (outcomeT - REPLAY_AT) * 0.55 - 0.25;
      kickPose(J, Math.max(0, rt + 0.06));
      return;
    }
    if (state === "result" && outcome === "gol" && outcomeT > 0.35) {
      // Sevinç: kameraya döner, kollar havada zıplar
      var c = A.clamp((outcomeT - 0.35) / 0.4, 0, 1);
      root.rotation.y = A.lerp(face, 0.15, A.smooth(c));
      var hop = Math.max(0, Math.sin((outcomeT - 0.35) * 9)) * 0.18 * c;
      root.position.y = hop;
      J.sha.rotation.x = -2.8 * c;
      J.shb.rotation.x = -2.8 * c;
      J.sha.rotation.z = 0.35 * c;
      J.shb.rotation.z = -0.35 * c;
      J.ela.rotation.x = -0.3 * c;
      J.elb.rotation.x = -0.3 * c;
      J.kna.rotation.x = hop * 3;
      J.knb.rotation.x = hop * 3;
      J.spine.rotation.x = -0.15 * c;
      J.head.rotation.x = -0.25 * c;
      return;
    }
    if (state === "result" && outcome !== "gol" && outcomeT > 0.3) {
      // Hayal kırıklığı: eller başta
      var d = A.clamp((outcomeT - 0.3) / 0.4, 0, 1);
      J.sha.rotation.x = -2.5 * d;
      J.shb.rotation.x = -2.5 * d;
      J.sha.rotation.z = 0.7 * d;
      J.shb.rotation.z = -0.7 * d;
      J.ela.rotation.x = -2.1 * d;
      J.elb.rotation.x = -2.1 * d;
      J.head.rotation.x = 0.35 * d;
      J.spine.rotation.x = 0.15 * d;
      return;
    }
    kickPose(J, afterStrike);
  }

  /**
   * Vuruş: geri savrulan bacak öne fırlar, gövde geriye yaslanır, kollar
   * denge için açılır; ardından bacak iner ve oyuncu doğrulur (takip hareketi).
   */
  function kickPose(J, k) {
    var sw = A.easeOut(A.clamp(k / 0.2, 0, 1));
    var rec = A.smooth(A.clamp((k - 0.45) / 0.5, 0, 1));
    J.hpb.rotation.x = A.lerp(A.lerp(0.85, -1.35, sw), -0.08, rec);
    J.knb.rotation.x = A.lerp(A.lerp(1.5, 0.1, sw), 0.12, rec);
    J.hpa.rotation.x = -0.12 * (1 - rec);
    J.kna.rotation.x = 0.22 * (1 - rec);
    J.spine.rotation.x = (0.08 - 0.22 * sw) * (1 - rec);
    J.sha.rotation.z = 1.0 * (1 - 0.85 * rec);
    J.shb.rotation.z = -0.5 * (1 - 0.85 * rec);
    J.sha.rotation.x = 0.3 * (1 - rec);
    J.hips.position.y = A.lerp(0.92, 0.94, rec);
  }

  /* ─────────────── poz: kaleci ─────────────── */

  function poseKeeper(k) {
    var a = R.keeper;
    var J = a.J;
    rest(a);
    var root = a.root;
    var enter = A.smooth(keeperEnter);
    var bx = (k.x - 0.5) * GOAL_W;
    var dive = k.dive || 0, lift = k.lift || 0, crouch = k.crouch || 0;
    var live = !inReplay();
    var cheer = live && state === "result" && outcome === "kurtaris" ? A.clamp((outcomeT - 0.5) / 0.3, 0, 1) : 0;
    var beaten = live && state === "result" && outcome === "gol" ? A.clamp((outcomeT - 0.3) / 0.4, 0, 1) : 0;
    if (cheer > 0) {
      dive *= 1 - cheer;
      lift *= 1 - cheer;
    }
    var ad = Math.abs(dive);
    root.position.set(bx - dive * 0.55 + (1 - enter) * 6, 0, 0.35);
    if (enter < 1) {
      // Kaleye yürüyüş
      runCycle(a, A.time * 9, 0.45);
      root.rotation.y = (-Math.PI / 2) * (1 - enter);
      return;
    }
    // Hazır duruş: dizler kırık, kollar açık, parmak uçlarında
    var bounce = Math.abs(Math.sin(A.time * 6)) * 0.03 * crouch;
    J.hips.position.y = 0.94 - crouch * 0.14 + bounce;
    J.hpa.rotation.x = -0.45 * crouch;
    J.hpb.rotation.x = -0.45 * crouch;
    J.kna.rotation.x = 0.9 * crouch;
    J.knb.rotation.x = 0.9 * crouch;
    J.hpa.rotation.z = 0.18 * (1 - ad);
    J.hpb.rotation.z = -0.18 * (1 - ad);
    J.spine.rotation.x = 0.32 * crouch;
    J.sha.rotation.z = 0.75 * (1 - ad);
    J.shb.rotation.z = -0.75 * (1 - ad);
    J.sha.rotation.x = -0.45 * (1 - ad);
    J.shb.rotation.x = -0.45 * (1 - ad);
    J.ela.rotation.x = -0.6 * (1 - ad);
    J.elb.rotation.x = -0.6 * (1 - ad);
    if (ad > 0.01) {
      // Dalış: gövde dalış yönüne yatar, kollar başın üstünde uzanır
      root.rotation.z = -dive * 1.3;
      root.position.y = lift * 0.7 + ad * 0.1;
      J.hips.position.y = 0.94;
      J.sha.rotation.z = A.lerp(J.sha.rotation.z, 2.75, ad);
      J.shb.rotation.z = A.lerp(J.shb.rotation.z, -2.75, ad);
      J.sha.rotation.x = 0;
      J.shb.rotation.x = 0;
      J.ela.rotation.x = -0.1;
      J.elb.rotation.x = -0.1;
      J.hpa.rotation.x = 0.1;
      J.hpb.rotation.x = 0.25;
      J.kna.rotation.x = 0.2;
      J.knb.rotation.x = 0.45;
    }
    if (beaten > 0) {
      // Gol yedi: yerde kalır
      root.position.y = A.lerp(root.position.y, 0.2, beaten);
      root.rotation.z = A.lerp(root.rotation.z, (dive >= 0 ? -1 : 1) * 1.45, beaten);
    }
    if (cheer > 0) {
      // Kurtarış sevinci: yumruk havada
      J.sha.rotation.x = -2.9 * cheer;
      J.sha.rotation.z = 0.2;
      J.ela.rotation.x = -0.6 * cheer;
      J.hips.position.y = 0.94 + Math.max(0, Math.sin(outcomeT * 10)) * 0.06 * cheer;
    }
  }

  function inReplay() {
    return state === "result" && !!replay && outcomeT > REPLAY_AT && outcomeT < REPLAY_AT + REPLAY_LEN;
  }

  /* ─────────────── kamera ─────────────── */

  var camPos = null, camLook = null, wasReplay = false;
  function placeCamera(dt) {
    var cam = R.camera;
    var want = tmpW.set(0, CAM_Y, CAM_Z);
    var look = new T.Vector3(0, 1.02, 0);
    var t = A.time;
    if (state === "attract") {
      want.set(Math.sin(t * 0.25) * 2.2, CAM_Y + 0.4 + Math.sin(t * 0.17) * 0.3, CAM_Z + 1);
    } else if (state === "intro" && introKind === "match") {
      var e = A.smooth(introT / INTRO);
      want.set(A.lerp(9, 0, e), A.lerp(7, CAM_Y, e), A.lerp(29, CAM_Z, e));
      look.set(0, A.lerp(1.6, 1.02, e), 0);
    } else if (state === "intro" && introKind === "keeper") {
      var e2 = A.smooth(Math.min(1, introT / (INTRO * 0.8)));
      want.set(0, A.lerp(1.4, CAM_Y, e2), A.lerp(8, CAM_Z, e2));
      look.set(0, 1.1, 0);
    } else if (inReplay()) {
      // Ters açı: kalenin arkasından, filenin ardından penaltı noktasına
      var side = replay.plan.aimX > 0.5 ? -1 : 1;
      var rp0 = A.clamp((outcomeT - REPLAY_AT) / REPLAY_LEN, 0, 1);
      want.set(side * (2.2 - rp0 * 0.6), 2.2, -5.6 + rp0 * 0.8);
      look.set(0, 1.0, 7.5);
    } else if (state === "flight" || state === "result") {
      var f = state === "flight" ? flightT : 1;
      want.set(ball.X * 0.18, CAM_Y - 0.12 * f, CAM_Z - 2.2 * A.smooth(f));
      look.set(ball.X * 0.35, 1.05, 0);
    }
    want.x += Math.sin(t * 0.9) * 0.03;
    want.y += Math.sin(t * 1.3) * 0.02;
    if (A.shakeAmt > 0.2) {
      want.x += (Math.random() - 0.5) * A.shakeAmt * 0.01;
      want.y += (Math.random() - 0.5) * A.shakeAmt * 0.01;
    }
    var rp = inReplay();
    var cut = rp !== wasReplay || !camPos;
    if (rp !== wasReplay) {
      // Tekrarda daha geniş açı
      cam.fov = rp ? Math.min(70, R.baseFov * 1.45) : R.baseFov;
      cam.updateProjectionMatrix();
    }
    wasReplay = rp;
    if (cut) {
      camPos = want.clone();
      camLook = look.clone();
    } else {
      var kpos = state === "intro" ? 14 : 6;
      camPos.lerp(want, 1 - Math.exp(-kpos * dt));
      camLook.lerp(look, 1 - Math.exp(-kpos * dt));
    }
    cam.position.copy(camPos);
    cam.lookAt(camLook);
  }

  /* ─────────────── sahne güncellemesi ─────────────── */

  function sync(dt) {
    var U = R.U;
    U.time.value = A.time;
    U.excite.value = state === "attract" ? 0 : Math.max(excite, state === "result" && outcome === "gol" ? 1 : 0);

    var kTeam = (keeperNow().team && keeperNow().team.name) || "ElitLig";
    var sTeam = (shooter.team && shooter.team.name) || "ElitLig";
    paintBoards(
      state === "result" && outcome === "gol"
        ? "GOOOL!  " + shooter.back + "   •   "
        : "ELİTLİG ARENA   •   " + sTeam.toLocaleUpperCase("tr-TR") + "  vs  " + kTeam.toLocaleUpperCase("tr-TR") + "   •   ",
    );
    R.boardTex.offset.x = (A.time * 0.04) % 1;

    // Tekrar: top ve kaleci yeniden kurulur (yavaş çekim)
    var bx = ball.X, by = ball.Y, bd = ball.D;
    var kState = keeper;
    if (inReplay()) {
      var rt = (outcomeT - REPLAY_AT) * 0.55 - 0.25;
      var ft = A.clamp(rt / replay.plan.duration, 0, 1.25);
      var bp = ballAt(replay.plan, Math.min(1, ft));
      bx = bp.X;
      by = bp.Y;
      bd = ft > 1 ? Math.min(D_NET - 0.25, bp.D + (ft - 1) * 4) : bp.D;
      var ks = { x: replay.k.fromX, dive: 0, lift: 0, crouch: rt < 0 ? 0.85 : 0 };
      if (rt >= replay.k.divedAt) {
        var dv = diveAt(replay.k, rt, 1);
        ks.x = dv.x;
        ks.dive = dv.dive;
        ks.lift = dv.lift;
      }
      kState = ks;
    }

    R.ball.position.set(bx, by, zOf(bd));
    R.ball.rotation.set(-rollAngle, spinAngle, 0);
    var tr = R.trail;
    if ((state === "flight" || inReplay()) && bd > D_SPOT + 0.2) {
      tr.pts.push(bx, by, zOf(bd));
      if (tr.pts.length > 24 * 3) tr.pts.splice(0, 3);
    } else if (tr.pts.length) tr.pts.splice(0, 3);
    var arr = tr.line.geometry.attributes.position.array;
    var n = tr.pts.length / 3;
    for (var i = 0; i < n; i++) {
      arr[i * 3] = tr.pts[i * 3];
      arr[i * 3 + 1] = tr.pts[i * 3 + 1];
      arr[i * 3 + 2] = tr.pts[i * 3 + 2];
    }
    tr.line.geometry.attributes.position.needsUpdate = true;
    tr.line.geometry.setDrawRange(0, n);
    tr.line.visible = n > 2;

    var showT = target && (state === "aim" || state === "runup" || state === "flight" || (state === "result" && target.pulse > 0 && !inReplay()));
    R.target.visible = !!showT;
    if (showT) {
      var rr = target.r * (1 + 0.05 * Math.sin(A.time * 5) + target.pulse * 0.4);
      R.target.position.set((target.x - 0.5) * GOAL_W, target.y * GOAL_H + BALL_R, 0.06);
      R.target.scale.set(rr, rr, 1);
    }

    if (netAlive || R.netDirty) {
      updateNet();
      R.netDirty = netAlive;
    }
    poseShooter();
    poseKeeper(kState);
    placeCamera(dt);
  }

  /* ═══════════════════════════ ÇİZİM GİRİŞİ ═══════════════════════════ */

  function resize(w, h) {
    W = w;
    H = h;
    if (!ball) {
      ball = spotBall();
      keeper = restingKeeper();
    }
    initGL();
    resizeGL();
  }

  /**
   * Uyarlanır kalite: kare süresi uzun süre 24 ms'yi (≈ 42 fps) aşarsa önce
   * çözünürlük 1×'e iner, sürerse gölgeler kapanır. Akıcılık görüntüden önce gelir.
   */
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
    drawVignette(c);
    A.drawParticles(c);
    A.drawFloaters(c, dt);
    if (state === "aim") drawAim(c);
    if (state !== "attract") drawHud(c);
    if (state === "intro") drawIntro(c);
    if (state === "result" && !inReplay()) drawOutcome(c);
    if (inReplay()) drawReplayBadge(c);
    drawLine(c);
    A.drawBanner(c, W, H * 0.3, dt);
  }

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
      A.paintVignette(vignetteLayer.ctx, W, H, 0.42);
      A.paintTopScrim(vignetteLayer.ctx, W, 150);
      var g = vignetteLayer.ctx.createLinearGradient(0, H - 90, 0, H);
      g.addColorStop(0, "rgba(4,6,18,0)");
      g.addColorStop(1, "rgba(4,6,18,0.4)");
      vignetteLayer.ctx.fillStyle = g;
      vignetteLayer.ctx.fillRect(0, H - 90, W, 90);
    }
    A.blit(vignetteLayer);
  }

  /* ─────────────── HUD ─────────────── */

  function drawAim(c) {
    var spot = screenOf(0, BALL_R, D_SPOT);
    var r = Math.max(10, spot.s * BALL_R * 1.25);
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
      drawTargetLabel(c);
      return;
    }
    var pl = planShot(drag);
    var on = pl.aimX >= 0.025 && pl.aimX <= 0.975 && pl.aimY <= 1.03;
    var tint = on ? "255,255,255" : "251,113,133";
    for (var j = 2; j <= 18; j++) {
      var t = j / 18;
      var bp = ballAt(pl, t);
      var sp = screenOf(bp.X, bp.Y, bp.D);
      c.fillStyle = "rgba(" + tint + "," + (0.3 + 0.6 * (1 - t)).toFixed(3) + ")";
      c.beginPath();
      c.arc(sp.x, sp.y, Math.max(1.6, 3.2 - t * 1.6), 0, Math.PI * 2);
      c.fill();
    }
    var end = ballAt(pl, 1);
    var tp = screenOf(end.X, end.Y, D_GOAL);
    var tr = Math.max(8, tp.s * 0.3);
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
    if (Math.abs(pl.curve) > 0.15) {
      c.font = A.font(12, 900);
      c.textAlign = "center";
      c.fillStyle = P.gold;
      c.fillText("FALSO " + (pl.curve > 0 ? "→" : "←"), spot.x, spot.y + ring + 18);
    }
    drawTargetLabel(c);
  }

  function drawTargetLabel(c) {
    if (!target) return;
    var tg = screenOf((target.x - 0.5) * GOAL_W, target.y * GOAL_H + BALL_R + target.r + 0.22, D_GOAL);
    c.font = A.font(11, 900);
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillStyle = "rgba(255,230,150,0.95)";
    c.fillText("+150", tg.x, tg.y);
  }

  var LABELS = { gol: "GOL!", kurtaris: "KURTARDI!", aut: "AUT!", direk: "DİREK!", sure: "SÜRE DOLDU" };

  function drawOutcome(c) {
    var t = outcomeT;
    var pop = A.easeOutBack(t / 0.35);
    var end = replay ? REPLAY_AT : RESULT;
    var fade = A.clamp((end - t) / 0.3, 0, 1);
    if (fade <= 0) return;
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

  function drawReplayBadge(c) {
    c.save();
    var x = W - 108, y = 128;
    A.pill(c, x, y, 92, 26, "rgba(8,10,30,0.75)");
    c.fillStyle = Math.sin(A.time * 6) > 0 ? "#EF4444" : "rgba(239,68,68,0.4)";
    c.beginPath();
    c.arc(x + 14, y + 13, 4.5, 0, Math.PI * 2);
    c.fill();
    c.font = A.font(11, 900);
    c.fillStyle = "#FFFFFF";
    c.textAlign = "left";
    c.textBaseline = "middle";
    c.fillText("TEKRAR", x + 26, y + 13.5);
    c.font = A.font(10, 700);
    c.fillStyle = "rgba(255,255,255,0.6)";
    c.textAlign = "center";
    c.fillText("Geçmek için dokun", W / 2, H - 70);
    c.restore();
  }

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

  function drawIntro(c) {
    var t = introT;
    var inT = A.easeOutBack(t / 0.35);
    var out = A.clamp((INTRO - t) / 0.25, 0, 1);
    var kp = keeperNow();
    c.save();
    c.globalAlpha = out;
    var cw = Math.min(W - 32, 340), ch = 96;
    var x = W / 2 - cw / 2, y = H * 0.62 - ch / 2;
    c.translate(W / 2, y + ch / 2);
    c.scale(0.85 + 0.15 * inT, 0.85 + 0.15 * inT);
    c.translate(-W / 2, -(y + ch / 2));
    A.roundRect(c, x, y, cw, ch, 16);
    c.fillStyle = "rgba(8,10,30,0.88)";
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

  function drawMatchup(c, y) {
    var kp = keeperNow();
    var sk = kitOf(shooter), kk = kitOf(kp);
    var w = Math.min(W - 32, 360), h = 30;
    var x = W / 2 - w / 2;
    c.save();
    A.roundRect(c, x, y, w, h, 8);
    c.fillStyle = "rgba(8,10,30,0.72)";
    c.fill();
    c.fillStyle = sk.primary;
    c.fillRect(x, y + 5, 4, h - 10);
    c.fillStyle = kk.primary;
    c.fillRect(x + w - 4, y + 5, 4, h - 10);
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
    c.fillText(fit(kp.short, half - 4), x + w - 12, y + h / 2 + 0.5);
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
    return { state: state, goals: goals, points: points, misses: misses, level: level, wind: wind, keeper: keeper, keeperIdx: keeperIdx, shooter: shooter.short, plan: plan, outcome: outcome, clock: clock, outcomeT: outcomeT, replay: inReplay(), gl: !!R, dbg: R && R.shooter ? { pos: R.shooter.root.position.toArray(), kids: R.shooter.root.children.length, inScene: !!R.shooter.root.parent, cam: R.camera.position.toArray() } : null };
  }

  A.register({ resize: resize, start: start, update: update, render: render, down: down, move: move, up: up, debug: debug, setRoster: setRoster });
})();
