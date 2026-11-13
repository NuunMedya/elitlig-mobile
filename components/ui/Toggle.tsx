/**
 * Toggle — açık/kapalı anahtarı (Gece teması: "Liquid Toggle").
 *
 * Sistem `Switch`'i yerine özel çizim: top kayarken sıvı bir damla gibi
 * uzar, kenara varınca hafifçe ezilir ve yaylanarak oturur. Açıkken ray
 * imza degradesiyle (mor → camgöbeği) dolar ve hafif parlar.
 *
 * Erişilebilirlik: `role="switch"` + `checked` durumu; dokunma alanı 44px'e
 * genişletilir. "Hareketi azalt" açıkken top yaylanmadan yer değiştirir.
 */

import { LinearGradient } from "expo-linear-gradient";
import React, { useCallback, useEffect, useRef } from "react";
import { Animated, Easing, Pressable, StyleSheet, View } from "react-native";
import { colors, duration, glowStyle, haptics, radius, spring, touchSlop } from "@/theme";
import { useReduceMotion } from "./useReduceMotion";

export interface ToggleProps {
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
  /** Değişimde seçim haptiği (varsayılan açık). */
  haptic?: boolean;
  accessibilityLabel?: string;
  testID?: string;
}

const TRACK_W = 50;
const TRACK_H = 30;
const KNOB = 24;
const PAD = (TRACK_H - KNOB) / 2;
const TRAVEL = TRACK_W - KNOB - PAD * 2;

export const Toggle = React.memo(function Toggle({
  value,
  onValueChange,
  disabled,
  haptic = true,
  accessibilityLabel,
  testID,
}: ToggleProps) {
  const reduceMotion = useReduceMotion();
  const pos = useRef(new Animated.Value(value ? 1 : 0)).current;
  const goo = useRef(new Animated.Value(0)).current;
  const first = useRef(true);

  useEffect(() => {
    if (first.current || reduceMotion) {
      first.current = false;
      pos.setValue(value ? 1 : 0);
      return;
    }
    goo.setValue(0);
    Animated.parallel([
      Animated.spring(pos, { toValue: value ? 1 : 0, ...spring.slide }),
      Animated.sequence([
        Animated.timing(goo, { toValue: 1, duration: duration.fast, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.spring(goo, { toValue: 0, ...spring.pop }),
      ]),
    ]).start();
  }, [goo, pos, reduceMotion, value]);

  const handlePress = useCallback(() => {
    if (disabled) return;
    if (haptic) haptics.select();
    onValueChange(!value);
  }, [disabled, haptic, onValueChange, value]);

  /* Damla, gittiği yöne doğru uzar: ölçek merkezden olduğu için yarım uzama
     kadar ileri kaydırılır. */
  const stretchX = goo.interpolate({ inputRange: [0, 1], outputRange: [1, 1.38] });
  const lead = goo.interpolate({ inputRange: [0, 1], outputRange: [0, (value ? 1 : -1) * KNOB * 0.19] });

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled}
      hitSlop={touchSlop(TRACK_H)}
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: value, disabled }}
      testID={testID}
      style={disabled ? styles.disabled : null}
    >
      <View style={styles.track}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.trackOn, glowStyle(colors.glow, 1), { opacity: pos }]}>
          <LinearGradient
            colors={colors.gradientSignature}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={[StyleSheet.absoluteFill, styles.trackOn]}
          />
        </Animated.View>
        <Animated.View
          style={[
            styles.knob,
            {
              transform: [
                { translateX: Animated.add(pos.interpolate({ inputRange: [0, 1], outputRange: [0, TRAVEL] }), lead) },
                { scaleX: stretchX },
                { scaleY: goo.interpolate({ inputRange: [0, 1], outputRange: [1, 0.88] }) },
              ],
            },
          ]}
        />
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  track: {
    width: TRACK_W,
    height: TRACK_H,
    borderRadius: radius.pill,
    backgroundColor: colors.surface3,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    padding: PAD - StyleSheet.hairlineWidth,
    justifyContent: "center",
  },
  trackOn: {
    borderRadius: radius.pill,
  },
  knob: {
    width: KNOB,
    height: KNOB,
    borderRadius: KNOB / 2,
    backgroundColor: colors.knob,
    shadowColor: colors.shadowColor,
    shadowOpacity: 0.28,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  disabled: {
    opacity: 0.45,
  },
});
