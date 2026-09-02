/**
 * Renk paleti — saf veri, yan etkisi yoktur.
 *
 * Bu dosya içe aktarıldığında hiçbir şey okumaz (AsyncStorage, Appearance, vb.);
 * yalnızca iki sabit nesne tanımlar. Aktif temanın seçilmesi `theme/index.ts`
 * işidir.
 *
 * RENK FELSEFESİ — MOR MÜREKKEP, BEYAZ KÂĞIT:
 *
 *  1. MOR MARKANIN KENDİSİDİR AMA ARKA PLAN DEĞİLDİR. Açık temada kâğıt
 *     BEYAZDIR; mor, mürekkepte (metin), aksiyonda (düğme, seçili sekme) ve
 *     sayılı kimlik bloklarındadır (alt menü barı, skor tablosu, hero). Bir
 *     önceki sürüm zemini de mor yapmıştı ve mor, her yeri kaplayınca vurgu
 *     olmaktan çıkmıştı. Koyu temada ise zemin GERÇEKTEN mordur (#180D33) —
 *     eski #0C0718 adı mor olan bir siyahtı.
 *
 *  2. İKİ VURGU, İKİ İŞ:
 *       MOR       (`brand`)  = AKSİYON ve SEÇİLİ DURUM. Düğme, aktif sekme,
 *                              seçili chip, favori yıldızı, bölüm işareti.
 *       CAMGÖBEĞİ (`accent`) = VERİ. İstatistik barı, ilerleme, ev sahibi
 *                              tarafı, öne çıkan rakam, sparkline.
 *     Veri rengi eskiden MAVİYDİ ve mavi morun komşusudur: bir istatistik
 *     barında "bu seçili mi, veri mi" ayırt edilemiyordu. Camgöbeği morun tam
 *     karşısında durur ve iki renk hiçbir ışıkta karışmaz.
 *     Mor zeminin üstünde mor bir vurgu okunmaz; koyu blokların üstündeki
 *     marka rengi ayrı bir tokendır: `brandOnDark` (açık lavanta).
 *
 *  3. KART, DOLGUYLA DEĞİL KENARLIK VE GÖLGEYLE AYRILIR. Beyaz kâğıdın
 *     üstünde beyaz kart durur; onu ayıran şey 1px lavanta kenarlık ve geniş,
 *     çok sönük mor gölgedir. `gradientCard` geçişi neredeyse görünmezdir
 *     (#FFFFFF → #FBF9FE): amaç yüzeyi boyamak değil, ışık aldığını
 *     hissettirmektir.
 *
 *     YÖN DAİMA SAĞDAN SOLADIR. Dikey geçiş, geniş ve alçak bir kartın
 *     üstünde silindir ("boru") etkisi yapıyordu; yatay geçiş yüzeyi düz
 *     bırakır. Bkz. components/ui/GradientFill.tsx.
 *
 *     Gölge rengi siyah değil `shadowColor` (derin mor): siyah gölge beyaz
 *     kâğıdın üstünde grileşip kirli görünür.
 *
 *  4. GRADYAN SAYILIDIR VE TOKENDIR. Serbest gradyan yoktur; her gradyanın bir
 *     İŞİ vardır: `gradientCard` kart yüzeyi, `gradientInk` kimlik bloğu,
 *     `gradientBrand` birincil aksiyon, `gradientAccent` veri, `gradientLive`
 *     canlı, `gradientPitch` saha, `gradientSurface` ikincil yüzey,
 *     `gradientTabBar` alt menü barı. Görsel üstündeki okunabilirlik scrim'i
 *     ayrıca `scrimGradientTop` → `scrimGradientBottom` ile kurulur.
 *
 *  5. ALT MENÜ BARI İKİ TEMADA DA KOYU MORDUR. Uygulamanın her ekranında
 *     görünen tek yüzey odur; tema değiştikçe kimlik değiştirmemesi için
 *     rengi temadan bağımsızdır. Açık temada beyaz kâğıdın üstündeki tek koyu
 *     ada, koyu temada kâğıttan bir kademe açık duran yüzen bir hap.
 *
 *  6. KONTRAST HESAPLANDI, VARSAYILMADI. Her metin/zemin çifti
 *     `npm run check:tokens` ile iki temada da sınanır.
 *
 *  7. Durum rengi tek başına anlam taşımaz; kazanan takım kalın + textPrimary,
 *     kaybeden textTertiary olur.
 *
 *  8. Her token her iki temada da tanımlıdır; ekran hangi temada olduğunu bilmez.
 *
 * MÜREKKEP MOR MÜREKKEPTİR: `textPrimary` nötr siyah değil çok koyu bir mordur
 * (#160C2E). Nötr siyah, mor aksanların yanında "başka bir tema"dan gelmiş
 * gibi durur.
 */

