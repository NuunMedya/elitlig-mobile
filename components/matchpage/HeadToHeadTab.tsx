/**
 * H2H SEKMESİ — iki takımın aralarındaki geçmiş ve son formları.
 *
 * DÜZEN:
 *   1. Kimlik kartı — iki arma, adlar, son beş maç formu; ortada karşılaşma
 *      sayısı. Altında üç parçalı sonuç şeridi: ev sahibi galibiyeti (veri
 *      rengi) · beraberlik (nötr) · deplasman galibiyeti (slate). Şeridin
 *      uzunlukları gerçek oranlardır; sayılar şeridin üstünde yazılı.
 *   2. "Atılan gol" karşılaştırması — aralarındaki maçlarda.
 *   3. Son karşılaşmalar — tek kartta satırlar: tarih · iki takım alt alta
 *      (kazanan kalın) · skor sütunu · sonuç çipi (ev sahibi gözünden).
 *
 * VERİ: iki takımın maç listelerinden süzülür (`useHeadToHead`); yalnız
 * tamamlanmış maçlar, en fazla on. Bu maçın kendisi listeye girmez.
 */

import { useRouter } from "expo-router";
import React, { memo, useCallback } from "react";
import { FlatList, StyleSheet, Text, View, type RefreshControlProps } from "react-native";

import {
  EmptyState,
  FormChips,
  SectionHeader,
  SkeletonCard,
  SkeletonListRow,
  StatBar,
  TeamLogo,
  Touchable,
} from "@/components/ui";
import { formatDateShort } from "@/lib/format";
import { colors, fonts, hairline, layout, radius, space, textScale, type } from "@/theme";
import type { ApiMatch } from "@/lib/types";
import { PaperCard } from "./parts";
import {
  normalizeName,
  resultFor,
  useFormString,
  useHeadToHeadTally,
  type ScrollChrome,
} from "./shared";

export interface HeadToHeadTabProps {
  match: ApiMatch;
  meetings: ApiMatch[];
  homeTeamId: number | null;
  awayTeamId: number | null;
  homeMatches: ApiMatch[] | undefined;
  awayMatches: ApiMatch[] | undefined;
  loading: boolean;
  homeLogo: string | null;
  awayLogo: string | null;
  scrollProps: ScrollChrome;
  refreshControl: React.ReactElement<RefreshControlProps>;
}

const matchKey = (item: ApiMatch) => String(item.id);

export function HeadToHeadTab({
  match,
  meetings,
  homeTeamId,
  awayTeamId,
  homeMatches,
  awayMatches,
  loading,
  homeLogo,
  awayLogo,
  scrollProps,
  refreshControl,
}: HeadToHeadTabProps) {
  const router = useRouter();
  const homeName = normalizeName(match.first_team_name);
  const awayName = normalizeName(match.second_team_name);

  const tally = useHeadToHeadTally(meetings, homeTeamId, homeName);
  const homeForm = useFormString(homeMatches, match.id, homeTeamId, homeName);
  const awayForm = useFormString(awayMatches, match.id, awayTeamId, awayName);

  // MeetingRow memo'lu: `onOpen` her render'da yeniden üretilmemeli.
  const openMatch = useCallback((id: number) => router.push(`/mac/${id}`), [router]);

  const total = meetings.length;
  const renderItem = useCallback(
    ({ item, index }: { item: ApiMatch; index: number }) => (
      <MeetingRow
        meeting={item}
        result={resultFor(item, homeTeamId, homeName)}
        onOpen={openMatch}
        index={index}
        total={total}
      />
    ),
    [homeName, homeTeamId, openMatch, total],
  );

  if (loading && meetings.length === 0) {
    return (
      <View style={styles.loading}>
        <SkeletonCard lines={3} />
        <SkeletonListRow count={5} />
      </View>
    );
  }

  const header = (
    <View>
      <PaperCard>
        <View style={styles.idRow}>
          <TeamSide name={match.first_team_name} logo={homeLogo} form={homeForm} />
          <View style={styles.count}>
            <Text style={styles.countValue} {...textScale.dense}>
              {total}
            </Text>
            <Text style={styles.countLabel} {...textScale.badge}>
              KARŞILAŞMA
            </Text>
          </View>
          <TeamSide name={match.second_team_name} logo={awayLogo} form={awayForm} />
        </View>

        {total > 0 ? (
          <View style={styles.split}>
            <View style={styles.splitNumbers}>
              <SplitNumber value={tally.homeWins} label="Galibiyet" align="left" />
              <SplitNumber value={tally.draws} label="Beraberlik" align="center" />
              <SplitNumber value={tally.awayWins} label="Galibiyet" align="right" />
            </View>
            <ResultStrip home={tally.homeWins} draws={tally.draws} away={tally.awayWins} />
          </View>
        ) : null}

        {total > 0 ? (
          <View style={styles.goals}>
            <StatBar label="Atılan gol" home={tally.homeGoals} away={tally.awayGoals} />
          </View>
        ) : null}
      </PaperCard>

      {total > 0 ? <SectionHeader title="Son karşılaşmalar" meta="sonuç ev sahibi gözünden" /> : null}
    </View>
  );

  return (
    <FlatList
      {...scrollProps}
      data={meetings}
      keyExtractor={matchKey}
      renderItem={renderItem}
      refreshControl={refreshControl}
      contentContainerStyle={styles.content}
      ListHeaderComponent={header}
      ListEmptyComponent={
        <EmptyState
          icon="git-compare-outline"
          variant="inline"
          title="İlk karşılaşma"
          body="Bu iki takım daha önce tamamlanmış bir maçta karşılaşmamış."
        />
      }
    />
  );
}

