import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useMemo } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MatchCard } from "@/components/MatchCard";
import { DetailHeader } from "@/components/ScreenHeader";
import { ErrorState, Loading } from "@/components/States";
import { TeamCrest } from "@/components/TeamCrest";
import { colors, radius, spacing, type } from "@/constants/theme";
import { useTeamLogos } from "@/hooks/useTeamLogos";
import { getTeamMatches } from "@/lib/api/matches";
import { getTeam } from "@/lib/api/teams";
import { matchState } from "@/lib/match";
import { queryKeys } from "@/lib/queryKeys";
import type { ApiMatch } from "@/lib/types";

/**
 * Takım profili.
 *
 * `/maclar?team_id=` ucu takımın TÜM lig ve sezonlardaki maçlarını döndürür
 * (sunucu bu filtre için sayfa limitini kaldırır), bu yüzden ekran kapsam
 * seçiminden bağımsız çalışır: son maçlar ve yaklaşan maçlar bir arada.
 */
export default function TeamDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const teamId = Number(id);
  const validId = Number.isFinite(teamId) && teamId > 0;
  const logos = useTeamLogos();

  const teamQuery = useQuery({
    queryKey: queryKeys.team(teamId),
    queryFn: () => getTeam(teamId),
    enabled: validId,
  });

  const matchesQuery = useQuery({
    queryKey: queryKeys.teamMatches(teamId),
    queryFn: () => getTeamMatches(teamId),
    enabled: validId,
    staleTime: 60_000,
  });

  const { upcoming, recent } = useMemo(() => splitByState(matchesQuery.data ?? []), [
    matchesQuery.data,
  ]);

  if (teamQuery.isLoading) {
    return (
      <SafeAreaView style={styles.screen} edges={["top"]}>
        <DetailHeader title="Takım" />
        <Loading />
      </SafeAreaView>
    );
  }

  if (teamQuery.isError || !teamQuery.data) {
    return (
      <SafeAreaView style={styles.screen} edges={["top"]}>
        <DetailHeader title="Takım" />
        <ErrorState error={teamQuery.error} onRetry={teamQuery.refetch} />
      </SafeAreaView>
    );
  }

  const team = teamQuery.data;

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <DetailHeader title={team.team_name} subtitle={team.current_league ?? team.city ?? undefined} />

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={matchesQuery.isRefetching}
            onRefresh={matchesQuery.refetch}
            tintColor={colors.turf}
          />
        }
      >
        <View style={styles.hero}>
          <TeamCrest name={team.team_name} logo={team.logo} size={72} />
          <Text style={styles.teamName}>{team.team_name}</Text>
          {team.city ? <Text style={styles.teamMeta}>{team.city}</Text> : null}
        </View>

        {/* Takım tablosundaki toplamlar tüm sezonların birikimidir; sezonluk
            değerler için puan durumu ekranına bakılır. */}
        <View style={styles.stats}>
          <Stat label="Maç" value={team.total_matches} />
          <Stat label="G" value={team.team_wins} />
          <Stat label="B" value={team.team_draws} />
          <Stat label="M" value={team.team_losses} />
          <Stat label="A" value={team.goals_scored} />
          <Stat label="Y" value={team.goals_conceded} />
        </View>

        {matchesQuery.isLoading ? (
          <Loading />
        ) : (
          <>
            {upcoming.length ? (
              <>
                <Text style={styles.sectionTitle}>Yaklaşan Maçlar</Text>
                {upcoming.slice(0, 5).map((match) => (
                  <MatchCard
                    key={match.id}
                    match={match}
                    homeLogo={logos.logoFor(match.home_team_id, match.first_team_name)}
                    awayLogo={logos.logoFor(match.away_team_id, match.second_team_name)}
                  />
                ))}
              </>
            ) : null}

            <Text style={styles.sectionTitle}>Son Maçlar</Text>
            {recent.length ? (
              recent.slice(0, 15).map((match) => (
                <MatchCard
                  key={match.id}
                  match={match}
                  homeLogo={logos.logoFor(match.home_team_id, match.first_team_name)}
                  awayLogo={logos.logoFor(match.away_team_id, match.second_team_name)}
                />
              ))
            ) : (
              <Text style={styles.placeholder}>Bu takımın oynanmış maçı bulunmuyor.</Text>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function splitByState(matches: ApiMatch[]) {
  const upcoming: ApiMatch[] = [];
  const recent: ApiMatch[] = [];

  matches.forEach((match) => {
    if (matchState(match) === "scheduled") upcoming.push(match);
    else recent.push(match);
  });

  const kickoff = (match: ApiMatch) =>
    Date.parse(`${String(match.date).slice(0, 10)}T${match.time || "00:00:00"}`) || 0;

  upcoming.sort((a, b) => kickoff(a) - kickoff(b));
  recent.sort((a, b) => kickoff(b) - kickoff(a));

  return { upcoming, recent };
}

function Stat({ label, value }: { label: string; value?: number | null }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value ?? 0}</Text>
      <Text style={styles.statLabel}>{label}</Text>
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
  hero: {
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  teamName: {
    ...type.title,
    color: colors.line,
    textAlign: "center",
  },
  teamMeta: {
    ...type.small,
    color: colors.muted,
  },
  stats: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.md,
  },
  stat: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  statValue: {
    ...type.subtitle,
    color: colors.line,
  },
  statLabel: {
    ...type.caption,
    color: colors.muted,
  },
  sectionTitle: {
    ...type.caption,
    color: colors.muted,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  placeholder: {
    ...type.small,
    color: colors.faint,
    paddingVertical: spacing.md,
  },
});
