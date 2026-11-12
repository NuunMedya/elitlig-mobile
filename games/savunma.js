/*
 * SAVUNMA HATTI 3B — şeritli kale savunması. Rakip hücumcular beş koridordan
 * kalene yürür; sen sahaya oyuncularını dizersin. Forvetlerin top atar,
 * stoperlerin duvar olur, oyun kurucuların ENERJİ üretir. Kalene ulaşan her
 * rakip bir GOL: üç gol yersen maç biter.
 *
 * MİMARİ: simülasyon (ızgara, dalgalar, hasar, enerji, puan) çizimden
 * bağımsızdır; başsız testler yalnız onu koşturur. Çizim arcade motorunda
 * (games/arcade3d.js): örneklenmiş mini futbolcular, örneklenmiş toplar, GPU
 * parçacıkları. Kamera kendi kalenin arkasından sahaya bakar: rakipler uzakta
 * küçük doğar, yaklaştıkça büyür.
 *
 * GERÇEK İÇERİK (RN'den {type:"config", roster:{captain, rivals}}): oyuncuların
 * seçtiğin oyuncunun kulübünün formasını giyer; her DALGA ligin bir takımıdır
 * (forma, ad). Dalganın sonunda o takımın KAPTANI gelir.
 *
 * IZGARA: 5 koridor × 6 sıra. Rakip Z = 17,5 m'de doğar, Z = 0,8'de gol atar.
 *
 * OYUNCULAR (kart · enerji · görev):
 *   OYUN KURUCU  50   9 sn'de bir +25 enerji üretir (ilk üretim 5 sn).
 *   FORVET       100  koridorunda rakip varsa 1,4 sn'de bir şut (20 hasar).
 *   STOPER       50   2400 can; rakibi oyalar. Uzun dolum (18 sn).
 *   FÜZE         150  0,9 sn sonra 3×3 alanı temizler (1800 hasar). 2. dalga.
 *   PRES         175  şutu rakibi 3,5 sn yarı hıza düşürür. 3. dalga.
 *   ÇİFT FORVET  200  her seferinde iki şut. 4. dalga.
 * Gökten de enerji düşer (+25): dokun, topla. ÇIKAR düğmesi oyuncuyu kaldırır.
 *
 * RAKİPLER: HÜCUMCU (200 can), KANAT (hızlı, 150; 2. dalga), SANTRFOR (520;
 * 3. dalga), KAPTAN (dalga sonu, 1300+). Temas ettiği oyuncuya saniyede 100
 * hasar verir.
 *
 * PUAN: hücumcu 10, kanat 15, santrfor 25, kaptan 80; dalga bitince 50 × dalga.
 */
