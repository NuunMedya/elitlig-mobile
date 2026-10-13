# Arena — ElitLig mobil tasarım dili

Arena, ElitLig mobil uygulamasının tasarım dilidir. Profesyonel spor ve veri
ürünlerinin (skor uygulamaları, finans panoları) sakin, yoğun ve net dilini
benimser. Bu belge ekran tasarlayan herkesin (insan ya da ajan) başvuru
kaynağıdır; tokenlar `theme/`, ortak bileşenler `components/ui/` altındadır.

## 1. İlkeler

1. **Nötr sahne, renk sinyaldir.** Zemin gri kâğıt, kartlar beyazdır. Renk
   yalnız bir şey SÖYLEDİĞİNDE kullanılır:
   - `brand` (elektrik menekşe) → aksiyon ve seçili durum (birincil düğme,
     seçili sekme/çip, bağlantı, takip yıldızı).
   - `accent` (zümrüt) → veri (istatistik barı, oran, vurgulanan takım).
   - `live` (kırmızı) → canlı.
   - `win/draw/loss` → sonuç; `warn/danger` → uyarı.
   Süs için renk kullanılmaz; renkli ikon pulları yalnız bir kategori
   kimliği taşıdığında (Kulübüm ızgarası gibi) kabul edilir.
2. **İki yüzey ailesi.**
   - **Kâğıt** (`colors.bg` zemin, `surface1` kart): listeler, içerik, formlar.
   - **Sahne** (`gradientInk` / `inkBlock`, grafit): kimlik ve skor anları —
     maç skorbordu, takım/oyuncu kimliği, vitrin maçı, alt menü. Sahnede metin
     `onDark`, ikincil metin `onDarkMuted`, marka etiketi `brandOnDark`.
     Sahne bir ekranda en fazla BİR kez, ekranın tepesinde kullanılır.
3. **Hiyerarşi tipografiyle kurulur, kutuyla değil.** Bölüm başlığı + boşluk
   çoğu zaman yeterlidir; her şeyi karta koyma. İç içe kart yasaktır.
4. **Yoğun ama nefes alan.** Ekran kenarı 14px (`layout.screenPadding`),
   bölümler arası 22px (`layout.sectionGap`), kart iç boşluğu 14–16px.
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
| Sayfa zemini | `colors.bg` (#F3F4F6 / koyu #0B0D11) |
| Kart | `colors.surface1` + `hairline` `colors.border` + `elevate(1)` |
| İkinci katman (input, çip, ray) | `surface2`, `surface3` |
| Metin | `textPrimary` / `textSecondary` / `textTertiary` |
| Sahne | `gradientInk`, `inkBlock`, `onDark`, `onDarkMuted`, `inkPill`, `inkTile` |
| Yarıçap | kart `radius.xl` (18) · iç eleman `radius.md` (12) · sahne `radius.xxl` · düğme/çip `radius.pill` |
| Tipografi | sayfa başlığı `display` · kart başlığı `h2` · satır `h3` · gövde `body` · meta `bodySm`/`caption` · etiket `overline` |

Kurallar (`npm run check:tokens` denetler): çıplak hex yok, `fontWeight` yok
(`fontFamily: fonts.semibold`), çıplak `borderRadius: <sayı>` yok (≤4 hariç),
gradyan ekseni yatay sağdan sola, kontrast ≥ 4.5.

## 3. Başlıklar

`ScreenHeader` iki yüzey taşır:
- **Kâğıt** (varsayılan, `hero` yokken): sekme kökleri ve liste ekranları.
  Kök ekranda (geri oku yok) başlık 22px büyük başlıktır; eylem ikonları
  beyaz yuvarlak düğmelerdir.
- **Sahne** (`hero` verildiğinde ya da `variant="stage"`): takım, oyuncu,
  maç gibi kimlik sayfaları. Kimlik bloğu (`hero`) kaydırınca kapanır.

Başlığın içine verilen `Tabs` ve `ScopeChip` yüzeyi kendiliğinden öğrenir
(`HeaderToneContext`), `tone` geçmeye gerek yoktur.

## 4. Bileşen sözlüğü

| İhtiyaç | Bileşen |
| --- | --- |
| Maç (liste) | `MatchCard`, yatay şerit `MatchCardRail` |
| Takım/oyuncu satırı | `TeamRow`, `PlayerRow` |
| Ayar/menü satırı | `ListRow` (grup içinde `position`) |
| Kapı ızgarası | `HubGrid` + `HubTile` |
| Kısayol | `ActionRow` + `ActionTile` |
| Sayı kutusu | `MetricGrid` + `MetricTile` |
| Bölüm başlığı | `SectionHeader` |
| Süzgeç | `SegmentedControl` (2–4 seçenek), `Chip`/`ChipGroup` (çok seçenek) |
| Sayfa sekmeleri | `Tabs` (başlığın `tabs` yuvasında) |
| Kapsam | `ScopeBar` (il · lig · sezon), başlıkta `ScopeChip` |
| Takip | `FollowActions` (sahne üstünde) |
| Kaplama | `BottomSheet`, `useToast` |

## 5. Ekran kalıpları

- **Sekme kökü:** kâğıt büyük başlık → (isteğe bağlı) süzgeç bandı (`bottom`)
  → içerik. İlk ekranda kullanıcının en çok baktığı şey en üstte.
- **Detay (kimlik):** sahne başlık + kimlik (`hero`) + takip/eylem şeridi +
  sekmeler → kâğıt içerik.
- **Form:** kâğıt başlık (geri oklu) → gruplanmış alanlar (`Input`) → altta
  sabit birincil düğme.
- **Merkez (hub):** kimlik/özet kartı → bekleyen işler → `HubGrid`.

## 6. Ses ve metin

Türkçe, kısa, eylem odaklı. Düğme metni fiildir ("Takip et", "Kaydet").
Boş durum cümlesi ne olduğunu ve ne yapılabileceğini söyler. Büyük harf
yalnız `overline`/`micro` etiketlerde (`upperTR` ile).
