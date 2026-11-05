/**
 * HIZLI İŞLEMLER — "her şey iki dokunuşta" ızgarası.
 *
 * Dört sütun, renkli ikon kareleri, iş varsa sayı rozeti. İlk karo VURGULU
 * "Teklif ver"dir (marka dolgusu): kullanıcının mobilde yapamadığını söylediği
 * iş, ana sayfanın en görünür düğmesi olur. Kalanlar başkanın haftalık
 * döngüsünün sırasıyla: maç al → maçlar → kadro → transfer …
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { Touchable, toneColors, type Tone } from "@/components/ui";
import { colors, hairline, radius, space, textScale, type } from "@/theme";

export interface QuickAction {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  href: string;
  tone: Tone;
  count?: number;
  /** Marka dolgulu vurgulu karo. */
  primary?: boolean;
}

export const QuickActions = React.memo(function QuickActions({ actions, go }: { actions: QuickAction[]; go: (href: string) => void }) {
  return (
    <View style={styles.grid}>
      {actions.map((action) => {
        const tc = toneColors(action.tone);
        return (
          <Touchable
            key={action.key}
            onPress={() => go(action.href)}
            feedback="card"
            haptic="selection"
            accessibilityRole="button"
            accessibilityLabel={action.count ? `${action.label}, ${action.count} bekleyen` : action.label}
            style={[styles.cell, action.primary && styles.cellPrimary]}
          >
            <View style={[styles.icon, { backgroundColor: action.primary ? colors.glassBorder : tc.dim }]}>
              <Ionicons name={action.icon} size={20} color={action.primary ? colors.textOnBrand : tc.fg} />
            </View>
            <Text style={[styles.label, action.primary && styles.labelPrimary]} numberOfLines={1} {...textScale.badge}>
              {action.label}
            </Text>
            {action.count ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText} {...textScale.badge}>
                  {action.count > 9 ? "9+" : action.count}
                </Text>
              </View>
            ) : null}
          </Touchable>
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  cell: {
    width: "23%",
    flexGrow: 1,
    alignItems: "center",
    gap: space.xs,
    paddingVertical: space.md,
    paddingHorizontal: space.xxs,
    borderRadius: radius.lg,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  cellPrimary: { backgroundColor: colors.brand, borderColor: colors.brand },
  icon: { width: 40, height: 40, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  label: { ...type.labelXs, color: colors.textPrimary },
  labelPrimary: { color: colors.textOnBrand },
  badge: {
    position: "absolute",
    top: space.xs,
    right: space.xs,
    minWidth: 18,
    height: 18,
    paddingHorizontal: space.xs,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.danger,
  },
  badgeText: { ...type.nano, color: colors.textOnStatus },
});
