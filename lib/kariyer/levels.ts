/**
 * KARİYER YOLU — seviye üretimi, özellikler, antrenman kartları ve reyting.
 *
 * SEVİYE = MAÇ GÜNÜ. Maç baştan sona oynanmaz; oyuncunun topla buluştuğu
 * 3–5 "an" oynanır (şut · pas · çalım). Seviye üretimi belirlenimcidir: aynı
 * seviye her cihazda aynı anları üretir (Lig Yolu kuralı; lib/puzzle/types.ts).
 *
 * BASAMAKLAR (ilk sürüm iki basamak, 40 seviye; sonrası amatör ligde
 * zorlaşarak sürer):
 *   1–20   Mahalle sahası   şut öğretilir, 6. seviyede pas, 11. seviyede çalım
 *   21–40  Amatör lig       daha hızlı kaleci ve savunma, dört–beş an
 * Her 10. seviye "kupa maçı"dır: bir an fazla, reyting eşiği yüksek.
 *
 * ÖZELLİKLER (0–99): şut, pas, teknik, hız. Anların fiziğini gerçekten
 * değiştirirler (lib/kariyer/sim.ts): şut topu hızlandırır, pas topu ve
 * yakalama alanını büyütür, teknik çalımda çarpışma payını daraltır, hız
 * oyuncunun parmağı izleme hızını artırır.
 *
 * GELİŞİM: kazanılan her yıldız bir antrenman puanıdır. Maç öncesi üç karttan
 * biri seçilir; kart puanı özelliklere dağıtır. Yıldızlar sunucudadır
 * (/api/puzzle), dağıtım cihazda saklanır (lib/kariyer/progress.ts).
 */

import { seededRandom } from "@/lib/puzzle/types";

export type MomentKind = "shot" | "pass" | "dribble";
export type AttrKey = "sut" | "pas" | "teknik" | "hiz";
export type Attrs = Record<AttrKey, number>;
/** Oyuncunun hattı: gerçek profil bağlıysa mevkiden gelir. */
export type Line = "GK" | "DEF" | "MID" | "FWD";

export const ATTR_LABELS: Record<AttrKey, string> = { sut: "Şut", pas: "Pas", teknik: "Teknik", hiz: "Hız" };
export const ATTR_ICONS: Record<AttrKey, string> = { sut: "football", pas: "swap-horizontal", teknik: "sparkles", hiz: "flash" };
export const ATTR_KEYS: AttrKey[] = ["sut", "pas", "teknik", "hiz"];
export const ATTR_MAX = 99;

export const MOMENT_LABELS: Record<MomentKind, string> = { shot: "Şut", pass: "Pas", dribble: "Çalım" };
export const MOMENT_ICONS: Record<MomentKind, string> = { shot: "football", pass: "swap-horizontal", dribble: "walk" };
export const MOMENT_HINTS: Record<MomentKind, string> = {
  shot: "Parmağını kaleye doğru çek ve bırak. Uzun çekiş sert şut demek; kaleciyi ters köşeye yatır.",
  pass: "Koşan arkadaşının ÖNÜNE doğru çek ve bırak. Top oraya vardığında o da orada olmalı.",
  dribble: "Parmağını basılı tutup sağa sola kaydır; savunmacılara çarpmadan çizgiye ulaş.",
};

export interface MomentDef {
  kind: MomentKind;
  /** Maç dakikası (yalnız anlatım). */
  minute: number;
  /** Anın kısa hikâyesi ("Ceza sahası dışında top sende!"). */
  story: string;
  /** 0–1: basamak ve seviyeye göre artan zorluk. */
  difficulty: number;
  /** Rakip sayısı (duvar, araya giren, karşıdan gelen). */
  rivals: number;
  /** Anın tohumu: yerleşimler buradan türetilir. */
  seed: number;
}

export interface KariyerLevel {
  level: number;
  tier: number;
  tierName: string;
  /** Basamak içindeki maç sırası (1–20). */
  matchNo: number;
  opponent: string;
  cup: boolean;
  moments: MomentDef[];
  /** Kazanmak ve yıldızlar için reyting eşikleri. */
  pass: number;
  star2: number;
  star3: number;
  tip: string | null;
}

