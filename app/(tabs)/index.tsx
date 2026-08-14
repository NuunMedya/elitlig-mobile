import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import { Link } from "expo-router";
import { useMemo } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MatchCard } from "@/components/MatchCard";
import { ScopeBar } from "@/components/ScopeBar";
import { ScreenHeader } from "@/components/ScreenHeader";
import { EmptyState, Loading } from "@/components/States";
import { TeamCrest } from "@/components/TeamCrest";
import { colors, radius, spacing, type } from "@/constants/theme";
import { useTeamLogos } from "@/hooks/useTeamLogos";
import { getMatches } from "@/lib/api/matches";
import { getNewsFeed } from "@/lib/api/news";
import { getStandings } from "@/lib/api/standings";
import { timeAgo } from "@/lib/format";
import { matchState } from "@/lib/match";
import { queryKeys } from "@/lib/queryKeys";
import { useScope } from "@/providers/ScopeProvider";
import type { ApiMatch } from "@/lib/types";

/**
 * Genel Bakış — uygulamanın vitrini.
 *
 * Tek bakışta: canlı maçlar, sıradaki fikstür, puan tablosunun tepesi ve son
 * haberler. Her bölümün "Tümü" bağlantısı ilgili sekmeye götürür.
 *
 * Maç sorgusu, Maçlar sekmesiyle AYNI anahtarı (queryKeys.matches) kullanır:
 * böylece iki ekran tek cache'i paylaşır ve sekmeler arası geçiş ek istek
 * atmaz.
 */
