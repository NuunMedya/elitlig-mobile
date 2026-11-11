/**
 * GÖREV İLERLEME GÖSTERGELERİ — çubuk ve halka.
 *
 *   · `QuestBar`  görev kartındaki ince çubuk. Dolgu tam genişlikte çizilir ve
 *     `translateX` ile yerine kayar: yalnız transform animasyonlanır (yerel
 *     sürücü), yuvarlak uç ezilmez. Değer değişince eski yerinden yenisine
 *     akar — görev ilerledi hissi buradan gelir.
 *   · `QuestRing` sahnedeki halka (haftanın görev sayısı). SVG çizgi kayması
 *     yerel sürücüyle animasyonlanamaz; halka ekranda TEK olduğu için kabul.
 *
 * İkisi de "Hareketi azalt" açıkken animasyonsuzdur ve tek sefer çalışır
 * (sonsuz döngü yok).
 */

import { memo, useEffect, useRef, useState, type ReactNode } from "react";
import { Animated, StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Circle } from "react-native-svg";

import { useReduceMotion } from "@/components/ui";
import { colors, duration, easing, radius } from "@/theme";

const clamp01 = (value: number) => (Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0);

/* ───────────────────────── Çubuk ───────────────────────── */

export const QuestBar = memo(function QuestBar({
  value,
  color,
  track = colors.surface3,
  height = 6,
  delay = 0,
  style,
}: {
  /** 0–1 */
  value: number;
  color: string;
  /** Ray rengi — sahnede `colors.inkPill`. */
  track?: string;
  height?: number;
  /** Listede kademeli dolum için gecikme (ms). */
  delay?: number;
  /** Satır içinde `{ flex: 1 }` verilir; verilmezse kapsayıcının genişliğini alır. */
  style?: StyleProp<ViewStyle>;
}) {
  const ratio = clamp01(value);
  const reduceMotion = useReduceMotion();
  const [width, setWidth] = useState(0);
  const progress = useRef(new Animated.Value(reduceMotion ? ratio : 0)).current;

  useEffect(() => {
    if (reduceMotion) {
      progress.setValue(ratio);
      return;
    }
    const run = Animated.timing(progress, {
      toValue: ratio,
      duration: duration.slow + duration.base,
      delay,
      easing: easing.emphasized,
      useNativeDriver: true,
    });
    run.start();
    return () => run.stop();
  }, [ratio, reduceMotion, progress, delay]);

  const onLayout = (event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.width);
    if (next !== width) setWidth(next);
  };

  return (
    <View
      style={[styles.track, { height, backgroundColor: track }, style]}
      onLayout={onLayout}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(ratio * 100) }}
    >
      {width > 0 ? (
        <Animated.View
          style={[
            styles.fill,
            {
              height,
              width,
              backgroundColor: color,
              transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [-width, 0] }) }],
            },
          ]}
        />
      ) : null}
    </View>
  );
});

/* ───────────────────────── Halka ───────────────────────── */

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export const QuestRing = memo(function QuestRing({
  value,
  size = 84,
  thickness = 7,
  color = colors.yellowCard,
  track = colors.inkTile,
  children,
}: {
  /** 0–1 */
  value: number;
  size?: number;
  thickness?: number;
  color?: string;
  track?: string;
  /** Halkanın ortası (sayı + etiket). */
  children?: ReactNode;
}) {
  const ratio = clamp01(value);
  const reduceMotion = useReduceMotion();
  const progress = useRef(new Animated.Value(reduceMotion ? ratio : 0)).current;
  const r = (size - thickness) / 2;
  const circumference = 2 * Math.PI * r;

  useEffect(() => {
    if (reduceMotion) {
      progress.setValue(ratio);
      return;
    }
    const run = Animated.timing(progress, {
      toValue: ratio,
      duration: duration.flash,
      easing: easing.emphasized,
      // SVG çizgi kayması JS iş parçacığından yazılır (bkz. components/ui/ProgressRing).
      useNativeDriver: false,
    });
    run.start();
    return () => run.stop();
  }, [ratio, reduceMotion, progress]);

  const dashOffset = progress.interpolate({ inputRange: [0, 1], outputRange: [circumference, 0] }) as unknown as number;

  return (
    <View
      style={[styles.ring, { width: size, height: size }]}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(ratio * 100) }}
    >
      <Svg width={size} height={size} style={styles.ringSvg}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={thickness} fill="none" />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={dashOffset}
          fill="none"
          rotation={-90}
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
      {children}
    </View>
  );
});

const styles = StyleSheet.create({
  track: { alignSelf: "stretch", borderRadius: radius.pill, overflow: "hidden" },
  fill: { borderRadius: radius.pill },
  ring: { alignItems: "center", justifyContent: "center" },
  ringSvg: { position: "absolute", left: 0, top: 0 },
});
