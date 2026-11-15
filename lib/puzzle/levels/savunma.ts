/**
 * SAVUNMA HATTI — bölüm tablosunun TS ikizi (Lig Yolu çerçevesi için).
 *
 * Oyunun kendisi `games/savunma.js` (WebView, Canvas 2D). Bölüm tasarımı
 * orada `PLAN` + `levelInfo(n)` ile tanımlıdır; bu dosya AYNI formülleri ve
 * AYNI açılış takvimini taşır ki başlangıç penceresi (goalSummary) ve harita
 * oyun açılmadan bölümü anlatabilsin. `npm run check:games` iki tarafı
 * 1..LEVEL_COUNT bölümlerinin hepsinde alan alan karşılaştırır: birini
 * değiştiren ötekini de değiştirmelidir.
 *
 * Bu dosya BAĞIMSIZDIR (yalnız tür içe aktarımı): denetim betiği onu node ile
 * doğrudan yükler.
 *
 * GENİŞLETME: yeni bölüm = LEVEL_COUNT'u büyütmek (formüller n'e bağlıdır,
 * mevcut bölümler DEĞİŞMEZ); yeni yenilik = UNLOCKS'a (ve JS PLAN'a) satır.
 */

import type { PuzzleGoalSummary } from "@/lib/puzzle/types";

export const LEVEL_COUNT = 100;

export type SavunmaUnlockKind = "unit" | "foe" | "lane" | "feature";
export interface SavunmaUnlock {
  level: number;
  kind: SavunmaUnlockKind;
  key: string;
  /** Oyundaki kart/rakip/özellik adı. */
  name: string;
  desc: string;
}

/** Açılış takvimi — games/savunma.js PLAN ile birebir (sıra dahil). */
export const UNLOCKS: readonly SavunmaUnlock[] = [
  { level: 4, kind: "unit", key: "stoper", name: "STOPER", desc: "Duvar olur, atlatmaz" },
  { level: 7, kind: "foe", key: "kanat", name: "HIZLI", desc: "Çok hızlı koşar, canı az" },
  { level: 10, kind: "feature", key: "kupa", name: "KUPA MAÇI", desc: "Her 10. bölüm: fazladan dalga, güçlü kaptan" },
  { level: 13, kind: "unit", key: "fuze", name: "FÜZE", desc: "3×3 alanı temizler" },
  { level: 17, kind: "foe", key: "santrfor", name: "TANK", desc: "Yavaş ama çok sağlam" },
  { level: 21, kind: "unit", key: "fiskiye", name: "FISKİYE", desc: "Çimi ıslatır, yavaşlatır" },
  { level: 24, kind: "foe", key: "ziplayan", name: "ZIPLAYAN", desc: "Önündeki oyuncunun üstünden atlar · STOPER durdurur" },
  { level: 27, kind: "lane", key: "lane", name: "6. KORİDOR", desc: "Saha genişledi: altı koridoru da koru" },
  { level: 31, kind: "unit", key: "cift", name: "ÇİFT", desc: "İki şut birden" },
  { level: 34, kind: "foe", key: "kalkanli", name: "KALKANLI", desc: "Kalkanı ilk şutları keser · ORTA havadan aşar" },
  { level: 38, kind: "unit", key: "ortaci", name: "ORTACI", desc: "Üç koridora orta, kalkanı aşar" },
  { level: 42, kind: "unit", key: "kaleci", name: "KALECİ", desc: "Rakibi kapar" },
  { level: 45, kind: "feature", key: "yagmur", name: "YAĞMUR", desc: "Çim kaygan: rakipler hızlı koşar, gökten az güneş düşer" },
  { level: 48, kind: "foe", key: "topcu", name: "TOPÇU", desc: "Uzaktan durup oyuncularına top atar" },
  { level: 52, kind: "unit", key: "pres", name: "PRES", desc: "Şutu yavaşlatır" },
  { level: 55, kind: "foe", key: "calimci", name: "ÇALIMCI", desc: "İlk oyuncuyu çalımlayıp yan koridora geçer · STOPER'a çalım atılmaz" },
  { level: 58, kind: "unit", key: "hakem", name: "HAKEM", desc: "Herkesi dondurur" },
  { level: 62, kind: "feature", key: "camur", name: "ÇAMUR", desc: "Çamurlu kareye oyuncu konmaz; rakip orada ağırlaşır" },
  { level: 65, kind: "foe", key: "dev", name: "DEV", desc: "Dev gibi: çok sağlam, oyuncuları çabuk yıpratır" },
  { level: 68, kind: "unit", key: "davulcu", name: "DAVULCU", desc: "Yanındaki şutçular daha sık şut atar" },
  { level: 72, kind: "feature", key: "gece", name: "GECE MAÇI", desc: "Koşu yolu karanlık: rakipler sahaya girince görünür" },
  { level: 76, kind: "foe", key: "kafile", name: "KAFİLE", desc: "Durdurulunca iki HIZLI'ya bölünür" },
  { level: 82, kind: "unit", key: "frikik", name: "FRİKİKÇİ", desc: "Falsolu sert şut: kalkanı aşar, iki rakibi deler" },
  { level: 88, kind: "unit", key: "doktor", name: "DOKTOR", desc: "Yanındaki oyuncuları iyileştirir" },
];

