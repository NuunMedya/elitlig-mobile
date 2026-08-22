/**
 * Renk paleti — saf veri, yan etkisi yoktur.
 *
 * Bu dosya içe aktarıldığında hiçbir şey okumaz (AsyncStorage, Appearance, vb.);
 * yalnızca iki sabit nesne tanımlar. Aktif temanın seçilmesi `theme/index.ts`
 * işidir.
 *
 * RENK FELSEFESİ — MOR SİSTEM:
 *
 *  1. MOR MARKANIN KENDİSİDİR. Uygulamanın kimliği açık mor ile koyu mor
 *     arasındaki geçiştir: kâğıt hafif lavanta, kartlar beyazdan lavantaya
 *     ışıyan bir geçiş, kimlik blokları derin mor gradyan. Mor burada bir
 *     "aksan" değil, sistemin TONUDUR.
 *
 *  2. İKİ VURGU, İKİ İŞ (kural korundu, renkler değişti):
 *       MOR   (`brand`)  = AKSİYON ve SEÇİLİ DURUM. Buton, aktif sekme,
 *                          seçili chip, favori yıldızı, bölüm işareti.
 *       MAVİ  (`accent`) = VERİ. İstatistik barı, ilerleme, ev sahibi tarafı,
 *                          öne çıkan rakam, sparkline.
 *     Mor zeminin üstünde mor bir vurgu okunmaz; bu yüzden koyu mor blokların
 *     üstündeki marka rengi ayrı bir tokendır: `brandOnDark` (açık lavanta).
 *
 *  3. KARTLAR IŞIKLIDIR AMA GEÇİŞ GÖRÜNMEZ. Varsayılan kart `gradientCard`
 *     geçişidir + 1px kenarlık + mor tonlu yumuşak gölge. Geçişin iki durağı
 *     BİRBİRİNE ÇOK YAKINDIR (açık temada #FFFFFF → #F8F4FE): amaç yüzeyin
 *     "boyanmış" görünmesi değil, ışık aldığını hissettirmektir. Keskin
 *     geçişler yüzeyi iki parçaya bölüyordu.
 *
 *     YÖN DAİMA SAĞDAN SOLADIR. Dikey geçiş, geniş ve alçak bir kartın
 *     üstünde silindir ("boru") etkisi yapıyordu; yatay geçiş yüzeyi düz
 *     bırakır. Bkz. components/ui/GradientFill.tsx.
 *
 *     Gölge rengi siyah değil `shadowColor` (derin mor): siyah gölge lavanta
 *     kâğıdın üstünde grileşip kirli görünür.
 *
 *  4. GRADYAN SAYILIDIR VE TOKENDIR. Serbest gradyan yoktur; yedi gradyanın
 *     her birinin bir İŞİ vardır: `gradientCard` kart yüzeyi, `gradientInk`
 *     kimlik bloğu, `gradientBrand` birincil aksiyon, `gradientAccent` veri,
 *     `gradientLive` canlı, `gradientPitch` saha, `gradientSurface` ikincil
 *     yüzey. Görsel üstündeki okunabilirlik scrim'i ayrıca
 *     `scrimGradientTop` → `scrimGradientBottom` ile kurulur.
 *
 *  5. KONTRAST HESAPLANDI, VARSAYILMADI. Her metin/zemin çifti
 *     `npm run check:tokens` ile iki temada da sınanır.
 *
 *  6. Durum rengi tek başına anlam taşımaz; kazanan takım kalın + textPrimary,
 *     kaybeden textTertiary olur.
 *
 *  7. Her token her iki temada da tanımlıdır; ekran hangi temada olduğunu bilmez.
 *
 * MÜREKKEP ARTIK MOR MÜREKKEPTİR: `textPrimary` nötr siyah değil çok koyu bir
 * mordur (#1A1033). Nötr siyah, lavanta kâğıdın üstünde "başka bir tema"dan
 * gelmiş gibi durur.
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
  /** Sahanın zemini — derin yeşil, üstünde beyaz tebeşir okunur. */
  gradientPitch: readonly [string, string];
  /** Kartın çok hafif üst ışığı; ikinci seviye yüzeyler. */
  gradientSurface: readonly [string, string];
  /**
   * VARSAYILAN KART YÜZEYİ — üstte açık, altta bir tık koyu. Kartın "ışıklı"
   * görünmesini sağlayan şey budur; düz dolgu yüzeyi kâğıda yapıştırıyordu.
   */
  gradientCard: readonly [string, string];

  /* — Yardımcı — */
  /** Gölge rengi — açık temada mürekkep, koyuda saf siyah. */
  shadowColor: string;
  skeletonBase: string;
  skeletonHighlight: string;
  tabBar: string;
  tabBarBorder: string;
  chartGrid: string;
  scrimGradientTop: string;    // hero üstü okunabilirlik gradyanı
  scrimGradientBottom: string;
}

