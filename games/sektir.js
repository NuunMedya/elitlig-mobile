/*
 * TOP SEKTİR — FLAPPY FUTBOL (2B vektör çizim). Top stadyum boyunca
 * kendiliğinden ilerler; ekrana her dokunuşta havalanır. Önüne çıkan
 * BARAJLARIN (rakip savunmacılardan kule) üstünden, TERS ASILI KALELERİN
 * altından geç: aradaki boşluktan her geçiş bir GOL. Top çime, baraja ya da
 * direğe değerse tur biter.
 *
 * MİMARİ: simülasyon dünya koordinatlarında (metre; x ileri, y yukarı) ve
 * çizimden bağımsızdır; başsız testler (scripts/check-games.mjs) yalnız onu
 * koşturur. Çizim düz Canvas 2D'dir (Savunma Hattı ile aynı aile): koyu
 * lacivert konturlu, doygun renkli "flat vector" çizgi film. Yandan görünüş:
 * kamera topu izler; arkada gece şehri, ay ve tribün PARALAKS katmanlar
 * halinde akar (her katman ekran dışı bir karoya bir kez çizilir), önde
 * biçme bantlı parlak çim, üstte projektörlü stadyum çatısı (tavan).
 *
 * GERÇEK İÇERİK (RN'den {type:"config", roster:{juggler, rivals}}):
 *   · Topu seçilen gerçek oyuncu başlama vuruşuyla havalandırır (forma,
 *     soyadı, numara). Kontrol TAM ORTA penceresini ±%15, denge yerçekimini
 *     ±%4 değiştirir.
 *   · BARAJLAR ligin gerçek oyuncularıdır (kulüp formasıyla, adı üstünde).
 *   · GEÇTİĞİN OYUNCULAR: gol sayın ligin oyuncularının sezon gol + asist
 *     sayısını geçtikçe onları geride bırakırsın; sıradaki hedef HUD'da.
 *
 * MEKANİZMA:
 *   · Dokun → top her seferinde ~0,62 m yukarı sıçrar (kural, şans değil).
 *     Başlamak için ilk dokunuş.
 *   · Boşluğun tam ortasından geçiş "TAM ORTA": kombo büyür, her 5 tam ortada
 *     çarpan bir artar (en çok ×5). Gol 10 × çarpan (+5 tam orta).
 *   · ALTIN YILDIZ: boşluklarda ya da aralarda; +5.
 *   · ALTIN KRAMPON: nadiren yolda; bir çarpışmayı affeder (kalkan).
 *   · Tavan açıktır: tribün çatısına çarpan top aşağı döner, tur bitmez.
 *
 * GİDEREK ZORLAŞIR (her 10 golde bir seviye; ilk ~60 golde doyar):
 *   · Top hızlanır (3,1 → 4,6 m/sn), boşluk daralır (2,25 → 1,65 m),
 *     kapılar sıklaşır, yerçekimi artar.
 *   · Seviye 3: BARAJ ZIPLAR — top yaklaşınca en üstteki savunmacı sıçrar.
 *   · Seviye 5: kayan kapılar — baraj ve kale birlikte yukarı aşağı oynar.
 *
 * Skor = puan. Rekor tablosu bu puanı sıralar.
 */
