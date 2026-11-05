// ElitLig canlı yayın modülü — telefon kamerasından RTMP/RTMPS (YouTube) yayını,
// skorbord PNG'si videonun içine gömülür. Ayrıntılar: ./README.md
export type {
  LiveState,
  LiveStats,
  LiveCameraViewProps,
  StartStreamOptions,
  OverlayFrame,
} from "./src/ElitligLive.types";

export {
  isLiveAvailable,
  requestLivePermissions,
  startStream,
  stopStream,
  switchCamera,
  setMuted,
  setOverlay,
} from "./src/ElitligLive";

export { LiveCameraView } from "./src/LiveCameraView";
