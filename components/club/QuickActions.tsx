/**
 * HIZLI ERİŞİM — Yönetim sekmesinin en üst bloğu: rolün asıl araçları TEK
 * dokunuşta.
 *
 * NE: dört sütunlu sıkı ızgara; her hücre tonlu ikon pulu + kısa etiket.
 * Rozet GERÇEK sayıdır (bekleyen başvuru, açık teklif…); sıfırsa çizilmez.
 *
 * NEDEN HubGrid DEĞİL: HubGrid karosu iki satır açıklama taşır ve ekranın
 * yarısını kaplar; burada amaç "nereye gideceğimi biliyorum, hemen gideyim"
 * kullanıcısıdır. Açıklama yerine erişilebilirlik etiketi (`hint`) kalır.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";
import { Touchable, toneColors, type Tone } from "@/components/ui";
import { colors, elevate, fonts, hairline, layout, radius, space, textScale, type } from "@/theme";

export interface QuickAction {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  /** Tek kelimelik etiket: "Kadro", "Maç al". */
  label: string;
  href: string;
  tone?: Tone;
  /** Bekleyen iş sayısı; 0/undefined ise rozet yok. */
  badge?: number;
  /** Ekran okuyucu için kısa bağlam: "3 başvuru bekliyor". */
  hint?: string;
}

/** Satırdaki hücre sayısı — 360px'te bile etiket tek satıra sığar. */
const COLUMNS = 4;
const PIP = 34;

export const QuickActions = React.memo(function QuickActions({
  actions,
  go,
  style,
}: {
  actions: QuickAction[];
  go: (href: string) => void;
  style?: StyleProp<ViewStyle>;
}) {
  if (!actions.length) return null;
  return (
    <View style={[styles.card, style]}>
      {actions.map((action) => (
        <QuickCell key={action.key} action={action} go={go} />
      ))}
    </View>
  );
});

const QuickCell = React.memo(function QuickCell({
  action,
  go,
}: {
  action: QuickAction;
  go: (href: string) => void;
}) {
  const palette = toneColors(action.tone ?? "brand");
  const count = action.badge && action.badge > 0 ? action.badge : 0;
  return (
    <Touchable
      feedback="card"
      haptic="selection"
      onPress={() => go(action.href)}
      accessibilityRole="button"
      accessibilityLabel={[action.label, count ? `${count} bekleyen` : null, action.hint].filter(Boolean).join(", ")}
      style={styles.cell}
    >
      <View style={[styles.pip, { backgroundColor: palette.dim }]}>
        <Ionicons name={action.icon} size={17} color={palette.fg} />
        {count ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText} {...textScale.badge}>
              {count > 99 ? "99+" : count}
            </Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.label} numberOfLines={1} {...textScale.badge}>
        {action.label}
      </Text>
    </Touchable>
  );
});

const styles = StyleSheet.create({
  card: {
    ...elevate(1),
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: layout.screenPadding,
    paddingVertical: space.s,
    borderRadius: radius.lg,
    borderWidth: hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface1,
  },
  cell: {
    width: `${100 / COLUMNS}%`,
    alignItems: "center",
    gap: space.xs,
    paddingVertical: space.s,
    paddingHorizontal: space.xxs,
  },
  pip: {
    width: PIP,
    height: PIP,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    top: -space.xs,
    right: -space.s,
    minWidth: 16,
    height: 16,
    paddingHorizontal: space.xs,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brand,
    borderWidth: hairline,
    borderColor: colors.surface1,
  },
  badgeText: {
    ...type.micro,
    fontSize: 9,
    lineHeight: 12,
    letterSpacing: 0,
    fontFamily: fonts.semibold,
    color: colors.textOnBrand,
  },
  label: {
    ...type.caption,
    color: colors.textSecondary,
  },
});
