/**
 * GlowTabBar — ALT MENÜ RAYI.
 *
 * İKİ KİMLİK, TEK BİLEŞEN:
 *   · `variant="member"` (varsayılan) → üye uygulaması: sakin yüzey + marka
 *     moru seçim kapsülü.
 *   · `variant="admin"` → YÖNETİM MODU: gece laciverti bar + altın vurgu ve
 *     ortada YÜKSELEN "Uygulamalar" düğmesi (`center`). Yönetici hangi modda
 *     olduğunu bara bakarak anlar; iki temada da aynı kalır.
 *
 * GECE TEMASI (2026-11): bar ekranın dibine oturmaz, kenarlardan ayrık YÜZEN
 * bir cam hap olarak durur. Seçili sekmede mor → camgöbeği kapsül, yeni
 * sekmeye kayarken yatay ESNER ve yaylanarak oturur (Sliding Pill).
 *
 * SEÇİMİN SİNYALİ — KAYAN KAPSÜL: seçili ikonu saran pul barın üstünde TEK bir
 * nesnedir ve sekme değişince yaylanarak yeni sekmeye KAYAR; hareket seçimin
 * yönünü de söyler.
 *
 * İNCE DOKUNUŞLAR (üçüncü tur):
 *   · Seçilen ikon hafifçe "zıplar" (yay), basılı tutulan yuva küçülür —
 *     parmağın altındaki nesne canlıdır.
 *   · Üst köşeler yumuşatıldı ve bar sayfadan ince bir gölgeyle ayrılır;
 *     kenara oturmaya devam eder (yüzen hap içerikten yer çalıyordu).
 *   · Seçili sekmenin altında kapsülle birlikte kayan küçük bir ışık çizgisi.
 *   · `banner`: barın hemen ÜSTÜNDE ince bir şerit (yöneticinin üye
 *     görünümünde "Yönetime dön" kısayolu).
 *
 * NEDEN SEKMELER PROP OLARAK GELİYOR: `href: null` ile gizlenen rotalar
 * gezinme durumunda DURMAYA devam eder; görünen sekmelerin listesi
 * `app/(tabs)/_layout.tsx` içinde AÇIKÇA yazılır; burası yalnız çizer.
 *
 * ERİŞİLEBİLİRLİK: her yuva `role="tab"` + `selected` durumu taşır, dokunma
 * alanı barın tam yüksekliğidir ve "hareketi azalt" açıkken kapsül yaylanmadan
 * yeni sekmeye taşınır, ikon zıplamaz.
 */

import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { CommonActions } from "@react-navigation/native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from "react-native";
import {
  colors,
  elevate,
  fonts,
  glowStyle,
  hairline,
  haptics,
  layout,
  radius,
  space,
  spring,
  stretch,
  textScale,
  type,
} from "@/theme";
import { useReduceMotion } from "./LiveBadge";
import { TabBarIcon } from "./TabBarIcon";

/** Barın yüzey gradyanı — yüzeylerin ışığı daima sağdan gelir. */
const BAR_START = { x: 1, y: 0.5 } as const;
const BAR_END = { x: 0, y: 0.5 } as const;

/* ÖLÇÜLER — barın iç geometrisi tek yerde.
   7 üst dolgu + 28 kapsül + 3 aralık + 13 etiket + 9 alt dolgu = 60
   (`layout.tabBarHeight`); güvenli alan bunun ALTINA eklenir. */
const CAPSULE_WIDTH = 54;
const CAPSULE_HEIGHT = 32;
const CAPSULE_TOP = 7;
/** Yüzen barın ekran kenarlarından boşluğu. */
const FLOAT_GAP = 12;
/** Yönetim barının ortasındaki yükselen düğme. */
const CENTER_SIZE = 50;
const CENTER_LIFT = 16;

