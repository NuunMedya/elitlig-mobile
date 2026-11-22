/**
 * OYUN ANA SAYFASI HAREKETİ — ölçülü, tek dosyada.
 *
 *   · Bob      ödül öğelerinde hafif yukarı-aşağı süzülme (±3 px, 1,8 sn)
 *   · Shimmer  YALNIZ alınabilir ödülün üstünden geçen ince ışık (3,2 sn'de bir)
 *
 * İkisi de "hareketi azalt" açıkken durur ve yerel sürücüde çalışır
 * (scripts/check-tokens.mjs bu dosyayı ortam hareketi olarak tanır). Başka
 * hiçbir ana sayfa öğesi sürekli hareket etmez: göz tek odakta (OYNA) kalsın.
 */

import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { useReduceMotion } from "@/components/ui";
import { GH } from "@/lib/game/gameHomePalette";
import { radius } from "@/theme";

const LEFT = { x: 0, y: 0.5 } as const;
const RIGHT = { x: 1, y: 0.5 } as const;

/** Hafif süzülme. `delay` ile yan yana öğeler aynı anda zıplamaz. */
export function Bob({ children, active = true, delay = 0, amount = 3, style }: { children: React.ReactNode; active?: boolean; delay?: number; amount?: number; style?: StyleProp<ViewStyle> }) {
  const reduce = useReduceMotion();
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduce || !active) {
      v.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(v, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active, delay, reduce, v]);
  return <Animated.View style={[style, { transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, -amount] }) }] }]}>{children}</Animated.View>;
}

/** Işık süpürmesi: ebeveynin üstünde, köşeleri ebeveynle aynı kırpılır. */
export function Shimmer({ active, width = 64, rounded = radius.lg }: { active: boolean; width?: number; rounded?: number }) {
  const reduce = useReduceMotion();
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduce || !active) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.delay(2300),
        Animated.timing(v, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active, reduce, v]);
  if (reduce || !active) return null;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: rounded, overflow: "hidden" }]}>
      <Animated.View
        style={[
          styles.band,
          { width: width * 0.45, transform: [{ translateX: v.interpolate({ inputRange: [0, 1], outputRange: [-width * 0.6, width * 1.2] }) }, { skewX: "-20deg" }] },
        ]}
      >
        <LinearGradient colors={[GH.playGlossClear, GH.playGloss, GH.playGlossClear]} start={LEFT} end={RIGHT} style={StyleSheet.absoluteFill} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  band: { position: "absolute", top: -4, bottom: -4, left: 0 },
});
