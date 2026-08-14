import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  FlatList,
  LayoutAnimation,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  UIManager,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScopeBar } from "@/components/ScopeBar";
import { ScreenHeader } from "@/components/ScreenHeader";
import { EmptyState, ErrorState, Loading } from "@/components/States";
import { TeamCrest } from "@/components/TeamCrest";
import { colors, radius, spacing, type } from "@/constants/theme";
import { getStandings } from "@/lib/api/standings";
import { queryKeys } from "@/lib/queryKeys";
import { useScope } from "@/providers/ScopeProvider";
import type { StandingRow } from "@/lib/types";

/**
 * Puan Durumu — sitedeki Lig Tablosu sayfasının mobil karşılığı.
 *
 * Üstte özet kartları, altında tam tablo; son 5 formu renkli çiplerle.
 * Güç dengesi sezonlarında tablo üstünde açılır-kapanır bilgi kutusu:
 * sitedeki açıklama, katsayı tablosu ve seviye rozetleriyle birebir.
 */
if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/** Güç dengesi açıklaması — sitedeki bilgi kutusuyla birebir aynı içerik. */
const POWER_BALANCE_INFO =
  "Bir maçtan alınan puan rakibin gücüne (endeksine) göre değişir. Endeks " +
  "bir takımın güç rozetidir (1\u20136); ilk 5 maç boyunca herkes için 3 kabul " +
  "edilir. Toplam puan 0\u2019ın altına düşmez.";

/** Sitedeki katsayı tablosu: rakip seviyesi → galibiyet / beraberlik / mağlubiyet. */
const POWER_BALANCE_TABLE = [
  { level: "1 \u2013 3", win: "+3", draw: "1", loss: "\u22123" },
  { level: "4", win: "+4", draw: "1", loss: "\u22122" },
  { level: "5", win: "+5", draw: "1", loss: "\u22121" },
  { level: "6", win: "+6", draw: "1", loss: "0" },
] as const;

/** Sitedeki seviye rozet renkleri (1 → 6). */
const LEVEL_COLORS = ["#9AA1B5", "#3F4454", "#3B72E8", "#22A45D", "#F59E0B", "#E8B00A"] as const;

export default function StandingsScreen() {
  const scope = useScope();
  const router = useRouter();
  const scopeKey = {
    cityId: scope.cityId ?? undefined,
    leagueId: scope.leagueId ?? undefined,
    seasonId: scope.seasonId ?? undefined,
  };

  const query = useQuery({
    queryKey: queryKeys.standings(scopeKey),
    queryFn: () =>
      getStandings({ cityId: scope.cityId!, leagueId: scope.leagueId!, seasonId: scope.seasonId! }),
    enabled: scope.ready,
    refetchInterval: 60_000,
  });

  const rows = query.data ?? [];
  const powerBalance = rows[0]?.standings_type === "gucdengesi";
  const highlights = useMemo(() => computeHighlights(rows), [rows]);
  const [infoOpen, setInfoOpen] = useState(false);

  const toggleInfo = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setInfoOpen((open) => !open);
  };

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader title="Puan Durumu" />
      <ScopeBar />

      {scope.loading || (query.isLoading && scope.ready) ? (
        <Loading />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={query.refetch} />
      ) : !scope.ready ? (
        <EmptyState
          icon="options-outline"
          title="Lig seçilmedi"
          body="Yukarıdan şehir, lig ve sezon seçerek başlayın."
        />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => String(item.team_id)}
          ListHeaderComponent={
            <>
              {highlights && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.cards}
                >
                  <StatCard kicker="LİDER" row={highlights.leader} detail={`${highlights.leader.display_points} puan`} />
                  <StatCard kicker="EN GOLCÜ" row={highlights.topScorer} detail={`${highlights.topScorer.goals_for} gol attı`} />
                  <StatCard kicker="EN AZ GOL YİYEN" row={highlights.bestDefense} detail={`${highlights.bestDefense.goals_against} gol yedi`} />
                  <StatCard kicker="FORMDA" row={highlights.inForm} detail={`Son 5: ${highlights.inForm.last5.slice(-5)}`} />
                </ScrollView>
              )}
              {powerBalance && (
                <View style={styles.infoWrap}>
                  <Pressable
                    onPress={toggleInfo}
                    style={({ pressed }) => [styles.infoHeader, pressed && styles.rowPressed]}
                  >
                    <Ionicons name="information-circle-outline" size={16} color={colors.turf} />
                    <Text style={styles.infoTitle}>Güç Dengesi puanlaması</Text>
                    <Ionicons
                      name={infoOpen ? "chevron-up" : "chevron-down"}
                      size={16}
                      color={colors.muted}
                    />
                  </Pressable>
                  {infoOpen && (
                    <View style={styles.infoContent}>
                      <Text style={styles.infoBody}>{POWER_BALANCE_INFO}</Text>

                      <View style={styles.pbHead}>
                        <Text style={[styles.pbHeadCell, styles.pbLevel]}>Rakip Seviyesi</Text>
                        <Text style={[styles.pbHeadCell, styles.pbNum]}>Galibiyet</Text>
                        <Text style={[styles.pbHeadCell, styles.pbNum]}>Beraberlik</Text>
                        <Text style={[styles.pbHeadCell, styles.pbNum]}>Mağlubiyet</Text>
                      </View>
                      {POWER_BALANCE_TABLE.map((row, index) => (
                        <View
                          key={row.level}
                          style={[styles.pbRow, index % 2 === 1 && styles.pbRowAlt]}
                        >
                          <Text style={[styles.pbCell, styles.pbLevel, styles.pbBold]}>
                            {row.level}
                          </Text>
                          <Text style={[styles.pbCell, styles.pbNum, styles.pbWin]}>{row.win}</Text>
                          <Text style={[styles.pbCell, styles.pbNum]}>{row.draw}</Text>
                          <Text style={[styles.pbCell, styles.pbNum, styles.pbLoss]}>{row.loss}</Text>
                        </View>
                      ))}

                      <View style={styles.levels}>
                        <Text style={styles.levelsLabel}>Seviyeler:</Text>
                        {LEVEL_COLORS.map((color, index) => (
                          <View
                            key={color}
                            style={[
                              styles.levelBadge,
                              { backgroundColor: color },
                              index === 5 && styles.levelBadgeTop,
                            ]}
                          >
                            <Text style={styles.levelText}>{index + 1}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  )}
                </View>
              )}
              <TableHead powerBalance={powerBalance} />
            </>
          }
          renderItem={({ item, index }) => (
            <Row
              row={item}
              position={index + 1}
              zebra={index % 2 === 1}
              onPress={() => router.push(`/takim/${item.team_id}`)}
            />
          )}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={query.isRefetching}
              onRefresh={query.refetch}
              tintColor={colors.turf}
            />
          }
          ListEmptyComponent={
            <EmptyState
              icon="podium-outline"
              title="Puan tablosu boş"
              body="Bu sezonda henüz maç oynanmamış."
            />
          }
        />
      )}
    </SafeAreaView>
  );
}