/** Görünen bir sekme — sıra, etiket ve ikon `_layout.tsx` içinde tanımlanır. */
export interface GlowTab {
  /** `app/(tabs)/` altındaki rota adı. */
  name: string;
  label: string;
  /** Dolu varyantın adı; seçili olmayan sekmede "-outline" eklenir. */
  icon: keyof typeof Ionicons.glyphMap;
  /** Sayısal rozet — 0/undefined ise çizilmez. */
  badge?: number;
  /** Rozetin anlamı: "unread" menekşe (varsayılan), "live" kırmızı (canlı maç sayısı). */
  badgeTone?: "unread" | "live";
  /** Ekran okuyucu etiketi; verilmezse `label` kullanılır. */
  accessibilityLabel?: string;
}

/** Barın ortasında duran, rota OLMAYAN eylem düğmesi (yönetim: Uygulamalar). */
export interface GlowTabCenter {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  accessibilityLabel?: string;
  /** Düğmenin köşesinde sayaç (bekleyen iş toplamı). */
  badge?: number;
}

export interface GlowTabBarProps extends BottomTabBarProps {
  tabs: readonly GlowTab[];
  variant?: "member" | "admin";
  center?: GlowTabCenter;
  /** Barın hemen üstünde çizilen ince şerit. */
  banner?: React.ReactNode;
}

type Slot = { kind: "tab"; tab: GlowTab } | { kind: "center"; center: GlowTabCenter };

