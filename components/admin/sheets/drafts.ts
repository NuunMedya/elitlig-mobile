/**
 * Tablolar: kaydedilmemiş değişikliklerin cihazdaki yedeği (web sheetDrafts.js).
 *
 * Kayıt bekleyen her değişiklik yerel taslağa yazılır, sunucuya gidince
 * silinir. Uygulama kapanır ya da bağlantı koparsa dosya yeniden açıldığında
 * taslak geri yüklenir; arada başkası kaydettiyse üç yollu birleştirilir.
 * Düzenleyiciden çıkarken başlayan kayıt bitmeden aynı dosya açılırsa önce
 * o kayıt beklenir (eski sürüm yeni değerleri ezmesin).
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

import type { Workbook } from "@/lib/admin/sheetEngine";

const KEY = (id: number) => `tools:sheet-draft:${id}`;
const pending = new Map<string, Promise<unknown>>();

export interface SheetDraft {
  book: Workbook;
  baseVersion: number | null;
  baseBook?: Workbook | null;
  at: number;
}

export async function saveDraft(id: number, book: Workbook, baseVersion: number | null, baseBook: Workbook | null) {
  try {
    await AsyncStorage.setItem(KEY(id), JSON.stringify({ book, baseVersion, baseBook, at: Date.now() }));
    return true;
  } catch {
    return false;
  }
}

export async function readDraft(id: number): Promise<SheetDraft | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY(id));
    if (!raw) return null;
    const draft = JSON.parse(raw) as SheetDraft;
    return draft && draft.book && Array.isArray(draft.book.sheets) ? draft : null;
  } catch {
    return null;
  }
}

export async function clearDraft(id: number) {
  try {
    await AsyncStorage.removeItem(KEY(id));
  } catch {
    // depolama erişilemiyor
  }
}

/** Dosya için süren kaydı kaydeder; bitince kendiliğinden düşer. */
export function trackSave<T>(id: number, promise: Promise<T>): Promise<T> {
  const key = String(id);
  const wrapped: Promise<unknown> = promise
    .catch(() => undefined)
    .finally(() => {
      if (pending.get(key) === wrapped) pending.delete(key);
    });
  pending.set(key, wrapped);
  return promise;
}

/** Dosyanın süren kaydı varsa bitmesini bekler. */
export const waitForSave = (id: number) => pending.get(String(id)) ?? Promise.resolve();
