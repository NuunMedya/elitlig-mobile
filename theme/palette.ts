/**
 * Renk paleti — saf veri, yan etkisi yoktur.
 *
 * Bu dosya içe aktarıldığında hiçbir şey okumaz (AsyncStorage, Appearance, vb.);
 * yalnızca iki sabit nesne tanımlar. Aktif temanın seçilmesi `theme/index.ts`
 * işidir.
 *
 * RENK FELSEFESİ — BEYAZ KÂĞIT, KOYU MOR KİMLİK, MOR + PEMBE SİNYAL.
 *
 * Ayrıntılı gerekçe aşağıdaki `light` nesnesinin başlığında ve
 * docs/arena-tasarim-dili.md içindedir. Özet:
 *
 *  1. Kâğıt açık lavanta-gri, kartlar beyaz ve gölgesiz; koyu temada mor gece.
 *  2. Kimlik ve skor anları KOYU MOR SAHNEDE durur (`gradientInk`,
 *     `inkBlock`); iki temada da aynı. Alt menü sakin yüzeydedir.
 *  3. Renk yalnız sinyaldir: `brand` (mor) aksiyon/seçili, `accent` (pembe) veri, `live`
 *     canlı, `win/draw/loss` sonuç.
 *  4. Kart gradyanı düzdür; gölge nötr ve çok hafiftir. Gradyanlar tokendır,
 *     yönleri yatay sağdan soladır (bkz. components/ui/GradientFill.tsx).
 *  5. Kontrast hesaplanır: her çift `npm run check:tokens` ile iki temada da
 *     sınanır. Her token iki temada da tanımlıdır.
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

  /* — Alt menü barı —
   *
   * 2026-10: bar artık koyu mor bir şerit DEĞİL. Açık temada beyaz yüzey +
   * üst hairline, seçili sekme derin mor ikon/etiket ve açık lavanta kapsül;
   * koyu temada kart yüzeyi, seçili sekme pembe. Her ekranın dibindeki koyu
   * şerit, sayfanın en baskın yüzeyiydi ve içerikle yarışıyordu (FotMob,
   * Apple Sports, OneFootball barı içerikle aynı sakin yüzeyde tutar).
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
 * ELİTLİG TASARIM DİLİ — SAKİN KÂĞIT, KİMLİK KOYU MOR, VURGU PEMBE.
 *
 *   1. KÂĞIT ÇOK AÇIK LAVANTA-GRİDİR (#F7F5FB), kartlar beyaz ve GÖLGESİZ;
 *      ayrımı dolgu farkı + 1px kenarlık yapar. Arayüz ferah ve sade okunur.
 *   2. SİYAH YOK, KOYU MOR VAR. Önceki grafit (neredeyse siyah) yüzeylerin
 *      tamamı — kimlik blokları (`inkBlock`, `gradientInk`), maç sahnesi,
 *      toast — ElitLig'in koyu moruna (#2A0E5E) geçti. Metin bile
 *      saf siyah değil, morun en koyu tonudur.
 *   3. RENK PALETİ MOR + PEMBE.
 *        brand  (mor)   = AKSİYON ve SEÇİLİ DURUM
 *        accent (pembe) = VERİ (bar, oran, vurgulanan takım)
 *        live   (kırmızı) = CANLI
 *      Sonuç renkleri (galibiyet yeşili vb.) ve saha yeşili anlam taşıdığı
 *      için korunur.
 *   4. GÖLGE yalnız yüzen katmandadır (sheet, toast) ve mordur; kart gradyanı düzdür.
 */
