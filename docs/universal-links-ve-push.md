# Universal link ve push kimlik bilgileri — elle yapılacaklar

Uygulama tarafı hazır:

- `app.json`: iOS `associatedDomains` (elitlig.com, www.elitlig.com) ve Android
  `intentFilters` (`/sehir…`, `/haberler…`, `autoVerify`).
- `app/+native-intent.tsx` → `lib/webPaths.ts`: site adreslerini uygulama
  rotalarına çevirir (`/sehir/6/lig/2/sezon/9/mac/123` → `/mac/123`,
  `/haberler?haber=<id>` → `/haber/<id>`).

Bağlantıların tarayıcı yerine uygulamayı açması için sitenin iki doğrulama
dosyası yayınlaması gerekir. İkisi de hesap bilgisi istediği için repoya
uydurma değerle konmadı.

Yönetim sayfaları: yalnız uygulamada karşılığı olanlar uygulamada açılır
(`lib/webPaths.ts` → `MIRRORED`, `ADMIN_ALIAS`, `RENAMED`). iOS dosyasındaki
joker (`/yonetim/araclar/*`, `/yonetim/admin/*`) uygulamada olmayan bir alt
sayfayı da yakalarsa, o adres uygulamada ana sayfaya düşer. Bunu önlemek için
o adresi `"exclude": true` ile listenin BAŞINA ekleyin, ör.
`{ "/": "/yonetim/araclar/ekipman", "exclude": true }`.

Alt sayfalar sorgu parametresiyle gelir ve uygulama aynı adları okur:
projeler `?proje=7&sekme=kisiler&kisi=3` → `/yonetim/araclar/projeler/7?sekme=kisiler&kisi=3`,
not defteri `?not=4`, rehber `?kisi=12` → üye kartı, muhasebe `?bolum=mac`,
mesajlar `/yonetim/araclar/mesajlar/42` → `/yonetim/sohbet/42`.

## 1) iOS — `elitlig-client/public/.well-known/apple-app-site-association`

`TEAMID` = Apple Developer hesabının Team ID'si (developer.apple.com →
Membership). Uzantısız dosya, `application/json` olarak sunulmalı:

```json
{
  "applinks": {
    "details": [
      {
        "appIDs": ["TEAMID.com.elitlig.app"],
        "components": [
          { "/": "/yonetim/araclar/ekipman", "exclude": true },
          { "/": "/sehir/*" },
          { "/": "/haberler", "?": { "haber": "?*" } },
          { "/": "/*/mac/*" },
          { "/": "/*/takim/*" },
          { "/": "/*/oyuncu/*" },
          { "/": "/yonetim" },
          { "/": "/yonetim/araclar" },
          { "/": "/yonetim/araclar/*" },
          { "/": "/yonetim/haftanin-enleri" },
          { "/": "/yonetim/hesabim" },
          { "/": "/yonetim/junior-cup" },
          { "/": "/yonetim/kura" },
          { "/": "/yonetim/panorama" },
          { "/": "/yonetim/piyasa-degeri" },
          { "/": "/yonetim/sponsorlar" },
          { "/": "/yonetim/takim-finans" },
          { "/": "/yonetim/talepler" },
          { "/": "/yonetim/turkiye-muhasebe" },
          { "/": "/yonetim/admin/*" }
        ]
      }
    ]
  }
}
```

`netlify.toml` içine:

```toml
[[headers]]
  for = "/.well-known/apple-app-site-association"
  [headers.values]
    Content-Type = "application/json"
```

## 2) Android — `elitlig-client/public/.well-known/assetlinks.json`

`SHA256` = imzalama sertifikasının parmak izi: `eas credentials -p android`
(ya da Play Console → Uygulama bütünlüğü → Uygulama imzalama anahtarı).

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "com.elitligtr",
      "sha256_cert_fingerprints": ["SHA256"]
    }
  }
]
```

## 3) Push kimlik bilgileri (uygulama kapalıyken bildirim)

- Android: Firebase projesinde `com.elitlig.app` uygulaması → servis hesabı
  JSON'u → `eas credentials -p android` → "Google Service Account Key for
  Push Notifications (FCM V1)".
- iOS: `eas credentials -p ios` → "Push Notifications: Manage your Apple Push
  Notifications Key" (EAS anahtarı kendisi üretebilir).

Kurulumdan sonra Ayarlar ▸ Bildirim tercihleri ▸ "Test bildirimi" ile uygulama
kapalıyken bildirimin geldiği doğrulanır.
