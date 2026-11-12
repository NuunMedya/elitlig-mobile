/**
 * LİG YOLU SAHNESİ — seviyeli oyunların (Elit Üçlü, Üçle Kazan, Soyunma Odası,
 * Kantin, Kariyer Yolu) arkasındaki sakin zemin.
 *
 * Sade dil: oyuna çalan derin lacivert dikey geçiş (lib/puzzle/stagePalette)
 * ve tahtanın arkasında TEK yumuşak ışık. Projektör, tribün, kıvılcım yok:
 * göz tahtada kalır. Açılışta bir kez belirir (sonlu animasyon); dokunuşları
 * engellemez.
 */

import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, useWindowDimensions } from "react-native";
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from "react-native-svg";

import { STAGE_THEMES } from "@/lib/puzzle/stagePalette";
import type { PuzzleGameKey } from "@/lib/puzzle/types";
import { duration } from "@/theme";

export function StageBackdrop({ game = "uclu" }: { game?: PuzzleGameKey }) {
  const { width, height } = useWindowDimensions();
  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: duration.slow, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [fade]);
  const th = STAGE_THEMES[game] ?? STAGE_THEMES.uclu;

  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: fade }]}>
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id="stSky" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={th.sky[0]} />
            <Stop offset="0.5" stopColor={th.sky[1]} />
            <Stop offset="1" stopColor={th.sky[2]} />
          </LinearGradient>
          <RadialGradient id="stGlow" cx="50%" cy="48%" rx="70%" ry="42%">
            <Stop offset="0" stopColor={th.glow} stopOpacity={0.2} />
            <Stop offset="1" stopColor={th.glow} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width={width} height={height} fill="url(#stSky)" />
        <Rect x={0} y={0} width={width} height={height} fill="url(#stGlow)" />
      </Svg>
    </Animated.View>
  );
}
