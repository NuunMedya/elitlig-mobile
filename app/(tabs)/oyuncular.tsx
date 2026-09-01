/**
 * OYUNCULAR — seçili kapsamdaki oyuncu sıralamaları.
 *
 * NEDEN AYRI SEKME: gol krallığı ve oyuncu istatistiği, bir amatör ligde
 * kullanıcıların en sık baktığı ikinci şeydir (birincisi skorlar). Eskiden
 * Ligler sekmesinin dört segmentinden biriydi ve segment seçimi ekran
 * değişince sıfırlandığı için her defasında yeniden bulunuyordu.
 *
 * SIRALAMA ÖLÇÜTÜ ÇİPLERDE, SÜTUNLAR SABİT: hangi ölçüte göre sıralandığından
 * bağımsız olarak her satır aynı üç rakamı gösterir (maç · gol · asist) ve
 * sağdaki büyük rakam SEÇİLİ ölçüttür. Böylece "gol krallığında kaç maç
 * oynamış?" sorusu satırdan ayrılmadan yanıtlanır; eski düzende yalnız seçili
 * ölçüt görünüyordu ve karşılaştırma için oyuncu profiline girmek gerekiyordu.
 *
 * PODYUM: ilk üç, listenin üstünde tek satırlık bir podyum olarak çizilir.
 * Sıralama ekranının işi "kim önde" sorusunu BİR BAKIŞTA yanıtlamaktır; ilk
 * üçü liste satırı olarak vermek bunu üç ayrı okumaya böler. Podyum yalnız
 * arama boşken ve en az üç oyuncu varken görünür.
 *
 * PERFORMANS: satır yüksekliği sabit (56px) → `getItemLayout`. Satır bileşeni
 * memo'lu ve yalnız ilkel prop alır.
 */

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ScopeChip } from "@/components/ScopeChip";
import {
  Avatar,
  EmptyState,
  ErrorState,
  Input,
  PlayerRow,
  PlayerRowHead,
  PLAYER_ROW_HEIGHT,
  ScreenHeader,
  SkeletonListRow,
  Tabs,
  Touchable,
  refreshControlProps,
  useHeaderScroll,
  useRefresh,
  type TabItem,
} from "@/components/ui";
import { getPlayerRankings } from "@/lib/api/players";
import { queryKeys } from "@/lib/queryKeys";
import type { PlayerRankRow, PlayerSort } from "@/lib/types";
import { useScope } from "@/providers/ScopeProvider";
import { colors, hairline, layout, radius, space, textScale, type } from "@/theme";

/** Sunucu sayıları kimi uçlarda string döndürüyor; tek dönüştürücüden geçer. */
const num = (value: number | string | null | undefined) => Number(value ?? 0) || 0;

interface SortDef {
  key: PlayerSort;
  label: string;
  /** Sağdaki büyük rakam. */
  metric: (row: PlayerRankRow) => string;
  unit: string;
}

/**
 * Ölçüt seçimi ÇİP DEĞİL SEKME (tema kuralı, bkz. components/ui/Tabs.tsx):
 * "Gol Krallığı" ile "En Çok Maç" aynı listenin süzülmüş hâlleri değil, ayrı
 * SAYFALARDIR — sıralama, sağdaki sütun ve podyum, hepsi değişir. Çip yığını
 * bunu süzgeç gibi gösteriyordu ve kâğıdın üstünde ekranın ikinci gezinme
 * katmanı olarak duruyordu.
 */
const SORTS: SortDef[] = [
  { key: "mostValuable", label: "En Değerliler", metric: (r) => String(num(r.points)), unit: "puan" },
  { key: "topScorers", label: "Gol Krallığı", metric: (r) => String(num(r.goals)), unit: "gol" },
  { key: "mostMatches", label: "En Çok Maç", metric: (r) => String(num(r.matches)), unit: "maç" },
  { key: "pointsPerMatch", label: "Puan / Maç", metric: (r) => num(r.pointsPerMatch).toFixed(2), unit: "puan" },
  { key: "goalsPerMatch", label: "Gol / Maç", metric: (r) => num(r.goalsPerMatch).toFixed(2), unit: "gol" },
  { key: "mostCards", label: "Kartlar", metric: (r) => String(num(r.cards)), unit: "kart" },
];

/** Sekme şeridi için — `SORTS` ile aynı sıra, aynı anahtarlar. */
const SORT_TABS: TabItem<PlayerSort>[] = SORTS.map((item) => ({
  key: item.key,
  label: item.label,
}));

const SKELETON_ROWS = ["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8"] as const;

