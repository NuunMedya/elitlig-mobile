/**
 * PENALTI — Lig Yolu bölüm tablosu (TS aynası).
 *
 * Oyunun kendisi games/penalti.js'tedir (WebView, bölüm modu: docs/oyun-
 * yenileme-2026-11.md §2). Bölüm tanımı orada `levelSpec(N)` ile üretilir;
 * bu dosya AYNI üreteci, AYNI `UNLOCKS` tablosunu ve AYNI hedef metnini
 * taşır. İkisi birebir aynı olmalıdır: scripts/check-games.mjs bütün
 * bölümleri (1..LEVEL_COUNT + 50 fazlası) ikisinde de üretip JSON olarak
 * karşılaştırır; bir tarafı değiştiren öbürünü de değiştirmelidir.
 *
 * Bu dosya BAĞIMSIZDIR (yalnız tür içe aktarımı): denetim betiği onu node
 * ile doğrudan yükler. seededRandom bu yüzden kopyalandı (games/core.js
 * `A.seeded` ve lib/puzzle/types.ts ile birebir aynı mulberry32).
 *
 * ZORLUK EĞRİSİ: d = 1 − e^(−(N−1)/70) (+0,08 boss, −0,14 nefes, küçük
 * dalga), 0..0,97. Kaleci refleksi 58 + 36·d (boss +5), rakip atıcı isabeti
 * 0,58 + 0,27·d, yeşil bölge (1 − 0,38·d), güç çubuğu periyodu 1,32 − 0,42·d,
 * nişan titremesi 0,03 + 0,2·d; engellerin çıkma olasılığı ve hızı d ile artar.
 * Her 10. bölüm boss kaleci (kupa maçı), her 5. bölüm nefes. Genişletmek:
 * LEVEL_COUNT'u büyütmek yeter (üreteç N'den bağımsız; mevcut bölümler
 * değişmez).
 */

import type { PuzzleGoalSummary } from "@/lib/puzzle/types";

export const LEVEL_COUNT = 150;

export interface PenaltiUnlock {
  level: number;
  key: string;
  title: string;
  text: string;
}

/** Hangi bölümde hangi yeni özellik / engel / boss kaleci gelir (games/penalti.js UNLOCKS). */
export const UNLOCKS: PenaltiUnlock[] = [
  { level: 1, key: "temel", title: "Penaltı atışı", text: "Sürükle, nişan al; bırak ve güç çubuğu yeşildeyken dokun. Verilen şutta yeterli golü at." },
  { level: 2, key: "seri", title: "Seri penaltı", text: "Rakip de atar: beşer atış, eşitlikte ani ölüm. Rakipten çok gol at." },
  { level: 4, key: "ruzgar", title: "Rüzgâr", text: "Rüzgâr topu sürükler: nişanın altındaki oku izle, nişanını rüzgârın tersine kaydır." },
  { level: 6, key: "halka", title: "Hedef halkaları", text: "Gol yetmez: top kaledeki halkalardan birinin içinden geçmeli." },
  { level: 8, key: "sure", title: "Atış saati", text: "Nişan için süren sınırlı. Süre biterse o anki nişanla güç evresine geçersin." },
  { level: 10, key: "kahin", title: "Boss kaleci: Kâhin", text: "Atışlarını ezberler ve oraya yatar. Aynı köşeye üst üste vurma." },
  { level: 12, key: "savunmaci", title: "Çizgide savunmacı", text: "Kale çizgisinde bir savunmacı sağa sola koşar. Onun olmadığı köşeye vur." },
  { level: 16, key: "ani", title: "Ani ölüm", text: "Doğrudan ani ölüm: her turda ikiniz de atarsınız, ilk kaçıran kaybeder." },
  { level: 18, key: "yagmur", title: "Yağmur ve kaygan top", text: "Yeşil bölge daralır, ıslak top ayağından biraz kayar: direğin biraz içine nişan al." },
  { level: 20, key: "orumcek", title: "Boss kaleci: Örümcek", text: "Uzun kolları köşelere daha çok uzanır. Doksana ya da direk dibine vur." },
  { level: 22, key: "baraj", title: "Hareketli baraj", text: "Önünde sağa sola kayan bir baraj var. Boşluğu kolla ya da kaşıkla üstünden aşırt." },
  { level: 26, key: "gece", title: "Gece maçı", text: "Işıklar loş: topun yol çizgisi görünmez, yalnız nişangâh kalır." },
  { level: 30, key: "kedi", title: "Boss kaleci: Kedi", text: "Çok hızlı uçar ve çabuk okur. Sert ve köşeye vur." },
  { level: 32, key: "sis", title: "Sis", text: "Sisli havada rüzgâr göstergesi görünmez. Köşe bayraklarının dalgalanmasına bak." },
  { level: 38, key: "oynak", title: "Hareketli halkalar", text: "Halkalar kalede kayar: top vardığında halkanın nerede olacağını kestir." },
  { level: 40, key: "duvar", title: "Boss kaleci: Duvar", text: "Ortada kalır, alçak ve orta topları kapatır. Yükseğe ve köşeye vur." },
  { level: 45, key: "iki_savunmaci", title: "İki savunmacı", text: "Çizgide artık iki savunmacı var. Aralarındaki ve yanlarındaki boşluğu kolla." },
  { level: 50, key: "hilebaz", title: "Boss kaleci: Hilebaz", text: "Çizgide dans eder, son anda okur. Onu beklemeden sert ve köşeye vur." },
  { level: 55, key: "firtina", title: "Değişken rüzgâr", text: "Rüzgâr nişan alırken yön ve şiddet değiştirir; vuruş anındaki rüzgâr geçerli." },
];

