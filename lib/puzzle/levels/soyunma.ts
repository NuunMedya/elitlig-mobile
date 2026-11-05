/**
 * SOYUNMA ODASI — kurallar motoru, çözücü ve belirlenimci seviye üretici.
 *
 * Bu dosya BAĞIMSIZDIR (hiçbir içe aktarma yok): hem oyun bileşeni hem de
 * `node --experimental-strip-types scripts/check-puzzle-soyunma.mjs` aynı
 * kodu kullanır — denetimin doğruladığı kurallar, oynanan kurallarla birebir.
 *
 * KURALLAR
 *   · Her takımın TEAM (4) forması vardır; her dolabın bir kapasitesi vardır.
 *   · Hamle: kaynağın en üstündeki AÇIK ve aynı renkteki ardışık formalar,
 *     hedef boşsa ya da hedefin en üstü aynı renkse, yer olduğu kadar taşınır.
 *   · Gizli formalar dolabın altındaki ardışık bölümdür; bir forma en üste
 *     çıkınca açılır. Gizli forma, üstündeki grupla birlikte taşınmaz.
 *   · Tek renkle TEAM formaya ulaşan dolap "takım hazır" olur ve kilitlenir.
 *   · Kilitli dolap, kilidindeki renk hazır olunca açılır; o zamana dek ne
 *     kaynak ne hedef olabilir.
 *   · Bütün dolaplar boş ya da hazır olunca seviye kazanılır.
 */

/* ────────────────────────────── tipler ────────────────────────────── */

export interface SoyunmaRack {
  /** Formalar alttan üste renk kimlikleri (0..colors-1). */
  items: number[];
  /** Alttan kaç forma gizli (her zaman items.length - 1'i geçmez). */
  hidden: number;
}

export interface SoyunmaBoard {
  caps: number[];
  /** Kilitli dolabın açılması için hazır olması gereken renk; yoksa null. */
  locks: (number | null)[];
  team: number;
  colors: number;
}

export type SoyunmaMove = [from: number, to: number];

export interface SoyunmaLevel {
  level: number;
  colors: number;
  team: number;
  caps: number[];
  locks: (number | null)[];
  racks: SoyunmaRack[];
  /** Renk kimliği → palet sırası (SOYUNMA_TEAMS). */
  teamIds: number[];
  /** Çözücünün bulduğu çözüm (yıldız eşikleri bunun uzunluğundan). */
  solution: SoyunmaMove[];
  par: number;
  /** Çözüm kanıtlanmış en kısa mı (A*, ağırlıksız) yoksa iyi bir çözüm mü. */
  optimal: boolean;
  star3: number;
  star2: number;
  /** Kupa maçında hamle sınırı; diğerlerinde null. */
  moveLimit: number | null;
  cup: boolean;
  breather: boolean;
  tip: string | null;
  mechanics: { hidden: boolean; lock: boolean; small: boolean; fewEmpty: boolean };
}

export const SOYUNMA_TEAM_SIZE = 4;
const SALT = 0x50a1;
const PALETTE_SIZE = 12;

/** Tohumlu rastgele (mulberry32) — types.ts'teki seededRandom'un kopyası. */
export function soyunmaRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ────────────────────────────── motor ────────────────────────────── */

/** Dolap tek renkle TEAM formaya ulaştı mı (hazır). */
export function isRackComplete(rack: SoyunmaRack, team: number): boolean {
  const it = rack.items;
  if (it.length !== team) return false;
  for (let i = 1; i < it.length; i += 1) if (it[i] !== it[0]) return false;
  return true;
}

/** Renk hazır mı — herhangi bir dolapta tamamlanmış mı. */
export function isColorComplete(racks: SoyunmaRack[], team: number, color: number): boolean {
  for (const r of racks) if (r.items.length === team && r.items[0] === color && isRackComplete(r, team)) return true;
  return false;
}

export function isAccessible(board: SoyunmaBoard, racks: SoyunmaRack[], i: number): boolean {
  const lock = board.locks[i];
  return lock == null || isColorComplete(racks, board.team, lock);
}

