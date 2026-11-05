/**
 * ÜÇLE KAZAN — belirlenimci seviye üreticisi ve ortak oyun kuralları.
 *
 * Dosya BAĞIMSIZDIR (içe aktarma yok): denetim betiği Node ile doğrudan
 * içe aktarır; uzantısız `@/` yolları orada çözülmez. seededRandom bu yüzden
 * types.ts'ten kopyalandı (aynı mulberry32).
 *
 * KOORDİNAT: karolar yarım-karo biriminde (x, y) ve katman (z) taşır. Bir
 * karo 2×2 yarım birim kaplar; üst katmandaki bir karo, alttakiyle alanı
 * kesişiyorsa onu örter.
 *
 * ÇÖZÜLEBİLİRLİK YAPISAL OLARAK GARANTİLİDİR: önce yerleşim kurulur, sonra
 * kurallara uygun rastgele bir toplama sırası (tanık) çıkarılır ve türler bu
 * sıraya üçlüler hâlinde, aynı anda en çok `w` (≤3) açık üçlü olacak şekilde
 * dağıtılır. Tanık sırayla oynayan rafta en çok 2·w ≤ 6 karo görür; yani
 * 7'lik raf güçlendiricisiz yeter. Üretici tanığı ayrıca simüle eder.
 */

export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ─────────────────────────────── tipler ─────────────────────────────── */

export interface UcleTile {
  id: number;
  /** Tür dizini (uclePalette UCLE_KINDS). */
  kind: number;
  x: number;
  y: number;
  z: number;
  /** Ters karo: üstü açılana dek türü görünmez. */
  hidden: boolean;
  /** Kilit grubu: o grubun anahtar karosu toplanınca açılır. */
  lock: number | null;
  /** Anahtar karosu: toplandığında bu gruptaki kilitler açılır. */
  key: number | null;
  /** Zincirli: aynı katmanda yanındaki karolardan biri kalkınca serbest. */
  chain: boolean;
}

export interface UcleLevel {
  level: number;
  tiles: UcleTile[];
  /** Her karoyu örten karoların dizinleri. */
  blockers: number[][];
  /** Zincirli karonun yan komşuları (aynı katman). */
  neighbors: number[][];
  /** Kilit grubu → anahtar karosunun dizini. */
  keyOf: Record<number, number>;
  kindCount: number;
  layers: number;
  shape: string;
  shapeTitle: string;
  /** Saniye; null = süresiz. */
  timeLimit: number | null;
  cup: boolean;
  breath: boolean;
  rackSize: number;
  /** Tanık çözüm: karo dizinleri sırası. */
  solution: number[];
  /** Tanığın eş zamanlı açık üçlü genişliği (zorluk). */
  width: number;
  /** Yarım-birim tahta ölçüsü (en büyük x+2, y+2). */
  spanX: number;
  spanY: number;
  tip: string | null;
}

export const UCLE_RACK = 7;
export const UCLE_MAX_KINDS = 14;

/* ───────────────────────────── şekiller ───────────────────────────── */

const SHAPES: Record<string, { title: string; rows: string[] }> = {
  mini: { title: "Isınma", rows: ["XXX", "XXX", "XXX"] },
  dortlu: { title: "Kenar çizgisi", rows: ["XXXX", "XXXX", "XXXX"] },
  sira: { title: "Yedek kulübesi", rows: ["XXXXXX", "XXXXXX", "XXXXXX"] },
  kutu: { title: "Ceza sahası", rows: ["XXXXX", "XXXXX", "XXXXX", "XXXXX"] },
  elmas: { title: "Orta yuvarlak", rows: ["..X..", ".XXX.", "XXXXX", ".XXX.", "..X.."] },
  stadyum: {
    title: "Stadyum",
    rows: [".XXXXX.", "XXXXXXX", "XX...XX", "XX...XX", "XXXXXXX", ".XXXXX."],
  },
  top: {
    title: "Top",
    rows: ["..XXX..", ".XXXXX.", "XXXXXXX", "XXXXXXX", "XXXXXXX", ".XXXXX.", "..XXX.."],
  },
  kupa: {
    title: "Kupa",
    rows: ["XXXXXXX", "XXXXXXX", ".XXXXX.", "..XXX..", "...X...", "..XXX..", ".XXXXX."],
  },
  forma: {
    title: "Forma",
    rows: ["XX...XX", "XXXXXXX", ".XXXXX.", ".XXXXX.", ".XXXXX.", ".XXXXX."],
  },
  kale: {
    title: "Kale",
    rows: ["XXXXXXX", "XXXXXXX", "XX...XX", "XX...XX", "XX...XX"],
  },
  saha: { title: "Saha", rows: ["XXXXXXX", "XXXXXXX", "XXXXXXX", "XXXXXXX", "XXXXXXX"] },
  bayrak: {
    title: "Köşe bayrağı",
    rows: ["XXXXX..", "XXXXXXX", "XXXXXXX", "XXXXX..", "X......", "X......"].map((r) => r),
  },
};

