/**
 * Input — metin alanı ve arama kutusu (§4.30).
 *
 * ARENA ALANI: beyaz kâğıt + 1px kenarlık (`border`). Gri dolgulu alan, gri
 * kâğıdın üstünde "pasif" okunuyordu; beyaz alan "buraya yazılır" der ve
 * kart içinde de aynı dili konuşur. ODAKTA kenarlık marka rengine döner —
 * alanın nereye gittiğini yalnız kenarlık gösterir. Hata varsa kenarlık
 * kırmızıya döner ve ALTINDA metin belirir — yalnız renk kullanmak
 * erişilebilir değildir.
 *
 * `variant="search"` hap biçimli, arama ikonlu ve temizle düğmeli varyanttır;
 * temizleme yalnız `value` doluyken görünür ve dokunma alanı 44px'e
 * `hitSlop` ile tamamlanır.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from "react-native";
import { colors, duration, easing, fonts, haptics, radius, space, spring, textScale, touchSlop, type } from "@/theme";
import { Touchable } from "./Pressable";
import { useReduceMotion } from "./useReduceMotion";

export interface InputProps extends Omit<TextInputProps, "style"> {
  label?: string;
  error?: string;
  hint?: string;
  leadingIcon?: keyof typeof Ionicons.glyphMap;
  trailing?: React.ReactNode;
  /** 36 / 44 yükseklik — varsayılan "md". */
  size?: "sm" | "md";
  /** Arama kutusu varyantı: hap biçimli, temizle düğmeli. */
  variant?: "default" | "search";
  containerStyle?: StyleProp<ViewStyle>;
  /**
   * FLOATING LABEL: etiket alanın İÇİNDE yer tutucu gibi durur; odaklanınca
   * ya da değer girilince yukarı süzülür ve küçülür. Giriş/kayıt gibi
   * kimlik ekranlarında kullanılır.
   */
  floating?: boolean;
}

/**
 * RN sürümleri arasında odak olayının tipi değişiyor (NativeSyntheticEvent →
 * FocusEvent). Tipi prop'un kendisinden türetmek bu farkı görünmez kılar.
 */
type FocusHandler = NonNullable<TextInputProps["onFocus"]>;
type BlurHandler = NonNullable<TextInputProps["onBlur"]>;

