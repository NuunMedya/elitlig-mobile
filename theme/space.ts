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
 * KOMPAKT RİTİM. Ölçüler tipografiyle birlikte bir tık aşağı çekildi: 14px
 * gövdeyle tek satır 46, iki satır 58, maç satırı 56 piksele oturur. Önceki
 * sürümdeki 56/68/66 üçlüsü rahat okunuyordu ama 844px'lik bir ekrana iki
 * satır daha az sığdırıyordu; bir skor uygulamasında listenin uzunluğu
 * okunurluk kadar önemlidir.
 *
 * ALT SINIR 44px DOKUNMA HEDEFİDİR ve altına inilmez; 46px'lik satır bu
 * sınırın hemen üstünde durur.
 */
export const layout = {
  /* YATAY KENAR 16px. Kenar boşluğu ürünün "nefes"idir ama 20px, dar
     ekranlarda içerik genişliğinden çalıyordu.
     İSTİSNA: 8 sütunlu puan tablosu daha da dar bir kenar ister — o düzenler
     `screenPaddingDense` kullanır. */
  screenPadding: 16,
  /** Yoğun tablo düzenleri (puan durumu, istatistik ızgarası) için dar kenar. */
  screenPaddingDense: 12,
  rowPaddingH: 12,
  rowGap: 6,
  sectionGap: 14,
  listRowHeight: 46,        // tek satırlı ListRow
  listRowHeightTwoLine: 58, // iki satırlı ListRow
  matchRowHeight: 56,       // iki takım satırı + padding
  matchRowHeightCompact: 44,
  headerHeightExpanded: 88,
  headerHeightCollapsed: 46,
  tabBarHeight: 58,        // + insets.bottom — 21px ikon + 13px etiket + iç boşluk
  tabStripHeight: 38,
  dateStripHeight: 52,
  minTouch: 44,            // erişilebilirlik alt sınırı (hitSlop ile tamamlanır)
  crestSm: 20,
  crestMd: 24,
  crestLg: 30,
  crestXl: 52,
  starColumnWidth: 28,
  timeColumnWidth: 42,
  scoreColumnWidth: 30,
} as const;

/**
 * Köşe yarıçapları.
 *
 * KURAL: iç eleman DAİMA dış elemandan küçük yarıçaplıdır. Karışık yarıçap
 * (14px kartın içinde 14px kutu) kenarları paralel göstermez ve amatör durur.
 * Kart 14, kart içindeki her şey 10, chip/rozet pill, avatar dairesel.
 *
 * Yarıçaplar kart ölçüleriyle birlikte küçüldü: 46px'lik bir satırın üstünde
 * 18px köşe "şişkin" duruyordu. 14/10 ikilisi yüzeyi yumuşatırken kompakt
 * düzende de dik durur.
 */
export const radius = {
  none: 0,
  xs:   4,   // form çipi, mikro rozet
  sm:   6,   // amblem kutusu
  md:  10,   // KART İÇİ ELEMAN: input, chip zemini, satır grubu, bar
  lg:  14,   // KART
  xl:  18,   // bottom sheet, hero kartı
  xxl: 22,   // tam genişlik vitrin kartı
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
