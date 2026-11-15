/*
 * KARİYER YOLU — FUTBOLCU KARİYERİ (Lig Yolu bölüm oyunu, WebView Canvas 2D).
 *
 * Her bölüm kariyerinin bir MAÇIdır: Mahalle Ligi'nden Avrupa Kupası'na
 * (8 basamak, her basamakta terfi / transfer kartı). Maçın yalnız senin
 * ATAKLARIN canlı oynanır (3–6 atak); aradaki dakikalarda rakip de gol
 * atabilir. Maç sonunda rakipten çok golün varsa kazanırsın; yıldız maç
 * reytinginden gelir.
 *
 * ATAK TÜRLERİ (gerçek zamanlı, oyuncunun ARKASINDAN kamera):
 *   atak     topla kaleye koşarsın. Parmağını sağa sola sürükle: yön.
 *            Dokun: ÇALIM (kısa kaçış; kayan ya da yapışan rakibi geçer,
 *            bekleme süresi var — erken dokunan açık verir). Koşan takım
 *            arkadaşına dokun: PAS → o koşarken top sana geri gelir (VERKAÇ);
 *            pas yolunda rakip varsa keser. Ceza sahasına girince zaman
 *            yavaşlar: Penaltı'daki gibi sürükleyip nişan al, bırak, güç
 *            çubuğu yeşildeyken dokun. Kaleci çizgisinden çıkıp açıyı kapatır.
 *   kontra   daha uzun ve hızlı koşu; arkandan bir rakip kovalar.
 *   penalti  ceza sahasında düşürüldün: kaleci çizgide, köşeyi okumaya çalışır.
 *   frikik   baraj önünde: barajın üstünden ya da yanından vur (falso).
 *   kafa     kanattan orta: topun düşeceği halkanın altına koş, halka
 *            kapanırken kalenin vurmak istediğin yerine dokun.
 *
 * MİMARİ (Penaltı ile aynı aile):
 *   SİMÜLASYON  kurallar, top fiziği (Penaltı'nın tümleyicisi ve nişan
 *               çözücüsü), kaleci gövdesi ve kararı, savunmacı yapay zekâsı.
 *               Çizimden bağımsızdır; scripts/check-kariyer.mjs başsız bir bot
 *               ile bütün bölümleri oynatıp kazanma oranlarını ölçer.
 *   ÇİZİM       düz Canvas 2D "flat vector" çizgi film: gece stadı, takım
 *               renkli tribün, LED panolar, lacivert konturlu futbolcular,
 *               beyaz kartlar, sarı rozetler. Kamera iğne deliği modelidir;
 *               koşarken geniş açı (oyuncunun arkasından, hafif yukarıdan),
 *               şutta Penaltı'nın dar açısı (topun arkasından kaleye bakan,
 *               yatay dönüşlü). Gol tekrarı yandan, yavaş çekimle.
 *
 * KOORDİNAT (metre): x yatay (kaleye bakınca sağ +), y yukarı, z kale
 * çizgisinden uzaklık (kale çizgisi z = 0, ceza sahası z < 16,5).
 *
 * BÖLÜM MODU (docs/oyun-yenileme-2026-11.md §2): RN {type:"config",
 * levelMode:true, level:N, boosters:[…], roster} + {type:"start"}. Bölüm
 * tanımı `levelSpec(N)` BELİRLENİMCİDİR ve lib/puzzle/levels/kariyer.ts ile
 * BİREBİR aynıdır (scripts/check-kariyer.mjs karşılaştırır). Zorluk
 * d = 1 − e^(−(N−1)/75) (+0,08 boss, −0,14 nefes); her 10. bölüm BOSS maçı
 * (derbi / final), her 5. bölüm NEFES. Yeni mekanikler UNLOCKS tablosundaki
 * bölümde tanıtım kartıyla gelir.
 * Kaybetmek üzereyken {type:"fail", canContinue, extra} gider; "continue"
 * uzatma atakları ekler, "giveUp" maçı bitirir. Bitince
 * {type:"over", score, stats:{level, won, stars, goals, rival, rating, …}}.
 * Güçlendiriciler: `krampon` (bölüm öncesi: daha hızlı koşu, uzun çalım,
 * kısa bekleme, %20 geniş yeşil şut bölgesi), `ikinci_sans` (canlı: kötü
 * biten atağı yeniden oyna; oyun {type:"useBooster", key} sorar, RN stoktan
 * düşerse {type:"booster", key} döner).
 */
