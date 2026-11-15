/**
 * KARİYER YOLU — Lig Yolu bölüm tablosu (TS aynası).
 *
 * Oyunun kendisi games/kariyer.js'tedir (WebView Canvas 2D, bölüm modu:
 * docs/oyun-yenileme-2026-11.md §2). Bölüm (maç) tanımı orada `levelSpec(N)`
 * ile üretilir; bu dosya AYNI üreteci, AYNI `UNLOCKS` / `TIERS` tablolarını ve
 * AYNI hedef metnini taşır. İkisi birebir aynı olmalıdır: scripts/check-
 * kariyer.mjs bütün bölümleri (1..LEVEL_COUNT + 50 fazlası) ikisinde de
 * üretip JSON olarak karşılaştırır; bir tarafı değiştiren öbürünü de
 * değiştirmelidir.
 *
 * Bu dosya BAĞIMSIZDIR (yalnız tür içe aktarımı): denetim betiği onu node
 * ile doğrudan yükler. seededRandom bu yüzden kopyalandı (games/core.js
 * `A.seeded` ile birebir aynı mulberry32).
 *
 * KARİYER: her bölüm bir maç; 8 basamak (Mahalle Ligi → Avrupa Kupası),
 * basamağın ilk maçında terfi / transfer kartı. Maçta 3–6 canlı atak
 * (atak · kontra · penaltı · frikik · kafa); rakip de gol atar (takvimli
 * goller + kaybedilen toptan kontra). Rakipten çok gol → kazanç; yıldız maç
 * reytinginden (star2 / star3 eşikleri).
 *
 * ZORLUK EĞRİSİ: d = 1 − e^(−(N−1)/52) (+0,08 boss, −0,14 nefes, küçük
 * dalga), 0..0,92. Savunmacı sayısı / hızı / kayma menzili, kalecinin
 * refleksi ve çıkışı, yeşil bölge, nişan süresi, rakip golü ve kontra riski
 * d ile artar. Her 10. bölüm boss maçı (derbi / final), 5'in katları nefes.
 * Genişletmek: LEVEL_COUNT'u büyütmek yeter (mevcut bölümler değişmez).
 */

import type { PuzzleGoalSummary } from "@/lib/puzzle/types";

export const LEVEL_COUNT = 150;

export interface KariyerUnlock {
  level: number;
  key: string;
  title: string;
  text: string;
}
export interface KariyerTier {
  key: string;
  name: string;
  from: number;
}

/** Kariyer basamakları: bölüm `from`'dan itibaren bu ligdesin (games/kariyer.js TIERS). */
export const TIERS: KariyerTier[] = [
  { key: "mahalle", name: "Mahalle Ligi", from: 1 },
  { key: "amator", name: "Amatör Lig", from: 13 },
  { key: "bolgesel", name: "Bölgesel Amatör Lig", from: 27 },
  { key: "lig3", name: "3. Lig", from: 43 },
  { key: "lig2", name: "2. Lig", from: 61 },
  { key: "lig1", name: "1. Lig", from: 79 },
  { key: "super", name: "Süper Lig", from: 97 },
  { key: "avrupa", name: "Avrupa Kupası", from: 121 },
];

const BOSS_TITLES: [string, string][] = [
  ["Mahalle Derbisi", "Mahalle Kupası Finali"],
  ["Kasaba Derbisi", "Amatör Kupa Finali"],
  ["Bölge Derbisi", "Bölge Şampiyonluk Maçı"],
  ["Play-off Yarı Finali", "Play-off Finali"],
  ["Şehir Derbisi", "Terfi Finali"],
  ["Büyük Derbi", "Süper Lig Terfi Maçı"],
  ["Ezeli Rekabet", "Türkiye Kupası Finali"],
  ["Avrupa Gecesi", "Avrupa Finali"],
];

