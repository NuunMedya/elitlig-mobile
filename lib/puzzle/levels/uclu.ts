/**
 * ELİT ÜÇLÜ — seviye üretici (belirlenimci).
 *
 * Bu dosya BAĞIMSIZDIR (hiçbir içe aktarma yok): hem uygulama (Metro) hem de
 * denetim betiği (node --experimental-strip-types) doğrudan yükler. Bu yüzden
 * tohumlu rastgele üreteç (mulberry32) burada kopyalanır; lib/puzzle/types.ts
 * içindeki `seededRandom` ile birebir aynıdır.
 *
 * Seviye yalnız YERLEŞİMİ tanımlar (8×8 karakter ızgarası + hedefler + hamle);
 * taş renkleri motor (lib/puzzle/ucluEngine.ts) tarafından `seed` ile, hazır
 * eşleşme olmadan doldurulur.
 *
 * Izgara karakterleri:
 *   .  rastgele taş          #  boş hücre (şekilli tahta)
 *   0–5 sabit renkli taş     R / V  yatay / dikey Füze Şut
 *   O  Röveşata (bomba)      G  Altın Top
 *   m / M  1 / 2 kat çamur   b / B / C  1 / 2 / 3 vuruşluk krampon kutusu
 *   s  kar kaplı taş         n  kale ağındaki taş
 *   t  şampiyonluk kupası (indirilecek)
 */

export const UCLU_W = 8;
export const UCLU_H = 8;
export const UCLU_MAX_LEVEL = 2000;

/** Taş türleri — sıra renk dizinidir (0..5). */
export const UCLU_PIECES = [
  { key: "top", name: "Top", plural: "top", icon: "football" },
  { key: "forma", name: "Forma", plural: "forma", icon: "shirt" },
  { key: "krampon", name: "Krampon", plural: "krampon", icon: "footsteps" },
  { key: "eldiven", name: "Eldiven", plural: "eldiven", icon: "hand-left" },
  { key: "duduk", name: "Düdük", plural: "düdük", icon: "volume-high" },
  { key: "kupa", name: "Kupa", plural: "kupa", icon: "trophy" },
] as const;

export type UcluGoalType = "color" | "mud" | "crate" | "snow" | "trophy";

export interface UcluGoalDef {
  type: UcluGoalType;
  /** Yalnız "color" için taş dizini. */
  color?: number;
  count: number;
}

export interface UcluLevel {
  level: number;
  seed: number;
  moves: number;
  /** Taş türü sayısı (5 ya da 6). */
  colors: number;
  /** 8 satır × 8 karakter. */
  layout: string[];
  goals: UcluGoalDef[];
  /** Bu seviyede tanıtılan mekanik (ipucu balonu). */
  tip: string | null;
  /** Kupa maçı (her 10. seviye). */
  cup: boolean;
  /** 5'in katı "nefes" seviyesi. */
  breather: boolean;
  /** Sahada beklemeyen, sonradan yukarıdan gelecek kupa sayısı. */
  trophySpawn: number;
}

/** mulberry32 — lib/puzzle/types.ts `seededRandom` kopyası. */
export function ucluRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SALT = 0x0c1a;

/* ───────────────────────────── yardımcılar ───────────────────────────── */

type Grid = string[][];

const blank = (): Grid => Array.from({ length: UCLU_H }, () => Array.from({ length: UCLU_W }, () => "."));
const toRows = (g: Grid): string[] => g.map((row) => row.join(""));

/** Şekilli tahta kalıpları (yalnız '#' ve '.'). Simetrik, her hücre 3'lü dizilebilir. */
const MASKS: { name: string; rows: string[] }[] = [
  { name: "Elmas", rows: ["##....##", "#......#", "........", "........", "........", "........", "#......#", "##....##"] },
  { name: "Kum saati", rows: ["........", "........", "#......#", "##....##", "##....##", "#......#", "........", "........"] },
  { name: "Artı", rows: ["##....##", "##....##", "........", "........", "........", "........", "##....##", "##....##"] },
  { name: "Orta saha", rows: ["........", "........", "........", "...##...", "...##...", "........", "........", "........"] },
  { name: "Köşe bayrakları", rows: ["#......#", "........", "........", "........", "........", "........", "........", "#......#"] },
  { name: "Ceza sahası", rows: ["........", "#......#", "#......#", "........", "........", "#......#", "#......#", "........"] },
  { name: "Tribün", rows: ["###..###", "##....##", "#......#", "........", "........", "........", "........", "........"] },
  { name: "Kale", rows: ["........", "........", "........", "........", "........", "#......#", "##....##", "###..###"] },
  { name: "İki yarı", rows: ["........", "........", "........", "##....##", "##....##", "........", "........", "........"] },
];