export const TIER_NAMES = ["Mahalle Sahası", "Amatör Lig"];
export const TIER_SIZE = 20;
export const tierOf = (level: number) => Math.min(TIER_NAMES.length, Math.floor((Math.max(1, level) - 1) / TIER_SIZE) + 1);

const OPPONENTS = [
  ["Yokuşbaşı Gençlik", "Çınaraltı Spor", "Sokak Yıldızları", "Arka Mahalle FK", "Pazar Yeri SK", "Köprüaltı United", "Bakkal Amca FC", "Otopark Gücü", "Parkspor", "Apartman Birliği"],
  ["Kuzey Yıldızı SK", "Demirspor", "Sanayi Gücü", "Çamlık FK", "Yeni Mahalle Spor", "Altınordu Gençlik", "Kartal Yuvası", "Liman SK", "Tepebaşı FK", "Gençlerbirliği Amatör"],
];

const STORIES: Record<MomentKind, string[]> = {
  shot: ["Ceza sahası dışında top sende!", "Kaleciyle karşı karşıyasın!", "Seken top önüne düştü!", "Frikik! Baraj kuruldu.", "Son dakika, vur gitsin!"],
  pass: ["Arkadaşın boşa koşuyor, gör onu!", "Ara pası zamanı!", "Kanat boşaldı, at koşsun!", "Kontra atak, çabuk oyna!", "Savunmanın arkası boş!"],
  dribble: ["Önün açık, sür topu!", "İki kişi üstüne geliyor!", "Çizgiye in, geç adamını!", "Orta sahada tek başınasın!", "Pres var, sıyrıl!"],
};

const TIPS: Record<number, string> = {
  1: MOMENT_HINTS.shot,
  2: "Kaleci topun gittiği yöne yürür. Onun uzağına, direğin dibine nişan al.",
  6: MOMENT_HINTS.pass,
  11: MOMENT_HINTS.dribble,
  10: "Kupa maçı: bir an fazla oynanır ve reyting eşiği yüksektir.",
  21: "Amatör lige yükseldin! Kaleciler daha hızlı, savunma daha kalabalık.",
};

/** Hatta göre an ağırlıkları: forvet daha çok şut çeker, orta saha pas atar. */
const LINE_WEIGHTS: Record<Line, Record<MomentKind, number>> = {
  FWD: { shot: 5, pass: 2, dribble: 3 },
  MID: { shot: 3, pass: 5, dribble: 3 },
  DEF: { shot: 2, pass: 5, dribble: 3 },
  GK: { shot: 2, pass: 6, dribble: 2 },
};

function pick<T>(rnd: () => number, list: T[]): T {
  return list[Math.floor(rnd() * list.length) % list.length];
}

