/*
 * ARENA 3B KİTİ — three.js oyunlarının (Penaltı, Slalom, Sektir) ortak parçaları.
 *
 *   std / mesh / canvasTex / glowTexture   malzeme, ağ, tuval dokusu, parlama
 *   makeAthlete                            iskeletli, derili 3B futbolcu
 *   rest / runCycle / play                 poz sıfırlama, koşu, hazır animasyon
 *   syncAll                                her karede, çizimden hemen önce
 *   disposeTree                            sahneden çıkan nesnenin belleği
 *
 * FUTBOLCU: gerçek insan modeli (Quaternius Universal Base Characters, CC0) ve
 * hareket yakalama tabanlı animasyonlar (Universal Animation Library, CC0) —
 * veri `athlete-data.js` içinde gömülü. Forma, şort, tozluk ve krampon kulübün
 * renkleriyle cildin üstüne boyanır; sırta OYUNCUNUN ADI SOYADI ve numarası,
 * göğse numara ve kulüp arması doğrudan dokuya yazılır (kumaşla birlikte
 * kıvrılır, ayrı bir levha değildir).
 *
 * POZ KATMANLARI: taban, bir animasyon klibidir (bekleme, koşu, depar…).
 * Oyunlar bunun üstüne `a.J` eklemlerini (hips, spine, neck, head, sha/shb,
 * ela/elb, hpa/hpb, kna/knb, fta/ftb) Euler açılarıyla döndürür: vuruş, kaleci
 * uçuşu, sektirme gibi oyuna özel hareketler. Açılar modelin kendi ekseninde
 * (+z ileri, +y yukarı; "a" +x/sol, "b" −x/sağ taraf) ve EBEVEYNE GÖRE yorumlanır;
 * gerçek iskelete her karede `syncAll` aktarır.
 *
 * Yalnız WebGL açılınca kullanılır: oyun init(renderer) çağırır. three.js
 * yoksa (başsız testler) kit tanımlanır ama hiçbir şey çizmez.
 */