export interface Palette {
  /* — Yüzey mimarisi — */
  bg: string;            // ekran zemini — "kağıt"
  surface1: string;      // satır/kart zemini
  surface2: string;      // yüzey üstü (basılı hâl, ikinci seviye)
  surface3: string;      // input, boş alan, iskelet, chip zemini
  elevated: string;      // bottom sheet, modal, menü
  inverse: string;       // koyu blok: hero, canlı skor şeridi, paylaşım kartı
  overlay: string;       // scrim (rgba)
  pressed: string;       // Pressable basılı zemin
  ripple: string;        // Android ripple (rgba)

  /* — Metin katmanları — */
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;  // etiket, meta
  textDisabled: string;
  textOnBrand: string;   // mercan dolgu üstündeki metin
  textOnStatus: string;  // canlı/yeşil dolgu üstündeki metin
  onDark: string;        // koyu blok üstündeki metin (scrim, hero) — İKİ TEMADA DA BEYAZ
  onDarkMuted: string;   // koyu blok üstündeki ikincil metin
  /**
   * `inverse` yüzeyi üstündeki metin. `onDark`tan FARKLIDIR: `onDark` fotoğraf
   * scrim'i gibi daima koyu olan bir zemin içindir ve iki temada da beyazdır;
   * `inverse` ise "zeminin tersi" demektir ve koyu temada AÇIK bir yüzeydir.
   * Seçili filtre chip'i gibi ters blok öğeleri bunu kullanır.
   */
  onInverse: string;
  /**
   * DAİMA KOYU blok yüzeyi — maç skoru şeridi, takım kapağı, oyuncu kimlik
   * kartı, manşet karuseli, paylaşım kartı.
   *
   * `inverse` İLE KARIŞTIRMA: `inverse` "zeminin tersi" demektir ve KOYU
   * temada AÇIK bir yüzeydir. Üstüne `onDark` (beyaz) metin koyan her blok
   * `inverse` kullandığında koyu temada beyaz üstüne beyaz yazıyordu.
   * `inkBlock` iki temada da koyudur; `onDark` metni her zaman okunur.
   */
  inkBlock: string;

  /* — Kenarlık / ayraç — */
  border: string;        // hairline ayraçlar, normal kenarlık
  borderStrong: string;  // odaklı input, seçili çerçeve
  separator: string;     // liste içi ayraç (border'dan bir tık sönük)
  /**
   * KOYU BLOK üstündeki ayraç/kenarlık. `border` kâğıt için ayarlanmış mat bir
   * lavantadır ve mürekkep bloğun üstünde kayboluyordu; koyu blokta ayraç,
   * zemini boyayan bir çizgi değil ışığı GEÇİREN bir çatlaktır — bu yüzden
   * yarı saydam beyazdır ve iki temada da aynıdır (blok iki temada da koyu).
   */
  borderOnDark: string;

  /* — MOR: aksiyon ve seçili durum — */
  brand: string;         // dolgu (buton, aktif sekme, seçili chip)
  brandStrong: string;   // basılı hâl
  brandAccent: string;   // morun METİN sürümü — dolgu için KULLANMA
  brandDim: string;      // rozet/chip zemini (tint)
  brandBorder: string;   // mor çerçeve
  /**
   * Marka renginin KOYU MOR BLOK üstündeki sürümü. `brand` derin mor bir
   * gradyanın üstünde okunmaz (mor üstüne mor, ~1,8:1); kimlik bloklarındaki
   * marka etiketleri bu açık lavantayı kullanır.
   */
  brandOnDark: string;

  /* — MAVİ: veri — */
  accent: string;        // istatistik barı, ilerleme, ev sahibi
  accentStrong: string;  // basılı hâl
  accentText: string;    // metin sürümü
  accentDim: string;     // tint zemin
  accentBorder: string;
  textOnAccent: string;  // mavi dolgu üstündeki metin

  /* — Verinin karşıtı — */
  slate: string;         // deplasman barı: mavinin rakibi, nötr
  slateSoft: string;     // bar rayı, pasif segment

  /* — Durum — */
  live: string;
  liveDim: string;
  liveGlow: string;      // dakika halkası izi (rgba)
  /**
   * Canlı kırmızısının MÜREKKEP BLOK üstündeki sürümü. `live` açık kâğıt için
   * koyulaştırılmıştır ve koyu blokta 2,9:1'e düşüyordu; bu token iki temada
   * da koyu zemin varsayar ve AA geçer.
   */
  liveOnDark: string;
  win: string;
  winDim: string;
  draw: string;
  drawDim: string;
  loss: string;
  lossDim: string;
  warn: string;
  warnDim: string;
  danger: string;
  dangerDim: string;
  info: string;
  infoDim: string;