export function GlowTabBar({ state, navigation, insets, tabs, variant = "member", center, banner }: GlowTabBarProps) {
  const reduceMotion = useReduceMotion();
  const [barWidth, setBarWidth] = useState(0);
  const admin = variant === "admin";

  const tone = admin ? ADMIN_TONE : MEMBER_TONE;

  /** Yuvalar: sekmeler + (varsa) tam ortada eylem düğmesi. */
  const slots = useMemo<Slot[]>(() => {
    const list: Slot[] = tabs.map((tab) => ({ kind: "tab", tab }));
    if (center) list.splice(Math.floor(tabs.length / 2), 0, { kind: "center", center });
    return list;
  }, [center, tabs]);

  /** Rota adı → gezinme durumundaki rota. Gizli rotalar burada yok sayılır. */
  const routeByName = useMemo(() => {
    const map = new Map<string, (typeof state.routes)[number]>();
    for (const route of state.routes) map.set(route.name, route);
    return map;
  }, [state.routes]);

  const activeName = state.routes[state.index]?.name;
  /* Gizli bir rota açıkken hiçbir sekme seçili değildir; kapsül o sırada SON
     seçili sekmenin üstünde söner — bir yere kaymaz. */
  const matchedIndex = slots.findIndex((slot) => slot.kind === "tab" && slot.tab.name === activeName);
  const lastIndex = useRef(0);
  if (matchedIndex >= 0) lastIndex.current = matchedIndex;
  const activeIndex = matchedIndex >= 0 ? matchedIndex : lastIndex.current;

  /* Kapsülün konumu YUVA İNDİSİ olarak tutulur, piksel olarak değil: bar
     ölçüsü değiştiğinde yalnız interpolasyonun çıktı aralığı değişir. */
  const travel = useRef(new Animated.Value(activeIndex)).current;
  /* SLIDING PILL: kapsül yolda yatay esner, hedefe yaylanarak oturur. */
  const squish = useRef(new Animated.Value(0)).current;
  const firstRun = useRef(true);

  useEffect(() => {
    if (reduceMotion || firstRun.current) {
      firstRun.current = false;
      travel.setValue(activeIndex);
      return;
    }
    squish.setValue(0);
    Animated.parallel([
      Animated.spring(travel, { toValue: activeIndex, ...spring.slide }),
      Animated.sequence([
        Animated.timing(squish, { toValue: 1, duration: stretch.ms * 0.38, useNativeDriver: true }),
        Animated.spring(squish, { toValue: 0, ...spring.pop }),
      ]),
    ]).start();
  }, [activeIndex, reduceMotion, travel, squish]);

  const slotWidth = slots.length > 0 ? barWidth / slots.length : 0;
  const span = Math.max(1, slots.length - 1);
  const translateX = travel.interpolate({
    inputRange: [0, span],
    outputRange: [0, slotWidth * span],
  });

  const onBarLayout = (event: LayoutChangeEvent) => {
    setBarWidth(event.nativeEvent.layout.width);
  };

  const capsuleScale = {
    transform: [
      { scaleX: squish.interpolate({ inputRange: [0, 1], outputRange: [1, stretch.peak] }) },
      { scaleY: squish.interpolate({ inputRange: [0, 1], outputRange: [1, stretch.squash] }) },
    ],
  };

  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, FLOAT_GAP) }]}>
      {banner}
      <View
        /* YÜZEN CAM BAR: kenarlardan ayrık, dört köşesi yuvarlak. Güvenli alan
           barın İÇİNE değil ALTINA (sarmalayıcının dolgusu) eklenir. */
        style={[
          styles.bar,
          elevate(4),
          { height: layout.tabBarHeight + 6, backgroundColor: tone.bar },
        ]}
        onLayout={onBarLayout}
      >
        <View style={styles.barClip} pointerEvents="none">
          <LinearGradient colors={tone.gradient} start={BAR_START} end={BAR_END} style={StyleSheet.absoluteFill} />
          {/* Üst kenar: barı sayfadan ayıran ince ışık çizgisi. */}
          <View style={[styles.edge, { borderColor: tone.border }]} />
        </View>

        {/* Kayan kapsül + altındaki ışık çizgisi — sekmelerden ÖNCE çizilir ki
            ikonun ARKASINDA kalsın. */}
        {slotWidth > 0 ? (
          <Animated.View
            style={[
              styles.capsuleSlot,
              { width: slotWidth, transform: [{ translateX }] },
              matchedIndex >= 0 ? null : styles.capsuleIdle,
            ]}
            pointerEvents="none"
          >
            <Animated.View style={[styles.capsuleOn, glowStyle(tone.glow, 2), capsuleScale]}>
              <LinearGradient colors={tone.capsuleGradient} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={styles.capsuleFill} />
            </Animated.View>
          </Animated.View>
        ) : null}

        {slots.map((slot, index) => {
          if (slot.kind === "center") {
            return <CenterButton key="__center" center={slot.center} reduceMotion={reduceMotion} />;
          }
          const tab = slot.tab;
          const route = routeByName.get(tab.name);
          const focused = index === activeIndex && matchedIndex >= 0;

          const onPress = () => {
            if (!route) return;
            const event = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });
            if (event.defaultPrevented) return;
            haptics.select();
            /* Hedefi AÇIKÇA verilen eylem: `target: state.key` eylemi doğrudan
               BU sekme gezginine bağlar (iç içe gezginlerde yanlış yuvaya
               düşmesin). */
            navigation.dispatch({
              ...CommonActions.navigate(route.name, route.params),
              target: state.key,
            });
          };

          const onLongPress = () => {
            if (!route) return;
            navigation.emit({ type: "tabLongPress", target: route.key });
          };

          return (
            <TabSlot
              key={tab.name}
              tab={tab}
              focused={focused}
              reduceMotion={reduceMotion}
              activeColor={tone.active}
              iconOnColor={tone.iconOn}
              inactiveColor={tone.inactive}
              ringColor={tone.bar}
              ripple={tone.border}
              onPress={onPress}
              onLongPress={onLongPress}
            />
          );
        })}
      </View>
    </View>
  );
}

/* ═══════════════════════════════ YUVALAR ═══════════════════════════════ */

interface TabSlotProps {
  tab: GlowTab;
  focused: boolean;
  reduceMotion: boolean;
  activeColor: string;
  iconOnColor: string;
  inactiveColor: string;
  ringColor: string;
  ripple: string;
  onPress: () => void;
  onLongPress: () => void;
}

/**
 * Tek sekme yuvası. İki küçük hareket taşır:
 *   · seçilince ikon yaylanarak büyür ve bir tık yukarı kalkar (`lift`),
 *   · basılıyken yuva küçülür (`pressed`).
 * İkisi de yerel sürücüde (transform) çalışır.
 */
