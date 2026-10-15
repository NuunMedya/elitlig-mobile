/**
 * FUTBOLCU MODELİ DÖNÜŞTÜRÜCÜ — Quaternius "Universal Base Characters" (erkek
 * gövde, saç, kaş, göz) ve "Universal Animation Library" (bekleme, yürüme,
 * tempolu koşu, depar) paketlerini 3B oyunlara gömülen tek, küçük bir veri
 * dosyasına (`games/athlete-data.js`) çevirir.
 *
 * Lisans: iki paket de CC0 1.0 (kamu malı) — https://quaternius.com
 *
 * Çalıştırma (bir kez; çıktı depoya işlenir, paketlerin kendisi işlenmez):
 *   node scripts/athlete/build-athlete.mjs <UBC klasörü> <UAL klasörü>
 *
 * Doku işleri (küçültme, JPEG) için Playwright'ın Chromium'u kullanılır:
 * `PLAYWRIGHT_PATH` ile playwright paketinin yolu verilebilir.
 *
 * NE ÇIKAR:
 *   bones   65 kemik: ad, ebeveyn, bağlama (bind) T/R
 *   ibm     ters bağlama matrisleri
 *   parts   gövde, göz, kaş, 3 saç modeli — konumlar/normaller/UV/ağırlıklar
 *           sıkıştırılmış (Uint16/Int8) ve base64
 *   clips   seçili animasyonlar 30 kare/sn, dörtlükler Int16
 *   tex     cilt (1024 JPEG), göz, saç (gri tonlu; çalışma anında boyanır)
 *   mask    bölge haritası (1024 PNG): cilt/forma/şort/tozluk/krampon/…
 *   hand    parmakların sabit duruşu (rahat yumruk; kliplerde parmak yok)
 */

import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const [UBC, UAL1] = process.argv.slice(2);
if (!UAL1) {
  console.error("kullanım: node scripts/athlete/build-athlete.mjs <UBC> <UAL>");
  process.exit(1);
}

/* ─────────────── glTF okuma ─────────────── */

function loadGltf(path) {
  if (path.endsWith(".glb")) {
    const b = readFileSync(path);
    const jsonLen = b.readUInt32LE(12);
    const json = JSON.parse(b.subarray(20, 20 + jsonLen).toString("utf8"));
    const binStart = 20 + jsonLen + 8;
    const binLen = b.readUInt32LE(20 + jsonLen);
    return { json, bins: [b.subarray(binStart, binStart + binLen)] };
  }
  const json = JSON.parse(readFileSync(path, "utf8"));
  const bins = json.buffers.map((buf) => readFileSync(join(dirname(path), buf.uri)));
  return { json, bins };
}
const COMP = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const CT = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
function accessor(g, idx) {
  const a = g.json.accessors[idx];
  const bv = g.json.bufferViews[a.bufferView];
  const buf = g.bins[bv.buffer];
  const n = COMP[a.type];
  const Arr = CT[a.componentType];
  const stride = bv.byteStride || n * Arr.BYTES_PER_ELEMENT;
  const out = new Float64Array(a.count * n);
  const base = buf.byteOffset + (bv.byteOffset || 0) + (a.byteOffset || 0);
  const dv = new DataView(buf.buffer);
  const rd = {
    5120: (o) => dv.getInt8(o),
    5121: (o) => dv.getUint8(o),
    5122: (o) => dv.getInt16(o, true),
    5123: (o) => dv.getUint16(o, true),
    5125: (o) => dv.getUint32(o, true),
    5126: (o) => dv.getFloat32(o, true),
  }[a.componentType];
  for (let i = 0; i < a.count; i++)
    for (let k = 0; k < n; k++) out[i * n + k] = rd(base + i * stride + k * Arr.BYTES_PER_ELEMENT);
  if (a.normalized) {
    const div = { 5120: 127, 5121: 255, 5122: 32767, 5123: 65535 }[a.componentType];
    for (let i = 0; i < out.length; i++) out[i] = Math.max(-1, out[i] / div);
  }
  return out;
}

/* ─────────────── küçük matematik ─────────────── */

