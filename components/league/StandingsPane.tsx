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
 * GRUPLAR VE KUPALAR (web'deki puan durumu sekmeleriyle aynı kurgu, bkz.
 * `cups.ts`): sezon gruplara/etaplara bölünmüşse tablonun üstünde iki katlı
 * sekme düzeni çıkar (`StageNav`) — "Genel" (yönetici kapatabilir) · lig
 * usulü gruplar (kendi maçlarından hesaplanan tablo) · kupalar (eleme ağacı,
 * `CupView`) · bağımsız etaplar (eşleşme listesi). Ağaç kipindeki sezonda
 * "Genel"in üstünde turnuva yolu (`StageFlow`). Grupsuz sezonda hiçbiri
 * çizilmez. Liderlik özeti, gol krallığı dışındaki her şey ve bölge anahtarı
 * seçili gruba göredir; eleme bölgeleri statüden gelir: "1–8. sıra → Altın
 * Kupa Son 16".
 *
 * YOĞUN ÖLÇÜ: satırlar ortak `TeamRow` değil, bu sekmeye özgü ince
 * `StandingsRow`dur (40px satır, madalyalı ilk üç, puan sütunu şeridi).
 *
 * İKİNCİ TUR — SAYFA KURGUSU (yukarıdan aşağı):
 *   1. LİDERLİK ÖZETİ (`StandingsPodium`): sahne kartında lider + 2./3. ve
 *      lidere puan farkı. Tablonun bağlamı (takım · maç) onun üst satırında.
 *   2. GOL KRALLIĞI kartı: sıralı ilk üç, gol sayısı iri.
 *   3. TABLO ARAÇ ÇUBUĞU: başlık + Kısa/Tam/Form segmenti, altında BÖLGE
 *      RENK ANAHTARI (çip şeridi). Anahtar artık tablonun ÜSTÜNDEDİR:
 *      yüzlerce satırlık bir tablonun altı hiç görülmüyordu.
 *   4. SABİT SÜTUN BAŞLIĞI: başlık listenin ilk öğesidir ve
 *      `stickyHeaderIndices` ile kaydırırken tepede kalır — 200. satırdayken
 *      "bu sütun neydi?" sorusu doğmaz.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { FlatList, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  EmptyState,
  ErrorState,
  Reveal,
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
import { getGroupStandings, getSeasonOverview, seasonGroupKeys } from "@/lib/api/seasonGroups";
import { getStandings } from "@/lib/api/standings";
import { formatNumber } from "@/lib/format";
import { queryKeys } from "@/lib/queryKeys";
import type { PlayerSort, StandingRow } from "@/lib/types";
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
import { CupView } from "./CupView";
import { buildQualification, buildStandingsTabs, looseStage, type QualificationLegend } from "./cups";
import type { LeaderEntry } from "./Leaderboard";
import { ZoneKey, type ZoneKeyItem } from "./kit";
import { ScorersStrip } from "./ScorersStrip";
import { StageFlow, StageNav } from "./StageNav";
import { StandingsPodium } from "./StandingsPodium";
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

/**
 * Eleme bölgesi tonları (statüden gelen "kim nereye kalır"): tablo bölgelerinin
 * ray renkleri yeniden kullanılır — yeni renk icat edilmez.
 */
const QUALIFICATION_COLORS = [
  colors.zoneChampion,
  colors.zonePromotion,
  colors.zonePlayoff,
  colors.zoneRelegationPlayoff,
] as const;

/** Varsayılan bölge kurallarından renk anahtarı: "Şampiyon 1." · "Play-off 2–3." … */
function zoneKeyItems(rules: ZoneRule[]): ZoneKeyItem[] {
  const seen = new Set<StandingZone>();
  const out: ZoneKeyItem[] = [];
  for (const rule of rules) {
    if (rule.zone === "none" || seen.has(rule.zone)) continue;
    const color = zoneColor(palette, rule.zone);
    const label = zoneLabel(rule.zone);
    if (!color || !label) continue;
    seen.add(rule.zone);
    out.push({
      key: rule.zone,
      color,
      label,
      range: rule.from === rule.to ? `${rule.from}.` : `${rule.from}–${rule.to}.`,
    });
  }
  return out;
}

/** Sabit sütun başlığının liste içindeki yer tutucusu (verinin ilk öğesi). */
const HEAD_ITEM = { __head: true } as const;
type TableItem = StandingRow | typeof HEAD_ITEM;
const isHead = (item: TableItem): item is typeof HEAD_ITEM => "__head" in item;

/** Başlık ile ilk satır arasında ayraç yok (başlığın kendi alt çizgisi var). */
const TableSeparator = ({ leadingItem }: { leadingItem?: TableItem }) =>
  leadingItem && isHead(leadingItem) ? null : <GroupSeparator />;

/** Satır sonundaki takip yıldızının genişliği (FollowStar kutusu = 32, ikon 14). */
const STAR_SLOT = 32;
/** Gol krallığı kartında gösterilen golcü sayısı. */
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

  /* Sezonun grup/etap kurgusu. Okunamazsa sezon grupsuz kabul edilir: tablo
     bugünkü gibi tek parça çizilir, yalnız sekme şeridi çıkmaz. */
  const seasonId = scope.seasonId;
  const overviewQuery = useQuery({
    queryKey: seasonGroupKeys.overview(seasonId),
    queryFn: () => getSeasonOverview(seasonId as number),
    enabled: scope.ready && seasonId != null,
    staleTime: 60_000,
    retry: 1,
  });
  const { tabs } = useMemo(() => buildStandingsTabs(overviewQuery.data), [overviewQuery.data]);
  const [selectedTab, setSelectedTab] = useState<string>("");
  /* Seçim türetilir: sezon değişince (ya da "Genel" kapatılınca) geçersiz
     kalan anahtar sessizce ilk sekmeye düşer — efekt ve ara çizim yok. */
  const activeTab = tabs.find((tab) => tab.key === selectedTab) ?? tabs[0];
  const activeGroupId = activeTab.kind === "group" ? Number(activeTab.group.id) : null;

  /* Grup tablosu sezon geneli tablodan türetilemez: grubun KENDİ maçlarından
     hesaplanır (bir takım birden fazla etapta yer alabilir). */
  const groupQuery = useQuery({
    queryKey: seasonGroupKeys.standings(activeGroupId),
    queryFn: () => getGroupStandings(activeGroupId as number),
    enabled: activeGroupId != null,
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
  const { refetch: refetchOverview } = overviewQuery;
  const { refetch: refetchGroup } = groupQuery;
  const refetchAll = useCallback(() => {
    void refetchScorers();
    void refetchOverview();
    if (activeGroupId != null) void refetchGroup();
    return refetchStandings();
  }, [activeGroupId, refetchGroup, refetchOverview, refetchScorers, refetchStandings]);
  const refresh = useRefresh(refetchAll, {
    refreshing: query.isRefetching || overviewQuery.isRefetching || groupQuery.isRefetching,
  });

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
  const tableQuery = activeGroupId != null ? groupQuery : query;
  const rows = useMemo(() => tableQuery.data ?? [], [tableQuery.data]);
  const zoneRules = useMemo(() => defaultZoneRules(rows.length), [rows.length]);
  /* Eleme bölgeleri: grup sekmesinde o grubun, aksi hâlde genel tablonun.
     Statü bölge tanımlamadıysa takım sayısından türetilen varsayılan kalır. */
  const qualification = useMemo(
    () =>
      buildQualification(
        activeGroupId != null
          ? overviewQuery.data?.qualification.groups[String(activeGroupId)]
          : overviewQuery.data?.qualification.overall,
      ),
    [activeGroupId, overviewQuery.data],
  );
  const hasQualification = qualification.legend.length > 0;
  const keyItems = useMemo<ZoneKeyItem[]>(
    () =>
      hasQualification
        ? qualification.legend.map((item) => ({
            key: item.label,
            color: QUALIFICATION_COLORS[item.tone] ?? colors.border,
            label: item.label,
          }))
        : zoneKeyItems(zoneRules),
    [hasQualification, qualification.legend, zoneRules],
  );
  /* Tablonun bağlamı — her maç iki takımın "O" sütununda sayılır: ΣO / 2. */
  const matchCount = useMemo(
    () => Math.round(rows.reduce((sum, row) => sum + num(row.played), 0) / 2),
    [rows],
  );
  const powerBalance = rows[0]?.standings_type === "gucdengesi";
  const followedCount = useMemo(
    () => rows.filter((row) => isFavorite(row.team_id)).length,
    [rows, isFavorite],
  );

  const openTeam = useCallback((teamId: number) => router.push(`/takim/${teamId}`), [router]);
  const openPlayer = useCallback((id: number) => router.push(`/oyuncu/${id}`), [router]);
  const openScorers = useCallback(() => onOpenPlayers?.("topScorers"), [onOpenPlayers]);
  const openMatch = useCallback((matchId: number) => router.push(`/mac/${matchId}`), [router]);

  /* Grup / etap / kupa gezinmesi — tek sekmede (grupsuz sezon) hiç çizilmez
     ve görünüm bugünküyle aynı kalır. */
  const groupBar =
    tabs.length > 1 ? <StageNav tabs={tabs} activeKey={activeTab.key} onChange={setSelectedTab} /> : null;
  /* Ağaç kipi (web: eleme şeması + genel tablo): "Genel" sekmesinde tablonun
     üstünde turnuva yolu. */
  const treeMode =
    overviewQuery.data?.settings?.group_display_mode === "agac" &&
    (overviewQuery.data?.groups ?? []).some((group) => !group.is_default);
  const stageFlow =
    treeMode && activeTab.kind === "overall" ? (
      <StageFlow groups={overviewQuery.data?.groups ?? []} tabs={tabs} onOpenTab={setSelectedTab} />
    ) : null;
  const tableTitle = activeTab.kind === "group" ? activeTab.group.group_name : tabs.length > 1 ? "Genel puan durumu" : "Puan tablosu";

  const renderItem = useCallback(
    ({ item, index: listIndex }: { item: TableItem; index: number }) => {
      if (isHead(item)) {
        /* Sütun başlığı kartın TEPESİDİR; yapışkan olduğu için arkasında
           kâğıt zemini taşır ki altından kayan satırlar görünmesin. */
        return (
          <View style={styles.stickyHead}>
            <View style={groupStyles.head}>
              <StandingsHead
                columns={columns}
                pointsLabel={powerBalance ? "GP" : "Puan"}
                trailingWidth={STAR_SLOT}
              />
            </View>
          </View>
        );
      }
      const index = listIndex - 1;
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
          zone={
            hasQualification
              ? QUALIFICATION_COLORS[qualification.byRank.get(rank) ?? -1] ?? null
              : zoneColor(palette, zoneForRank(rank, zoneRules))
          }
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
    [columns, hasQualification, isFavorite, openTeam, powerBalance, qualification, rows.length, zoneRules],
  );

  const tableData = useMemo<TableItem[]>(() => (rows.length > 0 ? [HEAD_ITEM, ...rows] : []), [rows]);

  if (!scope.ready && !scope.loading) return <ScopeMissing />;
  if (query.isLoading || overviewQuery.isLoading || scope.loading) {
    /* İskelet de kartta durur; yükleme bitince çerçeve zıplamaz. */
    return (
      <View style={paneStyles.skeleton}>
        <View style={styles.skeletonStage} />
        <View style={styles.skeletonSegment} />
        <View style={styles.skeletonCard}>
          <SkeletonStandings density="table" />
        </View>
      </View>
    );
  }
  /* KUPA / ETAP SEKMESİ — tablo yerine eleme ağacı ya da eşleşme listesi. */
  if (activeTab.kind === "cup" || activeTab.kind === "stage") {
    return (
      <ScrollView
        {...scrollProps}
        contentContainerStyle={[paneStyles.content, styles.cupContent]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl {...refreshControlProps(refresh.refreshing, refresh.onRefresh)} />
        }
      >
        {groupBar}
        <CupView
          key={activeTab.key}
          cup={activeTab.kind === "cup" ? activeTab.cup : null}
          stage={activeTab.kind === "stage" ? looseStage(activeTab.group) : null}
          onOpenMatch={openMatch}
        />
      </ScrollView>
    );
  }

  if (tableQuery.isError && rows.length === 0 && tabs.length <= 1) {
    return <ErrorState error={tableQuery.error} onRetry={tableQuery.refetch} />;
  }

  const tableLoading = activeGroupId != null && groupQuery.isLoading;

  return (
    <FlatList
      {...scrollProps}
      data={tableData}
      extraData={columns}
      /* Sekme değişince liste tepeden başlar; eski grubun kaydırma konumu kalmaz. */
      key={activeTab.key}
      keyExtractor={standingKey}
      renderItem={renderItem}
      ItemSeparatorComponent={TableSeparator}
      /* 0 = ListHeaderComponent, 1 = sütun başlığı: kaydırırken tepede kalır. */
      stickyHeaderIndices={rows.length > 0 ? [1] : undefined}
      initialNumToRender={20}
      windowSize={8}
      contentContainerStyle={paneStyles.content}
      refreshControl={
        <RefreshControl {...refreshControlProps(refresh.refreshing, refresh.onRefresh)} />
      }
      ListHeaderComponent={
        rows.length === 0 ? (
          groupBar ? (
            <View style={styles.header}>
              {groupBar}
              {stageFlow}
            </View>
          ) : null
        ) : (
          <View style={styles.header}>
            {groupBar}
            {stageFlow}
            {tableQuery.isError ? <ErrorState error={tableQuery.error} variant="banner" /> : null}
            <Reveal index={0}>
              <StandingsPodium
                rows={rows}
                caption={`${formatNumber(rows.length)} takım · ${formatNumber(matchCount)} maç`}
                pointsLabel={powerBalance ? "Güç puanı" : "Puan"}
                onPressTeam={openTeam}
              />
            </Reveal>
            <Reveal index={1}>
              <ScorersStrip
                entries={scorers}
                onPressEntry={openPlayer}
                onSeeAll={onOpenPlayers ? openScorers : undefined}
              />
            </Reveal>
            <View style={styles.tableIntro}>
              <View style={styles.toolbar}>
                <View style={styles.toolbarText}>
                  <Text style={styles.toolbarTitle} numberOfLines={1} {...textScale.dense}>
                    {tableTitle}
                  </Text>
                  <Text style={styles.toolbarMeta} numberOfLines={1} {...textScale.dense}>
                    {`${formatNumber(rows.length)} takım`}
                    {followedCount > 0 ? ` · ${followedCount} takip` : ""}
                  </Text>
                </View>
                <SegmentedControl
                  items={VIEW_ITEMS}
                  value={columns}
                  onChange={setColumns}
                  size="sm"
                  stretch={false}
                />
              </View>
              <ZoneKey items={keyItems} />
            </View>
          </View>
        )
      }
      ListEmptyComponent={
        tableLoading ? (
          <View style={styles.skeletonCard}>
            <SkeletonStandings density="table" />
          </View>
        ) : tableQuery.isError ? (
          <ErrorState error={tableQuery.error} onRetry={tableQuery.refetch} />
        ) : (
          <EmptyState
            icon="podium-outline"
            title={activeGroupId != null ? "Bu grupta henüz tablo yok" : "Puan tablosu boş"}
            body={
              activeGroupId != null
                ? "Grubun ilk maçları oynanınca sıralama burada oluşur."
                : "Bu sezonda henüz maç oynanmamış. İlk maçlardan sonra sıralama burada oluşur."
            }
          />
        )
      }
      ListFooterComponent={
        rows.length > 0 && powerBalance ? (
          <View style={styles.footer}>
            <View style={styles.footnoteCard}>
              <Ionicons name="information-circle-outline" size={16} color={colors.brandAccent} />
              <Text style={styles.footnote} {...textScale.long}>
                Bu sezon Güç Dengesi puanlaması kullanılıyor: bir maçtan alınan puan
                rakibin güç endeksine göre değişir, toplam puan 0&apos;ın altına düşmez.
              </Text>
            </View>
          </View>
        ) : null
      }
    />
  );
}

const standingKey = (item: TableItem) => (isHead(item) ? "__head" : String(item.team_id));

const styles = StyleSheet.create({
  header: {
    gap: space.md,
    paddingBottom: space.sm,
  },
  cupContent: {
    gap: space.md,
  },
  tableIntro: {
    gap: space.m,
    paddingTop: space.sm,
  },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
  },
  toolbarText: {
    flex: 1,
    minWidth: 0,
  },
  toolbarTitle: {
    ...type.h2,
    color: colors.textPrimary,
  },
  toolbarMeta: {
    ...type.caption,
    color: colors.textTertiary,
  },
  /** Yapışkan başlığın arkası: kâğıt zemin (altından kayan satırlar görünmez). */
  stickyHead: {
    backgroundColor: colors.bg,
  },
  skeletonStage: {
    height: 200,
    borderRadius: radius.xxl,
    backgroundColor: colors.skeletonBase,
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
    paddingTop: space.md,
  },
  footnoteCard: {
    flexDirection: "row",
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: colors.brandDim,
    borderWidth: hairline,
    borderColor: colors.brandBorder,
  },
  footnote: {
    ...type.caption,
    color: colors.textSecondary,
    flex: 1,
  },
});