const isHole = (g: Grid, r: number, c: number) => g[r][c] === "#";

function cellsWhere(g: Grid, pred: (r: number, c: number) => boolean): [number, number][] {
  const out: [number, number][] = [];
  for (let r = 0; r < UCLU_H; r++) for (let c = 0; c < UCLU_W; c++) if (!isHole(g, r, c) && g[r][c] === "." && pred(r, c)) out.push([r, c]);
  return out;
}

function pickN<T>(rng: () => number, arr: T[], n: number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, Math.max(0, Math.min(n, a.length)));
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/* ───────────────────────────── engeller ───────────────────────────── */

/** Çamur desenleri — yerleşen hücre sayısını döndürür. */
function placeMud(g: Grid, rng: () => number, amount: number, layers2: number): number {
  const kind = Math.floor(rng() * 5);
  let pool: [number, number][];
  if (kind === 0) pool = cellsWhere(g, (r) => r >= UCLU_H - 3);
  else if (kind === 1) pool = cellsWhere(g, (r, c) => r >= 2 && r <= 5 && c >= 2 && c <= 5);
  else if (kind === 2) pool = cellsWhere(g, (r, c) => (r + c) % 2 === 0 && r >= 2);
  else if (kind === 3) pool = cellsWhere(g, (r, c) => r === 0 || r === UCLU_H - 1 || c === 0 || c === UCLU_W - 1 || r >= UCLU_H - 2);
  else pool = cellsWhere(g, (r) => r >= 1);
  // Desen yetmezse alt yarıdan tamamla.
  if (pool.length < amount) {
    const more = cellsWhere(g, (r) => r >= 3).filter(([r, c]) => !pool.some(([a, b]) => a === r && b === c));
    pool = pool.concat(pickN(rng, more, amount - pool.length));
  }
  const chosen = pickN(rng, pool, amount);
  chosen.forEach(([r, c], i) => {
    g[r][c] = i < layers2 ? "M" : "m";
  });
  return chosen.length;
}

/** Krampon kutuları — bant ya da bloklar; 0. ve 1. satıra konmaz. */
function placeCrates(g: Grid, rng: () => number, amount: number, d: number): number {
  const kind = Math.floor(rng() * 3);
  let pool: [number, number][];
  if (kind === 0) {
    const row = 3 + Math.floor(rng() * 3);
    pool = cellsWhere(g, (r) => r === row || r === row + 1);
  } else if (kind === 1) {
    pool = cellsWhere(g, (r, c) => r >= 4 && (c <= 1 || c >= UCLU_W - 2));
  } else {
    pool = cellsWhere(g, (r, c) => r >= 3 && r <= 6 && c >= 2 && c <= 5);
  }
  if (pool.length < amount) {
    const more = cellsWhere(g, (r) => r >= 2).filter(([r, c]) => !pool.some(([a, b]) => a === r && b === c));
    pool = pool.concat(pickN(rng, more, amount - pool.length));
  }
  const chosen = pickN(rng, pool, amount);
  for (const [r, c] of chosen) {
    const x = rng();
    const hp = x < 0.15 + d * 0.35 ? (x < d * 0.18 ? 3 : 2) : 1;
    g[r][c] = hp === 3 ? "C" : hp === 2 ? "B" : "b";
  }
  return chosen.length;
}

function placeScatter(g: Grid, rng: () => number, ch: string, amount: number, minRow: number): number {
  const chosen = pickN(rng, cellsWhere(g, (r) => r >= minRow), amount);
  for (const [r, c] of chosen) g[r][c] = ch;
  return chosen.length;
}

function placeTrophies(g: Grid, rng: () => number, amount: number): number {
  const chosen = pickN(rng, cellsWhere(g, (r) => r <= 1), amount);
  for (const [r, c] of chosen) g[r][c] = "t";
  return chosen.length;
}

