import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { DetailHeader } from "@/components/ScreenHeader";
import { EmptyState, ErrorState, Loading } from "@/components/States";
import { PlayerAvatar, TeamCrest } from "@/components/TeamCrest";
import { colors, radius, spacing, type } from "@/constants/theme";
import { useTeamLogos } from "@/hooks/useTeamLogos";
import { getTeamMatches } from "@/lib/api/matches";
import { getPlayerRankings } from "@/lib/api/players";
import { getStandings } from "@/lib/api/standings";
import { getTeam } from "@/lib/api/teams";
import { addMatchToCalendar } from "@/lib/calendar";
import { formatDateShort, formatTime } from "@/lib/format";
import { matchState } from "@/lib/match";
import { queryKeys } from "@/lib/queryKeys";
import { useFavorite } from "@/providers/FavoriteProvider";
import { useScope } from "@/providers/ScopeProvider";
import type { ApiMatch, PlayerRankRow, StandingRow } from "@/lib/types";

/**
 * Takım profili — sitedeki takım sayfasının (alt sekmeleriyle) mobil hali.
 *
 * Üstte kimlik + bu sezon kartı (sıra, puan, form — puan tablosundan) ve tüm
 * zamanlar şeridi; altta üç sekme: Sonuçlar (takım gözünden G/B/M rozetli),
 * Fikstür (takvime ekle kısayollu) ve Kadro (sezon katkılarıyla, oyuncu
 * sıralamalarından teamId süzülerek). Sezonluk bölümler takım geçerli
 * kapsamda değilse kendini gizler; maç listesi kapsamdan bağımsızdır.
 */

type Tab = "results" | "fixtures" | "squad";

