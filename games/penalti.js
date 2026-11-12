/*
 * PENALTI — SERİ PENALTI DÜELLOSU. Gerçek ligin golcüsüyle atarsın, gerçek
 * ligin kalecisiyle kurtarırsın; her maç ligin bir sonraki kulübüne karşı.
 *
 * MİMARİ: oyun iki katmandır.
 *   SİMÜLASYON  kurallar, top fiziği (yerçekimi, direk/üst direk sekmesi, file),
 *               kaleci gövdesi ve yapay zekâsı, puanlama. Çizimden bağımsızdır;
 *               başsız testler (scripts/check-games.mjs) yalnız bunu koşturur.
 *   ÇİZİM       düz Canvas 2D "flat vector" çizgi film (Savunma Hattı ailesi):
 *               atıcının arkasından kale, gece şehri + takım renkli tribün,
 *               lacivert konturlu futbolcular, HUD hapları ve beyaz kartlar.
 *
 * MAÇ: klasik seri penaltı. Sırayla beşer atış: sen atarsın, rakibin atışı
 * kısa bir kartla gösterilir (rakip kulübün gerçek atıcıları; isabetleri
 * merdivenle artar). Bir taraf kalan atışlarla yetişemeyecek duruma düşünce
 * maç biter. Beşte eşitlikte ANİ ÖLÜM. Kazanırsan merdivende sıradaki kulübe
 * (kalecisi ligin daha çok kurtarış yapan kalecisi) geçersin; kaybedersen tur
 * biter. Son kulübü geçen ŞAMPİYON. Kaleyi sen korumazsın — yalnız atarsın.
 *
 * ATIŞ — iki dokunuş:
 *   1. NİŞAN: parmağını sürükle, kaledeki nişangâh hareket eder. Çerçeveye
 *      ve direğe yaklaştıkça uyarı çıkar; rüzgâr varsa nişanın altında
 *      sürüklenme yönü görünür.
 *   2. GÜÇ: parmağını kaldırınca güç çubuğu salınır; yeşil bölgede dokun.
 *   Atış BELİRLENİMCİDİR: güç yeşil bölgedeyse top tam nişangâha gider
 *   (rüzgâr hariç — onu nişanla telafi edersin). Fazla güç topu yükseltir ve
 *   dışarı açar (üst direk / aut), az güç alçaltır, ortaya çeker ve yavaşlatır
 *   (kaleci yetişir). Vuruş türü (altta): PLASE (dengeli, geniş bölge), SERT
 *   (hızlı ama dar bölge, hatası büyük), KAŞIK (Panenka — yavaş aşırtma,
 *   rüzgârdan çok etkilenir).
 *
 * JOKERLER (sağdaki düğmeler, nişan evresinde; turnuva başında birer tane,
 * her galibiyette ve beşte beşte yenisi, en çok 3):
 *   KALECİ GÖZÜ  kalecinin bu atıştaki kararını gösterir (sol / sağ / ortada
 *                bekler / son anda okur) ve kaleci ona uyar.
 *   FÜZE         güç ayarı gerekmez: kusursuz, 33 m/sn, rüzgârdan az etkilenir.
 *   DEV KALE     kale bu atışta her yana 0,8 m, üste 0,3 m büyür.
 *
 * ZORLUK: ilk maç sakin havada. Merdivende ilerledikçe rüzgâr sertleşir,
 * yeşil bölge daralır, güç çubuğu hızlanır, güç evresinde nişan titrer,
 * son basamaklarda yağmur yağar; rakip kaleci daha geniş uçar, daha çok ezber
 * bozar, daha hızlı okur; rakip atıcılar daha isabetli vurur. Baskı (son
 * atışlar, ani ölüm) bunları ayrıca artırır.
 *
 * HAREKET: atıcı koşu çizgisinden duruştan hızlanır (koşu klibi yere göre
 * oynar, ayak kaymaz), son uzun adımda vuran bacak geri savrulur, destek ayağı
 * topun yanına basar, bacak kamçılanır ve takip eder. Kaleci çizgide yan
 * adımlarla gezinir, temastan hemen önce sıçrama adımı atar, yüklenip iter,
 * uçar ve yere iner. Kıl payı anlarda kısa yavaş çekim.
 *
 * RAKİP KALECİ: vuruş anında ya bir köşeye yatar (senin geçmiş atışlarından
 * öğrendiği köşeye) ya da topu okuyup tepki verir. Uçuşu fizikseldir: gövdesi
 * ve eldivenleri topa değerse kurtarır; köşeye yeterince hızlı giden top
 * yetişilmezdir. Ligdeki kurtarış sayısı (refleks) tepki süresini kısaltır.
 *
 * PUAN: gol 100 (+50 köşe, +50 yüksek, doksana +150, kaşık +150, ani ölüm
 * +50) · rakip kaçırırsa 25 · maç galibiyeti 400 + 200 × maç sırası · beşte
 * beş +300 · şampiyonluk +1500.
 *
 * KOORDİNAT (metre): dünya x yatay (kaleye bakınca sağ +), y yukarı, z kale
 * çizgisinden uzaklık (kale çizgisi z = 0, penaltı noktası z = 11, file z < 0).
 */