/* ───────────────────────────── hamle hesabı ───────────────────────────── */

/**
 * Hedeflerin "iş yükü"nden hamle sayısı. Katsayılar denetim betiğindeki
 * açgözlü botla ayarlandı: kolay seviyelerde bol pay, zorlarda dar pay.
 */
function estimateMoves(goals: UcluGoalDef[], colors: number, d: number, layout: string[]): number {
  let work = 0;
  const colorRate = colors >= 6 ? 1.15 : 1.45;
  const deepMud = layout.reduce((n, row, r) => n + (r >= UCLU_H - 2 ? [...row].filter((ch) => ch === "m" || ch === "M").length : 0), 0);
  for (const g of goals) {
    if (g.type === "color") work += g.count / colorRate;
    else if (g.type === "mud") {
      const layers = layout.reduce((n, row) => n + [...row].filter((ch) => ch === "M").length, 0);
      work += (g.count + layers) / 2.1 + deepMud * 0.12;
    } else if (g.type === "crate") {
      const hp = layout.reduce((n, row) => n + [...row].reduce((k, ch) => k + (ch === "b" ? 1 : ch === "B" ? 2 : ch === "C" ? 3 : 0), 0), 0);
      work += hp / 2.0;
    } else if (g.type === "snow") work += g.count / 2.4;
    else if (g.type === "trophy") work += g.count * 2.6;
  }
  const nets = layout.reduce((n, row) => n + [...row].filter((ch) => ch === "n").length, 0);
  work += nets * 0.15;
  if (goals.length > 1) work *= 0.86; // hedefler aynı hamlede birlikte ilerler
  const slack = 1.55 - 0.5 * d;
  return clamp(Math.round(work * slack + 6), 14, 42);
}

/* ───────────────────────────── zorluk eğrisi ───────────────────────────── */

/** 0..1 — dalgalı artış; kupa maçı belirgin zor, 5'in katı nefes. */
export function ucluDifficulty(n: number): number {
  if (n <= 10) return 0.05 + n * 0.02;
  const base = 0.22 + 0.55 * Math.pow(Math.min(n, 400) / 400, 0.65);
  const wave = 0.1 * Math.sin(n * 0.83) + 0.05 * Math.sin(n * 0.29);
  const cup = n % 10 === 0 ? 0.18 : 0;
  const rest = n % 5 === 0 && n % 10 !== 0 ? -0.2 : 0;
  return clamp(base + wave + cup + rest, 0.05, 1);
}

/* ───────────────────────────── öğretici seviyeler ───────────────────────────── */

const TIPS: Record<number, string> = {
  1: "Komşu iki taşı kaydır: aynı türden 3 taşı yan yana ya da alt alta diz.",
  2: "Düşen taşlar yeni eşleşmeler kurar. Zincirleme eşleşmeler kombo getirir!",
  3: "4 taşı düz diz: Füze Şut oluşur, satırı ya da sütunu temizler.",
  4: "L ya da T şekli kur: Röveşata oluşur, 3×3 alanı patlatır.",
  5: "5 taşı düz diz: Altın Top oluşur. Bir taşla değiştir, o renkteki tüm taşları toplar.",
  6: "Çamur! Üstündeki taşı eşleştir, zemini temizle.",
  7: "İki özel taşı birbiriyle değiştir: dev kombo patlar!",
  9: "Koyu çamur iki katlıdır: iki kez temizlemen gerekir.",
  11: "Krampon kutusu düşmeyi engeller. Yanında eşleşme yap ya da patlat.",
  16: "Kar kaplı taş yerinden oynamaz. Üstünde ya da yanında eşleşme kırar.",
  21: "Şampiyonluk kupasını en alt sıraya indir: altındaki taşları temizle.",
  26: "Kale ağındaki taş tutsak. Onu bir eşleşmeye kat ya da patlat, serbest kalsın.",
  31: "Yeni taş: Kupa! Şekilli sahalar ve altı taş türü başlıyor.",
};

