/**
 * StandingsPodium — puan tablosunun ÜSTÜNDEKİ liderlik özeti.
 *
 * NEDEN: yüzlerce takımlık bir tabloda kullanıcının ilk sorusu "kim önde,
 * ne kadar önde?" — tablo bunu yanıtlamak için 3 satır + 6 sütunluk göz
 * gezdirmesi ister. Özet bloğu soruyu tek bakışta yanıtlar:
 *
 *   · LİDER büyük: madalyalı arma, ad, G-B-M + averaj, puan iri ve dönen.
 *   · 2. ve 3. ince satırda: madalya, arma, ad, LİDERE FARK (−4) ve puanı
 *     lider puanına oranlayan imza degradeli çubuk — yarışın şekli okunur.
 *   · Üst satırda tablonun bağlamı: takım sayısı, oynanan maç.
 *
 * Sahne koyudur (`StageCard`): iki temada da beyaz metin. Satırlar takım
 * sayfasını açar (gezinme hedefi tablo satırıyla aynı).
 */

import React, { useCallback } from "react";
import { StyleSheet, Text, View } from "react-native";
import { GradientBar, Odometer, RankBadge, TeamLogo, Touchable } from "@/components/ui";
import type { StandingRow } from "@/lib/types";
import { colors, hairline, radius, space, textScale, type, upperTR } from "@/theme";
import { StageCard } from "./kit";
import { num } from "./shared";

function formatDiff(value: number): string {
  if (value > 0) return `+${value}`;
  if (value < 0) return `−${Math.abs(value)}`;
  return "0";
}

const Runner = React.memo(function Runner({
  row,
  rank,
  leaderPoints,
  onPress,
}: {
  row: StandingRow;
  rank: number;
  leaderPoints: number;
  onPress: (teamId: number) => void;
}) {
  const points = num(row.display_points);
  const gap = points - leaderPoints;
  const press = useCallback(() => onPress(row.team_id), [onPress, row.team_id]);
  return (
    <Touchable
      feedback="row"
      haptic="selection"
      onPress={press}
      style={styles.runner}
      accessibilityRole="button"
      accessibilityLabel={`${rank}. ${row.team_name}, ${points} puan, lidere ${Math.abs(gap)} puan fark`}
    >
      <RankBadge rank={rank} size={22} />
      <TeamLogo name={row.team_name} logo={row.logo ?? null} size={28} />
      <View style={styles.runnerBody}>
        <View style={styles.runnerLine}>
          <Text style={styles.runnerName} numberOfLines={1} {...textScale.dense}>
            {row.team_name}
          </Text>
          <Text style={styles.runnerGap} {...textScale.badge}>
            {gap === 0 ? "eşit" : formatDiff(gap)}
          </Text>
        </View>
        <GradientBar
          value={leaderPoints > 0 ? points / leaderPoints : 0}
          height={4}
          track={colors.inkTile}
        />
      </View>
      <Text style={styles.runnerPoints} {...textScale.dense}>
        {points}
      </Text>
    </Touchable>
  );
});

export interface StandingsPodiumProps {
  rows: StandingRow[];
  /** Tablonun bağlamı: "339 takım · 479 maç". */
  caption?: string;
  /** Güç Dengesi liglerinde "GP". */
  pointsLabel?: string;
  onPressTeam: (teamId: number) => void;
}

