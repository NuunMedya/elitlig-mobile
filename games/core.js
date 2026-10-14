/*
 * ELİTLİG ARENA — ortak oyun çalışma zamanı (WebView içinde koşar).
 *
 * NEDEN WEBVIEW + CANVAS: oyunlar eskiden `react-native-svg` ile React
 * ağacında çiziliyordu; her karede yüzlerce SVG düğümü JS iş parçacığında
 * uzlaştırılıp köprüden geçiyordu. Orta segment bir Android telefonda bu,
 * 25–40 fps ve dokunuşta takılma demekti. Canvas 2D ise WebView'in kendi
 * GPU hızlandırmalı çizim hattında, React'a hiç uğramadan çizilir: gradyan,
 * ışık hüzmesi, gölge ve yüzlerce parçacık 60/120 Hz'de akar. React Native
 * tarafı yalnız kabuktur (başlık, giriş/bitiş kartları, rekor tablosu).
 *
 * KÖPRÜ — iki yönlü, küçük:
 *   Oyun → RN : {type:"ready"} · {type:"haptic",kind} · {type:"over",score,stats}
 *   RN → Oyun : window.ArenaCmd({type:"start"|"pause"|"resume"|"sound",on})
 *
 * DÖNGÜ: değişken kare süresi, sabit üst sınırlı alt adımlar (≤1/120 sn).
 * 60 Hz'de de 120 Hz'de de aynı oyun; sekme arka plana geçince saat durur,
 * dönüşte biriken süre yutulur (oyun kendi kendini bitirmez).
 */
