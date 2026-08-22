/**
 * OYUN GİRDİSİ — Pointer olayları, RN çekirdeğindeki `PanResponder` ile.
 *
 * NEDEN GESTURE HANDLER DEĞİL: `react-native-gesture-handler` kurulu değil ve
 * bu üç oyunun ihtiyacı (dokunma noktası, sürükle-fırlat, sürekli konum
 * okuma) `PanResponder` ile eksiksiz karşılanıyor. Yeni bir bağımlılık,
 * kazanılmayan bir yetenek için ödenen bir bedel olurdu.
 *
 * NEDEN `Touchable` DEĞİL: tasarım sisteminin `Touchable`'ı ölçek animasyonu
 * ve haptik gecikmesi taşır; oyun içinde dokunuş → tepki gecikmesi OYUNUN
 * KENDİSİDİR. Bu, kılavuzdaki "oyun içi dokunma alanı" istisnasıdır; oyunların
 * kartlarındaki ve düğmelerindeki her basılabilir öğe yine `Touchable`.
 */

import { useMemo, useRef } from "react";
import { PanResponder, type GestureResponderEvent, type PanResponderInstance } from "react-native";
import { curvatureOf, type Point } from "./math";

export type { Point };

/* ───────────────────────────── sürükle-fırlat ──────────────────────────── */

export interface DragResult {
  start: Point;
  end: Point;
  /** Sürükleme vektörü. */
  dx: number;
  dy: number;
  /** Vektör uzunluğu (piksel). */
  length: number;
  /**
   * Parmağın izlediği yolun EĞRİLİĞİ: başlangıç–bitiş doğrusuna göre yolun
   * en uzak noktasının işaretli sapması, doğru uzunluğuna bölünmüş.
   *
   * Pozitif = sağa kavis, negatif = sola kavis. Penaltıda falso budur ve
   * oyunun derinliğini o taşır: köşeyi güçle değil kavisle bulmak gerekir.
   */
  curve: number;
}

export interface DragOptions {
  onStart?: (point: Point) => void;
  /** Sürükleme sürerken — canlı geri bildirim (güç yayı) için. */
  onMove?: (result: DragResult) => void;
  onEnd?: (result: DragResult) => void;
  /** false iken jest hiç başlamaz (atış animasyonu sürüyor). */
  enabled?: boolean;
}

/**
 * Toptan başlayan sürükle-fırlat jesti.
 *
 * Yol boyunca en fazla 32 nokta saklanır: eğrilik için fazlası gerekmiyor ve
 * uzun bir sürüklemede dizinin sınırsız büyümesi her karede çöp üretirdi.
 */
export function useDragGesture({ onStart, onMove, onEnd, enabled = true }: DragOptions): {
  panHandlers: PanResponderInstance["panHandlers"];
} {
  const path = useRef<Point[]>([]);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const handlers = useRef({ onStart, onMove, onEnd });
  handlers.current = { onStart, onMove, onEnd };

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => enabledRef.current,
        onMoveShouldSetPanResponder: () => enabledRef.current,

        onPanResponderGrant: (event: GestureResponderEvent) => {
          const point = pointOf(event);
          path.current = [point];
          handlers.current.onStart?.(point);
        },

        onPanResponderMove: (event: GestureResponderEvent) => {
          const point = pointOf(event);
          if (path.current.length < 32) path.current.push(point);
          else path.current[path.current.length - 1] = point;
          handlers.current.onMove?.(resultOf(path.current));
        },

        onPanResponderRelease: () => {
          if (path.current.length) handlers.current.onEnd?.(resultOf(path.current));
          path.current = [];
        },
        onPanResponderTerminate: () => {
          path.current = [];
        },
      }),
    [],
  );

  return { panHandlers: responder.panHandlers };
}

const pointOf = (event: GestureResponderEvent): Point => ({
  x: event.nativeEvent.locationX,
  y: event.nativeEvent.locationY,
});

function resultOf(path: Point[]): DragResult {
  const start = path[0];
  const end = path[path.length - 1];
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  return { start, end, dx, dy, length: Math.hypot(dx, dy), curve: curvatureOf(path) };
}

/* ─────────────────────── sürekli konum okuma (slalom) ─────────────────── */

export interface HoldOptions {
  /** Parmak basılıyken her harekette ve basma anında çağrılır. */
  onHold: (x: number) => void;
  /** Parmak kalkınca. */
  onRelease: () => void;
  enabled?: boolean;
}

/**
 * Parmak ekranda kaldığı sürece yatay konumu okur.
 *
 * NEDEN TAP DEĞİL: slalomun kontrol modeli "basılan noktanın yatay konumu yön
 * hızını belirler" — yani basılı tutarken parmağı kaydırmak da yönü
 * değiştirmeli. Sadece `onPressIn` dinlemek, parmağını kaydıran oyuncuyu
 * görmezden gelir ve kontrol ölü hissettirir.
 */
export function useHoldGesture({ onHold, onRelease, enabled = true }: HoldOptions): {
  panHandlers: PanResponderInstance["panHandlers"];
} {
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const handlers = useRef({ onHold, onRelease });
  handlers.current = { onHold, onRelease };

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => enabledRef.current,
        onMoveShouldSetPanResponder: () => enabledRef.current,
        onPanResponderGrant: (event) => handlers.current.onHold(event.nativeEvent.locationX),
        onPanResponderMove: (event) => handlers.current.onHold(event.nativeEvent.locationX),
        onPanResponderRelease: () => handlers.current.onRelease(),
        onPanResponderTerminate: () => handlers.current.onRelease(),
      }),
    [],
  );

  return { panHandlers: responder.panHandlers };
}
