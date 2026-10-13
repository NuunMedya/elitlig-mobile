/**
 * TeamsPane — ligdeki takımların vitrin ızgarası (Lig merkezinin "Takımlar" sekmesi).
 *
 * PUAN SEKMESİNDEN FARKI: puan tablosu sıralamayı okutur (O·G·B·M·AV·P);
 * burası takımları TANITIR ve takip etmeyi kolaylaştırır. Her takım iki
 * sütunlu ızgarada bir karodur: büyük amblem, ad, sıra, puan, son beş maç ve
 * tek dokunuşla takip yıldızı. "Takip ettiklerim" süzgeci yalnız takip edilen
 * takımları bırakır.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import type { NativeScrollEvent, NativeSyntheticEvent } from "react-native";
import {
  Chip,
  EmptyState,
  ErrorState,
  FormChips,
  Input,
  SkeletonCard,
  TeamLogo,
  Touchable,
  refreshControlProps,
  useRefresh,
} from "@/components/ui";
import { haptics } from "@/lib/haptics";
import { getStandings } from "@/lib/api/standings";
import { queryKeys } from "@/lib/queryKeys";
import type { StandingRow } from "@/lib/types";
import { useFavorite } from "@/providers/FavoriteProvider";
import { useScope } from "@/providers/ScopeProvider";
import { colors, elevate, fonts, layout, radius, space, textScale, touchSlop, type } from "@/theme";

export interface TeamsPaneProps {
  scrollProps?: {
    onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
    scrollEventThrottle: number;
  };
}

type Filter = "tumu" | "takip";

const normalize = (value: string) => value.trim().toLocaleLowerCase("tr-TR");

interface Entry {
  row: StandingRow;
  rank: number;
}

export function TeamsPane({ scrollProps }: TeamsPaneProps) {
  const scope = useScope();
  const router = useRouter();
  const { isFavorite, toggleFavorite, favorites } = useFavorite();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("tumu");

  const query = useQuery({
    queryKey: queryKeys.standings({
      cityId: scope.cityId ?? undefined,
      leagueId: scope.leagueId ?? undefined,
      seasonId: scope.seasonId ?? undefined,
    }),
    queryFn: () =>
      getStandings({
        cityId: scope.cityId as number,
        leagueId: scope.leagueId as number,
        seasonId: scope.seasonId as number,
      }),
    enabled: scope.ready,
    staleTime: 60_000,
  });
  const refresh = useRefresh(query.refetch, { refreshing: query.isRefetching });

  const entries = useMemo<Entry[]>(
    () => (query.data ?? []).map((row, index) => ({ row, rank: index + 1 })),
    [query.data],
  );

  const followedHere = useMemo(
    () => entries.filter((entry) => isFavorite(entry.row.team_id)).length,
    [entries, isFavorite],
  );

  const visible = useMemo(() => {
    const term = normalize(search);
    return entries.filter((entry) => {
      if (filter === "takip" && !isFavorite(entry.row.team_id)) return false;
      return !term || normalize(entry.row.team_name).includes(term);
    });
  }, [entries, filter, isFavorite, search]);

  const openTeam = useCallback((teamId: number) => router.push(`/takim/${teamId}`), [router]);
  const follow = useCallback(
    (row: StandingRow) => {
      haptics.light();
      toggleFavorite({ id: row.team_id, name: row.team_name, logo: row.logo });
    },
    [toggleFavorite],
  );

  const renderItem = useCallback(
    ({ item }: { item: Entry }) => (
      <TeamTile
        entry={item}
        followed={isFavorite(item.row.team_id)}
        onOpen={openTeam}
        onFollow={follow}
      />
    ),
    [isFavorite, openTeam, follow],
  );

  if (!scope.ready && !scope.loading) {
    return (
      <EmptyState
        icon="options-outline"
        title="Lig seçilmedi"
        body="İl, lig ve sezon seçince takımlar listelenir."
        action={{ label: "Kapsam seç", onPress: () => scope.openScopeSheet("city") }}
      />
    );
  }

  if (query.isLoading || scope.loading) {
    return (
      <View style={styles.skeleton}>
        <SkeletonCard lines={3} />
        <SkeletonCard lines={3} />
      </View>
    );
  }

  if (query.isError && entries.length === 0) {
    return <ErrorState error={query.error} onRetry={query.refetch} />;
  }

  return (
    <FlatList
      {...scrollProps}
      data={visible}
      keyExtractor={(item) => String(item.row.team_id)}
      renderItem={renderItem}
      numColumns={2}
      columnWrapperStyle={styles.column}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl {...refreshControlProps(refresh.refreshing, refresh.onRefresh)} />}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={
        <View style={styles.header}>
          <Input
            value={search}
            onChangeText={setSearch}
            placeholder="Takım ara"
            leadingIcon="search-outline"
            variant="search"
            size="sm"
          />
          <View style={styles.filters}>
            <Chip label={`Tümü · ${entries.length}`} selected={filter === "tumu"} onPress={() => setFilter("tumu")} />
            <Chip
              label={`Takip ettiklerim · ${followedHere}`}
              icon="star"
              selected={filter === "takip"}
              onPress={() => setFilter("takip")}
            />
          </View>
          {favorites.length === 0 ? (
            <View style={styles.hint}>
              <Ionicons name="star-outline" size={14} color={colors.textTertiary} />
              <Text style={styles.hintText} {...textScale.dense}>
                Yıldıza dokunarak takımı takip et; maçları ve bildirimleri öne çıkar.
              </Text>
            </View>
          ) : null}
        </View>
      }
      ListEmptyComponent={
        filter === "takip" ? (
          <EmptyState
            icon="star-outline"
            title="Bu ligde takip ettiğin takım yok"
            body="Takımların yıldızına dokunarak takip edebilirsin."
            action={{ label: "Tüm takımlar", onPress: () => setFilter("tumu") }}
            variant="inline"
          />
        ) : (
          <EmptyState icon="shield-outline" title="Takım bulunamadı" body="Arama ya da kapsamı değiştir." variant="inline" />
        )
      }
    />
  );
}

const TeamTile = React.memo(function TeamTile({
  entry,
  followed,
  onOpen,
  onFollow,
}: {
  entry: Entry;
  followed: boolean;
  onOpen: (teamId: number) => void;
  onFollow: (row: StandingRow) => void;
}) {
  const { row, rank } = entry;
  return (
    <Touchable
      feedback="card"
      haptic="selection"
      onPress={() => onOpen(row.team_id)}
      accessibilityRole="button"
      accessibilityLabel={`${rank}. ${row.team_name}, ${row.display_points} puan`}
      style={[styles.tile, followed && styles.tileFollowed]}
    >
      <View style={styles.tileTop}>
        <View style={styles.rankPill}>
          <Text style={styles.rankText} {...textScale.badge}>
            {rank}.
          </Text>
        </View>
        <Pressable
          onPress={() => onFollow(row)}
          hitSlop={touchSlop(32)}
          accessibilityRole="button"
          accessibilityState={{ selected: followed }}
          accessibilityLabel={followed ? `${row.team_name} takibini bırak` : `${row.team_name} takımını takip et`}
        >
          <Ionicons name={followed ? "star" : "star-outline"} size={18} color={followed ? colors.star : colors.starEmpty} />
        </Pressable>
      </View>

      <TeamLogo name={row.team_name} logo={row.logo} size={56} />

      <View style={styles.nameBox}>
        <Text style={styles.name} numberOfLines={2} {...textScale.badge}>
          {row.team_name}
        </Text>
      </View>

      <View style={styles.stats}>
        <Text style={styles.points} {...textScale.badge}>
          {row.display_points}
          <Text style={styles.pointsUnit}> P</Text>
        </Text>
        <Text style={styles.played} {...textScale.badge}>
          {row.played} maç · {Number(row.goal_diff) > 0 ? "+" : ""}
          {row.goal_diff}
        </Text>
      </View>

      {row.last5 ? <FormChips form={row.last5} size="xs" /> : <View style={styles.formSpacer} />}
    </Touchable>
  );
});

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: layout.screenPadding,
    paddingBottom: layout.tabBarHeight + space.xxl,
  },
  skeleton: {
    padding: layout.screenPadding,
    gap: space.md,
  },
  header: {
    gap: space.sm,
    paddingTop: space.md,
    paddingBottom: space.md,
  },
  filters: {
    flexDirection: "row",
    gap: space.s,
  },
  hint: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.s,
  },
  hintText: {
    ...type.bodySm,
    color: colors.textTertiary,
    flex: 1,
  },
  column: {
    gap: space.m,
    marginBottom: space.m,
  },
  tile: {
    ...elevate(1),
    flex: 1,
    alignItems: "center",
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  tileFollowed: {
    borderColor: colors.brandBorder,
    borderWidth: 1,
  },
  tileTop: {
    alignSelf: "stretch",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rankPill: {
    minWidth: 28,
    paddingHorizontal: space.s,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.surface3,
    alignItems: "center",
  },
  rankText: {
    ...type.tableNumStrong,
    color: colors.textSecondary,
  },
  nameBox: {
    height: type.label.lineHeight * 2,
    justifyContent: "center",
    alignSelf: "stretch",
  },
  name: {
    ...type.label,
    color: colors.textPrimary,
    textAlign: "center",
  },
  stats: {
    alignItems: "center",
  },
  points: {
    ...type.metricSm,
    color: colors.textPrimary,
  },
  pointsUnit: {
    ...type.caption,
    fontFamily: fonts.semibold,
    color: colors.textTertiary,
  },
  played: {
    ...type.caption,
    color: colors.textTertiary,
  },
  formSpacer: {
    height: 13,
  },
});
