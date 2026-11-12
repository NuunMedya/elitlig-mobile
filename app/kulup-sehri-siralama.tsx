/**
 * KULÜP ŞEHRİ SIRALAMASI — /kulup-sehri-siralama
 *
 * Üç tablo, tek ekran:
 *   • Şehir seviyesi  — gelişim puanı (metric=dev): kulüp statüsü rozeti,
 *     puan ve 12 birimin mini seviye çubukları.
 *   • Haftalık yıldız — seçili dönemde kazanılan yıldız (metric=period_stars),
 *     varsayılan bu hafta.
 *   • Toplam yıldız   — bugüne kadar kazanılan bütün yıldızlar (metric=stars);
 *     tarih aralığı seçilirse o aralıkta kazanılanlar.
 * Yıldız tablolarında dönem şeridi: Bu hafta · Bu ay · Tüm zamanlar · Tarih
 * aralığı. Kapsam: Türkiye / kendi ilin.
 *
 * BÜTÜN OYUNCULAR: liste 50'şer satırlık sayfalarla sonuna kadar iner
 * (limit + offset). Kendi satırın vurgulu; ekranda değilse altta "Sen: 37."
 * şeridi sabit durur.
 *
 * ESKİ SUNUCU: `metric` tanınmazsa yanıtta `metric` alanı olmaz ve gelen liste
 * gelişim puanıdır — yıldız sekmelerinde yanlış etiketli veri göstermek yerine
 * "yakında" durumu çizilir. Sayfa bilgisi yoksa liste tek sayfadır.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { Redirect } from "expo-router";
import React, { useCallback, useMemo, useRef, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { BoardFooter, PeriodBar, PinnedMe, RankBadge, useBoardPages, useRowVisibility } from "@/components/leaderboards";
import {
  Avatar,
  EmptyState,
  ErrorState,
  ScreenHeader,
  SegmentedControl,
  SkeletonListRow,
  refreshControlProps,
  useRefresh,
  type SegmentedItem,
} from "@/components/ui";
import {
  BOARD_PAGE_SIZE,
  CITY_BUILDINGS,
  CITY_TIER_COUNT,
  formatCount,
  periodCaption,
  type PeriodValue,
} from "@/lib/leaderboard";
import { cityKeys, getCityLeaderboard, type CityBoardMetric, type CityLeaderRow, type CityLeaderboard } from "@/lib/puzzle/api";
import { useAuth } from "@/providers/AuthProvider";
import { colors, fonts, hairline, layout, radius, space, textScale, type } from "@/theme";

type Tab = "dev" | "week" | "total";
type Scope = "all" | "city";

const TABS: SegmentedItem<Tab>[] = [
  { key: "dev", label: "Şehir seviyesi" },
  { key: "week", label: "Haftalık yıldız" },
  { key: "total", label: "Toplam yıldız" },
];

const SUBTITLE: Record<Tab, string> = {
  dev: "Gelişim puanı ve kulüp statüsü",
  week: "Dönemde kazanılan yıldız",
  total: "Toplanan bütün yıldızlar",
};

/** Sekme + dönem → sunucu isteği. */
function boardRequest(tab: Tab, pv: PeriodValue) {
  if (tab === "dev") return { metric: "dev" as CityBoardMetric };
  if (pv.period === "alltime") return { metric: "stars" as CityBoardMetric };
  if (pv.period === "range" && pv.range) return { metric: "period_stars" as CityBoardMetric, from: pv.range.from, to: pv.range.to };
  return { metric: "period_stars" as CityBoardMetric, period: pv.period === "month" ? ("month" as const) : ("week" as const) };
}

function rowValue(row: CityLeaderRow, metric: CityBoardMetric): number {
  if (metric === "dev") return row.dev;
  if (metric === "stars") return Number(row.stars_total ?? 0);
  return Number(row.stars_period ?? 0);
}

const rowsOf = (page: CityLeaderboard) => page.items ?? [];
const keyOf = (row: CityLeaderRow) => row.user_id;

/* ───────────────────────── Satır ───────────────────────── */

/** 12 birimin seviyeleri: her çubuk birimin tavanına göre dolar. */
const LevelBars = React.memo(function LevelBars({ levels }: { levels: Record<string, number> }) {
  return (
    <View style={styles.bars} accessibilityLabel="Birim seviyeleri">
      {CITY_BUILDINGS.map((b) => {
        const lvl = Math.max(0, Number(levels?.[b.key] ?? 0));
        const fill = Math.min(1, lvl / (b.max || 8));
        return (
          <View key={b.key} style={styles.bar}>
            <View style={[styles.barFill, { height: `${Math.round(fill * 100)}%` as const }, fill >= 1 ? styles.barMax : null]} />
          </View>
        );
      })}
    </View>
  );
});

