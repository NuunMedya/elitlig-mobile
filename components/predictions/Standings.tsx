/**
 * TAHMİN LİGİ SIRALAMASI — haftalık / sezonluk puan tablosu (yalnız görünüm).
 *
 *   ┌ SENİN SIRAN ─────────────────────────────┐
 *   │  4.   / 128 oyuncu        42 puan · 6 TS │
 *   └──────────────────────────────────────────┘
 *   #  Oyuncu                    Tah  TS   Puan
 *   (1) Ad Soyad · Takım          18   4    52
 *   ...
 *
 * İlk üç sıra madalya diskiyle (`lib/predictionsPalette.ts`), senin satırın
 * markanın yumuşak zemini ve sol kenarda ince bir şeritle işaretlenir.
 */

import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import type { PredictionBoardEntry } from "@/lib/api/career";
import { medalTone } from "@/lib/predictionsPalette";
import { colors, hairline, radius, space, textScale, type, upperTR } from "@/theme";

export interface StandingsProps {
  entries: PredictionBoardEntry[];
  me: PredictionBoardEntry | null;
  totalPlayers: number;
  periodLabel: string;
}

export const Standings = memo(function Standings({ entries, me, totalPlayers, periodLabel }: StandingsProps) {
  return (
    <View style={styles.wrap}>
      {me ? <MeCard me={me} totalPlayers={totalPlayers} periodLabel={periodLabel} /> : null}
      <View style={styles.table}>
        <View style={styles.head} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Text style={[styles.headText, styles.colRank]} {...textScale.badge}>
            #
          </Text>
          <Text style={[styles.headText, styles.colName]} {...textScale.badge}>
            {upperTR("Oyuncu")}
          </Text>
          <Text style={[styles.headText, styles.colNum]} {...textScale.badge}>
            TAH
          </Text>
          <Text style={[styles.headText, styles.colNum]} {...textScale.badge}>
            TS
          </Text>
          <Text style={[styles.headText, styles.colPts]} {...textScale.badge}>
            PUAN
          </Text>
        </View>
        {entries.map((entry, index) => (
          <Row key={entry.userId} entry={entry} mine={entry.userId === me?.userId} last={index === entries.length - 1} />
        ))}
      </View>
      <Text style={styles.foot} {...textScale.dense}>
        TAH: tahmin sayısı · TS: tam skor
      </Text>
    </View>
  );
});

function MeCard({ me, totalPlayers, periodLabel }: { me: PredictionBoardEntry; totalPlayers: number; periodLabel: string }) {
  const top = totalPlayers > 0 ? Math.max(1, Math.round((me.rank / totalPlayers) * 100)) : null;
  return (
    <View
      style={styles.me}
      accessible
      accessibilityLabel={`${periodLabel} sıran ${me.rank}, ${totalPlayers} oyuncu. ${me.points} puan, ${me.exact} tam skor.`}
    >
      <View style={styles.meRankBox}>
        <Text style={styles.meRank} {...textScale.badge}>
          {me.rank}
        </Text>
        <Text style={styles.meRankLabel} {...textScale.badge}>
          {upperTR("Sıra")}
        </Text>
      </View>
      <View style={styles.meBody}>
        <Text style={styles.meOverline} {...textScale.badge}>
          {upperTR(`Senin sıran · ${periodLabel}`)}
        </Text>
        <Text style={styles.meLine} numberOfLines={1} {...textScale.dense}>
          {`${totalPlayers} oyuncu arasında${top != null && top <= 50 ? ` · ilk %${top}` : ""}`}
        </Text>
        <Text style={styles.meSub} numberOfLines={1} {...textScale.dense}>
          {`${me.predictions} tahmin · ${me.exact} tam skor`}
        </Text>
      </View>
      <View style={styles.mePoints}>
        <Text style={styles.mePointsValue} {...textScale.badge}>
          {me.points}
        </Text>
        <Text style={styles.meRankUnit} {...textScale.badge}>
          {upperTR("Puan")}
        </Text>
      </View>
    </View>
  );
}