export default function OverviewScreen() {
  const scope = useScope();
  const teams = useTeamLogos();

  const scopeKey = {
    cityId: scope.cityId ?? undefined,
    leagueId: scope.leagueId ?? undefined,
    seasonId: scope.seasonId ?? undefined,
  };

  const matchesQuery = useQuery({
    queryKey: queryKeys.matches(scopeKey),
    queryFn: () =>
      getMatches({ leagueId: scope.leagueId!, seasonId: scope.seasonId!, limit: 300 }),
    enabled: scope.ready,
    refetchInterval: 60_000,
  });

  const standingsQuery = useQuery({
    queryKey: queryKeys.standings(scopeKey),
    queryFn: () =>
      getStandings({
        cityId: scope.cityId!,
        leagueId: scope.leagueId!,
        seasonId: scope.seasonId!,
      }),
    enabled: scope.ready,
  });

  const newsQuery = useQuery({
    queryKey: queryKeys.newsFeed(scopeKey),
    queryFn: () => getNewsFeed(scopeKey),
    enabled: scope.ready,
  });

  const { live, upcoming } = useMemo(() => pickMatches(matchesQuery.data ?? []), [
    matchesQuery.data,
  ]);
  const topRows = (standingsQuery.data ?? []).slice(0, 5);
  const latestNews = (newsQuery.data?.items ?? []).slice(0, 3);

  const refreshing =
    matchesQuery.isRefetching || standingsQuery.isRefetching || newsQuery.isRefetching;
  const refetchAll = () => {
    matchesQuery.refetch();
    standingsQuery.refetch();
    newsQuery.refetch();
  };

  const initialLoading =
    scope.loading || (scope.ready && matchesQuery.isLoading && standingsQuery.isLoading);

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader title="Genel Bakış" />
      <ScopeBar />

      {initialLoading ? (
        <Loading />
      ) : !scope.ready ? (
        <EmptyState
          icon="filter-outline"
          title="Lig seçilmedi"
          body="Yukarıdan şehir, lig ve sezon seçince özet burada belirir."
        />
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={refetchAll}
              tintColor={colors.turf}
            />
          }
        >
          {live.length > 0 && (
            <Section title="Canlı" href="/matches" accent>
              {live.map((match) => (
                <MatchCard
                  key={match.id}
                  match={match}
                  homeLogo={teams.logoFor(match.home_team_id, match.first_team_name)}
                  awayLogo={teams.logoFor(match.away_team_id, match.second_team_name)}
                />
              ))}
            </Section>
          )}

          <Section title="Sıradaki Maçlar" href="/matches">
            {upcoming.length > 0 ? (
              upcoming.map((match) => (
                <MatchCard
                  key={match.id}
                  match={match}
                  homeLogo={teams.logoFor(match.home_team_id, match.first_team_name)}
                  awayLogo={teams.logoFor(match.away_team_id, match.second_team_name)}
                />
              ))
            ) : (
              <Text style={styles.emptyLine}>Yaklaşan maç bulunmuyor.</Text>
            )}
          </Section>

          <Section title="Puan Tablosu" href="/standings">
            {topRows.length > 0 ? (
              <View style={styles.tableCard}>
                {topRows.map((row, index) => (
                  <Link key={row.team_id} href={`/takim/${row.team_id}`} asChild>
                    <Pressable
                      style={({ pressed }) => [
                        styles.tableRow,
                        index < topRows.length - 1 && styles.tableRowBorder,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Text style={styles.tablePos}>{index + 1}</Text>
                      <TeamCrest name={row.team_name} logo={row.logo} size={24} />
                      <Text style={styles.tableName} numberOfLines={1}>
                        {row.team_name}
                      </Text>
                      <Text style={styles.tablePlayed}>{row.played}</Text>
                      <Text style={styles.tablePoints}>{row.display_points}</Text>
                    </Pressable>
                  </Link>
                ))}
              </View>
            ) : (
              <Text style={styles.emptyLine}>Puan tablosu henüz boş.</Text>
            )}
          </Section>

          <Section title="Son Haberler" href="/news">
            {latestNews.length > 0 ? (
              latestNews.map((item) => (
                <Link key={`${item.kind}-${item.id}`} href={`/haber/${item.id}`} asChild>
                  <Pressable
                    style={({ pressed }) => [styles.newsCard, pressed && styles.pressed]}
                  >
                    <Ionicons
                      name={
                        item.kind === "transfer"
                          ? "swap-horizontal"
                          : item.kind === "penalty"
                            ? "alert-circle-outline"
                            : "newspaper-outline"
                      }
                      size={18}
                      color={colors.turf}
                    />
                    <View style={styles.newsBody}>
                      <Text style={styles.newsTitle} numberOfLines={2}>
                        {item.title}
                      </Text>
                      {item.published_at ? (
                        <Text style={styles.newsMeta}>{timeAgo(item.published_at)}</Text>
                      ) : null}
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={colors.faint} />
                  </Pressable>
                </Link>
              ))
            ) : (
              <Text style={styles.emptyLine}>Henüz haber yok.</Text>
            )}
          </Section>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

/** Canlı maçlar + tarihe göre en yakın 3 zamanlanmış maç. */
function pickMatches(matches: ApiMatch[]) {
  const live: ApiMatch[] = [];
  const scheduled: ApiMatch[] = [];

  for (const match of matches) {
    const state = matchState(match);
    if (state === "live") live.push(match);
    else if (state === "scheduled") scheduled.push(match);
  }

  scheduled.sort(
    (a, b) =>
      new Date(`${a.date}T${a.time || "00:00:00"}`).getTime() -
      new Date(`${b.date}T${b.time || "00:00:00"}`).getTime()
  );

  return { live, upcoming: scheduled.slice(0, 3) };
}

function Section({
  title,
  href,
  accent,
  children,
}: {
  title: string;
  href: string;
  accent?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, accent && styles.sectionTitleAccent]}>
          {title}
        </Text>
        <Link href={href} asChild>
          <Pressable hitSlop={8} style={({ pressed }) => pressed && styles.pressed}>
            <Text style={styles.sectionLink}>Tümü</Text>
          </Pressable>
        </Link>
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.pitch,
  },
  content: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
  },
  section: {
    marginTop: spacing.md,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    ...type.caption,
    color: colors.muted,
    textTransform: "uppercase",
  },
  sectionTitleAccent: {
    color: colors.live,
  },
  sectionLink: {
    ...type.caption,
    color: colors.turf,
  },
  tableCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    overflow: "hidden",
  },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  tableRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.faint,
  },
  tablePos: {
    ...type.small,
    color: colors.muted,
    width: 18,
    textAlign: "center",
    fontVariant: ["tabular-nums"],
  },
  tableName: {
    ...type.body,
    color: colors.line,
    flex: 1,
    fontWeight: "600",
  },
  tablePlayed: {
    ...type.small,
    color: colors.muted,
    width: 24,
    textAlign: "right",
    fontVariant: ["tabular-nums"],
  },
  tablePoints: {
    ...type.body,
    color: colors.turf,
    fontWeight: "800",
    width: 32,
    textAlign: "right",
    fontVariant: ["tabular-nums"],
  },
  newsCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    marginBottom: spacing.sm,
  },
  newsBody: {
    flex: 1,
  },
  newsTitle: {
    ...type.body,
    color: colors.line,
    fontWeight: "600",
  },
  newsMeta: {
    ...type.caption,
    color: colors.muted,
    marginTop: 2,
  },
  emptyLine: {
    ...type.small,
    color: colors.muted,
    paddingVertical: spacing.sm,
  },
  pressed: {
    opacity: 0.7,
  },
});
