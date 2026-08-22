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
  /* YATAY KENAR 20px (yeniden tasarım). Kenar boşluğu ürünün "nefes"idir;
     12px kenar, içeriği ekrana yapıştırıp hazır şablon görüntüsü veriyordu.
     İSTİSNA: 8 sütunlu puan tablosu 360px'lik ekrana 20px kenarla sığmıyor —
     o düzenler `screenPaddingDense` kullanır. Dikey ölçüler değişmedi; her
     satır ~4px kısa tutulur ki 844px'lik ekrana 1–2 satır daha girsin. Alt
     sınır 44px dokunma hedefidir, altına inilmez. */
  screenPadding: 20,
  /** Yoğun tablo düzenleri (puan durumu, istatistik ızgarası) için dar kenar. */
  screenPaddingDense: 12,
  rowPaddingH: 12,
  rowGap: 6,
  sectionGap: 14,
  listRowHeight: 48,       // tek satırlı ListRow (eski 52)
  listRowHeightTwoLine: 58,// (eski 64)
  matchRowHeight: 56,      // iki takım satırı + padding (eski 60)
  matchRowHeightCompact: 44,
  headerHeightExpanded: 88,
  headerHeightCollapsed: 44,
  tabBarHeight: 62,        // + insets.bottom — 21px ikon + 12px etiket + iç boşluk
  tabStripHeight: 38,
  dateStripHeight: 52,
  minTouch: 44,            // erişilebilirlik alt sınırı (hitSlop ile tamamlanır)
  crestSm: 20,
  crestMd: 24,
  crestLg: 30,
  crestXl: 52,
  starColumnWidth: 30,
  timeColumnWidth: 42,
  scoreColumnWidth: 30,
} as const;

/**
 * Köşe yarıçapları.
 *
 * KURAL: iç eleman DAİMA dış elemandan küçük yarıçaplıdır. Karışık yarıçap
 * (16px kartın içinde 16px kutu) kenarları paralel göstermez ve amatör durur.
 * Kart 16, kart içindeki her şey 10, chip/rozet pill, avatar dairesel.
 */
export const radius = {
  none: 0,
  xs:   4,   // form çipi, mikro rozet
  sm:   6,   // amblem kutusu
  md:  10,   // KART İÇİ ELEMAN: input, chip zemini, satır grubu, bar
  lg:  16,   // KART
  xl:  16,   // bottom sheet, hero kartı — kartla aynı, ayrı bir dil kurmaz
  xxl: 20,   // tam genişlik vitrin kartı
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
