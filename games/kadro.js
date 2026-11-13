/*
 * KADRO KOŞUSU 3B — kapılardan geç, kadronu büyüt, rakibi şut yağmuruna tut.
 *
 * Tek oyuncuyla başlarsın. Yol boyunca çift KAPILAR gelir (+8, ×2, −5, ÷2):
 * hangi kapıdan geçersen kadron ona göre büyür ya da küçülür. Kadron önüne
 * çıkan RAKİP GRUPLARINA kendiliğinden şut atar; grup erimeden temas edersen
 * bire bir oyuncu kaybedersin. Yolda futbol SİLAHLARI vardır (içinden geç).
 * Her bölümün sonunda rakibin KALESİ var: kaleciyi şutla düşür, GOL at.
 *
 * MİMARİ: simülasyon (kurallar, kapılar, toplar, hasar, puan) çizimden
 * bağımsızdır; başsız testler yalnız onu koşturur. Toplar SİMÜLASYONUN
 * parçasıdır: her top bir rakip figürüne (ya da kaleciye) uçar, hasar YALNIZ
 * değdiği karede işler; o anda figür sayısı (tavan(toplam × can/can0)) düşerse
 * değen figür savrulup düşer, düşmezse sarsılır. Kadro da figür figür
 * tutulur (mem): kaybedilen her oyuncu kadrodan çıkan figürün kendisidir
 * (temasta öndekiler, çubuk/sert şutta isabet yerine en yakınlar), sayaç ile
 * görünen kadro her karede aynıdır. Çizim Canvas 2D'de, sözde 3B (iğne deliği
 * izdüşümü): Savunma Hattı ailesinden düz-vektör çizgi film futbolcular bir
 * kez ekran dışı karelere çizilir, her karede yalnız kopyalanır — 60 fps.
 *
 * GERÇEK İÇERİK (RN'den {type:"config", roster:{captain, rivals}}): kadron
 * seçtiğin oyuncunun kulübünün formasını giyer; her bölüm ligin bir takımına
 * karşıdır (forması, adı, kalecisi).
 *
 * KONTROL: parmağını sağa sola kaydır; kadro parmağını izler.
 *
 * KURALLAR:
 *   · Kapı: sol/sağ yarıdan hangisinden geçtiysen o işlem uygulanır.
 *   · Rakip grubu: menzile (17 m) girince kadron şut atar; vuruş hızı
 *     3 + kadro/2 (en çok 26/sn), top başına hasar kadro × 1,1 / vuruş hızı.
 *     Temasta bire bir takas. Yarım saha kaplayan gruplardan KAÇABİLİRSİN.
 *   · Silahlar (içinden geçince): TOP ÇUVALI 2× vuruş · ATEŞLİ TOP 2,6× hasar
 *     + arkadakini deler · ÜÇLÜ TOP 3 top · FALSOLU TOP kavisli, 2 kez seker ·
 *     DEV TOP (tek atım, grubu biçer) · KRAMPON 6 sn hız + temasta 1'e 3.
 *     Top silahlarının cephanesi ~5 sn'lik atış; yenisi eskisinin yerini alır.
 *   · Antrenman çubuğu (bölüm 2+): sağa sola kayar; değdiği oyuncular düşer.
 *   · Kale: kaleci düzenli aralıkla SERT ŞUT çeker; yerdeki kırmızı halkadan
 *     kaç. Kalecinin canı bitince GOL.
 *   · Zorluk: bölüm 1 sabit; sonra grup canı +%55/bölüm, kaleci +%35/bölüm
 *     (7 bölüme kadar), kötü kapılar sertleşir, 3. bölümden çift kötü kapı.
 *   · Kadro sıfırlanırsa oyun biter.
 *
 * PUAN: eritilen her grup 10 × bölüm; çubuğu kayıpsız geçmek +5; gol
 * 100 + 25 × bölüm + kalan kadronun dörtte biri (en çok +50).
 */
