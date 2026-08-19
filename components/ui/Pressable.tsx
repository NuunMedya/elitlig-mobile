/**
 * Touchable — uygulamadaki her basılabilir öğenin ortak zemini.
 *
 * NEDEN TEK BİLEŞEN: şartname §5.2'ye göre basma geri bildirimi öğenin TİPİNE
 * göre değişir (liste satırında zemin, kartta ölçek, ikonda opaklık). Bu farkı
 * her dosyada elle yazmak kaçınılmaz olarak tutarsızlık üretir; burada tek
 * yerde tanımlanır ve `feedback` prop'uyla seçilir.
 *
 * NEDEN Animated (reanimated değil): projede react-native-reanimated KURULU
 * DEĞİL. Ölçek/opaklık RN çekirdeğindeki Animated ile ve daima
 * `useNativeDriver: true` ile sürülür; JS iş parçacığı canlı skor listesini
 * güncellerken bile basma tepkisi düşmez.
 *
 * SATIR GERİ BİLDİRİMİ: satırda opaklık ya da ölçek YOKTUR — ucuz durur.
 * Bunun yerine içeriğin ALTINA serilen bir tint katmanı basılınca ANINDA
 * görünür, bırakılınca 120 ms'de söner (§5.2). Android'de bunun yerine
 * platformun kendi ripple'ı kullanılır.
 *
 * HAPTİK: `haptic` prop'u yalnız KULLANICI dokunuşunda çalışır; throttle ve
 * "kapalı" bayrağı theme/motion.ts içindedir (§5.3).
 */

import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  Animated,
  Platform,
  Pressable as RNPressable,
  StyleSheet,
  type GestureResponderEvent,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { colors, duration, haptics, press, spring } from "@/theme";

/** §5.2 tablosundaki geri bildirim tipleri. */
export type PressFeedback = "row" | "card" | "button" | "icon" | "chip" | "fab" | "none";

/** §5.3'teki dokunsal geri bildirim türleri. */
export type HapticKind =
  | "none"
  | "selection"
  | "light"
  | "medium"
  | "success"
  | "warning"
  | "error";

/** Verilen türde dokunsal geri bildirim tetikler (kapalıysa/throttle ise sessizce geçer). */
export function fireHaptic(kind: HapticKind): void {
  switch (kind) {
    case "selection":
      haptics.select();
      break;
    case "light":
      haptics.light();
      break;
    case "medium":
      haptics.medium();
      break;
    case "success":
      haptics.success();
      break;
    case "warning":
      haptics.warning();
      break;
    case "error":
      haptics.error();
      break;
    default:
      break;
  }
}

export interface TouchableProps extends Omit<PressableProps, "style" | "children"> {
  /** Geri bildirim tipi — varsayılan "row" (liste satırı). */
  feedback?: PressFeedback;
  /** Basıldığında tetiklenecek dokunsal geri bildirim — varsayılan "none". */
  haptic?: HapticKind;
  style?: StyleProp<ViewStyle>;
  /** Basılıyken eklenen stil (buton zemini, kart zemini gibi). */
  pressedStyle?: StyleProp<ViewStyle>;
  /** Android ripple — varsayılan: satır ve kartta açık, diğerlerinde kapalı. */
  ripple?: boolean;
  children?: React.ReactNode;
}

const AnimatedPressable = Animated.createAnimatedComponent(RNPressable);

export const Touchable = React.memo(function Touchable({
  feedback = "row",
  haptic = "none",
  style,
  pressedStyle,
  ripple,
  children,
  onPress,
  onPressIn,
  onPressOut,
  disabled,
  hitSlop,
  accessibilityRole = "button",
  ...rest
}: TouchableProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const fade = useRef(new Animated.Value(1)).current;
  const tint = useRef(new Animated.Value(0)).current;
  const [isPressed, setIsPressed] = useState(false);

  const targetScale =
    feedback === "card" ? press.cardScale : feedback === "fab" ? press.fabScale : 1;
  const targetOpacity =
    feedback === "icon"
      ? press.iconOpacity
      : feedback === "chip"
        ? press.chipOpacity
        : feedback === "button"
          ? press.buttonOpacity
          : 1;

  // Android'de ripple zaten geri bildirim veriyor; tint katmanı yalnız iOS/web'de.
  const tinted = feedback === "row" && Platform.OS !== "android";
  const rippleOn = ripple ?? (feedback === "row" || feedback === "card");
  // Yeniden render yalnız gerçekten stil değişecekse yapılır (liste başına maliyet).
  const tracksPressState = feedback === "card" || pressedStyle != null;

  const handlePressIn = useCallback(
    (event: GestureResponderEvent) => {
      if (targetScale !== 1) {
        Animated.spring(scale, { toValue: targetScale, ...spring.press }).start();
      }
      if (targetOpacity !== 1) {
        Animated.timing(fade, {
          toValue: targetOpacity,
          duration: duration.instant,
          useNativeDriver: true,
        }).start();
      }
      if (tinted) {
        Animated.timing(tint, {
          toValue: 1,
          duration: duration.instant,
          useNativeDriver: true,
        }).start();
      }
      if (tracksPressState) setIsPressed(true);
      onPressIn?.(event);
    },
    [fade, onPressIn, scale, targetOpacity, targetScale, tint, tinted, tracksPressState],
  );

  const handlePressOut = useCallback(
    (event: GestureResponderEvent) => {
      if (targetScale !== 1) {
        Animated.spring(scale, { toValue: 1, ...spring.press }).start();
      }
      if (targetOpacity !== 1) {
        Animated.timing(fade, {
          toValue: 1,
          duration: duration.fast,
          useNativeDriver: true,
        }).start();
      }
      if (tinted) {
        Animated.timing(tint, {
          toValue: 0,
          duration: duration.fast,
          useNativeDriver: true,
        }).start();
      }
      if (tracksPressState) setIsPressed(false);
      onPressOut?.(event);
    },
    [fade, onPressOut, scale, targetOpacity, targetScale, tint, tinted, tracksPressState],
  );

  const handlePress = useCallback(
    (event: GestureResponderEvent) => {
      fireHaptic(haptic);
      onPress?.(event);
    },
    [haptic, onPress],
  );

  const animatedStyle = useMemo<StyleProp<ViewStyle>>(() => {
    if (targetScale !== 1) return { transform: [{ scale }] };
    if (targetOpacity !== 1) return { opacity: fade };
    return null;
  }, [fade, scale, targetOpacity, targetScale]);

  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      accessibilityRole={accessibilityRole}
      hitSlop={hitSlop ?? (feedback === "icon" ? press.hitSlop : undefined)}
      android_ripple={rippleOn && !disabled ? { color: colors.ripple } : undefined}
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[
        tinted ? styles.clip : null,
        style,
        isPressed && feedback === "card" ? styles.cardPressed : null,
        isPressed ? pressedStyle : null,
        animatedStyle,
      ]}
    >
      {tinted ? (
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, styles.tint, { opacity: tint }]}
        />
      ) : null}
      {children}
    </AnimatedPressable>
  );
});

const styles = StyleSheet.create({
  /** Tint katmanı köşe yarıçapının dışına taşmasın. */
  clip: {
    overflow: "hidden",
  },
  tint: {
    backgroundColor: colors.pressed,
  },
  cardPressed: {
    backgroundColor: colors.surface2,
  },
});
