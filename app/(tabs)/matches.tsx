import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Pressable, RefreshControl, SectionList, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MatchCard } from "@/components/MatchCard";
import { ScopeBar } from "@/components/ScopeBar";
import { ScreenHeader } from "@/components/ScreenHeader";
import { EmptyState, ErrorState, Loading } from "@/components/States";
import { colors, radius, spacing, type } from "@/constants/theme";
import { useTeamLogos } from "@/hooks/useTeamLogos";
import { getMatches } from "@/lib/api/matches";
import { formatDayHeading } from "@/lib/format";
import { matchState } from "@/lib/match";
import { queryKeys } from "@/lib/queryKeys";
import { useScope } from "@/providers/ScopeProvider";
import type { ApiMatch } from "@/lib/types";

type Tab = "live" | "fixtures" | "results";

const TABS: { key: Tab; label: string }[] = [
  { key: "live", label: "Canlı" },
  { key: "fixtures", label: "Fikstür" },
  { key: "results", label: "Sonuçlar" },
];

/**
 * Ana ekran: seçili lig ve sezonun maçları.
 *
 * Tek bir /maclar isteği çekilip üç sekmeye burada ayrılır. Ayrı ayrı
 * /fixtures + /results + /live çağırmak mobil bağlantıda üç ağ turu demek
 * olurdu; kapsamdaki maç sayısı bir sezonla sınırlı olduğu için tek istek
 * hem daha hızlı hem de sekmeler arası geçişi anında yapıyor.
 */
export default function MatchesScreen() {
  const scope = useScope();
  const teams = useTeamLogos();
  const [tab, setTab] = useState<Tab>("fixtures");

  const scopeKey = { cityId: scope.cityId ?? undefined, leagueId: scope.leagueId ?? undefined, seasonId: scope.seasonId ?? undefined };

  const query = useQuery({
    queryKey: queryKeys.matches(scopeKey),
    queryFn: () => getMatches({ leagueId: scope.leagueId!, seasonId: scope.seasonId!, limit: 300 }),
    enabled: scope.ready,
    // Canlı maç varsa liste kendini tazelesin; detay ekranı ayrıca sokete bağlanır.
    refetchInterval: 60_000,
  });

  const buckets = useMemo(() => split(query.data ?? []), [query.data]);
  const visible = buckets[tab];

  const sections = useMemo(() => groupByDay(visible, tab), [visible, tab]);

  // Canlı maç varken kullanıcıyı oraya çekmek için sekmede sayı gösterilir.
  const liveCount = buckets.live.length;

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader title="Maçlar" />
      <ScopeBar />

      <View style={styles.tabs}>
        {TABS.map((item) => {
          const active = item.key === tab;
          return (
            <Pressable
              key={item.key}
              onPress={() => setTab(item.key)}
              style={({ pressed }) => [
                styles.tab,
                active && styles.tabActive,
                pressed && styles.tabPressed,
              ]}
            >
              <Text style={[styles.tabText, active && styles.tabTextActive]}>
                {item.label}
                {item.key === "live" && liveCount > 0 ? ` (${liveCount})` : ""}
              </Text>
            </Pressable>
          );
        })}
      </View>

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
        <SectionList
          sections={sections}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <MatchCard
              match={item}
              homeLogo={teams.logoFor(item.home_team_id, item.first_team_name)}
              awayLogo={teams.logoFor(item.away_team_id, item.second_team_name)}
            />
          )}
          renderSectionHeader={({ section }) =>
            section.title ? <Text style={styles.sectionTitle}>{section.title}</Text> : null
          }
          contentContainerStyle={styles.list}
          stickySectionHeadersEnabled={false}
          refreshControl={
            <RefreshControl
              refreshing={query.isRefetching}
              onRefresh={query.refetch}
              tintColor={colors.turf}
            />
          }
          ListEmptyComponent={<EmptyForTab tab={tab} />}
        />
      )}
    </SafeAreaView>
  );
}

/** Maçları duruma göre üçe ayırır. */
function split(matches: ApiMatch[]) {
  const live: ApiMatch[] = [];
  const fixtures: ApiMatch[] = [];
  const results: ApiMatch[] = [];

  matches.forEach((match) => {
    const state = matchState(match);
    if (state === "live") live.push(match);
    else if (state === "scheduled") fixtures.push(match);
    else results.push(match);
  });

  // Sunucu listeyi yeniden eskiye sıralar: yaklaşan maçlarda tersi istenir.
  fixtures.sort(byKickoff("asc"));
  results.sort(byKickoff("desc"));
  live.sort(byKickoff("asc"));

  return { live, fixtures, results };
}

const byKickoff = (direction: "asc" | "desc") => (a: ApiMatch, b: ApiMatch) => {
  const at = Date.parse(`${String(a.date).slice(0, 10)}T${a.time || "00:00:00"}`);
  const bt = Date.parse(`${String(b.date).slice(0, 10)}T${b.time || "00:00:00"}`);
  const diff = (Number.isFinite(at) ? at : 0) - (Number.isFinite(bt) ? bt : 0);
  return direction === "asc" ? diff : -diff;
};

/** Gün başlıkları. Canlı sekmesinde tarih anlamsız olduğu için gruplanmaz. */
function groupByDay(matches: ApiMatch[], tab: Tab) {
  if (tab === "live") return [{ title: "", data: matches }];

  const map = new Map<string, ApiMatch[]>();
  matches.forEach((match) => {
    const key = String(match.date).slice(0, 10);
    const list = map.get(key) ?? [];
    list.push(match);
    map.set(key, list);
  });

  return Array.from(map, ([date, data]) => ({ title: formatDayHeading(date), data }));
}

function EmptyForTab({ tab }: { tab: Tab }) {
  if (tab === "live") {
    return (
      <EmptyState
        icon="radio-outline"
        title="Şu anda canlı maç yok"
        body="Maç başladığında skor burada anlık olarak akar."
      />
    );
  }
  if (tab === "fixtures") {
    return (
      <EmptyState
        icon="calendar-outline"
        title="Yaklaşan maç yok"
        body="Fikstür açıklandığında burada görünecek."
      />
    );
  }
  return (
    <EmptyState
      icon="trophy-outline"
      title="Henüz oynanmış maç yok"
      body="Sezon başladığında sonuçlar burada listelenir."
    />
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.pitch,
  },
  tabs: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    alignItems: "center",
  },
  tabActive: {
    backgroundColor: colors.turfDim,
  },
  tabPressed: {
    opacity: 0.8,
  },
  tabText: {
    ...type.caption,
    color: colors.muted,
  },
  tabTextActive: {
    color: colors.turf,
  },
  list: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
    flexGrow: 1,
  },
  sectionTitle: {
    ...type.caption,
    color: colors.muted,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
});
