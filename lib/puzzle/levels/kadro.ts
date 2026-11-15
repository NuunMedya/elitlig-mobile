/**
 * KADRO KOŞUSU — bölüm tablosu (Lig Yolu, WebView bölüm modu).
 *
 * Oyunun kendisi games/kadro.js'tedir; bölüm yolu orada `levelSpec(N)` +
 * tohumlu üreteçle kurulur. Bu dosya o tabloların TS AYNASIDIR (çerçevenin
 * başlangıç penceresi, harita rozetleri ve ipucu için):
 *   · LEVEL_COUNT, KADRO_UNLOCKS (UNLOCKS) ve kadroLevelSpec(N) JS'tekiyle
 *     BİREBİR aynıdır. `npm run check:games` her ikisini 1–400 için JSON
 *     olarak karşılaştırır; biri değişirse öbürü de değişmelidir.
 *   · Yeni bölüm eklemek = LEVEL_COUNT'u büyütmek (formüller her N için
 *     tanımlı; mevcut bölümler değişmez).
 *
 * Bu dosya BAĞIMSIZDIR (yalnız tür içe aktarımı): denetim betikleri onu
 * node ile doğrudan yükler.
 *
 * ZORLUK EĞRİSİ: d = 1 − e^(−(N−1)/70) yavaş doyar; on'luk içinde hafif
 * artış (wave), 120'den sonra ek sertlik (late). Her 10. bölüm KUPA MAÇI
 * (bir etap fazla, gruplar ×1,12, kaleci ×1,5), 5'in katları NEFES (bir etap
 * eksik, ×0,8, bol silah). Uzunluk: 2 etap × 6 dilim (bölüm 1, ~40 sn) →
 * 6 etap × 8 dilim (78+, ~90–110 sn; kupada 7 etap).
 */

import type { PuzzleGoalSummary } from "../types";

export const LEVEL_COUNT = 250;

/** Bir dilimin uzunluğu (m) — games/kadro.js SEG. */
const SEG = 20;

export type KadroUnlockKind = "gate" | "obstacle" | "rival" | "weapon" | "keeper";

export interface KadroUnlock {
  level: number;
  key: string;
  kind: KadroUnlockKind;
  name: string;
  tip: string;
}

/** level → yeni özellik; tanıtıldığı bölümün başında oyunda tanıtım kartı çıkar. */
export const KADRO_UNLOCKS: KadroUnlock[] = [
  { level: 1, key: "kapi", kind: "gate", name: "KAPILAR", tip: "Mavi kapı kadronu büyütür, kırmızı küçültür. Rakip grubunu şutla erit, sonunda kaleciyi geç." },
  { level: 2, key: "triple", kind: "weapon", name: "ÜÇLÜ TOP", tip: "Her vuruşta üç top atar." },
  { level: 3, key: "carpi", kind: "gate", name: "ÇARPI KAPISI", tip: "× kapısı kadronu katlar." },
  { level: 4, key: "cubuk", kind: "obstacle", name: "ANTRENMAN ÇUBUĞU", tip: "Sağa sola kayar; değdiği oyuncular düşer." },
  { level: 6, key: "fire", kind: "weapon", name: "ATEŞLİ TOP", tip: "2,6 kat hasar, arkadaki rakibi de deler." },
  { level: 7, key: "yarim", kind: "rival", name: "YARIM SAHA GRUBU", tip: "Kalabalık grup yolun yarısını kapatır: ya kaç ya erit." },
  { level: 8, key: "bolu", kind: "gate", name: "BÖLÜ KAPISI", tip: "÷ kapısı kadronu bölür; dikkatli seç." },
  { level: 11, key: "curve", kind: "weapon", name: "FALSOLU TOP", tip: "Kavis çizer, rakipten rakibe seker." },
  { level: 12, key: "ciftKotu", kind: "gate", name: "ÇİFT KÖTÜ KAPI", tip: "İki kapı da kötü olabilir: daha az kaybettireni seç." },
  { level: 14, key: "boots", kind: "weapon", name: "KRAMPON", tip: "6 sn hız ve omuz şarjı: temasta 1'e 3." },
  { level: 16, key: "baraj", kind: "obstacle", name: "BARAJ", tip: "Duran savunma duvarı: boşluktan geç." },
  { level: 18, key: "giant", kind: "weapon", name: "DEV TOP", tip: "Tek atımda grubu biçer." },
  { level: 22, key: "degisken", kind: "gate", name: "DEĞİŞKEN KAPI", tip: "Kapılar yer değiştirir: zamanlamanı ayarla." },
  { level: 26, key: "zirhli", kind: "rival", name: "ZIRHLI RAKİP", tip: "Gri formalılar normal topa dirençli; ateşli ve dev top tam vurur." },
  { level: 32, key: "kayan", kind: "obstacle", name: "KAYAN SAVUNMACI", tip: "Hızla yana kayar; değdiği oyuncuyu düşürür." },
  { level: 38, key: "gezen", kind: "rival", name: "GEZEN GRUP", tip: "Grup yolda sağa sola kayar." },
  { level: 45, key: "gizli", kind: "gate", name: "GİZLİ KAPI", tip: "Yaklaşınca açılır; hızlı karar ver." },
  { level: 55, key: "ciftCubuk", kind: "obstacle", name: "ÇİFT ÇUBUK", tip: "Art arda iki çubuk: araya gir." },
  { level: 65, key: "ciftSut", kind: "keeper", name: "ÇİFT ŞUT", tip: "Kaleci art arda iki sert şut çeker." },
  { level: 80, key: "usta", kind: "keeper", name: "USTA KALECİ", tip: "Kaleci gittiğin yöne nişan alır: son anda kaç." },
  { level: 100, key: "devGrup", kind: "rival", name: "DEV GRUP", tip: "Dev kalabalık: önündeki silahı mutlaka al." },
];
/** Sözleşmedeki ad (docs/oyun-yenileme-2026-11.md §2). */
export const UNLOCKS = KADRO_UNLOCKS;

