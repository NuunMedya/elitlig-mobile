/**
 * Renk paleti — saf veri, yan etkisi yoktur.
 *
 * Bu dosya içe aktarıldığında hiçbir şey okumaz (AsyncStorage, Appearance, vb.);
 * yalnızca iki sabit nesne tanımlar. Aktif temanın seçilmesi `theme/index.ts`
 * işidir. Böylece palet, testlerde ve sunucu tarafı yardımcılarında tema
 * kurulumuna ihtiyaç duymadan kullanılabilir.
 *
 * RENK FELSEFESİ (yeniden tasarım — iki renk, iki iş):
 *
 *  1. İKİ VURGU RENGİ, İKİ AYRI GÖREV. Bu paletin tek kuralı budur:
 *       MERCAN (`brand`)  = AKSİYON ve SEÇİLİ DURUM. Birincil buton, aktif
 *                           sekme, seçili chip, favori yıldızı, bölüm işareti.
 *       MAVİ   (`accent`) = VERİ. İstatistik barı, ilerleme, ev sahibi tarafı,
 *                           öne çıkan rakam, sparkline.
 *     Bir ekranda mercan kaplı alan o ekranın %5'ini geçmez. Mavi dekorasyon
 *     için, mercan veri için ASLA kullanılmaz. Bu ayrım ihlal edilirse ekran
 *     "iki vurgu rengi yarışıyor" görüntüsüne düşer.
 *
 *  2. AÇIK TEMA BİRİNCİLDİR. Zemin (`bg` #F2F4F7) sıcak krem değil SOĞUK
 *     gri-mavi kağıttır. Koyu temadaki lacivert, açık temada kağıdın içindeki
 *     soğuk alt ton olarak yaşar; ısıtılmış krem ucuz görünür.
 *
 *  3. GÖLGE DEĞİL ÇİZGİ. Varsayılan kart `surface1` + 1px `border`; gölge
 *     yalnız yüzen katmanlara (sheet, sticky şerit, dropdown) ayrılmıştır.
 *     Bkz. theme/elevation.ts.
 *
 *  4. GRADIENT NEREDEYSE YASAK. Tek istisna hero/kapak görsellerinin üstündeki
 *     okunabilirlik scrim'i (`scrimGradientTop` → `scrimGradientBottom`).
 *
 *  5. KONTRAST HESAPLANDI, VARSAYILMADI. Üç token brief'teki ham değerinden
 *     koyulaştırıldı çünkü WCAG AA'yı geçmiyordu — ayrıntı aşağıda ilgili
 *     satırların yanında.
 *
 *  6. Durum rengi tek başına anlam taşımaz; kazanan takım kalın + textPrimary,
 *     kaybeden textTertiary olur. Yeşil/kırmızı yalnız form çipi, reyting ve
 *     delta rakamlarındadır.
 *
 *  7. Her token her iki temada da tanımlıdır; ekran hangi temada olduğunu bilmez.
 *
 * KURUMSAL MOR NEREDE: #6D28D9 arayüzden tamamen kalktı, yalnız marka
 * varlıklarında (logo, splash görseli, app ikonu) yaşamaya devam ediyor.
 * Arayüzde mor bir yüzey görürseniz o bir hatadır.
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
  onDark: string;        // koyu blok üstündeki metin
  onDarkMuted: string;   // koyu blok üstündeki ikincil metin

  /* — Kenarlık / ayraç — */
  border: string;        // hairline ayraçlar, normal kenarlık
  borderStrong: string;  // odaklı input, seçili çerçeve
  separator: string;     // liste içi ayraç (border'dan bir tık sönük)

  /* — MERCAN: aksiyon ve seçili durum — */
  brand: string;         // dolgu (buton, aktif sekme, seçili chip)
  brandStrong: string;   // basılı hâl
  brandAccent: string;   // mercanın METİN sürümü — dolgu için KULLANMA
  brandDim: string;      // rozet/chip zemini (tint)
  brandBorder: string;   // mercan çerçeve

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
  pitch: string;         // saha zemini — YEŞİL DEĞİL, sunken yüzey
  chalk: string;         // saha çizgisi (koyu saha üstünde beyaz tebeşir)
  chalkInk: string;      // kağıt üstünde tebeşir (orta yuvarlak yayı, ayraç)

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

  /* — Yardımcı — */
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
 * Kontrast düzeltmeleri (ham brief değeri → buradaki değer, kağıt #F2F4F7 üstü):
 *   · ink-muted   #767D8E = 3,74:1 ✗  →  #656C7D = 4,77:1 ✓ (AA metin)
 *   · slate bar   #99A1B3 = 2,35:1 ✗  →  #7C8598 = 3,36:1 ✓ (AA grafik)
 *   · mercan metin #EE7F55 = 2,44:1 ✗ →  #B0512A = 4,70:1 ✓ (AA metin)
 * Ayrıca mercan DOLGU üstünde beyaz metin 2,69:1 ile geçmiyor; bu yüzden
 * `textOnBrand` beyaz değil mürekkeptir (6,83:1). Koyu metinli mercan buton
 * hem geçer hem editoryal durur.
 */
export const light: Palette = {
  bg:       "#F2F4F7",
  surface1: "#FFFFFF",
  surface2: "#F8F9FB",
  surface3: "#EAEDF2",
  elevated: "#FFFFFF",
  inverse:  "#12141C",
  overlay:  "rgba(18, 20, 28, 0.56)",
  pressed:  "#EAEDF2",
  ripple:   "rgba(18, 20, 28, 0.06)",

  textPrimary:   "#12141C",
  textSecondary: "#454B5C",
  textTertiary:  "#656C7D",   // brief #767D8E → koyulaştırıldı (AA)
  textDisabled:  "#A7AEBD",
  textOnBrand:   "#12141C",   // mercan üstünde BEYAZ DEĞİL mürekkep (AA)
  textOnStatus:  "#FFFFFF",
  onDark:        "#FFFFFF",
  onDarkMuted:   "rgba(255, 255, 255, 0.64)",

  border:       "#E2E6EC",
  borderStrong: "#CFD5DE",
  separator:    "#EBEEF3",

  brand:       "#EE7F55",
  brandStrong: "#D96B42",
  brandAccent: "#B0512A",     // yalnız METİN/ikon; dolgu olarak kullanma
  brandDim:    "#FDF0EA",
  brandBorder: "#F6D3C3",

  accent:       "#2743F0",
  accentStrong: "#1C31BE",
  accentText:   "#2743F0",
  accentDim:    "#E9ECFE",
  accentBorder: "#C3CBFB",
  textOnAccent: "#FFFFFF",

  slate:     "#7C8598",       // brief #99A1B3 → koyulaştırıldı (grafik 3:1)
  slateSoft: "#99A1B3",

  live:     "#E0374A",
  liveDim:  "#FDECEE",
  liveGlow: "rgba(224, 55, 74, 0.20)",

  win:    "#14966B",  winDim:    "#E4F5EE",
  draw:   "#9AA2B1",  drawDim:   "#EFF1F5",
  loss:   "#D0455A",  lossDim:   "#FCEBEE",
  warn:   "#B45309",  warnDim:   "#FEF3E2",
  danger: "#D0455A",  dangerDim: "#FCEBEE",
  info:   "#2743F0",  infoDim:   "#E9ECFE",

  yellowCard: "#E8B00A",
  redCard:    "#D0455A",
  star:       "#EE7F55",
  starEmpty:  "#CFD5DE",
  pitch:      "#EAEDF2",
  chalk:      "rgba(255, 255, 255, 0.55)",
  chalkInk:   "rgba(18, 20, 28, 0.08)",

  ratingPoor:  "#D0455A", ratingPoorBg:  "#FCEBEE",
  ratingFair:  "#B45309", ratingFairBg:  "#FEF3E2",
  ratingGood:  "#14966B", ratingGoodBg:  "#E4F5EE",
  ratingGreat: "#0E7052", ratingGreatBg: "#DCF0E8",
  ratingElite: "#2743F0", ratingEliteBg: "#E9ECFE",
  ratingNone:  "#656C7D", ratingNoneBg:  "#EAEDF2",

  zoneChampion:          "#E0A106",
  zonePromotion:         "#14966B",
  zonePlayoff:           "#2743F0",
  zoneRelegationPlayoff: "#B45309",
  zoneRelegation:        "#D0455A",

  skeletonBase:      "#EAEDF2",
  skeletonHighlight: "#F5F7FA",
  tabBar:            "#FFFFFF",
  tabBarBorder:      "#E2E6EC",
  chartGrid:         "#EAEDF2",
  scrimGradientTop:    "rgba(18, 20, 28, 0.00)",
  scrimGradientBottom: "rgba(18, 20, 28, 0.88)",
};

/**
 * Koyu tema — açık temanın negatifi değil, AYNI SİSTEMİN koyu hâli.
 *
 * Kağıdın soğuk gri-mavi alt tonu koyuda da sürer (#0E1016 nötr-soğuk, mor
 * tonu yok). Mercan aynı hex'te kalır — koyu zeminde 6,4:1 ile zaten okunur.
 * Mavi ise #2743F0 olarak koyu zeminde sönük kalır, bir tık açılır.
 */
export const dark: Palette = {
  bg:       "#0E1016",
  surface1: "#171A22",
  surface2: "#1D212A",
  surface3: "#242934",
  elevated: "#2A303C",
  inverse:  "#F2F4F7",
  overlay:  "rgba(6, 7, 10, 0.76)",
  pressed:  "#1D212A",
  ripple:   "rgba(255, 255, 255, 0.07)",

  textPrimary:   "#F2F4F7",
  textSecondary: "#A8B0BF",
  textTertiary:  "#848C9B",   // AA için açıldı: #79808F kart üstünde 4,39:1
  textDisabled:  "#525968",
  textOnBrand:   "#12141C",   // mercan koyuda da açık bir dolgudur
  textOnStatus:  "#FFFFFF",
  onDark:        "#FFFFFF",
  onDarkMuted:   "rgba(255, 255, 255, 0.64)",

  border:       "#262B36",
  borderStrong: "#343A48",
  separator:    "#1F242E",

  brand:       "#EE7F55",
  brandStrong: "#D96B42",
  brandAccent: "#F09B77",     // koyuda metin sürümü AÇILIR (koyulaşmaz)
  brandDim:    "#2A1A12",
  brandBorder: "#4A2A1B",

  accent:       "#6E80FF",    // #2743F0 koyu zeminde okunmaz
  accentStrong: "#5566E8",
  accentText:   "#8E9CFF",
  accentDim:    "#161B3A",
  accentBorder: "#2C3566",
  textOnAccent: "#0E1016",

  slate:     "#8A93A6",
  slateSoft: "#5C6474",

  live:     "#FF4759",
  liveDim:  "#2E1218",
  liveGlow: "rgba(255, 71, 89, 0.28)",

  win:    "#25B37F",  winDim:    "#0D2C21",
  draw:   "#8A93A6",  drawDim:   "#1F242E",
  loss:   "#F0637A",  lossDim:   "#2E1218",
  warn:   "#F5A524",  warnDim:   "#2C2009",
  danger: "#F0637A",  dangerDim: "#2E1218",
  info:   "#6E80FF",  infoDim:   "#161B3A",

  yellowCard: "#F5C518",
  redCard:    "#F0637A",
  star:       "#EE7F55",
  starEmpty:  "#525968",
  pitch:      "#1A1F29",
  chalk:      "rgba(255, 255, 255, 0.10)",
  chalkInk:   "rgba(255, 255, 255, 0.06)",

  ratingPoor:  "#F0637A", ratingPoorBg:  "#2E1218",
  ratingFair:  "#E0921F", ratingFairBg:  "#2C2009",
  ratingGood:  "#25B37F", ratingGoodBg:  "#0D2C21",
  ratingGreat: "#149C6B", ratingGreatBg: "#0A2318",
  ratingElite: "#6E80FF", ratingEliteBg: "#161B3A",
  ratingNone:  "#79808F", ratingNoneBg:  "#242934",

  zoneChampion:          "#F5C518",
  zonePromotion:         "#25B37F",
  zonePlayoff:           "#6E80FF",
  zoneRelegationPlayoff: "#F5A524",
  zoneRelegation:        "#F0637A",

  skeletonBase:      "#1D212A",
  skeletonHighlight: "#272D38",
  tabBar:            "#12151C",
  tabBarBorder:      "#1F242E",
  chartGrid:         "#242934",
  scrimGradientTop:    "rgba(14, 16, 22, 0.00)",
  scrimGradientBottom: "rgba(14, 16, 22, 0.94)",
};

/** Tema adı — depolanan tercih ve sistem ayarı bu iki değere indirgenir. */
export type ThemeName = "dark" | "light";

/** Ada göre palet seçer. */
export function paletteFor(name: ThemeName): Palette {
  return name === "dark" ? dark : light;
}