/** Büyük, simetrik şekiller — 11. seviyeden sonra dönüşümlü kullanılır. */
const BIG_SHAPES = ["stadyum", "top", "forma", "kale", "saha", "kupa", "bayrak"];
/** Küçük şekiller — yalnız "nefes" seviyelerinde. */
const SMALL_SHAPES = ["elmas", "kutu", "sira"];

/* ─────────────────────────── kurallar (ortak) ─────────────────────────── */

const covers = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) =>
  a.z > b.z && Math.abs(a.x - b.x) < 2 && Math.abs(a.y - b.y) < 2;

/** Örtü, komşuluk ve anahtar eşlemesi — oyun ve denetim aynı kuralları kullanır. */
export function buildRelations(tiles: UcleTile[]): {
  blockers: number[][];
  neighbors: number[][];
  keyOf: Record<number, number>;
} {
  const blockers = tiles.map((t) => tiles.filter((o) => covers(o, t)).map((o) => o.id));
  const neighbors = tiles.map((t) =>
    tiles.filter((o) => o.z === t.z && o.y === t.y && Math.abs(o.x - t.x) === 2).map((o) => o.id),
  );
  const keyOf: Record<number, number> = {};
  for (const t of tiles) if (t.key != null) keyOf[t.key] = t.id;
  return { blockers, neighbors, keyOf };
}

export type TileBlock = "free" | "covered" | "locked" | "chained";

/** Tahtadaki karonun durumu (onBoard: dizin → tahtada mı). */
export function tileBlock(lvl: Pick<UcleLevel, "tiles" | "blockers" | "neighbors" | "keyOf">, i: number, onBoard: ArrayLike<boolean>): TileBlock {
  for (const b of lvl.blockers[i]) if (onBoard[b]) return "covered";
  const t = lvl.tiles[i];
  if (t.lock != null) {
    const k = lvl.keyOf[t.lock];
    if (k != null && onBoard[k]) return "locked";
  }
  if (t.chain) {
    const ns = lvl.neighbors[i];
    if (ns.length && ns.every((n) => onBoard[n])) return "chained";
  }
  return "free";
}

/**
 * Rafa karo ekle (aynı türün yanına dizilir); üçlü olursa çıkarır.
 * Dönüş: yeni raf, patlayan tür (yoksa null).
 */
export function rackInsert(rack: number[], kind: number): { rack: number[]; matched: number | null; index: number } {
  const next = rack.slice();
  let at = -1;
  for (let i = next.length - 1; i >= 0; i--) if (next[i] === kind) { at = i + 1; break; }
  if (at < 0) at = next.length;
  next.splice(at, 0, kind);
  const same = next.filter((k) => k === kind).length;
  if (same >= 3) return { rack: next.filter((k) => k !== kind), matched: kind, index: at };
  return { rack: next, matched: null, index: at };
}

