/**
 * Renk paleti — saf veri, yan etkisi yoktur.
 *
 * Bu dosya içe aktarıldığında hiçbir şey okumaz (AsyncStorage, Appearance, vb.);
 * yalnızca iki sabit nesne tanımlar. Aktif temanın seçilmesi `theme/index.ts`
 * işidir.
 *
 * RENK FELSEFESİ (2026-11 GECE TEMASI) — MOR GECE, CAMGÖBEĞİ IŞIK, PEMBE CANLI.
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

  /* YÖNETİM MODU — yönetici oturumunda uygulama başka bir kimliğe bürünür:
     gece laciverti yüzey + altın vurgu. İki temada da AYNI (koyu) kalır ki
     "şu an yönetim modundayım" bilgisi tema değişse de kaybolmasın. */
  adminBar: string;
  adminBarBorder: string;
  gradientAdminBar: readonly [string, string];
  /** Yönetim sahnesi (ana ekran kimlik bloğu) gradyanı. */
  gradientAdminStage: readonly [string, string];
  adminTabActive: string;
  adminTabInactive: string;
  adminCapsule: string;
  /** Altın vurgu: orta düğme, seçili işaretler, mod rozetleri. */
  adminAccent: string;
  gradientAdminAccent: readonly [string, string];
  /** Altın yüzeyin üstündeki metin/ikon. */
  adminAccentInk: string;
  /** Açık/koyu kâğıt üstünde altın tonlu yumuşak zemin ve onun metni. */
  adminAccentDim: string;
  adminAccentText: string;

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

  /* — GECE TEMASI (2026-11) — imza degrade, aurora ve cam — */
  /**
   * İMZA DEGRADE — mor → camgöbeği. YALNIZ GRAFİK İŞARETTE kullanılır: alt
   * menü kapsülü, sekme solucan çizgisi, ilerleme barı, halkalar, seçili gün.
   * Üstüne metin yazılmaz (camgöbeği ucunda beyaz metin AA'yı geçmez);
   * metin taşıyan dolgu `gradientBrand`tır.
   */
  gradientSignature: readonly [string, string];
  /** Aurora arka planının üç ışık lekesi (yarı saydam). */
  auroraViolet: string;
  auroraCyan: string;
  auroraPink: string;
  /** Cam yüzey: yüzen bar, hap seçici, başlık düğmesi (yarı saydam). */
  glass: string;
  /** Cam yüzeyin ışıklı kenarı. */
  glassLine: string;
  /** Marka parıltısı — mor gölge rengi (buton, kapsül, seçili gün). */
  glow: string;
  /** Butonun üstünden geçen ışık şeridi (saydam → beyaz → saydam). */
  shineGradient: readonly [string, string, string];
  /** Anahtar topu ve kaydırıcı başparmağı — iki temada da beyaz. */
  knob: string;
}

/**
 * ELİTLİG GECE TEMASI (2026-11) — MOR GECE, CAMGÖBEĞİ IŞIK, PEMBE CANLI.
 *
 *   1. KOYU TEMA "GECE MORU": zemin siyah değil, mora çalan bir gece
 *      (#100F1A). Kartlar bir kademe açık ve hafif mor. Ekranların tepesinde
 *      mor + camgöbeği bir ışık (aurora) durur.
 *   2. AÇIK TEMA "LAVANTA SİS": lavanta zemin, beyaz kartlar, aynı renkler
 *      beyazda okunacak kadar koyulaştırılmış.
 *   3. RENKLERİN ANLAMI:
 *        brand  (mor)        = AKSİYON ve SEÇİLİ DURUM
 *        accent (camgöbeği)  = VERİ (bar, oran, ev sahibi)
 *        live   (pembe)      = CANLI
 *        win nane · draw altın · loss kırmızı
 *   4. İMZA DEGRADE mor → camgöbeği yalnız grafik işarettedir
 *      (`gradientSignature`); metin taşıyan dolgu `gradientBrand`tır.
 *   5. Gölge yalnız yüzen katmandadır ve mor tonludur; seçili kapsül ve
 *      birincil buton mor bir parıltı (`glow`) taşır.
 */