(function () {
  "use strict";
  var A = window.Arena;
  var P = A.PAL;
  var T = window.THREE || (typeof THREE !== "undefined" ? THREE : null); // eslint-disable-line no-undef
  var G3 = A.G3;
  var K = A.T3;

  /* ─────────────────────────── kadro ─────────────────────────── */
  var DEFAULT_CAPTAIN = { id: 0, short: "ElitLig", name: "ElitLig", shirt: 10, team: { name: "ElitLig", kit: { primary: "#5B3DF5", secondary: "#FFFFFF" } } };
  var DEFAULT_RIVALS = [
    ["Kırmızılar", "#DC2626", "#FFFFFF"],
    ["Sarı-Lacivert", "#FACC15", "#1E3A8A"],
    ["Turuncular", "#F97316", "#111827"],
    ["Siyahlar", "#111827", "#F8FAFC"],
    ["Bordolular", "#7F1D1D", "#FDE68A"],
  ].map(function (d, i) {
    return { team: { id: -1 - i, name: d[0], kit: { primary: d[1], secondary: d[2] } }, defenders: [{ short: "Kaptan" }] };
  });
  var captain = DEFAULT_CAPTAIN;
  var rivals = DEFAULT_RIVALS;
  var rosterSig = "", lookKey = "";
  function setRoster(r) {
    var cp = r && r.captain && r.captain.team ? r.captain : null;
    var rv = r && Array.isArray(r.rivals) ? r.rivals.filter(function (d) { return d && d.team && d.team.kit; }) : [];
    var sig = (cp ? cp.id : "d") + ":" + rv.map(function (d) { return d.team.id; }).join(",");
    if (sig === rosterSig) return;
    rosterSig = sig;
    captain = cp || DEFAULT_CAPTAIN;
    rivals = rv.length ? rv : DEFAULT_RIVALS;
    lookKey = "";
  }
  function rivalAt(w) {
    return rivals[(Math.max(1, w) - 1) % rivals.length];
  }
  function kitOf(person) {
    var k = person && person.team && person.team.kit ? person.team.kit : {};
    return { primary: k.primary || "#5B3DF5", secondary: k.secondary || "#FFFFFF" };
  }
  function bossName(w) {
    var d = rivalAt(w);
    var who = d.defenders && d.defenders[0];
    return who ? String(who.short || who.name || "Kaptan") : "Kaptan";
  }

  /* ─────────────────────────── kurallar ─────────────────────────── */
  var LANES = 5, ROWS = 6;
  var CW = 1.9, CD = 2.2, Z0 = 1.9; // hücre genişliği, derinliği, ilk sıranın başı
  var SPAWN_Z = Z0 + ROWS * CD + 2.4, GOAL_Z = 0.8;
  var LIVES = 3;
  var SHOT_V = 11;

  var UNITS = {
    kurucu: { name: "KURUCU", cost: 50, hp: 300, recharge: 6, color: "#FACC15", unlock: 1, desc: "Enerji üretir" },
    forvet: { name: "FORVET", cost: 100, hp: 300, recharge: 6, color: "#8B7BFF", unlock: 1, desc: "Şut atar" },
    stoper: { name: "STOPER", cost: 50, hp: 2400, recharge: 18, color: "#94A3B8", unlock: 1, desc: "Duvar olur" },
    fuze: { name: "FÜZE", cost: 150, hp: 9999, recharge: 26, color: "#F43F5E", unlock: 2, desc: "3×3 temizler" },
    pres: { name: "PRES", cost: 175, hp: 300, recharge: 8, color: "#38BDF8", unlock: 3, desc: "Yavaşlatır" },
    cift: { name: "ÇİFT", cost: 200, hp: 300, recharge: 8, color: "#FB923C", unlock: 4, desc: "İki şut" },
  };
  var ORDER = ["kurucu", "forvet", "stoper", "fuze", "pres", "cift"];
  var FOES = {
    hucum: { hp: 200, v: 0.46, pts: 10, s: 1.45, cost: 1 },
    kanat: { hp: 150, v: 0.98, pts: 15, s: 1.3, cost: 1.5 },
    santrfor: { hp: 520, v: 0.4, pts: 25, s: 1.8, cost: 3 },
    kaptan: { hp: 1300, v: 0.33, pts: 80, s: 2.3, cost: 0 },
  };
  var EAT = 100; // temas hasarı / sn
  var PRODUCE = 9, FIRE = 1.4;

  var W = 0, H = 0;
  var state = "attract"; // attract | play | dying | over
  var grid = []; // grid[lane][row] = unit | null
  var units = [], foes = [], shots = [], orbs = [], blasts = [];
  var energy = 150, points = 0, lives = LIVES, wave = 1, defeated = 0, placed = 0, conceded = 0;
  var queue = []; // { t, type, lane }
  var waveT = 0, waveState = "run"; // run | rest
  var restT = 0, surgeAt = 0, surged = false;
  var skyT = 6;
  var ready = {}; // kartın yeniden kullanılabileceği an (A.time)
  var selected = null, dragging = false, hover = null, removing = false, pointer = null;
  var scoreBump = 0, energyBump = 0, flashRed = 0, stateT = 0, goalFlash = 0;
  var uid = 0;

  function cellX(lane) {
    return (lane - (LANES - 1) / 2) * CW;
  }
  function cellZ(row) {
    return Z0 + row * CD + CD / 2;
  }
  function unlocked(type) {
    return wave >= UNITS[type].unlock;
  }
  function canPlace(type, lane, row) {
    if (!UNITS[type] || lane < 0 || row < 0 || lane >= LANES || row >= ROWS) return false;
    return !grid[lane][row];
  }

  function resetWorld() {
    grid = [];
    for (var l = 0; l < LANES; l++) {
      grid.push([]);
      for (var r = 0; r < ROWS; r++) grid[l].push(null);
    }
    units = [];
    foes = [];
    shots = [];
    orbs = [];
    blasts = [];
    energy = 150;
    points = 0;
    lives = LIVES;
    wave = 1;
    defeated = 0;
    placed = 0;
    conceded = 0;
    ready = {};
    selected = null;
    dragging = false;
    hover = null;
    removing = false;
    skyT = 6;
    buildWave();
  }

  /** Dalga planı: seyrek başlar, sıklaşır, BÜYÜK HÜCUM ve kaptanla biter. */
  function buildWave() {
    queue = [];
    waveT = 0;
    waveState = "run";
    surged = false;
    var total = 4.5 + wave * 3.2;
    var surge = total * 0.35;
    var budget = total;
    var t = wave === 1 ? 15 : 6;
    var gap = Math.max(2.3, 8.6 - wave * 0.75);
    var last = -1, streak = 0;
    function lane() {
      var l = (Math.random() * LANES) | 0;
      if (l === last && ++streak >= 2) l = (l + 1 + ((Math.random() * (LANES - 1)) | 0)) % LANES;
      if (l !== last) streak = 0;
      last = l;
      return l;
    }
    function pick() {
      var r = Math.random();
      if (wave >= 3 && r < Math.min(0.3, 0.12 + wave * 0.03) && budget >= 3) return "santrfor";
      if (wave >= 2 && r < 0.5) return "kanat";
      return "hucum";
    }
    while (budget > surge) {
      var ty = pick();
      queue.push({ t: t, type: ty, lane: lane() });
      budget -= FOES[ty].cost;
      t += gap * A.rand(0.7, 1.2);
      gap = Math.max(2.0, gap * 0.93);
    }
    t += 4;
    surgeAt = t;
    while (budget > 0) {
      var ty2 = pick();
      queue.push({ t: t + Math.random() * 4.5, type: ty2, lane: lane() });
      budget -= FOES[ty2].cost;
    }
    if (wave >= 2) queue.push({ t: t + 3, type: "kaptan", lane: 1 + ((Math.random() * 3) | 0) });
    queue.sort(function (a, b) {
      return a.t - b.t;
    });
  }

  function start() {
    resetWorld();
    state = "play";
    stateT = 0;
    A.particles.length = 0;
    A.floaters.length = 0;
    A.banner = null;
    A.sound("whistle");
    A.announce("SAVUNMA HATTI", "1. dalga · " + String(rivalAt(1).team.name || "Rakip"));
    if (R) G3.setTheme(R, "day");
  }

  /* ─────────────────────────── oyuncu koyma ─────────────────────────── */

  function place(type, lane, row, free) {
    var U = UNITS[type];
    if (!U || !canPlace(type, lane, row)) return false;
    if (!free) {
      if (state !== "play" || !unlocked(type) || energy < U.cost || (ready[type] || 0) > A.time) return false;
      energy -= U.cost;
      ready[type] = A.time + U.recharge;
      placed += 1;
    }
    var u = { id: ++uid, type: type, lane: lane, row: row, x: cellX(lane), z: cellZ(row), hp: U.hp, hp0: U.hp, at: A.time, next: type === "kurucu" ? 5 : type === "fuze" ? 0.9 : 0.6, kickAt: -9, second: -1, hitAt: -9, made: -9 };
    grid[lane][row] = u;
    units.push(u);
    if (!free) {
      A.sound("place");
      A.haptic("light");
    }
    return true;
  }
  function removeUnit(u, silent) {
    if (grid[u.lane][u.row] === u) grid[u.lane][u.row] = null;
    var i = units.indexOf(u);
    if (i >= 0) units.splice(i, 1);
    u.gone = true;
    if (!silent) blasts.push({ kind: "puff", x: u.x, z: u.z, at: A.time });
  }

  function addEnergy(v, wx, wz2) {
    energy = Math.min(9990, energy + v);
    energyBump = 1;
    if (state === "play") floatAt("+" + v, wx, 1.6, wz2, P.gold, 18);
  }
  function collect(o) {
    if (o.taken) return;
    o.taken = true;
    o.at = A.time;
    addEnergy(o.v, o.x, o.z);
    if (R) {
      var es = G3.project(R, o.x, o.y, -o.z);
      A.sparkle(es.x, es.y, 12, "#FDE047");
    }
    A.sound("coin");
    A.haptic("light");
  }

  /* ─────────────────────────── güncelleme ─────────────────────────── */

  function hurtFoe(f, dmg, slow) {
    if (f.dead) return;
    f.hp -= dmg;
    f.hitAt = A.time;
    if (slow) f.slow = 3.5;
    if (f.hp <= 0) {
      f.dead = true;
      f.at = A.time;
      if (state === "play") {
        defeated += 1;
        points += FOES[f.type].pts;
        scoreBump = 1;
        floatAt("+" + FOES[f.type].pts, f.x, 2.2, f.z, f.type === "kaptan" ? P.gold : "#FFFFFF", f.type === "kaptan" ? 24 : 18);
        if (f.type === "kaptan") {
          A.sound("cheer");
          A.haptic("success");
        }
      }
    }
  }

  function update(dt) {
    stateT += dt;
    scoreBump = Math.max(0, scoreBump - dt * 4);
    energyBump = Math.max(0, energyBump - dt * 4);
    flashRed = Math.max(0, flashRed - dt * 2.2);
    goalFlash = Math.max(0, goalFlash - dt * 1.2);
    if (state === "dying") {
      if (stateT > 1.6) {
        state = "over";
        A.sound("over");
        A.send("over", { score: points, stats: { wave: wave, defeated: defeated, conceded: conceded, placed: placed, teams: rivals.length } });
      }
      return;
    }
    if (state === "over") return;
    var playing = state === "play";

    /* Vitrin: hazır diziliş, bitmeyen hücum */
    if (state === "attract") {
      if (!units.length) {
        [0, 1, 2, 3, 4].forEach(function (l) {
          place(l % 2 ? "kurucu" : "forvet", l, 0, true);
          place("forvet", l, 1, true);
          if (l % 2 === 0) place("stoper", l, 3, true);
        });
        place("pres", 2, 2, true);
      }
      if (!queue.length && foes.length < 3) {
        waveT = 0;
        for (var qd = 0; qd < 6; qd++) queue.push({ t: 1 + qd * 2.2, type: qd % 3 === 2 ? "kanat" : "hucum", lane: (qd * 2 + 1) % LANES });
      }
    }

    /* Dalga akışı */
    if (waveState === "run") {
      waveT += dt;
      if (playing && !surged && waveT >= surgeAt && queue.length) {
        surged = true;
        A.announce("BÜYÜK HÜCUM!", String(rivalAt(wave).team.name || "Rakip") + " yükleniyor", P.bad);
        A.sound("whistle");
        A.haptic("warning");
      }
      while (queue.length && queue[0].t <= waveT) {
        var q = queue.shift();
        var F = FOES[q.type];
        var scale = wave > 5 ? 1 + 0.08 * (wave - 5) : 1;
        var hp = Math.round((q.type === "kaptan" ? F.hp + 200 * (wave - 2) : F.hp) * scale);
        foes.push({ id: ++uid, type: q.type, lane: q.lane, x: cellX(q.lane), z: SPAWN_Z + Math.random() * 0.8, hp: hp, hp0: hp, v: F.v * A.rand(0.94, 1.06), slow: 0, hitAt: -9, eating: null, phase: Math.random() * 6, dead: false, at: 0 });
      }
      if (playing && !queue.length && !foes.some(function (f) { return !f.dead; })) {
        waveState = "rest";
        restT = 5;
        var bonus = 50 * wave;
        points += bonus;
        scoreBump = 1;
        addEnergy(75, 0, cellZ(2));
        A.announce(wave + ". DALGA TEMİZ", "+" + bonus + " puan · +75 enerji");
        A.sound("level");
        A.haptic("success");
      }
    } else {
      restT -= dt;
      if (restT <= 0) {
        wave += 1;
        buildWave();
        var news = ORDER.filter(function (k) { return UNITS[k].unlock === wave; })[0];
        A.announce(wave + ". DALGA", "Rakip: " + String(rivalAt(wave).team.name || "Rakip") + (news ? " · YENİ: " + UNITS[news].name : ""));
        A.sound("whistle");
        if (R) G3.setTheme(R, ["day", "day", "sunset", "sunset", "night", "night"][(wave - 1) % 6]);
      }
    }

    /* Gökten enerji */
    if (playing) {
      skyT -= dt;
      if (skyT <= 0) {
        skyT = A.rand(7, 10);
        orbs.push({ id: ++uid, x: cellX((Math.random() * LANES) | 0) + A.rand(-0.4, 0.4), z: cellZ((Math.random() * ROWS) | 0) + A.rand(-0.4, 0.4), y: 9, v: 25, born: A.time, taken: false, at: 0, sky: true });
      }
    }
    for (var oi = orbs.length - 1; oi >= 0; oi--) {
      var o = orbs[oi];
      if (!o.taken) {
        o.y = Math.max(0.75, o.y - (o.sky ? 2.6 : 5) * dt);
        if (A.time - o.born > (o.sky ? 13 : 10)) orbs.splice(oi, 1);
        else if (state === "attract" && A.time - o.born > 2.5) orbs.splice(oi, 1);
      } else if (A.time - o.at > 0.45) orbs.splice(oi, 1);
    }

    /* Oyuncular */
    for (var ui = units.length - 1; ui >= 0; ui--) {
      var u = units[ui];
      if (u.hp <= 0) {
        removeUnit(u);
        if (playing) A.sound("thud");
        continue;
      }
      u.next -= dt;
      if (u.type === "kurucu") {
        if (u.next <= 0) {
          u.next = PRODUCE;
          u.made = A.time;
          orbs.push({ id: ++uid, x: u.x + A.rand(-0.5, 0.5), z: u.z + A.rand(-0.2, 0.6), y: 2.2, v: 25, born: A.time, taken: false, at: 0, sky: false });
        }
      } else if (u.type === "fuze") {
        if (u.next <= 0) {
          for (var bf = 0; bf < foes.length; bf++) {
            var e = foes[bf];
            if (Math.abs(e.lane - u.lane) <= 1 && Math.abs(e.z - u.z) <= CD * 1.5) hurtFoe(e, 1800, false);
          }
          blasts.push({ kind: "boom", x: u.x, z: u.z, at: A.time });
          removeUnit(u, true);
          if (playing) {
            A.sound("boom");
            A.shake(12);
            A.haptic("heavy");
          }
        }
      } else if (u.type !== "stoper") {
        var threat = false;
        for (var tf = 0; tf < foes.length; tf++)
          if (!foes[tf].dead && foes[tf].lane === u.lane && foes[tf].z > u.z - 0.2 && foes[tf].z < SPAWN_Z - 1) {
            threat = true;
            break;
          }
        if (threat && u.next <= 0.16 && u.kickAt < A.time - 0.6) u.kickAt = A.time;
        if (u.next <= 0) {
          if (threat) {
            shots.push({ lane: u.lane, x: u.x, z: u.z + 0.5, slow: u.type === "pres", dmg: 20, id: ++uid });
            if (u.type === "cift") u.second = 0.2;
            u.next = FIRE;
            if (playing && Math.random() < 0.5) A.sound("shoot");
          } else u.next = 0.2;
        }
        if (u.second > 0) {
          u.second -= dt;
          if (u.second <= 0) {
            shots.push({ lane: u.lane, x: u.x, z: u.z + 0.5, slow: false, dmg: 20, id: ++uid });
            u.second = -1;
          }
        }
      }
    }

    /* Şutlar */
    for (var si = shots.length - 1; si >= 0; si--) {
      var s = shots[si];
      s.z += SHOT_V * dt;
      var hit = null;
      for (var hf = 0; hf < foes.length; hf++) {
        var f2 = foes[hf];
        if (f2.dead || f2.lane !== s.lane) continue;
        if (Math.abs(f2.z - s.z) < 0.5 && (!hit || f2.z < hit.z)) hit = f2;
      }
      if (hit) {
        hurtFoe(hit, s.dmg, s.slow);
        blasts.push({ kind: s.slow ? "ice" : "hit", x: s.x, z: hit.z - 0.3, at: A.time });
        shots.splice(si, 1);
      } else if (s.z > SPAWN_Z + 3) shots.splice(si, 1);
    }

    /* Rakipler */
    for (var fi = foes.length - 1; fi >= 0; fi--) {
      var f = foes[fi];
      if (f.dead) {
        if (A.time - f.at > 0.9) foes.splice(fi, 1);
        continue;
      }
      f.slow = Math.max(0, f.slow - dt);
      // önündeki oyuncu (aynı koridor, temas mesafesinde)
      var victim = null;
      for (var r = ROWS - 1; r >= 0; r--) {
        var cand = grid[f.lane][r];
        if (cand && cand.type !== "fuze" && f.z - cand.z < 0.85 && f.z - cand.z > -0.4) {
          victim = cand;
          break;
        }
      }
      f.eating = victim;
      if (victim) {
        if (state !== "attract" || victim.type === "stoper") victim.hp -= EAT * dt * (f.type === "kaptan" ? 2 : 1);
        victim.hitAt = A.time;
      } else {
        f.z -= f.v * (f.slow > 0 ? 0.5 : 1) * dt;
        f.phase += dt * f.v * (f.slow > 0 ? 0.5 : 1) * 9;
      }
      if (f.z <= GOAL_Z) {
        foes.splice(fi, 1);
        if (playing) {
          lives -= 1;
          conceded += 1;
          flashRed = 1;
          goalFlash = 1;
          A.shake(10);
          A.sound("groan");
          A.sound("net");
          A.haptic("error");
          A.announce("GOL YEDİN!", lives > 0 ? "Kalan hak: " + lives : "Savunma çöktü", P.bad);
          if (lives <= 0) {
            state = "dying";
            stateT = 0;
          }
        }
      }
    }
    for (var bi = blasts.length - 1; bi >= 0; bi--) if (A.time - blasts[bi].at > 1) blasts.splice(bi, 1);
  }

  /* ─────────────────────────── girdi ─────────────────────────── */

  var BAR_H = 96;
  function cards() {
    var list = ORDER.filter(unlocked);
    var cw = Math.min(56, (W - 24 - 46) / 6 - 6), ch = 72, gap = 6;
    var total = list.length * cw + (list.length - 1) * gap + gap + 40;
    var x0 = Math.max(10, W / 2 - total / 2);
    var y = H - ch - 14;
    var out = list.map(function (k, i) {
      return { key: k, x: x0 + i * (cw + gap), y: y, w: cw, h: ch };
    });
    out.shovel = { x: x0 + list.length * (cw + gap) + 2, y: y + 16, w: 40, h: 40 };
    return out;
  }
  function cardAt(p) {
    var cs = cards();
    for (var i = 0; i < cs.length; i++) if (p.x >= cs[i].x - 3 && p.x <= cs[i].x + cs[i].w + 3 && p.y >= cs[i].y - 6 && p.y <= cs[i].y + cs[i].h + 8) return cs[i];
    var sh = cs.shovel;
    if (p.x >= sh.x - 4 && p.x <= sh.x + sh.w + 4 && p.y >= sh.y - 6 && p.y <= sh.y + sh.h + 6) return { key: "shovel" };
    return null;
  }
  function cellAt(p) {
    if (!R || p.y > H - BAR_H) return null;
    var g = G3.pickGround(R, p.x, p.y);
    if (!g) return null;
    var lane = Math.floor(g.x / CW + LANES / 2), row = Math.floor((-g.z - Z0) / CD);
    if (lane < 0 || lane >= LANES || row < 0 || row >= ROWS) return null;
    return { lane: lane, row: row };
  }
  function usable(type) {
    return unlocked(type) && energy >= UNITS[type].cost && (ready[type] || 0) <= A.time;
  }
  function down(p) {
    if (state !== "play") return;
    pointer = p;
    var card = cardAt(p);
    if (card) {
      if (card.key === "shovel") {
        removing = !removing;
        selected = null;
        A.haptic("light");
        return;
      }
      removing = false;
      if (usable(card.key)) {
        selected = selected === card.key ? null : card.key;
        dragging = !!selected;
        A.sound("tap");
        A.haptic("light");
      } else {
        A.sound("bad");
        A.haptic("warning");
      }
      return;
    }
    // enerji toplama: yakındaki küre
    if (R) {
      var best = null, bd = 46;
      orbs.forEach(function (o) {
        if (o.taken) return;
        var q = G3.project(R, o.x, o.y, -o.z);
        var d = Math.hypot(q.x - p.x, q.y - p.y);
        if (d < bd) {
          bd = d;
          best = o;
        }
      });
      if (best) {
        collect(best);
        return;
      }
    }
    var cell = cellAt(p);
    if (!cell) return;
    if (removing) {
      var u = grid[cell.lane][cell.row];
      if (u) {
        removeUnit(u);
        A.sound("swish");
        A.haptic("light");
      }
      removing = false;
      return;
    }
    if (selected) {
      hover = cell;
      dragging = true;
    }
  }
  function move(p) {
    pointer = p;
    if (state !== "play" || !dragging || !selected) return;
    hover = cellAt(p);
  }
  function up(p) {
    if (state !== "play") return;
    if (dragging && selected) {
      var cell = cellAt(p);
      if (cell && place(selected, cell.lane, cell.row)) selected = null;
      else if (cell && !canPlace(selected, cell.lane, cell.row)) A.sound("bad");
    }
    dragging = false;
    hover = null;
  }

  /* ═══════════════════════════ 3B ÇİZİM ═══════════════════════════ */

  var R = null, glFailed = false;
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
    if (!grid.length) resetWorld();
    initGL();
    if (R) {
      G3.resize(R, W, H, function (aspect) { return A.clamp((2 * Math.atan(0.292 / aspect) * 180) / Math.PI, 36, 70); });
      placeCamera();
    }
  }
  function placeCamera() {
    var c = R.camera;
    c.position.set(0, 15.2, 7.4);
    c.lookAt(0, 0, -8.6);
  }

  function initGL() {
    if (R || glFailed) return;
    try {
      R = G3.stage({ theme: "day", fog: [40, 120], far: 300, shadow: { size: 2048, box: [-11, 11, 14, -14], far: 120, dist: 50 } });
      if (!R) {
        glFailed = true;
        return;
      }
      buildWorld();
    } catch (e) {
      A.glError = String((e && e.stack) || e);
      R = null;
      glFailed = true;
    }
  }

  function buildWorld() {
    var s = R.scene;
    var fw = LANES * CW, fd = ROWS * CD;
    // Izgara: dama çim
    var turf = G3.turfTexture(LANES, ROWS, "#4cbb5c", "#40ab52", 96);
    turf.repeat.set(1, 1);
    var pitch = K.mesh(new T.PlaneGeometry(fw, fd), K.std(0xffffff, 0.92, 0, { map: turf, envMapIntensity: 0.3 }), false, true);
    pitch.rotation.x = -Math.PI / 2;
    pitch.position.set(0, 0, wz(Z0 + fd / 2));
    s.add(pitch);
    var apron = K.mesh(new T.PlaneGeometry(120, 120), K.std(0x2e8f45, 0.95, 0, { envMapIntensity: 0.25 }), false, true);
    apron.rotation.x = -Math.PI / 2;
    apron.position.set(0, -0.02, wz(10));
    s.add(apron);
    // çizgiler: saha sınırı + kale çizgisi + ceza alanı
    var chalk = new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });
    function line(x0, zA, x1, zB, w) {
      var len = Math.hypot(x1 - x0, zB - zA);
      var m = new T.Mesh(new T.PlaneGeometry(x0 === x1 ? w : len, x0 === x1 ? len : w), chalk);
      m.rotation.x = -Math.PI / 2;
      m.position.set((x0 + x1) / 2, 0.012, wz((zA + zB) / 2));
      s.add(m);
    }
    var hx = fw / 2 + 0.05;
    line(-hx, Z0, -hx, Z0 + fd, 0.1);
    line(hx, Z0, hx, Z0 + fd, 0.1);
    line(-hx, Z0 + fd, hx, Z0 + fd, 0.1);
    line(-8, GOAL_Z, 8, GOAL_Z, 0.12);
    line(-hx, Z0, hx, Z0, 0.1);

    // Kendi kalen (yakında)
    var goal = new T.Group();
    var white = new T.MeshPhysicalMaterial({ color: 0xf8fafc, roughness: 0.25, clearcoat: 0.5 });
    var GW = fw + 0.6, GH = 2.5, GD = 2.0;
    [-1, 1].forEach(function (sd) {
      var gp = K.mesh(new T.CylinderGeometry(0.1, 0.1, GH, 14), white);
      gp.position.set((sd * GW) / 2, GH / 2, 0);
      goal.add(gp);
    });
    var bar = K.mesh(new T.CylinderGeometry(0.1, 0.1, GW + 0.2, 14), white);
    bar.rotation.z = Math.PI / 2;
    bar.position.y = GH;
    goal.add(bar);
    var netTex = A.S3.netTexture();
    function net(w, h2, rx, ry) {
      var t = netTex.clone();
      t.needsUpdate = true;
      t.repeat.set(rx, ry);
      return new T.Mesh(new T.PlaneGeometry(w, h2), new T.MeshBasicMaterial({ map: t, transparent: true, alphaTest: 0.1, side: T.DoubleSide, depthWrite: false, opacity: 0.8 }));
    }
    var back = net(GW, GH, 30, 8);
    back.position.set(0, GH / 2, GD);
    goal.add(back);
    R.goalNet = back;
    var top = net(GW, GD, 30, 6);
    top.rotation.x = Math.PI / 2;
    top.position.set(0, GH, GD / 2);
    goal.add(top);
    goal.position.z = wz(GOAL_Z - 0.3);
    s.add(goal);

    // Tribünler: iki yan + karşı uç
    R.crowdTex = G3.crowdTexture(kitOf(captain), kitOf(rivalAt(1)));
    [-1, 1].forEach(function (side) {
      var st = G3.standStrip(R, 44, side, fw / 2 + 3.2, R.crowdTex, { depth: 9, rise: 5.5 });
      st.position.z = wz(9);
    });
    var end = G3.standStrip(R, 60, 1, SPAWN_Z + 5, R.crowdTex, { depth: 10, rise: 6.5 });
    end.rotation.y = Math.PI / 2;
    // LED pano (yanlar)
    R.boardTex = K.canvasTex(1024, 64, function () {}, true);
    R.boardTex.repeat.set(2, 1);
    var boardMat = new T.MeshBasicMaterial({ map: R.boardTex, toneMapped: false });
    var dark = K.std(0x16204a, 0.6);
    [-1, 1].forEach(function (side) {
      var b = K.mesh(new T.BoxGeometry(0.2, 0.9, 30), [side < 0 ? dark : boardMat, side < 0 ? boardMat : dark, dark, dark, dark, dark], true, true);
      b.position.set(side * (fw / 2 + 1.5), 0.45, wz(10));
      s.add(b);
    });
    var far = K.mesh(new T.BoxGeometry(fw + 3.2, 0.9, 0.2), [dark, dark, dark, dark, boardMat, dark], true, true);
    far.position.set(0, 0.45, wz(SPAWN_Z + 2.4));
    s.add(far);

    R.crowd = G3.minis(R, 90);
    R.balls = G3.balls(R, 70, 0.19);

    // Hücre vurgusu + koridor vurgusu
    R.cell = new T.Mesh(new T.PlaneGeometry(CW - 0.12, CD - 0.12), new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4, depthWrite: false, toneMapped: false }));
    R.cell.rotation.x = -Math.PI / 2;
    R.cell.position.y = 0.02;
    R.cell.visible = false;
    s.add(R.cell);
    R.laneHi = new T.Mesh(new T.PlaneGeometry(CW - 0.1, fd), new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.1, depthWrite: false, toneMapped: false }));
    R.laneHi.rotation.x = -Math.PI / 2;
    R.laneHi.position.set(0, 0.015, wz(Z0 + fd / 2));
    R.laneHi.visible = false;
    s.add(R.laneHi);

    // Oyuncu halkaları (örneklenmiş)
    var ringGeo = new T.RingGeometry(0.5, 0.64, 28);
    ringGeo.rotateX(-Math.PI / 2);
    R.rings = new T.InstancedMesh(ringGeo, new T.MeshBasicMaterial({ transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false }), 34);
    R.rings.setColorAt(0, new T.Color(1, 1, 1));
    R.rings.frustumCulled = false;
    R.rings.count = 0;
    s.add(R.rings);

    // Enerji küreleri (havuz)
    var boltTex = K.canvasTex(128, 128, function (c) {
      var g = c.createRadialGradient(64, 64, 6, 64, 64, 62);
      g.addColorStop(0, "#FFFBEB");
      g.addColorStop(0.55, "#FDE047");
      g.addColorStop(1, "#F59E0B");
      c.fillStyle = g;
      c.beginPath();
      c.arc(64, 64, 58, 0, Math.PI * 2);
      c.fill();
      c.lineWidth = 6;
      c.strokeStyle = "#FFFFFF";
      c.stroke();
      bolt(c, 64, 64, 34, "#7C2D12");
    });
    R.orbs = [];
    for (var i = 0; i < 10; i++) {
      var grp = new T.Group();
      var glow = new T.Sprite(new T.SpriteMaterial({ map: K.glowTexture(), color: 0xffd24a, transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: 0.9 }));
      glow.scale.set(2.6, 2.6, 1);
      var icon = new T.Sprite(new T.SpriteMaterial({ map: boltTex, depthWrite: false, toneMapped: false, transparent: true }));
      icon.scale.set(0.95, 0.95, 1);
      grp.add(glow, icon);
      grp.visible = false;
      s.add(grp);
      R.orbs.push(grp);
    }
    // Füze patlama halkası
    R.boom = new T.Mesh(new T.RingGeometry(0.75, 1, 48), new T.MeshBasicMaterial({ color: 0xffb020, transparent: true, depthWrite: false, side: T.DoubleSide, blending: T.AdditiveBlending, toneMapped: false }));
    R.boom.rotation.x = -Math.PI / 2;
    R.boom.position.y = 0.05;
    R.boom.visible = false;
    s.add(R.boom);
  }

  function paintBoards(text) {
    if (text === R.boardText) return;
    R.boardText = text;
    var c = R.boardTex.userData.ctx, cw = 1024, ch = 64;
    var g = c.createLinearGradient(0, 0, 0, ch);
    g.addColorStop(0, "#5B3DF5");
    g.addColorStop(1, "#2A1680");
    c.fillStyle = g;
    c.fillRect(0, 0, cw, ch);
    c.font = "900 36px " + A.FONT;
    c.textBaseline = "middle";
    c.fillStyle = "#FFFFFF";
    var unit = c.measureText(text).width || 200;
    for (var px = 0; px < cw; px += unit) c.fillText(text, px, ch * 0.55);
    R.boardTex.needsUpdate = true;
  }

  var looks = {};
  function refreshLooks() {
    var key = rosterSig + ":" + wave;
    if (key === lookKey) return;
    lookKey = key;
    var mine = kitOf(captain), rv = rivalAt(wave), foeKit = kitOf(rv);
    var bib = function (hex, seed) {
      var l = G3.look({ primary: hex, secondary: mine.primary }, seed);
      l.shorts = new T.Color(mine.secondary).multiplyScalar(0.92);
      l.socks = new T.Color(mine.primary);
      return l;
    };
    looks.forvet = G3.look(mine, 5);
    looks.stoper = G3.look(mine, 23);
    looks.cift = G3.look(mine, 61);
    looks.cift.boots = new T.Color("#FB923C");
    looks.kurucu = bib("#FACC15", 11);
    looks.pres = bib("#38BDF8", 35);
    looks.fuze = bib("#F43F5E", 47);
    looks.foe = [0, 1, 2, 3].map(function (i) { return G3.look(foeKit, i * 41 + 9); });
    looks.ice = looks.foe.map(function (l) {
      var o = {};
      for (var k in l) o[k] = l[k].clone().lerp(new T.Color("#7DD3FC"), 0.55);
      return o;
    });
    G3.paintCrowd(R.crowdTex, mine, foeKit);
    paintBoards("ELİTLİG ARENA  •  SAVUNMA HATTI  •  RAKİP: " + String(rv.team.name || "").toLocaleUpperCase("tr-TR") + "  •  ");
  }

  var seenBlast = {};
  var ringM = null, ringC = null;
  function sync(dt) {
    refreshLooks();
    placeCamera();
    if (A.shakeAmt > 0.2) {
      R.camera.position.x += (Math.random() - 0.5) * A.shakeAmt * 0.02;
      R.camera.position.y += (Math.random() - 0.5) * A.shakeAmt * 0.02;
    }
    G3.focus(R, 0, 0, wz(9));
    R.boardTex.offset.x = (A.time * 0.04) % 1;
    if (!ringM) {
      ringM = new T.Matrix4();
      ringC = new T.Color();
    }

    var cr = R.crowd, bl = R.balls;
    cr.begin();
    bl.begin();
    var ri = 0;
    units.forEach(function (u) {
      var U = UNITS[u.type];
      var pop = A.clamp((A.time - u.at) / 0.3, 0, 1);
      var hurt = A.clamp(1 - (A.time - u.hitAt) / 0.15, 0, 1);
      var weak = 1 - u.hp / u.hp0;
      var o = { x: u.x, y: (1 - A.easeOut(pop)) * 2.2, z: wz(u.z), ry: Math.PI, s: 1.5, anim: "idle", t: A.time + u.id, look: looks[u.type], flash: hurt * 0.45, sy: pop < 1 ? 0.75 + 0.25 * A.easeOutBack(pop) : 1, rx: weak > 0.5 ? -(weak - 0.5) * 0.5 : 0 };
      if (u.type === "stoper") {
        o.anim = "block";
        o.s = 1.85;
      } else if (u.type === "kurucu") {
        var m = A.time - u.made;
        if (m < 0.7) {
          o.anim = "cheer";
          o.t = m * 3;
        }
      } else if (u.type === "fuze") {
        var k = A.clamp((A.time - u.at) / 0.9, 0, 1);
        o.anim = "ready";
        o.s = 1.5 + k * 0.7;
        o.flash = 0.5 + 0.5 * Math.sin(A.time * 40) * k;
      } else {
        var kt = (A.time - u.kickAt) / 0.42;
        if (kt >= 0 && kt < 1) {
          o.anim = "kick";
          o.t = kt;
        } else {
          o.anim = "ready";
          o.t = A.time + u.id;
        }
        // ayağının önünde hazır top
        if (!(kt >= 0.4 && kt < 1)) bl.add(u.x - 0.18, 0.19, wz(u.z + 0.55), 0, 1, u.type === "pres" ? "#BAE6FD" : null);
        if (u.type === "cift" && !(kt >= 0.4 && kt < 1)) bl.add(u.x + 0.3, 0.19, wz(u.z + 0.5), 1, 1);
      }
      cr.add(o);
      if (ri < 34) {
        ringM.makeTranslation(u.x, 0.03, wz(u.z));
        R.rings.setMatrixAt(ri, ringM);
        R.rings.setColorAt(ri, ringC.set(U.color));
        ri += 1;
      }
    });
    R.rings.count = ri;
    R.rings.instanceMatrix.needsUpdate = true;
    if (R.rings.instanceColor) R.rings.instanceColor.needsUpdate = true;

    foes.forEach(function (f) {
      var F = FOES[f.type];
      var hurt = A.clamp(1 - (A.time - f.hitAt) / 0.13, 0, 1);
      var set = f.slow > 0 ? looks.ice : looks.foe;
      var lk = set[f.id % set.length];
      if (f.dead) {
        var d = A.clamp((A.time - f.at) / 0.8, 0, 1);
        cr.add({ x: f.x, y: 0, z: wz(f.z + d * 1.2), ry: 0, s: F.s * (1 - Math.max(0, d - 0.6) * 2.5), anim: "fall", t: d * 1.3, look: lk, flash: Math.max(0, 0.7 - d * 3) });
        return;
      }
      var sway = Math.sin(f.phase * 0.5) * 0.06;
      cr.add({ x: f.x + sway, y: 0, z: wz(f.z), ry: 0, s: F.s * (1 - hurt * 0.06), anim: f.eating ? "tackle" : f.type === "kanat" ? "run" : "walk", t: f.eating ? A.time + f.id : f.phase, look: lk, flash: hurt * 0.6, rx: -hurt * 0.12 });
      if (!f.eating) bl.add(f.x + sway + 0.12, 0.19 * (F.s / 1.45), wz(f.z - 0.5 * (F.s / 1.45)), -f.phase * 1.4, F.s / 1.45);
    });
    cr.end();
    shots.forEach(function (s) {
      bl.add(s.x, 0.55, wz(s.z), -A.time * 25 + s.id, 1.05, s.slow ? "#7DD3FC" : null);
      if (!A.reduceMotion && Math.random() < 0.6) R.fx.emit({ x: s.x, y: 0.55, z: wz(s.z - 0.25), vy: 0.3, life: 0.22, size: 0.3, size2: 0.05, color: s.slow ? "#38BDF8" : "#FFFFFF", alpha: 0.5, gravity: 0, drag: 0 });
    });
    bl.end();

    /* Enerji küreleri */
    for (var i = 0; i < R.orbs.length; i++) {
      var g = R.orbs[i], o = orbs[i];
      if (!o) {
        g.visible = false;
        continue;
      }
      g.visible = true;
      var tk = o.taken ? A.clamp((A.time - o.at) / 0.4, 0, 1) : 0;
      var bob = o.y <= 0.76 ? Math.sin(A.time * 3 + o.id) * 0.12 : 0;
      g.position.set(o.x, o.y + bob + tk * 2.5, wz(o.z));
      var sc = (1 + Math.sin(A.time * 6 + o.id) * 0.06) * (1 - tk);
      g.scale.setScalar(Math.max(0.01, sc));
    }

    /* Tek seferlik efektler */
    blasts.forEach(function (b) {
      var key = b.kind + b.x + ":" + b.z + ":" + b.at;
      if (seenBlast[key]) return;
      seenBlast[key] = 1;
      if (b.kind === "hit" || b.kind === "ice") {
        R.fx.burst(6, { x: b.x, y: 0.7, z: wz(b.z), speed: 4, life: 0.3, size: 0.3, color: b.kind === "ice" ? ["#BAE6FD", "#FFFFFF"] : ["#FFFFFF", "#FDE68A"], gravity: 5 });
      } else if (b.kind === "puff") {
        R.dust.burst(14, { x: b.x, y: 0.4, z: wz(b.z), speed: 3, life: 0.6, size: 0.5, size2: 1.1, color: ["#E2E8F0", "#CBD5E1"], alpha: 0.7, gravity: -1 });
      } else if (b.kind === "boom") {
        R.fx.burst(60, { x: b.x, y: 0.8, z: wz(b.z), speed: 13, life: 0.7, size: 0.7, color: ["#FDE047", "#FB923C", "#F43F5E", "#FFFFFF"], gravity: 6 });
        R.dust.burst(30, { x: b.x, y: 0.4, z: wz(b.z), speed: 7, life: 1.0, size: 0.8, size2: 2.2, color: ["#57534E", "#A8A29E", "#44403C"], alpha: 0.6, gravity: -1.5 });
        R.boomAt = { x: b.x, z: b.z, at: b.at };
      }
    });
    if (blasts.length === 0) seenBlast = {};
    if (R.boomAt) {
      var bt = (A.time - R.boomAt.at) / 0.5;
      R.boom.visible = bt < 1;
      R.boom.position.set(R.boomAt.x, 0.06, wz(R.boomAt.z));
      R.boom.scale.setScalar(0.5 + bt * CW * 2.4);
      R.boom.material.opacity = 1 - bt;
    }
    // yerleştirme tozu
    units.forEach(function (u) {
      if (!u.dusted && A.time - u.at > 0.26) {
        u.dusted = true;
        R.dust.burst(10, { x: u.x, y: 0.1, z: wz(u.z), speed: 2.6, up: 0.4, life: 0.5, size: 0.35, size2: 0.8, color: ["#D9F2C4", "#B7E08F"], alpha: 0.6, gravity: 1 });
      }
    });

    /* Hücre vurgusu */
    var show = state === "play" && selected && hover;
    R.cell.visible = !!show;
    R.laneHi.visible = !!show;
    if (show) {
      var ok = canPlace(selected, hover.lane, hover.row);
      R.cell.position.set(cellX(hover.lane), 0.02, wz(cellZ(hover.row)));
      R.cell.material.color.set(ok ? 0xffffff : 0xff4d6d);
      R.cell.material.opacity = 0.35 + 0.12 * Math.sin(A.time * 8);
      R.laneHi.position.x = cellX(hover.lane);
    }
    R.goalNet.position.z = 2.0 + Math.sin(Math.min(1, (1 - goalFlash) * 2.5) * Math.PI) * 0.5 * (goalFlash > 0 ? 1 : 0);
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
    if (R) drawBars(c);
    A.drawParticles(c);
    A.drawFloaters(c, dt);
    if (state !== "attract") {
      drawHud(c);
      drawCards(c);
    }
    A.drawBanner(c, W, Math.max(150, H * 0.24), dt);
    if (flashRed > 0) {
      c.fillStyle = "rgba(251,113,133," + (0.3 * flashRed).toFixed(3) + ")";
      c.fillRect(0, 0, W, H);
    }
  }

  var scrim = null;
  function drawScrim(c) {
    if (!scrim || scrim.w !== W || scrim.h !== H) {
      scrim = A.layer(W, H);
      A.paintVignette(scrim.ctx, W, H, 0.22);
      A.paintTopScrim(scrim.ctx, W, 110);
      var g = scrim.ctx.createLinearGradient(0, H - BAR_H - 40, 0, H);
      g.addColorStop(0, "rgba(8,10,30,0)");
      g.addColorStop(0.45, "rgba(8,10,30,0.72)");
      g.addColorStop(1, "rgba(8,10,30,0.92)");
      scrim.ctx.fillStyle = g;
      scrim.ctx.fillRect(0, H - BAR_H - 40, W, BAR_H + 40);
    }
    A.blit(scrim);
  }

  /** Can çubukları: hasar almış rakip ve oyuncuların üstünde. */
  function drawBars(c) {
    function bar(wx, wy, Z, frac, color, w, label) {
      var p = G3.project(R, wx, wy, wz(Z));
      var bw = w || 30;
      A.roundRect(c, p.x - bw / 2, p.y - 3, bw, 6, 3);
      c.fillStyle = "rgba(8,10,30,0.75)";
      c.fill();
      c.fillStyle = color;
      A.roundRect(c, p.x - bw / 2 + 1, p.y - 2, Math.max(2, (bw - 2) * A.clamp(frac, 0, 1)), 4, 2);
      c.fill();
      if (label) {
        c.font = A.font(10, 900);
        c.textAlign = "center";
        c.textBaseline = "alphabetic";
        c.lineWidth = 3;
        c.strokeStyle = "rgba(8,10,30,0.85)";
        c.strokeText(label, p.x, p.y - 7);
        c.fillStyle = "#FFFFFF";
        c.fillText(label, p.x, p.y - 7);
      }
    }
    c.save();
    foes.forEach(function (f) {
      if (f.dead) return;
      var F = FOES[f.type];
      if (f.type === "kaptan") bar(f.x, F.s * 1.2 + 0.3, f.z, f.hp / f.hp0, "#F43F5E", 56, "KAPTAN · " + bossName(wave));
      else if (f.hp < f.hp0) bar(f.x, F.s * 1.2 + 0.15, f.z, f.hp / f.hp0, f.slow > 0 ? "#38BDF8" : "#F43F5E", 26);
    });
    units.forEach(function (u) {
      if (u.hp < u.hp0 && u.type !== "fuze") bar(u.x, u.type === "stoper" ? 2.5 : 2.05, u.z, u.hp / u.hp0, "#34D399", 28);
    });
    c.restore();
  }

  /* ─────────────── simgeler ─────────────── */

  function bolt(c, x, y, r, col) {
    c.save();
    c.fillStyle = col;
    c.beginPath();
    c.moveTo(x + r * 0.18, y - r);
    c.lineTo(x - r * 0.55, y + r * 0.12);
    c.lineTo(x - r * 0.05, y + r * 0.12);
    c.lineTo(x - r * 0.22, y + r);
    c.lineTo(x + r * 0.55, y - r * 0.2);
    c.lineTo(x + r * 0.05, y - r * 0.2);
    c.closePath();
    c.fill();
    c.restore();
  }
  var iconOrient = null;
  function drawIcon(c, type, x, y, r, col) {
    if (!iconOrient) iconOrient = A.orientation();
    c.save();
    if (type === "kurucu") bolt(c, x, y, r, col);
    else if (type === "forvet") A.drawBall(c, x, y, r * 0.86, iconOrient);
    else if (type === "cift") {
      A.drawBall(c, x - r * 0.38, y + r * 0.12, r * 0.6, iconOrient);
      A.drawBall(c, x + r * 0.42, y - r * 0.2, r * 0.6, iconOrient);
    } else if (type === "pres") {
      A.drawBall(c, x, y, r * 0.86, iconOrient);
      c.fillStyle = "rgba(56,189,248,0.55)";
      c.beginPath();
      c.arc(x, y, r * 0.86, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = "#E0F2FE";
      c.lineWidth = r * 0.14;
      c.lineCap = "round";
      for (var i = 0; i < 3; i++) {
        var a = (i * Math.PI) / 3;
        c.beginPath();
        c.moveTo(x - Math.cos(a) * r * 0.55, y - Math.sin(a) * r * 0.55);
        c.lineTo(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55);
        c.stroke();
      }
    } else if (type === "stoper") {
      c.fillStyle = col;
      c.beginPath();
      c.moveTo(x - r * 0.8, y - r * 0.85);
      c.lineTo(x + r * 0.8, y - r * 0.85);
      c.lineTo(x + r * 0.8, y + r * 0.1);
      c.quadraticCurveTo(x + r * 0.8, y + r * 0.75, x, y + r);
      c.quadraticCurveTo(x - r * 0.8, y + r * 0.75, x - r * 0.8, y + r * 0.1);
      c.closePath();
      c.fill();
      c.fillStyle = "rgba(8,10,30,0.35)";
      c.fillRect(x - r * 0.1, y - r * 0.6, r * 0.2, r * 1.2);
      c.fillRect(x - r * 0.5, y - r * 0.2, r, r * 0.2);
    } else if (type === "fuze") {
      c.fillStyle = "#FDBA74";
      c.beginPath();
      c.moveTo(x - r * 0.9, y + r * 0.9);
      c.quadraticCurveTo(x - r * 0.2, y + r * 0.3, x - r * 0.15, y - r * 0.05);
      c.lineTo(x + r * 0.2, y + r * 0.25);
      c.quadraticCurveTo(x - r * 0.3, y + r * 0.5, x - r * 0.9, y + r * 0.9);
      c.fill();
      A.drawBall(c, x + r * 0.25, y - r * 0.25, r * 0.6, iconOrient);
      c.strokeStyle = col;
      c.lineWidth = r * 0.16;
      c.beginPath();
      c.arc(x + r * 0.25, y - r * 0.25, r * 0.72, 0, Math.PI * 2);
      c.stroke();
    } else if (type === "shovel") {
      c.strokeStyle = col;
      c.lineWidth = r * 0.22;
      c.lineCap = "round";
      c.beginPath();
      c.moveTo(x - r * 0.55, y - r * 0.55);
      c.lineTo(x + r * 0.55, y + r * 0.55);
      c.moveTo(x + r * 0.55, y - r * 0.55);
      c.lineTo(x - r * 0.55, y + r * 0.55);
      c.stroke();
    }
    c.restore();
  }

  function drawCards(c) {
    var cs = cards();
    c.save();
    c.textAlign = "center";
    c.textBaseline = "middle";
    cs.forEach(function (b) {
      var U = UNITS[b.key];
      var cool = Math.max(0, (ready[b.key] || 0) - A.time) / U.recharge;
      var afford = energy >= U.cost;
      var on = selected === b.key;
      var lift = on ? -8 : 0;
      c.save();
      c.translate(0, lift);
      c.globalAlpha = afford && cool <= 0 ? 1 : 0.62;
      A.roundRect(c, b.x, b.y, b.w, b.h, 10);
      var g = c.createLinearGradient(0, b.y, 0, b.y + b.h);
      g.addColorStop(0, "rgba(38,44,92,0.96)");
      g.addColorStop(1, "rgba(12,15,40,0.96)");
      c.fillStyle = g;
      c.fill();
      c.lineWidth = on ? 2.5 : 1.2;
      c.strokeStyle = on ? "#FFFFFF" : U.color;
      c.stroke();
      c.fillStyle = U.color;
      A.roundRect(c, b.x + 5, b.y + 5, b.w - 10, 3, 1.5);
      c.fill();
      drawIcon(c, b.key, b.x + b.w / 2, b.y + 28, 13, U.color);
      c.font = A.font(8.5, 900);
      c.fillStyle = "rgba(255,255,255,0.92)";
      c.fillText(U.name, b.x + b.w / 2, b.y + 49);
      c.font = A.font(11, 900);
      c.fillStyle = afford ? P.gold : "#FB7185";
      bolt(c, b.x + b.w / 2 - 13, b.y + 62, 5.5, afford ? P.gold : "#FB7185");
      c.fillText(String(U.cost), b.x + b.w / 2 + 4, b.y + 62.5);
      if (cool > 0) {
        c.globalAlpha = 0.72;
        c.fillStyle = "#050817";
        A.roundRect(c, b.x, b.y, b.w, b.h * cool, 10);
        c.fill();
      }
      c.restore();
    });
    // ÇIKAR
    var sh = cs.shovel;
    c.beginPath();
    c.arc(sh.x + sh.w / 2, sh.y + sh.h / 2, sh.w / 2, 0, Math.PI * 2);
    c.fillStyle = removing ? "rgba(244,63,94,0.9)" : "rgba(12,15,40,0.85)";
    c.fill();
    c.lineWidth = 1.5;
    c.strokeStyle = removing ? "#FFFFFF" : "rgba(255,255,255,0.35)";
    c.stroke();
    drawIcon(c, "shovel", sh.x + sh.w / 2, sh.y + sh.h / 2, 11, "#FFFFFF");
    c.font = A.font(8, 800);
    c.fillStyle = "rgba(255,255,255,0.8)";
    c.fillText("ÇIKAR", sh.x + sh.w / 2, sh.y + sh.h + 9);

    // Enerji hapı
    var ey = cs[0].y - 34, ex = cs[0].x;
    var es = 1 + energyBump * 0.15;
    c.save();
    c.translate(ex + 44, ey + 13);
    c.scale(es, es);
    A.pill(c, -44, -13, 88, 26, "rgba(12,15,40,0.88)");
    bolt(c, -28, 0, 9, P.gold);
    c.font = A.font(15, 900);
    c.fillStyle = "#FFFFFF";
    c.textAlign = "left";
    c.fillText(String(Math.floor(energy)), -16, 1);
    c.restore();

    // İpucu
    var hint = "";
    if (removing) hint = "Çıkarılacak oyuncuya dokun";
    else if (selected) hint = UNITS[selected].name + ": kareye dokun ya da sürükle";
    else if (placed === 0) hint = "Kart seç, sahaya koy · önce KURUCU";
    else if (orbs.some(function (o) { return !o.taken; }) && placed < 4) hint = "Parlayan enerjiye dokun, topla";
    if (hint) {
      c.font = A.font(11, 700);
      c.textAlign = "left";
      var hw = Math.min(W - ex - 110, c.measureText(hint).width + 20);
      A.pill(c, ex + 96, ey, hw, 26, "rgba(12,15,40,0.7)");
      c.fillStyle = "rgba(255,255,255,0.92)";
      c.fillText(hint, ex + 106, ey + 13.5, hw - 18);
    }
    c.restore();
  }

  function drawHud(c) {
    var top = 14;
    A.drawScore(c, 18, top, "PUAN", points, scoreBump);
    A.drawLives(c, W - 26, top + 12, lives, LIVES, 9);
    c.save();
    c.textBaseline = "middle";
    c.textAlign = "center";
    var lbl = wave + ". DALGA";
    c.font = A.font(12, 800);
    var lw = c.measureText(lbl).width + 22;
    A.pill(c, W - 16 - lw, top + 30, lw, 26, "rgba(60,36,200,0.8)");
    c.fillStyle = "#fff";
    c.fillText(lbl, W - 16 - lw / 2, top + 43.5);
    // Dalga ilerlemesi + rakip takım
    var rv = rivalAt(wave);
    var total = Math.max(1, surgeAt + 6);
    var prog = waveState === "rest" ? 1 : A.clamp(waveT / total, 0, 1);
    var bw = Math.min(W - 36, 300), bx = W / 2 - bw / 2, by = top + 72;
    A.roundRect(c, bx, by, bw, 26, 9);
    c.fillStyle = "rgba(8,10,30,0.62)";
    c.fill();
    c.fillStyle = kitOf(rv).primary;
    c.fillRect(bx, by + 5, 4, 16);
    c.font = A.font(11, 800);
    c.textAlign = "left";
    c.fillStyle = "#FFFFFF";
    var name = String(rv.team.name || "Rakip");
    while (name.length > 3 && c.measureText(name).width > bw * 0.42) name = name.slice(0, -2) + "…";
    c.fillText(name, bx + 12, by + 13.5);
    var px = bx + bw * 0.5, pw = bw * 0.5 - 12;
    A.roundRect(c, px, by + 10.5, pw, 6, 3);
    c.fillStyle = "rgba(255,255,255,0.16)";
    c.fill();
    c.fillStyle = surged ? "#F43F5E" : P.gold;
    A.roundRect(c, px, by + 10.5, Math.max(4, pw * prog), 6, 3);
    c.fill();
    // büyük hücum işareti
    var sx = px + pw * A.clamp(surgeAt / total, 0, 1);
    c.fillStyle = "#F43F5E";
    c.beginPath();
    c.moveTo(sx, by + 5);
    c.lineTo(sx + 7, by + 8.5);
    c.lineTo(sx, by + 12);
    c.closePath();
    c.fill();
    c.fillRect(sx - 1, by + 5, 1.5, 15);
    c.restore();
  }

  function debug() {
    return {
      state: state, energy: energy, points: points, lives: lives, wave: wave, defeated: defeated, conceded: conceded, placed: placed,
      units: units, foes: foes, shots: shots, orbs: orbs, queue: queue, waveState: waveState, gl: !!R,
      captain: captain.short, rival: rivalAt(wave).team.name, UNITS: UNITS, FOES: FOES, LANES: LANES, ROWS: ROWS,
      place: place, collect: collect, usable: usable, cards: cards,
      setEnergy: function (v) { energy = v; },
      spawn: function (type, lane, zz) {
        var F = FOES[type];
        var f = { id: ++uid, type: type, lane: lane, x: cellX(lane), z: zz == null ? SPAWN_Z : zz, hp: F.hp, hp0: F.hp, v: F.v, slow: 0, hitAt: -9, eating: null, phase: 0, dead: false, at: 0 };
        foes.push(f);
        return f;
      },
      clearQueue: function () { queue.length = 0; },
    };
  }

  A.register({ resize: resize, start: start, update: update, render: render, down: down, move: move, up: up, debug: debug, setRoster: setRoster });
})();
