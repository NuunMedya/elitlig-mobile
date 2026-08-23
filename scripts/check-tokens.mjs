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

/**
 * Rengi [r, g, b, a] dizisine çevirir. Hem `#RGB`/`#RRGGBB` hem
 * `rgba(r, g, b, a)` kabul eder.
 *
 * NEDEN rgba DESTEĞİ GEREKTİ: palet, koyu blok üstündeki sönük metinleri
 * (`onDarkMuted`, `chalk`, `glassBorder`) bilerek YARI SAYDAM tutuyor — koyu
 * yüzeyin tonu değiştiğinde bunlar kendiliğinden uyum sağlasın diye. Ama
 * `luminance` yalnız hex okuyordu ve `parseInt("rgba(...)", 16)` NaN veriyor:
 * yarı saydam bir rengi denetime sokan her çift SESSİZCE anlamsız bir sayı
 * üretiyordu. Yani denetim, tam da en kırılgan renkleri ölçemiyordu.
 */
function toRgba(color) {
  const value = String(color).trim();
  const fn = value.match(/^rgba?\(([^)]+)\)$/i);
  if (fn) {
    const parts = fn[1].split(",").map((piece) => Number(piece.trim()));
    return [parts[0] || 0, parts[1] || 0, parts[2] || 0, parts.length > 3 ? parts[3] : 1];
  }
  const h = value.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  if (!Number.isFinite(n)) throw new Error(`okunamayan renk: ${value}`);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
}

/** Yarı saydam ön planı zemine yedirir — gerçekte gözün gördüğü renk budur. */
function composite(fg, bg) {
  const [fr, fg2, fb, fa] = toRgba(fg);
  const [br, bg2, bb] = toRgba(bg);
  if (fa >= 1) return [fr, fg2, fb];
  return [
    fr * fa + br * (1 - fa),
    fg2 * fa + bg2 * (1 - fa),
    fb * fa + bb * (1 - fa),
  ];
}

