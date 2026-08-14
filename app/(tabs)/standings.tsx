import { useQuery } from "@tanstack/react-query";
import { Link } from "expo-router";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
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
 * Puan durumu.
 *
 * Hangi puanın gösterileceğine sunucu karar verir: `display_points` alanı
 * sezonun tipine göre (standart / güç dengesi) doldurulur, istemci dallanmaz.
 * Canlı maçlar tabloya geçici olarak yansır — sunucu varsayılanı budur.
 */
export default function StandingsScreen() {
  const scope = useScope();
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

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader title="Puan Tablosu" />
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
          ListHeaderComponent={<TableHead powerBalance={powerBalance} />}
          renderItem={({ item, index }) => <Row row={item} position={index + 1} />}
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
          ListFooterComponent={
            powerBalance && rows.length ? (
              <Text style={styles.footnote}>
                Bu sezon güç dengesi puanlamasıyla oynanıyor; gösterilen puan
                takımların güç katsayısına göre hesaplanır.
              </Text>
            ) : null
          }
        />
      )}
    </SafeAreaView>
  );
}

function TableHead({ powerBalance }: { powerBalance: boolean }) {
  return (
    <View style={styles.head}>
      <Text style={[styles.headCell, styles.posCell]}>#</Text>
      <Text style={[styles.headCell, styles.teamCell]}>Takım</Text>
      <Text style={[styles.headCell, styles.numCell]}>O</Text>
      <Text style={[styles.headCell, styles.numCell]}>A</Text>
      <Text style={[styles.headCell, styles.numCell]}>AV</Text>
      <Text style={[styles.headCell, styles.numCell, styles.pointCell]}>
        {powerBalance ? "GP" : "P"}
      </Text>
    </View>
  );
}

function Row({ row, position }: { row: StandingRow; position: number }) {
  return (
    <Link href={`/takim/${row.team_id}`} asChild>
      <Pressable style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
        <Text style={[styles.cell, styles.posCell, position <= 3 && styles.posTop]}>
          {position}
        </Text>

        <View style={[styles.teamCell, styles.teamBox]}>
          <TeamCrest name={row.team_name} logo={row.logo} size={26} />
          <View style={styles.teamText}>
            <Text style={styles.teamName} numberOfLines={1}>
              {row.team_name}
            </Text>
            {row.last5 ? <Form last5={row.last5} /> : null}
          </View>
        </View>

        <Text style={[styles.cell, styles.numCell]}>{row.played}</Text>
        <Text style={[styles.cell, styles.numCell]}>{row.goals_for}</Text>
        <Text style={[styles.cell, styles.numCell]}>{row.goal_diff}</Text>
        <Text style={[styles.cell, styles.numCell, styles.pointCell, styles.points]}>
          {row.display_points}
        </Text>
      </Pressable>
    </Link>
  );
}

/** Son 5 maç: "WDLWW" — kazanma yeşil, beraberlik gri, yenilgi kırmızı. */
function Form({ last5 }: { last5: string }) {
  const color = (result: string) =>
    result === "W" ? colors.turf : result === "L" ? colors.live : colors.faint;

  return (
    <View style={styles.form}>
      {last5
        .slice(-5)
        .split("")
        .map((result, index) => (
          <View key={`${result}-${index}`} style={[styles.formDot, { backgroundColor: color(result) }]} />
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
  rowPressed: {
    backgroundColor: colors.surfaceRaised,
  },
  cell: {
    ...type.small,
    color: colors.line,
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
    gap: 3,
  },
  teamName: {
    ...type.small,
    color: colors.line,
    fontWeight: "600",
  },
  form: {
    flexDirection: "row",
    gap: 3,
  },
  formDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  numCell: {
    width: 30,
    textAlign: "center",
  },
  pointCell: {
    width: 34,
  },
  points: {
    color: colors.line,
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
