/**
 * WEB ADRESİ → UYGULAMA ROTASI (universal link / app link).
 *
 * elitlig.com bağlantısı uygulamayı açtığında gelen yol sitenin rotasıdır
 * (elitlig-client src/App.js): `/sehir/6/lig/2/sezon/9/mac/123`. Uygulamanın
 * rotası ise `/mac/123`. Bu fonksiyon yalnız TANIDIĞI web yollarını çevirir;
 * uygulamanın kendi şeması (`elitlig://mac/123`) ve tanımadığı her şey olduğu
 * gibi geçer. Tanınmayan bir https adresi ana sayfaya iner (boş ekran yok).
 *
 * Saf fonksiyondur: `app/+native-intent.tsx` çağırır, hata fırlatmaz.
 */

const ENTITY: Record<string, string> = { mac: "/mac", takim: "/takim", oyuncu: "/oyuncu" };

/** `/:citySlug/mac/:id` biçiminde slug sanılabilecek uygulama klasörleri. */
const APP_DIRS = new Set(["takimim", "yonetim", "oyuncum", "sohbet", "teklif", "sozlesme", "ceza", "haber"]);

const SIMPLE: Record<string, string> = {
  "/cezalar": "/cezalar",
  "/kurallar": "/kurallar",
  "/panel": "/(tabs)/kulubum",
  "/oyuncu-listesi": "/ara",
};

export function webPathToAppPath(input: string): string {
  try {
    const raw = String(input ?? "");
    const isWeb = /^https?:\/\//i.test(raw);
    let pathname = raw;
    let search = "";
    if (isWeb) {
      const url = new URL(raw);
      pathname = url.pathname;
      search = url.search;
    } else {
      const q = raw.indexOf("?");
      if (q >= 0) {
        pathname = raw.slice(0, q);
        search = raw.slice(q);
      }
    }
    pathname = pathname.replace(/\/+$/, "") || "/";

    // /sehir/:c[/lig/:l/sezon/:s]/(mac|takim|oyuncu)/:id
    const scoped = pathname.match(/^\/sehir\/\d+(?:\/lig\/\d+\/sezon\/\d+)?\/(mac|takim|oyuncu)\/(\d+)$/);
    if (scoped) return `${ENTITY[scoped[1]]}/${scoped[2]}`;

    // /:citySlug/(mac|takim|oyuncu)/:id — eski şehir adresleri
    const slugged = pathname.match(/^\/([a-z0-9-]+)\/(mac|takim|oyuncu)\/(\d+)$/i);
    if (slugged && !APP_DIRS.has(slugged[1].toLowerCase())) return `${ENTITY[slugged[2]]}/${slugged[3]}`;

    // /haberler?haber=<publicId> — tekil haber (mobilin paylaştığı adres)
    if (pathname === "/haberler") {
      const id = new URLSearchParams(search).get("haber");
      return id ? `/haber/${encodeURIComponent(id)}` : "/(tabs)/ligler";
    }

    if (SIMPLE[pathname]) return SIMPLE[pathname];
    if (/^\/sehir\/\d+(\/.*)?$/.test(pathname) || pathname === "/") return "/";

    // Uygulama şeması ve uygulama içi yollar olduğu gibi geçer.
    return isWeb ? "/" : raw;
  } catch {
    return "/";
  }
}
