# Kariyer Yolu — futbolcu kariyeri oyunu ve 2D oyun motoru

Lig Yolu'nun beşinci oyunu. Mahalle sahasından amatör lige: her seviye bir maç
günüdür ve maçın yalnız oyuncunun topla buluştuğu **anları** oynanır.

## Oynanış

- **Şut** — parmağı kaleye doğru çek ve bırak; çekişin uzunluğu şutun sertliği.
  Kaleci topun gideceği noktaya atılır; ters köşe ve direk dibi gol olur.
- **Pas** — koşan arkadaşının önüne doğru çek ve bırak; top oraya vardığında o
  da orada olmalı. Araya giren savunmacıya çarpan pas kesilir.
- **Çalım** — parmağı basılı tutup sağa sola kaydır; savunmacılara çarpmadan
  çizgiye ulaş.

An skorlarından maç reytingi (4,0–10,0) çıkar; eşiği geçen maç kazanılır,
yüksek reyting 2 ve 3 yıldız getirir.

## Seviyeler

| Seviye | Basamak | Ne açılır |
| --- | --- | --- |
| 1–20 | Mahalle Sahası | şut (1), pas (6), çalım (11) |
| 21–40 | Amatör Lig | hızlı kaleci, kalabalık savunma, 4–5 an |
| 41+ | Amatör Lig (zorlaşarak) | — |

Her 10. seviye kupa maçıdır (bir an fazla, yüksek eşik); 5'in katları nefes
seviyesidir. Üretim belirlenimcidir: `generateKariyerLevel(level, hat)`.

## Kimlik ve gelişim

- Gerçek oyuncu profili bağlı üye kendi adı ve mevkisiyle başlar; hattına göre
  başlangıç özellikleri ve an ağırlıkları değişir (forvet daha çok şut çeker).
  Profili olmayan üye çaylak olarak sıfırdan başlar.
- Dört özellik (şut, pas, teknik, hız) anların fiziğini değiştirir.
- Kazanılan her yıldız bir antrenman puanıdır; maç öncesi üç karttan biri
  seçilir. Yıldızlar sunucudadır, dağıtım cihazda saklanır.
- Güçlendiriciler: **Yeni Kramponlar** (maç boyunca +8) ve **İkinci Şans**
  (kötü biten anı yeniden oyna).

## Motor

`lib/kariyer/sim.ts` — Skia + Reanimated üstünde küçük bir 2D motor:

| Parça | İş |
| --- | --- |
| `createMoment` | anın başlangıç durumunu kurar (JS; tohumlu) |
| `stepMoment` | fizik ve kurallar (worklet; arayüz iş parçacığı) |
| `drawMoment` | sahneyi her karede tek bir `SkPicture`'a çizer (worklet) |

Durum düz bir nesnedir ve paylaşılan değerde yerinde değiştirilir; React yalnız
evre değişince yeniden çizer. Yeni bir an türü eklemek: `KIND_*` sabiti,
`createMoment` içinde kurulum, `stepMoment` içinde kural, `drawPitch` içinde
zemin. Renkler `lib/kariyer/palette.ts` (basamak başına bir palet).

Çerçeve (harita, can, jeton, mağaza, sıralama, sunucu eşitlemesi) Lig Yolu'nun
kendisidir: `components/puzzle/games/kariyer` bir `PuzzleGameModule`'dür;
sunucuda `services/puzzle/rules.js` içinde `kariyer` oyunu ve iki
güçlendiricisi kayıtlıdır.

## Sürüm notu

`@shopify/react-native-skia`, `react-native-reanimated` ve
`react-native-worklets` yerel paketlerdir: bu oyun mağaza sürümü gerektirir
(EAS Update ile gitmez). Sonraki seviye, palet ve denge değişiklikleri
mağazasız güncellenebilir.
