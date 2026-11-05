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

/** Yerel modülün JS'e açtığı yüzey (Android: ElitligLiveModule.kt, iOS: ElitligLiveModule.swift). */
export interface ElitligLiveNativeModule {
  requestPermissions(): Promise<boolean>;
  startStream(url: string, options: StartStreamOptions): Promise<void>;
  stopStream(): Promise<void>;
  switchCamera(): Promise<void>;
  setMuted(muted: boolean): Promise<void>;
  setOverlay(uri: string | null, frame: OverlayFrame | null): Promise<void>;
}
