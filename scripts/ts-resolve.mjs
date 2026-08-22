/**
 * Uzantısız içe aktarımları `.ts`'e çözen küçük Node yükleyicisi.
 *
 * NEDEN GEREKLİ: kaynak dosyalar `import { clamp } from "./loop"` yazıyor —
 * Metro ve TypeScript için doğru olan budur. Node ESM ise uzantı ister.
 * Denetim betiklerinin GERÇEK kaynağı çalıştırabilmesi için (kopyasını değil)
 * bu köprü kuruluyor; başka hiçbir yerde etkisi yok.
 */

import { register } from "node:module";
import { pathToFileURL } from "node:url";

register(
  "data:text/javascript," +
    encodeURIComponent(`
      export async function resolve(specifier, context, next) {
        try {
          return await next(specifier, context);
        } catch (error) {
          if (specifier.startsWith(".") && !/\\.[a-z]+$/.test(specifier)) {
            return next(specifier + ".ts", context);
          }
          throw error;
        }
      }
    `),
  pathToFileURL("./"),
);
