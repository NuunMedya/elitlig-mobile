/**
 * KARİYER YOLU — seviye üretimi, özellikler, antrenman kartları ve reyting.
 *
 * 2026-11 YENİLEMESİ: beş basamaklı, 120 seviyelik kariyer (sonrası "Elit
 * Lig"de zorlaşarak sürer). Bu dosya BAĞIMSIZDIR (içe aktarım yok): seviye
 * denetimi node ile doğrudan yükleyebilsin diye seededRandom kopyalandı
 * (lib/puzzle/types.ts ile birebir aynı).
 *
 * SEVİYE = MAÇ GÜNÜ. Maç baştan sona oynanmaz; oyuncunun topla buluştuğu
 * 2–6 "an" oynanır. Seviye üretimi belirlenimcidir: aynı seviye her cihazda
 * aynı anları üretir (Lig Yolu kuralı; lib/puzzle/types.ts).
 *
 * BASAMAKLAR (her biri 24 maç):
 *     1–24   Mahalle Sahası   temel anlar öğretilir
 *    25–48   Amatör Lig       kafa vuruşu, rüzgâr, çamur, kayan müdahale
 *    49–72   Bölgesel Lig     ofsayt çizgisi, hareketli baraj, yağmur
 *    73–96   Süper Amatör     usta kaleci, daha kalabalık savunma
 *    97–120  Elit Lig         her şey bir arada; sonrası sonsuz zorlaşır
 *
 * AN TÜRLERİ (ilk göründüğü seviye — o seviyede İLK an olarak oynanır):
 *     şut 1 · pas 4 · çalım 8 · penaltı 13 · frikik 19 · kafa 27
 * ENGELLER / KOŞULLAR (ilk göründüğü seviye — o seviyede en az bir anda):
 *     rüzgâr 33 · çamur 40 · kayan müdahale 46 · ofsayt çizgisi 55 ·
 *     hareketli baraj 63 · yağmur 70 · usta kaleci 80
 * Her 10. seviye "kupa maçı"dır (bir an fazla, eşik yüksek); 5'in katları
 * "nefes" maçıdır (biraz kolay). Zorluk dalgalı artar.
 *
 * ÖZELLİKLER (0–99): şut, pas, teknik, hız — anların fiziğini gerçekten
 * değiştirir (lib/kariyer/sim.ts).
 *
 * GELİŞİM: kazanılan her yıldız bir antrenman puanıdır. Maç öncesi üç karttan
 * biri seçilir; kart puanı özelliklere dağıtır (lib/kariyer/progress.ts).
 */

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

export type MomentKind = "shot" | "pass" | "dribble" | "penalty" | "freekick" | "header";
export type AttrKey = "sut" | "pas" | "teknik" | "hiz";
export type Attrs = Record<AttrKey, number>;
/** Oyuncunun hattı: gerçek profil bağlıysa mevkiden gelir. */
export type Line = "GK" | "DEF" | "MID" | "FWD";

export const ATTR_LABELS: Record<AttrKey, string> = { sut: "Şut", pas: "Pas", teknik: "Teknik", hiz: "Hız" };
export const ATTR_ICONS: Record<AttrKey, string> = { sut: "football", pas: "swap-horizontal", teknik: "sparkles", hiz: "flash" };
export const ATTR_KEYS: AttrKey[] = ["sut", "pas", "teknik", "hiz"];
export const ATTR_MAX = 99;

/** Kariyerin "tamamlanan" bölümü (harita ve rozetler için); üretici sonrasında da çalışır. */
export const KARIYER_LEVEL_COUNT = 120;