/** Sitedeki üst kartların verisi: lider, en golcü, en iyi savunma, formda. */
function computeHighlights(rows: StandingRow[]) {
  const played = rows.filter((row) => row.played > 0);
  if (!played.length) return null;

  const winsInLast5 = (row: StandingRow) =>
    (row.last5 ?? "").slice(-5).split("").filter((r) => r === "W").length;

  return {
    leader: rows[0],
    topScorer: [...played].sort((a, b) => b.goals_for - a.goals_for)[0],
    bestDefense: [...played].sort((a, b) => a.goals_against - b.goals_against)[0],
    inForm: [...played].sort((a, b) => winsInLast5(b) - winsInLast5(a))[0],
  };
}

function StatCard({
  kicker,
  row,
  detail,
}: {
  kicker: string;
  row: StandingRow;
  detail: string;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardKicker}>{kicker}</Text>
      <View style={styles.cardBody}>
        <TeamCrest name={row.team_name} logo={row.logo} size={28} />
        <View style={styles.cardText}>
          <Text style={styles.cardTeam} numberOfLines={1}>
            {row.team_name.toLocaleUpperCase("tr-TR")}
          </Text>
          <Text style={styles.cardDetail}>{detail}</Text>
        </View>
      </View>
    </View>
  );
}

function TableHead({ powerBalance }: { powerBalance: boolean }) {
  return (
    <View style={styles.head}>
      <Text style={[styles.headCell, styles.posCell]}>#</Text>
      <Text style={[styles.headCell, styles.teamCell]}>TAKIM</Text>
      <Text style={[styles.headCell, styles.numCell]}>O</Text>
      <Text style={[styles.headCell, styles.numCell]}>AV</Text>
      <Text style={[styles.headCell, styles.numCell, styles.pointCell]}>
        {powerBalance ? "GP" : "P"}
      </Text>
    </View>
  );
}

function Row({
  row,
  position,
  zebra,
  onPress,
}: {
  row: StandingRow;
  position: number;
  zebra: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        zebra && styles.rowZebra,
        position <= 3 && styles.rowTop,
        pressed && styles.rowPressed,
      ]}
    >
      <Text style={[styles.cell, styles.posCell, position <= 3 && styles.posTop]}>
        {position}
      </Text>

      <View style={[styles.teamCell, styles.teamBox]}>
        <TeamCrest name={row.team_name} logo={row.logo} size={26} />
        <View style={styles.teamText}>
          <Text style={styles.teamName} numberOfLines={1}>
            {row.team_name.toLocaleUpperCase("tr-TR")}
          </Text>
          {row.last5 ? <Form last5={row.last5} /> : null}
        </View>
      </View>

      <Text style={[styles.cell, styles.numCell]}>{row.played}</Text>
      <Text style={[styles.cell, styles.numCell]}>{row.goal_diff}</Text>
      <Text style={[styles.cell, styles.numCell, styles.pointCell, styles.points]}>
        {row.display_points}
      </Text>
    </Pressable>
  );
}