(function () {
  "use strict";
  var A = window.Arena;
  var P = A.PAL;
  // Yuvarlak, kalın oyun yazısı (Savunma Hattı ile aynı aile).
  A.FONT = '"SF Pro Rounded", ui-rounded, "Nunito", "Arial Rounded MT Bold", -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif';

  /* ─────────────────────────── kadro ─────────────────────────── */
  var DEFAULT_CAPTAIN = { id: 0, short: "ElitLig", name: "ElitLig", shirt: 10, team: { name: "ElitLig", kit: { primary: "#5B3DF5", secondary: "#FFFFFF" } } };
  var DEFAULT_RIVALS = [
    ["Kırmızılar", "#DC2626", "#FFFFFF", "M. Polat"],
    ["Sarı-Lacivert", "#FACC15", "#1E3A8A", "E. Kara"],
    ["Yeşiller", "#16A34A", "#FFFFFF", "S. Aydın"],
    ["Turuncular", "#F97316", "#111827", "B. Yıldız"],
    ["Siyahlar", "#111827", "#F8FAFC", "K. Demir"],
  ].map(function (d, i) {
    return { team: { id: -1 - i, name: d[0], kit: { primary: d[1], secondary: d[2] } }, keeper: { short: d[3] } };
  });
  var captain = DEFAULT_CAPTAIN;
  var rivals = DEFAULT_RIVALS;
  var rosterSig = "";
  var lookKey = "";
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
  function rivalAt(lvl) {
    return rivals[(Math.max(1, lvl) - 1) % rivals.length];
  }
  function kitOf(person) {
    var k = person && person.team && person.team.kit ? person.team.kit : {};
    return { primary: k.primary || "#5B3DF5", secondary: k.secondary || "#FFFFFF" };
  }

  /* ─────────────────────────── dünya (metre) ─────────────────────────── */
  var FIELD = 4.4; // yolun yarı genişliği
  var RANGE = 17; // şut menzili
  var FIRE = 1.1; // oyuncu başına saniyedeki hasar
  var SEG = 20; // kapı / grup aralığı
  var STOP = 12; // kale önünde durulan çizginin kaleye uzaklığı
  var MAX_N = 999;
  var VIS = 70; // ekranda çizilen en çok kadro üyesi
  var BALL_V = 30; // top hızı (m/sn)
  var theme = 0; // gökyüzü teması: bölüme göre döner (çizim bölümü THEMES)

  /* Yolda bulunan futbol silahları. secs: ateş edilen saniye cinsinden cephane. */
  var POWERS = {
    sack: { name: "TOP ÇUVALI", tip: "2 kat şut", col: "#22C55E", dark: "#15803D", secs: 6 },
    fire: { name: "ATEŞLİ TOP", tip: "2,6 kat hasar, deler", col: "#FF6A1F", dark: "#C2410C", secs: 5 },
    triple: { name: "ÜÇLÜ TOP", tip: "her vuruşta 3 top", col: "#3B82F6", dark: "#1D4ED8", secs: 5 },
    curve: { name: "FALSOLU TOP", tip: "döner, 3 rakibe seker", col: "#A855F7", dark: "#7E22CE", secs: 5 },
    giant: { name: "DEV TOP", tip: "grubu biçer", col: "#FACC15", dark: "#B45309" },
    boots: { name: "KRAMPON", tip: "hız + omuz şarjı", col: "#22D3EE", dark: "#0E7490", secs: 6 },
  };

  var W = 0, H = 0;
  var state = "attract"; // attract | play | goal | dying | over
  var z = 0, x = 0, target = 0, speed = 0;
  var n = 1, maxN = 1, level = 1, points = 0, goals = 0, cleared = 0;
  var segs = []; // { type:"gate"|"rivals"|"bar", z, ... }
  var boss = null; // { z, hp, hp0, next, shot:{ x, at, land } | null, k, men }
  var expect = 1;
  var scoreBump = 0, flashRed = 0, countBump = 0, stateT = 0, levelZ0 = 0;
  var lastTouchX = null;
  var uid = 0;
  var mem = []; // görünür kadro üyeleri { ox, oz, look, born } — kadronun kendisi
  var memLook = 0;
  var fallen = []; // kadrodan düşen üyeler { x, z, at, look, dir, vx, vy, vz }
  var shots = []; // uçan toplar — HASAR YALNIZ TOP DEĞİNCE işler
  var rolls = []; // dev topun gruptan sonra yuvarlanışı (görsel)
  var shotAcc = 0, lastTgt = null, shootSnd = 0;
  var pickups = []; // { x, z, type, taken, gone, at, id }
  var weapon = null; // { type, ammo, max } — top silahı
  var giant = 0, boostT = 0, BOOST = 6, picked = 0, powerPop = 0;
  var impacts = 0, lostTotal = 0, fallenTotal = 0, lastWhy = "";

  function levelSpeed() {
    return Math.min(11.5, 8.2 + 0.4 * (level - 1));
  }
  function baseRate(count) {
    return Math.min(26, 3 + count * 0.5);
  }
  function apply(v, op) {
    var out = op.op === "+" ? v + op.v : op.op === "-" ? v - op.v : op.op === "x" ? v * op.v : Math.ceil(v / op.v);
    return Math.min(MAX_N, out);
  }
  function opLabel(op) {
    return (op.op === "+" ? "+" : op.op === "-" ? "−" : op.op === "x" ? "×" : "÷") + op.v;
  }
  function isGood(op) {
    return op.op === "+" || op.op === "x";
  }
  function goodOp(e) {
    if (e >= 4 && Math.random() < 0.3) return { op: "x", v: e < 40 && Math.random() < 0.25 ? 3 : 2 };
    return { op: "+", v: Math.round(A.rand(3, 7) + level * 2 + e * 0.22) };
  }
  function badOp(e, good) {
    var r = Math.random();
    // bölüm ilerledikçe kötü kapı daha sert: daha büyük eksi, daha sık ÷
    var hard = Math.min(1, (level - 1) / 4);
    if (r < 0.4) return { op: "-", v: Math.max(1, Math.round(e * A.rand(0.15 + 0.1 * hard, 0.4 + 0.15 * hard))) };
    if (r < 0.6 + 0.15 * hard && e >= 4) return { op: "/", v: level >= 4 && e >= 30 && Math.random() < 0.3 ? 3 : 2 };
    return { op: "+", v: Math.max(1, Math.round((apply(e, good) - e) * A.rand(0.2, 0.45))) };
  }

  function pickPower(lvl, last, boss2) {
    var pool = boss2 ? (lvl === 1 ? ["fire", "triple"] : ["fire", "triple", "curve", "giant"]) : lvl === 1 ? ["sack", "sack", "fire", "triple"] : ["sack", "fire", "fire", "triple", "curve", "curve", "giant", "boots"];
    var t = A.pick(pool);
    if (t === last) t = A.pick(pool);
    return t;
  }

  /** Bir bölümün yolu: kapı · rakip · kapı · (çubuk|rakip) … · KALE; aralarda silahlar. */
  function buildLevel(from) {
    segs = [];
    pickups = [];
    var zz = from + 16;
    var count = 5 + Math.min(level, 4);
    var lastP = null;
    // zorluk: bölüm 1 aynı; sonrasında gruplar ve kaleci kalabalıklaşır,
    // kötü kapılar artar (silahsız geçmek zorlaşır)
    var tough = 1 + 0.55 * Math.min(7, level - 1);
    for (var i = 0; i < count; i++) {
      if (i % 2 === 0) {
        var g = goodOp(expect);
        var bothBad = level >= 3 && Math.random() < 0.12 + 0.03 * Math.min(4, level - 3);
        var other = !bothBad && Math.random() < Math.max(0.08, 0.22 - 0.04 * (level - 1)) ? goodOp(expect) : badOp(expect, g);
        if (bothBad) g = badOp(expect, { op: "+", v: Math.max(2, Math.round(expect * 0.5)) });
        var flip = Math.random() < 0.5;
        segs.push({ type: "gate", z: zz, left: flip ? other : g, right: flip ? g : other, done: false, pick: 0, at: 0, id: ++uid });
        expect = Math.min(600, Math.max(apply(expect, g), apply(expect, other)));
      } else if (level >= 2 && i % 4 === 3) {
        segs.push({ type: "bar", z: zz, w: 1.7 + Math.min(1.5, level * 0.18), phase: Math.random() * 6.28, rate: 1.1 + level * 0.09, done: false, x: 0, id: ++uid });
      } else {
        var roll = Math.random();
        var span = roll < 0.5 || level === 1 ? [-FIELD, FIELD] : roll < 0.75 ? [-FIELD, 0.5] : [-0.5, FIELD];
        var full = span[0] === -FIELD && span[1] === FIELD;
        var hp = Math.max(2, Math.round(expect * (full ? A.rand(0.5, 1.35) : A.rand(1.6, 2.8)) * (0.85 + 0.05 * level) * tough));
        segs.push({ type: "rivals", z: zz, x0: span[0], x1: span[1], hp: hp, hp0: hp, full: full, done: false, hitAt: -9, hits: 0, id: ++uid });
        if (full) expect = Math.max(2, expect - Math.max(0, hp - 1.9 * expect));
      }
      // aralık: silah (bölüm sonundaki aralıkta her zaman; ilk aralıkta 1. bölümde her zaman)
      var last = i === count - 1;
      if (last || (i === 0 && level === 1) || Math.random() < 0.42) {
        var pt = pickPower(level, lastP, last);
        lastP = pt;
        pickups.push({ type: pt, x: A.pick([-2.7, 0, 2.7]), z: zz + SEG / 2, taken: false, gone: false, at: 0, id: ++uid });
      }
      zz += SEG;
    }
    var bhp = Math.round((expect * (2.1 + 0.3 * level) + 8) * (1 + 0.35 * Math.min(7, level - 1)));
    boss = { z: zz + 10, hp: bhp, hp0: bhp, next: 1.4, shot: null, k: 0, hitAt: -9, hits: 0, id: ++uid, men: [] };
    for (var w = 0; w < 5; w++) boss.men.push({ x: (w - 2) * 1.2, z: boss.z - 2.2, alive: true, hitAt: -9, dieAt: 0, dir: 1, look: w, pow: 1 });
    levelZ0 = from;
  }

  function resetRun() {
    z = 0;
    x = 0;
    target = 0;
    speed = 0;
    n = 1;
    maxN = 1;
    level = 1;
    points = 0;
    goals = 0;
    cleared = 0;
    expect = 1;
    fallen = [];
    shots = [];
    rolls = [];
    mem = [];
    memLook = 0;
    weapon = null;
    giant = 0;
    boostT = 0;
    picked = 0;
    impacts = lostTotal = fallenTotal = 0;
    lastTgt = null;
    buildLevel(0);
  }

  function start() {
    resetRun();
    state = "play";
    stateT = 0;
    A.particles.length = 0;
    A.floaters.length = 0;
    A.banner = null;
    A.sound("whistle");
    A.announce("KADRO KOŞUSU", "Kapılardan geç, silahları topla");
    theme = 0;
  }

  /* ─────────────────────────── kadro üyeleri ─────────────────────────── */

  function squadRadius(count) {
    return Math.min(3.3, 0.34 * Math.sqrt(Math.max(1, Math.min(count, VIS))) + 0.2);
  }
  /** i. yuvanın kadro merkezine göre yeri (ayçiçeği dizilimi). */
  function slot(i, count) {
    var vis = Math.min(count, VIS);
    var k = vis > 1 ? squadRadius(count) / Math.sqrt(vis) : 0;
    var r = k * Math.sqrt(i + 0.35), th = i * 2.39996;
    return { x: Math.cos(th) * r, z: Math.sin(th) * r * 0.9 };
  }
  function memX(m) {
    return A.clamp(x + m.ox, -FIELD + 0.3, FIELD - 0.3);
  }

  /** Düşen üye: kadrodan tam o anda çıkan kişi, kendi yerinden savrulur. */
  function spawnFall(px, pz, look, why, wx, real) {
    var dir = wx != null ? (px >= wx ? 1 : -1) : Math.random() < 0.5 ? -1 : 1;
    fallen.push({
      x: px, z: pz, at: A.time, look: look, dir: dir,
      vx: dir * A.rand(1.0, 2.4) * (why === "boss" ? 1.6 : 1),
      vz: why === "melee" ? -A.rand(0.5, 1.5) : A.rand(-1.0, 0.6),
      vy: why === "boss" ? A.rand(4.5, 6.5) : why === "gate" ? A.rand(1.5, 2.6) : A.rand(2.6, 4.2),
      gate: why === "gate",
    });
    if (real) fallenTotal += 1;
    if (fallen.length > 120) fallen.splice(0, fallen.length - 120);
  }

  /**
   * Kadro küçüldü: görünür üyeler bire bir eksilir. Hangileri gider:
   * temasta öndekiler, çubuk/sert şutta ona en yakın olanlar, kapıda dıştakiler.
   * Ekrandaki sınırın (70) üstündeki kayıplar için öndekilerden "hayalet" düşer.
   */
  function dropMembers(k, why, wx) {
    var keep = Math.min(n, VIS);
    var drop = Math.max(0, mem.length - keep);
    if (!mem.length) return;
    var order = [];
    for (var i = 0; i < mem.length; i++) order.push(i);
    order.sort(function (a, b) {
      var ma = mem[a], mb = mem[b];
      if (why === "melee") return mb.oz - ma.oz;
      if (wx != null) return Math.abs(memX(ma) - wx) - Math.abs(memX(mb) - wx);
      return b - a;
    });
    var gone = order.slice(0, drop);
    for (var g = 0; g < gone.length; g++) {
      var m = mem[gone[g]];
      spawnFall(memX(m), z + m.oz, m.look, why, wx, true);
    }
    var ghosts = Math.min(10, Math.max(0, k - drop));
    for (var h = 0; h < ghosts; h++) {
      var m2 = mem[order[(drop + h) % order.length]];
      spawnFall(memX(m2), z + m2.oz + 0.05, m2.look, why, wx, false);
    }
    gone.sort(function (a, b) {
      return b - a;
    });
    for (var q = 0; q < gone.length; q++) mem.splice(gone[q], 1);
  }

  /** Eksik üyeleri ekler (büyüme animasyonuyla), yerlerini yumuşakça günceller. */
  function syncMembers(dt) {
    var want = Math.min(n, VIS);
    if (mem.length > want) dropMembers(mem.length - want, "gate", null);
    var from = mem.length;
    while (mem.length < want) {
      var s = slot(mem.length, n);
      mem.push({ ox: s.x, oz: s.z, look: memLook++ % 6, born: A.time + (mem.length - from) * 0.012 });
    }
    var k = 1 - Math.exp(-7 * Math.min(dt, 0.1));
    for (var i = 0; i < mem.length; i++) {
      var sl = slot(i, n);
      mem[i].ox += (sl.x - mem[i].ox) * k;
      mem[i].oz += (sl.z - mem[i].oz) * k;
    }
  }

  function lose(k, why, wx) {
    if (k <= 0 || state !== "play") return;
    k = Math.min(n, Math.ceil(k));
    n -= k;
    lostTotal += k;
    lastWhy = why;
    dropMembers(k, why, wx);
    countBump = -1;
    if (why !== "melee" && k >= 2) floatAt("−" + k, x, 2.6 + squadRadius(n) * 0.25, z, BAD_A, 20);
    flashRed = Math.max(flashRed, why === "boss" ? 0.9 : why === "melee" ? 0.25 : 0.5);
    A.haptic(why === "boss" ? "error" : "warning");
    if (n <= 0) {
      n = 0;
      state = "dying";
      stateT = 0;
      A.sound("crash");
      A.shake(10);
    }
  }
  function gain(to) {
    var from = n;
    n = Math.max(0, Math.min(MAX_N, to));
    maxN = Math.max(maxN, n);
    if (n < from) {
      lostTotal += from - n;
      dropMembers(from - n, "gate", null);
    }
    syncMembers(0);
    countBump = n > from ? 1 : -1;
  }

  /* ─────────────────────────── rakip figürleri ─────────────────────────── */

  /** Grubun figürleri (her biri hp0/toplam can taşır); ölçü değişirse yeniden kurulur. */
  function menOf(s) {
    var key = s.x0 + "|" + s.x1 + "|" + s.hp0;
    if (s.men && (s.menKey === key || s.hits > 0)) return s.men;
    var w = s.x1 - s.x0;
    var rows = s.hp0 > 40 ? 3 : s.hp0 > 12 ? 2 : 1;
    var cols = Math.max(2, Math.min(Math.round(w / 1.05), Math.ceil(s.hp0 / rows)));
    s.men = [];
    s.menKey = key;
    for (var k = 0; k < cols * rows; k++) {
      s.men.push({
        x: s.x0 + ((k % cols) + 0.5) * (w / cols) + Math.sin(k * 7.3 + s.id) * 0.18,
        z: s.z + Math.floor(k / cols) * 0.95,
        alive: true, hitAt: -9, dieAt: 0, dir: 1, look: (k + s.id) % 5, ph: k * 0.23, pow: 1, cause: null,
      });
    }
    return s.men;
  }
  function aliveMen(men) {
    var c = 0;
    for (var i = 0; i < men.length; i++) if (men[i].alive) c++;
    return c;
  }
  function nearestMan(men, px, pz, zw, skip) {
    var best = null, bd = 1e9;
    for (var i = 0; i < men.length; i++) {
      var m = men[i];
      if (!m.alive || m === skip) continue;
      var d = Math.abs(m.x - px) + Math.abs(m.z - pz) * zw;
      if (d < bd) {
        bd = d;
        best = m;
      }
    }
    return best;
  }
  function killMan(m, ix, cause, pow) {
    m.alive = false;
    m.dieAt = A.time;
    m.cause = cause;
    m.dir = m.x > ix + 0.05 ? 1 : m.x < ix - 0.05 ? -1 : Math.random() < 0.5 ? -1 : 1;
    m.pow = pow || 1;
    fxMan(m, cause);
  }
  /**
   * Can düştü → figür sayısı (tavan(toplam × can/can0)) kadar figür kalır.
   * Önce topun değdiği figür, sonra değdiği yere en yakınlar düşer; ölüm yoksa
   * değen figür sarsılır (vuruş tepkisi).
   */
  function shrinkMen(G, men, ix, iz, hitMan, cause, pow) {
    var want = G.hp <= 0 ? 0 : Math.ceil((men.length * G.hp) / G.hp0 - 1e-9);
    var kills = aliveMen(men) - want, killed = 0;
    if (hitMan && hitMan.alive && kills > 0) {
      killMan(hitMan, ix, cause, pow);
      kills--;
      killed++;
    }
    while (kills > 0) {
      var m = nearestMan(men, ix, iz, cause === "melee" ? 3 : 1, null);
      if (!m) break;
      killMan(m, ix, cause, pow);
      kills--;
      killed++;
    }
    if (!killed && hitMan && hitMan.alive) {
      hitMan.hitAt = A.time;
      hitMan.dir = hitMan.x >= ix ? 1 : -1;
    }
    return killed;
  }
  function groupDown(s) {
    s.done = true;
    s.at = A.time;
    s.dead = true;
    if (state === "play") {
      cleared += 1;
      var gp = 10 * level;
      points += gp;
      scoreBump = 1;
      A.sound("gate");
      A.haptic("light");
      floatAt("+" + gp, (s.x0 + s.x1) / 2, 2.4, s.z, P.gold, 22);
    }
  }
  function keeperX(t) {
    return boss && boss.hp > 0 ? Math.sin(t * 1.7) * 1.6 : 0;
  }

  /* ─────────────────────────── şut: toplar ─────────────────────────── */

  function pickMan(men) {
    var front = 1e9, alive = [];
    for (var i = 0; i < men.length; i++) if (men[i].alive) front = Math.min(front, men[i].z);
    for (var j = 0; j < men.length; j++) if (men[j].alive && (Math.random() < 0.4 || men[j].z < front + 0.5)) alive.push(men[j]);
    return alive.length ? A.pick(alive) : null;
  }
  /** Bir top fırlat: hedef figür (ya da kaleci) seçilir; hasar ancak değince işler. */
  function launch(T, sx, sy, sz, dmg, kind, bounce, curve, from) {
    var man = null, keeper = false, tx, ty, tz;
    if (T === boss) {
      if (aliveMen(boss.men) && Math.random() < 0.45 && kind !== "giant") man = pickMan(boss.men);
      keeper = !man;
    } else {
      man = from ? nearestMan(T.men, from.x, from.z, 1, from) : kind === "giant" ? nearestMan(T.men, sx, T.z, 3, null) : pickMan(T.men);
      if (!man) return null;
    }
    tz = keeper ? boss.z + 0.4 : man.z;
    var dur = Math.max(0.1, Math.abs(tz - sz) / (kind === "giant" ? 21 : BALL_V) + (from ? 0.12 : 0));
    if (keeper) {
      tx = keeperX(A.time + dur) + A.rand(-0.5, 0.5);
      ty = kind === "giant" ? 0.6 : A.rand(1.2, 2.3);
    } else {
      tx = man.x + A.rand(-0.1, 0.1);
      ty = kind === "giant" ? 0.6 : 0.95;
    }
    var p = {
      id: ++uid, tgt: T, man: man, keeper: keeper, kind: kind, dmg: dmg, bounce: bounce || 0,
      x0: sx, y0: sy, z0: sz, tx: tx, ty: ty, tz: tz, t: 0, dur: dur,
      arc: kind === "giant" ? 0 : from ? 0.5 : keeper ? A.rand(1.0, 2.0) : kind === "fire" ? A.rand(0.3, 0.7) : A.rand(0.45, 1.2),
      curve: curve || 0, spin: Math.random() * 6,
    };
    shots.push(p);
    return p;
  }
  function kick(T, dmg) {
    var w = weapon ? weapon.type : null;
    var m = mem.length ? mem[(Math.random() * mem.length) | 0] : { ox: 0, oz: 0 };
    var sx = memX(m), sz = z + m.oz + 0.4;
    if (w === "triple") {
      for (var j = 0; j < 3; j++) launch(T, sx + (j - 1) * 0.25, 0.4, sz, dmg, "triple", 0, (j - 1) * 0.6);
    } else if (w === "fire") launch(T, sx, 0.4, sz, dmg * 2.6, "fire", 1, 0);
    else if (w === "curve") launch(T, sx, 0.4, sz, dmg * 1.15, "curve", 2, (sx > (T === boss ? 0 : (T.x0 + T.x1) / 2) ? 1 : -1) * A.rand(1.2, 2.2));
    else launch(T, sx, 0.4, sz, dmg, w === "sack" ? "sack" : "n", 0, 0);
    if (weapon) {
      weapon.ammo -= 1;
      if (weapon.ammo <= 0) {
        weapon = null;
        if (state === "play") floatAt("SİLAH BİTTİ", x, 2.8, z, "#E2E8F0", 15);
      }
    }
  }
  function launchGiant(T) {
    giant -= 1;
    var dmg = T === boss ? Math.max(25, n * 1.5) + boss.hp0 * 0.18 : Math.max(30, n * 2.5);
    launch(T, A.clamp(x, -FIELD + 0.6, FIELD - 0.6), 0.6, z + squadRadius(n) + 0.6, dmg, "giant", 0, 0);
    if (state === "play") {
      A.sound("kick");
      A.haptic("medium");
      floatAt("DEV TOP!", x, 2.8, z, POWERS.giant.col, 22);
    }
  }
  function fire(T, dt) {
    if (!T || n <= 0) {
      shotAcc = 1; // hedef gelince ilk top hemen çıkar
      lastTgt = null;
      return;
    }
    if (T !== lastTgt) {
      lastTgt = T;
      if (giant > 0) launchGiant(T);
    }
    var base = baseRate(n);
    var rate = base * (weapon && weapon.type === "sack" ? 2 : 1);
    shotAcc += dt * rate;
    while (shotAcc >= 1) {
      shotAcc -= 1;
      kick(T, (FIRE * n) / base);
    }
    shootSnd -= dt;
    if (state === "play" && shootSnd <= 0) {
      shootSnd = 0.12;
      A.sound("shoot");
    }
  }
  /** Top hedefe vardı: hasar, figür düşüşü / sarsılma, sekme. */
  function impact(p) {
    impacts += 1;
    var T = p.tgt;
    fxImpact(p);
    var pow = p.kind === "giant" ? 2.4 : p.kind === "fire" ? 1.6 : 1;
    if (T === boss) {
      if (T.hp <= 0) return;
      T.hp -= p.dmg;
      T.hits += 1;
      if (p.keeper) T.hitAt = A.time;
      shrinkMen(T, T.men, p.tx, T.z - 2.2, p.man, "ball", pow);
    } else {
      if (T.done) return; // eritildi ya da kaçıldı: top boşa düşer
      T.hp -= p.dmg;
      T.hitAt = A.time;
      T.hits += 1;
      shrinkMen(T, T.men, p.tx, p.tz, p.man, "ball", pow);
      if (T.hp <= 0) groupDown(T);
      if (p.kind === "giant") rolls.push({ x: p.tx, z: p.tz, at: A.time, spin: p.spin });
    }
    if (p.bounce > 0 && !(T !== boss && T.done) && p.man) {
      launch(T, p.tx, p.ty, p.tz, p.dmg * (p.kind === "fire" ? 0.6 : 0.8), p.kind, p.bounce - 1, 0, p.man);
    }
  }
  function stepShots(dt) {
    for (var q = shots.length - 1; q >= 0; q--) {
      var p = shots[q];
      p.t += dt / p.dur;
      if (p.t >= 1) {
        shots.splice(q, 1);
        impact(p);
      }
    }
  }

  /* ─────────────────────────── silah toplama ─────────────────────────── */
  function collectPower(p) {
    p.taken = true;
    p.at = A.time;
    var t = p.type, def = POWERS[t];
    if (t === "giant") giant = Math.min(3, giant + 1);
    else if (t === "boots") boostT = BOOST;
    else {
      var kps = baseRate(n) * (t === "sack" ? 2 : 1);
      var amt = A.clamp(Math.round(kps * def.secs), 14, 160);
      if (weapon && weapon.type === t) {
        weapon.ammo += amt;
        weapon.max = weapon.ammo;
      } else weapon = { type: t, ammo: amt, max: amt };
    }
    powerPop = 1;
    if (state === "play") {
      picked += 1;
      A.sound("power");
      A.haptic("medium");
      floatAt(def.name + "!", p.x, 2.6, p.z, def.col, 22);
      if (L.f && camInit) {
        proj(p.x, 1.2, p.z);
        A.burst(PX, PY, 16, { shape: "star", speed: 260, gravity: 120, life: 0.55, size: 6, color: [def.col, "#FFFFFF"] });
        A.ring(PX, PY, def.col, 70, 8);
      }
    }
  }

  /* ─────────────────────────── güncelleme ─────────────────────────── */

  function update(dt) {
    stateT += dt;
    scoreBump = Math.max(0, scoreBump - dt * 4);
    flashRed = Math.max(0, flashRed - dt * 2.4);
    countBump = A.damp(countBump, 0, 7, dt);
    powerPop = Math.max(0, powerPop - dt * 2.5);
    var playing = state === "play";
    var live = playing || state === "attract";

    /* Vitrin: kadro iyi kapıya yönelir, asla bitmez. */
    if (state === "attract") {
      var ng = null;
      for (var a = 0; a < segs.length; a++)
        if (!segs[a].done && segs[a].z > z) {
          ng = segs[a];
          break;
        }
      if (ng && ng.type === "gate") target = apply(n, ng.left) >= apply(n, ng.right) ? -FIELD / 2 : FIELD / 2;
      else if (ng && ng.type === "rivals" && !ng.full) target = ng.x0 === -FIELD ? FIELD * 0.65 : -FIELD * 0.65;
      else if (boss && boss.shot) target = boss.shot.x > 0 ? -2.4 : 2.4;
      if (n < 4) n = 4;
    }
    if (live) boostT = Math.max(0, boostT - dt);

    /* Yanal hareket */
    var lim = FIELD - 0.35;
    target = A.clamp(target, -lim, lim);
    x = A.damp(x, target, 15, dt);

    /* İleri hız: grupla temasta ve kale önünde durur */
    var want = state === "dying" || state === "over" ? 0 : levelSpeed() * (boostT > 0 ? 1.3 : 1);
    var blocked = false;
    var atBoss = boss && z >= boss.z - STOP;
    if (atBoss && state !== "goal") want = 0;

    /* Kapılar, gruplar, çubuklar */
    var tgt = null;
    for (var i = 0; i < segs.length; i++) {
      var s = segs[i];
      if (s.done) continue;
      var d = s.z - z;
      if (s.type === "gate") {
        if (d <= 0) {
          s.done = true;
          s.at = A.time;
          s.pick = x < 0 ? -1 : 1;
          var op = s.pick < 0 ? s.left : s.right;
          var before = n;
          if (live) {
            if (playing && apply(n, op) <= 0) lose(before, "gate");
            else gain(Math.max(state === "attract" ? 4 : 0, apply(n, op)));
            if (playing) {
              A.sound(isGood(op) ? "pop" : "bad");
              A.haptic(isGood(op) ? "light" : "warning");
            }
          }
        }
      } else if (s.type === "rivals") {
        if (d < -1.5) {
          s.done = true; // kaçıldı (figürler yerinde kalır, geride kaybolur)
          continue;
        }
        menOf(s);
        var inSpan = x > s.x0 - 0.7 && x < s.x1 + 0.7;
        if (!tgt && inSpan && d < RANGE && d > -1 && live) tgt = s;
        if (inSpan && d < 1.3 && s.hp > 0 && live) {
          // temas: bire bir takas (KRAMPON şarjında 1'e 3)
          blocked = true;
          var charge = boostT > 0 ? 3 : 1;
          var k = Math.min(Math.max(30, n * 1.6) * dt, s.hp, n * charge);
          s.hp -= k;
          shrinkMen(s, s.men, x, z, null, "melee", charge > 1 ? 1.8 : 1);
          s.melee = (s.melee || 0) + k / charge;
          if (s.melee >= 1) {
            var whole = Math.floor(s.melee);
            s.melee -= whole;
            if (playing) lose(whole, "melee");
            else n = Math.max(4, n - whole);
          }
          if (s.hp <= 0) groupDown(s);
        }
      } else if (s.type === "bar") {
        s.x = Math.sin(A.time * s.rate + s.phase) * (FIELD - s.w / 2 - 0.2);
        if (d <= 0) {
          s.done = true;
          var rad = squadRadius(n);
          var lo = Math.max(x - rad, s.x - s.w / 2), hi = Math.min(x + rad, s.x + s.w / 2);
          var frac = Math.max(0, hi - lo) / (2 * rad);
          if (playing) {
            if (frac > 0.02) {
              lose(Math.max(1, n * frac * 0.8), "bar", s.x);
              A.sound("thud");
              A.shake(5);
            } else {
              points += 5;
              scoreBump = 0.7;
              floatAt("TEMİZ +5", x, 2.2, z, "#7DD3FC", 18);
            }
          }
        }
      }
    }
    /* Silahlar: kadronun içinden geçtiği silah toplanır */
    for (var pi = 0; pi < pickups.length; pi++) {
      var pk = pickups[pi];
      if (pk.taken || pk.gone || z < pk.z) continue;
      if (live && n > 0 && Math.abs(pk.x - x) < 0.95 + squadRadius(n) * 0.75) collectPower(pk);
      else pk.gone = true;
    }
    if (blocked) want = 0;
    speed = A.approach(speed, want, (speed < want ? 14 : 40) * dt);
    if (state === "dying") {
      speed = 0;
      if (stateT > 1.3) {
        state = "over";
        A.sound("over");
        A.send("over", { score: points, stats: { level: level, goals: goals, squad: maxN, rivals: cleared, teams: rivals.length, weapons: picked } });
      }
    }
    z += speed * dt;

    /* Kale: kaleciye şut, kalecinin sert şutundan kaç */
    if (boss && atBoss && live) {
      z = Math.min(z, boss.z - STOP);
      if (boss.hp > 0) tgt = tgt || boss;
      boss.next -= dt;
      if (!boss.shot && boss.next <= 0 && boss.hp > 0) {
        boss.shot = { x: x, at: A.time, land: A.time + Math.max(0.75, 0.95 - 0.03 * (level - 1)) };
        boss.k += 1;
        if (playing) A.sound("whoosh");
      }
      if (boss.shot && A.time >= boss.shot.land) {
        var miss = Math.abs(x - boss.shot.x) > 1.55 + squadRadius(n) * 0.25;
        if (playing) {
          if (!miss) {
            lose(Math.ceil(n * (0.22 + 0.02 * Math.min(5, level - 1))) + level, "boss", boss.shot.x);
            A.sound("boom");
            A.shake(9);
          } else {
            floatAt("KAÇTIN!", x, 2.4, z, "#7DD3FC", 18);
            A.haptic("light");
          }
        }
        boss.landed = { x: boss.shot.x, at: A.time };
        boss.shot = null;
        boss.next = Math.max(0.8, 1.5 - 0.07 * level);
      }
    }

    /* Şut: toplar uçar, hasar yalnız değdiklerinde */
    fire(live ? tgt : null, dt);
    stepShots(dt);

    if (boss && boss.hp <= 0 && state === "play") {
      goals += 1;
      var bonus = 100 + 25 * level + Math.min(50, Math.floor(n / 4));
      points += bonus;
      scoreBump = 1;
      state = "goal";
      stateT = 0;
      boss.shot = null;
      boss.downAt = A.time;
      A.sound("cheer");
      A.sound("net");
      A.haptic("success");
      A.announce("GOOOL!", "+" + bonus + " puan · " + String(rivalAt(level).team.name || "Rakip") + " geçildi");
    } else if (boss && boss.hp <= 0 && state === "attract" && (boss.downAt == null || A.time - boss.downAt > 1.2)) {
      if (boss.downAt == null) boss.downAt = A.time;
      else {
        // vitrin: aynı bölüm baştan
        expect = Math.max(4, Math.round(n * 0.3));
        n = expect;
        buildLevel(boss.z + 6);
        speed = levelSpeed();
        shots = [];
      }
    }

    /* Gol sevinci → sıradaki bölüm */
    if (state === "goal" && stateT > 2.3) {
      level += 1;
      var keep = A.clamp(Math.round(n * 0.35), 3, 40);
      n = keep;
      expect = keep;
      if (mem.length > keep) mem.length = keep;
      buildLevel(boss.z + 8);
      z = levelZ0;
      state = "play";
      stateT = 0;
      shots = [];
      fallen = [];
      rolls = [];
      lastTgt = null;
      var rv = rivalAt(level);
      A.announce("BÖLÜM " + level, "Rakip: " + String(rv.team.name || "Rakip"));
      A.sound("level");
      theme = (level - 1) % THEMES.length;
    }

    syncMembers(dt);
    for (var f = fallen.length - 1; f >= 0; f--) if (A.time - fallen[f].at > 1.0) fallen.splice(f, 1);
    for (var r = rolls.length - 1; r >= 0; r--) if (A.time - rolls[r].at > 0.7) rolls.splice(r, 1);

    /* Temizlik: geride kalanlar */
    segs = segs.filter(function (s2) {
      return s2.z > z - 14;
    });
    pickups = pickups.filter(function (p2) {
      return p2.z > z - 14;
    });
  }

  /* ─────────────────────────── girdi ─────────────────────────── */

  function down(p) {
    lastTouchX = p.x;
  }
  function move(p) {
    if (state !== "play" || lastTouchX == null) return;
    var mpp = (FIELD * 2 + 2.4) / Math.max(1, W);
    target = A.clamp(target + (p.x - lastTouchX) * mpp * 1.25, -FIELD + 0.35, FIELD - 0.35);
    lastTouchX = p.x;
  }
  function up() {
    lastTouchX = null;
  }


  /* ═══════════════════════════ ÇİZİM (Canvas 2D · sözde 3B) ═══════════════════════════
   * Kamera kadronun arkasında, yatay bakar: dünya noktası (x, y, z) →
   *   ekran x = cx + (x − camX)·f/d,  ekran y = ufuk + (camH − y)·f/d,  d = z − camZ.
   * Kameraya bakan her şey (kapı, futbolcu, kale) bu yüzden yalnız ÖLÇEKLENMİŞ
   * düz bir çizimdir; zemin/tribün düzlemleri tek dörtgen olarak izdüşer.
   * Futbolcular Savunma Hattı ailesinden çizgi film karakterleri: kalın lacivert
   * kontur, iri kafa, forma rengi; her poz/kare bir kez ekran dışına çizilir.
   */

  var NAVY = "#1B1648"; // kontur
  var INK = "#141043";
  var GOOD_A = "#4FC3FF", GOOD_B = "#1E63FF", BAD_A = "#FF6B86", BAD_B = "#E3123F";

  function rgbOf(h) {
    var v = parseInt(h.slice(1), 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  }
  function mixc(a, b, t) {
    if (t <= 0) return a;
    if (t >= 1) return b;
    var p = rgbOf(a), q = rgbOf(b);
    var r = Math.round(p[0] + (q[0] - p[0]) * t), g = Math.round(p[1] + (q[1] - p[1]) * t), bl = Math.round(p[2] + (q[2] - p[2]) * t);
    return "#" + ((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1);
  }
  function rgba(h, a) {
    var p = rgbOf(h);
    return "rgba(" + p[0] + "," + p[1] + "," + p[2] + "," + a + ")";
  }
  function hex(c2, fb) {
    if (typeof c2 !== "string") return fb;
    if (/^#[0-9a-f]{6}$/i.test(c2)) return c2.toUpperCase();
    if (/^#[0-9a-f]{3}$/i.test(c2)) return ("#" + c2[1] + c2[1] + c2[2] + c2[2] + c2[3] + c2[3]).toUpperCase();
    return fb;
  }
  function dist2(a, b) {
    var p = rgbOf(a), q = rgbOf(b);
    return (p[0] - q[0]) * (p[0] - q[0]) + (p[1] - q[1]) * (p[1] - q[1]) + (p[2] - q[2]) * (p[2] - q[2]);
  }

  /* Gökyüzü temaları — hepsi doygun; soluk ton yok. */
  var THEMES = [
    { // alacakaranlık moru (Savunma Hattı ile aynı gece)
      sky: ["#15114A", "#2A1C6E", "#6A2C93"], glow: "#FF7AC8", moon: true,
      bld: [["#3A2A80", "#2C2068"], ["#4B3399", "#33267A"], ["#2E3A8F", "#232C70"]], lit: "#FFD98A",
      stand: ["#2B2275", "#352A8C"], base: "#1F185A", fog: "#5B2C8F",
      turf: ["#4CC552", "#5FD35F"], apron: "#2F9E45", led: ["#DB2777", "#7C3AED"],
    },
    { // gün batımı
      sky: ["#2A1B78", "#B4307E", "#FF8A3D"], glow: "#FFC15E", sun: true,
      bld: [["#5A2378", "#461A63"], ["#6B2A86", "#521F6A"], ["#40206E", "#311858"]], lit: "#FFE08A",
      stand: ["#3A1F73", "#4A2789"], base: "#2A165C", fog: "#B02A78",
      turf: ["#47C24F", "#5BD25C"], apron: "#2E9A44", led: ["#F97316", "#DB2777"],
    },
    { // lacivert gece, projektörler
      sky: ["#081453", "#1A3496", "#3F63E0"], glow: "#7DD3FC", moon: true,
      bld: [["#20307F", "#18256A"], ["#2A3C99", "#1E2D7E"], ["#1A2870", "#13205E"]], lit: "#FFE7A3",
      stand: ["#1C2A78", "#24358F"], base: "#141E5C", fog: "#3156C8",
      turf: ["#42BF4E", "#56CF5A"], apron: "#2A9542", led: ["#2563EB", "#9333EA"],
    },
  ];

  /* ─────────────────────────── yerleşim / kamera ─────────────────────────── */
  var CAMBACK = 9, CH0 = 6.4, NEAR = 2.2, FAR = 92;
  var PH = 1.6, UNIT = PH / 63; // futbolcu boyu (m) · çizim biriminin metresi
  var L = { hY: 0, f: 300, cx: 0, res: 1.5, wide: false, key: "" };
  var camX = 0, camZ = -CAMBACK, camH = CH0, camInit = false;
  L.ch = CH0;
  var shownPts = 0;

  function layout() {
    var key = W + "x" + H;
    if (L.key === key) return;
    L.key = key;
    L.wide = W > H * 1.15;
    L.hY = H * (L.wide ? 0.2 : 0.25);
    // genişlik: yol kadronun hizasında ekranı tam doldurur; yükseklik: kadro ekranın
    // ~%77'sinde durur — kamera yüksekliği buna göre seçilir (yatayda sınırlı).
    var want = H * (L.wide ? 0.8 : 0.77) - L.hY;
    L.f = (W * 0.97 * CAMBACK) / (2 * FIELD);
    if (L.wide) L.f = Math.min(L.f, H * 0.95); // yatay: kadro dev görünmesin, şehir görünsün
    L.ch = (want * CAMBACK) / L.f;
    if (L.ch < 4.4 || L.ch > 8.6) {
      L.ch = A.clamp(L.ch, 4.4, 8.6);
      L.f = (want * CAMBACK) / L.ch;
    }
    L.cx = W / 2;
    var dpr = A.dpr || 1;
    var kSquad = (L.f / (CAMBACK - 2)) * UNIT;
    var res = A.clamp(kSquad * 1.15, 0.8, 3) * dpr;
    if (Math.abs(res - L.res) > 0.05) {
      L.res = res;
      sprites = {};
    }
    sky = null;
  }

  var PX = 0, PY = 0, PK = 0, PD = 1;
  function proj(wx, wy, wz) {
    var d = wz - camZ;
    if (d < 0.6) d = 0.6;
    PD = d;
    PK = L.f / d;
    PX = L.cx + (wx - camX) * PK;
    PY = L.hY + (camH - wy) * PK;
  }
  function moveP(c, wx, wy, wz) {
    proj(wx, wy, wz);
    c.moveTo(PX, PY);
  }
  function lineP(c, wx, wy, wz) {
    proj(wx, wy, wz);
    c.lineTo(PX, PY);
  }
  /** Dünya dörtgeni (yatay ya da düşey), tek yol. */
  function quad(c, x1, y1, z1, x2, y2, z2, x3, y3, z3, x4, y4, z4) {
    c.beginPath();
    moveP(c, x1, y1, z1);
    lineP(c, x2, y2, z2);
    lineP(c, x3, y3, z3);
    lineP(c, x4, y4, z4);
    c.closePath();
  }

  function updateCam(dt) {
    var atBoss = boss && z >= boss.z - STOP - 6;
    var wantX = x * 0.5, wantZ = z - (atBoss ? 10.5 : CAMBACK), wantH = (L.ch || CH0) + (atBoss ? 0.5 : 0);
    if (!camInit || Math.abs(camZ - wantZ) > 14) {
      camX = wantX;
      camZ = wantZ;
      camH = wantH;
      camInit = true;
    } else {
      var k = 1 - Math.exp(-8 * Math.min(dt, 0.1));
      camX += (wantX - camX) * k;
      camZ += (wantZ - camZ) * k;
      camH += (wantH - camH) * (1 - Math.exp(-3 * Math.min(dt, 0.1)));
    }
  }

  /* ─────────────────────────── gökyüzü katmanı ─────────────────────────── */
  var sky = null;
  function paintSky() {
    var th = THEMES[theme % THEMES.length];
    var key = theme + ":" + W + "x" + H;
    if (sky && sky.key === key) return sky;
    var pad = 40;
    var sw = W + pad * 2, sh = Math.ceil(L.hY + 4);
    sky = A.layer(sw, sh);
    sky.key = key;
    sky.pad = pad;
    var c = sky.ctx;
    var rnd = A.seeded(77 + theme);
    var g = c.createLinearGradient(0, 0, 0, sh);
    g.addColorStop(0, th.sky[0]);
    g.addColorStop(0.55, th.sky[1]);
    g.addColorStop(1, th.sky[2]);
    c.fillStyle = g;
    c.fillRect(0, 0, sw, sh);
    // yıldızlar
    c.fillStyle = "#FFFFFF";
    for (var i = 0; i < (th.sun ? 10 : 30); i++) {
      c.globalAlpha = 0.35 + rnd() * 0.55;
      c.beginPath();
      c.arc(rnd() * sw, rnd() * sh * 0.55, rnd() < 0.2 ? 1.8 : 1.1, 0, Math.PI * 2);
      c.fill();
    }
    c.globalAlpha = 1;
    var base = sh - 2;
    // ay / güneş
    var mr = A.clamp(Math.min(W, sh) * 0.22, 18, 70), mx = sw * 0.72, my = base - sh * 0.5;
    var mg = c.createRadialGradient(mx, my, mr * 0.7, mx, my, mr * 2.4);
    mg.addColorStop(0, th.sun ? "rgba(255,200,120,0.55)" : "rgba(255,225,150,0.3)");
    mg.addColorStop(1, "rgba(255,225,150,0)");
    c.fillStyle = mg;
    c.fillRect(mx - mr * 2.5, my - mr * 2.5, mr * 5, mr * 5);
    if (th.sun) {
      my = base - sh * 0.42;
      var sg = c.createLinearGradient(0, my - mr, 0, my + mr);
      sg.addColorStop(0, "#FFE38A");
      sg.addColorStop(1, "#FF8A3D");
      c.fillStyle = sg;
      c.beginPath();
      c.arc(mx, my, mr * 1.15, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = rgba(th.sky[1], 0.55);
      for (var b = 0; b < 4; b++) c.fillRect(mx - mr * 1.3, my + mr * (0.05 + b * 0.24), mr * 2.6, mr * 0.08 + b * 1.2);
    } else {
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
    }
    // ufuk ışıltısı
    var hg = c.createLinearGradient(0, base - sh * 0.35, 0, base);
    hg.addColorStop(0, rgba(th.glow, 0));
    hg.addColorStop(1, rgba(th.glow, 0.35));
    c.fillStyle = hg;
    c.fillRect(0, base - sh * 0.35, sw, sh * 0.35);
    // şehir: üç kat bina, yanan pencereler
    function buildings(col, cap, hMin, hMax, wMin, wMax, lit, seed) {
      var r2 = A.seeded(seed);
      var bx = -r2() * 30;
      while (bx < sw) {
        var bw = wMin + r2() * (wMax - wMin);
        var bh = Math.min(base - 8, (hMin + r2() * (hMax - hMin)) * Math.max(70, sh));
        var by = base - bh;
        c.fillStyle = col;
        c.fillRect(bx, by, bw, bh + 4);
        c.fillStyle = cap;
        c.fillRect(bx - 3, by - 5, bw + 6, 7);
        c.fillStyle = rgba(NAVY, 0.25);
        c.fillRect(bx + bw * 0.88, by, bw * 0.12, bh);
        var ww = Math.max(4, bw * 0.14), wh = ww * 1.25, gx = ww * 0.9, gy = wh * 0.75;
        for (var wy = by + 9; wy < base - wh - 3; wy += wh + gy)
          for (var wx = bx + ww * 0.8; wx < bx + bw - ww * 1.6; wx += ww + gx) {
            c.fillStyle = r2() < lit ? th.lit : rgba(NAVY, 0.42);
            A.roundRect(c, wx, wy, ww, wh, 1.5);
            c.fill();
          }
        bx += bw + 4 + r2() * 14;
      }
    }
    if (sh > 40) {
      buildings(th.bld[0][0], th.bld[0][1], 0.5, 0.9, 40, 74, 0.25, 7 + theme);
      buildings(th.bld[1][0], th.bld[1][1], 0.3, 0.62, 36, 64, 0.45, 19 + theme);
      buildings(th.bld[2][0], th.bld[2][1], 0.15, 0.38, 46, 84, 0.5, 31 + theme);
    }
    // projektör kuleleri
    [sw * 0.1, sw * 0.9].forEach(function (px) {
      var py = Math.max(14, base - sh * 0.82);
      c.fillStyle = "#1C1650";
      c.fillRect(px - 2.5, py, 5, base - py);
      var lg = c.createRadialGradient(px, py, 2, px, py, 70);
      lg.addColorStop(0, "rgba(255,250,220,0.6)");
      lg.addColorStop(1, "rgba(255,250,220,0)");
      c.fillStyle = lg;
      c.fillRect(px - 70, py - 70, 140, 140);
      c.fillStyle = "#2B2268";
      A.roundRect(c, px - 15, py - 9, 30, 17, 4);
      c.fill();
      c.fillStyle = "#FFF6D0";
      for (var li = 0; li < 3; li++) {
        c.beginPath();
        c.arc(px - 8.5 + li * 8.5, py - 0.5, 3.2, 0, Math.PI * 2);
        c.fill();
      }
    });
    return sky;
  }

  /* ─────────────────────────── zemin, tribün, panolar ─────────────────────────── */
  var ROWS = 7, SIN = FIELD + 1.7, SOUT = FIELD + 16, SY0 = 1.0, SY1 = 8.6;
  function drawGround(c, th) {
    var z0 = camZ + NEAR, z1 = camZ + FAR;
    c.fillStyle = th.base;
    c.fillRect(0, L.hY - 1, W, H - L.hY + 1);
    var mine = kitOf(captain), rk = kitOf(rivalAt(level));
    // karşı tribün (uzak duvar)
    var r, side;
    for (r = 0; r < ROWS; r++) {
      var ya = SY0 + ((SY1 - SY0) * r) / ROWS, yb = SY0 + ((SY1 - SY0) * (r + 1)) / ROWS;
      c.fillStyle = r % 2 ? th.stand[0] : th.stand[1];
      quad(c, -SOUT, ya, z1, SOUT, ya, z1, SOUT, yb, z1, -SOUT, yb, z1);
      c.fill();
    }
    // yan tribünler: basamak bantları
    for (side = -1; side <= 1; side += 2) {
      for (r = 0; r < ROWS; r++) {
        var t0 = r / ROWS, t1 = (r + 1) / ROWS;
        var xa = side * (SIN + (SOUT - SIN) * t0), xb = side * (SIN + (SOUT - SIN) * t1);
        var y0 = SY0 + (SY1 - SY0) * t0, y1 = SY0 + (SY1 - SY0) * t1;
        c.fillStyle = r % 2 ? th.stand[0] : th.stand[1];
        quad(c, xa, y0, z0, xa, y0, z1, xb, y1, z1, xb, y1, z0);
        c.fill();
      }
      // çatı saçağı (koyu, alt kenarında ışık şeridi)
      c.fillStyle = INK;
      quad(c, side * SOUT, SY1, z0, side * SOUT, SY1, z1, side * (SOUT - 4), SY1 + 2.4, z1, side * (SOUT - 4), SY1 + 2.4, z0);
      c.fill();
      c.fillStyle = "rgba(255,246,208,0.85)";
      quad(c, side * (SOUT - 3.6), SY1 + 2.1, z0, side * (SOUT - 3.6), SY1 + 2.1, z1, side * (SOUT - 4), SY1 + 2.4, z1, side * (SOUT - 4), SY1 + 2.4, z0);
      c.fill();
      // tribün önü duvarı + takım renginde şerit
      c.fillStyle = th.base;
      quad(c, side * SIN, 0, z0, side * SIN, 0, z1, side * SIN, SY0, z1, side * SIN, SY0, z0);
      c.fill();
      c.fillStyle = side < 0 ? mine.primary : rk.primary;
      quad(c, side * SIN, SY0 * 0.55, z0, side * SIN, SY0 * 0.55, z1, side * SIN, SY0 * 0.8, z1, side * SIN, SY0 * 0.8, z0);
      c.fill();
    }
    // taraftarlar: dünya z'sine kilitli kafalar (renk başına tek yol)
    var cols = [mine.primary, mine.secondary, rk.primary, rk.secondary];
    var paths = [[], [], [], []];
    var hop = state === "goal" ? 1 : 0;
    var zs = Math.ceil((camZ + 7) / 1.25) * 1.25, ze = camZ + Math.min(46, FAR);
    for (side = -1; side <= 1; side += 2)
      for (r = 0; r < ROWS; r++) {
        var tt = (r + 0.5) / ROWS;
        var hx = side * (SIN + (SOUT - SIN) * tt), hy = SY0 + (SY1 - SY0) * tt + 0.32;
        for (var zz = zs; zz < ze; zz += 1.25) {
          var hsh = Math.abs(Math.sin(zz * 12.9898 + r * 78.233 + side * 3.1) * 43758.5453) % 1;
          if (hsh < 0.12) continue;
          var ci = (side < 0 ? 0 : 2) + (hsh < 0.42 ? 1 : 0);
          var jump = hop ? Math.max(0, Math.sin(A.time * 9 + hsh * 20)) * 0.4 : 0;
          proj(hx + (hsh - 0.5) * 0.5, hy + jump, zz);
          paths[ci].push(PX, PY, A.clamp(0.27 * PK, 0.8, 7.5));
        }
      }
    for (var pi = 0; pi < 4; pi++) {
      var pl = paths[pi];
      if (!pl.length) continue;
      c.beginPath();
      for (var q = 0; q < pl.length; q += 3) {
        c.moveTo(pl[q] + pl[q + 2], pl[q + 1]);
        c.arc(pl[q], pl[q + 1], pl[q + 2], 0, Math.PI * 2);
      }
      c.fillStyle = cols[pi];
      c.fill();
    }
    // kenar çimi
    c.fillStyle = th.apron;
    quad(c, -SIN, 0, z0, SIN, 0, z0, SIN, 0, z1, -SIN, 0, z1);
    c.fill();
    // koşu yolu: biçilmiş çim bantları
    var STRIPE = 4;
    var s0 = Math.floor(z0 / STRIPE) * STRIPE;
    for (var sz = s0; sz < z1; sz += STRIPE) {
      var a0 = Math.max(z0, sz), a1 = Math.min(z1, sz + STRIPE);
      c.fillStyle = Math.round(sz / STRIPE) % 2 ? th.turf[0] : th.turf[1];
      quad(c, -FIELD, 0, a0, FIELD, 0, a0, FIELD, 0, a1, -FIELD, 0, a1);
      c.fill();
    }
    // orta çizgi (soluk) + tebeşir kenarlar
    c.fillStyle = "rgba(255,255,255,0.18)";
    quad(c, -0.06, 0, z0, 0.06, 0, z0, 0.06, 0, z1, -0.06, 0, z1);
    c.fill();
    c.fillStyle = "#FFFFFF";
    for (side = -1; side <= 1; side += 2) {
      quad(c, side * (FIELD - 0.16), 0, z0, side * (FIELD + 0.02), 0, z0, side * (FIELD + 0.02), 0, z1, side * (FIELD - 0.16), 0, z1);
      c.fill();
    }
    // LED panolar (yol kenarında, içe bakan yüzler)
    var BX = FIELD + 0.85, BH = 0.85, SEGL = 7;
    var b0 = Math.floor(z0 / SEGL) * SEGL;
    for (side = -1; side <= 1; side += 2) {
      for (var bz = b0; bz < z1; bz += SEGL) {
        var c0 = Math.max(z0, bz), c1 = Math.min(z1, bz + SEGL - 0.15);
        if (c1 <= c0) continue;
        var idx = Math.round(bz / SEGL) + (side > 0 ? 1 : 0);
        c.fillStyle = idx % 2 ? th.led[0] : th.led[1];
        quad(c, side * BX, 0.05, c0, side * BX, 0.05, c1, side * BX, BH, c1, side * BX, BH, c0);
        c.fill();
        c.fillStyle = "rgba(255,255,255,0.35)";
        quad(c, side * BX, BH * 0.62, c0, side * BX, BH * 0.62, c1, side * BX, BH * 0.72, c1, side * BX, BH * 0.72, c0);
        c.fill();
        c.fillStyle = NAVY;
        quad(c, side * BX, BH, c0, side * BX, BH, c1, side * BX, BH + 0.1, c1, side * BX, BH + 0.1, c0);
        c.fill();
      }
    }
    // kale ağzı çizgileri
    if (boss) {
      var gz = boss.z + 1.2;
      c.fillStyle = "rgba(255,255,255,0.92)";
      if (gz > z0 && gz < z1) {
        quad(c, -FIELD, 0, gz - 0.08, FIELD, 0, gz - 0.08, FIELD, 0, gz + 0.08, -FIELD, 0, gz + 0.08);
        c.fill();
      }
      var bzF = gz - 6.5;
      if (bzF > z0 && bzF < z1) {
        quad(c, -3.6, 0, bzF - 0.07, 3.6, 0, bzF - 0.07, 3.6, 0, bzF + 0.07, -3.6, 0, bzF + 0.07);
        c.fill();
        for (side = -1; side <= 1; side += 2) {
          quad(c, side * 3.6 - 0.07, 0, bzF, side * 3.6 + 0.07, 0, bzF, side * 3.6 + 0.07, 0, gz, side * 3.6 - 0.07, 0, gz);
          c.fill();
        }
      }
      // ceza yayı (durma çizgisi)
      var sc = gz - 1.2 - STOP + 4;
      if (sc - 4 > z0) {
        c.strokeStyle = "rgba(255,255,255,0.9)";
        c.lineWidth = Math.max(1.5, 0.12 * (L.f / Math.max(1, sc - 4 - camZ)));
        c.beginPath();
        for (var ai = 0; ai <= 24; ai++) {
          var an = Math.PI + (ai / 24) * Math.PI;
          var px = Math.cos(an) * 4, pz = sc + Math.sin(an) * 4;
          if (ai === 0) moveP(c, px, 0, pz);
          else lineP(c, px, 0, pz);
        }
        c.stroke();
      }
    }
  }

  /* ─────────────────────────── futbolcu çizimi ─────────────────────────── */
  var SKINS = ["#F6C9A4", "#E9B08A", "#C98D63", "#8E5B3C", "#F3D3B8"];
  var HAIRS = ["#2B1B12", "#5A3418", "#141414", "#8A5426", "#E2B04A"];
  var NUMS = [10, 7, 9, 11, 8, 4];
  var LW = 2.4;

  function limb(c, x1, y1, x2, y2, w, col) {
    c.strokeStyle = NAVY;
    c.lineWidth = w + LW * 2;
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
  function blob(c, bx, by, r, fill, lw) {
    c.beginPath();
    c.arc(bx, by, r, 0, Math.PI * 2);
    c.fillStyle = fill;
    c.fill();
    if (lw) {
      c.lineWidth = lw;
      c.strokeStyle = NAVY;
      c.stroke();
    }
  }

  /**
   * Önden ya da arkadan tıknaz futbolcu; ayaklar (0,0)'da, boy ~63 birim.
   * o: view "back"|"front", pose, ph (0..1 döngü), kit{p,s,sh,so}, look, num, gloves.
   */
  function drawFig(c, o) {
    var front = o.view === "front", kit = o.kit, pose = o.pose, ph = o.ph || 0;
    var TAU = Math.PI * 2, s = Math.sin(ph * TAU);
    var skin = SKINS[o.look % SKINS.length], hair = HAIRS[(o.look * 3 + 1) % HAIRS.length];
    var bob = 0, air = 0, lf = 0, rf = 0, spread = 4.4, crouch = 0, lean = 0;
    var lh = [-12.5, -24], rh = [12.5, -24];
    if (pose === "run") {
      bob = -Math.abs(s) * 2.2;
      lf = Math.max(0, s) * 7;
      rf = Math.max(0, -s) * 7;
      lh = [-12.5, -25 - s * 6];
      rh = [12.5, -25 + s * 6];
      lean = s * 0.04;
    } else if (pose === "kick") {
      var sw = ph < 0.4 ? -ph / 0.4 : ph < 0.62 ? -1 + (2 * (ph - 0.4)) / 0.22 : 1 - (ph - 0.62) / 0.38;
      rf = 3 + Math.max(0, sw) * 9 + Math.max(0, -sw) * 4;
      lh = [-16, -31];
      rh = [15, -27 + sw * 3];
      lean = -sw * 0.07;
      bob = -1;
    } else if (pose === "cheer") {
      air = -Math.abs(Math.sin(ph * Math.PI)) * 8;
      lh = [-15, -60];
      rh = [15, -60];
      spread = 5.5;
    } else if (pose === "ready") {
      spread = 6.5;
      crouch = 2.5;
      bob = Math.sin(ph * TAU) * 0.9;
      lh = [-15.5, -22 + bob];
      rh = [15.5, -22 + bob];
    } else if (pose === "keeper") {
      spread = 8.5;
      crouch = 4;
      var k2 = Math.sin(ph * TAU);
      lean = k2 * 0.07;
      lh = [-19, -50 + k2 * 3];
      rh = [19, -50 - k2 * 3];
    } else if (pose === "block") {
      spread = 3.6;
      bob = Math.sin(ph * TAU) * 0.5;
      lh = [-3.5, -20];
      rh = [3.5, -20];
    } else if (pose === "fall") {
      spread = 6;
      lh = [-17, -42];
      rh = [17, -42];
    }
    c.save();
    c.translate(0, air);
    c.lineJoin = "round";
    c.lineCap = "round";
    var hipY = -18 + crouch + bob;
    var sock = kit.so, boots = NAVY;
    function leg(sx2, lift) {
      var fx = sx2 * spread, fy = -lift;
      limb(c, sx2 * 3.2, hipY, fx, fy - 1, 7, sock);
      c.beginPath();
      c.ellipse(fx + sx2 * 0.6, fy - 0.6, 4.6, lift > 2 && !front ? 4.2 : 3.4, 0, 0, Math.PI * 2);
      c.fillStyle = boots;
      c.fill();
      if (lift > 2 && !front) {
        // arkadan kalkan ayak: krampon tabanı görünür
        c.fillStyle = "#E2E8F0";
        c.beginPath();
        c.ellipse(fx + sx2 * 0.6, fy - 0.2, 2.8, 2.4, 0, 0, Math.PI * 2);
        c.fill();
      } else {
        c.fillStyle = "rgba(255,255,255,0.35)";
        c.beginPath();
        c.ellipse(fx + sx2 * 0.6 - 1.2, fy - 1.8, 1.6, 0.9, 0, 0, Math.PI * 2);
        c.fill();
      }
      c.lineWidth = LW * 0.8;
      c.strokeStyle = NAVY;
      c.beginPath();
      c.ellipse(fx + sx2 * 0.6, fy - 0.6, 4.6, lift > 2 && !front ? 4.2 : 3.4, 0, 0, Math.PI * 2);
      c.stroke();
    }
    // arkadaki (kalkık) bacak önce
    if (lf > rf) {
      leg(-1, lf);
      leg(1, rf);
    } else {
      leg(1, rf);
      leg(-1, lf);
    }
    c.save();
    c.translate(0, hipY);
    c.rotate(lean);
    // şort
    A.roundRect(c, -10.5, -4, 21, 9.5, 3.5);
    c.fillStyle = kit.sh;
    c.fill();
    c.lineWidth = LW;
    c.strokeStyle = NAVY;
    c.stroke();
    var shY = -18;
    function arm(hand, back) {
      var sx3 = hand[0] < 0 ? -9 : 9;
      var ax = hand[0], ay = hand[1] - hipY;
      var mx = sx3 + (ax - sx3) * 0.42, my = shY + (ay - shY) * 0.42;
      limb(c, sx3, shY, ax, ay, 5.2, back ? mixc(skin, NAVY, 0.15) : skin);
      limb(c, sx3, shY, mx, my, 8, kit.p);
      if (o.gloves) blob(c, ax, ay, 5.2, o.gloves, LW);
      else blob(c, ax, ay, 3.4, skin, LW * 0.85);
    }
    var armsBehind = pose !== "block";
    if (armsBehind && !front) {
      // arkadan: kollar gövdenin yanında, gövdeden önce çizilir (omuz konturu gizlenir)
    }
    // gövde
    A.roundRect(c, -11, -22, 22, 20, 7.5);
    c.fillStyle = kit.p;
    c.fill();
    c.save();
    c.clip();
    c.fillStyle = kit.s;
    if (front) {
      c.fillRect(-1.9, -23, 3.8, 22);
      c.beginPath();
      c.moveTo(-5, -22);
      c.lineTo(0, -17);
      c.lineTo(5, -22);
      c.closePath();
      c.fill();
    } else {
      c.beginPath();
      c.ellipse(0, -22, 5.5, 2.6, 0, 0, Math.PI * 2);
      c.fill();
      c.font = "900 12px " + A.FONT;
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.lineJoin = "round";
      c.lineWidth = 2.6;
      c.strokeStyle = NAVY;
      c.strokeText(String(o.num || 10), 0, -10.5);
      c.fillText(String(o.num || 10), 0, -10.5);
    }
    c.fillStyle = "rgba(255,255,255,0.28)";
    A.roundRect(c, -8.5, -19.5, 4.5, 9, 2.2);
    c.fill();
    c.fillStyle = "rgba(20,16,67,0.2)";
    c.fillRect(-11, -6.5, 22, 5);
    c.restore();
    A.roundRect(c, -11, -22, 22, 20, 7.5);
    c.lineWidth = LW;
    c.strokeStyle = NAVY;
    c.stroke();
    arm(lh, false);
    arm(rh, false);
    // kafa (iri)
    var hx = 0, hy = -34.5, hr = 12.8;
    blob(c, hx - 12, hy + 1.5, 3.3, skin, LW * 0.85);
    blob(c, hx + 12, hy + 1.5, 3.3, skin, LW * 0.85);
    blob(c, hx, hy, hr, skin, 0);
    c.save();
    c.beginPath();
    c.arc(hx, hy, hr, 0, Math.PI * 2);
    c.clip();
    c.fillStyle = hair;
    if (front) {
      c.beginPath();
      c.ellipse(hx, hy - 9.5, hr * 1.12, hr * 0.62, 0, 0, Math.PI * 2);
      c.fill();
      c.beginPath();
      c.ellipse(hx - 4, hy - 5.5, 5, 3, -0.4, 0, Math.PI * 2);
      c.fill();
    } else {
      c.beginPath();
      c.ellipse(hx, hy - 2.5, hr * 1.1, hr * 0.98, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = "rgba(255,255,255,0.16)";
      c.beginPath();
      c.ellipse(hx - 4, hy - 7, 4.5, 2.6, -0.5, 0, Math.PI * 2);
      c.fill();
    }
    if (o.band) {
      c.fillStyle = o.band;
      c.fillRect(hx - hr, hy - 4.5, hr * 2, 3.4);
    }
    c.restore();
    c.beginPath();
    c.arc(hx, hy, hr, 0, Math.PI * 2);
    c.lineWidth = LW;
    c.strokeStyle = NAVY;
    c.stroke();
    if (front) {
      if (pose === "fall") {
        c.lineWidth = 1.8;
        [-4.6, 4.6].forEach(function (ex) {
          c.beginPath();
          c.moveTo(hx + ex - 2, hy - 1.5);
          c.lineTo(hx + ex + 2, hy + 2);
          c.moveTo(hx + ex + 2, hy - 1.5);
          c.lineTo(hx + ex - 2, hy + 2);
          c.stroke();
        });
      } else {
        [-4.6, 4.6].forEach(function (ex) {
          c.fillStyle = NAVY;
          c.beginPath();
          c.ellipse(hx + ex, hy + 0.3, 1.9, 2.7, 0, 0, Math.PI * 2);
          c.fill();
          c.fillStyle = "#FFFFFF";
          c.beginPath();
          c.arc(hx + ex + 0.6, hy - 0.7, 0.8, 0, Math.PI * 2);
          c.fill();
        });
        if (o.brow) {
          c.strokeStyle = NAVY;
          c.lineWidth = 1.8;
          c.beginPath();
          c.moveTo(hx - 7.5, hy - 5.2);
          c.lineTo(hx - 2.5, hy - 3.6);
          c.moveTo(hx + 7.5, hy - 5.2);
          c.lineTo(hx + 2.5, hy - 3.6);
          c.stroke();
        }
      }
      c.fillStyle = "rgba(255,90,110,0.35)";
      c.beginPath();
      c.arc(hx - 7.5, hy + 4.6, 2.3, 0, Math.PI * 2);
      c.arc(hx + 7.5, hy + 4.6, 2.3, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = NAVY;
      c.lineWidth = 1.6;
      c.beginPath();
      if (o.brow) {
        c.moveTo(hx - 2.5, hy + 6.5);
        c.lineTo(hx + 2.5, hy + 6.5);
      } else c.arc(hx, hy + 4.6, 2.4, 0.25, Math.PI - 0.25);
      c.stroke();
    }
    c.restore();
    c.restore();
  }

  /* Poz kareleri: bir kez ekran dışına çizilir, sonra yalnız kopyalanır. */
  var sprites = {};
  var SW = 74, SH = 94, OX = 37, OY = 86;
  var kits = { m: null, f: null, k: null, sig: "" };
  var POSE_FRAMES = { run: 10, kick: 6, cheer: 6, ready: 4, keeper: 6, block: 2, fall: 1 };
  function sprite(team, pose, frame, look, big) {
    var key = team + pose + frame + "_" + look + (big ? "B" : "");
    var sp = sprites[key];
    if (sp) return sp;
    var res = L.res * (big ? 1.9 : 1);
    var cv = document.createElement("canvas");
    cv.width = Math.ceil(SW * res);
    cv.height = Math.ceil(SH * res);
    var c = cv.getContext("2d");
    if (c && c.setTransform) {
      c.setTransform(res, 0, 0, res, 0, 0);
      c.translate(OX, OY);
      var kit = kits[team];
      drawFig(c, {
        view: team === "m" ? "back" : "front",
        pose: pose,
        ph: frame / (POSE_FRAMES[pose] || 1),
        kit: kit,
        look: look,
        num: NUMS[look % NUMS.length],
        gloves: team === "k" ? kit.glove : null,
        brow: team !== "m" && look % 2 === 0,
        band: team === "m" && look === 0 ? "#FFD400" : null,
      });
    }
    sprites[key] = cv;
    return cv;
  }
  function frameOf(pose, ph) {
    var nF = POSE_FRAMES[pose] || 1;
    var f = Math.floor((((ph % 1) + 1) % 1) * nF);
    return f >= nF ? 0 : f;
  }
  /** Futbolcuyu ayak noktasından çizer (k: ekran pikseli / çizim birimi). */
  function blitFig(c, cv, sx, sy, k, rot, alpha, flash) {
    var w = SW * k, h = SH * k;
    if (alpha < 1) c.globalAlpha = Math.max(0, alpha);
    if (rot) {
      c.save();
      c.translate(sx, sy);
      c.rotate(rot);
      c.drawImage(cv, -OX * k, -OY * k, w, h);
      c.restore();
    } else c.drawImage(cv, sx - OX * k, sy - OY * k, w, h);
    if (flash > 0.02) {
      c.save();
      c.globalCompositeOperation = "lighter";
      c.globalAlpha = Math.min(1, flash) * (alpha < 1 ? alpha : 1);
      if (rot) {
        c.translate(sx, sy);
        c.rotate(rot);
        c.drawImage(cv, -OX * k, -OY * k, w, h);
      } else c.drawImage(cv, sx - OX * k, sy - OY * k, w, h);
      c.restore();
    }
    c.globalAlpha = 1;
  }
  /** Yer gölgesi: ortak yola eklenir; bütün gölgeler tek seferde doldurulur. */
  function shadow(c, sx, sy, rx) {
    var ry = rx * A.clamp(camH / PD, 0.22, 0.6);
    c.moveTo(sx + rx, sy);
    c.ellipse(sx, sy, rx, ry, 0, 0, Math.PI * 2);
  }
  function drawShadows(c) {
    c.beginPath();
    for (var i = 0; i < items.length; i++) {
      var it = items[i], o = it.a;
      if (it.d > camZ + FAR - 16) continue;
      var r = 0;
      if (it.kind === "mine") r = 12 * UNIT * o.s;
      else if (it.kind === "foe") r = 12 * UNIT;
      else if (it.kind === "keeper") r = 13 * UNIT * 1.8;
      else if (it.kind === "bigBall") r = 0.45;
      else if (it.kind === "mineFall" || it.kind === "foeFall") r = 10 * UNIT * Math.max(0, 1 - o.t);
      else if (it.kind === "ball") {
        var bp = shotPos(o.s, o.u);
        r = o.s.kind === "giant" ? 0.6 : 0.2;
        proj(bp.x, 0, bp.z);
        shadow(c, PX, PY, r * PK);
        continue;
      }
      if (!r) continue;
      proj(o.x, 0, o.z);
      shadow(c, PX, PY, r * PK);
    }
    c.fillStyle = "rgba(20,16,67,0.3)";
    c.fill();
  }

  function keeperKit(rk, mine) {
    var opts = ["#FACC15", "#22D3EE", "#A3E635", "#F472B6", "#FB923C"];
    var best = opts[0], bd = -1;
    opts.forEach(function (o) {
      var d = Math.min(dist2(o, rk.p), dist2(o, mine.p));
      if (d > bd) {
        bd = d;
        best = o;
      }
    });
    return { p: best, s: NAVY, sh: NAVY, so: best, glove: "#FFFFFF" };
  }
  function kitFor(k0) {
    var p = hex(k0.primary, "#5B3DF5"), s2 = hex(k0.secondary, "#FFFFFF");
    if (dist2(p, s2) < 1800) s2 = dist2(p, "#FFFFFF") > 20000 ? "#FFFFFF" : NAVY;
    return { p: p, s: s2, sh: s2, so: p };
  }
  function refreshLooks() {
    var key = rosterSig + ":" + level;
    if (key === lookKey) return;
    lookKey = key;
    var mine = kitFor(kitOf(captain)), rk = kitFor(kitOf(rivalAt(level)));
    kits.m = mine;
    kits.f = rk;
    kits.k = keeperKit(rk, mine);
    sprites = {};
  }

  /* Top: birkaç dönüş karesi önceden çizilir (beyaz, ateşli, falsolu, dev). */
  var BALL_SKINS = {
    n: ["#FFFFFF", NAVY],
    fire: ["#FF8A1F", "#7A1C05"],
    curve: ["#E9D5FF", "#5B1F8F"],
    giant: ["#FFE680", "#7A4A06"],
  };
  var ballSprites = {};
  function flatBall(c, bx, by, r, rot, fill, ink) {
    c.save();
    c.translate(bx, by);
    c.beginPath();
    c.arc(0, 0, r, 0, Math.PI * 2);
    c.fillStyle = fill || "#FFFFFF";
    c.fill();
    c.save();
    c.clip();
    c.fillStyle = ink || NAVY;
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
      var a2 = (k / 5) * Math.PI * 2 + Math.PI / 2;
      pent(Math.cos(a2) * r * 0.95, Math.sin(a2) * r * 0.95, r * 0.3);
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
  function ballSprite(i, skin) {
    var key = BALL_SKINS[skin] ? skin : "n";
    var set = ballSprites[key];
    if (!set) {
      set = ballSprites[key] = [];
      for (var k = 0; k < 6; k++) {
        var px = Math.ceil(48 * (A.dpr || 1));
        var cv = document.createElement("canvas");
        cv.width = cv.height = px;
        var c = cv.getContext("2d");
        if (c && c.setTransform) {
          c.setTransform(px / 48, 0, 0, px / 48, 0, 0);
          flatBall(c, 24, 24, 20, (k / 6) * (Math.PI * 2) / 5, BALL_SKINS[key][0], BALL_SKINS[key][1]);
        }
        set.push(cv);
      }
    }
    return set[((Math.floor(i) % 6) + 6) % 6];
  }
  function blitBall(c, bx, by, r, spin, skin) {
    if (r < 0.8) return;
    c.drawImage(ballSprite(spin, skin), bx - r * 1.2, by - r * 1.2, r * 2.4, r * 2.4);
  }

  /* ─────────────────────────── silah rozetleri ───────────────────────────
   * Her silahın simgesi renkli bir rozet üstüne bir kez ekran dışına çizilir;
   * yoldaki toplanabilir silah da HUD rozeti de aynı kareyi kullanır. */
  var badgeSprites = {};
  function drawPowerIcon(c, type, r) {
    var def = POWERS[type];
    // rozet: koyu kenar, renkli disk, parlak üst
    blob(c, 0, r * 0.08, r, rgba(NAVY, 0.5), 0);
    var g = c.createLinearGradient(0, -r, 0, r);
    g.addColorStop(0, mixc(def.col, "#FFFFFF", 0.25));
    g.addColorStop(1, def.dark);
    c.beginPath();
    c.arc(0, 0, r, 0, Math.PI * 2);
    c.fillStyle = g;
    c.fill();
    c.lineWidth = r * 0.1;
    c.strokeStyle = "#FFFFFF";
    c.stroke();
    c.beginPath();
    c.arc(0, 0, r * 1.05, 0, Math.PI * 2);
    c.lineWidth = r * 0.07;
    c.strokeStyle = NAVY;
    c.stroke();
    var b = r * 0.42;
    c.lineJoin = "round";
    c.lineCap = "round";
    if (type === "sack") {
      // file torba: içinde toplar, ağ dokusu, bağcık
      flatBall(c, -b * 0.55, b * 0.35, b * 0.7, 0.3);
      flatBall(c, b * 0.6, b * 0.4, b * 0.7, 1.1);
      flatBall(c, 0, -b * 0.35, b * 0.72, 0.7);
      c.strokeStyle = "rgba(255,255,255,0.9)";
      c.lineWidth = r * 0.06;
      c.beginPath();
      for (var q = -3; q <= 3; q++) {
        c.moveTo(q * b * 0.5 - b, -b * 1.1);
        c.lineTo(q * b * 0.5 + b, b * 1.2);
        c.moveTo(q * b * 0.5 + b, -b * 1.1);
        c.lineTo(q * b * 0.5 - b, b * 1.2);
      }
      c.save();
      c.beginPath();
      c.arc(0, b * 0.1, b * 1.35, 0, Math.PI * 2);
      c.clip();
      c.stroke();
      c.restore();
      c.fillStyle = "#FDE68A";
      c.beginPath();
      c.moveTo(-b * 0.35, -b * 1.25);
      c.lineTo(b * 0.35, -b * 1.25);
      c.lineTo(0, -b * 0.85);
      c.closePath();
      c.fill();
    } else if (type === "fire") {
      // alev dili + ateşli top
      c.fillStyle = "#FDE047";
      c.beginPath();
      c.moveTo(-b * 0.9, b * 0.2);
      c.quadraticCurveTo(-b * 1.2, -b * 1.2, -b * 0.2, -b * 1.9);
      c.quadraticCurveTo(-b * 0.3, -b * 1.0, b * 0.4, -b * 1.5);
      c.quadraticCurveTo(b * 0.5, -b * 0.9, b * 1.3, -b * 1.4);
      c.quadraticCurveTo(b * 1.3, -b * 0.2, b * 0.9, b * 0.3);
      c.closePath();
      c.fill();
      c.lineWidth = r * 0.06;
      c.strokeStyle = "#B91C1C";
      c.stroke();
      flatBall(c, 0, b * 0.3, b * 1.05, 0.4, "#FF8A1F", "#7A1C05");
    } else if (type === "triple") {
      for (var t3 = -1; t3 <= 1; t3++) {
        c.strokeStyle = "rgba(255,255,255,0.75)";
        c.lineWidth = r * 0.07;
        c.beginPath();
        c.moveTo(t3 * b * 1.0 - b * 0.5, b * 1.5);
        c.lineTo(t3 * b * 0.75 - b * 0.15, b * 0.6);
        c.stroke();
      }
      flatBall(c, -b * 1.05, -b * 0.1, b * 0.62, 0.2);
      flatBall(c, b * 1.05, -b * 0.1, b * 0.62, 0.9);
      flatBall(c, 0, -b * 0.65, b * 0.66, 0.5);
    } else if (type === "curve") {
      c.strokeStyle = "#FFFFFF";
      c.lineWidth = r * 0.13;
      c.beginPath();
      c.arc(-b * 0.2, b * 0.5, b * 1.45, Math.PI * 1.05, Math.PI * 1.75);
      c.stroke();
      var ax2 = -b * 0.2 + Math.cos(Math.PI * 1.75) * b * 1.45, ay2 = b * 0.5 + Math.sin(Math.PI * 1.75) * b * 1.45;
      c.fillStyle = "#FFFFFF";
      c.beginPath();
      c.moveTo(ax2 + b * 0.55, ay2 + b * 0.05);
      c.lineTo(ax2 - b * 0.25, ay2 - b * 0.45);
      c.lineTo(ax2 - b * 0.05, ay2 + b * 0.5);
      c.closePath();
      c.fill();
      flatBall(c, b * 0.25, b * 0.55, b * 0.8, 0.6, "#E9D5FF", "#5B1F8F");
    } else if (type === "giant") {
      flatBall(c, 0, 0, b * 1.6, 0.5, "#FFE680", "#7A4A06");
      label(c, "XL", b * 0.9, b * 1.05, r * 0.42, "#FFFFFF", "center", NAVY);
    } else if (type === "boots") {
      // krampon: yan görünüş, çivili taban, hız çizgileri
      c.strokeStyle = "rgba(255,255,255,0.85)";
      c.lineWidth = r * 0.08;
      for (var sl = 0; sl < 3; sl++) {
        c.beginPath();
        c.moveTo(-b * 1.9, -b * 0.5 + sl * b * 0.5);
        c.lineTo(-b * 1.3, -b * 0.5 + sl * b * 0.5);
        c.stroke();
      }
      c.beginPath();
      c.moveTo(-b * 1.0, -b * 1.1);
      c.lineTo(-b * 0.2, -b * 1.1);
      c.lineTo(-b * 0.1, -b * 0.3);
      c.quadraticCurveTo(b * 1.2, -b * 0.2, b * 1.4, b * 0.4);
      c.lineTo(b * 1.4, b * 0.6);
      c.lineTo(-b * 1.1, b * 0.6);
      c.closePath();
      c.fillStyle = NAVY;
      c.fill();
      c.fillStyle = "#FFFFFF";
      c.fillRect(-b * 0.9, -b * 0.85, b * 0.6, b * 0.18);
      c.beginPath();
      c.moveTo(-b * 0.2, b * 0.1);
      c.lineTo(b * 0.9, -b * 0.05);
      c.lineWidth = r * 0.07;
      c.strokeStyle = "#22D3EE";
      c.stroke();
      c.fillStyle = "#E2E8F0";
      for (var st = 0; st < 4; st++) c.fillRect(-b * 0.9 + st * b * 0.65, b * 0.6, b * 0.22, b * 0.3);
    }
  }
  function powerBadge(type) {
    var key = type + ":" + (A.dpr || 1);
    var cv = badgeSprites[key];
    if (cv) return cv;
    var px = Math.ceil(84 * (A.dpr || 1));
    cv = document.createElement("canvas");
    cv.width = cv.height = px;
    var c = cv.getContext("2d");
    if (c && c.setTransform) {
      c.setTransform(px / 84, 0, 0, px / 84, 0, 0);
      c.translate(42, 40);
      drawPowerIcon(c, type, 36);
    }
    badgeSprites[key] = cv;
    return cv;
  }
  /** Rozeti (cx, cy) merkezli, r yarıçapla çizer. */
  function blitBadge(c, type, cx, cy, r) {
    if (r < 2) return;
    var s2 = r / 36;
    c.drawImage(powerBadge(type), cx - 42 * s2, cy - 40 * s2, 84 * s2, 84 * s2);
  }

  /* ─────────────────────────── kapılar, çubuk, kale ─────────────────────────── */
  function label(c, text, lx, ly, size, color, align, stroke) {
    c.font = A.font(size, 900);
    c.textAlign = align || "center";
    c.textBaseline = "middle";
    c.lineJoin = "round";
    if (stroke !== false) {
      c.lineWidth = Math.max(3, size * 0.24);
      c.strokeStyle = stroke || NAVY;
      c.strokeText(text, lx, ly);
    }
    c.fillStyle = color;
    c.fillText(text, lx, ly);
  }

  function drawPanel(c, op, x0, x1, gz, alpha, lift, pop) {
    var good = isGood(op);
    proj(x0, 2.75 + lift, gz);
    var ax = PX, ay = PY, k = PK;
    proj(x1, 0.12 + lift, gz);
    var bx = PX, by = PY;
    var cx2 = (ax + bx) / 2, cy2 = (ay + by) / 2;
    var w = (bx - ax) * pop, h = (by - ay) * pop;
    ax = cx2 - w / 2;
    ay = cy2 - h / 2;
    var r = Math.min(0.32 * k, h / 3);
    c.save();
    c.globalAlpha = alpha;
    // gölge kenar
    A.roundRect(c, ax, ay + 0.08 * k, w, h, r);
    c.fillStyle = rgba(NAVY, 0.45);
    c.fill();
    A.roundRect(c, ax, ay, w, h, r);
    var g = c.createLinearGradient(0, ay, 0, ay + h);
    g.addColorStop(0, rgba(good ? GOOD_A : BAD_A, 0.86));
    g.addColorStop(1, rgba(good ? GOOD_B : BAD_B, 0.9));
    c.fillStyle = g;
    c.fill();
    // parlak cam: üst bant + çapraz yansıma
    c.save();
    c.clip();
    c.fillStyle = "rgba(255,255,255,0.28)";
    c.fillRect(ax, ay, w, h * 0.3);
    c.fillStyle = "rgba(255,255,255,0.16)";
    c.beginPath();
    c.moveTo(ax + w * 0.08, ay + h);
    c.lineTo(ax + w * 0.32, ay);
    c.lineTo(ax + w * 0.44, ay);
    c.lineTo(ax + w * 0.2, ay + h);
    c.closePath();
    c.fill();
    c.restore();
    var lw = Math.max(1.5, 0.11 * k);
    A.roundRect(c, ax + lw * 0.9, ay + lw * 0.9, w - lw * 1.8, h - lw * 1.8, Math.max(1, r - lw));
    c.lineWidth = lw * 0.8;
    c.strokeStyle = good ? "rgba(214,240,255,0.95)" : "rgba(255,220,228,0.95)";
    c.stroke();
    A.roundRect(c, ax, ay, w, h, r);
    c.lineWidth = lw;
    c.strokeStyle = NAVY;
    c.stroke();
    var fs = h * 0.5;
    if (fs > 5) {
      c.save();
      c.translate(cx2, cy2 + fs * 0.04);
      label(c, opLabel(op), 0, 0, fs, "#FFFFFF", "center", NAVY);
      c.restore();
    }
    c.restore();
  }
  function drawPost(c, px, gz, h) {
    proj(px - 0.13, h, gz);
    var ax = PX, ay = PY, k = PK;
    proj(px + 0.13, 0, gz);
    var w = PX - ax, hh = PY - ay;
    var g = c.createLinearGradient(ax, 0, ax + w, 0);
    g.addColorStop(0, "#FFFFFF");
    g.addColorStop(1, "#B9C2E8");
    A.roundRect(c, ax, ay, w, hh, w / 2);
    c.fillStyle = g;
    c.fill();
    c.lineWidth = Math.max(1.2, 0.07 * k);
    c.strokeStyle = NAVY;
    c.stroke();
    // tepede top
    blitBall(c, ax + w / 2, ay - 0.1 * k, 0.24 * k, 0);
  }
  function drawGate(c, s) {
    var far = A.clamp((camZ + FAR - s.z) / 18, 0, 1);
    if (s.done) {
      // geçilen kapı: yalnız seçilen panel yükselip küçülerek söner (kadronun önünü kapatmaz)
      var u = A.clamp((A.time - s.at) / 0.28, 0, 1);
      if (u >= 1) return;
      var side = s.pick;
      var x0 = side < 0 ? -FIELD + 0.12 : 0.12, x1 = side < 0 ? -0.12 : FIELD - 0.12;
      drawPanel(c, side < 0 ? s.left : s.right, x0, x1, s.z, (1 - u) * 0.85, 0.6 + u * 2.2, 1 - 0.45 * A.easeOut(u));
      return;
    }
    [-1, 1].forEach(function (sd) {
      var op = sd < 0 ? s.left : s.right;
      var a0 = sd < 0 ? -FIELD + 0.12 : 0.12, a1 = sd < 0 ? -0.12 : FIELD - 0.12;
      drawPanel(c, op, a0, a1, s.z, far, 0, 1);
    });
    c.globalAlpha = far;
    drawPost(c, -FIELD, s.z, 3.0);
    drawPost(c, 0, s.z, 3.0);
    drawPost(c, FIELD, s.z, 3.0);
    c.globalAlpha = 1;
  }
  function drawBar(c, s) {
    var hw = s.w / 2;
    proj(s.x - hw, 0.95, s.z);
    var ax = PX, ay = PY, k = PK;
    proj(s.x + hw, 0.58, s.z);
    var bx = PX, by = PY;
    var lw = Math.max(1.4, 0.08 * k);
    // bacaklar
    [-1, 1].forEach(function (sd) {
      proj(s.x + sd * (hw - 0.15) - 0.06, 0.7, s.z);
      var lx = PX, ly = PY;
      proj(s.x + sd * (hw - 0.15) + 0.06, 0, s.z);
      c.fillStyle = "#2B2268";
      c.fillRect(lx, ly, PX - lx, PY - ly);
      c.fillStyle = "rgba(0,0,0,0.25)";
      c.beginPath();
      c.ellipse((lx + PX) / 2, PY, (PX - lx) * 2.5, (PX - lx) * 0.8, 0, 0, Math.PI * 2);
      c.fill();
    });
    A.roundRect(c, ax, ay, bx - ax, by - ay, (by - ay) / 2);
    c.fillStyle = "#FF3D5E";
    c.fill();
    c.save();
    c.clip();
    c.fillStyle = "#FFFFFF";
    var stp = 0.5 * k;
    for (var xx = ax - (by - ay); xx < bx; xx += stp * 2) {
      c.beginPath();
      c.moveTo(xx, by);
      c.lineTo(xx + stp, by);
      c.lineTo(xx + stp + (by - ay), ay);
      c.lineTo(xx + (by - ay), ay);
      c.closePath();
      c.fill();
    }
    c.fillStyle = "rgba(255,255,255,0.35)";
    c.fillRect(ax, ay, bx - ax, (by - ay) * 0.3);
    c.restore();
    A.roundRect(c, ax, ay, bx - ax, by - ay, (by - ay) / 2);
    c.lineWidth = lw;
    c.strokeStyle = NAVY;
    c.stroke();
  }

  var netPat = null;
  function netPattern(c) {
    if (netPat !== null) return netPat;
    netPat = "rgba(255,255,255,0.3)";
    try {
      var cv = document.createElement("canvas");
      cv.width = cv.height = 12;
      var n2 = cv.getContext("2d");
      if (n2 && n2.createPattern) {
        n2.strokeStyle = "rgba(255,255,255,0.75)";
        n2.lineWidth = 1.2;
        n2.beginPath();
        n2.moveTo(0, 0);
        n2.lineTo(12, 12);
        n2.moveTo(12, 0);
        n2.lineTo(0, 12);
        n2.stroke();
        netPat = c.createPattern(cv, "repeat") || netPat;
      }
    } catch (e) {
      netPat = "rgba(255,255,255,0.3)";
    }
    return netPat;
  }
  var GW = 3.6, GH = 2.8, GD = 2.2;
  function drawNet(c, gz) {
    var bump = state === "goal" ? Math.sin(Math.min(1, stateT * 3) * Math.PI) * 0.6 : 0;
    var bz = gz + GD + bump;
    // ağ içi zemini koyu
    c.fillStyle = "#2E8F3E";
    quad(c, -GW, 0, gz, GW, 0, gz, GW, 0, bz, -GW, 0, bz);
    c.fill();
    var pat = netPattern(c);
    c.fillStyle = "rgba(20,16,67,0.35)";
    quad(c, -GW, 0, bz, GW, 0, bz, GW, GH, bz, -GW, GH, bz);
    c.fill();
    c.fillStyle = pat;
    c.fill();
    [-1, 1].forEach(function (sd) {
      quad(c, sd * GW, 0, gz, sd * GW, 0, bz, sd * GW, GH, bz, sd * GW, GH, gz);
      c.fillStyle = "rgba(20,16,67,0.25)";
      c.fill();
      c.fillStyle = pat;
      c.fill();
    });
    quad(c, -GW, GH, gz, GW, GH, gz, GW, GH, bz, -GW, GH, bz);
    c.fillStyle = "rgba(255,255,255,0.22)";
    c.fill();
  }
  function drawGoalFrame(c, gz) {
    proj(-GW - 0.14, GH + 0.14, gz);
    var ax = PX, ay = PY, k = PK;
    proj(GW + 0.14, 0, gz);
    var bx = PX, by = PY;
    var t = 0.24 * k;
    c.fillStyle = "#FFFFFF";
    c.strokeStyle = NAVY;
    c.lineWidth = Math.max(1.5, 0.08 * k);
    c.beginPath();
    c.moveTo(ax, by);
    c.lineTo(ax, ay + t / 2);
    c.quadraticCurveTo(ax, ay, ax + t / 2, ay);
    c.lineTo(bx - t / 2, ay);
    c.quadraticCurveTo(bx, ay, bx, ay + t / 2);
    c.lineTo(bx, by);
    c.lineTo(bx - t, by);
    c.lineTo(bx - t, ay + t);
    c.lineTo(ax + t, ay + t);
    c.lineTo(ax + t, by);
    c.closePath();
    c.fill();
    c.stroke();
    c.fillStyle = "rgba(27,22,72,0.18)";
    c.fillRect(ax + t * 0.55, ay + t * 0.55, t * 0.4, by - ay - t * 0.6);
    c.fillRect(bx - t * 0.95, ay + t * 0.55, t * 0.4, by - ay - t * 0.6);
  }

  /* ─────────────────────────── sahne derleme ─────────────────────────── */
  var items = [];
  function push(d, kind, a, b2, c2) {
    items.push({ d: d, kind: kind, a: a, b: b2, c: c2 });
  }
  function byDepth(p, q) {
    return q.d - p.d;
  }

  function pushMen(men, block, zMax) {
    for (var k = 0; k < men.length; k++) {
      var m = men[k];
      if (m.z > zMax || m.z < camZ + NEAR) continue;
      if (m.alive) {
        // vuruş tepkisi: kısa sarsılma + geri itilme
        var h = A.clamp(1 - (A.time - m.hitAt) / 0.18, 0, 1);
        push(m.z + h * 0.25, "foe", { x: m.x + m.dir * h * 0.12, z: m.z + h * 0.25, ph: A.time * (block ? 0.8 : 1.4) + (m.ph || k * 0.3), look: m.look, flash: h * 0.6, rot: m.dir * h * 0.16, block: block });
      } else {
        var t = (A.time - m.dieAt) / 0.95;
        if (t < 0 || t >= 1) continue;
        // değdiği an geriye ve yana savrulur, havalanır, yere serilir, söner
        var kb = (m.cause === "melee" ? 1.2 : 1.8) * m.pow;
        var e = A.easeOut(Math.min(1, t * 1.6));
        var fz = m.z + e * kb;
        push(fz, "foeFall", { x: m.x + m.dir * e * 0.7 * m.pow, z: fz, y: Math.max(0, Math.sin(Math.min(1, t * 1.8) * Math.PI)) * 0.55 * m.pow, t: t, look: m.look, dir: m.dir });
      }
    }
  }

  function collect() {
    items.length = 0;
    var zMax = camZ + FAR - 2;
    segs.forEach(function (s) {
      if (s.z > zMax || s.z < camZ + NEAR - 3) return;
      if (s.type === "gate") push(s.z, "gate", s);
      else if (s.type === "bar" && !s.done) push(s.z, "bar", s);
      else if (s.type === "rivals") pushMen(menOf(s), false, zMax);
    });
    // yoldaki silahlar
    pickups.forEach(function (p) {
      if (p.z > zMax || p.z < camZ + NEAR) return;
      if (p.taken) {
        var u = (A.time - p.at) / 0.35;
        if (u < 1) push(p.z - 0.2, "power", { p: p, x: A.lerp(p.x, x, u), z: A.lerp(p.z, z, u), y: 1.25 + u * 1.2, s: 1 + u * 0.6, a: 1 - u });
      } else if (!p.gone) push(p.z, "power", { p: p, x: p.x, z: p.z, y: 1.25 + Math.sin(A.time * 3 + p.id) * 0.14, s: 1, a: 1, base: true });
    });
    // kale + kaleci + baraj
    if (boss) {
      var gz = boss.z + 1.2;
      if (gz < zMax + 2) {
        push(gz + GD, "net", gz);
        push(gz - 0.01, "frame", gz);
        var bh = A.clamp(1 - (A.time - boss.hitAt) / 0.16, 0, 1);
        var down2 = boss.hp <= 0;
        var kx = keeperX(A.time);
        var kick = boss.shot && A.time - boss.shot.at < 0.4;
        push(boss.z + 0.4 + bh * 0.3, "keeper", { x: kx, z: boss.z + 0.4 + bh * 0.3, down: down2, kick: kick, kt: kick ? (A.time - boss.shot.at) / 0.4 : 0, flash: bh * 0.55, rot: bh * 0.08 });
        pushMen(boss.men, true, zMax);
      }
    }
    // kadro
    var goal = state === "goal";
    var stopped = speed < 0.5;
    for (var i = 0; i < mem.length; i++) {
      var m = mem[i];
      var b = A.clamp((A.time - m.born) / 0.28, 0, 1);
      var pose = "run", ph = (A.time * (8 + speed * 0.75) + i * 1.7) / (Math.PI * 2);
      if (goal) {
        pose = "cheer";
        ph = A.time * 1.6 + i * 0.37;
      } else if (stopped && state !== "dying") {
        pose = "kick";
        ph = A.time * 1.6 + i * 0.37;
      }
      push(z + m.oz, "mine", { x: memX(m), z: z + m.oz, pose: pose, ph: ph, look: m.look, s: b <= 0 ? 0.01 : A.easeOutBack(b) });
    }
    fallen.forEach(function (f) {
      var t = A.time - f.at;
      if (t < 0) return;
      var y = Math.max(0, f.vy * t - 6 * t * t);
      var fz = f.z + f.vz * Math.min(t, 0.8);
      push(fz, "mineFall", { x: A.clamp(f.x + f.vx * Math.min(t, 0.8), -FIELD - 1, FIELD + 1), y: y, z: fz, t: t, dir: f.dir, look: f.look, gate: f.gate });
    });
    shots.forEach(function (s) {
      var u = s.t;
      var sz = A.lerp(s.z0, s.tz, u);
      push(sz, "ball", { s: s, u: u, z: sz });
    });
    rolls.forEach(function (r) {
      var u = (A.time - r.at) / 0.7;
      push(r.z + u * 9, "roll", { x: r.x, z: r.z + u * 9, a: 1 - u, spin: r.spin + u * 30 });
    });
    if (boss && boss.shot) {
      var sh = boss.shot;
      var u2 = A.clamp((A.time - sh.at) / (sh.land - sh.at), 0, 1);
      var bz = A.lerp(boss.z - 0.5, z, u2);
      push(bz - 0.01, "bigBall", { x: A.lerp(0, sh.x, u2), y: 1.2 + Math.sin(u2 * Math.PI) * 4.2, z: bz, spin: A.time * 14 });
    }
    items.sort(byDepth);
  }

  /** Uçan topun u anındaki dünya konumu (falso yanal kavis çizer). */
  function shotPos(s, u) {
    return {
      x: A.lerp(s.x0, s.tx, u) + s.curve * Math.sin(u * Math.PI),
      y: A.lerp(s.y0, s.ty, u) + s.arc * Math.sin(u * Math.PI),
      z: A.lerp(s.z0, s.tz, u),
    };
  }
  var TRAIL = {
    n: "rgba(255,255,255,", sack: "rgba(187,247,208,", triple: "rgba(191,219,254,",
    fire: null, curve: "rgba(216,180,254,", giant: "rgba(254,240,138,",
  };
  function drawShot(c, s, u, fogA) {
    var kind = s.kind;
    var r0 = kind === "giant" ? 0.6 : kind === "fire" ? 0.3 : 0.24;
    // iz: topun geçtiği birkaç nokta
    var steps = kind === "fire" ? 6 : 4;
    for (var i = steps; i >= 1; i--) {
      var uu = u - i * (kind === "fire" ? 0.045 : 0.04);
      if (uu < 0) continue;
      var q = shotPos(s, uu);
      proj(q.x, kind === "giant" ? r0 : q.y, q.z);
      var a = (1 - i / (steps + 1)) * fogA;
      var rr = r0 * PK * (kind === "fire" ? 0.95 - i * 0.07 : 0.75 - i * 0.1);
      if (rr < 0.6) continue;
      c.beginPath();
      c.arc(PX, PY, rr, 0, Math.PI * 2);
      if (kind === "fire") c.fillStyle = i < 3 ? "rgba(255,214,74," + (0.85 * a).toFixed(3) + ")" : "rgba(255,106,31," + (0.7 * a).toFixed(3) + ")";
      else c.fillStyle = TRAIL[kind] + (0.45 * a).toFixed(3) + ")";
      c.fill();
    }
    var p = shotPos(s, u);
    if (kind === "giant") {
      proj(p.x, r0, p.z);
      blitBall(c, PX, PY, r0 * PK, s.spin + u * 20, "giant");
      return;
    }
    proj(p.x, p.y, p.z);
    if (kind === "fire") {
      c.beginPath();
      c.arc(PX, PY, r0 * PK * 1.7, 0, Math.PI * 2);
      c.fillStyle = "rgba(255,138,31,0.35)";
      c.fill();
    }
    blitBall(c, PX, PY, r0 * PK, s.spin + u * 14, kind === "fire" ? "fire" : kind === "curve" ? "curve" : "n");
  }
  function drawPower(c, o, fogA) {
    var def = POWERS[o.p.type];
    if (o.base) {
      // zemin halkası + ışık sütunu
      proj(o.x, 0, o.z);
      var rx = 0.95 * PK, ry = rx * A.clamp(camH / PD, 0.22, 0.6);
      var pulse = 0.5 + 0.5 * Math.sin(A.time * 5 + o.p.id);
      c.beginPath();
      c.ellipse(PX, PY, rx, ry, 0, 0, Math.PI * 2);
      c.fillStyle = rgba(def.col, 0.28 + 0.12 * pulse);
      c.fill();
      c.lineWidth = Math.max(1.5, 0.08 * PK);
      c.strokeStyle = rgba("#FFFFFF", 0.7);
      c.stroke();
      var gx = PX, gy = PY;
      proj(o.x, 2.4, o.z);
      var bw = 0.5 * PK;
      var g = c.createLinearGradient(0, PY, 0, gy);
      g.addColorStop(0, rgba(def.col, 0));
      g.addColorStop(1, rgba(def.col, 0.35));
      c.fillStyle = g;
      c.fillRect(gx - bw, PY, bw * 2, gy - PY);
    }
    proj(o.x, o.y, o.z);
    var r = 0.68 * PK * o.s;
    if (o.a < 1) c.globalAlpha = Math.max(0, o.a) * fogA;
    blitBadge(c, o.p.type, PX, PY, r);
    if (o.base && r > 9) {
      proj(o.x, o.y + 1.1, o.z);
      var fs = A.clamp(0.32 * PK, 9, 15);
      c.font = A.font(fs, 900);
      var tw = c.measureText(def.name).width + fs;
      A.roundRect(c, PX - tw / 2, PY - fs * 0.7, tw, fs * 1.4, fs * 0.7);
      c.fillStyle = rgba(NAVY, 0.82);
      c.fill();
      label(c, def.name, PX, PY + 0.5, fs, "#FFFFFF", "center", false);
    }
    c.globalAlpha = 1;
  }

  function drawItems(c) {
    drawShadows(c);
    var mineK = UNIT;
    for (var i = 0; i < items.length; i++) {
      var it = items[i], o = it.a;
      var fogA = A.clamp((camZ + FAR - it.d) / 16, 0, 1);
      if (fogA <= 0) continue;
      if (fogA < 1) c.globalAlpha = fogA;
      switch (it.kind) {
        case "gate":
          drawGate(c, o);
          break;
        case "bar":
          drawBar(c, o);
          break;
        case "net":
          drawNet(c, o);
          break;
        case "frame":
          drawGoalFrame(c, o);
          break;
        case "power":
          drawPower(c, o, fogA);
          break;
        case "mine": {
          proj(o.x, 0, o.z);
          var k = PK * mineK * o.s;
          if (boostT > 0 && state === "play") {
            // krampon: ayak altında hız izi
            c.fillStyle = "rgba(34,211,238,0.35)";
            c.fillRect(PX - 6 * k, PY + 1, 12 * k, Math.max(2, 3 * k));
          }
          blitFig(c, sprite("m", o.pose, frameOf(o.pose, o.ph), o.look), PX, PY, k, 0, fogA, 0);
          break;
        }
        case "mineFall": {
          // kadrodan düşen üye: havalanır, döner, yere serilip söner
          proj(o.x, o.y, o.z);
          var k1 = PK * mineK * Math.max(0, 1 - Math.max(0, o.t - 0.45) * 1.8);
          if (k1 <= 0) break;
          var rot = o.dir * A.easeOut(Math.min(1, o.t * 2.6)) * (o.gate ? 0.6 : 1.5);
          blitFig(c, sprite("m", "fall", 0, o.look), PX, PY, k1, rot, fogA * Math.min(1, (1 - o.t) * (o.gate ? 1.2 : 2.2)), Math.max(0, 0.8 - o.t * 2.5));
          break;
        }
        case "foe": {
          proj(o.x, 0, o.z);
          var k2 = PK * mineK;
          var pose = o.block ? "block" : "ready";
          blitFig(c, sprite("f", pose, frameOf(pose, o.ph), o.look), PX, PY, k2, o.rot || 0, fogA, o.flash);
          break;
        }
        case "foeFall": {
          proj(o.x, o.y, o.z);
          var k3 = PK * mineK * (1 - Math.max(0, o.t - 0.6) * 2.4);
          if (k3 <= 0.01) break;
          blitFig(c, sprite("f", "fall", 0, o.look), PX, PY, k3, o.dir * A.easeOut(Math.min(1, o.t * 1.8)) * 1.5, fogA, Math.max(0, 0.9 - o.t * 3));
          break;
        }
        case "keeper": {
          proj(o.x, 0, o.z);
          var k4 = PK * mineK * 1.8;
          if (o.down) {
            var kt = A.clamp((A.time - (boss.downAt || A.time)) / 0.6, 0, 1);
            blitFig(c, sprite("k", "fall", 0, 2, true), PX, PY, k4, A.easeOut(kt) * 1.5, fogA, 0);
          } else if (o.kick) blitFig(c, sprite("k", "keeper", 0, 2, true), PX, PY - Math.sin(o.kt * Math.PI) * 0.3 * PK, k4 * (1 + Math.sin(o.kt * Math.PI) * 0.08), 0, fogA, o.flash);
          else blitFig(c, sprite("k", "keeper", frameOf("keeper", A.time * 0.6), 2, true), PX, PY, k4, o.rot, fogA, o.flash);
          break;
        }
        case "ball":
          drawShot(c, o.s, o.u, fogA);
          break;
        case "roll":
          proj(o.x, 0.6, o.z);
          c.globalAlpha = Math.max(0, o.a) * fogA;
          blitBall(c, PX, PY, 0.6 * PK, o.spin, "giant");
          break;
        case "bigBall":
          proj(o.x, o.y, o.z);
          blitBall(c, PX, PY, 0.45 * PK, o.spin);
          break;
      }
      c.globalAlpha = 1;
    }
  }

  /** Kalecinin sert şutunun düşeceği yer: yerde yanıp sönen kırmızı halka. */
  function drawTarget(c) {
    if (!boss || !boss.shot) return;
    var sh = boss.shot;
    var u = A.clamp((A.time - sh.at) / (sh.land - sh.at), 0, 1);
    proj(sh.x, 0, z);
    var rx = 1.4 * PK * (1.5 - 0.5 * u), ry = rx * A.clamp(camH / PD, 0.22, 0.7);
    c.save();
    c.beginPath();
    c.ellipse(PX, PY, rx, ry, 0, 0, Math.PI * 2);
    c.fillStyle = "rgba(255,51,85," + (0.18 + 0.3 * u).toFixed(3) + ")";
    c.fill();
    c.lineWidth = Math.max(3, 0.18 * PK);
    c.strokeStyle = "rgba(255,51,85," + (0.6 + 0.4 * Math.sin(A.time * 22)).toFixed(3) + ")";
    c.stroke();
    c.lineWidth = 2;
    c.strokeStyle = "#FFFFFF";
    c.beginPath();
    c.ellipse(PX, PY, rx * 0.35, ry * 0.35, 0, 0, Math.PI * 2);
    c.stroke();
    c.restore();
  }

  /* ─────────────────────────── etiketler + HUD ─────────────────────────── */
  function tag(c, text, tx, ty, size, fillA, fillB) {
    c.font = A.font(size, 900);
    var w = Math.max(size * 1.6, c.measureText(text).width + size * 0.9), h = size * 1.35;
    var x0 = tx - w / 2, y0 = ty - h / 2;
    A.roundRect(c, x0, y0 + 3, w, h, h / 2);
    c.fillStyle = "rgba(8,6,30,0.45)";
    c.fill();
    A.roundRect(c, x0, y0, w, h, h / 2);
    var g = c.createLinearGradient(0, y0, 0, y0 + h);
    g.addColorStop(0, fillA);
    g.addColorStop(1, fillB);
    c.fillStyle = g;
    c.fill();
    c.lineWidth = 2.5;
    c.strokeStyle = NAVY;
    c.stroke();
    c.fillStyle = "rgba(255,255,255,0.3)";
    A.roundRect(c, x0 + h * 0.3, y0 + 2.5, w - h * 0.6, h * 0.24, h * 0.12);
    c.fill();
    // aşağı ok
    c.beginPath();
    c.moveTo(tx - 5, y0 + h - 1);
    c.lineTo(tx, y0 + h + 5);
    c.lineTo(tx + 5, y0 + h - 1);
    c.closePath();
    c.fillStyle = fillB;
    c.fill();
    label(c, text, tx, ty + 0.5, size, "#FFFFFF", "center", NAVY);
  }
  function drawWorldLabels(c) {
    segs.forEach(function (s) {
      if (s.type !== "rivals" || s.done || s.z - z > 55 || s.z < camZ + NEAR) return;
      // temas anında etiket kadronun sayacının üstüne yükselir (üst üste binmez)
      proj((s.x0 + s.x1) / 2, 2.5 + A.clamp((7 - (s.z - z)) / 6, 0, 1) * 1.6, s.z);
      tag(c, String(Math.ceil(s.hp)), PX, PY, A.clamp(PK * 0.55, 12, 22), BAD_A, BAD_B);
    });
    if (n > 0 && state !== "attract") {
      proj(x, 2.3 + squadRadius(n) * 0.25, z);
      var size = 21 * (1 + Math.abs(countBump) * 0.4);
      tag(c, String(n), PX, PY, size, countBump < -0.15 ? "#FFC24A" : GOOD_A, countBump < -0.15 ? "#F08A00" : GOOD_B);
    }
  }

  function navyPill(c, px, py, w, h, fill) {
    A.roundRect(c, px, py + 3, w, h, h / 2);
    c.fillStyle = "rgba(8,6,30,0.55)";
    c.fill();
    A.roundRect(c, px, py, w, h, h / 2);
    var g = c.createLinearGradient(0, py, 0, py + h);
    g.addColorStop(0, fill ? mixc(fill, "#FFFFFF", 0.12) : "#2C2580");
    g.addColorStop(1, fill || "#1C1760");
    c.fillStyle = g;
    c.fill();
    c.lineWidth = 1.5;
    c.strokeStyle = "rgba(255,255,255,0.14)";
    c.stroke();
  }
  function clip(c, text, max) {
    var t = text;
    while (t.length > 3 && c.measureText(t).width > max) t = t.slice(0, -1);
    return t === text ? t : t + "…";
  }
  function bar(c, bx, by, bw, bh, frac, ca, cb) {
    A.roundRect(c, bx, by + 2, bw, bh, bh / 2);
    c.fillStyle = "rgba(8,6,30,0.55)";
    c.fill();
    A.roundRect(c, bx, by, bw, bh, bh / 2);
    c.fillStyle = "#231D6B";
    c.fill();
    var fw = Math.max(bh, bw * frac);
    A.roundRect(c, bx, by, fw, bh, bh / 2);
    var pg = c.createLinearGradient(0, by, 0, by + bh);
    pg.addColorStop(0, ca);
    pg.addColorStop(1, cb);
    c.fillStyle = pg;
    c.fill();
    c.fillStyle = "rgba(255,255,255,0.25)";
    A.roundRect(c, bx + 4, by + 2.5, Math.max(0, fw - 8), bh * 0.28, bh * 0.14);
    c.fill();
  }

  function drawHud(c) {
    var wide = L.wide;
    var y = wide ? 8 : 10, h = wide ? 30 : 34;
    // Puan hapı (sol): top simgesi + rakam
    var kick = Math.max(A.scoreKick || 0, scoreBump, shownPts < points ? 0.3 : 0);
    var txt = String(Math.round(shownPts));
    c.font = A.font(h * 0.6, 900);
    var pw = Math.max(86, c.measureText(txt).width + h + 26);
    navyPill(c, 12 + h * 0.4, y, pw, h);
    c.save();
    c.translate(12 + h / 2, y + h / 2);
    c.scale(1 + kick * 0.25, 1 + kick * 0.25);
    flatBall(c, 0, 0, h * 0.5, A.time * 0.6);
    c.restore();
    A.scoreAnchor = { x: 12 + h / 2, y: y + h / 2 };
    c.save();
    c.translate(12 + h + 8, y + h / 2 + 1);
    c.scale(1 + kick * 0.15, 1 + kick * 0.15);
    label(c, txt, 0, 0, h * 0.6, kick > 0.05 ? "#FFE58A" : "#FFFFFF", "left");
    c.restore();
    // Sağ: gol hapı (kale simgesi + sayı) — RN duraklat düğmesi varsa onun solunda
    var slot = A.hudSlot(12);
    var gtxt = String(goals);
    c.font = A.font(h * 0.6, 900);
    var gw = c.measureText(gtxt).width + h + 30;
    var gx = slot.x1 - gw;
    navyPill(c, gx, y, gw, h);
    // kale simgesi
    var ix = gx + 8, iy = y + h * 0.26, iw = h * 0.85, ih = h * 0.5;
    c.lineWidth = 2.6;
    c.strokeStyle = "#FFFFFF";
    c.lineJoin = "round";
    c.beginPath();
    c.moveTo(ix, iy + ih);
    c.lineTo(ix, iy);
    c.lineTo(ix + iw, iy);
    c.lineTo(ix + iw, iy + ih);
    c.stroke();
    c.lineWidth = 1;
    c.strokeStyle = "rgba(255,255,255,0.5)";
    for (var nx = ix + 4; nx < ix + iw - 1; nx += 4) {
      c.beginPath();
      c.moveTo(nx, iy + 2);
      c.lineTo(nx, iy + ih);
      c.stroke();
    }
    label(c, gtxt, gx + gw - 12, y + h / 2 + 1, h * 0.6, "#FFFFFF", "right");
    // Bölüm ilerlemesi: rakip rozeti + kale bayrağı
    var rv = rivalAt(level), rk = kits.f || kitFor(kitOf(rv));
    var bx, bw, byy, bh;
    if (wide) {
      bw = Math.min(W * 0.4, 320);
      bx = W / 2 - bw / 2;
      byy = y + 4;
      bh = h - 8;
    } else {
      bx = 14;
      bw = W - 28;
      // düğme yuvası varsa çubuk (ve kaleci can çubuğu) onun altına iner
      byy = Math.max(y + h + 12, slot.right > 0 ? slot.top + 6 : 0);
      bh = 22;
    }
    var total = boss ? boss.z - STOP - levelZ0 : 1;
    var prog = boss ? A.clamp((z - levelZ0) / total, 0, 1) : 0;
    var nearBoss = boss && z >= boss.z - STOP - 20 && boss.hp > 0;
    bar(c, bx, byy, bw, bh, prog, "#4ADE6E", "#16A34A");
    // bitiş bayrağı
    var mx = bx + bw - 6;
    c.fillStyle = "#FFFFFF";
    c.fillRect(mx - 1, byy - 4, 2, bh + 8);
    c.fillStyle = "#FF4D6A";
    c.beginPath();
    c.moveTo(mx + 1, byy - 4);
    c.lineTo(mx + 10, byy + 0.5);
    c.lineTo(mx + 1, byy + 5);
    c.closePath();
    c.fill();
    var lbl = level + ". BÖLÜM · " + String(rv.team.name || "Rakip");
    c.font = A.font(bh * 0.58, 900);
    while (lbl.length > 8 && c.measureText(lbl).width > bw - 50) lbl = lbl.slice(0, -2) + "…";
    var chipX = bx + bw / 2 - c.measureText(lbl).width / 2 - 12;
    blob(c, chipX, byy + bh / 2, bh * 0.3, rk.p, 2);
    label(c, lbl, bx + bw / 2 + 4, byy + bh / 2 + 0.5, bh * 0.58, "#FFFFFF");
    // Kaleci can çubuğu
    if (nearBoss) {
      var kw = Math.min(W - 60, 280), kx = W / 2 - kw / 2, ky = byy + bh + (wide ? 10 : 14);
      var name = rv.keeper && (rv.keeper.short || rv.keeper.name) ? String(rv.keeper.short || rv.keeper.name) : "Kaleci";
      navyPill(c, kx - 6, ky - 4, kw + 12, 40);
      c.font = A.font(11, 900);
      label(c, "KALECİ · " + clip(c, name, kw * 0.55), kx + 8, ky + 8, 11, "#FFFFFF", "left", false);
      label(c, String(Math.ceil(boss.hp)), kx + kw - 8, ky + 8, 12, "#FFE58A", "right", false);
      bar(c, kx + 4, ky + 17, kw - 8, 12, A.clamp(boss.hp / boss.hp0, 0, 1), "#FF7A90", "#E11D48");
    }
    drawPowerHud(c);
  }

  /** Sol alt: elindeki silahlar — rozet, ad, cephane/süre çubuğu. */
  function drawPowerHud(c) {
    var list = [];
    if (weapon) list.push({ type: weapon.type, frac: weapon.ammo / Math.max(1, weapon.max), text: String(weapon.ammo) });
    if (giant > 0) list.push({ type: "giant", frac: 1, text: "×" + giant });
    if (boostT > 0) list.push({ type: "boots", frac: boostT / BOOST, text: Math.ceil(boostT) + " sn" });
    if (!list.length) return;
    var ph = L.wide ? 34 : 38, pw = L.wide ? 150 : 158;
    var y = H - (L.wide ? 12 : 22) - ph;
    for (var i = 0; i < list.length; i++) {
      var e = list[i], def = POWERS[e.type];
      var pop = i === 0 ? powerPop : 0;
      var px = 12;
      c.save();
      if (pop > 0) {
        c.translate(px + ph / 2, y + ph / 2);
        c.scale(1 + pop * 0.18, 1 + pop * 0.18);
        c.translate(-(px + ph / 2), -(y + ph / 2));
      }
      navyPill(c, px + ph * 0.4, y, pw, ph);
      blitBadge(c, e.type, px + ph / 2, y + ph / 2, ph * 0.56);
      var tx = px + ph + 8, inner = pw - ph * 0.6 - 16;
      c.font = A.font(11, 900);
      label(c, def.name, tx, y + ph * 0.32, 11, "#FFFFFF", "left", false);
      label(c, e.text, px + ph * 0.4 + pw - 10, y + ph * 0.32, 11, mixc(def.col, "#FFFFFF", 0.35), "right", false);
      var bw = inner - 4, bh = 7;
      A.roundRect(c, tx, y + ph * 0.6, bw, bh, bh / 2);
      c.fillStyle = "#231D6B";
      c.fill();
      A.roundRect(c, tx, y + ph * 0.6, Math.max(bh, bw * A.clamp(e.frac, 0, 1)), bh, bh / 2);
      c.fillStyle = def.col;
      c.fill();
      c.restore();
      y -= ph + 8;
    }
  }

  /* ─────────────────────────── efektler / giriş ─────────────────────────── */
  /** Top değdi: değdiği yerde kıvılcım; ateşli topta alev, dev topta toz bulutu. */
  var impactSnd = 0;
  function fxImpact(p) {
    if (!L.f || !camInit) return;
    proj(p.tx, p.ty, p.tz);
    var k = A.clamp(PK / 40, 0.5, 1.6);
    if (p.kind === "fire") {
      A.burst(PX, PY, 7, { speed: 220 * k, gravity: -60, life: 0.45, size: 6 * k, color: ["#FF6A1F", "#FDE047", "#FFB020"] });
      A.burst(PX, PY, 3, { shape: "star", speed: 160 * k, gravity: 200, life: 0.3, size: 5 * k, color: ["#FFFFFF", "#FDE68A"] });
      if (Math.random() < 0.35) A.ring(PX, PY, "#FF8A1F", 34 * k, 5);
    } else if (p.kind === "giant") {
      A.burst(PX, PY, 26, { speed: 380 * k, gravity: 500, life: 0.7, size: 8 * k, color: ["#FDE68A", "#FFFFFF", "#86EFAC"] });
      A.ring(PX, PY, "#FACC15", 120 * k, 12);
      A.shake(7);
      if (state === "play") A.sound("thud");
    } else {
      var col = p.kind === "curve" ? ["#E9D5FF", "#FFFFFF"] : p.kind === "sack" ? ["#BBF7D0", "#FFFFFF"] : ["#FFFFFF", "#FDE68A"];
      A.burst(PX, PY, 3, { shape: "star", speed: 150 * k, gravity: 220, life: 0.3, size: 4.5 * k, color: col });
    }
    impactSnd -= 1;
    if (state === "play" && impactSnd <= 0 && p.kind !== "giant") {
      impactSnd = 6;
      A.sound("kick");
    }
  }
  /** Rakip figürü düştü: küçük toz + yıldız patlaması. */
  function fxMan(m, cause) {
    if (!L.f || !camInit || m.z < camZ + NEAR) return;
    proj(m.x, 0.8, m.z);
    var k = A.clamp(PK / 40, 0.5, 1.6);
    A.burst(PX, PY, cause === "melee" ? 3 : 5, { speed: 200 * k, gravity: 420, life: 0.45, size: 5 * k, color: [kits.f ? kits.f.p : BAD_A, "#FFFFFF", "#FDE68A"] });
  }
  var lastBossLanded = -9;
  function fxFrame(dt) {
    // sert şut düştü: toz + kıvılcım
    if (boss && boss.landed && boss.landed.at !== lastBossLanded) {
      lastBossLanded = boss.landed.at;
      proj(boss.landed.x, 0, z);
      A.burst(PX, PY, 18, { speed: 260, gravity: 500, life: 0.6, size: 6, color: ["#D9F99D", "#86EFAC", "#FFFFFF"] });
      A.burst(PX, PY - 10, 10, { shape: "star", speed: 300, gravity: 300, life: 0.45, size: 6, color: ["#FCA5A5", "#FFFFFF", "#FDBA74"] });
      A.ring(PX, PY, "#FF4D6A", 90, 10);
    }
    // koşan kadronun ayak tozu
    if (speed > 3 && !A.reduceMotion && mem.length && Math.random() < dt * 14) {
      var sd = mem[(Math.random() * mem.length) | 0];
      if (sd) proj(memX(sd), 0.05, z + sd.oz - 0.2);
      A.burst(PX, PY, 1, { angle: Math.PI / 2 + 0.6, spread: 1.4, speed: 50, gravity: -40, life: 0.4, size: Math.max(2, PK * 0.12), color: "rgba(230,255,200,0.7)" });
    }
  }

  function floatAt(text, wx, wy, Z, color, size) {
    if (L.f && camInit) {
      proj(wx, wy, Z);
      A.floatText(text, PX, PY, color, size);
    } else A.floatText(text, W / 2, H / 2, color, size);
  }

  function resize(w, h) {
    W = w;
    H = h;
    if (!segs.length) resetRun();
    L.key = "";
    layout();
  }

  /* ═══════════════════════════ ÇİZİM GİRİŞİ ═══════════════════════════ */

  function render(c, dt) {
    layout();
    refreshLooks();
    updateCam(dt);
    shownPts = shownPts < points ? Math.min(points, shownPts + Math.max(1, (points - shownPts) * 0.15)) : points;
    if (state === "attract" || points === 0) shownPts = points;
    var th = THEMES[theme % THEMES.length];
    var sk = paintSky();
    A.blit(sk, -sk.pad - A.clamp(camX * 6, -sk.pad, sk.pad), 0);
    drawGround(c, th);
    drawTarget(c);
    collect();
    drawItems(c);
    // ufuk sisi: uzak sahne gökyüzüne erir
    var fh = (H - L.hY) * 0.11;
    var fg = c.createLinearGradient(0, L.hY - 4, 0, L.hY + fh);
    fg.addColorStop(0, rgba(th.fog, 0.7));
    fg.addColorStop(1, rgba(th.fog, 0));
    c.fillStyle = fg;
    c.fillRect(0, L.hY - 4, W, fh + 4);
    fxFrame(dt);
    drawWorldLabels(c);
    A.drawParticles(c);
    A.drawFloaters(c, dt);
    if (state !== "attract") drawHud(c);
    A.drawBanner(c, W, L.wide ? H * 0.42 : Math.max(160, H * 0.24), dt);
    if (flashRed > 0) {
      c.fillStyle = "rgba(255,77,106," + (0.26 * flashRed).toFixed(3) + ")";
      c.fillRect(0, 0, W, H);
    }
  }

  function debug() {
    return {
      state: state, z: z, x: x, n: n, maxN: maxN, level: level, points: points, goals: goals, cleared: cleared, speed: speed,
      segs: segs, boss: boss, gl: false, captain: captain.short, rival: rivalAt(level).team.name,
      pickups: pickups, weapon: weapon, giant: giant, boostT: boostT, picked: picked, shots: shots,
      members: mem.length, fallen: fallen.length, impacts: impacts, lostTotal: lostTotal, fallenTotal: fallenTotal, lastWhy: lastWhy,
      give: function (type) { collectPower({ type: type, x: x, z: z, id: 0 }); },
      setTarget: function (v) { target = v; },
      setZ: function (v) { z = v; },
      setN: function (v) { gain(v); },
      apply: apply,
    };
  }

  A.register({ resize: resize, start: start, update: update, render: render, down: down, move: move, up: up, debug: debug, setRoster: setRoster });
})();
