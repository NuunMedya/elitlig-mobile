import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useMemo } from "react";
import {
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MatchCard } from "@/components/MatchCard";
import { FeatureBand } from "@/components/FeatureBand";
import { MatchPhotoSlider } from "@/components/MatchPhotoSlider";
import { MyTeamCard } from "@/components/MyTeamCard";
import { WeekSeven } from "@/components/WeekSeven";
import { ScopeBar } from "@/components/ScopeBar";
import { ScreenHeader } from "@/components/ScreenHeader";
import { EmptyState, Loading } from "@/components/States";
import { PlayerAvatar, TeamCrest } from "@/components/TeamCrest";
import { colors, radius, spacing, type } from "@/constants/theme";
import { YoutubeBanner } from "@/components/YoutubeBanner";
import { useTeamLogos } from "@/hooks/useTeamLogos";
import { getMatches } from "@/lib/api/matches";
import { getPlayerRankings } from "@/lib/api/players";
import { getNewsFeed } from "@/lib/api/news";
import { getStandings } from "@/lib/api/standings";
import { formatDateShort, mediaUrl, timeAgo } from "@/lib/format";
import { openLink } from "@/lib/links";
import { youtubeChannelUrl } from "@/lib/youtube";
import { matchState } from "@/lib/match";
import { queryKeys } from "@/lib/queryKeys";
import { PersonalCard } from "@/components/PersonalCard";
import { useAuth } from "@/providers/AuthProvider";
import { useScope } from "@/providers/ScopeProvider";
import { getPanelMe } from "@/lib/api/panel";
import type { ApiMatch, NewsItem, PlayerRankRow } from "@/lib/types";

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
  const auth  = useAuth();

  // Girişli kullanıcının panel özeti (takım + sıradaki maç için)
  const panelQuery = useQuery({
    queryKey: ["panel", "me"],
    queryFn: getPanelMe,
    enabled: Boolean(auth.user),
    staleTime: 60_000,
    retry: false,
  });
  const panelTeam    = panelQuery.data?.playerTeam ?? panelQuery.data?.team ?? null;
  const panelMatches = panelQuery.data?.recentMatches ?? [];
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

  const scorersQuery = useQuery({
    queryKey: queryKeys.playerRankings(scopeKey, "topScorers"),
    queryFn: () => getPlayerRankings(scopeKey, "topScorers"),
    enabled: scope.ready,
    staleTime: 5 * 60_000,
  });

  const valuableQuery = useQuery({
    queryKey: queryKeys.playerRankings(scopeKey, "mostValuable"),
    queryFn: () => getPlayerRankings(scopeKey, "mostValuable"),
    enabled: scope.ready,
    staleTime: 5 * 60_000,
  });

  const { live, upcoming, recent } = useMemo(
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
  const feedItems = newsQuery.data?.items ?? [];
  // Manşet: sabitlenmiş ya da en yeni editör haberi (kapaklıysa öne çıkar).
  const headline = useMemo(() => {
    const editorNews = feedItems.filter((item) => item.kind === "news");
    return editorNews.find((item) => item.pinned) ?? editorNews[0] ?? null;
  }, [feedItems]);
  // Duyurular: son transfer/ceza kayıtları; manşetle aynı haberi tekrarlama.
  const announcements = useMemo(
    () => feedItems.filter((item) => item.kind !== "news").slice(0, 3),
    [feedItems]
  );
  const latestNews = feedItems
    .filter((item) => item.kind === "news" && item.id !== headline?.id)
    .slice(0, 2);

  // Liderler: gol kralı sunucu sırasıyla; en değerli puana göre yeniden dizilir.
  const topScorer = scorersQuery.data?.players?.[0] ?? null;
  const mostValuable = useMemo(() => {
    const players = valuableQuery.data?.players ?? [];
    if (!players.length) return null;
    return [...players].sort(
      (a, b) => (Number(b.points) || 0) - (Number(a.points) || 0)
    )[0];
  }, [valuableQuery.data]);

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
          {auth.user ? (
            <PersonalCard
              userName={auth.user.fullName ?? auth.user.username}
              teamName={panelTeam?.team_name ?? null}
              teamLogo={panelTeam ? (panelTeam as any).logo ?? null : null}
              teamId={panelTeam?.id ?? null}
              matches={matchesQuery.data ?? []}
            />
          ) : null}
          {!auth.user ? <MyTeamCard matches={matchesQuery.data ?? []} /> : null}

          {matchesQuery.data && matchesQuery.data.some(m => m.match_picture) ? (
            <Section title="Son Maçlar" href="/matches">
              <MatchPhotoSlider matches={matchesQuery.data ?? []} />
            </Section>
          ) : headline ? <HeadlineCard item={headline} /> : null}

          <FeatureBand />

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



          {(topScorer || mostValuable) && (
            <Section title="İstatistik Liderleri" href="/players">
              <View style={styles.leadersRow}>
                {mostValuable ? (
                  <LeaderCard kicker="EN DEĞERLİ" player={mostValuable} value={String(Number(mostValuable.points) || 0)} unit="PUAN" />
                ) : null}
                {topScorer ? (
                  <LeaderCard kicker="GOL KRALI" player={topScorer} value={String(Number(topScorer.goals) || 0)} unit="GOL" />
                ) : null}
              </View>
            </Section>
          )}

          <WeekSeven />

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

          {headline ? <HeadlineCard item={headline} /> : null}

          {announcements.length > 0 && (
            <Section title="Duyurular" href="/news">
              {announcements.map((item) => (
                <View key={`${item.kind}-${item.id}`} style={styles.annRow}>
                  <View
                    style={[
                      styles.annPill,
                      item.kind === "penalty" ? styles.annPillPenalty : styles.annPillTransfer,
                    ]}
                  >
                    <Text style={styles.annPillText}>
                      {item.kind === "penalty" ? "CEZA" : "TRANSFER"}
                    </Text>
                  </View>
                  <Text style={styles.annTitle} numberOfLines={2}>
                    {item.title}
                  </Text>
                  <Text style={styles.annTime}>{timeAgo(item.published_at)}</Text>
                </View>
              ))}
            </Section>
          )}

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

/** Canlı + en yakın 3 zamanlanmış + son oynanan 6 maç. */
function pickMatches(matches: ApiMatch[]) {
  const live: ApiMatch[] = [];
  const scheduled: ApiMatch[] = [];
  const finished: ApiMatch[] = [];

  for (const match of matches) {
    const state = matchState(match);
    if (state === "live") live.push(match);
    else if (state === "scheduled") scheduled.push(match);
    else if (state === "finished") finished.push(match);
  }

  const timeOf = (m: ApiMatch) =>
    new Date(`${String(m.date).slice(0, 10)}T${m.time || "00:00:00"}`).getTime();

  scheduled.sort((a, b) => timeOf(a) - timeOf(b));
  finished.sort((a, b) => timeOf(b) - timeOf(a));

  return { live, upcoming: scheduled.slice(0, 3), recent: finished.slice(0, 6) };
}

/** Ana ekran hızlı erişim düğmesi. */
function QuickChip({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.quickChip, pressed && styles.pressed]}
    >
      <Ionicons name={icon} size={16} color={colors.turf} />
      <Text style={styles.quickText}>{label}</Text>
    </Pressable>
  );
}