const UNLOCK_AT: Record<string, number> = { sack: 1 };
const UNLOCK_BY_LEVEL: Record<number, KadroUnlock> = {};
for (const u of KADRO_UNLOCKS) {
  UNLOCK_AT[u.key] = u.level;
  UNLOCK_BY_LEVEL[u.level] = u;
}
const has = (key: string, level: number) => level >= (UNLOCK_AT[key] ?? 1e9);
const r2 = (v: number) => Math.round(v * 100) / 100;

export interface KadroLevelSpec {
  level: number;
  cup: boolean;
  breather: boolean;
  sections: number;
  per: number;
  segs: number;
  meters: number;
  hard: number;
  tough: number;
  keeper: number;
  speed: number;
  obst: number;
  weapon: number;
  shotGap: number;
  shotLand: number;
  shotLoss: number;
  double: boolean;
  aim: boolean;
  unlock: string | null;
  seed: number;
}

/** games/kadro.js levelSpec ile birebir (alan sırası dahil: denetim JSON karşılaştırır). */
export function kadroLevelSpec(lvl: number): KadroLevelSpec {
  const L = Math.max(1, Math.floor(lvl) || 1);
  const cup = L % 10 === 0;
  const breather = !cup && L % 5 === 0;
  const d = 1 - Math.exp(-(L - 1) / 70);
  const wave = cup ? 1 : (L % 10) / 10;
  const late = L > 120 ? Math.min(1, (L - 120) / 130) : 0;
  let sections = Math.min(6, 2 + Math.floor((L + 10) / 22));
  if (cup) sections += 1;
  if (breather) sections = Math.max(2, sections - 1);
  const per = L >= 40 ? 8 : 6;
  const segCount = sections * per;
  const u = UNLOCK_BY_LEVEL[L] ?? null;
  return {
    level: L,
    cup,
    breather,
    sections,
    per,
    segs: segCount,
    meters: segCount * SEG + 14,
    hard: r2(Math.min(1, (L - 1) / 60)),
    tough: r2((0.55 + 0.85 * d + 0.12 * wave + 0.15 * late) * (cup ? 1.12 : breather ? 0.8 : 1)),
    keeper: r2((2.2 + 1.6 * d + 0.4 * late) * (cup ? 1.5 : breather ? 0.8 : 1)),
    speed: r2(8.2 + 3.3 * (1 - Math.exp(-(L - 1) / 40)) - (breather ? 0.4 : 0)),
    obst: has("cubuk", L) ? r2(Math.min(0.45, 0.18 + 0.3 * d)) : 0,
    weapon: r2(breather ? 0.6 : 0.42 - 0.12 * d),
    shotGap: r2(Math.max(0.8, 1.5 - 0.5 * d - (cup ? 0.15 : 0))),
    shotLand: r2(Math.max(0.7, 0.95 - 0.2 * d)),
    shotLoss: r2(0.2 + 0.12 * d),
    double: has("ciftSut", L) && (cup || L % 3 === 0 || L === UNLOCK_AT.ciftSut),
    aim: has("usta", L) && (cup || L % 2 === 0 || L === UNLOCK_AT.usta),
    unlock: u ? u.key : null,
    seed: (Math.imul(L, 2654435761) ^ 0x4b414452) >>> 0,
  };
}

/** Bu bölümde açılan özellik (yoksa null). */
export function kadroUnlockAt(level: number): KadroUnlock | null {
  return UNLOCK_BY_LEVEL[Math.floor(level)] ?? null;
}

const UNLOCK_ICON: Record<KadroUnlockKind, string> = {
  gate: "swap-horizontal",
  obstacle: "warning",
  rival: "people",
  weapon: "flame",
  keeper: "hand-left",
};

/** Başlangıç penceresi özeti (oyunun levelInfo.goal metniyle aynı anlam). */
export function goalSummary(level: number): PuzzleGoalSummary {
  const sp = kadroLevelSpec(level);
  const u = kadroUnlockAt(sp.level);
  const goals: PuzzleGoalSummary["goals"] = [
    { icon: "football", label: "Kaleciyi geç, gol at" },
    { icon: "people", label: "Kadronu koru: kalan kadro yıldızı belirler" },
  ];
  if (sp.cup) goals.push({ icon: "trophy", label: "Kupa maçı: sert gruplar, güçlü kaleci" });
  if (u) goals.push({ icon: UNLOCK_ICON[u.kind], label: `Yeni: ${u.name}` });
  return {
    limit: `${sp.sections} etap · ${sp.meters} m`,
    goals,
    badge: sp.cup ? "Kupa maçı" : sp.breather ? "Nefes" : null,
    tip: u ? `${u.name}: ${u.tip}` : null,
  };
}
