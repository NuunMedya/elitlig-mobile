/**
 * Button — birincil ve ikincil eylem düğmesi (§4.30).
 *
 * VARYANT FELSEFESİ:
 *  - `primary` mor dolgudur ve bir ekranda TEK TANE bulunur; mor burada
 *    "yapılacak iş" demektir (§1.0: mor geniş yüzey doldurmaz, aksan olur).
 *  - `danger` DOLU KIRMIZI DEĞİLDİR: sönük zemin + kırmızı metin. Yıkıcı eylem
 *    sessiz görünür; asıl uyarıyı onay sheet'i verir. Dolu kırmızı bir düğme
 *    kullanıcıyı listede sürekli tedirgin eder.
 *
 * BASMA: `primary` zemin değiştirir (brandStrong), diğerleri opaklık düşürür
 * (§5.2). `loading` sırasında GENİŞLİK KORUNUR — etiket görünmez olur ve
 * göstergesi üstüne biner; düğmenin zıplaması yerleşimi bozar.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import {
  colors,
  fonts,
  hairline,
  radius,
  space,
  textScale,
  touchSlop,
  type,
} from "@/theme";
import { Touchable, type HapticKind } from "./Pressable";

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  /** 32 / 40 / 48 — varsayılan "md". */
  size?: "sm" | "md" | "lg";
  icon?: keyof typeof Ionicons.glyphMap;
  iconPosition?: "left" | "right";
  /** Metin yerine ActivityIndicator; genişlik korunur. */
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  /** Varsayılan: primary → "medium", diğerleri → "light". */
  haptic?: "none" | "light" | "medium" | "success";
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
}

const HEIGHTS = { sm: 32, md: 40, lg: 48 } as const;

export const Button = React.memo(function Button({
  label,
  onPress,
  variant = "primary",
  size = "md",
  icon,
  iconPosition = "left",
  loading,
  disabled,
  fullWidth,
  haptic,
  style,
  accessibilityLabel,
  accessibilityHint,
  testID,
}: ButtonProps) {
  const height = HEIGHTS[size];
  const isDisabled = Boolean(disabled || loading);

  const boxStyle: ViewStyle =
    variant === "primary"
      ? { backgroundColor: colors.brand }
      : variant === "secondary"
        ? { backgroundColor: colors.surface2, borderWidth: hairline, borderColor: colors.border }
        : variant === "danger"
          ? { backgroundColor: colors.dangerDim }
          : { backgroundColor: "transparent" };

  const fg =
    variant === "primary"
      ? colors.textOnBrand
      : variant === "danger"
        ? colors.danger
        : variant === "ghost"
          ? colors.brandAccent
          : colors.textPrimary;

  const labelStyle: StyleProp<TextStyle> = [
    size === "lg" ? styles.labelLg : size === "sm" ? styles.labelSm : styles.labelMd,
    { color: fg },
    loading ? styles.labelHidden : null,
  ];

  const iconNode = icon ? (
    <Ionicons name={icon} size={size === "lg" ? 18 : 16} color={fg} style={loading ? styles.labelHidden : null} />
  ) : null;

  const effectiveHaptic: HapticKind = haptic ?? (variant === "primary" ? "medium" : "light");

  return (
    <Touchable
      // primary yalnız zemin değiştirir; diğerleri opaklıkla söner.
      feedback={variant === "primary" ? "none" : "button"}
      pressedStyle={variant === "primary" ? styles.primaryPressed : undefined}
      haptic={isDisabled ? "none" : effectiveHaptic}
      onPress={onPress}
      disabled={isDisabled}
      hitSlop={size === "sm" ? touchSlop(height) : undefined}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: isDisabled, busy: Boolean(loading) }}
      testID={testID}
      style={[
        styles.base,
        {
          height,
          paddingHorizontal: size === "sm" ? space.m : size === "lg" ? space.xl : space.lg,
        },
        boxStyle,
        fullWidth ? styles.fullWidth : null,
        disabled ? styles.disabled : null,
        style,
      ]}
    >
      {iconPosition === "left" ? iconNode : null}
      <Text style={labelStyle} numberOfLines={1} {...textScale.dense}>
        {label}
      </Text>
      {iconPosition === "right" ? iconNode : null}

      {loading ? (
        <View pointerEvents="none" style={styles.loadingLayer}>
          <ActivityIndicator size="small" color={fg} />
        </View>
      ) : null}
    </Touchable>
  );
});

const styles = StyleSheet.create({
  base: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.s,
    borderRadius: radius.md,
    alignSelf: "flex-start",
  },
  fullWidth: {
    alignSelf: "stretch",
    width: "100%",
  },
  primaryPressed: {
    backgroundColor: colors.brandStrong,
  },
  disabled: {
    opacity: 0.45,
  },
  labelSm: {
    ...type.label,
    fontFamily: fonts.bold,
  },
  labelMd: {
    ...type.bodySm,
    fontFamily: fonts.bold,
  },
  labelLg: {
    ...type.h3,
  },
  /** Yükleniyorken etiket görünmez olur ama YERİNİ KORUR. */
  labelHidden: {
    opacity: 0,
  },
  loadingLayer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
});
