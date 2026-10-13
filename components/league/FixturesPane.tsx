/**
 * FixturesPane — güne göre öbeklenmiş maç listesi (Lig merkezinin "Fikstür" bölmesi).
 *
 * İKİ PENCERE: YAKLAŞAN (bugünden ileri, eskiden yeniye) ve SONUÇLAR
 * (bugünden geri, yeniden eskiye). Tek uzun liste sezonun ilk gününden
 * açılıyordu ve kullanıcı bugüne ulaşmak için aylarca kaydırmak zorundaydı.
 * Yaklaşan maç yoksa bölme kendiliğinden Sonuçlar'la açılır.
 *
 * İki pencerenin de sayısı segmentte yazılır: kullanıcı dokunmadan önce
 * diğer tarafta ne kadar maç olduğunu bilir.
 *
 * Gün başlıkları yapışkandır; "Bugün" ve "Yarın" gibi göreli adlar
 * `formatDayHeading` ile gelir.
 */

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { RefreshControl, SectionList, StyleSheet, View } from "react-native";
import {
  EmptyState,
  ErrorState,
  MatchCard,
  SectionHeader,
  SegmentedControl,
  SkeletonMatchRow,
  refreshControlProps,
  useRefresh,
} from "@/components/ui";
import { useTeamLogos } from "@/hooks/useTeamLogos";
import { getMatches } from "@/lib/api/matches";
import { formatDayHeading } from "@/lib/format";
import { queryKeys } from "@/lib/queryKeys";
import type { ApiMatch } from "@/lib/types";
import { useFavorite } from "@/providers/FavoriteProvider";
import { useScope } from "@/providers/ScopeProvider";
import { space } from "@/theme";
import { ScopeMissing, paneStyles, useScopeKey, type PaneProps } from "./shared";

type FixtureWindow = "yaklasan" | "sonuclar";

interface DaySection {
  title: string;
  data: ApiMatch[];
}

/** Maç tarihi hem "2026-08-19" hem tam ISO gelebiliyor; gün anahtarı ilk 10 karakterdir. */
const dayKeyOf = (match: ApiMatch) => String(match.date ?? "").slice(0, 10);

const MatchItem = React.memo(function MatchItem({
  match,
  homeLogo,
  awayLogo,
  favorite,
  onOpen,
  onToggleFavorite,
}: {
  match: ApiMatch;
  homeLogo: string | null;
  awayLogo: string | null;
  favorite: boolean;
  onOpen: (id: number) => void;
  onToggleFavorite: (id: number) => void;
}) {
  const open = useCallback(() => onOpen(match.id), [match.id, onOpen]);
  const star = useCallback(() => onToggleFavorite(match.id), [match.id, onToggleFavorite]);
  return (
    <MatchCard
      match={match}
      homeLogo={homeLogo}
      awayLogo={awayLogo}
      meta="field"
      isFavorite={favorite}
      onToggleFavorite={star}
      onPress={open}
      style={styles.card}
    />
  );
});