(function () {
  "use strict";
  var A = window.Arena;

  /* ═══════════════════════════ SABİTLER ═══════════════════════════ */

  var GOAL_W = 7.32, GOAL_H = 2.44, HALF = GOAL_W / 2, POST_R = 0.06;
  var NET_D = 2.0, NET_BACK_H = 1.9;
  var BALL_R = 0.11, GRAV = 9.81;
  var SUB = 1 / 240; // top fiziğinin sabit alt adımı (sn)
  var PITCH_HW = 34, BOX_Z = 16.5, BOX_HW = 20.16, SIX_Z = 5.5, SIX_HW = 9.16, SPOT_Z = 11, HALFWAY_Z = 52.5;
  var RUN_V = 6.4; // koşu hızı (m/sn)
  var LAT_V = 4.8; // yanal en büyük hız
  var SKILL_T = 0.42, SKILL_COOL = 0.62; // çalım süresi / bekleme
  var TACKLE_R = 0.85; // kayan rakibin süpürdüğü yarıçap
  var STEAL_R = 0.72; // yapışan rakibin topu aldığı mesafe
  var PASS_V = 17; // yer pası hızı
  var INTERCEPT_R = 1.05; // pas yoluna uzanan rakip
  var SLOWMO = 0.14; // nişan / güç evresinde dünya saati
  var REPLAY_LEN = 2.8;

  var W = 390, H = 640;

  /* ═══════════════════════════ KADRO ═══════════════════════════ */

  var FIRST = ["Emre", "Burak", "Mert", "Kerem", "Arda", "Onur", "Serkan", "Tolga", "Yusuf", "Ozan", "Cenk", "Barış", "Furkan", "Hakan", "Volkan", "Umut", "Kaan", "Efe"];
  var LAST = ["Yılmaz", "Kaya", "Demir", "Şahin", "Çelik", "Arslan", "Doğan", "Aydın", "Öztürk", "Koç", "Kurt", "Polat", "Erdem", "Güneş", "Aksoy", "Tekin", "Bulut", "Avcı"];
  var CLUBS = [
    ["Çaylakspor", "#0EA5E9", "#FFFFFF", 62],
    ["Yıldızspor", "#F97316", "#111827", 66],
    ["Gençlerbirliği", "#DC2626", "#FFFFFF", 70],
    ["Sahilspor", "#14B8A6", "#FFFFFF", 73],
    ["Kartal SK", "#111827", "#FFFFFF", 77],
    ["Kalespor", "#7C3AED", "#FACC15", 80],
    ["Anadolu FK", "#16A34A", "#FFFFFF", 83],
    ["Şampiyon FK", "#FACC15", "#1E3A8A", 87],
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
    var parts = String(name).split(" ");
    return {
      id: id,
      name: name,
      short: parts.length > 1 ? parts[0][0] + ". " + parts.slice(1).join(" ") : name,
      back: upperTR(parts.length > 1 ? parts.slice(1).join(" ") : name),
      shirt: extra && extra.shirt ? extra.shirt : 1,
      team: team,
      attrs: (extra && extra.attrs) || {},
      stats: (extra && extra.stats) || {},
    };
  }
  var DEFAULT_ME = makePerson(0, "Elit Yıldız", { id: 900, name: "ElitLig FK", kit: { primary: "#5B3DF5", secondary: "#FFFFFF" } }, {
    shirt: 10,
    attrs: { power: 78, accuracy: 78, curve: 76 },
  });
  var DEFAULT_KEEPERS = CLUBS.map(function (c, i) {
    var team = { id: 901 + i, name: c[0], kit: { primary: c[1], secondary: c[2] } };
    return makePerson(-1 - i, personName(101 + i * 7), team, { shirt: 1, attrs: { reflex: c[3] }, stats: { saves: 0 } });
  });

  var me0 = DEFAULT_ME; // kadrodaki oyuncu (adı, numarası, fotoğrafı)
  var keepers = DEFAULT_KEEPERS; // rakip kulüplerin kalecileri (merdiven)
  var takers = []; // ligin oyuncuları (rakip savunmacı / takım arkadaşı adları)
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
    me0 = s || DEFAULT_ME;
    keepers = ks.length ? ks : DEFAULT_KEEPERS;
    takers = tk;
    if (state === "attract" || state === "over") castSig = "";
  }
  function attr(obj, key, fallback) {
    var v = obj && obj.attrs ? Number(obj.attrs[key]) : NaN;
    return isFinite(v) ? A.clamp(v, 50, 99) : fallback;
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

  /* ═══════════════════════════ BÖLÜM TABLOSU ═══════════════════════════
   * lib/puzzle/levels/kariyer.ts ile AYNI (sıra, sayılar, metinler).
   */

  var LEVEL_COUNT = 150; // genişletilebilir: üreteç N'den bağımsız; mevcut bölümler değişmez
  /** Kariyer basamakları: bölüm `from`'dan itibaren bu ligdesin. */
  var TIERS = [
    { key: "mahalle", name: "Mahalle Ligi", from: 1 },
    { key: "amator", name: "Amatör Lig", from: 13 },
    { key: "bolgesel", name: "Bölgesel Amatör Lig", from: 27 },
    { key: "lig3", name: "3. Lig", from: 43 },
    { key: "lig2", name: "2. Lig", from: 61 },
    { key: "lig1", name: "1. Lig", from: 79 },
    { key: "super", name: "Süper Lig", from: 97 },
    { key: "avrupa", name: "Avrupa Kupası", from: 121 },
  ];
  /** Boss maçlarının adı: basamak başına iki (sırayla). */
  var BOSS_TITLES = [
    ["Mahalle Derbisi", "Mahalle Kupası Finali"],
    ["Kasaba Derbisi", "Amatör Kupa Finali"],
    ["Bölge Derbisi", "Bölge Şampiyonluk Maçı"],
    ["Play-off Yarı Finali", "Play-off Finali"],
    ["Şehir Derbisi", "Terfi Finali"],
    ["Büyük Derbi", "Süper Lig Terfi Maçı"],
    ["Ezeli Rekabet", "Türkiye Kupası Finali"],
    ["Avrupa Gecesi", "Avrupa Finali"],
  ];
  var UNLOCKS = [
    { level: 1, key: "kosu", title: "Koşu ve şut", text: "Parmağını sağa sola sürükleyerek koş. Ceza sahasına girince zaman yavaşlar: sürükle, nişan al; bırak ve güç çubuğu yeşildeyken dokun." },
    { level: 2, key: "defans", title: "Savunmacılar", text: "Rakip üstüne gelir. Yanından geç ya da tam yanına geldiğinde ekrana dokun: ÇALIM. Erken dokunursan çalım boşa gider." },
    { level: 4, key: "pas", title: "Verkaç", text: "Koşan takım arkadaşına dokun: pas verirsin, o koşarken top sana geri gelir. Pas çizgisi kırmızıysa arada rakip var, keser." },
    { level: 6, key: "kayma", title: "Kayarak müdahale", text: "Kırmızı şerit yanıp sönen rakip kayacak: şeritten çık ya da kaydığı an dokunup üstünden atla." },
    { level: 8, key: "penalti", title: "Penaltı", text: "Ceza sahasında düşürüldün! Kaleci çizgide köşeni okumaya çalışır: hep aynı köşeye vurma." },
    { level: 10, key: "derbi", title: "Derbi maçı", text: "Her 10. maç büyük maç: rakip daha sert, kalecisi daha usta. Kazanırsan kupa senin." },
    { level: 12, key: "kaleci", title: "Kaleci çıkıyor", text: "Kaleci çizgisinden çıkıp açıyı daraltır. Oyalanma: erken vur ya da köşeye yerden bitir." },
    { level: 14, key: "super", title: "Süper çalım", text: "Kayan rakibe son anda dokunursan zaman yavaşlar: SÜPER ÇALIM, reytingine ekstra puan." },
    { level: 16, key: "frikik", title: "Frikik", text: "Barajın üstünden ya da yanından vur. Nişan noktasının izini izle: top barajı aşmalı." },
    { level: 22, key: "kafa", title: "Kafa vuruşu", text: "Orta geliyor: topun düşeceği halkanın altına koş, halka yeşile dönünce kalenin vurmak istediğin yerine dokun." },
    { level: 26, key: "pres", title: "İkili pres", text: "Rakipler ikişer gelir. Çalım tek kişiyi geçer: baskıyı pasla kır." },
    { level: 28, key: "ofsayt", title: "Ofsayt", text: "Son savunmacının gerisindeki arkadaşına pas verirsen ofsayt olur. Kırmızı yanan arkadaşa pas verme." },
    { level: 32, key: "yagmur", title: "Yağmur", text: "Islak zeminde yön değiştirmek yavaşlar, yeşil şut bölgesi daralır." },
    { level: 36, key: "takip", title: "Arkadan gelen", text: "Bir rakip arkandan kovalıyor. Durma: çalımdan ya da verkaçtan sonra hızlanırsın." },
    { level: 45, key: "kontra", title: "Kontra atak", text: "Kendi yarı sahandan hızlı bir koşu, arkanda kovalayan rakip. Kaleye ulaşan kazanır." },
    { level: 55, key: "kalabalik", title: "Yoğun savunma", text: "Ceza sahası önü kalabalık: araya bir savunmacı daha girer. Pası ve çalımı birlikte kullan." },
  ];
  var KINDS = ["atak", "kontra", "penalti", "frikik", "kafa"];
  var KIND_NAMES = { atak: "Atak", kontra: "Kontra atak", penalti: "Penaltı", frikik: "Frikik", kafa: "Kafa vuruşu" };

  function unlockAt(key) {
    for (var i = 0; i < UNLOCKS.length; i++) if (UNLOCKS[i].key === key) return UNLOCKS[i].level;
    return 1e9;
  }
  function unlockOf(n) {
    for (var i = 0; i < UNLOCKS.length; i++) if (UNLOCKS[i].level === n) return UNLOCKS[i];
    return null;
  }
  function r1(v) {
    return Math.round(v * 10) / 10;
  }
  function r2(v) {
    return Math.round(v * 100) / 100;
  }
  function clampN(v, a, b) {
    return v < a ? a : v > b ? b : v;
  }
  function tierIndex(n) {
    var t = 0;
    for (var i = 0; i < TIERS.length; i++) if (n >= TIERS[i].from) t = i;
    return t;
  }

  /**
   * N. bölümün (maçın) tanımı — BELİRLENİMCİ. Değiştiren lib/puzzle/levels/
   * kariyer.ts'yi de AYNEN değiştirmelidir.
   */
  function levelSpec(level) {
    var n = Math.max(1, Math.floor(Number(level)) || 1);
    var seed = n * 7919 + 2026;
    var rng = A.seeded(seed);
    var dr = [];
    for (var i = 0; i < 30; i++) dr.push(rng());
    var has = function (k) {
      return n >= unlockAt(k);
    };
    var intro = null;
    for (var u = 0; u < UNLOCKS.length; u++) if (UNLOCKS[u].level === n) intro = UNLOCKS[u].key;
    var ti = tierIndex(n);
    var boss = n % 10 === 0;
    var breather = !boss && n % 5 === 0;
    var d = 1 - Math.exp(-(n - 1) / 52);
    d += boss ? 0.08 : breather ? -0.14 : ((n * 37) % 7) / 100 - 0.03;
    d = r2(clampN(d, 0, 0.92));

    var count = n <= 3 ? 3 : clampN(3 + Math.floor(d * 2.6 + dr[0] * 1.2) + (boss ? 1 : 0) - (breather ? 1 : 0), 3, 6);
    var kinds = ["atak"];
    for (var k = 1; k < count; k++) {
      var pool = ["atak", "atak"];
      if (has("penalti") && kinds.indexOf("penalti") < 0) pool.push("penalti");
      if (has("frikik")) pool.push("frikik");
      if (has("kafa")) pool.push("kafa");
      if (has("kontra")) pool.push("kontra");
      kinds.push(pool[Math.floor(dr[1 + k] * pool.length)]);
    }
    if (intro === "penalti" || intro === "frikik" || intro === "kafa" || intro === "kontra") kinds[1] = intro;

    var attacks = [];
    var gap = 88 / count;
    for (var a = 0; a < count; a++) {
      var kd = kinds[a], ra = dr[8 + a], rb = dr[14 + a], rc = dr[20 + a];
      var open = kd === "atak" || kd === "kontra";
      var defs = 0;
      if (open && has("defans")) {
        defs = intro === "defans" ? 1 : 1 + Math.floor(d * 3 + ra * 1.3);
        if (kd === "kontra") defs = Math.max(1, defs - 1);
        if (has("kalabalik") && !breather && (intro === "kalabalik" || rb < 0.3 + 0.3 * d)) defs += 1;
        if (breather) defs = Math.max(1, defs - 1);
        defs = clampN(defs, 0, 5);
      }
      var mates = open && has("pas") ? (d > 0.45 && rb > 0.45 ? 2 : 1) : 0;
      var press = open && defs >= 2 && has("pres") && (intro === "pres" ? a === 0 : !breather && rc < 0.2 + 0.5 * d);
      var chaser = kd === "kontra" || (open && has("takip") && (intro === "takip" ? a === 0 : !breather && ra < 0.12 + 0.3 * d));
      var offside = open && mates > 0 && has("ofsayt") && (intro === "ofsayt" ? a === 0 : !breather && rc > 0.55 - 0.3 * d);
      attacks.push({
        kind: kd,
        minute: clampN(Math.round(1 + (a + 0.5) * gap + (ra - 0.5) * gap * 0.5), 2, 89),
        defs: defs,
        mates: mates,
        press: press,
        chaser: chaser,
        offside: offside,
      });
    }

    var rain = has("yagmur") && (intro === "yagmur" || (!breather && dr[7] < 0.12 + 0.3 * d));
    var rivals = n <= 3 || breather ? 0 : clampN(Math.round(count * (0.1 + 0.2 * d) + (dr[26] - 0.5) * 0.6), 0, Math.max(0, count - 2));
    var rivalAt = [];
    for (var j = 0; j < rivals; j++) {
      var m = Math.round(((j + 0.75) * 88) / (rivals + 0.5) + (dr[27] - 0.5) * 6);
      for (var q = 0; q < attacks.length; q++) if (attacks[q].minute === m) m += 1;
      rivalAt.push(clampN(m, 3, 89));
    }
    var bi = 0;
    for (var b = TIERS[ti].from; b < n; b++) if (b % 10 === 0) bi += 1;

    return {
      level: n,
      seed: seed,
      tier: ti,
      tierName: TIERS[ti].name,
      promo: n > 1 && n === TIERS[ti].from,
      diff: d,
      boss: boss,
      bossTitle: boss ? BOSS_TITLES[ti][bi % 2] : null,
      breather: breather,
      intro: intro,
      attacks: attacks,
      rivals: rivals,
      rivalAt: rivalAt,
      counterP: r2(breather ? 0.08 : 0.14 + 0.12 * d),
      rain: rain,
      slide: has("kayma"),
      superSkill: has("super"),
      defSpeed: r2(4.4 + 2.8 * d + (boss ? 0.2 : 0)),
      lunge: r2(2.1 + 1.5 * d),
      windup: r2(0.66 - 0.28 * d),
      reflex: Math.round(clampN(60 + 28 * d + (boss ? 5 : 0), 50, 99)),
      keeperD: r2(clampN(d + (boss ? 0.08 : 0), 0, 1)),
      keeperOut: has("kaleci") ? r2(0.8 + 1.8 * d * (0.7 + 0.3 * dr[28])) : 0,
      zoneK: r2((1 - 0.34 * d) * (rain ? 0.9 : 1)),
      period: r2(1.32 - 0.4 * d),
      sway: r2(0.03 + 0.16 * d),
      aimTime: r2(3.8 - 1.6 * d),
      star2: r1(6.6 + 0.35 * count + 0.3 * d),
      star3: r1(clampN(7.1 + 0.6 * count + 0.3 * d, 0, 9.7)),
      gen: Math.min(99, 58 + Math.floor((n - 1) * 0.3)),
    };
  }

  /** Hedefin tek satırı (levelInfo.goal) — TS goalText ile aynı. */
  function goalText(s) {
    return s.attacks.length + " atakta maçı kazan";
  }

  /* ═══════════════════════════ DURUM ═══════════════════════════ */

  var state = "attract";
  var stateT = 0;
  var levelCfg = { on: false, level: 1, boosters: [], stock: null };
  var LV = null; // bu bölümün levelSpec'i
  var lvl = null; // { rating, continues, krampon, freeRetry, asked, retried, stars, … }
  var lvRand = null;
  function rnd() {
    return lvRand ? lvRand() : Math.random();
  }
  function rgauss(m, s) {
    var u = Math.max(1e-9, rnd()), v = rnd();
    return m + s * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  var CAREER_CLUBS = [
    ["Mahalle Gücü", "#F97316", "#FFFFFF"],
    ["Esnafspor", "#16A34A", "#FFFFFF"],
    ["Sahil Belediyespor", "#0EA5E9", "#FFFFFF"],
    ["Anadolu Yıldızı", "#DC2626", "#FACC15"],
    ["Kartal Gençlik", "#111827", "#F8FAFC"],
    ["Boğaziçi FK", "#7C3AED", "#FFFFFF"],
    ["ElitLig FK", "#5B3DF5", "#FFFFFF"],
    ["ElitLig FK", "#5B3DF5", "#FFFFFF"],
  ];
  var hero = DEFAULT_ME; // sen (kulübün o basamağın kulübü)
  var club = { id: 800, name: "Mahalle Gücü", kit: { primary: "#F97316", secondary: "#FFFFFF" } };
  var prevClub = null; // terfi kartı: eski kulüp
  var rival = { keeper: DEFAULT_KEEPERS[0], team: DEFAULT_KEEPERS[0].team, players: [] };
  var matesPool = [];

  var timeline = [], tlIdx = 0;
  var score = { me: 0, op: 0 };
  var results = []; // atak başına: "g" gol · "x" kaçtı · null oynanmadı
  var curAtk = null; // { type:"atk", idx, minute, spec, extra }
  var rivEvent = null; // gösterilen rakip golü
  var minuteNow = 0;
  var tally = { goals: 0, shots: 0, onTarget: 0, dribbles: 0, supers: 0, oneTwos: 0, lost: 0, headers: 0, fk: 0, pens: 0 };

  var me = newMe();
  var ball = newBall();
  var gk = newKeeper();
  var mates = [], defs = [];
  var wall = null, cross = null;
  var shootZ = 17;
  var atkMul = 1; // koşu hızı çarpanı (kontra hızlı)
  var simTime = 0;
  var superT = 0; // süper çalım yavaş çekimi
  var slow = 1, slowT = 0, slowDone = false;
  var aim = { x: 0, y: 1 };
  var dragFrom = null, steerFrom = null;
  var aimT = 0, powerT = 0, powerV = 0;
  var shot = null;
  var kickAt = 0;
  var history = []; // penaltı köşeleri (kaleci öğrenir)
  var line = null, lineT = 0;
  var excite = 0, scoreBump = 0, ratingBump = 0;
  var combo = 0, comboT = 0;
  var atkFx = { oneTwo: false }; // bu ataktaki süsler (verkaç golü)
  var resInfo = null; // { good, label, tags, lost, retry, counter }
  var replay = null, recording = [];
  var celebrate = null;

  function newMe() {
    return { x: 0, z: 40, tx: 0, vx: 0, sp: RUN_V, ph: 0, skill: 0, skillDir: 1, skillStart: -9, cool: 0, burst: 0, jump: 0, down: 0, stop: 0 };
  }
  function newBall() {
    return { x: 0, y: BALL_R, z: 40, vx: 0, vy: 0, vz: 0, wx: 0, wy: 0, live: false, goal: false, post: false, touched: false, caught: false, out: false, t: 0, curl: 0, blocked: null, owner: "me", pass: null, spin: 0 };
  }
  function newKeeper() {
    return { x: 0, z: 0.35, tz: 0.35, set: 0, dive: null, stay: false, crouch: 0.4, saved: false, cheer: 0, plan: null };
  }

  /* ─────────────── kimlik: kulübün ve rakip ─────────────── */

  function clubOf(tier) {
    var real = me0 !== DEFAULT_ME && me0.team && me0.team.kit;
    if (tier >= 6 && real) return { id: me0.team.id, name: teamName(me0), kit: kitOf(me0) };
    var c = CAREER_CLUBS[Math.min(tier, CAREER_CLUBS.length - 1)];
    return { id: 800 + tier, name: c[0], kit: { primary: c[1], secondary: c[2] } };
  }
  function setupIdentity() {
    club = clubOf(LV.tier);
    prevClub = LV.promo ? clubOf(LV.tier - 1) : null;
    hero = Object.assign({}, me0, { team: { id: club.id, name: club.name, kit: club.kit } });
    var list = keepers.filter(function (k) {
      return !(me0 !== DEFAULT_ME && sameTeam(k, me0) && LV.tier >= 6);
    });
    if (!list.length) list = DEFAULT_KEEPERS;
    var k = LV.boss ? list[list.length - 1] : list[(LV.level - 1) % list.length];
    var seedT = hashStr(teamName(k)) + LV.level;
    var own = takers.filter(function (p) {
      return sameTeam(p, k) && p.id !== me0.id;
    });
    var players = own.slice(0, 8);
    for (var i = 0; players.length < 8; i++)
      players.push(makePerson(-300 - i, personName(seedT + i * 17), k.team, { shirt: [4, 5, 3, 2, 6, 8, 9, 11][i % 8] }));
    rival = { keeper: k, team: k.team, players: players };
    var mine = LV.tier >= 6 && me0 !== DEFAULT_ME ? takers.filter(function (p) { return sameTeam(p, me0) && p.id !== me0.id; }) : [];
    matesPool = mine.slice(0, 4);
    for (var j = 0; matesPool.length < 4; j++)
      matesPool.push(makePerson(-400 - j, personName(LV.seed + j * 31), hero.team, { shirt: [7, 11, 9, 8][j % 4] }));
    matesPool.forEach(function (p) {
      p.team = hero.team;
    });
  }

  /* ═══════════════════════════ ATIŞ (Penaltı'nın modeli) ═══════════════════════════ */

  // Yeşil güç bölgesi ve sapma katsayıları — Penaltı'nın PLASE vuruşu.
  var SHOT = { zone: [0.5, 0.78], speed: [19, 24], up: 5.0, wide: 1.3, low: 2.4 };
  function norm(v) {
    return A.clamp((v - 77.5) / 17.5, -1, 1);
  }
  function zoneOf() {
    var z = SHOT.zone, mid = (z[0] + z[1]) / 2, half = (z[1] - z[0]) / 2;
    var acc = norm(attr(me0, "accuracy", 78));
    var perk = A.perks && A.perks.penalti ? A.clamp(Number(A.perks.penalti.aimBonus) || 0, 0, 0.1) : 0;
    var k = LV ? LV.zoneK : 1;
    half *= k * (1 + 0.12 * acc) * (1 + perk * 2) * (lvl && lvl.krampon ? 1.2 : 1);
    return [mid - half, mid + half];
  }
  function powerQuality(v) {
    var z = zoneOf();
    if (v >= z[0] && v <= z[1]) return 1;
    var d = v < z[0] ? z[0] - v : v - z[1];
    return A.clamp(1 - d * 3.2, 0, 1);
  }
  function powerAt(t) {
    return 0.5 - 0.5 * Math.cos((t / (LV ? LV.period : 1.3)) * Math.PI * 2);
  }
  /** Atış modeli: güç yeşildeyse top TAM nişana gider; dışında sapar (Penaltı ile aynı). */
  function shotModel(ax, ay, v, ox, oz, kind) {
    var z = zoneOf();
    var acc = norm(attr(me0, "accuracy", 78));
    var pw = norm(attr(me0, "power", 78));
    var tx = ax, ty = ay;
    var over = Math.max(0, v - z[1]), under = Math.max(0, z[0] - v);
    var inZ = A.clamp((v - z[0]) / Math.max(0.01, z[1] - z[0]), 0, 1);
    var dist = Math.hypot(ox - tx, oz);
    var speed = (SHOT.speed[0] + (SHOT.speed[1] - SHOT.speed[0]) * inZ) * (1 + 0.04 * pw) * (1 + A.clamp((dist - 11) / 26, 0, 0.42));
    var miss = 1 - 0.18 * acc;
    if (over > 0) {
      ty += over * SHOT.up * miss;
      tx += (Math.sign(ax - ox * 0.2) || 1) * over * SHOT.wide * miss;
      speed *= 1 + over * 0.25;
    }
    if (under > 0) {
      ty -= under * SHOT.low;
      tx *= 1 - Math.min(0.7, under * 1.6);
      speed *= Math.max(0.45, 1 - under * 1.3);
    }
    ty = Math.max(BALL_R, ty);
    var curl;
    if (kind === "frikik") curl = (wall && tx < wall.x ? 1 : -1) * 3.2 * (1 + 0.3 * norm(attr(me0, "curve", 78)));
    else curl = -Math.sign(tx - ox * 0.15) * 1.6 * (1 + 0.5 * norm(attr(me0, "curve", 78)));
    return { tx: tx, ty: ty, speed: speed, curl: curl, over: over, under: under };
  }
  function integrate(b, h) {
    b.vy -= GRAV * h;
    b.vx += b.curl * h;
    var sp = Math.hypot(b.vx, b.vy, b.vz);
    var drag = 1 - 0.006 * sp * h;
    b.vx *= drag;
    b.vy *= drag;
    b.vz *= drag;
    b.x += b.vx * h;
    b.y += b.vy * h;
    b.z += b.vz * h;
  }
  function crossing(b0) {
    var b = { x: b0.x, y: b0.y, z: b0.z, vx: b0.vx, vy: b0.vy, vz: b0.vz, curl: b0.curl };
    var t = 0;
    while (b.z > 0 && t < 4) {
      var px = b.x, py = b.y, pz = b.z;
      integrate(b, SUB);
      t += SUB;
      if (b.z <= 0) {
        var f = pz / Math.max(1e-6, pz - b.z);
        return { x: px + (b.x - px) * f, y: py + (b.y - py) * f, t: t - SUB * (1 - f) };
      }
    }
    return { x: b.x, y: b.y, t: t };
  }
  function launch(b, tx, ty, speed, curl) {
    var dx = tx - b.x, dz = 0 - b.z;
    var dist = Math.hypot(dx, dz);
    var ft = dist / speed;
    b.vx = dx / ft - 0.5 * curl * ft;
    b.vz = dz / ft;
    b.vy = (ty - b.y + 0.5 * GRAV * ft * ft) / ft;
    b.curl = curl;
    b.live = true;
    b.t = 0;
    return ft;
  }
  /** Nişan çözücü: hava direnci ve falso dahil top kale çizgisini tam (tx, ty)'de kessin. */
  function aimLaunch(b, tx, ty, speed, curl) {
    launch(b, tx, ty, speed, curl);
    for (var it = 0; it < 6; it++) {
      var c = crossing(b);
      var ex = tx - c.x, ey = ty - c.y;
      if (Math.abs(ex) < 0.002 && Math.abs(ey) < 0.002) break;
      b.vx += ex / Math.max(0.2, c.t);
      b.vy += ey / Math.max(0.2, c.t);
    }
  }
  /** Bir atışın kale çizgisini keseceği nokta — bot ve önizleme için. */
  function predict(ax, ay, v, ox, oz, kind) {
    var m = shotModel(ax, ay, v, ox, oz, kind);
    var b = newBall();
    b.x = ox;
    b.z = oz;
    b.y = BALL_R;
    aimLaunch(b, m.tx, m.ty, m.speed, m.curl);
    var c = crossing(b);
    return { x: c.x, y: c.y, t: c.t, tx: m.tx, ty: m.ty, speed: m.speed };
  }
  /** Güç evresinde nişan hafifçe titrer (zorlukla büyür). */
  function aimNow() {
    if (state !== "power") return { x: aim.x, y: aim.y };
    var t = powerT, a = LV ? LV.sway : 0.03;
    return { x: aim.x + a * (Math.sin(t * 1.9) * 0.7 + Math.sin(t * 3.7 + 1) * 0.3), y: Math.max(0.15, aim.y + a * 0.6 * Math.sin(t * 2.6 + 2)) };
  }

  /* ═══════════════════════════ KALECİ ═══════════════════════════ */

  var DIVE_REACH = 1.75, ARM = 1.05;
  function kD() {
    return LV ? LV.keeperD : 0.3;
  }
  function diveDur() {
    var rf = LV ? LV.reflex : 70;
    return 0.56 - 0.1 * ((rf - 50) / 49);
  }
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
      if (dB < r + 0.24) return { hit: true, nx: (bx - b.cx) / (dB || 1), ny: (by - segY) / (dB || 1), part: "body" };
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
    var fx = b.cx - b.ax * 0.9, fy = b.cy - b.ay * 0.9;
    var hx2 = b.cx + b.ax * ARM, hy2 = b.cy + b.ay * ARM;
    var vx = hx2 - fx, vy = hy2 - fy;
    var t = A.clamp(((bx - fx) * vx + (by - fy) * vy) / (vx * vx + vy * vy), 0, 1);
    var px = fx + vx * t, py = fy + vy * t;
    var d = Math.hypot(bx - px, by - py);
    var rad = t > 0.82 ? 0.19 : 0.22;
    if (d < r + rad + (t > 0.82 ? 0.05 : 0)) return { hit: true, nx: (bx - px) / (d || 1), ny: (by - py) / (d || 1), part: t > 0.82 ? "hand" : "body" };
    return { hit: false };
  }
  function diveTo(k, now, tx, ty) {
    var dx = tx - k.x, dy = ty - 0.98;
    var need = Math.hypot(dx, dy);
    var reach = A.clamp(need - ARM * 0.75, 0, DIVE_REACH * (0.94 + 0.12 * kD()));
    if (need < 0.55) {
      k.stay = true;
      k.set = 1;
      return;
    }
    k.dive = { t0: now, dx: dx / need, dy: dy / need, reach: reach, dur: diveDur() };
  }
  /** Kalecinin kararı: penaltıda geçmiş köşelerden ezber; açık oyunda topu okur. */
  function planKeeper(kind) {
    var d = kD();
    var rf = norm(LV ? LV.reflex : 70);
    if (kind === "penalti") {
      var c = { "-1": 1, "0": 0.6, "1": 1 };
      for (var i = Math.max(0, history.length - 6); i < history.length; i++) c[history[i]] += 1;
      var commit = 0.45 + 0.25 * d, sharp = 1 + 2 * d;
      if (rnd() < commit) {
        var wl = Math.pow(c["-1"], sharp), wc = Math.pow(c["0"], sharp) * 0.5, wr = Math.pow(c["1"], sharp);
        var r = rnd() * (wl + wc + wr);
        var side = r < wl ? -1 : r < wl + wc ? 0 : 1;
        if (side === 0) return { mode: "stay" };
        return { mode: "commit", lead: -0.04 + rnd() * 0.08, tx: side * (2.0 + rnd() * 0.9), ty: 0.45 + rnd() * 1.25 };
      }
    }
    var react = 0.3 - 0.11 * d - 0.04 * rf + (kind === "frikik" ? 0.07 : kind === "kafa" ? 0.03 : 0);
    return { mode: "read", react: Math.max(0.07, react) };
  }
  function keeperDecides(kind) {
    var p = planKeeper(kind);
    gk.plan = null;
    if (p.mode === "stay") {
      gk.stay = true;
      gk.set = 1;
    } else if (p.mode === "commit") gk.plan = { at: kickAt + p.lead, tx: p.tx, ty: p.ty };
    else gk.plan = { at: kickAt + p.react, read: true };
  }
  function keeperThink() {
    var k = gk;
    if (!k.plan || k.dive || simTime < k.plan.at) return;
    var p = k.plan;
    k.plan = null;
    if (p.read) {
      var b = ball;
      var ft = b.vz < -0.1 ? (k.z - b.z) / b.vz : 0.5;
      var px = b.x + b.vx * ft + 0.5 * b.curl * ft * ft;
      var py = b.y + b.vy * ft - 0.5 * GRAV * ft * ft;
      var err = (0.55 - 0.3 * kD()) * (Math.hypot(b.vx, b.vz) / 24) * (shot && (shot.kind === "atak" || shot.kind === "kontra") ? 1.35 : 1);
      diveTo(k, simTime, px + rgauss(0, err), A.clamp(py + rgauss(0, err * 0.6), 0.2, 2.3));
    } else diveTo(k, simTime, p.tx, p.ty);
  }
  /** Açık oyunda kaleci topla kalenin ortası arasındaki çizgide durur, çıkar. */
  function keeperPosition(dt) {
    if (gk.dive || state === "flight" || state === "result") return;
    var bx = ball.x, bz = Math.max(1, ball.z);
    var out = 0;
    if (LV && LV.keeperOut && curAtk && (curAtk.spec.kind === "atak" || curAtk.spec.kind === "kontra"))
      out = LV.keeperOut * A.clamp((BOX_Z + 4 - me.z) / (BOX_Z + 4 - 11), 0, 1);
    gk.tz = 0.35 + out;
    gk.z = A.approach(gk.z, gk.tz, 3.2 * dt);
    var tx = A.clamp((bx * gk.z) / bz, -2.6, 2.6);
    if (wall) tx = gk.homeX;
    gk.x = A.approach(gk.x, tx, 2.4 * dt);
    gk.crouch = 0.6 + 0.15 * A.clamp((25 - ball.z) / 12, 0, 1);
  }

  /* ═══════════════════════════ TOP FİZİĞİ (uçuş) ═══════════════════════════ */

  var lastContact = -1;
  function stepBall(dt) {
    if (!ball.live) return;
    var n = Math.max(1, Math.ceil(dt / SUB - 1e-6));
    for (var i = 0; i < n; i++) stepOnce(dt / n);
  }
  function wallHalf() {
    return wall ? (wall.n * 0.56) / 2 : 0;
  }
  function wallTop() {
    return 1.85 + (wall ? wall.jump * 0.25 : 0);
  }
  function stepOnce(dt) {
    var b = ball;
    if (!b.live) return;
    b.t += dt;
    if (b.caught) return;
    var pz = b.z;
    integrate(b, dt);
    b.wx += (-b.vz / BALL_R) * dt * 0.25;
    b.wy += (b.curl * 4 + b.vx) * dt;
    if (b.y < BALL_R) {
      b.y = BALL_R;
      if (b.vy < 0) b.vy = Math.abs(b.vy) > 1.2 ? -b.vy * 0.5 : 0;
      b.vx *= 1 - 2.2 * dt;
      b.vz *= 1 - 2.2 * dt;
      b.curl = 0;
    }
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
    // kaleci
    if (!b.goal && b.vz < 0 && Math.abs(b.z - gk.z) < BALL_R + 0.28 && simTime - lastContact > 0.15) {
      var c = keeperContact(gk, simTime, b.x, b.y);
      if (c.hit) {
        lastContact = simTime;
        b.touched = true;
        var speed = Math.hypot(b.vx, b.vy, b.vz);
        var still = !gk.dive || keeperBody(gk, simTime).e > 0.92;
        if (speed < 13 && still && Math.abs(b.y - 1.0) < 0.8) {
          b.caught = true;
          b.vx = b.vy = b.vz = 0;
        } else {
          var out = 0.32 + rnd() * 0.12;
          b.vz = Math.abs(b.vz) * out + 1.5;
          b.vx = c.nx * speed * 0.35 + b.vx * 0.15;
          b.vy = Math.max(1.2, c.ny * speed * 0.3 + 2.4);
          b.curl = 0;
        }
        gk.saved = true;
        A.sound("tap");
      }
    }
    // baraj (frikik)
    if (wall && !b.blocked && !b.goal && b.vz < 0 && pz > wall.z && b.z <= wall.z) {
      if (Math.abs(b.x - wall.x) < wallHalf() + BALL_R && b.y < wallTop() + BALL_R) {
        b.blocked = "baraj";
        var sp2 = Math.hypot(b.vx, b.vy, b.vz);
        b.vz = Math.abs(b.vz) * 0.28 + 1;
        b.vx = b.vx * 0.3 + (rnd() - 0.5) * 2;
        b.vy = Math.max(1.4, sp2 * 0.12);
        b.curl = 0;
        A.sound("thud");
        A.shake(4);
        A.haptic("medium");
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
    if (b.z < -5) {
      b.z = -5;
      b.vz = Math.abs(b.vz) * 0.25;
    }
  }
  function hitPost() {
    if (ball.post) return;
    ball.post = true;
    A.sound("post");
    A.shake(5);
    A.haptic("medium");
  }
  /** Şutun sonucu kesinleşti mi? */
  function judge() {
    var b = ball;
    if (b.blocked) return b.blocked;
    if (b.goal) return b.t > 0.15 ? "gol" : null;
    if (b.caught) return "kurtaris";
    var speed = Math.hypot(b.vx, b.vy, b.vz);
    if (b.out || b.z < -0.6) return b.post ? "direk" : b.touched ? "kurtaris" : "aut";
    if (b.vz > 0.5 && b.z > 0.6 && (b.touched || b.post)) return b.touched ? "kurtaris" : "direk";
    if (b.t > 3.2 || (speed < 0.6 && b.y <= BALL_R + 0.01 && b.t > 0.6)) return b.touched ? "kurtaris" : b.post ? "direk" : "aut";
    return null;
  }

  /* ═══════════════════════════ AÇIK OYUN: KOŞU, SAVUNMA, PAS ═══════════════════════════ */

  function speedNow() {
    if (ball.owner !== "me" && me.z < shootZ + 1.5) return Math.max(0.6, (me.z - (shootZ - 2)) * 1.5);
    var sp = RUN_V * atkMul * (lvl && lvl.krampon ? 1.08 : 1);
    if (me.burst > 0) sp *= 1.32;
    if (me.skill > 0) sp *= 0.78;
    sp *= 1 - 0.22 * A.clamp(Math.abs(me.vx) / LAT_V, 0, 1);
    return sp;
  }
  function skillLen() {
    return lvl && lvl.krampon ? 0.52 : SKILL_T;
  }
  /** Çalımın geçtiği mesafe: zorlukla daralır (erken dokunan boşa harcar). */
  function skillReach() {
    return 2.5 - 0.8 * (LV ? LV.diff : 0) + (lvl && lvl.krampon ? 0.25 : 0);
  }
  function skillCool() {
    return lvl && lvl.krampon ? 0.48 : SKILL_COOL;
  }
  function activeDef(d) {
    return d.st === "hold" || d.st === "press" || d.st === "windup" || d.st === "slide" || d.st === "turn" || d.st === "markm";
  }
  /** Topu taşıyan: sen, arkadaş ya da havadaki pas. */
  function carrierPos() {
    if (ball.owner === "mate" && ball.mate) return { x: ball.mate.x, z: ball.mate.z };
    return { x: me.x, z: me.z };
  }

  function stepMe(dt, slowStop) {
    var sp = slowStop ? Math.max(0, me.sp - 14 * dt) : speedNow();
    me.sp = sp;
    me.z -= sp * dt;
    var acc = LV && LV.rain ? 13 : 30;
    var want = A.clamp((me.tx - me.x) * 7, -LAT_V, LAT_V);
    if (me.skill > 0) want = me.skillDir * 6.4;
    if (slowStop) want = 0;
    me.vx = A.approach(me.vx, want, acc * dt);
    me.x = A.clamp(me.x + me.vx * dt, -23, 23);
    if (me.skill > 0) {
      me.skill -= dt;
      if (me.skill <= 0) me.tx = me.x;
    }
    me.cool -= dt;
    me.burst -= dt;
    if (me.passCool > 0) me.passCool -= dt;
    me.ph += sp * dt * 1.15;
    if (ball.owner === "me") {
      var bob = Math.abs(Math.sin(me.ph)) * 0.08;
      ball.x = me.x + me.vx * 0.06 + (me.skill > 0 ? me.skillDir * 0.25 : 0);
      ball.z = me.z - 0.62 - 0.12 * Math.sin(me.ph);
      ball.y = BALL_R + bob;
      ball.wx -= sp * dt * 3;
    }
  }

  function stepMates(dt) {
    var lastLine = offsideLine();
    for (var i = 0; i < mates.length; i++) {
      var m = mates[i];
      m.ph += dt * 7.2;
      var lead = curAtk.spec.offside ? 2.2 + 3.6 * Math.sin(simTime * 0.85 + m.off) : 2.6 + 1.2 * Math.sin(simTime * 0.6 + m.off);
      var tz = Math.max(9.5, me.z - lead);
      if (ball.owner === "mate" && ball.mate === m) tz = Math.max(9, m.z - 1);
      var vz = A.clamp((m.z - tz) * 2.5, -RUN_V, RUN_V * 1.25);
      m.z -= vz * dt;
      m.vz = vz;
      var tx = m.lane + Math.sin(simTime * 0.7 + m.off) * 1.2;
      m.x = A.approach(m.x, tx, 3 * dt);
      m.offside = !!(curAtk.spec.offside && m.z < me.z - 0.3 && m.z < lastLine - 0.15);
    }
  }
  /** Ofsayt çizgisi: sondan ikinci rakip (kaleci dahil, geçilenler de sahada) — yoksa −∞. */
  function offsideLine() {
    var zs = [gk.z];
    for (var i = 0; i < defs.length; i++) zs.push(defs[i].z);
    zs.sort(function (a, b) {
      return a - b;
    });
    return zs.length > 1 ? zs[1] : -1e9;
  }

  function stepDefs(dt) {
    var cp = carrierPos();
    var sp = me.sp;
    for (var i = 0; i < defs.length; i++) {
      var d = defs[i];
      d.t += dt;
      d.cool -= dt;
      var dx = me.x - d.x, dz = me.z - d.z, dist = Math.hypot(dx, dz);
      var moving = 0;
      if (d.st === "hold") {
        d.x = A.approach(d.x, A.clamp(cp.x * 0.85 + d.hx * 0.15, -18, 18), (1.6 + 3.2 * LV.diff) * dt);
        moving = 0.25;
        if (dz < 8 + 4 * (LV.lunge - 2.1) && dz > -0.5) {
          d.st = "press";
          d.t = 0;
        }
        if (dz < -0.5) d.st = "chase";
      } else if (d.st === "press" || d.st === "turn") {
        var v = LV.defSpeed * (d.st === "turn" ? 0.35 : 1);
        if (d.st === "turn" && d.t > 0.55) d.st = "press";
        var jockey = d.st === "press" && dz > 0 && dz < 2.7;
        if (jockey) {
          // yakında: geri geri gider, yolunu kapatır (yana kayarak seni izler)
          d.z -= 1.4 * dt;
          d.x = A.approach(d.x, me.x + me.vx * 0.12, (2.0 + 2.6 * LV.diff) * dt);
          d.dir = 0;
          moving = 0.45;
        } else {
          var px = me.x + me.vx * 0.25, pz = me.z - sp * 0.3;
          var ux = px - d.x, uz = pz - d.z, ul = Math.hypot(ux, uz) || 1;
          d.x += (ux / ul) * v * dt;
          d.z += (uz / ul) * v * dt;
          d.dir = Math.atan2(ux, uz);
          moving = v / RUN_V;
        }
        if (ball.owner === "me") {
          if (LV.slide && d.cool <= 0 && dist < LV.lunge && dz > 0.25 && !d.slid) {
            d.st = "windup";
            d.t = 0;
          } else if (dist < STEAL_R && me.skill <= 0 && dz > -0.4) {
            // önden çarpışma: çalım atmadıysan top onun
            d.contact += dt;
            if (d.contact > 0.05) {
              tackle(d, "steal");
              return;
            }
          } else d.contact = Math.max(0, d.contact - dt);
        }
        if (dz < -1.2) {
          d.st = "chase";
          d.t = 0;
        }
      } else if (d.st === "windup") {
        // telgraf: şerit sana döner, sonra kilitlenir
        var lx = me.x + me.vx * 0.18 - d.x, lz = me.z - sp * 0.18 - d.z, ll = Math.hypot(lx, lz) || 1;
        d.sx = lx / ll;
        d.sz = lz / ll;
        d.x += d.sx * 0.8 * dt;
        d.z += d.sz * 0.8 * dt;
        if (d.t >= LV.windup) {
          d.st = "slide";
          d.t = 0;
          d.slid = true;
          d.len = LV.lunge + 1.5;
          A.sound("slide");
        }
      } else if (d.st === "slide") {
        d.x += d.sx * 10.5 * dt;
        d.z += d.sz * 10.5 * dt;
        if (ball.owner === "me" && dist < TACKLE_R) {
          if (me.skill > 0 || me.jump > 0) {
            if (!d.beatenBy) beat(d, simTime - me.skillStart < 0.24 && LV.superSkill);
          } else {
            tackle(d, "slide");
            return;
          }
        }
        if (d.t * 10.5 >= d.len) {
          d.st = "down";
          d.t = 0;
          if (!d.beatenBy && ball.owner === "me" && dz < 0.4) beat(d, false, true);
        }
      } else if (d.st === "markm") {
        var mm = d.mate;
        var tx2 = mm.x + (me.x - mm.x) * 0.3, tz2 = mm.z + (me.z - mm.z) * 0.3;
        var mv = (2.4 + 3 * LV.diff) * dt;
        var ux3 = tx2 - d.x, uz3 = tz2 - d.z, ul3 = Math.hypot(ux3, uz3);
        if (ul3 > 0.01) {
          d.x += (ux3 / ul3) * Math.min(ul3, mv * 1.6);
          d.z += (uz3 / ul3) * Math.min(ul3, Math.max(mv * 1.6, RUN_V * 1.1 * dt));
        }
        moving = Math.min(1, ul3);
        d.dir = Math.atan2(ux3, uz3);
        if (ball.owner === "mate" && ball.mate === mm && Math.hypot(mm.x - d.x, mm.z - d.z) < 1.1) {
          d.contact += dt;
          if (d.contact > 0.15) {
            tackle(d, "mate");
            return;
          }
        }
      } else if (d.st === "down") {
        if (d.t > 1.3) {
          d.st = "chase";
          d.t = 0;
        }
      } else if (d.st === "beaten") {
        d.x += (d.bx || 0) * dt;
        if (d.t > 0.7) {
          d.st = "chase";
          d.t = 0;
        }
      } else if (d.st === "chase") {
        var cv = d.chaser ? RUN_V * (1.0 + 0.12 * LV.diff) : LV.defSpeed * 0.78;
        var ux2 = cp.x - d.x, uz2 = cp.z + 0.4 - d.z, ul2 = Math.hypot(ux2, uz2) || 1;
        d.x += (ux2 / ul2) * cv * dt;
        d.z += (uz2 / ul2) * cv * dt;
        d.dir = Math.atan2(ux2, uz2);
        moving = cv / RUN_V;
        if (d.chaser && ball.owner === "me" && dist < STEAL_R + 0.1 && me.skill <= 0 && me.burst <= 0) {
          d.contact += dt;
          if (d.contact > 0.15) {
            tackle(d, "behind");
            return;
          }
        } else d.contact = Math.max(0, d.contact - dt);
      }
      d.ph += dt * (2 + 8.5 * moving);
    }
  }

  /** Çalım: kısa kaçış; önündeki yapışan / kayan rakibi geçer. */
  function trySkill() {
    if ((state !== "live" && state !== "aim") || me.cool > 0 || ball.owner !== "me") return false;
    me.skill = skillLen();
    me.cool = skillCool();
    me.skillStart = simTime;
    var th = null, best = 1e9;
    for (var i = 0; i < defs.length; i++) {
      var d = defs[i];
      if (!activeDef(d)) continue;
      var dd = Math.hypot(d.x - me.x, d.z - me.z);
      if (dd < best && me.z - d.z > -0.6) {
        best = dd;
        th = d;
      }
    }
    var dir = th ? (me.x >= th.x ? 1 : -1) : me.vx >= 0 ? 1 : -1;
    if (th && Math.abs(me.x - th.x) < 0.15) dir = me.x > 0 ? -1 : 1;
    if (Math.abs(me.x + dir * 2.8) > 22) dir = -dir;
    me.skillDir = dir;
    var any = false;
    for (var j = 0; j < defs.length; j++) {
      var e = defs[j];
      var de = Math.hypot(e.x - me.x, e.z - me.z);
      if ((e.st === "press" || e.st === "windup" || e.st === "turn") && de < skillReach() && me.z - e.z > -0.4) {
        beat(e, false);
        any = true;
      } else if (e.st === "slide" && de < 2.2 && LV.superSkill) {
        beat(e, true);
        any = true;
      }
    }
    A.sound("swish");
    A.haptic("light");
    if (!any) A.floatText("ÇALIM", W / 2, H * 0.62, "#FFFFFF", 16);
    return true;
  }
  function beat(d, sup, quiet) {
    d.beatenBy = true;
    if (d.st !== "slide" && d.st !== "down") {
      d.st = "beaten";
      d.t = 0;
      d.bx = d.x > me.x ? 2.5 : -2.5;
    }
    d.contact = 0;
    tally.dribbles += 1;
    combo += 1;
    comboT = 2.2;
    if (sup) {
      tally.supers += 1;
      superT = 0.55;
      addRating(0.3);
      say("super");
      A.floatText("SÜPER ÇALIM!", W / 2, H * 0.5, "#FFD43B", 26);
      A.flash("#FFE58A", 0.2);
      A.punch(0.6);
    } else {
      addRating(quiet ? 0.06 : 0.12 + Math.min(0.12, combo * 0.03));
      if (!quiet) {
        say("calim");
        A.floatText(combo > 1 ? "ÇALIM ×" + combo : "ÇALIM!", W / 2, H * 0.5, "#7CF29A", 22);
      }
    }
    me.burst = Math.max(me.burst, 0.8);
    excite = Math.max(excite, 0.5);
    A.sound("pop");
    A.haptic("light");
  }
  function tackle(d, how) {
    ball.owner = "def";
    ball.def = d;
    d.st = "won";
    d.t = 0;
    me.down = 1;
    me.skill = 0;
    tally.lost += 1;
    addRating(-0.3);
    A.sound("crash");
    A.haptic("warning");
    A.shake(7);
    endAttack(false, how === "slide" ? "KAYDI, ALDI!" : how === "behind" ? "ARKADAN YETİŞTİ!" : how === "mate" ? "ARKADAŞIN KAPTIRDI" : "TOPU KAPTIRDIN", how === "mate" ? ["Dönüş yolu açılmadı"] : [], true);
  }

  /** Pas yolu: rakip keser mi? (pas çizgisi rengi ve bot için) */
  function laneCut(x0, z0, x1, z1) {
    var vx = x1 - x0, vz = z1 - z0, L2 = vx * vx + vz * vz || 1;
    var best = null, bt = 2;
    for (var i = 0; i < defs.length; i++) {
      var d = defs[i];
      if (!(d.st === "hold" || d.st === "press" || d.st === "windup" || d.st === "turn" || d.st === "markm")) continue;
      var t = ((d.x - x0) * vx + (d.z - z0) * vz) / L2;
      if (t < 0.12 || t > 0.96) continue;
      var px = x0 + vx * t, pz = z0 + vz * t;
      if (Math.hypot(d.x - px, d.z - pz) < INTERCEPT_R && t < bt) {
        bt = t;
        best = d;
      }
    }
    return best ? { d: best, t: bt } : null;
  }
  function passInfo(m) {
    var dist = Math.hypot(m.x - me.x, m.z - me.z);
    var T = dist / PASS_V;
    var tx = m.x, tz = m.z - (m.vz || 0) * T;
    var cut = laneCut(me.x, me.z, tx, tz);
    return { tx: tx, tz: tz, T: T, cut: cut, offside: m.offside, ok: !cut && !m.offside && ball.owner === "me" && !(me.passCool > 0) };
  }
  function tryPass(i) {
    var m = mates[i];
    if (!m || state !== "live" || ball.owner !== "me" || me.passCool > 0) return false;
    var pi = passInfo(m);
    ball.owner = "air";
    ball.pass = { x0: ball.x, z0: ball.z, x1: pi.tx, z1: pi.tz, t: 0, T: Math.max(0.2, pi.T), cut: pi.cut, mate: m, back: false, offside: pi.offside };
    me.burst = Math.max(me.burst, 1.4);
    for (var j = 0; j < defs.length; j++) if (defs[j].st === "press" && Math.hypot(defs[j].x - me.x, defs[j].z - me.z) < 6) {
      defs[j].st = "turn";
      defs[j].t = 0;
    }
    A.sound("kick");
    A.haptic("light");
    return true;
  }
  function stepPass(dt) {
    var p = ball.pass;
    if (!p) {
      if (ball.owner === "mate") {
        ball.hold -= dt;
        var m0 = ball.mate;
        ball.x = m0.x;
        ball.z = m0.z - 0.6;
        ball.y = BALL_R;
        var lead = 0.75;
        var tx = A.clamp(me.x + me.vx * 0.3, -22, 22), tz = me.z - me.sp * lead;
        var shut = !!laneCut(m0.x, m0.z, tx, tz);
        if (ball.hold <= 0 && (!shut || ball.hold < -0.8)) {
          // dönüş pası: koşunun önüne (yol kapalıysa aşırtma)
          var dist = Math.hypot(tx - m0.x, tz - m0.z);
          ball.owner = "air";
          var lob = shut;
          ball.pass = { x0: m0.x, z0: m0.z, x1: tx, z1: tz, t: 0, T: Math.max(0.25, dist / (lob ? PASS_V * 0.7 : PASS_V)), cut: null, mate: m0, back: true, lob: lob };
          A.sound("kick");
        }
      }
      return;
    }
    p.t += dt;
    var u = A.clamp(p.t / p.T, 0, 1);
    if (p.back) {
      // dönüş pası koşan oyuncuyu izler
      p.x1 = A.approach(p.x1, me.x, 4 * dt);
      p.z1 = Math.min(p.z1, me.z - 0.4);
    }
    ball.x = A.lerp(p.x0, p.x1, u);
    ball.z = A.lerp(p.z0, p.z1, u);
    ball.y = BALL_R + Math.sin(u * Math.PI) * (p.lob ? 2.6 : 0.25);
    ball.wx -= dt * 30;
    if (p.cut && u >= p.cut.t) {
      var d = p.cut.d;
      ball.pass = null;
      ball.owner = "def";
      ball.def = d;
      d.st = "won";
      d.t = 0;
      tally.lost += 1;
      addRating(-0.3);
      A.sound("thud");
      A.haptic("warning");
      endAttack(false, "PAS ARADA KALDI", [], true);
      return;
    }
    if (u >= 1) {
      ball.pass = null;
      if (!p.back) {
        if (p.offside) {
          tally.lost += 1;
          addRating(-0.25);
          A.sound("whistle");
          endAttack(false, "OFSAYT!", ["Bayrak kalktı"], true);
          return;
        }
        ball.owner = "mate";
        ball.mate = p.mate;
        ball.hold = 0.55;
      } else {
        ball.owner = "me";
        // verkaç yakındaki basan rakipleri geride bırakır
        for (var j = 0; j < defs.length; j++) {
          var e = defs[j];
          if ((e.st === "press" || e.st === "turn" || e.st === "windup") && Math.hypot(e.x - me.x, e.z - me.z) < 3.2) {
            e.st = "beaten";
            e.t = 0;
            e.bx = e.x > me.x ? 2 : -2;
            e.beatenBy = true;
          }
        }
        me.passCool = 2.2;
        tally.oneTwos += 1;
        atkFx.oneTwo = true;
        combo += 1;
        comboT = 2.2;
        addRating(0.2);
        me.burst = Math.max(me.burst, 1.0);
        say("verkac");
        A.floatText("VERKAÇ!", W / 2, H * 0.5, "#7DD3FC", 24);
        A.sound("pop");
        excite = Math.max(excite, 0.6);
      }
    }
  }

  /* ═══════════════════════════ KAFA VURUŞU ═══════════════════════════ */

  function crossWindow() {
    return [cross.T - 0.42, cross.T + 0.12];
  }
  function stepCross(dt) {
    var c = cross;
    c.t += dt;
    // sen: z topun düşeceği yere doğru kendiliğinden, x parmakla
    me.z = A.approach(me.z, c.L.z + 0.1, 4.2 * dt);
    var want = A.clamp((me.tx - me.x) * 7, -LAT_V, LAT_V);
    me.vx = A.approach(me.vx, want, (LV.rain ? 13 : 30) * dt);
    me.x = A.clamp(me.x + me.vx * dt, -12, 12);
    me.ph += dt * (2 + 5 * Math.abs(me.vx) / LAT_V + (Math.abs(me.z - c.L.z) > 0.4 ? 5 : 0));
    if (c.marker) {
      var mk = c.marker;
      if (c.t > 0) {
        // markajcı halkanın kale tarafına koşar; zorlukla topa daha çok yaklaşır
        var off = 0.95 - 0.45 * LV.diff;
        var ux = c.L.x + mk.side * off * 0.6 - mk.x, uz = c.L.z - off * 0.8 - mk.z, ul = Math.hypot(ux, uz);
        var v = LV.defSpeed * 0.5;
        if (ul > 0.05) {
          mk.x += (ux / ul) * Math.min(ul, v * dt);
          mk.z += (uz / ul) * Math.min(ul, v * dt);
        }
        mk.ph += dt * 6;
      }
    }
    if (me.jump > 0) me.jump = Math.max(0, me.jump - dt * 1.6);
    if (c.t < 0) {
      ball.x = c.C.x;
      ball.y = BALL_R;
      ball.z = c.C.z;
      return;
    }
    if (c.t === dt || c.t - dt < 0) A.sound("kick");
    var t = Math.min(c.t, c.T + 0.6);
    ball.x = c.C.x + c.v.x * t;
    ball.z = c.C.z + c.v.z * t;
    ball.y = c.C.y + c.v.y * t - 0.5 * GRAV * t * t;
    ball.wx -= dt * 20;
    var w = crossWindow();
    if (c.tap != null && c.t >= Math.max(c.T, c.tap) && !c.done) {
      c.done = true;
      resolveHeader();
      return;
    }
    if (c.tap == null && c.t > w[1] && !c.done) {
      c.done = true;
      endAttack(false, "ISKA!", ["Topa vuramadın"], false);
    }
  }
  /** Kafa için dokunuş: kalenin (gx, gy) noktası. */
  function headerTap(gx, gy) {
    if (state !== "cross" || !cross || cross.tap != null || cross.t < 0) return false;
    var w = crossWindow();
    if (cross.t < w[0]) {
      // erken sıçrama
      cross.tap = cross.t;
      cross.early = true;
      me.jump = 1;
      A.sound("jump");
      cross.done = true;
      endAttack(false, "ERKEN SIÇRADIN", ["Halka yeşilken dokun"], false);
      return true;
    }
    cross.tap = cross.t;
    cross.gx = A.clamp(gx, -HALF - 0.8, HALF + 0.8);
    cross.gy = A.clamp(gy, 0.15, GOAL_H + 0.6);
    me.jump = 1;
    A.sound("jump");
    return true;
  }
  function resolveHeader() {
    var c = cross;
    var e = Math.hypot(me.x - c.L.x, me.z - c.L.z);
    if (c.marker) {
      var em = Math.hypot(c.marker.x - c.L.x, c.marker.z - c.L.z);
      if (em < 1.0 && em + 0.12 < e) {
        c.marker.jump = 1;
        tally.lost += 1;
        addRating(-0.2);
        endAttack(false, "SAVUNMA ÖNDE ÇIKTI", ["Halkanın altına önce sen gir"], true);
        return;
      }
    }
    if (e > 1.15) {
      endAttack(false, "TOPA YETİŞEMEDİN", ["Halkanın altına koş"], false);
      return;
    }
    var q = A.clamp(1 - Math.abs(c.tap - (c.T - 0.1)) / 0.34, 0, 1);
    var sig = 0.18 + 0.7 * (1 - q) + 0.45 * e;
    var tx = c.gx + rgauss(0, sig), ty = Math.max(0.12, c.gy + rgauss(0, sig * 0.6));
    ball = newBall();
    ball.x = c.L.x;
    ball.y = c.L.y;
    ball.z = c.L.z;
    ball.owner = "shot";
    shot = { kind: "kafa", q: q, tx: tx, ty: ty, ox: c.L.x, oz: c.L.z };
    kickAt = simTime;
    aimLaunch(ball, tx, ty, 13 + 4 * q, 0);
    keeperDecides("kafa");
    keeperThink();
    tally.shots += 1;
    tally.headers += 1;
    A.sound("thud");
    A.haptic("medium");
    setState("flight");
  }

  /* ═══════════════════════════ AKIŞ ═══════════════════════════ */

  function setState(s) {
    state = s;
    stateT = 0;
  }
  function levelConfig(cmd) {
    if (!cmd || typeof cmd !== "object") return;
    if (cmd.levelMode != null) levelCfg.on = !!cmd.levelMode;
    if (cmd.level != null) levelCfg.level = Math.max(1, Math.floor(Number(cmd.level)) || 1);
    if (Array.isArray(cmd.boosters)) levelCfg.boosters = cmd.boosters.map(String);
    if (cmd.boosterStock && typeof cmd.boosterStock === "object") levelCfg.stock = cmd.boosterStock;
  }
  function start() {
    startLevel(levelCfg.level);
  }
  function startLevel(n) {
    LV = levelSpec(n);
    lvRand = A.seeded(LV.seed);
    lvl = { rating: 6.0, continues: 0, krampon: false, freeRetry: 0, asked: false, retried: {}, stars: 0, extra: 0, won: false };
    tally = { goals: 0, shots: 0, onTarget: 0, dribbles: 0, supers: 0, oneTwos: 0, lost: 0, headers: 0, fk: 0, pens: 0 };
    score = { me: 0, op: 0 };
    results = LV.attacks.map(function () {
      return null;
    });
    history = [];
    combo = 0;
    A.particles.length = 0;
    A.floaters.length = 0;
    A.banner = null;
    line = null;
    setupIdentity();
    levelCfg.boosters.forEach(function (k) {
      applyBooster(k, true);
    });
    timeline = [];
    LV.attacks.forEach(function (a, i) {
      timeline.push({ type: "atk", idx: i, minute: a.minute, spec: a });
    });
    LV.rivalAt.forEach(function (m, j) {
      timeline.push({ type: "riv", minute: m, idx: j });
    });
    timeline.sort(function (a, b) {
      return a.minute - b.minute || (a.type === "atk" ? -1 : 1);
    });
    tlIdx = 0;
    minuteNow = 0;
    curAtk = null;
    resetScene(40);
    castSig = "";
    camCut = true;
    A.send("levelInfo", { level: n, goal: goalText(LV), tip: unlockOf(n) ? unlockOf(n).text : null });
    setState(LV.promo ? "promo" : "intro");
    if (LV.promo) {
      A.sound("level");
      A.confetti(W * 0.5, H * 0.3, 60, [club.kit.primary, club.kit.secondary, "#FFD24A", "#FFFFFF"]);
    } else A.sound("whistle");
  }
  /** Sahneyi sakin bir orta saha görüntüsüne kur (tanıtım kartlarının arkası). */
  function resetScene(z) {
    me = newMe();
    me.z = z;
    ball = newBall();
    ball.z = z - 0.6;
    gk = newKeeper();
    mates = [];
    defs = [];
    wall = null;
    cross = null;
    shot = null;
    replay = null;
    recording = [];
    celebrate = null;
    slow = 1;
    slowT = 0;
    slowDone = false;
    superT = 0;
    netReset();
  }

  function applyBooster(key, pre) {
    if (!lvl) return false;
    if (key === "krampon") {
      if (lvl.krampon) return false;
      lvl.krampon = true;
      if (!pre) A.floatText("YENİ KRAMPONLAR!", W / 2, H * 0.36, "#34D399", 24);
    } else if (key === "ikinci_sans") {
      if (pre) {
        lvl.freeRetry += 1;
        return true;
      }
      if (state !== "result" || !resInfo || !resInfo.retry) return false;
      retryAttack();
    } else return false;
    if (!pre) {
      A.sound("level");
      A.haptic("medium");
    }
    return true;
  }

  /** Sıradaki olay: atak ya da rakip golü; olay yoksa maç biter. */
  function nextEvent() {
    if (tlIdx >= timeline.length) {
      matchOver();
      return;
    }
    var ev = timeline[tlIdx++];
    minuteNow = ev.minute;
    if (ev.type === "riv") {
      rivalGoal(ev);
      return;
    }
    startAttack(ev);
  }
  function rivalGoal(ev) {
    score.op += 1;
    var r = A.seeded(LV.seed + 577 * (score.op + 3))();
    rivEvent = { minute: ev.minute, scorer: rival.players[Math.floor(r * 3) % rival.players.length], counter: !!ev.counter };
    scoreBump = 1;
    A.sound("groan");
    A.haptic("warning");
    say("rakip");
    setState("rival");
  }

  function startAttack(ev) {
    curAtk = ev;
    var sp = ev.spec;
    lvRand = A.seeded(LV.seed + 1013 * (ev.idx + 1) + 7919 * (ev.extra || 0));
    resetScene(40);
    atkFx = { oneTwo: false };
    combo = 0;
    resInfo = null;
    atkMul = sp.kind === "kontra" ? 1.1 : 1;
    if (sp.kind === "atak" || sp.kind === "kontra") setupOpen(sp);
    else if (sp.kind === "kafa") setupCross(sp);
    else if (sp.kind === "frikik") setupFreeKick();
    else setupPenalty();
    camCut = true;
    setState("pre");
    A.sound("whistle");
  }
  function setupOpen(sp) {
    var startZ = sp.kind === "kontra" ? 54 : 38 + rnd() * 8 + Math.max(0, sp.defs - 3) * 3.5;
    me.x = (rnd() - 0.5) * 8;
    me.tx = me.x;
    me.z = startZ;
    ball.owner = "me";
    ball.x = me.x;
    ball.z = me.z - 0.6;
    shootZ = 15.6 + rnd() * 2.4;
    var side0 = me.x > 0 ? -1 : 1;
    for (var i = 0; i < sp.mates; i++) {
      var side = i === 0 ? side0 : -side0;
      var lane = side * (6.5 + rnd() * 3.5);
      mates.push({ x: lane, z: startZ - 2 - rnd() * 3, lane: lane, ph: rnd() * 6, off: rnd() * 6, vz: 0, person: matesPool[i % matesPool.length], offside: false });
    }
    var n = sp.defs;
    var z0 = startZ - 9, z1 = shootZ + 2.5;
    var rows = sp.press ? Math.ceil(n / 2) : n;
    var k = 0;
    for (var r = 0; r < rows; r++) {
      var z = rows > 1 ? A.lerp(z0, z1, r / (rows - 1)) : (z0 + z1) / 2;
      var cx = A.clamp(me.x * 0.4 + (rnd() - 0.5) * 9, -11, 11);
      var pair = sp.press && k + 1 < n;
      for (var p = 0; p < (pair ? 2 : 1); p++) {
        var x = pair ? cx + (p ? 1.6 : -1.6) : cx;
        defs.push(newDef(x, z - p * 0.8, k));
        k += 1;
      }
    }
    // adam adama: 3+ savunmacıda (zorluk > 0,12) her arkadaşa bir markajcı
    var marks = LV.diff > 0.12 ? Math.min(mates.length, n >= 5 ? 2 : n >= 3 ? 1 : 0) : 0;
    for (var mk = 0; mk < marks; mk++) {
      var md = defs[defs.length - 1 - mk];
      md.st = "markm";
      md.mate = mates[mk];
      md.x = mates[mk].x * 0.8;
      md.z = mates[mk].z - 2;
    }
    if (sp.chaser) {
      var ch = newDef(me.x + (rnd() - 0.5) * 3, startZ + 5.5, 7);
      ch.st = "chase";
      ch.chaser = true;
      defs.push(ch);
    }
  }
  function newDef(x, z, k) {
    return { x: x, z: z, hx: x, hz: z, st: "hold", t: 0, ph: rnd() * 6, person: rival.players[k % rival.players.length], cool: 0, contact: 0, sx: 0, sz: 1, dir: 0, slid: false, beatenBy: false, k: k };
  }
  function setupCross(sp) {
    var side = rnd() < 0.5 ? -1 : 1;
    var L = { x: (rnd() - 0.5) * 4.4, y: 1.95, z: 7.4 + rnd() * 3 };
    var T = r2(1.35 - 0.3 * LV.diff);
    var C = { x: side * 23, y: 0.35, z: 10.5 + rnd() * 2 };
    cross = { side: side, L: L, T: T, C: C, t: -0.8, v: { x: (L.x - C.x) / T, z: (L.z - C.z) / T, y: (L.y - C.y + 0.5 * GRAV * T * T) / T }, tap: null, done: false, marker: null, crosser: { x: C.x + side * 0.3, z: C.z + 0.5, ph: 0, person: matesPool[1 % matesPool.length] } };
    var off = (rnd() < 0.5 ? -1 : 1) * (1.6 + rnd() * 1.8);
    me.x = A.clamp(L.x + off, -10, 10);
    me.tx = me.x;
    me.z = L.z + 4.5;
    ball.owner = "cross";
    if (LV.diff > 0.05 && unlockAt("defans") <= LV.level) {
      var m = newDef(L.x - off * 0.6 + (rnd() - 0.5), L.z - 1.4, 2);
      m.st = "mark";
      m.side = off > 0 ? -1 : 1;
      cross.marker = m;
      defs.push(m);
    }
  }
  function setupFreeKick() {
    var fx = (rnd() - 0.5) * 14, fz = 19 + rnd() * 7;
    var dist = Math.hypot(fx, fz);
    var wz = fz - (9.15 * fz) / dist;
    var near = (Math.sign(fx) || 1) * 1.1;
    var wx = fx + ((near - fx) * (fz - wz)) / fz;
    wall = { x: wx, z: wz, n: A.clamp(3 + Math.round(LV.diff * 1.4), 3, 4), jump: 0, jumpT: -1 };
    ball.owner = "set";
    ball.x = fx;
    ball.z = fz;
    ball.y = BALL_R;
    me.x = fx - 0.45;
    me.z = fz + 1.6;
    me.tx = me.x;
    gk.homeX = Math.abs(fx) < 2.5 ? 0 : -Math.sign(fx) * 0.45;
    gk.x = gk.homeX;
    aim.x = -Math.sign(fx || 1) * 2.4;
    aim.y = 1.9;
  }
  function setupPenalty() {
    ball.owner = "set";
    ball.x = 0;
    ball.z = SPOT_Z;
    ball.y = BALL_R;
    me.x = -1.15;
    me.z = SPOT_Z + 2.1;
    me.tx = me.x;
    aim.x = 0;
    aim.y = 1.1;
  }

  /** Atak başladı: türe göre canlı evre. */
  function goLive() {
    var k = curAtk.spec.kind;
    if (k === "atak" || k === "kontra") setState("live");
    else if (k === "kafa") setState("cross");
    else {
      aimT = 0;
      setState("aim");
    }
    A.sound("whistle");
  }
  function isSetPiece() {
    return curAtk && (curAtk.spec.kind === "penalti" || curAtk.spec.kind === "frikik");
  }
  function enterAim() {
    aim.x = me.x > 0.5 ? -2.2 : me.x < -0.5 ? 2.2 : 2.0;
    aim.y = 0.85;
    aimT = 0;
    dragFrom = null;
    steerFrom = null;
    setState("aim");
    A.sound("whoosh");
    A.haptic("light");
  }
  function lockAim() {
    powerT = 0;
    powerV = 0;
    dragFrom = null;
    setState("power");
  }
  function takeShot(v) {
    if (state !== "power" && state !== "aim") return;
    var ae = aimNow();
    var kind = curAtk.spec.kind;
    var m = shotModel(ae.x, ae.y, v, ball.x, ball.z, kind);
    if (LV.rain) {
      m.tx += rgauss(0, 0.12);
      m.ty = Math.max(BALL_R, m.ty + rgauss(0, 0.06));
    }
    shot = { kind: kind, tx: m.tx, ty: m.ty, speed: m.speed, curl: m.curl, q: powerQuality(v), v: v, over: m.over, under: m.under, aimX: ae.x, aimY: ae.y };
    tally.shots += 1;
    if (kind === "penalti") history.push(ae.x < -1 ? -1 : ae.x > 1 ? 1 : 0);
    setState("runup");
  }
  function runupLen() {
    var k = curAtk.spec.kind;
    return k === "penalti" ? 1.15 : k === "frikik" ? 0.85 : 0.24;
  }
  function strike() {
    kickAt = simTime;
    var ox = ball.x, oz = ball.z;
    ball = newBall();
    ball.x = ox;
    ball.z = oz;
    ball.owner = "shot";
    shot.ox = ox;
    shot.oz = oz;
    aimLaunch(ball, shot.tx, shot.ty, shot.speed, shot.curl);
    keeperDecides(shot.kind);
    keeperThink();
    if (wall) {
      wall.jumpT = simTime;
    }
    setState("flight");
    A.sound("kick");
    A.haptic("medium");
    var sp = proj(ox, 0.05, oz);
    A.burst(sp.x, sp.y, 14, { angle: -Math.PI / 2, spread: 1.8, speed: 170, gravity: 560, life: 0.55, size: 4, color: ["#2FA544", "#5FD35F", "#8BE36B", "#FFFFFF"] });
  }

  /** Atak bitti. good: gol; lost: top rakipte (kontra riski tam). */
  function endAttack(good, label, tags, lost) {
    var idx = curAtk.idx;
    var retry = !good && !curAtk.extra && !lvl.retried[idx];
    resInfo = { good: good, label: label, tags: tags || [], lost: !!lost, retry: retry, free: retry && lvl.freeRetry > 0 };
    lvl.asked = false;
    if (curAtk.extra == null || true) results[idx] = good ? "g" : "x";
    if (!good) combo = 0;
    setState("result");
  }

  var REPLAY_AT = 1.5;
  function resultLen() {
    if (!resInfo) return 1.8;
    if (resInfo.good) return replay ? REPLAY_AT + REPLAY_LEN + 0.3 : 2.6;
    return resInfo.retry ? 3.0 : 2.0;
  }
  /** Şut sonucu: gol mü, ne oldu? */
  function settle(result) {
    var scored = result === "gol";
    var tags = [];
    var kind = shot ? shot.kind : "atak";
    if (scored) {
      score.me += 1;
      tally.goals += 1;
      tally.onTarget += 1;
      scoreBump = 1;
      var g = 0.7;
      var corner = Math.abs(ball.x) > HALF - 1.26, high = ball.y > GOAL_H - 0.8;
      if (corner && high) {
        tags.push("DOKSAN");
        g += 0.3;
      } else if (corner) {
        tags.push("KÖŞE");
        g += 0.15;
      }
      if (kind === "kafa") {
        tags.push("KAFA");
        g += 0.15;
      } else if (kind === "frikik") {
        tags.push("FRİKİK GOLÜ");
        tally.fk += 1;
        g += 0.2;
      } else if (kind === "penalti") {
        tags.push("PENALTI");
        tally.pens += 1;
        g -= 0.2;
      }
      if (atkFx.oneTwo) {
        tags.push("VERKAÇ GOLÜ");
        g += 0.2;
      }
      if (combo >= 2) tags.push("KOMBO ×" + combo);
      addRating(g);
      excite = 1;
      A.sound("cheer");
      A.haptic("success");
      var bp = proj(ball.x, ball.y, ball.z);
      A.burst(bp.x, bp.y, 70, { angle: -Math.PI / 2, spread: Math.PI * 1.3, speed: 420, gravity: 520, life: 1.6, size: 7, color: [club.kit.primary, club.kit.secondary, "#FFD24A", "#FFFFFF"], shape: "confetti", drag: 1.4 });
      A.confetti(W * 0.2, H * 0.35, 30);
      A.confetti(W * 0.8, H * 0.35, 30);
      A.shake(6);
      celebrate = { t: 0, dir: me.x >= 0 ? 1 : -1 };
      if (!A.reduceMotion && VIS && recording.length > 10) replay = { frames: recording };
      recording = [];
      say(kind === "kafa" ? "kafa" : kind === "frikik" ? "frikik" : "gol");
      endAttack(true, "GOL!", tags, false);
      return;
    }
    if (result === "kurtaris" || result === "direk") tally.onTarget += result === "kurtaris" ? 1 : 0;
    addRating(result === "kurtaris" ? -0.05 : -0.15);
    if (shot && shot.over > 0.015) tags.push("FAZLA GÜÇ");
    else if (shot && shot.under > 0.015) tags.push("ZAYIF VURUŞ");
    A.sound("groan");
    A.haptic("warning");
    recording = [];
    say(result);
    endAttack(false, LABELS[result] || "KAÇTI", tags, false);
  }
  var LABELS = { kurtaris: "KURTARIŞ!", direk: "DİREK!", aut: "AUT!", baraj: "BARAJ!" };

  /** Sonuç ekranı bitti: kontra riski, sıradaki olay. */
  function afterResult() {
    var info = resInfo;
    resInfo = null;
    if (info && !info.good) {
      var p = LV.counterP * (info.lost ? 1 : 0.4);
      var r = A.seeded(LV.seed + 31 * (curAtk.idx + 1) + 97 * (curAtk.extra || 0))();
      if (r < p) timeline.splice(tlIdx, 0, { type: "riv", minute: Math.min(90, curAtk.minute + 2), counter: true });
    }
    nextEvent();
  }
  /** İkinci Şans: atak yeniden (aynı dizilim). */
  function retryAttack() {
    var idx = curAtk.idx;
    lvl.retried[idx] = true;
    results[idx] = null;
    // atakta düşen reyting geri gelir
    if (resInfo && resInfo.lost) addRating(0.3);
    resInfo = null;
    A.floatText("İKİNCİ ŞANS!", W / 2, H * 0.36, "#38BDF8", 24);
    startAttack(curAtk);
  }
  function requestRetry() {
    if (!resInfo || !resInfo.retry || lvl.asked) return;
    if (lvl.freeRetry > 0) {
      lvl.freeRetry -= 1;
      lvl.retried[curAtk.idx] = true;
      A.sound("level");
      retryAttack();
      return;
    }
    lvl.asked = true;
    A.send("useBooster", { key: "ikinci_sans" });
    A.haptic("light");
  }

  function addRating(v) {
    if (!lvl) return;
    lvl.rating = A.clamp(lvl.rating + v, 3, 10);
    ratingBump = 1;
  }
  function levelStars() {
    var st = 1;
    if (lvl.rating >= LV.star2) st = 2;
    if (lvl.rating >= LV.star3) st = 3;
    if (lvl.continues > 0) st = Math.min(st, 2);
    return st;
  }
  /** Maç bitti: kazandın mı? */
  function matchOver() {
    if (score.me > score.op) {
      lvl.won = true;
      addRating(0.3 + (score.op === 0 ? 0.2 : 0));
      lvl.stars = levelStars();
      excite = 1;
      A.sound("level");
      A.haptic("success");
      setState("end");
      return;
    }
    var need = score.op - score.me + 1;
    if (need <= 2 && lvl.continues < 2) {
      lvl.need = need;
      setState("fail");
      A.send("fail", { level: LV.level, canContinue: true, extra: need });
      A.sound("groan");
      return;
    }
    lvl.won = false;
    A.sound("over");
    A.haptic("warning");
    setState("end");
  }
  function continueLevel(extra) {
    if (state !== "fail" || !LV) return false;
    lvl.continues += 1;
    var n = Math.max(1, Math.min(3, Math.floor(Number(extra && extra.attacks)) || lvl.need || 1));
    var base = null;
    for (var i = LV.attacks.length - 1; i >= 0; i--) if (LV.attacks[i].kind === "atak") base = LV.attacks[i];
    base = base || { kind: "atak", defs: 1, mates: 0, press: false, chaser: false, offside: false };
    for (var k = 0; k < n; k++) {
      lvl.extra += 1;
      results.push(null);
      timeline.push({ type: "atk", idx: results.length - 1, minute: 90 + lvl.extra * 2, spec: Object.assign({}, base, { kind: "atak" }), extra: lvl.extra });
    }
    A.floatText("UZATMA: +" + n + " ATAK", W / 2, H * 0.36, "#FFD43B", 24);
    A.sound("whistle");
    nextEvent();
    return true;
  }
  function finishLevel(won) {
    setState("over");
    A.send("over", {
      score: Math.round(lvl.rating * 10),
      stats: {
        level: LV.level,
        won: won ? 1 : 0,
        stars: won ? lvl.stars : 0,
        goals: score.me,
        rival: score.op,
        rating: Math.round(lvl.rating * 10),
        shots: tally.shots,
        dribbles: tally.dribbles,
        passes: tally.oneTwos,
        attacks: results.length,
        boss: LV.boss ? 1 : 0,
      },
    });
  }
  function command(cmd) {
    if (!cmd) return;
    if (cmd.type === "config") levelConfig(cmd);
    else if (cmd.type === "booster") {
      if (LV && state !== "over") applyBooster(String(cmd.key), false);
      if (lvl) lvl.asked = false;
    } else if (cmd.type === "continue") continueLevel(cmd.extra);
    else if (cmd.type === "giveUp") {
      if (LV && state !== "over") finishLevel(false);
    }
  }

  /* ─────────────── spiker ─────────────── */

  function say(kind) {
    var S = hero.short, K = rival.keeper.short, R = teamName(rival.keeper);
    var L = {
      gol: [S + " affetmedi, gol!", "Ağlar havalandı! " + S, S + " kaleciyi avlıyor!", "Ne vuruş! " + S + " köşeye bıraktı."],
      kafa: ["Kafayı vurdu, gol! " + S + " havada kral!", "Müthiş kafa! " + S],
      frikik: ["Frikikten nefis gol! " + S, "Barajın üstünden doksana!"],
      kurtaris: [K + " uçtu, kurtardı!", "Müthiş refleks: " + K],
      direk: ["Direkten döndü!", S + " direği sarstı!"],
      aut: ["Top auta gitti.", S + " çerçeveyi bulamadı."],
      baraj: ["Baraj geçit vermedi!"],
      calim: [S + " geçti!", "Çalım! Rakip yerde kaldı.", S + " bir kişiyi daha geçti!"],
      super: ["SÜPER ÇALIM! Tribünler ayakta!", S + " rakibi yere oturttu!"],
      verkac: ["Verkaç! Savunma çözüldü.", "Nefis duvar pası!"],
      rakip: [R + " golü buldu.", "Rakip skoru değiştirdi: " + R],
    }[kind] || [];
    if (!L.length) return;
    line = { text: L[Math.floor(Math.random() * L.length)], good: kind !== "kurtaris" && kind !== "direk" && kind !== "aut" && kind !== "baraj" && kind !== "rakip" };
    lineT = 0;
  }

  /* ═══════════════════════════ GÜNCELLEME ═══════════════════════════ */

  function introLen() {
    return LV && LV.intro ? 5.2 : 3.6;
  }
  function worldScale() {
    var s = 1;
    if ((state === "aim" || state === "power") && !isSetPiece()) s = SLOWMO;
    if (superT > 0) s = Math.min(s, 0.3);
    if (state === "flight") s = slow;
    return s;
  }

  function update(dt) {
    scoreBump = Math.max(0, scoreBump - dt * 3);
    ratingBump = Math.max(0, ratingBump - dt * 3);
    lineT += dt;
    excite = Math.max(0, excite - dt * 0.35);
    comboT -= dt;
    if (comboT <= 0 && state === "live") combo = 0;
    stateT += dt;
    if (superT > 0) superT -= dt;
    var wdt = dt * worldScale();
    simTime += wdt;
    netStep(dt);
    if (wall && wall.jumpT >= 0) wall.jump = Math.max(0, Math.sin(A.clamp((simTime - wall.jumpT) / 0.6, 0, 1) * Math.PI));
    switch (state) {
      case "attract":
        me.ph += dt * 3;
        return;
      case "promo":
        if (stateT >= 4.6) setState("intro");
        return;
      case "intro":
        if (stateT >= introLen()) nextEvent();
        return;
      case "rival":
        if (stateT >= 2.2) nextEvent();
        return;
      case "pre":
        keeperPosition(dt);
        if (stateT >= 1.25) goLive();
        return;
      case "live":
        stepMe(wdt, false);
        stepMates(wdt);
        stepPass(wdt);
        if (state !== "live") return;
        stepDefs(wdt);
        if (state !== "live") return;
        keeperPosition(wdt);
        if (me.z <= shootZ + 0.5 && ball.owner === "me") enterAim();
        return;
      case "cross":
        stepCross(wdt);
        keeperPosition(wdt);
        return;
      case "aim":
      case "power":
        if (!isSetPiece()) {
          stepMe(wdt, true);
          stepMates(wdt);
          stepDefs(wdt);
          if (state !== "aim" && state !== "power") return;
          keeperPosition(wdt);
        } else {
          gk.crouch = 0.72 + 0.06 * Math.sin(A.time * 2.4);
          gk.x = (gk.homeX || 0) + (Math.sin(A.time * 1.25) * 0.7 + Math.sin(A.time * 2.9) * 0.3) * (0.08 + 0.22 * kD());
          me.ph += dt * 1.4;
        }
        if (state === "aim") {
          aimT += dt;
          if (aimT >= LV.aimTime + (isSetPiece() ? 2.5 : 0)) lockAim();
        } else {
          powerT += dt;
          powerV = powerAt(powerT);
          if (powerT > 3) takeShot(powerV);
        }
        return;
      case "runup":
        if (!isSetPiece()) {
          stepMe(wdt * 0.3, true);
          stepDefs(wdt * 0.3);
          if (state !== "runup") return;
        } else gk.crouch = Math.min(1, gk.crouch + dt * 2);
        if (stateT >= runupLen()) strike();
        return;
      case "flight":
        keeperThink();
        stepBall(wdt);
        closeCall(dt);
        record();
        if (!isSetPiece() && curAtk.spec.kind !== "kafa") stepDefs(wdt * 0.6);
        var res = judge();
        if (res) {
          slow = 1;
          settle(res);
        }
        return;
      case "result":
        stepBall(dt);
        gk.cheer = Math.min(1, gk.cheer + dt * 2);
        stepCelebrate(dt);
        // İkinci Şans soruldu: çerçevenin yanıtını bekle
        if (lvl.asked && resInfo && resInfo.retry) stateT = Math.min(stateT, resultLen() - 0.4);
        if (stateT >= resultLen()) afterResult();
        return;
      case "fail":
        return;
      case "end":
        stepCelebrate(dt);
        if (stateT >= 3.8) finishLevel(lvl.won);
        return;
    }
  }
  /** Gol sevinci: köşe bayrağına koşu, arkadaşlar gelir. */
  function stepCelebrate(dt) {
    if (!celebrate) return;
    celebrate.t += dt;
    if (state !== "result" || !inReplay()) {
      var tx = celebrate.dir * 9, tz = 6;
      var ux = tx - me.x, uz = tz - me.z, ul = Math.hypot(ux, uz);
      if (ul > 0.5 && celebrate.t > 0.35) {
        me.x += (ux / ul) * 4.5 * dt;
        me.z += (uz / ul) * 4.5 * dt;
        me.ph += dt * 6;
      }
      for (var i = 0; i < mates.length; i++) {
        var m = mates[i];
        var vx = me.x - m.x - (i ? 0.8 : -0.8), vz = me.z + 0.9 - m.z, vl = Math.hypot(vx, vz);
        if (vl > 0.6) {
          m.x += (vx / vl) * 6 * dt;
          m.z += (vz / vl) * 6 * dt;
          m.ph += dt * 8;
        }
      }
    }
  }
  function closeCall(dt) {
    if (slowT > 0) {
      slowT -= dt;
      if (slowT <= 0) slow = 1;
      return;
    }
    if (slowDone || !gk.dive || A.reduceMotion || Math.abs(ball.z - gk.z) > 2.2) return;
    var kb = keeperBody(gk, simTime);
    var hx = kb.cx + kb.ax * ARM, hy = kb.cy + kb.ay * ARM;
    if (Math.hypot(ball.x - hx, ball.y - hy) < 0.8) {
      slowDone = true;
      slow = 0.3;
      slowT = 0.5;
    }
  }
  var recAcc = 0;
  function record() {
    recAcc += 1;
    if (recAcc % 2) return;
    recording.push({ t: simTime, bx: ball.x, by: ball.y, bz: ball.z, k: { x: gk.x, z: gk.z, dive: gk.dive, stay: gk.stay, set: gk.set, crouch: gk.crouch }, mx: me.x, mz: me.z });
  }

  /* ═══════════════════════════ 2B ÇİZİM ═══════════════════════════
   * Penaltı ile aynı aile: koyu lacivert konturlu, doygun renkli, yuvarlak
   * hatlı "flat vector" çizim. Kamera bir iğne deliği kamerasıdır ama
   * Penaltı'nın sabit kamerasından farklı olarak yatayda döner (yaw) ve
   * öne eğilir (pitch): koşarken oyuncunun arkasından geniş açı, şutta topun
   * arkasından kaleye bakan dar açı. Statik parçalar (gökyüzü + şehir,
   * tribün karosu) ekran dışı katmanlara bir kez çizilir.
   */

  A.FONT = '"SF Pro Rounded", ui-rounded, "Nunito", "Arial Rounded MT Bold", -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif';
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
  /** Rakibin sahadaki forması: bizimkine benziyorsa deplasman (ikinci renk). */
  function rivalKit() {
    var r = kit2(rival.keeper), m = kit2(hero);
    if (colDist(r.p, m.p) < 110) return { p: r.s, s: r.p };
    return r;
  }
  function heroKit() {
    return kit2(hero);
  }

  /* ─────────────── kamera ─────────────── */

  var cam = { x: 0, y: 5, z: 50, yaw: 0, pitch: 0.16, f: 420, hz: 200 };
  var camCut = true, camMode = "";
  var cY = 1, sY = 0, cP = 1, sP = 0;
  function camPrep() {
    cY = Math.cos(cam.yaw);
    sY = Math.sin(cam.yaw);
    cP = Math.cos(cam.pitch);
    sP = Math.sin(cam.pitch);
  }
  /** Dünya noktası → kamera uzayı [sağ, yukarı, derinlik]. */
  function camSpace(x, y, z) {
    var rx0 = x - cam.x, ry = y - cam.y, rz = z - cam.z;
    var rx = rx0 * cY + rz * sY;
    var rf = rx0 * sY - rz * cY;
    return [rx, ry * cP + rf * sP, rf * cP - ry * sP];
  }
  /** Dünya noktasının ekran konumu; s = metre başına piksel, d = derinlik. */
  function proj(x, y, z) {
    var q = camSpace(x, y, z);
    var d = Math.max(0.25, q[2]), s = cam.f / d;
    return { x: W / 2 + q[0] * s, y: cam.hz - q[1] * s, s: s, d: q[2] };
  }
  /** Ekran noktasından z = pz düzlemine ışın (kafa vuruşu nişanı). */
  function unproject(sx, sy, pz) {
    var dx = (sx - W / 2) / cam.f, dy = -(sy - cam.hz) / cam.f;
    // kamera eksenleri (dünya)
    var fx = sY * cP, fy = -sP, fz = -cY * cP;
    var ux = sY * sP, uy = cP, uz = -cY * sP;
    var rx = cY, rz = sY;
    var Dx = rx * dx + ux * dy + fx, Dy = uy * dy + fy, Dz = rz * dx + uz * dy + fz;
    if (Math.abs(Dz) < 1e-6) return null;
    var t = (pz - cam.z) / Dz;
    if (t <= 0) return null;
    return { x: cam.x + Dx * t, y: cam.y + Dy * t };
  }

  /** Gol tekrarının o anki karesi (0,42× yavaş çekim). */
  function replayFrame() {
    var fr = replay.frames;
    var rt = fr[0].t + (stateT - REPLAY_AT) * 0.42 - 0.2;
    var i = 0;
    while (i < fr.length - 1 && fr[i + 1].t < rt) i++;
    var f = fr[i];
    return { bx: f.bx, by: f.by, bz: f.bz, k: f.k, mx: f.mx, mz: f.mz, rt: rt };
  }
  function inReplay() {
    return state === "result" && !!replay && resInfo && resInfo.good && stateT > REPLAY_AT && stateT < REPLAY_AT + REPLAY_LEN;
  }

  /** Bu karedeki kamera hedefi: konum, yön, odak; `ay` ekranda `ax,ay0,az` noktasının yüksekliği. */
  function camTarget() {
    var t = A.time;
    var v = { x: 0, y: 5.2, z: 36, yaw: 0, pitch: 0.15, f: W * 1.05, ax: 0, ay0: 0, az: 24, ay: H * 0.62, k: 2.2, mode: "idle" };
    var kind = curAtk ? curAtk.spec.kind : "atak";
    /** Kafa: halkanın arkasından kaleye (Penaltı açısı), orta gelen yana biraz açık. */
    function crossCam() {
      var sb = ball;
      var L = cross ? cross.L : { x: me.x, z: me.z };
      ball = { x: (me.x + L.x) / 2 + (cross ? cross.side : 0) * 2.0, z: L.z + 0.4 };
      shotCam(9.5);
      ball = sb;
      v.f *= 0.56;
      v.y += 0.9;
      // ayaklar ekranın alt dörtte birinde: kale ve gelen orta üstte
      v.ax = me.x;
      v.ay0 = 0;
      v.az = me.z;
      v.ay = H * 0.76;
      v.k = 3;
      v.mode = "cross";
    }
    function shotCam(dist) {
      var fk = kind === "frikik";
      var bx = ball.x, bz = Math.max(4, ball.z);
      var L = Math.hypot(bx, bz), gx = bx / L, gz = bz / L;
      // Penaltı'daki gibi kamera atıcının sağ arkasında: atıcı solda, kale ortada
      var side = fk ? 0.55 : 1.05;
      v.x = bx + gx * dist + gz * side;
      v.z = bz + gz * dist - gx * side;
      v.y = fk ? 3.3 : 2.9;
      v.yaw = Math.atan2(-gx, gz);
      v.pitch = 0.04;
      var D = L + dist, Dm = dist - 0.4;
      var topMin = Math.max(150, H * 0.25), bottomPad = 116;
      var kTop = (v.y - GOAL_H) / D, kFeet = v.y / Dm;
      var room = Math.max(60, H - bottomPad - topMin);
      var f0 = (W > H * 1.15 ? 0.44 : fk ? 0.6 : 0.84) * W * D / GOAL_W;
      v.f = Math.min(f0, room / (kFeet - kTop));
      var slack = room - v.f * (kFeet - kTop);
      v.ax = 0;
      v.ay0 = GOAL_H;
      v.az = 0;
      v.ay = topMin + slack * 0.4;
      v.k = 4;
      v.mode = "shot";
    }
    if (state === "attract" || state === "promo" || state === "intro" || state === "over") {
      v.x = Math.sin(t * 0.2) * 3;
      v.z = 34 + Math.sin(t * 0.13) * 3;
      v.yaw = Math.sin(t * 0.11) * 0.08;
      v.mode = "idle";
    } else if (state === "rival" || state === "fail" || (state === "end" && !lvl.won)) {
      v.x = Math.sin(t * 0.3) * 1.5;
      v.y = 2.4;
      v.z = 15;
      v.pitch = -0.02;
      v.f = W * 1.0;
      v.ax = 0;
      v.az = 0;
      v.ay = H * 0.58;
      v.mode = "stands";
    } else if (inReplay()) {
      var fr = replay.frames[replay.frames.length - 1];
      var side = (fr.bx || 0) >= 0 ? 1 : -1;
      var rf = replayFrame();
      // yandan, topu izleyen alçak kamera; top kaleye yaklaştıkça ağlara döner
      var bz2 = Math.max(0, rf.bz), bx2 = rf.bx;
      v.x = bx2 * 0.5 + side * 6.2;
      v.y = 1.5;
      v.z = Math.max(3.2, bz2 * 0.7 + 3.4);
      var tx = bx2 * 0.7, tz = Math.max(-0.5, bz2 - 3.5);
      v.yaw = Math.atan2(tx - v.x, v.z - tz);
      v.pitch = 0.03;
      v.f = W * 1.2;
      v.ax = tx;
      v.ay0 = 1.0;
      v.az = tz;
      v.ay = H * 0.52;
      v.k = 6;
      v.mode = "replay";
    } else if ((state === "result" && resInfo && resInfo.good) || (state === "end" && lvl.won)) {
      v.x = me.x * 0.85;
      v.y = 2.3;
      v.z = me.z + 5.4;
      v.pitch = 0.05;
      v.f = W * 1.1;
      v.ax = me.x;
      v.az = me.z;
      v.ay = H * 0.8;
      v.k = 2.5;
      v.mode = "celebrate";
    } else if (state === "pre") {
      if (kind === "atak" || kind === "kontra") {
        var e = A.smooth(A.clamp(stateT / 1.15, 0, 1));
        v.x = me.x * 0.72;
        v.y = A.lerp(14, 6.8, e);
        v.z = me.z + A.lerp(20, 7, e);
        v.pitch = A.lerp(0.56, 0.36, e);
        v.f = W * 1.15;
        v.ax = me.x;
        v.az = me.z;
        v.ay = H * 0.79;
        v.k = 30;
        v.mode = "pre";
      } else if (kind === "kafa") {
        crossCam();
        var e3 = A.smooth(A.clamp(stateT / 1.2, 0, 1));
        v.y += (1 - e3) * 5;
        v.z += (1 - e3) * 12;
        v.k = 30;
      } else {
        shotCam(kind === "penalti" ? 10.5 : 9.5);
        var e2 = A.smooth(A.clamp(stateT / 1.2, 0, 1));
        v.y += (1 - e2) * 5;
        v.z += (1 - e2) * 14;
        v.k = 30;
      }
    } else if (state === "live" || (state === "result" && kind !== "kafa" && !shot)) {
      v.x = me.x * 0.72;
      v.y = 6.8;
      v.z = me.z + 7;
      v.pitch = 0.36;
      v.f = W * 1.15;
      v.ax = me.x;
      v.az = me.z;
      v.ay = H * 0.79;
      v.k = 5;
      v.mode = "run";
    } else if (state === "cross" || (state === "result" && kind === "kafa" && !shot)) {
      crossCam();
    } else {
      // nişan, güç, vuruş, uçuş, sonuç: Penaltı açısı
      var dist = kind === "penalti" ? 10.5 : kind === "frikik" ? 9.5 : 9.2;
      if (state === "flight" || state === "result") {
        var sb = ball;
        ball = { x: shot && shot.ox != null ? shot.ox : sb.x, z: shot && shot.oz != null ? shot.oz : sb.z };
        shotCam(dist);
        ball = sb;
        var fz = A.smooth(A.clamp(1 - sb.z / Math.max(1, shot && shot.oz ? shot.oz : 15), 0, 1));
        v.z -= 1.4 * fz;
        v.y += 0.8 * fz;
        v.k = 3;
      } else shotCam(dist);
    }
    if (window.__cam) v = Object.assign(v, window.__cam);
    return v;
  }
  function placeCamera(dt) {
    var v = camTarget();
    var cut = camCut || (v.mode !== camMode && (v.mode === "replay" || camMode === "replay" || v.mode === "stands" || camMode === "stands"));
    camMode = v.mode;
    camCut = false;
    var a = cut ? 1 : 1 - Math.exp(-v.k * dt);
    cam.x += (v.x - cam.x) * a;
    cam.y += (v.y - cam.y) * a;
    cam.z += (v.z - cam.z) * a;
    cam.yaw += (v.yaw - cam.yaw) * a;
    cam.pitch += (v.pitch - cam.pitch) * a;
    cam.f += (v.f - cam.f) * a;
    camPrep();
    // optik merkez: hedefteki çapa noktası ekranda istenen yükseklikte dursun
    var save = cam.hz;
    cam.hz = 0;
    var p = proj(v.ax, v.ay0, v.az);
    cam.hz = save;
    var hzT = v.ay - p.y;
    cam.hz = cut ? hzT : cam.hz + (hzT - cam.hz) * a;
    // el kamerası nefesi
    cam.x += Math.sin(A.time * 0.9) * 0.002;
    cam.y += Math.sin(A.time * 1.3) * 0.0015;
  }

  /* ─────────────── çokgen (yakın düzlem kırpmalı) ─────────────── */

  var NEAR = 0.35;
  function polyPath(c, pts, fresh) {
    var cs = [];
    for (var i = 0; i < pts.length; i++) cs.push(camSpace(pts[i][0], pts[i][1], pts[i][2]));
    var out = [];
    for (var j = 0; j < cs.length; j++) {
      var a = cs[j], b = cs[(j + 1) % cs.length];
      var ain = a[2] >= NEAR, bin = b[2] >= NEAR;
      if (ain) out.push(a);
      if (ain !== bin) {
        var t = (NEAR - a[2]) / (b[2] - a[2]);
        out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, NEAR]);
      }
    }
    if (out.length < 3) return false;
    if (fresh) c.beginPath();
    for (var k = 0; k < out.length; k++) {
      var s = cam.f / out[k][2];
      var X = W / 2 + out[k][0] * s, Y = cam.hz - out[k][1] * s;
      if (k) c.lineTo(X, Y);
      else c.moveTo(X, Y);
    }
    c.closePath();
    return true;
  }
  /** Zeminde (y = 0) kalın çizgi: dörtgen olarak yola eklenir. */
  function gline(c, x0, z0, x1, z1, w) {
    var dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz) || 1;
    var nx = (-dz / len) * w * 0.5, nz = (dx / len) * w * 0.5;
    polyPath(c, [[x0 + nx, 0, z0 + nz], [x1 + nx, 0, z1 + nz], [x1 - nx, 0, z1 - nz], [x0 - nx, 0, z0 - nz]], false);
  }

  /* ─────────────── fon: gökyüzü + şehir ─────────────── */

  var skyLayer = null, standLayers = null, castSig = "", layoutKey = "";
  var STAND_Z = -9, STAND_W = 30, BOARD_Z = -4, BOARD_H = 0.9, STAND_SLOPE = 0.7;
  var TIER_LOOK = [
    { h: 6, fill: 0.32, boards: ["MAHALLE LİGİ", "BAKKAL CEMİL", "KARİYER YOLU"] },
    { h: 7.5, fill: 0.45, boards: ["AMATÖR LİG", "ESNAF KUPASI", "KARİYER YOLU"] },
    { h: 9, fill: 0.58, boards: ["BÖLGESEL LİG", "ELİTLİG", "KARİYER YOLU"] },
    { h: 10.5, fill: 0.72, boards: ["3. LİG", "ELİTLİG", "KARİYER YOLU"] },
    { h: 12, fill: 0.84, boards: ["2. LİG", "ELİTLİG", "KARİYER YOLU"] },
    { h: 13.5, fill: 0.92, boards: ["1. LİG", "ELİTLİG ARENA", "KARİYER YOLU"] },
    { h: 15, fill: 1, boards: ["SÜPER LİG", "ELİTLİG ARENA", "KARİYER YOLU"] },
    { h: 16, fill: 1, boards: ["AVRUPA GECESİ", "ELİTLİG ARENA", "★ ★ ★"] },
  ];
  function look() {
    return TIER_LOOK[LV ? LV.tier : 0];
  }
  function paintSky() {
    var pad = 80;
    var lw = W + pad * 2, lh = Math.round(H * 1.3);
    var layer = A.layer(lw, lh);
    var c = layer.ctx;
    var rnd2 = A.seeded(4242);
    var base = Math.round(lh * 0.55);
    var g = c.createLinearGradient(0, 0, 0, base);
    g.addColorStop(0, "#15114A");
    g.addColorStop(0.55, "#2A1C6E");
    g.addColorStop(1, "#5E2B8C");
    c.fillStyle = g;
    c.fillRect(0, 0, lw, base);
    c.fillStyle = "#211A5A";
    c.fillRect(0, base, lw, lh - base);
    c.fillStyle = "#FFFFFF";
    for (var i = 0; i < 40; i++) {
      c.globalAlpha = 0.35 + rnd2() * 0.5;
      c.beginPath();
      c.arc(rnd2() * lw, rnd2() * base * 0.75, rnd2() < 0.2 ? 2 : 1.2, 0, Math.PI * 2);
      c.fill();
    }
    c.globalAlpha = 1;
    var mr = A.clamp(W * 0.09, 20, 46), mx = pad + W * 0.78, my = base * 0.42;
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
    function buildings(color, cap, hMin, hMax, wMin, wMax, lit, seed) {
      var r3 = A.seeded(seed);
      var x = -r3() * 30;
      while (x < lw) {
        var bw = wMin + r3() * (wMax - wMin);
        var bh = (hMin + r3() * (hMax - hMin)) * base * 0.5;
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
            c.fillStyle = r3() < lit ? "#FFD98A" : rgba(NAVY, 0.45);
            A.roundRect(c, wx, wy, ww, wh, 1.5);
            c.fill();
          }
        x += bw + 4 + r3() * 14;
      }
    }
    buildings("#3A2A80", "#2C2068", 0.5, 0.95, 46, 86, 0.25, 7);
    buildings("#4B3399", "#33267A", 0.3, 0.7, 40, 70, 0.45, 19);
    buildings("#2E3A8F", "#232C70", 0.18, 0.45, 50, 90, 0.5, 31);
    [pad + W * 0.04, pad + W * 0.96].forEach(function (px) {
      var py = base * 0.3;
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
    layer.base = base;
    return layer;
  }
  /** Tribün karosu (30 m): iki kare — oturan ve zıplayan seyirci; doluluk basamağa göre. */
  function paintStands() {
    var lk = look();
    var sc = 22;
    var lw = STAND_W * sc, lh = lk.h * sc;
    var mine = heroKit(), rk = rivalKit();
    return [0, 1].map(function (jump) {
      var layer = A.layer(lw, lh);
      var c = layer.ctx;
      var rr = A.seeded(9001);
      c.fillStyle = "#231C63";
      c.fillRect(0, 0, lw, lh);
      var roofH = 0.5 * sc;
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
      var rowH = 0.6 * sc, top = roofH + 0.15 * sc, bottom = lh - 0.6 * sc;
      var rows = Math.max(2, Math.floor((bottom - top) / rowH));
      for (var r = 0; r < rows; r++) {
        var ry = top + r * rowH;
        c.fillStyle = r % 2 ? "#2A2275" : "#251E68";
        c.fillRect(0, ry, lw, rowH);
        var step = 0.44 * sc, off = (r % 2) * step * 0.5;
        for (var x = off + step * 0.4; x < lw; x += step) {
          var u = x / lw;
          var home = rr() < 0.5 + 0.3 * Math.cos(u * Math.PI * 2);
          var k = home ? mine : rk;
          var q = rr();
          var seated = rr() < lk.fill;
          var cx = x + (rr() - 0.5) * step * 0.25, cy0 = ry + rowH * 0.62;
          if (!seated) {
            // boş koltuk
            c.fillStyle = "#3B3290";
            A.roundRect(c, cx - step * 0.3, cy0, step * 0.6, rowH * 0.32, 2);
            c.fill();
            continue;
          }
          var col = q < 0.62 ? k.p : q < 0.86 ? k.s : rr() < 0.5 ? "#FFFFFF" : mixc(k.p, NAVY, 0.35);
          var hr = 0.13 * sc * (0.9 + rr() * 0.2);
          var lift = jump ? (0.08 + rr() * 0.08) * sc : rr() * 0.03 * sc;
          var cy = cy0 - lift;
          var skin = ["#F6C9A4", "#E9B08A", "#C98D63", "#8E5B3C"][(rr() * 4) | 0];
          if (jump && rr() < 0.85) {
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
          if (rr() < 0.3) {
            c.fillStyle = rr() < 0.5 ? k.s : "#2B1B12";
            c.beginPath();
            c.arc(cx, cy - hr * 0.2, hr * 0.95, Math.PI, Math.PI * 2);
            c.fill();
          }
          if (jump && rr() < 0.08) {
            c.fillStyle = k.s;
            c.fillRect(cx - hr * 2.2, cy - hr * 2.6, hr * 4.4, hr * 0.9);
            c.fillStyle = k.p;
            c.fillRect(cx - hr * 0.9, cy - hr * 2.6, hr * 1.8, hr * 0.9);
          }
        }
      }
      if (lk.h >= 9) {
        // iki katlı tribün: ortada balkon kuşağı ve ışıkları
        var by0 = top + Math.round(rows * 0.42) * rowH;
        c.fillStyle = "#17123F";
        c.fillRect(0, by0, lw, 0.55 * sc);
        c.fillStyle = "#3A2F8C";
        c.fillRect(0, by0 + 0.55 * sc - 2, lw, 2);
        c.fillStyle = "#FFF3C4";
        for (var bx2 = sc * 1.1; bx2 < lw; bx2 += sc * 2.6) {
          c.beginPath();
          c.arc(bx2, by0 + 0.27 * sc, Math.max(1.5, sc * 0.06), 0, Math.PI * 2);
          c.fill();
        }
      }
      c.fillStyle = "#1C1650";
      c.fillRect(0, bottom, lw, lh - bottom);
      c.fillStyle = "#3A2F8C";
      c.fillRect(0, bottom, lw, Math.max(2, sc * 0.06));
      [[0.25, mine], [0.75, rk]].forEach(function (b) {
        var bx = lw * b[0], bw = sc * 3.4, bh = sc * 0.45;
        c.fillStyle = b[1].p;
        c.fillRect(bx - bw / 2, bottom - bh * 0.15, bw, bh);
        c.fillStyle = b[1].s;
        c.fillRect(bx - bw / 2, bottom + bh * 0.25, bw, bh * 0.2);
      });
      layer.sc = sc;
      return layer;
    });
  }
  /** Görüntüyü dünya dikdörtgenine (üç köşe) afinle yapıştır. */
  function blitPlane(c, img, w, h, tl, tr, bl) {
    c.save();
    c.transform((tr.x - tl.x) / w, (tr.y - tl.y) / w, (bl.x - tl.x) / h, (bl.y - tl.y) / h, tl.x, tl.y);
    c.drawImage(img, 0, 0, w, h);
    c.restore();
  }
  function drawBackdrop(c) {
    if (!skyLayer || layoutKey !== W + "x" + H) {
      skyLayer = paintSky();
      layoutKey = W + "x" + H;
      standLayers = null;
    }
    var lk = look();
    var st = proj(cam.x - sY * 40, lk.h, STAND_Z - lk.h * STAND_SLOPE);
    var px = -skyLayer.pad - A.clamp(cam.yaw * W * 0.9 + cam.x * 2, -skyLayer.pad, skyLayer.pad);
    var py = A.clamp(st.y + 14 - skyLayer.base, -skyLayer.h + H * 0.3, H * 0.5);
    c.drawImage(skyLayer.canvas, px, py, skyLayer.w, skyLayer.h);
    if (py > 0) {
      c.fillStyle = "#15114A";
      c.fillRect(0, 0, W, py + 1);
    }
    if (py + skyLayer.h < H) {
      c.fillStyle = "#211A5A";
      c.fillRect(0, py + skyLayer.h - 1, W, H - py - skyLayer.h + 1);
    }
    var sig = heroKit().p + rivalKit().p + ":" + (LV ? LV.tier : 0);
    if (!standLayers || castSig !== sig) {
      standLayers = paintStands();
      castSig = sig;
    }
    // tribünün altı (zemine kadar) koyu yapı
    c.fillStyle = "#1C1650";
    if (polyPath(c, [[-90, lk.h, STAND_Z - lk.h * STAND_SLOPE], [90, lk.h, STAND_Z - lk.h * STAND_SLOPE], [90, 0, STAND_Z + 4], [-90, 0, STAND_Z + 4]], true)) c.fill();
    var ex = Math.max(excite, (state === "result" && resInfo && resInfo.good) || (state === "end" && lvl && lvl.won) ? 1 : 0);
    var bounce = Math.abs(Math.sin(A.time * 9)) * 0.08;
    for (var i = -3; i < 3; i++) {
      var x0 = i * STAND_W, x1 = x0 + STAND_W;
      var zt = STAND_Z - lk.h * STAND_SLOPE;
      var tl = proj(x0, lk.h, zt), tr = proj(x1, lk.h, zt), bl = proj(x0, 0.2, STAND_Z);
      if (tl.d < 1 || (tr.x < -10 && tl.x < -10) || (tl.x > W + 10 && tr.x > W + 10)) continue;
      var L0 = standLayers[0];
      blitPlane(c, L0.canvas, L0.w, L0.h, tl, tr, bl);
      if (ex > 0.05) {
        c.save();
        c.globalAlpha = Math.min(1, ex * 1.2) * (0.55 + 0.45 * Math.abs(Math.sin(A.time * 9)));
        var L1 = standLayers[1];
        var tl2 = proj(x0, lk.h + bounce, zt), tr2 = proj(x1, lk.h + bounce, zt), bl2 = proj(x0, 0.2 + bounce, STAND_Z);
        blitPlane(c, L1.canvas, L1.w, L1.h, tl2, tr2, bl2);
        c.restore();
        var r = A.seeded(((A.time * 12) | 0) + 3 + i);
        c.fillStyle = "#FFFFFF";
        for (var k = 0; k < 6 * ex; k++) {
          var fx = A.lerp(tl.x, tr.x, r()), fy = A.lerp(tl.y, bl.y, 0.15 + r() * 0.7);
          c.globalAlpha = 0.8;
          c.beginPath();
          c.arc(fx, fy, 1.5 + r() * 2, 0, Math.PI * 2);
          c.fill();
        }
        c.globalAlpha = 1;
      }
    }
  }

  /* ─────────────── reklam panoları (LED) ─────────────── */

  var BOARD_COLS = [["#DB2777", "#9333EA"], ["#7C3AED", "#4F46E5"], ["#0EA5E9", "#2563EB"]];
  function drawBoards(c) {
    var goalNow = (state === "result" && resInfo && resInfo.good) || (state === "end" && lvl && lvl.won);
    var seg = 5, lk = look();
    var texts = [lk.boards[0], upperTR(club.name), lk.boards[1], upperTR(teamName(rival.keeper)), lk.boards[2]];
    c.save();
    c.textAlign = "center";
    c.textBaseline = "middle";
    for (var i = 0; i < 16; i++) {
      var x0 = -40 + i * seg, x1 = x0 + seg - 0.15;
      var a = proj(x0, BOARD_H, BOARD_Z), b = proj(x1, BOARD_H, BOARD_Z), d = proj(x1, 0, BOARD_Z), e = proj(x0, 0, BOARD_Z);
      if (a.d < 1 || (b.x < -5 && a.x < -5) || (a.x > W + 5 && b.x > W + 5)) continue;
      var cols = BOARD_COLS[(i + 40) % 3];
      if (goalNow && Math.sin(A.time * 14 + i) > 0) cols = ["#FFD43B", "#F59E0B"];
      var g = c.createLinearGradient(a.x, 0, b.x, 0);
      g.addColorStop(0, cols[0]);
      g.addColorStop(1, cols[1]);
      c.fillStyle = g;
      c.beginPath();
      c.moveTo(a.x, a.y);
      c.lineTo(b.x, b.y);
      c.lineTo(d.x, d.y);
      c.lineTo(e.x, e.y);
      c.closePath();
      c.fill();
      c.fillStyle = "rgba(255,255,255,0.18)";
      c.beginPath();
      c.moveTo(a.x, a.y);
      c.lineTo(b.x, b.y);
      c.lineTo(b.x + (d.x - b.x) * 0.3, b.y + (d.y - b.y) * 0.3);
      c.lineTo(a.x + (e.x - a.x) * 0.3, a.y + (e.y - a.y) * 0.3);
      c.closePath();
      c.fill();
      var hpx = Math.abs(e.y - a.y);
      if (hpx > 5) {
        c.font = A.font(hpx * 0.56, 900);
        c.fillStyle = goalNow ? NAVY : "#FFFFFF";
        var txt = goalNow ? "GOOOL!" : texts[(i + 40) % texts.length];
        c.fillText(fit(c, txt, Math.abs(b.x - a.x) - 6), (a.x + b.x) / 2, (a.y + d.y) / 2 + 1);
      }
    }
    c.fillStyle = NAVY;
    if (polyPath(c, [[-40, BOARD_H + 0.06, BOARD_Z], [40, BOARD_H + 0.06, BOARD_Z], [40, BOARD_H, BOARD_Z], [-40, BOARD_H, BOARD_Z]], true)) c.fill();
    c.restore();
  }

  /* ─────────────── saha ─────────────── */

  function drawPitch(c) {
    // taban çim
    c.fillStyle = "#3BB54A";
    if (polyPath(c, [[-70, 0, BOARD_Z], [70, 0, BOARD_Z], [70, 0, 130], [-70, 0, 130]], true)) c.fill();
    // biçme şeritleri (kale çizgisine paralel)
    var bw = 4;
    for (var i = 0, z = BOARD_Z; z < 125; z += bw, i++) {
      if (z + bw < cam.z - 160) continue;
      c.fillStyle = i % 2 ? "#4CC552" : "#5FD35F";
      if (polyPath(c, [[-70, 0, z], [70, 0, z], [70, 0, z + bw], [-70, 0, z + bw]], true)) c.fill();
    }
    // saha dışı (taç çizgisinin dışı biraz koyu)
    c.fillStyle = "rgba(20,70,40,0.22)";
    [-1, 1].forEach(function (s) {
      if (polyPath(c, [[s * PITCH_HW, 0, BOARD_Z], [s * 70, 0, BOARD_Z], [s * 70, 0, 130], [s * PITCH_HW, 0, 130]], true)) c.fill();
    });
    // tebeşir çizgileri
    var lw = 0.13;
    c.fillStyle = "rgba(255,255,255,0.92)";
    c.beginPath();
    gline(c, -PITCH_HW, 0, PITCH_HW, 0, lw);
    gline(c, -PITCH_HW, 0, -PITCH_HW, 105, lw);
    gline(c, PITCH_HW, 0, PITCH_HW, 105, lw);
    gline(c, -PITCH_HW, HALFWAY_Z, PITCH_HW, HALFWAY_Z, lw);
    [-1, 1].forEach(function (sd) {
      gline(c, sd * SIX_HW, 0, sd * SIX_HW, SIX_Z, lw);
      gline(c, sd * BOX_HW, 0, sd * BOX_HW, BOX_Z, lw);
    });
    gline(c, -SIX_HW, SIX_Z, SIX_HW, SIX_Z, lw);
    gline(c, -BOX_HW, BOX_Z, BOX_HW, BOX_Z, lw);
    // ceza yayı
    var prev = null;
    for (var a = -0.93; a <= 0.931; a += 0.07) {
      var p = [Math.sin(a) * 9.15, SPOT_Z + Math.cos(a) * 9.15];
      if (prev && (p[1] > BOX_Z || prev[1] > BOX_Z)) gline(c, prev[0], Math.max(BOX_Z, prev[1]), p[0], Math.max(BOX_Z, p[1]), lw);
      prev = p;
    }
    // orta yuvarlak
    prev = null;
    for (var b = 0; b <= Math.PI * 2 + 0.01; b += 0.12) {
      var q = [Math.sin(b) * 9.15, HALFWAY_Z + Math.cos(b) * 9.15];
      if (prev) gline(c, prev[0], prev[1], q[0], q[1], lw);
      prev = q;
    }
    c.fill();
    // penaltı noktası
    c.beginPath();
    polyPath(c, [[-0.16, 0, SPOT_Z - 0.16], [0.16, 0, SPOT_Z - 0.16], [0.16, 0, SPOT_Z + 0.16], [-0.16, 0, SPOT_Z + 0.16]], false);
    c.fill();
    // ufka doğru derinlik pusu
    var hy = proj(cam.x - sY * 60, 0, cam.z - cY * 60).y;
    var g = c.createLinearGradient(0, hy - 4, 0, hy + 90);
    g.addColorStop(0, "rgba(20,40,60,0.35)");
    g.addColorStop(1, "rgba(20,40,60,0)");
    c.fillStyle = g;
    c.fillRect(0, hy - 4, W, 94);
  }

  /* ─────────────── kale ─────────────── */

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
  function bulge(x, y) {
    if (!net.amp) return 0;
    var d2 = (x - net.x) * (x - net.x) + (y - net.y) * (y - net.y);
    return net.amp * Math.exp(-d2 / 0.9) * Math.cos(net.t * 14) * 0.9;
  }
  function drawNet(c) {
    var hw = HALF, top = GOAL_H, back = NET_BACK_H, D = NET_D;
    c.fillStyle = "rgba(20,16,67,0.3)";
    if (polyPath(c, [[-hw, top, 0], [hw, top, 0], [hw, 0, 0], [-hw, 0, 0]], true)) c.fill();
    var a = proj(-hw, top, 0);
    if (a.d < 0.5) return;
    var st = a.s > 30 ? 0.26 : a.s > 14 ? 0.5 : 0.9;
    c.strokeStyle = "rgba(255,255,255,0.62)";
    c.lineWidth = Math.max(0.6, 0.022 * a.s);
    c.beginPath();
    var x, y, p, i, j;
    var nx = Math.ceil((hw * 2) / st), ny = Math.ceil(back / st);
    for (i = 0; i <= nx; i++) {
      x = -hw + (i * hw * 2) / nx;
      for (j = 0; j <= ny; j++) {
        y = (j * back) / ny;
        p = proj(x, y, -D - bulge(x, y));
        if (j) c.lineTo(p.x, p.y);
        else c.moveTo(p.x, p.y);
      }
    }
    for (j = 0; j <= ny; j++) {
      y = (j * back) / ny;
      for (i = 0; i <= nx; i++) {
        x = -hw + (i * hw * 2) / nx;
        p = proj(x, y, -D - bulge(x, y));
        if (i) c.lineTo(p.x, p.y);
        else c.moveTo(p.x, p.y);
      }
    }
    for (i = 0; i <= nx; i++) {
      x = -hw + (i * hw * 2) / nx;
      p = proj(x, top, 0);
      c.moveTo(p.x, p.y);
      p = proj(x, back, -D - bulge(x, back));
      c.lineTo(p.x, p.y);
    }
    var nd = Math.max(2, Math.ceil(D / st));
    for (var k = 1; k < nd; k++) {
      var zz = -(k * D) / nd, yy = top + ((back - top) * k) / nd;
      p = proj(-hw, yy, zz);
      c.moveTo(p.x, p.y);
      p = proj(hw, yy, zz);
      c.lineTo(p.x, p.y);
    }
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
    c.strokeStyle = "#C9C6E8";
    c.lineWidth = Math.max(1.2, 0.05 * a.s);
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
    var hw = HALF + POST_R, top = GOAL_H + POST_R;
    var l0 = proj(-hw, 0, 0), l1 = proj(-hw, top, 0), r1 = proj(hw, top, 0), r0 = proj(hw, 0, 0);
    if (l0.d < 0.5) return;
    var w = Math.max(2.5, POST_R * 2.6 * l0.s);
    c.save();
    c.lineCap = "round";
    c.lineJoin = "round";
    c.beginPath();
    c.moveTo(l0.x, l0.y);
    c.lineTo(l1.x, l1.y);
    c.lineTo(r1.x, r1.y);
    c.lineTo(r0.x, r0.y);
    c.strokeStyle = NAVY;
    c.lineWidth = w + Math.min(5, w * 0.8);
    c.stroke();
    c.strokeStyle = "#FFFFFF";
    c.lineWidth = w;
    c.stroke();
    c.strokeStyle = "rgba(27,22,72,0.18)";
    c.lineWidth = w * 0.35;
    c.beginPath();
    c.moveTo(l0.x + w * 0.22, l0.y);
    c.lineTo(l1.x + w * 0.22, l1.y + w * 0.22);
    c.lineTo(r1.x - w * 0.22, r1.y + w * 0.22);
    c.lineTo(r0.x - w * 0.22, r0.y);
    c.stroke();
    c.restore();
  }
  /** Köşe bayrakları: iki kulübün renginde, hafif rüzgârda dalgalanır. */
  function drawFlags(c) {
    var cols = [heroKit(), rivalKit()];
    [-1, 1].forEach(function (side, fi) {
      var px = side * PITCH_HW, pz = 0;
      var b = proj(px, 0, pz), t = proj(px, 1.6, pz);
      if (b.d < 1 || b.x < -30 || b.x > W + 30) return;
      c.lineCap = "round";
      c.strokeStyle = NAVY;
      c.lineWidth = Math.max(2, 0.08 * b.s) + 2;
      c.beginPath();
      c.moveTo(b.x, b.y);
      c.lineTo(t.x, t.y);
      c.stroke();
      c.strokeStyle = "#E2E8F0";
      c.lineWidth -= 2;
      c.stroke();
      var len = 0.6 * t.s, hgt = 0.4 * t.s, ph = A.time * 5 + fi;
      c.beginPath();
      c.moveTo(t.x, t.y);
      for (var i = 0; i <= 6; i++) {
        var u = i / 6;
        c.lineTo(t.x - side * len * u, t.y + Math.sin(ph - u * 5) * hgt * 0.12 * u);
      }
      c.lineTo(t.x - side * len, t.y + hgt);
      c.lineTo(t.x, t.y + hgt);
      c.closePath();
      c.fillStyle = cols[fi].p;
      c.fill();
      c.lineWidth = 1.5;
      c.strokeStyle = NAVY;
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
    if (p.d < 0.6) return;
    var squash = A.clamp(cam.y / Math.max(0.5, p.d) + Math.sin(cam.pitch) * 0.8, 0.12, 0.8);
    c.fillStyle = "rgba(20,16,67," + (a == null ? 0.28 : a) + ")";
    c.beginPath();
    c.ellipse(p.x, p.y, rx * p.s, Math.max(1.2, rx * p.s * squash), 0, 0, Math.PI * 2);
    c.fill();
  }
  /** Zeminde halka (oyuncu işareti, kafa halkası). */
  function groundRing(c, x, z, r, col, w, alpha) {
    var pts = [];
    for (var i = 0; i < 24; i++) {
      var a = (i / 24) * Math.PI * 2;
      pts.push(proj(x + Math.cos(a) * r, 0.01, z + Math.sin(a) * r));
    }
    if (pts[0].d < 0.6) return;
    c.save();
    c.globalAlpha = alpha == null ? 1 : alpha;
    c.beginPath();
    pts.forEach(function (p, i) {
      if (i) c.lineTo(p.x, p.y);
      else c.moveTo(p.x, p.y);
    });
    c.closePath();
    c.lineWidth = w + 3;
    c.strokeStyle = rgba(NAVY, 0.6);
    c.stroke();
    c.lineWidth = w;
    c.strokeStyle = col;
    c.stroke();
    c.restore();
  }

  /**
   * ARKADAN FUTBOLCU (sen ve takım arkadaşların): Penaltı'nın atıcısı.
   * o: { x, z, person, run (adım fazı), runK, kick (−1 geri savrulma … 0
   * temas … 1 takip), arms ('run'|'kick'|'up'|'head'|'jump'), jump, lean, sq }
   */
  function drawBack(c, o) {
    var p = proj(o.x, 0, o.z);
    if (p.d < 1.0) return;
    var s = p.s;
    var person = o.person || hero;
    var kit = kit2(person), lk = lookOf(person);
    var shortsCol = lum(kit.s) > 0.85 && lum(kit.p) > 0.7 ? NAVY : kit.s === kit.p ? NAVY : kit.s;
    shadowAt(c, o.x, o.z, 0.42, 0.3 * (1 - A.clamp((o.jump || 0) / 1.2, 0, 0.7)));
    c.save();
    c.translate(p.x, p.y - (o.jump || 0) * s);
    c.rotate(o.lean || 0);
    var sq = o.sq || 1;
    c.scale(s * (2 - sq), -s * sq);
    c.lineJoin = "round";
    c.lineCap = "round";
    var LW = Math.max(0.02, 2.6 / s);
    var ph = o.run || 0, rk = o.runK || 0;
    var bob = Math.abs(Math.cos(ph)) * 0.05 * rk;
    var hip = 0.9 + bob, sh = 1.44 + bob, head = 1.74 + bob, HR = 0.27;
    function legPts(side, lift, back) {
      var hx = side * 0.12;
      var fx = side * 0.16, fy = 0.03 + lift * 0.42;
      var kx = side * 0.15, ky = 0.48 + lift * 0.12;
      if (back) {
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
      limb3(c, q[0], q[1], q[2], q[3], q[4], q[5] + 0.06, 0.16, side > 0 ? lk.skin : mixc(lk.skin, NAVY, 0.12), LW);
      var kx = q[2] + (q[4] - q[2]) * 0.18, ky = q[3] + (q[5] - q[3]) * 0.18;
      limb(c, kx, ky, q[4], q[5] + 0.06, 0.17, side > 0 ? sock : mixc(sock, NAVY, 0.12), LW);
      c.strokeStyle = kit.s;
      c.lineWidth = 0.05;
      c.beginPath();
      c.moveTo(kx + (q[4] - kx) * 0.12 - 0.07, ky + (q[5] - ky) * 0.12);
      c.lineTo(kx + (q[4] - kx) * 0.12 + 0.07, ky + (q[5] - ky) * 0.12);
      c.stroke();
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
    if (thru >= 0) {
      var u = Math.min(1, thru / 0.18), dn = A.clamp((thru - 0.25) / 0.4, 0, 1);
      var fy2 = A.lerp(0.15, 0.95, A.easeOut(u)) * (1 - dn) + 0.04 * dn;
      var kny = A.lerp(0.5, 0.95, u * (1 - dn));
      limb(c, 0.12, hip, 0.2, kny, 0.15, lk.skin, LW);
      limb(c, 0.2, kny, 0.18, fy2, 0.16, sock, LW);
      c.beginPath();
      c.ellipse(0.18, fy2 + 0.04, 0.08, 0.05, 0, 0, Math.PI * 2);
      c.fillStyle = NAVY;
      c.fill();
    }
    drawLeg(-1, kick != null ? 0 : lL, 0);
    if (thru < 0) drawLeg(1, kick != null ? 0 : lR, backAmt, 1 + backAmt * 0.35);
    A.roundRect(c, -0.28, hip - 0.28, 0.56, 0.36, 0.1);
    c.fillStyle = shortsCol;
    c.fill();
    c.lineWidth = LW;
    c.strokeStyle = NAVY;
    c.stroke();
    var arms = o.arms || "run", hands;
    var swing = Math.sin(ph) * 0.22 * rk;
    if (arms === "up") {
      var w = Math.sin(A.time * 10) * 0.08;
      hands = [[-0.5, 2.25 + w], [0.5, 2.25 - w]];
    } else if (arms === "head") hands = [[-0.18, 1.98], [0.18, 1.98]];
    else if (arms === "jump") hands = [[-0.55, 1.75], [0.55, 1.75]];
    else if (arms === "plane") hands = [[-0.85, 1.42 + Math.sin(A.time * 4) * 0.1], [0.85, 1.42 - Math.sin(A.time * 4) * 0.1]];
    else if (arms === "kick") {
      var kk = A.clamp(1 - Math.abs(kick || 0) * 1.2, 0, 1);
      hands = [[-0.62 - 0.1 * kk, 1.25 + 0.3 * kk], [0.4, 1.0 + 0.15 * kk]];
    } else hands = [[-0.36, 1.0 + swing], [0.36, 1.0 - swing]];
    for (var j = 0; j < 2; j++) {
      var sx = j ? 0.27 : -0.27, hx = hands[j][0], hy = hands[j][1];
      var mx = sx + (hx - sx) * 0.5 + (j ? 0.06 : -0.06), my = sh - 0.06 + (hy - sh) * 0.5;
      limb3(c, sx, sh - 0.06, mx, my, hx, hy, 0.12, lk.skin, LW);
      limb(c, sx, sh - 0.06, sx + (mx - sx) * 0.75, sh - 0.06 + (my - sh + 0.06) * 0.75, 0.16, kit.p, LW);
      disc(c, hx, hy, 0.075, lk.skin, LW * 0.9);
    }
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
    if (s > 14) {
      c.save();
      c.scale(1, -1);
      var numCol = colDist(kit.s, kit.p) > 90 ? kit.s : lum(kit.p) > 0.6 ? NAVY : "#FFFFFF";
      var nm = upperTR(person.back || person.short || "");
      if (nm.length > 10) nm = nm.slice(0, 9) + ".";
      if (s > 30) textM(c, nm, 0, -(sh - 0.1), 0.085, s, numCol);
      textM(c, String(person.shirt || 10), 0, -(hip + 0.25), 0.3, s, numCol, NAVY);
      c.restore();
    }
    limb(c, 0, sh, 0, head - 0.1, 0.12, lk.skin, LW);
    disc(c, -HR * 0.96, head - 0.02, 0.065, lk.skin, LW * 0.8);
    disc(c, HR * 0.96, head - 0.02, 0.065, lk.skin, LW * 0.8);
    disc(c, 0, head, HR, lk.skin, 0);
    c.save();
    c.beginPath();
    c.arc(0, head, HR, 0, Math.PI * 2);
    c.clip();
    c.fillStyle = lk.hair;
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

  /**
   * ÖNDEN FUTBOLCU (rakip savunmacı): koşu, kayma öncesi çömelme (telgraf),
   * kayarak müdahale, yerde, çalımla şaşkın. o: { x, z, person, kit, ph,
   * runK, pose, ang (ekranda kayma yönü), jump, alarm }
   */
  function drawFront(c, o) {
    var p = proj(o.x, 0, o.z);
    if (p.d < 1.0) return;
    var s = p.s, kit = o.kit, lk = lookOf(o.person);
    var pose = o.pose || "run";
    shadowAt(c, o.x, o.z, pose === "slide" || pose === "down" ? 0.75 : 0.36, 0.28);
    c.save();
    c.translate(p.x, p.y - (o.jump || 0) * s);
    var LW = Math.max(0.02, 2.4 / s);
    c.lineJoin = "round";
    c.lineCap = "round";
    if (pose === "slide" || pose === "down") {
      // yatay gövde: kayma yönüne
      var dir = o.ang || 0;
      c.scale(s, -s);
      c.rotate(-dir);
      var lyY = 0.28;
      // uzanan bacak (önde) + kıvrık bacak
      limb(c, 0.1, lyY, 1.0, 0.14, 0.17, kit.p, LW);
      limb3(c, 0.08, lyY + 0.05, 0.45, 0.48, 0.75, 0.2, 0.16, lk.skin, LW);
      disc(c, 1.02, 0.14, 0.085, NAVY, 0);
      A.roundRect(c, -0.62, lyY - 0.2, 0.72, 0.42, 0.14);
      c.fillStyle = kit.p;
      c.fill();
      c.lineWidth = LW;
      c.strokeStyle = NAVY;
      c.stroke();
      limb3(c, -0.5, lyY + 0.15, -0.68, lyY + 0.5, -0.9, lyY + 0.42, 0.11, lk.skin, LW);
      disc(c, -0.82, lyY + 0.1, 0.2, lk.skin, LW);
      c.save();
      c.beginPath();
      c.arc(-0.82, lyY + 0.1, 0.2, 0, Math.PI * 2);
      c.clip();
      c.fillStyle = lk.hair;
      c.fillRect(-1.05, lyY + 0.12, 0.45, 0.25);
      c.restore();
      if (pose === "down") {
        // baş üstünde dönen yıldızlar
        for (var k = 0; k < 3; k++) {
          var a = A.time * 5 + (k * Math.PI * 2) / 3;
          disc(c, -0.82 + Math.cos(a) * 0.3, lyY + 0.5 + Math.sin(a) * 0.08, 0.05, GOLD, 0);
        }
      }
      c.restore();
      return;
    }
    var sc = pose === "windup" ? 0.88 : 1;
    c.scale(s, -s * sc);
    if (pose === "beaten") c.rotate(Math.sin(o.t * 18) * 0.25 * Math.max(0, 1 - o.t));
    var ph = o.ph || 0, rk = o.runK == null ? 1 : o.runK;
    var bob = Math.abs(Math.cos(ph)) * 0.05 * rk;
    var hip = 0.9 + bob, sh = 1.44 + bob, head = 1.74 + bob, HR = 0.27;
    var lL = Math.max(0, Math.sin(ph)) * rk, lR = Math.max(0, -Math.sin(ph)) * rk;
    var crouch = pose === "windup" ? 1 : 0;
    // bacaklar (önden: kalkan dizi yukarı ve öne)
    [[-1, lL], [1, lR]].forEach(function (L) {
      var side = L[0], lift = L[1];
      var hx = side * 0.12, kx = side * (0.15 + 0.08 * crouch), ky = 0.48 + lift * 0.26 - 0.06 * crouch;
      var fx = side * (0.16 + 0.12 * crouch), fy = 0.03 + lift * 0.3;
      limb3(c, hx, hip, kx, ky, fx, fy + 0.06, 0.16, side > 0 ? lk.skin : mixc(lk.skin, NAVY, 0.1), LW);
      limb(c, kx + (fx - kx) * 0.2, ky + (fy - ky) * 0.2, fx, fy + 0.06, 0.17, kit.p, LW);
      c.beginPath();
      c.ellipse(fx, fy + 0.03, 0.1, 0.065, 0, 0, Math.PI * 2);
      c.fillStyle = NAVY;
      c.fill();
    });
    A.roundRect(c, -0.28, hip - 0.28, 0.56, 0.36, 0.1);
    c.fillStyle = kit.s === kit.p ? NAVY : kit.s;
    c.fill();
    c.lineWidth = LW;
    c.strokeStyle = NAVY;
    c.stroke();
    // kollar
    var swing = Math.sin(ph) * 0.22 * rk, hands;
    if (pose === "windup") hands = [[-0.62, 1.25], [0.62, 1.25]];
    else if (pose === "won") hands = [[-0.45, 2.15 + Math.sin(A.time * 10) * 0.06], [0.45, 2.15 - Math.sin(A.time * 10) * 0.06]];
    else if (pose === "beaten") hands = [[-0.6, 1.7 + Math.sin(A.time * 14) * 0.2], [0.6, 1.7 - Math.sin(A.time * 14) * 0.2]];
    else if (pose === "jump") hands = [[-0.4, 1.9], [0.4, 1.9]];
    else hands = [[-0.36, 1.0 - swing], [0.36, 1.0 + swing]];
    for (var j = 0; j < 2; j++) {
      var sx = j ? 0.27 : -0.27, hx2 = hands[j][0], hy2 = hands[j][1];
      var mx = sx + (hx2 - sx) * 0.5 + (j ? 0.06 : -0.06), my = sh - 0.06 + (hy2 - sh) * 0.5;
      limb3(c, sx, sh - 0.06, mx, my, hx2, hy2, 0.12, lk.skin, LW);
      limb(c, sx, sh - 0.06, sx + (mx - sx) * 0.75, sh - 0.06 + (my - sh + 0.06) * 0.75, 0.16, kit.p, LW);
      disc(c, hx2, hy2, 0.075, lk.skin, LW * 0.9);
    }
    A.roundRect(c, -0.3, hip - 0.04, 0.6, sh - hip + 0.1, 0.14);
    c.fillStyle = kit.p;
    c.fill();
    c.save();
    c.clip();
    c.fillStyle = kit.s;
    c.fillRect(-0.3, sh - 0.02, 0.6, 0.07);
    c.fillStyle = "rgba(255,255,255,0.22)";
    A.roundRect(c, 0.16, sh - 0.32, 0.08, 0.24, 0.04);
    c.fill();
    c.restore();
    A.roundRect(c, -0.3, hip - 0.04, 0.6, sh - hip + 0.1, 0.14);
    c.lineWidth = LW;
    c.strokeStyle = NAVY;
    c.stroke();
    if (s > 16) {
      c.save();
      c.scale(1, -1);
      textM(c, String(o.person && o.person.shirt ? o.person.shirt : 4), 0.12, -(sh - 0.2), 0.14, s, lum(kit.p) > 0.6 ? NAVY : "#FFFFFF");
      c.restore();
    }
    // boyun + kafa (önden: yüz)
    limb(c, 0, sh, 0, head - 0.1, 0.12, lk.skin, LW);
    disc(c, -HR, head - 0.02, 0.06, lk.skin, LW * 0.8);
    disc(c, HR, head - 0.02, 0.06, lk.skin, LW * 0.8);
    disc(c, 0, head, HR, lk.skin, 0);
    c.save();
    c.beginPath();
    c.arc(0, head, HR, 0, Math.PI * 2);
    c.clip();
    c.fillStyle = lk.hair;
    c.beginPath();
    c.ellipse(0, head + HR * 0.72, HR * 1.15, HR * 0.6, 0, 0, Math.PI * 2);
    c.fill();
    c.restore();
    c.beginPath();
    c.arc(0, head, HR, 0, Math.PI * 2);
    c.lineWidth = LW;
    c.strokeStyle = NAVY;
    c.stroke();
    if (s > 12) {
      c.fillStyle = NAVY;
      [-0.085, 0.085].forEach(function (ex) {
        c.beginPath();
        c.ellipse(ex, head, 0.035, 0.05, 0, 0, Math.PI * 2);
        c.fill();
      });
      c.strokeStyle = NAVY;
      c.lineWidth = 1.8 / s;
      c.beginPath();
      // kaşlar: telgrafta çatık
      var fr = pose === "windup" || o.alarm ? 0.04 : 0;
      c.moveTo(-0.14, head + 0.09 + fr);
      c.lineTo(-0.04, head + 0.065 - fr * 0.5);
      c.moveTo(0.14, head + 0.09 + fr);
      c.lineTo(0.04, head + 0.065 - fr * 0.5);
      c.stroke();
      c.beginPath();
      if (pose === "won") c.arc(0, head - 0.1, 0.06, Math.PI + 0.15, -0.15);
      else if (pose === "beaten") c.ellipse(0, head - 0.12, 0.04, 0.05, 0, 0, Math.PI * 2);
      else {
        c.moveTo(-0.05, head - 0.13);
        c.lineTo(0.05, head - 0.13);
      }
      c.lineWidth = 1.6 / s;
      c.stroke();
    }
    c.restore();
  }

  /** Kalecinin forması: iki takımın renklerinden en uzak canlı renk. */
  var GK_COLS = ["#22C55E", "#F97316", "#FACC15", "#EC4899", "#06B6D4", "#A3E635", "#F43F5E"];
  var gkKitCache = { sig: "", kit: null };
  function keeperKit() {
    var tp = rivalKit().p, sp = heroKit().p;
    var sig = tp + sp;
    if (gkKitCache.sig === sig) return gkKitCache.kit;
    var best = GK_COLS[0], bd = -1;
    GK_COLS.forEach(function (col) {
      var d = Math.min(colDist(col, tp), colDist(col, sp));
      if (d > bd) {
        bd = d;
        best = col;
      }
    });
    gkKitCache = { sig: sig, kit: { p: best, s: tp, short: mixc(best, NAVY, 0.55) } };
    return gkKitCache.kit;
  }
  /** KALECİ (önden) — Penaltı'nın kalecisi; gövde simülasyon kapsülüyle aynı yerde. */
  function drawKeeper(c, k, now, ex, bxw) {
    var b = keeperBody(k, now);
    var kit = keeperKit(), lk = lookOf(rival.keeper);
    var cx = b.cx, cy = b.cy, ang = 0, sx = 1, sy = 1, diving = b.diving;
    var land = ex.land || 0;
    if (diving) {
      ang = Math.atan2(b.ax, b.ay);
      var str = Math.sin(Math.min(1, b.e) * Math.PI * 0.9);
      sx = 1 - 0.1 * str;
      sy = 1 + 0.14 * str;
      if (land > 0) {
        if (Math.abs(ang) > 0.35) {
          ang = A.lerp(ang, (Math.sign(ang) * Math.PI) / 2, land);
          cy = A.lerp(cy, 0.3, land);
        } else {
          ang *= 1 - land;
          cy = A.lerp(cy, 0.98, land);
        }
      }
    }
    var hop = ex.hop || 0;
    if (!diving) {
      cy += hop * 0.16 + (ex.bob || 0);
      sy *= 1 + 0.08 * hop - 0.05 * (k.crouch || 0) * (1 - hop);
      sx *= 1 - 0.04 * hop + 0.03 * (k.crouch || 0);
    }
    var p = proj(cx, cy, k.z);
    if (p.d < 0.8) return;
    var s = p.s;
    shadowAt(c, cx, k.z, diving ? 0.55 + 0.4 * Math.abs(Math.sin(ang)) : 0.45, 0.3 * (1 - A.clamp((cy - 1.2) / 1.5, 0, 0.7)));
    c.save();
    c.translate(p.x, p.y);
    c.rotate(ang + (ex.lean || 0) * 0.3 - cam.yaw * 0.0);
    c.scale(s * sx, s * sy);
    c.lineJoin = "round";
    c.lineCap = "round";
    var LW = Math.max(0.02, 2.4 / s);
    var sock = kit.p, shorts = kit.short;
    var hipY = 0.1, shY = -0.42, headY = -0.76, HR = 0.28, gloveR = 0.12;
    var hands, feet, knees;
    if (diving) {
      hands = [[-0.14, -1.0], [0.14, -1.02]];
      knees = [[-0.13, 0.5], [0.24, 0.42]];
      feet = [[-0.17, 0.92], [0.12, 0.8]];
      headY = -0.66;
    } else {
      var fy = cy, cr = k.crouch || 0;
      var spread = 0.42 + (k.set || 0) * 0.12;
      var handY = -(1.12 + (k.set || 0) * 0.25 - cy);
      hands = [[-spread - 0.04, handY], [spread + 0.04, handY]];
      if (ex.cheer) {
        var ch = ex.cheer;
        hands = [[A.lerp(hands[0][0], -0.5, ch), A.lerp(hands[0][1], -1.12 - 0.08 * Math.sin(A.time * 10), ch)], [A.lerp(hands[1][0], 0.5, ch), A.lerp(hands[1][1], -1.12 - 0.08 * Math.cos(A.time * 10), ch)]];
      }
      if (ex.caught) hands = [[-0.17, -0.12], [0.17, -0.12]];
      knees = [[-0.2 - cr * 0.09, (hipY + fy) * 0.5], [0.2 + cr * 0.09, (hipY + fy) * 0.5]];
      feet = [[-0.22 - cr * 0.05, fy], [0.22 + cr * 0.05, fy]];
    }
    for (var i = 0; i < 2; i++) {
      var hx = i ? 0.11 : -0.11;
      limb3(c, hx, hipY, knees[i][0], knees[i][1], feet[i][0], feet[i][1] - 0.06, 0.15, lk.skin, LW);
      limb(c, knees[i][0] + (feet[i][0] - knees[i][0]) * 0.15, knees[i][1] + (feet[i][1] - knees[i][1]) * 0.15, feet[i][0], feet[i][1] - 0.06, 0.16, sock, LW);
      c.beginPath();
      c.ellipse(feet[i][0] + (i ? 0.03 : -0.03), feet[i][1] - 0.03, 0.12, 0.065, 0, 0, Math.PI * 2);
      c.fillStyle = NAVY;
      c.fill();
    }
    A.roundRect(c, -0.26, -0.04, 0.52, 0.3, 0.09);
    c.fillStyle = shorts;
    c.fill();
    c.lineWidth = LW;
    c.strokeStyle = NAVY;
    c.stroke();
    for (var j = 0; j < 2; j++) {
      var shx = j ? 0.24 : -0.24;
      var hx2 = hands[j][0], hy2 = hands[j][1];
      var mx = shx + (hx2 - shx) * 0.45 + (j ? 0.05 : -0.05), my = shY + (hy2 - shY) * 0.45;
      limb3(c, shx, shY + 0.04, mx, my, hx2, hy2, 0.13, kit.p, LW);
    }
    A.roundRect(c, -0.27, shY - 0.06, 0.54, hipY - shY + 0.08, 0.13);
    c.fillStyle = kit.p;
    c.fill();
    c.save();
    c.clip();
    c.fillStyle = kit.s;
    c.fillRect(-0.27, shY - 0.06, 0.54, 0.07);
    c.fillStyle = rgba(mixc(kit.p, NAVY, 0.4), 0.6);
    for (var st = -0.2; st < 0.3; st += 0.13) c.fillRect(st, shY + 0.05, 0.035, 0.5);
    c.restore();
    A.roundRect(c, -0.27, shY - 0.06, 0.54, hipY - shY + 0.08, 0.13);
    c.lineWidth = LW;
    c.strokeStyle = NAVY;
    c.stroke();
    if (s > 16) textM(c, String(rival.keeper.shirt || 1), 0.1, shY + 0.19, 0.2, s, lum(kit.p) > 0.6 ? NAVY : "#FFFFFF");
    hands.forEach(function (h) {
      disc(c, h[0], h[1], gloveR, "#FFFFFF", LW);
      c.fillStyle = kit.s;
      c.beginPath();
      c.arc(h[0], h[1] + gloveR * 0.35, gloveR * 0.55, 0, Math.PI);
      c.fill();
    });
    disc(c, 0, headY, HR, lk.skin, 0);
    c.save();
    c.beginPath();
    c.arc(0, headY, HR, 0, Math.PI * 2);
    c.clip();
    c.fillStyle = lk.hair;
    c.beginPath();
    c.ellipse(0, headY - HR * 0.72, HR * 1.15, HR * 0.62, 0, 0, Math.PI * 2);
    c.fill();
    c.restore();
    c.beginPath();
    c.arc(0, headY, HR, 0, Math.PI * 2);
    c.lineWidth = LW;
    c.strokeStyle = NAVY;
    c.stroke();
    if (s > 12) {
      var lookX = A.clamp(((bxw == null ? 0 : bxw) - cx) * 0.03, -0.035, 0.035);
      c.fillStyle = NAVY;
      [-0.085, 0.085].forEach(function (e2) {
        c.beginPath();
        c.ellipse(e2 + lookX, headY, 0.035, 0.05, 0, 0, Math.PI * 2);
        c.fill();
      });
      c.strokeStyle = NAVY;
      c.lineWidth = 1.8 / s;
      c.beginPath();
      c.moveTo(-0.14, headY - 0.09);
      c.lineTo(-0.04, headY - 0.065);
      c.moveTo(0.14, headY - 0.09);
      c.lineTo(0.04, headY - 0.065);
      c.stroke();
      c.beginPath();
      if (ex.cheer || ex.caught) c.arc(0, headY + 0.1, 0.06, 0.15, Math.PI - 0.15);
      else if (diving) c.ellipse(0, headY + 0.12, 0.04, 0.05, 0, 0, Math.PI * 2);
      else {
        c.moveTo(-0.05, headY + 0.13);
        c.lineTo(0.05, headY + 0.13);
      }
      c.lineWidth = 1.6 / s;
      c.stroke();
    }
    c.restore();
  }
  /** Baraj oyuncusu: önden, eller önde (Penaltı'nın barajı). */
  function drawWallMan(c, x, z, kit, seed, jump) {
    var lk = { skin: SKINS[seed % SKINS.length], hair: HAIRS[(seed >>> 2) % HAIRS.length] };
    shadowAt(c, x, z, 0.3, 0.26 * (1 - jump * 0.5));
    var foot = proj(x, jump * 0.25, z), s = foot.s;
    if (foot.d < 0.8) return;
    c.save();
    c.translate(foot.x, foot.y);
    c.scale(s, s);
    var lw = Math.max(0.035, 2.2 / s);
    c.lineCap = "round";
    limb(c, -0.11, -0.05, -0.12, -0.5, 0.13, kit.s, lw);
    limb(c, 0.11, -0.05, 0.12, -0.5, 0.13, kit.s, lw);
    limb(c, -0.12, -0.5, -0.13, -0.85, 0.16, kit.s, lw);
    limb(c, 0.12, -0.5, 0.13, -0.85, 0.16, kit.s, lw);
    A.roundRect(c, -0.23, -1.48, 0.46, 0.66, 0.12);
    c.fillStyle = kit.p;
    c.fill();
    c.lineWidth = lw;
    c.strokeStyle = NAVY;
    c.stroke();
    limb3(c, -0.21, -1.38, -0.12, -1.05, 0.04, -0.92, 0.1, lk.skin, lw);
    limb3(c, 0.21, -1.38, 0.12, -1.05, -0.04, -0.92, 0.1, lk.skin, lw);
    disc(c, 0, -1.63, 0.14, lk.skin, lw);
    c.beginPath();
    c.arc(0, -1.66, 0.14, Math.PI * 1.05, Math.PI * 1.95);
    c.fillStyle = lk.hair;
    c.fill();
    c.restore();
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
    c.lineWidth = Math.max(1.2, r * 0.2);
    c.strokeStyle = NAVY;
    c.stroke();
    c.fillStyle = "rgba(255,255,255,0.85)";
    c.beginPath();
    c.ellipse(-r * 0.35, -r * 0.42, r * 0.22, r * 0.14, -0.6, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }
  var trail = [];
  function drawBallAt(c, bx, by, bz) {
    var p = proj(bx, by, bz);
    if (p.d < 0.5) return;
    var r = Math.max(3, BALL_R * 1.45 * p.s);
    if (state === "cross" || (ball.pass && ball.pass.lob)) {
      // havadaki orta / aşırtma: parlayan hale, kolay görülsün
      var g = c.createRadialGradient(p.x, p.y, r * 0.8, p.x, p.y, r * 3.2);
      g.addColorStop(0, "rgba(255,255,255,0.55)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      c.fillStyle = g;
      c.beginPath();
      c.arc(p.x, p.y, r * 3.2, 0, Math.PI * 2);
      c.fill();
      r = Math.max(r, 6);
    }
    flatBall(c, p.x, p.y, r, ball.wx * 0.6 + ball.wy * 0.3);
  }
  function drawTrail(c) {
    if (trail.length < 2) return;
    c.save();
    c.lineCap = "round";
    for (var i = 1; i < trail.length; i++) {
      var a = proj(trail[i - 1][0], trail[i - 1][1], trail[i - 1][2]), b = proj(trail[i][0], trail[i][1], trail[i][2]);
      if (a.d < 0.5 || b.d < 0.5) continue;
      var f = i / trail.length;
      c.strokeStyle = "rgba(255,255,255," + 0.55 * f + ")";
      c.lineWidth = Math.max(1, BALL_R * 2.6 * b.s * f);
      c.beginPath();
      c.moveTo(a.x, a.y);
      c.lineTo(b.x, b.y);
      c.stroke();
    }
    c.restore();
  }

  /* ─────────────── yağmur ─────────────── */

  var drops = null;
  function drawRain(c, dt) {
    if (!LV || !LV.rain || state === "attract") return;
    if (!drops) {
      var r = A.seeded(77);
      drops = [];
      for (var i = 0; i < 110; i++) drops.push({ x: r(), y: r(), v: 0.9 + r() * 0.5, l: 10 + r() * 10 });
    }
    c.save();
    c.strokeStyle = "rgba(200,220,255,0.45)";
    c.lineWidth = 1.4;
    c.beginPath();
    drops.forEach(function (d) {
      d.y += d.v * dt * 1.4;
      if (d.y > 1) {
        d.y -= 1;
        d.x = Math.random();
      }
      var x = d.x * W, y = d.y * H;
      c.moveTo(x, y);
      c.lineTo(x + 2, y - d.l);
    });
    c.stroke();
    c.fillStyle = "rgba(30,40,90,0.12)";
    c.fillRect(0, 0, W, H);
    c.restore();
  }

  /* ─────────────── sahne ─────────────── */

  /** Senin pozun: koşu, çalım, nişan, vuruş, sevinç, düşüş. */
  function myPose() {
    var o = { x: me.x, z: me.z, person: hero, run: me.ph, runK: 1, kick: null, arms: "run", jump: 0, lean: 0 };
    var kind = curAtk ? curAtk.spec.kind : "atak";
    if (state === "attract" || state === "promo" || state === "intro" || state === "rival" || state === "fail") {
      o.runK = 0.12;
      o.run = A.time * 1.4;
      return o;
    }
    if (state === "pre") {
      o.runK = kind === "atak" || kind === "kontra" ? 0.6 : 0.12;
      o.run = A.time * (kind === "atak" || kind === "kontra" ? 7 : 1.4);
      return o;
    }
    if (state === "live" || state === "cross") {
      o.runK = state === "cross" ? A.clamp(0.3 + Math.abs(me.vx) / LAT_V, 0, 1) : 1;
      o.lean = -me.vx * 0.025;
      if (me.skill > 0) {
        o.lean = me.skillDir * 0.22 * Math.sin((1 - me.skill / skillLen()) * Math.PI);
        o.sq = 0.94;
      }
      if (state === "cross" && me.jump > 0) {
        o.jump = Math.sin(me.jump * Math.PI) * 0.55;
        o.arms = "jump";
        o.runK = 0;
      }
      return o;
    }
    if (state === "aim" || state === "power") {
      if (isSetPiece()) {
        o.runK = 0.12;
        o.run = A.time * 1.4;
        return o;
      }
      o.runK = A.clamp(me.sp / RUN_V, 0.1, 1);
      return o;
    }
    if (state === "runup") {
      if (kind === "penalti" || kind === "frikik") {
        var len = runupLen(), t = stateT;
        var plant = { x: ball.x - 0.34, z: ball.z + 0.32 }, start = { x: me.x, z: me.z };
        var u = A.clamp(t / (len - 0.1), 0, 1), e = u * u * (2 - u);
        o.x = A.lerp(start.x, plant.x, e);
        o.z = A.lerp(start.z, plant.z, e);
        o.run = e * 9;
        o.runK = Math.min(1, t / 0.25);
        if (t > len - 0.34) {
          o.kick = -A.clamp((len - t) / 0.34, 0, 1) - 0.0001;
          o.arms = "kick";
          o.runK = 0;
        }
        return o;
      }
      o.kick = -A.clamp((runupLen() - stateT) / runupLen(), 0, 1) - 0.0001;
      o.arms = "kick";
      o.runK = 0;
      return o;
    }
    if (state === "flight" || (state === "result" && !(resInfo && resInfo.good) && shot)) {
      if (shot && shot.kind === "kafa") {
        o.arms = "jump";
        o.jump = Math.max(0, 0.55 - (simTime - kickAt) * 1.2);
        o.runK = 0;
        return o;
      }
      var tk = Math.max(0, simTime - kickAt);
      if (state === "result" && stateT > 0.5) {
        o.arms = "head";
        o.sq = 0.97;
        o.runK = 0;
        o.kick = null;
        if (shot) {
          o.x = shot.ox - 0.3;
          o.z = shot.oz + 0.2;
        }
        return o;
      }
      if (shot && shot.ox != null) {
        o.x = shot.ox - 0.3 + Math.min(0.3, tk * 0.6) * 0.15;
        o.z = shot.oz + 0.32 - Math.min(0.35, tk * 0.9);
      }
      o.kick = tk;
      o.arms = "kick";
      o.runK = 0;
      o.jump = Math.max(0, Math.sin(Math.min(1, tk / 0.3) * Math.PI)) * 0.08;
      return o;
    }
    if (state === "result" || state === "end") {
      if ((resInfo && resInfo.good) || (state === "end" && lvl.won)) {
        var ct = celebrate ? celebrate.t : stateT;
        if (ct < 0.35 || (state === "end" && Math.sin(A.time * 2) > 0)) {
          o.arms = "up";
          o.jump = Math.abs(Math.sin(A.time * 6)) * 0.3;
          o.runK = 0;
        } else {
          o.arms = "plane";
          o.runK = 0.9;
        }
        return o;
      }
      if (me.down) {
        o.arms = "head";
        o.runK = 0;
        o.sq = 0.9;
        o.lean = 0.25;
        return o;
      }
      o.arms = "head";
      o.runK = 0;
      return o;
    }
    return o;
  }

  function defPose(d) {
    var pose = "run";
    if (d.st === "windup") pose = "windup";
    else if (d.st === "slide") pose = "slide";
    else if (d.st === "down") pose = "down";
    else if (d.st === "beaten") pose = "beaten";
    else if (d.st === "won") pose = "won";
    else if (d.st === "mark" && d.jump) pose = "jump";
    var ang = 0;
    if (pose === "slide" || pose === "down") {
      var a = proj(d.x, 0, d.z), b = proj(d.x + d.sx, 0, d.z + d.sz);
      ang = Math.atan2(-(b.y - a.y), b.x - a.x);
    }
    var runK = d.st === "hold" ? 0.35 : d.st === "won" ? 0.1 : d.st === "mark" ? 0.6 : 1;
    return { x: d.x, z: d.z, person: d.person, kit: { p: rivalKit().p, s: rivalKit().s }, ph: d.ph, runK: runK, pose: pose, ang: ang, t: d.t, jump: d.jump ? Math.sin(Math.min(1, d.jump) * Math.PI) * 0.4 : 0, alarm: d.chaser };
  }

  /** Zemindeki işaretler: tehlike şeritleri, pas çizgileri, halkalar. */
  function drawGroundMarks(c) {
    var live = state === "live" || state === "aim" || state === "power";
    if (live) {
      for (var i = 0; i < defs.length; i++) {
        var d = defs[i];
        if (d.st !== "windup" && d.st !== "slide") continue;
        var len = LV.lunge + 1.5, w = TACKLE_R;
        var k = d.st === "windup" ? A.clamp(d.t / LV.windup, 0, 1) : 1;
        var x0 = d.x, z0 = d.z, x1 = d.x + d.sx * len * (d.st === "windup" ? 0.4 + 0.6 * k : 1), z1 = d.z + d.sz * len * (d.st === "windup" ? 0.4 + 0.6 * k : 1);
        var nx = -d.sz * w, nz = d.sx * w;
        var pulse = d.st === "windup" ? 0.5 + 0.5 * Math.abs(Math.sin(A.time * 16)) : 1;
        c.fillStyle = "rgba(255,40,90," + 0.22 * pulse + ")";
        if (polyPath(c, [[x0 + nx, 0.01, z0 + nz], [x1 + nx, 0.01, z1 + nz], [x1 - nx, 0.01, z1 - nz], [x0 - nx, 0.01, z0 - nz]], true)) {
          c.fill();
          c.lineWidth = 2.5;
          c.strokeStyle = "rgba(255,255,255," + 0.8 * pulse + ")";
          c.stroke();
        }
        // şeridin üstünde kayma yönünü gösteren oklar
        var lx = x1 - x0, lz = z1 - z0;
        for (var ch = 0; ch < 3; ch++) {
          var u = 0.25 + ch * 0.25 + (A.time * 1.5) % 0.25;
          var cx0 = x0 + lx * u, cz0 = z0 + lz * u, al = 0.55 / Math.max(0.5, Math.hypot(lx, lz));
          var tipx = cx0 + lx * al * 0.6, tipz = cz0 + lz * al * 0.6;
          c.fillStyle = "rgba(255,59,92," + pulse + ")";
          if (polyPath(c, [[cx0 + nx * 0.8, 0.02, cz0 + nz * 0.8], [tipx, 0.02, tipz], [cx0 - nx * 0.8, 0.02, cz0 - nz * 0.8], [cx0 + lx * al * 0.15, 0.02, cz0 + lz * al * 0.15]], true)) {
            c.fill();
            c.lineWidth = 1.5;
            c.strokeStyle = "rgba(255,255,255," + 0.9 * pulse + ")";
            c.stroke();
          }
        }
      }
    }
    if (state === "live" && ball.owner === "me") {
      for (var m = 0; m < mates.length; m++) {
        var pi = passInfo(mates[m]);
        var a = proj(me.x, 0.02, me.z - 0.6), b = proj(pi.tx, 0.02, pi.tz);
        if (a.d < 0.5 || b.d < 0.5) continue;
        c.save();
        c.setLineDash([7, 7]);
        c.lineDashOffset = -A.time * 30;
        c.lineWidth = 4;
        c.strokeStyle = pi.ok ? "rgba(92,240,138,0.85)" : "rgba(255,77,106,0.8)";
        c.beginPath();
        c.moveTo(a.x, a.y);
        c.lineTo(b.x, b.y);
        c.stroke();
        c.restore();
      }
    }
    if (ball.pass) {
      var p0 = proj(ball.pass.x1, 0.02, ball.pass.z1);
      if (p0.d > 0.5) groundRing(c, ball.pass.x1, ball.pass.z1, 0.5, "#7DD3FC", 2.5, 0.8);
    }
    if (state === "cross" && cross) {
      var w2 = crossWindow();
      var left = Math.max(0, cross.T - cross.t);
      var inW = cross.t >= w2[0] && cross.t <= w2[1];
      var r = 0.55 + 2.6 * A.clamp(left / cross.T, 0, 1);
      groundRing(c, cross.L.x, cross.L.z, 0.55, "#FFFFFF", 3, 0.9);
      groundRing(c, cross.L.x, cross.L.z, r, inW ? "#5CF08A" : "#FFD43B", inW ? 5 : 3.5, 0.95);
    }
    // senin işaretin
    if (state !== "attract" && state !== "promo" && state !== "intro" && !inReplay()) groundRing(c, me.x, me.z, 0.62, GOLD, 2.5, 0.85);
  }

  function drawScene(c, dt) {
    var bx = ball.x, by = ball.y, bz = ball.z, kstate = gk, know = simTime, keepExtra = {};
    var replayOn = inReplay();
    var mx = me.x, mz = me.z;
    if (replayOn) {
      var rf = replayFrame(), rt = rf.rt;
      bx = rf.bx;
      by = rf.by;
      bz = rf.bz;
      kstate = rf.k;
      know = rt;
      mx = rf.mx;
      mz = rf.mz;
    } else if (state === "result" || state === "end") {
      keepExtra = { caught: ball.caught, cheer: resInfo && !resInfo.good && !gk.dive && !ball.caught && shot ? Math.min(1, stateT * 2) : 0 };
    }
    if (kstate.dive) keepExtra.land = A.smooth(A.clamp((know - kstate.dive.t0 - kstate.dive.dur) / 0.28, 0, 1));
    if (ball.caught && !replayOn) {
      var kb = keeperBody(gk, simTime);
      bx = kb.cx;
      by = kb.cy + 0.12;
      bz = gk.z + 0.3;
    }
    if (!replayOn && (state === "aim" || state === "power" || state === "pre" || state === "live")) {
      keepExtra.bob = Math.sin(A.time * (5 + 2 * kD())) * 0.015;
      keepExtra.lean = Math.sin(A.time * 1.3) * 0.06;
    }
    var flying = (state === "flight" || replayOn) && ball.owner === "shot";
    if (flying) {
      trail.push([bx, by, bz]);
      if (trail.length > 14) trail.shift();
    } else if (trail.length) trail.shift();

    drawBackdrop(c);
    drawBoards(c);
    drawPitch(c);
    drawFlags(c);
    drawGroundMarks(c);
    drawNet(c);
    var ballDrawn = false;
    if (bz < 0) {
      shadowAt(c, bx, bz, BALL_R * 1.6, 0.3);
      drawTrail(c);
      drawBallAt(c, bx, by, bz);
      ballDrawn = true;
    }
    drawGoalFrame(c);
    // derinlik sıralı varlıklar (uzaktan yakına)
    var ents = [];
    ents.push({ d: proj(kstate.x, 0, kstate.z).d, fn: function () { drawKeeper(c, kstate, know, keepExtra, bx); } });
    if (wall) {
      var rk = rivalKit();
      for (var w = 0; w < wall.n; w++) {
        (function (w) {
          var x = wall.x - wallHalf() + 0.56 * (w + 0.5);
          ents.push({ d: proj(x, 0, wall.z).d, fn: function () { drawWallMan(c, x, wall.z, { p: rk.p, s: rk.s }, 11 + w * 7, wall.jump); } });
        })(w);
      }
    }
    // şut açısında atıcının arkasında kalanlar çizilmez (kameranın dibine girerler)
    var oz = shot && shot.oz != null ? shot.oz : ball.z;
    var shotView = camMode === "shot" || camMode === "replay";
    defs.forEach(function (d) {
      ents.push({ d: proj(d.x, 0, d.z).d, behind: d.z > oz + 0.5, fn: function () { drawFront(c, defPose(d)); } });
    });
    mates.forEach(function (m) {
      ents.push({
        behind: m.z > oz + 0.5,
        d: proj(m.x, 0, m.z).d,
        fn: function () {
          var cel = celebrate && state === "result";
          drawBack(c, { x: m.x, z: m.z, person: m.person, run: m.ph, runK: cel ? 0.8 : 1, arms: cel ? "up" : "run" });
        },
      });
    });
    if (cross && cross.crosser) {
      var cr = cross.crosser;
      ents.push({
        d: proj(cr.x, 0, cr.z).d,
        fn: function () {
          var kk = cross.t < 0 ? -A.clamp(-cross.t / 0.8, 0, 1) - 0.0001 : Math.min(1, cross.t);
          drawBack(c, { x: cr.x, z: cr.z, person: cr.person, kick: cross.t > -0.35 ? kk : null, arms: "kick", runK: 0.3, run: A.time * 4 });
        },
      });
    }
    var po = myPose();
    if (replayOn) {
      po.x = mx;
      po.z = mz;
      po.kick = Math.max(0, know - kickAt);
      po.arms = shot && shot.kind === "kafa" ? "jump" : "kick";
      po.runK = 0;
      po.jump = shot && shot.kind === "kafa" ? Math.max(0, 0.55 - (know - kickAt) * 1.2) : 0;
      if (shot && shot.kind === "kafa") po.kick = null;
    }
    var meD = proj(po.x, 0, po.z).d;
    ents.push({ d: meD, fn: function () { drawBack(c, po); } });
    if (!ballDrawn) {
      var carried = ball.owner === "me" && !replayOn;
      ents.push({
        d: carried ? meD - 0.01 : proj(bx, 0, bz).d,
        fn: function () {
          shadowAt(c, bx, bz, BALL_R * (1.5 + by * 0.25), 0.38 * Math.max(0.15, 1 - by / 2.8));
          drawTrail(c);
          drawBallAt(c, bx, by, bz);
        },
      });
    }
    ents.sort(function (a, b) {
      return b.d - a.d;
    });
    for (var e = 0; e < ents.length; e++) {
      // kameranın dibindeki futbolcu kadrajı kapatmasın: yaklaştıkça silinir
      var fade = ents[e].d === meD ? 1 : A.clamp((ents[e].d - 4.6) / 2.6, 0, 1);
      if (ents[e].behind && shotView) fade = 0;
      if (fade <= 0.02) continue;
      if (fade < 1) {
        c.save();
        c.globalAlpha = fade;
        ents[e].fn();
        c.restore();
      } else ents[e].fn();
    }
    drawSpeedLines(c);
    drawRain(c, dt);
    if (replayOn) drawLetterbox(c);
  }
  /** Hızlanma (çalım / verkaç sonrası): ufuktaki kaçış noktasından dışarı akan hız çizgileri. */
  function drawSpeedLines(c) {
    if (state !== "live" || me.burst <= 0 || A.reduceMotion) return;
    var k = A.clamp(me.burst, 0, 1);
    var vp = proj(cam.x - sY * 80, 0, cam.z - cY * 80);
    var cx = W / 2, cy = vp.y;
    c.save();
    c.lineCap = "round";
    var r = A.seeded(((A.time * 24) | 0) + 1);
    for (var i = 0; i < 18; i++) {
      var ang = Math.PI * (0.05 + 0.9 * r()) + (r() < 0.5 ? 0 : Math.PI);
      var d0 = Math.max(W, H) * (0.32 + r() * 0.3), len = 40 + r() * 70;
      var ux = Math.cos(ang), uy = Math.sin(ang);
      if (cy + uy * d0 < cy + 20 && uy < 0) continue; // gökyüzüne değil, yalnız zemine ve yanlara
      c.strokeStyle = "rgba(255,255,255," + (0.18 + 0.25 * r()) * k + ")";
      c.lineWidth = 2 + r() * 2.5;
      c.beginPath();
      c.moveTo(cx + ux * d0, cy + uy * d0);
      c.lineTo(cx + ux * (d0 + len), cy + uy * (d0 + len));
      c.stroke();
    }
    c.restore();
  }
  function drawLetterbox(c) {
    var k = A.smooth(A.clamp((stateT - REPLAY_AT) / 0.25, 0, 1)) * A.smooth(A.clamp((REPLAY_AT + REPLAY_LEN - stateT) / 0.25, 0, 1));
    var h = 46 * k;
    c.fillStyle = INK;
    c.fillRect(0, 0, W, h);
    c.fillRect(0, H - h, W, h);
  }

  function resize(w, h) {
    W = w;
    H = h;
    camCut = true;
  }
  function render(c, dt) {
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
  function yellowBadge(c, text, cx, cy, size, red) {
    c.font = A.font(size, 900);
    var w = c.measureText(text).width + size * 1.6, h = size * 1.9;
    A.roundRect(c, cx - w / 2, cy - h / 2 + 2.5, w, h, h / 2);
    c.fillStyle = "rgba(8,6,30,0.45)";
    c.fill();
    A.roundRect(c, cx - w / 2, cy - h / 2, w, h, h / 2);
    var g = c.createLinearGradient(0, cy - h / 2, 0, cy + h / 2);
    g.addColorStop(0, red ? "#FF7A93" : "#FFE066");
    g.addColorStop(1, red ? "#E11D48" : "#F5B700");
    c.fillStyle = g;
    c.fill();
    c.lineWidth = 2.2;
    c.strokeStyle = NAVY;
    c.stroke();
    c.fillStyle = red ? "#FFFFFF" : NAVY;
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
  /** Kulüp arması: kalkan, iki renk, baş harfler. */
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
  function wrapLines(c, text, maxW, maxLines) {
    var words = String(text).split(" "), lines = [], cur = "";
    for (var i = 0; i < words.length; i++) {
      var t = cur ? cur + " " + words[i] : words[i];
      if (c.measureText(t).width > maxW && cur) {
        lines.push(cur);
        cur = words[i];
      } else cur = t;
    }
    if (cur) lines.push(cur);
    if (lines.length > maxLines) {
      lines = lines.slice(0, maxLines);
      lines[maxLines - 1] = fit(c, lines[maxLines - 1] + "…", maxW);
    }
    return lines;
  }
  function popIn(c, cx, cy, k) {
    c.translate(cx, cy);
    c.scale(k, k);
    c.translate(-cx, -cy);
  }
  function drawStar(c, cx, cy, r, on) {
    c.beginPath();
    for (var i = 0; i < 10; i++) {
      var a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r;
      c.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    c.closePath();
    c.fillStyle = on ? GOLD : "#D9DBEE";
    c.fill();
    c.lineWidth = Math.max(1.5, r * 0.14);
    c.strokeStyle = NAVY;
    c.stroke();
  }
  function stageText() {
    if (!LV) return "";
    return LV.boss ? upperTR(LV.bossTitle) : upperTR(LV.tierName) + " · " + LV.level + ". MAÇ";
  }
  function fmt1(v) {
    return (Math.round(v * 10) / 10).toFixed(1).replace(".", ",");
  }

  /* ── skorbord + reyting + atak noktaları ── */

  function drawScoreboard(c) {
    var slot = A.hudSlot(10);
    var w = Math.min(slot.w, 384), h = 58, y = 10;
    var cx = A.clamp(W / 2, slot.x0 + w / 2, slot.x1 - w / 2), x = cx - w / 2;
    var tight = w < 340;
    c.save();
    navyPill(c, x, y, w, h, LV && LV.boss ? "#3A1350" : null, 20);
    var sw = tight ? 74 : 82, sx = cx - sw / 2;
    A.roundRect(c, sx, y + 6, sw, 30, 12);
    c.fillStyle = INK;
    c.fill();
    var bump = 1 + 0.22 * scoreBump;
    c.save();
    c.translate(cx, y + 21.5);
    c.scale(bump, bump);
    label(c, score.me + " – " + score.op, 0, 0, tight ? 20 : 22, scoreBump > 0.1 ? "#FFE58A" : "#FFFFFF");
    c.restore();
    var bi = tight ? 21 : 24, ti = tight ? 38 : 43;
    badge(c, x + bi, y + 22, tight ? 21 : 24, hero);
    badge(c, x + w - bi, y + 22, tight ? 21 : 24, rival.keeper);
    var half = w / 2 - sw / 2 - (tight ? 42 : 50);
    c.font = A.font(tight ? 11 : 12, 900);
    c.fillStyle = "#FFFFFF";
    c.textAlign = "left";
    c.textBaseline = "middle";
    c.fillText(fit(c, upperTR(club.name), half), x + ti, y + 20);
    c.textAlign = "right";
    c.fillText(fit(c, upperTR(teamName(rival.keeper)), half), x + w - ti, y + 20);
    // dakika
    var mn = state === "intro" || state === "promo" ? "0'" : minuteNow > 90 ? "90+" + (minuteNow - 90) + "'" : minuteNow + "'";
    c.font = A.font(10, 900);
    var mw = c.measureText(mn).width + 14;
    A.roundRect(c, x + ti - 2, y + 35, mw, 16, 8);
    c.fillStyle = state === "live" || state === "cross" || state === "aim" || state === "power" ? "#E11D48" : "#3B3295";
    c.fill();
    c.fillStyle = "#FFFFFF";
    c.textAlign = "center";
    c.fillText(mn, x + ti - 2 + mw / 2, y + 43.5);
    c.font = A.font(9.5, 900);
    c.fillStyle = LV && LV.boss ? "#FF9DB5" : GOLD;
    if ("letterSpacing" in c) c.letterSpacing = "1px";
    c.fillText(fit(c, stageText(), w - 2 * ti - mw - 30), cx + mw * 0.3, y + 45);
    if ("letterSpacing" in c) c.letterSpacing = "0px";
    c.restore();
  }
  var shownRating = 6;
  function drawRatingRow(c, dt) {
    if (!lvl) return;
    shownRating += (lvl.rating - shownRating) * Math.min(1, dt * 6);
    var y = 74, x = 10, w = 150, h = 30;
    c.save();
    navyPill(c, x, y, w, h);
    var k = 1 + 0.25 * ratingBump;
    c.save();
    c.translate(x + 16, y + h / 2);
    c.scale(k, k);
    drawStar(c, 0, 0, 9, true);
    c.restore();
    label(c, fmt1(shownRating), x + 30, y + h / 2 + 1, 15, ratingBump > 0.1 ? "#FFE58A" : "#FFFFFF", "left", false);
    // reyting çubuğu 5..10, yıldız eşikleri
    var bx = x + 66, bw = w - 76, by = y + h / 2 - 3;
    A.roundRect(c, bx, by, bw, 6, 3);
    c.fillStyle = "rgba(255,255,255,0.15)";
    c.fill();
    var u = A.clamp((shownRating - 5) / 5, 0, 1);
    A.roundRect(c, bx, by, Math.max(6, bw * u), 6, 3);
    c.fillStyle = shownRating >= LV.star3 ? GOLD : shownRating >= LV.star2 ? "#7CF29A" : "#7DD3FC";
    c.fill();
    [LV.star2, LV.star3].forEach(function (s, i) {
      var tx = bx + bw * A.clamp((s - 5) / 5, 0, 1);
      var on = shownRating >= s;
      c.fillStyle = on ? GOLD : "rgba(255,255,255,0.75)";
      c.fillRect(tx - 1, by - 2, 2, 10);
      c.font = A.font(8, 900);
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillText(i ? "3" : "2", tx, by - 6);
    });
    c.restore();
    // atak noktaları
    var n = results.length, r = 6.5, gap = 17;
    var ax = W - 10 - n * gap - 8;
    c.save();
    navyPill(c, ax, y, n * gap + 8, h);
    for (var i = 0; i < n; i++) {
      var px = ax + 4 + gap * (i + 0.5), py = y + h / 2;
      var v = results[i];
      var cur = curAtk && curAtk.idx === i && state !== "intro" && state !== "promo";
      c.beginPath();
      c.arc(px, py, r, 0, Math.PI * 2);
      if (v) {
        c.fillStyle = v === "g" ? GOOD : BAD;
        c.fill();
        c.lineWidth = 1.6;
        c.strokeStyle = "#FFFFFF";
        c.stroke();
        c.lineWidth = 2;
        c.beginPath();
        if (v === "g") {
          c.moveTo(px - 2.8, py + 0.2);
          c.lineTo(px - 0.7, py + 2.3);
          c.lineTo(px + 3, py - 2.2);
        } else {
          c.moveTo(px - 2.3, py - 2.3);
          c.lineTo(px + 2.3, py + 2.3);
          c.moveTo(px + 2.3, py - 2.3);
          c.lineTo(px - 2.3, py + 2.3);
        }
        c.stroke();
      } else {
        c.fillStyle = INK;
        c.fill();
        c.lineWidth = cur ? 2.4 : 1.4;
        c.strokeStyle = cur ? "rgba(255,212,59," + (0.55 + 0.45 * Math.sin(A.time * 6)) + ")" : "rgba(255,255,255,0.28)";
        c.stroke();
      }
    }
    c.restore();
    if (lvl.krampon) {
      c.save();
      c.font = A.font(9.5, 900);
      var kw = c.measureText("KRAMPON").width + 16;
      navyPill(c, x, y + 36, kw, 18, "#0F7A47");
      c.fillStyle = "#FFFFFF";
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillText("KRAMPON", x + kw / 2, y + 45.5);
      c.restore();
    }
  }
  function drawLine(c) {
    if (!line) return;
    var life = 2.6;
    if (lineT > life) return;
    var inT = A.easeOut(Math.min(1, lineT / 0.25));
    var out = A.clamp((life - lineT) / 0.35, 0, 1);
    c.save();
    c.globalAlpha = out;
    c.font = A.font(12.5, 800);
    var maxW = W - 32;
    var text = fit(c, line.text, maxW - 40);
    var tw = Math.min(maxW, c.measureText(text).width + 40);
    var x = W / 2 - tw / 2, y = 112 - (1 - inT) * 10;
    navyPill(c, x, y, tw, 30);
    disc(c, x + 16, y + 15, 5, line.good ? GOOD : BAD, 0);
    c.fillStyle = "#FFFFFF";
    c.textAlign = "left";
    c.textBaseline = "middle";
    c.fillText(text, x + 28, y + 15.5);
    c.restore();
  }
  function drawHint(c, text, y, fill) {
    c.save();
    c.font = A.font(12.5, 900);
    var w = c.measureText(text).width + 32;
    navyPill(c, W / 2 - w / 2, y - 14, w, 28, fill);
    c.fillStyle = "#FFFFFF";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(text, W / 2, y + 0.5);
    c.restore();
  }
  function drawDragHint(c, text) {
    var y = H - 70;
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
    drawHint(c, text, y - 32);
  }
  /** Bir futbolcunun başı üstünde balon (PAS / OFSAYT / !). */
  function bubble(c, x, z, text, fill, hgt) {
    var p = proj(x, hgt || 2.35, z);
    if (p.d < 1) return null;
    c.save();
    c.font = A.font(11, 900);
    var w = c.measureText(text).width + 16, h = 20;
    var bob = Math.sin(A.time * 6) * 2;
    navyPill(c, p.x - w / 2, p.y - h - 4 + bob, w, h, fill);
    c.fillStyle = "#FFFFFF";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(text, p.x, p.y - h / 2 - 3.5 + bob);
    c.restore();
    return p;
  }
  function drawLiveHUD(c) {
    var lv = LV.level;
    // rakip uyarıları
    for (var i = 0; i < defs.length; i++) {
      var d = defs[i];
      if (d.st === "windup") bubble(c, d.x, d.z, lv <= 9 ? "DOKUN!" : "!", "#E11D48", 2.2);
      else if (lv <= 9 && d.st === "press" && ball.owner === "me" && me.cool <= 0 && Math.hypot(d.x - me.x, d.z - me.z) < 2.8 && d.z < me.z) bubble(c, d.x, d.z, "DOKUN!", "#E11D48", 2.2);
      if (d.chaser && d.st === "chase" && ball.owner === "me" && Math.hypot(d.x - me.x, d.z - me.z) < 4) drawHint(c, "ARKANDA!", H - 140, "#B4123A");
    }
    if (ball.owner === "me") {
      for (var m = 0; m < mates.length; m++) {
        var pi = passInfo(mates[m]);
        bubble(c, mates[m].x, mates[m].z, pi.offside ? "OFSAYT" : pi.cut ? "KAPALI" : "PAS", pi.ok ? "#15A34A" : "#B4123A");
      }
    }
    // çalım göstergesi (sağ alt): bekleme süresi halkası
    var bx = W - 44, by = H - 58, r = 24;
    var ready = me.cool <= 0 && ball.owner === "me";
    c.save();
    disc(c, bx, by + 3, r, "rgba(8,6,30,0.5)", 0);
    disc(c, bx, by, r, ready ? "#FFFFFF" : "#B9BCD9", 3);
    if (!ready && me.cool > 0) {
      c.beginPath();
      c.moveTo(bx, by);
      c.arc(bx, by, r - 3, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - me.cool / skillCool()));
      c.closePath();
      c.fillStyle = "rgba(255,212,59,0.55)";
      c.fill();
    }
    // çalım simgesi: iki ok
    c.strokeStyle = NAVY;
    c.lineWidth = 3;
    c.lineCap = "round";
    c.beginPath();
    c.moveTo(bx - 9, by + 6);
    c.quadraticCurveTo(bx, by - 12, bx + 9, by + 6);
    c.moveTo(bx + 9, by + 6);
    c.lineTo(bx + 10, by - 2);
    c.moveTo(bx + 9, by + 6);
    c.lineTo(bx + 1, by + 4);
    c.stroke();
    label(c, "ÇALIM", bx, by + r + 10, 9.5, "#FFFFFF");
    c.restore();
    if (curAtk.idx === 0 && lv <= 3 && stateT < 3.5) drawDragHint(c, lv === 2 ? "Rakip yaklaşınca dokun: çalım" : "Sürükle: sağa sola koş");
    else if (lv === 4 && curAtk.idx === 0 && stateT < 4 && mates.length) drawHint(c, "Arkadaşına dokun: verkaç", H - 104);
  }

  /** Orta ekran dışındayken kenarda gelen topu gösteren ok. */
  function drawCrossArrow(c) {
    var p = proj(ball.x, ball.y, ball.z);
    if (p.d > 0.5 && p.x > 6 && p.x < W - 6) return;
    var side = p.x < W / 2 ? -1 : 1;
    var x = side < 0 ? 26 : W - 26, y = A.clamp(p.y, 160, H - 160);
    var pulse = 1 + 0.12 * Math.sin(A.time * 12);
    c.save();
    c.translate(x, y);
    c.scale(pulse, pulse);
    c.beginPath();
    c.moveTo(side * 18, 0);
    c.lineTo(side * 2, -13);
    c.lineTo(side * 2, 13);
    c.closePath();
    c.fillStyle = GOLD;
    c.fill();
    c.lineWidth = 2.5;
    c.strokeStyle = NAVY;
    c.stroke();
    flatBall(c, -side * 8, 0, 9, A.time * 6);
    c.restore();
    label(c, "ORTA", x - side * 4, y + 26, 10, "#FFFFFF");
  }

  /* ── nişan ── */

  function previewPath(tx, ty) {
    var z = zoneOf();
    var m = shotModel(tx, ty, (z[0] + z[1]) / 2, ball.x, ball.z, curAtk.spec.kind);
    var b = newBall();
    b.x = ball.x;
    b.z = ball.z;
    b.y = BALL_R;
    aimLaunch(b, m.tx, m.ty, m.speed, m.curl);
    var tot = crossing(b).t;
    var pts = [], step = tot / 16, acc = 0;
    var s2 = { x: b.x, y: b.y, z: b.z, vx: b.vx, vy: b.vy, vz: b.vz, curl: b.curl };
    pts.wallHit = false;
    for (var t = 0; t < tot && pts.length < 16; t += SUB) {
      var pz = s2.z;
      integrate(s2, SUB);
      // baraj düzlemi: sıçramış baraj (ekrandaki kırmızı noktalar)
      if (wall && pz > wall.z && s2.z <= wall.z && Math.abs(s2.x - wall.x) < wallHalf() + BALL_R && s2.y < 1.85 + 0.25 + BALL_R) pts.wallHit = true;
      acc += SUB;
      if (acc >= step) {
        acc -= step;
        pts.push([s2.x, s2.y, s2.z, wall ? s2.z <= wall.z : false]);
      }
    }
    return pts;
  }
  function drawAim(c, locked) {
    var ae = aimNow();
    var tx = ae.x, ty = ae.y;
    var p = proj(tx, ty, 0);
    var out = Math.abs(tx) > HALF - 0.04 || ty > GOAL_H - 0.04;
    var near = !out && (Math.abs(tx) > HALF - 0.4 || ty > GOAL_H - 0.35);
    var col = out ? BAD : near ? "#FFB020" : GOLD;
    c.save();
    c.lineCap = "round";
    var pts = previewPath(tx, ty);
    for (var i = 0; i < pts.length; i++) {
      var sp = proj(pts[i][0], pts[i][1], pts[i][2]);
      if (sp.d < 0.5) continue;
      var f = i / pts.length;
      var rr = Math.max(1.8, 4.2 - f * 2.2);
      c.beginPath();
      c.arc(sp.x, sp.y, rr + 1.4, 0, Math.PI * 2);
      c.fillStyle = "rgba(27,22,72," + 0.35 * (1 - f * 0.5) + ")";
      c.fill();
      c.beginPath();
      c.arc(sp.x, sp.y, rr, 0, Math.PI * 2);
      var blocked = pts.wallHit && pts[i][3];
      c.fillStyle = blocked ? "rgba(255,77,106,0.95)" : "rgba(255,255,255," + (0.45 + 0.5 * (1 - f)) + ")";
      c.fill();
    }
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
    c.lineWidth = 6.5;
    c.strokeStyle = NAVY;
    c.beginPath();
    c.arc(p.x, p.y, r * pulse, 0, Math.PI * 2);
    c.stroke();
    c.lineWidth = 3.5;
    c.strokeStyle = col;
    c.stroke();
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
    if ((out || near) && !locked) {
      c.font = A.font(11, 900);
      var tw = c.measureText(out ? "ÇERÇEVE DIŞI" : "DİREK RİSKİ").width + 18;
      navyPill(c, p.x - tw / 2, p.y - r * 1.5 - 30, tw, 22, out ? "#B4123A" : "#9A5B00");
      label(c, out ? "ÇERÇEVE DIŞI" : "DİREK RİSKİ", p.x, p.y - r * 1.5 - 19, 11, "#FFFFFF", "center", false);
    }
    c.restore();
  }
  function drawPower(c) {
    var w = Math.min(W - 70, 300), h = 20, x = W / 2 - w / 2, y = H - 100;
    var z = zoneOf();
    c.save();
    var pulse = 1 + 0.07 * Math.sin(A.time * 10);
    c.save();
    c.translate(W / 2, y - 26);
    c.scale(pulse, pulse);
    label(c, "DOKUN!", 0, 0, 22, GOLD);
    c.restore();
    label(c, "ZAYIF", x + 2, y - 10, 10, "rgba(255,255,255,0.9)", "left");
    label(c, "YÜKSEK", x + w - 2, y - 10, 10, "rgba(255,255,255,0.9)", "right");
    A.roundRect(c, x - 5, y - 5 + 3, w + 10, h + 10, (h + 10) / 2);
    c.fillStyle = "rgba(8,6,30,0.55)";
    c.fill();
    A.roundRect(c, x - 5, y - 5, w + 10, h + 10, (h + 10) / 2);
    c.fillStyle = INK;
    c.fill();
    c.lineWidth = 2;
    c.strokeStyle = "rgba(255,255,255,0.2)";
    c.stroke();
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
    A.roundRect(c, x + w * z[0], y - 3, w * (z[1] - z[0]), h + 6, 6);
    c.fillStyle = "rgba(34,197,94,0.35)";
    c.fill();
    c.lineWidth = 2.5;
    c.strokeStyle = "#5CF08A";
    c.stroke();
    var nx = x + w * v;
    if (powerQuality(v) >= 1) {
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
  /** Nişan saati: kalan süre halkası (yavaş çekim bitiyor). */
  function drawAimClock(c) {
    var lim = LV.aimTime + (isSetPiece() ? 2.5 : 0);
    var left = Math.max(0, lim - aimT), k = left / lim;
    var x = 30, y = 136, r = 17;
    var col = left < 1 ? BAD : left < 2 ? "#FFB020" : GOOD;
    c.save();
    disc(c, x, y, r + 3, NAVY, 0);
    c.lineWidth = 4;
    c.strokeStyle = col;
    c.beginPath();
    c.arc(x, y, r - 2, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k);
    c.stroke();
    label(c, String(Math.ceil(left)), x, y + 1, 14, "#FFFFFF", "center", false);
    c.restore();
  }

  /* ── kartlar ── */

  var KIND_ICONS = { atak: "HÜCUM", kontra: "KONTRA ATAK", penalti: "PENALTI!", frikik: "FRİKİK", kafa: "ORTA GELİYOR" };
  function drawPre(c) {
    var t = stateT;
    var inT = A.easeOutBack(Math.min(1, t / 0.35));
    var out = A.clamp((1.25 - t) / 0.25, 0, 1);
    var sp = curAtk.spec;
    c.save();
    c.globalAlpha = out;
    var y = H * 0.42;
    var bw = Math.min(W - 40, 290), bh = 74;
    popIn(c, W / 2, y, 0.7 + 0.3 * inT);
    navyPill(c, W / 2 - bw / 2, y - bh / 2, bw, bh, sp.kind === "penalti" ? "#9F1239" : null, 24);
    var mn = curAtk.minute > 90 ? "90+" + (curAtk.minute - 90) + "'" : curAtk.minute + "'";
    yellowBadge(c, mn, W / 2, y - bh / 2, 13);
    A.bigText(c, KIND_ICONS[sp.kind] || "ATAK", W / 2, y - 4, 27, GOLD, { stroke: NAVY });
    c.font = A.font(11.5, 800);
    c.fillStyle = "rgba(255,255,255,0.9)";
    c.textAlign = "center";
    c.textBaseline = "middle";
    var sub = sp.kind === "atak" || sp.kind === "kontra" ? (sp.defs ? sp.defs + " savunmacı" : "Önün açık") + (sp.mates ? " · " + sp.mates + " arkadaş" : "") + (sp.chaser ? " · arkanda rakip" : "") : sp.kind === "frikik" ? "Baraj: " + (wall ? wall.n : 3) + " oyuncu" : sp.kind === "kafa" ? "Halkanın altına koş" : "Kaleci: " + rival.keeper.short;
    if (curAtk.extra) sub = "Uzatma · son şans";
    c.fillText(fit(c, sub, bw - 24), W / 2, y + 22);
    c.restore();
  }
  function drawRival(c) {
    var t = stateT;
    var inT = A.easeOutBack(Math.min(1, t / 0.4));
    var out = A.clamp((2.2 - t) / 0.3, 0, 1);
    var cw = Math.min(W - 28, 320), ch = 132;
    var x = W / 2 - cw / 2, y = H * 0.5 - ch / 2;
    c.save();
    c.globalAlpha = out;
    popIn(c, W / 2, y + ch / 2, 0.8 + 0.2 * inT);
    whiteCard(c, x, y, cw, ch, 22);
    yellowBadge(c, (rivEvent.counter ? "KONTRA · " : "") + rivEvent.minute + "' RAKİP GOLÜ", W / 2, y, 11, true);
    badge(c, x + 46, y + 58, 40, rival.keeper);
    c.textAlign = "left";
    c.textBaseline = "middle";
    c.font = A.font(16, 900);
    c.fillStyle = NAVY;
    c.fillText(fit(c, rivEvent.scorer ? rivEvent.scorer.short : "Rakip", cw - 100), x + 80, y + 48);
    c.font = A.font(11.5, 800);
    c.fillStyle = "#6B6894";
    c.fillText(fit(c, teamName(rival.keeper) + (rivEvent.counter ? " · kontrada yakaladı" : ""), cw - 100), x + 80, y + 68);
    label(c, score.me + " – " + score.op, W / 2, y + 104, 24, NAVY, "center", false);
    c.restore();
  }
  function drawResult(c) {
    if (!resInfo) return;
    var t = stateT;
    var end = resInfo.good && replay ? REPLAY_AT : resultLen();
    var fade = A.clamp((end - t) / 0.3, 0, 1);
    if (fade > 0) {
      var pop = A.easeOutBack(Math.min(1, t / 0.35));
      var good = resInfo.good;
      c.save();
      c.globalAlpha = fade;
      var y = Math.max(170, H * 0.3);
      var size = (good ? 64 : 38) * (0.4 + 0.6 * pop);
      c.save();
      c.translate(W / 2, y);
      c.rotate(-0.06 * (1 - pop) + (good ? -0.04 : 0.03));
      A.bigText(c, resInfo.label, 0, 0, size, good ? GOLD : "#FFFFFF", { stroke: good ? NAVY : "#7A0F2B" });
      c.restore();
      if (resInfo.tags.length) yellowBadge(c, resInfo.tags.join("  ·  "), W / 2, y + 50, 12);
      c.restore();
    }
    if (resInfo.retry) drawRetry(c);
  }
  function retryRect() {
    return { x: W / 2, y: H - 120, r: 30 };
  }
  function drawRetry(c) {
    var b = retryRect();
    var n = levelCfg.stock && levelCfg.stock.ikinci_sans != null ? Number(levelCfg.stock.ikinci_sans) || 0 : null;
    var k = A.easeOutBack(A.clamp((stateT - 0.3) / 0.35, 0, 1));
    if (k <= 0) return;
    c.save();
    popIn(c, b.x, b.y, k);
    c.globalAlpha = lvl.asked ? 0.6 : 1;
    disc(c, b.x, b.y + 3, b.r, "rgba(8,6,30,0.5)", 0);
    disc(c, b.x, b.y, b.r, "#38BDF8", 3);
    c.strokeStyle = "#FFFFFF";
    c.lineWidth = 4;
    c.lineCap = "round";
    c.beginPath();
    c.arc(b.x, b.y, b.r * 0.45, -Math.PI * 0.2, Math.PI * 1.3);
    c.stroke();
    c.beginPath();
    c.moveTo(b.x + b.r * 0.45 * Math.cos(-Math.PI * 0.2), b.y + b.r * 0.45 * Math.sin(-Math.PI * 0.2));
    c.lineTo(b.x + b.r * 0.6, b.y - b.r * 0.55);
    c.stroke();
    label(c, resInfo.free ? "İKİNCİ ŞANS · BEDAVA" : "İKİNCİ ŞANS", b.x, b.y + b.r + 13, 11, "#FFFFFF");
    if (!resInfo.free && n != null) {
      var bx = b.x + b.r * 0.78, by = b.y - b.r * 0.78;
      disc(c, bx, by, 10, n > 0 ? GOLD : "#4B4880", 2.2);
      c.font = A.font(11, 900);
      c.fillStyle = n > 0 ? NAVY : "#FFFFFF";
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillText(n > 0 ? String(n) : "+", bx, by + 0.5);
    }
    // kalan süre
    var left = A.clamp((resultLen() - stateT) / (resultLen() - 0.3), 0, 1);
    c.lineWidth = 3;
    c.strokeStyle = GOLD;
    c.beginPath();
    c.arc(b.x, b.y, b.r + 5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * left);
    c.stroke();
    c.restore();
  }
  function drawReplayBadge(c) {
    c.save();
    var x = A.hudSlot(14).x1 - 98, y = 54;
    navyPill(c, x, y, 98, 28);
    c.fillStyle = Math.sin(A.time * 6) > 0 ? "#EF4444" : "rgba(239,68,68,0.4)";
    c.beginPath();
    c.arc(x + 16, y + 14, 5, 0, Math.PI * 2);
    c.fill();
    label(c, "TEKRAR", x + 28, y + 14.5, 12, "#FFFFFF", "left", false);
    label(c, "Geçmek için dokun", W / 2, H - 23, 11, "rgba(255,255,255,0.85)", "center", false);
    c.restore();
  }
  function levelTags() {
    var t = [];
    if (LV.boss) t.push(LV.bossTitle);
    var kinds = {};
    LV.attacks.forEach(function (a) {
      kinds[a.kind] = (kinds[a.kind] || 0) + 1;
    });
    KINDS.forEach(function (k) {
      if (kinds[k] && k !== "atak") t.push(KIND_NAMES[k] + (kinds[k] > 1 ? " ×" + kinds[k] : ""));
    });
    if (LV.keeperOut) t.push("Kaleci çıkar");
    if (LV.rain) t.push("Yağmur");
    if (LV.attacks.some(function (a) { return a.press; })) t.push("Pres");
    if (LV.attacks.some(function (a) { return a.offside; })) t.push("Ofsayt");
    if (LV.breather) t.push("Nefes maçı");
    return t;
  }
  function drawLevelIntro(c) {
    var t = stateT, len = introLen();
    var inT = A.easeOutBack(Math.min(1, t / 0.45));
    var out = A.clamp((len - t) / 0.3, 0, 1);
    var un = unlockOf(LV.level);
    var tags = levelTags();
    var cw = Math.min(W - 28, 340);
    c.save();
    c.font = A.font(11.5, 800);
    var unLines = un ? wrapLines(c, un.text, cw - 40, 4) : [];
    var ch = 200 + (tags.length ? 30 : 0) + (un ? 46 + unLines.length * 16 : 0);
    var x = W / 2 - cw / 2, y = Math.max(78, H * 0.5 - ch / 2);
    c.globalAlpha = out;
    popIn(c, W / 2, y + ch / 2, 0.8 + 0.2 * inT);
    whiteCard(c, x, y, cw, ch, 24);
    if (LV.boss) {
      A.roundRect(c, x, y, cw, 44, 24);
      c.fillStyle = "#FDE2E8";
      c.fill();
    }
    yellowBadge(c, (LV.boss ? "BÜYÜK MAÇ · " : "") + upperTR(LV.tierName) + " · " + LV.level + ". MAÇ", W / 2, y, 11.5, LV.boss);
    var bob = Math.sin(A.time * 3) * 2;
    badge(c, x + cw * 0.2, y + 64 + bob, 42, hero);
    badge(c, x + cw * 0.8, y + 64 - bob, 42, rival.keeper);
    disc(c, W / 2, y + 64, 19, NAVY, 0);
    label(c, "VS", W / 2, y + 65, 14, GOLD, "center", false);
    c.font = A.font(12, 900);
    c.fillStyle = NAVY;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(fit(c, club.name, cw * 0.4), x + cw * 0.2, y + 103);
    c.fillText(fit(c, teamName(rival.keeper), cw * 0.4), x + cw * 0.8, y + 103);
    c.font = A.font(10.5, 800);
    c.fillStyle = "#6B6894";
    c.fillText(fit(c, hero.short + " · GEN " + LV.gen, cw * 0.42), x + cw * 0.2, y + 119);
    c.fillText(fit(c, "Kaleci " + rival.keeper.short, cw * 0.42), x + cw * 0.8, y + 119);
    c.font = A.font(19, 900);
    c.fillStyle = NAVY;
    c.fillText(fit(c, goalText(LV), cw - 30), W / 2, y + 147);
    c.font = A.font(10.5, 900);
    var info = "★★ " + fmt1(LV.star2) + " · ★★★ " + fmt1(LV.star3) + " reyting";
    var iw = Math.min(cw - 24, c.measureText(info).width + 26);
    navyPill(c, W / 2 - iw / 2, y + 164, iw, 24);
    c.fillStyle = "#FFFFFF";
    c.fillText(fit(c, info, iw - 16), W / 2, y + 176.5);
    var yy = y + 200;
    if (tags.length) {
      c.font = A.font(10.5, 900);
      var tw = 0,
        widths = tags.map(function (s) {
          var w = c.measureText(s).width + 16;
          tw += w + 5;
          return w;
        });
      var scale = Math.min(1, (cw - 20) / tw), tx = W / 2 - (tw * scale) / 2;
      c.save();
      c.translate(tx, yy);
      c.scale(scale, scale);
      var px = 0;
      tags.forEach(function (s, i) {
        A.roundRect(c, px, 0, widths[i], 20, 10);
        c.fillStyle = LV.boss && i === 0 ? "#FDE68A" : "#EEF0FF";
        c.fill();
        c.fillStyle = NAVY;
        c.textAlign = "center";
        c.fillText(s, px + widths[i] / 2, 10.5);
        px += widths[i] + 5;
      });
      c.restore();
      yy += 30;
    }
    if (un) {
      A.roundRect(c, x + 12, yy, cw - 24, 36 + unLines.length * 16, 14);
      c.fillStyle = "#FFF7D6";
      c.fill();
      c.lineWidth = 2;
      c.strokeStyle = "#F5B700";
      c.stroke();
      c.font = A.font(13, 900);
      c.fillStyle = NAVY;
      c.textAlign = "left";
      c.fillText("YENİ · " + upperTR(un.title), x + 24, yy + 15);
      c.font = A.font(11.5, 800);
      c.fillStyle = "#4B4880";
      unLines.forEach(function (ln, i) {
        c.fillText(ln, x + 24, yy + 34 + i * 16);
      });
    }
    c.restore();
    if (t > 0.6) label(c, "Başlamak için dokun", W / 2, H - 28, 11, "rgba(255,255,255,0.85)", "center", false);
  }
  /** Terfi / transfer kartı: yeni lig, yeni kulüp, gelişen genel reyting. */
  function drawPromo(c) {
    var t = stateT;
    var inT = A.easeOutBack(Math.min(1, t / 0.5));
    var out = A.clamp((4.6 - t) / 0.3, 0, 1);
    var cw = Math.min(W - 28, 340), ch = 300;
    var x = W / 2 - cw / 2, y = Math.max(70, H * 0.47 - ch / 2);
    c.save();
    c.globalAlpha = out;
    // ışık hüzmeleri
    c.save();
    c.translate(W / 2, y + 110);
    c.rotate(A.time * 0.4);
    c.fillStyle = "rgba(255,212,59,0.13)";
    for (var i = 0; i < 12; i++) {
      var a0 = (i / 12) * Math.PI * 2;
      c.beginPath();
      c.moveTo(0, 0);
      c.arc(0, 0, Math.max(W, H), a0, a0 + Math.PI / 12);
      c.closePath();
      c.fill();
    }
    c.restore();
    popIn(c, W / 2, y + ch / 2, 0.75 + 0.25 * inT);
    whiteCard(c, x, y, cw, ch, 26);
    yellowBadge(c, "TERFİ · TRANSFER", W / 2, y, 13);
    A.bigText(c, upperTR(LV.tierName), W / 2, y + 44, 30, GOLD, { stroke: NAVY });
    c.font = A.font(12, 800);
    c.fillStyle = "#6B6894";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText("Performansın göz doldurdu: yeni ligde yeni kulüp!", W / 2, y + 76);
    var old = prevClub ? { team: prevClub, id: 1, name: "x" } : hero;
    var k = A.easeOutBack(A.clamp((t - 0.5) / 0.5, 0, 1));
    badge(c, x + cw * 0.24, y + 130, 46, old);
    c.save();
    popIn(c, x + cw * 0.76, y + 130, 0.4 + 0.6 * k);
    badge(c, x + cw * 0.76, y + 130, 58, hero);
    c.restore();
    // ok
    c.strokeStyle = NAVY;
    c.lineWidth = 5;
    c.lineCap = "round";
    var ax = W / 2 - 22 + Math.sin(A.time * 5) * 3;
    c.beginPath();
    c.moveTo(ax, y + 130);
    c.lineTo(ax + 40, y + 130);
    c.moveTo(ax + 40, y + 130);
    c.lineTo(ax + 30, y + 121);
    c.moveTo(ax + 40, y + 130);
    c.lineTo(ax + 30, y + 139);
    c.stroke();
    c.font = A.font(11.5, 900);
    c.fillStyle = "#6B6894";
    c.fillText(fit(c, prevClub ? prevClub.name : "", cw * 0.4), x + cw * 0.24, y + 168);
    c.fillStyle = NAVY;
    c.font = A.font(13, 900);
    c.fillText(fit(c, club.name, cw * 0.44), x + cw * 0.76, y + 176);
    // genel reyting artışı
    var g0 = levelSpec(Math.max(1, LV.level - 1)).gen, g1 = LV.gen + 2;
    var gk2 = A.clamp((t - 0.9) / 0.9, 0, 1);
    var gv = Math.round(A.lerp(g0, g1, A.easeOut(gk2)));
    avatar(c, x + 52, y + 230, 26, hero);
    c.textAlign = "left";
    c.font = A.font(14, 900);
    c.fillStyle = NAVY;
    c.fillText(fit(c, hero.short || hero.name, cw - 170), x + 88, y + 218);
    c.font = A.font(11, 800);
    c.fillStyle = "#6B6894";
    c.fillText("Genel reyting", x + 88, y + 238);
    yellowBadge(c, "GEN " + gv + (gk2 >= 1 ? "  ▲" + (g1 - g0) : ""), x + cw - 64, y + 230, 14);
    c.restore();
    if (t > 0.6) label(c, "Devam etmek için dokun", W / 2, H - 28, 11, "rgba(255,255,255,0.85)", "center", false);
  }
  function drawFail(c) {
    c.save();
    c.fillStyle = "rgba(8,6,30," + Math.min(0.5, stateT * 1.5) + ")";
    c.fillRect(0, 0, W, H);
    var cw = Math.min(W - 40, 300), ch = 104, x = W / 2 - cw / 2, y = H * 0.42 - ch / 2;
    whiteCard(c, x, y, cw, ch, 22);
    A.bigText(c, "UZATMA?", W / 2, y + 4, 28, "#FF8FA3", { stroke: NAVY });
    c.font = A.font(12.5, 800);
    c.fillStyle = NAVY;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText("Skor " + score.me + " – " + score.op + " · +" + (lvl.need || 1) + " atakla devam edebilirsin", W / 2, y + 54);
    c.font = A.font(11, 800);
    c.fillStyle = "#6B6894";
    c.fillText("Maçı kazanmak için gol lazım", W / 2, y + 78);
    c.restore();
  }
  function drawEnd(c) {
    var t = stateT;
    var inT = A.easeOutBack(Math.min(1, t / 0.5));
    var won = lvl.won;
    c.save();
    var cw = Math.min(W - 28, 340), ch = 196;
    var x = W / 2 - cw / 2, y = H - ch - 26;
    popIn(c, W / 2, y + ch / 2, 0.8 + 0.2 * inT);
    whiteCard(c, x, y, cw, ch, 24);
    c.save();
    c.translate(W / 2, y + 2);
    c.rotate(-0.03);
    A.bigText(c, won ? (LV.boss ? "KUPA SENİN!" : "KAZANDIN!") : "KAYBETTİN", 0, 0, 30, won ? GOLD : "#FF8FA3", { stroke: NAVY });
    c.restore();
    badge(c, x + 44, y + 60, 32, hero);
    badge(c, x + cw - 44, y + 60, 32, rival.keeper);
    label(c, score.me + " – " + score.op, W / 2, y + 48, 30, NAVY, "center", false);
    c.font = A.font(10.5, 800);
    c.fillStyle = "#6B6894";
    c.textAlign = "center";
    c.fillText("MAÇ SONU · " + stageText(), W / 2, y + 74);
    for (var i = 0; i < 3; i++) {
      var k = A.easeOutBack(A.clamp((t - 0.3 - i * 0.22) / 0.35, 0, 1));
      var sx = W / 2 + (i - 1) * 46, sy = y + 104 - (i === 1 ? 5 : 0);
      c.save();
      c.translate(sx, sy);
      c.scale(0.4 + 0.6 * k, 0.4 + 0.6 * k);
      drawStar(c, 0, 0, i === 1 ? 19 : 15, won && i < lvl.stars && k > 0.5);
      c.restore();
    }
    var motm = won && lvl.rating >= 8.5;
    yellowBadge(c, "Reyting " + fmt1(lvl.rating) + " · " + score.me + " gol" + (tally.dribbles ? " · " + tally.dribbles + " çalım" : "") + (tally.oneTwos ? " · " + tally.oneTwos + " verkaç" : ""), W / 2, y + 146, 11.5);
    if (motm) {
      c.font = A.font(12, 900);
      c.fillStyle = "#B45309";
      c.fillText("★ MAÇIN ADAMI ★", W / 2, y + 176);
    } else if (!won) {
      c.font = A.font(11.5, 800);
      c.fillStyle = "#6B6894";
      c.fillText("Rakipten çok gol atmalısın", W / 2, y + 176);
    }
    c.restore();
  }

  function drawHUD(c, dt) {
    A.drawParticles(c);
    A.drawFloaters(c, dt);
    if (state === "attract" || state === "over") return;
    if (inReplay()) {
      drawReplayBadge(c);
      return;
    }
    if (state === "promo") {
      drawPromo(c);
      return;
    }
    drawScoreboard(c);
    if (state !== "intro") {
      drawRatingRow(c, dt);
      drawLine(c);
    }
    if (state === "intro") drawLevelIntro(c);
    else if (state === "pre") drawPre(c);
    else if (state === "rival") drawRival(c);
    else if (state === "live") drawLiveHUD(c);
    else if (state === "cross") {
      var w = crossWindow(), inW = cross.t >= w[0] && cross.t <= w[1];
      drawCrossArrow(c);
      if (LV.level <= 23 && cross.t < 0) drawDragHint(c, "Sürükle: halkanın altına koş");
      else drawHint(c, inW ? "ŞİMDİ! Kaleye dokun" : "Halka yeşile dönünce kaleye dokun", H - 90, inW ? "#15A34A" : null);
    } else if (state === "aim") {
      drawAim(c, false);
      drawAimClock(c);
      if (!dragFrom) drawHint(c, "Sürükle: nişan al · Bırak: güç", H - 92);
      if (!isSetPiece()) {
        var near = defs.some(function (d) {
          return activeDef(d) && Math.hypot(d.x - me.x, d.z - me.z) < 3.2;
        });
        if (near) drawHint(c, "BASKI! ÇABUK VUR", H - 132, "#B4123A");
      }
    } else if (state === "power") {
      drawAim(c, true);
      drawPower(c);
    } else if (state === "result") drawResult(c);
    else if (state === "fail") drawFail(c);
    else if (state === "end") drawEnd(c);
    A.drawBanner(c, W, H * 0.34, dt);
  }

  /* ═══════════════════════════ GİRDİ ═══════════════════════════ */

  var LAT_SENS = 14; // ekran genişliği başına yanal metre
  var AIM_SENS_X = 8.6, AIM_SENS_Y = 4.6;
  var tapStart = null;
  function mateAt(p) {
    var best = -1, bd = 1e9;
    for (var i = 0; i < mates.length; i++) {
      var q = proj(mates[i].x, 1.0, mates[i].z);
      var d = Math.hypot(p.x - q.x, p.y - q.y);
      if (d < Math.max(42, q.s * 1.2) && d < bd) {
        bd = d;
        best = i;
      }
    }
    return best;
  }
  function down(p) {
    tapStart = { x: p.x, y: p.y, t: A.time };
    if (state === "promo") {
      if (stateT > 0.6) setState("intro");
      return;
    }
    if (state === "intro") {
      if (stateT > 0.6) stateT = Math.max(stateT, introLen());
      return;
    }
    if (state === "result") {
      var rb = retryRect();
      if (resInfo && resInfo.retry && stateT > 0.3 && Math.hypot(p.x - rb.x, p.y - rb.y) < rb.r + 14) {
        requestRetry();
        return;
      }
      if (inReplay()) stateT = resultLen() - 0.05;
      return;
    }
    if (state === "end") {
      if (stateT > 1.2) stateT = Math.max(stateT, 3.8);
      return;
    }
    if (state === "live" || state === "cross") {
      steerFrom = { x: p.x };
      if (state === "cross" && cross && cross.t >= crossWindow()[0]) {
        var g = unproject(p.x, p.y, 0);
        if (g) headerTap(g.x, g.y);
      }
      return;
    }
    if (state === "aim") {
      dragFrom = { x: p.x, y: p.y, ax: aim.x, ay: aim.y, moved: 0 };
      return;
    }
    if (state === "power") takeShot(powerV);
  }
  function move(p) {
    if ((state === "live" || state === "cross") && steerFrom) {
      me.tx = A.clamp(me.tx + ((p.x - steerFrom.x) / W) * LAT_SENS, -23, 23);
      steerFrom.x = p.x;
      return;
    }
    if (state === "aim" && dragFrom) {
      var dx = p.x - dragFrom.x, dy = p.y - dragFrom.y;
      dragFrom.moved = Math.max(dragFrom.moved, Math.hypot(dx, dy));
      aim.x = A.clamp(dragFrom.ax + (dx / W) * AIM_SENS_X, -HALF - 0.9, HALF + 0.9);
      aim.y = A.clamp(dragFrom.ay - (dy / H) * AIM_SENS_Y, 0.15, GOAL_H + 0.8);
    }
  }
  function up(p) {
    var tap = tapStart && A.time - tapStart.t < 0.3 && Math.hypot(p.x - tapStart.x, p.y - tapStart.y) < 14;
    steerFrom = null;
    tapStart = null;
    if (state === "live" && tap) {
      var mi = ball.owner === "me" ? mateAt(p) : -1;
      if (mi >= 0) tryPass(mi);
      else trySkill();
      return;
    }
    if (state === "aim" && dragFrom) {
      var moved = dragFrom.moved;
      dragFrom = null;
      if (moved > 10) lockAim();
    }
  }

  /* ═══════════════════════════ TEST / BOT ARAYÜZÜ ═══════════════════════════ */

  function debug() {
    return {
      state: state,
      stateT: stateT,
      level: LV,
      lvl: lvl,
      score: score,
      results: results,
      curAtk: curAtk,
      res: resInfo,
      me: me,
      ball: ball,
      keeper: gk,
      defs: defs,
      mates: mates,
      cross: cross,
      wall: wall,
      aim: aim,
      powerV: powerV,
      shootZ: shootZ,
      tally: tally,
      timeline: timeline,
      zone: zoneOf,
      passInfo: passInfo,
      crossWindow: function () {
        return cross ? crossWindow() : null;
      },
      predict: predict,
      /** Ekrandaki nişan yolu (yeşil bölge ortası) baraja değiyor mu — oyuncunun gördüğü. */
      blocked: function (tx, ty) {
        if (!wall) return false;
        return previewPath(tx, ty).wallHit;
      },
      levelSpec: levelSpec,
      goalText: goalText,
      LEVEL_COUNT: LEVEL_COUNT,
      UNLOCKS: UNLOCKS,
      TIERS: TIERS,
      act: {
        steer: function (x) {
          me.tx = A.clamp(x, -23, 23);
        },
        skill: trySkill,
        pass: tryPass,
        aim: function (x, y) {
          aim.x = x;
          aim.y = y;
        },
        lock: lockAim,
        shoot: function () {
          takeShot(powerV);
        },
        header: headerTap,
        retry: requestRetry,
        skip: function () {
          if (state === "promo") setState("intro");
          else if (state === "intro") stateT = introLen();
        },
      },
      proj: proj,
      unproject: unproject,
      hero: hero,
      rival: rival,
      club: club,
      canvas2d: true,
    };
  }

  A.register({ resize: resize, start: start, update: update, render: render, down: down, move: move, up: up, debug: debug, setRoster: setRoster, command: command });

  // core.js config'in bölüm modu alanlarını iletmez: config'i burada da okuyoruz (idempotent).
  var coreCmd = window.ArenaCmd;
  if (typeof coreCmd === "function") {
    window.ArenaCmd = function (cmd) {
      if (cmd && cmd.type === "config") levelConfig(cmd);
      return coreCmd(cmd);
    };
  }
})();
