/**
 * KULÜP ŞEHRİ — kulüp renkleri ve birim ikonları.
 *
 * Renkler ALAN VERİSİDİR (oyuncunun seçtiği kulüp forması), tasarım tokenı
 * değil: 3B şehre (WebView) gider; formalar, çatılar, bayraklar ve tabelalar
 * bu renkle boyanır. Seçim cihazda saklanır.
 */

export interface ClubKit {
  key: string;
  name: string;
  primary: string;
  secondary: string;
}

export const CLUB_KITS: readonly ClubKit[] = [
  { key: "elitlig", name: "ElitLig moru", primary: "#5B3DF5", secondary: "#FFFFFF" },
  { key: "kirmizi", name: "Kırmızı-beyaz", primary: "#DC2626", secondary: "#FFFFFF" },
  { key: "sarilacivert", name: "Sarı-lacivert", primary: "#1E3A8A", secondary: "#FACC15" },
  { key: "siyahbeyaz", name: "Siyah-beyaz", primary: "#111827", secondary: "#F8FAFC" },
  { key: "bordomavi", name: "Bordo-mavi", primary: "#7F1D1D", secondary: "#38BDF8" },
  { key: "yesilbeyaz", name: "Yeşil-beyaz", primary: "#15803D", secondary: "#FFFFFF" },
  { key: "turuncu", name: "Turuncu-siyah", primary: "#EA580C", secondary: "#111827" },
  { key: "mavibeyaz", name: "Mavi-beyaz", primary: "#2563EB", secondary: "#FFFFFF" },
];

export const CITY_KIT_KEY = "elitlig.city.kit.v1";

/** Sahnenin yüklenirken gösterdiği gökyüzü zemini (WebView arka planı). */
export const CITY_SKY = "#9CCFFF";

/** Birim anahtarı → Ionicons adı (sunucu da `icon` yollar; yedek). */
export const CITY_ICONS: Record<string, string> = {
  saha: "football",
  tribun: "people",
  soyunma: "shirt",
  kantin: "cafe",
  magaza: "bag-handle",
  kulup: "business",
  antrenman: "fitness",
  saglik: "medkit",
  kamp: "bed",
  akademi: "school",
  medya: "videocam",
  ulasim: "bus",
};

/** Arena oyunlarının adları (yıldız dökümü için). */
export const ARENA_TITLES: Record<string, string> = {
  slalom: "Slalom",
  sektir: "Top Sektir",
  penalti: "Penaltı",
  savunma: "Savunma Hattı",
  kadro: "Kadro Koşusu",
  seri: "Gol Düellosu",
  kimbu: "Kim Bu?",
  tahmin: "Kim Kazandı?",
  gunun: "Günün Testi",
};

/** Birim kartlarının oyun-içi renkleri: ikon baloncuğu ve basamak çubuğu (açık → koyu). */
export const CITY_UNIT_COLORS: Record<string, [string, string]> = {
  saha: ["#5BE36B", "#1FA83A"],
  tribun: ["#FF7AA8", "#D9306E"],
  soyunma: ["#7EC8FF", "#2F80ED"],
  kantin: ["#FFB547", "#E8650C"],
  magaza: ["#C9A2FF", "#7C4DFF"],
  kulup: ["#5EE6D8", "#0E9E92"],
  saglik: ["#FF8A8A", "#E02D3C"],
  medya: ["#FFD23F", "#C98A00"],
  antrenman: ["#9BE15D", "#4C9A1A"],
  akademi: ["#8FB4FF", "#3D5AFE"],
  kamp: ["#FFA77A", "#D9541E"],
  ulasim: ["#7FD6FF", "#0B8BC4"],
};