function luminance(color, over) {
  const [r, g, b] = over ? composite(color, over) : toRgba(color);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

const ratio = (a, b) => {
  // Zeminin kendisi saydamsa ölçülemez; palette zeminler daima opaktır.
  const [x, y] = [luminance(a, b), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

/* ───────────────────────────────── kurallar ──────────────────────────────── */

/** [ön plan, zemin, en az oran, açıklama] — 4.5 metin, 3.0 grafik/UI. */
const PAIRS = (p) => [
  [p.textPrimary, p.bg, 4.5, "birincil metin / zemin"],
  [p.textPrimary, p.surface1, 4.5, "birincil metin / kart"],
  [p.textSecondary, p.bg, 4.5, "ikincil metin / zemin"],
  [p.textSecondary, p.surface1, 4.5, "ikincil metin / kart"],
  [p.textSecondary, p.gradientCard[1], 4.5, "ikincil metin / kart gradyanının koyu ucu"],
  [p.textTertiary, p.bg, 4.5, "etiket metni / zemin"],
  [p.textTertiary, p.surface1, 4.5, "etiket metni / kart"],
  [p.textOnBrand, p.brand, 4.5, "buton metni / mor dolgu"],
  [p.textOnBrand, p.gradientBrand[0], 4.5, "buton metni / mor gradyanın açık ucu"],
  [p.onInverse, p.inverse, 4.5, "seçili chip metni / ters blok"],
  [p.textOnAccent, p.accent, 4.5, "metin / mavi dolgu"],
  [p.brandAccent, p.bg, 4.5, "marka metni / zemin"],
  [p.brandAccent, p.surface1, 4.5, "marka metni / kart"],
  [p.accentText, p.bg, 4.5, "mavi metin / zemin"],
  [p.live, p.bg, 3.0, "canlı halkası / zemin"],
  // Mürekkep blok iki temada da koyudur; üstündeki metin onun karanlık
  // durağına göre ölçülür.
  [p.liveOnDark, p.gradientInk[0], 4.5, "canlı metni / mürekkep blok"],
  [p.onDark, p.gradientInk[0], 4.5, "blok metni / mürekkep blok"],
  [p.onDark, p.inkBlock, 4.5, "blok metni / düz mürekkep yüzey"],
  [p.liveOnDark, p.inkBlock, 4.5, "canlı metni / düz mürekkep yüzey"],
  [p.brandOnDark, p.gradientInk[0], 4.5, "marka etiketi / mürekkep blok"],
  [p.brandOnDark, p.inkBlock, 4.5, "marka etiketi / düz mürekkep yüzey"],
  [p.textPrimary, p.gradientCard[1], 4.5, "birincil metin / kart gradyanının koyu ucu"],
  [p.textTertiary, p.gradientCard[1], 4.5, "etiket metni / kart gradyanının koyu ucu"],
  [p.onPitch, p.gradientPitch[0], 4.5, "oyuncu adı / saha"],

  /* MAÇ ATMOSFERİ. Başlık şeridi ve skor tablosunun künyesi, sahnenin en üst
     (en koyu) bölgesinin üstünde duruyor ve METNİ BEYAZ. Taban rengi bir tık
     açılırsa maç detayının başlığı okunmaz olur — üstelik bu, yalnız kapak
     fotoğrafı olan maçlarda fark edilirdi. Taban burada ölçülür. */
  [p.onDark, p.matchTint, 4.5, "başlık metni / maç atmosferi"],
  [p.onDarkMuted, p.matchTint, 3.0, "başlık alt metni / maç atmosferi"],
  [p.brandOnDark, p.matchTint, 3.0, "marka etiketi / maç atmosferi"],
  /* Sahne kâğıdı, kartların (beyaz/mürekkep) üstünde durduğu zemin. */
  [p.textPrimary, p.matchCanvas, 4.5, "birincil metin / maç kâğıdı"],
  [p.textSecondary, p.matchCanvas, 4.5, "ikincil metin / maç kâğıdı"],
  [p.textTertiary, p.matchCanvas, 4.5, "üçüncül metin / maç kâğıdı"],
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
 *   1. OKUNABİLİRLİK TABANI — hiçbir token 9px'in altına inmez; gövde ve
 *      ikincil metin sırasıyla 11 ve 10'un altına inmez. 8px'e YALNIZ
 *      büyük-harf rozet/etiket tokenları (`micro`, `overline`) inebilir:
 *      büyük harf, o puntoda okunurluğu ayakta tutan şeydir. Daha aşağısı
 *      Türkçe için çalışmaz — ğ/ş kancası ve İ noktası kayboluyor.
 *   2. TAVAN — metin 28px'i, skor 48px'i geçmez (telefonda taşar).
 *   3. HİYERARŞİ MONOTON — h1 > h2 > h3 > body olmalı; iki komşu basamak
 *      eşitse hiyerarşi değil bulanıklık üretilmiş demektir.
 *   4. SATIR YÜKSEKLİĞİ — her token lineHeight taşımalı ve punto × 1.08'in
 *      altına inmemeli (skor blokları sıkı, gövde rahat).
 */
const TEXT_MAX = 28;
const SCORE_MAX = 48;
const ABSOLUTE_MIN = 9;
/** 10px'e inmesine izin verilen tokenlar — daima büyük harf kullanılırlar. */
const UPPERCASE_TOKENS = new Set(["micro", "overline"]);
const UPPERCASE_MIN = 8;
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
const MIN_SIZE = { body: 11, bodySm: 10, bodyLg: 11, label: 11, caption: 9 };

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
  const min = UPPERCASE_TOKENS.has(token) ? UPPERCASE_MIN : ABSOLUTE_MIN;
  if (style.fontSize < min) {
    note(`tipografi · ${token} = ${style.fontSize}px < ${min}px okunabilirlik tabanı`);
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
  } else if (style.lineHeight < Math.ceil(style.fontSize * 1.08)) {
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

/*
 * Gradyan EKSENİ — YATAY ve SAĞDAN SOLA.
 *
 * Köşegen ışık (0,0 → 1,1) ve dikey geçiş, dikdörtgen bir yüzeyi silindire
 * çevirir: kart "boru" gibi görünür. Ayrıca aynı ekranda iki farklı eksen
 * varsa göz iki ayrı ışık kaynağı okur ve yüzeyler birbirine ait görünmez.
 *
 * KURAL YALNIZ YÜZEY GRADYANLARINA BAKAR: `colors={colors.gradient*}` ile
 * boyanan kart/blok/dolgu yüzeyleri. Gradyanın başka meşru işleri de var ve
 * onların ekseni işlerinden gelir, bu kuraldan değil:
 *   · okunabilirlik scrim'i (manşet görselinin üstü) → DİKEY olmak zorunda
 *   · kaydırma kenarı maskesi (tarih şeridi) → kaydırma yönünde olmak zorunda
 *   · iskelet parıltısı → süpürme yönünde
 * Bunlar `colors.gradient*` kullanmadığı için kuralın dışında kalır; muafiyet
 * listesi tutmaya gerek yok.
 *
 * Muafiyet gereken tek yüzey SAHA: `gradientPitch` dikey uygulanır, çünkü
 * oradaki geçiş ışık değil DERİNLİKtir (uzak kale ucu açık, yakın uç koyu).
 */
const PITCH_SURFACE = /colors\.gradientPitch/;
const POINT = /const\s+(\w+)\s*=\s*\{\s*x:\s*([\d.]+),\s*y:\s*([\d.]+)\s*\}/g;
const SURFACE_GRADIENT =
  /<LinearGradient\b[^>]*?colors=\{(colors\.gradient\w+)\}[^>]*?start=\{(\w+)\}[^>]*?end=\{(\w+)\}/gs;

for (const file of new Set(grep("<LinearGradient", "app components").map((h) => h.split(":")[0]))) {
  const src = readFileSync(file, "utf8");
  const points = new Map();
  for (const m of src.matchAll(POINT)) points.set(m[1], { x: Number(m[2]), y: Number(m[3]) });

  for (const use of src.matchAll(SURFACE_GRADIENT)) {
    const [, token, startName, endName] = use;
    if (PITCH_SURFACE.test(token)) continue; // saha: dikey geçiş derinliktir
    const start = points.get(startName);
    const end = points.get(endName);
    if (!start || !end) continue; // satır içi nokta — ayrı kural yok, atla
    if (start.y !== 0.5 || end.y !== 0.5) {
      note(
        `gradient ekseni · ${file}: ${token} dikey/köşegen ` +
          `(y ${start.y}→${end.y}) — yüzey gradyanı yatay olmalı`,
      );
    } else if (!(start.x > end.x)) {
      note(
        `gradient ekseni · ${file}: ${token} soldan sağa ` +
          `(x ${start.x}→${end.x}) — sağdan sola olmalı`,
      );
    }
  }
}

/*
 * YARIÇAP TOKENDIR — çıplak sayı yasak.
 *
 * Ürünün en belirgin imzası köşe yarıçapı; ölçeği bir kez büyüttük ve bir
 * daha tek tek dosyalardan kaçmasın diye burada bağlıyoruz. `borderRadius: 8`
 * gibi elle yazılmış bir değer, ölçek değiştiğinde geride kalır ve o tek
 * bileşen bütün sistemden farklı bir eğri taşır — "kavisli tasarım" hissini
 * bozan tam olarak budur.
 *
 * MEŞRU İSTİSNA: hesaplanmış yarıçaplar (`radius.xxl - inset`, `size / 2`,
 * `(AVATAR + 4) / 2`) ve daireyi kuran yarım-ölçü değerler. Kural yalnız
 * ÇIPLAK SAYI sabitlerine bakar.
 */
const RADIUS_LITERAL = /border(?:Top|Bottom)?(?:Left|Right)?Radius:\s*(\d+(?:\.\d+)?)\s*[,\n]/g;
/*
 * MİKRO ŞEKİLLER MUAF (≤ 4px). 4px'in altındaki yarıçap bir "köşe kararı"
 * değildir: 4px'lik bir noktayı ya da 3px'lik bir rayı yuvarlayan değer,
 * şeklin KENDİ ölçüsünden gelir ve ölçek büyüdüğünde büyümesi de gerekmez.
 *
 * `ShareScoreCard` tümüyle muaf: dışa aktarılan PNG'nin geometrisi bilerek
 * DONDURULDU (bkz. dosya başlığı). Şablon her paylaşımda birebir aynı
 * görünmeli; uygulama ölçeği değiştiğinde kartın oranları kaymamalı.
 */
const RADIUS_MAX_FREE = 4;
const RADIUS_EXEMPT = new Set(["components/ShareScoreCard.tsx"]);

for (const hit of grep("Radius: [0-9]", "app components")) {
  const [file, line, ...rest] = hit.split(":");
  const text = rest.join(":");
  const match = /border(?:Top|Bottom)?(?:Left|Right)?Radius:\s*(\d+(?:\.\d+)?)\s*[,;]?\s*$/.exec(
    text.trim(),
  );
  if (!match) continue;
  if (RADIUS_EXEMPT.has(file)) continue;
  if (Number(match[1]) <= RADIUS_MAX_FREE) continue;
  note(`yarıçap · ${file}:${line} — borderRadius: ${match[1]} çıplak sayı, \`radius.*\` kullan`);
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
