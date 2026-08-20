/**
 * Renk paleti — saf veri, yan etkisi yoktur.
 *
 * Bu dosya içe aktarıldığında hiçbir şey okumaz (AsyncStorage, Appearance, vb.);
 * yalnızca iki sabit nesne tanımlar. Aktif temanın seçilmesi `theme/index.ts`
 * işidir. Böylece palet, testlerde ve sunucu tarafı yardımcılarında tema
 * kurulumuna ihtiyaç duymadan kullanılabilir.
 *
 * Renk felsefesi (neden böyle):
 *  1. Zemin gerçekten koyudur (#0B0D12) — nötr-soğuk, mor tonu yok. Skor
 *     uygulamasında zemin görünmez olmalı, veri görünmelidir.
 *  2. Mor asla geniş yüzey doldurmaz. Kurumsal mor #6D28D9 korunur ama yalnız
 *     aksan olarak: aktif sekme, birincil buton, favori rozeti, 9+ reyting.
 *  3. Yüzey katmanları renkle değil aydınlıkla ayrılır; koyu temada gölge
 *     görünmediği için +%2–4 aydınlık farkı ve 1px kenarlık kullanılır.
 *  4. Durum rengi tek başına anlam taşımaz; kazanan takım kalın + textPrimary,
 *     kaybeden textTertiary olur. Yeşil/kırmızı yalnız form çipi, reyting ve
 *     delta rakamlarındadır.
 *  5. Her token her iki temada da tanımlıdır; ekran hangi temada olduğunu bilmez.
 */

export interface Palette {
  /* — Yüzey mimarisi — */
  bg: string;            // ekran zemini (en alt katman)
  surface1: string;      // satır/kart zemini
  surface2: string;      // yüzey üstü (basılı hâl, ikinci seviye)
  surface3: string;      // input, chip zemini, tablo başlığı
  elevated: string;      // bottom sheet, modal, menü
  overlay: string;       // scrim (rgba)
  pressed: string;       // Pressable basılı zemin
  ripple: string;        // Android ripple (rgba)

  /* — Metin katmanları — */
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  textDisabled: string;
  textOnBrand: string;   // mor dolgu üstündeki metin
  textOnStatus: string;  // canlı/yeşil dolgu üstündeki metin

  /* — Kenarlık / ayraç — */
  border: string;        // hairline ayraçlar, normal kenarlık
  borderStrong: string;  // odaklı input, seçili çerçeve
  separator: string;     // liste içi ayraç (border'dan bir tık sönük)

  /* — Marka — */
  brand: string;         // dolgu (buton, aktif sekme)
  brandStrong: string;   // basılı/gradient ucu
  brandAccent: string;   // metin + ikon üstünde okunur mor
  brandDim: string;      // rozet/chip zemini
  brandBorder: string;   // mor çerçeve

  /* — Durum — */
  live: string;
  liveDim: string;
  liveGlow: string;      // nabız halkası (rgba)
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
  star: string;          // favori (dolu)
  starEmpty: string;     // favori (boş)
  pitch: string;         // saha grafiği zemini (harita/diziliş)

  /* — Reyting skalası (SofaScore mantığı) — */
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

  /* — Sıralama bölgeleri — */
  zoneChampion: string;          // şampiyon / 1. sıra
  zonePromotion: string;         // doğrudan yükselme
  zonePlayoff: string;           // play-off
  zoneRelegationPlayoff: string; // düşme play-off'u
  zoneRelegation: string;        // düşme

  /* — Yardımcı — */
  skeletonBase: string;
  skeletonHighlight: string;
  tabBar: string;
  tabBarBorder: string;
  chartGrid: string;
  scrimGradientTop: string;    // hero üstü okunabilirlik gradyanı
  scrimGradientBottom: string;
}

