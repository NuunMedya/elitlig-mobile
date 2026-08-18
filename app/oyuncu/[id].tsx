import { useQueries, useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { DetailHeader } from "@/components/ScreenHeader";
import { ErrorState, Loading } from "@/components/States";
import { PlayerAvatar, TeamCrest } from "@/components/TeamCrest";
import { colors, radius, spacing, type } from "@/constants/theme";
import { getMatchKadro, getTeamMatches } from "@/lib/api/matches";
import { getPlayer, getPlayerRankings } from "@/lib/api/players";
import { getTeam } from "@/lib/api/teams";
import { formatDateShort } from "@/lib/format";
import { queryKeys } from "@/lib/queryKeys";
import { matchState } from "@/lib/match";
import { useScope } from "@/providers/ScopeProvider";
import type { ApiMatch, KadroPlayer } from "@/lib/types";

/**
 * Oyuncu profili — GET /api/players/:id
 *
 * Tasarım ilkeleri: boş alanlar tire olarak sırıtmaz, satır hiç görünmez;
 * G/B/M kuru rakam değil oranlı renk çubuğudur; asist bu uçta olmadığından
 * kapsamdaki sıralama listesinden zenginleştirilir (bulunamazsa gizlenir).
 * İletişim alanları yanıta yalnızca yetkili görüntüleyici için eklenir.
 */
export default function PlayerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const playerId = Number(id);
  const validId = Number.isFinite(playerId) && playerId > 0;
  const router = useRouter();
  const scope = useScope();

  const playerQuery = useQuery({
    queryKey: queryKeys.player(playerId),
    queryFn: () => getPlayer(playerId),
    enabled: validId,
  });

  const player = playerQuery.data;

  const teamQuery = useQuery({
    queryKey: queryKeys.team(Number(player?.team_id)),
    queryFn: () => getTeam(Number(player?.team_id)),
    enabled: Boolean(player?.team_id),
    staleTime: 10 * 60_000,
  });

  // Asist bilgisi oyuncu ucunda yok; kapsamdaki sıralamadan bulunur.
  const scopeKey = {
    cityId: scope.cityId ?? undefined,
    leagueId: scope.leagueId ?? undefined,
    seasonId: scope.seasonId ?? undefined,
  };
  const rankingsQuery = useQuery({
    queryKey: queryKeys.playerRankings(scopeKey, "topScorers"),
    queryFn: () => getPlayerRankings(scopeKey, "topScorers"),
    enabled: scope.ready && validId,
    staleTime: 5 * 60_000,
  });

  // Türkiye geneli sıralama (kapsamsız)
  const trRankQuery = useQuery({
    queryKey: queryKeys.playerRankings({}, "topScorers"),
    queryFn: () => getPlayerRankings({}, "topScorers"),
    enabled: validId,
    staleTime: 10 * 60_000,
  });
  const trRank = useMemo(() => {
    const list = trRankQuery.data?.players ?? [];
    const idx = list.findIndex((p) => Number(p.id) === playerId);
    return idx >= 0 ? { rank: idx + 1, total: list.length } : null;
  }, [trRankQuery.data, playerId]);

  const assists = useMemo(() => {
    const row = rankingsQuery.data?.players?.find((item) => Number(item.id) === playerId);
    return row ? Number(row.assists) || 0 : null;
  }, [rankingsQuery.data, playerId]);

  // Lig içi sıralamalar — zaten çekilen listeden türetilir, ek istek yok.
  const ranks = useMemo(() => {
    const players = rankingsQuery.data?.players ?? [];
    if (players.length === 0) return null;
    const me = players.find((item) => Number(item.id) === playerId);
    if (!me) return null;
    const rankBy = (key: "points" | "goals") => {
      const sorted = [...players].sort(
        (a, b) => (Number(b[key]) || 0) - (Number(a[key]) || 0)
      );
      const index = sorted.findIndex((item) => Number(item.id) === playerId);
      return index >= 0 ? index + 1 : null;
    };
    const teamMates = players
      .filter((item) => Number(item.teamId) === Number(me.teamId))
      .sort((a, b) => (Number(b.points) || 0) - (Number(a.points) || 0));
    const teamIndex = teamMates.findIndex((item) => Number(item.id) === playerId);
    return {
      points: rankBy("points"),
      goals: rankBy("goals"),
      team: teamIndex >= 0 ? teamIndex + 1 : null,
      total: players.length,
    };
  }, [rankingsQuery.data, playerId]);

  if (playerQuery.isLoading) {
    return (
      <SafeAreaView style={styles.screen} edges={["top"]}>
        <DetailHeader title="Oyuncu" />
        <Loading />
      </SafeAreaView>
    );
  }

  if (playerQuery.isError || !player) {
    return (
      <SafeAreaView style={styles.screen} edges={["top"]}>
        <DetailHeader title="Oyuncu" />
        <ErrorState error={playerQuery.error} onRetry={playerQuery.refetch} />
      </SafeAreaView>
    );
  }

  const team = teamQuery.data;
  const played = Number(player.total_matches ?? 0);
  const goals = Number(player.total_goals ?? 0);
  const points = Number(player.total_points ?? 0);
  const yellow = Number(player.total_yellow_cards ?? 0);
  const red = Number(player.total_red_cards ?? 0);
  const wins = Number(player.wins ?? 0);
  const draws = Number(player.draws ?? 0);
  const losses = Number(player.losses ?? 0);
  const decided = wins + draws + losses;
  const winRate = decided > 0 ? Math.round((wins / decided) * 100) : null;
  const perMatch = played > 0 ? (goals / played).toFixed(2) : "0.00";

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <DetailHeader title={player.player_name} subtitle={player.player_position ?? undefined} />

      <ScrollView contentContainerStyle={styles.content}>
        {/* Kimlik */}
        <View style={styles.hero}>
          <View style={styles.avatarRing}>
            <PlayerAvatar name={player.player_name} image={player.player_img} size={100} />
          </View>
          <Text style={styles.name}>{player.player_name}</Text>
          <View style={styles.chipRow}>
            {player.player_position ? (
              <View style={styles.positionChip}>
                <Text style={styles.positionText}>
                  {positionIcon(player.player_position)}{" "}
                  {player.player_position.toLocaleUpperCase("tr-TR")}
                </Text>
              </View>
            ) : null}
            {trRank ? (
              <View style={styles.trChip}>
                <Text style={styles.trChipText}>🇹🇷 {trRank.rank}. / {trRank.total}</Text>
              </View>
            ) : null}
            {team ? (
              <Pressable
                style={({ pressed }) => [styles.teamChip, pressed && styles.pressed]}
                onPress={() => router.push(`/takim/${team.id}`)}
              >
                <TeamCrest name={team.team_name} logo={team.logo} size={18} />
                <Text style={styles.teamChipText} numberOfLines={1}>
                  {team.team_name}
                </Text>
              </Pressable>
            ) : (
              <View style={styles.teamChip}>
                <Text style={styles.teamChipText}>Takımsız</Text>
              </View>
            )}
          </View>
        </View>

        {/* Ana metrikler */}
        <View style={styles.mainCard}>
          <MainStat label="MAÇ" value={String(played)} />
          <View style={styles.divider} />
          <MainStat label="GOL" value={String(goals)} />
          <View style={styles.divider} />
          {assists != null ? (
            <>
              <MainStat label="ASİST" value={String(assists)} />
              <View style={styles.divider} />
            </>
          ) : null}
          <MainStat label="PUAN" value={String(points)} highlight />
        </View>

        {/* Kariyer özeti */}
        {played > 0 ? (
          <View style={styles.careerCard}>
            <Text style={styles.cardKicker}>KARİYER ÖZETI</Text>
            <View style={styles.careerRow}>
              <CareerStat label="Gol/Maç" value={perMatch} />
              <CareerStat label="Puan/Maç" value={played > 0 ? (points / played).toFixed(1) : "0.0"} />
              <CareerStat label="Top Maç" value={String(played)} />
              <CareerStat label="Katkı" value={assists != null ? String(goals + assists) : String(goals)} />
            </View>
            {/* Kariyer çubuğu: gol / asist / puan görsel dağılımı */}
            <View style={styles.contribBar}>
              {goals > 0 ? <View style={[styles.barSegment, styles.barGoal, { flex: goals }]} /> : null}
              {assists != null && assists > 0 ? <View style={[styles.barSegment, styles.barAssist, { flex: assists }]} /> : null}
            </View>
            <View style={styles.barLegendRow}>
              <View style={styles.barLegendItem}><View style={[styles.barLegendDot, { backgroundColor: colors.green }]} /><Text style={styles.barLegendLabel}>{goals} Gol</Text></View>
              {assists != null ? <View style={styles.barLegendItem}><View style={[styles.barLegendDot, { backgroundColor: colors.turf }]} /><Text style={styles.barLegendLabel}>{assists} Asist</Text></View> : null}
            </View>
          </View>
        ) : null}

        {/* İkincil metrikler */}
        <View style={styles.pillRow}>
          <MetricPill label="Gol / Maç" value={perMatch} />
          <MetricPill label="Sarı Kart" value={String(yellow)} tone={yellow > 0 ? "yellow" : undefined} />
          <MetricPill label="Kırmızı Kart" value={String(red)} tone={red > 0 ? "red" : undefined} />
          <MetricPill label="Puan / Maç" value={played > 0 ? (points / played).toFixed(1) : "0.0"} />
        </View>

        {/* Lig içi sıralamalar */}
        {ranks ? (
          <View style={styles.rankRow}>
            {ranks.points ? <RankPill label="PUAN SIRALAMASI" value={`${ranks.points}.`} /> : null}
            {ranks.goals ? <RankPill label="GOL KRALLIĞI" value={`${ranks.goals}.`} /> : null}
            {ranks.team ? <RankPill label="TAKIMINDA" value={`${ranks.team}.`} /> : null}
          </View>
        ) : null}

        {/* Başarılar — eşiklerden otomatik türetilen rozetler */}
        <Achievements
          goals={goals}
          played={played}
          yellow={yellow}
          red={red}
          winRate={winRate}
          pointsRank={ranks?.points ?? null}
          goalsRank={ranks?.goals ?? null}
        />

        {/* Galibiyet dengesi */}
        {decided > 0 ? (
          <View style={styles.card}>
            <View style={styles.cardHead}>
              <Text style={styles.cardKicker}>GALİBİYET DENGESİ</Text>
              {winRate != null ? (
                <Text style={styles.winRate}>%{winRate} galibiyet</Text>
              ) : null}
            </View>
            <View style={styles.balanceBar}>
              {wins > 0 ? <View style={[styles.barWin, { flex: wins }]} /> : null}
              {draws > 0 ? <View style={[styles.barDraw, { flex: draws }]} /> : null}
              {losses > 0 ? <View style={[styles.barLoss, { flex: losses }]} /> : null}
            </View>
            <View style={styles.balanceLegend}>
              <Legend color={colors.green} label={`${wins} Galibiyet`} />
              <Legend color="#B9B5C6" label={`${draws} Beraberlik`} />
              <Legend color={colors.live} label={`${losses} Mağlubiyet`} />
            </View>
          </View>
        ) : null}

        {/* Son maçları — takım maçlarının kadrolarından süzülür */}
        {player.team_id ? (
          <RecentAppearances
            playerId={playerId}
            teamId={Number(player.team_id)}
            onOpen={(id) => router.push(`/mac/${id}`)}
          />
        ) : null}

      </ScrollView>
    </SafeAreaView>
  );
}