const qmul = (a, b) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
const qnorm = (q) => {
  const l = Math.hypot(...q) || 1;
  return q.map((v) => v / l);
};
function mat4FromTRS(t, r, s) {
  const [x, y, z, w] = r;
  const [sx, sy, sz] = s;
  const xx = x * x, yy = y * y, zz = z * z, xy = x * y, xz = x * z, yz = y * z, wx = w * x, wy = w * y, wz = w * z;
  return [
    (1 - 2 * (yy + zz)) * sx, 2 * (xy + wz) * sx, 2 * (xz - wy) * sx, 0,
    2 * (xy - wz) * sy, (1 - 2 * (xx + zz)) * sy, 2 * (yz + wx) * sy, 0,
    2 * (xz + wy) * sz, 2 * (yz - wx) * sz, (1 - 2 * (xx + yy)) * sz, 0,
    t[0], t[1], t[2], 1,
  ];
}
function mat4Mul(a, b) {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
}
function mat4Inv(m) {
  // genel 4×4 tersi (Cramer)
  const inv = new Array(16);
  const [a00, a01, a02, a03, a10, a11, a12, a13, a20, a21, a22, a23, a30, a31, a32, a33] = m;
  const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10;
  const b03 = a01 * a12 - a02 * a11, b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30, b08 = a20 * a33 - a23 * a30;
  const b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
  const det = 1 / (b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06);
  inv[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
  inv[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
  inv[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
  inv[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
  inv[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
  inv[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
  inv[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
  inv[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
  inv[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
  inv[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
  inv[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
  inv[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
  inv[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
  inv[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
  inv[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
  inv[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
  return inv;
}
const xform = (m, p) => [
  m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
  m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
  m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
];

/* ─────────────── kodlama ─────────────── */

const b64 = (typed) => Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength).toString("base64");
const r5 = (v) => Math.round(v * 1e5) / 1e5;

/* ─────────────── gövde + iskelet ─────────────── */

const BODY_DIR = join(UBC, "Base Characters", "Godot - UE");
const body = loadGltf(join(BODY_DIR, "Superhero_Male_FullBody.gltf"));
const skin = body.json.skins[0];
const jointNodes = skin.joints;
const boneNames = jointNodes.map((j) => body.json.nodes[j].name);
const parentOf = {};
body.json.nodes.forEach((n, i) => (n.children || []).forEach((c) => (parentOf[c] = i)));
const bones = jointNodes.map((j) => {
  const n = body.json.nodes[j];
  const p = parentOf[j];
  return {
    n: n.name,
    p: jointNodes.indexOf(p),
    t: (n.translation || [0, 0, 0]).map(r5),
    r: qnorm(n.rotation || [0, 0, 0, 1]).map(r5),
  };
});
const ibm = accessor(body, skin.inverseBindMatrices);
const bindWorld = boneNames.map((_, i) => mat4Inv(Array.from(ibm.subarray(i * 16, i * 16 + 16))));
const jointPos = Object.fromEntries(boneNames.map((n, i) => [n, [bindWorld[i][12], bindWorld[i][13], bindWorld[i][14]]]));

function readPrim(g, prim) {
  const a = prim.attributes;
  return {
    pos: accessor(g, a.POSITION),
    nrm: accessor(g, a.NORMAL),
    uv: accessor(g, a.TEXCOORD_0),
    j: accessor(g, a.JOINTS_0),
    w: accessor(g, a.WEIGHTS_0),
    idx: accessor(g, prim.indices),
  };
}
/** Saç/kaş dosyalarının kendi iskelet sırası ve bağlaması → gövdeninkine çevir. */
function remapToBody(g, p) {
  const sk = g.json.skins[0];
  const names = sk.joints.map((j) => g.json.nodes[j].name);
  const ibmX = accessor(g, sk.inverseBindMatrices);
  const pos = new Float64Array(p.pos.length);
  const nrm = new Float64Array(p.nrm.length);
  const n = p.pos.length / 3;
  for (let v = 0; v < n; v++) {
    // tek kemiğe (Head) bağlı: o kemiğin iki bağlaması arasında taşı
    let best = 0;
    for (let k = 1; k < 4; k++) if (p.w[v * 4 + k] > p.w[v * 4 + best]) best = k;
    const name = names[p.j[v * 4 + best]];
    const bi = boneNames.indexOf(name);
    const m = mat4Mul(bindWorld[bi], Array.from(ibmX.subarray(p.j[v * 4 + best] * 16, p.j[v * 4 + best] * 16 + 16)));
    const q = xform(m, [p.pos[v * 3], p.pos[v * 3 + 1], p.pos[v * 3 + 2]]);
    pos.set(q, v * 3);
    const o = xform(m, [0, 0, 0]);
    const nn = xform(m, [p.nrm[v * 3], p.nrm[v * 3 + 1], p.nrm[v * 3 + 2]]);
    nrm.set([nn[0] - o[0], nn[1] - o[1], nn[2] - o[2]], v * 3);
    for (let k = 0; k < 4; k++) p.j[v * 4 + k] = Math.max(0, boneNames.indexOf(names[p.j[v * 4 + k]]));
  }
  return { ...p, pos, nrm };
}

function packPart(p, opts = {}) {
  const n = p.pos.length / 3;
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let v = 0; v < n; v++)
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], p.pos[v * 3 + k]);
      max[k] = Math.max(max[k], p.pos[v * 3 + k]);
    }
  const pos = new Uint16Array(n * 3);
  for (let v = 0; v < n; v++)
    for (let k = 0; k < 3; k++) pos[v * 3 + k] = Math.round(((p.pos[v * 3 + k] - min[k]) / (max[k] - min[k] || 1)) * 65535);
  const nrm = new Int8Array(n * 3);
  for (let v = 0; v < n; v++) {
    const l = Math.hypot(p.nrm[v * 3], p.nrm[v * 3 + 1], p.nrm[v * 3 + 2]) || 1;
    for (let k = 0; k < 3; k++) nrm[v * 3 + k] = Math.round((p.nrm[v * 3 + k] / l) * 127);
  }
  const uv = new Uint16Array(n * 2);
  for (let i = 0; i < n * 2; i++) uv[i] = Math.round(Math.min(1, Math.max(0, p.uv[i])) * 65535);
  const j = new Uint8Array(n * 4);
  const w = new Uint8Array(n * 4);
  for (let v = 0; v < n; v++) {
    let sum = 0;
    for (let k = 0; k < 4; k++) sum += p.w[v * 4 + k];
    let acc = 0;
    for (let k = 0; k < 4; k++) {
      j[v * 4 + k] = p.j[v * 4 + k];
      w[v * 4 + k] = k < 3 ? Math.round((p.w[v * 4 + k] / (sum || 1)) * 255) : 0;
      acc += w[v * 4 + k];
    }
    w[v * 4 + 3] = Math.max(0, 255 - acc);
  }
  const idx = new Uint16Array(p.idx);
  const out = { n, min: min.map(r5), max: max.map(r5), pos: b64(pos), nrm: b64(nrm), j: b64(j), w: b64(w), idx: b64(idx) };
  if (!opts.noUv) out.uv = b64(uv);
  return out;
}

const meshByName = (g, name) => {
  const node = g.json.nodes.find((n) => n.name === name && n.mesh !== undefined);
  return readPrim(g, g.json.meshes[node.mesh].primitives[0]);
};
const bodyPrim = meshByName(body, "SuperHero_Male");
const eyesPrim = meshByName(body, "Eyes");
const browsPrim = meshByName(body, "Eyebrows");

/* ─────────────── bölge haritası (kıyafet) ─────────────── */
// T-pozda 3B konuma ve kemik ağırlığına göre her UV pikseli sınıflanır.
const REG = { skin: 0, shirt: 1, shorts: 2, socks: 3, boots: 4, forearm: 5, hand: 6, collar: 7, cuff: 8, sockTop: 9 };
const P = jointPos;
const ARM = new Set(boneNames.filter((n) => /^(upperarm|lowerarm|hand|index|middle|pinky|ring|thumb)/.test(n)).map((n) => boneNames.indexOf(n)));
const shoulderX = Math.abs(P.upperarm_l[0]);
const elbowX = Math.abs(P.lowerarm_l[0]);
const wristX = Math.abs(P.hand_l[0]);
const neckY = P.neck_01[1];
const hipY = P.thigh_l[1];
const kneeY = P.calf_l[1];
const ankleY = P.foot_l[1];
const L = {
  sleeve: shoulderX + (elbowX - shoulderX) * 0.52,
  cuff: 0.025,
  collar: neckY - 0.012,
  waist: hipY + 0.06,
  shortsEnd: kneeY + (hipY - kneeY) * 0.4,
  sockTop: kneeY - 0.05,
  bootTop: ankleY + 0.035,
};
// boyun tabanı: T-pozda omuz üstündeki dar kesitten ölçüldü (merkez z, yarıçap)
const NECK = { z: P.neck_01[2] - 0.005, r: 0.079 };
function classify(x, y, z, armW) {
  const ax = Math.abs(x);
  if (armW > 0.5) {
    if (ax < L.sleeve - L.cuff) return REG.shirt;
    if (ax < L.sleeve) return REG.cuff;
    if (ax < wristX - 0.01) return REG.forearm;
    return REG.hand;
  }
  // yuvarlak yaka: boynun ekseni etrafında halka (omuz eğiminden bağımsız)
  if (y > L.collar + 0.06) return REG.skin;
  if (y > L.collar - 0.09) {
    const r = Math.hypot(x, z - NECK.z);
    if (r < NECK.r) return REG.skin;
    if (r < NECK.r + 0.017) return REG.collar;
  }
  if (y > L.waist) return REG.shirt;
  if (y > L.shortsEnd) return REG.shorts;
  if (y > L.sockTop + 0.03) return REG.skin;
  if (y > L.sockTop) return REG.sockTop;
  if (y > L.bootTop) return REG.socks;
  return REG.boots;
}
const MASK = 1024;
const mask = new Uint8Array(MASK * MASK).fill(255);
{
  const p = bodyPrim;
  const armW = new Float64Array(p.pos.length / 3);
  for (let v = 0; v < armW.length; v++) for (let k = 0; k < 4; k++) if (ARM.has(p.j[v * 4 + k])) armW[v] += p.w[v * 4 + k];
  for (let t = 0; t < p.idx.length; t += 3) {
    const vs = [p.idx[t], p.idx[t + 1], p.idx[t + 2]];
    const U = vs.map((v) => [p.uv[v * 2] * MASK, p.uv[v * 2 + 1] * MASK]);
    const minX = Math.max(0, Math.floor(Math.min(...U.map((u) => u[0])) - 1));
    const maxX = Math.min(MASK - 1, Math.ceil(Math.max(...U.map((u) => u[0])) + 1));
    const minY = Math.max(0, Math.floor(Math.min(...U.map((u) => u[1])) - 1));
    const maxY = Math.min(MASK - 1, Math.ceil(Math.max(...U.map((u) => u[1])) + 1));
    const [a, b, c] = U;
    const den = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
    if (Math.abs(den) < 1e-9) continue;
    for (let py = minY; py <= maxY; py++)
      for (let px = minX; px <= maxX; px++) {
        const sx = px + 0.5, sy = py + 0.5;
        const l1 = ((b[1] - c[1]) * (sx - c[0]) + (c[0] - b[0]) * (sy - c[1])) / den;
        const l2 = ((c[1] - a[1]) * (sx - c[0]) + (a[0] - c[0]) * (sy - c[1])) / den;
        const l3 = 1 - l1 - l2;
        if (l1 < -0.02 || l2 < -0.02 || l3 < -0.02) continue;
        const ls = [l1, l2, l3];
        let x = 0, y = 0, z = 0, aw = 0;
        vs.forEach((v, k) => {
          x += ls[k] * p.pos[v * 3];
          y += ls[k] * p.pos[v * 3 + 1];
          z += ls[k] * p.pos[v * 3 + 2];
          aw += ls[k] * armW[v];
        });
        mask[py * MASK + px] = classify(x, y, z, aw);
      }
  }
  // dikiş kenarlarında taşma olmasın: boş pikselleri komşudan doldur (8 tur)
  for (let pass = 0; pass < 8; pass++) {
    const src = mask.slice();
    for (let y = 0; y < MASK; y++)
      for (let x = 0; x < MASK; x++) {
        if (src[y * MASK + x] !== 255) continue;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= MASK || ny >= MASK) continue;
          const v = src[ny * MASK + nx];
          if (v !== 255) {
            mask[y * MASK + x] = v;
            break;
          }
        }
      }
  }
  for (let i = 0; i < mask.length; i++) if (mask[i] === 255) mask[i] = 0;
}

/** Gri tonlu 8 bit PNG. */
function png(gray, w, h) {
  const raw = Buffer.alloc((w + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w + 1)] = 0;
    for (let x = 0; x < w; x++) raw[y * (w + 1) + 1 + x] = gray[y * w + x];
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/* ─────────────── animasyonlar ─────────────── */

const CLIPS = [
  [UAL1, "Idle_Loop", "idle"],
  [UAL1, "Walk_Loop", "walk"],
  [UAL1, "Jog_Fwd_Loop", "jog"],
  [UAL1, "Sprint_Loop", "sprint"],
];
const FPS = 30;
const FINGER = /^(index|middle|pinky|ring|thumb)_/;
const libs = {};
function clipData(dir, name) {
  const file = "UAL1_Standard.glb";
  const g = (libs[file] ||= loadGltf(join(dir, "Unreal-Godot", file)));
  const anim = g.json.animations.find((a) => a.name === name);
  if (!anim) throw new Error(`animasyon yok: ${name}`);
  const tracks = {};
  let dur = 0;
  for (const ch of anim.channels) {
    const node = g.json.nodes[ch.target.node].name;
    const bi = boneNames.indexOf(node);
    if (bi < 0) continue;
    const s = anim.samplers[ch.sampler];
    const times = accessor(g, s.input);
    const vals = accessor(g, s.output);
    dur = Math.max(dur, times[times.length - 1]);
    (tracks[bi] ||= {})[ch.target.path] = { times, vals };
  }
  const frames = Math.max(2, Math.round(dur * FPS) + 1);
  const used = Object.keys(tracks)
    .map(Number)
    .filter((bi) => tracks[bi].rotation && !FINGER.test(boneNames[bi]))
    .sort((a, b) => a - b);
  const q = new Int16Array(frames * used.length * 4);
  const sample = (tr, t, n) => {
    const { times, vals } = tr;
    let i = 0;
    while (i < times.length - 2 && times[i + 1] < t) i++;
    const t0 = times[i], t1 = times[Math.min(i + 1, times.length - 1)];
    const f = t1 > t0 ? Math.min(1, Math.max(0, (t - t0) / (t1 - t0))) : 0;
    const a = Array.from(vals.subarray(i * n, i * n + n));
    const b = Array.from(vals.subarray(Math.min(i + 1, times.length - 1) * n, Math.min(i + 1, times.length - 1) * n + n));
    if (n === 4) {
      let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
      if (d < 0) for (let k = 0; k < 4; k++) b[k] = -b[k];
      return qnorm(a.map((v, k) => v + (b[k] - v) * f));
    }
    return a.map((v, k) => v + (b[k] - v) * f);
  };
  for (let f = 0; f < frames; f++) {
    const t = Math.min(dur, f / FPS);
    used.forEach((bi, k) => {
      const r = sample(tracks[bi].rotation, t, 4);
      for (let c = 0; c < 4; c++) q[(f * used.length + k) * 4 + c] = Math.round(r[c] * 32767);
    });
  }
  // kalça yer değişimi: yalnız dikey salınım (kök hareketi değil) — gövde boyuna ölçekli
  const pelvisIdx = boneNames.indexOf("pelvis");
  const pel = new Int16Array(frames * 3);
  const ualPelvis = g.json.nodes.find((n) => n.name === "pelvis").translation;
  const k = P.pelvis ? bones[pelvisIdx].t[2] / ualPelvis[2] : 1;
  if (tracks[pelvisIdx] && tracks[pelvisIdx].translation)
    for (let f = 0; f < frames; f++) {
      const tr = sample(tracks[pelvisIdx].translation, Math.min(dur, f / FPS), 3);
      for (let c = 0; c < 3; c++) pel[f * 3 + c] = Math.round(tr[c] * k * 10000); // 0.1 mm
    }
  const hand = boneNames
    .map((n, bi) => (FINGER.test(n) && tracks[bi] && tracks[bi].rotation ? [bi, ...sample(tracks[bi].rotation, 0, 4).map(r5)] : null))
    .filter(Boolean);
  return { d: r5(dur), f: frames, b: used, q: b64(q), p: b64(pel), hand };
}

/* ─────────────── dokular (Chromium) ─────────────── */

async function textures() {
  const req = createRequire(process.env.PLAYWRIGHT_PATH ? join(process.env.PLAYWRIGHT_PATH, "x.js") : import.meta.url);
  const { chromium } = req("playwright");
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const page = await browser.newPage();
  const shrink = async (file, size, quality, gray) => {
    const data = readFileSync(file).toString("base64");
    return page.evaluate(
      async ({ data, size, quality, gray }) => {
        const img = new Image();
        img.src = "data:image/png;base64," + data;
        await img.decode();
        const cv = document.createElement("canvas");
        cv.width = cv.height = size;
        const c = cv.getContext("2d");
        c.imageSmoothingQuality = "high";
        c.drawImage(img, 0, 0, size, size);
        if (gray) {
          const d = c.getImageData(0, 0, size, size);
          for (let i = 0; i < d.data.length; i += 4) {
            const l = 0.3 * d.data[i] + 0.59 * d.data[i + 1] + 0.11 * d.data[i + 2];
            d.data[i] = d.data[i + 1] = d.data[i + 2] = l;
          }
          c.putImageData(d, 0, 0);
        }
        return cv.toDataURL("image/jpeg", quality);
      },
      { data, size, quality, gray },
    );
  };
  const T = join(UBC, "Base Characters", "Textures");
  const out = {
    skin: await shrink(join(T, "T_Superhero_Male_Ligh.png"), 1024, 0.82, false),
    eye: await shrink(join(T, "T_Eye_Brown.png"), 128, 0.85, false),
    hair: await shrink(join(UBC, "Hairstyles", "Textures", "T_Hair_1_BaseColor.png"), 256, 0.8, true),
  };
  await browser.close();
  return out;
}

/* ─────────────── çıktı ─────────────── */

const HAIR_DIR = join(UBC, "Hairstyles", "Rigged to Head Bone", "glTF (Godot -Unreal)");
const hairPart = (file) => {
  const g = loadGltf(join(HAIR_DIR, file + ".gltf"));
  return packPart(remapToBody(g, readPrim(g, g.json.meshes[0].primitives[0])));
};

console.log("• boyun eklemi:", P.neck_01.map(r5), "→ yaka merkezi z", r5(NECK.z));
console.log("• iskelet:", bones.length, "kemik; boy", r5(P.Head[1] + 0.12), "m");
console.log("• bölge çizgileri:", Object.fromEntries(Object.entries(L).map(([k, v]) => [k, r5(v)])));
const clips = {};
for (const [dir, name, key] of CLIPS) clips[key] = clipData(dir, name);
const hand = clips.idle.hand;
for (const c of Object.values(clips)) delete c.hand;
const tex = await textures();
const data = {
  v: 1,
  credit: "Quaternius — Universal Base Characters, Universal Animation Library (CC0 1.0)",
  bones,
  ibm: b64(new Float32Array(ibm)),
  parts: {
    body: packPart(bodyPrim),
    eyes: packPart(eyesPrim),
    brows: packPart(browsPrim, { noUv: true }),
    hairBuzzed: hairPart("Hair_Buzzed"),
    hairParted: hairPart("Hair_SimpleParted"),
    beard: hairPart("Hair_Beard"),
  },
  reg: REG,
  lines: Object.fromEntries(Object.entries(L).map(([k, v]) => [k, r5(v)])),
  clips,
  hand,
  tex: { ...tex, mask: "data:image/png;base64," + png(mask, MASK, MASK).toString("base64") },
};
const js = `/* eslint-disable */
// BU DOSYA ÜRETİLİR — elle düzenlemeyin. Kaynak: scripts/athlete/build-athlete.mjs
// Model ve animasyonlar: ${data.credit}. https://quaternius.com
window.ATHLETE_DATA = ${JSON.stringify(data)};
`;
writeFileSync(join(root, "games", "athlete-data.js"), js);
const kb = (s) => (Buffer.byteLength(s) / 1024).toFixed(0) + " KB";
console.log("• klipler:", Object.entries(clips).map(([k, c]) => `${k} ${c.d.toFixed(2)}s`).join(", "));
console.log(
  "• boyutlar:",
  Object.entries({ parts: data.parts, clips, tex: data.tex }).map(([k, v]) => `${k} ${kb(JSON.stringify(v))}`).join(", "),
  "→ toplam",
  kb(js),
);