const Row = memo(function Row({ entry, mine, last }: { entry: PredictionBoardEntry; mine: boolean; last: boolean }) {
  const medal = medalTone(entry.rank);
  return (
    <View
      style={[styles.row, !last && styles.rowRule, mine && styles.rowMine]}
      accessible
      accessibilityLabel={`${entry.rank}. ${entry.name}${mine ? " (sen)" : ""}${entry.teamName ? `, ${entry.teamName}` : ""}. ${entry.points} puan, ${entry.predictions} tahmin, ${entry.exact} tam skor.`}
    >
      {mine ? <View style={styles.mineBar} /> : null}
      <View style={styles.colRank}>
        {medal ? (
          <View style={[styles.medal, { backgroundColor: medal.fill, borderColor: medal.ring }]}>
            <Text style={[styles.medalText, { color: medal.ink }]} {...textScale.badge}>
              {entry.rank}
            </Text>
          </View>
        ) : (
          <Text style={styles.rank} {...textScale.badge}>
            {entry.rank}
          </Text>
        )}
      </View>
      <View style={styles.colName}>
        <Text style={[styles.name, mine && styles.nameMine]} numberOfLines={1} {...textScale.dense}>
          {mine ? `${entry.name} (sen)` : entry.name}
        </Text>
        {entry.teamName ? (
          <Text style={styles.team} numberOfLines={1} {...textScale.dense}>
            {entry.teamName}
          </Text>
        ) : null}
      </View>
      <Text style={[styles.num, styles.colNum]} {...textScale.badge}>
        {entry.predictions}
      </Text>
      <Text style={[styles.num, styles.colNum]} {...textScale.badge}>
        {entry.exact}
      </Text>
      <Text style={[styles.pts, styles.colPts, mine && styles.ptsMine]} {...textScale.badge}>
        {entry.points}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  me: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    padding: space.md,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.brandBorder,
    backgroundColor: colors.brandDim,
  },
  meRankBox: {
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brand,
  },
  meRank: { ...type.scoreMd, color: colors.textOnBrand },
  meRankLabel: { ...type.overline, color: colors.textOnBrand, opacity: 0.85 },
  meRankUnit: { ...type.overline, color: colors.textTertiary },
  meBody: { flex: 1, minWidth: 0, gap: 1 },
  meOverline: { ...type.overline, color: colors.brandAccent },
  meLine: { ...type.h4, color: colors.textPrimary },
  meSub: { ...type.caption, color: colors.textSecondary },
  mePoints: { alignItems: "flex-end" },
  mePointsValue: { ...type.metric, color: colors.textPrimary },
  table: {
    borderRadius: radius.xl,
    borderWidth: hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface1,
    overflow: "hidden",
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    backgroundColor: colors.surface2,
  },
  headText: { ...type.overline, color: colors.textTertiary },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: space.md, minHeight: 52, paddingVertical: space.sm },
  rowRule: { borderBottomWidth: hairline, borderBottomColor: colors.separator },
  rowMine: { backgroundColor: colors.brandDim },
  mineBar: { position: "absolute", left: 0, top: 0, bottom: 0, width: 3, backgroundColor: colors.brand },
  colRank: { width: 36, alignItems: "flex-start", justifyContent: "center" },
  colName: { flex: 1, minWidth: 0, paddingRight: space.sm },
  colNum: { width: 34, textAlign: "right" },
  colPts: { width: 46, textAlign: "right" },
  rank: { ...type.tableNumStrong, color: colors.textSecondary, width: 26, textAlign: "center" },
  medal: {
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  medalText: { ...type.numSmStrong },
  name: { ...type.h4, color: colors.textPrimary },
  nameMine: { color: colors.brandAccent },
  team: { ...type.caption, color: colors.textTertiary },
  num: { ...type.tableNum, color: colors.textSecondary },
  pts: { ...type.scoreXs, color: colors.textPrimary },
  ptsMine: { color: colors.brandAccent },
  foot: { ...type.caption, color: colors.textTertiary, textAlign: "center" },
});
