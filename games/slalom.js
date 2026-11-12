/*
 * SLALOM KOŞUSU 3B — üç şeritli sonsuz koşu: topu sürerek stadyum bulvarında
 * ilerle, şerit değiştir, ZIPLA, KAY. Karşında ligin gerçek savunmaları.
 *
 * MİMARİ: simülasyon (şeritler, engeller, çarpışma, puan) çizimden
 * bağımsızdır; başsız testler yalnız onu koşturur. Çizim arcade motorunda
 * (games/arcade3d.js): KIVRIK DÜNYA (ufuk aşağı ve yana bükülür; engeller
 * ufuktan doğar), gündüz → gün batımı → gece tema geçişleri, GPU parçacıkları.
 * Koşucu ve savunmacılar iskeletli gerçek futbolcu modelidir (three-kit.js):
 * formada ad, soyad, numara.
 *
 * GERÇEK İÇERİK (RN'den {type:"config", roster:{runner, defenses}}; bkz.
 * elitlig-server services/penaltyRoster.js buildSlalomRoster):
 *   · KOŞUCU: seçilen gerçek oyuncu. Çeviklik şerit değiştirmeyi ±%8, hız
 *     koşuyu ±%3 etkiler; kontrol sendelemeden toparlanmayı ±%15 kısaltır.
 *   · SAVUNMA MERDİVENİ: her seviyede (14 engel sırası) ligin bir takımı:
 *     savunmacılar o takımın gerçek oyuncuları, takım otobüsü o takımın
 *     renklerinde ve adıyla. Son basamak ligin en iyi savunması.
 *
 * KONTROL (kaydırma): sola/sağa şerit değiştir · yukarı ZIPLA · aşağı KAY.
 * Havadayken aşağı kaydırmak hızla yere indirir ve kaymaya geçirir.
 *
 * ENGELLER:
 *   · ANTRENMAN ENGELİ (alçak)  → üstünden zıpla ya da şerit değiştir.
 *   · PANKART (yüksek)          → altından kay ya da şerit değiştir.
 *   · TAKIM OTOBÜSÜ             → yalnız şerit değiştirerek geçilir. Yanına
 *                                 sürtünürsen şeride geri itilirsin (hak gitmez).
 *   · KAYAN SAVUNMACI (sv. 2+)  → yaklaşınca kayarak müdahale eder: zıpla.
 *   · DUVAR SAVUNMACI (sv. 2+)  → kolları açık durur: şerit değiştir.
 * Çarpışma bir hak götürür (3 hak), seriyi sıfırlar, hızı düşürür.
 *
 * GÜÇLER (yoldaki parlayan kutular, alınınca kendiliğinden başlar):
 *   MIKNATIS 8 sn altınları çeker · KALKAN bir çarpışmayı affeder (20 sn) ·
 *   ×2 PUAN 10 sn · TURBO 4 sn dokunulmaz, engelleri devirir.
 *
 * PUAN: her 10 m 1 × çarpan; temiz geçilen her sıra 3 × çarpan; altın +1.
 * Arka arkaya her 8 temiz sıra çarpanı bir artırır (en çok ×5).
 *
 * GİDEREK ZORLAŞIR: hız 11 → 23 m/sn; sıralar sıklaşır, dolu şerit artar;
 * 2. seviyeden sonra savunmacılar sahaya girer.
 */
