/**
 * SOHBET LİSTESİ — çevrimiçi durumu deposu.
 *
 * Çevrimiçi bilgisi 30 sn'de bir yoklanır (`usePresence`). Sonuç liste
 * bileşeninin durumunda tutulsaydı her yoklamada bütün liste yeniden çizilirdi;
 * bunun yerine küçük bir köprü bileşeni sonucu buraya yazar ve her satır YALNIZ
 * kendi kişisinin durumunu okur (`useSyncExternalStore`): biri çevrimiçi
 * olduğunda tek satır çizilir.
 */

import { memo, useEffect, useSyncExternalStore } from "react";

import { usePresence } from "@/hooks/useChat";
import type { ChatPresence } from "@/lib/api/chat";

let snapshot: Record<string, ChatPresence> = {};
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function publish(next: Record<string, ChatPresence>): void {
  if (next === snapshot) return;
  snapshot = next;
  listeners.forEach((listener) => listener());
}

/** Kişi şu an çevrimiçi mi (kimlik yoksa her zaman `false`). */
export function useOnline(userId: number | null | undefined): boolean {
  return useSyncExternalStore(subscribe, () => (userId ? Boolean(snapshot[String(userId)]?.online) : false));
}

/** Yoklama sonucunu depoya yazar; hiçbir şey çizmez. */
export const PresenceBridge = memo(function PresenceBridge({ userIds }: { userIds: number[] }) {
  const presence = usePresence(userIds);
  useEffect(() => publish(presence), [presence]);
  return null;
});
