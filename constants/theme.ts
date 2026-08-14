/**
 * ElitLig tasarım sistemi — web sitesiyle ortak kimlik.
 *
 * Site: açık lavanta zemin, beyaz kartlar, elitlig moru vurgu, altın skor
 * rozetleri, yeşil aksiyon butonları. Token adları değişmedi; yalnızca
 * değerler siteye çekildi — böylece tüm ekranlar tek dosyayla yeni kimliğe
 * geçer. ("turf" artık marka moru demektir.)
 */
export const colors = {
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
} as const;

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