  /* — Futbol semantiği — */
  yellowCard: string;
  redCard: string;
  star: string;          // favori (dolu) — aksiyon olduğu için MERCAN
  starEmpty: string;     // favori (boş)
  /**
   * Saha zemini (düz dolgu yedeği). Asıl saha `gradientPitch` ile çizilir.
   * DERİN YEŞİLDİR: önceki sürüm sahayı gri bir yüzey yapmıştı ve saha,
   * üstünde durduğu kâğıttan ayırt edilemiyordu — kadro ekranı "boş bir
   * dikdörtgenin üstüne dağılmış avatarlar" gibi görünüyordu.
   */
  pitch: string;
  chalk: string;         // saha çizgisi — derin saha üstünde beyaz tebeşir
  chalkInk: string;      // kağıt üstünde tebeşir (orta yuvarlak yayı, ayraç)
  /** Saha üstündeki oyuncu adı/numarası — iki temada da beyaz. */
  onPitch: string;

  /* — Reyting skalası — */
  ratingPoor: string;    // < 6.0
  ratingFair: string;    // 6.0 – 6.99
  ratingGood: string;    // 7.0 – 7.99
  ratingGreat: string;   // 8.0 – 8.99
  ratingElite: string;   // 9.0 +
  ratingNone: string;    // reyting yok
  ratingPoorBg: string;
  ratingFairBg: string;
  ratingGoodBg: string;
  ratingGreatBg: string;
  ratingEliteBg: string;
  ratingNoneBg: string;

  /* — MEVKİ RENKLERİ — oyuncu kimliğinin tek renk kuralı —
   *
   * Oyuncu satırında mevki eskiden ya yazıyla ("Forvet") ya da hiç
   * söylenmiyordu; kadro listesine bakınca dizilişin okunması için her satırı
   * tek tek okumak gerekiyordu. Artık mevki, avatarın etrafındaki HALKANIN ve
   * adın yanındaki üç harfin rengidir: kaleci altın, defans camgöbeği, orta
   * saha mor, forvet mercan. Renk tek başına anlam taşımaz — yanında daima üç
   * harfli etiket durur (KAL · DEF · ORT · FOR).
   *
   * Bu değerler DOLGU DEĞİL, ÖN PLANDIR: hem halka çizgisi hem etiket metni
   * olarak kâğıdın üstünde durur, bu yüzden ikisi de AA metin eşiğini geçer.
   */
  posKeeper: string;
  posDefense: string;
  posMidfield: string;
  posForward: string;
  posUnknown: string;    // sunucudan mevki gelmeyen oyuncu

  /* — Sıralama bölgeleri — satır boyanmaz, sol kenarda 3px işaret olur — */
  zoneChampion: string;
  zonePromotion: string;
  zonePlayoff: string;
  zoneRelegationPlayoff: string;
  zoneRelegation: string;

  /* — Gradyanlar — derinlik ve okunabilirlik için; dekorasyon için değil — */
  /** Koyu kimlik bloğu: maç skoru şeridi, hero kapağı, paylaşım kartı. */
  gradientInk: readonly [string, string];
  /** Birincil aksiyon dolgusu (mercan). Metni `textOnBrand`tır. */
  gradientBrand: readonly [string, string];
  /** Veri vurgusu: ilerleme barı, seçili veri bloğu. */
  gradientAccent: readonly [string, string];
  /** Canlı rozeti ve canlı skor şeridi. */
  gradientLive: readonly [string, string];
  /**
   * Sahanın zemini — derin YEŞİL-TEAL, üstünde beyaz tebeşir okunur.
   *
   * Doygun zümrüt yeşili denendi ve mor sistemin yanında YABANCI duruyordu:
   * saha, sayfanın geri kalanından kopmuş parlak bir dikdörtgen gibi
   * görünüyordu. Ton teal'a çekilince yeşil hâlâ "çim" okunuyor ama mor
   * atmosferle aynı soğuk aileye giriyor — gece maçı ışığı altındaki bir saha.
   */
  gradientPitch: readonly [string, string];
  /** Kartın çok hafif üst ışığı; ikinci seviye yüzeyler. */
  gradientSurface: readonly [string, string];
  /**
   * VARSAYILAN KART YÜZEYİ — üstte açık, altta bir tık koyu. Kartın "ışıklı"
   * görünmesini sağlayan şey budur; düz dolgu yüzeyi kâğıda yapıştırıyordu.
   */
  gradientCard: readonly [string, string];