/** Manşet — sitedeki kahraman haber kartının mobil hali. */
function HeadlineCard({ item }: { item: NewsItem }) {
  const router = useRouter();
  const cover = mediaUrl(item.cover_image_url);

  return (
    <Pressable
      onPress={() => router.push(`/haber/${item.id}`)}
      style={({ pressed }) => [styles.headline, pressed && styles.pressed]}
    >
      {cover ? <Image source={{ uri: cover }} style={styles.headlineImage} /> : null}
      <View style={styles.headlineBody}>
        <Text style={styles.headlineKicker}>MANŞET</Text>
        <Text style={styles.headlineTitle} numberOfLines={3}>
          {item.title}
        </Text>
        <Text style={styles.headlineMeta}>{timeAgo(item.published_at)}</Text>
      </View>
    </Pressable>
  );
}

/** Son sonuç kartı — yatay şeritte kompakt skor. */
function ResultCard({ match }: { match: ApiMatch }) {
  const router = useRouter();

  return (
    <Pressable
      onPress={() => router.push(`/mac/${match.id}`)}
      style={({ pressed }) => [styles.resultCard, pressed && styles.pressed]}
    >
      <Text style={styles.resultDate}>{formatDateShort(match.date)}</Text>
      <ResultLine name={match.first_team_name} score={match.first_team_score} win={(match.first_team_score ?? 0) > (match.second_team_score ?? 0)} />
      <ResultLine name={match.second_team_name} score={match.second_team_score} win={(match.second_team_score ?? 0) > (match.first_team_score ?? 0)} />
    </Pressable>
  );
}

