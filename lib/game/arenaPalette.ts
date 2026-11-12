/**
 * ELİTLİG ARENA — oyun giriş kartının oyun-içi renkleri (veri; iki temada aynı).
 * Kurdele, oyun ikonu baloncuğu, kural çipleri ve rekor hapı.
 */
export const ARENA_CARD = {
  white: "#FFFFFF",
  ink: "#1F2333",
  ribbon: ["#FF7AA8", "#7C4DFF"] as [string, string],
  icon: ["#FFB547", "#F0601A"] as [string, string],
  chips: ["#2F80ED", "#22B33A", "#F59E0B", "#E63E7A", "#8B5CF6"],
  gold: "#FFD23F",
  goldDeep: "#B07800",
} as const;