/** En üstteki açık, aynı renkli ardışık grup. */
export function topGroup(rack: SoyunmaRack): { color: number; size: number } | null {
  const it = rack.items;
  if (it.length === 0) return null;
  const color = it[it.length - 1];
  let size = 1;
  for (let i = it.length - 2; i >= rack.hidden && it[i] === color; i -= 1) size += 1;
  return { color, size };
}

/** Geçerli hamlede taşınacak forma sayısı; geçersizse 0. */
export function moveCount(board: SoyunmaBoard, racks: SoyunmaRack[], from: number, to: number): number {
  if (from === to) return 0;
  const src = racks[from];
  const dst = racks[to];
  if (!src || !dst || src.items.length === 0) return 0;
  if (isRackComplete(src, board.team)) return 0;
  if (!isAccessible(board, racks, from) || !isAccessible(board, racks, to)) return 0;
  const free = board.caps[to] - dst.items.length;
  if (free <= 0) return 0;
  const g = topGroup(src)!;
  if (dst.items.length > 0 && dst.items[dst.items.length - 1] !== g.color) return 0;
  return Math.min(g.size, free);
}

/** Kaynak seçilebilir mi (üstünde taşınabilir forma var mı). */
export function canPick(board: SoyunmaBoard, racks: SoyunmaRack[], i: number): boolean {
  const r = racks[i];
  return !!r && r.items.length > 0 && !isRackComplete(r, board.team) && isAccessible(board, racks, i);
}

/** Hamleyi uygular; yeni dizi döner (değişmeyen dolaplar aynı referans). */
export function applyMove(board: SoyunmaBoard, racks: SoyunmaRack[], from: number, to: number): SoyunmaRack[] {
  const k = moveCount(board, racks, from, to);
  if (k === 0) return racks;
  const src = racks[from];
  const dst = racks[to];
  const moved = src.items.slice(src.items.length - k);
  const left = src.items.slice(0, src.items.length - k);
  const next = racks.slice();
  next[from] = { items: left, hidden: Math.max(0, Math.min(src.hidden, left.length - 1)) };
  next[to] = { items: dst.items.concat(moved), hidden: dst.hidden };
  return next;
}

export function isSolved(board: SoyunmaBoard, racks: SoyunmaRack[]): boolean {
  for (const r of racks) if (r.items.length > 0 && !isRackComplete(r, board.team)) return false;
  return true;
}

export function hasAnyMove(board: SoyunmaBoard, racks: SoyunmaRack[]): boolean {
  for (let s = 0; s < racks.length; s += 1) {
    if (!canPick(board, racks, s)) continue;
    for (let t = 0; t < racks.length; t += 1) if (moveCount(board, racks, s, t) > 0) return true;
  }
  return false;
}

/* ────────────────────────────── çözücü ────────────────────────────── */

/** Toplam renk bloğu − renk sayısı: her hamle en çok bir bloğu birleştirir → kabul edilebilir. */
function heuristic(racks: SoyunmaRack[], colors: number): number {
  let runs = 0;
  for (const r of racks) {
    const it = r.items;
    if (it.length === 0) continue;
    runs += 1;
    for (let i = 1; i < it.length; i += 1) if (it[i] !== it[i - 1]) runs += 1;
  }
  return runs - colors;
}

function stateKey(board: SoyunmaBoard, racks: SoyunmaRack[]): string {
  const parts: string[] = new Array(racks.length);
  for (let i = 0; i < racks.length; i += 1) {
    const r = racks[i];
    const lock = board.locks[i];
    parts[i] = `${board.caps[i]}${lock == null ? "-" : String.fromCharCode(97 + lock)}${r.hidden}${String.fromCharCode(...r.items.map((c) => 65 + c))}`;
  }
  // Aynı türden dolaplar yer değiştirebilir: sıralı anahtar simetrileri birleştirir.
  return parts.sort().join("|");
}

interface Node {
  racks: SoyunmaRack[];
  g: number;
  f: number;
  parent: Node | null;
  move: SoyunmaMove | null;
}

