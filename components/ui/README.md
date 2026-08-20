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
| `Chip` · `ChipGroup` | Filtre etiketleri, çoklu seçim |
| `SegmentedControl` | 2–4 seçenekli görünüm değiştirici (jenerik: `<SegmentedControl<"live"\|"fixtures"> …/>`) |
| `Tabs` | 3+ sekmeli içerik gezinmesi; `sticky` ile yapışkan |
| `Badge` | Durum rozeti. **Ton sözlüğünün evi burası**: `toneColors(tone)`, `withAlpha(hex, .4)` — kendi renk eşlemeni yazma |
| `Button` · `Input` · `Toggle` · `Stepper` | Form öğeleri. `Stepper` skor girişi için (tabular, sabit genişlik) |
| `MatchRow` | Maç listesi satırı. Yükseklik `matchRowHeight(variant, metaMode)` — `getItemLayout` DAİMA bundan kurulur |
| `LeagueGroupHeader` | Maç listesinde lig grubu başlığı (katlanır, favori yıldızlı) |
| `DateStrip` | Fikstür tarih seçici (varsayılan −14…+28 gün, bugün ortalanır) |
| `TeamLogo` · `Avatar` | Takım amblemi / oyuncu-kullanıcı avatarı (eski `TeamCrest` yerine) |
| `LiveBadge` · `RatingPill` · `FormChips` · `StatBar` · `ProgressRing` | Canlı nabız · puan hapı · son 5 maç · karşılaştırma çubuğu · yüzde halkası |
| `Skeleton*` | İLK yükleme. Hazır şablonlar: `SkeletonMatchRow/ListRow/Table/Standings/Card/Hero/ListFooter` |
| `EmptyState` · `ErrorState` | Veri yok / hata. `ErrorState variant="banner"` ekranda BAYAT VERİ varken (veriyi silme) |
| `Refresh` / `useRefresh` | Aşağı çekip yenileme |
| `ToastProvider` / `useToast` | Kısa geri bildirim. Sağlayıcı `app/_layout.tsx`'te, SafeAreaProvider içinde |
| `BottomSheet` | Seçim/eylem menüsü, filtre paneli. İçine FlatList koyacaksan `scrollable={false}` |
| `ScreenHeader` / `useHeaderScroll` | Ekran başlığı (96→48 daralır). Tema düğmesi YOK — Ayarlar'da |
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
| `ScreenHeader` | `components/ScreenHeader.tsx` (+`DetailHeader`) | `components/ui/ScreenHeader.tsx` | `scrollY` verilirse daralır; `back`/`actions`/`bottom` destekler |
| `Loading` | `components/States.tsx` | — | Karşılığı iskelettir: `SkeletonMatchRow` vb. |
| `MatchCard`, `TeamCrest` | `components/*.tsx` | `MatchRow`, `TeamLogo` | Eskiler geçiş bitince silinecek |

`useReduceMotion` şu an `components/ui/LiveBadge.tsx` içinde yaşıyor (barrel'dan da açık).
`hooks/useReduceMotion.ts` açılırsa LiveBadge'deki tanım tek satır re-export'a indirgenmeli.
