/**
 * ElitLig tasarım sistemi — "Gece Maçı" teması.
 * Işıklandırılmış halı saha atmosferi: koyu zemin, çim yeşili vurgu, saha çizgisi beyazı.
 */
export const colors = {
  /** Ana arka plan — gece sahası */
  pitch: "#0B1310",
  /** Kart / yüzey rengi */
  surface: "#141E19",
  /** Yüzey üstü ince ayrım (satır arası) */
  surfaceRaised: "#1B2822",
  /** Çim yeşili — marka vurgusu */
  turf: "#31C86B",
  /** Vurgunun soluk tonu (rozet zemini) */
  turfDim: "#17301F",
  /** Canlı maç kırmızısı */
  live: "#FF4D4D",
  /** Sarı kart */
  yellow: "#F5C518",
  /** Kırmızı kart */
  red: "#E53935",
  /** Saha çizgisi beyazı — birincil metin */
  line: "#F2F7F4",
  /** İkincil metin */
  muted: "#8AA096",
  /** Çok silik metin / ayraçlar */
  faint: "#3A4A42",
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
