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

import { LinearGradient } from "expo-linear-gradient";
import {
  Aurora,
  EmptyState,
  FormChips,
  Odometer,
  Reveal,
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
      {/* — Kahraman: mürekkep sahne, iki arma, karşılaşma sayısı — */}
      <Reveal scaleFrom={0.98}>
        <View style={styles.hero}>
          <LinearGradient
            colors={colors.gradientInk}
            start={{ x: 1, y: 0.5 }}
            end={{ x: 0, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
          <Aurora variant="stage" style={StyleSheet.absoluteFill} />
          <View style={styles.idRow}>
            <TeamSide name={match.first_team_name} logo={homeLogo} form={homeForm} />
            <View style={styles.count}>
              <Odometer value={total} style={styles.countValue} />
              <Text style={styles.countLabel} {...textScale.badge}>
                KARŞILAŞMA
              </Text>
            </View>
            <TeamSide name={match.second_team_name} logo={awayLogo} form={awayForm} />
          </View>

          {total > 0 ? (
            <View style={styles.split}>
              <ResultStrip home={tally.homeWins} draws={tally.draws} away={tally.awayWins} />
            </View>
          ) : null}
        </View>
      </Reveal>

      {/* — G / B / M: ev sahibi gözünden, büyük rakamlar — */}
      {total > 0 ? (
        <View style={styles.tiles}>
          <ResultTile value={tally.homeWins} letter="G" label={`${shortName(match.first_team_name)} kazandı`} tone="win" index={0} />
          <ResultTile value={tally.draws} letter="B" label="Berabere" tone="draw" index={1} />
          <ResultTile value={tally.awayWins} letter="M" label={`${shortName(match.second_team_name)} kazandı`} tone="loss" index={2} />
        </View>
      ) : null}

      {total > 0 ? (
        <PaperCard style={styles.goalsCard}>
          <View style={styles.goals}>
            <StatBar label="Atılan gol" home={tally.homeGoals} away={tally.awayGoals} />
          </View>
        </PaperCard>
      ) : null}

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
      <View style={styles.crestHalo}>
        <TeamLogo name={name} logo={logo} size={layout.crestXl - 8} />
      </View>
      <Text style={styles.sideName} numberOfLines={2} {...textScale.dense}>
        {name}
      </Text>
      {form ? <FormChips form={form} size="xs" /> : <Text style={styles.noForm}>Form yok</Text>}
    </View>
  );
});

/** "ÖZMEN PETROL SPOR" → "ÖZMEN" — karo etiketi tek kelimeye sığmalı. */
function shortName(name: string): string {
  return String(name ?? "").trim().split(/\s+/)[0] ?? name;
}

const TILE_TONES = {
  win: { bg: colors.winDim, fg: colors.win },
  draw: { bg: colors.drawDim, fg: colors.draw },
  loss: { bg: colors.lossDim, fg: colors.loss },
} as const;

/** Büyük sonuç karosu: harf rozeti · Odometer sayı · etiket. */
const ResultTile = memo(function ResultTile({
  value,
  letter,
  label,
  tone,
  index,
}: {
  value: number;
  letter: string;
  label: string;
  tone: keyof typeof TILE_TONES;
  index: number;
}) {
  const t = TILE_TONES[tone];
  return (
    <Reveal index={index} style={styles.tileWrap}>
      <View style={styles.tile} accessible accessibilityLabel={`${label}: ${value}`}>
        <View style={[styles.tileLetter, { backgroundColor: t.bg }]}>
          <Text style={[styles.tileLetterText, { color: t.fg }]} {...textScale.badge}>
            {letter}
          </Text>
        </View>
        <Odometer value={value} style={[styles.tileValue, { color: t.fg }]} />
        <Text style={styles.tileLabel} numberOfLines={2} {...textScale.dense}>
          {label}
        </Text>
      </View>
    </Reveal>
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
      {home > 0 ? (
        <LinearGradient
          colors={colors.gradientSignature}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={[styles.stripPart, { flex: home }]}
        />
      ) : null}
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
      <View
        style={[
          styles.resultStripe,
          result === "G" ? styles.chipTextWinBg : result === "M" ? styles.chipTextLossBg : styles.chipTextDrawBg,
        ]}
      />
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

  /* — Kahraman — */
  hero: {
    marginHorizontal: layout.screenPadding,
    borderRadius: radius.xxl,
    overflow: "hidden",
    backgroundColor: colors.inkBlock,
    borderWidth: hairline,
    borderColor: colors.glassBorder,
  },
  idRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: space.lg,
    paddingTop: space.xl,
    paddingBottom: space.md,
  },
  side: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    gap: space.sm,
  },
  crestHalo: {
    width: layout.crestXl + 8,
    height: layout.crestXl + 8,
    borderRadius: (layout.crestXl + 8) / 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.inkTile,
    borderWidth: 1.5,
    borderColor: colors.inkPillBorder,
  },
  sideName: {
    ...type.h4,
    color: colors.onDark,
    textAlign: "center",
  },
  noForm: {
    ...type.caption,
    color: colors.onDarkMuted,
  },
  count: {
    width: 96,
    alignItems: "center",
    paddingTop: space.sm,
  },
  countValue: {
    ...type.scoreJumbo,
    color: colors.onDark,
  },
  countLabel: {
    ...type.overline,
    color: colors.brandOnDark,
  },
  split: {
    paddingHorizontal: space.lg,
    paddingBottom: space.lg,
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
  stripDraw: {
    backgroundColor: colors.onDarkMuted,
  },
  stripAway: {
    backgroundColor: colors.liveOnDark,
  },

  /* — G / B / M karoları — */
  tiles: {
    flexDirection: "row",
    gap: space.sm,
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.md,
  },
  tileWrap: {
    flex: 1,
  },
  tile: {
    alignItems: "center",
    gap: space.xxs,
    paddingVertical: space.md,
    paddingHorizontal: space.xs,
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  tileLetter: {
    width: 26,
    height: 26,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  tileLetterText: {
    ...type.label,
    fontFamily: fonts.bold,
  },
  tileValue: {
    ...type.scoreHero,
  },
  tileLabel: {
    ...type.caption,
    color: colors.textTertiary,
    textAlign: "center",
  },
  goalsCard: {
    marginTop: space.md,
  },
  goals: {
    paddingHorizontal: space.lg,
    paddingVertical: space.xs,
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
  resultStripe: {
    position: "absolute",
    left: 0,
    top: space.md,
    bottom: space.md,
    width: 3,
    borderTopRightRadius: 2,
    borderBottomRightRadius: 2,
  },
  chipTextWinBg: { backgroundColor: colors.win },
  chipTextDrawBg: { backgroundColor: colors.draw },
  chipTextLossBg: { backgroundColor: colors.loss },
});
