/**
 * Halka gösterge — profil tamamlanma, bütçe kullanımı, topla oynama, reyting.
 *
 * NEDEN SVG: RN'de yay çizmenin tek dürüst yolu `strokeDasharray` +
 * `strokeDashoffset`. Halka -90°'den (saat 12) başlar, uçları yuvarlaktır;
 * arka halka `surface3` olduğu için boş kısım da bir "kap" gibi okunur.
 *
 * ANİMASYON: `strokeDashoffset` yerel sürücüyle animasyonlanamaz (SVG özelliği
 * JS thread'inden yazılır), bu yüzden `useNativeDriver: false`. Halka küçük ve
 * tek başına olduğu için bu kabul edilebilir; liste satırında KULLANILMAZ.
 * "Hareketi azalt" açıksa animasyon atlanır, değer doğrudan yerine oturur.
 */

import { memo, useEffect, useMemo, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { colors, easing, palette, ratingColors, textScale, type } from "@/theme";
import { useReduceMotion } from "./LiveBadge";

/**
 * Ton kümesi — ortak `Tone` tipi `components/ui/types.ts` ile geldiğinde bu
 * takma ad ona bağlanır. "rating" özel durumdur: renk `ratingValue`'dan gelir.
 */
export type ProgressRingTone =
  | "brand"
  | "live"
  | "win"
  | "draw"
  | "loss"
  | "warn"
  | "danger"
  | "info"
  | "neutral"
  | "rating";

export interface ProgressRingProps {
  /** 0–1 */
  value: number;
  /** Varsayılan 44 */
  size?: number;
  /** Varsayılan 4 */
  thickness?: number;
  tone?: ProgressRingTone;
  /** Ortada metin (yüzde, reyting, sayı) */
  label?: string;
  sublabel?: string;
  /** 0'dan value'ya animasyon */
  animate?: boolean;
  /** Reyting modunda değere göre renk seçer */
  ratingValue?: number;
}

const TONE_COLOR: Record<Exclude<ProgressRingTone, "rating">, string> = {
  brand: colors.brandAccent,
  live: colors.live,
  win: colors.win,
  draw: colors.draw,
  loss: colors.loss,
  warn: colors.warn,
  danger: colors.danger,
  info: colors.info,
  neutral: colors.textTertiary,
};

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export const ProgressRing = memo(function ProgressRing({
  value,
  size = 44,
  thickness = 4,
  tone = "brand",
  label,
  sublabel,
  animate = true,
  ratingValue,
}: ProgressRingProps) {
  const clamped = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
  const reduceMotion = useReduceMotion();
  const progress = useRef(new Animated.Value(animate ? 0 : clamped)).current;

  const radiusPx = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radiusPx;

  useEffect(() => {
    if (!animate || reduceMotion) {
      progress.setValue(clamped);
      return;
    }
    const run = Animated.timing(progress, {
      toValue: clamped,
      duration: 600,
      easing: easing.decelerate,
      useNativeDriver: false,
    });
    run.start();
    return () => run.stop();
  }, [clamped, animate, reduceMotion, progress]);

  // Animated.Value'nun SVG özelliğine geçirilmesi tip düzeyinde ifade edilemiyor;
  // `AnimatedCircle` çalışma zamanında bunu bekler (RN'in yerleşik kalıbı).
  const dashOffset = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [circumference, 0],
  }) as unknown as number;

  const stroke = tone === "rating" ? ratingColors(palette, ratingValue).fg : TONE_COLOR[tone];

  const wrap = useMemo(() => ({ width: size, height: size }), [size]);
  const labelSize = useMemo(() => ({ fontSize: Math.max(10, Math.round(size * 0.3)) }), [size]);

  return (
    <View
      style={[styles.wrap, wrap]}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label ? `${label}${sublabel ? `, ${sublabel}` : ""}` : "İlerleme"}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
    >
      <Svg width={size} height={size} style={styles.svg}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radiusPx}
          stroke={colors.surface3}
          strokeWidth={thickness}
          fill="none"
        />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radiusPx}
          stroke={stroke}
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={dashOffset}
          fill="none"
        />
      </Svg>

      {label || sublabel ? (
        <View style={styles.center} pointerEvents="none">
          {label ? (
            <Text style={[styles.label, labelSize, { color: stroke }]} numberOfLines={1} {...textScale.badge}>
              {label}
            </Text>
          ) : null}
          {sublabel ? (
            <Text style={styles.sublabel} numberOfLines={1} {...textScale.badge}>
              {sublabel}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  // Yay saat 12'den başlasın diye tüm çizim -90° döndürülür.
  svg: {
    transform: [{ rotate: "-90deg" }],
  },
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    ...type.tableNumStrong,
  },
  sublabel: {
    ...type.micro,
    color: colors.textTertiary,
  },
});
