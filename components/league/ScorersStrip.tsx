/**
 * ScorersStrip — Puan bölmesindeki "Gol krallığı" kartı.
 *
 * İKİNCİ TUR: eski şerit üç golcüyü yan yana 24px avatar ve 12px rakamla
 * sıkıştırıyordu; ad "Doğukan YI…" diye kırpılıyor, gol sayısı tablonun
 * rakamlarından ayırt edilemiyordu. Artık SIRALI bir listedir:
 *
 *   [madalya] [avatar 36] [ad · takım + lidere oranlı çubuk] [GOL — iri]
 *
 * Birincinin gol sayısı bir kademe daha büyüktür; çubuk, değeri liderin
 * golüne oranlar (yarışın şekli). Başlıkta altın ikon karosu ve "Tümü ›" →
 * Oyuncular bölmesi (gol krallığı ölçütüyle).
 *
 * Veri yoksa (sezonda gol yok) hiç çizilmez — uydurma yer tutucu yok.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useCallback } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Avatar, GradientBar, IconTile, RankBadge, Reveal, Touchable } from "@/components/ui";
import { formatNumber } from "@/lib/format";
import { colors, dividers, hairline, radius, space, textScale, type } from "@/theme";
import type { LeaderEntry } from "./Leaderboard";

export interface ScorersStripProps {
  entries: LeaderEntry[];
  onPressEntry: (id: number) => void;
  onSeeAll?: () => void;
}

const ScorerRow = React.memo(function ScorerRow({
  entry,
  rank,
  ratio,
  onPress,
}: {
  entry: LeaderEntry;
  rank: number;
  ratio: number;
  onPress: (id: number) => void;
}) {
  const handlePress = useCallback(() => onPress(entry.id), [entry.id, onPress]);
  const goals = formatNumber(entry.value);
  const first = rank === 1;
  return (
    <Touchable
      feedback="row"
      haptic="selection"
      onPress={handlePress}
      style={styles.row}
      accessibilityRole="button"
      accessibilityLabel={`${rank}. ${entry.name}, ${goals} gol`}
    >
      <RankBadge rank={rank} size={24} />
      <Avatar name={entry.name} image={entry.image ?? null} size={first ? 40 : 36} />
      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={1} {...textScale.dense}>
          {entry.name}
        </Text>
        <Text style={styles.meta} numberOfLines={1} {...textScale.dense}>
          {entry.meta}
        </Text>
        <GradientBar
          value={ratio}
          height={4}
          gradient={first ? colors.medalGold : undefined}
          style={styles.bar}
        />
      </View>
      <View style={styles.valueBox}>
        <Text style={first ? styles.valueFirst : styles.value} {...textScale.dense}>
          {goals}
        </Text>
        <Text style={styles.unit} {...textScale.badge}>
          GOL
        </Text>
      </View>
    </Touchable>
  );
});

export const ScorersStrip = React.memo(function ScorersStrip({
  entries,
  onPressEntry,
  onSeeAll,
}: ScorersStripProps) {
  if (entries.length === 0) return null;
  const max = Math.max(...entries.map((entry) => entry.value), 1);
  return (
    <View style={styles.card} testID="scorers-card">
      <View style={styles.head}>
        <IconTile icon="football" tone="gold" size={30} />
        <View style={styles.headText}>
          <Text style={styles.title} numberOfLines={1} {...textScale.dense}>
            Gol krallığı
          </Text>
          <Text style={styles.subtitle} numberOfLines={1} {...textScale.dense}>
            Sezonun en golcü {entries.length} oyuncusu
          </Text>
        </View>
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
            <Ionicons name="chevron-forward" size={13} color={colors.brandAccent} />
          </Touchable>
        ) : null}
      </View>
      {entries.map((entry, index) => (
        <Reveal key={entry.id} index={index} distance={8}>
          {index > 0 ? <View style={styles.divider} /> : null}
          <ScorerRow entry={entry} rank={index + 1} ratio={entry.value / max} onPress={onPressEntry} />
        </Reveal>
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface1,
    borderRadius: radius.xl,
    borderWidth: hairline,
    borderColor: colors.border,
    overflow: "hidden",
    paddingBottom: space.xs,
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.m,
    paddingLeft: space.md,
    paddingRight: space.xs,
    paddingTop: space.md,
    paddingBottom: space.s,
  },
  headText: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    ...type.h3,
    color: colors.textPrimary,
  },
  subtitle: {
    ...type.caption,
    color: colors.textTertiary,
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
  divider: {
    ...dividers.inset,
    marginLeft: space.md + 24 + space.m,
  },
  row: {
    minHeight: 60,
    flexDirection: "row",
    alignItems: "center",
    gap: space.m,
    paddingHorizontal: space.md,
    paddingVertical: space.s,
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    ...type.h4,
    color: colors.textPrimary,
  },
  meta: {
    ...type.caption,
    color: colors.textTertiary,
  },
  bar: {
    marginTop: space.xs,
  },
  valueBox: {
    alignItems: "flex-end",
    minWidth: 44,
  },
  value: {
    ...type.scoreMd,
    color: colors.textPrimary,
  },
  valueFirst: {
    ...type.scoreLg,
    color: colors.textPrimary,
  },
  unit: {
    ...type.overline,
    color: colors.textTertiary,
  },
});