/** Bir hamle sırasını kurallarla oynatır; çözüm geçerliyse en yüksek raf doluluğunu verir. */
export function simulate(lvl: UcleLevel, order: number[], rackSize = lvl.rackSize): { ok: boolean; peak: number; reason?: string } {
  const onBoard = lvl.tiles.map(() => true);
  let rack: number[] = [];
  let peak = 0;
  for (const i of order) {
    if (!onBoard[i]) return { ok: false, peak, reason: `karo ${i} iki kez` };
    const b = tileBlock(lvl, i, onBoard);
    if (b !== "free") return { ok: false, peak, reason: `karo ${i} ${b}` };
    onBoard[i] = false;
    const r = rackInsert(rack, lvl.tiles[i].kind);
    rack = r.rack;
    // Doluluk: patlamadan sonra rafta kalan karo sayısı.
    peak = Math.max(peak, rack.length);
    if (r.matched == null && rack.length >= rackSize) return { ok: false, peak, reason: "raf doldu" };
  }
  if (onBoard.some(Boolean) || rack.length) return { ok: false, peak, reason: "tahta bitmedi" };
  return { ok: true, peak };
}

/* ──────────────────────────── üretici ──────────────────────────── */

const SALT = 0x0c1e;

interface Plan {
  tutorial: boolean;
  target: number;
  kinds: number;
  maxLayers: number;
  shape: string;
  width: number;
  hiddenRate: number;
  lockGroups: number;
  chains: number;
  timed: boolean;
  tip: string | null;
}

const TIPS: Record<number, string> = {
  1: "Açık bir karoya dokun: rafa uçar. Aynı türden 3 karo yan yana gelince patlar!",
  2: "Raf 7 hücre. Dolarsa maç biter — eşini bulamadığın karoları biriktirme.",
  4: "Karolar artık üst üste! Soluk karoların üstü kapalı; önce üsttekileri topla.",
  6: "Güçlendiriciler: Geri Al son karoyu tahtaya koyar, İpucu bir üçlüyü kendisi tamamlar.",
  9: "Ters karolar geldi: üstleri açılınca ne oldukları görünür.",
  10: "Kupa maçı! Daha çok karo, daha çok tür. Sakin ol, rafı yönet.",
  15: "Süre başladı! Saat bitmeden tahtayı temizle; kalan süre yıldız getirir.",
  20: "Kilitli karolar: rengi eşleşen anahtarlı karoyu toplayınca kilit açılır.",
  30: "Zincirli karolar: aynı sırada yanındaki karolardan biri kalkınca zincir çözülür.",
};

function planFor(level: number, rng: () => number): Plan {
  const cup = level % 10 === 0;
  const breath = !cup && level % 5 === 0;
  const tip = TIPS[level] ?? null;
  // Elle ayarlanmış öğretici eğri (1–10).
  const hand: Record<number, Partial<Plan> & { target: number; kinds: number; maxLayers: number; shape: string }> = {
    1: { target: 9, kinds: 3, maxLayers: 1, shape: "mini", width: 1 },
    2: { target: 12, kinds: 4, maxLayers: 1, shape: "dortlu", width: 1 },
    3: { target: 18, kinds: 5, maxLayers: 1, shape: "sira", width: 1 },
    4: { target: 21, kinds: 5, maxLayers: 2, shape: "dortlu", width: 2 },
    5: { target: 21, kinds: 4, maxLayers: 2, shape: "elmas", width: 1 },
    6: { target: 27, kinds: 6, maxLayers: 2, shape: "sira", width: 2 },
    7: { target: 30, kinds: 6, maxLayers: 3, shape: "kutu", width: 2 },
    8: { target: 30, kinds: 6, maxLayers: 3, shape: "elmas", width: 2 },
    9: { target: 33, kinds: 6, maxLayers: 3, shape: "sira", width: 2, hiddenRate: 0.4 },
    10: { target: 48, kinds: 7, maxLayers: 3, shape: "kupa", width: 2, hiddenRate: 0.25 },
  };
  if (hand[level]) {
    const h = hand[level];
    return {
      tutorial: true,
      width: 2,
      hiddenRate: 0,
      lockGroups: 0,
      chains: 0,
      timed: false,
      ...h,
      tip,
    };
  }
  // Dalgalı artış: logaritmik taban + seviye içi dalga + küçük oynama.
  let target = 33 + 22 * Math.log2(1 + level / 15);
  target += ((level % 10) - 4) * 1.2 + (rng() - 0.5) * 8;
  if (cup) target *= 1.2;
  if (breath) target *= 0.72;
  target = Math.max(24, Math.min(135, Math.round(target)));
  const kinds = Math.min(13, 6 + Math.floor(level / 20) + (cup ? 1 : 0) - (breath ? 1 : 0));
  const maxLayers = level < 20 ? 3 : level < 50 ? 4 : level < 120 ? 5 : 6;
  const pool = breath ? SMALL_SHAPES : BIG_SHAPES;
  const shape = cup && level % 20 === 0 ? "kupa" : level === 30 ? "bayrak" : pool[Math.floor(rng() * pool.length)];
  let width = 2;
  if (cup) width = 3;
  else if (level > 60 && !breath && rng() < 0.4) width = 3;
  else if (breath) width = 1;
  const hiddenRate = Math.min(0.4, 0.15 + level / 1000) * (breath ? 0.5 : 1);
  let lockGroups = 0;
  if (level === 20) lockGroups = 1;
  else if (level > 20 && (cup || rng() < 0.45)) lockGroups = 1 + (level >= 40 && rng() < 0.5 ? 1 : 0) + (level >= 80 && rng() < 0.3 ? 1 : 0);
  if (breath) lockGroups = Math.min(lockGroups, 1);
  let chains = 0;
  if (level === 30) chains = 4;
  else if (level > 30 && (cup || rng() < 0.45)) chains = 2 + Math.floor(rng() * Math.min(6, 2 + level / 40));
  if (breath) chains = Math.min(chains, 2);
  const timed = level === 15 || (cup && level >= 20);
  return { tutorial: false, target, kinds, maxLayers, shape, width, hiddenRate, lockGroups, chains, timed, tip };
}