export const light: Palette = {
  bg:       "#F4F3FB",
  surface1: "#FFFFFF",
  surface2: "#F3F1FB",
  surface3: "#EAE7F6",
  elevated: "#FFFFFF",
  inverse:  "#1D1A3D",
  inkBlock: "#1D1A3D",
  overlay:  "rgba(21, 19, 42, 0.50)",
  pressed:  "#EFEDF9",
  ripple:   "rgba(40, 30, 110, 0.07)",

  textPrimary:   "#15132A",
  textSecondary: "#4A4766",
  textTertiary:  "#666383",
  textDisabled:  "#ABA8C4",
  textOnBrand:   "#FFFFFF",
  textOnStatus:  "#FFFFFF",
  onDark:        "#FFFFFF",
  onDarkMuted:   "rgba(255, 255, 255, 0.72)",
  onInverse:     "#FFFFFF",

  border:       "#E4E1F1",
  borderStrong: "#CFCAE6",
  separator:    "#EEECF7",
  borderOnDark: "rgba(255, 255, 255, 0.14)",

  brand:       "#5A46F0",
  brandStrong: "#4936D6",
  brandAccent: "#5340E6",
  brandDim:    "#ECE9FE",
  brandBorder: "#D3CCFB",
  brandOnDark: "#C9C1FF",

  accent:       "#0776AA",
  accentStrong: "#06628E",
  accentText:   "#06709C",
  accentDim:    "#E3F4FC",
  accentBorder: "#BCE5F7",
  textOnAccent: "#FFFFFF",

  slate:     "#7A7894",
  slateSoft: "#E0DDF0",

  live:       "#DB2E6B",
  liveDim:    "#FDE7EF",
  liveGlow:   "rgba(219, 46, 107, 0.20)",
  liveOnDark: "#FF8CB5",

  win:    "#0C9672",  winDim:    "#E1F6F0",
  draw:   "#A87300",  drawDim:   "#FBF2DC",
  loss:   "#DC3049",  lossDim:   "#FDE9EC",
  warn:   "#B0600A",  warnDim:   "#FEF1E2",
  danger: "#DC3049",  dangerDim: "#FDE9EC",
  info:   "#06709C",  infoDim:   "#E3F4FC",

  yellowCard: "#E0A800",
  redCard:    "#DC3049",
  star:       "#D69A00",
  starEmpty:  "#D6D2EA",
  pitch:      "#103A33",
  chalk:      "rgba(255, 255, 255, 0.22)",
  chalkInk:   "rgba(40, 30, 110, 0.06)",
  onPitch:    "#FFFFFF",

  ratingPoor:  "#DC3049", ratingPoorBg:  "#FDE9EC",
  ratingFair:  "#B0600A", ratingFairBg:  "#FEF1E2",
  ratingGood:  "#0C9672", ratingGoodBg:  "#E1F6F0",
  ratingGreat: "#06709C", ratingGreatBg: "#E3F4FC",
  ratingElite: "#5A46F0", ratingEliteBg: "#ECE9FE",
  ratingNone:  "#625F7D", ratingNoneBg:  "#F0EEF8",

  posKeeper:    "#8F5F06",
  posDefense:   "#06709C",
  posMidfield:  "#5A46F0",
  posForward:   "#C42762",
  posUnknown:   "#625F7D",

  zoneChampion:          "#C98A00",
  zonePromotion:         "#0C9672",
  zonePlayoff:           "#0776AA",
  zoneRelegationPlayoff: "#B0600A",
  zoneRelegation:        "#DC3049",

  /* SAHNE — gece moru; mor bir ışıkla aydınlanır. İki temada da aynı. */
  gradientInk:     ["#2B2470", "#1A1740"],
  gradientBrand:   ["#5A46F0", "#3F64F2"],
  gradientAccent:  ["#0A86BE", "#06628E"],
  gradientLive:    ["#F0457F", "#D42A64"],
  gradientPitch:   ["#174A40", "#0F2F28"],
  gradientSurface: ["#FFFFFF", "#FFFFFF"],
  gradientCard:    ["#FFFFFF", "#FFFFFF"],

  matchCanvas: "#F4F3FB",
  matchTint:   "#1D1A3D",
  matchWash:   ["rgba(29, 26, 61, 0)", "rgba(29, 26, 61, 0.55)", "#F4F3FB"],
  glassBorder: "rgba(255, 255, 255, 0.18)",
  rimLight: ["#FFFFFF", "#EFEDF9"],
  rimDark:  ["rgba(255, 255, 255, 0.24)", "rgba(255, 255, 255, 0.05)"],

  shadowColor:       "#2A2070",
  skeletonBase:      "#ECE9F6",
  skeletonHighlight: "#F8F7FD",

  /* ALT MENÜ — yüzen beyaz cam; seçili sekme imza degradeli kapsül. */
  tabBar:         "#FFFFFF",
  tabBarBorder:   "rgba(40, 30, 110, 0.08)",
  gradientTabBar: ["#FFFFFF", "#FFFFFF"],
  tabActive:      "#5A46F0",
  tabInactive:    "#666383",
  tabBeam:        "#0776AA",
  tabCapsule:       "#5A46F0",
  tabCapsuleBorder: "rgba(255, 255, 255, 0.18)",

  adminBar:           "#12142A",
  adminBarBorder:     "#252845",
  gradientAdminBar:   ["#181B36", "#12142A"],
  gradientAdminStage: ["#22265A", "#12142A"],
  adminTabActive:     "#F7C948",
  adminTabInactive:   "#A1A6C4",
  adminCapsule:       "rgba(247, 201, 72, 0.16)",
  adminAccent:        "#F7C948",
  gradientAdminAccent: ["#FBD86A", "#F2B420"],
  adminAccentInk:     "#1A1405",
  adminAccentDim:     "#FBF1D3",
  adminAccentText:    "#7A5600",
  inkPill:          "rgba(255, 255, 255, 0.12)",
  inkPillBorder:    "rgba(255, 255, 255, 0.22)",
  inkTile:          "rgba(255, 255, 255, 0.08)",
  inkTileBorder:    "rgba(255, 255, 255, 0.14)",

  chartGrid:           "#EEECF7",
  scrimGradientTop:    "rgba(21, 19, 42, 0.00)",
  scrimGradientBottom: "rgba(21, 19, 42, 0.88)",

  gradientSignature: ["#5A46F0", "#0BA5E3"],
  auroraViolet: "rgba(110, 91, 255, 0.20)",
  auroraCyan:   "rgba(56, 198, 255, 0.16)",
  auroraPink:   "rgba(255, 92, 168, 0.10)",
  glass:        "rgba(255, 255, 255, 0.86)",
  glassLine:    "rgba(40, 30, 110, 0.08)",
  glow:         "#5A46F0",
  shineGradient: ["rgba(255, 255, 255, 0)", "rgba(255, 255, 255, 0.45)", "rgba(255, 255, 255, 0)"],
  knob:         "#FFFFFF",
};

