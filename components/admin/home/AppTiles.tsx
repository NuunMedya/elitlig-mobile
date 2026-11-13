/**
 * Uygulama karoları — yönetim modunun başlatıcı parçaları.
 *
 *   `Rise`        tek seferlik giriş hareketi (aşağıdan yukarı + belirme);
 *                 sıra numarasına göre gecikir, "hareketi azalt"ta anında.
 *   `AppIconTile` ızgara simgesi: degrade IconTile + kısa ad (+ rozet).
 *   `AppCard`     ana ekrandaki büyük karo: IconTile, ad, canlı özet, rozet,
 *                 dipte kategori renginde ince degrade çizgi.
 *   `AppListRow`  çekmece satırı: IconTile + ad + tek satırlık açıklama.
 *   `appTone`     uygulama anahtarı → IconTile tonu (kategori rengi).
 *
 * YÖNETİM TASARIM DİLİ (özet — ayrıntı components/admin/AdminScreen.tsx):
 *   · Kimlik ve sayaç sahneleri `gradientAdminStage` + `<Aurora variant="stage">`
 *     üzerinde beyaz metin; altın (`adminAccent`) yalnız "yönetim" işaretidir.
 *   · Uygulama/kategori kimliği `IconTile` tonudur — dolgu degrade, ikon beyaz.
 *     Uygulamanın kendi vurgu rengi (lib/adminApps) metin/rozet için kalır.
 *   · Rakamlar Archivo (type.metric*, score*) ve döner (`Odometer`).
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { IconTile, Touchable, useReduceMotion, type IconTileTone } from "@/components/ui";
import type { AdminApp } from "@/lib/adminApps";
import { colors, duration, easing, hairline, radius, space, spring, textScale, type } from "@/theme";

/* ─────────────────────────────── Ton ─────────────────────────────── */

/**
 * Uygulama → IconTile tonu. Renk kategori söyler: para nane, iş mor, proje
 * camgöbeği, iletişim pembe, lig imza degradesi, yayın kırmızı, onay altın.
 */
const APP_TONES: Record<string, IconTileTone> = {
  muhasebe: "mint",
  gorevler: "violet",
  projeler: "cyan",
  mesajlar: "pink",
  lig: "signature",
  studyo: "red",
  talepler: "gold",
  maclar: "mint",
  sahalar: "cyan",
  ajanda: "pink",
  "not-defteri": "gold",
  tablolar: "mint",
  rehber: "cyan",
  "hesap-araclari": "neutral",
  "odak-sayaci": "red",
};

export function appTone(key: string): IconTileTone {
  return APP_TONES[key] ?? "violet";
}

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

