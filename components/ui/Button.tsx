/**
 * Button — birincil ve ikincil eylem düğmesi (Arena).
 *
 * VARYANT FELSEFESİ:
 *  - `primary` DÜZ marka dolgusudur ve bir ekranda TEK TANE bulunur. Gradyan
 *    ve renkli gölge kaldırıldı: Arena'da renk sinyaldir, süs değil. Düz
 *    menekşe zemin kâğıdın üstünde zaten en yüksek kontrastlı öğedir; ışık
 *    efekti onu yalnız "reklam düğmesi"ne çeviriyordu. Basılıyken bir kademe
 *    koyulaşır (`brandStrong`).
 *  - `secondary` beyaz kâğıt + hairline kenarlıktır: gri kâğıtta beyaz bir
 *    hap, beyaz kartta çerçeveli bir hap — iki zeminde de ayrışır.
 *  - `ghost` yalnız marka renginde metindir (satır içi eylem).
 *  - `danger` DOLU KIRMIZI DEĞİLDİR: sönük zemin + kırmızı metin. Yıkıcı eylem
 *    sessiz görünür; asıl uyarıyı onay sheet'i verir.
 *  - `onDark`: sahne (grafit) üstünde ikincil düğme cam pul (`inkPill`),
 *    hayalet düğme beyaz metin olur.
 *
 * BİÇİM: tam hap (`radius.pill`) — Arena'da düğme ve çip aynı eğri ailesidir,
 * kartlar (18) ve iç elemanlar (12) köşelidir; böylece "basılabilir" olan şey
 * biçiminden de okunur.
 *
 * ÖLÇÜ: 38 / 44 / 52. `md` ve `lg` 44px'lik dokunma tabanını kendi başına
 * karşılar; `sm` `touchSlop` ile tamamlanır.
 *
 * `loading` sırasında GENİŞLİK KORUNUR — etiket görünmez olur ve göstergesi
 * üstüne biner; düğmenin zıplaması yerleşimi bozar.
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
  /** 38 / 44 / 52 — varsayılan "md". */
  size?: "sm" | "md" | "lg";
  icon?: keyof typeof Ionicons.glyphMap;
  iconPosition?: "left" | "right";
  /** Metin yerine ActivityIndicator; genişlik korunur. */
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  /**
   * Mürekkep blok üstünde mi. `secondary` cam bir pula, `ghost` beyaz metne
   * döner; `primary` ve `danger` iki zeminde de aynıdır.
   */
  onDark?: boolean;
  /** Varsayılan: primary → "medium", diğerleri → "light". */
  haptic?: "none" | "light" | "medium" | "success";
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
}

const HEIGHTS = { sm: 38, md: 44, lg: 52 } as const;

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
  onDark = false,
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
        ? onDark
          ? { backgroundColor: colors.inkPill, borderWidth: hairline, borderColor: colors.inkPillBorder }
          : { backgroundColor: colors.surface1, borderWidth: hairline, borderColor: colors.borderStrong }
        : variant === "danger"
          ? { backgroundColor: colors.dangerDim }
          : { backgroundColor: "transparent" };

  /* Basılı zemin: dolu varyantlar bir kademe koyulaşır; opaklık sönmesi
     (Touchable "button") bunun üstüne biner. */
  const pressedBox: ViewStyle | undefined =
    variant === "primary"
      ? { backgroundColor: colors.brandStrong }
      : variant === "secondary" && !onDark
        ? { backgroundColor: colors.pressed }
        : undefined;

  const fg =
    variant === "primary"
      ? colors.textOnBrand
      : variant === "danger"
        ? colors.danger
        : onDark
          ? colors.onDark
          : variant === "ghost"
            ? colors.brandAccent
            : colors.textPrimary;

  const labelStyle: StyleProp<TextStyle> = [
    size === "lg" ? styles.labelLg : size === "sm" ? styles.labelSm : styles.labelMd,
    { color: fg },
    loading ? styles.labelHidden : null,
  ];

  const iconNode = icon ? (
    <Ionicons
      name={icon}
      size={size === "lg" ? 18 : size === "sm" ? 14 : 16}
      color={fg}
      style={loading ? styles.labelHidden : null}
    />
  ) : null;

  const effectiveHaptic: HapticKind = haptic ?? (variant === "primary" ? "medium" : "light");

  return (
    <Touchable
      feedback="button"
      haptic={isDisabled ? "none" : effectiveHaptic}
      onPress={onPress}
      disabled={isDisabled}
      hitSlop={height < 44 ? touchSlop(height) : undefined}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: isDisabled, busy: Boolean(loading) }}
      testID={testID}
      pressedStyle={pressedBox}
      style={[
        styles.base,
        {
          height,
          paddingHorizontal: size === "sm" ? space.md + space.xxs : size === "lg" ? space.xl : space.lg,
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
    borderRadius: radius.pill,
    alignSelf: "flex-start",
  },
  fullWidth: {
    alignSelf: "stretch",
    width: "100%",
  },
  /* Pasif düğme rengini korur ama söner: "burada bir eylem var, şu an
     kapalı" der — gri bir kutu eylemin kendisini de gizlerdi. */
  disabled: {
    opacity: 0.4,
  },
  /* Düğme etiketleri tek ailede (Inter SemiBold) kalır: Archivo rakam ailesidir,
     düğme metninde kullanılınca arayüz iki sesle konuşmuş oluyordu. */
  labelSm: {
    ...type.label,
  },
  labelMd: {
    ...type.h3,
  },
  labelLg: {
    ...type.h2,
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
