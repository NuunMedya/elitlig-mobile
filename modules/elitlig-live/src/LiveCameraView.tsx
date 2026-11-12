import { requireNativeView } from "expo";
import * as React from "react";
import { View } from "react-native";

import { NATIVE_MODULE_NAME, NativeLive } from "./ElitligLive";
import type { LiveCameraViewProps } from "./ElitligLive.types";

// Yerel görünüm yalnızca modül varsa istenir; Expo Go / web'de düz bir View çizilir
// (requireNativeView modül yokken uyarı basar ve boş bileşen döndürür).
const NativeLiveCameraView: React.ComponentType<LiveCameraViewProps> | null = NativeLive
  ? requireNativeView<LiveCameraViewProps>(NATIVE_MODULE_NAME)
  : null;

/**
 * Kamera önizlemesi (yatay, 16:9 alanı doldurur). Aynı anda tek bir
 * LiveCameraView bulunmalı; görünüm kaldırılınca yayın ve kamera kapanır.
 */
export function LiveCameraView(props: LiveCameraViewProps) {
  if (!NativeLiveCameraView) {
    const { facing: _facing, onStateChange: _s, onStats: _t, onReplayStateChange: _r, onRecordingStateChange: _c, style, ...rest } = props;
    return <View {...rest} style={[{ backgroundColor: "#000" }, style]} />;
  }
  return <NativeLiveCameraView facing="back" {...props} />;
}