export default function TeamDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const teamId = Number(id);
  const validId = Number.isFinite(teamId) && teamId > 0;
  const router = useRouter();
  const scope = useScope();
  const logos = useTeamLogos();
  const { isFavorite, toggleFavorite } = useFavorite();
  const [tab, setTab] = useState<Tab>("results");

  const scopeKey = {
    cityId: scope.cityId ?? undefined,
    leagueId: scope.leagueId ?? undefined,
    seasonId: scope.seasonId ?? undefined,
  };

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

  const standingsQuery = useQuery({
    queryKey: queryKeys.standings(scopeKey),
    queryFn: () =>
      getStandings({ cityId: scope.cityId!, leagueId: scope.leagueId!, seasonId: scope.seasonId! }),
    enabled: scope.ready,
  });

  const squadQuery = useQuery({
    queryKey: queryKeys.playerRankings(scopeKey, "topScorers"),
    queryFn: () => getPlayerRankings(scopeKey, "topScorers"),
    enabled: scope.ready,
    staleTime: 5 * 60_000,
  });

  const team = teamQuery.data;
  const teamName = team?.team_name ?? "";

  const standing = useMemo(() => {
    const rows = standingsQuery.data ?? [];
    const index = rows.findIndex((row) => Number(row.team_id) === teamId);
    return index >= 0 ? { row: rows[index] as StandingRow, position: index + 1 } : null;
  }, [standingsQuery.data, teamId]);

  const { upcoming, recent } = useMemo(
    () => splitByState(matchesQuery.data ?? []),
    [matchesQuery.data]
  );

  const squad = useMemo(() => {
    const players = squadQuery.data?.players ?? [];
    return players
      .filter((player) => Number(player.teamId) === teamId)
      .sort(
        (a, b) =>
          (Number(b.points) || 0) - (Number(a.points) || 0) ||
          (Number(b.goals) || 0) - (Number(a.goals) || 0)
      );
  }, [squadQuery.data, teamId]);

  if (teamQuery.isLoading) {
    return (
      <SafeAreaView style={styles.screen} edges={["top"]}>
        <DetailHeader title="Takım" />
        <Loading />
      </SafeAreaView>
    );
  }

  if (teamQuery.isError || !team) {
    return (
      <SafeAreaView style={styles.screen} edges={["top"]}>
        <DetailHeader title="Takım" />
        <ErrorState error={teamQuery.error} onRetry={teamQuery.refetch} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <DetailHeader title={team.team_name} subtitle={team.current_league ?? team.city ?? undefined} />

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={matchesQuery.isRefetching}
            onRefresh={() => {
              matchesQuery.refetch();
              standingsQuery.refetch();
              squadQuery.refetch();
            }}
            tintColor={colors.turf}
          />
        }
      >
        {/* Kimlik */}
        <View style={styles.hero}>
          <TeamCrest name={team.team_name} logo={team.logo} size={76} />
          <Text style={styles.teamName}>{team.team_name}</Text>
          {team.city ? <Text style={styles.teamMeta}>{team.city}</Text> : null}
          <Pressable
            onPress={() => toggleFavorite({ id: teamId, name: team.team_name })}
            hitSlop={10}
            style={({ pressed }) => [
              styles.favBtn,
              isFavorite(teamId) && styles.favBtnActive,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons
              name={isFavorite(teamId) ? "star" : "star-outline"}
              size={16}
              color={isFavorite(teamId) ? colors.yellow : colors.muted}
            />
            <Text style={[styles.favText, isFavorite(teamId) && styles.favTextActive]}>
              {isFavorite(teamId) ? "Takımım" : "Takımım yap"}
            </Text>
          </Pressable>
        </View>

        {/* Bu sezon: puan tablosundan */}
        {standing ? (
          <View style={styles.seasonCard}>
            <Text style={styles.cardKicker}>BU SEZON · {scope.leagueLabel}</Text>
            <View style={styles.seasonRow}>
              <SeasonStat label="SIRA" value={`${standing.position}.`} highlight />
              <SeasonStat label="PUAN" value={String(standing.row.display_points)} highlight />
              <SeasonStat label="O" value={String(standing.row.played)} />
              <SeasonStat label="AV" value={String(standing.row.goal_diff)} />
              {standing.row.last5 ? <FormChips last5={standing.row.last5} /> : null}
            </View>
          </View>
        ) : null}

        {/* Takım Analizi */}
        {standing ? (
          <View style={styles.analysisCard}>
            <View style={styles.analysisHeader}>
              <Ionicons name="bar-chart-outline" size={14} color={colors.turf} />
              <Text style={styles.analysisKicker}>TAKİM ANALİZİ</Text>
            </View>
            <Text style={styles.analysisText}>
              {buildAnalysis(standing.row, team.team_name, standing.position)}
            </Text>
          </View>
        ) : null}

        {/* Tüm zamanlar */}
        <View style={styles.statsCard}>
          <Text style={styles.cardKicker}>TÜM ZAMANLAR</Text>
          <View style={styles.statsRow}>
            <Stat label="Maç" value={team.total_matches} />
            <Stat label="G" value={team.team_wins} />
            <Stat label="B" value={team.team_draws} />
            <Stat label="M" value={team.team_losses} />
            <Stat label="A" value={team.goals_scored} />
            <Stat label="Y" value={team.goals_conceded} />
          </View>
        </View>

        {/* Sekmeler */}
        <View style={styles.tabs}>
          <TabButton label="Sonuçlar" active={tab === "results"} onPress={() => setTab("results")} />
          <TabButton label="Fikstür" active={tab === "fixtures"} onPress={() => setTab("fixtures")} />
          <TabButton label="Kadro" active={tab === "squad"} onPress={() => setTab("squad")} />
        </View>

        {matchesQuery.isLoading ? (
          <Loading />
        ) : tab === "results" ? (
          recent.length ? (
            recent.map((match) => (
              <MatchRow
                key={match.id}
                match={match}
                teamId={teamId}
                teamName={teamName}
                logoFor={logos.logoFor}
                onPress={() => router.push(`/mac/${match.id}`)}
              />
            ))
          ) : (
            <EmptyState
              icon="football-outline"
              title="Sonuç yok"
              body="Bu takımın oynanmış maçı bulunmuyor."
            />
          )
        ) : tab === "fixtures" ? (
          upcoming.length ? (
            upcoming.map((match) => (
              <FixtureRow
                key={match.id}
                match={match}
                teamId={teamId}
                teamName={teamName}
                logoFor={logos.logoFor}
                onPress={() => router.push(`/mac/${match.id}`)}
              />
            ))
          ) : (
            <EmptyState
              icon="calendar-outline"
              title="Yaklaşan maç yok"
              body="Fikstüre maç eklendiğinde burada görünecek."
            />
          )
        ) : squadQuery.isLoading ? (
          <Loading />
        ) : squad.length ? (
          <>
            <Text style={styles.squadHint}>
              Bu sezon forma giyen oyuncular · {scope.seasonLabel}
            </Text>
            {squad.map((player, index) => (
              <SquadRow
                key={player.id}
                player={player}
                rank={index + 1}
                onPress={() => router.push(`/oyuncu/${player.id}`)}
              />
            ))}
          </>
        ) : (
          <EmptyState
            icon="shirt-outline"
            title="Kadro verisi yok"
            body="Seçili sezonda bu takım için oyuncu kaydı bulunmuyor. Üstteki seçicilerden takımın oynadığı lig ve sezonu seçmeyi deneyin."
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/* ===================== Yardımcılar ===================== */

function splitByState(matches: ApiMatch[]) {
  const upcoming: ApiMatch[] = [];
  const recent: ApiMatch[] = [];
  for (const match of matches) {
    const state = matchState(match);
    if (state === "scheduled") upcoming.push(match);
    else if (state === "finished") recent.push(match);
  }
  const timeOf = (m: ApiMatch) =>
    new Date(`${String(m.date).slice(0, 10)}T${m.time || "00:00:00"}`).getTime();
  upcoming.sort((a, b) => timeOf(a) - timeOf(b));
  recent.sort((a, b) => timeOf(b) - timeOf(a));
  return { upcoming, recent };
}

/** Maçı bu takımın gözünden okur: rakip, skorlar, sonuç. */
function perspective(match: ApiMatch, teamId: number, teamName: string) {
  const home =
    Number(match.home_team_id) === teamId || match.first_team_name === teamName;
  const ours = home ? match.first_team_score : match.second_team_score;
  const theirs = home ? match.second_team_score : match.first_team_score;
  const opponentName = home ? match.second_team_name : match.first_team_name;
  const opponentId = home ? match.away_team_id : match.home_team_id;
  const result =
    ours == null || theirs == null ? null : ours > theirs ? "W" : ours < theirs ? "L" : "D";
  return { home, ours, theirs, opponentName, opponentId, result };
}

/* ===================== Parçalar ===================== */

function SeasonStat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <View style={styles.seasonStat}>
      <Text style={[styles.seasonValue, highlight && styles.seasonValueHi]}>{value}</Text>
      <Text style={styles.seasonLabel}>{label}</Text>
    </View>
  );
}

function FormChips({ last5 }: { last5: string }) {
  return (
    <View style={styles.form}>
      {last5
        .slice(-5)
        .split("")
        .map((result, index) => (
          <View
            key={`${result}-${index}`}
            style={[
              styles.chip,
              result === "W" ? styles.chipWin : result === "L" ? styles.chipLoss : styles.chipDraw,
            ]}
          >
            <Text style={styles.chipText}>
              {result === "W" ? "G" : result === "L" ? "M" : "B"}
            </Text>
          </View>
        ))}
    </View>
  );
}

function Stat({ label, value }: { label: string; value: number | string | null | undefined }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value ?? "—"}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function TabButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.tab, active && styles.tabActive, pressed && styles.pressed]}
    >
      <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
    </Pressable>
  );
}

