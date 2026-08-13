# ElitLig Mobil

ElitLig'in mobil uygulaması — Expo + React Native + TypeScript + Expo Router +
TanStack Query. Veriyi `elitlig-server` API'sinden alır; web sitesiyle (`elitlig-client`)
aynı uçları ve aynı kapsam mantığını kullanır.

## Kurulum

```bash
npm install --legacy-peer-deps
npx expo start
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
  _layout.tsx              Sağlayıcılar: React Query, Auth, Scope
  (tabs)/
    index.tsx              Maçlar — canlı / fikstür / sonuçlar
    standings.tsx          Puan durumu
    players.tsx            Oyuncu sıralamaları
    news.tsx               Haber akışı
    profile.tsx            Profil / oturum
  mac/[id].tsx             Maç detayı — skor, akış, kadrolar (canlı)
  takim/[id].tsx           Takım profili
  oyuncu/[id].tsx          Oyuncu profili
  haber/[id].tsx           Haber detayı
  giris.tsx                Giriş (modal)

components/                MatchCard, ScopeBar, TeamCrest, States, ScreenHeader
providers/
  ScopeProvider.tsx        Şehir/lig/sezon seçimi + kalıcılık
  AuthProvider.tsx         Oturum, jeton, 401 davranışı
hooks/
  useLiveMatch.ts          Socket.io + anlık görüntü + canlı sayaç
  useTeamLogos.ts          Maç kaydındaki takım adını logoya/id'ye çözer
lib/
  config.ts                app.json → expo.extra'dan yapılandırma
  http.ts                  Tek HTTP katmanı (timeout, retry, dedupe, auth)
  types.ts                 Sunucunun gerçek yanıt şekilleri
  match.ts                 mac_durumu ve olay_kodu yorumlama
  format.ts                Tarih, skor, para, görsel adresi
  api/                     Uç bazlı modüller (meta, matches, standings, ...)
constants/theme.ts         Renk / tipografi / boşluk token'ları
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

## Oturum

Sunucu tarayıcı için httpOnly çerez kullanır; mobilde çerez taşınmadığından
login yanıtındaki jeton `expo-secure-store` ile cihazın güvenli deposuna yazılır
ve her isteğe `Authorization: Bearer` olarak eklenir. 401 gelirse oturum sessizce
kapatılır, uygulama misafir moduna düşer — maçlar ve puan durumu girişsiz de
görünür.

## Yol haritası

- [ ] Maç istatistikleri sekmesi (`?include=stats`)
- [ ] Takım kadrosu ve sezonluk oyuncu istatistikleri
- [ ] Push bildirimleri (maç başladı / gol) — sunucuda `routes/pushRoutes.js` var
- [ ] Favori takım ve maç hatırlatıcısı
- [ ] Spikerli canlı yayın oynatıcı (expo-video, HLS)
