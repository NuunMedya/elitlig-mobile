import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { DetailHeader } from "@/components/ScreenHeader";
import { ErrorState, Loading } from "@/components/States";
import { PlayerAvatar, TeamCrest } from "@/components/TeamCrest";
import { colors, radius, spacing, type } from "@/constants/theme";
import { getPlayer, getPlayerRankings } from "@/lib/api/players";
import { getTeam } from "@/lib/api/teams";
import { formatAge, formatMoney } from "@/lib/format";
import { queryKeys } from "@/lib/queryKeys";
import { useScope } from "@/providers/ScopeProvider";

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

  const assists = useMemo(() => {
    const row = rankingsQuery.data?.players?.find((item) => Number(item.id) === playerId);
    return row ? Number(row.assists) || 0 : null;
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

  // formatAge/formatMoney boş değerde "—" döndürür; tireli satır gizlensin.
  const clean = (value: string) => (value && value !== "—" ? value : null);
  const age = clean(formatAge(player.birth_date));
  const money = clean(
    formatMoney(player.market_value ?? player.value, player.market_value_currency ?? undefined)
  );
  const infoRows = [
    age ? { label: "Yaş", value: age } : null,
    player.nationality?.trim() ? { label: "Uyruk", value: player.nationality.trim() } : null,
    player.city?.trim() ? { label: "Şehir", value: player.city.trim() } : null,
    money ? { label: "Piyasa değeri", value: money } : null,
  ].filter(Boolean) as { label: string; value: string }[];

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <DetailHeader title={player.player_name} subtitle={player.player_position ?? undefined} />

      <ScrollView contentContainerStyle={styles.content}>
        {/* Kimlik */}
        <View style={styles.hero}>
          <View style={styles.avatarRing}>
            <PlayerAvatar name={player.player_name} image={player.player_img} size={92} />
          </View>
          <Text style={styles.name}>{player.player_name}</Text>
          <View style={styles.chipRow}>
            {player.player_position ? (
              <View style={styles.positionChip}>
                <Text style={styles.positionText}>
                  {player.player_position.toLocaleUpperCase("tr-TR")}
                </Text>
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

        {/* İkincil metrikler */}
        <View style={styles.pillRow}>
          <MetricPill label="Gol / Maç" value={perMatch} />
          <MetricPill label="Sarı Kart" value={String(yellow)} tone={yellow > 0 ? "yellow" : undefined} />
          <MetricPill label="Kırmızı Kart" value={String(red)} tone={red > 0 ? "red" : undefined} />
        </View>

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

        {/* Bilgiler — yalnızca dolu alanlar */}
        {infoRows.length > 0 ? (
          <View style={styles.card}>
            <Text style={styles.cardKicker}>BİLGİLER</Text>
            {infoRows.map((row, index) => (
              <View
                key={row.label}
                style={[styles.infoRow, index > 0 && styles.infoRowBorder]}
              >
                <Text style={styles.infoLabel}>{row.label}</Text>
                <Text style={styles.infoValue}>{row.value}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
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
    width: StyleSheet.hairlineWidth,
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
    borderTopWidth: StyleSheet.hairlineWidth,
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
});
