/**
 * ELİT ÜÇLÜ — saf oyun motoru (React'siz).
 *
 * Uygulama ve denetim betiği aynı motoru kullanır; böylece betiğin kanıtladığı
 * şey, oyuncunun oynadığı şeyin ta kendisidir. Yalnız TİP içe aktarır (node
 * --experimental-strip-types bunu siler), çalışma anı bağımlılığı yoktur.
 *
 * Akış: `createGame(seviye)` → `trySwap` / `activateSpecial` / `hammerCell` /
 * `shuffleBoard` → her biri, animasyon katmanının sırayla oynattığı `Step[]`
 * üretir. Her adım "uçuşlar + temizlenenler + temizlik sonrası tahta + düşme
 * sonrası tahta" taşır. Hücre nesneleri adım başına kopyalanır; taş nesneleri
 * değişmezdir (aynı `id` = aynı taş, React tarafında memo ve konum animasyonu
 * buna dayanır; koni hasar alınca aynı id ile yeni nesne olur).
 *
 * KURALLAR (türün alışılmış dili, özgün futbol teması):
 *   · 3'lü yatay/dikey dizi ya da 2×2 kare eşleşir.
 *   · Özel taşlar RENKSİZDİR, eşleşmeye girmez; komşusuyla kaydırılınca ya da
 *     dokununca (1 hamle) patlar:
 *       4'lü düz   → Füze (h / v): satırı ya da sütunu temizler. Yön, oyuncu
 *                    hamlesinde KAYDIRMA yönüdür; zincirde dizinin yönüdür.
 *       2×2 kare   → Dron: artı biçiminde 5 hücre temizler, sonra kalkıp bir
 *                    HEDEFE (kutu, koni, çamur, hedef renk…) uçar ve vurur.
 *       L / T      → Röveşata (bomba): 3×3.
 *       5'li düz   → Altın Top: kaydırıldığı taşın rengindeki tüm taşlar.
 *   · İki özel taş birbiriyle kaydırılırsa kombo: füze+füze artı, füze+bomba
 *     3 şeritli artı, bomba+bomba 5×5, dron+X (dron X'i hedefe taşır),
 *     dron+dron üç dron, Altın Top+özel (en kalabalık renk o özele döner),
 *     Altın Top+Altın Top bütün tahta.
 *   · Engeller: çamur (1–2 kat, taşın altında), krampon kutusu (1–3 kat, sabit;
 *     komşu eşleşme ya da patlama), kar (taş donar), kale ağı (taş zincirli),
 *     antrenman konisi (1–2 kat, DÜŞER; yalnız komşu eşleşme / patlama),
 *     çim (eşleşmede çimli hücre varsa bütün dizi çimlenir — yayılır),
 *     şampiyonluk kupası (en alt sıraya indirilir).
 */

import type { UcluGoalType, UcluLevel } from "./levels/uclu";

export const W = 8;
export const H = 8;
export const N = W * H;

export type Special = "none" | "h" | "v" | "bomb" | "ball" | "drone";
export type TileKind = "gem" | "trophy" | "cone";

export interface Tile {
  readonly id: number;
  readonly kind: TileKind;
  /** Taş dizini; özel taş, kupa ve koni için -1. */
  readonly color: number;
  readonly special: Special;
  /** Koni canı (1–2). */
  readonly hp?: number;
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
  /** Çim: 0 yok (hedef değil), 1 çıplak toprak (çimlenecek), 2 çimli. */
  turf: number;
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
  kind: "row" | "col" | "bomb" | "ball" | "board" | "drone";
  cell: number;
  radius?: number;
  targets?: number[];
}