  /* — Maç detayı atmosferi — */
  /**
   * MAÇ EKRANININ KÂĞIDI. Uygulamanın geri kalanı lavanta bir kâğıt üstünde
   * durur; maç detayı ise TEK BİR MAÇIN sahnesidir ve üstündeki atmosfer
   * (kapak fotoğrafı + mor yıkama) ancak sakin bir zeminde okunur.
   * Açık temada bu zemin BEYAZ AĞIRLIKLI, koyu temada DERİN MOR ağırlıklıdır.
   */
  matchCanvas: string;
/**
   * Atmosferin TABAN rengi — sahnenin en koyu, en üst bölgesi.
   *
   * Kapak fotoğrafı bunun ÜSTÜNE düşük opaklıkta serilir; yani fotoğraf bir
   * resim değil, mor tabanı boyayan bir DOKU olur. Fotoğraf yoksa taban tek
   * başına sahneyi kurar. İki durumda da üst bölge, başlık şeridindeki beyaz
   * metni taşıyacak kadar koyudur — sahne fotoğrafın parlaklığına göre
   * değişmez.
   */
  matchTint: string;
  /**
   * Atmosfer yıkaması — tabanın ve fotoğrafın üstüne serilen üç duraklı dikey
   * geçiş: tepede SAYDAM (doku görünsün), ortada yarı saydam mor, dipte
   * kâğıdın kendisi. Son durak `matchCanvas` ile birebir aynı olmak zorunda,
   * yoksa atmosferin bittiği yerde yatay bir dikiş çizgisi görünür.
   *
   * Dikey olması bilinçli: burası bir yüzey değil, ışık kaynağıdır (gradyan
   * ekseni kuralı yüzey gradyanlarına bakar, bkz. scripts/check-tokens.mjs).
   */
  matchWash: readonly [string, string, string];
  /**
   * Atmosferin üstünde duran skor tablosunun ışıklı kenarı.
   *
   * Kartın ZEMİNİ yarı saydam DEĞİL, `gradientInk`tir — bilerek. Yarı saydam
   * denendi ve okunamadı: kart, yıkamanın orta bölgesinde (açık lavanta)
   * duruyor ve üstündeki metin beyaz; saydam zeminde skor kayboluyordu.
   * Sayfanın en önemli tek bilgisi, arkasındaki dokunun insafına bırakılamaz.
   * Sahneyle bağı ZEMİNDEN değil, bu ince açık çerçeveden gelir.
   */
  glassBorder: string;

  /* — Çerçeveler — */
  /**
   * IŞIKLI ÇERÇEVE — `Frame` bileşeninin 1px gradyan kenarı.
   *
   * Düz `hairline` bir kenarlık her arayüzde aynıdır ve hiçbir şey söylemez.
   * Işık üstten geliyorsa kenarın ÜST yayı alt yayından parlak olmalıdır;
   * gerçek bir nesnenin kenarı böyle davranır. İki durak tam da bunu kurar:
   * ilki (parlak) üstte, ikincisi (sönük) altta. Bu, kartı kâğıttan
   * "kesilmiş" değil, kâğıdın üstüne "konmuş" gösteren tek detaydır.
   */
  rimLight: readonly [string, string];
  /** Koyu blokların (skor tablosu, mürekkep panel) ışıklı kenarı. */
  rimDark: readonly [string, string];

  /* — Yardımcı — */
  /** Gölge rengi — açık temada mürekkep, koyuda saf siyah. */
  shadowColor: string;
  skeletonBase: string;
  skeletonHighlight: string;

  /* — Alt menü barı — İKİ TEMADA DA KOYU MOR —
   *
   * Bar, ekranın altında YÜZEN bir hap. Zemini iki temada da derin mordur:
   * açık temada beyaz kâğıdın üstünde duran tek koyu blok odur ve uygulamanın
   * kimliğini her ekranda taşır; koyu temada kâğıttan bir kademe AÇIK durur ki
   * gece de "yüzen" okunsun. Bar iki temada da koyu olduğu için üstündeki
   * bütün renkler (ikon, etiket, ışık) tema değiştirse de aynı kalır — sekme
   * çubuğu, uygulamanın tema değişiminden etkilenmeyen tek yüzeyidir.
   */
  /** Barın düz zemini — gradyan yüklenemezse yedek, rozet halkası bunu kullanır. */
  tabBar: string;
  /** Barın ışıklı üst kenarı (yarı saydam beyaz). */
  tabBarBorder: string;
  /** Barın yüzey gradyanı — sağdan sola. */
  gradientTabBar: readonly [string, string];
  /** Seçili sekmenin ikon/etiket rengi. */
  tabActive: string;
  /** Seçili olmayan sekmenin ikon/etiket rengi. */
  tabInactive: string;
  /** Işığın kaynağı: seçili sekmenin üstündeki 3px'lik parlak çizgi. */
  tabBeam: string;
  /**
   * SEÇİLİ SEKMENİN KAPSÜLÜ — ikonun arkasındaki yumuşak mor pul.
   *
   * ESKİ IŞIK KONİSİ KALKTI: çizginin altına düşen dikey geçiş, ikonun
   * üstünde asılı duran bir sis lekesi gibi görünüyordu ve hangi sekmenin
   * seçili olduğunu ancak yanındakiyle karşılaştırarak söylüyordu. Kapsül
   * ikonu SARAR: seçim, ikonun kendi kutusunda okunur; huzme ise barın üst
   * kenarında kalan ince bir kaynak çizgisi olarak seçimi uzaktan işaretler.
   */
  tabCapsule: string;
  /** Kapsülün ince ışıklı çerçevesi. */
  tabCapsuleBorder: string;