/** Kimlik kartının bir yanı: arma · ad · son beş maç. */
const TeamSide = memo(function TeamSide({
  name,
  logo,
  form,
}: {
  name: string;
  logo: string | null;
  form: string;
}) {
  return (
    <View style={styles.side}>
      <TeamLogo name={name} logo={logo} size={layout.crestXl - 8} />
      <Text style={styles.sideName} numberOfLines={2} {...textScale.dense}>
        {name}
      </Text>
      {form ? <FormChips form={form} size="xs" /> : <Text style={styles.noForm}>Form yok</Text>}
    </View>
  );
});

const SplitNumber = memo(function SplitNumber({
  value,
  label,
  align,
}: {
  value: number;
  label: string;
  align: "left" | "center" | "right";
}) {
  const alignItems = align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center";
  return (
    <View style={[styles.splitCell, { alignItems }]}>
      <Text style={styles.splitValue} {...textScale.dense}>
        {value}
      </Text>
      <Text style={styles.splitLabel} {...textScale.dense}>
        {label}
      </Text>
    </View>
  );
});

/**
 * Üç parçalı sonuç şeridi. Parça uzunluğu sonuç sayısıyla orantılıdır; sıfır
 * olan parça hiç çizilmez (en küçük parça bile görünür kalsın diye `flex`
 * değeri sayı kadardır, yüzde değil).
 */
const ResultStrip = memo(function ResultStrip({ home, draws, away }: { home: number; draws: number; away: number }) {
  return (
    <View style={styles.strip}>
      {home > 0 ? <View style={[styles.stripPart, styles.stripHome, { flex: home }]} /> : null}
      {draws > 0 ? <View style={[styles.stripPart, styles.stripDraw, { flex: draws }]} /> : null}
      {away > 0 ? <View style={[styles.stripPart, styles.stripAway, { flex: away }]} /> : null}
    </View>
  );
});

