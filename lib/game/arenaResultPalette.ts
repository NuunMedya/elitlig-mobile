/**
 * ARENA BİTİŞ KARTI — "canlı ama sade" tur sonu kartının ek renkleri (veri;
 * iki temada aynı). Ortak dil `lib/game/cartoon.ts`tedir. Kartın çevresi
 * nötrdür (beyaz / açık gri / lacivert mürekkep); tek vurgu yeşil birincil
 * düğmedir, altın yalnız rekor rozeti ve yıldızlar içindir. Burada rekor
 * tablosu madalyalarının yumuşak tonları, nötr yüzeyler ve gönderim hapları
 * durur.
 */

export const ARENA_RESULT = {
  /** Skor rakamı ve kartın lacivert mürekkebi. */
  score: "#18204A",
  ink: "#18204A",
  muted: "#5B5F7A",
  faint: "#8A8EA6",

  /** Nötr yüzeyler: çip / ikincil düğme / tablo kutusu ve ince kenarları. */
  surface: "#F2F4F9",
  surfaceLip: "#DCE0EC",
  edge: "rgba(20, 27, 66, 0.08)",
  edgeStrong: "rgba(20, 27, 66, 0.12)",

  /** Rekor: yumuşak altın hale (radyal, saydamlık bileşende) ve başlık mürekkebi. */
  recordGlow: "#FFD23F",
  recordInk: "#8A5A00",

  /** Kulüp Şehri yıldız hapı (altın — yıldızın kendi rengi, açık zeminde). */
  starBg: "#FFF6D6",
  starEdge: "rgba(245, 163, 0, 0.35)",
  starInk: "#6B4500",

  /** Madalyalar: yumuşak zemin + mürekkep (altın · gümüş · bronz · sırasız). */
  medal: {
    gold: { bg: "#FFF1BF", ink: "#8A5A00" },
    silver: { bg: "#E9ECF3", ink: "#4E556E" },
    bronze: { bg: "#FBE3D2", ink: "#8C4A1C" },
    plain: { bg: "transparent", ink: "#8A8EA6" },
  },

  /** Rekor tablosu satırları ve dönem sekmeleri. */
  row: "#FFFFFF",
  rowMine: "#E6F8EC",
  rowMineEdge: "rgba(29, 170, 80, 0.30)",
  rowMineInk: "#127A26",
  tabTrack: "#E4E7F0",
  tabOn: "#FFFFFF",
  tabShadow: "#0A0E24",

  /** Gönderim satırı hapları. */
  guestBg: "#EEF0FB",
  guestInk: "#343EB0",
  failBg: "#FDECEE",
  failInk: "#C8283A",
  sentInk: "#127A26",

  /** Paylaşım kartı: koyu zeminde cam hap ve ince kenar. */
  shareEdge: "rgba(255, 255, 255, 0.14)",
  sharePill: "rgba(255, 255, 255, 0.12)",
} as const;