const CityRow = React.memo(function CityRow({ row, metric }: { row: CityLeaderRow; metric: CityBoardMetric }) {
  const value = rowValue(row, metric);
  const tierStep = row.tier_index != null ? Math.min(CITY_TIER_COUNT, row.tier_index + 1) : null;
  return (
    <View style={[styles.row, row.me ? styles.rowMe : null]}>
      <RankBadge rank={row.rank} mine={row.me} />
      <Avatar name={row.name} size={36} ring={row.me ? "brand" : "none"} />
      <View style={styles.texts}>
        <Text style={styles.name} numberOfLines={1} {...textScale.dense}>
          {row.me ? `${row.name} (sen)` : row.name}
        </Text>
        {metric === "dev" ? (
          <View style={styles.devLine}>
            <View style={styles.tierPill}>
              <Ionicons name="shield" size={10} color={colors.brandAccent} />
              <Text style={styles.tierText} numberOfLines={1} {...textScale.badge}>
                {row.tier}
              </Text>
              {tierStep != null ? (
                <Text style={styles.tierStep} {...textScale.badge}>
                  {`${tierStep}/${CITY_TIER_COUNT}`}
                </Text>
              ) : null}
            </View>
            <LevelBars levels={row.levels} />
          </View>
        ) : (
          <Text style={styles.sub} numberOfLines={1} {...textScale.dense}>
            {[row.city, row.tier].filter(Boolean).join(" · ")}
          </Text>
        )}
      </View>
      <View style={styles.valueBox}>
        <View style={styles.valueLine}>
          <Ionicons
            name={metric === "dev" ? "trending-up" : "star"}
            size={13}
            color={metric === "dev" ? colors.brandAccent : colors.star}
          />
          <Text style={styles.value} {...textScale.badge}>
            {formatCount(value)}
          </Text>
        </View>
        <Text style={styles.unit} {...textScale.badge}>
          {metric === "dev" ? "gelişim" : "yıldız"}
        </Text>
      </View>
    </View>
  );
});

/* ───────────────────────── Ekran ───────────────────────── */

