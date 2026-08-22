/**
 * TASARIM SİSTEMİ DENETİMİ — "bitti sayılma kriterleri"nin ölçülebilir kısmı.
 *
 * Bu script gözle bakmadan yanıtlanabilecek soruları yanıtlar:
 *   1. Metin/zemin çiftleri WCAG AA'yı geçiyor mu (her iki temada)?
 *   2. Ekranda 16px üstü tipografi var mı (skor ve sayfa başlığı hariç)?
 *   3. Kodda çıplak hex kaldı mı (alan verisi ve dış marka renkleri hariç)?
 *   4. `fontWeight` sızmış mı (özel fontlarda çalışmaz, aile adı kullanılır)?
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
    out[token] = {
      fontSize: size ? Number(size[1]) : null,
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

/** 16px tavanının meşru istisnaları: skor ölçeği + sayfa başlığı + metrik. */
const OVER_16_ALLOWED = new Set([
  "scoreHero", "scoreLg", "scoreMd", "metric",
]);

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
  if (style.fontSize > 16 && !OVER_16_ALLOWED.has(token)) {
    note(`tipografi · ${token} = ${style.fontSize}px > 16px tavanı`);
  }
  if (style.hasWeight) {
    note(`tipografi · ${token} fontWeight taşıyor; özel fontta çalışmaz, fontFamily kullan`);
  }
  if (!style.fontFamily) {
    note(`tipografi · ${token} fontFamily taşımıyor`);
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

/* ────────────────────────────────── rapor ────────────────────────────────── */

if (fails.length === 0) {
  console.log("Tasarım sistemi denetimi temiz: kontrast, punto tavanı, hex ve ağırlık kuralları geçti.");
  process.exit(0);
}
console.error(`Tasarım sistemi denetimi ${fails.length} ihlal buldu:\n`);
for (const f of fails) console.error("  · " + f);
process.exit(1);