/** Podyum sırasına göre madalya rengi. */
const MEDAL = [colors.star, colors.textSecondary, colors.warn];

const normalize = (value: string) => value.trim().toLocaleLowerCase("tr-TR");

/* ══════════════════════════════════════════════════════════════════════════
   Podyum — ilk üç
   ══════════════════════════════════════════════════════════════════════════ */

const Podium = React.memo(function Podium({
  players,
  metricOf,
  unit,
  onPress,
}: {
  players: PlayerRankRow[];
  metricOf: (row: PlayerRankRow) => string;
  unit: string;
  onPress: (playerId: number) => void;
}) {
  return (
    <View style={styles.podium}>
      {players.map((player, index) => (
        <Touchable
          key={player.id}
          style={styles.podiumCell}
          onPress={() => onPress(player.id)}
          feedback="card"
          haptic="selection"
          accessibilityRole="button"
          accessibilityLabel={`${index + 1}. ${player.name}, ${metricOf(player)} ${unit}`}
        >
          {/* Sıra rakamı halkanın altına oturur: madalya rengi zaten sırayı
              söylüyor, ayrı bir satır olarak durunca kart bir satır uzuyordu. */}
          <View style={styles.podiumAvatar}>
            <View style={[styles.podiumRing, { borderColor: MEDAL[index] }]}>
              <Avatar name={player.name} image={player.image ?? null} size={40} />
            </View>
            <View style={[styles.podiumRankBadge, { backgroundColor: MEDAL[index] }]}>
              <Text style={styles.podiumRankText} {...textScale.badge}>
                {index + 1}
              </Text>
            </View>
          </View>
          <Text style={styles.podiumName} numberOfLines={1} {...textScale.dense}>
            {player.name}
          </Text>
          <Text style={styles.podiumMetric} numberOfLines={1} {...textScale.dense}>
            {metricOf(player)} {unit}
          </Text>
        </Touchable>
      ))}
    </View>
  );
});

/* ══════════════════════════════════════════════════════════════════════════
   Ekran
   ══════════════════════════════════════════════════════════════════════════ */

const keyExtractor = (item: PlayerRankRow) => String(item.id);
const getItemLayout = (_data: ArrayLike<PlayerRankRow> | null | undefined, index: number) => ({
  length: PLAYER_ROW_HEIGHT,
  offset: PLAYER_ROW_HEIGHT * index,
  index,
});

