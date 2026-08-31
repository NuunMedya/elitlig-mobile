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
 * ÇOK KOMPAKT RİTİM AMA FERAH. 11px gövdeyle tek satır 38, iki satır 46, maç
 * satırı 38 piksele oturur — yani satır yükseklikleri puntoyla birlikte inmez,
 * ORANI KORUR. Metin küçülürken kenar boşluğu (14 → 16) ve bölüm arası
 * (12 → 18) BÜYÜDÜ: küçük metin, geniş beyaz alanın içinde pahalı görünür;
 * sıkışık alanda ucuz. "Minimal" olan şey punto değil, boşluk/mürekkep
 * oranıdır.
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
  /* ÖLÇÜLER TİPOGRAFİYLE BİRLİKTE BÜYÜDÜ.
     `theme/typography.ts` bu sürümde gövdeyi 11 → 14px'e çıkardı (gerekçe
     orada). Satır yükseklikleri ve sütun genişlikleri o eski, kısık ölçeğe
     göre hesaplanmıştı; ikisi birlikte büyümeseydi iri metin 38px'lik
     satırların içinde kırpılırdı. Buradaki her değer yeni ölçeğin satır
     yüksekliğinden (`lineHeight`) + dikey dolgudan türetildi. */

  /* YATAY KENAR 16px. Punto büyürken kenar boşluğu SABİT kaldı: ferahlığı
     veren şey oranıdır ve iri metinle 16px zaten doğru orana oturuyor. */
  screenPadding: 16,
  /** Yoğun tablo düzenleri (puan durumu, istatistik ızgarası) için dar kenar. */
  screenPaddingDense: 12,
  rowPaddingH: 14,
  rowGap: 8,
  /** Bölümler arası nefes. */
  sectionGap: 22,
  listRowHeight: 52,        // tek satırlı ListRow — h3(20) + 2×16 dolgu
  listRowHeightTwoLine: 66, // iki satırlı ListRow — h3(20) + bodySm(17) + dolgu
  /** Maç satırı TEK SATIRDIR: logo · ev · skor · dep · logo. */
  matchRowHeight: 54,       // scoreSm(21) ve crestMd(26) bu yüksekliği ister
  matchRowHeightCompact: 44,
  headerHeightExpanded: 96, // overline(13) + display(27) + dolgu
  headerHeightCollapsed: 52,
  /**
   * ALT MENÜ BARI YUVASI — hapın kendisi değil, kapladığı alan.
   *
   * 6 üst boşluk + 58 hap + 8 alt boşluk = 72; güvenli alan (insets.bottom)
   * bunun ALTINA eklenir. Bar artık ekranın alt kenarına yapışık bir şerit
   * değil, kenarlardan 16px içeride YÜZEN bir haptır (bkz.
   * components/ui/GlowTabBar.tsx) — bu yüzden yuva, hapın etrafındaki
   * boşluğu da sayar.
   *
   * Ekranlar bu değeri kaydırma listelerinin alt dolgusu için kullanır: son
   * satır hapın altında kalmasın diye.
   */
  tabBarHeight: 72,
  tabStripHeight: 42,
  dateStripHeight: 56,
  minTouch: 44,            // erişilebilirlik alt sınırı (hitSlop ile tamamlanır)
  /* AMBLEM ÖLÇÜSÜ METİNLE ORANTILIDIR: 16px'lik bir arma, 15px'lik bir takım
     adının yanında "ikon" değil kir gibi duruyordu. Arma en az satır
     başlığının satır yüksekliği kadar olmalı ki isimle aynı ağırlıkta okunsun. */
  crestSm: 22,
  crestMd: 26,
  crestLg: 32,
  crestXl: 52,
  /* YILDIZ ve SAAT SÜTUNU AYNI GENİŞLİKTE OLMAK ZORUNDA.
     Maç satırı [saat][ev yanı][skor][deplasman yanı][yıldız] dizilir ve iki
     yan eşit `flex` alır. Kenar sütunları eşit değilse skor bloğu satırın
     geometrik merkezinden farkın yarısı kadar kayar — 22/36'da 7px sağa.
     Bir listede yirmi satır boyunca aynı 7px kayma, "okuma ekseni" diye bir
     şeyin kalmaması demektir. Yıldız sütun içinde sağa yaslı durduğu için
     genişlemesi yıldızın yerini değiştirmez, yalnız ekseni düzeltir. */
  starColumnWidth: 42,
  timeColumnWidth: 42,
  scoreColumnWidth: 56,    // "12–10" scoreSm(17px) ile tek blokta ortalanır
} as const;

/**
 * Köşe yarıçapları.
 *
 * KURAL: iç eleman DAİMA dış elemandan küçük yarıçaplıdır. Karışık yarıçap
 * (12px kartın içinde 12px kutu) kenarları paralel göstermez ve amatör durur.
 * Kart 12, kart içindeki her şey 8, chip/rozet pill, avatar dairesel.
 *
 * Yarıçap ölçekle birlikte indi: 38px'lik bir satırın üstünde 13px köşe,
 * yüksekliğin üçte birini yuvarlıyor ve satırı hap gibi gösteriyordu. 12/8
 * ikilisi yüzeyi yumuşatırken dikdörtgen kimliğini korur.
 */
/**
 * YARIÇAP — ürünün en belirgin imzası.
 *
 * Eski ölçek (kart 12, hero 18) her arayüzde görülen "genel geçer" bir
 * yumuşaklıktı: köşeler yuvarlaktı ama hiçbir şey söylemiyordu. Yeni ölçek
 * bilerek CESUR: kart 18, panel 24, sahne yüzeyi 30. Bu ölçekte köşe artık
 * bir detay değil, formun kendisi — kartlar "kesilmiş dikdörtgen" değil,
 * "yastık" olarak okunuyor.
 *
 * ÖLÇEK İÇ İÇE GEÇMEYİ BİLİR: bir kabın içindeki öğe, kabın yarıçapından
 * en az iç boşluk kadar küçük olmalı (28 kabın içinde 12px dolguyla duran
 * öğe → 16). Aksi hâlde iç köşe dış köşeye "yapışık" görünür. Ardışık iki
 * kademe arasındaki fark (6px) tam da tipik iç boşluk kadar seçildi.
 */
export const radius = {
  none: 0,
  xs:   6,   // form çipi, mikro rozet
  sm:  10,   // amblem kutusu, küçük pul
  md:  14,   // KART İÇİ ELEMAN: input, chip zemini, satır grubu, bar
  lg:  18,   // KART
  xl:  24,   // bottom sheet, panel
  xxl: 30,   // sahne yüzeyi: skor tablosu, saha, yükselen sayfa
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
