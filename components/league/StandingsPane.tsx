/**
 * StandingsPane — puan durumu (Lig merkezinin "Puan" bölmesi).
 *
 * TABLO TEK KARTTIR: sütun başlığı kartın tepesi, son satır tabanı, arada
 * saç teli ayraç. FlatList satırları tek tek ürettiği için kart satır satır
 * çizilir (bkz. `groupStyles`); bölge açıklaması ve dipnot kartın DIŞINDA.
 *
 * ÜÇ GÖRÜNÜM (Kısa · Tam · Form): telefon genişliğinde altı sayı sütunu ve
 * uzun bir takım adı aynı satıra ancak sıkışarak sığar. Kullanıcının sorusu
 * çoğu zaman tek şeydir — "kaç puan, kaç averaj" ya da "kim formda" — ve her
 * soru kendi sütun kümesini hak eder. Seçim bölme içinde hatırlanır.
 *
 * TAKİP EDİLEN TAKIMLAR VURGULANIR: satır sönük zümrüt zemin + yıldız alır
 * (Arena: vurgulanan takım veridir → accent). Yirmi satırlık bir tabloda
 * kullanıcı önce KENDİ takımını arar; aramayı tablo yapar.
 *
 * BÖLGE RAYI satırın sol kenarındadır, açıklaması tablonun ALTINDA tek
 * satırdır: renk tek başına anlam taşımaz, "altın = şampiyon" bir yerde
 * yazılmalı ve o yer tablonun sonudur.
 */

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import {
  EmptyState,
  ErrorState,
  SegmentedControl,
  SkeletonStandings,
  TeamRow,
  TeamRowHead,
  refreshControlProps,
  useRefresh,
  type SegmentedItem,
} from "@/components/ui";
/* Barrel (`components/ui/index.ts`) yalnız TeamRowProps'u dışa aktarıyor;
   sütun kümesi tipi doğrudan kaynağından alınır. */
import type { TeamRowColumns } from "@/components/ui/TeamRow";
import { getStandings } from "@/lib/api/standings";
import { queryKeys } from "@/lib/queryKeys";
import type { StandingRow } from "@/lib/types";
import { useFavorite } from "@/providers/FavoriteProvider";
import { useScope } from "@/providers/ScopeProvider";
import {
  colors,
  defaultZoneRules,
  hairline,
  palette,
  radius,
  space,
  textScale,
  type,
  zoneColor,
  zoneForRank,
  zoneLabel,
  type StandingZone,
  type ZoneRule,
} from "@/theme";
import {
  GroupSeparator,
  ScopeMissing,
  groupRowStyle,
  groupStyles,
  paneStyles,
  useScopeKey,
  type PaneProps,
} from "./shared";

const VIEW_ITEMS: SegmentedItem<TeamRowColumns>[] = [
  { key: "short", label: "Kısa" },
  { key: "full", label: "Tam" },
  { key: "form", label: "Form" },
];

/** Ray renklerinin anahtarı — tablonun altında tek satır. */
const ZoneLegend = React.memo(function ZoneLegend({ rules }: { rules: ZoneRule[] }) {
  const zones = useMemo(() => {
    const seen = new Set<StandingZone>();
    return rules
      .map((rule) => rule.zone)
      .filter((zone) => {
        if (zone === "none" || seen.has(zone)) return false;
        seen.add(zone);
        return true;
      });
  }, [rules]);

  if (zones.length === 0) return null;

  return (
    <View style={styles.legend}>
      {zones.map((zone) => (
        <View key={zone} style={styles.legendItem}>
          <View
            style={[styles.legendSwatch, { backgroundColor: zoneColor(palette, zone) ?? colors.border }]}
          />
          <Text style={styles.legendLabel} {...textScale.dense}>
            {zoneLabel(zone)}
          </Text>
        </View>
      ))}
    </View>
  );
});