/** Baştan açık olanlar (tanıtım kartı yok). */
export const STARTING_UNITS = ["taraftar", "forvet"] as const;
export const STARTING_FOES = ["hucum"] as const;

const at = (key: string) => UNLOCKS.find((u) => u.key === key)?.level ?? 1e9;
const LANE6_AT = at("lane");
const CUP_AT = at("kupa");
const RAIN_AT = at("yagmur");
const MUD_AT = at("camur");
const NIGHT_AT = at("gece");

/** 10'luk testere — JS SAW ile aynı. */
const SAW = [0, -0.6, -0.4, -0.2, 0, 0.1, 0.25, 0.4, 0.55, 0.7, 0.9];

export const unlocksAt = (level: number) => UNLOCKS.filter((u) => u.level === level);

/** Zorluk (eski 20 bölümlük oyunun "bölüm" birimiyle) — JS difficulty(n). */
export function savunmaDifficulty(n: number): number {
  let d = 1 + (n - 1) * 0.19 + SAW[((n - 1) % 10) + 1];
  if (unlocksAt(n).some((u) => u.kind !== "unit")) d -= 0.4;
  return Math.round(Math.max(1, d) * 100) / 100;
}

export interface SavunmaLevel {
  n: number;
  d: number;
  waves: number;
  lanes: number;
  /** Başlangıç güneşi. */
  start: number;
  /** Rakip can çarpanı. */
  hp: number;
  /** Son hücumda kaptan var mı / kaç kaptan. */
  boss: boolean;
  kaptans: number;
  /** Kupa maçı (her 10. bölüm). */
  cup: boolean;
  rain: boolean;
  mud: boolean;
  night: boolean;
  /** Bu bölümde ilk kez görülen rakip (yoksa null). */
  newFoe: string | null;
  /** Bu bölümde açılan oyuncu kartları. */
  newCards: string[];
  news: { kind: SavunmaUnlockKind; key: string }[];
}

/** Bölüm tasarımı — games/savunma.js levelInfo(n) ile alan alan aynı. */
export function savunmaLevel(n: number): SavunmaLevel {
  const news = unlocksAt(n);
  const intro = news.length > 0;
  const d = savunmaDifficulty(n);
  const cup = n >= CUP_AT && n % 10 === 0;
  const rain = n === RAIN_AT || (n > RAIN_AT && n % 4 === 1 && !intro);
  const mud = n === MUD_AT || (n > MUD_AT && n % 5 === 2 && !intro);
  const night = n === NIGHT_AT || (n > NIGHT_AT && (n % 3 === 0 || n % 50 === 0) && !intro);
  return {
    n,
    d,
    waves: (d <= 2 ? 2 : d <= 6 ? 3 : d <= 13 ? 4 : 5) + (cup ? 1 : 0),
    lanes: n >= LANE6_AT ? 6 : 5,
    start: Math.round((150 + 15 * Math.min(d - 1, 8)) / 5) * 5 + (night ? 25 : 0),
    hp: Math.round((1 + 0.05 * (d - 1)) * 100) / 100,
    boss: n >= 3,
    cup,
    kaptans: n >= 3 ? (cup && n >= 50 ? 2 : 1) : 0,
    rain,
    mud,
    night,
    newFoe: news.find((u) => u.kind === "foe")?.key ?? null,
    newCards: news.filter((u) => u.kind === "unit").map((u) => u.key),
    news: news.map((u) => ({ kind: u.kind, key: u.key })),
  };
}

/** n. bölümde açık oyuncu kartları (tepsi sırası). */
export function unitsAt(n: number): string[] {
  return [...STARTING_UNITS, ...UNLOCKS.filter((u) => u.kind === "unit" && u.level <= n).map((u) => u.key)];
}

/** Güçlendiriciler (anahtarlar sunucu kataloğuyla aynı): gunes +150 güneş, duvar 3 bedava STOPER. */
export const SAVUNMA_SUN_BOOST = 150;
export const SAVUNMA_WALLS = 3;

/** Başlangıç penceresi: kısıt, hedefler, rozet, yenilik ipucu. */
export function goalSummary(level: number): PuzzleGoalSummary {
  const lv = savunmaLevel(Math.max(1, Math.floor(level) || 1));
  const goals: PuzzleGoalSummary["goals"] = [{ icon: "shield", label: "Dalgaları durdur", count: lv.waves }];
  if (lv.boss) goals.push({ icon: "star", label: lv.kaptans > 1 ? "Kaptanları durdur" : "Son hücumda kaptanı durdur", count: lv.kaptans });
  if (lv.rain) goals.push({ icon: "rainy", label: "Yağmur: rakipler hızlı" });
  if (lv.mud) goals.push({ icon: "water", label: "Çamurlu kareler" });
  if (lv.night) goals.push({ icon: "moon", label: "Gece maçı: koşu yolu karanlık" });
  const fresh = unlocksAt(lv.n)[0];
  const tip = fresh
    ? `${fresh.kind === "unit" ? "Yeni oyuncu" : fresh.kind === "foe" ? "Yeni rakip" : "Yeni"}: ${fresh.name} — ${fresh.desc}`
    : null;
  return {
    limit: `${lv.lanes} koridor · en çok 2 gol`,
    goals,
    badge: lv.cup ? "Kupa maçı" : (lv.n - 1) % 10 === 0 && lv.n > 1 ? "Nefes" : null,
    tip,
  };
}
