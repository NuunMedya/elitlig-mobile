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
 * KAPSAM BLOĞUN ÜST BAŞLIĞINDA: "Ankara · FREELİG · 15. Sezon" mor bloğun
 * içinde, başlığın üstünde, dokunulur bir çip (`ScopeChip tone="ink"`).
 * Eskiden aynı bilgi hem bloğun üst başlığında hem kâğıtta ayrı bir satırda
 * yazılıyordu; ikinci satır 28px yiyip hiçbir şey eklemiyordu.
 *
 * SATIRLAR KART İÇİNDE (tema.html §5.3 ".group"): liste kâğıtta çıplak
 * yüzmez; sütun başlığı kartın tepesi, son satır kartın tabanıdır ve satırlar
 * arasında ince ayraç vardır. FlatList satırları tek tek ürettiği için kart
 * tek bir kap olarak değil satır satır çizilir (bkz. `styles.groupRow`).
 * Bölge rayı böylece kartın sol iç kenarında durur — Ligler > Puan ile aynı x.
 *
 * ARAMA: liste 20 satırı geçtiğinde ad araması görünür. Küçük liglerde arama
 * kutusu göstermek 44px'i boşa harcar.
 *
 * PERFORMANS: iki görünümün de satır yüksekliği sabittir (`TEAM_ROW_HEIGHT`
 * 66, `TEAM_ROW_HEIGHT_TABLE` 40; ayraç `hairline` hücreye dâhil) ve
 * `getItemLayout` kurulur; FlatList hiçbir hücreyi ölçmez.
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
  hairline,
  layout,
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
   Bölge açıklaması — rayın renk anahtarı
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Ray renginin anahtarı, listenin ALTINDA tek satır (tema.html §7/3). Renk
 * tek başına anlam taşımaz; "altın = şampiyon" bir yerde yazılmalı ve o yer
 * tablonun sonudur — başta dursaydı daha tek satır okunmadan açıklama
 * okutulmuş olurdu. Yalnız kuralda geçen bölgeler yazılır.
 */
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
          <View style={[styles.legendSwatch, { backgroundColor: zoneColor(palette, zone) ?? colors.border }]} />
          <Text style={styles.legendLabel} {...textScale.dense}>
            {zoneLabel(zone)}
          </Text>
        </View>
      ))}
    </View>
  );
});

/** Satırlar arası ince ayraç; kartın yan kenarlığını da taşır ki çizgi kesilmesin. */
const GroupSeparator = () => <View style={styles.separator} />;

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

  const data = useMemo(() => visible.map((entry) => entry.row), [visible]);
  const lastIndex = data.length - 1;

  const renderItem = useCallback(
    ({ item, index }: { item: StandingRow; index: number }) => {
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
          /* Son satır kartın tabanıdır: alt kenarlık ve alt köşeler onda. */
          style={index === lastIndex ? styles.groupRowLast : styles.groupRow}
        />
      );
    },
    [isFavorite, lastIndex, openTeam, rankOf, view, zoneRules],
  );

  /* Hücre = satır + ayraç: VirtualizedList ayracı satırla aynı hücreye koyar. */
  const cellHeight = (view === "kart" ? TEAM_ROW_HEIGHT : TEAM_ROW_HEIGHT_TABLE) + hairline;
  const getItemLayout = useCallback(
    (_: unknown, index: number) => ({
      length: cellHeight,
      offset: cellHeight * index,
      index,
    }),
    [cellHeight],
  );

  const showSearch = ranked.length >= SEARCH_THRESHOLD;

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader
        title="Takımlar"
        scope={<ScopeChip tone="ink" />}
        scrollY={scrollY}
        actions={[
          { icon: "search-outline", accessibilityLabel: "Ara", onPress: () => router.push("/ara") },
        ]}
        bottom={
          /* Görünüm segmenti KÂĞITTA (tema kuralı: sekme blokta, süzgeç
             kâğıtta). Kapsam artık bloğun üst başlığında; burada bir kez daha
             yazılmaz. */
          <View style={styles.headerBottom}>
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
        /* İskelet de kartta durur; yükleme bitince çerçeve zıplamaz. */
        <View style={styles.skeletonCard}>
          <SkeletonStandings density={view === "tablo" ? "table" : "list"} />
        </View>
      ) : query.isError && rows.length === 0 ? (
        <ErrorState error={query.error} onRetry={query.refetch} />
      ) : (
        <FlatList
          {...scrollProps}
          data={data}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          getItemLayout={getItemLayout}
          ItemSeparatorComponent={GroupSeparator}
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
              {/* Sütun başlığı kartın TEPESİDİR: üst kenarlık ve üst köşeler onda. */}
              {data.length > 0 ? (
                <View style={[styles.groupHead, view === "kart" ? styles.groupHeadList : null]}>
                  <TeamRowHead density={view === "tablo" ? "table" : "list"} />
                </View>
              ) : null}
            </>
          }
          ListFooterComponent={data.length > 0 ? <ZoneLegend rules={zoneRules} /> : null}
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

/* Kartın kabuğu: satır satır çizilir (bkz. dosya başlığı). */
const GROUP_SHELL = {
  backgroundColor: colors.surface1,
  borderColor: colors.border,
} as const;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  /* Segmentin mor bloğa ve karta uzaklığı maketle aynı (12px, §7/3 ".seg"). */
  headerBottom: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.md,
    paddingBottom: space.md,
  },
  listContent: {
    paddingHorizontal: layout.screenPadding,
    paddingBottom: space.xxxl,
  },
  searchBox: {
    paddingBottom: space.m,
  },

  /* — Satır grubu (tema.html ".group") — */
  groupHead: {
    ...GROUP_SHELL,
    borderWidth: hairline,
    borderBottomWidth: 0,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    overflow: "hidden",
  },
  /* Liste başlığının kendi üst dolgusu ve alt çizgisi yok; kart tepesinde
     ikisi de gerekir (tablo başlığı bunları zaten taşır). */
  groupHeadList: {
    paddingTop: space.s,
    borderBottomWidth: hairline,
    borderBottomColor: colors.separator,
  },
  groupRow: {
    ...GROUP_SHELL,
    borderLeftWidth: hairline,
    borderRightWidth: hairline,
  },
  groupRowLast: {
    ...GROUP_SHELL,
    borderLeftWidth: hairline,
    borderRightWidth: hairline,
    borderBottomWidth: hairline,
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
    overflow: "hidden",
  },
  separator: {
    height: hairline,
    backgroundColor: colors.separator,
    borderLeftWidth: hairline,
    borderRightWidth: hairline,
    borderColor: colors.border,
  },
  skeletonCard: {
    marginHorizontal: layout.screenPadding,
    borderWidth: hairline,
    borderColor: colors.border,
    borderRadius: radius.lg,
    overflow: "hidden",
  },

  /* — Bölge açıklaması — */
  legend: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.md,
    paddingVertical: space.m,
    paddingHorizontal: space.xxs,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
  },
  legendSwatch: {
    width: 3,
    height: 11,
    borderRadius: 2,
  },
  legendLabel: {
    ...type.caption,
    color: colors.textTertiary,
  },
});