const TabSlot = React.memo(function TabSlot({
  tab,
  focused,
  reduceMotion,
  activeColor,
  iconOnColor,
  inactiveColor,
  ringColor,
  ripple,
  onPress,
  onLongPress,
}: TabSlotProps) {
  const lift = useRef(new Animated.Value(focused ? 1 : 0)).current;
  const pressed = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduceMotion) {
      lift.setValue(focused ? 1 : 0);
      return;
    }
    Animated.spring(lift, { toValue: focused ? 1 : 0, ...spring.bounce }).start();
  }, [focused, lift, reduceMotion]);

  const pressTo = (value: number) => {
    if (reduceMotion) return;
    Animated.spring(pressed, { toValue: value, ...spring.press }).start();
  };

  const iconStyle = {
    transform: [
      { scale: lift.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] }) },
      { translateY: lift.interpolate({ inputRange: [0, 1], outputRange: [0, -1] }) },
    ],
  };
  const slotStyle = {
    transform: [{ scale: pressed.interpolate({ inputRange: [0, 1], outputRange: [1, 0.92] }) }],
  };

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={() => pressTo(1)}
      onPressOut={() => pressTo(0)}
      android_ripple={{ color: ripple, borderless: true }}
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={tab.accessibilityLabel ?? tab.label}
      style={styles.tab}
      testID={`tab-${tab.name}`}
    >
      <Animated.View style={[styles.tabInner, slotStyle]}>
        {/* İkon kutusu kapsülle aynı ölçüdedir; kapsül bunun ARKASINA kayar. */}
        <Animated.View style={[styles.capsule, iconStyle]}>
          <TabBarIcon
            name={tab.icon}
            focused={focused}
            color={focused ? iconOnColor : inactiveColor}
            size={22}
            badge={tab.badge && tab.badge > 0 ? tab.badge : undefined}
            badgeTone={tab.badgeTone}
            ringColor={ringColor}
          />
        </Animated.View>
        <Text
          style={[styles.label, { color: focused ? activeColor : inactiveColor }, focused ? styles.labelOn : null]}
          numberOfLines={1}
          {...textScale.badge}
        >
          {tab.label}
        </Text>
      </Animated.View>
    </Pressable>
  );
});

/** Yönetim barının ortasındaki yükselen altın düğme — "Uygulamalar". */
function CenterButton({ center, reduceMotion }: { center: GlowTabCenter; reduceMotion: boolean }) {
  const pressed = useRef(new Animated.Value(0)).current;
  const pressTo = (value: number) => {
    if (reduceMotion) return;
    Animated.spring(pressed, { toValue: value, ...spring.press }).start();
  };
  const style = {
    transform: [{ scale: pressed.interpolate({ inputRange: [0, 1], outputRange: [1, 0.9] }) }],
  };
  const count = center.badge && center.badge > 0 ? (center.badge > 99 ? "99+" : String(center.badge)) : null;

  return (
    <Pressable
      onPress={() => {
        haptics.light();
        center.onPress();
      }}
      onPressIn={() => pressTo(1)}
      onPressOut={() => pressTo(0)}
      accessibilityRole="button"
      accessibilityLabel={center.accessibilityLabel ?? center.label}
      style={styles.tab}
      testID="tab-center"
    >
      <Animated.View style={[styles.centerButton, elevate(3), style]}>
        <LinearGradient
          colors={colors.gradientAdminAccent}
          start={BAR_START}
          end={BAR_END}
          style={styles.centerFill}
        />
        <Ionicons name={center.icon} size={24} color={colors.adminAccentInk} />
        {count ? (
          <View style={styles.centerBadge}>
            <Text style={styles.centerBadgeText} {...textScale.badge}>
              {count}
            </Text>
          </View>
        ) : null}
      </Animated.View>
      <Text style={[styles.label, styles.centerLabel]} numberOfLines={1} {...textScale.badge}>
        {center.label}
      </Text>
    </Pressable>
  );
}

