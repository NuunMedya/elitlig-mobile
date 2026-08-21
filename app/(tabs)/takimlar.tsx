/**
 * TAKIMLAR — seçili kapsamdaki (şehir → lig → sezon) bütün takımlar.
 *
 * NEDEN AYRI SEKME: takım, uygulamanın birinci sınıf varlığıdır — kadro,
 * fikstür, kasa, maç talebi hep bir takıma asılıdır. Eski düzende takıma
 * ulaşmanın tek yolu Ligler > Puan segmentindeki tablo satırıydı: kullanıcı
 * "Yıldızspor'un kadrosuna bakayım" derken önce doğru sekmeyi, sonra doğru
 * segmenti, sonra tablodaki satırı bulmak zorundaydı.
 *
 * İKİ GÖRÜNÜM, TEK VERİ: her ikisi de aynı `getStandings` yanıtından çizilir,
 * ikinci bir istek yoktur.
 *   · Kart — amblem, sıra rozeti, form ve puan. Takımı TANIMAK için.
 *   · Tablo — O·G·B·M·AV·P sütunlarıyla klasik puan durumu. KARŞILAŞTIRMAK için.
 * Görünüm seçimi cihazda saklanmaz: iki görünüm de aynı listeyi gösterdiği
 * için "hangi moddaydım" diye hatırlanacak bir bağlam yok; varsayılan karttır.
 *
 * ARAMA: liste 20 satırı geçtiğinde ad araması görünür. Küçük liglerde arama
 * kutusu göstermek 44px'i boşa harcar.
 *
 * PERFORMANS: iki görünümün de satır yüksekliği sabittir (kart 64, tablo 40)
 * ve `getItemLayout` kurulur; FlatList hiçbir hücreyi ölçmez.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ScopeChip } from "@/components/ScopeChip";
import {
  EmptyState,
  ErrorState,
  FormChips,
  Input,
  ScreenHeader,
  SegmentedControl,
  SkeletonStandings,
  TeamLogo,
  Touchable,
  refreshControlProps,
  useHeaderScroll,
  useRefresh,
  type SegmentedItem,
} from "@/components/ui";
import { getStandings } from "@/lib/api/standings";
import { queryKeys } from "@/lib/queryKeys";
import type { StandingRow } from "@/lib/types";
import { useFavorite } from "@/providers/FavoriteProvider";
import { useScope } from "@/providers/ScopeProvider";
import {
  colors,
  defaultZoneRules,
  hairline,
  layout,
  palette,
  radius,
  space,
  textScale,
  type,
  upperTR,
  zoneColor,
  zoneForRank,
} from "@/theme";

type ViewKey = "kart" | "tablo";

const VIEWS: SegmentedItem<ViewKey>[] = [
  { key: "kart", label: "Takımlar", icon: "shield-outline" },
  { key: "tablo", label: "Puan Tablosu", icon: "list-outline" },
];

/** Arama kutusu bu eşiğin altındaki listelerde gösterilmez. */
const SEARCH_THRESHOLD = 20;

const CARD_HEIGHT = 64;
const TABLE_ROW_HEIGHT = 40;

/** Türkçe duyarlı, aksan/büyük-küçük farkını yok sayan arama karşılaştırması. */
const normalize = (value: string) => value.trim().toLocaleLowerCase("tr-TR");

/* ══════════════════════════════════════════════════════════════════════════
   Satır bileşenleri — ikisi de memo'lu ve yalnız ilkel prop alır
   ══════════════════════════════════════════════════════════════════════════ */

interface RowProps {
  rank: number;
  teamId: number;
  teamName: string;
  logo: string | null;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalDiff: number;
  points: number;
  last5: string;
  favorite: boolean;
  zone: string | null;
  onPress: (teamId: number) => void;
}

