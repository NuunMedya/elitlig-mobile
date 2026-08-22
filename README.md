# ElitLig Mobil

ElitLig'in mobil uygulaması — Expo + React Native + TypeScript + Expo Router +
TanStack Query. Veriyi `elitlig-server` API'sinden alır; web sitesiyle (`elitlig-client`)
aynı uçları ve aynı kapsam mantığını kullanır.

## Kurulum

```bash
npm install --legacy-peer-deps
npx expo start
```

Değişiklikten sonra:

```bash
npm run check   # tasarım sistemi + oyun fiziği + typecheck
```

Telefona **Expo Go** kurup terminaldeki QR kodu okutmanız yeterli.

> `--legacy-peer-deps`: Expo 54'ün web bağımlılıklarından gelen `react-dom`
> sürüm çakışması yüzünden gerekli. Mobil çalışma zamanını etkilemez.

## Mimari

Uygulamanın omurgası web sitesindekiyle aynı: **şehir → lig → sezon** kapsamı.
Fikstür, puan durumu, oyuncu sıralaması ve haberler hep seçili kapsamı gösterir.
Seçim cihazda saklanır, kullanıcı uygulamayı kendi ligiyle açar.

```
app/                       Ekranlar (Expo Router — dosya = rota)
  _layout.tsx              Sağlayıcılar + tek örnek kaplamalar (ScopeSheet,
                           MessageSticker) + bildirim kancaları
  (tabs)/                  Altı sekme + çubukta yuvası olmayan üç ekran
    index.tsx              GENEL BAKIŞ — vitrin maçı, kısayollar, özetler
    maclar.tsx             MAÇLAR — gün şeridi, lig grupları, segmentler
    takimlar.tsx           TAKIMLAR — kart görünümü + puan tablosu
    oyuncular.tsx          OYUNCULAR — podyum + sıralamalar
    profil.tsx             PROFİL — kimlik ve tercihler
    menu.tsx               MENÜ — oyunlar, lig, kulüp, bilgi
    ligler.tsx             (href: null) Puan/fikstür/istatistik/haber/arşiv
    favoriler.tsx          (href: null) Favori takım, lig, maç
    oyunlar.tsx            (href: null) Oyun merkezi
  takimim/                 Takım paneli: kadro, maç merkezi, maç al, kasa
  yonetim/                 Yönetim paneli: maçlar, sahalar, mesajlar
  mac/[id].tsx             Maç detayı — skor, akış, kadrolar (canlı)
  takim/[id].tsx           Takım profili
  oyuncu/[id].tsx          Oyuncu profili
  haber/[id].tsx           Haber detayı
  giris.tsx                Giriş (modal)

components/                ScopeChip, MessageSticker, TeamCrest, TurkeyMap …
components/ui/             Tasarım sistemi bileşenleri (MatchRow, ListRow,
                           MetricTile, ActionTile, SpotlightCard, …)
theme/                     Palet, tipografi, uzay, yükselti, hareket, font
lib/game/                  Oyun motoru: sabit adımlı döngü, girdi, fizik,
                           ayarlar (TUNING), oyun paleti
scripts/check-tokens.mjs   Tasarım sistemi denetimi (kontrast, punto, hex…)
scripts/check-games.mjs    Oyun fiziği denetimi (yön, Magnus, kare hızı…)
providers/
  ScopeProvider.tsx        Şehir/lig/sezon seçimi + kalıcılık
  AuthProvider.tsx         Oturum, jeton, 401 davranışı
hooks/
  useLiveMatch.ts          Socket.io + anlık görüntü + canlı sayaç
  useTeamLogos.ts          Maç kaydındaki takım adını logoya/id'ye çözer
  usePushNotifications.ts  Uzak push: token kaydı + dokunma yönlendirmesi
  useNotificationBridge.ts Yerel köprü: push olmadan da bildirim gösterir
lib/
  config.ts                app.json → expo.extra'dan yapılandırma
  http.ts                  Tek HTTP katmanı (timeout, retry, dedupe, auth)
  types.ts                 Sunucunun gerçek yanıt şekilleri
  match.ts                 mac_durumu ve olay_kodu yorumlama
  format.ts                Tarih, skor, para, görsel adresi
  api/                     Uç bazlı modüller (meta, matches, standings, ...)
  notifications.ts         Bildirim → rota çözümü, Android kanalları
  notificationLedger.ts    "Bu bildirim zaten gösterildi mi?" defteri
```

