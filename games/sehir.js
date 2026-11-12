/*
 * KULÜP ŞEHRİ 3B — yıldızlarla kurulan futbol şehrinin canlı sahnesi.
 *
 * Bu dosya YALNIZ ÇİZER ve CANLANDIRIR; kurallar, maliyetler ve kilitler
 * sunucudadır (elitlig-server services/puzzle/city.js). RN ekranı
 * (app/kulup-sehri.tsx) şehrin durumunu gönderir, sahne her birimi basamağına
 * göre kurar; basamak değişince İNŞAAT animasyonu oynar (iskele, vinç, toz,
 * yükselen yapı, konfeti) ve kamera o birime uçar.
 *
 * KÖPRÜ:
 *   RN → sahne : ArenaCmd({ type:"city", levels, kit, marks, tier, focus })
 *                  levels  { saha:2, kantin:1, … }
 *                  marks   { kantin:"up" | "lock" | "max" }  (etiketlerdeki rozet)
 *                  focus   birim anahtarı (kamera oraya uçar) ya da null
 *                ArenaCmd({ type:"focus", key })
 *   sahne → RN : { type:"tap", key }  (birime dokunuldu)
 *                { type:"ready" }
 *
 * DÜNYA (metre): merkezde ana saha ve stadyum; çevre yolunun dışında
 * birimlerin arsaları. Saha büyüdükçe okul binası yerini stadyuma bırakır.
 * Gündüz/gün batımı/gece cihaz saatine göre; gece pencereler ve projektörler
 * yanar.
 *
 * İNSANLAR: örneklenmiş mini futbolcular (arcade3d.js). Sahada maç oynanır
 * (oyuncu sayısı sahanın basamağıyla büyür: okul bahçesinde 6 çocuk, çim
 * sahada 22 oyuncu ve hakem), tribünde taraftar, kantinde kuyruk, antrenman
 * sahasında koni çalışması, akademide çocuklar, kampta ateş başında takım.
 */
