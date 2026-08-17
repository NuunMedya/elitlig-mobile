import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { DetailHeader } from "@/components/ScreenHeader";
import { EmptyState, ErrorState, Loading } from "@/components/States";
import { PlayerAvatar } from "@/components/TeamCrest";
import { colors, radius, spacing, type } from "@/constants/theme";
import { getPlayerRankings } from "@/lib/api/players";
import { queryKeys } from "@/lib/queryKeys";
import type { PlayerRankRow, PlayerSort } from "@/lib/types";

/**
 * Türkiye Sıralaması — tüm şehirlerin birleşik istatistik liderleri.
 *
 * Sıralama ucu kapsam parametresi verilmeyince ülke genelini döndürür; bu
 * ekran o davranışı kullanır. Altı kategori sekmesi vardır; her kategoride
 * ilk 3 podyumda, kalanlar listede gösterilir. Sistem oyuncuları (HÜKMEN,
 * antpl vb.) sıralamadan ayıklanır. Satıra dokunmak oyuncu profilini açar.
 */

const CATEGORIES: { sort: PlayerSort; label: string; unit: string; value: (p: PlayerRankRow) => string }[] = [
  { sort: "mostValuable", label: "En Değerli", unit: "PUAN", value: (p) => String(Number(p.points) || 0) },
  { sort: "topScorers", label: "Gol Kralı", unit: "GOL", value: (p) => String(Number(p.goals) || 0) },
  { sort: "goalsPerMatch", label: "Gol / Maç", unit: "ORT", value: (p) => Number(p.goalsPerMatch ?? 0).toFixed(2) },
  { sort: "mostMatches", label: "En Çok Maç", unit: "MAÇ", value: (p) => String(Number(p.matches) || 0) },
  { sort: "pointsPerMatch", label: "Puan / Maç", unit: "ORT", value: (p) => Number(p.pointsPerMatch ?? 0).toFixed(2) },
  { sort: "mostCards", label: "En Çok Kart", unit: "KART", value: (p) => String(Number(p.cards) || 0) },
];

const JUNK = /hükmen|hukmen|antpl/i;

export default function TurkeyRankingsScreen() {
  const router = useRouter();
  const [category, setCategory] = useState(CATEGORIES[0]);

  const query = useQuery({
    // Kapsamsız anahtar: ülke geneli (şehir/lig/sezon = null)
    queryKey: queryKeys.playerRankings({}, category.sort),
    queryFn: () => getPlayerRankings({}, category.sort),
    staleTime: 10 * 60_000,
  });

  const players = useMemo(
    () => (query.data?.players ?? []).filter((p) => p.name && !JUNK.test(p.name)).slice(0, 50),
    [query.data]
  );
  const podium = players.slice(0, 3);
  const rest = players.slice(3);

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <DetailHeader title="Türkiye Sıralaması" subtitle="Tüm şehirler · tüm zamanlar" />

      {/* Kategori sekmeleri */}
      <View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabs}
        >
          {CATEGORIES.map((item) => {
            const active = item.sort === category.sort;
            return (
              <Pressable
                key={item.sort}
                onPress={() => setCategory(item)}
                style={({ pressed }) => [
                  styles.tab,
                  active && styles.tabActive,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.tabText, active && styles.tabTextActive]}>{item.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {query.isLoading ? (
        <Loading />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={query.refetch} />
      ) : players.length === 0 ? (
        <EmptyState icon="trophy-outline" title="Veri yok" body="Sıralama şu an boş görünüyor." />
      ) : (
        <FlatList
          data={rest}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <View style={styles.podium}>
              {[podium[1], podium[0], podium[2]].filter(Boolean).map((p) => {
                const rank = podium.indexOf(p) + 1;
                const first = rank === 1;
                return (
                  <Pressable
                    key={p.id}
                    onPress={() => router.push(`/oyuncu/${p.id}`)}
                    style={({ pressed }) => [
                      styles.podiumCard,
                      first && styles.podiumFirst,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={styles.podiumRank}>{rank === 1 ? "🥇" : rank === 2 ? "🥈" : "🥉"}</Text>
                    <PlayerAvatar name={p.name} image={p.image} size={first ? 56 : 44} />
                    <Text style={styles.podiumName} numberOfLines={1}>
                      {p.name.toLocaleUpperCase("tr-TR")}
                    </Text>
                    <Text style={styles.podiumTeam} numberOfLines={1}>
                      {p.teamName ?? ""}
                    </Text>
                    <Text style={[styles.podiumValue, first && styles.podiumValueFirst]}>
                      {category.value(p)}
                    </Text>
                    <Text style={styles.podiumUnit}>{category.unit}</Text>
                  </Pressable>
                );
              })}
            </View>
          }
          renderItem={({ item, index }) => (
            <Pressable
              onPress={() => router.push(`/oyuncu/${item.id}`)}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            >
              <Text style={styles.rowRank}>{index + 4}</Text>
              <PlayerAvatar name={item.name} image={item.image} size={34} />
              <View style={styles.rowBody}>
                <Text style={styles.rowName} numberOfLines={1}>
                  {item.name.toLocaleUpperCase("tr-TR")}
                </Text>
                <Text style={styles.rowTeam} numberOfLines={1}>
                  {item.teamName ?? ""}
                </Text>
              </View>
              <View style={styles.rowValueBox}>
                <Text style={styles.rowValue}>{category.value(item)}</Text>
                <Text style={styles.rowUnit}>{category.unit}</Text>
              </View>
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.pitch,
  },
  tabs: {
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
    paddingBottom: spacing.sm,
  },
  tab: {
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.faint,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
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
  list: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
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
    gap: 3,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.faint,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: 6,
  },
  podiumFirst: {
    borderColor: colors.yellow,
    backgroundColor: colors.goldDim + "44",
    paddingVertical: spacing.lg,
  },
  podiumRank: {
    fontSize: 18,
  },
  podiumName: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.line,
    textAlign: "center",
  },
  podiumTeam: {
    fontSize: 8,
    fontWeight: "600",
    color: colors.muted,
    textAlign: "center",
  },
  podiumValue: {
    ...type.subtitle,
    color: colors.turf,
    fontVariant: ["tabular-nums"],
    marginTop: 2,
  },
  podiumValueFirst: {
    fontSize: 20,
  },
  podiumUnit: {
    fontSize: 7,
    fontWeight: "800",
    letterSpacing: 0.5,
    color: colors.muted,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.faint,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
  },
  rowRank: {
    ...type.small,
    color: colors.muted,
    width: 24,
    textAlign: "center",
    fontVariant: ["tabular-nums"],
  },
  rowBody: {
    flex: 1,
  },
  rowName: {
    ...type.small,
    fontWeight: "700",
    color: colors.line,
  },
  rowTeam: {
    ...type.caption,
    color: colors.muted,
    letterSpacing: 0,
    marginTop: 1,
  },
  rowValueBox: {
    alignItems: "center",
    minWidth: 48,
  },
  rowValue: {
    ...type.body,
    fontWeight: "800",
    color: colors.turf,
    fontVariant: ["tabular-nums"],
  },
  rowUnit: {
    fontSize: 7,
    fontWeight: "800",
    letterSpacing: 0.5,
    color: colors.muted,
  },
  pressed: {
    opacity: 0.7,
  },
});
