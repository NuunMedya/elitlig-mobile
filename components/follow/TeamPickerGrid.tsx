/**
 * TeamPickerGrid — bir ligin takımlarından takip seçme ızgarası.
 *
 * NE: verilen (ya da seçili) kapsamın puan tablosundaki takımları üç sütunlu
 * karolar olarak dizer: puan sırası, amblem + ad ve durum hapı; seçiliyse mor
 * zemin, parıltı ve "Takipte" hapı.
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
import { EmptyState, ErrorState, RankBadge, Reveal, Skeleton, TeamLogo, Touchable } from "@/components/ui";
import { getStandings } from "@/lib/api/standings";
import { queryKeys } from "@/lib/queryKeys";
import type { StandingRow } from "@/lib/types";
import type { FavoriteTeam } from "@/providers/FavoriteProvider";
import { useScope } from "@/providers/ScopeProvider";
import { colors, elevate, fonts, glowStyle, hairline, layout, radius, space, textScale, type } from "@/theme";

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
      ? teams.map((team, index) => (
          <Reveal key={team.id} index={index} limit={9} distance={8} scaleFrom={0.95}>
            <PickerTile
              team={team}
              rank={index + 1}
              width={tileWidth}
              selected={isSelected(team.id)}
              onPress={onPress}
            />
          </Reveal>
        ))
      : null;
  }

  return (
    <View style={styles.grid} onLayout={onLayout} testID={testID}>
      {body}
    </View>
  );
});

/**
 * Takım karosu — puan sırası (ilk üç madalya), amblem, ad ve altta durum hapı
 * ("+ Takip et" / "✓ Takipte"). Seçili karo mor zemin + parıltı taşır.
 */
const PickerTile = React.memo(function PickerTile({
  team,
  rank,
  width,
  selected,
  onPress,
}: {
  team: FavoriteTeam;
  rank: number;
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
      <View style={styles.rank}>
        <RankBadge rank={rank} size={18} />
      </View>
      <TeamLogo name={team.name} logo={team.logo ?? null} size={layout.crestXl - 10} />
      <Text style={styles.name} numberOfLines={2} {...textScale.dense}>
        {team.name}
      </Text>
      <View style={[styles.pill, selected ? styles.pillOn : null]}>
        <Ionicons name={selected ? "checkmark" : "add"} size={11} color={selected ? colors.textOnBrand : colors.brandAccent} />
        <Text style={[styles.pillText, selected ? styles.pillTextOn : null]} {...textScale.badge}>
          {selected ? "Takipte" : "Takip et"}
        </Text>
      </View>
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
    ...glowStyle(colors.glow, 1),
  },
  name: {
    ...type.caption,
    fontFamily: fonts.semibold,
    color: colors.textPrimary,
    textAlign: "center",
    minHeight: 30,
  },
  rank: {
    position: "absolute",
    top: space.s,
    left: space.s,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.brandDim,
    borderWidth: hairline,
    borderColor: colors.brandBorder,
  },
  pillOn: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  pillText: { ...type.micro, color: colors.brandAccent },
  pillTextOn: { color: colors.textOnBrand },
});
