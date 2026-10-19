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
 * TAKIM TAKİBİ TABLODADIR: her satırın sonunda takip yıldızı (`FollowStar`)
 * durur — eski ayrı "Takımlar" sekmesinin işi buydu. Takip edince bildirim
 * türleri alt sayfası açılır (`useFollowFlow`). Takip edilen takımın satırı
 * sönük zemin alır: yirmi satırlık bir tabloda kullanıcı önce KENDİ takımını
 * arar; aramayı tablo yapar. Satıra dokununca takım sayfası açılır.
 *
 * GOL KRALLIĞI KAPISI: tablonun ÜSTÜNDE tek satırlık kart — ilk üç golcü ve
 * "Tümü" → Oyuncular bölmesi (`ScorersStrip`; eski Ana Sayfa'daki puan özeti
 * + gol krallığının Lig'deki yeri). Tablonun altına konsaydı yüzlerce
 * takımlık liglerde görülmezdi. Tam liste Oyuncular'da, ilk beş
 * İstatistik'te; burada yalnız kapı.
 *
 * BÖLGE RAYI satırın sol kenarındadır, açıklaması tablonun ALTINDA tek
 * satırdır: renk tek başına anlam taşımaz, "altın = şampiyon" bir yerde
 * yazılmalı ve o yer tablonun sonudur.
 *
 * YOĞUN ÖLÇÜ: satırlar ortak `TeamRow` değil, bu sekmeye özgü ince
 * `StandingsRow`dur (34px satır, 12px ad, 18px arma; gerekçe o dosyada).
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
  refreshControlProps,
  useRefresh,
  type SegmentedItem,
} from "@/components/ui";
/* Barrel (`components/ui/index.ts`) yalnız TeamRowProps'u dışa aktarıyor;
   sütun kümesi tipi doğrudan kaynağından alınır. */
