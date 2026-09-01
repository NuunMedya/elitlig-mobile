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
 * PERFORMANS: iki görünümün de satır yüksekliği sabittir (`TEAM_ROW_HEIGHT`
 * 66, `TEAM_ROW_HEIGHT_TABLE` 40) ve `getItemLayout` kurulur; FlatList hiçbir
 * hücreyi ölçmez.
 *
 * SATIRIN KENDİSİ BU DOSYADA DEĞİL: iki görünüm de `components/ui/TeamRow`
 * bileşenini kullanır — takım satırı uygulamanın her yerinde aynı sırayı
 * taşır (sıra · amblem · ad + bağlam · sayı), yalnız yoğunluğu değişir.
 */

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ScopeChip } from "@/components/ScopeChip";
import {
  EmptyState,
  ErrorState,
  Input,
  ScreenHeader,
  SegmentedControl,
  SkeletonStandings,
  TeamRow,
  TeamRowHead,
  TEAM_ROW_HEIGHT,
  TEAM_ROW_HEIGHT_TABLE,
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
  layout,
  palette,
  space,
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

/** Türkçe duyarlı, aksan/büyük-küçük farkını yok sayan arama karşılaştırması. */
const normalize = (value: string) => value.trim().toLocaleLowerCase("tr-TR");

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
      return (
        <TeamRow
          density={view === "kart" ? "list" : "table"}
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
          form={item.last5 ?? ""}
          favorite={isFavorite(item.team_id)}
          zone={zoneColor(palette, zoneForRank(rank, zoneRules))}
          onPress={openTeam}
        />
      );
    },
    [isFavorite, openTeam, rankOf, view, zoneRules],
  );

  const rowHeight = view === "kart" ? TEAM_ROW_HEIGHT : TEAM_ROW_HEIGHT_TABLE;
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
          /* Kapsam çipi ile segment AYNI SATIRDA DEĞİL: çip gerçek veriyle
             "Ankara · 1.Lig · 25/26" kadar uzayabiliyor ve yanındaki segmentin
             etiketlerini kırpıyordu ("Puan Ta…"). Alt alta iki satır 30px daha
             yer kaplar ama iki denetim de tam okunur kalır. */
          <View style={styles.headerBottom}>
            <View style={styles.scopeRow}>
              <ScopeChip />
            </View>
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
              <TeamRowHead density={view === "tablo" ? "table" : "list"} />
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
    gap: space.s,
    paddingHorizontal: layout.screenPadding,
    paddingBottom: space.sm,
  },
  scopeRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  listContent: {
    paddingBottom: space.xxxl,
  },
  searchBox: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.sm,
    paddingBottom: space.m,
  },
});
