/**
 * KULÜP ŞEHRİ SIRALAMASI — /kulup-sehri-siralama
 *
 * Beş tablo, tek ekran:
 *   • Basamak         — Kulüp Şehri 2.0 kariyer merdiveni (metric=step):
 *     basamak etiketi ("16a") ve adı; eşitlikte 2.0 gelişim puanı.
 *   • Güzellik        — yerleşik sembol yapılar + kurulan aşamalar
 *     (metric=beauty); güzelliği 0 olanlar listede yok.
 *   • Gelişim         — eski gelişim puanı (metric=dev): kulüp statüsü rozeti,
 *     puan ve 12 birimin mini seviye çubukları.
 *   • Haftalık yıldız — seçili dönemde kazanılan yıldız (metric=period_stars),
 *     varsayılan bu hafta.
 *   • Toplam yıldız   — bugüne kadar kazanılan bütün yıldızlar (metric=stars);
 *     tarih aralığı seçilirse o aralıkta kazanılanlar.
 *   • Elit Lira       — dönemde KAZANILAN EL (metric=el; Faz 2), altta net
 *     (kazanılan − gider). Varsayılan bu hafta.
 *   • Transfer        — dönemde akademiden oyuncu satışıyla kazanılan EL
 *     (metric=transfer; Faz 3). Varsayılan bu hafta; `?tab=transfer` ile açılır.
 *   • Sezon           — Faz 5: şimdiki sezonun puanı (metric=season); kapsam
 *     Türkiye / ilim / takımım (team=1). Sezon öncesi "yakında başlıyor".
 *     `?tab=season` ile açılır.
 *   • Takımlar        — Faz 5: takım tesisleri (metric=team): seviye, toplam
 *     bağış puanı, bağışçı sayısı; kendi takımın vurgulu. `?tab=team`.
 * Sekmeler yatay kayar (dokuz sekme dar ekrana sığmaz).
 * Yıldız ve EL tablolarında dönem şeridi: Bu hafta · Bu ay · Tüm zamanlar · Tarih
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
import { Redirect, useLocalSearchParams } from "expo-router";
import React, { useCallback, useMemo, useRef, useState } from "react";
import { FlatList, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ElCoin } from "@/components/city2/ElitLira";
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
import { ApiError } from "@/lib/http";
import { cityKeys, getCityLeaderboard, getCityTeamBoard, type CityBoardMetric, type CityLeaderRow, type CityLeaderboard, type CityTeamBoard, type CityTeamRow } from "@/lib/puzzle/api";
import { PrestigeStars } from "@/components/city2/Season";
import { TeamTile } from "@/components/city2/Team";
import { useAuth } from "@/providers/AuthProvider";
import { colors, fonts, hairline, layout, radius, space, textScale, type } from "@/theme";

type Tab = "step" | "season" | "team" | "beauty" | "el" | "transfer" | "dev" | "week" | "total";
/** "team": yalnız Sezon sekmesinde (takımımın üyeleri). */
type Scope = "all" | "city" | "team";

const TABS: SegmentedItem<Tab>[] = [
  { key: "step", label: "Lig" },
  { key: "season", label: "Sezon" },
  { key: "team", label: "Takımlar" },
  { key: "beauty", label: "Güzellik" },
  { key: "el", label: "Elit Lira" },
  { key: "transfer", label: "Transfer" },
  { key: "dev", label: "Gelişim" },
  { key: "week", label: "Haftalık" },
  { key: "total", label: "Toplam" },
];

const SUBTITLE: Record<Tab, string> = {
  step: "Ligde yüksel",
  season: "Sezon puanı",
  team: "Takım tesisleri",
  beauty: "Şehrin güzellik puanı",
  el: "Dönemde kazanılan Elit Lira",
  transfer: "Akademiden oyuncu satışıyla kazanılan EL",
  dev: "Gelişim puanı ve kulüp statüsü",
  week: "Dönemde kazanılan yıldız",
  total: "Toplanan bütün yıldızlar",
};

/** Sekme + dönem → sunucu isteği. */
function boardRequest(tab: Tab, pv: PeriodValue) {
  if (tab === "dev" || tab === "step" || tab === "beauty" || tab === "season" || tab === "team") return { metric: tab as CityBoardMetric };
  if (tab === "el" || tab === "transfer") {
    const metric = tab as CityBoardMetric;
    if (pv.period === "range" && pv.range) return { metric, from: pv.range.from, to: pv.range.to };
    return { metric, period: pv.period === "range" ? ("week" as const) : pv.period };
  }
  if (pv.period === "alltime") return { metric: "stars" as CityBoardMetric };
  if (pv.period === "range" && pv.range) return { metric: "period_stars" as CityBoardMetric, from: pv.range.from, to: pv.range.to };
  return { metric: "period_stars" as CityBoardMetric, period: pv.period === "month" ? ("month" as const) : ("week" as const) };
}

