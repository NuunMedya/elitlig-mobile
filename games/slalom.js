/*
 * SLALOM 3B — ORTA SAHADAN KALEYE ATAK. Topu ligin gerçek oyuncusuyla sürersin;
 * karşında rakip kulübün gerçek savunmacıları ve kalecisi var.
 *
 * MİMARİ: simülasyon (kurallar, savunma yapay zekâsı, top fiziği, puan)
 * çizimden bağımsızdır; başsız testler (scripts/check-games.mjs) yalnız onu
 * koşturur. Çizim: ortak gece stadyumu (games/stadium3d.js) + gerçek insan
 * modelleri (games/three-kit.js) + saydam 2B HUD.
 *
 * ATAK: orta yuvarlaktan topla çıkarsın, önünde rakibin savunma hattı.
 *   · Savunmacılar BASAR: sana yaklaşır, yolunu keser; dibine gelince kısa bir
 *     hazırlık (yerde kırmızı halka) ve ardından KAYARAK MÜDAHALE eder.
 *     Müdahalenin içinde kalırsan ya da savunmacıya çarparsan topu kaptırırsın.
 *   · Ceza sahasına girince zaman YAVAŞLAR: kaleye doğru kaydır, ŞUT. Kaleci
 *     gerçek: köşeyi okur, uçar; top direkten döner, fileye gömülür.
 *   · Gol → sıradaki kulübün savunmasına (merdiven: en çok gol yiyen ilk, ligin
 *     en iyi savunması sonda). Top kaybı ya da kaçan şut → bir hak; 3 hakta biter.
 *
 * KONTROL:
 *   · Sağa sola KAYDIR: oyuncu parmağını izler (göreli sürükleme).
 *   · DOKUN: ÇALIM (makas). Savunmacı kayarken çalım atarsan boşa düşer:
 *     en iyi an, kırmızı halka dolarken.
 *   · YUKARI FIRLAT: topu boşluğa it ve depar at. Hızlısın ama top açıkta:
 *     yakındaki savunmacı araya girebilir.
 *   · Ceza sahasında: kaleye doğru yukarı kaydır — yön köşeyi, uzunluk
 *     yüksekliği, hız şutun sertliğini belirler.
 *
 * GERÇEK İÇERİK (RN'den {type:"config", roster:{runner, defenses}}; bkz.
 * elitlig-server services/penaltyRoster.js buildSlalomRoster):
 *   · KOŞUCU: çeviklik (yana kayış ±%10), kontrol (topun ayağa yakınlığı,
 *     çalım penceresi, şut isabeti), hız (koşu hızı ±%6).
 *   · SAVUNMA: takımın en çok oynayan savunmacıları (numara + ad soyad) ve
 *     kalecisi. Merdivende yükseldikçe savunmacılar daha erken basar, daha
 *     hızlı kayar, daha iyi okur; savunmacı sayısı 3'ten 6'ya çıkar.
 *
 * PUAN: geçilen savunmacı 100 × çarpan · çalımla düşürülen +150 × çarpan ·
 * depar ile geçiş +50 · gol 500 (+150 köşe, +300 bütün savunmayı geçtiysen
 * SOLO) · arka arkaya geçilen her iki savunmacı çarpanı bir artırır (en çok ×5);
 * top kaybı çarpanı sıfırlar.
 *
 * KOORDİNAT (metre): x yatay, y yukarı, z kale çizgisinden sahaya (kale z = 0,
 * orta saha z = 52,5). Atak −z yönündedir.
 */
