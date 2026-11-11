/**
 * ARAÇ UYGULAMASI KABUĞU — "her araç kendi uygulaması" hissinin parçaları.
 *
 *   ToolAppHeader  uygulama başlığı: geri · renkli simge pulu · ad + canlı özet
 *                  · eylemler; altında araç içi bölüm sekmeleri (`tabs`).
 *   ToolTabs       araç içi gezinme: kaydırılabilir hap sekmeler (ikon + sayaç),
 *                  seçili olan aracın vurgu rengiyle dolar.
 *   ToolFab        aracın TEK birincil eylemi (yeni kayıt, yeni görev, hızlı
 *                  not…) — vurgu renginde yüzen düğme.
 *   ToolSummary    ekranın tepesindeki rakam şeridi (rakam kahramandır).
 *
 * Kimlik (ad, simge, vurgu) lib/admin/toolApps.ts'ten gelir. Kabuk, ortak
 * AdminScreen'e `app="muhasebe"` verilerek açılır; ekranlar bu dosyayı yalnız
 * sekme, FAB ve özet için içe aktarır.
 *
 * HAREKET: simge pulu ve FAB ekrana 220 ms'lik tek bir yayla girer (yerel
 * sürücü); "hareketi azalt" açıksa hiçbir şey oynamaz. Döngü yoktur.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import React, { useEffect, useRef } from "react";
import { Animated, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Badge, Touchable, useReduceMotion, type ScreenHeaderAction } from "@/components/ui";
import { TOOL_APPS, type ToolApp, type ToolAppKey } from "@/lib/admin/toolApps";
import { colors, duration, easing, elevate, hairline, layout, radius, space, spring, textScale, touchSlop, type } from "@/theme";

/** Giriş hareketi: 0 → 1; hareket azaltılmışsa doğrudan 1. */
function useEnter(delay = 0): Animated.Value {
  const reduce = useReduceMotion();
  const value = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduce) {
      value.setValue(1);
      return;
    }
    const anim = Animated.timing(value, { toValue: 1, duration: duration.base, delay, easing: easing.decelerate, useNativeDriver: true });
    anim.start();
    return () => anim.stop();
  }, [reduce, value, delay]);
  return value;
}

/* ═══════════════════════════ BAŞLIK ═══════════════════════════ */

export interface ToolAppHeaderProps {
  app: ToolAppKey;
  /** Uygulama adının yerine geçen ekran adı (alt ekranlarda: "Ön muhasebe"). */
  title?: string;
  /** Adın altındaki canlı özet ("3 açık · 1 gecikmiş"). */
  subtitle?: string;
  back?: boolean;
  onBack?: () => void;
  actions?: ScreenHeaderAction[];
  /** Araç içi bölüm sekmeleri (ToolTabs). */
  tabs?: React.ReactNode;
  /** Başlığın altındaki süzgeç bandı (çipler, arama). */
  bottom?: React.ReactNode;
}

export function ToolAppHeader({ app, title, subtitle, back = true, onBack, actions, tabs, bottom }: ToolAppHeaderProps) {
  const router = useRouter();
  const identity = TOOL_APPS[app];
  const enter = useEnter();
  const sub = title && title !== identity.title ? (subtitle ? `${identity.shortTitle} · ${subtitle}` : identity.shortTitle) : subtitle;

  const handleBack = () => {
    if (onBack) onBack();
    else if (router.canGoBack()) router.back();
    else router.replace("/yonetim");
  };

  return (
    <View style={styles.header}>
      <View style={styles.bar}>
        {back ? (
          <Touchable feedback="icon" onPress={handleBack} hitSlop={touchSlop(36)} accessibilityRole="button" accessibilityLabel="Geri" style={styles.back}>
            <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
          </Touchable>
        ) : null}
        <Animated.View
          style={[
            styles.tile,
            { backgroundColor: identity.accent },
            { opacity: enter, transform: [{ scale: enter.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) }] },
          ]}
        >
          <Ionicons name={identity.icon} size={18} color={identity.onAccent} />
        </Animated.View>
        <View style={styles.titles}>
          <Text style={styles.title} numberOfLines={1} accessibilityRole="header" {...textScale.dense}>
            {title || identity.title}
          </Text>
          {sub ? (
            <Text style={styles.subtitle} numberOfLines={1} {...textScale.dense}>
              {sub}
            </Text>
          ) : null}
        </View>
        {actions?.slice(0, 3).map((action) => (
          <Touchable
            key={action.icon + action.accessibilityLabel}
            feedback="icon"
            haptic="light"
            onPress={action.onPress}
            hitSlop={touchSlop(34)}
            accessibilityRole="button"
            accessibilityLabel={action.accessibilityLabel}
            style={styles.action}
          >
            <Ionicons name={action.icon} size={21} color={action.tone === "danger" ? colors.danger : identity.accent} />
            {action.badge != null ? (
              <Badge
                tone="brand"
                variant="solid"
                size="xs"
                dot={action.badge === "dot"}
                label={action.badge === "dot" ? undefined : action.badge}
                floating
                style={styles.actionBadge}
                accessibilityLabel={action.badge === "dot" ? "Yeni" : `${action.badge} yeni`}
              />
            ) : null}
          </Touchable>
        ))}
      </View>
      {tabs}
      {bottom ? <View style={styles.bottom}>{bottom}</View> : null}
      <View style={styles.rule} />
    </View>
  );
}

