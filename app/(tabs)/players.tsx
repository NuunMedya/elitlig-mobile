import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScopeBar } from "@/components/ScopeBar";
import { ScreenHeader } from "@/components/ScreenHeader";
import { EmptyState, ErrorState, Loading } from "@/components/States";
import { PlayerAvatar } from "@/components/TeamCrest";
import { colors, radius, spacing, type } from "@/constants/theme";
import { getPlayerRankings } from "@/lib/api/players";
import { queryKeys } from "@/lib/queryKeys";
import { useScope } from "@/providers/ScopeProvider";
import type { PlayerRankRow, PlayerSort } from "@/lib/types";

/**
 * Oyuncular — sitedeki "En Değerliler" sayfasının mobil karşılığı.
 *
 * Üstte sıralama sekmeleri ve arama; aramasızken ilk üç oyuncu podyumda
 * (1. ortada, altın halkalı), kalanlar listede. Sıralamayı sunucu hesaplar,
 * istemci yeniden sıralamaz. Sitedeki Piyasa Değeri / Asist / Kurtarışlar
 * sekmeleri sunucu desteklediğinde buraya eklenecek.
 */

const num = (value: number | string | null | undefined) => Number(value ?? 0) || 0;

const SORTS: {
  key: PlayerSort;
  label: string;
  metric: (row: PlayerRankRow) => string;
  unit: string;
}[] = [
  { key: "mostValuable", label: "En Değerliler", metric: (row) => String(num(row.points)), unit: "puan" },
  { key: "topScorers", label: "Gol Krallığı", metric: (row) => String(num(row.goals)), unit: "gol" },
  { key: "mostMatches", label: "En Çok Maç", metric: (row) => String(num(row.matches)), unit: "maç" },
  { key: "pointsPerMatch", label: "Puan / Maç", metric: (row) => num(row.pointsPerMatch).toFixed(2), unit: "puan" },
  { key: "goalsPerMatch", label: "Gol / Maç", metric: (row) => num(row.goalsPerMatch).toFixed(2), unit: "gol" },
  { key: "mostCards", label: "Kartlar", metric: (row) => String(num(row.cards)), unit: "kart" },
];

export default function PlayersScreen() {
  const scope = useScope();
  const [sort, setSort] = useState<PlayerSort>("mostValuable");
  const [search, setSearch] = useState("");
  const active = SORTS.find((item) => item.key === sort)!;

  const scopeKey = {
    cityId: scope.cityId ?? undefined,
    leagueId: scope.leagueId ?? undefined,
    seasonId: scope.seasonId ?? undefined,
  };

  const query = useQuery({
    queryKey: queryKeys.playerRankings(scopeKey, sort),
    queryFn: () => getPlayerRankings(scopeKey, sort),
    enabled: scope.ready,
    staleTime: 60_000,
  });

  const players = query.data?.players ?? [];

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("tr-TR");
    if (!q) return players;
    return players.filter(
      (p) =>
        p.name.toLocaleLowerCase("tr-TR").includes(q) ||
        (p.teamName ?? "").toLocaleLowerCase("tr-TR").includes(q)
    );
  }, [players, search]);

  // "En Değerliler"de sunucu piyasa değerine göre sıralar ama yanıt bu değeri
  // içermez; ekranda puan gösterdiğimiz için liste puana göre yeniden dizilir.
  const ordered = useMemo(() => {
    if (sort !== "mostValuable") return filtered;
    return [...filtered].sort((a, b) => num(b.points) - num(a.points));
  }, [filtered, sort]);

  // Podyum yalnızca aramasız tam listede gösterilir; listede kalanlar 4'ten başlar.
  const showPodium = !search.trim() && ordered.length >= 3;
  const podium = showPodium ? ordered.slice(0, 3) : [];
  const listData = showPodium ? ordered.slice(3) : ordered;
  const listOffset = showPodium ? 3 : 0;

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader title="Oyuncular" />
      <ScopeBar />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabs}
        style={styles.tabsWrap}
      >
        {SORTS.map((item) => {
          const isActive = item.key === sort;
          return (
            <Pressable
              key={item.key}
              onPress={() => setSort(item.key)}
              style={({ pressed }) => [
                styles.tab,
                isActive && styles.tabActive,
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.searchBox}>
        <Ionicons name="search" size={16} color={colors.muted} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Oyuncu veya takım ara..."
          placeholderTextColor={colors.muted}
          style={styles.searchInput}
          autoCorrect={false}
        />
        {search.length > 0 && (
          <Pressable onPress={() => setSearch("")} hitSlop={8}>
            <Ionicons name="close-circle" size={16} color={colors.muted} />
          </Pressable>
        )}
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
        <FlatList
          data={listData}
          keyExtractor={(item) => String(item.id)}
          ListHeaderComponent={
            showPodium ? (
              <View style={styles.podium}>
                <PodiumCard row={podium[1]} place={2} metric={active.metric} unit={active.unit} />
                <PodiumCard row={podium[0]} place={1} metric={active.metric} unit={active.unit} />
                <PodiumCard row={podium[2]} place={3} metric={active.metric} unit={active.unit} />
              </View>
            ) : null
          }
          renderItem={({ item, index }) => (
            <PlayerRow
              row={item}
              position={listOffset + index + 1}
              metric={active.metric(item)}
              unit={active.unit}
            />
          )}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={query.isRefetching}
              onRefresh={query.refetch}
              tintColor={colors.turf}
            />
          }
          ListEmptyComponent={
            <EmptyState
              icon="shirt-outline"
              title={search ? "Eşleşen oyuncu yok" : "Sıralama boş"}
              body={
                search
                  ? "Farklı bir isim ya da takım deneyin."
                  : "Maçlar oynandıkça sıralama burada oluşur."
              }
            />
          }
        />
      )}
    </SafeAreaView>
  );
}