/** Eşiklerden otomatik kazanılan rozetler; hiçbiri yoksa bölüm görünmez. */
function Achievements({
  goals,
  played,
  yellow,
  red,
  winRate,
  pointsRank,
  goalsRank,
}: {
  goals: number;
  played: number;
  yellow: number;
  red: number;
  winRate: number | null;
  pointsRank: number | null;
  goalsRank: number | null;
}) {
  const badges: string[] = [];
  if (pointsRank === 1) badges.push("👑 Puan Lideri");
  if (goalsRank === 1) badges.push("⚽ Gol Kralı");
  if (goals >= 100) badges.push("💯 100 Gol Kulübü");
  else if (goals >= 50) badges.push("🎯 50+ Gol");
  if (played >= 100) badges.push("🏟️ 100+ Maç");
  else if (played >= 50) badges.push("🛡️ 50+ Maç");
  if (winRate != null && winRate >= 60 && played >= 10) badges.push("🔥 %60+ Galibiyet");
  if (yellow === 0 && red === 0 && played >= 10) badges.push("🤝 Centilmen");

  if (badges.length === 0) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.cardKicker}>BAŞARILAR</Text>
      <View style={styles.badgeWrap}>
        {badges.map((badge) => (
          <View key={badge} style={styles.badge}>
            <Text style={styles.badgeText}>{badge}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/** Mevki → emoji */
function positionIcon(pos: string): string {
  const p = String(pos).toLowerCase();
  if (p.includes("kaleci") || p.includes("kale")) return "🧤";
  if (p.includes("defans") || p.includes("bek"))  return "🛡️";
  if (p.includes("orta"))                          return "⚙️";
  if (p.includes("kanat"))                         return "⚡";
  if (p.includes("forvet") || p.includes("9"))     return "⚽";
  return "🏃";
}

function CareerStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.careerStat}>
      <Text style={styles.careerStatValue}>{value}</Text>
      <Text style={styles.careerStatLabel}>{label}</Text>
    </View>
  );
}