/** Hangi bölümde hangi yeni mekanik gelir (games/kariyer.js UNLOCKS). */
export const UNLOCKS: KariyerUnlock[] = [
  { level: 1, key: "kosu", title: "Koşu ve şut", text: "Parmağını sağa sola sürükleyerek koş. Ceza sahasına girince zaman yavaşlar: sürükle, nişan al; bırak ve güç çubuğu yeşildeyken dokun." },
  { level: 2, key: "defans", title: "Savunmacılar", text: "Rakip üstüne gelir. Yanından geç ya da tam yanına geldiğinde ekrana dokun: ÇALIM. Erken dokunursan çalım boşa gider." },
  { level: 4, key: "pas", title: "Verkaç", text: "Koşan takım arkadaşına dokun: pas verirsin, o koşarken top sana geri gelir. Pas çizgisi kırmızıysa arada rakip var, keser." },
  { level: 6, key: "kayma", title: "Kayarak müdahale", text: "Kırmızı şerit yanıp sönen rakip kayacak: şeritten çık ya da kaydığı an dokunup üstünden atla." },
  { level: 8, key: "penalti", title: "Penaltı", text: "Ceza sahasında düşürüldün! Kaleci çizgide köşeni okumaya çalışır: hep aynı köşeye vurma." },
  { level: 10, key: "derbi", title: "Derbi maçı", text: "Her 10. maç büyük maç: rakip daha sert, kalecisi daha usta. Kazanırsan kupa senin." },
  { level: 12, key: "kaleci", title: "Kaleci çıkıyor", text: "Kaleci çizgisinden çıkıp açıyı daraltır. Oyalanma: erken vur ya da köşeye yerden bitir." },
  { level: 14, key: "super", title: "Süper çalım", text: "Kayan rakibe son anda dokunursan zaman yavaşlar: SÜPER ÇALIM, reytingine ekstra puan." },
  { level: 16, key: "frikik", title: "Frikik", text: "Barajın üstünden ya da yanından vur. Nişan noktasının izini izle: top barajı aşmalı." },
  { level: 22, key: "kafa", title: "Kafa vuruşu", text: "Orta geliyor: topun düşeceği halkanın altına koş, halka yeşile dönünce kalenin vurmak istediğin yerine dokun." },
  { level: 26, key: "pres", title: "İkili pres", text: "Rakipler ikişer gelir. Çalım tek kişiyi geçer: baskıyı pasla kır." },
  { level: 28, key: "ofsayt", title: "Ofsayt", text: "Son savunmacının gerisindeki arkadaşına pas verirsen ofsayt olur. Kırmızı yanan arkadaşa pas verme." },
  { level: 32, key: "yagmur", title: "Yağmur", text: "Islak zeminde yön değiştirmek yavaşlar, yeşil şut bölgesi daralır." },
  { level: 36, key: "takip", title: "Arkadan gelen", text: "Bir rakip arkandan kovalıyor. Durma: çalımdan ya da verkaçtan sonra hızlanırsın." },
  { level: 45, key: "kontra", title: "Kontra atak", text: "Kendi yarı sahandan hızlı bir koşu, arkanda kovalayan rakip. Kaleye ulaşan kazanır." },
  { level: 55, key: "kalabalik", title: "Yoğun savunma", text: "Ceza sahası önü kalabalık: araya bir savunmacı daha girer. Pası ve çalımı birlikte kullan." },
];

export type KariyerKind = "atak" | "kontra" | "penalti" | "frikik" | "kafa";
export const KIND_NAMES: Record<KariyerKind, string> = { atak: "Atak", kontra: "Kontra atak", penalti: "Penaltı", frikik: "Frikik", kafa: "Kafa vuruşu" };
const KIND_ICONS: Record<KariyerKind, string> = { atak: "flash", kontra: "speedometer", penalti: "football", frikik: "git-merge", kafa: "person" };

export interface KariyerAttack {
  kind: KariyerKind;
  /** Atağın dakikası (sıralı). */
  minute: number;
  /** Açık oyunda savunmacı sayısı. */
  defs: number;
  /** Verkaç için koşan takım arkadaşı. */
  mates: number;
  /** Rakipler ikişer basar. */
  press: boolean;
  /** Arkandan kovalayan rakip. */
  chaser: boolean;
  /** Ofsayt kuralı işler. */
  offside: boolean;
}

