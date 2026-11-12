/**
 * ELİTLİG ARENA — oyun giriş kartının oyun-içi renkleri (veri; iki temada aynı).
 * Sade dil: tek vurgu (yeşil oyun simgesi), rekor için altın kupa ikonu.
 * Kart zemini ve yazılar tema tokenlarından gelir (kurulum bileşeni ile uyum).
 */
export const ARENA_CARD = {
  white: "#FFFFFF",
  ink: "#1F2333",
  /** Oyun simgesi baloncuğu (birincil vurgu: yeşil). */
  icon: ["#3FD674", "#1DAA50"] as [string, string],
  gold: "#FFD23F",
  goldDeep: "#C98A00",
} as const;
