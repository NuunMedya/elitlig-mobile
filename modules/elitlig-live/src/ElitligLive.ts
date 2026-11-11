import { requireOptionalNativeModule } from "expo";
import { Platform } from "react-native";

import type {
  CameraCapabilities,
  DeviceStatus,
  ElitligLiveNativeModule,
  OverlayFrame,
  ReplayOptions,
  SaveClipOptions,
  SavedClip,
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

/** Yerel modül yoksa NOT_STREAMING koduyla reddedilen hata. */
function notAvailable(): Error & { code: string } {
  const e = new Error("ElitligLive yerel modülü bu derlemede yok.") as Error & { code: string };
  e.code = "NOT_STREAMING";
  return e;
}

/**
 * Yayına gidenin (kamera + gömülü skorbord + ses) son `seconds` saniyesini MP4 yapar.
 * Yeniden kodlama yok (Android); klip (şimdi − seconds) anındaki ya da ondan önceki
 * anahtar kareden başlar, bu yüzden en fazla ~2 sn daha uzun olabilir.
 * Hata kodları (error.code): "NOT_STREAMING" (yayın live/reconnecting değil),
 * "NO_BUFFER" (tamponda < 1 sn), "CLIP_WRITE_FAILED".
 */
export async function saveClip(options?: SaveClipOptions): Promise<SavedClip> {
  if (!NativeLive) throw notAvailable();
  const seconds = Number.isFinite(options?.seconds) ? Number(options?.seconds) : 10;
  const afterSeconds = Number.isFinite(options?.afterSeconds) ? Number(options?.afterSeconds) : 0;
  return NativeLive.saveClip({
    seconds: Math.min(13, Math.max(1, seconds)),
    afterSeconds: Math.min(10, Math.max(0, afterSeconds)),
  });
}

/**
 * Klibi yayına ve önizlemeye tam kare oynatır (kamera görüntüsünün yerine);
 * skorbord overlay'i üstte kalır, ses mikrofondan sürer. Bitince ya da
 * stopReplay ile kamera görüntüsüne dönülür. Önizleme sırasında da çalışır.
 */
export async function playReplay(uri: string, options?: ReplayOptions): Promise<void> {
  const rate = Number.isFinite(options?.rate) ? Number(options?.rate) : 1;
  return native().playReplay(uri, {
    label: options?.label ?? null,
    rate: Math.min(2, Math.max(0.25, rate)),
  });
}

export async function stopReplay(): Promise<void> {
  if (!NativeLive) return;
  return NativeLive.stopReplay();
}

/** cache/elitlig-clips dizinindeki tüm klipleri siler. */
export async function clearClips(): Promise<void> {
  if (!NativeLive) return;
  return NativeLive.clearClips();
}

/* ───────── yakınlaştırma / fener / cihaz durumu ─────────
 * Bu işlevler modüle sonradan eklendi. Mağazadaki eski derlemede yoktur; JS
 * güncellemesi o derlemeye de gittiği için hepsi "yoksa sessizce null" döner. */

/** Yerel modül yakınlaştırma / feneri destekliyor mu (yeni derleme). */
export function supportsCameraControls(): boolean {
  return typeof NativeLive?.setZoom === "function" && typeof NativeLive?.getCameraCapabilities === "function";
}

/** Etkin kameranın yakınlaştırma aralığı ve fener durumu; desteklenmiyorsa null. */
export async function getCameraCapabilities(): Promise<CameraCapabilities | null> {
  if (typeof NativeLive?.getCameraCapabilities !== "function") return null;
  try {
    const c = await NativeLive.getCameraCapabilities();
    const minZoom = Number(c?.minZoom) > 0 ? Number(c.minZoom) : 1;
    const maxZoom = Math.max(minZoom, Number(c?.maxZoom) || minZoom);
    return {
      minZoom,
      maxZoom,
      zoom: Math.min(maxZoom, Math.max(minZoom, Number(c?.zoom) || minZoom)),
      torch: Boolean(c?.torch),
      torchOn: Boolean(c?.torchOn),
    };
  } catch {
    return null;
  }
}

/** Yakınlaştırma düzeyi (1 = yok). Uygulanan düzeyi döndürür; desteklenmiyorsa null. */
export async function setZoom(level: number): Promise<number | null> {
  if (typeof NativeLive?.setZoom !== "function") return null;
  const applied = await NativeLive.setZoom(Number.isFinite(level) ? Math.max(0.5, level) : 1);
  return Number(applied) || null;
}

/** Fener. Son durumu döndürür; desteklenmiyorsa null. */
export async function setTorch(on: boolean): Promise<boolean | null> {
  if (typeof NativeLive?.setTorch !== "function") return null;
  return Boolean(await NativeLive.setTorch(!!on));
}

/** Pil ve ağ türü (stüdyo ön kontrolü); desteklenmiyorsa / okunamazsa null. */
export async function getDeviceStatus(): Promise<DeviceStatus | null> {
  if (typeof NativeLive?.getDeviceStatus !== "function") return null;
  try {
    const s = await NativeLive.getDeviceStatus();
    const level = Number(s?.batteryLevel);
    const network = String(s?.network ?? "unknown");
    return {
      batteryLevel: Number.isFinite(level) && level >= 0 ? Math.min(1, level) : -1,
      charging: Boolean(s?.charging),
      lowPower: Boolean(s?.lowPower),
      network: (["wifi", "cellular", "ethernet", "none"].includes(network) ? network : "unknown") as DeviceStatus["network"],
    };
  } catch {
    return null;
  }
}
