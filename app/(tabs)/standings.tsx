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
import { useFavorite } from "@/providers/FavoriteProvider";
import type { StandingRow } from "@/lib/types";

/**
 * Puan Durumu — sitedeki Lig Tablosu sayfasının mobil karşılığı.
 *
 * Üstte özet kartları (Lider · En Golcü · En Az Gol Yiyen · Formda), altında
 * tam tablo. Son 5 formu sunucudan gelir ("WDLWW"); sitedeki gibi galibiyet
 * yeşil, beraberlik gri, mağlubiyet kırmızı çiplerle gösterilir. Hangi puanın
 * gösterileceğine sunucu karar verir (`display_points`).
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
  const { isFavorite } = useFavorite();
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
  const top3 = rows.slice(0, 3);
  const rest  = rows.slice(3);

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
          data={rest}
          keyExtractor={(item) => String(item.team_id)}
          ListHeaderComponent={
            <>
              {highlights && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.cards}
                >
                  <StatCard icon="trophy" accent={colors.yellow} kicker="LİDER" row={highlights.leader} detail={`${highlights.leader.display_points} puan`} />
                  <StatCard icon="football" accent={colors.green} kicker="EN GOLCÜ" row={highlights.topScorer} detail={`${highlights.topScorer.goals_for} gol attı`} />
                  <StatCard icon="shield-checkmark" accent={colors.turf} kicker="EN AZ GOL YİYEN" row={highlights.bestDefense} detail={`${highlights.bestDefense.goals_against} gol yedi`} />
                  <StatCard icon="flame" accent="#E8B00A" kicker="FORMDA" row={highlights.inForm} detail={`Son 5: ${highlights.inForm.last5?.slice(-5) ?? ""}`} />
                </ScrollView>
              )}
              {/* Podyum */}
              {top3.length > 0 && (
                <View style={styles.podium}>
                  {top3[1] != null && (
                    <Pressable style={[styles.podCard, styles.podSilver]} onPress={() => router.push(`/takim/${top3[1].team_id}`)}>
                      <Text style={styles.podMedal}>🥈</Text>
                      <TeamCrest name={top3[1].team_name} logo={top3[1].logo} size={36} />
                      <Text style={styles.podName} numberOfLines={2}>{top3[1].team_name.toLocaleUpperCase("tr-TR")}</Text>
                      <Text style={styles.podPts}>{top3[1].display_points}</Text>
                      <Text style={styles.podUnit}>PUAN</Text>
                      {top3[1].last5 ? <Form last5={top3[1].last5} /> : null}
                    </Pressable>
                  )}
                  {top3[0] != null && (
                    <Pressable style={[styles.podCard, styles.podGold]} onPress={() => router.push(`/takim/${top3[0].team_id}`)}>
                      <Text style={styles.podMedal}>🥇</Text>
                      <TeamCrest name={top3[0].team_name} logo={top3[0].logo} size={50} />
                      <Text style={styles.podName} numberOfLines={2}>{top3[0].team_name.toLocaleUpperCase("tr-TR")}</Text>
                      <Text style={[styles.podPts, styles.podPtsGold]}>{top3[0].display_points}</Text>
                      <Text style={styles.podUnit}>PUAN</Text>
                      {top3[0].last5 ? <Form last5={top3[0].last5} /> : null}
                    </Pressable>
                  )}
                  {top3[2] != null && (
                    <Pressable style={[styles.podCard, styles.podBronze]} onPress={() => router.push(`/takim/${top3[2].team_id}`)}>
                      <Text style={styles.podMedal}>🥉</Text>
                      <TeamCrest name={top3[2].team_name} logo={top3[2].logo} size={36} />
                      <Text style={styles.podName} numberOfLines={2}>{top3[2].team_name.toLocaleUpperCase("tr-TR")}</Text>
                      <Text style={styles.podPts}>{top3[2].display_points}</Text>
                      <Text style={styles.podUnit}>PUAN</Text>
                      {top3[2].last5 ? <Form last5={top3[2].last5} /> : null}
                    </Pressable>
                  )}
                </View>
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
              position={index + 4}
              totalRows={rows.length}
              isFav={isFavorite(item.team_id)}
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

function StatCard({ icon, accent, kicker, row, detail }: {
  icon: string; accent: string; kicker: string; row: StandingRow; detail: string;
}) {
  return (
    <View style={[styles.card, { borderTopColor: accent, borderTopWidth: 3 }]}>
      <View style={styles.cardIconRow}>
        <Ionicons name={icon as any} size={11} color={accent} />
        <Text style={[styles.cardKicker, { color: accent }]}>{kicker}</Text>
      </View>
      <View style={styles.cardBody}>
        <TeamCrest name={row.team_name} logo={row.logo} size={32} />
        <View style={styles.cardText}>
          <Text style={styles.cardTeam} numberOfLines={2}>{row.team_name.toLocaleUpperCase("tr-TR")}</Text>
          <Text style={[styles.cardDetail, { color: accent }]}>{detail}</Text>
        </View>
      </View>
    </View>
  );
}

function TableHead({ powerBalance }: { powerBalance: boolean }) {
  return (
    <View style={styles.head}>
      <View style={styles.zoneBarEmpty} />
      <Text style={[styles.headCell, styles.posCell]}>#</Text>
      <Text style={[styles.headCell, styles.teamCell]}>TAKIM</Text>
      <Text style={[styles.headCell, styles.formCell]}>FORM</Text>
      <Text style={[styles.headCell, styles.numCell]}>AV</Text>
      <Text style={[styles.headCell, styles.numCell, styles.pointCell]}>
        {powerBalance ? "GP" : "P"}
      </Text>
    </View>
  );
}

function Row({ row, position, totalRows, isFav, onPress }: {
  row: StandingRow; position: number; totalRows: number; isFav: boolean; onPress: () => void;
}) {
  const TOP   = ["#E8B00A","#9AA1B5","#CD7F32"] as const;
  const tc    = position <= 3 ? TOP[position-1] : null;
  // Sıralama zonu rengi
  const zoneColor = position <= 3 ? "#178A50"
    : totalRows > 6 && position >= totalRows - 2 ? "#DC2626"
    : null;
  const goalDiff = Number(row.goal_diff ?? 0);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        isFav && styles.rowFav,
        pressed && styles.rowPressed,
      ]}
    >
      {/* Sol zone çizgisi */}
      {zoneColor ? <View style={[styles.zoneBar, { backgroundColor: zoneColor }]} /> : <View style={styles.zoneBarEmpty} />}

      <View style={[styles.posBadge, tc != null && { backgroundColor: tc+"22" }]}>
        <Text style={[styles.posNum, tc != null && { color: tc, fontWeight:"900" as const }]}>{position}</Text>
      </View>

      <View style={[styles.teamCell, styles.teamBox]}>
        <TeamCrest name={row.team_name} logo={row.logo} size={26} />
        <View style={styles.teamText}>
          <View style={styles.teamNameRow}>
            <Text style={[styles.teamName, isFav && styles.teamNameFav]} numberOfLines={1}>
              {row.team_name.toLocaleUpperCase("tr-TR")}
            </Text>
            {isFav ? <Ionicons name="star" size={10} color={colors.yellow} /> : null}
          </View>
        </View>
      </View>

      {row.last5 ? (
        <View style={styles.formCell}>
          <Form last5={row.last5} />
        </View>
      ) : <View style={styles.formCell} />}

      <Text style={[
        styles.cell, styles.numCell,
        goalDiff > 0 && styles.diffPos,
        goalDiff < 0 && styles.diffNeg,
      ]}>
        {goalDiff > 0 ? "+" : ""}{goalDiff}
      </Text>
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
          <View key={`${result}-${index}`} style={[styles.chip, styles.chipSmall, styleOf(result)]}>
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
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.faint, borderRadius: radius.md, padding: spacing.md, width: 200 },
  cardIconRow: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: spacing.sm },
  cardKicker: { fontSize: 9, fontWeight: "800", letterSpacing: 0.8 },
  cardBody: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  cardText: { flex: 1 },
  cardTeam: { ...type.small, color: colors.line, fontWeight: "800", lineHeight: 16 },
  cardDetail: { fontSize: 11, fontWeight: "700", marginTop: 3 },
  podium:    { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm, marginBottom: spacing.md },
  podCard:   { flex: 1, alignItems: "center", gap: 4, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.faint, borderRadius: radius.md, paddingVertical: spacing.md, paddingHorizontal: 6 },
  podGold:   { borderColor: colors.yellow, backgroundColor: "#FFFBEB", paddingVertical: spacing.lg },
  podSilver: { borderColor: "#9AA1B5", backgroundColor: "#F8F9FB" },
  podBronze: { borderColor: "#CD7F32", backgroundColor: "#FDF8F4" },
  podMedal:  { fontSize: 20 },
  podName:   { fontSize: 9, fontWeight: "800", color: colors.line, textAlign: "center" },
  podPts:    { fontSize: 18, fontWeight: "900", color: colors.turf, fontVariant: ["tabular-nums"] },
  podPtsGold:{ fontSize: 22, color: "#92660A" },
  podUnit:   { fontSize: 7, fontWeight: "800", letterSpacing: 0.5, color: colors.muted },
  posBadge: { width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center", marginRight: 4 },
  posNum:   { ...type.small, color: colors.muted, fontVariant: ["tabular-nums"] },
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
  zoneBar: { width:3, alignSelf:"stretch", borderRadius:2, marginRight:4 },
  zoneBarEmpty: { width:3, marginRight:4 },
  rowFav: { backgroundColor: colors.goldDim },
  teamNameRow: { flexDirection:"row", alignItems:"center", gap:3 },
  teamNameFav: { color:colors.yellow },
  formCell: { width:60, alignItems:"flex-start" as const },
  diffPos: { color:colors.green, fontWeight:"800" as const },
  diffNeg: { color:colors.live, fontWeight:"800" as const },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: spacing.sm + 2, paddingHorizontal: spacing.sm, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.faint, marginBottom: spacing.sm },
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
  chipSmall: { width:14, height:14, borderRadius:4 },
  chip: {
    width: 16,
    height: 16,
    borderRadius: 5,
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
    width: 32,
    textAlign: "center" as const,
  },
  pointCell: {
    width: 34,
  },
  points: {
    color: colors.turf,
    fontWeight: "800",
  },
  footnote: {
    ...type.caption,
    color: colors.muted,
    lineHeight: 18,
    paddingTop: spacing.md,
    letterSpacing: 0,
  },
});