export type PenaltiBoss = "kahin" | "orumcek" | "kedi" | "duvar" | "hilebaz";
export const BOSS_KEYS: PenaltiBoss[] = ["kahin", "orumcek", "kedi", "duvar", "hilebaz"];
export const BOSS_NAMES: Record<PenaltiBoss, string> = { kahin: "Kâhin", orumcek: "Örümcek", kedi: "Kedi", duvar: "Duvar", hilebaz: "Hilebaz" };
const HOOP_SLOTS: [number, number][] = [
  [-2.75, 0.55],
  [-2.75, 1.7],
  [-1.35, 0.55],
  [-1.35, 1.75],
  [1.35, 0.55],
  [1.35, 1.75],
  [2.75, 0.55],
  [2.75, 1.7],
];
const KICKS = 5;

export type PenaltiGoal = "score" | "targets" | "shootout" | "sudden";

export interface PenaltiLevel {
  level: number;
  seed: number;
  /** score: Y şutta X gol · targets: Y şutta X halka golü · shootout: seri penaltı · sudden: ani ölüm */
  goal: PenaltiGoal;
  shots: number;
  need: number;
  diff: number;
  keeperD: number;
  reflex: number;
  oppAcc: number;
  boss: PenaltiBoss | null;
  breather: boolean;
  /** Bu bölümde tanıtılan özellik (UNLOCKS anahtarı). */
  intro: string | null;
  wind: number;
  gust: boolean;
  clock: number;
  rain: boolean;
  slip: number;
  night: boolean;
  fog: boolean;
  defenders: number;
  defSpeed: number;
  defPhase: number;
  wall: { size: number; speed: number; phase: number } | null;
  hoops: { x: number; y: number; r: number }[];
  hoopMove: number;
  zoneK: number;
  period: number;
  sway: number;
}

/** Tohumlu rastgele (mulberry32) — games/core.js A.seeded ile aynı. */
function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const r2 = (v: number) => Math.round(v * 100) / 100;
const clampN = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
function unlockAt(key: string): number {
  for (const u of UNLOCKS) if (u.key === key) return u.level;
  return 1e9;
}
export function unlockOf(level: number): PenaltiUnlock | null {
  return UNLOCKS.find((u) => u.level === level) ?? null;
}

