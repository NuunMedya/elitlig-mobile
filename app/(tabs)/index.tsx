import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
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
import { MyTeamCard } from "@/components/MyTeamCard";
import { ScopeBar } from "@/components/ScopeBar";
import { ScreenHeader } from "@/components/ScreenHeader";
import { EmptyState, Loading } from "@/components/States";
import { TeamCrest } from "@/components/TeamCrest";
import { colors, radius, spacing, type } from "@/constants/theme";
import { YoutubeBanner } from "@/components/YoutubeBanner";
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
 * Genel Bakış — uygulamanın vitrini; web anasayfasının mobil karşılığı.
 *
 * Tek bakışta: canlı maçlar, sıradaki fikstür, puan tablosunun tepesi
 * (sitedeki "Lig Tablosu" kartıyla aynı kolonlar: O · AV · P) ve son
 * haberler. Maç sorgusu Maçlar sekmesiyle aynı anahtarı kullanır, cache
 * paylaşılır.
 */
export default function OverviewScreen() {
  const scope = useScope();
  const teams = useTeamLogos();
  const router = useRouter();

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

  const { live, upcoming } = useMemo(
    () => pickMatches(matchesQuery.data ?? []),
    [matchesQuery.data]
  );
  const topRows = (standingsQuery.data ?? []).slice(0, 5);

  // Sezon Panosu — sitedeki özet şerit; puan tablosu + maç listesinden türetilir.
  const season = useMemo(() => {
    const rows = standingsQuery.data ?? [];
    if (!rows.length) return null;
    const teams = rows.length;
    const played = rows.reduce((sum, row) => sum + Number(row.played || 0), 0) / 2;
    const goals = rows.reduce((sum, row) => sum + Number(row.goals_for || 0), 0);
    return {
      teams,
      played: Math.round(played),
      goals,
      perMatch: played > 0 ? (goals / played).toFixed(1) : "0.0",
    };
  }, [standingsQuery.data]);
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
          <MyTeamCard matches={matchesQuery.data ?? []} />

          {season && (
            <View style={styles.seasonBoard}>
              <SeasonStat label="TAKIM" value={String(season.teams)} />
              <View style={styles.seasonDivider} />
              <SeasonStat label="MAÇ" value={String(season.played)} />
              <View style={styles.seasonDivider} />
              <SeasonStat label="GOL" value={String(season.goals)} />
              <View style={styles.seasonDivider} />
              <SeasonStat label="GOL/MAÇ" value={season.perMatch} />
            </View>
          )}

          {live.length > 0 && (
            <Section title="Canlı" href="/matches" accent>
              <YoutubeBanner cityLabel={scope.cityLabel} live />
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

          <Section title="Puan Durumu" href="/standings">
            {topRows.length > 0 ? (
              <View style={styles.tableCard}>
                <View style={styles.tableHead}>
                  <Text style={[styles.headCell, styles.headTeam]}>TAKIM</Text>
                  <Text style={[styles.headCell, styles.numCol]}>O</Text>
                  <Text style={[styles.headCell, styles.numCol]}>AV</Text>
                  <Text style={[styles.headCell, styles.pointsCol]}>P</Text>
                </View>
                {topRows.map((row, index) => (
                  <Pressable
                    key={row.team_id}
                    onPress={() => router.push(`/takim/${row.team_id}`)}
                    style={({ pressed }) => [
                      styles.tableRow,
                      index % 2 === 1 && styles.tableRowAlt,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={styles.tablePos}>{index + 1}</Text>
                    <TeamCrest name={row.team_name} logo={row.logo} size={24} />
                    <Text style={styles.tableName} numberOfLines={1}>
                      {row.team_name.toLocaleUpperCase("tr-TR")}
                    </Text>
                    <Text style={[styles.tableNum, styles.numCol]}>{row.played}</Text>
                    <Text style={[styles.tableNum, styles.numCol]}>{row.goal_diff}</Text>
                    <Text style={[styles.tablePoints, styles.pointsCol]}>
                      {row.display_points}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : (
              <Text style={styles.emptyLine}>Puan tablosu henüz boş.</Text>
            )}
          </Section>

          <Section title="Son Haberler" href="/news">
            {latestNews.length > 0 ? (
              latestNews.map((item) => (
                <Pressable
                  key={`${item.kind}-${item.id}`}
                  onPress={() => router.push(`/haber/${item.id}`)}
                  style={({ pressed }) => [styles.newsCard, pressed && styles.pressed]}
                >
                  <View style={styles.newsBadge}>
                    <Ionicons
                      name={
                        item.kind === "transfer"
                          ? "swap-horizontal"
                          : item.kind === "penalty"
                            ? "alert-circle-outline"
                            : "newspaper-outline"
                      }
                      size={16}
                      color={colors.turf}
                    />
                  </View>
                  <View style={styles.newsBody}>
                    <Text style={styles.newsTitle} numberOfLines={2}>
                      {item.title}
                    </Text>
                    {item.published_at ? (
                      <Text style={styles.newsMeta}>{timeAgo(item.published_at)}</Text>
                    ) : null}
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.muted} />
                </Pressable>
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

function SeasonStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.seasonStat}>
      <Text style={styles.seasonValue}>{value}</Text>
      <Text style={styles.seasonLabel}>{label}</Text>
    </View>
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
  href: "/matches" | "/standings" | "/news";
  accent?: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, accent && styles.sectionTitleAccent]}>
          {title}
        </Text>
        <Pressable
          hitSlop={8}
          onPress={() => router.push(href)}
          style={({ pressed }) => pressed && styles.pressed}
        >
          <Text style={styles.sectionLink}>Tümü</Text>
        </Pressable>
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
  seasonBoard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.faint,
    borderRadius: radius.md,
    paddingVertical: spacing.sm + 2,
    marginTop: spacing.sm,
  },
  seasonStat: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  seasonDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: "stretch",
    backgroundColor: colors.faint,
  },
  seasonValue: {
    ...type.subtitle,
    color: colors.turf,
    fontVariant: ["tabular-nums"],
  },
  seasonLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: colors.muted,
    letterSpacing: 0.6,
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
    borderWidth: 1,
    borderColor: colors.faint,
    overflow: "hidden",
  },
  tableHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm + 2,
    paddingBottom: spacing.xs,
  },
  headCell: {
    ...type.caption,
    color: colors.muted,
  },
  headTeam: {
    flex: 1,
    marginLeft: 18 + spacing.sm + 24 + spacing.sm,
  },
  numCol: {
    width: 30,
    textAlign: "right",
  },
  pointsCol: {
    width: 34,
    textAlign: "right",
  },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  tableRowAlt: {
    backgroundColor: colors.surfaceRaised,
  },
  tablePos: {
    ...type.small,
    color: colors.turf,
    fontWeight: "800",
    width: 18,
    textAlign: "center",
    fontVariant: ["tabular-nums"],
  },
  tableName: {
    ...type.small,
    color: colors.line,
    flex: 1,
    fontWeight: "700",
  },
  tableNum: {
    ...type.small,
    color: colors.muted,
    fontVariant: ["tabular-nums"],
  },
  tablePoints: {
    ...type.body,
    color: colors.turf,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  newsCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.faint,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    marginBottom: spacing.sm,
  },
  newsBadge: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    backgroundColor: colors.turfDim,
    alignItems: "center",
    justifyContent: "center",
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