(function () {
  "use strict";
  var A = window.Arena;
  var T = window.THREE || (typeof THREE !== "undefined" ? THREE : null); // eslint-disable-line no-undef
  var G3 = A.G3;
  var K = A.T3;

  /* ─────────────────────────── durum ─────────────────────────── */

  var ORDER = ["saha", "tribun", "soyunma", "kantin", "magaza", "kulup", "saglik", "medya", "antrenman", "akademi", "kamp", "ulasim"];
  var TITLES = {
    saha: "Ana saha", tribun: "Tribün", soyunma: "Soyunma", kantin: "Kafeterya", magaza: "Mağaza", kulup: "Kulüp binası",
    saglik: "Sağlık", medya: "Medya", antrenman: "Antrenman", akademi: "Akademi", kamp: "Kamp oteli", ulasim: "Ulaşım",
  };
  /** Arsalar: merkez (x, z) ve dokunma yarıçapı. */
  var PLOTS = {
    saha: { x: 0, z: 0, r: 14 },
    tribun: { x: 0, z: 17, r: 8, label: [0, 22] },
    soyunma: { x: -50, z: -16, r: 10 },
    kantin: { x: -50, z: 8, r: 10 },
    magaza: { x: -50, z: 32, r: 10 },
    kulup: { x: 50, z: -16, r: 10 },
    saglik: { x: 50, z: 8, r: 10 },
    medya: { x: 50, z: 32, r: 10 },
    antrenman: { x: -26, z: -50, r: 13 },
    akademi: { x: 26, z: -50, r: 13 },
    kamp: { x: -30, z: 54, r: 12 },
    ulasim: { x: 26, z: 54, r: 12 },
  };
  var levels = {};
  ORDER.forEach(function (k) {
    levels[k] = 0;
  });
  var marks = {};
  var kit = { primary: "#5B3DF5", secondary: "#FFFFFF" };
  var tierTitle = "";
  var received = false;
  var W = 0, H = 0;

  /* ─────────────────────────── kamera ─────────────────────────── */

  var HOME_DIST = 225;
  var cam = { yaw: -0.3, pitch: 0.8, dist: HOME_DIST, tx: 0, tz: 4 };
  var camGoal = { yaw: -0.3, pitch: 0.8, dist: HOME_DIST, tx: 0, tz: 4 };
  var idleT = 0;
  var drag = null;

  function setFocus(key) {
    var p = PLOTS[key];
    if (!p) {
      camGoal.tx = 0;
      camGoal.tz = 4;
      camGoal.dist = HOME_DIST;
      return;
    }
    camGoal.tx = p.x;
    camGoal.tz = p.z;
    camGoal.dist = key === "saha" || key === "tribun" ? 105 : 72;
    idleT = 0;
  }

  /* ─────────────────────────── komutlar ─────────────────────────── */

  function command(cmd) {
    if (cmd.type === "city") {
      if (cmd.kit && cmd.kit.primary) kit = { primary: cmd.kit.primary, secondary: cmd.kit.secondary || "#FFFFFF" };
      if (cmd.marks && typeof cmd.marks === "object") marks = cmd.marks;
      if (cmd.tier) tierTitle = String(cmd.tier);
      if (cmd.levels && typeof cmd.levels === "object") applyLevels(cmd.levels, received);
      received = true;
      if (cmd.focus !== undefined) setFocus(cmd.focus);
    } else if (cmd.type === "focus") setFocus(cmd.key);
  }

  /** Yeni seviyeler: değişen birimler yeniden kurulur; animate ise inşaat oynar. */
  function applyLevels(next, animate) {
    var changed = [];
    ORDER.forEach(function (k) {
      var v = Math.max(0, Math.floor(Number(next[k]) || 0));
      if (v !== levels[k]) {
        changed.push({ key: k, from: levels[k], to: v });
        levels[k] = v;
      }
    });
    if (!R) return;
    // İnşaat sahnesi yalnız TEK birim bir basamak yükselince oynar (ilk yükleme ve toplu değişim anında kurulur).
    var single = changed.length === 1 && changed[0].to > changed[0].from;
    changed.forEach(function (c) {
      rebuild(c.key, animate && single);
    });
    // saha büyüyünce tribün de yeni ölçüye oturur
    if (changed.some(function (c) { return c.key === "saha"; }) && !changed.some(function (c) { return c.key === "tribun"; })) rebuild("tribun", false);
    if (animate && changed.length === 1 && changed[0].to > changed[0].from) setFocus(changed[0].key);
  }

  /* ═══════════════════════════ 3B ═══════════════════════════ */

  var R = null, glFailed = false;
  var mats = {};
  function mat(color, rough, extra) {
    var key = color + ":" + (rough == null ? 0.8 : rough) + (extra ? JSON.stringify(extra) : "");
    if (!mats[key]) mats[key] = K.std(color, rough == null ? 0.8 : rough, 0, extra);
    return mats[key];
  }
  function box(g, w, h, d, color, x, y, z, rough) {
    var m = K.mesh(new T.BoxGeometry(w, h, d), typeof color === "object" ? color : mat(color, rough), true, true);
    m.position.set(x || 0, (y || 0) + h / 2, z || 0);
    g.add(m);
    return m;
  }
  function cyl(g, r1, r2, h, color, x, y, z, seg) {
    var m = K.mesh(new T.CylinderGeometry(r1, r2, h, seg || 12), typeof color === "object" ? color : mat(color), true, true);
    m.position.set(x || 0, (y || 0) + h / 2, z || 0);
    g.add(m);
    return m;
  }
  function plane(g, w, d, material, x, y, z) {
    var m = new T.Mesh(new T.PlaneGeometry(w, d), material);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x || 0, y || 0.02, z || 0);
    m.receiveShadow = true;
    g.add(m);
    return m;
  }
  var texCache = {};
  function tex(key, w, h, draw, repeat) {
    if (!texCache[key]) texCache[key] = K.canvasTex(w, h, draw, repeat);
    return texCache[key];
  }
  function upper(s) {
    try {
      return String(s).toLocaleUpperCase("tr-TR");
    } catch (e) {
      return String(s).toUpperCase();
    }
  }

  /** Tabela: renkli zemin üstünde yazı (kulüp rengiyle). */
  function sign(g, text, w, h, x, y, z, bg, fg, ry) {
    var key = "sign:" + text + bg + fg;
    var t = tex(key, 512, 128, function (c) {
      c.fillStyle = bg || kit.primary;
      c.fillRect(0, 0, 512, 128);
      c.strokeStyle = "rgba(255,255,255,0.5)";
      c.lineWidth = 6;
      c.strokeRect(6, 6, 500, 116);
      c.fillStyle = fg || "#FFFFFF";
      c.font = "900 58px " + A.FONT;
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillText(upper(text), 256, 68, 480);
    });
    var m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshStandardMaterial({ map: t, roughness: 0.6, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.15 }));
    m.position.set(x, y, z);
    m.rotation.y = ry || 0;
    g.add(m);
    R.glowSigns.push(m.material);
    return m;
  }

  /** Pencereli cephe dokusu; gece emissive harita yanar. */
  function windowMats(wall) {
    var key = "win:" + wall;
    if (mats[key]) return mats[key];
    var map = tex("winmap", 128, 128, function (c) {
      c.fillStyle = "#ffffff";
      c.fillRect(0, 0, 128, 128);
      for (var y = 0; y < 2; y++)
        for (var x = 0; x < 2; x++) {
          c.fillStyle = "#3b4d73";
          c.fillRect(x * 64 + 12, y * 64 + 12, 40, 40);
          c.fillStyle = "rgba(170,210,255,0.6)";
          c.fillRect(x * 64 + 12, y * 64 + 12, 40, 16);
          c.fillStyle = "rgba(255,255,255,0.8)";
          c.fillRect(x * 64 + 31, y * 64 + 12, 2, 40);
        }
    }, true);
    var glow = tex("winglow", 128, 128, function (c) {
      c.fillStyle = "#000";
      c.fillRect(0, 0, 128, 128);
      var on = [1, 0, 1, 1];
      for (var i = 0; i < 4; i++) {
        if (!on[i]) continue;
        c.fillStyle = i % 2 ? "#ffe2a0" : "#fff3d0";
        c.fillRect((i % 2) * 64 + 12, Math.floor(i / 2) * 64 + 12, 40, 40);
      }
    }, true);
    var m = new T.MeshStandardMaterial({ color: wall, map: map, roughness: 0.85, emissive: 0xffffff, emissiveMap: glow, emissiveIntensity: 0 });
    R.nightMats.push(m);
    mats[key] = m;
    return m;
  }
  /** Ev / bina: pencereli duvarlar + çatı (düz, beşik ya da yok). */
  function house(g, w, d, h, wall, roof, roofType, x, z, y) {
    var wm = windowMats(wall);
    var geo = new T.BoxGeometry(w, h, d);
    var uv = geo.attributes.uv;
    for (var i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * Math.max(1, Math.round(w / 3.2)), uv.getY(i) * Math.max(1, Math.round(h / 3.2)));
    var top = mat(roof || "#94a3b8", 0.8);
    var m = K.mesh(geo, [wm, wm, top, top, wm, wm], true, true);
    m.position.set(x || 0, (y || 0) + h / 2, z || 0);
    g.add(m);
    if (roofType === "gable") {
      var shape = new T.Shape();
      shape.moveTo(-w / 2 - 0.4, 0);
      shape.lineTo(w / 2 + 0.4, 0);
      shape.lineTo(0, Math.min(3, w * 0.35));
      shape.closePath();
      var rg = new T.ExtrudeGeometry(shape, { depth: d + 0.8, bevelEnabled: false });
      rg.translate(0, 0, -(d + 0.8) / 2);
      var r = K.mesh(rg, mat(roof || "#b45309", 0.7), true, false);
      r.position.set(x || 0, (y || 0) + h, z || 0);
      g.add(r);
    } else if (roofType === "flat") {
      box(g, w + 0.3, 0.3, d + 0.3, roof || "#64748b", x, (y || 0) + h, z);
    }
    return m;
  }
  function door(g, x, y, z, ry, color) {
    var d = box(g, 1.3, 2.2, 0.15, color || "#3f2a1d", 0, 0, 0);
    d.position.set(x, (y || 0) + 1.1, z);
    d.rotation.y = ry || 0;
    return d;
  }
  function tree(g, x, z, s, tone) {
    s = s || 1;
    cyl(g, 0.22 * s, 0.32 * s, 2.4 * s, "#7a5536", x, 0, z, 7);
    var leaf = K.mesh(R.leafGeo, mat(tone || ["#3fa34d", "#58b85a", "#2f8f45"][Math.abs(Math.round(x * 3 + z)) % 3], 0.85), true, false);
    leaf.position.set(x, 3.2 * s, z);
    leaf.scale.setScalar(1.6 * s);
    g.add(leaf);
  }
  function bench(g, x, z, ry, len) {
    var b = new T.Group();
    box(b, len || 3, 0.12, 0.5, "#a16207", 0, 0.45, 0);
    box(b, len || 3, 0.4, 0.08, "#a16207", 0, 0.6, -0.22);
    [-1, 1].forEach(function (s) {
      box(b, 0.1, 0.45, 0.45, "#334155", s * ((len || 3) / 2 - 0.2), 0, 0);
    });
    b.position.set(x, 0, z);
    b.rotation.y = ry || 0;
    g.add(b);
    return b;
  }
  function fence(g, w, d, h, x, z, color) {
    var mesh = tex("fence", 128, 128, function (c) {
      c.clearRect(0, 0, 128, 128);
      c.strokeStyle = "rgba(220,230,240,0.95)";
      c.lineWidth = 3;
      for (var i = -128; i < 256; i += 16) {
        c.beginPath();
        c.moveTo(i, 0);
        c.lineTo(i + 128, 128);
        c.moveTo(i + 128, 0);
        c.lineTo(i, 128);
        c.stroke();
      }
    }, true);
    var fm = new T.MeshStandardMaterial({ map: mesh, transparent: true, alphaTest: 0.2, side: T.DoubleSide, roughness: 0.5, metalness: 0.4 });
    [[w, 0, -d / 2, 0], [w, 0, d / 2, 0], [d, -w / 2, 0, Math.PI / 2], [d, w / 2, 0, Math.PI / 2]].forEach(function (s) {
      var t2 = mesh.clone();
      t2.needsUpdate = true;
      t2.repeat.set(s[0] / 1.2, h / 1.2);
      var m = new T.Mesh(new T.PlaneGeometry(s[0], h), new T.MeshStandardMaterial({ map: t2, transparent: true, alphaTest: 0.2, side: T.DoubleSide, roughness: 0.5, metalness: 0.4 }));
      m.position.set((x || 0) + s[1], h / 2, (z || 0) + s[2]);
      m.rotation.y = s[3];
      g.add(m);
    });
    void fm;
    for (var i = 0; i <= 4; i++) {
      [-1, 1].forEach(function (sd) {
        cyl(g, 0.06, 0.06, h, color || "#16a34a", (x || 0) - w / 2 + (i * w) / 4, 0, (z || 0) + sd * d / 2, 6);
      });
    }
  }
  /** Projektör direği; gece ışığı yanar (lampa + parlama + yer ışığı). */
  function flood(g, x, z, h, aimX, aimZ) {
    cyl(g, 0.12, 0.2, h, "#475569", x, 0, z, 8);
    var head = new T.Group();
    var panel = new T.Mesh(new T.BoxGeometry(2.2, 1.2, 0.3), R.lampMat);
    head.add(panel);
    var glow = new T.Sprite(R.glowMat);
    glow.scale.set(9, 9, 1);
    glow.position.z = 0.3;
    head.add(glow);
    head.position.set(x, h, z);
    head.lookAt(aimX || 0, 0, aimZ || 0);
    g.add(head);
    R.floodGlows.push(glow);
  }

  /** Kale: direk + üst direk (+ ağ). */
  function goal(g, x, z, w, h, facing, white, net) {
    var col = white ? "#f8fafc" : "#8b5e3c";
    var grp = new T.Group();
    var r = white ? 0.07 : 0.06;
    cyl(grp, r, r, h, col, -w / 2, 0, 0, 8);
    cyl(grp, r, r, h, col, w / 2, 0, 0, 8);
    var bar = K.mesh(new T.CylinderGeometry(r, r, w, 8), mat(col), true, false);
    bar.rotation.z = Math.PI / 2;
    bar.position.y = h;
    grp.add(bar);
    if (net) {
      var nt = R.netTex.clone();
      nt.needsUpdate = true;
      nt.repeat.set(w * 2, h * 2);
      var nm = new T.MeshBasicMaterial({ map: nt, transparent: true, alphaTest: 0.1, side: T.DoubleSide, depthWrite: false });
      var back = new T.Mesh(new T.PlaneGeometry(w, h), nm);
      back.position.set(0, h / 2, -1.1);
      grp.add(back);
      var top = new T.Mesh(new T.PlaneGeometry(w, 1.1), nm);
      top.rotation.x = Math.PI / 2;
      top.position.set(0, h, -0.55);
      grp.add(top);
    }
    grp.position.set(x, 0, z);
    grp.rotation.y = facing;
    g.add(grp);
  }

  /* ─────────────── saha boyutu ─────────────── */

  var PITCH = [
    { w: 18, d: 11, players: 6, kids: true },
    { w: 20, d: 12, players: 8 },
    { w: 22, d: 13, players: 10 },
    { w: 22, d: 13, players: 10 },
    { w: 30, d: 18, players: 14 },
    { w: 40, d: 26, players: 22 },
    { w: 40, d: 26, players: 22 },
    { w: 40, d: 26, players: 22 },
  ];
  function pitchSize() {
    return PITCH[Math.min(levels.saha, PITCH.length - 1)];
  }

  function pitchTexture(lv, P) {
    return tex("pitch" + lv, 1024, 640, function (c, cw, ch) {
      var sx = cw / P.w, sz = ch / P.d;
      var rnd = A.seeded(lv * 13 + 7);
      if (lv === 0) {
        c.fillStyle = "#b9bcc1";
        c.fillRect(0, 0, cw, ch);
        for (var i = 0; i < 9000; i++) {
          c.fillStyle = rnd() < 0.5 ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.07)";
          c.fillRect(rnd() * cw, rnd() * ch, 2, 2);
        }
        // beton derzleri
        c.strokeStyle = "rgba(70,74,82,0.45)";
        c.lineWidth = 3;
        for (var x = 0; x < cw; x += 3 * sx) {
          c.beginPath();
          c.moveTo(x, 0);
          c.lineTo(x, ch);
          c.stroke();
        }
        for (var y = 0; y < ch; y += 3 * sz) {
          c.beginPath();
          c.moveTo(0, y);
          c.lineTo(cw, y);
          c.stroke();
        }
        // seksek
        c.strokeStyle = "rgba(255,255,255,0.75)";
        c.lineWidth = 6;
        [[0, 0], [1, 0], [2, -0.5], [2, 0.5], [3, 0], [4, -0.5], [4, 0.5]].forEach(function (q) {
          c.strokeRect(cw * 0.82 + q[1] * 46, ch * 0.18 + q[0] * 46, 46, 46);
        });
        c.strokeStyle = "rgba(250,250,240,0.85)";
        c.lineWidth = 8;
        c.setLineDash([26, 10]);
        c.strokeRect(1 * sx, 1 * sz, (P.w - 2) * sx, (P.d - 2) * sz);
        c.beginPath();
        c.moveTo(cw / 2, 1 * sz);
        c.lineTo(cw / 2, ch - 1 * sz);
        c.stroke();
        c.setLineDash([]);
        return;
      }
      if (lv === 1) {
        var gd = c.createRadialGradient(cw / 2, ch / 2, 50, cw / 2, ch / 2, cw * 0.7);
        gd.addColorStop(0, "#c08a55");
        gd.addColorStop(1, "#9c6b3f");
        c.fillStyle = gd;
        c.fillRect(0, 0, cw, ch);
        for (var n = 0; n < 14000; n++) {
          c.fillStyle = rnd() < 0.5 ? "rgba(255,230,190,0.12)" : "rgba(60,30,10,0.12)";
          c.fillRect(rnd() * cw, rnd() * ch, 2 + rnd() * 3, 2);
        }
        // kenarlarda kuru ot
        for (var t = 0; t < 400; t++) {
          var ex = rnd() < 0.5 ? rnd() * cw * 0.08 : cw - rnd() * cw * 0.08;
          c.fillStyle = "rgba(120,140,60,0.5)";
          c.fillRect(ex, rnd() * ch, 3, 6);
        }
      } else if (lv <= 4) {
        for (var b = 0; b < 10; b++) {
          c.fillStyle = b % 2 ? "#2fa84f" : "#38b85a";
          c.fillRect((b * cw) / 10, 0, cw / 10 + 1, ch);
        }
        for (var m = 0; m < 9000; m++) {
          c.fillStyle = rnd() < 0.5 ? "rgba(255,255,255,0.05)" : "rgba(0,50,0,0.06)";
          c.fillRect(rnd() * cw, rnd() * ch, 2, 3);
        }
      } else {
        var bands = lv >= 6 ? 14 : 10;
        for (var s = 0; s < bands; s++) {
          c.fillStyle = s % 2 ? (lv >= 7 ? "#2ba64e" : "#2f9e4c") : lv >= 7 ? "#3cc463" : "#3bb35a";
          c.fillRect((s * cw) / bands, 0, cw / bands + 1, ch);
        }
        if (lv >= 6)
          for (var q = 0; q < 8; q++) {
            c.fillStyle = "rgba(0,0,0,0.035)";
            c.fillRect(0, (q * ch) / 8, cw, ch / 16);
          }
        for (var k = 0; k < 12000; k++) {
          c.fillStyle = rnd() < 0.5 ? "rgba(255,255,255,0.04)" : "rgba(0,50,0,0.05)";
          c.fillRect(rnd() * cw, rnd() * ch, 2, 3);
        }
      }
      // çizgiler
      c.strokeStyle = lv === 1 ? "rgba(255,255,250,0.8)" : "rgba(255,255,255,0.93)";
      c.lineWidth = lv >= 5 ? 7 : 6;
      var m0 = lv >= 5 ? 1.2 : 0.6;
      c.strokeRect(m0 * sx, m0 * sz, (P.w - 2 * m0) * sx, (P.d - 2 * m0) * sz);
      c.beginPath();
      c.moveTo(cw / 2, m0 * sz);
      c.lineTo(cw / 2, ch - m0 * sz);
      c.stroke();
      c.beginPath();
      c.arc(cw / 2, ch / 2, Math.min(P.d * 0.16, 4.5) * sz, 0, Math.PI * 2);
      c.stroke();
      var boxD = P.d * 0.5, boxW = P.w * (lv >= 5 ? 0.16 : 0.12);
      c.strokeRect(m0 * sx, (P.d / 2 - boxD / 2) * sz, boxW * sx, boxD * sz);
      c.strokeRect(cw - (m0 + boxW) * sx, (P.d / 2 - boxD / 2) * sz, boxW * sx, boxD * sz);
      if (lv >= 5) {
        var sb = P.d * 0.24, sw = P.w * 0.06;
        c.strokeRect(m0 * sx, (P.d / 2 - sb / 2) * sz, sw * sx, sb * sz);
        c.strokeRect(cw - (m0 + sw) * sx, (P.d / 2 - sb / 2) * sz, sw * sx, sb * sz);
      }
    });
  }

  /* ─────────────── birim kurucuları ─────────────── */

  var BUILD = {};
  /** Kurulan birimin dünya konumu (efekt noktaları dünya koordinatındadır). */
  var WP = { x: 0, z: 0 };

  BUILD.saha = function (g, lv) {
    var P = pitchSize();
    var t = pitchTexture(lv, P);
    var m = plane(g, P.w, P.d, new T.MeshStandardMaterial({ map: t, roughness: lv === 0 ? 0.95 : 0.85, envMapIntensity: 0.3 }), 0, 0.03, 0);
    m.castShadow = false;
    // çevre: beton / toprak kenar
    plane(g, P.w + 4, P.d + 4, mat(lv === 0 ? "#9aa0a8" : lv === 1 ? "#8a6a48" : lv >= 5 ? "#2f8f45" : "#d7dce4", 0.95), 0, 0.015, 0);
    if (lv >= 5) {
      // stadyum içi: koşu pisti
      var track = new T.Mesh(new T.RingGeometry(1, 1.12, 64), mat("#c2410c", 0.9, { side: T.DoubleSide }));
      track.rotation.x = -Math.PI / 2;
      track.scale.set(P.w / 2 + 2.4, P.d / 2 + 2.4, 1);
      track.position.y = 0.02;
      g.add(track);
    }
    var gw = lv >= 5 ? 7.3 : lv >= 4 ? 5 : 3.2, gh = lv >= 5 ? 2.44 : lv >= 2 ? 2 : 1.6;
    if (lv === 0) {
      // taş kaleler ve okul çantaları
      [-1, 1].forEach(function (s) {
        [-1, 1].forEach(function (q) {
          var st = K.mesh(new T.DodecahedronGeometry(0.35, 0), mat("#7c7f86", 0.9), true, false);
          st.position.set(s * (P.w / 2 - 1.3), 0.3, q * 1.4);
          g.add(st);
        });
        box(g, 0.6, 0.5, 0.35, ["#ef4444", "#3b82f6"][s > 0 ? 1 : 0], s * (P.w / 2 + 1.2), 0, 3);
      });
      // basket potası (okul bahçesi)
      cyl(g, 0.1, 0.1, 3, "#1f2937", 0, 0, -P.d / 2 - 1.2, 8);
      box(g, 1.8, 1.1, 0.1, "#f8fafc", 0, 2.8, -P.d / 2 - 1.1);
      return;
    }
    [-1, 1].forEach(function (s) {
      goal(g, s * (P.w / 2 - (lv >= 5 ? 1.2 : 0.6)), 0, gw, gh, s > 0 ? -Math.PI / 2 : Math.PI / 2, lv >= 2, lv >= 2);
    });
    if (lv >= 2 && lv <= 4) fence(g, P.w + 3, P.d + 3, lv >= 3 ? 4.5 : 3.6, 0, 0, "#16a34a");
    if (lv >= 3 && lv <= 4)
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (q) {
        flood(g, q[0] * (P.w / 2 + 1.5), q[1] * (P.d / 2 + 1.5), 9, 0, 0);
      });
    if (lv >= 4) {
      // yedek kulübeleri
      [-1, 1].forEach(function (s) {
        var dug = new T.Group();
        box(dug, 4.5, 0.2, 1.4, "#e2e8f0", 0, 1.8, 0);
        box(dug, 4.5, 1.8, 0.1, mat("#93c5fd", 0.2, { transparent: true, opacity: 0.5 }), 0, 0, -0.65);
        bench(dug, 0, 0, 0, 4);
        dug.position.set(s * 6, 0, -P.d / 2 - 2.6);
        g.add(dug);
      });
    }
    if (lv >= 5)
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (q) {
        cyl(g, 0.04, 0.04, 1.5, "#f8fafc", q[0] * (P.w / 2 - 1.2), 0, q[1] * (P.d / 2 - 1.2), 6);
        var flag = new T.Mesh(new T.PlaneGeometry(0.6, 0.4), mat(kit.primary, 0.7, { side: T.DoubleSide }));
        flag.position.set(q[0] * (P.w / 2 - 1.2) + 0.3, 1.3, q[1] * (P.d / 2 - 1.2));
        g.add(flag);
        R.flags.push(flag);
      });
    if (lv >= 7) {
      // alttan ısıtma: gece çim hafifçe ışır
      var heat = plane(g, P.w, P.d, new T.MeshBasicMaterial({ color: 0x7cff9b, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false }), 0, 0.05, 0);
      R.heat = heat.material;
    }
  };

  /** Okul binası: saha çim olana (5) kadar sahanın kuzeyinde. */
  function buildSchool(g) {
    var P = pitchSize();
    var z = -P.d / 2 - 10;
    house(g, 26, 9, 8, "#f5d0a9", "#9a3412", "gable", 0, z);
    sign(g, "ATATÜRK İLKOKULU", 10, 1.4, 0, 6.9, z + 4.55, "#1e3a8a", "#ffffff");
    door(g, 0, 0, z + 4.55);
    cyl(g, 0.08, 0.08, 9, "#e2e8f0", 15, 0, z + 2, 6);
    var fl = new T.Mesh(new T.PlaneGeometry(2.6, 1.7), mat("#e30a17", 0.7, { side: T.DoubleSide }));
    fl.position.set(16.3, 8, z + 2);
    g.add(fl);
    R.flags.push(fl);
    var star = new T.Mesh(new T.CircleGeometry(0.4, 5), mat("#ffffff", 0.6, { side: T.DoubleSide }));
    star.position.set(16.1, 8, z + 2.01);
    g.add(star);
    tree(g, -16, z + 3, 1.1);
    tree(g, 18, z + 6, 0.9);
  }

  /** Tribün kesiti: basamaklı eğim + seyirci dokusu (uzunluk boyunca). */
  function stand(g, len, rows, step, rise, x, z, ry, opts) {
    opts = opts || {};
    var sg = new T.Group();
    var depth = rows * step, height = rows * rise;
    // beton basamaklar
    for (var i = 0; i < rows; i++) box(sg, len, rise * (i + 1), step, opts.concrete || "#cbd5e1", 0, 0, -i * step - step / 2, 0.9);
    // seyirci yüzeyi
    var cg = new T.BufferGeometry();
    var hl = len / 2;
    cg.setAttribute("position", new T.BufferAttribute(new Float32Array([-hl, rise + 0.05, 0, hl, rise + 0.05, 0, hl, height + 0.05, -depth + step, -hl, rise + 0.05, 0, hl, height + 0.05, -depth + step, -hl, height + 0.05, -depth + step]), 3));
    cg.setAttribute("uv", new T.BufferAttribute(new Float32Array([0, 0, len / 9, 0, len / 9, rows / 2.4, 0, 0, len / 9, rows / 2.4, 0, rows / 2.4]), 2));
    cg.computeVertexNormals();
    if (opts.fans !== false) {
      var fans = new T.Mesh(cg, new T.MeshLambertMaterial({ map: R.crowdTex, side: T.DoubleSide, transparent: false }));
      fans.position.z = 0.02;
      sg.add(fans);
    }
    if (opts.roof) {
      // konsol çatı: arka sıraların üstünde, sahaya doğru hafif eğik
      var roof = box(sg, len + 1, 0.35, depth * 0.62, opts.roofColor || "#f1f5f9", 0, height + 3.2, -depth * 0.62);
      roof.rotation.x = 0.06;
      for (var c2 = -hl + 2; c2 <= hl - 2; c2 += Math.max(6, len / 5)) cyl(sg, 0.18, 0.18, height + 4, "#94a3b8", c2, 0, -depth + 0.5, 8);
      if (opts.led) {
        var led = new T.Mesh(new T.PlaneGeometry(len, 0.7), new T.MeshBasicMaterial({ map: R.ledTex, toneMapped: false }));
        led.position.set(0, height + 3.4, 1.05);
        sg.add(led);
      }
    }
    if (opts.back) box(sg, len, height + (opts.roof ? 4.2 : 1.2), 0.4, opts.back, 0, 0, -depth - 0.2);
    sg.position.set(x, 0, z);
    sg.rotation.y = ry || 0;
    g.add(sg);
    return sg;
  }

  BUILD.tribun = function (g, lv) {
    var P = pitchSize();
    var hw = P.w / 2 + 3, hd = P.d / 2 + 3;
    R.standSpots = [];
    if (lv === 0) return;
    if (lv === 1) {
      // alçak tuğla duvar; seyirciler ayakta
      box(g, P.w * 0.7, 1.0, 0.5, "#b45309", 0, 0, hd + 1.5);
      for (var i = 0; i < 9; i++) R.standSpots.push({ x: -P.w * 0.3 + i * (P.w * 0.6 / 8), z: hd + 0.8, ry: Math.PI, sit: false });
      return;
    }
    if (lv === 2) {
      for (var b = -1; b <= 1; b++) bench(g, b * 6.5, hd + 1.2, Math.PI, 5);
      for (var j = 0; j < 12; j++) R.standSpots.push({ x: -8.5 + (j % 4) * 1.3 + Math.floor(j / 4) * 6.5, z: hd + 1.1, ry: Math.PI, sit: true, y: 0 });
      return;
    }
    if (lv === 3) {
      stand(g, P.w * 0.8, 3, 1.2, 0.6, 0, hd + 0.8, Math.PI, { concrete: "#d1d5db" });
      return;
    }
    if (lv === 4) {
      stand(g, P.w, 6, 1.1, 0.6, 0, hd + 0.8, Math.PI, { roof: true, roofColor: kit.primary, back: "#334155" });
      stand(g, P.w * 0.7, 3, 1.2, 0.6, 0, -hd - 0.8, 0, { concrete: "#d1d5db" });
      return;
    }
    // 5+: dört taraflı stadyum (6: çatılı + LED, 7: Elit Arena)
    var rows = lv >= 7 ? 12 : lv >= 6 ? 10 : 8;
    var rise = lv >= 7 ? 0.8 : 0.68, step = 1.0;
    var depth = rows * step;
    var opts = { roof: lv >= 6, roofColor: lv >= 7 ? "#e2e8f0" : kit.primary, led: lv >= 6, back: lv >= 7 ? "#0f172a" : "#334155" };
    stand(g, P.w + 6, rows, step, rise, 0, hd, Math.PI, opts);
    stand(g, P.w + 6, rows, step, rise, 0, -hd, 0, opts);
    stand(g, P.d + 6, rows, step, rise, -hw, 0, Math.PI / 2, opts);
    stand(g, P.d + 6, rows, step, rise, hw, 0, -Math.PI / 2, opts);
    // köşe kuleleri (projektör)
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (q) {
      flood(g, q[0] * (hw + depth * 0.7), q[1] * (hd + depth * 0.7), lv >= 6 ? 26 : 20, 0, 0);
    });
    if (lv >= 6) {
      // dev ekran (kuzey çatısında)
      var scr = new T.Mesh(new T.PlaneGeometry(14, 5), new T.MeshBasicMaterial({ map: R.screenTex, toneMapped: false }));
      scr.position.set(0, rows * rise + 9.5, -hd - depth - 0.2);
      g.add(scr);
      box(g, 14.6, 5.6, 0.4, "#0b1020", 0, rows * rise + 6.7, -hd - depth - 0.6);
    }
    if (lv >= 7) {
      // arena dış cephesi: kulüp rengi ışıklı cam kuşak
      var ring = new T.Mesh(new T.CylinderGeometry(1, 1, 3, 48, 1, true), new T.MeshStandardMaterial({ color: kit.primary, emissive: kit.primary, emissiveIntensity: 0.4, transparent: true, opacity: 0.75, side: T.DoubleSide, roughness: 0.2, metalness: 0.4 }));
      ring.scale.set(hw + depth + 1.5, 1, hd + depth + 1.5);
      ring.position.y = rows * rise + 2.5;
      g.add(ring);
      R.arenaRing = ring.material;
    }
  };

  BUILD.soyunma = function (g, lv) {
    if (lv === 0) return emptyPlot(g);
    if (lv === 1) {
      tree(g, 0, -1, 1.5);
      // dallarda formalar
      for (var i = 0; i < 3; i++) {
        var shirt = new T.Mesh(new T.PlaneGeometry(0.9, 0.9), mat(i % 2 ? kit.primary : kit.secondary, 0.8, { side: T.DoubleSide }));
        shirt.position.set(-1 + i, 2.6 + (i % 2) * 0.3, 0.6);
        g.add(shirt);
        R.flags.push(shirt);
      }
      for (var b = 0; b < 4; b++) box(g, 0.6, 0.4, 0.35, ["#1f2937", "#dc2626", "#2563eb", "#16a34a"][b], -2 + b * 1.2, 0, 2);
      return;
    }
    if (lv === 2) {
      // konteyner
      var c = box(g, 8, 2.8, 3.2, "#f97316", 0, 0, 0, 0.6);
      c.material = mat("#ea580c", 0.6);
      for (var r = -3.6; r <= 3.6; r += 0.6) box(g, 0.12, 2.6, 0.06, "#c2410c", r, 0.1, 1.62);
      door(g, 2.5, 0, 1.68);
      sign(g, "SOYUNMA", 3, 0.7, -1.6, 2.2, 1.7, kit.primary);
      return;
    }
    var w = lv >= 6 ? 14 : lv >= 5 ? 12 : 10, d = lv >= 5 ? 9 : 7, h = lv >= 6 ? 4.5 : 3.6;
    house(g, w, d, h, lv >= 6 ? "#e2e8f0" : "#fef3c7", lv >= 6 ? kit.primary : "#7c2d12", lv >= 6 ? "flat" : "gable", 0, 0);
    door(g, 0, 0, d / 2 + 0.05);
    sign(g, lv >= 6 ? "PRO SOYUNMA" : "SOYUNMA ODASI", 4.6, 0.9, 0, h - 0.7, d / 2 + 0.06, kit.primary);
    if (lv >= 4) {
      // duş buharı çıkan bacalar
      cyl(g, 0.3, 0.3, 1.4, "#94a3b8", w / 2 - 1.2, h, -1, 8);
      R.steam.push({ x: WP.x + w / 2 - 1.2, y: h + 1.6, z: WP.z - 1 });
    }
    if (lv >= 5) {
      // buz havuzu
      var pool = plane(g, 4.5, 3, new T.MeshStandardMaterial({ color: 0x7dd3fc, roughness: 0.08, metalness: 0.2, transparent: true, opacity: 0.9 }), -w / 2 - 3.2, 0.25, 1);
      box(g, 5, 0.25, 3.5, "#e2e8f0", -w / 2 - 3.2, 0, 1);
      R.water.push(pool.material);
    }
    if (lv >= 6) {
      var strip = new T.Mesh(new T.BoxGeometry(w + 0.2, 0.2, d + 0.2), new T.MeshBasicMaterial({ color: kit.primary, toneMapped: false }));
      strip.position.y = h - 0.05;
      g.add(strip);
    }
  };

  BUILD.kantin = function (g, lv) {
    if (lv === 0) return emptyPlot(g);
    R.queue.push({ x: WP.x, z: WP.z + (lv >= 3 ? 7 : 3.4), n: Math.min(2 + lv, 7) });
    if (lv === 1) {
      box(g, 2.2, 0.9, 1, "#e2e8f0", 0, 0, 0);
      box(g, 0.6, 0.3, 0.45, "#475569", -0.4, 0.9, 0);
      box(g, 0.25, 0.35, 0.25, "#dc2626", 0.6, 0.9, 0);
      // şemsiye
      cyl(g, 0.04, 0.04, 2.6, "#94a3b8", 0, 0, -0.2, 6);
      var um = K.mesh(new T.ConeGeometry(1.8, 0.7, 8), mat("#ef4444", 0.7), true, false);
      um.position.set(0, 2.6, -0.2);
      g.add(um);
      sign(g, "TOST · ÇAY", 2, 0.5, 0, 1.25, 0.52, "#f59e0b", "#1f2937");
      R.steam.push({ x: WP.x - 0.4, y: 1.5, z: WP.z });
      return;
    }
    if (lv === 2) {
      house(g, 6, 4, 3, "#fde68a", "#b91c1c", "gable", 0, 0);
      box(g, 4, 1, 0.8, "#78350f", 0, 0, 2.4);
      var aw = box(g, 6.4, 0.12, 1.8, "#dc2626", 0, 2.4, 2.6);
      aw.rotation.x = 0.25;
      sign(g, "KANTİN", 3, 0.7, 0, 3.2, 2.02, "#dc2626");
      R.steam.push({ x: WP.x + 2, y: 3.3, z: WP.z });
      return;
    }
    var w = lv >= 5 ? 13 : lv >= 4 ? 11 : 9, d = lv >= 5 ? 9 : 7, h = lv >= 5 ? 6.5 : 3.6;
    house(g, w, d, h, lv >= 6 ? "#1f2937" : lv >= 4 ? "#ecfccb" : "#fff7ed", lv >= 6 ? "#0f172a" : "#9a3412", lv >= 5 ? "flat" : "gable", 0, -1);
    door(g, 0, 0, d / 2 - 0.95);
    var names = { 3: "KAFETERYA", 4: "SPORCU KAFESİ", 5: "KULÜP RESTORANI", 6: "ŞEF'İN MASASI" };
    sign(g, names[lv], Math.min(w - 1, 6.5), 1.1, 0, h - 1, d / 2 - 0.94, lv >= 6 ? "#b45309" : kit.primary, "#ffffff");
    // dış masalar ve şemsiyeler
    for (var t = -1; t <= 1; t += 2) {
      cyl(g, 0.7, 0.7, 0.08, "#f8fafc", t * 3, 0.8, d / 2 + 2, 14);
      cyl(g, 0.06, 0.06, 0.8, "#475569", t * 3, 0, d / 2 + 2, 6);
      if (lv >= 4) {
        cyl(g, 0.04, 0.04, 2.6, "#94a3b8", t * 3, 0, d / 2 + 2, 6);
        var u2 = K.mesh(new T.ConeGeometry(1.6, 0.6, 8), mat(lv >= 6 ? "#f8fafc" : kit.primary, 0.7), true, false);
        u2.position.set(t * 3, 2.7, d / 2 + 2);
        g.add(u2);
      }
    }
    if (lv >= 5) {
      // teras ve ışık zinciri
      box(g, w + 1, 0.25, 3, "#a16207", 0, 0, d / 2 + 0.3);
      for (var l = 0; l < 10; l++) {
        var bulb = new T.Mesh(R.bulbGeo, R.bulbMat);
        bulb.position.set(-w / 2 + l * (w / 9), 3 - Math.sin((l / 9) * Math.PI) * 0.5, d / 2 + 1.6);
        g.add(bulb);
      }
    }
    if (lv >= 6) {
      // şef şapkalı baca + altın yıldız tabela
      cyl(g, 0.45, 0.45, 2, "#f8fafc", w / 2 - 1.5, h, -2, 10);
      R.steam.push({ x: WP.x + w / 2 - 1.5, y: h + 2.2, z: WP.z - 3 });
      var st = new T.Mesh(new T.CircleGeometry(0.8, 5), new T.MeshBasicMaterial({ color: 0xfacc15, toneMapped: false, side: T.DoubleSide }));
      st.position.set(-w / 2 + 1.2, h - 1, d / 2 - 0.9);
      st.rotation.z = Math.PI / 2;
      g.add(st);
    } else R.steam.push({ x: WP.x + w / 2 - 1.5, y: h + 0.4, z: WP.z - 2 });
  };

  BUILD.magaza = function (g, lv) {
    if (lv === 0) return emptyPlot(g);
    if (lv === 1) {
      box(g, 2.6, 0.9, 1.1, "#e2e8f0", 0, 0, 0);
      for (var i = 0; i < 3; i++) {
        var sh = new T.Mesh(new T.PlaneGeometry(0.8, 0.8), mat(i === 1 ? kit.secondary : kit.primary, 0.7, { side: T.DoubleSide }));
        sh.position.set(-0.9 + i * 0.9, 1.45, -0.3);
        g.add(sh);
      }
      box(g, 3, 0.08, 0.08, "#475569", 0, 1.9, -0.3);
      return;
    }
    if (lv === 2) {
      house(g, 4, 3, 2.6, "#ffffff", kit.primary, "flat", 0, 0);
      for (var s2 = 0; s2 < 6; s2++) {
        var sc = new T.Mesh(new T.PlaneGeometry(0.25, 1.3), mat(s2 % 2 ? kit.primary : kit.secondary, 0.8, { side: T.DoubleSide }));
        sc.position.set(-1.5 + s2 * 0.6, 1.6, 1.55);
        g.add(sc);
        R.flags.push(sc);
      }
      sign(g, "ATKI · BERE", 3, 0.6, 0, 2.3, 1.56, kit.primary);
      return;
    }
    var w = lv >= 5 ? 14 : lv >= 4 ? 11 : 8, d = lv >= 5 ? 10 : 7, h = lv >= 5 ? 7 : lv >= 4 ? 6 : 3.6;
    house(g, w, d, h, lv >= 5 ? "#dbeafe" : "#ffffff", kit.primary, "flat", 0, -1);
    // vitrin camı
    var glass = box(g, w - 1.2, Math.min(h - 1.4, 3), 0.1, new T.MeshStandardMaterial({ color: 0xa5d8ff, roughness: 0.05, metalness: 0.6, transparent: true, opacity: 0.55, emissive: 0xfff2c4, emissiveIntensity: 0 }), 0, 0.3, d / 2 - 0.95);
    R.nightMats.push(glass.material);
    sign(g, lv >= 5 ? "MEGASTORE" : lv >= 4 ? "TARAFTAR MAĞAZASI" : "KULÜP MAĞAZASI", Math.min(w - 1, 7), 1.1, 0, h - 0.9, d / 2 - 0.93, kit.primary);
    // vitrinde formalar
    for (var f = 0; f < Math.min(5, Math.floor(w / 2.4)); f++) {
      var jer = new T.Mesh(new T.PlaneGeometry(1.1, 1.2), mat(f % 2 ? kit.secondary : kit.primary, 0.8));
      jer.position.set(-w / 2 + 1.8 + f * 2.3, 1.8, d / 2 - 1.02);
      g.add(jer);
    }
    if (lv >= 5) {
      var scr = new T.Mesh(new T.PlaneGeometry(6, 2.6), new T.MeshBasicMaterial({ map: R.screenTex, toneMapped: false }));
      scr.position.set(w / 2 + 0.06, h - 2.5, 0);
      scr.rotation.y = Math.PI / 2;
      g.add(scr);
      R.queue.push({ x: WP.x, z: WP.z + d / 2 + 2.5, n: 7, line: true });
    }
  };

  BUILD.kulup = function (g, lv) {
    if (lv === 0) return emptyPlot(g);
    if (lv === 1) {
      box(g, 1.8, 0.8, 0.9, "#a16207", 0, 0, 0);
      box(g, 0.5, 0.05, 0.35, "#f8fafc", -0.3, 0.8, 0);
      cyl(g, 0.05, 0.05, 0.12, "#facc15", 0.4, 0.8, 0.1, 8);
      box(g, 0.5, 0.9, 0.5, "#1f2937", 0, 0, 1);
      return;
    }
    if (lv === 2) {
      house(g, 6, 4, 2.8, "#e5e7eb", "#475569", "flat", 0, 0);
      door(g, -1.5, 0, 2.05);
      sign(g, "KULÜP EVİ", 3, 0.7, 1, 2.1, 2.06, kit.primary);
      return;
    }
    var w = lv >= 6 ? 12 : lv >= 4 ? 12 : 9, d = lv >= 4 ? 9 : 7, h = lv >= 6 ? 16 : lv >= 4 ? 8 : 6;
    if (lv >= 6) {
      // cam cepheli genel merkez
      var glass = new T.MeshStandardMaterial({ color: 0x7fb6e8, roughness: 0.05, metalness: 0.7, envMapIntensity: 1.2, emissive: 0xfff2c4, emissiveIntensity: 0 });
      R.nightMats.push(glass);
      box(g, w, h, d, glass, 0, 0, 0);
      for (var fl = 1; fl < 5; fl++) box(g, w + 0.15, 0.25, d + 0.15, "#e2e8f0", 0, (fl * h) / 5, 0);
      box(g, w + 0.4, 0.5, d + 0.4, "#e2e8f0", 0, h, 0);
    } else house(g, w, d, h, lv >= 4 ? "#f8fafc" : "#fde7c7", lv >= 4 ? "#334155" : "#9a3412", lv >= 4 ? "flat" : "gable", 0, 0);
    door(g, 0, 0, d / 2 + 0.05);
    sign(g, lv >= 5 ? "KULÜP · MÜZE" : "KULÜP BİNASI", 5, 1, 0, Math.min(h - 1.3, 4.2), d / 2 + 0.07, kit.primary);
    // arma (dönen)
    var crest = new T.Group();
    var shield = new T.Shape();
    shield.moveTo(-1, 1);
    shield.lineTo(1, 1);
    shield.lineTo(1, -0.1);
    shield.quadraticCurveTo(1, -0.9, 0, -1.3);
    shield.quadraticCurveTo(-1, -0.9, -1, -0.1);
    shield.closePath();
    var sm = K.mesh(new T.ExtrudeGeometry(shield, { depth: 0.25, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.08, bevelSegments: 2 }), mat(kit.primary, 0.35), true, false);
    sm.geometry.translate(0, 0, -0.125);
    crest.add(sm);
    var ball = new T.Mesh(new T.SphereGeometry(0.45, 16, 12), new T.MeshStandardMaterial({ map: R.ballTex, roughness: 0.5 }));
    ball.position.z = 0.25;
    crest.add(ball);
    crest.position.set(0, h + (lv >= 6 ? 2.6 : 1.8), 0);
    crest.scale.setScalar(lv >= 6 ? 2 : 1.2);
    g.add(crest);
    R.spin.push(crest);
    if (lv >= 5) {
      // kupa vitrini
      var cup = new T.Group();
      cyl(cup, 0.35, 0.5, 0.3, "#facc15", 0, 0, 0, 12);
      cyl(cup, 0.08, 0.08, 0.5, "#facc15", 0, 0.3, 0, 8);
      var bowl = K.mesh(new T.CylinderGeometry(0.55, 0.25, 0.7, 16), new T.MeshStandardMaterial({ color: 0xfacc15, metalness: 0.9, roughness: 0.2 }), true, false);
      bowl.position.y = 1.15;
      cup.add(bowl);
      cup.position.set(-w / 2 - 2, 0.6, d / 2);
      box(g, 1.6, 0.6, 1.6, "#1f2937", -w / 2 - 2, 0, d / 2);
      g.add(cup);
      R.spin.push(cup);
    }
    // bayrak direkleri
    [-1, 0, 1].forEach(function (i) {
      cyl(g, 0.06, 0.06, 7, "#e2e8f0", i * 2.4, 0, d / 2 + 4, 6);
      var fl2 = new T.Mesh(new T.PlaneGeometry(1.8, 1.1), mat(i === 0 ? "#e30a17" : kit.primary, 0.7, { side: T.DoubleSide }));
      fl2.position.set(i * 2.4 + 0.9, 6.3, d / 2 + 4);
      g.add(fl2);
      R.flags.push(fl2);
    });
  };

  BUILD.saglik = function (g, lv) {
    if (lv === 0) return emptyPlot(g);
    var cross = function (x, y, z, s) {
      box(g, 0.35 * s, 1.1 * s, 0.1, "#dc2626", x, y - 0.55 * s, z);
      box(g, 1.1 * s, 0.35 * s, 0.1, "#dc2626", x, y - 0.18 * s, z);
    };
    if (lv === 1) {
      box(g, 0.8, 0.5, 0.5, "#f8fafc", 0, 0, 0);
      cross(0, 0.48, 0.26, 0.35);
      bench(g, 0, 1.4, 0, 2);
      return;
    }
    var w = lv >= 5 ? 14 : lv >= 4 ? 11 : lv >= 3 ? 8 : 5, d = lv >= 4 ? 9 : 5, h = lv >= 5 ? 9 : lv >= 4 ? 5 : 3;
    house(g, w, d, h, "#ffffff", lv >= 4 ? "#0ea5e9" : "#94a3b8", "flat", 0, 0);
    door(g, 0, 0, d / 2 + 0.05);
    cross(-w / 2 + 1.2, h - 0.4, d / 2 + 0.07, 1);
    sign(g, lv >= 5 ? "SPOR HASTANESİ" : lv >= 4 ? "REHABİLİTASYON" : lv >= 3 ? "FİZYOTERAPİ" : "REVİR", Math.min(5, w - 3), 0.8, 1, h - 0.9, d / 2 + 0.07, "#0ea5e9");
    if (lv >= 4) {
      var pool = plane(g, 5, 3, new T.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.05, transparent: true, opacity: 0.9 }), w / 2 + 3.2, 0.25, 0);
      box(g, 5.6, 0.25, 3.6, "#e2e8f0", w / 2 + 3.2, 0, 0);
      R.water.push(pool.material);
    }
    if (lv >= 5) {
      // helikopter pisti + ambulans
      cyl(g, 3, 3, 0.15, "#334155", 0, h, 0, 24);
      var hl = new T.Mesh(new T.PlaneGeometry(2.4, 2.4), new T.MeshBasicMaterial({ map: tex("helipad", 64, 64, function (c) { c.fillStyle = "#334155"; c.fillRect(0, 0, 64, 64); c.fillStyle = "#facc15"; c.font = "900 44px " + A.FONT; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText("H", 32, 35); }) }));
      hl.rotation.x = -Math.PI / 2;
      hl.position.y = h + 0.17;
      g.add(hl);
      var amb = new T.Group();
      box(amb, 2, 1.8, 4, "#f8fafc", 0, 0.4, 0);
      box(amb, 2.02, 0.3, 4.02, "#dc2626", 0, 1.3, 0);
      amb.position.set(-w / 2 - 2.5, 0, d / 2 + 1.5);
      g.add(amb);
      var siren = new T.Sprite(new T.SpriteMaterial({ map: K.glowTexture(), color: 0x60a5fa, transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
      siren.position.set(-w / 2 - 2.5, 2.6, d / 2 + 1.5);
      siren.scale.set(2, 2, 1);
      g.add(siren);
      R.sirens.push(siren);
    }
  };

  BUILD.medya = function (g, lv) {
    if (lv === 0) return emptyPlot(g);
    if (lv === 1) {
      // tripod + telefon
      for (var i = 0; i < 3; i++) {
        var leg = K.mesh(new T.CylinderGeometry(0.03, 0.03, 1.6, 6), mat("#111827"), true, false);
        var a = (i / 3) * Math.PI * 2;
        leg.position.set(Math.cos(a) * 0.3, 0.75, Math.sin(a) * 0.3);
        leg.rotation.set(Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35);
        g.add(leg);
      }
      box(g, 0.45, 0.8, 0.06, "#0b1020", 0, 1.45, 0);
      var rec = new T.Sprite(new T.SpriteMaterial({ map: K.glowTexture(), color: 0xff3355, transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
      rec.position.set(0.12, 2.15, 0.05);
      rec.scale.set(0.5, 0.5, 1);
      g.add(rec);
      R.sirens.push(rec);
      return;
    }
    if (lv === 2) {
      // çevirmeli skor tabelası
      cyl(g, 0.12, 0.12, 2.4, "#475569", -1.6, 0, 0, 8);
      cyl(g, 0.12, 0.12, 2.4, "#475569", 1.6, 0, 0, 8);
      var bt = tex("scoreflip", 256, 128, function (c) {
        c.fillStyle = "#14532d";
        c.fillRect(0, 0, 256, 128);
        c.fillStyle = "#ffffff";
        c.font = "900 30px " + A.FONT;
        c.textAlign = "center";
        c.fillText("EV   DEP", 128, 34);
        c.fillStyle = "#facc15";
        c.font = "900 64px " + A.FONT;
        c.fillText("2  –  1", 128, 104);
      });
      var b2 = new T.Mesh(new T.BoxGeometry(3.6, 1.8, 0.2), [mat("#14532d"), mat("#14532d"), mat("#14532d"), mat("#14532d"), new T.MeshStandardMaterial({ map: bt, roughness: 0.6 }), mat("#14532d")]);
      b2.position.y = 3.2;
      b2.castShadow = true;
      g.add(b2);
      return;
    }
    var w = lv >= 4 ? 9 : 7, d = 6, h = lv >= 4 ? 4 : 3.2;
    house(g, w, d, h, "#f1f5f9", "#1f2937", "flat", 0, 0);
    door(g, 0, 0, d / 2 + 0.05);
    sign(g, lv >= 5 ? "KULÜP TV" : lv >= 4 ? "BASIN · YAYIN" : "BASIN ODASI", 4.5, 0.8, 0, h - 0.8, d / 2 + 0.07, "#1f2937", "#facc15");
    if (lv >= 4) {
      // kafes yayın kulesi + dönen anten
      var tw = new T.Group();
      for (var y = 0; y < 5; y++) {
        [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]].forEach(function (q) {
          cyl(tw, 0.06, 0.06, 2.4, "#ef4444", q[0], y * 2.4, q[1], 5);
        });
        box(tw, 1.8, 0.1, 1.8, "#e2e8f0", 0, y * 2.4 + 2.35, 0);
      }
      var dish = K.mesh(new T.SphereGeometry(0.9, 16, 8, 0, Math.PI * 2, 0, Math.PI / 3), mat("#f8fafc", 0.4, { side: T.DoubleSide }), true, false);
      dish.rotation.x = -Math.PI / 2;
      dish.position.y = 12.6;
      tw.add(dish);
      tw.position.set(w / 2 + 2, 0, -1);
      g.add(tw);
      R.spin.push(dish);
      var beacon = new T.Sprite(new T.SpriteMaterial({ map: K.glowTexture(), color: 0xff3344, transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
      beacon.position.set(w / 2 + 2, 13.6, -1);
      beacon.scale.set(1.6, 1.6, 1);
      g.add(beacon);
      R.sirens.push(beacon);
    }
    if (lv >= 5)
      [-1, 1].forEach(function (s) {
        var dd = K.mesh(new T.SphereGeometry(1.2, 16, 8, 0, Math.PI * 2, 0, Math.PI / 3), mat("#f8fafc", 0.4, { side: T.DoubleSide }), true, false);
        dd.rotation.set(-1.1, 0, 0);
        dd.position.set(s * 2.5, h + 1.2, -1);
        g.add(dd);
      });
  };

  BUILD.antrenman = function (g, lv) {
    if (lv === 0) return emptyPlot(g, 24, 18);
    R.drills = { x: WP.x, z: WP.z, n: 3 + lv * 2, wide: lv >= 4 };
    var cones = function (n, x0, z0, dx) {
      for (var i = 0; i < n; i++) {
        var cone = K.mesh(R.coneGeo, mat(i % 2 ? "#f97316" : "#facc15", 0.6), true, false);
        cone.position.set(x0 + i * dx, 0.25, z0);
        g.add(cone);
      }
    };
    if (lv === 1) {
      plane(g, 20, 14, mat("#8f7a52", 0.95), 0, 0.02, 0);
      cones(6, -6, 0, 2.4);
      var bag = K.mesh(new T.SphereGeometry(0.6, 10, 8), mat("#1f2937", 0.8), true, false);
      bag.position.set(7, 0.5, 3);
      g.add(bag);
      return;
    }
    var fields = lv >= 4 ? 2 : 1;
    for (var f = 0; f < fields; f++) {
      var fx = fields === 2 ? (f ? 7 : -7) : 0;
      var P = { w: fields === 2 ? 12 : 22, d: 15 };
      plane(g, P.w, P.d, new T.MeshStandardMaterial({ map: pitchTexture(3, { w: 22, d: 13 }), roughness: 0.9 }), fx, 0.03, 0);
      goal(g, fx, -P.d / 2 + 0.6, 3.2, 1.8, 0, true, true);
    }
    cones(5, -6, 6.2, 3);
    if (lv >= 3) {
      // koordinasyon merdiveni + taktik tahtası
      for (var r = 0; r < 8; r++) box(g, 1, 0.04, 0.06, "#facc15", -8, 0, -4 + r * 0.6);
      box(g, 3, 1.8, 0.1, "#f8fafc", 9, 0.8, -7.2);
    }
    if (lv >= 4)
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (q) {
        flood(g, q[0] * 13, q[1] * 9, 9, q[0] * 6, 0);
      });
    if (lv >= 5) {
      // kapalı salon (yarım silindir)
      var hall = K.mesh(new T.CylinderGeometry(6, 6, 16, 24, 1, false, 0, Math.PI), mat("#e2e8f0", 0.5), true, true);
      hall.rotation.z = Math.PI / 2;
      hall.rotation.y = Math.PI / 2;
      hall.position.set(0, 0, -15);
      g.add(hall);
      sign(g, "KAPALI SALON", 6, 1, 0, 4.4, -9.4, kit.primary);
    }
    if (lv >= 6) {
      var pc = new T.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.15, metalness: 0.6, emissive: 0x22d3ee, emissiveIntensity: 0.2 });
      box(g, 8, 5, 6, pc, 16, 0, -12);
      sign(g, "PERFORMANS", 5, 0.9, 16, 3.6, -8.94, "#0f172a", "#22d3ee");
    }
  };

  BUILD.akademi = function (g, lv) {
    if (lv === 0) return emptyPlot(g, 24, 18);
    R.kids = { x: WP.x, z: WP.z, n: 4 + lv * 3 };
    if (lv === 1) {
      plane(g, 14, 9, mat("#a3a3a3", 0.95), 0, 0.02, 0);
      [-1, 1].forEach(function (s) {
        box(g, 0.5, 0.4, 0.35, "#2563eb", s * 6, 0, 0);
        box(g, 0.5, 0.4, 0.35, "#dc2626", s * 6, 0, 1.2);
      });
      return;
    }
    plane(g, 18, 12, new T.MeshStandardMaterial({ map: pitchTexture(lv >= 3 ? 5 : 2, { w: lv >= 3 ? 40 : 22, d: lv >= 3 ? 26 : 13 }), roughness: 0.9 }), 0, 0.03, 0);
    [-1, 1].forEach(function (s) {
      goal(g, s * 8.4, 0, 3, 1.6, s > 0 ? -Math.PI / 2 : Math.PI / 2, true, true);
    });
    if (lv >= 3) {
      house(g, 10, 6, 4, "#fef9c3", "#16a34a", "gable", 0, -11);
      sign(g, "AKADEMİ", 4, 0.8, 0, 3.2, -7.94, "#16a34a");
    }
    if (lv >= 4) {
      house(g, 8, 6, 8, "#e0f2fe", "#1d4ed8", "flat", 13, -9);
      sign(g, "YURT", 2.6, 0.8, 13, 7, -5.94, "#1d4ed8");
    }
  };

  BUILD.kamp = function (g, lv) {
    if (lv === 0) return emptyPlot(g, 22, 18);
    R.camp = { x: WP.x, z: WP.z, fire: lv === 1 };
    if (lv === 1) {
      [[-4, -2], [0, -4], [4, -2]].forEach(function (p, i) {
        var tent = K.mesh(new T.ConeGeometry(1.8, 2.2, 4), mat(i === 1 ? kit.primary : "#16a34a", 0.8), true, false);
        tent.position.set(p[0], 1.1, p[1]);
        tent.rotation.y = Math.PI / 4;
        g.add(tent);
      });
      // kamp ateşi
      for (var l = 0; l < 4; l++) {
        var log = K.mesh(new T.CylinderGeometry(0.1, 0.1, 1.2, 6), mat("#78350f"), true, false);
        log.rotation.set(Math.PI / 2, (l * Math.PI) / 4, 0);
        log.position.set(0, 0.12, 2);
        g.add(log);
      }
      var fire = new T.Sprite(new T.SpriteMaterial({ map: K.glowTexture(), color: 0xff9a3c, transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
      fire.position.set(0, 0.8, 2);
      fire.scale.set(2.6, 2.6, 1);
      g.add(fire);
      R.fires.push(fire);
      var pl = new T.PointLight(0xff8a3c, 2.5, 10, 2);
      pl.position.set(0, 1.2, 2);
      g.add(pl);
      R.fireLights.push(pl);
      return;
    }
    var w = lv >= 5 ? 18 : lv >= 4 ? 15 : lv >= 3 ? 11 : 8, d = lv >= 4 ? 8 : 7, h = lv >= 5 ? 13 : lv >= 4 ? 10 : lv >= 3 ? 6 : 5.5;
    house(g, w, d, h, lv >= 5 ? "#fafaf9" : lv >= 4 ? "#f1f5f9" : "#fef3c7", lv >= 4 ? "#0f766e" : "#9a3412", lv >= 4 ? "flat" : "gable", 0, -3);
    door(g, 0, 0, d / 2 - 2.95);
    sign(g, lv >= 5 ? "ELİT KAMP RESORT" : lv >= 4 ? "KAMP OTELİ" : lv >= 3 ? "KAMP EVİ" : "PANSİYON", Math.min(w - 2, 6), 1, 0, h - 1, d / 2 - 2.94, lv >= 4 ? "#0f766e" : "#9a3412");
    if (lv >= 4) for (var b2 = 1; b2 < h / 3.2; b2++) box(g, w + 0.4, 0.15, 1, "#e2e8f0", 0, b2 * 3.2, d / 2 - 2.6);
    if (lv >= 5) {
      var pool = plane(g, 9, 4.5, new T.MeshStandardMaterial({ color: 0x22d3ee, roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.92 }), 0, 0.26, 6);
      box(g, 10, 0.25, 5.5, "#f5f5f4", 0, 0, 6);
      R.water.push(pool.material);
      [-1, 1].forEach(function (s) {
        tree(g, s * 7, 6, 0.8, "#16a34a");
        var palm = K.mesh(new T.ConeGeometry(1.4, 0.6, 7), mat("#22c55e"), true, false);
        palm.position.set(s * 5.5, 3.2, 8.5);
        g.add(palm);
        cyl(g, 0.12, 0.18, 3, "#a16207", s * 5.5, 0, 8.5, 6);
      });
    }
  };

  BUILD.ulasim = function (g, lv) {
    if (lv === 0) return emptyPlot(g, 22, 18);
    if (lv === 1) {
      box(g, 4, 0.1, 1.5, "#94a3b8", 0, 0, 0);
      for (var i = 0; i < 5; i++) {
        var bike = new T.Group();
        [-0.45, 0.45].forEach(function (z) {
          var wh = K.mesh(new T.TorusGeometry(0.32, 0.04, 6, 14), mat("#111827"), true, false);
          wh.position.set(0, 0.34, z);
          wh.rotation.y = Math.PI / 2;
          bike.add(wh);
        });
        box(bike, 0.06, 0.06, 0.9, ["#ef4444", "#3b82f6", "#22c55e", "#f59e0b", kit.primary][i], 0, 0.55, 0);
        bike.position.set(-1.6 + i * 0.8, 0, 0);
        g.add(bike);
      }
      return;
    }
    plane(g, 20, 14, mat(lv >= 4 ? "#334155" : "#a8a29e", 0.95), 0, 0.03, 0);
    if (lv >= 4)
      for (var s = 0; s < 6; s++) {
        var line = new T.Mesh(new T.PlaneGeometry(0.12, 4), new T.MeshBasicMaterial({ color: 0xffffff }));
        line.rotation.x = -Math.PI / 2;
        line.position.set(-7.5 + s * 3, 0.05, -4);
        g.add(line);
      }
    var carCols = ["#ef4444", "#3b82f6", "#f8fafc", "#111827", "#f59e0b", "#22c55e"];
    for (var c = 0; c < (lv >= 4 ? 5 : 3); c++) carMesh(g, carCols[c], -6 + c * 3, -4, 0);
    if (lv >= 3) vehicle(g, lv >= 5 ? "bus" : "minibus", 5, 3.5, Math.PI / 2);
    if (lv >= 6) {
      // metro durağı: kanopi + iniş merdiveni
      box(g, 8, 0.25, 4, "#e2e8f0", -4, 3, 4.5);
      [-1, 1].forEach(function (q) {
        cyl(g, 0.12, 0.12, 3, "#94a3b8", -4 + q * 3.6, 0, 4.5 + 1.6, 8);
      });
      sign(g, "M  STADYUM", 4, 0.8, -4, 3.7, 6.52, "#dc2626");
      R.metro = true;
    }
  };

  function carMesh(g, color, x, z, ry) {
    var car = new T.Group();
    box(car, 1.7, 0.7, 3.4, color, 0, 0.3, 0, 0.35);
    box(car, 1.5, 0.6, 1.8, mat("#9cc9ef", 0.1, { metalness: 0.5 }), 0, 1.0, -0.2);
    [[-0.85, -1.1], [0.85, -1.1], [-0.85, 1.1], [0.85, 1.1]].forEach(function (q) {
      var wh = K.mesh(R.wheelGeo, mat("#111827"), true, false);
      wh.position.set(q[0], 0.32, q[1]);
      car.add(wh);
    });
    car.position.set(x, 0, z);
    car.rotation.y = ry || 0;
    g.add(car);
    return car;
  }
  function vehicle(g, kind, x, z, ry) {
    var v = new T.Group();
    var L = kind === "bus" ? 9 : 5;
    var bodyTex = tex("bus:" + kit.primary + kind, 512, 128, function (c) {
      c.fillStyle = kit.primary;
      c.fillRect(0, 0, 512, 128);
      c.fillStyle = "#9cc9ef";
      for (var i = 0; i < (kind === "bus" ? 7 : 4); i++) c.fillRect(20 + i * (kind === "bus" ? 70 : 120), 18, kind === "bus" ? 56 : 100, 46);
      c.fillStyle = kit.secondary;
      c.fillRect(0, 78, 512, 10);
      c.font = "900 30px " + A.FONT;
      c.fillStyle = kit.secondary;
      c.textAlign = "center";
      c.fillText("ELİTLİG", 256, 116);
    });
    var bm = new T.MeshStandardMaterial({ map: bodyTex, roughness: 0.35 });
    var body = new T.Mesh(new T.BoxGeometry(2.3, kind === "bus" ? 2.8 : 2, L), [bm, bm, mat(kit.primary), mat(kit.primary), mat(kit.primary), mat(kit.primary)]);
    body.position.y = (kind === "bus" ? 2.8 : 2) / 2 + 0.45;
    body.castShadow = true;
    v.add(body);
    [-1, 1].forEach(function (s) {
      [-L / 2 + 1.2, L / 2 - 1.2].forEach(function (zz) {
        var wh = K.mesh(R.wheelGeo, mat("#111827"), true, false);
        wh.position.set(s * 1.1, 0.4, zz);
        wh.scale.setScalar(1.3);
        v.add(wh);
      });
    });
    v.position.set(x, 0, z);
    v.rotation.y = ry || 0;
    g.add(v);
    return v;
  }

  /** Boş arsa: tahta çit + "inşaat alanı" tabelası. */
  function emptyPlot(g, w, d) {
    w = w || 18;
    d = d || 15;
    plane(g, w, d, mat("#a98a62", 0.95), 0, 0.025, 0);
    for (var i = 0; i < 6; i++) {
      var st = K.mesh(new T.DodecahedronGeometry(0.3 + (i % 3) * 0.15, 0), mat("#8b8f96", 0.9), true, false);
      st.position.set(-w / 3 + i * (w / 7), 0.2, (i % 2 ? -1 : 1) * d * 0.25);
      g.add(st);
    }
    cyl(g, 0.08, 0.08, 1.8, "#7a5536", 0, 0, d / 2 - 1, 6);
    var s = sign(g, "İNŞAAT ALANI", 3.4, 1, 0, 2.1, d / 2 - 0.9, "#facc15", "#1f2937");
    s.material.emissiveIntensity = 0;
  }

  /* ─────────────── dünya ─────────────── */

  function initGL() {
    if (R || glFailed) return;
    try {
      R = G3.stage({ theme: themeNow(), fog: [140, 330], far: 700, shadow: { size: 2048, box: [-70, 70, 70, -70], far: 260, dist: 130 }, fxMax: 700, dustMax: 500 });
      if (!R) {
        glFailed = true;
        return;
      }
      R.renderer.shadowMap.autoUpdate = true;
      R.groups = {};
      R.flags = [];
      R.spin = [];
      R.steam = [];
      R.water = [];
      R.queue = [];
      R.sirens = [];
      R.fires = [];
      R.fireLights = [];
      R.nightMats = [];
      R.glowSigns = [];
      R.floodGlows = [];
      R.construct = {};
      R.leafGeo = new T.IcosahedronGeometry(1, 1);
      R.coneGeo = new T.ConeGeometry(0.22, 0.5, 10);
      R.wheelGeo = new T.CylinderGeometry(0.32, 0.32, 0.25, 12);
      R.wheelGeo.rotateZ(Math.PI / 2);
      R.bulbGeo = new T.SphereGeometry(0.12, 8, 6);
      R.bulbMat = new T.MeshBasicMaterial({ color: 0xffe9a8, toneMapped: false });
      R.lampMat = new T.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
      R.glowMat = new T.SpriteMaterial({ map: K.glowTexture(), color: 0xfff1d6, transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: 0 });
      R.netTex = A.S3.netTexture();
      R.ballTex = A.S3.ballTexture();
      R.crowdTex = G3.crowdTexture(kit, { primary: "#e2e8f0", secondary: "#334155" });
      R.ledTex = K.canvasTex(1024, 32, function (c) {
        var g = c.createLinearGradient(0, 0, 1024, 0);
        g.addColorStop(0, "#5B3DF5");
        g.addColorStop(1, "#2A1680");
        c.fillStyle = g;
        c.fillRect(0, 0, 1024, 32);
        c.fillStyle = "#fff";
        c.font = "900 22px " + A.FONT;
        c.textBaseline = "middle";
        for (var x = 0; x < 1024; x += 256) c.fillText("ELİTLİG  •  KULÜP ŞEHRİ", x + 10, 17);
      }, true);
      R.ledTex.repeat.set(3, 1);
      R.screenTex = K.canvasTex(512, 192, function () {});
      R.crowd = G3.minis(R, 240);
      R.balls = G3.balls(R, 16, 0.2);
      buildWorld();
      ORDER.forEach(function (k) {
        rebuild(k, false);
      });
    } catch (e) {
      A.glError = String((e && e.stack) || e);
      R = null;
      glFailed = true;
    }
  }

  function themeNow() {
    var h = new Date().getHours();
    return h >= 7 && h < 17 ? "day" : h >= 17 && h < 20 ? "sunset" : "night";
  }

  function buildWorld() {
    var s = R.scene;
    // ada: çim + kenarda kum + su
    var grass = G3.turfTexture(8, 8, "#5aa856", "#61b05c", 64);
    grass.repeat.set(12, 12);
    var ground = K.mesh(new T.PlaneGeometry(190, 180), K.std(0xffffff, 0.95, 0, { map: grass, envMapIntensity: 0.25 }), false, true);
    ground.rotation.x = -Math.PI / 2;
    s.add(ground);
    var sand = K.mesh(new T.CircleGeometry(150, 48), K.std(0xe9d8a6, 0.95), false, true);
    sand.rotation.x = -Math.PI / 2;
    sand.position.y = -0.08;
    s.add(sand);
    var water = new T.Mesh(new T.PlaneGeometry(900, 900), new T.MeshStandardMaterial({ color: 0x2c8bd6, roughness: 0.12, metalness: 0.3, envMapIntensity: 1 }));
    water.rotation.x = -Math.PI / 2;
    water.position.y = -0.3;
    s.add(water);
    R.sea = water.material;
    // yollar: stadyum çevresinde halka + arsalara kollar
    var road = mat("#475569", 0.9);
    var walk = mat("#d6d3d1", 0.9);
    function strip(x, z, w, d, m, y) {
      var p = new T.Mesh(new T.PlaneGeometry(w, d), m);
      p.rotation.x = -Math.PI / 2;
      p.position.set(x, y || 0.012, z);
      p.receiveShadow = true;
      s.add(p);
    }
    var RX = 37, RZN = -34, RZS = 41;
    strip(-RX, (RZN + RZS) / 2, 6, RZS - RZN + 6, walk, 0.03);
    strip(RX, (RZN + RZS) / 2, 6, RZS - RZN + 6, walk, 0.03);
    strip(0, RZN, RX * 2 + 6, 6, walk, 0.03);
    strip(0, RZS, RX * 2 + 6, 6, walk, 0.03);
    strip(-RX, (RZN + RZS) / 2, 4.4, RZS - RZN + 4.4, road, 0.08);
    strip(RX, (RZN + RZS) / 2, 4.4, RZS - RZN + 4.4, road, 0.08);
    strip(0, RZN, RX * 2 + 4.4, 4.4, road, 0.08);
    strip(0, RZS, RX * 2 + 4.4, 4.4, road, 0.08);
    // şerit çizgileri
    var dash = new T.MeshBasicMaterial({ color: 0xf8fafc });
    for (var i = RZN; i < RZS; i += 4) {
      strip(-RX, i, 0.15, 1.8, dash, 0.13);
      strip(RX, i, 0.15, 1.8, dash, 0.13);
    }
    for (var j = -RX; j < RX; j += 4) {
      strip(j, RZN, 1.8, 0.15, dash, 0.13);
      strip(j, RZS, 1.8, 0.15, dash, 0.13);
    }
    R.roadLoop = { x: RX, zn: RZN, zs: RZS };
    // ağaçlar ve sokak lambaları
    var rnd = A.seeded(42);
    for (var t = 0; t < 70; t++) {
      var a = rnd() * Math.PI * 2, r = 78 + rnd() * 18;
      treeAt(Math.cos(a) * r, Math.sin(a) * r * 0.95, 0.8 + rnd() * 0.8);
    }
    [[-RX - 3.6, -20], [-RX - 3.6, 0], [-RX - 3.6, 20], [RX + 3.6, -20], [RX + 3.6, 0], [RX + 3.6, 20], [-20, RZS + 3.6], [20, RZS + 3.6], [-20, RZN - 3.6], [20, RZN - 3.6]].forEach(function (p) {
      lampPost(p[0], p[1]);
    });
    // uzak tepeler
    for (var hI = 0; hI < 14; hI++) {
      var ang = (hI / 14) * Math.PI * 2, rr = 260 + (hI % 3) * 30;
      var hill = new T.Mesh(new T.ConeGeometry(40 + (hI % 4) * 12, 26 + (hI % 5) * 9, 7), new T.MeshLambertMaterial({ color: hI % 2 ? 0x4b8f5a : 0x5f9e6a }));
      hill.position.set(Math.cos(ang) * rr, 0, Math.sin(ang) * rr);
      s.add(hill);
    }
    // arsalar için gruplar
    ORDER.forEach(function (k) {
      var g = new T.Group();
      g.position.set(k === "tribun" ? 0 : PLOTS[k].x, 0, k === "tribun" ? 0 : PLOTS[k].z);
      s.add(g);
      R.groups[k] = g;
    });
    R.school = new T.Group();
    s.add(R.school);
    // vinç (inşaat sırasında görünür)
    R.crane = buildCrane();
    R.crane.visible = false;
    s.add(R.crane);
    R.scaffold = new T.Group();
    R.scaffold.visible = false;
    s.add(R.scaffold);
    // yoldaki arabalar
    R.cars = [];
    var cols = ["#ef4444", "#3b82f6", "#f8fafc", "#f59e0b"];
    for (var c = 0; c < 4; c++) {
      var g2 = new T.Group();
      s.add(g2);
      carMesh(g2, cols[c], 0, 0, 0);
      R.cars.push({ g: g2, u: c / 4, speed: 0.018 + c * 0.003 });
    }
    R.bus = new T.Group();
    s.add(R.bus);
    R.busMade = false;
    R.train = null;
  }
  function treeAt(x, z, s2) {
    var g = new T.Group();
    R.scene.add(g);
    tree(g, x, z, s2);
  }
  function lampPost(x, z) {
    var g = new T.Group();
    cyl(g, 0.08, 0.1, 5, "#334155", 0, 0, 0, 6);
    var head = new T.Mesh(new T.SphereGeometry(0.3, 10, 8), R.bulbMat);
    head.position.y = 5.1;
    g.add(head);
    var gl = new T.Sprite(R.glowMat);
    gl.scale.set(4, 4, 1);
    gl.position.y = 5.1;
    g.add(gl);
    g.position.set(x, 0, z);
    R.scene.add(g);
  }
  function buildCrane() {
    var g = new T.Group();
    var y = mat("#facc15", 0.5);
    for (var i = 0; i < 8; i++) {
      [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]].forEach(function (q) {
        var m = K.mesh(new T.BoxGeometry(0.12, 2, 0.12), y, true, false);
        m.position.set(q[0], i * 2 + 1, q[1]);
        g.add(m);
      });
      var b = K.mesh(new T.BoxGeometry(1.1, 0.1, 1.1), y, true, false);
      b.position.y = i * 2 + 2;
      g.add(b);
    }
    var jib = new T.Group();
    var arm = K.mesh(new T.BoxGeometry(18, 0.6, 0.6), y, true, false);
    arm.position.x = 6;
    jib.add(arm);
    var cw = K.mesh(new T.BoxGeometry(2, 1.4, 1.2), mat("#475569"), true, false);
    cw.position.x = -3;
    jib.add(cw);
    var cab = K.mesh(new T.BoxGeometry(1.2, 1, 1.2), mat("#f8fafc"), true, false);
    cab.position.set(0.8, -0.8, 0);
    jib.add(cab);
    var cable = K.mesh(new T.BoxGeometry(0.05, 6, 0.05), mat("#111827"), false, false);
    cable.position.set(12, -3, 0);
    jib.add(cable);
    var hook = K.mesh(new T.BoxGeometry(1.4, 0.8, 1.4), mat(kit.primary), true, false);
    hook.position.set(12, -6.4, 0);
    jib.add(hook);
    jib.position.y = 16.5;
    g.add(jib);
    g.userData.jib = jib;
    g.userData.hook = hook;
    g.userData.cable = cable;
    return g;
  }
  function buildScaffold(key) {
    var sc = R.scaffold;
    while (sc.children.length) sc.remove(sc.children[0]);
    var p = key === "tribun" || key === "saha" ? { x: 0, z: 0 } : PLOTS[key];
    var big = key === "tribun" || key === "saha";
    var w = big ? 34 : 14, d = big ? 24 : 11, h = big ? 10 : 7;
    var pipe = mat("#94a3b8", 0.4);
    var plank = mat("#b45309", 0.8);
    for (var x = -w / 2; x <= w / 2 + 0.01; x += big ? 4 : 2.2)
      [-d / 2, d / 2].forEach(function (z) {
        var m = K.mesh(new T.CylinderGeometry(0.06, 0.06, h, 5), pipe, false, false);
        m.position.set(x, h / 2, z);
        sc.add(m);
      });
    for (var y = 2; y < h; y += 2.5)
      [-d / 2, d / 2].forEach(function (z) {
        var b = K.mesh(new T.BoxGeometry(w, 0.12, 0.9), plank, false, false);
        b.position.set(0, y, z);
        sc.add(b);
      });
    var net = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ color: 0x16a34a, transparent: true, opacity: 0.28, side: T.DoubleSide, depthWrite: false }));
    net.position.set(0, h / 2, d / 2 + 0.3);
    sc.add(net);
    sc.position.set(p.x, 0, p.z);
    R.crane.position.set(p.x + (big ? -22 : -9), 0, p.z + (big ? -16 : -7));
  }

  /** Birimi baştan kurar; animate: inşaat sahnesi. */
  function rebuild(key, animate) {
    var g = R.groups[key];
    if (!g) return;
    // eski efekt kayıtlarını bu birim için temizle
    ["flags", "spin", "steam", "water", "queue", "sirens", "fires", "fireLights", "nightMats", "glowSigns", "floodGlows"].forEach(function (list) {
      R[list] = R[list].filter(function (item) {
        return item.__owner !== key;
      });
    });
    var mark = function (list, from) {
      for (var i = from; i < R[list].length; i++) if (R[list][i] && typeof R[list][i] === "object") R[list][i].__owner = key;
    };
    var counts = {};
    ["flags", "spin", "steam", "water", "queue", "sirens", "fires", "fireLights", "nightMats", "glowSigns", "floodGlows"].forEach(function (list) {
      counts[list] = R[list].length;
    });
    var old = g.userData.inner;
    if (old) {
      g.remove(old);
      K.disposeTree(old);
    }
    if (key === "antrenman") R.drills = null;
    if (key === "akademi") R.kids = null;
    if (key === "kamp") R.camp = null;
    if (key === "ulasim") R.metro = false;
    if (key === "saha" && R.heat) R.heat = null;
    if (key === "tribun") R.arenaRing = null;
    var inner = new T.Group();
    g.add(inner);
    g.userData.inner = inner;
    WP = { x: g.position.x, z: g.position.z };
    BUILD[key](inner, levels[key]);
    Object.keys(counts).forEach(function (list) {
      mark(list, counts[list]);
    });
    if (key === "saha") {
      // okul: çim sahaya kadar
      while (R.school.children.length) {
        var c = R.school.children[0];
        R.school.remove(c);
        K.disposeTree(c);
      }
      if (levels.saha < 5) buildSchool(R.school);
      if (levels.tribun > 0 && !animate) rebuild("tribun", false);
    }
    if (key === "ulasim") rebuildBus();
    if (animate) {
      R.construct = { key: key, at: A.time, inner: inner };
      buildScaffold(key);
      inner.scale.set(1, 0.001, 1);
      A.sound("place");
      A.haptic("medium");
    }
  }
  function rebuildBus() {
    while (R.bus.children.length) R.bus.remove(R.bus.children[0]);
    if (levels.ulasim >= 5) vehicle(R.bus, "bus", 0, 0, 0);
    else if (levels.ulasim >= 3) vehicle(R.bus, "minibus", 0, 0, 0);
    if (levels.ulasim >= 6 && !R.train) {
      R.train = new T.Group();
      for (var i = 0; i < 4; i++) {
        var car = new T.Group();
        box(car, 3, 3, 9, "#e2e8f0", 0, 0.6, 0, 0.3);
        box(car, 3.05, 0.6, 9.05, "#dc2626", 0, 2.6, 0);
        box(car, 3.06, 1, 7, mat("#93c5fd", 0.1), 0, 1.6, 0);
        car.position.z = i * 9.6;
        R.train.add(car);
      }
      R.scene.add(R.train);
      // ray: yüksek köprü
      var rail = new T.Mesh(new T.BoxGeometry(4, 0.6, 400), mat("#94a3b8"));
      rail.position.set(78, 5.5, 0);
      rail.castShadow = true;
      R.scene.add(rail);
      for (var p = -180; p <= 180; p += 20) cyl(R.scene, 0.6, 0.6, 5.5, "#cbd5e1", 78, 0, p, 8);
    }
  }

  /* ─────────────── canlılar ─────────────── */

  var match = null;
  function resetMatch() {
    var P = pitchSize();
    match = { ball: { x: 0, z: 0, y: 0, vx: 0, vz: 0, vy: 0, spin: 0 }, players: [], P: P, lv: levels.saha };
    var n = P.players;
    for (var i = 0; i < n; i++) {
      var team = i % 2;
      match.players.push({
        team: team,
        x: (team ? 1 : -1) * A.rand(1, P.w / 2 - 2),
        z: A.rand(-P.d / 2 + 1.5, P.d / 2 - 1.5),
        home: { x: (team ? 1 : -1) * (2 + (i % 5) * (P.w / 12)), z: ((i % 3) - 1) * (P.d / 3.4) },
        phase: Math.random() * 6,
        kick: -9,
        keeper: i < 2 && P.players >= 10,
      });
    }
  }
  function stepMatch(dt) {
    var P = pitchSize();
    if (!match || match.P !== P || match.lv !== levels.saha) resetMatch();
    var b = match.ball;
    b.vy -= 18 * dt;
    b.x += b.vx * dt;
    b.z += b.vz * dt;
    b.y = Math.max(0.2, b.y + b.vy * dt);
    if (b.y <= 0.2 && b.vy < 0) b.vy *= -0.45;
    var f = Math.exp(-(b.y <= 0.25 ? 1.4 : 0.3) * dt);
    b.vx *= f;
    b.vz *= f;
    b.spin += Math.hypot(b.vx, b.vz) * dt * 4;
    var hw = P.w / 2 - 0.8, hd = P.d / 2 - 0.8;
    if (Math.abs(b.x) > hw) {
      if (Math.abs(b.z) < 1.4 && b.y < 2) {
        // GOL
        goalFx(Math.sign(b.x) * hw, b.z);
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
    // en yakın oyuncu topa koşar, diğerleri mevkiine döner (topa göre kayar)
    var near = [null, null], nd = [1e9, 1e9];
    match.players.forEach(function (p) {
      var d = Math.hypot(p.x - b.x, p.z - b.z);
      if (!p.keeper && d < nd[p.team]) {
        nd[p.team] = d;
        near[p.team] = p;
      }
    });
    match.players.forEach(function (p) {
      var tx, tz;
      if (p.keeper) {
        tx = (p.team ? 1 : -1) * (hw - 0.6);
        tz = A.clamp(b.z * 0.4, -1.5, 1.5);
      } else if (near[p.team] === p) {
        tx = b.x;
        tz = b.z;
      } else {
        tx = p.home.x + b.x * 0.45;
        tz = p.home.z + b.z * 0.4;
      }
      var dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
      var sp = near[p.team] === p ? 4.6 : 2.4;
      p.moving = d > 0.4;
      if (p.moving) {
        p.x += (dx / d) * Math.min(d, sp * dt);
        p.z += (dz / d) * Math.min(d, sp * dt);
        p.ry = Math.atan2(dx, dz);
      }
      p.phase += dt * (p.moving ? sp * 2.4 : 2);
      if (near[p.team] === p && d < 0.7 && A.time - p.kick > 0.6 && b.y < 0.6) {
        p.kick = A.time;
        var goalX = p.team ? -hw : hw;
        var shoot = Math.abs(goalX - b.x) < P.w * 0.35;
        var ang = Math.atan2(A.rand(-2, 2) - b.z, goalX - b.x) + (shoot ? 0 : A.rand(-0.9, 0.9));
        var pw = shoot ? A.rand(10, 14) : A.rand(5, 9);
        b.vx = Math.cos(ang) * pw;
        b.vz = Math.sin(ang) * pw;
        b.vy = shoot ? A.rand(1, 4) : A.rand(0, 2.5);
      }
    });
  }
  function goalFx(x, z) {
    if (!R) return;
    R.fx.burst(36, { x: x, y: 1.4, z: z, speed: 7, life: 1, size: 0.5, color: [kit.primary, kit.secondary, "#facc15"], gravity: 6 });
    R.goalAt = A.time;
  }

  var walkers = null;
  function people(dt) {
    var cr = R.crowd;
    var L = function (seed, k) {
      return looks[(seed * 7 + (k || 0)) % looks.length];
    };
    // maç
    var pitchY = 0.03;
    match.players.forEach(function (p, i) {
      var kids = levels.saha === 0;
      cr.add({ x: p.x, y: pitchY, z: p.z, ry: p.ry || 0, s: kids ? 0.95 : 1.2, anim: A.time - p.kick < 0.4 ? "kick" : p.moving ? "run" : p.keeper ? "keeper" : "ready", t: A.time - p.kick < 0.4 ? (A.time - p.kick) / 0.4 : p.phase, look: kids ? (p.team ? looks.schoolA : looks.schoolB) : p.keeper ? looks.keeper : p.team ? looks.away : looks.home[i % looks.home.length] });
    });
    if (pitchSize().players >= 22) cr.add({ x: match.ball.x * 0.6 + 2, y: pitchY, z: match.ball.z * 0.5 - 3, ry: 0, s: 1.2, anim: "walk", t: A.time * 4, look: looks.ref });
    R.balls.add(match.ball.x, match.ball.y, match.ball.z, match.ball.spin, 1);
    // tribün
    var cheer = R.goalAt && A.time - R.goalAt < 3;
    (R.standSpots || []).forEach(function (s, i) {
      cr.add({ x: s.x, y: s.y || 0, z: s.z, ry: s.ry, s: 1.15, anim: cheer ? "cheer" : s.sit ? "idle" : "idle", t: A.time * (cheer ? 2 : 1) + i, look: L(i, 3), sy: s.sit ? 0.82 : 1 });
    });
    // kuyruklar (kantin, mağaza)
    R.queue.forEach(function (q, qi) {
      for (var k = 0; k < q.n; k++) {
        var wob = Math.sin(A.time * 0.8 + k) * 0.1;
        cr.add({ x: q.x - 1 + k * 0.05 + wob, y: 0, z: q.z + k * 1.0, ry: Math.PI, s: 1.1, anim: k === 0 ? "idle" : "idle", t: A.time + k * 1.3 + qi, look: L(k + qi * 5, 1) });
      }
    });
    // antrenman: koni slalomu
    if (R.drills) {
      var d = R.drills;
      for (var t = 0; t < d.n; t++) {
        var u = (A.time * 0.18 + t / d.n) % 1;
        var px = d.x - 8 + u * 16, pz = d.z + 6.2 + Math.sin(u * Math.PI * 6) * 1.1;
        if (t % 3 === 2) {
          px = d.x + Math.cos(A.time * 0.9 + t) * 5;
          pz = d.z - 1 + Math.sin(A.time * 0.9 + t) * 3.5;
        }
        cr.add({ x: px, y: 0, z: pz, ry: t % 3 === 2 ? A.time * 0.9 + t + Math.PI / 2 : Math.PI / 2, s: 1.15, anim: "run", t: A.time * 9 + t, look: looks.training });
      }
      // antrenör
      cr.add({ x: d.x + 9, y: 0, z: d.z + 3, ry: -Math.PI / 2, s: 1.2, anim: "idle", t: A.time, look: looks.coach });
    }
    // akademi: çocuklar top peşinde
    if (R.kids) {
      var kd = R.kids;
      for (var c = 0; c < kd.n; c++) {
        var a = A.time * (0.5 + (c % 3) * 0.12) + c * 1.7;
        cr.add({ x: kd.x + Math.cos(a) * (2 + (c % 4)), y: 0, z: kd.z + Math.sin(a * 1.3) * 3, ry: a + Math.PI / 2, s: 0.85, anim: "run", t: A.time * 10 + c, look: c % 2 ? looks.schoolA : looks.home[0] });
      }
      R.balls.add(kd.x + Math.cos(A.time * 0.6) * 3, 0.2, kd.z + Math.sin(A.time * 0.8) * 2, A.time * 6, 0.8);
    }
    // kamp: ateş başında oturan takım ya da otel önünde yürüyen
    if (R.camp) {
      var cp = R.camp;
      if (cp.fire)
        for (var s2 = 0; s2 < 6; s2++) {
          var aa = (s2 / 6) * Math.PI * 2;
          cr.add({ x: cp.x + Math.cos(aa) * 2.2, y: 0, z: cp.z + 2 + Math.sin(aa) * 2.2, ry: Math.atan2(-Math.cos(aa), -Math.sin(aa)), s: 1.1, anim: s2 === 0 ? "cheer" : "idle", t: A.time * (s2 === 0 ? 0.6 : 1) + s2, look: looks.home[s2 % looks.home.length], sy: 0.78 });
        }
      else
        for (var w2 = 0; w2 < 4; w2++) {
          var uu = (A.time * 0.06 + w2 / 4) % 1;
          cr.add({ x: cp.x - 8 + uu * 16, y: 0, z: cp.z + 3 + (w2 % 2) * 1.2, ry: Math.PI / 2, s: 1.1, anim: "walk", t: A.time * 6 + w2, look: looks.home[w2 % looks.home.length] });
        }
    }
    // kaldırımda yürüyenler
    if (!walkers) {
      walkers = [];
      for (var k2 = 0; k2 < 10; k2++) walkers.push({ u: Math.random(), sp: 0.004 + Math.random() * 0.004, side: k2 % 2 ? 1 : -1, look: k2 });
    }
    walkers.forEach(function (w) {
      w.u = (w.u + w.sp * dt * (w.side > 0 ? 1 : -1) + 1) % 1;
      var p = loopPoint(w.u, 3.4);
      cr.add({ x: p.x, y: 0, z: p.z, ry: p.ry + (w.side > 0 ? 0 : Math.PI), s: 1.1, anim: "walk", t: A.time * 6 + w.look, look: L(w.look, 2) });
    });
  }
  /** Çevre yolu üstünde u ∈ [0,1) noktası (saat yönü); off: yol merkezinden dışa kayma. */
  function loopPoint(u, off) {
    var rl = R.roadLoop, X = rl.x + (off || 0), ZN = rl.zn - (off || 0), ZS = rl.zs + (off || 0);
    var wTop = 2 * X, hSide = ZS - ZN, per = 2 * wTop + 2 * hSide;
    var d = u * per;
    if (d < wTop) return { x: -X + d, z: ZN, ry: Math.PI / 2 };
    d -= wTop;
    if (d < hSide) return { x: X, z: ZN + d, ry: 0 };
    d -= hSide;
    if (d < wTop) return { x: X - d, z: ZS, ry: -Math.PI / 2 };
    d -= wTop;
    return { x: -X, z: ZS - d, ry: Math.PI };
  }

  var looks = null, lookKey = "";
  function refreshLooks() {
    var key = kit.primary + kit.secondary;
    if (key === lookKey && looks) return;
    lookKey = key;
    looks = [0, 1, 2, 3, 4, 5, 6, 7].map(function (i) {
      return G3.look({ primary: ["#e2e8f0", "#334155", "#f97316", "#0ea5e9", kit.primary, "#16a34a", "#f43f5e", "#a855f7"][i], secondary: "#1f2937" }, i * 31 + 3);
    });
    looks.home = [0, 1, 2, 3].map(function (i) {
      return G3.look(kit, i * 17 + 1);
    });
    looks.away = G3.look({ primary: "#f8fafc", secondary: "#111827" }, 9);
    looks.keeper = G3.look({ primary: "#facc15", secondary: "#111827" }, 4);
    looks.ref = G3.look({ primary: "#111827", secondary: "#111827" }, 6);
    looks.schoolA = G3.look({ primary: "#f8fafc", secondary: "#1e3a8a" }, 12);
    looks.schoolB = G3.look({ primary: "#38bdf8", secondary: "#1e3a8a" }, 15);
    looks.training = G3.look({ primary: "#f97316", secondary: kit.primary }, 21);
    looks.coach = G3.look({ primary: "#111827", secondary: kit.primary }, 8);
    if (R) G3.paintCrowd(R.crowdTex, kit, { primary: "#e2e8f0", secondary: kit.primary });
  }

  /* ─────────────── kare ─────────────── */

  function sync(dt) {
    refreshLooks();
    // kamera
    if (!drag) {
      idleT += dt;
      if (idleT > 6 && !A.reduceMotion) camGoal.yaw += dt * 0.035;
    }
    var k = 1 - Math.exp(-3.2 * dt);
    cam.yaw += (camGoal.yaw - cam.yaw) * k;
    cam.pitch += (camGoal.pitch - cam.pitch) * k;
    cam.dist += (camGoal.dist - cam.dist) * k;
    cam.tx += (camGoal.tx - cam.tx) * k;
    cam.tz += (camGoal.tz - cam.tz) * k;
    var c = R.camera;
    var cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    c.position.set(cam.tx + Math.sin(cam.yaw) * cp * cam.dist, sp * cam.dist, cam.tz + Math.cos(cam.yaw) * cp * cam.dist);
    if (A.shakeAmt > 0.2) c.position.x += (Math.random() - 0.5) * A.shakeAmt * 0.05;
    c.lookAt(cam.tx, 0, cam.tz);
    G3.focus(R, cam.tx * 0.5, 0, cam.tz * 0.5);

    var night = R.th.stars;
    R.nightMats.forEach(function (m) {
      m.emissiveIntensity = night * 0.85;
    });
    R.glowSigns.forEach(function (m) {
      m.emissiveIntensity = 0.15 + night * 0.55;
    });
    R.glowMat.opacity = night * 0.9;
    R.floodGlows.forEach(function (g) {
      g.visible = night > 0.2;
    });
    if (R.heat) R.heat.opacity = night * 0.08 * (0.8 + 0.2 * Math.sin(A.time * 1.5));
    if (R.arenaRing) R.arenaRing.emissiveIntensity = 0.35 + night * 0.9 + Math.sin(A.time * 2) * 0.1;
    R.sea.color.setHSL(0.57, 0.65, 0.42 - night * 0.22);

    // bayraklar dalgalanır, armalar döner
    R.flags.forEach(function (f, i) {
      f.rotation.y = Math.sin(A.time * 3 + i) * 0.35;
      f.rotation.z = Math.sin(A.time * 4.3 + i * 2) * 0.06;
    });
    R.spin.forEach(function (s, i) {
      s.rotation.y = A.time * (0.6 + i * 0.1);
    });
    R.water.forEach(function (m) {
      m.opacity = 0.85 + Math.sin(A.time * 2) * 0.05;
    });
    R.sirens.forEach(function (s, i) {
      s.material.opacity = Math.sin(A.time * 8 + i) > 0 ? 1 : 0.15;
    });
    R.fires.forEach(function (f, i) {
      var fl = 0.85 + Math.sin(A.time * 17 + i) * 0.1 + Math.sin(A.time * 31) * 0.06;
      f.scale.set(2.6 * fl, 2.9 * fl, 1);
    });
    R.fireLights.forEach(function (l) {
      l.intensity = (1.6 + Math.sin(A.time * 19) * 0.4) * (0.4 + night);
    });
    // buhar ve kamp ateşi kıvılcımı
    if (!A.reduceMotion) {
      R.steam.forEach(function (s) {
        if (Math.random() < dt * 3) R.dust.emit({ x: s.x + A.rand(-0.2, 0.2), y: s.y, z: s.z, vx: 0.3, vy: 1.1, vz: 0, life: 2.4, size: 0.6, size2: 2.2, color: "#f8fafc", alpha: 0.35, gravity: -0.15, drag: 0.4 });
      });
      R.fires.forEach(function (f) {
        if (Math.random() < dt * 6) {
          var p = new T.Vector3();
          f.getWorldPosition(p);
          R.fx.emit({ x: p.x + A.rand(-0.3, 0.3), y: p.y, z: p.z, vy: 2.5, vx: A.rand(-0.4, 0.4), life: 0.9, size: 0.18, size2: 0.02, color: ["#fdba74", "#fde047"], gravity: -0.5, drag: 0.5 });
        }
      });
    }
    // dev ekran: canlı skor
    paintScreen();
    // araçlar
    R.cars.forEach(function (car, i) {
      car.u = (car.u + car.speed * dt) % 1;
      var p = loopPoint(car.u, i % 2 ? 1.1 : -1.1);
      car.g.position.set(p.x, 0, p.z);
      car.g.rotation.y = p.ry;
      car.g.visible = i < 1 + Math.min(3, levels.ulasim);
    });
    if (R.bus.children.length) {
      var bu = (A.time * 0.012 + 0.5) % 1;
      var bp = loopPoint(bu, -1.1);
      R.bus.position.set(bp.x, 0, bp.z);
      R.bus.rotation.y = bp.ry;
    }
    if (R.train) {
      var tz = ((A.time * 14) % 420) - 210;
      R.train.position.set(78, 6.4, tz);
    }
    // inşaat sahnesi
    var con = R.construct;
    if (con && con.key) {
      var t = (A.time - con.at) / 2.6;
      var crane = R.crane, sc = R.scaffold;
      crane.visible = sc.visible = t < 1.15;
      crane.userData.jib.rotation.y = Math.sin(t * Math.PI * 2) * 0.9 + 0.4;
      crane.userData.hook.position.y = -6.4 + Math.sin(t * Math.PI * 4) * 1.2;
      var rise = A.easeOutBack(A.clamp((t - 0.35) / 0.55, 0, 1));
      con.inner.scale.set(1, Math.max(0.001, rise), 1);
      sc.position.y = -A.clamp((t - 0.85) / 0.3, 0, 1) * 12;
      var wp = R.groups[con.key].position;
      if (!con.dust && t > 0.02) {
        con.dust = true;
        R.dust.burst(40, { x: wp.x, y: 0.5, z: wp.z, speed: 7, up: 0.4, life: 1.6, size: 1.4, size2: 3.4, color: ["#d6c7a8", "#e7dcc6", "#b8a888"], alpha: 0.7, gravity: -0.2, jitter: 6 });
        A.shake(6);
      }
      if (!con.done && t >= 0.9) {
        con.done = true;
        R.fx.burst(90, { x: wp.x, y: 6, z: wp.z, speed: 11, up: 1.4, life: 1.8, size: 0.55, color: [kit.primary, kit.secondary, "#facc15", "#38bdf8", "#f43f5e"], gravity: 7, drag: 0.8, jitter: 4 });
        A.sound("level");
        A.sound("cheer");
        A.haptic("success");
        R.goalAt = A.time;
      }
      if (t > 1.2) {
        con.inner.scale.set(1, 1, 1);
        R.construct = {};
      }
    }
    // fişek: statü yükselince RN "celebrate" gönderir (kutlama)
    if (R.party && A.time - R.party < 4 && Math.random() < dt * 5) {
      var px = A.rand(-40, 40), pz = A.rand(-30, 40);
      R.fx.burst(50, { x: px, y: A.rand(22, 34), z: pz, speed: 9, life: 1.6, size: 0.6, color: [A.pick(["#facc15", "#f43f5e", "#38bdf8", "#a78bfa", "#34d399"]), "#ffffff"], gravity: 3, drag: 1 });
      A.sound("pop");
    }

    // canlılar
    stepMatch(dt);
    R.crowd.begin();
    R.balls.begin();
    people(dt);
    R.crowd.end();
    R.balls.end();
  }

  var screenKey = "";
  function paintScreen() {
    var key = tierTitle + Math.floor(A.time / 4);
    if (key === screenKey) return;
    screenKey = key;
    var c = R.screenTex.userData.ctx;
    var g = c.createLinearGradient(0, 0, 512, 192);
    g.addColorStop(0, kit.primary);
    g.addColorStop(1, "#0b1020");
    c.fillStyle = g;
    c.fillRect(0, 0, 512, 192);
    c.textAlign = "center";
    c.fillStyle = "#ffffff";
    var flip = Math.floor(A.time / 4) % 2;
    c.font = "900 40px " + A.FONT;
    c.fillText(flip ? "KULÜP ŞEHRİ" : upper(tierTitle || "ELİTLİG"), 256, 78, 480);
    c.font = "800 28px " + A.FONT;
    c.fillStyle = "#facc15";
    c.fillText(flip ? "HOŞ GELDİNİZ" : "★ GELİŞİM ★", 256, 140);
    R.screenTex.needsUpdate = true;
  }

  /* ─────────────── HUD (etiketler) ─────────────── */

  function drawLabels(c) {
    c.save();
    c.textAlign = "center";
    c.textBaseline = "middle";
    var items = ORDER.map(function (k) {
      var p = PLOTS[k];
      var lx = p.label ? p.label[0] : p.x, lz = p.label ? p.label[1] : p.z;
      var hgt = k === "saha" ? 4 : k === "tribun" ? 6 : 9;
      var s = G3.project(R, lx, hgt, lz);
      return { k: k, s: s };
    }).sort(function (a, b) {
      return a.s.y - b.s.y;
    });
    items.forEach(function (it) {
      var s = it.s, k = it.k;
      if (s.behind || s.x < -40 || s.x > W + 40 || s.y < 60 || s.y > H + 20) return;
      var mk = marks[k];
      var lv = levels[k];
      c.font = A.font(11, 800);
      var name = TITLES[k];
      var tw = c.measureText(name).width;
      var bw = tw + 34, bh = 22;
      var bob = mk === "up" ? Math.sin(A.time * 4 + s.x) * 2 : 0;
      var x = s.x - bw / 2, y = s.y - bh / 2 + bob;
      c.globalAlpha = mk === "lock" ? 0.75 : 1;
      A.roundRect(c, x, y, bw, bh, 11);
      c.fillStyle = "rgba(8,10,30,0.78)";
      c.fill();
      // seviye dairesi
      c.beginPath();
      c.arc(x + 11, y + bh / 2, 8, 0, Math.PI * 2);
      c.fillStyle = lv > 0 || k === "saha" ? kit.primary : "#475569";
      c.fill();
      c.font = A.font(10, 900);
      c.fillStyle = "#ffffff";
      c.fillText(String(lv), x + 11, y + bh / 2 + 0.5);
      c.font = A.font(11, 800);
      c.fillText(name, x + 20 + tw / 2, y + bh / 2 + 0.5);
      if (mk === "up") {
        var px = x + bw + 4, py = y + bh / 2;
        c.beginPath();
        c.arc(px, py, 9, 0, Math.PI * 2);
        c.fillStyle = "#22c55e";
        c.fill();
        c.strokeStyle = "#ffffff";
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(px, py + 4);
        c.lineTo(px, py - 4);
        c.moveTo(px - 3.5, py - 0.5);
        c.lineTo(px, py - 4);
        c.lineTo(px + 3.5, py - 0.5);
        c.stroke();
      } else if (mk === "max") {
        c.fillStyle = "#facc15";
        c.font = A.font(12, 900);
        c.fillText("★", x + bw + 6, y + bh / 2 + 0.5);
      }
      c.globalAlpha = 1;
    });
    c.restore();
  }

  /* ─────────────── girdi ─────────────── */

  function down(p) {
    drag = { x: p.x, y: p.y, sx: p.x, sy: p.y, t: A.time, moved: false };
    idleT = 0;
  }
  function move(p) {
    if (!drag) return;
    var dx = p.x - drag.x, dy = p.y - drag.y;
    drag.x = p.x;
    drag.y = p.y;
    if (Math.hypot(p.x - drag.sx, p.y - drag.sy) > 8) drag.moved = true;
    if (!drag.moved) return;
    // yatay sürükleme: kamerayı döndür; dikey: yakınlaş/uzaklaş
    camGoal.yaw -= dx * 0.006;
    camGoal.dist = A.clamp(camGoal.dist + dy * 0.4, 50, 240);
    cam.yaw = camGoal.yaw;
  }
  function up(p) {
    var d = drag;
    drag = null;
    if (!d || d.moved || !R) return;
    // dokunma: en yakın etiket ya da arsa
    var best = null, bd = 34;
    ORDER.forEach(function (k) {
      var pl = PLOTS[k];
      var lx = pl.label ? pl.label[0] : pl.x, lz = pl.label ? pl.label[1] : pl.z;
      var s = G3.project(R, lx, k === "saha" ? 4 : k === "tribun" ? 6 : 9, lz);
      var dd = Math.hypot(s.x - p.x, s.y - p.y);
      if (dd < bd) {
        bd = dd;
        best = k;
      }
    });
    if (!best) {
      var gp = G3.pickGround(R, p.x, p.y);
      if (gp) {
        var nearest = null, nd = 1e9;
        ORDER.forEach(function (k) {
          var pl = PLOTS[k];
          var dist = Math.hypot(gp.x - pl.x, gp.z - pl.z) - pl.r;
          if (dist < nd) {
            nd = dist;
            nearest = k;
          }
        });
        if (nd < 4) best = nearest;
      }
    }
    if (best) {
      A.sound("tap");
      A.haptic("light");
      setFocus(best);
      A.send("tap", { key: best });
    }
  }

  /* ─────────────── giriş ─────────────── */

  function resize(w, h) {
    W = w;
    H = h;
    initGL();
    if (R) G3.resize(R, W, H, function (aspect) { return A.clamp(aspect < 0.7 ? 48 : 38, 30, 60); });
  }
  function start() {}
  function update() {}
  function render(c, dt) {
    if (R) {
      try {
        G3.adapt(R, dt, false);
        sync(dt);
        G3.tick(R, dt);
        G3.draw(R);
      } catch (e) {
        A.glError = String((e && e.stack) || e);
        glFailed = true;
        R = null;
      }
    }
    if (glFailed && !R && A.is3d) {
      c.fillStyle = "#0A0E24";
      c.fillRect(0, 0, W, H);
      c.fillStyle = "rgba(255,255,255,0.8)";
      c.font = A.font(14, 700);
      c.textAlign = "center";
      c.fillText("3B grafik bu cihazda açılamadı.", W / 2, H / 2);
      return;
    }
    if (R) drawLabels(c);
    A.drawParticles(c);
    A.drawFloaters(c, dt);
  }
  function celebrate() {
    if (R) R.party = A.time;
    A.sound("cheer");
  }

  var api = { resize: resize, start: start, update: update, render: render, down: down, move: move, up: up, command: function (cmd) {
    if (cmd.type === "celebrate") celebrate();
    else command(cmd);
  }, debug: function () {
    return { levels: levels, gl: !!R, cam: cam, focus: camGoal, construct: R && R.construct && R.construct.key, match: match && match.players.length };
  } };
  A.register(api);
})();