const TeamCard = React.memo(function TeamCard({
  rank,
  teamId,
  teamName,
  logo,
  played,
  goalDiff,
  points,
  last5,
  favorite,
  zone,
  onPress,
}: RowProps) {
  const handlePress = useCallback(() => onPress(teamId), [onPress, teamId]);

  return (
    <Touchable style={styles.card} onPress={handlePress} feedback="row" haptic="selection">
      {/* Sıra rozeti: bölge rengi çerçevede, rakam nötr. Rakamı da renklendirmek
          zeminle birlikte iki sinyal üretir ve tabloyu alacalı gösterir. */}
      <View style={[styles.rankBox, zone ? { borderColor: zone } : null]}>
        <Text style={styles.rankText} {...textScale.dense}>
          {rank}
        </Text>
      </View>

      <TeamLogo name={teamName} logo={logo} size={layout.crestLg} />

      <View style={styles.cardBody}>
        <View style={styles.cardTitleRow}>
          <Text style={styles.cardTitle} numberOfLines={1} {...textScale.dense}>
            {teamName}
          </Text>
          {favorite ? <Ionicons name="star" size={11} color={colors.star} /> : null}
        </View>
        <View style={styles.cardMetaRow}>
          {last5 ? <FormChips form={last5} size="xs" /> : null}
          <Text style={styles.cardMeta} numberOfLines={1} {...textScale.dense}>
            {played} maç · AV {goalDiff > 0 ? `+${goalDiff}` : goalDiff}
          </Text>
        </View>
      </View>

      <View style={styles.pointsBox}>
        <Text style={styles.pointsValue} {...textScale.dense}>
          {points}
        </Text>
        <Text style={styles.pointsLabel} {...textScale.badge}>
          PUAN
        </Text>
      </View>
    </Touchable>
  );
});

const TableRow = React.memo(function TableRow({
  rank,
  teamId,
  teamName,
  logo,
  played,
  wins,
  draws,
  losses,
  goalDiff,
  points,
  favorite,
  zone,
  onPress,
}: RowProps) {
  const handlePress = useCallback(() => onPress(teamId), [onPress, teamId]);

  return (
    <Touchable style={styles.tableRow} onPress={handlePress} feedback="row" haptic="selection">
      <View style={[styles.zoneRail, zone ? { backgroundColor: zone } : null]} />
      <Text style={styles.tRank} {...textScale.dense}>
        {rank}
      </Text>
      <TeamLogo name={teamName} logo={logo} size={layout.crestSm} />
      <Text
        style={[styles.tName, favorite ? styles.tNameFav : null]}
        numberOfLines={1}
        {...textScale.dense}
      >
        {teamName}
      </Text>
      <Text style={styles.tNum} {...textScale.dense}>{played}</Text>
      <Text style={styles.tNum} {...textScale.dense}>{wins}</Text>
      <Text style={styles.tNum} {...textScale.dense}>{draws}</Text>
      <Text style={styles.tNum} {...textScale.dense}>{losses}</Text>
      <Text
        style={[
          styles.tNum,
          styles.tNumWide,
          goalDiff > 0 ? styles.tPos : goalDiff < 0 ? styles.tNeg : null,
        ]}
        {...textScale.dense}
      >
        {goalDiff > 0 ? `+${goalDiff}` : goalDiff}
      </Text>
      <Text style={[styles.tNum, styles.tPoints]} {...textScale.dense}>
        {points}
      </Text>
    </Touchable>
  );
});

/** Tablo başlığı — sütun genişlikleri satırla BİREBİR aynı olmak zorunda. */
const TableHead = React.memo(function TableHead() {
  return (
    <View style={styles.tableHead}>
      <View style={styles.zoneRail} />
      <Text style={styles.tRank} {...textScale.badge}>#</Text>
      <View style={{ width: layout.crestSm }} />
      <Text style={[styles.tName, styles.headLabel]} {...textScale.badge}>
        {upperTR("Takım")}
      </Text>
      <Text style={[styles.tNum, styles.headLabel]} {...textScale.badge}>O</Text>
      <Text style={[styles.tNum, styles.headLabel]} {...textScale.badge}>G</Text>
      <Text style={[styles.tNum, styles.headLabel]} {...textScale.badge}>B</Text>
      <Text style={[styles.tNum, styles.headLabel]} {...textScale.badge}>M</Text>
      <Text style={[styles.tNum, styles.tNumWide, styles.headLabel]} {...textScale.badge}>AV</Text>
      <Text style={[styles.tNum, styles.headLabel]} {...textScale.badge}>P</Text>
    </View>
  );
});

