/**
 * SKOR SAYACI — tahmin kartının ortasındaki dikey "skorbord" hücresi.
 *
 *     [ + ]
 *     [ 2 ]   ← skor puntosu, tabular rakam
 *     [ − ]
 *
 * Değer her değiştiğinde rakam küçük bir yayla (spring) hafifçe zıplar —
 * oyun hissinin tek dozu budur; "hareketi azalt" açıkken çizilmez. Kilitliyken
 * düğmeler gizlenmez, sönükleşir: kartın yüksekliği maç durumuna göre
 * oynamasın diye.
 *
 * ERİŞİLEBİLİRLİK: değer hücresi `adjustable` rolündedir (ekran okuyucuda
 * yukarı/aşağı kaydırma artırır/azaltır); iki düğme de ayrıca etiketlidir.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { memo, useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";

import { Touchable, useReduceMotion } from "@/components/ui";
import { colors, hairline, radius, spring, textScale, type } from "@/theme";

export interface ScoreStepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
  /** "Galatasaray golü" gibi — ekran okuyucu etiketi. */
  accessibilityLabel: string;
}

export const ScoreStepper = memo(function ScoreStepper({
  value,
  onChange,
  min = 0,
  max = 30,
  disabled = false,
  accessibilityLabel,
}: ScoreStepperProps) {
  const reduce = useReduceMotion();
  const bump = useRef(new Animated.Value(1)).current;
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (reduce) return;
    bump.setValue(1.14);
    Animated.spring(bump, { toValue: 1, ...spring.bounce }).start();
  }, [value, reduce, bump]);

  const canUp = !disabled && value < max;
  const canDown = !disabled && value > min;
  const step = (delta: number) => onChange(Math.max(min, Math.min(max, value + delta)));

  return (
    <View style={styles.column}>
      <Touchable
        feedback="icon"
        haptic="selection"
        disabled={!canUp}
        onPress={() => step(1)}
        style={[styles.button, !canUp && styles.buttonOff]}
        accessibilityRole="button"
        accessibilityLabel={`${accessibilityLabel}: artır`}
        accessibilityState={{ disabled: !canUp }}
        hitSlop={6}
      >
        <Ionicons name="chevron-up" size={18} color={canUp ? colors.textPrimary : colors.textDisabled} />
      </Touchable>
      <View
        style={[styles.cell, disabled && styles.cellLocked]}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={accessibilityLabel}
        accessibilityValue={{ min, max, now: value, text: String(value) }}
        accessibilityState={{ disabled }}
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
        onAccessibilityAction={(event) => {
          if (disabled) return;
          if (event.nativeEvent.actionName === "increment") step(1);
          if (event.nativeEvent.actionName === "decrement") step(-1);
        }}
      >
        <Animated.Text
          style={[styles.value, disabled && styles.valueLocked, { transform: [{ scale: bump }] }]}
          {...textScale.badge}
        >
          {value}
        </Animated.Text>
      </View>
      <Touchable
        feedback="icon"
        haptic="selection"
        disabled={!canDown}
        onPress={() => step(-1)}
        style={[styles.button, !canDown && styles.buttonOff]}
        accessibilityRole="button"
        accessibilityLabel={`${accessibilityLabel}: azalt`}
        accessibilityState={{ disabled: !canDown }}
        hitSlop={6}
      >
        <Ionicons name="chevron-down" size={18} color={canDown ? colors.textPrimary : colors.textDisabled} />
      </Touchable>
    </View>
  );
});

/** Salt okunur skor hücresi — kilitli/biten maçta aynı ölçüyle. */
export function ScoreCell({ value, muted = false, accessibilityLabel }: { value: number | string; muted?: boolean; accessibilityLabel?: string }) {
  return (
    <View
      style={[styles.cell, styles.cellLocked]}
      accessible
      accessibilityLabel={accessibilityLabel ? `${accessibilityLabel}: ${value === "–" ? "tahmin yok" : value}` : undefined}
    >
      <Text style={[styles.value, muted && styles.valueLocked]} {...textScale.badge}>
        {value}
      </Text>
    </View>
  );
}

const CELL_W = 48;

const styles = StyleSheet.create({
  column: { alignItems: "center", gap: 4 },
  button: {
    width: CELL_W,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
    backgroundColor: colors.surface3,
  },
  buttonOff: { opacity: 0.55 },
  cell: {
    width: CELL_W,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    borderWidth: hairline,
    borderColor: colors.borderStrong,
    backgroundColor: colors.bg,
  },
  cellLocked: { backgroundColor: colors.surface2, borderColor: colors.border },
  value: { ...type.scoreLg, color: colors.textPrimary },
  valueLocked: { color: colors.textSecondary },
});
