/**
 * TOPUN 3B DESENİ — kesik ikozahedron (klasik futbol topu) yüzeyi.
 *
 * NEDEN: eski top, ortasında koyu bir nokta olan beyaz bir daireydi; dönmüyor,
 * yuvarlanmıyordu. Burada topun 12 beşgen yaması gerçek bir küre üstünde
 * tanımlanır, top bir yönelim matrisiyle döndürülür ve görünen yamalar
 * dik izdüşümle çizilir. Sonuç: penaltıda falsolu top kendi ekseninde döner,
 * slalomda top oyuncunun önünde YUVARLANIR — desen kenara kayarak kaybolur.
 *
 * Saf matematik: React'a bağlı değil, başsız doğrulanabilir.
 */

/** 3×3 dönme matrisi, satır öncelikli. */
export type Orientation = number[];

const PHI = (1 + Math.sqrt(5)) / 2;

type Vec3 = [number, number, number];

const normalize = (v: Vec3): Vec3 => {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
};

/** İkozahedronun 12 köşesi = topun 12 beşgen yamasının merkezi. */
const CENTRES: Vec3[] = [
  [0, 1, PHI], [0, -1, PHI], [0, 1, -PHI], [0, -1, -PHI],
  [1, PHI, 0], [-1, PHI, 0], [1, -PHI, 0], [-1, -PHI, 0],
  [PHI, 0, 1], [-PHI, 0, 1], [PHI, 0, -1], [-PHI, 0, -1],
].map((v) => normalize(v as Vec3));

/**
 * Her beşgenin köşeleri: merkezden beş komşu merkeze giden kenarın 1/3'ü.
 * Kesik ikozahedronun tanımı tam olarak budur; yamalar komşularına doğru
 * dönük olduğu için desen gerçek bir topunki gibi oturur.
 */
const PENTAGONS: Vec3[][] = CENTRES.map((c) => {
  const neighbours = CENTRES.filter((n) => n !== c)
    .map((n) => ({ n, d: Math.hypot(n[0] - c[0], n[1] - c[1], n[2] - c[2]) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 5)
    .map(({ n }) => n);

  // Komşuları merkez etrafında açıya göre sırala ki çokgen düzgün kapansın.
  const up: Vec3 = Math.abs(c[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const u = normalize(cross(up, c));
  const v = cross(c, u);
  return neighbours
    .map((n) => {
      const p = normalize([
        (c[0] * 2 + n[0]) / 3,
        (c[1] * 2 + n[1]) / 3,
        (c[2] * 2 + n[2]) / 3,
      ]);
      return { p, a: Math.atan2(dot(p, v), dot(p, u)) };
    })
    .sort((x, y) => x.a - y.a)
    .map(({ p }) => p);
});

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/** Hafif eğik bir başlangıç — ilk karede desen simetrik ve yapay durmasın. */
export function initialOrientation(): Orientation {
  const m = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  rotate(m, [1, 0, 0], 0.5);
  rotate(m, [0, 1, 0], 0.35);
  return m;
}

/**
 * Yönelimi dünya ekseni `axis` etrafında `angle` radyan döndürür (yerinde).
 * Ekran düzleminde: x sağa, y aşağı, z ekrandan dışarı (kameraya doğru).
 *   · Yuvarlanma (ileri)  → x ekseni
 *   · Yan yuvarlanma      → y ekseni
 *   · Falso (kendi ekseni) → z ekseni
 */
export function rotate(m: Orientation, axis: Vec3, angle: number): void {
  if (angle === 0) return;
  const [x, y, z] = normalize(axis);
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const t = 1 - c;
  const r = [
    t * x * x + c, t * x * y - s * z, t * x * z + s * y,
    t * x * y + s * z, t * y * y + c, t * y * z - s * x,
    t * x * z - s * y, t * y * z + s * x, t * z * z + c,
  ];
  const out = new Array(9);
  for (let i = 0; i < 3; i += 1) {
    for (let j = 0; j < 3; j += 1) {
      out[i * 3 + j] = r[i * 3] * m[j] + r[i * 3 + 1] * m[3 + j] + r[i * 3 + 2] * m[6 + j];
    }
  }
  // Her dönmede yeniden dikgenleştir: kayan nokta hatası birikip topu
  // basık bir elipse çevirmesin.
  for (let i = 0; i < 9; i += 1) m[i] = out[i];
  orthonormalize(m);
}

function orthonormalize(m: Orientation): void {
  const a = normalize([m[0], m[1], m[2]]);
  const b0: Vec3 = [m[3], m[4], m[5]];
  const d = dot(a, b0);
  const b = normalize([b0[0] - a[0] * d, b0[1] - a[1] * d, b0[2] - a[2] * d]);
  const c = cross(a, b);
  m[0] = a[0]; m[1] = a[1]; m[2] = a[2];
  m[3] = b[0]; m[4] = b[1]; m[5] = b[2];
  m[6] = c[0]; m[7] = c[1]; m[8] = c[2];
}

const apply = (m: Orientation, p: Vec3): Vec3 => [
  m[0] * p[0] + m[1] * p[1] + m[2] * p[2],
  m[3] * p[0] + m[4] * p[1] + m[5] * p[2],
  m[6] * p[0] + m[7] * p[1] + m[8] * p[2],
];

/**
 * Görünen yamaların birim daire içindeki SVG yolu (merkez 0,0, yarıçap 1).
 *
 * Arkada kalan köşeler (z < 0) kenara itilir: yarı görünen bir yama, topun
 * silüetinde kesilmiş gibi görünür — kırpma maskesine gerek kalmaz.
 */
export function patchPath(m: Orientation, radius = 1, cx = 0, cy = 0): string {
  let d = "";
  for (const pentagon of PENTAGONS) {
    const pts = pentagon.map((p) => apply(m, p));
    // Bütünüyle arkadaki yama çizilmez.
    if (pts.every((p) => p[2] < 0)) continue;
    pts.forEach((p, i) => {
      let x = p[0];
      let y = p[1];
      if (p[2] < 0) {
        const len = Math.hypot(x, y) || 1;
        x /= len;
        y /= len;
      }
      d += `${i === 0 ? "M" : "L"}${(cx + x * radius).toFixed(2)} ${(cy + y * radius).toFixed(2)}`;
    });
    d += "Z";
  }
  return d;
}

/** Test/denetim için: kaç yamanın görünür olduğu. */
export function visiblePatchCount(m: Orientation): number {
  return PENTAGONS.filter((pent) => pent.some((p) => apply(m, p)[2] >= 0)).length;
}