export default function ClubCityLeaderboardScreen() {
  const auth = useAuth();
  const [tab, setTab] = useState<Tab>("dev");
  const [scope, setScope] = useState<Scope>("all");
  const [weekPeriod, setWeekPeriod] = useState<PeriodValue>({ period: "week" });
  const [totalPeriod, setTotalPeriod] = useState<PeriodValue>({ period: "alltime" });
  const listRef = useRef<FlatList<CityLeaderRow>>(null);

  const pv = tab === "week" ? weekPeriod : totalPeriod;
  const setPv = tab === "week" ? setWeekPeriod : setTotalPeriod;
  const req = boardRequest(tab, pv);
  const metric = req.metric;

  const fetchPage = useCallback(
    (offset: number) => getCityLeaderboard(scope, { ...req, limit: BOARD_PAGE_SIZE, offset }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scope, metric, req.period, req.from, req.to]
  );

  const { query, rows, first, loadMore } = useBoardPages({
    queryKey: cityKeys.leaderboard(scope, metric, req.period ?? null, req.from ?? null, req.to ?? null),
    enabled: Boolean(auth.user),
    fetchPage,
    rowsOf,
    keyOf,
  });

  /** Eski sunucu `metric`'i tanımıyor: yıldız sekmesine gelişim listesi gelir. */
  const unsupported = metric !== "dev" && first != null && first.metric == null;

  const meRow = useMemo(() => rows.find((row) => row.me) ?? null, [rows]);
  const meIndex = meRow ? rows.indexOf(meRow) : -1;
  const meRank = first?.me?.rank ?? meRow?.rank ?? null;
  const meValue =
    metric === "dev"
      ? first?.me?.dev ?? meRow?.dev ?? null
      : metric === "stars"
        ? first?.me?.stars_total ?? meRow?.stars_total ?? null
        : first?.me?.stars_period ?? meRow?.stars_period ?? null;

  const isMine = useCallback((item: unknown) => Boolean((item as CityLeaderRow | null)?.me), []);
  const visibility = useRowVisibility(isMine);

  const refresh = useRefresh(query.refetch, { refreshing: query.isRefetching && !query.isFetchingNextPage });

  const scopeItems = useMemo<SegmentedItem<Scope>[]>(
    () => [
      { key: "all", label: "Türkiye" },
      { key: "city", label: auth.user?.city ? auth.user.city : "Şehrim" },
    ],
    [auth.user?.city]
  );

  const jumpToMe = useCallback(() => {
    if (meIndex >= 0) listRef.current?.scrollToIndex({ index: meIndex, viewPosition: 0.5, animated: true });
  }, [meIndex]);

  const renderItem = useCallback(
    ({ item }: { item: CityLeaderRow }) => <CityRow row={item} metric={metric} />,
    [metric]
  );

  if (!auth.user) return <Redirect href="/giris" />;

  const total = first?.total ?? null;
  const caption = tab === "dev" ? "şu anki gelişim" : metric === "stars" ? "tüm zamanlar" : periodCaption(pv);
  const showPinned =
    !unsupported && !query.isLoading && !visibility.visible && (meRank != null || meRow != null) && rows.length > 0;

  const header = (
    <View style={styles.listHeader}>
      {tab !== "dev" ? <PeriodBar value={pv} onChange={setPv} /> : null}
      {rows.length > 0 && !unsupported ? (
        <View style={styles.metaLine}>
          <Ionicons name="people-outline" size={14} color={colors.textTertiary} />
          <Text style={styles.metaText} numberOfLines={1} {...textScale.dense}>
            {`${formatCount(total ?? rows.length)} oyuncu · ${caption}`}
          </Text>
        </View>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader
        title="Şehir sıralaması"
        subtitle={SUBTITLE[tab]}
        back
        bottom={
          <View style={styles.filters}>
            <SegmentedControl items={TABS} value={tab} onChange={setTab} stretch size="sm" />
            <SegmentedControl items={scopeItems} value={scope} onChange={setScope} stretch size="sm" />
          </View>
        }
      />
      {query.isLoading ? (
        <View style={styles.pad}>
          {header}
          <SkeletonListRow count={8} avatar />
        </View>
      ) : query.isError && rows.length === 0 ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : (
        <FlatList
          ref={listRef}
          data={unsupported ? [] : rows}
          keyExtractor={(row) => String(row.user_id)}
          renderItem={renderItem}
          contentContainerStyle={[styles.list, showPinned ? styles.listPinned : null]}
          ListHeaderComponent={header}
          ListFooterComponent={
            unsupported ? null : (
              <BoardFooter loading={query.isFetchingNextPage} done={!query.hasNextPage} count={rows.length} total={total} />
            )
          }
          ListEmptyComponent={
            unsupported ? (
              <EmptyState
                icon="star-outline"
                title="Yıldız tablosu yakında"
                body="Dönemlik ve toplam yıldız sıralaması sunucu güncellemesiyle açılacak. Şimdilik Şehir seviyesi tablosuna bakabilirsin."
                variant="inline"
                action={{ label: "Şehir seviyesi", onPress: () => setTab("dev"), haptic: "light" }}
              />
            ) : (
              <EmptyState
                icon={tab === "dev" ? "business-outline" : "star-outline"}
                title={tab === "dev" ? "Henüz şehir yok" : "Bu dönemde yıldız yok"}
                body={tab === "dev" ? "İlk binayı sen kur." : "Bulmaca ve oyunlardan yıldız topla, tabloya ilk sen gir."}
                variant="inline"
              />
            )
          }
          onEndReached={loadMore}
          onEndReachedThreshold={0.6}
          onViewableItemsChanged={visibility.onViewableItemsChanged}
          viewabilityConfig={visibility.viewabilityConfig}
          onScrollToIndexFailed={(info) =>
            listRef.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: true })
          }
          refreshControl={<RefreshControl {...refreshControlProps(refresh.refreshing, refresh.onRefresh)} />}
          showsVerticalScrollIndicator={false}
        />
      )}
      {showPinned ? (
        <PinnedMe
          name={meRow?.name ?? auth.user.fullName ?? auth.user.username}
          rank={meRank}
          value={meValue}
          unit={metric === "dev" ? "gelişim" : "yıldız"}
          caption={caption}
          onPress={meIndex >= 0 ? jumpToMe : undefined}
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  filters: { paddingHorizontal: layout.screenPadding, paddingBottom: space.sm, gap: space.sm },
  pad: { paddingHorizontal: layout.screenPadding },
  list: { paddingHorizontal: layout.screenPadding, paddingBottom: space.giant, gap: space.sm },
  listPinned: { paddingBottom: 110 },
  listHeader: { gap: space.sm, paddingTop: space.md, paddingBottom: space.xs, marginHorizontal: -layout.screenPadding },
  metaLine: { flexDirection: "row", alignItems: "center", gap: space.xs, paddingHorizontal: layout.screenPadding },
  metaText: { ...type.caption, color: colors.textTertiary, flex: 1 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.m,
    paddingVertical: space.m,
    paddingHorizontal: space.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  rowMe: { borderColor: colors.brandAccent, borderWidth: 1.5, backgroundColor: colors.brandDim },
  texts: { flex: 1, gap: 3 },
  name: { ...type.h4, fontFamily: fonts.semibold, color: colors.textPrimary },
  sub: { ...type.caption, color: colors.textTertiary },
  devLine: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: space.xs, columnGap: space.sm },
  tierPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    flexShrink: 1,
    paddingHorizontal: space.s,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.brandDim,
    borderWidth: hairline,
    borderColor: colors.brandBorder,
  },
  tierText: { ...type.micro, letterSpacing: 0, color: colors.brandAccent, flexShrink: 1 },
  tierStep: { ...type.nano, color: colors.textTertiary },
  bars: { flexDirection: "row", alignItems: "flex-end", gap: 2, height: 12 },
  bar: { width: 3, height: 12, borderRadius: radius.xs, backgroundColor: colors.surface3, overflow: "hidden", justifyContent: "flex-end" },
  barFill: { width: "100%", backgroundColor: colors.brandAccent },
  barMax: { backgroundColor: colors.star },
  valueBox: { alignItems: "flex-end", minWidth: 56 },
  valueLine: { flexDirection: "row", alignItems: "center", gap: 3 },
  value: { ...type.scoreSm, color: colors.textPrimary },
  unit: { ...type.micro, letterSpacing: 0, color: colors.textTertiary },
});
