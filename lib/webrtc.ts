/**
 * WebRTC köprüsü — `react-native-webrtc` yalnız YEREL MODÜL kuruluyken yüklenir.
 *
 * NEDEN DİNAMİK: Expo Go'da yerel modül yoktur; statik `import` uygulamayı
 * açılışta çökertirdi. Burada modül `require` ile denenir; yoksa `available`
 * false döner ve arama düğmesi "uygulamanın yeni sürümü gerekli" der.
 * Geliştirme derlemesi (eas build --profile development) ve mağaza derlemeleri
 * app.json'daki `@config-plugins/react-native-webrtc` eklentisiyle modülü içerir.
 *
 * Tipler gevşek tutulur (any): paket yüklü olmadığında da `tsc` geçmeli.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface WebRtcModule {
  RTCPeerConnection: any;
  RTCSessionDescription: any;
  RTCIceCandidate: any;
  mediaDevices: { getUserMedia: (constraints: unknown) => Promise<any> };
  InCallManager: { start?: (opts?: unknown) => void; stop?: () => void; setSpeakerphoneOn?: (on: boolean) => void } | null;
}

let cached: WebRtcModule | null | undefined;

export function loadWebRtc(): WebRtcModule | null {
  if (cached !== undefined) return cached;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require("react-native-webrtc");
    cached = {
      RTCPeerConnection: mod.RTCPeerConnection,
      RTCSessionDescription: mod.RTCSessionDescription,
      RTCIceCandidate: mod.RTCIceCandidate,
      mediaDevices: mod.mediaDevices,
      InCallManager: null,
    };
  } catch {
    cached = null;
  }
  return cached;
}

export function isWebRtcAvailable(): boolean {
  return loadWebRtc() !== null;
}

export const WEBRTC_UNAVAILABLE_MESSAGE =
  "Sesli arama için uygulamanın güncel sürümü gerekiyor. Mağazadan güncelledikten sonra tekrar deneyin.";
