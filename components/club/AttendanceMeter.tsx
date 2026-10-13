/**
 * YOKLAMA ÖLÇERİ — bir maçın "kim geliyor?" dağılımını tek çubukta gösterir.
 *
 * NEDEN ÇUBUK: dört ayrı rozet ("Geliyor 9", "Belirsiz 2"…) sayıları verir
 * ama ORANI vermez; başkanın asıl sorusu "maça yetecek kadar adam var mı?"
 * sorusudur. Yığılmış çubukta yeşilin uzunluğu bu soruyu okumadan yanıtlar,
 * gri kuyruk (yanıtsız) da kimi araması gerektiğini söyler. Rakamlar çubuğun
 * altında, tabular yazıyla durur.
 *
 * Renk anlamı Arena'daki sonuç/uyarı dilidir: geliyor = win, belirsiz = warn,
 * gelmiyor = danger, yanıtsız = ray (renk yok — henüz bilgi yok).
 */

import React from "react";
import { StyleSheet, Text, View } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";
import { colors, radius, space, textScale, type } from "@/theme";

export interface AttendanceCounts {
  coming: number;
  maybe: number;
  not_coming: number;
  unanswered: number;
}

const SEGMENTS: { key: keyof AttendanceCounts; label: string; color: string }[] = [
  { key: "coming", label: "Geliyor", color: colors.win },
  { key: "maybe", label: "Belirsiz", color: colors.warn },
  { key: "not_coming", label: "Gelmiyor", color: colors.danger },
  { key: "unanswered", label: "Yanıtsız", color: colors.textTertiary },
];

export const AttendanceMeter = React.memo(function AttendanceMeter({
  counts,
  /** Sahaya çıkacak sayı (ilk 8). Verilirse çubuğun altında eşik yazılır. */
  need,
  style,
}: {
  counts: AttendanceCounts;
  need?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const total = counts.coming + counts.maybe + counts.not_coming + counts.unanswered;
  const short = need != null && counts.coming < need;

  return (
    <View
      style={[styles.wrap, style]}
      accessible
      accessibilityLabel={`Yoklama: ${counts.coming} geliyor, ${counts.maybe} belirsiz, ${counts.not_coming} gelmiyor, ${counts.unanswered} yanıtsız`}
    >
      <View style={styles.track}>
        {total > 0
          ? SEGMENTS.filter((segment) => segment.key !== "unanswered").map((segment) =>
              counts[segment.key] > 0 ? (
                <View
                  key={segment.key}
                  style={[styles.fill, { flex: counts[segment.key], backgroundColor: segment.color }]}
                />
              ) : null,
            )
          : null}
        {counts.unanswered > 0 || total === 0 ? (
          <View style={[styles.fill, { flex: Math.max(counts.unanswered, 1) }]} />
        ) : null}
      </View>

      <View style={styles.legend}>
        {SEGMENTS.map((segment) => (
          <View key={segment.key} style={styles.item}>
            <View style={[styles.dot, { backgroundColor: segment.key === "unanswered" ? colors.slateSoft : segment.color }]} />
            <Text style={styles.value} {...textScale.badge}>
              {counts[segment.key]}
            </Text>
            <Text style={styles.label} numberOfLines={1} {...textScale.badge}>
              {segment.label}
            </Text>
          </View>
        ))}
      </View>

      {need != null ? (
        <Text style={[styles.need, short ? styles.needShort : null]} {...textScale.dense}>
          {short
            ? `İlk ${need} için ${need - counts.coming} oyuncu eksik`
            : `İlk ${need} çıkıyor · ${counts.coming - need} yedek`}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    gap: space.sm,
  },
  track: {
    flexDirection: "row",
    height: 8,
    borderRadius: radius.pill,
    overflow: "hidden",
    backgroundColor: colors.slateSoft,
    gap: 2,
  },
  fill: {
    height: "100%",
  },
  legend: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: space.xs,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    flexShrink: 1,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  value: {
    ...type.tableNumStrong,
    color: colors.textPrimary,
  },
  label: {
    ...type.caption,
    color: colors.textTertiary,
    flexShrink: 1,
  },
  need: {
    ...type.caption,
    color: colors.textSecondary,
  },
  needShort: {
    color: colors.warn,
  },
});