export const light: Palette = {
  bg:       "#F7F5FB",
  surface1: "#FFFFFF",
  surface2: "#F6F3FC",
  surface3: "#EFEBF7",
  elevated: "#FFFFFF",
  inverse:  "#2A0E5E",
  inkBlock: "#2A0E5E",
  overlay:  "rgba(30, 10, 64, 0.50)",
  pressed:  "#F3EFFA",
  ripple:   "rgba(46, 16, 101, 0.07)",

  textPrimary:   "#1A1030",
  textSecondary: "#4D4466",
  textTertiary:  "#6B6382",
  textDisabled:  "#AAA2BE",
  textOnBrand:   "#FFFFFF",
  textOnStatus:  "#FFFFFF",
  onDark:        "#FFFFFF",
  onDarkMuted:   "rgba(255, 255, 255, 0.70)",
  onInverse:     "#FFFFFF",

  border:       "#EAE6F2",
  borderStrong: "#D6CEE6",
  separator:    "#F0EDF6",
  borderOnDark: "rgba(255, 255, 255, 0.14)",

  brand:       "#6D28D9",
  brandStrong: "#5B21B6",
  brandAccent: "#6D28D9",
  brandDim:    "#F1EBFE",
  brandBorder: "#DDD0FB",
  brandOnDark: "#D8C8FF",

  accent:       "#DB2777",
  accentStrong: "#BE185D",
  accentText:   "#BE185D",
  accentDim:    "#FDEDF5",
  accentBorder: "#F8C8DF",
  textOnAccent: "#FFFFFF",

  slate:     "#7A7091",
  slateSoft: "#E1DAEE",

  live:       "#E0233A",
  liveDim:    "#FDE8EB",
  liveGlow:   "rgba(224, 35, 58, 0.20)",
  liveOnDark: "#FF8A98",

  win:    "#0F9F5F",  winDim:    "#E3F6EC",
  draw:   "#6E6585",  drawDim:   "#F1EDF8",
  loss:   "#D92D20",  lossDim:   "#FDEBE9",
  warn:   "#B54708",  warnDim:   "#FEF2E4",
  danger: "#D92D20",  dangerDim: "#FDEBE9",
  info:   "#6D28D9",  infoDim:   "#F3EDFF",

  yellowCard: "#D4A106",
  redCard:    "#D92D20",
  star:       "#6D28D9",
  starEmpty:  "#D4C9EC",
  pitch:      "#103A31",
  chalk:      "rgba(255, 255, 255, 0.22)",
  chalkInk:   "rgba(46, 16, 101, 0.06)",
  onPitch:    "#FFFFFF",

  ratingPoor:  "#D92D20", ratingPoorBg:  "#FDEBE9",
  ratingFair:  "#B54708", ratingFairBg:  "#FEF2E4",
  ratingGood:  "#0F9F5F", ratingGoodBg:  "#E3F6EC",
  ratingGreat: "#067647", ratingGreatBg: "#D6F2E3",
  ratingElite: "#6D28D9", ratingEliteBg: "#F3EDFF",
  ratingNone:  "#625879", ratingNoneBg:  "#F1EDF8",

  posKeeper:    "#93610A",
  posDefense:   "#0B7468",
  posMidfield:  "#6D28D9",
  posForward:   "#BE185D",
  posUnknown:   "#625879",

  zoneChampion:          "#B7861A",
  zonePromotion:         "#0F9F5F",
  zonePlayoff:           "#DB2777",
  zoneRelegationPlayoff: "#B54708",
  zoneRelegation:        "#D92D20",

  /* SAHNE — koyu mor; sağdan sola çok hafif aydınlanır. */
  gradientInk:     ["#371379", "#2A0E5E"],
  gradientBrand:   ["#7735E3", "#6D28D9"],
  gradientAccent:  ["#EC4899", "#DB2777"],
  gradientLive:    ["#EC3A4F", "#D41F35"],
  gradientPitch:   ["#174A40", "#0F2F28"],
  gradientSurface: ["#FFFFFF", "#FFFFFF"],
  /* Kart DÜZDÜR: iki durak aynı beyaz. */
  gradientCard:    ["#FFFFFF", "#FFFFFF"],

  /* MAÇ SAHNESİ — koyu mor atmosfer, dipte beyaz kâğıt. Son durak matchCanvas ile aynı. */
  matchCanvas:  "#F7F5FB",
  matchTint: "#2A0E5E",
  matchWash: ["rgba(42, 14, 94, 0)", "rgba(42, 14, 94, 0.55)", "#F7F5FB"],
  glassBorder:  "rgba(255, 255, 255, 0.18)",
  rimLight: ["#FFFFFF", "#F3EEFC"],
  rimDark:  ["rgba(255, 255, 255, 0.24)", "rgba(255, 255, 255, 0.05)"],

  shadowColor:       "#2A0E5E",
  skeletonBase:      "#EEEAF6",
  skeletonHighlight: "#F8F6FC",

  /* ALT MENÜ — beyaz; seçili sekme derin mor. */
  tabBar:         "#FFFFFF",
  tabBarBorder:   "#EAE6F2",
  gradientTabBar: ["#FFFFFF", "#FFFFFF"],
  tabActive:      "#6D28D9",
  tabInactive:    "#6B6382",
  tabBeam:        "#DB2777",
  tabCapsule:       "#F1EBFE",
  tabCapsuleBorder: "rgba(109, 40, 217, 0)",
  inkPill:          "rgba(255, 255, 255, 0.12)",
  inkPillBorder:    "rgba(255, 255, 255, 0.22)",
  inkTile:          "rgba(255, 255, 255, 0.08)",
  inkTileBorder:    "rgba(255, 255, 255, 0.14)",

  chartGrid:         "#F0EDF6",
  scrimGradientTop:    "rgba(30, 10, 64, 0.00)",
  scrimGradientBottom: "rgba(30, 10, 64, 0.88)",
};

/**
 * KOYU TEMA — mor gece. Siyah yerine morun en derin tonları; kartlar bir
 * kademe açık, marka moru ve pembe koyu zeminde okunsun diye açılır.
 */