function MatchRow({
  match,
  teamId,
  teamName,
  logoFor,
  onPress,
}: {
  match: ApiMatch;
  teamId: number;
  teamName: string;
  logoFor: (id?: number | null, name?: string | null) => string | null;
  onPress: () => void;
}) {
  const view = perspective(match, teamId, teamName);

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.matchRow, pressed && styles.pressed]}>
      <View
        style={[
          styles.resultBadge,
          view.result === "W"
            ? styles.chipWin
            : view.result === "L"
              ? styles.chipLoss
              : styles.chipDraw,
        ]}
      >
        <Text style={styles.resultBadgeText}>
          {view.result === "W" ? "G" : view.result === "L" ? "M" : "B"}
        </Text>
      </View>
      <TeamCrest name={view.opponentName} logo={logoFor(view.opponentId, view.opponentName)} size={30} />
      <View style={styles.matchBody}>
        <Text style={styles.opponent} numberOfLines={1}>
          {String(view.opponentName ?? "").toLocaleUpperCase("tr-TR")}
        </Text>
        <Text style={styles.matchMeta} numberOfLines={1}>
          {formatDateShort(match.date)}
          {match.match_field ? ` · ${match.match_field}` : ""}
          {view.home ? " · İç saha" : " · Deplasman"}
        </Text>
      </View>
      <Text style={styles.score}>
        {view.ours ?? "-"}
        <Text style={styles.scoreDash}> - </Text>
        {view.theirs ?? "-"}
      </Text>
    </Pressable>
  );
}

