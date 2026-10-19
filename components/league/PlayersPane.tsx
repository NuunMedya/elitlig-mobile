/**
 * PlayersPane — oyuncu sıralamaları (Lig merkezinin "Oyuncular" sekmesi).
 *
 * Eskiden alt çubukta kendi sekmesi olan ekranın gövdesidir. Kapsam (il · lig ·
 * sezon) Lig merkezinin başlığında seçilir; sıralama ölçütü burada,
 * listenin tepesindeki çiplerle değişir. Podyum ilk üçü, liste kalanını taşır.
 *
 * ARENA PODYUMU: üç oyuncu tek bir kartta, gerçek bir podyum gibi BASAMAK
 * üstünde durur — birinci ortada ve en yüksek basamakta. Basamaklar nötr
 * ikinci katman yüzeyidir (`surface2`); madalya rengi yalnız avatar
 * halkasında ve sıra rozetindedir. Birincinin rakamı büyük Archivo'dur.
 *
 * HÜKMEN KAYITLARI AYIKLANIR: sunucu hükmen maçlar için sistem oyuncuları
 * ("HÜKMEN 1") döndürüyor; ayıklanmazsa gol krallığını onlar kazanıyordu.
 *
 * YOĞUN SATIR: liste ortak `PlayerRow` (60px, 34px avatar, 15px ad) yerine bu
 * dosyadaki ince `RankRow`la çizilir — 42px satır, 24px avatar, 12px ad.
 * Sıralamada mevki ve forma numarası yoktur; ortak satırın o yükü burada
 * gereksizdi ve Lig sekmesinde ekrana iki kat oyuncu sığar.
 */

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import type { NativeScrollEvent, NativeSyntheticEvent, StyleProp, ViewStyle } from "react-native";

import {
  Avatar,
  EmptyState,
  ErrorState,
  Input,
  SkeletonListRow,
  Chip,
  ChipGroup,
  Touchable,
  refreshControlProps,
  useRefresh,
} from "@/components/ui";
import { getPlayerRankings } from "@/lib/api/players";
import { formatDecimal } from "@/lib/format";
import { queryKeys } from "@/lib/queryKeys";
import type { PlayerRankRow, PlayerSort } from "@/lib/types";
import { useScope } from "@/providers/ScopeProvider";
import { colors, hairline, layout, space, textScale, type, upperTR } from "@/theme";
import { Podium } from "./Podium";
import { GROUP_RADIUS, JUNK_PLAYER } from "./shared";

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
 * Sıralama ölçütleri — listenin tepesinde küçük (sm) çip şeridi. Lig
 * merkezinin başlığında sekmeler ve lig çipleri zaten iki gezinme katmanı
 * kuruyor; üçüncü bir sekme şeridi yerine küçük çipler, "bu listenin
 * sıralaması" olduğunu söyleyen daha sessiz bir dil.
 */
const SORTS: SortDef[] = [
  { key: "mostValuable", label: "En Değerliler", metric: (r) => String(num(r.points)), unit: "puan" },
  { key: "topScorers", label: "Gol Krallığı", metric: (r) => String(num(r.goals)), unit: "gol" },
  { key: "mostMatches", label: "En Çok Maç", metric: (r) => String(num(r.matches)), unit: "maç" },
  { key: "pointsPerMatch", label: "Puan / Maç", metric: (r) => formatDecimal(num(r.pointsPerMatch), 2), unit: "puan" },
  { key: "goalsPerMatch", label: "Gol / Maç", metric: (r) => formatDecimal(num(r.goalsPerMatch), 2), unit: "gol" },
  { key: "mostCards", label: "Kartlar", metric: (r) => String(num(r.cards)), unit: "kart" },
];

const normalize = (value: string) => value.trim().toLocaleLowerCase("tr-TR");

const SKELETON_ROWS = ["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8"] as const;

/** Satırlar arası ince ayraç; kartın yan kenarlığını da taşır ki çizgi kesilmesin. */
const GroupSeparator = () => <View style={styles.separator} />;

/* ══════════════════════════════════════════════════════════════════════════
   İnce sıralama satırı
   ══════════════════════════════════════════════════════════════════════════ */

/** Satır yüksekliği — `getItemLayout` bunu kullanır; stil ile aynı sabit. */
const RANK_ROW_HEIGHT = 42;
const RANK_AVATAR = 24;
/** Sağdaki rakam sütunu — başlıktaki birim de aynı genişlikte durur. */
const RANK_METRIC_W = 32;

