/*
 * SAVUNMA HATTI — şeritli kale savunması (2B vektör çizim). Rakip hücumcular
 * SAĞDAN, ekranın dışından gelir; beş YATAY koridorda uzun bir koşu yolunu
 * yürüyüp SOLDAKİ kalene ulaşmaya çalışır. Sen koridorların sol yarısındaki
 * ızgaraya oyuncularını dizersin: TARAFTAR güneş üretir, FORVET şut atar,
 * STOPER duvar olur. Kalene ulaşan her rakip bir GOL: üç gol yersen maç biter.
 *
 * MİMARİ: simülasyon (ızgara, dalgalar, hasar, güneş, puan) çizimden
 * bağımsızdır; başsız testler (scripts/check-games.mjs) yalnız onu koşturur.
 * Her rakip ve oyuncu bir KORİDOR (lane) ve koridor boyunca kaleye UZAKLIK
 * (z, metre) ile tanımlıdır; ekranda koridorlar satırdır, z soldan sağa artar.
 * Çizim düz Canvas 2D'dir (games/core.js çalışma zamanı): koyu lacivert
 * konturlu, doygun renkli, yuvarlak hatlı "flat vector" futbolcular; gece
 * şehri + stadyum fonu; statik fon bir kez ekran dışı katmana çizilir.
 *
 * SAHA UZUNLUĞU: dikey telefonda 5 sütun (her biri ≥44 px dokunma alanı),
 * yatay ekranda 7 sütun. Izgaranın sağında uzun bir KOŞU YOLU vardır
 * (dikeyde 7,2 m, yatayda 12 m): rakip ekranın sağ kenarının dışında doğar
 * ve ızgaraya ulaşmadan önce görünür biçimde yürür.
 *
 * GERÇEK İÇERİK (RN'den {type:"config", roster:{captain, rivals}}): oyuncuların
 * seçtiğin oyuncunun kulübünün formasını giyer; her DALGA ligin bir takımıdır
 * (forma, ad). Dalganın sonunda o takımın KAPTANI gelir.
 *
 * OYUNCULAR (kart · güneş · görev · açıldığı dalga):
 *   TARAFTAR 50   güneş bayrağı sallar; 6,5 sn'de bir +25 güneş (ilk 3 sn). 1
 *   FORVET   75   koridorunda rakip varsa 1,4 sn'de bir şut (25 hasar). 1
 *   STOPER   50   2400 can; rakibi oyalar. 1
 *   FÜZE     125  0,9 sn sonra 3×3 alanı temizler (1800 hasar). 2
 *   FISKİYE  25   tuzak: üstünden geçen rakip yarı hıza düşer, ıslanır. 3
 *   ÇİFT     175  her seferinde iki şut. 4
 *   KALECİ   150  ilk dokunan rakibi KAPAR (kaptana 500); 10 sn topu tutar. 5
 *   PRES     150  şutu rakibi 3,5 sn yarı hıza düşürür. 6
 *   ORTACI   175  kendi ve iki komşu koridora orta: 45 alan hasarı. 7
 *   HAKEM    100  anında: düdük, bütün rakipler 4 sn donar (+20 hasar). 8
 * Tepside yalnız AÇILMIŞ kartlar durur; yeni kart açılınca "YENİ OYUNCU!"
 * kartı çıkar. Gökten de güneş düşer (+25, arada altın +50): dokun, topla.
 * Üretilen güneş 6 sn içinde toplanmazsa kendiliğinden toplanır. ÇIKAR oyuncuyu kaldırır.
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
  // Yuvarlak, kalın oyun yazısı (iOS'ta SF Pro Rounded); yoksa sistem fontu.
  A.FONT = '"SF Pro Rounded", ui-rounded, "Nunito", "Arial Rounded MT Bold", -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif';

  /* ─────────────────────────── renkler ─────────────────────────── */
  var NAVY = "#1B1648"; // kontur
  var INK = "#141043"; // tepsi / hap zemini
  var SUN = "#FFD43B", SUN_D = "#F08C00";
  var GOOD = "#22C55E", BAD = "#FF4D6A";

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
  var rosterSig = "";
  function setRoster(r) {
    var cp = r && r.captain && r.captain.team ? r.captain : null;
    var rv = r && Array.isArray(r.rivals) ? r.rivals.filter(function (d) { return d && d.team && d.team.kit; }) : [];
    var sig = (cp ? cp.id : "d") + ":" + rv.map(function (d) { return d.team.id; }).join(",");
    if (sig === rosterSig) return;
    rosterSig = sig;
    captain = cp || DEFAULT_CAPTAIN;
    rivals = rv.length ? rv : DEFAULT_RIVALS;
    bg = null;
  }
  function rivalAt(w) {
    return rivals[(Math.max(1, w) - 1) % rivals.length];
  }
  function kitOf(person) {
    var k = person && person.team && person.team.kit ? person.team.kit : {};
    return { p: hex(k.primary, "#5B3DF5"), s: hex(k.secondary, "#FFFFFF") };
  }
  function bossName(w) {
    var d = rivalAt(w);
    var who = d.defenders && d.defenders[0];
    return who ? String(who.short || who.name || "Kaptan") : "Kaptan";
  }

  /* ─────────────────────────── kurallar ─────────────────────────── */
  var LANES = 5;
  var ROWS = 5; // koridor boyunca sütun sayısı (dikey 5, yatay 7) — maç başında seçilir
  var CD = 2.2, Z0 = 1.9, GOAL_Z = 0.8; // sütun uzunluğu, ilk sütunun başı, kale çizgisi
  var RUN = 6.6; // ızgaranın sağındaki koşu yolu (m)
  var SPAWN_Z = Z0 + ROWS * CD + RUN;
  var LIVES = 3;
  var SHOT_V = 11, SHOT_DMG = 25;
  var START_ENERGY = 300, SKY_V = 25, CLEAR_ENERGY = 100;

  var UNITS = {
    taraftar: { name: "TARAFTAR", cost: 50, hp: 300, recharge: 5, color: "#FFB21E", unlock: 1, desc: "Güneş üretir" },
    forvet: { name: "FORVET", cost: 75, hp: 300, recharge: 4, color: "#7C5CFF", unlock: 1, desc: "Şut atar" },
    stoper: { name: "STOPER", cost: 50, hp: 2400, recharge: 14, color: "#2F80ED", unlock: 1, desc: "Duvar olur" },
    fuze: { name: "FÜZE", cost: 125, hp: 9999, recharge: 24, color: "#FF3B5C", unlock: 2, desc: "3×3 alanı temizler" },
    fiskiye: { name: "FISKİYE", cost: 25, hp: 1, recharge: 8, color: "#14C8E8", unlock: 3, desc: "Çimi ıslatır, yavaşlatır", trap: true },
    cift: { name: "ÇİFT", cost: 175, hp: 300, recharge: 7, color: "#FF8A1F", unlock: 4, desc: "İki şut birden" },
    kaleci: { name: "KALECİ", cost: 150, hp: 1200, recharge: 14, color: "#7ED321", unlock: 5, desc: "Rakibi kapar" },
    pres: { name: "PRES", cost: 150, hp: 300, recharge: 7, color: "#38BDF8", unlock: 6, desc: "Şutu yavaşlatır" },
    ortaci: { name: "ORTACI", cost: 175, hp: 300, recharge: 8, color: "#D946EF", unlock: 7, desc: "Üç koridora orta" },
    hakem: { name: "HAKEM", cost: 100, hp: 1, recharge: 35, color: "#FFD400", unlock: 8, desc: "Herkesi dondurur", instant: true },
  };
  var ORDER = ["taraftar", "forvet", "stoper", "fuze", "fiskiye", "cift", "kaleci", "pres", "ortaci", "hakem"];
  var FOES = {
    hucum: { hp: 200, v: 0.43, pts: 10, k: 1, cost: 1 },
    kanat: { hp: 150, v: 0.8, pts: 15, k: 0.94, cost: 1.5 },
    santrfor: { hp: 480, v: 0.36, pts: 25, k: 1.2, cost: 3 },
    kaptan: { hp: 1000, v: 0.3, pts: 80, k: 1.36, cost: 0 },
  };
  var EAT = 100; // temas hasarı / sn
  var PRODUCE = 6.5, FIRST_PRODUCE = 3, AUTO_COLLECT = 6, FIRE = 1.4;
  var LOB_EVERY = 2.6, LOB_DMG = 45, LOB_T = 0.75;
  var CHEW = 10, FREEZE = 4, WET_DPS = 12;

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
  var sunBump = 0, flashRed = 0, stateT = 0, goalFlash = 0, goalLane = 2, lostAt = -9;
  var uid = 0;
  var zaps = []; // güneş sayacına uçan ışıklar (ekran)
  var unlockPop = null; // { keys, at } — "YENİ OYUNCU!" kartı
  var press = {}; // kart basma anı (yaylı küçülme)
  var shownPts = 0, shownSun = START_ENERGY;

  function wideScreen() {
    return W > H * 1.15 && W >= 560;
  }
  /** Saha boyu ekran yönüne göre maç başında seçilir (dönerse yerleşim uyar, kurallar sabit). */
  function configureField() {
    var wide = wideScreen();
    ROWS = wide ? 7 : 5;
    RUN = wide ? 12 : 7.2;
    SPAWN_Z = Z0 + ROWS * CD + RUN;
    layoutKey = "";
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
    configureField();
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
    shownSun = energy;
    points = 0;
    shownPts = 0;
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
    unlockPop = null;
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
    var t = wave === 1 ? 15 : 5;
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
  }

  function newFoe(type, lane, z, hp) {
    var F = FOES[type];
    hp = hp || F.hp;
    return { id: ++uid, type: type, lane: lane, z: z, hp: hp, hp0: hp, v: F.v, slow: 0, frozen: 0, wet: 0, hitAt: -9, eating: null, phase: Math.random() * 6, dead: false, at: 0 };
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
      id: ++uid, type: type, lane: lane, row: row, z: cellZ(row), hp: U.hp, hp0: U.hp, at: A.time,
      next: type === "taraftar" ? FIRST_PRODUCE : type === "fuze" ? 0.9 : type === "kaleci" ? 0 : 0.6,
      kickAt: -9, second: -1, hitAt: -9, made: -9, caught: -9, look: (uid * 7) % 5,
    };
    grid[lane][row] = u;
    units.push(u);
    if (!free && W) {
      A.sound("place");
      A.haptic("light");
      var x = sx(u.z), y = footY(lane);
      A.ring(x, y - L.lh * 0.2, U.color, L.lh * 0.7, 7);
      A.burst(x, y, 12, { speed: 160, gravity: 400, life: 0.5, size: 4, color: ["#B7F59A", "#FFFFFF", U.color] });
    }
    return true;
  }
  function removeUnit(u, silent) {
    if (grid[u.lane][u.row] === u) grid[u.lane][u.row] = null;
    var i = units.indexOf(u);
    if (i >= 0) units.splice(i, 1);
    u.gone = true;
    if (!silent) blast("puff", u.lane, u.z);
  }

  /** HAKEM: düdük — sahadaki bütün rakipler donar. */
  function whistle(lane, row) {
    foes.forEach(function (f) {
      if (f.dead) return;
      f.frozen = FREEZE;
      hurtFoe(f, 20, false);
    });
    refs.push({ lane: lane, z: cellZ(row), at: A.time, id: ++uid });
    blast("whistle", lane, cellZ(row));
    if (state === "play") {
      A.sound("whistle");
      A.haptic("heavy");
      A.flash("#FFE14D", 0.32);
      A.punch(0.7);
      A.ring(W / 2, H * 0.45, "#FFE14D", Math.max(W, H) * 0.6, 16);
      A.announce("DÜDÜK!", "Rakipler " + FREEZE + " sn dondu", "#FFE14D");
    }
  }

  function addEnergy(v, z, lane) {
    energy = Math.min(9990, energy + v);
    if (state === "play" && z != null) floatAt("+" + v, z, lane, 1.4, SUN, 18);
  }
  function collect(o) {
    if (o.taken) return;
    o.taken = true;
    o.at = A.time;
    addEnergy(o.v, o.z, o.lane);
    if (W && L.lh) {
      var p = orbPos(o);
      A.sparkle(p.x, p.y, o.v > 25 ? 16 : 9, SUN);
      for (var i = 0; i < (o.v > 25 ? 3 : 1); i++) zaps.push({ x: p.x + (Math.random() - 0.5) * 16, y: p.y + (Math.random() - 0.5) * 16, t: -i * 0.07, bend: (Math.random() - 0.5) * 120 });
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
        floatAt("+" + FOES[f.type].pts, f.z, f.lane, 2.6, f.type === "kaptan" ? SUN : "#FFFFFF", f.type === "kaptan" ? 26 : 18);
        blast("ko", f.lane, f.z, f.type === "kaptan");
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
    sunBump = Math.max(0, sunBump - dt * 4);
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
          ["taraftar", "forvet", null, "stoper"],
          ["taraftar", "ortaci", "forvet", null, "fiskiye"],
          ["forvet", "cift", null, "kaleci"],
          ["taraftar", "pres", null, "stoper"],
          ["forvet", "forvet", null, "fiskiye"],
        ];
        demo.forEach(function (row, l) {
          row.forEach(function (ty, r) {
            if (ty && r < ROWS) place(ty, l, r, true);
          });
        });
        [[0, SPAWN_Z - 3, "hucum"], [2, SPAWN_Z - 1, "santrfor"], [3, SPAWN_Z - 5, "kanat"], [4, SPAWN_Z - 0.5, "hucum"], [1, cellZ(ROWS - 1) + 2.5, "hucum"]].forEach(function (q) {
          foes.push(newFoe(q[2], q[0], q[1]));
        });
      }
      if (!queue.length && foes.length < 5) {
        waveT = 0;
        for (var qd = 0; qd < 6; qd++) queue.push({ t: 0.5 + qd * 1.8, type: qd % 3 === 2 ? "kanat" : qd === 4 ? "santrfor" : "hucum", lane: (qd * 2 + 1) % LANES });
      }
    }

    /* Dalga akışı */
    if (waveState === "run") {
      waveT += dt;
      if (playing && !surged && waveT >= surgeAt && queue.length) {
        surged = true;
        A.announce("BÜYÜK HÜCUM!", String(rivalAt(wave).team.name || "Rakip") + " yükleniyor", BAD);
        A.sound("whistle");
        A.haptic("warning");
      }
      while (queue.length && queue[0].t <= waveT) {
        var q = queue.shift();
        var F = FOES[q.type];
        var scale = wave > 5 ? 1 + 0.14 * (wave - 5) : 1;
        var hp = Math.round((q.type === "kaptan" ? F.hp + 220 * (wave - 2) : F.hp) * scale);
        var nf = newFoe(q.type, q.lane, SPAWN_Z + Math.random() * 0.8, hp);
        nf.v = F.v * A.rand(0.94, 1.06);
        foes.push(nf);
      }
      if (playing && !queue.length && !foes.some(function (f) { return !f.dead; })) {
        waveState = "rest";
        restT = 5;
        var bonus = 50 * wave;
        points += bonus;
        addEnergy(CLEAR_ENERGY, cellZ(1), 2);
        A.announce(wave + ". DALGA TEMİZ", "+" + bonus + " puan · +" + CLEAR_ENERGY + " güneş");
        A.sound("level");
        A.haptic("success");
      }
    } else {
      restT -= dt;
      if (restT <= 0) {
        wave += 1;
        buildWave();
        var news = ORDER.filter(function (k) { return UNITS[k].unlock === wave; });
        if (news.length && playing) {
          unlockPop = { keys: news, at: A.time };
          A.sound("power");
          A.haptic("success");
          if (W) {
            A.confetti(W * 0.2, H * 0.35, 30);
            A.confetti(W * 0.8, H * 0.35, 30);
          }
        } else {
          A.announce(wave + ". DALGA", "Rakip: " + String(rivalAt(wave).team.name || "Rakip"));
          A.sound("whistle");
        }
      }
    }
    if (unlockPop && A.time - unlockPop.at > 3.6) unlockPop = null;

    /* Gökten güneş */
    if (playing) {
      skyT -= dt;
      if (skyT <= 0) {
        skyT = A.rand(4.5, 6.5);
        skyN += 1;
        orbs.push({ id: ++uid, lane: ((Math.random() * LANES) | 0) + A.rand(-0.2, 0.2), z: cellZ((Math.random() * ROWS) | 0) + A.rand(-0.4, 0.4), y: 10, v: skyN % 5 === 0 ? SKY_V * 2 : SKY_V, born: A.time, taken: false, at: 0, sky: true });
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
      if (ty3 === "taraftar") {
        if (u.next <= 0) {
          u.next = PRODUCE;
          u.made = A.time;
          orbs.push({ id: ++uid, lane: u.lane + A.rand(-0.12, 0.12), z: u.z + A.rand(-0.5, 0.5), y: 2.6, v: 25, born: A.time, taken: false, at: 0, sky: false, fz: u.z });
        }
      } else if (ty3 === "fuze") {
        if (u.next <= 0) {
          for (var bf = 0; bf < foes.length; bf++) {
            var e = foes[bf];
            if (Math.abs(e.lane - u.lane) <= 1 && Math.abs(e.z - u.z) <= CD * 1.5) hurtFoe(e, 1800, false);
          }
          blast("boom", u.lane, u.z);
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
            lobs.push({ id: ++uid, lane: tgt.lane, z0: u.z + 0.4, l0: u.lane, z1: Math.max(GOAL_Z, tgt.z - mv * LOB_T), l1: tgt.lane, t: 0 });
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
            shots.push({ lane: u.lane, z: u.z + 0.6, z0: u.z + 0.6, slow: ty3 === "pres", dmg: SHOT_DMG, id: ++uid, kind: ty3 });
            if (ty3 === "cift") u.second = 0.2;
            u.next = FIRE;
            if (playing && Math.random() < 0.25) A.sound("shoot");
          } else u.next = 0.2;
        }
        if (u.second > 0) {
          u.second -= dt;
          if (u.second <= 0) {
            shots.push({ lane: u.lane, z: u.z + 0.6, z0: u.z + 0.6, slow: false, dmg: SHOT_DMG, id: ++uid, kind: "cift" });
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
        blast(s.slow ? "ice" : "hit", s.lane, hit.z - 0.3, s.kind);
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
        blast("splash", lb.l1, lb.z1);
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
        blast("catch", victim.lane, victim.z);
        if (playing) {
          A.sound("pop");
          A.haptic("medium");
          floatAt("KURTARIŞ!", victim.z, victim.lane, 3, "#A3F04B", 18);
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
        blast("goal", f.lane, GOAL_Z);
        goalLane = f.lane;
        if (playing) {
          lives -= 1;
          conceded += 1;
          lostAt = A.time;
          flashRed = 1;
          goalFlash = 1;
          A.shake(10);
          A.sound("groan");
          A.sound("net");
          A.haptic("error");
          A.announce("GOL YEDİN!", lives > 0 ? "Kalan hak: " + lives : "Savunma çöktü", BAD);
          if (lives <= 0) {
            state = "dying";
            stateT = 0;
          }
        } else goalFlash = 0.6;
      }
    }
    for (var bi = blasts.length - 1; bi >= 0; bi--) if (A.time - blasts[bi].at > 1) blasts.splice(bi, 1);
    for (var ri = refs.length - 1; ri >= 0; ri--) if (A.time - refs[ri].at > 1.6) refs.splice(ri, 1);
  }

  /* ═══════════════════════════ YERLEŞİM ═══════════════════════════ */

  var L = {};
  var layoutKey = "";
  function unlockedKeys() {
    return ORDER.filter(unlocked);
  }
  /**
   * Ekran yerleşimi: üstte HUD, altta kart tepsisi, arada beş koridorluk saha.
   * Metre → piksel ölçeği (k): koşu yolu ekranın sağ kenarına kadar uzansın,
   * ama bir sütun 44 px'ten dar olmasın (dokunma alanı).
   */
  function layout() {
    var att = state === "attract";
    var keys = att ? [] : unlockedKeys();
    var key = W + "x" + H + ":" + att + ":" + keys.length + ":" + ROWS + ":" + SPAWN_Z;
    if (key === layoutKey) return L;
    layoutKey = key;
    var wide = W > H * 1.15;
    var o = { wide: wide, keys: keys, cards: [], sun: null, shovel: null };
    var trayTop = H;
    if (!att) {
      var gap = 7, n = keys.length;
      if (wide) {
        var ch = 64, sunW = 92, shW = 64;
        var cw = Math.min(76, (W - 24 - sunW - shW - (n + 1) * gap) / n);
        var total = sunW + shW + n * cw + (n + 1) * gap;
        var x = (W - total) / 2, y = H - ch - 9;
        o.sun = { x: x, y: y, w: sunW, h: ch };
        x += sunW + gap;
        for (var i = 0; i < n; i++) {
          o.cards.push({ key: keys[i], x: x, y: y, w: cw, h: ch });
          x += cw + gap;
        }
        o.shovel = { x: x, y: y, w: shW, h: ch };
        trayTop = y - 9;
      } else {
        var per = 5, ch2 = 76;
        var cw2 = Math.min(72, (W - 24 - (per - 1) * gap) / per);
        var rows = Math.max(1, Math.ceil(n / per));
        var yb = H - 10 - rows * ch2 - (rows - 1) * gap;
        for (var r = 0; r < rows; r++) {
          var cnt = Math.min(per, n - r * per);
          var x0 = (W - (cnt * cw2 + (cnt - 1) * gap)) / 2;
          for (var j = 0; j < cnt; j++) o.cards.push({ key: keys[r * per + j], x: x0 + j * (cw2 + gap), y: yb + r * (ch2 + gap), w: cw2, h: ch2 });
        }
        var barY = yb - 10 - 40;
        o.sun = { x: 12, y: barY, w: 118, h: 40 };
        o.shovel = { x: W - 12 - 96, y: barY, w: 96, h: 40 };
        trayTop = barY - 10;
      }
    }
    o.trayTop = trayTop;
    var hudB = att ? 12 : wide ? 46 : 86;
    var fb = att ? H - 16 : trayTop - 10;
    var room = fb - (hudB + (wide ? 8 : 40));
    var lh = A.clamp(room / LANES, 44, wide ? 74 : 78);
    o.lh = lh;
    o.fb = fb;
    o.ft = fb - LANES * lh;
    o.gw = A.clamp(lh * (wide ? 0.5 : 0.34), 22, 44);
    o.gx = 10 + o.gw;
    var kfit = (W - o.gx) / (SPAWN_Z - 0.6 - GOAL_Z);
    o.k = Math.max(kfit, 44 / CD);
    o.cw = o.k * CD;
    o.cs = Math.min(lh / 74, o.cw / 38, 1.25); // futbolcu ölçeği
    o.hk = lh * 0.36; // yükseklik: piksel / metre
    o.gridR = sx0(o, Z0 + ROWS * CD);
    L = o;
    bg = null;
    return L;
  }
  function sx0(o, z) {
    return o.gx + (z - GOAL_Z) * o.k;
  }
  function sx(z) {
    return L.gx + (z - GOAL_Z) * L.k;
  }
  function laneY(l) {
    return L.ft + (l + 0.5) * L.lh;
  }
  function footY(l) {
    return laneY(l) + L.lh * 0.3;
  }
  function floatAt(text, z, lane, h, color, size) {
    if (!W || !L.lh) return;
    A.floatText(text, sx(z), footY(lane) - h * L.hk, color, size);
  }
  function orbPos(o) {
    var x = sx(o.z), y = footY(o.lane) - L.lh * 0.32 - (o.y - 0.9) * L.hk;
    if (!o.sky && o.fz != null) {
      // taraftarın bayrağından fırlar, yay çizerek yere iner
      var t = A.clamp((A.time - o.born) / 0.55, 0, 1);
      var x0 = sx(o.fz);
      x = x0 + (x - x0) * A.easeOut(t);
      y -= Math.sin(t * Math.PI) * L.lh * 0.55;
    }
    return { x: x, y: y };
  }

  /** Tek seferlik efekt: kaydı tutulur (çizim için) ve ekran parçacıkları hemen saçılır. */
  function blast(kind, lane, z, extra) {
    var b = { kind: kind, lane: lane, z: z, at: A.time, extra: extra };
    blasts.push(b);
    if (!W || !L.lh) return;
    var x = sx(z), y = footY(lane) - L.lh * 0.3;
    if (kind === "hit" || kind === "ice") {
      A.burst(x, y, 7, { shape: "star", speed: 170, gravity: 300, life: 0.35, size: 5, color: kind === "ice" ? ["#BAE6FD", "#FFFFFF", "#38BDF8"] : extra === "cift" ? ["#FFFFFF", "#FFB25B"] : ["#FFFFFF", SUN] });
    } else if (kind === "puff") {
      A.burst(x, y + L.lh * 0.2, 12, { speed: 90, gravity: -60, life: 0.6, size: 7, color: ["#E2E8F0", "#FFFFFF", "#CBD5E1"] });
    } else if (kind === "boom") {
      A.burst(x, y, 46, { speed: 420, gravity: 300, life: 0.7, size: 7, color: [SUN, "#FF8A1F", BAD, "#FFFFFF"] });
      A.ring(x, y, "#FFB020", L.cw * 3, 14);
      A.flash("#FFB020", 0.25);
      A.hitstop(0.06);
    } else if (kind === "splash") {
      A.burst(x, y + L.lh * 0.15, 16, { speed: 200, gravity: 500, life: 0.45, size: 5, color: ["#E879F9", "#F5D0FE", "#FFFFFF"] });
      A.ring(x, y + L.lh * 0.2, "#E879F9", L.cw * 1.2, 6);
    } else if (kind === "catch") {
      A.burst(x, y, 20, { shape: "star", speed: 200, gravity: 200, life: 0.5, size: 6, color: ["#A3F04B", "#FFFFFF", SUN] });
      A.ring(x, y, "#A3F04B", L.cw, 7);
    } else if (kind === "whistle") {
      A.burst(x, y - L.lh * 0.3, 30, { shape: "star", speed: 320, gravity: 120, life: 0.7, size: 6, color: ["#FFE14D", "#FFFFFF"] });
    } else if (kind === "ko") {
      A.burst(x, y - L.lh * 0.2, extra ? 50 : 14, { shape: "star", speed: extra ? 360 : 200, gravity: 260, life: 0.6, size: 6, color: [SUN, "#FFFFFF", "#38BDF8", "#FF6B8B"] });
      if (state === "play") {
        A.fly(x, y - L.lh * 0.4, SUN, extra ? 6 : 1);
        if (extra) A.confetti(x, y - L.lh * 0.5, 50);
      }
    } else if (kind === "goal") {
      A.burst(L.gx - 6, laneY(lane), 26, { speed: 260, gravity: 300, life: 0.6, size: 5, color: [BAD, "#FFFFFF", "#FF9FB0"] });
    }
  }

  /* ─────────────────────────── girdi ─────────────────────────── */

  function cards() {
    layout();
    var out = L.cards.slice();
    out.shovel = L.shovel;
    out.energy = L.sun;
    return out;
  }
  function inside(p, b, pad) {
    pad = pad || 0;
    return b && p.x >= b.x - pad && p.x <= b.x + b.w + pad && p.y >= b.y - pad && p.y <= b.y + b.h + pad;
  }
  function cardAt(p) {
    var cs = L.cards || [];
    for (var i = 0; i < cs.length; i++) if (inside(p, cs[i], 3)) return cs[i];
    if (inside(p, L.shovel, 4)) return { key: "shovel" };
    return null;
  }
  function cellAt(p) {
    if (!L.lh || p.y > L.trayTop || p.y < L.ft - 6 || p.y > L.fb + 6) return null;
    var lane = Math.floor((p.y - L.ft) / L.lh);
    var z = GOAL_Z + (p.x - L.gx) / L.k;
    var row = Math.floor((z - Z0) / CD);
    lane = A.clamp(lane, 0, LANES - 1);
    if (row < 0 || row >= ROWS) return null;
    return { lane: lane, row: row };
  }
  function usable(type) {
    return unlocked(type) && energy >= UNITS[type].cost && (ready[type] || 0) <= A.time;
  }
  function down(p) {
    if (state !== "play") return;
    layout();
    pointer = p;
    if (unlockPop && A.time - unlockPop.at > 0.5) {
      unlockPop.at = Math.min(unlockPop.at, A.time - 3.3); // kapanış animasyonu
      A.sound("tap");
      return;
    }
    var card = cardAt(p);
    if (card) {
      press[card.key] = A.time;
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
        A.sound("bad");
        A.haptic("warning");
      }
      return;
    }
    // güneş toplama: yakındaki güneş (cömert dokunma alanı)
    var best = null, bd = Math.max(48, L.lh * 0.62);
    orbs.forEach(function (o) {
      if (o.taken) return;
      var q = orbPos(o);
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

  function resize(w, h) {
    W = w;
    H = h;
    if (!grid.length) resetWorld();
    layoutKey = "";
    layout();
  }

  /* ═══════════════════════════ ÇİZİM: FON ═══════════════════════════ */

  var bg = null;
  function paintBackground() {
    var key = layoutKey + ":" + rosterSig + ":" + wave;
    if (bg && bg.key === key) return bg;
    bg = A.layer(W, H);
    bg.key = key;
    var c = bg.ctx;
    var ft = L.ft, fb = L.fb;
    var top = ft - 8; // saha çerçevesi
    var mine = kitOf(captain), rk = kitOf(rivalAt(wave));
    var rnd = A.seeded(4242);

    // Gökyüzü
    var g = c.createLinearGradient(0, 0, 0, top);
    g.addColorStop(0, "#15114A");
    g.addColorStop(0.55, "#2A1C6E");
    g.addColorStop(1, "#5E2B8C");
    c.fillStyle = g;
    c.fillRect(0, 0, W, Math.max(1, top));
    c.fillStyle = INK;
    c.fillRect(0, top, W, H - top);
    c.fillStyle = "#FFFFFF";
    for (var i = 0; i < 26; i++) {
      c.globalAlpha = 0.35 + rnd() * 0.5;
      c.beginPath();
      c.arc(rnd() * W, rnd() * top * 0.6, rnd() < 0.2 ? 2 : 1.2, 0, Math.PI * 2);
      c.fill();
    }
    c.globalAlpha = 1;

    var boardH = top > 60 ? 15 : 0, standH = A.clamp(top * 0.14, 0, 24);
    var cityB = top - boardH - standH - 3; // şehir taban çizgisi
    // Ay
    var mr = A.clamp(Math.min(W, top) * 0.3, 26, 90), mx = W * 0.74, my = cityB - mr * 0.55;
    var mg = c.createRadialGradient(mx, my, mr * 0.8, mx, my, mr * 2.1);
    mg.addColorStop(0, "rgba(255,225,150,0.28)");
    mg.addColorStop(1, "rgba(255,225,150,0)");
    c.fillStyle = mg;
    c.fillRect(mx - mr * 2.2, my - mr * 2.2, mr * 4.4, mr * 4.4);
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

    // Şehir: iki kat bina, yanan pencereler
    function buildings(color, cap, hMin, hMax, wMin, wMax, lit, seed) {
      var r2 = A.seeded(seed);
      var x = -r2() * 30;
      while (x < W) {
        var bw = wMin + r2() * (wMax - wMin);
        var bh = Math.min(cityB - 6, (hMin + r2() * (hMax - hMin)) * Math.max(80, top));
        var by = cityB - bh;
        c.fillStyle = color;
        c.fillRect(x, by, bw, bh + 2);
        c.fillStyle = cap;
        c.fillRect(x - 3, by - 5, bw + 6, 7);
        c.fillStyle = rgba(NAVY, 0.25);
        c.fillRect(x + bw - bw * 0.12, by, bw * 0.12, bh);
        var ww = Math.max(5, bw * 0.15), wh = ww * 1.25, gx = ww * 0.9, gy = wh * 0.75;
        for (var wy = by + 10; wy < cityB - wh - 4; wy += wh + gy)
          for (var wx = x + ww * 0.8; wx < x + bw - ww * 1.6; wx += ww + gx) {
            c.fillStyle = r2() < lit ? "#FFD98A" : rgba(NAVY, 0.45);
            A.roundRect(c, wx, wy, ww, wh, 1.5);
            c.fill();
          }
        x += bw + 4 + r2() * 14;
      }
    }
    if (cityB > 20) {
      buildings("#3A2A80", "#2C2068", 0.45, 0.85, 46, 86, 0.25, 7);
      buildings("#4B3399", "#33267A", 0.25, 0.6, 40, 70, 0.45, 19);
      buildings("#2E3A8F", "#232C70", 0.15, 0.4, 50, 90, 0.5, 31);
    }
    // Projektör kuleleri
    if (top > 70) {
      [W * 0.08, W * 0.92].forEach(function (px) {
        var py = Math.max(16, cityB - top * 0.75);
        c.fillStyle = "#231B5E";
        c.fillRect(px - 2.5, py, 5, cityB - py);
        var lg = c.createRadialGradient(px, py, 2, px, py, 60);
        lg.addColorStop(0, "rgba(255,250,220,0.55)");
        lg.addColorStop(1, "rgba(255,250,220,0)");
        c.fillStyle = lg;
        c.fillRect(px - 60, py - 60, 120, 120);
        c.fillStyle = "#2B2268";
        A.roundRect(c, px - 14, py - 9, 28, 16, 4);
        c.fill();
        c.fillStyle = "#FFF6D0";
        for (var li = 0; li < 3; li++) {
          c.beginPath();
          c.arc(px - 8 + li * 8, py - 1, 3, 0, Math.PI * 2);
          c.fill();
        }
      });
    }
    // Tribün: koyu bant, tek tük renkli taraftar (sade, referanstaki gibi düz)
    if (standH > 6) {
      var sy = cityB;
      c.fillStyle = "#211A5A";
      c.fillRect(0, sy, W, standH);
      c.fillStyle = "#2B2272";
      c.fillRect(0, sy, W, 3);
      var cols = [mine.p, mine.s, rk.p, rk.s];
      var rr = Math.max(2.6, standH / 7);
      for (var xx = 6; xx < W; xx += rr * 3.4) {
        var yy = sy + standH * (0.4 + rnd() * 0.35);
        c.fillStyle = cols[(xx < W * 0.6 ? 0 : 2) + (rnd() < 0.3 ? 1 : 0)];
        c.beginPath();
        c.arc(xx + rnd() * 3, yy, rr, 0, Math.PI * 2);
        c.fill();
        c.beginPath();
        c.ellipse(xx, yy + rr * 2.2, rr * 1.5, rr * 1.2, 0, Math.PI, Math.PI * 2);
        c.fill();
      }
    }
    // LED panolar
    if (boardH) {
      var byy = top - boardH - 3;
      var segW = 120;
      for (var bx = -20, si = 0; bx < W; bx += segW, si++) {
        var pg = c.createLinearGradient(bx, 0, bx + segW, 0);
        pg.addColorStop(0, si % 2 ? "#7C3AED" : "#DB2777");
        pg.addColorStop(1, si % 2 ? "#4F46E5" : "#9333EA");
        c.fillStyle = pg;
        c.fillRect(bx, byy, segW - 2, boardH);
        c.fillStyle = "#FFFFFF";
        c.font = A.font(boardH * 0.62, 900);
        c.textAlign = "center";
        c.textBaseline = "middle";
        c.fillText(si % 2 ? "SAVUNMA HATTI" : "ELİTLİG", bx + segW / 2, byy + boardH * 0.56);
      }
    }

    // Saha zemini
    var gx = L.gx, gridL = sx(Z0), gridR = L.gridR;
    c.fillStyle = "#3BB54A";
    c.fillRect(0, top, W, fb - top + 8);
    // koşu yolu: geniş biçim çizgileri
    var stripe = L.k * CD;
    for (var k2 = 0, x2 = gridR; x2 < W + stripe; x2 += stripe, k2++) {
      c.fillStyle = k2 % 2 ? "#42C152" : "#38B148";
      c.fillRect(x2, ft, stripe + 0.5, fb - ft);
    }
    // ızgara: dama
    for (var l = 0; l < LANES; l++)
      for (var r = 0; r < ROWS; r++) {
        var even = (l + r) % 2 === 0;
        c.fillStyle = even ? "#5FD35F" : "#4CC552";
        c.fillRect(sx(cellZ(r) - CD / 2), ft + l * L.lh, L.cw + 0.5, L.lh + 0.5);
      }
    // ceza alanı (kale önü)
    c.fillStyle = "#4BC157";
    c.fillRect(gx, ft, gridL - gx, fb - ft);
    // koridor ayraçları
    for (var l2 = 1; l2 < LANES; l2++) {
      var yy2 = ft + l2 * L.lh;
      c.fillStyle = "rgba(20,90,40,0.22)";
      c.fillRect(gx, yy2 - 1, W, 2);
    }
    // ızgara ışıltısı (üst kenarlarda açık çizgi)
    c.fillStyle = "rgba(255,255,255,0.10)";
    for (var l3 = 0; l3 < LANES; l3++) c.fillRect(gridL, ft + l3 * L.lh + 1, gridR - gridL, 3);
    // tebeşir çizgileri
    c.strokeStyle = "rgba(255,255,255,0.9)";
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(gx, ft);
    c.lineTo(gx, fb);
    c.stroke();
    c.lineWidth = 2.5;
    c.strokeStyle = "rgba(255,255,255,0.55)";
    c.beginPath();
    c.moveTo(gridL, ft + L.lh * 0.5);
    c.lineTo(gridL, fb - L.lh * 0.5);
    c.stroke();
    // ızgaranın bittiği yer: kesik çizgi
    c.setLineDash([8, 7]);
    c.strokeStyle = "rgba(255,255,255,0.5)";
    c.beginPath();
    c.moveTo(gridR, ft + 4);
    c.lineTo(gridR, fb - 4);
    c.stroke();
    c.setLineDash([]);
    // orta saha çizgisi + yuvarlak (koşu yolunun içinde)
    var midX = sx(Z0 + ROWS * CD + RUN * 0.55);
    if (midX < W + 40) {
      c.strokeStyle = "rgba(255,255,255,0.6)";
      c.lineWidth = 3;
      c.beginPath();
      c.moveTo(midX, ft);
      c.lineTo(midX, fb);
      c.stroke();
      c.beginPath();
      c.arc(midX, (ft + fb) / 2, Math.min(L.lh * 0.95, (fb - ft) * 0.22), 0, Math.PI * 2);
      c.stroke();
      c.fillStyle = "rgba(255,255,255,0.8)";
      c.beginPath();
      c.arc(midX, (ft + fb) / 2, 4, 0, Math.PI * 2);
      c.fill();
    }
    // kale içi: koyu çim + ağ
    var nx0 = gx - L.gw, ny0 = ft - 2, ny1 = fb + 2;
    c.fillStyle = "#2E8F3E";
    c.fillRect(nx0, ny0, L.gw, ny1 - ny0);
    c.save();
    c.beginPath();
    c.rect(nx0, ny0, L.gw, ny1 - ny0);
    c.clip();
    c.strokeStyle = "rgba(255,255,255,0.55)";
    c.lineWidth = 1.2;
    var step = 7;
    for (var d = -(ny1 - ny0); d < L.gw + (ny1 - ny0); d += step) {
      c.beginPath();
      c.moveTo(nx0 + d, ny0);
      c.lineTo(nx0 + d + (ny1 - ny0), ny1);
      c.moveTo(nx0 + d, ny1);
      c.lineTo(nx0 + d + (ny1 - ny0), ny0);
      c.stroke();
    }
    c.restore();
    // beyaz yuvarlak saha çerçevesi + lacivert gölge (referans tahtası gibi)
    c.lineWidth = 5;
    c.strokeStyle = "rgba(10,8,40,0.55)";
    A.roundRect(c, 4, top + 3, W + 40, fb - top + 10, 16);
    c.stroke();
    c.lineWidth = 4;
    c.strokeStyle = "#F4F1FF";
    A.roundRect(c, 4, top, W + 40, fb - top + 8, 16);
    c.stroke();
    return bg;
  }

  /* ═══════════════════════════ ÇİZİM: KARAKTERLER ═══════════════════════════ */

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

  /**
   * Tıknaz çizgi film futbolcu (sağa bakar; dir=-1 sola). Ayakları (x, y)'de,
   * boyu ~62·s. o: kit{p,s,boots}, pose, t, flash, tint/tintK, sq (esneme),
   * rot, look (ten/saç), acc (aksesuar listesi), flagT (taraftar bayrağı).
   */
  function drawPlayer(c, x, y, s, o) {
    var dir = o.dir || 1, sq = o.sq || 1, t = o.t || 0, pose = o.pose || "idle";
    var fl = o.flash || 0, tk = o.tintK || 0, tint = o.tint || "#FFFFFF";
    function C(h) {
      if (tk) h = mixc(h, tint, tk);
      if (fl) h = mixc(h, "#FFFFFF", fl);
      return h;
    }
    var kit = o.kit, acc = o.acc || {};
    var skin = C(SKINS[(o.look || 0) % SKINS.length]), hair = C(HAIRS[(o.look || 0) % HAIRS.length]);
    var aF = 0.15, aB = -0.12, mF = 0.25, mB = -0.2, by = 0, lean = 0, cr = 0;
    var sn = Math.sin(t), cs = Math.cos(t);
    if (pose === "idle") {
      by = Math.sin(t * 2.6) * 0.7;
      mF = 0.25 + Math.sin(t * 2.6) * 0.06;
    } else if (pose === "ready") {
      aF = 0.32;
      aB = -0.28;
      cr = 2;
      mF = 0.55;
      mB = -0.45;
      lean = 0.08;
      by = Math.sin(t * 3) * 0.8;
    } else if (pose === "walk") {
      aF = sn * 0.55;
      aB = -aF;
      mF = -sn * 0.6;
      mB = -mF;
      by = -Math.abs(cs) * 2.4;
      lean = 0.06;
    } else if (pose === "run") {
      aF = sn * 0.85;
      aB = -aF;
      mF = -sn * 0.95;
      mB = -mF;
      by = -Math.abs(cs) * 3.4;
      lean = 0.2;
    } else if (pose === "kick") {
      var k = A.clamp(t, 0, 1);
      aF = k < 0.35 ? -0.8 * A.easeOut(k / 0.35) : -0.8 + 2.0 * A.easeOut((k - 0.35) / 0.3);
      if (k > 0.75) aF = 1.2 - 1.05 * A.smooth((k - 0.75) / 0.25);
      aB = -0.15;
      mF = -0.7;
      mB = 0.8;
      lean = k < 0.35 ? -0.08 : 0.12;
    } else if (pose === "block") {
      aF = 0.42;
      aB = -0.42;
      cr = 3;
      mF = 1.5 + Math.sin(t * 3) * 0.08;
      mB = 1.25;
      lean = 0.05;
      by = Math.sin(t * 3) * 0.6;
    } else if (pose === "cheer") {
      by = -Math.abs(Math.sin(t * Math.PI)) * 9;
      mF = 2.75;
      mB = -2.75;
      aF = 0.25;
      aB = -0.3;
    } else if (pose === "keeper") {
      cr = 4;
      aF = 0.48;
      aB = -0.48;
      mF = 2.2 + Math.sin(t * 4) * 0.15;
      mB = 2.6 - Math.sin(t * 4) * 0.15;
      lean = 0.1;
      by = Math.sin(t * 4) * 1;
    } else if (pose === "tackle") {
      lean = 0.26;
      aF = 0.55 + Math.sin(t * 14) * 0.4;
      aB = -0.35;
      mF = 0.95;
      mB = -0.5;
      by = Math.sin(t * 14) * 1;
    } else if (pose === "wave") {
      mF = 2.35 + Math.sin(t * 4) * 0.2;
      mB = -0.35 + Math.sin(t * 4) * 0.2;
      by = -Math.abs(Math.sin(t * 4)) * 1.6;
    } else if (pose === "whistle") {
      mF = 2.1;
      mB = 2.9;
      by = -Math.abs(Math.sin(t * 6)) * 2;
    } else if (pose === "fall") {
      aF = 1.0;
      aB = 0.5;
      mF = 2.4;
      mB = 2.0;
    }
    var big = acc.big || 1; // stoper/santrfor: gövde daha geniş
    c.save();
    c.translate(x, y);
    var sxk = dir * s * (2 - sq) * big, syk = s * sq;
    c.scale(sxk, syk);
    if (o.rot) c.rotate(o.rot);
    c.lineJoin = "round";
    c.lineCap = "round";
    var LW = Math.max(2.2, 1.4 / s);
    var hipY = -19 + by + cr;
    var LEG = 18 - cr * 0.5;
    var sock = C(acc.socks || kit.p), boots = C(acc.boots || NAVY), shorts = C(kit.short || kit.s);
    function leg(a, back) {
      var fx = Math.sin(a) * LEG, fy = hipY + Math.cos(a) * LEG;
      limb(c, back ? -1 : 1, hipY, fx, fy, 7, back ? mixc(sock, NAVY, 0.22) : sock, LW);
      c.save();
      c.translate(fx + 2.6, fy + 0.5);
      c.rotate(a * 0.4);
      c.beginPath();
      c.ellipse(0, 0, 6, 3.6, 0, 0, Math.PI * 2);
      c.fillStyle = back ? mixc(boots, NAVY, 0.25) : boots;
      c.fill();
      c.lineWidth = LW;
      c.strokeStyle = NAVY;
      c.stroke();
      c.restore();
    }
    var shX = 1.5, shY = -17;
    function arm(m, back, sleeve) {
      var hx = shX + Math.sin(m) * 14, hy = shY + Math.cos(m) * 14;
      var sk = back ? mixc(skin, NAVY, 0.2) : skin;
      limb(c, shX, shY, hx, hy, 5, sk, LW);
      var mx = shX + Math.sin(m) * 6, my = shY + Math.cos(m) * 6;
      limb(c, shX, shY, mx, my, 7.5, back ? mixc(sleeve, NAVY, 0.2) : sleeve, LW);
      if (acc.gloves) blob(c, hx, hy, 4.8, back ? mixc(C("#FFFFFF"), NAVY, 0.2) : C("#FFFFFF"), LW);
      else blob(c, hx, hy, 3.3, sk, LW * 0.8);
      return { x: hx, y: hy };
    }
    leg(aB, true);
    c.save();
    c.translate(0, hipY);
    c.rotate(lean);
    arm(mB, true, C(kit.p));
    c.restore();
    leg(aF, false);
    c.save();
    c.translate(0, hipY);
    c.rotate(lean);
    // şort
    A.roundRect(c, -10, -4, 20, 9.5, 4);
    c.fillStyle = shorts;
    c.fill();
    c.lineWidth = LW;
    c.strokeStyle = NAVY;
    c.stroke();
    // gövde
    A.roundRect(c, -9.5, -21, 19, 19.5, 7.5);
    c.fillStyle = C(kit.p);
    c.fill();
    c.save();
    c.clip();
    c.fillStyle = C(kit.s);
    if (acc.stripes) for (var st = -8; st < 10; st += 6) c.fillRect(st, -22, 2.6, 22);
    else c.fillRect(-1.6, -22, 3.6, 22);
    c.fillStyle = "rgba(255,255,255,0.28)";
    A.roundRect(c, -7, -18.5, 4.5, 9, 2.2);
    c.fill();
    c.fillStyle = "rgba(20,16,67,0.18)";
    c.fillRect(-9.5, -6, 19, 5);
    c.restore();
    A.roundRect(c, -9.5, -21, 19, 19.5, 7.5);
    c.lineWidth = LW;
    c.strokeStyle = NAVY;
    c.stroke();
    if (acc.scarf) {
      A.roundRect(c, -8, -22.5, 16, 5, 2.5);
      c.fillStyle = C(kit.s);
      c.fill();
      c.stroke();
      A.roundRect(c, -7.5, -21, 4.5, 11, 2);
      c.fillStyle = C(kit.p === kit.s ? "#FFFFFF" : kit.s);
      c.fill();
      c.stroke();
    }
    // kafa
    var hx = 2.5, hy = -31.5, hr = 11.5;
    blob(c, hx, hy, hr, skin, 0);
    c.save();
    c.beginPath();
    c.arc(hx, hy, hr, 0, Math.PI * 2);
    c.clip();
    c.fillStyle = hair;
    c.beginPath();
    c.ellipse(hx - 3.5, hy - 7, hr * 1.08, hr * 0.72, -0.15, 0, Math.PI * 2);
    c.fill();
    if (acc.headband) {
      c.fillStyle = C(acc.headband);
      c.fillRect(hx - hr, hy - 6, hr * 2, 3.6);
    }
    if (acc.cap) {
      c.fillStyle = C(acc.cap);
      c.beginPath();
      c.ellipse(hx - 1, hy - 8, hr * 1.1, hr * 0.62, 0, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
    c.beginPath();
    c.arc(hx, hy, hr, 0, Math.PI * 2);
    c.lineWidth = LW;
    c.strokeStyle = NAVY;
    c.stroke();
    if (acc.cap) {
      A.roundRect(c, hx + 3, hy - 6.5, 11, 3.2, 1.6);
      c.fillStyle = C(acc.cap);
      c.fill();
      c.stroke();
    }
    // kulak, göz, yanak, ağız
    blob(c, hx - 3, hy + 1, 3, skin, LW * 0.8);
    if (pose === "fall") {
      c.lineWidth = 1.8;
      c.beginPath();
      c.moveTo(hx + 3.5, hy - 3);
      c.lineTo(hx + 7.5, hy + 1);
      c.moveTo(hx + 7.5, hy - 3);
      c.lineTo(hx + 3.5, hy + 1);
      c.stroke();
    } else {
      c.fillStyle = NAVY;
      c.beginPath();
      c.ellipse(hx + 5.5, hy - 1.2, 1.9, 2.7, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = "#FFFFFF";
      c.beginPath();
      c.arc(hx + 6.1, hy - 2.2, 0.8, 0, Math.PI * 2);
      c.fill();
      if (acc.brow) {
        c.strokeStyle = NAVY;
        c.lineWidth = 1.8;
        c.beginPath();
        c.moveTo(hx + 2.5, hy - 5.8);
        c.lineTo(hx + 8.5, hy - 4.2);
        c.stroke();
      }
    }
    c.fillStyle = "rgba(255,90,110,0.35)";
    c.beginPath();
    c.arc(hx + 4.5, hy + 4, 2.4, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = NAVY;
    c.lineWidth = 1.5;
    c.beginPath();
    if (pose === "cheer" || pose === "wave") c.arc(hx + 8, hy + 3.5, 2.2, 0.1, Math.PI * 0.9);
    else c.arc(hx + 8.5, hy + 3.2, 1.8, 0.3, Math.PI * 0.7);
    c.stroke();
    var hand = arm(mF, false, C(kit.p));
    if (acc.armband) {
      var ax = shX + Math.sin(mF) * 4.5, ay = shY + Math.cos(mF) * 4.5;
      blob(c, ax, ay, 3.3, C("#FFD400"), 1.4);
    }
    if (acc.whistle) {
      c.fillStyle = C("#E2E8F0");
      c.beginPath();
      c.arc(hx + 11, hy + 3, 2.2, 0, Math.PI * 2);
      c.fill();
    }
    if (acc.card) {
      var bh2 = shX + Math.sin(mB) * 14, bv = shY + Math.cos(mB) * 14;
      c.save();
      c.translate(bh2, bv - 6);
      c.rotate(0.2);
      A.roundRect(c, -3.5, -5.5, 7, 10, 1.5);
      c.fillStyle = C("#FFD400");
      c.fill();
      c.lineWidth = 1.4;
      c.stroke();
      c.restore();
    }
    if (acc.flag) {
      // taraftarın güneş bayrağı: sopa + dalgalanan güneş
      var wv = Math.sin((o.flagT || t) * 4) * 0.18;
      c.save();
      c.translate(hand.x, hand.y);
      c.rotate(wv - 0.2);
      limb(c, 0, 8, 0, -26, 2.6, "#9A6232", LW * 0.8);
      // küçük flama (takım renkleri) + tepede güneş
      c.beginPath();
      c.moveTo(0, -24);
      c.quadraticCurveTo(-8, -22 + Math.sin((o.flagT || t) * 8) * 2, -16, -21);
      c.lineTo(-14, -14);
      c.quadraticCurveTo(-7, -15 + Math.sin((o.flagT || t) * 8 + 1) * 2, 0, -15);
      c.closePath();
      c.fillStyle = C(kit.s);
      c.fill();
      c.lineWidth = LW * 0.8;
      c.strokeStyle = NAVY;
      c.stroke();
      drawSunShape(c, 0, -32, 9, (o.flagT || t) * 0.9, fl, 1 / s);
      c.restore();
    }
    c.restore();
    c.restore();
  }

  /** Düz çizgi film top: beyaz gövde, lacivert yamalar, dönme açısıyla yuvarlanır. */
  function flatBall(c, x, y, r, rot, col, patch) {
    c.save();
    c.translate(x, y);
    c.beginPath();
    c.arc(0, 0, r, 0, Math.PI * 2);
    c.fillStyle = col || "#FFFFFF";
    c.fill();
    c.save();
    c.clip();
    c.fillStyle = patch || NAVY;
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
    pent(0, 0, r * 0.36);
    for (var k = 0; k < 5; k++) {
      var a = (k / 5) * Math.PI * 2 + Math.PI / 2;
      pent(Math.cos(a) * r * 0.95, Math.sin(a) * r * 0.95, r * 0.3);
    }
    c.restore();
    c.fillStyle = "rgba(20,16,67,0.16)";
    c.beginPath();
    c.arc(0, 0, r, 0.2, Math.PI - 0.2);
    c.fill();
    c.beginPath();
    c.arc(0, 0, r, 0, Math.PI * 2);
    c.lineWidth = Math.max(1.4, r * 0.2);
    c.strokeStyle = NAVY;
    c.stroke();
    c.fillStyle = "rgba(255,255,255,0.85)";
    c.beginPath();
    c.ellipse(-r * 0.35, -r * 0.42, r * 0.22, r * 0.14, -0.6, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }

  /** Güneş (para birimi): dönen ışınlar, sarı disk, gülen yüz. */
  function drawSunShape(c, x, y, r, rot, flash, lwk) {
    lwk = lwk || 1;
    c.save();
    c.translate(x, y);
    c.save();
    c.rotate(rot || 0);
    c.fillStyle = flash ? mixc("#FFA51F", "#FFFFFF", flash) : "#FFA51F";
    c.beginPath();
    for (var i = 0; i < 10; i++) {
      var a = (i / 10) * Math.PI * 2;
      c.moveTo(Math.cos(a - 0.17) * r * 0.9, Math.sin(a - 0.17) * r * 0.9);
      c.lineTo(Math.cos(a) * r * 1.5, Math.sin(a) * r * 1.5);
      c.lineTo(Math.cos(a + 0.17) * r * 0.9, Math.sin(a + 0.17) * r * 0.9);
    }
    c.fill();
    c.restore();
    c.beginPath();
    c.arc(0, 0, r, 0, Math.PI * 2);
    c.fillStyle = flash ? mixc(SUN, "#FFFFFF", flash) : SUN;
    c.fill();
    c.lineWidth = Math.max(1.4, r * 0.14) * Math.min(1.6, lwk);
    c.strokeStyle = "#C2560C";
    c.stroke();
    c.fillStyle = "rgba(255,255,255,0.55)";
    c.beginPath();
    c.ellipse(-r * 0.38, -r * 0.4, r * 0.32, r * 0.2, -0.6, 0, Math.PI * 2);
    c.fill();
    if (r > 6) {
      c.fillStyle = "#7A2E05";
      c.beginPath();
      c.arc(-r * 0.3, -r * 0.05, r * 0.11, 0, Math.PI * 2);
      c.arc(r * 0.3, -r * 0.05, r * 0.11, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = "#7A2E05";
      c.lineWidth = Math.max(1, r * 0.1);
      c.beginPath();
      c.arc(0, r * 0.12, r * 0.32, 0.25, Math.PI - 0.25);
      c.stroke();
    }
    c.restore();
  }
  var glowSprite = null;
  function sunGlow(c, x, y, r, a) {
    if (!glowSprite) {
      glowSprite = A.layer(64, 64);
      var g = glowSprite.ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
      g.addColorStop(0, "rgba(255,226,90,0.95)");
      g.addColorStop(0.45, "rgba(255,190,40,0.45)");
      g.addColorStop(1, "rgba(255,170,20,0)");
      glowSprite.ctx.fillStyle = g;
      glowSprite.ctx.fillRect(0, 0, 64, 64);
    }
    c.save();
    c.globalAlpha = a == null ? 1 : a;
    c.drawImage(glowSprite.canvas, x - r, y - r, r * 2, r * 2);
    c.restore();
  }

  function myKit(extra) {
    var k = kitOf(captain);
    var o = { p: k.p, s: k.s };
    if (extra) for (var key in extra) o[key] = extra[key];
    return o;
  }

  /**
   * Bir oyuncu kartının/biriminin çizimi. (x, y) ayak noktası; st canlı durum
   * (sahada) ya da yok (kart simgesi).
   */
  function drawUnitArt(c, type, x, y, s, st) {
    st = st || {};
    var t = st.t != null ? st.t : A.time;
    var base = { dir: 1, t: t, flash: st.flash || 0, sq: st.sq || 1, look: st.look || 0, rot: st.rot || 0 };
    var o;
    if (type === "taraftar") {
      var made = st.made != null ? A.time - st.made : 9;
      o = Object.assign(base, { kit: myKit(), pose: made < 0.7 ? "cheer" : "wave", t: made < 0.7 ? made * 3 : t, flagT: t, acc: { scarf: true, flag: true, cap: kitOf(captain).s } });
      drawPlayer(c, x, y, s, o);
    } else if (type === "forvet" || type === "pres" || type === "cift" || type === "ortaci") {
      var acc = { boots: type === "cift" ? "#FF8A1F" : type === "pres" ? "#38BDF8" : type === "ortaci" ? "#D946EF" : "#FFD400" };
      if (type === "pres") acc.headband = "#38BDF8";
      if (type === "ortaci") acc.headband = "#D946EF";
      if (type === "cift") acc.headband = "#FF8A1F";
      var kt = st.kickAt != null ? (A.time - st.kickAt) / 0.42 : -1;
      var kicking = kt >= 0 && kt < 1;
      o = Object.assign(base, { kit: myKit(), pose: kicking ? "kick" : "ready", t: kicking ? kt : t, acc: acc });
      drawPlayer(c, x, y, s, o);
      var hide = kicking && kt >= 0.4;
      var bc = type === "pres" ? "#BDEBFF" : type === "ortaci" ? "#F5C8FF" : type === "cift" ? "#FFD9B0" : "#FFFFFF";
      if (!hide) flatBall(c, x + 13 * s, y - 4.6 * s, 4.6 * s, t * 0.3, bc);
      if (type === "cift" && !hide) flatBall(c, x + 21 * s, y - 4.2 * s, 4.2 * s, t * 0.2, "#FFD9B0");
    } else if (type === "stoper") {
      o = Object.assign(base, { kit: myKit(), pose: "block", acc: { big: 1.18, headband: "#2F80ED", brow: true } });
      drawPlayer(c, x, y, s * 1.08, o);
    } else if (type === "kaleci") {
      var holding = st.next > 0;
      o = Object.assign(base, { kit: { p: "#7ED321", s: "#1F6B12", short: "#1B1648" }, pose: holding ? (st.caught != null && A.time - st.caught < 0.5 ? "cheer" : "idle") : "keeper", acc: { gloves: true, socks: "#7ED321", cap: null } });
      drawPlayer(c, x, y, s, o);
      if (holding) flatBall(c, x + 10 * s, y - 24 * s, 5 * s, 0);
    } else if (type === "hakem") {
      o = Object.assign(base, { kit: { p: "#1F2937", s: "#FFD400", short: "#111827" }, pose: "whistle", acc: { whistle: true, card: true, socks: "#111827", boots: "#FFD400" } });
      drawPlayer(c, x, y, s, o);
    } else if (type === "fuze") {
      var k = st.at != null ? A.clamp((A.time - st.at) / 0.9, 0, 1) : 0.3;
      var r = (11 + k * 4) * s * (1 + Math.sin(A.time * 30) * 0.04 * k);
      var cy = y - r - 1 * s;
      // fitil
      c.strokeStyle = "#8B5A2B";
      c.lineWidth = 2.4 * s;
      c.lineCap = "round";
      c.beginPath();
      c.moveTo(x + r * 0.3, cy - r * 0.85);
      c.quadraticCurveTo(x + r * 0.8, cy - r * 1.5, x + r * 0.2, cy - r * 1.7);
      c.stroke();
      var spark = 1 + Math.sin(A.time * 40) * 0.3;
      sunGlow(c, x + r * 0.2, cy - r * 1.7, 9 * s * spark, 0.9);
      c.fillStyle = "#FFFFFF";
      c.beginPath();
      c.arc(x + r * 0.2, cy - r * 1.7, 2.2 * s, 0, Math.PI * 2);
      c.fill();
      var red = st.flash ? mixc("#FF3B5C", "#FFFFFF", st.flash) : "#FF3B5C";
      flatBall(c, x, cy, r, 0.4, red, "#A3112E");
      if (k > 0) {
        c.globalAlpha = 0.35 * k * (0.5 + 0.5 * Math.sin(A.time * 40));
        blob(c, x, cy, r, "#FFFFFF", 0);
        c.globalAlpha = 1;
      }
    } else if (type === "fiskiye") {
      // yağmurlama başlığı + su yayları
      var bw = 9 * s;
      c.lineWidth = 2.2 * s;
      c.strokeStyle = NAVY;
      A.roundRect(c, x - bw, y - 6 * s, bw * 2, 7 * s, 3 * s);
      c.fillStyle = "#94A3B8";
      c.fill();
      c.stroke();
      A.roundRect(c, x - 3.5 * s, y - 15 * s, 7 * s, 10 * s, 2.5 * s);
      c.fillStyle = "#14C8E8";
      c.fill();
      c.stroke();
      blob(c, x, y - 16 * s, 3.5 * s, "#E0F7FF", 2 * s);
      for (var d = 0; d < 2; d++) {
        var side = d ? 1 : -1;
        c.strokeStyle = "rgba(186,240,255,0.9)";
        c.lineWidth = 2.4 * s;
        c.setLineDash([3 * s, 4 * s]);
        c.lineDashOffset = -A.time * 30 * s;
        c.beginPath();
        c.moveTo(x, y - 17 * s);
        c.quadraticCurveTo(x + side * 12 * s, y - 34 * s, x + side * 22 * s, y - 6 * s);
        c.stroke();
        c.setLineDash([]);
      }
    }
  }

  function foeKit() {
    var k = kitOf(rivalAt(wave));
    return { p: k.p, s: k.s };
  }

  /* ═══════════════════════════ ÇİZİM: SAHA ═══════════════════════════ */

  function render(c, dt) {
    layout();
    shownPts = shownPts < points ? Math.min(points, shownPts + Math.max(1, (points - shownPts) * 0.15)) : points;
    shownSun = A.damp(shownSun, energy, 14, dt);
    if (Math.abs(shownSun - energy) < 0.5) shownSun = energy;
    A.blit(paintBackground());
    drawGoalDanger(c);
    if (state === "play") drawSelection(c);
    drawGround(c);
    for (var l = 0; l < LANES; l++) drawLane(c, l);
    drawGoalFrame(c);
    drawShots(c);
    drawOrbs(c);
    drawBars(c);
    if (state === "play") drawIncoming(c);
    A.drawParticles(c);
    A.drawFloaters(c, dt);
    if (state !== "attract") {
      drawHud(c);
      drawTray(c, dt);
      drawDragGhost(c);
      drawUnlock(c);
    }
    A.drawBanner(c, W, L.ft + (L.fb - L.ft) * 0.36, dt);
    if (flashRed > 0) {
      c.fillStyle = "rgba(255,77,106," + (0.28 * flashRed).toFixed(3) + ")";
      c.fillRect(0, 0, W, H);
    }
  }

  function drawGoalDanger(c) {
    var near = 99;
    foes.forEach(function (f) {
      if (!f.dead) near = Math.min(near, f.z);
    });
    var a = (state === "play" ? A.clamp((5 - near) / 3, 0, 1) * (0.35 + 0.25 * Math.sin(A.time * 9)) : 0) + goalFlash * 0.6;
    if (a <= 0.01) return;
    var g = c.createLinearGradient(L.gx, 0, L.gx + L.cw * 1.2, 0);
    g.addColorStop(0, "rgba(255,45,85," + a.toFixed(3) + ")");
    g.addColorStop(1, "rgba(255,45,85,0)");
    c.fillStyle = g;
    c.fillRect(L.gx, L.ft, L.cw * 1.2, L.fb - L.ft);
  }

  /** Kale çerçevesi (önden): kale çizgisi boyunca direk, iki ucunda direk başı; gol olunca ağ şişer. */
  function drawGoalFrame(c) {
    var x = L.gx, y0 = L.ft - 6, y1 = L.fb + 6, bx = x - L.gw;
    if (goalFlash > 0) {
      var gy = laneY(goalLane), bulge = Math.sin(Math.min(1, (1 - goalFlash) * 2.5) * Math.PI) * L.gw * 0.55;
      c.save();
      c.strokeStyle = "rgba(255,255,255,0.9)";
      c.lineWidth = 2;
      for (var k = -2; k <= 2; k++) {
        var yy = gy + k * L.lh * 0.25;
        c.beginPath();
        c.moveTo(x, yy - L.lh * 0.6);
        c.quadraticCurveTo(bx - bulge, yy, x, yy + L.lh * 0.6);
        c.stroke();
      }
      c.restore();
    }
    c.lineCap = "round";
    // yan direkler (kalenin derinliği)
    [y0, y1].forEach(function (yy) {
      limb(c, bx, yy, x, yy, 5, "#F4F6FF", 2.2);
    });
    // ana direk (kale çizgisi boyunca)
    limb(c, x, y0, x, y1, 7, "#FFFFFF", 2.6);
    c.strokeStyle = "rgba(160,170,210,0.8)";
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(x + 2, y0 + 4);
    c.lineTo(x + 2, y1 - 4);
    c.stroke();
    [y0, y1].forEach(function (yy) {
      blob(c, x, yy, 6.5, "#FFFFFF", 2.6);
    });
  }

  function drawSelection(c) {
    if (removing) {
      units.forEach(function (u) {
        var x = sx(u.z), y = laneY(u.lane);
        c.save();
        c.globalAlpha = 0.55 + 0.25 * Math.sin(A.time * 8);
        A.roundRect(c, x - L.cw / 2 + 3, y - L.lh / 2 + 3, L.cw - 6, L.lh - 6, 10);
        c.lineWidth = 3;
        c.strokeStyle = BAD;
        c.stroke();
        c.restore();
      });
      return;
    }
    if (!selected) return;
    var U = UNITS[selected];
    if (hover) {
      var hy = laneY(hover.lane);
      c.fillStyle = "rgba(255,255,255,0.16)";
      c.fillRect(sx(Z0), hy - L.lh / 2, L.gridR - sx(Z0), L.lh);
    }
    for (var l = 0; l < LANES; l++)
      for (var r = 0; r < ROWS; r++) {
        if (!canPlace(selected, l, r)) continue;
        var x = sx(cellZ(r)), y = laneY(l);
        var pul = 1 + 0.18 * Math.sin(A.time * 5 + l + r);
        c.fillStyle = "rgba(255,255,255,0.6)";
        c.beginPath();
        c.arc(x, y + L.lh * 0.3, 4.5 * pul, 0, Math.PI * 2);
        c.fill();
      }
    if (hover) {
      var ok = canPlace(selected, hover.lane, hover.row);
      var cx = sx(cellZ(hover.row)), cy = laneY(hover.lane);
      c.save();
      A.roundRect(c, cx - L.cw / 2 + 2, cy - L.lh / 2 + 2, L.cw - 4, L.lh - 4, 10);
      c.fillStyle = ok ? "rgba(255,255,255,0.35)" : "rgba(255,77,106,0.35)";
      c.fill();
      c.lineWidth = 3;
      c.strokeStyle = ok ? "#FFFFFF" : BAD;
      c.stroke();
      if (ok && !U.instant) {
        c.globalAlpha = 0.55;
        drawUnitArt(c, selected, cx, footY(hover.lane), L.cs, { t: A.time });
      }
      c.restore();
    }
  }

  /** Yer işaretleri: gölgeler, rol halkaları, fıskiye birikintisi, kaptan halkası. */
  function drawGround(c) {
    units.forEach(function (u) {
      var x = sx(u.z), y = footY(u.lane), U = UNITS[u.type];
      var pop = A.easeOutBack(A.clamp((A.time - u.at) / 0.3, 0, 1));
      if (u.type === "fiskiye") {
        var pul = 1 + Math.sin(A.time * 4 + u.id) * 0.05;
        c.fillStyle = "rgba(34,211,238,0.38)";
        c.beginPath();
        c.ellipse(x, y - 2, L.cw * 0.5 * pul * pop, L.lh * 0.2 * pop, 0, 0, Math.PI * 2);
        c.fill();
        return;
      }
      c.save();
      c.beginPath();
      c.ellipse(x, y + 1, L.cw * 0.42 * pop, L.lh * 0.11 * pop, 0, 0, Math.PI * 2);
      c.fillStyle = rgba(U.color, 0.55);
      c.fill();
      c.lineWidth = 2.5;
      c.strokeStyle = "rgba(255,255,255,0.85)";
      c.stroke();
      c.restore();
    });
    foes.forEach(function (f) {
      if (f.dead) return;
      var x = sx(f.z), y = footY(f.lane), s = L.cs * FOES[f.type].k;
      c.fillStyle = "rgba(20,16,67,0.25)";
      c.beginPath();
      c.ellipse(x, y + 1, 15 * s, 4.5 * s, 0, 0, Math.PI * 2);
      c.fill();
      if (f.type === "kaptan") {
        c.save();
        c.beginPath();
        c.ellipse(x, y + 1, 22 * s, 6.5 * s, 0, 0, Math.PI * 2);
        c.lineWidth = 3;
        c.strokeStyle = "rgba(255,212,59," + (0.6 + 0.3 * Math.sin(A.time * 6)).toFixed(2) + ")";
        c.stroke();
        c.restore();
      }
    });
  }

  function drawLane(c, l) {
    units.forEach(function (u) {
      if (u.lane !== l) return;
      var age = A.time - u.at;
      var x = sx(u.z), y = footY(l), s = L.cs;
      var drop = (1 - A.easeOut(A.clamp(age / 0.18, 0, 1))) * L.lh * 0.7;
      var land = age - 0.18;
      var sq = land < 0 ? 1.12 : 1 - 0.24 * Math.exp(-land * 8) * Math.cos(land * 20);
      var hurt = A.clamp(1 - (A.time - u.hitAt) / 0.15, 0, 1);
      sq *= 1 - hurt * 0.07;
      var weak = 1 - u.hp / u.hp0;
      var st = { t: A.time + u.id, flash: hurt * 0.5, sq: sq, look: u.look, made: u.made, kickAt: u.kickAt, next: u.next, caught: u.caught, at: u.at, rot: weak > 0.5 && u.type !== "stoper" ? (weak - 0.5) * 0.25 : 0 };
      if (u.type === "fuze") st.flash = 0;
      drawUnitArt(c, u.type, x, y - drop, s, st);
      if (u.type === "stoper" && weak > 0.35) {
        // yorgunluk: ter damlaları
        c.fillStyle = "#BDEBFF";
        var dy = (A.time * 30) % 10;
        c.beginPath();
        c.arc(x - 8 * s, y - 52 * s + dy, 2 * s, 0, Math.PI * 2);
        c.fill();
      }
    });
    refs.forEach(function (rf) {
      if (rf.lane !== l) return;
      var a = (A.time - rf.at) / 1.6;
      var drop = Math.max(0, 1 - a * 6) * L.lh;
      var sc = a > 0.85 ? Math.max(0.01, 1 - (a - 0.85) * 6) : 1;
      drawUnitArt(c, "hakem", sx(rf.z), footY(l) - drop, L.cs * sc, { t: A.time * 2, flash: a < 0.1 ? 0.6 : 0 });
      if (a < 0.9) {
        c.save();
        c.globalAlpha = 1 - a;
        c.strokeStyle = "#FFE14D";
        c.lineWidth = 4;
        for (var k = 0; k < 3; k++) {
          var rr = ((a * 3 + k / 3) % 1) * L.lh * 1.5 + 10;
          c.beginPath();
          c.arc(sx(rf.z) + 12 * L.cs, footY(l) - 30 * L.cs, rr, -0.7, 0.7);
          c.stroke();
        }
        c.restore();
      }
    });
    foes.forEach(function (f) {
      if (f.lane !== l) return;
      drawFoe(c, f);
    });
  }

  function drawFoe(c, f) {
    var F = FOES[f.type];
    var x = sx(f.z), y = footY(f.lane), s = L.cs * F.k;
    var kit = foeKit();
    var acc = { brow: true, boots: f.type === "kaptan" ? "#FFD400" : f.type === "kanat" ? "#FF4D6A" : NAVY };
    if (f.type === "kaptan") {
      acc.armband = true;
      acc.big = 1.1;
    }
    if (f.type === "santrfor") acc.big = 1.15;
    if (f.type === "kanat") acc.headband = kit.s;
    if (f.type === "hucum" && f.id % 2) acc.stripes = true;
    var tint = null, tk = 0;
    if (f.frozen > 0) {
      tint = "#E0F2FE";
      tk = 0.55;
    } else if (f.slow > 0) {
      tint = f.wet > 0 ? "#2DD4BF" : "#7DD3FC";
      tk = 0.45;
    }
    var look = f.id % 5;
    if (f.dead) {
      var d = A.clamp((A.time - f.at) / 0.8, 0, 1);
      c.save();
      c.globalAlpha = 1 - Math.max(0, d - 0.55) / 0.45;
      drawPlayer(c, x + A.easeOut(d) * L.cw * 0.9, y - Math.sin(d * Math.PI) * L.lh * 0.5, s, { dir: -1, kit: kit, pose: "fall", t: 0, rot: -d * 1.6, look: look, acc: acc, flash: Math.max(0, 0.7 - d * 3), tint: tint, tintK: tk });
      c.restore();
      return;
    }
    var hurt = A.clamp(1 - (A.time - f.hitAt) / 0.13, 0, 1);
    var fr = f.frozen > 0;
    var pose = fr ? "idle" : f.eating ? "tackle" : f.type === "kanat" ? "run" : "walk";
    var t = fr ? 0 : f.eating ? A.time + f.id : f.phase;
    var sq = 1 - hurt * 0.1 + (pose === "walk" || pose === "run" ? Math.abs(Math.cos(f.phase)) * 0.03 : 0);
    drawPlayer(c, x, y, s, { dir: -1, kit: kit, pose: pose, t: t, look: look, acc: acc, flash: hurt * 0.65, tint: tint, tintK: tk, sq: sq, rot: hurt * 0.1 });
    if (!f.eating) flatBall(c, x - 13 * s, y - 4.6 * s, 4.6 * s, -f.phase * 1.3);
    if (f.wet > 0) {
      c.fillStyle = "rgba(125,211,252,0.9)";
      for (var k = 0; k < 3; k++) {
        var dy = ((A.time * 40 + k * 7) % 20) * s;
        c.beginPath();
        c.arc(x + (k - 1) * 7 * s, y - 50 * s + dy, 1.8 * s, 0, Math.PI * 2);
        c.fill();
      }
    }
  }

  function drawShots(c) {
    var s = L.cs;
    shots.forEach(function (sh) {
      var x = sx(sh.z), y = footY(sh.lane) - 12 * s;
      var col = sh.slow ? "#9BE3FF" : sh.kind === "cift" ? "#FFC58A" : "#FFFFFF";
      var trail = Math.min(34 * s, (sh.z - sh.z0) * L.k);
      var g = c.createLinearGradient(x - trail, 0, x, 0);
      g.addColorStop(0, rgba(sh.slow ? "#38BDF8" : sh.kind === "cift" ? "#FF8A1F" : "#FFE14D", 0));
      g.addColorStop(1, rgba(sh.slow ? "#38BDF8" : sh.kind === "cift" ? "#FF8A1F" : "#FFE14D", 0.85));
      c.strokeStyle = g;
      c.lineWidth = 7 * s;
      c.lineCap = "round";
      c.beginPath();
      c.moveTo(x - trail, y);
      c.lineTo(x, y);
      c.stroke();
      flatBall(c, x, y, 5.4 * s, -A.time * 18 + sh.id, col);
    });
    lobs.forEach(function (lb) {
      var t = A.clamp(lb.t, 0, 1);
      var x = sx(lb.z0 + (lb.z1 - lb.z0) * t);
      var gy = footY(lb.l0 + (lb.l1 - lb.l0) * t);
      var y = gy - 14 * s - Math.sin(t * Math.PI) * L.lh * 1.5;
      c.fillStyle = "rgba(20,16,67,0.25)";
      c.beginPath();
      c.ellipse(x, gy, 6 * s * (1 - Math.sin(t * Math.PI) * 0.4), 2.2 * s, 0, 0, Math.PI * 2);
      c.fill();
      sunGlow(c, x, y, 13 * s, 0.4);
      flatBall(c, x, y, 5.6 * s * (1 + Math.sin(t * Math.PI) * 0.25), -A.time * 14 + lb.id, "#F5C8FF");
    });
  }

  function drawOrbs(c) {
    orbs.forEach(function (o) {
      var p = orbPos(o);
      var tk = o.taken ? A.clamp((A.time - o.at) / 0.4, 0, 1) : 0;
      var pop = A.easeOutBack(A.clamp((A.time - o.born) / 0.3, 0, 1));
      var bob = o.y <= 0.91 ? Math.sin(A.time * 3 + o.id) * 3 : 0;
      var r = Math.max(10, L.lh * 0.17) * (o.v > 25 ? 1.3 : 1) * (1 + Math.sin(A.time * 6 + o.id) * 0.05) * pop * (1 - tk * 0.6);
      var y = p.y + bob - tk * 30;
      // kaybolmak üzere olan gök güneşi yanıp söner
      var fade = o.sky && A.time - o.born > 13 ? 0.5 + 0.5 * Math.sin(A.time * 18) : 1;
      c.save();
      c.globalAlpha = (1 - tk) * fade;
      sunGlow(c, p.x, y, r * 3, 0.85);
      drawSunShape(c, p.x, y, r, A.time * 1.2 + o.id, o.v > 25 ? 0.15 : 0);
      c.restore();
    });
  }

  /** Can çubukları ve durum simgeleri. */
  function drawBars(c) {
    function bar(x, y, frac, color, w, label) {
      A.roundRect(c, x - w / 2, y - 4, w, 8, 4);
      c.fillStyle = NAVY;
      c.fill();
      A.roundRect(c, x - w / 2 + 1.5, y - 2.5, Math.max(3, (w - 3) * A.clamp(frac, 0, 1)), 5, 2.5);
      c.fillStyle = color;
      c.fill();
      if (label) {
        c.font = A.font(10, 900);
        c.textAlign = "center";
        c.textBaseline = "alphabetic";
        c.lineJoin = "round";
        c.lineWidth = 3.5;
        c.strokeStyle = NAVY;
        c.strokeText(label, x, y - 7);
        c.fillStyle = "#FFFFFF";
        c.fillText(label, x, y - 7);
      }
    }
    c.save();
    foes.forEach(function (f) {
      if (f.dead) return;
      var s = L.cs * FOES[f.type].k;
      var x = sx(f.z), top = footY(f.lane) - 50 * s;
      if (f.type === "kaptan") bar(x, top - 4, f.hp / f.hp0, BAD, 60, "KAPTAN · " + bossName(wave));
      else if (f.hp < f.hp0) bar(x, top - 4, f.hp / f.hp0, f.slow > 0 ? "#38BDF8" : BAD, 30);
      if (f.frozen > 0) {
        c.save();
        c.translate(x + 12 * s, top - 6);
        c.rotate(0.25 + Math.sin(A.time * 6 + f.id) * 0.1);
        A.roundRect(c, -5, -7, 10, 14, 2);
        c.fillStyle = "#FFD400";
        c.fill();
        c.lineWidth = 2;
        c.strokeStyle = NAVY;
        c.stroke();
        c.restore();
      }
    });
    units.forEach(function (u) {
      var x = sx(u.z), top = footY(u.lane) - (u.type === "stoper" ? 60 : 50) * L.cs;
      if (u.hp < u.hp0 && u.type !== "fuze" && u.type !== "fiskiye") bar(x, top - 4, u.hp / u.hp0, GOOD, 30);
      if (u.type === "kaleci" && u.next > 0) {
        c.beginPath();
        c.arc(x, top - 12, 7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - u.next / CHEW));
        c.lineWidth = 3;
        c.strokeStyle = "#A3F04B";
        c.stroke();
      }
    });
    c.restore();
  }

  /** Ekranın dışından gelen rakip: sağ kenarda okla uyarı rozeti (referans oklu daireler). */
  function drawIncoming(c) {
    var warn = {};
    foes.forEach(function (f) {
      if (!f.dead && sx(f.z) > W - 8) warn[f.lane] = Math.max(warn[f.lane] || 0, f.type === "kaptan" ? 2 : 1);
    });
    queue.forEach(function (q) {
      if (q.t - waveT < 2.5) warn[q.lane] = Math.max(warn[q.lane] || 0, q.type === "kaptan" ? 2 : 1);
    });
    for (var l in warn) {
      var y = laneY(+l), x = W - 20;
      var pul = 1 + 0.12 * Math.sin(A.time * 10);
      c.save();
      c.translate(x, y);
      c.scale(pul, pul);
      blob(c, 0, 0, 13, warn[l] === 2 ? "#FFD400" : "#FFFFFF", 3);
      c.strokeStyle = warn[l] === 2 ? NAVY : BAD;
      c.lineWidth = 3.4;
      c.lineCap = "round";
      c.lineJoin = "round";
      c.beginPath();
      c.moveTo(6, 0);
      c.lineTo(-6, 0);
      c.moveTo(-1, -5);
      c.lineTo(-6, 0);
      c.lineTo(-1, 5);
      c.stroke();
      c.restore();
    }
  }

  /* ═══════════════════════════ HUD + TEPSİ ═══════════════════════════ */

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
  /** Koyu lacivert, alt kenarı gölgeli yuvarlak hap (referans üst bar hapları). */
  function navyPill(c, x, y, w, h, fill) {
    A.roundRect(c, x, y + 3, w, h, h / 2);
    c.fillStyle = "rgba(8,6,30,0.55)";
    c.fill();
    A.roundRect(c, x, y, w, h, h / 2);
    var g = c.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, fill ? mixc(fill, "#FFFFFF", 0.12) : "#2C2580");
    g.addColorStop(1, fill || "#1C1760");
    c.fillStyle = g;
    c.fill();
    c.lineWidth = 1.5;
    c.strokeStyle = "rgba(255,255,255,0.14)";
    c.stroke();
  }
  function shield(c, x, y, r, on, broken) {
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

  function drawHud(c) {
    var wide = L.wide;
    var y = wide ? 8 : 10, h = wide ? 30 : 34;
    // Puan hapı (sol)
    var kick = Math.max(A.scoreKick || 0, shownPts < points ? 0.3 : 0);
    var txt = String(Math.round(shownPts));
    c.font = A.font(h * 0.6, 900);
    var pw = Math.max(86, c.measureText(txt).width + h + 26);
    navyPill(c, 12 + h * 0.4, y, pw, h);
    c.save();
    c.translate(12 + h / 2, y + h / 2);
    c.scale(1 + kick * 0.25, 1 + kick * 0.25);
    sunGlow(c, 0, 0, h * 0.9, kick * 0.8);
    flatBall(c, 0, 0, h * 0.5, A.time * 0.6);
    c.restore();
    A.scoreAnchor = { x: 12 + h / 2, y: y + h / 2 };
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
      shield(c, W - 14 - sr - (LIVES - 1 - i) * (sr * 2 + 6), y + h / 2, sr, on || br > 0, br);
    }
    // Dalga: başlık + rakip takım rozeti + ilerleme çubuğu
    var rv = rivalAt(wave), rk = kitOf(rv);
    var total = Math.max(1, surgeAt + 6);
    var prog = waveState === "rest" ? 1 : A.clamp(waveT / total, 0, 1);
    var bx, bw, byy, bh;
    var name = String(rv.team.name || "Rakip");
    if (wide) {
      bw = Math.min(W * 0.36, 300);
      bx = W / 2 - bw / 2;
      byy = y + 4;
      bh = h - 8;
    } else {
      bx = 14;
      bw = W - 28;
      byy = y + h + 12;
      bh = 22;
    }
    // ilerleme
    A.roundRect(c, bx, byy + 2, bw, bh, bh / 2);
    c.fillStyle = "rgba(8,6,30,0.55)";
    c.fill();
    A.roundRect(c, bx, byy, bw, bh, bh / 2);
    c.fillStyle = "#231D6B";
    c.fill();
    var fw = Math.max(bh, bw * prog);
    A.roundRect(c, bx, byy, fw, bh, bh / 2);
    var pg = c.createLinearGradient(0, byy, 0, byy + bh);
    pg.addColorStop(0, surged ? "#FF7A90" : "#4ADE6E");
    pg.addColorStop(1, surged ? "#E11D48" : "#16A34A");
    c.fillStyle = pg;
    c.fill();
    c.fillStyle = "rgba(255,255,255,0.25)";
    A.roundRect(c, bx + 4, byy + 2.5, Math.max(0, fw - 8), bh * 0.28, bh * 0.14);
    c.fill();
    // büyük hücum işareti (bayrak)
    var mx = bx + bw * A.clamp(surgeAt / total, 0, 1);
    c.fillStyle = "#FFFFFF";
    c.fillRect(mx - 1, byy - 3, 2, bh + 6);
    c.fillStyle = BAD;
    c.beginPath();
    c.moveTo(mx + 1, byy - 3);
    c.lineTo(mx + 9, byy + 1);
    c.lineTo(mx + 1, byy + 5);
    c.closePath();
    c.fill();
    var lbl = wave + ". DALGA · " + name;
    c.font = A.font(bh * 0.58, 900);
    while (lbl.length > 8 && c.measureText(lbl).width > bw - 40) lbl = lbl.slice(0, -2) + "…";
    // takım rengi rozeti
    var chipX = bx + bw / 2 - c.measureText(lbl).width / 2 - 12;
    blob(c, chipX, byy + bh / 2, bh * 0.3, rk.p, 2);
    label(c, lbl, bx + bw / 2 + 4, byy + bh / 2 + 0.5, bh * 0.58, "#FFFFFF");
  }

  /** Beyaz kart: simge sanatı, ad, maliyet rozeti, dolum süpürmesi, seçili kalkış. */
  function drawCard(c, b, dt) {
    var U = UNITS[b.key];
    var cool = Math.max(0, (ready[b.key] || 0) - A.time) / U.recharge;
    var afford = energy >= U.cost;
    var on = selected === b.key;
    var fresh = U.unlock > 1 && wave === U.unlock && waveT < 15 && waveState === "run";
    b.lift = A.damp(b.lift || 0, on ? -9 : 0, 18, dt);
    var pt = A.time - (press[b.key] || -9);
    var ps = pt < 0.35 ? 1 - 0.1 * Math.exp(-pt * 10) * Math.cos(pt * 18) : 1;
    var x = b.x, y = b.y + b.lift;
    if (fresh && !on) y += -Math.abs(Math.sin(A.time * 5)) * 3;
    var cx = x + b.w / 2;
    c.save();
    c.translate(cx, y + b.h / 2);
    c.scale(ps, ps);
    c.translate(-cx, -(y + b.h / 2));
    if (on) {
      c.save();
      c.shadowColor = "#FFD43B";
      c.shadowBlur = 18;
      A.roundRect(c, x - 2, y - 2, b.w + 4, b.h + 4, 15);
      c.fillStyle = "#FFD43B";
      c.fill();
      c.restore();
    }
    // alt gölge kenarı + gövde
    A.roundRect(c, x, y + 4, b.w, b.h, 13);
    c.fillStyle = "#B9BFE0";
    c.fill();
    A.roundRect(c, x, y, b.w, b.h, 13);
    c.fillStyle = "#FFFFFF";
    c.fill();
    if (on) {
      c.lineWidth = 3;
      c.strokeStyle = "#FFB800";
      c.stroke();
    }
    // simge zemini: rol renginde yumuşak daire
    var iy = y + b.h * 0.43;
    blob(c, cx, iy - 2, Math.min(b.w, b.h) * 0.36, rgba(U.color, 0.26), 0);
    c.save();
    A.roundRect(c, x, y, b.w, b.h, 13);
    c.clip();
    var s = Math.min(b.h / 76, b.w / 62);
    var art = b.key === "fuze" ? 1.25 : b.key === "fiskiye" ? 1.3 : b.key === "taraftar" ? 0.72 : 0.84;
    var shift = b.key === "forvet" || b.key === "cift" || b.key === "pres" || b.key === "ortaci" ? -5 * s : b.key === "taraftar" ? 4 * s : 0;
    drawUnitArt(c, b.key, cx + shift, y + b.h - 22, s * art, { t: A.time * 0.8 + ORDER.indexOf(b.key) });
    c.restore();
    // ad
    c.font = A.font(Math.min(11, b.w * 0.16), 900);
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillStyle = NAVY;
    c.fillText(U.name, cx, y + b.h - 11, b.w - 6);
    // dolum / yetersiz güneş perdesi
    if (!afford || cool > 0) {
      c.save();
      A.roundRect(c, x, y, b.w, b.h, 13);
      c.clip();
      c.fillStyle = "rgba(20,16,67,0.38)";
      c.fillRect(x, y, b.w, b.h);
      if (cool > 0) {
        c.fillStyle = "rgba(20,16,67,0.5)";
        c.fillRect(x, y, b.w, b.h * cool);
        c.fillStyle = "rgba(255,255,255,0.8)";
        c.fillRect(x, y + b.h * cool - 1.5, b.w, 2);
      }
      c.restore();
    }
    // maliyet rozeti (sağ üst köşe, sarı)
    var bwid = 36, bh = 18, bxx = x + b.w - bwid + 6, byy = y - 7;
    A.roundRect(c, bxx, byy, bwid, bh, bh / 2);
    c.fillStyle = afford ? "#FFC72C" : BAD;
    c.fill();
    c.lineWidth = 2;
    c.strokeStyle = NAVY;
    c.stroke();
    drawSunShape(c, bxx + 9, byy + bh / 2, 4.2, 0, 0);
    c.font = A.font(11, 900);
    c.textAlign = "center";
    c.fillStyle = afford ? NAVY : "#FFFFFF";
    c.fillText(String(U.cost), bxx + 24, byy + bh / 2 + 0.5);
    if (fresh) {
      A.roundRect(c, x - 6, y - 7, 36, 16, 8);
      c.fillStyle = BAD;
      c.fill();
      c.lineWidth = 2;
      c.strokeStyle = "#FFFFFF";
      c.stroke();
      c.font = A.font(9, 900);
      c.fillStyle = "#FFFFFF";
      c.fillText("YENİ", x + 12, y + 1.5);
    }
    c.restore();
  }

  function drawTray(c, dt) {
    var top = L.trayTop;
    // tepsi paneli
    A.roundRect(c, 4, top, W - 8, H - top + 20, 20);
    var g = c.createLinearGradient(0, top, 0, H);
    g.addColorStop(0, "#211A66");
    g.addColorStop(1, "#140F45");
    c.fillStyle = g;
    c.fill();
    c.lineWidth = 2;
    c.strokeStyle = "rgba(255,255,255,0.12)";
    c.stroke();
    L.cards.forEach(function (b) {
      drawCard(c, b, dt);
    });
    // Güneş sayacı
    var sb = L.sun;
    var bump = Math.max(sunBump, Math.abs(shownSun - energy) > 1 ? 0.25 : 0);
    if (L.wide) {
      A.roundRect(c, sb.x, sb.y + 4, sb.w, sb.h, 14);
      c.fillStyle = "rgba(8,6,30,0.6)";
      c.fill();
      A.roundRect(c, sb.x, sb.y, sb.w, sb.h, 14);
      c.fillStyle = "#2C2580";
      c.fill();
      c.lineWidth = 2;
      c.strokeStyle = bump > 0.1 ? SUN : "rgba(255,212,59,0.5)";
      c.stroke();
      sunGlow(c, sb.x + sb.w / 2, sb.y + sb.h * 0.36, 26 + bump * 12, 0.8);
      drawSunShape(c, sb.x + sb.w / 2, sb.y + sb.h * 0.36, 11 * (1 + bump * 0.25), A.time * 0.7, 0);
      label(c, String(Math.round(shownSun)), sb.x + sb.w / 2, sb.y + sb.h * 0.78, 17 * (1 + bump * 0.2), "#FFFFFF");
      var target = { x: sb.x + sb.w / 2, y: sb.y + sb.h * 0.36 };
    } else {
      navyPill(c, sb.x + 14, sb.y, sb.w - 14, sb.h);
      sunGlow(c, sb.x + sb.h / 2, sb.y + sb.h / 2, sb.h * 0.95 + bump * 10, 0.85);
      drawSunShape(c, sb.x + sb.h / 2, sb.y + sb.h / 2, sb.h * 0.3 * (1 + bump * 0.25), A.time * 0.7, 0);
      label(c, String(Math.round(shownSun)), sb.x + sb.h + 8, sb.y + sb.h / 2 + 1, 20 * (1 + bump * 0.18), "#FFFFFF", "left");
      target = { x: sb.x + sb.h / 2, y: sb.y + sb.h / 2 };
    }
    // ÇIKAR
    var sh = L.shovel;
    var pt = A.time - (press.shovel || -9);
    var ps = pt < 0.35 ? 1 - 0.1 * Math.exp(-pt * 10) * Math.cos(pt * 18) : 1;
    c.save();
    c.translate(sh.x + sh.w / 2, sh.y + sh.h / 2);
    c.scale(ps, ps);
    c.translate(-(sh.x + sh.w / 2), -(sh.y + sh.h / 2));
    if (L.wide) {
      A.roundRect(c, sh.x, sh.y, sh.w, sh.h, 14);
      c.fillStyle = removing ? BAD : "#2C2580";
      c.fill();
      c.lineWidth = 2;
      c.strokeStyle = "rgba(255,255,255,0.18)";
      c.stroke();
      crossIcon(c, sh.x + sh.w / 2, sh.y + sh.h * 0.38, 8);
      label(c, "ÇIKAR", sh.x + sh.w / 2, sh.y + sh.h * 0.76, 11, "#FFFFFF", "center", false);
    } else {
      navyPill(c, sh.x, sh.y, sh.w, sh.h, removing ? "#E11D48" : null);
      crossIcon(c, sh.x + 22, sh.y + sh.h / 2, 7);
      label(c, "ÇIKAR", sh.x + sh.w / 2 + 10, sh.y + sh.h / 2 + 1, 13, "#FFFFFF", "center", false);
    }
    c.restore();

    // Güneşe uçan ışıklar
    for (var z = zaps.length - 1; z >= 0; z--) {
      var zp = zaps[z];
      zp.t += dt / 0.6;
      if (zp.t < 0) continue;
      if (zp.t >= 1) {
        zaps.splice(z, 1);
        sunBump = 1;
        continue;
      }
      var u = A.easeOut(zp.t) * 0.35 + zp.t * zp.t * 0.65;
      var mx = (zp.x + target.x) / 2 + zp.bend, my = Math.min(zp.y, target.y) - 50;
      var px = (1 - u) * (1 - u) * zp.x + 2 * (1 - u) * u * mx + u * u * target.x;
      var py = (1 - u) * (1 - u) * zp.y + 2 * (1 - u) * u * my + u * u * target.y;
      sunGlow(c, px, py, 22, 0.9);
      drawSunShape(c, px, py, 8 * (1 - zp.t * 0.35), A.time * 3, 0);
    }

    // İpucu
    var hint = "";
    if (removing) hint = "Çıkarılacak oyuncuya dokun";
    else if (selected) hint = UNITS[selected].instant ? "Sahaya dokun: düdük!" : UNITS[selected].name + " · " + UNITS[selected].desc.toLocaleLowerCase("tr-TR");
    else if (placed === 0) hint = "TARAFTAR koy: güneş üretir";
    else if (orbs.some(function (o) { return !o.taken && o.sky; }) && placed < 6) hint = "Güneşe dokun, topla!";
    if (hint) {
      c.font = A.font(12, 800);
      var hx0, hx1, hy;
      if (L.wide) {
        hx0 = W * 0.3;
        hx1 = W * 0.7;
        hy = 44;
      } else {
        hx0 = sb.x + sb.w + 8;
        hx1 = sh.x - 8;
        hy = sb.y + 7;
      }
      var hw = Math.min(hx1 - hx0, c.measureText(hint).width + 22);
      if (hw > 50) {
        A.roundRect(c, (hx0 + hx1) / 2 - hw / 2, hy, hw, 26, 13);
        c.fillStyle = "rgba(255,255,255,0.95)";
        c.fill();
        c.textAlign = "center";
        c.textBaseline = "middle";
        c.fillStyle = NAVY;
        c.fillText(hint, (hx0 + hx1) / 2, hy + 13.5, hw - 14);
      }
    }
    // ilk kart: nabız gibi atan sarı hale (öğretici)
    if (placed === 0 && !selected && L.cards[0] && unlockPop == null) {
      var b0 = L.cards[0], k0 = 0.5 + 0.5 * Math.sin(A.time * 6);
      c.save();
      c.globalAlpha = 0.5 + 0.5 * k0;
      c.lineWidth = 3 + k0 * 2;
      c.strokeStyle = SUN;
      c.shadowColor = SUN;
      c.shadowBlur = 14;
      A.roundRect(c, b0.x - 4 - k0 * 2, b0.y - 4 - k0 * 2, b0.w + 8 + k0 * 4, b0.h + 8 + k0 * 4, 16);
      c.stroke();
      c.restore();
    }
  }
  function crossIcon(c, x, y, r) {
    c.save();
    c.lineCap = "round";
    c.strokeStyle = "#FFFFFF";
    c.lineWidth = 3.5;
    c.beginPath();
    c.moveTo(x - r, y - r);
    c.lineTo(x + r, y + r);
    c.moveTo(x + r, y - r);
    c.lineTo(x - r, y + r);
    c.stroke();
    c.restore();
  }

  /** Sürüklenen kart: parmağın ucunda oyuncu (kareye bırak). */
  function drawDragGhost(c) {
    if (!selected || !dragging || !pointer || hover || UNITS[selected].instant) return;
    if (pointer.y > L.trayTop - 4) return;
    c.save();
    c.globalAlpha = 0.85;
    drawUnitArt(c, selected, pointer.x, pointer.y + 14, L.cs, { t: A.time });
    c.restore();
  }

  /** "YENİ OYUNCU!" kartı: dönen ışınlar, zıplayan beyaz kart, oyuncu sanatı. */
  function drawUnlock(c) {
    if (!unlockPop) return;
    var age = A.time - unlockPop.at, life = 3.6;
    var inT = A.easeOutBack(A.clamp(age / 0.45, 0, 1));
    var out = A.clamp((life - age) / 0.3, 0, 1);
    var key = unlockPop.keys[0], U = UNITS[key];
    c.save();
    c.globalAlpha = out;
    c.fillStyle = "rgba(10,8,40,0.68)";
    c.fillRect(0, 0, W, H);
    var cx = W / 2, cy = Math.min(H * 0.46, L.ft + (L.fb - L.ft) * 0.5);
    var cw = Math.min(230, W - 60), ch = Math.min(250, H * 0.5);
    // ışınlar
    c.save();
    c.translate(cx, cy);
    c.rotate(age * 0.5);
    c.globalAlpha = out * 0.16;
    c.fillStyle = SUN;
    for (var i = 0; i < 14; i++) {
      var a0 = (i / 14) * Math.PI * 2;
      c.beginPath();
      c.moveTo(0, 0);
      c.arc(0, 0, Math.max(W, H) * 0.7, a0, a0 + Math.PI / 14);
      c.closePath();
      c.fill();
    }
    c.restore();
    c.translate(cx, cy);
    c.scale(0.4 + 0.6 * inT, 0.4 + 0.6 * inT);
    c.rotate((1 - A.clamp(age / 0.45, 0, 1)) * -0.15);
    // kart
    A.roundRect(c, -cw / 2, -ch / 2 + 6, cw, ch, 22);
    c.fillStyle = "#B9BFE0";
    c.fill();
    A.roundRect(c, -cw / 2, -ch / 2, cw, ch, 22);
    c.fillStyle = "#FFFFFF";
    c.fill();
    c.lineWidth = 4;
    c.strokeStyle = U.color;
    c.stroke();
    blob(c, 0, -ch * 0.08, ch * 0.28, rgba(U.color, 0.22), 0);
    var s = ch / 150;
    drawUnitArt(c, key, 0, ch * 0.16, s * (key === "fuze" || key === "fiskiye" ? 2 : 1.25), { t: A.time });
    c.font = A.font(22, 900);
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillStyle = NAVY;
    c.fillText(U.name, 0, ch * 0.29);
    c.font = A.font(13, 700);
    c.fillStyle = "#4B4790";
    c.fillText(U.desc, 0, ch * 0.4, cw - 20);
    // maliyet
    A.roundRect(c, cw / 2 - 58, -ch / 2 - 12, 66, 28, 14);
    c.fillStyle = "#FFC72C";
    c.fill();
    c.lineWidth = 2.5;
    c.strokeStyle = NAVY;
    c.stroke();
    drawSunShape(c, cw / 2 - 42, -ch / 2 + 2, 7, A.time, 0);
    c.font = A.font(15, 900);
    c.fillStyle = NAVY;
    c.fillText(String(U.cost), cw / 2 - 18, -ch / 2 + 2.5);
    // başlık
    var tb = 1 + Math.sin(age * 6) * 0.04;
    c.save();
    c.translate(0, -ch / 2 - 34);
    c.scale(tb, tb);
    A.bigText(c, "YENİ OYUNCU!", 0, 0, 30, SUN, { stroke: NAVY });
    c.restore();
    c.restore();
    if (age > 0.8) {
      c.save();
      c.globalAlpha = out * (0.6 + 0.4 * Math.sin(A.time * 5));
      label(c, "Dokun, devam et", cx, cy + ch * 0.5 + 26, 13, "#FFFFFF");
      c.restore();
    }
  }

  function debug() {
    layout();
    return {
      state: state, energy: energy, points: points, lives: lives, wave: wave, defeated: defeated, conceded: conceded, placed: placed,
      units: units, foes: foes, shots: shots, lobs: lobs, hover: hover, selected: selected, R: null, orbs: orbs, queue: queue, waveState: waveState, gl: false,
      captain: captain.short, rival: rivalAt(wave).team.name, UNITS: UNITS, FOES: FOES, LANES: LANES, ROWS: ROWS, ORDER: ORDER,
      SPAWN_Z: SPAWN_Z, GOAL_Z: GOAL_Z, layout: L, unlockPop: unlockPop,
      place: place, collect: collect, usable: usable, cards: cards,
      setEnergy: function (v) { energy = v; },
      setWave: function (w) {
        wave = w;
        buildWave();
      },
      /** Dalga arasını atla: bir sonraki dalga hemen başlasın (açılış kartı görünür). */
      nextWave: function () {
        queue.length = 0;
        foes.length = 0;
        waveState = "rest";
        restT = 0.001;
      },
      cellCenter: function (lane, row) {
        layout();
        return { x: sx(cellZ(row)), y: laneY(lane) };
      },
      spawn: function (type, lane, zz) {
        var f = newFoe(type, lane, zz == null ? SPAWN_Z : zz);
        f.phase = 0;
        foes.push(f);
        return f;
      },
      clearQueue: function () { queue.length = 0; },
    };
  }

  A.register({ resize: resize, start: start, update: update, render: render, down: down, move: move, up: up, debug: debug, setRoster: setRoster });
})();