/** Geçmiş maç satırı — kart dilimi; iki takım alt alta, kazanan kalın. */
const MeetingRow = memo(function MeetingRow({
  meeting,
  result,
  onOpen,
  index,
  total,
}: {
  meeting: ApiMatch;
  result: "G" | "B" | "M";
  onOpen: (matchId: number) => void;
  index: number;
  total: number;
}) {
  const open = useCallback(() => onOpen(Number(meeting.id)), [meeting.id, onOpen]);
  const first = meeting.first_team_score;
  const second = meeting.second_team_score;
  const firstWon = first != null && second != null && first > second;
  const secondWon = first != null && second != null && second > first;
  const year = String(meeting.date ?? "").slice(0, 4);

  return (
    <Touchable
      feedback="row"
      haptic="selection"
      onPress={open}
      style={[
        styles.slice,
        index === 0 ? styles.sliceFirst : styles.ruled,
        index === total - 1 ? styles.sliceLast : null,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${formatDateShort(meeting.date)} ${year}: ${meeting.first_team_name} ${first ?? "-"}, ${meeting.second_team_name} ${second ?? "-"}`}
    >
      <View style={styles.date}>
        <Text style={styles.dateDay} {...textScale.dense}>
          {formatDateShort(meeting.date)}
        </Text>
        <Text style={styles.dateYear} {...textScale.dense}>
          {year}
        </Text>
      </View>

      <View style={styles.teams}>
        <View style={styles.teamLine}>
          <Text style={[styles.team, firstWon ? styles.teamWon : null]} numberOfLines={1} {...textScale.dense}>
            {meeting.first_team_name}
          </Text>
          <Text style={[styles.score, firstWon ? styles.scoreWon : null]} {...textScale.dense}>
            {first ?? "-"}
          </Text>
        </View>
        <View style={styles.teamLine}>
          <Text style={[styles.team, secondWon ? styles.teamWon : null]} numberOfLines={1} {...textScale.dense}>
            {meeting.second_team_name}
          </Text>
          <Text style={[styles.score, secondWon ? styles.scoreWon : null]} {...textScale.dense}>
            {second ?? "-"}
          </Text>
        </View>
      </View>

      <View
        style={[
          styles.chip,
          result === "G" ? styles.chipWin : result === "M" ? styles.chipLoss : styles.chipDraw,
        ]}
      >
        <Text
          style={[
            styles.chipText,
            result === "G" ? styles.chipTextWin : result === "M" ? styles.chipTextLoss : styles.chipTextDraw,
          ]}
          {...textScale.badge}
        >
          {result}
        </Text>
      </View>
    </Touchable>
  );
});

const styles = StyleSheet.create({
  content: {
    paddingTop: space.lg,
    paddingBottom: space.huge * 2,
  },
  loading: {
    paddingTop: space.lg,
    gap: space.md,
  },
  ruled: {
    borderTopWidth: hairline,
    borderTopColor: colors.separator,
  },

  /* — Kimlik kartı — */
  idRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.md,
  },
  side: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    gap: space.sm,
  },
  sideName: {
    ...type.h4,
    color: colors.textPrimary,
    textAlign: "center",
  },
  noForm: {
    ...type.caption,
    color: colors.textTertiary,
  },
  count: {
    width: 88,
    alignItems: "center",
    paddingTop: space.xs,
  },
  countValue: {
    ...type.metric,
    fontSize: 34,
    lineHeight: 40,
    color: colors.textPrimary,
  },
  countLabel: {
    ...type.overline,
    color: colors.textTertiary,
  },

  split: {
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.lg,
    gap: space.sm,
    borderTopWidth: hairline,
    borderTopColor: colors.separator,
  },
  splitNumbers: {
    flexDirection: "row",
  },
  splitCell: {
    flex: 1,
  },
  splitValue: {
    ...type.metricSm,
    color: colors.textPrimary,
  },
  splitLabel: {
    ...type.caption,
    color: colors.textTertiary,
  },
  strip: {
    flexDirection: "row",
    gap: space.xs,
    height: 8,
  },
  stripPart: {
    height: 8,
    borderRadius: radius.pill,
  },
  stripHome: {
    backgroundColor: colors.accent,
  },
  stripDraw: {
    backgroundColor: colors.slateSoft,
  },
  stripAway: {
    backgroundColor: colors.slate,
  },
  goals: {
    paddingHorizontal: space.lg,
    paddingBottom: space.sm,
    borderTopWidth: hairline,
    borderTopColor: colors.separator,
  },

  /* — Geçmiş maç satırı (kart dilimi) — */
  slice: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    minHeight: 64,
    marginHorizontal: layout.screenPadding,
    paddingHorizontal: space.lg,
    backgroundColor: colors.surface1,
    borderLeftWidth: hairline,
    borderRightWidth: hairline,
    borderLeftColor: colors.border,
    borderRightColor: colors.border,
  },
  sliceFirst: {
    borderTopWidth: hairline,
    borderTopColor: colors.border,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
  },
  sliceLast: {
    borderBottomWidth: hairline,
    borderBottomColor: colors.border,
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
  },
  date: {
    width: 48,
  },
  dateDay: {
    ...type.caption,
    fontFamily: fonts.semibold,
    color: colors.textSecondary,
  },
  dateYear: {
    ...type.caption,
    color: colors.textTertiary,
  },
  teams: {
    flex: 1,
    minWidth: 0,
    gap: space.xs,
    paddingVertical: space.m,
    paddingRight: space.md,
    borderRightWidth: hairline,
    borderRightColor: colors.separator,
  },
  teamLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  team: {
    ...type.bodySm,
    color: colors.textSecondary,
    flex: 1,
    minWidth: 0,
  },
  teamWon: {
    fontFamily: fonts.semibold,
    color: colors.textPrimary,
  },
  score: {
    ...type.tableNum,
    color: colors.textSecondary,
  },
  scoreWon: {
    ...type.tableNumStrong,
    color: colors.textPrimary,
  },
  chip: {
    width: 26,
    height: 26,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  chipWin: { backgroundColor: colors.winDim },
  chipDraw: { backgroundColor: colors.drawDim },
  chipLoss: { backgroundColor: colors.lossDim },
  chipText: {
    ...type.micro,
    fontFamily: fonts.bold,
  },
  chipTextWin: { color: colors.win },
  chipTextDraw: { color: colors.draw },
  chipTextLoss: { color: colors.loss },
});
