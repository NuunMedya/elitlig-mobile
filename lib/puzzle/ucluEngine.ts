/**
 * ELİT ÜÇLÜ — saf oyun motoru (React'siz).
 *
 * Uygulama ve denetim betiği aynı motoru kullanır; böylece betiğin kanıtladığı
 * şey, oyuncunun oynadığı şeyin ta kendisidir. Yalnız TİP içe aktarır (node
 * --experimental-strip-types bunu siler), çalışma anı bağımlılığı yoktur.
 *
 * Akış: `createGame(seviye)` → `trySwap` / `useHammer` / `shuffleBoard` →
 * her biri, animasyon katmanının sırayla oynattığı `Step[]` üretir. Her adım
 * "temizlenenler + temizlik sonrası tahta + düşme sonrası tahta" taşır.
 * Hücre nesneleri adım başına kopyalanır; taş nesneleri değişmezdir (aynı
 * `id` = aynı taş, React tarafında memo ve konum animasyonu buna dayanır).
 */

import type { UcluGoalType, UcluLevel } from "./levels/uclu";

export const W = 8;
export const H = 8;
export const N = W * H;

export type Special = "none" | "h" | "v" | "bomb" | "ball";

export interface Tile {
  readonly id: number;
  readonly kind: "gem" | "trophy";
  /** Taş dizini; Altın Top ve kupa için -1. */
  readonly color: number;
  readonly special: Special;
}

export interface Cell {
  hole: boolean;
  tile: Tile | null;
  /** Çamur katı (0–2). */
  mud: number;
  /** Krampon kutusu canı (0–3); >0 iken hücrede taş yoktur. */
  crate: number;
  /** Kar (0–1): taş yerinden oynamaz. */
  snow: number;
  /** Kale ağı (0–1): taş yerinden oynamaz. */
  net: number;
}

export interface GoalState {
  type: UcluGoalType;
  color: number;
  target: number;
  left: number;
}

export interface GameState {
  cells: Cell[];
  colors: number;
  rng: number;
  nextId: number;
  goals: GoalState[];
  moves: number;
  movesTotal: number;
  score: number;
  /** Henüz sahaya inmemiş kupa sayısı. */
  trophyQueue: number;
  /** Her sütunun boş olmayan satırları (yukarıdan aşağı). */
  columns: number[][];
}

export interface Blast {
  kind: "row" | "col" | "bomb" | "ball" | "board";
  cell: number;
  radius?: number;
  targets?: number[];
}

export interface ClearedTile {
  tile: Tile;
  cell: number;
}

export interface Collect {
  goal: number;
  cell: number;
}

export interface Step {
  /** Altın Top kombosunda: renk özel taşa dönüşürken tahta. */
  convert: Cell[] | null;
  cleared: ClearedTile[];
  blasts: Blast[];
  /** Engel vuruşu alan hücreler (kutu, kar, ağ, çamur). */
  hits: number[];
  /** Yeni özel taş doğan hücreler. */
  created: { cell: number; special: Special }[];
  collects: Collect[];
  afterClear: Cell[];
  afterFall: Cell[];
  /** Yeni gelen taşlar: id → başlangıç satırı (tahtanın üstü, negatif olabilir). */
  spawnRows: Record<number, number>;
  /** En uzun düşüş (satır) — animasyon süresi için. */
  maxDrop: number;
  chain: number;
  /** Bu adımın oyuncuya yansıyan özeti (kombo metni için). */
  combo: "none" | "special" | "mega";
}

export interface SwapResult {
  ok: boolean;
  steps: Step[];
}

/* ───────────────────────────── temel ───────────────────────────── */

const rc = (i: number) => [Math.floor(i / W), i % W] as const;
const idx = (r: number, c: number) => r * W + c;
const inside = (r: number, c: number) => r >= 0 && r < H && c >= 0 && c < W;