/* ══════════════════════════════════════════════════════════════════════════
   Ekran
   ══════════════════════════════════════════════════════════════════════════ */

const keyExtractor = (item: StandingRow) => String(item.team_id);

export default function TeamsScreen() {
  const scope = useScope();
  const router = useRouter();
  const { isFavorite } = useFavorite();
  const { scrollY, scrollProps } = useHeaderScroll();

  const [view, setView] = useState<ViewKey>("kart");
  const [search, setSearch] = useState("");

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

  const rows = useMemo(() => query.data ?? [], [query.data]);
  const zoneRules = useMemo(() => defaultZoneRules(rows.length), [rows.length]);

  /* SIRA NUMARASI SÜZMEDEN ÖNCE HESAPLANIR: arama sonucundaki takımın gerçek
     lig sırası görünmeli. Süzülmüş dizinin indeksi kullanılsaydı "Yıldızspor"
     araması onu 1. sırada gösterirdi. */
  const ranked = useMemo(
    () => rows.map((row, index) => ({ row, rank: index + 1 })),
    [rows],
  );

  const visible = useMemo(() => {
    const term = normalize(search);
    if (!term) return ranked;
    return ranked.filter((entry) => normalize(entry.row.team_name).includes(term));
  }, [ranked, search]);

  const openTeam = useCallback((teamId: number) => router.push(`/takim/${teamId}`), [router]);

  const rankOf = useMemo(() => {
    const map = new Map<number, number>();
    ranked.forEach((entry) => map.set(entry.row.team_id, entry.rank));
    return map;
  }, [ranked]);

  const renderItem = useCallback(
    ({ item }: { item: StandingRow }) => {
      const rank = rankOf.get(item.team_id) ?? 0;
      const Row = view === "kart" ? TeamCard : TableRow;
      return (
        <Row
          rank={rank}
          teamId={item.team_id}
          teamName={item.team_name}
          logo={item.logo}
          played={item.played}
          wins={item.wins}
          draws={item.draws}
          losses={item.losses}
          goalDiff={Number(item.goal_diff ?? 0)}
          points={item.display_points}
          last5={item.last5 ?? ""}
          favorite={isFavorite(item.team_id)}
          zone={zoneColor(palette, zoneForRank(rank, zoneRules))}
          onPress={openTeam}
        />
      );
    },
    [isFavorite, openTeam, rankOf, view, zoneRules],
  );

  const rowHeight = view === "kart" ? CARD_HEIGHT : TABLE_ROW_HEIGHT;
  const getItemLayout = useCallback(
    (_: unknown, index: number) => ({
      length: rowHeight,
      offset: rowHeight * index,
      index,
    }),
    [rowHeight],
  );

  const data = useMemo(() => visible.map((entry) => entry.row), [visible]);
  const showSearch = ranked.length >= SEARCH_THRESHOLD;

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader
        title="Takımlar"
        overline={scope.leagueLabel || "ELİTLİG"}
        scrollY={scrollY}
        actions={[
          { icon: "search-outline", accessibilityLabel: "Ara", onPress: () => router.push("/ara") },
        ]}
        bottom={
          <View style={styles.headerBottom}>
            <ScopeChip />
            <SegmentedControl items={VIEWS} value={view} onChange={setView} size="sm" />
          </View>
        }
      />

      {!scope.ready && !scope.loading ? (
        <EmptyState
          icon="options-outline"
          title="Lig seçilmedi"
          body="Şehir, lig ve sezon seçince takımlar listelenir."
          action={{ label: "Kapsam seç", onPress: () => scope.openScopeSheet("city") }}
        />
      ) : query.isLoading || scope.loading ? (
        <SkeletonStandings />
      ) : query.isError && rows.length === 0 ? (
        <ErrorState error={query.error} onRetry={query.refetch} />
      ) : (
        <FlatList
          {...scrollProps}
          data={data}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          getItemLayout={getItemLayout}
          initialNumToRender={14}
          windowSize={8}
          removeClippedSubviews
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl {...refreshControlProps(refresh.refreshing, refresh.onRefresh)} />
          }
          ListHeaderComponent={
            <>
              {showSearch ? (
                <View style={styles.searchBox}>
                  <Input
                    value={search}
                    onChangeText={setSearch}
                    placeholder="Takım ara"
                    leadingIcon="search-outline"
                    variant="search"
                    size="sm"
                  />
                </View>
              ) : null}
              {view === "tablo" ? <TableHead /> : null}
            </>
          }
          ListEmptyComponent={
            search ? (
              <EmptyState
                icon="search-outline"
                title="Takım bulunamadı"
                body={`"${search}" ile eşleşen takım yok.`}
                action={{ label: "Aramayı temizle", onPress: () => setSearch("") }}
              />
            ) : (
              <EmptyState
                icon="shield-outline"
                title="Takım yok"
                body="Bu ligde henüz takım kaydı görünmüyor."
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
    gap: space.sm,
    paddingHorizontal: layout.screenPadding,
    paddingBottom: space.sm,
  },
  listContent: {
    paddingBottom: space.xxxl,
  },
  searchBox: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.sm,
    paddingBottom: space.m,
  },

  /* — Kart görünümü — */
  card: {
    height: CARD_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    gap: space.m,
    paddingHorizontal: layout.screenPadding,
    borderBottomWidth: hairline,
    borderBottomColor: colors.separator,
  },
  rankBox: {
    width: 24,
    height: 24,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  rankText: {
    ...type.tableNumStrong,
    color: colors.textSecondary,
  },
  cardBody: {
    flex: 1,
    gap: 3,
  },
  cardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
  },
  cardTitle: {
    ...type.h3,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  cardMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.s,
  },
  cardMeta: {
    ...type.caption,
    color: colors.textTertiary,
    flexShrink: 1,
  },
  pointsBox: {
    alignItems: "flex-end",
    minWidth: 34,
  },
  pointsValue: {
    ...type.metricSm,
    color: colors.textPrimary,
  },
  pointsLabel: {
    ...type.overline,
    color: colors.textDisabled,
  },

  /* — Tablo görünümü —
     Sütun genişlikleri TableHead ile birebir aynı olmalı; aksi hâlde başlık
     rakamların üstüne oturmaz ve tablo okunmaz hâle gelir. */
  tableHead: {
    height: 28,
    flexDirection: "row",
    alignItems: "center",
    gap: space.s,
    paddingRight: layout.screenPadding,
    backgroundColor: colors.surface3,
    borderBottomWidth: hairline,
    borderBottomColor: colors.border,
  },
  headLabel: {
    ...type.overline,
    color: colors.textTertiary,
  },
  tableRow: {
    height: TABLE_ROW_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    gap: space.s,
    paddingRight: layout.screenPadding,
    borderBottomWidth: hairline,
    borderBottomColor: colors.separator,
  },
  /** Bölge rayı: satırın en solunda 3px dikey renk şeridi. */
  zoneRail: {
    width: 3,
    alignSelf: "stretch",
    marginRight: space.s,
    backgroundColor: "transparent",
  },
  tRank: {
    ...type.tableNum,
    color: colors.textTertiary,
    width: 18,
    textAlign: "center",
  },
  tName: {
    ...type.bodySm,
    color: colors.textPrimary,
    flex: 1,
  },
  tNameFav: {
    color: colors.brandAccent,
  },
  tNum: {
    ...type.tableNum,
    color: colors.textSecondary,
    width: 20,
    textAlign: "center",
  },
  tNumWide: {
    width: 28,
  },
  tPos: {
    color: colors.win,
  },
  tNeg: {
    color: colors.loss,
  },
  tPoints: {
    ...type.tableNumStrong,
    color: colors.textPrimary,
    width: 24,
  },
});
