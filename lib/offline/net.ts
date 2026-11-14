/**
 * ÇEVRİMDIŞI DURUMU (sözleşme §7) — yerel modül YOK (NetInfo kurulmadı):
 * bağlantı, isteklerin sonucundan anlaşılır. HTTP yanıtı gelmeyen hata
 * (ağ yok / zaman aşımı → ApiError.status 0) "çevrimdışı" işaretler; ilk
 * başarılı yanıt işareti kaldırır. 4xx/5xx çevrimdışı DEĞİLDİR (ör. 409
 * NO_LIVES gerçek bir rettir).
 */

import { useSyncExternalStore } from "react";

import { ApiError } from "../http";

/** Ağ hatası ya da zaman aşımı: sunucudan HTTP yanıtı hiç gelmedi. */
export function isOfflineError(error: unknown): boolean {
  if (error instanceof ApiError) return error.status === 0;
  // fetch'in kendi TypeError'ı (http katmanı dışından gelen çağrılar)
  return error instanceof TypeError && /network|fetch/i.test(String(error.message));
}

let offline = false;
const listeners = new Set<() => void>();

function emit() {
  for (const fn of listeners) fn();
}

/** Bir isteğin sonucu bildirilir: hata çevrimdışıysa işaret konur. */
export function noteRequestError(error: unknown) {
  if (isOfflineError(error) && !offline) {
    offline = true;
    emit();
  }
}

/** Başarılı yanıt: bağlantı var. */
export function noteOnline() {
  if (offline) {
    offline = false;
    emit();
  }
}

export const isOfflineNow = () => offline;

export function subscribeOffline(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Bileşenlerde: son bilinen bağlantı durumu (true = çevrimdışı). */
export function useOffline(): boolean {
  return useSyncExternalStore(subscribeOffline, isOfflineNow, isOfflineNow);
}

/** Cihazda üretilen olay kimliği (uuid v4 biçimi; kriptografik olması gerekmez). */
export function uuid(): string {
  const hex = "0123456789abcdef";
  let out = "";
  for (let i = 0; i < 36; i += 1) {
    if (i === 8 || i === 13 || i === 18 || i === 23) out += "-";
    else if (i === 14) out += "4";
    else if (i === 19) out += hex[(Math.random() * 4) | 8];
    else out += hex[(Math.random() * 16) | 0];
  }
  return out;
}

/** Monotonik ölçüm (performance.now varsa) — cihaz saati geri alınsa da süre bozulmaz. */
export const monoNow = (): number => {
  const perf = (globalThis as { performance?: { now?: () => number } }).performance;
  return typeof perf?.now === "function" ? perf.now() : Date.now();
};