export function rand(s: GameState): number {
  s.rng = (s.rng + 0x6d2b79f5) >>> 0;
  let t = s.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

const randInt = (s: GameState, n: number) => Math.floor(rand(s) * n);

function newTile(s: GameState, kind: Tile["kind"], color: number, special: Special = "none"): Tile {
  s.nextId += 1;
  return { id: s.nextId, kind, color, special };
}

export function cloneCells(cells: Cell[]): Cell[] {
  return cells.map((c) => ({ ...c }));
}

export function cloneState(s: GameState): GameState {
  return { ...s, cells: cloneCells(s.cells), goals: s.goals.map((g) => ({ ...g })) };
}

const locked = (c: Cell) => c.snow > 0 || c.net > 0;
const isEmpty = (c: Cell) => !c.hole && c.crate === 0 && !c.tile;
const isMovable = (c: Cell) => !!c.tile && c.crate === 0 && !locked(c);
/** Eşleşmeye girebilen taş rengi; giremiyorsa -1. */
function matchColor(c: Cell | undefined): number {
  if (!c || c.hole || c.crate > 0 || !c.tile) return -1;
  const t = c.tile;
  if (t.kind !== "gem" || t.special === "ball") return -1;
  return t.color;
}

export function canSwapCell(s: GameState, i: number): boolean {
  const c = s.cells[i];
  return !!c && !c.hole && isMovable(c);
}

export function adjacent(a: number, b: number): boolean {
  const [ar, ac] = rc(a);
  const [br, bc] = rc(b);
  return Math.abs(ar - br) + Math.abs(ac - bc) === 1;
}

/* ───────────────────────────── kurulum ───────────────────────────── */

/** Hücreye renk koyunca 3'lü oluşur mu (atanmış komşulara bakarak)? */
function wouldMatch(cells: Cell[], i: number, color: number): boolean {
  const [r, c] = rc(i);
  const same = (rr: number, cc: number) => inside(rr, cc) && matchColor(cells[idx(rr, cc)]) === color;
  let h = 1;
  for (let k = c - 1; same(r, k); k--) h++;
  for (let k = c + 1; same(r, k); k++) h++;
  if (h >= 3) return true;
  let v = 1;
  for (let k = r - 1; same(k, c); k--) v++;
  for (let k = r + 1; same(k, c); k++) v++;
  return v >= 3;
}

function freshColor(s: GameState, cells: Cell[], i: number): number {
  const start = randInt(s, s.colors);
  for (let k = 0; k < s.colors; k++) {
    const color = (start + k) % s.colors;
    if (!wouldMatch(cells, i, color)) return color;
  }
  return start;
}

function columnsOf(cells: Cell[]): number[][] {
  const cols: number[][] = [];
  for (let c = 0; c < W; c++) {
    const list: number[] = [];
    for (let r = 0; r < H; r++) if (!cells[idx(r, c)].hole) list.push(r);
    cols.push(list);
  }
  return cols;
}

/** Seviyeden oyun durumu. Belirlenimci: aynı seviye → aynı tahta. */
export function createGame(level: UcluLevel): GameState {
  const s: GameState = {
    cells: [],
    colors: level.colors,
    rng: level.seed ^ 0x5bd1e995,
    nextId: 0,
    goals: level.goals.map((g) => ({ type: g.type, color: g.color ?? -1, target: g.count, left: g.count })),
    moves: level.moves,
    movesTotal: level.moves,
    score: 0,
    trophyQueue: level.trophySpawn,
    columns: [],
  };
  const base = s.rng;
  for (let attempt = 0; attempt < 40; attempt++) {
    s.rng = (base + attempt * 977) >>> 0;
    s.nextId = 0;
    const cells: Cell[] = [];
    // 1) iskelet + sabit renkler
    const pending: number[] = [];
    for (let r = 0; r < H; r++) {
      for (let c = 0; c < W; c++) {
        const ch = level.layout[r]?.[c] ?? ".";
        const cell: Cell = { hole: ch === "#", tile: null, mud: 0, crate: 0, snow: 0, net: 0 };
        if (ch === "m") cell.mud = 1;
        if (ch === "M") cell.mud = 2;
        if (ch === "b") cell.crate = 1;
        if (ch === "B") cell.crate = 2;
        if (ch === "C") cell.crate = 3;
        if (ch === "s") cell.snow = 1;
        if (ch === "n") cell.net = 1;
        cells.push(cell);
      }
    }
    for (let i = 0; i < N; i++) {
      const ch = level.layout[Math.floor(i / W)]?.[i % W] ?? ".";
      if (ch >= "0" && ch <= "5") cells[i].tile = newTile(s, "gem", Number(ch) % s.colors);
      else if (ch === "t") cells[i].tile = newTile(s, "trophy", -1);
      else if (ch === "G") cells[i].tile = newTile(s, "gem", -1, "ball");
      else if (!cells[i].hole && cells[i].crate === 0) pending.push(i);
    }
    // 2) kalan taşlar — hazır eşleşme olmadan
    for (const i of pending) {
      const ch = level.layout[Math.floor(i / W)]?.[i % W] ?? ".";
      const color = freshColor(s, cells, i);
      const special: Special = ch === "R" ? "h" : ch === "V" ? "v" : ch === "O" ? "bomb" : "none";
      cells[i].tile = newTile(s, "gem", color, special);
    }
    s.cells = cells;
    s.columns = columnsOf(cells);
    if (findGroups(s).length === 0 && findMove(s)) return s;
  }
  // Son çare: renkleri karıştır (denetim betiği buraya düşülmediğini doğrular).
  shuffleBoard(s);
  return s;
}

/** Seviye öncesi güçlendirici: rastgele bir taşı özel taşa çevirir. */
export function placeSpecial(s: GameState, special: Special): number {
  const pool: number[] = [];
  s.cells.forEach((c, i) => {
    if (c.tile && c.tile.kind === "gem" && c.tile.special === "none" && !locked(c) && !c.hole) pool.push(i);
  });
  if (!pool.length) return -1;
  const i = pool[randInt(s, pool.length)];
  const old = s.cells[i].tile as Tile;
  s.cells[i].tile = newTile(s, "gem", special === "ball" ? -1 : old.color, special);
  return i;
}

/* ───────────────────────────── eşleşme ───────────────────────────── */

interface Run {
  cells: number[];
  dir: "h" | "v";
}

interface Group {
  cells: number[];
  runs: Run[];
}

function findRuns(s: GameState): Run[] {
  const runs: Run[] = [];
  for (let r = 0; r < H; r++) {
    let c = 0;
    while (c < W) {
      const col = matchColor(s.cells[idx(r, c)]);
      let e = c + 1;
      if (col >= 0) while (e < W && matchColor(s.cells[idx(r, e)]) === col) e++;
      if (col >= 0 && e - c >= 3) runs.push({ cells: Array.from({ length: e - c }, (_, k) => idx(r, c + k)), dir: "h" });
      c = e;
    }
  }
  for (let c = 0; c < W; c++) {
    let r = 0;
    while (r < H) {
      const col = matchColor(s.cells[idx(r, c)]);
      let e = r + 1;
      if (col >= 0) while (e < H && matchColor(s.cells[idx(e, c)]) === col) e++;
      if (col >= 0 && e - r >= 3) runs.push({ cells: Array.from({ length: e - r }, (_, k) => idx(r + k, c)), dir: "v" });
      r = e;
    }
  }
  return runs;
}

export function findGroups(s: GameState): Group[] {
  const runs = findRuns(s);
  if (!runs.length) return [];
  // Ortak hücresi olan dizileri birleştir (L / T şekilleri).
  const parent = runs.map((_, i) => i);
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  const owner = new Map<number, number>();
  runs.forEach((run, i) => {
    for (const cell of run.cells) {
      const o = owner.get(cell);
      if (o === undefined) owner.set(cell, i);
      else parent[find(i)] = find(o);
    }
  });
  const byRoot = new Map<number, Group>();
  runs.forEach((run, i) => {
    const root = find(i);
    let g = byRoot.get(root);
    if (!g) byRoot.set(root, (g = { cells: [], runs: [] }));
    g.runs.push(run);
    for (const cell of run.cells) if (!g.cells.includes(cell)) g.cells.push(cell);
  });
  return [...byRoot.values()];
}

function groupSpecial(g: Group): Special {
  const max = Math.max(...g.runs.map((r) => r.cells.length));
  if (max >= 5) return "ball";
  const hasH = g.runs.some((r) => r.dir === "h");
  const hasV = g.runs.some((r) => r.dir === "v");
  if (hasH && hasV) return "bomb";
  if (max === 4) return g.runs.find((r) => r.cells.length === 4)?.dir === "h" ? "h" : "v";
  return "none";
}

function creationCell(s: GameState, g: Group, special: Special, prefer: number[]): number {
  const ok = (i: number) => !locked(s.cells[i]);
  for (const p of prefer) if (g.cells.includes(p) && ok(p)) return p;
  if (special === "bomb") {
    const h = g.runs.filter((r) => r.dir === "h").flatMap((r) => r.cells);
    const cross = g.runs.filter((r) => r.dir === "v").flatMap((r) => r.cells).find((c) => h.includes(c) && ok(c));
    if (cross !== undefined) return cross;
  }
  const longest = g.runs.reduce((a, b) => (b.cells.length > a.cells.length ? b : a));
  const mid = longest.cells[Math.floor((longest.cells.length - 1) / 2)];
  if (ok(mid)) return mid;
  return g.cells.find(ok) ?? -1;
}

/** Bir hücreden geçen 3'lü var mı (takas denemesi için hızlı yerel test)? */
function matchAt(s: GameState, i: number): boolean {
  const col = matchColor(s.cells[i]);
  if (col < 0) return false;
  return wouldMatch(s.cells, i, col);
}

/** Olası bir hamle (ipucu); yoksa null. */
export function findMove(s: GameState): [number, number] | null {
  for (let i = 0; i < N; i++) {
    if (!canSwapCell(s, i)) continue;
    const [r, c] = rc(i);
    const nbs = [c + 1 < W ? i + 1 : -1, r + 1 < H ? i + W : -1];
    for (const j of nbs) {
      if (j < 0 || !canSwapCell(s, j)) continue;
      if (isComboSwap(s, i, j)) return [i, j];
      swapTiles(s, i, j);
      const hit = matchAt(s, i) || matchAt(s, j);
      swapTiles(s, i, j);
      if (hit) return [i, j];
    }
  }
  return null;
}

/** Tüm geçerli hamleler (bot ve ipucu için). */
export function allMoves(s: GameState): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < N; i++) {
    if (!canSwapCell(s, i)) continue;
    const [r, c] = rc(i);
    for (const j of [c + 1 < W ? i + 1 : -1, r + 1 < H ? i + W : -1]) {
      if (j < 0 || !canSwapCell(s, j)) continue;
      if (isComboSwap(s, i, j)) { out.push([i, j]); continue; }
      swapTiles(s, i, j);
      const hit = matchAt(s, i) || matchAt(s, j);
      swapTiles(s, i, j);
      if (hit) out.push([i, j]);
    }
  }
  return out;
}

