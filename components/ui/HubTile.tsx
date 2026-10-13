/**
 * HubTile / HubGrid — merkez ekranların (Kulübüm, Profil) iki sütunlu kapı ızgarası.
 *
 * NEDEN LİSTE SATIRI DEĞİL: Kulübüm'deki araçlar (kadro, transfer, maç al,
 * kasa…) birbirinin alternatifi değil, aynı kulübün ayrı işleri. Uzun bir satır
 * listesinde hepsi aynı ağırlıkta okunuyor ve en sık kullanılan iş listenin
 * altında kalabiliyordu. Izgarada her iş kendi karosunda, ikonu renkli bir
 * pulda ve bekleyen sayısı köşede durur: göz önce rozeti olan karoya gider.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";
import { colors, elevate, layout, radius, space, textScale, type } from "@/theme";
import { Touchable } from "./Pressable";

export type HubTone = "brand" | "accent" | "live" | "warn" | "win" | "info" | "neutral" | "danger";

const TONE: Record<HubTone, { fg: string; bg: string }> = {
  brand: { fg: colors.brandAccent, bg: colors.brandDim },
  accent: { fg: colors.accentText, bg: colors.accentDim },
  live: { fg: colors.live, bg: colors.liveDim },
  warn: { fg: colors.warn, bg: colors.warnDim },
  win: { fg: colors.win, bg: colors.winDim },
  info: { fg: colors.info, bg: colors.infoDim },
  neutral: { fg: colors.textSecondary, bg: colors.surface3 },
  danger: { fg: colors.danger, bg: colors.dangerDim },
};

export interface HubTileProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  tone?: HubTone;
  /** Bekleyen iş sayısı — 0 ya da boşsa çizilmez. */
  badge?: number | null;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}

export const HubTile = React.memo(function HubTile({
  icon,
  title,
  subtitle,
  tone = "brand",
  badge,
  onPress,
  style,
}: HubTileProps) {
  const palette = TONE[tone];
  return (
    <Touchable
      feedback="card"
      haptic="selection"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}${subtitle ? `, ${subtitle}` : ""}${badge ? `, ${badge} bekleyen` : ""}`}
      style={[styles.tile, style]}
    >
      <View style={styles.top}>
        <View style={[styles.icon, { backgroundColor: palette.bg }]}>
          <Ionicons name={icon} size={20} color={palette.fg} />
        </View>
        {badge ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText} {...textScale.badge}>
              {badge > 99 ? "99+" : badge}
            </Text>
          </View>
        ) : (
          <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
        )}
      </View>
      <Text style={styles.title} numberOfLines={1} {...textScale.dense}>
        {title}
      </Text>
      {subtitle ? (
        <Text style={styles.subtitle} numberOfLines={2} {...textScale.dense}>
          {subtitle}
        </Text>
      ) : null}
    </Touchable>
  );
});

/** İki sütunlu ızgara; tek kalan karo yarım genişlikte kalır (hizası bozulmaz). */
export function HubGrid({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const items = React.Children.toArray(children).filter(Boolean);
  const rows: React.ReactNode[][] = [];
  for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2));
  return (
    <View style={[styles.grid, style]}>
      {rows.map((row, index) => (
        <View key={index} style={styles.row}>
          {row.map((child, j) => (
            <View key={j} style={styles.cell}>
              {child}
            </View>
          ))}
          {row.length === 1 ? <View style={styles.cell} /> : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    paddingHorizontal: layout.screenPadding,
    gap: space.m,
  },
  row: {
    flexDirection: "row",
    gap: space.m,
  },
  cell: {
    flex: 1,
  },
  tile: {
    ...elevate(1),
    flex: 1,
    minHeight: 104,
    padding: space.md,
    gap: space.xs,
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  top: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: space.xs,
  },
  icon: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: space.s,
    borderRadius: radius.pill,
    backgroundColor: colors.live,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    ...type.micro,
    color: colors.textOnStatus,
  },
  title: {
    ...type.h3,
    color: colors.textPrimary,
  },
  subtitle: {
    ...type.bodySm,
    color: colors.textTertiary,
  },
});
