/*
 * PENALTI 3B — SERİ PENALTI DÜELLOSU. Gerçek ligin golcüsüyle atarsın, gerçek
 * ligin kalecisiyle kurtarırsın; her maç ligin bir sonraki kulübüne karşı.
 *
 * MİMARİ: oyun iki katmandır.
 *   SİMÜLASYON  kurallar, top fiziği (yerçekimi, direk/üst direk sekmesi, file),
 *               kaleci gövdesi ve yapay zekâsı, puanlama. Çizimden bağımsızdır;
 *               başsız testler (scripts/check-games.mjs) yalnız bunu koşturur.
 *   ÇİZİM       three.js gece stadyumu (#gl) + saydam 2B HUD (#c).
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
  var T = window.THREE || (typeof THREE !== "undefined" ? THREE : null); // eslint-disable-line no-undef

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
    if (R) rebuildCast();
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
          netHit((b.x * S3.HALF) / HALF, (b.y * S3.GOAL_H) / GOAL_H, Math.abs(b.vz));
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
    if (R) rebuildCast();
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
    if (scored && !A.reduceMotion && R && recording.length > 10) {
      replay = { frames: recording, mine: true };
      resultLen = REPLAY_AT + REPLAY_LEN + 0.2;
    }
    recording = [];
    setState("result");
  }

  function confetti(kit) {
    if (!R) return;
    var p = screenOf(ball.x, ball.y, ball.z);
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
    if (!R) return;
    var sp = screenOf(0, 0.05, SPOT_Z);
    A.burst(sp.x, sp.y, 12, { angle: -Math.PI / 2, spread: 1.6, speed: 130, gravity: 520, life: 0.5, size: 3, color: ["#1F7A3D", "#2E9B53", "#6B4E2E"] });
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
    var bw = Math.min(104, (W - 48) / 3), bh = 40, gap = 8;
    var total = bw * 3 + gap * 2;
    var x0 = W / 2 - total / 2, y = H - 64;
    return TYPE_KEYS.map(function (k, i) {
      return { key: k, x: x0 + i * (bw + gap), y: y, w: bw, h: bh };
    });
  }
  /** Joker düğmeleri: sağ kenarda dikey üç daire. */
  function jokerButtons() {
    var r = 21, x = W - 32, y0 = Math.max(250, H * 0.5);
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

  /* ═══════════════════════════ 3B ÇİZİM ═══════════════════════════ */

  var K = A.T3;
  var R = null; // { renderer, scene, camera, ... }
  var glFailed = false;
  var tmpV = null;

  /** Dünya noktasının ekran konumu (HUD için); s = metre başına piksel. */
  function screenOf(x, y, z) {
    if (!R) return { x: W / 2, y: H * 0.6, s: 40 };
    tmpV.set(x, y, z);
    var dist = R.camera.position.distanceTo(tmpV);
    tmpV.project(R.camera);
    var s = H / (2 * Math.tan((R.camera.fov * Math.PI) / 360) * Math.max(0.3, dist));
    return { x: (tmpV.x * 0.5 + 0.5) * W, y: (-tmpV.y * 0.5 + 0.5) * H, s: s };
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
      scene.fog = new T.FogExp2(0x0b1230, 0.0065);
      var camera = new T.PerspectiveCamera(40, 1, 0.1, 500);
      tmpV = new T.Vector3();
      R = { renderer: renderer, scene: scene, camera: camera, U: { time: { value: 0 }, excite: { value: 0 } }, cast: {} };
      S3.build(R);
      buildWeather();
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
  /** Belirli bir genişliği (m) belirli uzaklıkta ekrana sığdıran dikey görüş açısı. */
  function fitFov(width, dist, lo, hi) {
    var aspect = W / Math.max(1, H);
    var v = (2 * Math.atan(width / 2 / dist / aspect) * 180) / Math.PI;
    return A.clamp(v, lo || 22, hi || 72);
  }

  var std = K.std, mesh = K.mesh, canvasTex = K.canvasTex, glowTexture = K.glowTexture;

  /* Stadyum, çim, kale + file, seyirci, top ve gölgeler: games/stadium3d.js (A.S3). */
  var S3 = A.S3;
  function blob(size, opacity) {
    return S3.blob(size, opacity);
  }
  function shadowSet() {
    return S3.shadowSet();
  }
  function placeShadows(set, a, visible) {
    S3.placeShadows(set, a, visible);
  }
  function asKeeper(person, avoid) {
    return S3.asKeeper(person, avoid);
  }
  function netReset() {
    S3.netReset();
  }
  function netHit(x, y, speed) {
    S3.netHit(x, y, speed);
  }
  function netStep(dt) {
    S3.netStep(dt);
  }
  function paintCrowd() {
    if (R) S3.paintCrowd(kitOf(shooter), kitOf(opp.keeper));
  }
  function paintBoards(text) {
    S3.paintBoards(text);
  }
  function paintLed(a, b) {
    S3.paintLed(a, b);
  }
  var screenSig = "";
  function paintScreen() {
    var gm = match ? goalsOf(match.me) : 0, go = match ? goalsOf(shownOp()) : 0;
    var sig = gm + ":" + go + ":" + teamName(shooter) + ":" + teamName(opp.keeper) + ":" + (match && match.sudden);
    if (sig === screenSig) return;
    screenSig = sig;
    var c = R.screenTex.userData.ctx, cw = 512, ch = 192;
    c.fillStyle = "#04060f";
    c.fillRect(0, 0, cw, ch);
    var g = c.createLinearGradient(0, 0, 0, ch);
    g.addColorStop(0, "rgba(91,61,245,0.35)");
    g.addColorStop(1, "rgba(10,12,40,0.0)");
    c.fillStyle = g;
    c.fillRect(0, 0, cw, ch);
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillStyle = "#FFD24A";
    c.font = "900 22px " + A.FONT;
    c.fillText(match && match.sudden ? "ANİ ÖLÜM" : "SERİ PENALTILAR", cw / 2, 30);
    c.fillStyle = "#FFFFFF";
    c.font = "900 76px " + A.FONT;
    c.fillText(gm + " – " + go, cw / 2, 106);
    c.font = "800 24px " + A.FONT;
    c.fillStyle = kitOf(shooter).primary;
    c.fillRect(20, 150, 8, 26);
    c.fillStyle = kitOf(opp.keeper).primary;
    c.fillRect(cw - 28, 150, 8, 26);
    c.fillStyle = "#FFFFFF";
    c.textAlign = "left";
    c.fillText(fitText(c, upperTR(teamName(shooter)), 210), 36, 164);
    c.textAlign = "right";
    c.fillText(fitText(c, upperTR(teamName(opp.keeper)), 210), cw - 36, 164);
    c.fillStyle = "rgba(0,0,0,0.25)";
    for (var y = 1; y < ch; y += 3) c.fillRect(0, y, cw, 1);
    R.screenTex.needsUpdate = true;
  }
  function fitText(c, text, max) {
    var t = text;
    while (c.measureText(t).width > max && t.length > 3) t = t.slice(0, -1);
    return t === text ? t : t + "…";
  }

  /* ─────────────── hava: yağmur, rüzgâr bayrakları, füze ışıması ─────────────── */

  function buildWeather() {
    var N = 1500;
    var g = new T.BufferGeometry();
    g.setAttribute("position", new T.BufferAttribute(new Float32Array(N * 6), 3));
    var rain = new T.LineSegments(g, new T.LineBasicMaterial({ color: 0xc8dcff, transparent: true, opacity: 0.5, depthWrite: false }));
    rain.frustumCulled = false;
    rain.visible = false;
    R.scene.add(rain);
    var rnd = A.seeded(77), drops = [];
    for (var i = 0; i < N; i++) drops.push({ x: -13 + rnd() * 26, y: rnd() * 14, z: -3 + rnd() * 25, v: 10 + rnd() * 4 });
    R.rain = { mesh: rain, drops: drops };
    // kale arkasında iki bayrak direği: rüzgârın yönü ve şiddeti
    var poleMat = std(0xe2e8f0, 0.4, 0.6);
    R.flags = [-1, 1].map(function (side) {
      var pole = mesh(new T.CylinderGeometry(0.035, 0.045, 4.4, 10), poleMat, true, false);
      pole.position.set(side * 5.9, 2.2, -5.3);
      R.scene.add(pole);
      var geo = new T.PlaneGeometry(1.3, 0.8, 10, 5);
      var flag = mesh(geo, new T.MeshStandardMaterial({ color: 0xffffff, side: T.DoubleSide, roughness: 0.8 }), false, false);
      flag.frustumCulled = false;
      R.scene.add(flag);
      return { side: side, flag: flag, base: Float32Array.from(geo.attributes.position.array) };
    });
    // füze ışıması (topun etrafında)
    var glow = new T.Sprite(new T.SpriteMaterial({ map: glowTexture(), color: 0xff8a3d, transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: 0.9 }));
    glow.scale.set(0.9, 0.9, 1);
    glow.visible = false;
    R.scene.add(glow);
    R.rocketGlow = glow;
    R.goalVis = { x: 1, y: 1 };
  }
  function syncWeather(dt) {
    var rain = R.rain, on = cond.rain && state !== "attract";
    rain.mesh.visible = on;
    if (on) {
      var arr = rain.mesh.geometry.attributes.position.array;
      var wx = cond.wind * 0.35;
      for (var i = 0; i < rain.drops.length; i++) {
        var d = rain.drops[i];
        d.y -= d.v * dt;
        d.x += wx * dt;
        if (d.y < 0) {
          d.y += 14;
          d.x = -13 + Math.random() * 26;
        }
        if (d.x > 13) d.x -= 26;
        if (d.x < -13) d.x += 26;
        var o = i * 6;
        arr[o] = d.x;
        arr[o + 1] = d.y;
        arr[o + 2] = d.z;
        arr[o + 3] = d.x - wx * 0.03;
        arr[o + 4] = d.y + 0.38;
        arr[o + 5] = d.z;
      }
      rain.mesh.geometry.attributes.position.needsUpdate = true;
    }
    R.scene.fog.density = on ? 0.012 : 0.0065;
    R.renderer.toneMappingExposure = on ? 0.9 : 1.0;
    // bayraklar: rüzgâr yönünde dalgalanır; rüzgâr yoksa sarkar
    var str = A.clamp(Math.abs(cond.wind) / 6, 0, 1), dir = cond.wind >= 0 ? 1 : -1;
    var kit = kitOf(opp.keeper);
    R.flags.forEach(function (f, fi) {
      f.flag.material.color.set(fi ? kit.primary : kitOf(shooter).primary);
      var pos = f.flag.geometry.attributes.position, b = f.base;
      for (var v = 0; v < pos.count; v++) {
        var u = (b[v * 3] + 0.65) / 1.3, h = (0.4 - b[v * 3 + 1]) / 0.8;
        var reach = u * 1.3 * (0.25 + 0.75 * str);
        var droop = u * (1 - str) * 0.9;
        pos.setXYZ(v, f.side * 5.9 + dir * reach, 4.3 - h * 0.8 - droop, -5.3 + Math.sin(A.time * (5 + 6 * str) - u * 7 + fi) * 0.14 * u * (0.25 + str));
      }
      pos.needsUpdate = true;
      f.flag.geometry.computeVertexNormals();
    });
    // DEV KALE: kale yaylanarak büyür / küçülür
    var gv = R.goalVis, k2 = Math.min(1, dt * 7);
    gv.x += (gHalf / HALF - gv.x) * k2;
    gv.y += (gTop / GOAL_H - gv.y) * k2;
    R.goalRoot.scale.set(gv.x, gv.y, 1);
  }

  var REFEREE = makePerson(-900, "Hakem", { id: -900, name: "Hakem", kit: { primary: "#111827", secondary: "#FACC15" } }, { shirt: "" });

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
    if (!cur) R.cast[key] = { shadows: shadowSet() };
    R.cast[key].a = a;
    R.cast[key].sig = sig;
    return a;
  }
  function rebuildCast() {
    if (!R) return;
    athlete("shooter", shooter, { keeper: false });
    athlete("oppKeeper", asKeeper(opp.keeper, kitOf(shooter).primary), { keeper: true });
    athlete("ref", REFEREE, { keeper: false, detail: "lo" });
    paintCrowd();
    screenSig = "";
  }

  /* ─────────────── pozlar ─────────────── */

  /*
   * ATICI HAREKETİ (sağ ayaklı). Ölçüler iskeletten ölçülmüştür (model +z'ye
   * bakar, sol +x): temas anında vuran ayağın iç yüzü topun arkasında, destek
   * (sol) ayağı topun ~30 cm solunda ve hizasında.
   *   1. Bekleyiş: koşu çizgisinin başında, topa dönük, nefes alır.
   *   2. Koşu: duruştan hızlanır; koşu klibi YERE GÖRE hızla oynar (ayak kaymaz).
   *   3. Son uzun adım (−0,32 sn): sağ ayakla itiş, havada uzun adım, vuran
   *      bacak dizden bükülerek geri savrulur, sol kol dengeye açılır.
   *   4. Destek ayağı basar (−0,08 sn), bacak aşağı-öne kamçılanır, temas (0).
   *   5. Takip: bacak yukarı uzanır, destek ayağında parmak ucuna yükselir,
   *      gövde topla birlikte öne gider; bacak iner, toparlanır.
   */
  var KROOT = { x: 0.04, z: SPOT_Z + 0.5 }; // destek ayağı bastığında kök (yön −z)
  var RDIR = { x: 0.375, z: -0.927 }; // koşu yönü (sol arkadan topa)
  var STRIDE = 0.85, JOG_LEN = 2.6;
  var PRP = { x: KROOT.x - RDIR.x * STRIDE, z: KROOT.z - RDIR.z * STRIDE }; // son adımın başı
  var START = { x: PRP.x - RDIR.x * JOG_LEN, z: PRP.z - RDIR.z * JOG_LEN };
  var T_STRIDE = 0.32, T_PLANT = 0.08; // temastan önce: son adım başı, destek ayağı
  var JOG_V1 = 5.8; // koşu klibinin 1× hızdaki yer hızı (m/sn)
  var JOG_PUSH = 0.47; // klipte sağ ayağın basıp itmeye başladığı an
  var RUN_HEAD = Math.atan2(RDIR.x, RDIR.z), FACE = Math.PI;
  /** Koşu: duruştan hızlanan yol (m) ve hız, t ∈ [0, T1]. */
  var ACC_T = 0.3;
  function runDist(t, T1) {
    var vmax = JOG_LEN / (T1 - ACC_T / 2);
    if (t < ACC_T) return { d: (vmax * t * t) / (2 * ACC_T), v: (vmax * t) / ACC_T };
    return { d: vmax * (t - ACC_T / 2), v: vmax };
  }
  /** Temas sonrası kökün öne kayışı (destek ayağı yerde sabit kalsın diye). */
  function followOff(tk) {
    var K2 = [[-0.08, 0], [0, 0.08], [0.08, 0.17], [0.16, 0.28], [0.5, 0.3], [1, 0.42]];
    if (tk <= K2[0][0]) return 0;
    for (var i = 1; i < K2.length; i++)
      if (tk <= K2[i][0]) return A.lerp(K2[i - 1][1], K2[i][1], (tk - K2[i - 1][0]) / (K2[i][0] - K2[i - 1][0]));
    return K2[K2.length - 1][1];
  }
  /** Vuruş eklemleri — tk: temasa göre zaman (sn); w: katman ağırlığı. */
  function kickJ(J, tk, w, lofted) {
    var L = A.lerp, S = A.smooth, C = A.clamp;
    function seg(t0, t1) {
      return S(C((tk - t0) / (t1 - t0), 0, 1));
    }
    var stride = seg(-0.32, -0.08), back = seg(-0.3, -0.07), down = seg(-0.07, 0), thru = seg(0, 0.16), land = seg(0.16, 0.5), rec = seg(0.5, 0.95);
    var lift = lofted ? 0.15 : 0;
    // destek (sol) bacak: öne uzanır, basar, dizden yumuşar, parmak ucuna yükselir
    J.hpa.rotation.x = w * L(L(L(0.45, -0.38, stride), -0.18, thru), 0.0, land);
    J.kna.rotation.x = w * L(L(L(1.1, 0.28, stride), 0.42, down), 0.15, land);
    J.hpa.rotation.z = w * 0.14;
    J.fta.rotation.x = w * L(0, 0.25, thru) * (1 - land);
    // vuran (sağ) bacak
    var hip = L(L(L(L(-0.15, 0.62, back), -0.82, down), -1.4 - lift, thru), -0.25, land);
    J.hpb.rotation.x = w * L(hip, 0, rec);
    var knee = L(L(L(L(0.5, 1.6, back), 0.28, down), 0.06, thru), 0.35, land);
    J.knb.rotation.x = w * L(knee, 0.1, rec);
    J.hpb.rotation.z = w * L(0, 0.12, down) * (1 - land);
    J.hpb.rotation.y = w * L(0, -0.5, back) * (1 - land);
    J.ftb.rotation.x = w * L(0.2, 0.45, back) * (1 - land);
    // gövde: adımda geri ve destek tarafına yatar, omuzlar açılır; temasta öne
    J.spine.rotation.x = w * (L(L(L(0.12, -0.12 - lift, back), 0.08, down), 0.18, thru) * (1 - rec) + 0.05 * rec);
    J.spine.rotation.z = w * L(0, -0.22, stride) * (1 - land);
    J.spine.rotation.y = w * L(L(0, 0.35, back), -0.25, thru) * (1 - land);
    // kollar: sol kol yana-yukarı (denge), sağ kol öne çapraz
    J.sha.rotation.z = w * (L(L(0.25, 1.25, back), 0.9, thru) * (1 - rec) + 0.25 * rec);
    J.sha.rotation.x = w * L(0, -0.35, back) * (1 - rec);
    J.ela.rotation.x = -0.35 * w;
    J.shb.rotation.z = w * (L(-0.25, -0.55, back) * (1 - rec) - 0.25 * rec);
    J.shb.rotation.x = w * L(L(0.2, -0.75, back), 0.35, thru) * (1 - rec);
    J.elb.rotation.x = -0.5 * w;
    J.head.rotation.x = w * (L(0.3, 0.45, back) * (1 - land) + 0.1);
    J.hips.position.y = 0.94 + w * L(L(0.04, -0.05, stride), 0.02, thru) * (1 - rec);
  }
  /** Kök: konum + yön (kökün yerel +z'si ileri). */
  function setRoot(a, x, z, yaw) {
    a.root.position.set(x, 0, z);
    a.root.rotation.y = yaw;
  }
  /** Temas sonrası kökün dünyadaki yeri (yön −z). */
  function afterRoot(tk) {
    var off = followOff(tk);
    return { x: KROOT.x, z: KROOT.z - off };
  }

  /**
   * Atıcının pozu. phase: 'wait' | 'run' (t: koşu başından sn) | 'kick' (k:
   * temastan sn) | 'celebrate' | 'sad'.
   */
  function poseShooter(a, phase, t) {
    var J = a.J;
    K.rest(a);
    var lofted = shot && (shot.lob || shot.ty > 1.7);
    if (phase === "wait") {
      setRoot(a, START.x, START.z, RUN_HEAD + 0.1);
      var ready = state === "power" ? 1 : 0;
      J.spine.rotation.x = 0.06 + 0.06 * ready + Math.sin(A.time * 2.1) * 0.015;
      J.head.rotation.x = 0.1;
      J.head.rotation.y = -0.12;
      J.hips.position.y = 0.94 - 0.03 * ready + (ready ? Math.max(0, Math.sin(A.time * 5)) * 0.02 : 0);
      J.kna.rotation.x = J.knb.rotation.x = 0.12 * ready;
      J.sha.rotation.z = 0.12;
      J.shb.rotation.z = -0.12;
      return;
    }
    if (phase === "run") {
      var T1 = RUNUP - T_STRIDE;
      var tk = t - RUNUP;
      if (t < T1) {
        var rd = runDist(t, T1);
        setRoot(a, START.x + RDIR.x * rd.d, START.z + RDIR.z * rd.d, RUN_HEAD);
        var end = runDist(T1, T1).d;
        var clipT = JOG_PUSH + 4 * K.clipDur("jog") - (end - rd.d) / JOG_V1;
        var wj = A.smooth(A.clamp(t / 0.22, 0, 1));
        K.play(a, "jog", clipT, wj);
        J.spine.rotation.x = 0.1 * wj + 0.12 * (1 - A.clamp(t / 0.35, 0, 1)) * wj; // ilk adımlarda öne eğik
        var wk0 = A.smooth(A.clamp((t - (T1 - 0.06)) / 0.1, 0, 1));
        if (wk0 > 0) kickJ(J, tk, wk0, lofted);
        return;
      }
      if (tk < -T_PLANT) {
        // son uzun adım: havada, yön topa döner
        var u = (tk + T_STRIDE) / (T_STRIDE - T_PLANT);
        setRoot(a, A.lerp(PRP.x, KROOT.x, u), A.lerp(PRP.z, KROOT.z, u), A.lerp(RUN_HEAD, FACE, A.smooth(u)));
        var wj2 = 1 - A.smooth(A.clamp((tk + T_STRIDE) / 0.1, 0, 1));
        if (wj2 > 0) K.play(a, "jog", JOG_PUSH + (tk + T_STRIDE) * (3.2 / JOG_V1), wj2);
        kickJ(J, tk, A.smooth(A.clamp((tk + T_STRIDE + 0.06) / 0.1, 0, 1)), lofted);
        a.root.position.y = Math.sin(Math.PI * u) * 0.05;
        return;
      }
      var ar = afterRoot(tk);
      setRoot(a, ar.x, ar.z, FACE);
      kickJ(J, tk, 1, lofted);
      return;
    }
    if (phase === "kick") {
      var r2 = afterRoot(t);
      setRoot(a, r2.x, r2.z, FACE);
      kickJ(J, t, 1, lofted);
      // gözler topta
      J.head.rotation.x += -0.15 * A.clamp(t / 0.4, 0, 1);
      return;
    }
    var base = afterRoot(1);
    if (phase === "celebrate") {
      // köşe bayrağına koşu, kollar açık; sonra diz kayışı ve yumruk
      var c = A.clamp(t / 2.0, 0, 1);
      var tx = 6.5, tz = SPOT_Z + 4.5;
      var e = A.smooth(c);
      setRoot(a, A.lerp(base.x, tx, e), A.lerp(base.z, tz, e), Math.atan2(tx - base.x, tz - base.z));
      if (c < 0.85) {
        var amp = A.clamp(0.6 + t * 0.8, 0.6, 1.1);
        K.runCycle(a, t * 9.5, amp);
        J.sha.rotation.z = 1.35 * A.clamp(t / 0.4, 0, 1);
        J.shb.rotation.z = -1.35 * A.clamp(t / 0.4, 0, 1);
        J.ela.rotation.x = -0.1;
        J.elb.rotation.x = -0.1;
        J.spine.rotation.z = Math.sin(t * 2.2) * 0.15;
        J.head.rotation.x = -0.25;
      } else {
        // dizlerin üstünde kayış, kollar havada
        var sl = A.clamp((c - 0.85) / 0.15, 0, 1);
        a.root.rotation.y = Math.atan2(0 - tx, 30 - tz);
        J.hpa.rotation.x = J.hpb.rotation.x = -0.2 * sl;
        J.kna.rotation.x = J.knb.rotation.x = 1.9 * sl;
        J.hips.position.y = 0.94 - 0.42 * sl;
        J.spine.rotation.x = -0.35 * sl;
        J.sha.rotation.x = -2.7 * sl;
        J.shb.rotation.x = -2.7 * sl;
        J.sha.rotation.z = 0.35;
        J.shb.rotation.z = -0.35;
        J.ela.rotation.x = J.elb.rotation.x = -0.4 * sl;
        J.head.rotation.x = -0.45 * sl;
      }
      return;
    }
    if (phase === "sad") {
      // eller başta, sonra dizlere eğilir
      setRoot(a, base.x, base.z, FACE);
      var d = A.clamp(t / 0.5, 0, 1), d2 = A.smooth(A.clamp((t - 1.1) / 0.6, 0, 1));
      J.sha.rotation.x = -2.5 * d * (1 - d2) + -0.6 * d2;
      J.shb.rotation.x = -2.5 * d * (1 - d2) + -0.6 * d2;
      J.sha.rotation.z = 0.7 * d * (1 - d2) + 0.15 * d2;
      J.shb.rotation.z = -0.7 * d * (1 - d2) - 0.15 * d2;
      J.ela.rotation.x = -2.1 * d * (1 - d2) - 0.3 * d2;
      J.elb.rotation.x = -2.1 * d * (1 - d2) - 0.3 * d2;
      J.head.rotation.x = 0.35 * d + 0.25 * d2;
      J.spine.rotation.x = 0.18 * d + 0.55 * d2;
      J.kna.rotation.x = J.knb.rotation.x = 0.45 * d2;
      J.hpa.rotation.x = J.hpb.rotation.x = -0.35 * d2;
      J.hips.position.y = 0.94 - 0.1 * d2;
      return;
    }
  }

  /**
   * Kaleci pozu, simülasyondaki gövdeden: merkez + eksen. Kök ayak hizasındadır;
   * gövde merkezi (kalça ≈ 0,95 m) simülasyon merkezine oturtulur.
   *   Hazır: geniş duruş, dizler bükülü, eller önde-aşağıda, avuçlar açık;
   *     çizgide yan adımlarla gezinir, hafifçe yaylanır (zorlukla daha hareketli).
   *   Sıçrama adımı (split step): atıcı topa varmadan küçük bir zıplama,
   *     temasta yere yüklenmiş iner.
   *   Uçuş: yakın bacakla yüklenir, uzak bacakla iter; gövde yana yatar,
   *     kollar uçuş yönünde uzanır (üstteki kol başın üstünden geçer); alçak
   *     topta gövde yere kapanır, eller çimden süpürür.
   *   İniş: kalça ve omuz yere değer, dizler toplanır, kollar topu sarar.
   */
  function poseKeeper(a, k, now, extra) {
    var J = a.J;
    K.rest(a);
    var root = a.root;
    var b = keeperBody(k, now);
    extra = extra || {};
    root.rotation.y = 0; // kaleci sahaya (+z) bakar
    if (!b.diving) {
      var cr = k.stay ? 1 : k.crouch;
      var hop = extra.hop || 0;
      var load = 1 - 0.55 * hop;
      J.hips.position.y = 0.94 - cr * 0.18 * load + (extra.bob || 0);
      J.hpa.rotation.x = -0.55 * cr * load;
      J.hpb.rotation.x = -0.55 * cr * load;
      J.kna.rotation.x = 1.08 * cr * load;
      J.knb.rotation.x = 1.08 * cr * load;
      J.fta.rotation.x = J.ftb.rotation.x = -0.45 * cr * load + 0.35 * hop;
      J.hpa.rotation.z = 0.27;
      J.hpb.rotation.z = -0.27;
      J.spine.rotation.x = 0.34 * cr;
      J.spine.rotation.z = extra.lean || 0;
      var wave = extra.wave || 0;
      J.sha.rotation.z = 0.6 + k.set * 0.3 + wave;
      J.shb.rotation.z = -0.6 - k.set * 0.3 - wave;
      J.sha.rotation.x = -0.7 + wave * 0.4;
      J.shb.rotation.x = -0.7 + wave * 0.4;
      J.ela.rotation.x = -0.55;
      J.elb.rotation.x = -0.55;
      J.head.rotation.x = -0.28 * cr;
      root.position.set(b.cx, hop * 0.09, KEEPER_Z);
      if (extra.caught) {
        // topu göğse alır
        J.sha.rotation.x = -1.25;
        J.shb.rotation.x = -1.25;
        J.sha.rotation.z = 0.15;
        J.shb.rotation.z = -0.15;
        J.ela.rotation.x = -1.6;
        J.elb.rotation.x = -1.6;
        J.spine.rotation.x = 0.45;
        J.head.rotation.x = 0.1;
      }
      if (extra.cheer > 0) {
        var ch = extra.cheer;
        J.sha.rotation.x = -2.9 * ch;
        J.sha.rotation.z = 0.25;
        J.ela.rotation.x = -0.5 * ch;
        J.shb.rotation.x = -2.6 * ch;
        J.shb.rotation.z = -0.25;
        J.hips.position.y = 0.94 + Math.max(0, Math.sin(A.time * 10)) * 0.06 * ch;
        J.hpa.rotation.x = J.hpb.rotation.x = J.kna.rotation.x = J.knb.rotation.x = 0;
        J.fta.rotation.x = J.ftb.rotation.x = 0;
        J.spine.rotation.x = -0.12 * ch;
        J.head.rotation.x = -0.3 * ch;
      }
      return;
    }
    // uçuş: gövde ekseni (ax, ay); kök = merkez − eksen × kalça yüksekliği
    var d = k.dive;
    var side = b.ax >= 0 ? 1 : -1;
    var low = d.dy < -0.12;
    var e = b.e;
    var land = extra.land || 0;
    var cy = b.cy;
    var phi = Math.atan2(-b.ax, b.ay);
    if (land > 0) {
      // yere iniş: gövde yataylaşır, merkez yere oturur
      var flat = side * Math.PI / 2;
      phi = A.lerp(phi, -flat * 0.96, land);
      cy = A.lerp(cy, 0.2, land);
    }
    root.rotation.z = phi;
    var axx = -Math.sin(phi), axy = Math.cos(phi);
    root.position.set(b.cx - axx * 0.95, cy - axy * 0.95, KEEPER_Z);
    var push = 1 - A.smooth(A.clamp(e / 0.35, 0, 1));
    var nearH = side > 0 ? J.hpa : J.hpb, farH = side > 0 ? J.hpb : J.hpa;
    var nearK = side > 0 ? J.kna : J.knb, farK = side > 0 ? J.knb : J.kna;
    // itiş: yakın bacak bükülü (yük), uzak bacak itip uzanır; uçuşta makas
    nearH.rotation.x = A.lerp(-0.1, -0.7, push) - 0.25 * land;
    nearK.rotation.x = A.lerp(0.3, 1.25, push) + 0.9 * land;
    farH.rotation.x = A.lerp(0.25, 0.1, push) - 0.5 * land;
    farK.rotation.x = A.lerp(0.5, 0.15, push) + 0.7 * land;
    J.hpa.rotation.z = 0.12 + (side > 0 ? 0.1 : 0.25) * (1 - e);
    J.hpb.rotation.z = -0.12 - (side > 0 ? 0.25 : 0.1) * (1 - e);
    J.fta.rotation.x = J.ftb.rotation.x = 0.5 * e;
    // kollar: uçuş yönünde başın üstünde; üstteki kol başın üstünden geçer
    var reachA = low ? 2.55 : 2.95;
    var nearArmZ = side > 0 ? J.sha : J.shb, farArmZ = side > 0 ? J.shb : J.sha;
    var nearEl = side > 0 ? J.ela : J.elb, farEl = side > 0 ? J.elb : J.ela;
    nearArmZ.rotation.z = side * A.lerp(0.65, reachA, e);
    farArmZ.rotation.z = -side * A.lerp(0.65, reachA - 0.15, e);
    farArmZ.rotation.x = A.lerp(-0.6, low ? -0.9 : -0.55, e);
    nearArmZ.rotation.x = A.lerp(-0.6, -0.12, e);
    nearEl.rotation.x = -0.12;
    farEl.rotation.x = A.lerp(-0.5, -0.25, e);
    if (extra.caught && land > 0) {
      // yerde topu sarar
      nearArmZ.rotation.z = side * A.lerp(reachA, 1.6, land);
      farArmZ.rotation.z = -side * A.lerp(reachA, 1.2, land);
      nearEl.rotation.x = farEl.rotation.x = -1.3 * land;
    }
    J.spine.rotation.z = side * (0.14 * e - 0.1 * land);
    J.spine.rotation.x = low ? 0.25 * e : -0.08 * e;
    J.spine.rotation.y = -side * 0.18 * e; // göğüs topa döner
    J.head.rotation.z = side * 0.22 * e;
    J.head.rotation.x = -0.12;
    J.hips.position.y = 0.94;
  }

  function poseReferee(a) {
    K.rest(a);
    a.root.position.set(8.6, 0, 5.2);
    a.root.rotation.y = -1.35;
    a.J.sha.rotation.z = 0.12;
    a.J.shb.rotation.z = -0.12;
  }

  /* ─────────────── kamera ─────────────── */

  var camPos = null, camLook = null, camFov = 40, lastShot = "";
  function camShoot() {
    // yayın penaltı kamerası: atıcının koşu çizgisinin arkası, biraz yüksek —
    // atıcı alt solda, kale ekranın üst yarısını doldurur
    var d = SPOT_Z + 9.4;
    return { pos: [-0.8, 2.35, d], look: [0.1, 1.05, 0], fov: fitFov(GOAL_W * 1.3, d, 18, 60) };
  }
  function placeCamera(dt) {
    var cam = R.camera;
    var t = A.time;
    var view = null, follow = 5, cut = false;
    if (state === "attract") {
      var a = t * 0.12;
      view = { pos: [Math.sin(a) * 16, 6 + Math.sin(t * 0.2), 14 + Math.cos(a) * 10], look: [0, 1, 2], fov: 50 };
      follow = 2;
    } else if (state === "intro") {
      var e = A.smooth(stateT / (INTRO * 0.92));
      var s = camShoot();
      view = {
        pos: [A.lerp(-14, s.pos[0], e), A.lerp(15, s.pos[1], e), A.lerp(46, s.pos[2], e)],
        look: [0, A.lerp(4, s.look[1], e), A.lerp(10, 0, e)],
        fov: A.lerp(55, s.fov, e),
      };
      follow = 30;
    } else if (state === "matchEnd") {
      var hero = endResult === "won" ? R.cast.shooter.a.root.position : R.cast.oppKeeper.a.root.position;
      var o = 0.6 + Math.sin(t * 0.3) * 0.35;
      view = { pos: [hero.x - Math.sin(o) * 4.2, 1.5, hero.z + Math.cos(o) * 4.2], look: [hero.x, 0.75, hero.z], fov: 46 };
      follow = 3;
    } else if (inReplay()) {
      var rp = A.clamp((stateT - REPLAY_AT) / REPLAY_LEN, 0, 1);
      // yandan, kale ağzına alçak açı: top kameraya doğru gelen tarafta
      var side = (replay.frames[replay.frames.length - 1].bx || 0) >= 0 ? 1 : -1;
      view = { pos: [side * (7.2 - rp * 0.8), 1.25, 3.6 - rp * 0.6], look: [side * 0.6, 1.0, 0.2], fov: 46 };
      cut = lastShot !== "replay";
      lastShot = "replay";
      follow = 4;
    } else {
      view = camShoot();
      if (state === "power") {
        var pf = A.smooth(Math.min(1, stateT / 1.2));
        view.pos[2] -= pf * 0.6;
      }
      if (state === "flight" || state === "result") {
        var fz = A.clamp((SPOT_Z - ball.z) / SPOT_Z, 0, 1);
        view.pos[2] -= 2.4 * A.smooth(fz);
        view.pos[0] += ball.x * 0.15;
        view.look[0] = ball.x * 0.35;
        view.look[1] = 1.05;
        follow = 4;
      }
      cut = lastShot !== "shoot" && state !== "intro";
      lastShot = "shoot";
    }
    if (state === "runup") view.pos[2] -= 0.9 * A.smooth(A.clamp(stateT / RUNUP, 0, 1));
    if (window.__cam) {
      // test/laboratuvar kamerası
      view = window.__cam;
      cut = true;
    }
    if (state === "intro" || state === "attract" || state === "matchEnd") lastShot = state;
    var want = new T.Vector3(view.pos[0], view.pos[1], view.pos[2]);
    var look = new T.Vector3(view.look[0], view.look[1], view.look[2]);
    want.x += Math.sin(t * 0.9) * 0.025;
    want.y += Math.sin(t * 1.3) * 0.018;
    if (A.shakeAmt > 0.2) {
      want.x += (Math.random() - 0.5) * A.shakeAmt * 0.01;
      want.y += (Math.random() - 0.5) * A.shakeAmt * 0.01;
    }
    if (cut || !camPos) {
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

  function inReplay() {
    return state === "result" && !!replay && stateT > REPLAY_AT && stateT < REPLAY_AT + REPLAY_LEN;
  }

  function sync(dt) {
    var U = R.U;
    U.time.value = A.time;
    var cheering = state === "result" && lastKick && lastKick.good;
    U.excite.value = state === "attract" ? 0 : Math.max(excite, cheering ? 1 : 0, state === "matchEnd" && endResult === "won" ? 1 : 0);
    var mk = kitOf(shooter), ok = kitOf(opp.keeper);
    paintLed(mk.primary, ok.primary);
    paintScreen();
    paintBoards(
      state === "result" && lastKick && lastKick.result === "gol"
        ? "GOOOL!  " + upperTR(shooter.back || shooter.short) + "   •   "
        : "ELİTLİG ARENA   •   " + upperTR(teamName(shooter)) + "  vs  " + upperTR(teamName(opp.keeper)) + "   •   ",
    );
    R.boardTex.offset.x = (A.time * 0.04) % 1;
    R.ledTex.offset.x = (A.time * 0.02) % 1;

    var cast = R.cast;
    var shooterA = cast.shooter.a;
    var keeperA = cast.oppKeeper.a;

    // top ve kaleci: tekrarda kayıttan
    var bx = ball.x, by = ball.y, bz = ball.z, kstate = gk, know = simTime, keepExtra = {};
    var rframe = null;
    if (inReplay()) {
      var fr = replay.frames;
      var t0 = fr[0].t, t1 = fr[fr.length - 1].t;
      var rt = t0 + (stateT - REPLAY_AT) * 0.45 * ((t1 - t0 + 0.4) / Math.max(0.5, t1 - t0 + 0.4)) - 0.25;
      var i = 0;
      while (i < fr.length - 1 && fr[i + 1].t < rt) i++;
      rframe = fr[i];
      bx = rframe.bx;
      by = rframe.by;
      bz = rframe.bz;
      kstate = rframe.k;
      know = rt;
    } else if (state === "result" || state === "matchEnd") {
      keepExtra = { caught: ball.caught, cheer: lastKick && lastKick.result !== "gol" && !gk.dive && !ball.caught ? Math.min(1, stateT * 2) : 0 };
    }
    // uçuş bitince yere iniş (tekrarda da)
    if (kstate.dive) keepExtra.land = A.smooth(A.clamp((know - kstate.dive.t0 - kstate.dive.dur) / 0.28, 0, 1));
    if (state === "aim" || state === "power" || state === "turn" || state === "oppKick" || state === "intro" || state === "runup") {
      bx = 0;
      by = BALL_R;
      bz = SPOT_Z;
    }
    if (ball.caught && !inReplay()) {
      var kb = keeperBody(gk, simTime);
      bx = kb.cx;
      by = kb.cy + 0.15;
      bz = KEEPER_Z + 0.32;
    }
    R.ball.position.set(bx, by, bz);
    syncWeather(dt);
    var rocketOn = shot && shot.rocket && (state === "flight" || inReplay()) && bz < SPOT_Z - 0.2;
    R.rocketGlow.visible = !!rocketOn;
    if (rocketOn) {
      R.rocketGlow.position.set(bx, by, bz);
      var gsz = 0.75 + Math.random() * 0.25;
      R.rocketGlow.scale.set(gsz, gsz, 1);
    }
    R.trail.line.material.color.set(shot && shot.rocket ? 0xff9a4d : 0xffffff);
    R.trail.line.material.opacity = shot && shot.rocket ? 0.75 : 0.28;
    R.ball.rotation.set(ball.wx, ball.wy, 0);
    R.ballShadow.position.set(bx, 0.006, bz);
    R.ballShadow.material.opacity = 0.55 * Math.max(0.15, 1 - by * 0.6);
    var trail = R.trail;
    var flying = (state === "flight" || inReplay()) && bz < SPOT_Z - 0.3;
    if (flying) {
      trail.pts.push(bx, by, bz);
      if (trail.pts.length > 30 * 3) trail.pts.splice(0, 3);
    } else if (trail.pts.length) trail.pts.splice(0, 3);
    var arr = trail.line.geometry.attributes.position.array;
    var n = trail.pts.length / 3;
    for (var j = 0; j < trail.pts.length; j++) arr[j] = trail.pts[j];
    trail.line.geometry.attributes.position.needsUpdate = true;
    trail.line.geometry.setDrawRange(0, n);
    trail.line.visible = n > 2;

    // atıcı
    var sh = shooterA;
    if (state === "attract" || state === "intro" || state === "turn" || state === "aim" || state === "power" || state === "oppKick") poseShooter(sh, "wait");
    else if (state === "runup") poseShooter(sh, "run", Math.min(stateT, RUNUP));
    else if (inReplay()) poseShooter(sh, "kick", Math.max(0, know - kickAt + 0.05));
    else if (state === "flight") poseShooter(sh, "kick", simTime - kickAt);
    else if (state === "result") {
      var mineGoal = lastKick && lastKick.result === "gol";
      if (mineGoal && stateT > 0.5) poseShooter(sh, "celebrate", stateT - 0.5);
      else if (!mineGoal && stateT > 0.35) poseShooter(sh, "sad", stateT - 0.35);
      else poseShooter(sh, "kick", simTime - kickAt);
    } else if (state === "matchEnd") {
      if (endResult === "won") poseShooter(cast.shooter.a, "celebrate", 2.3 + stateT);
      else poseShooter(cast.shooter.a, "sad", 1);
    }
    if (!inReplay()) {
      var dz = opp.diff;
      if (state === "aim" || state === "power" || state === "turn") {
        keepExtra.bob = Math.sin(A.time * (5 + 2 * dz)) * 0.012;
        keepExtra.lean = Math.sin(A.time * 1.3) * 0.06;
        keepExtra.wave = dz > 0.4 && state === "power" ? Math.max(0, Math.sin(A.time * (3 + 2 * dz))) * 0.5 * dz : 0;
      } else if (state === "runup") {
        // sıçrama adımı: temastan hemen önce küçük zıplama, temasta yüklenmiş iniş
        var hu = (stateT - (RUNUP - 0.3)) / 0.26;
        keepExtra.hop = hu > 0 && hu < 1 ? Math.sin(Math.PI * hu) : 0;
      }
    }
    poseKeeper(keeperA, kstate, know, keepExtra);
    poseReferee(cast.ref.a);
    Object.keys(cast).forEach(function (key) {
      var c = cast[key];
      placeShadows(c.shadows, c.a, c.a.root.visible);
    });

    placeCamera(dt);
  }

  /* ═══════════════════════════ ÇİZİM GİRİŞİ ═══════════════════════════ */

  function resize(w, h) {
    W = w;
    H = h;
    initGL();
    resizeGL();
  }

  /**
   * Uyarlanır kalite: kare süresi uzun süre 24 ms'yi aşarsa önce çözünürlük
   * 1×'e iner, sürerse gölgeler kapanır. Akıcılık görüntüden önce gelir.
   */
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

  var GOLD = "#FFD24A", BRAND = "#5B3DF5", GLASS = "rgba(9,11,32,0.8)", LINE = "rgba(255,255,255,0.12)";

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
      A.paintVignette(v, W, H, 0.38);
      var g = v.createLinearGradient(0, 0, 0, 150);
      g.addColorStop(0, "rgba(3,5,16,0.72)");
      g.addColorStop(1, "rgba(3,5,16,0)");
      v.fillStyle = g;
      v.fillRect(0, 0, W, 150);
      var g2 = v.createLinearGradient(0, H - 170, 0, H);
      g2.addColorStop(0, "rgba(3,5,16,0)");
      g2.addColorStop(1, "rgba(3,5,16,0.62)");
      v.fillStyle = g2;
      v.fillRect(0, H - 170, W, 170);
    }
    A.blit(vignetteLayer);
  }

  /* ── küçük yapı taşları ── */

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
  /** Kulüp arması: kalkan, iki renk, baş harfler. */
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
  function lum(hex) {
    var h = String(hex).replace("#", "");
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var v = parseInt(h, 16) || 0;
    return (0.299 * ((v >> 16) & 255) + 0.587 * ((v >> 8) & 255) + 0.114 * (v & 255)) / 255;
  }
  var imgCache = {};
  /** Oyuncu fotoğrafı (yoksa baş harfler), daire içinde. */
  function avatar(c, x, y, r, person) {
    var kit = kitOf(person);
    c.save();
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fillStyle = kit.primary;
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
      c.fillStyle = lum(kit.primary) > 0.6 ? "#0B1020" : "#FFFFFF";
      c.font = A.font(r * 0.8, 900);
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillText(initials(person && (person.name || person.short)), x, y + 1);
    }
    c.lineWidth = 2;
    c.strokeStyle = kit.secondary;
    c.stroke();
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
    var w = Math.min(W - 20, 384), h = 62, x = W / 2 - w / 2, y = 10;
    c.save();
    glass(c, x, y, w, h, 14);
    var mk = kitOf(shooter), ok = kitOf(opp.keeper);
    c.fillStyle = mk.primary;
    c.fillRect(x, y + 10, 4, h - 20);
    c.fillStyle = ok.primary;
    c.fillRect(x + w - 4, y + 10, 4, h - 20);
    var gm = match ? goalsOf(match.me) : 0, go = match ? goalsOf(shownOp()) : 0;
    // skor
    var sw = 74;
    A.roundRect(c, W / 2 - sw / 2, y + 8, sw, 30, 8);
    c.fillStyle = "rgba(255,255,255,0.1)";
    c.fill();
    c.font = A.font(22, 900);
    c.fillStyle = "#FFFFFF";
    c.textAlign = "center";
    c.textBaseline = "middle";
    var bump = 1 + 0.18 * scoreBump;
    c.save();
    c.translate(W / 2, y + 24);
    c.scale(bump, bump);
    c.fillText(gm + "  –  " + go, 0, 1);
    c.restore();
    // armalar ve adlar
    badge(c, x + 24, y + 24, 22, shooter);
    badge(c, x + w - 24, y + 24, 22, opp.keeper);
    var half = w / 2 - sw / 2 - 48;
    c.font = A.font(12, 800);
    c.textAlign = "left";
    c.fillText(fit(c, upperTR(teamName(shooter)), half), x + 42, y + 24);
    c.textAlign = "right";
    c.fillText(fit(c, upperTR(teamName(opp.keeper)), half), x + w - 42, y + 24);
    // atış noktaları
    if (match) {
      dots(c, x + 42, y + 47, match.me, isLive(), 1);
      dots(c, x + w - 42, y + 47, shownOp(), oppPending(), -1);
    }
    c.font = A.font(9, 900);
    c.fillStyle = match && match.sudden ? P.bad : "rgba(255,255,255,0.55)";
    c.textAlign = "center";
    if ("letterSpacing" in c) c.letterSpacing = "1px";
    c.fillText(match && match.sudden ? "ANİ ÖLÜM" : stageName(matchIdx), W / 2, y + 49);
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
  /** Beş atış noktası (ani ölümde son beşi): gol yeşil ✓, kaçan kırmızı ×, sıradaki nabız. */
  function dots(c, x, y, list, next, dir) {
    var n = Math.max(KICKS, list.length + (next ? 1 : 0));
    var from = Math.max(0, n - KICKS);
    var r = 5.5, gap = 15;
    for (var i = 0; i < KICKS; i++) {
      var k = from + i;
      var cx = x + dir * (i * gap + r);
      var v = list[k];
      c.beginPath();
      c.arc(cx, y, r, 0, Math.PI * 2);
      if (v === "g") {
        c.fillStyle = P.good;
        c.fill();
        c.strokeStyle = "#063D26";
        c.lineWidth = 1.6;
        c.beginPath();
        c.moveTo(cx - 2.6, y + 0.2);
        c.lineTo(cx - 0.6, y + 2.2);
        c.lineTo(cx + 2.8, y - 2);
        c.stroke();
      } else if (v === "x") {
        c.fillStyle = P.bad;
        c.fill();
        c.strokeStyle = "#4A0A18";
        c.lineWidth = 1.6;
        c.beginPath();
        c.moveTo(cx - 2.2, y - 2.2);
        c.lineTo(cx + 2.2, y + 2.2);
        c.moveTo(cx + 2.2, y - 2.2);
        c.lineTo(cx - 2.2, y + 2.2);
        c.stroke();
      } else {
        var live = next && k === list.length;
        c.lineWidth = live ? 2 : 1.3;
        c.strokeStyle = live ? "rgba(255,210,74," + (0.55 + 0.45 * Math.sin(A.time * 6)) + ")" : "rgba(255,255,255,0.35)";
        c.stroke();
      }
    }
  }

  function drawPoints(c) {
    c.save();
    var y = 82;
    var label = "PUAN " + points.toLocaleString("tr-TR");
    c.font = A.font(12, 900);
    var w = c.measureText(label).width + 22;
    var s = 1 + 0.15 * scoreBump;
    c.translate(16 + w / 2, y + 12);
    c.scale(s, s);
    A.pill(c, -w / 2, -12, w, 24, "rgba(9,11,32,0.7)");
    c.fillStyle = scoreBump > 0.1 ? GOLD : "#FFFFFF";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(label, 0, 0.5);
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
    var p = screenOf(tx, ty, 0);
    // risk: çerçeve dışı (aut) ya da direğe/üst direğe yakın (güç hatası affetmez)
    var out = Math.abs(tx) > gHalf - 0.04 || ty > gTop - 0.04;
    var near = !out && (Math.abs(tx) > gHalf - 0.4 || ty > gTop - 0.35);
    var col = out ? P.bad : near ? "#FBBF24" : "#FFFFFF";
    c.save();
    if (!locked || state === "power") {
      var pts = previewPath(type, tx, ty);
      for (var i = 0; i < pts.length; i++) {
        var sp = screenOf(pts[i][0], pts[i][1], pts[i][2]);
        var f = i / pts.length;
        c.fillStyle = armed.rocket ? "rgba(251,146,60," + (0.25 + 0.5 * (1 - f)) + ")" : "rgba(255,255,255," + (0.15 + 0.45 * (1 - f)) + ")";
        c.beginPath();
        c.arc(sp.x, sp.y, Math.max(1.4, 3.2 - f * 1.8), 0, Math.PI * 2);
        c.fill();
      }
    }
    // nişangâh
    var r = Math.max(10, p.s * 0.17);
    c.strokeStyle = col;
    c.lineWidth = 2.5;
    c.shadowColor = "rgba(0,0,0,0.55)";
    c.shadowBlur = 6;
    c.beginPath();
    c.arc(p.x, p.y, r, 0, Math.PI * 2);
    c.stroke();
    c.beginPath();
    [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(function (d) {
      c.moveTo(p.x + d[0] * r * 0.45, p.y + d[1] * r * 0.45);
      c.lineTo(p.x + d[0] * r * 1.55, p.y + d[1] * r * 1.55);
    });
    c.stroke();
    c.shadowBlur = 0;
    c.fillStyle = col;
    c.beginPath();
    c.arc(p.x, p.y, 2.6, 0, Math.PI * 2);
    c.fill();
    // rüzgâr: nişandan sürüklenme yönü (kesikli ok, boyu rüzgârla)
    if (Math.abs(cond.wind) > 0.3 && !armed.rocket) {
      var len = A.clamp(Math.abs(cond.wind) * 7, 12, 58) * Math.sign(cond.wind);
      var y0 = p.y + r + 10;
      c.strokeStyle = "rgba(125,211,252,0.9)";
      c.fillStyle = "rgba(125,211,252,0.9)";
      c.lineWidth = 2;
      c.setLineDash([4, 4]);
      c.lineDashOffset = -A.time * 20 * Math.sign(cond.wind);
      c.beginPath();
      c.moveTo(p.x, y0);
      c.lineTo(p.x + len, y0);
      c.stroke();
      c.setLineDash([]);
      c.beginPath();
      c.moveTo(p.x + len + Math.sign(len) * 6, y0);
      c.lineTo(p.x + len, y0 - 4);
      c.lineTo(p.x + len, y0 + 4);
      c.closePath();
      c.fill();
    }
    if ((out || near) && !locked) {
      c.font = A.font(10, 900);
      c.textAlign = "center";
      c.fillStyle = col;
      c.fillText(out ? "ÇERÇEVE DIŞI" : "DİREK RİSKİ", p.x, p.y - r * 1.6 - 6);
    }
    c.restore();
  }

  /* ── koşullar: rüzgâr, yağmur, zorluk ── */

  function drawConditions(c) {
    var x = W - 14, y = 82;
    c.save();
    c.textBaseline = "middle";
    var chips = [];
    if (Math.abs(cond.wind) > 0.3) chips.push({ kind: "wind", text: Math.abs(cond.wind).toFixed(1).replace(".", ",") + " m/sn" });
    if (cond.rain) chips.push({ kind: "rain", text: "YAĞMUR" });
    chips.push({ kind: "diff", text: "ZORLUK" });
    chips.forEach(function (ch) {
      c.font = A.font(11, 900);
      var extra = ch.kind === "diff" ? 34 : 22;
      var w = c.measureText(ch.text).width + 18 + extra;
      A.pill(c, x - w, y, w, 24, "rgba(9,11,32,0.72)");
      c.fillStyle = "#FFFFFF";
      c.textAlign = "left";
      var ix = x - w + 10;
      if (ch.kind === "wind") {
        // rüzgâr oku
        var dir = Math.sign(cond.wind);
        c.strokeStyle = "#7DD3FC";
        c.fillStyle = "#7DD3FC";
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(ix + 7 - dir * 7, y + 12);
        c.lineTo(ix + 7 + dir * 5, y + 12);
        c.stroke();
        c.beginPath();
        c.moveTo(ix + 7 + dir * 9, y + 12);
        c.lineTo(ix + 7 + dir * 4, y + 8);
        c.lineTo(ix + 7 + dir * 4, y + 16);
        c.closePath();
        c.fill();
        c.fillStyle = "#FFFFFF";
        c.fillText(ch.text, ix + 20, y + 12.5);
      } else if (ch.kind === "rain") {
        c.strokeStyle = "#93C5FD";
        c.lineWidth = 1.6;
        for (var k = 0; k < 3; k++) {
          c.beginPath();
          c.moveTo(ix + 3 + k * 5, y + 7);
          c.lineTo(ix + k * 5, y + 17);
          c.stroke();
        }
        c.fillText(ch.text, ix + 20, y + 12.5);
      } else {
        c.fillStyle = "rgba(255,255,255,0.8)";
        c.fillText(ch.text, ix, y + 12.5);
        var lv = 1 + Math.round(opp.diff * 4);
        for (var j = 0; j < 5; j++) {
          c.fillStyle = j < lv ? (lv >= 4 ? P.bad : GOLD) : "rgba(255,255,255,0.2)";
          c.fillRect(x - 10 - (5 - j) * 6, y + 15 - j * 2, 4, 4 + j * 2);
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
    c.lineWidth = r * 0.16;
    c.lineCap = "round";
    c.lineJoin = "round";
    if (key === "eye") {
      c.beginPath();
      c.moveTo(x - r, y);
      c.quadraticCurveTo(x, y - r * 0.9, x + r, y);
      c.quadraticCurveTo(x, y + r * 0.9, x - r, y);
      c.stroke();
      c.beginPath();
      c.arc(x, y, r * 0.32, 0, Math.PI * 2);
      c.fill();
    } else if (key === "rocket") {
      // ateşli top: daire + arkada alev çizgileri
      c.beginPath();
      c.arc(x + r * 0.3, y - r * 0.3, r * 0.42, 0, Math.PI * 2);
      c.fill();
      for (var i = -1; i <= 1; i++) {
        c.beginPath();
        c.moveTo(x - r * 0.05 + i * r * 0.22, y + r * 0.05 + i * r * -0.22);
        c.lineTo(x - r * 0.75 + i * r * 0.22, y + r * 0.75 + i * r * -0.22);
        c.stroke();
      }
    } else {
      // kale çerçevesi + dışa oklar
      c.beginPath();
      c.moveTo(x - r * 0.6, y + r * 0.5);
      c.lineTo(x - r * 0.6, y - r * 0.35);
      c.lineTo(x + r * 0.6, y - r * 0.35);
      c.lineTo(x + r * 0.6, y + r * 0.5);
      c.stroke();
      [-1, 1].forEach(function (sd) {
        c.beginPath();
        c.moveTo(x + sd * r * 0.75, y + r * 0.1);
        c.lineTo(x + sd * r * 1.05, y + r * 0.1);
        c.moveTo(x + sd * r * 0.95, y - r * 0.05);
        c.lineTo(x + sd * r * 1.08, y + r * 0.1);
        c.lineTo(x + sd * r * 0.95, y + r * 0.25);
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
      c.globalAlpha = on || n > 0 ? 1 : 0.38;
      c.save();
      if (on) {
        c.shadowColor = J.color;
        c.shadowBlur = 16 + 4 * Math.sin(A.time * 8);
      }
      c.beginPath();
      c.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      c.fillStyle = on ? J.color : "rgba(9,11,32,0.78)";
      c.fill();
      c.restore();
      c.lineWidth = 2;
      c.strokeStyle = on ? "#FFFFFF" : J.color;
      c.beginPath();
      c.arc(b.x, b.y, b.r - 1, 0, Math.PI * 2);
      c.stroke();
      drawJokerIcon(c, b.key, b.x, b.y, b.r * 0.5, on ? "#0B1030" : J.color);
      c.font = A.font(8.5, 900);
      c.fillStyle = "rgba(255,255,255,0.9)";
      c.fillText(J.short, b.x, b.y + b.r + 9);
      if (!on) {
        var bx = b.x - b.r * 0.75, by = b.y - b.r * 0.75;
        c.beginPath();
        c.arc(bx, by, 8, 0, Math.PI * 2);
        c.fillStyle = n > 0 ? J.color : "#334155";
        c.fill();
        c.font = A.font(10, 900);
        c.fillStyle = "#0B1030";
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
    var x0, x1, label;
    if (p.mode === "commit") {
      x0 = p.side < 0 ? -gHalf : 0.6;
      x1 = p.side < 0 ? -0.6 : gHalf;
      label = p.side < 0 ? "KALECİ SOLA ATLAYACAK" : "KALECİ SAĞA ATLAYACAK";
    } else if (p.mode === "stay") {
      x0 = -0.9;
      x1 = 0.9;
      label = "KALECİ ORTADA BEKLEYECEK";
    } else {
      x0 = x1 = null;
      label = "KALECİ SON ANDA OKUYACAK · SERT VE KÖŞEYE";
    }
    if (x0 != null) {
      var a = screenOf(x0, 0, 0), b2 = screenOf(x1, gTop, 0);
      var pulse = 0.18 + 0.1 * Math.sin(A.time * 6);
      c.fillStyle = "rgba(56,189,248," + pulse + ")";
      c.fillRect(Math.min(a.x, b2.x), b2.y, Math.abs(b2.x - a.x), a.y - b2.y);
      c.strokeStyle = "rgba(56,189,248,0.9)";
      c.lineWidth = 2;
      c.setLineDash([6, 4]);
      c.strokeRect(Math.min(a.x, b2.x), b2.y, Math.abs(b2.x - a.x), a.y - b2.y);
      c.setLineDash([]);
    }
    var top = screenOf(0, gTop + 0.55, 0);
    c.font = A.font(11, 900);
    var w = c.measureText(label).width + 40;
    A.pill(c, W / 2 - w / 2, top.y - 13, w, 26, "rgba(9,11,32,0.85)");
    drawJokerIcon(c, "eye", W / 2 - w / 2 + 16, top.y, 8, JOKERS.eye.color);
    c.fillStyle = "#FFFFFF";
    c.textAlign = "left";
    c.textBaseline = "middle";
    c.fillText(label, W / 2 - w / 2 + 30, top.y + 0.5);
    c.restore();
  }

  function drawTypeChips(c, dim) {
    var rs = typeRects();
    var sub = { plase: "Dengeli", sert: "Hızlı · savruk", kasik: "Panenka" };
    c.save();
    rs.forEach(function (r) {
      var on = r.key === shotType;
      c.globalAlpha = dim && !on ? 0.35 : 1;
      A.roundRect(c, r.x, r.y, r.w, r.h, 12);
      if (on) {
        var g = c.createLinearGradient(r.x, r.y, r.x, r.y + r.h);
        g.addColorStop(0, "#7B61FF");
        g.addColorStop(1, "#4527D6");
        c.fillStyle = g;
      } else c.fillStyle = "rgba(9,11,32,0.72)";
      c.fill();
      c.strokeStyle = on ? "rgba(255,255,255,0.55)" : LINE;
      c.lineWidth = 1;
      c.stroke();
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.font = A.font(12, 900);
      c.fillStyle = "#FFFFFF";
      c.fillText(TYPES[r.key].label, r.x + r.w / 2, r.y + 15);
      c.font = A.font(9.5, 700);
      c.fillStyle = on ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.55)";
      c.fillText(sub[r.key], r.x + r.w / 2, r.y + 29);
    });
    c.restore();
  }

  function drawHint(c, text, y) {
    c.save();
    c.font = A.font(12, 800);
    var w = c.measureText(text).width + 30;
    var a = 0.75 + 0.25 * Math.sin(A.time * 3);
    c.globalAlpha = a;
    A.pill(c, W / 2 - w / 2, y - 14, w, 28, "rgba(9,11,32,0.72)");
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
    c.globalAlpha = 0.8;
    c.strokeStyle = "rgba(255,255,255,0.35)";
    c.lineWidth = 2;
    c.setLineDash([3, 5]);
    c.beginPath();
    c.moveTo(W / 2 - 46, y);
    c.lineTo(W / 2 + 46, y);
    c.stroke();
    c.setLineDash([]);
    c.fillStyle = "#FFFFFF";
    c.beginPath();
    c.arc(x, y, 9, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = "rgba(255,255,255,0.4)";
    c.lineWidth = 6;
    c.beginPath();
    c.arc(x, y, 15, 0, Math.PI * 2);
    c.stroke();
    c.restore();
    drawHint(c, "Sürükle: nişan al · Bırak: güç", y - 30);
  }

  /* ── güç ── */

  function drawPower(c) {
    var w = Math.min(W - 70, 300), h = 16, x = W / 2 - w / 2, y = H - 98;
    var z = zoneOf(shotType);
    c.save();
    c.font = A.font(11, 900);
    c.textAlign = "left";
    c.textBaseline = "alphabetic";
    c.fillStyle = "rgba(255,255,255,0.7)";
    c.fillText("ZAYIF", x, y - 8);
    c.textAlign = "right";
    c.fillText("YÜKSEK", x + w, y - 8);
    c.textAlign = "center";
    c.fillStyle = GOLD;
    var pulse = 1 + 0.06 * Math.sin(A.time * 10);
    c.save();
    c.translate(W / 2, y - 24);
    c.scale(pulse, pulse);
    c.font = A.font(18, 900);
    c.fillText("DOKUN!", 0, 0);
    c.restore();
    A.roundRect(c, x - 3, y - 3, w + 6, h + 6, 11);
    c.fillStyle = "rgba(9,11,32,0.8)";
    c.fill();
    var g = c.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, "rgba(148,163,184,0.45)");
    g.addColorStop(z[0], "rgba(148,163,184,0.45)");
    g.addColorStop(Math.min(1, z[1] + 0.02), "rgba(251,191,36,0.55)");
    g.addColorStop(1, "rgba(244,63,94,0.85)");
    A.roundRect(c, x, y, w, h, 8);
    c.fillStyle = g;
    c.fill();
    // yeşil bölge
    A.roundRect(c, x + w * z[0], y - 1, w * (z[1] - z[0]), h + 2, 5);
    c.fillStyle = "rgba(52,211,153,0.95)";
    c.fill();
    c.strokeStyle = "rgba(255,255,255,0.8)";
    c.lineWidth = 1.5;
    c.stroke();
    // ibre
    var nx = x + w * powerV;
    var good = powerQuality(shotType, powerV) >= 1;
    c.shadowColor = good ? "rgba(52,211,153,0.9)" : "rgba(255,255,255,0.6)";
    c.shadowBlur = 10;
    c.fillStyle = "#FFFFFF";
    A.roundRect(c, nx - 3, y - 7, 6, h + 14, 3);
    c.fill();
    c.restore();
  }

  /* ── kalecilik ── */


  /* ── atış kartı (sol alt) ── */

  function drawShooterCard(c) {
    var x = 14, y = 112, w = 168, h = 46;
    c.save();
    glass(c, x, y, w, h, 12, "rgba(9,11,32,0.6)");
    avatar(c, x + 23, y + h / 2, 16, shooter);
    c.textAlign = "left";
    c.textBaseline = "middle";
    c.font = A.font(12, 900);
    c.fillStyle = "#FFFFFF";
    c.fillText(fit(c, (shooter.shirt ? shooter.shirt + " · " : "") + shooter.short, w - 50), x + 46, y + 16);
    // isabet / şut / falso küçük çubuklar
    var keys = [["accuracy", "İSB"], ["power", "ŞUT"], ["curve", "FLS"]];
    keys.forEach(function (k, i) {
      var v = attr(shooter, k[0], 78);
      var bx = x + 46 + i * 39, by = y + 31;
      c.font = A.font(8, 900);
      c.fillStyle = "rgba(255,255,255,0.55)";
      c.fillText(k[1], bx, by);
      c.fillStyle = "rgba(255,255,255,0.15)";
      c.fillRect(bx, by + 6, 32, 3);
      c.fillStyle = v >= 85 ? GOLD : P.good;
      c.fillRect(bx, by + 6, 32 * ((v - 50) / 49), 3);
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
    var pop = A.easeOutBack(t / 0.35);
    var good = lastKick.good;
    var label = LABELS[lastKick.result] || "";
    if (lastKick.who === "op" && lastKick.result === "gol") label = "GOL";
    c.save();
    c.globalAlpha = fade;
    var y = H * 0.44;
    A.bigText(c, label, W / 2, y, (good ? 56 : 44) * (0.5 + 0.5 * pop), good ? GOLD : "#FFFFFF", {
      stroke: good ? "rgba(60,36,200,0.95)" : "rgba(160,20,50,0.9)",
    });
    if (lastKick.gain) A.bigText(c, "+" + lastKick.gain, W / 2, y + 46, 24 * pop, "#FFFFFF");
    if (lastKick.tags.length) {
      c.font = A.font(12, 900);
      c.textAlign = "center";
      var tags = lastKick.tags.join("  ·  ");
      var tw = c.measureText(tags).width + 26;
      A.pill(c, W / 2 - tw / 2, y + 66, tw, 26, "rgba(69,39,214,0.9)");
      c.fillStyle = "#FFFFFF";
      c.textBaseline = "middle";
      c.fillText(tags, W / 2, y + 79.5);
    }
    c.restore();
  }
  function drawReplayBadge(c) {
    c.save();
    var x = W - 104, y = 84;
    A.pill(c, x, y, 90, 26, "rgba(9,11,32,0.78)");
    c.fillStyle = Math.sin(A.time * 6) > 0 ? "#EF4444" : "rgba(239,68,68,0.4)";
    c.beginPath();
    c.arc(x + 15, y + 13, 4.5, 0, Math.PI * 2);
    c.fill();
    c.font = A.font(11, 900);
    c.fillStyle = "#FFFFFF";
    c.textAlign = "left";
    c.textBaseline = "middle";
    c.fillText("TEKRAR", x + 27, y + 13.5);
    c.font = A.font(10, 700);
    c.fillStyle = "rgba(255,255,255,0.6)";
    c.textAlign = "center";
    c.fillText("Geçmek için dokun", W / 2, H - 40);
    c.restore();
  }

  /* ── tanıtım, sıra, maç sonu ── */

  function drawIntro(c) {
    var t = stateT;
    var inT = A.easeOutBack(t / 0.45);
    var out = A.clamp((INTRO - t) / 0.3, 0, 1);
    var kp = opp.keeper;
    c.save();
    c.globalAlpha = out;
    var cw = Math.min(W - 28, 350), ch = 210;
    var x = W / 2 - cw / 2, y = H * 0.5 - ch / 2;
    c.translate(W / 2, y + ch / 2);
    c.scale(0.88 + 0.12 * inT, 0.88 + 0.12 * inT);
    c.translate(-W / 2, -(y + ch / 2));
    glass(c, x, y, cw, ch, 20, "rgba(9,11,32,0.88)");
    var g = c.createLinearGradient(x, y, x + cw, y);
    g.addColorStop(0, kitOf(shooter).primary);
    g.addColorStop(1, kitOf(kp).primary);
    c.fillStyle = g;
    c.globalAlpha = out * 0.9;
    c.fillRect(x + 20, y + 44, cw - 40, 2);
    c.globalAlpha = out;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.font = A.font(11, 900);
    c.fillStyle = GOLD;
    if ("letterSpacing" in c) c.letterSpacing = "2px";
    c.fillText("SERİ PENALTI · " + stageName(matchIdx), W / 2, y + 26);
    if ("letterSpacing" in c) c.letterSpacing = "0px";
    badge(c, x + cw * 0.22, y + 92, 46, shooter);
    badge(c, x + cw * 0.78, y + 92, 46, kp);
    c.font = A.font(20, 900);
    c.fillStyle = "rgba(255,255,255,0.6)";
    c.fillText("VS", W / 2, y + 92);
    c.font = A.font(13, 900);
    c.fillStyle = "#FFFFFF";
    c.fillText(fit(c, teamName(shooter), cw * 0.42), x + cw * 0.22, y + 136);
    c.fillText(fit(c, teamName(kp), cw * 0.42), x + cw * 0.78, y + 136);
    c.font = A.font(11, 700);
    c.fillStyle = "rgba(255,255,255,0.7)";
    c.fillText(fit(c, "Atıcı: " + shooter.short, cw * 0.44), x + cw * 0.22, y + 156);
    c.fillText(fit(c, "Kaleci: " + kp.short, cw * 0.44), x + cw * 0.78, y + 156);
    var saves = kp.stats && kp.stats.saves ? kp.stats.saves + " kurtarış · " : "";
    c.fillStyle = "rgba(255,255,255,0.55)";
    c.fillText(saves + "Refleks " + attr(kp, "reflex", 75) + "  ·  Maç " + (matchIdx + 1) + "/" + keepers.length, W / 2, y + 186);
    c.restore();
  }

  function drawTurn(c) {
    var t = stateT;
    var inT = A.easeOut(t / 0.3);
    var out = A.clamp((TURN - t) / 0.25, 0, 1);
    c.save();
    c.globalAlpha = out;
    var y = H * 0.58;
    var bw = W;
    var g = c.createLinearGradient(0, 0, bw, 0);
    g.addColorStop(0, "rgba(69,39,214,0)");
    g.addColorStop(0.18, "rgba(69,39,214,0.9)");
    g.addColorStop(0.82, "rgba(69,39,214,0.9)");
    g.addColorStop(1, "rgba(69,39,214,0)");
    c.fillStyle = g;
    c.fillRect((1 - inT) * -W * 0.3, y - 34, bw, 68);
    c.textAlign = "center";
    c.textBaseline = "middle";
    A.bigText(c, "SIRA SENDE", W / 2, y - 6, 28, "#FFFFFF");
    c.font = A.font(12, 800);
    c.fillStyle = "rgba(255,255,255,0.85)";
    var n = match.me.length + 1;
    c.fillText((match.sudden ? "Ani ölüm · " : n + ". atış · ") + "Atıcın " + shooter.short, W / 2, y + 20);
    c.restore();
  }

  /** Rakibin atışı: atıcı kartı, kısa bekleyiş, sonuç açılır. */
  function drawOppKick(c) {
    var t = stateT;
    var inT = A.easeOutBack(Math.min(1, t / 0.35));
    var out = A.clamp((OPP_KICK - t) / 0.3, 0, 1);
    var pk = oppShot.taker;
    var kit = kitOf(pk);
    var cw = Math.min(W - 28, 330), ch = 132;
    var x = W / 2 - cw / 2, y = H * 0.56 - ch / 2;
    c.save();
    c.globalAlpha = out;
    c.translate(W / 2, y + ch / 2);
    c.scale(0.88 + 0.12 * inT, 0.88 + 0.12 * inT);
    c.translate(-W / 2, -(y + ch / 2));
    glass(c, x, y, cw, ch, 18, "rgba(9,11,32,0.88)");
    c.fillStyle = kit.primary;
    c.fillRect(x, y + 14, 5, ch - 28);
    avatar(c, x + 42, y + 50, 24, pk);
    c.textAlign = "left";
    c.textBaseline = "middle";
    c.font = A.font(10, 900);
    c.fillStyle = GOLD;
    if ("letterSpacing" in c) c.letterSpacing = "1.5px";
    c.fillText("RAKİP ATIŞI · " + (match.sudden ? "ANİ ÖLÜM" : match.op.length + ". ATIŞ"), x + 78, y + 30);
    if ("letterSpacing" in c) c.letterSpacing = "0px";
    c.font = A.font(16, 900);
    c.fillStyle = "#FFFFFF";
    c.fillText(fit(c, (pk.shirt ? pk.shirt + " · " : "") + (pk.short || pk.name), cw - 96), x + 78, y + 52);
    c.font = A.font(11, 700);
    c.fillStyle = "rgba(255,255,255,0.6)";
    c.fillText(fit(c, teamName(pk), cw - 96), x + 78, y + 70);
    // sonuç: kısa bekleyişten sonra açılır
    var rv = A.clamp((t - 0.75) / 0.25, 0, 1);
    var gol = oppShot.result === "gol";
    if (rv <= 0) {
      for (var i = 0; i < 3; i++) {
        c.fillStyle = "rgba(255,255,255," + (0.3 + 0.7 * Math.max(0, Math.sin(A.time * 8 - i))) + ")";
        c.beginPath();
        c.arc(W / 2 - 12 + i * 12, y + 104, 3.5, 0, Math.PI * 2);
        c.fill();
      }
    } else {
      c.globalAlpha = out * rv;
      var label = gol ? "GOL" : oppShot.result === "kurtaris" ? "KALECİMİZ KURTARDI!" : oppShot.result === "direk" ? "DİREK!" : "KAÇIRDI!";
      c.font = A.font(gol ? 20 : 17, 900);
      c.textAlign = "center";
      c.fillStyle = gol ? P.bad : P.good;
      c.fillText(label + (gol ? "" : "  +25"), W / 2, y + 104);
    }
    c.restore();
  }

  function drawMatchEnd(c) {
    var t = stateT;
    var inT = A.easeOutBack(t / 0.5);
    var won = endResult === "won";
    var gm = goalsOf(match.me), go = goalsOf(match.op);
    c.save();
    var cw = Math.min(W - 28, 340), ch = 196;
    var x = W / 2 - cw / 2, y = H - ch - 28;
    c.translate(W / 2, y + ch / 2);
    c.scale(0.85 + 0.15 * inT, 0.85 + 0.15 * inT);
    c.translate(-W / 2, -(y + ch / 2));
    glass(c, x, y, cw, ch, 20, "rgba(9,11,32,0.88)");
    c.textAlign = "center";
    c.textBaseline = "middle";
    A.bigText(c, champion ? "ŞAMPİYON!" : won ? "KAZANDIN!" : "ELENDİN", W / 2, y + 40, champion ? 36 : 34, won ? GOLD : "#FFFFFF", {
      stroke: won ? "rgba(60,36,200,0.95)" : "rgba(160,20,50,0.9)",
    });
    badge(c, x + 60, y + 96, 34, shooter);
    badge(c, x + cw - 60, y + 96, 34, opp.keeper);
    c.font = A.font(34, 900);
    c.fillStyle = "#FFFFFF";
    c.fillText(gm + " – " + go, W / 2, y + 98);
    c.font = A.font(11, 700);
    c.fillStyle = "rgba(255,255,255,0.6)";
    c.fillText(match.sudden ? "ani ölümde" : "seri penaltılarda", W / 2, y + 126);
    if (won && endGain) {
      c.font = A.font(16, 900);
      c.fillStyle = GOLD;
      c.fillText("+" + endGain.toLocaleString("tr-TR") + " puan", W / 2, y + 150);
    }
    c.font = A.font(11.5, 800);
    c.fillStyle = "rgba(255,255,255,0.8)";
    var nextLine = won && !champion ? "Sıradaki: " + teamName(keepers[Math.min(matchIdx + 1, keepers.length - 1)]) + " · " + stageName(matchIdx + 1) : champion ? "Ligin bütün kalecilerini geçtin" : "Rakip: " + teamName(opp.keeper);
    c.fillText(fit(c, nextLine, cw - 30), W / 2, y + 176);
    c.restore();
  }

  function drawLine(c) {
    if (!line || state === "attract") return;
    var life = 2.8;
    if (lineT > life) return;
    var inT = A.easeOut(lineT / 0.25);
    var out = A.clamp((life - lineT) / 0.35, 0, 1);
    c.save();
    c.globalAlpha = out;
    c.font = A.font(12.5, 700);
    var maxW = W - 32;
    var text = fit(c, line.text, maxW - 34);
    var tw = Math.min(maxW, c.measureText(text).width + 34);
    var x = W / 2 - tw / 2, y = 112 - (1 - inT) * 10;
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
    A.drawFloaters(c, dt);
    if (state === "attract" || state === "over") return;
    drawScoreboard(c);
    if (state !== "intro") drawPoints(c);
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
    } else if (state === "runup") drawKeeperEye(c); else if (state === "oppKick") drawOppKick(c);
    else if (state === "result") {
      if (inReplay()) drawReplayBadge(c);
      else drawResult(c);
    } else if (state === "matchEnd") drawMatchEnd(c);
    if (state !== "intro" && state !== "matchEnd" && !inReplay()) drawLine(c);
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
      gl: !!R,
    };
  }

  A.register({ resize: resize, start: start, update: update, render: render, down: down, move: move, up: up, debug: debug, setRoster: setRoster });
})();