function swapTiles(s: GameState, a: number, b: number) {
  const t = s.cells[a].tile;
  s.cells[a].tile = s.cells[b].tile;
  s.cells[b].tile = t;
}

function isComboSwap(s: GameState, a: number, b: number): boolean {
  const ta = s.cells[a].tile;
  const tb = s.cells[b].tile;
  if (!ta || !tb) return false;
  if (ta.special !== "none" && tb.special !== "none") return true;
  if (ta.special === "ball" && tb.kind === "gem") return true;
  if (tb.special === "ball" && ta.kind === "gem") return true;
  return false;
}

/* ───────────────────────────── çözümleme ───────────────────────────── */

interface Pending {
  consumed: number[];
  hitCells: number[];
  blasts: Blast[];
  convert: boolean;
  hammer: number;
}

class StepCtx {
  clear = new Set<number>();
  clearSource = new Map<number, Tile>();
  queue: number[] = [];
  crateHit = new Set<number>();
  lockHit = new Set<number>();
  mudHit = new Set<number>();
  consumed = new Set<number>();
  blasts: Blast[] = [];
  hits = new Set<number>();
  collects: Collect[] = [];
}

function progress(s: GameState, ctx: StepCtx, type: UcluGoalType, color: number, cell: number) {
  const gi = s.goals.findIndex((g) => g.type === type && (type !== "color" || g.color === color) && g.left > 0);
  if (gi < 0) return;
  s.goals[gi].left -= 1;
  ctx.collects.push({ goal: gi, cell });
}

