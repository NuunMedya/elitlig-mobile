/*
 * ARENA 3B KİTİ — three.js oyunlarının (Penaltı, Slalom) ortak parçaları.
 *
 *   std / mesh / canvasTex / glowTexture   malzeme, ağ, tuval dokusu, parlama
 *   makeAthlete                            eklemli 3B futbolcu (forma, numara)
 *   rest / runCycle                        poz sıfırlama, koşu döngüsü
 *   disposeTree                            sahneden çıkan nesnenin belleği
 *
 * Yalnız WebGL açılınca kullanılır: oyun init(renderer) çağırır. three.js
 * yoksa (başsız testler) kit tanımlanır ama hiçbir şey çizmez.
 */
(function () {
  "use strict";
  var A = window.Arena;
  var T = window.THREE || (typeof THREE !== "undefined" ? THREE : null); // eslint-disable-line no-undef
  var maxAniso = 1;

  function init(renderer) {
    maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
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
  function inkOn(kit) {
    var lum = function (hex) {
      var c = new T.Color(hex);
      return 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
    };
    return Math.abs(lum(kit.primary) - lum(kit.secondary)) > 0.3 ? kit.secondary : lum(kit.primary) > 0.55 ? "#0B1020" : "#FFFFFF";
  }

  /** Forma sırtı/önü dokusu: soyadı + numara. */
  function shirtTexture(person, kit, back) {
    return canvasTex(256, 256, function (c) {
      c.clearRect(0, 0, 256, 256);
      c.fillStyle = inkOn(kit);
      c.textAlign = "center";
      c.textBaseline = "middle";
      if (back) {
        var name = String(person.back || "").slice(0, 12);
        c.font = "800 " + (name.length > 8 ? 30 : 38) + "px " + A.FONT;
        c.fillText(name, 128, 46);
        c.font = "900 150px " + A.FONT;
        c.fillText(String(person.shirt || ""), 128, 160);
      } else {
        c.font = "900 64px " + A.FONT;
        c.fillText(String(person.shirt || ""), 160, 90);
      }
    });
  }

  /**
   * İnsan figürü: kalça → omurga → boyun → baş; omuz → dirsek → el; kalça
   * eklemi → diz → bilek. Her eklem bir Group (pivot); kapsül uzuvlar.
   * Yerel +z ileri, +y yukarı. Kol/bacak "a" +x, "b" −x tarafıdır.
   */
  function makeAthlete(person, opts) {
    var kit = kitOf(person);
    var seed = hashId(person.id || person.short);
    var skins = [0xf1c9a5, 0xe0ac84, 0xc68b63, 0x9a6440, 0xd9a27c];
    var hairs = [0x1e140e, 0x2b1a10, 0x3b2a1a, 0x111111, 0x5a3a20];
    var skin = std(skins[seed % skins.length], 0.62);
    var hair = std(hairs[(seed >>> 3) % hairs.length], 0.9);
    var shirt = std(kit.primary, 0.78);
    var sec = new T.Color(kit.secondary);
    var shorts = std(opts.keeper ? new T.Color(kit.primary).multiplyScalar(0.45) : sec.getHex() === 0xffffff ? 0xf1f5f9 : sec, 0.8);
    var socks = std(kit.primary, 0.85);
    var boots = std(0x0b1020, 0.35, 0.2);
    var glove = std(0xf8fafc, 0.5);

    var root = new T.Group();
    var J = {};
    function joint(name, parent, x, y, z) {
      var g = new T.Group();
      g.position.set(x, y, z);
      parent.add(g);
      J[name] = g;
      return g;
    }
    function cap(parent, r, len, mat, y, sx, sz) {
      var m = mesh(new T.CapsuleGeometry(r, len, 6, 14), mat);
      m.position.y = y;
      if (sx) m.scale.x = sx;
      if (sz) m.scale.z = sz;
      parent.add(m);
      return m;
    }
    var hips = joint("hips", root, 0, 0.94, 0);
    var pelvis = mesh(new T.CylinderGeometry(0.16, 0.18, 0.24, 16), shorts);
    pelvis.position.y = -0.04;
    pelvis.scale.z = 0.78;
    hips.add(pelvis);
    var spine = joint("spine", hips, 0, 0.08, 0);
    cap(spine, 0.17, 0.26, shirt, 0.24, 1.2, 0.72);
    var backPlate = mesh(new T.PlaneGeometry(0.34, 0.34), new T.MeshStandardMaterial({ map: shirtTexture(person, kit, true), transparent: true, roughness: 0.8, depthWrite: false }), false, false);
    backPlate.position.set(0, 0.27, -0.128);
    backPlate.rotation.y = Math.PI;
    spine.add(backPlate);
    var frontPlate = mesh(new T.PlaneGeometry(0.3, 0.3), new T.MeshStandardMaterial({ map: shirtTexture(person, kit, false), transparent: true, roughness: 0.8, depthWrite: false }), false, false);
    frontPlate.position.set(0, 0.3, 0.128);
    spine.add(frontPlate);
    var collar = mesh(new T.TorusGeometry(0.07, 0.018, 6, 16), std(kit.secondary, 0.7), false, false);
    collar.rotation.x = Math.PI / 2;
    collar.position.set(0, 0.5, 0.01);
    spine.add(collar);
    var neck = joint("neck", spine, 0, 0.5, 0);
    var neckM = mesh(new T.CylinderGeometry(0.05, 0.055, 0.1, 10), skin);
    neckM.position.y = 0.04;
    neck.add(neckM);
    var head = joint("head", neck, 0, 0.12, 0);
    var headM = mesh(new T.SphereGeometry(0.105, 20, 16), skin);
    headM.scale.set(0.95, 1.12, 1.0);
    headM.position.y = 0.08;
    head.add(headM);
    var hairM = mesh(new T.SphereGeometry(0.112, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), hair);
    hairM.scale.set(0.96, 1.08, 1.04);
    hairM.position.set(0, 0.095, -0.008);
    hairM.rotation.x = -0.25;
    head.add(hairM);
    [-1, 1].forEach(function (s) {
      var ear = mesh(new T.SphereGeometry(0.022, 8, 6), skin, false);
      ear.position.set(s * 0.1, 0.08, 0);
      head.add(ear);
    });
    var nose = mesh(new T.SphereGeometry(0.018, 8, 6), skin, false);
    nose.position.set(0, 0.07, 0.1);
    head.add(nose);

    [["a", 1], ["b", -1]].forEach(function (pair) {
      var tag = pair[0], s = pair[1];
      var sh = joint("sh" + tag, spine, s * 0.22, 0.43, 0);
      cap(sh, 0.058, 0.12, shirt, -0.1);
      cap(sh, 0.048, 0.16, opts.keeper ? shirt : skin, -0.2);
      var el = joint("el" + tag, sh, 0, -0.3, 0);
      cap(el, 0.044, 0.18, opts.keeper ? shirt : skin, -0.12);
      var hand = mesh(new T.SphereGeometry(opts.keeper ? 0.068 : 0.046, 12, 10), opts.keeper ? glove : skin);
      hand.position.y = -0.27;
      if (opts.keeper) hand.scale.set(1, 1.15, 0.7);
      el.add(hand);
    });
    [["a", 1], ["b", -1]].forEach(function (pair) {
      var tag = pair[0], s = pair[1];
      var hp = joint("hp" + tag, hips, s * 0.095, -0.06, 0);
      cap(hp, 0.082, 0.14, shorts, -0.1);
      cap(hp, 0.074, 0.2, skin, -0.24);
      var kn = joint("kn" + tag, hp, 0, -0.42, 0);
      cap(kn, 0.062, 0.26, socks, -0.2);
      var ft = joint("ft" + tag, kn, 0, -0.42, 0);
      var boot = mesh(new T.BoxGeometry(0.1, 0.07, 0.25), boots);
      boot.position.set(0, -0.02, 0.06);
      ft.add(boot);
    });
    return { root: root, J: J };
  }

  function disposeTree(obj) {
    obj.traverse(function (o) {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        var ms = Array.isArray(o.material) ? o.material : [o.material];
        ms.forEach(function (m) {
          if (m.map) m.map.dispose();
          m.dispose();
        });
      }
    });
  }

  function rest(a) {
    for (var k in a.J) a.J[k].rotation.set(0, 0, 0);
    a.J.hips.position.y = 0.94;
    a.root.rotation.set(0, 0, 0);
    a.root.position.y = 0;
  }
  /** Koşu döngüsü: φ adım fazı, amp genlik. */
  function runCycle(a, phi, amp) {
    var J = a.J;
    var s = Math.sin(phi);
    J.hpa.rotation.x = -s * 0.75 * amp;
    J.hpb.rotation.x = s * 0.75 * amp;
    J.kna.rotation.x = Math.max(0, s) * 1.3 * amp + 0.15;
    J.knb.rotation.x = Math.max(0, -s) * 1.3 * amp + 0.15;
    J.sha.rotation.x = s * 0.7 * amp;
    J.shb.rotation.x = -s * 0.7 * amp;
    J.ela.rotation.x = -0.9 * amp;
    J.elb.rotation.x = -0.9 * amp;
    J.spine.rotation.x = 0.18 * amp;
    J.hips.position.y = 0.94 - 0.03 * amp + Math.abs(Math.cos(phi)) * 0.05 * amp;
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
  };
})();
