/**
 * Stepper — sayısal artır/azalt (§4.22).
 *
 * EN KRİTİK KULLANIM: `app/yonetim/maclar.tsx` içindeki canlı skor girişi.
 * Saha kenarında, tek elle, aceleyle kullanılır. Bu yüzden:
 *  - düğmeler 32×32 çizilir ama `hitSlop` ile 44px dokunma alanına tamamlanır,
 *  - sayı alanı SABİT genişliktedir (tabular rakam): 9 → 10 olduğunda düğmeler
 *    yer değiştirmez, parmak aynı noktada kalır,
 *  - sınıra gelince düğme sönükleşir VE basılamaz; sessizce hiçbir şey
 *    yapmayan bir düğme "uygulama dondu" hissi verir, bu yüzden sınırda
 *    uyarı titreşimi çalar.
 *
 * BASILI TUTMA: `repeatOnHold` ile 500ms sonra 120ms aralıkla, 2 saniye sonra
 * 60ms aralıkla hızlanır. Tekrar sırasında haptik ÇALMAZ — saniyede 16 titreşim
 * telefonu kullanılmaz hâle getirir; §5.3'teki throttle zaten engeller ama
 * burada niyet açıkça yazılıdır.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useCallback, useEffect, useRef } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { colors, haptics, radius, space, textScale, touchSlop, type } from "@/theme";
import { Touchable } from "./Pressable";

export interface StepperProps {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Sol etiket — skor girişinde takım adı. */
  label?: string;
  size?: "sm" | "md";
  disabled?: boolean;
  /** Basılı tutunca hızlanan artış. */
  repeatOnHold?: boolean;
  style?: StyleProp<ViewStyle>;
  /** Ekran okuyucu için: "Ev sahibi golü" gibi. */
  accessibilityLabel?: string;
}

const SIZES = {
  sm: { button: 28, icon: 16, value: 34 },
  md: { button: 32, icon: 18, value: 40 },
} as const;

/** Basılı tutma hızlanma basamakları (§4.22). */
const HOLD_DELAY_MS = 500;
const HOLD_INTERVAL_MS = 120;
const HOLD_FAST_AFTER_MS = 2000;
const HOLD_FAST_INTERVAL_MS = 60;

export const Stepper = React.memo(function Stepper({
  value,
  onChange,
  min = 0,
  max = 99,
  step = 1,
  label,
  size = "md",
  disabled = false,
  repeatOnHold = false,
  style,
  accessibilityLabel,
}: StepperProps) {
  const metrics = SIZES[size];
  const atMin = value <= min;
  const atMax = value >= max;

  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const holdStartedAt = useRef(0);
  /** Tekrar sırasında güncel değeri okumak için — closure eski değeri tutmasın. */
  const valueRef = useRef(value);
  valueRef.current = value;

  const stopHold = useCallback(() => {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
    if (holdInterval.current) {
      clearInterval(holdInterval.current);
      holdInterval.current = null;
    }
  }, []);

  useEffect(() => stopHold, [stopHold]);

  /** Tek adım — sınırda uyarır, sınırı aşmaz. */
  const apply = useCallback(
    (direction: 1 | -1, silent = false) => {
      const next = valueRef.current + direction * step;
      if (next > max || next < min) {
        if (!silent) haptics.warning();
        stopHold();
        return;
      }
      if (!silent) haptics.select();
      valueRef.current = next;
      onChange(next);
    },
    [max, min, onChange, step, stopHold],
  );

  const startHold = useCallback(
    (direction: 1 | -1) => {
      if (!repeatOnHold || disabled) return;
      holdStartedAt.current = Date.now();
      holdTimer.current = setTimeout(() => {
        holdInterval.current = setInterval(() => {
          // 2 saniyeden sonra hızlan: aralığı yeniden kur.
          const elapsed = Date.now() - holdStartedAt.current;
          if (elapsed > HOLD_FAST_AFTER_MS && holdInterval.current) {
            clearInterval(holdInterval.current);
            holdInterval.current = setInterval(() => apply(direction, true), HOLD_FAST_INTERVAL_MS);
          }
          apply(direction, true);
        }, HOLD_INTERVAL_MS);
      }, HOLD_DELAY_MS);
    },
    [apply, disabled, repeatOnHold],
  );

  const renderButton = (direction: 1 | -1) => {
    const blocked = disabled || (direction === 1 ? atMax : atMin);
    return (
      <Touchable
        feedback="icon"
        onPress={() => apply(direction)}
        onPressIn={() => startHold(direction)}
        onPressOut={stopHold}
        disabled={blocked}
        hitSlop={touchSlop(metrics.button)}
        accessibilityRole="button"
        accessibilityLabel={direction === 1 ? "Artır" : "Azalt"}
        accessibilityState={{ disabled: blocked }}
        style={[
          styles.button,
          { width: metrics.button, height: metrics.button },
          blocked ? styles.buttonBlocked : null,
        ]}
      >
        <Ionicons
          name={direction === 1 ? "add" : "remove"}
          size={metrics.icon}
          color={blocked ? colors.textDisabled : colors.textPrimary}
        />
      </Touchable>
    );
  };

  return (
    <View
      style={[styles.container, style]}
      accessible={false}
      accessibilityLabel={accessibilityLabel ?? label}
    >
      {label ? (
        <Text style={styles.label} numberOfLines={1} {...textScale.dense}>
          {label}
        </Text>
      ) : null}

      {renderButton(-1)}

      <Text
        style={[styles.value, { width: metrics.value }, disabled ? styles.valueDisabled : null]}
        accessibilityRole="text"
        accessibilityLabel={`${accessibilityLabel ?? label ?? "Değer"}: ${value}`}
        {...textScale.badge}
      >
        {value}
      </Text>

      {renderButton(1)}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  label: {
    ...type.bodySm,
    color: colors.textSecondary,
    flexShrink: 1,
    marginRight: space.xs,
  },
  button: {
    borderRadius: radius.md,
    backgroundColor: colors.surface2,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonBlocked: {
    backgroundColor: colors.surface3,
  },
  /** Sabit genişlik + tabular rakam: 9 → 10 geçişinde düğmeler kaymaz. */
  value: {
    ...type.scoreSm,
    color: colors.textPrimary,
    textAlign: "center",
  },
  valueDisabled: {
    color: colors.textDisabled,
  },
});
