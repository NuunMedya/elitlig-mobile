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
  sources: ["#FF7AA8", "#7EC8FF", "#FFD23F"] as [string, string, string],
  lockBg: "#C9CDD6",
  done: "#22C55E",
} as const;
