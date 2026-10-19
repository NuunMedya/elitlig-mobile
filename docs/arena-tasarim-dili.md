# Arena — ElitLig mobil tasarım dili

Arena, ElitLig mobil uygulamasının tasarım dilidir. Profesyonel spor ve veri
ürünlerinin (skor uygulamaları, finans panoları) sakin, yoğun ve net dilini
benimser. Bu belge ekran tasarlayan herkesin (insan ya da ajan) başvuru
kaynağıdır; tokenlar `theme/`, ortak bileşenler `components/ui/` altındadır.

## 1. İlkeler

1. **Sakin kâğıt, renk sinyaldir.** Zemin çok açık lavanta-gri kâğıt
   (#F7F5FB), kartlar beyaz ve GÖLGESİZDİR. Renk yalnız bir şey
   SÖYLEDİĞİNDE kullanılır:
   - `brand` (derin mor #6D28D9) → aksiyon ve seçili durum (birincil düğme,
     seçili sekme/çip, bağlantı, takip yıldızı, alt menü seçimi).
   - `accent` (pembe #DB2777, koyuda #F472B6) → veri ve ikincil vurgu
     (istatistik barı, oran, yarışma/öne çıkan içerik; koyu temada seçili
     alt menü sekmesi).
   - `live` (kırmızı) → canlı.
   - `win/draw/loss` → sonuç; `warn/danger` → uyarı.
   Süs için renk kullanılmaz; renkli ikon pulları yalnız bir kategori
   kimliği taşıdığında (Kulübüm ızgarası gibi) kabul edilir.
2. **İki yüzey ailesi.**
   - **Kâğıt** (`colors.bg` zemin, `surface1` kart): listeler, içerik, formlar.
   - **Sahne** (`gradientInk` / `inkBlock`, koyu mor #2A0E5E): kimlik ve skor
     anları — maç skorbordu, takım/oyuncu kimliği, vitrin maçı. Alt menü
     artık sahne DEĞİLDİR: açık temada beyaz, koyu temada kart yüzeyi. Sahnede metin
     `onDark`, ikincil metin `onDarkMuted`, marka etiketi `brandOnDark`.
     Sahne bir ekranda en fazla BİR kez, ekranın tepesinde kullanılır.
3. **Hiyerarşi tipografiyle kurulur, kutuyla değil.** Bölüm başlığı + boşluk
   çoğu zaman yeterlidir; her şeyi karta koyma. İç içe kart yasaktır.
4. **Yoğun ama nefes alan.** Ekran kenarı 16px (`layout.screenPadding`),
   bölümler arası 24px (`layout.sectionGap`), kart iç boşluğu 14–16px.
   Satırlar 52/66px; dokunma hedefi en az 44px.
5. **Rakam kahramandır.** Skor, puan, sıra gibi sayılar Archivo
   (`type.score*`, `type.metric*`, `type.tableNum*`) ile büyük ve tabular
   yazılır; etiketleri küçük, büyük harfli `overline`/`micro`dur.
6. **Her durum tasarlanır.** Yükleniyor (iskelet, `Skeleton*`), boş
   (`EmptyState` — ikon + tek cümle + bir eylem), hata (`ErrorState`),
   giriş gerektiren (misafir kartı + "Giriş yap").

## 2. Tokenlar (özet)

| Rol | Token |
| --- | --- |
| Sayfa zemini | `colors.bg` (#F7F5FB / koyu #100820) |
| Kart | `colors.surface1` + `hairline` `colors.border` + `elevate(1)` (gölgesiz) |
| İkinci katman (input, çip, ray) | `surface2`, `surface3` |
| Metin | `textPrimary` / `textSecondary` / `textTertiary` |
| Sahne | `gradientInk`, `inkBlock`, `onDark`, `onDarkMuted`, `inkPill`, `inkTile` |
| Yarıçap | kart `radius.xl` (16) · iç eleman `radius.md` (12) · sahne `radius.xxl` · düğme/çip `radius.pill` |
| Yazı aileleri | arayüz ve başlık **Plus Jakarta Sans** (`fonts.regular/medium/semibold/heading`) · rakam **Archivo** (`fonts.display/bold`) |
| Tipografi | sekme kökü `largeTitle` (28) · kimlik `display` (24) · ekran `h1` (19) · kart başlığı `h2` · satır `h3` · gövde `body` · meta `bodySm`/`caption` · etiket `overline` |

Kurallar (`npm run check:tokens` denetler): çıplak hex yok, `fontWeight` yok
(`fontFamily: fonts.semibold`), çıplak `borderRadius: <sayı>` yok (≤4 hariç),
gradyan ekseni yatay sağdan sola, kontrast ≥ 4.5.

## 3. Başlıklar

`ScreenHeader` iki yüzey taşır:
- **Kâğıt** (varsayılan, `hero` yokken): sekme kökleri ve liste ekranları.
  Kök ekranda (geri oku yok) başlık 28px büyük başlıktır (`type.largeTitle`);
  eylem ikonları çıplak ikondur (halkasız), üst satır (`overline`) sessiz gridir.
- **Sahne** (`hero` verildiğinde ya da `variant="stage"`): takım, oyuncu,
  maç gibi kimlik sayfaları. Kimlik bloğu (`hero`) kaydırınca kapanır.

Başlığın içine verilen `Tabs` ve `LeaguePicker` yüzeyi kendiliğinden öğrenir
(`HeaderToneContext`), `tone` geçmeye gerek yoktur.

## 4. Bileşen sözlüğü

| İhtiyaç | Bileşen |
| --- | --- |
| Maç (liste) | `MatchCard`, yatay şerit `MatchCardRail` |
| Takım/oyuncu satırı | `TeamRow`, `PlayerRow` |
| Ayar/menü satırı | `ListRow` (grup içinde `position`) |
| Kapı ızgarası | `HubGrid` + `HubTile` (`inset="flush"` aynı sözleşme) |
| Kısayol | `ActionRow` + `ActionTile` |
| Sayı kutusu | `MetricGrid` + `MetricTile` |
| Bölüm başlığı | `SectionHeader` (`inset="flush"`: kenar boşluklu kapsayıcı içinde) |
| Süzgeç | `SegmentedControl` (2–4 seçenek), `Chip`/`ChipGroup` (çok seçenek) |
| Sayfa sekmeleri | `Tabs` (başlığın `tabs` yuvasında) |
| Lig seçici | `LeaguePicker` — TEK bileşen: hap "Ankara · FREELİG · 15. Sezon ▾" + sabitlenmiş lig çipleri; başlığın `bottom` yuvasında. Alt sayfa (`ScopeSheet`) il → lig → sezon; Arşiv sezon adımında |
| Takip | `FollowActions` (sahne üstünde), satırda `FollowStar`, takip edilen öğede `FollowBell`; hepsi `useFollowFlow()` |
| Alt eylem çubuğu | `ActionBar` (form/karar ekranlarında sabit birincil düğme) |
| Kaplama | `BottomSheet`, `useToast` |

## 5. Ekran kalıpları

- **Sekme kökü:** kâğıt büyük başlık → (isteğe bağlı) süzgeç bandı (`bottom`)
  → içerik. İlk ekranda kullanıcının en çok baktığı şey en üstte.
- **Detay (kimlik):** sahne başlık + kimlik (`hero`) + takip/eylem şeridi +
  sekmeler → kâğıt içerik.
- **Form:** kâğıt başlık (geri oklu) → gruplanmış alanlar (`Input`) → altta
  sabit birincil düğme.
- **Merkez (hub):** kimlik/özet kartı → bekleyen işler → `HubGrid`.

## 6. Bilgi mimarisi kuralları

- **Alt çubuk:** Skorlar · Takip · Lig · Kulübüm · Profil. Uygulama Skorlar
  ile açılır.
- **Takip = bildirim.** Takım, maç ya da lig takip edildiği anda o takibin
  bildirim türleri alt sayfada sorulur (`useFollowFlow().toggle`). Doğrudan
  `toggleFavorite*` çağıran yeni "Takip et" düğmesi yazılmaz.
- **Sabitleme ≠ takip.** Sabitleme yalnız görünüm tercihidir (cihazda):
  Skorlar'da lig grubu üstte, lig seçicide çip olur; bildirim üretmez.
- **Tek gelen kutusu.** Bildirim zili ve mesaj kapıları her ekranda
  `/gelen-kutusu` (Bildirimler | Mesajlar) ekranına açılır.
- **Detay sayfaları:** sekme seti veriye göre değişmez (boş sekme boş durum
  gösterir); paylaş her zaman başlığın sağ üst eylemidir.
- **Rozet ve sayı:** okunmamış rozeti her yerde menekşe (`brand`); kırmızı
  yalnız canlı maç sayısıdır. Ondalık ve binlik sayılar `formatNumber` /
  `formatDecimal` / `formatPercent` ile Türkçe yazılır ("7,4", "12.500");
  reyting dahil (`ratingLabel`).

## 7. Ses ve metin

Türkçe, kısa, eylem odaklı. Düğme metni fiildir ("Takip et", "Kaydet").
Boş durum cümlesi ne olduğunu ve ne yapılabileceğini söyler. Büyük harf
yalnız `overline`/`micro` etiketlerde (`upperTR` ile).
