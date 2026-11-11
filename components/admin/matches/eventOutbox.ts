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
 * maç kimliğine göre bellekte tutulur ve ekran geri geldiğinde aynen görünür.
 */

import { useSyncExternalStore } from "react";

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

function write(matchId: number, next: PendingEvent[]) {
  if (next.length) store.set(matchId, next);
  else store.delete(matchId);
  emit();
}

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