function hitMud(s: GameState, ctx: StepCtx, i: number) {
  const c = s.cells[i];
  if (c.mud <= 0 || ctx.mudHit.has(i)) return;
  ctx.mudHit.add(i);
  c.mud -= 1;
  ctx.hits.add(i);
  s.score += 40;
  if (c.mud === 0) progress(s, ctx, "mud", -1, i);
}

function damageCrate(s: GameState, ctx: StepCtx, i: number, amount = 1) {
  const c = s.cells[i];
  if (c.crate <= 0 || ctx.crateHit.has(i)) return;
  ctx.crateHit.add(i);
  c.crate = Math.max(0, c.crate - amount);
  ctx.hits.add(i);
  s.score += 60;
  if (c.crate === 0) progress(s, ctx, "crate", -1, i);
}

function breakLock(s: GameState, ctx: StepCtx, i: number) {
  const c = s.cells[i];
  if (ctx.lockHit.has(i)) return;
  ctx.lockHit.add(i);
  ctx.hits.add(i);
  s.score += 50;
  if (c.snow > 0) {
    c.snow -= 1;
    if (c.snow === 0) progress(s, ctx, "snow", -1, i);
  } else if (c.net > 0) c.net -= 1;
}

/** Hücreye vuruş: kutu hasar, kilit kırılır, taş temizlenmek üzere işaretlenir. */
function hit(s: GameState, ctx: StepCtx, i: number) {
  const c = s.cells[i];
  if (!c || c.hole) return;
  if (c.crate > 0) return damageCrate(s, ctx, i);
  const t = c.tile;
  if (!t) return hitMud(s, ctx, i);
  // Ağ: kırılır, taş serbest kalır. Kar: kırılır ve altındaki taş da gider.
  if (c.net > 0) return breakLock(s, ctx, i);
  if (c.snow > 0) breakLock(s, ctx, i);
  if (t.kind === "trophy") return;
  if (ctx.clear.has(i)) return;
  ctx.clear.add(i);
  ctx.clearSource.set(i, t);
  if (t.special !== "none" && !ctx.consumed.has(i)) ctx.queue.push(i);
}

