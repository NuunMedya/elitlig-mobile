/**
 * SegmentedControl — az sayıda seçenek arasında geçiş (§4.6).
 *
 * "Sonuçlar / Fikstür / Canlı", "Genel / Detay" gibi AYNI verinin farklı
 * kesitleri için kullanılır. Sekme (`Tabs`) ile farkı: sekme bir SAYFA
 * değiştirir, segment bir FİLTRE değiştirir; bu yüzden segment daha küçüktür
 * ve kendi kutusunun içinde yaşar.
 *
 * NEDEN KAYAN GÖSTERGE: aktif segmentin zemini anında yer değiştirirse göz
 * "hangisi seçiliydi" bağını kaybeder. 180 ms'lik `translateX` geçişi bu bağı
 * korur ve seçim yönünü (sola/sağa) gösterir. Gösterge daima NATIVE driver ile
 * sürülür; liste güncellenirken bile takılmaz.
 *
 * Genişlik `onLayout` ile ÖLÇÜLÜR (sabit değer varsayılmaz): Türkçe etiketler
 * ("Sonuçlar" / "Fikstür") ve dinamik yazı tipi ölçeği segment genişliğini
 * cihazdan cihaza değiştirir.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
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
  fonts,
  haptics,
  isDark,
  radius,
  space,
  textScale,
  type,
} from "@/theme";
import { Touchable } from "./Pressable";

export interface SegmentedItem<T extends string> {
  key: T;
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  /** Etiketin sağında 5px canlı nokta. */
  dot?: boolean;
}

export interface SegmentedControlProps<T extends string> {
  items: SegmentedItem<T>[];
  value: T;
  onChange: (key: T) => void;
  /** Eşit genişlik (varsayılan) veya içeriğe göre. */
  stretch?: boolean;
  size?: "sm" | "md";
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** Kutunun iç boşluğu — gösterge bu kadar içeriden kayar. */
const PAD = 3;

function SegmentedControlBase<T extends string>({
  items,
  value,
  onChange,
  stretch = true,
  size = "md",
  style,
  testID,
}: SegmentedControlProps<T>) {
  const innerHeight = size === "sm" ? 32 : 40;
  const index = Math.max(
    0,
    items.findIndex((item) => item.key === value),
  );

  const [containerWidth, setContainerWidth] = useState(0);
  const [widths, setWidths] = useState<number[]>([]);
  const translate = useRef(new Animated.Value(0)).current;
  const firstRun = useRef(true);

  const segmentWidth = useCallback(
    (i: number): number => {
      if (stretch) {
        return containerWidth > 0 ? (containerWidth - PAD * 2) / Math.max(1, items.length) : 0;
      }
      return widths[i] ?? 0;
    },
    [containerWidth, items.length, stretch, widths],
  );

  const indicatorWidth = segmentWidth(index);

  const offset = useMemo(() => {
    if (stretch) return indicatorWidth * index;
    let sum = 0;
    for (let i = 0; i < index; i += 1) sum += widths[i] ?? 0;
    return sum;
  }, [index, indicatorWidth, stretch, widths]);

  useEffect(() => {
    if (firstRun.current) {
      // İlk ölçümde gösterge kaymaz, doğrudan yerine oturur.
      translate.setValue(offset);
      if (offset > 0 || indicatorWidth > 0) firstRun.current = false;
      return;
    }
    Animated.timing(translate, {
      toValue: offset,
      duration: duration.base,
      easing: easing.decelerate,
      useNativeDriver: true,
    }).start();
  }, [indicatorWidth, offset, translate]);

  const handleContainerLayout = useCallback((event: LayoutChangeEvent) => {
    setContainerWidth(event.nativeEvent.layout.width);
  }, []);

  const handleSegmentLayout = useCallback(
    (i: number, event: LayoutChangeEvent) => {
      const width = event.nativeEvent.layout.width;
      setWidths((prev) => {
        if (prev[i] === width) return prev;
        const next = prev.slice();
        next[i] = width;
        return next;
      });
    },
    [],
  );

  return (
    <View
      accessibilityRole="tablist"
      onLayout={handleContainerLayout}
      style={[styles.container, { height: innerHeight + PAD * 2 }, style]}
      testID={testID}
    >
      {indicatorWidth > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.indicator,
            { width: indicatorWidth, height: innerHeight, transform: [{ translateX: translate }] },
          ]}
        />
      ) : null}

      {items.map((item, i) => {
        const active = item.key === value;
        return (
          <Touchable
            key={item.key}
            feedback="chip"
            haptic="none"
            ripple={false}
            onPress={() => {
              if (active) return;
              haptics.select();
              onChange(item.key);
            }}
            onLayout={stretch ? undefined : (event) => handleSegmentLayout(i, event)}
            accessibilityRole="tab"
            accessibilityLabel={item.label}
            accessibilityState={{ selected: active }}
            style={[
              styles.segment,
              { height: innerHeight },
              stretch ? styles.segmentStretch : styles.segmentAuto,
            ]}
          >
            {item.icon ? (
              <Ionicons
                name={item.icon}
                size={size === "sm" ? 12 : 14}
                color={active ? colors.textPrimary : colors.textSecondary}
              />
            ) : null}
            <Text
              style={[
                size === "sm" ? styles.labelSm : styles.label,
                active ? styles.labelActive : null,
              ]}
              numberOfLines={1}
              {...textScale.dense}
            >
              {item.label}
            </Text>
            {item.dot ? <View style={styles.dot} /> : null}
          </Touchable>
        );
      })}
    </View>
  );
}

export const SegmentedControl = React.memo(
  SegmentedControlBase,
) as typeof SegmentedControlBase;

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface2,
    borderRadius: radius.md,
    padding: PAD,
  },
  /**
   * Aktif hap: koyu temada bir üst yüzey (surface3) seçilir, çünkü surface1
   * kutunun zemininden (surface2) daha KOYU olurdu ve seçim geri giderdi.
   */
  indicator: {
    position: "absolute",
    left: PAD,
    top: PAD,
    borderRadius: radius.sm,
    backgroundColor: isDark ? colors.surface3 : colors.surface1,
  },
  segment: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.xs,
    borderRadius: radius.sm,
  },
  segmentStretch: {
    flex: 1,
  },
  segmentAuto: {
    paddingHorizontal: space.md,
  },
  label: {
    ...type.label,
    color: colors.textSecondary,
  },
  labelSm: {
    ...type.caption,
    color: colors.textSecondary,
  },
  labelActive: {
    color: colors.textPrimary,
    fontFamily: fonts.bold,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: colors.live,
  },
});
