/**
 * ÇEVRİMDIŞI KUYRUK (sözleşme §7) — `elitlig.offline.queue.v1.<userId>`.
 *
 * Sunucuya ulaşılamadığında bitirilen bölüm (`level`) ve arena turu
 * (`arena`) burada bekler. Gönderim `POST /api/puzzle/sync` ile tek
 * istekte: ok / dup / rejected olanlar silinir, ağ hatasında kuyruk kalır.
 * Misafirin kuyruğu yoktur (yerel rekor ve yerel can zaten cihazda).
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";

import { syncOffline, type OfflineArenaEvent, type OfflineEvent, type OfflineLevelEvent, type SyncResponse } from "../puzzle/api";
import { isOfflineError, noteOnline, noteRequestError, uuid } from "./net";

const KEY = (userId: number) => `elitlig.offline.queue.v1.${userId}`;
/** Sunucu tek istekte en çok bu kadar olay alır. */
const BATCH = 100;
/** Kuyruk üst sınırı. */
const MAX_QUEUE = 500;
/**
 * Sunucu bir olayı yanıtlamadıysa (sonuç listesinde yok) ya da parti ağ dışı
 * bir hatayla reddedildiyse olayın deneme sayısı artar; bu kadar denemeden
 * sonra olay kuyruktan çıkarılır. Eskiden tek bir bozuk olay kuyruğu kalıcı
 * olarak tıkıyordu (her gönderim aynı partiyle aynı hatayı alıyordu).
 */
const MAX_ATTEMPTS = 5;
type Queued = OfflineEvent & { attempts?: number };

type Draft<T extends OfflineEvent> = Omit<T, "id"> & { id?: string };

const counts = new Map<number, number>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());

async function read(userId: number): Promise<OfflineEvent[]> {
  const raw = await AsyncStorage.getItem(KEY(userId)).catch(() => null);
  if (!raw) return [];
  try {
    const list = JSON.parse(raw) as OfflineEvent[];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

async function write(userId: number, list: OfflineEvent[]) {
  counts.set(userId, list.length);
  emit();
  await AsyncStorage.setItem(KEY(userId), JSON.stringify(list)).catch(() => undefined);
}

/** Yazma sırası: aynı anda iki ekleme birbirini ezmesin. */
let chain: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.catch(() => undefined);
  return run;
}

export function enqueueOffline(userId: number, event: Draft<OfflineLevelEvent> | Draft<OfflineArenaEvent>): Promise<OfflineEvent> {
  return serial(async () => {
    const full = { ...event, id: event.id ?? uuid() } as OfflineEvent;
    const list = await read(userId);
    list.push(full);
    // Çok uzun çevrimdışı dönem: sınır aşılırsa EN ESKİ olay düşer; eskiden
    // yeni biten bölüm sessizce atılıyordu.
    await write(userId, list.slice(-MAX_QUEUE));
    return full;
  });
}

export async function pendingCount(userId: number): Promise<number> {
  if (counts.has(userId)) return counts.get(userId) ?? 0;
  const list = await read(userId);
  counts.set(userId, list.length);
  return list.length;
}

/** Bekleyen olay sayısı (çevrimdışı hapı için). */
export function usePendingCount(userId: number | null | undefined): number {
  const [n, setN] = useState(() => (userId != null ? counts.get(userId) ?? 0 : 0));
  useEffect(() => {
    if (userId == null) {
      setN(0);
      return undefined;
    }
    let alive = true;
    const update = () => alive && setN(counts.get(userId) ?? 0);
    listeners.add(update);
    void pendingCount(userId).then((c) => alive && setN(c));
    return () => {
      alive = false;
      listeners.delete(update);
    };
  }, [userId]);
  return n;
}

function bumpAttempts(list: Queued[], ids: Set<string>): OfflineEvent[] {
  return list
    .map((e) => (ids.has(e.id) ? { ...e, attempts: (e.attempts ?? 0) + 1 } : e))
    .filter((e) => (e.attempts ?? 0) < MAX_ATTEMPTS);
}

let inflight: Promise<SyncResponse | null> | null = null;

/**
 * Kuyruğu gönderir. Dönüş: sunucu yanıtı (birden çok parti varsa son
 * partinin profili, kazançlar toplanmış) ya da gönderilecek bir şey yoksa /
 * ağ yoksa null.
 */
export function flushOffline(userId: number): Promise<SyncResponse | null> {
  if (inflight) return inflight;
  inflight = (async () => {
    let total: SyncResponse | null = null;
    for (let round = 0; round < 6; round += 1) {
      const list = await read(userId);
      counts.set(userId, list.length);
      if (!list.length) break;
      const batch = [...list].sort((a, b) => a.finishedAt - b.finishedAt).slice(0, BATCH);
      let res: SyncResponse;
      try {
        // Deneme sayacı yerel alandır; sunucuya gönderilmez.
        res = await syncOffline(batch.map((e) => {
          const { attempts: _attempts, ...rest } = e as Queued;
          return rest as OfflineEvent;
        }));
        noteOnline();
      } catch (error) {
        noteRequestError(error);
        // Ağ hatası: kuyruk olduğu gibi kalır. Ağ dışı hata (sunucu partiyi
        // reddetti): partideki olayların deneme sayısı artar, sınırı aşan düşer.
        if (!isOfflineError(error)) {
          const ids = new Set(batch.map((e) => e.id));
          await serial(async () => {
            const cur = (await read(userId)) as Queued[];
            await write(userId, bumpAttempts(cur, ids));
          });
        }
        break;
      }
      const done = new Set((res.results ?? []).map((r) => r.id));
      // Partide olup yanıtta olmayan olaylar: bir deneme sayılır.
      const unanswered = new Set(batch.map((e) => e.id).filter((id) => !done.has(id)));
      await serial(async () => {
        const cur = (await read(userId)) as Queued[];
        await write(userId, bumpAttempts(cur.filter((e) => !done.has(e.id)), unanswered));
      });
      total = total
        ? { ...res, results: [...total.results, ...res.results], gained: { stars: total.gained.stars + (res.gained?.stars ?? 0), coins: total.gained.coins + (res.gained?.coins ?? 0) } }
        : { ...res, gained: res.gained ?? { stars: 0, coins: 0 } };
      if (!done.size) break;
    }
    emit();
    return total;
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}
