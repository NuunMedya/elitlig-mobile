/**
 * ODAK SAYACI YARDIMCILARI — saat biçimi ve günlük istatistik anahtarı.
 * Araçlar Merkezi kartı da istatistiği buradan okur.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

import { isoDate } from "./agendaUtils";

/** Günlük odak istatistiği (cihazda). */
export const FOCUS_STATS_KEY = "tools:focus:stats";

export interface FocusStats {
  /** Yerel gün "YYYY-MM-DD". */
  day: string;
  sessions: number;
  minutes: number;
}

/** "25:00", "1:05:09", onda birli: "00:12.3" */
export function formatClock(ms: number, withTenths = false): string {
  const total = Math.max(0, ms);
  const h = Math.floor(total / 3600000);
  const m = Math.floor((total % 3600000) / 60000);
  const s = Math.floor((total % 60000) / 1000);
  const t = Math.floor((total % 1000) / 100);
  const base = `${h ? `${h}:` : ""}${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return withTenths ? `${base}.${t}` : base;
}

/** Bugünün istatistiği; başka güne aitse null. */
export async function readTodayFocus(): Promise<FocusStats | null> {
  try {
    const raw = await AsyncStorage.getItem(FOCUS_STATS_KEY);
    const stats = raw ? (JSON.parse(raw) as FocusStats) : null;
    return stats?.day === isoDate(new Date()) ? stats : null;
  } catch {
    return null;
  }
}
