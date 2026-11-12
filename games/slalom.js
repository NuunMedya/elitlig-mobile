/*
 * SLALOM KOŞUSU 3B — üç şeritli sonsuz koşu: topu sürerek stadyum bulvarında
 * ilerle, şerit değiştir, ZIPLA, KAY. Karşında ligin gerçek savunmaları.
 *
 * MİMARİ: simülasyon (şeritler, engeller, çarpışma, puan) çizimden
 * bağımsızdır; başsız testler yalnız onu koşturur. Çizim Canvas 2D'dir
 * (WebGL/three.js gerekmez): Savunma Hattı ailesinin düz vektör çizgi film
 * dili, tek perspektif izdüşümüyle "sahte 3B". KIVRIK DÜNYA (uzak yol aşağı ve
 * yana bükülür; engeller ufuktan doğar), gündüz → gün batımı → gece tema
 * geçişleri. Koşucu (arkadan, sırtında forma numarası) ve savunmacılar
 * (önden) takım formalı, büyük kafalı çizgi film futbolculardır.
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
    cache = {};
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
    setTheme(THEME_ORDER[0], true);
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
    setTheme(THEME_ORDER[(level - 1) % THEME_ORDER.length]);
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
        if (playing && W) {
          var cs = project(co.x, co.y, co.z);
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

  /* ═══════════════════════════ ÇİZİM — sahte 3B, Canvas 2D ═══════════════════════════
   * Savunma Hattı ailesi: düz vektör çizgi film. Kalın lacivert kontur, doygun
   * renkler, parlak vurgular. Dünya tek bir perspektif izdüşümüyle çizilir
   * (kamera koşucunun arkasında ve yukarıda); uzak yol hafifçe aşağı ve yana
   * bükülür, engeller ufuktan doğar. Her şey uzaktan yakına sıralanıp çizilir.
   */

  A.FONT = '"SF Pro Rounded", ui-rounded, "Nunito", "Arial Rounded MT Bold", -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif';
  var NAVY = "#1B1648";
  var GOLD = "#FFD43B";
  var BAD = "#FF4D6A";

  function rgbOf(h) {
    var n = parseInt(h.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  /** İki hex rengi karıştırır, hex döndürür (zincirlenebilir). */
  function mixc(a, b, t) {
    if (t <= 0) return a;
    if (t >= 1) return b;
    var p = rgbOf(a), q = rgbOf(b);
    var r = Math.round(p[0] + (q[0] - p[0]) * t), g = Math.round(p[1] + (q[1] - p[1]) * t), bl = Math.round(p[2] + (q[2] - p[2]) * t);
    return "#" + ((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1);
  }
  function hex(c, fb) {
    if (typeof c !== "string") return fb;
    if (/^#[0-9a-f]{6}$/i.test(c)) return c.toUpperCase();
    if (/^#[0-9a-f]{3}$/i.test(c)) return ("#" + c[1] + c[1] + c[2] + c[2] + c[3] + c[3]).toUpperCase();
    return fb;
  }
  function rgba(h, a) {
    var p = rgbOf(h);
    return "rgba(" + p[0] + "," + p[1] + "," + p[2] + "," + a + ")";
  }
  function lum(h) {
    var p = rgbOf(h);
    return (p[0] * 0.3 + p[1] * 0.59 + p[2] * 0.11) / 255;
  }
  function kitHex(person) {
    var k = kitOf(person);
    var p = hex(k.primary, "#5B3DF5"), s = hex(k.secondary, "#FFFFFF");
    if (Math.abs(lum(p) - lum(s)) < 0.12) s = lum(p) > 0.5 ? NAVY : "#FFFFFF";
    return { p: p, s: s };
  }
  function teamKit(o) {
    return kitHex({ team: { kit: o.kit || (o.team && o.team.kit) } });
  }
  function hash(a, b) {
    var t = (a * 374761393 + b * 668265263) | 0;
    t = Math.imul(t ^ (t >>> 13), 1274126177);
    return ((t ^ (t >>> 16)) >>> 0) / 4294967296;
  }

  /* ─────────────── kamera / izdüşüm ─────────────── */

  var EDGE = LANE * 1.5 + 0.5; // koşu yolunun yarı genişliği
  var SIDE = EDGE + 2.7; // kaldırımın dış kenarı (LED pano)
  var BLD = SIDE + 0.8; // bina cephesi
  var VIEW = 140; // çizim ufku (m)
  var DROP = 0.0011; // dünya bükülmesi (aşağı)
  var SLOT = 14; // kenar manzarası parça boyu
  var V = { sp: 40, back: 6.2, camH: 7, f: 250, hy: 0, yV: 0, feetY: 0, cx: 0, camY: 0, bend: 0 };
  var PJ = { x: 0, y: 0, s: 1, dz: 1 };

  function layout() {
    var portrait = H >= W;
    V.sp = Math.min((W * 0.43) / EDGE, H * (portrait ? 0.105 : 0.108));
    V.feetY = H * (portrait ? 0.8 : 0.84);
    V.yV = H * (portrait ? 0.4 : 0.36);
    var D = DROP * VIEW * VIEW, k = V.back / VIEW;
    V.camH = A.clamp((V.feetY - V.yV + D * V.sp * k) / (V.sp * (1 - k)), 3, 10);
    V.f = V.sp * V.back;
    V.hy = V.feetY - V.camH * V.sp;
  }
  /** Dünya (x, y, Z) → ekran. Sonuç ortak PJ nesnesine yazılır. */
  function pj(x, y, Z) {
    var dz = Z - (z - V.back);
    if (dz < 0.25) dz = 0.25;
    var s = V.f / dz;
    PJ.x = W / 2 + (x - V.cx + V.bend * dz * dz) * s;
    PJ.y = V.hy + (V.camH + V.camY - y + DROP * dz * dz) * s;
    PJ.s = s;
    PJ.dz = dz;
    return PJ;
  }
  function project(x, y, Z) {
    pj(x, y, Z);
    return { x: PJ.x, y: PJ.y, s: PJ.s, behind: PJ.dz <= 0.3 };
  }
  function floatAt(text, wx, wy, Z, color, size) {
    if (!W) return;
    var p = project(wx, wy, Z);
    A.floatText(text, p.x, p.y, color, size);
  }
  function fogA(dz) {
    return A.clamp((VIEW - dz) / 24, 0, 1);
  }
  /** Yoldaki nesne: uzakta pusla, koşucunun gerisinde kameraya yaklaşırken söner. */
  function roadA(dz) {
    return fogA(dz) * A.clamp((dz - 3) / 2.5, 0, 1);
  }

  function resize(w, h) {
    W = w;
    H = h;
    if (!player) resetWorld();
    layout();
  }

  /* ─────────────── temalar: gündüz → gün batımı → gece ─────────────── */

  var THEMES = {
    day: {
      sky: ["#1E66F5", "#3DA2FF", "#7AD6FF"], haze: "#7FD3FF", far: ["#4F63E0", "#6A55DD", "#3F86EE"], farWin: "#C4ECFF", farCap: "#3A48B8",
      bowl: "#4B3FC0", grassA: "#5FD35F", grassB: "#4AC24F", walk: "#BDB3FF", walkLine: "#9C8FF0", plaza: "#7062D8",
      board: ["#DB2777", "#7C3AED"], walls: ["#FF6B6B", "#FFB443", "#5B8CFF", "#9B6BFF", "#22C3AE", "#FF74B1"],
      win: "#A6E3FF", winLine: "#FFFFFF", lit: "#FFE7A3", litP: 0.06, shop: "#2A2470", tree: "#2FBF5A", treeD: "#23A04A", lamp: 0, star: 0,
    },
    sunset: {
      sky: ["#2A1878", "#B0358E", "#FF8A3D"], haze: "#FF8F5A", far: ["#67308E", "#86308A", "#4F2F8C"], farWin: "#FFC56B", farCap: "#45206E",
      bowl: "#4A2580", grassA: "#58CB57", grassB: "#45B94B", walk: "#C98BD6", walkLine: "#A86DBC", plaza: "#6E3A98",
      board: ["#F43F5E", "#7C3AED"], walls: ["#C2456F", "#7A3E9D", "#E0664A", "#5B3399", "#C2398F", "#8C4FC9"],
      win: "#4F2A74", winLine: "#3A1F5C", lit: "#FFD27A", litP: 0.45, shop: "#2A1650", tree: "#36A65A", treeD: "#2A8A4A", lamp: 0.6, star: 0.25,
    },
    night: {
      sky: ["#120E44", "#2A1C6E", "#5E2B8C"], haze: "#4A2B88", far: ["#3A2A80", "#4B3399", "#2E3A8F"], farWin: "#FFD98A", farCap: "#2C2068",
      bowl: "#2B2272", grassA: "#4CC552", grassB: "#3BB54A", walk: "#5546AE", walkLine: "#43379A", plaza: "#251F66",
      board: ["#DB2777", "#7C3AED"], walls: ["#3A2A80", "#4B3399", "#2E3A8F", "#5A2E8F", "#35318A", "#46308C"],
      win: "#251E62", winLine: "#1B1648", lit: "#FFD98A", litP: 0.5, shop: "#160F40", tree: "#2E5EA8", treeD: "#244A8C", lamp: 1, star: 1,
    },
  };
  var thA = "day", thB = "day", thK = 1, palKey = "", PAL = THEMES.day;
  function setTheme(name, instant) {
    if (!THEMES[name] || (name === thB && thK >= 1)) return;
    thA = instant ? name : thB;
    thB = name;
    thK = instant ? 1 : 0;
  }
  function palette() {
    var key = thA + thB + Math.round(thK * 40);
    if (key === palKey) return PAL;
    palKey = key;
    var a = THEMES[thA], b = THEMES[thB], k = A.smooth(thK), o = {};
    Object.keys(b).forEach(function (n) {
      var va = a[n], vb = b[n];
      if (typeof vb === "number") o[n] = va + (vb - va) * k;
      else if (Array.isArray(vb)) o[n] = vb.map(function (v, i) { return mixc(va[i], v, k); });
      else o[n] = mixc(va, vb, k);
    });
    PAL = o;
    return o;
  }

  /* ─────────────── önbellek: gökyüzü, sprite'lar ─────────────── */

  var cache = {}; // kadroya bağlı sprite'lar (kadro değişince boşalır)
  var skies = {};
  var SKY_M = 70; // gökyüzü katmanının yatay payı (bükülme kayması için)

  /** Gökyüzü + uzak şehir + bulvarın sonundaki stadyum (tema başına bir kez). */
  function skyLayer(name) {
    var key = name + ":" + W + "x" + H;
    if (skies[name] && skies[name].key === key) return skies[name];
    var th = THEMES[name];
    var w = W + SKY_M * 2, h = Math.max(20, Math.round(V.yV + 6));
    var L = A.layer(w, h);
    L.key = key;
    var c = L.ctx;
    var rnd = A.seeded(77);
    var g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, th.sky[0]);
    g.addColorStop(0.55, th.sky[1]);
    g.addColorStop(1, th.sky[2]);
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    if (th.star > 0) {
      c.fillStyle = "#FFFFFF";
      for (var i = 0; i < 40; i++) {
        c.globalAlpha = th.star * (0.35 + rnd() * 0.55);
        c.beginPath();
        c.arc(rnd() * w, rnd() * h * 0.55, rnd() < 0.2 ? 2 : 1.2, 0, Math.PI * 2);
        c.fill();
      }
      c.globalAlpha = 1;
    }
    var base = h - 2;
    var mx = SKY_M + W * 0.76;
    if (name === "night") {
      var mr = A.clamp(Math.min(W, h) * 0.17, 20, 60), my = h * 0.3;
      var mg = c.createRadialGradient(mx, my, mr * 0.8, mx, my, mr * 2.2);
      mg.addColorStop(0, "rgba(255,225,150,0.3)");
      mg.addColorStop(1, "rgba(255,225,150,0)");
      c.fillStyle = mg;
      c.fillRect(mx - mr * 2.3, my - mr * 2.3, mr * 4.6, mr * 4.6);
      c.fillStyle = "#F7DA94";
      c.beginPath();
      c.arc(mx, my, mr, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = "rgba(214,170,90,0.35)";
      [[-0.3, -0.25, 0.18], [0.25, 0.1, 0.13], [-0.05, 0.38, 0.1]].forEach(function (q) {
        c.beginPath();
        c.arc(mx + q[0] * mr, my + q[1] * mr, q[2] * mr, 0, Math.PI * 2);
        c.fill();
      });
    } else if (name === "sunset") {
      var sr = A.clamp(W * 0.2, 50, 130), sy = base - h * 0.18;
      var sg = c.createRadialGradient(SKY_M + W * 0.5, sy, sr * 0.6, SKY_M + W * 0.5, sy, sr * 2.4);
      sg.addColorStop(0, "rgba(255,214,90,0.6)");
      sg.addColorStop(1, "rgba(255,140,60,0)");
      c.fillStyle = sg;
      c.fillRect(0, 0, w, h);
      c.fillStyle = "#FFD43B";
      c.beginPath();
      c.arc(SKY_M + W * 0.5, sy, sr, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = "rgba(255,120,80,0.55)";
      for (var b2 = 0; b2 < 4; b2++) c.fillRect(SKY_M + W * 0.5 - sr, sy + sr * (0.15 + b2 * 0.2), sr * 2, sr * 0.07);
    } else {
      // gündüz: parlak güneş + düz çizgi film bulutlar
      var gr = A.clamp(W * 0.07, 16, 34), gy = h * 0.2;
      var gg = c.createRadialGradient(mx, gy, gr * 0.5, mx, gy, gr * 3);
      gg.addColorStop(0, "rgba(255,240,170,0.75)");
      gg.addColorStop(1, "rgba(255,240,170,0)");
      c.fillStyle = gg;
      c.fillRect(mx - gr * 3, gy - gr * 3, gr * 6, gr * 6);
      c.fillStyle = "#FFE45C";
      c.beginPath();
      c.arc(mx, gy, gr, 0, Math.PI * 2);
      c.fill();
      [[0.12, 0.22, 1], [0.42, 0.12, 0.8], [0.62, 0.36, 0.7], [0.95, 0.3, 0.9]].forEach(function (q) {
        var cx = SKY_M + q[0] * W, cy = q[1] * h, k = q[2] * A.clamp(W / 390, 0.8, 1.6);
        c.fillStyle = "#D9F1FF";
        c.beginPath();
        c.ellipse(cx, cy + 6 * k, 46 * k, 11 * k, 0, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = "#FFFFFF";
        c.beginPath();
        c.arc(cx - 22 * k, cy, 13 * k, 0, Math.PI * 2);
        c.arc(cx, cy - 7 * k, 18 * k, 0, Math.PI * 2);
        c.arc(cx + 22 * k, cy + 1 * k, 12 * k, 0, Math.PI * 2);
        c.ellipse(cx, cy + 4 * k, 40 * k, 9 * k, 0, 0, Math.PI * 2);
        c.fill();
      });
    }
    // uzak şehir: üç kat bina, yanan pencereler (Savunma'nın silüeti)
    function buildings(color, cap, hMin, hMax, wMin, wMax, lit, seed) {
      var r2 = A.seeded(seed);
      var x = -r2() * 30;
      while (x < w) {
        var bw = wMin + r2() * (wMax - wMin);
        var bh = (hMin + r2() * (hMax - hMin)) * h;
        var by = base - bh;
        c.fillStyle = color;
        c.fillRect(x, by, bw, bh + 2);
        c.fillStyle = cap;
        c.fillRect(x - 3, by - 5, bw + 6, 7);
        c.fillStyle = rgba(NAVY, 0.22);
        c.fillRect(x + bw - bw * 0.12, by, bw * 0.12, bh);
        var ww = Math.max(4, bw * 0.14), wh = ww * 1.25, gx = ww * 0.9, gy2 = wh * 0.75;
        for (var wy = by + 9; wy < base - wh - 3; wy += wh + gy2)
          for (var wx = x + ww * 0.8; wx < x + bw - ww * 1.6; wx += ww + gx) {
            c.fillStyle = r2() < lit ? th.farWin : rgba(NAVY, 0.35);
            A.roundRect(c, wx, wy, ww, wh, 1.5);
            c.fill();
          }
        x += bw + 4 + r2() * 14;
      }
    }
    buildings(th.far[0], th.farCap, 0.32, 0.62, 40, 80, name === "day" ? 0.55 : 0.3, 7);
    buildings(th.far[1], th.farCap, 0.2, 0.42, 36, 66, name === "day" ? 0.55 : 0.45, 19);
    // bulvarın sonunda stadyum: kase, tribün ışıkları, projektör kuleleri
    var cx2 = SKY_M + W / 2, bwid = A.clamp(W * 0.62, 180, 420), bh2 = A.clamp(h * 0.2, 26, 70);
    [-1, 1].forEach(function (sd) {
      var px = cx2 + sd * bwid * 0.47, py = base - bh2 - h * 0.28;
      c.fillStyle = th.farCap;
      c.fillRect(px - 2.5, py, 5, base - py);
      var lg = c.createRadialGradient(px, py, 2, px, py, 70);
      lg.addColorStop(0, "rgba(255,250,220,0.7)");
      lg.addColorStop(1, "rgba(255,250,220,0)");
      c.fillStyle = lg;
      c.fillRect(px - 70, py - 70, 140, 140);
      c.fillStyle = "#2B2268";
      A.roundRect(c, px - 15, py - 9, 30, 16, 4);
      c.fill();
      c.fillStyle = "#FFF6D0";
      for (var li = 0; li < 3; li++) {
        c.beginPath();
        c.arc(px - 8 + li * 8, py - 1, 3, 0, Math.PI * 2);
        c.fill();
      }
    });
    c.beginPath();
    c.moveTo(cx2 - bwid / 2, base);
    c.lineTo(cx2 - bwid / 2 + 8, base - bh2);
    c.quadraticCurveTo(cx2, base - bh2 * 1.35, cx2 + bwid / 2 - 8, base - bh2);
    c.lineTo(cx2 + bwid / 2, base);
    c.closePath();
    c.fillStyle = th.bowl;
    c.fill();
    c.lineWidth = 3;
    c.strokeStyle = NAVY;
    c.stroke();
    c.fillStyle = rgba("#FFFFFF", 0.14);
    for (var t2 = 1; t2 < 4; t2++) c.fillRect(cx2 - bwid / 2 + 6 + t2 * 3, base - bh2 + t2 * bh2 * 0.24, bwid - 12 - t2 * 6, 2);
    c.fillStyle = "#FFF3C4";
    for (var d2 = 0; d2 < 22; d2++) {
      var u = (d2 + 0.5) / 22;
      var lx = cx2 - bwid / 2 + 10 + u * (bwid - 20);
      var ly = base - bh2 - Math.sin(u * Math.PI) * bh2 * 0.17 + 3;
      c.beginPath();
      c.arc(lx, ly, 1.8, 0, Math.PI * 2);
      c.fill();
    }
    // ufuk pusu
    var hz = c.createLinearGradient(0, base - 50, 0, h);
    hz.addColorStop(0, rgba(th.haze, 0));
    hz.addColorStop(1, rgba(th.haze, 0.55));
    c.fillStyle = hz;
    c.fillRect(0, base - 50, w, h - base + 50);
    skies[name] = L;
    return L;
  }

  var glows = {};
  function glow(color) {
    if (glows[color]) return glows[color];
    var L = A.layer(64, 64);
    var g = L.ctx.createRadialGradient(32, 32, 1, 32, 32, 32);
    g.addColorStop(0, rgba(color, 0.95));
    g.addColorStop(0.4, rgba(color, 0.4));
    g.addColorStop(1, rgba(color, 0));
    L.ctx.fillStyle = g;
    L.ctx.fillRect(0, 0, 64, 64);
    glows[color] = L;
    return L;
  }
  function drawGlow(c, color, x, y, r, a) {
    if (a <= 0.01 || r < 1) return;
    var L = glow(color);
    c.save();
    c.globalAlpha = a;
    c.globalCompositeOperation = "lighter";
    c.drawImage(L.canvas, x - r, y - r, r * 2, r * 2);
    c.restore();
  }

  /** Parlak çizgi film altın: yüz ve kenar sprite'ı. */
  var coinFace = null, coinEdge = null;
  function coinSprites() {
    if (coinFace) return;
    coinFace = A.layer(48, 48);
    var c = coinFace.ctx;
    var g = c.createLinearGradient(0, 4, 0, 44);
    g.addColorStop(0, "#FFEE7A");
    g.addColorStop(0.55, "#FFC21A");
    g.addColorStop(1, "#F08C00");
    c.beginPath();
    c.arc(24, 24, 20.5, 0, Math.PI * 2);
    c.fillStyle = g;
    c.fill();
    c.lineWidth = 3.2;
    c.strokeStyle = NAVY;
    c.stroke();
    c.beginPath();
    c.arc(24, 24, 14, 0, Math.PI * 2);
    c.lineWidth = 2.4;
    c.strokeStyle = "#D97706";
    c.stroke();
    // yıldız kabartma
    c.beginPath();
    for (var i = 0; i < 10; i++) {
      var r = i % 2 ? 4.2 : 9, a = (i * Math.PI) / 5 - Math.PI / 2;
      c.lineTo(24 + Math.cos(a) * r, 25 + Math.sin(a) * r);
    }
    c.closePath();
    c.fillStyle = "#FFF4B8";
    c.fill();
    c.lineWidth = 1.6;
    c.strokeStyle = "#E08A00";
    c.stroke();
    c.fillStyle = "rgba(255,255,255,0.75)";
    c.beginPath();
    c.ellipse(16, 14, 6, 3.4, -0.7, 0, Math.PI * 2);
    c.fill();
    coinEdge = A.layer(48, 48);
    c = coinEdge.ctx;
    c.beginPath();
    c.arc(24, 24, 20.5, 0, Math.PI * 2);
    c.fillStyle = "#C26A00";
    c.fill();
    c.lineWidth = 3.2;
    c.strokeStyle = NAVY;
    c.stroke();
  }
  function drawCoin(c, x, y, r, phase, a) {
    coinSprites();
    var w = Math.cos(phase);
    var aw = Math.max(0.12, Math.abs(w));
    c.globalAlpha = a;
    var th = r * 0.32 * Math.sqrt(1 - w * w);
    if (th > 0.4) c.drawImage(coinEdge.canvas, x - r * aw + (w > 0 ? th : -th), y - r, r * 2 * aw, r * 2);
    c.drawImage(coinFace.canvas, x - r * aw, y - r, r * 2 * aw, r * 2);
    c.globalAlpha = 1;
  }

  /** Güç rozeti: beyaz yuvarlak kart, renkli simge. */
  function badgeSprite(type) {
    var key = "badge:" + type;
    if (cache[key]) return cache[key];
    var L = A.layer(64, 64), c = L.ctx;
    A.roundRect(c, 5, 8, 54, 54, 15);
    c.fillStyle = "rgba(20,16,67,0.45)";
    c.fill();
    A.roundRect(c, 5, 4, 54, 54, 15);
    c.fillStyle = "#FFFFFF";
    c.fill();
    c.lineWidth = 3.5;
    c.strokeStyle = NAVY;
    c.stroke();
    c.beginPath();
    c.arc(32, 31, 19, 0, Math.PI * 2);
    c.fillStyle = rgba(POWERS[type].color, 0.2);
    c.fill();
    drawPower(c, type, 32, 31, 15, POWERS[type].color);
    c.fillStyle = "rgba(255,255,255,0.6)";
    A.roundRect(c, 12, 9, 22, 5, 2.5);
    c.fill();
    cache[key] = L;
    return L;
  }

  /** Takımın pankartı (altından kayılır). */
  function bannerSprite(o) {
    var kit = teamKit(o);
    var key = "ban:" + (o.team && o.team.id) + kit.p + kit.s;
    if (cache[key]) return cache[key];
    var L = A.layer(220, 128), c = L.ctx;
    var name = String((o.team && o.team.name) || "RAKİP").toLocaleUpperCase("tr-TR");
    var g = c.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, mixc(kit.p, "#FFFFFF", 0.18));
    g.addColorStop(1, kit.p);
    c.fillStyle = g;
    c.fillRect(0, 0, 220, 128);
    c.fillStyle = kit.s;
    c.fillRect(0, 84, 220, 10);
    c.fillStyle = NAVY;
    c.fillRect(0, 94, 220, 34);
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.font = A.font(34, 900);
    var fs = 34;
    while (fs > 14 && c.measureText(name).width > 200) {
      fs -= 2;
      c.font = A.font(fs, 900);
    }
    c.lineJoin = "round";
    c.lineWidth = 6;
    c.strokeStyle = NAVY;
    c.strokeText(name, 110, 45);
    c.fillStyle = "#FFFFFF";
    c.fillText(name, 110, 45);
    c.font = A.font(17, 900);
    c.fillStyle = GOLD;
    c.fillText("▼ ALTINDAN KAY ▼", 110, 112);
    c.fillStyle = "rgba(255,255,255,0.22)";
    c.fillRect(0, 0, 220, 10);
    cache[key] = L;
    return L;
  }

  /** Takım otobüsünün önü. */
  function busFront(o) {
    var kit = teamKit(o);
    var key = "busf:" + (o.team && o.team.id) + kit.p + kit.s;
    if (cache[key]) return cache[key];
    var L = A.layer(120, 170), c = L.ctx;
    var name = String((o.team && o.team.name) || "RAKİP").toLocaleUpperCase("tr-TR");
    A.roundRect(c, 3, 3, 114, 164, 16);
    var g = c.createLinearGradient(0, 0, 120, 0);
    g.addColorStop(0, mixc(kit.p, "#FFFFFF", 0.15));
    g.addColorStop(1, kit.p);
    c.fillStyle = g;
    c.fill();
    // hedef tabelası
    A.roundRect(c, 14, 12, 92, 18, 5);
    c.fillStyle = NAVY;
    c.fill();
    c.font = A.font(12, 900);
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillStyle = "#FFB020";
    var nm = name;
    while (nm.length > 3 && c.measureText(nm).width > 84) nm = nm.slice(0, -2) + "…";
    c.fillText(nm, 60, 21.5);
    // ön cam
    A.roundRect(c, 10, 36, 100, 66, 10);
    var gw = c.createLinearGradient(0, 36, 0, 102);
    gw.addColorStop(0, "#8FD8FF");
    gw.addColorStop(1, "#2B5FB8");
    c.fillStyle = gw;
    c.fill();
    c.lineWidth = 3.5;
    c.strokeStyle = NAVY;
    c.stroke();
    c.fillStyle = "rgba(255,255,255,0.5)";
    c.beginPath();
    c.moveTo(22, 40);
    c.lineTo(48, 40);
    c.lineTo(30, 98);
    c.lineTo(14, 98);
    c.closePath();
    c.fill();
    // şerit + ızgara + farlar
    c.fillStyle = kit.s;
    c.fillRect(3, 108, 114, 9);
    A.roundRect(c, 34, 124, 52, 22, 5);
    c.fillStyle = NAVY;
    c.fill();
    c.fillStyle = "rgba(255,255,255,0.25)";
    for (var i = 0; i < 4; i++) c.fillRect(38, 128 + i * 4.5, 44, 2);
    [22, 98].forEach(function (x) {
      c.beginPath();
      c.arc(x, 135, 9, 0, Math.PI * 2);
      c.fillStyle = "#FFF6C8";
      c.fill();
      c.lineWidth = 3;
      c.strokeStyle = NAVY;
      c.stroke();
    });
    A.roundRect(c, 3, 3, 114, 164, 16);
    c.lineWidth = 5;
    c.strokeStyle = NAVY;
    c.stroke();
    cache[key] = L;
    return L;
  }

  /** Yolun üstündeki kemer pankartı. */
  function archSprite() {
    var key = "arch:" + level;
    if (cache[key]) return cache[key];
    var L = A.layer(400, 64), c = L.ctx;
    var mk = kitHex(runner);
    A.roundRect(c, 2, 2, 396, 60, 14);
    var g = c.createLinearGradient(0, 0, 400, 0);
    g.addColorStop(0, "#DB2777");
    g.addColorStop(0.5, "#7C3AED");
    g.addColorStop(1, "#4F46E5");
    c.fillStyle = g;
    c.fill();
    c.lineWidth = 4;
    c.strokeStyle = NAVY;
    c.stroke();
    c.fillStyle = "rgba(255,255,255,0.22)";
    A.roundRect(c, 12, 7, 376, 9, 4.5);
    c.fill();
    c.fillStyle = mk.p;
    c.beginPath();
    c.arc(30, 33, 13, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = "#FFFFFF";
    c.lineWidth = 3;
    c.stroke();
    c.font = A.font(28, 900);
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.lineJoin = "round";
    c.lineWidth = 6;
    c.strokeStyle = NAVY;
    var t = "ELİTLİG ARENA · SEVİYE " + level;
    c.strokeText(t, 214, 34, 330);
    c.fillStyle = "#FFFFFF";
    c.fillText(t, 214, 34, 330);
    cache[key] = L;
    return L;
  }

  /* ─────────────── karakterler ─────────────── */

  var SKINS = ["#F6C9A4", "#E9B08A", "#C98D63", "#8E5B3C", "#F3D3B8"];
  var HAIRS = ["#2B1B12", "#5A3418", "#141414", "#8A5426", "#E2B04A"];
  function limb(c, x1, y1, x2, y2, w, col, lw) {
    c.strokeStyle = NAVY;
    c.lineWidth = w + lw * 2;
    c.beginPath();
    c.moveTo(x1, y1);
    c.lineTo(x2, y2);
    c.stroke();
    c.strokeStyle = col;
    c.lineWidth = w;
    c.beginPath();
    c.moveTo(x1, y1);
    c.lineTo(x2, y2);
    c.stroke();
  }
  function blob(c, x, y, r, fill, lw) {
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fillStyle = fill;
    c.fill();
    if (lw) {
      c.lineWidth = lw;
      c.strokeStyle = NAVY;
      c.stroke();
    }
  }
  function lookOf(id) {
    return Math.floor(hash(Number(id) || 0, 7) * 25);
  }

  /**
   * Tıknaz çizgi film futbolcu, önden ya da arkadan. (x, y) ayak ortası,
   * s = metre başına piksel; boy ≈ 1,9 m (70 birim), kafa büyük.
   * o: kit{p,s}, view "back"|"front", pose, t, look, num, rot, flash.
   */
  function drawMan(c, x, y, s, o) {
    var k = (s * 1.9) / 70;
    if (k < 0.04) return;
    var back = o.view === "back", pose = o.pose || "run", t = o.t || 0, fl = o.flash || 0;
    function C(h) {
      return fl ? mixc(h, "#FFFFFF", fl) : h;
    }
    var look = o.look || 0;
    var skin = C(SKINS[look % 5]), hair = C(HAIRS[Math.floor(look / 5) % 5]);
    var prim = C(o.kit.p), sec = C(o.kit.s), boots = C(o.boots || NAVY);
    var fLx = -6.5, fLy = 0, fRx = 6.5, fRy = 0, hLx = -17, hLy = -33, hRx = 17, hRy = -33, by = 0, sy = 1, brow = 0, mouth = 0;
    var sn = Math.sin(t);
    if (pose === "run") {
      fLy = -Math.max(0, sn) * 11;
      fRy = -Math.max(0, -sn) * 11;
      by = -Math.abs(sn) * 2.5;
      hLy = -34 + sn * 6;
      hRy = -34 - sn * 6;
      hLx = -17 - Math.abs(sn) * 1.5;
      hRx = 17 + Math.abs(sn) * 1.5;
    } else if (pose === "jump") {
      fLx = -9;
      fRx = 9;
      fLy = -10;
      fRy = -7;
      hLx = -20;
      hRx = 20;
      hLy = -66;
      hRy = -63;
      mouth = 3;
    } else if (pose === "slide") {
      sy = 0.6;
      fLx = -12;
      fRx = 12;
      hLx = -26;
      hRx = 26;
      hLy = -42;
      hRy = -40;
    } else if (pose === "ready") {
      fLx = -10;
      fRx = 10;
      by = 3 + Math.sin(t * 3) * 0.9;
      hLx = -21;
      hRx = 21;
      hLy = -30;
      hRy = -30;
      brow = 1;
    } else if (pose === "wall") {
      fLx = -12;
      fRx = 12;
      by = 2;
      hLx = -34;
      hRx = 34;
      hLy = -55 + Math.sin(t * 5) * 2.5;
      hRy = -55 - Math.sin(t * 5) * 2.5;
      brow = 1;
      mouth = 1;
    } else if (pose === "tackle") {
      sy = 0.62;
      fLx = -9;
      fRx = 10;
      fLy = 4;
      fRy = 5;
      hLx = -25;
      hRx = 23;
      hLy = -58;
      hRy = -52;
      brow = 1;
      mouth = 1;
    } else if (pose === "fall") {
      fLx = -10;
      fRx = 10;
      hLx = -25;
      hRx = 25;
      hLy = -60;
      hRy = -58;
      mouth = 2;
    }
    c.save();
    c.translate(x, y);
    c.scale(k, k * sy);
    if (o.rot) c.rotate(o.rot);
    c.lineJoin = "round";
    c.lineCap = "round";
    var LW = A.clamp(2.3 / k, 1.7, 3.6);
    var hipY = -25 + by;
    // bacaklar: ten + çorap + krampon
    function leg(sx, fx, fy) {
      var hx = sx * 5.5;
      limb(c, hx, hipY, fx, fy - 3, 7.5, skin, LW);
      var mx = (hx + fx) / 2, my = (hipY + fy - 3) / 2 + 2;
      limb(c, mx, my, fx, fy - 3, 8.2, prim, LW);
      c.beginPath();
      c.ellipse(fx, fy - 1.5, 5.4, 3.8, 0, 0, Math.PI * 2);
      c.fillStyle = boots;
      c.fill();
      c.lineWidth = LW;
      c.strokeStyle = NAVY;
      c.stroke();
      if (back && fy < -3) {
        c.fillStyle = "#E2E8F0";
        c.beginPath();
        c.ellipse(fx, fy - 0.8, 3.4, 2, 0, 0, Math.PI * 2);
        c.fill();
      }
    }
    leg(-1, fLx, fLy);
    leg(1, fRx, fRy);
    // şort
    A.roundRect(c, -12.5, hipY - 4, 25, 11, 4);
    c.fillStyle = sec;
    c.fill();
    c.lineWidth = LW;
    c.strokeStyle = NAVY;
    c.stroke();
    // gövde
    var ty = hipY - 23;
    A.roundRect(c, -13.5, ty, 27, 22, 9);
    c.fillStyle = prim;
    c.fill();
    c.save();
    c.clip();
    if (back) {
      if (o.num != null) {
        c.font = A.font(13, 900);
        c.textAlign = "center";
        c.textBaseline = "middle";
        c.fillStyle = sec;
        c.fillText(String(o.num), 0, ty + 12.5);
      }
    } else {
      c.fillStyle = sec;
      c.fillRect(-2, ty - 1, 4, 24);
    }
    c.fillStyle = "rgba(255,255,255,0.28)";
    A.roundRect(c, -10.5, ty + 3, 4.5, 9, 2.2);
    c.fill();
    c.fillStyle = "rgba(20,16,67,0.18)";
    c.fillRect(-14, ty + 16, 28, 6);
    c.restore();
    A.roundRect(c, -13.5, ty, 27, 22, 9);
    c.lineWidth = LW;
    c.strokeStyle = NAVY;
    c.stroke();
    // kollar
    function arm(sx, hx, hy) {
      var shx = sx * 12, shy = ty + 4;
      limb(c, shx, shy, hx, hy, 5.6, skin, LW);
      var mx = shx + (hx - shx) * 0.42, my = shy + (hy - shy) * 0.42;
      limb(c, shx, shy, mx, my, 8.4, prim, LW);
      blob(c, hx, hy, 3.8, skin, LW * 0.8);
    }
    arm(-1, hLx, hLy);
    arm(1, hRx, hRy);
    // kafa
    var hx = 0, hy = ty - 13, hr = 15;
    blob(c, hx - hr + 0.5, hy + 1.5, 3.6, skin, LW * 0.8);
    blob(c, hx + hr - 0.5, hy + 1.5, 3.6, skin, LW * 0.8);
    blob(c, hx, hy, hr, skin, 0);
    c.save();
    c.beginPath();
    c.arc(hx, hy, hr, 0, Math.PI * 2);
    c.clip();
    c.fillStyle = hair;
    c.beginPath();
    if (back) c.ellipse(hx, hy - 3.5, hr * 1.06, hr * 0.9, 0, 0, Math.PI * 2);
    else c.ellipse(hx - 1.5, hy - 11, hr * 1.1, hr * 0.62, -0.08, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "rgba(255,255,255,0.18)";
    c.beginPath();
    c.ellipse(hx - 5, hy - 8, 5, 2.6, -0.5, 0, Math.PI * 2);
    c.fill();
    c.restore();
    c.beginPath();
    c.arc(hx, hy, hr, 0, Math.PI * 2);
    c.lineWidth = LW;
    c.strokeStyle = NAVY;
    c.stroke();
    if (!back) {
      if (mouth === 2) {
        c.lineWidth = 1.9;
        [-5.5, 5.5].forEach(function (ex) {
          c.beginPath();
          c.moveTo(hx + ex - 2.4, hy - 2.4);
          c.lineTo(hx + ex + 2.4, hy + 2.4);
          c.moveTo(hx + ex + 2.4, hy - 2.4);
          c.lineTo(hx + ex - 2.4, hy + 2.4);
          c.stroke();
        });
      } else {
        [-5.5, 5.5].forEach(function (ex) {
          c.fillStyle = NAVY;
          c.beginPath();
          c.ellipse(hx + ex, hy + 0.5, 2.2, 3.1, 0, 0, Math.PI * 2);
          c.fill();
          c.fillStyle = "#FFFFFF";
          c.beginPath();
          c.arc(hx + ex + 0.7, hy - 0.6, 0.85, 0, Math.PI * 2);
          c.fill();
        });
      }
      if (brow) {
        c.strokeStyle = NAVY;
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(hx - 9, hy - 6.5);
        c.lineTo(hx - 2.5, hy - 4.2);
        c.moveTo(hx + 9, hy - 6.5);
        c.lineTo(hx + 2.5, hy - 4.2);
        c.stroke();
      }
      c.fillStyle = "rgba(255,90,110,0.38)";
      c.beginPath();
      c.arc(hx - 9, hy + 5, 2.5, 0, Math.PI * 2);
      c.arc(hx + 9, hy + 5, 2.5, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = NAVY;
      c.lineWidth = 1.6;
      if (mouth === 1) {
        c.fillStyle = "#7A1F3D";
        c.beginPath();
        c.ellipse(hx, hy + 7.5, 3, 2.4, 0, 0, Math.PI * 2);
        c.fill();
        c.stroke();
      } else {
        c.beginPath();
        c.arc(hx, hy + 5, 3, 0.25, Math.PI - 0.25);
        c.stroke();
      }
    }
    c.restore();
  }

  /** Düz çizgi film top. */
  function flatBall(c, x, y, r, rot) {
    c.save();
    c.translate(x, y);
    c.beginPath();
    c.arc(0, 0, r, 0, Math.PI * 2);
    c.fillStyle = "#FFFFFF";
    c.fill();
    c.save();
    c.clip();
    c.fillStyle = NAVY;
    c.rotate(rot || 0);
    function pent(px, py, pr) {
      c.beginPath();
      for (var i = 0; i < 5; i++) {
        var a = (i / 5) * Math.PI * 2 - Math.PI / 2;
        c.lineTo(px + Math.cos(a) * pr, py + Math.sin(a) * pr);
      }
      c.closePath();
      c.fill();
    }
    pent(0, 0, r * 0.38);
    for (var j = 0; j < 5; j++) {
      var a2 = (j / 5) * Math.PI * 2 - Math.PI / 2;
      pent(Math.cos(a2) * r * 0.95, Math.sin(a2) * r * 0.95, r * 0.3);
    }
    c.restore();
    c.beginPath();
    c.arc(0, 0, r, 0, Math.PI * 2);
    c.lineWidth = Math.max(1, r * 0.16);
    c.strokeStyle = NAVY;
    c.stroke();
    c.fillStyle = "rgba(255,255,255,0.7)";
    c.beginPath();
    c.ellipse(-r * 0.35, -r * 0.42, r * 0.3, r * 0.18, -0.6, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }

  function shadow(c, x, y, rx, ry, a) {
    c.fillStyle = "rgba(20,14,70," + (0.3 * a).toFixed(3) + ")";
    c.beginPath();
    c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    c.fill();
  }

  /* ─────────────── zemin ─────────────── */

  var RZ = new Float64Array(100), RS = new Float64Array(100), RX = new Float64Array(100), RY = new Float64Array(100), RN = 0;
  function groundRows() {
    var cam = z - V.back;
    var n = 0;
    function add(Z) {
      pj(0, 0, Z);
      RZ[n] = Z;
      RS[n] = PJ.s;
      RX[n] = PJ.x;
      RY[n] = PJ.y;
      n++;
    }
    add(cam + VIEW);
    for (var Z = Math.floor((cam + VIEW) / 2) * 2; Z > cam + 0.6 && n < 98; Z -= 2) if (Z < cam + VIEW - 0.01) add(Z);
    add(cam + 0.5);
    RN = n;
  }
  /** x1..x2 şeridi (dünya) boyunca tek çokgen. */
  function strip(c, x1, x2) {
    c.beginPath();
    for (var i = 0; i < RN; i++) c.lineTo(RX[i] + x1 * RS[i], RY[i]);
    for (var j = RN - 1; j >= 0; j--) c.lineTo(RX[j] + x2 * RS[j], RY[j]);
    c.closePath();
  }
  /** Satır aralığı i..i+1 için x1..x2 dörtgeni (açık yola ekler). */
  function quadRow(c, i, x1, x2) {
    c.moveTo(RX[i] + x1 * RS[i], RY[i]);
    c.lineTo(RX[i] + x2 * RS[i], RY[i]);
    c.lineTo(RX[i + 1] + x2 * RS[i + 1], RY[i + 1]);
    c.lineTo(RX[i + 1] + x1 * RS[i + 1], RY[i + 1]);
    c.closePath();
  }
  function rowParity(i, period) {
    return Math.floor((RZ[i] + RZ[i + 1]) / 2 / period) & 1;
  }

  function drawGround(c, pal) {
    groundRows();
    c.fillStyle = pal.plaza;
    c.fillRect(-60, V.yV - 2, W + 120, H - V.yV + 80);
    // kaldırımlar + karo çizgileri
    c.fillStyle = pal.walk;
    strip(c, -SIDE - 0.3, -EDGE);
    c.fill();
    strip(c, EDGE, SIDE + 0.3);
    c.fill();
    c.beginPath();
    for (var i = 1; i < RN - 1; i++) {
      if (RS[i] < 2.5) continue;
      c.moveTo(RX[i] - SIDE * RS[i], RY[i]);
      c.lineTo(RX[i] - EDGE * RS[i], RY[i]);
      c.moveTo(RX[i] + EDGE * RS[i], RY[i]);
      c.lineTo(RX[i] + SIDE * RS[i], RY[i]);
    }
    c.strokeStyle = pal.walkLine;
    c.lineWidth = 1.2;
    c.stroke();
    // çim: biçme bantları
    c.fillStyle = pal.grassA;
    strip(c, -EDGE, EDGE);
    c.fill();
    c.beginPath();
    for (var j = 0; j < RN - 1; j++) if (rowParity(j, 4)) quadRow(c, j, -EDGE, EDGE);
    c.fillStyle = pal.grassB;
    c.fill();
    // koridor içi hafif şerit tonları (şeritler belli olsun)
    c.beginPath();
    for (var q = 0; q < RN - 1; q++) {
      quadRow(c, q, -LANE / 2 - 0.05, -LANE / 2 + 0.05);
    }
    c.fillStyle = "rgba(20,90,40,0.12)";
    c.fill();
    // şerit çizgileri (kesik)
    c.beginPath();
    for (var d = 0; d < RN - 1; d++) {
      if (RS[d] < 1.2 || !rowParity(d, 2.5)) continue;
      quadRow(c, d, -LANE / 2 - 0.08, -LANE / 2 + 0.08);
      quadRow(c, d, LANE / 2 - 0.08, LANE / 2 + 0.08);
    }
    c.fillStyle = "rgba(255,255,255,0.78)";
    c.fill();
    // kenar tebeşir çizgileri
    c.fillStyle = "rgba(255,255,255,0.95)";
    strip(c, -EDGE + 0.2, -EDGE + 0.36);
    c.fill();
    strip(c, EDGE - 0.36, EDGE - 0.2);
    c.fill();
    // bordür: beyaz + mor dama
    c.fillStyle = "#FFFFFF";
    strip(c, -EDGE - 0.32, -EDGE);
    c.fill();
    strip(c, EDGE, EDGE + 0.32);
    c.fill();
    c.beginPath();
    for (var b = 0; b < RN - 1; b++) {
      if (!rowParity(b, 2)) continue;
      quadRow(c, b, -EDGE - 0.32, -EDGE);
      quadRow(c, b, EDGE, EDGE + 0.32);
    }
    c.fillStyle = pal.board[1];
    c.fill();
    // bordür gölgesi (çimin kenarı)
    c.fillStyle = "rgba(20,16,67,0.22)";
    strip(c, -EDGE, -EDGE + 0.12);
    c.fill();
    strip(c, EDGE - 0.12, EDGE);
    c.fill();
    // koşucunun önündeki projektör ışığı
    pj(player.x, 0, z + 3);
    var gx = PJ.x, gy = PJ.y, gs = PJ.s;
    c.globalAlpha = 0.12 + 0.14 * pal.lamp;
    c.drawImage(glow("#FFFFDC").canvas, gx - gs * 4.5, gy - gs * 1.45, gs * 9, gs * 2.9);
    c.globalAlpha = 1;
  }

  /* ─────────────── kenar manzarası ─────────────── */

  var AWN = ["#FF4D6A", "#FFD43B", "#22C55E", "#38BDF8", "#FB923C"];
  function slotInfo(i, sd) {
    var h1 = hash(i, sd > 0 ? 11 : 3), h2 = hash(i, sd > 0 ? 17 : 5), h3 = hash(i, sd > 0 ? 23 : 9);
    var park = h3 < 0.2;
    var len = 9.5 + h1 * 3.2;
    return { park: park, z0: i * SLOT + (SLOT - len) / 2, len: len, h: 9 + h2 * 15, dep: 9, ci: Math.floor(h1 * 6) % 6, seed: i * 31 + (sd > 0 ? 7 : 0), awn: AWN[Math.floor(h2 * 5) % 5] };
  }

  function drawBuilding(c, b, sd, pal) {
    var cam = z - V.back;
    var Za = Math.max(b.z0, cam + 0.6), Zb = b.z0 + b.len;
    if (Zb <= Za + 0.1) return;
    var dzA = Za - cam;
    var fa = fogA(Zb - cam - 8);
    if (fa <= 0) return;
    var hz = A.clamp((dzA - 12) / (VIEW - 12), 0, 1) * 0.7;
    var base = pal.walls[b.ci];
    var wall = mixc(mixc(base, NAVY, 0.16), pal.haze, hz);
    var front = mixc(base, pal.haze, hz);
    var h = b.h, xi = sd * BLD, xo = sd * (BLD + b.dep);
    pj(xi, 0, Za);
    var ax = PJ.x, ay = PJ.y, as = PJ.s;
    pj(xi, 0, Zb);
    var bx = PJ.x, by = PJ.y, bs = PJ.s;
    var lw = A.clamp(as * 0.06, 0.8, 2.6);
    c.globalAlpha = fa;
    c.lineJoin = "round";
    // iç cephe (yola bakan)
    c.beginPath();
    c.moveTo(ax, ay);
    c.lineTo(ax, ay - h * as);
    c.lineTo(bx, by - h * bs);
    c.lineTo(bx, by);
    c.closePath();
    c.fillStyle = wall;
    c.fill();
    c.lineWidth = lw;
    c.strokeStyle = NAVY;
    c.stroke();
    // zemin kat: vitrin + tente
    function band(y1, y2, color) {
      c.beginPath();
      c.moveTo(ax, ay - y1 * as);
      c.lineTo(ax, ay - y2 * as);
      c.lineTo(bx, by - y2 * bs);
      c.lineTo(bx, by - y1 * bs);
      c.closePath();
      c.fillStyle = color;
      c.fill();
    }
    band(0.25, 2.3, mixc(pal.shop, pal.haze, hz));
    if (pal.lamp > 0.05) {
      c.globalAlpha = fa * pal.lamp * 0.5;
      band(0.4, 1.9, pal.lit);
      c.globalAlpha = fa;
    }
    band(2.3, 3.0, mixc(b.awn, pal.haze, hz));
    band(h - 0.7, h, mixc(wall, NAVY, 0.35));
    // pencereler (yakında): önce sönük, sonra yanan camlar tek yolda
    if (dzA < 105) {
      for (var pass = 0; pass < 2; pass++) {
        c.beginPath();
        var col = 0;
        for (var zw = b.z0 + 1.1; zw + 1.6 <= Zb - 0.6; zw += 2.9, col++) {
          if (zw < Za) continue;
          pj(xi, 0, zw);
          var x1 = PJ.x, y1 = PJ.y, s1 = PJ.s;
          pj(xi, 0, zw + 1.6);
          var x2 = PJ.x, y2 = PJ.y, s2 = PJ.s;
          var row = 0;
          for (var yw = 3.8; yw + 1.9 < h - 1.0; yw += 3.2, row++) {
            if ((hash(b.seed + col, row) < pal.litP) !== (pass === 1)) continue;
            c.moveTo(x1, y1 - yw * s1);
            c.lineTo(x1, y1 - (yw + 1.9) * s1);
            c.lineTo(x2, y2 - (yw + 1.9) * s2);
            c.lineTo(x2, y2 - yw * s2);
            c.closePath();
          }
        }
        if (pass === 0) {
          c.fillStyle = mixc(pal.win, pal.haze, hz * 0.6);
          c.fill();
          c.lineWidth = Math.max(0.6, lw * 0.55);
          c.strokeStyle = pal.winLine;
          c.stroke();
        } else {
          c.fillStyle = pal.lit;
          c.fill();
        }
      }
    }
    // ön yüz (kameraya bakan)
    if (b.z0 >= cam + 0.6) {
      pj(xo, 0, Za);
      var ox = PJ.x;
      var x0 = Math.min(ax, ox), wF = Math.abs(ox - ax), top = ay - h * as;
      c.fillStyle = front;
      c.fillRect(x0, top, wF, h * as);
      c.fillStyle = mixc(front, NAVY, 0.35);
      c.fillRect(x0, top, wF, 0.7 * as);
      c.fillStyle = rgba(NAVY, 0.2);
      c.fillRect(sd < 0 ? x0 : x0 + wF * 0.88, top, wF * 0.12, h * as);
      c.fillStyle = mixc(pal.shop, pal.haze, hz);
      c.fillRect(x0 + wF * 0.08, ay - 2.3 * as, wF * 0.84, 2.05 * as);
      c.fillStyle = mixc(b.awn, pal.haze, hz);
      c.fillRect(x0 + wF * 0.04, ay - 3.0 * as, wF * 0.92, 0.7 * as);
      if (dzA < 105 && as > 1.2) {
        var cols = 3, ww = (wF * 0.62) / cols, gap = (wF * 0.38) / (cols + 1);
        for (var fp = 0; fp < 2; fp++) {
          c.beginPath();
          for (var ci = 0; ci < cols; ci++)
            for (var yy = 3.8, r2 = 0; yy + 1.9 < h - 1.0; yy += 3.2, r2++) {
              if ((hash(b.seed + 50 + ci, r2) < pal.litP) !== (fp === 1)) continue;
              c.rect(x0 + gap + ci * (ww + gap), ay - (yy + 1.9) * as, ww, 1.9 * as);
            }
          if (fp === 0) {
            c.fillStyle = mixc(pal.win, pal.haze, hz * 0.6);
            c.fill();
            c.lineWidth = Math.max(0.6, lw * 0.55);
            c.strokeStyle = pal.winLine;
            c.stroke();
          } else {
            c.fillStyle = pal.lit;
            c.fill();
          }
        }
      }
      c.lineWidth = lw;
      c.strokeStyle = NAVY;
      c.strokeRect(x0, top, wF, h * as);
    }
    c.globalAlpha = 1;
  }

  function drawTree(c, x, y, s, a, pal, k) {
    if (s < 0.6) return;
    c.globalAlpha = a;
    var lw = A.clamp(s * 0.07, 0.8, 3);
    var tw = 0.35 * s * k, th = 2.6 * s * k;
    c.fillStyle = "#7A4A2A";
    c.fillRect(x - tw / 2, y - th, tw, th);
    c.lineWidth = lw;
    c.strokeStyle = NAVY;
    c.strokeRect(x - tw / 2, y - th, tw, th);
    var R1 = 1.9 * s * k, cy = y - th - R1 * 0.6;
    var circles = [[0, 0, 1], [-0.75, 0.35, 0.72], [0.78, 0.3, 0.7]];
    c.beginPath();
    circles.forEach(function (q) {
      c.moveTo(x + q[0] * R1 + q[2] * R1, cy + q[1] * R1);
      c.arc(x + q[0] * R1, cy + q[1] * R1, q[2] * R1, 0, Math.PI * 2);
    });
    c.lineWidth = lw * 2;
    c.stroke();
    c.fillStyle = pal.tree;
    c.fill();
    c.fillStyle = pal.treeD;
    c.beginPath();
    c.ellipse(x, cy + R1 * 0.55, R1 * 1.2, R1 * 0.4, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "rgba(255,255,255,0.22)";
    c.beginPath();
    c.arc(x - R1 * 0.35, cy - R1 * 0.4, R1 * 0.28, 0, Math.PI * 2);
    c.fill();
    c.globalAlpha = 1;
  }

  function drawLamp(c, sd, Z, pal) {
    pj(sd * (SIDE - 0.35), 0, Z);
    var x = PJ.x, y = PJ.y, s = PJ.s, a = fogA(PJ.dz);
    if (a <= 0 || s < 0.8) return;
    c.globalAlpha = a;
    var lw = A.clamp(s * 0.05, 0.8, 2.4);
    var top = y - 6 * s, arm = -sd * 1.3 * s;
    c.lineCap = "round";
    c.strokeStyle = NAVY;
    c.lineWidth = 0.22 * s + lw * 2;
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x, top + 0.4 * s);
    c.quadraticCurveTo(x, top, x + arm * 0.5, top);
    c.lineTo(x + arm, top);
    c.stroke();
    c.strokeStyle = "#3B3290";
    c.lineWidth = 0.22 * s;
    c.stroke();
    var bx = x + arm, byy = top + 0.18 * s;
    c.fillStyle = mixc("#E2E8F0", "#FFF6C8", pal.lamp);
    c.beginPath();
    c.ellipse(bx, byy, 0.42 * s, 0.22 * s, 0, 0, Math.PI * 2);
    c.fill();
    c.lineWidth = lw;
    c.strokeStyle = NAVY;
    c.stroke();
    c.globalAlpha = 1;
    if (pal.lamp > 0.05) drawGlow(c, "#FFE9A8", bx, byy + 0.2 * s, 2.6 * s, pal.lamp * 0.75 * a);
  }

  /** LED pano parçası: kaldırımın dış kenarında, yazılı. */
  function drawBoard(c, sd, j, pal) {
    var cam = z - V.back;
    var Z1 = Math.max(j * 6, cam + 0.6), Z2 = j * 6 + 5.85;
    if (Z2 <= Z1) return;
    var x = sd * SIDE, Hb = 0.95;
    pj(x, 0, Z1);
    var x1 = PJ.x, y1 = PJ.y, s1 = PJ.s;
    pj(x, 0, Z2);
    var x2 = PJ.x, y2 = PJ.y, s2 = PJ.s;
    var a = fogA(PJ.dz);
    if (a <= 0) return;
    c.globalAlpha = a;
    var col = pal.board[((j % 2) + 2) % 2];
    c.beginPath();
    c.moveTo(x1, y1);
    c.lineTo(x1, y1 - Hb * s1);
    c.lineTo(x2, y2 - Hb * s2);
    c.lineTo(x2, y2);
    c.closePath();
    c.fillStyle = col;
    c.fill();
    c.lineWidth = A.clamp(s1 * 0.05, 0.7, 2.2);
    c.strokeStyle = NAVY;
    c.stroke();
    // üst parlak kenar
    c.beginPath();
    c.moveTo(x1, y1 - Hb * s1);
    c.lineTo(x2, y2 - Hb * s2);
    c.lineTo(x2, y2 - (Hb - 0.14) * s2);
    c.lineTo(x1, y1 - (Hb - 0.14) * s1);
    c.closePath();
    c.fillStyle = "rgba(255,255,255,0.3)";
    c.fill();
    if (s1 > 5 && Z1 === j * 6) {
      // yazı: dörtgene yaklaşık afin eşleme (yakın uç → uzak uç)
      var nx = x1, ny = y1 - Hb * s1, fx = x2, fy = y2 - Hb * s2, hh = (Hb * (s1 + s2)) / 2;
      c.save();
      c.transform((fx - nx) / 100, (fy - ny) / 100, 0, hh / 20, nx, ny);
      if (sd > 0) {
        c.translate(100, 0);
        c.scale(-1, 1);
      }
      c.font = A.font(12.5, 900);
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillStyle = "#FFFFFF";
      c.fillText(j % 3 === 0 ? "SLALOM" : "ELİTLİG", 50, 11.5);
      c.restore();
    }
    c.globalAlpha = 1;
  }

  function drawArch(c, Z) {
    pj(0, 0, Z);
    var s = PJ.s, a = fogA(PJ.dz) * A.clamp((PJ.dz - 3) / 5, 0, 1);
    if (a <= 0) return;
    var cx = PJ.x, y = PJ.y, AH = 13.5;
    c.globalAlpha = a;
    var lw = A.clamp(s * 0.06, 0.8, 3);
    [-1, 1].forEach(function (sd) {
      var px = cx + sd * (SIDE - 0.3) * s, pw = 0.36 * s;
      c.fillStyle = "#F4F1FF";
      c.fillRect(px - pw / 2, y - AH * s, pw, AH * s);
      c.lineWidth = lw;
      c.strokeStyle = NAVY;
      c.strokeRect(px - pw / 2, y - AH * s, pw, AH * s);
    });
    var bw = (SIDE + 0.3) * 2 * s, bh = bw * (64 / 400);
    c.drawImage(archSprite().canvas, cx - bw / 2, y - AH * s - bh * 0.5, bw, bh);
    c.globalAlpha = 1;
  }

  /* ─────────────── engeller ─────────────── */

  /** Devrilen engelin uçuşu: TURBO/KALKAN ile devrilen ya da çarpılıp yıkılan. */
  function smashT(o) {
    if (o.smashed || (o.hit && o.type !== "bus")) {
      if (!o.dir) o.dir = o.lane === 0 ? (o.id % 2 ? 1 : -1) : o.lane;
      return A.clamp((A.time - o.at) / 0.6, 0, 1);
    }
    return 0;
  }

  function drawHurdle(c, o) {
    var t = smashT(o), dir = o.dir || 1;
    pj(laneX(o.lane) + dir * A.easeOut(t) * 5, Math.sin(t * Math.PI) * 1.6, o.z);
    var x = PJ.x, y = PJ.y, s = PJ.s, a = roadA(PJ.dz);
    if (a <= 0) return;
    pj(laneX(o.lane), 0, o.z);
    if (!t) shadow(c, PJ.x, PJ.y, 1.0 * s, 0.16 * s, a);
    c.save();
    c.globalAlpha = a;
    c.translate(x, y);
    var rot = -dir * t * 1.4;
    if (rot) c.rotate(rot);
    var lw = A.clamp(s * 0.05, 0.8, 2.6), hw = (LANE - 0.5) / 2;
    c.lineJoin = "round";
    [-1, 1].forEach(function (sd) {
      c.fillStyle = "#3B3290";
      c.fillRect((sd * (hw - 0.08) - 0.06) * s, -0.95 * s, 0.12 * s, 0.95 * s);
      c.lineWidth = lw;
      c.strokeStyle = NAVY;
      c.strokeRect((sd * (hw - 0.08) - 0.06) * s, -0.95 * s, 0.12 * s, 0.95 * s);
      A.roundRect(c, (sd * (hw - 0.08) - 0.22) * s, -0.1 * s, 0.44 * s, 0.1 * s, 0.05 * s);
      c.fillStyle = NAVY;
      c.fill();
    });
    [[0.72, 0.24], [0.36, 0.16]].forEach(function (b) {
      var by = -(b[0] + b[1]) * s, bh = b[1] * s;
      A.roundRect(c, -hw * s, by, hw * 2 * s, bh, bh / 2);
      c.save();
      c.clip();
      c.fillStyle = "#FFFFFF";
      c.fillRect(-hw * s, by, hw * 2 * s, bh);
      c.fillStyle = "#FF3D5E";
      var seg = (hw * 2 * s) / 7;
      for (var i = 0; i < 7; i += 2) c.fillRect(-hw * s + i * seg, by, seg, bh);
      c.fillStyle = "rgba(255,255,255,0.45)";
      c.fillRect(-hw * s, by + bh * 0.12, hw * 2 * s, bh * 0.22);
      c.restore();
      A.roundRect(c, -hw * s, by, hw * 2 * s, bh, bh / 2);
      c.lineWidth = lw;
      c.strokeStyle = NAVY;
      c.stroke();
    });
    c.restore();
  }

  function drawBar(c, o) {
    var t = smashT(o), dir = o.dir || 1;
    pj(laneX(o.lane) + dir * A.easeOut(t) * 5, Math.sin(t * Math.PI) * 1.6, o.z);
    var x = PJ.x, y = PJ.y, s = PJ.s, a = roadA(PJ.dz);
    if (a <= 0) return;
    pj(laneX(o.lane), 0, o.z);
    if (!t) shadow(c, PJ.x, PJ.y, 1.1 * s, 0.14 * s, a);
    c.save();
    c.globalAlpha = a;
    c.translate(x, y);
    var rot = -dir * t * 1.4;
    if (rot) c.rotate(rot);
    var lw = A.clamp(s * 0.05, 0.8, 2.6), hw = (LANE - 0.3) / 2;
    [-1, 1].forEach(function (sd) {
      var px = sd * (hw - 0.08) * s;
      c.fillStyle = "#F4F1FF";
      c.fillRect(px - 0.07 * s, -2.65 * s, 0.14 * s, 2.65 * s);
      c.lineWidth = lw;
      c.strokeStyle = NAVY;
      c.strokeRect(px - 0.07 * s, -2.65 * s, 0.14 * s, 2.65 * s);
    });
    var bw = hw * 2 * s, bh = 1.25 * s, top = -2.55 * s;
    c.drawImage(bannerSprite(o).canvas, -bw / 2, top, bw, bh);
    c.lineWidth = lw * 1.3;
    c.strokeStyle = NAVY;
    c.strokeRect(-bw / 2, top, bw, bh);
    c.restore();
  }

  function drawBus(c, o) {
    var cam = z - V.back;
    var t = smashT(o), dir = o.dir || 1;
    var lx = laneX(o.lane) + dir * A.easeOut(t) * 6, lift = Math.sin(t * Math.PI) * 1.6;
    var hw = (LANE - 0.25) / 2, y0 = 0.4 + lift, y1 = 3.3 + lift;
    var Zf = o.z - 4.5, Zb = o.z + 4.5;
    var Zn = Math.max(Zf, cam + 2.4);
    if (Zb <= Zn) return;
    var kit = teamKit(o);
    pj(lx, 0, Zf);
    var a = fogA(Zb - cam - 4);
    if (a <= 0) return;
    // koşucu otobüsün içinden geçiyorsa (çarpışma sonrası) otobüs saydamlaşır
    if (Math.abs(player.x - laneX(o.lane)) < 1.4 && z > Zf - 1.5 && z < Zb + 0.5) a *= 0.4;
    c.globalAlpha = a;
    var lwN = A.clamp(V.f / Math.max(1, Zn - cam) * 0.05, 0.8, 2.8);
    // gölge
    c.beginPath();
    pj(lx - hw - 0.2, 0, Zn);
    c.moveTo(PJ.x, PJ.y);
    pj(lx + hw + 0.2, 0, Zn);
    c.lineTo(PJ.x, PJ.y);
    pj(lx + hw + 0.2, 0, Zb + 0.3);
    c.lineTo(PJ.x, PJ.y);
    pj(lx - hw - 0.2, 0, Zb + 0.3);
    c.lineTo(PJ.x, PJ.y);
    c.closePath();
    c.fillStyle = "rgba(20,14,70,0.28)";
    c.fill();
    // görünen yan yüz
    var sideX = lx > V.cx + hw ? lx - hw : lx < V.cx - hw ? lx + hw : null;
    function P(x, y, Z) {
      pj(x, y, Z);
      return [PJ.x, PJ.y, PJ.s];
    }
    function quad(p1, p2, p3, p4, fill, stroke) {
      c.beginPath();
      c.moveTo(p1[0], p1[1]);
      c.lineTo(p2[0], p2[1]);
      c.lineTo(p3[0], p3[1]);
      c.lineTo(p4[0], p4[1]);
      c.closePath();
      c.fillStyle = fill;
      c.fill();
      if (stroke) {
        c.lineWidth = lwN;
        c.strokeStyle = NAVY;
        c.stroke();
      }
    }
    if (sideX != null) {
      quad(P(sideX, y0, Zn), P(sideX, y1, Zn), P(sideX, y1, Zb), P(sideX, y0, Zb), mixc(kit.p, NAVY, 0.18), true);
      quad(P(sideX, 1.2 + lift, Zn), P(sideX, 1.5 + lift, Zn), P(sideX, 1.5 + lift, Zb), P(sideX, 1.2 + lift, Zb), kit.s, false);
      // camlar
      c.beginPath();
      for (var wz2 = Zf + 1.2; wz2 + 1.3 < Zb - 0.4; wz2 += 1.65) {
        if (wz2 < Zn) continue;
        var q1 = P(sideX, 1.85 + lift, wz2), q2 = P(sideX, 2.95 + lift, wz2), q3 = P(sideX, 2.95 + lift, wz2 + 1.3), q4 = P(sideX, 1.85 + lift, wz2 + 1.3);
        c.moveTo(q1[0], q1[1]);
        c.lineTo(q2[0], q2[1]);
        c.lineTo(q3[0], q3[1]);
        c.lineTo(q4[0], q4[1]);
        c.closePath();
      }
      c.fillStyle = "#4FA6F0";
      c.fill();
      c.lineWidth = Math.max(0.6, lwN * 0.7);
      c.strokeStyle = NAVY;
      c.stroke();
      // tekerlekler
      [Zf + 1.7, Zb - 1.7].forEach(function (wz3) {
        if (wz3 < Zn) return;
        var w = P(sideX, 0.48 + lift, wz3);
        c.beginPath();
        c.ellipse(w[0], w[1], 0.3 * w[2], 0.48 * w[2], 0, 0, Math.PI * 2);
        c.fillStyle = "#1E1B4B";
        c.fill();
        c.lineWidth = lwN;
        c.strokeStyle = NAVY;
        c.stroke();
        c.fillStyle = "#CBD5E1";
        c.beginPath();
        c.ellipse(w[0], w[1], 0.13 * w[2], 0.22 * w[2], 0, 0, Math.PI * 2);
        c.fill();
      });
    }
    // tavan
    quad(P(lx - hw, y1, Zn), P(lx + hw, y1, Zn), P(lx + hw, y1, Zb), P(lx - hw, y1, Zb), mixc(kit.p, "#FFFFFF", 0.22), true);
    quad(P(lx - hw * 0.5, y1 + 0.02, Zn + 2), P(lx + hw * 0.5, y1 + 0.02, Zn + 2), P(lx + hw * 0.5, y1 + 0.02, Zn + 4), P(lx - hw * 0.5, y1 + 0.02, Zn + 4), mixc(kit.p, NAVY, 0.25), false);
    // ön yüz
    if (Zf >= cam + 2.4) {
      var f1 = P(lx - hw, y1, Zf), f2 = P(lx + hw, y0, Zf);
      // tampon ve ön tekerlekler
      var ch = P(lx - hw + 0.2, 0, Zf), ch2 = P(lx + hw - 0.2, y0, Zf);
      c.fillStyle = "#1E1B4B";
      c.fillRect(ch[0], ch2[1], ch2[0] - ch[0], ch[1] - ch2[1]);
      c.drawImage(busFront(o).canvas, f1[0], f1[1], f2[0] - f1[0], f2[1] - f1[1]);
      if (PAL.lamp > 0.05) {
        var r = f1[2];
        drawGlow(c, "#FFF6C8", f1[0] + (f2[0] - f1[0]) * 0.18, f1[1] + (f2[1] - f1[1]) * 0.8, 1.1 * r, PAL.lamp * a);
        drawGlow(c, "#FFF6C8", f1[0] + (f2[0] - f1[0]) * 0.82, f1[1] + (f2[1] - f1[1]) * 0.8, 1.1 * r, PAL.lamp * a);
      }
    }
    c.globalAlpha = 1;
  }

  function drawFoe(c, o) {
    var lx = laneX(o.lane), t = 0, rot = 0, lift = 0, pose = o.type === "wall" ? "wall" : "ready", fl = 0;
    if (o.smashed) {
      t = A.clamp((A.time - o.at) / 0.55, 0, 1);
      lx += (o.dir || 1) * A.easeOut(t) * 3.6;
      lift = Math.sin(t * Math.PI) * 1.2;
      rot = (o.dir || 1) * t * 1.6;
      pose = "fall";
      fl = (1 - t) * 0.5;
    } else if (o.hit) {
      t = A.clamp((A.time - o.at) / 0.4, 0, 1);
      rot = (o.lane >= 0 ? 1 : -1) * t * 0.9;
      pose = "fall";
    } else if (o.type === "tackler" && o.tackleAt) pose = "tackle";
    pj(lx, 0, o.z);
    var sx = PJ.x, sy = PJ.y, s = PJ.s, a = roadA(PJ.dz);
    if (a <= 0) return;
    shadow(c, sx, sy, 0.62 * s * (pose === "tackle" ? 1.4 : 1), 0.16 * s, a);
    pj(lx, lift, o.z);
    c.globalAlpha = a;
    var kit = teamKit(o);
    drawMan(c, PJ.x, PJ.y, s, { kit: kit, view: "front", pose: pose, t: A.time + o.id, look: lookOf(o.who && o.who.id), rot: rot, flash: fl });
    if (pose === "tackle") {
      // kayışın toz izi
      c.fillStyle = "rgba(220,255,200,0.55)";
      c.beginPath();
      c.ellipse(sx, sy - 0.05 * s, 0.9 * s, 0.14 * s, 0, 0, Math.PI * 2);
      c.fill();
    }
    c.globalAlpha = 1;
  }

  function drawCoinItem(c, co) {
    var tk = co.taken ? A.clamp((A.time - co.at) / 0.3, 0, 1) : 0;
    if (tk >= 1) return;
    var bob = Math.sin(A.time * 3 + co.z) * 0.06;
    pj(co.x, 0, co.z);
    var gx = PJ.x, gy = PJ.y, s = PJ.s, a = roadA(PJ.dz) * (1 - tk);
    if (a <= 0 || s < 0.5) return;
    if (!tk) shadow(c, gx, gy, 0.26 * s, 0.07 * s, a * 0.8);
    pj(co.x, co.y + bob + tk * 1.3, co.z);
    var r = 0.32 * s * (1 + tk * 0.4);
    if (PAL.lamp > 0.3 && s > 6) drawGlow(c, "#FFD24A", PJ.x, PJ.y, r * 2.4, 0.35 * a);
    drawCoin(c, PJ.x, PJ.y, r, A.time * 4 + co.z * 0.4, a);
  }

  function drawPickup(c, pk) {
    var tk = pk.taken ? A.clamp((A.time - pk.at) / 0.35, 0, 1) : 0;
    if (tk >= 1) return;
    pj(laneX(pk.lane), 0, pk.z);
    var gx = PJ.x, gy = PJ.y, s = PJ.s, a = roadA(PJ.dz) * (1 - tk);
    if (a <= 0) return;
    shadow(c, gx, gy, 0.42 * s, 0.1 * s, a);
    pj(laneX(pk.lane), 1.05 + Math.sin(A.time * 2.6 + pk.id) * 0.14 + tk * 1.5, pk.z);
    var size = 0.95 * s * (1 + Math.sin(A.time * 5) * 0.04) * (1 + tk);
    var col = POWERS[pk.type].color;
    drawGlow(c, col, PJ.x, PJ.y, size * 1.5, 0.75 * a);
    c.save();
    c.globalAlpha = a;
    c.translate(PJ.x, PJ.y);
    c.rotate(Math.sin(A.time * 2.2 + pk.id) * 0.14);
    c.drawImage(badgeSprite(pk.type).canvas, -size / 2, -size / 2, size, size);
    c.restore();
  }

  /* ─────────────── koşucu ─────────────── */

  function drawRunner(c) {
    var blink = player.invuln > 0 && Math.sin(A.time * 34) > 0.2 && state === "play";
    pj(player.x, 0, z);
    var gx = PJ.x, gy = PJ.y, s = PJ.s;
    shadow(c, gx, gy, 0.6 * s * (1 - Math.min(0.4, player.y * 0.2)), 0.17 * s, Math.max(0.35, 1 - player.y * 0.4));
    // top
    var touchK = (Math.sin(player.stride * 1.2) + 1) * 0.5;
    var ahead = 0.5 + touchK * 0.3 + (player.slide > 0 ? 0.9 : 0);
    var bxo = 0.34 + player.lean * 0.12;
    var ballGone = (state === "dying" || state === "over") && dyingT > 0.3;
    if (!ballGone) {
      pj(player.x + bxo, 0, z + ahead);
      shadow(c, PJ.x, PJ.y, 0.26 * PJ.s, 0.07 * PJ.s, 1);
      var br = 0.26 * PJ.s;
      pj(player.x + bxo, 0.26 + player.y * 0.92, z + ahead);
      flatBall(c, PJ.x, PJ.y - br * 0.0, br, -player.stride * 2.2);
    }
    if (active.turbo > 0) drawGlow(c, "#FB923C", gx, gy - 0.9 * s, 1.6 * s, 0.6 + 0.2 * Math.sin(A.time * 20));
    if (blink) return;
    var fallen = state === "dying" || state === "over" ? A.clamp(dyingT * 2, 0, 1) : 0;
    var pose = "run", rot = player.lean * 0.3;
    if (fallen > 0) {
      pose = "slide";
      rot = 0;
    } else if (player.slide > 0) pose = "slide";
    else if (player.y > 0.02) pose = "jump";
    pj(player.x, player.y, z);
    var kit = kitHex(runner);
    var stumble = player.stumble;
    drawMan(c, PJ.x, PJ.y, s, {
      kit: kit,
      view: "back",
      pose: pose,
      t: player.stride * 1.2,
      look: lookOf(runner.id),
      num: runner.shirt != null ? runner.shirt : 10,
      rot: rot + Math.sin(A.time * 30) * stumble * 0.12,
      flash: stumble > 0.6 ? (stumble - 0.6) * 1.5 : 0,
    });
    if (active.shield > 0) {
      var r = 1.25 * s, cy = PJ.y - 0.95 * s;
      var al = (active.shield < 3 ? 0.5 + 0.5 * Math.sin(A.time * 14) : 1) * (0.9 + 0.1 * Math.sin(A.time * 5));
      c.save();
      c.globalAlpha = al;
      var g = c.createRadialGradient(PJ.x, cy, r * 0.55, PJ.x, cy, r);
      g.addColorStop(0, "rgba(56,189,248,0)");
      g.addColorStop(0.85, "rgba(56,189,248,0.32)");
      g.addColorStop(1, "rgba(186,230,253,0.75)");
      c.fillStyle = g;
      c.beginPath();
      c.arc(PJ.x, cy, r * (1 + Math.sin(A.time * 4) * 0.03), 0, Math.PI * 2);
      c.fill();
      c.lineWidth = 2.5;
      c.strokeStyle = "rgba(255,255,255,0.8)";
      c.stroke();
      c.fillStyle = "rgba(255,255,255,0.55)";
      c.beginPath();
      c.ellipse(PJ.x - r * 0.4, cy - r * 0.5, r * 0.22, r * 0.11, -0.6, 0, Math.PI * 2);
      c.fill();
      c.restore();
    }
  }

  /* ─────────────── sahne ─────────────── */

  /**
   * Çizim listesi uzaktan yakına sıralanır. Kenar manzarası (bina, ağaç,
   * lamba, pano) yolun dışında kaldığı için yoldaki nesneleri asla örtmez:
   * önce o çizilir (+1e4), sonra yoldakiler.
   */
  var items = [];
  var SCENERY = { bld: 1, tree: 1, lamp: 1, board: 1 };
  function push(d, kind, o, sd) {
    items.push({ d: SCENERY[kind] ? d + 1e4 : d, k: kind, o: o, sd: sd || 0 });
  }

  function drawWorld(c, dt, pal) {
    var cam = z - V.back;
    // gökyüzü (tema geçişinde iki katman)
    pj(0, 0, cam + VIEW);
    var vx = PJ.x - W / 2;
    if (player.lean) {
      c.fillStyle = THEMES[thB].sky[0];
      c.fillRect(-60, -60, W + 120, 70);
    }
    if (thK < 1) A.blit(skyLayer(thA), vx - SKY_M, 0);
    c.save();
    c.globalAlpha = thK < 1 ? A.smooth(thK) : 1;
    A.blit(skyLayer(thB), vx - SKY_M, 0);
    c.restore();
    drawGround(c, pal);

    items.length = 0;
    // kenar manzarası
    var s0 = Math.floor((cam - SLOT) / SLOT), s1 = Math.floor((cam + VIEW) / SLOT);
    for (var si = s0; si <= s1; si++)
      for (var sd = -1; sd <= 1; sd += 2) {
        var b = slotInfo(si, sd);
        if (b.park) {
          for (var ti = 0; ti < 3; ti++) {
            var tz = si * SLOT + 2 + hash(si * 3 + ti, sd + 5) * (SLOT - 4);
            if (tz - cam < 1 || tz - cam > VIEW) continue;
            push(tz - cam, "tree", { z: tz, x: sd * (BLD + 1.4 + hash(si, ti + sd * 9) * 5), k: 0.85 + hash(ti, si) * 0.4 });
          }
        } else if (b.z0 + b.len > cam + 0.6 && b.z0 < cam + VIEW) push(b.z0 + b.len - cam + 0.5, "bld", b, sd);
      }
    for (var lj = Math.floor(cam / 12); lj * 12 < cam + VIEW; lj++) {
      var lz = lj * 12 + 6;
      if (lz - cam < 1) continue;
      push(lz - cam, "lamp", lz, lj % 2 ? 1 : -1);
    }
    for (var bj = Math.floor((cam + 0.6) / 6); bj * 6 < cam + VIEW; bj++) {
      push(Math.max(bj * 6, cam + 0.6) - cam, "board", bj, -1);
      push(Math.max(bj * 6, cam + 0.6) - cam, "board", bj, 1);
    }
    var archZ = Math.floor((cam + 20) / 150) * 150 + 75;
    [archZ - 150, archZ, archZ + 150].forEach(function (az) {
      if (az - cam > 1.5 && az - cam < VIEW) push(az - cam, "arch", az);
    });
    // oyun nesneleri
    for (var oi = 0; oi < obstacles.length; oi++) {
      var o = obstacles[oi];
      var key = o.type === "bus" ? o.z + 4.5 : o.z;
      if (key - cam < 0.4 || o.z - cam > VIEW + 4) continue;
      push(key - cam, o.type === "hurdle" ? "hurdle" : o.type === "bar" ? "bar" : o.type === "bus" ? "bus" : "foe", o);
    }
    for (var ci = 0; ci < coins.length; ci++) {
      var co = coins[ci];
      if (co.z - cam < 1 || co.z - cam > VIEW) continue;
      push(co.z - cam, "coin", co);
    }
    for (var pi = 0; pi < pickups.length; pi++) {
      var pk = pickups[pi];
      if (pk.z - cam < 1 || pk.z - cam > VIEW) continue;
      push(pk.z - cam, "pick", pk);
    }
    push(V.back, "runner", null);
    items.sort(function (p, q) {
      return q.d - p.d;
    });
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      switch (it.k) {
        case "bld":
          drawBuilding(c, it.o, it.sd, pal);
          break;
        case "tree":
          pj(it.o.x, 0, it.o.z);
          drawTree(c, PJ.x, PJ.y, PJ.s, fogA(PJ.dz), pal, it.o.k);
          break;
        case "lamp":
          drawLamp(c, it.sd, it.o, pal);
          break;
        case "board":
          drawBoard(c, it.sd, it.o, pal);
          break;
        case "arch":
          drawArch(c, it.o);
          break;
        case "hurdle":
          drawHurdle(c, it.o);
          break;
        case "bar":
          drawBar(c, it.o);
          break;
        case "bus":
          drawBus(c, it.o);
          break;
        case "foe":
          drawFoe(c, it.o);
          break;
        case "coin":
          drawCoinItem(c, it.o);
          break;
        case "pick":
          drawPickup(c, it.o);
          break;
        case "runner":
          drawRunner(c);
          break;
      }
    }
    c.globalAlpha = 1;
  }

  /** Tek seferlik efektler → ekran parçacıkları. */
  function flushFx() {
    while (fx.length) {
      var e = fx.shift();
      var p = project(e.x, e.y || 0.1, e.z);
      if (p.behind) continue;
      if (e.kind === "coin") A.burst(p.x, p.y, 6, { shape: "star", speed: 150, gravity: 200, life: 0.45, size: 5, color: [GOLD, "#FFFFFF"] });
      else if (e.kind === "land" || e.kind === "hop") A.burst(p.x, p.y, e.kind === "land" ? 9 : 5, { angle: -Math.PI / 2, spread: 2.6, speed: 120, gravity: 240, life: 0.4, size: 5, color: ["#D9F99D", "#BBF7D0", "#FFFFFF"] });
      else if (e.kind === "crash") {
        var pc = project(e.x, 1.1, e.z);
        A.burst(pc.x, pc.y, 18, { shape: "star", speed: 360, gravity: 300, life: 0.6, size: 8, color: ["#FFD43B", "#FFFFFF", BAD] });
        A.ring(pc.x, pc.y, "#FFFFFF", 110, 12);
      } else if (e.kind === "smash") {
        var ps = project(e.x, 1.2, e.z);
        A.burst(ps.x, ps.y, 20, { shape: "confetti", speed: 420, gravity: 600, life: 0.8, size: 8, color: ["#FDBA74", "#FDE047", "#FFFFFF", "#A78BFA"] });
        A.ring(ps.x, ps.y, "#FDE047", 80, 10);
      } else if (e.kind === "power") {
        var pp = project(e.x, 1.2, e.z);
        A.burst(pp.x, pp.y, 22, { shape: "star", speed: 300, gravity: 120, life: 0.7, size: 8, color: [e.color, "#FFFFFF"] });
        A.ring(pp.x, pp.y, e.color, 130, 14);
      }
    }
    if (state === "play" && !A.reduceMotion && W) {
      var pr = project(player.x, 0.05, z);
      if (player.slide > 0 && Math.random() < 0.7) A.burst(pr.x + A.rand(-8, 8), pr.y, 1, { angle: -Math.PI / 2, spread: 1.6, speed: 90, gravity: 200, life: 0.35, size: 5, color: ["#D9F99D", "#FFFFFF"] });
      if (active.turbo > 0) A.burst(pr.x + A.rand(-14, 14), pr.y - A.rand(0, 50), 1, { angle: Math.PI / 2, spread: 0.5, speed: 220, gravity: 0, life: 0.3, size: 7, color: ["#FB923C", "#FDE047", "#FFFFFF"] });
      else if (multiplier() >= 3 && Math.random() < 0.35) A.burst(pr.x, pr.y, 1, { shape: "star", angle: -Math.PI / 2, spread: 1.2, speed: 90, gravity: -60, life: 0.4, size: 5, color: [GOLD, "#FB923C"] });
    }
  }

  /* ═══════════════════════════ ÇİZİM GİRİŞİ ═══════════════════════════ */

  var camInit = false;
  function render(c, dt) {
    if (!W) return;
    if (!V.f || V.lw !== W || V.lh !== H) {
      layout();
      V.lw = W;
      V.lh = H;
    }
    thK = Math.min(1, thK + dt / 1.6);
    var pal = palette();
    // kamera: koşucuyu yumuşak izler; uzak yol yavaşça sağa sola kıvrılır
    var wantX = player.x * 0.72, wantY = player.y * 0.28;
    if (!camInit) {
      V.cx = wantX;
      V.camY = wantY;
      camInit = true;
    } else {
      var kk = 1 - Math.exp(-11 * dt);
      V.cx += (wantX - V.cx) * kk;
      V.camY += (wantY - V.camY) * kk;
    }
    V.bend = 0.0007 * Math.sin(z / 230) + 0.0003 * Math.sin(z / 97);
    c.save();
    var lean = -player.lean * 0.022;
    if (lean) {
      c.translate(W / 2, H * 0.62);
      c.rotate(lean);
      c.translate(-W / 2, -H * 0.62);
    }
    drawWorld(c, dt, pal);
    c.restore();
    flushFx();
    drawTint(c);
    drawSpeedLines(c);
    if (state === "play" || state === "attract") drawFoeLabels(c);
    A.drawParticles(c);
    A.drawFloaters(c, dt);
    if (state !== "attract") drawHud(c, dt);
    if (intro && intro.age >= 0) drawIntro(c);
    var by = Math.max(206, H * 0.3);
    c.save();
    c.translate(W / 2, by);
    c.scale(0.82, 0.82);
    c.translate(-W / 2, -by);
    A.drawBanner(c, W, by, dt);
    c.restore();
    if (flashRed > 0) {
      c.fillStyle = "rgba(255,77,106," + (0.28 * flashRed).toFixed(3) + ")";
      c.fillRect(0, 0, W, H);
    }
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
        g.addColorStop(1, k === "turbo" ? "rgba(251,146,60,0.55)" : k === "magnet" ? "rgba(244,63,94,0.35)" : "rgba(250,204,21,0.35)");
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
    c.strokeStyle = "rgba(255,255,255," + (0.3 * k).toFixed(3) + ")";
    c.lineWidth = 2.2;
    c.lineCap = "round";
    var rand = A.seeded(Math.floor(A.time * 30));
    var vx = W / 2, vy = V.yV;
    for (var i = 0; i < 14; i++) {
      var side = rand() < 0.5 ? -1 : 1;
      var x = W / 2 + side * (W * 0.3 + rand() * W * 0.22);
      var y = H * (0.3 + rand() * 0.6);
      var len = 30 + rand() * 70 * k;
      var dx = x - vx, dy = y - vy, dl = Math.hypot(dx, dy) || 1;
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + (dx / dl) * len, y + (dy / dl) * len);
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
      if (d < 3 || d > 34 || (o.type === "tackler" && o.tackleAt)) return;
      var p = project(laneX(o.lane), 2.35, o.z);
      if (p.behind) return;
      var a = A.clamp((34 - d) / 6, 0, 1) * A.clamp((d - 3) / 3, 0, 1);
      if (a <= 0.01) return;
      c.globalAlpha = a;
      c.font = A.font(11, 900);
      var label = foeLabel(c, o.who, Math.min(130, W * 0.32));
      var num = o.who.shirt ? String(o.who.shirt) : "";
      var tw = c.measureText(label).width, nw = num ? 22 : 0;
      var bw = tw + nw + 16, bx = p.x - bw / 2;
      navyPill(c, bx, p.y - 11, bw, 22);
      if (num) {
        blob(c, bx + 13, p.y, 8.5, teamKit(o).p, 1.6);
        c.font = A.font(9.5, 900);
        c.fillStyle = teamKit(o).s;
        c.fillText(num, bx + 13, p.y + 0.5);
        c.font = A.font(11, 900);
      }
      c.fillStyle = "#FFFFFF";
      c.fillText(label, bx + nw + 8 + tw / 2, p.y + 0.5);
    });
    c.restore();
  }

  /* ─────────────── HUD (Savunma Hattı tarzı) ─────────────── */

  function label(c, text, x, y, size, color, align, stroke) {
    c.font = A.font(size, 900);
    c.textAlign = align || "center";
    c.textBaseline = "middle";
    c.lineJoin = "round";
    if (stroke !== false) {
      c.lineWidth = Math.max(3, size * 0.24);
      c.strokeStyle = stroke || NAVY;
      c.strokeText(text, x, y);
    }
    c.fillStyle = color;
    c.fillText(text, x, y);
  }
  function navyPill(c, x, y, w, h, fill) {
    A.roundRect(c, x, y + 3, w, h, h / 2);
    c.fillStyle = "rgba(8,6,30,0.5)";
    c.fill();
    A.roundRect(c, x, y, w, h, h / 2);
    var g = c.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, fill ? mixc(fill, "#FFFFFF", 0.12) : "#2C2580");
    g.addColorStop(1, fill || "#1C1760");
    c.fillStyle = g;
    c.fill();
    c.lineWidth = 1.5;
    c.strokeStyle = "rgba(255,255,255,0.16)";
    c.stroke();
  }
  function shieldIcon(c, x, y, r, on, broken) {
    c.save();
    c.translate(x, y);
    if (broken > 0) {
      c.rotate(Math.sin(broken * 40) * 0.3 * broken);
      c.scale(1 + broken * 0.3, 1 + broken * 0.3);
    }
    c.beginPath();
    c.moveTo(0, -r);
    c.quadraticCurveTo(r * 0.55, -r * 0.65, r * 0.95, -r * 0.7);
    c.quadraticCurveTo(r * 1.0, r * 0.35, 0, r * 1.05);
    c.quadraticCurveTo(-r * 1.0, r * 0.35, -r * 0.95, -r * 0.7);
    c.quadraticCurveTo(-r * 0.55, -r * 0.65, 0, -r);
    c.closePath();
    if (on) {
      var g = c.createLinearGradient(0, -r, 0, r);
      g.addColorStop(0, "#5CE68A");
      g.addColorStop(1, "#16A34A");
      c.fillStyle = g;
    } else c.fillStyle = "#2A2470";
    c.fill();
    c.lineWidth = 2.4;
    c.strokeStyle = on ? "#FFFFFF" : "rgba(255,255,255,0.25)";
    c.stroke();
    if (on) {
      c.strokeStyle = "#FFFFFF";
      c.lineWidth = r * 0.28;
      c.lineCap = "round";
      c.lineJoin = "round";
      c.beginPath();
      c.moveTo(-r * 0.4, 0);
      c.lineTo(-r * 0.08, r * 0.32);
      c.lineTo(r * 0.45, -r * 0.3);
      c.stroke();
    }
    c.restore();
  }

  var shownPts = 0, shownProg = 0, livesSeen = LIVES, lostAt = -9;
  function drawHud(c, dt) {
    var wide = W > H * 1.15;
    var y = wide ? 8 : 10, h = wide ? 30 : 34;
    // Sağ üstteki RN duraklat düğmesinin yuvası: o satırdaki öğeler slot.x1'de biter.
    var slot = A.hudSlot(14);
    function rightEdge(top) {
      return top < slot.top ? slot.x1 : W - 14;
    }
    shownPts = shownPts < points ? Math.min(points, shownPts + Math.max(1, (points - shownPts) * 0.15)) : points;
    if (lives < livesSeen) lostAt = A.time;
    livesSeen = lives;
    // Puan hapı (sol): top simgesi + sayı
    var kick = Math.max(scoreBump * 0.6, shownPts < points ? 0.3 : 0);
    var txt = String(Math.round(shownPts));
    c.font = A.font(h * 0.6, 900);
    var pw = Math.max(86, c.measureText(txt).width + h + 26);
    navyPill(c, 12 + h * 0.4, y, pw, h);
    c.save();
    c.translate(12 + h / 2, y + h / 2);
    c.scale(1 + kick * 0.25, 1 + kick * 0.25);
    flatBall(c, 0, 0, h * 0.5, A.time * 0.6);
    c.restore();
    c.save();
    c.translate(12 + h + 8, y + h / 2 + 1);
    c.scale(1 + kick * 0.15, 1 + kick * 0.15);
    label(c, txt, 0, 0, h * 0.6, kick > 0.05 ? "#FFE58A" : "#FFFFFF", "left");
    c.restore();
    // Haklar: kalkanlar (sağ)
    var sr = h * 0.42;
    for (var i = 0; i < LIVES; i++) {
      var on = i < lives;
      var br = !on && i === lives ? A.clamp(1 - (A.time - lostAt) / 0.5, 0, 1) : 0;
      shieldIcon(c, rightEdge(y) - sr - (LIVES - 1 - i) * (sr * 2 + 6), y + h / 2, sr, on || br > 0, br);
    }
    // Seviye ilerlemesi: SEVİYE n · rakip takım
    var def = defenseAt(level), rk = kitHex(def);
    var prog = A.clamp((passed - (level - 1) * ROWS_PER_LEVEL) / ROWS_PER_LEVEL, 0, 1);
    shownProg = prog < shownProg ? prog : A.damp(shownProg, prog, 8, dt);
    var bx, bw, byy, bh;
    if (wide) {
      bw = Math.min(W * 0.36, 300);
      bx = W / 2 - bw / 2;
      byy = y + 4;
      bh = h - 8;
    } else {
      bx = 14;
      bw = W - 28;
      // düğme yuvası varsa çubuk (ve altındaki satır) onun altına iner
      byy = Math.max(y + h + 12, slot.right > 0 ? slot.top + 6 : 0);
      bh = 22;
    }
    A.roundRect(c, bx, byy + 2, bw, bh, bh / 2);
    c.fillStyle = "rgba(8,6,30,0.5)";
    c.fill();
    A.roundRect(c, bx, byy, bw, bh, bh / 2);
    c.fillStyle = "#231D6B";
    c.fill();
    var fw = Math.max(bh, bw * shownProg);
    A.roundRect(c, bx, byy, fw, bh, bh / 2);
    var pg = c.createLinearGradient(0, byy, 0, byy + bh);
    pg.addColorStop(0, "#4ADE6E");
    pg.addColorStop(1, "#16A34A");
    c.fillStyle = pg;
    c.fill();
    c.fillStyle = "rgba(255,255,255,0.25)";
    A.roundRect(c, bx + 4, byy + 2.5, Math.max(0, fw - 8), bh * 0.28, bh * 0.14);
    c.fill();
    // bitiş bayrağı
    var mx = bx + bw - bh * 0.7;
    c.fillStyle = "#FFFFFF";
    c.fillRect(mx - 1, byy - 3, 2, bh + 6);
    c.fillStyle = BAD;
    c.beginPath();
    c.moveTo(mx + 1, byy - 3);
    c.lineTo(mx + 9, byy + 1);
    c.lineTo(mx + 1, byy + 5);
    c.closePath();
    c.fill();
    var lbl = "SEVİYE " + level + " · " + String(def.team.name || "Rakip");
    c.font = A.font(bh * 0.58, 900);
    while (lbl.length > 8 && c.measureText(lbl).width > bw - 50) lbl = lbl.slice(0, -2) + "…";
    var chipX = bx + bw / 2 - c.measureText(lbl).width / 2 - 12;
    blob(c, chipX, byy + bh / 2, bh * 0.3, rk.p, 2);
    label(c, lbl, bx + bw / 2 + 4, byy + bh / 2 + 0.5, bh * 0.58, "#FFFFFF");

    // Altın hapı + çarpan hapı
    var ry = wide ? y + h + 10 : byy + bh + 12, rh = wide ? 28 : 30;
    var cs = String(coinCount);
    c.font = A.font(rh * 0.56, 900);
    var cw = Math.max(70, c.measureText(cs).width + rh + 22);
    navyPill(c, 12 + rh * 0.4, ry, cw, rh);
    var cb = 1 + coinBump * 0.35 + (A.scoreKick || 0) * 0.15;
    drawCoin(c, 12 + rh / 2, ry + rh / 2, rh * 0.48 * cb, 0, 1);
    A.scoreAnchor = { x: 12 + rh / 2, y: ry + rh / 2 };
    label(c, cs, 12 + rh + 6, ry + rh / 2 + 1, rh * 0.56, coinBump > 0.1 ? "#FFE58A" : "#FFFFFF", "left");
    // mesafe
    var dist = Math.round(z) + " m";
    c.font = A.font(rh * 0.46, 900);
    var dw = c.measureText(dist).width + 22;
    if (!wide) {
      navyPill(c, W / 2 - dw / 2, ry + 3, dw, rh - 6);
      label(c, dist, W / 2, ry + rh / 2 + 0.5, rh * 0.46, "#C7D2FE", "center", false);
    }
    // çarpan: halka + ×n
    var m = multiplier(), base = Math.min(5, 1 + Math.floor(combo / 8));
    var mprog = base >= 5 ? 1 : (combo % 8) / 8;
    var mt = "×" + m;
    c.font = A.font(rh * 0.56, 900);
    var mw = c.measureText(mt).width + rh + 20;
    var mx0 = rightEdge(ry) - mw;
    navyPill(c, mx0, ry, mw, rh, m > 1 ? "#6D28D9" : null);
    var rcx = mx0 + rh / 2 + 2, rcy = ry + rh / 2, rr = rh * 0.32;
    c.lineWidth = 3.5;
    c.strokeStyle = "rgba(255,255,255,0.18)";
    c.beginPath();
    c.arc(rcx, rcy, rr, 0, Math.PI * 2);
    c.stroke();
    if (mprog > 0) {
      c.strokeStyle = m > 1 ? GOLD : "#4ADE6E";
      c.lineCap = "round";
      c.beginPath();
      c.arc(rcx, rcy, rr, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * mprog);
      c.stroke();
    }
    label(c, mt, rcx + rr + 7, ry + rh / 2 + 1, rh * 0.56, m > 1 ? "#FFE58A" : "#FFFFFF", "left");

    // Etkin güçler: beyaz rozetler + kalan süre çubuğu
    var px = 14, py = ry + rh + 12, sz = wide ? 38 : 44;
    POWER_KEYS.forEach(function (k) {
      if (!(active[k] > 0)) return;
      var Pw = POWERS[k];
      var lowBlink = active[k] < 2 ? 0.55 + 0.45 * Math.sin(A.time * 16) : 1;
      c.save();
      c.globalAlpha = lowBlink;
      c.drawImage(badgeSprite(k).canvas, px, py, sz, sz);
      A.roundRect(c, px + 6, py + sz - 1, sz - 12, 6, 3);
      c.fillStyle = NAVY;
      c.fill();
      A.roundRect(c, px + 7, py + sz, Math.max(3, (sz - 14) * (active[k] / Pw.dur)), 4, 2);
      c.fillStyle = Pw.color;
      c.fill();
      // saniye rozeti (sarı)
      var sec = String(Math.ceil(active[k]));
      blob(c, px + sz - 3, py + 4, 9, GOLD, 2);
      label(c, sec, px + sz - 3, py + 4.5, 10, NAVY, "center", false);
      c.restore();
      px += sz + 10;
    });
  }

  function drawIntro(c) {
    var d = intro.def, t = intro.age;
    var inT = A.easeOutBack(A.clamp(t / 0.35, 0, 1));
    var out = A.clamp((2.6 - t) / 0.35, 0, 1);
    if (out <= 0) return;
    var kit = kitHex(d);
    var cw = Math.min(W - 48, 280), ch = 58;
    var wide = W > H * 1.15;
    var x = W / 2 - cw / 2, y = wide ? 92 : 168;
    c.save();
    c.globalAlpha = out;
    c.translate(W / 2, y + ch / 2);
    c.scale(0.7 + 0.3 * inT, 0.7 + 0.3 * inT);
    c.translate(-W / 2, -(y + ch / 2));
    A.roundRect(c, x, y + 5, cw, ch, 16);
    c.fillStyle = "rgba(20,16,67,0.5)";
    c.fill();
    A.roundRect(c, x, y, cw, ch, 16);
    c.fillStyle = "#FFFFFF";
    c.fill();
    c.lineWidth = 3;
    c.strokeStyle = NAVY;
    c.stroke();
    // takım rozeti (forma renkleri)
    var bx = x + 30, by = y + ch / 2;
    c.save();
    c.beginPath();
    c.arc(bx, by, 17, 0, Math.PI * 2);
    c.clip();
    c.fillStyle = kit.p;
    c.fillRect(bx - 18, by - 18, 36, 36);
    c.fillStyle = kit.s;
    c.fillRect(bx - 4, by - 18, 8, 36);
    c.restore();
    blob(c, bx, by, 17, "rgba(0,0,0,0)", 3);
    // üst rozet (sarı)
    var tag = (intro.level ? "SEVİYE " + intro.level + " · " : "") + "RAKİP " + intro.idx + "/" + defenses.length + (intro.idx >= defenses.length ? " · FİNAL" : "");
    c.font = A.font(10, 900);
    var tw = c.measureText(tag).width + 18;
    A.roundRect(c, x + cw / 2 - tw / 2, y - 11, tw, 20, 10);
    c.fillStyle = GOLD;
    c.fill();
    c.lineWidth = 2.4;
    c.strokeStyle = NAVY;
    c.stroke();
    label(c, tag, x + cw / 2, y - 0.5, 10, NAVY, "center", false);
    var name = String(d.team.name || "Rakip");
    c.font = A.font(17, 900);
    var max = cw - 64 - 16;
    while (name.length > 3 && c.measureText(name).width > max) name = name.slice(0, -2) + "…";
    label(c, name, x + 56, y + ch / 2 - 4, 17, NAVY, "left", false);
    c.font = A.font(11, 800);
    c.fillStyle = "#6B6A9A";
    c.textAlign = "left";
    c.fillText(Number(d.conceded_per_match || 0).toFixed(1).replace(".", ",") + " gol/maç yiyor", x + 56, y + ch / 2 + 13);
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
      c.lineWidth = r * 0.5 + 4;
      c.strokeStyle = NAVY;
      c.beginPath();
      c.arc(x, y - r * 0.05, r * 0.52, Math.PI, 0);
      c.lineTo(x + r * 0.52, y + r * 0.6);
      c.moveTo(x - r * 0.52, y - r * 0.05);
      c.lineTo(x - r * 0.52, y + r * 0.6);
      c.stroke();
      c.strokeStyle = col;
      c.lineWidth = r * 0.5;
      c.stroke();
      c.strokeStyle = "#FFFFFF";
      c.lineCap = "butt";
      c.beginPath();
      c.moveTo(x - r * 0.52, y + r * 0.36);
      c.lineTo(x - r * 0.52, y + r * 0.62);
      c.moveTo(x + r * 0.52, y + r * 0.36);
      c.lineTo(x + r * 0.52, y + r * 0.62);
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
      c.lineWidth = Math.max(1.5, r * 0.14);
      c.strokeStyle = NAVY;
      c.stroke();
      c.strokeStyle = "#FFFFFF";
      c.lineWidth = r * 0.18;
      c.beginPath();
      c.moveTo(x - r * 0.3, y);
      c.lineTo(x - r * 0.05, y + r * 0.28);
      c.lineTo(x + r * 0.36, y - r * 0.3);
      c.stroke();
    } else if (type === "x2") {
      c.font = "900 " + Math.round(r * 1.3) + "px " + A.FONT;
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.lineWidth = Math.max(2, r * 0.22);
      c.strokeStyle = NAVY;
      c.strokeText("×2", x, y + r * 0.06);
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
      c.lineWidth = Math.max(1.5, r * 0.12);
      c.strokeStyle = NAVY;
      c.stroke();
    }
    c.restore();
  }

  function debug() {
    return {
      state: state, z: z, speed: speed, passed: passed, points: points, lives: lives, level: level, coins: coinCount, combo: combo, player: player,
      rows: rows, obstacles: obstacles, coinList: coins, pickups: pickups, runner: runner.short, defense: defenseAt(level).team.name, gl: false, theme: thB,
      active: active, shift: shift, jump: jump, slide: slide, grant: grant, foeLabel: foeLabel, multiplier: multiplier, autopilot: autopilot,
    };
  }

  A.register({ resize: resize, start: start, update: update, render: render, down: down, move: move, up: up, debug: debug, setRoster: setRoster });
})();