export interface Flight {
  from: number;
  to: number;
  /** Dronun taşıdığı özel (kombo); "none" yalnız hedefi vurur. */
  carry: Special;
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
  /** Adım başında hedefe uçan dronlar (animasyon önce bunu oynatır). */
  flights: Flight[];
  cleared: ClearedTile[];
  blasts: Blast[];
  /** Engel vuruşu alan hücreler (kutu, kar, ağ, çamur, koni, çim). */
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
const isRocket = (sp: Special) => sp === "h" || sp === "v";

export function rand(s: GameState): number {
  s.rng = (s.rng + 0x6d2b79f5) >>> 0;
  let t = s.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

const randInt = (s: GameState, n: number) => Math.floor(rand(s) * n);

function newTile(s: GameState, kind: TileKind, color: number, special: Special = "none", hp?: number): Tile {
  s.nextId += 1;
  return hp ? { id: s.nextId, kind, color, special, hp } : { id: s.nextId, kind, color, special };
}

export function cloneCells(cells: Cell[]): Cell[] {
  return cells.map((c) => ({ ...c }));
}

export function cloneState(s: GameState): GameState {
  return { ...s, cells: cloneCells(s.cells), goals: s.goals.map((g) => ({ ...g })) };
}

const locked = (c: Cell) => c.snow > 0 || c.net > 0;
const isEmpty = (c: Cell) => !c.hole && c.crate === 0 && !c.tile;
/** Yerçekimiyle düşebilir mi (koni ve kupa düşer). */
const canFall = (c: Cell) => !!c.tile && c.crate === 0 && !locked(c);
/** Eşleşmeye girebilen taş rengi; giremiyorsa -1. */
function matchColor(c: Cell | undefined): number {
  if (!c || c.hole || c.crate > 0 || !c.tile) return -1;
  const t = c.tile;
  if (t.kind !== "gem" || t.special !== "none") return -1;
  return t.color;
}

/** Oyuncu bu hücredeki taşı kaydırabilir mi? (koni kaydırılamaz) */
export function canSwapCell(s: GameState, i: number): boolean {
  const c = s.cells[i];
  return !!c && !c.hole && canFall(c) && (c.tile as Tile).kind !== "cone";
}

/** Dokununca patlatılabilen özel taş mı? */
export function canActivate(s: GameState, i: number): boolean {
  const c = s.cells[i];
  return canSwapCell(s, i) && (c.tile as Tile).special !== "none";
}

export function adjacent(a: number, b: number): boolean {
  const [ar, ac] = rc(a);
  const [br, bc] = rc(b);
  return Math.abs(ar - br) + Math.abs(ac - bc) === 1;
}

/* ───────────────────────────── kurulum ───────────────────────────── */

/** Hücreye renk koyunca 3'lü ya da 2×2 kare oluşur mu (komşulara bakarak)? */
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
  if (v >= 3) return true;
  for (const [dr, dc] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
    if (same(r + dr, c) && same(r, c + dc) && same(r + dr, c + dc)) return true;
  }
  return false;
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

const SPECIAL_CHARS: Record<string, Special> = { R: "h", V: "v", O: "bomb", G: "ball", D: "drone" };

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
  for (let attempt = 0; attempt < 60; attempt++) {
    s.rng = (base + attempt * 977) >>> 0;
    s.nextId = 0;
    const cells: Cell[] = [];
    const pending: number[] = [];
    const chAt = (i: number) => level.layout[Math.floor(i / W)]?.[i % W] ?? ".";
    // 1) iskelet + zemin + engeller
    for (let i = 0; i < N; i++) {
      const ch = chAt(i);
      const cell: Cell = { hole: ch === "#", tile: null, mud: 0, crate: 0, snow: 0, net: 0, turf: 0 };
      if (ch === "m") cell.mud = 1;
      if (ch === "M") cell.mud = 2;
      if (ch === "b") cell.crate = 1;
      if (ch === "B") cell.crate = 2;
      if (ch === "C") cell.crate = 3;
      if (ch === "s") cell.snow = 1;
      if (ch === "n") cell.net = 1;
      if (ch === "g") cell.turf = 1;
      if (ch === "*") cell.turf = 2;
      cells.push(cell);
    }
    // Çim hedefi varsa toprak/çim dışındaki açık hücreler hedef dışı kalır (0).
    // 2) sabit taşlar
    for (let i = 0; i < N; i++) {
      const ch = chAt(i);
      if (ch >= "0" && ch <= "5") cells[i].tile = newTile(s, "gem", Number(ch) % s.colors);
      else if (ch === "t") cells[i].tile = newTile(s, "trophy", -1);
      else if (ch === "k") cells[i].tile = newTile(s, "cone", -1, "none", 1);
      else if (ch === "K") cells[i].tile = newTile(s, "cone", -1, "none", 2);
      else if (SPECIAL_CHARS[ch]) cells[i].tile = newTile(s, "gem", -1, SPECIAL_CHARS[ch]);
      else if (!cells[i].hole && cells[i].crate === 0) pending.push(i);
    }
    // 3) kalan taşlar — hazır eşleşme olmadan
    for (const i of pending) cells[i].tile = newTile(s, "gem", freshColor(s, cells, i));
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
  s.cells[i].tile = newTile(s, "gem", -1, special);
  return i;
}

/* ───────────────────────────── eşleşme ───────────────────────────── */

interface Shape {
  cells: number[];
  dir: "h" | "v" | "sq";
}

export interface Group {
  cells: number[];
  shapes: Shape[];
}

function findShapes(s: GameState): Shape[] {
  const out: Shape[] = [];
  for (let r = 0; r < H; r++) {
    let c = 0;
    while (c < W) {
      const col = matchColor(s.cells[idx(r, c)]);
      let e = c + 1;
      if (col >= 0) while (e < W && matchColor(s.cells[idx(r, e)]) === col) e++;
      if (col >= 0 && e - c >= 3) out.push({ cells: Array.from({ length: e - c }, (_, k) => idx(r, c + k)), dir: "h" });
      c = e;
    }
  }
  for (let c = 0; c < W; c++) {
    let r = 0;
    while (r < H) {
      const col = matchColor(s.cells[idx(r, c)]);
      let e = r + 1;
      if (col >= 0) while (e < H && matchColor(s.cells[idx(e, c)]) === col) e++;
      if (col >= 0 && e - r >= 3) out.push({ cells: Array.from({ length: e - r }, (_, k) => idx(r + k, c)), dir: "v" });
      r = e;
    }
  }
  // 2×2 kareler.
  for (let r = 0; r < H - 1; r++) {
    for (let c = 0; c < W - 1; c++) {
      const i = idx(r, c);
      const col = matchColor(s.cells[i]);
      if (col < 0) continue;
      const q = [i, i + 1, i + W, i + W + 1];
      if (q.every((j) => matchColor(s.cells[j]) === col)) out.push({ cells: q, dir: "sq" });
    }
  }
  return out;
}

export function findGroups(s: GameState): Group[] {
  const shapes = findShapes(s);
  if (!shapes.length) return [];
  // Ortak hücresi olan şekilleri birleştir (L / T, kare + dizi).
  const parent = shapes.map((_, i) => i);
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  const owner = new Map<number, number>();
  shapes.forEach((sh, i) => {
    for (const cell of sh.cells) {
      const o = owner.get(cell);
      if (o === undefined) owner.set(cell, i);
      else parent[find(i)] = find(o);
    }
  });
  const byRoot = new Map<number, Group>();
  shapes.forEach((sh, i) => {
    const root = find(i);
    let g = byRoot.get(root);
    if (!g) byRoot.set(root, (g = { cells: [], shapes: [] }));
    g.shapes.push(sh);
    for (const cell of sh.cells) if (!g.cells.includes(cell)) g.cells.push(cell);
  });
  return [...byRoot.values()];
}

/** Öncelik: Altın Top > Röveşata > Füze > Dron. */
function groupSpecial(g: Group, swapAxis: "h" | "v" | null): Special {
  const lines = g.shapes.filter((sh) => sh.dir !== "sq");
  const max = lines.length ? Math.max(...lines.map((sh) => sh.cells.length)) : 0;
  if (max >= 5) return "ball";
  const hasH = lines.some((sh) => sh.dir === "h");
  const hasV = lines.some((sh) => sh.dir === "v");
  if (hasH && hasV) return "bomb";
  if (max === 4) {
    if (swapAxis) return swapAxis;
    return lines.find((sh) => sh.cells.length === 4)?.dir === "v" ? "v" : "h";
  }
  if (g.shapes.some((sh) => sh.dir === "sq")) return "drone";
  return "none";
}

function creationCell(s: GameState, g: Group, special: Special, prefer: number[]): number {
  const ok = (i: number) => !locked(s.cells[i]);
  for (const p of prefer) if (g.cells.includes(p) && ok(p)) return p;
  const lines = g.shapes.filter((sh) => sh.dir !== "sq");
  if (special === "bomb") {
    const h = lines.filter((sh) => sh.dir === "h").flatMap((sh) => sh.cells);
    const cross = lines.filter((sh) => sh.dir === "v").flatMap((sh) => sh.cells).find((c) => h.includes(c) && ok(c));
    if (cross !== undefined) return cross;
  }
  if (lines.length) {
    const longest = lines.reduce((a, b) => (b.cells.length > a.cells.length ? b : a));
    const mid = longest.cells[Math.floor((longest.cells.length - 1) / 2)];
    if (ok(mid)) return mid;
  }
  return g.cells.find(ok) ?? -1;
}

/** Bir hücreden geçen eşleşme var mı (takas denemesi için hızlı yerel test)? */
function matchAt(s: GameState, i: number): boolean {
  const col = matchColor(s.cells[i]);
  if (col < 0) return false;
  return wouldMatch(s.cells, i, col);
}

function swapTiles(s: GameState, a: number, b: number) {
  const t = s.cells[a].tile;
  s.cells[a].tile = s.cells[b].tile;
  s.cells[b].tile = t;
}

/** Takas, eşleşmeden bağımsız olarak geçerli mi (özel taş içeriyor)? */
function isSpecialSwap(s: GameState, a: number, b: number): boolean {
  const ta = s.cells[a].tile;
  const tb = s.cells[b].tile;
  return !!ta && !!tb && (ta.special !== "none" || tb.special !== "none");
}

function validSwap(s: GameState, i: number, j: number): boolean {
  if (!canSwapCell(s, i) || !canSwapCell(s, j)) return false;
  if (isSpecialSwap(s, i, j)) return true;
  swapTiles(s, i, j);
  const hit = matchAt(s, i) || matchAt(s, j);
  swapTiles(s, i, j);
  return hit;
}

/** Olası bir hamle (ipucu); yoksa null. */
export function findMove(s: GameState): [number, number] | null {
  for (let i = 0; i < N; i++) {
    if (!canSwapCell(s, i)) continue;
    const [r, c] = rc(i);
    for (const j of [c + 1 < W ? i + 1 : -1, r + 1 < H ? i + W : -1]) {
      if (j >= 0 && validSwap(s, i, j)) return [i, j];
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
      if (j >= 0 && validSwap(s, i, j)) out.push([i, j]);
    }
  }
  return out;
}

/**
 * İpucu: en çok iş gören hamleyi seçer (özel taş üreten / hedefe değen önce).
 * Kopya üzerinde dener; tahta değişmez.
 */
export function findHint(s: GameState): [number, number] | null {
  const moves = allMoves(s);
  if (!moves.length) return null;
  let best = moves[0];
  let bestV = -1;
  const leftOf = (g: GameState) => g.goals.reduce((n, x) => n + Math.max(0, x.left), 0);
  const before = leftOf(s);
  for (const [a, b] of moves.slice(0, 48)) {
    const c = cloneState(s);
    c.rng = (c.rng ^ 0x9e3779b9) >>> 0;
    const res = trySwap(c, a, b, false);
    if (!res.ok) continue;
    const first = res.steps[0];
    const v = (before - leftOf(c)) * 4 + (first ? first.created.length * 6 + first.cleared.length : 0);
    if (v > bestV) {
      bestV = v;
      best = [a, b];
    }
  }
  return best;
}

/* ───────────────────────────── çözümleme ───────────────────────────── */

interface Pending {
  consumed: number[];
  hitCells: number[];
  blasts: Blast[];
  convert: boolean;
  hammer: number;
  /** Bu işlemle gelen vuruşlar çim yayar mı. */
  spread: boolean;
  /** Bu adımın başında hedefe uçacak dronlar. */
  flights: { from: number; carry: Special; spread: boolean }[];
}

const emptyPending = (): Pending => ({ consumed: [], hitCells: [], blasts: [], convert: false, hammer: -1, spread: false, flights: [] });

class StepCtx {
  clear = new Set<number>();
  clearSource = new Map<number, Tile>();
  /** Patlayacak özel taşlar: hücre + çim yayıyor mu. */
  queue: { cell: number; spread: boolean }[] = [];
  crateHit = new Set<number>();
  coneHit = new Set<number>();
  lockHit = new Set<number>();
  mudHit = new Set<number>();
  consumed = new Set<number>();
  /** Bu adımda vurulacağı seçilmiş hücreler (dron hedefi çakışmasın). */
  claimed = new Set<number>();
  blasts: Blast[] = [];
  hits = new Set<number>();
  collects: Collect[] = [];
  removed: ClearedTile[] = [];
  /** Sonraki adımda uçacak dronlar. */
  flights: { from: number; carry: Special; spread: boolean }[] = [];
  spreadCells = new Set<number>();
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

function grow(s: GameState, ctx: StepCtx, i: number) {
  const c = s.cells[i];
  if (c.hole || c.turf !== 1 || c.crate > 0) return;
  c.turf = 2;
  ctx.hits.add(i);
  s.score += 30;
  progress(s, ctx, "turf", -1, i);
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

function damageCone(s: GameState, ctx: StepCtx, i: number) {
  const c = s.cells[i];
  const t = c.tile;
  if (!t || t.kind !== "cone" || ctx.coneHit.has(i)) return;
  ctx.coneHit.add(i);
  ctx.hits.add(i);
  s.score += 60;
  const hp = (t.hp ?? 1) - 1;
  if (hp > 0) {
    c.tile = { ...t, hp };
    return;
  }
  ctx.removed.push({ tile: t, cell: i });
  c.tile = null;
  progress(s, ctx, "cone", -1, i);
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
  } else if (c.net > 0) {
    c.net -= 1;
    if (c.net === 0) progress(s, ctx, "net", -1, i);
  }
}

/** Hücreye vuruş: kutu / koni hasar, kilit kırılır, taş temizlenmek üzere işaretlenir. */
function hit(s: GameState, ctx: StepCtx, i: number, spread = false) {
  const c = s.cells[i];
  if (!c || c.hole) return;
  if (spread) ctx.spreadCells.add(i);
  if (c.crate > 0) return damageCrate(s, ctx, i);
  const t = c.tile;
  if (!t) return hitMud(s, ctx, i);
  if (t.kind === "cone") return damageCone(s, ctx, i);
  // Ağ: kırılır, taş serbest kalır. Kar: kırılır ve altındaki taş da gider.
  if (c.net > 0) return breakLock(s, ctx, i);
  if (c.snow > 0) breakLock(s, ctx, i);
  if (t.kind === "trophy") return;
  if (ctx.clear.has(i)) return;
  ctx.clear.add(i);
  ctx.clearSource.set(i, t);
  if (t.special !== "none" && !ctx.consumed.has(i)) ctx.queue.push({ cell: i, spread: spread || c.turf === 2 });
}

/** Eşleşen hücrenin yanındaki krampon kutusu ve koni vuruş alır. */
function hitNeighbours(s: GameState, ctx: StepCtx, i: number) {
  const [r, c] = rc(i);
  for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const rr = r + dr;
    const cc = c + dc;
    if (!inside(rr, cc)) continue;
    const j = idx(rr, cc);
    const cell = s.cells[j];
    if (cell.crate > 0) damageCrate(s, ctx, j);
    else if (cell.tile?.kind === "cone") damageCone(s, ctx, j);
  }
}

function mostCommonColor(s: GameState, ctx: StepCtx | null): number {
  const count = new Array(s.colors).fill(0);
  s.cells.forEach((c, i) => {
    if (ctx?.clear.has(i)) return;
    const col = matchColor(c);
    if (col >= 0) count[col] += 1;
  });
  let best = 0;
  for (let k = 1; k < count.length; k++) if (count[k] > count[best]) best = k;
  return best;
}

function cellsOfColor(s: GameState, color: number): number[] {
  const out: number[] = [];
  s.cells.forEach((c, i) => {
    if (!c.hole && c.crate === 0 && c.tile && c.tile.kind === "gem" && c.tile.special === "none" && c.tile.color === color) out.push(i);
  });
  return out;
}

function blastRow(s: GameState, ctx: StepCtx, r: number, from: number, spread: boolean) {
  if (r < 0 || r >= H) return;
  ctx.blasts.push({ kind: "row", cell: idx(r, from % W) });
  for (let c = 0; c < W; c++) hit(s, ctx, idx(r, c), spread);
}

function blastCol(s: GameState, ctx: StepCtx, c: number, from: number, spread: boolean) {
  if (c < 0 || c >= W) return;
  ctx.blasts.push({ kind: "col", cell: idx(Math.floor(from / W), c) });
  for (let r = 0; r < H; r++) hit(s, ctx, idx(r, c), spread);
}

function blastSquare(s: GameState, ctx: StepCtx, center: number, radius: number, spread: boolean) {
  const [r0, c0] = rc(center);
  ctx.blasts.push({ kind: "bomb", cell: center, radius });
  for (let r = r0 - radius; r <= r0 + radius; r++) for (let c = c0 - radius; c <= c0 + radius; c++) if (inside(r, c)) hit(s, ctx, idx(r, c), spread);
}

/** Dronun kalkışı: kendi hücresi + dört komşu. */
function droneCross(s: GameState, ctx: StepCtx, i: number, spread: boolean) {
  const [r, c] = rc(i);
  ctx.blasts.push({ kind: "drone", cell: i });
  for (const [dr, dc] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) if (inside(r + dr, c + dc)) hit(s, ctx, idx(r + dr, c + dc), spread);
}

/**
 * Dron hedefi: kalan hedeflere en çok katkı yapan hücre. Öncelik engellerde
 * (kutu, koni, kar, çamur, çim, kupanın altı), sonra hedef renkler, sonra
 * herhangi bir taş. Eşitlikte tohumlu rastgele (belirlenimci).
 */
function droneTarget(s: GameState, ctx: StepCtx): number {
  const need = (t: UcluGoalType) => s.goals.some((g) => g.type === t && g.left > 0);
  const colorNeed = new Set(s.goals.filter((g) => g.type === "color" && g.left > 0).map((g) => g.color));
  const below = new Set<number>();
  if (need("trophy")) {
    s.cells.forEach((c, i) => {
      if (c.tile?.kind === "trophy" && i + W < N) below.add(i + W);
    });
  }
  let best = -1;
  let bestV = 0;
  for (let i = 0; i < N; i++) {
    const c = s.cells[i];
    if (c.hole || ctx.claimed.has(i) || ctx.clear.has(i)) continue;
    let v = 0;
    if (c.crate > 0) v = need("crate") ? 9 + c.crate : 0;
    else if (c.tile?.kind === "cone") v = need("cone") ? 9 + (c.tile.hp ?? 1) : 1;
    else if (c.tile?.kind === "trophy") v = 0;
    else {
      if (c.snow > 0 && need("snow")) v = Math.max(v, 8);
      if (c.net > 0) v = Math.max(v, need("net") ? 8 : 2);
      if (c.mud > 0 && need("mud")) v = Math.max(v, 6 + c.mud);
      if (c.turf === 1 && need("turf")) v = Math.max(v, 6);
      if (below.has(i)) v = Math.max(v, 7);
      const col = matchColor(c);
      if (col >= 0 && colorNeed.has(col)) v = Math.max(v, 4);
      if (c.tile && v === 0) v = 1;
    }
    if (v <= 0) continue;
    v += rand(s) * 0.5;
    if (v > bestV) {
      bestV = v;
      best = i;
    }
  }
  return best;
}

function fireCarry(s: GameState, ctx: StepCtx, to: number, carry: Special, spread: boolean) {
  const [r, c] = rc(to);
  if (carry === "h") blastRow(s, ctx, r, to, spread);
  else if (carry === "v") blastCol(s, ctx, c, to, spread);
  else if (carry === "bomb") blastSquare(s, ctx, to, 1, spread);
  else hit(s, ctx, to, spread);
}

/** Kuyruktaki özel taşları zincirleme patlatır. */
function runQueue(s: GameState, ctx: StepCtx) {
  let guard = 0;
  while (ctx.queue.length && guard++ < 300) {
    const { cell: i, spread } = ctx.queue.shift() as { cell: number; spread: boolean };
    const t = ctx.clearSource.get(i);
    if (!t) continue;
    const [r, c] = rc(i);
    s.score += 120;
    if (t.special === "h") blastRow(s, ctx, r, i, spread);
    else if (t.special === "v") blastCol(s, ctx, c, i, spread);
    else if (t.special === "bomb") blastSquare(s, ctx, i, 1, spread);
    else if (t.special === "drone") {
      droneCross(s, ctx, i, spread);
      ctx.flights.push({ from: i, carry: "none", spread });
    } else if (t.special === "ball") {
      const color = mostCommonColor(s, ctx);
      const targets = cellsOfColor(s, color).filter((j) => !ctx.clear.has(j));
      ctx.blasts.push({ kind: "ball", cell: i, targets });
      for (const j of targets) hit(s, ctx, j, spread);
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
      // Dikey: her boş hücre üstündeki ilk düşebilen taşı çeker (sabit engelde durur).
      for (let k = list.length - 1; k >= 0; k--) {
        const i = idx(list[k], c);
        if (!isEmpty(s.cells[i])) continue;
        for (let j = k - 1; j >= 0; j--) {
          const src = s.cells[idx(list[j], c)];
          if (isEmpty(src)) continue;
          if (canFall(src)) {
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
          if (src.hole || !canFall(src)) continue;
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
    convert: null, flights: [], cleared: [], blasts: [], hits: [], created: [], collects: [],
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
function resolve(s: GameState, first: Pending | null, prefer: number[], swapAxis: "h" | "v" | null, record: boolean): Step[] {
  const steps: Step[] = [];
  let pending = first;
  for (let chain = 1; chain < 80; chain++) {
    const groups = findGroups(s);
    const trophies = trophiesAtBottom(s);
    if (!pending && !groups.length && !trophies.length) break;
    const ctx = new StepCtx();
    const step = makeStep();
    step.chain = chain;
    const creations: { cell: number; special: Special }[] = [];

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
        } else if (c.tile?.kind === "cone") {
          c.tile = { ...c.tile, hp: 1 };
          damageCone(s, ctx, i);
        } else hit(s, ctx, i);
      }
      ctx.blasts.push(...pending.blasts);
      for (const i of pending.hitCells) hit(s, ctx, i, pending.spread);
      // Dron uçuşları: hedef ŞİMDİ (düşmeden sonra) seçilir.
      for (const f of pending.flights) {
        const to = droneTarget(s, ctx);
        if (to < 0) continue;
        ctx.claimed.add(to);
        step.flights.push({ from: f.from, to, carry: f.carry });
        fireCarry(s, ctx, to, f.carry, f.spread);
      }
      if (pending.blasts.length) step.combo = "mega";
    }

    for (const g of groups) {
      const special = groupSpecial(g, chain === 1 ? swapAxis : null);
      if (special !== "none") {
        const at = creationCell(s, g, special, chain === 1 ? prefer : []);
        if (at >= 0) creations.push({ cell: at, special });
      }
      const spread = g.cells.some((i) => s.cells[i].turf === 2);
      for (const i of g.cells) hit(s, ctx, i, spread);
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

    // Temizlik: taşlar kalkar, çamur iner, çim yayılır, hedefler ilerler.
    for (const i of ctx.clear) {
      const c = s.cells[i];
      const t = c.tile;
      if (!t) continue;
      step.cleared.push({ tile: t, cell: i });
      if (t.kind === "gem" && t.color >= 0 && t.special === "none") progress(s, ctx, "color", t.color, i);
      c.tile = null;
      hitMud(s, ctx, i);
    }
    step.cleared.push(...ctx.removed);
    for (const i of ctx.spreadCells) grow(s, ctx, i);
    for (const cr of creations) {
      const c = s.cells[cr.cell];
      if (c.tile || c.crate > 0) continue;
      c.tile = newTile(s, "gem", -1, cr.special);
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
    pending = ctx.flights.length ? { ...emptyPending(), flights: ctx.flights } : null;
  }
  return steps;
}

/* ───────────────────────────── hamleler ───────────────────────────── */

/** Takas uygulanmış: `b` sürüklenen taşın vardığı hücre. */
function specialPending(s: GameState, a: number, b: number): Pending {
  const atB = s.cells[b].tile as Tile;
  const atA = s.cells[a].tile as Tile;
  const [r, c] = rc(b);
  const spread = s.cells[a].turf === 2 || s.cells[b].turf === 2;
  const p: Pending = { ...emptyPending(), spread };
  const both = atA.special !== "none" && atB.special !== "none";
  if (!both) {
    // Tek özel taş: kaydırıldığı yerde patlar. Altın Top kaydırıldığı taşın rengini toplar.
    const si = atB.special !== "none" ? b : a;
    const other = si === b ? atA : atB;
    const sp = (s.cells[si].tile as Tile).special;
    if (sp === "ball" && other.kind === "gem" && other.color >= 0) {
      const oi = si === b ? a : b;
      const targets = cellsOfColor(s, other.color).filter((i) => i !== si);
      p.consumed.push(si);
      p.blasts.push({ kind: "ball", cell: si, targets });
      p.hitCells.push(...targets);
      if (!targets.includes(oi)) p.hitCells.push(oi);
    } else {
      p.hitCells.push(si);
    }
    return p;
  }
  p.consumed.push(a, b);
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
  const cross = () => {
    p.blasts.push({ kind: "drone", cell: b });
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (inside(r + dr, c + dc)) p.hitCells.push(idx(r + dr, c + dc));
  };
  const kinds: Special[] = [atA.special, atB.special];
  const has = (k: Special) => kinds.includes(k);
  const other = (k: Special) => (kinds[0] === k ? kinds[1] : kinds[0]);
  if (has("ball") && other("ball") === "ball") {
    p.blasts.push({ kind: "board", cell: b });
    for (let i = 0; i < N; i++) p.hitCells.push(i);
  } else if (has("ball")) {
    // Altın Top + özel: en kalabalık renk o özele döner ve hepsi patlar.
    const kind = other("ball");
    const color = mostCommonColor(s, null);
    const targets = cellsOfColor(s, color).filter((i) => i !== a && i !== b && !locked(s.cells[i]));
    for (const i of targets) {
      const sp: Special = isRocket(kind) ? (rand(s) < 0.5 ? "h" : "v") : kind;
      s.cells[i].tile = newTile(s, "gem", -1, sp);
    }
    p.convert = true;
    p.blasts.push({ kind: "ball", cell: b, targets });
    p.hitCells.push(...targets);
  } else if (has("drone")) {
    const kind = other("drone");
    cross();
    if (kind === "drone") for (let k = 0; k < 3; k++) p.flights.push({ from: b, carry: "none", spread });
    else p.flights.push({ from: b, carry: kind, spread });
  } else if (isRocket(kinds[0]) && isRocket(kinds[1])) {
    row(r);
    col(c);
  } else if (has("bomb") && (isRocket(kinds[0]) || isRocket(kinds[1]))) {
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
  const axis: "h" | "v" = Math.floor(a / W) === Math.floor(b / W) ? "h" : "v";
  if (isSpecialSwap(s, a, b)) {
    swapTiles(s, a, b);
    s.moves -= 1;
    return { ok: true, steps: resolve(s, specialPending(s, a, b), [b, a], axis, record) };
  }
  swapTiles(s, a, b);
  if (!matchAt(s, a) && !matchAt(s, b)) {
    swapTiles(s, a, b);
    return { ok: false, steps: [] };
  }
  s.moves -= 1;
  return { ok: true, steps: resolve(s, null, [b, a], axis, record) };
}

/** Özel taşa dokunma: yerinde patlar (1 hamle). */
export function activateSpecial(s: GameState, i: number, record = true): SwapResult {
  if (!canActivate(s, i) || s.moves <= 0) return { ok: false, steps: [] };
  s.moves -= 1;
  const p: Pending = { ...emptyPending(), hitCells: [i], spread: s.cells[i].turf === 2 };
  return { ok: true, steps: resolve(s, p, [], null, record) };
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
  return resolve(s, { ...emptyPending(), hammer: i }, [], null, record);
}

/** Kazanınca kalan hamleler: rastgele taş Füze olur. Hücreyi döndürür. */
export function bonusConvert(s: GameState): number {
  const pool: number[] = [];
  s.cells.forEach((c, i) => {
    if (c.tile && c.tile.kind === "gem" && c.tile.special === "none" && !locked(c) && !c.hole) pool.push(i);
  });
  if (!pool.length) return -1;
  const i = pool[randInt(s, pool.length)];
  s.cells[i].tile = newTile(s, "gem", -1, rand(s) < 0.5 ? "h" : "v");
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
  return resolve(s, { ...emptyPending(), hitCells: cells }, [], null, record);
}

export function hasSpecials(s: GameState): boolean {
  return s.cells.some((c, i) => !!c.tile && c.tile.special !== "none" && canSwapCell(s, i));
}

/** Oynanacak bir şey var mı (takas ya da dokunulacak özel taş)? */
export function hasPlay(s: GameState): boolean {
  return !!findMove(s) || hasSpecials(s);
}

/**
 * Karıştır: kilitsiz düz taşların yerini değiştirir (aynı id'ler — taşlar
 * yeni yerlerine kayar). Hazır eşleşme olmayan ve hamlesi olan dizilim arar.
 */
export function shuffleBoard(s: GameState): boolean {
  const slots: number[] = [];
  s.cells.forEach((c, i) => {
    if (c.tile && c.tile.kind === "gem" && c.tile.special === "none" && canSwapCell(s, i)) slots.push(i);
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
    slots.forEach((i, k) => {
      s.cells[i].tile = { id: original[k].id, kind: "gem", color: freshColor(s, s.cells, i), special: "none" };
    });
    if (!findGroups(s).length && findMove(s)) return true;
  }
  return false;
}

export function goalsDone(s: GameState): boolean {
  return s.goals.every((g) => g.left <= 0);
}

/** Reklamla devam: +N hamle (kaybedilmek üzereyken). */
export function addMoves(s: GameState, n: number): void {
  s.moves += n;
}

/** Yıldız: kalan hamle oranına göre. */
export function starsFor(movesLeft: number, movesTotal: number): 1 | 2 | 3 {
  const ratio = movesTotal > 0 ? movesLeft / movesTotal : 0;
  if (ratio >= 0.25) return 3;
  if (ratio >= 0.1) return 2;
  return 1;
}

export const cellRow = (i: number) => Math.floor(i / W);
export const cellCol = (i: number) => i % W;
