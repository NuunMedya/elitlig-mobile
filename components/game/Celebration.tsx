/**
 * KUTLAMA — React Native oyunlarının (Lig Yolu bulmacaları, bilgi yarışmaları,
 * sonuç kartları) ortak "görsel şölen" parçaları. Hepsi SONLU animasyondur
 * (tasarım kuralı: sonsuz döngü yok), yerel sürücüyle akar ve "hareketi
 * azalt" açıkken çizilmez.
 *
 *   <ConfettiBurst trigger={n} />    üstten patlayan, dönerek düşen konfeti
 *   <Sunburst size={…} />            arkada yavaşça dönen ışık hüzmeleri
 *   <SparkleBurst trigger={n} />     merkezden saçılan yıldız kıvılcımları
 *
 * `trigger` her arttığında efekt yeniden oynar.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useEffect, useMemo, useRef } from "react";
import { Animated, Easing, StyleSheet, View, useWindowDimensions } from "react-native";
import Svg, { Defs, Path, RadialGradient, Stop } from "react-native-svg";

import { useReduceMotion } from "@/components/ui";
import { colors } from "@/theme";

/** Konfeti renkleri: tema tokenları (marka, altın, kazanç, canlı, bilgi). */
function confettiColors() {
  return [colors.brand, colors.yellowCard, colors.win, colors.live, colors.brandAccent, colors.warn];
}

function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function ConfettiBurst({ trigger, count = 36, origin = 0.18 }: { trigger: number; count?: number; origin?: number }) {
  const reduce = useReduceMotion();
  const { width, height } = useWindowDimensions();
  const t = useRef(new Animated.Value(0)).current;
  const pieces = useMemo(() => {
    const rnd = seeded(trigger * 977 + 13);
    const cols = confettiColors();
    return Array.from({ length: count }, (_, i) => {
      const ang = -Math.PI / 2 + (rnd() - 0.5) * 2.4;
      const sp = 0.45 + rnd() * 0.55;
      return {
        key: i,
        color: cols[i % cols.length],
        dx: Math.cos(ang) * sp * width * 0.55,
        up: Math.sin(ang) * sp * height * 0.32,
        fall: height * (0.55 + rnd() * 0.35),
        w: 6 + rnd() * 6,
        h: 10 + rnd() * 8,
        spin: (rnd() < 0.5 ? -1 : 1) * (360 + rnd() * 540),
        round: rnd() < 0.3,
      };
    });
  }, [trigger, count, width, height]);

  useEffect(() => {
    if (!trigger || reduce) return;
    t.setValue(0);
    Animated.timing(t, { toValue: 1, duration: 2200, easing: Easing.linear, useNativeDriver: true }).start();
  }, [trigger, reduce, t]);

  if (!trigger || reduce) return null;
  const ox = width / 2, oy = height * origin;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {pieces.map((p) => {
        // yukarı fırla (ilk %25), sonra yerçekimiyle düş
        const y = t.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0, p.up, p.up + p.fall] });
        const x = t.interpolate({ inputRange: [0, 1], outputRange: [0, p.dx] });
        return (
          <Animated.View
            key={p.key}
            style={{
              position: "absolute",
              left: ox - p.w / 2,
              top: oy - p.h / 2,
              width: p.w,
              height: p.round ? p.w : p.h,
              borderRadius: p.round ? p.w / 2 : 2,
              backgroundColor: p.color,
              opacity: t.interpolate({ inputRange: [0, 0.75, 1], outputRange: [1, 1, 0] }),
              transform: [
                { translateX: x },
                { translateY: y },
                { rotate: t.interpolate({ inputRange: [0, 1], outputRange: ["0deg", `${p.spin}deg`] }) },
                { scaleX: t.interpolate({ inputRange: [0, 0.2, 0.4, 0.6, 0.8, 1], outputRange: [1, 0.3, 1, 0.3, 1, 0.3] }) },
              ],
            }}
          />
        );
      })}
    </View>
  );
}

/** Arkada yavaşça dönen ışık hüzmeleri (bir kez, ~8 sn; sonra yerinde kalır). */
export function Sunburst({ size, color = colors.yellowCard, opacity = 0.35 }: { size: number; color?: string; opacity?: number }) {
  const reduce = useReduceMotion();
  const spin = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 500, useNativeDriver: true }).start();
    if (reduce) return;
    Animated.timing(spin, { toValue: 1, duration: 8000, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [reduce, spin, fade]);
  const rays = 14;
  const r = size / 2;
  let d = "";
  for (let i = 0; i < rays; i++) {
    const a0 = (i / rays) * Math.PI * 2;
    const a1 = a0 + Math.PI / rays;
    d += `M${r} ${r} L${r + Math.cos(a0) * r} ${r + Math.sin(a0) * r} L${r + Math.cos(a1) * r} ${r + Math.sin(a1) * r} Z `;
  }
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: "absolute",
        width: size,
        height: size,
        opacity: fade,
        transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "140deg"] }) }],
      }}
    >
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id="sbfade" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={color} stopOpacity={opacity} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Path d={d} fill="url(#sbfade)" />
      </Svg>
    </Animated.View>
  );
}

const SPARK_ANGLES = Array.from({ length: 10 }, (_, i) => (i / 10) * Math.PI * 2);

/** Merkezden saçılan yıldızlar (doğru cevap, yıldız kazanımı). */
export function SparkleBurst({ trigger, radius = 70, color = colors.yellowCard }: { trigger: number; radius?: number; color?: string }) {
  const reduce = useReduceMotion();
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!trigger || reduce) return;
    t.setValue(0);
    Animated.timing(t, { toValue: 1, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [trigger, reduce, t]);
  if (!trigger || reduce) return null;
  return (
    <View pointerEvents="none" style={styles.center}>
      {SPARK_ANGLES.map((a, i) => (
        <Animated.View
          key={i}
          style={{
            position: "absolute",
            opacity: t.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 1, 0] }),
            transform: [
              { translateX: t.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(a) * radius * (i % 2 ? 1 : 0.7)] }) },
              { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(a) * radius * (i % 2 ? 1 : 0.7)] }) },
              { rotate: t.interpolate({ inputRange: [0, 1], outputRange: ["0deg", i % 2 ? "180deg" : "-180deg"] }) },
              { scale: t.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0.3, 1.1, 0.4] }) },
            ],
          }}
        >
          <Ionicons name="star" size={i % 2 ? 16 : 11} color={i % 3 === 0 ? colors.onDark : color} />
        </Animated.View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
});
