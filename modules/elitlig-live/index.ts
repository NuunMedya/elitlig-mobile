// ElitLig canlı yayın modülü — telefon kamerasından RTMP/RTMPS (YouTube) yayını,
// skorbord PNG'si videonun içine gömülür. Ayrıntılar: ./README.md
export type {
  LiveState,
  LiveStats,
  LiveCameraViewProps,
  StartStreamOptions,
  OverlayFrame,
  SaveClipOptions,
  SavedClip,
  ReplayOptions,
  CameraCapabilities,
  DeviceStatus,
  NetworkKind,
} from "./src/ElitligLive.types";

export {
  isLiveAvailable,
  requestLivePermissions,
  startStream,
  stopStream,
  switchCamera,
  setMuted,
  setOverlay,
  saveClip,
  playReplay,
  stopReplay,
  clearClips,
  supportsCameraControls,
  getCameraCapabilities,
  setZoom,
  setTorch,
  getDeviceStatus,
} from "./src/ElitligLive";

export { LiveCameraView } from "./src/LiveCameraView";