/** İkili yığın (en küçük f; eşitlikte büyük g — derine eğilim). */
class Heap {
  private a: Node[] = [];
  get size(): number {
    return this.a.length;
  }
  private less(x: Node, y: Node): boolean {
    return x.f < y.f || (x.f === y.f && x.g > y.g);
  }
  push(n: Node): void {
    const a = this.a;
    a.push(n);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.less(a[i], a[p])) break;
      [a[i], a[p]] = [a[p], a[i]];
      i = p;
    }
  }
  pop(): Node {
    const a = this.a;
    const top = a[0];
    const last = a.pop()!;
    if (a.length > 0) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && this.less(a[l], a[m])) m = l;
        if (r < a.length && this.less(a[r], a[m])) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]];
        i = m;
      }
    }
    return top;
  }
}

/** Anlamlı hamleler (simetrik boş hedefleri ve boşa taşımaları budar). */
function successors(board: SoyunmaBoard, racks: SoyunmaRack[]): SoyunmaMove[] {
  const out: SoyunmaMove[] = [];
  for (let s = 0; s < racks.length; s += 1) {
    if (!canPick(board, racks, s)) continue;
    const src = racks[s];
    const g = topGroup(src)!;
    const wholeRack = g.size === src.items.length;
    const seenEmpty = new Set<string>();
    for (let t = 0; t < racks.length; t += 1) {
      const k = moveCount(board, racks, s, t);
      if (k === 0) continue;
      if (racks[t].items.length === 0) {
        const kind = `${board.caps[t]}/${board.locks[t] ?? "-"}`;
        if (seenEmpty.has(kind)) continue;
        seenEmpty.add(kind);
        // Tek renkli bütün dolabı aynı kapasiteli boş dolaba taşımak hiçbir şey değiştirmez.
        if (wholeRack && k === g.size && board.caps[t] === board.caps[s] && board.locks[s] == null) continue;
      }
      out.push([s, t]);
    }
  }
  return out;
}

export interface SolveResult {
  solution: SoyunmaMove[];
  optimal: boolean;
  expanded: number;
}

function astar(board: SoyunmaBoard, start: SoyunmaRack[], weight: number, budget: number): { sol: SoyunmaMove[]; expanded: number } | null {
  const heap = new Heap();
  const best = new Map<string, number>();
  heap.push({ racks: start, g: 0, f: weight * heuristic(start, board.colors), parent: null, move: null });
  best.set(stateKey(board, start), 0);
  let expanded = 0;
  while (heap.size > 0) {
    const n = heap.pop();
    if (isSolved(board, n.racks)) {
      const sol: SoyunmaMove[] = [];
      for (let c: Node | null = n; c && c.move; c = c.parent) sol.push(c.move);
      return { sol: sol.reverse(), expanded };
    }
    expanded += 1;
    if (expanded > budget) return null;
    for (const [s, t] of successors(board, n.racks)) {
      const next = applyMove(board, n.racks, s, t);
      const key = stateKey(board, next);
      const g = n.g + 1;
      const prev = best.get(key);
      if (prev !== undefined && prev <= g) continue;
      best.set(key, g);
      heap.push({ racks: next, g, f: g + weight * heuristic(next, board.colors), parent: n, move: [s, t] });
    }
  }
  return null;
}

/**
 * Çözücü: önce hızlı ağırlıklı A* ile bir çözüm bulunur (çözülebilirlik
 * kanıtı); sonra daha düşük ağırlıkla ve en son ağırlıksız A* ile (bütçe
 * içinde) kısaltılır. Ağırlıksız arama biterse çözüm EN KISADIR. Belirlenimci.
 */
export function solveSoyunma(board: SoyunmaBoard, racks: SoyunmaRack[], exactBudget = 2000): SolveResult | null {
  let found: { sol: SoyunmaMove[]; expanded: number } | null = null;
  for (const [w, b] of [[3, 5000], [8, 10000]] as const) {
    found = astar(board, racks, w, b);
    if (found) break;
  }
  if (!found) return null;
  let expanded = found.expanded;
  let best = found.sol;
  const mid = astar(board, racks, 1.5, 1500);
  if (mid) {
    expanded += mid.expanded;
    if (mid.sol.length < best.length) best = mid.sol;
  }
  const exact = astar(board, racks, 1, exactBudget);
  if (exact) return { solution: exact.sol, optimal: true, expanded: expanded + exact.expanded };
  return { solution: best, optimal: false, expanded };
}

/* ────────────────────────────── üretici ────────────────────────────── */

