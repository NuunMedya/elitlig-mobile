/**
 * TeamPickerGrid — bir ligin takımlarından takip seçme ızgarası.
 *
 * NE: verilen (ya da seçili) kapsamın puan tablosundaki takımları üç sütunlu
 * karolar olarak dizer: amblem + ad, seçiliyse menekşe çerçeve ve onay pulu.
 * Dokunuş `onPress(team)` çağırır; ne olacağına ekran karar verir:
 *   · Takip sekmesi (boş durum)  → `useFollowFlow().follow` (takip + bildirim türleri)
 *   · İlk açılış takım adımı     → yerel çoklu seçim, sonda `useFavorite().follow`
 *
 * NEDEN PUAN TABLOSU: `/api/standings` takım id'si, adı ve logosunu birlikte
 * döndüren, kapsam (il · lig · sezon) bazlı tek uçtur; aynı sorgu anahtarı Lig
 * sekmesinin puan tablosuyla paylaşıldığı için önbellekten gelir. Liste puan
 * sırasındadır — üst sıradaki takımlar kullanıcının en çok aradıklarıdır.
 *
 * DURUMLAR: iskelet karolar · hata (ErrorState) · boş (bu sezonda takım yok).
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import React, { useCallback, useMemo, useState } from "react";
import { StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import { EmptyState, ErrorState, Skeleton, TeamLogo, Touchable } from "@/components/ui";
import { getStandings } from "@/lib/api/standings";
import { queryKeys } from "@/lib/queryKeys";
import type { StandingRow } from "@/lib/types";
import type { FavoriteTeam } from "@/providers/FavoriteProvider";
import { useScope } from "@/providers/ScopeProvider";
import { colors, elevate, hairline, layout, radius, space, textScale, type } from "@/theme";

const GAP = space.sm;
const DEFAULT_COLUMNS = 3;

export interface TeamPickerGridProps {
  /** Seçili (takip edilen) görünen takımlar. */
  isSelected: (teamId: number) => boolean;
  onPress: (team: FavoriteTeam) => void;
  /** Sütun sayısı (varsayılan 3). */
  columns?: number;
  /** En fazla kaç takım (varsayılan hepsi). */
  limit?: number;
  testID?: string;
}

export const TeamPickerGrid = React.memo(function TeamPickerGrid({
  isSelected,
  onPress,
  columns = DEFAULT_COLUMNS,
  limit,
  testID,
}: TeamPickerGridProps) {
  const scope = useScope();
  const [width, setWidth] = useState(0);
  const scopeKey = { cityId: scope.cityId ?? undefined, leagueId: scope.leagueId ?? undefined, seasonId: scope.seasonId ?? undefined };
  const enabled = Boolean(scope.cityId && scope.leagueId && scope.seasonId);

  const query = useQuery({
    queryKey: queryKeys.standings(scopeKey),
    queryFn: () =>
      getStandings({
        cityId: scope.cityId as number,
        leagueId: scope.leagueId as number,
        seasonId: scope.seasonId as number,
      }),
    enabled,
    staleTime: 60_000,
  });

  const teams = useMemo<FavoriteTeam[]>(() => {
    const seen = new Set<number>();
    const rows: StandingRow[] = query.data ?? [];
    const list: FavoriteTeam[] = [];
    rows.forEach((row) => {
      const id = Number(row.team_id);
      if (!id || seen.has(id)) return;
      seen.add(id);
      list.push({ id, name: row.team_name, logo: row.logo || null });
    });
    return limit ? list.slice(0, limit) : list;
  }, [query.data, limit]);

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    setWidth(Math.floor(event.nativeEvent.layout.width));
  }, []);

  const tileWidth = width > 0 ? Math.floor((width - GAP * (columns - 1)) / columns) : 0;

  const busy = !enabled || scope.loading || query.isLoading;

  let body: React.ReactNode;
  if (busy && !teams.length) {
    body = tileWidth
      ? Array.from({ length: columns * 2 }, (_, index) => (
          <View key={index} style={[styles.tile, styles.skeletonTile, { width: tileWidth }]}>
            <Skeleton width={layout.crestXl - 8} height={layout.crestXl - 8} radius="pill" />
            <Skeleton width="70%" height={10} />
          </View>
        ))
      : null;
  } else if (query.isError) {
    body = (
      <ErrorState error={query.error} variant="banner" onRetry={() => void query.refetch()} style={styles.full} />
    );
  } else if (!teams.length) {
    body = (
      <EmptyState
        icon="shield-outline"
        title="Bu sezonda takım yok"
        body="Başka bir lig seç; takımlar puan tablosundan gelir."
        variant="inline"
        compact
        style={styles.full}
      />
    );
  } else {
    body = tileWidth
      ? teams.map((team) => (
          <PickerTile
            key={team.id}
            team={team}
            width={tileWidth}
            selected={isSelected(team.id)}
            onPress={onPress}
          />
        ))
      : null;
  }

  return (
    <View style={styles.grid} onLayout={onLayout} testID={testID}>
      {body}
    </View>
  );
});

const PickerTile = React.memo(function PickerTile({
  team,
  width,
  selected,
  onPress,
}: {
  team: FavoriteTeam;
  width: number;
  selected: boolean;
  onPress: (team: FavoriteTeam) => void;
}) {
  const handle = useCallback(() => onPress(team), [onPress, team]);
  return (
    <Touchable
      feedback="card"
      haptic={selected ? "light" : "success"}
      onPress={handle}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={selected ? `${team.name}, seçili` : `${team.name} seç`}
      testID={`team-pick-${team.id}`}
      style={[styles.tile, { width }, selected ? styles.tileSelected : null]}
    >
      <TeamLogo name={team.name} logo={team.logo ?? null} size={layout.crestXl - 8} />
      <Text style={styles.name} numberOfLines={2} {...textScale.dense}>
        {team.name}
      </Text>
      {selected ? (
        <View style={styles.check}>
          <Ionicons name="checkmark" size={12} color={colors.textOnBrand} />
        </View>
      ) : null}
    </Touchable>
  );
});

const styles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: GAP,
  },
  full: {
    width: "100%",
  },
  tile: {
    alignItems: "center",
    gap: space.s,
    paddingTop: space.md,
    paddingBottom: space.m,
    paddingHorizontal: space.s,
    borderRadius: radius.lg,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
    ...elevate(1),
  },
  skeletonTile: {
    minHeight: 104,
  },
  tileSelected: {
    backgroundColor: colors.brandDim,
    borderColor: colors.brand,
    borderWidth: 1.5,
  },
  name: {
    ...type.caption,
    color: colors.textPrimary,
    textAlign: "center",
    minHeight: 30,
  },
  check: {
    position: "absolute",
    top: space.s,
    right: space.s,
    width: 18,
    height: 18,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brand,
  },
});