interface Pos { x: number; y: number; z: number }

/** Simetrik katmanlı yerleşim. */
function buildLayout(plan: Plan, rng: () => number): Pos[] {
  const rows = SHAPES[plan.shape].rows;
  const cols = Math.max(...rows.map((r) => r.length));
  const maxX = 2 * (cols - 1);
  const out: Pos[] = [];
  rows.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) if (row[c] === "X") out.push({ x: 2 * c, y: 2 * r, z: 0 });
  });
  const offsets: [number, number][] = [[1, 1], [0, 0], [1, 0], [0, 1]];
  for (let z = 1; z < plan.maxLayers && out.length < plan.target; z++) {
    // Alt katmanların kapladığı birim kareler: üst karo ancak tamamen desteklenirse durur.
    const cells = new Set<string>();
    for (const p of out) for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) cells.add(`${p.x + dx},${p.y + dy}`);
    const [ox, oy] = z === 1 ? offsets[0] : offsets[Math.floor(rng() * offsets.length)];
    const cands: Pos[] = [];
    for (let y = oy; y <= 2 * rows.length; y += 2) {
      for (let x = ox; x <= maxX; x += 2) {
        let ok = true;
        for (let dx = 0; dx < 2 && ok; dx++) for (let dy = 0; dy < 2 && ok; dy++) if (!cells.has(`${x + dx},${y + dy}`)) ok = false;
        if (ok) cands.push({ x, y, z });
      }
    }
    if (!cands.length) break;
    // Ayna çiftleri (x ↔ maxX − x) birlikte seçilir: desen simetrik kalır.
    const groups: Pos[][] = [];
    const seen = new Set<string>();
    for (const p of cands) {
      const k = `${p.x},${p.y}`;
      if (seen.has(k)) continue;
      const m = cands.find((q) => q.x === maxX - p.x && q.y === p.y);
      seen.add(k);
      if (m && m !== p) { seen.add(`${m.x},${m.y}`); groups.push([p, m]); } else groups.push([p]);
    }
    shuffle(groups, rng);
    const remaining = plan.target - out.length;
    const lastLayer = z === plan.maxLayers - 1;
    const want = lastLayer ? remaining : Math.max(2, Math.ceil(remaining * (0.55 + rng() * 0.2)));
    const picked: Pos[] = [];
    for (const g of groups) {
      if (picked.length >= want) break;
      if (picked.length + g.length > want + 1) continue;
      picked.push(...g);
    }
    if (!picked.length) break;
    out.push(...picked);
  }
  // 3'ün katına indir: yalnız üstü açık karolar çıkarılır, ayna çiftleriyle.
  const isTop = (p: Pos) => !out.some((o) => covers(o, p));
  let guard = 0;
  while (out.length % 3 !== 0 && guard++ < 50) {
    const need = out.length % 3; // 1 ya da 2 çıkarılmalı
    const tops = out.filter(isTop).sort((a, b) => b.z - a.z || a.y - b.y || a.x - b.x);
    const center = tops.find((p) => p.x === maxX - p.x);
    const pair = tops.find((p) => p.x < maxX - p.x && tops.some((q) => q.x === maxX - p.x && q.y === p.y && q.z === p.z));
    let remove: Pos[] = [];
    if (need === 1 && center) remove = [center];
    else if (pair) remove = [pair, tops.find((q) => q.x === maxX - pair.x && q.y === pair.y && q.z === pair.z)!];
    else if (tops.length) remove = [tops[0]];
    for (const r of remove) out.splice(out.indexOf(r), 1);
  }
  return out;
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function attempt(level: number, plan: Plan, rng: () => number): UcleLevel | null {
  const layout = buildLayout(plan, rng).sort((a, b) => a.z - b.z || a.y - b.y || a.x - b.x);
  if (layout.length < 9 || layout.length % 3 !== 0) return null;
  const tiles: UcleTile[] = layout.map((p, id) => ({ id, kind: -1, x: p.x, y: p.y, z: p.z, hidden: false, lock: null, key: null, chain: false }));
  let rel = buildRelations(tiles);
  const initiallyCovered = (i: number) => rel.blockers[i].length > 0;

  // Kilitler: anahtar başta açık bir karo; kilitli karolar başkaları.
  for (let g = 0; g < plan.lockGroups; g++) {
    const keyC = tiles.filter((t) => !initiallyCovered(t.id) && t.key == null && t.lock == null);
    const keyT = keyC[Math.floor(rng() * keyC.length)];
    if (!keyT) break;
    keyT.key = g;
    const lockC = shuffle(tiles.filter((t) => t.key == null && t.lock == null && t.id !== keyT.id), rng);
    const n = 2 + Math.floor(rng() * 2);
    for (const t of lockC.slice(0, n)) t.lock = g;
  }
  // Zincirler: aynı sırada zincirsiz bir komşusu olan karolar.
  if (plan.chains) {
    const cand = shuffle(tiles.filter((t) => t.key == null && t.lock == null && rel.neighbors[t.id].length > 0), rng);
    let placed = 0;
    for (const t of cand) {
      if (placed >= plan.chains) break;
      if (!rel.neighbors[t.id].some((n) => !tiles[n].chain)) continue;
      t.chain = true;
      placed++;
    }
  }
  // Ters karolar: yalnız başta üstü kapalı olanlar.
  if (plan.hiddenRate > 0) {
    for (const t of tiles) if (initiallyCovered(t.id) && t.lock == null && rng() < plan.hiddenRate) t.hidden = true;
  }
  rel = buildRelations(tiles);
  const lvlShell = { tiles, ...rel };

  // Tanık sıra: her adımda serbest karolardan rastgele biri.
  const onBoard = tiles.map(() => true);
  const order: number[] = [];
  for (let step = 0; step < tiles.length; step++) {
    const free: number[] = [];
    for (let i = 0; i < tiles.length; i++) if (onBoard[i] && tileBlock(lvlShell, i, onBoard) === "free") free.push(i);
    if (!free.length) return null; // kilit/zincir kilitlenmesi: tohum değişir
    const pick = free[Math.floor(rng() * free.length)];
    onBoard[pick] = false;
    order.push(pick);
  }

  // Türleri tanık sıraya üçlüler hâlinde dağıt (en çok `width` açık üçlü).
  const triples = tiles.length / 3;
  const kinds = Math.max(2, Math.min(plan.kinds, triples, UCLE_MAX_KINDS));
  const used = new Array(kinds).fill(0);
  const open: { kind: number; left: number }[] = [];
  for (let s = 0; s < order.length; s++) {
    const left = order.length - s;
    const owed = open.reduce((a, o) => a + o.left, 0);
    const canStart = open.length < plan.width && left - owed >= 3;
    const mustStart = open.length === 0;
    let slot: { kind: number; left: number };
    if (mustStart || (canStart && rng() < 0.5)) {
      const busy = new Set(open.map((o) => o.kind));
      const avail = [...Array(kinds).keys()].filter((k) => !busy.has(k));
      const min = Math.min(...avail.map((k) => used[k]));
      const best = avail.filter((k) => used[k] === min);
      const kind = best[Math.floor(rng() * best.length)];
      used[kind]++;
      slot = { kind, left: 3 };
      open.push(slot);
    } else {
      slot = open[Math.floor(rng() * open.length)];
    }
    tiles[order[s]].kind = slot.kind;
    slot.left--;
    if (slot.left === 0) open.splice(open.indexOf(slot), 1);
  }
  if (tiles.some((t) => t.kind < 0)) return null;

  const cup = level % 10 === 0;
  const maxZ = Math.max(...tiles.map((t) => t.z));
  const lvl: UcleLevel = {
    level,
    tiles,
    ...rel,
    kindCount: kinds,
    layers: maxZ + 1,
    shape: plan.shape,
    shapeTitle: SHAPES[plan.shape].title,
    timeLimit: plan.timed ? Math.round((tiles.length * Math.max(1.9, 3.1 - level / 250) + 20) / 5) * 5 : null,
    cup,
    breath: !cup && level % 5 === 0,
    rackSize: UCLE_RACK,
    solution: order,
    width: plan.width,
    spanX: Math.max(...tiles.map((t) => t.x)) + 2,
    spanY: Math.max(...tiles.map((t) => t.y)) + 2,
    tip: plan.tip,
  };
  if (!simulate(lvl, order).ok) return null;
  return lvl;
}

