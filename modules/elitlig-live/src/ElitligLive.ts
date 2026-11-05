import { requireOptionalNativeModule } from "expo";
import { Platform } from "react-native";

import type {
  ElitligLiveNativeModule,
  OverlayFrame,
  StartStreamOptions,
} from "./ElitligLive.types";

export const NATIVE_MODULE_NAME = "ElitligLive";

/**
 * Expo Go'da, web'de ya da modül derlenmemiş bir dev-client'ta null döner.
 * requireOptionalNativeModule hiçbir zaman throw etmez.
 */
export const NativeLive: ElitligLiveNativeModule | null =
  Platform.OS === "android" || Platform.OS === "ios"
    ? requireOptionalNativeModule<ElitligLiveNativeModule>(NATIVE_MODULE_NAME)
    : null;

export function isLiveAvailable(): boolean {
  return NativeLive != null;
}

function native(): ElitligLiveNativeModule {
  if (!NativeLive) {
    throw new Error(
      "ElitligLive yerel modülü bu derlemede yok (Expo Go / web). Canlı yayın için development build ya da EAS build gerekir.",
    );
  }
  return NativeLive;
}

/** Kamera + mikrofon izni ister. İkisi de verilirse true. */
export async function requestLivePermissions(): Promise<boolean> {
  if (!NativeLive) return false;
  return NativeLive.requestPermissions();
}

/**
 * Yayını başlatır. Promise, bağlantı denemesi başladığında çözülür; bağlantının
 * kurulduğu "live" durumu LiveCameraView.onStateChange ile gelir.
 * Varsayılan: 1280x720, 30 fps, 2500 kbps H.264, 128 kbps AAC, 2 sn keyframe.
 */
export async function startStream(url: string, options?: StartStreamOptions): Promise<void> {
  const trimmed = (url ?? "").trim();
  if (!/^rtmps?:\/\//i.test(trimmed)) {
    throw new Error("Yayın adresi rtmp:// ya da rtmps:// ile başlamalı.");
  }
  const o = options ?? {};
  const clean: StartStreamOptions = {
    width: o.width ?? 1280,
    height: o.height ?? 720,
    fps: o.fps ?? 30,
    videoBitrateKbps: o.videoBitrateKbps ?? 2500,
    audioBitrateKbps: o.audioBitrateKbps ?? 128,
  };
  return native().startStream(trimmed, clean);
}

export async function stopStream(): Promise<void> {
  if (!NativeLive) return;
  return NativeLive.stopStream();
}

export async function switchCamera(): Promise<void> {
  return native().switchCamera();
}

export async function setMuted(muted: boolean): Promise<void> {
  return native().setMuted(!!muted);
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

/**
 * Yayına gömülen PNG (file:// uri). frame: video karesine göre 0..1 normalize
 * konum/boyut (sol-üst köşe orijin). null → kaldır.
 * frame verilmezse görsel tüm kareyi kaplar (0,0,1,1).
 */
export async function setOverlay(uri: string | null, frame?: OverlayFrame): Promise<void> {
  if (!NativeLive) return;
  if (uri == null) return NativeLive.setOverlay(null, null);
  const f = frame ?? { x: 0, y: 0, width: 1, height: 1 };
  const clean: OverlayFrame = {
    x: clamp01(f.x),
    y: clamp01(f.y),
    width: clamp01(f.width),
    height: clamp01(f.height),
  };
  return NativeLive.setOverlay(uri, clean);
}
