/**
 * GÖREV PALETİ — dört görev kategorisinin kimlik renkleri (Saha · Oyun ·
 * Şehir · Tribün). Tema paletinde dört ayrı, iki temada da okunur ton yok
 * (`info` ile `brandAccent` aynı mor), bu yüzden aile burada tutulur.
 *
 *   fg      kâğıt yüzey üstünde metin / simge (yüzeye göre AA)
 *   bg      simge kutusu ve seçili sekme zemini (soluk ton)
 *   solid   "Yap" düğmesi, sekme göstergesi dolgusu
 *   onSolid `solid` üstündeki metin (AA)
 *   onDark  koyu sahne (ink) üstünde metin / simge
 */

import type { QuestCategory } from "@/lib/api/career";
import { isDark } from "@/theme";

export interface QuestTone {
  fg: string;
  bg: string;
  solid: string;
  onSolid: string;
  onDark: string;
}

type Key = Exclude<QuestCategory, "kesif">;

const LIGHT: Record<Key, QuestTone> = {
  saha: { fg: "#0B7F49", bg: "#E3F6EC", solid: "#0B7F49", onSolid: "#FFFFFF", onDark: "#4ADE80" },
  oyun: { fg: "#6D28D9", bg: "#F1EBFE", solid: "#6D28D9", onSolid: "#FFFFFF", onDark: "#D8C8FF" },
  sehir: { fg: "#A84300", bg: "#FEF0DC", solid: "#F2A516", onSolid: "#2B1700", onDark: "#FFD166" },
  tribun: { fg: "#1D5FD1", bg: "#E6EFFD", solid: "#1D5FD1", onSolid: "#FFFFFF", onDark: "#8EC5FF" },
};

const DARK: Record<Key, QuestTone> = {
  saha: { fg: "#34D399", bg: "#0F2E22", solid: "#34D399", onSolid: "#062218", onDark: "#4ADE80" },
  oyun: { fg: "#C4B5FD", bg: "#2A1A50", solid: "#B49BFC", onSolid: "#1A0B3D", onDark: "#D8C8FF" },
  sehir: { fg: "#F5B544", bg: "#33240C", solid: "#F5B544", onSolid: "#2B1A00", onDark: "#FFD166" },
  tribun: { fg: "#7DB4FF", bg: "#0F2340", solid: "#7DB4FF", onSolid: "#071A33", onDark: "#8EC5FF" },
};

const TABLE = isDark ? DARK : LIGHT;

/** Kategorinin tonu (`kesif` Tribün tonunu alır). */
export const questTone = (category: QuestCategory): QuestTone => TABLE[category === "kesif" ? "tribun" : category];