/** Seviye 1–10: elle ayarlanmış öğretici eğri. */
function tutorial(n: number): Omit<UcluLevel, "level" | "seed" | "tip" | "cup" | "breather"> {
  const g = blank();
  switch (n) {
    case 1:
      return { moves: 20, colors: 5, layout: toRows(g), goals: [{ type: "color", color: 0, count: 10 }], trophySpawn: 0 };
    case 2:
      return { moves: 20, colors: 5, layout: toRows(g), goals: [{ type: "color", color: 1, count: 14 }, { type: "color", color: 2, count: 14 }], trophySpawn: 0 };
    case 3: {
      // Hazır 4'lü: (6,4)↕(7,4) kaydırması alt satırda 4 eldiven dizer.
      g[7][2] = "3"; g[7][3] = "3"; g[7][4] = "0"; g[7][5] = "3"; g[6][4] = "3";
      return { moves: 20, colors: 5, layout: toRows(g), goals: [{ type: "color", color: 3, count: 18 }], trophySpawn: 0 };
    }
    case 4: {
      // Hazır L: (7,4)↔(7,3) kaydırması satır + sütun kurar.
      g[7][1] = "4"; g[7][2] = "4"; g[7][3] = "1"; g[7][4] = "4"; g[6][3] = "4"; g[5][3] = "4";
      return { moves: 22, colors: 5, layout: toRows(g), goals: [{ type: "color", color: 4, count: 16 }, { type: "color", color: 0, count: 16 }], trophySpawn: 0 };
    }
    case 5: {
      // Hazır 5'li: (6,3)↕(7,3).
      g[7][1] = "1"; g[7][2] = "1"; g[7][3] = "2"; g[7][4] = "1"; g[7][5] = "1"; g[6][3] = "1";
      return { moves: 22, colors: 5, layout: toRows(g), goals: [{ type: "color", color: 1, count: 22 }], trophySpawn: 0 };
    }
    case 6: {
      for (let r = 6; r < 8; r++) for (let c = 0; c < 8; c++) g[r][c] = "m";
      return { moves: 22, colors: 5, layout: toRows(g), goals: [{ type: "mud", count: 16 }], trophySpawn: 0 };
    }
    case 7: {
      for (let r = 5; r < 8; r++) for (let c = 2; c < 6; c++) g[r][c] = "m";
      g[2][3] = "R"; g[2][4] = "O";
      return { moves: 20, colors: 5, layout: toRows(g), goals: [{ type: "mud", count: 12 }], trophySpawn: 0 };
    }
    case 8: {
      for (let r = 2; r < 6; r++) for (let c = 2; c < 6; c++) g[r][c] = "m";
      return { moves: 22, colors: 5, layout: toRows(g), goals: [{ type: "mud", count: 16 }, { type: "color", color: 2, count: 14 }], trophySpawn: 0 };
    }
    case 9: {
      for (let c = 0; c < 8; c++) { g[7][c] = "M"; g[6][c] = c % 2 === 0 ? "m" : "M"; }
      return { moves: 26, colors: 5, layout: toRows(g), goals: [{ type: "mud", count: 16 }], trophySpawn: 0 };
    }
    default: {
      // 10 — ilk kupa maçı: çamur çerçeve + iki renk.
      for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (r === 7 || c === 0 || c === 7 || r === 6) g[r][c] = r >= 6 ? "M" : "m";
      return { moves: 28, colors: 5, layout: toRows(g), goals: [{ type: "mud", count: 28 }, { type: "color", color: 3, count: 14 }], trophySpawn: 0 };
    }
  }
}

/* ───────────────────────────── genel üretici ───────────────────────────── */

type Mech = "color" | "mud" | "crate" | "snow" | "trophy";