(function () {
  "use strict";

  var canvas = document.getElementById("c");
  var ctx = canvas.getContext("2d", { alpha: false });
  var dpr = Math.min(window.devicePixelRatio || 1, 3);

  var A = (window.Arena = {
    ctx: ctx,
    canvas: canvas,
    W: 0,
    H: 0,
    dpr: dpr,
    time: 0,
    paused: false,
    soundOn: true,
    reduceMotion: false,
    game: null,
    FONT: '-apple-system, "SF Pro Display", Roboto, "Helvetica Neue", Arial, sans-serif',
  });

  /* ───────────────────────────── köprü ───────────────────────────── */

  A.send = function (type, payload) {
    var msg = JSON.stringify(Object.assign({ type: type }, payload || {}));
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(msg);
    else if (window.__arenaLog) window.__arenaLog.push(JSON.parse(msg));
  };

  A.haptic = function (kind) {
    A.send("haptic", { kind: kind });
  };

  window.ArenaCmd = function (cmd) {
    if (!cmd || !A.game) return;
    switch (cmd.type) {
      case "start":
        A.paused = false;
        A.game.start();
        break;
      case "pause":
        A.paused = true;
        break;
      case "resume":
        A.paused = false;
        last = 0;
        break;
      case "sound":
        A.soundOn = !!cmd.on;
        break;
      case "config":
        if (cmd.reduceMotion != null) A.reduceMotion = !!cmd.reduceMotion;
        if (cmd.sound != null) A.soundOn = !!cmd.sound;
        break;
    }
  };

  /* ───────────────────────────── matematik ───────────────────────────── */

  A.clamp = function (v, a, b) {
    return v < a ? a : v > b ? b : v;
  };
  A.lerp = function (a, b, t) {
    return a + (b - a) * t;
  };
  A.smooth = function (t) {
    t = A.clamp(t, 0, 1);
    return t * t * (3 - 2 * t);
  };
  A.easeOut = function (t) {
    t = A.clamp(t, 0, 1);
    return 1 - (1 - t) * (1 - t) * (1 - t);
  };
  A.easeOutBack = function (t) {
    t = A.clamp(t, 0, 1);
    var c1 = 1.70158;
    var c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  };
  A.approach = function (cur, target, rate) {
    var d = target - cur;
    return Math.abs(d) <= rate ? target : cur + Math.sign(d) * rate;
  };
  /** Kare hızından bağımsız üstel yaklaşma: k = saniyedeki yakınsama. */
  A.damp = function (cur, target, k, dt) {
    return target + (cur - target) * Math.exp(-k * dt);
  };
  A.rand = function (a, b) {
    return a + Math.random() * (b - a);
  };
  A.pick = function (list) {
    return list[(Math.random() * list.length) | 0];
  };
  A.gauss = function (mean, sigma) {
    var u = Math.max(1e-9, Math.random());
    var v = Math.random();
    return mean + sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  /** Tohumlu üreteç — statik sahne (tribün) her açılışta aynı dizilsin. */
  A.seeded = function (seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  /* ───────────────────────────── çizim yardımcıları ───────────────────────────── */

  A.font = function (size, weight) {
    return (weight || 800) + " " + Math.round(size) + "px " + A.FONT;
  };

  A.roundRect = function (c, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  };

  /** Konturlu, gölgeli oyun yazısı (skor patlamaları, "GOL!"). */
  A.bigText = function (c, text, x, y, size, fill, opts) {
    opts = opts || {};
    c.save();
    c.font = A.font(size, opts.weight || 900);
    c.textAlign = opts.align || "center";
    c.textBaseline = "middle";
    if (opts.letter) c.letterSpacing = opts.letter + "px";
    c.lineJoin = "round";
    c.shadowColor = "rgba(0,0,0,0.45)";
    c.shadowBlur = size * 0.25;
    c.shadowOffsetY = size * 0.06;
    c.lineWidth = Math.max(2, size * 0.12);
    c.strokeStyle = opts.stroke || "rgba(8,10,30,0.85)";
    c.strokeText(text, x, y);
    c.shadowColor = "transparent";
    c.fillStyle = fill;
    c.fillText(text, x, y);
    c.restore();
  };

  /** Ekran dışı tuval — statik katmanlar bir kez buraya çizilir. */
  A.layer = function (w, h) {
    var cv = document.createElement("canvas");
    cv.width = Math.max(1, Math.round(w * dpr));
    cv.height = Math.max(1, Math.round(h * dpr));
    var c = cv.getContext("2d");
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { canvas: cv, ctx: c, w: w, h: h };
  };

  A.blit = function (layer, x, y) {
    ctx.drawImage(layer.canvas, x || 0, y || 0, layer.w, layer.h);
  };

  /* ───────────────────────────── 3B futbol topu ─────────────────────────────
   * Kesik ikozahedron: 12 beşgen yama gerçek bir küre üstünde tanımlanır,
   * top bir yönelim matrisiyle döner, görünen yamalar dik izdüşümle çizilir.
   */
  var PHI = (1 + Math.sqrt(5)) / 2;
  function norm(v) {
    var l = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / l, v[1] / l, v[2] / l];
  }
  function cross(a, b) {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  }
  function dot(a, b) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  }
  var CENTRES = [
    [0, 1, PHI], [0, -1, PHI], [0, 1, -PHI], [0, -1, -PHI],
    [1, PHI, 0], [-1, PHI, 0], [1, -PHI, 0], [-1, -PHI, 0],
    [PHI, 0, 1], [-PHI, 0, 1], [PHI, 0, -1], [-PHI, 0, -1],
  ].map(norm);
  var PENTAGONS = CENTRES.map(function (c) {
    var ns = CENTRES.filter(function (n) {
      return n !== c;
    })
      .map(function (n) {
        return { n: n, d: Math.hypot(n[0] - c[0], n[1] - c[1], n[2] - c[2]) };
      })
      .sort(function (a, b) {
        return a.d - b.d;
      })
      .slice(0, 5)
      .map(function (o) {
        return o.n;
      });
    var up = Math.abs(c[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    var u = norm(cross(up, c));
    var v = cross(c, u);
    return ns
      .map(function (n) {
        var p = norm([(c[0] * 2 + n[0]) / 3, (c[1] * 2 + n[1]) / 3, (c[2] * 2 + n[2]) / 3]);
        return { p: p, a: Math.atan2(dot(p, v), dot(p, u)) };
      })
      .sort(function (x, y) {
        return x.a - y.a;
      })
      .map(function (o) {
        return o.p;
      });
  });

  A.orientation = function () {
    var m = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    A.rotate(m, [1, 0, 0], 0.5);
    A.rotate(m, [0, 1, 0], 0.35);
    return m;
  };

  /** Yönelimi dünya ekseni etrafında döndürür (x sağ, y aşağı, z kameraya). */
  A.rotate = function (m, axis, angle) {
    if (!angle) return;
    var a = norm(axis);
    var x = a[0], y = a[1], z = a[2];
    var c = Math.cos(angle), s = Math.sin(angle), t = 1 - c;
    var r = [
      t * x * x + c, t * x * y - s * z, t * x * z + s * y,
      t * x * y + s * z, t * y * y + c, t * y * z - s * x,
      t * x * z - s * y, t * y * z + s * x, t * z * z + c,
    ];
    var o = new Array(9);
    for (var i = 0; i < 3; i++)
      for (var j = 0; j < 3; j++) o[i * 3 + j] = r[i * 3] * m[j] + r[i * 3 + 1] * m[3 + j] + r[i * 3 + 2] * m[6 + j];
    var p = norm([o[0], o[1], o[2]]);
    var q0 = [o[3], o[4], o[5]];
    var d = dot(p, q0);
    var q = norm([q0[0] - p[0] * d, q0[1] - p[1] * d, q0[2] - p[2] * d]);
    var w = cross(p, q);
    m[0] = p[0]; m[1] = p[1]; m[2] = p[2];
    m[3] = q[0]; m[4] = q[1]; m[5] = q[2];
    m[6] = w[0]; m[7] = w[1]; m[8] = w[2];
  };

  /**
   * Topu çizer: gölgeli gövde, döndürülmüş yamalar, kenar karartması, parlama.
   * `light` ışığın geldiği yön (ekran açısı) — varsayılan sol üst.
   */
  A.drawBall = function (c, x, y, r, m, alpha) {
    if (r < 0.6) return;
    c.save();
    if (alpha != null) c.globalAlpha = alpha;
    c.translate(x, y);

    var body = c.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r);
    body.addColorStop(0, "#FFFFFF");
    body.addColorStop(0.55, "#F1F4F8");
    body.addColorStop(1, "#AEB8C6");
    c.fillStyle = body;
    c.beginPath();
    c.arc(0, 0, r, 0, Math.PI * 2);
    c.fill();

    c.beginPath();
    c.arc(0, 0, r * 0.995, 0, Math.PI * 2);
    c.clip();

    c.fillStyle = "#151A28";
    for (var k = 0; k < PENTAGONS.length; k++) {
      var pent = PENTAGONS[k];
      var pts = [];
      var vis = false;
      for (var i = 0; i < 5; i++) {
        var p = pent[i];
        var px = m[0] * p[0] + m[1] * p[1] + m[2] * p[2];
        var py = m[3] * p[0] + m[4] * p[1] + m[5] * p[2];
        var pz = m[6] * p[0] + m[7] * p[1] + m[8] * p[2];
        if (pz >= 0) vis = true;
        if (pz < 0) {
          var l = Math.hypot(px, py) || 1;
          px /= l;
          py /= l;
        }
        pts.push(px * r, py * r);
      }
      if (!vis) continue;
      c.beginPath();
      c.moveTo(pts[0], pts[1]);
      for (var j = 2; j < 10; j += 2) c.lineTo(pts[j], pts[j + 1]);
      c.closePath();
      c.fill();
    }

    // Kenar karartması — küre hacmi; yamaları da kenarda yutar.
    var shade = c.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.2, 0, 0, r * 1.02);
    shade.addColorStop(0, "rgba(10,14,30,0)");
    shade.addColorStop(0.6, "rgba(10,14,30,0.05)");
    shade.addColorStop(1, "rgba(10,14,30,0.55)");
    c.fillStyle = shade;
    c.fillRect(-r, -r, r * 2, r * 2);

    // Parlama
    var spec = c.createRadialGradient(-r * 0.38, -r * 0.45, 0, -r * 0.38, -r * 0.45, r * 0.55);
    spec.addColorStop(0, "rgba(255,255,255,0.85)");
    spec.addColorStop(1, "rgba(255,255,255,0)");
    c.fillStyle = spec;
    c.fillRect(-r, -r, r * 2, r * 2);
    c.restore();
  };

  /* ───────────────────────────── parçacıklar ───────────────────────────── */

  A.particles = [];
  A.burst = function (x, y, n, o) {
    o = o || {};
    if (A.reduceMotion) n = Math.ceil(n / 3);
    for (var i = 0; i < n; i++) {
      var ang = o.angle != null ? o.angle + (Math.random() - 0.5) * (o.spread || Math.PI * 2) : Math.random() * Math.PI * 2;
      var sp = (o.speed || 200) * (0.35 + Math.random() * 0.75);
      A.particles.push({
        x: x,
        y: y,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp,
        g: o.gravity != null ? o.gravity : 600,
        life: (o.life || 0.8) * (0.6 + Math.random() * 0.6),
        max: o.life || 0.8,
        size: (o.size || 4) * (0.6 + Math.random() * 0.8),
        color: Array.isArray(o.color) ? A.pick(o.color) : o.color || "#fff",
        shape: o.shape || "dot",
        rot: Math.random() * 6.28,
        vr: (Math.random() - 0.5) * 14,
        drag: o.drag || 1.6,
      });
    }
  };
  A.stepParticles = function (dt) {
    var list = A.particles;
    for (var i = list.length - 1; i >= 0; i--) {
      var p = list[i];
      p.vy += p.g * dt;
      var d = Math.exp(-p.drag * dt);
      p.vx *= d;
      p.vy *= d;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      p.life -= dt;
      if (p.life <= 0) list.splice(i, 1);
    }
  };
  A.drawParticles = function (c) {
    var list = A.particles;
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      var a = A.clamp(p.life / (p.max * 0.5), 0, 1);
      c.globalAlpha = a;
      c.fillStyle = p.color;
      if (p.shape === "confetti") {
        c.save();
        c.translate(p.x, p.y);
        c.rotate(p.rot);
        c.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        c.restore();
      } else if (p.shape === "spark") {
        c.strokeStyle = p.color;
        c.lineWidth = p.size * 0.5;
        c.lineCap = "round";
        c.beginPath();
        c.moveTo(p.x, p.y);
        c.lineTo(p.x - p.vx * 0.04, p.y - p.vy * 0.04);
        c.stroke();
      } else {
        c.beginPath();
        c.arc(p.x, p.y, p.size * (0.4 + 0.6 * a), 0, Math.PI * 2);
        c.fill();
      }
    }
    c.globalAlpha = 1;
  };

  /* Yükselen puan yazıları. */
  A.floaters = [];
  A.floatText = function (text, x, y, color, size) {
    A.floaters.push({ text: text, x: x, y: y, color: color || "#FFD24A", size: size || 22, age: 0 });
  };
  A.drawFloaters = function (c, dt) {
    for (var i = A.floaters.length - 1; i >= 0; i--) {
      var f = A.floaters[i];
      f.age += dt;
      if (f.age > 1.1) {
        A.floaters.splice(i, 1);
        continue;
      }
      var pop = A.easeOutBack(f.age / 0.25);
      c.globalAlpha = A.clamp((1.1 - f.age) / 0.4, 0, 1);
      A.bigText(c, f.text, f.x, f.y - f.age * 55, f.size * (0.6 + 0.4 * pop), f.color);
      c.globalAlpha = 1;
    }
  };

  /* ───────────────────────────── ekran sarsıntısı ───────────────────────────── */

  A.shakeAmt = 0;
  A.shake = function (amount) {
    if (A.reduceMotion) return;
    A.shakeAmt = Math.max(A.shakeAmt, amount);
  };

  /* ───────────────────────────── ses (sentezlenmiş) ─────────────────────────────
   * Ses dosyası yok: her efekt WebAudio ile üretilir (birkaç yüz bayt kod).
   * AudioContext ilk dokunuşta açılır — mobil tarayıcılar başka türlü izin
   * vermez. Ses kapalıysa hiçbir düğüm kurulmaz.
   */
  var audio = null;
  var noiseBuf = null;
  function ensureAudio() {
    if (audio) {
      if (audio.state === "suspended") audio.resume();
      return audio;
    }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try {
      audio = new AC();
      var len = audio.sampleRate * 1.5;
      noiseBuf = audio.createBuffer(1, len, audio.sampleRate);
      var d = noiseBuf.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) {
      audio = null;
    }
    return audio;
  }
  function env(g, t, a, peak, dec) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
  }
  function tone(freq, dur, typ, peak, slide) {
    var ac = audio;
    var t = ac.currentTime;
    var o = ac.createOscillator();
    var g = ac.createGain();
    o.type = typ || "sine";
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    env(g, t, 0.005, peak || 0.3, dur);
    o.connect(g).connect(ac.destination);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
  function noise(dur, freq, q, peak, attack, typ) {
    var ac = audio;
    var t = ac.currentTime;
    var s = ac.createBufferSource();
    s.buffer = noiseBuf;
    var f = ac.createBiquadFilter();
    f.type = typ || "bandpass";
    f.frequency.value = freq;
    f.Q.value = q || 1;
    var g = ac.createGain();
    env(g, t, attack || 0.005, peak || 0.3, dur);
    s.connect(f).connect(g).connect(ac.destination);
    s.start(t, Math.random() * 0.5);
    s.stop(t + (attack || 0.005) + dur + 0.05);
  }
  var SOUNDS = {
    kick: function () {
      tone(150, 0.16, "sine", 0.55, 50);
      noise(0.05, 2400, 0.8, 0.25);
    },
    tap: function () {
      tone(220, 0.1, "sine", 0.4, 90);
      noise(0.035, 3000, 1, 0.18);
    },
    net: function () {
      noise(0.35, 900, 0.6, 0.25, 0.02);
    },
    cheer: function () {
      noise(1.6, 1300, 0.35, 0.22, 0.25);
      noise(1.2, 600, 0.5, 0.12, 0.3);
    },
    groan: function () {
      noise(0.9, 450, 0.5, 0.16, 0.15);
      tone(180, 0.6, "triangle", 0.06, 120);
    },
    post: function () {
      tone(1250, 0.5, "triangle", 0.18, 1180);
      tone(2600, 0.25, "sine", 0.07);
    },
    coin: function () {
      tone(988, 0.08, "square", 0.08);
      setTimeout(function () {
        if (audio) tone(1319, 0.18, "square", 0.08);
      }, 70);
    },
    whoosh: function () {
      noise(0.22, 1600, 0.7, 0.12, 0.04, "bandpass");
    },
    crash: function () {
      noise(0.3, 300, 0.7, 0.4);
      tone(90, 0.25, "sine", 0.4, 45);
    },
    gate: function () {
      tone(660, 0.07, "sine", 0.12);
      setTimeout(function () {
        if (audio) tone(880, 0.12, "sine", 0.12);
      }, 55);
    },
    whistle: function () {
      tone(2350, 0.32, "sine", 0.14, 2300);
    },
    level: function () {
      [523, 659, 784, 1047].forEach(function (f, i) {
        setTimeout(function () {
          if (audio) tone(f, 0.14, "triangle", 0.12);
        }, i * 80);
      });
    },
    over: function () {
      [392, 330, 262].forEach(function (f, i) {
        setTimeout(function () {
          if (audio) tone(f, 0.22, "triangle", 0.12);
        }, i * 150);
      });
    },
  };
  A.sound = function (name) {
    if (!A.soundOn) return;
    if (!ensureAudio()) return;
    try {
      SOUNDS[name] && SOUNDS[name]();
    } catch (e) {
      /* ses asla oyunu durdurmaz */
    }
  };

  /* ───────────────────────────── girdi ───────────────────────────── */

  function local(e) {
    var r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top, id: e.pointerId, t: performance.now() };
  }
  var activePointer = null;
  canvas.addEventListener("pointerdown", function (e) {
    e.preventDefault();
    if (A.soundOn) ensureAudio();
    if (activePointer != null) return;
    activePointer = e.pointerId;
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch (err) {}
    if (A.game && A.game.down && !A.paused) A.game.down(local(e));
  });
  canvas.addEventListener("pointermove", function (e) {
    e.preventDefault();
    if (e.pointerId !== activePointer) return;
    if (A.game && A.game.move && !A.paused) A.game.move(local(e));
  });
  function up(e) {
    if (e.pointerId !== activePointer) return;
    activePointer = null;
    if (A.game && A.game.up && !A.paused) A.game.up(local(e));
  }
  canvas.addEventListener("pointerup", up);
  canvas.addEventListener("pointercancel", up);
  document.addEventListener("gesturestart", function (e) {
    e.preventDefault();
  });

  /* ───────────────────────────── boyut ───────────────────────────── */

  function resize() {
    var w = window.innerWidth;
    var h = window.innerHeight;
    if (w === A.W && h === A.H) return;
    A.W = w;
    A.H = h;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    if (A.game && A.game.resize) A.game.resize(w, h);
  }
  window.addEventListener("resize", resize);

  /* ───────────────────────────── döngü ───────────────────────────── */

  var last = 0;
  var MAX_STEP = 1 / 120;
  function frame(now) {
    requestAnimationFrame(frame);
    if (!A.game || A.W === 0) {
      last = now;
      return;
    }
    var dt = last ? Math.min((now - last) / 1000, 1 / 20) : 0;
    last = now;
    if (document.hidden) dt = 0;
    if (A.paused) dt = 0;

    if (dt > 0) {
      var n = Math.max(1, Math.ceil(dt / MAX_STEP));
      var h = dt / n;
      for (var i = 0; i < n; i++) {
        A.time += h;
        A.game.update(h);
      }
      A.stepParticles(dt);
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (A.shakeAmt > 0.2) {
      ctx.translate((Math.random() - 0.5) * A.shakeAmt, (Math.random() - 0.5) * A.shakeAmt);
      A.shakeAmt *= Math.exp(-14 * dt);
    } else A.shakeAmt = 0;
    A.game.render(ctx, dt);
  }
  document.addEventListener("visibilitychange", function () {
    last = 0;
  });

  A.register = function (game) {
    A.game = game;
    A.W = 0;
    resize();
    requestAnimationFrame(frame);
    A.send("ready");
  };
})();
