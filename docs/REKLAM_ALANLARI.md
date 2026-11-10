# Uygulama reklam alanları

Yönetim: **elitlig.com → Yönetim → Sponsorlar**

| Alan | Nerede | Görsel |
| --- | --- | --- |
| `app_home` | Skorlar (açılış) ekranında maç listesinin üstü | `app_banner` 1080 × 270 |
| `app_match` | Maç ekranı, Özet sekmesi | `app_banner` |
| `app_inline` | Haber detayının sonu | `app_banner` |
| `app_popup` | Açılışta, sıklık sınırlı tam ekran kart | `app_popup` 1080 × 1620 |

Her alanın modu **Reklam alanları → Mobil uygulama** sekmesinden seçilir:
sponsor / Google / sponsor öncelikli (boşsa Google) / kapalı. Sponsor reklamları
yeni bir mağaza sürümü gerektirmez; OTA güncellemesiyle gelir.

## Google AdMob'u açmak (yeni mağaza sürümü gerekir)

AdMob yerel bir modüldür; uygulamaya eklenene kadar `lib/ads/admob.ts` sessizce
`null` döner ve Google alanları boş kalır (uygulama çökmez).

1. AdMob'da Android ve iOS uygulamalarını oluşturun; uygulama kimliklerini
   (`ca-app-pub-…~…`) not edin.
2. Paketi ekleyin (Expo SDK 54 / RN 0.81 ile uyumlu sürümü seçin):
   `npx expo install react-native-google-mobile-ads`
3. `app.json` → `plugins` dizisine ekleyin:
   ```json
   ["react-native-google-mobile-ads", {
     "androidAppId": "ca-app-pub-XXXXXXXX~YYYYYYYY",
     "iosAppId": "ca-app-pub-XXXXXXXX~ZZZZZZZZ"
   }]
   ```
4. `app.json` → `version` değerini artırın (runtimeVersion `appVersion`
   politikasında; yerel modül eklenince eski sürümlere OTA gitmemeli).
5. EAS ile yeni sürüm derleyip yayınlayın.
6. Yönetimde **Google reklamları** sekmesinde Google'ı açın, AdMob uygulama
   kimliklerini kayıt için girin; **Reklam alanları → Mobil uygulama**
   sekmesinde her alana Android/iOS reklam birimini (`ca-app-pub-…/…`) yazın.
7. elitlig.com/app-ads.txt kendiliğinden yayıncı kimliğinden üretilir;
   AdMob'da geliştirici web sitesi olarak elitlig.com girilmelidir.

Test sırasında Google'ın test birimlerini kullanın (ör. banner
`ca-app-pub-3940256099942544/6300978111`); gerçek birime kendi cihazınızdan
tıklamak AdMob hesabının kapatılmasına yol açabilir.