export function FixturesPane({ scrollProps }: PaneProps) {
  const scope = useScope();
  const scopeKey = useScopeKey();
  const router = useRouter();
  const { isFavoriteMatch, toggleFavoriteMatch } = useFavorite();
  const teams = useTeamLogos();

  const query = useQuery({
    queryKey: queryKeys.matches(scopeKey),
    queryFn: () =>
      getMatches({
        leagueId: scope.leagueId ?? undefined,
        seasonId: scope.seasonId ?? undefined,
        limit: 1000,
      }),
    enabled: scope.ready,
    staleTime: 60_000,
  });

  const refresh = useRefresh(query.refetch, { refreshing: query.isRefetching });

  const [fixtureWindow, setFixtureWindow] = useState<FixtureWindow | null>(null);
  const todayKey = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }, []);

  const buckets = useMemo(() => {
    const list = query.data ?? [];
    const map = new Map<string, ApiMatch[]>();
    for (const match of list) {
      const key = dayKeyOf(match);
      if (!key) continue;
      const bucket = map.get(key);
      if (bucket) bucket.push(match);
      else map.set(key, [match]);
    }
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  }, [query.data]);

  const counts = useMemo(() => {
    let upcoming = 0;
    let past = 0;
    for (const [key, data] of buckets) {
      if (key >= todayKey) upcoming += data.length;
      else past += data.length;
    }
    return { upcoming, past };
  }, [buckets, todayKey]);

  const activeWindow: FixtureWindow =
    fixtureWindow ?? (counts.upcoming > 0 ? "yaklasan" : "sonuclar");

  const sections = useMemo<DaySection[]>(() => {
    const picked =
      activeWindow === "yaklasan"
        ? buckets.filter(([key]) => key >= todayKey)
        : buckets.filter(([key]) => key < todayKey).reverse();
    return picked.map(([key, data]) => ({
      title: formatDayHeading(key),
      data: [...data].sort((a, b) => String(a.time).localeCompare(String(b.time))),
    }));
  }, [buckets, activeWindow, todayKey]);

  const windowItems = useMemo(
    () => [
      { key: "yaklasan" as const, label: counts.upcoming ? `Yaklaşan · ${counts.upcoming}` : "Yaklaşan" },
      { key: "sonuclar" as const, label: counts.past ? `Sonuçlar · ${counts.past}` : "Sonuçlar" },
    ],
    [counts],
  );

  const openMatch = useCallback((id: number) => router.push(`/mac/${id}`), [router]);

  const renderItem = useCallback(
    ({ item }: { item: ApiMatch }) => (
      <MatchItem
        match={item}
        homeLogo={teams.logoFor(item.home_team_id, item.first_team_name)}
        awayLogo={teams.logoFor(item.away_team_id, item.second_team_name)}
        favorite={isFavoriteMatch(item.id)}
        onOpen={openMatch}
        onToggleFavorite={toggleFavoriteMatch}
      />
    ),
    [isFavoriteMatch, openMatch, toggleFavoriteMatch, teams],
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: DaySection }) => (
      <SectionHeader
        title={section.title}
        meta={`${section.data.length} maç`}
        size="group"
        sticky
      />
    ),
    [],
  );

  if (!scope.ready && !scope.loading) return <ScopeMissing />;
  if (query.isLoading || scope.loading) {
    return (
      <View style={paneStyles.skeleton}>
        <SkeletonMatchRow count={6} />
      </View>
    );
  }
  if (query.isError && sections.length === 0) {
    return <ErrorState error={query.error} onRetry={query.refetch} />;
  }

  return (
    <SectionList
      {...scrollProps}
      sections={sections}
      keyExtractor={matchKey}
      renderItem={renderItem}
      renderSectionHeader={renderSectionHeader}
      stickySectionHeadersEnabled
      initialNumToRender={12}
      maxToRenderPerBatch={12}
      windowSize={8}
      contentContainerStyle={[paneStyles.content, styles.content]}
      refreshControl={
        <RefreshControl {...refreshControlProps(refresh.refreshing, refresh.onRefresh)} />
      }
      ListHeaderComponent={
        <View style={styles.header}>
          <SegmentedControl items={windowItems} value={activeWindow} onChange={setFixtureWindow} />
          {query.isError ? <ErrorState error={query.error} variant="banner" /> : null}
        </View>
      }
      ListEmptyComponent={
        <EmptyState
          icon="calendar-outline"
          title={activeWindow === "yaklasan" ? "Yaklaşan maç yok" : "Henüz sonuç yok"}
          body={
            activeWindow === "yaklasan"
              ? "Bu sezonun fikstüründe oynanacak maç kalmadı."
              : "Bu sezonda oynanmış maç bulunmuyor."
          }
          action={
            activeWindow === "yaklasan" && counts.past > 0
              ? { label: "Sonuçlara bak", onPress: () => setFixtureWindow("sonuclar") }
              : activeWindow === "sonuclar" && counts.upcoming > 0
                ? { label: "Fikstüre bak", onPress: () => setFixtureWindow("yaklasan") }
                : undefined
          }
          variant="inline"
        />
      }
    />
  );
}

const matchKey = (item: ApiMatch) => String(item.id);

const styles = StyleSheet.create({
  content: {
    paddingTop: space.sm,
  },
  header: {
    gap: space.sm,
    paddingTop: space.xs,
    paddingBottom: space.xs,
  },
  card: {
    marginBottom: space.m,
  },
});