/* ═══════════════════════════ SEKMELER ═══════════════════════════ */

export interface ToolTabItem<K extends string = string> {
  key: K;
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  count?: number;
  /** Sayaç uyarı tonunda (gecikmiş iş, bekleyen talep). */
  alert?: boolean;
}

export function ToolTabs<K extends string>({
  app,
  items,
  value,
  onChange,
  style,
}: {
  app: ToolAppKey;
  items: ToolTabItem<K>[];
  value: K;
  onChange: (key: K) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const identity = TOOL_APPS[app];
  const scroller = useRef<ScrollView>(null);
  const offsets = useRef<Record<string, number>>({});

  // Seçili sekme ekran dışında kaldıysa görünür alana getirilir.
  useEffect(() => {
    const x = offsets.current[value];
    if (x != null) scroller.current?.scrollTo({ x: Math.max(0, x - layout.screenPadding * 2), animated: true });
  }, [value]);

  return (
    <ScrollView
      ref={scroller}
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[styles.tabs, style]}
      accessibilityRole="tablist"
    >
      {items.map((item) => {
        const selected = item.key === value;
        const fg = selected ? identity.onAccent : colors.textSecondary;
        return (
          <Touchable
            key={item.key}
            feedback="chip"
            haptic="selection"
            onPress={() => onChange(item.key)}
            onLayout={(event) => {
              offsets.current[item.key] = event.nativeEvent.layout.x;
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={item.count ? `${item.label}, ${item.count}` : item.label}
            style={[styles.tab, selected ? { backgroundColor: identity.accent, borderColor: identity.accent } : null]}
          >
            {item.icon ? <Ionicons name={item.icon} size={15} color={selected ? fg : item.alert ? colors.danger : colors.textTertiary} /> : null}
            <Text style={[styles.tabLabel, { color: fg }]} numberOfLines={1} {...textScale.badge}>
              {item.label}
            </Text>
            {item.count ? (
              <Text
                style={[styles.tabCount, { color: selected ? fg : item.alert ? colors.danger : colors.textTertiary }]}
                {...textScale.badge}
              >
                {item.count > 99 ? "99+" : item.count}
              </Text>
            ) : null}
          </Touchable>
        );
      })}
    </ScrollView>
  );
}

/* ═══════════════════════════ BİRİNCİL EYLEM ═══════════════════════════ */

export function ToolFab({
  app,
  icon = "add",
  label,
  onPress,
  onLongPress,
  accessibilityLabel,
  offsetBottom = space.lg,
}: {
  app: ToolAppKey;
  icon?: keyof typeof Ionicons.glyphMap;
  label?: string;
  onPress: () => void;
  /** Uzun basış: ikincil hızlı eylem (ör. ayrıntılı form). */
  onLongPress?: () => void;
  accessibilityLabel: string;
  offsetBottom?: number;
}) {
  const identity = TOOL_APPS[app];
  const insets = useSafeAreaInsets();
  const reduce = useReduceMotion();
  const enter = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduce) {
      enter.setValue(1);
      return;
    }
    const anim = Animated.spring(enter, { toValue: 1, ...spring.bounce });
    anim.start();
    return () => anim.stop();
  }, [reduce, enter]);

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[styles.fabWrap, { bottom: offsetBottom + insets.bottom }, { opacity: enter, transform: [{ scale: enter.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }] }]}
    >
      <Touchable
        feedback="fab"
        haptic="medium"
        onPress={onPress}
        onLongPress={onLongPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={[styles.fab, elevate(3), { backgroundColor: identity.accent }, label ? styles.fabExtended : styles.fabRound]}
      >
        <Ionicons name={icon} size={22} color={identity.onAccent} />
        {label ? (
          <Text style={[styles.fabLabel, { color: identity.onAccent }]} numberOfLines={1} {...textScale.badge}>
            {label}
          </Text>
        ) : null}
      </Touchable>
    </Animated.View>
  );
}

