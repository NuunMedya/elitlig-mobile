/*
 * KULÜP ŞEHRİ — yıldızlarla kurulan futbol şehrinin canlı sahnesi (2B izometrik).
 *
 * Bu dosya YALNIZ ÇİZER ve CANLANDIRIR; kurallar, maliyetler ve kilitler
 * sunucudadır (elitlig-server services/puzzle/city.js). RN ekranı
 * (app/kulup-sehri.tsx) şehrin durumunu gönderir, sahne her birimi basamağına
 * göre kurar; basamak değişince İNŞAAT animasyonu oynar (iskele, vinç, toz,
 * esneyerek yükselen yapı, konfeti) ve kamera o birime uçar.
 *
 * KÖPRÜ:
 *   RN → sahne : ArenaCmd({ type:"city", levels, kit, marks, tier, focus })
 *                  levels  { saha:2, kantin:1, … }
 *                  marks   { kantin:"up" | "lock" | "max" }  (etiketlerdeki rozet)
 *                  focus   birim anahtarı (kamera oraya uçar) ya da null
 *                ArenaCmd({ type:"focus", key })
 *                ArenaCmd({ type:"celebrate" })  (statü atladı: havai fişek)
 *   sahne → RN : { type:"tap", key }  (birime dokunuldu)
 *                { type:"ready" }
 *
 * KÖPRÜ v2 (Kulüp Şehri 2.0; ilk "city2" iletisiyle sahne v2 düzenine geçer,
 * v1 "city" yolu eski sunucular için olduğu gibi çalışır):
 *   RN → sahne : ArenaCmd({ type:"city2", buildings, rung, kit, marks, landmarks, grid, place, focus })
 *                  buildings  { halisaha:3, kulup:1, stadyum:0, … }  (12 bina, aşama; 0 = kurulmadı)
 *                  marks      { <bina>: "up" | "lock" | "max" | "closed" }  (closed: kilitli arsa + tabela)
 *                  landmarks  [{ id, key, slot:"r0c3", tier }]  (yerleşik sembol yapılar)
 *                  grid       { cols:8, rows:8, open_rows }  (satır ≥ open_rows çitli/soluk)
 *                  place      null | { key }  (yerleştirme: boş açık yuvalar parlar, hayalet yapı)
 *                  focus      null | <bina> | "landmarks"
 *                ArenaCmd({ type:"build", key })  (o binanın inşaat animasyonu)
 *                Aşama iki ileti arasında yükselirse inşaat kendiliğinden oynar.
 *   sahne → RN : { type:"tap", key }  (12 bina anahtarından biri)
 *                { type:"slot", slot:"r2c5", id:null | <landmark id> }
 *
 * ÇİZİM: düz Canvas 2D, 2:1 İZOMETRİK. Savunma Hattı ailesinin "flat vector"
 * dili: doygun renkler, kalın lacivert kontur, parlak vurgu, yumuşak gölge,
 * iri kafalı çizgi film futbolcular. Dünya metre cinsindendir; x sağa-aşağı,
 * z sola-aşağı, y yukarı. Şehir 5×5 hücrelik bir ada: merkezde stadyum, 10
 * birimin arsaları ve dolgu (park, ev, apartman) hücreleri; hücreler arasında
 * kaldırımlı yollar.
 *
 * ÖNBELLEK: her yapı (birim × basamak × gün saati × forma × çözünürlük kovası)
 * bir kez ekran dışı tuvale çizilir; karede yalnız kopyalanır (60 fps). Zemin,
 * yollar ve canlılar her karede vektörle çizilir (her yakınlaşmada keskin).
 *
 * İNSANLAR: sahada maç (oyuncu sayısı sahanın basamağıyla büyür: okul
 * bahçesinde 6 çocuk, büyük sahada 22 oyuncu ve hakem), tribünde taraftar,
 * kafeterya/mağazada kuyruk, antrenmanda koni çalışması, akademide çocuklar,
 * kampta ateş başında takım, kaldırımda yayalar, yolda arabalar, otobüs, metro.
 *
 * KAMERA: sürükle → kaydır; iki parmak / tekerlek → yakınlaş; birime dokun →
 * kamera yumuşakça uçar ve RN'e { type:"tap" } gider.
 */
(function () {
  "use strict";
  var A = window.Arena;
  A.FONT = '"SF Pro Rounded", ui-rounded, "Nunito", "Arial Rounded MT Bold", -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif';

  /* ─────────────────────────── renkler ─────────────────────────── */
  var NAVY = "#1B1648";
  var HY = 1.15; // 1 m yükseklik = 1,15 izometrik birim (biraz uzun, sevimli)
  var SQ2 = Math.SQRT2;
  var DPR = Math.min(window.devicePixelRatio || 1, 3);

  function rgbOf(h) {
    var n = parseInt(h.slice(1), 16);
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
  function lit(c, t) {
    return mixc(c, "#FFFFFF", t);
  }
  function dk(c, t) {
    return mixc(c, NAVY, t);
  }
  function upper(s) {
    try {
      return String(s).toLocaleUpperCase("tr-TR");
    } catch (e) {
      return String(s).toUpperCase();
    }
  }

  /* Gün saati: cihaz saatine göre. Gece renkler laciverte kayar, pencereler yanar. */
  var THEMES = {
    day: { key: "day", night: 0, tint: null, tk: 0, shadow: 0.2 },
    sunset: { key: "sunset", night: 0.4, tint: "#FF6F61", tk: 0.15, shadow: 0.24 },
    night: { key: "night", night: 1, tint: "#202878", tk: 0.44, shadow: 0.14 },
  };
  var TH = THEMES.day;
  var themeOverride = null;
  function themeNow() {
    if (themeOverride && THEMES[themeOverride]) return themeOverride;
    var h = new Date().getHours();
    return h >= 7 && h < 17 ? "day" : h >= 17 && h < 20 ? "sunset" : "night";
  }
  /** Temaya göre renk (gece lacivert, gün batımı turuncu). */
  function K(c) {
    return TH.tk ? mixc(c, TH.tint, TH.tk) : c;
  }

  /* ─────────────────────────── durum ─────────────────────────── */

  var ORDER = ["saha", "tribun", "soyunma", "kantin", "magaza", "kulup", "saglik", "medya", "antrenman", "akademi", "kamp", "ulasim"];
  var TITLES = {
    saha: "Ana saha", tribun: "Tribün", soyunma: "Soyunma", kantin: "Kafeterya", magaza: "Mağaza", kulup: "Kulüp binası",
    saglik: "Sağlık", medya: "Medya", antrenman: "Antrenman", akademi: "Akademi", kamp: "Kamp oteli", ulasim: "Ulaşım",
  };
  /** Son basamaklar (sunucudaki merdivenle aynı); üstü son basamak gibi çizilir. */
  var MAXLV = { saha: 7, tribun: 7, soyunma: 6, kantin: 6, magaza: 5, kulup: 6, saglik: 5, medya: 5, antrenman: 6, akademi: 4, kamp: 5, ulasim: 6 };

  /* Ada: C metrelik hücreler, aralarında yol. Arsa hücre içi ±HALF. */
  var EDGE = 138, ROADS = [-84, -30, 30, 84];
  var CELL = {
    saha: [0, 0], tribun: [0, 0],
    akademi: [-2, -2], antrenman: [-1, -1], soyunma: [-1, 0], kulup: [0, -1],
    kantin: [-1, 1], saglik: [1, -1], magaza: [0, 1], medya: [1, 0],
    kamp: [1, 1], ulasim: [2, 2],
  };
  /* Hücre merkezleri: stadyum hücresi daha geniş (yollar ±30 ve ±84). */
  var CC = { "-2": -111, "-1": -57, "0": 0, "1": 57, "2": 111 };
  var PLOTS = {};
  ORDER.forEach(function (k) {
    PLOTS[k] = { x: CC[CELL[k][0]], z: CC[CELL[k][1]] };
  });
  var FILLERS = [];
  (function () {
    var used = {};
    ORDER.forEach(function (k) {
      used[CELL[k][0] + "," + CELL[k][1]] = 1;
    });
    for (var i = -2; i <= 2; i++)
      for (var j = -2; j <= 2; j++) if (!used[i + "," + j]) FILLERS.push({ i: i, j: j, x: CC[i], z: CC[j], kind: fillerKind(i, j) });
  })();
  function fillerKind(i, j) {
    if (i + j <= -2) return (i * 7 + j * 3) % 2 ? "apts" : "towers"; // arka: şehir silueti
    if (i === 0 || j === 0) return "park";
    return (i * 5 + j * 11 + 20) % 3 === 0 ? "park" : "houses";
  }

  var levels = {};
  var prevLevels = {};
  ORDER.forEach(function (k) {
    levels[k] = 0;
    prevLevels[k] = 0;
  });
  var marks = {};
  var kit = { primary: "#5B3DF5", secondary: "#FFFFFF" };
  var tierTitle = "";
  var received = false;
  var W = 0, H = 0;
  function lvOf(k) {
    if (V2 && MAX2[k] != null) return Math.min(st2[k] || 0, MAX2[k]);
    return Math.min(levels[k], MAXLV[k]);
  }

  /* ─────────────────────────── kamera ─────────────────────────── */

  var cam = { tx: 0, tz: 0, zoom: 1, lift: 6 };
  var camGoal = { tx: 0, tz: 0, zoom: 1, lift: 6 };
  var homeZoom = 1;
  var focusKey = null;
  var drag = null, pinch = null;
  var ZMAX = 9;

  function computeHome() {
    homeZoom = A.clamp(Math.min(W / 292, H / 318), 0.4, 4);
  }
  function focusZoom(key) {
    if (key === "landmarks") return A.clamp(Math.min(W / 84, H / 70), 0.8, ZMAX);
    if (V2 && key === "halisaha") return A.clamp(Math.min(W / 96, H / 84), 0.8, ZMAX);
    if (isStad(key)) return A.clamp(Math.min(W / 80, H / 74), 0.8, ZMAX);
    return A.clamp(Math.min(W / 66, H / 60), 0.8, ZMAX);
  }
  function setFocus(key) {
    var p = V2 ? (key === "landmarks" ? { x: LMD.x, z: LMD.z } : key === "halisaha" ? { x: CC[-1] + 1, z: -11 } : PLOTS[key]) : PLOTS[key];
    focusKey = p ? key : null;
    if (!p) {
      camGoal.tx = 0;
      camGoal.tz = 0;
      camGoal.zoom = homeZoom;
      camGoal.lift = 6;
      return;
    }
    camGoal.tx = p.x;
    camGoal.tz = p.z;
    camGoal.zoom = focusZoom(key);
    camGoal.lift = isStad(key) || key === "landmarks" ? 6 : focusLift(key);
  }

  /** Dünya → ekran (css px). */
  function W2S(x, y, z) {
    var Z = cam.zoom;
    return [W / 2 + (x - z - (cam.tx - cam.tz)) * Z, H * 0.5 + ((x + z - cam.tx - cam.tz) * 0.5 - (y - cam.lift) * HY) * Z];
  }
  /** Ekran → zemin (y = h düzlemi). */
  function S2W(px, py, h) {
    var Z = cam.zoom;
    var u = (px - W / 2) / Z + (cam.tx - cam.tz);
    var v = 2 * ((py - H * 0.5) / Z + ((h || 0) - cam.lift) * HY) + cam.tx + cam.tz;
    return { x: (u + v) / 2, z: (v - u) / 2 };
  }

  /* ═══════════════════════ çizim bağlamı ═══════════════════════
   * G: etkin çizim hedefi. Sprite kurulurken yerel izdüşüm (arsa merkezi 0,0),
   * karede kamera izdüşümü. Bütün ilkel çizimler G üstünden çalışır. */
  var G = { c: null, P: W2S, s: 1, lw: 1.5 };

  function quad(c, a, b, d, e) {
    c.beginPath();
    c.moveTo(a[0], a[1]);
    c.lineTo(b[0], b[1]);
    c.lineTo(d[0], d[1]);
    c.lineTo(e[0], e[1]);
    c.closePath();
  }
  function polyPath(c, pts) {
    c.beginPath();
    c.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
    c.closePath();
  }
  function outline(c, w) {
    c.lineJoin = "round";
    c.lineCap = "round";
    c.strokeStyle = NAVY;
    c.lineWidth = w == null ? G.lw : w;
    c.stroke();
  }

  /**
   * Yüz dönüşümü: yüzeyin kendi 2B uzayında (metre) çizim. which:
   *   "L"  +z yüzü (sol ön), u: x boyunca, v: tepeden aşağı
   *   "R"  +x yüzü (sağ ön), u: soldan sağa (z azalır), v: tepeden aşağı
   *   "T"  üst yüz, u: x, v: z
   *   "BL" -x yüzü (iç yüz, arka sol) — tribün basamakları için, u: z boyunca
   */
  function faceDo(which, x, z, w, d, y0, h, fn, noClip) {
    var c = G.c, P = G.P, o, du, dv, FW, FH;
    var y1 = y0 + h;
    if (which === "L") {
      o = P(x - w / 2, y1, z + d / 2);
      du = P(x - w / 2 + 1, y1, z + d / 2);
      dv = P(x - w / 2, y1 - 1, z + d / 2);
      FW = w;
      FH = h;
    } else if (which === "R") {
      o = P(x + w / 2, y1, z + d / 2);
      du = P(x + w / 2, y1, z + d / 2 - 1);
      dv = P(x + w / 2, y1 - 1, z + d / 2);
      FW = d;
      FH = h;
    } else {
      o = P(x - w / 2, y1, z - d / 2);
      du = P(x - w / 2 + 1, y1, z - d / 2);
      dv = P(x - w / 2, y1, z - d / 2 + 1);
      FW = w;
      FH = d;
    }
    c.save();
    c.transform(du[0] - o[0], du[1] - o[1], dv[0] - o[0], dv[1] - o[1], o[0], o[1]);
    if (!noClip) {
      c.beginPath();
      c.rect(0, 0, FW, FH);
      c.clip();
    }
    fn(c, FW, FH);
    c.restore();
  }
  /** Zemin düzleminde (y) dünya x,z koordinatlarıyla çizim. */
  function topDo(y, fn) {
    var c = G.c, P = G.P;
    var o = P(0, y, 0), du = P(1, y, 0), dv = P(0, y, 1);
    c.save();
    c.transform(du[0] - o[0], du[1] - o[1], dv[0] - o[0], dv[1] - o[1], o[0], o[1]);
    fn(c);
    c.restore();
  }
  /** Yüz uzayında ortalı yazı (boy metre). */
  function ftext(c, t, u, v, size, col, maxW, weight) {
    c.save();
    c.translate(u, v);
    var k = size / 40;
    c.scale(k, k);
    c.font = A.font(40, weight || 900);
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillStyle = col;
    if (maxW) c.fillText(t, 0, 2, maxW / k);
    else c.fillText(t, 0, 2);
    c.restore();
  }
  /** Yüz uzayında tabela paneli. */
  function fsign(c, u, v, w, h, text, bg, fg, glow) {
    var night = TH.night > 0.5;
    A.roundRect(c, u - w / 2, v - h / 2, w, h, Math.min(h * 0.3, 0.6));
    c.fillStyle = glow && night ? lit(bg, 0.12) : K(bg);
    c.fill();
    c.lineWidth = 0.16;
    c.strokeStyle = NAVY;
    c.stroke();
    c.fillStyle = "rgba(255,255,255,0.22)";
    A.roundRect(c, u - w / 2 + 0.2, v - h / 2 + 0.15, w - 0.4, h * 0.32, 0.2);
    c.fill();
    ftext(c, text, u, v + h * 0.02, h * 0.62, glow && night ? "#FFFFFF" : K(fg || "#FFFFFF"), w * 0.9);
  }
  /** Pencere ızgarası (yüz uzayında). Gündüz mavi cam, gece rastgele yanar. */
  function windowsGrid(c, FW, FH, o) {
    o = o || {};
    var ww = o.ww || 1.3, wh = o.wh || 1.5, gx = o.gx || 1.1, gy = o.gy || 1.6;
    var top = o.top == null ? 1.1 : o.top, bot = o.bot == null ? 0.9 : o.bot;
    var cols = Math.max(1, Math.floor((FW - (o.mx || 0.8) * 2 + gx) / (ww + gx)));
    var rows = Math.max(1, Math.floor((FH - top - bot + gy) / (wh + gy)));
    if (o.rows) rows = Math.min(rows, o.rows);
    var x0 = (FW - (cols * ww + (cols - 1) * gx)) / 2;
    var rnd = SP ? SP.rnd : Math.random;
    for (var r = 0; r < rows; r++)
      for (var k = 0; k < cols; k++) {
        if (o.skip && o.skip(r, k, rows, cols)) continue;
        var x = x0 + k * (ww + gx), y = top + r * (wh + gy);
        win(c, x, y, ww, wh, rnd() < (o.litK == null ? 0.62 : o.litK), o.glass);
      }
  }
  function win(c, x, y, w, h, on, glass) {
    var night = TH.night;
    A.roundRect(c, x, y, w, h, Math.min(w, h) * 0.18);
    if (night > 0.5) c.fillStyle = on ? "#FFD98A" : "#2B2F6E";
    else if (night > 0) c.fillStyle = on ? "#FFC983" : K(glass || "#8FD3FF");
    else c.fillStyle = glass || "#8FD3FF";
    c.fill();
    c.lineWidth = Math.min(w, h) * 0.12;
    c.strokeStyle = night > 0.5 ? "#141043" : K("#3D3A8C");
    c.stroke();
    if (night <= 0.5 || !on) {
      c.fillStyle = "rgba(255,255,255,0.55)";
      c.beginPath();
      c.moveTo(x + w * 0.18, y + h * 0.85);
      c.lineTo(x + w * 0.18, y + h * 0.18);
      c.lineTo(x + w * 0.55, y + h * 0.18);
      c.closePath();
      c.fill();
    } else {
      c.fillStyle = "rgba(255,255,255,0.45)";
      c.fillRect(x + w * 0.15, y + h * 0.12, w * 0.7, h * 0.18);
    }
  }

  /* ═══════════════════════ sprite kaydedici ═══════════════════════ */

  var SP = null;
  function ext(x, y, z) {
    var u = x - z, v = (x + z) * 0.5 - y * HY;
    if (u < SP.u0) SP.u0 = u;
    if (u > SP.u1) SP.u1 = u;
    if (v < SP.v0) SP.v0 = v;
    if (v > SP.v1) SP.v1 = v;
  }
  function extBox(x, z, w, d, y0, h) {
    ext(x + w / 2, y0, z - d / 2);
    ext(x - w / 2, y0, z + d / 2);
    ext(x - w / 2, y0 + h, z - d / 2);
    ext(x + w / 2, y0, z + d / 2);
  }
  function extBill(x, z, rw, top) {
    // ekrana dönük (billboard) öğe: rw yarı genişlik (iz. birim), top yükseklik (m)
    var u = x - z, v = (x + z) * 0.5;
    if (u - rw < SP.u0) SP.u0 = u - rw;
    if (u + rw > SP.u1) SP.u1 = u + rw;
    if (v - top * HY - rw * 0.3 < SP.v0) SP.v0 = v - top * HY - rw * 0.3;
    if (v + 1 > SP.v1) SP.v1 = v + 1;
  }
  function flat(fn) {
    SP.flats.push(fn);
  }
  function body(depth, fn) {
    SP.bodies.push({ d: depth, i: SP.bodies.length, fn: fn });
  }
  function anchor(a) {
    SP.anchors.push(a);
  }
  /** Gölge: kutunun tabanı ve güneşe göre kaydırılmış tavanının dışbükey zarfı. */
  function shadowBox(x, z, w, d, h, y0) {
    if (!SP) return;
    var k = (h + (y0 || 0) * 0.6) * 0.55, kz = (h + (y0 || 0) * 0.6) * 0.18;
    var pts = [];
    [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (q) {
      var px = x + (q[0] * w) / 2, pz = z + (q[1] * d) / 2;
      pts.push([px, pz], [px + k, pz - kz]);
    });
    SP.shadows.push({ hull: pts });
  }
  function shadowEllipse(x, z, r, h) {
    if (!SP) return;
    SP.shadows.push({ ell: [x + h * 0.35, z - h * 0.1, r] });
  }
  function hull(pts) {
    pts = pts.slice().sort(function (a, b) {
      return a[0] - b[0] || a[1] - b[1];
    });
    var cr = function (o, a, b) {
      return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    };
    var lo = [], hi = [];
    for (var i = 0; i < pts.length; i++) {
      while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], pts[i]) <= 0) lo.pop();
      lo.push(pts[i]);
    }
    for (var j = pts.length - 1; j >= 0; j--) {
      while (hi.length >= 2 && cr(hi[hi.length - 2], hi[hi.length - 1], pts[j]) <= 0) hi.pop();
      hi.push(pts[j]);
    }
    hi.pop();
    lo.pop();
    return lo.concat(hi);
  }
  function drawShadows(c, list) {
    if (!list.length) return;
    c.beginPath();
    list.forEach(function (s) {
      if (s.hull) {
        var h = hull(
          s.hull.map(function (p) {
            return G.P(p[0], 0, p[1]);
          }),
        );
        // saat yönünde (canvas y aşağı): elipslerle birleşim tek kat boyansın
        var area = 0;
        for (var i = 0; i < h.length; i++) {
          var a = h[i], b = h[(i + 1) % h.length];
          area += a[0] * b[1] - b[0] * a[1];
        }
        if (area < 0) h.reverse();
        c.moveTo(h[0][0], h[0][1]);
        for (var k = 1; k < h.length; k++) c.lineTo(h[k][0], h[k][1]);
        c.closePath();
      } else {
        var p = G.P(s.ell[0], 0, s.ell[1]);
        var rx = s.ell[2] * SQ2 * G.s;
        c.moveTo(p[0] + rx, p[1]);
        c.ellipse(p[0], p[1], rx, rx / 2, 0, 0, Math.PI * 2);
      }
    });
    c.fillStyle = "rgba(27,22,72," + TH.shadow + ")";
    c.fill("nonzero");
  }

  /* ═══════════════════════ ilkel şekiller ═══════════════════════ */

  /**
   * Kutu (x,z merkez; w x boyunca, d z boyunca; y0 taban, h yükseklik).
   * o: top/left/right renk, fL/fR/fT yüz çizimleri, noShadow, depth, noLine,
   *    gloss (üst kenar parlaması), alpha.
   */
  function box(x, z, w, d, y0, h, col, o) {
    o = o || {};
    extBox(x, z, w, d, y0, h);
    if (!o.noShadow && h > 0.6) shadowBox(x, z, w, d, h, y0);
    body(o.depth != null ? o.depth : x + z + (o.dz || 0), function () {
      drawBox(x, z, w, d, y0, h, col, o);
    });
  }
  function drawBox(x, z, w, d, y0, h, col, o) {
    o = o || {};
    var c = G.c, P = G.P;
    var x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2, y1 = y0 + h;
    var a = P(x0, y0, z1), b = P(x1, y0, z1), e = P(x1, y0, z0);
    var A1 = P(x0, y1, z1), B1 = P(x1, y1, z1), E1 = P(x1, y1, z0), F1 = P(x0, y1, z0);
    if (o.alpha != null) c.globalAlpha = o.alpha;
    var cl = o.rawL || K(o.left || col), cr = o.rawR || K(o.right || dk(col, 0.2)), ct = o.rawT || K(o.top || lit(col, 0.22));
    if (h > 0) {
      quad(c, a, b, B1, A1);
      c.fillStyle = cl;
      c.fill();
      if (o.fL) faceDo("L", x, z, w, d, y0, h, o.fL);
      quad(c, b, e, E1, B1);
      c.fillStyle = cr;
      c.fill();
      if (o.fR) faceDo("R", x, z, w, d, y0, h, o.fR);
    }
    quad(c, A1, B1, E1, F1);
    c.fillStyle = ct;
    c.fill();
    if (o.fT) faceDo("T", x, z, w, d, y0, h, o.fT);
    if (o.gloss !== false && h > 0) {
      // üst ön kenarda parlak şerit (ışık soldan-yukarıdan)
      c.strokeStyle = "rgba(255,255,255," + (TH.night > 0.5 ? 0.18 : 0.5) + ")";
      c.lineWidth = G.lw * 0.7;
      c.beginPath();
      var ins = G.lw * 0.9;
      c.moveTo(A1[0] + ins, A1[1] + ins * 0.9);
      c.lineTo(B1[0] - ins * 0.3, B1[1] + ins * 0.9);
      c.stroke();
    }
    if (!o.noLine) {
      c.lineJoin = "round";
      c.strokeStyle = NAVY;
      c.lineWidth = G.lw;
      c.beginPath();
      if (h > 0) {
        c.moveTo(a[0], a[1]);
        c.lineTo(b[0], b[1]);
        c.lineTo(e[0], e[1]);
        c.lineTo(E1[0], E1[1]);
        c.lineTo(F1[0], F1[1]);
        c.lineTo(A1[0], A1[1]);
        c.closePath();
      } else {
        c.moveTo(A1[0], A1[1]);
        c.lineTo(B1[0], B1[1]);
        c.lineTo(E1[0], E1[1]);
        c.lineTo(F1[0], F1[1]);
        c.closePath();
      }
      c.stroke();
      if (h > 0) {
        c.lineWidth = G.lw * 0.55;
        c.beginPath();
        c.moveTo(A1[0], A1[1]);
        c.lineTo(B1[0], B1[1]);
        c.lineTo(E1[0], E1[1]);
        c.moveTo(B1[0], B1[1]);
        c.lineTo(b[0], b[1]);
        c.stroke();
      }
    }
    if (o.alpha != null) c.globalAlpha = 1;
  }

  /** Beşik çatılı ev gövdesi + çatı. ridgeX: mahya x boyunca. */
  function gable(x, z, w, d, y0, h, rh, wall, roof, o) {
    o = o || {};
    box(x, z, w, d, y0, h, wall, { fL: o.fL, fR: o.fR, depth: o.depth, gloss: false });
    var ov = o.over == null ? 0.6 : o.over;
    extBox(x, z, w + ov * 2, d + ov * 2, y0, h + rh);
    body((o.depth != null ? o.depth : x + z) + 0.01, function () {
      drawGableRoof(x, z, w, d, y0 + h, rh, roof, ov, o.ridgeZ);
    });
  }
  function drawGableRoof(x, z, w, d, y, rh, roof, ov, ridgeZ) {
    var c = G.c, P = G.P;
    var x0 = x - w / 2 - ov, x1 = x + w / 2 + ov, z0 = z - d / 2 - ov, z1 = z + d / 2 + ov;
    var yr = y + rh, rl = K(roof), rd = K(dk(roof, 0.25)), rt = K(lit(roof, 0.15));
    c.lineJoin = "round";
    if (!ridgeZ) {
      // mahya x boyunca (z = orta)
      quad(c, P(x0, y, z0), P(x1, y, z0), P(x1, yr, z), P(x0, yr, z));
      c.fillStyle = rt;
      c.fill();
      outline(c);
      // +x üçgen alın
      c.beginPath();
      var g1 = P(x - w / 2 + w, y, z + d / 2), g2 = P(x + w / 2, y, z - d / 2), g3 = P(x + w / 2, yr - 0.15, z);
      c.moveTo(g1[0], g1[1]);
      c.lineTo(g2[0], g2[1]);
      c.lineTo(g3[0], g3[1]);
      c.closePath();
      c.fillStyle = K(dk("#FFF3DC", 0.12));
      c.fill();
      outline(c, G.lw * 0.6);
      quad(c, P(x0, y, z1), P(x1, y, z1), P(x1, yr, z), P(x0, yr, z));
      c.fillStyle = rl;
      c.fill();
      // kiremit çizgileri
      c.save();
      c.clip();
      c.strokeStyle = rgba(NAVY, 0.18);
      c.lineWidth = G.lw * 0.5;
      for (var t = 0.25; t < 1; t += 0.25) {
        var p1 = P(x0, y + rh * t, z1 - (z1 - z) * t), p2 = P(x1, y + rh * t, z1 - (z1 - z) * t);
        c.beginPath();
        c.moveTo(p1[0], p1[1]);
        c.lineTo(p2[0], p2[1]);
        c.stroke();
      }
      c.restore();
      quad(c, P(x0, y, z1), P(x1, y, z1), P(x1, yr, z), P(x0, yr, z));
      outline(c);
    } else {
      quad(c, P(x0, y, z0), P(x0, y, z1), P(x, yr, z1), P(x, yr, z0));
      c.fillStyle = rt;
      c.fill();
      outline(c);
      c.beginPath();
      var h1 = P(x - w / 2, y, z + d / 2), h2 = P(x + w / 2, y, z + d / 2), h3 = P(x, yr - 0.15, z + d / 2);
      c.moveTo(h1[0], h1[1]);
      c.lineTo(h2[0], h2[1]);
      c.lineTo(h3[0], h3[1]);
      c.closePath();
      c.fillStyle = K("#FFF3DC");
      c.fill();
      outline(c, G.lw * 0.6);
      quad(c, P(x1, y, z0), P(x1, y, z1), P(x, yr, z1), P(x, yr, z0));
      c.fillStyle = rd;
      c.fill();
      outline(c);
    }
  }

  /** Piramit / çadır (taban w×d, tepe yüksekliği h). */
  function pyramid(x, z, w, d, y0, h, col, o) {
    o = o || {};
    extBox(x, z, w, d, y0, h);
    if (!o.noShadow) shadowBox(x, z, w * 0.7, d * 0.7, h, y0);
    body(o.depth != null ? o.depth : x + z, function () {
      var c = G.c, P = G.P;
      var t = P(x, y0 + h, z), a = P(x - w / 2, y0, z + d / 2), b = P(x + w / 2, y0, z + d / 2), e = P(x + w / 2, y0, z - d / 2);
      c.beginPath();
      c.moveTo(a[0], a[1]);
      c.lineTo(b[0], b[1]);
      c.lineTo(t[0], t[1]);
      c.closePath();
      c.fillStyle = K(col);
      c.fill();
      c.beginPath();
      c.moveTo(b[0], b[1]);
      c.lineTo(e[0], e[1]);
      c.lineTo(t[0], t[1]);
      c.closePath();
      c.fillStyle = K(dk(col, 0.22));
      c.fill();
      if (o.stripe) {
        c.save();
        c.beginPath();
        c.moveTo(a[0], a[1]);
        c.lineTo(b[0], b[1]);
        c.lineTo(t[0], t[1]);
        c.closePath();
        c.clip();
        c.strokeStyle = K(o.stripe);
        c.lineWidth = G.s * 0.5;
        for (var i = 1; i < 4; i++) {
          var p = [a[0] + ((b[0] - a[0]) * i) / 4, a[1] + ((b[1] - a[1]) * i) / 4];
          c.beginPath();
          c.moveTo(p[0], p[1]);
          c.lineTo(t[0], t[1]);
          c.stroke();
        }
        c.restore();
      }
      c.beginPath();
      c.moveTo(a[0], a[1]);
      c.lineTo(b[0], b[1]);
      c.lineTo(e[0], e[1]);
      c.lineTo(t[0], t[1]);
      c.closePath();
      outline(c);
      c.beginPath();
      c.moveTo(b[0], b[1]);
      c.lineTo(t[0], t[1]);
      outline(c, G.lw * 0.6);
    });
  }

  /** Dikey silindir (parlak yan, açık tepe). */
  function cyl(x, z, r, y0, h, col, o) {
    o = o || {};
    extBox(x, z, r * 2, r * 2, y0, h);
    if (!o.noShadow && h > 1) shadowEllipse(x, z, r, h);
    body(o.depth != null ? o.depth : x + z, function () {
      drawCyl(x, z, r, y0, h, col, o);
    });
  }
  function drawCyl(x, z, r, y0, h, col, o) {
    o = o || {};
    var c = G.c, P = G.P;
    var b = P(x, y0, z), t = P(x, y0 + h, z), rx = r * SQ2 * G.s, ry = rx / 2;
    if (h > 0) {
      c.beginPath();
      c.moveTo(b[0] - rx, t[1]);
      c.lineTo(b[0] - rx, b[1]);
      c.ellipse(b[0], b[1], rx, ry, 0, Math.PI, 0, true);
      c.lineTo(b[0] + rx, t[1]);
      c.ellipse(t[0], t[1], rx, ry, 0, 0, Math.PI, false);
      c.closePath();
      var g = c.createLinearGradient(b[0] - rx, 0, b[0] + rx, 0);
      g.addColorStop(0, K(lit(col, 0.1)));
      g.addColorStop(0.3, K(lit(col, 0.35)));
      g.addColorStop(0.55, K(col));
      g.addColorStop(1, K(dk(col, 0.3)));
      c.fillStyle = o.flatSide ? K(col) : g;
      c.fill();
      if (o.fS) {
        c.save();
        c.clip();
        o.fS(c, b, t, rx, ry);
        c.restore();
      }
      outline(c);
    }
    if (!o.open) {
      c.beginPath();
      c.ellipse(t[0], t[1], rx, ry, 0, 0, Math.PI * 2);
      c.fillStyle = K(o.top || lit(col, 0.25));
      c.fill();
      if (o.fTop) o.fTop(c, t, rx, ry);
      outline(c, h > 0 ? G.lw * 0.7 : G.lw);
    }
  }
  /** Kubbe (yarım küre benzeri). */
  function dome(x, z, r, y0, col, o) {
    o = o || {};
    extBox(x, z, r * 2, r * 2, y0, r * (o.hk || 1));
    body(o.depth != null ? o.depth : x + z + 0.02, function () {
      var c = G.c, P = G.P;
      var b = P(x, y0, z), rx = r * SQ2 * G.s, ry = rx / 2, hh = r * (o.hk || 1) * HY * G.s;
      c.beginPath();
      c.ellipse(b[0], b[1], rx, ry, 0, 0, Math.PI, false);
      c.ellipse(b[0], b[1], rx, hh + ry * 0.2, 0, Math.PI, Math.PI * 2, false);
      c.closePath();
      var g = c.createRadialGradient(b[0] - rx * 0.35, b[1] - hh * 0.6, rx * 0.05, b[0], b[1] - hh * 0.2, rx * 1.2);
      g.addColorStop(0, K(lit(col, 0.6)));
      g.addColorStop(0.45, K(col));
      g.addColorStop(1, K(dk(col, 0.35)));
      c.fillStyle = g;
      c.fill();
      if (o.ribs) {
        c.save();
        c.clip();
        c.strokeStyle = rgba(NAVY, 0.25);
        c.lineWidth = G.lw * 0.5;
        for (var i = -3; i <= 3; i++) {
          c.beginPath();
          c.ellipse(b[0], b[1], Math.abs(rx * i) / 3.5 + 0.01, hh + ry * 0.2, 0, Math.PI, Math.PI * 2);
          c.stroke();
        }
        c.restore();
      }
      outline(c);
    });
  }

  /** Ekrana dönük çizgi film ağacı. sz≈1: 5 m. */
  var TREE_TONES = ["#3FBF55", "#52CC5E", "#2FAE4E", "#6AD36A"];
  function tree(x, z, sz, tone) {
    sz = sz || 1;
    extBill(x, z, 2.6 * sz, 6 * sz);
    shadowEllipse(x + 0.5, z - 0.2, 1.9 * sz, 3 * sz);
    body(x + z, function () {
      drawTree(x, z, sz, tone);
    });
  }
  function drawTree(x, z, sz, tone) {
    var c = G.c, p = G.P(x, 0, z), s = G.s * sz;
    var col = tone || TREE_TONES[Math.abs(Math.round(x * 3 + z * 7)) % TREE_TONES.length];
    var lw = G.lw;
    // gövde
    c.beginPath();
    c.moveTo(p[0] - 0.35 * s, p[1]);
    c.lineTo(p[0] - 0.25 * s, p[1] - 2.4 * s);
    c.lineTo(p[0] + 0.25 * s, p[1] - 2.4 * s);
    c.lineTo(p[0] + 0.35 * s, p[1]);
    c.closePath();
    c.fillStyle = K("#9A6232");
    c.fill();
    outline(c, lw * 0.8);
    var blobs = [[0, -4.3, 1.7], [-1.2, -3.3, 1.35], [1.2, -3.2, 1.3], [0.2, -2.9, 1.2]];
    c.beginPath();
    blobs.forEach(function (q) {
      c.moveTo(p[0] + q[0] * s + q[2] * s, p[1] + q[1] * s);
      c.arc(p[0] + q[0] * s, p[1] + q[1] * s, q[2] * s, 0, Math.PI * 2);
    });
    c.strokeStyle = NAVY;
    c.lineWidth = lw * 2;
    c.stroke();
    c.fillStyle = K(col);
    c.fill();
    c.fillStyle = K(dk(col, 0.18));
    c.beginPath();
    c.arc(p[0] + 0.4 * s, p[1] - 2.7 * s, 1.05 * s, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = K(lit(col, 0.3));
    c.beginPath();
    c.arc(p[0] - 0.45 * s, p[1] - 4.75 * s, 0.75 * s, 0, Math.PI * 2);
    c.arc(p[0] - 1.45 * s, p[1] - 3.6 * s, 0.45 * s, 0, Math.PI * 2);
    c.fill();
  }
  function palm(x, z, sz) {
    sz = sz || 1;
    extBill(x, z, 3 * sz, 7 * sz);
    shadowEllipse(x + 0.6, z, 1.6 * sz, 4 * sz);
    body(x + z, function () {
      var c = G.c, p = G.P(x, 0, z), s = G.s * sz;
      c.beginPath();
      c.moveTo(p[0] - 0.3 * s, p[1]);
      c.quadraticCurveTo(p[0] + 0.6 * s, p[1] - 3 * s, p[0] + 0.3 * s, p[1] - 6 * s);
      c.lineTo(p[0] + 0.75 * s, p[1] - 6 * s);
      c.quadraticCurveTo(p[0] + 1 * s, p[1] - 3 * s, p[0] + 0.3 * s, p[1]);
      c.closePath();
      c.fillStyle = K("#B07A3C");
      c.fill();
      outline(c, G.lw * 0.8);
      var tx = p[0] + 0.5 * s, ty = p[1] - 6.1 * s;
      [-2.6, -1.9, -0.9, 0.2, 1.1, 2.0, 2.7].forEach(function (a, i) {
        c.beginPath();
        var ex = tx + Math.sin(a) * 2.6 * s, ey = ty - Math.cos(a) * 1.4 * s + (Math.abs(a) > 1.5 ? 1.4 * s : 0);
        c.moveTo(tx, ty);
        c.quadraticCurveTo((tx + ex) / 2, ey - 1.1 * s, ex, ey);
        c.quadraticCurveTo((tx + ex) / 2, ey - 0.2 * s, tx, ty);
        c.fillStyle = K(i % 2 ? "#2FAE4E" : "#45C35A");
        c.fill();
        outline(c, G.lw * 0.7);
      });
    });
  }
  function bush(x, z, sz, col) {
    sz = sz || 1;
    extBill(x, z, 1.4 * sz, 1.6 * sz);
    body(x + z, function () {
      var c = G.c, p = G.P(x, 0, z), s = G.s * sz;
      c.beginPath();
      [[-0.6, -0.6, 0.7], [0.5, -0.65, 0.7], [0, -1.05, 0.75]].forEach(function (q) {
        c.moveTo(p[0] + q[0] * s + q[2] * s, p[1] + q[1] * s);
        c.arc(p[0] + q[0] * s, p[1] + q[1] * s, q[2] * s, 0, Math.PI * 2);
      });
      c.strokeStyle = NAVY;
      c.lineWidth = G.lw * 1.6;
      c.stroke();
      c.fillStyle = K(col || "#3DBA4E");
      c.fill();
      c.fillStyle = K(lit(col || "#3DBA4E", 0.3));
      c.beginPath();
      c.arc(p[0] - 0.2 * s, p[1] - 1.3 * s, 0.3 * s, 0, Math.PI * 2);
      c.fill();
    });
  }
  /** Bayrak direği + dalgalı bayrak. */
  function flagpole(x, z, h, col, col2) {
    extBill(x + 1.5, z, 2.5, h + 0.5);
    body(x + z, function () {
      var c = G.c, P = G.P;
      var b = P(x, 0, z), t = P(x, h, z), s = G.s;
      c.strokeStyle = NAVY;
      c.lineWidth = Math.max(G.lw * 1.6, 0.35 * s);
      c.beginPath();
      c.moveTo(b[0], b[1]);
      c.lineTo(t[0], t[1]);
      c.stroke();
      c.strokeStyle = K("#E6E9F5");
      c.lineWidth = Math.max(G.lw * 0.6, 0.18 * s);
      c.stroke();
      c.beginPath();
      c.moveTo(t[0], t[1] + 0.2 * s);
      c.quadraticCurveTo(t[0] + 1.2 * s, t[1] - 0.4 * s, t[0] + 2.6 * s, t[1] + 0.3 * s);
      c.lineTo(t[0] + 2.6 * s, t[1] + 1.9 * s);
      c.quadraticCurveTo(t[0] + 1.2 * s, t[1] + 1.2 * s, t[0], t[1] + 1.8 * s);
      c.closePath();
      c.fillStyle = K(col);
      c.fill();
      if (col2) {
        c.save();
        c.clip();
        c.fillStyle = K(col2);
        c.fillRect(t[0] + 0.9 * s, t[1] - s, 0.6 * s, 4 * s);
        c.restore();
      }
      outline(c, G.lw * 0.8);
      c.fillStyle = K("#FFD43B");
      c.beginPath();
      c.arc(t[0], t[1], 0.25 * s, 0, Math.PI * 2);
      c.fill();
    });
  }
  /** Türk bayrağı (okul). */
  function turkFlag(x, z, h) {
    extBill(x + 1.5, z, 3, h + 0.5);
    body(x + z, function () {
      var c = G.c, P = G.P;
      var b = P(x, 0, z), t = P(x, h, z), s = G.s;
      c.strokeStyle = NAVY;
      c.lineWidth = Math.max(G.lw * 1.6, 0.35 * s);
      c.beginPath();
      c.moveTo(b[0], b[1]);
      c.lineTo(t[0], t[1]);
      c.stroke();
      c.strokeStyle = K("#E6E9F5");
      c.lineWidth = Math.max(G.lw * 0.6, 0.18 * s);
      c.stroke();
      c.beginPath();
      c.moveTo(t[0], t[1] + 0.2 * s);
      c.quadraticCurveTo(t[0] + 1.5 * s, t[1] - 0.5 * s, t[0] + 3.2 * s, t[1] + 0.3 * s);
      c.lineTo(t[0] + 3.2 * s, t[1] + 2.3 * s);
      c.quadraticCurveTo(t[0] + 1.5 * s, t[1] + 1.4 * s, t[0], t[1] + 2.2 * s);
      c.closePath();
      c.fillStyle = K("#E30A17");
      c.fill();
      outline(c, G.lw * 0.8);
      c.fillStyle = K("#FFFFFF");
      c.beginPath();
      c.arc(t[0] + 1.3 * s, t[1] + 1.05 * s, 0.6 * s, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = K("#E30A17");
      c.beginPath();
      c.arc(t[0] + 1.48 * s, t[1] + 1.05 * s, 0.48 * s, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = K("#FFFFFF");
      c.beginPath();
      c.arc(t[0] + 2.1 * s, t[1] + 1.05 * s, 0.22 * s, 0, Math.PI * 2);
      c.fill();
    });
  }
  /** Zemin pedi: yuvarlatılmış dikdörtgen + kalınlık (bordür). */
  function pad(x, z, w, d, col, o) {
    o = o || {};
    var th = o.th == null ? 0.35 : o.th, r = o.r == null ? 2 : o.r;
    extBox(x, z, w, d, 0, th);
    flat(function () {
      topDo(0, function (c) {
        A.roundRect(c, x - w / 2, z - d / 2, w, d, r);
        c.fillStyle = K(o.side || dk(col, 0.3));
        c.fill();
      });
      topDo(th, function (c) {
        A.roundRect(c, x - w / 2, z - d / 2, w, d, r);
        c.fillStyle = K(col);
        c.fill();
        if (o.fn) {
          c.save();
          c.clip();
          o.fn(c);
          c.restore();
        }
        A.roundRect(c, x - w / 2, z - d / 2, w, d, r);
        c.lineWidth = G.lw / G.s;
        c.strokeStyle = rgba(NAVY, o.line == null ? 0.7 : o.line);
        c.stroke();
      });
    });
  }
  /** Su yüzeyi (havuz). */
  function pool(x, z, w, d, col, o) {
    o = o || {};
    box(x, z, w + 1, d + 1, 0, 0.5, "#F2F0FA", { noShadow: true, depth: o.depth != null ? o.depth : x + z - 50 });
    body((o.depth != null ? o.depth : x + z - 50) + 0.01, function () {
      topDo(0.52, function (c) {
        c.beginPath();
        c.rect(x - w / 2, z - d / 2, w, d);
        var g = c.createLinearGradient(x - w / 2, z - d / 2, x + w / 2, z + d / 2);
        g.addColorStop(0, K(lit(col || "#2FD3F5", 0.25)));
        g.addColorStop(1, K(col || "#16A9E8"));
        c.fillStyle = g;
        c.fill();
        c.strokeStyle = "rgba(255,255,255,0.7)";
        c.lineWidth = 0.18;
        for (var i = 0; i < 4; i++) {
          var px = x - w / 2 + ((i * 0.27 + 0.12) % 1) * w, pz = z - d / 2 + ((i * 0.41 + 0.2) % 1) * d;
          c.beginPath();
          c.moveTo(px, pz);
          c.quadraticCurveTo(px + 0.5, pz - 0.3, px + 1, pz);
          c.stroke();
        }
        c.lineWidth = G.lw / G.s;
        c.strokeStyle = NAVY;
        c.strokeRect(x - w / 2, z - d / 2, w, d);
      });
    });
  }
  /** Sabit küçük insan (tribün, bekleyenler) — iri kafa, gövde. */
  var SKINS = ["#F6C9A4", "#E9B08A", "#C98D63", "#8E5B3C", "#F3D3B8"];
  var HAIRS = ["#2B1B12", "#5A3418", "#141414", "#8A5426", "#E2B04A"];
  function fanAt(c, px, py, s, shirt, i, arms) {
    var sk = K(SKINS[i % SKINS.length]);
    c.beginPath();
    c.ellipse(px, py - 0.55 * s, 0.55 * s, 0.6 * s, 0, 0, Math.PI * 2);
    c.fillStyle = K(shirt);
    c.fill();
    if (arms) {
      c.strokeStyle = sk;
      c.lineWidth = 0.22 * s;
      c.beginPath();
      c.moveTo(px - 0.4 * s, py - 0.8 * s);
      c.lineTo(px - 0.7 * s, py - 1.7 * s);
      c.moveTo(px + 0.4 * s, py - 0.8 * s);
      c.lineTo(px + 0.7 * s, py - 1.7 * s);
      c.stroke();
    }
    c.beginPath();
    c.arc(px, py - 1.45 * s, 0.5 * s, 0, Math.PI * 2);
    c.fillStyle = sk;
    c.fill();
    c.fillStyle = K(HAIRS[(i * 3) % HAIRS.length]);
    c.beginPath();
    c.arc(px, py - 1.6 * s, 0.45 * s, Math.PI * 1.05, Math.PI * 1.95);
    c.fill();
  }
  /** Ayakta duran bir kişi (sprite içinde, ekrana dönük). */
  function standee(x, z, shirt, i, sz) {
    sz = sz || 1;
    extBill(x, z, 0.8, 2.4 * sz);
    body(x + z, function () {
      var c = G.c, p = G.P(x, 0, z), s = G.s * sz * HY;
      c.strokeStyle = NAVY;
      c.lineWidth = G.lw;
      c.beginPath();
      c.ellipse(p[0], p[1] - 0.75 * s, 0.6 * s, 0.75 * s, 0, 0, Math.PI * 2);
      c.stroke();
      c.beginPath();
      c.arc(p[0], p[1] - 1.85 * s, 0.6 * s, 0, Math.PI * 2);
      c.stroke();
      fanAt(c, p[0], p[1] - 0.15 * s, s * 1.15, shirt, i);
    });
  }
  /** Tabela direği üstünde levha (ekrana dönük, hafif eğik). */
  function billboard(x, z, y, w, h, text, bg, fg, o) {
    o = o || {};
    extBox(x, z, w, 0.4, 0, y + h);
    if (o.posts !== false)
      [-w * 0.35, w * 0.35].forEach(function (dx) {
        box(x + dx, z, 0.3, 0.3, 0, y, "#5B6385", { noShadow: true, gloss: false, depth: x + z - 0.01 });
      });
    box(x, z, w, 0.35, y, h, bg, {
      noShadow: true,
      depth: x + z,
      fL: function (c, FW, FH) {
        fsign(c, FW / 2, FH / 2, FW - 0.2, FH - 0.2, text, bg, fg, o.glow);
      },
    });
  }

  /* ═══════════════════════ sprite önbelleği ═══════════════════════ */

  var sprites = {};
  var spriteVer = 0;
  var meta = {};
  var frameNo = 0;
  var BUCKETS = [1, 1.5, 2, 3, 4, 6, 8, 10];
  function bucketFor(px) {
    for (var i = 0; i < BUCKETS.length; i++) if (BUCKETS[i] >= px) return BUCKETS[i];
    return BUCKETS[BUCKETS.length - 1];
  }
  /** Bir yapıyı kaydedip ekran dışı tuvale çizer. build(): kaydedici çağrıları. */
  function makeSprite(key, s, build) {
    spriteVer++;
    var rnd = A.seeded(hashStr(key));
    SP = { u0: 1e9, u1: -1e9, v0: 1e9, v1: -1e9, flats: [], shadows: [], bodies: [], anchors: [], rnd: rnd };
    var rec = SP;
    try {
      build();
    } finally {
      SP = null;
    }
    if (rec.u0 > rec.u1) {
      rec.u0 = rec.v0 = -1;
      rec.u1 = rec.v1 = 1;
    }
    var pad = 3;
    var cw = Math.ceil((rec.u1 - rec.u0) * s + pad * 2), ch = Math.ceil((rec.v1 - rec.v0) * s + pad * 2);
    cw = Math.min(cw, 4096);
    ch = Math.min(ch, 4096);
    var ox = -rec.u0 * s + pad, oy = -rec.v0 * s + pad;
    var cv = document.createElement("canvas");
    cv.width = Math.max(1, cw);
    cv.height = Math.max(1, ch);
    var c = cv.getContext("2d");
    var saved = { c: G.c, P: G.P, s: G.s, lw: G.lw };
    G.c = c;
    G.s = s;
    G.lw = A.clamp(0.3 * s, 0.9, 4.4);
    G.P = function (x, y, z) {
      return [(x - z) * s + ox, ((x + z) * 0.5 - y * HY) * s + oy];
    };
    SP = rec; // kayıtçı yüz çizimlerinde rastgelelik için
    try {
      rec.flats.forEach(function (fn) {
        fn(c);
      });
      drawShadows(c, rec.shadows);
      rec.bodies.sort(function (a, b) {
        return a.d - b.d || a.i - b.i;
      });
      rec.bodies.forEach(function (b) {
        b.fn(c);
      });
    } finally {
      SP = null;
      G.c = saved.c;
      G.P = saved.P;
      G.s = saved.s;
      G.lw = saved.lw;
    }
    return { cv: cv, s: s, ox: ox, oy: oy, w: cw, h: ch, u0: rec.u0, v0: rec.v0, v1: rec.v1, anchors: rec.anchors, used: frameNo };
  }
  function hashStr(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  var buildBudget = 0;
  /**
   * id: yapının kimliği (birim+basamak+...); tema ve forma anahtara eklenir.
   * İstenen çözünürlükte yoksa: hiç yoksa hemen kurulur, varsa (başka kova)
   * kare başına sınırlı sayıda yükseltilir; o arada eldeki ölçeklenip çizilir.
   */
  function getSprite(id, build) {
    var want = bucketFor(cam.zoom * DPR);
    var base = id + "|" + TH.key + "|" + kit.primary + kit.secondary;
    var key = base + "|" + want;
    var sp = sprites[key];
    if (sp) {
      sp.used = frameNo;
      return sp;
    }
    var alt = null;
    for (var i = BUCKETS.length - 1; i >= 0; i--) {
      var k2 = base + "|" + BUCKETS[i];
      if (sprites[k2] && (!alt || Math.abs(BUCKETS[i] - want) < Math.abs(alt.s - want))) alt = sprites[k2];
    }
    if (alt && buildBudget <= 0) {
      alt.used = frameNo;
      return alt;
    }
    buildBudget--;
    sp = makeSprite(base, want, build);
    sprites[key] = sp;
    // aynı yapının başka çözünürlükteki kopyaları bırakılır (bellek)
    for (var b = 0; b < BUCKETS.length; b++) if (BUCKETS[b] !== want) delete sprites[base + "|" + BUCKETS[b]];
    meta[base] = { v0: sp.v0, v1: sp.v1, u0: sp.u0, anchors: sp.anchors };
    return sp;
  }
  function sweepSprites() {
    var n = 0;
    Object.keys(sprites).forEach(function (k) {
      if (frameNo - sprites[k].used > 90) {
        delete sprites[k];
        n++;
      }
    });
    return n;
  }
  /** Sprite'ı dünya noktasına (yerel 0,0,0) çizer; sx/sy esneme, alt kenara çapalı. */
  function blitSprite(c, sp, wx, wz, sx, sy, alpha) {
    var p = W2S(wx, 0, wz);
    var k = cam.zoom / sp.s;
    var w = sp.w * k, h = sp.h * k;
    var dx = p[0] - sp.ox * k, dy = p[1] - sp.oy * k;
    if (dx > W + 4 || dy > H + 4 || dx + w < -4 || dy + h < -4) return;
    if (alpha != null && alpha < 1) c.globalAlpha = Math.max(0, alpha);
    if (sx != null && (sx !== 1 || sy !== 1)) {
      // çapa: yapının ön alt kenarı (sprite'ın en alt noktası)
      var by = dy + h - 3 * k;
      c.save();
      c.translate(p[0], by);
      c.scale(sx, sy);
      c.drawImage(sp.cv, dx - p[0], dy - by, w, h);
      c.restore();
    } else c.drawImage(sp.cv, dx, dy, w, h);
    c.globalAlpha = 1;
  }

  /* ═══════════════════════ sahne parçaları ═══════════════════════ */

  /** x boyunca yatan yarım silindir (tonoz): cam istasyon, salon, konservatuvar. */
  function vaultX(x, z, len, r, y0, col, o) {
    o = o || {};
    extBox(x, z, len, r * 2, y0, r);
    if (!o.noShadow) shadowBox(x, z, len, r * 2, r * 0.8, y0);
    body(o.depth != null ? o.depth : x + z, function () {
      var c = G.c, P = G.P;
      var x0 = x - len / 2, x1 = x + len / 2, N = 14;
      function arc(xx) {
        var pts = [];
        for (var i = 0; i <= N; i++) {
          var a = (i / N) * Math.PI;
          pts.push(P(xx, y0 + Math.sin(a) * r, z + Math.cos(a) * r));
        }
        return pts;
      }
      var a0 = arc(x0), a1 = arc(x1);
      var h = hull(a0.concat(a1));
      polyPath(c, h);
      var g = c.createLinearGradient(0, h.reduce(function (m, p) { return Math.min(m, p[1]); }, 1e9), 0, P(x, y0, z + r)[1]);
      g.addColorStop(0, K(lit(col, 0.45)));
      g.addColorStop(0.5, K(col));
      g.addColorStop(1, K(dk(col, 0.25)));
      c.fillStyle = g;
      if (o.alpha) c.globalAlpha = o.alpha;
      c.fill();
      c.globalAlpha = 1;
      if (o.lit && TH.night > 0.5) {
        c.fillStyle = rgba(o.lit, 0.55);
        c.fill();
      }
      c.save();
      polyPath(c, h);
      c.clip();
      // nervürler
      var step = o.rib || 3;
      c.strokeStyle = o.ribCol ? K(o.ribCol) : rgba("#FFFFFF", 0.75);
      c.lineWidth = G.lw * (o.ribW || 0.8);
      for (var xx = x0 + step / 2; xx < x1; xx += step) {
        var ar = arc(xx);
        c.beginPath();
        c.moveTo(ar[0][0], ar[0][1]);
        for (var k = 1; k < ar.length; k++) c.lineTo(ar[k][0], ar[k][1]);
        c.stroke();
      }
      // boyuna parlama
      c.strokeStyle = "rgba(255,255,255,0.5)";
      c.lineWidth = G.lw * 1.2;
      var q0 = P(x0, y0 + r * 0.92, z + r * 0.38), q1 = P(x1, y0 + r * 0.92, z + r * 0.38);
      c.beginPath();
      c.moveTo(q0[0], q0[1]);
      c.lineTo(q1[0], q1[1]);
      c.stroke();
      c.restore();
      polyPath(c, h);
      outline(c);
      // +x uç kapağı
      polyPath(c, a1);
      c.fillStyle = K(o.cap || dk(col, 0.12));
      c.fill();
      if (o.capFn) {
        c.save();
        c.clip();
        o.capFn(c, a1);
        c.restore();
      }
      polyPath(c, a1);
      outline(c, G.lw * 0.8);
    });
  }
  /** Şemsiye (sap + çizgili kubbe). */
  function umbrella(x, z, h, r, col, col2, y0) {
    y0 = y0 || 0;
    extBox(x, z, r * 2, r * 2, y0, h + r * 0.5);
    if (!y0) shadowEllipse(x, z, r * 0.9, h * 0.4);
    body(x + z + 0.3 + y0, function () {
      var c = G.c, P = G.P;
      var b = P(x, y0, z), t = P(x, y0 + h, z), rx = r * SQ2 * G.s, ry = rx / 2, hh = r * 0.55 * G.s;
      c.strokeStyle = NAVY;
      c.lineWidth = Math.max(G.lw * 1.4, 0.25 * G.s);
      c.beginPath();
      c.moveTo(b[0], b[1]);
      c.lineTo(t[0], t[1]);
      c.stroke();
      c.beginPath();
      c.ellipse(t[0], t[1], rx, ry, 0, 0, Math.PI, false);
      c.quadraticCurveTo(t[0] - rx * 0.2, t[1] - hh * 2.2, t[0] + rx, t[1]);
      c.closePath();
      c.fillStyle = K(col);
      c.fill();
      if (col2) {
        c.save();
        c.clip();
        c.fillStyle = K(col2);
        for (var i = -3; i <= 3; i += 2) {
          c.beginPath();
          c.moveTo(t[0], t[1] - hh * 1.1);
          c.lineTo(t[0] + (i * rx) / 3.5, t[1] + ry);
          c.lineTo(t[0] + ((i + 1) * rx) / 3.5, t[1] + ry);
          c.closePath();
          c.fill();
        }
        c.restore();
      }
      outline(c);
    });
  }
  /** Masa + iki tabure. */
  function table(x, z, col) {
    cyl(x, z, 0.9, 0, 0.9, col || "#FFFFFF", { noShadow: true });
    cyl(x - 1.4, z + 0.6, 0.35, 0, 0.5, "#FF8A3D", { noShadow: true });
    cyl(x + 0.6, z + 1.4, 0.35, 0, 0.5, "#FF8A3D", { noShadow: true });
  }
  function bench(x, z, alongX, len, col) {
    len = len || 3;
    if (alongX) {
      box(x, z, len, 0.6, 0.45, 0.18, col || "#C98A4B", { noShadow: true });
      box(x, z - 0.3, len, 0.15, 0.6, 0.6, col || "#C98A4B", { noShadow: true });
    } else {
      box(x, z, 0.6, len, 0.45, 0.18, col || "#C98A4B", { noShadow: true });
      box(x - 0.3, z, 0.15, len, 0.6, 0.6, col || "#C98A4B", { noShadow: true });
    }
  }
  /** Koni sırası. */
  function cone(x, z, col) {
    pyramid(x, z, 0.6, 0.6, 0, 0.8, col || "#FF7A1A", { noShadow: true, stripe: "#FFFFFF" });
  }
  /** Sabit araba (ax: x boyunca). */
  var CAR_COLS = ["#FF4D5E", "#3B82F6", "#FFD43B", "#F7F5FF", "#22C55E", "#A855F7", "#FF8A3D", "#14B8D6"];
  function carS(x, z, ax, col) {
    var L = 3.8, Wd = 1.9;
    extBox(x, z, ax ? L : Wd, ax ? Wd : L, 0, 2);
    shadowBox(x, z, ax ? L : Wd, ax ? Wd : L, 1.2);
    body(x + z, function () {
      drawCar(x, z, ax, col, 1);
    });
  }
  function drawCar(x, z, ax, col, dirSign) {
    var L = 3.8, Wd = 1.9;
    var w = ax ? L : Wd, d = ax ? Wd : L;
    // tekerlekler
    var c = G.c, s = G.s;
    c.fillStyle = "#1B1648";
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (q) {
      var px = x + (ax ? q[0] * 1.2 : q[1] * 0.95), pz = z + (ax ? q[1] * 0.95 : q[0] * 1.2);
      var p = G.P(px, 0.35, pz);
      c.beginPath();
      c.ellipse(p[0], p[1], 0.42 * s, 0.38 * s, 0, 0, Math.PI * 2);
      c.fill();
    });
    drawBox(x, z, w, d, 0.3, 0.85, col, { gloss: true });
    var cw = ax ? 2 : 1.55, cd = ax ? 1.55 : 2;
    var cx = x + (ax ? -0.25 * dirSign : 0), cz = z + (ax ? 0 : -0.25 * dirSign);
    drawBox(cx, cz, cw, cd, 1.15, 0.72, col, {
      fL: function (cc, FW, FH) {
        cc.fillStyle = TH.night > 0.5 ? "#3B3F86" : K("#9FE0FF");
        cc.fillRect(0.15, 0.1, FW - 0.3, FH - 0.2);
        cc.fillStyle = "rgba(255,255,255,0.5)";
        cc.fillRect(0.3, 0.12, 0.3, FH - 0.3);
      },
      fR: function (cc, FW, FH) {
        cc.fillStyle = TH.night > 0.5 ? "#2E3270" : K("#7FCDF5");
        cc.fillRect(0.15, 0.1, FW - 0.3, FH - 0.2);
      },
    });
  }
  /** Kulüp otobüsü / minibüs (forma rengi, yan yazı). */
  function busS(x, z, ax, mini) {
    var L = mini ? 6 : 10, Wd = 2.5, h = mini ? 2.3 : 3;
    extBox(x, z, ax ? L : Wd, ax ? Wd : L, 0, h + 0.4);
    shadowBox(x, z, ax ? L : Wd, ax ? Wd : L, h);
    body(x + z, function () {
      drawBus(x, z, ax, mini, 1);
    });
  }
  function drawBus(x, z, ax, mini) {
    var L = mini ? 6 : 10, Wd = 2.5, h = mini ? 2.3 : 3;
    var c = G.c, s = G.s;
    c.fillStyle = NAVY;
    [-1, 1].forEach(function (e) {
      [-1, 1].forEach(function (side) {
        var px = x + (ax ? e * (L / 2 - 1.3) : side * 1.1), pz = z + (ax ? side * 1.1 : e * (L / 2 - 1.3));
        var p = G.P(px, 0.45, pz);
        c.beginPath();
        c.ellipse(p[0], p[1], 0.55 * s, 0.5 * s, 0, 0, Math.PI * 2);
        c.fill();
      });
    });
    var side = function (cc, FW, FH) {
      cc.fillStyle = K(kit.secondary);
      cc.fillRect(0, FH * 0.66, FW, FH * 0.1);
      var n = Math.floor((FW - 1) / 1.6);
      for (var i = 0; i < n; i++) win(cc, 0.6 + i * 1.6, 0.35, 1.25, FH * 0.38, i % 3 !== 1, "#9FE0FF");
      if (FW > 6) ftext(cc, "ELİTLİG", FW / 2, FH * 0.86, FH * 0.17, K(kit.secondary), FW * 0.6);
    };
    drawBox(x, z, ax ? L : Wd, ax ? Wd : L, 0.45, h, kit.primary, {
      fL: ax ? side : function (cc, FW, FH) {
        win(cc, 0.2, 0.3, FW - 0.4, FH * 0.4, true, "#9FE0FF");
      },
      fR: ax ? function (cc, FW, FH) {
        win(cc, 0.2, 0.3, FW - 0.4, FH * 0.4, true, "#9FE0FF");
      } : side,
    });
  }
  /** Kale: direkler + ağ. dir=+1: kale -x ucunda (ağzı +x'e bakar). */
  function goalS(x, z, dir, gw, gh, white, net) {
    extBox(x - dir * 0.7, z, 1.6, gw + 0.4, 0, gh + 0.3);
    body(x + z + (dir > 0 ? -0.5 : 0.5), function () {
      drawGoal(x, z, dir, gw, gh, white, net);
    });
  }
  function drawGoal(x, z, dir, gw, gh, white, net) {
    var c = G.c, P = G.P, s = G.s;
    var back = x - dir * 1.3;
    var zl = z - gw / 2, zr = z + gw / 2;
    if (net) {
      c.fillStyle = "rgba(255,255,255,0.28)";
      c.strokeStyle = "rgba(255,255,255,0.75)";
      c.lineWidth = Math.max(0.6, G.lw * 0.35);
      var faces = [
        [P(back, 0, zl), P(back, 0, zr), P(back, gh * 0.75, zr), P(back, gh * 0.75, zl)],
        [P(x, gh, zl), P(x, gh, zr), P(back, gh * 0.75, zr), P(back, gh * 0.75, zl)],
        [P(x, 0, zl), P(back, 0, zl), P(back, gh * 0.75, zl), P(x, gh, zl)],
        [P(x, 0, zr), P(back, 0, zr), P(back, gh * 0.75, zr), P(x, gh, zr)],
      ];
      faces.forEach(function (f) {
        polyPath(c, f);
        c.fill();
      });
      // ağ ızgarası
      c.beginPath();
      for (var t = 0; t <= 1.001; t += 1 / 6) {
        var a1 = P(back, 0, zl + gw * t), a2 = P(back, gh * 0.75, zl + gw * t), a3 = P(x, gh, zl + gw * t);
        c.moveTo(a1[0], a1[1]);
        c.lineTo(a2[0], a2[1]);
        c.lineTo(a3[0], a3[1]);
      }
      for (var u = 0.25; u < 1; u += 0.25) {
        var b1 = P(back, gh * 0.75 * u, zl), b2 = P(back, gh * 0.75 * u, zr);
        c.moveTo(b1[0], b1[1]);
        c.lineTo(b2[0], b2[1]);
      }
      c.stroke();
    }
    var col = white ? "#FFFFFF" : "#B9783E";
    var p1 = P(x, 0, zl), p2 = P(x, gh, zl), p3 = P(x, gh, zr), p4 = P(x, 0, zr);
    c.lineJoin = "round";
    c.lineCap = "round";
    c.strokeStyle = NAVY;
    c.lineWidth = Math.max(G.lw * 2, 0.36 * s);
    c.beginPath();
    c.moveTo(p1[0], p1[1]);
    c.lineTo(p2[0], p2[1]);
    c.lineTo(p3[0], p3[1]);
    c.lineTo(p4[0], p4[1]);
    c.stroke();
    c.strokeStyle = K(col);
    c.lineWidth = Math.max(G.lw * 0.9, 0.18 * s);
    c.stroke();
  }
  /** Projektör direği: başlık paneli; gece ışık (çapa). */
  function floodS(x, z, h, big) {
    var pw = big ? 2.6 : 1.8;
    extBox(x, z, pw, pw, 0, h + 1.6);
    shadowBox(x, z, 0.4, 0.4, h * 0.8);
    body(x + z, function () {
      var c = G.c, P = G.P, s = G.s;
      var b = P(x, 0, z), t = P(x, h, z);
      c.strokeStyle = NAVY;
      c.lineWidth = Math.max(G.lw * 2, (big ? 0.6 : 0.4) * s);
      c.beginPath();
      c.moveTo(b[0], b[1]);
      c.lineTo(t[0], t[1]);
      c.stroke();
      c.strokeStyle = K("#9AA3C7");
      c.lineWidth = Math.max(G.lw * 0.8, (big ? 0.35 : 0.22) * s);
      c.stroke();
      drawBox(x, z, pw, 0.5, h, pw * 0.7, "#3A3F72", {
        gloss: false,
        fL: function (cc, FW, FH) {
          for (var i = 0; i < 3; i++)
            for (var j = 0; j < 2; j++) {
              cc.beginPath();
              cc.arc(0.35 + (i * (FW - 0.7)) / 2, 0.35 + j * (FH - 0.7), Math.min(FW, FH) * 0.17, 0, Math.PI * 2);
              cc.fillStyle = TH.night > 0.3 ? "#FFFBE0" : "#DDE6FF";
              cc.fill();
            }
        },
      });
    });
    anchor({ t: "flood", x: x, y: h + pw * 0.35, z: z + 0.3, big: big });
  }
  /** Sokak lambası (sprite içinde). */
  function lampS(x, z) {
    extBox(x, z, 1, 1, 0, 5.5);
    body(x + z, function () {
      drawLamp(x, z);
    });
    anchor({ t: "lamp", x: x, y: 5, z: z });
  }
  function drawLamp(x, z) {
    var c = G.c, P = G.P, s = G.s;
    var b = P(x, 0, z), t = P(x, 5, z);
    c.strokeStyle = NAVY;
    c.lineWidth = Math.max(G.lw * 1.6, 0.32 * s);
    c.beginPath();
    c.moveTo(b[0], b[1]);
    c.lineTo(t[0], t[1] + 0.3 * s);
    c.stroke();
    c.strokeStyle = K("#59608F");
    c.lineWidth = Math.max(G.lw * 0.6, 0.16 * s);
    c.stroke();
    c.beginPath();
    c.arc(t[0], t[1], 0.45 * s, 0, Math.PI * 2);
    c.fillStyle = TH.night > 0.3 ? "#FFF2B8" : K("#E8EDFF");
    c.fill();
    outline(c, G.lw * 0.7);
  }
  /** Ekrana dönük kalkan arması (kulüp rengi + top). */
  function crestS(x, z, y, r) {
    extBill(x, z, r * 1.2, y + r * 1.3);
    body(x + z + 0.5, function () {
      drawCrest(G.c, G.P(x, y, z), r * G.s);
    });
  }
  function drawCrest(c, p, R) {
    c.save();
    c.translate(p[0], p[1]);
    c.beginPath();
    c.moveTo(-R, -R);
    c.lineTo(R, -R);
    c.lineTo(R, 0);
    c.quadraticCurveTo(R, R * 0.8, 0, R * 1.3);
    c.quadraticCurveTo(-R, R * 0.8, -R, 0);
    c.closePath();
    c.fillStyle = K("#FFD43B");
    c.fill();
    c.lineWidth = Math.max(1, R * 0.12);
    c.strokeStyle = NAVY;
    c.stroke();
    c.beginPath();
    var r2 = R * 0.78;
    c.moveTo(-r2, -r2);
    c.lineTo(r2, -r2);
    c.lineTo(r2, 0);
    c.quadraticCurveTo(r2, r2 * 0.8, 0, r2 * 1.3);
    c.quadraticCurveTo(-r2, r2 * 0.8, -r2, 0);
    c.closePath();
    c.fillStyle = TH.night > 0.5 ? lit(kit.primary, 0.1) : K(kit.primary);
    c.fill();
    c.save();
    c.clip();
    c.fillStyle = K(kit.secondary);
    c.fillRect(-R * 0.15, -R, R * 0.3, R * 2.4);
    c.fillStyle = "rgba(255,255,255,0.25)";
    c.fillRect(-R, -R, R * 0.7, R * 2.4);
    c.restore();
    c.beginPath();
    c.arc(0, R * 0.12, R * 0.38, 0, Math.PI * 2);
    c.fillStyle = "#FFFFFF";
    c.fill();
    c.lineWidth = Math.max(0.8, R * 0.08);
    c.stroke();
    c.fillStyle = NAVY;
    c.beginPath();
    for (var i = 0; i < 5; i++) {
      var a = (i / 5) * Math.PI * 2 - Math.PI / 2;
      c.lineTo(Math.cos(a) * R * 0.15, R * 0.12 + Math.sin(a) * R * 0.15);
    }
    c.closePath();
    c.fill();
    c.restore();
  }
  /** Askıdaki forma (ekrana dönük). */
  function shirtAt(c, px, py, sz, col, col2, num) {
    c.save();
    c.translate(px, py);
    c.scale(sz, sz);
    c.beginPath();
    c.moveTo(-0.35, -0.5);
    c.lineTo(-0.15, -0.55);
    c.quadraticCurveTo(0, -0.42, 0.15, -0.55);
    c.lineTo(0.35, -0.5);
    c.lineTo(0.6, -0.22);
    c.lineTo(0.42, -0.06);
    c.lineTo(0.34, -0.14);
    c.lineTo(0.34, 0.5);
    c.lineTo(-0.34, 0.5);
    c.lineTo(-0.34, -0.14);
    c.lineTo(-0.42, -0.06);
    c.lineTo(-0.6, -0.22);
    c.closePath();
    c.fillStyle = K(col);
    c.fill();
    c.save();
    c.clip();
    c.fillStyle = K(col2);
    c.fillRect(-0.06, -0.6, 0.12, 1.2);
    c.restore();
    c.lineWidth = 0.07;
    c.strokeStyle = NAVY;
    c.stroke();
    if (num) {
      c.fillStyle = K(col2 === col ? "#FFFFFF" : col2);
      c.font = A.font(4, 900);
      c.save();
      c.scale(0.1, 0.1);
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.font = A.font(5, 900);
      c.restore();
    }
    c.restore();
  }
  /** Çanak anten (direk üstünde). */
  function dishS(x, z, y, r, tilt) {
    extBill(x, z, r * 1.6, y + r * 1.4);
    body(x + z + 0.2, function () {
      var c = G.c, P = G.P, s = G.s;
      var b = P(x, 0, z), t = P(x, y, z);
      c.strokeStyle = NAVY;
      c.lineWidth = Math.max(G.lw * 1.4, 0.3 * s);
      c.beginPath();
      c.moveTo(b[0], b[1]);
      c.lineTo(t[0], t[1]);
      c.stroke();
      c.save();
      c.translate(t[0], t[1] - r * 0.4 * s);
      c.rotate(tilt || -0.5);
      c.beginPath();
      c.ellipse(0, 0, r * s, r * 0.45 * s, 0, 0, Math.PI * 2);
      c.fillStyle = K("#F2F4FF");
      c.fill();
      outline(c);
      c.beginPath();
      c.ellipse(0, -r * 0.08 * s, r * 0.7 * s, r * 0.28 * s, 0, 0, Math.PI * 2);
      c.fillStyle = K("#D3D8F0");
      c.fill();
      c.strokeStyle = NAVY;
      c.lineWidth = G.lw * 0.8;
      c.beginPath();
      c.moveTo(0, 0);
      c.lineTo(0, -r * 0.9 * s);
      c.stroke();
      c.beginPath();
      c.arc(0, -r * 0.9 * s, r * 0.12 * s, 0, Math.PI * 2);
      c.fillStyle = K("#FF4D5E");
      c.fill();
      c.restore();
    });
  }
  /** Kırmızı-beyaz kafes yayın kulesi. */
  function latticeS(x, z, h, w) {
    extBill(x, z, w * 1.6, h + 3);
    shadowBox(x, z, w, w, h * 0.7);
    body(x + z, function () {
      var c = G.c, P = G.P, s = G.s;
      var b = P(x, 0, z), t = P(x, h, z);
      var bw = w * SQ2 * s, tw = bw * 0.28;
      var seg = 7, lwT = Math.max(G.lw * 1.2, 0.18 * s);
      for (var i = 0; i < seg; i++) {
        var y0 = b[1] + ((t[1] - b[1]) * i) / seg, y1 = b[1] + ((t[1] - b[1]) * (i + 1)) / seg;
        var w0 = bw + ((tw - bw) * i) / seg, w1 = bw + ((tw - bw) * (i + 1)) / seg;
        var col = K(i % 2 ? "#FFFFFF" : "#FF3B4E");
        c.lineCap = "round";
        c.strokeStyle = NAVY;
        c.lineWidth = lwT * 2.2;
        c.beginPath();
        c.moveTo(b[0] - w0, y0);
        c.lineTo(b[0] - w1, y1);
        c.moveTo(b[0] + w0, y0);
        c.lineTo(b[0] + w1, y1);
        c.moveTo(b[0] - w0, y0);
        c.lineTo(b[0] + w1, y1);
        c.moveTo(b[0] + w0, y0);
        c.lineTo(b[0] - w1, y1);
        c.moveTo(b[0] - w1, y1);
        c.lineTo(b[0] + w1, y1);
        c.stroke();
        c.strokeStyle = col;
        c.lineWidth = lwT;
        c.stroke();
      }
      c.strokeStyle = NAVY;
      c.lineWidth = lwT;
      c.beginPath();
      c.moveTo(t[0], t[1]);
      c.lineTo(t[0], t[1] - 2.5 * s);
      c.stroke();
    });
    anchor({ t: "beacon", x: x, y: h + 2.4, z: z });
  }
  /** Bisiklet (ekrana dönük, x boyunca). */
  function bikeS(x, z, col) {
    extBill(x, z, 1.2, 1.4);
    body(x + z, function () {
      var c = G.c, p = G.P(x, 0, z), s = G.s;
      c.strokeStyle = NAVY;
      c.lineWidth = Math.max(G.lw, 0.16 * s);
      [-0.55, 0.55].forEach(function (dx) {
        c.beginPath();
        c.ellipse(p[0] + dx * s, p[1] - 0.45 * s + dx * 0.3 * s, 0.42 * s, 0.38 * s, 0, 0, Math.PI * 2);
        c.stroke();
      });
      c.strokeStyle = K(col);
      c.lineWidth = Math.max(G.lw * 1.2, 0.2 * s);
      c.beginPath();
      c.moveTo(p[0] - 0.55 * s, p[1] - 0.6 * s);
      c.lineTo(p[0], p[1] - 1.05 * s);
      c.lineTo(p[0] + 0.55 * s, p[1] - 0.3 * s);
      c.moveTo(p[0], p[1] - 1.05 * s);
      c.lineTo(p[0] - 0.1 * s, p[1] - 1.4 * s);
      c.stroke();
    });
  }
  /** Işık zinciri (ampuller sprite'ta; gece parlak). */
  function stringLights(x0, z0, x1, z1, y, n) {
    extBox((x0 + x1) / 2, (z0 + z1) / 2, Math.abs(x1 - x0) + 1, Math.abs(z1 - z0) + 1, 0, y + 0.5);
    body((x0 + x1 + z0 + z1) / 2 + 0.6, function () {
      var c = G.c, P = G.P, s = G.s;
      c.strokeStyle = rgba(NAVY, 0.8);
      c.lineWidth = Math.max(0.6, G.lw * 0.4);
      c.beginPath();
      var pts = [];
      for (var i = 0; i <= n; i++) {
        var t = i / n, sag = Math.sin(t * Math.PI) * 0.7;
        var p = P(x0 + (x1 - x0) * t, y - sag, z0 + (z1 - z0) * t);
        pts.push(p);
        if (i) c.lineTo(p[0], p[1]);
        else c.moveTo(p[0], p[1]);
      }
      c.stroke();
      pts.forEach(function (p, i) {
        c.beginPath();
        c.arc(p[0], p[1] + 0.15 * s, Math.max(0.8, 0.22 * s), 0, Math.PI * 2);
        c.fillStyle = TH.night > 0.3 ? "#FFE9A8" : K(["#FF4D5E", "#FFD43B", "#3B82F6", "#22C55E"][i % 4]);
        c.fill();
      });
    });
    anchor({ t: "bulbs", x0: x0, z0: z0, x1: x1, z1: z1, y: y, n: n });
  }
  /** Okul çantası / taş kale işaretleri. */
  function bagS(x, z, col) {
    box(x, z, 0.8, 0.5, 0, 0.7, col, { noShadow: true });
  }

  /* ─────────────── saha boyutu ─────────────── */

  var PITCH = [
    { w: 16, d: 10, players: 6 },
    { w: 17, d: 11, players: 8 },
    { w: 19, d: 12, players: 10 },
    { w: 19, d: 12, players: 10 },
    { w: 23, d: 14, players: 14 },
    { w: 28, d: 18, players: 22 },
    { w: 28, d: 18, players: 22 },
    { w: 28, d: 18, players: 22 },
  ];
  function pitchSize() {
    return PITCH[lvOf("saha")];
  }

  /** Saha zemini (dünya xz uzayında, topDo içinde). */
  function paintPitch(c, x, z, w, d, style, lv) {
    var x0 = x - w / 2, z0 = z - d / 2;
    var rnd = A.seeded(lv * 31 + 7);
    c.save();
    A.roundRect(c, x0, z0, w, d, style === "concrete" ? 0.4 : 0.2);
    c.clip();
    if (style === "concrete") {
      c.fillStyle = K("#BFC3D2");
      c.fillRect(x0, z0, w, d);
      c.strokeStyle = K("#A3A8BC");
      c.lineWidth = 0.12;
      for (var i = 3; i < w; i += 3) {
        c.beginPath();
        c.moveTo(x0 + i, z0);
        c.lineTo(x0 + i, z0 + d);
        c.stroke();
      }
      for (var j = 3; j < d; j += 3) {
        c.beginPath();
        c.moveTo(x0, z0 + j);
        c.lineTo(x0 + w, z0 + j);
        c.stroke();
      }
      for (var k = 0; k < 40; k++) {
        c.fillStyle = rnd() < 0.5 ? "rgba(255,255,255,0.18)" : "rgba(27,22,72,0.08)";
        c.beginPath();
        c.arc(x0 + rnd() * w, z0 + rnd() * d, 0.15 + rnd() * 0.3, 0, Math.PI * 2);
        c.fill();
      }
    } else if (style === "dirt") {
      var g = c.createRadialGradient(x, z, 1, x, z, w * 0.7);
      g.addColorStop(0, K("#D9A065"));
      g.addColorStop(1, K("#B97E48"));
      c.fillStyle = g;
      c.fillRect(x0, z0, w, d);
      for (var m = 0; m < 70; m++) {
        c.fillStyle = rnd() < 0.5 ? "rgba(255,235,200,0.28)" : "rgba(110,60,30,0.2)";
        c.beginPath();
        c.ellipse(x0 + rnd() * w, z0 + rnd() * d, 0.3 + rnd() * 0.6, 0.2 + rnd() * 0.3, rnd() * 3, 0, Math.PI * 2);
        c.fill();
      }
      c.fillStyle = K("#7FB24A");
      for (var t2 = 0; t2 < 26; t2++) {
        var ex = rnd() < 0.5 ? x0 + rnd() * 1.4 : x0 + w - rnd() * 1.4;
        c.beginPath();
        c.ellipse(ex, z0 + rnd() * d, 0.5, 0.3, 0, 0, Math.PI * 2);
        c.fill();
      }
    } else {
      var A1 = { turf: ["#4CC85A", "#43BC52"], turf2: ["#52CF5E", "#45C054"], pro: ["#4ED163", "#3FC055"], checker: ["#55D866", "#41C257"], hybrid: ["#5ADF6C", "#3EC457"], mini: ["#55CC5E", "#47BE53"] }[style] || ["#4CC85A", "#43BC52"];
      c.fillStyle = K(A1[1]);
      c.fillRect(x0, z0, w, d);
      var bands = style === "pro" || style === "checker" || style === "hybrid" ? 14 : 10;
      c.fillStyle = K(A1[0]);
      for (var b = 0; b < bands; b += 2) c.fillRect(x0 + (b * w) / bands, z0, w / bands, d);
      if (style === "checker") {
        c.fillStyle = "rgba(255,255,255,0.07)";
        for (var q = 0; q < 8; q += 2) c.fillRect(x0, z0 + (q * d) / 8, w, d / 8);
        c.fillStyle = "rgba(20,60,30,0.07)";
        for (var q2 = 1; q2 < 8; q2 += 2) c.fillRect(x0, z0 + (q2 * d) / 8, w, d / 8);
      }
      if (style === "hybrid") {
        // çapraz biçme + alttan ısıtma ağı
        c.fillStyle = "rgba(255,255,255,0.08)";
        for (var dd = -d; dd < w; dd += 2.4) {
          c.beginPath();
          c.moveTo(x0 + dd, z0);
          c.lineTo(x0 + dd + 1.2, z0);
          c.lineTo(x0 + dd + 1.2 + d, z0 + d);
          c.lineTo(x0 + dd + d, z0 + d);
          c.closePath();
          c.fill();
        }
        if (TH.night > 0.3) {
          c.strokeStyle = "rgba(160,255,190,0.22)";
          c.lineWidth = 0.08;
          for (var hx = x0 + 1; hx < x0 + w; hx += 1.5) {
            c.beginPath();
            c.moveTo(hx, z0);
            c.lineTo(hx, z0 + d);
            c.stroke();
          }
        }
      }
      for (var n = 0; n < 50; n++) {
        c.fillStyle = rnd() < 0.5 ? "rgba(255,255,255,0.1)" : "rgba(20,70,30,0.1)";
        c.fillRect(x0 + rnd() * w, z0 + rnd() * d, 0.12, 0.35);
      }
    }
    c.restore();
    // çizgiler
    var line = style === "concrete" ? "rgba(255,250,235,0.92)" : style === "dirt" ? "rgba(255,250,235,0.75)" : "#FFFFFF";
    c.strokeStyle = TH.night > 0.5 ? mixc("#FFFFFF", "#9AA6E6", 0.25) : line;
    c.lineWidth = w > 25 ? 0.22 : 0.18;
    var m0 = 0.7;
    if (style === "concrete") c.setLineDash([0.8, 0.4]);
    c.strokeRect(x0 + m0, z0 + m0, w - m0 * 2, d - m0 * 2);
    c.beginPath();
    c.moveTo(x, z0 + m0);
    c.lineTo(x, z0 + d - m0);
    c.stroke();
    c.beginPath();
    c.arc(x, z, Math.min(d * 0.16, 3), 0, Math.PI * 2);
    c.stroke();
    c.setLineDash([]);
    if (style !== "concrete") {
      var bd = d * 0.5, bw = w * (w > 25 ? 0.15 : 0.12);
      c.strokeRect(x0 + m0, z - bd / 2, bw, bd);
      c.strokeRect(x0 + w - m0 - bw, z - bd / 2, bw, bd);
      if (w > 22) {
        var sb = d * 0.24, sw = w * 0.055;
        c.strokeRect(x0 + m0, z - sb / 2, sw, sb);
        c.strokeRect(x0 + w - m0 - sw, z - sb / 2, sw, sb);
        c.fillStyle = c.strokeStyle;
        c.beginPath();
        c.arc(x, z, 0.25, 0, Math.PI * 2);
        c.fill();
      }
    }
  }
  function pitchFlat(x, z, w, d, style, lv, y) {
    extBox(x, z, w, d, 0, 0.5);
    flat(function () {
      topDo(y == null ? 0.4 : y, function (c) {
        paintPitch(c, x, z, w, d, style, lv);
      });
    });
  }
  /** Koşu pisti halkası (sahanın çevresi). */
  function trackFlat(x, z, w, d, y) {
    flat(function () {
      topDo(y || 0.38, function (c) {
        A.roundRect(c, x - w / 2 - 2.6, z - d / 2 - 2.6, w + 5.2, d + 5.2, 5);
        c.fillStyle = K("#E2573E");
        c.fill();
        c.strokeStyle = "rgba(255,255,255,0.6)";
        c.lineWidth = 0.08;
        for (var i = 1; i <= 3; i++) {
          A.roundRect(c, x - w / 2 - 2.6 + i * 0.6, z - d / 2 - 2.6 + i * 0.6, w + 5.2 - i * 1.2, d + 5.2 - i * 1.2, 5 - i * 0.6);
          c.stroke();
        }
        A.roundRect(c, x - w / 2 - 0.4, z - d / 2 - 0.4, w + 0.8, d + 0.8, 1);
        c.fillStyle = K("#3FB650");
        c.fill();
      });
    });
  }
  /** Tel örgü çit (çizgi). */
  function fenceS(x, z, w, d, h, col, sides) {
    sides = sides || "NSWE";
    extBox(x, z, w, d, 0, h);
    var segs = [];
    if (sides.indexOf("N") >= 0) segs.push([x - w / 2, z - d / 2, x + w / 2, z - d / 2, -1]);
    if (sides.indexOf("W") >= 0) segs.push([x - w / 2, z - d / 2, x - w / 2, z + d / 2, -1]);
    if (sides.indexOf("S") >= 0) segs.push([x - w / 2, z + d / 2, x + w / 2, z + d / 2, 1]);
    if (sides.indexOf("E") >= 0) segs.push([x + w / 2, z - d / 2, x + w / 2, z + d / 2, 1]);
    segs.forEach(function (sg) {
      body((sg[0] + sg[1] + sg[2] + sg[3]) / 2 + sg[4] * 0.5, function () {
        var c = G.c, P = G.P;
        var a = P(sg[0], 0, sg[1]), b = P(sg[2], 0, sg[3]), b1 = P(sg[2], h, sg[3]), a1 = P(sg[0], h, sg[1]);
        quad(c, a, b, b1, a1);
        c.fillStyle = rgba(K(col), 0.18);
        c.fill();
        c.save();
        c.clip();
        c.strokeStyle = rgba(TH.night > 0.5 ? "#9AA6E6" : "#FFFFFF", 0.55);
        c.lineWidth = Math.max(0.5, G.lw * 0.3);
        var L = Math.hypot(sg[2] - sg[0], sg[3] - sg[1]);
        for (var t = -h; t < L + h; t += 0.9) {
          var u0 = t / L, u1 = (t + h) / L;
          var p0 = P(sg[0] + (sg[2] - sg[0]) * u0, 0, sg[1] + (sg[3] - sg[1]) * u0), p1 = P(sg[0] + (sg[2] - sg[0]) * u1, h, sg[1] + (sg[3] - sg[1]) * u1);
          var p2 = P(sg[0] + (sg[2] - sg[0]) * u1, 0, sg[1] + (sg[3] - sg[1]) * u1), p3 = P(sg[0] + (sg[2] - sg[0]) * u0, h, sg[1] + (sg[3] - sg[1]) * u0);
          c.beginPath();
          c.moveTo(p0[0], p0[1]);
          c.lineTo(p1[0], p1[1]);
          c.moveTo(p2[0], p2[1]);
          c.lineTo(p3[0], p3[1]);
          c.stroke();
        }
        c.restore();
        c.strokeStyle = NAVY;
        c.lineWidth = G.lw * 0.9;
        c.beginPath();
        c.moveTo(a1[0], a1[1]);
        c.lineTo(b1[0], b1[1]);
        c.stroke();
        var n = Math.max(1, Math.round(Math.hypot(sg[2] - sg[0], sg[3] - sg[1]) / 4));
        for (var i = 0; i <= n; i++) {
          var q0 = P(sg[0] + ((sg[2] - sg[0]) * i) / n, 0, sg[1] + ((sg[3] - sg[1]) * i) / n), q1 = P(sg[0] + ((sg[2] - sg[0]) * i) / n, h, sg[1] + ((sg[3] - sg[1]) * i) / n);
          c.strokeStyle = NAVY;
          c.lineWidth = G.lw * 1.5;
          c.beginPath();
          c.moveTo(q0[0], q0[1]);
          c.lineTo(q1[0], q1[1]);
          c.stroke();
          c.strokeStyle = K(col);
          c.lineWidth = G.lw * 0.6;
          c.stroke();
        }
      });
    });
  }
  /** Ahşap çit (boş arsa). */
  function woodFence(x, z, w, d) {
    var posts = function (x0, z0, x1, z1) {
      var L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(L / 3.5));
      for (var i = 0; i <= n; i++) {
        var px = x0 + ((x1 - x0) * i) / n, pz = z0 + ((z1 - z0) * i) / n;
        box(px, pz, 0.35, 0.35, 0, 1.3, "#C98A4B", { noShadow: true, gloss: false });
      }
      var ax = Math.abs(x1 - x0) > 0.1;
      box((x0 + x1) / 2, (z0 + z1) / 2, ax ? L : 0.18, ax ? 0.18 : L, 0.75, 0.25, "#E0A562", { noShadow: true, gloss: false, depth: (x0 + x1 + z0 + z1) / 2 + 0.1 });
    };
    posts(x - w / 2, z - d / 2, x + w / 2, z - d / 2);
    posts(x - w / 2, z - d / 2, x - w / 2, z + d / 2);
    posts(x - w / 2, z + d / 2, x + w / 2 - 6, z + d / 2);
    posts(x + w / 2, z - d / 2, x + w / 2, z + d / 2);
  }

  /* ═══════════════════════ birim kurucuları ═══════════════════════
   * Her basamak ayrı bir görünüm: amatörden profesyonele. Koordinatlar arsa
   * merkezine göre (±21 m). Gövdeler derinliğe (x+z) göre sıralanır. */

  var PAVE = "#E7E2F3", GRASSP = "#74D46A";
  function tiles(step, col) {
    return function (c) {
      c.strokeStyle = col || "rgba(27,22,72,0.12)";
      c.lineWidth = 0.08;
      for (var i = -30; i <= 30; i += step) {
        c.beginPath();
        c.moveTo(i, -30);
        c.lineTo(i, 30);
        c.moveTo(-30, i);
        c.lineTo(30, i);
        c.stroke();
      }
    };
  }
  function grassDots(c) {
    var r = A.seeded(9);
    for (var i = 0; i < 60; i++) {
      c.fillStyle = r() < 0.5 ? "rgba(255,255,255,0.13)" : "rgba(30,110,50,0.12)";
      c.beginPath();
      c.ellipse(-21 + r() * 42, -21 + r() * 42, 0.5 + r() * 0.8, 0.3 + r() * 0.4, 0, 0, Math.PI * 2);
      c.fill();
    }
  }
  function lawn(o) {
    pad(0, 0, 42, 42, GRASSP, { fn: grassDots, th: 0.25, side: "#3E9E48", r: 3, line: 0.5 });
  }
  function paved(col) {
    pad(0, 0, 42, 42, col || PAVE, { fn: tiles(2), th: 0.3, side: "#B4ACD2", r: 3 });
  }
  /** Ön kenara yol: arsa içinde giriş yolu (kaldırımdan binaya). */
  function path(x0, z0, x1, z1, wd, col) {
    flat(function () {
      topDo(0.3, function (c) {
        c.strokeStyle = K(col || PAVE);
        c.lineWidth = wd || 3;
        c.lineCap = "round";
        c.beginPath();
        c.moveTo(x0, z0);
        c.lineTo(x1, z1);
        c.stroke();
      });
    });
  }

  function emptyPlot(S) {
    S = S || 40;
    var q = S / 40;
    pad(0, 0, S, S, "#D8A56C", {
      th: 0.3,
      side: "#9C6B3E",
      r: 2.5,
      fn: function (c) {
        var r = A.seeded(5);
        for (var i = 0; i < 40 * q * q; i++) {
          c.fillStyle = r() < 0.5 ? "rgba(255,230,190,0.35)" : "rgba(110,60,30,0.18)";
          c.beginPath();
          c.ellipse((-20 + r() * 40) * q, (-20 + r() * 40) * q, 0.5 + r() * 1.4, 0.3 + r() * 0.7, r() * 3, 0, Math.PI * 2);
          c.fill();
        }
        c.strokeStyle = "rgba(110,60,30,0.3)";
        c.lineWidth = 0.25;
        c.setLineDash([1, 0.8]);
        c.strokeRect(-12 * q, -12 * q, 24 * q, 24 * q);
        c.setLineDash([]);
      },
    });
    woodFence(0, 0, S - 2, S - 2);
    // taşlar, tuğla yığını, koniler, el arabası
    [[-9, -7, 1.2], [6, -10, 0.9], [-12, 8, 1], [11, 4, 0.8]].forEach(function (r) {
      box(r[0] * q, r[1] * q, r[2] * 1.6, r[2] * 1.3, 0, r[2], "#A9AEC6");
    });
    for (var i = 0; i < 3; i++) for (var j = 0; j < 2 - (i > 1 ? 1 : 0); j++) box(4 * q + j * 1.3, 6 * q + i * 0.01, 1.2, 2.4, i * 0.6, 0.6, "#E2704F", { depth: 10 * q + i * 0.01 });
    box(-3 * q, -2 * q, 5, 3, 0, 0.9, "#E9C28A", { top: "#F2D6A8" }); // kum yığını yerine tahta palet
    cone(9 * q, 15 * q);
    cone(13 * q, 15 * q);
    cone(17 * q, 15 * q);
    billboard(-8 * q, 17 * q, 1.5, 7, 2.2, "İNŞAAT ALANI", "#FFD43B", NAVY);
  }

  /* ─────────────── ANA SAHA ─────────────── */

  /** Zemin katmanı: arsa pedi, saha, pist. (Tribün basamağı ped ve kenarı değiştirir.) */
  function buildSahaG(lvS, lvT) {
    var P = PITCH[lvS];
    var base = lvT >= 7 ? "#DDD6EE" : lvT >= 5 ? "#CFCAE2" : lvS === 0 ? "#AEB2C6" : lvS === 1 ? "#C79A66" : GRASSP;
    pad(0, 0, 50, 50, base, {
      th: 0.35,
      side: lvS === 1 && lvT < 5 ? "#8E6337" : lvS >= 2 && lvT < 5 ? "#3E9E48" : "#8F88B5",
      r: 3.5,
      fn: lvT >= 5 ? tiles(lvT >= 7 ? 1.6 : 2.5) : lvS >= 2 ? grassDots : null,
    });
    if (lvS >= 5) trackFlat(0, 0, P.w, P.d, 0.4);
    var style = ["concrete", "dirt", "turf", "turf2", "turf2", "pro", "checker", "hybrid"][lvS];
    pitchFlat(0, 0, P.w, P.d, style, lvS, lvS >= 5 ? 0.42 : 0.4);
    if (lvS === 0) {
      // seksek ve basket sahası çizgileri
      flat(function () {
        topDo(0.42, function (c) {
          c.strokeStyle = TH.night > 0.5 ? "#C9CFF0" : "#FFFFFF";
          c.lineWidth = 0.14;
          [[0, 0], [1, 0], [2, -0.5], [2, 0.5], [3, 0], [4, -0.5], [4, 0.5]].forEach(function (q) {
            c.strokeRect(10 + q[0] * 1.2, 7 + q[1] * 1.2, 1.2, 1.2);
          });
          c.strokeStyle = K("#FF8A3D");
          c.beginPath();
          c.arc(-14, 12, 2.4, -Math.PI / 2, Math.PI / 2);
          c.stroke();
        });
      });
    }
    if (lvS === 7) {
      anchor({ t: "heat", w: P.w, d: P.d });
      // orta yuvarlakta boyalı kulüp arması
      flat(function () {
        topDo(0.44, function (c) {
          c.save();
          c.scale(1, 1);
          c.beginPath();
          c.moveTo(-1.6, -1.8);
          c.lineTo(1.6, -1.8);
          c.lineTo(1.6, 0);
          c.quadraticCurveTo(1.6, 1.4, 0, 2.2);
          c.quadraticCurveTo(-1.6, 1.4, -1.6, 0);
          c.closePath();
          c.fillStyle = K(kit.primary);
          c.globalAlpha = 0.85;
          c.fill();
          c.globalAlpha = 1;
          c.lineWidth = 0.22;
          c.strokeStyle = "#FFFFFF";
          c.stroke();
          c.restore();
        });
      });
    }
  }
  /** Sahanın dikey öğeleri: kaleler, çit, projektörler, kulübeler, okul. */
  function buildSahaI(lvS, lvT) {
    var P = PITCH[lvS];
    var hw = P.w / 2, hd = P.d / 2;
    if (lvS === 0) {
      // taş kaleler + okul çantaları, basket potası, okul binası
      [-1, 1].forEach(function (s) {
        [-1.4, 1.4].forEach(function (q) {
          box(s * (hw - 1), q, 0.7, 0.7, 0, 0.6, "#9EA3BE");
        });
        bagS(s * (hw + 1.3), 3, s > 0 ? "#3B82F6" : "#FF4D5E");
        bagS(s * (hw + 1.3), 4.3, "#FFD43B");
      });
      cyl(-16, 12.6, 0.18, 0, 3.2, "#3A3F72", { noShadow: true });
      box(-16, 12.3, 0.2, 1.8, 2.6, 1.2, "#FFFFFF", { noShadow: true });
    } else {
      var gw = lvS >= 5 ? 6 : lvS >= 4 ? 4.5 : 3.2, gh = lvS >= 5 ? 2.3 : lvS >= 2 ? 1.9 : 1.6;
      goalS(-hw + 0.6, 0, 1, gw, gh, lvS >= 2, lvS >= 2);
      goalS(hw - 0.6, 0, -1, gw, gh, lvS >= 2, lvS >= 2);
    }
    if (lvS >= 2 && lvS <= 4 && lvT < 5) fenceS(0, 0, P.w + 3, P.d + 3, lvS >= 3 ? 3.2 : 2.2, "#22C55E", lvT >= 1 ? "WSE" : "NWSE");
    if (lvS >= 3 && lvS <= 4 && lvT < 5 && !SVF)
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (q) {
        floodS(q[0] * (hw + 2.6), q[1] * (hd + 2.6), 10, false);
      });
    if (lvS >= 4 && lvT < 5)
      [-1, 1].forEach(function (s) {
        // yedek kulübeleri (şeffaf tavan)
        box(s * 5, hd + 2.6, 4.4, 1.4, 0, 0.5, "#4A4F86", { noShadow: true });
        box(s * 5, hd + 3.2, 4.6, 0.25, 0, 2, "#BFE6FF", { alpha: 0.8 });
        box(s * 5, hd + 2.6, 4.8, 1.8, 2, 0.2, "#F2F4FF");
      });
    if (lvS >= 5)
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (q) {
        flagpole(q[0] * (hw - 0.8), q[1] * (hd - 0.8), 1.4, kit.primary);
      });
    if (lvS >= 6) {
      // saha kenarı LED panolar (kulüp rengi)
      var led = function (cc, FW, FH) {
        var g = cc.createLinearGradient(0, 0, FW, 0);
        g.addColorStop(0, TH.night > 0.5 ? lit(kit.primary, 0.15) : K(kit.primary));
        g.addColorStop(1, TH.night > 0.5 ? "#8B5CF6" : K("#8B5CF6"));
        cc.fillStyle = g;
        cc.fillRect(0, 0, FW, FH);
        for (var i = 0; i < FW / 9; i++) ftext(cc, i % 2 ? "KULÜP ŞEHRİ" : "ELİTLİG", 4.5 + i * 9, FH * 0.55, FH * 0.6, "#FFFFFF");
      };
      box(0, -hd - 1.6, P.w - 4, 0.25, 0, 0.9, "#3A3F72", { fL: led, noShadow: true });
      box(-hw - 1.6, 0, 0.25, P.d - 4, 0, 0.9, "#3A3F72", { fR: led, noShadow: true });
    }
    if (lvS >= 7) {
      // ısıtma kontrol kulübeleri
      box(hw + 3.2, -hd - 1, 1.6, 1.6, 0, 1.4, "#E9ECF8", { fL: function (cc, FW, FH) { cc.fillStyle = TH.night > 0.3 ? "#7CFF9B" : K("#22C55E"); cc.fillRect(0.3, 0.3, FW - 0.6, 0.3); } });
    }
    if (lvS < 5 && lvT < 4 && !SVF) {
      // OKUL: sahanın -x tarafında
      var sx = -hw - 6.5;
      gable(sx, 0, 6, 22, 0, 6, 2.6, "#FFD9A8", "#E2574C", {
        ridgeZ: true,
        fR: function (cc, FW, FH) {
          windowsGrid(cc, FW, FH, { ww: 1.6, wh: 1.4, gx: 1.2, gy: 1.1, top: 0.8, bot: 0.6, skip: function (r, k, R, Cn) { return r === R - 1 && k === Math.floor(Cn / 2); } });
          A.roundRect(cc, FW / 2 - 0.8, FH - 2.4, 1.6, 2.4, 0.3);
          cc.fillStyle = K("#8A4B2A");
          cc.fill();
          cc.lineWidth = 0.12;
          cc.strokeStyle = NAVY;
          cc.stroke();
          fsign(cc, FW / 2, 0.45, 11, 0.9, "ATATÜRK İLKOKULU", "#1E3A8A", "#FFFFFF", true);
        },
      });
      turfFlagS(sx + 4, -12.5);
      tree(sx - 1, 14, 1.1);
      tree(sx + 1, -15, 0.9);
    }
  }
  function turfFlagS(x, z) {
    turkFlag(x, z, 8);
  }

  /* ─────────────── TRİBÜN ─────────────── */

  var CROWD_SKIN = SKINS;
  /** Bir sıra seyirci (basamağın üstünde, ekrana dönük). */
  function crowdRow(c, ax, x0, x1, zz, y, seed, dens) {
    var r = A.seeded(seed);
    var cols = [kit.primary, kit.primary, kit.secondary, kit.primary, "#FFFFFF", "#FFD43B", kit.primary];
    var s = G.s;
    var step = 0.85;
    for (var t = x0 + step / 2; t < x1; t += step) {
      if (r() > (dens || 0.9)) continue;
      var p = ax ? G.P(t, y, zz) : G.P(zz, y, t);
      fanAt(c, p[0] + (r() - 0.5) * 0.2 * s, p[1], s * 0.62, cols[(r() * cols.length) | 0], (r() * 9) | 0, r() < 0.12);
    }
  }
  /**
   * Tribün kenarı: rows sıra. side N(-z) / W(-x) arkada (seyirci görünür),
   * S(+z) / E(+x) önde (dış cephe görünür). inner: sahadan iç kenar mesafesi.
   */
  function standSide(side, L, rows, inner, o) {
    o = o || {};
    var step = o.step || 0.9, rise = o.rise || 0.55, y0 = o.y0 || 0;
    var seat = o.seat || dk(kit.primary, 0.35), riser = o.riser || "#D5D8EA";
    var base = o.depthBase || 0;
    for (var i = 0; i < rows; i++) {
      var off = inner + (o.off0 || 0) + (i + 0.5) * step, h = y0 + (i + 1) * rise;
      var back = side === "N" || side === "W";
      // arka kenarlarda dış sıra önce; ön kenarlarda iç sıra önce
      var ord = base + (back ? rows - i : i) * 0.01;
      (function (off, h, i) {
        var bx, bz, bw, bd;
        if (side === "N") (bx = 0), (bz = -off), (bw = L), (bd = step);
        else if (side === "S") (bx = 0), (bz = off), (bw = L), (bd = step);
        else if (side === "W") (bx = -off), (bz = 0), (bw = step), (bd = L);
        else (bx = off), (bz = 0), (bw = step), (bd = L);
        box(bx, bz, bw, bd, 0, h, riser, { top: seat, noShadow: true, gloss: false, depth: ord, noLine: false });
        if (back && o.fans !== false)
          body(ord + 0.001, function (c) {
            if (side === "N") crowdRow(G.c, true, -L / 2, L / 2, -off + step * 0.1, h, 11 + i * 7 + (o.seed || 0), o.dens);
            else crowdRow(G.c, false, -L / 2, L / 2, -off + step * 0.1, h, 23 + i * 5 + (o.seed || 0), o.dens);
          });
      })(off, h, i);
    }
  }
  /** Tribün katmanları: "B" arka (saha arkası), "F" ön. */
  function buildTribun(lvT, lvS, layer) {
    var P = PITCH[lvS];
    var hw = P.w / 2, hd = P.d / 2;
    var B = layer === "B";
    if (lvT === 1 && B) {
      // alçak tuğla duvar, ayakta taraftar
      box(0, -hd - 2.2, P.w * 0.7, 0.5, 0, 1, "#E2704F", { fL: function (cc, FW, FH) { cc.strokeStyle = rgba(NAVY, 0.25); cc.lineWidth = 0.06; for (var y = 0.33; y < FH; y += 0.33) { cc.beginPath(); cc.moveTo(0, y); cc.lineTo(FW, y); cc.stroke(); } } });
      for (var i = 0; i < 9; i++) standee(-P.w * 0.3 + (i * P.w * 0.6) / 8, -hd - 3, i % 3 ? kit.primary : kit.secondary, i);
      return;
    }
    if (lvT === 2 && B) {
      for (var b = -1; b <= 1; b++) {
        bench(b * 6, -hd - 2.4, true, 5, "#C98A4B");
        for (var j = 0; j < 4; j++) standee(b * 6 - 1.8 + j * 1.2, -hd - 2.5, j % 2 ? kit.primary : kit.secondary, j + b * 5 + 5, 0.82);
      }
      return;
    }
    if (lvT === 3 && B) {
      standSide("N", P.w * 0.85, 3, hd + 1.8, { step: 1.1, rise: 0.6, riser: "#D5D8EA", seat: "#B9BED6", seed: 3 });
      return;
    }
    if (lvT === 4) {
      if (B) {
        standSide("N", P.w + 2, 6, hd + 1.6, { step: 1, rise: 0.6, seed: 5 });
        var dz = -(hd + 1.6 + 6 + 0.3);
        box(0, dz, P.w + 2.6, 0.6, 0, 6 * 0.6 + 4.2, "#4A4F86", { depth: -100, noShadow: true });
        // kulüp renginde konsol çatı + direkler
        box(0, -(hd + 1.6 + 3.6), P.w + 3, 4.6, 6 * 0.6 + 3.6, 0.45, kit.primary, { depth: 50, noShadow: true, fL: function (cc, FW, FH) { cc.fillStyle = K(kit.secondary); cc.fillRect(0, FH * 0.5, FW, FH * 0.3); } });
        for (var k = -1; k <= 1; k++) box(k * (P.w / 2.4), dz + 0.6, 0.35, 0.35, 0, 6 * 0.6 + 3.6, "#9AA3C7", { depth: 49, noShadow: true });
      } else {
        standSide("S", P.w * 0.7, 3, hd + 1.6, { step: 1, rise: 0.5, riser: "#D5D8EA", seat: "#B9BED6", depthBase: 0 });
        box(0, hd + 1.6 + 3.25, P.w * 0.7, 0.5, 0, 1.9, "#C6CAE0", { depth: 1, noShadow: true, fL: function (cc, FW, FH) { fsign(cc, FW / 2, FH / 2, Math.min(FW - 1, 9), FH * 0.62, "ELİTLİG", kit.primary, kit.secondary, true); } });
      }
      return;
    }
    if (lvT >= 5) bowl(lvT, P, B);
  }

  /** Stadyum kasesi (5: açık, 6: çatılı, 7: çift katlı Elit Arena). */
  function bowl(lv, P, B) {
    var pro = P.w >= 28, hw = P.w / 2 + (pro ? 3 : 1.8), hd = P.d / 2 + (pro ? 3 : 1.8);
    var natS = !!(SVF && SVF.nat); // yüzler sonradan çizilir: bayrağı şimdi yakala
    var lower = lv >= 7 ? 4 : lv >= 6 ? 7 : 6;
    var step = 0.9, rise = 0.55;
    var D1 = lower * step, top1 = lower * rise;
    var vipD = lv >= 7 && !(SVF && SVF.noVip) ? 1 : 0, upR = lv >= 7 ? 5 : 0, upStep = 0.85, upRise = 0.75;
    var Dt = D1 + vipD + upR * upStep, topT = top1 + (lv >= 7 ? 2.2 + upR * upRise : 0);
    var facadeH = topT + (lv >= 6 ? 3.4 : 1.2);
    var concrete = "#D9DCEE", facade = lv >= 7 ? "#E9EDF8" : lv >= 6 ? "#E3E6F4" : "#C9CDE2";
    var louver = function (cc, FW, FH) {
      // Bernabéu tarzı yatay çelik şeritler; gece aralarında kulüp rengi LED
      var night = TH.night > 0.5;
      for (var y = 0.3; y < FH - 0.4; y += 0.9) {
        var g = cc.createLinearGradient(0, y, 0, y + 0.6);
        g.addColorStop(0, K("#FFFFFF"));
        g.addColorStop(1, K("#A8B1CF"));
        cc.fillStyle = g;
        cc.fillRect(0, y, FW, 0.6);
        cc.fillStyle = natS ? (night ? "#FF4D5E" : K("#E30A17")) : night ? lit(kit.primary, 0.25) : K(dk("#8A93B8", 0.2));
        cc.fillRect(0, y + 0.6, FW, 0.3);
      }
    };
    var plain = function (cc, FW, FH) {
      cc.fillStyle = K(kit.primary);
      cc.fillRect(0, FH * 0.12, FW, FH * 0.12);
      for (var x = 2.5; x < FW - 1.5; x += 5) {
        A.roundRect(cc, x, FH * 0.55, 1.8, FH * 0.45, 0.5);
        cc.fillStyle = TH.night > 0.5 ? "#FFD98A" : K("#4A4F86");
        cc.fill();
      }
      if (lv >= 6)
        for (var x2 = 1; x2 < FW - 1; x2 += 2.2) {
          cc.fillStyle = TH.night > 0.5 ? "rgba(255,217,138,0.85)" : K("#9FD8FF");
          cc.fillRect(x2, FH * 0.3, 1.4, FH * 0.15);
        }
    };
    var outerFace = lv >= 7 ? louver : plain;
    var corners = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
    function corner(q, d) {
      var cx = q[0] * (hw + Dt / 2 + 0.3), cz = q[1] * (hd + Dt / 2 + 0.3);
      var front = q[0] > 0 || q[1] > 0;
      var backC = q[0] < 0 && q[1] < 0;
      box(cx, cz, Dt + 0.6, Dt + 0.6, 0, backC ? topT + 0.2 : facadeH, backC ? "#D5D8EA" : facade, {
        top: backC ? dk(kit.primary, 0.35) : null,
        depth: d,
        noShadow: !front,
        fL: q[1] > 0 ? outerFace : null,
        fR: q[0] > 0 ? outerFace : null,
      });
    }
    function tiers(side, L, base) {
      standSide(side, L, lower, side === "N" || side === "S" ? hd : hw, { step: step, rise: rise, depthBase: base, seed: side.charCodeAt(0) });
      if (lv >= 7) {
        // VIP locaları: ışıklı cam kuşak
        var vo = (side === "N" || side === "S" ? hd : hw) + D1 + vipD / 2;
        var vb = { N: [0, -vo, L, vipD], S: [0, vo, L, vipD], W: [-vo, 0, vipD, L], E: [vo, 0, vipD, L] }[side];
        var back = side === "N" || side === "W";
        if (vipD) box(vb[0], vb[1], vb[2], vb[3], 0, top1 + 2.2, "#2B2F6E", {
          depth: base + (back ? 0.005 : 0.15),
          noShadow: true,
          top: "#D9DCEE",
          fL: side === "N" ? function (cc, FW, FH) { cc.fillStyle = TH.night > 0.3 ? "rgba(255,217,138,0.9)" : K("#8FD3FF"); cc.fillRect(0, 0.25, FW, 1.5); } : null,
          fR: side === "W" ? function (cc, FW, FH) { cc.fillStyle = TH.night > 0.3 ? "rgba(255,217,138,0.9)" : K("#8FD3FF"); cc.fillRect(0, 0.25, FW, 1.5); } : null,
        });
        standSide(side, L, upR, side === "N" || side === "S" ? hd : hw, { off0: D1 + vipD, step: upStep, rise: upRise, y0: top1 + 2.2, depthBase: base + (back ? -0.2 : 0.2), seed: side.charCodeAt(0) + 50, dens: 0.95 });
      }
      // dış cephe duvarı
      var fo = (side === "N" || side === "S" ? hd : hw) + Dt + 0.3;
      var fb = { N: [0, -fo, L, 0.6], S: [0, fo, L, 0.6], W: [-fo, 0, 0.6, L], E: [fo, 0, 0.6, L] }[side];
      var backS = side === "N" || side === "W";
      box(fb[0], fb[1], fb[2], fb[3], 0, facadeH, facade, {
        depth: base + (backS ? -1 : 1),
        noShadow: backS,
        fL: side === "S" ? function (cc, FW, FH) {
          outerFace(cc, FW, FH);
          if (lv >= 7) {
            cc.save();
            var natF = natS;
            cc.fillStyle = natF ? K("#E30A17") : TH.night > 0.3 ? "rgba(20,16,67,0.5)" : "rgba(27,22,72,0.18)";
            cc.fillRect(FW * 0.12, FH * 0.18, FW * 0.76, FH * 0.36);
            ftext(cc, natF ? "ULUSAL STADYUM" : "ELİTLİG ARENA", FW / 2, FH * 0.37, FH * 0.28, TH.night > 0.3 ? "#FFFFFF" : K("#FFFFFF"), FW * 0.72);
            cc.restore();
          }
        } : null,
        fR: side === "E" ? outerFace : null,
      });
      if (SVF && SVF.smart) {
        // AKILLI STADYUM: cephe tepesinde ışıklı LED şerit (gol olunca renk değiştirir)
        var led = SVF.nat ? "#FF2E3F" : "#22D3EE";
        var lb = { N: [0, -fo - 0.1, L + 0.4, 0.8], S: [0, fo + 0.1, L + 0.4, 0.8], W: [-fo - 0.1, 0, 0.8, L + 0.4], E: [fo + 0.1, 0, 0.8, L + 0.4] }[side];
        box(lb[0], lb[1], lb[2], lb[3], facadeH - 2.2, 1.6, led, { depth: base + (backS ? -0.9 : 1.1), noShadow: true, gloss: false, top: lit(led, 0.3) });
      }
    }
    if (B) {
      corner([-1, -1], -200);
      tiers("N", hw * 2, -150);
      tiers("W", hd * 2, -140);
      corner([1, -1], -60);
      corner([-1, 1], -60);
    } else {
      tiers("E", hd * 2, 20);
      tiers("S", hw * 2, 25);
      corner([1, 1], 60);
    }
    if (lv === 5 && !(SVF && SVF.noFlood)) {
      // açık stadyum: köşe projektör kuleleri
      corners.forEach(function (q) {
        var front = q[0] > 0 || q[1] > 0;
        if (front !== !B) return;
        floodS(q[0] * (hw + Dt / 2 + 0.3), q[1] * (hd + Dt / 2 + 0.3), facadeH + 14, true);
      });
    }
    if (lv >= 6) {
      // çatı: dış kenardan içe doğru beyaz membran, iç kenarda kulüp rengi ışık bandı
      var rIn = lv >= 7 ? Dt * 0.38 : Dt * 0.42, rOut = Dt + 0.9;
      var ry = facadeH;
      var roofCol = lv >= 7 ? "#F7F9FF" : "#EEF1FB";
      var band = function (cc, FW, FH) {
        cc.fillStyle = TH.night > 0.3 ? lit(kit.primary, 0.35) : K(lit(kit.primary, 0.2));
        cc.fillRect(0, 0, FW, FH);
      };
      var seg = function (side, d) {
        var L = side === "N" || side === "S" ? hw * 2 + rOut * 2 : hd * 2 + rOut * 2;
        var inner = side === "N" || side === "S" ? hd : hw;
        var mid = inner + (rIn + rOut) / 2, dep = rOut - rIn;
        var b = { N: [0, -mid, L, dep], S: [0, mid, L, dep], W: [-mid, 0, dep, L - rOut * 2 + rIn * 2], E: [mid, 0, dep, L - rOut * 2 + rIn * 2] }[side];
        box(b[0], b[1], b[2], b[3], ry, 0.5, roofCol, {
          depth: d,
          noShadow: true,
          fT: function (cc, FW, FH) {
            cc.strokeStyle = rgba("#A3ACD0", 0.6);
            cc.lineWidth = 0.12;
            var along = b[2] > b[3];
            for (var t = 1.5; t < (along ? FW : FH); t += 3) {
              cc.beginPath();
              if (along) {
                cc.moveTo(t, 0);
                cc.lineTo(t, FH);
              } else {
                cc.moveTo(0, t);
                cc.lineTo(FW, t);
              }
              cc.stroke();
            }
          },
          fL: side === "N" ? band : null,
          fR: side === "W" ? band : null,
        });
      };
      if (B) {
        seg("N", 40);
        seg("W", 41);
      } else {
        seg("E", 90);
        seg("S", 91);
      }
      // çatı ışıkları (gece)
      corners.forEach(function (q, i) {
        var front = q[0] > 0 || q[1] > 0;
        if (front !== !B) return;
        anchor({ t: "flood", x: q[0] * (hw + rIn + 1), y: ry + 0.4, z: q[1] * (hd + rIn + 1), big: true, roof: true });
      });
      if (B && !(SVF && SVF.noScreens)) {
        // dev ekranlar (köşelerde, sahaya bakar)
        [[1, -1], [-1, 1]].forEach(function (q) {
          var sx = q[0] * (hw + Dt * 0.5), sz = q[1] * (hd + Dt * 0.5);
          box(sx, sz, q[0] > 0 ? 0.4 : 6, q[0] > 0 ? 6 : 0.4, ry - 3.4, 3, "#1B1648", {
            depth: 42,
            noShadow: true,
            fL: q[0] < 0 ? screenFace : null,
            fR: q[0] > 0 ? screenFace : null,
          });
        });
      }
    }
    if (SVF && SVF.smart && !B) {
      // akıllı turnikeler (ön köşe girişlerinde)
      [[-1, 1], [1, -1]].forEach(function (q) {
        var tx = q[0] > 0 ? hw + Dt + 2.2 : -hw * 0.5, tz = q[1] > 0 ? hd + Dt + 2.2 : -hd * 0.5;
        for (var i = 0; i < 4; i++) box(tx + (q[0] < 0 ? i * 1.2 : 0), tz + (q[0] > 0 ? i * 1.2 : 0), 0.6, 0.6, 0, 1.3, "#2B2F6E", { noShadow: true, top: SVF.nat ? "#FF4D5E" : "#22D3EE", depth: 120 + i * 0.01 });
      });
    }
    if (SVF && SVF.roof && !B) {
      // AÇILIR ÇATI: iki kayar panel yarı kapalı; ortada açık şerit, kenarlarda raylar
      var py = facadeH + 0.6, gap = hd * 0.42, rin = hd + 0.5;
      [-1, 1].forEach(function (sd) {
        var z0 = sd * gap, z1 = sd * (rin + Dt * 0.5);
        box(0, (z0 + z1) / 2, hw * 2 + Dt, Math.abs(z1 - z0), py, 0.5, "#DCE3F5", {
          depth: 150 + sd,
          noShadow: true,
          fT: function (cc, FW, FH) {
            cc.strokeStyle = rgba("#8E9AC4", 0.7);
            cc.lineWidth = 0.18;
            for (var t = 2; t < FW; t += 3.2) {
              cc.beginPath();
              cc.moveTo(t, 0);
              cc.lineTo(t, FH);
              cc.stroke();
            }
            cc.fillStyle = TH.night > 0.3 ? lit(kit.primary, 0.3) : K(kit.primary);
            cc.fillRect(0, sd < 0 ? FH - 0.5 : 0, FW, 0.5);
          },
        });
      });
      [-1, 1].forEach(function (sx) {
        box(sx * (hw + Dt * 0.5), 0, 0.8, hd * 2 + Dt * 2, py - 0.1, 0.5, "#5B6385", { depth: 149 + sx * 0.1, noShadow: true });
      });
    }
    if (SVF && SVF.nat && !B) {
      // ULUSAL STADYUM: ön cephe boyunca ay yıldızlı bayraklar
      [-0.6, -0.2, 0.2, 0.6].forEach(function (u) {
        turkFlag(u * hw * 2, hd + Dt + 2.5, facadeH * 0.7);
      });
      [-0.4, 0.2].forEach(function (u) {
        turkFlag(hw + Dt + 2.5, u * hd * 2, facadeH * 0.7);
      });
    }
    if (lv >= 7 && !B && !(SVF && SVF.noArch)) {
      // WEMBLEY KEMERİ: stadyumun üstünden geçen dev beyaz kemer + çatıya inen kablolar
      var span = hw + Dt + 0.5, lean = -(hd + Dt) * 0.25, archH = 40;
      extBox(0, 0, span * 2, 4, 0, archH + 2);
      body(200, function () {
        var c = G.c, P = G.P;
        var pts = [];
        for (var i = 0; i <= 32; i++) {
          var u = i / 32;
          pts.push(P(-span + u * span * 2, Math.sin(u * Math.PI) * archH, lean * Math.sin(u * Math.PI)));
        }
        // kablolar
        c.strokeStyle = rgba(TH.night > 0.5 ? "#C9D2FF" : "#FFFFFF", 0.7);
        c.lineWidth = Math.max(0.6, G.lw * 0.35);
        for (var k = 4; k < 29; k += 3) {
          [-1, 1].forEach(function (sd) {
            var u = k / 32, xx = -span + u * span * 2;
            var q = P(xx * 0.92, facadeH + 0.5, sd * (hd + Dt * 0.6));
            c.beginPath();
            c.moveTo(pts[k][0], pts[k][1]);
            c.lineTo(q[0], q[1]);
            c.stroke();
          });
        }
        c.lineCap = "round";
        c.lineJoin = "round";
        c.beginPath();
        c.moveTo(pts[0][0], pts[0][1]);
        for (var j = 1; j < pts.length; j++) c.lineTo(pts[j][0], pts[j][1]);
        c.strokeStyle = NAVY;
        c.lineWidth = Math.max(3, 1.5 * G.s);
        c.stroke();
        c.strokeStyle = TH.night > 0.5 ? "#F4F2FF" : "#FFFFFF";
        c.lineWidth = Math.max(1.6, 1.0 * G.s);
        c.stroke();
        c.strokeStyle = TH.night > 0.5 ? rgba(lit(kit.primary, 0.4), 0.9) : "rgba(200,210,240,0.9)";
        c.lineWidth = Math.max(0.6, 0.3 * G.s);
        c.stroke();
      });
      anchor({ t: "arch", span: span, lean: lean, h: archH });
      [-1, 1].forEach(function (s) {
        flagpole(s * (hw + Dt * 0.5), hd + Dt + 0.3, facadeH + 4, s > 0 ? kit.primary : kit.secondary, s > 0 ? kit.secondary : kit.primary);
      });
    }
  }
  function screenFace(cc, FW, FH) {
    var g = cc.createLinearGradient(0, 0, FW, FH);
    g.addColorStop(0, TH.night > 0.5 ? lit(kit.primary, 0.1) : K(kit.primary));
    g.addColorStop(1, "#141043");
    cc.fillStyle = g;
    cc.fillRect(0.2, 0.2, FW - 0.4, FH - 0.4);
    ftext(cc, "2 - 1", FW / 2, FH * 0.5, FH * 0.45, "#FFD43B", FW * 0.8);
  }

  /* ─────────────── SOYUNMA ─────────────── */

  var BUILD = {};
  BUILD.soyunma = function (lv) {
    if (lv === 0) return emptyPlot();
    if (lv === 1) {
      lawn(false);
      tree(0, -2, 1.6);
      body(5, function () {
        // dallarda asılı formalar
        var c = G.c, s = G.s;
        [[-1.6, 3.3], [0.2, 4.1], [1.8, 3.1]].forEach(function (q, i) {
          var p = G.P(q[0], q[1], -2 + q[0] * 0.2);
          shirtAt(c, p[0], p[1], 1.4 * s, i % 2 ? kit.secondary : kit.primary, i % 2 ? kit.primary : kit.secondary);
        });
      });
      ["#1B1648", "#FF4D5E", "#3B82F6", "#22C55E"].forEach(function (col, i) {
        bagS(-3 + i * 1.6, 4, col);
      });
      bench(4, 6, true, 4);
      tree(-14, -12, 0.9);
      tree(13, 13, 0.8);
      return;
    }
    if (lv === 2) {
      paved("#D9D3C2");
      box(0, -2, 13, 5, 0, 3, "#FF8A2B", {
        fL: function (cc, FW, FH) {
          cc.strokeStyle = rgba("#9A3E10", 0.5);
          cc.lineWidth = 0.12;
          for (var x = 0.4; x < FW; x += 0.6) {
            cc.beginPath();
            cc.moveTo(x, 0);
            cc.lineTo(x, FH);
            cc.stroke();
          }
          fsign(cc, 4, 1.1, 5.5, 1.1, "SOYUNMA", kit.primary, kit.secondary, true);
          A.roundRect(cc, FW - 3.5, 0.6, 1.6, FH - 0.6, 0.2);
          cc.fillStyle = K("#7A3410");
          cc.fill();
        },
        fR: function (cc, FW, FH) {
          cc.strokeStyle = rgba(NAVY, 0.4);
          cc.lineWidth = 0.15;
          cc.strokeRect(0.4, 0.4, FW - 0.8, FH - 0.8);
          cc.beginPath();
          cc.moveTo(FW / 2, 0.4);
          cc.lineTo(FW / 2, FH - 0.4);
          cc.stroke();
        },
      });
      bench(-3, 4.5, true, 4);
      body(6, function () {
        // havlu ipi
        var c = G.c, P = G.P, s = G.s;
        var a = P(3, 2.2, 5), b = P(10, 2.2, 5);
        c.strokeStyle = NAVY;
        c.lineWidth = G.lw * 0.6;
        c.beginPath();
        c.moveTo(a[0], a[1]);
        c.lineTo(b[0], b[1]);
        c.stroke();
        for (var i = 0; i < 4; i++) {
          var p = P(3.8 + i * 1.7, 2.2, 5);
          c.fillStyle = K(["#FFFFFF", kit.primary, "#FFD43B", "#7CC7FF"][i]);
          c.fillRect(p[0] - 0.4 * s, p[1], 0.8 * s, 1.2 * s);
        }
      });
      tree(-15, 12, 0.9);
      tree(15, -14, 1);
      return;
    }
    if (lv === 3) {
      paved();
      gable(0, -3, 13, 9, 0, 3.6, 2.6, "#F08A5D", "#C2413B", {
        fL: function (cc, FW, FH) {
          cc.strokeStyle = rgba("#7A2E14", 0.3);
          cc.lineWidth = 0.06;
          for (var y = 0.3; y < FH; y += 0.3) {
            cc.beginPath();
            cc.moveTo(0, y);
            cc.lineTo(FW, y);
            cc.stroke();
          }
          win(cc, 1, 1, 2, 1.5, true);
          win(cc, FW - 3, 1, 2, 1.5, false);
          A.roundRect(cc, FW / 2 - 0.9, FH - 2.5, 1.8, 2.5, 0.3);
          cc.fillStyle = K("#6B3A1E");
          cc.fill();
          fsign(cc, FW / 2, 0.5, 6.5, 0.8, "SOYUNMA ODASI", kit.primary, kit.secondary, true);
        },
        fR: function (cc, FW, FH) {
          win(cc, FW / 2 - 1, 1, 2, 1.4, true);
        },
      });
      bench(-4, 5.5, true, 4);
      bench(4, 5.5, true, 4);
      tree(-15, -13, 1);
      tree(14, 12, 0.9);
      bush(-10, 8);
      return;
    }
    if (lv === 4) {
      paved();
      box(0, -3, 17, 10, 0, 4.2, "#FFE7B8", {
        fL: function (cc, FW, FH) {
          windowsGrid(cc, FW, FH, { ww: 1.6, wh: 1.3, gx: 1.2, top: 0.6, rows: 1, skip: function (r, k, R, Cn) { return k === Math.floor(Cn / 2); } });
          A.roundRect(cc, FW / 2 - 1, FH - 2.5, 2, 2.5, 0.3);
          cc.fillStyle = K("#4A4F86");
          cc.fill();
          fsign(cc, FW / 2, FH - 3.1, 7.5, 0.8, "SOYUNMA ODASI", kit.primary, kit.secondary, true);
        },
        fR: function (cc, FW, FH) {
          windowsGrid(cc, FW, FH, { ww: 1.4, wh: 1.3, top: 0.7, rows: 1 });
        },
      });
      box(0, -3, 17.6, 10.6, 4.2, 0.5, "#E2D3B0", { noShadow: true });
      [[5, -6], [2, -6]].forEach(function (q) {
        cyl(q[0], q[1], 0.5, 4.7, 1.6, "#A9AEC6", { noShadow: true });
        anchor({ t: "steam", x: q[0], y: 6.5, z: q[1] });
      });
      bench(-5, 5, true, 4);
      bench(5, 5, true, 4);
      bikeS(10, 8, "#3B82F6");
      bikeS(11.5, 8.5, "#FF4D5E");
      tree(-15, -14, 1.1);
      tree(15, 13, 0.9);
      tree(-16, 12, 0.8);
      return;
    }
    if (lv === 5) {
      paved();
      box(-2, -4, 18, 11, 0, 7.5, "#F7F5FF", {
        fL: function (cc, FW, FH) {
          cc.fillStyle = K(kit.primary);
          cc.fillRect(0, 3.2, FW, 0.8);
          windowsGrid(cc, FW, FH, { ww: 2.4, wh: 2, gx: 0.6, gy: 2, top: 0.8, rows: 1, glass: "#7CC7FF" });
          windowsGrid(cc, FW, FH, { ww: 2.4, wh: 2, gx: 0.6, top: 4.6, rows: 1, glass: "#7CC7FF" });
          fsign(cc, FW / 2, 3.6, 8, 1, "SOYUNMA · PERFORMANS", kit.primary, kit.secondary, true);
        },
        fR: function (cc, FW, FH) {
          windowsGrid(cc, FW, FH, { ww: 1.8, wh: 2, gx: 0.8, gy: 1.8, top: 0.8 });
        },
      });
      pool(10, 6, 6, 4, "#7FE3FF");
      anchor({ t: "steam", x: 10, y: 1, z: 6 });
      bench(-6, 6, true, 4);
      box(2, 7, 1, 2.2, 0, 0.5, "#FFFFFF");
      box(3.6, 7, 1, 2.2, 0, 0.5, "#FFFFFF");
      tree(-16, -15, 1.1);
      tree(-16, 14, 0.9);
      tree(16, -14, 0.9);
      return;
    }
    // 6: PROFESYONEL SOYUNMA TESİSİ — yeşil çatılı cam pavyon, oyuncu tüneli, hidroterapi havuzları
    paved("#EEE9F8");
    box(-2, -5, 22, 12, 0, 6, "#2D3270", {
      fL: function (cc, FW, FH) {
        var g = cc.createLinearGradient(0, 0, 0, FH);
        g.addColorStop(0, TH.night > 0.5 ? "#FFE2A8" : K("#7FC3F5"));
        g.addColorStop(1, TH.night > 0.5 ? "#FFB85C" : K("#3D7FD1"));
        cc.fillStyle = g;
        cc.fillRect(0.6, 1.2, FW - 1.2, FH - 1.2);
        cc.strokeStyle = rgba("#FFFFFF", 0.7);
        cc.lineWidth = 0.12;
        for (var x = 0.6; x < FW; x += 2.4) {
          cc.beginPath();
          cc.moveTo(x, 1.2);
          cc.lineTo(x, FH);
          cc.stroke();
        }
        cc.fillStyle = TH.night > 0.3 ? lit(kit.primary, 0.3) : K(kit.primary);
        cc.fillRect(0, 0.3, FW, 0.6);
        fsign(cc, FW / 2, 2.6, 10, 1.2, "SOYUNMA · PERFORMANS", kit.primary, kit.secondary, true);
      },
      fR: function (cc, FW, FH) {
        windowsGrid(cc, FW, FH, { ww: 2, wh: 3, gx: 0.6, top: 1.3, rows: 1, glass: "#7FC3F5" });
      },
    });
    box(-2, -5, 22.6, 12.6, 6, 0.6, "#3EAF55", {
      noShadow: true,
      fT: function (cc, FW, FH) {
        var r = A.seeded(3);
        for (var i = 0; i < 40; i++) {
          cc.fillStyle = r() < 0.5 ? K("#5CCB62") : K("#2F9C48");
          cc.beginPath();
          cc.arc(r() * FW, r() * FH, 0.5 + r() * 0.6, 0, Math.PI * 2);
          cc.fill();
        }
      },
    });
    for (var b = -3; b <= 3; b++) bush(-2 + b * 2.8, -5 + (b % 2) * 3, 0.7);
    crestS(-12, 1.6, 3.2, 1.2);
    // oyuncu tüneli (stadyuma uzanan, kulüp renginde halkalar)
    vaultX(14, -4, 12, 2.4, 0, "#F2F4FF", { rib: 1.6, ribCol: kit.primary, ribW: 2.2, cap: "#2D3270" });
    pool(-8, 9, 6, 4, "#8FE6FF");
    pool(0, 9, 6, 4, "#2FB8F0");
    anchor({ t: "steam", x: -8, y: 1, z: 9 });
    box(8, 9, 1, 2.2, 0, 0.5, "#FFFFFF");
    box(10, 9, 1, 2.2, 0, 0.5, "#FFFFFF");
    tree(-17, -16, 1);
    tree(17, 15, 0.9);
    palm(15, 8, 0.9);
  };

  /* ─────────────── KAFETERYA ─────────────── */

  BUILD.kantin = function (lv) {
    if (lv === 0) return emptyPlot();
    if (lv === 1) {
      lawn(false);
      pad(2, 2, 14, 12, PAVE, { th: 0.32, fn: tiles(1.5), r: 3 });
      box(2, 0, 3.6, 1.6, 0.3, 1.1, "#F2F4FF", {
        fL: function (cc, FW, FH) {
          cc.fillStyle = K("#FF4D5E");
          cc.fillRect(0, 0.25, FW, 0.25);
          ftext(cc, "TOST · ÇAY", FW / 2, 0.75, 0.45, K(NAVY), FW * 0.9);
        },
      });
      box(1.2, 0, 1, 0.8, 1.4, 0.45, "#5B6385", { noShadow: true });
      box(3, 0, 0.5, 0.5, 1.4, 0.55, "#FF3B4E", { noShadow: true });
      anchor({ t: "steam", x: 1.2, y: 2.1, z: 0 });
      umbrella(2, -0.6, 3, 2.4, "#FF4D5E", "#FFFFFF");
      cyl(0, 3, 0.35, 0, 0.5, "#FFD43B", { noShadow: true });
      cyl(4, 3, 0.35, 0, 0.5, "#FFD43B", { noShadow: true });
      tree(-14, -13, 1);
      tree(14, -10, 0.9);
      tree(-13, 13, 0.8);
      return;
    }
    if (lv === 2) {
      lawn();
      pad(0, 2, 22, 18, PAVE, { th: 0.32, fn: tiles(1.5), r: 3 });
      gable(0, -3, 8, 6, 0, 3.2, 2, "#FFE07A", "#E2574C", {
        fL: function (cc, FW, FH) {
          A.roundRect(cc, 0.8, 0.8, FW - 1.6, 1.7, 0.2);
          cc.fillStyle = TH.night > 0.5 ? "#FFD98A" : K("#5A3418");
          cc.fill();
          fsign(cc, FW / 2, 0.42, 4, 0.7, "KANTİN", "#E2574C", "#FFFFFF", true);
        },
      });
      // tenteli tezgâh
      box(0, 0.8, 7, 1.2, 0, 1.1, "#B06A35", { noShadow: true });
      body(1.5, function () {
        var c = G.c, P = G.P;
        var a = P(-4, 3.1, 0), b = P(4, 3.1, 0), d = P(4, 2.3, 2.2), e = P(-4, 2.3, 2.2);
        quad(c, a, b, d, e);
        c.fillStyle = K("#FFFFFF");
        c.fill();
        c.save();
        c.clip();
        c.fillStyle = K("#E2574C");
        for (var i = 0; i < 8; i += 2) {
          var q1 = P(-4 + i, 3.1, 0), q2 = P(-3 + i, 3.1, 0), q3 = P(-3 + i, 2.3, 2.2), q4 = P(-4 + i, 2.3, 2.2);
          quad(c, q1, q2, q3, q4);
          c.fill();
        }
        c.restore();
        quad(c, a, b, d, e);
        outline(c);
      });
      table(-5, 7);
      table(5, 7);
      anchor({ t: "steam", x: 2.5, y: 6, z: -4 });
      tree(-15, -14, 1);
      tree(15, 14, 0.9);
      return;
    }
    if (lv === 3) {
      paved();
      gable(0, -4, 14, 9, 0, 3.8, 2.4, "#FFF1DC", "#D9643C", {
        fL: function (cc, FW, FH) {
          windowsGrid(cc, FW, FH, { ww: 2.2, wh: 1.6, gx: 1, top: 1, rows: 1, skip: function (r, k, R, Cn) { return k === Math.floor(Cn / 2); } });
          A.roundRect(cc, FW / 2 - 1, FH - 2.6, 2, 2.6, 0.3);
          cc.fillStyle = K("#8A4B2A");
          cc.fill();
          fsign(cc, FW / 2, 0.5, 6, 0.8, "KAFETERYA", kit.primary, kit.secondary, true);
        },
        fR: function (cc, FW, FH) {
          win(cc, FW / 2 - 1, 1, 2, 1.5, true);
        },
      });
      table(-5, 5);
      table(0, 6);
      table(5, 5);
      billboard(9, 3, 0.2, 2, 2.4, "MENÜ", "#1B1648", "#FFD43B", { posts: false });
      anchor({ t: "steam", x: 5, y: 7, z: -6 });
      tree(-16, -15, 1);
      tree(16, 13, 0.9);
      bush(-11, 9);
      return;
    }
    if (lv === 4) {
      paved();
      box(0, -4, 17, 10, 0, 4.4, "#B9F2C8", {
        fL: function (cc, FW, FH) {
          windowsGrid(cc, FW, FH, { ww: 3, wh: 2.4, gx: 0.6, top: 1.1, rows: 1, glass: "#9FE0FF", skip: function (r, k, R, Cn) { return k === Math.floor(Cn / 2); } });
          A.roundRect(cc, FW / 2 - 1.1, FH - 2.8, 2.2, 2.8, 0.3);
          cc.fillStyle = K("#2D3270");
          cc.fill();
          fsign(cc, FW / 2, 0.5, 7.5, 0.8, "SPORCU KAFESİ", kit.primary, kit.secondary, true);
        },
        fR: function (cc, FW, FH) {
          windowsGrid(cc, FW, FH, { ww: 2.4, wh: 2.2, top: 1.1, rows: 1, glass: "#9FE0FF" });
        },
      });
      box(0, -4, 17.6, 10.6, 4.4, 0.5, "#2FB36A", { noShadow: true });
      [-6, 0, 6].forEach(function (x) {
        table(x, 6);
        umbrella(x, 6, 2.8, 2, kit.primary, kit.secondary);
      });
      bush(-11, 2);
      bush(11, 2);
      anchor({ t: "steam", x: 5, y: 6, z: -7 });
      tree(-16, -15, 1);
      tree(16, -14, 1);
      return;
    }
    if (lv === 5) {
      paved();
      box(0, -6, 19, 10, 0, 8, "#FFE0C2", {
        fL: function (cc, FW, FH) {
          windowsGrid(cc, FW, FH, { ww: 2.6, wh: 2.2, gx: 0.8, gy: 1.6, top: 0.8, rows: 2, glass: "#9FE0FF" });
          fsign(cc, FW / 2, 4.1, 9, 1, "KULÜP RESTORANI", "#B45309", "#FFFFFF", true);
        },
        fR: function (cc, FW, FH) {
          windowsGrid(cc, FW, FH, { ww: 2, wh: 2.2, gy: 1.6, top: 0.8, glass: "#9FE0FF" });
        },
      });
      box(0, -6, 19.6, 10.6, 8, 0.6, "#B45309", { noShadow: true });
      // ahşap teras + ışık zinciri
      box(0, 4, 20, 8, 0, 0.6, "#D9925A", {
        noShadow: true,
        fT: function (cc, FW, FH) {
          cc.strokeStyle = rgba("#7A3E10", 0.35);
          cc.lineWidth = 0.08;
          for (var x = 0.6; x < FW; x += 0.6) {
            cc.beginPath();
            cc.moveTo(x, 0);
            cc.lineTo(x, FH);
            cc.stroke();
          }
        },
      });
      [-6, 0, 6].forEach(function (x) {
        table(x, 4);
      });
      stringLights(-10, 7.6, 10, 7.6, 3.4, 12);
      [-10, 10].forEach(function (x) {
        cyl(x, 7.6, 0.15, 0, 3.4, "#5B6385", { noShadow: true });
      });
      anchor({ t: "steam", x: 7, y: 9.5, z: -9 });
      tree(-17, -16, 1);
      tree(17, -15, 1);
      return;
    }
    // 6: ŞEF'İN MASASI — cam serali restoran, teras, ışık zinciri, çatı bahçesi
    paved("#F0EAF8");
    box(0, -8, 20, 9, 0, 7, "#2A2F55", {
      fL: function (cc, FW, FH) {
        windowsGrid(cc, FW, FH, { ww: 1.6, wh: 3.4, gx: 0.6, top: 1.6, rows: 1, glass: "#FFD98A", litK: 1 });
      },
      fR: function (cc, FW, FH) {
        windowsGrid(cc, FW, FH, { ww: 1.4, wh: 3.4, top: 1.6, rows: 1, glass: "#FFD98A", litK: 1 });
      },
    });
    box(0, -8, 20.6, 9.6, 7, 0.5, "#3EAF55", { noShadow: true });
    for (var b2 = -3; b2 <= 3; b2++) bush(b2 * 2.6, -8, 0.6);
    cyl(7, -10, 0.7, 7.5, 2.2, "#FFFFFF", { noShadow: true });
    anchor({ t: "steam", x: 7, y: 10.5, z: -10 });
    vaultX(0, 1, 18, 4.2, 0, "#BFE6FF", { alpha: 0.85, rib: 2, lit: "#FFD590", cap: "#9FD8FF" });
    billboard(0, 6, 0.3, 9, 1.4, "★ ŞEF'İN MASASI ★", "#B45309", "#FFFFFF", { glow: true, posts: false });
    [-7, -2.3, 2.3, 7].forEach(function (x, i) {
      table(x, 10);
      umbrella(x, 10, 2.6, 1.8, i % 2 ? kit.primary : "#FFFFFF", i % 2 ? "#FFFFFF" : kit.primary);
    });
    stringLights(-10, 13, 10, 13, 3.2, 14);
    [-10, 10].forEach(function (x) {
      cyl(x, 13, 0.15, 0, 3.2, "#5B6385", { noShadow: true });
    });
    tree(-17, -16, 1.1);
    tree(17, -16, 1);
    palm(-16, 10, 0.9);
  };

  /* ─────────────── MAĞAZA ─────────────── */

  BUILD.magaza = function (lv) {
    if (lv === 0) return emptyPlot();
    if (lv === 1) {
      lawn(false);
      pad(0, 2, 14, 12, PAVE, { th: 0.32, fn: tiles(1.5), r: 3 });
      box(0, 2, 4, 1.6, 0.8, 0.15, "#F2F4FF");
      [[-1.8, 1.4], [1.8, 1.4], [-1.8, 2.6], [1.8, 2.6]].forEach(function (q) {
        box(q[0], q[1], 0.15, 0.15, 0, 0.8, "#5B6385", { noShadow: true });
      });
      // askılık + formalar
      [-2.5, 2.5].forEach(function (x) {
        box(x, -0.5, 0.18, 0.18, 0, 2.6, "#5B6385", { noShadow: true });
      });
      body(0.5, function () {
        var c = G.c, P = G.P, s = G.s;
        var a = P(-2.5, 2.5, -0.5), b = P(2.5, 2.5, -0.5);
        c.strokeStyle = NAVY;
        c.lineWidth = G.lw;
        c.beginPath();
        c.moveTo(a[0], a[1]);
        c.lineTo(b[0], b[1]);
        c.stroke();
        for (var i = 0; i < 4; i++) {
          var p = P(-1.8 + i * 1.2, 1.75, -0.5);
          shirtAt(c, p[0], p[1], 1.25 * s, i % 2 ? kit.secondary : kit.primary, i % 2 ? kit.primary : kit.secondary);
        }
      });
      billboard(4.6, 4, 0.4, 2.6, 1, "FORMA", kit.primary, kit.secondary);
      tree(-14, -13, 1);
      tree(14, 12, 0.8);
      return;
    }
    if (lv === 2) {
      lawn();
      pad(0, 1, 18, 16, PAVE, { th: 0.32, fn: tiles(1.5), r: 3 });
      box(0, -2, 7, 5, 0, 3.2, "#FFFFFF", {
        fL: function (cc, FW, FH) {
          for (var i = 0; i < 8; i++) {
            cc.fillStyle = K(i % 2 ? kit.secondary : kit.primary);
            cc.fillRect(0.6 + i * 0.75, 1.1, 0.5, 1.9);
            cc.fillStyle = K(i % 2 ? kit.primary : kit.secondary);
            cc.fillRect(0.6 + i * 0.75, 1.6, 0.5, 0.25);
          }
          fsign(cc, FW / 2, 0.5, 5, 0.75, "ATKI · BERE", kit.primary, kit.secondary, true);
        },
      });
      box(0, -2, 7.4, 5.4, 3.2, 0.5, kit.primary, { noShadow: true });
      box(-6, 2, 1.2, 1.2, 0, 1.6, "#F2F4FF", { fL: function (cc, FW, FH) { cc.fillStyle = K(kit.primary); cc.fillRect(0, 0.3, FW, 0.4); } });
      tree(-15, -13, 1);
      tree(15, 13, 0.9);
      bush(8, 6);
      return;
    }
    if (lv === 3) {
      var sg3 = XV.sign || "KULÜP MAĞAZASI";
      paved();
      box(0, -4, 12, 9, 0, 4.2, "#FFFFFF", {
        fL: function (cc, FW, FH) {
          A.roundRect(cc, 0.6, 1.2, FW - 4, FH - 1.5, 0.3);
          cc.fillStyle = TH.night > 0.5 ? "#FFE2A8" : K("#BFE6FF");
          cc.fill();
          cc.lineWidth = 0.14;
          cc.strokeStyle = NAVY;
          cc.stroke();
          A.roundRect(cc, FW - 2.8, FH - 2.6, 1.8, 2.6, 0.3);
          cc.fillStyle = K("#2D3270");
          cc.fill();
        },
      });
      body(-3, function () {
        var c = G.c, P = G.P, s = G.s;
        for (var i = 0; i < 3; i++) {
          var p = P(-4 + i * 2.6, 2, 0.6);
          shirtAt(c, p[0], p[1], 1.5 * s, i % 2 ? kit.secondary : kit.primary, i % 2 ? kit.primary : kit.secondary);
        }
      });
      box(0, -4, 12.4, 9.4, 4.2, 0.5, kit.primary, {
        noShadow: true,
        fL: function (cc, FW, FH) {
          ftext(cc, sg3, FW / 2, FH / 2, 0.42, K(kit.secondary), FW * 0.8);
        },
      });
      // tente
      body(1.2, function () {
        var c = G.c, P = G.P;
        var a = P(-6, 3.7, 0.5), b = P(4, 3.7, 0.5), d = P(4, 3, 2.2), e = P(-6, 3, 2.2);
        quad(c, a, b, d, e);
        c.fillStyle = K(kit.primary);
        c.fill();
        c.save();
        c.clip();
        c.fillStyle = K(kit.secondary);
        for (var i = 0; i < 10; i += 2) {
          quad(c, P(-6 + i, 3.7, 0.5), P(-5 + i, 3.7, 0.5), P(-5 + i, 3, 2.2), P(-6 + i, 3, 2.2));
          c.fill();
        }
        c.restore();
        quad(c, a, b, d, e);
        outline(c);
      });
      flagpole(-8, 4, 5, kit.primary, kit.secondary);
      tree(-16, -14, 1);
      tree(16, 12, 0.9);
      return;
    }
    if (lv === 4) {
      paved();
      box(0, -4, 16, 10, 0, 7.6, "#F7F5FF", {
        fL: function (cc, FW, FH) {
          A.roundRect(cc, 0.6, 4, FW - 1.2, FH - 4.2, 0.3);
          cc.fillStyle = TH.night > 0.5 ? "#FFE2A8" : K("#BFE6FF");
          cc.fill();
          cc.lineWidth = 0.14;
          cc.strokeStyle = NAVY;
          cc.stroke();
          windowsGrid(cc, FW, 3.6, { ww: 2.2, wh: 1.6, gx: 0.8, top: 0.8, rows: 1 });
          fsign(cc, FW / 2, 3.5, 10, 0.95, "TARAFTAR MAĞAZASI", kit.primary, kit.secondary, true);
        },
        fR: function (cc, FW, FH) {
          // dev atkı afişi
          cc.fillStyle = K(kit.primary);
          cc.fillRect(FW / 2 - 1.2, 0.4, 2.4, FH - 0.8);
          cc.fillStyle = K(kit.secondary);
          for (var y = 1; y < FH - 1; y += 1.4) cc.fillRect(FW / 2 - 1.2, y, 2.4, 0.5);
        },
      });
      body(-3, function () {
        var c = G.c, P = G.P, s = G.s;
        for (var i = 0; i < 5; i++) {
          var p = P(-6 + i * 3, 2, 1.1);
          shirtAt(c, p[0], p[1], 1.6 * s, i % 2 ? kit.secondary : kit.primary, i % 2 ? kit.primary : kit.secondary);
        }
      });
      box(0, -4, 16.6, 10.6, 7.6, 0.6, kit.primary, { noShadow: true });
      flagpole(-10, 4, 6, kit.primary, kit.secondary);
      flagpole(10, 5, 6, kit.secondary, kit.primary);
      bush(-6, 5);
      bush(6, 5);
      tree(-16, -15, 1);
      tree(16, -14, 1);
      return;
    }
    // 5: MEGASTORE — kavisli cam cephe, çatıda dev forma, LED ekran, kuyruk
    paved("#F0EAF8");
    box(-1, -6, 20, 9, 0, 10, "#F7F5FF", {
      fR: function (cc, FW, FH) {
        screenFace(cc, FW, FH * 0.55);
      },
    });
    cyl(-1, 0.5, 7.5, 0, 9, "#9FD8FF", {
      depth: -0.5,
      fS: function (c, b, t, rx) {
        if (TH.night > 0.5) {
          c.fillStyle = "rgba(255,226,168,0.75)";
          c.fillRect(b[0] - rx, t[1], rx * 2, b[1] - t[1] + rx);
        }
        c.strokeStyle = "rgba(255,255,255,0.8)";
        c.lineWidth = G.lw * 0.6;
        for (var i = -5; i <= 5; i++) {
          c.beginPath();
          c.moveTo(b[0] + (i * rx) / 5.5, t[1]);
          c.lineTo(b[0] + (i * rx) / 5.5, b[1] + rx);
          c.stroke();
        }
        for (var j = 1; j < 3; j++) {
          var yy = t[1] + ((b[1] - t[1]) * j) / 3;
          c.beginPath();
          c.ellipse(b[0], yy, rx, rx / 2, 0, 0, Math.PI);
          c.stroke();
        }
      },
      top: kit.primary,
    });
    body(9, function () {
      var c = G.c, P = G.P, s = G.s;
      for (var i = 0; i < 5; i++) {
        var p = P(-6 + i * 2.5, 2.4, 6 + Math.abs(i - 2) * -0.7);
        shirtAt(c, p[0], p[1], 1.7 * s, i % 2 ? kit.secondary : kit.primary, i % 2 ? kit.primary : kit.secondary);
      }
    });
    // çatıda dev forma
    extBill(-3, -6, 8, 22);
    body(30, function () {
      var c = G.c, p = G.P(-3, 15, -6), s = G.s;
      shirtAt(c, p[0], p[1], 9 * s, kit.primary, kit.secondary);
      c.save();
      c.translate(p[0], p[1] + 1.2 * s);
      c.scale(s / 10, s / 10);
      c.font = A.font(40, 900);
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillStyle = K(kit.secondary === kit.primary ? "#FFFFFF" : kit.secondary);
      c.lineWidth = 4;
      c.strokeStyle = NAVY;
      c.strokeText("10", 0, 0);
      c.fillText("10", 0, 0);
      c.restore();
    });
    billboard(-1, 9.2, 0.2, 9, 1.5, "MEGASTORE", kit.primary, kit.secondary, { glow: true, posts: false });
    flagpole(-12, 6, 7, kit.primary, kit.secondary);
    flagpole(12, 6, 7, kit.secondary, kit.primary);
    tree(-17, -15, 1.1);
    tree(16, 16, 0.9);
  };

  /* ─────────────── KULÜP BİNASI ─────────────── */

  BUILD.kulup = function (lv) {
    if (lv === 0) return emptyPlot();
    if (lv === 1) {
      lawn(false);
      box(0, 0, 2.6, 1.4, 0.8, 0.15, "#C98A4B");
      [[-1.1, -0.5], [1.1, -0.5], [-1.1, 0.5], [1.1, 0.5]].forEach(function (q) {
        box(q[0], q[1], 0.15, 0.15, 0, 0.8, "#8A5426", { noShadow: true });
      });
      box(-0.5, 0, 0.8, 0.6, 0.95, 0.05, "#FFFFFF", { noShadow: true });
      cyl(0.7, 0.2, 0.15, 0.95, 0.2, "#FFD43B", { noShadow: true });
      box(0, 1.6, 0.8, 0.8, 0, 0.5, "#3A3F72", { noShadow: true });
      box(0, 1.95, 0.8, 0.12, 0.5, 0.8, "#3A3F72", { noShadow: true });
      umbrella(0, -0.4, 2.8, 2.2, kit.primary, kit.secondary);
      flagpole(-4, -3, 4, kit.primary, kit.secondary);
      pad(0, 1, 10, 8, PAVE, { th: 0.2, r: 3 });
      billboard(4, 2, 0.4, 3.8, 1.3, "KULÜP", kit.primary, kit.secondary);
      standee(-2, 3.5, "#3B82F6", 1);
      standee(-2.4, 4.8, "#FF4D5E", 2);
      tree(-14, -12, 1);
      tree(13, 12, 0.9);
      return;
    }
    if (lv === 2) {
      lawn();
      box(0, -2, 9, 5, 0, 3, "#E9ECF8", {
        fL: function (cc, FW, FH) {
          cc.fillStyle = K(kit.primary);
          cc.fillRect(0, 0.4, FW, 0.35);
          win(cc, 0.8, 1, 1.8, 1.2, true);
          A.roundRect(cc, 3.2, 1, 1.4, FH - 1, 0.2);
          cc.fillStyle = K("#4A4F86");
          cc.fill();
          fsign(cc, 6.6, 1.6, 3.6, 0.8, "KULÜP EVİ", kit.primary, kit.secondary, true);
        },
        fR: function (cc, FW, FH) {
          win(cc, FW / 2 - 0.8, 1, 1.6, 1.2, false);
        },
      });
      box(0, -2, 9.3, 5.3, 3, 0.25, "#9AA3C7", { noShadow: true });
      box(0, 1.2, 2, 1.4, 0, 0.3, "#C6CAE0", { noShadow: true });
      flagpole(-6, 2, 5, kit.primary, kit.secondary);
      tree(-15, -13, 1);
      tree(15, 12, 0.9);
      bush(5, 4);
      return;
    }
    if (lv === 3) {
      paved();
      gable(0, -3, 14, 9, 0, 6.4, 2.8, "#FFC59A", "#9A4B2A", {
        fL: function (cc, FW, FH) {
          windowsGrid(cc, FW, FH, { ww: 1.8, wh: 1.5, gx: 1.2, gy: 1.4, top: 0.8, skip: function (r, k, R, Cn) { return r === R - 1 && k === Math.floor(Cn / 2); } });
          A.roundRect(cc, FW / 2 - 1, FH - 2.6, 2, 2.6, 0.3);
          cc.fillStyle = K("#6B3A1E");
          cc.fill();
          fsign(cc, FW / 2, 3.3, 7, 0.9, "KULÜP BİNASI", kit.primary, kit.secondary, true);
        },
        fR: function (cc, FW, FH) {
          windowsGrid(cc, FW, FH, { ww: 1.6, wh: 1.5, gy: 1.4, top: 0.8 });
        },
      });
      [-3, 0, 3].forEach(function (x, i) {
        flagpole(x, 6, 6, i === 1 ? "#E30A17" : kit.primary, i === 1 ? null : kit.secondary);
      });
      tree(-16, -15, 1);
      tree(16, 13, 0.9);
      bush(-9, 5);
      bush(9, 5);
      return;
    }
    if (lv === 4) {
      paved();
      box(0, -4, 15, 10, 0, 11, "#F7F5FF", {
        fL: function (cc, FW, FH) {
          for (var f = 0; f < 3; f++) {
            cc.fillStyle = TH.night > 0.5 ? (f === 1 ? "#FFD98A" : "#3B3F86") : K("#8FD3FF");
            cc.fillRect(0.5, 1 + f * 3.4, FW - 1, 2.2);
            cc.strokeStyle = rgba(NAVY, 0.6);
            cc.lineWidth = 0.1;
            for (var x = 0.5; x < FW; x += 1.6) {
              cc.beginPath();
              cc.moveTo(x, 1 + f * 3.4);
              cc.lineTo(x, 3.2 + f * 3.4);
              cc.stroke();
            }
          }
          fsign(cc, FW / 2, FH - 0.6, 7.5, 0.9, "KULÜP BİNASI", kit.primary, kit.secondary, true);
        },
        fR: function (cc, FW, FH) {
          windowsGrid(cc, FW, FH, { ww: 1.6, wh: 2, gy: 1.4, top: 1 });
        },
      });
      box(0, -4, 15.6, 10.6, 11, 0.6, "#4A4F86", { noShadow: true });
      crestS(0, -4, 13.6, 1.5);
      [-4, 0, 4].forEach(function (x, i) {
        flagpole(x, 6, 7, i === 1 ? "#E30A17" : kit.primary, i === 1 ? null : kit.secondary);
      });
      tree(-16, -15, 1.1);
      tree(16, 13, 0.9);
      return;
    }
    if (lv === 5) {
      // KUPA MÜZESİ — sütunlu klasik bina, altın kubbe, kupa heykeli
      paved("#EEE9F8");
      box(0, -3, 19, 14, 0, 1.2, "#F4F1FA", { noShadow: true });
      box(0, -5, 15, 9, 1.2, 7, "#FBF9FF", {
        fL: function (cc, FW, FH) {
          A.roundRect(cc, FW / 2 - 1.3, FH - 3.6, 2.6, 3.6, 1.2);
          cc.fillStyle = K("#7A4A1E");
          cc.fill();
        },
        fR: function (cc, FW, FH) {
          windowsGrid(cc, FW, FH, { ww: 1.2, wh: 3, top: 1.8, rows: 1, glass: "#BFE6FF" });
        },
      });
      for (var col = -6; col <= 6; col += 2) cyl(col, 0.8, 0.45, 1.2, 7, "#FFFFFF", { noShadow: true, depth: 0.8 + col * 0.001 });
      gable(0, -2, 16, 7, 8.2, 0.01, 2.4, "#FBF9FF", "#F4F1FA", { ridgeZ: false, depth: 2, over: 0.4 });
      dome(0, -5, 4, 9.4, "#FFC93C", { depth: 3, ribs: true });
      billboard(0, 4.6, 0.3, 7.5, 1.1, "KUPA MÜZESİ", "#7C2D12", "#FFD43B", { glow: true, posts: false });
      // kupa heykeli
      box(-12, 6, 2, 2, 0, 1.4, "#3A3F72");
      body(-6 + 0.1, function () {
        var c = G.c, p = G.P(-12, 1.4, 6), s = G.s;
        c.beginPath();
        c.moveTo(p[0] - 1.2 * s, p[1] - 3.2 * s);
        c.quadraticCurveTo(p[0] - 1.1 * s, p[1] - 1.4 * s, p[0] - 0.25 * s, p[1] - 1.2 * s);
        c.lineTo(p[0] - 0.25 * s, p[1] - 0.5 * s);
        c.lineTo(p[0] - 0.8 * s, p[1]);
        c.lineTo(p[0] + 0.8 * s, p[1]);
        c.lineTo(p[0] + 0.25 * s, p[1] - 0.5 * s);
        c.lineTo(p[0] + 0.25 * s, p[1] - 1.2 * s);
        c.quadraticCurveTo(p[0] + 1.1 * s, p[1] - 1.4 * s, p[0] + 1.2 * s, p[1] - 3.2 * s);
        c.closePath();
        c.fillStyle = K("#FFC93C");
        c.fill();
        outline(c);
        c.fillStyle = "rgba(255,255,255,0.6)";
        c.fillRect(p[0] - 0.8 * s, p[1] - 3 * s, 0.25 * s, 1.4 * s);
      });
      crestS(0, -5, 16.6, 1.1);
      tree(-17, -15, 1);
      tree(16, -14, 1);
      tree(15, 14, 0.8);
      return;
    }
    // 6: MODERN GENEL MERKEZ — iki cam kule, gökyüzü köprüsü, dev arma, çeşmeli meydan
    paved("#EEE9F8");
    box(0, -6, 22, 12, 0, 5, "#F7F5FF", {
      fL: function (cc, FW, FH) {
        cc.fillStyle = TH.night > 0.3 ? lit(kit.primary, 0.2) : K(kit.primary);
        cc.fillRect(0, 0.3, FW, 0.6);
        A.roundRect(cc, 1, 1.6, FW - 2, FH - 1.6, 0.2);
        cc.fillStyle = TH.night > 0.5 ? "#FFE2A8" : K("#8FD3FF");
        cc.fill();
        fsign(cc, FW / 2, 2.4, 9, 1.1, "ELİTLİG KULÜBÜ", kit.primary, kit.secondary, true);
      },
    });
    glassTower(-5, -8, 8, 7, 5, 30, "#5AA2E8");
    glassTower(6, -6, 7, 6, 5, 21, "#7DBDF2");
    box(0.7, -7, 4, 3, 17, 3, "#8FD3FF", { noShadow: true, depth: -6.5, fL: function (cc, FW, FH) { win(cc, 0.3, 0.4, FW - 0.6, FH - 0.8, true, "#8FD3FF"); } });
    crestS(-5, -8, 38.5, 3);
    pool(0, 7, 9, 4, "#38BDF8");
    anchor({ t: "fountain", x: 0, y: 1, z: 7 });
    [-10, -7, 7, 10].forEach(function (x, i) {
      flagpole(x, 9, 7, i % 2 ? kit.secondary : kit.primary, i % 2 ? kit.primary : kit.secondary);
    });
    tree(-17, 14, 0.9);
    tree(17, 15, 0.9);
  };
  /** Cam kule: yansıtan cam, kat bantları, gece yanan pencereler. */
  function glassTower(x, z, w, d, y0, h, tint) {
    var face = function (cc, FW, FH) {
      var g = cc.createLinearGradient(0, 0, FW, FH);
      g.addColorStop(0, K(lit(tint, 0.35)));
      g.addColorStop(0.5, K(tint));
      g.addColorStop(1, K(dk(tint, 0.25)));
      cc.fillStyle = g;
      cc.fillRect(0, 0, FW, FH);
      var r = SP ? SP.rnd : Math.random;
      for (var f = 0.4; f < FH; f += 3.2) {
        for (var x2 = 0.3; x2 < FW - 0.3; x2 += 1.5) {
          if (TH.night > 0.5) {
            cc.fillStyle = r() < 0.55 ? "rgba(255,217,138,0.95)" : "rgba(20,16,67,0.35)";
            cc.fillRect(x2, f + 0.5, 1.2, 2.2);
          }
        }
        cc.fillStyle = rgba("#FFFFFF", TH.night > 0.5 ? 0.25 : 0.7);
        cc.fillRect(0, f, FW, 0.22);
      }
      // gökyüzü yansıması
      if (TH.night < 0.5) {
        cc.fillStyle = "rgba(255,255,255,0.28)";
        cc.beginPath();
        cc.moveTo(FW * 0.1, FH);
        cc.lineTo(FW * 0.45, 0);
        cc.lineTo(FW * 0.62, 0);
        cc.lineTo(FW * 0.27, FH);
        cc.closePath();
        cc.fill();
      }
    };
    box(x, z, w, d, y0, h, tint, { fL: face, fR: face, top: "#E9EDF8" });
    box(x, z, w + 0.5, d + 0.5, y0 + h, 0.6, "#E9EDF8", { noShadow: true, depth: x + z + 0.01 });
  }

  /* ─────────────── SAĞLIK ─────────────── */

  function redCross(cc, u, v, r) {
    cc.fillStyle = TH.night > 0.3 ? "#FF5A6A" : K("#EF2D3E");
    cc.fillRect(u - r * 0.33, v - r, r * 0.66, r * 2);
    cc.fillRect(u - r, v - r * 0.33, r * 2, r * 0.66);
  }
  BUILD.saglik = function (lv) {
    if (lv === 0) return emptyPlot();
    if (lv === 1) {
      lawn(false);
      pad(1, 1, 12, 10, PAVE, { th: 0.2, r: 3 });
      [[-2.5, -2.5], [2.5, -2.5], [-2.5, 2.5], [2.5, 2.5]].forEach(function (q) {
        box(q[0], q[1], 0.2, 0.2, 0, 2.6, "#9AA3C7", { noShadow: true, depth: q[0] + q[1] - 0.5 });
      });
      pyramid(0, 0, 6, 6, 2.6, 1.6, "#FFFFFF", { depth: 3, stripe: "#EF2D3E" });
      box(0, 0, 1.4, 1, 0, 1, "#FFFFFF", { fL: function (cc, FW, FH) { redCross(cc, FW / 2, FH / 2, 0.32); } });
      bench(0, 3, true, 3);
      box(4, 1, 2.2, 0.8, 0.5, 0.2, "#FFFFFF");
      box(4, 1, 2.2, 0.8, 0, 0.5, "#9AA3C7", { noShadow: true, depth: 4.9 });
      tree(-13, -12, 1);
      tree(13, 12, 0.8);
      return;
    }
    if (lv === 2) {
      lawn();
      box(0, -2, 7, 5, 0, 3.2, "#FFFFFF", {
        fL: function (cc, FW, FH) {
          redCross(cc, 1.3, 1.3, 0.6);
          A.roundRect(cc, FW / 2 - 0.7, FH - 2.3, 1.4, 2.3, 0.2);
          cc.fillStyle = K("#7CC7FF");
          cc.fill();
          fsign(cc, FW - 1.6, 1.2, 2.6, 0.8, "REVİR", "#0EA5E9", "#FFFFFF", true);
        },
        fR: function (cc, FW, FH) {
          win(cc, FW / 2 - 0.8, 1, 1.6, 1.2, true);
        },
      });
      box(0, -2, 7.3, 5.3, 3.2, 0.3, "#0EA5E9", { noShadow: true });
      bench(-5, 2, false, 3);
      tree(-15, -12, 1);
      tree(14, 13, 0.9);
      return;
    }
    if (lv === 3) {
      paved();
      box(0, -3, 12, 8, 0, 4.2, "#FFFFFF", {
        fL: function (cc, FW, FH) {
          redCross(cc, 1.4, 1.5, 0.8);
          windowsGrid(cc, FW, FH, { ww: 1.8, wh: 1.4, top: 1, rows: 1, glass: "#BFE6FF", skip: function (r, k) { return k === 0; } });
          A.roundRect(cc, FW / 2 - 0.9, FH - 2.5, 1.8, 2.5, 0.2);
          cc.fillStyle = K("#7CC7FF");
          cc.fill();
          fsign(cc, FW / 2, 0.45, 6, 0.75, "FİZYOTERAPİ", "#0EA5E9", "#FFFFFF", true);
        },
        fR: function (cc, FW, FH) {
          windowsGrid(cc, FW, FH, { ww: 1.6, wh: 1.4, top: 1, rows: 1 });
        },
      });
      box(0, -3, 12.4, 8.4, 4.2, 0.4, "#0EA5E9", { noShadow: true });
      // egzersiz topları
      ["#FF4D5E", "#3B82F6", "#22C55E"].forEach(function (col, i) {
        dome(-4 + i * 3, 5, 0.7, 0, col, { hk: 1.6 });
      });
      tree(-16, -14, 1);
      tree(16, 13, 0.9);
      return;
    }
    if (lv === 4) {
      paved();
      box(-3, -4, 15, 10, 0, 6.5, "#FFFFFF", {
        fL: function (cc, FW, FH) {
          redCross(cc, 1.6, 1.8, 1);
          cc.fillStyle = TH.night > 0.5 ? "#FFE2A8" : K("#9FDCFF");
          cc.fillRect(3.4, 1, FW - 4, 2.2);
          windowsGrid(cc, FW, FH, { ww: 2.2, wh: 1.6, gx: 0.8, top: 4.2, rows: 1, glass: "#BFE6FF" });
          fsign(cc, FW / 2 + 1, 3.6, 8, 0.75, "REHABİLİTASYON", "#0EA5E9", "#FFFFFF", true);
        },
        fR: function (cc, FW, FH) {
          windowsGrid(cc, FW, FH, { ww: 1.8, wh: 1.6, gy: 1.4, top: 1 });
        },
      });
      box(-3, -4, 15.6, 10.6, 6.5, 0.5, "#0EA5E9", { noShadow: true });
      pool(10, 2, 6, 9, "#38BDF8");
      box(10, 8.5, 2.2, 1, 0, 0.5, "#FFFFFF");
      tree(-16, 12, 1);
      tree(16, -15, 1);
      bush(-7, 5);
      return;
    }
    // 5: SPOR HASTANESİ — üç kanatlı cam bina, dev kırmızı haç, helikopter pisti, ambulans
    paved("#EEF3FB");
    var glassF = function (tint) {
      return function (cc, FW, FH) {
        cc.fillStyle = K(tint);
        cc.fillRect(0, 0, FW, FH);
        for (var f = 0.6; f < FH - 0.5; f += 2.6) {
          for (var x = 0.4; x < FW - 0.6; x += 1.4) {
            var on = SP.rnd() < 0.6;
            cc.fillStyle = TH.night > 0.5 ? (on ? "#FFE7B0" : "#2B2F6E") : K(on ? "#BFE6FF" : "#9FD0F5");
            cc.fillRect(x, f, 1.1, 1.7);
          }
        }
      };
    };
    box(0, -9, 20, 8, 0, 15, "#E8F2FF", {
      fL: function (cc, FW, FH) {
        glassF("#DCEBFF")(cc, FW, FH);
        cc.fillStyle = "#FFFFFF";
        cc.fillRect(FW / 2 - 3, 1.5, 6, 6);
        cc.lineWidth = 0.15;
        cc.strokeStyle = NAVY;
        cc.strokeRect(FW / 2 - 3, 1.5, 6, 6);
        redCross(cc, FW / 2, 4.5, 2.3);
      },
      fR: glassF("#DCEBFF"),
    });
    cyl(0, -9, 3.6, 15, 0.3, "#3A3F72", {
      noShadow: true,
      fTop: function (c, t, rx, ry) {
        c.fillStyle = "#FFD43B";
        c.font = A.font(rx * 0.9, 900);
        c.textAlign = "center";
        c.textBaseline = "middle";
        c.save();
        c.translate(t[0], t[1]);
        c.scale(1, 0.5);
        c.fillText("H", 0, 0);
        c.restore();
      },
      top: "#3A3F72",
    });
    box(-10, -1, 6, 9, 0, 9, "#E8F2FF", { fL: glassF("#DCEBFF"), fR: glassF("#DCEBFF") });
    box(10, -1, 6, 9, 0, 9, "#E8F2FF", { fL: glassF("#DCEBFF"), fR: glassF("#DCEBFF") });
    billboard(0, 2, 0.2, 9, 1.2, "SPOR HASTANESİ", "#0EA5E9", "#FFFFFF", { glow: true, posts: false });
    pool(0, 9, 7, 3.5, "#38BDF8");
    // ambulans
    box(-13, 11, 2.2, 4.4, 0.4, 2, "#FFFFFF", {
      fL: function (cc, FW, FH) { cc.fillStyle = K("#EF2D3E"); cc.fillRect(0, FH * 0.45, FW, FH * 0.15); },
      fR: function (cc, FW, FH) { cc.fillStyle = K("#EF2D3E"); cc.fillRect(0, FH * 0.45, FW, FH * 0.15); redCross(cc, FW / 2, FH * 0.25, 0.35); },
    });
    anchor({ t: "siren", x: -13, y: 2.8, z: 11 });
    tree(16, 13, 0.9);
    tree(-17, -16, 1);
  };

  /* ─────────────── MEDYA ─────────────── */

  BUILD.medya = function (lv) {
    if (lv === 0) return emptyPlot();
    if (lv === 1) {
      lawn(false);
      extBill(0, 0, 1.5, 2.6);
      body(0, function () {
        var c = G.c, P = G.P, s = G.s;
        var top = P(0, 1.6, 0);
        c.strokeStyle = NAVY;
        c.lineWidth = Math.max(G.lw, 0.14 * s);
        [[-0.7, 0.3], [0.7, 0.3], [0, -0.7]].forEach(function (q) {
          var b = P(q[0], 0, q[1]);
          c.beginPath();
          c.moveTo(b[0], b[1]);
          c.lineTo(top[0], top[1]);
          c.stroke();
        });
        A.roundRect(c, top[0] - 0.3 * s, top[1] - 1.1 * s, 0.6 * s, 1.1 * s, 0.12 * s);
        c.fillStyle = "#141043";
        c.fill();
        c.fillStyle = "#4C58C9";
        c.fillRect(top[0] - 0.22 * s, top[1] - 1 * s, 0.44 * s, 0.85 * s);
        // halka ışık
        c.beginPath();
        c.arc(top[0] + 1.4 * s, top[1] - 0.6 * s, 0.7 * s, 0, Math.PI * 2);
        c.lineWidth = 0.25 * s;
        c.strokeStyle = "#FFF6D0";
        c.stroke();
      });
      anchor({ t: "rec", x: 0.2, y: 2.9, z: 0 });
      standee(2.5, 3, kit.primary, 3, 1);
      pad(1.5, 1.5, 9, 8, PAVE, { th: 0.2, r: 3 });
      box(5, -1, 1.2, 1.2, 0, 0.8, "#3A3F72");
      cyl(5, -1, 0.5, 0.8, 1.6, "#FFD43B", { noShadow: true });
      billboard(-4, -2, 0.4, 3.4, 1.2, "VLOG", "#FF3B4E", "#FFFFFF");
      tree(-13, -12, 1);
      tree(13, 12, 0.9);
      return;
    }
    if (lv === 2) {
      lawn(false);
      [-2.2, 2.2].forEach(function (x) {
        box(x, 0, 0.3, 0.3, 0, 2.4, "#5B6385", { noShadow: true });
      });
      box(0, 0, 5.4, 0.4, 2.4, 2.6, "#1F6F3A", {
        fL: function (cc, FW, FH) {
          cc.fillStyle = K("#14532D");
          cc.fillRect(0.2, 0.2, FW - 0.4, FH - 0.4);
          ftext(cc, "EV    DEP", FW / 2, 0.7, 0.5, "#FFFFFF");
          [[1.1, "2"], [FW - 1.1, "1"]].forEach(function (q) {
            cc.fillStyle = "#141043";
            cc.fillRect(q[0] - 0.55, 1.1, 1.1, 1.2);
            ftext(cc, q[1], q[0], 1.72, 1, "#FFD43B");
          });
          ftext(cc, "–", FW / 2, 1.7, 0.9, "#FFFFFF");
        },
      });
      bench(-3, 5, true, 3);
      tree(-14, -12, 1);
      tree(14, 13, 0.9);
      return;
    }
    if (lv === 3) {
      paved();
      box(0, -3, 10, 7, 0, 3.6, "#E9ECF8", {
        fL: function (cc, FW, FH) {
          cc.fillStyle = K("#1B1648");
          cc.fillRect(0, 0.2, FW, 0.6);
          win(cc, 0.8, 1.2, 2.4, 1.3, true);
          A.roundRect(cc, FW / 2, FH - 2.4, 1.4, 2.4, 0.2);
          cc.fillStyle = K("#4A4F86");
          cc.fill();
          fsign(cc, FW / 2 + 0.7, 0.5, 5, 0.75, "BASIN ODASI", "#1B1648", "#FFD43B", true);
        },
        fR: function (cc, FW, FH) {
          win(cc, FW / 2 - 1, 1.2, 2, 1.3, false);
        },
      });
      box(0, -3, 10.4, 7.4, 3.6, 0.3, "#1B1648", { noShadow: true });
      dishS(3, -4, 5.2, 1.2, -0.6);
      bench(-4, 3.5, true, 3);
      tree(-15, -13, 1);
      tree(15, 13, 0.9);
      return;
    }
    if (lv === 4) {
      paved();
      box(-3, -3, 12, 8, 0, 4.6, "#E9ECF8", {
        fL: function (cc, FW, FH) {
          windowsGrid(cc, FW, FH, { ww: 2, wh: 1.6, top: 1.4, rows: 1, glass: "#8FD3FF" });
          fsign(cc, FW / 2, 0.55, 7, 0.8, "BASIN · YAYIN", "#1B1648", "#FFD43B", true);
        },
        fR: function (cc, FW, FH) {
          windowsGrid(cc, FW, FH, { ww: 1.8, wh: 1.6, top: 1.4, rows: 1 });
        },
      });
      box(-3, -3, 12.4, 8.4, 4.6, 0.3, "#1B1648", { noShadow: true });
      latticeS(10, -8, 14, 1.4);
      dishS(10, -8, 13, 1, -0.7);
      dishS(-6, -4, 6.4, 1, -0.4);
      busS(6, 8, true, true);
      tree(-16, 12, 1);
      tree(-16, -15, 1);
      return;
    }
    // 5: KULÜP TV — dev LED cepheli stüdyo, kafes yayın kulesi, uydu çiftliği, yayın araçları
    paved("#EEE9F8");
    box(-4, -5, 15, 10, 0, 10, "#1F2347", {
      fL: function (cc, FW, FH) {
        var g = cc.createLinearGradient(0, 0, FW, FH);
        g.addColorStop(0, TH.night > 0.3 ? lit(kit.primary, 0.15) : K(kit.primary));
        g.addColorStop(1, "#141043");
        cc.fillStyle = g;
        cc.fillRect(0.5, 1.6, FW - 1, FH - 2.2);
        ftext(cc, "ELİTLİG TV", FW / 2, 4.2, 2, "#FFFFFF", FW * 0.8);
        ftext(cc, "● CANLI", FW / 2, 6.8, 1, "#FF4D5E");
        // oyuncu silüeti
        cc.fillStyle = "rgba(255,255,255,0.18)";
        cc.beginPath();
        cc.arc(FW * 0.82, FH * 0.5, 1.1, 0, Math.PI * 2);
        cc.fill();
        cc.fillRect(FW * 0.82 - 1.2, FH * 0.5 + 1.2, 2.4, 2.5);
      },
      fR: function (cc, FW, FH) {
        windowsGrid(cc, FW, FH, { ww: 1.4, wh: 2, top: 1.2, glass: "#4C58C9" });
      },
    });
    box(-4, -5, 15.6, 10.6, 10, 0.6, kit.primary, { noShadow: true });
    anchor({ t: "rec", x: 2, y: 11.5, z: 0.5 });
    latticeS(12, -12, 30, 2);
    dishS(12, -12, 29, 1.4, -0.6);
    [[6, 2], [9, 4.5], [12, 2]].forEach(function (q, i) {
      dishS(q[0], q[1], 1.6, 1.3, -0.5 + i * 0.3);
    });
    [-10, -4].forEach(function (x) {
      box(x, 9, 2.6, 6.5, 0.5, 2.8, "#F2F4FF", {
        fL: function (cc, FW, FH) { cc.fillStyle = K(kit.primary); cc.fillRect(0, 0.9, FW, 0.5); },
        fR: function (cc, FW, FH) { cc.fillStyle = K(kit.primary); cc.fillRect(0, 0.9, FW, 0.5); ftext(cc, "TV", FW / 2, 2, 0.8, K(NAVY)); },
      });
      dishS(x, 7.5, 3.6, 0.8, -0.8);
    });
    tree(-17, -16, 1);
    tree(16, 15, 0.9);
  };

  /* ─────────────── ANTRENMAN ─────────────── */

  BUILD.antrenman = function (lv) {
    if (lv === 0) return emptyPlot();
    if (lv === 1) {
      pad(0, 0, 40, 40, "#C9A06C", { th: 0.3, side: "#946737", r: 3, fn: function (c) { var r = A.seeded(4); for (var i = 0; i < 50; i++) { c.fillStyle = r() < 0.5 ? "rgba(255,235,200,0.3)" : "rgba(110,60,30,0.18)"; c.beginPath(); c.ellipse(-19 + r() * 38, -19 + r() * 38, 0.4 + r(), 0.3 + r() * 0.5, 0, 0, Math.PI * 2); c.fill(); } } });
      for (var i = 0; i < 6; i++) cone(-7 + i * 2.6, 6);
      dome(8, -4, 0.9, 0, "#1F2347", { hk: 1.2 });
      goalS(-12, -6, 1, 2.6, 1.4, false, false);
      tree(-16, -16, 1);
      tree(16, 14, 0.9);
      return;
    }
    if (lv === 2) {
      lawn(false);
      pitchFlat(0, -2, 24, 16, "turf", 2);
      goalS(-11, -2, 1, 3.4, 1.8, true, true);
      for (var j = 0; j < 5; j++) cone(-6 + j * 3, 10);
      box(13, 10, 1.6, 0.8, 0, 1, "#3A3F72");
      tree(-16, 15, 1);
      tree(16, -16, 1);
      return;
    }
    if (lv === 3) {
      lawn(false);
      pitchFlat(2, -3, 26, 18, "turf2", 3);
      goalS(-10, -3, 1, 3.6, 1.9, true, true);
      goalS(14, -3, -1, 3.6, 1.9, true, true);
      // koordinasyon merdiveni
      flat(function () {
        topDo(0.45, function (c) {
          c.strokeStyle = K("#FFD43B");
          c.lineWidth = 0.14;
          c.strokeRect(-16, 9, 8, 1.2);
          for (var k = -15; k < -8; k += 1) {
            c.beginPath();
            c.moveTo(k, 9);
            c.lineTo(k, 10.2);
            c.stroke();
          }
        });
      });
      for (var j2 = 0; j2 < 5; j2++) cone(-4 + j2 * 3, 11);
      // manken duvarı
      for (var m = 0; m < 3; m++) standee(6 + m * 1.2, 12, "#FFD43B", m + 2, 1);
      billboard(16, 11, 0.6, 3.2, 2, "TAKTİK", "#FFFFFF", NAVY, { posts: true });
      tree(-17, 16, 0.9);
      tree(17, -17, 1);
      return;
    }
    if (lv === 4) {
      lawn(false);
      pitchFlat(-10, 0, 17, 26, "turf2", 4);
      pitchFlat(10, 0, 17, 26, "turf2", 41);
      [-10, 10].forEach(function (fx) {
        goalS(fx - 6.5, 0, 1, 3.2, 1.8, true, true);
        goalS(fx + 6.5, 0, -1, 3.2, 1.8, true, true);
      });
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (q) {
        floodS(q[0] * 19.5, q[1] * 14.5, 10, false);
      });
      for (var j3 = 0; j3 < 5; j3++) cone(-6 + j3 * 3, 16);
      return;
    }
    if (lv === 5) {
      lawn(false);
      pitchFlat(-10, 6, 17, 18, "turf2", 5);
      pitchFlat(10, 6, 17, 18, "turf2", 51);
      [-10, 10].forEach(function (fx) {
        goalS(fx - 6.5, 6, 1, 3, 1.8, true, true);
        goalS(fx + 6.5, 6, -1, 3, 1.8, true, true);
      });
      vaultX(0, -12, 30, 6, 0, "#E9EDF8", { rib: 3, cap: "#C6CAE0", capFn: function (c, a) { var p = a[Math.floor(a.length / 2)]; c.fillStyle = K(kit.primary); c.fillRect(p[0] - 30, p[1] + 10, 60, 8); } });
      billboard(0, -5.4, 0.2, 9, 1.3, "KAPALI SALON", kit.primary, kit.secondary, { posts: false, glow: true });
      [[-1, 1], [1, 1]].forEach(function (q) {
        floodS(q[0] * 19.5, 16, 10, false);
      });
      return;
    }
    // 6: PERFORMANS MERKEZİ — üç saha, tonoz çatılı cam merkez, pist, veri kulesi
    lawn(false);
    trackFlat(0, 6, 36, 14, 0.35);
    [-12.5, 0, 12.5].forEach(function (fx, i) {
      pitchFlat(fx, 6, 11.5, 15, "pro", 60 + i, 0.42);
      goalS(fx - 4.6, 6, 1, 2.6, 1.6, true, true);
      goalS(fx + 4.6, 6, -1, 2.6, 1.6, true, true);
    });
    vaultX(-3, -14, 30, 6, 0, "#3D6FB8", { rib: 2.5, lit: "#BAF3FF", cap: "#2D3270" });
    billboard(-3, -7.4, 0.2, 11, 1.3, "PERFORMANS MERKEZİ", "#141043", "#22D3EE", { posts: false, glow: true });
    box(16, -15, 5, 5, 0, 13, "#141043", {
      fL: function (cc, FW, FH) {
        for (var y = 1.5; y < FH; y += 2.6) {
          cc.fillStyle = TH.night > 0.3 ? "#22D3EE" : K("#1AB5D0");
          cc.fillRect(0, y, FW, 0.35);
        }
      },
      fR: function (cc, FW, FH) {
        for (var y = 1.5; y < FH; y += 2.6) {
          cc.fillStyle = TH.night > 0.3 ? "#22D3EE" : K("#1AB5D0");
          cc.fillRect(0, y, FW, 0.35);
        }
      },
      top: "#22D3EE",
    });
    [[-1, 1], [1, 1]].forEach(function (q) {
      floodS(q[0] * 19.8, 17.5, 12, true);
    });
  };

  /* ─────────────── AKADEMİ ─────────────── */

  BUILD.akademi = function (lv) {
    if (lv === 0) return emptyPlot();
    if (lv === 1) {
      lawn(false);
      pitchFlat(0, 2, 26, 16, "concrete", 11, 0.35);
      [-1, 1].forEach(function (s) {
        bagS(s * 11, 0, "#3B82F6");
        bagS(s * 11, 4, "#FF4D5E");
      });
      tree(-16, -15, 1);
      tree(16, -14, 0.9);
      tree(16, 15, 0.8);
      return;
    }
    if (lv === 2) {
      lawn(false);
      pitchFlat(0, 2, 26, 16, "mini", 12);
      goalS(-12, 2, 1, 3, 1.6, true, true);
      goalS(12, 2, -1, 3, 1.6, true, true);
      fenceS(0, 2, 28.5, 18.5, 1.6, "#22C55E", "NWSE");
      tree(-17, -15, 1);
      tree(17, -15, 1);
      return;
    }
    if (lv === 3) {
      lawn(false);
      pitchFlat(0, 6, 28, 16, "mini", 13);
      goalS(-13, 6, 1, 3, 1.6, true, true);
      goalS(13, 6, -1, 3, 1.6, true, true);
      gable(0, -12, 18, 7, 0, 5, 2.4, "#FFF3B0", "#2FAE4E", {
        fL: function (cc, FW, FH) {
          windowsGrid(cc, FW, FH, { ww: 1.8, wh: 1.4, gx: 1, top: 1.6, rows: 1, skip: function (r, k, R, Cn) { return k === Math.floor(Cn / 2); } });
          A.roundRect(cc, FW / 2 - 1, FH - 2.5, 2, 2.5, 0.2);
          cc.fillStyle = K("#2D3270");
          cc.fill();
          fsign(cc, FW / 2, 0.65, 6, 0.85, "AKADEMİ", "#2FAE4E", "#FFFFFF", true);
        },
      });
      tree(-17, -15, 1);
      tree(17, -15, 1);
      return;
    }
    // 4: YATILI AKADEMİ — mini stadyum (tek tribün), renkli okul, yurt kulesi, bahçe
    lawn(false);
    pitchFlat(-4, 6, 26, 16, "pro", 14, 0.42);
    goalS(-16, 6, 1, 3.6, 1.8, true, true);
    goalS(8, 6, -1, 3.6, 1.8, true, true);
    // tek kapalı tribün (sahanın arkası)
    for (var r = 0; r < 4; r++) {
      (function (r) {
        box(-4, -3 - r * 0.9, 24, 0.9, 0, (r + 1) * 0.5, "#D5D8EA", { top: dk(kit.primary, 0.3), noShadow: true, depth: -20 - r * 0.01 + 3, gloss: false });
        body(-20 - r * 0.01 + 3.001, function () {
          crowdRow(G.c, true, -15, 7, -3 - r * 0.9, (r + 1) * 0.5, 70 + r, 0.55);
        });
      })(r);
    }
    box(-4, -7, 25, 0.5, 0, 4.4, "#4A4F86", { depth: -30, noShadow: true });
    box(-4, -5.4, 25, 3.4, 3.8, 0.35, "#2FAE4E", { depth: -10, noShadow: true });
    box(-6, -15, 20, 5, 0, 6, "#FFF6D8", {
      fL: function (cc, FW, FH) {
        ["#FF8A3D", "#22C55E", "#3B82F6", "#FFD43B", "#A855F7", "#FF4D5E"].forEach(function (col, i) {
          cc.fillStyle = K(col);
          cc.fillRect(1 + i * 3.1, 1, 1.4, FH - 1.6);
        });
        fsign(cc, FW / 2, 0.55, 8, 0.8, "ELİTLİG AKADEMİ", "#2FAE4E", "#FFFFFF", true);
      },
    });
    box(-6, -15, 20.4, 5.4, 6, 0.4, "#2FAE4E", { noShadow: true });
    if (!XV.noDorm) {
      glassTower(14, -12, 7, 7, 0, 18, "#7BD3C2");
      billboard(14, -8.2, 15, 3, 1, "YURT", "#1D4ED8", "#FFFFFF", { posts: false, glow: true });
    }
    tree(13, 4, 1);
    tree(17, 10, 0.9);
    bench(15, 15, true, 3);
    tree(13, 16, 0.8);
    [[-1, -1], [1, 1]].forEach(function (q) {
      floodS(-4 + q[0] * 14.5, 6 + q[1] * 9.5, 9, false);
    });
  };

  /* ─────────────── KAMP ─────────────── */

  BUILD.kamp = function (lv) {
    if (lv === 0) return emptyPlot();
    if (lv === 1) {
      lawn(false);
      [[-6, -6, "#2FAE4E"], [0, -9, kit.primary], [6, -6, "#FF8A3D"]].forEach(function (t) {
        pyramid(t[0], t[1], 4, 4, 0, 3.2, t[2], { stripe: "#FFFFFF" });
      });
      // kamp ateşi
      [0, 1, 2, 3].forEach(function (k) {
        box(Math.cos(k) * 0.6, 2 + Math.sin(k) * 0.6, 1.4, 0.3, 0, 0.3, "#8A5426", { noShadow: true });
      });
      anchor({ t: "fire", x: 0, y: 0.6, z: 2 });
      [[-3.5, 2], [3.5, 2], [0, 5.5]].forEach(function (q) {
        box(q[0], q[1], q[0] ? 0.8 : 2.4, q[0] ? 2.4 : 0.8, 0, 0.5, "#B07A3C", { noShadow: true });
      });
      tree(-15, -14, 1.1);
      tree(14, -15, 1);
      tree(-15, 12, 0.9);
      tree(15, 13, 1);
      return;
    }
    if (lv === 2) {
      lawn();
      gable(0, -4, 13, 8, 0, 4.4, 2.6, "#F6D7A8", "#B5523A", {
        fL: function (cc, FW, FH) {
          cc.strokeStyle = rgba("#8A5426", 0.35);
          cc.lineWidth = 0.08;
          for (var y = 0.4; y < FH; y += 0.4) {
            cc.beginPath();
            cc.moveTo(0, y);
            cc.lineTo(FW, y);
            cc.stroke();
          }
          windowsGrid(cc, FW, FH, { ww: 1.6, wh: 1.4, gx: 1.4, top: 1, rows: 1, skip: function (r, k, R, Cn) { return k === Math.floor(Cn / 2); } });
          A.roundRect(cc, FW / 2 - 0.9, FH - 2.5, 1.8, 2.5, 0.2);
          cc.fillStyle = K("#6B3A1E");
          cc.fill();
          fsign(cc, FW / 2, 0.5, 5, 0.75, "PANSİYON", "#9A3412", "#FFFFFF", true);
        },
      });
      box(0, 1.2, 13, 2, 0, 0.4, "#C98A4B", { noShadow: true });
      [-4, 4].forEach(function (x) {
        bush(x, 3, 0.7, "#FF7AA8");
      });
      table(7, 8);
      tree(-16, -15, 1);
      tree(16, -14, 1);
      tree(-15, 13, 0.9);
      return;
    }
    if (lv === 3) {
      lawn();
      gable(0, -5, 16, 9, 0, 6.6, 3, "#FFE7B8", "#9A4B2A", {
        fL: function (cc, FW, FH) {
          windowsGrid(cc, FW, FH, { ww: 1.6, wh: 1.4, gx: 1.4, gy: 1.6, top: 0.9, skip: function (r, k, R, Cn) { return r === R - 1 && k === Math.floor(Cn / 2); } });
          A.roundRect(cc, FW / 2 - 1, FH - 2.5, 2, 2.5, 0.2);
          cc.fillStyle = K("#6B3A1E");
          cc.fill();
          fsign(cc, FW / 2, 3.5, 5, 0.8, "KAMP EVİ", "#9A3412", "#FFFFFF", true);
        },
        fR: function (cc, FW, FH) {
          windowsGrid(cc, FW, FH, { ww: 1.4, wh: 1.4, gy: 1.6, top: 0.9 });
        },
      });
      // barbekü + piknik masaları
      box(9, 4, 1.6, 1, 0, 1.1, "#3A3F72");
      anchor({ t: "steam", x: 9, y: 1.6, z: 4 });
      box(-6, 6, 4, 1.6, 0.7, 0.2, "#C98A4B");
      box(-6, 6, 4, 0.5, 0, 0.7, "#8A5426", { noShadow: true, depth: -0.1 });
      box(2, 8, 4, 1.6, 0.7, 0.2, "#C98A4B");
      box(2, 8, 4, 0.5, 0, 0.7, "#8A5426", { noShadow: true, depth: 9.9 });
      tree(-16, -15, 1.1);
      tree(16, -14, 1);
      tree(-16, 14, 0.9);
      tree(16, 14, 0.9);
      return;
    }
    if (lv === 4) {
      paved();
      box(0, -6, 22, 9, 0, 13, "#F7F5FF", {
        fL: function (cc, FW, FH) {
          for (var f = 0; f < 4; f++) {
            cc.fillStyle = K("#D9DCEE");
            cc.fillRect(0, f * 3.2 + 2.6, FW, 0.35);
          }
          windowsGrid(cc, FW, FH, { ww: 1.8, wh: 1.8, gx: 0.8, gy: 1.4, top: 0.7, bot: 0.4 });
          fsign(cc, FW / 2, FH - 0.7, 7, 1, "KAMP OTELİ", "#0F766E", "#FFFFFF", true);
        },
        fR: function (cc, FW, FH) {
          windowsGrid(cc, FW, FH, { ww: 1.6, wh: 1.8, gy: 1.4, top: 0.7 });
        },
      });
      box(0, -6, 22.6, 9.6, 13, 0.6, "#0F766E", { noShadow: true });
      pool(0, 7, 10, 5, "#2FD3F5");
      [-8, 8].forEach(function (x) {
        tree(x, 8, 0.9);
      });
      tree(-17, -16, 1);
      return;
    }
    // 5: 5 YILDIZLI RESORT — U biçimli otel, sonsuzluk havuzu, palmiyeler, helikopter pisti
    paved("#F6F0E6");
    var hotelF = function (cc, FW, FH) {
      for (var f = 0; f < Math.floor(FH / 3); f++) {
        cc.fillStyle = K("#FFFFFF");
        cc.fillRect(0, f * 3 + 2.4, FW, 0.4);
      }
      windowsGrid(cc, FW, FH, { ww: 1.6, wh: 1.7, gx: 0.6, gy: 1.3, top: 0.6, bot: 0.4, glass: "#7FD6E0" });
    };
    box(0, -14, 30, 7, 0, 18, "#FFF6E6", { fL: hotelF, fR: hotelF });
    box(0, -14, 30.6, 7.6, 18, 0.6, "#0F766E", { noShadow: true });
    cyl(4, -14, 2.6, 18.6, 0.2, "#3A3F72", { noShadow: true, top: "#3A3F72", fTop: function (c, t, rx) { c.strokeStyle = "#FFD43B"; c.lineWidth = rx * 0.08; c.beginPath(); c.ellipse(t[0], t[1], rx * 0.7, rx * 0.35, 0, 0, Math.PI * 2); c.stroke(); } });
    box(-12, -2, 7, 16, 0, 12, "#FFF6E6", { fL: hotelF, fR: hotelF });
    box(12, -2, 7, 16, 0, 12, "#FFF6E6", { fL: hotelF, fR: hotelF });
    box(-12, -2, 7.6, 16.6, 12, 0.6, "#0F766E", { noShadow: true });
    box(12, -2, 7.6, 16.6, 12, 0.6, "#0F766E", { noShadow: true });
    billboard(0, -10.3, 13, 12, 1.6, "ELİTLİG RESORT ★★★★★", "#0F766E", "#FFFFFF", { posts: false, glow: true });
    pool(0, 1, 13, 10, "#21D4F0", { depth: -30 });
    [-4, 0, 4].forEach(function (x) {
      box(x, 9, 1, 2.4, 0, 0.5, "#FFFFFF");
      umbrella(x + 1.4, 9.5, 2.4, 1.3, "#FF8A3D", "#FFFFFF");
    });
    palm(-17, 12, 1);
    palm(17, 12, 1);
    palm(-17, -3, 0.9);
    palm(17, -3, 0.9);
  };

  /* ─────────────── ULAŞIM ─────────────── */

  function parkingLines(x0, z0, n, gap, len) {
    flat(function () {
      topDo(0.36, function (c) {
        c.strokeStyle = TH.night > 0.5 ? "#C9CFF0" : "#FFFFFF";
        c.lineWidth = 0.15;
        for (var i = 0; i <= n; i++) {
          c.beginPath();
          c.moveTo(x0 + i * gap, z0);
          c.lineTo(x0 + i * gap, z0 + len);
          c.stroke();
        }
      });
    });
  }
  function busShelter(x, z) {
    box(x, z, 4, 1.6, 0, 0.3, "#C6CAE0", { noShadow: true });
    box(x, z - 0.7, 4, 0.15, 0.3, 2.2, "#BFE6FF", { alpha: 0.75, noShadow: true });
    box(x, z, 4.4, 2, 2.5, 0.25, kit.primary);
    bench(x, z - 0.2, true, 3, "#5B6385");
  }
  BUILD.ulasim = function (lv) {
    if (lv === 0) return emptyPlot();
    if (lv === 1) {
      lawn(false);
      pad(0, 0, 10, 4, PAVE, { th: 0.32, fn: tiles(1), r: 1 });
      box(0, -0.6, 8, 0.2, 0, 0.9, "#9AA3C7", { noShadow: true });
      ["#FF4D5E", "#3B82F6", "#22C55E", "#FFD43B", kit.primary].forEach(function (col, i) {
        bikeS(-3.2 + i * 1.6, 0.2, col);
      });
      tree(-14, -12, 1);
      tree(14, 12, 0.9);
      tree(14, -13, 0.8);
      return;
    }
    if (lv === 2) {
      lawn(false);
      pad(0, -1, 24, 16, "#CDBFA6", { th: 0.3, r: 2 });
      carS(-7, -3, false, CAR_COLS[0]);
      carS(-1, -3, false, CAR_COLS[1]);
      carS(5, -3, false, CAR_COLS[2]);
      box(-3, 9, 6, 0.2, 0, 0.9, "#9AA3C7", { noShadow: true });
      bikeS(-4, 9.6, "#FF4D5E");
      bikeS(-2, 9.6, "#3B82F6");
      tree(-16, -15, 1);
      tree(16, 14, 0.9);
      return;
    }
    if (lv === 3) {
      paved("#5A6285");
      parkingLines(-13, -12, 6, 3.6, 6);
      carS(-11.2, -9, false, CAR_COLS[3]);
      carS(-4, -9, false, CAR_COLS[0]);
      carS(3.2, -9, false, CAR_COLS[4]);
      busS(-2, 6, true, true);
      busShelter(9, 9);
      billboard(14, 4, 2, 3, 1, "DURAK", "#2563EB", "#FFFFFF");
      tree(-17, 16, 0.9);
      return;
    }
    if (lv === 4) {
      paved("#4E5679");
      parkingLines(-17, -16, 9, 3.6, 6);
      parkingLines(-17, -4, 9, 3.6, 6);
      [0, 1, 3, 5, 6, 8].forEach(function (i, k) {
        carS(-15.2 + i * 3.6, -13, false, CAR_COLS[k % CAR_COLS.length]);
      });
      [0, 2, 4, 7].forEach(function (i, k) {
        carS(-15.2 + i * 3.6, -1, false, CAR_COLS[(k + 3) % CAR_COLS.length]);
      });
      busShelter(6, 12);
      box(12, 12, 1, 0.8, 0, 1.8, kit.primary, { fL: function (cc, FW, FH) { cc.fillStyle = "#8FD3FF"; cc.fillRect(0.15, 0.3, FW - 0.3, 0.6); } });
      tree(-17, 14, 0.9);
      return;
    }
    if (lv === 5) {
      paved("#4E5679");
      // terminal kanopisi
      box(0, -6, 30, 8, 5.5, 0.5, "#F2F4FF", { depth: -7, fL: function (cc, FW, FH) { cc.fillStyle = K(kit.primary); cc.fillRect(0, 0, FW, FH); } });
      [-13, -4.5, 4.5, 13].forEach(function (x) {
        box(x, -2.4, 0.4, 0.4, 0, 5.5, "#9AA3C7", { noShadow: true, depth: -7.1 });
      });
      box(0, -6, 30, 7, 0, 0.3, "#C6CAE0", { noShadow: true, depth: -20 });
      busS(-7, 1, true);
      busS(7, 1, true);
      billboard(0, -2.2, 6, 10, 1.2, "OTOBÜS TERMİNALİ", kit.primary, kit.secondary, { posts: false, glow: true });
      busShelter(-8, 11);
      busShelter(8, 11);
      tree(-17, 16, 0.9);
      tree(17, 16, 0.9);
      return;
    }
    // 6: METRO İSTASYONU — tonoz cam istasyon, M totemi, yürüyen merdiven, katlı otopark
    paved("#E7E2F3");
    vaultX(-5, -6, 24, 5.5, 0, "#9FD8FF", { alpha: 0.9, rib: 2, lit: "#FFF2C4", cap: "#7CC7FF" });
    box(-5, -6, 24, 11, 0, 0.8, "#E9ECF8", { noShadow: true, depth: -12 });
    billboard(-5, 0.6, 0.6, 10, 1.3, "STADYUM İSTASYONU", "#DC2626", "#FFFFFF", { posts: false, glow: true });
    // yürüyen merdiven girişi
    box(-5, 5, 5, 6, 0, 0.6, "#C6CAE0");
    box(-5, 4, 5.4, 3, 3, 0.3, "#F2F4FF");
    // M totemi
    box(10, 5, 0.5, 0.5, 0, 6, "#9AA3C7", { noShadow: true });
    extBill(10, 5, 2, 9);
    body(10.5, function () {
      var c = G.c, p = G.P(10, 7.4, 5), s = G.s;
      c.beginPath();
      c.arc(p[0], p[1], 1.4 * s, 0, Math.PI * 2);
      c.fillStyle = TH.night > 0.3 ? "#FF3B4E" : K("#DC2626");
      c.fill();
      outline(c);
      c.fillStyle = "#FFFFFF";
      c.font = A.font(1.9 * s, 900);
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillText("M", p[0], p[1] + 0.1 * s);
    });
    anchor({ t: "glow", x: 10, y: 7.4, z: 5, col: "#FF3B4E" });
    // katlı otopark
    for (var f = 0; f < 3; f++) {
      box(12, -10, 10, 10, f * 3, 0.4, "#C6CAE0", { depth: -10 + f * 0.1 });
      if (f < 2)
        [-2.6, 0, 2.6].forEach(function (x, i) {
          if ((f + i) % 3 === 2) return;
          box(12 + x, -10, 1.8, 3.6, f * 3 + 0.4, 1.2, CAR_COLS[(f * 3 + i) % CAR_COLS.length], { noShadow: true, depth: -10 + f * 0.1 + 0.01 });
        });
    }
    box(12, -10, 10.4, 10.4, 9, 0.7, kit.primary, { depth: -9, fL: function (cc, FW, FH) { ftext(cc, "P", FW / 2, FH / 2, 0.7, "#FFFFFF"); } });
    [[-1, -1], [1, 1], [-1, 1], [1, -1]].forEach(function (q) {
      box(12 + q[0] * 4.7, -10 + q[1] * 4.7, 0.5, 0.5, 0, 9, "#9AA3C7", { noShadow: true, depth: -10 + (q[0] + q[1]) * 4.7 });
    });
    busS(4, 13, true);
    tree(-17, 16, 0.9);
  };

  /* ═══════════════════════ çizgi film futbolcu (Savunma Hattı ile aynı) ═══════════════════════ */
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
  function drawGuy(c, x, y, s, o) {
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


  /* ═══════════════════════ KULÜP ŞEHRİ 2.0: binalar ═══════════════════════
   * 12 bina, toplam 137 aşama (elitlig-server constants/city2.js, Şehir 2.1). Her aşama
   * ayrı bir görünüm; eski birim kurucuları uygun düştüğü aşamalarda yeniden
   * kullanılır (XV bayraklarıyla küçük farklar), aradaki aşamalar yeni çizim.
   * Halısaha iki hücreye yayılır: A (sahalar) ve B (salonlar, 7. aşamadan). */

  var XV = {};
  function oldB(k, lv, flags) {
    var prev = XV;
    XV = flags || {};
    try {
      BUILD[k](lv);
    } finally {
      XV = prev;
    }
  }
  /** Kilitli arsa: sakin, soluk çim; ip çit; asma kilitli küçük tabela. */
  function closedPlot(opens, S) {
    S = S || 40;
    var h = S / 2;
    pad(0, 0, S, S, "#A9C79A", {
      th: 0.25,
      side: "#7E9B73",
      r: 2.5,
      line: 0.35,
      fn: function (c) {
        var r = A.seeded(13);
        for (var i = 0; i < 30; i++) {
          c.fillStyle = r() < 0.5 ? "rgba(255,255,255,0.12)" : "rgba(60,90,50,0.1)";
          c.beginPath();
          c.ellipse(-h + r() * S, -h + r() * S, 0.6 + r() * 1, 0.3 + r() * 0.5, 0, 0, Math.PI * 2);
          c.fill();
        }
      },
    });
    // alçak direkler + ip
    var posts = [];
    var n = Math.round(S / 5);
    for (var i = 0; i <= n; i++) {
      var t = -h + 1 + ((S - 2) * i) / n;
      posts.push([t, -h + 1], [-h + 1, t]);
      if (i) posts.push([t, h - 1], [h - 1, t]);
    }
    posts.forEach(function (q) {
      box(q[0], q[1], 0.3, 0.3, 0, 0.9, "#C9CDE2", { noShadow: true, gloss: false, noLine: true });
    });
    flat(function () {
      topDo(0.75, function (c) {
        c.strokeStyle = K("#E9ECF8");
        c.lineWidth = 0.12;
        c.strokeRect(-h + 1, -h + 1, S - 2, S - 2);
      });
    });
    tree(-h + 4, -h + 5, 0.8, "#7FBF6A");
    tree(h - 5, -h + 4, 0.7, "#7FBF6A");
    lockSign(3, 6, opens);
  }
  /** Asma kilit + "N. BASAMAK" tabelası (direkli). */
  function lockSign(x, z, opens) {
    box(x - 2.4, z, 0.3, 0.3, 0, 1.8, "#8A90B5", { noShadow: true, gloss: false });
    box(x + 2.4, z, 0.3, 0.3, 0, 1.8, "#8A90B5", { noShadow: true, gloss: false });
    box(x, z, opens ? 7.4 : 2.6, 0.3, 1.6, 2.2, "#3A3F72", {
      noShadow: true,
      gloss: false,
      fL: function (cc, FW, FH) {
        A.roundRect(cc, 0.1, 0.1, FW - 0.2, FH - 0.2, 0.3);
        cc.fillStyle = K("#2B2F5E");
        cc.fill();
        // kilit
        var lx = opens ? 1.2 : FW / 2, ly = FH / 2 + 0.2;
        cc.strokeStyle = "#FFFFFF";
        cc.lineWidth = 0.16;
        cc.beginPath();
        cc.arc(lx, ly - 0.4, 0.32, Math.PI, 0);
        cc.stroke();
        cc.fillStyle = "#FFFFFF";
        A.roundRect(cc, lx - 0.48, ly - 0.4, 0.96, 0.76, 0.12);
        cc.fill();
        if (opens) ftext(cc, opens + ". BASAMAK", FW / 2 + 0.7, FH / 2, 0.9, "#FFFFFF", FW - 2.6);
      },
    });
  }
  /** Ortak: bir halısaha (saha + kaleler + çit + isteğe bağlı ışık). */
  function fiveSide(x, z, w, d, style, o) {
    o = o || {};
    pitchFlat(x, z, w, d, style, o.seed || 3, o.y || 0.4);
    var gw = o.gw || 3, gh = o.gh || 1.7;
    goalS(x - w / 2 + 0.5, z, 1, gw, gh, o.white !== false, o.net !== false);
    goalS(x + w / 2 - 0.5, z, -1, gw, gh, o.white !== false, o.net !== false);
    if (o.fence) fenceS(x, z, w + 2.4, d + 2.4, o.fh || 3.2, o.fcol || "#1F9D55", o.sides || "NWSE");
    if (o.flood)
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (q) {
        floodS(x + q[0] * (w / 2 + 1.6), z + q[1] * (d / 2 + 1.6), o.fl || 8, false);
      });
  }
  function signFace(text, bg, fg, v, wk, hk) {
    return function (cc, FW, FH) {
      fsign(cc, FW / 2, v == null ? 0.6 : v, Math.min(FW - 0.6, (wk || 0.8) * FW), hk || 0.8, text, bg, fg || "#FFFFFF", true);
    };
  }
  function both(a, b) {
    return function (cc, FW, FH) {
      a(cc, FW, FH);
      b(cc, FW, FH);
    };
  }
  function winFace(o) {
    return function (cc, FW, FH) {
      windowsGrid(cc, FW, FH, o || {});
    };
  }
  /** Düz çatı kenarı (parapet). */
  function roofCap(x, z, w, d, y, col) {
    box(x, z, w + 0.5, d + 0.5, y, 0.45, col || "#E3E6F4", { noShadow: true, depth: x + z + 0.02 });
  }
  /** Ekrana dönük küresel dünya (scout merkezi). */
  function globeS(x, z, y, r) {
    extBill(x, z, r * 1.6, y + r * 2.2);
    shadowEllipse(x, z, r * 0.9, y + r);
    body(x + z + 0.4, function () {
      var c = G.c, p = G.P(x, y + r * 1.05, z), R = r * G.s * 1.35;
      var g = c.createRadialGradient(p[0] - R * 0.35, p[1] - R * 0.35, R * 0.1, p[0], p[1], R);
      g.addColorStop(0, K("#7FD3FF"));
      g.addColorStop(1, K("#1D6FD8"));
      c.beginPath();
      c.arc(p[0], p[1], R, 0, Math.PI * 2);
      c.fillStyle = g;
      c.fill();
      c.save();
      c.clip();
      c.fillStyle = K("#4CC86A");
      [[-0.35, -0.3, 0.38, 0.22], [0.2, -0.05, 0.3, 0.42], [-0.15, 0.45, 0.25, 0.15], [0.55, -0.45, 0.2, 0.15]].forEach(function (q) {
        c.beginPath();
        c.ellipse(p[0] + q[0] * R, p[1] + q[1] * R, q[2] * R, q[3] * R, 0.4, 0, Math.PI * 2);
        c.fill();
      });
      c.strokeStyle = "rgba(255,255,255,0.55)";
      c.lineWidth = Math.max(0.6, R * 0.04);
      for (var i = -2; i <= 2; i++) {
        c.beginPath();
        c.ellipse(p[0], p[1], Math.abs(i) * R * 0.33 + 0.01, R, 0, 0, Math.PI * 2);
        c.stroke();
        c.beginPath();
        c.moveTo(p[0] - R, p[1] + i * R * 0.38);
        c.lineTo(p[0] + R, p[1] + i * R * 0.38);
        c.stroke();
      }
      c.restore();
      c.beginPath();
      c.arc(p[0], p[1], R, 0, Math.PI * 2);
      outline(c, G.lw * 0.8);
      // halka
      c.beginPath();
      c.ellipse(p[0], p[1], R * 1.3, R * 0.42, -0.35, 0, Math.PI * 2);
      c.strokeStyle = K("#FFD43B");
      c.lineWidth = Math.max(1, R * 0.08);
      c.stroke();
    });
    cyl(x, z, r * 0.7, 0, y, "#E3E6F4", { noShadow: true });
  }

  /* ─────────────── HALISAHA ─────────────── */

  var HS = { w: 16, d: 10, p: [[-10, -12.2], [-10, 0.6], [-10, 13.4]], t: [11.5, 11.5] };
  /** A hücresinin içeriği hangi aşamada değişir (7'de yalnız B değişir). */
  function hsEffA(st) {
    return st === 7 ? 6 : st;
  }
  /** B hücresi 7'de açılır; 11'de (kampüs A'da büyür) değişmez. */
  function hsEffB(st) {
    return st < 7 ? 0 : st === 11 ? 10 : st;
  }
  /** Şehir 2.1 aşaması → eski (12 aşamalı) çizim sırası: 11 kampüs araya girdi, 14 yeni. */
  function hsOld(st) {
    return st <= 10 ? st : st === 11 ? 10 : st === 12 ? 11 : 12;
  }
  function hsA(st) {
    var camp = st >= 11, nat = st >= 14;
    st = hsOld(st);
    if (st <= 1) {
      // BOŞ ARSA: tozlu toprak, taşlardan kaleler
      pad(0, 0, 40, 40, "#D8B07A", {
        th: 0.25,
        side: "#A57A48",
        r: 3,
        line: 0.4,
        fn: function (c) {
          var r = A.seeded(21);
          for (var i = 0; i < 60; i++) {
            c.fillStyle = r() < 0.5 ? "rgba(255,240,210,0.35)" : "rgba(120,80,40,0.16)";
            c.beginPath();
            c.ellipse(-20 + r() * 40, -20 + r() * 40, 0.5 + r() * 1.3, 0.3 + r() * 0.6, r() * 3, 0, Math.PI * 2);
            c.fill();
          }
          c.fillStyle = "rgba(110,170,80,0.55)";
          for (var j = 0; j < 26; j++) {
            c.beginPath();
            c.ellipse(-20 + r() * 40, (r() < 0.5 ? -19 : 15) + r() * 4, 0.9, 0.5, 0, 0, Math.PI * 2);
            c.fill();
          }
        },
      });
      [-1, 1].forEach(function (s) {
        [-1.5, 1.5].forEach(function (q) {
          box(s * 8, q, 0.8, 0.8, 0, 0.55, "#A3A8BC");
        });
        bagS(s * 9.6, 3.2, s > 0 ? "#3B82F6" : "#FF4D5E");
      });
      box(-12, 9, 1.4, 1.4, 0, 0.5, "#4A4F86", { top: "#2B2F5E" }); // eski lastik
      tree(-15, -14, 1.2);
      tree(-17, 13, 0.9);
      tree(15, -15, 1);
      bush(14, 13, 1.2);
      bush(-4, -16, 0.9);
      return;
    }
    if (st === 2) {
      // TOPRAK SAHA: kireç çizgiler, demir kaleler
      lawn();
      fiveSide(-1, -1, 24, 15, "dirt", { gw: 3.4, gh: 1.9, net: false, seed: 4 });
      bench(-1, -11, true, 5, "#B9783E");
      cyl(15, -12, 1.2, 0, 2.8, "#C9CDE2", { top: "#A9AEC6" }); // su deposu
      box(15, -12, 0.3, 0.3, 0, 0.5, "#5B6385", { noShadow: true });
      tree(-15, -15, 1.1);
      tree(16, 14, 0.9);
      tree(-16, 14, 0.8);
      bikeS(14, 6, "#FF4D5E");
      return;
    }
    // 3+: sentetik çim sahalar (tel kafes), soldan sağa büyüyen tesis
    var style = st >= 11 ? "hybrid" : "turf";
    pad(0, 0, 42, 42, "#E4E8EF", { fn: tiles(2.2, "rgba(27,22,72,0.07)"), th: 0.3, side: "#AEB4C8", r: 3 });
    var n = st >= 9 ? 3 : st >= 6 ? 2 : 1;
    for (var i = 0; i < n; i++) {
      fiveSide(HS.p[i][0], HS.p[i][1], HS.w, HS.d, style, { fence: true, sides: i ? "WSE" : "NWSE", seed: 5 + i });
    }
    if (st >= 4) {
      // projektörler yalnız dış köşelerde ve ilk iki saha arasında (sade)
      var fz = [HS.p[0][1] - HS.d / 2 - 1.2];
      if (n >= 2) fz.push((HS.p[0][1] + HS.p[1][1]) / 2);
      fz.push(HS.p[n - 1][1] + HS.d / 2 + 1.2);
      fz.forEach(function (z) {
        [-1, 1].forEach(function (sx) {
          floodS(HS.p[0][0] + sx * (HS.w / 2 + 1.4), z, 8, false);
        });
      });
    }
    // sağ sütun
    if (st >= 12) {
      // KOMPLEKS OTELİ: alt katta soyunma
      box(12.5, -12, 11, 10, 0, 17, "#F6F3FF", {
        fL: both(winFace({ ww: 1.4, wh: 1.4, gx: 0.9, gy: 1.3, top: 1, bot: 3, glass: "#8FD3FF" }), function (cc, FW, FH) {
          cc.fillStyle = K(kit.primary);
          cc.fillRect(0, FH - 2.6, FW, 0.5);
          fsign(cc, FW / 2, FH - 1.3, 8, 0.9, "KOMPLEKS OTEL", kit.primary, kit.secondary, true);
        }),
        fR: winFace({ ww: 1.4, wh: 1.4, gx: 0.9, gy: 1.3, top: 1, bot: 3, glass: "#8FD3FF" }),
      });
      roofCap(12.5, -12, 11, 10, 17, "#E3E6F4");
      if (nat) {
        // ULUSAL MERKEZ: çatıda ay yıldızlı bayrak, cephede kırmızı-beyaz şerit
        box(12.5, -6.9, 11.2, 0.3, 13.4, 1.4, "#E30A17", { noShadow: true, fL: signFace("ULUSAL MERKEZ", "#E30A17", "#FFFFFF", 0.7, 0.9, 1) });
        turkFlag(9, -14, 24);
      } else crestS(12.5, -12, 18.6, 1.4);
    } else if (camp) {
      // SPORCU YURDU (kampüs): üç katlı, balkonlu
      box(12.5, -12, 11, 9, 0, 9.6, "#FFF4E2", {
        fL: both(winFace({ ww: 1.3, wh: 1.3, gx: 0.9, gy: 1.6, top: 1.6, bot: 0.6, glass: "#8FD3FF" }), signFace("SPORCU YURDU", "#16A34A", "#FFFFFF", 0.65, 0.85, 0.8)),
        fR: winFace({ ww: 1.3, wh: 1.3, gx: 0.9, gy: 1.6, top: 1.6, bot: 0.6, glass: "#8FD3FF" }),
      });
      for (var bf = 0; bf < 2; bf++) box(12.5, -7.2, 11, 0.8, 3.4 + bf * 2.9, 0.2, "#16A34A", { noShadow: true, depth: 5.4 + bf * 0.01 });
      roofCap(12.5, -12, 11, 9, 9.6, "#16A34A");
      [[9, -14.5], [15, -14.5]].forEach(function (q) {
        box(q[0], q[1], 2.4, 1.6, 10, 0.9, "#9FD8FF", { noShadow: true, depth: 30 });
      });
    } else if (st >= 5) {
      // SOYUNMA + DUŞ
      box(12.5, -12, 10, 8, 0, 3.6, "#FFF1DE", {
        fL: function (cc, FW, FH) {
          windowsGrid(cc, FW, FH, { ww: 1.4, wh: 0.9, gx: 1, top: 0.6, rows: 1, skip: function (r, k, R, Cn) { return k === Math.floor(Cn / 2); } });
          A.roundRect(cc, FW / 2 - 0.8, FH - 2.2, 1.6, 2.2, 0.2);
          cc.fillStyle = K("#4A4F86");
          cc.fill();
          fsign(cc, FW / 2, FH - 2.75, 6.2, 0.75, "SOYUNMA · DUŞ", kit.primary, kit.secondary, true);
        },
        fR: winFace({ ww: 1.2, wh: 0.9, top: 0.6, rows: 1 }),
      });
      roofCap(12.5, -12, 10, 8, 3.6, "#E0D2B8");
      [[10, -14], [14, -14]].forEach(function (q) {
        cyl(q[0], q[1], 0.45, 4, 1.2, "#A9AEC6", { noShadow: true });
        anchor({ t: "steam", x: q[0], y: 5.4, z: q[1] });
      });
    } else {
      // giriş kulübesi
      box(12, -13, 4.5, 3.5, 0, 2.6, "#FFFFFF", {
        fL: signFace("HALI SAHA", "#16A34A", "#FFFFFF", 0.55, 0.95, 0.75),
        fR: function (cc, FW, FH) {
          win(cc, FW / 2 - 0.8, 0.9, 1.6, 1, true);
        },
      });
      roofCap(12, -13, 4.5, 3.5, 2.6, "#16A34A");
      tree(16, -4, 0.9);
    }
    if (st >= 11) {
      // KAFE-RESTORAN (sahaya bakan teras)
      box(13, 1.5, 12, 8, 0, 4.2, "#2A2F55", {
        fL: winFace({ ww: 1.6, wh: 2.4, gx: 0.6, top: 1.2, rows: 1, glass: "#FFD98A", litK: 1 }),
        fR: winFace({ ww: 1.4, wh: 2.4, top: 1.2, rows: 1, glass: "#FFD98A", litK: 1 }),
      });
      box(13, 1.5, 12.6, 8.6, 4.2, 0.4, "#B45309", { noShadow: true });
      billboard(13, 6, 0.2, 7, 1, "KAFE · RESTORAN", "#B45309", "#FFFFFF", { posts: false, glow: true });
      [9.5, 13, 16.5].forEach(function (x, i) {
        table(x, 8.5);
        umbrella(x, 8.5, 2.4, 1.5, i % 2 ? kit.primary : "#FFFFFF", i % 2 ? "#FFFFFF" : kit.primary);
      });
    } else if (st >= 6) {
      // ÇAY OCAĞI
      box(12, 0, 5, 4, 0, 2.6, "#E8C79A", {
        fL: function (cc, FW, FH) {
          A.roundRect(cc, 0.6, 0.7, FW - 1.2, 1.1, 0.15);
          cc.fillStyle = K("#7A3E10");
          cc.fill();
          fsign(cc, FW / 2, 0.45, 3.8, 0.6, "ÇAY OCAĞI", "#9A3412", "#FFFFFF", true);
        },
      });
      roofCap(12, 0, 5, 4, 2.6, "#9A3412");
      cyl(13.4, -1, 0.3, 2.9, 1.2, "#5B6385", { noShadow: true });
      anchor({ t: "steam", x: 13.4, y: 4.3, z: -1 });
      table(10.5, 5);
      table(14.5, 5.5);
      umbrella(12.5, 6.5, 2.4, 1.6, "#FFFFFF", "#E2574C");
    }
    if (st >= 12 || camp) {
      // PERFORMANS LAB (camdan küp)
      box(13.5, 15, 8, 7, 0, 6, "#BFF3FF", {
        rawL: null,
        fL: both(winFace({ ww: 1.6, wh: 1.6, gx: 0.4, gy: 0.6, top: 0.5, bot: 0.4, glass: "#7FE3FF", litK: 0.9 }), signFace("PERFORMANS LAB", "#141043", "#22D3EE", 0.55, 0.95, 0.75)),
        fR: winFace({ ww: 1.6, wh: 1.6, gx: 0.4, gy: 0.6, top: 0.5, bot: 0.4, glass: "#7FE3FF", litK: 0.9 }),
      });
      roofCap(13.5, 15, 8, 7, 6, "#E3E6F4");
      dishS(15, 14, 6.6, 0.7, -0.6);
    } else if (st >= 11) {
      // FİZYO
      box(13.5, 15, 8, 6, 0, 3.4, "#FFFFFF", {
        fL: function (cc, FW, FH) {
          windowsGrid(cc, FW, FH, { ww: 1.3, wh: 1, gx: 1, top: 1.4, rows: 1 });
          redCross(cc, 0.9, 0.75, 0.45);
          fsign(cc, FW / 2 + 0.6, 0.6, 4.5, 0.7, "FİZYO", "#0EA5E9", "#FFFFFF", true);
        },
      });
      roofCap(13.5, 15, 8, 6, 3.4, "#0EA5E9");
    } else {
      // bisiklet parkı + ağaçlar
      bikeS(10, 13, "#3B82F6");
      bikeS(11.4, 13.4, "#FF4D5E");
      bikeS(12.8, 13.8, "#22C55E");
      tree(16, 16, 1);
      tree(17, 10, 0.8);
    }
    if (n < 3) {
      tree(-17, 17, 0.9);
      tree(-8, 18, 0.8);
      bench(-12, 16, true, 3);
    }
    if (st >= 8 && !nat) {
      // ANTRENMAN TESİSİ: koridorda savunma duvarı mankenleri + koni slalomu
      [1.6, 2.8, 4, 5.2].forEach(function (x) {
        box(x, 6, 0.8, 0.4, 0, 1.8, "#FFD43B", { noShadow: true, top: "#F59E0B" });
      });
      [1, 2.6, 4.2, 5.8].forEach(function (x, i) {
        cone(x, 11.5 + (i % 2) * 0.8);
      });
    }
    if (st >= 10 && !nat)
      // TURNUVA: yol kenarında turnuva panosu
      billboard(3.4, 15.6, 0.6, 5, 1.3, "TURNUVA", "#141043", "#FFD43B", { glow: true });
    if (camp && !nat) {
      // kampüs kapısı + çim bakım aracı
      [-1, 1].forEach(function (sx) {
        box(4 + sx * 3.2, 19, 0.6, 0.6, 0, 4.2, "#E3E6F4", { noShadow: true });
      });
      box(4, 19, 7.6, 0.6, 4.2, 1.2, "#16A34A", { noShadow: true, fL: signFace("FUTBOL KAMPÜSÜ", "#16A34A", "#FFFFFF", 0.6, 0.95, 0.9) });
      box(3, 8.5, 2.2, 1.4, 0, 1.1, "#F59E0B", { noShadow: true, fL: function (cc, FW, FH) { cc.fillStyle = K("#3A3F72"); cc.fillRect(0.3, 0.2, 0.8, 0.5); } });
    }
    if (nat) {
      // ULUSAL FUTBOL MERKEZİ: kırmızı kapı, ay yıldızlı bayrak sırası, şeref salonu
      [-1, 1].forEach(function (sx) {
        box(4 + sx * 3.6, 19, 0.8, 0.8, 0, 5, "#FFFFFF", { noShadow: true });
      });
      box(4, 19, 8.6, 0.8, 5, 1.4, "#E30A17", { noShadow: true, fL: signFace("ULUSAL FUTBOL MERKEZİ", "#E30A17", "#FFFFFF", 0.7, 0.95, 1) });
      [-0.5, 3.5, 7.5].forEach(function (x) {
        turkFlag(x - 9, 19.5, 9);
      });
      box(3, 8.5, 5, 4, 0, 3.4, "#FFF7E0", {
        fL: function (cc, FW, FH) {
          for (var i = 0; i < 3; i++) shirtAt(cc, 0.9 + i * 1.6, 1.9, 1.1, i === 1 ? "#FFFFFF" : "#E30A17", i === 1 ? "#E30A17" : "#FFFFFF", ["10", "1", "9"][i]);
          fsign(cc, FW / 2, 0.45, FW - 0.6, 0.6, "ŞEREF SALONU", "#B8860B", "#FFFFFF", true);
        },
      });
      dome(3, 8.5, 1.6, 3.4, "#FFC93C", { ribs: true });
    }
  }
  function hsB(st) {
    var nat = st >= 14;
    st = hsOld(st);
    if (st < 7) {
      // genişleme arsası: çayır, birkaç ağaç
      lawn();
      flat(function () {
        topDo(0.27, function (c) {
          c.strokeStyle = K("#F1E4C8");
          c.lineWidth = 2;
          c.lineCap = "round";
          c.beginPath();
          c.moveTo(21, 6);
          c.quadraticCurveTo(2, 2, -6, 21);
          c.stroke();
        });
      });
      [[-12, -12, 1.2], [-4, -15, 0.9], [-15, -2, 1], [8, -12, 1.1], [14, -2, 0.8], [-12, 12, 0.9], [12, 14, 0.8]].forEach(function (q) {
        tree(q[0], q[1], q[2]);
      });
      bench(4, 7, true, 3);
      return;
    }
    pad(0, 0, 42, 42, "#E4E8EF", { fn: tiles(2.2, "rgba(27,22,72,0.07)"), th: 0.3, side: "#AEB4C8", r: 3 });
    // FUTBOL OKULU SALONU (12'de KAPALI ARENA olur)
    if (st >= 12) {
      box(-7, -9, 24, 15, 0, 9, "#F2F4FF", {
        fL: function (cc, FW, FH) {
          var g = cc.createLinearGradient(0, 0, FW, 0);
          g.addColorStop(0, TH.night > 0.5 ? lit(kit.primary, 0.15) : K(kit.primary));
          g.addColorStop(1, TH.night > 0.5 ? "#8B5CF6" : K(dk(kit.primary, 0.25)));
          cc.fillStyle = g;
          cc.fillRect(0, 1.2, FW, 1.4);
          if (nat) {
            cc.fillStyle = K("#E30A17");
            cc.fillRect(0, 1.2, FW, 1.4);
          }
          ftext(cc, nat ? "ULUSAL ARENA" : "ELİT ARENA", FW / 2, 1.95, 1, "#FFFFFF", FW * 0.7);
          windowsGrid(cc, FW, FH, { ww: 2.2, wh: 3.4, gx: 0.5, top: 4.2, rows: 1, glass: "#9FE0FF" });
        },
        fR: winFace({ ww: 2, wh: 3.4, gx: 0.6, top: 4.2, rows: 1, glass: "#9FE0FF" }),
      });
      vaultX(-7, -9, 23, 6.8, 9, "#EEF1FB", { rib: 2.4, ribCol: "#B9C2E0", cap: "#DDE2F4" });
    } else {
      box(-7, -10, 20, 11, 0, 4.4, "#FFE7B8", {
        fL: function (cc, FW, FH) {
          windowsGrid(cc, FW, FH, { ww: 1.6, wh: 1.4, gx: 1.1, top: 1.6, rows: 1, skip: function (r, k, R, Cn) { return k === Math.floor(Cn / 2); } });
          A.roundRect(cc, FW / 2 - 1, FH - 2.4, 2, 2.4, 0.2);
          cc.fillStyle = K("#2D3270");
          cc.fill();
          fsign(cc, FW / 2, 0.55, 8, 0.8, "FUTBOL OKULU", "#16A34A", "#FFFFFF", true);
        },
        fR: winFace({ ww: 1.4, wh: 1.4, top: 1.6, rows: 1 }),
      });
      vaultX(-7, -10, 19.6, 5.2, 4.4, "#4DB6F0", { rib: 2.2, cap: "#3B9BD6" });
    }
    // ANTRENMAN TESİSİ (8+)
    if (st >= 8) {
      box(12, -11, 10, 10, 0, 8, "#E9ECF8", {
        fL: function (cc, FW, FH) {
          windowsGrid(cc, FW, FH, { ww: 2, wh: 2.6, gx: 0.4, top: 0.8, rows: 1, glass: "#7CC7FF", litK: 0.9 });
          // video analiz ekranı
          cc.fillStyle = "#141043";
          cc.fillRect(1, 4.4, FW - 2, 2.6);
          var g = cc.createLinearGradient(0, 4.6, FW, 6.8);
          g.addColorStop(0, "#22D3EE");
          g.addColorStop(1, "#16A34A");
          cc.fillStyle = TH.night > 0.5 ? g : K("#1E2A5A");
          cc.fillRect(1.3, 4.7, FW - 2.6, 2);
          cc.strokeStyle = TH.night > 0.5 ? "#FFFFFF" : "#7FE3FF";
          cc.lineWidth = 0.12;
          cc.beginPath();
          cc.moveTo(1.6, 6.4);
          cc.lineTo(3.4, 5.4);
          cc.lineTo(5, 6);
          cc.lineTo(7.4, 5);
          cc.stroke();
          fsign(cc, FW / 2, 3.6, 7.6, 0.7, "ANTRENMAN TESİSİ", "#141043", "#22D3EE", true);
        },
        fR: winFace({ ww: 1.8, wh: 2.6, gx: 0.5, gy: 1.6, top: 0.8, glass: "#7CC7FF" }),
      });
      roofCap(12, -11, 10, 10, 8, "#C6CAE0");
      // çevik koşu alanı: koni + merdiven
      [8, 10, 12, 14, 16].forEach(function (x) {
        cone(x, -3.2);
      });
    }
    // ön sol: 7-8 mini saha (çocuklar), 9+ KAPALI SAHA (şişme kubbe)
    if (st >= 9) {
      vaultX(-7, 10, 22, 6.2, 0, st >= 12 ? "#F7F9FF" : "#F2F4FF", { rib: 2.75, ribCol: "#C9D1EC", cap: "#E3E6F4", lit: "#D6F5FF" });
      billboard(-7, 16.8, 0.3, 8, 1.1, nat ? "KAPALI TAM SAHA" : st >= 12 ? "KAPALI SAHA · ARENA" : "KAPALI SAHA", nat ? "#E30A17" : kit.primary, nat ? "#FFFFFF" : kit.secondary, { posts: false, glow: true });
    } else {
      fiveSide(-7, 9, 14, 9, "mini", { gw: 2.4, gh: 1.3, fence: true, fh: 1.4, seed: 11 });
      [[-14, 15], [-11, 15], [-8, 15], [-5, 15]].forEach(function (q, i) {
        bagS(q[0], q[1] + 0.6, ["#FF4D5E", "#3B82F6", "#FFD43B", "#22C55E"][i]);
      });
    }
    // TURNUVA SAHASI + tribün + skorbord (10+)
    if (st >= 10) {
      var tx = HS.t[0], tz = HS.t[1];
      fiveSide(tx, tz, 15, 9, st >= 11 ? "hybrid" : "turf2", { flood: true, fl: 9, seed: 21 });
      for (var r = 0; r < 3; r++)
        (function (r) {
          box(tx, tz - 6.2 - r * 0.9, 15, 0.9, 0, (r + 1) * 0.5, "#D5D8EA", { top: nat ? "#C81E2B" : dk(kit.primary, 0.3), noShadow: true, gloss: false, depth: tx + tz - 30 + (2 - r) * 0.01 });
          body(tx + tz - 30 + (2 - r) * 0.01 + 0.001, function () {
            crowdRow(G.c, true, tx - 7.2, tx + 7.2, tz - 6.2 - r * 0.9, (r + 1) * 0.5, 90 + r, 0.7);
          });
        })(r);
      box(tx, tz - 9.2, 15.6, 0.4, 0, 2.6, nat ? "#E30A17" : "#4A4F86", { depth: tx + tz - 40, noShadow: true, fL: nat ? signFace("★ MİLLİ TAKIM SAHASI ★", "#E30A17", "#FFFFFF", 1.3, 0.8, 1) : null });
      if (nat)
        [-6, 6].forEach(function (dx) {
          turkFlag(tx + dx, tz - 10, 8);
        });
      // skorbord
      box(tx + 9.6, tz - 2, 0.4, 5, 2.4, 2.6, "#141043", {
        depth: tx + tz + 5,
        fR: function (cc, FW, FH) {
          cc.fillStyle = "#0B0A2A";
          cc.fillRect(0.15, 0.15, FW - 0.3, FH - 0.3);
          ftext(cc, "3 - 2", FW / 2, FH * 0.58, FH * 0.5, "#FFD43B", FW * 0.8);
          ftext(cc, "TURNUVA", FW / 2, FH * 0.2, FH * 0.22, "#7FE3FF", FW * 0.8);
        },
      });
      [-1.6, 1.6].forEach(function (dz) {
        box(tx + 9.6, tz - 2 + dz, 0.3, 0.3, 0, 2.4, "#8A90B5", { noShadow: true, depth: tx + tz + 4.9 });
      });
    } else {
      tree(15, 6, 1);
      tree(10, 15, 0.9);
      tree(17, 16, 0.8);
      bench(12, 10, true, 3);
    }
  }

  /* ─────────────── STADYUM ─────────────── */

  /** Aşama → eski stadyum çizimi: [saha, tribün, bayraklar]. */
  /** sm: akıllı stadyum (LED çatı şeridi, turnike), rf: açılır çatı, nat: ulusal stadyum. */
  var STAD_MAP = [null, [4, 1, ""], [4, 2, ""], [4, 3, ""], [4, 4, ""], [5, 5, "nf"], [5, 5, ""], [6, 6, "ns"], [6, 7, "na nv ns"], [6, 7, "na nv ns sm"], [7, 7, "na sm"], [7, 7, "na sm rf"], [7, 7, "sm"], [7, 7, "sm nat"]];
  var STAD_N = STAD_MAP.length - 1;
  var SVF = null; // etkin stadyum aşamasının bayrakları (kurulum sırasında)
  function svFlags(sv) {
    if (sv == null) return null;
    var f = " " + ((STAD_MAP[sv] && STAD_MAP[sv][2]) || "") + " ";
    var has = function (t) {
      return f.indexOf(" " + t + " ") >= 0;
    };
    return { v2: true, noFlood: has("nf"), noScreens: has("ns"), noArch: has("na"), noVip: has("nv"), smart: has("sm"), roof: has("rf"), nat: has("nat") };
  }

  /* ─────────────── KULÜP BİNASI ─────────────── */

  function adminBlock(x, z, w, d, h) {
    box(x, z, w, d, 0, h, "#F7F5FF", {
      fL: function (cc, FW, FH) {
        cc.fillStyle = K(kit.primary);
        cc.fillRect(0, FH - 3.2, FW, 0.5);
        windowsGrid(cc, FW, FH, { ww: 1.5, wh: 1.6, gx: 0.6, gy: 1.2, top: 0.8, bot: 3.6, glass: "#8FD3FF" });
        A.roundRect(cc, FW / 2 - 1.4, FH - 2.6, 2.8, 2.6, 0.2);
        cc.fillStyle = K("#7CC7FF");
        cc.fill();
        fsign(cc, FW / 2, FH - 3.6, 7.5, 0.8, "YÖNETİM", kit.primary, kit.secondary, true);
      },
      fR: winFace({ ww: 1.5, wh: 1.6, gx: 0.6, gy: 1.2, top: 0.8, bot: 1.4, glass: "#8FD3FF" }),
    });
    roofCap(x, z, w, d, h, "#DADDEE");
    crestS(x + w * 0.25, z, h + 1.6, 1);
  }
  function museumPav(x, z, k) {
    k = k || 1;
    box(x, z, 9 * k, 6.5 * k, 0, 0.8, "#F4F1FA", { noShadow: true, depth: x + z - 6 });
    box(x, z - 0.6 * k, 7.6 * k, 4.6 * k, 0.8, 4.2 * k, "#FBF9FF", {
      fL: function (cc, FW, FH) {
        for (var u = 0.8; u < FW - 0.4; u += 1.2) {
          cc.fillStyle = K("#E6E2F2");
          cc.fillRect(u, 0.5, 0.55, FH - 0.5);
        }
        A.roundRect(cc, FW / 2 - 0.8, FH - 2.2, 1.6, 2.2, 0.2);
        cc.fillStyle = K("#7C2D12");
        cc.fill();
      },
    });
    dome(x, z - 0.6 * k, 2.4 * k, 5 * k, "#FFC93C", { ribs: true });
    billboard(x, z + 2.9 * k, 0.2, 6 * k, 0.9, "KUPA MÜZESİ", "#7C2D12", "#FFD43B", { glow: true, posts: false });
  }

  /* ─────────────── ÜNİVERSİTE ─────────────── */

  function facultyBlock(x, z, w, d, h, sign, col, tower) {
    box(x, z, w, d, 0, h, col || "#FFF3DF", {
      fL: function (cc, FW, FH) {
        windowsGrid(cc, FW, FH, { ww: 1.3, wh: 1.6, gx: 0.8, gy: 1.2, top: 1.6, bot: 2.8, glass: "#9FD8FF" });
        cc.fillStyle = K("#E6D8BE");
        for (var u = FW / 2 - 3; u <= FW / 2 + 3; u += 1.5) cc.fillRect(u - 0.25, FH - 2.6, 0.5, 2.6);
        A.roundRect(cc, FW / 2 - 0.8, FH - 2.2, 1.6, 2.2, 0.2);
        cc.fillStyle = K("#7A4B2A");
        cc.fill();
        fsign(cc, FW / 2, 0.75, Math.min(FW - 1, 11), 0.85, sign, "#1E3A8A", "#FFFFFF", true);
      },
      fR: winFace({ ww: 1.3, wh: 1.6, gx: 0.8, gy: 1.2, top: 1.6, bot: 1.2, glass: "#9FD8FF" }),
    });
    roofCap(x, z, w, d, h, "#C9B99A");
    if (tower) {
      box(x, z, 4, 4, h, 9, col || "#FFF3DF", {
        depth: x + z + 0.5,
        fL: function (cc, FW, FH) {
          clockFace(cc, FW / 2, 2.2, 1.3);
        },
        fR: function (cc, FW, FH) {
          clockFace(cc, FW / 2, 2.2, 1.3);
        },
      });
      if (tower === "gold") dome(x, z, 2.4, h + 9, "#FFC93C", { ribs: true, depth: x + z + 0.6 });
      else pyramid(x, z, 4.6, 4.6, h + 9, 4, "#1E3A8A", { depth: x + z + 0.6, noShadow: true });
    }
  }
  function clockFace(cc, u, v, r) {
    cc.beginPath();
    cc.arc(u, v, r, 0, Math.PI * 2);
    cc.fillStyle = K("#FFFFFF");
    cc.fill();
    cc.lineWidth = r * 0.14;
    cc.strokeStyle = K("#C9A227");
    cc.stroke();
    cc.strokeStyle = NAVY;
    cc.lineWidth = r * 0.1;
    cc.lineCap = "round";
    cc.beginPath();
    cc.moveTo(u, v);
    cc.lineTo(u, v - r * 0.7);
    cc.moveTo(u, v);
    cc.lineTo(u + r * 0.45, v + r * 0.2);
    cc.stroke();
  }

  var BUILD2 = {};
  BUILD2.halisaha = function (st, part) {
    if (part === "B") return hsB(st);
    hsA(st);
  };
  /** Genel merkez meydanı: kulüp renkli alt blok, çeşme havuzu, bayraklar. */
  function hqPodium(sign) {
    paved("#EEE9F8");
    box(0, -6, 22, 12, 0, 5, "#F7F5FF", {
      fL: function (cc, FW, FH) {
        cc.fillStyle = TH.night > 0.3 ? lit(kit.primary, 0.2) : K(kit.primary);
        cc.fillRect(0, 0.3, FW, 0.6);
        A.roundRect(cc, 1, 1.6, FW - 2, FH - 1.6, 0.2);
        cc.fillStyle = TH.night > 0.5 ? "#FFE2A8" : K("#8FD3FF");
        cc.fill();
        fsign(cc, FW / 2, 2.4, 9, 1.1, sign || "ELİTLİG KULÜBÜ", kit.primary, kit.secondary, true);
      },
    });
  }
  function hqFlags(pool0) {
    if (pool0 !== false) {
      pool(0, 7, 9, 4, "#38BDF8");
      anchor({ t: "fountain", x: 0, y: 1, z: 7 });
    }
    [-10, -7, 7, 10].forEach(function (x, i) {
      flagpole(x, 9, 7, i % 2 ? kit.secondary : kit.primary, i % 2 ? kit.primary : kit.secondary);
    });
  }
  /** Akıllı bina: çatıda güneş panelleri + anten; cephede veri ekranı. */
  function smartKit(x, z, y, w) {
    for (var i = 0; i < 3; i++) box(x - w / 2 + 1.6 + i * ((w - 3.2) / 2), z + 1.4, 2.4, 1.6, y, 0.5, "#1E3A8A", { noShadow: true, top: "#3B5BDB", depth: 40 + i * 0.01 });
    cyl(x + w / 2 - 1, z - 1.5, 0.15, y, 4, "#5B6385", { noShadow: true, depth: 41 });
    anchor({ t: "beacon", x: x + w / 2 - 1, y: y + 4, z: z - 1.5 });
  }
  BUILD2.kulup = function (st) {
    if (st <= 4) return oldB("kulup", st);
    if (st === 5) {
      // KULÜP PLAZASI: iki katlı bina önünde taraftar meydanı
      oldB("kulup", 4);
      flat(function () {
        topDo(0.34, function (c) {
          c.fillStyle = K(lit(kit.primary, 0.55));
          c.beginPath();
          c.ellipse(0, 11, 7, 4.5, 0, 0, Math.PI * 2);
          c.fill();
          c.strokeStyle = K(kit.primary);
          c.lineWidth = 0.4;
          c.stroke();
        });
      });
      // arma anıtı
      box(0, 11, 2.2, 2.2, 0, 2.2, "#DCD8E8", { fL: function (cc, FW, FH) { cc.fillStyle = K("#C9A227"); cc.fillRect(0.4, FH * 0.4, FW - 0.8, 0.4); } });
      crestS(0, 11, 3.2, 1.6);
      // bilet gişeleri
      [-13, -9].forEach(function (x) {
        box(x, 9, 3, 2.4, 0, 2.6, "#FFFFFF", { fL: both(function (cc, FW, FH) { win(cc, 0.5, 0.9, FW - 1, 1, true); }, signFace("BİLET", kit.primary, kit.secondary, 0.35, 0.9, 0.55)) });
        roofCap(x, 9, 3, 2.4, 2.6, kit.primary);
      });
      // meydan ekranı
      box(12, 8, 0.5, 6, 2.6, 3.6, "#1B1648", { fR: screenFace });
      [5.6, 10.4].forEach(function (z) {
        box(12, z, 0.35, 0.35, 0, 2.6, "#8A90B5", { noShadow: true });
      });
      return;
    }
    if (st === 6) {
      // YÖNETİM BİNASI
      paved("#EEE9F8");
      adminBlock(-2, -7, 18, 10, 13);
      // basın girişi kanopisi + sponsor panosu
      box(-2, 0.4, 8, 3, 3.2, 0.35, kit.primary, { noShadow: true });
      [-5.5, 1.5].forEach(function (x) {
        cyl(x, 1.6, 0.2, 0, 3.2, "#C6CAE0", { noShadow: true });
      });
      billboard(12, 3, 0.2, 5, 2.2, "SPONSOR", "#1B1648", "#FFD43B", { posts: false });
      [-12, -9.5].forEach(function (x, i) {
        flagpole(x, 6, 7, i % 2 ? kit.secondary : kit.primary, i % 2 ? kit.primary : kit.secondary);
      });
      tree(-17, -16, 1);
      tree(16, -15, 1);
      tree(15, 14, 0.8);
      bush(-8, 12, 1);
      return;
    }
    if (st === 7) {
      // KUPA MÜZESİ + yönetim binası
      paved("#EEE9F8");
      adminBlock(-5, -9, 16, 9, 13);
      museumPav(7, 6, 1.35);
      box(-12, 7, 2, 2, 0, 1.4, "#3A3F72");
      flagpole(-14, 12, 7, kit.primary, kit.secondary);
      tree(15, -15, 1);
      tree(-17, -16, 1);
      tree(-16, 16, 0.8);
      return;
    }
    if (st === 8 || st === 9) {
      // MODERN GENEL MERKEZ: tek orta boy cam blok (9: akıllı bina — LED cephe, güneş paneli, anten)
      hqPodium(st === 9 ? "AKILLI MERKEZ" : null);
      glassTower(-3, -8, 11, 7, 5, 13, st === 9 ? "#4F7FE0" : "#5AA2E8");
      crestS(-3, -8, 19.6, 2.2);
      if (st === 9) {
        // LED medya şeridi + veri odası ekranları
        box(-3, -4.3, 11.2, 0.3, 9, 1.4, kit.primary, { noShadow: true, depth: 30, fL: function (cc, FW, FH) { screenFace(cc, FW, FH); ftext(cc, "● VERİ", FW * 0.2, FH / 2, FH * 0.55, "#7FE3FF", FW * 0.3); } });
        smartKit(-3, -8, 18.6, 11);
        box(9, -6, 6, 8, 5, 0.4, "#141043", { noShadow: true, depth: 20, top: "#2A2F6E" });
        [[7.5, -8], [10.5, -8], [7.5, -4.5], [10.5, -4.5]].forEach(function (q) {
          box(q[0], q[1], 1.8, 1.2, 5.4, 0.4, "#1E3A8A", { noShadow: true, top: "#3B5BDB", depth: 21 });
        });
      } else {
        box(9, -6, 6, 8, 5, 3, "#F2F4FF", { noShadow: true, depth: 20, fL: winFace({ ww: 1.2, wh: 1.4, top: 0.8, rows: 1, glass: "#8FD3FF" }), fR: winFace({ ww: 1.2, wh: 1.4, top: 0.8, rows: 1, glass: "#8FD3FF" }) });
      }
      hqFlags();
      tree(-17, 14, 0.9);
      tree(17, 15, 0.9);
      return;
    }
    if (st >= 11) {
      // KULÜP GÖKDELENİ: tek, ince, çok yüksek kule + rezidans; 12: KULÜP KAMPÜSÜ
      hqPodium(st >= 12 ? "KULÜP KAMPÜSÜ" : null);
      glassTower(-2, -7, 9, 8, 5, 46, "#3F86E8");
      box(-2, -7, 9.6, 8.6, 34, 1.4, kit.primary, { noShadow: true, depth: 30, fL: screenFace, fR: screenFace });
      crestS(-2, -2.6, 24, 2.6);
      anchor({ t: "glow", x: -2, y: 26, z: -2.6, col: "#FFD98A" });
      // rezidans: balkonlu
      box(10, -4, 6, 7, 5, 11, "#F7F5FF", {
        depth: 25,
        fL: winFace({ ww: 1.2, wh: 1.2, gx: 0.8, gy: 1.2, top: 0.8, bot: 0.6, glass: "#8FD3FF" }),
        fR: winFace({ ww: 1.2, wh: 1.2, gx: 0.8, gy: 1.2, top: 0.8, bot: 0.6, glass: "#8FD3FF" }),
      });
      for (var bf = 0; bf < 4; bf++) box(10, -0.3, 6.2, 0.6, 7.3 + bf * 2.4, 0.18, kit.primary, { noShadow: true, depth: 26 + bf * 0.01 });
      roofCap(10, -4, 6, 7, 16, "#E3E6F4");
      if (st >= 12) {
        // KAMPÜS: efsaneler yolu (yıldızlı), kupa kubbesi, tarih galerisi
        flat(function () {
          topDo(0.34, function (c) {
            c.fillStyle = K("#2B2F5E");
            c.fillRect(-2, 1, 4, 18);
            c.fillStyle = "#FFD43B";
            for (var z = 2.5; z < 19; z += 2.5) {
              c.beginPath();
              for (var k = 0; k < 10; k++) {
                var a = (k / 10) * Math.PI * 2 - Math.PI / 2, rr = k % 2 ? 0.35 : 0.8;
                c.lineTo(Math.cos(a) * rr, z + Math.sin(a) * rr);
              }
              c.closePath();
              c.fill();
            }
          });
        });
        museumPav(-11.5, 10, 0.8);
        box(11.5, 10, 8, 5, 0, 4, "#FFF7E0", {
          fL: function (cc, FW, FH) {
            for (var i = 0; i < 4; i++) shirtAt(cc, 1 + i * 1.9, 2.2, 1.2, i % 2 ? kit.secondary : kit.primary, i % 2 ? kit.primary : kit.secondary, ["7", "10", "9", "1"][i]);
            fsign(cc, FW / 2, 0.5, FW - 0.8, 0.65, "TARİH GALERİSİ", "#7C2D12", "#FFD43B", true);
          },
          fR: winFace({ ww: 1, wh: 1.6, top: 1.2, rows: 1, glass: "#FFE9A8" }),
        });
        roofCap(11.5, 10, 8, 5, 4, "#C9A227");
        [-15, 15].forEach(function (x, i) {
          flagpole(x, 17, 8, i ? kit.secondary : kit.primary, i ? kit.primary : kit.secondary);
        });
      } else {
        hqFlags();
        tree(-17, 14, 0.9);
        tree(17, 15, 0.9);
      }
      return;
    }
    // 10: CAM KULELİ GENEL MERKEZ (eski çizim: iki kule + gök köprüsü) + kupa müzesi tacı
    oldB("kulup", 6);
    // en üst katta kupa müzesi (altın taç) + müze pavyonu
    box(6, -6, 7.4, 6.4, 26.6, 2.8, "#FFD86B", {
      noShadow: true,
      depth: 30,
      fL: function (cc, FW, FH) {
        win(cc, 0.4, 0.4, FW - 0.8, FH - 0.8, true, "#FFE9A8");
        ftext(cc, "MÜZE", FW / 2, FH / 2, FH * 0.45, "#7C2D12", FW * 0.8);
      },
      fR: function (cc, FW, FH) {
        win(cc, 0.4, 0.4, FW - 0.8, FH - 0.8, true, "#FFE9A8");
      },
    });
    dome(6, -6, 2.4, 29.4, "#FFC93C", { ribs: true, depth: 31 });
    anchor({ t: "glow", x: 6, y: 28, z: -3, col: "#FFD98A" });
    museumPav(-12, 10, 0.8);
  };
  BUILD2.stadyum = function () {};
  /** Takım yemekhanesi: uzun salon, uzun masalar, ışık zinciri. */
  function messHall() {
        // TAKIM YEMEKHANESİ: uzun salon, uzun masalar
    paved();
    gable(0, -7, 22, 9, 0, 4.4, 2.6, "#FBE7CF", "#B45309", {
      fL: function (cc, FW, FH) {
        windowsGrid(cc, FW, FH, { ww: 1.8, wh: 1.6, gx: 0.8, top: 1.6, rows: 1, glass: "#FFE3A8", litK: 0.9, skip: function (r, k, R, Cn) { return k === Math.floor(Cn / 2); } });
        A.roundRect(cc, FW / 2 - 1, FH - 2.5, 2, 2.5, 0.2);
        cc.fillStyle = K("#7A3E10");
        cc.fill();
        fsign(cc, FW / 2, 0.6, 7, 0.8, "YEMEKHANE", "#B45309", "#FFFFFF", true);
      },
      fR: winFace({ ww: 1.6, wh: 1.6, top: 1.6, rows: 1, glass: "#FFE3A8" }),
    });
    cyl(6, -9, 0.5, 6.5, 1.6, "#A9AEC6", { noShadow: true });
    anchor({ t: "steam", x: 6, y: 8.3, z: -9 });
    [2, 7].forEach(function (z) {
      box(-1, z, 12, 1.4, 0.75, 0.15, "#E0A562", { noShadow: true });
      box(-1, z - 1.2, 12, 0.5, 0.42, 0.12, "#C98A4B", { noShadow: true });
      box(-1, z + 1.2, 12, 0.5, 0.42, 0.12, "#C98A4B", { noShadow: true });
    });
    stringLights(-8, 10.5, 8, 10.5, 3.2, 10);
    [-8, 8].forEach(function (x) {
      cyl(x, 10.5, 0.15, 0, 3.2, "#5B6385", { noShadow: true });
    });
    tree(-17, -16, 1);
    tree(17, -15, 1);
    tree(16, 14, 0.8);
  }
  /** Teras restoran: kulüp restoranının çatısında şemsiyeli teras. */
  function roofTerrace() {
        // TERAS RESTORAN: çatı terası + şemsiyeler
    box(0, -6, 18.4, 9.4, 8.6, 0.15, "#D9925A", { noShadow: true, depth: -5.5, gloss: false });
    box(0, -6, 18.6, 9.6, 8.75, 0.9, "#BFE6FF", { noShadow: true, alpha: 0.35, depth: -5.4, gloss: false, noLine: true });
    [-6, 0, 6].forEach(function (x, i) {
      umbrella(x, -6, 2.4, 1.5, i % 2 ? "#FFFFFF" : kit.primary, i % 2 ? kit.primary : "#FFFFFF", 8.6);
    });
    billboard(13, 10, 0.4, 5, 1.2, "TERAS", "#B45309", "#FFFFFF", { glow: true });
  }
  /** Restoranlar sokağı: önde üç tenteli dükkân (kebapçı, balıkçı, tatlıcı) + ışık zinciri. */
  function foodStreet(z) {
    [["KEBAP", "#C2410C", -12.5], ["BALIK", "#0369A1", -6.5], ["TATLI", "#DB2777", -0.5]].forEach(function (q) {
      gable(q[2], z, 5, 3.6, 0, 2.8, 1.4, "#FFF1DC", q[1], {
        fL: function (cc, FW, FH) {
          A.roundRect(cc, 0.5, 1.1, FW - 1, 1.2, 0.15);
          cc.fillStyle = TH.night > 0.5 ? "#FFD98A" : K("#7A3E10");
          cc.fill();
          fsign(cc, FW / 2, 0.5, FW - 0.6, 0.7, q[0], q[1], "#FFFFFF", true);
        },
      });
      box(q[2], z + 2.2, 5, 0.9, 1.9, 0.18, q[1], { noShadow: true });
    });
    if (z < 15) {
      stringLights(-15.5, z - 2.6, 2.5, z - 2.6, 3.4, 10);
      [-15.5, 2.5].forEach(function (x) {
        cyl(x, z - 2.6, 0.15, 0, 3.4, "#5B6385", { noShadow: true });
      });
    }
  }
  BUILD2.restoran = function (st) {
    if (st <= 4) return oldB("kantin", st);
    if (st <= 6) {
      // 5: TAKIM YEMEKHANESİ; 6: + BESLENME MERKEZİ (sera, toparlanma barı)
      paved();
      messHall();
      if (st === 6) {
        vaultX(12.5, 2, 7, 2.6, 0, "#C9F5D2", { alpha: 0.85, rib: 1.4, lit: "#FFF2C4", cap: "#86E3A0" });
        for (var i = 0; i < 3; i++) bush(10.5 + i * 2, 2, 0.5, "#22C55E");
        box(13, 9.5, 4, 3, 0, 2.6, "#FFFFFF", {
          fL: both(function (cc, FW, FH) {
            ["#F97316", "#22C55E", "#E11D48"].forEach(function (col, k) {
              cc.fillStyle = K(col);
              A.roundRect(cc, 0.6 + k * 1.1, 1.2, 0.6, 1, 0.2);
              cc.fill();
            });
          }, signFace("SMOOTHIE", "#16A34A", "#FFFFFF", 0.45, 0.95, 0.6)),
        });
        roofCap(13, 9.5, 4, 3, 2.6, "#16A34A");
        billboard(-12, 14, 0.4, 6.5, 1.1, "BESLENME MERKEZİ", "#16A34A", "#FFFFFF", { glow: true });
      }
      return;
    }
    if (st <= 10) {
      // 7: KULÜP RESTORANI; 8: + restoranlar sokağı; 9: + teras; 10: + gurme mutfak
      oldB("kantin", 5);
      if (st >= 8) foodStreet(14);
      if (st >= 9) roofTerrace();
      if (st >= 10) {
        box(8, 14, 7, 5, 0, 4, "#2A2F55", {
          fL: both(winFace({ ww: 1.8, wh: 2, gx: 0.6, top: 1.4, rows: 1, glass: "#FFD98A", litK: 1 }), signFace("GURME MUTFAK", "#141043", "#FFD43B", 0.6, 0.8, 0.8)),
          fR: winFace({ ww: 1.4, wh: 2, top: 1.4, rows: 1, glass: "#FFD98A", litK: 1 }),
        });
        roofCap(8, 14, 7, 5, 4, "#B45309");
        // taş fırın bacası
        cyl(10, 13, 0.6, 4.4, 2.4, "#B8A99A", { noShadow: true });
        anchor({ t: "steam", x: 10, y: 7, z: 13 });
        anchor({ t: "glow", x: 8, y: 2, z: 16.5, col: "#FFB347" });
      }
      return;
    }
    // 11: ŞEF RESTORANI; 12: + GASTRONOMİ MERKEZİ (çatıda panorama restoranı, aşçılık okulu, ödül yıldızı)
    oldB("kantin", 6);
    foodStreet(16.4);
    if (st >= 12) {
      box(-3, -8, 12, 7, 7.5, 3.4, "#BFE6FF", {
        noShadow: true,
        depth: 10,
        alpha: 0.95,
        fL: both(winFace({ ww: 1.6, wh: 2.2, gx: 0.3, top: 0.6, rows: 1, glass: "#FFE3A8", litK: 1 }), signFace("PANORAMA", "#B45309", "#FFFFFF", 0.35, 0.6, 0.55)),
        fR: winFace({ ww: 1.6, wh: 2.2, gx: 0.3, top: 0.6, rows: 1, glass: "#FFE3A8", litK: 1 }),
      });
      roofCap(-3, -8, 12, 7, 10.9, "#B45309");
      extBill(6, -6, 3, 15);
      body(30, function () {
        var c = G.c, p = G.P(6, 13, -6), s = G.s, R = 2 * s;
        c.beginPath();
        for (var k = 0; k < 10; k++) {
          var an = (k / 10) * Math.PI * 2 - Math.PI / 2, rr = k % 2 ? R * 0.45 : R;
          c.lineTo(p[0] + Math.cos(an) * rr, p[1] + Math.sin(an) * rr);
        }
        c.closePath();
        c.fillStyle = K("#FFC93C");
        c.fill();
        outline(c);
      });
      cyl(6, -6, 0.2, 7.5, 3.6, "#8A90B5", { noShadow: true, depth: 12 });
      anchor({ t: "glow", x: 6, y: 13, z: -6, col: "#FFD98A" });
      billboard(12, 9, 0.3, 8, 1.2, "GASTRONOMİ MERKEZİ", "#7C2D12", "#FFD43B", { glow: true });
    }
  };
  /** Mağaza zinciri: şube kioskları (renkli tabelalı) — sol arka sırada. */
  function shopKiosks() {
    [["AVM", "#E11D48", -11], ["HAVALİMANI", "#0284C7", -5.5], ["İSTASYON", "#F59E0B", 0]].forEach(function (q) {
      box(-14, q[2], 4, 4, 0, 3, "#FFFFFF", {
        fL: both(function (cc, FW, FH) {
          A.roundRect(cc, 0.5, 1.2, FW - 1, FH - 1.4, 0.2);
          cc.fillStyle = TH.night > 0.5 ? "#FFE3A8" : K("#CFEAFF");
          cc.fill();
          shirtAt(cc, FW / 2, 2.2, 1, kit.primary, kit.secondary);
        }, signFace(q[0], q[1], "#FFFFFF", 0.5, 0.95, 0.7)),
        fR: function (cc, FW, FH) {
          cc.fillStyle = K(q[1]);
          cc.fillRect(0, 0.2, FW, 0.6);
        },
      });
      roofCap(-14, q[2], 4, 4, 3, q[1]);
    });
  }
  /** Mobil mağaza tırı (deplasmanda satış). */
  function shopTruck(x, z) {
    box(x - 4.2, z, 2.2, 2.6, 0.5, 2.4, "#E9ECF8", { fR: function (cc, FW, FH) { win(cc, 0.3, 0.3, FW - 0.6, 0.9, true); } });
    box(x + 0.8, z, 7.6, 2.8, 0.5, 3, kit.primary, { fL: function (cc, FW, FH) { ftext(cc, "MOBİL MAĞAZA", FW / 2, FH / 2, 0.8, K(kit.secondary), FW * 0.85); } });
    [-4, -1, 3].forEach(function (dx) {
      cyl(x + dx, z + 1.3, 0.5, 0, 0.5, "#2B2F5E", { noShadow: true });
    });
  }
  BUILD2.magaza = function (st) {
    if (st <= 1) {
      // MAĞAZA KULÜBESİ: tahta kulübe, dikiş makinesi, raf, manken
      lawn(false);
      pad(0, 2, 16, 13, PAVE, { th: 0.3, fn: tiles(1.5), r: 3 });
      gable(-1, -2, 7, 4.6, 0, 2.8, 1.6, "#C98A4B", "#8A5426", {
        fL: function (cc, FW, FH) {
          cc.strokeStyle = rgba("#6B3A1E", 0.45);
          cc.lineWidth = 0.08;
          for (var u = 0.6; u < FW; u += 0.6) {
            cc.beginPath();
            cc.moveTo(u, 0);
            cc.lineTo(u, FH);
            cc.stroke();
          }
          // açık kepenk: içeride raf ve katlanmış formalar
          cc.fillStyle = K("#4A2A14");
          cc.fillRect(0.8, 0.7, FW - 1.6, FH - 0.7);
          for (var r = 0; r < 2; r++) {
            cc.fillStyle = K("#E0A562");
            cc.fillRect(1, 1.2 + r * 0.8, FW - 2, 0.12);
            for (var i = 0; i < 6; i++) {
              cc.fillStyle = K(i % 2 ? kit.secondary : kit.primary);
              cc.fillRect(1.2 + i * 0.75, 0.75 + r * 0.8, 0.55, 0.45);
            }
          }
        },
        fR: function (cc, FW, FH) {
          cc.strokeStyle = rgba("#6B3A1E", 0.45);
          cc.lineWidth = 0.08;
          for (var v = 0.4; v < FH; v += 0.4) {
            cc.beginPath();
            cc.moveTo(0, v);
            cc.lineTo(FW, v);
            cc.stroke();
          }
        },
      });
      // tezgâh + dikiş makinesi
      box(-1, 2.2, 4, 1.4, 0.8, 0.15, "#E0A562");
      [[-2.8, 1.7], [0.8, 1.7], [-2.8, 2.7], [0.8, 2.7]].forEach(function (q) {
        box(q[0], q[1], 0.15, 0.15, 0, 0.8, "#8A5426", { noShadow: true });
      });
      box(-1.8, 2.2, 1.4, 0.6, 0.95, 0.35, "#1B1648", { noShadow: true });
      box(-2.3, 2.2, 0.35, 0.6, 1.3, 0.6, "#1B1648", { noShadow: true });
      box(-1.6, 2.2, 1, 0.4, 1.75, 0.25, "#1B1648", { noShadow: true });
      cyl(-0.6, 2.2, 0.3, 0.95, 0.1, kit.primary, { noShadow: true });
      // manken (formalı)
      [4.2, 6].forEach(function (x, i) {
        cyl(x, 2, 0.08, 0, 1.2, "#5B6385", { noShadow: true });
        box(x, 2, 1.1, 0.6, 1.2, 1.3, i ? kit.secondary : kit.primary, { noShadow: true, top: i ? kit.primary : kit.secondary });
        dome(x, 2, 0.32, 2.55, "#E9DCC9", { hk: 1.4 });
      });
      billboard(4.8, 6.2, 0.4, 3, 1, "FORMA", kit.primary, kit.secondary);
      tree(-14, -13, 1);
      tree(14, -12, 0.9);
      tree(14, 12, 0.8);
      return;
    }
    if (st === 2) return oldB("magaza", 2);
    if (st === 3) {
      // CADDE DÜKKÂNI: vitrinli dükkân + kaldırım, sokak lambaları
      oldB("magaza", 3, { sign: "CADDE DÜKKÂNI" });
      flat(function () {
        topDo(0.34, function (c) {
          c.fillStyle = K("#C6CAE0");
          c.fillRect(-13, 8, 26, 3);
          c.strokeStyle = K("#9AA3C7");
          c.lineWidth = 0.15;
          c.strokeRect(-13, 8, 26, 3);
        });
      });
      [-8, 2, 10].forEach(function (x) {
        lampS(x, 10);
      });
      bench(-3, 10, true, 3);
      return;
    }
    if (st === 4) {
      // KULÜP MAĞAZASI: vitrinli tek katlı mağaza
      paved();
      box(0, -5, 15, 8, 0, 4.6, "#F7F5FF", {
        fL: function (cc, FW, FH) {
          [[0.6, 4.2], [FW - 4.8, 4.2]].forEach(function (q) {
            A.roundRect(cc, q[0], 1.6, q[1], FH - 1.9, 0.2);
            cc.fillStyle = TH.night > 0.5 ? "#FFE3A8" : K("#CFEAFF");
            cc.fill();
            for (var i = 0; i < 2; i++) shirtAt(cc, q[0] + 1.1 + i * 2, 2.6, 1.3, i ? kit.secondary : kit.primary, i ? kit.primary : kit.secondary, i ? "7" : "10");
          });
          A.roundRect(cc, FW / 2 - 1.2, FH - 2.7, 2.4, 2.7, 0.2);
          cc.fillStyle = K("#7CC7FF");
          cc.fill();
          fsign(cc, FW / 2, 0.75, 9, 0.9, "KULÜP MAĞAZASI", kit.primary, kit.secondary, true);
        },
        fR: winFace({ ww: 1.6, wh: 2, top: 1.6, rows: 1, glass: "#CFEAFF" }),
      });
      roofCap(0, -5, 15, 8, 4.6, kit.primary);
      // tente
      box(0, -0.4, 15, 1.6, 3.4, 0.25, kit.secondary, { noShadow: true, fL: function (cc, FW, FH) { for (var x = 0; x < FW; x += 1.2) { cc.fillStyle = K(kit.primary); cc.fillRect(x, 0, 0.6, FH); } } });
      tree(-16, -15, 1);
      tree(16, -14, 1);
      tree(15, 13, 0.8);
      return;
    }
    if (st === 5) return oldB("magaza", 4);
    if (st <= 10) {
      // 6: MAĞAZA ZİNCİRİ — taraftar mağazası + şube kioskları + mobil tır
      oldB("magaza", 4);
      shopKiosks();
      if (st <= 7) shopTruck(9, 13);
      if (st === 6) return;
      // BÜYÜK MAĞAZA: yan kanat
      box(13.5, -2, 7, 12, 0, 5.4, "#ECEAF8", {
        fL: function (cc, FW, FH) {
          A.roundRect(cc, 0.5, 1.4, FW - 1, FH - 1.6, 0.2);
          cc.fillStyle = TH.night > 0.5 ? "#FFE3A8" : K("#CFEAFF");
          cc.fill();
          shirtAt(cc, FW / 2, 2.6, 1.5, kit.primary, kit.secondary, "9");
        },
        fR: winFace({ ww: 2.2, wh: 3, gx: 0.6, top: 1.4, rows: 1, glass: "#CFEAFF" }),
      });
      roofCap(13.5, -2, 7, 12, 5.4, kit.primary);
      if (st === 8 || st === 9) {
        // TASARIM VE LİSANS MERKEZİ: cam stüdyo, çatıda dev kalem
        box(9.5, 12, 8, 5, 0, 4.6, "#E8F7FF", {
          fL: both(winFace({ ww: 1.6, wh: 2.6, gx: 0.3, top: 1.4, rows: 1, glass: "#9FE0FF", litK: 0.9 }), signFace("TASARIM · LİSANS", "#141043", "#FFD43B", 0.55, 0.92, 0.75)),
          fR: winFace({ ww: 1.4, wh: 2.6, top: 1.4, rows: 1, glass: "#9FE0FF" }),
        });
        roofCap(9.5, 12, 8, 5, 4.6, "#141043");
        box(9.5, 12, 6, 0.8, 5.1, 0.8, "#FFD43B", { noShadow: true, depth: 30, fL: function (cc, FW, FH) { cc.fillStyle = K("#F59E0B"); cc.fillRect(FW - 1.2, 0, 1.2, FH); cc.fillStyle = K("#1B1648"); cc.fillRect(FW - 0.3, 0.2, 0.3, FH - 0.4); cc.fillStyle = K("#FF8FA3"); cc.fillRect(0, 0, 0.8, FH); } });
      }
      if (st >= 10) {
        // ONLINE MAĞAZA VE LOJİSTİK ÜSSÜ: depo, rampa kapıları, koliler, kargo arabası
        box(9.5, 12, 9, 5.5, 0, 5, "#DDE2F4", {
          fL: function (cc, FW, FH) {
            for (var i = 0; i < 3; i++) {
              cc.fillStyle = K("#8A93B8");
              cc.fillRect(0.6 + i * 2.8, FH - 2.6, 2.2, 2.6);
              cc.strokeStyle = rgba(NAVY, 0.35);
              cc.lineWidth = 0.08;
              for (var v = FH - 2.4; v < FH; v += 0.4) {
                cc.beginPath();
                cc.moveTo(0.6 + i * 2.8, v);
                cc.lineTo(2.8 + i * 2.8, v);
                cc.stroke();
              }
            }
            fsign(cc, FW / 2, 0.8, FW - 1, 0.9, "LOJİSTİK ÜSSÜ", kit.primary, kit.secondary, true);
          },
          fR: winFace({ ww: 1.2, wh: 0.8, top: 0.8, rows: 1 }),
        });
        roofCap(9.5, 12, 9, 5.5, 5, kit.primary);
        [[4, 16.4], [5.3, 16.6], [4.6, 17.6]].forEach(function (q, i) {
          box(q[0], q[1], 1, 1, i === 2 ? 1 : 0, 1, "#C98A4B", { noShadow: i === 2, top: "#E0A562" });
        });
        carS(14.5, 17, true, "#FFFFFF");
      }
      if (st >= 9) {
      // FORMA BASKI MERKEZİ: testere çatılı atölye
        box(-11, 9, 12, 7, 0, 4, "#E9ECF8", {
          fL: function (cc, FW, FH) {
            windowsGrid(cc, FW, FH, { ww: 1.4, wh: 1.2, gx: 0.8, top: 1.6, rows: 1 });
            fsign(cc, FW / 2, 0.6, 9, 0.8, "FORMA BASKI", "#1B1648", "#FFD43B", true);
          },
        });
        for (var i = 0; i < 4; i++) box(-15.5 + i * 3, 9, 3, 7, 4, 1.4, i % 2 ? "#B9C2E0" : "#9FD8FF", { noShadow: true, depth: -2 + i * 0.01 });
        cyl(-6.5, 7, 0.4, 4, 2.6, "#A9AEC6", { noShadow: true });
        anchor({ t: "steam", x: -6.5, y: 7, z: 7 });
        body(30, function () {
          var p = G.P(-11, 9.5, 10);
          shirtAt(G.c, p[0], p[1], 3.2 * G.s, kit.primary, kit.secondary, "10");
        });
        extBill(-11, 10, 4, 12);
      } else tree(-16, 12, 0.9);
      return;
    }
    // 11: MEGASTORE; 12: DÜNYA MAĞAZASI — çatı kafe, deneyim alanı (sanal penaltı), dünya tabelası
    oldB("magaza", 5);
    if (st >= 12) {
      [[3, -9], [6.5, -9], [3, -3.5], [6.5, -3.5]].forEach(function (q, i) {
        umbrella(q[0], q[1], 2.2, 1.3, i % 2 ? "#FFFFFF" : kit.primary, i % 2 ? kit.primary : "#FFFFFF", 10);
      });
      // deneyim alanı: çim + kale + penaltı noktası
      pad(10.5, 11.5, 8, 6, "#4CC86A", { th: 0.3, r: 1 });
      goalS(13.8, 11.5, -1, 3, 1.6, true, true);
      billboard(10.5, 14.8, 0.2, 6, 0.9, "SANAL PENALTI", "#141043", "#22D3EE", { glow: true, posts: false });
      globeS(-13, 10, 1.2, 2.6);
      billboard(-13, 14.2, 0.2, 8, 1.1, "DÜNYA MAĞAZASI", kit.primary, kit.secondary, { glow: true, posts: false });
    }
  };
  BUILD2.akademi = function (st) {
    if (st <= 2) return oldB("akademi", st);
    if (st === 3) {
      // U-12: lisanslı takım — yedek kulübesi, küçük skorbord, bayraklar
      oldB("akademi", 2);
      box(0, 12.6, 6, 1.4, 0, 0.4, "#4A4F86", { noShadow: true });
      box(0, 13.2, 6.2, 0.25, 0, 1.9, "#BFE6FF", { alpha: 0.8 });
      box(0, 12.6, 6.4, 1.8, 1.9, 0.2, kit.primary);
      billboard(-15, -6, 1.2, 3.6, 1.6, "U-12", "#2FAE4E", "#FFFFFF", { glow: true });
      flagpole(15, -8, 6, kit.primary, kit.secondary);
      return;
    }
    if (st === 4) return oldB("akademi", 3);
    if (st <= 8) {
      oldB("akademi", 3);
      // 5: YETENEK MERKEZİ — seçme çadırı, numaralı koniler, tabela
      pyramid(-14, -7, 4.6, 4.6, 0, 3.4, "#FFFFFF", { stripe: "#2FAE4E" });
      box(-14, -4.9, 1.6, 0.3, 0, 1.6, "#2FAE4E", { noShadow: true });
      box(-11.2, -7, 0.3, 3.6, 0.6, 1, "#2FAE4E", { noShadow: true, fR: signFace("SEÇME", "#2FAE4E", "#FFFFFF", 0.5, 0.9, 0.8) });
      if (st === 5) {
        [-6, -3, 0, 3, 6].forEach(function (x) {
          cone(x, 15.5);
        });
        billboard(12, -6, 1.2, 5, 1.4, "YETENEK MERKEZİ", "#1D4ED8", "#FFFFFF", { glow: true });
        return;
      }
      // ANTRENÖR OFİSİ (konteyner)
      box(15, -5, 5, 8, 0, 3, "#FFFFFF", {
        fR: function (cc, FW, FH) {
          win(cc, 1, 0.8, 2, 1.2, true);
          win(cc, FW - 3, 0.8, 2, 1.2, true);
          fsign(cc, FW / 2, FH - 0.5, 4.6, 0.6, "ANTRENÖR", "#1B1648", "#FFFFFF", true);
        },
        fL: function (cc, FW, FH) {
          cc.fillStyle = K("#2FAE4E");
          cc.fillRect(0, 0.3, FW, 0.35);
        },
      });
      roofCap(15, -5, 5, 8, 3, "#2FAE4E");
      if (st >= 7) {
        // U-17 / U-19: iki sıra tribün + ışıklar
        for (var r = 0; r < 2; r++)
          (function (r) {
            box(-1, -3.4 - r * 0.9, 20, 0.9, 0, (r + 1) * 0.5, "#D5D8EA", { top: dk(kit.primary, 0.3), noShadow: true, gloss: false, depth: -8 - r * 0.01 });
            body(-8 - r * 0.01 + 0.001, function () {
              crowdRow(G.c, true, -10, 8, -3.4 - r * 0.9, (r + 1) * 0.5, 40 + r, 0.5);
            });
          })(r);
        [[-1, -1], [1, 1]].forEach(function (q) {
          floodS(q[0] * 15.5, 6 + q[1] * 9.5, 9, false);
        });
        billboard(-16, 14, 1.2, 4.4, 1.6, "U-19", "#2FAE4E", "#FFFFFF", { glow: true });
      }
      if (st >= 8) {
        // BÖLGE AKADEMİLERİ: ilçe haritası panosu + servis minibüsleri
        busS(-7, 17.5, true, true);
        busS(1, 17.5, true, true);
        box(16.5, 5, 0.4, 6.5, 1.2, 4, "#FFFFFF", {
          fR: function (cc, FW, FH) {
            cc.fillStyle = K("#D9F99D");
            cc.fillRect(0.2, 0.2, FW - 0.4, FH - 0.4);
            cc.strokeStyle = K("#65A30D");
            cc.lineWidth = 0.1;
            cc.strokeRect(1, 0.8, FW - 2, FH - 1.6);
            cc.fillStyle = "#E11D48";
            [[1.6, 1.2], [3.4, 2.6], [5, 1.4], [2.4, 3.2], [4.6, 3.3]].forEach(function (q) {
              cc.beginPath();
              cc.arc(q[0], q[1], 0.25, 0, Math.PI * 2);
              cc.fill();
            });
            ftext(cc, "BÖLGE OKULLARI", FW / 2, 0.45, 0.45, "#1B1648", FW * 0.9);
          },
        });
        [-2.6, 2.6].forEach(function (dz) {
          box(16.5, 5 + dz, 0.25, 0.25, 0, 1.2, "#8A90B5", { noShadow: true });
        });
      }
      return;
    }
    oldB("akademi", 4, st === 9 ? { noDorm: true } : null);
    if (st === 9) {
      // AKADEMİ OKULU: yurt yerine sınıf bloğu
      box(14, -12, 8, 8, 0, 7, "#FFF6D8", {
        fL: winFace({ ww: 1.2, wh: 1.4, gx: 0.8, gy: 1, top: 0.8, bot: 0.8 }),
        fR: winFace({ ww: 1.2, wh: 1.4, gx: 0.8, gy: 1, top: 0.8, bot: 0.8 }),
      });
      roofCap(14, -12, 8, 8, 7, "#2FAE4E");
      billboard(14, -7.8, 7.2, 4, 0.9, "OKUL", "#1D4ED8", "#FFFFFF", { posts: false, glow: true });
      return;
    }
    if (st >= 11) {
      // ULUSLARARASI AKADEMİ: bayrak sırası, dünya küresi, dil okulu tabelası
      ["#1D4ED8", "#E11D48", "#FACC15", "#16A34A", "#F97316", "#7C3AED", "#0EA5E9"].forEach(function (col, i) {
        flagpole(-16 + i * 3.4, 18.5, 6, col, i % 2 ? "#FFFFFF" : null);
      });
      globeS(15.5, 6.5, 1.2, 2);
      billboard(14, -7.6, 18.6, 6, 1, "INTERNATIONAL", "#141043", "#FFD43B", { posts: false, glow: true });
    }
    if (st >= 12) {
      // ELİT AKADEMİ KAMPÜSÜ: altyapı stadyumu (karşı tribün), lise tabelası, mezunlar duvarı
      for (var r = 0; r < 3; r++)
        (function (r) {
          box(-4, 15.2 + r * 0.9, 22, 0.9, 0, (r + 1) * 0.5, "#D5D8EA", { top: dk("#2FAE4E", 0.25), noShadow: true, gloss: false, depth: 11 + r * 0.01 });
          body(11 + r * 0.01 + 0.001, function () {
            crowdRow(G.c, true, -14.5, 6.5, 15.2 + r * 0.9, (r + 1) * 0.5, 120 + r, 0.5);
          });
        })(r);
      billboard(-6, -12.2, 6.4, 13, 1.3, "ELİT AKADEMİ KAMPÜSÜ", "#2FAE4E", "#FFFFFF", { posts: false, glow: true });
      box(13, 11.5, 0.5, 5, 0, 2.6, "#FFF7E0", {
        fR: function (cc, FW, FH) {
          for (var i = 0; i < 3; i++) shirtAt(cc, 0.9 + i * 1.6, 1.5, 1, i % 2 ? kit.secondary : kit.primary, i % 2 ? kit.primary : kit.secondary);
          fsign(cc, FW / 2, 0.35, FW - 0.4, 0.5, "MEZUNLAR", "#2FAE4E", "#FFFFFF", true);
        },
      });
    }
  };
  /** Katlı otopark: n kat, araçlar, çatı tabelası, köşe kolonları. */
  function parkGarage(x, z, w, d, n) {
    for (var f = 0; f < n; f++) {
      box(x, z, w, d, f * 3, 0.4, "#C6CAE0", { depth: x + z + f * 0.1 });
      if (f < n - 1)
        for (var i = 0; i < Math.floor(w / 2.6); i++) {
          if ((f + i) % 3 === 2) continue;
          box(x - w / 2 + 1.6 + i * 2.6, z, 1.8, 3.6, f * 3 + 0.4, 1.2, CAR_COLS[(f * 3 + i) % CAR_COLS.length], { noShadow: true, depth: x + z + f * 0.1 + 0.01 });
        }
    }
    box(x, z, w + 0.4, d + 0.4, (n - 1) * 3, 0.7, kit.primary, { depth: x + z + 1, fL: function (cc, FW, FH) { ftext(cc, "P", FW / 2, FH / 2, 0.7, "#FFFFFF"); } });
    [[-1, -1], [1, 1], [-1, 1], [1, -1]].forEach(function (q) {
      box(x + q[0] * (w / 2 - 0.3), z + q[1] * (d / 2 - 0.3), 0.5, 0.5, 0, (n - 1) * 3, "#9AA3C7", { noShadow: true, depth: x + z + (q[0] + q[1]) * (w / 2) });
    });
    // tabela kulesi
    box(x + w / 2 - 1, z + d / 2 + 0.6, 1.4, 0.4, 0, (n - 1) * 3 + 3, "#2563EB", { noShadow: true, fL: function (cc, FW, FH) { ftext(cc, "P", FW / 2, 1, 1, "#FFFFFF"); } });
  }
  /** Tramvay rayları (z boyunca sabit, x ekseninde) + isteğe bağlı vagon. */
  function tramLine(z, x0, x1, car) {
    flat(function () {
      topDo(0.36, function (c) {
        c.fillStyle = K("#9AA3C7");
        c.fillRect(x0, z - 1.6, x1 - x0, 3.2);
        c.strokeStyle = K("#5B6385");
        c.lineWidth = 0.25;
        [-0.8, 0.8].forEach(function (dz) {
          c.beginPath();
          c.moveTo(x0, z + dz);
          c.lineTo(x1, z + dz);
          c.stroke();
        });
        c.strokeStyle = rgba("#5B6385", 0.5);
        c.lineWidth = 0.18;
        for (var x = x0 + 0.5; x < x1; x += 1.2) {
          c.beginPath();
          c.moveTo(x, z - 1.2);
          c.lineTo(x, z + 1.2);
          c.stroke();
        }
      });
    });
    if (car != null) {
      [car - 4.4, car + 4.4].forEach(function (cx, i) {
        box(cx, z, 8.4, 2.4, 0.5, 2.8, i ? "#F7F5FF" : kit.primary, {
          fL: function (cc, FW, FH) {
            cc.fillStyle = K(i ? kit.primary : "#FFFFFF");
            cc.fillRect(0, FH - 0.8, FW, 0.35);
            for (var u = 0.6; u < FW - 1; u += 1.6) {
              cc.fillStyle = TH.night > 0.5 ? "#FFE3A8" : K("#9FD8FF");
              cc.fillRect(u, 0.5, 1.1, 1);
            }
          },
          fR: function (cc, FW, FH) {
            cc.fillStyle = TH.night > 0.5 ? "#FFE3A8" : K("#9FD8FF");
            cc.fillRect(0.3, 0.4, FW - 0.6, 1.1);
          },
        });
      });
      cyl(car, z, 0.08, 3.3, 1.4, "#3A3F72", { noShadow: true });
    }
  }
  /** Takım uçağı (kulüp renklerinde), x ekseni boyunca. */
  function teamPlane(x, z) {
    box(x - 0.5, z, 2.4, 12, 1.9, 0.2, "#DDE2F4", { depth: x + z + 0.5 });
    box(x + 5, z, 1.2, 5, 2.3, 0.2, "#E9ECF8", { noShadow: true, depth: x + z + 0.6 });
    box(x, z, 13, 2, 1, 2, "#FFFFFF", {
      depth: x + z + 0.4,
      fL: function (cc, FW, FH) {
        cc.fillStyle = K(kit.primary);
        cc.fillRect(0, FH * 0.6, FW, FH * 0.25);
        for (var u = 1.2; u < FW - 2; u += 0.9) {
          cc.fillStyle = K("#4A4F86");
          cc.fillRect(u, FH * 0.25, 0.4, 0.35);
        }
        cc.fillStyle = K("#1B1648");
        cc.fillRect(0.2, FH * 0.2, 0.9, 0.5);
      },
    });
    box(x + 5.6, z, 1.8, 0.3, 3, 2.6, kit.primary, { noShadow: true, depth: x + z + 0.7 });
    [x - 4.5, x].forEach(function (wx, i) {
      cyl(wx, z + (i ? 0 : 0), 0.25, 0, 1, "#3A3F72", { noShadow: true });
    });
  }
  function metroTotem(x, z) {
    box(x, z, 0.5, 0.5, 0, 6, "#9AA3C7", { noShadow: true });
    extBill(x, z, 2, 9);
    body(x + 0.5, function () {
      var c = G.c, p = G.P(x, 7.4, z), s = G.s;
      c.beginPath();
      c.arc(p[0], p[1], 1.4 * s, 0, Math.PI * 2);
      c.fillStyle = TH.night > 0.3 ? "#FF3B4E" : K("#DC2626");
      c.fill();
      outline(c);
      c.fillStyle = "#FFFFFF";
      c.font = A.font(1.9 * s, 900);
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillText("M", p[0], p[1] + 0.1 * s);
    });
    anchor({ t: "glow", x: x, y: 7.4, z: z, col: "#FF3B4E" });
  }
  BUILD2.ulasim = function (st) {
    if (st <= 3) return oldB("ulasim", st);
    if (st === 4) {
      // TARAFTAR OTOBÜS HATTI: kulüp renkli şerit, otobüs, durak tabelaları
      oldB("ulasim", 3);
      flat(function () {
        topDo(0.37, function (c) {
          c.fillStyle = K(lit(kit.primary, 0.35));
          c.fillRect(-18, 13.2, 36, 3.6);
          c.fillStyle = "#FFFFFF";
          c.font = A.font(1.4, 900);
          c.textAlign = "center";
          c.textBaseline = "middle";
          c.fillText("OTOBÜS", 10, 15);
        });
      });
      busS(-7, 15, true);
      billboard(-14, 12, 2, 3.6, 1, "RİNG", kit.primary, kit.secondary, { glow: true });
      return;
    }
    if (st <= 6) return oldB("ulasim", st - 1);
    if (st <= 8) {
      // 7: KATLI OTOPARK (şarj istasyonları, bisiklet katı); 8: + TRAMVAY HATTI
      paved("#4E5679");
      parkGarage(8, -8, 16, 12, 5);
      [-15, -12, -9].forEach(function (x) {
        box(x, -11, 1, 0.8, 0, 1.8, "#22C55E", { fL: function (cc, FW, FH) { cc.fillStyle = "#DCFCE7"; cc.fillRect(0.15, 0.3, FW - 0.3, 0.6); } });
        carS(x, -8, false, CAR_COLS[(x + 30) % CAR_COLS.length]);
      });
      billboard(-12, -4.4, 0.4, 5.5, 0.9, "ŞARJ ⚡", "#16A34A", "#FFFFFF", { posts: false });
      busS(-6, 4, true);
      for (var i = 0; i < 4; i++) bikeS(4 + i * 1.5, 4, ["#FF4D5E", "#3B82F6", "#22C55E", "#FFD43B"][i]);
      if (st === 8) {
        tramLine(14.5, -19, 19, -3);
        box(10, 11.6, 6, 1.6, 0, 0.3, "#C6CAE0", { noShadow: true });
        box(10, 11.6, 6.4, 2, 3, 0.3, kit.primary, { noShadow: true });
        [7.4, 12.6].forEach(function (x) {
          box(x, 11.2, 0.25, 0.25, 0, 3, "#9AA3C7", { noShadow: true });
        });
        billboard(15, 11.6, 0.5, 3.8, 1, "TRAMVAY", "#DC2626", "#FFFFFF", { posts: true });
      } else {
        busShelter(8, 12);
        tree(-17, 16, 0.9);
      }
      return;
    }
    if (st === 9) {
      // METRO İSTASYONU (eski çizim) + tramvay hattı
      oldB("ulasim", 6);
      tramLine(17, -13, 19, 12);
      return;
    }
    // 10: KULÜP HAVA TERMİNALİ — hangar, takım uçağı, özel terminal, metro bağlantısı
    paved("#DADFEA");
    flat(function () {
      topDo(0.36, function (c) {
        c.fillStyle = K("#5A6285");
        c.fillRect(-19, -3, 26, 13);
        c.strokeStyle = "#FFD43B";
        c.lineWidth = 0.3;
        c.setLineDash([1.2, 0.9]);
        c.beginPath();
        c.moveTo(-19, 4);
        c.lineTo(7, 4);
        c.stroke();
        c.setLineDash([]);
      });
    });
    vaultX(-7, -10, 20, 6, 0, "#C6CAE0", { rib: 2.4, ribCol: "#9AA3C7", cap: "#AEB4C8" });
    billboard(-7, -3.6, 5.6, 7, 1.1, "HANGAR", kit.primary, kit.secondary, { posts: false });
    teamPlane(-7, 4);
    parkGarage(11, -9, 12, 11, 4);
    box(12, 6, 9, 6, 0, 5, "#E8F7FF", {
      fL: both(winFace({ ww: 1.6, wh: 2.6, gx: 0.3, top: 1.4, rows: 1, glass: "#9FE0FF", litK: 0.9 }), signFace("ÖZEL TERMİNAL", "#141043", "#FFD43B", 0.6, 0.92, 0.8)),
      fR: winFace({ ww: 1.4, wh: 2.6, top: 1.4, rows: 1, glass: "#9FE0FF" }),
    });
    roofCap(12, 6, 9, 6, 5, "#E3E6F4");
    cyl(15, 4.5, 0.9, 5.4, 4, "#F2F4FF", { noShadow: true, top: "#9FE0FF" });
    anchor({ t: "beacon", x: 15, y: 9.6, z: 4.5 });
    metroTotem(4, 13);
    tramLine(17, -19, 19, -8);
  };
  /** Masaj odası önü: buz (5'te sıcak-soğuk) havuzları + sauna. */
  function saunaPools(hot) {
      // MASAJ + BUZ HAVUZU + sauna
    pool(11, 4, 4, 3, hot ? "#FFB08A" : "#BDEBFF");
    pool(11, 9, 4, 3, "#BDEBFF");
    box(11, 6.5, 0.4, 0.4, 0, 0.1, "#FFFFFF", { noShadow: true });
    box(-11, 8, 5, 4, 0, 2.6, "#C98A4B", {
      fL: function (cc, FW, FH) {
        cc.strokeStyle = rgba("#6B3A1E", 0.4);
        cc.lineWidth = 0.08;
        for (var y = 0.3; y < FH; y += 0.35) {
          cc.beginPath();
          cc.moveTo(0, y);
          cc.lineTo(FW, y);
          cc.stroke();
        }
        fsign(cc, FW / 2, 0.55, 3.6, 0.6, "SAUNA", "#7A3E10", "#FFFFFF", true);
      },
    });
    roofCap(-11, 8, 5, 4, 2.6, "#7A3E10");
    anchor({ t: "steam", x: -10, y: 3.5, z: 7 });
  }
  /** Biyomekanik laboratuvarı: hareket kameralı cam salon + ölçüm koşu şeridi. */
  function bioLab() {
    box(3, 12, 9, 5, 0, 4.2, "#E8F7FF", {
      fL: both(winFace({ ww: 1.6, wh: 2.4, gx: 0.3, top: 1.4, rows: 1, glass: "#9FE0FF", litK: 0.9 }), signFace("BİYOMEKANİK", "#0EA5E9", "#FFFFFF", 0.6, 0.9, 0.8)),
      fR: winFace({ ww: 1.4, wh: 2.4, top: 1.4, rows: 1, glass: "#9FE0FF" }),
    });
    roofCap(3, 12, 9, 5, 4.2, "#0EA5E9");
    [[-0.8, 10], [6.8, 10], [-0.8, 14], [6.8, 14]].forEach(function (q) {
      box(q[0], q[1], 0.5, 0.5, 4.6, 0.5, "#1B1648", { noShadow: true, depth: 20, top: "#22D3EE" });
    });
    flat(function () {
      topDo(0.34, function (c) {
        c.fillStyle = K("#E2574C");
        c.fillRect(-14, 16, 20, 2);
        c.strokeStyle = "#FFFFFF";
        c.lineWidth = 0.15;
        for (var x = -12; x < 6; x += 4) {
          c.beginPath();
          c.moveTo(x, 16);
          c.lineTo(x, 18);
          c.stroke();
        }
      });
    });
  }
  BUILD2.saglik = function (st) {
    if (st <= 3) return oldB("saglik", st);
    if (st <= 5) {
      // 4: MASAJ VE BUZ HAVUZU; 5: + REJENERASYON MERKEZİ (sıcak-soğuk havuz, uyku odaları)
      oldB("saglik", 3);
      saunaPools(st === 5);
      if (st === 5) {
        box(11, -10, 10, 6, 0, 3.6, "#F0FDF4", {
          fL: both(winFace({ ww: 1.4, wh: 1.2, gx: 0.9, top: 1.6, rows: 1, glass: "#C4B5FD" }), signFace("REJENERASYON", "#16A34A", "#FFFFFF", 0.6, 0.92, 0.75)),
          fR: winFace({ ww: 1.2, wh: 1.2, top: 1.6, rows: 1, glass: "#C4B5FD" }),
        });
        box(11, -10, 10.4, 6.4, 3.6, 0.4, "#4CC86A", { noShadow: true, top: "#5FD47A" });
        anchor({ t: "steam", x: 11, y: 1, z: 4 });
      }
      return;
    }
    if (st === 6) return oldB("saglik", 4);
    if (st <= 10) {
      oldB("saglik", 4);
      // 7: BİYOMEKANİK; 8: + SPOR TIP (lab kanadı); 9: + GÖRÜNTÜLEME (MR); 10: + KRİYO VE OKSİJEN
      bioLab();
      if (st >= 8) {
      // SPOR TIP: laboratuvar kanadı
        box(10, -12, 9, 7, 0, 9, "#FFFFFF", {
          fL: both(winFace({ ww: 1.2, wh: 1.3, gx: 0.6, gy: 1, top: 1.6, bot: 0.8, glass: "#9FE0FF" }), signFace("LAB", "#0EA5E9", "#FFFFFF", 0.7, 0.45, 0.8)),
          fR: winFace({ ww: 1.2, wh: 1.3, gx: 0.6, gy: 1, top: 1.6, bot: 0.8, glass: "#9FE0FF" }),
        });
        roofCap(10, -12, 9, 7, 9, "#0EA5E9");
      }
      if (st >= 9) {
        // GÖRÜNTÜLEME: MR pavyonu (yuvarlak)
        cyl(12.5, 11.5, 3.2, 0, 5, "#EAF3FF", {
          fS: function (c, b, t, rx, ry) {
            c.fillStyle = TH.night > 0.5 ? "rgba(255,217,138,0.8)" : "rgba(143,211,255,0.85)";
            c.fillRect(b[0] - rx, t[1] + (b[1] - t[1]) * 0.35, rx * 2, (b[1] - t[1]) * 0.25);
          },
          top: "#0EA5E9",
        });
        billboard(12.5, 15, 0.2, 5, 1, "MR · ULTRASON", "#0EA5E9", "#FFFFFF", { posts: false, glow: true });
        anchor({ t: "beacon", x: 10, y: 9.6, z: -12 });
      }
      if (st >= 10) {
        cyl(8.6, 17, 1.3, 0, 3.6, "#E0F2FE", {
          top: "#BAE6FD",
          fS: function (c, b2, t, rx) {
            c.fillStyle = "rgba(125,211,252,0.6)";
            c.fillRect(b2[0] - rx, t[1] + (b2[1] - t[1]) * 0.3, rx * 2, (b2[1] - t[1]) * 0.15);
          },
        });
        anchor({ t: "steam", x: 8.6, y: 4, z: 17 });
        vaultX(15.5, 17.5, 4, 1.3, 0.3, "#FFFFFF", { rib: 1.1, ribCol: "#7DD3FC", cap: "#E0F2FE" });
        billboard(16.5, 8.2, 0.3, 4, 1, "KRİYO · O₂", "#0284C7", "#FFFFFF", { posts: true, glow: true });
      }
      return;
    }
    oldB("saglik", 5);
    if (st >= 12) {
      // ELİT SAĞLIK KAMPÜSÜ: araştırma birimi, olimpik rehab havuzu, poliklinik
      box(11.5, 12, 6, 6, 0, 8, "#FFFFFF", {
        fL: both(winFace({ ww: 1.1, wh: 1.2, gx: 0.6, gy: 1, top: 1.8, bot: 0.6, glass: "#9FE0FF" }), signFace("ARAŞTIRMA", "#0EA5E9", "#FFFFFF", 0.7, 0.9, 0.8)),
        fR: winFace({ ww: 1.1, wh: 1.2, gx: 0.6, gy: 1, top: 1.8, bot: 0.6, glass: "#9FE0FF" }),
      });
      roofCap(11.5, 12, 6, 6, 8, "#0EA5E9");
      pool(-2, 15.5, 14, 3.4, "#38BDF8");
      flat(function () {
        topDo(0.45, function (c) {
          c.strokeStyle = "rgba(255,255,255,0.8)";
          c.lineWidth = 0.12;
          for (var z = 14.6; z < 17; z += 0.85) {
            c.beginPath();
            c.moveTo(-8.6, z);
            c.lineTo(4.6, z);
            c.stroke();
          }
        });
      });
      [-15, 15].forEach(function (x) {
        flagpole(x, -15, 9, "#0EA5E9", "#FFFFFF");
      });
      billboard(-12, 4.5, 6, 6, 1.1, "SAĞLIK KAMPÜSÜ", "#0EA5E9", "#FFFFFF", { posts: false, glow: true });
    }
  };
  BUILD2.tv = function (st) {
    if (st <= 2) return oldB("medya", st);
    if (st === 3) {
      // RADYO VE PODCAST STÜDYOSU: küçük kabin, YAYINDA ışığı, anten direği
      lawn();
      pad(0, 0, 18, 15, PAVE, { th: 0.3, fn: tiles(1.5), r: 3 });
      box(-1, -3, 9, 6, 0, 3.6, "#2A2F55", {
        fL: function (cc, FW, FH) {
          win(cc, 0.8, 1.2, 3.2, 1.5, true, "#FFD98A");
          A.roundRect(cc, FW - 2.4, FH - 2.5, 1.5, 2.5, 0.2);
          cc.fillStyle = K("#4A4F86");
          cc.fill();
          fsign(cc, FW / 2, 0.5, FW - 1, 0.7, "RADYO · PODCAST", "#E11D48", "#FFFFFF", true);
        },
        fR: function (cc, FW, FH) {
          win(cc, FW / 2 - 1, 1.2, 2, 1.3, true, "#FFD98A");
        },
      });
      roofCap(-1, -3, 9, 6, 3.6, "#E11D48");
      // YAYINDA ışığı
      box(-3, 0.1, 2.6, 0.3, 3.9, 0.9, "#E11D48", { noShadow: true, fL: signFace("YAYINDA", "#E11D48", "#FFFFFF", 0.45, 0.95, 0.8) });
      anchor({ t: "glow", x: -3, y: 4.3, z: 0.3, col: "#FF4D5E" });
      latticeS(6, -6, 9, 0.9);
      anchor({ t: "beacon", x: 6, y: 9, z: -6 });
      // dış masa: iki mikrofon
      box(1, 4, 3, 1.4, 0.8, 0.15, "#E0A562");
      [0.2, 1.8].forEach(function (x) {
        cyl(x, 4, 0.08, 0.95, 0.6, "#1B1648", { noShadow: true });
        dome(x, 4, 0.22, 1.5, "#3A3F72", { hk: 1.2 });
      });
      box(1, 4, 0.2, 0.2, 0, 0.8, "#8A5426", { noShadow: true });
      tree(-15, -13, 1);
      tree(14, 12, 0.9);
      return;
    }
    if (st <= 5) return oldB("medya", st - 1);
    if (st <= 7) {
      // 6: STÜDYO; 7: + DİJİTAL YAYIN PLATFORMU (dev telefon ekranı, sunucu dolapları)
      paved();
        // STÜDYO
      box(-3, -5, 15, 10, 0, 7, "#2A2F55", {
        fL: function (cc, FW, FH) {
          windowsGrid(cc, FW, FH, { ww: 2.4, wh: 1.6, gx: 0.8, top: 4, rows: 1, glass: "#9FD8FF" });
          cc.fillStyle = "#141043";
          cc.fillRect(1, 0.8, FW - 2, 2.4);
          ftext(cc, "STÜDYO", FW / 2 - 1.2, 2, 1.3, TH.night > 0.5 ? "#FFFFFF" : K("#FFFFFF"), FW * 0.6);
          cc.beginPath();
          cc.arc(FW - 3, 2, 0.55, 0, Math.PI * 2);
          cc.fillStyle = "#FF3355";
          cc.fill();
        },
        fR: winFace({ ww: 1.6, wh: 1.6, top: 4, rows: 1, glass: "#9FD8FF" }),
      });
      roofCap(-3, -5, 15, 10, 7, kit.primary);
      anchor({ t: "rec", x: -3, y: 8.2, z: 0 });
      latticeS(11, -9, 18, 1.5);
      dishS(11, -9, 16, 1.1, -0.6);
      dishS(-7, -7, 7.8, 1, -0.4);
      busS(7, 8, true, true);
      tree(-16, 12, 1);
      tree(-16, -15, 1);
      if (st === 7) {
        box(-3, 4.5, 4.4, 0.6, 0.4, 7.6, "#141043", {
          fL: function (cc, FW, FH) {
            A.roundRect(cc, 0.25, 0.3, FW - 0.5, FH - 0.6, 0.5);
            var g = cc.createLinearGradient(0, 0, 0, FH);
            g.addColorStop(0, K(kit.primary));
            g.addColorStop(1, "#22D3EE");
            cc.fillStyle = g;
            cc.fill();
            ftext(cc, "ELİTLİG+", FW / 2, 1.3, 0.75, "#FFFFFF", FW * 0.85);
            cc.beginPath();
            cc.moveTo(FW / 2 - 0.6, FH / 2 - 0.8);
            cc.lineTo(FW / 2 + 0.8, FH / 2);
            cc.lineTo(FW / 2 - 0.6, FH / 2 + 0.8);
            cc.closePath();
            cc.fillStyle = "#FFFFFF";
            cc.fill();
            ftext(cc, "CANLI", FW / 2, FH - 1.2, 0.6, "#FFFFFF", FW * 0.8);
          },
        });
        [0, 1.6, 3.2].forEach(function (dx) {
          box(1.5 + dx, 3, 1.2, 1.2, 0, 2.6, "#1B1648", { fL: function (cc, FW, FH) { for (var y = 0.3; y < FH - 0.2; y += 0.45) { cc.fillStyle = SP.rnd() < 0.5 ? "#22D3EE" : "#4ADE80"; cc.fillRect(0.2, y, 0.25, 0.15); } } });
        });
      }
      return;
    }
    oldB("medya", 5);
    if (st >= 9) {
      // MEDYA MERKEZİ: cam kanat
      box(10.5, 10.5, 7, 6, 0, 9, "#BFE6FF", {
        fL: both(winFace({ ww: 1.6, wh: 1.8, gx: 0.3, gy: 0.6, top: 2, bot: 0.4, glass: "#7CC7FF", litK: 0.8 }), signFace("MEDYA MERKEZİ", "#141043", "#FFD43B", 0.8, 0.95, 0.9)),
        fR: winFace({ ww: 1.6, wh: 1.8, gx: 0.3, gy: 0.6, top: 2, bot: 0.4, glass: "#7CC7FF", litK: 0.8 }),
      });
      roofCap(10.5, 10.5, 7, 6, 9, kit.primary);
    }
    if (st >= 10) {
      // UYDU YAYIN MERKEZİ: büyük çanak çiftliği
      [[-15.5, -9], [-15.5, -2], [-15.5, 5]].forEach(function (q, i) {
        box(q[0], q[1], 2.4, 2.4, 0, 1.2, "#C6CAE0", { noShadow: true });
        dishS(q[0], q[1], 1.6, 3, -0.9 + i * 0.3);
      });
      anchor({ t: "beacon", x: -15.5, y: 5.5, z: -2 });
      dishS(10.5, 10.5, 9.8, 2, -0.6);
    }
    if (st >= 11) {
      // ULUSLARARASI MEDYA KAMPÜSÜ: küre, ülke bayrakları
      globeS(3, 15, 1, 1.9);
      ["#1D4ED8", "#E11D48", "#FACC15", "#16A34A", "#F97316"].forEach(function (col, i) {
        flagpole(-15 + i * 3, 17, 6, col, i % 2 ? "#FFFFFF" : null);
      });
      billboard(-4, 0.6, 10.7, 10, 1.2, "INTERNATIONAL MEDIA", "#141043", "#22D3EE", { posts: false, glow: true });
    }
  };
  /** Ahşap bungalov (kamp köyü / tatil köyü villası). */
  function bungalow(x, z, roof, w) {
    w = w || 4.4;
    gable(x, z, w, 3.6, 0, 2.4, 1.5, "#E9C89B", roof, {
      fL: function (cc, FW, FH) {
        cc.strokeStyle = rgba("#8A5426", 0.35);
        cc.lineWidth = 0.07;
        for (var y = 0.35; y < FH; y += 0.35) {
          cc.beginPath();
          cc.moveTo(0, y);
          cc.lineTo(FW, y);
          cc.stroke();
        }
        win(cc, 0.5, 0.7, 1.1, 0.9, true);
        A.roundRect(cc, FW - 1.6, FH - 1.9, 1, 1.9, 0.15);
        cc.fillStyle = K("#6B3A1E");
        cc.fill();
      },
    });
  }
  /** Yüksek irtifa kampı: karlı dağ, çam ağaçları, hipoksi odası. */
  function altitudeCamp() {
    pyramid(14.5, -14, 6, 6, 0, 9, "#8C9A82");
    pyramid(14.5, -14, 2.4, 2.4, 5.4, 3.6, "#FFFFFF", { noShadow: true, depth: 2 });
    [[11.5, -17], [17, -10], [11.5, -11.5]].forEach(function (q) {
      tree(q[0], q[1], 0.75, "#2F7D4F");
    });
    box(13.5, 3.5, 5, 3.4, 0, 3, "#F2F4FF", {
      fL: both(function (cc, FW, FH) { win(cc, 0.5, 1.1, 1.2, 1, true, "#C4B5FD"); }, signFace("İRTİFA ODASI", "#4338CA", "#FFFFFF", 0.5, 0.95, 0.65)),
      fR: function (cc, FW, FH) {
        ftext(cc, "2.000 m", FW / 2, FH / 2 + 0.3, 0.7, "#4338CA", FW * 0.9);
      },
    });
    roofCap(13.5, 3.5, 5, 3.4, 3, "#4338CA");
  }
  BUILD2.otel = function (st) {
    if (st <= 2) return oldB("kamp", st);
    if (st === 3) {
      // KAMP KÖYÜ: pansiyon + ahşap bungalovlar + kamp ateşi
      oldB("kamp", 2);
      bungalow(-11.5, 2, "#2F7D4F");
      bungalow(12, 1, "#B5523A");
      bungalow(-9, 9.5, "#1D4ED8");
      [0, 1, 2, 3].forEach(function (k) {
        box(1 + Math.cos(k) * 0.6, 9 + Math.sin(k) * 0.6, 1.4, 0.3, 0, 0.3, "#8A5426", { noShadow: true });
      });
      anchor({ t: "fire", x: 1, y: 0.6, z: 9 });
      billboard(12, 9, 0.6, 4.6, 1, "KAMP KÖYÜ", "#2F7D4F", "#FFFFFF", {});
      return;
    }
    if (st <= 5) return oldB("kamp", st - 1);
    if (st <= 8) {
      // 6: YÜKSEK İRTİFA KAMPI; 7: + SPA; 8: + TERMAL HAVUZLAR
      oldB("kamp", 4);
      altitudeCamp();
      if (st === 6) return;
      vaultX(-11, 11, 9, 3, 0, "#BFE6FF", { alpha: 0.85, rib: 1.8, lit: "#FFD590", cap: "#9FD8FF" });
      cyl(12, 11, 2.2, 0, 0.6, "#F2F0FA", { top: "#5FE0F5" });
      anchor({ t: "steam", x: 12, y: 1, z: 11 });
      anchor({ t: "steam", x: -11, y: 3.4, z: 11 });
      billboard(-11, 15, 0.3, 4, 1, "SPA", "#0F766E", "#FFFFFF", { posts: false, glow: true });
      if (st === 8) {
        // TERMAL: basamaklı traverten havuzlar, buhar
        [[-1.5, 1.4], [3.2, 1], [7.9, 0.6]].forEach(function (q, i) {
          box(q[0], 13, 4.4, 3.6, 0, q[1], "#F5EFE6", { top: i % 2 ? "#FFC79A" : "#FFB07A", depth: 13 + q[0] - i * 0.01 });
          anchor({ t: "steam", x: q[0], y: q[1] + 0.4, z: 13 });
        });
        billboard(3.2, 15.3, 0.2, 5, 0.9, "TERMAL", "#C2410C", "#FFFFFF", { posts: false, glow: true });
      }
      return;
    }
    oldB("kamp", 5);
    if (st >= 10) {
      // ELİT KAMP VE TATİL KÖYÜ: önde renkli villalar, tahta iskele yolu, tabela
      flat(function () {
        topDo(0.34, function (c) {
          c.fillStyle = K("#D9925A");
          c.fillRect(-16, 15.4, 32, 1.6);
        });
      });
      [["#0F766E", -11], ["#E2574C", -4], [kit.primary, 3], ["#F59E0B", 10]].forEach(function (q) {
        bungalow(q[1], 12.6, q[0], 5);
      });
      billboard(13, 4.5, 12.6, 8, 1.2, "TATİL KÖYÜ", "#0F766E", "#FFD43B", { posts: false, glow: true });
    }
  };
  BUILD2.universite = function (st) {
    if (st <= 1) {
      // ANTRENÖRLÜK KURSU: prefabrik sınıf + açık hava tahtası
      lawn();
      box(7, -9, 9, 5, 0, 3, "#FFFFFF", {
        fL: function (cc, FW, FH) {
          cc.fillStyle = K("#1E3A8A");
          cc.fillRect(0, FH - 0.5, FW, 0.25);
          win(cc, 0.8, 0.8, 1.8, 1.1, true);
          win(cc, FW - 2.6, 0.8, 1.8, 1.1, true);
          A.roundRect(cc, FW / 2 - 0.7, FH - 2.3, 1.4, 2.3, 0.15);
          cc.fillStyle = K("#4A4F86");
          cc.fill();
        },
      });
      roofCap(7, -9, 9, 5, 3, "#1E3A8A");
      billboard(7, -5.6, 0.3, 7, 1, "ANTRENÖRLÜK KURSU", "#1E3A8A", "#FFFFFF", { posts: true });
      // tahta + sandalyeler
      box(-6, -2, 4.4, 0.25, 0.8, 2.4, "#FFFFFF", {
        noShadow: true,
        fL: function (cc, FW, FH) {
          cc.strokeStyle = K("#2563EB");
          cc.lineWidth = 0.12;
          cc.beginPath();
          cc.arc(1.2, 1.2, 0.4, 0, Math.PI * 2);
          cc.moveTo(1.6, 1.2);
          cc.quadraticCurveTo(2.4, 0.4, 3.4, 1);
          cc.stroke();
          cc.strokeStyle = K("#E11D48");
          cc.beginPath();
          cc.moveTo(2.6, 1.6);
          cc.lineTo(3.2, 2);
          cc.moveTo(3.2, 1.6);
          cc.lineTo(2.6, 2);
          cc.stroke();
        },
      });
      [-7.5, -4.5].forEach(function (x) {
        box(x, -2, 0.2, 0.2, 0, 0.8, "#5B6385", { noShadow: true });
      });
      for (var r = 0; r < 2; r++) for (var k = 0; k < 4; k++) box(-8.5 + k * 1.6, 2 + r * 1.8, 0.8, 0.8, 0, 0.7, "#3B82F6", { noShadow: true, top: "#60A5FA" });
      [0, 2, 4, 6].forEach(function (x) {
        cone(x + 4, 9);
      });
      tree(-15, -15, 1.1);
      tree(16, 13, 0.9);
      tree(-16, 13, 0.8);
      return;
    }
    // Şehir 2.1: 5 enstitü, 7 yüksek lisans, 9 uluslararası, 10 FBÜ araya/sona girdi → eski çizim sırası
    var ens = st >= 5, grad = st >= 7, intl = st >= 9, fbu = st >= 10;
    st = st <= 4 ? st : st <= 7 ? (st === 5 ? 4 : 5) : 6;
    paved(st >= 5 ? "#ECEFF5" : null);
    if (st >= 5)
      flat(function () {
        topDo(0.32, function (c) {
          A.roundRect(c, -5, -2, 15, 11, 2);
          c.fillStyle = K(GRASSP);
          c.fill();
          c.strokeStyle = K("#F1E4C8");
          c.lineWidth = 1.2;
          c.beginPath();
          c.moveTo(2.5, -2);
          c.lineTo(2.5, 9);
          c.moveTo(-5, 3.5);
          c.lineTo(10, 3.5);
          c.stroke();
        });
      });
    if (grad) {
      // YÜKSEK LİSANS: üç katlı tuğla lisansüstü binası (seminer salonunun yerinde)
      gable(12, -11, 10, 8, 0, 9, 2.6, "#E7A77E", "#7C2D12", {
        fL: function (cc, FW, FH) {
          windowsGrid(cc, FW, FH, { ww: 1.2, wh: 1.4, gx: 0.8, gy: 1.4, top: 1.6, bot: 0.6, glass: "#9FD8FF" });
          fsign(cc, FW / 2, 0.6, 7.5, 0.75, "LİSANSÜSTÜ", "#7C2D12", "#FFFFFF", true);
        },
        fR: winFace({ ww: 1.2, wh: 1.4, gx: 0.8, gy: 1.4, top: 1.6, bot: 0.6, glass: "#9FD8FF" }),
      });
    } else
    // SEMİNER SALONU
    gable(12, -11, 10, 8, 0, 4.4, 2.4, "#F6D7B0", "#9A3412", {
      fL: function (cc, FW, FH) {
        windowsGrid(cc, FW, FH, { ww: 1.4, wh: 1.4, gx: 0.8, top: 1.4, rows: 1, skip: function (r, k, R, Cn) { return k === Math.floor(Cn / 2); } });
        A.roundRect(cc, FW / 2 - 0.8, FH - 2.3, 1.6, 2.3, 0.2);
        cc.fillStyle = K("#6B3A1E");
        cc.fill();
        fsign(cc, FW / 2, 0.55, 7, 0.7, "SEMİNER", "#9A3412", "#FFFFFF", true);
      },
    });
    if (st >= 3) facultyBlock(-6, -10, 18, 9, st >= 6 ? 12 : 9.5, fbu ? "FUTBOL BİLİMLERİ ÜNİ." : st >= 6 ? "ELİTLİG ÜNİVERSİTESİ" : "SPOR BİLİMLERİ", "#FFF3DF", st >= 6 && (fbu ? "gold" : true));
    else {
      bench(-6, -6, true, 4);
      tree(-8, -12, 1.1);
      tree(-1, -15, 0.9);
    }
    if (st >= 4) {
      // KÜTÜPHANE (sütunlu) + veri laboratuvarı
      box(-12, 7, 11, 8, 0, 6, "#F4F1FA", {
        fL: function (cc, FW, FH) {
          for (var u = 0.7; u < FW - 0.3; u += 1.3) {
            cc.fillStyle = K("#E2DDF0");
            cc.fillRect(u, 1.4, 0.55, FH - 1.4);
          }
          fsign(cc, FW / 2, 0.65, 7.5, 0.8, "KÜTÜPHANE", "#1E3A8A", "#FFFFFF", true);
        },
        fR: winFace({ ww: 1.2, wh: 2.4, top: 1.6, rows: 1, glass: "#9FD8FF" }),
      });
      gable(-12, 7, 11, 8, 6, 0.01, 2, "#F4F1FA", "#C9C3DD", { depth: -4.9, over: 0.3 });
      var lh = ens ? 9 : 5.5;
      box(12, 3, 7, 7, 0, lh, "#BFF3FF", {
        fL: both(winFace({ ww: 1.4, wh: 1.4, gx: 0.4, gy: 0.5, top: 1.4, bot: 0.4, glass: "#7FE3FF", litK: 0.9 }), signFace(ens ? "ENSTİTÜ" : "LAB", "#141043", "#22D3EE", 0.6, 0.75, 0.7)),
        fR: winFace({ ww: 1.4, wh: 1.4, gx: 0.4, gy: 0.5, top: 1.4, bot: 0.4, glass: "#7FE3FF", litK: 0.9 }),
      });
      roofCap(12, 3, 7, 7, lh, "#E3E6F4");
      if (ens) {
        // ARAŞTIRMA ENSTİTÜSÜ: çatıda gözlem kubbesi + anten
        cyl(12, 3, 2.4, lh + 0.4, 1, "#E9ECF8", { noShadow: true, depth: 30 });
        dome(12, 3, 2.4, lh + 1.4, "#C9D1EC", { ribs: true, depth: 31 });
        cyl(14.2, 1, 0.12, lh + 0.4, 3.4, "#5B6385", { noShadow: true, depth: 32 });
        anchor({ t: "beacon", x: 14.2, y: lh + 3.8, z: 1 });
      }
    } else {
      tree(-13, 8, 1);
      tree(12, 4, 0.9);
      bush(-9, 12, 1);
    }
    if (st >= 5) {
      // YERLEŞKE: yurt + kafeterya
      box(10, 15, 13, 6, 0, 7.5, "#E8F0FF", {
        fL: both(winFace({ ww: 1.1, wh: 1.2, gx: 0.6, gy: 0.9, top: 1.6, bot: 0.6 }), signFace("YURT", "#1D4ED8", "#FFFFFF", 0.65, 0.4, 0.75)),
        fR: winFace({ ww: 1.1, wh: 1.2, gx: 0.6, gy: 0.9, top: 1.6, bot: 0.6 }),
      });
      roofCap(10, 15, 13, 6, 7.5, "#1D4ED8");
      [-3, 1].forEach(function (x, i) {
        table(x, 15);
        umbrella(x, 15, 2.3, 1.4, i ? "#FFFFFF" : "#1D4ED8", i ? "#1D4ED8" : "#FFFFFF");
      });
      tree(-1, 3, 0.8);
      tree(6, 3, 0.8);
      tree(-17, 17, 0.8);
    } else {
      tree(10, 15, 1);
      tree(16, 9, 0.8);
    }
    if (st >= 6) {
      turkFlag(-16, -2, 9);
      flagpole(-16, 1.5, 7, kit.primary, kit.secondary);
    }
    if (intl) {
      // ULUSLARARASI KAMPÜS: avludaki küre + ülke bayrakları sırası
      globeS(16.5, 9, 0.9, 1.5);
      billboard(10, 17.4, 7.9, 8, 1.2, "INTERNATIONAL", "#141043", "#FFD43B", { posts: false, glow: true });
      ["#1D4ED8", "#E11D48", "#FACC15", "#16A34A", "#F97316"].forEach(function (col, i) {
        flagpole(-16 + i * 2.6, 18.5, 6, col, i % 2 ? "#FFFFFF" : null);
      });
    }
    if (fbu) {
      // FUTBOL BİLİMLERİ ÜNİVERSİTESİ: anıtsal kapı
      [-1, 1].forEach(function (sx) {
        box(-1 + sx * 3.4, 18.6, 1, 1, 0, 5.4, "#FFF3DF", { top: "#C9A227" });
      });
      box(-1, 18.6, 8.2, 1, 5.4, 1.4, "#1E3A8A", { fL: signFace("FUTBOL BİLİMLERİ", "#1E3A8A", "#FFD43B", 0.7, 0.95, 1) });
      crestS(-1, 18.6, 7.2, 1.1);
    }
  };
  BUILD2.scout = function (st) {
    if (st <= 1) {
      // GÖZLEMCİ MASASI
      lawn();
      box(0, 0, 3.2, 1.6, 0.8, 0.15, "#E0A562", { noShadow: true });
      [[-1.4, -0.6], [1.4, -0.6], [-1.4, 0.6], [1.4, 0.6]].forEach(function (q) {
        box(q[0], q[1], 0.15, 0.15, 0, 0.8, "#8A5426", { noShadow: true });
      });
      box(-0.4, -0.2, 1.2, 0.8, 0.95, 0.06, "#3A3F72", { noShadow: true });
      box(-0.4, -0.55, 1.2, 0.08, 0.95, 0.8, "#1B1648", { noShadow: true, fL: function (cc, FW, FH) { cc.fillStyle = TH.night > 0.5 ? "#7FE3FF" : K("#5AA2E8"); cc.fillRect(0.06, 0.06, FW - 0.12, FH - 0.12); } });
      box(0.2, 1.6, 0.9, 0.9, 0, 0.5, "#FF8A3D", { noShadow: true });
      umbrella(0.6, -0.8, 2.6, 1.8, "#FFFFFF", "#1D4ED8");
      // dürbün sehpası
      cyl(3.4, -1, 0.1, 0, 1.5, "#3A3F72", { noShadow: true });
      box(3.4, -1, 0.9, 0.4, 1.5, 0.35, "#1B1648", { noShadow: true });
      billboard(-5, 3, 0.4, 3.4, 1.1, "SCOUT", "#1D4ED8", "#FFFFFF", {});
      tree(-14, -14, 1.1);
      tree(14, -13, 1);
      tree(13, 14, 0.8);
      tree(-15, 13, 0.9);
      return;
    }
    paved(st >= 4 ? "#ECEFF5" : null);
    if (st === 2) {
      // VİDEO ARŞİVİ
      box(-2, -5, 12, 8, 0, 4.4, "#2A2F55", {
        fL: function (cc, FW, FH) {
          for (var i = 0; i < 4; i++) {
            cc.fillStyle = "#0B0A2A";
            cc.fillRect(0.8 + i * 2.7, 1.6, 2.2, 1.5);
            cc.fillStyle = TH.night > 0.3 ? ["#7FE3FF", "#9EF0A8", "#FFD98A", "#C4B5FD"][i] : K(["#5AA2E8", "#4CC86A", "#FFB547", "#8B5CF6"][i]);
            cc.fillRect(0.95 + i * 2.7, 1.75, 1.9, 1.2);
          }
          fsign(cc, FW / 2, 0.55, 8, 0.75, "VİDEO ARŞİVİ", "#1D4ED8", "#FFFFFF", true);
        },
        fR: winFace({ ww: 1.4, wh: 1.2, top: 1.6, rows: 1 }),
      });
      roofCap(-2, -5, 12, 8, 4.4, "#1D4ED8");
      dishS(1, -6, 5.2, 0.9, -0.5);
      // film makarası tabelası
      body(5, function () {
        var p = G.P(8, 3.2, 0), c = G.c, s = G.s;
        c.beginPath();
        c.arc(p[0], p[1], 1.2 * s, 0, Math.PI * 2);
        c.fillStyle = K("#3A3F72");
        c.fill();
        c.fillStyle = K("#E9ECF8");
        for (var i = 0; i < 5; i++) {
          var a = (i / 5) * Math.PI * 2;
          c.beginPath();
          c.arc(p[0] + Math.cos(a) * 0.6 * s, p[1] + Math.sin(a) * 0.6 * s, 0.26 * s, 0, Math.PI * 2);
          c.fill();
        }
      });
      extBill(8, 0, 1.6, 4.6);
      box(8, 0, 0.3, 0.3, 0, 2, "#8A90B5", { noShadow: true });
      tree(-15, 12, 1);
      tree(15, -14, 1);
      tree(14, 13, 0.8);
      return;
    }
    // 3+: gözlemciler binası (6'da veri merkezi, 7'de yapay zekâ, 8'de Avrupa merkezi).
    // Şehir 2.1: 4 Güney Amerika, 5 Afrika, 7 yapay zekâ, 9 dünya ağı araya/sona girdi → eski çizim sırası
    var ga = st >= 4, af = st >= 5, ai = st === 7, world = st >= 9;
    st = st <= 3 ? st : st <= 5 ? 3 : st <= 7 ? 4 : 5;
    var flags = ["#1D4ED8", "#E11D48", "#FACC15", "#16A34A", "#F97316"];
    if (st === 3) {
      box(-3, -7, 15, 9, 0, 7, "#F2F4FF", {
        fL: both(winFace({ ww: 1.6, wh: 1.6, gx: 0.8, gy: 1.2, top: 1.8, bot: 0.6 }), signFace("BÖLGE GÖZLEMCİLERİ", "#1D4ED8", "#FFFFFF", 0.7, 0.85, 0.8)),
        fR: winFace({ ww: 1.6, wh: 1.6, gx: 0.8, gy: 1.2, top: 1.8, bot: 0.6 }),
      });
      roofCap(-3, -7, 15, 9, 7, "#1D4ED8");
    } else {
      // VERİ ANALİZ MERKEZİ: koyu cam, veri çizgileri
      box(-3, -7, 17, 10, 0, st >= 5 ? 14 : 10, "#1F2A4D", {
        fL: function (cc, FW, FH) {
          for (var y = 1.6; y < FH - 0.4; y += 1.6) {
            cc.fillStyle = TH.night > 0.5 ? "rgba(34,211,238,0.85)" : K("#3E5A96");
            cc.fillRect(0.4, y, FW - 0.8, 0.9);
          }
          cc.strokeStyle = TH.night > 0.5 ? "#9EF0A8" : K("#7FE3FF");
          cc.lineWidth = 0.1;
          for (var i = 0; i < 6; i++) {
            cc.beginPath();
            cc.moveTo(1 + i * 2.6, 1.7);
            cc.lineTo(1 + i * 2.6, FH - 0.5);
            cc.stroke();
          }
          fsign(cc, FW / 2, 0.6, 9, 0.8, world ? "DÜNYA SCOUT AĞI" : st >= 5 ? "AVRUPA SCOUT MERKEZİ" : ai ? "YAPAY ZEKÂ MERKEZİ" : "VERİ MERKEZİ", "#141043", ai ? "#E879F9" : "#22D3EE", true);
        },
        fR: function (cc, FW, FH) {
          for (var y = 1.6; y < FH - 0.4; y += 1.6) {
            cc.fillStyle = TH.night > 0.5 ? "rgba(34,211,238,0.6)" : K("#36508A");
            cc.fillRect(0.4, y, FW - 0.8, 0.9);
          }
        },
      });
      roofCap(-3, -7, 17, 10, st >= 5 ? 14 : 10, "#C6CAE0");
      // çatıda soğutucular + anten
      var top = st >= 5 ? 14.45 : 10.45;
      [-8, -4, 0].forEach(function (x) {
        box(x, -9, 2.4, 2.4, top, 1, "#C6CAE0", { noShadow: true, depth: 20 + x * 0.01 });
      });
      cyl(4, -10, 0.15, top, 5, "#5B6385", { noShadow: true, depth: 21 });
      anchor({ t: "beacon", x: 4, y: top + 5, z: -10 });
      if (ai) {
        // YAPAY ZEKÂ: çatıda parlayan sinir ağı küresi + mor LED kuşak
        cyl(-3, -5, 2.6, top, 0.6, "#2A2F6E", { noShadow: true, depth: 22 });
        dome(-3, -5, 2.4, top + 0.6, "#C084FC", { ribs: true, depth: 23 });
        anchor({ t: "glow", x: -3, y: top + 2, z: -5, col: "#E879F9" });
        box(-3, -1.9, 17.2, 0.3, 4.2, 0.8, "#A855F7", { noShadow: true, depth: 25, gloss: false });
      }
    }
    if (st >= 5) {
      globeS(10, 7, 1.4, 3.4);
    } else {
      // Avrupa haritası panosu
      box(11, 4, 0.4, 7, 1.2, 4, "#FFFFFF", {
        fR: function (cc, FW, FH) {
          cc.fillStyle = K("#BFE6FF");
          cc.fillRect(0.2, 0.2, FW - 0.4, FH - 0.4);
          cc.fillStyle = K("#4CC86A");
          [[2.2, 1.6, 1.4, 0.9], [4.2, 2.2, 1.6, 1.1], [3, 3.1, 1.1, 0.6], [5.6, 1.3, 0.9, 0.7]].forEach(function (q) {
            cc.beginPath();
            cc.ellipse(q[0], q[1], q[2], q[3], 0.3, 0, Math.PI * 2);
            cc.fill();
          });
          cc.fillStyle = "#E11D48";
          [[2.4, 1.8], [4.6, 2.4], [3.4, 3], [5.6, 1.4]].forEach(function (q) {
            cc.beginPath();
            cc.arc(q[0], q[1], 0.18, 0, Math.PI * 2);
            cc.fill();
          });
        },
      });
      [-2, 2].forEach(function (dz) {
        box(11, 4 + dz, 0.25, 0.25, 0, 1.2, "#8A90B5", { noShadow: true });
      });
    }
    if (ga) {
      // GÜNEY AMERİKA OFİSİ (yeşil-sarı) + palmiye
      box(12.5, -11, 6, 5, 0, 4, "#FFFFFF", {
        fL: both(function (cc, FW, FH) { cc.fillStyle = K("#16A34A"); cc.fillRect(0, FH - 0.7, FW, 0.7); win(cc, 0.8, 1.4, 1.6, 1.1, true); win(cc, FW - 2.4, 1.4, 1.6, 1.1, true); }, signFace("G. AMERİKA", "#16A34A", "#FACC15", 0.55, 0.9, 0.75)),
        fR: function (cc, FW, FH) { win(cc, FW / 2 - 0.8, 1.4, 1.6, 1.1, true); },
      });
      roofCap(12.5, -11, 6, 5, 4, "#FACC15");
      palm(16.5, -7.5, 0.7);
    }
    if (af) {
      // AFRİKA GÖZLEM AĞI: turuncu ofis + sazdan saçaklı gölgelik + çanak
      box(13.5, -2.5, 6, 4, 0, 3.4, "#FDE7C8", {
        fL: both(function (cc, FW, FH) { win(cc, 0.6, 1.3, 1.4, 1, true); }, signFace("AFRİKA", "#C2410C", "#FFFFFF", 0.5, 0.8, 0.7)),
        fR: function (cc, FW, FH) { cc.fillStyle = K("#C2410C"); cc.fillRect(0, FH - 0.6, FW, 0.6); },
      });
      pyramid(13.5, -2.5, 6.8, 4.8, 3.4, 1.6, "#D4A55A", { noShadow: true });
      dishS(16.6, -0.2, 1.4, 1, -0.7);
    }
    var fl = world ? flags.concat(["#7C3AED", "#0EA5E9", "#DB2777"]) : flags;
    fl.forEach(function (col, i) {
      flagpole(-14 + i * 2.6, 10 + (i % 2) * 0.3, st >= 5 ? 8 : 6.5, col, i % 2 ? "#FFFFFF" : null);
    });
    if (world) {
      // DÜNYA SCOUT AĞI: uydu çanakları dizisi
      [[14.5, 12.5, 2], [10.5, 15.5, 1.5], [16, 6.5, 1.4]].forEach(function (q) {
        box(q[0], q[1], 2.2, 2.2, 0, 1, "#C6CAE0", { noShadow: true });
        dishS(q[0], q[1], 1.6, q[2], -0.7);
      });
      anchor({ t: "beacon", x: 14.5, y: 5, z: 12.5 });
    }
    tree(16, -15, 1);
    tree(-17, -15, 1);
    if (st < 5 && !world) tree(15, 15, 0.8);
  };

  /* ═══════════════════════ KULÜP ŞEHRİ 2.0: sembol yapılar ═══════════════════════
   * Her anahtara bir sprite (yuva ±2,4 m içinde); bilinmeyen anahtar için kademe
   * yedeği. Heykel ve kupalar ekrana dönük, metalik degrade, ince kontur. */

  var METAL = {
    bronze: ["#E9B872", "#B5793A", "#7A4B22"],
    marble: ["#FFFFFF", "#E7E3F2", "#B9B3CF"],
    gold: ["#FFF0A8", "#F5C542", "#B8860B"],
    silver: ["#FFFFFF", "#D3D8E8", "#8A93B0"],
  };
  function metalGrad(c, x0, y0, x1, y1, m) {
    var g = c.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, K(m[0]));
    g.addColorStop(0.45, K(m[1]));
    g.addColorStop(1, K(m[2]));
    return g;
  }
  /** Taş kaide (kare), üstü y = h. */
  function plinth(w, h, col, plate) {
    box(0, 0, w, w, 0, h, col || "#DCD8E8", {
      fL: plate
        ? function (cc, FW, FH) {
            A.roundRect(cc, FW * 0.18, FH * 0.3, FW * 0.64, FH * 0.36, 0.08);
            cc.fillStyle = K(plate);
            cc.fill();
          }
        : null,
    });
    box(0, 0, w + 0.5, w + 0.5, 0, 0.3, dk(col || "#DCD8E8", 0.1), { noShadow: true, depth: -0.5 });
  }
  /** Heykel figürü (ekrana dönük). pose: kick | coach | raise | suit. */
  function figureS(y0, pose, metal, sz) {
    sz = sz || 1;
    extBill(0, 0, 1.6 * sz, y0 + 2.6 * sz);
    body(0.6, function () {
      var c = G.c, p = G.P(0, y0, 0), s = G.s * HY * sz;
      var m = METAL[metal] || METAL.bronze;
      var fill = metalGrad(c, p[0] - s, p[1] - 2.4 * s, p[0] + s, p[1], m);
      var lw = Math.max(1, 0.26 * s);
      c.lineCap = "round";
      c.lineJoin = "round";
      var limb = function (pts, w) {
        c.beginPath();
        c.moveTo(p[0] + pts[0][0] * s, p[1] - pts[0][1] * s);
        for (var i = 1; i < pts.length; i++) c.lineTo(p[0] + pts[i][0] * s, p[1] - pts[i][1] * s);
        c.strokeStyle = K(m[2]);
        c.lineWidth = w * s + lw * 0.5;
        c.stroke();
        c.strokeStyle = fill;
        c.lineWidth = w * s;
        c.stroke();
      };
      var hip = [0, 0.95], neck = [0, 1.75];
      if (pose === "kick") {
        limb([[-0.05, 0.95], [-0.3, 0.5], [-0.15, 0.02]], 0.24);
        limb([[0.05, 0.95], [0.45, 0.62], [0.85, 0.75]], 0.24);
        limb([[-0.1, 1.65], [-0.6, 1.35], [-0.85, 1.55]], 0.18);
        limb([[0.1, 1.65], [0.55, 1.75], [0.8, 2.0]], 0.18);
      } else if (pose === "raise") {
        limb([[-0.08, 0.95], [-0.18, 0.5], [-0.2, 0.02]], 0.24);
        limb([[0.08, 0.95], [0.18, 0.5], [0.2, 0.02]], 0.24);
        limb([[-0.12, 1.65], [-0.45, 2.1], [-0.55, 2.55]], 0.18);
        limb([[0.12, 1.65], [0.45, 2.1], [0.55, 2.55]], 0.18);
      } else if (pose === "coach") {
        limb([[-0.08, 0.95], [-0.14, 0.5], [-0.16, 0.02]], 0.26);
        limb([[0.08, 0.95], [0.14, 0.5], [0.16, 0.02]], 0.26);
        limb([[-0.15, 1.6], [0.2, 1.35]], 0.2);
        limb([[0.15, 1.6], [0.7, 1.65], [1.0, 1.75]], 0.17);
      } else {
        limb([[-0.08, 0.95], [-0.14, 0.5], [-0.16, 0.02]], 0.26);
        limb([[0.08, 0.95], [0.14, 0.5], [0.16, 0.02]], 0.26);
        limb([[-0.15, 1.62], [-0.3, 1.2], [-0.25, 0.95]], 0.18);
        limb([[0.15, 1.62], [0.45, 2.05], [0.5, 2.45]], 0.18);
      }
      // gövde
      var coat = pose === "coach" || pose === "suit";
      c.beginPath();
      c.moveTo(p[0] - 0.3 * s, p[1] - neck[1] * s);
      c.lineTo(p[0] + 0.3 * s, p[1] - neck[1] * s);
      c.lineTo(p[0] + (coat ? 0.34 : 0.24) * s, p[1] - (coat ? 0.7 : hip[1]) * s);
      c.lineTo(p[0] - (coat ? 0.34 : 0.24) * s, p[1] - (coat ? 0.7 : hip[1]) * s);
      c.closePath();
      c.fillStyle = fill;
      c.fill();
      c.lineWidth = lw * 0.5;
      c.strokeStyle = K(m[2]);
      c.stroke();
      // baş
      c.beginPath();
      c.arc(p[0], p[1] - 2.02 * s, 0.25 * s, 0, Math.PI * 2);
      c.fillStyle = fill;
      c.fill();
      c.stroke();
      if (pose === "kick") {
        c.beginPath();
        c.arc(p[0] + 1.05 * s, p[1] - 0.72 * s, 0.17 * s, 0, Math.PI * 2);
        c.fillStyle = fill;
        c.fill();
        c.stroke();
      }
    });
  }
  /** Kupa (ekrana dönük). kind: sl | el | cl | gold. */
  function trophyS(y0, kind, sz) {
    sz = sz || 1;
    extBill(0, 0, 1.8 * sz, y0 + 3.2 * sz);
    body(0.6, function () {
      var c = G.c, p = G.P(0, y0, 0), s = G.s * HY * sz;
      var m = kind === "el" || kind === "cl" ? METAL.silver : METAL.gold;
      var fill = metalGrad(c, p[0] - s, p[1] - 3 * s, p[0] + s, p[1], m);
      var edge = K(m[2]);
      c.lineJoin = "round";
      c.lineWidth = Math.max(0.8, 0.07 * s);
      c.strokeStyle = edge;
      // ayak
      A.roundRect(c, p[0] - 0.55 * s, p[1] - 0.45 * s, 1.1 * s, 0.45 * s, 0.08 * s);
      c.fillStyle = K(kind === "sl" ? "#2B2F5E" : "#3A3F72");
      c.fill();
      c.beginPath();
      c.moveTo(p[0] - 0.14 * s, p[1] - 0.45 * s);
      c.lineTo(p[0] - 0.08 * s, p[1] - 1.0 * s);
      c.lineTo(p[0] + 0.08 * s, p[1] - 1.0 * s);
      c.lineTo(p[0] + 0.14 * s, p[1] - 0.45 * s);
      c.closePath();
      c.fillStyle = fill;
      c.fill();
      c.stroke();
      if (kind === "el") {
        // uzun vazo
        c.beginPath();
        c.moveTo(p[0] - 0.2 * s, p[1] - 1.0 * s);
        c.bezierCurveTo(p[0] - 0.75 * s, p[1] - 1.5 * s, p[0] - 0.75 * s, p[1] - 2.5 * s, p[0] - 0.42 * s, p[1] - 3.0 * s);
        c.lineTo(p[0] + 0.42 * s, p[1] - 3.0 * s);
        c.bezierCurveTo(p[0] + 0.75 * s, p[1] - 2.5 * s, p[0] + 0.75 * s, p[1] - 1.5 * s, p[0] + 0.2 * s, p[1] - 1.0 * s);
        c.closePath();
      } else {
        // kupa gövdesi
        c.beginPath();
        c.moveTo(p[0] - 0.2 * s, p[1] - 1.0 * s);
        c.quadraticCurveTo(p[0] - 0.75 * s, p[1] - 1.5 * s, p[0] - 0.72 * s, p[1] - 2.55 * s);
        c.lineTo(p[0] + 0.72 * s, p[1] - 2.55 * s);
        c.quadraticCurveTo(p[0] + 0.75 * s, p[1] - 1.5 * s, p[0] + 0.2 * s, p[1] - 1.0 * s);
        c.closePath();
      }
      c.fillStyle = fill;
      c.fill();
      c.stroke();
      // kulplar
      c.lineWidth = Math.max(1.2, (kind === "cl" ? 0.16 : 0.12) * s);
      c.strokeStyle = fill;
      var hw = kind === "cl" ? 1.35 : 1.05;
      if (kind !== "el")
        [-1, 1].forEach(function (sd) {
          c.beginPath();
          c.moveTo(p[0] + sd * 0.62 * s, p[1] - 2.35 * s);
          c.bezierCurveTo(p[0] + sd * hw * s, p[1] - (kind === "cl" ? 2.9 : 2.5) * s, p[0] + sd * hw * s, p[1] - 1.5 * s, p[0] + sd * 0.42 * s, p[1] - 1.45 * s);
          c.stroke();
        });
      // ağız
      c.beginPath();
      c.ellipse(p[0], p[1] - (kind === "el" ? 3.0 : 2.55) * s, (kind === "el" ? 0.42 : 0.72) * s, 0.12 * s, 0, 0, Math.PI * 2);
      c.fillStyle = K(m[2]);
      c.fill();
      // şerit / parlama
      if (kind === "sl") {
        c.fillStyle = K("#E30A17");
        c.fillRect(p[0] - 0.55 * s, p[1] - 1.85 * s, 1.1 * s, 0.2 * s);
      }
      c.fillStyle = "rgba(255,255,255,0.55)";
      c.beginPath();
      c.ellipse(p[0] - 0.3 * s, p[1] - 1.9 * s, 0.08 * s, 0.4 * s, 0.2, 0, Math.PI * 2);
      c.fill();
    });
  }
  function lmFountain(col, top) {
    cyl(0, 0, 2.1, 0, 0.6, "#E9ECF8", { top: col || "#5FD3F5", noShadow: true });
    cyl(0, 0, 0.35, 0.6, 1.1, "#D5D8EA", { noShadow: true });
    cyl(0, 0, 0.9, 1.7, 0.25, "#E9ECF8", { top: col || "#5FD3F5", noShadow: true });
    if (top) top();
    anchor({ t: "fountain", x: 0, y: 2.1, z: 0 });
  }
  var LM_BUILD = {
    bank: function () {
      bench(0, 0.3, true, 3.2, "#C98A4B");
      bush(-2, -1.2, 0.6);
      bush(2, -1.2, 0.6);
    },
    sokak_lambasi: function () {
      cyl(0, 0, 0.5, 0, 0.3, "#C6CAE0", { noShadow: true });
      lampS(0, 0);
    },
    agac_sirasi: function () {
      box(0, 0, 4.4, 1.2, 0, 0.35, "#C9B99A", { top: "#6FD064", noShadow: true });
      [-1.6, 0, 1.6].forEach(function (x) {
        tree(x, 0, 0.62);
      });
    },
    bayrak: function () {
      cyl(0, 0, 0.8, 0, 0.35, "#D5D8EA", { noShadow: true });
      flagpole(0, 0, 7, kit.primary, kit.secondary);
    },
    cicek_bahcesi: function () {
      box(0, 0, 3.8, 3.8, 0, 0.5, "#D9B48A", {
        top: "#5EA84E",
        fT: function (cc, FW, FH) {
          var r = A.seeded(4);
          var cols = ["#FF6FA0", "#FFD43B", "#B9A4FF", "#FF8A3D", "#FFFFFF"];
          for (var i = 0; i < 46; i++) {
            cc.fillStyle = K(cols[i % cols.length]);
            cc.beginPath();
            cc.arc(0.3 + r() * (FW - 0.6), 0.3 + r() * (FH - 0.6), 0.16, 0, Math.PI * 2);
            cc.fill();
          }
        },
      });
      bush(0.4, 0.4, 0.7, "#4FB859");
    },
    cesme: function () {
      lmFountain();
    },
    taraftar_duvari: function () {
      box(0, -0.6, 4.6, 0.7, 0, 2.8, "#F2F0FA", {
        fL: function (cc, FW, FH) {
          cc.fillStyle = K(kit.primary);
          cc.fillRect(0, 0, FW, FH);
          cc.fillStyle = K(kit.secondary);
          for (var x = -FH; x < FW; x += 1.1) {
            cc.beginPath();
            cc.moveTo(x, FH);
            cc.lineTo(x + 0.45, FH);
            cc.lineTo(x + 0.45 + FH, 0);
            cc.lineTo(x + FH, 0);
            cc.closePath();
            cc.fill();
          }
          fsign(cc, FW / 2, FH * 0.42, FW - 0.6, 0.8, "TARAFTAR", "#1B1648", "#FFFFFF", true);
        },
      });
      roofCap(0, -0.6, 4.6, 0.7, 2.8, "#D5D8EA");
      [-1.4, 0, 1.4].forEach(function (x, i) {
        standee(x, 1, i % 2 ? kit.secondary : kit.primary, i + 2, 0.75);
      });
    },
    arma_meydani: function () {
      flat(function () {
        topDo(0.05, function (c) {
          c.beginPath();
          c.arc(0, 0, 2.5, 0, Math.PI * 2);
          c.fillStyle = K("#E6E1D3");
          c.fill();
          c.lineWidth = 0.15;
          c.strokeStyle = K("#BFB49A");
          c.stroke();
          c.beginPath();
          c.arc(0, 0, 1.7, 0, Math.PI * 2);
          c.fillStyle = K(kit.primary);
          c.fill();
          c.beginPath();
          c.arc(0, 0, 1.0, 0, Math.PI * 2);
          c.fillStyle = K(kit.secondary);
          c.fill();
        });
      });
      box(0, -1.4, 0.9, 0.5, 0, 2, "#DCD8E8", { noShadow: true });
      crestS(0, -1.4, 2.9, 0.75);
    },
    efsane_oyuncu_heykeli: function () {
      plinth(2, 1.5, "#DCD8E8", "#B8860B");
      figureS(1.5, "kick", "bronze");
    },
    teknik_direktor_heykeli: function () {
      plinth(2, 1.5, "#D5D1E3", "#B8860B");
      figureS(1.5, "coach", "bronze");
    },
    kendi_heykelin: function () {
      plinth(2.4, 1.8, "#2B2F5E", "#F5C542");
      figureS(1.8, "raise", "marble", 1.05);
      flagpole(1.6, 1.6, 4.5, kit.primary, kit.secondary);
    },
    sadik_baskan_heykeli: function () {
      plinth(2.2, 1.6, "#DCD8E8", "#F5C542");
      figureS(1.6, "suit", "bronze");
    },
    saat_kulesi: function () {
      box(0, 0, 3, 3, 0, 1, "#DCD8E8", { noShadow: true });
      box(0, 0, 2.4, 2.4, 1, 11, "#F2E6D0", {
        fL: function (cc, FW, FH) {
          clockFace(cc, FW / 2, 1.4, 0.9);
          for (var y = 3.2; y < FH - 1; y += 2.2) {
            A.roundRect(cc, FW / 2 - 0.3, y, 0.6, 1.2, 0.3);
            cc.fillStyle = K("#7C6A9E");
            cc.fill();
          }
        },
        fR: function (cc, FW, FH) {
          clockFace(cc, FW / 2, 1.4, 0.9);
        },
      });
      pyramid(0, 0, 3, 3, 12, 3.2, kit.primary, { noShadow: true, depth: 1 });
      anchor({ t: "glow", x: 0, y: 10.6, z: 1.3, col: "#FFE9A8" });
    },
    dev_forma: function () {
      [-1.6, 1.6].forEach(function (x) {
        box(x, 0, 0.3, 0.3, 0, 6.6, "#8A90B5", { noShadow: true });
      });
      box(0, 0, 3.6, 0.3, 6.4, 0.25, "#8A90B5", { noShadow: true });
      extBill(0, 0, 2.8, 7);
      body(1, function () {
        var p = G.P(0, 4.2, 0);
        shirtAt(G.c, p[0], p[1], 4.4 * G.s, kit.primary, kit.secondary, "10");
        ftext(G.c, "10", p[0], p[1] + 0.2 * G.s, 1.4 * G.s, K(kit.secondary === kit.primary ? "#FFFFFF" : kit.secondary));
      });
      shadowBox(0, 0, 3, 0.4, 6);
    },
    sampiyonluk_kemeri: function () {
      [-1.9, 1.9].forEach(function (x) {
        box(x, 0, 0.8, 0.8, 0, 5.4, "#F5C542", { top: "#FFE58A" });
      });
      box(0, 0, 4.6, 0.9, 5.4, 1.2, "#F5C542", {
        depth: 1,
        fL: function (cc, FW, FH) {
          ftext(cc, "ŞAMPİYON", FW / 2, FH / 2, FH * 0.55, "#7C2D12", FW * 0.85);
        },
      });
      for (var i = 0; i < 5; i++) {
        (function (i) {
          var x = -1.6 + i * 0.8;
          extBill(x, 0, 0.4, 7.4);
          body(1.2, function () {
            var p = G.P(x, 7, 0), s = G.s;
            G.c.beginPath();
            for (var k = 0; k < 10; k++) {
              var rr = k % 2 ? 0.14 * s : 0.32 * s, a = (k * Math.PI) / 5 - Math.PI / 2;
              G.c.lineTo(p[0] + Math.cos(a) * rr, p[1] + Math.sin(a) * rr);
            }
            G.c.closePath();
            G.c.fillStyle = K("#FFD43B");
            G.c.fill();
          });
        })(i);
      }
    },
    isik_gosterisi: function () {
      box(0, 0, 4, 4, 0, 0.4, "#2B2F5E", { noShadow: true });
      [[-1.3, -1.3, "#38BDF8"], [1.3, -1.3, "#F472B6"], [-1.3, 1.3, "#FACC15"], [1.3, 1.3, "#34D399"]].forEach(function (q) {
        cyl(q[0], q[1], 0.18, 0.4, 3.4, "#5B6385", { noShadow: true });
        cyl(q[0], q[1], 0.38, 3.8, 0.5, "#1B1648", { noShadow: true, top: q[2] });
        anchor({ t: "show", x: q[0], y: 4.3, z: q[1], col: q[2] });
      });
    },
    super_lig_kupasi: function () {
      plinth(2.2, 1.8, "#DCD8E8", "#E30A17");
      trophyS(1.8, "sl", 1);
    },
    avrupa_ligi_kupasi: function () {
      plinth(2.2, 1.8, "#2B2F5E", "#F97316");
      trophyS(1.8, "el", 1);
    },
    sampiyonlar_ligi_kupasi: function () {
      plinth(2.4, 2, "#1B1648", "#38BDF8");
      trophyS(2, "cl", 1.05);
    },
    seri_cesmesi: function () {
      lmFountain("#7FD8FF", function () {
        extBill(0, 0, 0.6, 3.4);
        body(1, function () {
          var p = G.P(0, 2.7, 0), s = G.s;
          G.c.beginPath();
          for (var k = 0; k < 10; k++) {
            var rr = k % 2 ? 0.22 * s : 0.5 * s, a = (k * Math.PI) / 5 - Math.PI / 2;
            G.c.lineTo(p[0] + Math.cos(a) * rr, p[1] + Math.sin(a) * rr);
          }
          G.c.closePath();
          G.c.fillStyle = K("#FFD43B");
          G.c.fill();
        });
      });
    },
    altin_kupa_aniti: function () {
      box(0, 0, 2.2, 2.2, 0, 2.8, "#2B2F5E", { top: "#3A3F72", fL: function (cc, FW, FH) { cc.fillStyle = K("#F5C542"); cc.fillRect(0.3, FH * 0.35, FW - 0.6, 0.3); } });
      box(0, 0, 2.7, 2.7, 0, 0.3, "#1B1648", { noShadow: true, depth: -0.5 });
      trophyS(2.8, "gold", 1.1);
    },
  };
  var LM_TIER = { sus: "cicek_bahcesi", meydan: "cesme", heykel: "efsane_oyuncu_heykeli", simge: "obelisk", kupa: "kupa_genel", seri: "seri_genel" };
  LM_BUILD.obelisk = function () {
    box(0, 0, 2, 2, 0, 0.8, "#DCD8E8");
    box(0, 0, 1.1, 1.1, 0.8, 7, "#F2E6D0", { fL: function (cc, FW, FH) { cc.fillStyle = K(kit.primary); cc.fillRect(0, 0.8, FW, 0.35); } });
    pyramid(0, 0, 1.1, 1.1, 7.8, 1.1, "#F5C542", { noShadow: true, depth: 1 });
  };
  LM_BUILD.kupa_genel = function () {
    plinth(2.2, 1.8, "#DCD8E8", "#F5C542");
    trophyS(1.8, "gold", 1);
  };
  LM_BUILD.seri_genel = function () {
    LM_BUILD.seri_cesmesi();
  };
  function lmBuildFor(key, tier) {
    if (LM_BUILD[key]) return LM_BUILD[key];
    return LM_BUILD[LM_TIER[tier]] || LM_BUILD.cicek_bahcesi;
  }

  /* ═══════════════════════ KULÜP ŞEHRİ 2.0: düzen ve durum ═══════════════════════
   * İlk { type:"city2" } iletisiyle sahne v2 düzenine geçer (v1 "city" yolu
   * olduğu gibi çalışır). Eski arsalar yeni binalara: saha+tribün → stadyum,
   * soyunma+antrenman → halısaha (iki hücre), kantin → restoran, medya → TV,
   * kamp → otel; üniversite, scout ve sembol yapı meydanı yeni hücrelerde. */

  var KEYS2 = ["halisaha", "kulup", "stadyum", "restoran", "magaza", "akademi", "ulasim", "saglik", "tv", "universite", "otel", "scout"];
  var TITLES2 = {
    halisaha: "Halısaha", kulup: "Kulüp binası", stadyum: "Stadyum", restoran: "Restoran", magaza: "Mağaza", akademi: "Akademi",
    ulasim: "Ulaşım", saglik: "Sağlık", tv: "Kulüp TV", universite: "Üniversite", otel: "Kamp oteli", scout: "Scout merkezi",
  };
  var MAX2 = { halisaha: 14, kulup: 12, stadyum: 13, restoran: 12, magaza: 12, akademi: 12, ulasim: 10, saglik: 12, tv: 11, universite: 10, otel: 10, scout: 9 };
  var OPENS2 = { halisaha: 1, kulup: 3, stadyum: 5, restoran: 5, magaza: 6, akademi: 7, ulasim: 8, saglik: 9, tv: 11, universite: 13, otel: 14, scout: 16 };
  var CELL2 = {
    stadyum: [0, 0], halisaha: [-1, 0], kulup: [0, -1], restoran: [-1, 1], magaza: [0, 1], saglik: [1, -1], tv: [1, 0],
    akademi: [-2, -2], otel: [1, 1], ulasim: [2, 2], universite: [2, -1], scout: [-1, 2],
  };
  var HS_B = [-1, -1], LMD_CELL = [1, 2];
  var PLOTS2 = {}, PARTS2 = {};
  KEYS2.forEach(function (k) {
    PLOTS2[k] = { x: CC[CELL2[k][0]], z: CC[CELL2[k][1]] };
    PARTS2[k] = [{ id: "", x: PLOTS2[k].x, z: PLOTS2[k].z, eff: null }];
  });
  PARTS2.halisaha = [
    { id: "A", x: CC[-1], z: CC[0], eff: hsEffA },
    { id: "B", x: CC[HS_B[0]], z: CC[HS_B[1]], eff: hsEffB },
  ];
  var FILLERS2 = [];
  (function () {
    var used = {};
    KEYS2.forEach(function (k) {
      used[CELL2[k][0] + "," + CELL2[k][1]] = 1;
    });
    used[HS_B[0] + "," + HS_B[1]] = 1;
    used[LMD_CELL[0] + "," + LMD_CELL[1]] = 1;
    for (var i = -2; i <= 2; i++)
      for (var j = -2; j <= 2; j++) if (!used[i + "," + j]) FILLERS2.push({ i: i, j: j, x: CC[i], z: CC[j], kind: fillerKind(i, j) });
  })();
  /** Sembol yapı meydanı: 8×8 yuva, satır z boyunca (r0 şehre yakın). */
  var LMD = { x: CC[LMD_CELL[0]], z: 113, size: 44 };
  var V2 = false, received2 = false;
  var st2 = {}, rung2 = 1, lms = [], grid2 = { cols: 8, rows: 8, open: 2 }, place2 = null, ghost2 = null;
  KEYS2.forEach(function (k) {
    st2[k] = 0;
  });
  function slotSize() {
    return LMD.size / Math.max(grid2.cols, grid2.rows);
  }
  function slotPos(r, c) {
    var s = slotSize();
    return { x: LMD.x - (grid2.cols * s) / 2 + (c + 0.5) * s, z: LMD.z - (grid2.rows * s) / 2 + (r + 0.5) * s };
  }
  function slotAt(x, z) {
    var s = slotSize();
    var c = Math.floor((x - (LMD.x - (grid2.cols * s) / 2)) / s), r = Math.floor((z - (LMD.z - (grid2.rows * s) / 2)) / s);
    if (r < 0 || c < 0 || r >= grid2.rows || c >= grid2.cols) return null;
    return { r: r, c: c, id: "r" + r + "c" + c };
  }
  function parseSlot(id) {
    var m = /^r(\d+)c(\d+)$/.exec(String(id || ""));
    return m ? { r: +m[1], c: +m[2], id: "r" + m[1] + "c" + m[2] } : null;
  }
  function lmAt(id) {
    for (var i = 0; i < lms.length; i++) if (lms[i].slot === id) return lms[i];
    return null;
  }
  function freeSlots() {
    var out = [];
    for (var r = 0; r < Math.min(grid2.open, grid2.rows); r++) for (var c = 0; c < grid2.cols; c++) if (!lmAt("r" + r + "c" + c)) out.push({ r: r, c: c, id: "r" + r + "c" + c });
    return out;
  }
  function isStad(k) {
    return k === "saha" || k === "tribun" || k === "stadyum";
  }
  function closedOf(k) {
    if (marks[k] === "closed") return true;
    if (marks[k]) return false;
    return (st2[k] || 0) === 0 && rung2 < OPENS2[k];
  }
  function enterV2() {
    if (V2) return;
    V2 = true;
    ORDER = KEYS2;
    TITLES = TITLES2;
    PLOTS = PLOTS2;
    FILLERS = FILLERS2;
    focusKey = null;
    pillCache = {};
    pillCount = 0;
    match = null;
  }
  /** Stadyum aşaması → eski çizimin (saha, tribün) basamakları. */
  function stadSync() {
    var m = STAD_MAP[Math.min(st2.stadyum || 0, STAD_N)];
    levels.saha = m ? m[0] : 0;
    levels.tribun = m ? m[1] : 0;
  }
  function partEff(k, part, st) {
    return part.eff ? part.eff(st) : st;
  }
  function partSprite(k, part, st) {
    var eff = partEff(k, part, st);
    var closed = eff === 0 && !part.eff && closedOf(k);
    var id = "v2:" + k + (part.id ? "_" + part.id : "") + ":" + eff + (eff === 0 && !part.eff ? (closed ? ":c" : ":e") : "");
    return getSprite(id, function () {
      if (eff === 0 && !part.eff) {
        if (closed) closedPlot(OPENS2[k]);
        else emptyPlot();
        return;
      }
      BUILD2[k](eff, part.id);
    });
  }
  function partMeta(k, part, st) {
    var eff = partEff(k, part, st);
    var id = "v2:" + k + (part.id ? "_" + part.id : "") + ":" + eff + (eff === 0 && !part.eff ? (closedOf(k) ? ":c" : ":e") : "");
    return meta[id + "|" + TH.key + "|" + kit.primary + kit.secondary];
  }
  function drawUnit2(c, k, part) {
    var st = lvOf(k);
    if (con && con.key === k && (con.part === part || !con.part)) {
      var cs = conScale();
      drawScaffold(c, false);
      if (cs.old.a > 0) {
        var o = partSprite(k, part, Math.min(con.from, MAX2[k]));
        blitSprite(c, o, part.x, part.z, cs.old.sx, cs.old.sy, cs.old.a);
      }
      if (cs.nu.a > 0) blitSprite(c, partSprite(k, part, st), part.x, part.z, cs.nu.sx, cs.nu.sy, 1);
      drawScaffold(c, true);
      return;
    }
    blitSprite(c, partSprite(k, part, st), part.x, part.z);
  }
  /** İnşaatın oynadığı parça (halısahada içeriği değişen hücre). */
  function conPart(k, from, to) {
    var parts = PARTS2[k];
    if (!parts) return null;
    for (var i = 0; i < parts.length; i++) if (partEff(k, parts[i], from) !== partEff(k, parts[i], to)) return parts[i];
    return parts[0];
  }
  function stadBig() {
    return getSprite("v2:stadyum:0:" + (closedOf("stadyum") ? "c" : "e"), function () {
      if (closedOf("stadyum")) closedPlot(OPENS2.stadyum, 50);
      else emptyPlot(50);
    });
  }

  /* ─────────────── meydan zemini + yuvalar ─────────────── */

  function plazaSprite() {
    return getSprite("lmd:" + grid2.cols + "x" + grid2.rows + ":" + grid2.open, function () {
      var s = slotSize(), cols = grid2.cols, rows = grid2.rows, open = Math.min(grid2.open, rows);
      var hw = (cols * s) / 2, hd = (rows * s) / 2;
      pad(0, 0, hw * 2 + 3, hd * 2 + 3, "#EDE9F5", { th: 0.3, side: "#B4ACD2", r: 3, fn: tiles(1.375, "rgba(27,22,72,0.05)") });
      flat(function () {
        topDo(0.32, function (c) {
          // kilitli satırlar: soluk çim
          if (open < rows) {
            c.fillStyle = K("#B8C7AE");
            c.fillRect(-hw, -hd + open * s, hw * 2, (rows - open) * s);
            c.strokeStyle = "rgba(255,255,255,0.35)";
            c.lineWidth = 0.08;
            for (var t = -hw * 2; t < hw * 2; t += 1.6) {
              c.beginPath();
              c.moveTo(-hw + Math.max(0, t), -hd + open * s + Math.max(0, -t));
              c.lineTo(-hw + Math.min(hw * 2, t + (rows - open) * s), -hd + open * s + Math.min((rows - open) * s, (rows - open) * s + Math.min(0, hw * 2 - t - (rows - open) * s)));
              c.stroke();
            }
          }
          // açık yuvalar
          for (var r = 0; r < open; r++)
            for (var k = 0; k < cols; k++) {
              A.roundRect(c, -hw + k * s + 0.35, -hd + r * s + 0.35, s - 0.7, s - 0.7, 0.6);
              c.fillStyle = K((r + k) % 2 ? "#E2DCEE" : "#E7E2F1");
              c.fill();
              c.lineWidth = 0.08;
              c.strokeStyle = rgba(NAVY, 0.12);
              c.stroke();
            }
        });
      });
      if (open < rows) {
        // alçak çit: açık/kilitli sınırı
        var zb = -hd + open * s;
        var n = cols * 2;
        for (var i = 0; i <= n; i++) box(-hw + (i * hw * 2) / n, zb, 0.25, 0.25, 0, 0.9, "#C9CDE2", { noShadow: true, gloss: false, noLine: true });
        box(0, zb, hw * 2, 0.12, 0.65, 0.12, "#E9ECF8", { noShadow: true, gloss: false, noLine: true, depth: zb + 0.1 });
        lockSign(0, zb + ((rows - open) * s) / 2, null);
      }
      // köşelerde ağaçlar
      [[-hw - 0.2, -hd - 0.2], [hw + 0.2, -hd - 0.2]].forEach(function (q) {
        bush(q[0], q[1], 0.9);
      });
    });
  }
  function drawPlaza(c) {
    var sp = plazaSprite();
    blitSprite(c, sp, LMD.x, LMD.z);
  }
  /** Yerleştirme: boş açık yuvalar nabız gibi parlar. */
  function drawSlotsOverlay(c) {
    if (!place2) return;
    var s = slotSize(), a = 0.45 + 0.3 * Math.sin(A.time * 4);
    var free = freeSlots();
    topDo(0.36, function (cc) {
      free.forEach(function (q) {
        var p = slotPos(q.r, q.c);
        A.roundRect(cc, p.x - s / 2 + 0.45, p.z - s / 2 + 0.45, s - 0.9, s - 0.9, 0.6);
        cc.fillStyle = ghost2 === q.id ? "rgba(34,197,94,0.35)" : "rgba(255,255,255," + a * 0.45 + ")";
        cc.fill();
        cc.lineWidth = ghost2 === q.id ? 0.32 : 0.2;
        cc.strokeStyle = ghost2 === q.id ? "#22C55E" : "rgba(34,197,94," + (0.5 + a * 0.5) + ")";
        cc.stroke();
      });
    });
  }
  function lmSprite(key, tier) {
    return getSprite("lm:" + (LM_BUILD[key] ? key : "t:" + tier), function () {
      lmBuildFor(key, tier)();
    });
  }
  function lmMeta(key, tier) {
    return meta["lm:" + (LM_BUILD[key] ? key : "t:" + tier) + "|" + TH.key + "|" + kit.primary + kit.secondary];
  }
  var LM_TIER_OF = {};
  function tierOf(l) {
    return l.tier || LM_TIER_OF[l.key] || "sus";
  }
  function lmEntries(list) {
    lms.forEach(function (l) {
      var q = parseSlot(l.slot);
      if (!q) return;
      var p = slotPos(q.r, q.c);
      list.push({
        d: p.x + p.z,
        fn: function (c) {
          blitSprite(c, lmSprite(l.key, tierOf(l)), p.x, p.z);
        },
      });
    });
    if (place2 && ghost2) {
      var g = parseSlot(ghost2);
      if (g && !lmAt(ghost2)) {
        var gp = slotPos(g.r, g.c);
        list.push({
          d: gp.x + gp.z + 0.01,
          fn: function (c) {
            var bob = A.reduceMotion ? 1 : 1 + Math.sin(A.time * 3) * 0.03;
            blitSprite(c, lmSprite(place2.key, place2.tier || tierOf(place2)), gp.x, gp.z, 1, bob, 0.6);
          },
        });
      }
    }
  }
  function hitSlot(px, py) {
    var g = S2W(px, py, 0);
    var q = slotAt(g.x, g.z);
    // uzun yapılar (kule, heykel): gövdesine dokunuş da sayılır
    if (!q || !lmAt(q.id)) {
      var Z = cam.zoom, best = null;
      lms.forEach(function (l) {
        var sq = parseSlot(l.slot);
        if (!sq) return;
        var p = slotPos(sq.r, sq.c), m = lmMeta(l.key, tierOf(l));
        if (!m) return;
        var b = W2S(p.x, 0, p.z);
        var top = b[1] + m.v0 * Z, half = slotSize() * 0.7 * Z;
        if (px > b[0] - half && px < b[0] + half && py > top && py < b[1] + 2) best = sq;
      });
      if (best) q = best;
    }
    return q;
  }

  /* ─────────────── halısahada maçlar, çevrede insanlar ─────────────── */

  var kicks = [], kicksKey = "";
  function syncKicks() {
    var st = lvOf("halisaha");
    var key = st + "|" + (A.reduceMotion ? 1 : 0);
    if (key === kicksKey) return;
    kicksKey = key;
    kicks = [];
    var a = PARTS2.halisaha[0], b = PARTS2.halisaha[1];
    var add = function (ox, oz, w, d, n, kids, kit2, part) {
      part = part || a;
      kicks.push({ px: part.x, pz: part.z, ox: ox, oz: oz, P: { w: w, d: d, players: n }, kids: kids, kit2: kit2, m: makeMatch({ w: w, d: d, players: n }) });
    };
    if (st <= 1) add(a.x, a.z, 16, 8, 6, true, 0);
    else if (st === 2) add(a.x - 1, a.z - 1, 24, 15, 10, false, 1);
    else {
      var n = st >= 9 ? 3 : st >= 6 ? 2 : 1;
      for (var i = 0; i < n; i++) add(a.x + HS.p[i][0], a.z + HS.p[i][1], HS.w, HS.d, i === 0 ? 10 : 8, false, i);
      if (st >= 7 && st <= 8) add(b.x - 7, b.z + 9, 14, 9, 6, true, 0, b);
      if (st >= 10) add(b.x + HS.t[0], b.z + HS.t[1], 15, 9, 10, false, 3, b);
    }
  }
  var BIB = [["#FF8A3D", "#1B1648"], ["#FFD43B", "#1B1648"], ["#22C55E", "#FFFFFF"], ["#38BDF8", "#1B1648"]];
  function stepKicks(dt) {
    if (!V2) return;
    syncKicks();
    kicks.forEach(function (k) {
      simMatch(k.m, k.P, dt, null);
    });
  }
  /** Arsadaki kişiler arsa sprite'ından SONRA çizilsin (zemin pedi onları örtmesin). */
  function onPlot(list, e, x0, z0) {
    var pd = x0 + z0;
    e.d = pd + 0.5 + (e.d - pd) * 0.001;
    list.push(e);
  }
  function kickEntries(list) {
    var home = { p: kit.primary, s: kit.secondary };
    kicks.forEach(function (k, ki) {
      if (isBuilding("halisaha")) return;
      var bib = BIB[k.kit2 % BIB.length], away = { p: bib[0], s: bib[1] };
      k.m.players.forEach(function (p) {
        var kicking = A.time - p.kick < 0.4;
        var pose = kicking ? "kick" : p.keeper ? "keeper" : p.moving ? "run" : "ready";
        var kt = kicking ? (A.time - p.kick) / 0.4 : p.phase;
        var kk = k.kids ? (p.team ? { p: "#FFFFFF", s: "#1E3A8A" } : { p: "#38BDF8", s: "#1E3A8A" }) : p.team ? away : ki % 2 ? { p: "#FFFFFF", s: kit.primary } : home;
        onPlot(list, personEntry(k.ox + p.x, k.oz + p.z, { kit: kk, pose: pose, t: kt, dir: p.dir, look: p.look, scale: k.kids ? 0.74 : 0.92 }), k.px, k.pz);
      });
      var bl = k.m.ball;
      onPlot(list, ballEntry(k.ox + bl.x, bl.y, k.oz + bl.z, bl.spin, 0.85), k.px, k.pz);
    });
  }
  /** Kuyruk noktaları (arsa merkezine göre) aşama başına. */
  var QUEUE2 = {
    restoran: [null, [2, 2.6], [0, 4.4], [0, 2.6], [0, 2.4], [0, 3], [0, 3], [-3, 9], [3, 9], [3, 9], [3, 9], [4.5, 14.5], [4.5, 14.5]],
    magaza: [null, [-1, 4.6], [0, 2.4], [-1, 2.4], [0, 0.6], [0, 2.6], [0, 2.6], [0, 2.6], [0, 2.6], [0, 2.6], [0, 2.6], [5, 11], [5.2, 10]],
  };
  function life2(list) {
    kickEntries(list);
    ["restoran", "magaza"].forEach(function (k) {
      var lv = lvOf(k), q = QUEUE2[k][lv];
      if (!q || isBuilding(k)) return;
      var p = PLOTS2[k], n = Math.min(2 + lv, 8);
      for (var i = 0; i < n; i++) {
        var x = p.x + q[0] + Math.sin(i * 1.7) * 0.4, z = p.z + q[1] + i * 1.25;
        onPlot(list, personEntry(x, z, { kit: { p: ["#FF4D5E", "#3B82F6", kit.primary, "#FFD43B", "#22C55E"][i % 5], s: "#FFFFFF" }, pose: "idle", t: A.time + i * 1.3, look: i, dir: -1 }), p.x, p.z);
      }
    });
    // akademi: top peşinde çocuklar
    var lk = lvOf("akademi");
    if (lk >= 1 && !isBuilding("akademi")) {
      var pk = PLOTS2.akademi, cx = pk.x + (lk >= 9 ? -4 : 0), cz = pk.z + (lk >= 4 ? 6 : 2), nk = Math.min(4 + lk * 2, 14);
      var bx = cx + Math.cos(A.time * 0.7) * 5, bz = cz + Math.sin(A.time * 0.9) * 3;
      for (var k2 = 0; k2 < nk; k2++) {
        var a2 = A.time * (0.5 + (k2 % 3) * 0.13) + k2 * 1.7;
        onPlot(list, personEntry(bx + Math.cos(a2) * (1.5 + (k2 % 4) * 0.9), bz + Math.sin(a2 * 1.3) * 2, { kit: k2 % 2 ? { p: "#FFFFFF", s: "#1E3A8A" } : { p: kit.primary, s: kit.secondary }, pose: "run", t: A.time * 10 + k2, look: k2, dir: Math.cos(a2 + 1.6) > 0 ? 1 : -1, scale: lk >= 6 ? 0.85 : 0.72 }), pk.x, pk.z);
      }
      onPlot(list, ballEntry(bx, 0.25, bz, A.time * 6, 0.75), pk.x, pk.z);
    }
    // otel: kamp ateşi ya da önde yürüyüş
    var lc = lvOf("otel");
    if (lc >= 1 && !isBuilding("otel")) {
      var pc = PLOTS2.otel;
      if (lc === 1) {
        for (var s2 = 0; s2 < 6; s2++) {
          var aa = (s2 / 6) * Math.PI * 2 + 0.3;
          onPlot(list, personEntry(pc.x + Math.cos(aa) * 3.2, pc.z + 2 + Math.sin(aa) * 3.2, { kit: { p: kit.primary, s: kit.secondary }, pose: s2 === 0 ? "cheer" : "idle", t: A.time * (s2 === 0 ? 0.6 : 1) + s2, look: s2, dir: Math.cos(aa) > 0 ? -1 : 1, sit: true }), pc.x, pc.z);
        }
      } else
        for (var w2 = 0; w2 < 4; w2++) {
          var uu = (A.time * 0.05 + w2 / 4) % 1;
          onPlot(list, personEntry(pc.x - 12 + uu * 24, pc.z + 17 + (w2 % 2) * 1.5, { kit: { p: kit.primary, s: kit.secondary }, pose: "walk", t: A.time * 6 + w2, look: w2, dir: 1 }), pc.x, pc.z);
        }
    }
    // üniversite: avluda öğrenciler
    var lu = lvOf("universite");
    if (lu >= 1 && !isBuilding("universite")) {
      var pu = PLOTS2.universite, nu = lu === 1 ? 6 : Math.min(3 + lu, 8);
      for (var i3 = 0; i3 < nu; i3++) {
        if (lu === 1) {
          onPlot(list, personEntry(pu.x - 8.5 + (i3 % 4) * 1.6, pu.z + 2.6 + Math.floor(i3 / 4) * 1.8, { kit: { p: ["#3B82F6", "#FF4D5E", "#22C55E", "#FFD43B"][i3 % 4], s: "#FFFFFF" }, pose: "idle", t: A.time + i3, look: i3, dir: -1, sit: true }), pu.x, pu.z);
          continue;
        }
        var u3 = (A.time * 0.04 + i3 / nu) % 1;
        var px3 = i3 % 2 ? pu.x - 5 + u3 * 15 : pu.x + 2.5, pz3 = i3 % 2 ? pu.z + 3.5 : pu.z - 2 + u3 * 11;
        onPlot(list, personEntry(px3, pz3, { kit: { p: ["#3B82F6", "#FF4D5E", "#A855F7", "#FFD43B"][i3 % 4], s: "#FFFFFF" }, pose: "walk", t: A.time * 6 + i3, look: i3, dir: i3 % 2 ? 1 : -1 }), pu.x, pu.z);
      }
    }
    // scout: masada gözlemci
    if (lvOf("scout") === 1 && !isBuilding("scout")) {
      var ps = PLOTS2.scout;
      onPlot(list, personEntry(ps.x + 0.2, ps.z + 1.2, { kit: { p: "#1D4ED8", s: "#FFFFFF" }, pose: "idle", t: A.time, look: 3, dir: -1, sit: true }), ps.x, ps.z);
    }
    trafficEntries(list);
  }

  /* ─────────────── komutlar ─────────────── */

  function applyCity2(cmd) {
    enterV2();
    if (cmd.kit && cmd.kit.primary) kit = { primary: hex(cmd.kit.primary, "#5B3DF5"), secondary: hex(cmd.kit.secondary, "#FFFFFF") };
    if (cmd.marks && typeof cmd.marks === "object") marks = cmd.marks;
    if (cmd.rung != null && isFinite(Number(cmd.rung))) rung2 = Math.max(1, Math.floor(Number(cmd.rung)));
    if (cmd.grid && typeof cmd.grid === "object") {
      var cols = A.clamp(Math.floor(Number(cmd.grid.cols) || 8), 1, 12), rows = A.clamp(Math.floor(Number(cmd.grid.rows) || 8), 1, 12);
      var open = cmd.grid.open_rows != null ? cmd.grid.open_rows : cmd.grid.openRows;
      grid2 = { cols: cols, rows: rows, open: A.clamp(Math.floor(Number(open) || 0), 0, rows) };
    }
    var prevSlots = {};
    lms.forEach(function (l) {
      prevSlots[l.slot + "|" + l.key] = 1;
    });
    if (Array.isArray(cmd.landmarks))
      lms = cmd.landmarks
        .filter(function (l) {
          return l && typeof l.key === "string" && parseSlot(l.slot);
        })
        .map(function (l) {
          return { id: l.id == null ? null : l.id, key: l.key, slot: parseSlot(l.slot).id, tier: typeof l.tier === "string" ? l.tier : null };
        });
    var wasPlacing = !!place2;
    if (cmd.place !== undefined) {
      place2 = cmd.place && typeof cmd.place.key === "string" ? { key: cmd.place.key, tier: typeof cmd.place.tier === "string" ? cmd.place.tier : null } : null;
      if (!place2) ghost2 = null;
      else if (!ghost2 || lmAt(ghost2) || !parseSlot(ghost2) || parseSlot(ghost2).r >= grid2.open) {
        var fs = freeSlots();
        ghost2 = fs.length ? fs[0].id : null;
      }
    }
    var built = null;
    if (cmd.buildings && typeof cmd.buildings === "object") {
      var ups = [];
      KEYS2.forEach(function (k) {
        var v = A.clamp(Math.floor(Number(cmd.buildings[k]) || 0), 0, 99);
        if (v !== st2[k]) {
          if (v > st2[k]) ups.push({ key: k, from: st2[k], to: v });
          st2[k] = v;
        }
      });
      stadSync();
      if (received2 && ups.length === 1) built = ups[0];
    }
    // yeni yerleşen sembol yapı: toz + kıvılcım
    if (received2)
      lms.forEach(function (l) {
        if (prevSlots[l.slot + "|" + l.key]) return;
        var q = parseSlot(l.slot), p = slotPos(q.r, q.c);
        for (var i = 0; i < 10; i++) addPuff(p.x + A.rand(-2, 2), 0.5, p.z + A.rand(-2, 2));
        for (var j = 0; j < 14; j++) addSpark(p.x, 3, p.z, A.pick(["#FFD43B", "#FFFFFF", kit.primary]), 7);
        A.sound("place");
        A.haptic("medium");
      });
    received2 = true;
    if (built) {
      startConstruction(built.key, built.from, built.to);
      setFocus(built.key);
    }
    if (typeof cmd.focus === "string") setFocus(cmd.focus);
    else if (cmd.focus === null && !built && !place2 && !wasPlacing) setFocus(null);
    if (place2 && !wasPlacing && typeof cmd.focus !== "string") setFocus("landmarks");
  }
  /** { type:"build", key }: o binanın inşaat animasyonu (aşama değişmeden). */
  function playBuild(key) {
    if (!V2 || MAX2[key] == null) return;
    var to = lvOf(key);
    if (to < 1) return;
    startConstruction(key, to - 1, to);
    setFocus(key);
  }

  /* ═══════════════════════ dolgu hücreleri ═══════════════════════ */

  var APT_COLS = ["#B9A4FF", "#7CC7FF", "#FFB38A", "#8EE3C8", "#FF9FB8", "#FFD27A", "#9DB4FF"];
  function buildFiller(f) {
    var r = A.seeded(f.i * 131 + f.j * 17 + 999);
    var pick = function (a) {
      return a[(r() * a.length) | 0];
    };
    if (f.kind === "park") {
      pad(0, 0, 42, 42, "#6FD064", { fn: grassDots, th: 0.25, side: "#3E9E48", r: 3, line: 0.5 });
      flat(function () {
        topDo(0.27, function (c) {
          c.strokeStyle = K("#F1E4C8");
          c.lineWidth = 2.4;
          c.lineCap = "round";
          c.beginPath();
          c.moveTo(-21, 4);
          c.quadraticCurveTo(-4, -6, 6, 2);
          c.quadraticCurveTo(14, 8, 21, -4);
          c.moveTo(2, -21);
          c.quadraticCurveTo(-2, -2, 4, 21);
          c.stroke();
          // çiçek tarhları
          [[-12, 12, "#FF7AA8"], [12, -12, "#FFD43B"], [-13, -11, "#B9A4FF"]].forEach(function (q) {
            c.fillStyle = K("#3E9E48");
            c.beginPath();
            c.ellipse(q[0], q[1], 3.4, 2.4, 0.5, 0, Math.PI * 2);
            c.fill();
            c.fillStyle = K(q[2]);
            for (var k = 0; k < 7; k++) {
              c.beginPath();
              c.arc(q[0] + Math.cos(k * 2.4) * 1.8, q[1] + Math.sin(k * 2.4) * 1.2, 0.45, 0, Math.PI * 2);
              c.fill();
            }
          });
        });
      });
      if (r() < 0.5) {
        pool(9, 10, 7, 5, "#38BDF8");
        anchor({ t: "fountain", x: 9, y: 1, z: 10 });
      } else {
        cyl(9, 10, 2.6, 0, 0.7, "#E9ECF8", { noShadow: true, top: "#38BDF8" });
        anchor({ t: "fountain", x: 9, y: 0.8, z: 10 });
      }
      for (var t = 0; t < 9; t++) {
        var tx = -18 + r() * 36, tz = -18 + r() * 36;
        if (Math.abs(tx - 9) < 6 && Math.abs(tz - 10) < 5) continue;
        if (Math.abs(tx - 3) < 3 || Math.abs(tz - 0) < 2.5) continue;
        tree(tx, tz, 0.8 + r() * 0.5);
      }
      bench(-6, 7, true, 3);
      bench(14, -2, false, 3);
      return;
    }
    if (f.kind === "houses") {
      pad(0, 0, 42, 42, "#7FD86F", { fn: grassDots, th: 0.25, side: "#3E9E48", r: 3, line: 0.5 });
      [[-10, -10], [10, -10], [-10, 10], [10, 10]].forEach(function (q, i) {
        var w = 8 + r() * 3, d = 7 + r() * 2, h = 3.6 + r() * 2.4;
        var wall = pick(["#FFE7B8", "#FFD0C2", "#D7ECFF", "#E3F7D5", "#FFF1F7", "#F2E6FF"]);
        var roof = pick(["#E2574C", "#3B82F6", "#2FAE4E", "#A855F7", "#FF8A3D", "#C2413B"]);
        gable(q[0], q[1] - 1, w, d, 0, h, 2.4, wall, roof, {
          ridgeZ: i % 2 === 1,
          fL: function (cc, FW, FH) {
            windowsGrid(cc, FW, FH, { ww: 1.3, wh: 1.2, gx: 1.3, top: 0.8, rows: 2, litK: 0.7, skip: function (rr, k, R, Cn) { return rr === R - 1 && k === Math.floor(Cn / 2); } });
            A.roundRect(cc, FW / 2 - 0.7, FH - 2.1, 1.4, 2.1, 0.2);
            cc.fillStyle = K(pick(["#8A4B2A", "#2D3270", "#B91C1C"]));
            cc.fill();
          },
          fR: function (cc, FW, FH) {
            windowsGrid(cc, FW, FH, { ww: 1.2, wh: 1.2, gx: 1.2, top: 0.8, rows: 2, litK: 0.6 });
          },
        });
        tree(q[0] + (r() < 0.5 ? -5.5 : 5.5), q[1] + 4.5, 0.7 + r() * 0.3);
      });
      return;
    }
    // apartmanlar / kuleler (arka sıra: şehir silueti)
    pad(0, 0, 42, 42, "#DCD6EA", { fn: tiles(2.5), th: 0.3, side: "#A79FC8", r: 3 });
    var tall = f.kind === "towers";
    var spots = tall ? [[-8, -8, 11, 11], [9, -7, 9, 10], [-7, 10, 10, 9], [9, 10, 9, 9]] : [[-9, -9, 12, 10], [9, -9, 10, 11], [-9, 9, 11, 10], [9, 9, 10, 10]];
    spots.forEach(function (q, i) {
      var h = tall ? 16 + r() * 22 : 8 + r() * 9;
      if (!tall && i === 3) h = 6;
      var col = pick(APT_COLS);
      var fc = function (cc, FW, FH) {
        windowsGrid(cc, FW, FH, { ww: 1.3, wh: 1.6, gx: 0.9, gy: 1.4, top: 1, bot: 0.8, litK: 0.55 });
      };
      box(q[0], q[1], q[2], q[3], 0, h, col, { fL: fc, fR: fc });
      box(q[0], q[1], q[2] + 0.5, q[3] + 0.5, h, 0.6, dk(col, 0.25), { noShadow: true, depth: q[0] + q[1] + 0.01 });
      if (r() < 0.6) cyl(q[0] - 1.5, q[1] - 1.5, 1.1, h + 0.6, 2, "#C6CAE0", { noShadow: true });
      if (tall && r() < 0.5) anchor({ t: "beacon", x: q[0], y: h + 3, z: q[1] });
      if (tall && r() < 0.5) {
        extBox(q[0] + 2, q[1] + 2, 0.3, 0.3, h, 3.5);
        body(q[0] + q[1] + 0.02, function () {
          var c = G.c, a = G.P(q[0] + 2, h + 0.6, q[1] + 2), b = G.P(q[0] + 2, h + 3.5, q[1] + 2);
          c.strokeStyle = NAVY;
          c.lineWidth = G.lw;
          c.beginPath();
          c.moveTo(a[0], a[1]);
          c.lineTo(b[0], b[1]);
          c.stroke();
        });
      }
    });
    tree(0, 0, 0.9);
    tree(-1, 19, 0.7);
  }

  /* ═══════════════════════ zemin + fon ═══════════════════════ */

  var bgLayer = null;
  function paintBackdrop() {
    var pad = 50;
    var key = W + "x" + H + TH.key;
    if (bgLayer && bgLayer.key === key) return bgLayer;
    var L = A.layer(W + pad * 2, H + pad * 2);
    L.key = key;
    L.pad = pad;
    var c = L.ctx, w = W + pad * 2, h = H + pad * 2;
    var night = TH.key === "night", sunset = TH.key === "sunset";
    var horizon = h * 0.46;
    var g = c.createLinearGradient(0, 0, 0, horizon);
    if (night) {
      g.addColorStop(0, "#110D3D");
      g.addColorStop(0.6, "#2A1C6E");
      g.addColorStop(1, "#5E2B8C");
    } else if (sunset) {
      g.addColorStop(0, "#3A2C86");
      g.addColorStop(0.55, "#C9508A");
      g.addColorStop(1, "#FFA36B");
    } else {
      g.addColorStop(0, "#5DB8FF");
      g.addColorStop(0.7, "#A9DCFF");
      g.addColorStop(1, "#D9F0FF");
    }
    c.fillStyle = g;
    c.fillRect(0, 0, w, horizon + 2);
    var rnd = A.seeded(77);
    if (night) {
      c.fillStyle = "#FFFFFF";
      for (var i = 0; i < 60; i++) {
        c.globalAlpha = 0.3 + rnd() * 0.6;
        c.beginPath();
        c.arc(rnd() * w, rnd() * horizon * 0.8, rnd() < 0.15 ? 1.8 : 1, 0, Math.PI * 2);
        c.fill();
      }
      c.globalAlpha = 1;
    }
    // ay / güneş
    var mx = w * 0.78, my = horizon * 0.32, mr = Math.min(w, h) * 0.07 + 12;
    var halo = c.createRadialGradient(mx, my, mr * 0.6, mx, my, mr * 2.6);
    halo.addColorStop(0, night ? "rgba(255,225,150,0.3)" : sunset ? "rgba(255,200,120,0.55)" : "rgba(255,255,220,0.6)");
    halo.addColorStop(1, "rgba(255,225,150,0)");
    c.fillStyle = halo;
    c.fillRect(mx - mr * 3, my - mr * 3, mr * 6, mr * 6);
    c.beginPath();
    c.arc(mx, my, mr, 0, Math.PI * 2);
    c.fillStyle = night ? "#F7DA94" : sunset ? "#FFD27A" : "#FFF4B8";
    c.fill();
    if (night) {
      c.fillStyle = "rgba(214,170,90,0.35)";
      [[-0.3, -0.25, 0.18], [0.25, 0.1, 0.13], [-0.05, 0.38, 0.1]].forEach(function (q) {
        c.beginPath();
        c.arc(mx + q[0] * mr, my + q[1] * mr, q[2] * mr, 0, Math.PI * 2);
        c.fill();
      });
    }
    // bulutlar (gündüz/gün batımı)
    if (!night) {
      [[0.16, 0.42, 1], [0.48, 0.3, 0.8], [0.66, 0.55, 0.7], [0.92, 0.38, 0.9]].forEach(function (q) {
        var cx = q[0] * w, cy = q[1] * horizon, s = 18 * q[2] + 6;
        c.fillStyle = sunset ? "rgba(255,214,200,0.95)" : "#FFFFFF";
        c.beginPath();
        c.arc(cx, cy, s, 0, Math.PI * 2);
        c.arc(cx + s * 1.05, cy + s * 0.35, s * 0.72, 0, Math.PI * 2);
        c.arc(cx - s * 1.05, cy + s * 0.4, s * 0.62, 0, Math.PI * 2);
        c.ellipse(cx, cy + s * 0.62, s * 1.75, s * 0.42, 0, 0, Math.PI * 2);
        c.fill();
      });
    }
    // şehir silueti: iki kat bina, yanan pencereler
    function skyline(color, cap, hMin, hMax, wMin, wMax, litK, seed) {
      var r2 = A.seeded(seed);
      var x = -r2() * 30;
      while (x < w) {
        var bw = wMin + r2() * (wMax - wMin);
        var bh = (hMin + r2() * (hMax - hMin)) * h * 0.35;
        var by = horizon - bh;
        c.fillStyle = color;
        c.fillRect(x, by, bw, bh + 2);
        c.fillStyle = cap;
        c.fillRect(x - 2, by - 4, bw + 4, 5);
        var ww = Math.max(4, bw * 0.13), wh = ww * 1.3;
        for (var wy = by + 8; wy < horizon - wh - 3; wy += wh + ww * 0.8)
          for (var wx = x + ww * 0.8; wx < x + bw - ww * 1.4; wx += ww * 1.9) {
            c.fillStyle = r2() < litK ? (night ? "#FFD98A" : sunset ? "#FFE0A8" : "rgba(255,255,255,0.65)") : rgba(NAVY, night ? 0.35 : 0.12);
            c.fillRect(wx, wy, ww, wh);
          }
        x += bw + 3 + r2() * 10;
      }
    }
    if (night) {
      skyline("#3A2A80", "#2C2068", 0.45, 0.95, 36, 70, 0.3, 7);
      skyline("#4B3399", "#33267A", 0.25, 0.6, 32, 60, 0.45, 19);
    } else if (sunset) {
      skyline("#7A4C9E", "#6A3E8E", 0.45, 0.95, 36, 70, 0.25, 7);
      skyline("#9A5AA8", "#87499A", 0.25, 0.6, 32, 60, 0.35, 19);
    } else {
      skyline("#B7D6F2", "#A6C8EA", 0.45, 0.95, 36, 70, 0.4, 7);
      skyline("#9EC3E8", "#8DB4DE", 0.25, 0.6, 32, 60, 0.4, 19);
    }
    // körfez (su) + parıltılar
    var sea = c.createLinearGradient(0, horizon, 0, h);
    sea.addColorStop(0, night ? "#1E2470" : sunset ? "#7B4FA0" : "#3FB5F0");
    sea.addColorStop(1, night ? "#0E1240" : sunset ? "#3A2C86" : "#1E7FD6");
    c.fillStyle = sea;
    c.fillRect(0, horizon, w, h - horizon);
    c.strokeStyle = night ? "rgba(255,217,138,0.35)" : "rgba(255,255,255,0.45)";
    c.lineWidth = 2;
    for (var k = 0; k < 40; k++) {
      var sx = rnd() * w, sy = horizon + 8 + rnd() * (h - horizon);
      c.beginPath();
      c.moveTo(sx, sy);
      c.lineTo(sx + 8 + rnd() * 14, sy);
      c.stroke();
    }
    bgLayer = L;
    return L;
  }

  var GRASS_TUFTS = (function () {
    var r = A.seeded(321), out = [];
    for (var i = 0; i < 160; i++) out.push([-EDGE + r() * EDGE * 2, -EDGE + r() * EDGE * 2, r()]);
    return out;
  })();
  var ROAD_HW = 3.2, WALK_HW = 5.2;
  function drawGround(c) {
    var E = EDGE, Z = cam.zoom;
    // adanın yan yüzleri (toprak + kaya), lacivert kontur
    var D = 14;
    var sideL = [W2S(-E, 0, E), W2S(E, 0, E), W2S(E, -D, E), W2S(-E, -D, E)];
    var sideR = [W2S(E, 0, E), W2S(E, 0, -E), W2S(E, -D, -E), W2S(E, -D, E)];
    var gl = c.createLinearGradient(0, sideL[0][1], 0, sideL[3][1]);
    gl.addColorStop(0, K("#C98A4B"));
    gl.addColorStop(1, K("#8A5426"));
    polyPath(c, sideL);
    c.fillStyle = gl;
    c.fill();
    polyPath(c, sideR);
    c.fillStyle = K("#7A4A22");
    c.fill();
    // katmanlar
    topDo(-D * 0.45, function (cc) {
      cc.strokeStyle = rgba("#5A3418", 0.35);
      cc.lineWidth = 1.2;
      cc.beginPath();
      cc.moveTo(-E, E);
      cc.lineTo(E, E);
      cc.lineTo(E, -E);
      cc.stroke();
    });
    [sideL, sideR].forEach(function (s) {
      polyPath(c, s);
      outline(c, Math.max(1.5, Z * 0.5));
    });
    G.c = c;
    G.P = W2S;
    G.s = Z;
    G.lw = A.clamp(0.3 * Z, 0.9, 3.4);
    // zemin karoları (önbellekli): hücre başına bir sprite
    for (var i = 0; i < 5; i++)
      for (var j = 0; j < 5; j++) {
        var t = GTILES[i * 5 + j], s = W2S(t.cx, 0, t.cz);
        if (s[0] < -60 * Z || s[0] > W + 60 * Z || s[1] < -32 * Z || s[1] > H + 32 * Z) continue;
        blitSprite(c, groundTile(t), t.cx, t.cz);
      }
    topDo(0, function (cc) {
      cc.strokeStyle = NAVY;
      cc.lineWidth = Math.max(1.5, Z * 0.5) / Z;
      cc.strokeRect(-E, -E, E * 2, E * 2);
    });
  }
  var GB = [-138, -84, -30, 30, 84, 138];
  var GTILES = [];
  for (var gi = 0; gi < 5; gi++)
    for (var gj = 0; gj < 5; gj++) GTILES.push({ i: gi, j: gj, x0: GB[gi], x1: GB[gi + 1], z0: GB[gj], z1: GB[gj + 1], cx: (GB[gi] + GB[gi + 1]) / 2, cz: (GB[gj] + GB[gj + 1]) / 2 });
  function groundTile(t) {
    return getSprite("gnd:" + t.i + ":" + t.j, function () {
      var hx = (t.x1 - t.x0) / 2, hz = (t.z1 - t.z0) / 2;
      extBox(0, 0, hx * 2, hz * 2, 0, 0);
      flat(function () {
        topDo(0, function (cc) {
          cc.beginPath();
          cc.rect(-hx - 0.25, -hz - 0.25, hx * 2 + 0.5, hz * 2 + 0.5);
          cc.clip();
          cc.translate(-t.cx, -t.cz);
          paintGroundWorld(cc);
        });
      });
    });
  }
  /** Zeminin tamamı (dünya xz uzayında): çim, kaldırım, yol, çizgiler, geçitler. */
  function paintGroundWorld(cc) {
    var E = EDGE;
      // çim üst yüz
      cc.fillStyle = K("#5CC85A");
      cc.fillRect(-E, -E, E * 2, E * 2);
      // çim kenar dudağı
      cc.fillStyle = K("#47B54C");
      cc.fillRect(-E, E - 1.6, E * 2, 1.6);
      cc.fillRect(E - 1.6, -E, 1.6, E * 2);
      // hücre karoları (hafif dama)
      var cs = [-111, -57, 0, 57, 111];
      for (var i = 0; i < 5; i++)
        for (var j = 0; j < 5; j++) {
          if ((i + j) % 2) continue;
          var hw = i === 2 ? 25 : 22, hd = j === 2 ? 25 : 22;
          cc.fillStyle = "rgba(255,255,255,0.07)";
          cc.fillRect(cs[i] - hw, cs[j] - hd, hw * 2, hd * 2);
        }
      GRASS_TUFTS.forEach(function (t) {
        cc.fillStyle = t[2] < 0.5 ? "rgba(255,255,255,0.12)" : "rgba(30,110,50,0.14)";
        cc.beginPath();
        cc.ellipse(t[0], t[1], 0.9, 0.5, 0, 0, Math.PI * 2);
        cc.fill();
      });
      // kaldırımlar
      cc.fillStyle = K("#E9E4F4");
      ROADS.forEach(function (r) {
        cc.fillRect(r - WALK_HW, -E, WALK_HW * 2, E * 2);
        cc.fillRect(-E, r - WALK_HW, E * 2, WALK_HW * 2);
      });
      // bordür
      cc.strokeStyle = K("#B4ACD2");
      cc.lineWidth = 0.35;
      ROADS.forEach(function (r) {
        [-1, 1].forEach(function (s) {
          cc.beginPath();
          cc.moveTo(r + s * ROAD_HW, -E);
          cc.lineTo(r + s * ROAD_HW, E);
          cc.moveTo(-E, r + s * ROAD_HW);
          cc.lineTo(E, r + s * ROAD_HW);
          cc.stroke();
        });
      });
      // asfalt
      cc.fillStyle = K("#4A5274");
      ROADS.forEach(function (r) {
        cc.fillRect(r - ROAD_HW, -E, ROAD_HW * 2, E * 2);
        cc.fillRect(-E, r - ROAD_HW, E * 2, ROAD_HW * 2);
      });
      // şerit çizgileri (kavşak dışında)
      cc.strokeStyle = TH.night > 0.5 ? "#FFE08A" : "#FFFFFF";
      cc.lineWidth = 0.3;
      cc.setLineDash([2.2, 2]);
      ROADS.forEach(function (r) {
        var stops = [-E].concat(ROADS.map(function (q) { return q; }), [E]);
        for (var k = 0; k < stops.length - 1; k++) {
          var a = stops[k] + (k ? ROAD_HW + 2.5 : 0), b = stops[k + 1] - (k < stops.length - 2 ? ROAD_HW + 2.5 : 0);
          cc.beginPath();
          cc.moveTo(r, a);
          cc.lineTo(r, b);
          cc.moveTo(a, r);
          cc.lineTo(b, r);
          cc.stroke();
        }
      });
      cc.setLineDash([]);
      // yaya geçitleri
      cc.fillStyle = TH.night > 0.5 ? "rgba(230,232,255,0.75)" : "rgba(255,255,255,0.92)";
      ROADS.forEach(function (rx) {
        ROADS.forEach(function (rz) {
          for (var s = -ROAD_HW + 0.5; s < ROAD_HW - 0.3; s += 1.1) {
            cc.fillRect(rx + s, rz - ROAD_HW - 2.2, 0.55, 1.8);
            cc.fillRect(rx + s, rz + ROAD_HW + 0.4, 0.55, 1.8);
            cc.fillRect(rx - ROAD_HW - 2.2, rz + s, 1.8, 0.55);
            cc.fillRect(rx + ROAD_HW + 0.4, rz + s, 1.8, 0.55);
          }
        });
      });
  }
  /** Odaktaki arsanın zeminde nabız gibi atan seçim çerçevesi. */
  function drawFocusRing(c) {
    if (!focusKey) return;
    var p = PLOTS[focusKey];
    if (!p) return;
    var big = isStad(focusKey);
    var hw = big ? 26 : 22.5;
    var a = 0.45 + 0.35 * Math.sin(A.time * 4);
    topDo(0.1, function (cc) {
      A.roundRect(cc, p.x - hw, p.z - hw, hw * 2, hw * 2, 3.5);
      cc.strokeStyle = "rgba(255,255,255," + a + ")";
      cc.lineWidth = 1.1;
      cc.setLineDash([2.4, 1.6]);
      cc.lineDashOffset = -A.time * 3;
      cc.stroke();
      cc.setLineDash([]);
    });
  }

  /* ═══════════════════════ sokak lambaları ═══════════════════════ */

  var LAMPS = (function () {
    var out = [], mids = [-111, -57, 0, 57, 111];
    ROADS.forEach(function (r) {
      mids.forEach(function (m, i) {
        out.push({ x: r + 4.4, z: m + (i % 2 ? 6 : -6) });
        out.push({ x: m + (i % 2 ? -6 : 6), z: r + 4.4 });
      });
    });
    return out;
  })();

  /* ═══════════════════════ canlılar ═══════════════════════ */

  var match = null;
  function resetMatch() {
    match = makeMatch(pitchSize());
    match.lv = lvOf("saha");
  }
  function makeMatch(P) {
    var match = { ball: { x: 0, z: 0, y: 0.25, vx: 0, vz: 0, vy: 0, spin: 0 }, players: [], P: P };
    var n = P.players;
    for (var i = 0; i < n; i++) {
      var team = i % 2;
      match.players.push({
        team: team,
        x: (team ? 1 : -1) * A.rand(1, P.w / 2 - 2),
        z: A.rand(-P.d / 2 + 1.5, P.d / 2 - 1.5),
        home: { x: (team ? 1 : -1) * (1.5 + (i % 5) * (P.w / 12)), z: ((i % 3) - 1) * (P.d / 3.4) },
        phase: Math.random() * 6,
        kick: -9,
        dir: team ? -1 : 1,
        look: (i * 7 + 3) % 5,
        keeper: i < 2 && P.players >= 10,
      });
    }
    return match;
  }
  function stepMatch(dt) {
    if (V2 && lvOf("stadyum") < 1) {
      match = null;
      return;
    }
    var P = pitchSize();
    if (!match || match.P !== P || match.lv !== lvOf("saha")) resetMatch();
    simMatch(match, P, dt, goalFx);
  }
  function simMatch(match, P, dt, onGoal) {
    var b = match.ball;
    b.vy -= 16 * dt;
    b.x += b.vx * dt;
    b.z += b.vz * dt;
    b.y = Math.max(0.25, b.y + b.vy * dt);
    if (b.y <= 0.25 && b.vy < 0) b.vy *= -0.45;
    var f = Math.exp(-(b.y <= 0.3 ? 1.5 : 0.3) * dt);
    b.vx *= f;
    b.vz *= f;
    b.spin += (b.vx + b.vz) * dt * 1.5;
    var hw = P.w / 2 - 0.6, hd = P.d / 2 - 0.6;
    if (Math.abs(b.x) > hw) {
      if (Math.abs(b.z) < (P.w >= 28 ? 2.6 : 1.4) && b.y < 2) {
        if (onGoal) onGoal(Math.sign(b.x) * hw, b.z);
        b.x = 0;
        b.z = 0;
        b.vx = b.vz = 0;
      } else {
        b.x = Math.sign(b.x) * hw;
        b.vx *= -0.6;
      }
    }
    if (Math.abs(b.z) > hd) {
      b.z = Math.sign(b.z) * hd;
      b.vz *= -0.6;
    }
    var near = [null, null], nd = [1e9, 1e9];
    match.players.forEach(function (p) {
      var d = Math.hypot(p.x - b.x, p.z - b.z);
      if (!p.keeper && d < nd[p.team]) {
        nd[p.team] = d;
        near[p.team] = p;
      }
    });
    var kidK = P.w < 18 ? 0.8 : 1;
    match.players.forEach(function (p) {
      var tx, tz;
      if (p.keeper) {
        tx = (p.team ? 1 : -1) * (hw - 0.5);
        tz = A.clamp(b.z * 0.4, -1.5, 1.5);
      } else if (near[p.team] === p) {
        tx = b.x;
        tz = b.z;
      } else {
        tx = p.home.x + b.x * 0.45;
        tz = p.home.z + b.z * 0.4;
      }
      var dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
      var sp = (near[p.team] === p ? 4 : 2.1) * kidK;
      p.moving = d > 0.35;
      if (p.moving) {
        p.x += (dx / d) * Math.min(d, sp * dt);
        p.z += (dz / d) * Math.min(d, sp * dt);
        var su = dx - dz; // ekran yatayı
        if (Math.abs(su) > 0.2) p.dir = su > 0 ? 1 : -1;
      }
      p.phase += dt * (p.moving ? sp * 2.6 : 2);
      if (near[p.team] === p && d < 0.65 && A.time - p.kick > 0.6 && b.y < 0.7) {
        p.kick = A.time;
        var goalX = p.team ? -hw : hw;
        var shoot = Math.abs(goalX - b.x) < P.w * 0.35;
        var ang = Math.atan2(A.rand(-1.6, 1.6) - b.z, goalX - b.x) + (shoot ? 0 : A.rand(-0.9, 0.9));
        var pw = (shoot ? A.rand(9, 12) : A.rand(4.5, 8)) * kidK;
        b.vx = Math.cos(ang) * pw;
        b.vz = Math.sin(ang) * pw;
        b.vy = shoot ? A.rand(1, 3.5) : A.rand(0, 2.2);
        p.dir = goalX - b.x - 0 > 0 ? 1 : -1;
      }
    });
  }
  var goalAt = -9;
  function goalFx(x, z) {
    goalAt = A.time;
    for (var i = 0; i < 26; i++) addConf(x, 1.5, z, 5);
  }

  var walkers = null, cars = null, busV = null, trainX = 0;
  function initTraffic() {
    walkers = [];
    for (var i = 0; i < 16; i++) walkers.push(newWalker(true));
    cars = [];
    for (var k = 0; k < 7; k++) cars.push(newCar(true));
    busV = newCar(true);
    busV.bus = true;
  }
  function newWalker(anywhere) {
    var r = ROADS[(Math.random() * 4) | 0], ax = Math.random() < 0.5, dir = Math.random() < 0.5 ? 1 : -1;
    var side = Math.random() < 0.5 ? -1 : 1;
    return { ax: ax, line: r + side * 4.2, pos: anywhere ? A.rand(-EDGE, EDGE) : -dir * (EDGE - 2), dir: dir, sp: A.rand(1.1, 1.7), phase: Math.random() * 6, look: (Math.random() * 5) | 0, shirt: A.pick(["#FF4D5E", "#3B82F6", "#FFD43B", "#22C55E", "#A855F7", "#FF8A3D", kit.primary, kit.primary]) };
  }
  function newCar(anywhere) {
    var r = ROADS[(Math.random() * 4) | 0], ax = Math.random() < 0.5, dir = Math.random() < 0.5 ? 1 : -1;
    // sağdan akış: yönüne göre şerit
    var lane = (ax ? 1 : -1) * dir * 1.55;
    return { ax: ax, line: r + lane, pos: anywhere ? A.rand(-EDGE, EDGE) : -dir * (EDGE + 4), dir: dir, sp: A.rand(7, 11), col: A.pick(CAR_COLS) };
  }
  function stepTraffic(dt) {
    if (!walkers) initTraffic();
    walkers.forEach(function (w, i) {
      w.pos += w.dir * w.sp * dt;
      w.phase += dt * 7;
      if (Math.abs(w.pos) > EDGE - 1) walkers[i] = newWalker(false);
    });
    var nCars = 2 + Math.min(5, lvOf("ulasim"));
    cars.forEach(function (car, i) {
      car.on = i < nCars;
      car.pos += car.dir * car.sp * dt;
      if (Math.abs(car.pos) > EDGE + 6) cars[i] = newCar(false);
    });
    busV.on = lvOf("ulasim") >= 3;
    busV.mini = lvOf("ulasim") < 6;
    busV.pos += busV.dir * 6 * dt;
    if (Math.abs(busV.pos) > EDGE + 8) {
      var nb = newCar(false);
      nb.bus = true;
      busV = nb;
    }
    trainX += dt * 16;
  }

  /* ─────────────── birim çevresindeki insanlar ─────────────── */

  var QUEUE = {
    kantin: [null, [2, 2.6], [0, 4.4], [0, 2.6], [0, 2.4], [-3, 9], [0, 15]],
    magaza: [null, [0, 4.2], [0, 2.4], [-1, 2.4], [0, 2.6], [5, 11]],
  };
  function lifeEntries(list) {
    if (!walkers) initTraffic();
    // kuyruklar
    ["kantin", "magaza"].forEach(function (k) {
      var lv = lvOf(k);
      var q = QUEUE[k][lv];
      if (!q || isBuilding(k)) return;
      var p = PLOTS[k], n = k === "kantin" ? Math.min(2 + lv, 7) : lv >= 5 ? 8 : Math.min(1 + lv, 5);
      for (var i = 0; i < n; i++) {
        var x = p.x + q[0] + Math.sin(i * 1.7) * 0.4, z = p.z + q[1] + i * 1.25;
        list.push(personEntry(x, z, { kit: { p: ["#FF4D5E", "#3B82F6", kit.primary, "#FFD43B", "#22C55E"][i % 5], s: "#FFFFFF" }, pose: "idle", t: A.time + i * 1.3, look: i, dir: -1 }));
      }
    });
    // antrenman: koni slalomu + daire koşusu + antrenör
    var la = lvOf("antrenman");
    if (la >= 1 && !isBuilding("antrenman")) {
      var pa = PLOTS.antrenman, n2 = Math.min(3 + la * 2, 14);
      var cz = la === 1 ? 6 : la <= 3 ? 10 : la === 4 ? 16 : 6;
      for (var t = 0; t < n2; t++) {
        var u = (A.time * 0.1 + t / n2) % 1, px, pz, dirx;
        if (t % 3 === 2) {
          var a = A.time * 0.8 + t;
          px = pa.x + Math.cos(a) * 6;
          pz = pa.z + (la >= 5 ? 6 : -1) + Math.sin(a) * 4;
          dirx = -Math.sin(a) - Math.cos(a) > 0 ? 1 : -1;
        } else {
          px = pa.x - 9 + u * 18;
          pz = pa.z + cz + Math.sin(u * Math.PI * 7) * 1.1;
          dirx = 1;
        }
        list.push(personEntry(px, pz, { kit: { p: "#FF8A3D", s: kit.primary }, pose: "run", t: A.time * 9 + t, look: t, dir: dirx }));
      }
      list.push(personEntry(pa.x + 12, pa.z + cz - 2, { kit: { p: "#1B1648", s: kit.primary }, pose: "whistle", t: A.time, look: 2, dir: -1, acc: { cap: kit.primary } }));
    }
    // akademi: top peşinde çocuklar
    var lk = lvOf("akademi");
    if (lk >= 1 && !isBuilding("akademi")) {
      var pk = PLOTS.akademi, cx = pk.x + (lk >= 4 ? -4 : 0), cz2 = pk.z + (lk >= 3 ? 6 : 2), nk = Math.min(4 + lk * 3, 16);
      var bx = cx + Math.cos(A.time * 0.7) * 5, bz = cz2 + Math.sin(A.time * 0.9) * 3;
      for (var k = 0; k < nk; k++) {
        var a2 = A.time * (0.5 + (k % 3) * 0.13) + k * 1.7;
        var kx = bx + Math.cos(a2) * (1.5 + (k % 4) * 0.9), kz = bz + Math.sin(a2 * 1.3) * 2;
        list.push(personEntry(kx, kz, { kit: k % 2 ? { p: "#FFFFFF", s: "#1E3A8A" } : { p: kit.primary, s: kit.secondary }, pose: "run", t: A.time * 10 + k, look: k, dir: Math.cos(a2 + 1.6) > 0 ? 1 : -1, scale: 0.72 }));
      }
      list.push(ballEntry(bx, 0.25, bz, A.time * 6, 0.75));
    }
    // kamp: ateş başında takım ya da otel önünde yürüyenler
    var lc = lvOf("kamp");
    if (lc >= 1 && !isBuilding("kamp")) {
      var pc = PLOTS.kamp;
      if (lc === 1) {
        for (var s2 = 0; s2 < 6; s2++) {
          var aa = (s2 / 6) * Math.PI * 2 + 0.3;
          list.push(personEntry(pc.x + Math.cos(aa) * 3.2, pc.z + 2 + Math.sin(aa) * 3.2, { kit: { p: kit.primary, s: kit.secondary }, pose: s2 === 0 ? "cheer" : "idle", t: A.time * (s2 === 0 ? 0.6 : 1) + s2, look: s2, dir: Math.cos(aa) > 0 ? -1 : 1, sit: true }));
        }
      } else
        for (var w2 = 0; w2 < 4; w2++) {
          var uu = (A.time * 0.05 + w2 / 4) % 1;
          list.push(personEntry(pc.x - 12 + uu * 24, pc.z + 15 + (w2 % 2) * 1.5, { kit: { p: kit.primary, s: kit.secondary }, pose: "walk", t: A.time * 6 + w2, look: w2, dir: 1 }));
        }
    }
    trafficEntries(list);
  }
  function trafficEntries(list) {
    if (!walkers) initTraffic();
    // kaldırımdaki yayalar
    walkers.forEach(function (w) {
      var x = w.ax ? w.pos : w.line, z = w.ax ? w.line : w.pos;
      var su = w.ax ? w.dir : -w.dir;
      list.push(personEntry(x, z, { kit: { p: w.shirt, s: "#FFFFFF" }, pose: "walk", t: w.phase, look: w.look, dir: su > 0 ? 1 : -1 }));
    });
    // yoldaki araçlar
    cars.forEach(function (car) {
      if (!car.on) return;
      var x = car.ax ? car.pos : car.line, z = car.ax ? car.line : car.pos;
      list.push({
        d: x + z,
        fn: function () {
          drawCar(x, z, car.ax, car.col, car.dir);
        },
      });
    });
    if (busV.on) {
      var bx2 = busV.ax ? busV.pos : busV.line, bz2 = busV.ax ? busV.line : busV.pos;
      list.push({
        d: bx2 + bz2,
        fn: function () {
          drawBus(bx2, bz2, busV.ax, busV.mini);
        },
      });
    }
  }
  function personEntry(x, z, o) {
    return {
      d: x + z,
      fn: function (c) {
        drawPerson(c, x, z, o);
      },
    };
  }
  function ballEntry(x, y, z, spin, k) {
    return {
      d: x + z + 0.01,
      fn: function (c) {
        drawBallAt(c, x, y, z, spin, k);
      },
    };
  }
  function drawBallAt(c, x, y, z, spin, k) {
    var Z = cam.zoom, r = Math.max(1.4, 0.32 * Z * (k || 1));
    var g = W2S(x, 0, z), p = W2S(x, y, z);
    if (g[0] < -20 || g[0] > W + 20 || g[1] < -20 || g[1] > H + 30) return;
    c.fillStyle = "rgba(27,22,72,0.25)";
    c.beginPath();
    c.ellipse(g[0], g[1], r * 1.1, r * 0.5, 0, 0, Math.PI * 2);
    c.fill();
    if (r < 3) {
      c.beginPath();
      c.arc(p[0], p[1] - r, r, 0, Math.PI * 2);
      c.fillStyle = "#FFFFFF";
      c.fill();
      c.lineWidth = 1;
      c.strokeStyle = NAVY;
      c.stroke();
    } else flatBall(c, p[0], p[1] - r, r, spin);
  }
  /** Kişi: yakında çizgi film futbolcu, uzakta basit iki parça. */
  function drawPerson(c, x, z, o) {
    var Z = cam.zoom;
    var p = W2S(x, 0, z);
    if (p[0] < -30 || p[0] > W + 30 || p[1] < -10 || p[1] > H + 60) return;
    var hpx = 2.5 * HY * Z * (o.scale || 1);
    if (o.sit) p[1] += hpx * 0.18;
    if (hpx < 13) {
      var r = hpx * 0.22;
      c.fillStyle = "rgba(27,22,72,0.22)";
      c.beginPath();
      c.ellipse(p[0], p[1], r * 1.4, r * 0.6, 0, 0, Math.PI * 2);
      c.fill();
      var bob = o.pose === "run" || o.pose === "walk" ? -Math.abs(Math.sin(o.t)) * hpx * 0.06 : 0;
      c.beginPath();
      c.ellipse(p[0], p[1] - hpx * 0.32 + bob, hpx * 0.2, hpx * 0.3, 0, 0, Math.PI * 2);
      c.fillStyle = K(o.kit.p);
      c.fill();
      if (hpx > 5) {
        c.lineWidth = 0.8;
        c.strokeStyle = NAVY;
        c.stroke();
      }
      c.beginPath();
      c.arc(p[0], p[1] - hpx * 0.78 + bob, hpx * 0.21, 0, Math.PI * 2);
      c.fillStyle = K(SKINS[(o.look || 0) % SKINS.length]);
      c.fill();
      if (hpx > 5) c.stroke();
      return;
    }
    var g = guySprite(o, hpx);
    c.drawImage(g.cv, p[0] - g.fx, p[1] - g.fy, g.w, g.h);
  }
  /* Kişi kareleri önbelleği: (forma, poz, kare, yön, ten, boy, tema) başına bir kez çizilir. */
  var GUY_PERIOD = { run: Math.PI * 2, walk: Math.PI * 2, idle: (Math.PI * 2) / 2.6, ready: (Math.PI * 2) / 3, keeper: Math.PI / 2, cheer: 2, whistle: Math.PI / 3, wave: Math.PI / 2 };
  var guyCache = {}, guyCount = 0;
  function guySprite(o, hpx) {
    var pose = o.pose || "idle", per = GUY_PERIOD[pose], t = o.t || 0, f;
    if (per) {
      var n = pose === "run" || pose === "walk" ? 12 : 8;
      f = Math.floor((((t % per) + per) % per) / per * n) % n;
      t = (f / n) * per;
    } else {
      f = Math.min(7, Math.floor(A.clamp(t, 0, 1) * 8));
      t = f / 7;
    }
    var hb = Math.round(hpx);
    var acc = o.acc || {};
    var key = [o.kit.p, o.kit.s, pose, f, o.dir > 0 ? 1 : 0, (o.look || 0) % 5, hb, TH.key, acc.gloves ? 1 : 0, acc.whistle ? 1 : 0, acc.cap || ""].join("|");
    var g = guyCache[key];
    if (g) return g;
    if (guyCount > 420) {
      guyCache = {};
      guyCount = 0;
    }
    var w = Math.ceil(hb * 1.5) + 4, h = Math.ceil(hb * 1.7) + 4;
    var cv = document.createElement("canvas");
    cv.width = Math.max(1, Math.round(w * DPR));
    cv.height = Math.max(1, Math.round(h * DPR));
    var x = cv.getContext("2d");
    x.setTransform(DPR, 0, 0, DPR, 0, 0);
    var fx = w / 2, fy = h - hb * 0.12 - 2;
    x.fillStyle = "rgba(27,22,72,0.22)";
    x.beginPath();
    x.ellipse(fx, fy, hb * 0.28, hb * 0.1, 0, 0, Math.PI * 2);
    x.fill();
    drawGuy(x, fx, fy, hb / 46, { kit: o.kit, pose: pose, t: t, dir: o.dir, look: o.look, acc: o.acc, tint: TH.tint || "#FFFFFF", tintK: TH.tk * 0.55 });
    g = { cv: cv, w: w, h: h, fx: fx, fy: fy };
    guyCache[key] = g;
    guyCount++;
    return g;
  }
  /** Maçtaki oyuncular (stadyum katmanları arasında). */
  function drawMatch(c) {
    if (!match) return;
    var lvS = lvOf("saha"), kids = lvS === 0;
    var home = { p: kit.primary, s: kit.secondary }, away = kit.primary === "#F8FAFC" || kit.primary === "#FFFFFF" ? { p: "#111827", s: "#F8FAFC" } : { p: "#F8FAFC", s: "#111827" };
    var ents = [];
    match.players.forEach(function (p) {
      var kicking = A.time - p.kick < 0.4;
      var pose = kicking ? "kick" : p.keeper ? "keeper" : p.moving ? "run" : "ready";
      var kt = kicking ? (A.time - p.kick) / 0.4 : p.phase;
      var k2 = kids ? (p.team ? { p: "#FFFFFF", s: "#1E3A8A" } : { p: "#38BDF8", s: "#1E3A8A" }) : p.keeper ? { p: "#FFD43B", s: "#111827" } : p.team ? away : home;
      ents.push(personEntry(p.x, p.z, { kit: k2, pose: pose, t: kt, dir: p.dir, look: p.look, scale: kids ? 0.78 : 1, acc: p.keeper ? { gloves: true } : null }));
    });
    if (pitchSize().players >= 22) {
      var rx = match.ball.x * 0.6 + 2, rz = match.ball.z * 0.5 - 3;
      ents.push(personEntry(rx, rz, { kit: { p: "#111827", s: "#111827" }, pose: "walk", t: A.time * 5, dir: match.ball.x > rx ? 1 : -1, look: 1, acc: { whistle: true } }));
    }
    var b = match.ball;
    ents.push(ballEntry(b.x, b.y, b.z, b.spin, 1));
    ents.sort(function (a, b2) {
      return a.d - b2.d;
    });
    ents.forEach(function (e) {
      e.fn(c);
    });
    // gol: tribünden konfeti ve sevinç
    if (A.time - goalAt < 2.5 && lvOf("tribun") >= 1) {
      var ga = 1 - (A.time - goalAt) / 2.5;
      var tp = W2S(0, 4, -pitchSize().d / 2 - 4);
      c.save();
      c.globalAlpha = ga;
      A.bigText(c, "GOL!", tp[0], tp[1] - 20 - (1 - ga) * 20, Math.max(16, cam.zoom * 4), "#FFD43B");
      c.restore();
    }
  }

  /* ═══════════════════════ dünya parçacıkları ═══════════════════════ */

  var WP = [];
  function addPuff(x, y, z, s) {
    WP.push({ k: "puff", x: x, y: y, z: z, vx: A.rand(-2.5, 2.5), vy: A.rand(1, 2.6), vz: A.rand(-2.5, 2.5), life: 0.95, max: 0.95, size: s || A.rand(0.7, 1.3), g: -0.5 });
  }
  function addConf(x, y, z, sp) {
    var a = Math.random() * Math.PI * 2, v = A.rand(0.3, 1) * (sp || 9);
    WP.push({ k: "conf", x: x, y: y, z: z, vx: Math.cos(a) * v, vy: A.rand(6, 13), vz: Math.sin(a) * v, life: 2.2, max: 2.2, size: A.rand(0.35, 0.6), g: 9, rot: Math.random() * 6, vr: A.rand(-10, 10), col: A.pick([kit.primary, kit.secondary, "#FFD43B", "#38BDF8", "#FF4D6A", "#22C55E"]) });
  }
  function addSpark(x, y, z, col, sp) {
    var a = Math.random() * Math.PI * 2, b = Math.random() * Math.PI - Math.PI / 2, v = A.rand(0.6, 1) * (sp || 14);
    WP.push({ k: "spark", x: x, y: y, z: z, vx: Math.cos(a) * Math.cos(b) * v, vy: Math.sin(b) * v, vz: Math.sin(a) * Math.cos(b) * v, life: 1.4, max: 1.4, size: A.rand(0.4, 0.7), g: 4, col: col });
  }
  function addSteam(x, y, z) {
    WP.push({ k: "steam", x: x + A.rand(-0.3, 0.3), y: y, z: z, vx: 0.4, vy: 1.3, vz: -0.2, life: 2.4, max: 2.4, size: 0.6, g: -0.1 });
  }
  function addDrop(x, y, z) {
    WP.push({ k: "drop", x: x, y: y, z: z, vx: A.rand(-0.7, 0.7), vy: A.rand(4.5, 6.5), vz: A.rand(-0.7, 0.7), life: 1.2, max: 1.2, size: 0.22, g: 10 });
  }
  function addEmber(x, y, z) {
    WP.push({ k: "ember", x: x + A.rand(-0.4, 0.4), y: y, z: z, vx: A.rand(-0.4, 0.4), vy: 2.5, vz: 0, life: 0.9, max: 0.9, size: 0.2, g: -0.6 });
  }
  function stepWP(dt) {
    if (WP.length > 600) WP.splice(0, WP.length - 600);
    for (var i = WP.length - 1; i >= 0; i--) {
      var p = WP[i];
      p.vy -= p.g * dt;
      var dr = Math.exp(-(p.k === "conf" ? 1.2 : p.k === "puff" ? 1.8 : 0.4) * dt);
      p.vx *= dr;
      p.vz *= dr;
      if (p.k === "conf") p.vy = Math.max(p.vy, -3.2);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.rot != null) p.rot += p.vr * dt;
      p.life -= dt;
      if (p.y < 0 && p.k !== "spark") p.life = Math.min(p.life, 0.25);
      if (p.life <= 0) WP.splice(i, 1);
    }
  }
  function drawWP(c) {
    var Z = cam.zoom;
    for (var i = 0; i < WP.length; i++) {
      var p = WP[i], s = W2S(p.x, Math.max(0, p.y), p.z), a = A.clamp(p.life / (p.max * 0.5), 0, 1);
      if (s[0] < -40 || s[0] > W + 40 || s[1] < -40 || s[1] > H + 40) continue;
      if (p.k === "puff") {
        var k = 1 - p.life / p.max, r = p.size * Z * (0.6 + k * 1.1);
        c.globalAlpha = a * 0.9;
        c.beginPath();
        c.arc(s[0], s[1], r, 0, Math.PI * 2);
        c.fillStyle = TH.night > 0.5 ? "#8E86B8" : "#F3E6CF";
        c.fill();
        c.lineWidth = Math.max(1, Z * 0.18);
        c.strokeStyle = rgba(NAVY, 0.35);
        c.stroke();
        c.fillStyle = "rgba(255,255,255,0.5)";
        c.beginPath();
        c.arc(s[0] - r * 0.3, s[1] - r * 0.3, r * 0.35, 0, Math.PI * 2);
        c.fill();
      } else if (p.k === "conf") {
        c.globalAlpha = a;
        c.save();
        c.translate(s[0], s[1]);
        c.rotate(p.rot);
        c.fillStyle = p.col;
        var sz = Math.max(2, p.size * Z);
        c.fillRect(-sz, -sz * 0.45 * Math.abs(Math.cos(p.rot * 1.3)), sz * 2, sz * 0.9 * Math.abs(Math.cos(p.rot * 1.3)) + 0.5);
        c.restore();
      } else if (p.k === "spark") {
        c.globalAlpha = a;
        c.fillStyle = p.col;
        c.beginPath();
        c.arc(s[0], s[1], Math.max(1.2, p.size * Z * (0.5 + a * 0.5)), 0, Math.PI * 2);
        c.fill();
      } else if (p.k === "steam") {
        var k2 = 1 - p.life / p.max;
        c.globalAlpha = a * 0.45;
        c.fillStyle = "#FFFFFF";
        c.beginPath();
        c.arc(s[0], s[1], Math.max(1, (0.5 + k2 * 1.6) * Z), 0, Math.PI * 2);
        c.fill();
      } else if (p.k === "drop") {
        c.globalAlpha = a;
        c.fillStyle = "#BFEFFF";
        c.beginPath();
        c.arc(s[0], s[1], Math.max(0.8, p.size * Z), 0, Math.PI * 2);
        c.fill();
      } else if (p.k === "ember") {
        c.globalAlpha = a;
        c.fillStyle = "#FFD27A";
        c.beginPath();
        c.arc(s[0], s[1], Math.max(0.8, p.size * Z), 0, Math.PI * 2);
        c.fill();
      }
    }
    c.globalAlpha = 1;
  }

  /* ═══════════════════════ inşaat sahnesi ═══════════════════════ */

  var con = null;
  var CON_DUR = 2.8;
  function isBuilding(k) {
    return con && (con.key === k || ((k === "saha" || k === "tribun") && (con.key === "saha" || con.key === "tribun"))) && conT() < 0.5;
  }
  function conT() {
    return con ? (A.time - con.t0) / CON_DUR : 9;
  }
  function startConstruction(key, from, to) {
    con = { key: key, from: from, to: to, t0: A.time, popped: false, dusted: false, dust2: false };
    if (V2 && !isStad(key)) {
      var part = conPart(key, from, to);
      if (part) {
        con.part = part;
        con.px = part.x;
        con.pz = part.z;
      }
    }
    A.sound("place");
    A.haptic("medium");
    A.shake(5);
  }
  /** İnşaatın sprite esnemesi: {old:{sx,sy,a}, nu:{sx,sy,a}}. */
  function conScale() {
    var t = conT();
    var old = { sx: 1, sy: 1, a: 1 }, nu = { sx: 1, sy: 0, a: 0 };
    if (t < 0.24) {
      old.sy = 1 + Math.sin(t * 40) * 0.015;
    } else if (t < 0.42) {
      var k = (t - 0.24) / 0.18;
      old.sy = 1 - k * k;
      old.sx = 1 + k * 0.12;
      old.a = 1 - k * 0.3;
    } else old.a = 0;
    if (t >= 0.33) {
      var k2 = A.clamp((t - 0.33) / 0.49, 0, 1);
      var sy = A.easeOutBack(k2);
      if (t > 0.82) sy = 1 + Math.sin((t - 0.82) * 30) * 0.04 * Math.max(0, 1 - (t - 0.82) / 0.2);
      nu.sy = Math.max(0.001, sy);
      nu.sx = A.clamp(1 + (1 - nu.sy) * 0.35, 0.86, 1.25);
      nu.a = 1;
    }
    return { old: old, nu: nu, t: t };
  }
  function stepConstruction(dt) {
    if (!con) return;
    var t = conT();
    var p = con.px != null ? { x: con.px, z: con.pz } : PLOTS[con.key];
    var R = isStad(con.key) ? 24 : 18;
    if (!con.dusted && t > 0.02) {
      con.dusted = true;
      for (var i = 0; i < 16; i++) {
        var a = (i / 16) * Math.PI * 2;
        addPuff(p.x + Math.cos(a) * R * A.rand(0.6, 1), 0.5, p.z + Math.sin(a) * R * A.rand(0.6, 1));
      }
    }
    if (!con.dust2 && t > 0.36) {
      con.dust2 = true;
      for (var j = 0; j < 12; j++) addPuff(p.x + A.rand(-R, R) * 0.8, 0.8, p.z + A.rand(-R, R) * 0.8, A.rand(1, 1.8));
      A.shake(4);
    }
    if (!con.popped && t >= 0.82) {
      con.popped = true;
      var top = conHeight(con.key);
      for (var k = 0; k < 90; k++) addConf(p.x + A.rand(-4, 4), top * 0.7 + 2, p.z + A.rand(-4, 4), 10);
      for (var s = 0; s < 18; s++) addSpark(p.x, top * 0.6 + 3, p.z, A.pick(["#FFD43B", "#FFFFFF", kit.primary]), 9);
      A.sound("level");
      A.sound("cheer");
      A.haptic("success");
      goalAt = A.time - 1.5;
      var sp = W2S(p.x, top, p.z);
      A.floatText((V2 ? "Aşama " : "Sv ") + con.to, sp[0], sp[1] - 10, "#FFD43B", 22);
    }
    if (t > 1.08) con = null;
  }
  function focusLift(key) {
    var m = metaFor(key, lvOf(key));
    if (!m) return 6;
    return A.clamp((-m.v0 - 21) / HY * 0.42, 3, 16);
  }
  function conHeight(key) {
    var m = con && con.part && con.key === key ? partMeta(key, con.part, lvOf(key)) : metaFor(key, lvOf(key));
    var R = isStad(key) ? 25 : 21;
    return m ? A.clamp((-m.v0 - R * 0.6) / HY, 4, 40) : 10;
  }
  /** İskele (arka ya da ön yüzler) ve vinç. */
  function drawScaffold(c, front) {
    var t = conT();
    var p = con.px != null ? { x: con.px, z: con.pz } : PLOTS[con.key];
    var big = isStad(con.key);
    var hw = big ? 22 : 13, hd = big ? 17 : 11, cz = big ? 0 : -3;
    var Hs = Math.min(big ? 14 : 22, conHeight(con.key) * 0.8 + 3);
    var rise = t < 0.15 ? A.easeOutBack(t / 0.15) : t > 0.82 ? 1 - A.smooth(A.clamp((t - 0.82) / 0.2, 0, 1)) : 1;
    var h = Hs * rise;
    if (h < 0.2) return;
    var x0 = p.x - hw, x1 = p.x + hw, z0 = p.z + cz - hd, z1 = p.z + cz + hd;
    var sides = front ? [[x0, z1, x1, z1], [x1, z1, x1, z0]] : [[x0, z0, x1, z0], [x0, z0, x0, z1]];
    var Z = cam.zoom;
    sides.forEach(function (sd) {
      var L = Math.hypot(sd[2] - sd[0], sd[3] - sd[1]), n = Math.max(2, Math.round(L / 3));
      if (front) {
        // yeşil file
        var a = W2S(sd[0], 0, sd[1]), b = W2S(sd[2], 0, sd[3]), b1 = W2S(sd[2], h, sd[3]), a1 = W2S(sd[0], h, sd[1]);
        quad(c, a, b, b1, a1);
        c.fillStyle = "rgba(34,197,94,0.28)";
        c.fill();
      }
      c.lineCap = "round";
      for (var i = 0; i <= n; i++) {
        var px = sd[0] + ((sd[2] - sd[0]) * i) / n, pz = sd[1] + ((sd[3] - sd[1]) * i) / n;
        var q0 = W2S(px, 0, pz), q1 = W2S(px, h, pz);
        c.strokeStyle = NAVY;
        c.lineWidth = Math.max(1.6, Z * 0.36);
        c.beginPath();
        c.moveTo(q0[0], q0[1]);
        c.lineTo(q1[0], q1[1]);
        c.stroke();
        c.strokeStyle = "#C6CAE0";
        c.lineWidth = Math.max(0.8, Z * 0.18);
        c.stroke();
      }
      for (var y = 2.2; y < h; y += 2.6) {
        var r0 = W2S(sd[0], y, sd[1]), r1 = W2S(sd[2], y, sd[3]);
        c.strokeStyle = NAVY;
        c.lineWidth = Math.max(2.4, Z * 0.6);
        c.beginPath();
        c.moveTo(r0[0], r0[1]);
        c.lineTo(r1[0], r1[1]);
        c.stroke();
        c.strokeStyle = "#E0A562";
        c.lineWidth = Math.max(1.2, Z * 0.36);
        c.stroke();
      }
    });
    // vinç: direk arka köşede; kol + kanca önde
    var cs = t < 0.12 ? A.easeOutBack(t / 0.12) : t > 0.86 ? 1 - A.smooth(A.clamp((t - 0.86) / 0.18, 0, 1)) : 1;
    if (cs <= 0.01) return;
    var mx = p.x - hw - 2, mz = p.z + cz - hd - 2, mh = (Hs + 10) * cs;
    var m0 = W2S(mx, 0, mz), m1 = W2S(mx, mh, mz);
    var mw = Math.max(3, Z * 1.1);
    if (!front) {
      c.strokeStyle = NAVY;
      c.lineWidth = mw + Math.max(2, Z * 0.4);
      c.beginPath();
      c.moveTo(m0[0], m0[1]);
      c.lineTo(m1[0], m1[1]);
      c.stroke();
      c.strokeStyle = "#FFC21A";
      c.lineWidth = mw;
      c.stroke();
      c.strokeStyle = rgba(NAVY, 0.6);
      c.lineWidth = Math.max(0.8, Z * 0.15);
      c.beginPath();
      for (var yy = 0; yy < mh - 1; yy += 1.6) {
        var l0 = W2S(mx, yy, mz), l1 = W2S(mx, yy + 1.6, mz);
        c.moveTo(l0[0] - mw / 2, l0[1]);
        c.lineTo(l1[0] + mw / 2, l1[1]);
      }
      c.stroke();
      return;
    }
    var ang = Math.sin(t * Math.PI * 2) * 0.9 + 0.75;
    var jx = mx + Math.cos(ang) * 22 * cs, jz = mz + Math.sin(ang) * 22 * cs;
    var kx = mx - Math.cos(ang) * 6 * cs, kz = mz - Math.sin(ang) * 6 * cs;
    var j1 = W2S(jx, mh, jz), k1 = W2S(kx, mh, kz);
    c.strokeStyle = NAVY;
    c.lineWidth = Math.max(3.5, Z * 0.95);
    c.lineCap = "round";
    c.beginPath();
    c.moveTo(k1[0], k1[1]);
    c.lineTo(j1[0], j1[1]);
    c.stroke();
    c.strokeStyle = "#FFC21A";
    c.lineWidth = Math.max(2, Z * 0.55);
    c.stroke();
    // karşı ağırlık + kabin
    c.fillStyle = "#5B6385";
    c.beginPath();
    c.arc(k1[0], k1[1], Math.max(3, Z * 1.1), 0, Math.PI * 2);
    c.fill();
    outline(c, Math.max(1.2, Z * 0.25));
    A.roundRect(c, m1[0] - Math.max(3, Z * 0.9), m1[1] - Math.max(2, Z * 0.4), Math.max(6, Z * 1.8), Math.max(5, Z * 1.5), 2);
    c.fillStyle = "#FFFFFF";
    c.fill();
    outline(c, Math.max(1.2, Z * 0.25));
    // kanca ve yük
    var hx = mx + Math.cos(ang) * 15 * cs, hz = mz + Math.sin(ang) * 15 * cs;
    var hy = mh - 5 - Math.sin(t * Math.PI * 4) * 2;
    var h0 = W2S(hx, mh, hz), h1 = W2S(hx, hy, hz);
    c.strokeStyle = NAVY;
    c.lineWidth = Math.max(1, Z * 0.15);
    c.beginPath();
    c.moveTo(h0[0], h0[1]);
    c.lineTo(h1[0], h1[1]);
    c.stroke();
    G.c = c;
    G.P = W2S;
    G.s = Z;
    drawBox(hx, hz, 2.4, 2.4, hy - 1.6, 1.6, kit.primary, {});
  }

  /* ═══════════════════════ sahne çizimi ═══════════════════════ */

  function stadIds(lvS, lvT, sv) {
    var x = sv == null ? "" : ":v" + sv;
    return { g: "sahaG:" + lvS + ":" + lvT + x, i: "sahaI:" + lvS + ":" + lvT + x, b: "tribB:" + lvT + ":" + lvS + x, f: "tribF:" + lvT + ":" + lvS + x };
  }
  function metaFor(k, lv) {
    if (V2) {
      var suf = "|" + TH.key + "|" + kit.primary + kit.secondary;
      if (isStad(k)) {
        var sv = lvOf("stadyum");
        if (!sv) return meta["v2:stadyum:0:" + (closedOf("stadyum") ? "c" : "e") + suf];
        var ids = stadIds(levels.saha, levels.tribun, sv);
        return meta[ids.b + suf] || meta[ids.f + suf];
      }
      return PARTS2[k] ? partMeta(k, PARTS2[k][0], lv) : null;
    }
    var id = k === "saha" ? "sahaI:" + lv + ":" + lvOf("tribun") : k === "tribun" ? "tribF:" + lv + ":" + lvOf("saha") : k + ":" + lv;
    var m = meta[id + "|" + TH.key + "|" + kit.primary + kit.secondary];
    if (k === "tribun") {
      var mb = meta["tribB:" + lv + ":" + lvOf("saha") + "|" + TH.key + "|" + kit.primary + kit.secondary];
      if (mb) m = mb;
    }
    return m;
  }
  function unitSprite(k, lv) {
    return getSprite(k + ":" + lv, function () {
      BUILD[k](lv);
    });
  }
  function stadiumSprites(lvS, lvT, sv) {
    var ids = stadIds(lvS, lvT, sv);
    var wrap = function (fn) {
      return function () {
        var prev = SVF;
        SVF = svFlags(sv);
        try {
          fn();
        } finally {
          SVF = prev;
        }
      };
    };
    return {
      g: getSprite(ids.g, wrap(function () {
        buildSahaG(lvS, lvT);
      })),
      i: getSprite(ids.i, wrap(function () {
        buildSahaI(lvS, lvT);
      })),
      b: getSprite(ids.b, wrap(function () {
        buildTribun(lvT, lvS, "B");
      })),
      f: getSprite(ids.f, wrap(function () {
        buildTribun(lvT, lvS, "F");
      })),
    };
  }
  /** v2 stadyumu: aşama → eski çizim + bayraklar; 0. aşamada büyük arsa. */
  function drawStadium2(c) {
    var sv = lvOf("stadyum");
    var cs = con && con.key === "stadyum" ? conScale() : null;
    if (!cs) {
      if (!sv) return blitSprite(c, stadBig(), 0, 0);
      var s = stadiumSprites(levels.saha, levels.tribun, sv);
      blitSprite(c, s.g, 0, 0);
      blitSprite(c, s.b, 0, 0);
      blitSprite(c, s.i, 0, 0);
      drawMatch(c);
      blitSprite(c, s.f, 0, 0);
      return;
    }
    var ov = Math.min(con.from, STAD_N), om = STAD_MAP[ov];
    var nu = sv ? stadiumSprites(levels.saha, levels.tribun, sv) : null;
    var old = ov && cs.old.a > 0 ? stadiumSprites(om[0], om[1], ov) : null;
    drawScaffold(c, false);
    if (!ov && cs.old.a > 0) blitSprite(c, stadBig(), 0, 0, cs.old.sx, cs.old.sy, cs.old.a);
    if (old && cs.t < 0.36) blitSprite(c, old.g, 0, 0);
    else if (nu && cs.nu.a > 0) blitSprite(c, nu.g, 0, 0, ov ? 1 : cs.nu.sx, ov ? 1 : cs.nu.sy, 1);
    ["b", "i", "f"].forEach(function (L) {
      if (old && cs.old.a > 0) blitSprite(c, old[L], 0, 0, cs.old.sx, cs.old.sy, cs.old.a);
      if (nu && cs.nu.a > 0) blitSprite(c, nu[L], 0, 0, cs.nu.sx, cs.nu.sy, 1);
    });
    drawScaffold(c, true);
  }
  function drawStadium(c) {
    if (V2) return drawStadium2(c);
    var lvS = lvOf("saha"), lvT = lvOf("tribun");
    var cs = con && (con.key === "saha" || con.key === "tribun") ? conScale() : null;
    if (!cs) {
      var s = stadiumSprites(lvS, lvT);
      blitSprite(c, s.g, 0, 0);
      blitSprite(c, s.b, 0, 0);
      blitSprite(c, s.i, 0, 0);
      drawMatch(c);
      blitSprite(c, s.f, 0, 0);
      return;
    }
    var oS = con.key === "saha" ? Math.min(con.from, MAXLV.saha) : lvS, oT = con.key === "tribun" ? Math.min(con.from, MAXLV.tribun) : lvT;
    var old = cs.old.a > 0 ? stadiumSprites(oS, oT) : null;
    var nu = stadiumSprites(lvS, lvT);
    var sahaK = con.key === "saha";
    var layer = function (which, spOld, spNew, animated) {
      if (!animated) return blitSprite(c, spNew, 0, 0);
      if (old && cs.old.a > 0) blitSprite(c, spOld, 0, 0, cs.old.sx, cs.old.sy, cs.old.a);
      if (cs.nu.a > 0) blitSprite(c, spNew, 0, 0, cs.nu.sx, cs.nu.sy, 1);
    };
    // zemin katmanı esnemez (düz): eski/yeni kesişir
    if (old && cs.t < 0.36) blitSprite(c, old.g, 0, 0);
    else blitSprite(c, nu.g, 0, 0);
    drawScaffold(c, false);
    layer("b", old && old.b, nu.b, !sahaK);
    layer("i", old && old.i, nu.i, sahaK);
    drawMatch(c);
    layer("f", old && old.f, nu.f, !sahaK);
    drawScaffold(c, true);
  }
  function drawUnit(c, k) {
    var p = PLOTS[k], lv = lvOf(k);
    if (con && con.key === k) {
      var cs = conScale();
      drawScaffold(c, false);
      if (cs.old.a > 0) blitSprite(c, unitSprite(k, Math.min(con.from, MAXLV[k])), p.x, p.z, cs.old.sx, cs.old.sy, cs.old.a);
      if (cs.nu.a > 0) blitSprite(c, unitSprite(k, lv), p.x, p.z, cs.nu.sx, cs.nu.sy, 1);
      drawScaffold(c, true);
      return;
    }
    blitSprite(c, unitSprite(k, lv), p.x, p.z);
  }
  function fillerSprite(f) {
    return getSprite("fill:" + f.i + ":" + f.j, function () {
      buildFiller(f);
    });
  }
  /** Kare için çizim listesi: derinliğe göre (x+z) sıralı. */
  function drawWorld(c) {
    if (V2) return drawWorld2(c);
    G.c = c;
    G.P = W2S;
    G.s = cam.zoom;
    G.lw = A.clamp(0.3 * cam.zoom, 0.9, 3.4);
    var list = [];
    list.push({
      d: 0,
      fn: function () {
        drawStadium(c);
      },
    });
    ORDER.forEach(function (k) {
      if (k === "saha" || k === "tribun") return;
      var p = PLOTS[k];
      list.push({
        d: p.x + p.z,
        fn: function () {
          drawUnit(c, k);
        },
      });
    });
    FILLERS.forEach(function (f) {
      var s = W2S(f.x, 0, f.z), Z = cam.zoom;
      // ekran dışı hücreler atlanır (kurulmaz)
      if (s[0] < -50 * Z || s[0] > W + 50 * Z || s[1] < -10 * Z || s[1] > H + 60 * Z) return;
      list.push({
        d: f.x + f.z,
        fn: function () {
          blitSprite(c, fillerSprite(f), f.x, f.z);
        },
      });
    });
    lifeEntries(list);
    list.sort(function (a, b) {
      return a.d - b.d;
    });
    for (var i = 0; i < list.length; i++) {
      G.c = c;
      G.P = W2S;
      G.s = cam.zoom;
      G.lw = A.clamp(0.3 * cam.zoom, 0.9, 3.4);
      list[i].fn(c);
    }
    if (lvOf("ulasim") >= 9) drawTrain(c);
  }
  function drawWorld2(c) {
    var setG = function () {
      G.c = c;
      G.P = W2S;
      G.s = cam.zoom;
      G.lw = A.clamp(0.3 * cam.zoom, 0.9, 3.4);
    };
    setG();
    var list = [{ d: 0, fn: function () { drawStadium(c); } }];
    KEYS2.forEach(function (k) {
      if (k === "stadyum") return;
      PARTS2[k].forEach(function (part) {
        list.push({
          d: part.x + part.z,
          fn: function () {
            drawUnit2(c, k, part);
          },
        });
      });
    });
    FILLERS2.forEach(function (f) {
      var s = W2S(f.x, 0, f.z), Z = cam.zoom;
      if (s[0] < -50 * Z || s[0] > W + 50 * Z || s[1] < -10 * Z || s[1] > H + 60 * Z) return;
      list.push({
        d: f.x + f.z,
        fn: function () {
          blitSprite(c, fillerSprite(f), f.x, f.z);
        },
      });
    });
    lmEntries(list);
    life2(list);
    list.sort(function (a, b) {
      return a.d - b.d;
    });
    for (var i = 0; i < list.length; i++) {
      setG();
      list[i].fn(c);
    }
    if (lvOf("ulasim") >= 9) drawTrain(c);
  }
  /** Ön kenarda yükseltilmiş metro hattı ve tren. */
  function drawTrain(c) {
    var zR = EDGE + 6, y = 9, E = EDGE + 20;
    var Z = cam.zoom;
    // ayaklar
    for (var x = -EDGE; x <= EDGE; x += 27) {
      var b = W2S(x, -14, zR), t = W2S(x, y, zR);
      c.strokeStyle = NAVY;
      c.lineWidth = Math.max(3, Z * 1.6);
      c.beginPath();
      c.moveTo(b[0], b[1]);
      c.lineTo(t[0], t[1]);
      c.stroke();
      c.strokeStyle = K("#C6CAE0");
      c.lineWidth = Math.max(1.6, Z * 1.1);
      c.stroke();
    }
    drawBox(0, zR, E * 2, 3, y - 0.8, 0.8, "#D9DCEE", { gloss: false });
    // tren: 4 vagon, ada boyunca kayar
    var span = E * 2 + 60, head = ((trainX % span) + span) % span - E - 30;
    for (var i = 0; i < 4; i++) {
      var cx = head - i * 9.6;
      if (cx < -E - 6 || cx > E + 6) continue;
      drawBox(cx, zR, 9, 2.8, y, 3, "#F2F4FF", {
        fL: function (cc, FW, FH) {
          cc.fillStyle = TH.night > 0.3 ? "#FF3B4E" : K("#DC2626");
          cc.fillRect(0, FH * 0.72, FW, FH * 0.14);
          for (var k = 0; k < 5; k++) win(cc, 0.5 + k * 1.7, 0.4, 1.3, FH * 0.42, true, "#9FE0FF");
        },
      });
    }
  }

  /* ═══════════════════════ gece ışıkları ═══════════════════════ */

  var glowCache = {};
  /** Yumuşak ışık lekesi: renk başına bir kez çizilen radyal doku, ölçeklenip basılır. */
  function glow(c, x, y, r, col, a) {
    if (r < 0.5 || a <= 0) return;
    var g = glowCache[col];
    if (!g) {
      g = document.createElement("canvas");
      g.width = g.height = 64;
      var x2 = g.getContext("2d");
      var gr = x2.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, rgba(col, 1));
      gr.addColorStop(0.35, rgba(col, 0.45));
      gr.addColorStop(1, rgba(col, 0));
      x2.fillStyle = gr;
      x2.fillRect(0, 0, 64, 64);
      glowCache[col] = g;
    }
    c.globalAlpha = Math.min(1, a);
    c.drawImage(g, x - r, y - r, r * 2, r * 2);
    c.globalAlpha = 1;
  }
  function eachAnchor(fn) {
    var suffix = "|" + TH.key + "|" + kit.primary + kit.secondary;
    if (V2) {
      var sv = lvOf("stadyum");
      if (sv) {
        var ids = stadIds(levels.saha, levels.tribun, sv);
        [ids.g, ids.i, ids.b, ids.f].forEach(function (id) {
          var m = meta[id + suffix];
          if (m) m.anchors.forEach(function (a) {
            fn(a, 0, 0, "stad");
          });
        });
      }
      KEYS2.forEach(function (k) {
        if (k === "stadyum") return;
        if (con && con.key === k && conT() < 0.82) return;
        PARTS2[k].forEach(function (part) {
          var m = partMeta(k, part, lvOf(k));
          if (m) m.anchors.forEach(function (a) {
            fn(a, part.x, part.z, k);
          });
        });
      });
      FILLERS2.forEach(function (f) {
        var m = meta["fill:" + f.i + ":" + f.j + suffix];
        if (m) m.anchors.forEach(function (a) {
          fn(a, f.x, f.z, "fill");
        });
      });
      lms.forEach(function (l) {
        var q = parseSlot(l.slot), m = lmMeta(l.key, tierOf(l));
        if (!q || !m) return;
        var p = slotPos(q.r, q.c);
        m.anchors.forEach(function (a) {
          fn(a, p.x, p.z, "lm");
        });
      });
      return;
    }
    var lvS = lvOf("saha"), lvT = lvOf("tribun");
    ["sahaG:" + lvS + ":" + lvT, "sahaI:" + lvS + ":" + lvT, "tribB:" + lvT + ":" + lvS, "tribF:" + lvT + ":" + lvS].forEach(function (id) {
      var m = meta[id + suffix];
      if (m) m.anchors.forEach(function (a) {
        fn(a, 0, 0, "stad");
      });
    });
    ORDER.forEach(function (k) {
      if (k === "saha" || k === "tribun") return;
      if (con && con.key === k && conT() < 0.82) return;
      var m = meta[k + ":" + lvOf(k) + suffix];
      if (m)
        m.anchors.forEach(function (a) {
          fn(a, PLOTS[k].x, PLOTS[k].z, k);
        });
    });
    FILLERS.forEach(function (f) {
      var m = meta["fill:" + f.i + ":" + f.j + suffix];
      if (m)
        m.anchors.forEach(function (a) {
          fn(a, f.x, f.z, "fill");
        });
    });
  }
  var STATIC_LIGHT = { flood: 1, lamp: 1, glow: 1, bulbs: 1, heat: 1, arch: 1 };
  var lightLayer = null;
  /** Durağan ışıklar (lamba, projektör, ışık zinciri) kamera değişince bir katmana çizilir. */
  function paintLights() {
    var key = baseLayer ? baseLayer.key + "," + Object.keys(meta).length : "";
    if (lightLayer && lightLayer.key === key) return lightLayer;
    if (!lightLayer || lightLayer.w !== W || lightLayer.h !== H) lightLayer = A.layer(W, H);
    lightLayer.key = key;
    var c = lightLayer.ctx;
    c.clearRect(0, 0, W, H);
    drawLights(c, true);
    return lightLayer;
  }
  function drawLights(c, statics) {
    var night = TH.night, Z = cam.zoom;
    c.save();
    c.globalCompositeOperation = "lighter";
    if (night > 0.3 && statics) {
      LAMPS.forEach(function (l) {
        var g = W2S(l.x, 0, l.z), h = W2S(l.x, 5, l.z);
        if (h[0] < -60 || h[0] > W + 60 || h[1] < -60 || h[1] > H + 80) return;
        c.save();
        c.translate(g[0], g[1]);
        c.scale(1, 0.5);
        glow(c, 0, 0, 7 * Z, "#FFD98A", 0.28 * night);
        c.restore();
        glow(c, h[0], h[1], 2.6 * Z + 3, "#FFF2B8", 0.65 * night);
      });
    }
    eachAnchor(function (a, ox, oz) {
      var p;
      if (!!STATIC_LIGHT[a.t] !== !!statics) return;
      if (a.t === "flood" && night > 0.3) {
        p = W2S(ox + a.x, a.y, oz + a.z);
        glow(c, p[0], p[1], (a.big ? 9 : 6) * Z + 4, "#FFF6D8", 0.85 * night);
        // ışık konisi: sahaya doğru
        var tgt = W2S(ox + a.x * 0.35, 0, oz + a.z * 0.35);
        var gr = c.createLinearGradient(p[0], p[1], tgt[0], tgt[1]);
        gr.addColorStop(0, "rgba(255,246,216," + 0.22 * night + ")");
        gr.addColorStop(1, "rgba(255,246,216,0)");
        c.fillStyle = gr;
        var dx = tgt[0] - p[0], dy = tgt[1] - p[1], L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L, wd = (a.big ? 11 : 7) * Z;
        c.beginPath();
        c.moveTo(p[0], p[1]);
        c.lineTo(tgt[0] + nx * wd, tgt[1] + ny * wd);
        c.lineTo(tgt[0] - nx * wd, tgt[1] - ny * wd);
        c.closePath();
        c.fill();
      } else if (a.t === "lamp" && night > 0.3) {
        p = W2S(ox + a.x, a.y, oz + a.z);
        glow(c, p[0], p[1], 2.6 * Z + 3, "#FFF2B8", 0.6 * night);
      } else if (a.t === "beacon") {
        p = W2S(ox + a.x, a.y, oz + a.z);
        var on = Math.sin(A.time * 3 + ox) > 0.2;
        if (on) glow(c, p[0], p[1], 1.6 * Z + 4, "#FF3344", 0.5 + night * 0.4);
      } else if (a.t === "siren") {
        p = W2S(ox + a.x, a.y, oz + a.z);
        var ph = Math.sin(A.time * 10) > 0;
        glow(c, p[0] - 0.4 * Z, p[1], 2 * Z + 3, ph ? "#3B82F6" : "#FF3344", 0.6 + night * 0.3);
      } else if (a.t === "show") {
        p = W2S(ox + a.x, a.y, oz + a.z);
        glow(c, p[0], p[1], 1.2 * Z + 3, a.col, 0.45 + night * 0.4);
        if (night > 0.3) {
          var sw = Math.sin(A.time * 0.9 + a.x * 1.7) * 0.5, L2 = 60 * Z, wd2 = 2.4 * Z;
          var tx = p[0] + Math.sin(sw) * L2, ty = p[1] - Math.cos(sw) * L2;
          var gb = c.createLinearGradient(p[0], p[1], tx, ty);
          gb.addColorStop(0, rgba(a.col, 0.45 * night));
          gb.addColorStop(1, rgba(a.col, 0));
          c.fillStyle = gb;
          c.beginPath();
          c.moveTo(p[0] - 0.3 * Z, p[1]);
          c.lineTo(tx - wd2, ty);
          c.lineTo(tx + wd2, ty);
          c.lineTo(p[0] + 0.3 * Z, p[1]);
          c.closePath();
          c.fill();
        }
      } else if (a.t === "rec") {
        p = W2S(ox + a.x, a.y, oz + a.z);
        if (Math.sin(A.time * 5) > 0) glow(c, p[0], p[1], 0.9 * Z + 3, "#FF3355", 0.9);
      } else if (a.t === "fire") {
        p = W2S(ox + a.x, a.y, oz + a.z);
        var fl = 0.85 + Math.sin(A.time * 17) * 0.1 + Math.sin(A.time * 31) * 0.06;
        glow(c, p[0], p[1], 6 * Z * fl + 4, "#FF9A3C", 0.35 + night * 0.4);
      } else if (a.t === "glow" && night > 0.3) {
        p = W2S(ox + a.x, a.y, oz + a.z);
        glow(c, p[0], p[1], 3 * Z + 3, a.col, 0.5 * night);
      } else if (a.t === "bulbs" && night > 0.3) {
        for (var i = 0; i <= a.n; i += 2) {
          var u = i / a.n;
          p = W2S(ox + a.x0 + (a.x1 - a.x0) * u, a.y - Math.sin(u * Math.PI) * 0.7, oz + a.z0 + (a.z1 - a.z0) * u);
          glow(c, p[0], p[1], 1.2 * Z + 2, "#FFE9A8", 0.5 * night);
        }
      } else if (a.t === "heat" && night > 0.3) {
        var pulse = 0.8 + 0.2 * Math.sin(A.time * 1.5);
        topDo(0.5, function (cc) {
          cc.fillStyle = "rgba(124,255,155," + 0.06 * pulse * night + ")";
          cc.fillRect(-a.w / 2, -a.d / 2, a.w, a.d);
        });
      } else if (a.t === "arch" && night > 0.3) {
        for (var k = 2; k <= 30; k += 4) {
          var uu = k / 32;
          p = W2S(ox - a.span + uu * a.span * 2, Math.sin(uu * Math.PI) * a.h, oz + a.lean * Math.sin(uu * Math.PI));
          glow(c, p[0], p[1], 3 * Z + 3, "#E6E9FF", 0.35 * night);
        }
      }
    });
    c.restore();
    if (statics) return;
    // kamp ateşi alevi (her temada)
    eachAnchor(function (a, ox, oz) {
      if (a.t !== "fire") return;
      var p = W2S(ox + a.x, a.y - 0.4, oz + a.z), s = cam.zoom;
      var f = 1 + Math.sin(A.time * 14) * 0.12;
      c.beginPath();
      c.moveTo(p[0] - 0.8 * s, p[1]);
      c.quadraticCurveTo(p[0] - 0.9 * s, p[1] - 1.2 * s * f, p[0], p[1] - 2.2 * s * f);
      c.quadraticCurveTo(p[0] + 0.9 * s, p[1] - 1.2 * s * f, p[0] + 0.8 * s, p[1]);
      c.closePath();
      c.fillStyle = "#FF8A1F";
      c.fill();
      c.lineWidth = Math.max(1, s * 0.15);
      c.strokeStyle = NAVY;
      c.stroke();
      c.beginPath();
      c.moveTo(p[0] - 0.4 * s, p[1]);
      c.quadraticCurveTo(p[0], p[1] - 1.4 * s * f, p[0] + 0.4 * s, p[1]);
      c.closePath();
      c.fillStyle = "#FFE066";
      c.fill();
    });
  }
  function emitAnchors(dt) {
    if (A.reduceMotion) return;
    eachAnchor(function (a, ox, oz) {
      if (a.t === "steam" && Math.random() < dt * 2.5) addSteam(ox + a.x, a.y, oz + a.z);
      else if (a.t === "fountain" && Math.random() < dt * 16) addDrop(ox + a.x + A.rand(-0.2, 0.2), a.y, oz + a.z);
      else if (a.t === "fire" && Math.random() < dt * 5) addEmber(ox + a.x, a.y + 1, oz + a.z);
    });
  }

  /* ═══════════════════════ etiketler ═══════════════════════ */

  var labelRects = [];
  function labelAnchor(k) {
    var p = PLOTS[k], lv = lvOf(k);
    if (V2) {
      var m2 = metaFor(k, lv), g2 = W2S(p.x, 0, p.z);
      return [g2[0], g2[1] + (m2 ? Math.max(m2.v0, isStad(k) ? -40 : -60) : -14) * cam.zoom - 4];
    }
    if (k === "saha") {
      var P = pitchSize();
      var s0 = W2S(-P.w * 0.1, 0.5, P.d / 2 + 1.5);
      return [s0[0], s0[1]];
    }
    var m = metaFor(k, lv);
    var g = W2S(p.x, 0, p.z);
    if (k === "tribun") {
      var Pt = pitchSize();
      var top = m ? m.v0 : -12;
      var gb = W2S(Pt.w * 0.15, 0, -Pt.d / 2 - 3);
      return [gb[0], Math.min(gb[1], g[1] + top * cam.zoom) - 4];
    }
    var v0 = m ? m.v0 : -14;
    return [g[0], g[1] + v0 * cam.zoom - 4];
  }
  function drawLabels(c) {
    labelRects = [];
    if (V2 && place2) return;
    var Z = cam.zoom;
    var zk = A.clamp((Z - homeZoom) / Math.max(0.01, focusZoom("kantin") - homeZoom), 0, 1);
    var fs = 9.5 + zk * 2.5;
    c.save();
    c.textAlign = "center";
    c.textBaseline = "middle";
    // v2 genel görünüm: etiket arsanın ön yarısında (komşu arsalarla çakışmaz, kendi binasının üstünde kalır)
    var mid = V2 && zk < 0.5;
    var items = ORDER.map(function (k) {
      var a = labelAnchor(k);
      if (mid) {
        // arsanın ön yarısı: bina (genelde arkada) görünür kalır
        var pp = PARTS2[k] ? PARTS2[k][0] : { x: 0, z: 0 }, fo = k === "stadyum" ? 16 : 13, gc = W2S(pp.x + fo, 0, pp.z + fo);
        a = [gc[0], gc[1] + (fs + 10) / 2];
      }
      var name = TITLES[k];
      c.font = A.font(fs, 800);
      var tw = c.measureText(name).width;
      var mk = marks[k] || (V2 && closedOf(k) ? "closed" : null);
      var h = fs + 10, w = tw + h + 12 + (mk ? h * 0.55 : 0);
      if (focusKey === k) {
        w *= 1.08;
      }
      return { k: k, ax: a[0], ay: a[1], w: w, h: h, tw: tw, x: a[0] - w / 2, y: a[1] - h, mk: mk };
    });
    // v2: kilitli binaların etiketi genel görünümde gizli (yakınlaşınca ya da odakta görünür)
    if (V2)
      items = items.filter(function (it) {
        return !(it.mk === "closed" && zk < 0.3 && focusKey !== it.k);
      });
    items.sort(function (a, b) {
      return b.ay - a.ay;
    });
    var placed = [];
    if (V2) {
      declutter(items, placed, fs);
      items = [];
    }
    items.forEach(function (it) {
      for (var pass = 0; pass < 6; pass++) {
        var hit = null;
        for (var j = 0; j < placed.length; j++) {
          var o = placed[j];
          if (it.x < o.x + o.w + 2 && it.x + it.w + 2 > o.x && it.y < o.y + o.h + 2 && it.y + it.h + 2 > o.y) {
            hit = o;
            break;
          }
        }
        if (!hit) break;
        it.y = hit.y - it.h - 3;
      }
      placed.push(it);
    });
    // uzaktakiler önce (öndekiler üstte kalsın)
    placed.sort(function (a, b) {
      return a.ay - b.ay;
    });
    placed.forEach(function (it) {
      if (V2 && it.x > -it.w && it.x < W) it.x = A.clamp(it.x, 4, Math.max(4, W - it.w - 4));
      if (it.x > W + 10 || it.x + it.w < -10 || it.y > H + 10 || it.y + it.h < -10) return;
      drawPill(c, it, fs);
      labelRects.push(it);
    });
    c.restore();
  }
  /**
   * v2 etiket yerleşimi: her etiket kendi çapasına en yakın boş yeri arar
   * (yerinde, yukarı/aşağı kaydırılmış, hafif yana); bulamazsa yalnız rozetli
   * kısa hap olur (adı yakınlaşınca/odakta görünür). Hiçbir hap çakışmaz.
   */
  function declutter(items, placed, fs) {
    var free = function (x, y, w, h) {
      if (x < 2 || x + w > W - 2) return false;
      for (var j = 0; j < placed.length; j++) {
        var o = placed[j];
        if (x < o.x + o.w + 3 && x + w + 3 > o.x && y < o.y + o.h + 3 && y + h + 3 > o.y) return false;
      }
      return true;
    };
    var tryPlace = function (it) {
      var st = it.h + 3, x0 = A.clamp(it.x, 4, Math.max(4, W - it.w - 4));
      var dys = [0, -st, st, -2 * st, 2 * st, -3 * st];
      var dxs = [0, -it.w * 0.35, it.w * 0.35];
      for (var a = 0; a < dys.length; a++)
        for (var b = 0; b < dxs.length; b++) {
          var x = x0 + dxs[b], y = it.y + dys[a];
          if (free(x, y, it.w, it.h)) {
            it.x = x;
            it.y = y;
            return true;
          }
        }
      return false;
    };
    items.forEach(function (it) {
      if (focusKey === it.k || !tryPlace(it)) {
        if (focusKey !== it.k) {
          // kısa hap: yalnız aşama dairesi (+ rozet)
          var cx = it.x + it.w / 2;
          it.compact = true;
          it.w = it.h + (it.mk ? it.h * 0.55 : 0) + 2;
          it.x = cx - it.w / 2;
          if (!tryPlace(it)) return;
        }
      }
      placed.push(it);
    });
  }
  var pillCache = {}, pillCount = 0;
  function drawPill(c, it, fs) {
    var k = it.k, mk = it.mk;
    var bob = mk === "up" && !A.reduceMotion ? Math.sin(A.time * 4 + it.ax * 0.05) * 1.6 : 0;
    var y = it.y + bob;
    if (it.ay - (y + it.h) > 5) {
      c.strokeStyle = "rgba(255,255,255,0.75)";
      c.lineWidth = 1.5;
      c.beginPath();
      c.moveTo(it.ax, y + it.h);
      c.lineTo(it.ax, it.ay);
      c.stroke();
      c.beginPath();
      c.arc(it.ax, it.ay, 2.2, 0, Math.PI * 2);
      c.fillStyle = "#FFFFFF";
      c.fill();
    }
    var key = [k, lvOf(k), mk || "", fs.toFixed(1), focusKey === k ? 1 : 0, kit.primary, it.compact ? 1 : 0].join("|");
    var pc = pillCache[key];
    if (!pc) {
      if (pillCount > 200) {
        pillCache = {};
        pillCount = 0;
      }
      pc = A.layer(it.w + 8, it.h + 8);
      var q = {};
      for (var kk in it) q[kk] = it[kk];
      q.x = 4;
      q.y = 3;
      q.ay = 0;
      paintPill(pc.ctx, q, fs);
      pillCache[key] = pc;
      pillCount++;
    }
    c.drawImage(pc.canvas, it.x - 4, y - 3, pc.w, pc.h);
    if (mk === "up") {
      var pr = (A.time * 1.2) % 1, br = it.h * 0.42;
      c.beginPath();
      c.arc(it.x + it.w - br, y + it.h / 2, br + pr * 6, 0, Math.PI * 2);
      c.strokeStyle = "rgba(34,197,94," + (1 - pr) * 0.7 + ")";
      c.lineWidth = 2;
      c.stroke();
    }
  }
  function paintPill(c, it, fs) {
    c.textAlign = "center";
    c.textBaseline = "middle";
    var k = it.k, lv = lvOf(k), mk = it.mk, focus = focusKey === k;
    var x = it.x, y = it.y, w = it.w, h = it.h;
    c.globalAlpha = mk === "lock" ? 0.82 : mk === "closed" ? 0.72 : 1;
    // gölge + hap
    A.roundRect(c, x, y + 2.5, w, h, h / 2);
    c.fillStyle = "rgba(10,8,40,0.35)";
    c.fill();
    A.roundRect(c, x, y, w, h, h / 2);
    c.fillStyle = "#1B1648";
    c.fill();
    c.lineWidth = focus ? 2.5 : 1.5;
    c.strokeStyle = focus ? "#FFD43B" : "rgba(255,255,255,0.28)";
    c.stroke();
    // seviye dairesi (kulüp rengi)
    var cr = h / 2 - 2.5, cx = x + h / 2, cy = y + h / 2;
    c.beginPath();
    c.arc(cx, cy, cr, 0, Math.PI * 2);
    c.fillStyle = lv > 0 || k === "saha" ? kit.primary : "#4A4F86";
    c.fill();
    c.lineWidth = 1.5;
    c.strokeStyle = "rgba(255,255,255,0.85)";
    c.stroke();
    c.font = A.font(fs * 0.95, 900);
    c.fillStyle = lv > 0 && (kit.primary === "#FFFFFF" || kit.primary === "#F8FAFC" || kit.primary === "#FACC15") ? NAVY : "#FFFFFF";
    c.fillText(String(lv), cx, cy + 0.5);
    c.font = A.font(fs, 800);
    c.fillStyle = "#FFFFFF";
    if (!it.compact) c.fillText(TITLES[k], x + h + 2 + it.tw / 2, cy + 0.5);
    c.globalAlpha = 1;
    // rozet
    if (mk) {
      var bx = x + w - h * 0.42, br = h * 0.42;
      c.beginPath();
      c.arc(bx, cy, br, 0, Math.PI * 2);
      c.fillStyle = mk === "up" ? "#22C55E" : mk === "max" ? "#FFD43B" : "#8A8FB8";
      c.fill();
      c.lineWidth = 1.6;
      c.strokeStyle = "#FFFFFF";
      c.stroke();
      c.strokeStyle = mk === "max" ? NAVY : "#FFFFFF";
      c.fillStyle = mk === "max" ? NAVY : "#FFFFFF";
      c.lineWidth = 2;
      c.lineCap = "round";
      c.lineJoin = "round";
      var u = br * 0.5;
      if (mk === "up") {
        c.beginPath();
        c.moveTo(bx, cy + u);
        c.lineTo(bx, cy - u);
        c.moveTo(bx - u * 0.8, cy - u * 0.15);
        c.lineTo(bx, cy - u);
        c.lineTo(bx + u * 0.8, cy - u * 0.15);
        c.stroke();
      } else if (mk === "max") {
        c.beginPath();
        for (var i = 0; i < 10; i++) {
          var rr = i % 2 ? u * 0.48 : u * 1.15, aa = (i * Math.PI) / 5 - Math.PI / 2;
          c.lineTo(bx + Math.cos(aa) * rr, cy + Math.sin(aa) * rr);
        }
        c.closePath();
        c.fill();
      } else {
        // asma kilit
        c.lineWidth = 1.6;
        c.beginPath();
        c.arc(bx, cy - u * 0.25, u * 0.55, Math.PI, 0);
        c.stroke();
        A.roundRect(c, bx - u * 0.8, cy - u * 0.25, u * 1.6, u * 1.25, 1.5);
        c.fill();
      }
    }
  }

  /* ═══════════════════════ komutlar ═══════════════════════ */

  function command(cmd) {
    if (cmd.type === "city2") applyCity2(cmd);
    else if (cmd.type === "build") playBuild(cmd.key);
    else if (cmd.type === "city" && !V2) {
      if (cmd.kit && cmd.kit.primary) kit = { primary: hex(cmd.kit.primary, "#5B3DF5"), secondary: hex(cmd.kit.secondary, "#FFFFFF") };
      if (cmd.marks && typeof cmd.marks === "object") marks = cmd.marks;
      if (cmd.tier) tierTitle = String(cmd.tier);
      if (cmd.levels && typeof cmd.levels === "object") applyLevels(cmd.levels, received);
      received = true;
      if (cmd.focus !== undefined) setFocus(cmd.focus);
    } else if (cmd.type === "focus") setFocus(cmd.key);
    else if (cmd.type === "theme") {
      themeOverride = cmd.theme || null;
    }
  }
  /** Yeni seviyeler: tek birim bir basamak yükselince inşaat oynar ve kamera uçar. */
  function applyLevels(next, animate) {
    var changed = [];
    ORDER.forEach(function (k) {
      var v = Math.max(0, Math.floor(Number(next[k]) || 0));
      if (v !== levels[k]) {
        changed.push({ key: k, from: levels[k], to: v });
        prevLevels[k] = levels[k];
        levels[k] = v;
      }
    });
    var single = changed.length === 1 && changed[0].to > changed[0].from;
    if (animate && single) {
      startConstruction(changed[0].key, changed[0].from, changed[0].to);
      setFocus(changed[0].key);
    }
  }
  function celebrate() {
    party = A.time;
    A.sound("cheer");
    A.haptic("success");
  }
  var party = -99;
  function stepParty(dt) {
    if (A.time - party > 4.5 || A.reduceMotion) return;
    if (Math.random() < dt * 3.2) {
      var x = A.rand(-90, 90), z = A.rand(-90, 90), y = A.rand(45, 70);
      var col = A.pick(["#FFD43B", "#FF4D6A", "#38BDF8", "#A78BFA", "#34D399", kit.primary]);
      for (var i = 0; i < 40; i++) addSpark(x, y, z, i % 4 ? col : "#FFFFFF", 16);
      A.sound("pop");
    }
  }

  /* ═══════════════════════ girdi ═══════════════════════ */

  function clampCam(g) {
    g.tx = A.clamp(g.tx, -EDGE, EDGE);
    g.tz = A.clamp(g.tz, -EDGE, EDGE);
  }
  function panBy(dx, dy) {
    var Z = cam.zoom;
    var du = -dx / Z, dv = -2 * dy / Z;
    var ddx = (du + dv) / 2, ddz = (dv - du) / 2;
    camGoal.tx += ddx;
    camGoal.tz += ddz;
    clampCam(camGoal);
    cam.tx = camGoal.tx;
    cam.tz = camGoal.tz;
  }
  function zoomAt(px, py, k) {
    var before = S2W(px, py, 0);
    var nz = A.clamp(cam.zoom * k, homeZoom * 0.75, ZMAX);
    cam.zoom = camGoal.zoom = nz;
    var after = S2W(px, py, 0);
    cam.tx += before.x - after.x;
    cam.tz += before.z - after.z;
    clampCam(cam);
    camGoal.tx = cam.tx;
    camGoal.tz = cam.tz;
  }
  function down(p) {
    drag = { x: p.x, y: p.y, sx: p.x, sy: p.y, moved: false };
  }
  function move(p) {
    if (!drag || pinch) return;
    var dx = p.x - drag.x, dy = p.y - drag.y;
    drag.x = p.x;
    drag.y = p.y;
    if (!drag.moved && Math.hypot(p.x - drag.sx, p.y - drag.sy) > 8) {
      drag.moved = true;
      dx = p.x - drag.sx;
      dy = p.y - drag.sy;
    }
    if (!drag.moved) return;
    panBy(dx, dy);
  }
  function up(p) {
    var d = drag;
    drag = null;
    if (!d || d.moved || pinch) return;
    var best = V2 ? hitTest2(p.x, p.y) : hitTest(p.x, p.y);
    if (best && best.slot) return tapSlot(best.slot);
    if (best) {
      A.sound("tap");
      A.haptic("light");
      setFocus(best);
      A.send("tap", { key: best });
    }
  }
  function hitTest(px, py) {
    for (var i = labelRects.length - 1; i >= 0; i--) {
      var r = labelRects[i];
      if (px >= r.x - 4 && px <= r.x + r.w + 4 && py >= r.y - 4 && py <= r.y + r.h + 4) return r.k;
    }
    var Z = cam.zoom, best = null, bd = -1e9;
    ORDER.forEach(function (k) {
      if (k === "tribun") return;
      var p = PLOTS[k], R = k === "saha" ? 25 : 21;
      var m = metaFor(k, lvOf(k));
      var Ht = m ? Math.max(3, (-m.v0 - R * 0.5) / HY) : 8;
      var u = (px - W / 2) / Z + (cam.tx - cam.tz) - (p.x - p.z);
      var vs = 2 * ((py - H * 0.5) / Z + (cam.tx + cam.tz) * 0.5 - cam.lift * HY - (p.x + p.z) * 0.5);
      var lim = 2 * R - Math.abs(u);
      if (lim < 0) return;
      var s0 = vs, s1 = vs + 2 * Ht * HY;
      if (s1 < -lim || s0 > lim) return;
      var dep = p.x + p.z;
      if (dep > bd) {
        bd = dep;
        best = k;
      }
    });
    if (best === "saha") {
      var g = S2W(px, py, 0), P = pitchSize();
      if (!(Math.abs(g.x) <= P.w / 2 + 1 && Math.abs(g.z) <= P.d / 2 + 1)) best = "tribun";
    }
    return best;
  }
  /** v2: yuvalar (yerleştirme / yerleşik yapı), etiketler, bina parçaları. */
  function hitTest2(px, py) {
    if (place2 || lms.length) {
      var q = hitSlot(px, py);
      if (q && (place2 || lmAt(q.id))) return { slot: q };
    }
    for (var i = labelRects.length - 1; i >= 0; i--) {
      var r = labelRects[i];
      if (px >= r.x - 4 && px <= r.x + r.w + 4 && py >= r.y - 4 && py <= r.y + r.h + 4) return r.k;
    }
    var Z = cam.zoom, best = null, bd = -1e9;
    KEYS2.forEach(function (k) {
      var parts = k === "stadyum" ? [{ x: 0, z: 0 }] : PARTS2[k];
      parts.forEach(function (part) {
        var R = k === "stadyum" ? 25 : 21;
        var m = k === "stadyum" ? metaFor(k) : partMeta(k, part, lvOf(k));
        var Ht = m ? Math.max(3, (-m.v0 - R * 0.5) / HY) : 8;
        var u = (px - W / 2) / Z + (cam.tx - cam.tz) - (part.x - part.z);
        var vs = 2 * ((py - H * 0.5) / Z + (cam.tx + cam.tz) * 0.5 - cam.lift * HY - (part.x + part.z) * 0.5);
        var lim = 2 * R - Math.abs(u);
        if (lim < 0) return;
        if (vs + 2 * Ht * HY < -lim || vs > lim) return;
        var dep = part.x + part.z;
        if (dep > bd) {
          bd = dep;
          best = k;
        }
      });
    });
    return best;
  }
  function tapSlot(q) {
    var l = lmAt(q.id);
    if (place2 && !l) {
      if (q.r >= grid2.open) {
        A.haptic("light");
        return;
      }
      ghost2 = q.id;
      A.sound("tap");
      A.haptic("light");
      A.send("slot", { slot: q.id, id: null });
      return;
    }
    if (l) {
      A.sound("tap");
      A.haptic("light");
      A.send("slot", { slot: q.id, id: l.id });
    }
  }
  // iki parmak (yakınlaştır) ve tekerlek: çekirdek tek işaretçi izler, burada dokunuşlar ayrıca okunur
  (function () {
    var cv = document.getElementById("c");
    if (!cv || !cv.addEventListener) return;
    var dist = function (t) {
      return Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    };
    var mid = function (t) {
      var r = cv.getBoundingClientRect ? cv.getBoundingClientRect() : { left: 0, top: 0 };
      return { x: (t[0].clientX + t[1].clientX) / 2 - r.left, y: (t[0].clientY + t[1].clientY) / 2 - r.top };
    };
    try {
      cv.addEventListener("touchstart", function (e) {
        if (e.touches && e.touches.length >= 2) {
          pinch = { d: dist(e.touches), m: mid(e.touches) };
          drag = null;
        }
      }, { passive: true });
      cv.addEventListener("touchmove", function (e) {
        if (!pinch || !e.touches || e.touches.length < 2) return;
        var d = dist(e.touches), m = mid(e.touches);
        zoomAt(m.x, m.y, d / pinch.d);
        panBy(m.x - pinch.m.x, m.y - pinch.m.y);
        pinch.d = d;
        pinch.m = m;
      }, { passive: true });
      var end = function (e) {
        if (pinch && (!e.touches || e.touches.length < 2)) pinch = null;
      };
      cv.addEventListener("touchend", end, { passive: true });
      cv.addEventListener("touchcancel", end, { passive: true });
      cv.addEventListener("wheel", function (e) {
        var r = cv.getBoundingClientRect();
        zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015));
      }, { passive: true });
    } catch (err) {
      /* dokunma yoksa sorun değil */
    }
  })();

  /* ═══════════════════════ giriş ═══════════════════════ */

  var baseLayer = null;
  function paintBase() {
    var key = [cam.tx.toFixed(3), cam.tz.toFixed(3), cam.zoom.toFixed(4), cam.lift.toFixed(3), TH.key, W, H, spriteVer].join(",");
    if (baseLayer && baseLayer.key === key) return baseLayer;
    if (!baseLayer || baseLayer.w !== W || baseLayer.h !== H) baseLayer = A.layer(W, H);
    baseLayer.key = key;
    var c = baseLayer.ctx;
    var bg = paintBackdrop();
    var px = A.clamp(-(cam.tx - cam.tz) * 0.08, -bg.pad, bg.pad), py = A.clamp(-(cam.tx + cam.tz) * 0.04, -bg.pad, bg.pad);
    c.drawImage(bg.canvas, -bg.pad + px, -bg.pad + py, bg.w, bg.h);
    G.c = c;
    G.P = W2S;
    G.s = cam.zoom;
    G.lw = A.clamp(0.3 * cam.zoom, 0.9, 3.4);
    drawGround(c);
    // sokak lambaları zemin katmanında (her karede çizilmez)
    LAMPS.forEach(function (l) {
      drawLamp(l.x, l.z);
    });
    return baseLayer;
  }
  var themeCheck = 0;
  function resize(w, h) {
    var first = !W;
    W = w;
    H = h;
    computeHome();
    bgLayer = null;
    if (first) {
      cam.zoom = camGoal.zoom = homeZoom;
    }
    if (focusKey) camGoal.zoom = focusZoom(focusKey);
    else camGoal.zoom = homeZoom;
  }
  function start() {}
  function update(dt) {
    // kamera: yumuşak uçuş (yakınlık log uzayında)
    var k = 1 - Math.exp(-3.4 * dt);
    cam.tx += (camGoal.tx - cam.tx) * k;
    cam.tz += (camGoal.tz - cam.tz) * k;
    cam.lift += (camGoal.lift - cam.lift) * k;
    cam.zoom = Math.exp(Math.log(cam.zoom) + (Math.log(camGoal.zoom) - Math.log(cam.zoom)) * k);
    // hedefe çok yaklaşınca otur (zemin katmanı yeniden çizilmesin)
    if (Math.abs(cam.tx - camGoal.tx) < 0.02 && Math.abs(cam.tz - camGoal.tz) < 0.02 && Math.abs(cam.zoom / camGoal.zoom - 1) < 0.002 && Math.abs(cam.lift - camGoal.lift) < 0.02) {
      cam.tx = camGoal.tx;
      cam.tz = camGoal.tz;
      cam.zoom = camGoal.zoom;
      cam.lift = camGoal.lift;
    }
    if (focusKey && !isStad(focusKey) && focusKey !== "landmarks") camGoal.lift = focusLift(focusKey);
    stepMatch(dt);
    stepKicks(dt);
    stepTraffic(dt);
    stepConstruction(dt);
    stepParty(dt);
    emitAnchors(dt);
    stepWP(dt);
  }
  function render(c, dt) {
    frameNo++;
    buildBudget = 2;
    themeCheck -= dt;
    if (themeCheck <= 0) {
      themeCheck = 2;
      var th = themeNow();
      if (th !== TH.key) {
        TH = THEMES[th];
        bgLayer = null;
      }
    }
    if (frameNo % 30 === 0) sweepSprites();
    if (!W || !H) return;
    // fon + zemin: tek ekran katmanı; yalnız kamera oynayınca yeniden çizilir
    var gl = paintBase();
    c.drawImage(gl.canvas, 0, 0, W, H);
    G.c = c;
    G.P = W2S;
    G.s = cam.zoom;
    G.lw = A.clamp(0.3 * cam.zoom, 0.9, 3.4);
    if (V2) {
      drawPlaza(c);
      drawSlotsOverlay(c);
    }
    drawFocusRing(c);
    drawWorld(c);
    if (TH.night > 0.3) {
      var ll = paintLights();
      c.save();
      c.globalCompositeOperation = "lighter";
      c.drawImage(ll.canvas, 0, 0, W, H);
      c.restore();
    }
    drawLights(c, false);
    drawWP(c);
    if (TH.key === "sunset") {
      c.fillStyle = "rgba(255,120,80,0.08)";
      c.fillRect(0, 0, W, H);
    }
    drawLabels(c);
    A.drawParticles(c);
    A.drawFloaters(c, dt);
  }

  var api = {
    resize: resize,
    start: start,
    update: update,
    render: render,
    down: down,
    move: move,
    up: up,
    command: function (cmd) {
      if (cmd.type === "celebrate") celebrate();
      else command(cmd);
    },
    debug: function () {
      return {
        levels: levels,
        gl: true,
        cam: cam,
        focus: camGoal,
        construct: con && con.key,
        match: match && match.players.length,
        theme: TH.key,
        sprites: Object.keys(sprites).length,
        spritePx: Object.keys(sprites).reduce(function (s, k) { return s + sprites[k].w * sprites[k].h; }, 0),
        setTheme: function (t) {
          themeOverride = t;
          themeCheck = 0;
        },
        hit: function (x, y) {
          return V2 ? hitTest2(x, y) : hitTest(x, y);
        },
        project: W2S,
        /** Önizleme: bir yapının sprite tuvali (k birim, lv basamak, s ölçek). */
        spriteOf: function (k, lv, s, part) {
          return makeSprite("dbg:" + k + ":" + lv + (part || ""), s || 3, function () {
            if (k.indexOf("lm:") === 0) return lmBuildFor(k.slice(3), "sus")();
            if (k === "stadyum")
              return (function () {
                var m = STAD_MAP[lv];
                SVF = svFlags(lv);
                try {
                  buildSahaG(m[0], m[1]);
                  buildTribun(m[1], m[0], "B");
                  buildSahaI(m[0], m[1]);
                  buildTribun(m[1], m[0], "F");
                } finally {
                  SVF = null;
                }
              })();
            if (BUILD2[k] && (V2 || !BUILD[k])) {
              if (lv === 0 && k !== "halisaha") return part === "c" ? closedPlot(OPENS2[k]) : emptyPlot();
              return BUILD2[k](lv, part);
            }
            BUILD[k](lv);
          }).cv;
        },
        labels: function () {
          return labelRects.map(function (r) {
            return { k: r.k, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h), compact: !!r.compact };
          });
        },
        slotScreen: function (id) {
          var q = parseSlot(id), p = slotPos(q.r, q.c);
          return W2S(p.x, 0, p.z);
        },
        v2: function () {
          return { ver: spriteVer, base: baseLayer && baseLayer.key, on: V2, st: st2, rung: rung2, grid: grid2, place: place2, ghost: ghost2, landmarks: lms.length, kicks: kicks.map(function (k) { return [k.ox, k.oz, k.m.players.length, k.m.players[0] && Math.round(k.m.players[0].x)]; }) };
        },
      };
    },
  };
  A.register(api);
})();