/** Tablonun yalnız seçili döneme bağlı olmayan (dönem şeridi olmayan) sekmeleri. */
const STATIC_TABS: ReadonlySet<Tab> = new Set(["step", "beauty", "dev", "season", "team"]);

const UNIT: Record<CityBoardMetric, string> = { dev: "gelişim", stars: "yıldız", period_stars: "yıldız", step: "lig", beauty: "güzellik", el: "EL", transfer: "EL", season: "puan", team: "puan" };

function rowValue(row: CityLeaderRow, metric: CityBoardMetric): number {
  if (metric === "dev") return row.dev;
  if (metric === "step") return Number(row.rung ?? 0);
  if (metric === "beauty") return Number(row.beauty ?? 0);
  if (metric === "el") return Number(row.el ?? 0);
  if (metric === "transfer") return Number(row.transfer ?? 0);
  if (metric === "season") return Number(row.season_score ?? 0);
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
        <View style={styles.nameLine}>
          <Text style={styles.name} numberOfLines={1} {...textScale.dense}>
            {row.me ? `${row.name} (sen)` : row.name}
          </Text>
          {row.prestige ? <PrestigeStars count={row.prestige} size={11} /> : null}
        </View>
        {metric === "el" ? (
          <View style={styles.devLine}>
            {row.step_title ? (
              <View style={styles.tierPill}>
                <Ionicons name="trending-up" size={10} color={colors.brandAccent} />
                <Text style={styles.tierText} numberOfLines={1} {...textScale.badge}>
                  {row.step_label ? `${row.step_label} · ${row.step_title}` : row.step_title}
                </Text>
              </View>
            ) : null}
            {row.el_net != null ? (
              <Text style={styles.sub} numberOfLines={1} {...textScale.dense}>
                {`net ${formatCount(Number(row.el_net))}`}
              </Text>
            ) : null}
          </View>
        ) : metric === "transfer" ? (
          <View style={styles.devLine}>
            {row.step_title ? (
              <View style={styles.tierPill}>
                <Ionicons name="trending-up" size={10} color={colors.brandAccent} />
                <Text style={styles.tierText} numberOfLines={1} {...textScale.badge}>
                  {row.step_label ? `${row.step_label} · ${row.step_title}` : row.step_title}
                </Text>
              </View>
            ) : null}
            {row.city ? (
              <Text style={styles.sub} numberOfLines={1} {...textScale.dense}>
                {row.city}
              </Text>
            ) : null}
          </View>
        ) : metric === "step" || metric === "beauty" || metric === "season" ? (
          <View style={styles.devLine}>
            {row.step_title ? (
              <View style={styles.tierPill}>
                <Ionicons name="trending-up" size={10} color={colors.brandAccent} />
                <Text style={styles.tierText} numberOfLines={1} {...textScale.badge}>
                  {(metric === "beauty" || metric === "season") && row.step_label ? `${row.step_label} · ${row.step_title}` : row.step_title}
                </Text>
              </View>
            ) : null}
            {row.city ? (
              <Text style={styles.sub} numberOfLines={1} {...textScale.dense}>
                {row.city}
              </Text>
            ) : null}
          </View>
        ) : metric === "dev" ? (
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
          {metric === "el" || metric === "transfer" ? (
            <ElCoin size={14} />
          ) : (
            <Ionicons
              name={metric === "dev" || metric === "step" ? "trending-up" : metric === "beauty" ? "sparkles" : metric === "season" ? "calendar" : "star"}
              size={13}
              color={metric === "dev" || metric === "step" || metric === "beauty" || metric === "season" ? colors.brandAccent : colors.star}
            />
          )}
          <Text style={styles.value} {...textScale.badge}>
            {metric === "step" ? row.step_label ?? formatCount(value) : formatCount(value)}
          </Text>
        </View>
        <Text style={styles.unit} {...textScale.badge}>
          {UNIT[metric]}
        </Text>
      </View>
    </View>
  );
});

/* ───────────────────────── Ekran ───────────────────────── */