function RankPill({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.rankPill}>
      <Text style={styles.rankValue}>{value}</Text>
      <Text style={styles.rankLabel}>{label}</Text>
    </View>
  );
}

/** Son maç puanlarından mini çubuk grafik (soldan sağa eskiden yeniye). */
function PointsSpark({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  return (
    <View style={styles.spark}>
      {values.map((value, index) => (
        <View key={index} style={styles.sparkCol}>
          <View
            style={[
              styles.sparkBar,
              {
                height: Math.max(6, Math.round((value / max) * 40)),
              },
              index === values.length - 1 && styles.sparkBarLast,
            ]}
          />
          <Text style={styles.sparkValue}>{value}</Text>
        </View>
      ))}
    </View>
  );
}

/**
 * Oyuncunun son çıktığı maçlar — takımının son maçlarının kadroları taranır,
 * oyuncunun bulunduğu maçlar tarih/rakip/skor/G-B-M ve o maçtaki puanıyla
 * listelenir. Kadro sorguları maç detayıyla aynı önbelleği paylaşır.
 */
function RecentAppearances({
  playerId,
  teamId,
  onOpen,
}: {
  playerId: number;
  teamId: number;
  onOpen: (matchId: number) => void;
}) {
  const teamMatchesQuery = useQuery({
    queryKey: queryKeys.teamMatches(teamId),
    queryFn: () => getTeamMatches(teamId),
    enabled: teamId > 0,
    staleTime: 60_000,
  });

  const recent = useMemo(() => {
    const timeOf = (m: ApiMatch) =>
      new Date(`${String(m.date).slice(0, 10)}T${m.time || "00:00:00"}`).getTime();
    return (teamMatchesQuery.data ?? [])
      .filter((m) => matchState(m) === "finished")
      .sort((a, b) => timeOf(b) - timeOf(a))
      .slice(0, 6);
  }, [teamMatchesQuery.data]);

  const kadroQueries = useQueries({
    queries: recent.map((m) => ({
      queryKey: [...queryKeys.match(Number(m.id)), "kadro"] as const,
      queryFn: () => getMatchKadro(Number(m.id)),
      staleTime: 60 * 60_000,
    })),
  });

  const rows = useMemo(() => {
    const findMe = (players?: KadroPlayer[]) =>
      (players ?? []).find(
        (p) => Number(p.playerId ?? p.oyuncu_id ?? p.id) === playerId
      );
    const out: {
      match: ApiMatch;
      puan: number | null;
      result: "G" | "B" | "M";
      opponent: string;
      score: string;
    }[] = [];
    recent.forEach((m, index) => {
      const kadro = kadroQueries[index]?.data;
      if (!kadro) return;
      const me = findMe(kadro.home) ?? findMe(kadro.away);
      if (!me) return;
      const isHome = Number(m.home_team_id) === teamId;
      const ours = isHome ? m.first_team_score : m.second_team_score;
      const theirs = isHome ? m.second_team_score : m.first_team_score;
      const result =
        ours == null || theirs == null ? "B" : ours > theirs ? "G" : ours < theirs ? "M" : "B";
      out.push({
        match: m,
        puan: me.puan != null ? Number(me.puan) : null,
        result,
        opponent: String(isHome ? m.second_team_name : m.first_team_name ?? ""),
        score: `${ours ?? "-"} - ${theirs ?? "-"}`,
      });
    });
    return out;
  }, [recent, kadroQueries, playerId, teamId]);

  if (rows.length === 0) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.cardKicker}>SON MAÇLARI</Text>
      <PointsSpark
        values={rows
          .map((row) => row.puan)
          .filter((value): value is number => value != null)
          .reverse()}
      />
      {rows.map(({ match, puan, result, opponent, score }) => (
        <Pressable
          key={match.id}
          onPress={() => onOpen(Number(match.id))}
          style={({ pressed }) => [styles.appearRow, pressed && styles.pressed]}
        >
          <Text style={styles.appearDate}>{formatDateShort(match.date)}</Text>
          <View
            style={[
              styles.appearChip,
              result === "G"
                ? styles.appearWin
                : result === "M"
                  ? styles.appearLoss
                  : styles.appearDraw,
            ]}
          >
            <Text style={styles.appearChipText}>{result}</Text>
          </View>
          <Text style={styles.appearOpponent} numberOfLines={1}>
            {opponent.toLocaleUpperCase("tr-TR")}
          </Text>
          <Text style={styles.appearScore}>{score}</Text>
          {puan != null ? (
            <View style={styles.appearPoints}>
              <Text style={styles.appearPointsText}>{puan}</Text>
            </View>
          ) : null}
        </Pressable>
      ))}
      <Text style={styles.appearHint}>Sağdaki mor rozet o maçtaki puanı · dokun, maça git</Text>
    </View>
  );
}