function generated(n: number, rng: () => number, d: number): Omit<UcluLevel, "level" | "seed" | "tip" | "cup" | "breather"> {
  const cup = n % 10 === 0;
  const g = blank();
  const colors = n >= 31 && (cup || rng() < clamp(0.25 + (n - 31) / 400, 0.25, 0.6)) && n !== 35 ? 6 : 5;

  // Şekilli tahta (31+): kupa maçlarında ve bazı seviyelerde.
  if (n >= 31 && (n === 31 || cup || rng() < 0.45)) {
    const mask = MASKS[Math.floor(rng() * MASKS.length)];
    mask.rows.forEach((row, r) => [...row].forEach((ch, c) => { if (ch === "#") g[r][c] = "#"; }));
  }

  // Bu seviyede kullanılabilen mekanikler.
  const avail: Mech[] = ["color", "mud"];
  if (n >= 11) avail.push("crate");
  if (n >= 16) avail.push("snow");
  if (n >= 21) avail.push("trophy");
  const nets = n >= 26;

  // Ana mekanik: tanıtım seviyesinde yenisi, diğerlerinde ağırlıklı seçim.
  const intro: Record<number, Mech> = { 11: "crate", 12: "crate", 16: "snow", 17: "snow", 21: "trophy", 22: "trophy" };
  let main: Mech = intro[n] ?? avail[Math.floor(rng() * avail.length)];
  if (n === 26 || n === 27) main = "color";
  const mechs = new Set<Mech>([main]);
  const extra = cup ? 2 : d > 0.45 && rng() < 0.6 ? 1 : 0;
  for (let i = 0; i < extra && !(n in intro); i++) mechs.add(avail[Math.floor(rng() * avail.length)]);

  const goals: UcluGoalDef[] = [];
  const free = () => cellsWhere(g, () => true).length;

  if (mechs.has("crate")) {
    const amount = Math.round(clamp(6 + d * 10 + rng() * 4, 6, 16));
    const placed = placeCrates(g, rng, amount, d);
    if (placed > 0) goals.push({ type: "crate", count: placed });
  }
  if (mechs.has("mud")) {
    const amount = Math.round(clamp(10 + d * 16 + rng() * 6, 8, Math.min(30, free() - 20)));
    const layers2 = Math.round(amount * clamp(d - 0.2, 0, 0.6) * rng());
    const placed = placeMud(g, rng, amount, layers2);
    if (placed > 0) goals.push({ type: "mud", count: placed });
  }
  if (mechs.has("snow")) {
    const amount = Math.round(clamp(6 + d * 10 + rng() * 4, 6, 16));
    const placed = placeScatter(g, rng, "s", amount, 2);
    if (placed > 0) goals.push({ type: "snow", count: placed });
  }
  let trophySpawn = 0;
  if (mechs.has("trophy")) {
    const total = Math.round(clamp(2 + d * 3 + rng() * 1.5, 2, 6));
    const onBoard = Math.min(total, 2 + (rng() < 0.4 ? 1 : 0));
    const placed = placeTrophies(g, rng, onBoard);
    trophySpawn = total - placed;
    goals.push({ type: "trophy", count: total });
  }
  // Kale ağı (26+): ek engel, hedef değil.
  if (nets && (n === 26 || n === 27 || rng() < 0.4)) {
    placeScatter(g, rng, "n", Math.round(clamp(4 + d * 8 + rng() * 3, 4, 12)), 1);
  }
  if (mechs.has("color") || goals.length === 0) {
    const count = Math.round(clamp(14 + d * 22 + rng() * 6, 12, 40));
    const c1 = Math.floor(rng() * colors);
    goals.push({ type: "color", color: c1, count });
    if (d > 0.55 && rng() < 0.5) {
      const c2 = (c1 + 1 + Math.floor(rng() * (colors - 1))) % colors;
      goals.push({ type: "color", color: c2, count: Math.round(count * 0.7) });
    }
  }

  const layout = toRows(g);
  return { moves: estimateMoves(goals, colors, d, layout), colors, layout, goals, trophySpawn };
}

/* ───────────────────────────── dışa açık API ───────────────────────────── */

const cache = new Map<number, UcluLevel>();

/** Seviye tanımı — aynı `level` her cihazda aynı sonucu verir. */
export function ucluLevel(level: number): UcluLevel {
  const n = clamp(Math.floor(level) || 1, 1, UCLU_MAX_LEVEL);
  const hit = cache.get(n);
  if (hit) return hit;
  const seed = (n * 7919 + SALT) >>> 0;
  const rng = ucluRandom(seed);
  const d = ucluDifficulty(n);
  const body = n <= 10 ? tutorial(n) : generated(n, rng, d);
  const out: UcluLevel = {
    level: n,
    seed,
    ...body,
    tip: TIPS[n] ?? null,
    cup: n % 10 === 0,
    breather: n % 5 === 0 && n % 10 !== 0,
  };
  cache.set(n, out);
  return out;
}
