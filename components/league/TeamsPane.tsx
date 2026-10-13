/**
 * TeamsPane — ligdeki takımların listesi (Lig merkezinin "Takımlar" bölmesi).
 *
 * PUAN BÖLMESİNDEN FARKI: puan tablosu sıralamayı KARŞILAŞTIRTIR (O·G·B·M·AV·P);
 * burası takımları TANITIR ve takip etmeyi kolaylaştırır.
 *
 * IZGARADAN LİSTEYE: eski bölme iki sütunlu büyük karolar çiziyordu. Ankara
 * serbest liginde 273 takım var — karolarla 137 ekran boyu kaydırma demekti
 * ve ekrana aynı anda dört takım sığıyordu. Takım kimliğinin tek anatomisi
 * `TeamRow` (list yoğunluğu) zaten var: sıra · arma · ad · son beş maç ·
 * puan. Bir ekrana dokuz takım sığar, arama ve takip süzgeci listenin
 * tepesinde durur. Takip yıldızı satırın en sağında ayrı bir dokunma
 * alanıdır; satıra basmak takım sayfasını açar.
 *
 * Takip edilen takımlar sönük zümrüt zeminle vurgulanır (puan tablosuyla
 * aynı dil).
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, View } from "react-native";
import {
  EmptyState,
  ErrorState,
  Input,
  SegmentedControl,
  SkeletonListRow,
  TeamRow,
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
import { colors, layout, space, touchSlop } from "@/theme";
import {
  GroupSeparator,
  ScopeMissing,
  groupRowStyle,
  paneStyles,
  useScopeKey,
  type ScrollChrome,
} from "./shared";

export interface TeamsPaneProps {
  scrollProps?: ScrollChrome;
}

type Filter = "tumu" | "takip";

const normalize = (value: string) => value.trim().toLocaleLowerCase("tr-TR");

interface Entry {
  row: StandingRow;
  rank: number;
}

/** Satırın sağındaki takip yıldızı — ayrı dokunma alanı. */
const FollowStar = React.memo(function FollowStar({
  row,
  followed,
  onFollow,
}: {
  row: StandingRow;
  followed: boolean;
  onFollow: (row: StandingRow) => void;
}) {
  const press = useCallback(() => onFollow(row), [onFollow, row]);
  return (
    <Touchable
      feedback="icon"
      onPress={press}
      hitSlop={touchSlop(24)}
      style={styles.star}
      accessibilityRole="button"
      accessibilityState={{ selected: followed }}
      accessibilityLabel={followed ? `${row.team_name} takibini bırak` : `${row.team_name} takımını takip et`}
    >
      <Ionicons
        name={followed ? "star" : "star-outline"}
        size={20}
        color={followed ? colors.star : colors.starEmpty}
      />
    </Touchable>
  );
});

export function TeamsPane({ scrollProps }: TeamsPaneProps) {
  const scope = useScope();
  const scopeKey = useScopeKey();
  const router = useRouter();
  const { isFavorite, toggleFavorite } = useFavorite();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("tumu");

  const query = useQuery({
    queryKey: queryKeys.standings(scopeKey),
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

  const filterItems = useMemo(
    () => [
      { key: "tumu" as const, label: `Tümü · ${entries.length}` },
      { key: "takip" as const, label: `Takip ettiklerim · ${followedHere}` },
    ],
    [entries.length, followedHere],
  );

  const openTeam = useCallback((teamId: number) => router.push(`/takim/${teamId}`), [router]);
  const follow = useCallback(
    (row: StandingRow) => {
      haptics.light();
      toggleFavorite({ id: row.team_id, name: row.team_name, logo: row.logo });
    },
    [toggleFavorite],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: Entry; index: number }) => {
      const followed = isFavorite(item.row.team_id);
      return (
        <TeamRow
          teamId={item.row.team_id}
          rank={item.rank}
          name={item.row.team_name}
          logo={item.row.logo}
          points={item.row.display_points}
          played={item.row.played}
          goalDiff={Number(item.row.goal_diff ?? 0)}
          form={item.row.last5}
          highlighted={followed}
          onPress={openTeam}
          trailing={<FollowStar row={item.row} followed={followed} onFollow={follow} />}
          style={groupRowStyle(index, visible.length, false)}
        />
      );
    },
    [isFavorite, openTeam, follow, visible.length],
  );

  if (!scope.ready && !scope.loading) {
    return <ScopeMissing body="İl, lig ve sezon seçince takımlar listelenir." />;
  }

  if (query.isLoading || scope.loading) {
    return (
      <View style={paneStyles.skeleton}>
        <SkeletonListRow count={8} />
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
      keyExtractor={teamKey}
      renderItem={renderItem}
      ItemSeparatorComponent={GroupSeparator}
      initialNumToRender={12}
      windowSize={9}
      contentContainerStyle={paneStyles.content}
      refreshControl={<RefreshControl {...refreshControlProps(refresh.refreshing, refresh.onRefresh)} />}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      ListHeaderComponent={
        <View style={styles.header}>
          <Input
            value={search}
            onChangeText={setSearch}
            placeholder={`${entries.length} takım içinde ara`}
            variant="search"
            size="sm"
            autoCorrect={false}
          />
          <SegmentedControl items={filterItems} value={filter} onChange={setFilter} size="sm" />
          {query.isError ? <ErrorState error={query.error} variant="banner" /> : null}
        </View>
      }
      ListEmptyComponent={
        filter === "takip" && !search.trim() ? (
          <EmptyState
            icon="star-outline"
            title="Bu ligde takip ettiğin takım yok"
            body="Satırdaki yıldıza dokunarak takımı takip et; maçları ve bildirimleri öne çıkar."
            action={{ label: "Tüm takımlar", onPress: () => setFilter("tumu") }}
            variant="inline"
          />
        ) : (
          <EmptyState
            icon="search-outline"
            title="Takım bulunamadı"
            body={search.trim() ? `"${search.trim()}" aramasına uyan takım yok.` : "Bu kapsamda takım bulunmuyor."}
            action={search.trim() ? { label: "Aramayı temizle", onPress: () => setSearch("") } : undefined}
            variant="inline"
          />
        )
      }
    />
  );
}

const teamKey = (item: Entry) => String(item.row.team_id);
/* getItemLayout BİLEREK YOK: liste başlığı (arama + süzgeç) değişken
   yükseklikte; başlığı saymayan ofsetler pencerelemeyi şaşırtıp boş satır
   bıraktırıyordu. */

const styles = StyleSheet.create({
  header: {
    gap: space.sm,
    paddingBottom: space.md,
  },
  star: {
    width: layout.minTouch - space.md,
    alignItems: "flex-end",
    justifyContent: "center",
  },
});