export default function ClubCityLeaderboardScreen() {
  const auth = useAuth();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>(() => (TABS.some((t) => t.key === params.tab) ? (params.tab as Tab) : "step"));
  const [scope, setScope] = useState<Scope>("all");
  const [weekPeriod, setWeekPeriod] = useState<PeriodValue>({ period: "week" });
  const [totalPeriod, setTotalPeriod] = useState<PeriodValue>({ period: "alltime" });
  const [elPeriod, setElPeriod] = useState<PeriodValue>({ period: "week" });
  const [transferPeriod, setTransferPeriod] = useState<PeriodValue>({ period: "week" });
  const listRef = useRef<FlatList<CityLeaderRow>>(null);

  const pv = tab === "week" ? weekPeriod : tab === "el" ? elPeriod : tab === "transfer" ? transferPeriod : totalPeriod;
  const setPv = tab === "week" ? setWeekPeriod : tab === "el" ? setElPeriod : tab === "transfer" ? setTransferPeriod : setTotalPeriod;
  const req = boardRequest(tab, pv);
  const metric = req.metric;

  /** "Takımım" yalnız Sezon sekmesinde; diğerlerinde Türkiye sayılır. */
  const effScope: Scope = scope === "team" && tab !== "season" ? "all" : scope;
  const fetchPage = useCallback(
    (offset: number) =>
      getCityLeaderboard(effScope === "team" ? "all" : effScope, { ...req, ...(effScope === "team" ? { team: true } : {}), limit: BOARD_PAGE_SIZE, offset }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [effScope, metric, req.period, req.from, req.to]
  );

  const { query, rows, first, loadMore } = useBoardPages({
    queryKey: cityKeys.leaderboard(effScope, metric, req.period ?? null, req.from ?? null, req.to ?? null),
    enabled: Boolean(auth.user) && tab !== "team",
    fetchPage,
    rowsOf,
    keyOf,
  });

  /**
   * Eski sunucu `metric`'i tanımıyor: yanıtta `metric` yok ya da başka bir
   * tablo (gelişim) geliyor. Yanlış etiketli liste yerine "yakında" çizilir.
   */
  const unsupported =
    metric !== "dev" &&
    ((first != null && first.metric !== metric) ||
      (query.isError && rows.length === 0 && (metric === "step" || metric === "beauty" || metric === "el" || metric === "transfer" || metric === "season") && query.error instanceof ApiError && query.error.status === 400));
  /** Faz 5 · Sezon: sezon öncesi ve takımı olmayan üye (team=1). */
  const preseason = metric === "season" && !unsupported && first != null && !first.season ? first.preseason ?? { text: "Sezon yakında başlıyor.", starts_at: "" } : null;
  const noTeam = metric === "season" && effScope === "team" && first != null && first.team === null;

  const meRow = useMemo(() => rows.find((row) => row.me) ?? null, [rows]);
  const meIndex = meRow ? rows.indexOf(meRow) : -1;
  const meRank = first?.me?.rank ?? meRow?.rank ?? null;
  const meValue =
    metric === "season"
      ? first?.me?.season_score ?? meRow?.season_score ?? null
      : metric === "transfer"
      ? first?.me?.transfer ?? meRow?.transfer ?? null
      : metric === "el"
      ? first?.me?.el ?? meRow?.el ?? null
      : metric === "step"
      ? first?.me?.step ?? meRow?.step ?? null
      : metric === "beauty"
        ? first?.me?.beauty ?? meRow?.beauty ?? null
        : metric === "dev"
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
      ...(tab === "season" ? [{ key: "team" as const, label: "Takımım" }] : []),
    ],
    [auth.user?.city, tab]
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
  const caption =
    tab === "season" ? (first?.season ? `${first.season.title} · ${first.season.name}${effScope === "team" && first.team ? ` · ${first.team.name}` : ""}` : "sezon puanı") : tab === "step" ? "kariyer merdiveni" : tab === "beauty" ? "şehrin güzelliği" : tab === "el" ? `kazanılan EL · ${periodCaption(pv)}` : tab === "transfer" ? `transfer geliri · ${periodCaption(pv)}` : tab === "dev" ? "şu anki gelişim" : metric === "stars" ? "tüm zamanlar" : periodCaption(pv);
  const showPinned =
    tab !== "team" && !preseason && !noTeam && !unsupported && !query.isLoading && !visibility.visible && (meRank != null || meRow != null) && rows.length > 0;

  const header = (
    <View style={styles.listHeader}>
      {!STATIC_TABS.has(tab) ? <PeriodBar value={pv} onChange={setPv} /> : null}
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
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsScroll} style={styles.tabsRow}>
              <SegmentedControl items={TABS} value={tab} onChange={setTab} size="sm" stretch={false} style={styles.tabs} />
            </ScrollView>
            {tab !== "team" ? <SegmentedControl items={scopeItems} value={effScope} onChange={setScope} stretch size="sm" /> : null}
          </View>
        }
      />
      {tab === "team" ? (
        <TeamBoard enabled={Boolean(auth.user)} />
      ) : query.isLoading ? (
        <View style={styles.pad}>
          {header}
          <SkeletonListRow count={8} avatar />
        </View>
      ) : query.isError && rows.length === 0 && !unsupported ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : (
        <FlatList
          ref={listRef}
          data={unsupported || preseason || noTeam ? [] : rows}
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
            preseason ? (
              <EmptyState icon="calendar-outline" title={preseason.text} body="Sezon başlayınca şehrini geliştirdikçe, EL kazandıkça ve sahada oynadıkça sezon puanın birikir." variant="inline" />
            ) : noTeam ? (
              <EmptyState icon="people-outline" title="Takımın yok" body="Oyuncu kartın bir takıma bağlı olduğunda takım arkadaşlarınla sezon sıralaması burada çıkar." variant="inline" action={{ label: "Türkiye", onPress: () => setScope("all"), haptic: "light" }} />
            ) : unsupported ? (
              <EmptyState
                icon={tab === "season" ? "calendar-outline" : tab === "step" || tab === "beauty" ? "trending-up-outline" : tab === "el" ? "wallet-outline" : tab === "transfer" ? "swap-horizontal-outline" : "star-outline"}
                title={tab === "season" ? "Sezon tablosu yakında" : tab === "step" ? "Lig tablosu yakında" : tab === "beauty" ? "Güzellik tablosu yakında" : tab === "el" ? "Elit Lira tablosu yakında" : tab === "transfer" ? "Transfer tablosu yakında" : "Yıldız tablosu yakında"}
                body={
                  tab === "step" || tab === "beauty" || tab === "el" || tab === "transfer" || tab === "season"
                    ? "Kulüp Şehri 2.0 sıralamaları sunucu güncellemesiyle açılacak. Şimdilik Gelişim tablosuna bakabilirsin."
                    : "Dönemlik ve toplam yıldız sıralaması sunucu güncellemesiyle açılacak. Şimdilik Gelişim tablosuna bakabilirsin."
                }
                variant="inline"
                action={{ label: "Gelişim", onPress: () => setTab("dev"), haptic: "light" }}
              />
            ) : (
              <EmptyState
                icon={tab === "season" ? "calendar-outline" : tab === "transfer" ? "swap-horizontal-outline" : tab === "el" ? "wallet-outline" : tab === "beauty" ? "sparkles-outline" : tab === "dev" || tab === "step" ? "business-outline" : "star-outline"}
                title={tab === "season" ? "Bu sezonda henüz puan yok" : tab === "transfer" ? "Bu dönemde transfer yok" : tab === "el" ? "Bu dönemde EL kazanılmadı" : tab === "beauty" ? "Henüz güzel şehir yok" : tab === "dev" || tab === "step" ? "Henüz şehir yok" : "Bu dönemde yıldız yok"}
                body={
                  tab === "season"
                    ? "Şehrini geliştir, maçlarını oyna; sezon tablosuna ilk sen gir."
                    : tab === "transfer"
                    ? "Akademinden bir oyuncu sat, tabloya ilk sen gir."
                    : tab === "el"
                    ? "Binalarının depolarını topla, tabloya ilk sen gir."
                    : tab === "beauty"
                    ? "Meydanına ilk sembol yapıyı sen yerleştir."
                    : tab === "dev" || tab === "step"
                      ? "İlk binayı sen kur."
                      : "Bulmaca ve oyunlardan yıldız topla, tabloya ilk sen gir."
                }
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
          unit={UNIT[metric]}
          caption={caption}
          onPress={meIndex >= 0 ? jumpToMe : undefined}
        />
      ) : null}
    </SafeAreaView>
  );
}

