# Oyun yenilemesi — Kasım 2026 (ortak sözleşme)

Bu belge, oyun merkezi yenilemesinde birden çok parçanın (sunucu ekonomisi,
oyun ana sayfaları, bölümlü arcade oyunlar, bulmacalar) birbirine nasıl
bağlandığını tanımlar. Bir parçayı değiştiren, buradaki sözleşmeyi bozmamalı;
bozması gerekiyorsa önce bu belgeyi günceller.

## 1. Oyun türleri

| Tür | Oyunlar | İlerleme | Yıldız kaynağı | Can |
| --- | --- | --- | --- | --- |
| **Bölümlü** (Lig Yolu) | uclu, ucle, soyunma, kantin, kariyer, **penalti, kadro, savunma** | `/api/puzzle/:game/start` → `/finish` | Bölüm başına 1–3★ + bölüm primi (sunucu `rules.levelBonus`) | Oyun başına 5, kaybedilen bölüm 1 can |
| **Sonsuz** | slalom, sektir | arena skoru | Rekor yıldızı (§3) + küçük katılım yıldızı | Her tur 1 can (`/api/arena/sessions` açılırken düşer) |
| **Bilgi** | seri (Gol Düellosu), kimbu, tahmin (Kim Kazandı?) | arena skoru | Rekor yıldızı (§3) + küçük katılım yıldızı | Her tur 1 can |
| **Günlük** | gunun (Günün Testi) | günde 1 | Doğru sayısına göre (en çok 5★) | Yok (zaten günde 1) |
| **Lig yarışmaları** | Fantezi, Tahmin Ligi | haftalık | `city.tribunStars` (haftalık tavanlı) | Yok |

Penaltı, Kadro Koşusu ve Savunma Hattı artık **bölümlü** oyunlardır: Lig Yolu
çerçevesinin (`app/lig-yolu/*`, `lib/puzzle/registry.ts`) birer modülüdür.
Eski `/penalti`, `/kadro`, `/savunma` rotaları `/lig-yolu/<oyun>` ana sayfasına
yönlenir. Bu üç oyunun arena skorları rekor tablosu için gönderilmeye devam
edebilir ama `ECONOMY_V3_FROM` sonrasında **arena yıldızı vermez** (yıldızı
bölüm verir; çift sayım olmaz).

## 2. WebView bölüm modu (penalti · kadro · savunma)

Oyun modülünün `Game` bileşeni (`components/puzzle/games/<oyun>/`) bir
`WebGame` açar ve TEK bir bölüm oynatır.

RN → oyun (`window.ArenaCmd`):

```
{type:"config", levelMode:true, level:N, boosters:["anahtar", …], sound, reduceMotion, roster, hudInset}
{type:"start"}                       // bölümü başlat (bölüm seçme ekranı YOK)
{type:"booster", key:"anahtar"}      // oyun içi güçlendirici (çerçeve stoktan düştü)
{type:"continue", extra:{…}}         // reklamla devam (ör. +1 hak / +5 sn); oyun "fail" sonrası bekliyorsa sürer
{type:"pause"} · {type:"resume"}
```

Oyun → RN:

```
{type:"ready"}
{type:"levelInfo", level:N, goal:"…", tip:"…"|null}       // isteğe bağlı
{type:"fail", level:N, canContinue:true|false}            // isteğe bağlı: kaybetmek üzere, reklamla devam sorulabilir
{type:"over", score, stats:{level:N, won:0|1, stars:0..3, …oyuna özgü}}
```

- `levelMode:true` iken oyun kendi bölüm seçme ekranını, kendi kalıcılığını
  (`store`) ve bölüm bitince "sonraki bölüm" akışını GÖSTERMEZ. Bölüm bitince
  yalnız `over` gönderir; sonuç penceresi RN çerçevesinindir.
- `levelMode` yokken (eski davranış) oyun eskisi gibi çalışabilir; ama yeni
  rotalar hep bölüm modunu kullanır.
- Bölüm üretimi BELİRLENİMCİDİR: aynı N her cihazda aynı bölüm.
- Her oyunun TS tarafında `lib/puzzle/levels/<oyun>.ts` dosyası vardır:
  bölüm sayısı (`LEVEL_COUNT`), `goalSummary(level)` ve hangi bölümde hangi
  yeni özelliğin/karakterin açıldığı (`UNLOCKS`). JS oyunundaki tablolarla
  AYNI olmalıdır (kontrol betiği karşılaştırır ya da tek kaynak üretilir).

Bölüm sayıları (en az): kadro **250**, savunma **100**, penalti **150**,
uclu **100** (genişletilebilir: yeni bölüm eklemek = seviye tablosuna satır
eklemek / üreteç aralığını büyütmek; mevcut bölümler DEĞİŞMEZ).

