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
  seri: "Arena",
  kimbu: "Kim Bu?",
  tahmin: "Skor Tahmini",
  gunun: "Günün Testi",
};
