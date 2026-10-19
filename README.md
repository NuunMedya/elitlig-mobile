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

Kapsam her ekranda **tek bileşenle** seçilir: `LeaguePicker` hapı
("Ankara · FREELİG · 15. Sezon ▾") ve yanındaki sabitlenmiş lig çipleri.
Hap, il → lig → sezon adımlı alt sayfayı açar; geçmiş sezonlar (eski Arşiv)
sezon adımındadır. Sabitleme yalnız görünüm tercihidir (cihazda); **takip**
ise bildirim üretir: takım, maç ya da lig takip edildiği anda o takibin
bildirim türleri alt sayfada sorulur. Ayrıntı: `docs/arena-tasarim-dili.md` §6.

```
app/                       Ekranlar (Expo Router — dosya = rota)
  _layout.tsx              Sağlayıcılar + tek örnek kaplamalar (ScopeSheet,
                           takip alt sayfası) + bildirim kancaları
  (tabs)/                  Beş sekme + çubukta yuvası olmayan ekranlar
    skorlar.tsx            SKORLAR (açılış) — lig seçici, gün şeridi, Tümü/
                           Canlı/Bitti/Yaklaşan, Canlı ▸ Tüm şehirler; en üstte
                           vitrin + "Takip ettiklerin", sonra sabitlenen ligler
    takip.tsx              TAKİP — Takımlarım şeridi, maç kartları, takip
                           edilenlere süzülmüş haber/transfer/ceza akışı,
                           ligler, maçlar; her öğede zil
    ligler.tsx             LİG — Puan · Fikstür · Oyuncular · İstatistik ·
                           Haber; puan tablosunda takip yıldızı, gol krallığı
    kulubum.tsx            YÖNETİM — tek kulüp paneli: Kulübüm (maç hazırlığı,
                           yapılacaklar, kadro dengesi, kasa) · Kariyerim ·
                           Lig; misafire/kulüpsüze katılma akışı
    profil.tsx             PROFİL — kimlik, Günün Testi, gelen kutusu, ayarlar
    oyunlar.tsx            (href: null) Oyun merkezi
    index · maclar · favoriler · takimlar · oyuncular · menu
                           (href: null) Eski rotalar → yeni yerlerine yönlendirir
  canli.tsx                Eski rota → Skorlar ▸ Canlı ▸ Tüm şehirler
  gelen-kutusu.tsx         Bildirimler | Mesajlar (/bildirimler ve /mesajlarim
                           buraya yönlendirir)
  ayarlar.tsx              Tek Ayarlar: bildirim türleri, takip bildirimleri,
                           görünüm, lig seçimi, hesap ve güvenlik, hesap silme
  sehir.tsx · baslangic.tsx İlk açılış: şehir → lig → takım → bildirim izni
  takimim/                 Kulüp araçları: kadro, maç merkezi, maç kadrosu +
                           taktik simülasyonu, maç al, kasa (`/takimim` →
                           Yönetim sekmesine yönlenir)
  yonetim/                 Yönetim paneli: maçlar, sahalar, mesajlar
  mac/[id].tsx             Maç detayı — skor, akış, kadrolar (canlı)
  takim/[id].tsx           Takım profili
  oyuncu/[id].tsx          Oyuncu profili
  haber/[id].tsx           Haber detayı
  giris.tsx                Giriş (modal)

components/                LeaguePicker (tek lig seçici), ScopeSheet,
                           FollowActions, FollowControls (FollowStar,
                           FollowBell), FollowEventEditor …
components/league/         Lig sekmeleri (Puan, Fikstür, Oyuncular,
                           İstatistik, Haber panelleri)
components/scores/ · follow/ · inbox/
                           Skorlar, Takip ve Gelen kutusu parçaları
components/home/ · teampage/ · playerpage/ · matchpage/ · club/ · account/
                           Ekrana özgü parçalar (bkz. Tasarım sistemi)
components/ui/             Tasarım sistemi bileşenleri (MatchCard,
                           MatchCardRail, HubTile, ListRow, MetricTile, …)
theme/                     Palet, tipografi, uzay, yükselti, hareket, font
lib/game/                  Oyun motoru: sabit adımlı döngü, girdi, fizik,
                           ayarlar (TUNING), oyun paleti
scripts/check-tokens.mjs   Tasarım sistemi denetimi (kontrast, punto, hex…)
scripts/check-games.mjs    Oyun fiziği denetimi (yön, Magnus, kare hızı…)
providers/
  ScopeProvider.tsx        Şehir/lig/sezon seçimi, sabitlenen ligler + kalıcılık
  FavoriteProvider.tsx     Takip (takım, lig, sezon, il, maç) — cihaz + sunucu
  FollowFlowProvider.tsx   Takip = bildirim: takip edince bildirim türleri
                           alt sayfası
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
| Skorlar | `GET /maclar?league_id&season_id`, `GET /maclar/live` (Tüm şehirler), `GET /maclar?team_id=` (takip edilen takımlar) |
| Takip | `GET /maclar?team_id=`, `GET /maclar/:id`, `GET /api/news/feed` (istemcide takiplere süzülür) |
| Takip bildirimleri | `GET /api/favorites/notifications`, `PATCH /api/favorites/:kind/:id/notifications` |
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

## Tasarım sistemi — Arena

Uygulamanın tasarım dili **Arena**'dır; tam kılavuz
[`docs/arena-tasarim-dili.md`](docs/arena-tasarim-dili.md). Özet:

- **Sakin kâğıt, renk sinyaldir.** Açık temada lavanta-gri kâğıt (`bg`
  #F7F5FB) ve gölgesiz beyaz kartlar; koyu temada koyu mor gece (#100820),
  beyaz metin. Renk yalnız bir şey söylediğinde kullanılır: `brand` (derin
  mor) aksiyon ve seçili durum, `accent` (pembe) veri ve vurgu, `live` canlı,
  `win/draw/loss` sonuç.
- **Koyu mor sahne.** Kimlik ve skor anları (maç skorbordu, takım/oyuncu
  kimliği, vitrin maçı) koyu mor sahnededir (`gradientInk`, `inkBlock`).
  Sahne bir ekranda bir kez, tepede kullanılır. Alt menü açık temada beyaz.
- **Yazı.** Arayüz ve başlıklar Plus Jakarta Sans, skor ve rakamlar Archivo.
- **İki başlık.** `ScreenHeader` sekme köklerinde KÂĞIT (28px büyük başlık,
  çıplak eylem ikonları), kimlik sayfalarında SAHNE (`hero` ile)
  çizilir. İçindeki `Tabs` ve `ScopeChip` yüzeyi `HeaderToneContext`'ten
  öğrenir.
- **Düz yüzeyler.** Kart: beyaz dolgu + saç teli kenarlık, gölge yok,
  köşe `radius.xl` (16); düğme ve çip hap. Kart gradyanı düzdür.
- **Hiyerarşi tipografiyle.** Bölüm başlıkları cümle düzeninde kalın
  (`SectionHeader`); rakamlar Archivo ile büyük ve tabular; etiketler küçük
  büyük harf (`overline`, `micro`).
- **Denetim.** `npm run check:tokens`: kontrast ≥ 4.5 (iki tema), çıplak hex
  yok, `fontWeight` yok, çıplak `borderRadius` yok, gradyan ekseni yatay.

Ekran bileşenleri alana göre ayrılmıştır: `components/home` (Ana Sayfa),
`components/league` (Lig sekmeleri), `components/teampage`,
`components/playerpage`, `components/matchpage` (detay sayfaları),
`components/club` (Kulübüm ve kulüp paneli), `components/account`
(profil, giriş/kayıt), `components/chat` (mesajlaşma).

### Maç detayı — sahne

Maç sayfası kendi atmosferini taşır (`components/matchpage/MatchAtmosphere`):
grafit taban (`matchTint`), %28 opaklıkta kapak fotoğrafı ve kâğıda
(`matchCanvas`) inen dikey yıkama (`matchWash`; son durak `matchCanvas` ile
birebir aynı). Skorbord grafit sahne kartıdır; altında Özet (canlıda Canlı) ·
Kadro (iki takım tek sahada) · İstatistik · H2H · Puan sekmeleri durur.
`check-tokens` başlık metninin atmosfer tabanıyla kontrastını ölçer.

**Oyuncu adı hijyeni.** Kadro kayıtlarının bir bölümünde oyuncu adı takım
adıyla birlikte girilmiş ("Yusuf YILDIRIM İNFERNO FK"). `stripTeamSuffix` eki
kadro yükünün kendisinde bir kez atar; ek yalnız sonda ve kelime sınırında
eşleşirse atılır.

## Bilgi mimarisi — beş bölüm, tek kapı

Alt çubuk beş bölümdür; her biri tek bir soruyu yanıtlar ve bir hedefe
uygulamada **tek bir mantıklı yerden** ulaşılır.

| Sekme | Soru | İçerik |
| --- | --- | --- |
| **Ana Sayfa** | Şu an ne oluyor? | İl · lig · sezon şeridi, vitrin maçı, takip ettiğin takımların maç kartları, canlı/yaklaşan maçlar, puan özeti, gol krallığı, haberler |
| **Maçlar** | Hangi gün kim kiminle? | Gün şeridi, takvim, Tümü/Canlı/Bitti/Yaklaşan, lig gruplu maç kartları |
| **Lig** | Ligde durum ne? | İl · lig · sezon şeridi + Puan · Fikstür (Yaklaşan/Sonuçlar) · Takımlar (takip ızgarası) · Oyuncular (sıralamalar) · İstatistik · Haber · Arşiv |
| **Kulübüm** | Benim işim ne? | Rol bazlı ızgaralar: Takım Yönetimi (kadro, transfer, davet/başvuru, maç merkezi, maç al, kasa, mesajlar, onay bekleyenler) · Kariyerim (maçlarım, teklifler, sözleşmeler, disiplin, davetler) · Lig Yönetimi · takip ettiğim takımlar |
| **Profil** | Hesabım ve tercihlerim | Takip ettiklerim · Bildirimler (kutu, mesajlar, bildirim türleri, takip bildirimleri) · Oyunlar · Keşfet · Bilgi ve destek · Ayarlar · çıkış/hesap silme |

**Kapsam şeridi (`components/ScopeBar.tsx`).** İl, lig ve sezon üç ayrı
kutudur; dokunulan kutu kapsam sayfasını o adımda açar. Altındaki lig çipleri
ligler arası geçişi alt sayfa açmadan yapar, favori ligler başa alınır. Ana
Sayfa ve Lig sekmelerinde durur; Maçlar başlığındaki çip aynı sayfayı açar.

**Takip ve bildirim tek akış.** Takım, maç ve oyuncu sayfalarının kimlik
bloğunda `FollowActions` şeridi vardır: *Takip et* → *Bildirimler* (takip
bildirimleri ekranını o takibin ayarları açık olarak, `?odak=team:610`
parametresiyle açar). Lig ▸ Takımlar ızgarasında her karo tek dokunuşla takip
edilir.

**Eski rotalar** (`/(tabs)/takimlar`, `/(tabs)/oyuncular`, `/(tabs)/menu`)
derin bağlantılar ve bildirimler kırılmasın diye durur ve yeni yerlerine
yönlendirir.

### Maç kartı

```
┌───────────────────────────────────────────────┐
│ ⌖ OSTİM HALISAHA 1 NOLU            Dün    ☆  │  saha/lig · gün · takip
│      ◆◆◆            13 – 9            ◆◆◆      │  44px amblemler, skor/saat
│  ÖZMEN PETROL         MS          VURKAÇ FC   │  iki satıra kırılan adlar
│      SPOR                                     │
└───────────────────────────────────────────────┘
```

`MatchCard` iki biçimde gelir: büyük KART (yatay şeritler, vitrin) ve yoğun
listeler için KOMPAKT SATIR (`variant="compact"`: ev · skor/saat · deplasman
tek eksende, durum skorun altında, saha ve takip yıldızı ikinci satırda;
satırlar `position` ile tek kart hâlinde gruplanır).

`MatchCard` fikstür ve sonuç listelerinin ortak birimidir (Maçlar, Lig ▸
Fikstür, Favoriler, Canlı, takım sayfası). Oynanmamış maçta ortada saat,
canlıda kırmızı skor + dakika rozeti, bitende skor + "MS" durur; kazanan kalın,
kaybeden soluk yazılır. Yüksekliği seçeneklerden hesaplanır
(`matchCardHeight`), uzun listeler `getItemLayout` kurmaya devam eder. Özet
ekranlarda kartlar `MatchCardRail` ile yatay şerit olarak dizilir. Eski
`MatchRow` yoğun yönetim listelerinde (yönetim ▸ maçlar) kullanılmaya devam
eder.

## Yol haritası

- [ ] Maç istatistikleri sekmesi (`?include=stats`)
- [ ] Takım kadrosu ve sezonluk oyuncu istatistikleri
- [ ] EAS projesine FCM v1 / APNs kimliklerinin tanımlanması (bkz. Bildirimler)
- [ ] Favori takım ve maç hatırlatıcısı
- [ ] Spikerli canlı yayın oynatıcı (expo-video, HLS)