(function () {
  "use strict";
  var A = window.Arena;
  var P = A.PAL;

  /* ═══════════════════════════ SİMÜLASYON ═══════════════════════════ */

  var GOAL_W = 7.32, GOAL_H = 2.44, HALF = GOAL_W / 2, POST_R = 0.06;
  var NET_D = 2.0, NET_BACK_H = 1.9;
  var SPOT_Z = 11, BALL_R = 0.11, GRAV = 9.81;
  var KEEPER_Z = 0.35;
  var KICKS = 5;
  var RUNUP = 1.3; // atıcının koşusu: başlangıçtan topa temasa (sn)
  var SUB = 1 / 240; // top fiziğinin sabit alt adımı (sn)
  var WIND_K = 0.5, WIND_KY = 0.16; // rüzgârın topa ivmesi (m/sn² / (m/sn))
  var BIG_W = 0.8, BIG_H = 0.3; // DEV KALE: her yana +0,8 m, üste +0,3 m
  var INTRO = 2.6, TURN = 1.0, MATCH_END = 3.2;
  var REPLAY_AT = 1.1, REPLAY_LEN = 2.6;
  var OPP_KICK = 2.1; // rakip atış kartı (sn)

  var W = 390, H = 640;

  /* ─────────────── kadro ─────────────── */

  var FIRST = ["Emre", "Burak", "Mert", "Kerem", "Arda", "Onur", "Serkan", "Tolga", "Yusuf", "Ozan", "Cenk", "Barış", "Furkan", "Hakan", "Volkan"];
  var LAST = ["Yılmaz", "Kaya", "Demir", "Şahin", "Çelik", "Arslan", "Doğan", "Aydın", "Öztürk", "Koç", "Kurt", "Polat", "Erdem", "Güneş", "Aksoy"];
  var CLUBS = [
    ["Çaylakspor", "#0EA5E9", "#FFFFFF", 62],
    ["Yıldızspor", "#F97316", "#111827", 68],
    ["Gençlerbirliği", "#DC2626", "#FFFFFF", 73],
    ["Kartal SK", "#111827", "#FFFFFF", 79],
    ["Şampiyon FK", "#FACC15", "#1E3A8A", 86],
  ];
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
  function makePerson(id, name, team, extra) {
    var parts = name.split(" ");
    var p = {
      id: id,
      name: name,
      short: parts[0][0] + ". " + parts.slice(1).join(" "),
      back: upperTR(parts.slice(1).join(" ")),
      shirt: extra && extra.shirt ? extra.shirt : 1,
      team: team,
      attrs: (extra && extra.attrs) || {},
      stats: (extra && extra.stats) || {},
    };
    return p;
  }
  var DEFAULT_SHOOTER = makePerson(0, "Elit Golcü", { id: 900, name: "ElitLig", kit: { primary: "#5B3DF5", secondary: "#FFFFFF" } }, {
    shirt: 10,
    attrs: { power: 80, accuracy: 80, curve: 78 },
    stats: { goals: 0 },
  });
  var DEFAULT_KEEPERS = CLUBS.map(function (c, i) {
    var team = { id: 901 + i, name: c[0], kit: { primary: c[1], secondary: c[2] } };
    return makePerson(-1 - i, personName(101 + i * 7), team, { shirt: 1, attrs: { reflex: c[3] }, stats: { saves: 0 } });
  });

  var shooter = DEFAULT_SHOOTER;
  var keepers = DEFAULT_KEEPERS;
  var takers = [];
  var rosterSig = "";

  function validPerson(p) {
    return p && typeof p === "object" && p.team && (p.short || p.name);
  }
  function setRoster(r) {
    var s = r && validPerson(r.shooter) ? r.shooter : null;
    var ks = r && Array.isArray(r.keepers) ? r.keepers.filter(validPerson) : [];
    var tk = r && Array.isArray(r.takers) ? r.takers.filter(validPerson) : [];
    var sig = (s ? s.id : "d") + ":" + ks.map(function (k) { return k.id; }).join(",") + ":" + tk.length;
    if (sig === rosterSig) return;
    rosterSig = sig;
    shooter = s || DEFAULT_SHOOTER;
    keepers = ks.length ? ks : DEFAULT_KEEPERS;
    takers = tk;
    if (state !== "attract" && state !== "over") return; // maç ortasında kadro değişmez
    opp = opponentOf(0);
    castSig = "";
  }
  function attr(obj, key, fallback) {
    var v = obj && obj.attrs ? Number(obj.attrs[key]) : NaN;
    return Number.isFinite(v) ? A.clamp(v, 50, 99) : fallback;
  }
  /** 50..99 özelliği → −1..1 (77,5 ortalama). */
  function norm(v) {
    return A.clamp((v - 77.5) / 17.5, -1, 1);
  }
  function kitOf(person) {
    var k = person && person.team && person.team.kit ? person.team.kit : {};
    return { primary: k.primary || "#5B3DF5", secondary: k.secondary || "#FFFFFF" };
  }
  function teamName(person) {
    return (person && person.team && person.team.name) || "ElitLig";
  }
  function sameTeam(a, b) {
    return a && b && a.team && b.team && a.team.id != null && a.team.id === b.team.id;
  }

  function hashStr(s) {
    var h = 2166136261;
    s = String(s);
    for (var i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return h >>> 0;
  }

  /**
   * m. maçın rakibi: merdivendeki kaleci ve kulübü; atıcılar o kulübün
   * golcüleri (kadroda yoksa kulübün altyapısından isimler).
   */
  function opponentOf(m) {
    var k = keepers[Math.min(m, keepers.length - 1)];
    var own = takers.filter(function (p) {
      return sameTeam(p, k) && p.id !== shooter.id;
    });
    own.sort(function (a, b) {
      return ((b.stats && b.stats.goals) || 0) - ((a.stats && a.stats.goals) || 0);
    });
    var list = own.slice(0, KICKS);
    var seed = hashStr(teamName(k)) + m;
    var shirts = [9, 10, 7, 11, 8, 6, 4, 3];
    for (var i = 0; list.length < KICKS; i++) {
      var acc = 66 + ((seed >>> (i * 3)) % 18);
      list.push(makePerson(-200 - m * 10 - i, personName(seed + i * 13), k.team, { shirt: shirts[i % shirts.length], attrs: { power: 66 + ((seed >>> (i * 2)) % 20), accuracy: acc, curve: 70 } }));
    }
    var diff = keepers.length > 1 ? Math.min(m, keepers.length - 1) / (keepers.length - 1) : 0.5;
    return {
      idx: m,
      keeper: k,
      team: k.team,
      takers: list.map(function (p) {
        // Her atıcının sevdiği köşe ve yüksekliği: kimliğinden, maçtan maça aynı.
        var h = hashStr(p.id + ":" + p.name);
        return { p: p, side: h & 1 ? 1 : -1, love: 0.55 + ((h >>> 3) % 25) / 100, high: ((h >>> 9) % 100) / 100, cunning: 0.2 + diff * 0.45 + ((h >>> 13) % 10) / 100 };
      }),
      diff: diff,
    };
  }

  /* ─────────────── durum ─────────────── */

  // attract | intro | turn | aim | power | runup | flight | result | oppKick | matchEnd | over
  var state = "attract";
  var stateT = 0;
  var opp = opponentOf(0);
  var matchIdx = 0;
  var match = null; // { me: ['g'|'x'], op: ['g'|'x'], sudden }
  var points = 0, scoreBump = 0;
  var tally = { goals: 0, shots: 0, wins: 0, perfect: 0 };
  var champion = false;
  var history = []; // senin atışlarının yönü (−1 sol, 0 orta, 1 sağ) — rakip kaleci öğrenir
  var lastKick = null; // { who: 'me'|'op', result, tags, gain, taker }
  var line = null, lineT = 0;
  var excite = 0;
  var simTime = 0; // yavaş çekimden etkilenen oyun saati
  var slow = 1;

  // Atış girdisi
  var aim = { x: 0, y: 1.1 };
  var shotType = "plase";
  var dragFrom = null;
  var powerT = 0, powerV = 0;
  var shot = null; // { target, speed, type, quality, sigma, ... }

  var kickAt = 0; // atıcının topa değdiği sim zamanı

  // Atış koşulları (her atışta): rüzgâr, yağmur, zorluk çarpanları
  var cond = { wind: 0, windZ: 0, rain: false, zoneK: 1, period: 1.3, sway: 0 };
  var matchRain = false;
  var kplan = null; // rakip kalecinin bu atıştaki kararı (KALECİ GÖZÜ gösterir)
  var gHalf = HALF, gTop = GOAL_H; // bu atıştaki kale ölçüsü (DEV KALE büyütür)

  // Jokerler: turnuva başında birer tane; maç kazandıkça yenisi (en çok 3)
  var JOKERS = {
    eye: { name: "KALECİ GÖZÜ", short: "GÖZ", desc: "Kalecinin yönünü gör", color: "#38BDF8" },
    rocket: { name: "FÜZE", short: "FÜZE", desc: "Çok hızlı ve isabetli şut", color: "#FB923C" },
    big: { name: "DEV KALE", short: "DEV KALE", desc: "Kale bu atışta büyür", color: "#34D399" },
  };
  var JOKER_KEYS = ["eye", "rocket", "big"];
  var JOKER_MAX = 3;
  var jokers = { eye: 1, rocket: 1, big: 1 };
  var armed = { eye: false, rocket: false, big: false };
  var jokerUsed = 0;
  var oppShot = null; // rakibin atışı: { taker, result, dir }

  // Top ve kaleci (fizik)
  var ball = newBall();
  var gk = newKeeper();
  var replay = null, recording = [];

  function newBall() {
    return { x: 0, y: BALL_R, z: SPOT_Z, vx: 0, vy: 0, vz: 0, wx: 0, wy: 0, wz: 0, live: false, goal: false, post: false, touched: false, caught: false, out: false, t: 0, curl: 0 };
  }
  function newKeeper() {
    return { x: 0, set: 0, dive: null, stay: false, crouch: 0.4, reflex: 75, saved: false, cheer: 0 };
  }

  /* ─────────────── vuruş türleri ─────────────── */

  var TYPES = {
    // zone: yeşil güç bölgesi · speed: bölgenin altı→üstü hız · up/wide/low: güç hatası
    // başına sapma (m): fazla güç topu yükseltir ve dışarı açar, az güç alçaltır ve ortaya çeker
    plase: { label: "PLASE", zone: [0.5, 0.78], speed: [19, 24], up: 5.0, wide: 1.3, low: 2.4 },
    sert: { label: "SERT", zone: [0.72, 0.87], speed: [25.5, 30], up: 6.5, wide: 2.4, low: 2.0 },
    kasik: { label: "KAŞIK", zone: [0.28, 0.46], speed: [9.5, 11], up: 4.0, wide: 0.9, low: 1.6 },
  };
  var TYPE_KEYS = ["plase", "sert", "kasik"];

  function pressure() {
    if (!match) return 0;
    if (match.sudden) return 1;
    var gm = goalsOf(match.me), go = goalsOf(match.op);
    var left = KICKS - match.me.length;
    return left <= 2 && Math.abs(gm - go) <= 1 ? 0.6 : 0;
  }
  function goalsOf(list) {
    var n = 0;
    for (var i = 0; i < list.length; i++) if (list[i] === "g") n++;
    return n;
  }
  /**
   * Yeşil bölge: türün bölgesi, zorlukla (rakip merdiveni, yağmur, baskı)
   * daralır; atıcının isabet özelliği ve ElitLig avantajı genişletir.
   */
  function zoneOf(type) {
    var z = TYPES[type].zone, mid = (z[0] + z[1]) / 2, half = (z[1] - z[0]) / 2;
    var acc = norm(attr(shooter, "accuracy", 78));
    var perk = A.perks && A.perks.penalti ? A.clamp(Number(A.perks.penalti.aimBonus) || 0, 0, 0.1) : 0;
    half *= cond.zoneK * (1 + 0.12 * acc) * (1 + perk * 2);
    return [mid - half, mid + half];
  }
  /** Güç kalitesi: yeşil bölgede 1; dışında uzaklıkla düşer. */
  function powerQuality(type, v) {
    var z = zoneOf(type);
    if (v >= z[0] && v <= z[1]) return 1;
    var d = v < z[0] ? z[0] - v : v - z[1];
    return A.clamp(1 - d * 3.2, 0, 1);
  }
  /** FÜZE için kusursuz güç: bölgenin üst ucu (en hızlı isabetli an). */
  function perfectPower(type) {
    var z = zoneOf(type);
    return z[1] - (z[1] - z[0]) * 0.1;
  }

  /**
   * ATIŞ MODELİ — belirlenimci: güç yeşil bölgedeyse top TAM nişana gider
   * (rüzgâr hariç; onu oyuncu nişanla telafi eder). Bölgenin dışında sapma
   * güç hatasıyla orantılıdır: fazla güç topu yükseltir ve kenara açar (üst
   * direk / aut), az güç alçaltır, ortaya çeker ve yavaşlatır (kaleci yetişir).
   * SERT hızlıdır ama bölgesi dar, hatası büyük; KAŞIK yavaş bir aşırtma.
   */
  function shotModel(type, ax, ay, v, rocket) {
    var tp = TYPES[type];
    var z = zoneOf(type);
    var acc = norm(attr(shooter, "accuracy", 78));
    var pw = norm(attr(shooter, "power", 78));
    var tx = ax, ty = ay;
    if (type === "kasik") {
      tx = A.clamp(ax, -2.6, 2.6);
      ty = Math.max(0.9, ay);
    }
    var over = rocket ? 0 : Math.max(0, v - z[1]), under = rocket ? 0 : Math.max(0, z[0] - v);
    var inZ = A.clamp((v - z[0]) / Math.max(0.01, z[1] - z[0]), 0, 1);
    var speed = (tp.speed[0] + (tp.speed[1] - tp.speed[0]) * inZ) * (1 + 0.04 * pw);
    var miss = 1 - 0.18 * acc;
    if (over > 0) {
      ty += over * tp.up * miss;
      tx += (Math.sign(ax) || 1) * over * tp.wide * miss;
      speed *= 1 + over * 0.25;
    }
    if (under > 0) {
      ty -= under * tp.low;
      tx *= 1 - Math.min(0.7, under * 1.6);
      speed *= Math.max(0.45, 1 - under * 1.3);
    }
    if (rocket) speed = 33 * (1 + 0.04 * pw);
    ty = Math.max(BALL_R, ty);
    var curl = type === "plase" && !rocket ? -Math.sign(tx) * 1.6 * (1 + 0.5 * norm(attr(shooter, "curve", 78))) : 0;
    return { tx: tx, ty: ty, speed: speed, curl: curl, lob: type === "kasik" && !rocket, windK: rocket ? 0.3 : 1, over: over, under: under };
  }

  /** Bir fizik alt adımı (uçuşta): yerçekimi, falso, rüzgâr, hava direnci. */
  function integrate(b, h, windK) {
    b.vy -= GRAV * h;
    b.vx += b.curl * h;
    if (windK) {
      b.vx += WIND_K * cond.wind * windK * h;
      b.vy += WIND_KY * cond.windZ * windK * h;
    }
    var sp = Math.hypot(b.vx, b.vy, b.vz);
    var drag = 1 - 0.006 * sp * h;
    b.vx *= drag;
    b.vy *= drag;
    b.vz *= drag;
    b.x += b.vx * h;
    b.y += b.vy * h;
    b.z += b.vz * h;
  }
  /** Uçuşu kale çizgisine (z = 0) kadar sür: kesişme noktası ve süresi. */
  function crossing(b0, windK) {
    var b = { x: b0.x, y: b0.y, z: b0.z, vx: b0.vx, vy: b0.vy, vz: b0.vz, curl: b0.curl };
    var t = 0;
    while (b.z > 0 && t < 4) {
      var px = b.x, py = b.y, pz = b.z;
      integrate(b, SUB, windK);
      t += SUB;
      if (b.z <= 0) {
        var f = pz / Math.max(1e-6, pz - b.z);
        return { x: px + (b.x - px) * f, y: py + (b.y - py) * f, t: t - SUB * (1 - f) };
      }
    }
    return { x: b.x, y: b.y, t: t };
  }
  /** Analitik ilk tahmin: yerçekimiyle hedefe varan hız vektörü. */
  function launch(b, tx, ty, speed, curl, lob) {
    var dx = tx - b.x, dz = 0 - b.z;
    var dist = Math.hypot(dx, dz);
    var ft = dist / speed;
    if (lob) ft *= 1.15;
    b.vx = dx / ft - 0.5 * curl * ft;
    b.vz = dz / ft;
    b.vy = (ty - b.y + 0.5 * GRAV * ft * ft) / ft;
    b.curl = curl;
    b.live = true;
    b.t = 0;
    return ft;
  }
  /**
   * Nişan çözücü: hava direnci ve falso dahil, rüzgârsız uçuş kale çizgisini
   * tam (tx, ty)'de kessin diye ilk hız birkaç adımda düzeltilir.
   */
  function aimLaunch(b, tx, ty, speed, curl, lob) {
    launch(b, tx, ty, speed, curl, lob);
    for (var it = 0; it < 6; it++) {
      var c = crossing(b, 0);
      var ex = tx - c.x, ey = ty - c.y;
      if (Math.abs(ex) < 0.002 && Math.abs(ey) < 0.002) break;
      b.vx += ex / Math.max(0.2, c.t);
      b.vy += ey / Math.max(0.2, c.t);
    }
  }
  /** Bir atışın kale çizgisini keseceği nokta (rüzgâr dahil) — test ve bot için. */
  function predict(type, ax, ay, v, rocket) {
    var m = shotModel(type, ax, ay, v, rocket);
    var b = newBall();
    aimLaunch(b, m.tx, m.ty, m.speed, m.curl, m.lob);
    var c = crossing(b, m.windK);
    return { x: c.x, y: c.y, t: c.t, tx: m.tx, ty: m.ty, speed: m.speed };
  }

  /**
   * Atış koşulları: ilk maçta sakin hava; merdivende ilerledikçe rüzgâr
   * sertleşir, yeşil bölge daralır, güç çubuğu hızlanır, nişan titrer.
   * Son basamaklarda yağmur (bölge daha da daralır).
   */
  function rollConditions() {
    var d = opp.diff, pr = pressure();
    var windMax = matchIdx === 0 ? 0 : 1.5 + 6.5 * d;
    cond = {
      wind: windMax ? A.rand(0.35, 1) * windMax * (Math.random() < 0.5 ? -1 : 1) : 0,
      windZ: windMax ? A.rand(-0.5, 0.5) * windMax : 0,
      rain: matchRain,
      zoneK: (1 - 0.36 * d) * (matchRain ? 0.86 : 1) * (1 - 0.12 * pr),
      period: (1.3 - 0.36 * d) * (1 - 0.14 * pr) * (matchRain ? 0.93 : 1),
      sway: matchIdx === 0 ? 0.03 + 0.08 * pr : 0.05 + 0.2 * d + 0.12 * pr,
    };
  }
  /** Güç evresinde nişan hafifçe titrer (baskı ve zorlukla büyür). */
  function aimNow() {
    if (state !== "power" || armed.rocket) return { x: aim.x, y: aim.y };
    var t = powerT, a = cond.sway;
    return { x: aim.x + a * (Math.sin(t * 1.9) * 0.7 + Math.sin(t * 3.7 + 1) * 0.3), y: Math.max(0.15, aim.y + a * 0.6 * Math.sin(t * 2.6 + 2)) };
  }

  /* ─────────────── kaleci gövdesi ─────────────── */

  /**
   * Kalecinin gövdesi bir kapsüldür (ayaklar → eller) + eldiven küresi.
   * Ayakta: dikey, kollar yanlarda (iki el küresi). Uçuşta: gövde ekseni uçuş
   * yönüne döner, merkez uçuş yönünde ilerler, kollar başın üstünde uzanır.
   */
  var DIVE_REACH = 1.75; // gövde merkezinin en çok yer değiştirmesi (m)
  var ARM = 1.05; // merkezden eldiven ucuna
  function diveDur(k) {
    return 0.56 - 0.1 * ((k.reflex - 50) / 49);
  }
  function keeperBody(k, now) {
    var cx = k.x, cy = 0.98 - k.crouch * 0.12, ax = 0, ay = 1, e = 0;
    if (k.dive) {
      var d = k.dive;
      var p = A.clamp((now - d.t0) / d.dur, 0, 1);
      e = 1 - (1 - p) * (1 - p);
      var tx = d.dx * d.reach, ty = d.dy * d.reach;
      cx = k.x + tx * e;
      cy = Math.max(0.32, 0.98 + ty * e - Math.abs(d.dx) * 0.42 * e);
      // gövde ekseni: dikeyden uçuş yönüne (yatay uçuşta yatay)
      var ang = Math.atan2(d.dx, Math.max(0.05, d.dy + 0.25)) * Math.min(1, e * 1.4);
      ax = Math.sin(ang);
      ay = Math.cos(ang);
    }
    return { cx: cx, cy: cy, ax: ax, ay: ay, e: e, diving: !!k.dive };
  }
  /** Topun kaleciye en yakın teması: {hit, nx, ny, part} — x-y düzleminde. */
  function keeperContact(k, now, bx, by) {
    var b = keeperBody(k, now);
    var r = BALL_R;
    if (!b.diving) {
      // gövde: (cx, 0.1) → (cx, 1.78); eller yanlarda
      var segY = A.clamp(by, 0.1, 1.78);
      var dB = Math.hypot(bx - b.cx, by - segY);
      if (dB < r + 0.24) return { hit: true, nx: (bx - b.cx) / (dB || 1), ny: (by - segY) / (dB || 1), part: "body" };
      // yerinde duran kaleci yavaş/alçak topa yan adımla ve kapanarak yetişir:
      // erişimi topun yolda geçirdiği sürece göre büyür
      if (by < 1.45 && kickAt > 0) {
        var shuffle = A.clamp(0.28 + (now - kickAt) * (1.5 + 0.6 * k.set), 0.28, 1.05);
        if (Math.abs(bx - b.cx) < shuffle + r) return { hit: true, nx: Math.sign(bx - b.cx) * 0.6, ny: 0.8, part: "body" };
      }
      var spread = 0.42 + k.set * 0.12;
      for (var s = -1; s <= 1; s += 2) {
        var hx = b.cx + s * spread, hy = 1.12 + k.set * 0.25;
        var dH = Math.hypot(bx - hx, by - hy);
        if (dH < r + 0.16) return { hit: true, nx: (bx - hx) / (dH || 1), ny: (by - hy) / (dH || 1), part: "hand" };
      }
      return { hit: false };
    }
    // uçuş: ayak → el kapsülü + eldiven ucu
    var fx = b.cx - b.ax * 0.9, fy = b.cy - b.ay * 0.9;
    var hx2 = b.cx + b.ax * ARM, hy2 = b.cy + b.ay * ARM;
    var vx = hx2 - fx, vy = hy2 - fy;
    var t = A.clamp(((bx - fx) * vx + (by - fy) * vy) / (vx * vx + vy * vy), 0, 1);
    var px = fx + vx * t, py = fy + vy * t;
    var d = Math.hypot(bx - px, by - py);
    var rad = t > 0.82 ? 0.19 : 0.22; // eldiven ucu biraz daha geniş tutuş
    if (d < r + rad + (t > 0.82 ? 0.05 : 0)) return { hit: true, nx: (bx - px) / (d || 1), ny: (by - py) / (d || 1), part: t > 0.82 ? "hand" : "body" };
    return { hit: false };
  }
  /** Kaleciyi bir noktaya uçur: yön ve uzanım hedefe göre. */
  function diveTo(k, now, tx, ty) {
    var dx = tx - k.x, dy = ty - 0.98;
    var need = Math.hypot(dx, dy);
    var reach = A.clamp(need - ARM * 0.75, 0, DIVE_REACH * (0.94 + 0.12 * opp.diff));
    if (need < 0.55) {
      // yakın top: yerinde kalır, eller topa
      k.stay = true;
      k.set = 1;
      return;
    }
    k.dive = { t0: now, dx: dx / need, dy: dy / need, reach: reach, dur: diveDur(k) };
  }

  /* ─────────────── top fiziği ─────────────── */

  var lastContact = -1;
  /** Top fiziği: sabit alt adımlarla (nişan çözücüyle aynı tümleyici). */
  function stepBall(dt) {
    if (!ball.live) return;
    var n = Math.max(1, Math.ceil(dt / SUB - 1e-6));
    for (var i = 0; i < n; i++) stepOnce(dt / n);
  }
  function stepOnce(dt) {
    var b = ball;
    if (!b.live) return;
    b.t += dt;
    var HALF = gHalf, GOAL_H = gTop; // eslint-disable-line no-shadow
    if (!b.caught) {
      var pz = b.z;
      var airborne = !b.goal && !b.touched && !b.post && b.y > BALL_R + 0.01;
      integrate(b, dt, airborne && shot ? shot.windK : 0);
      b.wx += (-b.vz / BALL_R) * dt * 0.25;
      b.wy += (b.curl * 4 + b.vx) * dt;
      // zemin
      if (b.y < BALL_R) {
        b.y = BALL_R;
        if (b.vy < 0) b.vy = Math.abs(b.vy) > 1.2 ? -b.vy * 0.5 : 0;
        b.vx *= 1 - 2.2 * dt;
        b.vz *= 1 - 2.2 * dt;
        b.curl = 0;
      }
      // direkler ve üst direk (kale çizgisi z = 0)
      if (Math.abs(b.z) < BALL_R + POST_R + 0.05) {
        [-1, 1].forEach(function (s) {
          var px = s * (HALF + POST_R);
          if (b.y > GOAL_H + POST_R) return;
          var dx = b.x - px, dz = b.z;
          var d = Math.hypot(dx, dz);
          if (d < BALL_R + POST_R) {
            var nx = dx / d, nz = dz / d;
            var vn = b.vx * nx + b.vz * nz;
            if (vn < 0) {
              b.vx -= 1.75 * vn * nx;
              b.vz -= 1.75 * vn * nz;
              b.x = px + nx * (BALL_R + POST_R);
              b.z = nz * (BALL_R + POST_R);
              hitPost();
            }
          }
        });
        if (Math.abs(b.x) < HALF + POST_R) {
          var dy = b.y - (GOAL_H + POST_R), dz2 = b.z;
          var d2 = Math.hypot(dy, dz2);
          if (d2 < BALL_R + POST_R) {
            var ny = dy / d2, nz2 = dz2 / d2;
            var vn2 = b.vy * ny + b.vz * nz2;
            if (vn2 < 0) {
              b.vy -= 1.7 * vn2 * ny;
              b.vz -= 1.7 * vn2 * nz2;
              b.y = GOAL_H + POST_R + ny * (BALL_R + POST_R);
              b.z = nz2 * (BALL_R + POST_R);
              hitPost();
            }
          }
        }
      }
      // kaleci (kaleci düzlemini geçerken)
      if (!b.goal && b.vz < 0 && Math.abs(b.z - KEEPER_Z) < BALL_R + 0.28 && simTime - lastContact > 0.15) {
        var c = keeperContact(gk, simTime, b.x, b.y);
        if (c.hit) {
          lastContact = simTime;
          b.touched = true;
          var speed = Math.hypot(b.vx, b.vy, b.vz);
          var bodyStill = !gk.dive || keeperBody(gk, simTime).e > 0.92;
          if (speed < 13 && bodyStill && Math.abs(b.y - 1.0) < 0.8) {
            // yavaş top, karşılayan kaleci: tutar
            b.caught = true;
            b.vx = b.vy = b.vz = 0;
          } else {
            // çeler: top geri ve yana sekme
            var out = 0.32 + Math.random() * 0.12;
            b.vz = Math.abs(b.vz) * out + 1.5;
            b.vx = c.nx * speed * 0.35 + b.vx * 0.15;
            b.vy = Math.max(1.2, c.ny * speed * 0.3 + 2.4);
            b.curl = 0;
          }
          onSave(c.part);
        }
      }
      // kale çizgisini tamamen geçti mi?
      if (!b.goal && !b.out && pz >= -BALL_R && b.z < -BALL_R) {
        if (Math.abs(b.x) < HALF - 0.01 && b.y < GOAL_H - 0.01) {
          b.goal = true;
          onGoal();
        } else b.out = true;
      }
      // file: içeride yavaşlar ve durur
      if (b.goal) {
        var depth = -b.z;
        var backAt = NET_D - BALL_R - 0.05;
        if (depth > backAt) {
          b.z = -backAt;
          netHit(b.x, b.y, Math.abs(b.vz));
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
      // tribün tarafı: dışarı giden top reklam panosunda durur
      if (b.z < -5) {
        b.z = -5;
        b.vz = Math.abs(b.vz) * 0.25;
      }
    }
  }

  /* ─────────────── akış ─────────────── */

  function start() {
    points = 0;
    matchIdx = 0;
    tally = { goals: 0, shots: 0, wins: 0, perfect: 0 };
    champion = false;
    history = [];
    jokers = { eye: 1, rocket: 1, big: 1 };
    armed = { eye: false, rocket: false, big: false };
    jokerUsed = 0;
    A.particles.length = 0;
    A.floaters.length = 0;
    A.banner = null;
    line = null;
    startMatch(0);
    A.sound("whistle");
  }

  function startMatch(m) {
    matchIdx = m;
    opp = opponentOf(m);
    match = { me: [], op: [], opDirs: [], sudden: false, turn: "shoot" };
    matchRain = opp.diff >= 0.55 && Math.random() < 0.3 + 0.45 * opp.diff;
    resetKick();
    castSig = "";
    setState("intro");
  }

  function setState(s) {
    state = s;
    stateT = 0;
  }

  function resetKick() {
    ball = newBall();
    gk = newKeeper();
    shot = null;
    dragFrom = null;
    powerT = 0;
    powerV = 0;
    slow = 1;
    replay = null;
    recording = [];
    lastContact = -1;
    netReset();
    simTime = 0;
    armed = { eye: false, rocket: false, big: false };
    gHalf = HALF;
    gTop = GOAL_H;
    kplan = null;
    slowT = 0;
    slowDone = false;
  }

  /** Sıradaki atış: kim atacak, maç bitti mi? */
  function nextKick() {
    var res = decided();
    if (res) {
      endMatch(res);
      return;
    }
    if (match.me.length === KICKS && match.op.length === KICKS && !match.sudden) {
      match.sudden = true;
      A.announce("ANİ ÖLÜM", "İlk kaçıran kaybeder", P.bad);
    }
    if (match.op.length < match.me.length) {
      oppKick();
      return;
    }
    resetKick();
    gk.reflex = attr(opp.keeper, "reflex", 75);
    rollConditions();
    kplan = planKeeper();
    aim.x = 0;
    aim.y = 1.1;
    setState("turn");
  }

  /**
   * Rakibin atışı: kulübün sıradaki gerçek atıcısı. İsabet merdivenle (rakip
   * kalitesi), atıcının isabet özelliğiyle ve ani ölüm baskısıyla belirlenir.
   */
  function oppKick() {
    var tk = opp.takers[match.op.length % opp.takers.length];
    var acc = norm(attr(tk.p, "accuracy", 76));
    var p = 0.66 + 0.17 * opp.diff + 0.05 * acc - (match.sudden ? 0.05 : 0);
    var scored = Math.random() < A.clamp(p, 0.45, 0.9);
    var miss = scored ? null : Math.random() < 0.6 ? "kurtaris" : Math.random() < 0.5 ? "direk" : "aut";
    match.op.push(scored ? "g" : "x");
    var side = Math.random() < tk.love ? tk.side : -tk.side;
    match.opDirs.push(side);
    oppShot = { taker: tk.p, result: scored ? "gol" : miss, dir: side };
    var gain = scored ? 0 : 25;
    points += gain;
    lastKick = { who: "op", result: oppShot.result, tags: gain ? ["BASKI"] : [], gain: gain, good: !scored };
    setState("oppKick");
  }

  /** Maç sonucu: 'won' | 'lost' | null (klasik seri penaltı erken bitiş kuralı). */
  function decided() {
    return decide(match.me, match.op, match.sudden);
  }
  function decide(mine, theirs, sudden) {
    var gm = goalsOf(mine), go = goalsOf(theirs);
    var nm = mine.length, no = theirs.length;
    if (!sudden && nm <= KICKS && no <= KICKS) {
      if (gm > go + (KICKS - no)) return "won";
      if (go > gm + (KICKS - nm)) return "lost";
      if (nm === KICKS && no === KICKS && gm !== go) return gm > go ? "won" : "lost";
      return null;
    }
    // ani ölüm: her çift atıştan sonra
    if (nm === no && gm !== go) return gm > go ? "won" : "lost";
    return null;
  }

  var endResult = null, endGain = 0;
  function endMatch(res) {
    endResult = res;
    endGain = 0;
    if (res === "won") {
      tally.wins += 1;
      endGain = 400 + 200 * matchIdx;
      if (goalsOf(match.me) === KICKS && match.me.length === KICKS) {
        endGain += 300;
        tally.perfect += 1;
        grantJoker();
      }
      var gift = grantJoker();
      if (gift) A.floatText("JOKER: " + JOKERS[gift].name + " +1", W / 2, H * 0.3, JOKERS[gift].color, 20);
      if (matchIdx >= keepers.length - 1) {
        champion = true;
        endGain += 1500;
      }
      points += endGain;
      scoreBump = 1;
      excite = 1;
      A.sound("level");
      A.haptic("success");
    } else {
      A.sound("over");
      A.haptic("warning");
    }
    setState("matchEnd");
  }

  function finish() {
    setState("over");
    A.send("over", {
      score: points,
      stats: {
        wins: tally.wins,
        goals: tally.goals,
        shots: tally.shots,
        perfect: tally.perfect,
        champion: champion,
        keeper: Math.min(matchIdx, keepers.length - 1) + 1,
        jokers: jokerUsed,
        keepers: keepers.length,
      },
    });
  }

  /* ─────────────── atış (sen) ─────────────── */

  function lockAim() {
    powerT = 0;
    if (armed.rocket) {
      // FÜZE: güç ayarı gerekmez — kusursuz ve en hızlı
      setState("power");
      takeShot(perfectPower(shotType));
      return;
    }
    setState("power");
  }

  /** Güç salınımı: 0 → 1 → 0 (zorluk ve baskıyla hızlanır). */
  function powerAt(t) {
    return 0.5 - 0.5 * Math.cos((t / cond.period) * Math.PI * 2);
  }

  /* ─────────────── jokerler ─────────────── */

  function grantJoker() {
    var pool = JOKER_KEYS.filter(function (k) {
      return jokers[k] < JOKER_MAX;
    });
    if (!pool.length) return null;
    var k = pool[(Math.random() * pool.length) | 0];
    jokers[k] += 1;
    return k;
  }
  /** Joker kullan (yalnız nişan evresinde; bu atış için). */
  function useJoker(key) {
    if (state !== "aim" || !JOKERS[key] || jokers[key] <= 0 || armed[key]) return false;
    jokers[key] -= 1;
    armed[key] = true;
    jokerUsed += 1;
    if (key === "big") {
      gHalf = HALF + BIG_W;
      gTop = GOAL_H + BIG_H;
    }
    A.sound(key === "eye" ? "whoosh" : "level");
    A.haptic("medium");
    A.floatText(JOKERS[key].name + "!", W / 2, H * 0.36, JOKERS[key].color, 24);
    return true;
  }

  function takeShot(v) {
    var ae = aimNow();
    var m = shotModel(shotType, ae.x, ae.y, v, armed.rocket);
    shot = {
      type: shotType, tx: m.tx, ty: m.ty, speed: m.speed, curl: m.curl, lob: m.lob, windK: m.windK,
      q: armed.rocket ? 1 : powerQuality(shotType, v), v: v, over: m.over, under: m.under,
      aimX: ae.x, aimY: ae.y, rocket: armed.rocket, big: armed.big, eye: armed.eye,
    };
    tally.shots += 1;
    history.push(ae.x < -1 ? -1 : ae.x > 1 ? 1 : 0);
    setState("runup");
  }

  /**
   * Rakip kalecinin kararı — atıştan ÖNCE verilir (KALECİ GÖZÜ bunu gösterir):
   * geçmiş atışlarından öğrendiği köşeye yatar, ortada bekler ya da son anda
   * topu okur. Merdivende ilerledikçe daha çok ezber bozar ve daha hızlı okur.
   */
  function planKeeper() {
    var d = opp.diff;
    var rf = norm(attr(opp.keeper, "reflex", 75));
    var c = { "-1": 1, "0": 0.6, "1": 1 };
    for (var i = Math.max(0, history.length - 6); i < history.length; i++) c[history[i]] += 1;
    var commit = 0.5 + 0.25 * d;
    if (Math.random() < commit) {
      var sharp = 1 + 2 * d;
      var wl = Math.pow(c["-1"], sharp), wc = Math.pow(c["0"], sharp) * 0.5, wr = Math.pow(c["1"], sharp);
      var r = Math.random() * (wl + wc + wr);
      var side = r < wl ? -1 : r < wl + wc ? 0 : 1;
      if (side === 0) return { mode: "stay", side: 0 };
      return { mode: "commit", side: side, lead: A.rand(-0.06, 0.04), tx: side * A.rand(2.0, 2.9), ty: A.rand(0.45, 1.7) };
    }
    return { mode: "read", side: 0, react: 0.3 - 0.11 * d - 0.04 * rf };
  }
  /** Vuruş anında kararı uygula. */
  function keeperDecides() {
    var k = gk, p = kplan || planKeeper();
    if (p.mode === "stay") {
      k.stay = true;
      k.set = 1;
    } else if (p.mode === "commit") k.plan = { at: kickAt + p.lead, tx: p.tx * (gHalf / HALF), ty: p.ty };
    else k.plan = { at: kickAt + p.react, read: true };
  }
  function keeperThink() {
    var k = gk;
    if (!k.plan || k.dive || simTime < k.plan.at) return;
    var p = k.plan;
    k.plan = null;
    if (p.read) {
      // topun kale düzlemine geleceği noktayı tahmin et (hatayla)
      var b = ball;
      var ft = b.vz < -0.1 ? (KEEPER_Z - b.z) / b.vz : 0.5;
      var px = b.x + b.vx * ft + 0.5 * b.curl * ft * ft;
      var py = b.y + b.vy * ft - 0.5 * GRAV * ft * ft;
      var err = (0.55 - 0.3 * opp.diff) * (Math.hypot(b.vx, b.vz) / 24);
      diveTo(k, simTime, px + A.gauss(0, err), A.clamp(py + A.gauss(0, err * 0.6), 0.2, 2.3));
    } else diveTo(k, simTime, p.tx, p.ty);
  }

  /* ─────────────── kalecilik (sen) ─────────────── */



  /* ─────────────── sonuç ─────────────── */

  function hitPost() {
    if (ball.post) return;
    ball.post = true;
    A.sound("post");
    A.shake(5);
    A.haptic("medium");
  }
  function onSave() {
    A.sound("tap");
    gk.saved = true;
  }
  function onGoal() {
    A.sound("net");
  }

  /** Atışın sonucu kesinleşti mi? */
  function judge() {
    var b = ball;
    if (b.goal) return b.t > 0.15 ? "gol" : null;
    if (b.caught) return "kurtaris";
    var speed = Math.hypot(b.vx, b.vy, b.vz);
    if (b.out || b.z < -0.6) return b.post ? "direk" : b.touched ? "kurtaris" : "aut";
    if (b.vz > 0.5 && b.z > 0.6) return b.touched ? "kurtaris" : b.post ? "direk" : "aut";
    if (b.t > 3 || (speed < 0.6 && b.y <= BALL_R + 0.01 && b.t > 0.6)) return b.touched ? "kurtaris" : b.post ? "direk" : "aut";
    return null;
  }

  var resultLen = 1.7;
  /** Senin atışının sonucu: skorbord, puan, spiker, golde tekrar. */
  function settle(result) {
    var scored = result === "gol";
    var tags = [];
    var gain = 0;
    match.me.push(scored ? "g" : "x");
    if (scored) {
      tally.goals += 1;
      gain = 100;
      var corner = Math.abs(ball.x) > gHalf - 1.26, high = ball.y > gTop - 0.8;
      if (corner && high) {
        gain += 150;
        tags.push("DOKSAN");
      } else {
        if (corner) {
          gain += 50;
          tags.push("KÖŞE");
        }
        if (high) {
          gain += 50;
          tags.push("YÜKSEK");
        }
      }
      if (shot && shot.type === "kasik") {
        gain += 150;
        tags.push("KAŞIK");
      }
      if (match.sudden) {
        gain += 50;
        tags.push("ANİ ÖLÜM");
      }
    }
    if (!scored && shot) {
      // neden kaçtı: oyuncuya geri bildirim
      if (shot.over > 0.015) tags.push("FAZLA GÜÇ");
      else if (shot.under > 0.015) tags.push("ZAYIF VURUŞ");
      if (Math.abs(cond.wind) > 2 && result !== "kurtaris") tags.push("RÜZGÂR");
    }
    if (scored && shot && shot.rocket) tags.push("FÜZE");
    points += gain;
    if (gain) scoreBump = 1;
    lastKick = { who: "me", result: result, tags: tags, gain: gain, good: scored };
    if (scored) {
      excite = 1;
      A.sound("cheer");
      A.haptic("success");
      confetti(kitOf(shooter));
      A.shake(6);
    } else {
      A.sound("groan");
      A.haptic("warning");
    }
    say(result);
    // Tekrar: golün yandan alçak açıyla
    resultLen = 1.7;
    if (scored && !A.reduceMotion && VIS && recording.length > 10) {
      replay = { frames: recording, mine: true };
      resultLen = REPLAY_AT + REPLAY_LEN + 0.2;
    }
    recording = [];
    setState("result");
  }

  function confetti(kit) {
    var p = proj(ball.x, ball.y, ball.z);
    A.burst(p.x, p.y, 70, {
      angle: -Math.PI / 2,
      spread: Math.PI * 1.3,
      speed: 420,
      gravity: 520,
      life: 1.6,
      size: 7,
      color: [kit.primary, kit.secondary, kit.primary, "#FFD24A", "#FFFFFF"],
      shape: "confetti",
      drag: 1.4,
    });
  }

  /* ─────────────── spiker ─────────────── */

  function say(result) {
    var S = shooter.short;
    var K = opp.keeper.short;
    var list;
    if (result === "gol") {
      list =
        lastKick.tags.indexOf("KAŞIK") >= 0
          ? ["Kaşık! " + S + " kaleciyi erken yatırdı!", "Panenka! Soğukkanlılığın dik âlâsı: " + S]
          : lastKick.tags.indexOf("DOKSAN") >= 0
            ? ["Doksana! " + K + " sadece izledi.", S + " örümcek ağlarını aldı!"]
            : [S + " affetmedi, gol!", "Ağlar havalandı! " + S, S + " kaleciyi ters köşeye yatırdı."];
    } else if (result === "kurtaris") {
      list = [K + " uçtu, kurtardı!", K + " köşeyi okudu!", "Müthiş refleks: " + K];
    } else if (result === "direk") {
      list = [S + " direği sarstı!", "Direkten döndü!"];
    } else {
      list = [S + " auta gönderdi.", "Top tribünlere gitti!"];
    }
    line = { text: A.pick(list), good: result === "gol" };
    lineT = 0;
  }

  /* ─────────────── güncelleme ─────────────── */

  function update(dt) {
    scoreBump = Math.max(0, scoreBump - dt * 4);
    lineT += dt;
    excite = Math.max(0, excite - dt * 0.35);
    stateT += dt;
    var sdt = dt * slow;
    simTime += sdt;
    netStep(dt);

    switch (state) {
      case "attract":
        gk.crouch = 0.5 + 0.5 * Math.sin(A.time * 3);
        return;
      case "intro":
        if (stateT >= INTRO) nextKick();
        return;
      case "turn":
        gk.crouch = 0.72 + 0.06 * Math.sin(A.time * 2.4);
        if (stateT >= TURN) {
          setState("aim");
          A.sound("whistle");
        }
        return;
      case "aim":
        gk.crouch = 0.75 + 0.06 * Math.sin(A.time * 2.6);
        // çizgide yan adımlar: zor kaleciler daha hareketli
        gk.x = (Math.sin(A.time * 1.25) * 0.7 + Math.sin(A.time * 2.9) * 0.3) * (0.08 + 0.22 * opp.diff);
        return;
      case "power":
        powerT += dt;
        powerV = powerAt(powerT);
        gk.crouch = 0.8;
        if (powerT > 5) takeShot(powerV); // unutulursa o anki güçle
        return;
      case "runup":
        gk.crouch = Math.min(1, gk.crouch + dt * 2);
        if (stateT >= RUNUP) strikeMine();
        return;
      case "flight":
        keeperThink();
        stepBall(sdt);
        closeCall(dt);
        record();
        var res = judge();
        if (res) {
          slow = 1;
          settle(res);
        }
        return;
      case "result":
        stepBall(dt);
        gk.cheer = Math.min(1, gk.cheer + dt * 2);
        if (stateT >= resultLen) nextKick();
        return;
      case "oppKick":
        // rakibin sonucu kartın ortasında açılır
        if (stateT > 0.75 && !oppShot.shown) {
          oppShot.shown = true;
          if (oppShot.result === "gol") A.sound("groan");
          else {
            A.sound("cheer");
            excite = 0.8;
            scoreBump = 1;
          }
        }
        if (stateT >= OPP_KICK) nextKick();
        return;
      case "matchEnd":
        if (stateT >= MATCH_END) {
          if (endResult === "won" && !champion) startMatch(matchIdx + 1);
          else finish();
        }
        return;
    }
  }

  /** Kıl payı anlarda yavaş çekim: top eldivenin yanından geçerken. */
  var slowT = 0, slowDone = false;
  function closeCall(dt) {
    if (slowT > 0) {
      slowT -= dt;
      if (slowT <= 0) slow = 1;
      return;
    }
    if (slowDone || !gk.dive || A.reduceMotion || ball.z > 2.4 || ball.z < 0.3) return;
    var kb = keeperBody(gk, simTime);
    var hx = kb.cx + kb.ax * ARM, hy = kb.cy + kb.ay * ARM;
    if (Math.hypot(ball.x - hx, ball.y - hy) < 0.8) {
      slowDone = true;
      slow = 0.3;
      slowT = 0.5;
    }
  }

  function strikeMine() {
    kickAt = simTime;
    ball = newBall();
    aimLaunch(ball, shot.tx, shot.ty, shot.speed, shot.curl, shot.lob);
    keeperDecides();
    keeperThink();
    setState("flight");
    A.sound("kick");
    A.haptic("medium");
    kickDust();
  }
  function kickDust() {
    var sp = proj(0, 0.05, SPOT_Z);
    A.burst(sp.x, sp.y, 14, { angle: -Math.PI / 2, spread: 1.8, speed: 170, gravity: 560, life: 0.55, size: 4, color: ["#2FA544", "#5FD35F", "#8BE36B", "#FFFFFF"] });
  }

  /** Tekrar için kayıt (60 Hz). */
  var recAcc = 0;
  function record() {
    recAcc += 1;
    if (recAcc % 2) return;
    var b = keeperBody(gk, simTime);
    recording.push({ t: simTime, bx: ball.x, by: ball.y, bz: ball.z, k: { x: gk.x, dive: gk.dive, stay: gk.stay, set: gk.set, crouch: gk.crouch, now: simTime }, e: b.e });
  }

  /* ─────────────── girdi ─────────────── */

  /** Vuruş türü düğmeleri (HUD ile ortak yerleşim). */
  function typeRects() {
    if (W > H * 1.15) {
      // yatay ekran: sol altta dikey sütun (atıcı ve kale ortada kalır)
      return TYPE_KEYS.map(function (k, i) {
        return { key: k, x: 12, y: H - 3 * 48 - 2 + i * 48, w: 104, h: 40 };
      });
    }
    var bw = Math.min(104, (W - 48) / 3), bh = 40, gap = 8;
    var total = bw * 3 + gap * 2;
    var x0 = W / 2 - total / 2, y = H - 64;
    return TYPE_KEYS.map(function (k, i) {
      return { key: k, x: x0 + i * (bw + gap), y: y, w: bw, h: bh };
    });
  }
  /** Joker düğmeleri: sağ kenarda dikey üç daire. */
  function jokerButtons() {
    var r = 21, x = W - 32, y0 = Math.min(Math.max(250, H * 0.5), H - 164);
    return JOKER_KEYS.map(function (k, i) {
      return { key: k, x: x, y: y0 + i * 62, r: r };
    });
  }
  function hitRect(r, p) {
    return p.x >= r.x - 4 && p.x <= r.x + r.w + 4 && p.y >= r.y - 6 && p.y <= r.y + r.h + 6;
  }

  var AIM_SENS_X = 8.6, AIM_SENS_Y = 4.6; // ekran genişliği/yüksekliği başına metre
  function down(p) {
    if (state === "result" && replay && stateT > REPLAY_AT && stateT < resultLen - 0.1) {
      stateT = resultLen - 0.05; // tekrarı geç
      return;
    }
    if (state === "aim") {
      var jb = jokerButtons();
      for (var j = 0; j < jb.length; j++)
        if (Math.hypot(p.x - jb[j].x, p.y - jb[j].y) < jb[j].r + 8) {
          useJoker(jb[j].key);
          dragFrom = null;
          return;
        }
      var rs = typeRects();
      for (var i = 0; i < rs.length; i++)
        if (hitRect(rs[i], p)) {
          shotType = rs[i].key;
          A.haptic("light");
          A.sound("tap");
          dragFrom = null;
          return;
        }
      dragFrom = { x: p.x, y: p.y, ax: aim.x, ay: aim.y, moved: 0 };
      return;
    }
    if (state === "power") {
      takeShot(powerV);
      return;
    }
  }
  function move(p) {
    if (state === "aim" && dragFrom) {
      var dx = p.x - dragFrom.x, dy = p.y - dragFrom.y;
      dragFrom.moved = Math.max(dragFrom.moved, Math.hypot(dx, dy));
      aim.x = A.clamp(dragFrom.ax + (dx / W) * AIM_SENS_X, -gHalf - 0.9, gHalf + 0.9);
      aim.y = A.clamp(dragFrom.ay - (dy / H) * AIM_SENS_Y, 0.15, gTop + 0.8);
      return;
    }
  }
  function up(p) {
    if (state === "aim" && dragFrom) {
      var moved = dragFrom.moved;
      dragFrom = null;
      if (moved > 10) lockAim();
      return;
    }
  }

  /* ═══════════════════════════ 2B ÇİZİM ═══════════════════════════
   * Savunma Hattı ile aynı aile: koyu lacivert konturlu, doygun renkli,
   * yuvarlak hatlı "flat vector" çizim. Sahne basit bir iğne deliği
   * kamerasıyla çizilir (atıcının arkasından kale): dünya (x, y, z) →
   * ekran. Statik parçalar (gökyüzü + şehir, tribün) ekran dışı katmanlara
   * bir kez çizilir; kamera yaklaşınca tribün katmanı ölçeklenir.
   */

  // Yuvarlak, kalın oyun yazısı (iOS'ta SF Pro Rounded); yoksa sistem fontu.
  A.FONT = '"SF Pro Rounded", ui-rounded, "Nunito", "Arial Rounded MT Bold", -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif';
  /** Gerçek tuval var mı (başsız testte yok: tekrar gösterimi kapalı kalır). */
  var VIS = !!(A.canvas && A.canvas.style);

  var NAVY = "#1B1648", INK = "#141043", GOLD = "#FFD43B", GOOD = "#22C55E", BAD = "#FF4D6A";

  function rgbOf(h) {
    var n = parseInt(String(h).slice(1), 16) || 0;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
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
    return (0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2]) / 255;
  }
  function colDist(a, b) {
    var p = rgbOf(a), q = rgbOf(b);
    return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
  }
  function kit2(person) {
    var k = kitOf(person);
    return { p: hex(k.primary, "#5B3DF5"), s: hex(k.secondary, "#FFFFFF") };
  }

  /* ─────────────── kamera ─────────────── */

  var CAM_Z = SPOT_Z + 11, CAM_Y = 3.2;
  var WAIT = { x: -1.15, z: SPOT_Z + 2.1 }; // atıcının bekleyiş yeri
  var PLANT = { x: -0.34, z: SPOT_Z + 0.32 }; // destek ayağı
  var STAND_Z = -9, STAND_H = 5.2, STAND_W = 40; // tribün (tek düzlem)
  var BOARD_Z = -4, BOARD_H = 0.9;
  var cam = { x: 0, y: CAM_Y, z: CAM_Z };
  var camCut = true, camMode = "";
  var L = { f: 900, hz: 200, key: "", wide: false };

  function layout() {
    var key = W + "x" + H;
    if (L.key === key) return;
    L.key = key;
    var wide = W > H * 1.15;
    var kTop = (CAM_Y - GOAL_H) / CAM_Z, kFeet = CAM_Y / (CAM_Z - WAIT.z);
    var bottomPad = wide ? 4 : 96;
    var topMin = wide ? Math.max(78, H * 0.24) : Math.max(118, H * 0.27);
    var f0 = (wide ? 0.44 : 0.84) * W * CAM_Z / GOAL_W;
    var room = Math.max(60, H - bottomPad - topMin);
    var f = Math.min(f0, room / (kFeet - kTop));
    var slack = room - f * (kFeet - kTop);
    L.f = f;
    L.hz = topMin - kTop * f + slack * 0.4;
    L.wide = wide;
    skyLayer = null;
    standLayers = null;
  }
  /** Dünya noktasının ekran konumu; s = metre başına piksel. */
  function proj(x, y, z) {
    var d = Math.max(0.3, cam.z - z), s = L.f / d;
    return { x: W / 2 + (x - cam.x) * s, y: L.hz + (cam.y - y) * s, s: s };
  }

  function inReplay() {
    return state === "result" && !!replay && stateT > REPLAY_AT && stateT < REPLAY_AT + REPLAY_LEN;
  }

  function placeCamera(dt) {
    var t = A.time, v = { x: 0, y: CAM_Y, z: CAM_Z }, k = 5, mode = "shoot";
    if (state === "attract" || state === "over") {
      v = { x: Math.sin(t * 0.21) * 1.1, y: CAM_Y + 0.4 + Math.sin(t * 0.33) * 0.3, z: CAM_Z + 1.5 + Math.sin(t * 0.17) * 1.5 };
      k = 2;
      mode = "attract";
    } else if (state === "intro") {
      var e = A.smooth(A.clamp(stateT / (INTRO * 0.85), 0, 1));
      v = { x: A.lerp(-3.5, 0, e), y: A.lerp(6, CAM_Y, e), z: A.lerp(46, CAM_Z, e) };
      k = 40;
      mode = "intro";
    } else if (state === "matchEnd") {
      var won = endResult === "won";
      v = { x: won ? -0.3 : gk.x * 0.5, y: CAM_Y + 1.1, z: CAM_Z - 2.6 };
      k = 2.5;
      mode = "end";
    } else if (inReplay()) {
      var rp = A.clamp((stateT - REPLAY_AT) / REPLAY_LEN, 0, 1);
      var fr = replay.frames[replay.frames.length - 1];
      var side = (fr.bx || 0) >= 0 ? 1 : -1;
      v = { x: A.clamp(fr.bx || 0, -3, 3) * 0.45 + side * rp * 0.3, y: (L.wide ? 2.6 : 4.0) - rp * 0.2, z: 15 - rp * 2.2 };
      mode = "replay";
      k = 3;
    } else {
      if (state === "power") v.z -= 0.45 * A.smooth(Math.min(1, stateT / 1.2));
      if (state === "runup") v.z -= 0.45 + 0.6 * A.smooth(A.clamp(stateT / RUNUP, 0, 1));
      if (state === "flight" || state === "result") {
        var fz = A.smooth(A.clamp((SPOT_Z - ball.z) / SPOT_Z, 0, 1));
        // yükselen yayın açısı: atıcı kadrajın altına iner, kaleci açıkta kalır
        v.z = CAM_Z - 1.0 - 1.5 * fz;
        v.x = ball.x * 0.16 * fz;
        v.y = CAM_Y + 1.2 * fz;
        k = 4;
      }
    }
    if (window.__cam) v = window.__cam;
    var cut = camCut || (mode !== camMode && (mode === "intro" || mode === "replay" || camMode === "replay"));
    camMode = mode;
    camCut = false;
    if (cut) {
      cam.x = v.x;
      cam.y = v.y;
      cam.z = v.z;
    } else {
      var a = 1 - Math.exp(-k * dt);
      cam.x += (v.x - cam.x) * a;
      cam.y += (v.y - cam.y) * a;
      cam.z += (v.z - cam.z) * a;
    }
    // el kamerası nefesi
    cam.x += Math.sin(t * 0.9) * 0.002;
    cam.y += Math.sin(t * 1.3) * 0.0015;
  }

  /* ─────────────── ağ (file) ─────────────── */

  var net = { x: 0, y: 1, amp: 0, t: 0 };
  function netReset() {
    net.amp = 0;
  }
  function netHit(x, y, speed) {
    net.x = x;
    net.y = y;
    net.amp = A.clamp(speed / 18, 0.25, 1) * 0.75;
    net.t = 0;
  }
  function netStep(dt) {
    net.t += dt;
    net.amp *= Math.exp(-2.6 * dt);
    if (net.amp < 0.002) net.amp = 0;
  }
  /** Ağın geriye şişmesi (m): darbe noktasında en büyük, sönümlü salınım. */
  function bulge(x, y) {
    if (!net.amp) return 0;
    var d2 = (x - net.x) * (x - net.x) + (y - net.y) * (y - net.y);
    return net.amp * Math.exp(-d2 / 0.9) * Math.cos(net.t * 14) * 0.9;
  }

  /* ─────────────── fon: gökyüzü + şehir ─────────────── */

  var skyLayer = null, standLayers = null, castSig = "";
  function standTopBase() {
    return L.hz + (CAM_Y - STAND_H) * (L.f / (CAM_Z - STAND_Z));
  }
  function paintSky() {
    var pad = 60;
    var lw = W + pad * 2, lh = H;
    var layer = A.layer(lw, lh);
    var c = layer.ctx;
    var rnd = A.seeded(4242);
    var base = standTopBase() + 18; // şehir taban çizgisi (tribünün arkası)
    var g = c.createLinearGradient(0, 0, 0, base);
    g.addColorStop(0, "#15114A");
    g.addColorStop(0.55, "#2A1C6E");
    g.addColorStop(1, "#5E2B8C");
    c.fillStyle = g;
    c.fillRect(0, 0, lw, Math.max(1, base));
    c.fillStyle = "#211A5A";
    c.fillRect(0, base, lw, lh - base);
    c.fillStyle = "#FFFFFF";
    for (var i = 0; i < 34; i++) {
      c.globalAlpha = 0.35 + rnd() * 0.5;
      c.beginPath();
      c.arc(rnd() * lw, rnd() * base * 0.7, rnd() < 0.2 ? 2 : 1.2, 0, Math.PI * 2);
      c.fill();
    }
    c.globalAlpha = 1;
    // ay
    var mr = A.clamp(Math.min(W, base) * 0.2, 22, 70), mx = pad + W * 0.76, my = base - mr * 1.05;
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
    // şehir: üç kat bina, yanan pencereler
    function buildings(color, cap, hMin, hMax, wMin, wMax, lit, seed) {
      var r2 = A.seeded(seed);
      var x = -r2() * 30;
      while (x < lw) {
        var bw = wMin + r2() * (wMax - wMin);
        var bh = Math.min(base - 4, (hMin + r2() * (hMax - hMin)) * Math.max(90, base));
        var by = base - bh;
        c.fillStyle = color;
        c.fillRect(x, by, bw, bh + 2);
        c.fillStyle = cap;
        c.fillRect(x - 3, by - 5, bw + 6, 7);
        c.fillStyle = rgba(NAVY, 0.25);
        c.fillRect(x + bw * 0.88, by, bw * 0.12, bh);
        var ww = Math.max(5, bw * 0.15), wh = ww * 1.25, gx = ww * 0.9, gy = wh * 0.75;
        for (var wy = by + 10; wy < base - wh - 2; wy += wh + gy)
          for (var wx = x + ww * 0.8; wx < x + bw - ww * 1.6; wx += ww + gx) {
            c.fillStyle = r2() < lit ? "#FFD98A" : rgba(NAVY, 0.45);
            A.roundRect(c, wx, wy, ww, wh, 1.5);
            c.fill();
          }
        x += bw + 4 + r2() * 14;
      }
    }
    if (base > 30) {
      buildings("#3A2A80", "#2C2068", 0.5, 0.95, 46, 86, 0.25, 7);
      buildings("#4B3399", "#33267A", 0.3, 0.7, 40, 70, 0.45, 19);
      buildings("#2E3A8F", "#232C70", 0.18, 0.45, 50, 90, 0.5, 31);
    }
    // projektör kuleleri
    [pad + W * 0.04, pad + W * 0.96].forEach(function (px) {
      var py = Math.max(18, base * 0.18);
      c.fillStyle = "#231B5E";
      c.fillRect(px - 3, py, 6, base - py);
      var lg = c.createRadialGradient(px, py, 2, px, py, 80);
      lg.addColorStop(0, "rgba(255,250,220,0.6)");
      lg.addColorStop(1, "rgba(255,250,220,0)");
      c.fillStyle = lg;
      c.fillRect(px - 80, py - 80, 160, 160);
      c.fillStyle = "#2B2268";
      A.roundRect(c, px - 18, py - 11, 36, 20, 5);
      c.fill();
      c.fillStyle = "#FFF6D0";
      for (var r = 0; r < 2; r++)
        for (var li = 0; li < 4; li++) {
          c.beginPath();
          c.arc(px - 12 + li * 8, py - 5 + r * 8, 2.8, 0, Math.PI * 2);
          c.fill();
        }
    });
    layer.pad = pad;
    return layer;
  }

  /* ─────────────── tribün (takım renkli seyirci) ─────────────── */

  /** İki kare: oturan ve zıplayan (kollar havada) seyirci. Sol yarı senin, sağ yarı rakibin renkleri. */
  function paintStands() {
    var sc = Math.min(48, L.f / (CAM_Z - STAND_Z)) * 1.25;
    var lw = STAND_W * sc, lh = STAND_H * sc;
    var mine = kit2(shooter), rk = kit2(opp.keeper);
    return [0, 1].map(function (jump) {
      var layer = A.layer(lw, lh);
      var c = layer.ctx;
      var rnd = A.seeded(9001);
      c.fillStyle = "#231C63";
      c.fillRect(0, 0, lw, lh);
      // çatı saçağı + ışıklar
      var roofH = 0.55 * sc;
      c.fillStyle = "#17123F";
      c.fillRect(0, 0, lw, roofH);
      c.fillStyle = "#2B2272";
      c.fillRect(0, roofH - 3, lw, 3);
      c.fillStyle = "#FFF3C4";
      for (var lx = sc * 0.7; lx < lw; lx += sc * 2.2) {
        c.beginPath();
        c.arc(lx, roofH * 0.45, Math.max(1.5, sc * 0.07), 0, Math.PI * 2);
        c.fill();
      }
      var rowH = 0.6 * sc, top = roofH + 0.15 * sc, bottom = lh - 0.75 * sc;
      var rows = Math.max(3, Math.floor((bottom - top) / rowH));
      for (var r = 0; r < rows; r++) {
        var ry = top + r * rowH;
        c.fillStyle = r % 2 ? "#2A2275" : "#251E68";
        c.fillRect(0, ry, lw, rowH);
        var step = 0.44 * sc, off = (r % 2) * step * 0.5;
        for (var x = off + step * 0.4; x < lw; x += step) {
          var u = x / lw; // 0 sol .. 1 sağ
          var home = u < 0.5;
          var k = home ? mine : rk;
          var q = rnd();
          var col = q < 0.62 ? k.p : q < 0.86 ? k.s : rnd() < 0.5 ? "#FFFFFF" : mixc(k.p, NAVY, 0.35);
          if (Math.abs(u - 0.5) < 0.02) col = "#3A2F8C";
          var hr = 0.13 * sc * (0.9 + rnd() * 0.2);
          var lift = jump ? (0.08 + rnd() * 0.08) * sc : rnd() * 0.03 * sc;
          var cx = x + (rnd() - 0.5) * step * 0.25, cy = ry + rowH * 0.62 - lift;
          var skin = ["#F6C9A4", "#E9B08A", "#C98D63", "#8E5B3C"][(rnd() * 4) | 0];
          var arms = jump && rnd() < 0.85;
          if (arms) {
            c.strokeStyle = col;
            c.lineCap = "round";
            c.lineWidth = hr * 0.7;
            c.beginPath();
            c.moveTo(cx - hr, cy + hr * 1.2);
            c.lineTo(cx - hr * 1.6, cy - hr * 1.3);
            c.moveTo(cx + hr, cy + hr * 1.2);
            c.lineTo(cx + hr * 1.6, cy - hr * 1.3);
            c.stroke();
          }
          c.fillStyle = col;
          c.beginPath();
          c.ellipse(cx, cy + hr * 2.0, hr * 1.45, hr * 1.25, 0, Math.PI, Math.PI * 2);
          c.fill();
          c.fillStyle = skin;
          c.beginPath();
          c.arc(cx, cy, hr, 0, Math.PI * 2);
          c.fill();
          if (rnd() < 0.3) {
            // bere / saç
            c.fillStyle = rnd() < 0.5 ? k.s : "#2B1B12";
            c.beginPath();
            c.arc(cx, cy - hr * 0.2, hr * 0.95, Math.PI, Math.PI * 2);
            c.fill();
          }
          if (jump && rnd() < 0.08) {
            // atkı
            c.fillStyle = k.s;
            c.fillRect(cx - hr * 2.2, cy - hr * 2.6, hr * 4.4, hr * 0.9);
            c.fillStyle = k.p;
            c.fillRect(cx - hr * 0.9, cy - hr * 2.6, hr * 1.8, hr * 0.9);
          }
        }
      }
      // ön duvar
      c.fillStyle = "#1C1650";
      c.fillRect(0, bottom, lw, lh - bottom);
      c.fillStyle = "#3A2F8C";
      c.fillRect(0, bottom, lw, Math.max(2, sc * 0.06));
      // iki taraf: dev bayrak şeritleri
      [[0.2, mine], [0.8, rk]].forEach(function (b) {
        var bx = lw * b[0], bw = sc * 3.4, bh = sc * 0.5;
        c.fillStyle = b[1].p;
        c.fillRect(bx - bw / 2, bottom - bh * 0.15, bw, bh);
        c.fillStyle = b[1].s;
        c.fillRect(bx - bw / 2, bottom + bh * 0.25, bw, bh * 0.2);
      });
      layer.sc = sc;
      return layer;
    });
  }

  function drawBackdrop(c) {
    if (!skyLayer) skyLayer = paintSky();
    var px = -skyLayer.pad - A.clamp(cam.x * 6, -skyLayer.pad, skyLayer.pad);
    // şehir tribünün tepesini izler (yakınlaşmada hafif paralaks)
    var py = A.clamp((proj(0, STAND_H, STAND_Z).y - standTopBase()) * 0.85, -40, 160);
    c.drawImage(skyLayer.canvas, px, py, skyLayer.w, skyLayer.h);
    if (py > 0) {
      c.fillStyle = "#15114A";
      c.fillRect(0, 0, W, py + 1);
    }
    var sig = kit2(shooter).p + kit2(opp.keeper).p + ":" + L.key;
    if (!standLayers || castSig !== sig) {
      standLayers = paintStands();
      castSig = sig;
    }
    var p = proj(-STAND_W / 2, STAND_H, STAND_Z);
    var sw = STAND_W * p.s, sh = STAND_H * p.s;
    // tribünün altı (zemine kadar) koyu yapı
    var gy = proj(0, 0, STAND_Z).y;
    c.fillStyle = "#1C1650";
    c.fillRect(0, p.y + sh - 2, W, Math.max(0, gy - p.y - sh + 40));
    c.drawImage(standLayers[0].canvas, p.x, p.y, sw, sh);
    var ex = state === "attract" ? 0.15 + 0.15 * Math.max(0, Math.sin(A.time * 0.7)) : Math.max(excite, state === "result" && lastKick && lastKick.good ? 1 : 0, state === "matchEnd" && endResult === "won" ? 1 : 0);
    if (ex > 0.05) {
      var bounce = Math.abs(Math.sin(A.time * 9)) * 0.06 * p.s;
      c.save();
      c.globalAlpha = Math.min(1, ex * 1.2) * (0.55 + 0.45 * Math.abs(Math.sin(A.time * 9)));
      c.drawImage(standLayers[1].canvas, p.x, p.y - bounce, sw, sh);
      c.restore();
      // flaşlar
      var r = A.seeded(((A.time * 12) | 0) + 3);
      c.fillStyle = "#FFFFFF";
      for (var i = 0; i < 7 * ex; i++) {
        var fx = p.x + r() * sw, fy = p.y + sh * (0.15 + r() * 0.7);
        c.globalAlpha = 0.8;
        c.beginPath();
        c.arc(fx, fy, 1.5 + r() * 2, 0, Math.PI * 2);
        c.fill();
      }
      c.globalAlpha = 1;
    }
  }

  /* ─────────────── reklam panoları ─────────────── */

  var BOARD_COLS = [["#DB2777", "#9333EA"], ["#7C3AED", "#4F46E5"], ["#0EA5E9", "#2563EB"]];
  function drawBoards(c) {
    var goalNow = state === "result" && lastKick && lastKick.result === "gol";
    var seg = 4.5, x0 = -18;
    var a = proj(x0, BOARD_H, BOARD_Z), fs = BOARD_H * a.s * 0.56;
    c.save();
    c.font = A.font(fs, 900);
    c.textAlign = "center";
    c.textBaseline = "middle";
    var texts = ["ELİTLİG", "SERİ PENALTI", upperTR(teamName(shooter)), "ELİTLİG ARENA", upperTR(teamName(opp.keeper))];
    for (var i = 0; x0 + i * seg < 18; i++) {
      var p0 = proj(x0 + i * seg, BOARD_H, BOARD_Z), p1 = proj(x0 + (i + 1) * seg, 0, BOARD_Z);
      if (p1.x < -10 || p0.x > W + 10) continue;
      var cols = BOARD_COLS[i % 3];
      if (goalNow && Math.sin(A.time * 14 + i) > 0) cols = ["#FFD43B", "#F59E0B"];
      var g = c.createLinearGradient(p0.x, 0, p1.x, 0);
      g.addColorStop(0, cols[0]);
      g.addColorStop(1, cols[1]);
      c.fillStyle = g;
      c.fillRect(p0.x, p0.y, p1.x - p0.x - 1.5, p1.y - p0.y);
      c.fillStyle = "rgba(255,255,255,0.18)";
      c.fillRect(p0.x, p0.y, p1.x - p0.x - 1.5, (p1.y - p0.y) * 0.3);
      c.fillStyle = goalNow ? NAVY : "#FFFFFF";
      var txt = goalNow ? "GOOOL!" : texts[i % texts.length];
      c.fillText(fit(c, txt, p1.x - p0.x - 8), (p0.x + p1.x) / 2, (p0.y + p1.y) / 2 + 1);
    }
    var t0 = proj(0, BOARD_H, BOARD_Z), t1 = proj(0, 0, BOARD_Z);
    c.fillStyle = NAVY;
    c.fillRect(0, t0.y - 2, W, 2.5);
    c.fillRect(0, t1.y - 1, W, 2.5);
    c.restore();
  }

  /* ─────────────── saha ─────────────── */

  function groundQuad(c, x0, z0, x1, z1, w) {
    var zmax = cam.z - 0.4;
    if (z0 > zmax && z1 > zmax) return;
    if (z0 > zmax) {
      x0 = x1 + ((x0 - x1) * (zmax - z1)) / (z0 - z1);
      z0 = zmax;
    }
    if (z1 > zmax) {
      x1 = x0 + ((x1 - x0) * (zmax - z0)) / (z1 - z0);
      z1 = zmax;
    }
    var dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz) || 1;
    var nx = (-dz / len) * w * 0.5, nz = (dx / len) * w * 0.5;
    var a = proj(x0 + nx, 0, z0 + nz), b = proj(x1 + nx, 0, z1 + nz), d = proj(x1 - nx, 0, z1 - nz), e = proj(x0 - nx, 0, z0 - nz);
    c.moveTo(a.x, a.y);
    c.lineTo(b.x, b.y);
    c.lineTo(d.x, d.y);
    c.lineTo(e.x, e.y);
    c.closePath();
  }
  function drawPitch(c) {
    var top = proj(0, 0, BOARD_Z).y;
    c.fillStyle = "#3BB54A";
    c.fillRect(0, top, W, H - top + 2);
    // biçme şeritleri (kale çizgisine paralel bantlar)
    var bandW = 2.2;
    for (var i = 0, z = BOARD_Z; z < cam.z - 0.3; z += bandW, i++) {
      var y0 = proj(0, 0, z).y, y1 = proj(0, 0, Math.min(cam.z - 0.3, z + bandW)).y;
      if (y0 > H) break;
      c.fillStyle = i % 2 ? "#4CC552" : "#5FD35F";
      c.fillRect(0, y0, W, Math.min(H, y1) - y0 + 0.5);
    }
    // uzak kısım hafif koyu (derinlik)
    var g = c.createLinearGradient(0, top, 0, top + (H - top) * 0.5);
    g.addColorStop(0, "rgba(20,60,40,0.28)");
    g.addColorStop(1, "rgba(20,60,40,0)");
    c.fillStyle = g;
    c.fillRect(0, top, W, (H - top) * 0.5);
    // tebeşir çizgileri
    var lw = 0.12;
    c.fillStyle = "rgba(255,255,255,0.92)";
    c.beginPath();
    groundQuad(c, -26, 0, 26, 0, lw);
    [-1, 1].forEach(function (sd) {
      groundQuad(c, sd * 9.16, 0, sd * 9.16, 5.5, lw);
      groundQuad(c, sd * 20.16, 0, sd * 20.16, 16.5, lw);
    });
    groundQuad(c, -9.16, 5.5, 9.16, 5.5, lw);
    groundQuad(c, -20.16, 16.5, 20.16, 16.5, lw);
    c.fill();
    // ceza yayı
    c.beginPath();
    var arcPts = [];
    for (var a = -0.92; a <= 0.921; a += 0.08) arcPts.push([Math.sin(a) * 9.15, SPOT_Z + Math.cos(a) * 9.15]);
    for (var j = 0; j < arcPts.length - 1; j++) if (arcPts[j][1] > 16.5 || arcPts[j + 1][1] > 16.5) groundQuad(c, arcPts[j][0], Math.max(16.5, arcPts[j][1]), arcPts[j + 1][0], Math.max(16.5, arcPts[j + 1][1]), lw);
    c.fill();
    // penaltı noktası
    var sp = proj(0, 0, SPOT_Z);
    c.beginPath();
    c.ellipse(sp.x, sp.y, 0.16 * sp.s, Math.max(1.5, (0.16 * sp.s * cam.y) / (cam.z - SPOT_Z)), 0, 0, Math.PI * 2);
    c.fill();
  }

  /* ─────────────── kale ─────────────── */

  var gv = { x: 1, y: 1 };
  function drawNet(c) {
    var hw = HALF * gv.x, top = GOAL_H * gv.y, back = NET_BACK_H * gv.y, D = NET_D;
    // iç gölge (file arkası): kale ağzı
    var a = proj(-hw, top, 0), b = proj(hw, 0, 0);
    c.fillStyle = "rgba(20,16,67,0.3)";
    c.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
    // ağ örgüsü
    var st = 0.26;
    c.strokeStyle = "rgba(255,255,255,0.62)";
    c.lineWidth = Math.max(0.8, 0.022 * a.s);
    c.beginPath();
    var x, y, p, i;
    var nx = Math.ceil((hw * 2) / st), ny = Math.ceil(back / st);
    // arka yüz: dikeyler
    for (i = 0; i <= nx; i++) {
      x = -hw + (i * hw * 2) / nx;
      for (var j = 0; j <= ny; j++) {
        y = (j * back) / ny;
        p = proj(x, y, -D - bulge(x, y));
        if (j) c.lineTo(p.x, p.y);
        else c.moveTo(p.x, p.y);
      }
    }
    // arka yüz: yataylar
    for (j = 0; j <= ny; j++) {
      y = (j * back) / ny;
      for (i = 0; i <= nx; i++) {
        x = -hw + (i * hw * 2) / nx;
        p = proj(x, y, -D - bulge(x, y));
        if (i) c.lineTo(p.x, p.y);
        else c.moveTo(p.x, p.y);
      }
    }
    // üst yüz: üst direkten arka üste
    for (i = 0; i <= nx; i++) {
      x = -hw + (i * hw * 2) / nx;
      p = proj(x, top, 0);
      c.moveTo(p.x, p.y);
      p = proj(x, back, -D - bulge(x, back));
      c.lineTo(p.x, p.y);
    }
    var nd = Math.ceil(D / st);
    for (var k = 1; k < nd; k++) {
      var zz = -(k * D) / nd, yy = top + ((back - top) * k) / nd;
      p = proj(-hw, yy, zz);
      c.moveTo(p.x, p.y);
      p = proj(hw, yy, zz);
      c.lineTo(p.x, p.y);
    }
    // yan yüzler
    [-hw, hw].forEach(function (sx) {
      for (var k2 = 0; k2 <= nd; k2++) {
        var z2 = -(k2 * D) / nd, y2 = top + ((back - top) * k2) / nd;
        var q = proj(sx, y2, z2);
        c.moveTo(q.x, q.y);
        q = proj(sx, 0, z2);
        c.lineTo(q.x, q.y);
      }
      for (var j2 = 1; j2 < ny; j2++) {
        var y3 = (j2 * back) / ny;
        var q2 = proj(sx, Math.min(y3, top), 0);
        c.moveTo(q2.x, q2.y);
        q2 = proj(sx, y3, -D);
        c.lineTo(q2.x, q2.y);
      }
    });
    c.stroke();
    // arka direkler (gergi)
    c.strokeStyle = "#C9C6E8";
    c.lineWidth = Math.max(1.5, 0.05 * a.s);
    c.beginPath();
    [-hw, hw].forEach(function (sx) {
      var q = proj(sx, top, 0);
      c.moveTo(q.x, q.y);
      q = proj(sx, back, -D);
      c.lineTo(q.x, q.y);
      q = proj(sx, 0, -D);
      c.lineTo(q.x, q.y);
    });
    c.stroke();
  }
  function drawGoalFrame(c) {
    var hw = HALF * gv.x + POST_R, top = GOAL_H * gv.y + POST_R;
    var l0 = proj(-hw, 0, 0), l1 = proj(-hw, top, 0), r1 = proj(hw, top, 0), r0 = proj(hw, 0, 0);
    var w = Math.max(5, POST_R * 2.6 * l0.s);
    c.save();
    c.lineCap = "round";
    c.lineJoin = "round";
    c.beginPath();
    c.moveTo(l0.x, l0.y);
    c.lineTo(l1.x, l1.y);
    c.lineTo(r1.x, r1.y);
    c.lineTo(r0.x, r0.y);
    c.strokeStyle = NAVY;
    c.lineWidth = w + 5;
    c.stroke();
    c.strokeStyle = gv.x > 1.02 ? "#B9F5D8" : "#FFFFFF";
    c.lineWidth = w;
    c.stroke();
    // gölge şeridi
    c.strokeStyle = "rgba(27,22,72,0.18)";
    c.lineWidth = w * 0.35;
    c.beginPath();
    c.moveTo(l0.x + w * 0.22, l0.y);
    c.lineTo(l1.x + w * 0.22, l1.y + w * 0.22);
    c.lineTo(r1.x - w * 0.22, r1.y + w * 0.22);
    c.lineTo(r0.x - w * 0.22, r0.y);
    c.stroke();
    // direk dibi gölgesi
    c.fillStyle = "rgba(20,16,67,0.25)";
    [l0, r0].forEach(function (q) {
      c.beginPath();
      c.ellipse(q.x, q.y, w * 1.2, w * 0.4, 0, 0, Math.PI * 2);
      c.fill();
    });
    c.restore();
  }

  /** Rüzgâr bayrakları: kalenin iki yanında, rüzgârın yönünde ve şiddetinde dalgalanır. */
  function drawFlags(c) {
    var str = A.clamp(Math.abs(cond.wind) / 6, 0, 1), dir = cond.wind >= 0 ? 1 : -1;
    var cols = [kit2(shooter), kit2(opp.keeper)];
    [-1, 1].forEach(function (side, fi) {
      var px = side * (HALF * gv.x + 0.95), pz = -3.3;
      var b = proj(px, 0, pz), t = proj(px, 3.6, pz);
      c.lineCap = "round";
      c.strokeStyle = NAVY;
      c.lineWidth = Math.max(3, 0.1 * b.s) + 2.5;
      c.beginPath();
      c.moveTo(b.x, b.y);
      c.lineTo(t.x, t.y);
      c.stroke();
      c.strokeStyle = "#E2E8F0";
      c.lineWidth -= 2.5;
      c.stroke();
      var len = 1.25 * t.s, hgt = 0.75 * t.s;
      var reach = len * (0.3 + 0.7 * str), droop = (1 - str) * hgt * 0.9;
      var ph = A.time * (4 + 6 * str) + fi;
      c.beginPath();
      c.moveTo(t.x, t.y);
      var N = 8, pts = [];
      for (var i = 0; i <= N; i++) {
        var u = i / N;
        pts.push([t.x + dir * reach * u, t.y + droop * u * u + Math.sin(ph - u * 5) * hgt * 0.12 * u * (0.4 + str)]);
      }
      pts.forEach(function (q) {
        c.lineTo(q[0], q[1]);
      });
      for (var j = N; j >= 0; j--) c.lineTo(pts[j][0] - (droop ? 0 : 0), pts[j][1] + hgt * (1 - 0.15 * (j / N)));
      c.closePath();
      c.fillStyle = cols[fi].p;
      c.fill();
      c.lineWidth = 2;
      c.strokeStyle = NAVY;
      c.lineJoin = "round";
      c.stroke();
      c.beginPath();
      c.arc(t.x, t.y - 2, 3.5, 0, Math.PI * 2);
      c.fillStyle = GOLD;
      c.fill();
      c.lineWidth = 1.5;
      c.stroke();
    });
  }

  /* ─────────────── karakterler ─────────────── */

  var SKINS = ["#F6C9A4", "#E9B08A", "#C98D63", "#8E5B3C", "#F3D3B8"];
  var HAIRS = ["#2B1B12", "#5A3418", "#141414", "#8A5426", "#E2B04A"];
  function lookOf(person) {
    var h = hashStr((person && person.id) + ":" + (person && person.name));
    return { skin: SKINS[h % SKINS.length], hair: HAIRS[(h >>> 4) % HAIRS.length] };
  }
  /** Kalın lacivert konturlu uzuv (birim: metre, ölçek dışarıda). */
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
  function limb3(c, x1, y1, x2, y2, x3, y3, w, col, lw) {
    c.strokeStyle = NAVY;
    c.lineWidth = w + lw * 2;
    c.beginPath();
    c.moveTo(x1, y1);
    c.lineTo(x2, y2);
    c.lineTo(x3, y3);
    c.stroke();
    c.strokeStyle = col;
    c.lineWidth = w;
    c.stroke();
  }
  /** Metre ölçeğindeki çizimde piksel fontla yazı (küçük kesirli font boyutlarından kaçınır). */
  function textM(c, txt, x, y, sizeM, s, fill, stroke) {
    c.save();
    c.scale(1 / s, 1 / s);
    c.font = A.font(Math.max(5, sizeM * s), 900);
    c.textAlign = "center";
    c.textBaseline = "middle";
    if (stroke) {
      c.lineJoin = "round";
      c.lineWidth = Math.max(2, sizeM * s * 0.14);
      c.strokeStyle = stroke;
      c.strokeText(txt, x * s, y * s);
    }
    c.fillStyle = fill;
    c.fillText(txt, x * s, y * s);
    c.restore();
  }
  function disc(c, x, y, r, fill, lw) {
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
  function shadowAt(c, x, z, rx, a) {
    var p = proj(x, 0, z);
    c.fillStyle = "rgba(20,16,67," + (a == null ? 0.28 : a) + ")";
    c.beginPath();
    c.ellipse(p.x, p.y, rx * p.s, Math.max(1.5, (rx * p.s * cam.y) / Math.max(0.5, cam.z - z)) * 0.9, 0, 0, Math.PI * 2);
    c.fill();
  }

  /** Kalecinin forması: iki takımın renklerinden en uzak canlı renk. */
  var GK_COLS = ["#22C55E", "#F97316", "#FACC15", "#EC4899", "#06B6D4", "#A3E635", "#F43F5E"];
  var gkKitCache = { sig: "", kit: null };
  function keeperKit() {
    var tp = kit2(opp.keeper).p, sp = kit2(shooter).p;
    var sig = tp + sp;
    if (gkKitCache.sig === sig) return gkKitCache.kit;
    var best = GK_COLS[0], bd = -1;
    GK_COLS.forEach(function (c) {
      var d = Math.min(colDist(c, tp), colDist(c, sp));
      if (d > bd) {
        bd = d;
        best = c;
      }
    });
    gkKitCache = { sig: sig, kit: { p: best, s: tp, short: mixc(best, NAVY, 0.55) } };
    return gkKitCache.kit;
  }

  /**
   * KALECİ (önden). Gövde simülasyonun kapsülüyle aynı yerde: merkez
   * (cx, cy), eksen (ax, ay); uçuşta tüm figür eksene döner, ortasında esner
   * (squash & stretch), yere inişte yassılır.
   */
  function drawKeeper(c, k, now, ex, bxw) {
    var b = keeperBody(k, now);
    var kit = keeperKit(), look = lookOf(opp.keeper);
    var cx = b.cx, cy = b.cy, ang = 0, sx = 1, sy = 1, diving = b.diving;
    var land = ex.land || 0;
    if (diving) {
      ang = Math.atan2(b.ax, b.ay);
      var str = Math.sin(Math.min(1, b.e) * Math.PI * 0.9);
      sx = 1 - 0.1 * str;
      sy = 1 + 0.14 * str;
      if (land > 0) {
        if (Math.abs(ang) > 0.35) {
          ang = A.lerp(ang, Math.sign(ang) * Math.PI / 2, land);
          cy = A.lerp(cy, 0.3, land);
        } else {
          ang *= 1 - land;
          cy = A.lerp(cy, 0.98, land);
        }
        var imp = Math.sin(A.clamp((land - 0.55) / 0.45, 0, 1) * Math.PI);
        sx *= 1 + 0.14 * imp;
        sy *= 1 - 0.14 * imp;
      }
    }
    var hop = ex.hop || 0;
    if (!diving) {
      cy += hop * 0.16 + (ex.bob || 0);
      sy *= 1 + 0.08 * hop - 0.05 * (k.crouch || 0) * (1 - hop);
      sx *= 1 - 0.04 * hop + 0.03 * (k.crouch || 0);
    }
    var p = proj(cx, cy, KEEPER_Z);
    var s = p.s;
    // gölge
    shadowAt(c, cx, KEEPER_Z, diving ? 0.55 + 0.4 * Math.abs(Math.sin(ang)) : 0.45, 0.3 * (1 - A.clamp((cy - 1.2) / 1.5, 0, 0.7)));
    c.save();
    c.translate(p.x, p.y);
    c.rotate(ang + (ex.lean || 0) * 0.3);
    c.scale(s * sx, s * sy);
    c.lineJoin = "round";
    c.lineCap = "round";
    var LW = 2.4 / s;
    var sock = kit.p, shorts = kit.short;
    var hipY = 0.1, shY = -0.42, headY = -0.76, HR = 0.28;
    var gloveR = 0.12;
    var hands, feet, knees;
    if (diving) {
      hands = [[-0.14, -1.0], [0.14, -1.02]];
      knees = [[-0.13, 0.5], [0.24, 0.42]];
      feet = [[-0.17, 0.92], [0.12, 0.8]];
      headY = -0.66;
    } else {
      var fy = cy; // ayaklar yerde
      var cr = k.crouch || 0;
      var spread = 0.42 + (k.set || 0) * 0.12;
      var handY = -(1.12 + (k.set || 0) * 0.25 - cy);
      var wave = ex.wave || 0;
      hands = [[-spread - 0.04, handY - wave * 0.2], [spread + 0.04, handY - wave * 0.2 * Math.sin(A.time * 9)]];
      if (ex.cheer) {
        var ch = ex.cheer;
        hands = [[A.lerp(hands[0][0], -0.5, ch), A.lerp(hands[0][1], -1.12 - 0.08 * Math.sin(A.time * 10), ch)], [A.lerp(hands[1][0], 0.5, ch), A.lerp(hands[1][1], -1.12 - 0.08 * Math.cos(A.time * 10), ch)]];
      }
      if (ex.caught) hands = [[-0.17, -0.12], [0.17, -0.12]];
      knees = [[-0.2 - cr * 0.09, (hipY + fy) * 0.5], [0.2 + cr * 0.09, (hipY + fy) * 0.5]];
      feet = [[-0.22 - cr * 0.05, fy], [0.22 + cr * 0.05, fy]];
    }
    // bacaklar
    for (var i = 0; i < 2; i++) {
      var hx = i ? 0.11 : -0.11;
      limb3(c, hx, hipY, knees[i][0], knees[i][1], feet[i][0], feet[i][1] - 0.06, 0.15, look.skin, LW);
      limb(c, knees[i][0] + (feet[i][0] - knees[i][0]) * 0.15, knees[i][1] + (feet[i][1] - knees[i][1]) * 0.15, feet[i][0], feet[i][1] - 0.06, 0.16, sock, LW);
      c.save();
      c.translate(feet[i][0] + (i ? 0.03 : -0.03), feet[i][1] - 0.03);
      c.beginPath();
      c.ellipse(0, 0, 0.12, 0.065, 0, 0, Math.PI * 2);
      c.fillStyle = NAVY;
      c.fill();
      c.fillStyle = "#FFFFFF";
      c.fillRect(-0.06, -0.03, 0.12, 0.018);
      c.restore();
    }
    // şort
    A.roundRect(c, -0.26, -0.04, 0.52, 0.3, 0.09);
    c.fillStyle = shorts;
    c.fill();
    c.lineWidth = LW;
    c.strokeStyle = NAVY;
    c.stroke();
    // kollar (gövdenin arkasından çıkar)
    for (var j = 0; j < 2; j++) {
      var shx = j ? 0.24 : -0.24;
      var hx2 = hands[j][0], hy2 = hands[j][1];
      var mx = shx + (hx2 - shx) * 0.45 + (j ? 0.05 : -0.05), my = shY + (hy2 - shY) * 0.45;
      limb3(c, shx, shY + 0.04, mx, my, hx2, hy2, 0.13, kit.p, LW);
    }
    // gövde
    A.roundRect(c, -0.27, shY - 0.06, 0.54, hipY - shY + 0.08, 0.13);
    c.fillStyle = kit.p;
    c.fill();
    c.save();
    c.clip();
    c.fillStyle = kit.s;
    c.fillRect(-0.27, shY - 0.06, 0.54, 0.07);
    c.fillStyle = rgba(mixc(kit.p, NAVY, 0.4), 0.6);
    for (var st = -0.2; st < 0.3; st += 0.13) c.fillRect(st, shY + 0.05, 0.035, 0.5);
    c.fillStyle = "rgba(255,255,255,0.3)";
    A.roundRect(c, -0.2, shY + 0.02, 0.09, 0.2, 0.04);
    c.fill();
    c.restore();
    A.roundRect(c, -0.27, shY - 0.06, 0.54, hipY - shY + 0.08, 0.13);
    c.lineWidth = LW;
    c.strokeStyle = NAVY;
    c.stroke();
    // göğüste 1 numara
    textM(c, String(opp.keeper.shirt || 1), 0.1, shY + 0.19, 0.2, s, lum(kit.p) > 0.6 ? NAVY : "#FFFFFF");
    // eldivenler
    hands.forEach(function (h) {
      disc(c, h[0], h[1], gloveR, "#FFFFFF", LW);
      c.fillStyle = kit.s;
      c.beginPath();
      c.arc(h[0], h[1] + gloveR * 0.35, gloveR * 0.55, 0, Math.PI);
      c.fill();
    });
    // kafa
    var hdx = 0;
    disc(c, hdx, headY, HR, look.skin, 0);
    c.save();
    c.beginPath();
    c.arc(hdx, headY, HR, 0, Math.PI * 2);
    c.clip();
    c.fillStyle = look.hair;
    c.beginPath();
    c.ellipse(hdx, headY - HR * 0.72, HR * 1.15, HR * 0.62, 0, 0, Math.PI * 2);
    c.fill();
    c.restore();
    c.beginPath();
    c.arc(hdx, headY, HR, 0, Math.PI * 2);
    c.lineWidth = LW;
    c.strokeStyle = NAVY;
    c.stroke();
    disc(c, -HR, headY + 0.02, 0.06, look.skin, LW * 0.8);
    disc(c, HR, headY + 0.02, 0.06, look.skin, LW * 0.8);
    // yüz: topa bakan gözler
    var lookX = A.clamp(((bxw == null ? 0 : bxw) - cx) * 0.03, -0.035, 0.035);
    c.fillStyle = NAVY;
    [-0.085, 0.085].forEach(function (ex2) {
      c.beginPath();
      c.ellipse(hdx + ex2 + lookX, headY + 0.0, 0.035, 0.05, 0, 0, Math.PI * 2);
      c.fill();
    });
    c.fillStyle = "#FFFFFF";
    [-0.085, 0.085].forEach(function (ex2) {
      c.beginPath();
      c.arc(hdx + ex2 + lookX + 0.012, headY - 0.02, 0.013, 0, Math.PI * 2);
      c.fill();
    });
    c.strokeStyle = NAVY;
    c.lineWidth = 1.8 / s;
    c.beginPath();
    c.moveTo(hdx - 0.14, headY - 0.09);
    c.lineTo(hdx - 0.04, headY - 0.065);
    c.moveTo(hdx + 0.14, headY - 0.09);
    c.lineTo(hdx + 0.04, headY - 0.065);
    c.stroke();
    c.fillStyle = "rgba(255,90,110,0.35)";
    disc(c, hdx - 0.14, headY + 0.08, 0.04, "rgba(255,90,110,0.35)", 0);
    disc(c, hdx + 0.14, headY + 0.08, 0.04, "rgba(255,90,110,0.35)", 0);
    c.beginPath();
    if (ex.cheer || ex.caught) c.arc(hdx, headY + 0.1, 0.06, 0.15, Math.PI - 0.15);
    else if (diving) c.ellipse(hdx, headY + 0.12, 0.04, 0.05, 0, 0, Math.PI * 2);
    else {
      c.moveTo(hdx - 0.05, headY + 0.13);
      c.lineTo(hdx + 0.05, headY + 0.13);
    }
    c.lineWidth = 1.6 / s;
    c.stroke();
    c.restore();
  }

  /**
   * ATICI (arkadan). o: { x, z, run (adım fazı), runK, kick (−1 geri
   * savrulma … 0 temas … 1 takip), arms ('run'|'kick'|'up'|'head'),
   * jump, lean }. Formanın sırtında soyadı ve numara.
   */
  function drawShooter(c, o) {
    var p = proj(o.x, 0, o.z);
    if (cam.z - o.z < 1.2) return;
    var s = p.s;
    var kit = kit2(shooter), look = lookOf(shooter);
    var shortsCol = lum(kit.s) > 0.85 && lum(kit.p) > 0.7 ? NAVY : kit.s === kit.p ? NAVY : kit.s;
    shadowAt(c, o.x, o.z, 0.42, 0.3);
    c.save();
    c.translate(p.x, p.y - (o.jump || 0) * s);
    c.rotate(o.lean || 0);
    var sq = o.sq || 1;
    c.scale(s * (2 - sq), -s * sq); // y yukarı: metre
    c.lineJoin = "round";
    c.lineCap = "round";
    var LW = 2.6 / s;
    var ph = o.run || 0, rk = o.runK || 0;
    var bob = Math.abs(Math.cos(ph)) * 0.05 * rk;
    var hip = 0.9 + bob, sh = 1.44 + bob, head = 1.74 + bob, HR = 0.27;
    // bacaklar: [x, kalça, diz, ayak]
    function legPts(side, lift, back) {
      var hx = side * 0.12;
      var fx = side * 0.16, fy = 0.03 + lift * 0.42;
      var kx = side * 0.15, ky = 0.48 + lift * 0.12;
      if (back) {
        // geri savrulma: ayak kalçaya doğru kalkar ve kameraya yaklaşır
        fx = side * 0.1 + back * 0.05;
        fy = 0.03 + back * 0.62;
        ky = 0.42 + back * 0.12;
      }
      return [hx, hip, kx, ky, fx, fy];
    }
    var lL = Math.max(0, Math.sin(ph)) * rk, lR = Math.max(0, -Math.sin(ph)) * rk;
    var kick = o.kick, sock = kit.p;
    var bu = kick != null && kick < 0 ? 1 + kick : -1;
    var backAmt = bu < 0 ? 0 : bu < 0.75 ? A.smooth(bu / 0.75) : 1 - A.smooth((bu - 0.75) / 0.25);
    var thru = kick != null && kick >= 0 ? kick : -1;
    function drawLeg(side, lift, back, scaleK) {
      var q = legPts(side, lift, back);
      limb3(c, q[0], q[1], q[2], q[3], q[4], q[5] + 0.06, 0.16, side > 0 ? look.skin : mixc(look.skin, NAVY, 0.12), LW);
      var kx = q[2] + (q[4] - q[2]) * 0.18, ky = q[3] + (q[5] - q[3]) * 0.18;
      limb(c, kx, ky, q[4], q[5] + 0.06, 0.17, side > 0 ? sock : mixc(sock, NAVY, 0.12), LW);
      c.strokeStyle = kit.s;
      c.lineWidth = 0.05;
      c.beginPath();
      c.moveTo(kx + (q[4] - kx) * 0.12 - 0.07, ky + (q[5] - ky) * 0.12);
      c.lineTo(kx + (q[4] - kx) * 0.12 + 0.07, ky + (q[5] - ky) * 0.12);
      c.stroke();
      // krampon tabanı (arkadan görünen)
      c.save();
      c.translate(q[4], q[5] + 0.03);
      var bs = scaleK || 1;
      c.beginPath();
      c.ellipse(0, 0, 0.1 * bs, 0.07 * bs, 0, 0, Math.PI * 2);
      c.fillStyle = NAVY;
      c.fill();
      c.fillStyle = "#FFFFFF";
      c.beginPath();
      c.ellipse(0, 0.02 * bs, 0.05 * bs, 0.025 * bs, 0, 0, Math.PI * 2);
      c.fill();
      c.restore();
    }
    // vuran bacak takipte gövdenin arkasında (kameradan uzak)
    if (thru >= 0) {
      var u = Math.min(1, thru / 0.18), dn = A.clamp((thru - 0.25) / 0.4, 0, 1);
      var fy2 = A.lerp(0.15, 0.95, A.easeOut(u)) * (1 - dn) + 0.04 * dn;
      var kny = A.lerp(0.5, 0.95, u * (1 - dn));
      limb(c, 0.12, hip, 0.2, kny, 0.15, look.skin, LW);
      limb(c, 0.2, kny, 0.18, fy2, 0.16, sock, LW);
      c.beginPath();
      c.ellipse(0.18, fy2 + 0.04, 0.08, 0.05, 0, 0, Math.PI * 2);
      c.fillStyle = NAVY;
      c.fill();
    }
    drawLeg(-1, kick != null ? 0 : lL, 0);
    if (thru < 0) drawLeg(1, kick != null ? 0 : lR, backAmt, 1 + backAmt * 0.35);
    // şort
    A.roundRect(c, -0.28, hip - 0.28, 0.56, 0.36, 0.1);
    c.fillStyle = shortsCol;
    c.fill();
    c.lineWidth = LW;
    c.strokeStyle = NAVY;
    c.stroke();
    // kollar
    var arms = o.arms || "run", hands;
    var swing = Math.sin(ph) * 0.22 * rk;
    if (arms === "up") {
      var w = Math.sin(A.time * 10) * 0.08;
      hands = [[-0.5, 2.25 + w], [0.5, 2.25 - w]];
    } else if (arms === "head") hands = [[-0.18, 1.98], [0.18, 1.98]];
    else if (arms === "kick") {
      var kk = A.clamp(1 - Math.abs(kick || 0) * 1.2, 0, 1);
      hands = [[-0.62 - 0.1 * kk, 1.25 + 0.3 * kk], [0.4, 1.0 + 0.15 * kk]];
    } else hands = [[-0.36, 1.0 + swing], [0.36, 1.0 - swing]];
    for (var j = 0; j < 2; j++) {
      var sx = j ? 0.27 : -0.27, hx = hands[j][0], hy = hands[j][1];
      var mx = sx + (hx - sx) * 0.5 + (j ? 0.06 : -0.06), my = sh - 0.06 + (hy - sh) * 0.5;
      limb3(c, sx, sh - 0.06, mx, my, hx, hy, 0.12, look.skin, LW);
      limb(c, sx, sh - 0.06, sx + (mx - sx) * 0.75, sh - 0.06 + (my - sh + 0.06) * 0.75, 0.16, kit.p, LW);
      disc(c, hx, hy, 0.075, look.skin, LW * 0.9);
    }
    // gövde (sırt)
    A.roundRect(c, -0.3, hip - 0.04, 0.6, sh - hip + 0.1, 0.14);
    c.fillStyle = kit.p;
    c.fill();
    c.save();
    c.clip();
    c.fillStyle = rgba(NAVY, 0.15);
    c.fillRect(0.18, hip - 0.04, 0.12, sh - hip + 0.1);
    c.fillStyle = "rgba(255,255,255,0.22)";
    A.roundRect(c, -0.24, sh - 0.3, 0.08, 0.24, 0.04);
    c.fill();
    c.fillStyle = kit.s;
    c.fillRect(-0.3, sh, 0.6, 0.06);
    c.restore();
    A.roundRect(c, -0.3, hip - 0.04, 0.6, sh - hip + 0.1, 0.14);
    c.lineWidth = LW;
    c.strokeStyle = NAVY;
    c.stroke();
    // sırt: soyadı + numara (y yukarı ölçekte yazı ters çıkmasın)
    c.save();
    c.scale(1, -1);
    var numCol = colDist(kit.s, kit.p) > 90 ? kit.s : lum(kit.p) > 0.6 ? NAVY : "#FFFFFF";
    var nm = upperTR(shooter.back || shooter.short || "");
    if (nm.length > 10) nm = nm.slice(0, 9) + ".";
    textM(c, nm, 0, -(sh - 0.1), 0.085, s, numCol);
    textM(c, String(shooter.shirt || 10), 0, -(hip + 0.25), 0.3, s, numCol, NAVY);
    c.restore();
    // boyun + kafa (arkadan: saç)
    limb(c, 0, sh, 0, head - 0.1, 0.12, look.skin, LW);
    disc(c, -HR * 0.96, head - 0.02, 0.065, look.skin, LW * 0.8);
    disc(c, HR * 0.96, head - 0.02, 0.065, look.skin, LW * 0.8);
    disc(c, 0, head, HR, look.skin, 0);
    c.save();
    c.beginPath();
    c.arc(0, head, HR, 0, Math.PI * 2);
    c.clip();
    c.fillStyle = look.hair;
    c.beginPath();
    c.ellipse(0, head + 0.08, HR * 1.1, HR * 0.95, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "rgba(255,255,255,0.14)";
    c.beginPath();
    c.ellipse(-0.08, head + 0.14, 0.08, 0.05, -0.4, 0, Math.PI * 2);
    c.fill();
    c.restore();
    c.beginPath();
    c.arc(0, head, HR, 0, Math.PI * 2);
    c.lineWidth = LW;
    c.strokeStyle = NAVY;
    c.stroke();
    c.restore();
  }

  /** Atıcının o anki pozu (durum makinesinden). */
  function shooterPose(phase, t) {
    var o = { x: WAIT.x, z: WAIT.z, run: 0, runK: 0, kick: null, arms: "run" };
    if (phase === "wait") {
      o.run = A.time * 1.4;
      o.runK = 0.12;
      o.sq = 1 + Math.sin(A.time * 2.6) * 0.012;
      return o;
    }
    if (phase === "run") {
      var tReach = RUNUP - 0.1;
      var u = A.clamp(t / tReach, 0, 1);
      var e = u * u * (2 - u); // hızlanan
      var d = Math.hypot(PLANT.x - WAIT.x, PLANT.z - WAIT.z);
      o.x = A.lerp(WAIT.x, PLANT.x, e);
      o.z = A.lerp(WAIT.z, PLANT.z, e);
      o.run = e * d * 5.2;
      o.runK = Math.min(1, t / 0.25);
      o.lean = 0.04;
      if (t > RUNUP - 0.34) {
        o.kick = -A.clamp((RUNUP - t) / 0.34, 0, 1) * 1 - 0.0001;
        o.arms = "kick";
        o.runK = 0;
        o.lean = -0.05;
      }
      return o;
    }
    if (phase === "kick") {
      o.x = PLANT.x + Math.min(0.3, t * 0.6) * 0.15;
      o.z = PLANT.z - Math.min(0.35, t * 0.9);
      o.kick = t;
      o.arms = "kick";
      o.lean = 0.06 * Math.min(1, t * 4);
      o.jump = Math.max(0, Math.sin(Math.min(1, t / 0.3) * Math.PI)) * 0.08;
      return o;
    }
    o.x = PLANT.x + 0.04;
    o.z = PLANT.z - 0.35;
    if (phase === "celebrate") {
      o.arms = "up";
      o.jump = Math.abs(Math.sin(t * 6)) * 0.28;
      o.sq = 1 + Math.sin(t * 12) * 0.05;
      return o;
    }
    // üzgün: eller başta, omuzlar düşük
    o.arms = "head";
    o.sq = 0.97;
    o.lean = Math.sin(t * 1.5) * 0.03;
    return o;
  }

  /* ─────────────── top ─────────────── */

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

  var trail = [];
  function drawBallShadow(c, bx, by, bz) {
    var a = 0.38 * Math.max(0.15, 1 - by / 2.8);
    shadowAt(c, bx, bz, BALL_R * (1.5 + by * 0.25), a);
  }
  function drawTrail(c, rocket) {
    if (trail.length < 2) return;
    var r0 = proj(trail[trail.length - 1][0], trail[trail.length - 1][1], trail[trail.length - 1][2]);
    c.save();
    c.lineCap = "round";
    if (rocket) c.globalCompositeOperation = "lighter";
    for (var i = 1; i < trail.length; i++) {
      var a = proj(trail[i - 1][0], trail[i - 1][1], trail[i - 1][2]), b = proj(trail[i][0], trail[i][1], trail[i][2]);
      var f = i / trail.length;
      c.strokeStyle = rocket ? "rgba(255," + Math.round(120 + 100 * f) + ",60," + (0.85 * f) + ")" : "rgba(255,255,255," + (0.55 * f) + ")";
      c.lineWidth = Math.max(1, BALL_R * 2.6 * b.s * f * (rocket ? 1.5 : 1));
      c.beginPath();
      c.moveTo(a.x, a.y);
      c.lineTo(b.x, b.y);
      c.stroke();
    }
    c.restore();
    return r0;
  }
  function drawBall(c, bx, by, bz, rocket) {
    var p = proj(bx, by, bz);
    var r = Math.max(4, BALL_R * 1.45 * p.s);
    if (rocket) {
      c.save();
      c.globalCompositeOperation = "lighter";
      var g = c.createRadialGradient(p.x, p.y, r * 0.5, p.x, p.y, r * 3.2);
      g.addColorStop(0, "rgba(255,170,70,0.9)");
      g.addColorStop(1, "rgba(255,90,30,0)");
      c.fillStyle = g;
      c.beginPath();
      c.arc(p.x, p.y, r * 3.2, 0, Math.PI * 2);
      c.fill();
      c.restore();
    }
    flatBall(c, p.x, p.y, r, ball.wx * 0.6 + ball.wy * 0.3);
  }

  /* ─────────────── yağmur ─────────────── */

  var drops = null;
  function drawRain(c, dt) {
    if (!cond.rain || state === "attract") return;
    if (!drops) {
      var r = A.seeded(77);
      drops = [];
      for (var i = 0; i < 110; i++) drops.push({ x: r(), y: r(), v: 0.9 + r() * 0.5, l: 10 + r() * 10 });
    }
    var wx = cond.wind * 0.012;
    c.save();
    c.strokeStyle = "rgba(200,220,255,0.45)";
    c.lineWidth = 1.4;
    c.beginPath();
    drops.forEach(function (d) {
      d.y += d.v * dt * 1.4;
      d.x += wx * dt * 3;
      if (d.y > 1) {
        d.y -= 1;
        d.x = Math.random();
      }
      d.x = ((d.x % 1) + 1) % 1;
      var x = d.x * W, y = d.y * H;
      c.moveTo(x, y);
      c.lineTo(x - wx * d.l * 30, y - d.l);
    });
    c.stroke();
    c.fillStyle = "rgba(30,40,90,0.12)";
    c.fillRect(0, 0, W, H);
    c.restore();
  }

  /* ─────────────── sahne ─────────────── */

  function drawScene(c, dt) {
    // DEV KALE: kale yaylanarak büyür / küçülür
    var k2 = Math.min(1, dt * 7);
    gv.x += (gHalf / HALF - gv.x) * k2;
    gv.y += (gTop / GOAL_H - gv.y) * k2;

    // top ve kaleci: tekrarda kayıttan
    var bx = ball.x, by = ball.y, bz = ball.z, kstate = gk, know = simTime, keepExtra = {};
    var replayOn = inReplay();
    if (replayOn) {
      var fr = replay.frames;
      var t0 = fr[0].t, t1 = fr[fr.length - 1].t;
      var rt = t0 + (stateT - REPLAY_AT) * 0.45 * ((t1 - t0 + 0.4) / Math.max(0.5, t1 - t0 + 0.4)) - 0.25;
      var i = 0;
      while (i < fr.length - 1 && fr[i + 1].t < rt) i++;
      var rf = fr[i];
      bx = rf.bx;
      by = rf.by;
      bz = rf.bz;
      kstate = rf.k;
      know = rt;
    } else if (state === "result" || state === "matchEnd") {
      keepExtra = { caught: ball.caught, cheer: lastKick && lastKick.result !== "gol" && !gk.dive && !ball.caught ? Math.min(1, stateT * 2) : 0 };
    }
    if (kstate.dive) keepExtra.land = A.smooth(A.clamp((know - kstate.dive.t0 - kstate.dive.dur) / 0.28, 0, 1));
    var idle = state === "aim" || state === "power" || state === "turn" || state === "oppKick" || state === "intro" || state === "runup" || state === "attract" || state === "over";
    if (idle) {
      bx = 0;
      by = BALL_R;
      bz = SPOT_Z;
    }
    if (ball.caught && !replayOn && !idle) {
      var kb = keeperBody(gk, simTime);
      bx = kb.cx;
      by = kb.cy + 0.12;
      bz = KEEPER_Z + 0.3;
    }
    if (replayOn) {
      /* tekrar: kayıttaki kaleci */
    } else if (state === "aim" || state === "power" || state === "turn" || state === "attract" || state === "intro" || state === "oppKick" || state === "over") {
      var dz2 = opp.diff;
      keepExtra.bob = Math.sin(A.time * (5 + 2 * dz2)) * 0.015;
      keepExtra.lean = Math.sin(A.time * 1.3) * 0.06;
      keepExtra.wave = dz2 > 0.4 && state === "power" ? Math.max(0, Math.sin(A.time * (3 + 2 * dz2))) * 0.5 * dz2 : 0;
    } else if (state === "runup") {
      var hu = (stateT - (RUNUP - 0.3)) / 0.26;
      keepExtra.hop = hu > 0 && hu < 1 ? Math.sin(Math.PI * hu) : 0;
    }

    // iz
    var flying = (state === "flight" || replayOn) && bz < SPOT_Z - 0.3;
    if (flying) {
      trail.push([bx, by, bz]);
      if (trail.length > 14) trail.shift();
    } else if (trail.length) trail.shift();
    var rocket = !!(shot && shot.rocket && (state === "flight" || replayOn) && bz < SPOT_Z - 0.2);

    drawBackdrop(c);
    drawBoards(c);
    drawPitch(c);
    drawFlags(c);
    drawNet(c);
    // derinlik sırası: file içi top → çerçeve → kaleci önü/arkası → atıcı
    drawBallShadow(c, bx, by, bz);
    if (bz < 0) {
      drawTrail(c, rocket);
      drawBall(c, bx, by, bz, rocket);
    }
    drawGoalFrame(c);
    if (bz >= 0 && bz < KEEPER_Z) {
      drawTrail(c, rocket);
      drawBall(c, bx, by, bz, rocket);
    }
    drawKeeper(c, kstate, know, keepExtra, bx);
    if (bz >= KEEPER_Z) {
      drawTrail(c, rocket);
      drawBall(c, bx, by, bz, rocket);
    }
    // atıcı
    var po;
    if (state === "attract" || state === "intro" || state === "turn" || state === "aim" || state === "power" || state === "oppKick" || state === "over") po = shooterPose("wait");
    else if (state === "runup") po = shooterPose("run", Math.min(stateT, RUNUP));
    else if (replayOn) po = shooterPose("kick", Math.max(0, know - kickAt));
    else if (state === "flight") po = shooterPose("kick", simTime - kickAt);
    else if (state === "result") {
      var mineGoal = lastKick && lastKick.result === "gol";
      if (mineGoal && stateT > 0.45) po = shooterPose("celebrate", stateT - 0.45);
      else if (!mineGoal && stateT > 0.4) po = shooterPose("sad", stateT - 0.4);
      else po = shooterPose("kick", simTime - kickAt);
    } else if (state === "matchEnd") po = shooterPose(endResult === "won" ? "celebrate" : "sad", stateT);
    else po = shooterPose("wait");
    drawShooter(c, po);
    drawRain(c, dt);
    if (replayOn) drawLetterbox(c);
  }

  function drawLetterbox(c) {
    var k = A.smooth(A.clamp((stateT - REPLAY_AT) / 0.25, 0, 1)) * A.smooth(A.clamp((REPLAY_AT + REPLAY_LEN - stateT) / 0.25, 0, 1));
    var h = 46 * k;
    c.fillStyle = INK;
    c.fillRect(0, 0, W, h);
    c.fillRect(0, H - h, W, h);
  }

  /* ═══════════════════════════ ÇİZİM GİRİŞİ ═══════════════════════════ */

  function resize(w, h) {
    W = w;
    H = h;
    layout();
    camCut = true;
  }

  function render(c, dt) {
    layout();
    placeCamera(dt || 0);
    drawScene(c, dt || 0);
    drawHUD(c, dt || 0);
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
  /** Koyu lacivert, alt kenarı gölgeli yuvarlak hap (Savunma Hattı HUD'u). */
  function navyPill(c, x, y, w, h, fill, r) {
    r = r == null ? h / 2 : r;
    A.roundRect(c, x, y + 3, w, h, r);
    c.fillStyle = "rgba(8,6,30,0.55)";
    c.fill();
    A.roundRect(c, x, y, w, h, r);
    var g = c.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, fill ? mixc(fill, "#FFFFFF", 0.12) : "#2C2580");
    g.addColorStop(1, fill || "#1C1760");
    c.fillStyle = g;
    c.fill();
    c.lineWidth = 1.5;
    c.strokeStyle = "rgba(255,255,255,0.14)";
    c.stroke();
  }
  /** Beyaz kart (Savunma Hattı tepsi kartları gibi): lacivert gölge, yumuşak kenar. */
  function whiteCard(c, x, y, w, h, r) {
    A.roundRect(c, x, y + 6, w, h, r);
    c.fillStyle = "rgba(8,6,30,0.5)";
    c.fill();
    A.roundRect(c, x, y, w, h, r);
    c.fillStyle = "#FFFFFF";
    c.fill();
    c.lineWidth = 3;
    c.strokeStyle = NAVY;
    c.stroke();
  }
  /** Sarı rozet (kart başlığı / maliyet rozeti gibi). */
  function yellowBadge(c, text, cx, cy, size) {
    c.font = A.font(size, 900);
    var w = c.measureText(text).width + size * 1.6, h = size * 1.9;
    A.roundRect(c, cx - w / 2, cy - h / 2 + 2.5, w, h, h / 2);
    c.fillStyle = "rgba(8,6,30,0.45)";
    c.fill();
    A.roundRect(c, cx - w / 2, cy - h / 2, w, h, h / 2);
    var g = c.createLinearGradient(0, cy - h / 2, 0, cy + h / 2);
    g.addColorStop(0, "#FFE066");
    g.addColorStop(1, "#F5B700");
    c.fillStyle = g;
    c.fill();
    c.lineWidth = 2.2;
    c.strokeStyle = NAVY;
    c.stroke();
    c.fillStyle = NAVY;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(text, cx, cy + 0.5);
    return w;
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
  /** Kulüp arması: kalkan, iki renk, baş harfler, lacivert kontur. */
  function badge(c, x, y, size, person) {
    var kit = kit2(person);
    var w = size, h = size * 1.15;
    c.save();
    c.translate(x, y);
    function shape() {
      c.beginPath();
      c.moveTo(-w / 2, -h / 2);
      c.lineTo(w / 2, -h / 2);
      c.lineTo(w / 2, h * 0.08);
      c.quadraticCurveTo(w / 2, h * 0.42, 0, h / 2);
      c.quadraticCurveTo(-w / 2, h * 0.42, -w / 2, h * 0.08);
      c.closePath();
    }
    c.translate(0, 2);
    shape();
    c.fillStyle = "rgba(8,6,30,0.45)";
    c.fill();
    c.translate(0, -2);
    shape();
    c.fillStyle = kit.p;
    c.fill();
    c.save();
    c.clip();
    c.fillStyle = kit.s;
    c.fillRect(-w / 2, -h / 2 + h * 0.62, w, h * 0.14);
    c.fillStyle = "rgba(255,255,255,0.25)";
    c.fillRect(-w / 2, -h / 2, w / 2, h);
    c.restore();
    shape();
    c.lineWidth = Math.max(2, size * 0.08);
    c.strokeStyle = NAVY;
    c.stroke();
    c.fillStyle = lum(kit.p) > 0.6 ? NAVY : "#FFFFFF";
    c.font = A.font(size * 0.38, 900);
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(initials(teamName(person)), 0, -h * 0.06);
    c.restore();
  }
  var imgCache = {};
  /** Oyuncu fotoğrafı (yoksa baş harfler), lacivert konturlu daire içinde. */
  function avatar(c, x, y, r, person) {
    var kit = kit2(person);
    c.save();
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fillStyle = kit.p;
    c.fill();
    var url = person && person.image;
    var im = url ? imgCache[url] : null;
    if (url && !im && typeof Image !== "undefined") {
      im = imgCache[url] = new Image();
      im.onerror = function () {
        im.failed = true;
      };
      im.src = url;
    }
    if (im && im.complete && im.naturalWidth && !im.failed) {
      c.save();
      c.clip();
      c.drawImage(im, x - r, y - r, r * 2, r * 2);
      c.restore();
    } else {
      c.fillStyle = lum(kit.p) > 0.6 ? NAVY : "#FFFFFF";
      c.font = A.font(r * 0.8, 900);
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillText(initials(person && (person.name || person.short)), x, y + 1);
    }
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.lineWidth = 2.5;
    c.strokeStyle = NAVY;
    c.stroke();
    c.restore();
  }
  function fit(c, text, max) {
    var t = String(text || "");
    if (c.measureText(t).width <= max) return t;
    while (c.measureText(t + "…").width > max && t.length > 2) t = t.slice(0, -1);
    return t + "…";
  }

  /** Aşama adı: merdivenin sonundan geriye final, yarı final, çeyrek final. */
  function stageName(m) {
    var n = keepers.length;
    var left = n - 1 - m;
    if (left <= 0) return "FİNAL";
    if (left === 1) return "YARI FİNAL";
    if (left === 2) return "ÇEYREK FİNAL";
    return m + 1 + ". TUR";
  }

  /* ── skorbord ── */

  function drawScoreboard(c) {
    var w = Math.min(W - 20, 384), h = 58, x = W / 2 - w / 2, y = 10;
    c.save();
    navyPill(c, x, y, w, h, null, 20);
    var gm = match ? goalsOf(match.me) : 0, go = match ? goalsOf(shownOp()) : 0;
    // skor kutusu
    var sw = 78, sx = W / 2 - sw / 2;
    A.roundRect(c, sx, y + 6, sw, 30, 12);
    c.fillStyle = INK;
    c.fill();
    var bump = 1 + 0.2 * scoreBump;
    c.save();
    c.translate(W / 2, y + 21.5);
    c.scale(bump, bump);
    label(c, gm + " – " + go, 0, 0, 22, scoreBump > 0.1 ? "#FFE58A" : "#FFFFFF");
    c.restore();
    badge(c, x + 24, y + 22, 24, shooter);
    badge(c, x + w - 24, y + 22, 24, opp.keeper);
    var half = w / 2 - sw / 2 - 50;
    c.font = A.font(12, 900);
    c.fillStyle = "#FFFFFF";
    c.textAlign = "left";
    c.textBaseline = "middle";
    c.fillText(fit(c, upperTR(teamName(shooter)), half), x + 43, y + 20);
    c.textAlign = "right";
    c.fillText(fit(c, upperTR(teamName(opp.keeper)), half), x + w - 43, y + 20);
    if (match) {
      dots(c, x + 43, y + 41, match.me, isLive(), 1);
      dots(c, x + w - 43, y + 41, shownOp(), oppPending(), -1);
    }
    c.font = A.font(9.5, 900);
    c.fillStyle = match && match.sudden ? BAD : GOLD;
    c.textAlign = "center";
    if ("letterSpacing" in c) c.letterSpacing = "1px";
    c.fillText(match && match.sudden ? "ANİ ÖLÜM" : stageName(matchIdx), W / 2, y + 46);
    if ("letterSpacing" in c) c.letterSpacing = "0px";
    c.restore();
  }
  /** Rakip atışının sonucu açıklanana dek skorbordda görünmez. */
  function oppPending() {
    return state === "oppKick" && stateT < 0.75;
  }
  function shownOp() {
    return oppPending() ? match.op.slice(0, -1) : match.op;
  }
  function isLive() {
    return ["turn", "aim", "power", "runup", "flight"].indexOf(state) >= 0;
  }
  /** Beş atış noktası: gol yeşil ✓, kaçan kırmızı ×, sıradaki sarı nabız. */
  function dots(c, x, y, list, next, dir) {
    var n = Math.max(KICKS, list.length + (next ? 1 : 0));
    var from = Math.max(0, n - KICKS);
    var r = 6.2, gap = 16;
    c.lineCap = "round";
    c.lineJoin = "round";
    for (var i = 0; i < KICKS; i++) {
      var k = from + i;
      var cx = x + dir * (i * gap + r);
      var v = list[k];
      c.beginPath();
      c.arc(cx, y, r, 0, Math.PI * 2);
      if (v === "g" || v === "x") {
        c.fillStyle = v === "g" ? GOOD : BAD;
        c.fill();
        c.lineWidth = 1.6;
        c.strokeStyle = "#FFFFFF";
        c.stroke();
        c.lineWidth = 2;
        c.beginPath();
        if (v === "g") {
          c.moveTo(cx - 2.8, y + 0.2);
          c.lineTo(cx - 0.7, y + 2.3);
          c.lineTo(cx + 3, y - 2.2);
        } else {
          c.moveTo(cx - 2.3, y - 2.3);
          c.lineTo(cx + 2.3, y + 2.3);
          c.moveTo(cx + 2.3, y - 2.3);
          c.lineTo(cx - 2.3, y + 2.3);
        }
        c.stroke();
      } else {
        var live = next && k === list.length;
        c.fillStyle = INK;
        c.fill();
        c.lineWidth = live ? 2.4 : 1.4;
        c.strokeStyle = live ? "rgba(255,212,59," + (0.55 + 0.45 * Math.sin(A.time * 6)) + ")" : "rgba(255,255,255,0.28)";
        c.stroke();
      }
    }
  }

  var shownPts = 0;
  function drawPoints(c, dt) {
    shownPts = shownPts < points ? Math.min(points, shownPts + Math.max(1, (points - shownPts) * 0.15)) : points;
    var y = 76, h = 30;
    var kick = Math.max(A.scoreKick || 0, scoreBump * 0.6);
    var txt = Math.round(shownPts).toLocaleString("tr-TR");
    c.save();
    c.font = A.font(h * 0.56, 900);
    var pw = Math.max(76, c.measureText(txt).width + h + 22);
    navyPill(c, 10 + h * 0.4, y, pw, h);
    c.save();
    c.translate(10 + h / 2, y + h / 2);
    c.scale(1 + kick * 0.25, 1 + kick * 0.25);
    flatBall(c, 0, 0, h * 0.5, A.time * 0.6);
    c.restore();
    A.scoreAnchor = { x: 10 + h / 2, y: y + h / 2 };
    c.save();
    c.translate(10 + h + 8, y + h / 2 + 1);
    c.scale(1 + kick * 0.15, 1 + kick * 0.15);
    label(c, txt, 0, 0, h * 0.56, kick > 0.05 ? "#FFE58A" : "#FFFFFF", "left");
    c.restore();
    c.restore();
  }

  /* ── nişan ── */

  /** Önizleme yolu: seçili türün yeşil bölge ortasıyla, rüzgârsız (gerçek tümleyiciyle). */
  function previewPath(type, tx, ty) {
    var z = zoneOf(type);
    var m = shotModel(type, tx, ty, (z[0] + z[1]) / 2, false);
    var b = newBall();
    aimLaunch(b, m.tx, m.ty, m.speed, m.curl, m.lob);
    var tot = crossing(b, 0).t;
    var pts = [], step = tot / 16, acc = 0;
    var s2 = { x: b.x, y: b.y, z: b.z, vx: b.vx, vy: b.vy, vz: b.vz, curl: b.curl };
    for (var t = 0; t < tot && pts.length < 16; t += SUB) {
      integrate(s2, SUB, 0);
      acc += SUB;
      if (acc >= step) {
        acc -= step;
        pts.push([s2.x, s2.y, s2.z]);
      }
    }
    return pts;
  }

  function drawAim(c, locked) {
    var type = shotType;
    var ae = aimNow();
    var tx = type === "kasik" ? A.clamp(ae.x, -2.6, 2.6) : ae.x, ty = type === "kasik" ? Math.max(0.9, ae.y) : ae.y;
    var p = proj(tx, ty, 0);
    var out = Math.abs(tx) > gHalf - 0.04 || ty > gTop - 0.04;
    var near = !out && (Math.abs(tx) > gHalf - 0.4 || ty > gTop - 0.35);
    var col = out ? BAD : near ? "#FFB020" : GOLD;
    c.save();
    c.lineCap = "round";
    if (!locked || state === "power") {
      var pts = previewPath(type, tx, ty);
      for (var i = 0; i < pts.length; i++) {
        var sp = proj(pts[i][0], pts[i][1], pts[i][2]);
        var f = i / pts.length;
        var rr = Math.max(1.8, 4.2 - f * 2.2);
        c.beginPath();
        c.arc(sp.x, sp.y, rr + 1.4, 0, Math.PI * 2);
        c.fillStyle = "rgba(27,22,72," + (0.35 * (1 - f * 0.5)) + ")";
        c.fill();
        c.beginPath();
        c.arc(sp.x, sp.y, rr, 0, Math.PI * 2);
        c.fillStyle = armed.rocket ? "rgba(255,150,60," + (0.5 + 0.5 * (1 - f)) + ")" : "rgba(255,255,255," + (0.45 + 0.5 * (1 - f)) + ")";
        c.fill();
      }
    }
    // parlayan nişangâh
    var r = Math.max(13, p.s * 0.2);
    var pulse = 1 + 0.06 * Math.sin(A.time * 7);
    c.save();
    c.globalCompositeOperation = "lighter";
    var g = c.createRadialGradient(p.x, p.y, r * 0.3, p.x, p.y, r * 2.3);
    g.addColorStop(0, rgba(col, 0.55));
    g.addColorStop(1, rgba(col, 0));
    c.fillStyle = g;
    c.beginPath();
    c.arc(p.x, p.y, r * 2.3, 0, Math.PI * 2);
    c.fill();
    c.restore();
    // halka: lacivert kontur + renk
    c.lineWidth = 6.5;
    c.strokeStyle = NAVY;
    c.beginPath();
    c.arc(p.x, p.y, r * pulse, 0, Math.PI * 2);
    c.stroke();
    c.lineWidth = 3.5;
    c.strokeStyle = col;
    c.stroke();
    // dönen kesik dış halka
    c.save();
    c.translate(p.x, p.y);
    c.rotate(A.time * 1.6);
    c.lineWidth = 2.5;
    c.strokeStyle = "rgba(255,255,255,0.85)";
    for (var q = 0; q < 4; q++) {
      c.beginPath();
      c.arc(0, 0, r * 1.45, q * Math.PI * 0.5 + 0.25, q * Math.PI * 0.5 + 1.0);
      c.stroke();
    }
    c.restore();
    // artı çizgileri
    c.beginPath();
    [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(function (d) {
      c.moveTo(p.x + d[0] * r * 0.4, p.y + d[1] * r * 0.4);
      c.lineTo(p.x + d[0] * r * 0.78, p.y + d[1] * r * 0.78);
    });
    c.lineWidth = 4.5;
    c.strokeStyle = NAVY;
    c.stroke();
    c.lineWidth = 2.2;
    c.strokeStyle = col;
    c.stroke();
    disc(c, p.x, p.y, 3.4, col, 2);
    // rüzgâr: nişandan sürüklenme yönü
    if (Math.abs(cond.wind) > 0.3 && !armed.rocket) {
      var len = A.clamp(Math.abs(cond.wind) * 7, 14, 60) * Math.sign(cond.wind);
      var y0 = p.y + r + 14;
      c.lineWidth = 3;
      c.strokeStyle = "#7DD3FC";
      c.fillStyle = "#7DD3FC";
      c.setLineDash([5, 5]);
      c.lineDashOffset = -A.time * 22 * Math.sign(cond.wind);
      c.beginPath();
      c.moveTo(p.x, y0);
      c.lineTo(p.x + len, y0);
      c.stroke();
      c.setLineDash([]);
      c.beginPath();
      c.moveTo(p.x + len + Math.sign(len) * 8, y0);
      c.lineTo(p.x + len, y0 - 5);
      c.lineTo(p.x + len, y0 + 5);
      c.closePath();
      c.fill();
      c.lineWidth = 1.5;
      c.strokeStyle = NAVY;
      c.stroke();
    }
    if ((out || near) && !locked) {
      c.font = A.font(11, 900);
      var tw = c.measureText(out ? "ÇERÇEVE DIŞI" : "DİREK RİSKİ").width + 18;
      navyPill(c, p.x - tw / 2, p.y - r * 1.5 - 30, tw, 22, out ? "#B4123A" : "#9A5B00");
      label(c, out ? "ÇERÇEVE DIŞI" : "DİREK RİSKİ", p.x, p.y - r * 1.5 - 19, 11, "#FFFFFF", "center", false);
    }
    c.restore();
  }

  /* ── koşullar: rüzgâr, yağmur, zorluk ── */

  function drawConditions(c) {
    var x = W - 10, y = 79;
    c.save();
    c.textBaseline = "middle";
    var chips = [];
    if (Math.abs(cond.wind) > 0.3) chips.push({ kind: "wind", text: Math.abs(cond.wind).toFixed(1).replace(".", ",") + " m/sn" });
    if (cond.rain) chips.push({ kind: "rain", text: "YAĞMUR" });
    chips.push({ kind: "diff", text: "ZORLUK" });
    chips.forEach(function (ch) {
      c.font = A.font(11, 900);
      var extra = ch.kind === "diff" ? 36 : 24;
      var w = c.measureText(ch.text).width + 18 + extra;
      navyPill(c, x - w, y, w, 25);
      c.fillStyle = "#FFFFFF";
      c.textAlign = "left";
      var ix = x - w + 10;
      if (ch.kind === "wind") {
        var dir = Math.sign(cond.wind);
        c.strokeStyle = "#7DD3FC";
        c.fillStyle = "#7DD3FC";
        c.lineWidth = 2.4;
        c.lineCap = "round";
        c.beginPath();
        c.moveTo(ix + 8 - dir * 7, y + 12.5);
        c.lineTo(ix + 8 + dir * 4, y + 12.5);
        c.stroke();
        c.beginPath();
        c.moveTo(ix + 8 + dir * 9, y + 12.5);
        c.lineTo(ix + 8 + dir * 3, y + 8);
        c.lineTo(ix + 8 + dir * 3, y + 17);
        c.closePath();
        c.fill();
        c.fillStyle = "#FFFFFF";
        c.fillText(ch.text, ix + 22, y + 13);
      } else if (ch.kind === "rain") {
        c.fillStyle = "#93C5FD";
        for (var k = 0; k < 3; k++) {
          c.beginPath();
          c.ellipse(ix + 3 + k * 6, y + 10 + (k % 2) * 4, 2, 3, 0.2, 0, Math.PI * 2);
          c.fill();
        }
        c.fillStyle = "#FFFFFF";
        c.fillText(ch.text, ix + 22, y + 13);
      } else {
        c.fillStyle = "rgba(255,255,255,0.85)";
        c.fillText(ch.text, ix, y + 13);
        var lv = 1 + Math.round(opp.diff * 4);
        for (var j = 0; j < 5; j++) {
          c.fillStyle = j < lv ? (lv >= 4 ? BAD : GOLD) : "rgba(255,255,255,0.2)";
          A.roundRect(c, x - 12 - (5 - j) * 6, y + 16 - j * 2.2, 4, 4 + j * 2.2, 1.5);
          c.fill();
        }
      }
      x -= w + 6;
    });
    c.restore();
  }

  /* ── jokerler ── */

  function drawJokerIcon(c, key, x, y, r, col) {
    c.save();
    c.strokeStyle = col;
    c.fillStyle = col;
    c.lineWidth = r * 0.2;
    c.lineCap = "round";
    c.lineJoin = "round";
    if (key === "eye") {
      c.beginPath();
      c.moveTo(x - r, y);
      c.quadraticCurveTo(x, y - r * 0.95, x + r, y);
      c.quadraticCurveTo(x, y + r * 0.95, x - r, y);
      c.stroke();
      c.beginPath();
      c.arc(x, y, r * 0.34, 0, Math.PI * 2);
      c.fill();
    } else if (key === "rocket") {
      // alevli top: arkasında üç alev dili
      var bx0 = x + r * 0.28, by0 = y - r * 0.28;
      c.beginPath();
      c.moveTo(bx0 - r * 0.38, by0 - r * 0.22);
      c.quadraticCurveTo(x - r * 0.5, y + r * 0.1, x - r * 1.05, y + r * 1.05);
      c.quadraticCurveTo(x + r * 0.1, y + r * 0.5, bx0 + r * 0.22, by0 + r * 0.38);
      c.closePath();
      c.fillStyle = col === "#FFFFFF" ? "#FFFFFF" : "#FB923C";
      c.fill();
      c.beginPath();
      c.moveTo(bx0 - r * 0.3, by0 + r * 0.05);
      c.quadraticCurveTo(x - r * 0.2, y + r * 0.3, x - r * 0.65, y + r * 0.65);
      c.quadraticCurveTo(x + r * 0.0, y + r * 0.2, bx0 + r * 0.0, by0 + r * 0.3);
      c.closePath();
      c.fillStyle = col === "#FFFFFF" ? "rgba(255,255,255,0.7)" : "#FACC15";
      c.fill();
      c.beginPath();
      c.arc(bx0, by0, r * 0.48, 0, Math.PI * 2);
      c.fillStyle = col;
      c.fill();
      c.lineWidth = r * 0.14;
      c.strokeStyle = NAVY;
      c.stroke();
    } else {
      c.beginPath();
      c.moveTo(x - r * 0.6, y + r * 0.55);
      c.lineTo(x - r * 0.6, y - r * 0.35);
      c.lineTo(x + r * 0.6, y - r * 0.35);
      c.lineTo(x + r * 0.6, y + r * 0.55);
      c.stroke();
      [-1, 1].forEach(function (sd) {
        c.beginPath();
        c.moveTo(x + sd * r * 0.78, y + r * 0.12);
        c.lineTo(x + sd * r * 1.1, y + r * 0.12);
        c.moveTo(x + sd * r * 0.96, y - r * 0.05);
        c.lineTo(x + sd * r * 1.12, y + r * 0.12);
        c.lineTo(x + sd * r * 0.96, y + r * 0.29);
        c.stroke();
      });
    }
    c.restore();
  }
  function drawJokers(c) {
    var bs = jokerButtons();
    var live = state === "aim";
    c.save();
    c.textAlign = "center";
    c.textBaseline = "middle";
    bs.forEach(function (b) {
      var J = JOKERS[b.key], n = jokers[b.key], on = armed[b.key];
      if (!live && !on) return;
      c.globalAlpha = on || n > 0 ? 1 : 0.45;
      var pop = on ? 1 + 0.06 * Math.sin(A.time * 8) : 1;
      c.save();
      c.translate(b.x, b.y);
      c.scale(pop, pop);
      if (on) {
        c.save();
        c.globalCompositeOperation = "lighter";
        var g = c.createRadialGradient(0, 0, b.r * 0.6, 0, 0, b.r * 2);
        g.addColorStop(0, rgba(J.color, 0.6));
        g.addColorStop(1, rgba(J.color, 0));
        c.fillStyle = g;
        c.beginPath();
        c.arc(0, 0, b.r * 2, 0, Math.PI * 2);
        c.fill();
        c.restore();
      }
      c.beginPath();
      c.arc(0, 3, b.r, 0, Math.PI * 2);
      c.fillStyle = "rgba(8,6,30,0.5)";
      c.fill();
      c.beginPath();
      c.arc(0, 0, b.r, 0, Math.PI * 2);
      c.fillStyle = on ? J.color : "#FFFFFF";
      c.fill();
      c.lineWidth = 3;
      c.strokeStyle = NAVY;
      c.stroke();
      drawJokerIcon(c, b.key, 0, 0, b.r * 0.5, on ? "#FFFFFF" : mixc(J.color, NAVY, 0.25));
      c.restore();
      label(c, J.short, b.x, b.y + b.r + 10, 9.5, "#FFFFFF");
      if (!on) {
        var bx = b.x - b.r * 0.78, by = b.y - b.r * 0.78;
        disc(c, bx, by, 9, n > 0 ? GOLD : "#4B4880", 2.2);
        c.font = A.font(11, 900);
        c.fillStyle = n > 0 ? NAVY : "#FFFFFF";
        c.fillText(String(n), bx, by + 0.5);
      }
    });
    c.restore();
  }
  /** KALECİ GÖZÜ: kalecinin kararı kalenin üstünde. */
  function drawKeeperEye(c) {
    if (!armed.eye || !kplan) return;
    var p = kplan;
    c.save();
    var x0, x1, labelT;
    if (p.mode === "commit") {
      x0 = p.side < 0 ? -gHalf : 0.6;
      x1 = p.side < 0 ? -0.6 : gHalf;
      labelT = p.side < 0 ? "KALECİ SOLA ATLAYACAK" : "KALECİ SAĞA ATLAYACAK";
    } else if (p.mode === "stay") {
      x0 = -0.9;
      x1 = 0.9;
      labelT = "KALECİ ORTADA BEKLEYECEK";
    } else {
      x0 = x1 = null;
      labelT = "SON ANDA OKUYACAK · SERT VE KÖŞEYE";
    }
    if (x0 != null) {
      var a = proj(x0, 0, 0), b2 = proj(x1, gTop, 0);
      var pulse = 0.2 + 0.1 * Math.sin(A.time * 6);
      c.fillStyle = "rgba(56,189,248," + pulse + ")";
      c.fillRect(Math.min(a.x, b2.x), b2.y, Math.abs(b2.x - a.x), a.y - b2.y);
      c.strokeStyle = "#38BDF8";
      c.lineWidth = 2.5;
      c.setLineDash([7, 5]);
      c.lineDashOffset = -A.time * 20;
      c.strokeRect(Math.min(a.x, b2.x), b2.y, Math.abs(b2.x - a.x), a.y - b2.y);
      c.setLineDash([]);
    }
    var top = proj(0, gTop + 0.6, 0);
    c.font = A.font(11, 900);
    var w = Math.min(W - 16, c.measureText(labelT).width + 44);
    navyPill(c, W / 2 - w / 2, top.y - 14, w, 28);
    drawJokerIcon(c, "eye", W / 2 - w / 2 + 17, top.y, 8, JOKERS.eye.color);
    c.fillStyle = "#FFFFFF";
    c.textAlign = "left";
    c.textBaseline = "middle";
    c.fillText(fit(c, labelT, w - 40), W / 2 - w / 2 + 31, top.y + 0.5);
    c.restore();
  }

  function drawTypeChips(c, dim) {
    var rs = typeRects();
    var sub = { plase: "Dengeli", sert: "Hızlı · savruk", kasik: "Panenka" };
    c.save();
    rs.forEach(function (r) {
      var on = r.key === shotType;
      c.globalAlpha = dim && !on ? 0.45 : 1;
      var lift = on ? -4 : 0;
      A.roundRect(c, r.x, r.y + 4, r.w, r.h, 13);
      c.fillStyle = "rgba(8,6,30,0.5)";
      c.fill();
      A.roundRect(c, r.x, r.y + lift, r.w, r.h, 13);
      if (on) {
        var g = c.createLinearGradient(0, r.y + lift, 0, r.y + lift + r.h);
        g.addColorStop(0, "#FFE066");
        g.addColorStop(1, "#F5B700");
        c.fillStyle = g;
      } else c.fillStyle = "#FFFFFF";
      c.fill();
      c.lineWidth = on ? 3 : 2;
      c.strokeStyle = NAVY;
      c.stroke();
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.font = A.font(13, 900);
      c.fillStyle = NAVY;
      c.fillText(TYPES[r.key].label, r.x + r.w / 2, r.y + lift + 15);
      c.font = A.font(9.5, 800);
      c.fillStyle = on ? rgba(NAVY, 0.8) : "#6B6894";
      c.fillText(sub[r.key], r.x + r.w / 2, r.y + lift + 29);
    });
    c.restore();
  }

  function drawHint(c, text, y) {
    c.save();
    c.font = A.font(12.5, 900);
    var w = c.measureText(text).width + 32;
    navyPill(c, W / 2 - w / 2, y - 14, w, 28);
    c.fillStyle = "#FFFFFF";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(text, W / 2, y + 0.5);
    c.restore();
  }
  /** Sürükleme ipucu: gidip gelen parmak. */
  function drawDragHint(c) {
    var y = H - 92;
    var t = A.time % 2.4;
    var e = A.smooth(Math.min(1, t / 1.2));
    var x = W / 2 - 40 + 80 * (t < 1.2 ? e : 1 - A.smooth((t - 1.2) / 1.2));
    c.save();
    c.strokeStyle = "rgba(255,255,255,0.55)";
    c.lineWidth = 3;
    c.lineCap = "round";
    c.setLineDash([2, 7]);
    c.beginPath();
    c.moveTo(W / 2 - 46, y);
    c.lineTo(W / 2 + 46, y);
    c.stroke();
    c.setLineDash([]);
    c.globalAlpha = 0.5;
    disc(c, x, y, 16, "rgba(255,255,255,0.35)", 0);
    c.globalAlpha = 1;
    disc(c, x, y, 9, "#FFFFFF", 2.5);
    c.restore();
    drawHint(c, "Sürükle: nişan al · Bırak: güç", y - 32);
  }

  /* ── güç ── */

  function drawPower(c) {
    var w = Math.min(W - 70, 300), h = 20, x = W / 2 - w / 2, y = H - 100;
    var z = zoneOf(shotType);
    c.save();
    var pulse = 1 + 0.07 * Math.sin(A.time * 10);
    c.save();
    c.translate(W / 2, y - 26);
    c.scale(pulse, pulse);
    label(c, "DOKUN!", 0, 0, 22, GOLD);
    c.restore();
    label(c, "ZAYIF", x + 2, y - 10, 10, "rgba(255,255,255,0.9)", "left");
    label(c, "YÜKSEK", x + w - 2, y - 10, 10, "rgba(255,255,255,0.9)", "right");
    // kalın lacivert hazne
    A.roundRect(c, x - 5, y - 5 + 3, w + 10, h + 10, (h + 10) / 2);
    c.fillStyle = "rgba(8,6,30,0.55)";
    c.fill();
    A.roundRect(c, x - 5, y - 5, w + 10, h + 10, (h + 10) / 2);
    c.fillStyle = INK;
    c.fill();
    c.lineWidth = 2;
    c.strokeStyle = "rgba(255,255,255,0.2)";
    c.stroke();
    // dolum (ibreye kadar)
    var v = powerV;
    var g = c.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, "#38BDF8");
    g.addColorStop(Math.max(0.01, z[0]), "#4ADE6E");
    g.addColorStop(Math.min(0.99, z[1]), "#FACC15");
    g.addColorStop(1, "#FF4D6A");
    c.save();
    A.roundRect(c, x, y, w, h, h / 2);
    c.clip();
    c.fillStyle = "#2A2470";
    c.fillRect(x, y, w, h);
    c.fillStyle = g;
    c.fillRect(x, y, w * v, h);
    c.fillStyle = "rgba(255,255,255,0.28)";
    c.fillRect(x, y + 2, w * v, h * 0.3);
    c.restore();
    // yeşil bölge
    A.roundRect(c, x + w * z[0], y - 3, w * (z[1] - z[0]), h + 6, 6);
    c.fillStyle = "rgba(34,197,94,0.35)";
    c.fill();
    c.lineWidth = 2.5;
    c.strokeStyle = "#5CF08A";
    c.stroke();
    // ibre
    var nx = x + w * v;
    var good = powerQuality(shotType, v) >= 1;
    if (good) {
      c.save();
      c.globalCompositeOperation = "lighter";
      var gg = c.createRadialGradient(nx, y + h / 2, 2, nx, y + h / 2, 26);
      gg.addColorStop(0, "rgba(92,240,138,0.8)");
      gg.addColorStop(1, "rgba(92,240,138,0)");
      c.fillStyle = gg;
      c.fillRect(nx - 26, y + h / 2 - 26, 52, 52);
      c.restore();
    }
    A.roundRect(c, nx - 4.5, y - 9, 9, h + 18, 4.5);
    c.fillStyle = "#FFFFFF";
    c.fill();
    c.lineWidth = 2.5;
    c.strokeStyle = NAVY;
    c.stroke();
    c.restore();
  }

  /* ── atıcı kartı ── */

  function drawShooterCard(c) {
    var x = 10, y = 114, w = 176, h = 46;
    c.save();
    navyPill(c, x, y, w, h, null, 16);
    avatar(c, x + 24, y + h / 2, 16, shooter);
    c.textAlign = "left";
    c.textBaseline = "middle";
    c.font = A.font(12, 900);
    c.fillStyle = "#FFFFFF";
    c.fillText(fit(c, (shooter.shirt ? shooter.shirt + " · " : "") + shooter.short, w - 54), x + 47, y + 15);
    var keys = [["accuracy", "İSB"], ["power", "ŞUT"], ["curve", "FLS"]];
    keys.forEach(function (k, i) {
      var v = attr(shooter, k[0], 78);
      var bx = x + 47 + i * 40, by = y + 29;
      c.font = A.font(8, 900);
      c.fillStyle = "rgba(255,255,255,0.6)";
      c.fillText(k[1], bx, by);
      A.roundRect(c, bx, by + 5, 33, 4, 2);
      c.fillStyle = "rgba(255,255,255,0.15)";
      c.fill();
      A.roundRect(c, bx, by + 5, Math.max(4, 33 * ((v - 50) / 49)), 4, 2);
      c.fillStyle = v >= 85 ? GOLD : GOOD;
      c.fill();
    });
    c.restore();
  }

  /* ── sonuç ── */

  var LABELS = { gol: "GOL!", kurtaris: "KURTARIŞ!", direk: "DİREK!", aut: "AUT!" };
  function drawResult(c) {
    if (!lastKick) return;
    var t = stateT;
    var end = replay ? REPLAY_AT : resultLen;
    var fade = A.clamp((end - t) / 0.3, 0, 1);
    if (fade <= 0) return;
    var pop = A.easeOutBack(Math.min(1, t / 0.35));
    var good = lastKick.good;
    var lbl = LABELS[lastKick.result] || "";
    c.save();
    c.globalAlpha = fade;
    var y = Math.max(L.wide ? 96 : 168, proj(0, gTop, 0).y - 44);
    var size = (good ? 62 : 46) * (0.4 + 0.6 * pop);
    c.save();
    c.translate(W / 2, y);
    c.rotate(-0.06 * (1 - pop) + (good ? -0.04 : 0.03));
    A.bigText(c, lbl, 0, 0, size, good ? GOLD : "#FFFFFF", { stroke: good ? NAVY : "#7A0F2B" });
    c.restore();
    if (lastKick.gain) A.bigText(c, "+" + lastKick.gain, W / 2, y + 48, 26 * pop, "#FFFFFF", { stroke: NAVY });
    if (lastKick.tags.length) {
      var tags = lastKick.tags.join("  ·  ");
      yellowBadge(c, tags, W / 2, y + 82, 12);
    }
    c.restore();
  }
  function drawReplayBadge(c) {
    c.save();
    var x = W - 112, y = 54;
    navyPill(c, x, y, 98, 28);
    c.fillStyle = Math.sin(A.time * 6) > 0 ? "#EF4444" : "rgba(239,68,68,0.4)";
    c.beginPath();
    c.arc(x + 16, y + 14, 5, 0, Math.PI * 2);
    c.fill();
    label(c, "TEKRAR", x + 28, y + 14.5, 12, "#FFFFFF", "left", false);
    label(c, "Geçmek için dokun", W / 2, H - 23, 11, "rgba(255,255,255,0.85)", "center", false);
    c.restore();
  }

  /* ── tanıtım, sıra, maç sonu ── */

  function popIn(c, cx, cy, k) {
    c.translate(cx, cy);
    c.scale(k, k);
    c.translate(-cx, -cy);
  }

  function drawIntro(c) {
    var t = stateT;
    var inT = A.easeOutBack(Math.min(1, t / 0.45));
    var out = A.clamp((INTRO - t) / 0.3, 0, 1);
    var kp = opp.keeper;
    c.save();
    c.globalAlpha = out;
    var cw = Math.min(W - 28, 340), ch = 212;
    var x = W / 2 - cw / 2, y = H * 0.52 - ch / 2;
    popIn(c, W / 2, y + ch / 2, 0.8 + 0.2 * inT);
    whiteCard(c, x, y, cw, ch, 24);
    yellowBadge(c, "SERİ PENALTI · " + stageName(matchIdx), W / 2, y, 12);
    var bob = Math.sin(A.time * 3) * 2;
    badge(c, x + cw * 0.22, y + 78 + bob, 50, shooter);
    badge(c, x + cw * 0.78, y + 78 - bob, 50, kp);
    disc(c, W / 2, y + 78, 21, NAVY, 0);
    label(c, "VS", W / 2, y + 79, 16, GOLD, "center", false);
    c.font = A.font(14, 900);
    c.fillStyle = NAVY;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(fit(c, teamName(shooter), cw * 0.42), x + cw * 0.22, y + 124);
    c.fillText(fit(c, teamName(kp), cw * 0.42), x + cw * 0.78, y + 124);
    c.font = A.font(11, 800);
    c.fillStyle = "#6B6894";
    c.fillText(fit(c, "Atıcı: " + shooter.short, cw * 0.44), x + cw * 0.22, y + 143);
    c.fillText(fit(c, "Kaleci: " + kp.short, cw * 0.44), x + cw * 0.78, y + 143);
    var saves = kp.stats && kp.stats.saves ? kp.stats.saves + " kurtarış · " : "";
    var info = saves + "Refleks " + attr(kp, "reflex", 75) + "  ·  Maç " + (matchIdx + 1) + "/" + keepers.length;
    c.font = A.font(11, 900);
    var iw = Math.min(cw - 24, c.measureText(info).width + 26);
    navyPill(c, W / 2 - iw / 2, y + 166, iw, 26);
    c.fillStyle = "#FFFFFF";
    c.fillText(fit(c, info, iw - 16), W / 2, y + 179.5);
    c.restore();
  }

  function drawTurn(c) {
    var t = stateT;
    var inT = A.easeOutBack(Math.min(1, t / 0.35));
    var out = A.clamp((TURN - t) / 0.25, 0, 1);
    c.save();
    c.globalAlpha = out;
    var y = Math.min(H * 0.6, proj(0, 0, SPOT_Z * 0.55).y);
    var bw = Math.min(W - 40, 300), bh = 62;
    popIn(c, W / 2, y, 0.7 + 0.3 * inT);
    navyPill(c, W / 2 - bw / 2, y - bh / 2, bw, bh, null, 22);
    A.bigText(c, "SIRA SENDE", W / 2, y - 8, 26, GOLD, { stroke: NAVY });
    c.font = A.font(12, 800);
    c.fillStyle = "rgba(255,255,255,0.9)";
    c.textAlign = "center";
    c.textBaseline = "middle";
    var n = match.me.length + 1;
    c.fillText(fit(c, (match.sudden ? "Ani ölüm · " : n + ". atış · ") + "Atıcın " + shooter.short, bw - 24), W / 2, y + 17);
    c.restore();
  }

  /** Rakibin atışı: atıcı kartı, kısa bekleyiş, sonuç açılır. */
  function drawOppKick(c) {
    var t = stateT;
    var inT = A.easeOutBack(Math.min(1, t / 0.35));
    var out = A.clamp((OPP_KICK - t) / 0.3, 0, 1);
    var pk = oppShot.taker;
    var cw = Math.min(W - 28, 330), ch = 138;
    var x = W / 2 - cw / 2, y = H * 0.56 - ch / 2;
    c.save();
    c.globalAlpha = out;
    popIn(c, W / 2, y + ch / 2, 0.82 + 0.18 * inT);
    whiteCard(c, x, y, cw, ch, 22);
    yellowBadge(c, "RAKİP ATIŞI · " + (match.sudden ? "ANİ ÖLÜM" : match.op.length + ". ATIŞ"), W / 2, y, 11);
    avatar(c, x + 44, y + 54, 25, pk);
    badge(c, x + 62, y + 72, 18, pk);
    c.textAlign = "left";
    c.textBaseline = "middle";
    c.font = A.font(16, 900);
    c.fillStyle = NAVY;
    c.fillText(fit(c, (pk.shirt ? pk.shirt + " · " : "") + (pk.short || pk.name), cw - 100), x + 84, y + 46);
    c.font = A.font(11.5, 800);
    c.fillStyle = "#6B6894";
    c.fillText(fit(c, teamName(pk), cw - 100), x + 84, y + 66);
    var rv = A.clamp((t - 0.75) / 0.25, 0, 1);
    var gol = oppShot.result === "gol";
    if (rv <= 0) {
      for (var i = 0; i < 3; i++) {
        var a = 0.3 + 0.7 * Math.max(0, Math.sin(A.time * 8 - i));
        disc(c, W / 2 - 14 + i * 14, y + 108, 4.5, rgba(NAVY, a), 0);
      }
    } else {
      var lbl = gol ? "GOL" : oppShot.result === "kurtaris" ? "KALECİMİZ KURTARDI!" : oppShot.result === "direk" ? "DİREK!" : "KAÇIRDI!";
      var k = A.easeOutBack(rv);
      c.save();
      c.globalAlpha = out * rv;
      popIn(c, W / 2, y + 108, 0.6 + 0.4 * k);
      var txt = lbl + (gol ? "" : "  +25");
      c.font = A.font(15, 900);
      var tw = c.measureText(txt).width + 30;
      navyPill(c, W / 2 - tw / 2, y + 94, tw, 28, gol ? "#C81E45" : "#15A34A");
      c.fillStyle = "#FFFFFF";
      c.textAlign = "center";
      c.fillText(txt, W / 2, y + 108.5);
      c.restore();
    }
    c.restore();
  }

  function drawMatchEnd(c) {
    var t = stateT;
    var inT = A.easeOutBack(Math.min(1, t / 0.5));
    var won = endResult === "won";
    var gm = goalsOf(match.me), go = goalsOf(match.op);
    c.save();
    var cw = Math.min(W - 28, 340), ch = won && endGain ? 190 : 156;
    var x = W / 2 - cw / 2, y = H - ch - 26;
    popIn(c, W / 2, y + ch / 2, 0.8 + 0.2 * inT);
    whiteCard(c, x, y, cw, ch, 24);
    var title = champion ? "ŞAMPİYON!" : won ? "KAZANDIN!" : "ELENDİN";
    c.save();
    c.translate(W / 2, y + 2);
    c.rotate(-0.03);
    A.bigText(c, title, 0, 0, champion ? 38 : 34, won ? GOLD : "#FF8FA3", { stroke: NAVY });
    c.restore();
    badge(c, x + 58, y + 70, 38, shooter);
    badge(c, x + cw - 58, y + 70, 38, opp.keeper);
    label(c, gm + " – " + go, W / 2, y + 70, 36, NAVY, "center", false);
    c.font = A.font(11, 800);
    c.fillStyle = "#6B6894";
    c.textAlign = "center";
    c.fillText(match.sudden ? "ani ölümde" : "seri penaltılarda", W / 2, y + 100);
    if (won && endGain) yellowBadge(c, "+" + endGain.toLocaleString("tr-TR") + " puan", W / 2, y + 128, 13);
    c.font = A.font(12, 900);
    c.fillStyle = NAVY;
    var nextLine = won && !champion ? "Sıradaki: " + teamName(keepers[Math.min(matchIdx + 1, keepers.length - 1)]) + " · " + stageName(matchIdx + 1) : champion ? "Ligin bütün kalecilerini geçtin" : "Rakip: " + teamName(opp.keeper);
    c.fillText(fit(c, nextLine, cw - 30), W / 2, y + ch - 27);
    c.restore();
  }

  function drawLine(c) {
    if (!line || state === "attract") return;
    var life = 2.8;
    if (lineT > life) return;
    var inT = A.easeOut(Math.min(1, lineT / 0.25));
    var out = A.clamp((life - lineT) / 0.35, 0, 1);
    c.save();
    c.globalAlpha = out;
    c.font = A.font(12.5, 800);
    var maxW = W - 32;
    var text = fit(c, line.text, maxW - 40);
    var tw = Math.min(maxW, c.measureText(text).width + 40);
    var x = W / 2 - tw / 2, y = (L.wide ? H - 44 : 114) - (1 - inT) * 10;
    navyPill(c, x, y, tw, 30);
    disc(c, x + 16, y + 15, 5, line.good ? GOOD : BAD, 0);
    c.fillStyle = "#FFFFFF";
    c.textAlign = "left";
    c.textBaseline = "middle";
    c.fillText(text, x + 28, y + 15.5);
    c.restore();
  }

  function drawHUD(c, dt) {
    A.drawParticles(c);
    A.drawFloaters(c, dt);
    if (state === "attract" || state === "over") return;
    if (inReplay()) {
      drawReplayBadge(c);
      A.drawBanner(c, W, H * 0.34, dt);
      return;
    }
    drawScoreboard(c);
    if (state !== "intro") drawPoints(c, dt);
    if (state === "intro") drawIntro(c);
    else if (state === "turn") drawTurn(c);
    else if (state === "aim") {
      drawKeeperEye(c);
      drawAim(c, false);
      drawTypeChips(c, false);
      if (!dragFrom) drawDragHint(c);
      drawShooterCard(c);
      drawConditions(c);
      drawJokers(c);
    } else if (state === "power") {
      drawKeeperEye(c);
      drawAim(c, true);
      drawPower(c);
      drawTypeChips(c, true);
      drawConditions(c);
      drawJokers(c);
    } else if (state === "runup") drawKeeperEye(c);
    else if (state === "oppKick") drawOppKick(c);
    else if (state === "result") drawResult(c);
    else if (state === "matchEnd") drawMatchEnd(c);
    if (state !== "intro" && state !== "matchEnd") drawLine(c);
    A.drawBanner(c, W, H * 0.34, dt);
  }

  function debug() {
    return {
      state: state,
      me: match ? match.me.slice() : [],
      op: match ? match.op.slice() : [],
      sudden: match ? match.sudden : false,
      matchIdx: matchIdx,
      points: points,
      tally: tally,
      ball: ball,
      keeper: gk,
      aim: aim,
      powerV: powerV,
      shotType: shotType,
      zone: zoneOf(shotType),
      cond: cond,
      jokers: Object.assign({}, jokers),
      armed: Object.assign({}, armed),
      useJoker: useJoker,
      kplan: kplan,
      goal: { half: gHalf, top: gTop },
      predict: predict,
      zoneOf: zoneOf,
      startMatch: startMatch,
      nextKick: nextKick,
      shot: shot,
      shooter: shooter.short,
      opponent: teamName(opp.keeper),
      oppKeeper: opp.keeper.short,
      oppShot: oppShot,
      lastKick: lastKick,
      decide: decide,
      gl: false,
      canvas2d: true,
    };
  }

  A.register({ resize: resize, start: start, update: update, render: render, down: down, move: move, up: up, debug: debug, setRoster: setRoster });
})();