function ResultLine({ name, score, win }: { name: string; score: number | null; win: boolean }) {
  return (
    <View style={styles.resultLine}>
      <Text style={[styles.resultName, win && styles.resultNameWin]} numberOfLines={1}>
        {name}
      </Text>
      <Text style={[styles.resultScore, win && styles.resultNameWin]}>{score ?? "-"}</Text>
    </View>
  );
}

/** İstatistik lideri kartı — En Değerli / Gol Kralı. */
function LeaderCard({
  kicker,
  player,
  value,
  unit,
}: {
  kicker: string;
  player: PlayerRankRow;
  value: string;
  unit: string;
}) {
  const router = useRouter();

  return (
    <Pressable
      onPress={() => router.push(`/oyuncu/${player.id}`)}
      style={({ pressed }) => [styles.leaderCard, pressed && styles.pressed]}
    >
      <Text style={styles.leaderKicker}>{kicker}</Text>
      <PlayerAvatar name={player.name} image={player.image} size={44} />
      <Text style={styles.leaderName} numberOfLines={1}>
        {player.name.toLocaleUpperCase("tr-TR")}
      </Text>
      {player.teamName ? (
        <Text style={styles.leaderTeam} numberOfLines={1}>
          {player.teamName}
        </Text>
      ) : null}
      <View style={styles.leaderBadge}>
        <Text style={styles.leaderValue}>{value}</Text>
        <Text style={styles.leaderUnit}>{unit}</Text>
      </View>
    </Pressable>
  );
}

function Section({
  title,
  href,
  accent,
  children,
}: {
  title: string;
  href: "/matches" | "/standings" | "/news" | "/players";
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
  quickRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  quickChip: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: colors.turfDim,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm + 2,
  },
  quickText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.turf,
  },
  headline: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.faint,
    borderRadius: radius.md,
    overflow: "hidden",
    marginTop: spacing.md,
  },
  headlineImage: {
    width: "100%",
    height: 170,
    backgroundColor: colors.surfaceRaised,
  },
  headlineBody: {
    padding: spacing.md,
    gap: 4,
  },
  headlineKicker: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1,
    color: colors.yellow,
  },
  headlineTitle: {
    ...type.subtitle,
    color: colors.line,
    lineHeight: 22,
  },
  headlineMeta: {
    ...type.caption,
    color: colors.muted,
    letterSpacing: 0,
  },
  resultsRow: {
    gap: spacing.sm,
  },
  resultCard: {
    width: 150,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.faint,
    borderRadius: radius.md,
    padding: spacing.sm + 2,
    gap: 4,
  },
  resultDate: {
    fontSize: 9,
    fontWeight: "700",
    color: colors.muted,
    letterSpacing: 0.4,
  },
  resultLine: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  resultName: {
    ...type.caption,
    color: colors.muted,
    letterSpacing: 0,
    flex: 1,
  },
  resultNameWin: {
    color: colors.line,
    fontWeight: "800",
  },
  resultScore: {
    ...type.small,
    color: colors.muted,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  leadersRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  leaderCard: {
    flex: 1,
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.faint,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  leaderKicker: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.8,
    color: colors.turf,
  },
  leaderName: {
    ...type.caption,
    color: colors.line,
    letterSpacing: 0,
  },
  leaderTeam: {
    fontSize: 10,
    fontWeight: "600",
    color: colors.muted,
  },
  leaderBadge: {
    alignItems: "center",
    backgroundColor: colors.turfDim,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 3,
    marginTop: 2,
  },
  leaderValue: {
    ...type.subtitle,
    color: colors.turf,
    fontVariant: ["tabular-nums"],
  },
  leaderUnit: {
    fontSize: 8,
    fontWeight: "800",
    color: colors.turf,
    letterSpacing: 0.5,
  },
  annRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.faint,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    marginBottom: spacing.sm,
  },
  annPill: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 3,
  },
  annPillTransfer: {
    backgroundColor: "#2F3A56",
  },
  annPillPenalty: {
    backgroundColor: "#B4232A",
  },
  annPillText: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.6,
    color: "#FFFFFF",
  },
  annTitle: {
    ...type.small,
    color: colors.line,
    fontWeight: "600",
    flex: 1,
  },
  annTime: {
    ...type.caption,
    color: colors.muted,
    letterSpacing: 0,
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
    width: 1,
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
    color: colors.turf,
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
    // Sıra numarası + amblem hizasını atlayıp takım adının üstüne gelir.
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