## Kullanılan sunucu uçları

| Ekran | Uç |
| --- | --- |
| Kapsam seçici | `GET /api/meta/cities`, `/leagues`, `/seasons`, `/default-scope` |
| Maçlar | `GET /maclar?league_id&season_id` |
| Maç detayı | `GET /maclar/:id?include=timeline`, `GET /maclar/:id/kadro` |
| Canlı maç | `GET /api/live-matches/:id/snapshot` + Socket.io |
| Puan durumu | `GET /api/standings?cityId&leagueId&seasonId` |
| Oyuncu sıralaması | `GET /api/oyuncu-listesi?cityId&leagueId&seasonId&sort` |
| Oyuncu profili | `GET /api/players/:id` |
| Takım profili | `GET /takimlar/:id`, `GET /maclar?team_id=` |
| Haberler | `GET /api/news/feed`, `GET /api/news/:publicId` |
| Oturum | `POST /api/users/login`, `GET /api/users/verify`, `POST /api/users/logout` |

Uçlara dair iki not:

- **Puan durumu**: hangi puanın gösterileceğine sunucu karar verir
  (`display_points`), sezon standart ya da güç dengesi olabilir. İstemci
  sıralamayı yeniden hesaplamaz.
- **Oyuncu sıralaması**: bu uç ham SQL kullandığı için alan adları Players
  modelinden farklıdır (`name`, `image`, `teamId`, `teamName`) ve toplamlar
  **dize** olarak döner.

## Canlı maç

Sözleşme "olay geldi → anlık görüntüyü tazele" biçimindedir; doğruluk kaynağı
her zaman snapshot ucudur, soket yalnızca haber verir (web istemcisiyle aynı
model). Soket kurulamazsa 25 saniyede bir yoklamaya düşülür. Uygulama arka
plana alındığında hem soket hem yoklama durur.

Süre sunucudan "temel süre + temelin alındığı an" olarak gelir, dakika
istemcide ilerletilir; cihaz saati sapmışsa fark yanıttaki `serverNow` ile
düzeltilir.

## Yapılandırma

Adresler `app.json` → `expo.extra` altında:

```json
"extra": {
  "apiBaseUrl": "https://...",
  "socketUrl": "https://...",
  "liveSocketEnabled": true,
  "liveFallbackPollMs": 25000,
  "defaultCityId": 1
}
```

Geliştirmede telefondan bilgisayara erişmek için `apiBaseUrl`'i yerel IP yapın
(`http://192.168.1.20:3000`) — telefon `localhost`u kendi cihazı sanar.

## Bildirimler

Bildirimin telefonda görünmesi için **iki bağımsız yol** vardır. İkisi
`lib/notificationLedger.ts` üstünden haberleşir; aynı bildirim iki kez
gösterilmez.

**1. Uzak push (asıl yol).** Sunucu bildirimi üretir
(`models/PanelNotification.js` afterCreate → `services/NotificationService.js`
→ Expo Push API). Zincirin çalışması için şunlar gerekir:

- Uygulamanın **kendi derlemesi** (EAS Build / TestFlight). *Expo Go'da uzak
  bildirim SDK 53'ten beri desteklenmez* — burada hiçbir kod düzeltmesi işe
  yaramaz.
