/**
 * OLAY GİDEN KUTUSU — saha kenarında girilen olayların iyimser kuyruğu.
 *
 * NEDEN: maç günü bağlantı zayıftır. Olay kaydedilirken alt sayfanın
 * beklemesi yöneticiyi oyundan koparır; istek zaman aşımına uğrarsa da olay
 * sessizce kaybolur ya da iki kez yazılır. Burada her olay girildiği anda
 * listeye eklenir ("gönderiliyor"), arka planda sunucuya yazılır; hata olursa
 * satır "gönderilemedi" olarak kalır ve aynı `client_event_id` ile yeniden
 * denenir — sunucu aynı kimliği ikinci kez YAZMAZ (matchEventService), bu
 * yüzden tekrar denemek her zaman güvenlidir.
 *
 * NEDEN MODÜL DÜZEYİNDE: kuyruk bileşenin durumunda tutulsaydı, yönetici
 * adım değiştirdiğinde (Kadro → Canlı) bekleyen olaylar kaybolurdu. Kuyruk
 * maç kimliğine göre bellekte tutulur, ayrıca cihaza yazılır (bkz. KALICILIK);
 * ekran geri geldiğinde ve uygulama yeniden açıldığında aynen görünür.
 */

import { useSyncExternalStore } from "react";

import AsyncStorage from "@react-native-async-storage/async-storage";

import type { EventBody } from "@/lib/api/admin/matches";

export interface PendingEvent {
  /** Sunucuya `client_event_id` olarak giden benzersiz kimlik. */
  clientId: string;
  body: EventBody;
  state: "sending" | "failed";
  /** Hata cümlesi (yalnız "failed"). */
  error?: string;
  /** Bağlantı / sunucu hatası: kendiliğinden yeniden denenebilir. */
  retryable?: boolean;
  attempts: number;
  createdAt: number;
}

const EMPTY: PendingEvent[] = [];
const store = new Map<number, PendingEvent[]>();
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((listener) => listener());

/*
 * KALICILIK — kuyruk cihazda (AsyncStorage) da saklanır.
 *
 * Kuyruk yalnız bellekteyken, gönderilemeyen olaylar uygulama arka planda
 * sistem tarafından kapatıldığında ya da çöktüğünde sessizce yok oluyordu;
 * saha kenarında bağlantı koptuğunda girilen goller geri gelmiyordu. Artık
 * her değişiklik diske yazılır ve uygulama açılışında geri yüklenir.
 *
 * Geri yüklenen "gönderiliyor" satırları "gönderilemedi" (yeniden denenebilir)
 * sayılır: uygulama gönderim sırasında kapanmışsa sonucu bilinmez. Aynı
 * `client_event_id` ile yeniden göndermek güvenlidir; sunucu olayı ikinci kez
 * yazmaz.
 */
const STORAGE_KEY = "admin:event-outbox:v1";

const isPendingEvent = (value: unknown): value is PendingEvent => {
  const item = value as PendingEvent | null;
  return Boolean(item && typeof item.clientId === "string" && item.clientId && item.body && typeof item.body === "object");
};

/** Diskteki ham veriyi kuyruğa çevirir (bozuk kayıtlar atılır). Test edilebilir saf işlev. */
export function parseStoredOutbox(raw: string | null): Map<number, PendingEvent[]> {
  const restored = new Map<number, PendingEvent[]>();
  if (!raw) return restored;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return restored;
  }
  if (!parsed || typeof parsed !== "object") return restored;
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    const matchId = Number(key);
    if (!Number.isInteger(matchId) || matchId <= 0 || !Array.isArray(value)) continue;
    const items = value.filter(isPendingEvent).map(
      (item): PendingEvent => ({
        clientId: item.clientId,
        body: item.body,
        state: "failed",
        error: item.state === "failed" ? item.error : "Uygulama kapanmadan önce gönderilemedi.",
        retryable: item.state === "failed" ? item.retryable !== false : true,
        attempts: Number(item.attempts) || 0,
        createdAt: Number(item.createdAt) || Date.now(),
      })
    );
    if (items.length) restored.set(matchId, items);
  }
  return restored;
}

function persist() {
  const snapshot: Record<string, PendingEvent[]> = {};
  store.forEach((items, matchId) => {
    snapshot[String(matchId)] = items;
  });
  const task = Object.keys(snapshot).length
    ? AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot))
    : AsyncStorage.removeItem(STORAGE_KEY);
  void task.catch(() => undefined);
}

function write(matchId: number, next: PendingEvent[]) {
  if (next.length) store.set(matchId, next);
  else store.delete(matchId);
  persist();
  emit();
}

let hydration: Promise<void> | null = null;

/** Diskteki kuyruğu belleğe yükler (bir kez). Bellekte zaten olan olaylar korunur. */
export function hydrateOutbox(): Promise<void> {
  if (!hydration) {
    hydration = AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        const restored = parseStoredOutbox(raw);
        if (!restored.size) return;
        restored.forEach((items, matchId) => {
          const current = store.get(matchId) ?? [];
          const known = new Set(current.map((item) => item.clientId));
          store.set(matchId, [...items.filter((item) => !known.has(item.clientId)), ...current]);
        });
        emit();
      })
      .catch(() => undefined);
  }
  return hydration;
}

void hydrateOutbox();

export const outbox = {
  get: (matchId: number): PendingEvent[] => store.get(matchId) ?? EMPTY,
  add(matchId: number, item: PendingEvent) {
    write(matchId, [...outbox.get(matchId), item]);
  },
  patch(matchId: number, clientId: string, changes: Partial<PendingEvent>) {
    write(
      matchId,
      outbox.get(matchId).map((item) => (item.clientId === clientId ? { ...item, ...changes } : item))
    );
  },
  remove(matchId: number, clientId: string) {
    write(
      matchId,
      outbox.get(matchId).filter((item) => item.clientId !== clientId)
    );
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

/** Maçın bekleyen olayları (gönderiliyor + gönderilemedi). */
export function useEventOutbox(matchId: number): PendingEvent[] {
  return useSyncExternalStore(
    outbox.subscribe,
    () => outbox.get(matchId),
    () => outbox.get(matchId)
  );
}
