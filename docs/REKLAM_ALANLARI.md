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

## Google AdMob

Paket (`react-native-google-mobile-ads`) kuruludur; `app.json` → `plugins`
altında uygulama kimlikleriyle tanımlanır. AdMob yerel bir modüldür: yalnızca
bu paketi içeren mağaza sürümlerinde çalışır. Modül yoksa `lib/ads/admob.ts`
sessizce `null` döner ve Google alanları boş kalır (uygulama çökmez).

**Durum:** iOS açık (1.2.0 ve sonrası). **Android kapalı** — Android AdMob
uygulama kimliği henüz girilmedi. Kimlik olmadan SDK Android'de açılışta
çöktüğü için paket Android derlemesine alınmıyor
(`package.json` → `expo.autolinking.android.exclude`).

### Android'i açmak

1. `app.json` → `react-native-google-mobile-ads` eklentisine
   `"androidAppId": "ca-app-pub-…~…"` ekleyin.
2. `package.json` içindeki `expo.autolinking.android.exclude` listesinden
   `react-native-google-mobile-ads` satırını kaldırın.
3. `app.json` → `version` değerini artırıp EAS ile yeni sürüm yayınlayın.

### Reklam birimleri (yeni sürüm gerektirmez)

Yönetimde **Google reklamları** sekmesinde Google'ı açın ve AdMob uygulama
kimliklerini girin; **Reklam alanları → Mobil uygulama** sekmesinde her alana
Android/iOS reklam birimini (`ca-app-pub-…/…`) yazın.

| Alan | AdMob biçimi |
| --- | --- |
| `app_home`, `app_match`, `app_inline` | Banner |
| `app_popup` | Geçiş (interstitial) |
| `app_rewarded` | Ödüllü |

`app-ads.txt`, mağaza kaydındaki geliştirici web sitesinin (nuuncreative.com)
kök dizininde yayınlanır.

Test sırasında Google'ın test birimlerini kullanın (ör. banner
`ca-app-pub-3940256099942544/6300978111`); gerçek birime kendi cihazınızdan
tıklamak AdMob hesabının kapatılmasına yol açabilir.