- EAS projesinde **push kimlikleri**: Android için FCM v1 servis hesabı
  (`eas credentials` → Android → *FCM V1 service account key*), iOS için APNs
  anahtarı. Bunlar tanımlı değilse Expo mesajı kabul eder ama teslim edemez;
  sunucu tarafında hata görünmez.
- Kullanıcının izin vermiş olması ve cihaz token'ının sunucuya yazılmış olması
  (`POST /api/users/push-token`).

**2. Yerel köprü (yedek yol).** `hooks/useNotificationBridge.ts` uygulama
açıkken bildirim merkezini yoklar ve yeni kayıtları **yerel** bildirim olarak
gösterir. Yerel bildirim yalnız işletim sistemi iznine ihtiyaç duyar; FCM,
APNs, EAS projectId ya da teslimat sunucusu gerekmez. Sınırı açıktır:
**uygulama tamamen kapalıyken JavaScript çalışmaz**, dolayısıyla köprü de
çalışmaz — o durumda teslimat bir sonraki açılışta olur. Köprü push'un yerine
geçmez, yokluğunda devreye girer.

**Teşhis.** Profil → Bildirim Tercihleri ekranındaki kart üç kapıyı ayrı ayrı
gösterir (cihaz izni · cihaz kimliği · sunucuya kayıt) ve bir **test bildirimi**
düğmesi taşır. Test bildirimi yereldir: görünüyorsa sorun teslimat
zincirindedir (yukarıdaki push kimlikleri), görünmüyorsa sorun cihazdadır
(izin, "rahatsız etmeyin", susturulmuş kanal).

**Android kanalları.** Kanal kimlikleri istemci ve sunucuda BİREBİR aynı olmak
zorundadır: `goal · match · panel · game · news · default`. İstemci tarafı
`lib/notifications.ts` → `CHANNELS`, sunucu tarafı
`services/NotificationService.js` → `channelFor()`. Ayrışan bir kimlik,
bildirimi Expo'nun İngilizce yedek kanalına düşürür.

## Oturum

Sunucu tarayıcı için httpOnly çerez kullanır; mobilde çerez taşınmadığından
login yanıtındaki jeton `expo-secure-store` ile cihazın güvenli deposuna yazılır
ve her isteğe `Authorization: Bearer` olarak eklenir. 401 gelirse oturum sessizce
kapatılır, uygulama misafir moduna düşer — maçlar ve puan durumu girişsiz de
görünür.

## Tasarım sistemi

Renk, tipografi ve uzay `theme/` altındadır ve iki kural taşır:

- **Mercan `brand` yalnız AKSİYON ve SEÇİLİ DURUM**, **mavi `accent` yalnız
  VERİ** içindir. Bir ekranda mercan alanı o ekranın %5'ini geçmemelidir.
- **Gölge değil çizgi.** Varsayılan kart `surface1` + 1px `border`; gölge
  yalnız gerçekten yüzen katmanlara (sheet, FAB, toast) ayrılmıştır.

Metin tavanı 16px'tir; üstü yalnız skor ölçeğine (`scoreLg` 28, `scoreHero` 40)
ve sayfa başlığına aittir. `fontWeight` KULLANILMAZ — özel fontlarda RN ağırlık
uygulamaz, ağırlık ailenin adıyla seçilir (`fontFamily: fonts.semibold`).

Bu kuralların ölçülebilir olanları `npm run check:tokens` ile sınanır; gözle
denetlemeye gerek yoktur. Ayrıntılı gerekçeler `docs/tasarim-plani.md`
dosyasındadır.

## Yol haritası

- [ ] Maç istatistikleri sekmesi (`?include=stats`)
- [ ] Takım kadrosu ve sezonluk oyuncu istatistikleri
- [ ] EAS projesine FCM v1 / APNs kimliklerinin tanımlanması (bkz. Bildirimler)
- [ ] Favori takım ve maç hatırlatıcısı
- [ ] Spikerli canlı yayın oynatıcı (expo-video, HLS)
