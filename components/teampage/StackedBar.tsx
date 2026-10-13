/**
 * Bileşik yatay çubuk — bir bütünün parçalarını tek çizgide gösterir.
 *
 * Takım sayfasında iki iş görür: galibiyet/beraberlik/mağlubiyet dengesi ve
 * kadronun mevki dağılımı. İkisinde de soru "bütünün ne kadarı hangisi?"dir;
 * yan yana üç ayrı sayı bu oranı okutmuyordu, tek çubuk bir bakışta okutur.
 *
 * Parçalar arasında 2px boşluk vardır: renk tek başına anlam taşımamalı,
 * parça sınırı renk körü bir göz için de görünür kalır. Değeri 0 olan parça
 * çizilmez (sıfır genişlikli bir çentik gürültüdür).
 */

import React from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { colors, radius } from "@/theme";

export interface StackedSegment {
  key: string;
  value: number;
  color: string;
}

export const StackedBar = React.memo(function StackedBar({
  segments,
  height = 8,
  style,
}: {
  segments: StackedSegment[];
  height?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const visible = segments.filter((segment) => segment.value > 0);
  const total = visible.reduce((sum, segment) => sum + segment.value, 0);

  return (
    <View
      style={[styles.track, { height }, style]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {total > 0
        ? visible.map((segment) => (
            <View
              key={segment.key}
              style={[styles.segment, { flex: segment.value, backgroundColor: segment.color }]}
            />
          ))
        : null}
    </View>
  );
});

const styles = StyleSheet.create({
  track: {
    flexDirection: "row",
    gap: 2,
    borderRadius: radius.pill,
    overflow: "hidden",
    backgroundColor: colors.slateSoft,
  },
  segment: {
    height: "100%",
  },
});
