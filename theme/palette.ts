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
 * ARENA TASARIM DİLİ — NÖTR SAHNE, RENK SİNYALDİR.
 *
 * Önceki dil (mor kâğıt, mor blok, mor bar, lavanta kartlar) markayı her
 * yüzeye yayıyordu; sonuçta hiçbir şey öne çıkmıyor, ekranlar "temalı bir
 * uygulama" gibi okunuyordu. Arena profesyonel spor/veri ürünlerinin dilini
 * benimser:
 *
 *   1. KÂĞIT NÖTRDÜR. Açıkta serin gri kâğıt (#F3F4F6) + saf beyaz kartlar;
 *      koyuda neredeyse siyah grafit (#0B0D11) + bir kademe açık kartlar.
 *   2. SAHNE GRAFİTTİR. Kimlik ve skor anları (maç skorbordu, takım/oyuncu
 *      kimliği, vitrin, alt menü) koyu grafit "sahne" yüzeyinde durur; mor
 *      değil. Sahne iki temada da aynıdır — kimlik tema değiştikçe değişmez.
 *   3. RENK YALNIZ SİNYALDİR.
 *        brand  (elektrik menekşe) = AKSİYON ve SEÇİLİ DURUM
 *        accent (zümrüt camgöbeği)  = VERİ (bar, oran, vurgulanan takım)
 *        live   (kırmızı)           = CANLI
 *      Bir ekranda renkli olan her şey ya dokunulur ya da bir veri söyler.
 *   4. GÖLGE NÖTR VE ÇOK HAFİFTİR; kartı kâğıttan ayıran asıl şey beyaz dolgu
 *      + 1px kenarlıktır. Kart gradyanı düzdür (iki durak aynı renk).
 */
export const light: Palette = {
  bg:       "#F3F4F6",
  surface1: "#FFFFFF",
  surface2: "#F7F8FA",
  surface3: "#EDEFF3",
  elevated: "#FFFFFF",
  inverse:  "#111318",
  inkBlock: "#14161C",
  overlay:  "rgba(9, 11, 16, 0.52)",
  pressed:  "#F0F1F4",
  ripple:   "rgba(17, 19, 24, 0.06)",

  textPrimary:   "#0E1116",
  textSecondary: "#454B57",
  textTertiary:  "#5F6672",
  textDisabled:  "#A3A9B4",
  textOnBrand:   "#FFFFFF",
  textOnStatus:  "#FFFFFF",
  onDark:        "#FFFFFF",
  onDarkMuted:   "rgba(255, 255, 255, 0.66)",
  onInverse:     "#FFFFFF",

  border:       "#E3E6EB",
  borderStrong: "#C9CED6",
  separator:    "#ECEEF1",
  borderOnDark: "rgba(255, 255, 255, 0.10)",

  brand:       "#5B3DF5",
  brandStrong: "#4A2EDB",
  brandAccent: "#4A2EDB",
  brandDim:    "#EFECFF",
  brandBorder: "#D6CFFF",
  brandOnDark: "#B4A8FF",

  accent:       "#0B7A6E",
  accentStrong: "#0B7468",
  accentText:   "#0B7468",
  accentDim:    "#E2F4F1",
  accentBorder: "#B4E1DA",
  textOnAccent: "#FFFFFF",

  slate:     "#6B7280",
  slateSoft: "#D3D7DE",

  live:       "#E0233A",
  liveDim:    "#FDE8EB",
  liveGlow:   "rgba(224, 35, 58, 0.20)",
  liveOnDark: "#FF6B7D",

  win:    "#0F9F5F",  winDim:    "#E3F6EC",
  draw:   "#6B7280",  drawDim:   "#EEF0F3",
  loss:   "#D92D20",  lossDim:   "#FDEBE9",
  warn:   "#B54708",  warnDim:   "#FEF2E4",
  danger: "#D92D20",  dangerDim: "#FDEBE9",
  info:   "#0B7468",  infoDim:   "#E2F4F1",

  yellowCard: "#D4A106",
  redCard:    "#D92D20",
  star:       "#5B3DF5",
  starEmpty:  "#C9CED6",
  pitch:      "#103A31",
  chalk:      "rgba(255, 255, 255, 0.22)",
  chalkInk:   "rgba(14, 17, 22, 0.06)",
  onPitch:    "#FFFFFF",

  ratingPoor:  "#D92D20", ratingPoorBg:  "#FDEBE9",
  ratingFair:  "#B54708", ratingFairBg:  "#FEF2E4",
  ratingGood:  "#0F9F5F", ratingGoodBg:  "#E3F6EC",
  ratingGreat: "#067647", ratingGreatBg: "#D6F2E3",
  ratingElite: "#5B3DF5", ratingEliteBg: "#EFECFF",
  ratingNone:  "#5F6672", ratingNoneBg:  "#EEF0F3",

  posKeeper:    "#93610A",
  posDefense:   "#0B7468",
  posMidfield:  "#4A2EDB",
  posForward:   "#C01048",
  posUnknown:   "#5F6672",

  zoneChampion:          "#B7861A",
  zonePromotion:         "#0F9F5F",
  zonePlayoff:           "#0B7A6E",
  zoneRelegationPlayoff: "#B54708",
  zoneRelegation:        "#D92D20",

  /* SAHNE — grafit; sağdan sola çok hafif aydınlanır. */
  gradientInk:     ["#1F222B", "#121419"],
  gradientBrand:   ["#6A4FF7", "#5233E8"],
  gradientAccent:  ["#0E8C7E", "#0B7A6E"],
  gradientLive:    ["#EC3A4F", "#D41F35"],
  gradientPitch:   ["#174A40", "#0F2F28"],
  gradientSurface: ["#FFFFFF", "#F7F8FA"],
  /* Kart DÜZDÜR: iki durak aynı beyaz. */
  gradientCard:    ["#FFFFFF", "#FFFFFF"],

  /* MAÇ SAHNESİ — grafit atmosfer, dipte kâğıt. Son durak matchCanvas ile aynı. */
  matchCanvas:  "#F3F4F6",
  matchTint: "#14161C",
  matchWash: ["rgba(20, 22, 28, 0)", "rgba(20, 22, 28, 0.62)", "#F3F4F6"],
  glassBorder:  "rgba(255, 255, 255, 0.16)",
  rimLight: ["#FFFFFF", "#F1F2F5"],
  rimDark:  ["rgba(255, 255, 255, 0.20)", "rgba(255, 255, 255, 0.04)"],

  shadowColor:       "#0B0F19",
  skeletonBase:      "#E9EBEF",
  skeletonHighlight: "#F5F6F8",

  /* ALT MENÜ — sahne grafiti, iki temada da. */
  tabBar:         "#14161C",
  tabBarBorder:   "rgba(255, 255, 255, 0.08)",
  gradientTabBar: ["#1D2027", "#121419"],
  tabActive:      "#FFFFFF",
  tabInactive:    "rgba(255, 255, 255, 0.55)",
  tabBeam:        "#B4A8FF",
  tabCapsule:       "rgba(124, 102, 255, 0.24)",
  tabCapsuleBorder: "rgba(180, 168, 255, 0.30)",
  inkPill:          "rgba(255, 255, 255, 0.10)",
  inkPillBorder:    "rgba(255, 255, 255, 0.18)",
  inkTile:          "rgba(255, 255, 255, 0.06)",
  inkTileBorder:    "rgba(255, 255, 255, 0.10)",

  chartGrid:         "#ECEEF1",
  scrimGradientTop:    "rgba(9, 11, 16, 0.00)",
  scrimGradientBottom: "rgba(9, 11, 16, 0.88)",
};

/**
 * KOYU TEMA — grafit gece. Kâğıt neredeyse siyah, kartlar bir kademe açık;
 * marka moru bir kademe açılır ki koyu zeminde okunabilsin.
 */
export const dark: Palette = {
  bg:       "#0B0D11",
  surface1: "#15181E",
  surface2: "#1B1F26",
  surface3: "#242932",
  elevated: "#1B1F26",
  inverse:  "#F2F4F7",
  inkBlock: "#14161C",
  overlay:  "rgba(0, 0, 0, 0.70)",
  pressed:  "#1B1F26",
  ripple:   "rgba(255, 255, 255, 0.08)",

  textPrimary:   "#F2F4F7",
  textSecondary: "#B6BCC7",
  textTertiary:  "#8E96A3",
  textDisabled:  "#565D69",
  textOnBrand:   "#FFFFFF",
  textOnStatus:  "#FFFFFF",
  onDark:        "#FFFFFF",
  onDarkMuted:   "rgba(255, 255, 255, 0.66)",
  onInverse:     "#0E1116",

  border:       "#262B34",
  borderStrong: "#3A404C",
  separator:    "#1F232A",
  borderOnDark: "rgba(255, 255, 255, 0.10)",

  brand:       "#6C55FF",
  brandStrong: "#5B3DF5",
  brandAccent: "#B4A8FF",
  brandDim:    "#1F1B3D",
  brandBorder: "#3A3275",
  brandOnDark: "#B4A8FF",

  accent:       "#2DD4BF",
  accentStrong: "#14B8A6",
  accentText:   "#5EEAD4",
  accentDim:    "#0F2E2A",
  accentBorder: "#1A4A43",
  textOnAccent: "#06201D",

  slate:     "#8E96A3",
  slateSoft: "#363C47",

  live:       "#FF4D61",
  liveDim:    "#3A1219",
  liveGlow:   "rgba(255, 77, 97, 0.28)",
  liveOnDark: "#FF6B7D",

  win:    "#34D399",  winDim:    "#0F2E22",
  draw:   "#8E96A3",  drawDim:   "#1F232A",
  loss:   "#FF7A6E",  lossDim:   "#3A1512",
  warn:   "#F5B544",  warnDim:   "#33240C",
  danger: "#FF7A6E",  dangerDim: "#3A1512",
  info:   "#5EEAD4",  infoDim:   "#0F2E2A",

  yellowCard: "#F5B544",
  redCard:    "#FF7A6E",
  star:       "#B4A8FF",
  starEmpty:  "#3A404C",
  pitch:      "#0E2E27",
  chalk:      "rgba(255, 255, 255, 0.18)",
  chalkInk:   "rgba(255, 255, 255, 0.05)",
  onPitch:    "#FFFFFF",

  ratingPoor:  "#FF7A6E", ratingPoorBg:  "#3A1512",
  ratingFair:  "#F5B544", ratingFairBg:  "#33240C",
  ratingGood:  "#34D399", ratingGoodBg:  "#0F2E22",
  ratingGreat: "#10B981", ratingGreatBg: "#0C2A1F",
  ratingElite: "#B4A8FF", ratingEliteBg: "#1F1B3D",
  ratingNone:  "#8E96A3", ratingNoneBg:  "#1F232A",

  posKeeper:    "#E7B54A",
  posDefense:   "#5EEAD4",
  posMidfield:  "#B4A8FF",
  posForward:   "#FF8FA8",
  posUnknown:   "#8E96A3",

  zoneChampion:          "#E7B54A",
  zonePromotion:         "#34D399",
  zonePlayoff:           "#2DD4BF",
  zoneRelegationPlayoff: "#E39A5B",
  zoneRelegation:        "#FF7A6E",

  gradientInk:     ["#1F222B", "#121419"],
  gradientBrand:   ["#6C55FF", "#5233E8"],
  gradientAccent:  ["#2DD4BF", "#14B8A6"],
  gradientLive:    ["#FF4D61", "#E02A40"],
  gradientPitch:   ["#174A40", "#0D2822"],
  gradientSurface: ["#191C23", "#15181E"],
  gradientCard:    ["#15181E", "#15181E"],

  matchCanvas:  "#0B0D11",
  matchTint: "#14161C",
  matchWash: ["rgba(20, 22, 28, 0)", "rgba(20, 22, 28, 0.62)", "#0B0D11"],
  glassBorder:  "rgba(255, 255, 255, 0.14)",
  rimLight: ["#2A2F39", "#15181E"],
  rimDark:  ["rgba(255, 255, 255, 0.16)", "rgba(255, 255, 255, 0.03)"],

  shadowColor:       "#000000",
  skeletonBase:      "#1B1F26",
  skeletonHighlight: "#242932",

  tabBar:         "#16191F",
  tabBarBorder:   "rgba(255, 255, 255, 0.08)",
  gradientTabBar: ["#20242C", "#16191F"],
  tabActive:      "#FFFFFF",
  tabInactive:    "rgba(255, 255, 255, 0.55)",
  tabBeam:        "#B4A8FF",
  tabCapsule:       "rgba(124, 102, 255, 0.26)",
  tabCapsuleBorder: "rgba(180, 168, 255, 0.30)",
  inkPill:          "rgba(255, 255, 255, 0.10)",
  inkPillBorder:    "rgba(255, 255, 255, 0.18)",
  inkTile:          "rgba(255, 255, 255, 0.06)",
  inkTileBorder:    "rgba(255, 255, 255, 0.10)",

  chartGrid:         "#1F232A",
  scrimGradientTop:    "rgba(0, 0, 0, 0.00)",
  scrimGradientBottom: "rgba(0, 0, 0, 0.90)",
};

/** Tema adı — depolanan tercih ve sistem ayarı bu iki değere indirgenir. */
export type ThemeName = "dark" | "light";

/** Ada göre palet seçer. */
export function paletteFor(name: ThemeName): Palette {
  return name === "dark" ? dark : light;
}