(function () {
  "use strict";
  var A = window.Arena;
  var P = A.PAL;
  // Yuvarlak, kalın oyun yazısı (Savunma Hattı ile aynı); yoksa sistem fontu.
  A.FONT = '"SF Pro Rounded", ui-rounded, "Nunito", "Arial Rounded MT Bold", -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif';

  /* ─────────────── kadro ─────────────── */
  var DEFAULT_JUGGLER = {
    id: 0,
    short: "ElitLig",
    back: "ELİTLİG",
    shirt: 10,
    team: { name: "ElitLig", kit: { primary: "#5B3DF5", secondary: "#FFFFFF" } },
    attrs: { agility: 78, control: 78 },
  };
  var FALLBACK_WALL = [
    { id: -1, short: "H. Demir", name: "Hakan Demir", shirt: 4, team: { name: "Bornova Spor", kit: { primary: "#DC2626", secondary: "#FFFFFF" } } },
    { id: -2, short: "S. Kaya", name: "Serkan Kaya", shirt: 5, team: { name: "Buca Yıldız", kit: { primary: "#FACC15", secondary: "#1E3A8A" } } },
    { id: -3, short: "O. Şahin", name: "Onur Şahin", shirt: 3, team: { name: "Karşıyaka Gençlik", kit: { primary: "#16A34A", secondary: "#DC2626" } } },
    { id: -4, short: "M. Çelik", name: "Murat Çelik", shirt: 6, team: { name: "Altay Gücü", kit: { primary: "#111827", secondary: "#FFFFFF" } } },
  ];
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
    bgKey = ""; // fon (taraftar renkleri, panolar) yeniden çizilir
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
  /** Barajdaki savunmacı: ligin oyuncuları sırayla (kadro yoksa örnek kulüpler). */
  function wallPerson(i) {
    var list = rivals.length ? rivals : FALLBACK_WALL;
    return list[((i % list.length) + list.length) % list.length];
  }

  /* ─────────────── dünya (metre) ─────────────── */
  var BR = 0.26; // top yarıçapı (sahne topu, okunurluk için iri)
  var TOP = 6.6; // tavan (tribün çatısı hizası)
  var GATE_HW = 0.36; // baraj / kale yarı genişliği
  var GOALS_PER_LEVEL = 10;
  var START_X = 0;

  var W = 390, H = 640;

  /* ─────────────── durum ─────────────── */
  var state = "attract"; // attract | ready | play | dying | over
  var stateT = 0;
  var ball = { x: START_X, y: 3, vy: 0, rot: 0 };
  var gates = [], stars = [], boots = [];
  var nextGateX = 0, gateCount = 0, lastGc = 3;
  var goals = 0, points = 0, combo = 0, bestCombo = 0, level = 1, starCount = 0, taps = 0;
  var shield = 0, invuln = 0;
  var scoreBump = 0, flash = 0, deathT = 0, deathKind = "";
  var passedLine = null;
  var kickT = -9; // başlama vuruşu anı (çizim)
  var uid = 0;

  function diff() {
    return 1 - Math.exp(-goals / 30);
  }
  function gapSize() {
    return 2.25 - 0.6 * diff();
  }
  function spacing() {
    return 3.3 - 0.55 * diff();
  }
  function runSpeed() {
    return 3.1 + 1.5 * diff();
  }
  function gravity() {
    return (14 + 3 * diff()) * (1 - 0.04 * attr("agility"));
  }
  /** Her dokunuşta aynı sıçrama: tepe ~0,62 m yukarıda (boşluğun üçte biri kadar). */
  var FLAP_RISE = 0.62;
  function flapV() {
    return Math.sqrt(2 * gravity() * FLAP_RISE);
  }
  function multiplier() {
    return Math.min(5, 1 + Math.floor(combo / 5));
  }

  /* ─────────────── kapı üretimi ─────────────── */

  function levelAt(n) {
    return 1 + Math.floor(n / GOALS_PER_LEVEL);
  }
  function spawnGate() {
    var lvl = levelAt(gateCount);
    var jumper = lvl >= 3 && Math.random() < Math.min(0.7, 0.35 + (lvl - 3) * 0.1);
    var moving = lvl >= 5 && Math.random() < Math.min(0.6, 0.3 + (lvl - 5) * 0.08);
    var gap = gapSize() + (jumper ? 0.28 : 0) + (moving ? 0.12 : 0);
    var amp = moving ? 0.45 : 0;
    var lo = 1.2 + gap / 2 + amp, hi = TOP - 0.8 - gap / 2 - amp;
    // Adil kapı: iki boşluk arasındaki yükseklik farkı, topun aradaki mesafede
    // dokunuşlarla gerçekten tırmanabileceğinden büyük olmaz (inişte de: son
    // dokunuştan sonra top önce yükselir).
    var sp = spacing() * 0.95;
    var reachT = Math.max(0.2, (sp - 2 * GATE_HW - 2 * BR) / runSpeed());
    var climb = ((FLAP_RISE * gravity()) / flapV()) * reachT * 0.8;
    var up = Math.min(1.4 + 1.2 * diff(), climb), down = Math.min(1.6 + 1.2 * diff(), climb * 1.15);
    var gc = gateCount < 2 ? 3.1 : A.clamp(lastGc + A.rand(-down, up), lo, hi);
    lastGc = gc;
    var g = {
      id: ++uid,
      x: nextGateX,
      gc: gc,
      gap: gap,
      off: 0,
      amp: amp,
      phase: Math.random() * Math.PI * 2,
      jumper: jumper,
      jumpAt: -9,
      passed: false,
      hit: null,
      hitAt: 0,
      netAt: -9,
      wall: gateCount * 3,
    };
    gates.push(g);
    // yıldız: üç kapıda bir boşlukta, arada bir iki kapı arasında
    if (gateCount % 3 === 2) stars.push({ id: ++uid, x: g.x, y: gc + A.rand(-0.25, 0.25) * gap, taken: false, at: 0 });
    else if (gateCount % 4 === 1 && gates.length > 1) {
      var pv = gates[gates.length - 2];
      stars.push({ id: ++uid, x: (pv.x + g.x) / 2, y: (pv.gc + gc) / 2, taken: false, at: 0 });
    }
    // altın krampon: kalkan yoksa ara sıra
    if (gateCount > 6 && gateCount % 13 === 6 && gates.length > 1) {
      var pb = gates[gates.length - 2];
      boots.push({ id: ++uid, x: (pb.x + g.x) / 2, y: (pb.gc + gc) / 2 + 0.2, taken: false, at: 0 });
    }
    gateCount += 1;
    nextGateX += spacing() * A.rand(0.95, 1.08);
  }
  /** Baraj yüksekliği (zıplama ve kayma dahil). */
  function jumpH(g) {
    if (!g.jumper) return 0;
    var t = (A.time - g.jumpAt) / 0.6;
    return t > 0 && t < 1 ? 0.34 * Math.sin(Math.PI * t) : 0;
  }
  function wallTop(g) {
    return g.gc + g.off - g.gap / 2 + jumpH(g);
  }
  function goalBottom(g) {
    return g.gc + g.off + g.gap / 2;
  }

  function resetWorld() {
    ball = { x: START_X, y: 3, vy: 0, rot: 0 };
    gates = [];
    stars = [];
    boots = [];
    nextGateX = START_X + 6.5;
    gateCount = 0;
    lastGc = 3.1;
    while (nextGateX < ball.x + 16) spawnGate();
  }

  /* ─────────────── akış ─────────────── */

  function resize(w, h) {
    W = w;
    H = h;
    if (!gates.length) resetWorld();
    layout();
  }

  function setState(s) {
    state = s;
    stateT = 0;
  }

  function start() {
    goals = 0;
    points = 0;
    combo = 0;
    bestCombo = 0;
    level = 1;
    starCount = 0;
    taps = 0;
    shield = 0;
    invuln = 0;
    passedRivals = 0;
    passedLine = null;
    A.particles.length = 0;
    A.floaters.length = 0;
    A.banner = null;
    resetWorld();
    setState("ready");
    A.sound("whistle");
    A.announce("TOP SEKTİR!", "Dokun: top havalansın · barajı aş");
  }

  /** İlk dokunuş: başlama vuruşu — oyun başlar. */
  function kickoff() {
    setState("play");
    kickT = A.time;
    flap();
  }

  function flap() {
    ball.vy = flapV();
    taps += 1;
    A.sound("kick");
    A.haptic("light");
    // çizim: vuruş anı (top basılır, altında yay + kıvılcım)
    kickFx = A.time;
    var p = screenOf(ball.x, ball.y - BR, 0);
    A.burst(p.x, p.y, 8, { angle: Math.PI / 2, spread: 1.4, speed: 160, gravity: 300, life: 0.4, size: 3, color: ["#FFFFFF", "#CFE8D6", P.gold], shape: "spark" });
  }

  function scoreGate(g) {
    g.passed = true;
    g.netAt = A.time;
    goals += 1;
    var center = Math.abs(ball.y - (g.gc + g.off)) < g.gap * 0.17 * (1 + 0.15 * attr("control"));
    if (center) {
      combo += 1;
      bestCombo = Math.max(bestCombo, combo);
    } else combo = 0;
    var mult = multiplier();
    var gain = 10 * mult + (center ? 5 : 0);
    points += gain;
    scoreBump = 1;
    var sp = screenOf(ball.x, ball.y + 0.6, 0);
    A.floatText((center ? "TAM ORTA +" : "GOL +") + gain, sp.x, sp.y, center ? P.gold : "#FFFFFF", center ? 22 : 19);
    if (center && combo % 5 === 0) {
      A.floatText("ÇARPAN ×" + multiplier(), W / 2, H * 0.36, P.gold, 24);
      A.sound("level");
      flash = 1;
    } else A.sound("net");
    A.haptic(center ? "medium" : "light");
    // geçtiğin oyuncular
    var rv = nextRival();
    if (rv && goals >= rv.value) {
      passedRivals += 1;
      points += 15;
      passedLine = { text: rv.short + " geçildi · " + rv.value + " gol+asist", age: 0, kit: kitOf(rv) };
      A.sound("coin");
      A.haptic("success");
      bgKey = "";
    }
    var nl = levelAt(goals);
    if (nl > level) {
      level = nl;
      var sub = "Top hızlanıyor, boşluk daralıyor";
      if (level === 3) sub = "Baraj zıplıyor — erken yüksel";
      else if (level === 5) sub = "Kapılar kayıyor";
      A.announce("SEVİYE " + level, sub);
      A.sound("level");
      A.haptic("success");
      flash = 1;
    }
  }

  function crash(kind, g) {
    if (invuln > 0) return;
    if (shield > 0) {
      // ALTIN KRAMPON kalkanı: çarpışma affedilir
      shield = 0;
      invuln = 1.1;
      flash = 1;
      if (g) {
        g.hit = kind;
        g.hitAt = A.time;
      }
      ball.vy = kind === "direk" ? -2 : flapV();
      A.sound("post");
      A.shake(6);
      A.haptic("medium");
      var sp = screenOf(ball.x, ball.y + 0.5, 0);
      A.floatText("KALKAN!", sp.x, sp.y, P.gold, 22);
      return;
    }
    if (g) {
      g.hit = kind;
      g.hitAt = A.time;
    }
    deathKind = kind;
    setState("dying");
    deathT = 0;
    combo = 0;
    ball.vy = Math.min(ball.vy, kind === "direk" ? -1.5 : 1.5);
    A.sound(kind === "direk" ? "post" : kind === "yer" ? "groan" : "crash");
    A.haptic("error");
    A.shake(9);
    var cp = screenOf(ball.x, ball.y, 0);
    A.burst(cp.x, cp.y, 16, { speed: 260, gravity: 500, life: 0.6, size: 4, color: ["#FFFFFF", "#FF4D6A", "#FFD43B"], shape: kind === "direk" ? "star" : "dot" });
  }

  /* ─────────────── güncelleme ─────────────── */

  function update(dt) {
    stateT += dt;
    scoreBump = Math.max(0, scoreBump - dt * 4);
    flash = Math.max(0, flash - dt * 1.8);
    invuln = Math.max(0, invuln - dt);
    if (passedLine) {
      passedLine.age += dt;
      if (passedLine.age > 2.4) passedLine = null;
    }

    if (state === "over") return;
    if (state === "ready") {
      // başlama noktasında süzülür
      ball.y = 3 + Math.sin(A.time * 3) * 0.12;
      ball.vy = 0;
      ball.rot += dt * 1.5;
      return;
    }

    var playing = state === "play";
    var g0 = gravity();
    if (state !== "dying") ball.x += (state === "attract" ? 3.2 : runSpeed()) * dt;
    else ball.x += Math.max(0, 1.2 - deathT) * dt;
    ball.vy -= g0 * dt;
    ball.y += ball.vy * dt;
    ball.rot += (state === "dying" ? 2 : 6) * dt;

    // tavan: çatıdan seker
    if (ball.y > TOP - BR) {
      if (ball.vy > 1) bumpFx = A.time; // çizim: çatıya çarpan top ezilir
      ball.y = TOP - BR;
      ball.vy = Math.min(ball.vy, -0.5);
    }
    // zemin
    if (ball.y < BR) {
      ball.y = BR;
      if (playing) crash("yer", null);
      else if (state === "attract") {
        ball.vy = flapV();
      } else {
        ball.vy = Math.abs(ball.vy) > 1.2 ? -ball.vy * 0.45 : 0;
      }
    }

    // vitrin: yapay oyuncu sıradaki boşluğa göre dokunur
    if (state === "attract") {
      var ng = null;
      for (var i = 0; i < gates.length; i++)
        if (gates[i].x + GATE_HW > ball.x - BR) {
          ng = gates[i];
          break;
        }
      var want = ng ? ng.gc + ng.off - ng.gap * 0.2 : 3;
      if (ball.vy < 0.5 && ball.y < want) ball.vy = flapV();
    }

    // kapılar
    for (var k = 0; k < gates.length; k++) {
      var g = gates[k];
      if (g.amp) g.off = Math.sin(A.time * 1.5 + g.phase) * g.amp;
      if (g.jumper && g.jumpAt < 0 && g.x - ball.x < 1.7 && g.x > ball.x) g.jumpAt = A.time;
      if (state === "attract" || state === "dying") {
        if (!g.passed && ball.x > g.x + GATE_HW) g.passed = true;
        continue;
      }
      if (!playing) continue;
      var dxg = Math.abs(ball.x - g.x);
      if (dxg < GATE_HW + BR) {
        // daire–dikdörtgen: dikdörtgenin en yakın noktası
        var nx = A.clamp(ball.x, g.x - GATE_HW, g.x + GATE_HW);
        var wt = wallTop(g), gb = goalBottom(g);
        var ny1 = Math.min(ball.y, wt);
        if (Math.hypot(ball.x - nx, ball.y - ny1) < BR * 0.92) crash("baraj", g);
        else {
          var ny2 = Math.max(ball.y, gb);
          if (Math.hypot(ball.x - nx, ball.y - ny2) < BR * 0.92) crash("direk", g);
        }
        if (state !== "play") break;
      }
      if (!g.passed && ball.x > g.x + GATE_HW) scoreGate(g);
    }

    // yıldızlar ve krampon
    if (playing) {
      stars.forEach(function (s) {
        if (!s.taken && Math.hypot(ball.x - s.x, ball.y - s.y) < BR + 0.28) {
          s.taken = true;
          s.at = A.time;
          starCount += 1;
          points += 5;
          scoreBump = 0.7;
          A.sound("coin");
          var sp = screenOf(s.x, s.y, 0);
          A.burst(sp.x, sp.y, 12, { speed: 180, gravity: 120, life: 0.5, size: 3, color: [P.gold, "#FFF"], shape: "spark" });
          A.fly(sp.x, sp.y);
        }
      });
      boots.forEach(function (b) {
        if (!b.taken && Math.hypot(ball.x - b.x, ball.y - b.y) < BR + 0.32) {
          b.taken = true;
          b.at = A.time;
          shield = 1;
          A.sound("level");
          A.haptic("success");
          var sp = screenOf(b.x, b.y + 0.4, 0);
          A.floatText("ALTIN KRAMPON · KALKAN", sp.x, sp.y, P.gold, 18);
        }
      });
    }

    if (state === "dying") {
      deathT += dt;
      if (deathT > 1.3) {
        setState("over");
        A.sound("over");
        A.send("over", {
          score: points,
          stats: { goals: goals, level: level, bestCombo: bestCombo, stars: starCount, passed: passedRivals, rivals: rivals.length, taps: taps },
        });
      }
    }

    // temizlik ve üretim
    var cut = ball.x - 8;
    gates = gates.filter(function (o) {
      return o.x > cut;
    });
    stars = stars.filter(function (o) {
      return o.x > cut;
    });
    boots = boots.filter(function (o) {
      return o.x > cut;
    });
    while (nextGateX < ball.x + 16) spawnGate();
    if (state === "attract" && ball.x > 4000) resetWorld();
  }

  /* ─────────────── girdi ─────────────── */

  function down() {
    if (state === "ready") {
      kickoff();
      return;
    }
    if (state === "play") flap();
  }

  /* ═══════════════════════════ 2B ÇİZİM ═══════════════════════════ */

  /* ── renkler (Savunma Hattı paleti) ── */
  var NAVY = "#1B1648"; // kontur
  var INK = "#141043";
  var GOLD = "#FFD43B", GOLD_D = "#F08C00";
  var GOOD = "#22C55E", BAD = "#FF4D6A";

  function rgbOf(h) {
    var n = parseInt(h.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function hex(c, fb) {
    if (typeof c !== "string") return fb;
    if (/^#[0-9a-f]{6}$/i.test(c)) return c.toUpperCase();
    if (/^#[0-9a-f]{3}$/i.test(c)) return ("#" + c[1] + c[1] + c[2] + c[2] + c[3] + c[3]).toUpperCase();
    return fb;
  }
  /** İki hex rengi karıştırır, hex döndürür (zincirlenebilir). */
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
  /** Kişinin forması {p, s} (geçerli hex'e çevrilmiş). */
  function kitP(person) {
    var k = kitOf(person);
    var p = hex(k.primary, "#5B3DF5"), s = hex(k.secondary, "#FFFFFF");
    if (p === s) s = p === "#FFFFFF" ? NAVY : "#FFFFFF";
    return { p: p, s: s };
  }
  function lookOf(person) {
    var id = Math.abs(Number(person && person.id) || 0);
    var nm = String((person && (person.short || person.name)) || "");
    for (var i = 0; i < nm.length; i++) id = (id * 31 + nm.charCodeAt(i)) % 9973;
    return id;
  }

  /* ── yerleşim: dünya (m) → ekran (px) ── */
  var L = { k: 60, gy: 500, ceil: 80, far: 470, wide: false, anchor: 0.3 };
  var camX = 0, anchor = 0.4;
  var kickFx = -9, bumpFx = -9, lastVy = 0, landFx = -9;
  var bgKey = "";
  var shownPts = 0;
  var trail = [];

  function layout() {
    var wide = W > H * 1.15;
    var grassH = A.clamp(H * 0.12, 44, 96);
    var gy = H - grassH;
    var hud = wide ? 50 : 92;
    var k = Math.max(20, (gy - hud) / TOP);
    L.wide = wide;
    L.k = k;
    L.gy = gy;
    L.ceil = gy - TOP * k;
    L.far = gy - 0.38 * k;
    L.boardTop = L.far - 0.34 * k;
    L.standTop = L.boardTop - 1.25 * k;
    L.ballR = BR * k * (wide ? 1.12 : 1.04);
    bgKey = "";
  }
  function wx(x) {
    return W * anchor + (x - camX) * L.k;
  }
  function wy(y) {
    return L.gy - y * L.k;
  }
  /** Dünya noktası → ekran (parçacıklar, yazılar). s: metre başına piksel. */
  function screenOf(x, y) {
    return { x: wx(x), y: wy(y), s: L.k };
  }

  /* ═══════════════ FON: gökyüzü, şehir, tribün, çatı (karolar) ═══════════════ */

  var LY = { sky: null, city: null, stand: null, roof: null, glow: null };

  function paintLayers() {
    var key = W + "x" + H + ":" + rosterSig + ":" + passedRivals;
    if (bgKey === key && LY.sky) return;
    bgKey = key;
    var mine = kitP(juggler), nr = nextRival(), rk = nr ? kitP(nr) : { p: "#E11D48", s: "#FFFFFF" };
    var k = L.k, ceil = L.ceil, far = L.far, rnd = A.seeded(4242);

    /* gökyüzü (sabit): mor gece, yıldızlar, ay */
    var sky = (LY.sky = A.layer(W, H));
    var c = sky.ctx;
    var g = c.createLinearGradient(0, ceil, 0, far);
    g.addColorStop(0, "#15114A");
    g.addColorStop(0.5, "#2A1C6E");
    g.addColorStop(1, "#6A2E92");
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
    c.fillStyle = "#FFFFFF";
    for (var i = 0; i < 40; i++) {
      c.globalAlpha = 0.3 + rnd() * 0.55;
      c.beginPath();
      c.arc(rnd() * W, ceil + rnd() * (L.standTop - ceil) * 0.6, rnd() < 0.2 ? 1.8 : 1.1, 0, Math.PI * 2);
      c.fill();
    }
    c.globalAlpha = 1;
    var mr = A.clamp(Math.min(W, L.standTop - ceil) * 0.17, 22, 70), mx = W * (L.wide ? 0.8 : 0.74), my = ceil + mr * 1.9;
    var mg = c.createRadialGradient(mx, my, mr * 0.8, mx, my, mr * 2.4);
    mg.addColorStop(0, "rgba(255,225,150,0.30)");
    mg.addColorStop(1, "rgba(255,225,150,0)");
    c.fillStyle = mg;
    c.fillRect(mx - mr * 2.5, my - mr * 2.5, mr * 5, mr * 5);
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

    /* şehir (karo, yavaş akar): üç kat bina, yanan pencereler, projektör kulesi */
    var cityH = Math.max(20, L.standTop - ceil);
    var TW = Math.max(640, Math.ceil(W / 160) * 160);
    var city = (LY.city = A.layer(TW, cityH));
    c = city.ctx;
    function buildings(color, cap, hMin, hMax, wMin, wMax, lit, seed) {
      var r2 = A.seeded(seed);
      var x = 0;
      while (x < TW - wMin * 0.5) {
        var bw = wMin + r2() * (wMax - wMin);
        var bh = (hMin + r2() * (hMax - hMin)) * cityH;
        var by = cityH - bh;
        var wins = [];
        var ww = Math.max(5, bw * 0.14), wh = ww * 1.25, gx = ww * 0.9, gyy = wh * 0.75;
        for (var wy2 = by + 10; wy2 < cityH - wh - 4; wy2 += wh + gyy)
          for (var wx2 = ww * 0.8; wx2 < bw - ww * 1.6; wx2 += ww + gx) wins.push([wx2, wy2, r2() < lit]);
        [x, x - TW].forEach(function (bx) {
          if (bx + bw < 0) return;
          c.fillStyle = color;
          c.fillRect(bx, by, bw, bh + 2);
          c.fillStyle = cap;
          c.fillRect(bx - 3, by - 5, bw + 6, 7);
          c.fillStyle = rgba(NAVY, 0.25);
          c.fillRect(bx + bw * 0.88, by, bw * 0.12, bh);
          wins.forEach(function (w) {
            c.fillStyle = w[2] ? "#FFD98A" : rgba(NAVY, 0.45);
            A.roundRect(c, bx + w[0], w[1], ww, wh, 1.5);
            c.fill();
          });
        });
        x += bw + 4 + r2() * 14;
      }
    }
    buildings("#3A2A80", "#2C2068", 0.5, 0.85, 46, 86, 0.25, 7);
    buildings("#4B3399", "#33267A", 0.28, 0.6, 40, 70, 0.45, 19);
    buildings("#2E3A8F", "#232C70", 0.14, 0.36, 50, 90, 0.5, 31);

    /* tribün + LED panolar (karo, orta hızda akar) */
    var sH = Math.max(10, far - L.standTop);
    var SW = 1024;
    var st = (LY.stand = A.layer(SW, sH));
    c = st.ctx;
    var bTop = L.boardTop - L.standTop, bH = far - L.boardTop;
    var sg = c.createLinearGradient(0, 0, 0, bTop);
    sg.addColorStop(0, "#2B2272");
    sg.addColorStop(1, "#1A1450");
    c.fillStyle = sg;
    c.fillRect(0, 0, SW, bTop);
    c.fillStyle = "#3A2F8F";
    c.fillRect(0, 0, SW, 3);
    // basamak çizgileri
    var rows = 3, rh = bTop / (rows + 0.4);
    for (var r = 1; r <= rows; r++) {
      c.fillStyle = "rgba(10,8,40,0.35)";
      c.fillRect(0, r * rh + 2, SW, 2);
    }
    // taraftarlar: soldan sağa iki takımın renkleri bloklar halinde
    var cols = [mine.p, mine.s, rk.p, rk.s];
    var hr = A.clamp(rh * 0.26, 2.4, 7);
    var rr3 = A.seeded(77);
    for (var row = 0; row < rows; row++) {
      var yy = (row + 0.8) * rh;
      for (var xx = hr * 1.4 + (row % 2) * hr * 1.6; xx < SW - hr; xx += hr * 3.3) {
        var side = Math.floor(xx / 256) % 2; // 256 px'lik bloklar (karo dikişsiz)
        var col = cols[side * 2 + (rr3() < 0.3 ? 1 : 0)];
        var up = rr3() < 0.18;
        c.fillStyle = col;
        c.beginPath();
        c.ellipse(xx, yy + hr * 1.6, hr * 1.35, hr * 1.1, 0, Math.PI, Math.PI * 2);
        c.fill();
        c.fillStyle = ["#F6C9A4", "#E9B08A", "#C98D63", "#8E5B3C"][Math.floor(rr3() * 4)];
        c.beginPath();
        c.arc(xx, yy, hr, 0, Math.PI * 2);
        c.fill();
        if (up) {
          // kollar havada
          c.strokeStyle = col;
          c.lineWidth = hr * 0.6;
          c.lineCap = "round";
          c.beginPath();
          c.moveTo(xx - hr, yy + hr);
          c.lineTo(xx - hr * 1.5, yy - hr * 1.4);
          c.moveTo(xx + hr, yy + hr);
          c.lineTo(xx + hr * 1.5, yy - hr * 1.4);
          c.stroke();
        }
      }
    }
    // korkuluk
    c.fillStyle = "#3A2F8F";
    c.fillRect(0, bTop - 4, SW, 4);
    // LED panolar
    var segW = 256;
    var texts = ["ELİTLİG", "TOP SEKTİR", "ELİTLİG", String(juggler.short || "ELİTLİG").toLocaleUpperCase("tr-TR")];
    for (var si = 0; si < SW / segW; si++) {
      var bx = si * segW;
      var pg = c.createLinearGradient(bx, 0, bx + segW, 0);
      pg.addColorStop(0, si % 2 ? "#7C3AED" : "#DB2777");
      pg.addColorStop(1, si % 2 ? "#4F46E5" : "#9333EA");
      c.fillStyle = pg;
      c.fillRect(bx, bTop, segW - 3, bH);
      c.fillStyle = "rgba(255,255,255,0.18)";
      c.fillRect(bx, bTop, segW - 3, Math.max(1.5, bH * 0.12));
      c.fillStyle = "#FFFFFF";
      c.font = A.font(bH * 0.56, 900);
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillText(texts[si % texts.length], bx + segW / 2, bTop + bH * 0.55);
    }
    c.fillStyle = NAVY;
    c.fillRect(0, sH - 2, SW, 2);

    /* çatı (karo, dünya hızında akar): çelik kiriş, makas, projektörler + ışık konileri */
    var RW = 640, rH = Math.ceil(ceil + k * 1.1);
    var roof = (LY.roof = A.layer(RW, rH));
    c = roof.ctx;
    var beamH = Math.max(9, k * 0.16);
    var rg = c.createLinearGradient(0, 0, 0, ceil);
    rg.addColorStop(0, "#0F0B33");
    rg.addColorStop(1, "#231C66");
    c.fillStyle = rg;
    c.fillRect(0, 0, RW, ceil);
    // makas (zikzak çelik)
    c.strokeStyle = "#3A3196";
    c.lineWidth = 3;
    c.lineJoin = "round";
    var tTop = Math.max(4, ceil - beamH - k * 0.55);
    c.beginPath();
    for (var tx = 0; tx <= RW; tx += 40) {
      c.lineTo(tx, tx % 80 ? tTop : ceil - beamH);
    }
    c.stroke();
    c.fillStyle = "#3A3196";
    c.fillRect(0, tTop - 3, RW, 4);
    // ana kiriş
    c.fillStyle = "#4A3FB0";
    c.fillRect(0, ceil - beamH, RW, beamH);
    c.fillStyle = "rgba(255,255,255,0.22)";
    c.fillRect(0, ceil - beamH, RW, 2);
    c.fillStyle = NAVY;
    c.fillRect(0, ceil - 2.5, RW, 2.5);
    for (var bolt = 10; bolt < RW; bolt += 20) {
      c.fillStyle = "rgba(20,16,67,0.55)";
      c.beginPath();
      c.arc(bolt, ceil - beamH / 2, 1.6, 0, Math.PI * 2);
      c.fill();
    }
    // projektörler (160 px'de bir) + aşağı ışık konisi
    for (var lx = 80; lx < RW; lx += 160) {
      var cone = c.createLinearGradient(0, ceil, 0, rH);
      cone.addColorStop(0, "rgba(255,246,208,0.16)");
      cone.addColorStop(1, "rgba(255,246,208,0)");
      c.fillStyle = cone;
      c.beginPath();
      c.moveTo(lx - 12, ceil);
      c.lineTo(lx + 12, ceil);
      c.lineTo(lx + 60, rH);
      c.lineTo(lx - 60, rH);
      c.closePath();
      c.fill();
      var lg2 = c.createRadialGradient(lx, ceil, 1, lx, ceil, 26);
      lg2.addColorStop(0, "rgba(255,250,220,0.85)");
      lg2.addColorStop(1, "rgba(255,250,220,0)");
      c.fillStyle = lg2;
      c.fillRect(lx - 26, ceil - 26, 52, 52);
      c.fillStyle = "#2B2268";
      A.roundRect(c, lx - 13, ceil - beamH - 2, 26, beamH + 4, 4);
      c.fill();
      c.lineWidth = 2;
      c.strokeStyle = NAVY;
      c.stroke();
      c.fillStyle = "#FFF6D0";
      for (var lb = 0; lb < 3; lb++) {
        c.beginPath();
        c.arc(lx - 7 + lb * 7, ceil - beamH / 2 + 1, Math.max(2, beamH * 0.22), 0, Math.PI * 2);
        c.fill();
      }
    }

    /* topun yumuşak ışık halesi (bir kez) */
    var gr = Math.ceil(L.ballR * 3.2);
    var glow = (LY.glow = A.layer(gr * 2, gr * 2));
    c = glow.ctx;
    var hg = c.createRadialGradient(gr, gr, 0, gr, gr, gr);
    hg.addColorStop(0, "rgba(255,255,255,0.55)");
    hg.addColorStop(0.35, "rgba(255,240,200,0.22)");
    hg.addColorStop(1, "rgba(255,240,200,0)");
    c.fillStyle = hg;
    c.fillRect(0, 0, gr * 2, gr * 2);
  }

  /** Karo katmanı yatayda tekrarlayarak çizer (paralaks: f = kamera hızına oran). */
  function tile(lay, f, y) {
    var w = lay.w;
    var off = -((((camX * L.k * f) % w) + w) % w);
    for (var x = off; x < W; x += w) A.blit(lay, x, y);
  }

  /** Çim: biçme bantları perspektifle (uzakta dar, önde geniş) akar. */
  function drawGrass(c) {
    var far = L.far, gy = L.gy, k = L.k;
    c.fillStyle = "#3DB54B";
    c.fillRect(0, far, W, H - far);
    var depth = Math.max(1, gy - far);
    function fx(y) {
      return 1 + ((y - gy) / depth) * 0.15;
    }
    var fF = fx(far), fN = fx(H);
    var mid = camX + (W / 2 - W * anchor) / k; // ekranın ortasındaki dünya x
    var SP = 1.5;
    var span = W / (k * Math.min(fF, fN)) / 2 + SP * 2;
    var i0 = Math.floor((mid - span) / SP), i1 = Math.ceil((mid + span) / SP);
    for (var i = i0; i < i1; i++) {
      if (i % 2) continue;
      var x0 = i * SP, x1 = x0 + SP;
      c.fillStyle = "#4CC757";
      c.beginPath();
      c.moveTo(W / 2 + (x0 - mid) * k * fF, far);
      c.lineTo(W / 2 + (x1 - mid) * k * fF, far);
      c.lineTo(W / 2 + (x1 - mid) * k * fN, H);
      c.lineTo(W / 2 + (x0 - mid) * k * fN, H);
      c.closePath();
      c.fill();
    }
    // uzak kenar çizgisi + ışıltı
    c.fillStyle = "rgba(255,255,255,0.92)";
    c.fillRect(0, far + 3, W, Math.max(2, k * 0.04));
    c.fillStyle = "rgba(255,255,255,0.12)";
    c.fillRect(0, far, W, 3);
    // ön kenar: koyulaşan zemin (derinlik)
    var ng = c.createLinearGradient(0, gy + 6, 0, H);
    ng.addColorStop(0, "rgba(20,60,30,0)");
    ng.addColorStop(1, "rgba(20,60,30,0.32)");
    c.fillStyle = ng;
    c.fillRect(0, gy + 6, W, H - gy);
  }

  /* ═══════════════ KARAKTERLER ═══════════════ */

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
  /** Dirsekli kol/bacak: iki parça, konturlu. */
  function limb2(c, x1, y1, xm, ym, x2, y2, w, col, lw) {
    c.strokeStyle = NAVY;
    c.lineWidth = w + lw * 2;
    c.beginPath();
    c.moveTo(x1, y1);
    c.lineTo(xm, ym);
    c.lineTo(x2, y2);
    c.stroke();
    c.strokeStyle = col;
    c.lineWidth = w;
    c.beginPath();
    c.moveTo(x1, y1);
    c.lineTo(xm, ym);
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
   * Yandan çizgi film futbolcu (sağa bakar). Ayakları (x, y)'de, boyu ~45·s.
   * o: kit{p,s}, pose (ready | kick | cheer), t, look.
   */
  function drawPlayer(c, x, y, s, o) {
    var t = o.t || 0, pose = o.pose || "ready";
    var kit = o.kit;
    var skin = SKINS[(o.look || 0) % SKINS.length], hair = HAIRS[(o.look || 0) % HAIRS.length];
    var aF = 0.15, aB = -0.12, mF = 0.25, mB = -0.2, by = 0, lean = 0, cr = 0;
    if (pose === "ready") {
      aF = 0.32;
      aB = -0.28;
      cr = 2;
      mF = 0.55;
      mB = -0.45;
      lean = 0.08;
      by = Math.sin(A.time * 3) * 0.8;
    } else if (pose === "kick") {
      var kk = A.clamp(t, 0, 1);
      aF = kk < 0.3 ? -0.9 * A.easeOut(kk / 0.3) : -0.9 + 2.3 * A.easeOut(A.clamp((kk - 0.3) / 0.25, 0, 1));
      if (kk > 0.7) aF = 1.4 - 1.2 * A.smooth((kk - 0.7) / 0.3);
      aB = -0.15;
      mF = -0.7;
      mB = 0.9;
      lean = kk < 0.3 ? -0.1 : 0.14;
    } else if (pose === "cheer") {
      by = -Math.abs(Math.sin(A.time * 6)) * 7;
      mF = 2.75;
      mB = -2.75;
      aF = 0.25;
      aB = -0.3;
    }
    c.save();
    c.translate(x, y);
    c.scale(s, s);
    c.lineJoin = "round";
    c.lineCap = "round";
    var LW = Math.max(2.2, 1.4 / s);
    var hipY = -19 + by + cr;
    var LEG = 18 - cr * 0.5;
    function leg(a, back) {
      var fx = Math.sin(a) * LEG, fy = hipY + Math.cos(a) * LEG;
      limb(c, back ? -1 : 1, hipY, fx, fy, 7, back ? mixc(kit.p, NAVY, 0.22) : kit.p, LW);
      c.save();
      c.translate(fx + 2.6, fy + 0.5);
      c.rotate(a * 0.4);
      c.beginPath();
      c.ellipse(0, 0, 6, 3.6, 0, 0, Math.PI * 2);
      c.fillStyle = back ? mixc(NAVY, "#000000", 0.2) : NAVY;
      c.fill();
      c.lineWidth = LW;
      c.strokeStyle = NAVY;
      c.stroke();
      c.restore();
    }
    var shX = 1.5, shY = -17;
    function arm(m, back) {
      var hx = shX + Math.sin(m) * 14, hy = shY + Math.cos(m) * 14;
      var sk = back ? mixc(skin, NAVY, 0.2) : skin;
      limb(c, shX, shY, hx, hy, 5, sk, LW);
      var mx = shX + Math.sin(m) * 6, my = shY + Math.cos(m) * 6;
      limb(c, shX, shY, mx, my, 7.5, back ? mixc(kit.p, NAVY, 0.2) : kit.p, LW);
      blob(c, hx, hy, 3.3, sk, LW * 0.8);
    }
    leg(aB, true);
    c.save();
    c.translate(0, hipY);
    c.rotate(lean);
    arm(mB, true);
    c.restore();
    leg(aF, false);
    c.save();
    c.translate(0, hipY);
    c.rotate(lean);
    A.roundRect(c, -10, -4, 20, 9.5, 4);
    c.fillStyle = kit.s;
    c.fill();
    c.lineWidth = LW;
    c.strokeStyle = NAVY;
    c.stroke();
    A.roundRect(c, -9.5, -21, 19, 19.5, 7.5);
    c.fillStyle = kit.p;
    c.fill();
    c.save();
    c.clip();
    c.fillStyle = kit.s;
    c.fillRect(-1.6, -22, 3.6, 22);
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
    c.restore();
    c.beginPath();
    c.arc(hx, hy, hr, 0, Math.PI * 2);
    c.lineWidth = LW;
    c.strokeStyle = NAVY;
    c.stroke();
    blob(c, hx - 3, hy + 1, 3, skin, LW * 0.8);
    c.fillStyle = NAVY;
    c.beginPath();
    c.ellipse(hx + 5.5, hy - 1.2, 1.9, 2.7, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#FFFFFF";
    c.beginPath();
    c.arc(hx + 6.1, hy - 2.2, 0.8, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "rgba(255,90,110,0.35)";
    c.beginPath();
    c.arc(hx + 4.5, hy + 4, 2.4, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = NAVY;
    c.lineWidth = 1.5;
    c.beginPath();
    if (pose === "cheer") c.arc(hx + 8, hy + 3.5, 2.2, 0.1, Math.PI * 0.9);
    else c.arc(hx + 8.5, hy + 3.2, 1.8, 0.3, Math.PI * 0.7);
    c.stroke();
    arm(mF, false);
    c.restore();
    c.restore();
  }

  /*
   * BARAJ SAVUNMACISI — kameraya dönük çizgi film futbolcu. Birimler: ayaklar
   * 0'da, kafa tepesi −67'de (FIG_H), omuz −44'te (FIG_STEP: üstteki oyuncu
   * buraya basar). o: kit, look, num, sq (çömelme), arms (0 yanda → 1 havada),
   * hold (alttakiler: üsttekinin bacaklarını tutar), tuck (zıplarken diz), face.
   */
  var FIG_H = 67, FIG_STEP = 44, FIG_REACH = 74;
  var MAN_H = 1.45; // m (kafa tepesi)
  function drawDefender(c, x, y, u, o) {
    var kit = o.kit, sq = o.sq || 1, ar = o.arms || 0, tuck = o.tuck || 0;
    var skin = SKINS[o.look % SKINS.length], hair = HAIRS[(o.look >> 2) % HAIRS.length];
    c.save();
    c.translate(x, y);
    if (o.rot) c.rotate(o.rot);
    c.scale(u * (2 - sq) * 0.98, u * sq);
    c.lineJoin = "round";
    c.lineCap = "round";
    var LW = Math.max(2.1, 1.5 / u);
    var hipY = -20 + tuck * 6;
    var kneeX = 8 + (1 - sq) * 10 + tuck * 4;
    // bacaklar (çorap = forma rengi) + kramponlar
    [-1, 1].forEach(function (sd) {
      var fy = -3 + tuck * 4;
      limb2(c, sd * 5, hipY, sd * kneeX, (hipY + fy) / 2 - tuck * 3, sd * 7, fy, 7, kit.p, LW);
      c.beginPath();
      c.ellipse(sd * 9, -2 + tuck * 4, 6.5, 3.6, 0, 0, Math.PI * 2);
      c.fillStyle = NAVY;
      c.fill();
      c.fillStyle = "rgba(255,255,255,0.35)";
      c.fillRect(sd * 9 - 3, -4 + tuck * 4, 4, 1.3);
    });
    // şort
    A.roundRect(c, -12, hipY - 7, 24, 11, 4);
    c.fillStyle = kit.s;
    c.fill();
    c.lineWidth = LW;
    c.strokeStyle = NAVY;
    c.stroke();
    // kollar: omuz (±11, −41); el: yanda (±19, −26) → havada (±13, −72)
    var sh = -41;
    function armPts(sd) {
      if (o.hold) return { ex: sd * 19, ey: -33, hx: sd * 9, hy: -47 };
      var hx = sd * A.lerp(21, 13, ar), hy = A.lerp(-27, -FIG_REACH + 2, ar);
      var ex = sd * A.lerp(21, 20, ar), ey = A.lerp(-36, -52, ar);
      return { ex: ex, ey: ey, hx: hx, hy: hy };
    }
    var arms = [armPts(-1), armPts(1)];
    // gövde
    A.roundRect(c, -12.5, -45, 25, 22, 8);
    c.fillStyle = kit.p;
    c.fill();
    c.save();
    c.clip();
    c.fillStyle = "rgba(255,255,255,0.22)";
    A.roundRect(c, -10, -42, 5, 12, 2.5);
    c.fill();
    c.fillStyle = "rgba(20,16,67,0.18)";
    c.fillRect(-13, -29, 26, 6);
    c.restore();
    A.roundRect(c, -12.5, -45, 25, 22, 8);
    c.lineWidth = LW;
    c.strokeStyle = NAVY;
    c.stroke();
    // yaka
    c.beginPath();
    c.moveTo(-4.5, -45);
    c.lineTo(0, -41);
    c.lineTo(4.5, -45);
    c.strokeStyle = kit.s;
    c.lineWidth = 2.2;
    c.stroke();
    // numara
    if (o.num) {
      c.font = "900 11px " + A.FONT;
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.lineWidth = 2.6;
      c.strokeStyle = NAVY;
      c.strokeText(o.num, 0, -33.5);
      c.fillStyle = kit.s;
      c.fillText(o.num, 0, -33.5);
    }
    arms.forEach(function (p, i) {
      var sd = i ? 1 : -1;
      limb2(c, sd * 10, sh, p.ex, p.ey, p.hx, p.hy, 5.2, skin, LW);
      limb(c, sd * 10, sh, sd * 10 + (p.ex - sd * 10) * 0.45, sh + (p.ey - sh) * 0.45, 7.5, kit.p, LW);
      blob(c, p.hx, p.hy, 3.6, skin, LW * 0.8);
    });
    // kafa
    var hy = -55, hr = 12;
    blob(c, -11.5, hy + 1, 3, skin, LW * 0.8);
    blob(c, 11.5, hy + 1, 3, skin, LW * 0.8);
    blob(c, 0, hy, hr, skin, 0);
    c.save();
    c.beginPath();
    c.arc(0, hy, hr, 0, Math.PI * 2);
    c.clip();
    c.fillStyle = hair;
    c.beginPath();
    c.ellipse(0, hy - 9, hr * 1.15, hr * 0.62, 0, 0, Math.PI * 2);
    c.fill();
    c.restore();
    c.beginPath();
    c.arc(0, hy, hr, 0, Math.PI * 2);
    c.lineWidth = LW;
    c.strokeStyle = NAVY;
    c.stroke();
    // yüz: kararlı kaşlar, gözler topu izler (sola)
    var face = o.face || "set";
    c.fillStyle = NAVY;
    if (face === "dizzy") {
      c.lineWidth = 1.7;
      [-4.5, 4.5].forEach(function (ex) {
        c.beginPath();
        c.moveTo(ex - 2, hy - 3);
        c.lineTo(ex + 2, hy + 1);
        c.moveTo(ex + 2, hy - 3);
        c.lineTo(ex - 2, hy + 1);
        c.stroke();
      });
    } else {
      [-4.5, 4.5].forEach(function (ex) {
        c.beginPath();
        c.ellipse(ex - 0.8, hy - 1, 1.8, 2.5, 0, 0, Math.PI * 2);
        c.fill();
      });
      c.fillStyle = "#FFFFFF";
      [-4.5, 4.5].forEach(function (ex) {
        c.beginPath();
        c.arc(ex - 1.3, hy - 1.9, 0.7, 0, Math.PI * 2);
        c.fill();
      });
      c.strokeStyle = NAVY;
      c.lineWidth = 1.6;
      c.beginPath();
      c.moveTo(-7.5, hy - 6.5);
      c.lineTo(-2.2, hy - 5);
      c.moveTo(7.5, hy - 6.5);
      c.lineTo(2.2, hy - 5);
      c.stroke();
    }
    c.fillStyle = "rgba(255,90,110,0.32)";
    c.beginPath();
    c.arc(-7, hy + 3.5, 2.2, 0, Math.PI * 2);
    c.arc(7, hy + 3.5, 2.2, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = NAVY;
    c.lineWidth = 1.5;
    c.beginPath();
    if (face === "dizzy") c.arc(0, hy + 6, 2.2, 0, Math.PI * 2);
    else {
      c.moveTo(-2.5, hy + 5.5);
      c.lineTo(2.5, hy + 5.5);
    }
    c.stroke();
    c.restore();
  }

  /** Barajdaki oyuncu sayısı (zıplamasız yükseklikten; titremesin). */
  function towerCount(g) {
    var baseH = g.gc + g.off - g.gap / 2;
    var step = (MAN_H * FIG_STEP) / FIG_H;
    return Math.min(5, 1 + Math.floor(Math.max(0, baseH - 1.2) / step));
  }

  /** Baraj kulesi: alttakiler üsttekini omuzlarında taşır; en üstteki tepeyi kapatır. */
  function drawTower(c, g) {
    var u = (MAN_H * L.k) / FIG_H; // birim başına piksel
    var step = (MAN_H * FIG_STEP) / FIG_H;
    var n = towerCount(g);
    var x = wx(g.x);
    var top = wallTop(g);
    var hr = top - step * (n - 1); // en üsttekinin ayağından tepeye
    var reach = (MAN_H * FIG_REACH) / FIG_H;
    var sq = 1, ar = 0, lift = 0, tuck = 0;
    if (hr < MAN_H) sq = A.clamp(hr / MAN_H, 0.6, 1);
    else if (hr < reach) ar = (hr - MAN_H) / (reach - MAN_H);
    else {
      ar = 1;
      lift = hr - reach;
      tuck = A.clamp(lift / 0.4, 0, 1);
    }
    var knocked = g.hit === "baraj" ? A.clamp((A.time - g.hitAt) / 0.5, 0, 1) : 0;
    var kick = g.hit === "baraj" ? Math.max(0, 1 - (A.time - g.hitAt) / 0.25) : 0;
    // zemin gölgesi
    c.fillStyle = "rgba(10,40,20,0.35)";
    c.beginPath();
    c.ellipse(x, L.gy + 1, GATE_HW * L.k * 1.25, Math.max(3, L.k * 0.07), 0, 0, Math.PI * 2);
    c.fill();
    // üstten alta çizilir: alttakinin kafası üsttekinin bacakları arasında öne çıkar
    for (var i = n - 1; i >= 0; i--) {
      var who = wallPerson(g.wall + i);
      var isTop = i === n - 1;
      var fy = wy(step * i + (isTop ? lift : 0));
      var sway = Math.sin(A.time * 2.2 + g.id + i) * (isTop ? 0 : 0.6) * u;
      var o = { kit: kitP(who), look: lookOf(who), num: who.shirt ? String(who.shirt) : "", hold: !isTop };
      if (isTop) {
        o.sq = sq;
        o.arms = ar + Math.sin(A.time * 5 + g.id) * 0.04 * (1 - ar);
        o.tuck = tuck;
        if (knocked > 0) {
          o.rot = knocked * 1.3;
          o.face = "dizzy";
          fy = Math.min(L.gy, fy + knocked * knocked * (L.gy - fy));
        }
      } else if (knocked > 0) o.face = "dizzy";
      var shx = kick > 0 ? Math.sin(A.time * 60) * kick * 3 : 0;
      drawDefender(c, x + sway + shx + (isTop ? knocked * GATE_HW * L.k : 0), fy, u, o);
    }
    // zıplama tozu
    if (g.jumper && g.jumpAt > 0) {
      var jt = (A.time - g.jumpAt) / 0.6;
      if (jt > 0 && jt < 1 && n === 1) {
        c.fillStyle = "rgba(255,255,255," + (0.5 * (1 - jt)).toFixed(3) + ")";
        for (var d = -1; d <= 1; d += 2) {
          c.beginPath();
          c.arc(x + d * (12 + jt * 20), L.gy - 3, 4 * (1 - jt) + 2, 0, Math.PI * 2);
          c.fill();
        }
      }
    }
  }

  /** Ters asılı kale: direkler çatıya uzanır, üst direk boşluğun üstünde. */
  function drawGoal(c, g) {
    var k = L.k;
    var x = wx(g.x), gb = wy(goalBottom(g)), hw = GATE_HW * k;
    var pw = Math.max(5, 0.1 * k); // direk kalınlığı
    var shake = g.hit === "direk" ? Math.max(0, 1 - (A.time - g.hitAt) / 0.6) : 0;
    var top = L.ceil - 30;
    c.save();
    c.translate(x, top);
    if (shake) c.rotate(Math.sin((A.time - g.hitAt) * 30) * 0.04 * shake);
    c.translate(-x, -top);
    // file: arka panel (derinlik) + ön ağ
    var wob = Math.max(0, 1 - (A.time - g.netAt) / 0.8);
    var bulge = Math.sin((A.time - g.netAt) * 18) * 0.12 * k * wob;
    var dx = 0.16 * k, dy = -0.12 * k;
    c.fillStyle = "rgba(255,255,255,0.10)";
    c.beginPath();
    c.moveTo(x - hw, gb);
    c.lineTo(x - hw + dx, gb + dy - bulge);
    c.lineTo(x + hw + dx, gb + dy - bulge);
    c.lineTo(x + hw, gb);
    c.lineTo(x + hw, top);
    c.lineTo(x - hw, top);
    c.closePath();
    c.fill();
    c.save();
    c.beginPath();
    c.rect(x - hw, top, hw * 2 + dx, gb - top + 2);
    c.clip();
    c.strokeStyle = "rgba(255,255,255,0.55)";
    c.lineWidth = 1.2;
    var cell = Math.max(6, 0.12 * k), hgt = gb - top;
    c.beginPath();
    for (var d = -hgt; d < hw * 2 + hgt; d += cell) {
      var wv = bulge * 0.5;
      c.moveTo(x - hw + d, gb + wv);
      c.lineTo(x - hw + d + hgt, top);
      c.moveTo(x - hw + d, gb + wv);
      c.lineTo(x - hw + d - hgt, top);
    }
    c.stroke();
    c.restore();
    // ağın alt kenarı (sallanır)
    c.strokeStyle = "rgba(255,255,255,0.85)";
    c.lineWidth = 1.6;
    c.beginPath();
    c.moveTo(x - hw + dx * 0.2, gb + dy * 0.2);
    c.quadraticCurveTo(x + dx * 0.6, gb + dy - bulge * 1.4, x + hw + dx, gb + dy - bulge);
    c.stroke();
    // direkler + üst direk (beyaz, lacivert kontur, parlak çizgi)
    function bar(x0, y0, w, h) {
      A.roundRect(c, x0, y0, w, h, Math.min(w, h) / 2);
      c.fillStyle = "#FFFFFF";
      c.fill();
      c.lineWidth = 2.2;
      c.strokeStyle = NAVY;
      c.stroke();
    }
    bar(x - hw - pw / 2, top, pw, gb - top + pw / 2);
    bar(x + hw - pw / 2, top, pw, gb - top + pw / 2);
    c.fillStyle = "rgba(20,16,67,0.16)";
    c.fillRect(x - hw + pw * 0.05, top, pw * 0.4, gb - top);
    c.fillRect(x + hw + pw * 0.05, top, pw * 0.4, gb - top);
    bar(x - hw - pw / 2, gb - pw / 2, hw * 2 + pw, pw);
    c.fillStyle = "rgba(255,255,255,0.9)";
    c.fillRect(x - hw, gb - pw * 0.3, hw * 2, pw * 0.15);
    // gol anı: üst direkte parıltı
    if (wob > 0.3) {
      c.save();
      c.globalCompositeOperation = "lighter";
      var gl = c.createRadialGradient(x, gb, 0, x, gb, hw * 1.8);
      gl.addColorStop(0, "rgba(255,240,180," + (0.6 * wob).toFixed(3) + ")");
      gl.addColorStop(1, "rgba(255,240,180,0)");
      c.fillStyle = gl;
      c.fillRect(x - hw * 2, gb - hw * 2, hw * 4, hw * 4);
      c.restore();
    }
    c.restore();
  }

  /** Beş köşe altın yıldız (dönerken yatayda daralır). */
  function drawStar(c, x, y, r, spin, alpha) {
    c.save();
    c.globalAlpha = alpha;
    var gl = c.createRadialGradient(x, y, 0, x, y, r * 2.2);
    gl.addColorStop(0, "rgba(255,220,90,0.55)");
    gl.addColorStop(1, "rgba(255,220,90,0)");
    c.fillStyle = gl;
    c.fillRect(x - r * 2.2, y - r * 2.2, r * 4.4, r * 4.4);
    c.translate(x, y);
    c.scale(0.3 + 0.7 * Math.abs(Math.cos(spin)), 1);
    c.beginPath();
    for (var i = 0; i < 10; i++) {
      var rr = i % 2 ? r * 0.46 : r, a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    c.closePath();
    var g = c.createLinearGradient(0, -r, 0, r);
    g.addColorStop(0, "#FFF08A");
    g.addColorStop(0.55, GOLD);
    g.addColorStop(1, GOLD_D);
    c.fillStyle = g;
    c.fill();
    c.lineJoin = "round";
    c.lineWidth = Math.max(2, r * 0.16);
    c.strokeStyle = NAVY;
    c.stroke();
    c.fillStyle = "rgba(255,255,255,0.7)";
    c.beginPath();
    c.ellipse(-r * 0.2, -r * 0.35, r * 0.16, r * 0.1, -0.6, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }

  /** Altın krampon (kalkan). */
  function drawBoot(c, x, y, r, t, alpha) {
    c.save();
    c.globalAlpha = alpha;
    var gl = c.createRadialGradient(x, y, 0, x, y, r * 2.4);
    gl.addColorStop(0, "rgba(255,220,90,0.6)");
    gl.addColorStop(1, "rgba(255,220,90,0)");
    c.fillStyle = gl;
    c.fillRect(x - r * 2.4, y - r * 2.4, r * 4.8, r * 4.8);
    // dönen ışınlar
    c.save();
    c.translate(x, y);
    c.rotate(t * 0.8);
    c.fillStyle = "rgba(255,236,150,0.25)";
    for (var i = 0; i < 8; i++) {
      c.beginPath();
      c.moveTo(0, 0);
      c.arc(0, 0, r * 2, (i / 8) * Math.PI * 2, (i / 8) * Math.PI * 2 + 0.22);
      c.closePath();
      c.fill();
    }
    c.restore();
    c.translate(x, y);
    c.rotate(Math.sin(t * 2) * 0.12);
    var s = r / 10;
    c.scale(s, s);
    c.lineJoin = "round";
    c.beginPath();
    c.moveTo(-10, 6);
    c.lineTo(10, 6);
    c.quadraticCurveTo(14, 5, 13, 1);
    c.quadraticCurveTo(6, -1, 2, -3);
    c.lineTo(-1, -10);
    c.lineTo(-9, -10);
    c.quadraticCurveTo(-11, -2, -10, 6);
    c.closePath();
    var g = c.createLinearGradient(0, -10, 0, 6);
    g.addColorStop(0, "#FFF08A");
    g.addColorStop(0.6, GOLD);
    g.addColorStop(1, GOLD_D);
    c.fillStyle = g;
    c.fill();
    c.lineWidth = 2;
    c.strokeStyle = NAVY;
    c.stroke();
    // bağcık + taban + dişler
    c.strokeStyle = "#FFFFFF";
    c.lineWidth = 1.3;
    c.beginPath();
    c.moveTo(-1, -5);
    c.lineTo(3, -3.5);
    c.moveTo(-0.5, -2);
    c.lineTo(5, -0.5);
    c.stroke();
    c.fillStyle = NAVY;
    c.fillRect(-10, 5, 22, 2.5);
    [-7, -2, 4, 9].forEach(function (sx) {
      c.fillRect(sx - 1, 7, 2, 2.5);
    });
    c.restore();
  }

  /** Parlak çizgi film top: beyaz gövde, lacivert yamalar, ezilme/esneme. */
  function drawBall(c, x, y, r, rot, sx, sy) {
    c.save();
    c.translate(x, y);
    c.scale(sx, sy);
    c.beginPath();
    c.arc(0, 0, r, 0, Math.PI * 2);
    var bg2 = c.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r * 1.05);
    bg2.addColorStop(0, "#FFFFFF");
    bg2.addColorStop(0.7, "#F1F0FA");
    bg2.addColorStop(1, "#C9C6E6");
    c.fillStyle = bg2;
    c.fill();
    c.save();
    c.clip();
    c.rotate(rot);
    c.fillStyle = NAVY;
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
    for (var k2 = 0; k2 < 5; k2++) {
      var a = (k2 / 5) * Math.PI * 2 + Math.PI / 2;
      pent(Math.cos(a) * r * 0.95, Math.sin(a) * r * 0.95, r * 0.3);
    }
    c.restore();
    // alt gölge yayı + kontur + parlama
    c.fillStyle = "rgba(20,16,67,0.16)";
    c.beginPath();
    c.arc(0, 0, r, 0.15, Math.PI - 0.15);
    c.fill();
    c.beginPath();
    c.arc(0, 0, r, 0, Math.PI * 2);
    c.lineWidth = Math.max(2, r * 0.13);
    c.strokeStyle = NAVY;
    c.stroke();
    c.fillStyle = "rgba(255,255,255,0.92)";
    c.beginPath();
    c.ellipse(-r * 0.38, -r * 0.45, r * 0.24, r * 0.14, -0.6, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.arc(-r * 0.06, -r * 0.62, r * 0.06, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }

  /* ═══════════════ TOP, İZ, ÖĞELER ═══════════════ */

  function drawBallAll(c) {
    var r = L.ballR;
    var bx = wx(ball.x), by = wy(ball.y);
    // gölge (yere yaklaştıkça koyu ve dar)
    var hgt = A.clamp(ball.y / TOP, 0, 1);
    c.fillStyle = "rgba(10,40,20," + (0.38 * (1 - hgt * 0.7)).toFixed(3) + ")";
    c.beginPath();
    c.ellipse(bx, L.gy + 1, r * (1.1 + hgt * 0.6), Math.max(2.5, r * 0.28), 0, 0, Math.PI * 2);
    c.fill();
    var blink = invuln > 0 && Math.sin(A.time * 40) > 0.3;
    if (blink) return;
    // iz: dünya noktalarından incelen şerit
    if (trail.length > 2) {
      c.save();
      c.lineCap = "round";
      for (var i = 1; i < trail.length; i++) {
        var p0 = trail[i - 1], p1 = trail[i];
        var f = 1 - i / trail.length;
        c.strokeStyle = i < 4 ? "rgba(255,255,255," + (0.55 * f).toFixed(3) + ")" : "rgba(255,214,90," + (0.45 * f).toFixed(3) + ")";
        c.lineWidth = r * 1.5 * f + 1;
        c.beginPath();
        c.moveTo(wx(p0.x), wy(p0.y));
        c.lineTo(wx(p1.x), wy(p1.y));
        c.stroke();
      }
      c.restore();
    }
    // hale
    if (LY.glow) A.blit(LY.glow, bx - LY.glow.w / 2, by - LY.glow.h / 2);
    // vuruş yayı (dokunuş anı)
    var kt = A.time - kickFx;
    if (kt >= 0 && kt < 0.28) {
      var q = kt / 0.28;
      c.save();
      c.globalAlpha = 1 - q;
      c.strokeStyle = "#FFFFFF";
      c.lineCap = "round";
      c.lineWidth = r * 0.35 * (1 - q) + 1;
      c.beginPath();
      c.arc(bx, by, r * (1.25 + q * 0.9), Math.PI * 0.2, Math.PI * 0.8);
      c.stroke();
      c.lineWidth = 2;
      c.strokeStyle = GOLD;
      c.beginPath();
      c.arc(bx, by + r * 0.6, r * (0.6 + q * 1.8), Math.PI * 0.15, Math.PI * 0.85);
      c.stroke();
      c.restore();
    }
    // ezilme: vuruş anında yassılır, hızla dikeyde uzar
    var sx = 1, sy = 1;
    var hit = Math.min(kt, A.time - bumpFx, A.time - landFx);
    if (hit >= 0 && hit < 0.35) {
      var w = 0.26 * Math.exp(-hit * 12) * Math.cos(hit * 34);
      sx += w;
      sy -= w;
    }
    var st = A.clamp(Math.abs(ball.vy) / 26, 0, 0.12);
    sx *= 1 - st * 0.6;
    sy *= 1 + st;
    drawBall(c, bx, by, r, ball.rot, sx, sy);
    // kalkan balonu
    if (shield) {
      c.save();
      c.translate(bx, by);
      c.rotate(A.time * 2);
      c.strokeStyle = GOLD;
      c.lineWidth = 3;
      c.setLineDash([r * 0.5, r * 0.3]);
      c.beginPath();
      c.arc(0, 0, r * 1.45, 0, Math.PI * 2);
      c.stroke();
      c.setLineDash([]);
      c.restore();
      c.fillStyle = "rgba(255,212,59,0.12)";
      c.beginPath();
      c.arc(bx, by, r * 1.45, 0, Math.PI * 2);
      c.fill();
    }
  }

  function drawItems(c) {
    var r = Math.max(9, 0.27 * L.k);
    stars.forEach(function (s) {
      var t = s.taken ? A.clamp((A.time - s.at) / 0.3, 0, 1) : 0;
      if (t >= 1) return;
      var x = wx(s.x);
      if (x < -40 || x > W + 40) return;
      drawStar(c, x, wy(s.y + Math.sin(A.time * 3 + s.id) * 0.08 + t * 0.8), r * (1 + t), A.time * 2.5 + s.id, 1 - t);
    });
    boots.forEach(function (b) {
      var t = b.taken ? A.clamp((A.time - b.at) / 0.3, 0, 1) : 0;
      if (t >= 1) return;
      var x = wx(b.x);
      if (x < -40 || x > W + 40) return;
      drawBoot(c, x, wy(b.y + Math.sin(A.time * 3 + b.id) * 0.08 + t * 0.8), r * 1.15 * (1 + t), A.time + b.id, 1 - t);
    });
  }

  /** Başlama vuruşu yapan oyuncu: topun yanında bekler, ilk dokunuşta vurur. */
  function drawJuggler(c) {
    var x = wx(START_X - 0.62);
    if (x < -80 || x > W + 80) return;
    var s = (1.62 * L.k) / 62;
    var pose = "ready", t = 0;
    if (state === "play" || state === "dying" || state === "over") {
      var k = A.time - kickT;
      if (k >= 0 && k < 0.6) {
        pose = "kick";
        t = k / 0.6;
      } else pose = "cheer";
    }
    c.fillStyle = "rgba(10,40,20,0.32)";
    c.beginPath();
    c.ellipse(x + 2 * s, L.gy + 1, 15 * s, Math.max(3, 3 * s), 0, 0, Math.PI * 2);
    c.fill();
    drawPlayer(c, x, L.gy, s, { kit: kitP(juggler), look: lookOf(juggler), pose: pose, t: t });
    if (state === "ready") {
      var name = String(juggler.short || "ElitLig");
      var num = juggler.shirt ? String(juggler.shirt) : "";
      nameTag(c, x + 2 * s, L.gy - 64 * s - 16, name, num, kitP(juggler).p, 1);
    }
  }

  /* ═══════════════ ÇİZİM GİRİŞİ ═══════════════ */

  function sync(dt) {
    var want = state === "ready" ? 0.42 : state === "attract" ? 0.3 : 0.24;
    anchor = state === "ready" || !dt ? (anchor || want) : A.damp(anchor, want, 3, dt);
    if (state === "ready") anchor = want;
    var wantX = ball.x;
    if (state === "dying") camX = A.damp(camX, wantX, 2, dt || 0);
    else camX = wantX;
    // vuruş algısı (vitrin pilotu flap() çağırmadan sıçratır)
    if (ball.vy - lastVy > 2 && (state === "play" || state === "attract")) kickFx = A.time;
    if (lastVy < -3 && ball.vy >= -0.01 && ball.y <= BR + 0.01) landFx = A.time;
    lastVy = ball.vy;
    // iz noktaları
    if (state === "play" || state === "attract") {
      trail.unshift({ x: ball.x, y: ball.y });
      if (trail.length > 14) trail.length = 14;
    } else if (trail.length) trail.pop();
  }

  function render(c, dt) {
    sync(dt);
    paintLayers();
    shownPts = shownPts < points ? Math.min(points, shownPts + Math.max(1, (points - shownPts) * 0.15)) : points;
    A.blit(LY.sky);
    tile(LY.city, 0.12, L.ceil);
    tile(LY.stand, 0.45, L.standTop);
    drawGrass(c);
    drawJuggler(c);
    gates.forEach(function (g) {
      var x = wx(g.x);
      if (x < -GATE_HW * L.k - 60 || x > W + 60) return;
      drawGoal(c, g);
      drawTower(c, g);
    });
    tile(LY.roof, 1, 0);
    drawItems(c);
    drawBallAll(c);
    if (state === "play" || state === "attract") drawWallLabels(c);
    A.drawParticles(c);
    A.drawFloaters(c, dt);
    if (state !== "attract") drawHud(c);
    if (state === "ready") drawReady(c);
    if (state === "dying" || state === "over") drawDeath(c);
    A.drawBanner(c, W, L.ceil + (L.gy - L.ceil) * 0.3, dt);
    if (flash > 0) {
      c.fillStyle = "rgba(255,210,74," + (0.12 * flash).toFixed(3) + ")";
      c.fillRect(0, 0, W, H);
    }
  }

  /* ═══════════════════════════ HUD ═══════════════════════════ */

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
  /** Koyu lacivert, alt kenarı gölgeli yuvarlak hap. */
  function navyPill(c, x, y, w, h, fill) {
    A.roundRect(c, x, y + 3, w, h, h / 2);
    c.fillStyle = "rgba(8,6,30,0.55)";
    c.fill();
    A.roundRect(c, x, y, w, h, h / 2);
    var g = c.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, fill ? mixc(fill, "#FFFFFF", 0.14) : "#2C2580");
    g.addColorStop(1, fill || "#1C1760");
    c.fillStyle = g;
    c.fill();
    c.lineWidth = 1.5;
    c.strokeStyle = "rgba(255,255,255,0.14)";
    c.stroke();
  }
  function shieldIcon(c, x, y, r) {
    c.save();
    c.translate(x, y);
    c.beginPath();
    c.moveTo(0, -r);
    c.quadraticCurveTo(r * 0.55, -r * 0.65, r * 0.95, -r * 0.7);
    c.quadraticCurveTo(r * 1.0, r * 0.35, 0, r * 1.05);
    c.quadraticCurveTo(-r * 1.0, r * 0.35, -r * 0.95, -r * 0.7);
    c.quadraticCurveTo(-r * 0.55, -r * 0.65, 0, -r);
    c.closePath();
    var g = c.createLinearGradient(0, -r, 0, r);
    g.addColorStop(0, "#FFE58A");
    g.addColorStop(1, GOLD_D);
    c.fillStyle = g;
    c.fill();
    c.lineWidth = 2.4;
    c.strokeStyle = "#FFFFFF";
    c.stroke();
    c.strokeStyle = NAVY;
    c.lineWidth = r * 0.26;
    c.lineCap = "round";
    c.lineJoin = "round";
    c.beginPath();
    c.moveTo(-r * 0.4, 0);
    c.lineTo(-r * 0.08, r * 0.32);
    c.lineTo(r * 0.45, -r * 0.3);
    c.stroke();
    c.restore();
  }
  /** Ad etiketi: lacivert hap, forma renginde numara rozeti. */
  function nameTag(c, cx, cy, name, num, color, alpha) {
    c.save();
    c.globalAlpha = alpha;
    c.font = A.font(11, 800);
    var tw = c.measureText(name).width, nw = num ? 20 : 0;
    var bw = tw + nw + 16, bx = cx - bw / 2, h = 22;
    navyPill(c, bx, cy - h / 2, bw, h);
    if (num) {
      blob(c, bx + 12, cy, 8.5, color, 1.8);
      label(c, num, bx + 12, cy + 0.5, 9.5, "#FFFFFF", "center");
    }
    c.font = A.font(11, 800);
    c.fillStyle = "#FFFFFF";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(name, bx + nw + 8 + tw / 2, cy + 0.5);
    // aşağı ok
    c.fillStyle = "#1C1760";
    c.beginPath();
    c.moveTo(cx - 5, cy + h / 2 - 1);
    c.lineTo(cx + 5, cy + h / 2 - 1);
    c.lineTo(cx, cy + h / 2 + 5);
    c.closePath();
    c.fill();
    c.restore();
  }

  /** Ad soyad; sığmazsa "A. Soyadı", o da sığmazsa "…" ile kısaltılır. */
  function fitName(c, who, max) {
    var full = String(who.name || who.short || "").trim();
    if (c.measureText(full).width <= max) return full;
    var t = String(who.short || full);
    if (c.measureText(t).width <= max) return t;
    while (t.length > 2 && c.measureText(t + "…").width > max) t = t.slice(0, -1);
    return t + "…";
  }

  /** Yaklaşan barajın tepesinde savunmacının numarası + adı. */
  function drawWallLabels(c) {
    gates.forEach(function (g) {
      var d = g.x - ball.x;
      if (d < 0.4 || d > 5.5 || g.hit) return;
      var who = wallPerson(g.wall + towerCount(g) - 1);
      var x = wx(g.x);
      if (x > W - 10) return;
      var y = wy(wallTop(g)) - 18;
      c.font = A.font(11, 800);
      var name = fitName(c, who, Math.min(140, W * 0.36));
      var a = A.clamp((5.5 - d) / 1.2, 0, 1) * A.clamp((d - 0.4) / 0.6, 0, 1);
      nameTag(c, x, y, name, who.shirt ? String(who.shirt) : "", kitP(who).p, a);
    });
  }

  function drawHud(c) {
    var wide = L.wide;
    var y = wide ? 8 : 10, h = wide ? 30 : 34;
    var kick = Math.max(A.scoreKick || 0, scoreBump * 0.8);
    // PUAN hapı (sol): top simgesi + sayı
    var txt = Math.round(shownPts).toLocaleString("tr-TR");
    c.font = A.font(h * 0.56, 900);
    var pw = Math.max(80, c.measureText(txt).width + h + 22);
    navyPill(c, 12 + h * 0.4, y, pw, h);
    c.save();
    c.translate(12 + h / 2, y + h / 2);
    c.scale(1 + kick * 0.25, 1 + kick * 0.25);
    drawBall(c, 0, 0, h * 0.48, A.time * 0.8, 1, 1);
    c.restore();
    A.scoreAnchor = { x: 12 + h / 2, y: y + h / 2 };
    label(c, txt, 12 + h + 6, y + h / 2 + 1, h * 0.56, kick > 0.1 ? "#FFE58A" : "#FFFFFF", "left");
    // SEVİYE hapı (sağ) + kalkan
    c.font = A.font(h * 0.42, 900);
    var lv = "SEVİYE " + level;
    var lw = c.measureText(lv).width + 26;
    navyPill(c, W - 12 - lw, y, lw, h, "#4C2FD8");
    label(c, lv, W - 12 - lw / 2, y + h / 2 + 1, h * 0.42, "#FFFFFF", "center", false);
    if (shield) shieldIcon(c, 12 + h * 0.92, y + h * 0.82, h * 0.3);
    // GOL sayacı: dikeyde üstte ortada; yatayda puan hapı ile çubuk arasında
    var gx = wide ? (12 + h * 0.4 + pw + (W / 2 - Math.min(W * 0.36, 300) / 2)) / 2 + 8 : W / 2;
    var gyy = y + h / 2 + 1;
    var gs = (wide ? 30 : 34) * (1 + 0.28 * scoreBump);
    label(c, String(goals), gx, gyy, gs, "#FFFFFF", "center", NAVY);
    c.font = A.font(gs, 900);
    var gw = c.measureText(String(goals)).width;
    label(c, "GOL", gx - gw / 2 - 6, gyy + gs * 0.18, 10, "#FFE58A", "right");
    var mult = multiplier();
    if (mult > 1) {
      var mx = gx + gw / 2 + 18, my = gyy - 2;
      var pulse = 1 + 0.08 * Math.sin(A.time * 8);
      c.save();
      c.translate(mx, my);
      c.scale(pulse, pulse);
      blob(c, 0, 0, 13, GOLD, 2.4);
      label(c, "×" + mult, 0, 1, 12, NAVY, "center", false);
      c.restore();
    }
    // kombo noktaları (sonraki çarpana)
    if (combo > 0 && mult < 5) {
      var n = combo % 5, py = gyy + gs * 0.5 + (wide ? 4 : 6);
      for (var i = 0; i < 5; i++) blob(c, gx - 20 + i * 10, py, 3.2, i < n ? GOLD : "rgba(255,255,255,0.25)", i < n ? 1.4 : 0);
    }
    // ilerleme çubuğu: sıradaki oyuncu (yoksa sonraki seviye)
    var bx, bw, byy, bh;
    if (wide) {
      bw = Math.min(W * 0.36, 300);
      bx = W / 2 - bw / 2;
      byy = y + 4;
      bh = h - 8;
    } else {
      bx = 14;
      bw = W - 28;
      byy = y + h + 10;
      bh = 22;
    }
    var nr = nextRival();
    var prog, lbl, chip = null, hot = false;
    if (passedLine) {
      prog = 1;
      lbl = passedLine.text;
      chip = hex(passedLine.kit.primary, "#5B3DF5");
      hot = true;
    } else if (nr) {
      var prev = passedRivals > 0 ? rivals[passedRivals - 1].value : 0;
      prog = A.clamp((goals - prev) / Math.max(1, nr.value - prev), 0, 1);
      lbl = "Sıradaki: " + nr.short + " · " + nr.value + " gol+asist";
      chip = kitP(nr).p;
    } else {
      prog = (goals % GOALS_PER_LEVEL) / GOALS_PER_LEVEL;
      lbl = "Seviye " + (level + 1) + " · " + (goals % GOALS_PER_LEVEL) + "/" + GOALS_PER_LEVEL + " gol";
    }
    A.roundRect(c, bx, byy + 2, bw, bh, bh / 2);
    c.fillStyle = "rgba(8,6,30,0.55)";
    c.fill();
    A.roundRect(c, bx, byy, bw, bh, bh / 2);
    c.fillStyle = "#231D6B";
    c.fill();
    var fw = Math.max(bh, bw * prog);
    A.roundRect(c, bx, byy, fw, bh, bh / 2);
    var pg = c.createLinearGradient(0, byy, 0, byy + bh);
    pg.addColorStop(0, hot ? "#FFE58A" : "#4ADE6E");
    pg.addColorStop(1, hot ? GOLD_D : "#16A34A");
    c.fillStyle = pg;
    c.fill();
    c.fillStyle = "rgba(255,255,255,0.25)";
    A.roundRect(c, bx + 4, byy + 2.5, Math.max(0, fw - 8), bh * 0.28, bh * 0.14);
    c.fill();
    c.font = A.font(bh * 0.56, 900);
    while (lbl.length > 8 && c.measureText(lbl).width > bw - 44) lbl = lbl.slice(0, -2) + "…";
    var lx = bx + bw / 2 + (chip ? 6 : 0);
    if (chip) blob(c, lx - c.measureText(lbl).width / 2 - 11, byy + bh / 2, bh * 0.3, chip, 2);
    label(c, lbl, lx, byy + bh / 2 + 0.5, bh * 0.56, "#FFFFFF", "center");
  }

  function drawReady(c) {
    var bx = wx(ball.x), by = wy(ball.y), r = L.ballR;
    var q = (A.time * 1.2) % 1;
    c.save();
    // dokun halkaları
    c.strokeStyle = "rgba(255,255,255," + (0.85 * (1 - q)).toFixed(3) + ")";
    c.lineWidth = 3;
    c.beginPath();
    c.arc(bx, by, r * (1.3 + q * 1.2), 0, Math.PI * 2);
    c.stroke();
    // parmak (yuvarlak el simgesi) topun altında, tıklar gibi iner
    var press = Math.max(0, Math.sin(A.time * 5));
    var hx = bx + r * 0.9, hy = by + r * 2.3 + press * 4;
    c.save();
    c.translate(hx, hy);
    c.rotate(-0.35);
    A.roundRect(c, -5, -14, 10, 22, 5);
    c.fillStyle = "#FFFFFF";
    c.fill();
    c.lineWidth = 2.2;
    c.strokeStyle = NAVY;
    c.stroke();
    A.roundRect(c, -9, 0, 20, 18, 7);
    c.fill();
    c.stroke();
    c.restore();
    c.restore();
    var y = L.ceil + 40;
    var a = 0.85 + 0.15 * Math.sin(A.time * 4);
    c.save();
    c.globalAlpha = a;
    c.font = A.font(15, 900);
    var text = "Dokun: başlama vuruşu";
    var w = c.measureText(text).width + 36;
    navyPill(c, W / 2 - w / 2, y - 18, w, 36);
    label(c, text, W / 2, y + 0.5, 15, "#FFFFFF", "center", false);
    c.restore();
    c.font = A.font(11.5, 800);
    var sub = "Barajın üstünden, kalenin altından geç";
    label(c, sub, W / 2, y + 33, 11.5, "#FFFFFF", "center", "rgba(20,16,67,0.9)");
  }

  var DEATH = { baraj: "BARAJA TAKILDI", direk: "DİREKTEN DÖNDÜ", yer: "TOP YERDE" };
  function drawDeath(c) {
    var t = state === "dying" ? deathT : 1.3 + stateT;
    var pop = A.easeOutBack(A.clamp(t / 0.35, 0, 1));
    var text = DEATH[deathKind] || "";
    if (!text) return;
    c.save();
    c.globalAlpha = A.clamp(t / 0.2, 0, 1);
    c.translate(W / 2, L.ceil + (L.gy - L.ceil) * 0.36);
    c.scale(0.6 + 0.4 * pop, 0.6 + 0.4 * pop);
    var cw = Math.min(W - 48, 290), ch = 92;
    A.roundRect(c, -cw / 2, -ch / 2 + 5, cw, ch, 22);
    c.fillStyle = "rgba(8,6,30,0.45)";
    c.fill();
    A.roundRect(c, -cw / 2, -ch / 2, cw, ch, 22);
    c.fillStyle = "#FFFFFF";
    c.fill();
    c.lineWidth = 3;
    c.strokeStyle = NAVY;
    c.stroke();
    // rozet
    c.font = A.font(12, 900);
    var bt = "TUR BİTTİ";
    var bw = c.measureText(bt).width + 26;
    navyPill(c, -bw / 2, -ch / 2 - 13, bw, 26, "#E11D48");
    label(c, bt, 0, -ch / 2, 12, "#FFFFFF", "center", false);
    label(c, text, 0, -4, Math.min(26, (cw - 30) / (text.length * 0.62)), BAD, "center", NAVY);
    c.font = A.font(13, 800);
    c.fillStyle = INK;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(goals + " gol · " + points.toLocaleString("tr-TR") + " puan", 0, 26);
    c.restore();
  }

  function debug() {
    return {
      state: state, death: deathKind, goals: goals, points: points, level: level, combo: combo, ball: ball, gates: gates, stars: stars, boots: boots, shield: shield,
      speed: runSpeed(), gap: gapSize(), g: gravity(), flap: flapV(), juggler: juggler.short, passed: passedRivals, gl: false, renderer: "2d", wallTop: wallTop, goalBottom: goalBottom, BR: BR, TOP: TOP, GATE_HW: GATE_HW, fitName: fitName,
    };
  }

  A.register({ resize: resize, start: start, update: update, render: render, down: down, debug: debug, setRoster: setRoster });
})();
