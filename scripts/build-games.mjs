/**
 * OYUN PAKETLEYİCİ — `games/*.js` kaynaklarını WebView'e verilecek tek dosya
 * HTML'lere çevirir ve `lib/game/web/games.generated.ts` dosyasına yazar.
 *
 * Çalıştırma:  npm run build:games
 *              npm run build:games -- --out <klasör>   (önizleme HTML'leri de yazar)
 *
 * NEDEN DERLEME ADIMI: oyunlar düz JS olarak yazılır (tarayıcıda doğrudan
 * çalışır, Chromium'da test edilir); uygulama ise onları `source={{ html }}`
 * ile satır içi alır — dosya sistemi/asset yolu derdi yok, Android ve iOS'ta
 * aynı davranır. Üretilen dosya depoya işlenir; `npm run check:games`
 * kaynakla eşleştiğini doğrular.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const GAMES = ["penalti", "slalom", "sektir"];
const SHARED = ["core.js", "scenery.js"];
/**
 * 3B oyunlar: WebGL (three.js) sahnesi alttaki #gl tuvaline çizilir, HUD
 * (skor, yazılar, nişan) üstteki saydam #c tuvalinde kalır. three.js
 * package.json'da sürümü SABİTLENMİŞ devDependency'dir (0.158.0, UMD derlemesi)
 * ve oyun HTML'ine satır içi gömülür: WebView çevrimdışı da açılır.
 */
const THREE_D = new Set(["penalti", "slalom", "sektir"]);
export const isThreeD = (game) => THREE_D.has(game);
export const THREE_PATH = join(root, "node_modules", "three", "build", "three.min.js");

const read = (file) => readFileSync(join(root, "games", file), "utf8");
const escape = (code) => code.replace(/<\/script/gi, "<\\/script");
// r150+ UMD derlemesi açılışta bir kullanımdan kaldırma uyarısı basar; gürültü.
const readThree = () => readFileSync(THREE_PATH, "utf8").replace(/^console\.warn\([^)]*\)/, "void 0");

/** 3B oyunlarda ortak dosyalar: futbolcu modeli verisi, kit, ortak stadyum. */
export const THREE_KIT = ["athlete-data.js", "three-kit.js", "stadium3d.js"];

/**
 * Oyun HTML'i parçalar halinde: büyük ortak parçalar (three.js, futbolcu
 * modeli) üç 3B oyunda aynıdır; modül bunları BİR kez tutar, HTML çalışma
 * anında birleştirilir (paket boyutu üç katına çıkmaz).
 */
function htmlParts(game) {
  const is3d = THREE_D.has(game);
  const own = [...SHARED, ...(is3d ? THREE_KIT : []), `${game}.js`];
  return [
    "<!doctype html>",
    '<html lang="tr"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">',
    "<style>html,body{margin:0;padding:0;height:100%;overflow:hidden;background:#050817;",
    "touch-action:none;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;",
    "-webkit-tap-highlight-color:transparent;overscroll-behavior:none}",
    "canvas{display:block;width:100vw;height:100vh;touch-action:none}",
    is3d ? "#gl,#c{position:absolute;left:0;top:0}#gl{pointer-events:none}" : "",
    "</style>",
    "</head><body>",
    is3d ? '<canvas id="gl"></canvas>' : "",
    '<canvas id="c"></canvas>',
    is3d ? "<script>window.ARENA_3D=true</script>" : "",
    is3d ? { chunk: "THREE_JS" } : "",
    ...own.map((file) => (file === "athlete-data.js" ? { chunk: "ATHLETE_JS" } : `<script>${escape(read(file))}</script>`)),
    "</body></html>",
  ];
}
const chunks = () => ({
  THREE_JS: `<script>${escape(readThree())}</script>`,
  ATHLETE_JS: `<script>${escape(read("athlete-data.js"))}</script>`,
});

export function buildHtml(game) {
  const ch = chunks();
  return htmlParts(game)
    .map((part) => (typeof part === "string" ? part : ch[part.chunk]))
    .join("");
}

export function buildModule() {
  const ch = chunks();
  const expr = (game) => {
    // ardışık düz metinleri birleştir, ortak parçaları adıyla an
    const out = [];
    for (const part of htmlParts(game).filter((p) => p !== "")) {
      if (typeof part === "string" && typeof out[out.length - 1] === "string") out[out.length - 1] += part;
      else out.push(part);
    }
    return out.map((part) => (typeof part === "string" ? JSON.stringify(part) : part.chunk)).join(" +\n    ");
  };
  const consts = Object.entries(ch)
    .map(([name, code]) => `const ${name} = ${JSON.stringify(code)};`)
    .join("\n");
  const entries = GAMES.map((game) => `  ${game}:\n    ${expr(game)},`).join("\n");
  return `/* eslint-disable */
// BU DOSYA ÜRETİLİR — elle düzenlemeyin. Kaynak: games/*.js
// Yeniden üretmek için: npm run build:games

export type WebGameKey = ${GAMES.map((g) => JSON.stringify(g)).join(" | ")};

${consts}

export const WEB_GAMES: Record<WebGameKey, string> = {
${entries}
};
`;
}

export const GENERATED_PATH = join(root, "lib", "game", "web", "games.generated.ts");

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  mkdirSync(dirname(GENERATED_PATH), { recursive: true });
  writeFileSync(GENERATED_PATH, buildModule());
  const outIdx = process.argv.indexOf("--out");
  if (outIdx > 0) {
    const out = process.argv[outIdx + 1];
    mkdirSync(out, { recursive: true });
    for (const game of GAMES) writeFileSync(join(out, `${game}.html`), buildHtml(game));
  }
  console.log(`✓ ${GAMES.length} oyun paketlendi → lib/game/web/games.generated.ts`);
}
