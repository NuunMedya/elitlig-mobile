/**
 * SIRALAMA MADALYALARI — ilk üç sıranın rozet renkleri (veri; iki temada aynı).
 * Rozet kendi zeminini taşıdığı için açık ve koyu temada aynı okunur.
 * Tonlar `lib/game/arenaResultPalette.ts` madalyalarıyla aynı aileden.
 */
export const BOARD_MEDALS = {
  gold: { bg: "#FFE7A3", ink: "#7A4E00", edge: "#F5B700" },
  silver: { bg: "#E6E9F2", ink: "#454C66", edge: "#A9B0C6" },
  bronze: { bg: "#F8DCC6", ink: "#7E3F14", edge: "#D9895A" },
} as const;

export type BoardMedal = keyof typeof BOARD_MEDALS;

export const medalFor = (rank: number): BoardMedal | null =>
  rank === 1 ? "gold" : rank === 2 ? "silver" : rank === 3 ? "bronze" : null;