/**
 * Açık tema — BİRİNCİL tema, cilalanan tema budur.
 *
 * Kontrast düzeltmeleri (ham brief değeri → buradaki değer, kağıt #F4F6FA üstü):
 *   · ink-muted   #767D8E = 3,74:1 ✗  →  #656C7D = 4,77:1 ✓ (AA metin)
 *   · slate bar   #99A1B3 = 2,35:1 ✗  →  #7C8598 = 3,36:1 ✓ (AA grafik)
 *   · mercan metin #EE7F55 = 2,44:1 ✗ →  #B0512A = 4,70:1 ✓ (AA metin)
 * Ayrıca mercan DOLGU üstünde beyaz metin 2,69:1 ile geçmiyor; bu yüzden
 * `textOnBrand` beyaz değil mürekkeptir (6,83:1). Koyu metinli mercan buton
 * hem geçer hem editoryal durur.
 */
/**
 * AÇIK MOR — birincil tema.
 *
 * Kâğıt (`bg` #ECE7F7) beyaz değil açık bir lavantadır; kart beyazdan
 * lavantaya ışıyan bir geçiştir. Kâğıt daha önce #F5F3FB idi ve kartın geçiş
 * SONU (#F8F4FE) ile arasında üç puanlık fark kalıyordu: kartın sağ ucu
 * kâğıda karışıyor, kart "sağa doğru taşıyormuş" gibi duruyordu. Kâğıt bir
 * kademe koyulaşınca kartın iki ucu da kâğıdın üstünde kalır ve ışıklı geçiş
 * kartın TAMAMINDA okunur.
 */
