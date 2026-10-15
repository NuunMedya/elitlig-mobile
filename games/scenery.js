/*
 * ORTAK SAHNE — gece stadyumu parçaları. Üç oyun aynı stadyumda oynanır:
 * aynı gökyüzü, aynı projektörler, aynı Elitlig moru LED panolar.
 *
 * Statik parçalar (gökyüzü, tribün, kalabalık) ekran dışı bir katmana BİR KEZ
 * çizilir; her karede yalnız o katmanın kopyası basılır. Kalabalık binlerce
 * daireden oluşur ama renk başına tek bir yol olarak doldurulur.
 */
(function () {
  "use strict";
  var A = window.Arena;

  A.PAL = {
    skyTop: "#050817",
    skyMid: "#0E1433",
    skyLow: "#26306B",
    roof: "#04060F",
    standBack: "#0D1330",
    standFront: "#161E48",
    rail: "#2B3672",
    crowd: ["#E2E8F0", "#94A3B8", "#F8D7B5", "#C68B63", "#5B3DF5", "#A78BFA", "#F43F5E", "#FBBF24", "#38BDF8", "#1E293B", "#F1F5F9", "#64748B"],
    flood: "255,247,219",
    brand: "#5B3DF5",
    brandDeep: "#2A1680",
    brandGlow: "#8B7BFF",
    grassA: "#2F9A55",
    grassB: "#25844A",
    grassFar: "#3AA862",
    grassNear: "#155E31",
    chalk: "rgba(245,248,242,0.92)",
    gold: "#FFD24A",
    good: "#34D399",
    bad: "#FB7185",
    white: "#FFFFFF",
    ink: "#0A0E24",
  };
  var P = A.PAL;

  /** Gökyüzü + yıldızlar. */
  A.paintSky = function (c, w, h) {
    var g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, P.skyTop);
    g.addColorStop(0.6, P.skyMid);
    g.addColorStop(1, P.skyLow);
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    var r = A.seeded(77);
    c.fillStyle = "#fff";
    for (var i = 0; i < 40; i++) {
      c.globalAlpha = 0.15 + r() * 0.45;
      c.beginPath();
      c.arc(r() * w, r() * h * 0.55, r() < 0.15 ? 1.2 : 0.6, 0, Math.PI * 2);
      c.fill();
    }
    c.globalAlpha = 1;
  };

  /**
   * Tribün: çatı, iki kat dolu seyirci, korkuluk, çatı altı projektörleri.
   * `top` çatının alt kenarı, `bottom` tribünün bittiği (panoların başladığı) y.
   */
  A.paintStands = function (c, w, top, bottom, seed) {
    var h = bottom - top;
    if (h <= 4) return;
    var rand = A.seeded(seed || 1907);

    // Tribün gövdesi
    var g = c.createLinearGradient(0, top, 0, bottom);
    g.addColorStop(0, P.standBack);
    g.addColorStop(1, P.standFront);
    c.fillStyle = g;
    c.fillRect(0, top, w, h);

    var split = top + h * 0.44;
    var paths = P.crowd.map(function () {
      return new Path2D();
    });
    function rows(y0, y1, gap, r0, r1) {
      for (var y = y0 + gap * 0.6; y < y1 - 1; y += gap) {
        var depth = (y - y0) / Math.max(1, y1 - y0);
        var rr = r0 + (r1 - r0) * depth;
        for (var x = rand() * gap * 0.5; x < w; x += gap * (0.9 + rand() * 0.22)) {
          if (rand() < 0.06) continue;
          var k = (rand() * P.crowd.length) | 0;
          var cx = x + (rand() - 0.5) * 1.6;
          var cy = y + (rand() - 0.5) * 1.6;
          paths[k].moveTo(cx + rr, cy);
          paths[k].arc(cx, cy, rr, 0, Math.PI * 2);
          // omuz
          paths[k].moveTo(cx + rr * 1.5, cy + rr * 2.4);
          paths[k].ellipse(cx, cy + rr * 2.4, rr * 1.5, rr * 1.1, 0, Math.PI, Math.PI * 2);
        }
      }
    }
    var gs = Math.max(4.4, h / 22);
    rows(top + 2, split - 3, gs, gs * 0.24, gs * 0.32);
    rows(split + 4, bottom, gs * 1.22, gs * 0.3, gs * 0.42);
    for (var i = 0; i < paths.length; i++) {
      c.globalAlpha = 0.5;
      c.fillStyle = P.crowd[i];
      c.fill(paths[i]);
    }
    c.globalAlpha = 1;

    // Üst kat karanlıkta: derinlik
    var sh = c.createLinearGradient(0, top, 0, bottom);
    sh.addColorStop(0, "rgba(5,8,23,0.82)");
    sh.addColorStop(0.45, "rgba(5,8,23,0.35)");
    sh.addColorStop(1, "rgba(5,8,23,0.12)");
    c.fillStyle = sh;
    c.fillRect(0, top, w, h);

    // Kat korkuluğu (marka çizgisi)
    c.fillStyle = P.rail;
    c.fillRect(0, split - 2, w, 4);
    c.fillStyle = "rgba(139,123,255,0.55)";
    c.fillRect(0, split - 2, w, 1);
  };

  /** Çatı + projektör sırası. Işık hüzmeleri "lighter" ile toplanır. */
  A.paintRoof = function (c, w, roofBottom, lightY) {
    c.fillStyle = P.roof;
    c.fillRect(0, 0, w, roofBottom);
    // Çatı kirişi çizgisi
    c.fillStyle = "rgba(139,123,255,0.25)";
    c.fillRect(0, roofBottom - 1.5, w, 1.5);

    var n = Math.max(4, Math.round(w / 48));
    c.save();
    c.globalCompositeOperation = "lighter";
    for (var i = 0; i < n; i++) {
      var x = ((i + 0.5) / n) * w;
      var y = lightY != null ? lightY : roofBottom - 3;
      var glow = c.createRadialGradient(x, y, 0, x, y, 60);
      glow.addColorStop(0, "rgba(" + P.flood + ",0.55)");
      glow.addColorStop(0.25, "rgba(" + P.flood + ",0.18)");
      glow.addColorStop(1, "rgba(" + P.flood + ",0)");
      c.fillStyle = glow;
      c.fillRect(x - 60, y - 60, 120, 120);
    }
    c.restore();
    for (var j = 0; j < n; j++) {
      var lx = ((j + 0.5) / n) * w;
      var ly = lightY != null ? lightY : roofBottom - 3;
      c.fillStyle = "#FFFDF2";
      A.roundRect(c, lx - 10, ly - 3, 20, 5, 1.5);
      c.fill();
    }
  };

  /** Projektörden sahaya inen ışık sisi — üst katman, "lighter". */
  A.paintHaze = function (c, w, y, h, strength) {
    c.save();
    c.globalCompositeOperation = "lighter";
    var g = c.createRadialGradient(w / 2, y, 0, w / 2, y, Math.max(w, h) * 0.8);
    g.addColorStop(0, "rgba(" + P.flood + "," + (0.12 * (strength || 1)).toFixed(3) + ")");
    g.addColorStop(1, "rgba(" + P.flood + ",0)");
    c.fillStyle = g;
    c.fillRect(0, y - h, w, h * 2);
    c.restore();
  };

  /**
   * LED reklam panoları — her kare çizilir: yazı kayar, combo/gol anında
   * panolar parlar (`flash` 0–1).
   */
  A.drawBoards = function (c, w, y, h, t, flash, msg) {
    var g = c.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, "#3B1FD1");
    g.addColorStop(1, P.brandDeep);
    c.fillStyle = g;
    c.fillRect(0, y, w, h);

    var text = msg || "ELİTLİG  ·  ARENA  ·  ";
    c.save();
    c.beginPath();
    c.rect(0, y, w, h);
    c.clip();
    c.font = A.font(h * 0.56, 900);
    c.textBaseline = "middle";
    var unit = c.measureText(text).width || 100;
    var off = -((t * 40) % unit);
    c.fillStyle = "#FFFFFF";
    for (var x = off; x < w; x += unit) c.fillText(text, x, y + h * 0.54);
    // LED piksel ızgarası
    c.fillStyle = "rgba(0,0,0,0.18)";
    for (var yy = y + 2; yy < y + h; yy += 3) c.fillRect(0, yy, w, 1);
    if (flash > 0) {
      c.fillStyle = "rgba(255,210,74," + (0.55 * flash).toFixed(3) + ")";
      c.fillRect(0, y, w, h);
    }
    c.restore();
    c.fillStyle = "rgba(196,181,253,0.8)";
    c.fillRect(0, y, w, Math.max(1, h * 0.07));
    c.fillStyle = "rgba(0,0,0,0.45)";
    c.fillRect(0, y + h - 1, w, 1);
  };

  /** Tribünde fotoğraf flaşları — her karede birkaç rastgele beyaz nokta. */
  A.drawFlashes = function (c, w, top, bottom, rate) {
    if (A.reduceMotion) return;
    var n = rate || 2;
    c.save();
    c.globalCompositeOperation = "lighter";
    for (var i = 0; i < n; i++) {
      if (Math.random() > 0.35) continue;
      var x = Math.random() * w;
      var y = top + Math.random() * (bottom - top);
      var g = c.createRadialGradient(x, y, 0, x, y, 7);
      g.addColorStop(0, "rgba(255,255,255,0.95)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      c.fillStyle = g;
      c.fillRect(x - 7, y - 7, 14, 14);
    }
    c.restore();
  };

  /** Köşe karartması — bir kez katmana çizilir. */
  A.paintVignette = function (c, w, h, strength) {
    var g = c.createRadialGradient(w / 2, h * 0.5, Math.min(w, h) * 0.35, w / 2, h * 0.5, Math.max(w, h) * 0.78);
    g.addColorStop(0, "rgba(4,6,18,0)");
    g.addColorStop(1, "rgba(4,6,18," + (strength || 0.55) + ")");
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
  };

  /** Uçları yuvarlak, incelen uzuv (kol/bacak) — figürlerin yapı taşı. */
  A.limb = function (c, x1, y1, x2, y2, w1, w2, color) {
    var dx = x2 - x1, dy = y2 - y1;
    var len = Math.hypot(dx, dy) || 1e-6;
    var nx = -dy / len, ny = dx / len;
    var a = Math.atan2(ny, nx);
    c.fillStyle = color;
    c.beginPath();
    c.moveTo(x1 + nx * w1, y1 + ny * w1);
    c.lineTo(x2 + nx * w2, y2 + ny * w2);
    // Uç kapakları DIŞA doğru (saat yönünün tersi): içe dönen yay uzvun
    // ucunda yarım daire boşluk bırakıyordu (eklem yerlerinde delik).
    c.arc(x2, y2, w2, a, a + Math.PI, true);
    c.lineTo(x1 - nx * w1, y1 - ny * w1);
    c.arc(x1, y1, w1, a + Math.PI, a + Math.PI * 2, true);
    c.closePath();
    c.fill();
  };

  /* ───────────────────────────── HUD ───────────────────────────── */

  /** HUD okunurluğu için üstten inen koyu perde (katmana bir kez çizilir). */
  A.paintTopScrim = function (c, w, h) {
    var g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "rgba(4,6,18,0.7)");
    g.addColorStop(1, "rgba(4,6,18,0)");
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
  };

  /** Cam efektli HUD hapı. */
  A.pill = function (c, x, y, w, h, fill) {
    c.save();
    A.roundRect(c, x, y, w, h, h / 2);
    c.fillStyle = fill || "rgba(8,10,30,0.55)";
    c.fill();
    c.strokeStyle = "rgba(255,255,255,0.14)";
    c.lineWidth = 1;
    c.stroke();
    c.restore();
  };

  /** Sol üst skor bloğu: küçük etiket + büyük rakam (vuruşta zıplar). */
  A.drawScore = function (c, x, y, label, value, bump, align) {
    c.save();
    c.textAlign = align || "left";
    c.textBaseline = "alphabetic";
    c.font = A.font(11, 800);
    if ("letterSpacing" in c) c.letterSpacing = "1.5px";
    c.fillStyle = "rgba(255,255,255,0.7)";
    c.fillText(label, x, y + 12);
    if ("letterSpacing" in c) c.letterSpacing = "0px";
    var s = 1 + 0.25 * (bump || 0);
    c.translate(x, y + 50);
    c.scale(s, s);
    c.font = A.font(42, 900);
    c.shadowColor = "rgba(0,0,0,0.5)";
    c.shadowBlur = 10;
    c.shadowOffsetY = 2;
    c.fillStyle = "#FFFFFF";
    c.fillText(String(value), 0, 0);
    c.restore();
  };

  /** Seviye/duyuru bandı: ortada süzülerek girer, bekler, çıkar. */
  A.banner = null;
  A.announce = function (title, sub, color) {
    A.banner = { title: title, sub: sub || "", color: color || P.gold, age: 0 };
  };
  A.drawBanner = function (c, w, y, dt) {
    var b = A.banner;
    if (!b) return;
    b.age += dt;
    var life = 1.8;
    if (b.age > life) {
      A.banner = null;
      return;
    }
    var inT = A.easeOutBack(b.age / 0.35);
    var outT = A.clamp((life - b.age) / 0.3, 0, 1);
    c.save();
    c.globalAlpha = outT;
    c.translate(w / 2, y);
    c.scale(0.6 + 0.4 * inT, 0.6 + 0.4 * inT);
    var bw = Math.min(w - 32, 300);
    var g = c.createLinearGradient(-bw / 2, 0, bw / 2, 0);
    g.addColorStop(0, "rgba(91,61,245,0)");
    g.addColorStop(0.2, "rgba(60,36,200,0.92)");
    g.addColorStop(0.8, "rgba(60,36,200,0.92)");
    g.addColorStop(1, "rgba(91,61,245,0)");
    c.fillStyle = g;
    c.fillRect(-bw / 2, -30, bw, b.sub ? 64 : 48);
    c.fillStyle = "rgba(255,255,255,0.35)";
    c.fillRect(-bw / 2 + 20, -30, bw - 40, 1);
    c.fillRect(-bw / 2 + 20, (b.sub ? 34 : 18) - 1, bw - 40, 1);
    A.bigText(c, b.title, 0, -8, 26, b.color);
    if (b.sub) {
      c.font = A.font(13, 700);
      c.textAlign = "center";
      c.fillStyle = "rgba(255,255,255,0.9)";
      c.fillText(b.sub, 0, 20);
    }
    c.restore();
  };

  /** Can göstergesi: dolu/boş toplar. */
  A.drawLives = function (c, x, y, lives, max, size) {
    size = size || 9;
    for (var i = 0; i < max; i++) {
      var cx = x - i * (size * 2 + 5);
      c.beginPath();
      c.arc(cx, y, size, 0, Math.PI * 2);
      if (i < lives) {
        var g = c.createRadialGradient(cx - size * 0.3, y - size * 0.3, 1, cx, y, size);
        g.addColorStop(0, "#FFFFFF");
        g.addColorStop(1, "#B9C3D3");
        c.fillStyle = g;
        c.fill();
        c.fillStyle = "#151A28";
        c.beginPath();
        c.arc(cx, y, size * 0.36, 0, Math.PI * 2);
        c.fill();
      } else {
        c.strokeStyle = "rgba(255,255,255,0.3)";
        c.lineWidth = 1.5;
        c.stroke();
      }
    }
  };
})();
