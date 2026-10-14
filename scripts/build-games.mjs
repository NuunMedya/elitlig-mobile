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

const read = (file) => readFileSync(join(root, "games", file), "utf8");

export function buildHtml(game) {
  const scripts = [...SHARED, `${game}.js`].map((file) => read(file).replace(/<\/script/gi, "<\\/script"));
  return [
    "<!doctype html>",
    '<html lang="tr"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">',
    "<style>html,body{margin:0;padding:0;height:100%;overflow:hidden;background:#050817;",
    "touch-action:none;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;",
    "-webkit-tap-highlight-color:transparent;overscroll-behavior:none}",
    "canvas{display:block;width:100vw;height:100vh;touch-action:none}</style>",
    "</head><body><canvas id=\"c\"></canvas>",
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
