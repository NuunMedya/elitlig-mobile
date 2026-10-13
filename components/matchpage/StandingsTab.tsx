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

import { EmptyState, ErrorState, SkeletonStandings, TeamLogo, Touchable } from "@/components/ui";
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
            {leagueLabel ? (
              <Text style={styles.caption} numberOfLines={1} {...textScale.dense}>
                {leagueLabel}
              </Text>
            ) : null}
            <View style={[styles.slice, styles.sliceFirst, styles.head]}>
              <Text style={[styles.headText, styles.rank]} {...textScale.badge}>
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

const StandingItem = memo(function StandingItem({
  rank,
  row,
  last,
  highlighted,
  onPress,
}: {
  rank: number;
  row: StandingRow;
  last: boolean;
  highlighted: boolean;
  onPress: (teamId: number) => void;
}) {
  const open = useCallback(() => onPress(Number(row.team_id)), [onPress, row.team_id]);
  const diff = Number(row.goal_diff ?? 0);

  return (
    <Touchable
      feedback="row"
      haptic="selection"
      onPress={open}
      style={[styles.slice, styles.row, last ? styles.sliceLast : null, highlighted ? styles.rowActive : null]}
      accessibilityRole="button"
      accessibilityLabel={`${rank}. ${row.team_name}, ${row.played} maç, ${row.display_points} puan`}
    >
      {highlighted ? <View style={styles.mark} /> : null}
      <Text style={[styles.cell, styles.rank, highlighted ? styles.strong : null]} {...textScale.dense}>
        {rank}
      </Text>
      <TeamLogo name={row.team_name} logo={row.logo} size={layout.crestSm} />
      <Text style={[styles.name, highlighted ? styles.nameActive : null]} numberOfLines={1} {...textScale.dense}>
        {row.team_name}
      </Text>
      <Text style={[styles.cell, styles.num]} {...textScale.dense}>
        {row.played}
      </Text>
      <Text style={[styles.cell, styles.num]} {...textScale.dense}>
        {row.wins}
      </Text>
      <Text style={[styles.cell, styles.num]} {...textScale.dense}>
        {row.draws}
      </Text>
      <Text style={[styles.cell, styles.num]} {...textScale.dense}>
        {row.losses}
      </Text>
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
    backgroundColor: colors.accentDim,
  },
  mark: {
    position: "absolute",
    left: 0,
    top: space.sm,
    bottom: space.sm,
    width: 3,
    borderTopRightRadius: radius.xs,
    borderBottomRightRadius: radius.xs,
    backgroundColor: colors.accent,
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
    width: 20,
    textAlign: "center",
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
    width: 20,
    textAlign: "center",
  },
  numWide: {
    width: 28,
    textAlign: "right",
  },
  points: {
    ...type.tableNumStrong,
    color: colors.textPrimary,
  },
});
