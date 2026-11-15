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

## 2. WebView bölüm modu (penalti · kadro · savunma · kariyer)

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

Bölüm sayıları (en az): kadro **250**, savunma **100**, penalti **150**, kariyer **150**,
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

### Güçlendirici anahtarları (sunucu `rules.BOOSTERS`; mobil AYNEN bu anahtarları kullanır)

| Oyun | Anahtar | Başlık | Fiyat |
| --- | --- | --- | --- |
| penalti | `nisan` | Nişangâh | 100 |
| penalti | `ek_sut` | Ek Şut | 120 |
| kadro | `kalkan` | Kalkan | 120 |
| kadro | `takviye` | Takviye +5 | 100 |
| savunma | `gunes` | Güneş Paketi | 100 |
| savunma | `duvar` | Ek Stoper | 120 |

Her yeni anahtardan başlangıçta 2 tane vardır; mağazada `<anahtar>_3` paketi
(fiyat × 3 − 40). Seri hediyesi oyunun anahtarlarını katalog sırasıyla verir:
1. basamak ilk anahtar, 2. basamak ilk iki, 3. basamak her birinden 1 (en çok 3).
`start` yanıtındaki `streak_boosters` ÜCRETSİZDİR: istemci kullanınca
`finish.boosters_used`'a yazabilir; sunucu önce ücretsiz olanlardan düşer.

### Sunucu sabitleri (Ekonomi v3; değişirse burası güncellenir)

- `ECONOMY_V3_FROM` = `2026-11-15T21:00:00Z` (İstanbul 16 Kasım 00:00).
- Rekor yıldızı (slalom, sektir, seri, kimbu, tahmin): k. eşik `birim × k^1.5`
  (birim `city.ARENA_STAR_UNIT`), değeri `1 + floor((k−1)/4)`, en çok 30 eşik
  (R ≤ 128). Önceki en iyi eski satırları da kapsar. Ödenmeyen kısım (tavan)
  borç olarak sonraki birim üstü turlarda ödenir. Katılım: rekor değilse,
  skor ≥ birim ve ≥ en iyinin %50'si → 1★, oyun başına günde 2.
- Tavanlar: satır 10, oyun/gün 15, toplam/gün 30.
- Günün Testi: skor eşikleri 10 · 36 · 62 · 88 · 114 (≈ 1/3/5/7/9 doğru) → 1–5★,
  UTC günü başına ilk doğrulanmış skor.
- `levelBonus(l)` = `min(4, floor(min(l,300)/100) + (l % 10 == 0 ? 1 : 0))`;
  yalnız v3 sonrası ilk kazançta kaydedilen tabandan (o anki geçilmiş bölüm)
  SONRAKİ bölümlere (geriye dönük prim yok).
- Hediyeler: yıldız sandığı her 40 bölüm yıldızında (150 jeton + 2 güçlendirici),
  bölüm sandığı her 10. bölümün ilk geçişinde (50 jeton + 1 güçlendirici; eski
  "kupa maçı" +50 jetonuna ek).
- Reklam günlük hakları: `life` 5 (eski ad-life ile aynı sayaç), `double_coins` 8
  (kazançtan sonra 30 dk içinde, kazanç başına 1), `booster` 3, `spin` 1;
  en az 12 sn izleme, jeton 10 dk geçerli.
- `/api/puzzle/me` → `profile.ads` (`{kind: {left, per_day, seconds}}`),
  `profile.gifts` (`streaks`, `star_chest {progress, every, opened}`, `level_chest`).
- Arena skor yanıtı `entry.star_detail: {record, participation, next_record_at, participation_left}`;
  `POST /api/arena/sessions` yanıtı canlı oyunlarda `lives: {lives, max_lives, next_life_at}`.
- XP görünümü (`city.xp`): `mode:"weekly"`, `week {key, xp, stars, converts_at, claim_until}`,
  `claim_week {key, xp, stars, expires_at, last_day} | null`; `pending` /
  `claimable_stars` = şu an toplanabilir (yalnız Pzt–Çar dolu).

## 6. Oyun ana sayfası