function FixtureRow({
  match,
  teamId,
  teamName,
  logoFor,
  onPress,
}: {
  match: ApiMatch;
  teamId: number;
  teamName: string;
  logoFor: (id?: number | null, name?: string | null) => string | null;
  onPress: () => void;
}) {
  const view = perspective(match, teamId, teamName);

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.matchRow, pressed && styles.pressed]}>
      <View style={styles.dateBox}>
        <Text style={styles.dateText}>{formatDateShort(match.date)}</Text>
        <Text style={styles.timeText}>{formatTime(match.time)}</Text>
      </View>
      <TeamCrest name={view.opponentName} logo={logoFor(view.opponentId, view.opponentName)} size={30} />
      <View style={styles.matchBody}>
        <Text style={styles.opponent} numberOfLines={1}>
          {String(view.opponentName ?? "").toLocaleUpperCase("tr-TR")}
        </Text>
        <Text style={styles.matchMeta} numberOfLines={1}>
          {match.match_field ?? "Saha bilgisi yok"}
          {view.home ? " · İç saha" : " · Deplasman"}
        </Text>
      </View>
      <Pressable
        onPress={() => addMatchToCalendar(match)}
        hitSlop={8}
        style={({ pressed }) => [styles.calBtn, pressed && styles.pressed]}
      >
        <Ionicons name="calendar-outline" size={18} color={colors.turf} />
      </Pressable>
    </Pressable>
  );
}

function SquadRow({
  player,
  rank,
  onPress,
}: {
  player: PlayerRankRow;
  rank: number;
  onPress: () => void;
}) {
  const num = (value: number | string | null | undefined) => Number(value ?? 0) || 0;

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.matchRow, pressed && styles.pressed]}>
      <Text style={styles.squadRank}>{rank}</Text>
      <PlayerAvatar name={player.name} image={player.image} size={34} />
      <View style={styles.matchBody}>
        <Text style={styles.opponent} numberOfLines={1}>
          {player.name.toLocaleUpperCase("tr-TR")}
        </Text>
        <Text style={styles.matchMeta}>{num(player.matches)} maç</Text>
      </View>
      <SquadStat label="G" value={num(player.goals)} />
      <SquadStat label="A" value={num(player.assists)} />
      <View style={styles.pointsBadge}>
        <Text style={styles.pointsValue}>{num(player.points)}</Text>
        <Text style={styles.pointsLabel}>PUAN</Text>
      </View>
    </Pressable>
  );
}

function SquadStat({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.squadStat}>
      <Text style={[styles.squadStatValue, value > 0 && styles.squadStatLead]}>{value}</Text>
      <Text style={styles.squadStatLabel}>{label}</Text>
    </View>
  );
}

/* ===================== Stiller ===================== */

