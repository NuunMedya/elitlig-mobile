import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { DetailHeader } from "@/components/ScreenHeader";
import { ErrorState, Loading } from "@/components/States";
import { PlayerAvatar, TeamCrest } from "@/components/TeamCrest";
import { colors, radius, spacing, type } from "@/constants/theme";
import { getPlayer } from "@/lib/api/players";
import { getTeam } from "@/lib/api/teams";
import { formatAge, formatMoney } from "@/lib/format";
import { queryKeys } from "@/lib/queryKeys";

/**
 * Oyuncu profili — GET /api/players/:id
 *
 * Uç yalnızca herkese açık alanları döndürür; telefon ve e-posta ancak yetkili
 * görüntüleyiciye (oyuncunun kendisi, takım başkanı, yönetim) eklenir. Bu
 * yüzden ekran bu alanları "varsa göster" mantığıyla ele alır.
 */
export default function PlayerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const playerId = Number(id);
  const validId = Number.isFinite(playerId) && playerId > 0;
  const router = useRouter();

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

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <DetailHeader title={player.player_name} subtitle={player.player_position ?? undefined} />

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <PlayerAvatar name={player.player_name} image={player.player_img} size={88} />
          <Text style={styles.name}>{player.player_name}</Text>

          {team ? (
            <Pressable
              style={({ pressed }) => [styles.teamChip, pressed && styles.pressed]}
              onPress={() => router.push(`/takim/${team.id}`)}
            >
              <TeamCrest name={team.team_name} logo={team.logo} size={20} />
              <Text style={styles.teamChipText}>{team.team_name}</Text>
            </Pressable>
          ) : (
            <Text style={styles.meta}>Takımsız</Text>
          )}
        </View>

        <View style={styles.statGrid}>
          <Stat label="Maç" value={String(played)} />
          <Stat label="Gol" value={String(goals)} />
          <Stat
            label="Maç Başı Gol"
            value={played > 0 ? (goals / played).toFixed(2) : "—"}
          />
        </View>

        <View style={styles.statGrid}>
          <Stat label="Sarı Kart" value={String(player.total_yellow_cards ?? 0)} />
          <Stat label="Kırmızı Kart" value={String(player.total_red_cards ?? 0)} />
          <Stat label="Puan" value={String(player.total_points ?? 0)} />
        </View>

        <View style={styles.card}>
          <InfoRow label="Mevki" value={player.player_position || "—"} />
          <InfoRow label="Yaş" value={formatAge(player.birth_date)} />
          <InfoRow label="Uyruk" value={player.nationality || "—"} />
          <InfoRow label="Şehir" value={player.city || "—"} />
          <InfoRow
            label="Piyasa değeri"
            value={formatMoney(player.market_value ?? player.value, player.market_value_currency ?? "TRY")}
          />
        </View>

        {/* Sunucu iletişim bilgisini yalnızca yetkili görüntüleyiciye ekler. */}
        {player.phone || player.email ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>İletişim</Text>
            {player.phone ? <InfoRow label="Telefon" value={player.phone} /> : null}
            {player.email ? <InfoRow label="E-posta" value={player.email} /> : null}
          </View>
        ) : null}

        <View style={styles.statGrid}>
          <Stat label="Galibiyet" value={String(player.wins ?? 0)} />
          <Stat label="Beraberlik" value={String(player.draws ?? 0)} />
          <Stat label="Mağlubiyet" value={String(player.losses ?? 0)} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={1}>
        {value}
      </Text>
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
    gap: spacing.sm,
  },
  hero: {
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  name: {
    ...type.title,
    color: colors.line,
    textAlign: "center",
  },
  meta: {
    ...type.small,
    color: colors.muted,
  },
  teamChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  teamChipText: {
    ...type.small,
    color: colors.line,
  },
  pressed: {
    opacity: 0.8,
  },
  statGrid: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
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
    letterSpacing: 0,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardTitle: {
    ...type.caption,
    color: colors.muted,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  infoLabel: {
    ...type.small,
    color: colors.muted,
  },
  infoValue: {
    ...type.small,
    color: colors.line,
    flexShrink: 1,
    textAlign: "right",
  },
});
