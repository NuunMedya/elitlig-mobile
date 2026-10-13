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
  (tabs)/                  Beş sekme + çubukta yuvası olmayan ekranlar
    index.tsx              ANA SAYFA — kapsam şeridi, vitrin, takip edilen
                           takımların maç kartları, canlı/yaklaşan, özetler
    maclar.tsx             MAÇLAR — gün şeridi, lig grupları, maç kartları
    ligler.tsx             LİG — il/lig/sezon şeridi + Puan · Fikstür ·
                           Takımlar · Oyuncular · İstatistik · Haber · Arşiv
    kulubum.tsx            KULÜBÜM — başkan, oyuncu, lig yönetimi araçları
    profil.tsx             PROFİL — takip, bildirimler, oyunlar, bilgi, ayarlar
    favoriler.tsx          (href: null) Takip edilen takım, lig, maç
    oyunlar.tsx            (href: null) Oyun merkezi
    takimlar.tsx           (href: null) → Lig ▸ Takımlar yönlendirmesi
    oyuncular.tsx          (href: null) → Lig ▸ Oyuncular yönlendirmesi
    menu.tsx               (href: null) → Profil yönlendirmesi
  takimim/                 Takım paneli: kadro, maç merkezi, maç al, kasa
  yonetim/                 Yönetim paneli: maçlar, sahalar, mesajlar
  mac/[id].tsx             Maç detayı — skor, akış, kadrolar (canlı)
  takim/[id].tsx           Takım profili
  oyuncu/[id].tsx          Oyuncu profili
  haber/[id].tsx           Haber detayı
  giris.tsx                Giriş (modal)

components/                ScopeBar, ScopeChip, FollowActions, MessageSticker …
components/league/         Lig merkezinin panelleri (TeamsPane, PlayersPane)
components/ui/             Tasarım sistemi bileşenleri (MatchCard,
                           MatchCardRail, HubTile, ListRow, MetricTile, …)
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

Renk, tipografi ve uzay `theme/` altındadır ve yedi kural taşır:

- **MOR MÜREKKEPTİR, ARKA PLAN DEĞİL.** Açık temada kâğıt SAF BEYAZDIR
  (`bg` #FFFFFF); yüzeyler beyazdan bir kademe aşağıda çok açık bir lavantadır
  (`surface1` #F8F5FE) ve kimlik blokları derin mor gradyandır (`gradientInk`).
  Koyu temada zemin GERÇEKTEN mordur (#180D33) — önceki #0C0718 adı mor olan
  bir siyahtı. Mürekkep de nötr siyah değil MOR mürekkeptir (#160C2E).
- **İKİ VURGU, İKİ İŞ.** Mor `brand` yalnız AKSİYON ve SEÇİLİ DURUM,
  camgöbeği `accent` yalnız VERİ içindir. Veri rengi eskiden maviydi ve mavi
  morun komşusu olduğu için bir istatistik barında "seçili mi, veri mi" ayırt
  edilemiyordu. Koyu mor blokların üstünde mor bir vurgu okunmaz (mor üstüne
  mor ≈ 1,8:1); oradaki marka rengi ayrı bir tokendır: `brandOnDark`.
- **KARTLAR IŞIKLIDIR.** Varsayılan kart üç katmandır: `gradientCard` geçişi
  (bkz. `components/ui/GradientFill.tsx`) + 1px kenarlık + MOR tonlu yumuşak
  gölge. Gölge rengi siyah değil `shadowColor` (#2E1065): siyah gölge beyaz
  kâğıdın üstünde grileşip kirli görünür.
- **ALT MENÜ BARI İKİ TEMADA DA KOYU MOR.** Uygulamanın her ekranında görünen
  tek yüzey odur; tema değiştikçe kimlik değiştirmesin diye rengi temadan
  bağımsızdır. Ekranın altında YÜZEN bir haptır ve seçili sekmeye yaylanarak
  uzanan bir ışık taşır (bkz. `components/ui/GlowTabBar.tsx`).
- **GRADYAN SAYILIDIR VE TOKENDIR.** Sekiz gradyanın her birinin bir işi vardır
  (`gradientCard` · `gradientInk` · `gradientBrand` · `gradientAccent` ·
  `gradientLive` · `gradientPitch` · `gradientSurface` · `gradientTabBar`).
  Elle yazılmış iki renk = denetim hatası.
- **GRADYAN EKSENİ TEKTİR: YATAY, SAĞDAN SOLA.** Köşegen ya da dikey geçiş
  dikdörtgen bir yüzeyi silindire çevirir — kart "boru" gibi görünür. Aynı
  ekranda iki farklı eksen varsa göz iki ayrı ışık kaynağı okur ve yüzeyler
  birbirine ait görünmez. `check-tokens` her `colors.gradient*` yüzeyinin
  `start`/`end` noktasını ölçer: `y` iki uçta da 0.5, `start.x > end.x`.
  Kural yalnız YÜZEY gradyanlarına bakar; ekseni işinden gelen üç gradyan
  dışarıdadır — okunabilirlik scrim'i (dikey), kaydırma kenarı maskesi
  (kaydırma yönünde) ve saha (`gradientPitch`, dikey; oradaki geçiş ışık
  değil derinliktir).
- **GEÇİŞ DURAKLARI BİRBİRİNE YAKIN TONDUR.** İki durak arasındaki fark
  yaklaşık bir kademedir (`gradientCard` #FFFFFF → #F8F4FE). Keskin geçiş
  yüzeyi ikiye böler; yakın ton "ışık" izlenimi verir. Kâğıt (`bg`) bu yüzden
  geçişin KOYU ucundan da bir kademe koyudur — yoksa kartın sağ ucu kâğıda
  karışır ve kart taşıyormuş gibi durur.
- **`fontWeight` KULLANILMAZ** — özel fontlarda RN ağırlık uygulamaz, ağırlık
  ailenin adıyla seçilir (`fontFamily: fonts.semibold`).

- **KÖŞE ÜRÜNÜN İMZASIDIR.** Yarıçap ölçeği bilerek cesur: kart **18**, panel
  **24**, sahne yüzeyi (skor tablosu, saha, yükselen sayfa) **30**, düğme ve
  seçim göstergesi **hap**. Bu ölçekte köşe bir detay değil formun kendisidir —
  kartlar "kesilmiş dikdörtgen" değil "yastık" okunur. Ölçek iç içe geçmeyi
  bilir: bir kabın içindeki öğe, kabın yarıçapından en az iç boşluk kadar
  küçüktür (ardışık iki kademe farkı 6px, yani tipik iç boşluk).
  `check-tokens` çıplak `borderRadius: <sayı>` yazımını yasaklar (≤ 4px mikro
  şekiller ve dondurulmuş paylaşım kartı hariç) — ölçek bir daha tek tek
  dosyalardan kaçmasın diye.

### Çerçeve ve ışık

İki küçük ilkel, ürünün "el yapımı" hissini taşıyan şeyler:

- **`Frame`** — 1px'lik GRADYAN kenar. React Native'de gradyan kenarlık yok;
  teknik, gradyanla dolu bir dış katman + `padding: 1` + kartın kendi zeminini
  taşıyan iç katman. Gerçek bir nesnenin kenarı ışığa göre davranır: üst yay
  parlak, alt yay sönük (`rimLight` / `rimDark`). Düz bir `hairline` kenarlık
  her arayüzde aynıdır ve kartı kâğıttan KESİLMİŞ gösterir; gradyan kenar onu
  kâğıdın üstüne KONMUŞ gösterir. İç yarıçap dıştan 1 eksiktir, yoksa kenarlık
  köşelerde kalınlaşır.
- **`Bloom`** — bir öğenin arkasındaki yumuşak ışık, `RadialGradient` ile.
  Düz renkli bir daire hâle DEĞİLDİR: kenarı keskindir ve ekranda disk olarak
  görünür. Skorun arkasındaki hâle, mürekkep bloğu "aydınlatılmış bir tabela"
  yapan tek detaydır; canlı maçta rengi `live`a döner.

### Tipografi ölçeği

Metin 10–22, skor 17–40. Arayüzün varsayılanı **14px** (`body`), ikincil metin
12 (`bodySm`), satır başlığı 15 (`h3`), kart başlığı 16 (`h2`), sayfa başlığı
19 (`h1`), kimlik başlığı 22 (`display`). Satır ölçüleri: tek satır 52, iki
satır 66, maç satırı 54.

10px'e yalnız `micro` ve `overline` iner; ikisi de DAİMA büyük harf + geniş harf
aralığı taşır — büyük harf, o puntoda okunurluğu ayakta tutan şeydir.

**ÖLÇEK NEDEN BÜYÜTÜLDÜ.** Önceki sürümler ölçeği adım adım küçültmüştü; son
hâlde gövde 11, meta 9, rozet 8 ve skor 24px'ti. Gerekçe "küçük punto + geniş
boşluk daha pahalı bir izlenim verir" idi — doğru ama sınırı var, ve sınır
aşılmıştı: 11px gövde iOS'un 17pt gövdesinin ve Material'ın 14sp tabanının
belirgin altındadır, 9px meta ile 8px rozet iki platformun erişilebilirlik
tabanının da altına iner. Kullanıcı ekrana yaklaşmak zorunda kalıyorsa o
arayüz pahalı değil UCUZ okunur. Skor ayrıca büyüdü (24 → 40): bir skor
uygulamasında skorun büyüklüğü, ürünün neyle ilgili olduğunu söyleyen ilk
şeydir.

Hiyerarşi eskisinden daha nettir: basamaklar 1px değil 2–3px aralıklıdır, yani
punto farkı tek başına da okunur (eskiden fark yalnız aile + renk ile ayakta
duruyordu).

**Ölçek tek başına büyütülmez.** İri metin, eski kısık ölçeğe göre hesaplanmış
kutuların içinde kırpılır; bu yüzden `theme/space.ts` satır yükseklikleri,
amblem ölçüleri ve sütun genişlikleri, `Button` boyları ve metin taşıyan sabit
kutular (`Badge`, `RatingPill`, `ActionTile`, `MetricTile`, `ScreenHeader`…)
aynı geçişte birlikte büyüdü — her biri yeni satır yüksekliğinden türetilerek.

### Maç satırı — tek satır (yalnız yönetim listeleri; halka açık listeler `MatchCard` kullanır)

```
┌ 42 ┬────── flex ──────┬ 56 ┬────── flex ──────┬ 42 ┐
│19:30│ ◆ Kartalspor     │2–1 │ Yıldızspor ◆     │ ☆ │
└─────┴──────────────────┴────┴──────────────────┴────┘
  saat   logo + ev (sağa)  skor  dep (sola) + logo  yıldız
```

**Kenar sütunları eşit genişliktedir (42/42) ve yıldız gizlense bile yerini
korur.** İki yan eşit `flex` aldığı için skor bloğu ancak kenarlar eşitken
satırın geometrik merkezine oturur; eşit olmadığında blok birkaç piksel, yıldız
hiç çizilmediğinde çok daha fazla sağa kayıyordu — yani aynı uygulamada maçlar
üç farklı okuma ekseninde diziliyordu.

Ev sahibinin adı SAĞA, deplasmanınki SOLA yaslanır; ikisi de ortadaki sabit
genişlikli skor bloğuna dayandığı için "ev – skor – deplasman" tek bir okuma
birimi olur ve göz, liste boyunca tek bir dikey ekseni takip eder. Amblemler
dışta durup iki kenarda sabit bir ritim kurar.

Önceki iki satırlı düzen (ev üstte, deplasman altta, skor sağda) satır başına
56px istiyordu ve skorun yeri takım adının uzunluğuna göre kayıyordu.

### Maç detayı — sahne

Maç detayı, uygulamanın geri kalanı gibi bir LİSTE değil, tek bir maçın
sahnesidir; kendi kâğıdı ve kendi ışığı vardır.

**Atmosfer.** Sayfanın arkasında, üst 300px'i kaplayan üç katman durur
(`MatchAtmosphere`):

1. **Taban** (`matchTint`) — sahnenin mor rengi, her zaman.
2. **Doku** — maçın kapak fotoğrafı, %28 opaklıkta. Tam opaklıkta serilseydi
   sahnenin rengi fotoğrafın rengi olurdu ve başlık şeridindeki beyaz metnin
   okunurluğu, o maça hangi fotoğrafın yüklendiğine bağlı kalırdı. Bu ligdeki
   maçların çoğunda kapak yok; "fotoğrafsız" hâl istisna değil VARSAYILAN.
3. **Yıkama** (`matchWash`) — tepede saydam (doku görünsün), dipte kâğıdın
   kendisi. Son durak `matchCanvas` ile birebir aynı; bir tık farklı olsa
   atmosferin bittiği yerde yatay bir dikiş çizgisi görünür.

**Kâğıt.** `matchCanvas` açık temada uygulama kâğıdıyla aynıdır (#FFFFFF),
koyu temada bir tık daha doygun mordur (#170C32). Üstteki mor atmosfer ancak
sakin bir zeminde "ışık" gibi okunur; sahnenin altındaki zemin de mor olsaydı
sayfa baştan aşağı mor bir sise dönerdi.

**Denetim.** `check-tokens` başlık metninin (`onDark`, `onDarkMuted`,
`brandOnDark`) atmosfer tabanıyla, sayfa metinlerinin de `matchCanvas` ile
kontrastını ölçer. Taban bir tık açılırsa maç başlığı okunmaz olur ve bu,
yalnız kapak fotoğrafı olan maçlarda fark edilirdi.

**Oyuncu adı hijyeni.** Kadro kayıtlarının bir bölümünde oyuncu adı takım
adıyla birlikte girilmiş ("Yusuf YILDIRIM İNFERNO FK"). Bu ad ekranda beş ayrı
yerde okunuyor: skor bloğu golcüleri, zaman çizelgesi, saha dizilişi etiketi,
en iyi oyuncular ve kadro satırı. `stripTeamSuffix` ekini atar ve temizlik
KADRO YÜKÜNÜN KENDİSİNDE, bir kez yapılır — böylece `lib/matchStats`
türetmeleri de temiz adı görür. Ek yalnız sonda ve kelime sınırında eşleşirse
atılır: "Ali FENERBAHÇELİ", takım adı "FENERBAHÇE" olsa bile korunur.

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
