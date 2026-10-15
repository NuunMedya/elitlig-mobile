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

export function buildHtml(game) {
  const is3d = THREE_D.has(game);
  const scripts = [...SHARED, ...(is3d ? ["three-kit.js"] : []), `${game}.js`].map((file) => escape(read(file)));
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
    is3d ? `<script>${escape(readThree())}</script>` : "",
    ...scripts.map((code) => `<script>${code}</script>`),
    "</body></html>",
  ].join("");
}

export function buildModule() {
  const entries = GAMES.map((game) => `  ${game}: ${JSON.stringify(buildHtml(game))},`).join("\n");
  return `/* eslint-disable */
// BU DOSYA ÜRETİLİR — elle düzenlemeyin. Kaynak: games/*.js
// Yeniden üretmek için: npm run build:games

export type WebGameKey = ${GAMES.map((g) => JSON.stringify(g)).join(" | ")};

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
