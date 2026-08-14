import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { TeamCrest } from "@/components/TeamCrest";
import { colors, radius, spacing, type } from "@/constants/theme";
import { getStandings } from "@/lib/api/standings";
import { formatDateShort, formatTime } from "@/lib/format";
import { matchState } from "@/lib/match";
import { queryKeys } from "@/lib/queryKeys";
import { useFavorite } from "@/providers/FavoriteProvider";
import { useScope } from "@/providers/ScopeProvider";
import type { ApiMatch, StandingRow } from "@/lib/types";

/**
 * "Takımım" kartı — favori takım seçilince Genel Bakış'ın tepesinde durur.
 *
 * Tek bakışta: sıralamadaki yer + puan, son 5 form çipi ve sıradaki maç.
 * Veriler ekranın zaten çektiği sorgulardan gelir (maç listesi prop olarak,
 * puan durumu paylaşılan cache'ten) — kart ek istek maliyeti getirmez.
 */
export function MyTeamCard({ matches }: { matches: ApiMatch[] }) {
  const { favorite, clearFavorite } = useFavorite();
  const scope = useScope();
  const router = useRouter();

  const scopeKey = {
    cityId: scope.cityId ?? undefined,
    leagueId: scope.leagueId ?? undefined,
    seasonId: scope.seasonId ?? undefined,
  };

  const standingsQuery = useQuery({
    queryKey: queryKeys.standings(scopeKey),
    queryFn: () =>
      getStandings({
        cityId: scope.cityId!,
        leagueId: scope.leagueId!,
        seasonId: scope.seasonId!,
      }),
    enabled: scope.ready && favorite != null,
  });

  const info = useMemo(() => {
    if (!favorite) return null;

    const rows = standingsQuery.data ?? [];
    const index = rows.findIndex((row) => Number(row.team_id) === favorite.id);
    const standing: StandingRow | null = index >= 0 ? rows[index] : null;

    const mine = matches.filter(
      (m) =>
        Number(m.home_team_id) === favorite.id ||
        Number(m.away_team_id) === favorite.id ||
        m.first_team_name === favorite.name ||
        m.second_team_name === favorite.name
    );
    const next = mine
      .filter((m) => matchState(m) === "scheduled")
      .sort(
        (a, b) =>
          Date.parse(`${String(a.date).slice(0, 10)}T${a.time || "00:00:00"}`) -
          Date.parse(`${String(b.date).slice(0, 10)}T${b.time || "00:00:00"}`)
      )[0];

    return { standing, position: index >= 0 ? index + 1 : null, next };
  }, [favorite, matches, standingsQuery.data]);

  if (!favorite || !info) return null;
  const { standing, position, next } = info;

  return (
    <Pressable
      onPress={() => router.push(`/takim/${favorite.id}`)}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.head}>
        <TeamCrest name={favorite.name} logo={standing?.logo} size={34} />
        <View style={styles.headText}>
          <Text style={styles.kicker}>TAKIMIM</Text>
          <Text style={styles.name} numberOfLines={1}>
            {favorite.name.toLocaleUpperCase("tr-TR")}
          </Text>
        </View>
        <Pressable onPress={clearFavorite} hitSlop={10}>
          <Ionicons name="star" size={20} color={colors.yellow} />
        </Pressable>
      </View>

      <View style={styles.statsRow}>
        {position != null && standing ? (
          <>
            <Stat label="SIRA" value={`${position}.`} />
            <Stat label="PUAN" value={String(standing.display_points)} />
            <Stat label="O" value={String(standing.played)} />
            <Stat label="AV" value={String(standing.goal_diff)} />
            {standing.last5 ? <Form last5={standing.last5} /> : null}
          </>
        ) : (
          <Text style={styles.placeholder}>Bu sezonda sıralama verisi yok.</Text>
        )}
      </View>

      {next ? (
        <View style={styles.next}>
          <Ionicons name="calendar-outline" size={14} color={colors.turf} />
          <Text style={styles.nextText} numberOfLines={1}>
            Sıradaki:{" "}
            {Number(next.home_team_id) === favorite.id || next.first_team_name === favorite.name
              ? next.second_team_name
              : next.first_team_name}
            {" · "}
            {formatDateShort(next.date)} {formatTime(next.time)}
          </Text>
        </View>
      ) : null}
    </Pressable>
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

function Form({ last5 }: { last5: string }) {
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
              result === "W"
                ? styles.chipWin
                : result === "L"
                  ? styles.chipLoss
                  : styles.chipDraw,
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

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.turf,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  pressed: {
    opacity: 0.8,
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  headText: {
    flex: 1,
  },
  kicker: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1,
    color: colors.turf,
  },
  name: {
    ...type.subtitle,
    color: colors.line,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginTop: spacing.sm + 2,
  },
  stat: {
    alignItems: "center",
  },
  statValue: {
    ...type.body,
    color: colors.line,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  statLabel: {
    fontSize: 8,
    fontWeight: "700",
    color: colors.muted,
    letterSpacing: 0.5,
  },
  form: {
    flexDirection: "row",
    gap: 3,
    marginLeft: "auto",
  },
  chip: {
    width: 14,
    height: 14,
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
  placeholder: {
    ...type.small,
    color: colors.muted,
  },
  next: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.faint,
  },
  nextText: {
    ...type.small,
    color: colors.line,
    fontWeight: "600",
    flex: 1,
  },
});