/** Eşleşen hücrenin yanındaki krampon kutusu vuruş alır. */
function hitNeighbours(s: GameState, ctx: StepCtx, i: number) {
  const [r, c] = rc(i);
  for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const rr = r + dr;
    const cc = c + dc;
    if (!inside(rr, cc)) continue;
    const j = idx(rr, cc);
    if (s.cells[j].crate > 0) damageCrate(s, ctx, j);
  }
}

function mostCommonColor(s: GameState, ctx: StepCtx): number {
  const count = new Array(s.colors).fill(0);
  s.cells.forEach((c, i) => {
    if (!ctx.clear.has(i) && c.tile && c.tile.kind === "gem" && c.tile.color >= 0 && !c.hole) count[c.tile.color] += 1;
  });
  let best = 0;
  for (let k = 1; k < count.length; k++) if (count[k] > count[best]) best = k;
  return best;
}

function cellsOfColor(s: GameState, color: number): number[] {
  const out: number[] = [];
  s.cells.forEach((c, i) => {
    if (!c.hole && c.tile && c.tile.kind === "gem" && c.tile.color === color) out.push(i);
  });
  return out;
}

function blastRow(s: GameState, ctx: StepCtx, r: number, from: number) {
  if (r < 0 || r >= H) return;
  ctx.blasts.push({ kind: "row", cell: from === -1 ? idx(r, 0) : idx(r, from % W) });
  for (let c = 0; c < W; c++) hit(s, ctx, idx(r, c));
}

function blastCol(s: GameState, ctx: StepCtx, c: number, from: number) {
  if (c < 0 || c >= W) return;
  ctx.blasts.push({ kind: "col", cell: from === -1 ? idx(0, c) : idx(Math.floor(from / W), c) });
  for (let r = 0; r < H; r++) hit(s, ctx, idx(r, c));
}

function blastSquare(s: GameState, ctx: StepCtx, center: number, radius: number) {
  const [r0, c0] = rc(center);
  ctx.blasts.push({ kind: "bomb", cell: center, radius });
  for (let r = r0 - radius; r <= r0 + radius; r++) for (let c = c0 - radius; c <= c0 + radius; c++) if (inside(r, c)) hit(s, ctx, idx(r, c));
}

/** Kuyruktaki özel taşları zincirleme patlatır. */
function runQueue(s: GameState, ctx: StepCtx) {
  let guard = 0;
  while (ctx.queue.length && guard++ < 200) {
    const i = ctx.queue.shift() as number;
    const t = ctx.clearSource.get(i);
    if (!t) continue;
    const [r, c] = rc(i);
    s.score += 120;
    if (t.special === "h") blastRow(s, ctx, r, i);
    else if (t.special === "v") blastCol(s, ctx, c, i);
    else if (t.special === "bomb") blastSquare(s, ctx, i, 1);
    else if (t.special === "ball") {
      const color = mostCommonColor(s, ctx);
      const targets = cellsOfColor(s, color);
      ctx.blasts.push({ kind: "ball", cell: i, targets });
      for (const j of targets) hit(s, ctx, j);
    }
  }
}

/** Kupa en alt hücreye indiyse toplanır. */
function trophiesAtBottom(s: GameState): number[] {
  const out: number[] = [];
  for (let c = 0; c < W; c++) {
    const list = s.columns[c];
    if (!list.length) continue;
    const i = idx(list[list.length - 1], c);
    const t = s.cells[i].tile;
    if (t && t.kind === "trophy") out.push(i);
  }
  return out;
}