import type { TeamRowColumns } from "@/components/ui/TeamRow";
import { FollowStar } from "@/components/FollowControls";
import { getPlayerRankings } from "@/lib/api/players";
import { getStandings } from "@/lib/api/standings";
import { queryKeys } from "@/lib/queryKeys";
import type { PlayerSort, StandingRow } from "@/lib/types";
import { useFavorite } from "@/providers/FavoriteProvider";
import { useScope } from "@/providers/ScopeProvider";
import {
  colors,
  defaultZoneRules,
  hairline,
  palette,
  space,
  textScale,
  type,
  zoneColor,
  zoneForRank,
  zoneLabel,
  type StandingZone,
  type ZoneRule,
} from "@/theme";
import type { LeaderEntry } from "./Leaderboard";
import { ScorersStrip } from "./ScorersStrip";
import { StandingsHead, StandingsRow } from "./StandingsRow";
import {
  GROUP_RADIUS,
  GroupSeparator,
  JUNK_PLAYER,
  ScopeMissing,
  num,
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

/** Satır sonundaki takip yıldızının genişliği (FollowStar kutusu = 32, ikon 14). */
const STAR_SLOT = 32;
/** Tablonun altındaki gol krallığı kapısında gösterilen golcü sayısı. */
const SCORER_PREVIEW = 3;

export interface StandingsPaneProps extends PaneProps {
  /** "Tüm sıralama" → Oyuncular bölmesi, verilen ölçütle. */
  onOpenPlayers?: (sort: PlayerSort) => void;
}

export function StandingsPane({ scrollProps, onOpenPlayers }: StandingsPaneProps) {
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

  /* Gol krallığı — İstatistik/Oyuncular ile aynı sorgu anahtarı: önbellek ortak. */
  const scorersQuery = useQuery({
    queryKey: queryKeys.playerRankings(scopeKey, "topScorers"),
    queryFn: () => getPlayerRankings(scopeKey, "topScorers"),
    enabled: scope.ready,
    staleTime: 60_000,
  });

  const { refetch: refetchStandings } = query;
  const { refetch: refetchScorers } = scorersQuery;
  const refetchAll = useCallback(() => {
    void refetchScorers();
    return refetchStandings();
  }, [refetchScorers, refetchStandings]);
  const refresh = useRefresh(refetchAll, { refreshing: query.isRefetching });

  const scorers = useMemo<LeaderEntry[]>(
    () =>
      (scorersQuery.data?.players ?? [])
        .filter((row) => row.name && !JUNK_PLAYER.test(row.name) && num(row.goals) > 0)
        .sort((a, b) => num(b.goals) - num(a.goals))
        .slice(0, SCORER_PREVIEW)
        .map((row) => ({
          id: row.id,
          name: row.name,
          image: row.image ?? null,
          meta: row.teamName || "Takımsız",
          value: num(row.goals),
        })),
    [scorersQuery.data],
  );
  const rows = useMemo(() => query.data ?? [], [query.data]);
  const zoneRules = useMemo(() => defaultZoneRules(rows.length), [rows.length]);
  const powerBalance = rows[0]?.standings_type === "gucdengesi";
  const followedCount = useMemo(
    () => rows.filter((row) => isFavorite(row.team_id)).length,
    [rows, isFavorite],
  );

  const openTeam = useCallback((teamId: number) => router.push(`/takim/${teamId}`), [router]);
  const openPlayer = useCallback((id: number) => router.push(`/oyuncu/${id}`), [router]);
  const openScorers = useCallback(() => onOpenPlayers?.("topScorers"), [onOpenPlayers]);

  const renderItem = useCallback(
    ({ item, index }: { item: StandingRow; index: number }) => {
      const rank = index + 1;
      const favorite = isFavorite(item.team_id);
      return (
        <StandingsRow
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
          highlighted={favorite}
          zone={zoneColor(palette, zoneForRank(rank, zoneRules))}
          onPress={openTeam}
          trailing={
            <FollowStar
              size={14}
              target={{ type: "team", id: item.team_id, name: item.team_name, logo: item.logo ?? null }}
            />
          }
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
      initialNumToRender={20}
      windowSize={8}
      contentContainerStyle={paneStyles.content}
      refreshControl={
        <RefreshControl {...refreshControlProps(refresh.refreshing, refresh.onRefresh)} />
      }
      ListHeaderComponent={
        rows.length > 0 ? (
          <View style={styles.header}>
            {query.isError ? <ErrorState error={query.error} variant="banner" /> : null}
            <ScorersStrip
              entries={scorers}
              onPressEntry={openPlayer}
              onSeeAll={onOpenPlayers ? openScorers : undefined}
            />
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
              <StandingsHead
                columns={columns}
                pointsLabel={powerBalance ? "GP" : "Puan"}
                trailingWidth={STAR_SLOT}
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
    gap: space.sm,
  },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
  },
  toolbarMeta: {
    ...type.meta,
    color: colors.textTertiary,
    paddingLeft: space.xxs,
  },
  skeletonSegment: {
    alignSelf: "flex-end",
    width: 150,
    height: 28,
    borderRadius: GROUP_RADIUS / 2,
    backgroundColor: colors.skeletonBase,
  },
  skeletonCard: {
    borderWidth: hairline,
    borderColor: colors.border,
    borderRadius: GROUP_RADIUS,
    backgroundColor: colors.surface1,
    overflow: "hidden",
  },
  footer: {
    paddingTop: space.sm,
    gap: space.xs,
  },
  legend: {
    flexDirection: "row",
    flexWrap: "wrap",
    columnGap: space.md,
    rowGap: space.xs,
    paddingHorizontal: space.xxs,
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: space.xs },
  legendSwatch: { width: 2, height: 10, borderRadius: 1 },
  legendLabel: { ...type.meta, color: colors.textSecondary },
  footnote: {
    ...type.meta,
    color: colors.textTertiary,
    letterSpacing: 0,
    lineHeight: 14,
    paddingHorizontal: space.xxs,
  },
});
