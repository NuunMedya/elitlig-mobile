/**
 * Karşılaştırmalı çift bar — ev sahibi / deplasman istatistiği.
 *
 * DÜZEN: `[sayı] ——— etiket ——— [sayı]`, altında 4px tek şerit. Şerit ortadan
 * ikiye ayrılır; sol yarım SAĞDAN SOLA, sağ yarım SOLDAN SAĞA dolar. Böylece
 * iki takımın payı ortadaki eksene göre karşılıklı okunur (SofaScore kalıbı).
 *
 * RENK: üstün olan taraf `brandAccent`, diğeri `borderStrong`. Eşitlikte ikisi
 * de `textTertiary` — "kimse önde değil" bilgisi renkle de verilir. Renk tek
 * başına anlam taşımaz: sayılar zaten iki uçta yazılıdır.
 *
 * ANİMASYON: genişlik animasyonu yerel sürücüyle yapılamaz
 * (`useNativeDriver: false`), bu yüzden liste kaydırması bitmeden başlatılmaz
 * (`InteractionManager.runAfterInteractions`). "Hareketi azalt" açıksa bar
 * doğrudan son genişliğinde çizilir.
 */

import { memo, useEffect, useMemo, useRef } from "react";
import { Animated, InteractionManager, StyleSheet, Text, View } from "react-native";
import { colors, easing, space, textScale, type } from "@/theme";
import { useReduceMotion } from "./LiveBadge";

export interface StatBarProps {
  label: string;
  home: number;
  away: number;
  /** "%" veya "" — sayı biçimi */
  unit?: string;
  /** Yüzde olarak göster (topla 100 varsayımı) */
  asPercent?: boolean;
  /** Renk: kazanan taraf vurgulanır (varsayılan) veya sabit marka rengi */
  tone?: "winner" | "brand" | "neutral";
  /** Girişte 0'dan büyüyen animasyon */
  animate?: boolean;
}

/** Sayıyı okunur biçime çevirir: tam sayı ise ondalıksız, değilse tek ondalık. */
function formatValue(value: number, unit: string | undefined, asPercent: boolean): string {
  if (!Number.isFinite(value)) return "—";
  const text = Number.isInteger(value) ? String(value) : value.toFixed(1);
  if (asPercent) return `${text}%`;
  return unit ? `${text}${unit}` : text;
}

export const StatBar = memo(function StatBar({
  label,
  home,
  away,
  unit,
  asPercent = false,
  tone = "winner",
  animate = true,
}: StatBarProps) {
  const reduceMotion = useReduceMotion();
  const progress = useRef(new Animated.Value(animate ? 0 : 1)).current;

  const total = (Number.isFinite(home) ? home : 0) + (Number.isFinite(away) ? away : 0);
  const homeShare = total > 0 ? Math.max(0, home) / total : 0;
  const awayShare = total > 0 ? Math.max(0, away) / total : 0;

  useEffect(() => {
    if (!animate || reduceMotion) {
      progress.setValue(1);
      return;
    }
    progress.setValue(0);
    const handle = InteractionManager.runAfterInteractions(() => {
      Animated.timing(progress, {
        toValue: 1,
        duration: 400,
        easing: easing.decelerate,
        useNativeDriver: false,
      }).start();
    });
    return () => handle.cancel();
  }, [animate, reduceMotion, progress, homeShare, awayShare]);

  const homeWidth = useMemo(
    () => progress.interpolate({ inputRange: [0, 1], outputRange: ["0%", `${Math.round(homeShare * 100)}%`] }),
    [progress, homeShare],
  );
  const awayWidth = useMemo(
    () => progress.interpolate({ inputRange: [0, 1], outputRange: ["0%", `${Math.round(awayShare * 100)}%`] }),
    [progress, awayShare],
  );

  const equal = homeShare === awayShare;
  const homeLeads = homeShare > awayShare;

  const homeFill = tone === "brand" ? colors.brandAccent : equal ? colors.textTertiary : homeLeads ? colors.brandAccent : colors.borderStrong;
  const awayFill = tone === "brand" ? colors.brandAccent : equal ? colors.textTertiary : homeLeads ? colors.borderStrong : colors.brandAccent;
  const neutralFill = tone === "neutral";

  return (
    <View
      style={styles.wrap}
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${label}: ev sahibi ${formatValue(home, unit, asPercent)}, deplasman ${formatValue(away, unit, asPercent)}`}
    >
      <View style={styles.head}>
        <Text style={[styles.value, !equal && homeLeads && styles.valueStrong]} {...textScale.dense}>
          {formatValue(home, unit, asPercent)}
        </Text>
        <Text style={styles.label} numberOfLines={1} {...textScale.dense}>
          {label}
        </Text>
        <Text style={[styles.value, styles.valueRight, !equal && !homeLeads && styles.valueStrong]} {...textScale.dense}>
          {formatValue(away, unit, asPercent)}
        </Text>
      </View>

      <View style={styles.track}>
        <View style={styles.half}>
          <Animated.View
            style={[
              styles.fill,
              styles.fillLeft,
              { width: homeWidth, backgroundColor: neutralFill ? colors.borderStrong : homeFill },
            ]}
          />
        </View>
        <View style={styles.half}>
          <Animated.View
            style={[
              styles.fill,
              { width: awayWidth, backgroundColor: neutralFill ? colors.borderStrong : awayFill },
            ]}
          />
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    gap: space.s,
    paddingVertical: space.sm,
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  value: {
    ...type.tableNum,
    color: colors.textSecondary,
    minWidth: 36,
  },
  valueRight: {
    textAlign: "right",
  },
  valueStrong: {
    ...type.tableNumStrong,
    color: colors.textPrimary,
  },
  label: {
    ...type.caption,
    color: colors.textTertiary,
    flex: 1,
    textAlign: "center",
  },
  track: {
    flexDirection: "row",
    gap: space.xxs,
    height: 4,
  },
  half: {
    flex: 1,
    height: 4,
    backgroundColor: colors.surface3,
    borderRadius: 2,
    overflow: "hidden",
  },
  fill: {
    height: 4,
    borderRadius: 2,
  },
  // Sol yarım sağdan sola dolar: dolgu yarımın sağ kenarına yapışır.
  fillLeft: {
    alignSelf: "flex-end",
  },
});
