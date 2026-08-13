import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MatchCard } from "@/components/MatchCard";
import { colors, spacing, type } from "@/constants/theme";
import { getMatches } from "@/lib/api";
import type { Match } from "@/lib/types";

/** Maçları lige göre grupla, canlı maçlar en üstte */
function groupByLeague(matches: Match[]) {
  const order = { live: 0, scheduled: 1, finished: 2 } as const;
  const sorted = [...matches].sort((a, b) => order[a.status] - order[b.status]);

  const map = new Map<string, Match[]>();
  for (const m of sorted) {
    const list = map.get(m.league) ?? [];
    list.push(m);
    map.set(m.league, list);
  }
  return Array.from(map, ([title, data]) => ({ title, data }));
}

export default function MatchesScreen() {
  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ["matches"],
    queryFn: getMatches,
    // Canlı skorlar için periyodik yenileme; ileride WebSocket'e geçilecek
    refetchInterval: 30_000,
  });

  const sections = useMemo(() => groupByLeague(data ?? []), [data]);
  const today = new Date().toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "long",
    weekday: "long",
  });

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.brand}>ELİTLİG</Text>
        <Text style={styles.date}>{today}</Text>
      </View>

      {isLoading && (
        <View style={styles.center}>
          <ActivityIndicator color={colors.turf} size="large" />
        </View>
      )}

      {isError && (
        <View style={styles.center}>
          <Text style={styles.errorTitle}>Maçlar yüklenemedi</Text>
          <Text style={styles.errorBody}>
            Bağlantıyı kontrol edip aşağı çekerek yenile.
          </Text>
        </View>
      )}

      {!isLoading && !isError && (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <MatchCard match={item} />}
          renderSectionHeader={({ section }) => (
            <Text style={styles.sectionTitle}>{section.title}</Text>
          )}
          contentContainerStyle={styles.list}
          stickySectionHeadersEnabled={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={colors.turf}
            />
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.errorTitle}>Bugün maç yok</Text>
              <Text style={styles.errorBody}>
                Fikstür açıklandığında burada görünecek.
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.pitch,
  },
  header: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
  },
  brand: {
    ...type.title,
    color: colors.line,
    letterSpacing: 2,
  },
  date: {
    ...type.caption,
    color: colors.muted,
    textTransform: "capitalize",
  },
  list: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
  },
  sectionTitle: {
    ...type.caption,
    color: colors.turf,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    textTransform: "uppercase",
  },
  center: {
    paddingTop: spacing.xl * 2,
    alignItems: "center",
    gap: spacing.xs,
  },
  errorTitle: {
    ...type.body,
    color: colors.line,
    fontWeight: "700",
  },
  errorBody: {
    ...type.body,
    color: colors.muted,
    textAlign: "center",
  },
});