export const light: Palette = {
  bg:       "#ECE7F7",
  surface1: "#FFFFFF",
  surface2: "#FAF8FE",
  surface3: "#E3DCF4",
  elevated: "#FFFFFF",
  inverse:  "#1A0F2E",
  inkBlock: "#1E1235",
  overlay:  "rgba(26, 15, 46, 0.58)",
  pressed:  "#EFEAFA",
  ripple:   "rgba(109, 40, 217, 0.08)",

  textPrimary:   "#1A1033",   // nötr siyah değil MOR mürekkep
  textSecondary: "#4B3D6B",
  textTertiary:  "#6B5C8A",
  textDisabled:  "#A99CC2",
  textOnBrand:   "#FFFFFF",   // mor dolgu üstünde beyaz (5,70:1)
  textOnStatus:  "#FFFFFF",
  onDark:        "#FFFFFF",
  onDarkMuted:   "rgba(255, 255, 255, 0.66)",
  onInverse:     "#FFFFFF",

  border:       "#DCD3F0",
  borderStrong: "#C6B8E6",
  separator:    "#EFEAFA",

  brand:       "#7C3AED",
  brandStrong: "#6D28D9",
  brandAccent: "#6D28D9",     // yalnız METİN/ikon
  brandDim:    "#F1EAFE",
  brandBorder: "#DCCCFB",
  brandOnDark: "#C4B5FD",

  accent:       "#2563EB",
  accentStrong: "#1D4ED8",
  accentText:   "#1D4ED8",
  accentDim:    "#E6EDFD",
  accentBorder: "#C3D4FA",
  textOnAccent: "#FFFFFF",

  slate:     "#7A6C99",
  slateSoft: "#A79CC0",

  live:       "#E11D48",
  liveDim:    "#FDE8ED",
  liveGlow:   "rgba(225, 29, 72, 0.22)",
  liveOnDark: "#FF6B8A",

  win:    "#059669",  winDim:    "#E0F5EE",
  draw:   "#8B7FA8",  drawDim:   "#EFEAFA",
  loss:   "#DC2626",  lossDim:   "#FDE8E8",
  warn:   "#B45309",  warnDim:   "#FDF0E1",
  danger: "#DC2626",  dangerDim: "#FDE8E8",
  info:   "#2563EB",  infoDim:   "#E6EDFD",

  yellowCard: "#CA8A04",
  redCard:    "#DC2626",
  star:       "#7C3AED",
  starEmpty:  "#D2C7EC",
  pitch:      "#123B34",
  chalk:      "rgba(255, 255, 255, 0.22)",
  chalkInk:   "rgba(26, 16, 51, 0.08)",
  onPitch:    "#FFFFFF",

  ratingPoor:  "#DC2626", ratingPoorBg:  "#FDE8E8",
  ratingFair:  "#B45309", ratingFairBg:  "#FDF0E1",
  ratingGood:  "#059669", ratingGoodBg:  "#E0F5EE",
  ratingGreat: "#047857", ratingGreatBg: "#D8F0E7",
  ratingElite: "#7C3AED", ratingEliteBg: "#F1EAFE",
  ratingNone:  "#6B5C8A", ratingNoneBg:  "#EFEAFA",

  zoneChampion:          "#CA8A04",
  zonePromotion:         "#059669",
  zonePlayoff:           "#2563EB",
  zoneRelegationPlayoff: "#B45309",
  zoneRelegation:        "#DC2626",

  gradientInk:     ["#33215A", "#241641"],
  gradientBrand:   ["#8B46E8", "#7231D6"],
  gradientAccent:  ["#3D74F0", "#2A5CDC"],
  gradientLive:    ["#EE3355", "#D42546"],
  gradientPitch:   ["#155249", "#0E3D36"],
  gradientSurface: ["#FBF9FE", "#F6F2FD"],
  gradientCard:    ["#FFFFFF", "#F8F4FE"],

  shadowColor:       "#3B1E6E",   // MOR gölge; siyah gölge lavantada kirlenir
  skeletonBase:      "#EDE7F9",
  skeletonHighlight: "#F8F5FE",
  tabBar:            "#FFFFFF",
  tabBarBorder:      "#E6E0F5",
  chartGrid:         "#EDE7F9",
  scrimGradientTop:    "rgba(26, 15, 46, 0.00)",
  scrimGradientBottom: "rgba(26, 15, 46, 0.90)",
};

/**
 * KOYU MOR — açık temanın negatifi değil, AYNI SİSTEMİN koyu hâli.
 *
 * Zemin nötr siyah değil mora çalan bir gece rengidir (#0C0718); kartlar da
 * koyu mordan daha koyu mora ışır. Marka moru iki temada da aynı hex'tedir —
 * hem beyaz metinle 5,70:1 verir hem iki temayı tek marka altında tutar.
 */
