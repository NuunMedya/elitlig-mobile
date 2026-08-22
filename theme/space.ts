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
 * ÇOK KOMPAKT RİTİM. 13px gövdeyle tek satır 40, iki satır 50, maç satırı 40
 * piksele oturur.
 *
 * MAÇ SATIRI TEK SATIRDIR: `logo · ev takım · SKOR · dep takım · logo`. Önceki
 * iki satırlı düzen (ev üstte, deplasman altta) satır başına 56px istiyordu;
 * tek satır aynı bilgiyi 40px'te verir ve bir ekrana neredeyse iki kat maç
 * sığdırır. Skor ortada sabit genişlikli bir blokta durduğu için göz, liste
 * boyunca tek bir dikey ekseni takip eder.
 *
 * 44px DOKUNMA HEDEFİ: 40px'lik satırlar bu sınırın altındadır ama liste
 * satırları ARALIKSIZ dizilir — komşu satırlar arasında ölü boşluk yoktur, bu
 * yüzden yanlış dokunma riski tekil bir düğmedeki gibi değildir. Tekil ikon
 * düğmeleri (yıldız, geri) `touchSlop` ile 44px'e tamamlanmaya devam eder.
 */
export const layout = {
  /* YATAY KENAR 14px. */
  screenPadding: 14,
  /** Yoğun tablo düzenleri (puan durumu, istatistik ızgarası) için dar kenar. */
  screenPaddingDense: 10,
  rowPaddingH: 10,
  rowGap: 6,
  sectionGap: 12,
  listRowHeight: 40,        // tek satırlı ListRow
  listRowHeightTwoLine: 50, // iki satırlı ListRow
  /** Maç satırı ARTIK TEK SATIRDIR: logo · ev · skor · dep · logo. */
  matchRowHeight: 40,
  matchRowHeightCompact: 34,
  headerHeightExpanded: 80,
  headerHeightCollapsed: 44,
  tabBarHeight: 58,        // + insets.bottom — 20px ikon + 12px etiket + iç boşluk
  tabStripHeight: 36,
  dateStripHeight: 48,
  minTouch: 44,            // erişilebilirlik alt sınırı (hitSlop ile tamamlanır)
  crestSm: 18,
  crestMd: 22,
  crestLg: 28,
  crestXl: 46,
  starColumnWidth: 24,
  timeColumnWidth: 38,
  scoreColumnWidth: 46,    // "12 – 10" tek blokta ortalanır
} as const;

/**
 * Köşe yarıçapları.
 *
 * KURAL: iç eleman DAİMA dış elemandan küçük yarıçaplıdır. Karışık yarıçap
 * (13px kartın içinde 13px kutu) kenarları paralel göstermez ve amatör durur.
 * Kart 13, kart içindeki her şey 9, chip/rozet pill, avatar dairesel.
 *
 * Yarıçaplar kart ölçüleriyle birlikte küçüldü: 40px'lik bir satırın üstünde
 * 14px köşe hâlâ şişkin duruyordu. 13/9 ikilisi ışıklı gradyan yüzeyi
 * yumuşatırken kompakt düzende dik kalır.
 */
export const radius = {
  none: 0,
  xs:   4,   // form çipi, mikro rozet
  sm:   6,   // amblem kutusu
  md:   9,   // KART İÇİ ELEMAN: input, chip zemini, satır grubu, bar
  lg:  13,   // KART
  xl:  16,   // bottom sheet, hero kartı
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