## 3. Yıldız ekonomisi v3 (sunucu, `services/puzzle/city.js` + `economy.js`)

- `ECONOMY_V3_FROM` (İstanbul 2026-11-16 00:00) öncesindeki kayıtlar ESKİ
  kuralla hesaplanır; sonrası yeni kuralla. Böylece yeniden hesaplanan
  toplamlar hiçbir oyuncu için AZALMAZ (harcanabilir yıldız eksiye düşmez).
- **Rekor yıldızı** (sonsuz + bilgi): doğrulanmış skor, o oyundaki önceki en
  iyi doğrulanmış skoru geçerse `R(yeni) − R(eski)` yıldız. `R` artan
  eşiklerle büyür ve her yeni eşik bir öncekinden biraz daha fazla yıldız
  değerindedir ("rekor yükseldikçe yıldız artar"). Toplam rekor yıldızı
  `R(en iyi)` ile sınırlıdır (tekrar oynayarak çoğaltılamaz).
- **Katılım yıldızı**: rekor kırılmayan turda, skor kişisel en iyinin belli
  oranını geçerse 1★; oyun başına günde en çok birkaç tane.
- Günlük tavanlar sürer (oyun başına ve toplam).
- **Bölümlü oyunlar**: bölüm başına en iyi 1–3★ + `levelBonus(level)` (ilk
  geçişte, ileri bölümlerde ölçülü artar). Toplam yıldız haritadan
  belirlenimci hesaplanır.
- **XP → yıldız haftalık**: XP İstanbul haftası (Pzt–Paz) içinde birikir.
  Hafta kapanınca (Pazartesi 00:00) o haftanın XP'si 10 XP = 1★ ile
  toplanabilir olur ve **3 gün** (Pzt, Salı, Çarşamba; Perşembe 00:00'da
  yanar) içinde "Yıldızları topla" ile alınmalıdır. Haftada bir dönüşüm.

## 4. Can (bütün oyunlar)

Can kaydı tek yerde: `puzzle_profiles.stadium.lives[<oyun>]` (en çok 5,
30 dk'da 1). `rules.LIFE_GAMES` = bölümlü oyunlar + sonsuz + bilgi oyunları.
`/api/puzzle/me` → `profile.lives_by_game` hepsini döndürür. Reklamla can
(`/ad-life/start {game}`) ve can doldurma (`/shop can_doldur {game}`) hepsinde
çalışır. Arena oturumu açılırken (`POST /api/arena/sessions`) can düşer;
can yoksa `409 NO_LIVES` (`next_life_at` ile). Misafir oyuncunun canları
cihazda tutulur (aynı 5 / 30 dk kuralı).

## 5. Hediyeler ve reklam teşvikleri (sunucu yanıt alanları)

`POST /api/puzzle/:game/finish` (kazanç) yanıtındaki `reward` nesnesine:

```
reward.gifts: [{ kind:"streak"|"chest"|"star_chest"|"level_chest", title, coins?, boosters?:{key:n}, stars? }]
reward.streak: { wins: n, next_at: n }          // üst üste kazanma serisi (oyun başına)
reward.ad_double: { token_kind:"double_coins", coins }   // reklamla 2 kat jeton hakkı varsa
```

Genel ödüllü reklam: `POST /api/puzzle/ad/start {kind, game}` →
`{token, seconds}`; `POST /api/puzzle/ad/claim {token}` → ödül + profil.
`kind`: `life` (eski ad-life ile aynı), `double_coins` (son kazancın jetonu
kadar ek jeton, kazanç başına 1), `booster` (günde birkaç ücretsiz
güçlendirici), `spin` (günlük çark). Günlük hak sayıları sunucu sabitidir.

Seri hediyesi (Royal Match'teki taç serisi gibi): aynı oyunda üst üste
kazanılan bölümler 1/2/3 basamağa çıkar; bir sonraki bölüm başında
ücretsiz güçlendiriciler verilir (sunucu `start` yanıtında
`streak_boosters`); kaybedince seri sıfırlanır.

## 6. Oyun ana sayfası

Her oyunun bir ana sayfası vardır (`/lig-yolu/<oyun>` bölümlüler için,
`/oyun/<oyun>` sonsuz ve bilgi oyunları için): üstte avatar · jeton (+) ·
can (sayaç) · yıldız · ayarlar; altında etkinlik/sandık çubuğu; yanlarda
yuvarlak düğmeler (günlük hediye, reklamla ödül, güçlendirici mağazası,
sıralama, seri, kurallar); ortada büyük yeşil "Bölüm N" (ya da "Oyna ·
Rekor X") düğmesi; harita/yol bunun arkasında ya da altında.