function MainStat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <View style={styles.mainStat}>
      <Text style={[styles.mainValue, highlight && styles.mainValueHi]}>{value}</Text>
      <Text style={styles.mainLabel}>{label}</Text>
    </View>
  );
}

function MetricPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "yellow" | "red";
}) {
  return (
    <View style={styles.metricPill}>
      <Text
        style={[
          styles.metricValue,
          tone === "yellow" && { color: colors.yellow },
          tone === "red" && { color: colors.live },
        ]}
      >
        {value}
      </Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legend}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
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
  trChip: {
    backgroundColor: colors.turfDim,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
  },
  trChipText: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.turf,
  },
  careerCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.faint,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  careerRow: {
    flexDirection: "row",
  },
  contribBar: {
    flexDirection: "row",
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
    backgroundColor: colors.surfaceRaised,
  },
  barSegment: {
    height: 6,
  },
  barGoal: {
    backgroundColor: colors.green,
  },
  barAssist: {
    backgroundColor: colors.turf,
  },
  barLegendRow: {
    flexDirection: "row",
    gap: spacing.md,
  },
  barLegendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  barLegendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  barLegendLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: colors.muted,
  },
  careerStat: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  careerStatValue: {
    fontSize: 18,
    fontWeight: "900",
    color: colors.line,
    fontVariant: ["tabular-nums"],
  },
  careerStatLabel: {
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.5,
    color: colors.muted,
  },
  hero: {
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  avatarRing: {
    borderWidth: 3,
    borderColor: colors.turf,
    borderRadius: 999,
    padding: 3,
  },
  name: {
    ...type.title,
    color: colors.line,
    textAlign: "center",
  },
  chipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  positionChip: {
    backgroundColor: colors.turf,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
  },
  positionText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
    color: colors.surface,
  },
  teamChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.faint,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
    maxWidth: 220,
  },
  teamChipText: {
    ...type.caption,
    color: colors.line,
    letterSpacing: 0,
  },
  mainCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.faint,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.sm,
  },
  mainStat: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  mainValue: {
    ...type.score,
    fontSize: 22,
    color: colors.line,
    fontVariant: ["tabular-nums"],
  },
  mainValueHi: {
    color: colors.turf,
  },
  mainLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: colors.muted,
    letterSpacing: 0.6,
  },
  divider: {
    width: 1,
    alignSelf: "stretch",
    backgroundColor: colors.faint,
  },
  pillRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  metricPill: {
    flex: 1,
    alignItems: "center",
    gap: 2,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.faint,
    borderRadius: radius.md,
    paddingVertical: spacing.sm + 2,
  },
  metricValue: {
    ...type.subtitle,
    color: colors.line,
    fontVariant: ["tabular-nums"],
  },
  metricLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: colors.muted,
    letterSpacing: 0.3,
  },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.faint,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  cardHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  cardKicker: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.8,
    color: colors.turf,
  },
  winRate: {
    ...type.caption,
    color: colors.green,
    letterSpacing: 0,
  },
  balanceBar: {
    flexDirection: "row",
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
  },
  barWin: { backgroundColor: colors.green },
  barDraw: { backgroundColor: "#B9B5C6" },
  barLoss: { backgroundColor: colors.live },
  balanceLegend: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.sm,
  },
  legend: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    ...type.caption,
    color: colors.muted,
    letterSpacing: 0,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.sm,
  },
  infoRowBorder: {
    borderTopWidth: 1,
    borderTopColor: colors.faint,
  },
  infoLabel: {
    ...type.small,
    color: colors.muted,
  },
  infoValue: {
    ...type.small,
    color: colors.line,
    fontWeight: "700",
  },
  pressed: {
    opacity: 0.7,
  },
  rankRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  rankPill: {
    flex: 1,
    alignItems: "center",
    gap: 2,
    backgroundColor: colors.turfDim,
    borderRadius: radius.md,
    paddingVertical: spacing.sm + 2,
  },
  rankValue: {
    ...type.subtitle,
    color: colors.turf,
    fontVariant: ["tabular-nums"],
  },
  rankLabel: {
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.4,
    color: colors.turf,
  },
  appearRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    marginTop: spacing.sm,
  },
  appearDate: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.muted,
    width: 46,
  },
  appearChip: {
    width: 18,
    height: 18,
    borderRadius: 5,
    alignItems: "center",
    justifyContent: "center",
  },
  appearWin: { backgroundColor: colors.green },
  appearDraw: { backgroundColor: "#B9B5C6" },
  appearLoss: { backgroundColor: colors.live },
  appearChipText: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.surface,
  },
  appearOpponent: {
    ...type.caption,
    color: colors.line,
    letterSpacing: 0,
    flex: 1,
  },
  appearScore: {
    ...type.small,
    color: colors.line,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  appearPoints: {
    minWidth: 30,
    alignItems: "center",
    backgroundColor: colors.turf,
    borderRadius: radius.pill,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  appearPointsText: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.surface,
    fontVariant: ["tabular-nums"],
  },
  appearHint: {
    fontSize: 10,
    fontWeight: "600",
    color: colors.muted,
    marginTop: spacing.sm,
  },
  badgeWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  badge: {
    backgroundColor: colors.goldDim,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 5,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.line,
  },
  spark: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  sparkCol: {
    flex: 1,
    alignItems: "center",
    gap: 3,
  },
  sparkBar: {
    width: "70%",
    maxWidth: 26,
    borderRadius: 4,
    backgroundColor: colors.turfDim,
  },
  sparkBarLast: {
    backgroundColor: colors.turf,
  },
  sparkValue: {
    fontSize: 9,
    fontWeight: "700",
    color: colors.muted,
    fontVariant: ["tabular-nums"],
  },
});
