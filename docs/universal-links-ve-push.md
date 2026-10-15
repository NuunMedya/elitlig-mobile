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
          { "/": "/sehir/*" },
          { "/": "/haberler", "?": { "haber": "?*" } },
          { "/": "/*/mac/*" },
          { "/": "/*/takim/*" },
          { "/": "/*/oyuncu/*" }
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
      "package_name": "com.elitlig.app",
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