/** [sıra] · [avatar] · [ad + bağlam] · [tek sayı] — `PlayerRow` anatomisinin küçüğü. */
const RankRow = React.memo(function RankRow({
  playerId,
  rank,
  name,
  image,
  meta,
  metric,
  onPress,
  style,
}: {
  playerId: number;
  rank: number;
  name: string;
  image: string | null;
  meta: (string | null | undefined)[];
  metric: string;
  onPress: (playerId: number) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const handlePress = useCallback(() => onPress(playerId), [onPress, playerId]);
  const metaText = meta.filter(Boolean).join(" · ");
  return (
    <Touchable
      style={[styles.rankRow, style]}
      onPress={handlePress}
      feedback="row"
      haptic="selection"
      accessibilityLabel={`${rank}. ${name}, ${metric}`}
    >
      <Text style={styles.rankNum} {...textScale.dense}>
        {rank}
      </Text>
      <Avatar name={name} image={image} size={RANK_AVATAR} />
      <View style={styles.rankBody}>
        <Text style={styles.rankName} numberOfLines={1} {...textScale.dense}>
          {name}
        </Text>
        {metaText ? (
          <Text style={styles.rankMeta} numberOfLines={1} {...textScale.dense}>
            {metaText}
          </Text>
        ) : null}
      </View>
      <Text style={styles.rankMetric} numberOfLines={1} {...textScale.dense}>
        {metric}
      </Text>
    </Touchable>
  );
});

/** Sütun başlığı — "OYUNCU … <BİRİM>"; birim satırda değil burada bir kez yazılır. */
const RankHead = React.memo(function RankHead({ unit }: { unit: string }) {
  return (
    <View style={styles.rankHead}>
      <Text style={styles.headLabel} {...textScale.badge}>
        {upperTR("Oyuncu")}
      </Text>
      <Text style={[styles.headLabel, styles.headMetric]} {...textScale.badge}>
        {upperTR(unit)}
      </Text>
    </View>
  );
});

/* ══════════════════════════════════════════════════════════════════════════
   Ekran
   ══════════════════════════════════════════════════════════════════════════ */

const keyExtractor = (item: PlayerRankRow) => String(item.id);
/* Hücre = satır + ayraç: VirtualizedList ayracı satırla aynı hücreye koyar. */
const CELL_HEIGHT = RANK_ROW_HEIGHT + hairline;
const getItemLayout = (_data: ArrayLike<PlayerRankRow> | null | undefined, index: number) => ({
  length: CELL_HEIGHT,
  offset: CELL_HEIGHT * index,
  index,
});

export interface PlayersPaneProps {
  /** Lig merkezinin başlığını daraltan kaydırma bağlantısı. */
  scrollProps?: {
    onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
    scrollEventThrottle: number;
  };
  /** Açılıştaki sıralama ölçütü (İstatistik → "Tüm sıralama"). */
  initialSort?: PlayerSort;
}

export function PlayersPane({ scrollProps, initialSort = "topScorers" }: PlayersPaneProps) {
  const scope = useScope();
  const router = useRouter();

  const [sort, setSort] = useState<PlayerSort>(initialSort);
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
    const players = (query.data?.players ?? []).filter(
      (player) => player.name && !JUNK_PLAYER.test(player.name),
    );
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
      <RankRow
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
    <>
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
              <ChipGroup style={styles.sortChips}>
                {SORTS.map((item) => (
                  <Chip
                    key={item.key}
                    label={item.label}
                    selected={item.key === sort}
                    size="sm"
                    onPress={() => setSort(item.key)}
                  />
                ))}
              </ChipGroup>
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
                  <RankHead unit={active.unit} />
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
    </>
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
    paddingBottom: layout.tabBarHeight + space.xl,
  },
  sortChips: {
    marginHorizontal: -layout.screenPadding,
  },
  listHeader: {
    gap: space.sm,
    paddingTop: space.sm,
  },

  /* — Satır grubu (tema.html ".group") — */
  groupHead: {
    ...GROUP_SHELL,
    borderWidth: hairline,
    borderTopLeftRadius: GROUP_RADIUS,
    borderTopRightRadius: GROUP_RADIUS,
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
    borderBottomLeftRadius: GROUP_RADIUS,
    borderBottomRightRadius: GROUP_RADIUS,
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
    borderRadius: GROUP_RADIUS,
    overflow: "hidden",
  },

  /* — İnce sıralama satırı — */
  rankRow: {
    height: RANK_ROW_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: space.m,
  },
  /* Sıra sabit genişlikte: "4" ile "14" avatar sütununu kaydırmaz. */
  rankNum: {
    ...type.numSm,
    width: 20,
    textAlign: "center",
    color: colors.textTertiary,
  },
  rankBody: {
    flex: 1,
    minWidth: 0,
  },
  rankName: {
    ...type.labelSm,
    color: colors.textPrimary,
  },
  rankMeta: {
    ...type.meta,
    color: colors.textTertiary,
  },
  rankMetric: {
    ...type.scoreXs,
    minWidth: RANK_METRIC_W,
    textAlign: "right",
    color: colors.textPrimary,
  },
  rankHead: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: space.m,
    paddingBottom: space.xs,
  },
  headLabel: {
    ...type.overline,
    letterSpacing: 0.8,
    color: colors.textTertiary,
  },
  headMetric: {
    marginLeft: "auto",
    minWidth: RANK_METRIC_W,
    textAlign: "right",
  },
});
