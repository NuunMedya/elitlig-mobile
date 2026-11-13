/**
 * PUAN SEKMESİ — maçın KENDİ ligi/sezonu (ekrandaki kapsam değil), iki takım
 * vurgulu.
 *
 * TABLO TEK YÜZEYDİR: satırlar ayrı kartlar değil, tek beyaz kartın dilimleri;
 * aralarında saç teli. Yirmi takımlık bir tablo "üst üste yığılmış yirmi kart"
 * gibi okunuyor, göz sütunları takip edemiyordu.
 *
 * VURGU VERİ RENGİNDE: maçın iki takımı `accentDim` zemin + solda 3px `accent`
 * işaretiyle çizilir (Arena: accent = vurgulanan takım). Hangi puanın
 * gösterileceğine sunucu karar verir (`display_points`); güç dengesi
 * sezonunda sütun başlığı "GP" olur. İstemci sıralamayı yeniden hesaplamaz.
 */

import { useRouter } from "expo-router";
import React, { memo, useCallback } from "react";
import { FlatList, StyleSheet, Text, View, type RefreshControlProps } from "react-native";

import { LinearGradient } from "expo-linear-gradient";
import { Aurora, EmptyState, ErrorState, Odometer, RankBadge, Reveal, SkeletonStandings, TeamLogo, Touchable } from "@/components/ui";
import { colors, fonts, hairline, layout, radius, space, textScale, type } from "@/theme";
import type { StandingRow } from "@/lib/types";
import type { ScrollChrome } from "./shared";

const ROW_HEIGHT = 46;

export interface StandingsTabProps {
  rows: StandingRow[] | undefined;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  /** Maç bir lig/sezona bağlı mı — değilse tablo yoktur. */
  scoped: boolean;
  leagueLabel: string | null;
  homeTeamId: number | null;
  awayTeamId: number | null;
  scrollProps: ScrollChrome;
  refreshControl: React.ReactElement<RefreshControlProps>;
}

const standingKey = (row: StandingRow) => String(row.team_id);

export function StandingsTab({
  rows,
  loading,
  error,
  onRetry,
  scoped,
  leagueLabel,
  homeTeamId,
  awayTeamId,
  scrollProps,
  refreshControl,
}: StandingsTabProps) {
  const router = useRouter();
  const list = rows ?? [];
  const power = list[0]?.standings_type === "gucdengesi";
  const total = list.length;

  const openTeam = useCallback((teamId: number) => router.push(`/takim/${teamId}`), [router]);

  const renderItem = useCallback(
    ({ item, index }: { item: StandingRow; index: number }) => (
      <StandingItem
        rank={index + 1}
        row={item}
        last={index === total - 1}
        highlighted={
          Number(item.team_id) === Number(homeTeamId) || Number(item.team_id) === Number(awayTeamId)
        }
        onPress={openTeam}
      />
    ),
    [awayTeamId, homeTeamId, openTeam, total],
  );

  const layoutFor = useCallback(
    (_data: ArrayLike<StandingRow> | null | undefined, index: number) => ({
      length: ROW_HEIGHT,
      offset: ROW_HEIGHT * index,
      index,
    }),
    [],
  );

  if (!scoped) {
    return (
      <EmptyState
        icon="podium-outline"
        title="Puan tablosu yok"
        body="Bu maç bir lig ya da sezona bağlı olmadığı için tablo gösterilemiyor."
      />
    );
  }

  if (loading) return <SkeletonStandings count={10} />;
  if (error && list.length === 0) return <ErrorState error={error} onRetry={onRetry} />;

  return (
    <FlatList
      {...scrollProps}
      data={list}
      keyExtractor={standingKey}
      renderItem={renderItem}
      getItemLayout={layoutFor}
      refreshControl={refreshControl}
      contentContainerStyle={styles.content}
      initialNumToRender={16}
      windowSize={8}
      ListHeaderComponent={
        list.length ? (
          <View>
            <DuelSlice
              rows={list}
              homeTeamId={homeTeamId}
              awayTeamId={awayTeamId}
              power={power}
              onOpen={openTeam}
            />
            {leagueLabel ? (
              <Text style={styles.caption} numberOfLines={1} {...textScale.dense}>
                {leagueLabel}
              </Text>
            ) : null}
            <View style={[styles.slice, styles.sliceFirst, styles.head]}>
              <Text style={[styles.headText, styles.rank, styles.rankText]} {...textScale.badge}>
                #
              </Text>
              <Text style={[styles.headText, styles.teamHead]} {...textScale.badge}>
                TAKIM
              </Text>
              {["O", "G", "B", "M"].map((label) => (
                <Text key={label} style={[styles.headText, styles.num]} {...textScale.badge}>
                  {label}
                </Text>
              ))}
              <Text style={[styles.headText, styles.numWide]} {...textScale.badge}>
                AV
              </Text>
              <Text style={[styles.headText, styles.numWide]} {...textScale.badge}>
                {power ? "GP" : "P"}
              </Text>
            </View>
          </View>
        ) : null
      }
      ListEmptyComponent={
        <EmptyState
          icon="podium-outline"
          variant="inline"
          title="Tablo boş"
          body="Bu sezonda henüz maç oynanmamış."
        />
      }
    />
  );
}