const cache = new Map<number, UcleLevel>();

/** Seviye `level` (1…) — aynı girdi her cihazda aynı tahtayı verir. */
export function generateUcleLevel(level: number): UcleLevel {
  const n = Math.max(1, Math.floor(level));
  const hit = cache.get(n);
  if (hit) return hit;
  for (let a = 0; a < 64; a++) {
    const rng = seededRandom(n * 7919 + SALT + a * 104729);
    const plan = planFor(n, rng);
    const lvl = attempt(n, plan, rng);
    if (lvl) {
      if (cache.size > 64) cache.clear();
      cache.set(n, lvl);
      return lvl;
    }
  }
  throw new Error(`ucle: seviye ${n} üretilemedi`);
}

/** Bu seviyede tahtada olan mekanikler (hedef satırları için). */
export function ucleLevelFacts(lvl: UcleLevel) {
  return {
    tiles: lvl.tiles.length,
    hidden: lvl.tiles.filter((t) => t.hidden).length,
    locks: lvl.tiles.filter((t) => t.lock != null).length,
    keys: lvl.tiles.filter((t) => t.key != null).length,
    chains: lvl.tiles.filter((t) => t.chain).length,
  };
}

/**
 * Yıldız: süreli seviyede kalan süre oranı; süresizde güçlendirici kullanımı
 * ve rafın en yüksek doluluğu (raf verimi).
 */
export function ucleStars(opts: { timeLimit: number | null; timeLeft: number; boostersUsed: number; peakRack: number; rackSize: number }): 1 | 2 | 3 {
  let s: number;
  if (opts.timeLimit) {
    const f = opts.timeLeft / opts.timeLimit;
    s = f >= 0.35 ? 3 : f >= 0.15 ? 2 : 1;
    if (opts.boostersUsed >= 2) s -= 1;
  } else {
    s = 3;
    if (opts.boostersUsed >= 1) s -= 1;
    if (opts.boostersUsed >= 3) s -= 1;
    if (opts.peakRack >= opts.rackSize - 1) s -= 1;
  }
  return Math.max(1, Math.min(3, s)) as 1 | 2 | 3;
}