  /* — Mor blok üstündeki SAYFA SEKMESİ hapı —
   *
   * Alt menü kapsülünden AYRI token: kapsül morun içinde mor bir puldur
   * (ikonun arkasında durur, gözü çekmesi istenmez); sekme hapı ise başlık
   * bloğunda seçili sayfayı söyleyen tek işarettir ve daha açık, daha
   * belirgin olmak zorunda — yarı saydam beyaz + lavanta çerçeve. İki temada
   * da aynıdır çünkü blok iki temada da koyudur.
   */
  inkPill: string;
  inkPillBorder: string;
  /**
   * Mor bloktaki CAM KUTU (kimlik sayıları: SIRA · PUAN · AVERAJ). Haptan
   * daha sessiz: sayı zaten konuşuyor, kutu yalnız gruplar. Maket: beyaz %9
   * dolgu + %12 kenar.
   */
  inkTile: string;
  inkTileBorder: string;

  chartGrid: string;
  scrimGradientTop: string;    // hero üstü okunabilirlik gradyanı
  scrimGradientBottom: string;
}

/**
 * AÇIK TEMA — BEYAZ KÂĞIT, MOR MÜREKKEP.
 *
 * NEDEN KÂĞIT ARTIK BEYAZ (bu sürümün asıl kararı): önceki sürüm ekran zeminini
 * lavanta bir kâğıt (#ECE7F7) yapmıştı; gerekçe "mor sistemin tonu" idi. Ama
 * lavanta kâğıt, üstündeki beyaz kartla arasında yalnız üç puanlık bir fark
 * bırakıyor ve ekran, mor bir sisin içinde duran soluk bir listeye dönüşüyordu:
 * hiçbir yüzey öne çıkmıyor, mor da vurgu olmaktan çıkıp ARKA PLAN oluyordu.
 *
 * Yeni kural: KÂĞIT BEYAZDIR, MOR YALNIZ MÜREKKEPTE VE AKSİYONDADIR. Mor artık
 * her yeri kaplamadığı için gerçekten görülür — bir düğme, bir seçili sekme,
 * bir başlık moru olduğunda göz oraya gider. Uygulamanın kimliğini taşıyan
 * geniş mor yüzeyler (alt menü barı, skor bloğu, hero) yerinde durur; onlar
 * beyazın üstünde ADA gibidir ve kimliği tam da bu karşıtlık kurar.
 *
 * KART BEYAZ KÂĞIDIN ÜSTÜNDE NASIL AYRILIR: kâğıt SAF beyazdır (#FFFFFF),
 * yüzeyler ise beyazdan bir kademe aşağıda, çok açık bir lavantadır (#F8F5FE)
 * — üstüne 1px kenarlık ve geniş, sönük mor gölge biner.
 *
 * NEDEN KART BEYAZ DEĞİL: kartı da beyaz yapıp yalnız kenarlığa güvenmek
 * denendi ve tek tek kartlarda güzel çalışıyordu; ama bu uygulamanın asıl
 * yüzeyi kart değil LİSTE SATIRIDIR ve satırların kenarlığı yoktur (bkz.
 * components/ui/ListRow.tsx, MatchRow.tsx) — bir maç listesi, satırları
 * kâğıttan ayıran hiçbir şey kalmayınca tek parça beyaz bir alana dönüşüyordu.
 * Bir kademe lavanta, satırı kâğıttan ayırmaya yeter ve sayfanın beyaz
 * okunmasını bozmaz: gördüğünüz sayfa beyazdır, üstündeki bloklar değil.
 *
 * İKİ VURGU, İKİ İŞ:
 *   MOR  (`brand`)  = AKSİYON ve SEÇİLİ DURUM.
 *   CAMGÖBEĞİ (`accent`) = VERİ. Eskiden maviydi; mavi morun komşusu olduğu
 *   için bir istatistik barında "seçili mi yoksa veri mi" ayırt edilemiyordu.
 *   Camgöbeği morun karşısında durur: iki renk hiçbir ışıkta karışmaz.
 */
