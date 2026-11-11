/*
 * ARCADE 3B MOTORU — yeni kuşak Arena oyunlarının (Slalom koşusu, Savunma
 * Hattı, Kadro Koşusu) ortak çizim motoru.
 *
 *   stage(opts)            WebGL sahnesi: renderer, kamera, tema (gündüz / gün
 *                          batımı / gece), güneş + gölge, ortam yansıması,
 *                          gökyüzü (bulutlu, yıldızlı; gölgelendiricide), iki
 *                          parçacık sistemi. WebGL yoksa null (başsız testler).
 *   setTheme(R, ad)        temalar arası YUMUŞAK geçiş (ışık, sis, gökyüzü)
 *   particles              GPU nokta parçacıkları: toz, kıvılcım, konfeti
 *   minis(R, n)            ÖRNEKLENMİŞ mini futbolcular: yüzlerce oyuncu iki
 *                          çizim çağrısında (kapsül + küre). Prosedürel
 *                          animasyon: koşu, bekleme, şut, kayma, düşme, sevinç…
 *   balls(R, n, r)         örneklenmiş toplar (şut yağmuru)
 *   look(kit, tohum)       forma/ten/saç renkleri
 *   project(R, x, y, z)    dünya → ekran (HUD yazıları için)
 *   enableCurve(kx, ky)    "kıvrık dünya": ufuk aşağı ve yana bükülür
 *                          (sonsuz koşuda derinlik hissi; nesneler ufukta doğar)
 *
 * NEDEN ÖRNEKLEME: iskeletli gerçek futbolcu (three-kit.js) kişi başı ~7 bin
 * köşe ve 5 çizim çağrısıdır; 80 kişilik kadro telefonu dizlerinin üstüne
 * çökertir. Mini futbolcular gövde parçalarını İKİ InstancedMesh'te toplar:
 * kişi sayısı çizim çağrısını değiştirmez, poz her karede JS'te hesaplanır
 * (kişi başı 13 düğüm), 120 Hz'de yüz oyuncu rahat döner.
 *
 * KOORDİNAT: x sağ, y yukarı, İLERİ −z. Mini futbolcu yerelinde +z'ye bakar.
 */
