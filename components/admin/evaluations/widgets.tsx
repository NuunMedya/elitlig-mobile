/**
 * Değerlendirme ekranlarının küçük görsel parçaları.
 *
 *   ScoreBar   %0-100 skor çubuğu + yüzde metni (seviye rengiyle)
 *   LevelBadge "Mükemmel / İyi / Orta / Zayıf" rozeti
 *   MoneyText  işaretli tutar (+ yeşil, − kırmızı)
 *   DeltaText  önceki döneme göre değişim
 *
 * Renk tek başına anlam taşımaz: çubuğun yanında her zaman yüzde yazar.
 */

import React from "react";
import { StyleSheet, Text, View, type TextStyle } from "react-native";

import { Badge, toneColors } from "@/components/ui";
import { formatDelta, formatPct, formatTl, scoreLevel } from "@/lib/api/admin/evaluations";
import { colors, radius, space, textScale, type } from "@/theme";

export function ScoreBar({ value, compact }: { value: number | null | undefined; compact?: boolean }) {
  const level = scoreLevel(value);
  const fg = level.tone === "neutral" ? colors.textTertiary : toneColors(level.tone).fg;
  const width = `${Math.max(0, Math.min(100, value ?? 0))}%` as const;
  return (
    <View style={[styles.bar, compact ? styles.barCompact : null]}>
      <View style={styles.track}>
        <View style={[styles.fill, { width, backgroundColor: fg }]} />
      </View>
      <Text style={[styles.pct, { color: fg }]} {...textScale.badge}>
        {formatPct(value)}
      </Text>
    </View>
  );
}

export function LevelBadge({ value }: { value: number | null | undefined }) {
  const level = scoreLevel(value);
  if (value == null) return null;
  return <Badge label={level.label} tone={level.tone} size="xs" />;
}

export function MoneyText({ value, style }: { value: number | null | undefined; style?: TextStyle }) {
  const n = Number(value) || 0;
  return (
    <Text style={[styles.money, n > 0 ? styles.plus : n < 0 ? styles.minus : null, style]} {...textScale.dense}>
      {formatTl(n, true)}
    </Text>
  );
}

export function DeltaText({ value, suffix = "", upIsGood = true, money }: { value: number | null | undefined; suffix?: string; upIsGood?: boolean; money?: boolean }) {
  if (value == null || value === 0) return null;
  const good = upIsGood ? value > 0 : value < 0;
  return (
    <Text style={[styles.delta, good ? styles.plus : styles.minus]} {...textScale.dense}>
      {money ? formatTl(value, true) : formatDelta(value, suffix)}
    </Text>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: "row", alignItems: "center", gap: space.sm, minWidth: 120 },
  barCompact: { minWidth: 90 },
  track: { flex: 1, height: 6, borderRadius: radius.pill, backgroundColor: colors.surface3, overflow: "hidden" },
  fill: { height: 6, borderRadius: radius.pill },
  pct: { ...type.numSmStrong, minWidth: 44, textAlign: "right" },
  money: { ...type.numSmStrong, color: colors.textSecondary },
  plus: { color: colors.win },
  minus: { color: colors.danger },
  delta: { ...type.caption },
});
