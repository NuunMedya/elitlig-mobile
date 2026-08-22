/**
 * ActionTile / ActionRow — "hızlı eylem" ızgarası.
 *
 * NEDEN VAR: Genel Bakış'ın ve Menü'nün üstündeki dört-beş kısayol (Kadro,
 * Maç Merkezi, Talepler, Kasa, Mesajlar) liste satırı olarak gösterilirse
 * beş satır × 48px = 240px yer kaplar ve ekranın yarısını yer. İkon ızgarası
 * aynı beş kısayolu 64px'te verir; kalan yer gerçek içeriğe kalır.
 *
 * ROZET KURALI: sayı rozeti yalnız "senin yapman gereken bir iş var" demek
 * içindir (bekleyen maç talebi, okunmamış mesaj). Bilgilendirme sayısı
 * (kadrodaki oyuncu sayısı) rozet DEĞİL, MetricTile işidir; rozetin anlamı
 * seyrekliğinden gelir.
 *
 * DOKUNMA HEDEFİ: kutu 64px yüksekliğinde ve en az 64px genişliğindedir;
 * ızgara beşten fazla öğe alırsa satır kaydırılabilir hâle gelmez, ikinci
 * satıra sarar — yatay kaydırma kısayolları gizler ve kimse aramaz.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { colors, elevate, radius, space, textScale, type } from "@/theme";
import { Touchable } from "./Pressable";

export interface ActionTileProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  /** İkon rengi — varsayılan `brandAccent`. */
  tone?: "brand" | "accent" | "live" | "warn" | "neutral";
  /** Sağ üstte sayı rozeti (0 ve altı çizilmez). */
  badge?: number;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const TONE_ICON: Record<NonNullable<ActionTileProps["tone"]>, string> = {
  brand: colors.brandAccent,
  accent: colors.accentText,
  live: colors.live,
  warn: colors.warn,
  neutral: colors.textSecondary,
};

export const ActionTile = React.memo(function ActionTile({
  icon,
  label,
  onPress,
  tone = "brand",
  badge,
  disabled,
  style,
  testID,
}: ActionTileProps) {
  const showBadge = typeof badge === "number" && badge > 0;

  return (
    <Touchable
      feedback="card"
      haptic="selection"
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={showBadge ? `${label}, ${badge} bekliyor` : label}
      style={[styles.tile, disabled ? styles.disabled : null, style]}
      testID={testID}
    >
      <Ionicons name={icon} size={24} color={disabled ? colors.textDisabled : TONE_ICON[tone]} />
      <Text style={styles.label} numberOfLines={1} {...textScale.badge}>
        {label}
      </Text>

      {showBadge ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText} {...textScale.badge}>
            {badge > 99 ? "99+" : badge}
          </Text>
        </View>
      ) : null}
    </Touchable>
  );
});

export interface ActionRowProps {
  children: React.ReactNode;
  /** Satır başına kutu sayısı — varsayılan 4. */
  columns?: 3 | 4 | 5;
  style?: StyleProp<ViewStyle>;
}

export const ActionRow = React.memo(function ActionRow({
  children,
  columns = 4,
  style,
}: ActionRowProps) {
  const items = React.Children.toArray(children).filter(Boolean);
  const rows: React.ReactNode[][] = [];
  for (let index = 0; index < items.length; index += columns) {
    rows.push(items.slice(index, index + columns));
  }

  return (
    <View style={[styles.row, style]}>
      {rows.map((row, rowIndex) => (
        <View key={rowIndex} style={styles.rowLine}>
          {row.map((child, columnIndex) => (
            <View key={columnIndex} style={styles.cell}>
              {child}
            </View>
          ))}
          {row.length < columns
            ? Array.from({ length: columns - row.length }, (_, index) => (
                <View key={`gap-${index}`} style={styles.cell} />
              ))
            : null}
        </View>
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  tile: {
    height: 82,
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
    paddingHorizontal: space.s,
    borderRadius: radius.lg,
    ...elevate(1),
  },
  disabled: {
    opacity: 0.5,
  },
  label: {
    ...type.bodySm,
    color: colors.textSecondary,
    textAlign: "center",
  },
  badge: {
    position: "absolute",
    top: 7,
    right: 7,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.live,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    ...type.micro,
    color: colors.textOnStatus,
  },
  row: {
    gap: space.sm,
  },
  rowLine: {
    flexDirection: "row",
    gap: space.sm,
  },
  cell: {
    flex: 1,
  },
});
