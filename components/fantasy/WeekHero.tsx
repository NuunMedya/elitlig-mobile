/**
 * Haftanın başlığı: sahayı ima eden sakin yeşil zemin (orta yuvarlak yayı), hafta numarası, durum ve büyük puan. İyi bir haftada
 * (`celebrate`) birkaç yıldız bir kez süzülüp söner — sonsuz döngü yok,
 * "hareketi azalt" açıksa hiç oynamaz.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";

import { useReduceMotion } from "@/components/ui";
import { colors, radius, space, textScale, type } from "@/theme";

const TOP = { x: 0.5, y: 0 } as const;
const BOTTOM = { x: 0.5, y: 1 } as const;

export function WeekHero({
  overline,
  title,
  status,
  points,
  pointsLabel = "puan",
  celebrate,
  children,
}: {
  overline: string;
  title: string;
  status?: string;
  points?: number | null;
  pointsLabel?: string;
  celebrate?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <View style={styles.hero}>
      <LinearGradient colors={colors.gradientPitch} start={TOP} end={BOTTOM} style={StyleSheet.absoluteFill} />
      <View pointerEvents="none" style={styles.arc} />
      <View style={styles.row}>
        <View style={styles.text}>
          <Text style={styles.overline} {...textScale.dense}>
            {overline}
          </Text>
          <Text style={styles.title} {...textScale.dense}>
            {title}
          </Text>
          {status ? (
            <Text style={styles.status} {...textScale.dense}>
              {status}
            </Text>
          ) : null}
        </View>
        {points != null ? (
          <View style={styles.score}>
            <Text style={styles.points} {...textScale.dense}>
              {points}
            </Text>
            <Text style={styles.pointsLabel} {...textScale.dense}>
              {pointsLabel}
            </Text>
          </View>
        ) : null}
      </View>
      {children}
      {celebrate ? <Sparkles /> : null}
    </View>
  );
}

const SPOTS = [
  { left: "62%", top: 18, size: 14, delay: 0 },
  { left: "74%", top: 52, size: 10, delay: 120 },
  { left: "86%", top: 24, size: 12, delay: 240 },
  { left: "55%", top: 60, size: 9, delay: 360 },
] as const;

/** Bir kez oynayan yıldız serpintisi (iyi hafta kutlaması). */
function Sparkles() {
  const reduce = useReduceMotion();
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduce) return;
    Animated.timing(t, { toValue: 1, duration: 1400, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [reduce, t]);
  if (reduce) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {SPOTS.map((spot, i) => {
        const start = spot.delay / 1400;
        const opacity = t.interpolate({ inputRange: [0, start, start + 0.2, 1], outputRange: [0, 0, 1, 0], extrapolate: "clamp" });
        const translateY = t.interpolate({ inputRange: [0, 1], outputRange: [8, -14] });
        const scale = t.interpolate({ inputRange: [0, start, start + 0.25, 1], outputRange: [0.4, 0.4, 1.15, 0.9], extrapolate: "clamp" });
        return (
          <Animated.View key={i} style={{ position: "absolute", left: spot.left, top: spot.top, opacity, transform: [{ translateY }, { scale }] }}>
            <Ionicons name="star" size={spot.size} color={colors.warn} />
          </Animated.View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: radius.xl, overflow: "hidden", padding: space.lg, gap: space.md, backgroundColor: colors.pitch },
  arc: { position: "absolute", width: 160, height: 160, right: -60, top: -50, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.chalk },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md },
  text: { flex: 1, gap: space.xxs },
  overline: { ...type.overline, color: colors.onDarkMuted },
  title: { ...type.h1, color: colors.onPitch },
  status: { ...type.bodySm, color: colors.onDarkMuted },
  score: { alignItems: "flex-end" },
  points: { ...type.scoreLg, color: colors.onPitch },
  pointsLabel: { ...type.caption, color: colors.onDarkMuted },
});