export default function PlayersScreen() {
  const scope = useScope();
  const router = useRouter();
  const { scrollY, scrollProps } = useHeaderScroll();

  const [sort, setSort] = useState<PlayerSort>("topScorers");
  const [search, setSearch] = useState("");

  const active = SORTS.find((item) => item.key === sort) ?? SORTS[0];

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

  const refresh = useRefresh(query.refetch, { refreshing: query.isRefetching });

  const rows = useMemo(() => {
    const players = query.data?.players ?? [];
    const term = normalize(search);
    const filtered = term
      ? players.filter(
          (player) =>
            normalize(player.name).includes(term) ||
            normalize(player.teamName ?? "").includes(term),
        )
      : players;
    /* "En Değerliler"de sunucu piyasa değerine göre sıralar ama yanıt bu alanı
       taşımaz; ekranda puan gösterildiği için liste puana göre yeniden dizilir. */
    if (sort !== "mostValuable") return filtered;
    return [...filtered].sort((a, b) => num(b.points) - num(a.points));
  }, [query.data, search, sort]);

  const openPlayer = useCallback(
    (playerId: number) => router.push(`/oyuncu/${playerId}`),
    [router],
  );

  const busy = query.isLoading || scope.loading;
  const searching = Boolean(search.trim());
  const showPodium = !searching && !busy && rows.length >= 3;

  const renderItem = useCallback(
    ({ item, index }: { item: PlayerRankRow; index: number }) => (
      <PlayerRow
        playerId={item.id}
        rank={index + 1}
        name={item.name}
        image={item.image ?? null}
        /* META AKTİF ÖLÇÜTÜ TEKRAR ETMEZ: gol sıralamasındayken meta'da gol
           yazmaz — sağdaki sütun zaten onu söylüyor ve tekrar, satırı taşırıp
           oyuncu adını kırpan şeydi. */
        meta={[
          item.teamName || "Takımsız",
          active.unit === "maç" ? null : `${num(item.matches)} maç`,
          active.unit === "gol" ? null : `${num(item.goals)} gol`,
          `${num(item.assists)} asist`,
        ]}
        metric={active.metric(item)}
        onPress={openPlayer}
      />
    ),
    [active, openPlayer],
  );

  /* Podyum çizildiyse ilk üç listeden düşülür; aksi hâlde aynı üç oyuncu
     ekranda iki kez görünür ve sıralama "1,2,3,1,2,3" gibi okunur. */
  const listData = useMemo(
    () => (showPodium ? rows.slice(3) : rows),
    [rows, showPodium],
  );

  const renderOffsetItem = useCallback(
    ({ item, index }: { item: PlayerRankRow; index: number }) =>
      renderItem({ item, index: showPodium ? index + 3 : index }),
    [renderItem, showPodium],
  );

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader
        title="Oyuncular"
        overline={scope.leagueLabel || "ELİTLİG"}
        scrollY={scrollY}
        actions={[
          {
            icon: "search-outline",
            accessibilityLabel: "Ara",
            onPress: () => router.push("/ara"),
          },
        ]}
        tabs={
          <Tabs
            items={SORT_TABS}
            value={sort}
            onChange={setSort}
            distribute="scroll"
            sticky
          />
        }
        bottom={
          <View style={styles.headerBottom}>
            <ScopeChip />
          </View>
        }
      />

      {!scope.ready && !scope.loading ? (
        <EmptyState
          icon="options-outline"
          title="Lig seçilmedi"
          body="Şehir, lig ve sezon seçince oyuncu sıralaması dolar."
          action={{ label: "Kapsam seç", onPress: () => scope.openScopeSheet("city") }}
        />
      ) : (
        <FlatList
          {...scrollProps}
          data={busy ? [] : listData}
          keyExtractor={keyExtractor}
          renderItem={renderOffsetItem}
          getItemLayout={getItemLayout}
          initialNumToRender={12}
          windowSize={8}
          removeClippedSubviews
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl {...refreshControlProps(refresh.refreshing, refresh.onRefresh)} />
          }
          ListHeaderComponent={
            <View style={styles.listHeader}>
              <View style={styles.searchBox}>
                <Input
                  variant="search"
                  size="sm"
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Oyuncu veya takım ara"
                  autoCorrect={false}
                />
              </View>

              {query.isError ? <ErrorState error={query.error} variant="banner" /> : null}

              {showPodium ? (
                <Podium
                  players={rows.slice(0, 3)}
                  metricOf={active.metric}
                  unit={active.unit}
                  onPress={openPlayer}
                />
              ) : null}

              {rows.length > 0 ? <PlayerRowHead unit={active.unit} /> : null}
            </View>
          }
          ListEmptyComponent={
            busy ? (
              <View>
                {SKELETON_ROWS.map((key) => (
                  <SkeletonListRow key={key} />
                ))}
              </View>
            ) : query.isError ? (
              <ErrorState error={query.error} onRetry={query.refetch} variant="inline" />
            ) : searching ? (
              <EmptyState
                icon="search-outline"
                title="Eşleşme yok"
                body="Aramaya uyan oyuncu bulunamadı."
                variant="inline"
              />
            ) : (
              <EmptyState
                icon="people-outline"
                title="Oyuncu listesi boş"
                body="Bu sezonda yayınlanmış maç kadrosu bulunmuyor."
                variant="inline"
              />
            )
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  headerBottom: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: layout.screenPadding,
    paddingBottom: space.sm,
  },
  listContent: {
    paddingBottom: space.xxxl,
  },
  listHeader: {
    gap: space.sm,
  },
  searchBox: {
    paddingHorizontal: layout.screenPadding,
  },


  /* — Podyum — */
  podium: {
    flexDirection: "row",
    gap: space.sm,
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.xs,
  },
  podiumCell: {
    flex: 1,
    alignItems: "center",
    gap: space.xs,
    paddingVertical: space.m,
    backgroundColor: colors.surface1,
    borderRadius: radius.lg,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  podiumAvatar: {
    paddingBottom: 5,
  },
  podiumRing: {
    padding: 2,
    borderRadius: radius.pill,
    borderWidth: 1.5,
  },
  podiumRankBadge: {
    position: "absolute",
    bottom: 0,
    alignSelf: "center",
    minWidth: 14,
    height: 14,
    paddingHorizontal: 3,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: colors.surface1,
  },
  podiumRankText: {
    ...type.micro,
    color: colors.textOnStatus,
  },
  podiumName: {
    ...type.caption,
    color: colors.textPrimary,
    textAlign: "center",
    paddingHorizontal: space.xs,
  },
  podiumMetric: {
    ...type.caption,
    color: colors.textTertiary,
  },
});