export const dark: Palette = {
  bg:       "#100820",
  surface1: "#190F2E",
  surface2: "#21163B",
  surface3: "#2A1D48",
  elevated: "#21163B",
  inverse:  "#F5F1FD",
  inkBlock: "#2A0E5E",
  overlay:  "rgba(8, 3, 20, 0.72)",
  pressed:  "#21163B",
  ripple:   "rgba(255, 255, 255, 0.08)",

  textPrimary:   "#FFFFFF",
  textSecondary: "#CBC2DF",
  textTertiary:  "#9E94B8",
  textDisabled:  "#5F5478",
  textOnBrand:   "#FFFFFF",
  textOnStatus:  "#FFFFFF",
  onDark:        "#FFFFFF",
  onDarkMuted:   "rgba(255, 255, 255, 0.70)",
  onInverse:     "#1A1030",

  border:       "#2B2045",
  borderStrong: "#43376A",
  separator:    "#22183A",
  borderOnDark: "rgba(255, 255, 255, 0.14)",

  brand:       "#7C3AED",
  brandStrong: "#6D28D9",
  brandAccent: "#C4B5FD",
  brandDim:    "#2A1A50",
  brandBorder: "#45317C",
  brandOnDark: "#D8C8FF",

  accent:       "#F472B6",
  accentStrong: "#EC4899",
  accentText:   "#F9A8D4",
  accentDim:    "#3A1431",
  accentBorder: "#5C2149",
  textOnAccent: "#2A0618",

  slate:     "#9C91B5",
  slateSoft: "#3A2F56",

  live:       "#FF4D61",
  liveDim:    "#3A1219",
  liveGlow:   "rgba(255, 77, 97, 0.28)",
  liveOnDark: "#FF8A98",

  win:    "#34D399",  winDim:    "#0F2E22",
  draw:   "#9C91B5",  drawDim:   "#251B3C",
  loss:   "#FF7A6E",  lossDim:   "#3A1512",
  warn:   "#F5B544",  warnDim:   "#33240C",
  danger: "#FF7A6E",  dangerDim: "#3A1512",
  info:   "#C4B5FD",  infoDim:   "#2A1B4E",

  yellowCard: "#F5B544",
  redCard:    "#FF7A6E",
  star:       "#C4B5FD",
  starEmpty:  "#463A68",
  pitch:      "#0E2E27",
  chalk:      "rgba(255, 255, 255, 0.18)",
  chalkInk:   "rgba(255, 255, 255, 0.05)",
  onPitch:    "#FFFFFF",

  ratingPoor:  "#FF7A6E", ratingPoorBg:  "#3A1512",
  ratingFair:  "#F5B544", ratingFairBg:  "#33240C",
  ratingGood:  "#34D399", ratingGoodBg:  "#0F2E22",
  ratingGreat: "#10B981", ratingGreatBg: "#0C2A1F",
  ratingElite: "#C4B5FD", ratingEliteBg: "#2A1B4E",
  ratingNone:  "#9C91B5", ratingNoneBg:  "#251B3C",

  posKeeper:    "#E7B54A",
  posDefense:   "#5EEAD4",
  posMidfield:  "#C4B5FD",
  posForward:   "#F9A8D4",
  posUnknown:   "#9C91B5",

  zoneChampion:          "#E7B54A",
  zonePromotion:         "#34D399",
  zonePlayoff:           "#F472B6",
  zoneRelegationPlayoff: "#E39A5B",
  zoneRelegation:        "#FF7A6E",

  gradientInk:     ["#371379", "#2A0E5E"],
  gradientBrand:   ["#8148F0", "#6D28D9"],
  gradientAccent:  ["#F472B6", "#EC4899"],
  gradientLive:    ["#FF4D61", "#E02A40"],
  gradientPitch:   ["#174A40", "#0D2822"],
  gradientSurface: ["#190F2E", "#190F2E"],
  gradientCard:    ["#190F2E", "#190F2E"],

  matchCanvas:  "#100820",
  matchTint: "#2A0E5E",
  matchWash: ["rgba(42, 14, 94, 0)", "rgba(42, 14, 94, 0.62)", "#100820"],
  glassBorder:  "rgba(255, 255, 255, 0.16)",
  rimLight: ["#34284F", "#1B1232"],
  rimDark:  ["rgba(255, 255, 255, 0.18)", "rgba(255, 255, 255, 0.04)"],

  shadowColor:       "#05020D",
  skeletonBase:      "#21163B",
  skeletonHighlight: "#2A1D48",

  tabBar:         "#190F2E",
  tabBarBorder:   "#2B2045",
  gradientTabBar: ["#190F2E", "#190F2E"],
  tabActive:      "#F9A8D4",
  tabInactive:    "#A69CC0",
  tabBeam:        "#F472B6",
  tabCapsule:       "rgba(244, 114, 182, 0.16)",
  tabCapsuleBorder: "rgba(216, 200, 255, 0)",
  inkPill:          "rgba(255, 255, 255, 0.12)",
  inkPillBorder:    "rgba(255, 255, 255, 0.22)",
  inkTile:          "rgba(255, 255, 255, 0.08)",
  inkTileBorder:    "rgba(255, 255, 255, 0.14)",

  chartGrid:         "#22183A",
  scrimGradientTop:    "rgba(8, 3, 20, 0.00)",
  scrimGradientBottom: "rgba(8, 3, 20, 0.90)",
};

/** Tema adı — depolanan tercih ve sistem ayarı bu iki değere indirgenir. */
export type ThemeName = "dark" | "light";

/** Ada göre palet seçer. */
export function paletteFor(name: ThemeName): Palette {
  return name === "dark" ? dark : light;
}