/* ───────────────────────── Faz 5 · Takımlar ───────────────────────── */

const teamRowsOf = (page: CityTeamBoard) => page.items ?? [];
const teamKeyOf = (row: CityTeamRow) => row.team_id;

const TeamBoardRow = React.memo(function TeamBoardRow({ row }: { row: CityTeamRow }) {
  return (
    <View style={[styles.row, row.me ? styles.rowMe : null]}>
      <RankBadge rank={row.rank} mine={row.me} />
      <TeamTile size={36} level={row.level} />
      <View style={styles.texts}>
        <Text style={styles.name} numberOfLines={1} {...textScale.dense}>
          {row.me ? `${row.name} (takımın)` : row.name}
        </Text>
        <View style={styles.devLine}>
          <View style={styles.tierPill}>
            <Ionicons name="business" size={10} color={colors.brandAccent} />
            <Text style={styles.tierText} numberOfLines={1} {...textScale.badge}>
              {`${row.level}. seviye${row.stage_title ? ` · ${row.stage_title}` : ""}`}
            </Text>
          </View>
          <Text style={styles.sub} numberOfLines={1} {...textScale.dense}>
            {`${formatCount(row.contributors)} bağışçı`}
          </Text>
        </View>
      </View>
      <View style={styles.valueBox}>
        <View style={styles.valueLine}>
          <Ionicons name="heart" size={12} color={colors.brandAccent} />
          <Text style={styles.value} {...textScale.badge}>
            {formatCount(row.points)}
          </Text>
        </View>
        <Text style={styles.unit} {...textScale.badge}>
          puan
        </Text>
      </View>
    </View>
  );
});