(function () {
  "use strict";
  var A = window.Arena;
  var P = A.PAL;
  var T = window.THREE || (typeof THREE !== "undefined" ? THREE : null); // eslint-disable-line no-undef
  var G3 = A.G3;
  var K = A.T3;
  var S3 = A.S3;

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
      R.teamKey = "";
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

  /* ─────────────────────────── kurallar ─────────────────────────── */
  var LANE = 2.3; // şerit aralığı (m)
  var LIVES = 3;
  var ROWS_PER_LEVEL = 14;
  var GRAV = 34, JUMP_V = 10.8, SLIDE_T = 0.62;
  var FAR = 170; // üretim ufku
  var DEPTH = { hurdle: 0.5, bar: 0.5, bus: 9, tackler: 1.1, wall: 0.7 };
  var POWERS = {
    magnet: { name: "MIKNATIS", dur: 8, color: "#F43F5E" },
    shield: { name: "KALKAN", dur: 20, color: "#38BDF8" },
    x2: { name: "×2 PUAN", dur: 10, color: "#FACC15" },
    turbo: { name: "TURBO", dur: 4, color: "#FB923C" },
  };
  var POWER_KEYS = ["magnet", "shield", "x2", "turbo"];
  var THEME_ORDER = ["day", "sunset", "night"];

  var W = 0, H = 0;
  var state = "attract"; // attract | play | dying | over
  var z = 0, speed = 11;
  var player = null;
  var rows = [], obstacles = [], coins = [], pickups = [];
  var nextRowZ = 0, rowCount = 0, pathLane = 0, foeCount = 0;
  var passed = 0, points = 0, combo = 0, bestCombo = 0, lives = LIVES, level = 1, coinCount = 0, powerUsed = 0;
  var distAcc = 0;
  var active = { magnet: 0, shield: 0, x2: 0, turbo: 0 };
  var scoreBump = 0, flashRed = 0, dyingT = 0, coinBump = 0;
  var intro = null;
  var uid = 0;
  var fx = []; // çizime giden tek seferlik efektler
  var touch = null;

  function laneX(l) {
    return l * LANE;
  }
  function runSpeed() {
    return (11 + 12 * (1 - Math.exp(-z / 900))) * (1 + 0.03 * attr("pace"));
  }
  function multiplier() {
    return Math.min(5, 1 + Math.floor(combo / 8)) * (active.x2 > 0 ? 2 : 1);
  }
  function pushFx(e) {
    e.at = A.time;
    fx.push(e);
    if (fx.length > 30) fx.shift();
  }

  /* ─────────────────────────── dünya üretimi ─────────────────────────── */

  function resetWorld() {
    z = 0;
    speed = 11;
    player = { lane: 0, x: 0, y: 0, vy: 0, slide: 0, stumble: 0, invuln: 0, stride: 0, lean: 0, bump: 0, wantJump: 0, wantSlide: false, airT: 0 };
    rows = [];
    obstacles = [];
    coins = [];
    pickups = [];
    nextRowZ = 34;
    rowCount = 0;
    pathLane = 0;
    foeCount = 0;
    passed = 0;
    while (nextRowZ < z + FAR) spawnRow();
  }

  /**
   * Bir engel sırası. Her sırada geçilebilir bir YOL şeridi vardır (boş,
   * zıplanır ya da kayılır); yol bir sıradan ötekine en çok bir şerit kayar.
   * Diğer şeritler seviyeye göre dolar.
   */
  function spawnRow() {
    var lvl = 1 + Math.floor(rowCount / ROWS_PER_LEVEL);
    var def = defenseAt(lvl);
    if (rowCount > 0 && Math.random() < 0.62) pathLane = A.clamp(pathLane + (Math.random() < 0.5 ? -1 : 1), -1, 1);
    var cells = [null, null, null];
    var soft = ["hurdle", "bar"];
    if (lvl >= 2) soft.push("tackler");
    // yol şeridi: ilk sıralar boş, sonra çoğunlukla zıpla/kay
    var pathType = null;
    if (rowCount >= 2 && Math.random() < Math.min(0.72, 0.3 + lvl * 0.09)) pathType = A.pick(soft);
    cells[pathLane + 1] = pathType;
    var block = Math.min(0.8, 0.32 + 0.085 * lvl);
    for (var l = -1; l <= 1; l++) {
      if (l === pathLane) continue;
      if (rowCount < 1 || Math.random() > block) continue;
      var r = Math.random();
      cells[l + 1] = r < 0.42 ? "bus" : lvl >= 2 && r < 0.6 ? "wall" : A.pick(soft);
    }
    // en az bir engel olsun (ilk sıra hariç)
    if (rowCount >= 1 && !cells[0] && !cells[1] && !cells[2]) cells[pathLane + 1] = A.pick(soft);
    var row = { z: nextRowZ, cells: cells, path: pathLane, scored: false, hit: false, id: ++uid, level: lvl };
    rows.push(row);
    for (var i = 0; i < 3; i++) {
      var type = cells[i];
      if (!type) continue;
      var o = { id: ++uid, type: type, lane: i - 1, z: nextRowZ + (type === "bus" ? 4.5 : 0), depth: DEPTH[type], row: row, hit: false, smashed: false, at: 0, kit: def.team.kit, team: def.team };
      if (type === "tackler" || type === "wall") o.who = def.defenders[foeCount++ % def.defenders.length];
      obstacles.push(o);
    }

    // Önceki sıradan buna: yol şeridinde altın dizisi (zıplanacaksa yay çizer)
    var prev = rows[rows.length - 2];
    var from = prev ? prev.z : z;
    var span = nextRowZ - from;
    var wantPickup = rowCount >= 5 && rowCount % 10 === 5;
    if (wantPickup) {
      pickups.push({ id: ++uid, type: POWER_KEYS[(Math.random() * POWER_KEYS.length) | 0], lane: pathLane, z: from + span * 0.55, taken: false, at: 0 });
    } else if (rowCount % 3 !== 2) {
      var n = 5;
      for (var c = 0; c < n; c++) {
        var cz = nextRowZ - 6.4 + c * 1.6 + (pathType ? 3.2 : 0);
        if (cz <= from + 2) continue;
        var arc = pathType === "hurdle" || pathType === "tackler" ? Math.sin(((c + 0.5) / n) * Math.PI) * 1.55 : 0;
        coins.push({ id: ++uid, lane: pathLane, x: laneX(pathLane), y: 0.7 + arc, z: cz, taken: false, at: 0 });
      }
    }
    rowCount += 1;
    var v = 11 + 12 * (1 - Math.exp(-nextRowZ / 900));
    var T2 = Math.max(0.72, 1.08 - 0.04 * (lvl - 1));
    nextRowZ += A.clamp(v * T2, 12.5, 26) * A.rand(0.94, 1.06);
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
    powerUsed = 0;
    distAcc = 0;
    active = { magnet: 0, shield: 0, x2: 0, turbo: 0 };
    fx = [];
    A.particles.length = 0;
    A.floaters.length = 0;
    A.banner = null;
    A.sound("whistle");
    A.announce("SLALOM!", "Kaydır: şerit değiştir, zıpla, kay");
    intro = { def: defenseAt(1), idx: 1, age: -1.8 };
    if (R) G3.setTheme(R, THEME_ORDER[0]);
  }

  function loseLife(o) {
    combo = 0;
    lives -= 1;
    flashRed = 1;
    player.stumble = 1;
    player.invuln = 1.5 * (1 - 0.15 * attr("control"));
    speed *= 0.6;
    A.haptic("error");
    A.shake(10);
    A.sound("crash");
    floatAt("ÇARPTIN!", player.x, 2.2, z, P.bad, 24);
    pushFx({ kind: "crash", x: player.x, z: z });
    if (o && o.row) o.row.hit = true;
    if (lives <= 0) {
      state = "dying";
      dyingT = 0;
    }
  }

  function smash(o, gain) {
    o.smashed = true;
    o.at = A.time;
    o.dir = o.lane === 0 ? (Math.random() < 0.5 ? -1 : 1) : o.lane;
    if (gain) {
      points += gain;
      scoreBump = 0.8;
    }
    A.sound("thud");
    A.haptic("medium");
    A.shake(5);
    pushFx({ kind: "smash", x: laneX(o.lane), z: o.z });
  }

  function levelUp() {
    var sub = "Hız artıyor, sıralar sıklaşıyor";
    if (level === 2) sub = "Savunmacılar sahada: zıpla ya da kaç";
    var nextDef = defenseAt(level);
    if (nextDef !== defenseAt(level - 1)) intro = { def: nextDef, idx: Math.min(level, defenses.length), age: 0, level: level, sub: sub };
    else A.announce("SEVİYE " + level, sub);
    A.sound("level");
    A.haptic("success");
    if (R) G3.setTheme(R, THEME_ORDER[(level - 1) % THEME_ORDER.length]);
  }

  function grant(type) {
    active[type] = POWERS[type].dur;
    powerUsed += 1;
    A.sound("power");
    A.haptic("medium");
    floatAt(POWERS[type].name + "!", player.x, 2.6, z, POWERS[type].color, 24);
    pushFx({ kind: "power", x: player.x, z: z, color: POWERS[type].color });
  }

  /* ─────────────────────────── hareket ─────────────────────────── */

  function grounded() {
    return player.y <= 0.001;
  }
  /** Şerit değiştir: yanında otobüs/duvar varsa sürtünür, şeride geri itilir. */
  function shift(dir) {
    if (state !== "play" && state !== "attract") return false;
    var to = A.clamp(player.lane + dir, -1, 1);
    if (to === player.lane) {
      player.bump = dir * 0.6;
      return false;
    }
    if (active.turbo <= 0)
      for (var i = 0; i < obstacles.length; i++) {
        var o = obstacles[i];
        if (o.smashed || o.lane !== to || (o.type !== "bus" && o.type !== "wall")) continue;
        if (Math.abs(o.z - z) < o.depth / 2 + 0.7) {
          player.bump = dir;
          if (A.time - (player.bumpAt || -9) < 0.5) return false;
          player.bumpAt = A.time;
          speed *= 0.9;
          if (state === "play") {
            A.sound("thud");
            A.haptic("warning");
            A.shake(4);
          }
          return false;
        }
      }
    player.lane = to;
    if (state === "play") A.sound("swish");
    return true;
  }
  function jump() {
    if (state !== "play" && state !== "attract") return;
    if (grounded() || player.airT < 0.09) {
      player.vy = JUMP_V;
      player.y = Math.max(player.y, 0.01);
      player.slide = 0;
      player.wantJump = 0;
      player.wantSlide = false;
      player.airT = 1;
      if (state === "play") A.sound("jump");
      pushFx({ kind: "hop", x: player.x, z: z });
    } else player.wantJump = 0.14;
  }
  function slide() {
    if (state !== "play" && state !== "attract") return;
    if (!grounded()) {
      player.vy = Math.min(player.vy, -20);
      player.wantSlide = true;
      return;
    }
    player.slide = SLIDE_T;
    if (state === "play") A.sound("slide");
  }

  /* ─────────────────────────── güncelleme ─────────────────────────── */

  function update(dt) {
    scoreBump = Math.max(0, scoreBump - dt * 4);
    coinBump = Math.max(0, coinBump - dt * 5);
    flashRed = Math.max(0, flashRed - dt * 2.5);
    if (intro) {
      intro.age += dt;
      if (intro.age > 2.6) intro = null;
    }
    POWER_KEYS.forEach(function (k) {
      if (active[k] > 0) {
        active[k] = Math.max(0, active[k] - dt);
        if (active[k] === 0 && state === "play") A.sound("tap");
      }
    });
    player.invuln = Math.max(0, player.invuln - dt);
    player.stumble = Math.max(0, player.stumble - dt * 1.5);
    player.bump = A.damp(player.bump, 0, 9, dt);
    var playing = state === "play";

    /* Hız */
    var target = state === "dying" || state === "over" ? 0 : state === "attract" ? 12 : runSpeed() * (active.turbo > 0 ? 1.45 : 1);
    if (state === "dying") {
      speed = A.damp(speed, 0, 2.4, dt);
      dyingT += dt;
      if (dyingT > 1.4) {
        state = "over";
        A.sound("over");
        A.send("over", {
          score: points,
          stats: { metres: Math.round(z), coins: coinCount, level: level, rows: passed, bestCombo: bestCombo, powers: powerUsed, defense: Math.min(level, defenses.length), defenses: defenses.length },
        });
      }
    } else speed = A.approach(speed, target, (speed < target ? 4.5 : 9) * dt);
    if (state === "over") speed = 0;
    var dz = speed * dt;
    z += dz;

    /* Vitrin: yapay oyuncu yolu izler */
    if (state === "attract") autopilot();

    /* Yanal: şerit merkezine üstel yaklaşma (savrulmaz) */
    var agi = 1 + 0.08 * attr("agility");
    var tx = laneX(player.lane) + player.bump * 0.5;
    var px = player.x;
    player.x = A.damp(player.x, tx, 17 * agi, dt);
    var vx = dt > 0 ? (player.x - px) / dt : 0;
    player.lean = A.damp(player.lean, A.clamp(vx / 14, -1, 1), 12, dt);

    /* Dikey: zıplama + kayma */
    if (!grounded() || player.vy > 0) {
      player.vy -= GRAV * dt;
      player.y += player.vy * dt;
      player.airT = Math.max(player.airT, 0.1);
      if (player.y <= 0) {
        player.y = 0;
        player.vy = 0;
        player.airT = 0;
        pushFx({ kind: "land", x: player.x, z: z });
        if (player.wantSlide) {
          player.wantSlide = false;
          player.slide = SLIDE_T;
          if (playing) A.sound("slide");
        } else if (player.wantJump > 0) jump();
      }
    } else player.airT = 0;
    player.wantJump = Math.max(0, player.wantJump - dt);
    if (player.slide > 0) player.slide = Math.max(0, player.slide - dt);
    player.stride += dt * (5 + speed * 0.55);

    /* Mesafe puanı */
    if (playing) {
      distAcc += dz;
      while (distAcc >= 10) {
        distAcc -= 10;
        points += multiplier();
      }
    }

    /* Savunmacılar: yaklaşınca kayarak gelir */
    for (var q = 0; q < obstacles.length; q++) {
      var ob = obstacles[q];
      if (ob.type === "tackler" && !ob.smashed && ob.z - z < 12 && ob.z - z > -1) {
        if (!ob.tackleAt) ob.tackleAt = A.time;
        ob.z -= 3.2 * dt;
      }
    }

    /* Çarpışma */
    if (playing || state === "attract")
      for (var i = 0; i < obstacles.length; i++) {
        var o = obstacles[i];
        if (o.hit || o.smashed) continue;
        if (Math.abs(o.z - z) > o.depth / 2 + 0.35) continue;
        if (Math.abs(player.x - laneX(o.lane)) > 0.95) continue;
        var safe = false;
        if (o.type === "hurdle") safe = player.y > 0.7;
        else if (o.type === "tackler") safe = player.y > 0.5;
        else if (o.type === "bar") safe = player.slide > 0 && player.y < 0.3;
        if (safe) {
          o.cleared = true;
          continue;
        }
        if (state === "attract") {
          o.hit = true;
          continue;
        }
        if (active.turbo > 0) smash(o, 3);
        else if (player.invuln > 0) continue;
        else if (active.shield > 0) {
          active.shield = 0;
          player.invuln = 0.9;
          smash(o, 0);
          o.row.hit = true;
          floatAt("KALKAN!", player.x, 2.4, z, POWERS.shield.color, 22);
        } else {
          o.hit = true;
          o.at = A.time;
          loseLife(o);
        }
        if (state !== "play") break;
      }

    /* Sıra geçişi: temiz geçilen sıra puan + seri */
    for (var k = 0; k < rows.length; k++) {
      var row = rows[k];
      if (row.scored || row.z + 1.2 > z) continue;
      row.scored = true;
      if (!playing) continue;
      passed += 1;
      if (!row.hit) {
        combo += 1;
        bestCombo = Math.max(bestCombo, combo);
        var gain = 3 * multiplier();
        points += gain;
        scoreBump = 1;
        var stylish = obstacles.some(function (ob2) { return ob2.row === row && ob2.cleared; });
        floatAt((stylish ? "ÇALIM +" : "+") + gain, player.x, 2.1, z, stylish ? P.gold : "#FFFFFF", stylish ? 20 : 17);
        if (combo % 8 === 0 && combo <= 32) {
          A.floatText("ÇARPAN ×" + Math.min(5, 1 + Math.floor(combo / 8)), W / 2, H * 0.4, P.gold, 24);
          A.sound("level");
        } else if (stylish) A.sound("gate");
        A.haptic(stylish ? "medium" : "light");
      }
      var lvl = 1 + Math.floor(passed / ROWS_PER_LEVEL);
      if (lvl > level) {
        level = lvl;
        levelUp();
      }
    }

    /* Altınlar */
    var magnet = active.magnet > 0 || active.turbo > 0;
    for (var cI = 0; cI < coins.length; cI++) {
      var co = coins[cI];
      if (co.taken) continue;
      var d = co.z - z;
      if (magnet && d < 11 && d > -1) {
        co.x = A.damp(co.x, player.x, 10, dt);
        co.y = A.damp(co.y, 0.9 + player.y, 10, dt);
        co.z = A.damp(co.z, z + 0.2, 6, dt);
        d = co.z - z;
      }
      if (d > 0.75 || d < -0.75) continue;
      if (Math.abs(player.x - co.x) < 0.8 && Math.abs(player.y + 0.9 - co.y) < 1.15) {
        co.taken = true;
        co.at = A.time;
        if (playing) {
          points += 1;
          coinCount += 1;
          coinBump = 1;
          A.sound("coin");
        }
        pushFx({ kind: "coin", x: co.x, y: co.y, z: co.z });
        if (R && playing) {
          var cs = G3.project(R, co.x, co.y, wz(co.z));
          A.fly(cs.x, cs.y);
        }
      }
    }

    /* Güç kutuları */
    for (var pI = 0; pI < pickups.length; pI++) {
      var pk = pickups[pI];
      if (pk.taken || Math.abs(pk.z - z) > 0.9) continue;
      if (Math.abs(player.x - laneX(pk.lane)) < 0.95 && player.y < 1.6) {
        pk.taken = true;
        pk.at = A.time;
        if (playing) grant(pk.type);
      }
    }

    /* Temizlik ve üretim */
    var cut = z - 9;
    rows = rows.filter(function (o2) { return o2.z > cut - 6; });
    obstacles = obstacles.filter(function (o2) { return o2.z + o2.depth / 2 > cut; });
    coins = coins.filter(function (o2) { return o2.z > cut && !(o2.taken && A.time - o2.at > 0.4); });
    pickups = pickups.filter(function (o2) { return o2.z > cut; });
    while (nextRowZ < z + FAR) spawnRow();
  }

  /** Vitrin pilotu: sıradaki sıranın yol şeridine geçer, gerekirse zıplar/kayar. */
  function autopilot() {
    var next = null;
    for (var i = 0; i < rows.length; i++)
      if (rows[i].z > z - 0.5) {
        next = rows[i];
        break;
      }
    if (!next) return;
    var d = next.z - z;
    if (d < 16 && player.lane !== next.path) shift(next.path > player.lane ? 1 : -1);
    var type = next.cells[next.path + 1];
    if ((type === "hurdle" || type === "tackler") && d < speed * 0.3 + (type === "tackler" ? 1.2 : 0) && d > 0.5 && grounded()) jump();
    if (type === "bar" && d < speed * 0.22 && d > 0.3 && grounded() && player.slide <= 0) slide();
  }

  /* ─────────────────────────── girdi ─────────────────────────── */

  var SWIPE = 20;
  function down(p) {
    touch = { x: p.x, y: p.y, moved: false };
  }
  function move(p) {
    if (!touch || state !== "play") return;
    var dx = p.x - touch.x, dy = p.y - touch.y;
    if (Math.abs(dx) < SWIPE && Math.abs(dy) < SWIPE) return;
    if (Math.abs(dx) > Math.abs(dy)) shift(dx > 0 ? 1 : -1);
    else if (dy < 0) jump();
    else slide();
    // hareket sürerse yeni bir kaydırma sayılır (çift şerit)
    touch = { x: p.x, y: p.y, moved: true };
  }
  function up() {
    touch = null;
  }
  if (typeof window !== "undefined" && window.addEventListener)
    window.addEventListener("keydown", function (e) {
      if (state !== "play") return;
      if (e.key === "ArrowLeft") shift(-1);
      else if (e.key === "ArrowRight") shift(1);
      else if (e.key === "ArrowUp" || e.key === " ") jump();
      else if (e.key === "ArrowDown") slide();
    });

  /* ═══════════════════════════ 3B ÇİZİM ═══════════════════════════ */

  var R = null, glFailed = false;
  var STRIP = 240;
  var SLOT = 40; // kenar manzarası parça boyu
  var EDGE = LANE * 1.5 + 0.5; // koşu yolunun yarı genişliği
  var SIDE = EDGE + 3.4; // manzaranın başladığı uzaklık
  function wz(Z) {
    return -Z;
  }
  function floatAt(text, wx, wy, Z, color, size) {
    if (R) {
      var p = G3.project(R, wx, wy, wz(Z));
      A.floatText(text, p.x, p.y, color, size);
    }
  }

  function resize(w, h) {
    W = w;
    H = h;
    if (!player) resetWorld();
    initGL();
    if (R) G3.resize(R, W, H, function (aspect) { return A.clamp((2 * Math.atan(0.5 / aspect) * 180) / Math.PI, 46, 80); });
  }

  function initGL() {
    if (R || glFailed) return;
    try {
      R = G3.stage({ theme: "day", fog: [70, 185], far: 500, curve: [0.00016, -0.00042], shadow: { size: 1536, box: [-12, 12, 26, -10], far: 150 }, fxMax: 400, dustMax: 300 });
      if (!R) {
        glFailed = true;
        return;
      }
      buildWorld();
      buildRunner();
    } catch (e) {
      A.glError = String((e && e.stack) || e);
      R = null;
      glFailed = true;
    }
  }

  /* ─────────────── dünya ─────────────── */

  function buildWorld() {
    var s = R.scene;
    // Koşu yolu: üç şeritli çim (biçme bantları + şerit çizgileri)
    var turf = K.canvasTex(256, 256, function (c, w, h) {
      for (var r = 0; r < 4; r++) {
        c.fillStyle = r % 2 ? "#47b85a" : "#3ca84f";
        c.fillRect(0, (r * h) / 4, w, h / 4);
      }
      var rnd = A.seeded(4);
      for (var k = 0; k < 6000; k++) {
        c.fillStyle = rnd() < 0.5 ? "rgba(255,255,255,0.05)" : "rgba(0,50,0,0.07)";
        c.fillRect(rnd() * w, rnd() * h, 1.5, 2 + rnd() * 4);
      }
      var mx = (0.5 / (EDGE * 2)) * w;
      c.fillStyle = "rgba(255,255,255,0.95)";
      c.fillRect(mx - 3, 0, 6, h);
      c.fillRect(w - mx - 3, 0, 6, h);
      c.fillStyle = "rgba(255,255,255,0.4)";
      [-0.5, 0.5].forEach(function (l) {
        var x = ((EDGE + l * LANE) / (EDGE * 2)) * w;
        for (var y = 0; y < h; y += 64) c.fillRect(x - 2, y, 4, 34);
      });
    }, true);
    turf.repeat.set(1, STRIP / 14);
    R.turf = turf;
    R.track = K.mesh(new T.PlaneGeometry(EDGE * 2, STRIP, 1, 24), K.std(0xffffff, 0.92, 0, { map: turf, envMapIntensity: 0.3 }), false, true);
    R.track.rotation.x = -Math.PI / 2;
    s.add(R.track);
    // Kaldırım
    var pave = K.canvasTex(128, 128, function (c, w, h) {
      c.fillStyle = "#d9dee8";
      c.fillRect(0, 0, w, h);
      c.strokeStyle = "rgba(90,100,130,0.35)";
      c.lineWidth = 2;
      for (var i = 0; i <= 2; i++) {
        c.beginPath();
        c.moveTo(0, (i * h) / 2);
        c.lineTo(w, (i * h) / 2);
        c.moveTo((i * w) / 2, 0);
        c.lineTo((i * w) / 2, h);
        c.stroke();
      }
    }, true);
    pave.repeat.set(2, STRIP / 2);
    R.pave = pave;
    R.walks = [-1, 1].map(function (side) {
      var m = K.mesh(new T.PlaneGeometry(SIDE - EDGE, STRIP, 1, 24), K.std(0xffffff, 0.85, 0, { map: pave, envMapIntensity: 0.3 }), false, true);
      m.rotation.x = -Math.PI / 2;
      m.position.set((side * (SIDE + EDGE)) / 2, 0.04, 0);
      s.add(m);
      return m;
    });
    // bordür
    R.kerbs = [-1, 1].map(function (side) {
      var m = K.mesh(new T.BoxGeometry(0.22, 0.16, STRIP, 1, 1, 24), K.std(0xf8fafc, 0.6), false, true);
      m.position.set(side * (EDGE + 0.1), 0.08, 0);
      s.add(m);
      return m;
    });
    // uzak zemin (parka kadar çim)
    R.apron = K.mesh(new T.PlaneGeometry(260, STRIP, 8, 24), K.std(0x4a9f52, 0.95, 0, { envMapIntensity: 0.25 }), false, true);
    R.apron.rotation.x = -Math.PI / 2;
    R.apron.position.y = -0.04;
    s.add(R.apron);
    // LED panolar (kaldırımın dış kenarı)
    R.boardTex = K.canvasTex(1024, 64, function () {}, true);
    R.boardTex.repeat.set(STRIP / 26, 1);
    var boardMat = new T.MeshBasicMaterial({ map: R.boardTex, toneMapped: false });
    var dark = K.std(0x16204a, 0.6);
    R.boards = [-1, 1].map(function (side) {
      var b = K.mesh(new T.BoxGeometry(0.2, 0.95, STRIP, 1, 1, 24), [side < 0 ? dark : boardMat, side < 0 ? boardMat : dark, dark, dark, dark, dark], true, true);
      b.position.set(side * (SIDE - 0.2), 0.5, 0);
      s.add(b);
      return b;
    });

    buildScenery();
    buildProps();
  }

  /** Bina cephesi dokusu: pencere ızgarası (gece ışıkları emissive haritada). */
  function windowTextures() {
    var S = 256, cols = 6, rws = 8;
    var lit = [];
    var rnd = A.seeded(21);
    for (var i = 0; i < cols * rws; i++) lit.push(rnd() < 0.42);
    var map = K.canvasTex(S, S, function (c) {
      c.fillStyle = "#ffffff";
      c.fillRect(0, 0, S, S);
      for (var y = 0; y < rws; y++)
        for (var x = 0; x < cols; x++) {
          var px = x * (S / cols) + 7, py = y * (S / rws) + 6;
          c.fillStyle = "#3b4a6b";
          c.fillRect(px, py, S / cols - 14, S / rws - 12);
          c.fillStyle = "rgba(160,200,255,0.55)";
          c.fillRect(px, py, S / cols - 14, (S / rws - 12) * 0.45);
        }
    }, true);
    var glow = K.canvasTex(S, S, function (c) {
      c.fillStyle = "#000000";
      c.fillRect(0, 0, S, S);
      for (var y = 0; y < rws; y++)
        for (var x = 0; x < cols; x++) {
          if (!lit[y * cols + x]) continue;
          c.fillStyle = x % 3 === 0 ? "#ffd98a" : "#fff2c4";
          c.fillRect(x * (S / cols) + 7, y * (S / rws) + 6, S / cols - 14, S / rws - 12);
        }
    }, true);
    return { map: map, glow: glow };
  }

  /**
   * Kenar manzarası: 40 m'lik parçalar (bina sırası · ağaçlık · taraftar
   * tribünü) dünyada sabit yuvalara oturur; geride kalan öne taşınır.
   */
  var PATTERN = ["B", "T", "B", "S", "T", "B", "B", "S", "T", "S"];
  function buildScenery() {
    var s = R.scene;
    var wt = windowTextures();
    var wallCols = [0xfde2c4, 0xcfe8ff, 0xffd1dc, 0xe7dcff, 0xd6f5dc, 0xfff3b0, 0xf4f4f5, 0xffc9a8];
    R.buildingMats = wallCols.map(function (col) {
      var m = new T.MeshStandardMaterial({ color: col, map: wt.map, roughness: 0.85, emissive: 0xffffff, emissiveMap: wt.glow, emissiveIntensity: 0 });
      return m;
    });
    var roofMat = K.std(0x8792a8, 0.8);
    var awnings = [0xf43f5e, 0x5b3df5, 0x16a34a, 0xf97316].map(function (c) { return K.std(c, 0.7); });
    function buildings(side, seed) {
      var g = new T.Group();
      var rnd = A.seeded(seed);
      var zz = -SLOT / 2;
      while (zz < SLOT / 2 - 4) {
        var w = 7 + rnd() * 6, h = 7 + rnd() * 13, d = 8 + rnd() * 4;
        if (zz + w > SLOT / 2) w = SLOT / 2 - zz;
        var mat = R.buildingMats[(rnd() * R.buildingMats.length) | 0];
        var geo = new T.BoxGeometry(d, h, w - 0.4);
        // pencere yoğunluğu boyuta göre
        var uv = geo.attributes.uv;
        for (var i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * Math.max(1, Math.round(w / 7)), uv.getY(i) * Math.max(1, Math.round(h / 9)));
        var b = K.mesh(geo, [mat, mat, roofMat, roofMat, mat, mat], true, true);
        b.position.set(side * (SIDE + 2.2 + d / 2), h / 2, zz + w / 2);
        g.add(b);
        // tente
        var aw = K.mesh(new T.BoxGeometry(1.5, 0.14, w - 1.4), awnings[(rnd() * awnings.length) | 0], true, false);
        aw.position.set(side * (SIDE + 2.2 - 0.6), 3.0, zz + w / 2);
        aw.rotation.z = side * 0.28;
        g.add(aw);
        zz += w;
      }
      s.add(g);
      return g;
    }
    var trunkGeo = new T.CylinderGeometry(0.22, 0.3, 2.6, 8), leafGeo = new T.IcosahedronGeometry(1.7, 1);
    var trunkMat = K.std(0x7a5536, 0.9), leafMats = [K.std(0x3fa34d, 0.85), K.std(0x58b85a, 0.85), K.std(0x2f8f45, 0.85)];
    function trees(side, seed) {
      var g = new T.Group();
      var rnd = A.seeded(seed);
      for (var i = 0; i < 9; i++) {
        var x = side * (SIDE + 2 + rnd() * 16), zz = -SLOT / 2 + 2 + rnd() * (SLOT - 4), k = 0.8 + rnd() * 0.7;
        var tr = K.mesh(trunkGeo, trunkMat, true, false);
        tr.position.set(x, 1.3 * k, zz);
        tr.scale.setScalar(k);
        var lf = K.mesh(leafGeo, leafMats[i % 3], true, false);
        lf.position.set(x, 3.4 * k, zz);
        lf.scale.set(k, k * 1.1, k);
        var lf2 = K.mesh(leafGeo, leafMats[(i + 1) % 3], true, false);
        lf2.position.set(x + 0.7 * k, 4.4 * k, zz + 0.4);
        lf2.scale.setScalar(k * 0.7);
        g.add(tr, lf, lf2);
      }
      s.add(g);
      return g;
    }
    R.crowdTex = G3.crowdTexture(kitOf(runner), kitOf(defenseAt(1)));
    function stand(side) {
      return G3.standStrip(R, SLOT - 2, side, SIDE + 1.4, R.crowdTex, { depth: 9, rise: 5.6 });
    }
    R.scenery = { B: [], T: [], S: [] };
    [-1, 1].forEach(function (side) {
      for (var i = 0; i < 4; i++) R.scenery.B.push({ side: side, obj: buildings(side, 100 + i * 7 + (side > 0 ? 50 : 0)) });
      for (var j = 0; j < 3; j++) R.scenery.T.push({ side: side, obj: trees(side, 300 + j * 5 + (side > 0 ? 40 : 0)) });
      for (var k = 0; k < 3; k++) R.scenery.S.push({ side: side, obj: stand(side) });
    });

    // Sokak lambaları: direk + gece parlaması
    var poleGeo = new T.CylinderGeometry(0.08, 0.11, 6, 8), poleMat = K.std(0x334155, 0.5, 0.4);
    R.lampGlow = new T.SpriteMaterial({ map: K.glowTexture(), color: 0xffe9b0, transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: 0 });
    R.lampHead = new T.MeshBasicMaterial({ color: 0xfff4d6, toneMapped: false });
    R.lamps = [];
    for (var i = 0; i < 12; i++) {
      var g = new T.Group();
      var pole = K.mesh(poleGeo, poleMat, true, false);
      pole.position.y = 3;
      var head = K.mesh(new T.BoxGeometry(1.3, 0.14, 0.4), R.lampHead, false, false);
      head.position.set(0.5, 6, 0);
      var glow = new T.Sprite(R.lampGlow);
      glow.position.set(0.9, 5.8, 0);
      glow.scale.set(5, 5, 1);
      g.add(pole, head, glow);
      g.userData.side = i % 2 ? 1 : -1;
      if (g.userData.side > 0) g.scale.x = -1;
      s.add(g);
      R.lamps.push(g);
    }

    // Yolun üstünden geçen pankart kemerleri
    R.archTex = K.canvasTex(1024, 128, function () {});
    R.arches = [0, 1].map(function () {
      var g = new T.Group();
      var steel = K.std(0xe2e8f0, 0.4, 0.5);
      [-1, 1].forEach(function (sd) {
        var p = K.mesh(new T.CylinderGeometry(0.2, 0.26, 8.4, 10), steel, true, false);
        p.position.set(sd * (SIDE - 0.9), 4.2, 0);
        g.add(p);
      });
      var beam = K.mesh(new T.BoxGeometry((SIDE - 0.9) * 2 + 0.8, 1.9, 0.3), [steel, steel, steel, steel, new T.MeshBasicMaterial({ map: R.archTex, toneMapped: false }), steel], true, false);
      beam.position.y = 7.4;
      g.add(beam);
      s.add(g);
      return g;
    });
  }

  /** Engel, altın ve güç kutusu havuzları. */
  function buildProps() {
    var s = R.scene;
    // antrenman engeli
    var stripe = K.canvasTex(128, 32, function (c) {
      for (var i = 0; i < 8; i++) {
        c.fillStyle = i % 2 ? "#ffffff" : "#f43f5e";
        c.fillRect(i * 16, 0, 16, 32);
      }
    });
    var barMat = K.std(0xffffff, 0.45, 0, { map: stripe });
    var legMat = K.std(0x1f2937, 0.5);
    R.hurdles = [];
    for (var i = 0; i < 8; i++) {
      var g = new T.Group();
      var bar = K.mesh(new T.BoxGeometry(LANE - 0.5, 0.16, 0.16), barMat);
      bar.position.y = 0.82;
      var bar2 = K.mesh(new T.BoxGeometry(LANE - 0.5, 0.1, 0.1), barMat);
      bar2.position.y = 0.48;
      g.add(bar, bar2);
      [-1, 1].forEach(function (sd) {
        var leg = K.mesh(new T.BoxGeometry(0.1, 0.9, 0.1), legMat);
        leg.position.set(sd * (LANE / 2 - 0.3), 0.45, 0);
        var foot = K.mesh(new T.BoxGeometry(0.12, 0.08, 0.7), legMat);
        foot.position.set(sd * (LANE / 2 - 0.3), 0.04, 0);
        g.add(leg, foot);
      });
      g.visible = false;
      s.add(g);
      R.hurdles.push(g);
    }
    // pankart (altından kayılır)
    R.bannerTex = K.canvasTex(512, 128, function () {});
    var bannerMat = new T.MeshStandardMaterial({ map: R.bannerTex, roughness: 0.7, side: T.DoubleSide });
    var poleMat = K.std(0xf1f5f9, 0.35, 0.3);
    R.bars = [];
    for (var j = 0; j < 6; j++) {
      var g2 = new T.Group();
      var ban = K.mesh(new T.BoxGeometry(LANE - 0.3, 1.25, 0.12), bannerMat);
      ban.position.y = 1.9;
      g2.add(ban);
      [-1, 1].forEach(function (sd) {
        var p = K.mesh(new T.CylinderGeometry(0.06, 0.07, 2.6, 8), poleMat);
        p.position.set(sd * (LANE / 2 - 0.15), 1.3, 0);
        g2.add(p);
      });
      g2.visible = false;
      s.add(g2);
      R.bars.push(g2);
    }
    // takım otobüsü
    R.busSide = K.canvasTex(1024, 256, function () {});
    R.busFront = K.canvasTex(256, 256, function () {});
    var sideMat = new T.MeshStandardMaterial({ map: R.busSide, roughness: 0.35, metalness: 0.1, envMapIntensity: 0.9 });
    var frontMat = new T.MeshStandardMaterial({ map: R.busFront, roughness: 0.3, metalness: 0.1, envMapIntensity: 0.9 });
    R.busRoof = new T.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, metalness: 0.1 });
    var tyre = K.std(0x111827, 0.8), wheelGeo = new T.CylinderGeometry(0.46, 0.46, 0.3, 16);
    wheelGeo.rotateZ(Math.PI / 2);
    R.buses = [];
    for (var b = 0; b < 6; b++) {
      var g3 = new T.Group();
      var body = K.mesh(new T.BoxGeometry(LANE - 0.25, 2.75, 9), [sideMat, sideMat, R.busRoof, R.busRoof, frontMat, frontMat], true, false);
      body.position.y = 0.5 + 2.75 / 2;
      g3.add(body);
      [-1, 1].forEach(function (sx) {
        [-2.9, 2.9].forEach(function (sz) {
          var wh = K.mesh(wheelGeo, tyre, true, false);
          wh.position.set(sx * (LANE / 2 - 0.22), 0.46, sz);
          g3.add(wh);
        });
      });
      // farlar (gece)
      [-1, 1].forEach(function (sx) {
        var hl = new T.Sprite(new T.SpriteMaterial({ map: K.glowTexture(), color: 0xfff6d8, transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: 0.85 }));
        hl.position.set(sx * 0.7, 1.0, 4.6);
        hl.scale.set(1.5, 1.5, 1);
        g3.add(hl);
      });
      g3.visible = false;
      s.add(g3);
      R.buses.push(g3);
    }
    // altınlar (örneklenmiş)
    var coinGeo = new T.CylinderGeometry(0.3, 0.3, 0.07, 22);
    coinGeo.rotateX(Math.PI / 2);
    R.coins = new T.InstancedMesh(coinGeo, new T.MeshStandardMaterial({ color: 0xffd24a, emissive: 0xc27a00, emissiveIntensity: 0.9, roughness: 0.3, metalness: 0.35 }), 90);
    R.coins.frustumCulled = false;
    R.coins.castShadow = false;
    R.coins.count = 0;
    s.add(R.coins);
    // güç kutuları
    R.pickups = [];
    for (var p = 0; p < 3; p++) {
      var g4 = new T.Group();
      var box = K.mesh(new T.OctahedronGeometry(0.42, 0), new T.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.6, roughness: 0.15, metalness: 0.3, transparent: true, opacity: 0.9 }));
      var icon = new T.Sprite(new T.SpriteMaterial({ depthWrite: false, toneMapped: false, transparent: true }));
      icon.position.y = 0.95;
      icon.scale.set(0.8, 0.8, 1);
      var glow = new T.Sprite(new T.SpriteMaterial({ map: K.glowTexture(), transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: 0.85 }));
      glow.scale.set(3, 3, 1);
      g4.add(box, icon, glow);
      g4.userData = { box: box, icon: icon, glow: glow, type: "" };
      g4.visible = false;
      s.add(g4);
      R.pickups.push(g4);
    }
    // top + kalkan balonu + temas gölgesi
    R.ball = G3.ball(R, 0.11);
    R.shadow = S3.blob(1.0, 0.5);
    R.bubble = new T.Mesh(new T.SphereGeometry(1.15, 24, 16), new T.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.22, depthWrite: false, blending: T.AdditiveBlending, toneMapped: false }));
    R.bubble.visible = false;
    s.add(R.bubble);
    R.foes = new Map();
  }

  var iconTex = {};
  function powerIcon(type) {
    if (iconTex[type]) return iconTex[type];
    var col = POWERS[type].color;
    iconTex[type] = K.canvasTex(128, 128, function (c) {
      c.beginPath();
      c.arc(64, 64, 58, 0, Math.PI * 2);
      c.fillStyle = "rgba(8,10,30,0.88)";
      c.fill();
      c.lineWidth = 7;
      c.strokeStyle = col;
      c.stroke();
      drawPower(c, type, 64, 64, 34, col);
    });
    return iconTex[type];
  }

  /** Seviyenin takımı değişince: otobüs, pankart, kemer, pano ve seyirci boyanır. */
  function paintTeam() {
    var def = defenseAt(level);
    var key = rosterSig + ":" + def.team.id + ":" + level;
    if (key === R.teamKey) return;
    R.teamKey = key;
    var kit = def.team.kit || { primary: "#DC2626", secondary: "#FFFFFF" };
    var name = String(def.team.name || "RAKİP").toLocaleUpperCase("tr-TR");
    var mk = kitOf(runner);
    // otobüs yanı
    var c = R.busSide.userData.ctx, w = 1024, h = 256;
    c.fillStyle = kit.primary;
    c.fillRect(0, 0, w, h);
    c.fillStyle = kit.secondary;
    c.fillRect(0, h * 0.62, w, h * 0.09);
    c.fillStyle = "rgba(0,0,0,0.18)";
    c.fillRect(0, h * 0.86, w, h * 0.14);
    // camlar
    for (var i = 0; i < 7; i++) {
      var x = 40 + i * 136;
      var g = c.createLinearGradient(0, 30, 0, 130);
      g.addColorStop(0, "#9bd0ff");
      g.addColorStop(1, "#1e3a5f");
      c.fillStyle = g;
      A.roundRect(c, x, 28, 116, 100, 12);
      c.fill();
      c.fillStyle = "rgba(255,255,255,0.35)";
      c.beginPath();
      c.moveTo(x + 14, 32);
      c.lineTo(x + 50, 32);
      c.lineTo(x + 24, 124);
      c.lineTo(x + 4, 124);
      c.closePath();
      c.fill();
    }
    c.font = "900 56px " + A.FONT;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.lineWidth = 8;
    c.strokeStyle = "rgba(0,0,0,0.35)";
    var ink = kit.secondary;
    c.strokeText(name, w / 2, h * 0.76, w - 80);
    c.fillStyle = ink;
    c.fillText(name, w / 2, h * 0.76, w - 80);
    R.busSide.needsUpdate = true;
    // otobüs önü
    c = R.busFront.userData.ctx;
    c.fillStyle = kit.primary;
    c.fillRect(0, 0, 256, 256);
    var gw = c.createLinearGradient(0, 30, 0, 150);
    gw.addColorStop(0, "#b6dcff");
    gw.addColorStop(1, "#16304f");
    c.fillStyle = gw;
    A.roundRect(c, 18, 26, 220, 124, 16);
    c.fill();
    c.fillStyle = "rgba(255,255,255,0.3)";
    c.beginPath();
    c.moveTo(40, 30);
    c.lineTo(110, 30);
    c.lineTo(60, 146);
    c.lineTo(24, 146);
    c.closePath();
    c.fill();
    c.fillStyle = kit.secondary;
    c.fillRect(0, 164, 256, 16);
    c.fillStyle = "#0b1020";
    c.fillRect(70, 196, 116, 34);
    c.fillStyle = "#fff6d8";
    c.beginPath();
    c.arc(34, 212, 16, 0, Math.PI * 2);
    c.arc(222, 212, 16, 0, Math.PI * 2);
    c.fill();
    R.busFront.needsUpdate = true;
    R.busRoof.color.set(kit.primary).multiplyScalar(0.8);
    // pankart
    c = R.bannerTex.userData.ctx;
    var gb = c.createLinearGradient(0, 0, 512, 0);
    gb.addColorStop(0, kit.primary);
    gb.addColorStop(1, kit.secondary);
    c.fillStyle = gb;
    c.fillRect(0, 0, 512, 128);
    c.fillStyle = "rgba(8,10,30,0.55)";
    c.fillRect(0, 96, 512, 32);
    c.font = "900 54px " + A.FONT;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.lineWidth = 8;
    c.strokeStyle = "rgba(8,10,30,0.8)";
    c.strokeText(name, 256, 50, 480);
    c.fillStyle = "#FFFFFF";
    c.fillText(name, 256, 50, 480);
    c.font = "900 22px " + A.FONT;
    c.fillStyle = "#FDE68A";
    c.fillText("▼  ALTINDAN KAY  ▼", 256, 113);
    R.bannerTex.needsUpdate = true;
    // kemer
    c = R.archTex.userData.ctx;
    var ga = c.createLinearGradient(0, 0, 1024, 0);
    ga.addColorStop(0, mk.primary);
    ga.addColorStop(0.5, "#2A1680");
    ga.addColorStop(1, kit.primary);
    c.fillStyle = ga;
    c.fillRect(0, 0, 1024, 128);
    c.font = "900 70px " + A.FONT;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillStyle = "#FFFFFF";
    c.fillText("ELİTLİG ARENA  •  SEVİYE " + level, 512, 68, 980);
    R.archTex.needsUpdate = true;
    // pano
    c = R.boardTex.userData.ctx;
    var gp = c.createLinearGradient(0, 0, 0, 64);
    gp.addColorStop(0, "#5B3DF5");
    gp.addColorStop(1, "#2A1680");
    c.fillStyle = gp;
    c.fillRect(0, 0, 1024, 64);
    c.font = "900 36px " + A.FONT;
    c.textAlign = "left";
    c.textBaseline = "middle";
    c.fillStyle = "#FFFFFF";
    var text = "ELİTLİG ARENA  •  SLALOM  •  RAKİP: " + name + "  •  ";
    var unit = c.measureText(text).width || 200;
    for (var px = 0; px < 1024; px += unit) c.fillText(text, px, 35);
    R.boardTex.needsUpdate = true;
    G3.paintCrowd(R.crowdTex, mk, kit);
  }

  function buildRunner() {
    if (R.runner) {
      R.scene.remove(R.runner.root);
      K.disposeTree(R.runner.root);
    }
    R.runner = K.makeAthlete(runner, { keeper: false });
    R.scene.add(R.runner.root);
  }

  /**
   * Savunmacının 3B modeli. Aynı oyuncu ekranda birden çok engelde olabilir
   * (kısa kadrolar): oyuncu başına en çok üç model tutulur, boşalan yeniden
   * kullanılır. Doku boyama pahalıdır: karede en çok bir yeni model kurulur.
   */
  function foeAthlete(o) {
    var free = null;
    for (var i = 0; i < 3; i++) {
      var key = o.who.id + (i ? ":" + i : "");
      var a = R.foes.get(key);
      if (!a) {
        if (free == null) free = key;
        continue;
      }
      if (a.busy === o.id || a.busyUntil <= z) {
        a.busy = o.id;
        a.busyUntil = o.z + 12;
        return a;
      }
    }
    if (free == null || R.madeAt === A.time) return null;
    R.madeAt = A.time;
    var made = K.makeAthlete({ id: o.who.id, name: o.who.name, short: o.who.short, back: o.who.back, shirt: o.who.shirt, team: o.team }, { keeper: false, detail: "lo" });
    R.scene.add(made.root);
    R.foes.set(free, made);
    made.busy = o.id;
    made.busyUntil = o.z + 12;
    return made;
  }

  /* ─────────────── pozlar ─────────────── */

  function posePlayer() {
    var a = R.runner, J = a.J;
    K.rest(a);
    var root = a.root;
    root.position.set(player.x, player.y, wz(z));
    root.rotation.y = Math.PI - player.lean * 0.35;
    var blink = player.invuln > 0 && Math.sin(A.time * 34) > 0.2;
    root.visible = !blink;
    var fallen = state === "dying" || state === "over" ? A.clamp(dyingT * 2, 0, 1) : 0;
    if (fallen > 0) {
      root.visible = true;
      root.rotation.x = -fallen * 1.35;
      root.position.y = fallen * 0.15;
      J.sha.rotation.x = -2.6 * fallen;
      J.shb.rotation.x = -2.6 * fallen;
      return;
    }
    var amp = A.clamp(speed / 14, 0.5, 1.15);
    var air = player.y > 0.02;
    var sl = player.slide > 0 ? A.smooth(A.clamp((SLIDE_T - player.slide) / 0.12, 0, 1)) * A.smooth(A.clamp(player.slide / 0.14, 0, 1)) : 0;
    if (sl > 0) {
      // kayma: gövde geriye yatar, bir bacak öne uzanır
      K.play(a, "sprint", player.stride * 0.2, 1 - sl);
      root.rotation.x = 1.12 * sl;
      root.position.y = 0.06 * sl;
      J.hpa.rotation.x = -0.35 * sl;
      J.kna.rotation.x = 0.1 * sl;
      J.hpb.rotation.x = -0.9 * sl;
      J.knb.rotation.x = 1.7 * sl;
      J.sha.rotation.x = 0.9 * sl;
      J.sha.rotation.z = 0.5 * sl;
      J.shb.rotation.x = -0.6 * sl;
      J.shb.rotation.z = -0.9 * sl;
      J.head.rotation.x = -0.75 * sl;
      J.spine.rotation.x = -0.35 * sl;
    } else if (air) {
      // zıplama: dizler karna, kollar yukarı
      var k = A.clamp(player.y / 1.2, 0, 1);
      K.play(a, "sprint", player.stride * 0.25, 1 - 0.8 * k);
      J.hpa.rotation.x = -1.25 * k;
      J.kna.rotation.x = 1.7 * k;
      J.hpb.rotation.x = -0.55 * k;
      J.knb.rotation.x = 1.35 * k;
      J.sha.rotation.x = -2.2 * k;
      J.shb.rotation.x = -1.8 * k;
      J.sha.rotation.z = 0.35 * k;
      J.shb.rotation.z = -0.35 * k;
      J.spine.rotation.x = 0.12 * k;
      root.rotation.x = -0.1 * k;
    } else {
      K.runCycle(a, player.stride * 1.2, amp);
      J.spine.rotation.x = 0.04 + player.stumble * 0.7;
      J.head.rotation.x = -0.08;
    }
    root.rotation.z = player.lean * 0.42;
  }

  function poseFoe(a, o) {
    var J = a.J;
    K.rest(a);
    a.root.visible = true;
    a.root.position.set(laneX(o.lane), 0, wz(o.z));
    a.root.rotation.y = 0;
    if (o.smashed || o.hit) {
      var t = A.clamp((A.time - o.at) / 0.55, 0, 1);
      var dir = o.dir || 1;
      if (o.smashed) {
        a.root.position.x += dir * A.easeOut(t) * 3.4;
        a.root.position.y = Math.sin(t * Math.PI) * 1.1;
        a.root.rotation.z = -dir * t * 1.5;
      } else {
        a.root.rotation.x = -t * 1.35;
        a.root.position.y = t * 0.14;
      }
      J.sha.rotation.x = -2.4 * t;
      J.shb.rotation.x = -2.4 * t;
      return;
    }
    if (o.type === "tackler" && o.tackleAt) {
      // kayarak müdahale
      var k = A.smooth(A.clamp((A.time - o.tackleAt) / 0.28, 0, 1));
      a.root.rotation.x = -1.12 * k;
      a.root.position.y = 0.05 * k;
      J.hpa.rotation.x = -0.4 * k;
      J.hpb.rotation.x = -0.95 * k;
      J.knb.rotation.x = 1.7 * k;
      J.sha.rotation.x = 0.9 * k;
      J.sha.rotation.z = 0.6 * k;
      J.shb.rotation.z = -0.9 * k;
      J.head.rotation.x = -0.7 * k;
      return;
    }
    var wide = o.type === "wall";
    var bob = Math.sin(A.time * 4 + o.id) * 0.02;
    J.hips.position.y = 0.86 + bob;
    J.hpa.rotation.x = -0.32;
    J.hpb.rotation.x = -0.32;
    J.kna.rotation.x = 0.64;
    J.knb.rotation.x = 0.64;
    J.hpa.rotation.z = wide ? 0.42 : 0.24;
    J.hpb.rotation.z = wide ? -0.42 : -0.24;
    J.spine.rotation.x = wide ? 0.12 : 0.34;
    J.sha.rotation.z = wide ? 1.35 : 0.6;
    J.shb.rotation.z = wide ? -1.35 : -0.6;
    J.sha.rotation.x = wide ? 0 : -0.3;
    J.shb.rotation.x = wide ? 0 : -0.3;
    J.ela.rotation.x = wide ? 0 : -0.5;
    J.elb.rotation.x = wide ? 0 : -0.5;
    J.head.rotation.x = -0.15;
  }

  /* ─────────────── kamera + sahne ─────────────── */

  var camPos = null, camLook = null, coinM = null, coinQ = null, coinE = null, coinP = null, coinS = null;
  function sync(dt) {
    paintTeam();
    var c = R.camera;
    var wantPos = new T.Vector3(player.x * 0.72, 4.5 + player.y * 0.28, wz(z - 7.2));
    var wantLook = new T.Vector3(player.x * 0.72, 1.35 + player.y * 0.2, wz(z + 10));
    if (A.shakeAmt > 0.2) {
      wantPos.x += (Math.random() - 0.5) * A.shakeAmt * 0.02;
      wantPos.y += (Math.random() - 0.5) * A.shakeAmt * 0.02;
    }
    if (!camPos) {
      camPos = wantPos.clone();
      camLook = wantLook.clone();
    } else {
      var kk = 1 - Math.exp(-11 * dt);
      camPos.lerp(wantPos, kk);
      camLook.lerp(wantLook, kk);
      camPos.z = wantPos.z;
      camLook.z = wantLook.z;
    }
    c.position.copy(camPos);
    c.lookAt(camLook);
    c.rotateZ(-player.lean * 0.05);
    var fovK = A.clamp((speed - 11) / 12, 0, 1);
    var fov = R.baseFov * (1 + 0.08 * fovK + (active.turbo > 0 ? 0.12 : 0));
    if (Math.abs(c.fov - fov) > 0.01) {
      c.fov = A.damp(c.fov, fov, 4, dt);
      c.updateProjectionMatrix();
    }
    G3.focus(R, player.x * 0.5, 0, wz(z + 8));

    /* Akan şeritler */
    var mid = z + STRIP * 0.36;
    R.track.position.z = wz(mid);
    R.turf.offset.y = ((mid % 14) / 14) % 1;
    R.apron.position.z = wz(mid);
    R.walks.forEach(function (m) { m.position.z = wz(mid); });
    R.pave.offset.y = ((mid % 2) / 2) % 1;
    R.kerbs.forEach(function (m) { m.position.z = wz(mid); });
    R.boards.forEach(function (m) { m.position.z = wz(mid); });
    R.boardTex.offset.x = (mid / 26 + A.time * 0.03) % 1;

    /* Kenar manzarası: yuvalar */
    var first = Math.floor((z - 30) / SLOT);
    var used = { B: [0, 0], T: [0, 0], S: [0, 0] };
    ["B", "T", "S"].forEach(function (ty) {
      R.scenery[ty].forEach(function (e) { e.obj.visible = false; });
    });
    for (var sI = 0; sI < 6; sI++) {
      var slot = first + sI;
      [-1, 1].forEach(function (side, si) {
        var ty = PATTERN[(((slot + (side > 0 ? 3 : 0)) % PATTERN.length) + PATTERN.length) % PATTERN.length];
        var pool = R.scenery[ty].filter(function (e) { return e.side === side; });
        var e = pool[used[ty][si]++ % pool.length];
        if (!e || e.obj.visible) return;
        e.obj.visible = true;
        e.obj.position.z = wz(slot * SLOT + SLOT / 2);
      });
    }
    var night = R.th.stars;
    R.buildingMats.forEach(function (m) { m.emissiveIntensity = night * 0.9; });
    R.lampGlow.opacity = night * 0.9;
    var lampBase = Math.floor(z / 30) * 30;
    R.lamps.forEach(function (g, i) {
      g.position.set(g.userData.side * (SIDE - 1.2), 0, wz(lampBase + (Math.floor(i / 2) - 0.5) * 30));
    });
    var archBase = Math.floor((z + 20) / 150) * 150;
    R.arches.forEach(function (g, i) {
      g.position.z = wz(archBase + i * 150 + 75);
    });

    /* Engeller */
    var hi = 0, bi = 0, ui = 0;
    var seen = {};
    obstacles.forEach(function (o) {
      var g = null;
      if (o.type === "hurdle") g = R.hurdles[hi++];
      else if (o.type === "bar") g = R.bars[bi++];
      else if (o.type === "bus") g = R.buses[ui++];
      else {
        if (o.z - z > 120) return;
        var a = foeAthlete(o);
        if (!a) return;
        seen[a.busy] = a;
        poseFoe(a, o);
        return;
      }
      if (!g) return;
      g.visible = true;
      var t = o.smashed ? A.clamp((A.time - o.at) / 0.6, 0, 1) : 0;
      var dir = o.dir || 1;
      g.position.set(laneX(o.lane) + dir * A.easeOut(t) * 5, Math.sin(t * Math.PI) * 1.6, wz(o.z));
      g.rotation.set(0, t * dir * 0.6, -dir * t * 1.4);
      if (o.hit && o.type !== "bus") {
        var ht = A.clamp((A.time - o.at) / 0.3, 0, 1);
        g.rotation.x = -ht * 1.3;
      }
    });
    for (; hi < R.hurdles.length; hi++) R.hurdles[hi].visible = false;
    for (; bi < R.bars.length; bi++) R.bars[bi].visible = false;
    for (; ui < R.buses.length; ui++) R.buses[ui].visible = false;
    R.foes.forEach(function (a, key) {
      if (seen[a.busy] === a) return;
      a.root.visible = false;
      // seviyesi geçmiş takımın oyuncuları bellekten çıkar
      if (a.person.team !== defenseAt(level).team && a.busyUntil < z - 20) {
        R.scene.remove(a.root);
        K.disposeTree(a.root);
        R.foes.delete(key);
      }
    });

    /* Altınlar */
    if (!coinM) {
      coinM = new T.Matrix4();
      coinQ = new T.Quaternion();
      coinE = new T.Euler();
      coinP = new T.Vector3();
      coinS = new T.Vector3();
    }
    var cn = 0;
    for (var ci = 0; ci < coins.length && cn < 90; ci++) {
      var co = coins[ci];
      if (co.z - z > 110) continue;
      var tk = co.taken ? A.clamp((A.time - co.at) / 0.3, 0, 1) : 0;
      if (tk >= 1) continue;
      coinE.set(0, A.time * 4 + co.z * 0.4, 0);
      coinQ.setFromEuler(coinE);
      coinP.set(co.x, co.y + tk * 1.3 + Math.sin(A.time * 3 + co.z) * 0.06, wz(co.z));
      coinS.setScalar(1 - tk * 0.7);
      coinM.compose(coinP, coinQ, coinS);
      R.coins.setMatrixAt(cn++, coinM);
    }
    R.coins.count = cn;
    R.coins.instanceMatrix.needsUpdate = true;

    /* Güç kutuları */
    R.pickups.forEach(function (g, i) {
      var pk = pickups[i];
      if (!pk || (pk.taken && A.time - pk.at > 0.35)) {
        g.visible = false;
        return;
      }
      g.visible = true;
      if (g.userData.type !== pk.type) {
        g.userData.type = pk.type;
        var col = POWERS[pk.type].color;
        g.userData.box.material.color.set(col);
        g.userData.box.material.emissive.set(col);
        g.userData.glow.material.color.set(col);
        g.userData.icon.material.map = powerIcon(pk.type);
        g.userData.icon.material.needsUpdate = true;
      }
      var tk2 = pk.taken ? A.clamp((A.time - pk.at) / 0.35, 0, 1) : 0;
      g.position.set(laneX(pk.lane), 1.0 + Math.sin(A.time * 2.6 + pk.id) * 0.12 + tk2 * 1.5, wz(pk.z));
      g.userData.box.rotation.y = A.time * 2.4;
      g.scale.setScalar((1 + Math.sin(A.time * 5) * 0.05) * (1 + tk2));
    });

    /* Top: ayağın önünde; zıplayınca birlikte yükselir, kayarken öne kaçar */
    var touchK = (Math.sin(player.stride * 1.2) + 1) * 0.5;
    var ahead = 0.8 + touchK * 0.25 + (player.slide > 0 ? 0.9 : 0);
    R.ball.position.set(player.x + player.lean * 0.12, 0.11 + player.y * 0.92, wz(z + ahead));
    R.ball.rotation.x -= (speed / 0.11) * dt;
    R.ball.visible = !(state === "dying" || state === "over") || dyingT < 0.3;
    R.shadow.position.set(player.x, 0.012, wz(z));
    R.shadow.material.opacity = 0.5 * Math.max(0.25, 1 - player.y * 0.45);
    R.shadow.scale.setScalar(1 + player.y * 0.25);
    R.bubble.visible = active.shield > 0;
    if (active.shield > 0) {
      R.bubble.position.set(player.x, 1.0 + player.y, wz(z));
      R.bubble.material.opacity = (active.shield < 3 ? 0.12 + 0.12 * Math.sin(A.time * 14) : 0.2) + 0.04 * Math.sin(A.time * 5);
      R.bubble.scale.setScalar(1 + Math.sin(A.time * 4) * 0.03);
    }

    /* Parçacıklar */
    while (fx.length) {
      var e2 = fx.shift();
      var ez = wz(e2.z);
      if (e2.kind === "coin") R.fx.burst(6, { x: e2.x, y: e2.y, z: ez, speed: 3, life: 0.35, size: 0.28, color: [P.gold, "#FFFFFF"], gravity: 3, vz: -speed * 0.8 });
      else if (e2.kind === "land" || e2.kind === "hop") R.dust.burst(e2.kind === "land" ? 10 : 6, { x: e2.x, y: 0.08, z: ez, speed: 2.4, up: 0.3, life: 0.45, size: 0.3, size2: 0.75, color: ["#D9F2C4", "#B7E08F"], alpha: 0.55, gravity: 1, vz: -speed * 0.4 });
      else if (e2.kind === "crash") {
        R.fx.burst(24, { x: e2.x, y: 1.1, z: ez, speed: 8, life: 0.5, size: 0.4, color: ["#FCA5A5", "#FFFFFF", "#FDBA74"], vz: -speed * 0.7 });
        R.dust.burst(14, { x: e2.x, y: 0.4, z: ez, speed: 4, life: 0.7, size: 0.5, size2: 1.3, color: ["#E2E8F0", "#CBD5E1"], alpha: 0.6, gravity: -0.5, vz: -speed * 0.6 });
      } else if (e2.kind === "smash") R.fx.burst(26, { x: e2.x, y: 1.2, z: ez, speed: 9, life: 0.5, size: 0.45, color: ["#FDBA74", "#FDE047", "#FFFFFF"] });
      else if (e2.kind === "power") R.fx.burst(30, { x: e2.x, y: 1.2, z: ez, speed: 6, life: 0.6, size: 0.4, color: [e2.color, "#FFFFFF"], gravity: 2, vz: -speed * 0.9 });
    }
    if (state === "play" && !A.reduceMotion) {
      if (player.slide > 0 && Math.random() < 0.8) R.dust.emit({ x: player.x + A.rand(-0.3, 0.3), y: 0.1, z: wz(z - 0.4), vx: A.rand(-1, 1), vy: A.rand(0.5, 1.5), vz: -speed * 0.5, life: 0.4, size: 0.3, size2: 0.8, color: "#CFE8B4", alpha: 0.6, gravity: 1 });
      if (active.turbo > 0)
        for (var tI = 0; tI < 2; tI++) R.fx.emit({ x: player.x + A.rand(-0.35, 0.35), y: 0.3 + Math.random() * 1.4, z: wz(z - 0.6), vz: 2, life: 0.35, size: 0.5, size2: 0.05, color: ["#FB923C", "#FDE047", "#FFFFFF"], alpha: 0.8, gravity: 0, drag: 0 });
      else if (multiplier() >= 3 && Math.random() < 0.5) R.fx.emit({ x: player.x, y: 0.15, z: wz(z + 0.6), vy: 1, vz: 1, life: 0.3, size: 0.25, size2: 0.05, color: [P.gold, "#FB923C"], gravity: -1, drag: 0 });
    }
    posePlayer();
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
    drawTint(c);
    drawSpeedLines(c);
    if (R) drawFoeLabels(c);
    A.drawParticles(c);
    A.drawFloaters(c, dt);
    if (state !== "attract") drawHud(c);
    if (intro && intro.age >= 0) drawIntro(c);
    var by = Math.max(196, H * 0.25);
    c.save();
    c.translate(W / 2, by);
    c.scale(0.8, 0.8);
    c.translate(-W / 2, -by);
    A.drawBanner(c, W, by, dt);
    c.restore();
    if (flashRed > 0) {
      c.fillStyle = "rgba(251,113,133," + (0.28 * flashRed).toFixed(3) + ")";
      c.fillRect(0, 0, W, H);
    }
  }

  var scrim = null;
  function drawScrim(c) {
    if (!scrim || scrim.w !== W || scrim.h !== H) {
      scrim = A.layer(W, H);
      A.paintVignette(scrim.ctx, W, H, 0.3);
      A.paintTopScrim(scrim.ctx, W, 120);
    }
    A.blit(scrim);
  }

  /** Etkin gücün ekran kenarı tonu: TURBO turuncu, MIKNATIS kırmızı, ×2 altın. */
  var tints = {};
  function drawTint(c) {
    ["turbo", "magnet", "x2"].forEach(function (k) {
      var left = active[k];
      if (!(left > 0)) return;
      var L = tints[k];
      if (!L || L.w !== W || L.h !== H) {
        L = tints[k] = A.layer(W, H);
        var g = L.ctx.createRadialGradient(W / 2, H * 0.55, Math.min(W, H) * 0.38, W / 2, H * 0.55, Math.max(W, H) * 0.78);
        g.addColorStop(0, "rgba(0,0,0,0)");
        g.addColorStop(1, k === "turbo" ? "rgba(251,146,60,0.5)" : k === "magnet" ? "rgba(244,63,94,0.3)" : "rgba(250,204,21,0.3)");
        L.ctx.fillStyle = g;
        L.ctx.fillRect(0, 0, W, H);
      }
      c.save();
      c.globalAlpha = A.clamp(left / 0.6, 0, 1) * (0.8 + 0.2 * Math.sin(A.time * 5));
      A.blit(L);
      c.restore();
    });
  }

  function drawSpeedLines(c) {
    if (state !== "play" || A.reduceMotion) return;
    var k = Math.max(A.clamp((speed - 15) / 9, 0, 1), active.turbo > 0 ? 1 : 0);
    if (k <= 0) return;
    c.save();
    c.strokeStyle = "rgba(255,255,255," + (0.22 * k).toFixed(3) + ")";
    c.lineWidth = 1.6;
    var rand = A.seeded(Math.floor(A.time * 30));
    for (var i = 0; i < 16; i++) {
      var side = rand() < 0.5 ? -1 : 1;
      var x = W / 2 + side * (W * 0.3 + rand() * W * 0.22);
      var y = H * (0.28 + rand() * 0.62);
      var len = 30 + rand() * 70 * k;
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + side * len * 0.32, y + len);
      c.stroke();
    }
    c.restore();
  }

  /** Savunmacının adı: sığarsa tam ad, sığmazsa "A. Soyadı", o da sığmazsa "…". */
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
  function drawFoeLabels(c) {
    c.save();
    c.textAlign = "center";
    c.textBaseline = "middle";
    obstacles.forEach(function (o) {
      if (!o.who || o.hit || o.smashed) return;
      var d = o.z - z;
      if (d < 3 || d > 42 || (o.type === "tackler" && o.tackleAt)) return;
      var p = G3.project(R, laneX(o.lane), 2.25, wz(o.z));
      if (p.behind) return;
      var a = A.clamp((42 - d) / 8, 0, 1) * A.clamp((d - 3) / 3, 0, 1);
      if (a <= 0.01) return;
      c.globalAlpha = a;
      c.font = A.font(11, 800);
      var label = foeLabel(c, o.who, Math.min(130, W * 0.32));
      var num = o.who.shirt ? String(o.who.shirt) : "";
      var tw = c.measureText(label).width, nw = num ? 22 : 0;
      var bw = tw + nw + 14, bx = p.x - bw / 2;
      A.roundRect(c, bx, p.y - 11, bw, 22, 7);
      c.fillStyle = "rgba(8,10,30,0.82)";
      c.fill();
      if (num) {
        A.roundRect(c, bx + 3, p.y - 8, 20, 16, 5);
        c.fillStyle = (o.kit && o.kit.primary) || "#5B3DF5";
        c.fill();
        c.font = A.font(10, 900);
        c.fillStyle = "#FFFFFF";
        c.fillText(num, bx + 13, p.y + 0.5);
        c.font = A.font(11, 800);
      }
      c.fillStyle = "#FFFFFF";
      c.fillText(label, bx + nw + 7 + tw / 2, p.y + 0.5);
    });
    c.restore();
  }

  function drawIntro(c) {
    var d = intro.def, t = intro.age;
    var inT = A.easeOut(A.clamp(t / 0.3, 0, 1));
    var out = A.clamp((2.6 - t) / 0.35, 0, 1);
    if (out <= 0) return;
    var kit = d.team.kit || { primary: "#5B3DF5" };
    var cw = Math.min(W - 64, 264), ch = 40;
    var x = W / 2 - cw / 2, y = 150 - (1 - inT) * 14;
    c.save();
    c.globalAlpha = out * inT;
    A.roundRect(c, x, y, cw, ch, 10);
    c.fillStyle = "rgba(8,10,30,0.74)";
    c.fill();
    c.fillStyle = kit.primary;
    c.fillRect(x, y + 8, 4, ch - 16);
    c.textBaseline = "middle";
    c.textAlign = "left";
    c.font = A.font(9, 900);
    c.fillStyle = P.gold;
    c.fillText((intro.level ? "SEVİYE " + intro.level + " · " : "") + "RAKİP " + intro.idx + "/" + defenses.length + (intro.idx >= defenses.length ? " · FİNAL" : ""), x + 14, y + 12);
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

  /** Güç simgeleri: mıknatıs, kalkan, ×2, şimşek. */
  function drawPower(c, type, x, y, r, col) {
    c.save();
    c.lineCap = "round";
    c.lineJoin = "round";
    c.strokeStyle = col;
    c.fillStyle = col;
    if (type === "magnet") {
      c.lineWidth = r * 0.42;
      c.beginPath();
      c.arc(x, y - r * 0.05, r * 0.52, Math.PI, 0);
      c.lineTo(x + r * 0.52, y + r * 0.55);
      c.moveTo(x - r * 0.52, y - r * 0.05);
      c.lineTo(x - r * 0.52, y + r * 0.55);
      c.stroke();
      c.strokeStyle = "#FFFFFF";
      c.lineCap = "butt";
      c.beginPath();
      c.moveTo(x - r * 0.52, y + r * 0.4);
      c.lineTo(x - r * 0.52, y + r * 0.72);
      c.moveTo(x + r * 0.52, y + r * 0.4);
      c.lineTo(x + r * 0.52, y + r * 0.72);
      c.stroke();
    } else if (type === "shield") {
      c.beginPath();
      c.moveTo(x - r * 0.72, y - r * 0.8);
      c.lineTo(x + r * 0.72, y - r * 0.8);
      c.lineTo(x + r * 0.72, y + r * 0.05);
      c.quadraticCurveTo(x + r * 0.72, y + r * 0.7, x, y + r * 0.95);
      c.quadraticCurveTo(x - r * 0.72, y + r * 0.7, x - r * 0.72, y + r * 0.05);
      c.closePath();
      c.fill();
      c.strokeStyle = "#0B1030";
      c.lineWidth = r * 0.16;
      c.beginPath();
      c.moveTo(x - r * 0.3, y);
      c.lineTo(x - r * 0.05, y + r * 0.28);
      c.lineTo(x + r * 0.36, y - r * 0.3);
      c.stroke();
    } else if (type === "x2") {
      c.font = "900 " + Math.round(r * 1.25) + "px " + A.FONT;
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillText("×2", x, y + r * 0.06);
    } else {
      c.beginPath();
      c.moveTo(x + r * 0.2, y - r);
      c.lineTo(x - r * 0.6, y + r * 0.12);
      c.lineTo(x - r * 0.05, y + r * 0.12);
      c.lineTo(x - r * 0.25, y + r);
      c.lineTo(x + r * 0.6, y - r * 0.22);
      c.lineTo(x + r * 0.05, y - r * 0.22);
      c.closePath();
      c.fill();
    }
    c.restore();
  }

  function drawHud(c) {
    var top = 14;
    A.drawScore(c, 18, top, "PUAN", points, scoreBump);
    A.drawLives(c, W - 26, top + 12, lives, LIVES, 9);
    c.save();
    c.textBaseline = "middle";
    var lbl = "SEVİYE " + level;
    c.font = A.font(12, 800);
    var lw = c.measureText(lbl).width + 22;
    A.pill(c, W - 16 - lw, top + 30, lw, 26, "rgba(60,36,200,0.8)");
    c.fillStyle = "#fff";
    c.textAlign = "center";
    c.fillText(lbl, W - 16 - lw / 2, top + 43.5);
    // altın sayacı
    var cs = String(coinCount);
    var cw = c.measureText(cs).width + 40;
    A.pill(c, W - 16 - cw, top + 62, cw, 26);
    var cx = W - 16 - cw + 15, cy = top + 75;
    c.beginPath();
    c.arc(cx, cy, 7 * (1 + coinBump * 0.3), 0, Math.PI * 2);
    c.fillStyle = P.gold;
    c.fill();
    c.strokeStyle = "#B7791F";
    c.lineWidth = 1.5;
    c.stroke();
    c.fillStyle = "rgba(255,255,255,0.95)";
    c.textAlign = "left";
    c.fillText(cs, cx + 12, cy + 0.5);

    // çarpan
    var base = Math.min(5, 1 + Math.floor(combo / 8));
    var bx = 18, by = top + 66, bw = 110;
    A.pill(c, bx, by, bw, 10);
    var prog = base >= 5 ? 1 : (combo % 8) / 8;
    if (prog > 0) {
      var pg = c.createLinearGradient(bx, 0, bx + bw, 0);
      pg.addColorStop(0, P.brandGlow);
      pg.addColorStop(1, P.gold);
      c.fillStyle = pg;
      A.roundRect(c, bx + 1, by + 1, Math.max(8, (bw - 2) * prog), 8, 4);
      c.fill();
    }
    c.font = A.font(13, 900);
    c.fillStyle = multiplier() > 1 ? P.gold : "rgba(255,255,255,0.75)";
    c.fillText("×" + multiplier(), bx + bw + 8, by + 5.5);
    c.font = A.font(11, 700);
    c.fillStyle = "rgba(255,255,255,0.75)";
    c.fillText(Math.round(z) + " m · " + Math.round(speed * 3.6) + " km/s", bx, by + 24);

    // etkin güçler
    var py = top + 112;
    POWER_KEYS.forEach(function (k) {
      if (!(active[k] > 0)) return;
      var Pw = POWERS[k];
      A.pill(c, 14, py, 112, 28, "rgba(8,10,30,0.72)");
      drawPower(c, k, 30, py + 14, 9, Pw.color);
      c.font = A.font(10, 900);
      c.fillStyle = "#FFFFFF";
      c.textAlign = "left";
      c.fillText(Pw.name, 44, py + 10);
      A.roundRect(c, 44, py + 17, 72, 5, 2.5);
      c.fillStyle = "rgba(255,255,255,0.18)";
      c.fill();
      c.fillStyle = Pw.color;
      A.roundRect(c, 44, py + 17, Math.max(4, 72 * (active[k] / Pw.dur)), 5, 2.5);
      c.fill();
      py += 33;
    });
    c.restore();
  }

  function debug() {
    return {
      state: state, z: z, speed: speed, passed: passed, points: points, lives: lives, level: level, coins: coinCount, combo: combo, player: player,
      rows: rows, obstacles: obstacles, coinList: coins, pickups: pickups, runner: runner.short, defense: defenseAt(level).team.name, gl: !!R,
      active: active, shift: shift, jump: jump, slide: slide, grant: grant, foeLabel: foeLabel, multiplier: multiplier, autopilot: autopilot,
    };
  }

  A.register({ resize: resize, start: start, update: update, render: render, down: down, move: move, up: up, debug: debug, setRoster: setRoster });
})();