/** Koyu tema — birincil tema. */
export const dark: Palette = {
  bg:        "#0B0D12",
  surface1:  "#11141B",
  surface2:  "#161A23",
  surface3:  "#1C212C",
  elevated:  "#222834",
  overlay:   "rgba(5, 7, 11, 0.72)",
  pressed:   "#1A1F29",
  ripple:    "rgba(255, 255, 255, 0.07)",

  textPrimary:   "#EEF1F6",
  textSecondary: "#98A1B2",
  textTertiary:  "#6B7383",
  textDisabled:  "#464D5C",
  textOnBrand:   "#FFFFFF",
  textOnStatus:  "#FFFFFF",

  border:       "#202632",
  borderStrong: "#2E3646",
  separator:    "#191E27",

  brand:       "#7C3AED",   // koyu zeminde #6D28D9 sönük kalır; dolgu için bir tık parlak
  brandStrong: "#6D28D9",   // KURUMSAL MOR — gradient ucu, basılı hâl
  brandAccent: "#A78BFA",   // metin/ikon
  brandDim:    "#1E1233",
  brandBorder: "#3A2566",

  live:     "#FF3B4E",
  liveDim:  "#2A1016",
  liveGlow: "rgba(255, 59, 78, 0.30)",

  win:    "#22C55E",  winDim:    "#0C2A1A",
  draw:   "#8B93A3",  drawDim:   "#1B202A",
  loss:   "#F04438",  lossDim:   "#2A1315",
  warn:   "#F5A524",  warnDim:   "#2A1F0A",
  danger: "#F04438",  dangerDim: "#2A1315",
  info:   "#4C8DF6",  infoDim:   "#0F1D33",

  yellowCard: "#F5C518",
  redCard:    "#E5484D",
  star:       "#F5C518",
  starEmpty:  "#565E6E",
  pitch:      "#0E2A1B",

  ratingPoor:  "#E5484D", ratingPoorBg:  "#2A1315",
  ratingFair:  "#D9922B", ratingFairBg:  "#2A1F0A",
  ratingGood:  "#27A25B", ratingGoodBg:  "#0C2A1A",
  ratingGreat: "#0E8B45", ratingGreatBg: "#08220F",
  ratingElite: "#8B5CF6", ratingEliteBg: "#1E1233",
  ratingNone:  "#6B7383", ratingNoneBg:  "#1C212C",

  zoneChampion:          "#FFC53D",
  zonePromotion:         "#22C55E",
  zonePlayoff:           "#4C8DF6",
  zoneRelegationPlayoff: "#F5A524",
  zoneRelegation:        "#F04438",

  skeletonBase:      "#161A23",
  skeletonHighlight: "#232A36",
  tabBar:            "#0E1117",
  tabBarBorder:      "#1B212C",
  chartGrid:         "#1E2430",
  scrimGradientTop:    "rgba(11, 13, 18, 0.00)",
  scrimGradientBottom: "rgba(11, 13, 18, 0.92)",
};

/** Açık tema — aynı token adları, gündüz değerleri. */
export const light: Palette = {
  bg:        "#F4F5F8",
  surface1:  "#FFFFFF",
  surface2:  "#FAFBFC",
  surface3:  "#F0F2F6",
  elevated:  "#FFFFFF",
  overlay:   "rgba(11, 13, 18, 0.45)",
  pressed:   "#EEF0F5",
  ripple:    "rgba(11, 13, 18, 0.06)",

  textPrimary:   "#0B0D12",
  textSecondary: "#5A6270",
  textTertiary:  "#858D9C",
  textDisabled:  "#AEB5C0",
  textOnBrand:   "#FFFFFF",
  textOnStatus:  "#FFFFFF",

  border:       "#E5E8EE",
  borderStrong: "#CDD3DE",
  separator:    "#ECEEF3",

  brand:       "#6D28D9",   // KURUMSAL MOR — açık zeminde birebir
  brandStrong: "#5B21B6",
  brandAccent: "#6D28D9",
  brandDim:    "#F1EAFE",
  brandBorder: "#DCCBFB",

  live:     "#E11D2E",
  liveDim:  "#FDECEE",
  liveGlow: "rgba(225, 29, 46, 0.22)",

  win:    "#128A4B",  winDim:    "#E7F6EE",
  draw:   "#6B7280",  drawDim:   "#F0F2F6",
  loss:   "#D92D20",  lossDim:   "#FDECEA",
  warn:   "#B45309",  warnDim:   "#FEF3E2",
  danger: "#D92D20",  dangerDim: "#FDECEA",
  info:   "#1D4ED8",  infoDim:   "#E8EFFD",

  yellowCard: "#E8B00A",
  redCard:    "#D92D20",
  star:       "#E8B00A",
  starEmpty:  "#B9BFCA",
  pitch:      "#E6F3EA",

  ratingPoor:  "#D92D20", ratingPoorBg:  "#FDECEA",
  ratingFair:  "#B47212", ratingFairBg:  "#FEF3E2",
  ratingGood:  "#1F8F4E", ratingGoodBg:  "#E7F6EE",
  ratingGreat: "#10703C", ratingGreatBg: "#DCF0E4",
  ratingElite: "#6D28D9", ratingEliteBg: "#F1EAFE",
  ratingNone:  "#858D9C", ratingNoneBg:  "#F0F2F6",

  zoneChampion:          "#E0A106",
  zonePromotion:         "#128A4B",
  zonePlayoff:           "#1D4ED8",
  zoneRelegationPlayoff: "#B45309",
  zoneRelegation:        "#D92D20",

  skeletonBase:      "#ECEEF3",
  skeletonHighlight: "#F7F8FA",
  tabBar:            "#FFFFFF",
  tabBarBorder:      "#E5E8EE",
  chartGrid:         "#ECEEF3",
  scrimGradientTop:    "rgba(255, 255, 255, 0.00)",
  scrimGradientBottom: "rgba(255, 255, 255, 0.92)",
};

/** Tema adı — depolanan tercih ve sistem ayarı bu iki değere indirgenir. */
export type ThemeName = "dark" | "light";

/** Ada göre palet seçer. */
export function paletteFor(name: ThemeName): Palette {
  return name === "dark" ? dark : light;
}