(function () {
  "use strict";
  var A = window.Arena;
  var T = window.THREE || (typeof THREE !== "undefined" ? THREE : null); // eslint-disable-line no-undef
  var K = A.T3;

  /* ─────────────────────────── temalar ─────────────────────────── */

  var THEMES = {
    day: {
      top: 0x1f6fe0, mid: 0x69b8ff, low: 0xd6efff, fog: 0xbfe2ff, cloud: 0xffffff, cloudA: 0.95, stars: 0,
      sun: 0xfff1d2, sunI: 2.7, glow: 0xfff3c4, hemiSky: 0xd6ebff, hemiGround: 0x5fa55a, hemiI: 0.9, fillI: 0.45, exposure: 1.06,
      dir: [0.42, 0.82, -0.38],
    },
    sunset: {
      top: 0x2c2a78, mid: 0xe86f7e, low: 0xffcf8a, fog: 0xf2b08e, cloud: 0xffc7a6, cloudA: 0.9, stars: 0.15,
      sun: 0xffa95e, sunI: 2.4, glow: 0xffb26a, hemiSky: 0xffc4a6, hemiGround: 0x6a5a44, hemiI: 0.78, fillI: 0.5, exposure: 1.04,
      dir: [0.3, 0.34, -0.89],
    },
    night: {
      top: 0x040820, mid: 0x101c58, low: 0x39408f, fog: 0x1b2460, cloud: 0x4a55a6, cloudA: 0.45, stars: 1,
      sun: 0xe6edff, sunI: 2.1, glow: 0xb9c8ff, hemiSky: 0x9aaeff, hemiGround: 0x234a2c, hemiI: 0.72, fillI: 0.7, exposure: 1.1,
      dir: [-0.38, 0.72, -0.58],
    },
  };
  var COLOR_KEYS = ["top", "mid", "low", "fog", "cloud", "sun", "glow", "hemiSky", "hemiGround"];
  var NUM_KEYS = ["cloudA", "stars", "sunI", "hemiI", "fillI", "exposure"];

  var curve = { x: 0, y: 0, on: false };

  /**
   * Kıvrık dünya: görüş uzayında z² ile orantılı kayma. Gölge derinlik geçişi
   * hariç bütün hazır malzemelere işlenir (derinlik geçişi ışığın gözünden
   * çizer; orada kıvrım gölgeyi kaydırırdı). İLK malzeme derlenmeden çağrılır.
   */
  function enableCurve(kx, ky) {
    curve.x = kx;
    curve.y = ky;
    if (!T || curve.on) return;
    curve.on = true;
    var bend = "mvPosition.xy += vec2(" + kx.toFixed(6) + ", " + ky.toFixed(6) + ") * mvPosition.z * mvPosition.z;";
    T.ShaderChunk.project_vertex = T.ShaderChunk.project_vertex.replace(
      "gl_Position = projectionMatrix * mvPosition;",
      "#ifndef DEPTH_PACKING\n" + bend + "\n#endif\ngl_Position = projectionMatrix * mvPosition;",
    );
    T.ShaderLib.sprite.vertexShader = T.ShaderLib.sprite.vertexShader.replace(
      "gl_Position = projectionMatrix * mvPosition;",
      bend + "\ngl_Position = projectionMatrix * mvPosition;",
    );
  }

  /* ─────────────────────────── sahne ─────────────────────────── */

  function hasWebGL() {
    try {
      var cv = document.getElementById("gl");
      if (!cv || !T || !K || !cv.getContext) return false;
      var gl = cv.getContext("webgl2") || cv.getContext("webgl");
      if (!gl || typeof gl.getParameter !== "function") return false;
      var v = gl.getParameter(gl.VERSION);
      return typeof v === "string" && v.length > 0;
    } catch (e) {
      return false;
    }
  }

  var SKY_VERT = "varying vec3 vDir;\nvoid main(){\n  vDir = position;\n  vec4 p = modelViewMatrix * vec4(position, 1.0);\n  gl_Position = projectionMatrix * p;\n  gl_Position.z = gl_Position.w * 0.9999;\n}";
  var SKY_FRAG = [
    "uniform vec3 uTop; uniform vec3 uMid; uniform vec3 uLow; uniform vec3 uGlow; uniform vec3 uCloud; uniform vec3 uSunDir;",
    "uniform float uCloudA; uniform float uStars; uniform float uTime;",
    "varying vec3 vDir;",
    "float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }",
    "float noise(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);",
    "  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }",
    "float fbm(vec2 p){ float a = 0.5; float s = 0.0; for (int i = 0; i < 4; i++) { s += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return s; }",
    "void main(){",
    "  vec3 d = normalize(vDir);",
    "  float h = d.y;",
    "  vec3 c = mix(uLow, uMid, smoothstep(-0.03, 0.22, h));",
    "  c = mix(c, uTop, smoothstep(0.18, 0.85, h));",
    "  float s = max(dot(d, normalize(uSunDir)), 0.0);",
    "  c += uGlow * (pow(s, 420.0) * 2.2 + pow(s, 28.0) * 0.38 + pow(s, 4.0) * 0.16);",
    "  if (uStars > 0.01 && h > 0.0) {",
    "    vec2 g = d.xz / (h + 0.35) * 46.0;",
    "    vec2 cell = floor(g);",
    "    float r = hash(cell);",
    "    float tw = 0.6 + 0.4 * sin(uTime * 2.0 + r * 40.0);",
    "    float st = step(0.975, r) * smoothstep(0.5, 0.0, length(fract(g) - 0.5)) * tw;",
    "    c += vec3(st) * uStars * smoothstep(0.0, 0.25, h);",
    "  }",
    "  if (h > 0.01) {",
    "    vec2 uv = d.xz / (h + 0.16) * 1.15 + vec2(uTime * 0.012, uTime * 0.004);",
    "    float n = fbm(uv);",
    "    float cl = smoothstep(0.5, 0.78, n) * smoothstep(0.01, 0.16, h) * uCloudA;",
    "    vec3 lit = uCloud * (0.82 + 0.3 * smoothstep(0.55, 0.9, n)) + uGlow * pow(s, 6.0) * 0.35;",
    "    c = mix(c, lit, cl);",
    "  }",
    "  gl_FragColor = vec4(c, 1.0);",
    "  #include <colorspace_fragment>",
    "}",
  ].join("\n");

  function buildSky(R) {
    var mat = new T.ShaderMaterial({
      uniforms: {
        uTop: { value: new T.Color() }, uMid: { value: new T.Color() }, uLow: { value: new T.Color() }, uGlow: { value: new T.Color() },
        uCloud: { value: new T.Color() }, uSunDir: { value: new T.Vector3(0, 1, 0) }, uCloudA: { value: 1 }, uStars: { value: 0 }, uTime: R.U.time,
      },
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: T.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
    });
    var sky = new T.Mesh(new T.SphereGeometry(50, 32, 16), mat);
    sky.frustumCulled = false;
    sky.renderOrder = -10;
    R.scene.add(sky);
    R.sky = sky;
  }

  /** Ortam yansıması: parlak gökyüzü odası (top, madalyon ve formalar ışık alır). */
  function buildEnv(R, night) {
    var pm = new T.PMREMGenerator(R.renderer);
    var env = new T.Scene();
    env.background = new T.Color(night ? 0x0c1440 : 0x9ccfff);
    var ground = new T.Mesh(new T.PlaneGeometry(400, 400), new T.MeshBasicMaterial({ color: night ? 0x1b4a26 : 0x4f9f4c }));
    ground.rotation.x = -Math.PI / 2;
    env.add(ground);
    var lamp = new T.MeshBasicMaterial({ color: new T.Color(6, 5.6, 4.8) });
    [[40, 60, -50], [-50, 40, 30]].forEach(function (p) {
      var m = new T.Mesh(new T.BoxGeometry(30, 30, 2), lamp);
      m.position.set(p[0], p[1], p[2]);
      m.lookAt(0, 0, 0);
      env.add(m);
    });
    var tex = pm.fromScene(env, 0.04).texture;
    pm.dispose();
    return tex;
  }

  /**
   * opts: { theme, fog:[yakın, uzak], far, shadow:{ size, box:[sol, sağ, üst, alt], far }, curve:[kx, ky] }
   */
  function stage(opts) {
    opts = opts || {};
    if (!hasWebGL()) return null;
    if (opts.curve) enableCurve(opts.curve[0], opts.curve[1]);
    var renderer = new T.WebGLRenderer({ canvas: document.getElementById("gl"), antialias: true, powerPreference: "high-performance", stencil: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.outputColorSpace = T.SRGBColorSpace;
    K.init(renderer);
    var scene = new T.Scene();
    var fog = opts.fog || [60, 200];
    scene.fog = new T.Fog(0xbfe2ff, fog[0], fog[1]);
    var R = {
      renderer: renderer,
      scene: scene,
      camera: new T.PerspectiveCamera(55, 1, 0.1, opts.far || 600),
      U: { time: { value: 0 }, excite: { value: 0 } },
      W: 1,
      H: 1,
      perf: { acc: 0, n: 0, step: 0 },
      th: { dir: new T.Vector3() },
      thTo: null,
      tmp: new T.Vector3(),
    };
    COLOR_KEYS.forEach(function (k) {
      R.th[k] = new T.Color();
    });
    if (A.S3 && A.S3.use) A.S3.use(R); // ortak top/file dokuları bu sahnede
    buildSky(R);
    R.envDay = buildEnv(R, false);
    scene.environment = R.envDay;

    R.hemi = new T.HemisphereLight(0xffffff, 0x4f8f4a, 0.9);
    scene.add(R.hemi);
    R.sun = new T.DirectionalLight(0xffffff, 2.5);
    R.sun.castShadow = true;
    var sh = opts.shadow || {};
    R.sun.shadow.mapSize.set(sh.size || 1536, sh.size || 1536);
    var box = sh.box || [-14, 14, 22, -12];
    var sc = R.sun.shadow.camera;
    sc.left = box[0];
    sc.right = box[1];
    sc.top = box[2];
    sc.bottom = box[3];
    sc.near = 5;
    sc.far = sh.far || 140;
    R.sun.shadow.bias = -0.0004;
    R.sun.shadow.normalBias = 0.03;
    R.sun.shadow.radius = 2.2;
    scene.add(R.sun);
    scene.add(R.sun.target);
    R.fill = new T.DirectionalLight(0xdfe8ff, 0.5);
    scene.add(R.fill);
    scene.add(R.fill.target);
    R.sunDist = sh.dist || 60;
    R.focusAt = new T.Vector3();

    R.fx = particles(R, opts.fxMax || 500, true);
    R.dust = particles(R, opts.dustMax || 400, false);

    applyTheme(R, THEMES[opts.theme || "day"], 1);
    R.thTo = THEMES[opts.theme || "day"];
    return R;
  }

  var tmpC = null;
  function applyTheme(R, to, k) {
    if (!tmpC) tmpC = new T.Color();
    var th = R.th;
    COLOR_KEYS.forEach(function (key) {
      th[key].lerp(tmpC.setHex(to[key]), k);
    });
    NUM_KEYS.forEach(function (key) {
      th[key] = th[key] == null ? to[key] : th[key] + (to[key] - th[key]) * k;
    });
    R.tmp.set(to.dir[0], to.dir[1], to.dir[2]).normalize();
    if (k >= 1) th.dir.copy(R.tmp);
    else th.dir.lerp(R.tmp, k).normalize();
    var u = R.sky.material.uniforms;
    u.uTop.value.copy(th.top);
    u.uMid.value.copy(th.mid);
    u.uLow.value.copy(th.low);
    u.uGlow.value.copy(th.glow);
    u.uCloud.value.copy(th.cloud);
    u.uCloudA.value = th.cloudA;
    u.uStars.value = th.stars;
    u.uSunDir.value.copy(th.dir);
    R.scene.fog.color.copy(th.fog);
    R.hemi.color.copy(th.hemiSky);
    R.hemi.groundColor.copy(th.hemiGround);
    R.hemi.intensity = th.hemiI;
    R.sun.color.copy(th.sun);
    R.sun.intensity = th.sunI;
    R.fill.intensity = th.fillI;
    R.renderer.toneMappingExposure = th.exposure;
  }
  function setTheme(R, name, instant) {
    if (!R || !THEMES[name]) return;
    R.thTo = THEMES[name];
    R.themeName = name;
    if (instant) applyTheme(R, R.thTo, 1);
  }

  function resize(R, W, H, fovFn) {
    if (!R) return;
    R.W = W;
    R.H = H;
    R.renderer.setSize(W, H, false);
    var cv = R.renderer.domElement;
    if (cv && cv.style) {
      cv.style.width = W + "px";
      cv.style.height = H + "px";
    }
    R.camera.aspect = W / Math.max(1, H);
    if (fovFn) R.camera.fov = fovFn(R.camera.aspect);
    R.baseFov = R.camera.fov;
    R.camera.updateProjectionMatrix();
  }

  /** Gölge kutusunu ve dolgu ışığını odak noktasına taşı. */
  function focus(R, x, y, z) {
    R.focusAt.set(x, y, z);
  }

  /** Her karede: tema geçişi, gökyüzü, ışık, parçacıklar. */
  function tick(R, dt) {
    R.U.time.value = A.time;
    if (R.thTo) applyTheme(R, R.thTo, 1 - Math.exp(-1.6 * dt));
    R.sky.position.copy(R.camera.position);
    var f = R.focusAt;
    R.sun.position.set(f.x + R.th.dir.x * R.sunDist, f.y + R.th.dir.y * R.sunDist, f.z + R.th.dir.z * R.sunDist);
    R.sun.target.position.copy(f);
    R.fill.position.set(f.x - R.th.dir.x * 30, f.y + 22, f.z + 26);
    R.fill.target.position.copy(f);
    var scale = (R.H * R.renderer.getPixelRatio()) / (2 * Math.tan((R.camera.fov * Math.PI) / 360));
    R.fx.step(dt, scale);
    R.dust.step(dt, scale);
  }

  /** Kare süresi uzarsa: önce piksel oranı, sonra gölgeler kapanır. */
  function adapt(R, dt, idle) {
    var perf = R.perf;
    if (!dt || perf.step >= 2 || idle) return;
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
      R.renderer.setSize(R.W, R.H, false);
    } else {
      R.renderer.shadowMap.enabled = false;
      R.scene.traverse(function (o) {
        if (o.material)
          (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) {
            m.needsUpdate = true;
          });
      });
    }
  }

  function draw(R) {
    K.syncAll();
    R.renderer.render(R.scene, R.camera);
  }

  /** Dünya → ekran (kıvrık dünya dahil). s: o derinlikte 1 m'nin piksel karşılığı. */
  function project(R, x, y, z) {
    var v = R.tmp.set(x, y, z).applyMatrix4(R.camera.matrixWorldInverse);
    if (curve.on) {
      v.x += curve.x * v.z * v.z;
      v.y += curve.y * v.z * v.z;
    }
    var depth = -v.z;
    v.applyMatrix4(R.camera.projectionMatrix);
    var s = R.H / (2 * Math.tan((R.camera.fov * Math.PI) / 360) * Math.max(0.5, depth));
    return { x: (v.x * 0.5 + 0.5) * R.W, y: (-v.y * 0.5 + 0.5) * R.H, s: s, behind: depth < 0.2 };
  }

  /** Ekran noktası → zemin düzlemi (y = 0). Dokunuşla hücre seçimi. */
  var ray = null, ndc = null;
  function pickGround(R, sx, sy) {
    if (!ray) {
      ray = new T.Raycaster();
      ndc = new T.Vector2();
    }
    ndc.set((sx / R.W) * 2 - 1, -(sy / R.H) * 2 + 1);
    ray.setFromCamera(ndc, R.camera);
    var o = ray.ray.origin, d = ray.ray.direction;
    if (Math.abs(d.y) < 1e-5) return null;
    var t = -o.y / d.y;
    if (t < 0) return null;
    return { x: o.x + d.x * t, z: o.z + d.z * t };
  }

  /* ─────────────────────────── parçacıklar ─────────────────────────── */

  var P_VERT = [
    "attribute vec4 aColor; attribute float aSize; uniform float uScale; varying vec4 vColor;",
    "void main(){",
    "  vColor = aColor;",
    "  vec4 mv = modelViewMatrix * vec4(position, 1.0);",
    "  mv.xy += vec2(CURVE_X, CURVE_Y) * mv.z * mv.z;",
    "  gl_PointSize = aSize * uScale / max(0.1, -mv.z);",
    "  gl_Position = projectionMatrix * mv;",
    "}",
  ].join("\n");
  var P_FRAG = [
    "varying vec4 vColor; uniform float uSoft;",
    "void main(){",
    "  float d = length(gl_PointCoord - 0.5) * 2.0;",
    "  float a = smoothstep(1.0, uSoft, d) * vColor.a;",
    "  if (a < 0.004) discard;",
    "  gl_FragColor = vec4(vColor.rgb, a);",
    "  #include <colorspace_fragment>",
    "}",
  ].join("\n");

  /**
   * Nokta parçacıkları. additive: ışıyan (kıvılcım, parlama); değilse mat
   * (toz, çim, konfeti). emit({ x, y, z, vx, vy, vz, life, size, size2, color,
   * alpha, gravity, drag }) · burst(n, o) o.speed / o.spread / o.up ile saçar.
   */
  function particles(R, max, additive) {
    var pos = new Float32Array(max * 3), col = new Float32Array(max * 4), size = new Float32Array(max);
    var vel = new Float32Array(max * 3), life = new Float32Array(max), span = new Float32Array(max);
    var grav = new Float32Array(max), drag = new Float32Array(max), s0 = new Float32Array(max), s1 = new Float32Array(max), a0 = new Float32Array(max);
    var geo = new T.BufferGeometry();
    geo.setAttribute("position", new T.BufferAttribute(pos, 3));
    geo.setAttribute("aColor", new T.BufferAttribute(col, 4));
    geo.setAttribute("aSize", new T.BufferAttribute(size, 1));
    var mat = new T.ShaderMaterial({
      uniforms: { uScale: { value: 500 }, uSoft: { value: additive ? 0.0 : 0.55 } },
      vertexShader: P_VERT.replace("CURVE_X", curve.x.toFixed(6)).replace("CURVE_Y", curve.y.toFixed(6)),
      fragmentShader: P_FRAG,
      transparent: true,
      depthWrite: false,
      blending: additive ? T.AdditiveBlending : T.NormalBlending,
    });
    var pts = new T.Points(geo, mat);
    pts.frustumCulled = false;
    pts.renderOrder = additive ? 6 : 5;
    R.scene.add(pts);
    var n = 0;
    var c = new T.Color();
    function emit(o) {
      var i = n < max ? n++ : (Math.random() * max) | 0;
      pos[i * 3] = o.x;
      pos[i * 3 + 1] = o.y;
      pos[i * 3 + 2] = o.z;
      vel[i * 3] = o.vx || 0;
      vel[i * 3 + 1] = o.vy || 0;
      vel[i * 3 + 2] = o.vz || 0;
      life[i] = span[i] = o.life || 0.6;
      grav[i] = o.gravity == null ? 9 : o.gravity;
      drag[i] = o.drag == null ? 1.5 : o.drag;
      s0[i] = o.size || 0.2;
      s1[i] = o.size2 == null ? s0[i] * 0.3 : o.size2;
      a0[i] = o.alpha == null ? 1 : o.alpha;
      var color = Array.isArray(o.color) ? o.color[(Math.random() * o.color.length) | 0] : o.color || "#ffffff";
      c.set(color);
      col[i * 4] = c.r;
      col[i * 4 + 1] = c.g;
      col[i * 4 + 2] = c.b;
      col[i * 4 + 3] = a0[i];
      size[i] = s0[i];
    }
    function burst(count, o) {
      if (A.reduceMotion) count = Math.ceil(count / 3);
      var sp = o.speed || 4, up = o.up == null ? 1 : o.up, spread = o.spread == null ? 1 : o.spread;
      for (var k = 0; k < count; k++) {
        var ang = Math.random() * Math.PI * 2, v = sp * (0.35 + Math.random() * 0.75);
        emit({
          x: o.x + (Math.random() - 0.5) * (o.jitter || 0),
          y: o.y + (Math.random() - 0.5) * (o.jitter || 0),
          z: o.z + (Math.random() - 0.5) * (o.jitter || 0),
          vx: (o.vx || 0) + Math.cos(ang) * v * spread,
          vy: (o.vy || 0) + v * up * (0.3 + Math.random()),
          vz: (o.vz || 0) + Math.sin(ang) * v * spread,
          life: (o.life || 0.6) * (0.6 + Math.random() * 0.6),
          size: (o.size || 0.2) * (0.6 + Math.random() * 0.8),
          size2: o.size2,
          color: o.color,
          alpha: o.alpha,
          gravity: o.gravity,
          drag: o.drag,
        });
      }
    }
    function step(dt, scale) {
      mat.uniforms.uScale.value = scale;
      for (var i = n - 1; i >= 0; i--) {
        life[i] -= dt;
        if (life[i] <= 0) {
          n -= 1;
          if (i !== n) {
            // sondakini boşalan yuvaya taşı
            for (var k = 0; k < 3; k++) {
              pos[i * 3 + k] = pos[n * 3 + k];
              vel[i * 3 + k] = vel[n * 3 + k];
            }
            for (k = 0; k < 4; k++) col[i * 4 + k] = col[n * 4 + k];
            life[i] = life[n];
            span[i] = span[n];
            grav[i] = grav[n];
            drag[i] = drag[n];
            s0[i] = s0[n];
            s1[i] = s1[n];
            a0[i] = a0[n];
            size[i] = size[n];
          }
          continue;
        }
        var d = Math.exp(-drag[i] * dt);
        vel[i * 3] *= d;
        vel[i * 3 + 1] = vel[i * 3 + 1] * d - grav[i] * dt;
        vel[i * 3 + 2] *= d;
        pos[i * 3] += vel[i * 3] * dt;
        pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
        pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        if (pos[i * 3 + 1] < 0.02 && grav[i] > 0) {
          pos[i * 3 + 1] = 0.02;
          vel[i * 3 + 1] *= -0.35;
        }
        var t = 1 - life[i] / span[i];
        size[i] = s0[i] + (s1[i] - s0[i]) * t;
        col[i * 4 + 3] = a0[i] * Math.min(1, (1 - t) * 2.2);
      }
      geo.setDrawRange(0, n);
      geo.attributes.position.needsUpdate = true;
      geo.attributes.aColor.needsUpdate = true;
      geo.attributes.aSize.needsUpdate = true;
    }
    return { emit: emit, burst: burst, step: step, clear: function () { n = 0; }, count: function () { return n; } };
  }

  /* ─────────────────────────── mini futbolcular ─────────────────────────── */

  var SKINS = ["#F3CDA8", "#E6B88E", "#D09A6E", "#A87048", "#7A4B2E", "#F7D9BC"];
  var HAIRS = ["#1b130d", "#2a1b12", "#3d2817", "#0e0e0e", "#6b4a2a", "#b38b5d", "#d9d2c5"];
  var BOOTS = ["#111827", "#F8FAFC", "#E11D48", "#F97316", "#FACC15", "#22D3EE"];

  /** Forma renkleri + tohumdan ten/saç/krampon. */
  function look(kit, seed) {
    kit = kit || {};
    seed = (seed == null ? 0 : seed) >>> 0;
    var prim = kit.primary || "#5B3DF5", sec = kit.secondary || "#FFFFFF";
    var c = function (hex) {
      return new T.Color(hex);
    };
    var shorts = c(sec);
    // beyaz şort çimde patlamasın: hafif gri
    if (shorts.r > 0.9 && shorts.g > 0.9 && shorts.b > 0.9) shorts.setHex(0xe8edf5);
    return {
      shirt: c(prim),
      trim: c(sec),
      shorts: shorts,
      socks: c(prim),
      skin: c(SKINS[seed % SKINS.length]),
      hair: c(HAIRS[(seed >>> 3) % HAIRS.length]),
      boots: c(BOOTS[(seed >>> 6) % BOOTS.length]),
      eye: c("#141824"),
    };
  }

  var HIP = 0.44;
  var rig = null;
  function buildRig() {
    if (rig) return rig;
    var N = function () {
      return new T.Object3D();
    };
    var r = { root: N(), body: N(), torso: N(), head: N(), armL: N(), armR: N(), legL: N(), legR: N(), shinL: N(), shinR: N(), footL: N(), footR: N() };
    r.root.add(r.body);
    r.body.add(r.torso, r.legL, r.legR);
    r.torso.add(r.head, r.armL, r.armR);
    r.legL.add(r.shinL);
    r.legR.add(r.shinR);
    r.shinL.add(r.footL);
    r.shinR.add(r.footR);
    r.head.position.set(0, 0.5, 0);
    r.armL.position.set(0.2, 0.3, 0);
    r.armR.position.set(-0.2, 0.3, 0);
    r.legL.position.set(0.09, 0, 0);
    r.legR.position.set(-0.09, 0, 0);
    r.shinL.position.set(0, -0.2, 0);
    r.shinR.position.set(0, -0.2, 0);
    r.footL.position.set(0, -0.2, 0);
    r.footR.position.set(0, -0.2, 0);
    // parça biçimleri: düğüm matrisi × biçim = örnek matrisi
    var S = function (px, py, pz, sx, sy, sz) {
      return new T.Matrix4().compose(new T.Vector3(px, py, pz), new T.Quaternion(), new T.Vector3(sx, sy, sz));
    };
    // kapsül birim: yarıçap 0,5, toplam boy 2 (merkezde)
    r.caps = [
      { node: "torso", m: S(0, 0.17, 0, 0.36, 0.175, 0.25), color: "shirt" },
      { node: "torso", m: S(0, 0.2, 0.002, 0.368, 0.03, 0.258), color: "trim" },
      { node: "body", m: S(0, -0.01, 0, 0.34, 0.085, 0.26), color: "shorts" },
      { node: "armL", m: S(0, -0.13, 0, 0.1, 0.14, 0.1), color: "skin" },
      { node: "armR", m: S(0, -0.13, 0, 0.1, 0.14, 0.1), color: "skin" },
      { node: "legL", m: S(0, -0.09, 0, 0.125, 0.11, 0.125), color: "skin" },
      { node: "legR", m: S(0, -0.09, 0, 0.125, 0.11, 0.125), color: "skin" },
      { node: "shinL", m: S(0, -0.1, 0, 0.11, 0.105, 0.11), color: "socks" },
      { node: "shinR", m: S(0, -0.1, 0, 0.11, 0.105, 0.11), color: "socks" },
      { node: "armL", m: S(0, -0.03, 0, 0.125, 0.055, 0.125), color: "shirt" },
      { node: "armR", m: S(0, -0.03, 0, 0.125, 0.055, 0.125), color: "shirt" },
    ];
    // küre birim: yarıçap 0,5
    r.balls = [
      { node: "head", m: S(0, 0, 0, 0.38, 0.38, 0.38), color: "skin" },
      { node: "head", m: S(0, 0.045, -0.035, 0.395, 0.36, 0.385), color: "hair" },
      { node: "head", m: S(0.07, 0.01, 0.165, 0.05, 0.065, 0.04), color: "eye" },
      { node: "head", m: S(-0.07, 0.01, 0.165, 0.05, 0.065, 0.04), color: "eye" },
      { node: "footL", m: S(0, 0.0, 0.045, 0.12, 0.085, 0.22), color: "boots" },
      { node: "footR", m: S(0, 0.0, 0.045, 0.12, 0.085, 0.22), color: "boots" },
      { node: "armL", m: S(0, -0.28, 0, 0.1, 0.1, 0.1), color: "skin" },
      { node: "armR", m: S(0, -0.28, 0, 0.1, 0.1, 0.1), color: "skin" },
    ];
    r.nodes = ["body", "torso", "head", "armL", "armR", "legL", "legR", "shinL", "shinR", "footL", "footR"];
    rig = r;
    return r;
  }

  function sat(v) {
    return v < 0 ? 0 : v > 1 ? 1 : v;
  }
  function ease(t) {
    t = sat(t);
    return t * t * (3 - 2 * t);
  }

  /**
   * Prosedürel pozlar. t: döngülerde faz (radyan), tek seferliklerde 0..1.
   * Bacak öne = −x dönüş; diz bükme = +x; kol öne = −x.
   */
  var POSE = {
    idle: function (r, t) {
      var b = Math.sin(t * 2);
      r.body.position.y = HIP + b * 0.008;
      r.torso.rotation.x = 0.03 + b * 0.015;
      r.armL.rotation.z = 0.14;
      r.armR.rotation.z = -0.14;
      r.armL.rotation.x = b * 0.05;
      r.armR.rotation.x = -b * 0.05;
      r.head.rotation.y = Math.sin(t * 0.7) * 0.18;
    },
    /** Hazır bekleyiş: dizler kırık, yaylanır. */
    ready: function (r, t) {
      var b = Math.sin(t * 5);
      r.body.position.y = HIP - 0.05 + b * 0.012;
      r.body.rotation.x = 0.16;
      r.legL.rotation.x = -0.5;
      r.legR.rotation.x = -0.5;
      r.legL.rotation.z = 0.2;
      r.legR.rotation.z = -0.2;
      r.shinL.rotation.x = 0.75;
      r.shinR.rotation.x = 0.75;
      r.armL.rotation.set(-0.5, 0, 0.5);
      r.armR.rotation.set(-0.5, 0, -0.5);
    },
    run: function (r, t) {
      var s = Math.sin(t), c = Math.cos(t);
      r.body.position.y = HIP + Math.abs(c) * 0.045 - 0.01;
      r.body.rotation.x = 0.24;
      r.torso.rotation.y = s * 0.22;
      r.legL.rotation.x = -s * 1.0 - 0.1;
      r.legR.rotation.x = s * 1.0 - 0.1;
      r.shinL.rotation.x = 0.25 + Math.max(0, c) * 1.25;
      r.shinR.rotation.x = 0.25 + Math.max(0, -c) * 1.25;
      r.armL.rotation.x = s * 1.05;
      r.armR.rotation.x = -s * 1.05;
      r.armL.rotation.z = 0.12;
      r.armR.rotation.z = -0.12;
      r.head.rotation.x = -0.12;
    },
    walk: function (r, t) {
      var s = Math.sin(t), c = Math.cos(t);
      r.body.position.y = HIP + Math.abs(c) * 0.018;
      r.body.rotation.x = 0.1;
      r.torso.rotation.y = s * 0.12;
      r.legL.rotation.x = -s * 0.55;
      r.legR.rotation.x = s * 0.55;
      r.shinL.rotation.x = 0.1 + Math.max(0, c) * 0.6;
      r.shinR.rotation.x = 0.1 + Math.max(0, -c) * 0.6;
      r.armL.rotation.x = s * 0.5;
      r.armR.rotation.x = -s * 0.5;
      r.armL.rotation.z = 0.1;
      r.armR.rotation.z = -0.1;
    },
    /** Şut: geri salınım (0–0,35), vuruş (0,35–0,5), devam (0,5–1). */
    kick: function (r, t) {
      var wind = ease(t / 0.35), hit = ease((t - 0.35) / 0.15), rec = ease((t - 0.55) / 0.45);
      var leg = wind * 1.0 - hit * 2.3 + rec * 1.3;
      r.body.position.y = HIP + hit * 0.03 - rec * 0.03;
      r.body.rotation.x = 0.1 - wind * 0.18 + hit * 0.3 - rec * 0.12;
      r.torso.rotation.y = -wind * 0.35 + hit * 0.6 - rec * 0.25;
      r.legR.rotation.x = leg;
      r.shinR.rotation.x = wind * 1.2 - hit * 1.15 - rec * 0.05;
      r.legL.rotation.x = -0.12;
      r.shinL.rotation.x = 0.2;
      r.armL.rotation.set(-0.5 * wind + 0.9 * hit - 0.4 * rec, 0, 0.5 + 0.4 * wind - 0.5 * rec);
      r.armR.rotation.set(0.7 * wind - 0.9 * hit + 0.2 * rec, 0, -0.35);
    },
    /** Kayarak müdahale: gövde geriye yatar, bir bacak öne uzanır. */
    slide: function (r, t) {
      var k = ease(t / 0.25);
      r.body.position.y = HIP - 0.27 * k;
      r.body.rotation.x = -1.05 * k;
      r.legR.rotation.x = -0.45 * k;
      r.shinR.rotation.x = 0.05;
      r.legL.rotation.x = -0.15 * k;
      r.shinL.rotation.x = 1.5 * k;
      r.armL.rotation.set(0.6 * k, 0, 0.9 * k);
      r.armR.rotation.set(0.9 * k, 0, -0.4 * k);
      r.head.rotation.x = 0.6 * k;
    },
    jump: function (r, t) {
      var k = Math.sin(sat(t) * Math.PI);
      r.body.rotation.x = 0.12;
      r.legL.rotation.x = -1.0 * k;
      r.legR.rotation.x = -0.5 * k;
      r.shinL.rotation.x = 1.5 * k;
      r.shinR.rotation.x = 1.2 * k;
      r.armL.rotation.set(-2.4 * k, 0, 0.3);
      r.armR.rotation.set(-2.2 * k, 0, -0.3);
    },
    /** Sırtüstü düşme: 0..1; sonunda yerde yatar. */
    fall: function (r, t) {
      var k = ease(t / 0.55);
      r.body.position.y = HIP - 0.3 * k + Math.sin(sat(t / 0.55) * Math.PI) * 0.16;
      r.body.rotation.x = -1.5 * k;
      r.legL.rotation.x = -0.9 * k + 0.5 * ease((t - 0.5) / 0.4);
      r.legR.rotation.x = -0.5 * k + 0.35 * ease((t - 0.5) / 0.4);
      r.shinL.rotation.x = 0.7 * k;
      r.shinR.rotation.x = 0.3 * k;
      r.armL.rotation.set(-1.2 * k, 0, 1.3 * k);
      r.armR.rotation.set(-1.0 * k, 0, -1.3 * k);
      r.head.rotation.x = 0.3 * k;
    },
    cheer: function (r, t) {
      var j = Math.abs(Math.sin(t * 2.6));
      r.body.position.y = HIP + j * 0.16;
      r.legL.rotation.x = -0.3 * j;
      r.legR.rotation.x = -0.1 * j;
      r.shinL.rotation.x = 0.7 * j;
      r.shinR.rotation.x = 0.5 * j;
      r.armL.rotation.set(-2.7 + Math.sin(t * 5.2) * 0.2, 0, 0.35);
      r.armR.rotation.set(-2.7 - Math.sin(t * 5.2) * 0.2, 0, -0.35);
      r.head.rotation.x = -0.25;
    },
    /** Duvar: kollar iki yana açık, yere sağlam basar. */
    block: function (r, t) {
      var b = Math.sin(t * 3);
      r.body.position.y = HIP - 0.035 + b * 0.008;
      r.legL.rotation.z = 0.28;
      r.legR.rotation.z = -0.28;
      r.legL.rotation.x = -0.25;
      r.legR.rotation.x = -0.25;
      r.shinL.rotation.x = 0.4;
      r.shinR.rotation.x = 0.4;
      r.armL.rotation.set(0, 0, 1.25 + b * 0.05);
      r.armR.rotation.set(0, 0, -1.25 - b * 0.05);
      r.body.rotation.x = 0.06;
    },
    /** Top çalma / ısırma: öne eğilip ayakla dürter (döngü). */
    tackle: function (r, t) {
      var s = Math.sin(t * 9), k = Math.max(0, s);
      r.body.position.y = HIP - 0.03;
      r.body.rotation.x = 0.3 + k * 0.12;
      r.legR.rotation.x = -0.25 - k * 0.95;
      r.shinR.rotation.x = 0.6 - k * 0.5;
      r.legL.rotation.x = 0.2;
      r.shinL.rotation.x = 0.35;
      r.armL.rotation.set(0.5, 0, 0.5);
      r.armR.rotation.set(-0.4, 0, -0.5);
    },
    /** Kaleci: kollar yukarıda yaylanır. */
    keeper: function (r, t) {
      var b = Math.sin(t * 4);
      r.body.position.y = HIP - 0.04 + Math.abs(b) * 0.03;
      r.legL.rotation.z = 0.3;
      r.legR.rotation.z = -0.3;
      r.legL.rotation.x = -0.3;
      r.legR.rotation.x = -0.3;
      r.shinL.rotation.x = 0.5;
      r.shinR.rotation.x = 0.5;
      r.armL.rotation.set(-0.3, 0, 1.9 + b * 0.12);
      r.armR.rotation.set(-0.3, 0, -1.9 - b * 0.12);
    },
  };

  /**
   * Örneklenmiş mini futbolcular. Kullanım (her karede):
   *   crowd.begin();
   *   crowd.add({ x, y, z, ry, s, anim, t, look, flash, sy, rx, rz, alpha });
   *   crowd.end();
   */
  function minis(R, max) {
    var r = buildRig();
    var capGeo = new T.CapsuleGeometry(0.5, 1, 4, 10);
    var ballGeo = new T.SphereGeometry(0.5, 14, 10);
    var mat = new T.MeshStandardMaterial({ roughness: 0.62, metalness: 0, envMapIntensity: 0.55 });
    var caps = new T.InstancedMesh(capGeo, mat, max * r.caps.length);
    var orbs = new T.InstancedMesh(ballGeo, mat, max * r.balls.length);
    [caps, orbs].forEach(function (m) {
      m.castShadow = true;
      m.receiveShadow = false;
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(T.DynamicDrawUsage);
      m.count = 0;
      R.scene.add(m);
    });
    // instanceColor'ı baştan kur
    var c0 = new T.Color(1, 1, 1);
    caps.setColorAt(0, c0);
    orbs.setColorAt(0, c0);
    caps.instanceColor.setUsage(T.DynamicDrawUsage);
    orbs.instanceColor.setUsage(T.DynamicDrawUsage);
    var nc = 0, nb = 0, count = 0;
    var m4 = new T.Matrix4(), col = new T.Color(), white = new T.Color(1, 1, 1);
    function begin() {
      nc = 0;
      nb = 0;
      count = 0;
    }
    function add(o) {
      if (count >= max) return;
      count += 1;
      // sıfırla
      for (var i = 0; i < r.nodes.length; i++) r[r.nodes[i]].rotation.set(0, 0, 0);
      r.body.position.set(0, HIP, 0);
      (POSE[o.anim] || POSE.idle)(r, o.t || 0);
      var s = o.s == null ? 1 : o.s;
      r.root.position.set(o.x, o.y || 0, o.z);
      r.root.rotation.set(o.rx || 0, o.ry || 0, o.rz || 0);
      var sy = o.sy == null ? 1 : o.sy;
      // ez-uzat: hacim korunur
      var sx = sy === 1 ? 1 : 1 / Math.sqrt(sy);
      r.root.scale.set(s * sx, s * sy, s * sx);
      r.root.updateMatrixWorld(true);
      var L = o.look, flash = o.flash || 0, dim = o.dim == null ? 1 : o.dim;
      var k, part;
      for (k = 0; k < r.caps.length; k++) {
        part = r.caps[k];
        m4.multiplyMatrices(r[part.node].matrixWorld, part.m);
        caps.setMatrixAt(nc, m4);
        col.copy(L[part.color]);
        if (dim !== 1) col.multiplyScalar(dim);
        if (flash > 0) col.lerp(white, flash);
        caps.setColorAt(nc, col);
        nc += 1;
      }
      for (k = 0; k < r.balls.length; k++) {
        part = r.balls[k];
        m4.multiplyMatrices(r[part.node].matrixWorld, part.m);
        orbs.setMatrixAt(nb, m4);
        col.copy(L[part.color]);
        if (dim !== 1) col.multiplyScalar(dim);
        if (flash > 0) col.lerp(white, flash);
        orbs.setColorAt(nb, col);
        nb += 1;
      }
    }
    function end() {
      caps.count = nc;
      orbs.count = nb;
      caps.instanceMatrix.needsUpdate = true;
      orbs.instanceMatrix.needsUpdate = true;
      caps.instanceColor.needsUpdate = true;
      orbs.instanceColor.needsUpdate = true;
    }
    return { begin: begin, add: add, end: end, max: max, meshes: [caps, orbs] };
  }

  /* ─────────────────────────── toplar ─────────────────────────── */

  var ballTex = null;
  function ballTexture(R) {
    if (ballTex) return ballTex;
    if (A.S3 && A.S3.ballTexture) {
      A.S3.use(R);
      ballTex = A.S3.ballTexture();
    }
    return ballTex;
  }

  /** Örneklenmiş toplar: begin() · add(x, y, z, dönüş, ölçek, renk) · end(). */
  function balls(R, max, radius) {
    var geo = new T.SphereGeometry(radius, 18, 12);
    var mat = new T.MeshStandardMaterial({ map: ballTexture(R), roughness: 0.4, metalness: 0, envMapIntensity: 0.8 });
    var mesh = new T.InstancedMesh(geo, mat, max);
    mesh.castShadow = true;
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
    mesh.setColorAt(0, new T.Color(1, 1, 1));
    mesh.count = 0;
    R.scene.add(mesh);
    var n = 0, m4 = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler(), p = new T.Vector3(), sc = new T.Vector3(), col = new T.Color();
    return {
      begin: function () {
        n = 0;
      },
      add: function (x, y, z, spin, scale, color) {
        if (n >= max) return;
        e.set(spin || 0, (spin || 0) * 0.37, 0);
        q.setFromEuler(e);
        p.set(x, y, z);
        sc.setScalar(scale == null ? 1 : scale);
        m4.compose(p, q, sc);
        mesh.setMatrixAt(n, m4);
        mesh.setColorAt(n, color ? col.set(color) : col.setRGB(1, 1, 1));
        n += 1;
      },
      end: function () {
        mesh.count = n;
        mesh.instanceMatrix.needsUpdate = true;
        mesh.instanceColor.needsUpdate = true;
      },
      mesh: mesh,
    };
  }

  /** Tek, yüksek ayrıntılı top (kahramanın topu). */
  function ball(R, radius) {
    var m = new T.Mesh(new T.SphereGeometry(radius, 36, 24), new T.MeshPhysicalMaterial({ map: ballTexture(R), roughness: 0.4, clearcoat: 0.7, clearcoatRoughness: 0.2 }));
    m.castShadow = true;
    R.scene.add(m);
    return m;
  }

  /* ─────────────────────────── çim ─────────────────────────── */

  /**
   * Dama desenli parlak çim dokusu (tekrar eder). cols × rows kare; her kare
   * açık/koyu yeşil, ince gürültü ve biçme çizgileriyle.
   */
  function turfTexture(cols, rows, a, b, px) {
    px = px || 96;
    return K.canvasTex(cols * px, rows * px, function (c, w, h) {
      for (var y = 0; y < rows; y++)
        for (var x = 0; x < cols; x++) {
          c.fillStyle = (x + y) % 2 ? a : b;
          c.fillRect(x * px, y * px, px, px);
        }
      var rnd = A.seeded(7);
      for (var n = 0; n < cols * rows * 240; n++) {
        c.fillStyle = rnd() < 0.5 ? "rgba(255,255,255,0.045)" : "rgba(0,40,0,0.06)";
        c.fillRect(rnd() * w, rnd() * h, 1.5, 2 + rnd() * 4);
      }
    }, true);
  }

  /* ─────────────────────────── tribün şeridi ─────────────────────────── */

  /**
   * Seyirci dokusu (yatayda tekrar eder): sıra sıra taraftar; üst yarı ev
   * sahibinin, alt yarı rakibin renkleri baskın. paintCrowd ile yeniden boyanır.
   */
  var CROWD_W = 512, CROWD_H = 256, CROWD_ROWS = 8, CROWD_COLS = 20;
  function paintCrowd(tex, kitA, kitB) {
    var c = tex.userData.ctx;
    var rnd = A.seeded(19);
    var rowH = CROWD_H / CROWD_ROWS, colW = CROWD_W / CROWD_COLS;
    var neutral = ["#E2E8F0", "#334155", "#F8FAFC", "#64748B", "#FDE68A"];
    for (var r = 0; r < CROWD_ROWS; r++) {
      c.fillStyle = r % 2 ? "#36407a" : "#2c356a";
      c.fillRect(0, r * rowH, CROWD_W, rowH);
      for (var k = 0; k < CROWD_COLS; k++) {
        if (rnd() < 0.06) continue;
        var kit = rnd() < 0.5 ? kitA : kitB;
        var pick = rnd();
        var shirt = pick < 0.5 ? kit.primary : pick < 0.78 ? kit.secondary : neutral[(rnd() * neutral.length) | 0];
        var x = k * colW + colW / 2 + (rnd() - 0.5) * 4, y = r * rowH;
        var up = rnd() < 0.3;
        c.fillStyle = shirt;
        c.beginPath();
        c.moveTo(x - colW * 0.4, y + rowH);
        c.lineTo(x - colW * 0.4, y + rowH * 0.62);
        c.quadraticCurveTo(x, y + rowH * 0.4, x + colW * 0.4, y + rowH * 0.62);
        c.lineTo(x + colW * 0.4, y + rowH);
        c.closePath();
        c.fill();
        if (up) {
          c.strokeStyle = shirt;
          c.lineWidth = 4;
          c.lineCap = "round";
          c.beginPath();
          c.moveTo(x - colW * 0.3, y + rowH * 0.66);
          c.lineTo(x - colW * 0.42, y + rowH * 0.2);
          c.moveTo(x + colW * 0.3, y + rowH * 0.66);
          c.lineTo(x + colW * 0.42, y + rowH * 0.2);
          c.stroke();
        }
        c.fillStyle = SKINS[(rnd() * SKINS.length) | 0];
        c.beginPath();
        c.arc(x, y + rowH * 0.42, colW * 0.24, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = HAIRS[(rnd() * HAIRS.length) | 0];
        c.beginPath();
        c.arc(x, y + rowH * 0.38, colW * 0.245, Math.PI, Math.PI * 2);
        c.fill();
      }
    }
    tex.needsUpdate = true;
  }
  function crowdTexture(kitA, kitB) {
    var tex = K.canvasTex(CROWD_W, CROWD_H, function () {}, true);
    paintCrowd(tex, kitA, kitB);
    return tex;
  }

  /**
   * Yol boyunca uzanan eğimli tribün (tek dörtgen, seyirci dokulu) + çatı
   * saçağı. side: −1 sol, +1 sağ; x0: ön kenarın merkeze uzaklığı. İleri −z.
   */
  function standStrip(R, len, side, x0, tex, opts) {
    opts = opts || {};
    var depth = opts.depth || 8, rise = opts.rise || 4.6, base = opts.base || 1.1;
    var g = new T.BufferGeometry();
    var xa = side * x0, xb = side * (x0 + depth);
    var h = len / 2;
    g.setAttribute("position", new T.BufferAttribute(new Float32Array([xa, base, h, xa, base, -h, xb, base + rise, -h, xa, base, h, xb, base + rise, -h, xb, base + rise, h]), 3));
    var ur = len / 9, vr = Math.hypot(depth, rise) / 6.2;
    g.setAttribute("uv", new T.BufferAttribute(new Float32Array([0, 0, ur, 0, ur, vr, 0, 0, ur, vr, 0, vr]), 2));
    g.computeVertexNormals();
    var grp = new T.Group();
    var seats = new T.Mesh(g, new T.MeshLambertMaterial({ map: tex, side: T.DoubleSide }));
    grp.add(seats);
    var wall = new T.Mesh(new T.BoxGeometry(0.3, base, len), new T.MeshLambertMaterial({ color: opts.wall || 0xeef2ff }));
    wall.position.set(side * (x0 - 0.15), base / 2, 0);
    grp.add(wall);
    // üst korkuluk + renkli bayrak şeridi
    var rim = new T.Mesh(new T.BoxGeometry(0.5, 1.1, len), new T.MeshLambertMaterial({ color: opts.back || 0xf8fafc }));
    rim.position.set(side * (x0 + depth + 0.25), base + rise + 0.2, 0);
    grp.add(rim);
    var flagTex = K.canvasTex(256, 32, function (c) {
      var cols = ["#F43F5E", "#FACC15", "#38BDF8", "#A78BFA", "#34D399", "#FB923C", "#FFFFFF", "#5B3DF5"];
      for (var i = 0; i < 8; i++) {
        c.fillStyle = cols[i];
        c.beginPath();
        c.moveTo(i * 32 + 2, 0);
        c.lineTo(i * 32 + 30, 0);
        c.lineTo(i * 32 + 16, 30);
        c.closePath();
        c.fill();
      }
    }, true);
    flagTex.repeat.set(len / 10, 1);
    var flags = new T.Mesh(new T.PlaneGeometry(len, 1.0), new T.MeshBasicMaterial({ map: flagTex, transparent: true, alphaTest: 0.3, side: T.DoubleSide }));
    flags.rotation.y = Math.PI / 2;
    flags.position.set(side * (x0 + depth + 0.25), base + rise + 1.6, 0);
    grp.add(flags);
    R.scene.add(grp);
    grp.userData.seats = seats;
    grp.userData.flags = flagTex;
    return grp;
  }

  /* ─────────────────────────── HUD yardımcıları ─────────────────────────── */

  /** Parlak, konturlu oyun rakamı (kapı değerleri, can sayıları). */
  function tag(c, text, x, y, size, fill, back) {
    c.save();
    c.font = A.font(size, 900);
    c.textAlign = "center";
    c.textBaseline = "middle";
    var w = c.measureText(text).width + size * 0.9;
    if (back) {
      A.roundRect(c, x - w / 2, y - size * 0.72, w, size * 1.44, size * 0.5);
      c.fillStyle = back;
      c.fill();
    }
    c.lineJoin = "round";
    c.lineWidth = Math.max(2, size * 0.16);
    c.strokeStyle = "rgba(8,10,30,0.85)";
    if (!back) c.strokeText(text, x, y + 1);
    c.fillStyle = fill || "#FFFFFF";
    c.fillText(text, x, y + 1);
    c.restore();
  }

  A.G3 = {
    THEMES: THEMES,
    stage: stage,
    setTheme: setTheme,
    resize: resize,
    focus: focus,
    tick: tick,
    adapt: adapt,
    draw: draw,
    project: project,
    pickGround: pickGround,
    particles: particles,
    look: look,
    minis: minis,
    balls: balls,
    ball: ball,
    turfTexture: turfTexture,
    crowdTexture: crowdTexture,
    paintCrowd: paintCrowd,
    standStrip: standStrip,
    tag: tag,
    enableCurve: enableCurve,
    curve: curve,
    POSE: POSE,
    HIP: HIP,
  };
})();
