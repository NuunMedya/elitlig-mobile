/*
 * ORTAK 3B STADYUM — Penaltı ve Slalom aynı gece stadyumunda oynanır.
 *
 *   build(R)              ortam yansıması, gökyüzü, dört projektör, çim + çizgiler
 *                         (yarı saha: kale, ceza sahası, orta saha), kale + dokulu
 *                         file, iki katlı tribün çanağı + LED bant + çatı ışıkları,
 *                         sprite-atlas seyirciler, reklam panoları, dev ekranlar, top.
 *                         Oluşan nesneler R'ye yazılır (R.backNet, R.fanTex, R.ball…).
 *   atmosphere(R)         yalnız ortam yansıması + gökyüzü (Slalom'un sonsuz şeridi)
 *   standSegment(boy, o)  tek tribün parçası (beton kesit, LED bant, çatı, seyirci)
 *   paintCrowd(ev, dep)   seyirci atlasını iki kulübün renkleriyle boyar
 *   paintBoards / paintLed  kayan pano ve LED bant yazıları
 *   netReset / netHit / netStep  arka filenin dalga benzetimi (başsızda da çalışır)
 *   blob / shadowSet / placeShadows  temas + dolgu projektörü gölgeleri
 *   asKeeper(kişi, kaçın) kaleci forması: kulübe ve rakibe en uzak parlak renk
 *   fitFov(gen, uzak, W, H)  belirli genişliği ekrana sığdıran dikey açı
 *
 * KOORDİNAT (metre): x yatay, y yukarı, z kale çizgisinden sahaya doğru
 * (kale çizgisi z = 0, penaltı noktası z = 11, orta saha z = 52,5).
 */