export const MOMENT_KINDS: MomentKind[] = ["shot", "pass", "dribble", "penalty", "freekick", "header"];
export const MOMENT_LABELS: Record<MomentKind, string> = {
  shot: "Şut",
  pass: "Pas",
  dribble: "Çalım",
  penalty: "Penaltı",
  freekick: "Frikik",
  header: "Kafa",
};
export const MOMENT_ICONS: Record<MomentKind, string> = {
  shot: "football",
  pass: "swap-horizontal",
  dribble: "walk",
  penalty: "locate",
  freekick: "git-merge",
  header: "body",
};
export const MOMENT_HINTS: Record<MomentKind, string> = {
  shot: "Parmağını kaleye doğru çek ve bırak. Uzun çekiş sert şut demek; kalecinin uzağına nişan al.",
  pass: "Koşan arkadaşının ÖNÜNE doğru çek ve bırak. Top oraya vardığında o da orada olmalı.",
  dribble: "Parmağını basılı tutup sağa sola kaydır; savunmacılara çarpmadan çizgiye ulaş.",
  penalty: "Kaleci bir köşeye atlayacak. Direğin dibine sert vur; ortaya vurursan kaleci kalırsa tutar.",
  freekick: "Baraj önünde! Parmağını EĞRİ çizerek çek: kavis topu barajın yanından döndürür. Kaleci uzak köşeyi tutar; kavisli top onu ters köşede bırakır.",
  header: "Orta geliyor! Top başının üstündeki halkaya girdiğinde ekrana dokun; dokunduğun yöne vurursun.",
};
/** An başına kısa kural rozeti (tanıtım kartında). */
export const MOMENT_RULES: Record<MomentKind, string> = {
  shot: "Çek · bırak",
  pass: "Önüne at",
  dribble: "Basılı tut · kaydır",
  penalty: "Köşeye vur",
  freekick: "Kavisli çek",
  header: "Zamanında dokun",
};

/* ───────────────────────────── engeller ───────────────────────────── */

export const MOD_WIND = 1;
export const MOD_MUD = 2;
export const MOD_SLIDE = 4;
export const MOD_OFFSIDE = 8;
export const MOD_WALLMOVE = 16;
export const MOD_RAIN = 32;
export const MOD_ACE = 64;

export interface ModDef {
  bit: number;
  key: string;
  label: string;
  icon: string;
  unlock: number;
  /** Hangi anlara uygulanabilir. */
  kinds: MomentKind[];
  tip: string;
}

export const MODS: ModDef[] = [
  {
    bit: MOD_WIND,
    key: "ruzgar",
    label: "Rüzgâr",
    icon: "flag",
    unlock: 33,
    kinds: ["shot", "pass", "freekick", "header"],
    tip: "Rüzgârlı hava! Sol üstteki bayrak rüzgârın yönünü ve gücünü gösterir; top havada o yöne kayar, ters tarafa nişan al.",
  },
  {
    bit: MOD_MUD,
    key: "camur",
    label: "Çamur",
    icon: "water",
    unlock: 40,
    kinds: ["dribble"],
    tip: "Çamurlu saha: kahverengi birikintilere basınca yavaşlarsın. Çamurun etrafından dolaş.",
  },
  {
    bit: MOD_SLIDE,
    key: "kayan",
    label: "Kayan müdahale",
    icon: "flash",
    unlock: 46,
    kinds: ["dribble"],
    tip: "Kayan müdahale: kırmızı oklu savunmacı yaklaşınca sana doğru kayar. Son anda ters yöne kaç.",
  },
  {
    bit: MOD_OFFSIDE,
    key: "ofsayt",
    label: "Ofsayt çizgisi",
    icon: "remove",
    unlock: 55,
    kinds: ["pass"],
    tip: "Ofsayt çizgisi: arkadaşın sarı çizgiyi geçmeden pasını at. Geç kalırsan bayrak kalkar!",
  },
  {
    bit: MOD_WALLMOVE,
    key: "baraj",
    label: "Hareketli baraj",
    icon: "people",
    unlock: 63,
    kinds: ["freekick"],
    tip: "Baraj kayıyor! Barajın açtığı boşluğu kolla ya da kavisi büyüt.",
  },
  {
    bit: MOD_RAIN,
    key: "yagmur",
    label: "Yağmur",
    icon: "rainy",
    unlock: 70,
    kinds: ["shot", "pass", "dribble", "header", "penalty"],
    tip: "Yağmur başladı: ıslak zeminde top kayar, çalımda durmak zorlaşır. Hareketlerini erken yap.",
  },
  {
    bit: MOD_ACE,
    key: "usta",
    label: "Usta kaleci",
    icon: "hand-left",
    unlock: 80,
    kinds: ["shot", "penalty", "freekick", "header"],
    tip: "Usta kaleci: şutunu okur ve daha geniş uzanır. Ters köşe ve direk dibi şart.",
  },
];

const RAIN_KINDS = MODS.find((m) => m.bit === MOD_RAIN)?.kinds ?? [];

export const modLabels = (mods: number) => MODS.filter((m) => mods & m.bit).map((m) => m.label);

/* ───────────────────────────── seviye ───────────────────────────── */

