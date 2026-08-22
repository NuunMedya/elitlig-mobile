/**
 * Sabit zaman adımlı oyun döngüsü.
 *
 * NEDEN: üç oyunun da eski hâli `setInterval(16ms)` kullanıyor ve her tikte
 * sabit bir `dt` varsayıyordu. Bu, fiziği KARE HIZINA BAĞLI yapar:
 *   · Zamanlayıcı 16ms'de bir tam olarak tetiklenmez; JS thread meşgulse
 *     tikler birikir ve top bir karede iki kat yol gider.
 *   · 120Hz bir ekranda ya da yavaş bir cihazda oyun tamamen başka bir oyuna
 *     dönüşür; "aynı vuruş" aynı sonucu vermez.
 *   · Uygulama arka plana alınınca zamanlayıcı durmaz, geri gelindiğinde
 *     birikmiş tikler tek seferde işlenir ve oyun kendi kendini bitirir.
 *
 * ÇÖZÜM — accumulator kalıbı: gerçek zaman biriktirilir ve fizik DAİMA
 * `FIXED_DT` (1/120 sn) adımlarıyla ilerletilir. Kare süresi ne olursa olsun
 * simülasyon aynı sonucu verir. Render, son iki durum arasında `alpha` payıyla
 * ara değer alarak çizilir; böylece 60Hz'de de 120Hz'de de akıcı görünür.
 *
 * ÖLÜM SARMALI KORUMASI: bir kare 250ms'den uzun sürerse (uygulama duraklamış,
 * çöp toplama olmuş) fazlası ATILIR. Atılmazsa döngü, geride kaldığı süreyi
 * kapatmak için daha çok adım atar, bu da daha uzun sürer, ve oyun kilitlenir.
 *
 * ARKA PLAN: `AppState` "active" değilken döngü tamamen durur ve geri
 * dönüldüğünde biriken zaman sıfırlanır — sekme arka plandayken oyun oynanmaz.
 */

import { useCallback, useEffect, useRef } from "react";
import { AppState } from "react-native";

/** Fizik adımı — 120Hz. Bütün oyunlar bu adımda simüle edilir. */
export const FIXED_DT = 1 / 120;

/** Bir karede işlenecek en uzun gerçek süre; fazlası atılır (ölüm sarmalı). */
const MAX_FRAME_MS = 250;

/** Kare süresi bu eşiği aşarsa parçacık bütçesi düşürülür. */
const SLOW_FRAME_MS = 16;

export interface GameLoopOptions {
  /** Fiziği bir sabit adım ilerletir. `dt` DAİMA FIXED_DT'dir. */
  step: (dt: number) => void;
  /**
   * Ekranı çizer. `alpha` son iki fizik durumu arasındaki pay (0–1);
   * konumları `prev + (curr - prev) * alpha` ile ara değerleyin.
   */
  render: (alpha: number) => void;
  /** false ise döngü çalışmaz (menü, bitiş kartı). */
  running: boolean;
}

export interface GameLoopApi {
  /**
   * Parçacık bütçesi (0–1). Kare süresi 16ms'yi aşarsa kendiliğinden düşer,
   * kareler toparlayınca yavaşça geri yükselir. Oyunlar iz/parçacık sayısını
   * bununla çarpar; 60fps hiçbir zaman süse feda edilmez.
   */
  budget: () => number;
}

/**
 * Döngüyü kurar. Dönen `budget()` render içinde okunabilir.
 *
 * `step` ve `render` her karede REF ÜZERİNDEN okunur; bu yüzden kapanışlarında
 * güncel state'i kullanabilirler ve döngü yeniden kurulmaz.
 */
export function useGameLoop({ step, render, running }: GameLoopOptions): GameLoopApi {
  const stepRef = useRef(step);
  const renderRef = useRef(render);
  stepRef.current = step;
  renderRef.current = render;

  const budgetRef = useRef(1);
  const frameRef = useRef<number | null>(null);
  const activeRef = useRef(true);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      activeRef.current = state === "active";
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!running) return;

    let last = 0;
    let accumulator = 0;
    let cancelled = false;

    const frame = (now: number) => {
      if (cancelled) return;
      frameRef.current = requestAnimationFrame(frame);

      // İlk kare ve arka plandan dönüş: biriken zamanı yut, sıçrama olmasın.
      if (last === 0 || !activeRef.current) {
        last = now;
        accumulator = 0;
        if (!activeRef.current) return;
      }

      const elapsed = Math.min(now - last, MAX_FRAME_MS);
      last = now;

      // Kare bütçesi: yavaş karede hızla düş, hızlı karede yavaşça toparla.
      // Asimetri kasıtlı — takılmaya anında tepki verilir, geri dönüş
      // kademelidir ki oyun sürekli bütçe değiştirip titremesin.
      budgetRef.current =
        elapsed > SLOW_FRAME_MS
          ? Math.max(0.35, budgetRef.current - 0.08)
          : Math.min(1, budgetRef.current + 0.01);

      accumulator += elapsed / 1000;

      while (accumulator >= FIXED_DT) {
        stepRef.current(FIXED_DT);
        accumulator -= FIXED_DT;
      }

      renderRef.current(accumulator / FIXED_DT);
    };

    frameRef.current = requestAnimationFrame(frame);
    return () => {
      cancelled = true;
      if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    };
  }, [running]);

  return { budget: useCallback(() => budgetRef.current, []) };
}

/* ─────────────────────────── küçük matematik ─────────────────────────── */

/**
 * Saf matematik `lib/game/math.ts` dosyasındadır ve buradan yeniden dışa
 * aktarılır — çağıranlar tek yerden içe aktarmaya devam eder. Ayrı durmasının
 * sebebi bu dosyanın React'a bağlı olması; matematik başsız doğrulanabilmeli.
 */
export { approach, clamp, curvatureOf, gauss, lerp, type Point } from "./math";
