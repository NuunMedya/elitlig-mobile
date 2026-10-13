/**
 * Leaderboard — "ilk beş" lider tablosu kartı (İstatistik bölmesi).
 *
 * NEDEN ÇUBUK: eski İstatistik bölmesi her kategoriden YALNIZ birinciyi bir
 * menü satırı gibi yazıyordu ("CAPITAL FC · EN GOLCÜ ›"). Birincinin ne kadar
 * önde olduğu, ikincinin kim olduğu görünmüyordu — bir istatistik sayfasının
 * asıl sorusu ise tam olarak bu: FARK. Her satırın altındaki ince zümrüt
 * çubuk, değeri kategorinin birincisine oranlar; beş satıra bakınca yarışın
 * şekli okunur.
 *
 * ARENA: çubuk VERİDİR → `accent`. Birincinin rakamı büyük (metricSm),
 * diğerleri tablo rakamı; sıra kutusu yoktur, sıra sönük bir rakamdır —
 * vurgu sayıdadır.
 *
 * "Ters" ölçüt (en az gol yiyen): çubuk yine değeri gösterir ama oran
 * EN İYİYE göre ters kurulur (`invert`): az olan uzun çubuk alır. Aksi hâlde
 * birinci sıradaki takım en kısa çubukla dururdu.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useCallback } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Avatar, TeamLogo, Touchable } from "@/components/ui";
import { colors, layout, radius, space, textScale, type, upperTR } from "@/theme";
import { groupStyles } from "./shared";

export interface LeaderEntry {
  id: number;
  name: string;
  /** Ad altındaki bağlam (takım adı, "27 maç"). */
  meta?: string;
  image?: string | null;
  value: number;
  /** Ekrana yazılan biçim (ör. "2,15"); verilmezse `value`. */
  display?: string;
}

export interface LeaderboardProps {
  title: string;
  /** Sağ üst köşede birim: "GOL", "KART". */
  unit: string;
  icon: keyof typeof Ionicons.glyphMap;
  kind: "team" | "player";
  entries: LeaderEntry[];
  /** Az olan iyi: çubuk oranı tersine kurulur. */
  invert?: boolean;
  onPressEntry: (id: number) => void;
  /** "Tümü" bağlantısı. */
  onSeeAll?: () => void;
}

const LeaderRow = React.memo(function LeaderRow({
  entry,
  rank,
  ratio,
  kind,
  first,
  onPress,
}: {
  entry: LeaderEntry;
  rank: number;
  ratio: number;
  kind: "team" | "player";
  first: boolean;
  onPress: (id: number) => void;
}) {
  const handlePress = useCallback(() => onPress(entry.id), [entry.id, onPress]);
  const display = entry.display ?? String(entry.value);
  return (
    <Touchable
      feedback="row"
      haptic="selection"
      onPress={handlePress}
      style={styles.row}
      accessibilityRole="button"
      accessibilityLabel={`${rank}. ${entry.name}, ${display}`}
    >
      <Text style={[styles.rank, first && styles.rankFirst]} {...textScale.dense}>
        {rank}
      </Text>
      {kind === "team" ? (
        <TeamLogo name={entry.name} logo={entry.image ?? null} size={layout.crestMd} />
      ) : (
        <Avatar name={entry.name} image={entry.image ?? null} size={layout.crestMd + 4} />
      )}
      <View style={styles.body}>
        <View style={styles.titleLine}>
          <Text style={styles.name} numberOfLines={1} {...textScale.dense}>
            {entry.name}
          </Text>
          {entry.meta ? (
            <Text style={styles.meta} numberOfLines={1} {...textScale.dense}>
              {entry.meta}
            </Text>
          ) : null}
        </View>
        <View style={styles.track}>
          <View
            style={[
              styles.fill,
              first ? styles.fillFirst : null,
              { width: `${Math.max(4, Math.round(ratio * 100))}%` },
            ]}
          />
        </View>
      </View>
      <Text style={first ? styles.valueFirst : styles.value} {...textScale.dense}>
        {display}
      </Text>
    </Touchable>
  );
});

export const Leaderboard = React.memo(function Leaderboard({
  title,
  unit,
  icon,
  kind,
  entries,
  invert = false,
  onPressEntry,
  onSeeAll,
}: LeaderboardProps) {
  if (entries.length === 0) return null;

  const values = entries.map((entry) => entry.value);
  const max = Math.max(...values, 0);
  const min = Math.min(...values);

  /** Çubuk oranı: düz ölçütte değer/en büyük, ters ölçütte en küçük/değer. */
  const ratioOf = (value: number) => {
    if (invert) return value <= 0 ? 1 : Math.max(min, 0.0001) / value;
    return max > 0 ? value / max : 0;
  };

  return (
    <View style={[groupStyles.card, styles.card]}>
      <View style={styles.head}>
        <View style={styles.headIcon}>
          <Ionicons name={icon} size={14} color={colors.accentText} />
        </View>
        <Text style={styles.title} numberOfLines={1} {...textScale.dense}>
          {title}
        </Text>
        <Text style={styles.unit} {...textScale.badge}>
          {upperTR(unit)}
        </Text>
      </View>

      {entries.map((entry, index) => (
        <LeaderRow
          key={entry.id}
          entry={entry}
          rank={index + 1}
          ratio={ratioOf(entry.value)}
          kind={kind}
          first={index === 0}
          onPress={onPressEntry}
        />
      ))}

      {onSeeAll ? (
        <Touchable
          feedback="row"
          haptic="selection"
          onPress={onSeeAll}
          style={styles.more}
          accessibilityRole="button"
          accessibilityLabel={`${title}: tüm sıralama`}
        >
          <Text style={styles.moreText} {...textScale.dense}>
            Tüm sıralama
          </Text>
          <Ionicons name="chevron-forward" size={14} color={colors.brandAccent} />
        </Touchable>
      ) : null}
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
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.xs,
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
    ...type.h2,
    color: colors.textPrimary,
    flex: 1,
  },
  unit: {
    ...type.overline,
    color: colors.textTertiary,
  },
  row: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: space.m,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
  },
  rank: {
    ...type.tableNum,
    color: colors.textTertiary,
    width: 14,
    textAlign: "center",
  },
  rankFirst: {
    ...type.tableNumStrong,
    color: colors.textPrimary,
  },
  body: {
    flex: 1,
    minWidth: 0,
    gap: space.s,
  },
  titleLine: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: space.s,
  },
  name: {
    ...type.h4,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  meta: {
    ...type.caption,
    color: colors.textTertiary,
    flexShrink: 2,
  },
  track: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.surface3,
    overflow: "hidden",
  },
  fill: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.accentBorder,
  },
  fillFirst: {
    backgroundColor: colors.accent,
  },
  value: {
    ...type.tableNumStrong,
    fontSize: 15,
    color: colors.textPrimary,
    minWidth: 32,
    textAlign: "right",
  },
  valueFirst: {
    ...type.metricSm,
    color: colors.textPrimary,
    minWidth: 32,
    textAlign: "right",
  },
  more: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.xs,
    minHeight: layout.minTouch,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
  },
  moreText: {
    ...type.label,
    color: colors.brandAccent,
  },
});