export const StandingsPodium = React.memo(function StandingsPodium({
  rows,
  caption,
  pointsLabel = "Puan",
  onPressTeam,
}: StandingsPodiumProps) {
  const leader = rows[0];
  const pressLeader = useCallback(() => {
    if (leader) onPressTeam(leader.team_id);
  }, [leader, onPressTeam]);
  if (!leader) return null;

  const leaderPoints = num(leader.display_points);
  const runners = rows.slice(1, 3);
  const second = runners[0];
  const lead = second ? leaderPoints - num(second.display_points) : 0;

  return (
    <StageCard testID="standings-podium">
      <View style={styles.inner}>
        <View style={styles.topLine}>
          <Text style={styles.overline} {...textScale.badge}>
            {upperTR("Liderlik yarışı")}
          </Text>
          {caption ? (
            <Text style={styles.caption} numberOfLines={1} {...textScale.dense}>
              {caption}
            </Text>
          ) : null}
        </View>

        <Touchable
          feedback="card"
          haptic="selection"
          onPress={pressLeader}
          style={styles.leader}
          accessibilityRole="button"
          accessibilityLabel={`Lider ${leader.team_name}, ${leaderPoints} puan`}
        >
          <View>
            <View style={styles.leaderCrest}>
              <TeamLogo name={leader.team_name} logo={leader.logo ?? null} size={48} />
            </View>
            <RankBadge rank={1} size={22} style={styles.leaderMedal} />
          </View>
          <View style={styles.leaderBody}>
            <Text style={styles.leaderName} numberOfLines={2} {...textScale.dense}>
              {leader.team_name}
            </Text>
            <Text style={styles.leaderMeta} numberOfLines={1} {...textScale.dense}>
              {`${num(leader.wins)}G ${num(leader.draws)}B ${num(leader.losses)}M · AV ${formatDiff(
                Number(leader.goal_diff ?? 0),
              )}`}
            </Text>
            {second ? (
              <View style={styles.leadChip}>
                <Text style={styles.leadChipText} {...textScale.badge}>
                  {lead > 0 ? `${lead} puan önde` : "puanlar eşit"}
                </Text>
              </View>
            ) : null}
          </View>
          <View style={styles.leaderPoints}>
            <Odometer value={leaderPoints} style={styles.leaderPointsValue} />
            <Text style={styles.leaderPointsLabel} {...textScale.badge}>
              {upperTR(pointsLabel)}
            </Text>
          </View>
        </Touchable>

        {runners.length > 0 ? (
          <View style={styles.runners}>
            {runners.map((row, index) => (
              <Runner
                key={row.team_id}
                row={row}
                rank={index + 2}
                leaderPoints={leaderPoints}
                onPress={onPressTeam}
              />
            ))}
          </View>
        ) : null}
      </View>
    </StageCard>
  );
});

const styles = StyleSheet.create({
  inner: {
    padding: space.lg,
    gap: space.md,
  },
  topLine: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
  },
  overline: {
    ...type.overline,
    color: colors.brandOnDark,
  },
  caption: {
    ...type.caption,
    color: colors.onDarkMuted,
    flexShrink: 1,
  },
  leader: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
  },
  leaderCrest: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.inkTile,
    borderWidth: hairline,
    borderColor: colors.inkTileBorder,
  },
  leaderMedal: {
    position: "absolute",
    right: -4,
    bottom: -2,
  },
  leaderBody: {
    flex: 1,
    minWidth: 0,
    gap: space.xxs,
  },
  leaderName: {
    ...type.h2,
    color: colors.onDark,
  },
  leaderMeta: {
    ...type.caption,
    color: colors.onDarkMuted,
  },
  leadChip: {
    alignSelf: "flex-start",
    marginTop: space.xxs,
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs,
    borderRadius: radius.pill,
    backgroundColor: colors.inkPill,
    borderWidth: hairline,
    borderColor: colors.inkPillBorder,
  },
  leadChipText: {
    ...type.micro,
    color: colors.onDark,
  },
  leaderPoints: {
    alignItems: "flex-end",
  },
  leaderPointsValue: {
    ...type.scoreLg,
    color: colors.onDark,
  },
  leaderPointsLabel: {
    ...type.overline,
    color: colors.onDarkMuted,
  },
  runners: {
    gap: space.xxs,
    paddingTop: space.sm,
    borderTopWidth: hairline,
    borderTopColor: colors.borderOnDark,
  },
  runner: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingVertical: space.s,
  },
  runnerBody: {
    flex: 1,
    minWidth: 0,
    gap: space.xs,
  },
  runnerLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  runnerName: {
    ...type.h4,
    color: colors.onDark,
    flex: 1,
  },
  runnerGap: {
    ...type.numSmStrong,
    color: colors.onDarkMuted,
  },
  runnerPoints: {
    ...type.scoreSm,
    color: colors.onDark,
    minWidth: 32,
    textAlign: "right",
  },
});
