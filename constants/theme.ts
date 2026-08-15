import { Appearance } from "react-native";
import { getStoredTheme } from "./themePreference";

/**
 * ElitLig tasarım sistemi — web sitesiyle ortak kimlik, iki tema.
 *
 * Aydınlık: sitenin gündüz yüzü (açık lavanta zemin, beyaz kartlar).
 * Karanlık: sitenin koyu başlık dünyası (mor-siyah zemin, koyu kartlar,
 * parlaklaştırılmış mor vurgu — koyu zeminde #6D28D9 sönük kaldığı için
 * #A78BFA kullanılır).
 *
 * Tema, uygulama açılışında telefonun sistem ayarından okunur. Token adları
 * her iki temada aynıdır; ekranlar hangi temada olduklarını bilmez.
 */

const light = {
  /** Ana arka plan — açık lavanta */
  pitch: "#F5F3FB",
  /** Kart / yüzey rengi — beyaz */
  surface: "#FFFFFF",
  /** Yüzey üstü ince ayrım — açık mor satır */
  surfaceRaised: "#F4EFFB",
  /** Marka vurgusu — elitlig moru (eski adıyla turf) */
  turf: "#6D28D9",
  /** Vurgunun soluk tonu (rozet zemini) */
  turfDim: "#EDE7FA",
  /** Canlı maç kırmızısı */
  live: "#E5484D",
  /** Altın — skor rozetleri, öne çıkarmalar (sarı kart için de kullanılır) */
  yellow: "#E8B00A",
  /** Kırmızı kart / tehlike */
  red: "#D92D20",
  /** Birincil metin — koyu mürekkep */
  line: "#17131F",
  /** İkincil metin */
  muted: "#736E82",
  /** Çok silik metin / ayraçlar / kenarlıklar */
  faint: "#E4DFF1",
  /** Aksiyon yeşili — giriş / kayıt butonları */
  green: "#178A50",
  /** Altın rozet zemini — skor hapları */
  goldDim: "#FAEDC4",
};

const dark: typeof light = {
  pitch: "#0F0C16",
  surface: "#1A1524",
  surfaceRaised: "#251D35",
  turf: "#A78BFA",
  turfDim: "#2B2144",
  live: "#F1606A",
  yellow: "#F0BE2E",
  red: "#F97066",
  line: "#F2EFF9",
  muted: "#9A93AC",
  faint: "#2F2744",
  green: "#3DBE7E",
  goldDim: "#3A2F10",
};

/** Kullanıcı tercihi (güneş/ay düğmesi) varsa o, yoksa sistem teması. */
const override = getStoredTheme();
export const isDark = override ? override === "dark" : Appearance.getColorScheme() === "dark";

export const colors: typeof light = isDark ? dark : light;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 14,
  lg: 20,
  pill: 999,
} as const;

export const type = {
  /** Skorlar ve büyük rakamlar için */
  score: { fontSize: 26, fontWeight: "800" as const, letterSpacing: -0.5 },
  title: { fontSize: 20, fontWeight: "700" as const },
  subtitle: { fontSize: 16, fontWeight: "700" as const },
  body: { fontSize: 15, fontWeight: "500" as const },
  small: { fontSize: 13, fontWeight: "500" as const },
  caption: { fontSize: 12, fontWeight: "600" as const, letterSpacing: 0.6 },
} as const;
