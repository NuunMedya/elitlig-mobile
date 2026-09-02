# UI Kitaplığı — ekran yazan ajanlar için pratik kılavuz

Tek içe aktarma: `import { MatchRow, ScreenHeader, useToast } from "@/components/ui";`
Tokenlar AYRI kapıdan: `import { colors, space, type, radius, layout, elevate, haptics } from "@/theme";`
(Barrel token vermez — `type` tipografi ölçeği ile TS'in `type` sözcüğü aynı sepette karışıyor.)

## Hangi bileşen ne zaman

| Bileşen | Ne zaman |
|---|---|
| `Touchable` | Basılabilir HER şey. Ham RN `Pressable` kullanma. `feedback="row\|card\|button\|icon\|chip\|fab"`, `haptic="selection\|light\|…"` |
| `Surface` / `Card` | Yüzey katmanı / gruplanmış içerik kutusu. **Liste asla Card içine sarılmaz** — liste = `ListRow` grubudur |
| `ListRow` | Ayarlar, menü, profil, sıradan liste satırı. `leading` + `value`/`badge`/`chevron`/`toggle`, `position` ile köşe+ayraç |
| `KeyValueRow` | Detay sayfalarında etiket–değer çifti (kopyalanabilir/bilgi ikonlu) |
| `SectionHeader` / `Divider` | Bölüm başlığı / elle ayraç (`ListRow` ayracı kendi çizer) |
| `Chip` · `ChipGroup` | Çoklu/kaydırmalı süzgeç etiketleri |
| `SegmentedControl` | 2–4 seçenekli VERİ süzgeci — daima kâğıdın üstünde |
| `Tabs` | SAYFA sekmesi — daima mor bloğun içinde (`ScreenHeader tabs={…}`); kâğıt üstündeki tek tük istisna `tone="paper"` verir |
| `Badge` | Durum rozeti. **Ton sözlüğünün evi burası**: `toneColors(tone)`, `withAlpha(hex, .4)` — kendi renk eşlemeni yazma |
| `Button` · `Input` · `Toggle` · `Stepper` | Form öğeleri. `Stepper` skor girişi için (tabular, sabit genişlik) |
| `MatchRow` | Maç listesi satırı. Yükseklik `matchRowHeight(variant, metaMode)` — `getItemLayout` DAİMA bundan kurulur |
| `LeagueGroupHeader` | Maç listesinde lig grubu başlığı (katlanır, favori yıldızlı) |
| `DateStrip` | Fikstür tarih seçici (varsayılan −14…+28 gün, bugün ortalanır) |
| `TeamLogo` · `Avatar` | Takım amblemi / oyuncu-kullanıcı avatarı (eski `TeamCrest` yerine) |
| `TeamRow` · `TeamRowHead` | Takım satırının TEK anatomisi: sıra · amblem · ad + bağlam · sayı. `density="list"` (66px) tanımak, `density="table"` (40px) karşılaştırmak için. Yükseklikler `TEAM_ROW_HEIGHT(_TABLE)` — `getItemLayout` DAİMA bunlardan kurulur |
| `PlayerRow` · `PlayerRowHead` | Oyuncu satırının TEK anatomisi: sıra · mevki halkalı avatar · ad + MEVKİ · tek sayı. Meta, aktif ölçütü tekrar ETMEZ |
| `ScreenHeader` | MOR BLOK — her ekranın açılışı, TEK satır (geri · üst başlık/başlık · eylemler). Güvenli alanı da boyar. Yuvalar: `scope` (kapsam çipi, üst başlık yerine), `hero` (kimlik: amblem/avatar + ad + cam kutular; kaydırınca kapanır), `tabs` (bloğun içinde), `bottom` (bloğun altında, kâğıtta) |
| `LiveBadge` · `RatingPill` · `FormChips` · `ProgressRing` | Canlı nabız · puan hapı · son 5 maç · yüzde halkası |
| `StatBar` | Ev/deplasman karşılaştırması. Tek 4px şerit, ORTADAN bölünür; ev daima mavi, deplasman daima slate — renk kazanana göre DEĞİŞMEZ |
| `GlowTabBar` | ALT MENÜ RAYI — ekranın alt kenarına oturur. Seçim: ikonu saran kapsül + üst kenarda kayan huzme. Sekme listesi `app/(tabs)/_layout.tsx` içinde |
| `MinuteRing` | **İmza öğesi.** Canlı dakika + 90'lık ilerleme halkası. Nabız atan kırmızı noktanın yerini alır |
| `ChalkArc` | **İmza öğesi.** Skor bloğunun arkasındaki %4 opaklıkta orta yuvarlak yayı. Mutlak konumlu katman |
| `SectionHeader` | **İmza öğesi.** Başlığın solunda 2×12px mercan kale direği; `leading` verilirse çizilmez |
| `PitchView` | Kadroyu GÖSTEREN saha (8 kişilik). Düzenleme için `components/PitchLineup.tsx` — ikisi ayrı bileşendir |
| `EventIcon` | Maç olaylarının SVG ikon sözlüğü (gol, kart, değişiklik, asist, VAR). Ionicons'ta dikey kart yok; hepsi burada |
| `Sparkline` | Tek satırlık gidişat çizgisi (son 10 maç reytingi). Eksen/ızgara/etiket yok |
| `HeroCarousel` | Açılış manşet şeridi. 16:10, yapışkan kaydırma, 6sn otomatik geçiş, dokununca KALICI durur |
| `Skeleton*` | İLK yükleme. Hazır şablonlar: `SkeletonMatchRow/ListRow/Table/Standings/Card/Hero/ListFooter` |
| `EmptyState` · `ErrorState` | Veri yok / hata. `ErrorState variant="banner"` ekranda BAYAT VERİ varken (veriyi silme) |
| `Refresh` / `useRefresh` | Aşağı çekip yenileme |
| `ToastProvider` / `useToast` | Kısa geri bildirim. Sağlayıcı `app/_layout.tsx`'te, SafeAreaProvider içinde |
| `BottomSheet` | Seçim/eylem menüsü, filtre paneli. İçine FlatList koyacaksan `scrollable={false}` |
| `useHeaderScroll` | `ScreenHeader`ın daralma bağlantısı — kendi `Animated.event`ini yazma. `hero` veren ekranda ZORUNLU: kimlik ancak bununla kapanır |
| `FAB` / `useFabAutoHide` | Ekran başına TEK birincil eylem |
| `TabBarIcon` | Sekme çubuğu ikonu; `badge="live"\|"dot"\|sayı`, `indicator` |

## Bağlantı kalıpları (ezberle)

```tsx
const { scrollY, scrollProps } = useHeaderScroll();          // kendi Animated.event'ini YAZMA
const refresh = useRefresh(q.refetch, { refreshing: q.isRefetching });
const fab = useFabAutoHide();
<ScreenHeader title="Fikstür" scrollY={scrollY} />
<FlatList {...scrollProps} onScroll={fab.onScroll} refreshControl={refresh.control}
          getItemLayout={(_, i) => ({ length: H, offset: H * i, index: i })} />
```
Yükleme stratejisi: `isLoading` → iskelet · `isRefetching` → `useRefresh` · arka plan `isFetching` → görsel yok.

## Tuzaklar

1. **`space.md = 12` ama `spacing.md = 16`.** Yeni kod DAİMA `space` kullanır; `spacing` yalnız eski dosyalar için.
2. `colors.pitch` = ekran zemini (eski ad). Saha yeşili `colors.pitchGreen`.
3. `Touchable` haptiği yalnız `onPress` verilmişse tetiklenir; uzun basma haptiğini çağıran verir.
4. `MatchRow`/`DateStrip`/`ListRow` memo'lu — `onPress`, `markers`, `onChange` prop'larını `useCallback`/`useMemo` ile sabitle, yoksa memo işe yaramaz.
5. `useHeaderScroll` JS sürücüsü kullanır (yükseklik animasyonu); `useNativeDriver: true` ile kendi bağlantını verirsen RN çalışma anında hata atar.
6. Şartnamedeki `Switch` burada **`Toggle`**; sarmalayıcı `Pressable` değil **`Touchable`**.
7. Bir ekranda TEK `FAB`, aynı anda TEK toast.

## Ad çakışmaları (barrel YENİ olanları verir)

| Ad | Eski | Yeni (barrel) | Not |
|---|---|---|---|
| `EmptyState`, `ErrorState` | `components/States.tsx` | `components/ui/*` | API uyumlu; ikisini birden içe aktarma |
| `ScreenHeader` | — (eski dosya SİLİNDİ) | `components/ui/ScreenHeader.tsx` | Tek başlık kaldı; mor blok + `tabs`/`bottom` yuvaları |
| `Loading` | `components/States.tsx` | — | Karşılığı iskelettir: `SkeletonMatchRow` vb. |
| `MatchCard`, `TeamCrest` | `components/*.tsx` | `MatchRow`, `TeamLogo` | Eskiler geçiş bitince silinecek |

`useReduceMotion` şu an `components/ui/LiveBadge.tsx` içinde yaşıyor (barrel'dan da açık).
`hooks/useReduceMotion.ts` açılırsa LiveBadge'deki tanım tek satır re-export'a indirgenmeli.