/**
 * PUAN KESİTİ — tablonun bu maçı ilgilendiren dilimi, tam tablodan ÖNCE.
 *
 * Üstte iki takımın yeri büyük (sıra rozeti · puan Odometer), ortada puan
 * farkı; altında iki takımın ve komşularının satırları. Takımlar birbirinden
 * uzaksa aradaki boşluk "⋯" ile kısaltılır — kesit en fazla yedi satırdır.
 */
const DuelSlice = memo(function DuelSlice({
  rows,
  homeTeamId,
  awayTeamId,
  power,
  onOpen,
}: {
  rows: StandingRow[];
  homeTeamId: number | null;
  awayTeamId: number | null;
  power: boolean;
  onOpen: (teamId: number) => void;
}) {
  const homeIndex = rows.findIndex((row) => Number(row.team_id) === Number(homeTeamId));
  const awayIndex = rows.findIndex((row) => Number(row.team_id) === Number(awayTeamId));
  if (homeIndex < 0 && awayIndex < 0) return null;

  const picks = new Set<number>();
  for (const index of [homeIndex, awayIndex]) {
    if (index < 0) continue;
    for (const near of [index - 1, index, index + 1]) if (near >= 0 && near < rows.length) picks.add(near);
  }
  const ordered = [...picks].sort((a, b) => a - b);
  const home = homeIndex >= 0 ? rows[homeIndex] : null;
  const away = awayIndex >= 0 ? rows[awayIndex] : null;
  const gap = home && away ? Math.abs(Number(home.display_points) - Number(away.display_points)) : null;

  return (
    <Reveal scaleFrom={0.98}>
      <View style={styles.duel}>
        <LinearGradient
          colors={colors.gradientInk}
          start={{ x: 1, y: 0.5 }}
          end={{ x: 0, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
        <Aurora variant="stage" style={StyleSheet.absoluteFill} />
        <View style={styles.duelHead}>
          <DuelSide row={home} rank={homeIndex + 1} power={power} />
          <View style={styles.duelGap}>
            {gap != null ? (
              <>
                <Odometer value={gap} style={styles.duelGapValue} />
                <Text style={styles.duelGapLabel} {...textScale.badge}>
                  PUAN FARKI
                </Text>
              </>
            ) : null}
          </View>
          <DuelSide row={away} rank={awayIndex + 1} power={power} align="right" />
        </View>
      </View>
      <View style={styles.sliceCard}>
        {ordered.map((index, position) => {
          const skipped = position > 0 && index - ordered[position - 1] > 1;
          const row = rows[index];
          return (
            <React.Fragment key={row.team_id}>
              {skipped ? (
                <View style={styles.ellipsis}>
                  <Text style={styles.ellipsisText} {...textScale.badge}>
                    ⋯
                  </Text>
                </View>
              ) : null}
              <StandingItem
                rank={index + 1}
                row={row}
                last={false}
                bare
                highlighted={index === homeIndex || index === awayIndex}
                onPress={onOpen}
              />
            </React.Fragment>
          );
        })}
      </View>
      <Text style={styles.fullTitle} {...textScale.dense}>
        Tam tablo
      </Text>
    </Reveal>
  );
});

const DuelSide = memo(function DuelSide({
  row,
  rank,
  power,
  align = "left",
}: {
  row: StandingRow | null;
  rank: number;
  power: boolean;
  align?: "left" | "right";
}) {
  if (!row) return <View style={styles.duelSide} />;
  const right = align === "right";
  return (
    <View style={[styles.duelSide, right ? styles.duelSideRight : null]}>
      <View style={[styles.duelTop, right ? styles.duelTopRight : null]}>
        <TeamLogo name={row.team_name} logo={row.logo} size={layout.crestLg} />
        <View style={styles.duelRank}>
          <Text style={styles.duelRankText} {...textScale.badge}>
            {`${rank}.`}
          </Text>
        </View>
      </View>
      <Text style={[styles.duelName, right ? styles.alignRight : null]} numberOfLines={1} {...textScale.dense}>
        {row.team_name}
      </Text>
      <View style={[styles.duelPoints, right ? styles.duelTopRight : null]}>
        <Odometer value={row.display_points} style={styles.duelPointsValue} />
        <Text style={styles.duelPointsUnit} {...textScale.badge}>
          {power ? "GP" : "P"}
        </Text>
      </View>
    </View>
  );
});

const StandingItem = memo(function StandingItem({
  rank,
  row,
  last,
  highlighted,
  onPress,
  bare = false,
}: {
  rank: number;
  row: StandingRow;
  last: boolean;
  highlighted: boolean;
  onPress: (teamId: number) => void;
  /** Kesit kartının içinde: kart dilimi kenarları çizilmez. */
  bare?: boolean;
}) {
  const open = useCallback(() => onPress(Number(row.team_id)), [onPress, row.team_id]);
  const diff = Number(row.goal_diff ?? 0);

  return (
    <Touchable
      feedback="row"
      haptic="selection"
      onPress={open}
      style={[
        bare ? styles.bareRow : styles.slice,
        styles.row,
        last ? styles.sliceLast : null,
        highlighted ? styles.rowActive : null,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${rank}. ${row.team_name}, ${row.played} maç, ${row.display_points} puan`}
    >
      {highlighted ? (
        <LinearGradient
          colors={colors.gradientSignature}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={styles.mark}
        />
      ) : null}
      <View style={styles.rank}>
        {rank <= 3 ? (
          <RankBadge rank={rank} size={20} />
        ) : (
          <Text style={[styles.cell, styles.rankText, highlighted ? styles.strong : null]} {...textScale.dense}>
            {rank}
          </Text>
        )}
      </View>
      <TeamLogo name={row.team_name} logo={row.logo} size={layout.crestSm} />
      <Text style={[styles.name, highlighted ? styles.nameActive : null]} numberOfLines={1} {...textScale.dense}>
        {row.team_name}
      </Text>
      <Text style={[styles.cell, styles.num]} {...textScale.dense}>
        {row.played}
      </Text>
      {/* Kesitte G/B/M yok: ad sığsın, göz puana gitsin. */}
      {bare ? null : (
        <>
          <Text style={[styles.cell, styles.num]} {...textScale.dense}>
            {row.wins}
          </Text>
          <Text style={[styles.cell, styles.num]} {...textScale.dense}>
            {row.draws}
          </Text>
          <Text style={[styles.cell, styles.num]} {...textScale.dense}>
            {row.losses}
          </Text>
        </>
      )}
      <Text style={[styles.cell, styles.numWide]} {...textScale.dense}>
        {diff > 0 ? `+${diff}` : diff}
      </Text>
      <Text style={[styles.cell, styles.numWide, styles.points]} {...textScale.dense}>
        {row.display_points}
      </Text>
    </Touchable>
  );
});

const styles = StyleSheet.create({
  content: {
    paddingTop: space.md,
    paddingBottom: space.huge * 2,
  },
  caption: {
    ...type.bodySm,
    color: colors.textTertiary,
    paddingHorizontal: layout.screenPadding + space.xs,
    paddingBottom: space.sm,
  },
  slice: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.s,
    marginHorizontal: layout.screenPadding,
    paddingHorizontal: space.md,
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
  head: {
    height: 36,
  },
  headText: {
    ...type.overline,
    color: colors.textTertiary,
  },
  teamHead: {
    flex: 1,
    paddingLeft: layout.crestSm + space.s,
  },
  row: {
    height: ROW_HEIGHT,
    borderTopWidth: hairline,
    borderTopColor: colors.separator,
    overflow: "hidden",
  },
  rowActive: {
    backgroundColor: colors.brandDim,
  },
  bareRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.s,
    paddingHorizontal: space.md,
  },
  mark: {
    position: "absolute",
    left: 0,
    top: space.sm,
    bottom: space.sm,
    width: 3,
    borderTopRightRadius: radius.xs,
    borderBottomRightRadius: radius.xs,
  },
  cell: {
    ...type.tableNum,
    color: colors.textSecondary,
  },
  strong: {
    ...type.tableNumStrong,
    color: colors.textPrimary,
  },
  rank: {
    width: 28,
    alignItems: "center",
  },
  rankText: {
    textAlign: "center",
  },

  /* — Kesit — */
  duel: {
    marginHorizontal: layout.screenPadding,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    overflow: "hidden",
    backgroundColor: colors.inkBlock,
  },
  duelHead: {
    flexDirection: "row",
    alignItems: "center",
    padding: space.lg,
  },
  duelSide: {
    flex: 1,
    minWidth: 0,
    gap: space.xs,
  },
  duelSideRight: {
    alignItems: "flex-end",
  },
  duelTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  duelTopRight: {
    flexDirection: "row-reverse",
  },
  duelRank: {
    height: 22,
    paddingHorizontal: space.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.inkPill,
    borderWidth: hairline,
    borderColor: colors.inkPillBorder,
    justifyContent: "center",
  },
  duelRankText: {
    ...type.numSmStrong,
    color: colors.onDark,
  },
  duelName: {
    ...type.h4,
    color: colors.onDark,
  },
  duelPoints: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: space.xxs,
  },
  duelPointsValue: {
    ...type.scoreLg,
    color: colors.onDark,
  },
  duelPointsUnit: {
    ...type.overline,
    color: colors.brandOnDark,
    marginBottom: space.xs,
  },
  duelGap: {
    width: 84,
    alignItems: "center",
  },
  duelGapValue: {
    ...type.scoreMd,
    color: colors.brandOnDark,
  },
  duelGapLabel: {
    ...type.overline,
    color: colors.onDarkMuted,
  },
  sliceCard: {
    marginHorizontal: layout.screenPadding,
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
    overflow: "hidden",
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderTopWidth: 0,
    borderColor: colors.border,
  },
  ellipsis: {
    height: 22,
    alignItems: "center",
    justifyContent: "center",
    borderTopWidth: hairline,
    borderTopColor: colors.separator,
  },
  ellipsisText: {
    ...type.label,
    color: colors.textTertiary,
  },
  fullTitle: {
    ...type.h2,
    color: colors.textPrimary,
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.xl,
    paddingBottom: space.xs,
  },
  alignRight: {
    textAlign: "right",
  },
  name: {
    ...type.bodySm,
    fontFamily: fonts.medium,
    color: colors.textPrimary,
    flex: 1,
    minWidth: 0,
  },
  nameActive: {
    fontFamily: fonts.semibold,
  },
  num: {
    width: 22,
    textAlign: "center",
  },
  numWide: {
    width: 34,
    textAlign: "right",
  },
  points: {
    ...type.tableNumStrong,
    color: colors.textPrimary,
  },
});
