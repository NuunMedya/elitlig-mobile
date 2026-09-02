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
 * arama boşken ve en az üç oyuncu varken görünür. Dizilim gerçek podyum gibi
 * 2 · 1 · 3'tür: birinci ORTADA ve büyük, ikinci solda, üçüncü sağda
 * (tema.html §7/4). Basamaklar kartsızdır — üç ayrı kart, üç ayrı "şey"
 * gibi okunuyordu; oysa podyum tek bir sahnedir.
 *
 * KAPSAM BLOĞUN ÜST BAŞLIĞINDA (`ScopeChip tone="ink"`): kâğıttaki ayrı
 * kapsam satırı kalktı; aynı bilgi iki kez yazılıyordu.
 *
 * LİSTE KART İÇİNDE (tema.html §5.4 ".group"): sütun başlığı kartın tepesi,
 * son satır tabanı, arada ince ayraç. FlatList satırları tek tek ürettiği
 * için kart satır satır çizilir; podyum ve arama kutusu kartın DIŞINDA kalır.
 *
 * PERFORMANS: satır yüksekliği sabit (60px + hairline ayraç) → `getItemLayout`.
 * Satır bileşeni memo'lu ve yalnız ilkel prop alır.
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

/**
 * Madalya rengi, basamağa göre (dizin = sıra − 1): altın · gümüş · bronz.
 * Altın, puan tablosundaki şampiyonluk rayıyla AYNI token — "birinci" iki
 * ekranda aynı renkle okunur. Gümüş nötr kayrak, bronz uyarı turuncusu.
 */
/* 3. madalya BRONZ: `warn` koyu temada (#FBBF24) altınla ayırt edilemiyordu;
   düşme play-off rayı iki temada da bronz-turuncu. */
const MEDAL = [colors.zoneChampion, colors.slate, colors.zoneRelegationPlayoff] as const;

/** Podyumdaki çizim sırası — sol, orta, sağ (0 tabanlı sıra dizini). */
const PODIUM_ORDER = [1, 0, 2] as const;

/** Avatar ölçüsü: birinci büyük (56), diğerleri 44 (tema.html §7/4). */
const PODIUM_AVATAR_FIRST = 56;
const PODIUM_AVATAR = 44;

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
      {PODIUM_ORDER.map((index) => {
        const player = players[index];
        const first = index === 0;
        return (
          <Touchable
            key={player.id}
            style={styles.podiumCell}
            onPress={() => onPress(player.id)}
            feedback="card"
            haptic="selection"
            accessibilityRole="button"
            accessibilityLabel={`${index + 1}. ${player.name}, ${metricOf(player)} ${unit}`}
          >
            {/* Madalya rozeti halkanın ALTINDA, ortada: sıra rakamı avatarla
                aynı düşey eksende durur, ayrı bir satır olarak yer yemez. */}
            <View style={styles.podiumAvatar}>
              <View style={[styles.podiumRing, { borderColor: MEDAL[index] }]}>
                <Avatar
                  name={player.name}
                  image={player.image ?? null}
                  size={first ? PODIUM_AVATAR_FIRST : PODIUM_AVATAR}
                />
              </View>
              <View style={[styles.podiumRankBadge, { backgroundColor: MEDAL[index] }]}>
                <Text style={styles.podiumRankText} {...textScale.badge}>
                  {index + 1}
                </Text>
              </View>
            </View>
            <Text
              style={first ? styles.podiumNameFirst : styles.podiumName}
              numberOfLines={1}
              {...textScale.dense}
            >
              {player.name}
            </Text>
            {/* Yalnız sayı: birim sütun başlığında bir kez yazılır. */}
            <Text
              style={first ? styles.podiumMetricFirst : styles.podiumMetric}
              numberOfLines={1}
              {...textScale.dense}
            >
              {metricOf(player)}
            </Text>
          </Touchable>
        );
      })}
    </View>
  );
});

/** Satırlar arası ince ayraç; kartın yan kenarlığını da taşır ki çizgi kesilmesin. */
const GroupSeparator = () => <View style={styles.separator} />;

/* ══════════════════════════════════════════════════════════════════════════
   Ekran
   ══════════════════════════════════════════════════════════════════════════ */

