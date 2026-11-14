/**
 * Çevrimdışı önbellek — bir sorgunun son başarılı yanıtı cihazda saklanır;
 * ağ yokken (yalnız isOfflineError) o yanıt döner. Bilgi yarışmalarının
 * soru havuzu ve Günün Testi'nin günlük havuzu böyle önbelleklenir (§7).
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

import { isOfflineError, noteOnline, noteRequestError } from "./net";

const PREFIX = "elitlig.offline.cache.v1.";

interface Stored<T> {
  at: number;
  /** UTC günü (toISOString) — `sameDay` seçeneği için. */
  day: string;
  data: T;
}

const utcDay = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);

export class OfflineCacheMiss extends Error {
  offline = true;
  constructor() {
    super("İnternet gerekli: bu içerik henüz cihaza kaydedilmedi.");
    this.name = "OfflineCacheMiss";
  }
}

/**
 * `fetcher` başarılıysa sonucu saklar ve döndürür. Ağ hatasında saklanmış
 * sonuç döner (`sameDay`: yalnız bugün saklanmışsa); yoksa OfflineCacheMiss.
 */
export async function withOfflineCache<T>(key: string, fetcher: () => Promise<T>, opts?: { sameDay?: boolean }): Promise<T> {
  try {
    const data = await fetcher();
    noteOnline();
    const stored: Stored<T> = { at: Date.now(), day: utcDay(), data };
    void AsyncStorage.setItem(PREFIX + key, JSON.stringify(stored)).catch(() => undefined);
    return data;
  } catch (error) {
    noteRequestError(error);
    if (!isOfflineError(error)) throw error;
    const raw = await AsyncStorage.getItem(PREFIX + key).catch(() => null);
    if (raw) {
      try {
        const stored = JSON.parse(raw) as Stored<T>;
        if (!opts?.sameDay || stored.day === utcDay()) return stored.data;
      } catch {
        /* bozuk kayıt */
      }
    }
    throw new OfflineCacheMiss();
  }
}

export const isOfflineCacheMiss = (error: unknown): error is OfflineCacheMiss => error instanceof OfflineCacheMiss;