(function () {
  "use strict";
  var A = window.Arena;
  var P = A.PAL;
  var T = window.THREE || (typeof THREE !== "undefined" ? THREE : null); // eslint-disable-line no-undef
  var S3 = A.S3;

  /* ═══════════════════════════ SİMÜLASYON ═══════════════════════════ */

  var GOAL_W = 7.32, GOAL_H = 2.44, HALF = GOAL_W / 2, POST_R = 0.06;
  var NET_D = 2.0, NET_BACK_H = 1.9, BALL_R = 0.11, GRAV = 9.81;
  var START_Z = 50.5, BOX_Z = 19.5, KEEPER_Z = 0.45;
  var FIELD = 16; // oynanabilir yarı genişlik
  var LIVES = 3;
  var SLOW = 0.38; // şut anı yavaş çekimi
  var SHOT_WINDOW = 2.4; // gerçek saniye
  var INTRO = 2.4, RESULT = 2.3;

  var W = 390, H = 640;

  /* ─────────────── kadro ─────────────── */

  var FIRST = ["Emre", "Burak", "Mert", "Kerem", "Arda", "Onur", "Serkan", "Tolga", "Yusuf", "Ozan", "Cenk", "Barış", "Furkan", "Hakan", "Volkan"];
  var LAST = ["Yılmaz", "Kaya", "Demir", "Şahin", "Çelik", "Arslan", "Doğan", "Aydın", "Öztürk", "Koç", "Kurt", "Polat", "Erdem", "Güneş", "Aksoy"];
  function personName(seed) {
    var r = A.seeded(seed);
    return FIRST[(r() * FIRST.length) | 0] + " " + LAST[(r() * LAST.length) | 0];
  }
  function upperTR(s) {
    try {
      return String(s || "").toLocaleUpperCase("tr-TR");
    } catch (e) {
      return String(s || "").toUpperCase();
    }
  }
  function hashStr(s) {
    var h = 2166136261;
    s = String(s);
    for (var i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return h >>> 0;
  }
  function makePerson(id, name, team, shirt) {
    var parts = name.split(" ");
    return { id: id, name: name, short: parts[0][0] + ". " + parts.slice(1).join(" "), back: upperTR(parts.slice(1).join(" ")), shirt: shirt, team: team };
  }

  var DEFAULT_RUNNER = makePerson(0, "Elit Forvet", { id: 900, name: "ElitLig", kit: { primary: "#5B3DF5", secondary: "#FFFFFF" } }, 10);
  DEFAULT_RUNNER.attrs = { agility: 78, control: 78, pace: 78 };
  var DEFAULT_DEFENSES = [
    ["Çaylakspor", "#0EA5E9", "#FFFFFF"],
    ["Yıldızspor", "#F97316", "#111827"],
    ["Gençlerbirliği", "#DC2626", "#FFFFFF"],
    ["Kartal SK", "#111827", "#FFFFFF"],
    ["Şampiyon FK", "#FACC15", "#1E3A8A"],
  ].map(function (d, i) {
    var team = { id: -1 - i, name: d[0], kit: { primary: d[1], secondary: d[2] } };
    return {
      team: team,
      conceded_per_match: 2 - i * 0.3,
      defenders: [4, 5, 3, 2, 6, 14].map(function (n, j) {
        return makePerson(-100 - i * 10 - j, personName(500 + i * 17 + j), team, n);
      }),
      keeper: null,
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
    if (state === "attract" || state === "over") {
      setupAttack(0);
      if (R) rebuildCast();
    }
  }
  function attr(key) {
    var v = runner && runner.attrs ? Number(runner.attrs[key]) : NaN;
    return Number.isFinite(v) ? A.clamp((A.clamp(v, 50, 99) - 77.5) / 17.5, -1, 1) : 0;
  }
  function kitOf(person) {
    var k = person && person.team && person.team.kit ? person.team.kit : {};
    return { primary: k.primary || "#5B3DF5", secondary: k.secondary || "#FFFFFF" };
  }
  function teamName(person) {
    return (person && person.team && person.team.name) || "ElitLig";
  }
  function defenseAt(m) {
    return defenses[Math.min(m, defenses.length - 1)];
  }
  /** Merdiven zorluğu 0..1 (+ son basamaktan sonra her turda biraz daha). */
  function quality(m) {
    var n = defenses.length;
    var base = n > 1 ? Math.min(m, n - 1) / (n - 1) : 0.5;
    return base + Math.max(0, m - (n - 1)) * 0.08;
  }
  function keeperOf(def) {
    var team = def.team;
    var k = def.keeper && def.keeper.name ? def.keeper : null;
    if (k) return { id: k.id, name: k.name, short: k.short, back: k.back, shirt: k.shirt || 1, team: team, saves: k.saves || 0 };
    return Object.assign(makePerson(-700 - (team.id || 0), personName(hashStr(team.name) + 9), team, 1), { saves: 0 });
  }

  /* ─────────────── durum ─────────────── */

  // attract | intro | play | shoot | flight | result | over
  var state = "attract";
  var stateT = 0;
  var attackIdx = 0;
  var def = defenses[0];
  var points = 0, lives = LIVES, chain = 0, scoreBump = 0;
  var tally = { goals: 0, attacks: 0, beaten: 0, skills: 0, shots: 0, best: 0 };
  var player = null, ball = null, foes = [], gk = null;
  var simTime = 0, slow = 1;
  var touch = null; // aktif dokunuş
  var shootT = 0;
  var outcome = null; // { kind: 'gol'|'kurtaris'|'direk'|'aut'|'kaptirdin', gain, tags }
  var line = null, lineT = 0;
  var excite = 0;
  var hintT = 0; // ilk atakta kontrol ipucu

  function multiplier() {
    return Math.min(5, 1 + Math.floor(chain / 2));
  }

  function newPlayer() {
    return { x: 0, z: START_Z, vx: 0, tx: 0, speed: 0, boost: 0, skill: -1, skillCd: 0, knockCd: 0, lean: 0, stride: 0, down: 0 };
  }
  function newBall() {
    return { x: 0, y: BALL_R, z: START_Z - 0.7, vx: 0, vy: 0, vz: 0, free: false, live: false, shot: false, goal: false, post: false, touched: false, caught: false, out: false, t: 0, curl: 0, wx: 0, wy: 0, knock: false };
  }

  /** Atağı kur: savunma hattı (sayı ve kalite merdivenden), kaleci, oyuncu. */
  function setupAttack(m) {
    attackIdx = m;
    def = defenseAt(m);
    var q = quality(m);
    var n = Math.min(6, 3 + Math.floor(m * 0.75));
    player = newPlayer();
    ball = newBall();
    foes = [];
    var rnd = A.seeded(hashStr(def.team.name) + m * 31 + tally.attacks * 7);
    for (var i = 0; i < n; i++) {
      var f = n > 1 ? i / (n - 1) : 0;
      var z = 42 - f * 19 + (rnd() - 0.5) * 2;
      var side = i % 2 ? 1 : -1;
      var x = side * (0.6 + rnd() * 3.8);
      if (i === 0) x = (rnd() - 0.5) * 2;
      var who = def.defenders[i % def.defenders.length];
      if (i >= def.defenders.length) who = makePerson(-300 - i, personName(hashStr(def.team.name) + i * 5), def.team, 12 + i);
      foes.push({
        id: i,
        who: who,
        x: x,
        z: z,
        homeX: x,
        st: "hold",
        t: 0,
        face: 0,
        passed: false,
        dummied: false,
        // kalite: merdivende yükseldikçe daha erken basar, daha hızlı, daha iyi okur
        pressAt: 10 + 4 * q + rnd() * 2,
        lat: 3.9 + 2.2 * q,
        run: 2.8 + 1.8 * q,
        windAt: 3.5 + 0.5 * Math.min(1, q),
        wind: 0.3 - 0.08 * Math.min(1, q),
        read: 0.55 + 0.4 * Math.min(1, q),
        reach: 2.0 + 0.5 * Math.min(1, q),
      });
    }
    gk = { x: 0, z: KEEPER_Z, dive: null, stay: false, set: 0, crouch: 0.4, reflex: 62 + 30 * Math.min(1, q), plan: null, cheer: 0 };
    gk.person = keeperOf(def);
    shootT = 0;
    slow = 1;
    simTime = 0;
    lastContact = -1;
    outcome = null;
    S3.netReset();
  }
  setupAttack(0);

  function setState(s) {
    state = s;
    stateT = 0;
  }

  function start() {
    points = 0;
    lives = LIVES;
    chain = 0;
    tally = { goals: 0, attacks: 0, beaten: 0, skills: 0, shots: 0, best: 0 };
    A.particles.length = 0;
    A.floaters.length = 0;
    A.banner = null;
    line = null;
    hintT = 0;
    beginAttack(0);
    A.sound("whistle");
  }
  function beginAttack(m) {
    setupAttack(m);
    tally.attacks += 1;
    if (R) rebuildCast();
    setState("intro");
  }

  /* ─────────────── oyuncu hareketi ─────────────── */

  function runSpeed() {
    var base = 6.7 + Math.min(1.5, attackIdx * 0.22);
    var v = base * (1 + 0.06 * attr("pace"));
    if (player.boost > 0) v *= 1.4;
    if (player.skill >= 0 && player.skill < 0.5) v *= 0.82;
    return v;
  }

  function stepPlayer(dt) {
    var p = player;
    var agi = 1 + 0.1 * attr("agility");
    p.speed = A.approach(p.speed, runSpeed(), 9 * dt);
    p.z -= p.speed * dt;
    var latMax = 6.2 * agi;
    var want = A.clamp((p.tx - p.x) * 8, -latMax, latMax);
    p.vx = A.approach(p.vx, want, 42 * agi * dt);
    p.x = A.clamp(p.x + p.vx * dt, -FIELD, FIELD);
    p.lean = A.damp(p.lean, p.vx / latMax, 10, dt);
    p.stride += dt * (4 + p.speed * 0.62);
    p.boost = Math.max(0, p.boost - dt);
    p.skillCd = Math.max(0, p.skillCd - dt);
    p.knockCd = Math.max(0, p.knockCd - dt);
    if (p.skill >= 0) {
      p.skill += dt;
      if (p.skill > 0.6) p.skill = -1;
    }
    // top: ayakta sürülür ya da (depar) önde açıkta yuvarlanır
    var b = ball;
    if (b.free) {
      b.z += b.vz * dt;
      b.x += b.vx * dt;
      b.vz *= Math.exp(-1.6 * dt);
      b.vx *= Math.exp(-1.6 * dt);
      b.wx += (-b.vz / BALL_R) * dt;
      if (p.z - b.z < 0.75) {
        b.free = false;
        b.knock = false;
      }
    } else {
      var ctrl = 1 - 0.18 * attr("control");
      var lead = (0.75 + 0.4 * Math.abs(Math.sin(p.stride * 0.5))) * ctrl;
      b.x = A.damp(b.x, p.x + p.vx * 0.06, 18, dt);
      b.z = p.z - lead;
      b.wx += (p.speed / BALL_R) * dt;
      b.wy += (p.vx / BALL_R) * dt * 0.5;
    }
  }

  /** Çalım (makas): kısa süre müdahaleye karşı korur. */
  function doSkill() {
    var p = player;
    if (p.skillCd > 0 || ball.free) return;
    p.skill = 0;
    p.skillCd = 0.85;
    A.sound("whoosh");
    A.haptic("light");
  }
  /** Topu boşluğa it, depar. */
  function doKnock() {
    var p = player;
    if (p.knockCd > 0 || ball.free) return;
    p.boost = 1.15;
    p.knockCd = 2.2;
    ball.free = true;
    ball.knock = true;
    ball.vz = -(p.speed + 7.5);
    ball.vx = p.vx * 0.4;
    A.sound("kick");
    A.haptic("medium");
  }
  function skillActive() {
    return player.skill >= 0.03 && player.skill <= 0.5;
  }

  /* ─────────────── savunma yapay zekâsı ─────────────── */

  function stepFoes(dt) {
    var p = player;
    for (var i = 0; i < foes.length; i++) {
      var f = foes[i];
      var gap = p.z - f.z; // >0: savunmacı önde
      var dist = Math.hypot(p.x - f.x, gap);
      f.t += dt;
      if (!f.passed && gap < -0.9 && state !== "attract") {
        f.passed = true;
        onPassed(f);
      }
      switch (f.st) {
        case "hold":
          f.x = A.damp(f.x, f.homeX + Math.sin(A.time * 0.9 + i) * 0.4, 2, dt);
          f.face = Math.atan2(p.x - f.x, gap) * 0.6;
          if (gap < f.pressAt && gap > -0.5) {
            f.st = "press";
            f.t = 0;
          }
          break;
        case "press": {
          // yolu kes: oyuncunun birkaç adım sonrasına göre konumlan, öne çık
          var tMeet = A.clamp(gap / Math.max(3, p.speed + f.run), 0.1, 1.2);
          var tx = p.x + p.vx * tMeet * f.read;
          var dx = tx - f.x;
          f.x += A.clamp(dx * 4, -f.lat, f.lat) * dt;
          if (gap > 1.4) f.z += f.run * dt;
          f.face = Math.atan2(p.x - f.x, Math.max(0.4, gap));
          if (dist < f.windAt && gap > -0.2) {
            f.st = "windup";
            f.t = 0;
            var lead = f.wind + 0.14;
            f.aimX = p.x + p.vx * lead * f.read;
            f.aimZ = p.z - p.speed * lead * 0.9;
          }
          if (gap < -0.8) f.st = "beaten";
          break;
        }
        case "windup":
          f.face = Math.atan2(f.aimX - f.x, f.aimZ - f.z);
          if (f.t >= f.wind) {
            f.st = "lunge";
            f.t = 0;
            f.fromX = f.x;
            f.fromZ = f.z;
            // çalım: hazırlık sürerken atılan makas savunmacıyı yanlış tarafa kaydırır
            var fooled = player.skill >= 0 && player.skill <= 0.5 && dist < f.windAt + 1.5 && !ball.free && (state === "play" || state === "shoot");
            if (fooled) {
              f.dummied = true;
              f.aimX = player.x + (player.x >= f.x ? -1.6 : 1.6);
              onDummy(f);
            }
            var lx = f.aimX - f.x, lz = f.aimZ - f.z;
            var ll = Math.hypot(lx, lz) || 1;
            f.dirX = lx / ll;
            f.dirZ = lz / ll;
            f.len = Math.min(f.reach, ll + 0.3);
            A.sound("whoosh");
          }
          break;
        case "lunge": {
          var pr = A.clamp(f.t / 0.32, 0, 1);
          var e = 1 - (1 - pr) * (1 - pr);
          f.x = f.fromX + f.dirX * f.len * e;
          f.z = f.fromZ + f.dirZ * f.len * e;
          var fx = f.x + f.dirX * 0.55, fz = f.z + f.dirZ * 0.55;
          if (state === "play" || state === "shoot") {
            var dp = Math.hypot(p.x - fx, p.z - fz), db = Math.hypot(ball.x - fx, ball.z - fz);
            if (!f.dummied && (dp < 0.8 || db < 0.55)) {
              if (skillActive() && !ball.free) {
                f.dummied = true;
                f.st = "down";
                f.t = 0;
                onDummy(f);
              } else {
                f.st = "down";
                f.t = 0;
                loseBall("tackle", f);
                return;
              }
            }
          }
          if (pr >= 1) {
            f.st = "down";
            f.t = 0;
          }
          break;
        }
        case "down":
          if (f.t > 1.3) f.st = "beaten";
          break;
        case "beaten":
          // kalkar, geriden kovalar (yetişemez)
          if (gap > -12) f.z -= Math.min(p.speed * 0.75, 5.5) * dt;
          f.x = A.damp(f.x, p.x + (i % 2 ? 1.6 : -1.6), 1.2, dt);
          f.face = Math.PI;
          break;
      }
      // dik duran savunmacıya çarpmak: top kaybı
      if ((f.st === "hold" || f.st === "press" || f.st === "windup") && dist < 0.6 && (state === "play" || state === "shoot")) {
        if (skillActive() && !f.dummied) {
          // makasla etrafından dolan: savunmacı ters ayağa kalır
          f.dummied = true;
          f.st = "down";
          f.t = 0;
          onDummy(f);
        } else if (!f.dummied) {
          loseBall("bump", f);
          return;
        }
      }
      // açıktaki topu araya girerek alma
      if (ball.free && f.st !== "down" && f.st !== "beaten" && Math.hypot(ball.x - f.x, ball.z - f.z) < 1.05 && (state === "play" || state === "shoot")) {
        loseBall("intercept", f);
        return;
      }
    }
  }

  function onPassed(f) {
    if (state !== "play" && state !== "shoot") return;
    chain += 1;
    tally.beaten += 1;
    tally.best = Math.max(tally.best, chain);
    var gain = (f.dummied ? 0 : 100) * multiplier();
    var tags = [];
    if (player.boost > 0 && !f.dummied) {
      gain += 50;
      tags.push("DEPAR");
    }
    if (gain) {
      points += gain;
      scoreBump = 1;
      var sp = screenOf(f.x, 2.1, f.z);
      A.floatText((tags[0] ? tags[0] + " " : "GEÇTİN ") + "+" + gain, sp.x, sp.y, "#FFFFFF", 20);
    }
    if (chain % 2 === 0) {
      var m = multiplier();
      if (m > 1) A.floatText("ÇARPAN ×" + m, W / 2, H * 0.4, P.gold, 22);
    }
    A.sound("gate");
    A.haptic("light");
  }
  function onDummy(f) {
    tally.skills += 1;
    var gain = 150 * multiplier();
    points += gain;
    scoreBump = 1;
    excite = Math.max(excite, 0.6);
    var sp = screenOf(f.x, 2.1, f.z);
    A.floatText("ÇALIM! +" + gain, sp.x, sp.y, P.gold, 24);
    A.sound("coin");
    A.haptic("success");
    line = { text: A.pick([runner.short + " " + f.who.short + "'u yere oturttu!", "Makas! " + f.who.short + " boşa kaydı.", "Ne çalım! " + runner.short]), good: true };
    lineT = 0;
  }

  function loseBall(kind, f) {
    chain = 0;
    player.down = 1;
    var who = f ? f.who.short : "";
    A.shake(8);
    A.sound("crash");
    A.haptic("error");
    var text = kind === "intercept" ? who + " araya girdi" : kind === "bump" ? who + " yolu kapattı" : who + " kayarak topu aldı";
    finishAttack({ kind: "kaptirdin", gain: 0, tags: [], text: text });
  }

  /* ─────────────── şut ve kaleci ─────────────── */

  var shot = null;
  function takeShot(dx, dy, ms) {
    if (state !== "shoot") return;
    var len = Math.hypot(dx, dy);
    var tx = A.clamp((dx / (W * 0.3)) * HALF, -HALF - 1, HALF + 1);
    var ty = A.clamp(0.25 + ((-dy - 60) / (H * 0.42)) * 2.3, 0.15, 3.1);
    var swipeSpeed = len / Math.max(60, ms);
    var speed = A.clamp(15 + swipeSpeed * 8, 16, 27.5);
    var d = Math.hypot(ball.x, ball.z);
    var near = foes.some(function (f) {
      return (f.st === "press" || f.st === "windup" || f.st === "lunge") && Math.hypot(f.x - player.x, f.z - player.z) < 2.2;
    });
    var sig = (0.16 + 0.012 * d) * (1.15 - 0.3 * attr("control")) * (near ? 1.5 : 1) * (1 + (speed - 22) * 0.02);
    tx += A.gauss(0, sig);
    ty = Math.max(BALL_R, ty + A.gauss(0, sig * 0.6));
    shot = { tx: tx, ty: ty, speed: speed };
    tally.shots += 1;
    launch(ball, tx, ty, speed, -Math.sign(tx - ball.x) * 1.2);
    keeperPlan();
    setState("flight");
    slow = 1;
    A.sound("kick");
    A.haptic("medium");
  }
  function autoShot() {
    // geç kalınan şut: zayıf ve ortaya
    takeShotRaw(A.rand(-1, 1), A.rand(0.3, 0.9), 15);
  }
  function takeShotRaw(tx, ty, speed) {
    shot = { tx: tx, ty: ty, speed: speed };
    tally.shots += 1;
    launch(ball, tx, ty, speed, 0);
    keeperPlan();
    setState("flight");
    slow = 1;
    A.sound("kick");
  }
  function launch(b, tx, ty, speed, curl) {
    b.free = false;
    b.live = true;
    b.shot = true;
    b.t = 0;
    var dx = tx - b.x, dz = 0 - b.z;
    var ft = Math.hypot(dx, dz) / speed;
    b.vx = dx / ft - 0.5 * curl * ft;
    b.vz = dz / ft;
    b.vy = (ty - b.y + 0.5 * GRAV * ft * ft) / ft;
    b.curl = curl;
  }

  /** Kaleci gövdesi: penaltıdaki gibi kapsül (ayak → eller) + eldiven. */
  var DIVE_REACH = 1.75, ARM = 1.05;
  function keeperBody(k, now) {
    var cx = k.x, cy = 0.98 - k.crouch * 0.12, ax = 0, ay = 1, e = 0;
    if (k.dive) {
      var d = k.dive;
      var p = A.clamp((now - d.t0) / d.dur, 0, 1);
      e = 1 - (1 - p) * (1 - p);
      cx = k.x + d.dx * d.reach * e;
      cy = Math.max(0.32, 0.98 + d.dy * d.reach * e - Math.abs(d.dx) * 0.42 * e);
      var ang = Math.atan2(d.dx, Math.max(0.05, d.dy + 0.25)) * Math.min(1, e * 1.4);
      ax = Math.sin(ang);
      ay = Math.cos(ang);
    }
    return { cx: cx, cy: cy, ax: ax, ay: ay, e: e, diving: !!k.dive };
  }
  function keeperContact(k, now, bx, by) {
    var b = keeperBody(k, now);
    var r = BALL_R;
    if (!b.diving) {
      var segY = A.clamp(by, 0.1, 1.78);
      var dB = Math.hypot(bx - b.cx, by - segY);
      if (dB < r + 0.26) return { hit: true, nx: (bx - b.cx) / (dB || 1), ny: (by - segY) / (dB || 1) };
      for (var s = -1; s <= 1; s += 2) {
        var hx = b.cx + s * 0.48, hy = 1.15;
        var dH = Math.hypot(bx - hx, by - hy);
        if (dH < r + 0.17) return { hit: true, nx: (bx - hx) / (dH || 1), ny: (by - hy) / (dH || 1) };
      }
      return { hit: false };
    }
    var fx = b.cx - b.ax * 0.9, fy = b.cy - b.ay * 0.9;
    var hx2 = b.cx + b.ax * ARM, hy2 = b.cy + b.ay * ARM;
    var vx = hx2 - fx, vy = hy2 - fy;
    var t = A.clamp(((bx - fx) * vx + (by - fy) * vy) / (vx * vx + vy * vy), 0, 1);
    var px = fx + vx * t, py = fy + vy * t;
    var d2 = Math.hypot(bx - px, by - py);
    if (d2 < r + (t > 0.8 ? 0.25 : 0.22)) return { hit: true, nx: (bx - px) / (d2 || 1), ny: (by - py) / (d2 || 1) };
    return { hit: false };
  }
  function keeperPlan() {
    var q = quality(attackIdx);
    gk.plan = { at: simTime + (0.24 - 0.1 * Math.min(1, q)) };
  }
  function keeperThink() {
    var k = gk;
    if (!k.plan || k.dive || simTime < k.plan.at) return;
    k.plan = null;
    var b = ball;
    var ft = b.vz < -0.1 ? (k.z - b.z) / b.vz : 0.5;
    var px = b.x + b.vx * ft + 0.5 * b.curl * ft * ft;
    var py = b.y + b.vy * ft - 0.5 * GRAV * ft * ft;
    var q = Math.min(1, quality(attackIdx));
    var err = (0.58 - 0.28 * q) * (Math.hypot(b.vx, b.vz) / 24);
    px += A.gauss(0, err);
    py = A.clamp(py + A.gauss(0, err * 0.6), 0.2, 2.3);
    var dx = px - k.x, dy = py - 0.98;
    var need = Math.hypot(dx, dy);
    if (need < 0.55) {
      k.stay = true;
      k.set = 1;
      return;
    }
    k.dive = { t0: simTime, dx: dx / need, dy: dy / need, reach: A.clamp(need - ARM * 0.6, 0, DIVE_REACH), dur: 0.54 - 0.1 * ((k.reflex - 50) / 49) };
  }

  var lastContact = -1;
  function stepShot(dt) {
    var b = ball;
    if (!b.live || b.caught) return;
    b.t += dt;
    b.vy -= GRAV * dt;
    b.vx += b.curl * dt;
    var pz = b.z;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.z += b.vz * dt;
    b.wx += (-b.vz / BALL_R) * dt * 0.25;
    b.wy += b.vx * dt;
    if (b.y < BALL_R) {
      b.y = BALL_R;
      if (b.vy < 0) b.vy = Math.abs(b.vy) > 1.2 ? -b.vy * 0.5 : 0;
      b.vx *= 1 - 2 * dt;
      b.vz *= 1 - 2 * dt;
      b.curl = 0;
    }
    if (Math.abs(b.z) < BALL_R + POST_R + 0.05) {
      [-1, 1].forEach(function (s) {
        var px = s * (HALF + POST_R);
        if (b.y > GOAL_H + POST_R) return;
        var d = Math.hypot(b.x - px, b.z);
        if (d < BALL_R + POST_R) {
          var nx = (b.x - px) / d, nz = b.z / d;
          var vn = b.vx * nx + b.vz * nz;
          if (vn < 0) {
            b.vx -= 1.75 * vn * nx;
            b.vz -= 1.75 * vn * nz;
            b.post = true;
            A.sound("post");
          }
        }
      });
      if (Math.abs(b.x) < HALF + POST_R) {
        var dy = b.y - (GOAL_H + POST_R);
        var d2 = Math.hypot(dy, b.z);
        if (d2 < BALL_R + POST_R) {
          var ny = dy / d2, nz2 = b.z / d2;
          var vn2 = b.vy * ny + b.vz * nz2;
          if (vn2 < 0) {
            b.vy -= 1.7 * vn2 * ny;
            b.vz -= 1.7 * vn2 * nz2;
            b.post = true;
            A.sound("post");
          }
        }
      }
    }
    if (!b.goal && b.vz < 0 && Math.abs(b.z - gk.z) < BALL_R + 0.3 && simTime - lastContact > 0.15) {
      var c = keeperContact(gk, simTime, b.x, b.y);
      if (c.hit) {
        lastContact = simTime;
        b.touched = true;
        var speed = Math.hypot(b.vx, b.vy, b.vz);
        if (speed < 13 && (!gk.dive || keeperBody(gk, simTime).e > 0.9)) {
          b.caught = true;
          b.vx = b.vy = b.vz = 0;
        } else {
          b.vz = Math.abs(b.vz) * 0.35 + 1.5;
          b.vx = c.nx * speed * 0.35 + b.vx * 0.15;
          b.vy = Math.max(1.2, c.ny * speed * 0.3 + 2.4);
          b.curl = 0;
        }
        A.sound("tap");
      }
    }
    if (!b.goal && !b.out && pz >= -BALL_R && b.z < -BALL_R) {
      if (Math.abs(b.x) < HALF - 0.01 && b.y < GOAL_H - 0.01) {
        b.goal = true;
        A.sound("net");
      } else b.out = true;
    }
    if (b.goal) {
      var depth = -b.z, backAt = NET_D - BALL_R - 0.05;
      if (depth > backAt) {
        b.z = -backAt;
        S3.netHit(b.x, b.y, Math.abs(b.vz));
        b.vz = Math.abs(b.vz) * 0.08;
      }
      if (Math.abs(b.x) > HALF - BALL_R) {
        b.x = Math.sign(b.x) * (HALF - BALL_R);
        b.vx *= -0.2;
      }
      var top = GOAL_H + ((NET_BACK_H - GOAL_H) * Math.min(NET_D, depth)) / NET_D - BALL_R;
      if (b.y > top) {
        b.y = top;
        b.vy = -Math.abs(b.vy) * 0.2;
      }
      b.vx *= 1 - 2.5 * dt;
      b.vz *= 1 - 1.5 * dt;
    }
    if (b.z < -5) {
      b.z = -5;
      b.vz = Math.abs(b.vz) * 0.25;
    }
  }
  function judge() {
    var b = ball;
    if (b.goal) return b.t > 0.12 ? "gol" : null;
    if (b.caught) return "kurtaris";
    var speed = Math.hypot(b.vx, b.vy, b.vz);
    if (b.out || b.z < -0.6) return b.post ? "direk" : b.touched ? "kurtaris" : "aut";
    if (b.vz > 0.5 && b.z > 0.6) return b.touched ? "kurtaris" : b.post ? "direk" : "aut";
    if (b.t > 3 || (speed < 0.6 && b.t > 0.6)) return b.touched ? "kurtaris" : b.post ? "direk" : "aut";
    return null;
  }

  /* ─────────────── atak sonu ─────────────── */

  function finishAttack(res) {
    outcome = res;
    slow = 1;
    if (res.kind === "gol") {
      tally.goals += 1;
      var gain = 500;
      if (Math.abs(ball.x) > 2.4) {
        gain += 150;
        res.tags.push("KÖŞE");
      }
      if (foes.every(function (f) { return f.passed; })) {
        gain += 300;
        res.tags.push("SOLO");
      }
      res.gain = gain;
      points += gain;
      scoreBump = 1;
      excite = 1;
      A.sound("cheer");
      A.haptic("success");
      A.shake(6);
      confetti();
      line = { text: A.pick([runner.short + " bütün savunmayı geçti, GOL!", "Ağlar havalandı! " + runner.short, runner.short + " " + gk.person.short + "'i avlattı!"]), good: true };
    } else {
      lives -= 1;
      A.sound("groan");
      if (res.kind !== "kaptirdin") A.haptic("warning");
      var txt = res.text || (res.kind === "kurtaris" ? gk.person.short + " izin vermedi!" : res.kind === "direk" ? "Direkten döndü!" : "Top auta gitti.");
      line = { text: txt, good: false };
    }
    lineT = 0;
    setState("result");
  }

  function confetti() {
    if (!R) return;
    var p = screenOf(ball.x, ball.y, ball.z);
    var kit = kitOf(runner);
    A.burst(p.x, p.y, 70, { angle: -Math.PI / 2, spread: Math.PI * 1.3, speed: 420, gravity: 520, life: 1.6, size: 7, color: [kit.primary, kit.secondary, "#FFD24A", "#FFFFFF"], shape: "confetti", drag: 1.4 });
  }

  /* ─────────────── güncelleme ─────────────── */

  function update(dt) {
    scoreBump = Math.max(0, scoreBump - dt * 4);
    excite = Math.max(0, excite - dt * 0.35);
    lineT += dt;
    hintT += dt;
    stateT += dt;
    var sdt = dt * slow;
    simTime += sdt;
    S3.netStep(dt);
    switch (state) {
      case "attract":
        // vitrin: yapay oyuncu boşluğa sürer
        player.tx = Math.sin(A.time * 0.4) * 4;
        stepPlayer(dt);
        stepFoes(dt);
        if (player.z < 22) setupAttack(attackIdx);
        return;
      case "intro":
        if (stateT >= INTRO) {
          setState("play");
          A.sound("whistle");
        }
        return;
      case "play":
        stepPlayer(sdt);
        stepFoes(sdt);
        if (state !== "play") return;
        if (player.z <= BOX_Z && !ball.free) {
          setState("shoot");
          shootT = 0;
          slow = SLOW;
          A.haptic("medium");
        }
        return;
      case "shoot":
        shootT += dt;
        stepPlayer(sdt);
        stepFoes(sdt);
        if (state !== "shoot") return;
        // kaleci açıyı daraltır: topa doğru çizgiden çıkar, yana kayar
        gk.x = A.damp(gk.x, A.clamp(player.x * 0.32, -2, 2), 3, sdt);
        gk.z = A.damp(gk.z, A.clamp(KEEPER_Z + (BOX_Z - player.z) * 0.16, KEEPER_Z, 2.6), 2.5, sdt);
        if (shootT > SHOT_WINDOW || player.z < 7) autoShot();
        return;
      case "flight":
        player.speed = A.approach(player.speed, 0, 12 * dt);
        player.z -= player.speed * dt;
        stepFoes(dt * 0.3);
        keeperThink();
        stepShot(dt);
        var res = judge();
        if (res) finishAttack({ kind: res, gain: 0, tags: [] });
        return;
      case "result":
        if (ball.live) stepShot(dt);
        gk.cheer = Math.min(1, gk.cheer + dt * 2);
        if (stateT >= RESULT) {
          if (outcome.kind === "gol") beginAttack(attackIdx + 1);
          else if (lives <= 0) finish();
          else {
            setupAttack(attackIdx);
            tally.attacks += 1;
            if (R) rebuildCast();
            setState("intro");
            stateT = INTRO - 1.0; // tekrar denemede kısa tanıtım
          }
        }
        return;
    }
  }

  function finish() {
    setState("over");
    A.sound("over");
    A.send("over", {
      score: points,
      stats: {
        goals: tally.goals,
        attacks: tally.attacks,
        beaten: tally.beaten,
        skills: tally.skills,
        bestChain: tally.best,
        defense: Math.min(attackIdx, defenses.length - 1) + 1,
        defenses: defenses.length,
      },
    });
  }

  /* ─────────────── girdi ─────────────── */

  var STEER = 13; // ekran genişliği başına metre
  function down(p) {
    touch = { x: p.x, y: p.y, x0: p.x, y0: p.y, t0: A.time, moved: 0, steered: false };
  }
  function move(p) {
    if (!touch) return;
    var dx = p.x - touch.x;
    touch.moved = Math.max(touch.moved, Math.hypot(p.x - touch.x0, p.y - touch.y0));
    if (state === "play" || state === "shoot") {
      // yatay sürükleme: yön (şut anında yukarı kaydırma şuttur, yön de verir)
      var vy = p.y - touch.y0, vx = p.x - touch.x0;
      if (state === "play" || Math.abs(vy) < Math.abs(vx) * 0.8) {
        player.tx = A.clamp(player.tx + (dx / W) * STEER, -FIELD, FIELD);
        if (Math.abs(dx) > 0.5) touch.steered = true;
      }
    }
    touch.x = p.x;
    touch.y = p.y;
  }
  function up(p) {
    if (!touch) return;
    var t = touch;
    touch = null;
    var dx = p.x - t.x0, dy = p.y - t.y0;
    var ms = (A.time - t.t0) * 1000;
    if (state === "shoot") {
      if (dy < -40 && -dy > Math.abs(dx) * 0.5) takeShot(dx, dy, ms);
      return;
    }
    if (state !== "play") return;
    if (t.moved < 12 && ms < 320) doSkill();
    else if (dy < -55 && -dy > Math.abs(dx) * 1.4 && ms < 420) doKnock();
  }

  /* ═══════════════════════════ 3B ÇİZİM ═══════════════════════════ */

  var K = A.T3;
  var R = null;
  var glFailed = false;
  var tmpV = null;

  function screenOf(x, y, z) {
    if (!R) return { x: W / 2, y: H * 0.6, s: 30 };
    tmpV.set(x, y, z);
    var dist = R.camera.position.distanceTo(tmpV);
    tmpV.project(R.camera);
    var s = H / (2 * Math.tan((R.camera.fov * Math.PI) / 360) * Math.max(0.3, dist));
    return { x: (tmpV.x * 0.5 + 0.5) * W, y: (-tmpV.y * 0.5 + 0.5) * H, s: s, behind: tmpV.z > 1 };
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
      renderer.toneMappingExposure = 1.0;
      renderer.outputColorSpace = T.SRGBColorSpace;
      K.init(renderer);
      var scene = new T.Scene();
      scene.background = new T.Color(0x040714);
      scene.fog = new T.FogExp2(0x0b1230, 0.006);
      var camera = new T.PerspectiveCamera(50, 1, 0.1, 500);
      tmpV = new T.Vector3();
      R = { renderer: renderer, scene: scene, camera: camera, U: { time: { value: 0 }, excite: { value: 0 } }, cast: {}, foes: [] };
      S3.build(R);
      buildRings();
      rebuildCast();
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
    R.camera.aspect = W / Math.max(1, H);
    R.camera.updateProjectionMatrix();
  }

  /** Müdahale uyarısı: savunmacının önünde yerde dolan kırmızı halka. */
  function buildRings() {
    var tex = K.canvasTex(128, 128, function (c) {
      c.clearRect(0, 0, 128, 128);
      c.strokeStyle = "rgba(255,255,255,1)";
      c.lineWidth = 10;
      c.beginPath();
      c.arc(64, 64, 52, 0, Math.PI * 2);
      c.stroke();
      var g = c.createRadialGradient(64, 64, 0, 64, 64, 56);
      g.addColorStop(0, "rgba(255,255,255,0.0)");
      g.addColorStop(1, "rgba(255,255,255,0.35)");
      c.fillStyle = g;
      c.beginPath();
      c.arc(64, 64, 56, 0, Math.PI * 2);
      c.fill();
    });
    R.rings = [];
    for (var i = 0; i < 6; i++) {
      var m = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, color: 0xff3b5c, toneMapped: false }));
      m.rotation.x = -Math.PI / 2;
      m.position.y = 0.02;
      m.visible = false;
      R.scene.add(m);
      R.rings.push(m);
    }
    // oyuncunun altında hafif halka (kendini bul)
    R.meRing = new T.Mesh(new T.PlaneGeometry(1.3, 1.3), new T.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, color: 0xffd24a, opacity: 0.55, toneMapped: false }));
    R.meRing.rotation.x = -Math.PI / 2;
    R.meRing.position.y = 0.015;
    R.scene.add(R.meRing);
    // topun altında yumuşak beyaz ışık: sürerken top gözden kaçmasın
    var glowT = K.canvasTex(64, 64, function (c) {
      var g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, "rgba(255,255,255,0.9)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      c.fillStyle = g;
      c.fillRect(0, 0, 64, 64);
    });
    R.ballGlow = new T.Mesh(new T.PlaneGeometry(0.75, 0.75), new T.MeshBasicMaterial({ map: glowT, transparent: true, depthWrite: false, opacity: 0.55, toneMapped: false }));
    R.ballGlow.rotation.x = -Math.PI / 2;
    R.scene.add(R.ballGlow);
  }

  function athlete(key, person, opts) {
    var cur = R.cast[key];
    var sig = person.id + ":" + (person.team && person.team.kit ? person.team.kit.primary : "") + ":" + (opts.keeper ? 1 : 0);
    if (cur && cur.sig === sig) return cur.a;
    if (cur) {
      R.scene.remove(cur.a.root);
      K.disposeTree(cur.a.root);
    }
    var a = K.makeAthlete(person, opts);
    R.scene.add(a.root);
    if (!cur) R.cast[key] = { shadows: S3.shadowSet() };
    R.cast[key].a = a;
    R.cast[key].sig = sig;
    return a;
  }
  function rebuildCast() {
    if (!R) return;
    athlete("runner", runner, { keeper: false });
    athlete("keeper", S3.asKeeper(gk.person, kitOf(runner).primary), { keeper: true, detail: "lo" });
    for (var i = 0; i < 6; i++) {
      var f = foes[i];
      if (f) {
        var a = athlete("foe" + i, f.who, { keeper: false, detail: "lo" });
        a.root.visible = true;
      } else if (R.cast["foe" + i]) R.cast["foe" + i].a.root.visible = false;
    }
    S3.paintCrowd(kitOf(runner), kitOf(def));
  }

  /* ─────────────── pozlar ─────────────── */

  function poseRunner(a) {
    var J = a.J;
    K.rest(a);
    var p = player;
    a.root.position.set(p.x, 0, p.z);
    a.root.rotation.y = Math.PI - p.vx * 0.06;
    if (state === "result" && outcome) {
      if (outcome.kind === "gol") {
        // sevinç: köşe bayrağına uçak
        var c = Math.min(1, stateT / 1.6);
        a.root.rotation.y = Math.PI + (p.x > 0 ? -0.9 : 0.9);
        a.root.position.x = p.x + (p.x > 0 ? 1 : -1) * c * 3.5;
        a.root.position.z = p.z - c * 2;
        K.runCycle(a, stateT * 9, 0.9 * (1 - c * 0.5));
        J.sha.rotation.z = 1.45;
        J.shb.rotation.z = -1.45;
        J.spine.rotation.z = Math.sin(stateT * 2.5) * 0.18;
        return;
      }
      if (outcome.kind === "kaptirdin") {
        // yere düşer
        var d = Math.min(1, stateT / 0.35);
        a.root.rotation.x = -d * 1.35;
        a.root.position.y = d * 0.15;
        J.sha.rotation.x = -2.2 * d;
        J.shb.rotation.x = -2.2 * d;
        return;
      }
      J.sha.rotation.x = -2.5;
      J.shb.rotation.x = -2.5;
      J.sha.rotation.z = 0.7;
      J.shb.rotation.z = -0.7;
      J.ela.rotation.x = -2.1;
      J.elb.rotation.x = -2.1;
      J.head.rotation.x = 0.35;
      return;
    }
    if (state === "intro") {
      K.play(a, "idle", A.time, 1);
      return;
    }
    if (state === "flight") {
      // şut: bacak öne savrulur
      var k = Math.min(1, stateT / 0.22);
      J.hpb.rotation.x = A.lerp(0.8, -1.3, A.easeOut(k));
      J.knb.rotation.x = A.lerp(1.4, 0.15, A.easeOut(k));
      J.sha.rotation.z = 1.0;
      J.shb.rotation.z = -0.5;
      J.spine.rotation.x = -0.1;
      return;
    }
    var amp = A.clamp(p.speed / 7, 0.4, 1.1);
    K.runCycle(a, p.stride, amp);
    a.root.rotation.z = p.lean * 0.3;
    J.spine.rotation.x = 0.06;
    if (p.skill >= 0) {
      // makas: bacak topun üstünden döner, gövde aldatır
      var s = Math.sin((p.skill / 0.5) * Math.PI);
      a.clipW = 1 - s * 0.7;
      J.hpa.rotation.x = -0.6 * s;
      J.hpa.rotation.z = 0.5 * s;
      J.kna.rotation.x = 0.8 * s;
      J.spine.rotation.z = -0.35 * s;
      J.sha.rotation.z = 0.9 * s;
      J.shb.rotation.z = -0.9 * s;
      a.root.rotation.y += 0.4 * s;
    }
    if (state === "shoot") {
      // şuta hazırlık: gövde topun üstünde
      J.spine.rotation.x = 0.12;
    }
  }

  function poseFoe(a, f) {
    var J = a.J;
    K.rest(a);
    a.root.position.set(f.x, 0, f.z);
    a.root.rotation.y = f.face;
    switch (f.st) {
      case "hold":
        // yan pozisyon: dizler kırık, kollar açık
        J.hips.position.y = 0.86;
        J.hpa.rotation.x = -0.35;
        J.hpb.rotation.x = -0.35;
        J.kna.rotation.x = 0.7;
        J.knb.rotation.x = 0.7;
        J.hpa.rotation.z = 0.18;
        J.hpb.rotation.z = -0.18;
        J.spine.rotation.x = 0.3;
        J.sha.rotation.z = 0.5;
        J.shb.rotation.z = -0.5;
        return;
      case "press":
        K.runCycle(a, A.time * 10 + f.id, 0.8);
        J.spine.rotation.x = 0.12;
        return;
      case "windup":
        // çöker, ağırlık destek bacağında
        var w = Math.min(1, f.t / f.wind);
        J.hips.position.y = 0.94 - 0.18 * w;
        J.hpa.rotation.x = -0.6 * w;
        J.kna.rotation.x = 1.0 * w;
        J.hpb.rotation.x = 0.3 * w;
        J.knb.rotation.x = 0.6 * w;
        J.spine.rotation.x = 0.35 * w;
        J.sha.rotation.z = 0.7;
        J.shb.rotation.z = -0.7;
        return;
      case "lunge":
      case "down": {
        // kayarak müdahale: gövde geriye yatar, ön bacak uzanır
        var e = f.st === "lunge" ? Math.min(1, f.t / 0.2) : 1;
        a.root.rotation.x = 1.1 * e;
        a.root.position.y = 0.32 * e;
        J.hpa.rotation.x = -1.5 * e;
        J.kna.rotation.x = 0.1;
        J.hpb.rotation.x = -0.4 * e;
        J.knb.rotation.x = 1.6 * e;
        J.sha.rotation.x = 0.8 * e;
        J.shb.rotation.z = -1.2 * e;
        J.sha.rotation.z = 0.9 * e;
        if (f.st === "down" && f.dummied) a.root.rotation.z = Math.sin(f.t * 3) * 0.1;
        return;
      }
      case "beaten":
        K.runCycle(a, A.time * 9 + f.id, 0.7);
        return;
    }
  }

  function poseKeeper(a) {
    var J = a.J;
    K.rest(a);
    var k = gk;
    var b = keeperBody(k, simTime);
    if (!b.diving) {
      var cr = k.stay ? 1 : 0.7;
      a.root.position.set(b.cx, 0, k.z);
      a.root.rotation.y = 0;
      J.hips.position.y = 0.94 - cr * 0.14;
      J.hpa.rotation.x = -0.45 * cr;
      J.hpb.rotation.x = -0.45 * cr;
      J.kna.rotation.x = 0.9 * cr;
      J.knb.rotation.x = 0.9 * cr;
      J.hpa.rotation.z = 0.2;
      J.hpb.rotation.z = -0.2;
      J.spine.rotation.x = 0.3 * cr;
      J.sha.rotation.z = 0.75;
      J.shb.rotation.z = -0.75;
      J.sha.rotation.x = -0.5;
      J.shb.rotation.x = -0.5;
      J.ela.rotation.x = -0.6;
      J.elb.rotation.x = -0.6;
      if (ball.caught) {
        J.sha.rotation.x = J.shb.rotation.x = -1.3;
        J.sha.rotation.z = 0.25;
        J.shb.rotation.z = -0.25;
        J.ela.rotation.x = J.elb.rotation.x = -1.4;
      }
      return;
    }
    var cy = b.cy;
    if (state === "result") cy = A.lerp(cy, 0.3, Math.min(1, stateT / 0.6));
    a.root.rotation.z = Math.atan2(-b.ax, b.ay);
    a.root.position.set(b.cx - b.ax * 0.95, cy - b.ay * 0.95, k.z);
    var e = b.e;
    J.sha.rotation.z = A.lerp(0.7, 2.95, e);
    J.shb.rotation.z = A.lerp(-0.7, -2.95, e);
    J.hpa.rotation.x = 0.15 * e;
    J.hpb.rotation.x = 0.35 * e;
    J.kna.rotation.x = 0.35 * e;
    J.knb.rotation.x = 0.7 * e;
  }

  /* ─────────────── kamera ─────────────── */

  var camPos = null, camLook = null, camFov = 50;
  function placeCamera(dt) {
    var cam = R.camera;
    var p = player;
    var view, follow = 5;
    if (state === "attract") {
      var a = A.time * 0.1;
      view = { pos: [Math.sin(a) * 18, 9, p.z + 14], look: [0, 0, p.z - 14], fov: 52 };
      follow = 2;
    } else if (state === "intro") {
      var e = A.smooth(Math.min(1, stateT / (INTRO * 0.9)));
      // savunma hattı üstünden süzülüp oyuncunun arkasına
      // geniş açı: atakçının arkasından bütün savunma hattı ve kale, sonra omuz üstü
      view = {
        pos: [A.lerp(0, p.x * 0.7 + 1.6, e), A.lerp(17, 5.0, e), A.lerp(p.z + 16, p.z + 7.0, e)],
        look: [A.lerp(0, p.x * 0.8, e), A.lerp(0, 0.6, e), A.lerp(18, p.z - 9, e)],
        fov: A.lerp(58, S3.fitFov(11, 12, W, H, 40, 68), e),
      };
      follow = 20;
    } else if (state === "shoot") {
      // ceza sahası: alçak, kaleye bakan
      view = { pos: [p.x * 0.85, 2.4, p.z + 5.2], look: [p.x * 0.25, 1.0, 0], fov: S3.fitFov(GOAL_W * 1.6, p.z + 5.2, W, H, 30, 64) };
      follow = 5;
    } else if (state === "flight" || (state === "result" && outcome && outcome.kind !== "kaptirdin")) {
      if (state === "result" && outcome.kind === "gol" && stateT > 0.6) {
        // ters açı: kale arkasından golcü
        view = { pos: [ball.x * 0.4 + (p.x > 0 ? -3 : 3), 2.2, -4.2], look: [p.x, 1.0, p.z], fov: 46 };
        follow = 3;
      } else {
        view = { pos: [p.x * 0.6 + ball.x * 0.2, 2.3, Math.max(4, p.z + 4.5 - (state === "flight" ? stateT * 6 : 0))], look: [ball.x * 0.5, 1.1, 0], fov: 50 };
        follow = 4;
      }
    } else {
      // omuz üstü takip: hafif sağdan ve yüksekten (top bacakların arkasında kalmasın)
      view = { pos: [p.x * 0.7 + 1.6, 5.0, p.z + 7.0], look: [p.x * 0.8, 0.6, p.z - 9], fov: S3.fitFov(11, 12, W, H, 40, 68) };
      follow = 6;
    }
    var want = new T.Vector3(view.pos[0], view.pos[1], view.pos[2]);
    var look = new T.Vector3(view.look[0], view.look[1], view.look[2]);
    if (A.shakeAmt > 0.2) {
      want.x += (Math.random() - 0.5) * A.shakeAmt * 0.012;
      want.y += (Math.random() - 0.5) * A.shakeAmt * 0.012;
    }
    if (!camPos) {
      camPos = want.clone();
      camLook = look.clone();
      camFov = view.fov;
    } else {
      var k = 1 - Math.exp(-follow * dt);
      camPos.lerp(want, k);
      camLook.lerp(look, k);
      camFov += (view.fov - camFov) * k;
    }
    cam.position.copy(camPos);
    cam.lookAt(camLook);
    if (Math.abs(cam.fov - camFov) > 0.01) {
      cam.fov = camFov;
      cam.updateProjectionMatrix();
    }
  }

  /* ─────────────── sahne güncellemesi ─────────────── */

  function sync(dt) {
    R.U.time.value = A.time;
    R.U.excite.value = state === "attract" ? 0 : Math.max(excite, state === "result" && outcome && outcome.kind === "gol" ? 1 : 0);
    var mk = kitOf(runner), dk = kitOf(def);
    S3.paintLed(mk.primary, dk.primary);
    S3.paintBoards(state === "result" && outcome && outcome.kind === "gol" ? "GOOOL!  " + upperTR(runner.back || runner.short) + "   •   " : "ELİTLİG ARENA   •   SLALOM ATAĞI   •   " + upperTR(teamName(runner)) + "  vs  " + upperTR(teamName(def)) + "   •   ");
    R.boardTex.offset.x = (A.time * 0.04) % 1;
    R.ledTex.offset.x = (A.time * 0.02) % 1;

    // top
    R.ball.position.set(ball.x, ball.y * 1.25, ball.z);
    R.ball.scale.setScalar(1.25);
    R.ball.rotation.set(ball.wx, ball.wy, 0);
    if (ball.caught) {
      var kb = keeperBody(gk, simTime);
      R.ball.position.set(kb.cx, kb.cy + 0.15, gk.z + 0.32);
    }
    R.ballShadow.position.set(R.ball.position.x, 0.006, R.ball.position.z);
    R.ballShadow.material.opacity = 0.55 * Math.max(0.15, 1 - R.ball.position.y * 0.6);
    R.trail.line.visible = false;

    var cast = R.cast;
    poseRunner(cast.runner.a);
    for (var i = 0; i < 6; i++) {
      var c = cast["foe" + i];
      if (!c) continue;
      var f = foes[i];
      c.a.root.visible = !!f;
      if (f) poseFoe(c.a, f);
      var ring = R.rings[i];
      ring.visible = !!f && f.st === "windup";
      if (ring.visible) {
        var w = Math.min(1, f.t / f.wind);
        ring.position.set(f.aimX, 0.02, f.aimZ);
        var s = (0.8 + f.reach * 0.9) * (1.25 - 0.25 * w);
        ring.scale.set(s, s, 1);
        ring.material.opacity = 0.35 + 0.6 * w;
      }
    }
    poseKeeper(cast.keeper.a);
    R.meRing.position.set(player.x, 0.015, player.z);
    R.ballGlow.position.set(R.ball.position.x, 0.012, R.ball.position.z);
    R.ballGlow.visible = state === "play" || state === "shoot";
    R.meRing.visible = state === "play" || state === "shoot";
    Object.keys(cast).forEach(function (key) {
      var cc = cast[key];
      S3.placeShadows(cc.shadows, cc.a, cc.a.root.visible);
    });
    placeCamera(dt);
  }

  function resize(w, h) {
    W = w;
    H = h;
    initGL();
    resizeGL();
  }

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
    drawHUD(c, dt);
  }

  /* ═══════════════════════════ HUD ═══════════════════════════ */

  var GOLD = "#FFD24A", GLASS = "rgba(9,11,32,0.8)", LINE = "rgba(255,255,255,0.12)";

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
      var v = vignetteLayer.ctx;
      A.paintVignette(v, W, H, 0.36);
      var g = v.createLinearGradient(0, 0, 0, 140);
      g.addColorStop(0, "rgba(3,5,16,0.7)");
      g.addColorStop(1, "rgba(3,5,16,0)");
      v.fillStyle = g;
      v.fillRect(0, 0, W, 140);
    }
    A.blit(vignetteLayer);
  }
  function lum(hex) {
    var h = String(hex).replace("#", "");
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var v = parseInt(h, 16) || 0;
    return (0.299 * ((v >> 16) & 255) + 0.587 * ((v >> 8) & 255) + 0.114 * (v & 255)) / 255;
  }
  function initials(name) {
    return upperTR(
      String(name || "")
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map(function (w) {
          return w[0];
        })
        .join(""),
    );
  }
  function badge(c, x, y, size, person) {
    var kit = kitOf(person);
    var w = size, h = size * 1.15;
    c.save();
    c.translate(x, y);
    c.beginPath();
    c.moveTo(-w / 2, -h / 2);
    c.lineTo(w / 2, -h / 2);
    c.lineTo(w / 2, h * 0.08);
    c.quadraticCurveTo(w / 2, h * 0.42, 0, h / 2);
    c.quadraticCurveTo(-w / 2, h * 0.42, -w / 2, h * 0.08);
    c.closePath();
    c.fillStyle = kit.primary;
    c.fill();
    c.save();
    c.clip();
    c.fillStyle = kit.secondary;
    c.globalAlpha = 0.9;
    c.fillRect(-w / 2, -h / 2 + h * 0.62, w, h * 0.14);
    c.restore();
    c.lineWidth = Math.max(1.5, size * 0.06);
    c.strokeStyle = "rgba(255,255,255,0.85)";
    c.stroke();
    c.fillStyle = lum(kit.primary) > 0.6 ? "#0B1020" : "#FFFFFF";
    c.font = A.font(size * 0.36, 900);
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(initials(teamName(person)), 0, -h * 0.06);
    c.restore();
  }
  function fit(c, text, max) {
    var t = String(text || "");
    if (c.measureText(t).width <= max) return t;
    while (c.measureText(t + "…").width > max && t.length > 2) t = t.slice(0, -1);
    return t + "…";
  }
  function glass(c, x, y, w, h, r, fill) {
    A.roundRect(c, x, y, w, h, r);
    c.fillStyle = fill || GLASS;
    c.fill();
    c.strokeStyle = LINE;
    c.lineWidth = 1;
    c.stroke();
  }
  function stageName(m) {
    var n = defenses.length;
    if (m >= n) return "EFSANE TURU";
    var left = n - 1 - m;
    if (left === 0) return "FİNAL";
    if (left === 1) return "YARI FİNAL";
    return "ATAK " + (m + 1) + "/" + n;
  }

  function drawTop(c) {
    var w = Math.min(W - 20, 384), h = 50, x = W / 2 - w / 2, y = 10;
    c.save();
    glass(c, x, y, w, h, 14);
    var mk = kitOf(runner), dk = kitOf(def);
    c.fillStyle = mk.primary;
    c.fillRect(x, y + 9, 4, h - 18);
    c.fillStyle = dk.primary;
    c.fillRect(x + w - 4, y + 9, 4, h - 18);
    badge(c, x + 22, y + h / 2, 20, runner);
    badge(c, x + w - 22, y + h / 2, 20, def);
    c.textBaseline = "middle";
    c.font = A.font(12, 800);
    c.fillStyle = "#FFFFFF";
    c.textAlign = "left";
    c.fillText(fit(c, (runner.shirt ? runner.shirt + " · " : "") + runner.short, w / 2 - 70), x + 38, y + 18);
    c.textAlign = "right";
    c.fillText(fit(c, upperTR(teamName(def)), w / 2 - 70), x + w - 38, y + 18);
    c.font = A.font(9.5, 800);
    c.fillStyle = "rgba(255,255,255,0.6)";
    c.textAlign = "left";
    c.fillText("PUAN " + points.toLocaleString("tr-TR"), x + 38, y + 35);
    c.textAlign = "right";
    var beaten = foes.filter(function (f) { return f.passed; }).length;
    c.fillText(beaten + "/" + foes.length + " savunmacı · " + stageName(attackIdx), x + w - 38, y + 35);
    // haklar: ortada üç top
    for (var i = 0; i < LIVES; i++) {
      var cx = W / 2 - 16 + i * 16, cy = y + h / 2;
      c.beginPath();
      c.arc(cx, cy, 5.5, 0, Math.PI * 2);
      if (i < lives) {
        c.fillStyle = "#FFFFFF";
        c.fill();
        c.fillStyle = "#151A28";
        c.beginPath();
        c.arc(cx, cy, 2, 0, Math.PI * 2);
        c.fill();
      } else {
        c.strokeStyle = "rgba(255,255,255,0.3)";
        c.lineWidth = 1.3;
        c.stroke();
      }
    }
    if (multiplier() > 1) {
      var lbl = "×" + multiplier();
      c.font = A.font(13, 900);
      var lw = c.measureText(lbl).width + 18;
      A.pill(c, W / 2 - lw / 2, y + h + 6, lw, 24, "rgba(69,39,214,0.9)");
      c.fillStyle = GOLD;
      c.textAlign = "center";
      c.fillText(lbl, W / 2, y + h + 18.5);
    }
    c.restore();
  }

  /** Taktik tahtası: yarı saha, sen ve savunmacılar. */
  function drawRadar(c) {
    var w = 74, h = 92, x = W - w - 12, y = 76;
    c.save();
    glass(c, x, y, w, h, 10, "rgba(9,11,32,0.62)");
    var sx = w / 40, sz = (h - 10) / 54;
    var px = function (X) { return x + w / 2 + X * sx; };
    var pz = function (Z) { return y + 6 + Z * sz; };
    c.strokeStyle = "rgba(255,255,255,0.25)";
    c.lineWidth = 1;
    c.strokeRect(px(-20.16), pz(0), 40.32 * sx, 16.5 * sz);
    c.strokeRect(px(-HALF), pz(-0.8), GOAL_W * sx, 0.8 * sz);
    c.beginPath();
    c.moveTo(x + 4, pz(52.5));
    c.lineTo(x + w - 4, pz(52.5));
    c.stroke();
    var dk = kitOf(def);
    foes.forEach(function (f) {
      c.fillStyle = f.passed || f.st === "down" || f.st === "beaten" ? "rgba(255,255,255,0.25)" : f.st === "windup" || f.st === "lunge" ? P.bad : dk.primary;
      c.beginPath();
      c.arc(px(f.x), pz(f.z), 3, 0, Math.PI * 2);
      c.fill();
    });
    c.fillStyle = GOLD;
    c.beginPath();
    c.arc(px(player.x), pz(player.z), 3.6, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }

  /** Savunmacı adları (yakındakiler). */
  function drawFoeLabels(c) {
    c.save();
    c.textAlign = "center";
    c.textBaseline = "middle";
    foes.forEach(function (f) {
      var gap = player.z - f.z;
      if (gap < -1 || gap > 26 || f.st === "beaten") return;
      var s = screenOf(f.x, 2.2, f.z);
      if (s.behind || s.y < 70) return;
      var text = (f.who.shirt ? f.who.shirt + " " : "") + (f.who.back || f.who.short);
      c.font = A.font(10, 900);
      var tw = c.measureText(text).width + 12;
      c.globalAlpha = A.clamp((26 - gap) / 8, 0, 1) * 0.92;
      A.roundRect(c, s.x - tw / 2, s.y - 9, tw, 18, 9);
      c.fillStyle = f.st === "windup" || f.st === "lunge" ? "rgba(225,29,72,0.9)" : "rgba(9,11,32,0.72)";
      c.fill();
      c.fillStyle = "#FFFFFF";
      c.fillText(text, s.x, s.y + 0.5);
    });
    c.restore();
  }

  function drawHints(c) {
    if (attackIdx > 0 || tally.attacks > 1 || state !== "play") return;
    var t = stateT;
    if (t > 7) return;
    var a = A.clamp(Math.min(t / 0.4, (7 - t) / 0.6), 0, 1);
    c.save();
    c.globalAlpha = a;
    var items = [["↔", "Kaydır: yön"], ["●", "Dokun: çalım"], ["↑", "Yukarı fırlat: depar"]];
    var w = Math.min(W - 24, 360), x = W / 2 - w / 2, y = H - 66;
    glass(c, x, y, w, 46, 14, "rgba(9,11,32,0.72)");
    var cw = w / 3;
    items.forEach(function (it, i) {
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.font = A.font(15, 900);
      c.fillStyle = GOLD;
      c.fillText(it[0], x + cw * i + cw / 2, y + 15);
      c.font = A.font(10.5, 800);
      c.fillStyle = "#FFFFFF";
      c.fillText(it[1], x + cw * i + cw / 2, y + 33);
    });
    c.restore();
  }

  function drawCooldowns(c) {
    if (state !== "play") return;
    var p = player;
    c.save();
    [["ÇALIM", 1 - p.skillCd / 0.85], ["DEPAR", 1 - p.knockCd / 2.2]].forEach(function (it, i) {
      var x = i ? W - 58 : 58, y = H - 104;
      var v = A.clamp(it[1], 0, 1);
      c.lineWidth = 4;
      c.strokeStyle = "rgba(255,255,255,0.15)";
      c.beginPath();
      c.arc(x, y, 18, 0, Math.PI * 2);
      c.stroke();
      c.strokeStyle = v >= 1 ? P.good : "rgba(255,255,255,0.6)";
      c.beginPath();
      c.arc(x, y, 18, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * v);
      c.stroke();
      c.font = A.font(8.5, 900);
      c.fillStyle = v >= 1 ? "#FFFFFF" : "rgba(255,255,255,0.5)";
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillText(it[0], x, y + 0.5);
    });
    c.restore();
  }

  function drawShoot(c) {
    var k = Math.min(1, stateT / 0.25);
    c.save();
    var g = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
    g.addColorStop(0, "rgba(40,80,200,0)");
    g.addColorStop(1, "rgba(40,80,200," + 0.3 * k + ")");
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
    var pulse = 1 + 0.06 * Math.sin(A.time * 10);
    c.translate(W / 2, H * 0.62);
    c.scale(pulse, pulse);
    A.bigText(c, "ŞUT!", 0, 0, 40, GOLD, { stroke: "rgba(60,36,200,0.95)" });
    c.restore();
    // yukarı kaydırma oku
    c.save();
    var t = (A.time * 1.6) % 1;
    c.globalAlpha = 0.8 * (1 - t);
    c.strokeStyle = "#FFFFFF";
    c.lineWidth = 4;
    c.lineCap = "round";
    var by = H * 0.82 - t * 60;
    c.beginPath();
    c.moveTo(W / 2, by + 40);
    c.lineTo(W / 2, by);
    c.moveTo(W / 2 - 12, by + 12);
    c.lineTo(W / 2, by);
    c.lineTo(W / 2 + 12, by + 12);
    c.stroke();
    c.restore();
    // kalan süre
    var left = A.clamp(1 - shootT / SHOT_WINDOW, 0, 1);
    c.save();
    c.fillStyle = "rgba(255,255,255,0.18)";
    c.fillRect(W / 2 - 60, H * 0.62 + 30, 120, 4);
    c.fillStyle = left < 0.3 ? P.bad : GOLD;
    c.fillRect(W / 2 - 60, H * 0.62 + 30, 120 * left, 4);
    c.font = A.font(11, 800);
    c.fillStyle = "rgba(255,255,255,0.85)";
    c.textAlign = "center";
    c.fillText("Kaleye doğru yukarı kaydır", W / 2, H * 0.62 + 52);
    c.restore();
  }

  var LABELS = { gol: "GOL!", kurtaris: "KURTARDI", direk: "DİREK!", aut: "AUT", kaptirdin: "TOP KAPTIRDIN" };
  function drawResult(c) {
    var t = stateT;
    var fade = A.clamp((RESULT - t) / 0.3, 0, 1);
    var pop = A.easeOutBack(t / 0.35);
    var good = outcome.kind === "gol";
    c.save();
    c.globalAlpha = fade;
    var y = H * 0.42;
    A.bigText(c, LABELS[outcome.kind], W / 2, y, (good ? 54 : 34) * (0.5 + 0.5 * pop), good ? GOLD : "#FFFFFF", { stroke: good ? "rgba(60,36,200,0.95)" : "rgba(160,20,50,0.9)" });
    if (good) {
      A.bigText(c, "+" + outcome.gain, W / 2, y + 44, 24 * pop, "#FFFFFF");
      if (outcome.tags.length) {
        c.font = A.font(12, 900);
        c.textAlign = "center";
        var tags = outcome.tags.join("  ·  ");
        var tw = c.measureText(tags).width + 26;
        A.pill(c, W / 2 - tw / 2, y + 64, tw, 26, "rgba(69,39,214,0.9)");
        c.fillStyle = "#FFFFFF";
        c.textBaseline = "middle";
        c.fillText(tags, W / 2, y + 77.5);
      }
    } else {
      c.font = A.font(13, 800);
      c.textAlign = "center";
      c.fillStyle = "rgba(255,255,255,0.9)";
      c.fillText(lives > 0 ? lives + " hakkın kaldı · aynı savunmaya tekrar" : "Hakların bitti", W / 2, y + 36);
    }
    c.restore();
  }

  function drawIntro(c) {
    var t = stateT;
    var inT = A.easeOutBack(t / 0.45);
    var out = A.clamp((INTRO - t) / 0.3, 0, 1);
    c.save();
    c.globalAlpha = out;
    var cw = Math.min(W - 28, 350), ch = 188;
    var x = W / 2 - cw / 2, y = H * 0.55 - ch / 2;
    c.translate(W / 2, y + ch / 2);
    c.scale(0.88 + 0.12 * inT, 0.88 + 0.12 * inT);
    c.translate(-W / 2, -(y + ch / 2));
    glass(c, x, y, cw, ch, 20, "rgba(9,11,32,0.88)");
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.font = A.font(11, 900);
    c.fillStyle = GOLD;
    if ("letterSpacing" in c) c.letterSpacing = "2px";
    c.fillText("SLALOM ATAĞI · " + stageName(attackIdx), W / 2, y + 24);
    if ("letterSpacing" in c) c.letterSpacing = "0px";
    badge(c, W / 2, y + 66, 40, def);
    c.font = A.font(18, 900);
    c.fillStyle = "#FFFFFF";
    c.fillText(fit(c, teamName(def), cw - 40), W / 2, y + 108);
    c.font = A.font(11.5, 700);
    c.fillStyle = "rgba(255,255,255,0.7)";
    var cpm = def.conceded_per_match != null ? "Maç başı " + Number(def.conceded_per_match).toFixed(2).replace(".", ",") + " gol yiyor · " : "";
    c.fillText(cpm + foes.length + " savunmacı", W / 2, y + 132);
    c.fillText(fit(c, "Kaleci: " + gk.person.short + (gk.person.saves ? " · " + gk.person.saves + " kurtarış" : ""), cw - 30), W / 2, y + 154);
    c.font = A.font(10.5, 700);
    c.fillStyle = "rgba(255,255,255,0.5)";
    c.fillText(fit(c, foes.map(function (f) { return f.who.back || f.who.short; }).join(" · "), cw - 30), W / 2, y + 174);
    c.restore();
  }

  function drawLine(c) {
    if (!line || state === "attract") return;
    var life = 2.6;
    if (lineT > life) return;
    var out = A.clamp((life - lineT) / 0.35, 0, 1);
    c.save();
    c.globalAlpha = out;
    c.font = A.font(12.5, 700);
    var text = fit(c, line.text, W - 66);
    var tw = Math.min(W - 32, c.measureText(text).width + 34);
    var x = W / 2 - tw / 2, y = 96;
    A.roundRect(c, x, y, tw, 30, 10);
    c.fillStyle = "rgba(9,11,32,0.82)";
    c.fill();
    c.fillStyle = line.good ? P.good : P.bad;
    c.fillRect(x, y + 6, 4, 18);
    c.fillStyle = "#FFFFFF";
    c.textAlign = "left";
    c.textBaseline = "middle";
    c.fillText(text, x + 16, y + 15.5);
    c.restore();
  }

  function drawHUD(c, dt) {
    drawVignette(c);
    A.drawParticles(c);
    if (state === "attract" || state === "over") {
      A.drawFloaters(c, dt);
      return;
    }
    if (state === "play" || state === "shoot") drawFoeLabels(c);
    A.drawFloaters(c, dt);
    drawTop(c);
    if (state !== "intro") drawRadar(c);
    if (state === "intro") drawIntro(c);
    else if (state === "play") {
      drawHints(c);
      drawCooldowns(c);
    } else if (state === "shoot") drawShoot(c);
    else if (state === "result") drawResult(c);
    if (state !== "intro") drawLine(c);
    A.drawBanner(c, W, H * 0.34, dt);
  }

  function debug() {
    return {
      state: state,
      attack: attackIdx,
      lives: lives,
      points: points,
      tally: tally,
      player: player,
      ball: ball,
      foes: foes,
      keeper: gk,
      outcome: outcome,
      runner: runner.short,
      defense: teamName(def),
      keeperName: gk.person.short,
      gl: !!R,
    };
  }

  A.register({ resize: resize, start: start, update: update, render: render, down: down, move: move, up: up, debug: debug, setRoster: setRoster });
})();