const keyExtractor = (item: PlayerRankRow) => String(item.id);
/* Hücre = satır + ayraç: VirtualizedList ayracı satırla aynı hücreye koyar. */
const CELL_HEIGHT = PLAYER_ROW_HEIGHT + hairline;
const getItemLayout = (_data: ArrayLike<PlayerRankRow> | null | undefined, index: number) => ({
  length: CELL_HEIGHT,
  offset: CELL_HEIGHT * index,
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

  /* Podyum çizildiyse ilk üç listeden düşülür; aksi hâlde aynı üç oyuncu
     ekranda iki kez görünür ve sıralama "1,2,3,1,2,3" gibi okunur. */
  const listData = useMemo(
    () => (showPodium ? rows.slice(3) : rows),
    [rows, showPodium],
  );
  const lastIndex = listData.length - 1;

  const renderItem = useCallback(
    ({ item, index }: { item: PlayerRankRow; index: number }) => (
      <PlayerRow
        playerId={item.id}
        rank={showPodium ? index + 4 : index + 1}
        name={item.name}
        image={item.image ?? null}
        /* META AKTİF ÖLÇÜTÜ TEKRAR ETMEZ: gol sıralamasındayken meta'da gol
           yazmaz — sağdaki sütun zaten onu söylüyor ve tekrar, satırı taşırıp
           oyuncu adını kırpan şeydi. */
        meta={[
          active.unit === "maç" ? null : `${num(item.matches)} maç`,
          active.unit === "gol" ? null : `${num(item.goals)} gol`,
          `${num(item.assists)} asist`,
          /* Takım adı SONDA: satır taşarsa kırpılan şey en uzun ve en az
             bilgi taşıyan parça olsun, "2 as…" değil. */
          item.teamName || "Takımsız",
        ]}
        metric={active.metric(item)}
        onPress={openPlayer}
        /* Son satır kartın tabanıdır: alt kenarlık ve alt köşeler onda. */
        style={index === lastIndex ? styles.groupRowLast : styles.groupRow}
      />
    ),
    [active, lastIndex, openPlayer, showPodium],
  );

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader
        title="Oyuncular"
        scope={<ScopeChip tone="ink" />}
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
          renderItem={renderItem}
          getItemLayout={getItemLayout}
          ItemSeparatorComponent={GroupSeparator}
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
              <Input
                variant="search"
                size="sm"
                value={search}
                onChangeText={setSearch}
                placeholder="Oyuncu veya takım ara"
                autoCorrect={false}
              />

              {query.isError ? <ErrorState error={query.error} variant="banner" /> : null}

              {showPodium ? (
                <Podium
                  players={rows.slice(0, 3)}
                  metricOf={active.metric}
                  unit={active.unit}
                  onPress={openPlayer}
                />
              ) : null}

              {/* Sütun başlığı kartın TEPESİDİR: üst kenarlık ve üst köşeler onda. */}
              {!busy && listData.length > 0 ? (
                <View style={styles.groupHead}>
                  <PlayerRowHead unit={active.unit} />
                </View>
              ) : null}
            </View>
          }
          ListEmptyComponent={
            busy ? (
              /* İskelet de kartta durur; yükleme bitince çerçeve zıplamaz. */
              <View style={styles.skeletonCard}>
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
  listContent: {
    paddingHorizontal: layout.screenPadding,
    paddingBottom: space.xxxl,
  },
  listHeader: {
    gap: space.sm,
    paddingTop: space.md,
  },

  /* — Satır grubu (tema.html ".group") — */
  groupHead: {
    ...GROUP_SHELL,
    borderWidth: hairline,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    /* Başlığın kendi üst dolgusu ve alt çizgisi yok; kart tepesinde ikisi de gerekir. */
    paddingTop: space.s,
    borderBottomColor: colors.separator,
    overflow: "hidden",
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
    borderWidth: hairline,
    borderColor: colors.border,
    borderRadius: radius.lg,
    overflow: "hidden",
  },

  /* — Podyum — */
  podium: {
    flexDirection: "row",
    /* Basamaklar tabandan hizalanır: birinci daha uzun, ikisi onun yanında
       alçakta durur — podyum silueti buradan çıkar. */
    alignItems: "flex-end",
    gap: space.sm,
    paddingTop: space.s,
    paddingBottom: space.xs,
  },
  podiumCell: {
    flex: 1,
    alignItems: "center",
    gap: space.xxs,
    paddingVertical: space.xs,
    borderRadius: radius.md,
  },
  /* Rozet halkanın altına taşar; ad onun altında nefes alsın. */
  podiumAvatar: {
    alignItems: "center",
    marginBottom: space.sm,
  },
  podiumRing: {
    padding: 2,
    borderRadius: radius.pill,
    borderWidth: 2,
  },
  podiumRankBadge: {
    position: "absolute",
    bottom: -3,
    alignSelf: "center",
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    /* Halka kâğıt renginde: podyum kartsız, rozet doğrudan zemine oturur. */
    borderWidth: 1.5,
    borderColor: colors.bg,
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
  podiumNameFirst: {
    ...type.label,
    color: colors.textPrimary,
    textAlign: "center",
    paddingHorizontal: space.xs,
  },
  podiumMetric: {
    ...type.tableNumStrong,
    color: colors.textSecondary,
  },
  /* Birincinin sayısı büyük ve altın: "kim önde" sorusunun tek bakışlık yanıtı. */
  podiumMetricFirst: {
    ...type.metricSm,
    color: colors.zoneChampion,
  },
});
