import type { ViewProps } from "react-native";

export type LiveState =
  | "idle"
  | "previewing"
  | "connecting"
  | "live"
  | "reconnecting"
  | "failed"
  | "stopped";

export interface LiveStats {
  bitrateKbps: number;
  fps: number;
  droppedFrames?: number;
}

export interface LiveCameraViewProps extends ViewProps {
  /** Varsayılan "back". */
  facing?: "back" | "front";
  onStateChange?: (e: { nativeEvent: { state: LiveState; message?: string } }) => void;
  /** Yayındayken ~1 sn'de bir. */
  onStats?: (e: { nativeEvent: LiveStats }) => void;
  /** Tekrar (replay) yayına girdiğinde / bittiğinde. */
  onReplayStateChange?: (e: { nativeEvent: { playing: boolean; uri?: string } }) => void;
}

export interface StartStreamOptions {
  width?: number;
  height?: number;
  fps?: number;
  videoBitrateKbps?: number;
  audioBitrateKbps?: number;
}

export interface OverlayFrame {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SaveClipOptions {
  /** Klibin uzunluğu (sn). Varsayılan 10, en fazla 13. */
  seconds?: number;
  /** Dokunuştan sonra kayda devam edilecek süre (sn). Varsayılan 0. */
  afterSeconds?: number;
}

export interface SavedClip {
  /** file:// — uygulamanın cache dizininde (cache/elitlig-clips/clip-<ts>.mp4) */
  uri: string;
  durationMs: number;
  width: number;
  height: number;
  sizeBytes: number;
}

export interface ReplayOptions {
  /** Tekrar sırasında sağ üstte gösterilecek etiket (ör. "TEKRAR"). null/boş → etiket yok. */
  label?: string | null;
  /** Oynatma hızı (ör. 0.5 ağır çekim). Yalnız Android; iOS'ta yok sayılır. Varsayılan 1. */
  rate?: number;
}

export interface CameraCapabilities {
  minZoom: number;
  maxZoom: number;
  zoom: number;
  /** Etkin kamerada fener var mı (ön kamerada genellikle yok). */
  torch: boolean;
  torchOn: boolean;
}

export type NetworkKind = "wifi" | "cellular" | "ethernet" | "none" | "unknown";

export interface DeviceStatus {
  /** 0..1; bilinmiyorsa -1. */
  batteryLevel: number;
  charging: boolean;
  /** Pil tasarrufu / düşük güç kipi açık mı (kodlayıcıyı kısabilir). */
  lowPower: boolean;
  network: NetworkKind;
}

/** Yerel modülün JS'e açtığı yüzey (Android: ElitligLiveModule.kt, iOS: ElitligLiveModule.swift). */
export interface ElitligLiveNativeModule {
  requestPermissions(): Promise<boolean>;
  startStream(url: string, options: StartStreamOptions): Promise<void>;
  stopStream(): Promise<void>;
  switchCamera(): Promise<void>;
  setMuted(muted: boolean): Promise<void>;
  setOverlay(uri: string | null, frame: OverlayFrame | null): Promise<void>;
  saveClip(options: Required<SaveClipOptions>): Promise<SavedClip>;
  playReplay(uri: string, options: { label: string | null; rate: number }): Promise<void>;
  stopReplay(): Promise<void>;
  clearClips(): Promise<void>;
  /*
   * Sonradan eklenenler — mağazadaki eski derlemede YOKTUR (JS güncellemesi
   * eski yerel modülle de çalışmalı). Her zaman varlığı denetlenerek çağrılır.
   */
  getCameraCapabilities?(): Promise<CameraCapabilities>;
  setZoom?(level: number): Promise<number>;
  setTorch?(on: boolean): Promise<boolean>;
  getDeviceStatus?(): Promise<DeviceStatus>;
}