interface Plan {
  colors: number;
  empties: number;
  /** Ek dar askılar (kapasite) — boş başlar ya da forma taşır. */
  small: number[];
  lock: boolean;
  /** Gizli forma içeren dolap oranı (0 = yok). */
  hiddenFrac: number;
  /** Kupa / nefes / öğretici ayarları. */
  cup: boolean;
  breather: boolean;
}

const TIPS: Record<number, string> = {
  1: "Bir dolaba dokun, üstteki formalar kalksın; sonra boş ya da üstü aynı renk olan dolaba dokun.",
  2: "Aynı renkteki ardışık formalar birlikte taşınır — tek hamlede bütün grup.",
  3: "Bir dolap tek renkle dolunca takım hazır olur ve kilitlenir.",
  5: "Takım sayısı artıyor: boş dolapları ara durak olarak akıllıca kullan.",
  8: "Gizli formalar: soru işaretli formanın rengi, üstü boşalınca görünür.",
  10: "Kupa maçı: hamle sınırı var — her hamleyi hesapla!",
  15: "Kilitli dolap: üstündeki renkteki takım hazır olunca kapısı açılır.",
  22: "Dar askı: bazı askılar daha az forma alır; ara durak olarak kullan.",
  37: "Az boş dolap: artık tek boş dolabın var, sırayı iyi planla.",
};

function planFor(level: number): Plan {
  const p = level % 10;
  const cup = p === 0;
  const breather = p === 5;
  // Öğretici eğri (1–10) elle ayarlandı.
  const intro: Record<number, Plan> = {
    5: { colors: 4, empties: 2, small: [], lock: false, hiddenFrac: 0, cup: false, breather: true },
    6: { colors: 4, empties: 2, small: [], lock: false, hiddenFrac: 0, cup: false, breather: false },
    7: { colors: 5, empties: 2, small: [], lock: false, hiddenFrac: 0, cup: false, breather: false },
    8: { colors: 4, empties: 2, small: [], lock: false, hiddenFrac: 0.4, cup: false, breather: false },
    9: { colors: 5, empties: 2, small: [], lock: false, hiddenFrac: 0.4, cup: false, breather: false },
    10: { colors: 5, empties: 2, small: [], lock: false, hiddenFrac: 0.5, cup: true, breather: false },
  };
  if (intro[level]) return intro[level];

  // Renk sayısı: her 20 seviyede bir artar (5 → 9), kupada +1, nefeste −1.
  const base = Math.min(9, 5 + Math.floor((level - 11) / 20));
  let colors = base + (cup ? 1 : 0) - (breather ? 1 : 0);
  colors = Math.max(4, Math.min(9, colors));

  let empties = 2;
  const small: number[] = [];
  // Dar askı (22+): bazı seviyelerde 3'lük ek askı.
  if (level >= 22 && (p === 2 || p === 6 || p === 8)) small.push(3);
  // Az boş dolap (35+): tek boş dolap + dar askı.
  if (level >= 35 && (p === 3 || p === 7)) {
    empties = 1;
    small.push(level >= 80 ? 2 : 3);
  }
  if (level >= 120 && (p === 1 || p === 9)) {
    empties = 1;
    small.push(3);
  }
  if (cup && level >= 60) {
    empties = 1;
    small.push(3);
  }

  const lock = level === 15 || (level > 15 && (p === 4 || p === 9 || (cup && level >= 30)));

  let hiddenFrac = 0;
  const hiddenWave = p === 8 || p === 9 || p === 0 || (level >= 30 && (p === 1 || p === 3)) || (level >= 100 && p !== 5);
  if (hiddenWave) hiddenFrac = Math.min(1, 0.35 + level / 400);
  if (breather) hiddenFrac = 0;

  return { colors, empties, small, lock, hiddenFrac, cup, breather };
}

/** Elle tasarlanmış ilk seviyeler (renk kimlikleri, alttan üste). */
const HANDMADE: Record<number, { caps: number[]; items: number[][] }> = {
  1: { caps: [4, 4, 4], items: [[0, 0, 0, 1], [1, 1, 1, 0], []] },
  2: { caps: [4, 4, 4], items: [[0, 0, 1, 1], [1, 1, 0, 0], []] },
  3: { caps: [4, 4, 4, 4, 4], items: [[0, 1, 2, 0], [1, 2, 0, 1], [2, 0, 1, 2], [], []] },
  4: { caps: [4, 4, 4, 4], items: [[0, 0, 1, 2], [1, 2, 2, 0], [2, 1, 1, 0], []] },
};