export function generateKariyerLevel(level: number, line: Line = "FWD"): KariyerLevel {
  const lv = Math.max(1, Math.floor(level));
  const tier = tierOf(lv);
  const matchNo = ((lv - 1) % TIER_SIZE) + 1;
  const rnd = seededRandom(lv * 7919 + 4201);
  const cup = lv % 10 === 0;
  // 40'tan sonra amatör ligde zorluk artmaya devam eder (tavan 1).
  const beyond = Math.max(0, lv - TIER_NAMES.length * TIER_SIZE);
  const base = tier === 1 ? 0.06 + (matchNo - 1) * 0.021 : 0.42 + (matchNo - 1) * 0.022 + beyond * 0.004;
  // 5'in katları "nefes" seviyesidir; kupa maçı belirgin zordur.
  const wave = cup ? 0.1 : lv % 5 === 0 ? -0.08 : (rnd() - 0.5) * 0.06;
  const difficulty = Math.max(0.04, Math.min(1, base + wave));

  // Hangi anlar açık: şut baştan, pas 6'da, çalım 11'de.
  const open: MomentKind[] = lv >= 11 ? ["shot", "pass", "dribble"] : lv >= 6 ? ["shot", "pass"] : ["shot"];
  let count = lv <= 2 ? 2 : lv <= 12 ? 3 : tier === 1 ? 4 : 4 + (matchNo > 12 ? 1 : 0);
  if (cup) count += 1;
  count = Math.min(6, count);

  const weights = LINE_WEIGHTS[line] ?? LINE_WEIGHTS.FWD;
  const kinds: MomentKind[] = [];
  // Yeni açılan an o seviyede mutlaka ilk an olarak oynanır.
  if (lv === 6) kinds.push("pass");
  if (lv === 11) kinds.push("dribble");
  while (kinds.length < count) {
    const total = open.reduce((sum, kind) => sum + weights[kind], 0);
    let roll = rnd() * total;
    let chosen: MomentKind = open[0];
    for (const kind of open) {
      roll -= weights[kind];
      if (roll <= 0) {
        chosen = kind;
        break;
      }
    }
    // Üç kez üst üste aynı an gelmesin.
    const n = kinds.length;
    if (n >= 2 && kinds[n - 1] === chosen && kinds[n - 2] === chosen && open.length > 1) continue;
    kinds.push(chosen);
  }
  // Maç her zaman bir şutla biter (son söz gol olsun).
  if (lv > 2 && kinds[kinds.length - 1] !== "shot") kinds[kinds.length - 1] = "shot";

  const moments: MomentDef[] = kinds.map((kind, index) => {
    const step = (index + 1) / (kinds.length + 1);
    const d = Math.max(0.03, Math.min(1, difficulty + (index / Math.max(1, kinds.length - 1) - 0.5) * 0.1));
    const rivals =
      kind === "shot" ? (d < 0.22 ? 0 : d < 0.6 ? 1 : 2) : kind === "pass" ? (d < 0.18 ? 1 : d < 0.55 ? 2 : 3) : d < 0.3 ? 5 : d < 0.65 ? 7 : 9;
    return {
      kind,
      minute: Math.max(3, Math.min(90, Math.round(step * 88 + (rnd() - 0.5) * 8))),
      story: pick(rnd, STORIES[kind]),
      difficulty: d,
      rivals,
      seed: Math.floor(rnd() * 1e9),
    };
  });

  const pass = cup ? 6.8 : 6.2 + difficulty * 0.4;
  return {
    level: lv,
    tier,
    tierName: TIER_NAMES[tier - 1],
    matchNo,
    opponent: pick(rnd, OPPONENTS[tier - 1]),
    cup,
    moments,
    pass: Math.round(pass * 10) / 10,
    star2: Math.round((pass + 1.2) * 10) / 10,
    star3: Math.round(Math.min(9.4, pass + 2.3) * 10) / 10,
    tip: TIPS[lv] ?? null,
  };
}

/* ───────────────────────────── reyting ───────────────────────────── */

/** An skorlarından (0–1) maç reytingi: 4,0 – 10,0. */
export function ratingOf(scores: number[]): number {
  if (!scores.length) return 4;
  const avg = scores.reduce((sum, value) => sum + Math.max(0, Math.min(1, value)), 0) / scores.length;
  return Math.round((4 + avg * 6) * 10) / 10;
}

export function starsOf(rating: number, level: KariyerLevel): 0 | 1 | 2 | 3 {
  if (rating < level.pass) return 0;
  if (rating >= level.star3) return 3;
  if (rating >= level.star2) return 2;
  return 1;
}

/* ───────────────────────────── özellikler ───────────────────────────── */

/** Sıfırdan başlayan oyuncu. */
export const ROOKIE_ATTRS: Attrs = { sut: 30, pas: 30, teknik: 30, hiz: 30 };

/** Gerçek oyuncu profili: hattına göre başlangıç dağılımı (toplam aynı, ağırlık farklı). */
export function startingAttrs(line: Line | null): Attrs {
  switch (line) {
    case "FWD":
      return { sut: 40, pas: 26, teknik: 30, hiz: 34 };
    case "MID":
      return { sut: 28, pas: 40, teknik: 34, hiz: 28 };
    case "DEF":
      return { sut: 24, pas: 36, teknik: 28, hiz: 34 };
    case "GK":
      return { sut: 24, pas: 40, teknik: 32, hiz: 26 };
    default:
      return { ...ROOKIE_ATTRS };
  }
}

