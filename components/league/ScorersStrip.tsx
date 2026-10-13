/**
 * ScorersStrip — Puan bölmesinin tepesindeki "Gol krallığı" kapısı.
 *
 * NE: tek kart, üç sütun: ilk üç golcünün avatarı, adı ve gol sayısı; başlık
 * satırında "Tümü ›" → Oyuncular bölmesi (gol krallığı ölçütüyle).
 *
 * NEDEN BURADA VE NEDEN KISA: eski Ana Sayfa "puan özeti + gol krallığı"
 * gösteriyordu; ikisi artık Lig'de. Tam sıralama Oyuncular'da, ilk beş
 * İstatistik'te zaten var — burada üçüncü bir liste kurulmaz, yalnız kapı
 * açılır. Tablonun ALTINA konsaydı yüzlerce takımlık liglerde hiç
 * görülmezdi; tek satırlık yüksekliğiyle tablonun üstünde durur.
 *
 * Veri yoksa (sezonda gol yok) hiç çizilmez — uydurma yer tutucu yok.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useCallback } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Avatar, Touchable } from "@/components/ui";
import { formatNumber } from "@/lib/format";
import { colors, radius, space, textScale, type, upperTR } from "@/theme";
import type { LeaderEntry } from "./Leaderboard";
import { groupStyles } from "./shared";

export interface ScorersStripProps {
  entries: LeaderEntry[];
  onPressEntry: (id: number) => void;
  onSeeAll?: () => void;
}

const ScorerCell = React.memo(function ScorerCell({
  entry,
  rank,
  onPress,
}: {
  entry: LeaderEntry;
  rank: number;
  onPress: (id: number) => void;
}) {
  const handlePress = useCallback(() => onPress(entry.id), [entry.id, onPress]);
  const goals = formatNumber(entry.value);
  return (
    <Touchable
      feedback="row"
      haptic="selection"
      onPress={handlePress}
      style={styles.cell}
      accessibilityRole="button"
      accessibilityLabel={`${rank}. ${entry.name}, ${goals} gol`}
    >
      <View>
        <Avatar name={entry.name} image={entry.image ?? null} size={36} />
        <View style={[styles.rank, rank === 1 ? styles.rankFirst : null]}>
          <Text style={[styles.rankText, rank === 1 ? styles.rankTextFirst : null]} {...textScale.badge}>
            {rank}
          </Text>
        </View>
      </View>
      <Text style={styles.name} numberOfLines={1} {...textScale.dense}>
        {entry.name}
      </Text>
      <Text style={styles.value} {...textScale.dense}>
        {goals} <Text style={styles.unit}>gol</Text>
      </Text>
    </Touchable>
  );
});

export const ScorersStrip = React.memo(function ScorersStrip({
  entries,
  onPressEntry,
  onSeeAll,
}: ScorersStripProps) {
  if (entries.length === 0) return null;
  return (
    <View style={[groupStyles.card, styles.card]}>
      <View style={styles.head}>
        <View style={styles.headIcon}>
          <Ionicons name="football" size={14} color={colors.accentText} />
        </View>
        <Text style={styles.title} numberOfLines={1} {...textScale.dense}>
          Gol krallığı
        </Text>
        {onSeeAll ? (
          <Touchable
            feedback="chip"
            haptic="selection"
            onPress={onSeeAll}
            style={styles.more}
            accessibilityRole="button"
            accessibilityLabel="Gol krallığı: tüm sıralama"
          >
            <Text style={styles.moreText} {...textScale.dense}>
              Tümü
            </Text>
            <Ionicons name="chevron-forward" size={14} color={colors.brandAccent} />
          </Touchable>
        ) : (
          <Text style={styles.overline} {...textScale.badge}>
            {upperTR("Gol")}
          </Text>
        )}
      </View>
      <View style={styles.cells}>
        {entries.map((entry, index) => (
          <ScorerCell key={entry.id} entry={entry} rank={index + 1} onPress={onPressEntry} />
        ))}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    overflow: "hidden",
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingLeft: space.lg,
    paddingRight: space.sm,
    paddingTop: space.sm,
  },
  headIcon: {
    width: 24,
    height: 24,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accentDim,
  },
  title: {
    ...type.h4,
    color: colors.textPrimary,
    flex: 1,
  },
  overline: {
    ...type.overline,
    color: colors.textTertiary,
    paddingRight: space.sm,
  },
  more: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xxs,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
  },
  moreText: {
    ...type.label,
    color: colors.brandAccent,
  },
  cells: {
    flexDirection: "row",
    paddingHorizontal: space.xs,
    paddingBottom: space.sm,
  },
  cell: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    gap: space.xxs,
    paddingVertical: space.sm,
    paddingHorizontal: space.xs,
    borderRadius: radius.md,
  },
  rank: {
    position: "absolute",
    right: -4,
    bottom: -2,
    minWidth: 16,
    height: 16,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface3,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.surface1,
  },
  rankFirst: {
    backgroundColor: colors.accentDim,
  },
  rankText: {
    ...type.micro,
    color: colors.textSecondary,
  },
  rankTextFirst: {
    color: colors.accentText,
  },
  name: {
    ...type.label,
    color: colors.textPrimary,
    maxWidth: "100%",
    marginTop: space.xxs,
  },
  value: {
    ...type.tableNumStrong,
    color: colors.textPrimary,
  },
  unit: {
    ...type.caption,
    color: colors.textTertiary,
  },
});