/** Yerçekimi + yukarıdan yeni taş + çapraz kayma. */
function gravity(s: GameState, spawnRows: Record<number, number>): void {
  let guard = 0;
  let changed = true;
  const trophiesOnBoard = () => s.cells.reduce((n, c) => n + (c.tile?.kind === "trophy" ? 1 : 0), 0);
  while (changed && guard++ < 400) {
    changed = false;
    for (let c = 0; c < W; c++) {
      const list = s.columns[c];
      // Dikey: her boş hücre üstündeki ilk hareketli taşı çeker (sabit engelde durur).
      for (let k = list.length - 1; k >= 0; k--) {
        const i = idx(list[k], c);
        if (!isEmpty(s.cells[i])) continue;
        for (let j = k - 1; j >= 0; j--) {
          const ci = idx(list[j], c);
          const src = s.cells[ci];
          if (isEmpty(src)) continue;
          if (isMovable(src)) {
            s.cells[i].tile = src.tile;
            src.tile = null;
            changed = true;
          }
          break;
        }
      }
      // Tepedeki boşluklara yeni taş.
      let slots = 0;
      while (slots < list.length && isEmpty(s.cells[idx(list[slots], c)])) slots++;
      for (let k = slots - 1; k >= 0; k--) {
        const i = idx(list[k], c);
        let tile: Tile;
        if (s.trophyQueue > 0 && trophiesOnBoard() < 2 && rand(s) < 0.3) {
          s.trophyQueue -= 1;
          tile = newTile(s, "trophy", -1);
        } else {
          tile = newTile(s, "gem", randInt(s, s.colors));
        }
        s.cells[i].tile = tile;
        spawnRows[tile.id] = list[0] - (slots - k);
        changed = true;
      }
    }
    if (changed) continue;
    // Çapraz: engelin altında kalan boşluğa yandan kayma (her turda bir taş).
    outer: for (let r = H - 1; r >= 1; r--) {
      for (let c = 0; c < W; c++) {
        const i = idx(r, c);
        if (!isEmpty(s.cells[i])) continue;
        const order = (r + c) % 2 === 0 ? [-1, 1] : [1, -1];
        for (const dc of order) {
          const cc = c + dc;
          if (!inside(r - 1, cc)) continue;
          const src = s.cells[idx(r - 1, cc)];
          if (src.hole || !isMovable(src)) continue;
          // Kaynak taşın kendi altı doluysa (düşemiyorsa) kayar.
          const below = inside(r, cc) ? s.cells[idx(r, cc)] : null;
          if (below && isEmpty(below)) continue;
          s.cells[i].tile = src.tile;
          src.tile = null;
          changed = true;
          break outer;
        }
      }
    }
  }
}

function makeStep(): Step {
  return {
    convert: null, cleared: [], blasts: [], hits: [], created: [], collects: [],
    afterClear: [], afterFall: [], spawnRows: {}, maxDrop: 0, chain: 0, combo: "none",
  };
}

function positions(cells: Cell[]): Map<number, number> {
  const m = new Map<number, number>();
  cells.forEach((c, i) => {
    if (c.tile) m.set(c.tile.id, i);
  });
  return m;
}

/** Eşleşme kalmayana dek çözümler. `record` false ise kopya alınmaz (bot hızı). */
function resolve(s: GameState, first: Pending | null, prefer: number[], record: boolean): Step[] {
  const steps: Step[] = [];
  let pending = first;
  for (let chain = 1; chain < 60; chain++) {
    const groups = findGroups(s);
    const trophies = trophiesAtBottom(s);
    if (!pending && !groups.length && !trophies.length) break;
    const ctx = new StepCtx();
    const step = makeStep();
    step.chain = chain;
    const creations: { cell: number; special: Special; color: number }[] = [];

    if (pending) {
      if (pending.convert && record) step.convert = cloneCells(s.cells);
      for (const i of pending.consumed) {
        ctx.consumed.add(i);
        const t = s.cells[i].tile;
        if (t) {
          ctx.clear.add(i);
          ctx.clearSource.set(i, t);
        }
      }
      if (pending.hammer >= 0) {
        const i = pending.hammer;
        const c = s.cells[i];
        ctx.hits.add(i);
        if (c.crate > 0) {
          c.crate = 1;
          damageCrate(s, ctx, i);
        } else hit(s, ctx, i);
      }
      ctx.blasts.push(...pending.blasts);
      for (const i of pending.hitCells) hit(s, ctx, i);
      step.combo = pending.blasts.length ? "mega" : "none";
    }

    for (const g of groups) {
      const special = groupSpecial(g);
      if (special !== "none") {
        const at = creationCell(s, g, special, chain === 1 ? prefer : []);
        if (at >= 0) {
          const t = s.cells[at].tile as Tile;
          creations.push({ cell: at, special, color: special === "ball" ? -1 : t.color });
        }
      }
      for (const i of g.cells) hit(s, ctx, i);
      for (const i of g.cells) if (ctx.clear.has(i)) hitNeighbours(s, ctx, i);
      s.score += g.cells.length * 20 * chain;
    }

    for (const i of trophies) {
      const t = s.cells[i].tile as Tile;
      step.cleared.push({ tile: t, cell: i });
      s.cells[i].tile = null;
      progress(s, ctx, "trophy", -1, i);
      s.score += 500;
    }

    runQueue(s, ctx);

    // Temizlik: taşlar kalkar, çamur iner, hedefler ilerler.
    for (const i of ctx.clear) {
      const c = s.cells[i];
      const t = c.tile;
      if (!t) continue;
      step.cleared.push({ tile: t, cell: i });
      if (t.kind === "gem" && t.color >= 0) progress(s, ctx, "color", t.color, i);
      c.tile = null;
      hitMud(s, ctx, i);
    }
    for (const cr of creations) {
      const c = s.cells[cr.cell];
      if (c.tile || c.crate > 0) continue;
      c.tile = newTile(s, "gem", cr.color, cr.special);
      step.created.push({ cell: cr.cell, special: cr.special });
      if (step.combo === "none") step.combo = "special";
    }
    if (ctx.blasts.length && step.combo === "none") step.combo = "special";

    step.blasts = ctx.blasts;
    step.hits = [...ctx.hits];
    step.collects = ctx.collects;
    if (record) step.afterClear = cloneCells(s.cells);
    const before = record ? positions(s.cells) : null;
    gravity(s, step.spawnRows);
    if (record && before) {
      step.afterFall = cloneCells(s.cells);
      let maxDrop = 0;
      s.cells.forEach((c, i) => {
        if (!c.tile) return;
        const from = before.get(c.tile.id);
        const r1 = Math.floor(i / W);
        const r0 = from !== undefined ? Math.floor(from / W) : step.spawnRows[c.tile.id] ?? r1;
        maxDrop = Math.max(maxDrop, r1 - r0);
      });
      step.maxDrop = maxDrop;
    }
    steps.push(step);
    pending = null;
  }
  return steps;
}

