/**
 * Elit Kart kademe renkleri — madalya renkleri alan verisidir (forma renkleri
 * gibi, bkz. lib/kitColors.ts), tasarım tokenı değildir. Hepsi koyu zeminlidir:
 * kart üstündeki metin iki temada da beyaz kalır.
 */
import type { EliteCard } from "./api/career";

export const TIER_GRADIENTS: Record<EliteCard["tier"] | "formda", readonly [string, string]> = {
  caylak: ["#334155", "#0F172A"],
  bronz: ["#8A5428", "#3B2210"],
  gumus: ["#7B8494", "#1F2937"],
  altin: ["#B8891E", "#4A3508"],
  elit: ["#7C3AED", "#1E0B47"],
  formda: ["#DB2777", "#4A0B2B"],
};

/** Kademe vurgusu (çerçeve, OVR rakamı). */
export const TIER_ACCENT: Record<EliteCard["tier"] | "formda", string> = {
  caylak: "#CBD5E1",
  bronz: "#F0B27A",
  gumus: "#E5E7EB",
  altin: "#FCD34D",
  elit: "#C4B5FD",
  formda: "#F9A8D4",
};
