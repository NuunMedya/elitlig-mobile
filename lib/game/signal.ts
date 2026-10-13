/**
 * KARE SİNYALİ — oyun döngüsünün yalnız TUVALİ yeniden çizdirmesi için.
 *
 * NEDEN: eski oyun ekranları her karede ekranın KÖK bileşeninde `setFrame`
 * çağırıyordu. Saniyede 60 kez başlık, HUD, kartlar ve bütün tuval yeniden
 * uzlaştırılıyordu; üstüne `memo` bileşenlerine yerinde değişen nesneler
 * verildiği için bazı katmanlar HİÇ güncellenmiyordu (top donuyor, koniler
 * zıplıyordu).
 *
 * Şimdi döngü `emit()` çağırır ve yalnız sinyale abone olan bileşen (tuvalin
 * hareketli katmanı) yeniden çizilir. Ekranın geri kalanı ancak gerçekten bir
 * şey değiştiğinde (skor, faz) render alır.
 */

import { useEffect, useReducer, useRef } from "react";

export interface FrameSignal {
  emit: () => void;
  subscribe: (listener: () => void) => () => void;
}

export function createFrameSignal(): FrameSignal {
  const listeners = new Set<() => void>();
  return {
    emit: () => listeners.forEach((listener) => listener()),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** Bileşen ömrü boyunca sabit bir sinyal. */
export function useFrameSignal(): FrameSignal {
  const ref = useRef<FrameSignal | null>(null);
  if (!ref.current) ref.current = createFrameSignal();
  return ref.current;
}

/** Sinyal her yandığında çağıran bileşeni yeniden çizer. */
export function useOnFrame(signal: FrameSignal): void {
  const [, force] = useReducer((n: number) => (n + 1) % 1_000_000, 0);
  useEffect(() => signal.subscribe(force), [signal]);
}

/**
 * Sinyal her yandığında `read()` değerini okur ama YALNIZ değer değiştiğinde
 * yeniden çizer — HUD sayaçları için (mesafe saniyede 60 kez değil, metre
 * değiştikçe güncellenir).
 */
export function useSignalValue<V>(signal: FrameSignal, read: () => V): V {
  const readRef = useRef(read);
  readRef.current = read;
  const [value, setValue] = useReducer((_: V, next: V) => next, undefined as unknown as V, () =>
    read(),
  );
  const last = useRef(value);
  useEffect(
    () =>
      signal.subscribe(() => {
        const next = readRef.current();
        if (next !== last.current) {
          last.current = next;
          setValue(next);
        }
      }),
    [signal],
  );
  return value;
}