export interface KariyerLevel {
  level: number;
  seed: number;
  tier: number;
  tierName: string;
  /** Basamağın ilk maçı: terfi / transfer kartı. */
  promo: boolean;
  diff: number;
  boss: boolean;
  bossTitle: string | null;
  breather: boolean;
  /** Bu bölümde tanıtılan mekanik (UNLOCKS anahtarı). */
  intro: string | null;
  attacks: KariyerAttack[];
  /** Takvimli rakip golü sayısı ve dakikaları. */
  rivals: number;
  rivalAt: number[];
  /** Kaybedilen toptan kontra gol yeme olasılığı. */
  counterP: number;
  rain: boolean;
  slide: boolean;
  superSkill: boolean;
  defSpeed: number;
  lunge: number;
  windup: number;
  reflex: number;
  keeperD: number;
  keeperOut: number;
  zoneK: number;
  period: number;
  sway: number;
  aimTime: number;
  star2: number;
  star3: number;
  /** Oyuncunun genel reytingi (kariyerle büyür). */
  gen: number;
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

const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;
const clampN = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
function unlockAt(key: string): number {
  for (const u of UNLOCKS) if (u.key === key) return u.level;
  return 1e9;
}
export function unlockOf(level: number): KariyerUnlock | null {
  return UNLOCKS.find((u) => u.level === level) ?? null;
}
function tierIndex(n: number): number {
  let t = 0;
  for (let i = 0; i < TIERS.length; i += 1) if (n >= TIERS[i].from) t = i;
  return t;
}

/** N. bölümün tanımı — games/kariyer.js `levelSpec` ile birebir aynı sıra ve sayılar. */
export function kariyerLevel(level: number): KariyerLevel {
  const n = Math.max(1, Math.floor(Number(level)) || 1);
  const seed = n * 7919 + 2026;
  const rng = seededRandom(seed);
  const dr: number[] = [];
  for (let i = 0; i < 30; i += 1) dr.push(rng());
  const has = (k: string) => n >= unlockAt(k);
  let intro: string | null = null;
  for (const u of UNLOCKS) if (u.level === n) intro = u.key;
  const ti = tierIndex(n);
  const boss = n % 10 === 0;
  const breather = !boss && n % 5 === 0;
  let d = 1 - Math.exp(-(n - 1) / 52);
  d += boss ? 0.08 : breather ? -0.14 : ((n * 37) % 7) / 100 - 0.03;
  d = r2(clampN(d, 0, 0.92));

  const count = n <= 3 ? 3 : clampN(3 + Math.floor(d * 2.6 + dr[0] * 1.2) + (boss ? 1 : 0) - (breather ? 1 : 0), 3, 6);
  const kinds: KariyerKind[] = ["atak"];
  for (let k = 1; k < count; k += 1) {
    const pool: KariyerKind[] = ["atak", "atak"];
    if (has("penalti") && kinds.indexOf("penalti") < 0) pool.push("penalti");
    if (has("frikik")) pool.push("frikik");
    if (has("kafa")) pool.push("kafa");
    if (has("kontra")) pool.push("kontra");
    kinds.push(pool[Math.floor(dr[1 + k] * pool.length)]);
  }
  if (intro === "penalti" || intro === "frikik" || intro === "kafa" || intro === "kontra") kinds[1] = intro;

  const attacks: KariyerAttack[] = [];
  const gap = 88 / count;
  for (let a = 0; a < count; a += 1) {
    const kd = kinds[a], ra = dr[8 + a], rb = dr[14 + a], rc = dr[20 + a];
    const open = kd === "atak" || kd === "kontra";
    let defs = 0;
    if (open && has("defans")) {
      defs = intro === "defans" ? 1 : 1 + Math.floor(d * 3 + ra * 1.3);
      if (kd === "kontra") defs = Math.max(1, defs - 1);
      if (has("kalabalik") && !breather && (intro === "kalabalik" || rb < 0.3 + 0.3 * d)) defs += 1;
      if (breather) defs = Math.max(1, defs - 1);
      defs = clampN(defs, 0, 5);
    }
    const mates = open && has("pas") ? (d > 0.45 && rb > 0.45 ? 2 : 1) : 0;
    const press = open && defs >= 2 && has("pres") && (intro === "pres" ? a === 0 : !breather && rc < 0.2 + 0.5 * d);
    const chaser = kd === "kontra" || (open && has("takip") && (intro === "takip" ? a === 0 : !breather && ra < 0.12 + 0.3 * d));
    const offside = open && mates > 0 && has("ofsayt") && (intro === "ofsayt" ? a === 0 : !breather && rc > 0.55 - 0.3 * d);
    attacks.push({
      kind: kd,
      minute: clampN(Math.round(1 + (a + 0.5) * gap + (ra - 0.5) * gap * 0.5), 2, 89),
      defs,
      mates,
      press,
      chaser,
      offside,
    });
  }

  const rain = has("yagmur") && (intro === "yagmur" || (!breather && dr[7] < 0.12 + 0.3 * d));
  const rivals = n <= 3 || breather ? 0 : clampN(Math.round(count * (0.1 + 0.2 * d) + (dr[26] - 0.5) * 0.6), 0, Math.max(0, count - 2));
  const rivalAt: number[] = [];
  for (let j = 0; j < rivals; j += 1) {
    let m = Math.round(((j + 0.75) * 88) / (rivals + 0.5) + (dr[27] - 0.5) * 6);
    for (let q = 0; q < attacks.length; q += 1) if (attacks[q].minute === m) m += 1;
    rivalAt.push(clampN(m, 3, 89));
  }
  let bi = 0;
  for (let b = TIERS[ti].from; b < n; b += 1) if (b % 10 === 0) bi += 1;

  return {
    level: n,
    seed,
    tier: ti,
    tierName: TIERS[ti].name,
    promo: n > 1 && n === TIERS[ti].from,
    diff: d,
    boss,
    bossTitle: boss ? BOSS_TITLES[ti][bi % 2] : null,
    breather,
    intro,
    attacks,
    rivals,
    rivalAt,
    counterP: r2(breather ? 0.08 : 0.14 + 0.12 * d),
    rain,
    slide: has("kayma"),
    superSkill: has("super"),
    defSpeed: r2(4.4 + 2.8 * d + (boss ? 0.2 : 0)),
    lunge: r2(2.1 + 1.5 * d),
    windup: r2(0.66 - 0.28 * d),
    reflex: Math.round(clampN(60 + 28 * d + (boss ? 5 : 0), 50, 99)),
    keeperD: r2(clampN(d + (boss ? 0.08 : 0), 0, 1)),
    keeperOut: has("kaleci") ? r2(0.8 + 1.8 * d * (0.7 + 0.3 * dr[28])) : 0,
    zoneK: r2((1 - 0.34 * d) * (rain ? 0.9 : 1)),
    period: r2(1.32 - 0.4 * d),
    sway: r2(0.03 + 0.16 * d),
    aimTime: r2(3.8 - 1.6 * d),
    star2: r1(6.6 + 0.35 * count + 0.3 * d),
    star3: r1(clampN(7.1 + 0.6 * count + 0.3 * d, 0, 9.7)),
    gen: Math.min(99, 58 + Math.floor((n - 1) * 0.3)),
  };
}

/** Hedefin tek satırı — games/kariyer.js `goalText` ile aynı (oyunun levelInfo.goal'u). */
export function goalText(s: KariyerLevel): string {
  return s.attacks.length + " atakta maçı kazan";
}

const fmt1 = (v: number) => v.toFixed(1).replace(".", ",");

/** Başlangıç penceresi özeti (PuzzleGameModule.goalSummary). */
export function goalSummary(level: number): PuzzleGoalSummary {
  const s = kariyerLevel(level);
  const counts = new Map<KariyerKind, number>();
  for (const a of s.attacks) counts.set(a.kind, (counts.get(a.kind) ?? 0) + 1);
  const goals: PuzzleGoalSummary["goals"] = [{ icon: "trophy", label: "Maçı kazan: rakipten çok gol at" }];
  for (const [kind, count] of counts) goals.push({ icon: KIND_ICONS[kind], label: KIND_NAMES[kind], count });
  goals.push({ icon: "star", label: `Reyting ${fmt1(s.star2)} → 2★ · ${fmt1(s.star3)} → 3★` });
  if (s.boss && s.bossTitle) goals.push({ icon: "skull", label: s.bossTitle });
  if (s.keeperOut) goals.push({ icon: "hand-left", label: "Kaleci çizgisinden çıkar" });
  if (s.attacks.some((a) => a.press)) goals.push({ icon: "people", label: "İkili pres" });
  if (s.attacks.some((a) => a.offside)) goals.push({ icon: "flag", label: "Ofsayt" });
  if (s.attacks.some((a) => a.chaser)) goals.push({ icon: "walk", label: "Arkadan kovalayan rakip" });
  if (s.rain) goals.push({ icon: "rainy", label: "Yağmur · kaygan zemin" });
  return {
    limit: `${s.tierName} · ${s.attacks.length} atak`,
    goals,
    badge: s.boss ? "Kupa maçı" : s.promo ? "Terfi" : s.breather ? "Nefes" : null,
    tip: unlockOf(s.level)?.text ?? null,
  };
}