export interface MomentDef {
  kind: MomentKind;
  /** Maç dakikası (yalnız anlatım). */
  minute: number;
  /** Anın kısa hikâyesi ("Ceza sahası dışında top sende!"). */
  story: string;
  /** 0–1: basamak ve seviyeye göre artan zorluk. */
  difficulty: number;
  /** Rakip sayısı (baraj, araya giren, karşıdan gelen). */
  rivals: number;
  /** Engel bit maskesi (MOD_*). */
  mods: number;
  /** Rüzgâr: −1 (sola) … 1 (sağa); rüzgâr yoksa 0. */
  wind: number;
  /** Anın tohumu: yerleşimler buradan türetilir. */
  seed: number;
}

export interface KariyerLevel {
  level: number;
  tier: number;
  tierName: string;
  /** Basamak içindeki maç sırası (1–24). */
  matchNo: number;
  opponent: string;
  cup: boolean;
  breather: boolean;
  moments: MomentDef[];
  /** Kazanmak ve yıldızlar için reyting eşikleri. */
  pass: number;
  star2: number;
  star3: number;
  /** Bu seviyede tanıtılan yenilik (ilk görüldüğü seviye). */
  tip: string | null;
  /** Bu maçta görülen engellerin birleşimi. */
  mods: number;
}

export const TIER_NAMES = ["Mahalle Sahası", "Amatör Lig", "Bölgesel Lig", "Süper Amatör", "Elit Lig"];
export const TIER_SIZE = 24;
export const tierOf = (level: number) => Math.min(TIER_NAMES.length, Math.floor((Math.max(1, level) - 1) / TIER_SIZE) + 1);

/** An türünün ilk göründüğü seviye. */
export const MOMENT_UNLOCK: Record<MomentKind, number> = { shot: 1, pass: 4, dribble: 8, penalty: 13, freekick: 19, header: 27 };

const OPPONENTS = [
  ["Yokuşbaşı Gençlik", "Çınaraltı Spor", "Sokak Yıldızları", "Arka Mahalle FK", "Pazar Yeri SK", "Köprüaltı United", "Bakkal Amca FC", "Otopark Gücü", "Parkspor", "Apartman Birliği"],
  ["Kuzey Yıldızı SK", "Demirspor", "Sanayi Gücü", "Çamlık FK", "Yeni Mahalle Spor", "Altınordu Gençlik", "Kartal Yuvası", "Liman SK", "Tepebaşı FK", "Gençlerbirliği Amatör"],
  ["Ege Rüzgârı SK", "Karadeniz Fırtınası", "Toros Gücü", "Anadolu Kartalları", "Marmara Yıldızı", "Fırat Spor", "Kapadokya FK", "Trakya Gençlik", "Çukurova Spor", "Göller Bölgesi SK"],
  ["Başkent Gücü", "Boğaziçi Spor", "Akdeniz Yıldızları", "Uludağ FK", "Erciyes Spor", "Ağrı Dağı Gençlik", "Kızılırmak SK", "Palandöken FK", "Munzur Spor", "Kaçkar Gücü"],
  ["Elit Kartallar", "Altın Aslanlar", "Yıldızlar Karması", "Şampiyonlar SK", "Efsaneler FK", "Kupa Avcıları", "Zirve Spor", "Taç Gücü", "Galibiyet SK", "Final Spor"],
];

const STORIES: Record<MomentKind, string[]> = {
  shot: ["Ceza sahası dışında top sende!", "Kaleciyle karşı karşıyasın!", "Seken top önüne düştü!", "Son dakika, vur gitsin!", "Savunma açıldı, şut çek!"],
  pass: ["Arkadaşın boşa koşuyor, gör onu!", "Ara pası zamanı!", "Kanat boşaldı, at koşsun!", "Kontra atak, çabuk oyna!", "Savunmanın arkası boş!"],
  dribble: ["Önün açık, sür topu!", "İki kişi üstüne geliyor!", "Çizgiye in, geç adamını!", "Orta sahada tek başınasın!", "Pres var, sıyrıl!"],
  penalty: ["Penaltı! Topun başındasın.", "Hakem beyaz noktayı gösterdi!", "Tribünler nefesini tuttu: penaltı!", "Kaptan topu sana verdi!"],
  freekick: ["Frikik! Baraj kuruldu.", "Ceza sahası yayında serbest vuruş!", "Tehlikeli bölgede frikik!", "Barajın arkasında kaleci bekliyor."],
  header: ["Köşe vuruşu! Orta geliyor.", "Kanattan ortaya kafa vur!", "Arka direğe orta!", "Duran top: yüksel ve vur!"],
};

