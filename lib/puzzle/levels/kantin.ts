/**
 * STADYUM KANTİNİ — kurallar motoru + belirlenimci seviye üretici.
 *
 * Bu dosya BAĞIMSIZDIR (hiçbir içe aktarım yok): denetim betiği
 * (scripts/check-puzzle-kantin.mjs) onu node ile doğrudan yükler; node ESM
 * uzantı ister, tsc uzantılı içe aktarıma izin vermez. seededRandom bu yüzden
 * kopyalandı (lib/puzzle/types.ts ile birebir aynı).
 *
 * KURALLAR
 *   · Yığınlar: her yığının YALNIZ üstteki ürünü alınabilir (`stack[0]`).
 *   · Alınan ürün, ona ihtiyacı olan ilk tabağa gider (VIP tabağı önce);
 *     uyan tabak yoksa bekleme tezgâhına. Tezgâh DOLARSA (cap) kaybedilir.
 *   · Tabak tamamlanınca servis edilir; yuvaya sıradaki sipariş gelir ve
 *     tezgâhta ona uyan ürünler kendiliğinden tabağa kayar (zincirlenebilir).
 *   · Kilitli kutu: `lock` kadar sipariş servis edilince açılır.
 *   · İki katlı yığın: alt kattaki (`crate`) ürünler üst kat boşalana dek
 *     kapalı kolidir (yalnız görsel; kurala etkisi yok).
 *
 * ÇÖZÜLEBİLİRLİK KANITI: üretici önce bir "tanık" seçim sırası kurar
 * (siparişlerin ürünleri + kontrollü öne kaydırma), ürünleri bu sırayı
 * bozmadan yığınlara dağıtır ve sırayı motorun kendisiyle benzetir. Tanığın
 * tezgâh tepe doluluğu hedef aralığında değilse tohum değiştirilip yeniden
 * üretilir. Kilitler tanığın o andaki servis sayısını aşmayacak şekilde
 * konur. Denetim betiği ayrıca bağımsız bir çözücüyle her seviyeyi çözer.
 */

/* ───────────────────────────── rastgele ───────────────────────────── */

/** Tohumlu rastgele (mulberry32) — lib/puzzle/types.ts ile aynı. */
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

const rint = (r: () => number, a: number, b: number) => a + Math.floor(r() * (b - a + 1));