/** Podyum kartı — 1. sıra ortada, daha büyük ve altın halkalı. */
function PodiumCard({
  row,
  place,
  metric,
  unit,
}: {
  row: PlayerRankRow;
  place: 1 | 2 | 3;
  metric: (row: PlayerRankRow) => string;
  unit: string;
}) {
  const router = useRouter();
  const first = place === 1;

  return (
    <Pressable
      onPress={() => router.push(`/oyuncu/${row.id}`)}
      style={({ pressed }) => [
        styles.podiumCard,
        first && styles.podiumCardFirst,
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.placeBadge, first && styles.placeBadgeFirst]}>
        <Text style={styles.placeText}>{place}</Text>
      </View>
      <View style={[first && styles.avatarRing]}>
        <PlayerAvatar name={row.name} image={row.image} size={first ? 64 : 48} />
      </View>
      <Text style={styles.podiumName} numberOfLines={1}>
        {row.name.toLocaleUpperCase("tr-TR")}
      </Text>
      <Text style={styles.podiumTeam} numberOfLines={1}>
        {row.teamName ?? ""}
      </Text>
      <View style={styles.podiumPoints}>
        <Text style={styles.podiumPointsValue}>{metric(row)}</Text>
        <Text style={styles.podiumPointsUnit}>{unit.toLocaleUpperCase("tr-TR")}</Text>
      </View>
    </Pressable>
  );
}

function PlayerRow({
  row,
  position,
  metric,
  unit,
}: {
  row: PlayerRankRow;
  position: number;
  metric: string;
  unit: string;
}) {
  const router = useRouter();

  return (
    <Pressable
      onPress={() => router.push(`/oyuncu/${row.id}`)}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <Text style={styles.rowPos}>{position}</Text>
      <PlayerAvatar name={row.name} image={row.image} size={36} />
      <View style={styles.rowBody}>
        <Text style={styles.rowName} numberOfLines={1}>
          {row.name.toLocaleUpperCase("tr-TR")}
        </Text>
        {row.teamName ? (
          <Text style={styles.rowTeam} numberOfLines={1}>
            {row.teamName}
          </Text>
        ) : null}
      </View>
      <View style={styles.rowMatches}>
        <Text style={styles.rowMatchesLabel}>MAÇ</Text>
        <Text style={styles.rowMatchesValue}>{num(row.matches)}</Text>
      </View>
      <View style={styles.metricBadge}>
        <Text style={styles.metricValue}>{metric}</Text>
        <Text style={styles.metricUnit}>{unit.toLocaleUpperCase("tr-TR")}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.pitch,
  },
  tabsWrap: {
    flexGrow: 0,
    flexShrink: 0,
  },
  tabs: {
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  tab: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
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
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.faint,
    borderRadius: radius.pill,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  searchInput: {
    ...type.small,
    color: colors.line,
    flex: 1,
    padding: 0,
  },
  list: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
    flexGrow: 1,
  },
  podium: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  podiumCard: {
    flex: 1,
    alignItems: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.faint,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
    gap: 4,
  },
  podiumCardFirst: {
    paddingVertical: spacing.lg,
    borderColor: colors.yellow,
    backgroundColor: colors.goldDim + "55",
  },
  placeBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.turfDim,
    alignItems: "center",
    justifyContent: "center",
  },
  placeBadgeFirst: {
    backgroundColor: colors.yellow,
  },
  placeText: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.line,
  },
  avatarRing: {
    borderWidth: 3,
    borderColor: colors.yellow,
    borderRadius: 999,
    padding: 2,
  },
  podiumName: {
    ...type.caption,
    color: colors.line,
    letterSpacing: 0,
    textAlign: "center",
  },
  podiumTeam: {
    fontSize: 10,
    fontWeight: "600",
    color: colors.muted,
    textAlign: "center",
  },
  podiumPoints: {
    alignItems: "center",
    backgroundColor: colors.turfDim,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    marginTop: 2,
  },
  podiumPointsValue: {
    ...type.subtitle,
    color: colors.turf,
    fontVariant: ["tabular-nums"],
  },
  podiumPointsUnit: {
    fontSize: 8,
    fontWeight: "800",
    color: colors.turf,
    letterSpacing: 0.5,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    marginBottom: 2,
  },
  rowPos: {
    ...type.small,
    color: colors.muted,
    width: 26,
    textAlign: "center",
    fontVariant: ["tabular-nums"],
  },
  rowBody: {
    flex: 1,
  },
  rowName: {
    ...type.small,
    color: colors.line,
    fontWeight: "700",
  },
  rowTeam: {
    ...type.caption,
    color: colors.muted,
    letterSpacing: 0,
    marginTop: 1,
  },
  rowMatches: {
    alignItems: "center",
    marginRight: spacing.xs,
  },
  rowMatchesLabel: {
    fontSize: 8,
    fontWeight: "700",
    color: colors.muted,
    letterSpacing: 0.5,
  },
  rowMatchesValue: {
    ...type.small,
    color: colors.line,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  metricBadge: {
    alignItems: "center",
    backgroundColor: colors.turfDim,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    minWidth: 52,
  },
  metricValue: {
    ...type.body,
    color: colors.turf,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  metricUnit: {
    fontSize: 8,
    fontWeight: "800",
    color: colors.turf,
    letterSpacing: 0.5,
  },
  pressed: {
    opacity: 0.7,
  },
});