/** Hatta göre an ağırlıkları: forvet daha çok şut çeker, orta saha pas atar. */
const LINE_WEIGHTS: Record<Line, Record<MomentKind, number>> = {
  FWD: { shot: 5, pass: 2, dribble: 3, penalty: 1, freekick: 1, header: 2 },
  MID: { shot: 3, pass: 5, dribble: 3, penalty: 1, freekick: 2, header: 1 },
  DEF: { shot: 2, pass: 5, dribble: 2, penalty: 1, freekick: 1, header: 3 },
  GK: { shot: 2, pass: 6, dribble: 2, penalty: 2, freekick: 1, header: 1 },
};

const SCORING: MomentKind[] = ["shot", "penalty", "freekick", "header"];

/** Seviye ipuçları: an ve engel tanıtımları + basamak geçişleri. */
function tipFor(lv: number): string | null {
  const kind = MOMENT_KINDS.find((k) => MOMENT_UNLOCK[k] === lv && lv > 1);
  if (lv === 1) return MOMENT_HINTS.shot;
  if (lv === 2) return "Kaleci topun gittiği yöne yürür. Onun uzağına, direğin dibine nişan al.";
  if (kind) return `Yeni an: ${MOMENT_LABELS[kind]}! ${MOMENT_HINTS[kind]}`;
  const mod = MODS.find((m) => m.unlock === lv);
  if (mod) return mod.tip;
  const tier = tierOf(lv);
  if (lv > 1 && lv <= TIER_NAMES.length * TIER_SIZE && (lv - 1) % TIER_SIZE === 0) return `${TIER_NAMES[tier - 1]}'e yükseldin! Rakipler daha hızlı, kaleciler daha usta.`;
  if (lv === 10) return "Kupa maçı: bir an fazla oynanır ve reyting eşiği yüksektir.";
  return null;
}

function pick<T>(rnd: () => number, list: T[]): T {
  return list[Math.floor(rnd() * list.length) % list.length];
}

