/**
 * Divider — hairline ayraç (§3.4 / §4.26).
 *
 * KURAL: bir grup içindeki satırlar arasında `inset` ayraç bulunur, grubun SON
 * satırından sonra ayraç YOKTUR, gruplar arasında 8px zemin boşluğu
 * (`section`) kalır. Bu, "lige göre bloklar" görüntüsünü üretir; kalın çizgi
 * ya da her satırda tam genişlik ayraç kullanmak listeyi kafeslere böler.
 *
 * Ölçüler theme/elevation.ts içindeki `dividers` sözlüğünden gelir; burada
 * yalnızca varyant seçimi ve etiketli ("── VEYA ──") biçim vardır.
 */

import React from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { colors, dividers, hairline, space, textScale, type } from "@/theme";

export interface DividerProps {
  variant?: "full" | "inset" | "insetAvatar" | "insetTime" | "section";
  vertical?: boolean;
  /** Ortada metin: "── VEYA ──" */
  label?: string;
  color?: string;
  style?: StyleProp<ViewStyle>;
}

export const Divider = React.memo(function Divider({
  variant = "full",
  vertical,
  label,
  color,
  style,
}: DividerProps) {
  if (label) {
    const line = [styles.labelLine, color ? { backgroundColor: color } : null];
    return (
      <View accessible={false} style={[styles.labelRow, style]}>
        <View style={line} />
        <Text style={styles.labelText} {...textScale.badge}>
          {label}
        </Text>
        <View style={line} />
      </View>
    );
  }

  if (vertical) {
    return (
      <View
        accessible={false}
        style={[dividers.vertical, color ? { backgroundColor: color } : null, style]}
      />
    );
  }

  return (
    <View
      accessible={false}
      style={[
        dividers[variant],
        color && variant !== "section" ? { backgroundColor: color } : null,
        style,
      ]}
    />
  );
});

const styles = StyleSheet.create({
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  labelLine: {
    flex: 1,
    height: hairline,
    backgroundColor: colors.separator,
  },
  labelText: {
    ...type.micro,
    color: colors.textTertiary,
  },
});
