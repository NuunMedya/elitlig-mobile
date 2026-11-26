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
 * YÖNETİM SAYFALARI (site → uygulama). Yalnız uygulamada karşılığı olanlar
 * çevrilir; diğerleri (editör, ekipman vb.) `null` döner ve ana sayfaya düşer.
 * Android'de app.json intent filtreleri, iOS'ta sitedeki
 * apple-app-site-association aynı adresleri kapsar; yeni sayfa eklenince
 * üçü birlikte güncellenir.
 */

/** Sitede ve uygulamada aynı adla duran sayfalar (sorgu olduğu gibi geçer). */
const MIRRORED: RegExp[] = [
  /^\/yonetim$/,
  /^\/yonetim\/araclar(?:\/(?:ajanda|hesap-araclari|odak-sayaci|tablolar))?$/,
  /^\/yonetim\/araclar\/tablolar\/\d+$/,
  /^\/yonetim\/(?:haftanin-enleri|hesabim|junior-cup|kura|panorama|piyasa-degeri|sponsorlar|takim-finans|talepler)$/,
];

/** Sitede `/yonetim/admin/<ad>`, uygulamada `/yonetim/<ad>` olan sayfalar. */
const ADMIN_ALIAS = new Set([
  "cop-kutusu", "islem-kayitlari", "itirazlar", "personel", "savunmalar", "sehirler",
  "sifre-talepleri", "transfer-onaylari", "yetkilendirme", "yonetim-kullanicilari", "ziyaretci-analizi",
]);

/** Sitedeki muhasebe bölümleri (`?bolum=`) → uygulamadaki ayrı ekranlar. */
const ACCOUNTING: Record<string, string> = {
  hesaplar: "/yonetim/araclar/muhasebe/hesaplar",
  "on-muhasebe": "/yonetim/araclar/muhasebe/on-muhasebe",
  mac: "/yonetim/araclar/muhasebe/mac",
  turkiye: "/yonetim/araclar/muhasebe/turkiye",
};

/** Sitedeki proje ayrıntısının adres parametreleri; uygulama aynı adları okur. */
const PROJECT_PARAMS = ["sekme", "adim", "arac", "kisi", "asama", "tur", "takip", "soru", "asamaid"];

const isId = (v: string | null): v is string => !!v && /^\d+$/.test(v);

function withQuery(path: string, q: URLSearchParams, keys: string[]): string {
  const out = new URLSearchParams();
  for (const k of keys) {
    const v = q.get(k);
    if (v) out.set(k, v);
  }
  const s = out.toString();
  return s ? `${path}?${s}` : path;
}

function adminPath(pathname: string, search: string): string | null {
  const q = new URLSearchParams(search);
  if (MIRRORED.some((re) => re.test(pathname))) return `${pathname}${search}`;

  // Projeler: ?proje=<id>[&sekme=…&adim=…&kisi=…] → /projeler/<id>?sekme=…
  // (/projeler/<id> biçimi de kabul edilir.) Listede ?gorunum= korunur.
  const project = pathname.match(/^\/yonetim\/araclar\/projeler(?:\/(\d+))?$/);
  if (project) {
    const id = project[1] ?? (isId(q.get("proje")) ? q.get("proje") : null);
    if (id) return withQuery(`/yonetim/araclar/projeler/${id}`, q, PROJECT_PARAMS);
    return withQuery("/yonetim/araclar/projeler", q, ["gorunum"]);
  }

  // Not defteri: ?not=<id> notu açar.
  if (pathname === "/yonetim/araclar/not-defteri") return withQuery(pathname, q, ["not"]);

  // Rehber: ?kisi=<üye id> → üye kartı; diğer görünümler rehberin kendisi.
  if (pathname === "/yonetim/araclar/rehber") {
    const kisi = q.get("kisi");
    return isId(kisi) ? `/yonetim/araclar/rehber/uye/${kisi}` : pathname;
  }

  // Muhasebe: ?bolum=<ad>; uygulamada ayrı ekranı olmayan bölüm özete iner.
  if (pathname === "/yonetim/araclar/muhasebe") return ACCOUNTING[q.get("bolum") ?? ""] ?? pathname;
  if (pathname === "/yonetim/araclar/on-muhasebe") return ACCOUNTING["on-muhasebe"];
  if (pathname === "/yonetim/turkiye-muhasebe") return ACCOUNTING.turkiye;

  // Mesajlar (site: Araçlar → Mesajlar; eski /yonetim/admin/mesajlar) = uygulamadaki yönetim sohbeti.
  const chat = pathname.match(/^\/yonetim\/(?:araclar|admin)\/mesajlar(?:\/(\d+))?$/);
  if (chat) return chat[1] ? `/yonetim/sohbet/${chat[1]}` : "/yonetim/sohbet";

  const admin = pathname.match(/^\/yonetim\/admin\/([a-z-]+)$/);
  if (admin && ADMIN_ALIAS.has(admin[1])) return `/yonetim/${admin[1]}`;
  return null;
}

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
    if (pathname === "/yonetim" || pathname.startsWith("/yonetim/")) {
      const mapped = adminPath(pathname, search);
      if (mapped) return mapped;
    }
    if (/^\/sehir\/(?:[a-z0-9-]*-)?\d+(\/.*)?$/i.test(pathname) || pathname === "/") return "/";

    // Uygulama şeması ve uygulama içi yollar olduğu gibi geçer.
    return isWeb ? "/" : raw;
  } catch {
    return "/";
  }
}
