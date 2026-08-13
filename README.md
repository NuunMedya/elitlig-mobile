# ElitLig Mobil

Türkiye'nin profesyonel halı saha ligi ElitLig'in mobil uygulaması.
Expo + React Native + TypeScript + Expo Router + TanStack Query.

## Kurulum

```bash
npm install
npx expo start
```

Telefonuna **Expo Go** uygulamasını indir, terminaldeki QR kodu okut — uygulama anında telefonda açılır.

## Yapı

```
app/                Ekranlar (Expo Router — dosya = rota)
  _layout.tsx       Kök layout (React Query provider, dark tema)
  (tabs)/
    index.tsx       Maçlar (fikstür + canlı skor)  ← ilk ekran
    standings.tsx   Puan durumu (sıradaki adım)
    teams.tsx       Takımlar
    profile.tsx     Profil
components/         Yeniden kullanılabilir parçalar (MatchCard)
lib/
  api.ts            API katmanı — backend adresi ve mock veri burada
  types.ts          Ortak veri tipleri (webprojesiyle paylaşılabilir)
constants/theme.ts  Renk / tipografi / boşluk token'ları
```

## Backend'e bağlama

`lib/api.ts` içinde:

1. `API_URL`'i Node.js backend adresinize çevirin
2. `USE_MOCK = false` yapın

Backend'in `GET /matches` endpoint'i `lib/types.ts` içindeki `Match[]` şeklinde
JSON döndürmelidir. Geliştirmede telefondan localhost'a erişmek için
bilgisayarın yerel IP'sini kullanın (ör. `http://192.168.1.20:3000`).

## Yol haritası

- [ ] Puan durumu ekranı (`GET /standings`)
- [ ] Maç detay sayfası (kadro, istatistik, dakika dakika)
- [ ] Canlı skor için WebSocket (Socket.io) — şimdilik 30 sn'de bir yenileme var
- [ ] Spikerli canlı yayın oynatıcı (expo-video, HLS)
- [ ] Push bildirimleri (maç başladı / gol)
- [ ] Giriş & takım kaydı
