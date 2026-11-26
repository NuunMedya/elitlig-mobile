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

/**
 * Sitede ve uygulamada AYNI adla bulunan yönetim sayfaları: yol olduğu gibi
 * geçer (`/yonetim/araclar/not-defteri` → `/yonetim/araclar/not-defteri`).
 * Yalnız uygulamada karşılığı olan sayfalar burada; diğerleri (editör, kura
 * yayını vb.) ana sayfaya düşmesin diye app.json'daki Android filtrelerine de
 * yalnız bu adresler yazılı. Yeni sayfa eklenince iki yer birlikte güncellenir.
 */
const MIRRORED: RegExp[] = [
  /^\/yonetim$/,
  /^\/yonetim\/araclar(?:\/(?:ajanda|hesap-araclari|muhasebe|not-defteri|odak-sayaci|projeler|rehber|tablolar))?$/,
  /^\/yonetim\/araclar\/tablolar\/\d+$/,
  /^\/yonetim\/(?:haftanin-enleri|hesabim|junior-cup|kura|panorama|piyasa-degeri|sponsorlar|takim-finans|talepler)$/,
];

/** Sitede `/yonetim/admin/<ad>`, uygulamada `/yonetim/<ad>` olan sayfalar. */
const ADMIN_ALIAS = new Set([
  "cop-kutusu", "islem-kayitlari", "itirazlar", "mesajlar", "personel", "savunmalar", "sehirler",
  "sifre-talepleri", "transfer-onaylari", "yetkilendirme", "yonetim-kullanicilari", "ziyaretci-analizi",
]);

/** Sitede başka adla duran muhasebe sayfaları. */
const RENAMED: Record<string, string> = {
  "/yonetim/araclar/on-muhasebe": "/yonetim/araclar/muhasebe/on-muhasebe",
  "/yonetim/turkiye-muhasebe": "/yonetim/araclar/muhasebe/turkiye",
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
    // Son parça yalnız numara ("7") ya da okunaklı ad + numara ("kartallar-fk-7")
    // olabilir; kaydı sondaki numara bulur.
    // Şehir, lig ve sezon parçaları da okunaklı olabilir ("ankara-6", "1-lig-2").
    const scoped = pathname.match(/^\/sehir\/(?:[a-z0-9-]*-)?\d+(?:\/lig\/(?:[a-z0-9-]*-)?\d+\/sezon\/(?:[a-z0-9-]*-)?\d+)?\/(mac|takim|oyuncu)\/(?:[a-z0-9-]*-)?(\d+)$/i);
    if (scoped) return `${ENTITY[scoped[1].toLowerCase()]}/${scoped[2]}`;

    // /:citySlug/(mac|takim|oyuncu)/:id — eski şehir adresleri
    const slugged = pathname.match(/^\/([a-z0-9-]+)\/(mac|takim|oyuncu)\/(?:[a-z0-9-]*-)?(\d+)$/i);
    if (slugged && !APP_DIRS.has(slugged[1].toLowerCase())) return `${ENTITY[slugged[2].toLowerCase()]}/${slugged[3]}`;

    // /haber/<okunaklı-ad>-<kod> ya da /haber/<publicId> — sitedeki haber ayrıntı
    // sayfası; uygulamada aynı rota. Haber ucu iki anahtarı da çözer.
    const news = pathname.match(/^\/haber\/([a-z0-9-]{8,200})$/i);
    if (news) return `/haber/${news[1].toLowerCase()}`;

    // /haberler?haber=<publicId> — tekil haber (önceki sürümlerin paylaştığı adres)
    if (pathname === "/haberler") {
      const id = new URLSearchParams(search).get("haber");
      return id ? `/haber/${encodeURIComponent(id)}` : "/(tabs)/ligler";
    }

    if (SIMPLE[pathname]) return SIMPLE[pathname];

    // Yönetim sayfaları (uygulamada karşılığı olanlar)
    if (MIRRORED.some((re) => re.test(pathname))) return pathname;
    if (RENAMED[pathname]) return RENAMED[pathname];
    const admin = pathname.match(/^\/yonetim\/admin\/([a-z-]+)$/);
    if (admin && ADMIN_ALIAS.has(admin[1])) return `/yonetim/${admin[1]}`;
    if (/^\/sehir\/(?:[a-z0-9-]*-)?\d+(\/.*)?$/i.test(pathname) || pathname === "/") return "/";

    // Uygulama şeması ve uygulama içi yollar olduğu gibi geçer.
    return isWeb ? "/" : raw;
  } catch {
    return "/";
  }
}