export function StandingsPane({ scrollProps }: PaneProps) {
  const scope = useScope();
  const scopeKey = useScopeKey();
  const router = useRouter();
  const { isFavorite } = useFavorite();
  const [columns, setColumns] = useState<TeamRowColumns>("full");

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
  const rows = useMemo(() => query.data ?? [], [query.data]);
  const zoneRules = useMemo(() => defaultZoneRules(rows.length), [rows.length]);
  const powerBalance = rows[0]?.standings_type === "gucdengesi";
  const followedCount = useMemo(
    () => rows.filter((row) => isFavorite(row.team_id)).length,
    [rows, isFavorite],
  );

  const openTeam = useCallback((teamId: number) => router.push(`/takim/${teamId}`), [router]);

  const renderItem = useCallback(
    ({ item, index }: { item: StandingRow; index: number }) => {
      const rank = index + 1;
      const favorite = isFavorite(item.team_id);
      return (
        <TeamRow
          density="table"
          columns={columns}
          rank={rank}
          teamId={item.team_id}
          name={item.team_name}
          logo={item.logo}
          played={item.played}
          wins={item.wins}
          draws={item.draws}
          losses={item.losses}
          goalDiff={Number(item.goal_diff ?? 0)}
          points={item.display_points}
          form={item.last5}
          favorite={favorite}
          highlighted={favorite}
          zone={zoneColor(palette, zoneForRank(rank, zoneRules))}
          onPress={openTeam}
          style={groupRowStyle(index, rows.length, true)}
        />
      );
    },
    [columns, isFavorite, openTeam, rows.length, zoneRules],
  );

  if (!scope.ready && !scope.loading) return <ScopeMissing />;
  if (query.isLoading || scope.loading) {
    /* İskelet de kartta durur; yükleme bitince çerçeve zıplamaz. */
    return (
      <View style={paneStyles.skeleton}>
        <View style={styles.skeletonSegment} />
        <View style={styles.skeletonCard}>
          <SkeletonStandings density="table" />
        </View>
      </View>
    );
  }
  if (query.isError && rows.length === 0) {
    return <ErrorState error={query.error} onRetry={query.refetch} />;
  }

  return (
    <FlatList
      {...scrollProps}
      data={rows}
      extraData={columns}
      keyExtractor={standingKey}
      renderItem={renderItem}
      ItemSeparatorComponent={GroupSeparator}
      initialNumToRender={14}
      windowSize={8}
      contentContainerStyle={paneStyles.content}
      refreshControl={
        <RefreshControl {...refreshControlProps(refresh.refreshing, refresh.onRefresh)} />
      }
      ListHeaderComponent={
        rows.length > 0 ? (
          <View style={styles.header}>
            {query.isError ? <ErrorState error={query.error} variant="banner" /> : null}
            <View style={styles.toolbar}>
              <Text style={styles.toolbarMeta} {...textScale.dense}>
                {rows.length} takım
                {followedCount > 0 ? ` · ${followedCount} takip` : ""}
              </Text>
              <SegmentedControl
                items={VIEW_ITEMS}
                value={columns}
                onChange={setColumns}
                size="sm"
                stretch={false}
              />
            </View>
            {/* Sütun başlığı kartın TEPESİDİR: üst kenarlık ve üst köşeler onda. */}
            <View style={groupStyles.head}>
              <TeamRowHead
                density="table"
                columns={columns}
                pointsLabel={powerBalance ? "GP" : "Puan"}
              />
            </View>
          </View>
        ) : null
      }
      ListEmptyComponent={
        <EmptyState
          icon="podium-outline"
          title="Puan tablosu boş"
          body="Bu sezonda henüz maç oynanmamış. İlk maçlardan sonra sıralama burada oluşur."
        />
      }
      ListFooterComponent={
        rows.length > 0 ? (
          <View style={styles.footer}>
            <ZoneLegend rules={zoneRules} />
            {powerBalance ? (
              <Text style={styles.footnote} {...textScale.long}>
                Bu sezon Güç Dengesi puanlaması kullanılıyor: bir maçtan alınan puan
                rakibin güç endeksine göre değişir, toplam puan 0&apos;ın altına düşmez.
              </Text>
            ) : null}
          </View>
        ) : null
      }
    />
  );
}

const standingKey = (item: StandingRow) => String(item.team_id);

const styles = StyleSheet.create({
  header: {
    gap: space.md,
  },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.md,
  },
  toolbarMeta: {
    ...type.caption,
    color: colors.textTertiary,
    paddingLeft: space.xxs,
  },
  skeletonSegment: {
    alignSelf: "flex-end",
    width: 168,
    height: 32,
    borderRadius: radius.md,
    backgroundColor: colors.skeletonBase,
  },
  skeletonCard: {
    borderWidth: hairline,
    borderColor: colors.border,
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    overflow: "hidden",
  },
  footer: {
    paddingTop: space.md,
    gap: space.sm,
  },
  legend: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.lg,
    paddingHorizontal: space.xxs,
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: space.s },
  legendSwatch: { width: 3, height: 12, borderRadius: 2 },
  legendLabel: { ...type.caption, color: colors.textSecondary },
  footnote: {
    ...type.caption,
    color: colors.textTertiary,
    letterSpacing: 0,
    lineHeight: 17,
    paddingHorizontal: space.xxs,
  },
});
