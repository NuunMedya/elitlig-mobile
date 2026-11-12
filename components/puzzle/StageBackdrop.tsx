/**
 * LİG YOLU SAHNESİ — bütün seviyeli oyunların (Elit Üçlü, Üçle Kazan, Soyunma
 * Odası, Kantin, Kariyer Yolu) arkasındaki ortak atmosfer.
 *
 * Gece maçı hissi: iki köşeden düşen projektör ışığı, tahtanın arkasında
 * yumuşak bir parlama ve zeminde silik saha çizgileri (orta yuvarlak, orta
 * çizgi). Renkler tema tokenlarıdır; iki temada da metin kontrastını bozmaz
 * (ışıklar düşük opaklıktadır). Açılışta bir kez belirir (sonlu animasyon).
 */

import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, useWindowDimensions } from "react-native";
import Svg, { Circle, Defs, Line, RadialGradient, Rect, Stop } from "react-native-svg";

import { colors } from "@/theme";

export function StageBackdrop() {
  const { width, height } = useWindowDimensions();
  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 700, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [fade]);
  const cx = width / 2;
  const pitchY = height * 0.62;
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: fade }]}>
      <Svg width={width} height={height}>
        <Defs>
          <RadialGradient id="stgL" cx="0%" cy="0%" r="75%">
            <Stop offset="0" stopColor={colors.brand} stopOpacity={0.2} />
            <Stop offset="1" stopColor={colors.brand} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="stgR" cx="100%" cy="0%" r="75%">
            <Stop offset="0" stopColor={colors.brandAccent} stopOpacity={0.16} />
            <Stop offset="1" stopColor={colors.brandAccent} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="stgC" cx="50%" cy="45%" r="55%">
            <Stop offset="0" stopColor={colors.win} stopOpacity={0.1} />
            <Stop offset="1" stopColor={colors.win} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width={width} height={height} fill="url(#stgC)" />
        <Rect x={0} y={0} width={width} height={height} fill="url(#stgL)" />
        <Rect x={0} y={0} width={width} height={height} fill="url(#stgR)" />
        <Line x1={0} y1={pitchY} x2={width} y2={pitchY} stroke={colors.border} strokeWidth={2} opacity={0.6} />
        <Circle cx={cx} cy={pitchY} r={width * 0.28} fill="none" stroke={colors.border} strokeWidth={2} opacity={0.6} />
        <Circle cx={cx} cy={pitchY} r={4} fill={colors.border} opacity={0.8} />
      </Svg>
    </Animated.View>
  );
}