/** Takım performansını otomatik Türkçe metne dönüştürür. */
function buildAnalysis(row: StandingRow, teamName: string, position: number): string {
  const { played, wins, draws, losses, goals_for, goals_against, goal_diff, last5 } = row;
  if (!played) return `${teamName} henüz bu sezonda maç oynamamış.`;

  const winRate = Math.round((wins / played) * 100);
  const teamLabel = teamName;

  // Form dizisi
  const form = last5 ? String(last5).split("") : [];
  const lastWin  = form.filter((f) => f === "G").length;
  const lastLoss = form.filter((f) => f === "M").length;

  // Giriş cümlesi
  let text = `${teamLabel} bu sezon ${played} maç oynadı; ${wins} galibiyet, ${draws} beraberlik, ${losses} mağlubiyet aldı. `;

  // Puan + sıra
  text += `Ligde ${position}. sırada yer alıyor. `;

  // Gol dengesi
  if (goal_diff > 0) {
    text += `${goals_for} gol atıp ${goals_against} gol yiyerek +${goal_diff} averajla avantajlı konumda. `;
  } else if (goal_diff < 0) {
    text += `${goals_for} gol atıp ${goals_against} gol yiyerek ${goal_diff} averajla geride. `;
  } else {
    text += `${goals_for} gol atıp ${goals_against} gol yedi, averajı dengede. `;
  }

  // Galibiyet oranı yorumu
  if (winRate === 100) {
    text += "Mükemmel bir galibiyet oranıyla sezona damga vuruyor! 🔥";
  } else if (winRate >= 70) {
    text += `%${winRate} galibiyet oranıyla güçlü bir sezonu sürdürüyor. 💪`;
  } else if (winRate >= 50) {
    text += `%${winRate} galibiyet oranıyla ligde rekabetçi konumunu koruyor.`;
  } else if (winRate >= 30) {
    text += `%${winRate} galibiyet oranıyla iyileşme arayan bir grafik çiziyor.`;
  } else {
    text += "Zorlu bir dönemden geçiyor; toparlanma adına kritik maçlar önünde.";
  }

  // Son form notu
  if (form.length >= 3) {
    if (lastWin >= 3) {
      text += ` Son maçlardaki ${lastWin} galibiyet serisi moralleri yüksek tutmaya devam ediyor. ✅`;
    } else if (lastLoss >= 3) {
      text += ` Ancak son ${lastLoss} mağlubiyetle form kaybı yaşıyor. ⚠️`;
    }
  }

  return text.trim();
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
    gap: spacing.xs,
    paddingVertical: spacing.md,
  },
  teamName: {
    ...type.title,
    color: colors.line,
    textAlign: "center",
    marginTop: spacing.xs,
  },
  teamMeta: {
    ...type.small,
    color: colors.muted,
  },
  favBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.faint,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.sm,
  },
  favBtnActive: {
    borderColor: colors.yellow,
    backgroundColor: colors.goldDim + "55",
  },
  favText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.muted,
  },
  favTextActive: {
    color: colors.line,
  },
  analysisCard: {
    backgroundColor: colors.turfDim,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  analysisHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  analysisKicker: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
    color: colors.turf,
  },
  analysisText: {
    fontSize: 13,
    fontWeight: "500",
    color: colors.line,
    lineHeight: 20,
  },
  seasonCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.turf,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  cardKicker: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.8,
    color: colors.turf,
    marginBottom: spacing.sm,
  },
  seasonRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  seasonStat: {
    alignItems: "center",
  },
  seasonValue: {
    ...type.subtitle,
    color: colors.line,
    fontVariant: ["tabular-nums"],
  },
  seasonValueHi: {
    color: colors.turf,
  },
  seasonLabel: {
    fontSize: 8,
    fontWeight: "700",
    color: colors.muted,
    letterSpacing: 0.5,
    marginTop: 1,
  },
  form: {
    flexDirection: "row",
    gap: 3,
    marginLeft: "auto",
  },
  chip: {
    width: 15,
    height: 15,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  chipWin: { backgroundColor: colors.green },
  chipDraw: { backgroundColor: "#B9B5C6" },
  chipLoss: { backgroundColor: colors.live },
  chipText: {
    fontSize: 8,
    fontWeight: "800",
    color: colors.surface,
  },
  statsCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.faint,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  stat: {
    alignItems: "center",
    flex: 1,
  },
  statValue: {
    ...type.subtitle,
    color: colors.line,
    fontVariant: ["tabular-nums"],
  },
  statLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: colors.muted,
    letterSpacing: 0.4,
    marginTop: 1,
  },
  tabs: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.faint,
  },
  tabActive: {
    backgroundColor: colors.turf,
    borderColor: colors.turf,
  },
  tabText: {
    ...type.caption,
    color: colors.muted,
  },
  tabTextActive: {
    color: colors.surface,
  },
  matchRow: {
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
  resultBadge: {
    width: 22,
    height: 22,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  resultBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.surface,
  },
  matchBody: {
    flex: 1,
  },
  opponent: {
    ...type.small,
    color: colors.line,
    fontWeight: "700",
  },
  matchMeta: {
    ...type.caption,
    color: colors.muted,
    letterSpacing: 0,
    marginTop: 1,
  },
  score: {
    ...type.subtitle,
    color: colors.line,
    fontVariant: ["tabular-nums"],
  },
  scoreDash: {
    color: colors.muted,
  },
  dateBox: {
    alignItems: "center",
    minWidth: 52,
  },
  dateText: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.line,
  },
  timeText: {
    fontSize: 10,
    fontWeight: "600",
    color: colors.muted,
    marginTop: 1,
  },
  calBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.turfDim,
    alignItems: "center",
    justifyContent: "center",
  },
  squadHint: {
    ...type.caption,
    color: colors.muted,
    letterSpacing: 0,
    marginBottom: spacing.sm,
  },
  squadRank: {
    ...type.small,
    color: colors.muted,
    width: 20,
    textAlign: "center",
    fontVariant: ["tabular-nums"],
  },
  squadStat: {
    alignItems: "center",
    width: 24,
  },
  squadStatValue: {
    ...type.small,
    color: colors.muted,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  squadStatLead: {
    color: colors.line,
    fontWeight: "800",
  },
  squadStatLabel: {
    fontSize: 8,
    fontWeight: "700",
    color: colors.muted,
  },
  pointsBadge: {
    alignItems: "center",
    backgroundColor: colors.turfDim,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    minWidth: 46,
  },
  pointsValue: {
    ...type.small,
    color: colors.turf,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  pointsLabel: {
    fontSize: 7,
    fontWeight: "800",
    color: colors.turf,
    letterSpacing: 0.5,
  },
  pressed: {
    opacity: 0.7,
  },
});
