/*
 * SLALOM 3B — topu sürerek KAPILARDAN geç; karşında ligin gerçek savunmaları.
 *
 * MİMARİ: simülasyon (kurallar, kapılar, savunmacılar, puan) çizimden
 * bağımsızdır; başsız testler yalnız onu koşturur. Çizim three.js (WebGL):
 * sonsuz saha ve kenar panoları oyuncuyla akar; ortak stadyumun
 * (games/stadium3d.js) iki katlı tribün parçaları yol boyunca öne taşınır.
 * Eklemli 3B oyuncu topu sürer, savunmacılar rakip takımın formasıyla
 * durur/kayar. Ortak 3B parçalar games/three-kit.js'te. HUD üstteki saydam 2B tuvalde.
 *
 * GERÇEK İÇERİK (RN'den {type:"config", roster:{runner, defenses}}; bkz.
 * elitlig-server services/penaltyRoster.js buildSlalomRoster):
 *   · KOŞUCU: oyuncunun seçtiği gerçek oyuncu (forma, soyadı, numara). Üç
 *     özelliği küçük ve DENGELİ etki yapar: çeviklik (yana kayış ±%8),
 *     kontrol (MÜKEMMEL penceresi ±%15, direğe sürtünme payı ±%5), hız
 *     (koşu hızı ±%3).
 *   · SAVUNMA MERDİVENİ: her seviyede (8 kapı) ligin bir takımının savunması:
 *     kapı bayrakları o takımın renklerinde, savunmacılar o takımın gerçek
 *     oyuncuları (numara + soyadı). Son basamak ligin en iyi savunması.
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
 * sürükleme, ekranın neresinden başladığın önemsiz). Yanal hareket kritik
 * sönümlü bir yay: hedefe hızla ama savrulmadan oturur, parmak titremesi
 * süzülür; gövde dönüşe yatar.
 *
 * JOKERLER (alttaki üç düğme; her biri turda bir kez başlar, her seviye
 * atlayışında ve yoldaki parlayan joker kutularından yenisi gelir, en çok 3):
 *   · SÜPÜR      2 sn boyunca önün boşalır: kapılar kendiliğinden geçilir,
 *                savunmacılar kenara savrulur, altın toplar mıknatısla gelir.
 *   · HAYALET    5 sn direklerden ve rakiplerden geçersin; kaçan kapı hak
 *                götürmez (puan da getirmez).
 *   · AĞIR ÇEKİM 20 sn koşu hızı %38 düşer.
 *
 * KIL PAYI: bir savunmacının yanından 1,5 m'den yakın geçmek +5.
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
  var T = window.THREE || (typeof THREE !== "undefined" ? THREE : null); // eslint-disable-line no-undef

  /* ─────────────────────────── kadro ─────────────────────────── */
  var DEFAULT_RUNNER = {
    id: 0,
    short: "ElitLig",
    back: "ELİTLİG",
    shirt: 10,
    team: { name: "ElitLig", kit: { primary: "#5B3DF5", secondary: "#FFFFFF" } },
    attrs: { agility: 78, control: 78, pace: 78 },
  };
  var DEFAULT_DEFENSES = [
    ["Kırmızılar", "#DC2626", "#FFFFFF"],
    ["Maviler", "#2563EB", "#FFFFFF"],
    ["Yeşiller", "#16A34A", "#111827"],
    ["Sarı-Lacivert", "#FACC15", "#1E3A8A"],
    ["Siyahlar", "#111827", "#FFFFFF"],
  ].map(function (d, i) {
    return {
      team: { id: -1 - i, name: d[0], kit: { primary: d[1], secondary: d[2] } },
      conceded_per_match: 2 - i * 0.3,
      defenders: [4, 5, 3, 2, 6].map(function (n) {
        return { id: -100 - i * 10 - n, short: "Savunma " + n, back: "SAVUNMA", shirt: n };
      }),
    };
  });
  var runner = DEFAULT_RUNNER;
  var defenses = DEFAULT_DEFENSES;
  var rosterSig = "";

  function setRoster(r) {
    var rn = r && r.runner && r.runner.team ? r.runner : null;
    var ds = r && Array.isArray(r.defenses) ? r.defenses.filter(function (d) { return d && d.team && d.defenders && d.defenders.length; }) : [];
    var sig = (rn ? rn.id : "d") + ":" + ds.map(function (d) { return d.team.id; }).join(",");
    if (sig === rosterSig) return;
    rosterSig = sig;
    runner = rn || DEFAULT_RUNNER;
    defenses = ds.length ? ds : DEFAULT_DEFENSES;
    if (R) {
      buildRunner();
      R.boardText = "";
      R.foeTeam = null;
    }
  }
  function attr(key) {
    var v = runner && runner.attrs ? Number(runner.attrs[key]) : NaN;
    return Number.isFinite(v) ? A.clamp((A.clamp(v, 50, 99) - 77.5) / 17.5, -1, 1) : 0;
  }
  function defenseAt(lvl) {
    return defenses[Math.min(Math.max(0, lvl - 1), defenses.length - 1)];
  }
  function kitOf(person) {
    var k = person && person.team && person.team.kit ? person.team.kit : {};
    return { primary: k.primary || "#5B3DF5", secondary: k.secondary || "#FFFFFF" };
  }

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
  var intro = null; // { def, idx, age } — rakip savunma tanıtımı

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

  /* ─────────────────────────── jokerler ─────────────────────────── */
  var JOKERS = {
    clear: { name: "SÜPÜR", desc: "Önün 2 sn boşalır", dur: 2, color: "#FBBF24" },
    ghost: { name: "HAYALET", desc: "5 sn her şeyin içinden geç", dur: 5, color: "#67E8F9" },
    slow: { name: "AĞIR ÇEKİM", desc: "20 sn yavaşla", dur: 20, color: "#C4B5FD" },
  };
  var JOKER_KEYS = ["clear", "ghost", "slow"];
  var JOKER_MAX = 3;
  var SLOW_K = 0.62;
  var jokers = { clear: 1, ghost: 1, slow: 1 };
  var active = { clear: 0, ghost: 0, slow: 0 };
  var pickups = [];
  var jokerUsed = 0, nearMisses = 0;
  var sweepAt = -9; // SÜPÜR şok dalgasının başladığı an
  var fx = []; // çizime giden tek seferlik efektler (kapı halkası vb.)
  function pushFx(e) {
    e.at = A.time;
    fx.push(e);
    if (fx.length > 24) fx.shift();
  }

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
    return (9 + 12 * (1 - Math.exp(-z / 650))) * (1 + 0.03 * attr("pace"));
  }

  /* ─────────────────────────── kamera ─────────────────────────── */

  function resize(w, h) {
    W = w;
    H = h;
    f = ((W * 0.5) / VIEW_HALF) * CAM_BACK;
    feetY = H * 0.83;
    horizon = Math.max(H * 0.2, feetY - (f * CAM_H) / CAM_BACK);
    if (!orient) {
      orient = A.orientation();
      resetWorld();
    }
    initGL();
    resizeGL();
  }

  /** Dünya → ekran (HUD yazıları için). WebGL yoksa basit iz düşüm. */
  function proj(X, Y, Z) {
    if (R) return screenOf(X, Y, Z);
    var dz = Math.max(0.3, Z - (z - CAM_BACK));
    var s = f / dz;
    return { x: W / 2 + (X - camX) * s, y: horizon + (CAM_H - Y) * s, s: s };
  }

  /* ─────────────────────────── dünya üretimi ─────────────────────────── */

  function resetWorld() {
    z = 0;
    speed = 9;
    player = { x: 0, target: 0, aim: 0, vx: 0, lean: 0, stride: 0, stumble: 0, invuln: 0, fallen: 0 };
    camX = 0;
    gates = [];
    foes = [];
    coins = [];
    pickups = [];
    nextGateZ = 28;
    gateSide = Math.random() < 0.5 ? -1 : 1;
    gateCount = 0;
    passed = 0;
    while (nextGateZ < z + FAR) spawnGate();
  }

  var uid = 0, foeCount = 0;
  function spawnGate() {
    var gap = gateGap();
    var amp = gateAmp(gap);
    // Taraf değiştir; yüksek seviyede ara sıra aynı tarafta kal (sürpriz)
    if (!(gateCount > 16 && Math.random() < 0.2)) gateSide = -gateSide;
    var cx = gateSide * A.rand(0.35, 1) * amp;
    if (gateCount < 2) cx = gateSide * 1.2;
    var lvl = 1 + Math.floor(gateCount / GATES_PER_LEVEL);
    var def = defenseAt(lvl);
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
      id: ++uid,
      kit: def.team.kit,
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

    // Ara sıra iki kapının arasında bir joker kutusu (en az 6 kapıda bir)
    if (prev && gateCount >= 6 && gateCount % 7 === 3) {
      var have = JOKER_KEYS.filter(function (k) {
        return jokers[k] < JOKER_MAX;
      });
      if (have.length) {
        var pt = gateCount % 2 === 0 ? 0.3 : 0.5;
        pickups.push({ z: A.lerp(prev.z, gate.z, pt), x: A.lerp(prev.baseX, gate.baseX, A.smooth(pt)), type: have[(Math.random() * have.length) | 0], taken: false, at: 0, id: ++uid });
      }
    }

    // Seviye 3+: kapı aralarına savunmacı (yolun dışına değil, yolun ÜSTÜNE)
    if (prev && lvl >= 3 && Math.random() < Math.min(0.75, 0.35 + (lvl - 3) * 0.1)) {
      var mz = A.lerp(prev.z, gate.z, A.rand(0.42, 0.58));
      var line = A.lerp(prev.baseX, gate.baseX, 0.5);
      var off = (Math.random() < 0.5 ? -1 : 1) * A.rand(0.6, 1.6);
      var fx = A.clamp(line + off, -FIELD + 0.6, FIELD - 0.6);
      var slide = lvl >= 5 && Math.random() < 0.5;
      var who = def.defenders[foeCount++ % def.defenders.length];
      foes.push({ z: mz, x: fx, baseX: fx, slide: slide, swept: false, judged: false, dir: 1, phase: Math.random() * 6.28, amp: slide ? A.rand(1, 2) : 0, done: false, hit: false, at: 0, id: ++uid, who: who, team: def.team });
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
    jokers = { clear: 1, ghost: 1, slow: 1 };
    active = { clear: 0, ghost: 0, slow: 0 };
    jokerUsed = 0;
    nearMisses = 0;
    sweepAt = -9;
    fx = [];
    A.particles.length = 0;
    A.floaters.length = 0;
    A.banner = null;
    A.sound("whistle");
    A.announce("SLALOM!", "Parmağını kaydır, kapılardan geç");
    intro = { def: defenseAt(1), idx: 1, age: -1.8 };
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
    var nextDef = defenseAt(level);
    // Yeni savunma gelince tek, küçük bir üst kart yeter (ekranın ortası açık kalır).
    if (nextDef !== defenseAt(level - 1)) intro = { def: nextDef, idx: Math.min(level, defenses.length), age: 0, level: level, sub: sub };
    else A.announce("SEVİYE " + level, sub);
    var gift = grantJoker();
    if (gift) A.floatText("JOKER: " + JOKERS[gift].name + " +1", W / 2, H - 120, JOKERS[gift].color, 18);
    A.sound("level");
    A.haptic("success");
  }

  /** Rastgele bir joker hakkı (dolu olmayanlardan). */
  function grantJoker(type) {
    var pool = JOKER_KEYS.filter(function (k) {
      return jokers[k] < JOKER_MAX;
    });
    if (type) pool = pool.indexOf(type) >= 0 ? [type] : [];
    if (!pool.length) return null;
    var k = pool[(Math.random() * pool.length) | 0];
    jokers[k] += 1;
    return k;
  }

  /** Joker kullan: hak varsa ve aynı joker zaten etkin değilse. */
  function useJoker(type) {
    if (state !== "play" || !JOKERS[type] || jokers[type] <= 0 || active[type] > 0) return false;
    jokers[type] -= 1;
    active[type] = JOKERS[type].dur;
    jokerUsed += 1;
    var sp = proj(player.x, 1.4, z);
    A.floatText(JOKERS[type].name + "!", sp.x, sp.y - 70, JOKERS[type].color, 24);
    A.haptic("medium");
    A.sound(type === "slow" ? "level" : "whoosh");
    if (type === "clear") {
      sweepAt = A.time;
      A.shake(5);
      sweep();
    }
    return true;
  }

  /** SÜPÜR: önündeki (kalan süre boyunca koşacağın) yoldaki kapı ve rakipleri temizle. */
  function sweep() {
    var reach = z + Math.max(speed, 9) * active.clear + 7;
    gates.forEach(function (g) {
      if (!g.done && g.z <= reach && !g.cleared) {
        g.cleared = true;
        g.clearAt = A.time;
      }
    });
    foes.forEach(function (fo) {
      if (!fo.done && !fo.hit && !fo.swept && fo.z <= reach) {
        fo.swept = true;
        fo.at = A.time;
        fo.dir = fo.x >= player.x ? 1 : -1;
      }
    });
    coins.forEach(function (co) {
      if (!co.taken && co.z <= reach) co.magnet = true;
    });
  }

  /* ─────────────────────────── güncelleme ─────────────────────────── */

  function update(dt) {
    scoreBump = Math.max(0, scoreBump - dt * 4);
    if (intro) {
      intro.age += dt;
      if (intro.age > 2.2) intro = null;
    }
    flashRed = Math.max(0, flashRed - dt * 2.5);
    JOKER_KEYS.forEach(function (k) {
      if (active[k] > 0) {
        active[k] = Math.max(0, active[k] - dt);
        if (active[k] === 0 && state === "play") A.sound("tap");
      }
    });
    if (active.clear > 0) sweep();
    player.invuln = Math.max(0, player.invuln - dt);
    player.stumble = Math.max(0, player.stumble - dt * 1.6);

    var target = state === "dying" ? 0 : state === "attract" ? 9 : runSpeed() * (active.slow > 0 ? SLOW_K : 1);
    if (state === "dying") {
      speed = A.damp(speed, 0, 2.2, dt);
      dyingT += dt;
      if (dyingT > 1.4 && state !== "over") {
        state = "over";
        A.sound("over");
        A.send("over", { score: points, stats: { gates: passed, level: level, bestCombo: bestCombo, coins: coinCount, jokers: jokerUsed, nearMisses: nearMisses, metres: Math.round(z), defense: Math.min(level, defenses.length), defenses: defenses.length } });
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

    /* Yanal hareket — kritik sönümlü yay: hızlı oturur, savrulmaz */
    // Çeviklik: yayın sertliği ve azami yana kayış ±%8.
    var agi = 1 + 0.08 * attr("agility");
    var maxLat = (6.5 + speed * 0.4) * agi;
    var w0 = 9.5 * agi, aMax = 80 * agi;
    var stopped = state === "dying" || state === "over";
    var steps = Math.max(1, Math.ceil(dt / (1 / 120)));
    var h = dt / steps;
    for (var st = 0; st < steps; st++) {
      player.aim = A.damp(player.aim, player.target, 24, h); // parmak titremesini süz
      var acc = stopped ? -player.vx * 8 : w0 * w0 * (player.aim - player.x) - 2 * 0.95 * w0 * player.vx;
      player.vx = A.clamp(player.vx + A.clamp(acc, -aMax, aMax) * h, -maxLat, maxLat);
      var nx = player.x + player.vx * h;
      if (Math.abs(nx) > FIELD - 0.25) {
        nx = Math.sign(nx) * (FIELD - 0.25);
        player.vx = 0;
      }
      player.x = nx;
    }
    player.lean = A.damp(player.lean, player.vx / maxLat, 8, dt);
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
      var ctrl = attr("control");
      var ghost = active.ghost > 0;
      if (gate.cleared) {
        // SÜPÜR: kapı kendiliğinden geçilir (MÜKEMMEL yok)
        gate.result = "pass";
        passed += 1;
        combo += 1;
        bestCombo = Math.max(bestCombo, combo);
        var cg = 10 * multiplier();
        points += cg;
        scoreBump = 1;
        A.floatText("+" + cg, sp.x, sp.y - 50, JOKERS.clear.color, 20);
        A.sound("gate");
        pushFx({ kind: "ring", x: gate.cx, z: gate.z, color: JOKERS.clear.color });
        if (1 + Math.floor(passed / GATES_PER_LEVEL) > level) {
          level += 1;
          levelUp();
        }
      } else if (ghost && Math.abs(dx) >= half) {
        // HAYALET: kaçan kapı hak götürmez, seri bozulmaz
        gate.result = "ghost";
        A.floatText("HAYALET", sp.x, sp.y - 40, JOKERS.ghost.color, 18);
      } else if (!ghost && nearPole < 0.42 * (1 - 0.05 * ctrl) && player.invuln <= 0) {
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
        var perfect = Math.abs(dx) < half * 0.28 * (1 + 0.15 * ctrl);
        if (perfect) gain += 5;
        points += gain;
        scoreBump = 1;
        A.floatText((perfect ? "MÜKEMMEL +" : "+") + gain, sp.x, sp.y - 50, perfect ? P.gold : "#FFFFFF", perfect ? 22 : 20);
        if (combo % 5 === 0) {
          A.floatText("ÇARPAN ×" + multiplier(), W / 2, H * 0.42, P.gold, 24);
          A.sound("level");
        } else A.sound("gate");
        A.haptic(perfect ? "medium" : "light");
        pushFx({ kind: "ring", x: gate.cx, z: gate.z, color: perfect ? P.gold : "#FFFFFF", big: perfect });
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
      if (foe.swept) continue;
      if (playing && !foe.hit && Math.abs(player.x - foe.x) < 0.78 && player.invuln <= 0 && active.ghost <= 0) {
        foe.hit = true;
        foe.at = A.time;
        foe.done = true;
        var fp = proj(player.x, 1.2, z);
        loseLife("crash", fp.x, fp.y - 40);
      } else if (playing && !foe.judged && foe.z <= z) {
        // Kıl payı: savunmacının yanından yakın ama çarpmadan geçmek
        foe.judged = true;
        var gapX = Math.abs(player.x - foe.x);
        if (gapX < 1.5 && active.ghost <= 0) {
          nearMisses += 1;
          points += 5;
          scoreBump = 0.8;
          var np = proj(foe.x, 1.8, foe.z);
          A.floatText("KIL PAYI +5", np.x, np.y - 30, "#7DD3FC", 18);
          A.sound("whoosh");
          A.haptic("light");
        }
      }
    }

    /* Joker kutuları */
    for (var pI = 0; pI < pickups.length; pI++) {
      var pk = pickups[pI];
      if (pk.taken || pk.z > z + 0.5 || pk.z < z - 0.7) continue;
      if (playing && Math.abs(player.x - pk.x) < 0.85) {
        pk.taken = true;
        pk.at = A.time;
        var got = grantJoker(pk.type);
        var kp = proj(pk.x, 0.8, pk.z);
        if (got) A.floatText(JOKERS[got].name + " +1", kp.x, kp.y - 40, JOKERS[got].color, 20);
        else {
          points += 10;
          A.floatText("+10", kp.x, kp.y - 40, P.gold, 20);
        }
        A.sound("level");
        A.haptic("medium");
        A.burst(kp.x, kp.y, 16, { speed: 200, gravity: 120, life: 0.6, size: 3.5, color: [JOKERS[pk.type].color, "#FFF"], shape: "spark" });
      }
    }

    /* Altın toplar */
    for (var cI = 0; cI < coins.length; cI++) {
      var co = coins[cI];
      if (co.magnet && !co.taken && co.z - z < 9) co.x = A.damp(co.x, player.x, 9, dt);
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

    /* Seri ateşi: çarpan ×3 ve üstünde topun arkasında altın kıvılcım */
    if (playing && multiplier() >= 3 && !A.reduceMotion && Math.random() < 0.6) {
      var bp = proj(player.x, 0.12, z + 0.8);
      A.burst(bp.x, bp.y, 1, { angle: Math.PI / 2, spread: 1.2, speed: 90, gravity: -40, life: 0.45, size: 2.6, color: [P.gold, "#FB923C", "#FFF7D6"], shape: "spark" });
    }

    /* Temizlik ve üretim */
    var cut = z - CAM_BACK + 0.6;
    pickups = pickups.filter(function (o) {
      return o.z > cut;
    });
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

  /** Joker düğmeleri: altta ortada üç daire. */
  function jokerButtons() {
    var r = Math.min(27, W * 0.068), gap = r * 2 + 22;
    var y = H - r - Math.max(22, H * 0.035);
    return JOKER_KEYS.map(function (k, i) {
      return { key: k, x: W / 2 + (i - 1) * gap, y: y, r: r };
    });
  }
  function down(p) {
    if (state === "play") {
      var bs = jokerButtons();
      for (var i = 0; i < bs.length; i++)
        if (Math.hypot(p.x - bs[i].x, p.y - bs[i].y) < bs[i].r + 10) {
          useJoker(bs[i].key);
          lastTouchX = null;
          return;
        }
    }
    lastTouchX = p.x;
  }
  function move(p) {
    if (state !== "play" || lastTouchX == null) return;
    var mpp = (VIEW_HALF * 2) / W; // metre / piksel (oyuncu derinliğinde)
    player.target = A.clamp(player.target + (p.x - lastTouchX) * mpp * 1.2, -FIELD + 0.25, FIELD - 0.25);
    lastTouchX = p.x;
  }
  function up() {
    lastTouchX = null;
  }

  /* ═══════════════════════════ 3B ÇİZİM ═══════════════════════════ */

  var K = A.T3;
  var R = null;
  var glFailed = false;
  var tmpV = null;
  var S3 = A.S3;
  var STRIP = 220; // oyuncuyla akan saha/pano şeridinin boyu (m)
  var SEG = 44, SEGS = 5; // her yanda dönüşümlü kullanılan tribün parçaları
  var STAND_X = FIELD + 3.4; // tribün ön yüzünün taç çizgisine uzaklığı
  var FOE_POOL = 8;

  /** Dünya: x = X, y = Y, z = −Z (ileri −z). */
  function wz(Z) {
    return -Z;
  }

  function screenOf(X, Y, Z) {
    tmpV.set(X, Y, wz(Z));
    var dist = R.camera.position.distanceTo(tmpV);
    tmpV.project(R.camera);
    var s = H / (2 * Math.tan((R.camera.fov * Math.PI) / 360) * Math.max(0.5, dist));
    return { x: (tmpV.x * 0.5 + 0.5) * W, y: (-tmpV.y * 0.5 + 0.5) * H, s: s, behind: tmpV.z > 1 };
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
      renderer.toneMappingExposure = 1.08;
      renderer.outputColorSpace = T.SRGBColorSpace;
      K.init(renderer);
      var scene = new T.Scene();
      scene.background = new T.Color(0x070b1e);
      scene.fog = new T.Fog(0x141c40, 60, 190);
      tmpV = new T.Vector3();
      R = { renderer: renderer, scene: scene, camera: new T.PerspectiveCamera(60, 1, 0.1, 700), gates: new Map(), coins: new Map(), foes: new Map(), pickups: new Map(), rings: [], foePool: [], boardText: "", U: { time: { value: 0 }, excite: { value: 0 } } };
      S3.atmosphere(R);
      buildLights();
      buildWorld();
      buildRunner();
      buildBall();
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
    // Oyuncu derinliğinde ~±4,6 m görünsün (dikey açı en boy oranından).
    R.baseFov = A.clamp((2 * Math.atan(0.44 / aspect) * 180) / Math.PI, 44, 78);
    R.camera.fov = R.baseFov;
    R.camera.updateProjectionMatrix();
  }

  function buildLights() {
    var s = R.scene;
    s.add(new T.HemisphereLight(0x9fb4ff, 0x1d3a22, 0.6));
    var key = new T.DirectionalLight(0xfff4e0, 2.5);
    key.castShadow = true;
    key.shadow.mapSize.set(1536, 1536);
    var sc = key.shadow.camera;
    sc.left = -12;
    sc.right = 12;
    sc.top = 22;
    sc.bottom = -10;
    sc.near = 2;
    sc.far = 80;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.02;
    s.add(key);
    s.add(key.target);
    var fill = new T.DirectionalLight(0xdfe8ff, 0.8);
    fill.position.set(-20, 25, 10);
    s.add(fill);
    var rim = new T.DirectionalLight(0xb9c8ff, 0.9);
    rim.position.set(6, 18, -40);
    s.add(rim);
    R.key = key;
  }

  /** Saha, kenar panoları ve tribünler: oyuncuyla birlikte akan şeritler. */
  function buildWorld() {
    var s = R.scene;
    // Saha dokusu: 11 m'lik bir biçme deseni tekrar eder; dokunun yatay ekseni 60 m.
    var grass = K.canvasTex(512, 256, function (c, cw, ch) {
      var sx = cw / 60;
      c.fillStyle = "#245f37";
      c.fillRect(0, 0, cw, ch);
      // İç saha: iki bant
      var x0 = (30 - FIELD) * sx, x1 = (30 + FIELD) * sx;
      c.fillStyle = "#378f4d";
      c.fillRect(x0, 0, x1 - x0, ch / 2);
      c.fillStyle = "#2f8a47";
      c.fillRect(x0, ch / 2, x1 - x0, ch / 2);
      // Dış saha bantları
      c.fillStyle = "rgba(255,255,255,0.03)";
      c.fillRect(0, 0, x0, ch / 2);
      c.fillRect(x1, 0, cw - x1, ch / 2);
      var rand = A.seeded(5);
      for (var n = 0; n < 9000; n++) {
        c.fillStyle = rand() < 0.5 ? "rgba(255,255,255,0.04)" : "rgba(0,20,0,0.07)";
        c.fillRect(rand() * cw, rand() * ch, 1, 1 + rand() * 2);
      }
      // Taç çizgileri
      c.fillStyle = "rgba(246,248,240,0.95)";
      c.fillRect(x0 - 0.06 * sx, 0, 0.12 * sx, ch);
      c.fillRect(x1 - 0.06 * sx, 0, 0.12 * sx, ch);
    }, true);
    grass.repeat.set(1, STRIP / 11);
    var gN = S3.grassNormal();
    gN.repeat.set(60 / 3, STRIP / 3);
    var ground = K.mesh(new T.PlaneGeometry(60, STRIP), K.std(0xffffff, 0.9, 0, { map: grass, normalMap: gN, normalScale: new T.Vector2(0.55, 0.55), envMapIntensity: 0.35 }), false, true);
    ground.rotation.x = -Math.PI / 2;
    s.add(ground);
    R.ground = ground;
    R.grass = grass;
    R.grassN = gN;

    // Kenar LED panoları
    R.boardTex = K.canvasTex(2048, 64, function () {}, true);
    R.boardTex.repeat.set(STRIP / 40, 1);
    var boardMat = new T.MeshBasicMaterial({ map: R.boardTex, toneMapped: false });
    var dark = K.std(0x111827, 0.6);
    R.boards = [-1, 1].map(function (side) {
      var b = K.mesh(new T.BoxGeometry(0.2, 0.9, STRIP), [side < 0 ? dark : boardMat, side < 0 ? boardMat : dark, dark, dark, dark, dark], true, true);
      b.position.set(side * (FIELD + 2.2), 0.45, 0);
      s.add(b);
      return b;
    });

    // Tribünler: ortak stadyumun iki katlı tribün parçaları, oyuncuyla birlikte
    // ileri taşınır (her parça dünyada yerinde kalır, arkada kalan öne geçer).
    R.stands = [];
    [-1, 1].forEach(function (side) {
      for (var k = 0; k < SEGS; k++) {
        var seg = S3.standSegment(SEG, {
          seed: 41 + k + (side > 0 ? 10 : 0),
          density: 0.88,
          seamless: true,
          side: function () {
            return side < 0 ? 1 : 0;
          },
        });
        seg.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
        seg.position.x = side * STAND_X;
        seg.userData.side = side;
        s.add(seg);
        R.stands.push(seg);
      }
    });
    // Tribün önü: koyu pist (panoların arkası)
    var track = K.mesh(new T.PlaneGeometry(STAND_X - FIELD - 2.2, STRIP), K.std(0x16251e, 0.95), false, true);
    R.tracks = [-1, 1].map(function (side) {
      var t = track.clone();
      t.rotation.x = -Math.PI / 2;
      t.position.set((side * (STAND_X + FIELD + 2.2)) / 2, 0.006, 0);
      s.add(t);
      return t;
    });
    // Uzaktaki projektör kuleleri: ufukta parlayan çiftler
    var glowMat = new T.SpriteMaterial({ map: K.glowTexture(), color: 0xfff1d6, transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: 0.9, fog: false });
    var panelMat = new T.MeshBasicMaterial({ color: new T.Color(5, 4.8, 4.2), toneMapped: false, fog: false });
    R.lamps = [];
    for (var i = 0; i < 4; i++) {
      [-1, 1].forEach(function (side) {
        var lamp = new T.Group();
        var panel = K.mesh(new T.BoxGeometry(0.6, 4, 8), panelMat, false, false);
        lamp.add(panel);
        var glow = new T.Sprite(glowMat);
        glow.scale.set(30, 30, 1);
        glow.position.x = -side * 1.2;
        lamp.add(glow);
        lamp.userData = { side: side, k: i };
        s.add(lamp);
        R.lamps.push(lamp);
      });
    }
    // Ortak kapı/top/coin geometrileri
    R.geo = {
      pole: new T.CylinderGeometry(0.035, 0.045, POLE_H, 10),
      base: new T.CylinderGeometry(0.16, 0.2, 0.05, 14),
      flag: new T.PlaneGeometry(0.42, 0.3),
      coin: new T.CylinderGeometry(0.17, 0.17, 0.04, 24),
      ring: new T.RingGeometry(0.82, 1, 48),
      box: new T.OctahedronGeometry(0.32, 0),
    };
    R.mat = {
      pole: K.std(0xf1f5f9, 0.35, 0.2),
      base: K.std(0x1f2937, 0.6),
      coin: new T.MeshStandardMaterial({ color: 0xffd24a, emissive: 0x8a5a00, emissiveIntensity: 0.6, roughness: 0.22, metalness: 0.9 }),
      glow: new T.SpriteMaterial({ map: K.glowTexture(), color: 0xffd24a, transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: 0.55 }),
      flags: new Map(),
    };
  }

  function flagMat(color) {
    var m = R.mat.flags.get(color);
    if (!m) {
      m = K.std(color, 0.75, 0, { side: T.DoubleSide });
      R.mat.flags.set(color, m);
    }
    return m;
  }

  /** Seyirci formaları: solda koşucunun kulübü, sağda rakip savunma. LED bantta iki renk. */
  var standKey = "";
  function paintStands(def) {
    var mk = kitOf(runner), ok = kitOf(def.defenders[0] || { team: def.team });
    var key = mk.primary + mk.secondary + ok.primary + ok.secondary;
    if (key === standKey) return;
    standKey = key;
    S3.paintCrowd(mk, ok);
    S3.paintLed(mk.primary, ok.primary);
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

  function buildRunner() {
    if (R.runner) {
      R.scene.remove(R.runner.root);
      K.disposeTree(R.runner.root);
    }
    R.runner = K.makeAthlete(runner, { keeper: false });
    ghostOn = false;
    R.scene.add(R.runner.root);
  }

  function buildBall() {
    var geo = new T.SphereGeometry(0.11, 32, 24);
    var PHI = (1 + Math.sqrt(5)) / 2;
    var centres = [[0, 1, PHI], [0, -1, PHI], [0, 1, -PHI], [0, -1, -PHI], [1, PHI, 0], [-1, PHI, 0], [1, -PHI, 0], [-1, -PHI, 0], [PHI, 0, 1], [-PHI, 0, 1], [PHI, 0, -1], [-PHI, 0, -1]].map(function (v) {
      var l = Math.hypot(v[0], v[1], v[2]);
      return [v[0] / l, v[1] / l, v[2] / l];
    });
    var nrm = geo.attributes.normal;
    var colors = new Float32Array(nrm.count * 3);
    for (var i = 0; i < nrm.count; i++) {
      var best = 0;
      for (var k = 0; k < 12; k++) best = Math.max(best, nrm.getX(i) * centres[k][0] + nrm.getY(i) * centres[k][1] + nrm.getZ(i) * centres[k][2]);
      var v = best > 0.925 ? 0.06 : best > 0.905 ? 0.45 : 0.95;
      colors[i * 3] = colors[i * 3 + 1] = v;
      colors[i * 3 + 2] = v * 1.02;
    }
    geo.setAttribute("color", new T.BufferAttribute(colors, 3));
    R.ball = K.mesh(geo, new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.38 }));
    R.scene.add(R.ball);
  }

  /* ─────────────── nesne havuzları ─────────────── */

  function gateMesh(g) {
    var grp = new T.Group();
    var pair = [];
    [-1, 1].forEach(function (s, i) {
      var post = new T.Group();
      var pole = K.mesh(R.geo.pole, R.mat.pole);
      pole.position.y = POLE_H / 2;
      var base = K.mesh(R.geo.base, R.mat.base, false, true);
      base.position.y = 0.025;
      var flag = K.mesh(R.geo.flag, flagMat(i ? g.kit.secondary : g.kit.primary));
      flag.position.set(-s * 0.23, POLE_H - 0.2, 0);
      post.add(pole, base, flag);
      post.userData = { s: s, flag: flag };
      grp.add(post);
      pair.push(post);
    });
    grp.userData = { posts: pair };
    R.scene.add(grp);
    return grp;
  }

  /** Joker kutusu: dönen parlak kristal + üstünde simge + ışıma. */
  var iconTex = {};
  function pickupMesh(pk) {
    var col = JOKERS[pk.type].color;
    if (!iconTex[pk.type])
      iconTex[pk.type] = K.canvasTex(128, 128, function (c) {
        c.beginPath();
        c.arc(64, 64, 58, 0, Math.PI * 2);
        c.fillStyle = "rgba(8,10,30,0.85)";
        c.fill();
        c.lineWidth = 7;
        c.strokeStyle = col;
        c.stroke();
        drawIcon(c, pk.type, 64, 66, 40, col);
      });
    var g = new T.Group();
    var box = K.mesh(R.geo.box, new T.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.55, roughness: 0.15, metalness: 0.3, transparent: true, opacity: 0.85 }));
    g.add(box);
    var icon = new T.Sprite(new T.SpriteMaterial({ map: iconTex[pk.type], depthWrite: false, toneMapped: false }));
    icon.position.y = 0.75;
    icon.scale.set(0.62, 0.62, 1);
    g.add(icon);
    var glow = new T.Sprite(new T.SpriteMaterial({ map: K.glowTexture(), color: col, transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: 0.8 }));
    glow.scale.set(2.4, 2.4, 1);
    g.add(glow);
    g.userData = { box: box };
    R.scene.add(g);
    return g;
  }

  function foeAthlete(fo) {
    var a = K.makeAthlete({ id: fo.who.id, name: fo.who.name, short: fo.who.short, back: fo.who.back, shirt: fo.who.shirt, team: fo.team }, { keeper: false, detail: "lo" });
    R.scene.add(a.root);
    return a;
  }

  function syncPools() {
    var seen = new Set();
    gates.forEach(function (g) {
      seen.add(g.id);
      var m = R.gates.get(g.id);
      if (!m) {
        m = gateMesh(g);
        R.gates.set(g.id, m);
      }
      var half = g.gap / 2;
      m.position.set(0, 0, wz(g.z));
      m.userData.posts.forEach(function (post) {
        var s = post.userData.s;
        post.position.x = g.cx + s * half;
        // Direğe çarpınca direk devrilir, bayrak dalgalanır
        var hit = g.result === "pole" && g.hitPole === s ? A.clamp((A.time - g.at) / 0.25, 0, 1) : 0;
        post.rotation.z = -s * hit * 0.9;
        // SÜPÜR: direkler yere gömülür
        post.position.y = g.cleared ? -POLE_H * A.smooth(A.clamp((A.time - g.clearAt) / 0.35, 0, 1)) : 0;
        post.userData.flag.rotation.y = Math.sin(A.time * 6 + g.z) * 0.25;
      });
    });
    R.gates.forEach(function (m, id) {
      if (seen.has(id)) return;
      R.scene.remove(m);
      R.gates.delete(id);
    });

    var seenC = new Set();
    coins.forEach(function (co, i) {
      var key = co.z + ":" + co.x;
      seenC.add(key);
      var m = R.coins.get(key);
      if (!m) {
        m = K.mesh(R.geo.coin, R.mat.coin);
        R.scene.add(m);
        R.coins.set(key, m);
      }
      var taken = co.taken ? A.clamp((A.time - co.at) / 0.3, 0, 1) : 0;
      m.visible = taken < 1;
      m.position.set(co.x, 0.45 + Math.sin(A.time * 3 + i) * 0.08 + taken * 1.2, wz(co.z));
      m.scale.setScalar(1 - taken * 0.6);
      m.rotation.set(Math.PI / 2, 0, A.time * 3 + i);
    });
    R.coins.forEach(function (m, key) {
      if (seenC.has(key)) return;
      R.scene.remove(m);
      R.coins.delete(key);
    });

    var seenP = new Set();
    pickups.forEach(function (pk) {
      seenP.add(pk.id);
      var g = R.pickups.get(pk.id);
      if (!g) {
        g = pickupMesh(pk);
        R.pickups.set(pk.id, g);
      }
      var taken = pk.taken ? A.clamp((A.time - pk.at) / 0.35, 0, 1) : 0;
      g.visible = taken < 1;
      g.position.set(pk.x, 0.9 + Math.sin(A.time * 2.6 + pk.id) * 0.12 + taken * 1.5, wz(pk.z));
      g.userData.box.rotation.y = A.time * 2.2;
      g.scale.setScalar((1 + Math.sin(A.time * 5) * 0.05) * (1 + taken));
    });
    R.pickups.forEach(function (g, id) {
      if (seenP.has(id)) return;
      R.scene.remove(g);
      R.pickups.delete(id);
    });

    // Kapı halkaları: geçişte yerde genişleyip sönen ışık halkası
    while (fx.length) {
      var e = fx.shift();
      if (e.kind !== "ring") continue;
      var ring = R.rings.find(function (r) {
        return !r.visible;
      });
      if (!ring) {
        if (R.rings.length >= 8) ring = R.rings[0];
        else {
          ring = new T.Mesh(R.geo.ring, new T.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide, toneMapped: false }));
          ring.rotation.x = -Math.PI / 2;
          R.scene.add(ring);
          R.rings.push(ring);
        }
      }
      ring.material.color.set(e.color);
      ring.userData = { at: A.time, big: !!e.big };
      ring.position.set(e.x, 0.03, wz(e.z));
      ring.visible = true;
    }
    R.rings.forEach(function (ring) {
      if (!ring.visible) return;
      var t = (A.time - ring.userData.at) / 0.6;
      if (t >= 1) {
        ring.visible = false;
        return;
      }
      ring.scale.setScalar(0.6 + t * (ring.userData.big ? 2.6 : 1.8));
      ring.material.opacity = (1 - t) * 0.9;
    });

    var seenF = new Set();
    foes.forEach(function (fo) {
      seenF.add(fo.id);
      var a = R.foes.get(fo.id);
      if (!a) {
        a = foeAthlete(fo);
        R.foes.set(fo.id, a);
      }
      poseFoe(a, fo);
    });
    R.foes.forEach(function (a, id) {
      if (seenF.has(id)) return;
      R.scene.remove(a.root);
      K.disposeTree(a.root);
      R.foes.delete(id);
    });
  }

  /* ─────────────── pozlar ─────────────── */

  /** HAYALET: koşucu yarı saydam, camgöbeği ışıyan. */
  var ghostOn = false;
  function setGhost(on) {
    if (on === ghostOn) return;
    ghostOn = on;
    R.runner.root.traverse(function (o) {
      if (!o.material) return;
      (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) {
        m.transparent = on;
        m.opacity = on ? 0.42 : 1;
        m.depthWrite = !on;
        if (m.emissive) m.emissive.set(on ? 0x0e7490 : 0x000000);
        m.needsUpdate = true;
      });
      o.castShadow = !on;
    });
  }

  function posePlayer() {
    var a = R.runner;
    setGhost(active.ghost > 0 && !(active.ghost < 1 && Math.sin(A.time * 30) > 0));
    var J = a.J;
    K.rest(a);
    var root = a.root;
    root.position.set(player.x, 0, wz(z));
    root.rotation.y = Math.PI - player.vx * 0.05; // ileri (−z) bakar
    var fallen = state === "dying" || state === "over" ? A.clamp(dyingT * 2, 0, 1) : 0;
    if (fallen > 0) {
      root.rotation.x = -fallen * 1.35;
      root.position.y = fallen * 0.15;
      J.sha.rotation.x = -2.6 * fallen;
      J.shb.rotation.x = -2.6 * fallen;
      return;
    }
    var amp = A.clamp(speed / 14, 0.35, 1.15);
    K.runCycle(a, player.stride * 1.2, amp);
    // Dönüşte gövde yatar; sendelemede öne düşer (depar klibi zaten öne eğik)
    root.rotation.z = player.lean * 0.35;
    J.spine.rotation.x = 0.04 + player.stumble * 0.6;
    J.head.rotation.x = -0.08;
  }

  function poseFoe(a, fo) {
    var J = a.J;
    K.rest(a);
    a.root.position.set(fo.x, 0, wz(fo.z));
    a.root.rotation.y = 0; // oyuncuya (+z) bakar
    if (fo.hit) {
      var t = A.clamp((A.time - fo.at) / 0.4, 0, 1);
      a.root.rotation.x = t * 1.3;
      a.root.position.y = t * 0.12;
      return;
    }
    if (fo.swept) {
      // SÜPÜR: savunmacı kenara savrulup yere düşer
      var u = A.clamp((A.time - fo.at) / 0.55, 0, 1);
      a.root.position.x = fo.x + fo.dir * A.easeOut(u) * 3.2;
      a.root.position.y = Math.sin(u * Math.PI) * 0.9;
      a.root.rotation.z = -fo.dir * u * 1.45;
      J.sha.rotation.x = -2.4 * u;
      J.shb.rotation.x = -2.4 * u;
      return;
    }
    // Savunma duruşu: dizler kırık, kollar açık; kayarken yan adım
    var slide = fo.slide ? Math.cos(A.time * 1.9 + fo.phase) : 0;
    J.hips.position.y = 0.84;
    J.hpa.rotation.x = -0.35;
    J.hpb.rotation.x = -0.35;
    J.kna.rotation.x = 0.7;
    J.knb.rotation.x = 0.7;
    J.hpa.rotation.z = 0.25 + Math.max(0, slide) * 0.25;
    J.hpb.rotation.z = -0.25 - Math.max(0, -slide) * 0.25;
    J.spine.rotation.x = 0.35;
    J.sha.rotation.z = 0.6;
    J.shb.rotation.z = -0.6;
    J.sha.rotation.x = -0.3;
    J.shb.rotation.x = -0.3;
    J.ela.rotation.x = -0.5;
    J.elb.rotation.x = -0.5;
    J.head.rotation.x = -0.2;
  }

  /* ─────────────── kamera + sahne ─────────────── */

  var cam = null, look = null;
  function sync(dt) {
    var c = R.camera;
    var wantPos = new T.Vector3(camX, 5.4, wz(z - 7.8));
    var wantLook = new T.Vector3(camX * 0.85 + player.x * 0.15, 0.6, wz(z + 13));
    if (A.shakeAmt > 0.2) {
      wantPos.x += (Math.random() - 0.5) * A.shakeAmt * 0.015;
      wantPos.y += (Math.random() - 0.5) * A.shakeAmt * 0.015;
    }
    if (!cam) {
      cam = wantPos.clone();
      look = wantLook.clone();
    } else {
      cam.lerp(wantPos, 1 - Math.exp(-12 * dt));
      look.lerp(wantLook, 1 - Math.exp(-12 * dt));
      cam.z = wantPos.z; // ileri eksende gecikme olmasın
      look.z = wantLook.z;
    }
    c.position.copy(cam);
    c.lookAt(look);
    c.rotateZ(-player.lean * 0.035); // dönüşe hafif yatış
    var fovK = A.clamp((speed - 9) / 12, 0, 1);
    var fov = R.baseFov * (1 + 0.07 * fovK - (active.slow > 0 ? 0.04 : 0));
    if (Math.abs(c.fov - fov) > 0.01) {
      c.fov = A.damp(c.fov, fov, 3, dt);
      c.updateProjectionMatrix();
    }

    // Akan şeritler: dünyada sabit desen için doku kayar
    var mid = z + STRIP * 0.35;
    R.ground.position.set(0, 0, wz(mid));
    R.grass.offset.y = ((mid % 11) / 11) % 1;
    R.boards.forEach(function (b) {
      b.position.z = wz(mid);
    });
    R.boardTex.offset.x = (A.time * 0.04 + mid / 40) % 1;
    R.grassN.offset.y = ((mid % 3) / 3) % 1;
    R.tracks.forEach(function (t) {
      t.position.z = wz(mid);
    });
    // Tribün parçaları: her biri sabit bir dünya yuvasında; geride kalan öne geçer.
    var first = Math.floor((z - 16) / SEG);
    for (var j = 0; j < SEGS; j++) {
      var slot = first + j;
      var idx = ((slot % SEGS) + SEGS) % SEGS;
      [0, SEGS].forEach(function (off) {
        R.stands[off + idx].position.z = wz(slot * SEG + SEG / 2);
      });
    }
    R.lamps.forEach(function (lamp) {
      var u = lamp.userData;
      var spacing = 70;
      var base = Math.floor(z / spacing) * spacing;
      lamp.position.set(u.side * (STAND_X + 34), 44, wz(base + 40 + u.k * spacing));
    });
    R.sky.position.set(0, 0, wz(z));
    R.U.time.value = A.time;
    R.U.excite.value = A.clamp(R.U.excite.value + ((combo >= 5 ? 1 : 0) - R.U.excite.value) * Math.min(1, dt * 2), 0, 1);
    R.key.position.set(player.x + 10, 26, wz(z - 14));
    R.key.target.position.set(player.x, 0, wz(z + 8));

    var def = defenseAt(level);
    paintBoards("ELİTLİG ARENA   •   SLALOM   •   RAKİP: " + String(def.team.name || "").toLocaleUpperCase("tr-TR") + " SAVUNMASI   •   ");
    paintStands(def);

    // Top: oyuncunun önünde, adımla vurulur
    var touch = (Math.sin(player.stride * 1.2) + 1) * 0.5;
    R.ball.position.set(player.x + player.vx * 0.03, 0.11, wz(z + 0.75 + touch * 0.25));
    R.ball.rotation.x -= (speed / 0.11) * dt;
    R.ball.rotation.z += (player.vx / 0.11) * dt * 0.5;
    R.ball.visible = !(state === "dying" || state === "over") || dyingT < 0.3;

    syncPools();
    posePlayer();
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
    drawJokerTint(c);
    if (R) drawFoeLabels(c);
    drawSpeedLines(c);
    drawSweep(c);
    A.drawParticles(c);
    A.drawFloaters(c, dt);
    if (state !== "attract") drawHud(c);
    if (state === "play") drawJokers(c);
    if (intro && intro.age >= 0) drawIntro(c);
    // Duyuru bandı küçük ve üstte: yol ve kapılar açık kalsın.
    var by = Math.max(196, H * 0.25);
    c.save();
    c.translate(W / 2, by);
    c.scale(0.78, 0.78);
    c.translate(-W / 2, -by);
    A.drawBanner(c, W, by, dt);
    c.restore();
    if (flashRed > 0) {
      c.fillStyle = "rgba(251,113,133," + (0.28 * flashRed).toFixed(3) + ")";
      c.fillRect(0, 0, W, H);
    }
  }

  var vignetteLayer = null;
  function drawVignette(c) {
    if (!vignetteLayer || vignetteLayer.w !== W || vignetteLayer.h !== H) {
      vignetteLayer = A.layer(W, H);
      A.paintVignette(vignetteLayer.ctx, W, H, 0.45);
      A.paintTopScrim(vignetteLayer.ctx, W, 140);
    }
    A.blit(vignetteLayer);
  }

  /**
   * Savunmacının adı: sığarsa tam ad soyad, sığmazsa "A. Soyadı", o da
   * sığmazsa sonu "…" ile kısaltılır.
   */
  function foeLabel(c, who, max) {
    var full = String(who.name || who.short || who.back || "").trim();
    if (c.measureText(full).width <= max) return full;
    var parts = full.split(/\s+/);
    var short = who.short || (parts.length > 1 ? parts[0][0] + ". " + parts[parts.length - 1] : full);
    if (c.measureText(short).width <= max) return short;
    var t = short;
    while (t.length > 2 && c.measureText(t + "…").width > max) t = t.slice(0, -1);
    return t + "…";
  }

  /** Yaklaşan savunmacıların başının üstünde numara + ad soyad. */
  function drawFoeLabels(c) {
    c.save();
    c.textAlign = "center";
    c.textBaseline = "middle";
    for (var i = 0; i < foes.length; i++) {
      var fo = foes[i];
      var d = fo.z - z;
      if (d < 1.5 || d > 32 || fo.hit) continue;
      var p = screenOf(fo.x, 2.25, fo.z);
      if (p.behind) continue;
      var a = A.clamp((32 - d) / 8, 0, 1) * A.clamp((d - 1.5) / 2, 0, 1);
      if (fo.swept) a *= A.clamp(1 - (A.time - fo.at) / 0.3, 0, 1);
      if (a <= 0.01) continue;
      c.globalAlpha = a;
      c.font = A.font(11, 800);
      var label = foeLabel(c, fo.who, Math.min(150, W * 0.38));
      var num = fo.who.shirt ? String(fo.who.shirt) : "";
      var tw = c.measureText(label).width;
      var nw = num ? 22 : 0;
      var bw = tw + nw + 14, bx = p.x - bw / 2;
      var kit = kitOf(fo);
      A.roundRect(c, bx, p.y - 11, bw, 22, 7);
      c.fillStyle = "rgba(8,10,30,0.82)";
      c.fill();
      if (num) {
        A.roundRect(c, bx + 3, p.y - 8, 20, 16, 5);
        c.fillStyle = kit.primary;
        c.fill();
        c.font = A.font(10, 900);
        c.fillStyle = A.textOn ? A.textOn(kit.primary) : "#FFFFFF";
        c.fillText(num, bx + 13, p.y + 0.5);
        c.font = A.font(11, 800);
      }
      c.fillStyle = "#FFFFFF";
      c.fillText(label, bx + nw + 7 + tw / 2, p.y + 0.5);
    }
    c.restore();
  }

  function drawSpeedLines(c) {
    if (state !== "play" || A.reduceMotion) return;
    var k = A.clamp((speed - 13) / 8, 0, 1);
    if (k <= 0) return;
    c.save();
    c.strokeStyle = "rgba(255,255,255," + (0.18 * k).toFixed(3) + ")";
    c.lineWidth = 1.5;
    var rand = A.seeded(Math.floor(A.time * 30));
    for (var i = 0; i < 14; i++) {
      var side = rand() < 0.5 ? -1 : 1;
      var x = W / 2 + side * (W * 0.32 + rand() * W * 0.2);
      var y = H * (0.3 + rand() * 0.6);
      var len = 30 + rand() * 60 * k;
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + side * len * 0.3, y + len);
      c.stroke();
    }
    c.restore();
  }

  /** Rakip savunma tanıtımı: skor bandının hemen altında küçük, ince kart (oyun durmaz). */
  function drawIntro(c) {
    var d = intro.def;
    var t = intro.age;
    var inT = A.easeOut(A.clamp(t / 0.3, 0, 1));
    var out = A.clamp((2.6 - t) / 0.35, 0, 1);
    if (out <= 0) return;
    var kit = d.team.kit || { primary: "#5B3DF5" };
    var cw = Math.min(W - 64, 264), ch = 40;
    var x = W / 2 - cw / 2, y = 14 + 116 + 36 - (1 - inT) * 14;
    c.save();
    c.globalAlpha = out * inT;
    A.roundRect(c, x, y, cw, ch, 10);
    c.fillStyle = "rgba(8,10,30,0.72)";
    c.fill();
    c.fillStyle = kit.primary;
    c.fillRect(x, y + 8, 4, ch - 16);
    c.textBaseline = "middle";
    c.textAlign = "left";
    c.font = A.font(9, 900);
    c.fillStyle = P.gold;
    var head = (intro.level ? "SEVİYE " + intro.level + " · " : "") + "RAKİP " + intro.idx + "/" + defenses.length + (intro.idx >= defenses.length ? " · FİNAL" : "");
    c.fillText(head, x + 14, y + 12);
    c.font = A.font(14, 900);
    c.fillStyle = "#FFFFFF";
    var name = String(d.team.name || "Rakip");
    var max = cw - 28 - 70;
    while (name.length > 3 && c.measureText(name).width > max) name = name.slice(0, -2) + "…";
    c.fillText(name, x + 14, y + 27);
    c.textAlign = "right";
    c.font = A.font(10, 700);
    c.fillStyle = "rgba(255,255,255,0.7)";
    c.fillText(Number(d.conceded_per_match || 0).toFixed(1).replace(".", ",") + " gol/maç", x + cw - 12, y + 27);
    c.restore();
  }

  /* ─────────────── jokerler (HUD) ─────────────── */

  /** Joker simgeleri: SÜPÜR çift ok, HAYALET hayalet, AĞIR ÇEKİM kum saati. */
  function drawIcon(c, type, x, y, r, col) {
    c.save();
    c.lineCap = "round";
    c.lineJoin = "round";
    c.strokeStyle = col;
    c.fillStyle = col;
    if (type === "clear") {
      c.lineWidth = r * 0.2;
      for (var i = 0; i < 2; i++) {
        var y0 = y + r * 0.32 - i * r * 0.5;
        c.beginPath();
        c.moveTo(x - r * 0.5, y0 + r * 0.22);
        c.lineTo(x, y0 - r * 0.22);
        c.lineTo(x + r * 0.5, y0 + r * 0.22);
        c.stroke();
      }
      c.lineWidth = r * 0.1;
      c.beginPath();
      c.moveTo(x - r * 0.75, y + r * 0.62);
      c.lineTo(x + r * 0.75, y + r * 0.62);
      c.stroke();
    } else if (type === "ghost") {
      var w = r * 0.58;
      c.beginPath();
      c.moveTo(x - w, y + r * 0.62);
      c.lineTo(x - w, y - r * 0.08);
      c.arc(x, y - r * 0.08, w, Math.PI, 0);
      c.lineTo(x + w, y + r * 0.62);
      for (var k = 0; k < 3; k++) {
        var x1 = x + w - (k + 0.5) * ((2 * w) / 3), x2 = x + w - (k + 1) * ((2 * w) / 3);
        c.quadraticCurveTo(x1, y + r * (k % 2 ? 0.75 : 0.35), x2, y + r * 0.62);
      }
      c.closePath();
      c.fill();
      c.fillStyle = "#0B1030";
      c.beginPath();
      c.arc(x - w * 0.38, y - r * 0.1, r * 0.11, 0, Math.PI * 2);
      c.arc(x + w * 0.38, y - r * 0.1, r * 0.11, 0, Math.PI * 2);
      c.fill();
    } else {
      var hw = r * 0.45, hh = r * 0.62;
      c.lineWidth = r * 0.12;
      c.beginPath();
      c.moveTo(x - hw - r * 0.1, y - hh);
      c.lineTo(x + hw + r * 0.1, y - hh);
      c.moveTo(x - hw - r * 0.1, y + hh);
      c.lineTo(x + hw + r * 0.1, y + hh);
      c.stroke();
      c.lineWidth = r * 0.09;
      c.beginPath();
      c.moveTo(x - hw, y - hh);
      c.lineTo(x + hw, y - hh);
      c.lineTo(x + r * 0.06, y);
      c.lineTo(x + hw, y + hh);
      c.lineTo(x - hw, y + hh);
      c.lineTo(x - r * 0.06, y);
      c.closePath();
      c.stroke();
      c.beginPath();
      c.moveTo(x - hw * 0.7, y + hh - r * 0.04);
      c.lineTo(x + hw * 0.7, y + hh - r * 0.04);
      c.lineTo(x, y + hh * 0.35);
      c.closePath();
      c.fill();
    }
    c.restore();
  }

  function drawJokers(c) {
    var bs = jokerButtons();
    c.save();
    c.textAlign = "center";
    c.textBaseline = "middle";
    bs.forEach(function (b) {
      var J = JOKERS[b.key], n = jokers[b.key], on = active[b.key] > 0;
      var usable = n > 0 && !on;
      c.globalAlpha = usable || on ? 1 : 0.4;
      if (on) {
        c.save();
        c.shadowColor = J.color;
        c.shadowBlur = 18 + Math.sin(A.time * 10) * 4;
        c.beginPath();
        c.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        c.fillStyle = "rgba(8,10,30,0.85)";
        c.fill();
        c.restore();
      } else {
        c.beginPath();
        c.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        c.fillStyle = "rgba(8,10,30,0.72)";
        c.fill();
      }
      c.lineWidth = 2.5;
      c.strokeStyle = on ? "rgba(255,255,255,0.18)" : J.color;
      c.beginPath();
      c.arc(b.x, b.y, b.r - 1.5, 0, Math.PI * 2);
      c.stroke();
      if (on) {
        // kalan süre halkası
        c.lineWidth = 4;
        c.strokeStyle = J.color;
        c.beginPath();
        c.arc(b.x, b.y, b.r - 1.5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (active[b.key] / J.dur));
        c.stroke();
      }
      drawIcon(c, b.key, b.x, b.y, b.r * 0.62, on ? "#FFFFFF" : J.color);
      if (on) {
        c.font = A.font(10, 900);
        c.fillStyle = "#FFFFFF";
        c.fillText(Math.ceil(active[b.key]) + " sn", b.x, b.y + b.r + 11);
      } else {
        c.font = A.font(9, 900);
        c.fillStyle = "rgba(255,255,255,0.85)";
        c.fillText(J.name, b.x, b.y + b.r + 11);
      }
      // hak sayısı
      if (!on) {
        var bx = b.x + b.r * 0.72, byy = b.y - b.r * 0.72;
        c.beginPath();
        c.arc(bx, byy, 9, 0, Math.PI * 2);
        c.fillStyle = n > 0 ? J.color : "#334155";
        c.fill();
        c.font = A.font(11, 900);
        c.fillStyle = "#0B1030";
        c.fillText(String(n), bx, byy + 0.5);
      }
    });
    c.restore();
  }

  /** Etkin jokerin ekran kenarı tonu: HAYALET camgöbeği, AĞIR ÇEKİM mor. */
  var tintLayers = {};
  function drawJokerTint(c) {
    ["ghost", "slow"].forEach(function (k) {
      var left = active[k];
      if (!(left > 0)) return;
      var L = tintLayers[k];
      if (!L || L.w !== W || L.h !== H) {
        L = tintLayers[k] = A.layer(W, H);
        var g = L.ctx.createRadialGradient(W / 2, H * 0.55, Math.min(W, H) * 0.35, W / 2, H * 0.55, Math.max(W, H) * 0.75);
        g.addColorStop(0, "rgba(0,0,0,0)");
        g.addColorStop(1, k === "ghost" ? "rgba(34,211,238,0.42)" : "rgba(139,92,246,0.42)");
        L.ctx.fillStyle = g;
        L.ctx.fillRect(0, 0, W, H);
      }
      var fade = A.clamp(left / 0.6, 0, 1) * A.clamp((JOKERS[k].dur - left) / 0.3, 0, 1);
      c.save();
      c.globalAlpha = fade * (0.8 + 0.2 * Math.sin(A.time * 4));
      A.blit(L);
      c.restore();
    });
  }

  /** SÜPÜR şok dalgası: oyuncunun ayağından ileri genişleyen altın halka. */
  function drawSweep(c) {
    var t = (A.time - sweepAt) / 0.7;
    if (t < 0 || t > 1) return;
    var p = proj(player.x, 0, z + 1);
    c.save();
    c.globalAlpha = 1 - t;
    c.strokeStyle = JOKERS.clear.color;
    c.lineWidth = 6 * (1 - t) + 1;
    c.beginPath();
    c.ellipse(p.x, p.y, 30 + t * W * 0.9, 10 + t * H * 0.18, 0, 0, Math.PI * 2);
    c.stroke();
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
    drawMatchup(c, top + 116);
  }

  /** Yayın bandı: koşucu (sol) — rakip savunma (sağ) + merdiven. */
  function drawMatchup(c, y) {
    var def = defenseAt(level);
    var sk = kitOf(runner), dk = def.team.kit || { primary: "#5B3DF5" };
    var w = Math.min(W - 32, 360), h = 28;
    var x = W / 2 - w / 2;
    c.save();
    A.roundRect(c, x, y, w, h, 8);
    c.fillStyle = "rgba(8,10,30,0.7)";
    c.fill();
    c.fillStyle = sk.primary;
    c.fillRect(x, y + 5, 4, h - 10);
    c.fillStyle = dk.primary;
    c.fillRect(x + w - 4, y + 5, 4, h - 10);
    c.textBaseline = "middle";
    c.font = A.font(12, 800);
    c.fillStyle = "#FFFFFF";
    var half = w / 2 - 18;
    function fit(text, max) {
      var t = text;
      while (c.measureText(t).width > max && t.length > 3) t = t.slice(0, -1);
      return t === text ? t : t + "…";
    }
    c.textAlign = "left";
    c.fillText(fit((runner.shirt ? runner.shirt + " " : "") + runner.short, half), x + 12, y + h / 2 + 0.5);
    c.textAlign = "right";
    c.fillText(fit(String(def.team.name || "Rakip"), half), x + w - 12, y + h / 2 + 0.5);
    c.textAlign = "center";
    c.fillStyle = "rgba(255,255,255,0.5)";
    c.font = A.font(11, 900);
    c.fillText("vs", W / 2, y + h / 2 + 0.5);
    var n = defenses.length;
    var cur = Math.min(level, n) - 1;
    if (n > 1) {
      var dotW = Math.min(8, (half - 10) / n);
      for (var i = 0; i < n; i++) {
        c.fillStyle = i < cur ? "rgba(255,255,255,0.35)" : i === cur ? P.gold : "rgba(255,255,255,0.15)";
        c.fillRect(x + w - 12 - (n - i) * dotW, y + h + 3, dotW - 2, 3);
      }
    }
    c.restore();
  }

  function debug() {
    return {
      state: state, z: z, speed: speed, passed: passed, points: points, lives: lives, level: level, player: player,
      gates: gates.slice(0, 4), foes: foes.length, foeList: foes, pickups: pickups.length, runner: runner.short, defense: defenseAt(level).team.name, gl: !!R,
      jokers: Object.assign({}, jokers), active: Object.assign({}, active), useJoker: useJoker, buttons: jokerButtons(), foeLabel: foeLabel,
    };
  }

  A.register({ resize: resize, start: start, update: update, render: render, down: down, move: move, up: up, debug: debug, setRoster: setRoster });
})();
