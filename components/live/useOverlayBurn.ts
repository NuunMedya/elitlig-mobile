/**
 * YAYINA GÖMME DÖNGÜSÜ — ekrandaki grafik katmanını PNG'ye çekip yerel modüle
 * verir (react-native-view-shot → setOverlay). Modül görseli videonun her
 * karesine kendisi basar; yani ekranda görünen, YouTube'da görünendir.
 *
 * TEK KATMAN, DAR KUTU: skorbord, altyazı, GOL bandı, sponsor ve TEKRAR rozeti
 * aynı katmandadır. Her seferinde tüm kareyi (1280×720) çekmek pahalı olurdu;
 * bunun yerine görünen öğelerin BİRLEŞİK kutusu (`box`) çekilir. Çoğu zaman bu
 * yalnız skorborddur (küçük görsel, saniyede bir); altyazı çıkınca kutu büyür.
 *
 * NEDEN "KİRLİ BAYRAK": çekim zaman alır (çek → yaz → çöz → GL). O sırada skor
 * değişirse eski sürümde değişiklik düşüyordu ve saat durmuşken (devre arası,
 * maç öncesi) bir daha hiç gönderilmiyordu. Burada her çekim bitince "istenen
 * imza = gömülen imza mı" diye bakılır; değilse hemen yeniden çekilir.
 *
 * KISA GECİKME: imza değişince çekim ~90 ms ertelenir. Yerel görünümün yeni
 * çizimi ekrana oturmuş olur (bir önceki kare çekilmez) ve art arda gelen
 * değişiklikler tek çekimde birleşir.
 */

import { useCallback, useEffect, useRef } from "react";
import type { View } from "react-native";
import { captureRef, releaseCapture } from "react-native-view-shot";

import { setOverlay } from "@/modules/elitlig-live";

export interface BurnBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface OverlayBurnInput {
  /** Yayın (ya da bağlantı) sürüyor ve yerel modül var. */
  active: boolean;
  /** Çekilecek görünüm: `box` konumunda, taşmayı kırpan kap. */
  targetRef: React.RefObject<View | null>;
  /** Görünen öğelerin birleşik kutusu (sahne koordinatı); null → gömülecek şey yok. */
  box: BurnBox | null;
  stageW: number;
  stageH: number;
  /** Yayın karesi (kodlayıcı çözünürlüğü). */
  frameW: number;
  frameH: number;
  /** İçerik imzası: değişince yeniden çekilir. */
  signature: string;
}

const SETTLE_MS = 90;
const RETRY_MS = 1000;

export function useOverlayBurn(input: OverlayBurnInput) {
  const latest = useRef(input);
  latest.current = input;

  const state = useRef({
    mounted: true,
    running: false,
    timer: null as ReturnType<typeof setTimeout> | null,
    /** Yayına gömülü imza; null → gömülü görsel yok. */
    burned: null as string | null,
    file: null as string | null,
  });

  const desiredOf = (v: OverlayBurnInput): string | null => {
    if (!v.active || !v.box || v.box.w < 1 || v.box.h < 1 || v.stageW < 1 || v.stageH < 1) return null;
    const b = v.box;
    return `${v.signature}#${Math.round(b.x)},${Math.round(b.y)},${Math.round(b.w)},${Math.round(b.h)}@${v.frameW}x${v.frameH}/${Math.round(v.stageW)}`;
  };

  const pump = useCallback((delay: number) => {
    const s = state.current;
    if (!s.mounted || s.running || s.timer) return;
    s.timer = setTimeout(() => {
      s.timer = null;
      if (!s.mounted || s.running) return;
      s.running = true;
      let failed = false;
      void (async () => {
        try {
          const want = latest.current;
          const desired = desiredOf(want);
          if (desired === null) {
            if (s.burned !== null || s.file) {
              await setOverlay(null).catch(() => undefined);
              if (s.file) releaseCapture(s.file);
              s.file = null;
              s.burned = null;
            }
            return;
          }
          if (desired === s.burned) return;
          const box = want.box as BurnBox;
          if (!want.targetRef.current) {
            failed = true;
            return;
          }
          const outW = Math.max(2, Math.round((box.w / want.stageW) * want.frameW));
          const outH = Math.max(2, Math.round((box.h / want.stageH) * want.frameH));
          const uri = await captureRef(want.targetRef, { format: "png", result: "tmpfile", width: outW, height: outH });
          await setOverlay(uri, {
            x: box.x / want.stageW,
            y: box.y / want.stageH,
            width: box.w / want.stageW,
            height: box.h / want.stageH,
          });
          if (s.file && s.file !== uri) releaseCapture(s.file);
          s.file = uri;
          s.burned = desired;
        } catch {
          // Tek çekim kaçtı (görünüm henüz hazır değil, disk dolu…): biraz sonra yeniden dene.
          failed = true;
        } finally {
          s.running = false;
          if (s.mounted && (failed || desiredOf(latest.current) !== s.burned)) pump(failed ? RETRY_MS : SETTLE_MS);
        }
      })();
    }, delay);
  }, []);

  const box = input.box;
  useEffect(() => {
    pump(SETTLE_MS);
  }, [pump, input.active, input.signature, box?.x, box?.y, box?.w, box?.h, input.stageW, input.stageH, input.frameW, input.frameH]);

  useEffect(() => {
    const s = state.current;
    s.mounted = true;
    return () => {
      s.mounted = false;
      if (s.timer) clearTimeout(s.timer);
      s.timer = null;
      void setOverlay(null).catch(() => undefined);
      if (s.file) releaseCapture(s.file);
      s.file = null;
      s.burned = null;
    };
  }, []);

  /** Yayın yeniden başlarken: gömülü imzayı unut, bir sonraki turda baştan gönder. */
  const reset = useCallback(() => {
    state.current.burned = null;
    pump(SETTLE_MS);
  }, [pump]);

  return { reset };
}

/** Görünen öğe kutularının birleşimi (kenar payıyla, sahneye kırpılmış, tam piksel). */
export function unionBox(rects: (BurnBox | null | undefined)[], stageW: number, stageH: number, pad = 2): BurnBox | null {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const r of rects) {
    if (!r || r.w <= 0 || r.h <= 0) continue;
    x0 = Math.min(x0, r.x);
    y0 = Math.min(y0, r.y);
    x1 = Math.max(x1, r.x + r.w);
    y1 = Math.max(y1, r.y + r.h);
  }
  if (!Number.isFinite(x0)) return null;
  const x = Math.max(0, Math.floor(x0 - pad));
  const y = Math.max(0, Math.floor(y0 - pad));
  const w = Math.min(stageW, Math.ceil(x1 + pad)) - x;
  const h = Math.min(stageH, Math.ceil(y1 + pad)) - y;
  return w > 0 && h > 0 ? { x, y, w, h } : null;
}
