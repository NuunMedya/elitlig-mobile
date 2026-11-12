/**
 * Bütçe göstergesi: harcanan / bütçe, kalan kredi ve kadro doluluğu.
 * Dolum değişince ray yumuşakça akar; bütçe aşılırsa kırmızıya döner.
 * Beş yuva noktası, kadronun kaç oyuncuyla dolu olduğunu gösterir.
 */

import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";

import { useReduceMotion } from "@/components/ui";
import { formatCredit } from "@/lib/fantasy";
import { colors, duration, radius, space, textScale, type } from "@/theme";

import { PopIn } from "./primitives";

export function BudgetMeter({ cost, budget, picked, size }: { cost: number; budget: number; picked: number; size: number }) {
  const reduce = useReduceMotion();
  const ratio = budget > 0 ? Math.min(1, cost / budget) : 0;
  const fill = useRef(new Animated.Value(ratio)).current;
  useEffect(() => {
    if (reduce) {
      fill.setValue(ratio);
      return;
    }
    Animated.timing(fill, { toValue: ratio, duration: duration.slow, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [ratio, reduce, fill]);
  const over = cost > budget;
  const left = budget - cost;
  const width = fill.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] });
  return (
    <View style={styles.wrap} accessibilityLabel={`Bütçe: ${formatCredit(cost)} / ${budget} kredi, ${picked}/${size} oyuncu`}>
      <View style={styles.row}>
        <View>
          <Text style={styles.caption} {...textScale.dense}>
            KALAN KREDİ
          </Text>
          <PopIn trigger={cost}>
            <Text style={[styles.left, over && styles.danger]} {...textScale.dense}>
              {formatCredit(left)}
            </Text>
          </PopIn>
        </View>
        <View style={styles.right}>
          <Text style={styles.caption} {...textScale.dense}>
            {`${formatCredit(cost)} / ${formatCredit(budget)}`}
          </Text>
          <View style={styles.slots}>
            {Array.from({ length: size }, (_, i) => (
              <View key={i} style={[styles.slot, i < picked && styles.slotOn]} />
            ))}
          </View>
        </View>
      </View>
      <View style={styles.track}>
        <Animated.View style={[styles.fill, { width }, over && styles.fillOver]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.s },
  row: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" },
  right: { alignItems: "flex-end", gap: space.xs },
  caption: { ...type.overline, color: colors.textTertiary },
  left: { ...type.metric, color: colors.textPrimary },
  danger: { color: colors.danger },
  slots: { flexDirection: "row", gap: space.xs },
  slot: { width: 14, height: 4, borderRadius: 2, backgroundColor: colors.separator },
  slotOn: { backgroundColor: colors.accent },
  track: { height: 8, borderRadius: radius.pill, backgroundColor: colors.surface2, overflow: "hidden" },
  fill: { height: 8, borderRadius: radius.pill, backgroundColor: colors.accent },
  fillOver: { backgroundColor: colors.danger },
});