/** Son 5 maç: sitedeki gibi galibiyet yeşil, beraberlik gri, mağlubiyet kırmızı. */
function Form({ last5 }: { last5: string }) {
  const styleOf = (result: string) =>
    result === "W" ? styles.chipWin : result === "L" ? styles.chipLoss : styles.chipDraw;
  const letterOf = (result: string) => (result === "W" ? "G" : result === "L" ? "M" : "B");

  return (
    <View style={styles.form}>
      {last5
        .slice(-5)
        .split("")
        .map((result, index) => (
          <View key={`${result}-${index}`} style={[styles.chip, styleOf(result)]}>
            <Text style={styles.chipText}>{letterOf(result)}</Text>
          </View>
        ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.pitch,
  },
  list: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
    flexGrow: 1,
  },
  cards: {
    gap: spacing.sm,
    paddingBottom: spacing.md,
  },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.faint,
    borderRadius: radius.md,
    padding: spacing.md,
    width: 190,
  },
  cardKicker: {
    ...type.caption,
    fontSize: 10,
    color: colors.muted,
  },
  cardBody: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  cardText: {
    flex: 1,
  },
  cardTeam: {
    ...type.small,
    color: colors.line,
    fontWeight: "800",
  },
  cardDetail: {
    ...type.caption,
    color: colors.turf,
    marginTop: 2,
    letterSpacing: 0,
  },
  infoWrap: {
    backgroundColor: colors.turfDim,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
    overflow: "hidden",
  },
  infoHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  infoTitle: {
    ...type.small,
    color: colors.turf,
    fontWeight: "800",
    flex: 1,
  },
  infoContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
  infoBody: {
    ...type.small,
    color: colors.line,
    lineHeight: 20,
    marginBottom: spacing.sm,
  },
  pbHead: {
    flexDirection: "row",
    paddingVertical: spacing.xs,
  },
  pbHeadCell: {
    ...type.caption,
    fontSize: 10,
    color: colors.muted,
    letterSpacing: 0,
  },
  pbRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.xs,
    marginBottom: 2,
  },
  pbRowAlt: {
    backgroundColor: colors.surfaceRaised,
  },
  pbCell: {
    ...type.small,
    color: colors.line,
    fontVariant: ["tabular-nums"],
  },
  pbBold: {
    fontWeight: "700",
  },
  pbLevel: {
    flex: 1.2,
    paddingLeft: spacing.xs,
  },
  pbNum: {
    flex: 1,
    textAlign: "center",
  },
  pbWin: {
    color: colors.green,
    fontWeight: "800",
  },
  pbLoss: {
    color: colors.live,
    fontWeight: "800",
  },
  levels: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  levelsLabel: {
    ...type.small,
    color: colors.muted,
  },
  levelBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  levelBadgeTop: {
    borderWidth: 2,
    borderColor: "#B8860B",
  },
  levelText: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.surface,
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  headCell: {
    ...type.caption,
    color: colors.muted,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    marginBottom: 2,
  },
  rowZebra: {
    backgroundColor: colors.surfaceRaised,
  },
  rowTop: {
    backgroundColor: colors.goldDim + "66",
  },
  rowPressed: {
    opacity: 0.7,
  },
  cell: {
    ...type.small,
    color: colors.line,
    fontVariant: ["tabular-nums"],
  },
  posCell: {
    width: 24,
    textAlign: "center",
    color: colors.muted,
  },
  posTop: {
    color: colors.turf,
    fontWeight: "800",
  },
  teamCell: {
    flex: 1,
  },
  teamBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingRight: spacing.sm,
  },
  teamText: {
    flex: 1,
    gap: 4,
  },
  teamName: {
    ...type.small,
    color: colors.line,
    fontWeight: "700",
  },
  form: {
    flexDirection: "row",
    gap: 3,
  },
  chip: {
    width: 14,
    height: 14,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  chipWin: {
    backgroundColor: colors.green,
  },
  chipDraw: {
    backgroundColor: "#B9B5C6",
  },
  chipLoss: {
    backgroundColor: colors.live,
  },
  chipText: {
    fontSize: 8,
    fontWeight: "800",
    color: colors.surface,
  },
  numCell: {
    width: 30,
    textAlign: "center",
  },
  pointCell: {
    width: 34,
  },
  points: {
    color: colors.turf,
    fontWeight: "800",
  },
});
