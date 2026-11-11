/**
 * Uygulama karoları — yönetim modunun başlatıcı parçaları.
 *
 *   `Rise`        tek seferlik giriş hareketi (aşağıdan yukarı + belirme);
 *                 sıra numarasına göre gecikir, "hareketi azalt"ta anında.
 *   `AppIconTile` çekmecedeki simge: yumuşak köşeli renkli pul + kısa ad.
 *   `AppCard`     ana ekrandaki büyük karo: pul, ad, canlı özet satırı, rozet.
 *
 * Renkler uygulamanın KİMLİĞİDİR (lib/adminApps.ts, lib/admin/toolApps.ts);
 * tema paleti yalnız kart yüzeyi ve metin içindir.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { Touchable, useReduceMotion } from "@/components/ui";
import type { AdminApp } from "@/lib/adminApps";
import { colors, duration, easing, hairline, radius, space, textScale, type } from "@/theme";

/* ─────────────────────────────── Rise ─────────────────────────────── */

export function Rise({
  index = 0,
  children,
  style,
}: {
  index?: number;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const reduceMotion = useReduceMotion();
  const progress = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;

  useEffect(() => {
    if (reduceMotion) {
      progress.setValue(1);
      return;
    }
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: duration.slow,
      delay: Math.min(index, 10) * 35,
      easing: easing.decelerate,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [index, progress, reduceMotion]);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: progress,
          transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

/* ───────────────────────────── AppIconTile ───────────────────────────── */

function countLabel(value: number | null | undefined): string | null {
  if (!value || value <= 0) return null;
  return value > 99 ? "99+" : String(value);
}

export const AppIconTile = React.memo(function AppIconTile({
  app,
  badge,
  onPress,
}: {
  app: AdminApp;
  badge?: number | null;
  onPress: (app: AdminApp) => void;
}) {
  const count = countLabel(badge);
  return (
    <Touchable
      feedback="card"
      haptic="selection"
      onPress={() => onPress(app)}
      accessibilityRole="button"
      accessibilityLabel={`${app.title}${count ? `, ${count} bekleyen` : ""}. ${app.tagline}`}
      style={styles.iconTile}
      testID={`admin-app-${app.key}`}
    >
      <View style={[styles.iconPlate, { backgroundColor: app.accentSoft }]}>
        <Ionicons name={app.icon} size={26} color={app.accent} />
        {count ? (
          <View style={styles.iconBadge}>
            <Text style={styles.iconBadgeText} {...textScale.badge}>
              {count}
            </Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.iconLabel} numberOfLines={1} {...textScale.dense}>
        {app.shortTitle}
      </Text>
    </Touchable>
  );
});

/* ─────────────────────────────── AppCard ─────────────────────────────── */

export const AppCard = React.memo(function AppCard({
  app,
  status,
  badge,
  alert,
  onPress,
}: {
  app: AdminApp;
  /** Karonun alt satırı: canlı özet ("3 açık iş") ya da kısa tanım. */
  status: string;
  badge?: number | null;
  /** Rozet kırmızı (gecikmiş iş, canlı maç). */
  alert?: boolean;
  onPress: (app: AdminApp) => void;
}) {
  const count = countLabel(badge);
  return (
    <Touchable
      feedback="card"
      haptic="selection"
      onPress={() => onPress(app)}
      accessibilityRole="button"
      accessibilityLabel={`${app.title}. ${status}`}
      style={styles.card}
      testID={`admin-card-${app.key}`}
    >
      <View style={styles.cardTop}>
        <View style={[styles.cardPlate, { backgroundColor: app.accentSoft }]}>
          <Ionicons name={app.icon} size={22} color={app.accent} />
        </View>
        {count ? (
          <View style={[styles.cardBadge, { backgroundColor: alert ? colors.live : app.accent }]}>
            <Text style={[styles.cardBadgeText, { color: alert ? colors.onDark : app.onAccent }]} {...textScale.badge}>
              {count}
            </Text>
          </View>
        ) : (
          <Ionicons name="arrow-forward" size={16} color={colors.textTertiary} />
        )}
      </View>
      <Text style={styles.cardTitle} numberOfLines={1} {...textScale.dense}>
        {app.title}
      </Text>
      <Text style={styles.cardStatus} numberOfLines={2} {...textScale.dense}>
        {status}
      </Text>
      {/* Uygulamanın kimlik çizgisi — karonun dibinde ince renkli bant. */}
      <View style={[styles.cardStripe, { backgroundColor: app.accent }]} />
    </Touchable>
  );
});

const styles = StyleSheet.create({
  iconTile: {
    alignItems: "center",
    gap: space.xs,
    paddingVertical: space.xs,
  },
  iconPlate: {
    width: 58,
    height: 58,
    borderRadius: radius.xxl,
    alignItems: "center",
    justifyContent: "center",
  },
  iconBadge: {
    position: "absolute",
    top: -4,
    right: -6,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.live,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.surface1,
  },
  iconBadgeText: {
    ...type.micro,
    letterSpacing: 0,
    color: colors.onDark,
  },
  iconLabel: {
    ...type.caption,
    color: colors.textPrimary,
    textAlign: "center",
  },

  card: {
    flex: 1,
    minHeight: 118,
    padding: space.md,
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
    overflow: "hidden",
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: space.sm,
  },
  cardPlate: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  cardBadge: {
    minWidth: 24,
    height: 24,
    paddingHorizontal: 7,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  cardBadgeText: {
    ...type.labelSm,
  },
  cardTitle: {
    ...type.h3,
    color: colors.textPrimary,
  },
  cardStatus: {
    ...type.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  cardStripe: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 3,
    opacity: 0.85,
  },
});