/**
 * KOYU TEMA "GECE MORU" — siyah yerine mora çalan gece; kartlar bir kademe
 * açık. Mor ve camgöbeği koyu zeminde okunacak kadar açıktır.
 */
export const dark: Palette = {
  bg:       "#100F1A",
  surface1: "#1A1929",
  surface2: "#232138",
  surface3: "#2B2943",
  elevated: "#1E1D30",
  inverse:  "#F4F3FB",
  inkBlock: "#1F1B45",
  overlay:  "rgba(6, 5, 14, 0.72)",
  pressed:  "#232138",
  ripple:   "rgba(255, 255, 255, 0.08)",

  textPrimary:   "#F4F4F8",
  textSecondary: "#B9B7D3",
  textTertiary:  "#8F8DAC",
  textDisabled:  "#55536E",
  textOnBrand:   "#FFFFFF",
  textOnStatus:  "#FFFFFF",
  onDark:        "#FFFFFF",
  onDarkMuted:   "rgba(255, 255, 255, 0.72)",
  onInverse:     "#15132A",

  border:       "#27253C",
  borderStrong: "#3A3852",
  separator:    "#201E31",
  borderOnDark: "rgba(255, 255, 255, 0.12)",

  brand:       "#6E5BFF",
  brandStrong: "#5A46F0",
  brandAccent: "#ADA2FF",
  brandDim:    "#221F45",
  brandBorder: "#3B3480",
  brandOnDark: "#C9C1FF",

  accent:       "#38C6FF",
  accentStrong: "#1FAEEA",
  accentText:   "#7FDBFF",
  accentDim:    "#0F2A3A",
  accentBorder: "#1B4A63",
  textOnAccent: "#06202E",

  slate:     "#8F8DAC",
  slateSoft: "#2E2C45",

  live:       "#FF5C9A",
  liveDim:    "#3A1428",
  liveGlow:   "rgba(255, 92, 154, 0.30)",
  liveOnDark: "#FF8CB5",

  win:    "#3DDBB0",  winDim:    "#0E2E28",
  draw:   "#FFD166",  drawDim:   "#33290F",
  loss:   "#FF6378",  lossDim:   "#3A1520",
  warn:   "#FFB547",  warnDim:   "#33240C",
  danger: "#FF6378",  dangerDim: "#3A1520",
  info:   "#7FDBFF",  infoDim:   "#0F2A3A",

  yellowCard: "#FFD166",
  redCard:    "#FF6378",
  star:       "#FFD166",
  starEmpty:  "#3A3852",
  pitch:      "#0E2E2A",
  chalk:      "rgba(255, 255, 255, 0.18)",
  chalkInk:   "rgba(255, 255, 255, 0.05)",
  onPitch:    "#FFFFFF",

  ratingPoor:  "#FF6378", ratingPoorBg:  "#3A1520",
  ratingFair:  "#FFB547", ratingFairBg:  "#33240C",
  ratingGood:  "#3DDBB0", ratingGoodBg:  "#0E2E28",
  ratingGreat: "#38C6FF", ratingGreatBg: "#0F2A3A",
  ratingElite: "#ADA2FF", ratingEliteBg: "#221F45",
  ratingNone:  "#8F8DAC", ratingNoneBg:  "#232138",

  posKeeper:    "#FFD166",
  posDefense:   "#38C6FF",
  posMidfield:  "#ADA2FF",
  posForward:   "#FF8CB5",
  posUnknown:   "#8F8DAC",

  zoneChampion:          "#FFD166",
  zonePromotion:         "#3DDBB0",
  zonePlayoff:           "#38C6FF",
  zoneRelegationPlayoff: "#FFB547",
  zoneRelegation:        "#FF6378",

  gradientInk:     ["#2B2470", "#1A1740"],
  gradientBrand:   ["#6E5BFF", "#4C6CFF"],
  gradientAccent:  ["#38C6FF", "#1FAEEA"],
  gradientLive:    ["#FF5C9A", "#E0336F"],
  gradientPitch:   ["#15463F", "#0C2824"],
  gradientSurface: ["#1A1929", "#1A1929"],
  gradientCard:    ["#1C1B2C", "#1A1929"],

  matchCanvas: "#100F1A",
  matchTint:   "#241E5C",
  matchWash:   ["rgba(36, 30, 92, 0)", "rgba(36, 30, 92, 0.62)", "#100F1A"],
  glassBorder: "rgba(255, 255, 255, 0.14)",
  rimLight: ["#2E2C48", "#1C1B2C"],
  rimDark:  ["rgba(255, 255, 255, 0.18)", "rgba(255, 255, 255, 0.04)"],

  shadowColor:       "#000000",
  skeletonBase:      "#1E1D30",
  skeletonHighlight: "#2B2943",

  tabBar:         "#1D1C2E",
  tabBarBorder:   "rgba(255, 255, 255, 0.09)",
  gradientTabBar: ["#1D1C2E", "#1D1C2E"],
  tabActive:      "#FFFFFF",
  tabInactive:    "#8F8DAC",
  tabBeam:        "#38C6FF",
  tabCapsule:       "#6E5BFF",
  tabCapsuleBorder: "rgba(255, 255, 255, 0.16)",

  adminBar:           "#12142A",
  adminBarBorder:     "#252845",
  gradientAdminBar:   ["#181B36", "#12142A"],
  gradientAdminStage: ["#22265A", "#12142A"],
  adminTabActive:     "#F7C948",
  adminTabInactive:   "#A1A6C4",
  adminCapsule:       "rgba(247, 201, 72, 0.16)",
  adminAccent:        "#F7C948",
  gradientAdminAccent: ["#FBD86A", "#F2B420"],
  adminAccentInk:     "#1A1405",
  adminAccentDim:     "rgba(247, 201, 72, 0.14)",
  adminAccentText:    "#F7C948",
  inkPill:          "rgba(255, 255, 255, 0.12)",
  inkPillBorder:    "rgba(255, 255, 255, 0.22)",
  inkTile:          "rgba(255, 255, 255, 0.08)",
  inkTileBorder:    "rgba(255, 255, 255, 0.14)",

  chartGrid:           "#201E31",
  scrimGradientTop:    "rgba(6, 5, 14, 0.00)",
  scrimGradientBottom: "rgba(6, 5, 14, 0.90)",

  gradientSignature: ["#6E5BFF", "#38C6FF"],
  auroraViolet: "rgba(110, 91, 255, 0.34)",
  auroraCyan:   "rgba(56, 198, 255, 0.16)",
  auroraPink:   "rgba(255, 92, 168, 0.12)",
  glass:        "rgba(29, 28, 46, 0.90)",
  glassLine:    "rgba(255, 255, 255, 0.09)",
  glow:         "#6E5BFF",
  shineGradient: ["rgba(255, 255, 255, 0)", "rgba(255, 255, 255, 0.40)", "rgba(255, 255, 255, 0)"],
  knob:         "#FFFFFF",
};

/** Tema adı — depolanan tercih ve sistem ayarı bu iki değere indirgenir. */
export type ThemeName = "dark" | "light";

/** Ada göre palet seçer. */
export function paletteFor(name: ThemeName): Palette {
  return name === "dark" ? dark : light;
}
