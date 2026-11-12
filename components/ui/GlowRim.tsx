/**
 * GlowRim — CANLI KARTIN IŞIKLI KENARI (Gece teması: "Neon Edge").
 *
 * Kartın çevresinde ince, canlı tonunda bir çerçeve ve üst kenarında soldan
 * sağa sürekli akan bir ışık kuyruklu yıldızı. Kart canlıyken "şu an
 * oynanıyor" sinyalini rengi okumadan da verir.
 *
 * Kartın içine `StyleSheet.absoluteFill` olarak konur; dokunmayı engellemez.
 * Kart `overflow: "hidden"` değilse yıldız köşeden taşabilir, bu yüzden
 * bileşen kendi kırpma kutusunu taşır. "Hareketi azalt" açıkken yalnız
 * çerçeve kalır.
 */

import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import { ambient, colors, radius as radiusScale } from "@/theme";
import { useReduceMotion } from "./useReduceMotion";

export interface GlowRimProps {
  /** Kartın köşe yarıçapı (çerçeve aynı eğriyi izlemeli). */
  radius?: number;
  /** Işık rengi — varsayılan canlı pembesi. */
  color?: string;
}

const COMET = 120;

export const GlowRim = React.memo(function GlowRim({ radius = radiusScale.xl, color = colors.live }: GlowRimProps) {
  const reduceMotion = useReduceMotion();
  const [width, setWidth] = useState(0);
  const t = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduceMotion || width <= 0) return;
    const loop = Animated.loop(
      Animated.timing(t, { toValue: 1, duration: ambient.rim, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [reduceMotion, t, width]);

  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, styles.clip, { borderRadius: radius, borderColor: `${color}55` }]}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
    >
      {!reduceMotion && width > 0 ? (
        <Animated.View
          style={[
            styles.comet,
            {
              transform: [
                { translateX: t.interpolate({ inputRange: [0, 1], outputRange: [-COMET, width] }) },
              ],
            },
          ]}
        >
          <LinearGradient
            colors={[`${color}00`, color, colors.gradientSignature[1], `${colors.gradientSignature[1]}00`]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  clip: {
    overflow: "hidden",
    borderWidth: 1,
  },
  comet: {
    position: "absolute",
    top: 0,
    left: 0,
    width: COMET,
    height: 2,
  },
});