/* ───────────────────────────── hamleler ───────────────────────────── */

function comboPending(s: GameState, a: number, b: number): Pending {
  // Takas uygulanmış: sürüklenen taş artık b'de.
  const ta = s.cells[b].tile as Tile;
  const tb = s.cells[a].tile as Tile;
  const [r, c] = rc(b);
  const p: Pending = { consumed: [a, b], hitCells: [], blasts: [], convert: false, hammer: -1 };
  const rocket = (t: Tile) => t.special === "h" || t.special === "v";
  const row = (rr: number) => {
    if (rr < 0 || rr >= H) return;
    p.blasts.push({ kind: "row", cell: idx(rr, c) });
    for (let k = 0; k < W; k++) p.hitCells.push(idx(rr, k));
  };
  const col = (cc: number) => {
    if (cc < 0 || cc >= W) return;
    p.blasts.push({ kind: "col", cell: idx(r, cc) });
    for (let k = 0; k < H; k++) p.hitCells.push(idx(k, cc));
  };
  const ball = ta.special === "ball" ? ta : tb.special === "ball" ? tb : null;
  const other = ball === ta ? tb : ta;
  if (ball && other.special === "ball") {
    p.blasts.push({ kind: "board", cell: b });
    for (let i = 0; i < N; i++) p.hitCells.push(i);
  } else if (ball && other.special === "none") {
    const targets = cellsOfColor(s, other.color).filter((i) => i !== a && i !== b);
    p.blasts.push({ kind: "ball", cell: b, targets });
    p.hitCells.push(...targets);
  } else if (ball) {
    // Altın Top + özel: o rengin tüm taşları özel taşa döner ve patlar.
    const targets = cellsOfColor(s, other.color).filter((i) => i !== a && i !== b && !locked(s.cells[i]));
    for (const i of targets) {
      const t = s.cells[i].tile as Tile;
      const sp: Special = other.special === "bomb" ? "bomb" : rand(s) < 0.5 ? "h" : "v";
      s.cells[i].tile = t.special === "none" ? newTile(s, "gem", t.color, sp) : t;
    }
    p.convert = true;
    p.blasts.push({ kind: "ball", cell: b, targets });
    p.hitCells.push(...targets);
  } else if (rocket(ta) && rocket(tb)) {
    row(r);
    col(c);
  } else if ((rocket(ta) && tb.special === "bomb") || (ta.special === "bomb" && rocket(tb))) {
    for (let d = -1; d <= 1; d++) {
      row(r + d);
      col(c + d);
    }
  } else {
    // bomba + bomba: 5×5
    p.blasts.push({ kind: "bomb", cell: b, radius: 2 });
    for (let rr = r - 2; rr <= r + 2; rr++) for (let cc = c - 2; cc <= c + 2; cc++) if (inside(rr, cc)) p.hitCells.push(idx(rr, cc));
  }
  return p;
}