(function () {
  "use strict";
  var A = window.Arena;
  var T = window.THREE || (typeof THREE !== "undefined" ? THREE : null); // eslint-disable-line no-undef
  var K = A.T3;
  var R = null;

  var GOAL_W = 7.32, GOAL_H = 2.44, HALF = GOAL_W / 2, POST_R = 0.06;
  var NET_D = 2.0, NET_BACK_H = 1.9;
  var SPOT_Z = 11, BALL_R = 0.11, MID_Z = 52.5;

  /** Belirli bir genişliği (m) belirli uzaklıkta ekrana sığdıran dikey görüş açısı. */
  function fitFov(width, dist, W, H, lo, hi) {
    var aspect = W / Math.max(1, H);
    var v = (2 * Math.atan(width / 2 / dist / aspect) * 180) / Math.PI;
    return A.clamp(v, lo || 22, hi || 72);
  }

  var std, mesh, canvasTex, glowTexture;
  function kitOf(person) {
    var k = person && person.team && person.team.kit ? person.team.kit : {};
    return { primary: k.primary || "#5B3DF5", secondary: k.secondary || "#FFFFFF" };
  }

  /* ─────────────── ortam yansıması (PBR) ─────────────── */

  /**
   * Küçük bir "ışık odası" sahnesinden önceden süzülmüş ortam haritası: top,
   * direkler ve oyuncuların parlak yüzeyleri projektörleri yansıtır.
   */
  function buildEnv() {
    var pm = new T.PMREMGenerator(R.renderer);
    var env = new T.Scene();
    env.background = new T.Color(0x070a1c);
    var ground = new T.Mesh(new T.PlaneGeometry(400, 400), new T.MeshBasicMaterial({ color: 0x173f22 }));
    ground.rotation.x = -Math.PI / 2;
    env.add(ground);
    var ring = new T.Mesh(new T.CylinderGeometry(90, 90, 40, 32, 1, true), new T.MeshBasicMaterial({ color: 0x141a36, side: T.BackSide }));
    ring.position.y = 14;
    env.add(ring);
    var lamp = new T.MeshBasicMaterial({ color: new T.Color(7, 6.6, 5.8) });
    [[-60, 40, -50], [60, 40, -50], [-60, 40, 60], [60, 40, 60], [0, 38, -70], [0, 38, 80]].forEach(function (p) {
      var m = new T.Mesh(new T.BoxGeometry(26, 5, 2), lamp);
      m.position.set(p[0], p[1], p[2]);
      m.lookAt(0, 0, 0);
      env.add(m);
    });
    R.envMap = pm.fromScene(env, 0.035).texture;
    R.scene.environment = R.envMap;
    pm.dispose();
  }

  /** Gökyüzü kubbesi: yukarıda gece mavisi, ufukta projektör pusu. */
  function buildSky() {
    var geo = new T.SphereGeometry(320, 32, 16);
    var col = new Float32Array(geo.attributes.position.count * 3);
    var top = new T.Color(0x02040d), mid = new T.Color(0x0b1330), low = new T.Color(0x24305e), c = new T.Color();
    for (var i = 0; i < geo.attributes.position.count; i++) {
      var y = geo.attributes.position.getY(i) / 320;
      if (y > 0.25) c.copy(mid).lerp(top, A.clamp((y - 0.25) / 0.6, 0, 1));
      else c.copy(low).lerp(mid, A.clamp((y + 0.05) / 0.3, 0, 1));
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    geo.setAttribute("color", new T.BufferAttribute(col, 3));
    var sky = new T.Mesh(geo, new T.MeshBasicMaterial({ vertexColors: true, side: T.BackSide, fog: false, depthWrite: false }));
    R.scene.add(sky);
    R.sky = sky;
  }

  /* ─────────────── ışık ─────────────── */

  // Dört köşe projektörü: biri gerçek gölge düşürür, diğerleri dolgu.
  var FLOODS = [
    [26, 36, 34, 2.3, true],
    [-26, 34, 32, 0.85, false],
    [-24, 32, -30, 0.95, false],
    [24, 32, -30, 0.75, false],
  ];
  function buildLights() {
    var s = R.scene;
    s.add(new T.HemisphereLight(0x8ea4ff, 0x16331c, 0.32));
    FLOODS.forEach(function (f) {
      var l = new T.DirectionalLight(f[2] > 0 ? 0xfff3e2 : 0xe4ecff, f[3]);
      l.position.set(f[0], f[1], f[2]);
      l.target.position.set(0, 0, 5);
      if (f[4]) {
        l.castShadow = true;
        l.shadow.mapSize.set(2048, 2048);
        var sc = l.shadow.camera;
        sc.left = -15;
        sc.right = 15;
        sc.top = 18;
        sc.bottom = -18;
        sc.near = 10;
        sc.far = 110;
        l.shadow.bias = -0.0003;
        l.shadow.normalBias = 0.025;
        l.shadow.radius = 2.5;
      }
      s.add(l);
      s.add(l.target);
    });
  }

  /* ─────────────── saha ─────────────── */

  var PX0 = -34, PX1 = 34, PZ0 = -8, PZ1 = 60;

  function noiseTile(size, seed) {
    var cv = document.createElement("canvas");
    cv.width = cv.height = size;
    var c = cv.getContext("2d");
    var img = c.createImageData(size, size);
    var r = A.seeded(seed);
    for (var i = 0; i < size * size; i++) {
      var v = r();
      var a = v < 0.5 ? 0 : 255;
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = a;
      img.data[i * 4 + 3] = Math.round(Math.abs(v - 0.5) * 2 * 26);
    }
    c.putImageData(img, 0, 0);
    return cv;
  }

  /** Çim yüzey normalleri: yatay biçilmiş yaprak çizgileri (dokuya derinlik). */
  function grassNormal() {
    var S = 256;
    var h = new Float32Array(S * S);
    var r = A.seeded(5);
    for (var n = 0; n < 2600; n++) {
      var x = r() * S, y = r() * S, len = 4 + r() * 10, ang = -Math.PI / 2 + (r() - 0.5) * 0.9, amp = 0.4 + r() * 0.6;
      for (var t = 0; t < len; t++) {
        var px = Math.floor(x + Math.cos(ang) * t + S) % S, py = Math.floor(y + Math.sin(ang) * t + S) % S;
        h[py * S + px] += amp * (1 - t / len);
      }
    }
    return canvasTex(S, S, function (c) {
      var img = c.createImageData(S, S);
      for (var y = 0; y < S; y++)
        for (var x = 0; x < S; x++) {
          var hl = h[y * S + ((x - 1 + S) % S)], hr = h[y * S + ((x + 1) % S)];
          var hu = h[((y - 1 + S) % S) * S + x], hd = h[((y + 1) % S) * S + x];
          var nx = (hl - hr) * 0.8, ny = (hu - hd) * 0.8, nz = 1;
          var l = Math.hypot(nx, ny, nz);
          var o = (y * S + x) * 4;
          img.data[o] = (nx / l) * 127 + 128;
          img.data[o + 1] = (ny / l) * 127 + 128;
          img.data[o + 2] = (nz / l) * 127 + 128;
          img.data[o + 3] = 255;
        }
      c.putImageData(img, 0, 0);
    }, true);
  }

  function buildPitch() {
    var SZ = 2048;
    var tex = canvasTex(SZ, SZ, function (c, cw, ch) {
      var sx = cw / (PX1 - PX0), sz = ch / (PZ1 - PZ0);
      var px = function (x) { return (x - PX0) * sx; };
      var pz = function (z) { return (z - PZ0) * sz; };
      // biçme bantları (kaleye paralel, 5,5 m) + çok hafif dama
      for (var z = -16.5, i = 0; z < PZ1; z += 5.5, i++) {
        c.fillStyle = i % 2 ? "#2c7f41" : "#358a49";
        c.fillRect(0, pz(z), cw, 5.5 * sz + 1);
      }
      for (var x = PX0, j = 0; x < PX1; x += 5.5, j++) {
        if (j % 2) continue;
        c.fillStyle = "rgba(0,0,0,0.035)";
        c.fillRect(px(x), 0, 5.5 * sx, ch);
      }
      // ince doku: iki ölçekte gürültü
      var n1 = c.createPattern(noiseTile(128, 11), "repeat");
      c.fillStyle = n1;
      c.fillRect(0, 0, cw, ch);
      c.save();
      c.scale(3, 3);
      c.globalAlpha = 0.6;
      c.fillStyle = c.createPattern(noiseTile(96, 23), "repeat");
      c.fillRect(0, 0, cw / 3, ch / 3);
      c.restore();
      // geniş renk dalgalanması
      var r = A.seeded(3);
      for (var k = 0; k < 60; k++) {
        var gx = r() * cw, gz = r() * ch, gr = 80 + r() * 260;
        var g = c.createRadialGradient(gx, gz, 0, gx, gz, gr);
        var dark = r() < 0.5;
        g.addColorStop(0, dark ? "rgba(10,40,15,0.10)" : "rgba(140,190,90,0.06)");
        g.addColorStop(1, "rgba(0,0,0,0)");
        c.fillStyle = g;
        c.fillRect(gx - gr, gz - gr, gr * 2, gr * 2);
      }
      // aşınma: penaltı noktası, kale ağzı, kalecinin çizgisi
      function wear(x0, z0, rx, rz, a) {
        c.save();
        c.translate(px(x0), pz(z0));
        c.scale(rx * sx, rz * sz);
        var g = c.createRadialGradient(0, 0, 0, 0, 0, 1);
        g.addColorStop(0, "rgba(118,92,56," + a + ")");
        g.addColorStop(0.6, "rgba(118,92,56," + a * 0.4 + ")");
        g.addColorStop(1, "rgba(118,92,56,0)");
        c.fillStyle = g;
        c.beginPath();
        c.arc(0, 0, 1, 0, Math.PI * 2);
        c.fill();
        c.restore();
      }
      wear(0, SPOT_Z, 1.1, 1.4, 0.5);
      wear(-0.6, SPOT_Z + 1.6, 0.9, 1.6, 0.25);
      wear(0, 0.6, 3.2, 0.9, 0.42);
      wear(0, 2.2, 2.2, 1.6, 0.18);
      // çizgiler
      c.strokeStyle = "rgba(244,247,238,0.93)";
      c.lineWidth = 0.12 * sx;
      c.lineCap = "butt";
      function seg(xa, za, xb, zb) {
        c.beginPath();
        c.moveTo(px(xa), pz(za));
        c.lineTo(px(xb), pz(zb));
        c.stroke();
      }
      seg(PX0, 0, PX1, 0);
      seg(-9.16, 0, -9.16, 5.5);
      seg(-9.16, 5.5, 9.16, 5.5);
      seg(9.16, 5.5, 9.16, 0);
      seg(-20.16, 0, -20.16, 16.5);
      seg(-20.16, 16.5, 20.16, 16.5);
      seg(20.16, 16.5, 20.16, 0);
      c.beginPath();
      var first = true;
      for (var a = -Math.PI / 2; a <= Math.PI / 2; a += 0.01) {
        var ax = Math.sin(a) * 9.15, az = SPOT_Z + Math.cos(a) * 9.15;
        if (az < 16.5) {
          first = true;
          continue;
        }
        if (first) c.moveTo(px(ax), pz(az));
        else c.lineTo(px(ax), pz(az));
        first = false;
      }
      c.stroke();
      c.fillStyle = "rgba(244,247,238,0.95)";
      c.beginPath();
      c.arc(px(0), pz(SPOT_Z), 0.12 * sx, 0, Math.PI * 2);
      c.fill();
      // orta saha çizgisi ve yuvarlağı (Slalom atağı orada başlar)
      seg(PX0, MID_Z, PX1, MID_Z);
      c.beginPath();
      c.arc(px(0), pz(MID_Z), 9.15 * sx, Math.PI, Math.PI * 2);
      c.stroke();
      c.beginPath();
      c.arc(px(0), pz(MID_Z), 0.15 * sx, 0, Math.PI * 2);
      c.fill();
    });
    var nm = grassNormal();
    nm.colorSpace = T.NoColorSpace;
    nm.repeat.set(70, 70);
    var mat = std(0xffffff, 0.86, 0, { map: tex, normalMap: nm, normalScale: new T.Vector2(0.55, 0.55), envMapIntensity: 0.35 });
    var pitch = mesh(new T.PlaneGeometry(PX1 - PX0, PZ1 - PZ0), mat, false, true);
    pitch.rotation.x = -Math.PI / 2;
    pitch.position.set((PX0 + PX1) / 2, 0, (PZ0 + PZ1) / 2);
    R.scene.add(pitch);
    var outer = mesh(new T.PlaneGeometry(400, 400), std(0x1f5e31, 0.95, 0, { envMapIntensity: 0.2 }), false, true);
    outer.rotation.x = -Math.PI / 2;
    outer.position.y = -0.02;
    R.scene.add(outer);
  }

  /* ─────────────── kale ve file ─────────────── */

  var NETX = 37, NETY = 11; // arka file ızgarası (köşe sayısı)
  var netDisp = new Float32Array(NETX * NETY), netVel = new Float32Array(NETX * NETY);
  var netLive = false;

  function netTexture() {
    var S = 128;
    var t = canvasTex(S, S, function (c) {
      c.clearRect(0, 0, S, S);
      c.strokeStyle = "rgba(255,255,255,0.95)";
      c.lineWidth = 5;
      c.lineCap = "round";
      // altıgen (bal peteği) file: iki göz
      c.beginPath();
      var w = S / 2, h = S / 2;
      for (var row = -1; row < 3; row++)
        for (var col = -1; col < 3; col++) {
          var x = col * w + (row % 2 ? w / 2 : 0), y = row * h;
          c.moveTo(x, y + h * 0.33);
          c.lineTo(x + w / 2, y);
          c.lineTo(x + w, y + h * 0.33);
          c.moveTo(x, y + h * 0.33);
          c.lineTo(x, y + h);
        }
      c.stroke();
    }, true);
    return t;
  }

  function buildGoal() {
    // Kale kökü: direkler, iskelet, file ve gölge tek grupta (DEV KALE ölçekler)
    var goalRoot = new T.Group();
    R.scene.add(goalRoot);
    R.goalRoot = goalRoot;
    var g = new T.Group();
    var white = new T.MeshPhysicalMaterial({ color: 0xf4f6f9, roughness: 0.22, metalness: 0.05, clearcoat: 0.6, clearcoatRoughness: 0.15 });
    var post = new T.CylinderGeometry(POST_R, POST_R, GOAL_H + POST_R, 28);
    var pl = mesh(post, white), pr = mesh(post, white);
    pl.position.set(-HALF - POST_R, (GOAL_H + POST_R) / 2, 0);
    pr.position.set(HALF + POST_R, (GOAL_H + POST_R) / 2, 0);
    var bar = mesh(new T.CylinderGeometry(POST_R, POST_R, GOAL_W + 4 * POST_R, 28), white);
    bar.rotation.z = Math.PI / 2;
    bar.position.set(0, GOAL_H + POST_R, 0);
    g.add(pl, pr, bar);
    [-1, 1].forEach(function (s) {
      var j = mesh(new T.SphereGeometry(POST_R, 20, 12), white);
      j.position.set(s * (HALF + POST_R), GOAL_H + POST_R, 0);
      g.add(j);
    });
    // arka iskelet: ince gri borular
    var thin = std(0x9aa3b2, 0.45, 0.6);
    function rod(x1, y1, z1, x2, y2, z2, rr) {
      var a = new T.Vector3(x1, y1, z1), b = new T.Vector3(x2, y2, z2);
      var m = mesh(new T.CylinderGeometry(rr, rr, a.distanceTo(b), 8), thin);
      m.position.copy(a).add(b).multiplyScalar(0.5);
      m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      g.add(m);
    }
    rod(-HALF, GOAL_H, 0, -HALF, NET_BACK_H, -NET_D, 0.018);
    rod(HALF, GOAL_H, 0, HALF, NET_BACK_H, -NET_D, 0.018);
    rod(-HALF, NET_BACK_H, -NET_D, HALF, NET_BACK_H, -NET_D, 0.018);
    rod(-HALF, 0.02, -NET_D, HALF, 0.02, -NET_D, 0.022);
    rod(-HALF, 0.02, 0, -HALF, 0.02, -NET_D, 0.022);
    rod(HALF, 0.02, 0, HALF, 0.02, -NET_D, 0.022);
    rod(-HALF, 0, -NET_D, -HALF, NET_BACK_H, -NET_D, 0.018);
    rod(HALF, 0, -NET_D, HALF, NET_BACK_H, -NET_D, 0.018);
    goalRoot.add(g);

    // file: dokulu yüzeyler (yanlar, tavan sabit; arka deforme olur)
    var base = netTexture();
    function netMat(rx, ry) {
      var t = base.clone();
      t.needsUpdate = true;
      t.repeat.set(rx, ry);
      return new T.MeshStandardMaterial({ map: t, transparent: true, alphaTest: 0.08, side: T.DoubleSide, roughness: 0.9, depthWrite: false, envMapIntensity: 0.3 });
    }
    var CELL = 0.13;
    var backGeo = new T.PlaneGeometry(GOAL_W, NET_BACK_H, NETX - 1, NETY - 1);
    var backNet = mesh(backGeo, netMat(GOAL_W / CELL / 2, NET_BACK_H / CELL / 2), false, false);
    R.netMats = [backNet.material];
    backNet.position.set(0, NET_BACK_H / 2, -NET_D);
    backNet.frustumCulled = false;
    goalRoot.add(backNet);
    R.backNet = backNet;
    R.netBase = Float32Array.from(backGeo.attributes.position.array);
    function quad(p, rx, ry) {
      var geo = new T.BufferGeometry();
      geo.setAttribute("position", new T.BufferAttribute(new Float32Array([].concat(p[0], p[1], p[2], p[0], p[2], p[3])), 3));
      geo.setAttribute("uv", new T.BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1]), 2));
      geo.computeVertexNormals();
      var m = mesh(geo, netMat(rx, ry), false, false);
      goalRoot.add(m);
      R.netMats.push(m.material);
      return m;
    }
    [-1, 1].forEach(function (s) {
      quad([[s * HALF, 0, 0], [s * HALF, 0, -NET_D], [s * HALF, NET_BACK_H, -NET_D], [s * HALF, GOAL_H, 0]], NET_D / CELL / 2, GOAL_H / CELL / 2);
    });
    quad([[-HALF, GOAL_H, 0], [HALF, GOAL_H, 0], [HALF, NET_BACK_H, -NET_D], [-HALF, NET_BACK_H, -NET_D]], GOAL_W / CELL / 2, NET_D / CELL / 2);
    // file içi gölge
    var shade = mesh(new T.PlaneGeometry(GOAL_W, NET_D), new T.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false }), false, false);
    shade.rotation.x = -Math.PI / 2;
    shade.position.set(0, 0.004, -NET_D / 2);
    goalRoot.add(shade);
  }

  function netReset() {
    netDisp.fill(0);
    netVel.fill(0);
    netLive = true;
  }
  /** Top fileye çarptı: en yakın düğüme hızla orantılı itki. */
  function netHit(x, y, speed) {
    var col = Math.round(((x + HALF) / GOAL_W) * (NETX - 1));
    var row = Math.round((1 - y / NET_BACK_H) * (NETY - 1));
    col = A.clamp(col, 0, NETX - 1);
    row = A.clamp(row, 0, NETY - 1);
    for (var dy = -1; dy <= 1; dy++)
      for (var dx = -1; dx <= 1; dx++) {
        var c = col + dx, r = row + dy;
        if (c < 0 || r < 0 || c >= NETX || r >= NETY) continue;
        netVel[r * NETX + c] += speed * (dx || dy ? 0.06 : 0.12);
      }
    netLive = true;
  }
  /** File dalgası: yay + komşu çekimi + sönüm (kenarlar çerçeveye bağlı). */
  var netAcc = 0;
  function netStep(dt) {
    if (!netLive) return;
    netAcc += dt;
    var any = false;
    while (netAcc > 1 / 60) {
      netAcc -= 1 / 60;
      any = false;
      for (var r = 0; r < NETY; r++)
        for (var c = 0; c < NETX; c++) {
          var i = r * NETX + c;
          if (c === 0 || c === NETX - 1 || r === 0) {
            netDisp[i] = 0;
            netVel[i] = 0;
            continue;
          }
          var lap = (netDisp[i - 1] + netDisp[i + 1] + netDisp[i - NETX] + (r < NETY - 1 ? netDisp[i + NETX] : netDisp[i])) / 4 - netDisp[i];
          netVel[i] += (lap * 55 - netDisp[i] * 18) / 60;
          netVel[i] *= 0.93;
          netDisp[i] += netVel[i] / 60;
          if (Math.abs(netDisp[i]) > 0.002 || Math.abs(netVel[i]) > 0.01) any = true;
        }
    }
    netLive = any;
    if (R) updateNet();
  }
  function updateNet() {
    var pos = R.backNet.geometry.attributes.position;
    var arr = pos.array, base = R.netBase;
    // PlaneGeometry köşe sırası: satırlar yukarıdan aşağı, sütunlar soldan sağa
    for (var i = 0; i < NETX * NETY; i++) {
      arr[i * 3 + 2] = base[i * 3 + 2] - netDisp[i];
      // ayrıca top filede dururken içeri çökme
    }
    pos.needsUpdate = true;
  }

  /* ─────────────── stadyum ─────────────── */

  /**
   * Tribün: iki katlı kesit (alt kat, LED bant, üst kat) bir şerit boyunca
   * çekilir (ExtrudeGeometry). Seyirciler örneklenmiş (instanced) gövde + baş.
   */
  var LOWER = 16, UPPER = 18;
  function standProfile() {
    var sh = new T.Shape();
    sh.moveTo(0, 0);
    var y = 1.1, d = 0;
    sh.lineTo(0, y);
    for (var i = 0; i < LOWER; i++) {
      d += 0.82;
      sh.lineTo(d, y);
      y += 0.42;
      sh.lineTo(d, y);
    }
    // ara kat (LED bandı)
    d += 1.6;
    sh.lineTo(d, y);
    y += 2.2;
    sh.lineTo(d, y);
    for (var j = 0; j < UPPER; j++) {
      d += 0.82;
      sh.lineTo(d, y);
      y += 0.55;
      sh.lineTo(d, y);
    }
    sh.lineTo(d + 1, y);
    sh.lineTo(d + 1, 0);
    sh.lineTo(0, 0);
    return { shape: sh, depth: d, top: y };
  }
  /** Tribünde oturan seyircilerin yerel konumları (d: içeri, y: yükseklik). */
  function seatRows() {
    var rows = [];
    var y = 1.1, d = 0;
    for (var i = 0; i < LOWER; i++) {
      d += 0.82;
      rows.push({ d: d - 0.3, y: y + 0.42 });
      y += 0.42;
    }
    d += 1.6;
    y += 2.2;
    for (var j = 0; j < UPPER; j++) {
      d += 0.82;
      rows.push({ d: d - 0.3, y: y + 0.55 });
      y += 0.55;
    }
    return rows;
  }

  // Tribün yerleşimi: [merkez x, merkez z, uzunluk, dönüş(y), başlangıç uzaklığı]
  var STANDS = [
    { cx: 0, cz: -9.5, len: 76, rot: 0 }, // kale arkası
    { cx: -40, cz: 26, len: 68, rot: Math.PI / 2 }, // sol yan
    { cx: 40, cz: 26, len: 68, rot: -Math.PI / 2 }, // sağ yan
    { cx: 0, cz: 72, len: 76, rot: Math.PI }, // karşı kale arkası (kaleci görüşünde)
  ];

  /* ── tribün parçası (stadyumda ve Slalom'un sonsuz şeridinde ortak) ── */

  var segMats = null;
  function segmentMaterials() {
    if (segMats) return segMats;
    if (!R.ledTex) {
      R.ledTex = canvasTex(1024, 32, function () {}, true);
      R.ledTex.repeat.set(4, 1);
    }
    segMats = {
      concrete: std(0x1a2036, 0.92, 0, { envMapIntensity: 0.25 }),
      led: new T.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, map: R.ledTex }),
      roof: std(0x070a16, 0.9),
      strip: new T.MeshBasicMaterial({ color: new T.Color(4, 3.8, 3.4), toneMapped: false }),
      dot: new T.SpriteMaterial({ map: glowTexture(), color: 0xfff6e2, transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: 0.8 }),
    };
    return segMats;
  }

  /**
   * Bir tribün parçası: iki katlı beton kesit (uzunluk boyunca çekilir), ara
   * kattaki LED bant, öne sarkan çatı + ışık şeridi + lambalar ve oturan
   * seyirciler. Yerel eksen: x uzunluk, −z sahadan uzaklaşan derinlik.
   * opts.density: koltuk doluluğu; opts.side(lx): 1 ev sahibi, 0 rakip.
   */
  function standSegment(len, opts) {
    opts = opts || {};
    var prof = standProfile();
    var M = segmentMaterials();
    var grp = new T.Group();
    var geo = new T.ExtrudeGeometry(prof.shape, { depth: len, bevelEnabled: false });
    geo.translate(0, 0, -len / 2);
    var m = mesh(geo, M.concrete, false, true);
    m.rotation.y = Math.PI / 2;
    grp.add(m);
    var led = mesh(new T.PlaneGeometry(len, 1.2), M.led, false, false);
    led.position.set(0, 1.1 + LOWER * 0.42 + 1.1, -(LOWER * 0.82 + 0.02));
    grp.add(led);
    var roofD = prof.depth * 0.75;
    var roof = mesh(new T.BoxGeometry(len + (opts.seamless ? 0 : 4), 0.5, roofD), M.roof, false, false);
    roof.position.set(0, prof.top + 4.2, -prof.depth + roofD / 2 - 2);
    grp.add(roof);
    var strip = mesh(new T.BoxGeometry(len, 0.25, 0.6), M.strip, false, false);
    strip.position.set(0, prof.top + 3.85, -prof.depth + roofD - 2.2);
    grp.add(strip);
    for (var x = -len / 2 + 3; x <= len / 2 - 3; x += 6) {
      var sp = new T.Sprite(M.dot);
      sp.position.set(x, prof.top + 3.7, -prof.depth + roofD - 2.2);
      sp.scale.set(5, 5, 1);
      grp.add(sp);
    }
    // seyirciler (yerel koordinatta)
    var rnd = A.seeded(opts.seed || 31);
    var spots = [];
    seatRows().forEach(function (row) {
      for (var x2 = -len / 2 + 0.5; x2 < len / 2 - 0.4; x2 += 0.62) {
        if (rnd() > (opts.density || 0.9)) continue;
        var lx = x2 + (rnd() - 0.5) * 0.16;
        spots.push({ x: lx, y: row.y, z: -row.d, rot: 0, side: opts.side ? opts.side(lx) : 1 });
      }
    });
    grp.add(makeFans(spots, rnd));
    grp.userData.depth = prof.depth;
    return grp;
  }

  function buildStadium() {
    var s = R.scene;
    var prof = standProfile();
    R.standTop = prof.top;
    STANDS.forEach(function (st, si) {
      var grp = standSegment(st.len, {
        seed: 31 + si,
        density: si === 3 ? 0.7 : 0.9,
        side: function (lx) {
          return si === 0 ? 1 : si === 3 ? 0 : lx > 0 ? 1 : 0;
        },
      });
      grp.position.set(st.cx, 0, st.cz);
      grp.rotation.y = st.rot;
      s.add(grp);
      st.grp = grp;
    });

    // köşe projektör kuleleri + parlama
    var glowMat = new T.SpriteMaterial({ map: glowTexture(), color: 0xfff2d8, transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: 0.95, fog: false });
    var lamp = new T.MeshBasicMaterial({ color: new T.Color(5, 4.8, 4.2), toneMapped: false, fog: false });
    var mastMat = std(0x0b0f1f, 0.7, 0.5);
    FLOODS.forEach(function (f) {
      var dir = new T.Vector3(f[0], 0, f[2]).normalize();
      var base = dir.clone().multiplyScalar(62);
      var mast = mesh(new T.CylinderGeometry(0.5, 0.8, 46, 10), mastMat, false, false);
      mast.position.set(base.x, 23, base.z);
      s.add(mast);
      var head = mesh(new T.BoxGeometry(9, 5, 0.6), lamp, false, false);
      head.position.set(base.x, 46, base.z);
      head.lookAt(0, 0, 8);
      s.add(head);
      var gl = new T.Sprite(glowMat);
      gl.position.copy(head.position).add(new T.Vector3(-dir.x, 0, -dir.z).multiplyScalar(1.5));
      gl.scale.set(34, 34, 1);
      s.add(gl);
    });
    // pist ve reklam panoları
    var track = mesh(new T.PlaneGeometry(140, 140), std(0x16251e, 0.95), false, true);
    track.rotation.x = -Math.PI / 2;
    track.position.set(0, -0.015, 26);
    s.add(track);
    R.boardTex = canvasTex(2048, 64, function () {}, true);
    R.boardTex.repeat.set(3, 1);
    var boardMat = new T.MeshBasicMaterial({ map: R.boardTex, toneMapped: false });
    var dark = std(0x0d1222, 0.6);
    var back = mesh(new T.BoxGeometry(66, 0.95, 0.25), [dark, dark, dark, dark, boardMat, dark], true, true);
    back.position.set(0, 0.475, -4.6);
    s.add(back);
    R.backBoard = back;
    [-1, 1].forEach(function (side) {
      var b = mesh(new T.BoxGeometry(0.25, 0.95, 64), [side > 0 ? dark : boardMat, side > 0 ? boardMat : dark, dark, dark, dark, dark], true, true);
      b.position.set(side * 35.5, 0.475, 27);
      s.add(b);
    });
    // dev ekran: kale arkası tribünün üstünde (canlı skor)
    R.screenTex = canvasTex(512, 192, function () {});
    var screen = mesh(new T.PlaneGeometry(16, 6), new T.MeshBasicMaterial({ map: R.screenTex, toneMapped: false }), false, false);
    screen.position.set(0, prof.top + 9.5, -9.5 - prof.depth + 4);
    s.add(screen);
    var frame = mesh(new T.BoxGeometry(16.8, 6.8, 0.5), std(0x05070f, 0.8), false, false);
    frame.position.set(0, prof.top + 9.5, -9.5 - prof.depth + 3.7);
    s.add(frame);
    R.screen2 = mesh(new T.PlaneGeometry(16, 6), new T.MeshBasicMaterial({ map: R.screenTex, toneMapped: false }), false, false);
    R.screen2.position.set(0, prof.top + 9.5, 72 + prof.depth - 4);
    R.screen2.rotation.y = Math.PI;
    s.add(R.screen2);
  }

  /**
   * Seyirciler: örneklenmiş düzlemler (kişi başı 2 üçgen) + çalışma anında
   * kulüp renkleriyle boyanan bir atlas (16 taraftar çeşidi × oturan/kollar
   * havada). Golde sırayla ayağa kalkar, kollar havaya kalkar.
   */
  var FAN_COLS = 16;
  function fanMaterial() {
    if (R.fanMat) return R.fanMat;
    R.fanTex = canvasTex(FAN_COLS * 64, 192, function () {});
    var mat = new T.MeshBasicMaterial({ map: R.fanTex, alphaTest: 0.5, color: 0xc9cfdf });
    mat.onBeforeCompile = function (sh) {
      sh.uniforms.uTime = R.U.time;
      sh.uniforms.uExcite = R.U.excite;
      sh.vertexShader =
        "attribute float aPhase;\nattribute float aCell;\nuniform float uTime;\nuniform float uExcite;\n" +
        sh.vertexShader
          .replace(
            "#include <uv_vertex>",
            "#include <uv_vertex>\n" +
              "float wave = sin(uTime * 8.5 + aPhase * 37.0);\n" +
              "float up = step(0.55, uExcite) * step(0.0, wave);\n" +
              "vMapUv = vec2((aCell + uv.x) / " + FAN_COLS + ".0, (uv.y + (1.0 - up)) * 0.5);\n",
          )
          .replace(
            "#include <begin_vertex>",
            "#include <begin_vertex>\n" +
              "transformed.y += 0.02 * sin(uTime * 1.7 + aPhase * 6.283) + uExcite * max(0.0, sin(uTime * 8.5 + aPhase * 37.0)) * (0.18 + 0.16 * aPhase);\n",
          );
    };
    R.fanMat = mat;
    return mat;
  }
  /** spots: { x, y, z, rot, side } — side 1 ev sahibi çeşitleri (0..7), 0 rakip (8..15). */
  function makeFans(spots, rnd) {
    var n = spots.length;
    var geo = new T.PlaneGeometry(0.62, 0.93);
    geo.translate(0, 0.4, 0);
    var phase = new Float32Array(n), cell = new Float32Array(n);
    for (var p = 0; p < n; p++) {
      phase[p] = rnd();
      cell[p] = (spots[p].side ? 0 : 8) + Math.floor(rnd() * 8);
    }
    geo.setAttribute("aPhase", new T.InstancedBufferAttribute(phase, 1));
    geo.setAttribute("aCell", new T.InstancedBufferAttribute(cell, 1));
    var fans = new T.InstancedMesh(geo, fanMaterial(), n);
    var m4 = new T.Matrix4(), q = new T.Quaternion(), up = new T.Vector3(0, 1, 0), sc = new T.Vector3(), pos = new T.Vector3(), col = new T.Color();
    for (var i = 0; i < n; i++) {
      var s0 = spots[i];
      q.setFromAxisAngle(up, s0.rot);
      var k = 0.92 + rnd() * 0.16;
      sc.set(k, k, k);
      pos.set(s0.x, s0.y, s0.z);
      m4.compose(pos, q, sc);
      fans.setMatrixAt(i, m4);
      var b = 0.78 + rnd() * 0.22;
      fans.setColorAt(i, col.setRGB(b, b, b));
    }
    fans.frustumCulled = false;
    return fans;
  }

  /** Taraftar atlası: üst sıra oturan, alt sıra kollar havada; kulüp renkleri. */
  function paintCrowd(mk, ok) {
    if (!R || !R.fanTex) return;
    var c = R.fanTex.userData.ctx;
    var skins = ["#F1C9A5", "#E0AC84", "#C68B63", "#8D5A3B", "#F8D7B5", "#D9A27C"];
    var hairs = ["#1b130d", "#2a1b12", "#3d2817", "#0e0e0e", "#6b4a2a", "#b38b5d"];
    var neutral = ["#E2E8F0", "#1E293B", "#334155", "#F8FAFC", "#475569"];
    c.clearRect(0, 0, FAN_COLS * 64, 192);
    var r = A.seeded(9);
    for (var i = 0; i < FAN_COLS; i++) {
      var kit = i < 8 ? mk : ok;
      var shirt = i % 4 === 3 ? neutral[(r() * neutral.length) | 0] : i % 2 ? kit.secondary : kit.primary;
      var trim = shirt === kit.primary ? kit.secondary : kit.primary;
      var skin = skins[(r() * skins.length) | 0], hair = hairs[(r() * hairs.length) | 0];
      var scarf = r() < 0.45;
      for (var row = 0; row < 2; row++) {
        var ox = i * 64, oy = row * 96;
        c.save();
        c.translate(ox + 32, oy);
        // kollar (alt sırada havada)
        c.strokeStyle = shirt;
        c.lineCap = "round";
        c.lineWidth = 9;
        c.beginPath();
        if (row) {
          c.moveTo(-14, 58);
          c.lineTo(-22, 18);
          c.moveTo(14, 58);
          c.lineTo(22, 18);
        }
        c.stroke();
        if (row) {
          c.fillStyle = skin;
          c.beginPath();
          c.arc(-22, 15, 5, 0, Math.PI * 2);
          c.arc(22, 15, 5, 0, Math.PI * 2);
          c.fill();
        }
        // gövde
        c.fillStyle = shirt;
        c.beginPath();
        c.moveTo(-21, 96);
        c.lineTo(-21, 62);
        c.quadraticCurveTo(-20, 50, -8, 48);
        c.lineTo(8, 48);
        c.quadraticCurveTo(20, 50, 21, 62);
        c.lineTo(21, 96);
        c.closePath();
        c.fill();
        c.fillStyle = trim;
        c.globalAlpha = 0.85;
        c.fillRect(-21, 70, 42, 5);
        c.globalAlpha = 1;
        if (scarf) {
          c.fillStyle = trim;
          c.fillRect(-11, 47, 22, 7);
          c.fillStyle = shirt === kit.primary ? kit.primary : kit.secondary;
          c.fillRect(4, 52, 6, 22);
        }
        // baş
        c.fillStyle = skin;
        c.beginPath();
        c.ellipse(0, 36, 10, 12, 0, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = hair;
        c.beginPath();
        c.ellipse(0, 30, 10.5, 7.5, 0, Math.PI, Math.PI * 2);
        c.fill();
        c.restore();
      }
    }
    R.fanTex.needsUpdate = true;
  }

  var boardText = "", ledText = "";
  function paintBoards(text) {
    if (text === boardText) return;
    boardText = text;
    var c = R.boardTex.userData.ctx, cw = R.boardTex.userData.canvas.width, ch = R.boardTex.userData.canvas.height;
    var g = c.createLinearGradient(0, 0, 0, ch);
    g.addColorStop(0, "#3B1FD1");
    g.addColorStop(1, "#1E0F7A");
    c.fillStyle = g;
    c.fillRect(0, 0, cw, ch);
    c.font = "900 40px " + A.FONT;
    c.textBaseline = "middle";
    c.fillStyle = "#FFFFFF";
    var unit = c.measureText(text).width || 200;
    for (var x = 0; x < cw; x += unit) c.fillText(text, x, ch * 0.55);
    c.fillStyle = "rgba(0,0,0,0.22)";
    for (var y = 1; y < ch; y += 3) c.fillRect(0, y, cw, 1);
    R.boardTex.needsUpdate = true;
  }
  function paintLed(a, b) {
    var key = a + b;
    if (key === ledText) return;
    ledText = key;
    var c = R.ledTex.userData.ctx, cw = 1024, ch = 32;
    var g = c.createLinearGradient(0, 0, cw, 0);
    g.addColorStop(0, a);
    g.addColorStop(0.5, "#120a3a");
    g.addColorStop(1, b);
    c.fillStyle = g;
    c.fillRect(0, 0, cw, ch);
    c.font = "900 22px " + A.FONT;
    c.fillStyle = "rgba(255,255,255,0.92)";
    c.textBaseline = "middle";
    c.textAlign = "center";
    c.fillText("ELİTLİG ARENA", cw / 2, ch / 2 + 1);
    R.ledTex.needsUpdate = true;
  }
  /** Dev ekran: iki kulüp ve skor. */
  /* ─────────────── top ─────────────── */

  /** Top dokusu: kesik ikosahedron (12 beşgen + 20 altıgen) dikişleri, marka renkli beşgenler. */
  function ballTexture() {
    var PHI = (1 + Math.sqrt(5)) / 2;
    var pent = [[0, 1, PHI], [0, -1, PHI], [0, 1, -PHI], [0, -1, -PHI], [1, PHI, 0], [-1, PHI, 0], [1, -PHI, 0], [-1, -PHI, 0], [PHI, 0, 1], [-PHI, 0, 1], [PHI, 0, -1], [-PHI, 0, -1]];
    var hex = [];
    [-1, 1].forEach(function (a) {
      [-1, 1].forEach(function (b) {
        [-1, 1].forEach(function (c) {
          hex.push([a, b, c]);
        });
      });
    });
    [-1, 1].forEach(function (a) {
      [-1, 1].forEach(function (b) {
        hex.push([0, a / PHI, b * PHI], [a / PHI, b * PHI, 0], [b * PHI, 0, a / PHI]);
      });
    });
    function nrm(v) {
      var l = Math.hypot(v[0], v[1], v[2]);
      return [v[0] / l, v[1] / l, v[2] / l];
    }
    pent = pent.map(nrm);
    hex = hex.map(nrm);
    var all = pent.concat(hex);
    var Wt = 1024, Ht = 512;
    return canvasTex(Wt, Ht, function (c) {
      var img = c.createImageData(Wt, Ht);
      var d = img.data;
      for (var y = 0; y < Ht; y++) {
        var th = (y / Ht) * Math.PI;
        var st = Math.sin(th), ct = Math.cos(th);
        for (var x = 0; x < Wt; x++) {
          var ph = (x / Wt) * Math.PI * 2;
          // three.js SphereGeometry UV: x = −cos(φ)sin(θ), y = cos(θ), z = sin(φ)sin(θ)
          var vx = -Math.cos(ph) * st, vy = ct, vz = Math.sin(ph) * st;
          var b1 = -2, b2 = -2, bi = -1;
          for (var k = 0; k < 32; k++) {
            var dt = vx * all[k][0] + vy * all[k][1] + vz * all[k][2];
            if (dt > b1) {
              b2 = b1;
              b1 = dt;
              bi = k;
            } else if (dt > b2) b2 = dt;
          }
          var o = (y * Wt + x) * 4;
          var seam = b1 - b2 < 0.012;
          var r = 246, g = 247, b = 250;
          if (bi < 12) {
            r = 34;
            g = 22;
            b = 112; // beşgen: koyu mor
            if (b1 > 0.975) {
              r = 255;
              g = 210;
              b = 74; // merkezde altın nokta
            }
          }
          if (seam) {
            r *= 0.55;
            g *= 0.55;
            b *= 0.58;
          }
          d[o] = r;
          d[o + 1] = g;
          d[o + 2] = b;
          d[o + 3] = 255;
        }
      }
      c.putImageData(img, 0, 0);
    });
  }

  function buildBall() {
    var m = mesh(new T.SphereGeometry(BALL_R, 48, 32), new T.MeshPhysicalMaterial({ map: ballTexture(), roughness: 0.42, clearcoat: 0.8, clearcoatRoughness: 0.18 }));
    R.scene.add(m);
    R.ball = m;
    R.ballShadow = blob(0.34, 0.6);
    // hız izi
    var trailGeo = new T.BufferGeometry();
    trailGeo.setAttribute("position", new T.BufferAttribute(new Float32Array(30 * 3), 3));
    var trail = new T.Line(trailGeo, new T.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.28 }));
    trail.frustumCulled = false;
    R.scene.add(trail);
    R.trail = { line: trail, pts: [] };
  }

  /* ─────────────── temas gölgeleri ─────────────── */

  var blobTex = null;
  /** Yumuşak yuvarlak zemin gölgesi (gerçek gölgenin yanında "dört projektör" etkisi). */
  function blob(size, opacity) {
    if (!blobTex)
      blobTex = canvasTex(64, 64, function (c) {
        var g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
        g.addColorStop(0, "rgba(0,0,0,1)");
        g.addColorStop(0.5, "rgba(0,0,0,0.5)");
        g.addColorStop(1, "rgba(0,0,0,0)");
        c.fillStyle = g;
        c.fillRect(0, 0, 64, 64);
      });
    var m = mesh(new T.PlaneGeometry(size, size), new T.MeshBasicMaterial({ map: blobTex, transparent: true, opacity: opacity, depthWrite: false }), false, false);
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.006;
    R.scene.add(m);
    return m;
  }
  /** Sporcunun altına: bir temas gölgesi + dolgu projektörlerinin uzun soluk gölgeleri. */
  function shadowSet() {
    var set = { contact: blob(0.9, 0.55), long: [] };
    FLOODS.slice(1).forEach(function (f) {
      var m = blob(1, 0.16);
      var dir = new T.Vector2(-f[0], -f[2]).normalize();
      m.userData.dir = dir;
      m.scale.set(0.8, 3.2, 1);
      m.rotation.z = Math.atan2(dir.x, dir.y);
      set.long.push(m);
    });
    return set;
  }
  function placeShadows(set, a, visible) {
    var x = a.root.position.x, z = a.root.position.z;
    set.contact.visible = visible;
    set.contact.position.x = x;
    set.contact.position.z = z;
    var h = a.root.position.y;
    set.contact.material.opacity = 0.55 * Math.max(0.2, 1 - h * 1.5);
    set.long.forEach(function (m) {
      m.visible = visible;
      m.position.x = x + m.userData.dir.x * 1.45;
      m.position.z = z + m.userData.dir.y * 1.45;
    });
  }

  /* ─────────────── oyuncular ─────────────── */

  /** Kaleci forması: kulübün rengine ve rakibe en uzak parlak renk. */
  var GK_COLORS = ["#A3E635", "#F97316", "#22D3EE", "#E879F9", "#FACC15", "#111827", "#F43F5E"];
  function colorDist(a, b) {
    var ca = new T.Color(a), cb = new T.Color(b);
    return Math.hypot(ca.r - cb.r, ca.g - cb.g, ca.b - cb.b);
  }
  function asKeeper(person, avoid) {
    var kit = kitOf(person);
    var best = GK_COLORS[0], bd = -1;
    GK_COLORS.forEach(function (c) {
      var d = Math.min(colorDist(c, kit.primary), colorDist(c, avoid));
      if (d > bd) {
        bd = d;
        best = c;
      }
    });
    var team = Object.assign({}, person.team || {}, { kit: { primary: best, secondary: "#0B1020" } });
    return Object.assign({}, person, { team: team });
  }


  function use(target) {
    if (R !== target) {
      segMats = null;
      boardText = ledText = "";
    }
    R = target;
    std = K.std;
    mesh = K.mesh;
    canvasTex = K.canvasTex;
    glowTexture = K.glowTexture;
  }
  /** Yalnız atmosfer: ortam yansıması + gökyüzü (Slalom kendi şeridini kurar). */
  function atmosphere(target) {
    use(target);
    buildEnv();
    buildSky();
  }
  function build(target) {
    use(target);
    buildEnv();
    buildSky();
    buildLights();
    buildPitch();
    buildGoal();
    buildStadium();
    buildBall();
  }

  A.S3 = {
    GOAL_W: GOAL_W,
    GOAL_H: GOAL_H,
    HALF: HALF,
    POST_R: POST_R,
    NET_D: NET_D,
    NET_BACK_H: NET_BACK_H,
    SPOT_Z: SPOT_Z,
    BALL_R: BALL_R,
    MID_Z: MID_Z,
    FLOODS: FLOODS,
    build: build,
    atmosphere: atmosphere,
    standSegment: standSegment,
    grassNormal: function () {
      return grassNormal();
    },
    noiseTile: noiseTile,
    fitFov: fitFov,
    paintCrowd: paintCrowd,
    paintBoards: paintBoards,
    paintLed: paintLed,
    netReset: netReset,
    netHit: netHit,
    netStep: netStep,
    blob: blob,
    shadowSet: shadowSet,
    placeShadows: placeShadows,
    asKeeper: asKeeper,
  };
})();
