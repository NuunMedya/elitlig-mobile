/**
 * TASARIM SİSTEMİ DENETİMİ — "bitti sayılma kriterleri"nin ölçülebilir kısmı.
 *
 * Bu script gözle bakmadan yanıtlanabilecek soruları yanıtlar:
 *   1. Metin/zemin çiftleri WCAG AA'yı geçiyor mu (her iki temada)?
 *   2. Tipografi ölçeği sağlıklı mı (taban, tavan, monoton hiyerarşi, satır
 *      yüksekliği)?
 *   3. Kodda çıplak hex kaldı mı (alan verisi ve dış marka renkleri hariç)?
 *   4. `fontWeight` sızmış mı (özel fontlarda çalışmaz, aile adı kullanılır)?
 *   5. Emoji ikon kaldı mı (brief §9 yasağı)?
 *   6. Sonsuz döngülü animasyon kaldı mı (iskelet parıltısı hariç)?
 *   6b. Gradyanların renkleri tema tokenından mı geliyor?
 *   7. "Bir şeyler ters gitti" tarzı belirsiz hata metni kaldı mı?
 *
 * Çalıştırma:  npm run check:tokens
 * Çıkış kodu 1 ise en az bir kural ihlal edilmiştir.
 */

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { light, dark } from "../theme/palette.ts";

/**
 * Tipografi ölçeği METİN OLARAK okunur, içe aktarılmaz: `typography.ts`
 * uzantısız `./fonts` içe aktarımı yapıyor (Metro/TypeScript için doğru),
 * Node ESM ise uzantı istiyor. Denetim için ölçeğin metinden okunması yeterli
 * ve bir yükleyici kancasından çok daha az kırılgan.
 */
function readScale() {
  const src = readFileSync(new URL("../theme/typography.ts", import.meta.url), "utf8");
  const block = src.slice(src.indexOf("export const scale = {"), src.indexOf("} as const satisfies"));
  const out = {};
  for (const m of block.matchAll(/^ {2}(\w+):\s*\{([^}]*)\}/gm)) {
    const [, token, body] = m;
    const size = body.match(/fontSize:\s*(\d+)/);
    const line = body.match(/lineHeight:\s*(\d+)/);
    out[token] = {
      fontSize: size ? Number(size[1]) : null,
      lineHeight: line ? Number(line[1]) : null,
      fontFamily: /fontFamily:/.test(body) ? body.match(/fontFamily:\s*([\w.]+)/)[1] : null,
      hasWeight: /fontWeight:/.test(body),
    };
  }
  return out;
}

const scale = readScale();

/* ─────────────────────────── kontrast matematiği ─────────────────────────── */

const channel = (v) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

function luminance(hex) {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return (
    0.2126 * channel((n >> 16) & 255) +
    0.7152 * channel((n >> 8) & 255) +
    0.0722 * channel(n & 255)
  );
}

const ratio = (a, b) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

/* ───────────────────────────────── kurallar ──────────────────────────────── */

/** [ön plan, zemin, en az oran, açıklama] — 4.5 metin, 3.0 grafik/UI. */
const PAIRS = (p) => [
  [p.textPrimary, p.bg, 4.5, "birincil metin / zemin"],
  [p.textPrimary, p.surface1, 4.5, "birincil metin / kart"],
  [p.textSecondary, p.bg, 4.5, "ikincil metin / zemin"],
  [p.textSecondary, p.surface1, 4.5, "ikincil metin / kart"],
  [p.textTertiary, p.bg, 4.5, "etiket metni / zemin"],
  [p.textTertiary, p.surface1, 4.5, "etiket metni / kart"],
  [p.textOnBrand, p.brand, 4.5, "buton metni / mercan dolgu"],
  [p.onInverse, p.inverse, 4.5, "seçili chip metni / ters blok"],
  [p.textOnAccent, p.accent, 4.5, "metin / mavi dolgu"],
  [p.brandAccent, p.bg, 4.5, "mercan metin / zemin"],
  [p.brandAccent, p.surface1, 4.5, "mercan metin / kart"],
  [p.accentText, p.bg, 4.5, "mavi metin / zemin"],
  [p.live, p.bg, 3.0, "canlı halkası / zemin"],
  [p.accent, p.surface3, 3.0, "veri barı (ev) / ray"],
  [p.slate, p.surface3, 3.0, "veri barı (deplasman) / ray"],
  [p.win, p.bg, 3.0, "kazandı çipi / zemin"],
  [p.loss, p.bg, 3.0, "kaybetti çipi / zemin"],
  // Hairline için WCAG eşiği yoktur (dekoratif değil ama metin de değil).
  // 1.1 "gözle seçilebilir" alt sınırıdır; brief'in --line değeri 1.14 verir.
  [p.border, p.bg, 1.1, "hairline / zemin (görünür olmalı)"],
];

