/**
 * TAHMİN LİGİ PALETİ — tema paletinde karşılığı olmayan tek renk ailesi:
 * sıralamanın ilk üçü için madalya diskleri (altın / gümüş / bronz).
 *
 * Geri kalan her şey (kart, metin, saha başlığı, durum rozetleri) tema
 * tokenlarından gelir; burası bilerek küçük tutulur. Disk üstündeki rakam
 * `ink` ile yazılır ve iki temada da disk dolgusuna göre AA (4.5:1) geçer.
 */

import { isDark } from "@/theme";

export interface MedalTone {
  fill: string;
  ring: string;
  ink: string;
}

const LIGHT: Record<1 | 2 | 3, MedalTone> = {
  1: { fill: "#F4D27A", ring: "#D9A93A", ink: "#3D2A00" },
  2: { fill: "#DCDDE6", ring: "#AEB1C2", ink: "#262838" },
  3: { fill: "#EBC2A0", ring: "#C98A5B", ink: "#3A1F0A" },
};

const DARK: Record<1 | 2 | 3, MedalTone> = {
  1: { fill: "#E3B94F", ring: "#F4D27A", ink: "#2A1C00" },
  2: { fill: "#B9BCCB", ring: "#DCDDE6", ink: "#1C1E2A" },
  3: { fill: "#C98A5B", ring: "#EBC2A0", ink: "#24120A" },
};

/** 1–3 için madalya tonu, diğer sıralar için null. */
export function medalTone(rank: number): MedalTone | null {
  if (rank !== 1 && rank !== 2 && rank !== 3) return null;
  return (isDark ? DARK : LIGHT)[rank];
}