/** Simgenin yaylı "patlayarak" girişi — çekmece açılışında ızgara bununla dolar. */
export function Pop({ index = 0, children, style }: { index?: number; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const reduceMotion = useReduceMotion();
  const progress = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;
  useEffect(() => {
    if (reduceMotion) {
      progress.setValue(1);
      return;
    }
    const animation = Animated.sequence([
      Animated.delay(Math.min(index, 14) * 28),
      Animated.spring(progress, { toValue: 1, ...spring.bounce }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [index, progress, reduceMotion]);
  return (
    <Animated.View
      style={[
        style,
        {
          opacity: progress.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0, 1, 1], extrapolate: "clamp" }),
          transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) }],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

/* ───────────────────────────── Rozet ───────────────────────────── */

function countLabel(value: number | null | undefined): string | null {
  if (!value || value <= 0) return null;
  return value > 99 ? "99+" : String(value);
}

/** Karonun köşesindeki sayı — `alert` canlı/gecikme (pembe), değilse marka moru. */
function CountBubble({ count, alert, ring = colors.surface1 }: { count: string; alert?: boolean; ring?: string }) {
  return (
    <View style={[styles.bubble, { borderColor: ring, backgroundColor: alert ? colors.live : colors.brand }]}>
      <Text style={styles.bubbleText} {...textScale.badge}>
        {count}
      </Text>
    </View>
  );
}

/* ───────────────────────────── AppIconTile ───────────────────────────── */

export const AppIconTile = React.memo(function AppIconTile({
  app,
  badge,
  onPress,
  size = 52,
}: {
  app: AdminApp;
  badge?: number | null;
  onPress: (app: AdminApp) => void;
  /** IconTile kenarı (varsayılan 52). */
  size?: number;
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
      <View>
        <IconTile icon={app.icon} tone={appTone(app.key)} size={size} />
        {count ? (
          <View style={styles.iconBadge}>
            <CountBubble count={count} />
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
  /** Rozet pembe (gecikmiş iş, canlı maç). */
  alert?: boolean;
  onPress: (app: AdminApp) => void;
}) {
  const count = countLabel(badge);
  const tone = appTone(app.key);
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
        <IconTile icon={app.icon} tone={tone} size={40} />
        {count ? (
          <View style={[styles.cardCount, alert ? styles.cardCountAlert : null]}>
            {alert ? <View style={styles.cardCountDot} /> : null}
            <Text style={[styles.cardCountText, alert ? styles.cardCountTextAlert : null]} {...textScale.badge}>
              {count}
            </Text>
          </View>
        ) : (
          <Ionicons name="arrow-forward" size={16} color={colors.textTertiary} />
        )}
      </View>
      <View style={styles.cardTexts}>
        <Text style={styles.cardTitle} numberOfLines={1} {...textScale.dense}>
          {app.title}
        </Text>
        <Text style={[styles.cardStatus, alert ? styles.cardStatusAlert : null]} numberOfLines={2} {...textScale.dense}>
          {status}
        </Text>
      </View>
      {/* Kategori çizgisi — karonun dibinde IconTile tonunda ince degrade. */}
      <LinearGradient
        colors={colors.tileTones[tone]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={styles.cardStripe}
        pointerEvents="none"
      />
    </Touchable>
  );
});

/* ─────────────────────────────── AppListRow ─────────────────────────────── */

export const AppListRow = React.memo(function AppListRow({
  app,
  badge,
  onPress,
  last,
}: {
  app: AdminApp;
  badge?: number | null;
  onPress: (app: AdminApp) => void;
  last?: boolean;
}) {
  const count = countLabel(badge);
  return (
    <Touchable
      feedback="row"
      haptic="selection"
      onPress={() => onPress(app)}
      accessibilityRole="button"
      accessibilityLabel={`${app.title}${count ? `, ${count} bekleyen` : ""}. ${app.tagline}`}
      style={[styles.row, last ? null : styles.rowDivided]}
      testID={`admin-app-row-${app.key}`}
    >
      <IconTile icon={app.icon} tone={appTone(app.key)} size={38} glow={false} />
      <View style={styles.rowTexts}>
        <Text style={styles.rowTitle} numberOfLines={1} {...textScale.dense}>
          {app.title}
        </Text>
        <Text style={styles.rowSub} numberOfLines={1} {...textScale.dense}>
          {app.tagline}
        </Text>
      </View>
      {count ? <CountBubble count={count} ring="transparent" /> : <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />}
    </Touchable>
  );
});

const styles = StyleSheet.create({
  bubble: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
  },
  bubbleText: {
    ...type.micro,
    letterSpacing: 0,
    color: colors.onDark,
  },

  iconTile: {
    alignItems: "center",
    gap: space.s,
    paddingVertical: space.xs,
  },
  iconBadge: {
    position: "absolute",
    top: -6,
    right: -8,
  },
  iconLabel: {
    ...type.labelSm,
    color: colors.textPrimary,
    textAlign: "center",
  },

  card: {
    flex: 1,
    minHeight: 132,
    padding: space.md,
    paddingBottom: space.lg,
    gap: space.md,
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
    overflow: "hidden",
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  cardTexts: {
    gap: space.xxs,
  },
  cardCount: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    minWidth: 26,
    height: 24,
    paddingHorizontal: space.s,
    borderRadius: radius.pill,
    justifyContent: "center",
    backgroundColor: colors.brandDim,
  },
  cardCountAlert: {
    backgroundColor: colors.liveDim,
  },
  cardCountDot: {
    width: 6,
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.live,
  },
  cardCountText: {
    ...type.numSmStrong,
    color: colors.brandAccent,
  },
  cardCountTextAlert: {
    color: colors.live,
  },
  cardTitle: {
    ...type.h3,
    color: colors.textPrimary,
  },
  cardStatus: {
    ...type.caption,
    color: colors.textSecondary,
  },
  cardStatusAlert: {
    color: colors.live,
  },
  cardStripe: {
    position: "absolute",
    left: space.md,
    right: space.md,
    bottom: 0,
    height: 3,
    borderTopLeftRadius: radius.pill,
    borderTopRightRadius: radius.pill,
  },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    minHeight: 60,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  rowDivided: {
    borderBottomWidth: hairline,
    borderBottomColor: colors.separator,
  },
  rowTexts: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    ...type.h4,
    color: colors.textPrimary,
  },
  rowSub: {
    ...type.caption,
    color: colors.textTertiary,
  },
});
