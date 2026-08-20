/**
 * Tabs — kaydırmalı üst sekme şeridi (§4.7).
 *
 * Maç detayı (Özet / Kadro / İstatistik / H2H / Tablo), takım ve oyuncu
 * profilleri gibi ÇOK SAYFALI detay ekranlarının gezinme şerididir.
 *
 * NEDEN ALT ÇİZGİ, HAP DEĞİL: sekme sayısı 5'e çıkabilir ve etiketler Türkçe
 * uzundur ("İstatistik"). Hap biçimli seçim bu genişlikte şeridi doldurur ve
 * yatay kaydırmayı okunmaz kılar; 2px'lik alt gösterge ise sekme ne kadar
 * uzarsa uzasın sessiz kalır.
 *
 * ÖLÇÜM STRATEJİSİ: `distribute="auto"` içerik ekrana SIĞIYORSA sekmeleri eşit
 * dağıtır, sığmıyorsa kaydırmaya geçer. Bu karar `onContentSizeChange` ile
 * verilir; eşit dağıtıldığında içerik genişliği kapsayıcıya eşitlenir, yani
 * karar salınım yapmaz. Aktif sekme görünür alanın dışındaysa `scrollTo` ile
 * ortalanır — kullanıcı hangi sekmede olduğunu daima görür.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import {
  colors,
  duration,
  easing,
  hairline,
  haptics,
  layout,
  space,
  textScale,
  type,
} from "@/theme";
import { Badge } from "./Badge";
import { Touchable } from "./Pressable";

export interface TabItem<T extends string> {
  key: T;
  label: string;
  badge?: number | "dot";
}

export interface TabsProps<T extends string> {
  items: TabItem<T>[];
  value: T;
  onChange: (key: T) => void;
  /** Yapışkan kullanımda: opak zemin + alt kenarlık. */
  sticky?: boolean;
  /** Sığıyorsa eşit dağıt, sığmıyorsa kaydır — varsayılan "auto". */
  distribute?: "auto" | "equal" | "scroll";
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

interface TabLayout {
  x: number;
  width: number;
}

/** Göstergenin sekme kenarlarından içeri çekilme payı. */
const INDICATOR_INSET = space.m;

function TabsBase<T extends string>({
  items,
  value,
  onChange,
  sticky,
  distribute = "auto",
  style,
  testID,
}: TabsProps<T>) {
  const scrollRef = useRef<ScrollView>(null);
  const translate = useRef(new Animated.Value(0)).current;
  const firstRun = useRef(true);

  const [containerWidth, setContainerWidth] = useState(0);
  const [contentWidth, setContentWidth] = useState(0);
  const [layouts, setLayouts] = useState<TabLayout[]>([]);

  const index = Math.max(
    0,
    items.findIndex((item) => item.key === value),
  );

  const fits = containerWidth > 0 && contentWidth > 0 && contentWidth <= containerWidth + 1;
  const mode: "equal" | "scroll" =
    distribute === "equal" ? "equal" : distribute === "scroll" ? "scroll" : fits ? "equal" : "scroll";

  const equalWidth = mode === "equal" && containerWidth > 0
    ? containerWidth / Math.max(1, items.length)
    : 0;

  const active: TabLayout | undefined = useMemo(() => {
    if (mode === "equal" && equalWidth > 0) return { x: equalWidth * index, width: equalWidth };
    return layouts[index];
  }, [equalWidth, index, layouts, mode]);

  const indicatorWidth = active ? Math.max(16, active.width - INDICATOR_INSET * 2) : 0;
  const indicatorX = active ? active.x + (active.width - indicatorWidth) / 2 : 0;

  useEffect(() => {
    if (indicatorWidth <= 0) return;
    if (firstRun.current) {
      translate.setValue(indicatorX);
      firstRun.current = false;
      return;
    }
    Animated.timing(translate, {
      toValue: indicatorX,
      duration: duration.base,
      easing: easing.decelerate,
      useNativeDriver: true,
    }).start();
  }, [indicatorWidth, indicatorX, translate]);

  // Seçili sekmeyi görünür alanın ortasına getir (yalnız kaydırma kipinde).
  useEffect(() => {
    if (mode !== "scroll" || !active || containerWidth <= 0) return;
    const target = active.x + active.width / 2 - containerWidth / 2;
    const max = Math.max(0, contentWidth - containerWidth);
    scrollRef.current?.scrollTo({ x: Math.min(Math.max(0, target), max), animated: true });
  }, [active, containerWidth, contentWidth, mode]);

  const handleTabLayout = useCallback((i: number, event: LayoutChangeEvent) => {
    const { x, width } = event.nativeEvent.layout;
    setLayouts((prev) => {
      const current = prev[i];
      if (current && current.x === x && current.width === width) return prev;
      const next = prev.slice();
      next[i] = { x, width };
      return next;
    });
  }, []);

  return (
    <View
      style={[styles.wrapper, sticky ? styles.sticky : null, style]}
      onLayout={(event) => setContainerWidth(event.nativeEvent.layout.width)}
      testID={testID}
    >
      <ScrollView
        ref={scrollRef}
        horizontal
        scrollEnabled={mode === "scroll"}
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={(width) => setContentWidth(width)}
        contentContainerStyle={styles.content}
        accessibilityRole="tablist"
      >
        {items.map((item, i) => {
          const isActive = item.key === value;
          return (
            <Touchable
              key={item.key}
              feedback="row"
              haptic="none"
              onPress={() => {
                if (isActive) return;
                haptics.select();
                onChange(item.key);
              }}
              onLayout={(event) => handleTabLayout(i, event)}
              accessibilityRole="tab"
              accessibilityLabel={item.label}
              accessibilityState={{ selected: isActive }}
              style={[styles.tab, mode === "equal" && equalWidth > 0 ? { width: equalWidth } : null]}
            >
              <Text
                style={[styles.label, isActive ? styles.labelActive : null]}
                numberOfLines={1}
                {...textScale.dense}
              >
                {item.label}
              </Text>
              {item.badge === "dot" ? (
                <Badge dot tone="brand" />
              ) : typeof item.badge === "number" && item.badge > 0 ? (
                <Badge label={item.badge} tone="brand" size="xs" />
              ) : null}
            </Touchable>
          );
        })}

        {indicatorWidth > 0 ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.indicator,
              { width: indicatorWidth, transform: [{ translateX: translate }] },
            ]}
          />
        ) : null}
      </ScrollView>
    </View>
  );
}

export const Tabs = React.memo(TabsBase) as typeof TabsBase;

const styles = StyleSheet.create({
  wrapper: {
    height: layout.tabStripHeight,
  },
  sticky: {
    backgroundColor: colors.bg,
    borderBottomWidth: hairline,
    borderBottomColor: colors.separator,
  },
  /**
   * `flexGrow: 1` içerik kapsayıcısını en az şerit genişliğinde tutar; böylece
   * `onContentSizeChange` "sığıyor mu" sorusunu tek başına cevaplar:
   * içerik === kapsayıcı ise sığıyordur, büyükse kaydırma gerekir.
   */
  content: {
    flexGrow: 1,
    alignItems: "stretch",
  },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.xs,
    height: layout.tabStripHeight,
    paddingHorizontal: space.md,
  },
  label: {
    ...type.label,
    color: colors.textSecondary,
    fontWeight: "600",
  },
  labelActive: {
    color: colors.textPrimary,
    fontWeight: "700",
  },
  indicator: {
    position: "absolute",
    left: 0,
    bottom: 0,
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.brand,
  },
});