/** Kulüp Şehri ekranının oyun-içi panelleri (iki temada aynı). */
export const CITY_UI = {
  white: "#FFFFFF",
  ink: "#1F2333",
  inkShadow: "rgba(0, 0, 0, 0.4)",
  panel: ["#3A22A8", "#1A1050"] as [string, string],
  panelEdge: "#6C55F0",
  chip: "rgba(255, 255, 255, 0.12)",
  muted: "rgba(255, 255, 255, 0.75)",
  gold: ["#FFE45C", "#F5A300"] as [string, string],
  goldLip: "#B07800",
  green: ["#6BEA62", "#22B33A"] as [string, string],
  greenLip: "#147A26",
  /** Yıldız kaynakları: Lig Yolu · Oyunlar · Saha+Görev XP · Tahmin+Fantezi · Maç · Günlük giriş. */
  sources: ["#FF7AA8", "#7EC8FF", "#FFD23F", "#5BE36B", "#14B8C4", "#FF9F5A"] as [string, string, string, string, string, string],
  lockBg: "#C9CDD6",
  done: "#22C55E",
} as const;

/* ───────────────────────── KULÜP ŞEHRİ 2.0 ───────────────────────── */

/** 2.0 binalarının ikon karoları (açık → koyu). Sunucu `icon` yollar; renk yalnız burada. */
export const CITY2_UNIT_COLORS: Record<string, [string, string]> = {
  halisaha: ["#4ADE80", "#16A34A"],
  kulup: ["#2DD4BF", "#0F9488"],
  stadyum: ["#FB7185", "#E11D48"],
  restoran: ["#FDBA74", "#EA580C"],
  magaza: ["#C4B5FD", "#7C3AED"],
  akademi: ["#93C5FD", "#2563EB"],
  ulasim: ["#7DD3FC", "#0284C7"],
  saglik: ["#FCA5A5", "#DC2626"],
  tv: ["#FDE047", "#CA8A04"],
  universite: ["#A5B4FC", "#4F46E5"],
  otel: ["#FDBA8C", "#C2410C"],
  scout: ["#67E8F9", "#0891B2"],
};

/** Sembol yapı kademeleri: ikon ve renk (sahne kendi sprite'ını çizer; bu RN listesi içindir). */
export const LANDMARK_TIER_STYLE: Record<string, { icon: string; colors: [string, string] }> = {
  sus: { icon: "flower", colors: ["#86EFAC", "#22C55E"] },
  meydan: { icon: "water", colors: ["#7DD3FC", "#0EA5E9"] },
  heykel: { icon: "body", colors: ["#CBD5E1", "#64748B"] },
  simge: { icon: "business", colors: ["#C4B5FD", "#7C3AED"] },
  kupa: { icon: "trophy", colors: ["#FDE68A", "#D97706"] },
  seri: { icon: "flame", colors: ["#FDBA74", "#EA580C"] },
};

/** Tek tek sembol yapıların ikonları (yoksa kademe ikonu). */
export const LANDMARK_ICONS: Record<string, string> = {
  bank: "reorder-four",
  sokak_lambasi: "bulb",
  agac_sirasi: "leaf",
  bayrak: "flag",
  cicek_bahcesi: "flower",
  cesme: "water",
  taraftar_duvari: "megaphone",
  arma_meydani: "shield",
  efsane_oyuncu_heykeli: "body",
  teknik_direktor_heykeli: "clipboard",
  kendi_heykelin: "person",
  saat_kulesi: "time",
  dev_forma: "shirt",
  sampiyonluk_kemeri: "medal",
  isik_gosterisi: "sparkles",
  super_lig_kupasi: "trophy",
  avrupa_ligi_kupasi: "trophy",
  sampiyonlar_ligi_kupasi: "trophy",
  seri_cesmesi: "water",
  sadik_baskan_heykeli: "ribbon",
  altin_kupa_aniti: "trophy",
};

/**
 * Şehir 2.0 ekranının sakin koyu tabanı ve tek vurgusu ("canlı ama temiz"):
 * lacivert panel, beyaz metin, yeşil = ilerle, altın = yıldız.
 */
export const CITY2_UI = {
  panel: ["#232B5C", "#141A3D"] as [string, string],
  panelEdge: "rgba(255, 255, 255, 0.10)",
  panelChip: "rgba(255, 255, 255, 0.08)",
  panelMuted: "rgba(255, 255, 255, 0.72)",
  star: "#FFC233",
  go: "#15803D",
} as const;