/* ═══════════════════════════ ÖZET ŞERİDİ ═══════════════════════════ */

export interface ToolStat {
  label: string;
  value: string | number;
  tone?: "danger" | "win" | "accent" | "warn";
  onPress?: () => void;
}

export function ToolSummary({ app, stats, style }: { app: ToolAppKey; stats: ToolStat[]; style?: StyleProp<ViewStyle> }) {
  const identity = TOOL_APPS[app];
  const toneColor = (tone: ToolStat["tone"]) =>
    tone === "danger" ? colors.danger : tone === "win" ? colors.win : tone === "warn" ? colors.warn : tone === "accent" ? identity.accent : colors.textPrimary;
  return (
    <View style={[styles.summary, style]}>
      {stats.map((stat, index) => {
        const body = (
          <>
            <Text style={[styles.statValue, { color: toneColor(stat.tone) }]} numberOfLines={1} adjustsFontSizeToFit {...textScale.badge}>
              {stat.value}
            </Text>
            <Text style={styles.statLabel} numberOfLines={1} {...textScale.badge}>
              {stat.label}
            </Text>
          </>
        );
        const cell = [styles.stat, index > 0 ? styles.statDivided : null];
        return stat.onPress ? (
          <Touchable
            key={stat.label}
            feedback="chip"
            onPress={stat.onPress}
            style={cell}
            accessibilityRole="button"
            accessibilityLabel={`${stat.label}: ${stat.value}`}
          >
            {body}
          </Touchable>
        ) : (
          <View key={stat.label} style={cell} accessible accessibilityLabel={`${stat.label}: ${stat.value}`}>
            {body}
          </View>
        );
      })}
    </View>
  );
}

/** Aracın vurgu rengiyle küçük simge pulu (liste satırı, boş durum, kart başı). */
export function ToolGlyph({ app, icon, size = 36 }: { app: ToolAppKey | ToolApp; icon?: keyof typeof Ionicons.glyphMap; size?: number }) {
  const identity = typeof app === "string" ? TOOL_APPS[app] : app;
  return (
    <View style={[styles.glyph, { width: size, height: size, backgroundColor: identity.accentSoft }]}>
      <Ionicons name={icon ?? identity.icon} size={Math.round(size * 0.5)} color={identity.accent} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { backgroundColor: colors.bg },
  bar: { flexDirection: "row", alignItems: "center", minHeight: 56, paddingHorizontal: space.sm, gap: space.sm },
  back: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  tile: { width: 34, height: 34, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  titles: { flex: 1, minWidth: 0, paddingVertical: space.xs },
  title: { ...type.h1, color: colors.textPrimary },
  subtitle: { ...type.caption, color: colors.textSecondary },
  action: { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  actionBadge: { top: 2, right: 2 },
  bottom: { paddingBottom: space.sm },
  rule: { height: hairline, backgroundColor: colors.separator },
  tabs: { flexDirection: "row", gap: space.xs, paddingHorizontal: layout.screenPadding, paddingBottom: space.sm, paddingTop: space.xxs },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    minHeight: 34,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface1,
  },
  tabLabel: { ...type.labelSm },
  tabCount: { ...type.numSmStrong },
  fabWrap: { position: "absolute", right: layout.screenPadding },
  fab: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.sm },
  fabRound: { width: 56, height: 56, borderRadius: radius.pill },
  fabExtended: { height: 52, paddingHorizontal: space.lg, borderRadius: radius.pill },
  fabLabel: { ...type.label },
  summary: {
    flexDirection: "row",
    paddingVertical: space.md,
    borderRadius: radius.xl,
    borderWidth: hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface1,
  },
  stat: { flex: 1, alignItems: "center", gap: space.xxs, paddingHorizontal: space.xs },
  statDivided: { borderLeftWidth: hairline, borderLeftColor: colors.separator },
  statValue: { ...type.metricSm },
  statLabel: { ...type.micro, color: colors.textTertiary },
  glyph: { borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
});