function shuffle<T>(r: () => number, arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(r() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/* ───────────────────────────── veri ───────────────────────────── */

/** Ürün kataloğu — `unlock`: ilk göründüğü seviye. Sıra = ürün indeksi. */
export const KANTIN_PRODUCTS = [
  { id: "simit", name: "Simit", unlock: 1 },
  { id: "ayran", name: "Ayran", unlock: 1 },
  { id: "tost", name: "Tost", unlock: 1 },
  { id: "cay", name: "Çay", unlock: 1 },
  { id: "misir", name: "Mısır", unlock: 4 },
  { id: "su", name: "Su", unlock: 4 },
  { id: "doner", name: "Döner", unlock: 7 },
  { id: "kola", name: "Kola", unlock: 7 },
  { id: "gazoz", name: "Gazoz", unlock: 11 },
  { id: "kumpir", name: "Kumpir", unlock: 15 },
  { id: "kofte", name: "Köfte ekmek", unlock: 20 },
  { id: "sucuklu", name: "Sucuklu tost", unlock: 30 },
] as const;

export type KantinProductId = (typeof KANTIN_PRODUCTS)[number]["id"];

/** Taraftar forma / yüz çeşitleri (palet lib/puzzle/kantinPalette.ts'de). */
export const KANTIN_JERSEY_COUNT = 8;
export const KANTIN_FACE_COUNT = 6;

/** Bekleme tezgâhının yuva sayısı (Ek Tezgâh güçlendiricisi +2). */
export const KANTIN_HOLD_CAP = 5;
/** Ek Süre güçlendiricisi (saniye). */
export const KANTIN_EXTRA_TIME = 30;
/** VIP kaçarsa süre cezası (saniye). */
export const KANTIN_VIP_PENALTY = 10;

export interface KantinItem {
  /** Seviye içinde benzersiz kimlik (= tanık sırasındaki konumu). */
  uid: number;
  /** Ürün indeksi (KANTIN_PRODUCTS). */
  p: number;
  /** 0: kilitsiz; n: n sipariş servis edilince açılır. */
  lock: number;
  /** İki katlı yığının alt katında mı (üst kat boşalana dek kapalı). */
  crate: boolean;
}

export interface KantinOrder {
  id: number;
  /** Ürün indeksleri (birbirinden farklı). */
  items: number[];
  vip: boolean;
  /** VIP sabrı (saniye); VIP değilse 0. */
  patience: number;
  jersey: number;
  face: number;
}

export interface KantinLevel {
  level: number;
  seed: number;
  orders: KantinOrder[];
  /** Her yığın üstten alta: [0] alınabilir olandır. */
  stacks: KantinItem[][];
  /** Aynı anda açık tabak (sipariş balonu) sayısı. */
  plates: number;
  holdCap: number;
  /** Saniye; 0 = süresiz. */
  timeLimit: number;
  /** 3 yıldız için tezgâh tepe doluluğu sınırı. */
  starPeak: number;
  /** Tanık çözümün yığın sırası (denetim için). */
  witness: number[];
  witnessPeak: number;
  cup: boolean;
  breather: boolean;
  /** Bu seviyede tanıtılan mekanik. */
  tip: string | null;
  /** Hedef aralığı tutturulamayıp güvenli kuruluma düşüldü mü. */
  fallback: boolean;
  products: number[];
  /** Aceleci oyuncu benzetiminin kaybetme oranı (0–1). */
  difficulty: number;
}

/* ───────────────────────────── motor ───────────────────────────── */

export interface KantinPlate {
  order: number;
  filled: KantinItem[];
}

export interface KantinState {
  stacks: KantinItem[][];
  hold: KantinItem[];
  plates: (KantinPlate | null)[];
  /** Kuyruktan sıradaki siparişin indeksi. */
  next: number;
  served: number;
  peak: number;
  lost: boolean;
  won: boolean;
}

export type KantinFrom = { kind: "stack"; stack: number; depth: number } | { kind: "hold"; index: number };
export type KantinTo = { kind: "plate"; slot: number } | { kind: "hold"; index: number };

export interface KantinMove {
  item: KantinItem;
  from: KantinFrom;
  to: KantinTo;
}

export interface KantinStep {
  moves: KantinMove[];
  served: { slot: number; order: number; items: KantinItem[] }[];
  arrivals: { slot: number; order: number }[];
}

export function initialState(level: KantinLevel): KantinState {
  const plates: (KantinPlate | null)[] = [];
  for (let i = 0; i < level.plates; i += 1) {
    plates.push(i < level.orders.length ? { order: i, filled: [] } : null);
  }
  return {
    stacks: level.stacks.map((s) => s.slice()),
    hold: [],
    plates,
    next: Math.min(level.plates, level.orders.length),
    served: 0,
    peak: 0,
    lost: false,
    won: false,
  };
}

/** Tabağın `p` ürününe hâlâ ihtiyacı var mı. */
export function plateNeeds(level: KantinLevel, plate: KantinPlate | null, p: number): boolean {
  if (!plate) return false;
  const order = level.orders[plate.order];
  if (!order.items.includes(p)) return false;
  return !plate.filled.some((it) => it.p === p);
}

export function plateMissing(level: KantinLevel, plate: KantinPlate): number[] {
  return level.orders[plate.order].items.filter((p) => !plate.filled.some((it) => it.p === p));
}

/** Ürünün gideceği tabak: önce VIP, sonra soldan ilk uyan; yoksa -1. */
export function targetSlot(level: KantinLevel, plates: (KantinPlate | null)[], p: number): number {
  let first = -1;
  for (let i = 0; i < plates.length; i += 1) {
    const pl = plates[i];
    if (!plateNeeds(level, pl, p)) continue;
    if (level.orders[pl!.order].vip) return i;
    if (first < 0) first = i;
  }
  return first;
}

export function canTake(st: KantinState, s: number): boolean {
  const top = st.stacks[s]?.[0];
  return Boolean(top) && top.lock <= st.served && !st.lost && !st.won;
}

function cloneState(st: KantinState): KantinState {
  return {
    ...st,
    stacks: st.stacks.slice(),
    hold: st.hold.slice(),
    plates: st.plates.map((pl) => (pl ? { order: pl.order, filled: pl.filled.slice() } : null)),
  };
}

/** Tamamlanan tabağı servis eder, sıradakini getirir, tezgâhtan çeker (zincir). */
function resolveSlot(level: KantinLevel, st: KantinState, slot: number, step: KantinStep) {
  for (;;) {
    const pl = st.plates[slot];
    if (!pl) return;
    if (pl.filled.length < level.orders[pl.order].items.length) return;
    step.served.push({ slot, order: pl.order, items: pl.filled });
    st.served += 1;
    if (st.next < level.orders.length) {
      const fresh: KantinPlate = { order: st.next, filled: [] };
      st.next += 1;
      st.plates[slot] = fresh;
      step.arrivals.push({ slot, order: fresh.order });
      // Tezgâhta bekleyen uygun ürünler yeni tabağa kayar.
      for (let i = 0; i < st.hold.length; ) {
        const it = st.hold[i];
        if (plateNeeds(level, fresh, it.p)) {
          step.moves.push({ item: it, from: { kind: "hold", index: i }, to: { kind: "plate", slot } });
          fresh.filled.push(it);
          st.hold.splice(i, 1);
        } else i += 1;
      }
    } else {
      st.plates[slot] = null;
    }
  }
}

function finish(level: KantinLevel, st: KantinState, cap: number) {
  if (st.served >= level.orders.length) st.won = true;
  else if (st.hold.length >= cap) st.lost = true;
  // Bütün yığınlar boş ya da kilitliyse oyun tıkanmıştır.
  else if (!st.stacks.some((s) => s.length > 0 && s[0].lock <= st.served)) st.lost = true;
}

/** Kaybın nedeni (arayüz metni için). */
export function lossReason(st: KantinState, cap: number): "hold" | "stuck" {
  return st.hold.length >= cap ? "hold" : "stuck";
}

/** Yığının üstündeki ürünü alır. Alınamıyorsa null. */
export function takeItem(
  level: KantinLevel,
  st0: KantinState,
  s: number,
  cap: number,
): { state: KantinState; step: KantinStep } | null {
  if (!canTake(st0, s)) return null;
  const st = cloneState(st0);
  const stack = st.stacks[s].slice();
  const item = stack.shift()!;
  st.stacks[s] = stack;
  const step: KantinStep = { moves: [], served: [], arrivals: [] };
  const slot = targetSlot(level, st.plates, item.p);
  if (slot >= 0) {
    st.plates[slot]!.filled.push(item);
    step.moves.push({ item, from: { kind: "stack", stack: s, depth: 0 }, to: { kind: "plate", slot } });
    resolveSlot(level, st, slot, step);
  } else {
    step.moves.push({ item, from: { kind: "stack", stack: s, depth: 0 }, to: { kind: "hold", index: st.hold.length } });
    st.hold.push(item);
    st.peak = Math.max(st.peak, st.hold.length);
  }
  finish(level, st, cap);
  return { state: st, step };
}

/**
 * HIZLI SERVİS — eksiği en az olan tabağı (VIP önce) anında tamamlar: eksik
 * ürünler önce bekleme tezgâhından, sonra yığınlarda en üste yakın kilitsiz
 * konumdan çekilir. Hiçbir tabak tümüyle tamamlanamıyorsa en çok ilerleyeni
 * doldurur. Değişiklik olmazsa null (güçlendirici harcanmaz).
 */
export function rushServe(
  level: KantinLevel,
  st0: KantinState,
  cap: number,
): { state: KantinState; step: KantinStep } | null {
  if (st0.lost || st0.won) return null;
  type Pick = { from: KantinFrom; item: KantinItem };
  let best: { slot: number; picks: Pick[]; complete: boolean; score: number } | null = null;
  st0.plates.forEach((pl, slot) => {
    if (!pl) return;
    const usedHold = new Set<number>();
    const usedStack = new Set<number>();
    const picks: Pick[] = [];
    const missing = plateMissing(level, pl);
    for (const p of missing) {
      const hi = st0.hold.findIndex((it, i) => it.p === p && !usedHold.has(i));
      if (hi >= 0) {
        usedHold.add(hi);
        picks.push({ from: { kind: "hold", index: hi }, item: st0.hold[hi] });
        continue;
      }
      let found: Pick | null = null;
      let bestDepth = Infinity;
      st0.stacks.forEach((stack, si) => {
        // Kilitli kutu ve altı erişilemez sayılır.
        for (let d = 0; d < stack.length && d < bestDepth; d += 1) {
          const it = stack[d];
          if (it.lock > st0.served) break;
          if (it.p === p && !usedStack.has(it.uid)) {
            bestDepth = d;
            found = { from: { kind: "stack", stack: si, depth: d }, item: it };
            break;
          }
        }
      });
      if (found) {
        usedStack.add((found as Pick).item.uid);
        picks.push(found);
      }
    }
    if (!picks.length) return;
    const complete = picks.length === missing.length;
    const vip = level.orders[pl.order].vip;
    const score = (complete ? 1000 : 0) + (vip ? 100 : 0) - missing.length * 10 + picks.length;
    if (!best || score > best.score) best = { slot, picks, complete, score };
  });
  if (!best) return null;
  const chosen = best as { slot: number; picks: Pick[] };
  const st = cloneState(st0);
  const step: KantinStep = { moves: [], served: [], arrivals: [] };
  const plate = st.plates[chosen.slot]!;
  const holdUids = new Set(chosen.picks.filter((pk) => pk.from.kind === "hold").map((pk) => pk.item.uid));
  for (const pk of chosen.picks) {
    step.moves.push({ item: pk.item, from: pk.from, to: { kind: "plate", slot: chosen.slot } });
    plate.filled.push(pk.item);
  }
  st.hold = st.hold.filter((it) => !holdUids.has(it.uid));
  const stackUids = new Set(chosen.picks.filter((pk) => pk.from.kind === "stack").map((pk) => pk.item.uid));
  st.stacks = st.stacks.map((s) => (s.some((it) => stackUids.has(it.uid)) ? s.filter((it) => !stackUids.has(it.uid)) : s));
  resolveSlot(level, st, chosen.slot, step);
  finish(level, st, cap);
  return { state: st, step };
}

/* ───────────────────────────── seviye planı ───────────────────────────── */

interface Params {
  orders: number;
  plates: number;
  maxSize: number;
  /** 3. ve 4. ürün olasılıkları. */
  p3: number;
  p4: number;
  stacks: number;
  /** Seviyede kullanılan ürün çeşidi. */
  pool: number;
  /** Öne kaydırılan ürün oranı ve en uzak kaydırma. */
  perturb: number;
  dist: number;
  /** Tanık çözümün izin verilen en yüksek tezgâh doluluğu. */
  peakMax: number;
  /** Zorluk bandı: aceleci oyuncu benzetiminin kaybetme oranı (0–1). */
  failLo: number;
  failHi: number;
  timed: boolean;
  /** Ürün başına saniye (süre hesabı). */
  spp: number;
  vip: number;
  locks: number;
  crates: number;
}

const T = (o: Partial<Params>): Params => ({
  orders: 3, plates: 1, maxSize: 2, p3: 0, p4: 0, stacks: 3, pool: 4, perturb: 0, dist: 0,
  peakMax: 0, failLo: 0, failHi: 0.05, timed: false, spp: 0, vip: 0, locks: 0, crates: 0, ...o,
});

/** İlk 10 seviye elle ayarlanmış öğretici eğri. */
const TUTORIAL: Params[] = [
  T({ orders: 3 }),
  T({ orders: 4, perturb: 0.25, dist: 2, peakMax: 1 }),
  T({ orders: 5, maxSize: 3, p3: 0.4, stacks: 4, perturb: 0.3, dist: 3, peakMax: 2, failHi: 0.1 }),
  T({ orders: 6, plates: 2, maxSize: 3, p3: 0.4, stacks: 4, pool: 6, perturb: 0.4, dist: 3, peakMax: 2, failHi: 0.12 }),
  T({ orders: 5, plates: 2, maxSize: 3, p3: 0.3, stacks: 4, pool: 6, perturb: 0.3, dist: 3, peakMax: 1, failHi: 0.08 }),
  T({ orders: 7, plates: 2, maxSize: 3, p3: 0.5, stacks: 4, pool: 6, perturb: 0.5, dist: 4, peakMax: 2, failLo: 0.03, failHi: 0.2 }),
  T({ orders: 8, plates: 2, maxSize: 3, p3: 0.5, stacks: 5, pool: 7, perturb: 0.55, dist: 4, peakMax: 2, failLo: 0.05, failHi: 0.25 }),
  T({ orders: 9, plates: 2, maxSize: 3, p3: 0.55, stacks: 5, pool: 7, perturb: 0.7, dist: 5, peakMax: 3, failLo: 0.2, failHi: 0.45 }),
  T({ orders: 10, plates: 2, maxSize: 3, p3: 0.55, stacks: 5, pool: 8, perturb: 0.7, dist: 5, peakMax: 3, failLo: 0.15, failHi: 0.45 }),
  T({ orders: 12, plates: 2, maxSize: 3, p3: 0.6, stacks: 5, pool: 8, perturb: 0.8, dist: 6, peakMax: 3, failLo: 0.3, failHi: 0.6 }),
];

/** Mekanik takvimi — ilk görüldüğü seviyede ipucu balonu. */
const TIPS: Record<number, string> = {
  1: "Ürüne dokun: siparişi bekleyen tabağa kayar. Yalnız yığınların en üstündeki ürün alınır.",
  2: "Uymayan ürün bekleme tezgâhına gider; ona ihtiyacı olan taraftar gelince kendiliğinden tabağa geçer.",
  4: "Artık iki taraftar aynı anda sipariş veriyor. Ürün ona ihtiyacı olan ilk tabağa gider.",
  8: "Tezgâh baskısı: bekleme tezgâhının 5 yuvası dolarsa kaybedersin. Hangi yığını açacağını önceden düşün.",
  10: "Kupa maçı! Derbi günü kalabalığı: daha çok sipariş, daha az hata payı.",
  12: "Devre arası yoğunluğu: süre işliyor ve üç taraftar birden sırada. Süre bitmeden yetiştir.",
  18: "VIP taraftar! Kendi sabır çubuğu var; bekletirsen kaçar ve süre cezası yersin.",
  25: "Kilitli kutu: üzerindeki sayı kadar sipariş servis edilince açılır.",
  35: "İki katlı yığın: alt kattaki koliler, üst kat boşalınca açılır.",
};

function paramsFor(L: number): Params {
  const cup = L % 10 === 0;
  const breather = !cup && L % 5 === 0;
  if (L <= 10) return TUTORIAL[L - 1];
  // Dalgalı artış: 9'luk dalga + yavaş taban yükselişi.
  const wave = [0, 1, 2, 1, 0, 2, 1, 3, 2][L % 9];
  let orders = Math.min(20, 9 + Math.floor((L - 10) / 9) + wave);
  if (breather) orders = Math.max(6, orders - 3);
  if (cup) orders = Math.min(20, orders + 3);
  let plates = L < 12 ? 2 : 3;
  if (L >= 60 && L % 4 === 2) plates = 4;
  const maxSize = L < 20 ? 3 : 4;
  const p3 = Math.min(0.75, 0.55 + L * 0.002);
  const p4 = maxSize === 4 ? Math.min(0.4, 0.12 + (L - 20) * 0.002) : 0;
  const stacks = Math.min(7, 5 + Math.floor(L / 60) + (cup ? 1 : 0));
  const pool = Math.min(12, 7 + Math.floor(L / 15));
  const perturb = Math.min(0.95, 0.7 + L * 0.002 + (cup ? 0.1 : 0)) * (breather ? 0.6 : 1);
  const dist = Math.min(10, 5 + Math.floor(L / 25));
  // Zorluk bandı: dalgalı taban, kupada belirgin zor, nefeste kolay.
  const base = Math.min(0.45, 0.2 + L * 0.0015);
  let [failLo, failHi] = [base, base + 0.3];
  if (breather) [failLo, failHi] = [0, 0.2];
  if (cup) [failLo, failHi] = [Math.min(0.6, base + 0.2), Math.min(0.9, base + 0.5)];
  const peakMax = cup && L >= 60 ? 4 : 3;
  const timed = L >= 12 && !breather;
  const spp = Math.max(2.1, 3.4 - (L - 12) * 0.008) * (cup ? 0.92 : 1);
  let vip = 0;
  if (timed && L >= 18) vip = (L < 40 ? 1 : L < 100 ? 1 + (L % 2) : 2) + (cup ? 1 : 0);
  const locks = L >= 25 ? Math.min(4, 1 + Math.floor((L - 25) / 30)) : 0;
  const crates = L >= 35 ? Math.min(3, 1 + Math.floor((L - 35) / 40)) : 0;
  return { orders, plates, maxSize, p3, p4, stacks, pool, perturb, dist, peakMax, failLo, failHi, timed, spp, vip, locks, crates };
}

function unlockedProducts(L: number): number[] {
  return KANTIN_PRODUCTS.map((p, i) => (p.unlock <= L ? i : -1)).filter((i) => i >= 0);
}

/**
 * ACELECİ OYUNCU — uyan ürün varsa rastgele birini, yoksa rastgele bir
 * yığını açar. Kaybetme oranı seviyenin "düşünmeden geçilmez"liğini ölçer;
 * çözülebilirliğin kanıtı değil (o tanık + çözücüdür).
 */
export function hastyRun(level: KantinLevel, r: () => number, cap = level.holdCap): { won: boolean; peak: number } {
  let st = initialState(level);
  const opts: number[] = [];
  const fit: number[] = [];
  while (!st.won && !st.lost) {
    opts.length = 0;
    fit.length = 0;
    for (let i = 0; i < st.stacks.length; i += 1) {
      if (!canTake(st, i)) continue;
      opts.push(i);
      if (targetSlot(level, st.plates, st.stacks[i][0].p) >= 0) fit.push(i);
    }
    const pool = fit.length ? fit : opts;
    st = takeItem(level, st, pool[Math.floor(r() * pool.length)], cap)!.state;
  }
  return { won: st.won, peak: st.peak };
}

const HASTY_RUNS = 32;

const SALT = 4421;
const MAX_ATTEMPTS = 80;

function seedFor(L: number, attempt: number): number {
  return (L * 7919 + SALT + attempt * 104729) >>> 0;
}

/** Tek bir deneme: tanık sırasını kurar, dağıtır, benzetir, zorluğu ölçer. */
function attemptBuild(L: number, P: Params, attempt: number, safe: boolean): KantinLevel | null {
  const seed = seedFor(L, attempt);
  const r = seededRandom(seed);
  const cup = L % 10 === 0;
  const breather = !cup && L % 5 === 0;

  // Ürün havuzu: yeni açılan ürün (son 3 seviyede açıldıysa) mutlaka girer.
  const unlocked = unlockedProducts(L);
  const fresh = unlocked.filter((i) => L - KANTIN_PRODUCTS[i].unlock < 3 && KANTIN_PRODUCTS[i].unlock > 1);
  const rest = shuffle(r, unlocked.filter((i) => !fresh.includes(i)));
  const products = [...fresh, ...rest].slice(0, Math.min(unlocked.length, Math.max(P.pool, fresh.length)));

  // Siparişler.
  const orders: KantinOrder[] = [];
  for (let i = 0; i < P.orders; i += 1) {
    let size = 2;
    if (size < P.maxSize && r() < P.p3) size += 1;
    if (size < P.maxSize && size === 3 && r() < P.p4) size += 1;
    size = Math.min(size, products.length);
    let items: number[] = [];
    for (let guard = 0; guard < 8; guard += 1) {
      items = shuffle(r, products.slice()).slice(0, size);
      const prev = orders[i - 1];
      if (!prev || prev.items.slice().sort().join() !== items.slice().sort().join()) break;
    }
    orders.push({ id: i, items, vip: false, patience: 0, jersey: rint(r, 0, KANTIN_JERSEY_COUNT - 1), face: rint(r, 0, KANTIN_FACE_COUNT - 1) });
  }

  // Tanık sırası: siparişlerin ürünleri, sonra kontrollü öne kaydırma.
  const seq: number[] = [];
  for (const o of orders) seq.push(...shuffle(r, o.items.slice()));
  if (!safe) {
    const moves = Math.round(seq.length * P.perturb);
    for (let k = 0; k < moves; k += 1) {
      const i = rint(r, 1, seq.length - 1);
      const j = Math.max(0, i - rint(r, 1, Math.max(1, P.dist)));
      const [x] = seq.splice(i, 1);
      seq.splice(j, 0, x);
    }
  }

  // Yığınlara dağıt: tanık sırası her yığında üstten alta korunur.
  const n = seq.length;
  const stackCount = Math.max(2, Math.min(P.stacks, Math.ceil(n / 2)));
  const maxDepth = Math.ceil(n / stackCount) + 1;
  const stacks: KantinItem[][] = Array.from({ length: stackCount }, () => []);
  const witness: number[] = [];
  seq.forEach((p, uid) => {
    const open = stacks.map((s, i) => (s.length < maxDepth ? i : -1)).filter((i) => i >= 0);
    const s = open[Math.floor(r() * open.length)];
    stacks[s].push({ uid, p, lock: 0, crate: false });
    witness.push(s);
  });

  const level: KantinLevel = {
    level: L,
    seed,
    orders,
    stacks,
    plates: Math.min(P.plates, orders.length),
    holdCap: KANTIN_HOLD_CAP,
    timeLimit: 0,
    starPeak: 0,
    witness,
    witnessPeak: 0,
    cup,
    breather,
    tip: TIPS[L] ?? null,
    fallback: safe,
    products,
    difficulty: 0,
  };

  // Tanığı motorla benzet: her seçimden önceki servis sayısı, siparişlerin
  // açılış / servis anları (VIP sabrı için).
  let st = initialState(level);
  const servedBefore: number[] = [];
  const openedAt = new Map<number, number>();
  const servedAt = new Map<number, number>();
  for (let i = 0; i < level.plates; i += 1) openedAt.set(i, 0);
  for (let i = 0; i < witness.length; i += 1) {
    servedBefore.push(st.served);
    const res = takeItem(level, st, witness[i], 99);
    if (!res) return null;
    for (const a of res.step.arrivals) openedAt.set(a.order, i + 1);
    for (const sv of res.step.served) servedAt.set(sv.order, i + 1);
    st = res.state;
  }
  if (!st.won) return null;
  if (!safe && st.peak > P.peakMax) return null;

  // Kilitler: tanık o ürünü aldığında servis sayısı en az kilit kadar.
  if (P.locks > 0) {
    const cands = shuffle(r, seq.map((_, uid) => uid).filter((uid) => servedBefore[uid] >= 1));
    const chosen = new Set(cands.slice(0, P.locks));
    for (const s of stacks) {
      for (const it of s) {
        if (chosen.has(it.uid)) it.lock = Math.max(1, Math.min(servedBefore[it.uid], 1 + rint(r, 0, 3)));
      }
    }
  }

  // İki katlı yığınlar: alt yarı koliye girer.
  if (P.crates > 0) {
    const tall = shuffle(r, stacks.map((s, i) => (s.length >= 4 ? i : -1)).filter((i) => i >= 0)).slice(0, P.crates);
    for (const si of tall) {
      const s = stacks[si];
      const upper = Math.ceil(s.length / 2);
      s.forEach((it, d) => {
        it.crate = d >= upper;
      });
    }
  }

  // VIP: başlangıçta görünmeyen siparişlerden; sabır tanığın bekleyişinden cömert.
  if (P.vip > 0 && P.timed) {
    const pool = shuffle(r, orders.map((o) => o.id).filter((id) => id >= level.plates));
    for (const id of pool.slice(0, P.vip)) {
      const o = orders[id];
      const wait = (servedAt.get(id) ?? n) - (openedAt.get(id) ?? 0);
      o.vip = true;
      o.patience = Math.max(25, Math.min(90, Math.round(wait * P.spp * 1.8 + 12 + o.items.length * 3)));
    }
  }

  if (P.timed) level.timeLimit = Math.ceil((n * P.spp + 15) / 5) * 5;

  // Kilit ve VIP öncelikleriyle tanığı gerçek kapasiteyle yeniden doğrula.
  let check = initialState(level);
  for (const s of witness) {
    const res = takeItem(level, check, s, level.holdCap);
    if (!res) return null;
    check = res.state;
    if (check.lost) return null;
  }
  if (!check.won) return null;

  // Zorluk: aceleci oyuncu benzetimi (tohumlu, belirlenimci).
  const hr = seededRandom(seed ^ 0x5bd1e995);
  let fails = 0;
  let bestPeak = check.peak;
  for (let i = 0; i < HASTY_RUNS; i += 1) {
    const run = hastyRun(level, hr);
    if (!run.won) fails += 1;
    else bestPeak = Math.min(bestPeak, run.peak);
  }
  level.difficulty = fails / HASTY_RUNS;
  level.witnessPeak = check.peak;
  // 3 yıldız sınırı: bilinen en iyi oyunun tepe doluluğu + 1 yuva pay
  // (öğreticide pay yok); son iki yuva hiçbir zaman 3 yıldız değildir.
  level.starPeak = Math.min(KANTIN_HOLD_CAP - 2, Math.max(L <= 7 ? 1 : 2, bestPeak + 1));
  return level;
}

const CACHE = new Map<number, KantinLevel>();

/** Seviyeyi üretir (belirlenimci, önbellekli). */
export function kantinLevel(level: number): KantinLevel {
  const L = Math.max(1, Math.floor(level));
  const hit = CACHE.get(L);
  if (hit) return hit;
  const P = paramsFor(L);
  let built: KantinLevel | null = null;
  // Zorluk bandı tutmazsa banda EN YAKIN deneme seçilir (fallback işaretli).
  let nearest: KantinLevel | null = null;
  let nearestGap = Infinity;
  for (let a = 0; a < MAX_ATTEMPTS && !built; a += 1) {
    const lv = attemptBuild(L, P, a, false);
    if (!lv) continue;
    const gap = lv.difficulty < P.failLo ? P.failLo - lv.difficulty : lv.difficulty > P.failHi ? lv.difficulty - P.failHi : 0;
    if (gap === 0) built = lv;
    else if (gap < nearestGap) [nearest, nearestGap] = [lv, gap];
  }
  if (!built && nearest) built = { ...nearest, fallback: true };
  // Güvenli kurulum: kaydırmasız tanık (tezgâh hiç gerekmez) — her zaman çözülür.
  for (let a = 0; a < MAX_ATTEMPTS && !built; a += 1) built = attemptBuild(L, P, a, true);
  if (!built) throw new Error(`kantin: seviye ${L} üretilemedi`);
  CACHE.set(L, built);
  return built;
}

export function kantinItemCount(level: KantinLevel): number {
  return level.stacks.reduce((sum, s) => sum + s.length, 0);
}

/**
 * Yıldız: 3'ten başlar; tezgâh tepe doluluğu sınırı aştıysa −1; süreliyse
 * sürenin %25'inden azı kaldıysa, süresizse sabırla servis oranı %80'in
 * altındaysa −1; VIP kaçtıysa en çok 2.
 */
export function kantinStars(
  level: KantinLevel,
  r: { peak: number; timeLeft: number; patientRatio: number; vipMissed: number },
): 1 | 2 | 3 {
  let stars = 3;
  if (r.peak > level.starPeak) stars -= 1;
  if (level.timeLimit > 0) {
    if (r.timeLeft < level.timeLimit * 0.25) stars -= 1;
  } else if (r.patientRatio < 0.8) stars -= 1;
  if (r.vipMissed > 0) stars = Math.min(stars, 2);
  return Math.max(1, stars) as 1 | 2 | 3;
}

/** Normal taraftarın sabrı (saniye) — yüz ifadesi ve yıldız için. */
export function kantinFanPatience(order: KantinOrder): number {
  return 35 + order.items.length * 9;
}