/**
 * TİPOGRAFİ ÖLÇEĞİ SAĞLIK KURALLARI.
 *
 * Eski kural "hiçbir token 16px'i geçmesin" idi ve ürünü hiyerarşisiz bir gri
 * duvara çevirdi (bkz. theme/typography.ts başlığı). Yerine ölçülebilir üç
 * gerçek kural konur:
 *   1. OKUNABİLİRLİK TABANI — hiçbir token 11px'in altına inmez; gövde ve
 *      ikincil metin sırasıyla 15 ve 13'ün altına inmez.
 *   2. TAVAN — metin 28px'i, skor 48px'i geçmez (telefonda taşar).
 *   3. HİYERARŞİ MONOTON — h1 > h2 > h3 > body olmalı; iki komşu basamak
 *      eşitse hiyerarşi değil bulanıklık üretilmiş demektir.
 *   4. SATIR YÜKSEKLİĞİ — her token lineHeight taşımalı ve punto × 1.08'in
 *      altına inmemeli (skor blokları sıkı, gövde rahat).
 */
const TEXT_MAX = 28;
const SCORE_MAX = 48;
const ABSOLUTE_MIN = 11;
/** Skor/metrik ailesi: metin tavanı bunlara uygulanmaz. */
const NUMERIC_TOKENS = new Set([
  "scoreHero", "scoreLg", "scoreMd", "scoreSm", "metric", "metricSm",
]);
/**
 * Büyükten küçüğe olması gereken PUNTO zinciri. `h4` bilerek dışarıdadır:
 * o bir punto basamağı değil, `body` ile aynı puntonun kalın kesimidir.
 */
const HIERARCHY = ["display", "h1", "h2", "h3", "body", "bodySm", "caption", "micro"];
/** Belirli tokenların taban değerleri — arayüzün okunurluğu bunlara bağlı. */
const MIN_SIZE = { body: 15, bodySm: 13, bodyLg: 15, label: 13, caption: 12 };

/** Çıplak hex'e izin verilen dosyalar ve gerekçeleri. */
const HEX_ALLOWED = {
  "app/takimim/mac/[matchId].tsx": "forma renkleri alan verisidir, token değil",
  "components/CallCenterButton.tsx": "WhatsApp kurumsal yeşili",
  "components/YoutubeBanner.tsx": "YouTube kurumsal kırmızısı",
};

/* ────────────────────────────────── denetim ──────────────────────────────── */

const fails = [];
const note = (msg) => fails.push(msg);

for (const [name, p] of [["açık", light], ["koyu", dark]]) {
  for (const [fg, bg, min, label] of PAIRS(p)) {
    const r = ratio(fg, bg);
    if (r < min) {
      note(`kontrast · ${name} tema · ${label}: ${r.toFixed(2)}:1 < ${min}:1  (${fg} / ${bg})`);
    }
  }
}

for (const [token, style] of Object.entries(scale)) {
  const max = NUMERIC_TOKENS.has(token) ? SCORE_MAX : TEXT_MAX;
  if (style.fontSize > max) {
    note(`tipografi · ${token} = ${style.fontSize}px > ${max}px tavanı`);
  }
  if (style.fontSize < ABSOLUTE_MIN) {
    note(`tipografi · ${token} = ${style.fontSize}px < ${ABSOLUTE_MIN}px okunabilirlik tabanı`);
  }
  if (token in MIN_SIZE && style.fontSize < MIN_SIZE[token]) {
    note(`tipografi · ${token} = ${style.fontSize}px < ${MIN_SIZE[token]}px (bu tokenın tabanı)`);
  }
  if (style.hasWeight) {
    note(`tipografi · ${token} fontWeight taşıyor; özel fontta çalışmaz, fontFamily kullan`);
  }
  if (!style.fontFamily) {
    note(`tipografi · ${token} fontFamily taşımıyor`);
  }
  if (!style.lineHeight) {
    note(`tipografi · ${token} lineHeight taşımıyor`);
  } else if (style.lineHeight < style.fontSize * 1.08) {
    note(
      `tipografi · ${token} lineHeight ${style.lineHeight} < punto × 1.08 (${(style.fontSize * 1.08).toFixed(1)})`,
    );
  }
}

for (let i = 1; i < HIERARCHY.length; i += 1) {
  const [big, small] = [HIERARCHY[i - 1], HIERARCHY[i]];
  if (!scale[big] || !scale[small]) continue;
  if (scale[big].fontSize <= scale[small].fontSize) {
    note(
      `tipografi · hiyerarşi kırık: ${big} (${scale[big].fontSize}) ≤ ${small} (${scale[small].fontSize})`,
    );
  }
}

