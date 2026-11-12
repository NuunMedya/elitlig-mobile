/*
 * SAVUNMA HATTI 3B — şeritli kale savunması. Rakip hücumcular SAĞDAN gelir,
 * beş YATAY koridorda SOLDAKİ kalene yürür; sen koridorlara oyuncularını
 * dizersin. Forvetlerin top atar, stoperlerin duvar olur, oyun kurucuların
 * ENERJİ üretir. Kalene ulaşan her rakip bir GOL: üç gol yersen maç biter.
 *
 * MİMARİ: simülasyon (ızgara, dalgalar, hasar, enerji, puan) çizimden
 * bağımsızdır; başsız testler yalnız onu koşturur. Simülasyonda her rakip ve
 * oyuncu bir KORİDOR (lane) ve koridor boyunca kaleye UZAKLIK (z, metre) ile
 * tanımlıdır; ekranda koridorlar satırdır, z soldan sağa artar. Çizim arcade
 * motorunda (games/arcade3d.js): örneklenmiş mini futbolcular, örneklenmiş
 * toplar, GPU parçacıkları. Kamera sahayı önden-yukarıdan görür ve DİKEY
 * telefona sığdırılır (fitCamera): saha, üstteki skor şeridi ile alttaki kart
 * tepsisi arasındaki alanı doldurur; koridor derinliği ekran oranına göre seçilir.
 *
 * GERÇEK İÇERİK (RN'den {type:"config", roster:{captain, rivals}}): oyuncuların
 * seçtiğin oyuncunun kulübünün formasını giyer; her DALGA ligin bir takımıdır
 * (forma, ad). Dalganın sonunda o takımın KAPTANI gelir.
 *
 * IZGARA: 5 koridor × 6 sütun. Rakip z = 17,5 m'de doğar, z = 0,8'de gol atar.
 *
 * OYUNCULAR (kart · enerji · görev · açıldığı dalga):
 *   KURUCU   50   6,5 sn'de bir +25 enerji (ilk 3 sn); 6 sn sonra kendiliğinden toplanır. 1
 *   FORVET   75   koridorunda rakip varsa 1,4 sn'de bir şut (25 hasar). 1
 *   STOPER   50   2400 can; rakibi oyalar. 1
 *   FISKİYE  25   tuzak: üstünden geçen rakip yarı hıza düşer, ıslanır (12/sn). 2
 *   FÜZE     125  0,9 sn sonra 3×3 alanı temizler (1800 hasar). 2
 *   PRES     150  şutu rakibi 3,5 sn yarı hıza düşürür. 3
 *   KALECİ   150  ilk dokunan rakibi KAPAR (kaptana 500); 10 sn topu tutar. 3
 *   ORTACI   175  kendi ve iki komşu koridora orta: 45 alan hasarı. 4
 *   ÇİFT     175  her seferinde iki şut. 4
 *   HAKEM    100  anında: düdük çalar, bütün rakipler 4 sn donar (+20 hasar). 5
 * Gökten de enerji düşer (+25, arada altın +50): dokun, topla. ÇIKAR oyuncuyu kaldırır.
 *
 * RAKİPLER: HÜCUMCU (200 can), KANAT (hızlı, 150; 3. dalga), SANTRFOR (480;
 * 4. dalga), KAPTAN (2. dalgadan itibaren dalga sonu, 1000+). Temas ettiği
 * oyuncuya saniyede 100 hasar verir.
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
  var CD = 2.2, Z0 = 1.9; // sütun uzunluğu (koridor boyunca), ilk sütunun başı
  var SPAWN_Z = Z0 + ROWS * CD + 2.4, GOAL_Z = 0.8;
  var LIVES = 3;
  var SHOT_V = 11, SHOT_DMG = 25;
  var START_ENERGY = 300, SKY_V = 25, CLEAR_ENERGY = 100;

  var UNITS = {
    kurucu: { name: "KURUCU", cost: 50, hp: 300, recharge: 5, color: "#FACC15", unlock: 1, desc: "Enerji üretir" },
    forvet: { name: "FORVET", cost: 75, hp: 300, recharge: 4, color: "#8B7BFF", unlock: 1, desc: "Şut atar" },
    stoper: { name: "STOPER", cost: 50, hp: 2400, recharge: 14, color: "#CBD5E1", unlock: 1, desc: "Duvar olur" },
    fiskiye: { name: "FISKİYE", cost: 25, hp: 1, recharge: 8, color: "#2DD4BF", unlock: 2, desc: "Çimi ıslatır, yavaşlatır", trap: true },
    fuze: { name: "FÜZE", cost: 125, hp: 9999, recharge: 24, color: "#F43F5E", unlock: 2, desc: "3×3 temizler" },
    pres: { name: "PRES", cost: 150, hp: 300, recharge: 7, color: "#38BDF8", unlock: 3, desc: "Yavaşlatır" },
    kaleci: { name: "KALECİ", cost: 150, hp: 1200, recharge: 14, color: "#A3E635", unlock: 3, desc: "Rakibi kapar" },
    ortaci: { name: "ORTACI", cost: 175, hp: 300, recharge: 8, color: "#E879F9", unlock: 4, desc: "Üç koridora orta" },
    cift: { name: "ÇİFT", cost: 175, hp: 300, recharge: 7, color: "#FB923C", unlock: 4, desc: "İki şut" },
    hakem: { name: "HAKEM", cost: 100, hp: 1, recharge: 35, color: "#FDE047", unlock: 5, desc: "Herkesi dondurur", instant: true },
  };
  var ORDER = ["kurucu", "forvet", "stoper", "fiskiye", "fuze", "pres", "kaleci", "ortaci", "cift", "hakem"];
  var FOES = {
    hucum: { hp: 200, v: 0.43, pts: 10, s: 2.5, cost: 1 },
    kanat: { hp: 150, v: 0.8, pts: 15, s: 2.3, cost: 1.5 },
    santrfor: { hp: 480, v: 0.36, pts: 25, s: 3.0, cost: 3 },
    kaptan: { hp: 1000, v: 0.3, pts: 80, s: 3.5, cost: 0 },
  };
  var EAT = 100; // temas hasarı / sn
  var PRODUCE = 6.5, FIRST_PRODUCE = 3, AUTO_COLLECT = 6, FIRE = 1.4;
  var LOB_EVERY = 2.6, LOB_DMG = 45, LOB_T = 0.75;
  var CHEW = 10, FREEZE = 4, WET_DPS = 12;
  var US = 2.5; // oyuncu ölçeği

  var W = 0, H = 0;
  var state = "attract"; // attract | play | dying | over
  var grid = []; // grid[lane][row] = unit | null
  var units = [], foes = [], shots = [], lobs = [], orbs = [], blasts = [], refs = [];
  var energy = START_ENERGY, points = 0, lives = LIVES, wave = 1, defeated = 0, placed = 0, conceded = 0;
  var queue = []; // { t, type, lane }
  var waveT = 0, waveState = "run"; // run | rest
  var restT = 0, surgeAt = 0, surged = false;
  var skyT = 2.5, skyN = 0;
  var ready = {}; // kartın yeniden kullanılabileceği an (A.time)
  var selected = null, dragging = false, hover = null, removing = false, pointer = null;
  var scoreBump = 0, energyBump = 0, flashRed = 0, stateT = 0, goalFlash = 0, lockedTip = null;
  var uid = 0;
  var zaps = []; // enerji pile uçan ışıklar (ekran)

  /* Dünya yerleşimi: x = koridor boyunca (kale solda), z = koridorlar (0 üstte). */
  var MID = 7.35; // görünen bandın ortası (kale ağı −1,6 … sağ kenar 16,3)
  var SPAN = 17.9;
  var LD = 4.8; // koridor derinliği (m) — ekran oranından seçilir
  function WX(Z) {
    return Z - MID;
  }
  function laneZ(l) {
    return (l - (LANES - 1) / 2) * LD;
  }
  function cellZ(row) {
    return Z0 + row * CD + CD / 2;
  }
  function unlocked(type) {
    return wave >= UNITS[type].unlock;
  }
  function canPlace(type, lane, row) {
    if (!UNITS[type] || lane < 0 || row < 0 || lane >= LANES || row >= ROWS) return false;
    return UNITS[type].instant ? true : !grid[lane][row];
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
    lobs = [];
    orbs = [];
    blasts = [];
    refs = [];
    zaps = [];
    energy = START_ENERGY;
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
    skyT = 2.5;
    skyN = 0;
    buildWave();
  }

  /** Dalga planı: seyrek başlar, yavaş sıklaşır, BÜYÜK HÜCUM ve kaptanla biter. */
  function buildWave() {
    queue = [];
    waveT = 0;
    waveState = "run";
    surged = false;
    var total = 3 + wave * 2.4 + Math.max(0, wave - 5) * 2;
    var surge = total * 0.35;
    var budget = total;
    var t = wave === 1 ? 18 : 5;
    var gap = Math.max(3, 10.5 - wave * 1.0);
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
      if (wave >= 4 && r < Math.min(0.3, 0.1 + wave * 0.025) && budget >= 3) return "santrfor";
      if (wave >= 3 && r < 0.42) return "kanat";
      return "hucum";
    }
    while (budget > surge) {
      var ty = pick();
      queue.push({ t: t, type: ty, lane: lane() });
      budget -= FOES[ty].cost;
      t += gap * A.rand(0.75, 1.15);
      gap = Math.max(2.6, gap * 0.94);
    }
    t += 4;
    surgeAt = t;
    while (budget > 0) {
      var ty2 = pick();
      queue.push({ t: t + Math.random() * 5, type: ty2, lane: lane() });
      budget -= FOES[ty2].cost;
    }
    if (wave >= 2) queue.push({ t: t + 1.5, type: "kaptan", lane: 1 + ((Math.random() * 3) | 0) });
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
    if (U.instant) {
      whistle(lane, row);
      return true;
    }
    var u = {
      id: ++uid, type: type, lane: lane, row: row, lz: laneZ(lane), z: cellZ(row), hp: U.hp, hp0: U.hp, at: A.time,
      next: type === "kurucu" ? FIRST_PRODUCE : type === "fuze" ? 0.9 : type === "kaleci" ? 0 : 0.6,
      kickAt: -9, second: -1, hitAt: -9, made: -9, caught: -9,
    };
    grid[lane][row] = u;
    units.push(u);
    if (!free) {
      A.sound("place");
      A.haptic("light");
      if (R) {
        var p = G3.project(R, WX(u.z), 0.2, u.lz);
        A.ring(p.x, p.y, U.color, 48, 7);
      }
    }
    return true;
  }
  function removeUnit(u, silent) {
    if (grid[u.lane][u.row] === u) grid[u.lane][u.row] = null;
    var i = units.indexOf(u);
    if (i >= 0) units.splice(i, 1);
    u.gone = true;
    if (!silent) blasts.push({ kind: "puff", lz: u.lz, z: u.z, at: A.time });
  }

  /** HAKEM: düdük — sahadaki bütün rakipler donar. */
  function whistle(lane, row) {
    foes.forEach(function (f) {
      if (f.dead) return;
      f.frozen = FREEZE;
      hurtFoe(f, 20, false);
    });
    refs.push({ lz: laneZ(lane), z: cellZ(row), at: A.time, id: ++uid });
    blasts.push({ kind: "whistle", lz: laneZ(lane), z: cellZ(row), at: A.time });
    if (state === "play") {
      A.sound("whistle");
      A.haptic("heavy");
      A.flash("#FDE047", 0.32);
      A.punch(0.7);
      A.ring(W / 2, H * 0.45, "#FDE047", Math.max(W, H) * 0.6, 16);
      A.announce("DÜDÜK!", "Rakipler " + FREEZE + " sn dondu", "#FDE047");
    }
  }

  function addEnergy(v, Z, lz) {
    energy = Math.min(9990, energy + v);
    energyBump = 1;
    if (state === "play" && Z != null) floatAt("+" + v, Z, lz, 1.8, P.gold, 18);
  }
  function collect(o) {
    if (o.taken) return;
    o.taken = true;
    o.at = A.time;
    addEnergy(o.v, o.z, o.lz);
    if (R) {
      var es = G3.project(R, WX(o.z), o.y, o.lz);
      A.sparkle(es.x, es.y, o.v > 25 ? 18 : 10, "#FDE047");
      for (var i = 0; i < (o.v > 25 ? 3 : 1); i++) zaps.push({ x: es.x + (Math.random() - 0.5) * 20, y: es.y + (Math.random() - 0.5) * 20, t: -i * 0.06, bend: (Math.random() - 0.5) * 120 });
    }
    A.sound("coin");
    A.haptic("light");
  }

  /* ─────────────────────────── güncelleme ─────────────────────────── */

  function hurtFoe(f, dmg, slow, quiet) {
    if (f.dead) return;
    f.hp -= dmg;
    if (!quiet) f.hitAt = A.time;
    if (slow) f.slow = Math.max(f.slow, 3.5);
    if (f.hp <= 0) {
      f.dead = true;
      f.at = A.time;
      if (state === "play") {
        defeated += 1;
        points += FOES[f.type].pts;
        scoreBump = 1;
        floatAt("+" + FOES[f.type].pts, f.z, f.lz, 2.8, f.type === "kaptan" ? P.gold : "#FFFFFF", f.type === "kaptan" ? 26 : 18);
        blasts.push({ kind: "ko", lz: f.lz, z: f.z, at: A.time, boss: f.type === "kaptan" });
        if (f.type === "kaptan") {
          A.sound("cheer");
          A.haptic("success");
          A.hitstop(0.12);
          A.punch(0.8);
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
        var demo = [
          ["kurucu", "forvet", null, "stoper"],
          ["forvet", "ortaci", null, null, "fiskiye"],
          ["kurucu", "cift", null, "kaleci"],
          ["forvet", "pres", null, "stoper"],
          ["kurucu", "forvet", null, "fiskiye"],
        ];
        demo.forEach(function (row, l) {
          row.forEach(function (ty, r) {
            if (ty) place(ty, l, r, true);
          });
        });
        [[0, 12.5, "hucum"], [2, 14.5, "santrfor"], [3, 10.8, "kanat"], [4, 15.5, "hucum"]].forEach(function (q) {
          foes.push({ id: ++uid, type: q[2], lane: q[0], lz: laneZ(q[0]), z: q[1], hp: FOES[q[2]].hp, hp0: FOES[q[2]].hp, v: FOES[q[2]].v, slow: 0, frozen: 0, wet: 0, hitAt: -9, eating: null, phase: Math.random() * 6, dead: false, at: 0 });
        });
      }
      if (!queue.length && foes.length < 4) {
        waveT = 0;
        for (var qd = 0; qd < 6; qd++) queue.push({ t: 0.5 + qd * 1.8, type: qd % 3 === 2 ? "kanat" : qd === 4 ? "santrfor" : "hucum", lane: (qd * 2 + 1) % LANES });
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
        var scale = wave > 5 ? 1 + 0.14 * (wave - 5) : 1;
        var hp = Math.round((q.type === "kaptan" ? F.hp + 220 * (wave - 2) : F.hp) * scale);
        foes.push({ id: ++uid, type: q.type, lane: q.lane, lz: laneZ(q.lane), z: SPAWN_Z + Math.random() * 0.8, hp: hp, hp0: hp, v: F.v * A.rand(0.94, 1.06), slow: 0, frozen: 0, wet: 0, hitAt: -9, eating: null, phase: Math.random() * 6, dead: false, at: 0 });
      }
      if (playing && !queue.length && !foes.some(function (f) { return !f.dead; })) {
        waveState = "rest";
        restT = 5;
        var bonus = 50 * wave;
        points += bonus;
        scoreBump = 1;
        addEnergy(CLEAR_ENERGY, cellZ(2), laneZ(2));
        A.announce(wave + ". DALGA TEMİZ", "+" + bonus + " puan · +" + CLEAR_ENERGY + " enerji");
        A.sound("level");
        A.haptic("success");
      }
    } else {
      restT -= dt;
      if (restT <= 0) {
        wave += 1;
        buildWave();
        var news = ORDER.filter(function (k) { return UNITS[k].unlock === wave; });
        A.announce(wave + ". DALGA", news.length ? "YENİ: " + news.map(function (k) { return UNITS[k].name; }).join(" + ") : "Rakip: " + String(rivalAt(wave).team.name || "Rakip"));
        if (news.length) A.sound("power");
        else A.sound("whistle");
        if (R) G3.setTheme(R, ["day", "day", "sunset", "sunset", "night", "night"][(wave - 1) % 6]);
      }
    }

    /* Gökten enerji */
    if (playing) {
      skyT -= dt;
      if (skyT <= 0) {
        skyT = A.rand(4.5, 6.5);
        skyN += 1;
        var sl = (Math.random() * LANES) | 0;
        orbs.push({ id: ++uid, lz: laneZ(sl) + A.rand(-0.6, 0.6), z: cellZ((Math.random() * ROWS) | 0) + A.rand(-0.4, 0.4), y: 10, v: skyN % 5 === 0 ? SKY_V * 2 : SKY_V, born: A.time, taken: false, at: 0, sky: true });
      }
    }
    for (var oi = orbs.length - 1; oi >= 0; oi--) {
      var o = orbs[oi];
      if (!o.taken) {
        o.y = Math.max(0.9, o.y - (o.sky ? 2.4 : 5) * dt);
        if (o.sky && A.time - o.born > 16) orbs.splice(oi, 1);
        else if (state === "attract" && A.time - o.born > 2.5) orbs.splice(oi, 1);
        else if (playing && !o.sky && A.time - o.born > AUTO_COLLECT) collect(o);
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
      var ty3 = u.type;
      if (ty3 === "kurucu") {
        if (u.next <= 0) {
          u.next = PRODUCE;
          u.made = A.time;
          orbs.push({ id: ++uid, lz: u.lz + A.rand(-0.4, 0.4), z: u.z + A.rand(-0.5, 0.5), y: 2.6, v: 25, born: A.time, taken: false, at: 0, sky: false });
        }
      } else if (ty3 === "fuze") {
        if (u.next <= 0) {
          for (var bf = 0; bf < foes.length; bf++) {
            var e = foes[bf];
            if (Math.abs(e.lane - u.lane) <= 1 && Math.abs(e.z - u.z) <= CD * 1.5) hurtFoe(e, 1800, false);
          }
          blasts.push({ kind: "boom", lz: u.lz, z: u.z, at: A.time });
          removeUnit(u, true);
          if (playing) {
            A.sound("boom");
            A.shake(12);
            A.haptic("heavy");
          }
        }
      } else if (ty3 === "ortaci") {
        if (u.next <= 0) {
          var tgt = null;
          for (var of = 0; of < foes.length; of++) {
            var fo = foes[of];
            if (fo.dead || Math.abs(fo.lane - u.lane) > 1 || fo.z < u.z - 0.2 || fo.z > SPAWN_Z - 1) continue;
            if (!tgt || fo.z < tgt.z) tgt = fo;
          }
          if (tgt) {
            var mv = tgt.eating || tgt.frozen > 0 ? 0 : tgt.v * (tgt.slow > 0 ? 0.5 : 1);
            lobs.push({ id: ++uid, lane: tgt.lane, z0: u.z + 0.4, lz0: u.lz, z1: Math.max(GOAL_Z, tgt.z - mv * LOB_T), lz1: tgt.lz, t: 0 });
            u.kickAt = A.time;
            u.next = LOB_EVERY;
            if (playing && Math.random() < 0.4) A.sound("kick");
          } else u.next = 0.25;
        }
      } else if (ty3 === "forvet" || ty3 === "pres" || ty3 === "cift") {
        var threat = false;
        for (var tf = 0; tf < foes.length; tf++)
          if (!foes[tf].dead && foes[tf].lane === u.lane && foes[tf].z > u.z - 0.2 && foes[tf].z < SPAWN_Z - 1) {
            threat = true;
            break;
          }
        if (threat && u.next <= 0.16 && u.kickAt < A.time - 0.6) u.kickAt = A.time;
        if (u.next <= 0) {
          if (threat) {
            shots.push({ lane: u.lane, lz: u.lz, z: u.z + 0.6, slow: ty3 === "pres", dmg: SHOT_DMG, id: ++uid, kind: ty3 });
            if (ty3 === "cift") u.second = 0.2;
            u.next = FIRE;
            if (playing && Math.random() < 0.25) A.sound("shoot");
          } else u.next = 0.2;
        }
        if (u.second > 0) {
          u.second -= dt;
          if (u.second <= 0) {
            shots.push({ lane: u.lane, lz: u.lz, z: u.z + 0.6, slow: false, dmg: SHOT_DMG, id: ++uid, kind: "cift" });
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
        blasts.push({ kind: s.slow ? "ice" : "hit", lz: s.lz, z: hit.z - 0.3, at: A.time });
        shots.splice(si, 1);
      } else if (s.z > SPAWN_Z + 3) shots.splice(si, 1);
    }

    /* Ortalar (havadan alan hasarı) */
    for (var li = lobs.length - 1; li >= 0; li--) {
      var lb = lobs[li];
      lb.t += dt / LOB_T;
      if (lb.t >= 1) {
        for (var lf = 0; lf < foes.length; lf++) {
          var fl = foes[lf];
          if (!fl.dead && fl.lane === lb.lane && Math.abs(fl.z - lb.z1) < 1.6) hurtFoe(fl, LOB_DMG, false);
        }
        blasts.push({ kind: "splash", lz: lb.lz1, z: lb.z1, at: A.time });
        lobs.splice(li, 1);
      }
    }

    /* Rakipler */
    for (var fi = foes.length - 1; fi >= 0; fi--) {
      var f = foes[fi];
      if (f.dead) {
        if (A.time - f.at > 0.9) foes.splice(fi, 1);
        continue;
      }
      f.slow = Math.max(0, f.slow - dt);
      f.wet = Math.max(0, f.wet - dt);
      if (f.frozen > 0) {
        f.frozen = Math.max(0, f.frozen - dt);
        f.eating = null;
        continue;
      }
      // önündeki oyuncu (aynı koridor, temas mesafesinde); fıskiye ıslatır
      var victim = null;
      for (var r = ROWS - 1; r >= 0; r--) {
        var cand = grid[f.lane][r];
        if (!cand) continue;
        if (cand.type === "fiskiye") {
          if (Math.abs(f.z - cand.z) < CD * 0.5) {
            f.slow = Math.max(f.slow, 1.2);
            f.wet = 0.4;
            hurtFoe(f, WET_DPS * dt, false, true);
          }
          continue;
        }
        if (cand.type !== "fuze" && f.z - cand.z < 0.85 && f.z - cand.z > -0.4) {
          victim = cand;
          break;
        }
      }
      if (f.dead) continue;
      if (victim && victim.type === "kaleci" && victim.next <= 0) {
        victim.next = CHEW;
        victim.caught = A.time;
        hurtFoe(f, f.type === "kaptan" ? 500 : 1e6, false);
        blasts.push({ kind: "catch", lz: victim.lz, z: victim.z, at: A.time });
        if (playing) {
          A.sound("pop");
          A.haptic("medium");
          floatAt("KURTARIŞ!", victim.z, victim.lz, 3.2, "#A3E635", 18);
        }
        if (f.dead) continue;
      }
      f.eating = victim;
      if (victim) {
        if (state !== "attract") victim.hp -= EAT * dt * (f.type === "kaptan" ? 2 : 1);
        victim.hitAt = A.time;
      } else {
        f.z -= f.v * (f.slow > 0 ? 0.5 : 1) * dt;
        f.phase += dt * f.v * (f.slow > 0 ? 0.5 : 1) * 9;
      }
      if (f.z <= GOAL_Z) {
        foes.splice(fi, 1);
        blasts.push({ kind: "goal", lz: f.lz, z: GOAL_Z, at: A.time });
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
    for (var ri = refs.length - 1; ri >= 0; ri--) if (A.time - refs[ri].at > 1.6) refs.splice(ri, 1);
  }

  /* ─────────────────────────── girdi ─────────────────────────── */

  /** Kart tepsisi: iki sıra × beş kart; üstünde enerji hapı, ipucu ve ÇIKAR. */
  function tray() {
    var pad = 10, gap = 6, cols = 5;
    var cw = Math.min(78, (W - 2 * pad - (cols - 1) * gap) / cols), ch = 58;
    var total = cols * cw + (cols - 1) * gap;
    var x0 = (W - total) / 2;
    var y2 = H - 18 - ch, y1 = y2 - gap - ch;
    var barY = y1 - 40;
    return { cw: cw, ch: ch, gap: gap, x0: x0, total: total, y1: y1, y2: y2, barY: barY, top: barY - 8 };
  }
  function cards() {
    var t = tray();
    var out = ORDER.map(function (k, i) {
      return { key: k, x: t.x0 + (i % 5) * (t.cw + t.gap), y: i < 5 ? t.y1 : t.y2, w: t.cw, h: t.ch, locked: !unlocked(k) };
    });
    out.shovel = { x: t.x0 + t.total - 84, y: t.barY, w: 84, h: 32 };
    out.energy = { x: t.x0, y: t.barY, w: 100, h: 32 };
    return out;
  }
  function cardAt(p) {
    var cs = cards();
    for (var i = 0; i < cs.length; i++) if (p.x >= cs[i].x - 3 && p.x <= cs[i].x + cs[i].w + 3 && p.y >= cs[i].y - 3 && p.y <= cs[i].y + cs[i].h + 3) return cs[i];
    var sh = cs.shovel;
    if (p.x >= sh.x - 4 && p.x <= sh.x + sh.w + 4 && p.y >= sh.y - 6 && p.y <= sh.y + sh.h + 6) return { key: "shovel" };
    return null;
  }
  function cellAt(p) {
    if (!R || p.y > tray().top) return null;
    var g = G3.pickGround(R, p.x, p.y);
    if (!g) return null;
    var Z = g.x + MID;
    var lane = Math.floor((g.z + (LANES * LD) / 2) / LD), row = Math.floor((Z - Z0) / CD);
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
        A.sound("tap");
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
        if (!unlocked(card.key)) lockedTip = { key: card.key, at: A.time };
        A.sound("bad");
        A.haptic("warning");
      }
      return;
    }
    // enerji toplama: yakındaki küre (cömert dokunma alanı)
    if (R) {
      var best = null, bd = 58;
      orbs.forEach(function (o) {
        if (o.taken) return;
        var q = G3.project(R, WX(o.z), o.y, o.lz);
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
  function floatAt(text, Z, lz, wy, color, size) {
    if (R) {
      var p = G3.project(R, WX(Z), wy, lz);
      A.floatText(text, p.x, p.y, color, size);
    }
  }

  var PITCH = 0.74, FOV = 30; // kamera: ~42° aşağı bakış, dar açı (az bozulma)
  var cam = { tz: 0, d: 50, ok: false };
  function fieldRect() {
    if (state === "attract") return { l: 6, r: W - 6, t: 60, b: H - 60 };
    return { l: 6, r: W - 6, t: 118, b: tray().top - 2 };
  }
  /** Koridor derinliği: dikey ekranda saha, kartlarla skor arasını doldursun. */
  function chooseLaneDepth() {
    var fr = fieldRect();
    var pxm = (fr.r - fr.l) / SPAN;
    var fd = (fr.b - fr.t) / (pxm * Math.sin(PITCH) * 0.92);
    LD = A.clamp(fd / LANES, 3.4, 6.2);
  }

  function resize(w, h) {
    W = w;
    H = h;
    if (!grid.length) resetWorld();
    if (!R && !glFailed) {
      var was = state;
      state = "play"; // koridor derinliği oyun yerleşimine göre
      chooseLaneDepth();
      state = was;
    }
    initGL();
    if (R) {
      G3.resize(R, W, H, function () { return FOV; });
      fitCamera();
    }
  }
  function setCam(tz, d) {
    var c = R.camera;
    c.position.set(0, d * Math.sin(PITCH), tz + d * Math.cos(PITCH));
    c.lookAt(0, 0, tz);
    c.updateMatrixWorld(true);
  }
  /** Kamera uzaklığı ve odağı: saha dörtgeni hedef ekran alanına tam otursun. */
  function fitCamera() {
    var fr = fieldRect();
    var fd = LANES * LD;
    var x0 = WX(-1.6), x1 = WX(16.3);
    var pts = [[x0, 0, -fd / 2], [x1, 0, -fd / 2], [x0, 0, fd / 2], [x1, 0, fd / 2], [WX(GOAL_Z), 3.1, -fd / 2], [x1, 3.6, -fd / 2 + LD * 0.5]];
    function box() {
      var b = { x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9 };
      pts.forEach(function (q) {
        var s = G3.project(R, q[0], q[1], q[2]);
        b.x0 = Math.min(b.x0, s.x);
        b.x1 = Math.max(b.x1, s.x);
        b.y0 = Math.min(b.y0, s.y);
        b.y1 = Math.max(b.y1, s.y);
      });
      return b;
    }
    var tz = 0, d = 50;
    for (var it = 0; it < 4; it++) {
      var lo = 5, hi = 400;
      for (var k = 0; k < 28; k++) {
        var mid = (lo + hi) / 2;
        setCam(tz, mid);
        var b = box();
        if (b.x1 - b.x0 <= fr.r - fr.l && b.y1 - b.y0 <= fr.b - fr.t) hi = mid;
        else lo = mid;
      }
      d = hi;
      setCam(tz, d);
      var bb = box();
      var a = G3.project(R, 0, 0, tz), a2 = G3.project(R, 0, 0, tz + 1);
      var pxm = Math.max(0.5, a2.y - a.y);
      tz += ((bb.y0 + bb.y1) / 2 - (fr.t + fr.b) / 2) / pxm;
    }
    setCam(tz, d);
    cam.tz = tz;
    cam.d = d;
    cam.ok = true;
    cam.mode = state === "attract";
    R.scene.fog.near = d + 20;
    R.scene.fog.far = d * 2.2 + 90;
    R.camera.far = d * 3 + 200;
    R.camera.updateProjectionMatrix();
  }
  function placeCamera() {
    if (cam.mode !== (state === "attract")) fitCamera();
    setCam(cam.tz, cam.d);
  }

  function initGL() {
    if (R || glFailed) return;
    try {
      R = G3.stage({ theme: "day", fog: [80, 220], far: 400, shadow: { size: 2048, box: [-22, 22, 22, -22], far: 140, dist: 60 } });
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

  /** Parlak dama çim: koridorlar açık/koyu, sütunlar hafif ton farkı, kare kenarı. */
  function pitchTexture() {
    var px = 128;
    return K.canvasTex(ROWS * px, LANES * px, function (c, w, h) {
      var cols = [["#6BDB72", "#5FD068"], ["#53C35E", "#4AB955"]];
      for (var l = 0; l < LANES; l++)
        for (var r = 0; r < ROWS; r++) {
          c.fillStyle = cols[l % 2][r % 2];
          c.fillRect(r * px, l * px, px, px);
        }
      var rnd = A.seeded(11);
      for (var n = 0; n < ROWS * LANES * 260; n++) {
        c.fillStyle = rnd() < 0.5 ? "rgba(255,255,255,0.05)" : "rgba(0,40,0,0.06)";
        c.fillRect(rnd() * w, rnd() * h, 2 + rnd() * 4, 1.5);
      }
      c.strokeStyle = "rgba(255,255,255,0.22)";
      c.lineWidth = 3;
      for (var x = 1; x < ROWS; x++) {
        c.beginPath();
        c.moveTo(x * px, 0);
        c.lineTo(x * px, h);
        c.stroke();
      }
      c.strokeStyle = "rgba(10,60,20,0.25)";
      c.lineWidth = 4;
      for (var y = 1; y < LANES; y++) {
        c.beginPath();
        c.moveTo(0, y * px);
        c.lineTo(w, y * px);
        c.stroke();
      }
    });
  }
  /** Hücum bölgesi: kırmızımsı şerit, sola bakan oklar. */
  function attackTexture() {
    return K.canvasTex(128, 128, function (c) {
      c.fillStyle = "rgba(244,63,94,0.22)";
      c.fillRect(0, 0, 128, 128);
      c.strokeStyle = "rgba(255,255,255,0.55)";
      c.lineWidth = 12;
      c.lineCap = "round";
      c.lineJoin = "round";
      c.beginPath();
      c.moveTo(80, 34);
      c.lineTo(48, 64);
      c.lineTo(80, 94);
      c.stroke();
    }, true);
  }

  function buildWorld() {
    var s = R.scene;
    var fw = ROWS * CD, fd = LANES * LD;
    var pitch = K.mesh(new T.PlaneGeometry(fw, fd), K.std(0xffffff, 0.9, 0, { map: pitchTexture(), envMapIntensity: 0.3 }), false, true);
    pitch.rotation.x = -Math.PI / 2;
    pitch.position.set(WX(Z0 + fw / 2), 0, 0);
    s.add(pitch);
    var apron = K.mesh(new T.PlaneGeometry(240, 240), K.std(0x3aa653, 0.95, 0, { envMapIntensity: 0.25 }), false, true);
    apron.rotation.x = -Math.PI / 2;
    apron.position.set(0, -0.02, 0);
    s.add(apron);
    // kale önü (ceza sahası) — açık yeşil
    var box6 = K.mesh(new T.PlaneGeometry(Z0 - GOAL_Z + 1.4, fd), K.std(0x58c865, 0.95, 0, { envMapIntensity: 0.25 }), false, true);
    box6.rotation.x = -Math.PI / 2;
    box6.position.set(WX((GOAL_Z - 1.4 + Z0) / 2), -0.005, 0);
    s.add(box6);
    // hücum bölgesi
    var at = attackTexture();
    at.repeat.set(2, LANES * 1.4);
    var zone = new T.Mesh(new T.PlaneGeometry(4.6, fd), new T.MeshBasicMaterial({ map: at, transparent: true, depthWrite: false, toneMapped: false }));
    zone.rotation.x = -Math.PI / 2;
    zone.position.set(WX(Z0 + fw + 2.3), 0.01, 0);
    s.add(zone);
    R.zoneTex = at;

    // tebeşir çizgileri
    var chalk = new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.92 });
    function line(xa, za, xb, zb, w) {
      var lenX = Math.abs(xb - xa), lenZ = Math.abs(zb - za);
      var m = new T.Mesh(new T.PlaneGeometry(lenX > 0 ? lenX : w, lenZ > 0 ? lenZ : w), chalk);
      m.rotation.x = -Math.PI / 2;
      m.position.set((xa + xb) / 2, 0.012, (za + zb) / 2);
      s.add(m);
    }
    var hz = fd / 2 + 0.06;
    line(WX(GOAL_Z), -hz, WX(GOAL_Z), hz, 0.14); // kale çizgisi
    line(WX(Z0), -hz, WX(Z0), hz, 0.08);
    line(WX(GOAL_Z - 1.4), -hz, WX(Z0 + fw + 4.6), -hz, 0.12);
    line(WX(GOAL_Z - 1.4), hz, WX(Z0 + fw + 4.6), hz, 0.12);
    line(WX(Z0 + fw), -hz, WX(Z0 + fw), hz, 0.08);
    // koridor ayraçları (kesik çizgi)
    for (var l = 1; l < LANES; l++) {
      var zz = laneZ(l) - LD / 2;
      for (var dx = 0; dx < fw; dx += 0.9) line(WX(Z0 + dx + 0.1), zz, WX(Z0 + dx + 0.55), zz, 0.06);
    }

    // Kendi kalen (solda, bütün koridorları kapsar)
    var goal = new T.Group();
    var white = new T.MeshPhysicalMaterial({ color: 0xf8fafc, roughness: 0.25, clearcoat: 0.6 });
    var GW = fd + 0.6, GH = 3.0, GD = 1.8;
    [-1, 1].forEach(function (sd) {
      var gp = K.mesh(new T.CylinderGeometry(0.24, 0.24, GH, 16), white);
      gp.position.set(0, GH / 2, (sd * GW) / 2);
      goal.add(gp);
      var bk = K.mesh(new T.CylinderGeometry(0.07, 0.07, GH, 10), white);
      bk.position.set(-GD, GH / 2, (sd * GW) / 2);
      goal.add(bk);
    });
    var bar = K.mesh(new T.CylinderGeometry(0.24, 0.24, GW + 0.5, 16), white);
    bar.rotation.x = Math.PI / 2;
    bar.position.y = GH;
    goal.add(bar);
    var netTex = A.S3.netTexture();
    function net(w, h2, rx, ry) {
      var t = netTex.clone();
      t.needsUpdate = true;
      t.repeat.set(rx, ry);
      return new T.Mesh(new T.PlaneGeometry(w, h2), new T.MeshBasicMaterial({ map: t, transparent: true, alphaTest: 0.1, side: T.DoubleSide, depthWrite: false, opacity: 0.85 }));
    }
    var back = net(GW, GH, 40, 8);
    back.rotation.y = Math.PI / 2;
    back.position.set(-GD, GH / 2, 0);
    goal.add(back);
    R.goalNet = back;
    var top = net(GD, GW, 6, 40);
    top.rotation.x = -Math.PI / 2;
    top.position.set(-GD / 2, GH, 0);
    goal.add(top);
    // kale içi: koyu zemin + arka perde (ağ okunur)
    var inside = new T.Mesh(new T.PlaneGeometry(GD, GW), new T.MeshBasicMaterial({ color: 0x0f3d2a, transparent: true, opacity: 0.45, depthWrite: false }));
    inside.rotation.x = -Math.PI / 2;
    inside.position.set(-GD / 2, 0.008, 0);
    goal.add(inside);
    var curtain = new T.Mesh(new T.PlaneGeometry(GW, GH), new T.MeshBasicMaterial({ color: 0x1e1b4b, transparent: true, opacity: 0.35, depthWrite: false, side: T.DoubleSide }));
    curtain.rotation.y = Math.PI / 2;
    curtain.position.set(-GD - 0.05, GH / 2, 0);
    goal.add(curtain);
    goal.position.x = WX(GOAL_Z - 0.15);
    // kale çizgisi tehlike ışığı (rakip yaklaşınca kırmızı yanar)
    R.danger = new T.Mesh(new T.PlaneGeometry(1.2, fd), new T.MeshBasicMaterial({ color: 0xff2d55, transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending, toneMapped: false }));
    R.danger.rotation.x = -Math.PI / 2;
    R.danger.position.set(WX(GOAL_Z + 0.6), 0.02, 0);
    s.add(R.danger);
    s.add(goal);
    R.goal = goal;

    // Tribünler: karşı uzun kenar + sağ uç
    R.crowdTex = G3.crowdTexture(kitOf(captain), kitOf(rivalAt(1)));
    var far = G3.standStrip(R, 90, 1, fd / 2 + 3.4, R.crowdTex, { depth: 12, rise: 8 });
    far.rotation.y = Math.PI / 2;
    var endS = G3.standStrip(R, 80, 1, WX(SPAWN_Z) + 4, R.crowdTex, { depth: 10, rise: 7 });
    endS.position.z = 0;
    // LED pano (karşı kenar)
    R.boardTex = K.canvasTex(1024, 64, function () {}, true);
    R.boardTex.repeat.set(3, 1);
    var boardMat = new T.MeshBasicMaterial({ map: R.boardTex, toneMapped: false });
    var dark = K.std(0x16204a, 0.6);
    var board = K.mesh(new T.BoxGeometry(60, 1.0, 0.2), [dark, dark, dark, dark, boardMat, dark], true, true);
    board.position.set(0, 0.5, -(fd / 2 + 1.6));
    s.add(board);

    R.crowd = G3.minis(R, 110);
    R.balls = G3.balls(R, 110, 0.19);

    // Hücre vurgusu + koridor vurgusu
    R.cell = new T.Mesh(new T.PlaneGeometry(CD - 0.14, LD - 0.14), new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false }));
    R.cell.rotation.x = -Math.PI / 2;
    R.cell.position.y = 0.02;
    R.cell.visible = false;
    s.add(R.cell);
    R.laneHi = new T.Mesh(new T.PlaneGeometry(fw, LD - 0.1), new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.16, depthWrite: false, toneMapped: false }));
    R.laneHi.rotation.x = -Math.PI / 2;
    R.laneHi.position.set(WX(Z0 + fw / 2), 0.015, 0);
    R.laneHi.visible = false;
    s.add(R.laneHi);
    // boş hücre noktaları (kart seçiliyken)
    var dotGeo = new T.CircleGeometry(0.34, 20);
    dotGeo.rotateX(-Math.PI / 2);
    R.dots = new T.InstancedMesh(dotGeo, new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false }), LANES * ROWS);
    R.dots.frustumCulled = false;
    R.dots.count = 0;
    s.add(R.dots);

    // Oyuncu diskleri (örneklenmiş, renkli; fıskiye için su birikintisi)
    var discTex = K.canvasTex(128, 128, function (c) {
      var g = c.createRadialGradient(64, 64, 10, 64, 64, 60);
      g.addColorStop(0, "rgba(255,255,255,0.45)");
      g.addColorStop(0.75, "rgba(255,255,255,0.3)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      c.fillStyle = g;
      c.beginPath();
      c.arc(64, 64, 62, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = "rgba(255,255,255,1)";
      c.lineWidth = 9;
      c.beginPath();
      c.arc(64, 64, 50, 0, Math.PI * 2);
      c.stroke();
    });
    var discGeo = new T.PlaneGeometry(1, 1);
    discGeo.rotateX(-Math.PI / 2);
    R.rings = new T.InstancedMesh(discGeo, new T.MeshBasicMaterial({ map: discTex, transparent: true, depthWrite: false, toneMapped: false }), 40);
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
    for (var i = 0; i < 14; i++) {
      var grp = new T.Group();
      var glow = new T.Sprite(new T.SpriteMaterial({ map: K.glowTexture(), color: 0xffd24a, transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: 0.95 }));
      glow.scale.set(3.6, 3.6, 1);
      var icon = new T.Sprite(new T.SpriteMaterial({ map: boltTex, depthWrite: false, toneMapped: false, transparent: true }));
      icon.scale.set(1.35, 1.35, 1);
      grp.add(glow, icon);
      grp.visible = false;
      s.add(grp);
      R.orbs.push(grp);
    }
    // Şok dalgaları (patlama, orta, kurtarış, düdük)
    R.waves = [];
    R.wavePool = [];
    for (var wv = 0; wv < 8; wv++) {
      var ring = new T.Mesh(new T.RingGeometry(0.8, 1, 48), new T.MeshBasicMaterial({ color: 0xffb020, transparent: true, depthWrite: false, side: T.DoubleSide, blending: T.AdditiveBlending, toneMapped: false }));
      ring.rotation.x = -Math.PI / 2;
      ring.visible = false;
      s.add(ring);
      R.wavePool.push(ring);
    }
  }
  function shock(Z, lz, color, size, dur) {
    if (!R) return;
    R.waves.push({ x: WX(Z), z: lz, color: color, size: size, dur: dur || 0.5, at: A.time });
    if (R.waves.length > R.wavePool.length) R.waves.shift();
  }

  function paintBoards(text) {
    if (text === R.boardText) return;
    R.boardText = text;
    var c = R.boardTex.userData.ctx, cw = 1024, ch = 64;
    var g = c.createLinearGradient(0, 0, cw, 0);
    g.addColorStop(0, "#5B3DF5");
    g.addColorStop(0.5, "#DB2777");
    g.addColorStop(1, "#5B3DF5");
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
      l.socks = new T.Color(hex);
      return l;
    };
    looks.forvet = G3.look(mine, 5);
    looks.forvet.boots = new T.Color("#FDE047");
    looks.stoper = G3.look({ primary: "#E2E8F0", secondary: mine.primary }, 23);
    looks.stoper.socks = new T.Color(mine.primary);
    looks.cift = G3.look(mine, 61);
    looks.cift.boots = new T.Color("#FB923C");
    looks.cift.trim = new T.Color("#FB923C");
    looks.kurucu = bib("#FACC15", 11);
    looks.pres = bib("#38BDF8", 35);
    looks.fuze = bib("#F43F5E", 47);
    looks.ortaci = bib("#E879F9", 53);
    looks.kaleci = G3.look({ primary: "#A3E635", secondary: "#14532D" }, 71);
    looks.kaleci.socks = new T.Color("#14532D");
    looks.ref = G3.look({ primary: "#111827", secondary: "#111827" }, 29);
    looks.ref.trim = new T.Color("#FDE047");
    looks.ref.boots = new T.Color("#FDE047");
    looks.foe = [0, 1, 2, 3].map(function (i) { return G3.look(foeKit, i * 41 + 9); });
    var tint = function (hex, k) {
      return looks.foe.map(function (l) {
        var o = {};
        for (var kk in l) o[kk] = l[kk].clone().lerp(new T.Color(hex), k);
        return o;
      });
    };
    looks.ice = tint("#7DD3FC", 0.55);
    looks.wet = tint("#2DD4BF", 0.35);
    looks.frozen = tint("#E0F2FE", 0.7);
    G3.paintCrowd(R.crowdTex, mine, foeKit);
    paintBoards("ELİTLİG ARENA  •  SAVUNMA HATTI  •  RAKİP: " + String(rv.team.name || "").toLocaleUpperCase("tr-TR") + "  •  ");
  }

  var UNIT_RY = Math.PI / 2 - 0.38, FOE_RY = -Math.PI / 2 + 0.38;
  var seenBlast = {};
  var ringM = null, ringC = null, ringQ = null, ringS = null, ringP = null;
  function sync(dt) {
    refreshLooks();
    placeCamera();
    if (A.shakeAmt > 0.2) {
      R.camera.position.x += (Math.random() - 0.5) * A.shakeAmt * 0.03;
      R.camera.position.y += (Math.random() - 0.5) * A.shakeAmt * 0.03;
    }
    G3.focus(R, 0, 0, 0);
    R.boardTex.offset.x = (A.time * 0.04) % 1;
    R.zoneTex.offset.x = (A.time * 0.6) % 1;
    if (!ringM) {
      ringM = new T.Matrix4();
      ringC = new T.Color();
      ringQ = new T.Quaternion();
      ringS = new T.Vector3();
      ringP = new T.Vector3();
    }

    var cr = R.crowd, bl = R.balls;
    cr.begin();
    bl.begin();
    var ri = 0;
    function disc(x, z, size, color) {
      if (ri >= 40) return;
      ringP.set(x, 0.03, z);
      ringS.set(size, 1, size);
      ringM.compose(ringP, ringQ, ringS);
      R.rings.setMatrixAt(ri, ringM);
      R.rings.setColorAt(ri, ringC.set(color));
      ri += 1;
    }
    units.forEach(function (u) {
      var U = UNITS[u.type];
      var X = WX(u.z);
      var pop = A.clamp((A.time - u.at) / 0.3, 0, 1);
      if (u.type === "fiskiye") {
        var pul = 1 + Math.sin(A.time * 4 + u.id) * 0.05;
        disc(X, u.lz, CD * 0.95 * pul * A.easeOutBack(pop), U.color);
        bl.add(X, 0.16, u.lz, A.time * 6, 1.1, "#0EA5E9");
        if (!A.reduceMotion && Math.random() < 0.7) {
          var an = Math.random() * Math.PI * 2;
          R.dust.emit({ x: X, y: 0.35, z: u.lz, vx: Math.cos(an) * 1.4, vy: A.rand(2.4, 3.4), vz: Math.sin(an) * 1.4, life: 0.6, size: 0.24, size2: 0.12, color: Math.random() < 0.5 ? "#BAE6FD" : "#FFFFFF", alpha: 0.85, gravity: 9, drag: 0 });
        }
        return;
      }
      var hurt = A.clamp(1 - (A.time - u.hitAt) / 0.15, 0, 1);
      var weak = 1 - u.hp / u.hp0;
      var o = { x: X, y: (1 - A.easeOut(pop)) * 2.4, z: u.lz, ry: UNIT_RY, s: US, anim: "idle", t: A.time + u.id, look: looks[u.type], flash: hurt * 0.45, sy: pop < 1 ? 0.75 + 0.25 * A.easeOutBack(pop) : 1, rz: weak > 0.5 ? (weak - 0.5) * 0.4 : 0 };
      var bs = US / 1.5; // top ölçeği
      if (u.type === "stoper") {
        o.anim = "block";
        o.s = US * 1.2;
      } else if (u.type === "kurucu") {
        var m = A.time - u.made;
        if (m < 0.7) {
          o.anim = "cheer";
          o.t = m * 3;
        }
      } else if (u.type === "fuze") {
        var k = A.clamp((A.time - u.at) / 0.9, 0, 1);
        o.anim = "ready";
        o.s = US + k * 0.9;
        o.flash = 0.5 + 0.5 * Math.sin(A.time * 40) * k;
      } else if (u.type === "kaleci") {
        if (u.next > 0) {
          o.anim = "idle";
          bl.add(X + 0.35, 1.25 * (US / 1.5), u.lz + 0.2, 0, bs);
          if (A.time - u.caught < 0.5) o.anim = "cheer";
        } else {
          o.anim = "keeper";
          o.t = A.time * 1.5 + u.id;
        }
      } else {
        var kt = (A.time - u.kickAt) / 0.42;
        if (kt >= 0 && kt < 1) {
          o.anim = "kick";
          o.t = kt;
        } else {
          o.anim = "ready";
          o.t = A.time + u.id;
        }
        var hide = kt >= 0.4 && kt < 1;
        var bc = u.type === "pres" ? "#BAE6FD" : u.type === "ortaci" ? "#F5D0FE" : null;
        if (!hide) bl.add(X + 0.75, 0.19 * bs, u.lz + 0.25, 0, bs, bc);
        if (u.type === "cift" && !hide) bl.add(X + 0.7, 0.19 * bs, u.lz - 0.35, 1, bs, "#FED7AA");
      }
      cr.add(o);
      disc(X, u.lz, 1.9, U.color);
    });

    foes.forEach(function (f) {
      var F = FOES[f.type];
      var X = WX(f.z);
      var hurt = A.clamp(1 - (A.time - f.hitAt) / 0.13, 0, 1);
      var set = f.frozen > 0 ? looks.frozen : f.slow > 0 ? (f.wet > 0 ? looks.wet : looks.ice) : looks.foe;
      var lk = set[f.id % set.length];
      if (f.dead) {
        var d = A.clamp((A.time - f.at) / 0.8, 0, 1);
        cr.add({ x: WX(f.z + d * 1.6), y: Math.sin(d * Math.PI) * 0.6, z: f.lz, ry: FOE_RY, s: F.s * (1 - Math.max(0, d - 0.6) * 2.5), anim: "fall", t: d * 1.3, look: lk, flash: Math.max(0, 0.7 - d * 3) });
        return;
      }
      var sway = Math.sin(f.phase * 0.5) * 0.08;
      var fr = f.frozen > 0;
      cr.add({ x: X, y: 0, z: f.lz + sway, ry: FOE_RY, s: F.s * (1 - hurt * 0.08), anim: fr ? "idle" : f.eating ? "tackle" : f.type === "kanat" ? "run" : "walk", t: fr ? 0 : f.eating ? A.time + f.id : f.phase, look: lk, flash: hurt * 0.6 + (fr ? 0.15 : 0), rz: hurt * 0.12 });
      if (!f.eating) bl.add(X - 0.55 * (F.s / 1.45), 0.19 * (F.s / 1.45), f.lz + sway + 0.15, f.phase * 1.4, F.s / 1.45);
      if (f.type === "kaptan") disc(X, f.lz, 2.6, "#F43F5E");
    });
    refs.forEach(function (rf) {
      var a = (A.time - rf.at) / 1.6;
      cr.add({ x: WX(rf.z), y: Math.max(0, 1 - a * 6) * 2, z: rf.lz, ry: 0.3, s: US * (a > 0.85 ? 1 - (a - 0.85) * 6 : 1), anim: "cheer", t: a * 4, look: looks.ref, flash: a < 0.1 ? 0.6 : 0 });
    });
    cr.end();
    R.rings.count = ri;
    R.rings.instanceMatrix.needsUpdate = true;
    if (R.rings.instanceColor) R.rings.instanceColor.needsUpdate = true;

    shots.forEach(function (s) {
      var X = WX(s.z);
      var col = s.slow ? "#7DD3FC" : s.kind === "cift" ? "#FED7AA" : null;
      bl.add(X, 0.7, s.lz, -A.time * 25 + s.id, 1.35, col);
      if (!A.reduceMotion && Math.random() < 0.8) R.fx.emit({ x: X - 0.3, y: 0.7, z: s.lz, vy: 0.2, life: 0.25, size: 0.45, size2: 0.05, color: s.slow ? "#38BDF8" : s.kind === "cift" ? "#FB923C" : "#FDE047", alpha: 0.7, gravity: 0, drag: 0 });
    });
    lobs.forEach(function (lb) {
      var t = A.clamp(lb.t, 0, 1);
      var X = WX(lb.z0 + (lb.z1 - lb.z0) * t), Zw = lb.lz0 + (lb.lz1 - lb.lz0) * t, Y = 0.8 + Math.sin(t * Math.PI) * 4.2;
      bl.add(X, Y, Zw, -A.time * 18 + lb.id, 1.4, "#F5D0FE");
      if (!A.reduceMotion) R.fx.emit({ x: X, y: Y, z: Zw, vy: 0, life: 0.3, size: 0.5, size2: 0.05, color: "#E879F9", alpha: 0.75, gravity: 0, drag: 0 });
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
      var bob = o.y <= 0.91 ? Math.sin(A.time * 3 + o.id) * 0.15 : 0;
      g.position.set(WX(o.z), o.y + bob + tk * 2.5, o.lz);
      var sc = (o.v > 25 ? 1.35 : 1) * (1 + Math.sin(A.time * 6 + o.id) * 0.07) * (1 - tk);
      g.scale.setScalar(Math.max(0.01, sc));
    }

    /* Tek seferlik efektler */
    blasts.forEach(function (b) {
      var key = b.kind + b.lz + ":" + b.z + ":" + b.at;
      if (seenBlast[key]) return;
      seenBlast[key] = 1;
      var X = WX(b.z);
      if (b.kind === "hit" || b.kind === "ice") {
        R.fx.burst(9, { x: X, y: 0.9, z: b.lz, speed: 5, life: 0.32, size: 0.4, color: b.kind === "ice" ? ["#BAE6FD", "#FFFFFF", "#38BDF8"] : ["#FFFFFF", "#FDE047", "#FB923C"], gravity: 5 });
      } else if (b.kind === "puff") {
        R.dust.burst(14, { x: X, y: 0.4, z: b.lz, speed: 3, life: 0.6, size: 0.6, size2: 1.3, color: ["#E2E8F0", "#CBD5E1"], alpha: 0.7, gravity: -1 });
      } else if (b.kind === "boom") {
        R.fx.burst(70, { x: X, y: 0.8, z: b.lz, speed: 14, life: 0.7, size: 0.8, color: ["#FDE047", "#FB923C", "#F43F5E", "#FFFFFF"], gravity: 6 });
        R.dust.burst(30, { x: X, y: 0.4, z: b.lz, speed: 7, life: 1.0, size: 0.9, size2: 2.4, color: ["#57534E", "#A8A29E", "#44403C"], alpha: 0.6, gravity: -1.5 });
        shock(b.z, b.lz, "#FFB020", CD * 3, 0.5);
      } else if (b.kind === "splash") {
        R.fx.burst(22, { x: X, y: 0.5, z: b.lz, speed: 6, up: 0.5, life: 0.45, size: 0.5, color: ["#E879F9", "#F5D0FE", "#FFFFFF"], gravity: 8 });
        shock(b.z, b.lz, "#E879F9", 3.2, 0.4);
      } else if (b.kind === "catch") {
        R.fx.burst(26, { x: X + 0.4, y: 1.4, z: b.lz, speed: 6, life: 0.5, size: 0.5, color: ["#A3E635", "#FFFFFF", "#FDE047"], gravity: 4 });
        shock(b.z, b.lz, "#A3E635", 2.6, 0.45);
      } else if (b.kind === "whistle") {
        shock(b.z, b.lz, "#FDE047", 26, 0.9);
        R.fx.burst(40, { x: X, y: 2.5, z: b.lz, speed: 9, life: 0.7, size: 0.6, color: ["#FDE047", "#FFFFFF"], gravity: 3 });
      } else if (b.kind === "ko") {
        R.fx.burst(b.boss ? 60 : 18, { x: X, y: 1.4, z: b.lz, speed: b.boss ? 11 : 6, life: 0.6, size: 0.5, color: ["#FDE047", "#F43F5E", "#38BDF8", "#34D399", "#FFFFFF"], gravity: 7 });
        if (state === "play") {
          var sp = G3.project(R, X, 1.6, b.lz);
          A.fly(sp.x, sp.y, "#FFD24A", b.boss ? 6 : 1);
          if (b.boss) A.confetti(sp.x, sp.y, 50);
          else A.sparkle(sp.x, sp.y, 6, "#FFFFFF");
        }
      } else if (b.kind === "goal") {
        R.fx.burst(40, { x: WX(GOAL_Z) - 0.8, y: 1.4, z: b.lz, speed: 8, life: 0.7, size: 0.5, color: ["#F43F5E", "#FFFFFF", "#FB7185"], gravity: 6 });
      }
    });
    if (blasts.length === 0) seenBlast = {};
    // şok dalgaları
    for (var wi = 0; wi < R.wavePool.length; wi++) {
      var rm = R.wavePool[wi], wvv = R.waves[wi];
      var wt = wvv ? (A.time - wvv.at) / wvv.dur : 2;
      rm.visible = wt < 1;
      if (wt < 1) {
        rm.position.set(wvv.x, 0.06, wvv.z);
        rm.scale.setScalar(0.4 + A.easeOut(wt) * wvv.size);
        rm.material.color.set(wvv.color);
        rm.material.opacity = 1 - wt;
      }
    }
    // yerleştirme tozu
    units.forEach(function (u) {
      if (!u.dusted && A.time - u.at > 0.26) {
        u.dusted = true;
        R.dust.burst(12, { x: WX(u.z), y: 0.1, z: u.lz, speed: 3, up: 0.4, life: 0.5, size: 0.4, size2: 0.9, color: ["#D9F2C4", "#B7E08F"], alpha: 0.6, gravity: 1 });
        R.fx.burst(10, { x: WX(u.z), y: 0.6, z: u.lz, speed: 4, life: 0.4, size: 0.35, color: [UNITS[u.type].color, "#FFFFFF"], gravity: 3 });
      }
    });

    /* Hücre vurgusu */
    var picking = state === "play" && selected;
    var show = picking && hover;
    R.cell.visible = !!show;
    R.laneHi.visible = !!show;
    if (show) {
      var ok = canPlace(selected, hover.lane, hover.row);
      R.cell.position.set(WX(cellZ(hover.row)), 0.02, laneZ(hover.lane));
      R.cell.material.color.set(ok ? 0xffffff : 0xff4d6d);
      R.cell.material.opacity = 0.5 + 0.15 * Math.sin(A.time * 8);
      R.laneHi.position.z = laneZ(hover.lane);
    }
    var nd = 0;
    if (picking) {
      for (var l2 = 0; l2 < LANES; l2++)
        for (var r2 = 0; r2 < ROWS; r2++)
          if (canPlace(selected, l2, r2)) {
            ringP.set(WX(cellZ(r2)), 0.02, laneZ(l2));
            ringS.setScalar(1 + 0.15 * Math.sin(A.time * 5 + l2 + r2));
            ringM.compose(ringP, ringQ, ringS);
            R.dots.setMatrixAt(nd++, ringM);
          }
      R.dots.instanceMatrix.needsUpdate = true;
    }
    R.dots.count = nd;
    var near = 99;
    foes.forEach(function (f) {
      if (!f.dead) near = Math.min(near, f.z);
    });
    R.danger.material.opacity = (state === "play" ? A.clamp((5 - near) / 3, 0, 1) * (0.35 + 0.25 * Math.sin(A.time * 9)) : 0) + goalFlash * 0.6;
    R.goalNet.position.x = -1.8 - Math.sin(Math.min(1, (1 - goalFlash) * 2.5) * Math.PI) * 0.7 * (goalFlash > 0 ? 1 : 0);
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
    if (R) {
      drawBars(c);
      if (state === "play") drawIncoming(c);
    }
    A.drawParticles(c);
    A.drawFloaters(c, dt);
    if (state !== "attract") {
      drawHud(c);
      drawCards(c, dt);
    }
    A.drawBanner(c, W, Math.max(150, H * 0.26), dt);
    if (flashRed > 0) {
      c.fillStyle = "rgba(251,113,133," + (0.3 * flashRed).toFixed(3) + ")";
      c.fillRect(0, 0, W, H);
    }
  }

  var scrim = null;
  function drawScrim(c) {
    var playing = state !== "attract";
    var key = W + "x" + H + ":" + playing;
    if (!scrim || scrim.key !== key) {
      scrim = A.layer(W, H);
      scrim.key = key;
      A.paintVignette(scrim.ctx, W, H, 0.18);
      A.paintTopScrim(scrim.ctx, W, 116);
      if (playing) {
        var t = tray();
        var g = scrim.ctx.createLinearGradient(0, t.top - 26, 0, H);
        g.addColorStop(0, "rgba(8,10,30,0)");
        g.addColorStop(0.18, "rgba(8,10,30,0.7)");
        g.addColorStop(1, "rgba(8,10,30,0.92)");
        scrim.ctx.fillStyle = g;
        scrim.ctx.fillRect(0, t.top - 26, W, H - t.top + 26);
      }
    }
    A.blit(scrim);
  }

  /** Sağ kenarda gelen rakip uyarısı (koridor başına kırmızı ok). */
  function drawIncoming(c) {
    var warn = {};
    foes.forEach(function (f) {
      if (!f.dead && f.z > 15.6) warn[f.lane] = Math.max(warn[f.lane] || 0, f.type === "kaptan" ? 2 : 1);
    });
    queue.forEach(function (q) {
      if (q.t - waveT < 2.5) warn[q.lane] = Math.max(warn[q.lane] || 0, q.type === "kaptan" ? 2 : 1);
    });
    c.save();
    for (var l in warn) {
      var p = G3.project(R, WX(16), 0.5, laneZ(+l));
      var x = Math.min(W - 16, p.x), y = p.y;
      var a = 0.6 + 0.4 * Math.sin(A.time * 10);
      c.globalAlpha = a;
      c.fillStyle = warn[l] === 2 ? "#FDE047" : "#F43F5E";
      c.beginPath();
      c.moveTo(x + 10, y - 13);
      c.lineTo(x - 6, y);
      c.lineTo(x + 10, y + 13);
      c.closePath();
      c.fill();
      c.lineWidth = 2;
      c.strokeStyle = "rgba(255,255,255,0.9)";
      c.stroke();
    }
    c.restore();
  }

  /** Can çubukları: hasar almış rakip ve oyuncuların üstünde; donanlarda sarı kart. */
  function drawBars(c) {
    function bar(X, wy, lz, frac, color, w, label) {
      var p = G3.project(R, X, wy, lz);
      var bw = w || 30;
      A.roundRect(c, p.x - bw / 2, p.y - 3.5, bw, 7, 3.5);
      c.fillStyle = "rgba(8,10,30,0.78)";
      c.fill();
      c.fillStyle = color;
      A.roundRect(c, p.x - bw / 2 + 1, p.y - 2.5, Math.max(2, (bw - 2) * A.clamp(frac, 0, 1)), 5, 2.5);
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
      return p;
    }
    c.save();
    foes.forEach(function (f) {
      if (f.dead) return;
      var F = FOES[f.type];
      var X = WX(f.z);
      var p = null;
      if (f.type === "kaptan") p = bar(X, F.s * 1.25 + 0.3, f.lz, f.hp / f.hp0, "#F43F5E", 58, "KAPTAN · " + bossName(wave));
      else if (f.hp < f.hp0) p = bar(X, F.s * 1.25 + 0.15, f.lz, f.hp / f.hp0, f.slow > 0 ? "#38BDF8" : "#F43F5E", 28);
      if (f.frozen > 0) {
        var q = p || G3.project(R, X, F.s * 1.25 + 0.15, f.lz);
        c.save();
        c.translate(q.x + 14, q.y - 12);
        c.rotate(0.25 + Math.sin(A.time * 6 + f.id) * 0.1);
        A.roundRect(c, -5, -7, 10, 14, 2);
        c.fillStyle = "#FDE047";
        c.fill();
        c.lineWidth = 1.5;
        c.strokeStyle = "rgba(8,10,30,0.7)";
        c.stroke();
        c.restore();
      }
    });
    units.forEach(function (u) {
      if (u.hp < u.hp0 && u.type !== "fuze" && u.type !== "fiskiye") bar(WX(u.z), u.type === "stoper" ? 3.4 : 2.9, u.lz, u.hp / u.hp0, "#34D399", 30);
      if (u.type === "kaleci" && u.next > 0) {
        var p = G3.project(R, WX(u.z), 3.2, u.lz);
        c.beginPath();
        c.arc(p.x, p.y, 7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - u.next / CHEW));
        c.lineWidth = 3;
        c.strokeStyle = "#A3E635";
        c.stroke();
      }
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
    c.lineCap = "round";
    c.lineJoin = "round";
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
    } else if (type === "fiskiye") {
      // su damlası + sıçrama
      c.fillStyle = col;
      c.beginPath();
      c.moveTo(x, y - r);
      c.bezierCurveTo(x + r * 0.2, y - r * 0.5, x + r * 0.75, y - r * 0.05, x + r * 0.75, y + r * 0.3);
      c.arc(x, y + r * 0.3, r * 0.75, 0, Math.PI);
      c.bezierCurveTo(x - r * 0.75, y - r * 0.05, x - r * 0.2, y - r * 0.5, x, y - r);
      c.fill();
      c.fillStyle = "rgba(255,255,255,0.75)";
      c.beginPath();
      c.ellipse(x - r * 0.28, y + r * 0.2, r * 0.14, r * 0.26, -0.4, 0, Math.PI * 2);
      c.fill();
    } else if (type === "kaleci") {
      // eldiven
      c.fillStyle = col;
      A.roundRect(c, x - r * 0.62, y - r * 0.35, r * 1.24, r * 1.25, r * 0.3);
      c.fill();
      for (var fg = 0; fg < 4; fg++) {
        A.roundRect(c, x - r * 0.62 + fg * r * 0.32, y - r * 0.95, r * 0.28, r * 0.75, r * 0.14);
        c.fill();
      }
      A.roundRect(c, x - r * 1.0, y - r * 0.25, r * 0.5, r * 0.75, r * 0.2);
      c.fill();
      c.fillStyle = "#14532D";
      c.fillRect(x - r * 0.62, y + r * 0.55, r * 1.24, r * 0.3);
    } else if (type === "ortaci") {
      c.strokeStyle = col;
      c.lineWidth = r * 0.18;
      c.setLineDash([r * 0.25, r * 0.22]);
      c.beginPath();
      c.moveTo(x - r * 0.9, y + r * 0.75);
      c.quadraticCurveTo(x - r * 0.1, y - r * 1.25, x + r * 0.5, y + r * 0.1);
      c.stroke();
      c.setLineDash([]);
      A.drawBall(c, x + r * 0.45, y + r * 0.35, r * 0.5, iconOrient);
    } else if (type === "hakem") {
      // düdük + sarı kart
      c.save();
      c.translate(x + r * 0.35, y - r * 0.15);
      c.rotate(0.3);
      A.roundRect(c, -r * 0.38, -r * 0.55, r * 0.76, r * 1.05, r * 0.12);
      c.fillStyle = col;
      c.fill();
      c.restore();
      c.fillStyle = "#E2E8F0";
      c.beginPath();
      c.arc(x - r * 0.3, y + r * 0.3, r * 0.45, 0, Math.PI * 2);
      c.fill();
      c.fillRect(x - r * 0.3, y - r * 0.15, r * 0.9, r * 0.32);
      c.fillStyle = "#334155";
      c.beginPath();
      c.arc(x - r * 0.3, y + r * 0.3, r * 0.16, 0, Math.PI * 2);
      c.fill();
    } else if (type === "shovel") {
      c.strokeStyle = col;
      c.lineWidth = r * 0.24;
      c.beginPath();
      c.moveTo(x - r * 0.55, y - r * 0.55);
      c.lineTo(x + r * 0.55, y + r * 0.55);
      c.moveTo(x + r * 0.55, y - r * 0.55);
      c.lineTo(x - r * 0.55, y + r * 0.55);
      c.stroke();
    } else if (type === "lock") {
      c.strokeStyle = col;
      c.lineWidth = r * 0.2;
      c.beginPath();
      c.arc(x, y - r * 0.2, r * 0.42, Math.PI, 0);
      c.stroke();
      c.fillStyle = col;
      A.roundRect(c, x - r * 0.62, y - r * 0.2, r * 1.24, r * 0.95, r * 0.18);
      c.fill();
    }
    c.restore();
  }

  function drawCards(c, dt) {
    var cs = cards();
    c.save();
    c.textAlign = "center";
    c.textBaseline = "middle";
    cs.forEach(function (b) {
      var U = UNITS[b.key];
      var cx = b.x + b.w / 2;
      c.save();
      if (b.locked) {
        A.roundRect(c, b.x, b.y, b.w, b.h, 12);
        c.fillStyle = "rgba(30,36,72,0.75)";
        c.fill();
        c.lineWidth = 1;
        c.strokeStyle = "rgba(255,255,255,0.14)";
        c.stroke();
        var tip = lockedTip && lockedTip.key === b.key && A.time - lockedTip.at < 0.4 ? Math.sin((A.time - lockedTip.at) * 50) * 3 : 0;
        drawIcon(c, "lock", cx + tip, b.y + 21, 11, "rgba(255,255,255,0.55)");
        c.font = A.font(9, 900);
        c.fillStyle = "rgba(255,255,255,0.6)";
        c.fillText(U.unlock + ". DALGA", cx, b.y + 44);
        c.restore();
        return;
      }
      var cool = Math.max(0, (ready[b.key] || 0) - A.time) / U.recharge;
      var afford = energy >= U.cost;
      var on = selected === b.key;
      var fresh = U.unlock > 1 && wave === U.unlock && waveT < 12 && waveState === "run";
      var lift = on ? -7 : fresh ? -2 - Math.abs(Math.sin(A.time * 6)) * 3 : 0;
      c.translate(0, lift);
      // gövde: rol renginde parlak kart
      A.roundRect(c, b.x, b.y, b.w, b.h, 12);
      var g = c.createLinearGradient(0, b.y, 0, b.y + b.h);
      g.addColorStop(0, A.mix(U.color, "#FFFFFF", 0.15));
      g.addColorStop(0.55, U.color);
      g.addColorStop(1, A.mix(U.color, "#0A0E24", 0.45));
      c.fillStyle = g;
      c.fill();
      if (on) {
        c.shadowColor = U.color;
        c.shadowBlur = 16;
      }
      c.lineWidth = on ? 3 : 1.5;
      c.strokeStyle = on ? "#FFFFFF" : "rgba(255,255,255,0.45)";
      c.stroke();
      c.shadowBlur = 0;
      // ikon yuvası
      c.fillStyle = "rgba(8,10,30,0.42)";
      c.beginPath();
      c.arc(cx, b.y + 19, 14.5, 0, Math.PI * 2);
      c.fill();
      drawIcon(c, b.key, cx, b.y + 19, 10.5, b.key === "kurucu" || b.key === "hakem" ? "#FDE047" : "#FFFFFF");
      c.font = A.font(9, 900);
      c.lineJoin = "round";
      c.lineWidth = 3;
      c.strokeStyle = "rgba(8,10,30,0.6)";
      c.strokeText(U.name, cx, b.y + 38.5);
      c.fillStyle = "#FFFFFF";
      c.fillText(U.name, cx, b.y + 38.5);
      // fiyat
      A.roundRect(c, cx - 19, b.y + 44, 38, 12, 6);
      c.fillStyle = "rgba(8,10,30,0.7)";
      c.fill();
      bolt(c, cx - 10, b.y + 50, 4.5, afford ? P.gold : "#FB7185");
      c.font = A.font(10, 900);
      c.fillStyle = afford ? P.gold : "#FB7185";
      c.fillText(String(U.cost), cx + 4, b.y + 50.5);
      if (!afford || cool > 0) {
        A.roundRect(c, b.x, b.y, b.w, b.h, 12);
        c.fillStyle = "rgba(8,10,30,0.42)";
        c.fill();
      }
      if (cool > 0) {
        c.save();
        A.roundRect(c, b.x, b.y, b.w, b.h, 12);
        c.clip();
        c.fillStyle = "rgba(5,8,23,0.6)";
        c.fillRect(b.x, b.y, b.w, b.h * cool);
        c.restore();
      }
      if (fresh) {
        A.roundRect(c, b.x + b.w - 30, b.y - 6, 32, 13, 6.5);
        c.fillStyle = "#F43F5E";
        c.fill();
        c.font = A.font(8, 900);
        c.fillStyle = "#FFFFFF";
        c.fillText("YENİ", b.x + b.w - 14, b.y + 0.5);
      }
      c.restore();
    });
    // ÇIKAR
    var sh = cs.shovel;
    A.pill(c, sh.x, sh.y, sh.w, sh.h, removing ? "rgba(244,63,94,0.92)" : "rgba(12,15,40,0.82)");
    drawIcon(c, "shovel", sh.x + 18, sh.y + sh.h / 2, 10, "#FFFFFF");
    c.font = A.font(11, 900);
    c.fillStyle = "#FFFFFF";
    c.fillText("ÇIKAR", sh.x + sh.w / 2 + 9, sh.y + sh.h / 2 + 0.5);

    // Enerji hapı
    var eb = cs.energy;
    var es = 1 + energyBump * 0.18;
    c.save();
    c.translate(eb.x + eb.w / 2, eb.y + eb.h / 2);
    c.scale(es, es);
    A.roundRect(c, -eb.w / 2, -eb.h / 2, eb.w, eb.h, eb.h / 2);
    var eg = c.createLinearGradient(0, -eb.h / 2, 0, eb.h / 2);
    eg.addColorStop(0, "#3B2A8F");
    eg.addColorStop(1, "#1A1250");
    c.fillStyle = eg;
    c.fill();
    c.lineWidth = 2;
    c.strokeStyle = energyBump > 0.05 ? "#FDE047" : "rgba(253,224,71,0.55)";
    c.stroke();
    c.fillStyle = P.gold;
    c.beginPath();
    c.arc(-eb.w / 2 + 16, 0, 12, 0, Math.PI * 2);
    c.fill();
    bolt(c, -eb.w / 2 + 16, 0, 8.5, "#7C2D12");
    c.font = A.font(17, 900);
    c.fillStyle = "#FFFFFF";
    c.textAlign = "left";
    c.fillText(String(Math.floor(energy)), -eb.w / 2 + 34, 1);
    c.restore();

    // Enerjiye uçan ışıklar
    var tx = eb.x + 16, ty = eb.y + eb.h / 2;
    for (var z = zaps.length - 1; z >= 0; z--) {
      var zp = zaps[z];
      zp.t += dt / 0.55;
      if (zp.t < 0) continue;
      if (zp.t >= 1) {
        zaps.splice(z, 1);
        energyBump = 1;
        continue;
      }
      var u = zp.t * zp.t;
      var mx = (zp.x + tx) / 2 + zp.bend, my = Math.min(zp.y, ty) - 40;
      var px = (1 - u) * (1 - u) * zp.x + 2 * (1 - u) * u * mx + u * u * tx;
      var py = (1 - u) * (1 - u) * zp.y + 2 * (1 - u) * u * my + u * u * ty;
      c.save();
      c.globalCompositeOperation = "lighter";
      var zg = c.createRadialGradient(px, py, 0, px, py, 13);
      zg.addColorStop(0, "#FFFFFF");
      zg.addColorStop(0.35, "#FDE047");
      zg.addColorStop(1, "rgba(0,0,0,0)");
      c.fillStyle = zg;
      c.beginPath();
      c.arc(px, py, 13, 0, Math.PI * 2);
      c.fill();
      c.restore();
    }

    // İpucu
    var hint = "";
    if (lockedTip && A.time - lockedTip.at < 2) hint = UNITS[lockedTip.key].name + " " + UNITS[lockedTip.key].unlock + ". dalgada açılır";
    else if (removing) hint = "Çıkarılacak oyuncuya dokun";
    else if (selected) hint = UNITS[selected].instant ? "Sahaya dokun: düdük!" : UNITS[selected].name + ": " + UNITS[selected].desc.toLocaleLowerCase("tr-TR") + " · kareye koy";
    else if (placed === 0) hint = "Önce KURUCU koy: enerji üretir";
    else if (orbs.some(function (o) { return !o.taken && o.sky; }) && placed < 6) hint = "Düşen enerjiye dokun!";
    if (hint) {
      c.font = A.font(11, 800);
      c.textAlign = "center";
      var hx0 = eb.x + eb.w + 8, hx1 = sh.x - 8;
      var hw = Math.min(hx1 - hx0, c.measureText(hint).width + 20);
      if (hw > 40) {
        A.pill(c, (hx0 + hx1) / 2 - hw / 2, eb.y + 3, hw, 26, "rgba(12,15,40,0.75)");
        c.fillStyle = "rgba(255,255,255,0.95)";
        c.fillText(hint, (hx0 + hx1) / 2, eb.y + 16.5, hw - 14);
      }
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
    A.pill(c, W - 16 - lw, top + 30, lw, 26, "rgba(91,61,245,0.9)");
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
      units: units, foes: foes, shots: shots, lobs: lobs, hover: hover, selected: selected, R: R, orbs: orbs, queue: queue, waveState: waveState, gl: !!R,
      captain: captain.short, rival: rivalAt(wave).team.name, UNITS: UNITS, FOES: FOES, LANES: LANES, ROWS: ROWS, ORDER: ORDER,
      place: place, collect: collect, usable: usable, cards: cards,
      setEnergy: function (v) { energy = v; },
      setWave: function (w) {
        wave = w;
        buildWave();
      },
      cellCenter: function (lane, row) {
        if (!R) return null;
        var p = G3.project(R, WX(cellZ(row)), 0, laneZ(lane));
        return { x: p.x, y: p.y };
      },
      spawn: function (type, lane, zz) {
        var F = FOES[type];
        var f = { id: ++uid, type: type, lane: lane, lz: laneZ(lane), z: zz == null ? SPAWN_Z : zz, hp: F.hp, hp0: F.hp, v: F.v, slow: 0, frozen: 0, wet: 0, hitAt: -9, eating: null, phase: 0, dead: false, at: 0 };
        foes.push(f);
        return f;
      },
      clearQueue: function () { queue.length = 0; },
    };
  }

  A.register({ resize: resize, start: start, update: update, render: render, down: down, move: move, up: up, debug: debug, setRoster: setRoster });
})();