function shuffle<T>(arr: T[], rnd: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

interface Candidate {
  caps: number[];
  locks: (number | null)[];
  racks: SoyunmaRack[];
}

function buildCandidate(plan: Plan, rnd: () => number): Candidate {
  const T = SOYUNMA_TEAM_SIZE;
  const C = plan.colors;
  const pool: number[] = [];
  for (let c = 0; c < C; c += 1) for (let k = 0; k < T; k += 1) pool.push(c);
  shuffle(pool, rnd);

  const caps: number[] = [];
  const locks: (number | null)[] = [];
  const fills: number[] = [];
  const lockColor = plan.lock ? Math.floor(rnd() * C) : null;

  // Kilitli dolap: 2–3 forma taşır (kilidin renginden olmayan).
  let lockedItems: number[] = [];
  if (lockColor != null) {
    const want = 2 + Math.floor(rnd() * 2);
    for (let i = pool.length - 1; i >= 0 && lockedItems.length < want; i -= 1) {
      if (pool[i] !== lockColor) lockedItems.push(...pool.splice(i, 1));
    }
  }
  // Dar askılar: yarısı dolu başlar.
  const smallFills = plan.small.map((cap) => (rnd() < 0.5 ? cap - 1 : 0));
  const normalFill = pool.length - smallFills.reduce((a, b) => a + b, 0);
  // Normal dolaplar: C tane, toplam normalFill forma; boşluklar rastgele dağılır.
  const normal = new Array(C).fill(T);
  let deficit = C * T - normalFill;
  while (deficit > 0) {
    const i = Math.floor(rnd() * C);
    if (normal[i] > 1) {
      normal[i] -= 1;
      deficit -= 1;
    }
  }
  for (const f of normal) {
    caps.push(T);
    locks.push(null);
    fills.push(f);
  }
  plan.small.forEach((cap, i) => {
    caps.push(cap);
    locks.push(null);
    fills.push(smallFills[i]);
  });
  const racks: SoyunmaRack[] = [];
  let at = 0;
  for (const f of fills) {
    racks.push({ items: pool.slice(at, at + f), hidden: 0 });
    at += f;
  }
  if (lockColor != null) {
    caps.push(T);
    locks.push(lockColor);
    racks.push({ items: lockedItems, hidden: 0 });
  }
  for (let e = 0; e < plan.empties; e += 1) {
    caps.push(T);
    locks.push(null);
    racks.push({ items: [], hidden: 0 });
  }

  // Gizli formalar: seçilen dolaplarda en üst hariç hepsi gizli.
  if (plan.hiddenFrac > 0) {
    const candidates = racks.map((r, i) => i).filter((i) => racks[i].items.length >= 2 && locks[i] == null);
    shuffle(candidates, rnd);
    const n = Math.max(1, Math.round(candidates.length * plan.hiddenFrac));
    for (const i of candidates.slice(0, n)) racks[i].hidden = racks[i].items.length - 1;
  }

  // Dolapların ekrandaki sırası karışık olsun (kilitli ve boşlar dâhil).
  const order = shuffle(racks.map((_, i) => i), rnd);
  return {
    caps: order.map((i) => caps[i]),
    locks: order.map((i) => locks[i]),
    racks: order.map((i) => racks[i]),
  };
}

function starThresholds(par: number, hidden: boolean): { star3: number; star2: number } {
  const bonus = hidden ? 2 : 0;
  return {
    star3: par + Math.max(1, Math.round(par * 0.15)) + bonus,
    star2: par + Math.max(3, Math.round(par * 0.45)) + bonus,
  };
}

const cache = new Map<number, SoyunmaLevel>();

/** Önbellekte varsa seviyeyi döner (üretmeden) — ekran ilk karede hazırsa bekletmez. */
export function peekSoyunmaLevel(level: number): SoyunmaLevel | null {
  return cache.get(Math.max(1, Math.floor(level))) ?? null;
}

/** Denetim betiği için: önbelleği boşaltır (belirlenimcilik sınaması). */
export function resetSoyunmaCache(): void {
  cache.clear();
}

/** Seviye üretir (belirlenimci, önbellekli). Çözücü bir çözüm bulana dek tohum ilerler. */
export function generateSoyunmaLevel(levelIn: number): SoyunmaLevel {
  const level = Math.max(1, Math.floor(levelIn));
  const hit = cache.get(level);
  if (hit) return hit;

  const plan: Plan = HANDMADE[level]
    ? { colors: Math.max(...HANDMADE[level].items.flat()) + 1, empties: 0, small: [], lock: false, hiddenFrac: 0, cup: false, breather: false }
    : planFor(level);
  const T = SOYUNMA_TEAM_SIZE;
  let chosen: { cand: Candidate; res: SolveResult } | null = null;
  let fallback: { cand: Candidate; res: SolveResult } | null = null;

  for (let attempt = 0; attempt < 60 && !chosen; attempt += 1) {
    const rnd = soyunmaRandom(level * 7919 + SALT + attempt * 104729);
    let cand: Candidate;
    if (HANDMADE[level]) {
      const h = HANDMADE[level];
      cand = { caps: h.caps.slice(), locks: h.caps.map(() => null), racks: h.items.map((items) => ({ items: items.slice(), hidden: 0 })) };
    } else {
      cand = buildCandidate(plan, rnd);
    }
    const board: SoyunmaBoard = { caps: cand.caps, locks: cand.locks, team: T, colors: plan.colors };
    // Başlangıçta hazır takım ya da çözülmüş tahta olmasın.
    if (!HANDMADE[level] && (cand.racks.some((r) => isRackComplete(r, T)) || isSolved(board, cand.racks))) continue;
    const res = solveSoyunma(board, cand.racks);
    if (!res) continue;
    // Çok kolay kalan tahtaları ele (öğretici seviyeler hariç).
    const minPar = HANDMADE[level] ? 0 : Math.round(plan.colors * (plan.breather ? 1.2 : 1.6));
    if (res.solution.length >= minPar || HANDMADE[level]) chosen = { cand, res };
    else if (!fallback || res.solution.length > fallback.res.solution.length) fallback = { cand, res };
  }
  const pick = chosen ?? fallback;
  if (!pick) throw new Error(`soyunma: seviye ${level} üretilemedi`);

  // Renk → takım eşlemesi: ilk seviyelerde paletin baş renkleri, sonra karışık.
  const rnd = soyunmaRandom(level * 31337 + SALT);
  const palette = Array.from({ length: PALETTE_SIZE }, (_, i) => i);
  const head = level <= 10 ? palette : shuffle(palette.slice(), rnd);
  const teamIds = head.slice(0, plan.colors);

  const par = pick.res.solution.length;
  const hidden = pick.cand.racks.some((r) => r.hidden > 0);
  const { star3, star2 } = starThresholds(par, hidden);
  const moveLimit = plan.cup ? par + Math.max(3, Math.ceil(par * (hidden ? 0.4 : 0.25))) : null;

  const out: SoyunmaLevel = {
    level,
    colors: plan.colors,
    team: T,
    caps: pick.cand.caps,
    locks: pick.cand.locks,
    racks: pick.cand.racks,
    teamIds,
    solution: pick.res.solution,
    par,
    optimal: pick.res.optimal,
    star3,
    star2,
    moveLimit,
    cup: plan.cup,
    breather: plan.breather,
    tip: TIPS[level] ?? null,
    mechanics: {
      hidden,
      lock: pick.cand.locks.some((l) => l != null),
      small: pick.cand.caps.some((c) => c < T),
      fewEmpty: !HANDMADE[level] && plan.empties <= 1,
    },
  };
  cache.set(level, out);
  return out;
}

/** Yıldız: kullanılan hamlenin çözücü çözümüne oranı. */
export function soyunmaStars(level: SoyunmaLevel, movesUsed: number): 1 | 2 | 3 {
  if (movesUsed <= level.star3) return 3;
  if (movesUsed <= level.star2) return 2;
  return 1;
}