/** Oyuncu hamlesi: a'daki taşı b'ye kaydır. Geçersizse tahta değişmez. */
export function trySwap(s: GameState, a: number, b: number, record = true): SwapResult {
  if (!adjacent(a, b) || !canSwapCell(s, a) || !canSwapCell(s, b) || s.moves <= 0) return { ok: false, steps: [] };
  if (isComboSwap(s, a, b)) {
    swapTiles(s, a, b);
    s.moves -= 1;
    const pending = comboPending(s, a, b);
    return { ok: true, steps: resolve(s, pending, [b, a], record) };
  }
  swapTiles(s, a, b);
  if (!matchAt(s, a) && !matchAt(s, b)) {
    swapTiles(s, a, b);
    return { ok: false, steps: [] };
  }
  s.moves -= 1;
  return { ok: true, steps: resolve(s, null, [b, a], record) };
}

/** Krampon Darbesi bu hücrede bir şey kırar mı? (kupa kırılmaz) */
export function canHammer(s: GameState, i: number): boolean {
  const c = s.cells[i];
  if (!c || c.hole) return false;
  if (c.crate > 0) return true;
  if (!c.tile) return c.mud > 0;
  return c.tile.kind !== "trophy";
}

/** Krampon Darbesi: tek hücreyi kırar (hamle harcamaz). */
export function hammerCell(s: GameState, i: number, record = true): Step[] {
  if (!canHammer(s, i)) return [];
  const p: Pending = { consumed: [], hitCells: [], blasts: [], convert: false, hammer: i };
  return resolve(s, p, [], record);
}

/** Kazanınca kalan hamleler: rastgele taş Füze Şut olur. Hücreyi döndürür. */
export function bonusConvert(s: GameState): number {
  const pool: number[] = [];
  s.cells.forEach((c, i) => {
    if (c.tile && c.tile.kind === "gem" && c.tile.special === "none" && !locked(c) && !c.hole) pool.push(i);
  });
  if (!pool.length) return -1;
  const i = pool[randInt(s, pool.length)];
  const t = s.cells[i].tile as Tile;
  s.cells[i].tile = newTile(s, "gem", t.color, rand(s) < 0.5 ? "h" : "v");
  s.score += 300;
  return i;
}

/** Tahtadaki tüm özel taşları patlatır (bonus anı). */
export function detonateAll(s: GameState, record = true): Step[] {
  const cells: number[] = [];
  s.cells.forEach((c, i) => {
    if (c.tile && c.tile.special !== "none" && !locked(c)) cells.push(i);
  });
  if (!cells.length) return [];
  return resolve(s, { consumed: [], hitCells: cells, blasts: [], convert: false, hammer: -1 }, [], record);
}

export function hasSpecials(s: GameState): boolean {
  return s.cells.some((c) => !!c.tile && c.tile.special !== "none" && !locked(c));
}

/**
 * Karıştır: kilitsiz düz taşların yerini değiştirir (aynı id'ler — taşlar
 * yeni yerlerine kayar). Hazır eşleşme olmayan ve hamlesi olan dizilim arar.
 */
export function shuffleBoard(s: GameState): boolean {
  const slots: number[] = [];
  s.cells.forEach((c, i) => {
    if (c.tile && c.tile.kind === "gem" && c.tile.special === "none" && isMovable(c)) slots.push(i);
  });
  const original = slots.map((i) => s.cells[i].tile as Tile);
  for (let attempt = 0; attempt < 80; attempt++) {
    const tiles = original.slice();
    for (let k = tiles.length - 1; k > 0; k--) {
      const j = randInt(s, k + 1);
      [tiles[k], tiles[j]] = [tiles[j], tiles[k]];
    }
    slots.forEach((i, k) => (s.cells[i].tile = tiles[k]));
    if (!findGroups(s).length && findMove(s)) return true;
  }
  // Yerleşim yetmedi: renkleri yeniden dağıt (id'ler korunur).
  for (let attempt = 0; attempt < 80; attempt++) {
    for (const i of slots) s.cells[i].tile = null;
    for (const i of slots) {
      const id = original[slots.indexOf(i)].id;
      s.cells[i].tile = { id, kind: "gem", color: freshColor(s, s.cells, i), special: "none" };
    }
    if (!findGroups(s).length && findMove(s)) return true;
  }
  return false;
}

export function goalsDone(s: GameState): boolean {
  return s.goals.every((g) => g.left <= 0);
}

/** Yıldız: kalan hamle oranına göre. */
export function starsFor(movesLeft: number, movesTotal: number): 1 | 2 | 3 {
  const ratio = movesTotal > 0 ? movesLeft / movesTotal : 0;
  if (ratio >= 0.3) return 3;
  if (ratio >= 0.12) return 2;
  return 1;
}

export const cellRow = (i: number) => Math.floor(i / W);
export const cellCol = (i: number) => i % W;
