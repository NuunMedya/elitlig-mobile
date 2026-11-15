# Kariyer Yolu — futbolcu kariyeri (WebView bölüm oyunu)

Lig Yolu'nun bölümlü oyunlarından biri. Her bölüm kariyerinin bir **maçıdır**:
Mahalle Ligi'nden Avrupa Kupası'na. Oyun `games/kariyer.js`'tedir (Canvas 2D,
Penaltı ile aynı çizim ailesi ve kamera açısı); RN tarafı yalnız köprüdür
(`components/puzzle/games/kariyer/KariyerGame.tsx`, sözleşme:
`docs/oyun-yenileme-2026-11.md` §2).

## Maç

- Maçta 3–6 **atak** canlı oynanır; araya dakika kartı girer. Rakip de gol
  atar: takvimli goller + kaybettiğin toptan **kontra** (olasılık `counterP`).
- Maç sonunda rakipten çok golün varsa kazanırsın. Berabere / geride bitince
  çerçeve reklamla **uzatma** sunar (`fail {extra}` → `continue {attacks}`).
- **Reyting** 6,0'dan başlar: gol (köşe / doksan / verkaç golü / kafa /
  frikik süsleriyle), çalım, süper çalım, verkaç artırır; top kaybı ve kaçan
  şut düşürür. Yıldız: kazanç 1★, `star2` 2★, `star3` 3★ (uzatmayla en çok 2★).

## Atak türleri

| Tür | Oynanış |
| --- | --- |
| atak | Topla kaleye koşu (kamera arkadan). Sürükle: yön. Dokun: **çalım** (kısa kaçış, bekleme süresi; erken dokunan boşa harcar). Arkadaşa dokun: **verkaç** (pas çizgisi kırmızıysa rakip keser; dönüşte yakındaki baskı geride kalır). Ceza sahasında zaman yavaşlar → Penaltı'nın nişan + güç şutu; kaleci çıkıp açıyı kapatır. |
| kontra | Kendi yarı sahandan uzun, hızlı koşu; arkandan kovalayan rakip. |
| penalti | Penaltı'daki gibi; kaleci geçmiş köşelerini ezberler. |
| frikik | Baraj önünde; nişan yolu baraja değerse kırmızı görünür. Üstünden doksana ya da yanından. |
| kafa | Kanattan orta: halkanın altına koş, halka yeşilken kalenin vurmak istediğin yerine dokun. |

Rakipler: yaklaşınca geri geri gelip yolunu kapatır (önden çarpışma = top
kaybı), kırmızı şeritle **kayarak müdahale** (şeritten çık ya da kaydığı an
çalım: son anda dokunmak **süper çalım**), arkadaşını adam adama tutan markajcı.

## Kariyer basamakları ve yenilikler

| Bölüm | Basamak | Yenilik (UNLOCKS) |
| --- | --- | --- |
| 1–12 | Mahalle Ligi | koşu ve şut (1), savunmacı + çalım (2), verkaç (4), kayan müdahale (6), penaltı (8), derbi (10), kaleci çıkıyor (12) |
| 13–26 | Amatör Lig | süper çalım (14), frikik (16), kafa (22), ikili pres (26) |
| 27–42 | Bölgesel Amatör | ofsayt (28), yağmur (32), arkadan gelen (36) |
| 43–60 | 3. Lig | kontra atak (45), yoğun savunma (55) |
| 61–78 · 79–96 | 2. Lig · 1. Lig | — (zorluk artar) |
| 97–120 | Süper Lig | gerçek kulübünün forması (kadro bağlıysa) |
| 121+ | Avrupa Kupası | — |

Basamağın ilk maçında **terfi / transfer kartı** (yeni kulüp, genel reyting
artışı). Her 10. bölüm boss maçı (derbi / final, bir atak fazla), 5'in
katları nefes. Stadyum basamakla büyür (tribün yüksekliği ve doluluğu, panolar).

Zorluk `d = 1 − e^(−(N−1)/52)` (0..0,92): savunmacı sayısı / hızı / kayma
menzili, kalecinin refleksi ve çıkışı, yeşil bölge, nişan süresi, rakip golü.
Tablo `levelSpec(N)` (JS) ile `lib/puzzle/levels/kariyer.ts` birebir aynıdır;
genişletmek için `LEVEL_COUNT`'u büyütmek yeter.

## Güçlendiriciler

- **Yeni Kramponlar** (`krampon`, bölüm öncesi): daha hızlı koşu, uzun ve
  çabuk yenilenen çalım, %20 geniş yeşil şut bölgesi.
- **İkinci Şans** (`ikinci_sans`, oyun içi): kötü biten atağı aynı dizilimle
  yeniden oyna (bölüm öncesi seçilirse ilk kullanım bedava).

## Denetim

`npm run check:kariyer` — tablo JS/TS eşliği, mekanikler (kayma / çalım,
pas kesme, ofsayt, baraj, kafa, dokunuş eşlemesi), bölüm modu sözleşmesi,
güçlendiriciler ve **adalet**: insan benzeri "yetkin" bot bütün bölümleri
oynar; kazanma oranı basamakla düşmeli (1–26 ≈ %85, 97–150 ≈ %50).