const grep = (pattern, paths) => {
  try {
    return execSync(`grep -rn '${pattern}' ${paths} --include='*.tsx' --include='*.ts'`, {
      encoding: "utf8",
    }).trim().split("\n").filter(Boolean);
  } catch {
    return []; // grep eşleşme bulamazsa 1 döner
  }
};

for (const hit of grep('"#[0-9A-Fa-f]\\{3,8\\}"', "app components")) {
  const file = hit.split(":")[0];
  if (!(file in HEX_ALLOWED)) note(`çıplak hex · ${hit.trim()}`);
}

for (const hit of grep("fontWeight:", "app components theme")) {
  note(`fontWeight · ${hit.trim()}`);
}

/*
 * Emoji ikon — brief §9 yasağı.
 *
 * Aralık DAR TUTULUR: kutu çizgileri (─ ═), oklar (→) ve tipografik işaretler
 * emoji değildir ve bu kod tabanında yorum başlıklarında yoğun kullanılır.
 * Yalnız gerçek piktogram blokları taranır. Yorum içerikleri de ayıklanır —
 * bir açıklamada emojiden BAHSETMEK, emoji KULLANMAK değildir.
 */
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE0F}]/u;

/** Satırdan yorum parçalarını çıkarır; kalan şey gerçekten koddur. */
const stripComments = (line) =>
  line
    .replace(/\{?\/\*[\s\S]*?\*\/\}?/g, "")
    .replace(/\/\*.*$/, "")
    .replace(/^\s*\*.*$/, "")
    .replace(/\/\/.*$/, "");

for (const path of execSync("find app components -name '*.tsx'", { encoding: "utf8" })
  .trim()
  .split("\n")) {
  readFileSync(path, "utf8")
    .split("\n")
    .forEach((line, i) => {
      const code = stripComments(line);
      if (EMOJI.test(code)) note(`emoji ikon · ${path}:${i + 1}: ${code.trim().slice(0, 70)}`);
    });
}

/*
 * Gradient — SERBEST DEĞİL, TOKENDIR.
 *
 * Eski kural gradyanı tamamen yasaklıyor, yalnız beş dosyaya izin veriyordu;
 * sonuç hiçbir yüzeyin diğerinden ayrılmadığı düz bir arayüzdü. Yeni kural:
 * gradyan serbesttir AMA durakları TEMADAN gelmek zorundadır.
 *
 * Ölçülen şey: `colors={...}` içinde `"transparent"` dışında bir dize sabiti
 * olmamalı. Çıplak hex zaten ayrı bir kuralla yasak; ikisi birlikte "gradyan
 * durakları tema tokenıdır" garantisini verir. Ek olarak dosya `@/theme`
 * içe aktarmalıdır — yoksa duraklar tokendan gelemez.
 */
for (const hit of grep("<LinearGradient", "app components")) {
  const file = hit.split(":")[0];
  const src = readFileSync(file, "utf8");
  if (!/from "@\/theme"/.test(src)) {
    note(`gradient · ${file}: @/theme içe aktarmıyor, durakları tokendan gelemez`);
    continue;
  }
  for (const prop of src.matchAll(/colors=\{([^}]*)\}/g)) {
    const literals = prop[1].match(/"[^"]*"/g) ?? [];
    const bad = literals.filter((lit) => lit !== '"transparent"');
    if (bad.length) {
      note(`gradient · ${file}: durak dize sabiti ${bad.join(", ")} — tema tokenı kullan`);
    }
  }
}

/* Sonsuz animasyon döngüsü — yalnız iskelet parıltısı meşru. */
for (const hit of grep("Animated.loop", "app components")) {
  const [file] = hit.split(":");
  if (file.endsWith("Skeleton.tsx")) continue;
  // `iterations` verilmişse döngü sonludur (gol parlaması gibi) — sorun değil.
  if (/iterations/.test(hit)) continue;
  note(`sonsuz animasyon · ${hit.trim()}`);
}

/* Belirsiz hata metni — brief §9. */
for (const hit of grep("ters gitti\\|Beklenmeyen bir hata\\|Bir sorun oldu", "app components lib")) {
  const trimmed = hit.trim();
  if (/^\S+:\d+:\s*\*/.test(trimmed)) continue; // yorum satırı
  note(`belirsiz hata metni · ${trimmed.slice(0, 90)}`);
}

/* ────────────────────────────────── rapor ────────────────────────────────── */

if (fails.length === 0) {
  console.log("Tasarım sistemi denetimi temiz: kontrast, tipografi ölçeği, hex, ağırlık ve gradyan kuralları geçti.");
  process.exit(0);
}
console.error(`Tasarım sistemi denetimi ${fails.length} ihlal buldu:\n`);
for (const f of fails) console.error("  · " + f);
process.exit(1);