(function () {
  "use strict";
  var A = window.Arena;
  var T = window.THREE || (typeof THREE !== "undefined" ? THREE : null); // eslint-disable-line no-undef
  var D = window.ATHLETE_DATA || null;
  var maxAniso = 1;

  function init(renderer) {
    maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    preload();
  }
  function kitOf(person) {
    var k = person && person.team && person.team.kit ? person.team.kit : {};
    return { primary: k.primary || "#5B3DF5", secondary: k.secondary || "#FFFFFF" };
  }

  function std(color, rough, metal, extra) {
    var m = new T.MeshStandardMaterial({ color: color, roughness: rough == null ? 0.7 : rough, metalness: metal || 0 });
    if (extra) for (var k in extra) m[k] = extra[k];
    return m;
  }
  function mesh(geo, mat, cast, receive) {
    var m = new T.Mesh(geo, mat);
    m.castShadow = cast !== false;
    m.receiveShadow = !!receive;
    return m;
  }
  function canvasTex(w, h, draw, repeat) {
    var cv = document.createElement("canvas");
    cv.width = w;
    cv.height = h;
    var c = cv.getContext("2d");
    draw(c, w, h);
    var tex = new T.CanvasTexture(cv);
    tex.colorSpace = T.SRGBColorSpace;
    tex.anisotropy = maxAniso;
    if (repeat) tex.wrapS = tex.wrapT = T.RepeatWrapping;
    tex.userData = { canvas: cv, ctx: c };
    return tex;
  }
  var glowTex = null;
  function glowTexture() {
    if (glowTex) return glowTex;
    glowTex = canvasTex(128, 128, function (c) {
      var g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
      g.addColorStop(0, "rgba(255,250,235,1)");
      g.addColorStop(0.15, "rgba(255,245,220,0.7)");
      g.addColorStop(0.45, "rgba(255,240,210,0.15)");
      g.addColorStop(1, "rgba(255,240,210,0)");
      c.fillStyle = g;
      c.fillRect(0, 0, 128, 128);
    });
    return glowTex;
  }

  function hashId(id) {
    var h = 2166136261;
    var s = String(id);
    for (var i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return h >>> 0;
  }
  function lumOf(hex) {
    var c = new T.Color(hex);
    return 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
  }
  function inkOn(kit) {
    return Math.abs(lumOf(kit.primary) - lumOf(kit.secondary)) > 0.3 ? kit.secondary : lumOf(kit.primary) > 0.55 ? "#0B1020" : "#FFFFFF";
  }
  function upperTR(s) {
    s = String(s || "");
    try {
      return s.toLocaleUpperCase("tr-TR");
    } catch (e) {
      return s.toUpperCase();
    }
  }

  /* ─────────────── gömülü model verisi ─────────────── */

  function b64bytes(s) {
    var bin = atob(s);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function view(Arr, s) {
    var u8 = b64bytes(s);
    return new Arr(u8.buffer, 0, u8.byteLength / Arr.BYTES_PER_ELEMENT);
  }

  var shared = null; // çözülmüş geometri/iskelet/klipler — bütün sporcular paylaşır
  function decodePart(p) {
    var q = view(Uint16Array, p.pos);
    var pos = new Float32Array(q.length);
    for (var i = 0; i < q.length; i++) {
      var k = i % 3;
      pos[i] = p.min[k] + (q[i] / 65535) * (p.max[k] - p.min[k]);
    }
    var n8 = view(Int8Array, p.nrm);
    var nrm = new Float32Array(n8.length);
    for (i = 0; i < n8.length; i++) nrm[i] = n8[i] / 127;
    var uv = null;
    if (p.uv) {
      var u16 = view(Uint16Array, p.uv);
      uv = new Float32Array(u16.length);
      for (i = 0; i < u16.length; i++) uv[i] = u16[i] / 65535;
    }
    return { n: p.n, pos: pos, nrm: nrm, uv: uv, j: view(Uint8Array, p.j), w: view(Uint8Array, p.w), idx: view(Uint16Array, p.idx) };
  }
  function toGeometry(d) {
    var g = new T.BufferGeometry();
    g.setAttribute("position", new T.BufferAttribute(d.pos, 3));
    g.setAttribute("normal", new T.BufferAttribute(d.nrm, 3));
    if (d.uv) g.setAttribute("uv", new T.BufferAttribute(d.uv, 2));
    g.setAttribute("skinIndex", new T.BufferAttribute(d.j, 4));
    g.setAttribute("skinWeight", new T.BufferAttribute(d.w, 4, true));
    g.setIndex(new T.BufferAttribute(d.idx, 1));
    g.userData.shared = true;
    return g;
  }

  /**
   * Kumaş: forma/şort/tozluk/krampon bölgelerindeki köşeler birkaç tur
   * yumuşatılır (kas çizgileri kumaşın altında kaybolur, ayak parmakları
   * krampona döner) ve hafifçe şişirilir; normaller yeniden hesaplanır. Dikiş
   * kopyaları konumdan kaynaklanır, böylece yırtık oluşmaz.
   */
  function clothe(body, regionAt) {
    var n = body.n, pos = body.pos, nrm = body.nrm, uv = body.uv, idx = body.idx;
    var keyOf = {}, weld = new Int32Array(n), pts = [];
    for (var v = 0; v < n; v++) {
      var key = Math.round(pos[v * 3] * 2e4) + "," + Math.round(pos[v * 3 + 1] * 2e4) + "," + Math.round(pos[v * 3 + 2] * 2e4);
      if (keyOf[key] == null) {
        keyOf[key] = pts.length;
        pts.push(v);
      }
      weld[v] = keyOf[key];
    }
    var P = pts.length;
    var cloth = new Uint8Array(P), skinny = new Uint8Array(P), boot = new Uint8Array(P);
    for (v = 0; v < n; v++) {
      var r = regionAt(uv[v * 2], uv[v * 2 + 1]);
      var isCloth = r !== D.reg.skin && r !== D.reg.forearm && r !== D.reg.hand;
      if (isCloth) cloth[weld[v]] = 1;
      else skinny[weld[v]] = 1;
      if (r === D.reg.boots) boot[weld[v]] = 1;
    }
    var nb = [];
    for (var p = 0; p < P; p++) nb.push([]);
    function link(a, b) {
      if (nb[a].indexOf(b) < 0) nb[a].push(b);
    }
    for (var t = 0; t < idx.length; t += 3) {
      var a = weld[idx[t]], b = weld[idx[t + 1]], c = weld[idx[t + 2]];
      link(a, b), link(b, a), link(b, c), link(c, b), link(a, c), link(c, a);
    }
    var X = new Float32Array(P * 3);
    for (p = 0; p < P; p++) for (var k = 0; k < 3; k++) X[p * 3 + k] = pos[pts[p] * 3 + k];
    var pinned = new Uint8Array(P);
    for (p = 0; p < P; p++) {
      if (!cloth[p] || skinny[p]) pinned[p] = 1;
      for (var m = 0; m < nb[p].length && !pinned[p]; m++) if (!cloth[nb[p][m]]) pinned[p] = 1;
    }
    for (var it = 0; it < 6; it++) {
      var Y = X.slice();
      for (p = 0; p < P; p++) {
        if (pinned[p] || !nb[p].length) continue;
        var lam = boot[p] ? 0.6 : 0.45;
        for (k = 0; k < 3; k++) {
          var s = 0;
          for (m = 0; m < nb[p].length; m++) s += X[nb[p][m] * 3 + k];
          Y[p * 3 + k] = X[p * 3 + k] + lam * (s / nb[p].length - X[p * 3 + k]);
        }
      }
      X = Y;
    }
    // kaynaklanmış yüzey normalleri
    var N = new Float32Array(P * 3);
    for (t = 0; t < idx.length; t += 3) {
      a = weld[idx[t]], b = weld[idx[t + 1]], c = weld[idx[t + 2]];
      var e1x = X[b * 3] - X[a * 3], e1y = X[b * 3 + 1] - X[a * 3 + 1], e1z = X[b * 3 + 2] - X[a * 3 + 2];
      var e2x = X[c * 3] - X[a * 3], e2y = X[c * 3 + 1] - X[a * 3 + 1], e2z = X[c * 3 + 2] - X[a * 3 + 2];
      var fx = e1y * e2z - e1z * e2y, fy = e1z * e2x - e1x * e2z, fz = e1x * e2y - e1y * e2x;
      [a, b, c].forEach(function (q) {
        N[q * 3] += fx;
        N[q * 3 + 1] += fy;
        N[q * 3 + 2] += fz;
      });
    }
    for (p = 0; p < P; p++) {
      var l = Math.hypot(N[p * 3], N[p * 3 + 1], N[p * 3 + 2]) || 1;
      N[p * 3] /= l, N[p * 3 + 1] /= l, N[p * 3 + 2] /= l;
    }
    for (v = 0; v < n; v++) {
      p = weld[v];
      if (!cloth[p]) continue;
      var puff = pinned[p] ? 0.002 : boot[p] ? 0.006 : 0.009;
      for (k = 0; k < 3; k++) {
        pos[v * 3 + k] = X[p * 3 + k] + N[p * 3 + k] * puff;
        nrm[v * 3 + k] = N[p * 3 + k];
      }
    }
  }

  function decodeClip(c) {
    var q = view(Int16Array, c.q);
    var f = new Float32Array(q.length);
    for (var i = 0; i < q.length; i++) f[i] = q[i] / 32767;
    var p16 = view(Int16Array, c.p);
    var pel = new Float32Array(p16.length);
    for (i = 0; i < p16.length; i++) pel[i] = p16[i] / 10000;
    return { d: c.d, frames: c.f, bones: c.b, q: f, pel: pel, hasPel: pel.some(function (v) { return v !== 0; }) };
  }

  /* ─────────────── dokular ─────────────── */

  var img = null; // { skin, eye, hair, mask } HTMLImageElement
  var ready = false;
  var waiting = []; // dokusu boyanmayı bekleyen sporcular
  function preload() {
    if (img || !D || typeof Image === "undefined") return;
    img = {};
    var names = ["skin", "eye", "hair", "mask"];
    var left = names.length;
    names.forEach(function (k) {
      var im = new Image();
      im.onload = im.onerror = function () {
        left -= 1;
        if (left === 0) {
          ready = true;
          var list = waiting;
          waiting = [];
          list.forEach(function (fn) {
            fn();
          });
        }
      };
      im.src = D.tex[k];
      img[k] = im;
    });
  }
  function whenReady(fn) {
    if (ready) fn();
    else waiting.push(fn);
  }

  var bySize = {}; // boyuta göre önbellek: taban cilt pikselleri, bölge haritası, gövde konum haritası
  function layers(S) {
    if (bySize[S]) return bySize[S];
    var cv = document.createElement("canvas");
    cv.width = cv.height = S;
    var c = cv.getContext("2d", { willReadFrequently: true });
    c.drawImage(img.skin, 0, 0, S, S);
    var skin = c.getImageData(0, 0, S, S).data;
    c.imageSmoothingEnabled = false;
    c.clearRect(0, 0, S, S);
    c.drawImage(img.mask, 0, 0, S, S);
    var md = c.getImageData(0, 0, S, S).data;
    var reg = new Uint8Array(S * S);
    for (var i = 0; i < reg.length; i++) reg[i] = md[i * 4];
    // gövde konum haritası: forma bölgesindeki her pikselin T-pozdaki (x, y, z)
    // konumu — isim/numara bu düzlemde yazılıp dokuya taşınır (kıvrımla birlikte).
    var bx = new Float32Array(S * S).fill(NaN), by = new Float32Array(S * S), bz = new Float32Array(S * S);
    var b = shared.body, L = D.lines;
    for (var t = 0; t < b.idx.length; t += 3) {
      var v0 = b.idx[t], v1 = b.idx[t + 1], v2 = b.idx[t + 2];
      var ys = [b.pos[v0 * 3 + 1], b.pos[v1 * 3 + 1], b.pos[v2 * 3 + 1]];
      var xs = [b.pos[v0 * 3], b.pos[v1 * 3], b.pos[v2 * 3]];
      if (Math.max.apply(null, ys) < L.waist - 0.02 || Math.min.apply(null, ys) > L.collar + 0.02) continue;
      if (Math.min.apply(null, xs.map(Math.abs)) > 0.24) continue;
      var U = [v0, v1, v2].map(function (v) {
        return [b.uv[v * 2] * S, b.uv[v * 2 + 1] * S];
      });
      var den = (U[1][1] - U[2][1]) * (U[0][0] - U[2][0]) + (U[2][0] - U[1][0]) * (U[0][1] - U[2][1]);
      if (Math.abs(den) < 1e-9) continue;
      var x0 = Math.max(0, Math.floor(Math.min(U[0][0], U[1][0], U[2][0]))), x1 = Math.min(S - 1, Math.ceil(Math.max(U[0][0], U[1][0], U[2][0])));
      var y0 = Math.max(0, Math.floor(Math.min(U[0][1], U[1][1], U[2][1]))), y1 = Math.min(S - 1, Math.ceil(Math.max(U[0][1], U[1][1], U[2][1])));
      for (var py = y0; py <= y1; py++)
        for (var px = x0; px <= x1; px++) {
          var sx = px + 0.5, sy = py + 0.5;
          var l1 = ((U[1][1] - U[2][1]) * (sx - U[2][0]) + (U[2][0] - U[1][0]) * (sy - U[2][1])) / den;
          var l2 = ((U[2][1] - U[0][1]) * (sx - U[2][0]) + (U[0][0] - U[2][0]) * (sy - U[2][1])) / den;
          var l3 = 1 - l1 - l2;
          if (l1 < -0.01 || l2 < -0.01 || l3 < -0.01) continue;
          var o = py * S + px;
          bx[o] = l1 * xs[0] + l2 * xs[1] + l3 * xs[2];
          by[o] = l1 * ys[0] + l2 * ys[1] + l3 * ys[2];
          bz[o] = l1 * b.pos[v0 * 3 + 2] + l2 * b.pos[v1 * 3 + 2] + l3 * b.pos[v2 * 3 + 2];
        }
    }
    // kumaş gölgesi için cildin ortalama parlaklığı (forma bölgesinde)
    var sum = 0, cnt = 0;
    for (i = 0; i < reg.length; i += 7)
      if (reg[i] === D.reg.shirt) {
        sum += skin[i * 4] * 0.3 + skin[i * 4 + 1] * 0.59 + skin[i * 4 + 2] * 0.11;
        cnt++;
      }
    bySize[S] = { skin: skin, reg: reg, bx: bx, by: by, bz: bz, mean: cnt ? sum / cnt : 150 };
    return bySize[S];
  }

  var TONES = [
    [1.0, 1.0, 1.0],
    [0.95, 0.89, 0.83],
    [0.87, 0.76, 0.66],
    [0.76, 0.62, 0.52],
    [0.64, 0.5, 0.41],
  ];
  var HAIR = [0x17110d, 0x2a1b12, 0x3d2817, 0x0e0e0e, 0x5c3b22, 0x8a6a45];
  var BOOTS = ["#0B1020", "#F8FAFC", "#0B1020", "#E11D48", "#F97316", "#0B1020", "#FACC15"];

  function hexToRgb(hex) {
    var h = String(hex).replace("#", "");
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var v = parseInt(h, 16) || 0;
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  }

  /**
   * Sırt yazısı: AD SOYAD tek satıra sığarsa tek satır; sığmazsa ad üstte
   * küçük, soyad altta büyük. Altında numara. Metre ölçekli düzlem (ppm piksel/m).
   */
  function backPrint(person, kit, ppm) {
    var W = 0.4, H = D.lines.collar - D.lines.waist;
    var cv = document.createElement("canvas");
    cv.width = Math.round(W * ppm);
    cv.height = Math.round(H * ppm);
    var c = cv.getContext("2d");
    var full = upperTR(person.name || person.back || person.short || "");
    var parts = full.split(/\s+/).filter(Boolean);
    var ink = inkOn(kit);
    var edge = lumOf(ink) > 0.5 ? "rgba(0,0,0,0.35)" : "rgba(255,255,255,0.35)";
    c.fillStyle = ink;
    c.strokeStyle = edge;
    c.textAlign = "center";
    c.textBaseline = "alphabetic";
    // sırtın düz kalan genişliği ~26 cm: daha uzun isim yanlara kıvrılıp kaybolur
    var maxW = 0.25 * ppm, cx = cv.width / 2;
    var nameH = 0.052 * ppm, top = 0.1 * ppm; // yaka altından boşluk
    function fit(text, h, weight) {
      var size = h;
      c.font = (weight || 800) + " " + Math.round(size) + "px " + A.FONT;
      var w = c.measureText(text).width;
      if (w > maxW) {
        size = Math.max(h * 0.5, (h * maxW) / w);
        c.font = (weight || 800) + " " + Math.round(size) + "px " + A.FONT;
      }
      return size;
    }
    var y = top + nameH;
    var oneLine = full;
    c.font = "800 " + Math.round(nameH) + "px " + A.FONT;
    if (parts.length > 1 && c.measureText(oneLine).width > maxW * 1.35) {
      var last = parts[parts.length - 1];
      var first = parts.slice(0, -1).join(" ");
      fit(first, nameH * 0.62);
      c.fillText(first, cx, top + nameH * 0.62);
      y = top + nameH * 0.62 + nameH * 1.08;
      fit(last, nameH);
      c.fillText(last, cx, y);
    } else if (oneLine) {
      fit(oneLine, nameH);
      c.fillText(oneLine, cx, y);
    }
    var num = String(person.shirt || "");
    if (num) {
      var numH = Math.min(0.21 * ppm, cv.height - y - 0.07 * ppm);
      c.font = "900 " + Math.round(numH * 1.32) + "px " + A.FONT;
      c.lineWidth = Math.max(2, ppm * 0.005);
      var ny = y + 0.03 * ppm + numH;
      c.strokeText(num, cx, ny);
      c.fillText(num, cx, ny);
    }
    return { cv: cv, ctx: c, W: W, ppm: ppm };
  }
  /** Göğüs: ortada numara, oyuncunun solunda (izleyenin sağında) kulüp arması. */
  function frontPrint(person, kit, ppm) {
    var W = 0.4, H = D.lines.collar - D.lines.waist;
    var cv = document.createElement("canvas");
    cv.width = Math.round(W * ppm);
    cv.height = Math.round(H * ppm);
    var c = cv.getContext("2d");
    var ink = inkOn(kit);
    c.textAlign = "center";
    c.textBaseline = "middle";
    var num = String(person.shirt || "");
    if (num) {
      c.fillStyle = ink;
      c.font = "900 " + Math.round(0.1 * ppm) + "px " + A.FONT;
      c.fillText(num, cv.width / 2, 0.2 * ppm);
    }
    // arma: kalkan + takım baş harfleri (oyuncunun solu = +x = izleyenin sağı)
    var team = person.team && person.team.name ? String(person.team.name) : "";
    var ini = upperTR(
      team
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map(function (w) {
          return w[0];
        })
        .join(""),
    );
    var ax = cv.width / 2 + 0.085 * ppm, ay = 0.115 * ppm, r = 0.032 * ppm;
    c.beginPath();
    c.moveTo(ax - r, ay - r);
    c.lineTo(ax + r, ay - r);
    c.lineTo(ax + r, ay + r * 0.25);
    c.quadraticCurveTo(ax + r, ay + r * 1.05, ax, ay + r * 1.35);
    c.quadraticCurveTo(ax - r, ay + r * 1.05, ax - r, ay + r * 0.25);
    c.closePath();
    c.fillStyle = kit.secondary;
    c.fill();
    c.lineWidth = Math.max(1, ppm * 0.004);
    c.strokeStyle = ink === kit.secondary ? "rgba(0,0,0,0.45)" : ink;
    c.stroke();
    if (ini) {
      c.fillStyle = lumOf(kit.secondary) > 0.55 ? kit.primary : "#FFFFFF";
      c.font = "900 " + Math.round(r * (ini.length > 1 ? 0.9 : 1.2)) + "px " + A.FONT;
      c.fillText(ini, ax, ay + r * 0.12);
    }
    return { cv: cv, ctx: c, W: W, ppm: ppm };
  }

  /** Sporcunun derisi + forması: tek tuval dokusu (S×S). */
  function paintKit(tex, person, opts, look) {
    var S = tex.image.width;
    var Lr = layers(S);
    var c = tex.userData.ctx;
    var out = c.createImageData(S, S);
    var o = out.data, base = Lr.skin, reg = Lr.reg, R = D.reg;
    var kit = kitOf(person);
    var keeper = !!opts.keeper;
    var prim = hexToRgb(kit.primary), sec = hexToRgb(kit.secondary);
    var whiteSec = sec[0] > 235 && sec[1] > 235 && sec[2] > 235;
    var shorts = keeper ? prim.map(function (v) { return v * 0.45; }) : whiteSec ? [241, 245, 249] : sec;
    var col = {};
    col[R.shirt] = prim;
    col[R.collar] = sec;
    col[R.cuff] = sec;
    col[R.shorts] = shorts;
    col[R.socks] = prim;
    col[R.sockTop] = sec;
    col[R.boots] = hexToRgb(look.boots);
    if (keeper) {
      col[R.forearm] = prim;
      col[R.hand] = [236, 240, 245];
    }
    var tone = look.tone;
    var mean = Lr.mean;
    // yazılar: sırt ve göğüs düzlemine bir kez çizilir, sonra piksel piksel taşınır
    var ppm = S * 0.9;
    var back = backPrint(person, kit, ppm), front = frontPrint(person, kit, ppm);
    var bd = back.ctx.getImageData(0, 0, back.cv.width, back.cv.height).data;
    var fd = front.ctx.getImageData(0, 0, front.cv.width, front.cv.height).data;
    var BW = back.cv.width, BH = back.cv.height, top = D.lines.collar;
    for (var i = 0, n = S * S; i < n; i++) {
      var p = i * 4;
      var r = reg[i];
      var c3 = col[r];
      var br = base[p], bg = base[p + 1], bb = base[p + 2];
      if (!c3) {
        o[p] = br * tone[0];
        o[p + 1] = bg * tone[1];
        o[p + 2] = bb * tone[2];
        o[p + 3] = 255;
        continue;
      }
      // kumaş: rengi koru, cildin gölgesinden yalnız yumuşak bir kıvrım payı al
      var lum = (br * 0.3 + bg * 0.59 + bb * 0.11) / mean;
      var sh = 0.8 + 0.2 * Math.min(1.25, Math.max(0.55, lum));
      var cr = c3[0], cg = c3[1], cb = c3[2];
      if (r === R.shirt && !isNaN(Lr.bx[i])) {
        var x = Lr.bx[i], y = Lr.by[i], z = Lr.bz[i];
        var isBack = z < 0;
        var tx = Math.round((isBack ? 0.2 - x : x + 0.2) * ppm);
        var ty = Math.round((top - y) * ppm);
        if (tx >= 0 && ty >= 0 && tx < BW && ty < BH) {
          var q = (ty * BW + tx) * 4;
          var src = isBack ? bd : fd;
          var a = src[q + 3] / 255;
          if (a > 0) {
            cr = cr + (src[q] - cr) * a;
            cg = cg + (src[q + 1] - cg) * a;
            cb = cb + (src[q + 2] - cb) * a;
          }
        }
      }
      o[p] = cr * sh;
      o[p + 1] = cg * sh;
      o[p + 2] = cb * sh;
      o[p + 3] = 255;
    }
    c.putImageData(out, 0, 0);
    tex.needsUpdate = true;
  }

  /* ─────────────── iskelet ve animasyon ─────────────── */

  function setupShared() {
    if (shared || !D) return shared;
    var body = decodePart(D.parts.body);
    shared = { body: body };
    shared.boneIndex = {};
    D.bones.forEach(function (b, i) {
      shared.boneIndex[b.n] = i;
    });
    shared.ibm = [];
    var ibm = view(Float32Array, D.ibm);
    for (var i = 0; i < D.bones.length; i++) shared.ibm.push(new T.Matrix4().fromArray(ibm, i * 16));
    shared.clips = {};
    for (var k in D.clips) shared.clips[k] = decodeClip(D.clips[k]);
    shared.hand = D.hand.map(function (h) {
      return { b: h[0], q: new T.Quaternion(h[1], h[2], h[3], h[4]) };
    });
    shared.bindQ = D.bones.map(function (b) {
      return new T.Quaternion(b.r[0], b.r[1], b.r[2], b.r[3]);
    });
    var map = { hips: "pelvis", neck: "neck_01", head: "Head", sha: "upperarm_l", shb: "upperarm_r", ela: "lowerarm_l", elb: "lowerarm_r", hpa: "thigh_l", hpb: "thigh_r", kna: "calf_l", knb: "calf_r", fta: "foot_l", ftb: "foot_r" };
    shared.jointOf = D.bones.map(function () {
      return null;
    });
    for (var j in map) shared.jointOf[shared.boneIndex[map[j]]] = j;
    ["spine_01", "spine_02", "spine_03"].forEach(function (n) {
      shared.jointOf[shared.boneIndex[n]] = "spine";
    });
    shared.pelvis = shared.boneIndex.pelvis;
    shared.geo = null; // ilk sporcuda kurulur
    return shared;
  }
  function geometries() {
    if (shared.geo) return shared.geo;
    var body = shared.body;
    shared.geo = {
      body: toGeometry(body),
      eyes: toGeometry(decodePart(D.parts.eyes)),
      brows: toGeometry(decodePart(D.parts.brows)),
      hairBuzzed: toGeometry(decodePart(D.parts.hairBuzzed)),
      hairParted: toGeometry(decodePart(D.parts.hairParted)),
      beard: toGeometry(decodePart(D.parts.beard)),
    };
    var tl = new T.TextureLoader();
    shared.eyeTex = tl.load(D.tex.eye);
    shared.eyeTex.colorSpace = T.SRGBColorSpace;
    shared.eyeTex.flipY = false;
    shared.eyeTex.userData.shared = true;
    shared.hairTex = tl.load(D.tex.hair);
    shared.hairTex.colorSpace = T.SRGBColorSpace;
    shared.hairTex.flipY = false;
    shared.hairTex.userData.shared = true;
    // kumaş biçimi bölge haritasına bakar: dokular çözülünce bir kez uygulanır
    // (paylaşılan geometri; boyama sırasından önce — bekleyenler sırayla çalışır)
    whenReady(function () {
      if (!img.mask || !img.mask.width) return;
      var Lr = layers(256);
      clothe(body, function (u, v) {
        var x = Math.min(255, Math.max(0, Math.floor(u * 256))), y = Math.min(255, Math.max(0, Math.floor(v * 256)));
        return Lr.reg[y * 256 + x];
      });
      delete bySize[256];
      shared.geo.body.attributes.position.needsUpdate = true;
      shared.geo.body.attributes.normal.needsUpdate = true;
    });
    return shared.geo;
  }

  var athletes = [];

  /**
   * İnsan figürü. opts.keeper: kaleci (uzun kol, eldiven); opts.detail: "hi"
   * (1024 doku: ana karakterler) ya da "lo" (512: kalabalık).
   * Dönen: { root, J, ... } — root sahneye eklenir, J eklemleri oyun döndürür.
   */
  function makeAthlete(person, opts) {
    opts = opts || {};
    setupShared();
    var seed = hashId(person.id || person.short || person.name);
    var look = {
      tone: TONES[seed % TONES.length],
      hair: HAIR[(seed >>> 3) % HAIR.length],
      cut: (seed >>> 6) % 3 === 0 ? "hairBuzzed" : "hairParted",
      beard: (seed >>> 9) % 10 < 3,
      boots: BOOTS[(seed >>> 12) % BOOTS.length],
    };
    var root = new T.Group();
    var J = {};
    ["hips", "spine", "neck", "head", "sha", "shb", "ela", "elb", "hpa", "hpb", "kna", "knb", "fta", "ftb"].forEach(function (k) {
      J[k] = new T.Object3D();
    });
    J.hips.position.y = 0.94;
    var a = { root: root, J: J, person: person, opts: opts, look: look, seed: seed, clip: null, clipT: 0, clipW: 0, phase: (seed % 1000) / 1000 };
    if (!D) return a;

    var geo = geometries();
    var bones = D.bones.map(function (b) {
      var bone = new T.Bone();
      bone.name = b.n;
      bone.position.set(b.t[0], b.t[1], b.t[2]);
      bone.quaternion.set(b.r[0], b.r[1], b.r[2], b.r[3]);
      return bone;
    });
    D.bones.forEach(function (b, i) {
      if (b.p >= 0) bones[b.p].add(bones[i]);
      else root.add(bones[i]);
    });
    var skeleton = new T.Skeleton(bones, shared.ibm);
    var S = opts.detail === "lo" ? 512 : 1024;
    var tex = canvasTex(S, S, function (c) {
      c.fillStyle = "#c58f6a";
      c.fillRect(0, 0, S, S);
    });
    tex.flipY = false;
    var bodyMat = new T.MeshStandardMaterial({ map: tex, roughness: 0.78, metalness: 0 });
    var hairMat = new T.MeshStandardMaterial({ color: look.hair, map: shared.hairTex, roughness: 0.85 });
    var eyeMat = new T.MeshStandardMaterial({ map: shared.eyeTex, roughness: 0.3 });
    var browMat = new T.MeshStandardMaterial({ color: new T.Color(look.hair).multiplyScalar(0.8), roughness: 0.9 });
    function skinned(g, mat, shadow) {
      var m = new T.SkinnedMesh(g, mat);
      m.bind(skeleton, new T.Matrix4());
      m.castShadow = !!shadow;
      m.frustumCulled = false; // animasyonla sınırlar değişir
      root.add(m);
      return m;
    }
    skinned(geo.body, bodyMat, true);
    skinned(geo.eyes, eyeMat, false);
    skinned(geo.brows, browMat, false);
    skinned(geo[look.cut], hairMat, true);
    if (look.beard) skinned(geo.beard, hairMat, false);

    a.bones = bones;
    a.skeleton = skeleton;
    a.tex = tex;
    root.userData.athlete = a;
    whenReady(function () {
      if (!a.dead) paintKit(tex, person, opts, look);
    });
    athletes.push(a);
    return a;
  }

  function disposeTree(obj) {
    obj.traverse(function (o) {
      if (o.userData && o.userData.athlete) o.userData.athlete.dead = true;
      if (o.geometry && !(o.geometry.userData && o.geometry.userData.shared)) o.geometry.dispose();
      if (o.material) {
        var ms = Array.isArray(o.material) ? o.material : [o.material];
        ms.forEach(function (m) {
          if (m.map && !(m.map.userData && m.map.userData.shared)) m.map.dispose();
          m.dispose();
        });
      }
    });
    athletes = athletes.filter(function (a) {
      return !a.dead;
    });
  }

  function rest(a) {
    for (var k in a.J) a.J[k].rotation.set(0, 0, 0);
    a.J.hips.position.y = 0.94;
    a.root.rotation.set(0, 0, 0);
    a.root.position.y = 0;
    a.clip = null;
    a.clipW = 0;
  }
  /** Hazır klibi tabana koy: ad, süre içindeki an (sn, döngülenir), ağırlık 0..1. */
  function play(a, name, t, w) {
    a.clip = name;
    a.clipT = t;
    a.clipW = w == null ? 1 : w;
  }
  function clipDur(name) {
    var s = setupShared();
    return s && s.clips[name] ? s.clips[name].d : 1;
  }
  /**
   * Koşu döngüsü: φ adım fazı (2π = iki adım), amp genlik. amp küçükse
   * yürüyüş, ortaysa tempolu koşu, büyükse depar klibi.
   */
  function runCycle(a, phi, amp) {
    var name = amp > 0.85 ? "sprint" : amp > 0.4 ? "jog" : "walk";
    play(a, name, (phi / (Math.PI * 2)) * clipDur(name), 1);
  }

  var qa = null, qb = null, qc = null, eul = null, qI = null;
  function sampleInto(clip, t, outQ, outPel) {
    var d = clip.d || 1;
    t = ((t % d) + d) % d;
    var fpos = (t / d) * (clip.frames - 1);
    var f0 = Math.floor(fpos), f1 = Math.min(clip.frames - 1, f0 + 1), u = fpos - f0;
    var nb = clip.bones.length, q = clip.q;
    for (var k = 0; k < nb; k++) {
      var i0 = (f0 * nb + k) * 4, i1 = (f1 * nb + k) * 4;
      qa.set(q[i0], q[i0 + 1], q[i0 + 2], q[i0 + 3]);
      qb.set(q[i1], q[i1 + 1], q[i1 + 2], q[i1 + 3]);
      outQ[clip.bones[k]].copy(qa).slerp(qb, u);
    }
    if (outPel && clip.hasPel) {
      var p = clip.pel;
      for (var c = 0; c < 3; c++) outPel[c] = (p[f0 * 3 + c] * (1 - u) + p[f1 * 3 + c] * u);
    }
  }

  var scratch = null;
  function poseAthlete(a) {
    var s = shared, n = D.bones.length;
    if (!scratch) {
      qa = new T.Quaternion();
      qb = new T.Quaternion();
      qc = new T.Quaternion();
      qI = new T.Quaternion();
      eul = new T.Euler();
      scratch = { base: [], clipQ: [], W: [], F: [], R: [], pelA: [0, 0, 0], pelB: [0, 0, 0] };
      for (var i = 0; i < n; i++) {
        scratch.base.push(new T.Quaternion());
        scratch.clipQ.push(new T.Quaternion());
        scratch.W.push(new T.Quaternion());
        scratch.F.push(new T.Quaternion());
        scratch.R.push(new T.Quaternion());
      }
    }
    var base = scratch.base, clipQ = scratch.clipQ, W = scratch.W, F = scratch.F, R = scratch.R;
    for (i = 0; i < n; i++) base[i].copy(s.bindQ[i]);
    // 1) taban: bekleme klibi (nefes), üstüne seçili klip ağırlığıyla
    var idle = s.clips.idle;
    var pel = scratch.pelA, pel2 = scratch.pelB;
    pel[0] = D.bones[s.pelvis].t[0];
    pel[1] = D.bones[s.pelvis].t[1];
    pel[2] = D.bones[s.pelvis].t[2];
    sampleInto(idle, A.time + a.phase * idle.d, base, idle.hasPel ? pel : null);
    var clip = a.clip && s.clips[a.clip];
    if (clip && a.clipW > 0) {
      for (i = 0; i < n; i++) clipQ[i].copy(base[i]);
      pel2[0] = pel[0], pel2[1] = pel[1], pel2[2] = pel[2];
      sampleInto(clip, a.clipT, clipQ, pel2);
      var w = Math.min(1, a.clipW);
      for (i = 0; i < clip.bones.length; i++) base[clip.bones[i]].slerp(clipQ[clip.bones[i]], w);
      for (var c = 0; c < 3; c++) pel[c] += (pel2[c] - pel[c]) * w;
    }
    for (i = 0; i < s.hand.length; i++) base[s.hand[i].b].copy(s.hand[i].q);
    // 2) model uzayında taban yönelimleri, 3) eklem katmanı zinciri, 4) yerel'e dön
    var J = a.J;
    for (i = 0; i < n; i++) {
      var p = D.bones[i].p;
      if (p < 0) W[i].copy(base[i]);
      else W[i].multiplyQuaternions(W[p], base[i]);
      var jn = s.jointOf[i];
      if (jn) {
        var r = J[jn].rotation;
        eul.set(r.x, r.y, r.z, "XYZ");
        qc.setFromEuler(eul);
        if (jn === "spine") qc.copy(qI.identity()).slerp(qb.setFromEuler(eul), 1 / 3);
        if (p < 0) R[i].copy(qc);
        else R[i].multiplyQuaternions(R[p], qc);
      } else if (p < 0) R[i].identity();
      else R[i].copy(R[p]);
      F[i].multiplyQuaternions(R[i], W[i]);
      var bone = a.bones[i];
      if (p < 0) bone.quaternion.copy(F[i]);
      else bone.quaternion.copy(qa.copy(F[p]).invert().multiply(F[i]));
    }
    // kalça yüksekliği: J.hips.position.y'nin 0.94'ten sapması dikey kayma olur
    // (kök kemik −90° x döndürülmüş: kalça yerelinde yukarı +z'dir)
    var dy = J.hips.position.y - 0.94;
    a.bones[s.pelvis].position.set(pel[0], pel[1], pel[2] + dy);
  }
  /** Bütün canlı sporcuların iskeletini güncelle — renderer.render'dan hemen önce. */
  function syncAll() {
    if (!D) return;
    for (var i = 0; i < athletes.length; i++) if (!athletes[i].dead && athletes[i].bones) poseAthlete(athletes[i]);
  }

  A.T3 = {
    init: init,
    std: std,
    mesh: mesh,
    canvasTex: canvasTex,
    glowTexture: glowTexture,
    makeAthlete: makeAthlete,
    disposeTree: disposeTree,
    rest: rest,
    runCycle: runCycle,
    play: play,
    clipDur: clipDur,
    syncAll: syncAll,
  };
})();
