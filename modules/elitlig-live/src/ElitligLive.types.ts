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
  /** Yerel kayıt (yayının tamamı → telefon hafızası) olayları. Eski derlemede hiç gelmez. */
  onRecordingStateChange?: (e: { nativeEvent: LocalRecordingEvent }) => void;
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

/** Telefonun depolama durumu (yerel kayıt istemi ve ön kontrol için). */
export interface StorageInfo {
  /** Kaydın yazılacağı birimde kullanılabilir alan. */
  freeBytes: number;
  /** Telefonun toplam depolaması; bilinmiyorsa 0. */
  totalBytes: number;
  /** Bu değerin altında yerel kayıt başlamaz / sürerken düzgünce kapatılır (300 MB). */
  minFreeBytes: number;
  /** Kullanıcıya gösterilecek kayıt yeri (ör. "Movies/ElitLig"). */
  location: string;
  /** Kayıt Galeri'de görünür mü (Android 10+ MediaStore). */
  gallery: boolean;
}

export interface LocalRecordingOptions {
  /** Uzantısız, ASCII dosya adı; yerel taraf yine de temizler. */
  fileName: string;
}

export interface LocalRecordingStart {
  path: string;
  uri?: string;
}

export interface LocalRecordingResult {
  /** Son parçanın yolu (kayıt bölündüyse diğer parçalar aynı klasörde `_p2`, `_p3`…). */
  path: string;
  uri?: string;
  /** Bütün parçaların toplam boyutu. */
  bytes: number;
  durationMs: number;
  parts: number;
}

export interface LocalRecordingStatus {
  recording: boolean;
  /** Uygulama arka planda: parça kapatıldı, ön plana dönünce yeni parça açılır. */
  paused: boolean;
  bytes: number;
  durationMs: number;
  parts: number;
  path: string;
  freeBytes: number;
}

/**
 * - `started`: bir parça yazılmaya başladı.
 * - `saved`: bir parça güvenle kapatıldı. `final` false ise kayıt sürüyor
 *   (reason: "background" | "split"); true ise kayıt bitti
 *   (reason: "stopped" | "stream_end" | "stream_failed" | "disk_full" | "error" | "released").
 * - `error`: yazılamadı / kapatılamadı (reason: "disk_full" | "error" | "finalize_failed").
 */
export interface LocalRecordingEvent {
  state: "started" | "saved" | "error";
  reason?: string;
  message?: string;
  final?: boolean;
  path?: string;
  uri?: string;
  part?: number;
  parts?: number;
  bytes?: number;
  durationMs?: number;
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
  /* Yerel kayıt (yayının tamamı telefon hafızasına) — aynı kural: eski derlemede yok. */
  getStorageInfo?(): Promise<StorageInfo>;
  startLocalRecording?(options: LocalRecordingOptions): Promise<LocalRecordingStart>;
  stopLocalRecording?(): Promise<LocalRecordingResult | null>;
  getLocalRecordingStatus?(): Promise<LocalRecordingStatus | null>;
}
