/**
 * Uzay ölçeği, yerleşim sabitleri ve köşe yarıçapları.
 *
 * 4 tabanlı ama yarım adımlı (6, 10, 12) bir ölçek kullanılır: skor listesi
 * yoğun bir düzendir, 4→8→16 sıçraması satırları gereksiz şişirir.
 *
 * DİKKAT — `space` ile `spacing` AYNI ŞEY DEĞİLDİR:
 *   space.md = 12  (yeni, yoğun ölçek)
 *   spacing.md = 16 (ESKİ API — 58 dosya bu değere göre yazıldı)
 * Eski adlar `spacing` üstünde birebir korunur ki mevcut ekranların yerleşimi
 * bozulmasın. YENİ KOD DAİMA `space` KULLANIR; `spacing` yalnız geçiş
 * dönemindeki eski dosyalar içindir ve migrasyon bitince silinecektir.
 */

/** Yeni uzay ölçeği — yoğun düzen için yarım adımlı. */
export const space = {
  px:    1,
  xxs:   2,
  xs:    4,
  s:     6,
  sm:    8,
  m:    10,
  md:   12,
  lg:   16,
  xl:   20,
  xxl:  24,
  xxxl: 32,
  huge: 40,
  giant:48,
} as const;

/**
 * ESKİ API (`spacing.xs/sm/md/lg/xl`) — değerleri birebir korunur.
 * Yeni adlar da aynı nesneden okunabilsin diye `space` üstüne serilir; çakışan
 * anahtarlarda (md/lg/xl) ESKİ değer kazanır, çünkü geriye uyumluluk şarttır.
 */
export const spacing = {
  ...space,
  xs: space.xs,   // 4
  sm: space.sm,   // 8
  md: space.lg,   // 16  ← eski md=16 ile birebir (space.md=12 DEĞİL)
  lg: space.xxl,  // 24  ← eski lg=24 (space.lg=16 DEĞİL)
  xl: space.xxxl, // 32  ← eski xl=32 (space.xl=20 DEĞİL)
} as const;

/** Yerleşim sabitleri — ekran ve satır ölçüleri tek yerde toplanır. */
export const layout = {
  screenPadding: 12,       // eski 16 → 12: yoğunluk için kenar boşluğu daralır
  rowPaddingH: 12,
  rowGap: 8,
  sectionGap: 16,
  listRowHeight: 52,       // tek satırlı ListRow
  listRowHeightTwoLine: 64,
  matchRowHeight: 60,      // iki takım satırı + padding
  matchRowHeightCompact: 48,
  headerHeightExpanded: 96,
  headerHeightCollapsed: 48,
  tabBarHeight: 56,        // + insets.bottom
  tabStripHeight: 42,
  dateStripHeight: 58,
  minTouch: 44,            // erişilebilirlik alt sınırı (hitSlop ile tamamlanır)
  crestSm: 20,
  crestMd: 24,
  crestLg: 32,
  crestXl: 56,
  starColumnWidth: 32,
  timeColumnWidth: 44,
  scoreColumnWidth: 30,
} as const;

/**
 * Köşe yarıçapları. Eski `md=14 / lg=20` kart estetiğine göre büyüktü; yoğun
 * liste düzeninde kart ve satır grubu 10, sheet 14 olur. `pill` yalnız chip,
 * rozet ve avatar içindir.
 */
export const radius = {
  none: 0,
  xs:   4,   // rozet, form çipi
  sm:   6,   // amblem kutusu, küçük çip
  md:   8,   // input, chip, satır grubu
  lg:  10,   // kart
  xl:  14,   // bottom sheet, hero kartı
  xxl: 20,
  pill: 999,
} as const;

/**
 * 44px dokunma alanını dolduran hitSlop üretir.
 * Örn. 24px'lik bir ikon düğmesi için `touchSlop(24)` → 10px dört yön.
 */
export function touchSlop(size: number): { top: number; bottom: number; left: number; right: number } {
  const pad = Math.max(0, Math.round((layout.minTouch - size) / 2));
  return { top: pad, bottom: pad, left: pad, right: pad };
}