/** N. bölümün tanımı — games/penalti.js `levelSpec` ile birebir aynı sıra ve sayılar. */
export function penaltiLevel(level: number): PenaltiLevel {
  const n = Math.max(1, Math.floor(Number(level)) || 1);
  const rng = seededRandom(n * 7919 + 4242);
  const dr: number[] = [];
  for (let i = 0; i < 20; i += 1) dr.push(rng());
  const has = (k: string) => n >= unlockAt(k);
  let intro: string | null = null;
  for (const u of UNLOCKS) if (u.level === n) intro = u.key;
  const boss = n % 10 === 0 ? BOSS_KEYS[(n / 10 - 1) % BOSS_KEYS.length] : null;
  const breather = !boss && n % 5 === 0;
  let d = 1 - Math.exp(-(n - 1) / 70);
  d += boss ? 0.08 : breather ? -0.14 : ((n * 37) % 7) / 100 - 0.03;
  d = r2(clampN(d, 0, 0.97));
  const calm = breather || (intro !== null && intro !== "temel");
  const want = (key: string, p: number, k: number, light: boolean) => {
    if (!has(key)) return false;
    if (intro === key) return true;
    if (breather || (calm && !light)) return false;
    return dr[k] < p;
  };

  let goal: PenaltiGoal;
  if (n === 1 || n === 3) goal = "score";
  else if (boss) goal = n >= 60 && n % 20 === 0 ? "sudden" : "shootout";
  else if (n === 2) goal = "shootout";
  else if (intro === "halka" || intro === "oynak") goal = "targets";
  else if (intro === "ani") goal = "sudden";
  else if (breather) goal = dr[0] < 0.5 || !has("halka") ? "score" : "targets";
  else {
    const pool: PenaltiGoal[] = ["score", "shootout"];
    if (has("halka")) pool.push("targets", "targets");
    if (has("ani")) pool.push("sudden");
    goal = pool[Math.floor(dr[0] * pool.length)];
  }

  const wind = want("ruzgar", 0.45 + 0.45 * d, 1, true) || intro === "firtina" ? r2(1.5 + 6.5 * d * (0.6 + 0.4 * dr[2])) : 0;
  const gust = wind > 0 && want("firtina", 0.25 + 0.4 * d, 3, true);
  const clock = want("sure", 0.2 + 0.45 * d, 4, false) ? Math.round(8 - 4 * d) : 0;
  const rain = want("yagmur", 0.15 + 0.35 * d, 5, true);
  const night = want("gece", 0.22, 6, false);
  const fog = !night && want("sis", 0.15 + 0.2 * d, 7, false);
  let defenders = intro === "iki_savunmaci" ? 2 : want("savunmaci", 0.2 + 0.4 * d, 8, false) ? (has("iki_savunmaci") && dr[9] < 0.15 + 0.4 * d ? 2 : 1) : 0;
  const wall = want("baraj", 0.18 + 0.4 * d, 10, false) ? { size: d > 0.6 ? 4 : 3, speed: r2(0.6 + 1.3 * d), phase: r2(dr[11] * 6.28) } : null;
  if (wall && defenders === 2 && intro !== "iki_savunmaci") defenders = 1;

  const hoops: PenaltiLevel["hoops"] = [];
  let hoopMove = 0;
  if (goal === "targets") {
    const used: Record<number, boolean> = {};
    for (let h = 0; h < 3; h += 1) {
      let s = Math.floor(dr[13 + h] * HOOP_SLOTS.length);
      while (used[s]) s = (s + 1) % HOOP_SLOTS.length;
      used[s] = true;
      const hr = r2(0.78 - 0.32 * d);
      // halka zemine ve üst direğe taşmasın
      hoops.push({ x: HOOP_SLOTS[s][0], y: r2(clampN(HOOP_SLOTS[s][1], hr + 0.08, 2.44 - hr + 0.1)), r: hr });
    }
    hoopMove = want("oynak", 0.3 + 0.4 * d, 16, true) ? r2(0.5 + 0.8 * d) : 0;
  }

  let shots = 0;
  let need = 0;
  if (goal === "score") {
    shots = d > 0.55 ? 6 : 5;
    need = clampN(Math.round(shots * (0.55 + 0.3 * d)) - (breather ? 1 : 0), 2, shots);
  } else if (goal === "targets") {
    shots = d > 0.55 ? 6 : 5;
    need = clampN(Math.round(2 + 2.2 * d) - (breather ? 1 : 0), 1, shots - 1);
  } else if (goal === "shootout") shots = KICKS;

  const kd = r2(clampN(d + (boss ? 0.08 : 0), 0, 1));
  return {
    level: n,
    seed: n * 7919 + 4242,
    goal,
    shots,
    need,
    diff: d,
    keeperD: kd,
    reflex: Math.round(clampN(58 + 36 * d + (boss ? 5 : 0), 50, 99)),
    oppAcc: r2(clampN(0.58 + 0.27 * d + (boss ? 0.03 : 0), 0.5, 0.9)),
    boss,
    breather,
    intro,
    wind,
    gust,
    clock,
    rain,
    slip: rain ? r2(0.1 + 0.2 * d) : 0,
    night,
    fog,
    defenders,
    defSpeed: defenders ? r2(0.5 + 1.1 * d) : 0,
    defPhase: r2(dr[12] * 6.28),
    wall,
    hoops,
    hoopMove,
    zoneK: r2((1 - 0.38 * d) * (rain ? 0.88 : 1)),
    period: r2(1.32 - 0.42 * d),
    sway: r2(0.03 + 0.2 * d),
  };
}