export const light: Palette = {
  bg:       "#FFFFFF",
  surface1: "#F8F5FE",
  surface2: "#F1ECFA",
  surface3: "#EAE3F6",
  elevated: "#FFFFFF",
  inverse:  "#1B1033",
  inkBlock: "#221340",
  overlay:  "rgba(18, 10, 38, 0.55)",
  pressed:  "#EFE9F9",
  ripple:   "rgba(109, 40, 217, 0.09)",

  textPrimary:   "#160C2E",   // nötr siyah değil MOR mürekkep
  textSecondary: "#4A3A6B",
  textTertiary:  "#6E5F8C",
  textDisabled:  "#A99CC2",
  textOnBrand:   "#FFFFFF",   // mor dolgu üstünde beyaz (7,10:1)
  textOnStatus:  "#FFFFFF",
  onDark:        "#FFFFFF",
  onDarkMuted:   "rgba(255, 255, 255, 0.68)",
  onInverse:     "#FFFFFF",

  border:       "#E4DCF3",
  borderStrong: "#CBBDE8",
  separator:    "#E9E2F5",
  borderOnDark: "rgba(255, 255, 255, 0.14)",

  brand:       "#6D28D9",
  brandStrong: "#5B21B6",
  brandAccent: "#5B21B6",     // yalnız METİN/ikon
  brandDim:    "#F3EDFE",
  brandBorder: "#DFD1FB",
  brandOnDark: "#C4B5FD",

  accent:       "#0E7490",
  accentStrong: "#0C5F77",
  accentText:   "#0E7490",
  accentDim:    "#E2F4F9",
  accentBorder: "#B6E0EC",
  textOnAccent: "#FFFFFF",

  slate:     "#7A6C99",
  slateSoft: "#CFC7E2",

  live:       "#E11D48",
  liveDim:    "#FDE8ED",
  liveGlow:   "rgba(225, 29, 72, 0.22)",
  liveOnDark: "#FF6B8A",

  win:    "#059669",  winDim:    "#E2F6F0",
  draw:   "#7A6C99",  drawDim:   "#F1ECFA",
  loss:   "#DC2626",  lossDim:   "#FDE9E9",
  warn:   "#B45309",  warnDim:   "#FDF1E3",
  danger: "#DC2626",  dangerDim: "#FDE9E9",
  info:   "#0E7490",  infoDim:   "#E2F4F9",

  yellowCard: "#CA8A04",
  redCard:    "#DC2626",
  star:       "#6D28D9",
  starEmpty:  "#D6CCEE",
  pitch:      "#123B34",
  chalk:      "rgba(255, 255, 255, 0.22)",
  chalkInk:   "rgba(22, 12, 46, 0.07)",
  onPitch:    "#FFFFFF",

  ratingPoor:  "#DC2626", ratingPoorBg:  "#FDE9E9",
  ratingFair:  "#B45309", ratingFairBg:  "#FDF1E3",
  ratingGood:  "#059669", ratingGoodBg:  "#E2F6F0",
  ratingGreat: "#047857", ratingGreatBg: "#D9F1E8",
  ratingElite: "#6D28D9", ratingEliteBg: "#F3EDFE",
  ratingNone:  "#6E5F8C", ratingNoneBg:  "#F1ECFA",

  posKeeper:    "#8A5A00",
  posDefense:   "#0E7490",
  posMidfield:  "#5B21B6",
  posForward:   "#BE123C",
  posUnknown:   "#6E5F8C",

  zoneChampion:          "#B4801F",
  zonePromotion:         "#059669",
  zonePlayoff:           "#0E7490",
  zoneRelegationPlayoff: "#B45309",
  zoneRelegation:        "#DC2626",

  gradientInk:     ["#382159", "#241540"],
  gradientBrand:   ["#7C3AED", "#6023C8"],
  gradientAccent:  ["#1193B4", "#0E7490"],
  gradientLive:    ["#EE3355", "#D42546"],
  gradientPitch:   ["#1A4B54", "#12333C"],
  gradientSurface: ["#FAF7FE", "#F4F0FC"],
  /* Kart geçişi neredeyse görünmezdir: kartı kâğıttan ayıran asıl şey lavanta
     dolgusu + kenarlık + gölgedir. Geçiş yalnız yüzeye "ışık alıyor" hissi
     verir; iki durak arasındaki fark tek kademedir. */
  gradientCard:    ["#FAF8FE", "#F5F1FC"],

  /* MAÇ SAHNESİ. Uygulamanın kâğıdı zaten beyaz olduğu için maç ekranının
     kâğıdı da beyazdır; sahneyi kuran şey üstteki mor atmosferdir, altındaki
     zeminin tonu değil. */
  matchCanvas:  "#FFFFFF",
  matchTint: "#40207A",
  /* Üç durak: tepede saydam (kapak dokusu görünsün), ortada mor yıkama, dipte
     kâğıdın kendisi. Son durak `matchCanvas` ile BİREBİR aynı olmak zorunda,
     yoksa atmosferin bittiği yerde yatay bir dikiş çizgisi görünür. */
  matchWash: ["rgba(64, 32, 122, 0)", "rgba(78, 40, 150, 0.50)", "#FFFFFF"],
  glassBorder:  "rgba(255, 255, 255, 0.28)",
  rimLight: ["#FFFFFF", "#EFE9FA"],
  rimDark:  ["rgba(255, 255, 255, 0.34)", "rgba(255, 255, 255, 0.06)"],

  shadowColor:       "#2E1065",   // MOR gölge; siyah gölge beyaz kâğıtta grileşir
  skeletonBase:      "#EFE9F9",
  skeletonHighlight: "#FAF8FE",

  tabBar:         "#281850",
  tabBarBorder:   "rgba(255, 255, 255, 0.10)",
  gradientTabBar: ["#33205C", "#1E1138"],
  tabActive:      "#FFFFFF",
  tabInactive:    "rgba(255, 255, 255, 0.58)",
  tabBeam:        "#DDD1FF",
  tabCapsule:       "rgba(167, 139, 250, 0.26)",
  tabCapsuleBorder: "rgba(221, 209, 255, 0.34)",
  inkPill:          "rgba(255, 255, 255, 0.16)",
  inkPillBorder:    "rgba(201, 184, 242, 0.45)",
  inkTile:          "rgba(255, 255, 255, 0.09)",
  inkTileBorder:    "rgba(255, 255, 255, 0.12)",

  chartGrid:         "#EDE7F7",
  scrimGradientTop:    "rgba(18, 10, 38, 0.00)",
  scrimGradientBottom: "rgba(18, 10, 38, 0.90)",
};