Her oyunun bir ana sayfası vardır (`/lig-yolu/<oyun>` bölümlüler için,
`/oyun/<oyun>` sonsuz ve bilgi oyunları için): üstte avatar · jeton (+) ·
can (sayaç) · yıldız · ayarlar; altında etkinlik/sandık çubuğu; yanlarda
yuvarlak düğmeler (günlük hediye, reklamla ödül, güçlendirici mağazası,
sıralama, seri, kurallar); ortada büyük yeşil "Bölüm N" (ya da "Oyna ·
Rekor X") düğmesi; harita/yol bunun arkasında ya da altında.

## 7. Çevrimdışı oyun (internet yokken oyna, ilk bağlantıda kaydet)

WebView oyunları (`games/*.js`) uygulamanın İÇİNDE paketlidir
(`lib/game/web/games.generated.ts`, satır içi HTML); ağdan hiçbir şey
yüklemez. Çevrimdışı oynamayı engelleyen yalnız sunucu çağrılarıdır. Kural:
**sunucuya ulaşılamıyorsa oyun yine başlar; sonuç cihazdaki kuyruğa yazılır
ve bağlantı gelince gönderilir.**

İstemci (`lib/offline/`):
- `isOfflineError(e)`: ağ hatası / zaman aşımı (HTTP yanıtı yok). 4xx/5xx
  çevrimdışı DEĞİLDİR (ör. 409 NO_LIVES gerçek bir rettir).
- Yerel ayna: son bilinen `PuzzleMe` (ilerleme, can, jeton, güçlendirici)
  AsyncStorage'da hesap başına saklanır; çevrimdışıyken harita, can sayacı
  (30 dk kuralı yerelde işler) ve bölüm kilidi bu aynadan okunur ve
  kuyruktaki sonuçlarla iyimser güncellenir.
- Kuyruk (`elitlig.offline.queue.v1.<userId>`): her olay bir `id` (uuid),
  `kind` (`level` | `arena`), `startedAt`, `finishedAt` (cihaz saati, ms),
  `durationMs` (monotonik ölçüm) taşır.
  · `level`: `{game, level, won, stars, score, boosters_used}`
  · `arena`: `{game, score, stats, v}`
- Gönderim: uygulama öne gelince, her başarılı API yanıtından sonra ve
  oyun merkezine girildiğinde `POST /api/puzzle/sync {events:[…]}` tek
  istekte. Sunucu her olay için `{id, status:"ok"|"dup"|"rejected", reason}`
  döner; ok/dup/rejected olanlar kuyruktan silinir, ağ hatasında kalır.
- Çevrimdışıyken başlangıçta sunucu oturumu/jetonu yoktur; bu normaldir.
- Bilgi yarışmaları: soru havuzu çevrimiçiyken cihaza önbelleklenir;
  çevrimdışı tur önbellekten oynanır. Günün Testi bugünün soruları
  önbellekteyse oynanır, yoksa "internet gerekli" der.
- Misafir: kuyruk yok; yerel rekor ve yerel can (zaten cihazda).

Sunucu (`POST /api/puzzle/sync`, idempotent):
- Olay `id`'si kayıtlıysa `dup` (tekrar ödül yok). Kimlikler profil JSON'unda
  sınırlı bir halkada ya da küçük bir tabloda tutulur.
- Olaylar `finishedAt` sırasıyla işlenir. `finishedAt` gelecekte ya da 14
  günden eskiyse `rejected`.
- `level`: bölüm `cleared+1`'i geçemez (sırayla işlenince çevrimdışı açılan
  ardışık bölümler kabul edilir); `durationMs ≥ PLAY.minMs`; günlük kazanç
  sınırı **sunucunun alış gününe** göre sayılır (geçmişe tarihleyip tavanı
  aşmak olmaz); kayıp 1 can düşer (can 0'sa yine kaydedilir, eksiye inmez).
- `arena`: makullük (istatistik tavanı + `durationMs` ile saniye başı hız)
  geçerse doğrulanmış sayılır; yıldızı ve günlük tavanı **alış anına** göre
  hesaplanır (`created_at` = sunucu zamanı; `played_at` ayrıca saklanabilir).
  Can, çevrimdışı turda düşülmez (zaten cihazda düşüldü).
- Yanıt: güncel `profile`, `games` ve toplam kazanılan yıldız/jeton özeti
  (istemci "Çevrimdışı oyunların kaydedildi: +12★" gösterir).
