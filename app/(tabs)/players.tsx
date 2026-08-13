import { useQuery } from "@tanstack/react-query";
import { Link } from "expo-router";
import { useState } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
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
 * Oyuncu sıralamaları — routes/OyuncuListesi.js
 *
 * Sıralamayı sunucu SQL ile hesaplar (yalnızca yayınlanmış maçlar sayılır),
 * istemci yeniden sıralamaz. Seçilen ölçüt hem sıralamayı hem de satırda
 * öne çıkan sayıyı belirler.
 */

/**
 * Uç, toplama sonuçlarını dize olarak döndürüyor; gösterim öncesi sayıya
 * çevrilir. "En Değerli" sıralaması listeye alınmadı: sunucu o sıralamada
 * `players.value` alanına göre sıralasa da değeri yanıtta döndürmüyor, yani
 * sıralamanın gerekçesi ekranda görünmeyecekti.
 */
const num = (value: number | string | null | undefined) => Number(value ?? 0) || 0;

const SORTS: { key: PlayerSort; label: string; metric: (row: PlayerRankRow) => string; unit: string }[] = [
  { key: "topScorers", label: "Gol Krallığı", metric: (row) => String(num(row.goals)), unit: "gol" },
  { key: "mostMatches", label: "En Çok Maç", metric: (row) => String(num(row.matches)), unit: "maç" },
  {
    key: "pointsPerMatch",
    label: "Maç Başı Puan",
    metric: (row) => num(row.pointsPerMatch).toFixed(2),
    unit: "puan",
  },
  {
    key: "goalsPerMatch",
    label: "Maç Başı Gol",
    metric: (row) => num(row.goalsPerMatch).toFixed(2),
    unit: "gol",
  },
  { key: "mostCards", label: "En Çok Kart", metric: (row) => String(num(row.cards)), unit: "kart" },
];

export default function PlayersScreen() {
  const scope = useScope();
  const [sort, setSort] = useState<PlayerSort>("topScorers");
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

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader title="Oyuncular" />
      <ScopeBar />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.sorts}
      >
        {SORTS.map((item) => {
          const selected = item.key === sort;
          return (
            <Pressable
              key={item.key}
              onPress={() => setSort(item.key)}
              style={({ pressed }) => [
                styles.sortChip,
                selected && styles.sortChipActive,
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.sortText, selected && styles.sortTextActive]}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

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
          data={players}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item, index }) => (
            <Row row={item} position={index + 1} metric={active.metric(item)} unit={active.unit} />
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
              icon="people-outline"
              title="Sıralama boş"
              body="Bu sezonda henüz yayınlanmış maç istatistiği yok."
            />
          }
        />
      )}
    </SafeAreaView>
  );
}

function Row({
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
  return (
    <Link href={`/oyuncu/${row.id}`} asChild>
      <Pressable style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
        <Text style={[styles.position, position <= 3 && styles.positionTop]}>{position}</Text>
        <PlayerAvatar name={row.name} image={row.image} size={38} />

        <View style={styles.playerText}>
          <Text style={styles.playerName} numberOfLines={1}>
            {row.name}
          </Text>
          <Text style={styles.teamName} numberOfLines={1}>
            {row.teamName || "Takımsız"} · {num(row.matches)} maç
          </Text>
        </View>

        <View style={styles.metricBox}>
          <Text style={styles.metric}>{metric}</Text>
          {unit ? <Text style={styles.metricUnit}>{unit}</Text> : null}
        </View>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.pitch,
  },
  sorts: {
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
  sortChip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    height: 34,
    justifyContent: "center",
  },
  sortChipActive: {
    backgroundColor: colors.turfDim,
  },
  pressed: {
    opacity: 0.8,
  },
  sortText: {
    ...type.caption,
    color: colors.muted,
  },
  sortTextActive: {
    color: colors.turf,
  },
  list: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
    flexGrow: 1,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.sm + 2,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    marginBottom: spacing.sm,
  },
  rowPressed: {
    backgroundColor: colors.surfaceRaised,
  },
  position: {
    ...type.small,
    color: colors.muted,
    width: 22,
    textAlign: "center",
  },
  positionTop: {
    color: colors.turf,
    fontWeight: "800",
  },
  playerText: {
    flex: 1,
    gap: 2,
  },
  playerName: {
    ...type.body,
    color: colors.line,
  },
  teamName: {
    ...type.caption,
    color: colors.muted,
    letterSpacing: 0,
  },
  metricBox: {
    alignItems: "flex-end",
    minWidth: 54,
  },
  metric: {
    ...type.subtitle,
    color: colors.turf,
  },
  metricUnit: {
    ...type.caption,
    color: colors.muted,
    letterSpacing: 0,
  },
});