/**
 * KOYU TEMA — GERÇEKTEN MOR.
 *
 * NEDEN DEĞİŞTİ: önceki koyu tema zemini #0C0718 idi — adı mordu ama gözle
 * SİYAHTI. Telefon ekranında %2 doygunluktaki bir mor, siyahtan ayırt
 * edilmez; kullanıcı koyu temaya geçtiğinde markanın rengini kaybediyordu.
 *
 * Yeni zemin #180D33: hâlâ karanlık (beyaz metinle 16,4:1) ama MOR olduğu ilk
 * bakışta görülüyor. Katmanlar da mor kalır — surface1 → surface3 giderek
 * açılan mor tonlardır, gri değil. Koyu tema artık açık temanın "ışığı
 * kapatılmış" hâli değil, aynı sistemin gece sürümüdür.
 *
 * Marka moru koyu temada bir kademe AÇILIR (#7C3AED): #6D28D9 mor bir zeminin
 * üstünde kendi zeminine karışıyordu.
 */
export const dark: Palette = {
  bg:       "#180D33",
  surface1: "#221443",
  surface2: "#2A1A50",
  surface3: "#33215F",
  elevated: "#2E1C57",
  inverse:  "#F4F0FF",
  inkBlock: "#241547",
  overlay:  "rgba(10, 5, 24, 0.76)",
  pressed:  "#2A1A50",
  ripple:   "rgba(196, 181, 253, 0.10)",

  textPrimary:   "#F4F0FF",
  textSecondary: "#C0B2DC",
  textTertiary:  "#9C8CBE",
  textDisabled:  "#6A5B8C",
  textOnBrand:   "#FFFFFF",
  textOnStatus:  "#FFFFFF",
  onDark:        "#FFFFFF",
  onDarkMuted:   "rgba(255, 255, 255, 0.68)",
  onInverse:     "#160C2E",   // inverse = #F4F0FF (açık blok)

  border:       "#392561",
  borderStrong: "#4C3480",
  separator:    "#2C1B52",
  borderOnDark: "rgba(255, 255, 255, 0.14)",

  brand:       "#7C3AED",
  brandStrong: "#6D28D9",
  brandAccent: "#C4B5FD",     // koyuda metin sürümü AÇILIR
  brandDim:    "#31215C",
  brandBorder: "#4E3690",
  brandOnDark: "#C4B5FD",

  accent:       "#22D3EE",
  accentStrong: "#06B6D4",
  accentText:   "#67E8F9",
  accentDim:    "#123A47",
  accentBorder: "#1E5A6B",
  textOnAccent: "#0B2027",

  slate:     "#9C8CBE",
  slateSoft: "#4A3A70",

  live:       "#FB4E6D",
  liveDim:    "#43132A",
  liveGlow:   "rgba(251, 78, 109, 0.30)",
  liveOnDark: "#FF6B8A",

  win:    "#34D399",  winDim:    "#12352C",
  draw:   "#9C8CBE",  drawDim:   "#2C1B52",
  loss:   "#FB7185",  lossDim:   "#43132A",
  warn:   "#FBBF24",  warnDim:   "#3E2D10",
  danger: "#FB7185",  dangerDim: "#43132A",
  info:   "#67E8F9",  infoDim:   "#123A47",

  yellowCard: "#FBBF24",
  redCard:    "#FB7185",
  star:       "#C4B5FD",
  starEmpty:  "#4A3A70",
  pitch:      "#0F312B",
  chalk:      "rgba(255, 255, 255, 0.18)",
  chalkInk:   "rgba(255, 255, 255, 0.06)",
  onPitch:    "#FFFFFF",

  ratingPoor:  "#FB7185", ratingPoorBg:  "#43132A",
  ratingFair:  "#FBBF24", ratingFairBg:  "#3E2D10",
  ratingGood:  "#34D399", ratingGoodBg:  "#12352C",
  ratingGreat: "#10B981", ratingGreatBg: "#0E2C24",
  ratingElite: "#C4B5FD", ratingEliteBg: "#31215C",
  ratingNone:  "#9C8CBE", ratingNoneBg:  "#2C1B52",

  posKeeper:    "#E0AE4A",
  posDefense:   "#67E8F9",
  posMidfield:  "#C4B5FD",
  posForward:   "#FF8FA3",
  posUnknown:   "#9C8CBE",

  zoneChampion:          "#E0AE4A",
  zonePromotion:         "#34D399",
  zonePlayoff:           "#22D3EE",
  zoneRelegationPlayoff: "#FBBF24",
  zoneRelegation:        "#FB7185",

  gradientInk:     ["#301D55", "#20133D"],
  gradientBrand:   ["#7C3AED", "#6023C8"],
  gradientAccent:  ["#2DD9F2", "#06B6D4"],
  gradientLive:    ["#F7476A", "#D42B4E"],
  gradientPitch:   ["#153C45", "#0D2930"],
  gradientSurface: ["#26174A", "#1F123E"],
  gradientCard:    ["#241547", "#1D1039"],

  /* KOYU TEMA: sahne, uygulama gecesinden bir tık daha DOYGUN mora çekilir —
     atmosfer sönümlendiğinde sayfa nötre düşmesin, mor kalsın. */
  matchCanvas:  "#170C32",
  matchTint: "#39206B",
  matchWash: ["rgba(57, 32, 107, 0)", "rgba(52, 28, 100, 0.55)", "#170C32"],
  glassBorder:  "rgba(196, 181, 253, 0.22)",
  rimLight: ["#412C6E", "#241547"],
  rimDark:  ["rgba(196, 181, 253, 0.30)", "rgba(196, 181, 253, 0.05)"],

  shadowColor:       "#000000",
  skeletonBase:      "#251749",
  skeletonHighlight: "#31215C",

  /* Bar, koyu temada kâğıttan AÇIK durur — gece de "yüzen" okunsun diye. */
  /* Bar iki temada da koyu mordur; koyu temada kâğıttan yalnız denetimin
     istediği kadar (1.3:1) açık — daha açığı, gece ekranındaki en parlak
     yüzey oluyor ve mor bloktan kopuyordu. */
  tabBar:         "#33205C",
  tabBarBorder:   "rgba(255, 255, 255, 0.10)",
  gradientTabBar: ["#38225F", "#2C1B56"],
  tabActive:      "#FFFFFF",
  tabInactive:    "rgba(255, 255, 255, 0.58)",
  tabBeam:        "#DDD1FF",
  tabCapsule:       "rgba(167, 139, 250, 0.30)",
  tabCapsuleBorder: "rgba(221, 209, 255, 0.36)",
  inkPill:          "rgba(255, 255, 255, 0.16)",
  inkPillBorder:    "rgba(201, 184, 242, 0.45)",
  inkTile:          "rgba(255, 255, 255, 0.09)",
  inkTileBorder:    "rgba(255, 255, 255, 0.12)",

  chartGrid:         "#2C1B52",
  scrimGradientTop:    "rgba(15, 8, 32, 0.00)",
  scrimGradientBottom: "rgba(15, 8, 32, 0.94)",
};

/** Tema adı — depolanan tercih ve sistem ayarı bu iki değere indirgenir. */
export type ThemeName = "dark" | "light";

/** Ada göre palet seçer. */
export function paletteFor(name: ThemeName): Palette {
  return name === "dark" ? dark : light;
}