export const dark: Palette = {
  bg:       "#0C0718",
  surface1: "#150C26",
  surface2: "#1B1030",
  surface3: "#23163D",
  elevated: "#2A1B48",
  inverse:  "#F5F3FB",
  inkBlock: "#1B1030",
  overlay:  "rgba(6, 3, 14, 0.78)",
  pressed:  "#1B1030",
  ripple:   "rgba(196, 181, 253, 0.09)",

  textPrimary:   "#F3EFFB",
  textSecondary: "#B4A8CE",
  textTertiary:  "#8D80AD",
  textDisabled:  "#5A4E78",
  textOnBrand:   "#FFFFFF",
  textOnStatus:  "#FFFFFF",
  onDark:        "#FFFFFF",
  onDarkMuted:   "rgba(255, 255, 255, 0.66)",
  onInverse:     "#1A1033",   // inverse = #F5F3FB (açık blok)

  border:       "#2A1D45",
  borderStrong: "#3B2A5E",
  separator:    "#221739",

  brand:       "#7C3AED",
  brandStrong: "#6D28D9",
  brandAccent: "#C4B5FD",     // koyuda metin sürümü AÇILIR
  brandDim:    "#2A1B48",
  brandBorder: "#45318C",
  brandOnDark: "#C4B5FD",

  accent:       "#60A5FA",
  accentStrong: "#3B82F6",
  accentText:   "#93BBFC",
  accentDim:    "#16224A",
  accentBorder: "#2C3F7A",
  textOnAccent: "#0C0718",

  slate:     "#8D80AD",
  slateSoft: "#4A3E68",

  live:       "#FB4E6D",
  liveDim:    "#3A0F1E",
  liveGlow:   "rgba(251, 78, 109, 0.30)",
  liveOnDark: "#FF6B8A",

  win:    "#34D399",  winDim:    "#0D3328",
  draw:   "#8D80AD",  drawDim:   "#221739",
  loss:   "#FB7185",  lossDim:   "#3A0F1E",
  warn:   "#FBBF24",  warnDim:   "#3A2A08",
  danger: "#FB7185",  dangerDim: "#3A0F1E",
  info:   "#60A5FA",  infoDim:   "#16224A",

  yellowCard: "#FBBF24",
  redCard:    "#FB7185",
  star:       "#A78BFA",
  starEmpty:  "#4A3E68",
  pitch:      "#0F312B",
  chalk:      "rgba(255, 255, 255, 0.18)",
  chalkInk:   "rgba(255, 255, 255, 0.06)",
  onPitch:    "#FFFFFF",

  ratingPoor:  "#FB7185", ratingPoorBg:  "#3A0F1E",
  ratingFair:  "#FBBF24", ratingFairBg:  "#3A2A08",
  ratingGood:  "#34D399", ratingGoodBg:  "#0D3328",
  ratingGreat: "#10B981", ratingGreatBg: "#0A2A20",
  ratingElite: "#C4B5FD", ratingEliteBg: "#2A1B48",
  ratingNone:  "#8D80AD", ratingNoneBg:  "#23163D",

  zoneChampion:          "#FBBF24",
  zonePromotion:         "#34D399",
  zonePlayoff:           "#60A5FA",
  zoneRelegationPlayoff: "#FBBF24",
  zoneRelegation:        "#FB7185",

  gradientInk:     ["#281A47", "#1B1032"],
  gradientBrand:   ["#8B46E8", "#7231D6"],
  gradientAccent:  ["#5E9CFB", "#3B82F6"],
  gradientLive:    ["#F7476A", "#D42B4E"],
  gradientPitch:   ["#124037", "#0B2E28"],
  gradientSurface: ["#1D1234", "#180E2B"],
  gradientCard:    ["#1C1233", "#170E29"],

  shadowColor:       "#000000",
  skeletonBase:      "#1B1030",
  skeletonHighlight: "#261841",
  tabBar:            "#100822",
  tabBarBorder:      "#221739",
  chartGrid:         "#23163D",
  scrimGradientTop:    "rgba(12, 7, 24, 0.00)",
  scrimGradientBottom: "rgba(12, 7, 24, 0.94)",
};

/** Tema adı — depolanan tercih ve sistem ayarı bu iki değere indirgenir. */
export type ThemeName = "dark" | "light";

/** Ada göre palet seçer. */
export function paletteFor(name: ThemeName): Palette {
  return name === "dark" ? dark : light;
}
