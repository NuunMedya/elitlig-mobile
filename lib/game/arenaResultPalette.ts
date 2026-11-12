/**
 * ARENA BİTİŞ KARTI — çizgi film temasında tur sonu kartının ek renkleri
 * (veri; iki temada aynı). Ortak dil `lib/game/cartoon.ts`tedir; burada yalnız
 * rekor tablosu madalyaları, satır dolguları ve gönderim hapları durur.
 */

type Fill = readonly [string, string];

export const ARENA_RESULT = {
  /** Skor rakamı (beyaz kartta mor, lacivert gölgeli). */
  score: "#7C4DFF",
  /** Tur istatistiği çiplerinin sıra renkleri (dolgu açık → koyu). */
  chips: [
    ["#7EC8FF", "#2F80ED"],
    ["#7CF06A", "#22B33A"],
    ["#FFB547", "#F0601A"],
    ["#FF9FC2", "#E63E7A"],
    ["#B79CFF", "#7C4DFF"],
    ["#7CF0E4", "#0EA89A"],
  ] as Fill[],

  /** Madalyalar: altın · gümüş · bronz (dolgu) ve madalyasız sıra. */
  medal: {
    gold: ["#FFE45C", "#F5A300"] as Fill,
    silver: ["#F2F4FA", "#A9B0C8"] as Fill,
    bronze: ["#FFC08A", "#C8692A"] as Fill,
    plain: ["#E4E2F4", "#C9C5E6"] as Fill,
  },
  medalInk: "#1B1446",

  /** Rekor tablosu kutusu ve satırları. */
  boardBg: "#F1F0FA",
  row: "#FFFFFF",
  rowMine: "#DDF8D6",
  rowMineInk: "#127A26",
  tabIdle: "#E4E2F4",

  /** Gönderim satırı hapları. */
  guestBg: "#E3F1FF",
  guestInk: "#1A4FA6",
  failBg: "#FFE3E6",
  failInk: "#B3172A",
  sentInk: "#127A26",
} as const;
