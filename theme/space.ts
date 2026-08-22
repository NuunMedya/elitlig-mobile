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

/**
 * Yerleşim sabitleri — ekran ve satır ölçüleri tek yerde toplanır.
 *
 * ÖLÇÜLER TİPOGRAFİYLE BİRLİKTE BÜYÜDÜ. Önceki sürüm satırları 44–48px'e
 * sıkıştırıp gövde metnini 12px'e indirmişti; ekrana iki satır daha giriyordu
 * ama ürün "sıkışık ve ucuz" görünüyordu. Yeni ölçüler 15px gövdeyle nefes
 * alan bir ritim kurar: tek satır 56, iki satır 68, maç satırı 66.
 */
export const layout = {
  /* YATAY KENAR 20px. Kenar boşluğu ürünün "nefes"idir.
     İSTİSNA: 8 sütunlu puan tablosu 360px'lik ekrana 20px kenarla sığmıyor —
     o düzenler `screenPaddingDense` kullanır. */
  screenPadding: 20,
  /** Yoğun tablo düzenleri (puan durumu, istatistik ızgarası) için dar kenar. */
  screenPaddingDense: 14,
  rowPaddingH: 14,
  rowGap: 8,
  sectionGap: 20,
  listRowHeight: 56,        // tek satırlı ListRow
  listRowHeightTwoLine: 68, // iki satırlı ListRow
  matchRowHeight: 66,       // iki takım satırı + padding
  matchRowHeightCompact: 52,
  headerHeightExpanded: 104,
  headerHeightCollapsed: 50,
  tabBarHeight: 64,        // + insets.bottom — 23px ikon + 11px etiket + iç boşluk
  tabStripHeight: 44,
  dateStripHeight: 60,
  minTouch: 44,            // erişilebilirlik alt sınırı (hitSlop ile tamamlanır)
  crestSm: 22,
  crestMd: 28,
  crestLg: 36,
  crestXl: 64,
  starColumnWidth: 32,
  timeColumnWidth: 46,
  scoreColumnWidth: 34,
} as const;

/**
 * Köşe yarıçapları.
 *
 * KURAL: iç eleman DAİMA dış elemandan küçük yarıçaplıdır. Karışık yarıçap
 * (18px kartın içinde 18px kutu) kenarları paralel göstermez ve amatör durur.
 * Kart 18, kart içindeki her şey 12, chip/rozet pill, avatar dairesel.
 *
 * Yarıçaplar tipografiyle birlikte büyüdü: 18px'lik bir kart 10px'lik köşeyle
 * "keskin ve ucuz", 24px'lik köşeyle "oyuncak" görünür; 18/12 ikilisi yüzeyi
 * yumuşatırken editoryal kalır.
 */
export const radius = {
  none: 0,
  xs:   6,   // form çipi, mikro rozet
  sm:   8,   // amblem kutusu
  md:  12,   // KART İÇİ ELEMAN: input, chip zemini, satır grubu, bar
  lg:  18,   // KART
  xl:  22,   // bottom sheet, hero kartı
  xxl: 28,   // tam genişlik vitrin kartı
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