export function generateKariyerLevel(level: number, line: Line = "FWD"): KariyerLevel {
  const lv = Math.max(1, Math.floor(level));
  const tier = tierOf(lv);
  const matchNo = lv > TIER_NAMES.length * TIER_SIZE ? ((lv - 1) % TIER_SIZE) + 1 : lv - (tier - 1) * TIER_SIZE;
  const rnd = seededRandom(lv * 7919 + 4201);
  const cup = lv % 10 === 0;
  const breather = !cup && lv % 5 === 0;

  // Zorluk: basamak tabanı + basamak içi ilerleme + 120 sonrası yavaş artış.
  const beyond = Math.max(0, lv - TIER_NAMES.length * TIER_SIZE);
  const base = 0.05 + (tier - 1) * 0.16 + ((matchNo - 1) / (TIER_SIZE - 1)) * 0.15 + beyond * 0.0025;
  const wave = cup ? 0.1 : breather ? -0.08 : (rnd() - 0.5) * 0.07;
  const difficulty = Math.max(0.04, Math.min(1, base + wave));

  const open = MOMENT_KINDS.filter((kind) => MOMENT_UNLOCK[kind] <= lv);
  let count = lv <= 3 ? 2 : lv <= 12 ? 3 : lv <= 48 ? 4 : lv <= 96 ? 4 + (matchNo > 12 ? 1 : 0) : 5;
  if (cup) count += 1;
  if (breather) count = Math.max(2, count - 1);
  count = Math.min(6, count);

  const weights = LINE_WEIGHTS[line] ?? LINE_WEIGHTS.FWD;
  const kinds: MomentKind[] = [];
  // Yeni açılan an o seviyede mutlaka ilk an olarak oynanır.
  const fresh = open.find((kind) => MOMENT_UNLOCK[kind] === lv && lv > 1);
  if (fresh) kinds.push(fresh);
  // Bir önceki seviyede açılan an tekrar gelir (pekiştirme).
  const recent = open.find((kind) => MOMENT_UNLOCK[kind] === lv - 1 && lv > 2);
  if (recent && kinds.length < count) kinds.push(recent);
  let guard = 0;
  while (kinds.length < count && guard < 200) {
    guard += 1;
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
    const n = kinds.length;
    // Üç kez üst üste aynı an gelmesin; penaltı maçta en çok bir kez.
    if (n >= 2 && kinds[n - 1] === chosen && kinds[n - 2] === chosen && open.length > 1) continue;
    if (chosen === "penalty" && kinds.includes("penalty")) continue;
    kinds.push(chosen);
  }
  // Maç her zaman gol fırsatıyla biter (son söz gol olsun).
  if (lv > 2 && !SCORING.includes(kinds[kinds.length - 1])) {
    kinds[kinds.length - 1] = kinds.includes("penalty") || lv < MOMENT_UNLOCK.penalty ? "shot" : rnd() < 0.5 ? "shot" : "penalty";
  }

  // Engeller: açılmış olanlar zorlukla artan olasılıkla; yeni açılan engel
  // o seviyede uygun ilk ana mutlaka konur.
  const openMods = MODS.filter((m) => m.unlock <= lv);
  const freshMod = MODS.find((m) => m.unlock === lv);
  // Yeni engelin uygulanacağı bir an yoksa ilk (yeni an olmayan) an ona uygun türe döner.
  if (freshMod && !kinds.some((kind) => freshMod.kinds.includes(kind))) {
    const at = fresh ? Math.min(1, kinds.length - 1) : 0;
    kinds[at] = freshMod.kinds.find((kind) => MOMENT_UNLOCK[kind] <= lv) ?? kinds[at];
  }
  let modsUsed = 0;
  const moments: MomentDef[] = kinds.map((kind, index) => {
    const step = (index + 1) / (kinds.length + 1);
    const d = Math.max(0.03, Math.min(1, difficulty + (index / Math.max(1, kinds.length - 1) - 0.5) * 0.1));
    let mods = 0;
    for (const m of openMods) {
      if (!m.kinds.includes(kind)) continue;
      const age = lv - m.unlock;
      const chance = Math.min(0.55, 0.18 + age * 0.006) * (breather ? 0.5 : 1);
      if (rnd() < chance) mods |= m.bit;
    }
    if (freshMod && freshMod.kinds.includes(kind) && !(modsUsed & freshMod.bit)) mods |= freshMod.bit;
    // Yağmur maç boyu sürer: bir anda yağıyorsa sonrakilerde de yağar.
    if (modsUsed & MOD_RAIN && RAIN_KINDS.includes(kind)) mods |= MOD_RAIN;
    modsUsed |= mods;
    const rivals =
      kind === "shot"
        ? d < 0.2 ? 0 : d < 0.55 ? 1 : 2
        : kind === "pass"
          ? d < 0.18 ? 1 : d < 0.5 ? 2 : 3
          : kind === "dribble"
            ? d < 0.3 ? 5 : d < 0.6 ? 7 : 9
            : kind === "freekick"
              ? d < 0.3 ? 2 : d < 0.65 ? 3 : 4
              : kind === "header"
                ? d < 0.4 ? 0 : 1
                : 0;
    const wind = mods & MOD_WIND ? (rnd() < 0.5 ? -1 : 1) * (0.4 + rnd() * 0.6) * (0.6 + d * 0.4) : 0;
    return {
      kind,
      minute: Math.max(3, Math.min(90, Math.round(step * 88 + (rnd() - 0.5) * 8))),
      story: pick(rnd, STORIES[kind]),
      difficulty: d,
      rivals,
      mods,
      wind: Math.round(wind * 100) / 100,
      seed: Math.floor(rnd() * 1e9),
    };
  });

  const pass = cup ? 6.6 + Math.min(0.4, difficulty * 0.4) : breather ? 5.9 : 6.1 + difficulty * 0.45;
  return {
    level: lv,
    tier,
    tierName: TIER_NAMES[tier - 1],
    matchNo,
    opponent: pick(rnd, OPPONENTS[tier - 1]),
    cup,
    breather,
    moments,
    pass: Math.round(pass * 10) / 10,
    star2: Math.round((pass + 1.1) * 10) / 10,
    star3: Math.round(Math.min(9.4, pass + 2.2) * 10) / 10,
    tip: tipFor(lv),
    mods: modsUsed,
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

/** An skorunun notu (tanıtım/sonuç rozetleri için). */
export function gradeOf(score: number): { label: string; stars: 0 | 1 | 2 | 3 } {
  if (score >= 0.95) return { label: "Kusursuz", stars: 3 };
  if (score >= 0.7) return { label: "Çok iyi", stars: 2 };
  if (score >= 0.4) return { label: "İdare eder", stars: 1 };
  return { label: "Kaçtı", stars: 0 };
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
  { key: "duran_top", title: "Duran top", description: "Frikik ve penaltı tekrarı.", icon: "git-merge", gains: { sut: 2, pas: 1 } },
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