export const Input = React.memo(
  React.forwardRef<TextInput, InputProps>(function Input(
    {
      label,
      error,
      hint,
      leadingIcon,
      trailing,
      size = "md",
      variant = "default",
      containerStyle,
      floating = false,
      onFocus,
      onBlur,
      onChangeText,
      multiline,
      ...rest
    },
    ref,
  ) {
    const [focused, setFocused] = useState(false);
    const reduceMotion = useReduceMotion();
    const float = floating && Boolean(label) && !multiline;
    const height = float ? 58 : size === "sm" ? 38 : 48;
    const icon = leadingIcon ?? (variant === "search" ? "search" : undefined);
    const hasValue = typeof rest.value === "string" && rest.value.length > 0;

    /* GLOW BORDER: odakta kenar imza degradesine döner ve alanın etrafında
       mor bir ışık yanar. */
    const focusAnim = useRef(new Animated.Value(0)).current;
    /* FLOATING LABEL: 0 = yer tutucu konumu, 1 = yukarıda küçük. */
    const raised = focused || hasValue || Boolean(rest.defaultValue);
    const labelAnim = useRef(new Animated.Value(raised ? 1 : 0)).current;
    /* SHAKE INPUT: hata belirince alan iki yana sallanır. */
    const shake = useRef(new Animated.Value(0)).current;
    const lastError = useRef(error);

    useEffect(() => {
      const anim = Animated.timing(focusAnim, {
        toValue: focused ? 1 : 0,
        duration: reduceMotion ? 0 : duration.base,
        easing: easing.standard,
        useNativeDriver: true,
      });
      anim.start();
    }, [focusAnim, focused, reduceMotion]);

    useEffect(() => {
      if (!float) return;
      if (reduceMotion) {
        labelAnim.setValue(raised ? 1 : 0);
        return;
      }
      Animated.spring(labelAnim, { toValue: raised ? 1 : 0, ...spring.slide }).start();
    }, [float, labelAnim, raised, reduceMotion]);

    useEffect(() => {
      if (error && error !== lastError.current && !reduceMotion) {
        haptics.error();
        shake.setValue(0);
        Animated.sequence(
          [10, -8, 6, -4, 2, 0].map((toValue) =>
            Animated.timing(shake, { toValue, duration: 55, useNativeDriver: true }),
          ),
        ).start();
      }
      lastError.current = error;
    }, [error, reduceMotion, shake]);

    const handleFocus = useCallback<FocusHandler>(
      (event) => {
        setFocused(true);
        onFocus?.(event);
      },
      [onFocus],
    );

    const handleBlur = useCallback<BlurHandler>(
      (event) => {
        setFocused(false);
        onBlur?.(event);
      },
      [onBlur],
    );

    const handleClear = useCallback(() => {
      onChangeText?.("");
    }, [onChangeText]);

    return (
      <Animated.View style={[styles.container, containerStyle, { transform: [{ translateX: shake }] }]}>
        {label && !float ? (
          <Text style={styles.label} numberOfLines={1} {...textScale.dense}>
            {label}
          </Text>
        ) : null}

        <View style={styles.fieldWrap}>
          {/* Işıklı kenar: alanın ARKASINDA, 2px dışına taşan imza degradesi + parıltı.
              Alanın içinde olsaydı (web'de konumlu katman sonra boyanır) yazıyı ve ikonu örtüyordu. */}
          {!error ? (
            <Animated.View pointerEvents="none" style={[styles.glowRing, variant === "search" ? styles.fieldSearch : null, { opacity: focusAnim }]}>
              <LinearGradient
                colors={[colors.gradientSignature[0], colors.gradientSignature[1], colors.live]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[StyleSheet.absoluteFill, styles.glowGradient, variant === "search" ? styles.fieldSearch : null]}
              />
            </Animated.View>
          ) : null}
          <View
            style={[
              styles.field,
              variant === "search" ? styles.fieldSearch : null,
              multiline ? styles.fieldMultiline : { height },
              float ? styles.fieldFloat : null,
              focused && !error ? styles.fieldFocused : null,
              error ? styles.fieldError : null,
              rest.editable === false ? styles.fieldDisabled : null,
            ]}
          >
            {float && label ? (
              <Animated.Text
                pointerEvents="none"
                numberOfLines={1}
                style={[
                  styles.floatLabel,
                  icon ? styles.floatLabelWithIcon : null,
                  {
                    color: error ? colors.danger : focused ? colors.accentText : colors.textTertiary,
                    transform: [
                      { translateY: labelAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -11] }) },
                      { scale: labelAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0.76] }) },
                    ],
                  },
                ]}
                {...textScale.dense}
              >
                {label}
              </Animated.Text>
            ) : null}
            {icon ? (
              <Ionicons
                name={icon}
                size={16}
                color={error ? colors.danger : focused ? colors.brandAccent : colors.textTertiary}
              />
            ) : null}

            <TextInput
              {...rest}
              ref={ref}
              onChangeText={onChangeText}
              multiline={multiline}
              onFocus={handleFocus}
              onBlur={handleBlur}
              style={[styles.input, multiline ? styles.inputMultiline : null, float ? styles.inputFloat : null]}
              placeholder={float && !focused ? undefined : rest.placeholder}
              placeholderTextColor={colors.textTertiary}
              selectionColor={colors.brandAccent}
              cursorColor={colors.brandAccent}
              accessibilityLabel={rest.accessibilityLabel ?? label}
              allowFontScaling
              maxFontSizeMultiplier={1.3}
            />

            {variant === "search" && hasValue ? (
              <Touchable
                feedback="icon"
                haptic="none"
                onPress={handleClear}
                hitSlop={touchSlop(18)}
                accessibilityRole="button"
                accessibilityLabel="Aramayı temizle"
              >
                <Ionicons name="close-circle" size={18} color={colors.textTertiary} />
              </Touchable>
            ) : null}

            {trailing}
          </View>
        </View>

        {error ? (
          <Text style={styles.error} {...textScale.dense}>
            {error}
          </Text>
        ) : hint ? (
          <Text style={styles.hint} {...textScale.dense}>
            {hint}
          </Text>
        ) : null}
      </Animated.View>
    );
  }),
);

const styles = StyleSheet.create({
  container: {
    gap: space.s,
  },
  label: {
    ...type.h4,
    color: colors.textSecondary,
  },
  fieldWrap: {
    position: "relative",
  },
  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: space.md + space.xxs,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface1,
  },
  fieldFloat: {
    alignItems: "center",
  },
  glowRing: {
    position: "absolute",
    top: -2,
    left: -2,
    right: -2,
    bottom: -2,
    borderRadius: radius.md + 2,
    padding: 1.5,
    shadowColor: colors.glow,
    shadowOpacity: 0.55,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },
  glowGradient: {
    borderRadius: radius.md + 2,
  },
  floatLabel: {
    position: "absolute",
    left: space.md + space.xxs,
    top: 19,
    ...type.bodyLg,
    lineHeight: 20,
    fontFamily: fonts.medium,
    transformOrigin: "left center",
  },
  floatLabelWithIcon: {
    left: space.md + space.xxs + 16 + space.sm,
  },
  /* Değer, yukarı süzülen etiketin altında durur. */
  inputFloat: {
    paddingTop: 16,
  },
  fieldSearch: {
    borderRadius: radius.pill,
  },
  fieldMultiline: {
    minHeight: 88,
    alignItems: "flex-start",
    paddingVertical: space.md,
  },
  fieldFocused: {
    borderColor: "transparent",
  },
  fieldError: {
    borderColor: colors.danger,
  },
  fieldDisabled: {
    backgroundColor: colors.surface2,
    opacity: 0.7,
  },
  input: {
    flex: 1,
    ...type.bodyLg,
    /* 15px (iOS'ta odakta yakınlaşmayı önleyen eşik) ama tek satırlık alanda
       makale satır aralığı değil, sıkı satır yüksekliği. */
    lineHeight: 20,
    color: colors.textPrimary,
    padding: 0,
    // Web'de tarayıcının odak halkası alanın kendi kenarlığıyla çakışıyordu.
    ...({ outlineStyle: "none" } as object),
  },
  inputMultiline: {
    textAlignVertical: "top",
  },
  hint: {
    ...type.caption,
    color: colors.textTertiary,
  },
  error: {
    ...type.caption,
    color: colors.danger,
  },
});