/** Takım tesisleri tablosu (önce seviye, sonra toplam puan). Eski sunucu → "yakında". */
function TeamBoard({ enabled }: { enabled: boolean }) {
  const fetchPage = useCallback((offset: number) => getCityTeamBoard({ limit: BOARD_PAGE_SIZE, offset }), []);
  const { query, rows, first, loadMore } = useBoardPages({ queryKey: cityKeys.leaderboard("all", "team"), enabled, fetchPage, rowsOf: teamRowsOf, keyOf: teamKeyOf });
  const refresh = useRefresh(query.refetch, { refreshing: query.isRefetching && !query.isFetchingNextPage });
  const unsupported = (first != null && first.metric !== "team") || (query.isError && query.error instanceof ApiError && query.error.status === 400);
  const me = first?.me ?? null;
  const renderItem = useCallback(({ item }: { item: CityTeamRow }) => <TeamBoardRow row={item} />, []);
  if (query.isLoading) {
    return (
      <View style={styles.pad}>
        <SkeletonListRow count={8} avatar />
      </View>
    );
  }
  if (query.isError && !unsupported) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  return (
    <FlatList
      data={unsupported ? [] : rows}
      keyExtractor={(row) => String(row.team_id)}
      renderItem={renderItem}
      contentContainerStyle={styles.list}
      ListHeaderComponent={
        <View style={styles.listHeader}>
          {rows.length > 0 && !unsupported ? (
            <View style={styles.metaLine}>
              <Ionicons name="people-outline" size={14} color={colors.textTertiary} />
              <Text style={styles.metaText} numberOfLines={1} {...textScale.dense}>
                {`${formatCount(first?.total ?? rows.length)} takım · önce seviye, sonra bağış puanı${me && !rows.some((r) => r.me) ? ` · takımın ${me.rank}.` : ""}`}
              </Text>
            </View>
          ) : null}
        </View>
      }
      ListFooterComponent={unsupported ? null : <BoardFooter loading={query.isFetchingNextPage} done={!query.hasNextPage} count={rows.length} total={first?.total ?? null} noun="takım" />}
      ListEmptyComponent={
        unsupported ? (
          <EmptyState icon="people-outline" title="Takım tablosu yakında" body="Takım tesisleri sıralaması sunucu güncellemesiyle açılacak." variant="inline" />
        ) : (
          <EmptyState icon="people-outline" title="Henüz takım tesisi yok" body="Takımının tesisine ilk bağışı yap, tabloya takımınla gir." variant="inline" />
        )
      }
      onEndReached={loadMore}
      onEndReachedThreshold={0.6}
      refreshControl={<RefreshControl {...refreshControlProps(refresh.refreshing, refresh.onRefresh)} />}
      showsVerticalScrollIndicator={false}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  filters: { paddingHorizontal: layout.screenPadding, paddingBottom: space.sm, gap: space.sm },
  tabsRow: { marginHorizontal: -layout.screenPadding, flexGrow: 0 },
  tabsScroll: { paddingHorizontal: layout.screenPadding, flexGrow: 1 },
  tabs: { flexShrink: 0, minWidth: "100%" },
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
  name: { ...type.h4, fontFamily: fonts.semibold, color: colors.textPrimary, flexShrink: 1 },
  nameLine: { flexDirection: "row", alignItems: "center", gap: space.xs },
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
