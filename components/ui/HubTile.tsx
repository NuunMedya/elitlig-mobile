/**
 * HubTile / HubGrid — merkez ekranların (Kulübüm, Profil) iki sütunlu kapı ızgarası.
 *
 * NEDEN LİSTE SATIRI DEĞİL: Kulübüm'deki araçlar (kadro, transfer, maç al,
 * kasa…) birbirinin alternatifi değil, aynı kulübün ayrı işleri. Uzun bir satır
 * listesinde hepsi aynı ağırlıkta okunuyor ve en sık kullanılan iş listenin
 * altında kalabiliyordu. Izgarada her iş kendi karosunda, ikonu renkli bir
 * pulda ve bekleyen sayısı köşede durur: göz önce rozeti olan karoya gider.
 *
 * ROZET MENEKŞEDİR, KIRMIZI DEĞİL: Arena'da kırmızı (`live`) yalnız "canlı"
 * demektir. Bekleyen iş bir EYLEM çağrısıdır ve eylemin rengi `brand`dir;
 * sekiz karonun dördünde kırmızı rozet, ekranı bir alarm panosuna çeviriyordu.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";
import { colors, elevate, layout, radius, space, textScale, type } from "@/theme";
import { GradientFill } from "./GradientFill";
import { IconTile, type IconTileTone } from "./NightKit";
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

/** Tonun degrade ikon kutusu karşılığı (Gece teması: renkli kutu + beyaz ikon). */
const TILE_TONE: Record<HubTone, IconTileTone> = {
  brand: "violet",
  accent: "cyan",
  live: "pink",
  warn: "gold",
  win: "mint",
  info: "cyan",
  neutral: "neutral",
  danger: "red",
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
  const tileTone = TILE_TONE[tone];
  return (
    <Touchable
      feedback="card"
      haptic="selection"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}${subtitle ? `, ${subtitle}` : ""}${badge ? `, ${badge} bekleyen` : ""}`}
      style={[styles.tile, style]}
    >
      <GradientFill radius="xl" />
      {/* Köşedeki tonlu ışık: karonun kimliği renginden de okunur. */}
      <View style={[styles.corner, { backgroundColor: palette.bg }]} pointerEvents="none" />
      <View style={styles.top}>
        <IconTile icon={icon} tone={tileTone} size={40} />
        {badge ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText} {...textScale.badge}>
              {badge > 99 ? "99+" : badge}
            </Text>
          </View>
        ) : (
          <View style={styles.arrow}>
            <Ionicons name="arrow-forward" size={13} color={palette.fg} />
          </View>
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
/**
 * `inset` (varsayılan "inset"): ızgara ekran kenar payıyla çizilir; zaten
 * kenar boşluklu bir kapsayıcının içinde "flush" verilir (SectionHeader ile
 * aynı sözleşme).
 */
export function HubGrid({
  children,
  style,
  inset = "inset",
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  inset?: "inset" | "flush";
}) {
  const items = React.Children.toArray(children).filter(Boolean);
  const rows: React.ReactNode[][] = [];
  for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2));
  return (
    <View style={[styles.grid, inset === "flush" ? styles.gridFlush : null, style]}>
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
  gridFlush: {
    paddingHorizontal: 0,
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
    minHeight: 96,
    padding: space.md,
    gap: space.xs,
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.glassLine,
    overflow: "hidden",
  },
  corner: {
    position: "absolute",
    right: -40,
    top: -40,
    width: 110,
    height: 110,
    borderRadius: radius.pill,
    opacity: 0.7,
  },
  arrow: {
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface3,
  },
  top: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: space.s,
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: space.s,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    ...type.micro,
    color: colors.textOnBrand,
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
