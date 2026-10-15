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
 * MAÇ: klasik seri penaltı. Sırayla beşer atış (önce sen atarsın); bir taraf
 * kalan atışlarla yetişemeyecek duruma düşünce maç biter. Beşte eşitlikte ANİ
 * ÖLÜM. Kazanırsan merdivende sıradaki kulübe geçersin (kalecisi ligin daha çok
 * kurtarış yapan kalecisi); kaybedersen tur biter. Son kulübü geçen ŞAMPİYON.
 *
 * ATIŞ (sen atarken) — iki dokunuş:
 *   1. NİŞAN: parmağını sürükle, kaledeki nişangâh hareket eder. Nişanın
 *      çevresindeki halka İSABET RİSKİDİR: köşeye ve direğe yaklaştıkça
 *      vuruş türü ve baskıyla büyür (direkten dönebilir, auta gidebilir).
 *   2. GÜÇ: parmağını kaldırınca güç çubuğu salınır; yeşil bölgede dokun.
 *      Fazlası topu yükseltir (üstten auta), azı yavaşlatır (kaleci yetişir).
 *   Vuruş türü (altta): PLASE (dengeli), SERT (hızlı ama savruk), KAŞIK
 *   (Panenka — erken yatan kaleciyi rezil eder, bekleyen kaleci kolayca alır).
 *
 * KALECİLİK (rakip atarken): parmağını uçmak istediğin yöne kaydır (kısa
 * kaydırma kısa adım, uzun kaydırma tam uçuş); dokunmak ortada kalmaktır.
 * Atıcı topa vurmadan hemen önce zaman YAVAŞLAR: topu görüp tepki verebilirsin.
 * Erken yatarsan kurnaz atıcı boş köşeye vurur. Her atıcının bir sevdiği köşe
 * vardır ve koşunun sonunda kalçası o yöne açılır — oku.
 *
 * RAKİP KALECİ: vuruş anında ya bir köşeye yatar (senin geçmiş atışlarından
 * öğrendiği köşeye) ya da topu okuyup tepki verir. Uçuşu fizikseldir: gövdesi
 * ve eldivenleri topa değerse kurtarır; köşeye yeterince hızlı giden top
 * yetişilmezdir. Ligdeki kurtarış sayısı (refleks) tepki süresini kısaltır.
 *
 * PUAN: gol 100 (+50 köşe, +50 yüksek, doksana +150, kaşık +150, ani ölüm
 * +50) · kurtarış 150 · rakip kaçırırsa 25 · maç galibiyeti 400 + 200 × maç
 * sırası · beşte beş +300 · şampiyonluk +1500.
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
  var RUNUP = 0.85; // atıcının koşusu (sn)
  var INTRO = 2.6, TURN = 1.0, MATCH_END = 3.2;
  var REPLAY_AT = 1.1, REPLAY_LEN = 2.6;
  var SLOW = 0.55; // kalecilikte vuruş anı yavaş çekimi (oyun mekaniği)

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
  var myKeeperIn = null;
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
    myKeeperIn = r && validPerson(r.myKeeper) ? r.myKeeper : null;
    if (state !== "attract" && state !== "over") return; // maç ortasında kadro değişmez
    opp = opponentOf(0);
    me = myKeeperOf();
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

  /** Senin kalecin: kadrodan (aynı kulüpten) ya da kulübünün forma renginde bir kaleci. */
  function myKeeperOf() {
    if (myKeeperIn) return myKeeperIn;
    var own = keepers.filter(function (k) {
      return sameTeam(k, shooter);
    })[0];
    if (own) return own;
    var team = shooter.team || DEFAULT_SHOOTER.team;
    return makePerson(-100, personName(hashStr(teamName(shooter)) + 3), team, { shirt: 1, attrs: { reflex: 76 } });
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

  // attract | intro | turn | aim | power | runup | flight | keepReady | keepRun | keepFlight | result | matchEnd | over
  var state = "attract";
  var stateT = 0;
  var opp = opponentOf(0);
  var me = myKeeperOf();
  var matchIdx = 0;
  var match = null; // { me: ['g'|'x'], op: ['g'|'x'], sudden, turn: 'shoot'|'keep' }
  var points = 0, scoreBump = 0;
  var tally = { goals: 0, shots: 0, saves: 0, faced: 0, wins: 0, perfect: 0 };
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

  // Kalecilik girdisi
  var swipe = null;
  var kickAt = 0; // atıcının topa değdiği sim zamanı
  var takerNow = null, takerPlan = null;

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
    plase: { label: "PLASE", sigma: 0.15, zone: [0.52, 0.76], speed: [19, 24] },
    sert: { label: "SERT", sigma: 0.3, zone: [0.7, 0.88], speed: [25, 30] },
    kasik: { label: "KAŞIK", sigma: 0.12, zone: [0.28, 0.46], speed: [9.5, 11] },
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
  /** Güç kalitesi: yeşil bölgede 1; dışında uzaklıkla düşer. */
  function powerQuality(type, v) {
    var z = TYPES[type].zone;
    if (v >= z[0] && v <= z[1]) return 1;
    var d = v < z[0] ? z[0] - v : v - z[1];
    return A.clamp(1 - d * 3.2, 0, 1);
  }
  /** Nişanın sapma (metre, 1σ): türe, isabet özelliğine, kenara yakınlığa, baskıya ve güce göre. */
  function sigmaOf(type, q, ax, ay) {
    var acc = norm(attr(shooter, "accuracy", 78));
    var perk = A.perks && A.perks.penalti ? A.clamp(Number(A.perks.penalti.aimBonus) || 0, 0, 0.1) : 0;
    var edge = Math.max(0, Math.abs(ax) - 2.2) * 0.12 + Math.max(0, ay - 1.7) * 0.1;
    var base = TYPES[type].sigma * (1 - 0.22 * acc) + edge;
    return base * (1 + 1.4 * (1 - q)) * (1 + 0.25 * pressure()) * (1 - perk * 2);
  }
  /** Gidiş noktasından hız vektörü: yerçekimiyle tam hedefe varan atış. */
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
    var reach = A.clamp(need - ARM * 0.75, 0, DIVE_REACH);
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
  function stepBall(dt) {
    var b = ball;
    if (!b.live) return;
    b.t += dt;
    if (!b.caught) {
      b.vy -= GRAV * dt;
      b.vx += b.curl * dt;
      // hava direnci (hafif)
      var sp = Math.hypot(b.vx, b.vy, b.vz);
      var drag = 1 - 0.006 * sp * dt;
      b.vx *= drag;
      b.vy *= drag;
      b.vz *= drag;
      var pz = b.z;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.z += b.vz * dt;
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
    tally = { goals: 0, shots: 0, saves: 0, faced: 0, wins: 0, perfect: 0 };
    champion = false;
    history = [];
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
    me = myKeeperOf();
    match = { me: [], op: [], opDirs: [], sudden: false, turn: "shoot" };
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
    swipe = null;
    dragFrom = null;
    powerT = 0;
    powerV = 0;
    slow = 1;
    takerPlan = null;
    replay = null;
    recording = [];
    lastContact = -1;
    netReset();
    simTime = 0;
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
    match.turn = match.me.length === match.op.length ? "shoot" : "keep";
    resetKick();
    if (match.turn === "shoot") {
      gk.reflex = attr(opp.keeper, "reflex", 75);
      aim.x = 0;
      aim.y = 1.1;
    } else {
      gk.reflex = attr(me, "reflex", 76);
      takerNow = opp.takers[match.op.length % opp.takers.length];
    }
    if (R) placeCast();
    setState("turn");
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
      }
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
        saves: tally.saves,
        faced: tally.faced,
        perfect: tally.perfect,
        champion: champion,
        keeper: Math.min(matchIdx, keepers.length - 1) + 1,
        keepers: keepers.length,
      },
    });
  }

  /* ─────────────── atış (sen) ─────────────── */

  function lockAim() {
    setState("power");
    powerT = 0;
  }

  /** Güç salınımı: 0 → 1 → 0 (baskı altında hızlanır). */
  function powerAt(t) {
    var period = 1.25 - 0.2 * pressure();
    return 0.5 - 0.5 * Math.cos((t / period) * Math.PI * 2);
  }

  function takeShot(v) {
    var tp = TYPES[shotType];
    var q = powerQuality(shotType, v);
    var sig = sigmaOf(shotType, q, aim.x, aim.y);
    var tx = aim.x + A.gauss(0, sig);
    var ty = aim.y + A.gauss(0, sig * 0.7);
    var z = tp.zone;
    if (v > z[1]) ty += (v - z[1]) * 4.2; // fazla güç: top yükselir
    if (v < z[0]) ty -= (z[0] - v) * 1.2;
    ty = Math.max(BALL_R, ty);
    var pw = norm(attr(shooter, "power", 78));
    var f = A.clamp(v, 0, 1);
    var speed = (tp.speed[0] + (tp.speed[1] - tp.speed[0]) * f) * (1 + 0.04 * pw) * (0.75 + 0.25 * q);
    if (shotType === "kasik") {
      tx = aim.x * 0.35 + A.gauss(0, sig);
      ty = Math.max(1.0, ty);
    }
    var curl = shotType === "plase" ? -Math.sign(tx) * 1.6 * (1 + 0.5 * norm(attr(shooter, "curve", 78))) : 0;
    shot = { type: shotType, tx: tx, ty: ty, speed: speed, q: q, v: v, curl: curl, aimX: aim.x, aimY: aim.y };
    tally.shots += 1;
    history.push(aim.x < -1 ? -1 : aim.x > 1 ? 1 : 0);
    setState("runup");
  }

  /** Rakip kalecinin kararı: vuruş anında yat ya da oku. */
  function keeperDecides() {
    var k = gk;
    var d = opp.diff;
    var rf = norm(k.reflex);
    // senin geçmişin: sol / orta / sağ sıklığı (Laplace)
    var c = { "-1": 1, "0": 0.6, "1": 1 };
    for (var i = Math.max(0, history.length - 7); i < history.length - 1; i++) c[history[i]] += 1;
    var commit = 0.5 + 0.25 * d;
    if (Math.random() < commit) {
      var sharp = 1 + 2 * d;
      var wl = Math.pow(c["-1"], sharp), wc = Math.pow(c["0"], sharp) * 0.5, wr = Math.pow(c["1"], sharp);
      var r = Math.random() * (wl + wc + wr);
      var side = r < wl ? -1 : r < wl + wc ? 0 : 1;
      if (side === 0) {
        k.stay = true;
        k.set = 1;
      } else {
        var lead = A.rand(-0.06, 0.04); // vuruştan hemen önce ya da hemen sonra yatar
        k.plan = { at: kickAt + lead, tx: side * A.rand(2.0, 2.9), ty: A.rand(0.45, 1.7) };
      }
    } else {
      var react = 0.3 - 0.11 * d - 0.04 * rf;
      k.plan = { at: kickAt + react, read: true };
    }
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

  /** Rakip atıcının planı: sevdiği köşe, erken yatana karşı kurnazlık, isabet. */
  function planTaker() {
    var tk = takerNow;
    var p = tk.p;
    var d = opp.diff;
    var side = Math.random() < tk.love ? tk.side : -tk.side;
    var r = Math.random();
    var type = r < 0.05 + 0.06 * d ? "kasik" : r < 0.4 ? "sert" : "plase";
    var high = Math.random() < 0.25 + tk.high * 0.35;
    var tx = side * A.rand(1.8, 3.3);
    var ty = high ? A.rand(1.35, 2.15) : A.rand(0.2, 0.9);
    if (type === "kasik") {
      tx = A.rand(-0.5, 0.5);
      ty = A.rand(1.2, 1.7);
    }
    var tell = Math.random() < 0.72 - 0.25 * d ? side : -side; // kalça açısı: çoğunlukla dürüst
    takerPlan = { side: side, type: type, tx: tx, ty: ty, tell: tell, switched: false };
  }
  function takerFinal() {
    var tp = takerPlan;
    var tk = takerNow;
    // erken yatan kaleciyi gören kurnaz atıcı boş köşeye vurur
    if (gk.dive && gk.dive.t0 < kickAt - 0.08 && !tp.switched && Math.random() < tk.cunning + 0.25) {
      var away = gk.dive.dx > 0 ? -1 : 1;
      tp.tx = away * A.rand(1.6, 3.0);
      tp.ty = A.rand(0.3, 1.2);
      tp.type = "plase";
      tp.switched = true;
    } else if (gk.stay && gk.stayAt < kickAt - 0.08 && tp.type === "kasik") {
      tp.type = "plase";
      tp.tx = tk.side * A.rand(2, 3);
    }
    var acc = norm(attr(tk.p, "accuracy", 76));
    var sig = TYPES[tp.type].sigma * (1.05 - 0.25 * acc) * (1 + 0.3 * pressure());
    var tx = tp.tx + A.gauss(0, sig), ty = Math.max(BALL_R, tp.ty + A.gauss(0, sig * 0.7));
    var pw = norm(attr(tk.p, "power", 76));
    var sp = TYPES[tp.type].speed;
    var speed = A.rand(sp[0], sp[1]) * (1 + 0.04 * pw);
    var curl = tp.type === "plase" ? -Math.sign(tx) * 1.4 : 0;
    return { tx: tx, ty: ty, speed: speed, curl: curl, type: tp.type };
  }

  /** Kaydırma → uçuş: yön ekranda (kaleci kamerası kaleye ters bakar: sağ = −x). */
  function keeperSwipe(dx, dy, len) {
    if (gk.dive || gk.stay) return;
    var k = gk;
    if (len < 22) {
      k.stay = true;
      k.stayAt = simTime;
      k.set = 1;
      return;
    }
    var wx = -dx / len, wy = -dy / len;
    var amt = A.clamp(len / (W * 0.32), 0.4, 1);
    // yön → hedef nokta (kaleci merkezinden)
    var reach = (DIVE_REACH + ARM * 0.6) * amt;
    var tx = k.x + wx * reach * 1.15, ty = A.clamp(0.98 + wy * reach, 0.15, 2.4);
    var dxx = tx - k.x, dyy = ty - 0.98;
    var need = Math.hypot(dxx, dyy) || 1;
    k.dive = { t0: simTime, dx: dxx / need, dy: dyy / need, reach: A.clamp(need - ARM * 0.5, 0.2, DIVE_REACH), dur: diveDur(k) };
    A.haptic("light");
  }

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
  function settle(result) {
    var mine = match.turn === "shoot";
    var scored = result === "gol";
    var tags = [];
    var gain = 0;
    if (mine) {
      match.me.push(scored ? "g" : "x");
      if (scored) {
        tally.goals += 1;
        gain = 100;
        var L = shot ? { x: ball.x, y: ball.y } : { x: 0, y: 0 };
        var corner = Math.abs(L.x) > 2.4, high = L.y > 1.65;
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
    } else {
      match.op.push(scored ? "g" : "x");
      // kaleci kamerasından yön: dünyada +x ekranın solu
      var sx = shot ? shot.tx : 0;
      match.opDirs.push(sx > 0.8 ? -1 : sx < -0.8 ? 1 : 0);
      tally.faced += 1;
      if (result === "kurtaris") {
        tally.saves += 1;
        gain = 150;
        tags.push("KURTARIŞ");
      } else if (!scored) {
        gain = 25;
        tags.push("BASKI");
      }
    }
    points += gain;
    if (gain) scoreBump = 1;
    var good = mine ? scored : !scored;
    lastKick = { who: mine ? "me" : "op", result: result, tags: tags, gain: gain, good: good };
    if (good) {
      excite = 1;
      A.sound("cheer");
      A.haptic("success");
      confetti(mine ? kitOf(shooter) : kitOf(me));
      A.shake(mine ? 6 : 4);
    } else {
      A.sound("groan");
      A.haptic("warning");
    }
    say(result, mine);
    // Tekrar: senin golün ya da senin kurtarışın
    resultLen = 1.7;
    if (good && result !== "aut" && result !== "direk" && !A.reduceMotion && R && recording.length > 10) {
      replay = { frames: recording, mine: mine };
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

  function say(result, mine) {
    var S = mine ? shooter.short : takerNow.p.short;
    var K = mine ? opp.keeper.short : me.short;
    var list;
    if (result === "gol") {
      list = mine
        ? lastKick.tags.indexOf("KAŞIK") >= 0
          ? ["Kaşık! " + S + " kaleciyi erken yatırdı!", "Panenka! Soğukkanlılığın dik âlâsı: " + S]
          : lastKick.tags.indexOf("DOKSAN") >= 0
            ? ["Doksana! " + K + " sadece izledi.", S + " örümcek ağlarını aldı!"]
            : [S + " affetmedi, gol!", "Ağlar havalandı! " + S, S + " kaleciyi ters köşeye yatırdı."]
        : [S + " gol buldu.", S + " köşeyi buldu.", "Rakip boş geçmedi: " + S];
    } else if (result === "kurtaris") {
      list = mine ? [K + " uçtu, kurtardı!", K + " köşeyi okudu!", "Müthiş refleks: " + K] : ["DEV KURTARIŞ! " + K + "!", K + " köşeyi okudu!", K + " geçit vermedi!"];
    } else if (result === "direk") {
      list = [S + " direği sarstı!", "Direkten döndü!"];
    } else {
      list = [S + " auta gönderdi.", "Top tribünlere gitti!"];
    }
    line = { text: A.pick(list), good: mine ? result === "gol" : result !== "gol" };
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
        gk.crouch = 0.5 + 0.5 * Math.sin(A.time * 3.2);
        if (stateT >= TURN) {
          if (match.turn === "shoot") {
            setState("aim");
            A.sound("whistle");
          } else {
            planTaker();
            setState("keepReady");
          }
        }
        return;
      case "aim":
        gk.crouch = 0.5 + 0.5 * Math.sin(A.time * 3.4);
        gk.x = Math.sin(A.time * 1.3) * 0.08;
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
      case "keepReady":
        gk.crouch = 0.55 + 0.45 * Math.sin(A.time * 3.4);
        if (stateT >= 0.7) {
          setState("keepRun");
          kickAt = simTime + RUNUP;
          A.sound("whistle");
        }
        return;
      case "keepRun":
        if (!gk.dive && !gk.stay) gk.crouch = Math.min(1, gk.crouch + dt * 1.5);
        // vuruşa yaklaşınca zaman yavaşlar (tepki verebilesin)
        slow = simTime > kickAt - 0.16 ? SLOW : 1;
        if (simTime >= kickAt) strikeTaker();
        return;
      case "flight":
      case "keepFlight":
        if (state === "flight") keeperThink();
        stepBall(sdt);
        record();
        if (state === "keepFlight" && (ball.z < -0.5 || ball.vz > 0 || ball.goal)) slow = A.approach(slow, 1, dt * 2.5);
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
      case "matchEnd":
        if (stateT >= MATCH_END) {
          if (endResult === "won" && !champion) startMatch(matchIdx + 1);
          else finish();
        }
        return;
    }
  }

  function strikeMine() {
    kickAt = simTime;
    ball = newBall();
    launch(ball, shot.tx, shot.ty, shot.speed, shot.curl, shot.type === "kasik");
    keeperDecides();
    keeperThink();
    setState("flight");
    A.sound("kick");
    A.haptic("medium");
    kickDust();
  }
  function strikeTaker() {
    var s = takerFinal();
    shot = { type: s.type, tx: s.tx, ty: s.ty };
    ball = newBall();
    launch(ball, s.tx, s.ty, s.speed, s.curl, s.type === "kasik");
    setState("keepFlight");
    A.sound("kick");
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
    if (state === "keepRun" || state === "keepFlight" || state === "keepReady") {
      swipe = { x: p.x, y: p.y, t: A.time };
    }
  }
  function move(p) {
    if (state === "aim" && dragFrom) {
      var dx = p.x - dragFrom.x, dy = p.y - dragFrom.y;
      dragFrom.moved = Math.max(dragFrom.moved, Math.hypot(dx, dy));
      aim.x = A.clamp(dragFrom.ax + (dx / W) * AIM_SENS_X, -HALF - 0.9, HALF + 0.9);
      aim.y = A.clamp(dragFrom.ay - (dy / H) * AIM_SENS_Y, 0.15, GOAL_H + 0.8);
      return;
    }
    if (swipe) swipe.cur = { x: p.x, y: p.y };
    if (swipe && (state === "keepRun" || state === "keepFlight")) {
      var sx = p.x - swipe.x, sy = p.y - swipe.y;
      var len = Math.hypot(sx, sy);
      if (len > W * 0.12) {
        keeperSwipe(sx, sy, len);
        swipe = null;
      }
    }
  }
  function up(p) {
    if (state === "aim" && dragFrom) {
      var moved = dragFrom.moved;
      dragFrom = null;
      if (moved > 10) lockAim();
      return;
    }
    if (swipe && (state === "keepRun" || state === "keepFlight" || state === "keepReady")) {
      var sx = p.x - swipe.x, sy = p.y - swipe.y;
      var len = Math.hypot(sx, sy);
      if (state !== "keepReady") keeperSwipe(sx, sy, len);
      swipe = null;
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
    var gm = match ? goalsOf(match.me) : 0, go = match ? goalsOf(match.op) : 0;
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
    athlete("myKeeper", asKeeper(me, kitOf(opp.keeper).primary), { keeper: true });
    athlete("ref", REFEREE, { keeper: false, detail: "lo" });
    takerNow = takerNow || opp.takers[0];
    athlete("taker", takerNow.p, { keeper: false });
    paintCrowd();
    screenSig = "";
  }
  function placeCast() {
    if (!R || !match) return;
    if (match.turn === "keep") athlete("taker", takerNow.p, { keeper: false });
  }

  /* ─────────────── pozlar ─────────────── */

  var START = { x: -0.95, z: SPOT_Z + 2.25 }, KICK = { x: -0.14, z: SPOT_Z + 0.22 };
  var JOG_PLANT = 0.78;

  /**
   * Atıcının pozu. phase: 'wait' | 'run' (p 0..1) | 'kick' (k sn) | 'celebrate'
   * | 'sad'. tell: koşu sonunda kalçanın açıldığı yön (kalecilikte ipucu).
   */
  function poseShooter(a, phase, p, tell) {
    var J = a.J;
    K.rest(a);
    var root = a.root;
    var heading = Math.atan2(KICK.x - START.x, KICK.z - START.z);
    var face = Math.PI - 0.06;
    if (phase === "wait") {
      root.position.set(START.x, 0, START.z);
      root.rotation.y = heading;
      J.spine.rotation.x = 0.05 + Math.sin(A.time * 2.1) * 0.015;
      J.head.rotation.x = 0.12;
      return;
    }
    if (phase === "run") {
      var e = p * (1.18 - 0.18 * p);
      root.position.set(A.lerp(START.x, KICK.x, e), 0, A.lerp(START.z, KICK.z, e));
      var turn = A.smooth(A.clamp((p - 0.55) / 0.45, 0, 1));
      root.rotation.y = A.lerp(heading, face, turn) + (tell || 0) * 0.2 * A.smooth(A.clamp((p - 0.6) / 0.4, 0, 1));
      var w = A.smooth(A.clamp((p - 0.7) / 0.3, 0, 1));
      K.play(a, "jog", JOG_PLANT - (1 - p) * RUNUP * 1.02, 1 - w);
      J.hpb.rotation.x = 0.85 * w;
      J.knb.rotation.x = 1.5 * w;
      J.hpa.rotation.x = -0.15 * w;
      J.kna.rotation.x = 0.2 * w;
      J.shb.rotation.z = -0.5 * w;
      J.sha.rotation.z = 1.0 * w;
      J.sha.rotation.x = 0.3 * w;
      J.spine.rotation.x = 0.08 * w;
      J.spine.rotation.y = -(tell || 0) * 0.12 * w;
      J.hips.position.y = 0.94 - 0.02 * w;
      return;
    }
    root.position.set(KICK.x, 0, KICK.z);
    root.rotation.y = face;
    if (phase === "kick") {
      kickPose(J, p);
      return;
    }
    if (phase === "celebrate") {
      // uçak: kollar açık, köşe bayrağına koşu
      var c = A.clamp(p / 2.2, 0, 1);
      var tx = 7, tz = SPOT_Z + 5;
      root.position.set(A.lerp(KICK.x, tx, A.smooth(c)), 0, A.lerp(KICK.z, tz, A.smooth(c)));
      root.rotation.y = Math.atan2(tx - KICK.x, tz - KICK.z);
      if (c < 1) {
        K.runCycle(a, p * 9.5, 1);
        J.sha.rotation.z = 1.45;
        J.shb.rotation.z = -1.45;
        J.ela.rotation.x = 0;
        J.elb.rotation.x = 0;
        J.spine.rotation.z = Math.sin(p * 2.2) * 0.18;
      } else {
        root.rotation.y = Math.atan2(0 - tx, 30 - tz);
        J.sha.rotation.x = -2.8;
        J.shb.rotation.x = -2.8;
        J.sha.rotation.z = 0.3;
        J.shb.rotation.z = -0.3;
        root.position.y = Math.max(0, Math.sin(p * 9)) * 0.15;
      }
      return;
    }
    if (phase === "sad") {
      var d = A.clamp(p / 0.5, 0, 1);
      J.sha.rotation.x = -2.5 * d;
      J.shb.rotation.x = -2.5 * d;
      J.sha.rotation.z = 0.7 * d;
      J.shb.rotation.z = -0.7 * d;
      J.ela.rotation.x = -2.1 * d;
      J.elb.rotation.x = -2.1 * d;
      J.head.rotation.x = 0.35 * d;
      J.spine.rotation.x = 0.18 * d;
      return;
    }
  }
  function kickPose(J, k) {
    var sw = A.easeOut(A.clamp(k / 0.2, 0, 1));
    var rec = A.smooth(A.clamp((k - 0.45) / 0.5, 0, 1));
    J.hpb.rotation.x = A.lerp(A.lerp(0.85, -1.35, sw), -0.08, rec);
    J.knb.rotation.x = A.lerp(A.lerp(1.5, 0.1, sw), 0.12, rec);
    J.hpa.rotation.x = -0.12 * (1 - rec);
    J.kna.rotation.x = 0.22 * (1 - rec);
    J.spine.rotation.x = (0.08 - 0.22 * sw) * (1 - rec);
    J.sha.rotation.z = 1.0 * (1 - 0.85 * rec);
    J.shb.rotation.z = -0.5 * (1 - 0.85 * rec);
    J.sha.rotation.x = 0.3 * (1 - rec);
    J.hips.position.y = A.lerp(0.92, 0.94, rec);
  }

  /**
   * Kaleci pozu, simülasyondaki gövdeden: merkez + eksen. Kök ayak hizasındadır;
   * gövde merkezi (kalça ≈ 0,95 m) simülasyon merkezine oturtulur.
   */
  function poseKeeper(a, k, now, extra) {
    var J = a.J;
    K.rest(a);
    var root = a.root;
    var b = keeperBody(k, now);
    root.rotation.y = 0; // kaleci sahaya (+z) bakar
    if (!b.diving) {
      var cr = k.stay ? 1 : k.crouch;
      J.hips.position.y = 0.94 - cr * 0.16;
      J.hpa.rotation.x = -0.5 * cr;
      J.hpb.rotation.x = -0.5 * cr;
      J.kna.rotation.x = 1.0 * cr;
      J.knb.rotation.x = 1.0 * cr;
      J.hpa.rotation.z = 0.2;
      J.hpb.rotation.z = -0.2;
      J.spine.rotation.x = 0.3 * cr;
      J.sha.rotation.z = 0.7 + k.set * 0.25;
      J.shb.rotation.z = -0.7 - k.set * 0.25;
      J.sha.rotation.x = -0.5;
      J.shb.rotation.x = -0.5;
      J.ela.rotation.x = -0.6;
      J.elb.rotation.x = -0.6;
      J.head.rotation.x = -0.15;
      root.position.set(b.cx, 0, KEEPER_Z);
      if (extra && extra.caught) {
        J.sha.rotation.x = -1.3;
        J.shb.rotation.x = -1.3;
        J.sha.rotation.z = 0.25;
        J.shb.rotation.z = -0.25;
        J.ela.rotation.x = -1.4;
        J.elb.rotation.x = -1.4;
      }
      if (extra && extra.cheer > 0) {
        var ch = extra.cheer;
        J.sha.rotation.x = -2.9 * ch;
        J.sha.rotation.z = 0.25;
        J.ela.rotation.x = -0.5 * ch;
        J.shb.rotation.x = -1.2 * ch;
        J.hips.position.y = 0.94 + Math.max(0, Math.sin(A.time * 10)) * 0.06 * ch;
        J.hpa.rotation.x = J.hpb.rotation.x = J.kna.rotation.x = J.knb.rotation.x = 0;
        J.spine.rotation.x = -0.1 * ch;
      }
      return;
    }
    // uçuş: gövde ekseni (ax, ay); kök = merkez − eksen × kalça yüksekliği
    var cy = b.cy;
    if (extra && extra.land > 0) cy = A.lerp(cy, 0.3, extra.land);
    var phi = Math.atan2(-b.ax, b.ay);
    root.rotation.z = phi;
    root.position.set(b.cx - b.ax * 0.95, cy - b.ay * 0.95, KEEPER_Z);
    var side = b.ax >= 0 ? 1 : -1;
    var e = b.e;
    // kollar başın üstünde, uçuş yönünde uzanır; bacaklar geride hafif kırık
    J.sha.rotation.z = A.lerp(0.7, 2.95, e);
    J.shb.rotation.z = A.lerp(-0.7, -2.95, e);
    J.sha.rotation.x = A.lerp(-0.5, -0.15, e);
    J.shb.rotation.x = A.lerp(-0.5, -0.15, e);
    J.ela.rotation.x = -0.1;
    J.elb.rotation.x = -0.1;
    J.spine.rotation.z = side * 0.12 * e;
    J.head.rotation.z = side * 0.2 * e;
    J.hpa.rotation.x = 0.15 * e;
    J.hpb.rotation.x = 0.35 * e;
    J.kna.rotation.x = 0.35 * e;
    J.knb.rotation.x = 0.7 * e;
    J.hpa.rotation.z = side > 0 ? 0.12 : 0.3;
    J.hpb.rotation.z = side > 0 ? -0.3 : -0.12;
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
    // yayın penaltı kamerası: atıcının sağ arkası, göz hizası — kale ekranı doldurur
    return { pos: [0.95, 1.72, SPOT_Z + 4.8], look: [0, 1.15, 0], fov: fitFov(GOAL_W * 1.28, SPOT_Z + 4.8, 24, 62) };
  }
  function camKeep() {
    return { pos: [0, 2.2, -6.2], look: [0, 1.05, 9], fov: fitFov(6.5, 6.55, 30, 74) };
  }
  function placeCamera(dt) {
    var cam = R.camera;
    var t = A.time;
    var view = null, follow = 5, cut = false;
    var turn = match ? match.turn : "shoot";
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
    } else if (turn === "keep") {
      view = camKeep();
      if (state === "keepFlight" || state === "result") {
        view.pos[0] += ball.x * 0.08;
        view.look[0] = ball.x * 0.25;
      }
      cut = lastShot !== "keep";
      lastShot = "keep";
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
        ? "GOOOL!  " + upperTR(lastKick.who === "me" ? shooter.back || shooter.short : takerNow.p.back || takerNow.p.short) + "   •   "
        : "ELİTLİG ARENA   •   " + upperTR(teamName(shooter)) + "  vs  " + upperTR(teamName(opp.keeper)) + "   •   ",
    );
    R.boardTex.offset.x = (A.time * 0.04) % 1;
    R.ledTex.offset.x = (A.time * 0.02) % 1;

    var cast = R.cast;
    var turn = match ? match.turn : "shoot";
    var keepTurn = turn === "keep" && state !== "intro" && state !== "attract" && state !== "matchEnd";
    var shooterA = keepTurn ? cast.taker.a : cast.shooter.a;
    var keeperA = keepTurn ? cast.myKeeper.a : cast.oppKeeper.a;
    var offA = [keepTurn ? cast.shooter.a : cast.taker.a, keepTurn ? cast.oppKeeper.a : cast.myKeeper.a];
    offA.forEach(function (a) {
      a.root.visible = false;
    });
    // kaleci kamerası file arkasından bakar: arka pano gizlenir, file incelir
    var behind = keepTurn && !inReplay();
    R.backBoard.visible = !behind;
    R.netMats.forEach(function (m) {
      m.opacity = behind ? 0.45 : 1;
    });
    shooterA.root.visible = true;
    keeperA.root.visible = true;

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
      var land = gk.dive ? A.smooth(A.clamp((stateT - 0.2) / 0.5, 0, 1)) : 0;
      keepExtra = { land: lastKick && lastKick.result === "gol" ? land : land * 0.6, caught: ball.caught, cheer: lastKick && lastKick.result !== "gol" && !gk.dive ? Math.min(1, stateT * 2) : 0 };
    }
    if (state === "aim" || state === "power" || state === "turn" || state === "keepReady" || state === "intro" || state === "runup" || state === "keepRun") {
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
    R.ball.rotation.set(ball.wx, ball.wy, 0);
    R.ballShadow.position.set(bx, 0.006, bz);
    R.ballShadow.material.opacity = 0.55 * Math.max(0.15, 1 - by * 0.6);
    var trail = R.trail;
    var flying = (state === "flight" || state === "keepFlight" || inReplay()) && bz < SPOT_Z - 0.3;
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
    var tell = keepTurn && takerPlan ? takerPlan.tell : 0;
    if (state === "attract" || state === "intro" || state === "turn" || state === "aim" || state === "power" || state === "keepReady") poseShooter(sh, "wait");
    else if (state === "runup") poseShooter(sh, "run", A.clamp(stateT / RUNUP, 0, 1), 0);
    else if (state === "keepRun") poseShooter(sh, "run", A.clamp(1 - (kickAt - simTime) / RUNUP, 0, 1), tell);
    else if (inReplay()) poseShooter(sh, "kick", Math.max(0, know - kickAt + 0.05));
    else if (state === "flight" || state === "keepFlight") poseShooter(sh, "kick", simTime - kickAt);
    else if (state === "result") {
      var mineGoal = lastKick && lastKick.who === "me" && lastKick.result === "gol";
      var theirGoal = lastKick && lastKick.who === "op" && lastKick.result === "gol";
      if ((mineGoal || theirGoal) && stateT > 0.5) poseShooter(sh, "celebrate", stateT - 0.5);
      else if (!mineGoal && !theirGoal && stateT > 0.35) poseShooter(sh, "sad", stateT - 0.35);
      else poseShooter(sh, "kick", simTime - kickAt);
    } else if (state === "matchEnd") {
      if (endResult === "won") poseShooter(cast.shooter.a, "celebrate", 2.3 + stateT);
      else poseShooter(cast.shooter.a, "sad", 1);
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
    var gm = match ? goalsOf(match.me) : 0, go = match ? goalsOf(match.op) : 0;
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
      dots(c, x + 42, y + 47, match.me, match.turn === "shoot" && isLive(), 1);
      dots(c, x + w - 42, y + 47, match.op, match.turn === "keep" && isLive(), -1);
    }
    c.font = A.font(9, 900);
    c.fillStyle = match && match.sudden ? P.bad : "rgba(255,255,255,0.55)";
    c.textAlign = "center";
    if ("letterSpacing" in c) c.letterSpacing = "1px";
    c.fillText(match && match.sudden ? "ANİ ÖLÜM" : stageName(matchIdx), W / 2, y + 49);
    if ("letterSpacing" in c) c.letterSpacing = "0px";
    c.restore();
  }
  function isLive() {
    return ["turn", "aim", "power", "runup", "flight", "keepReady", "keepRun", "keepFlight"].indexOf(state) >= 0;
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

  /** Önizleme yolu: seçili türün orta hızıyla, yerçekimli. */
  function previewPath(type) {
    var tp = TYPES[type];
    var b = { x: 0, y: BALL_R, z: SPOT_Z };
    var mid = (tp.zone[0] + tp.zone[1]) / 2;
    var speed = tp.speed[0] + (tp.speed[1] - tp.speed[0]) * mid;
    var tx = type === "kasik" ? aim.x * 0.35 : aim.x, ty = type === "kasik" ? Math.max(1, aim.y) : aim.y;
    var ft = Math.hypot(tx, SPOT_Z) / speed * (type === "kasik" ? 1.15 : 1);
    var vx = tx / ft, vz = -SPOT_Z / ft, vy = (ty - BALL_R + 0.5 * GRAV * ft * ft) / ft;
    var pts = [];
    for (var i = 1; i <= 16; i++) {
      var t = (i / 16) * ft;
      pts.push([b.x + vx * t, b.y + vy * t - 0.5 * GRAV * t * t, b.z + vz * t]);
    }
    return pts;
  }

  function drawAim(c, locked) {
    var type = shotType;
    var q = state === "power" ? powerQuality(type, powerV) : 1;
    var sig = sigmaOf(type, q, aim.x, aim.y);
    var tx = type === "kasik" ? aim.x * 0.35 : aim.x, ty = type === "kasik" ? Math.max(1, aim.y) : aim.y;
    var p = screenOf(tx, ty, 0);
    var edge = screenOf(tx + sig * 2, ty, 0);
    var rr = Math.max(10, Math.abs(edge.x - p.x));
    // risk: halkanın ne kadarı çerçeve dışında / direkte
    var outX = Math.max(0, Math.abs(tx) + sig * 2 - (HALF - 0.12)), outY = Math.max(0, ty + sig * 1.4 - (GOAL_H - 0.12));
    var risk = A.clamp((outX + outY) / (sig * 2.5), 0, 1);
    var col = risk > 0.55 ? P.bad : risk > 0.15 ? "#FBBF24" : "#FFFFFF";
    c.save();
    // yol önizlemesi
    if (!locked || state === "power") {
      var pts = previewPath(type);
      for (var i = 0; i < pts.length; i++) {
        var sp = screenOf(pts[i][0], pts[i][1], pts[i][2]);
        var f = i / pts.length;
        c.fillStyle = "rgba(255,255,255," + (0.15 + 0.45 * (1 - f)) + ")";
        c.beginPath();
        c.arc(sp.x, sp.y, Math.max(1.4, 3.2 - f * 1.8), 0, Math.PI * 2);
        c.fill();
      }
    }
    // risk halkası (kesikli)
    c.setLineDash([5, 5]);
    c.lineDashOffset = -A.time * 12;
    c.strokeStyle = col;
    c.globalAlpha = 0.85;
    c.lineWidth = 2;
    c.beginPath();
    c.ellipse(p.x, p.y, rr, rr * 0.75, 0, 0, Math.PI * 2);
    c.stroke();
    c.setLineDash([]);
    c.globalAlpha = 1;
    c.fillStyle = risk > 0.55 ? "rgba(251,113,133,0.12)" : "rgba(255,255,255,0.08)";
    c.fill();
    // nişangâh
    var r = Math.max(9, p.s * 0.16);
    c.strokeStyle = "#FFFFFF";
    c.lineWidth = 2.5;
    c.shadowColor = "rgba(0,0,0,0.5)";
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
    if (risk > 0.15 && !locked) {
      c.font = A.font(10, 900);
      c.textAlign = "center";
      c.fillStyle = col;
      c.fillText(risk > 0.55 ? "ÇOK RİSKLİ" : "RİSKLİ", p.x, p.y - rr * 0.75 - 9);
    }
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
    var z = TYPES[shotType].zone;
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

  function drawKeepHUD(c) {
    var tk = takerNow;
    if (!tk) return;
    // atıcı kartı
    var x = 14, y = H - 92, w = Math.min(W - 28, 260), h = 64;
    c.save();
    glass(c, x, y, w, h, 14);
    avatar(c, x + 34, y + h / 2, 22, tk.p);
    c.textAlign = "left";
    c.textBaseline = "middle";
    c.font = A.font(10, 900);
    c.fillStyle = GOLD;
    c.fillText("RAKİP ATICI", x + 66, y + 16);
    c.font = A.font(15, 900);
    c.fillStyle = "#FFFFFF";
    c.fillText(fit(c, (tk.p.shirt ? tk.p.shirt + " · " : "") + (tk.p.short || tk.p.name), w - 80), x + 66, y + 34);
    c.font = A.font(10.5, 700);
    c.fillStyle = "rgba(255,255,255,0.65)";
    var dirs = match && match.opDirs ? match.opDirs : [];
    var hist = dirs.length ? "Son atışlar: " + dirs.slice(-4).map(function (d) { return d < 0 ? "←" : d > 0 ? "→" : "↑"; }).join(" ") : "Kalçasının açıldığı yöne dikkat";
    c.fillText(fit(c, hist, w - 80), x + 66, y + 51);
    c.restore();
    if ((state === "keepReady" || state === "keepRun") && !gk.dive && !gk.stay) {
      drawHint(c, "Kaydır: o yöne uç · Dokun: ortada kal", H - 124);
      // yön okları
      c.save();
      var a = 0.35 + 0.35 * Math.sin(A.time * 5);
      c.globalAlpha = a;
      c.fillStyle = "#FFFFFF";
      [[-1, 0], [1, 0], [-0.7, -0.7], [0.7, -0.7]].forEach(function (d) {
        var cx = W / 2 + d[0] * 70, cy = H * 0.52 + d[1] * 70;
        c.save();
        c.translate(cx, cy);
        c.rotate(Math.atan2(d[1], d[0]));
        c.beginPath();
        c.moveTo(10, 0);
        c.lineTo(-6, -8);
        c.lineTo(-6, 8);
        c.closePath();
        c.fill();
        c.restore();
      });
      c.restore();
    }
    if (swipe && swipe.cur) {
      c.save();
      c.strokeStyle = "rgba(255,255,255,0.75)";
      c.lineWidth = 4;
      c.lineCap = "round";
      c.beginPath();
      c.moveTo(swipe.x, swipe.y);
      c.lineTo(swipe.cur.x, swipe.cur.y);
      c.stroke();
      c.restore();
    }
    if (slow < 0.99) {
      c.save();
      var k = (1 - slow) / (1 - SLOW);
      var g = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
      g.addColorStop(0, "rgba(40,80,200,0)");
      g.addColorStop(1, "rgba(40,80,200," + 0.28 * k + ")");
      c.fillStyle = g;
      c.fillRect(0, 0, W, H);
      c.globalAlpha = k;
      c.font = A.font(10, 900);
      c.fillStyle = "#BFD4FF";
      c.textAlign = "center";
      if ("letterSpacing" in c) c.letterSpacing = "2px";
      c.fillText("● AĞIR ÇEKİM", W / 2, 116);
      c.restore();
    }
  }

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
    var mine = match.turn === "shoot";
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
    A.bigText(c, mine ? "SIRA SENDE" : "KALEYE GEÇ", W / 2, y - 6, 28, "#FFFFFF");
    c.font = A.font(12, 800);
    c.fillStyle = "rgba(255,255,255,0.85)";
    var who = mine ? shooter : takerNow.p;
    var n = (mine ? match.me.length : match.op.length) + 1;
    c.fillText((match.sudden ? "Ani ölüm · " : n + ". atış · ") + (mine ? "Atıcın " : "Atıcı ") + (who.short || who.name), W / 2, y + 20);
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
      drawAim(c, false);
      drawTypeChips(c, false);
      if (!dragFrom) drawDragHint(c);
      drawShooterCard(c);
    } else if (state === "power") {
      drawAim(c, true);
      drawPower(c);
      drawTypeChips(c, true);
    } else if (state === "keepReady" || state === "keepRun" || state === "keepFlight") drawKeepHUD(c);
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
      turn: match && match.turn,
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
      zone: TYPES[shotType].zone,
      shooter: shooter.short,
      opponent: teamName(opp.keeper),
      oppKeeper: opp.keeper.short,
      myKeeper: me.short,
      taker: takerNow ? takerNow.p.short : null,
      takerPlan: takerPlan,
      lastKick: lastKick,
      decide: decide,
      gl: !!R,
    };
  }

  A.register({ resize: resize, start: start, update: update, render: render, down: down, move: move, up: up, debug: debug, setRoster: setRoster });
})();