/** Hedefin tek satırı — games/penalti.js `goalText` ile aynı (oyunun levelInfo.goal'u). */
export function goalText(s: PenaltiLevel): string {
  if (s.goal === "score") return `${s.shots} şutta ${s.need} gol at`;
  if (s.goal === "targets") return `${s.shots} şutta ${s.need} halka golü at`;
  if (s.goal === "shootout") return "Seri penaltıyı kazan";
  return "Ani ölümde rakibi geç";
}

/** Başlangıç penceresi özeti (PuzzleGameModule.goalSummary). */
export function goalSummary(level: number): PuzzleGoalSummary {
  const s = penaltiLevel(level);
  const goals: PuzzleGoalSummary["goals"] = [];
  if (s.goal === "score") goals.push({ icon: "football", label: "Gol at", count: s.need });
  else if (s.goal === "targets") goals.push({ icon: "radio-button-on", label: "Halkadan gol at", count: s.need });
  else if (s.goal === "shootout") goals.push({ icon: "trophy", label: "Seri penaltıyı kazan" });
  else goals.push({ icon: "flash", label: "Ani ölüm: ilk kaçıran kaybeder" });
  if (s.boss) goals.push({ icon: "skull", label: `Boss kaleci: ${BOSS_NAMES[s.boss]}` });
  if (s.wind) goals.push({ icon: "flag", label: s.gust ? "Değişken rüzgâr" : "Rüzgâr" });
  if (s.wall) goals.push({ icon: "people", label: "Hareketli baraj", count: s.wall.size });
  if (s.defenders) goals.push({ icon: "shield", label: "Çizgide savunmacı", count: s.defenders });
  if (s.hoopMove) goals.push({ icon: "swap-horizontal", label: "Hareketli halkalar" });
  if (s.clock) goals.push({ icon: "timer", label: `Atış saati ${s.clock} sn` });
  if (s.rain) goals.push({ icon: "rainy", label: "Yağmur · kaygan top" });
  if (s.night) goals.push({ icon: "moon", label: "Gece maçı" });
  if (s.fog) goals.push({ icon: "cloud", label: "Sis" });
  const limit = s.goal === "score" || s.goal === "targets" ? `${s.shots} şut` : s.goal === "shootout" ? "5 atış · seri penaltı" : "Ani ölüm";
  return {
    limit,
    goals,
    badge: s.boss ? "Kupa maçı" : s.breather ? "Nefes" : null,
    tip: unlockOf(s.level)?.text ?? null,
  };
}
