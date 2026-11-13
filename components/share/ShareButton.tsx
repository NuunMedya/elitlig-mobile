/**
 * Paylaşım stüdyosunu açan küçük hap — başlık eylemleri dolu olan
 * sayfalarda (lig merkezi: zil · ara · sabitle · takip) başlığın altındaki
 * banda konur. Etiketli: ikon tek başına "metin paylaş" sanılıyordu, burada
 * bir GÖRSEL üretildiği söylenir.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React from "react";
import { StyleSheet, Text, type StyleProp, type ViewStyle } from "react-native";

import { Touchable } from "@/components/ui";
import { colors, hairline, radius, space, textScale, type } from "@/theme";

export function ShareButton({
  onPress,
  label = "Paylaş",
  accessibilityLabel,
  style,
}: {
  onPress: () => void;
  label?: string;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Touchable
      feedback="chip"
      haptic="light"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      style={[styles.pill, style]}
      hitSlop={6}
    >
      <Ionicons name="image-outline" size={15} color={colors.brandAccent} />
      <Text style={styles.label} {...textScale.dense}>
        {label}
      </Text>
    </Touchable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    height: 34,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    backgroundColor: colors.brandDim,
    borderWidth: hairline,
    borderColor: colors.brandBorder,
  },
  label: {
    ...type.labelSm,
    color: colors.brandAccent,
  },
});