/** Mevki metninden hat ("Forvet", "Orta Saha", "Kaleci", "ST", "CM"…). */
export function lineOfPosition(position: string | null | undefined): Line | null {
  const text = String(position || "").toLocaleLowerCase("tr-TR");
  if (!text) return null;
  if (/kaleci|\bgk\b|^kl$/.test(text)) return "GK";
  if (/defans|savunma|stoper|bek|libero|\bdef\b|\bcb\b|\blb\b|\brb\b/.test(text)) return "DEF";
  if (/orta|\bmid\b|\bcm\b|\bdm\b|\bam\b|oyun kurucu/.test(text)) return "MID";
  if (/forvet|santrfor|kanat|hücum|\bst\b|\bfw|\bcf\b|\blw\b|\brw\b|golcü/.test(text)) return "FWD";
  return null;
}

export const overallOf = (attrs: Attrs) => Math.round((attrs.sut + attrs.pas + attrs.teknik + attrs.hiz) / 4);

/* ───────────────────────────── antrenman kartları ───────────────────────────── */

export interface TrainingCard {
  key: string;
  title: string;
  description: string;
  icon: string;
  gains: Partial<Attrs>;
}

const CARDS: TrainingCard[] = [
  { key: "sut_calis", title: "Şut çalışması", description: "Antrenmandan sonra 50 şut.", icon: "football", gains: { sut: 3 } },
  { key: "pas_calis", title: "Pas çalışması", description: "Duvarla tek pas, iki ayak.", icon: "swap-horizontal", gains: { pas: 3 } },
  { key: "top_surme", title: "Huni arası", description: "Dar alanda top sürme.", icon: "sparkles", gains: { teknik: 3 } },
  { key: "sprint", title: "Sprint tekrarları", description: "Kısa mesafe, tam hız.", icon: "flash", gains: { hiz: 3 } },
  { key: "bitiricilik", title: "Bitiricilik", description: "Kaleciyle karşı karşıya.", icon: "locate", gains: { sut: 2, teknik: 1 } },
  { key: "oyun_gorusu", title: "Oyun görüşü", description: "Maç videosu ve taktik.", icon: "eye", gains: { pas: 2, teknik: 1 } },
  { key: "ceviklik", title: "Çeviklik merdiveni", description: "Ayak hızı ve denge.", icon: "walk", gains: { hiz: 2, teknik: 1 } },
  { key: "kanat", title: "Kanat koşusu", description: "Çizgiye in, ortayı kes.", icon: "trending-up", gains: { hiz: 2, pas: 1 } },
  { key: "dengeli", title: "Tam antrenman", description: "Her şeyden biraz.", icon: "barbell", gains: { sut: 1, pas: 1, teknik: 1 } },
];

/** `seed` (harcanan puan sayısı) için üç kart: her seferinde farklı üçlü, en az biri hatta uygun. */
export function trainingOffer(seed: number, line: Line | null): TrainingCard[] {
  const rnd = seededRandom(seed * 104729 + 97);
  const pool = [...CARDS];
  const out: TrainingCard[] = [];
  const favorite: AttrKey = line === "FWD" ? "sut" : line === "MID" || line === "GK" || line === "DEF" ? "pas" : ATTR_KEYS[seed % ATTR_KEYS.length];
  const preferred = pool.filter((card) => (card.gains[favorite] ?? 0) >= 2);
  const first = preferred[Math.floor(rnd() * preferred.length) % preferred.length];
  out.push(first);
  pool.splice(pool.indexOf(first), 1);
  while (out.length < 3) {
    const index = Math.floor(rnd() * pool.length) % pool.length;
    out.push(pool[index]);
    pool.splice(index, 1);
  }
  return out;
}

export function applyGains(attrs: Attrs, gains: Partial<Attrs>): Attrs {
  const next = { ...attrs };
  for (const key of ATTR_KEYS) next[key] = Math.min(ATTR_MAX, next[key] + (gains[key] ?? 0));
  return next;
}