/* ═══════════════════════════════ TONLAR ═══════════════════════════════ */

const MEMBER_TONE = {
  bar: colors.tabBar,
  gradient: colors.gradientTabBar,
  border: colors.tabBarBorder,
  active: colors.tabActive,
  inactive: colors.tabInactive,
  /** Seçili ikon: kapsülün ÜSTÜNDE beyaz. */
  iconOn: colors.textOnBrand,
  capsuleGradient: colors.gradientSignature,
  glow: colors.glow,
} as const;

const ADMIN_TONE = {
  bar: colors.adminBar,
  gradient: colors.gradientAdminBar,
  border: colors.adminBarBorder,
  active: colors.adminTabActive,
  inactive: colors.adminTabInactive,
  iconOn: colors.adminAccentInk,
  capsuleGradient: colors.gradientAdminAccent,
  glow: colors.adminAccent,
} as const;

const styles = StyleSheet.create({
  /** Köşelerin arkasında sayfanın kâğıdı görünür. */
  wrap: {
    backgroundColor: colors.bg,
    paddingHorizontal: FLOAT_GAP,
    paddingTop: space.xs,
  },
  /**
   * Bar ekranın alt kenarına OTURUR; yalnız üst köşeleri yumuşaktır. Yükseklik
   * `layout.tabBarHeight`, güvenli alan `paddingBottom` ile ALTINA eklenir.
   */
  bar: {
    flexDirection: "row",
    alignItems: "stretch",
    borderRadius: radius.xxl,
  },
  /** Gradyan ve kenar çizgisi köşe yarıçapına kırpılır; düğme taşabilir. */
  barClip: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: radius.xxl,
    overflow: "hidden",
  },
  /** Barın ışıklı cam kenarı — dört yanda ince çizgi. */
  edge: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: radius.xxl,
    borderWidth: hairline * 2,
    backgroundColor: "transparent",
  },
  /** Kapsülün taşıyıcısı: bir yuva genişliğinde, sola yaslı. */
  capsuleSlot: {
    position: "absolute",
    top: CAPSULE_TOP,
    left: 0,
    height: layout.tabBarHeight - CAPSULE_TOP,
    alignItems: "center",
  },
  capsuleIdle: {
    opacity: 0,
  },
  capsuleOn: {
    width: CAPSULE_WIDTH,
    height: CAPSULE_HEIGHT,
    borderRadius: radius.md,
  },
  capsuleFill: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: radius.md,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-start",
  },
  tabInner: {
    alignItems: "center",
    gap: 3,
    paddingTop: CAPSULE_TOP,
    paddingBottom: space.m,
  },
  capsule: {
    width: CAPSULE_WIDTH,
    height: CAPSULE_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
  },
  /**
   * ETİKET SEÇİLİ OLMAYAN SEKMEDE DE OKUNUR: sönük etiket AA metin eşiğini
   * geçer (bkz. scripts/check-tokens.mjs).
   */
  label: {
    ...type.micro,
    fontFamily: fonts.medium,
    letterSpacing: 0,
    textTransform: "none",
  },
  labelOn: {
    fontFamily: fonts.semibold,
  },

  /* — Yönetim: yükselen orta düğme — */
  centerButton: {
    width: CENTER_SIZE,
    height: CENTER_SIZE,
    marginTop: -CENTER_LIFT,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: colors.adminBar,
  },
  centerFill: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: radius.pill,
  },
  centerLabel: {
    marginTop: CAPSULE_TOP + CAPSULE_HEIGHT + 3 - (CENTER_SIZE - CENTER_LIFT),
    color: colors.adminTabActive,
    fontFamily: fonts.semibold,
  },
  centerBadge: {
    position: "absolute",
    top: -4,
    right: -6,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.live,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.adminBar,
  },
  centerBadgeText: {
    ...type.micro,
    color: colors.onDark,
    letterSpacing: 0,
  },
});
