/**
 * LİGLER — kapsama (şehir → lig → sezon) bağlı tüm verinin tek evi.
 *
 * NE: eski `(tabs)/standings.tsx` + `(tabs)/news.tsx` + `app/arsiv.tsx`
 * ekranlarının beş segmentte birleşmiş hâli:
 *   Puan · Fikstür · İstatistik · Haberler · Arşiv
 *
 * OYUNCULAR SEGMENTİ NEDEN YOK: alt çubuktaki Oyuncular sekmesiyle birebir
 * aynı ekrandı (aynı uç, aynı kapsam, aynı altı ölçüt). Aynı listeye iki ayrı
 * menü basamağından gitmek, kullanıcıya iki farklı yer olduğunu düşündürüyordu.
 * Kanonik kapı alt çubuktaki sekmedir; kapsam ortak olduğu için oraya geçen
 * kullanıcı aynı lig ve sezonu görür.
 *
 * NEDEN BİRLEŞTİ: dördü de aynı kapsama bağlıydı ve dördü de ayrı ayrı 48px'lik
 * bir kapsam çubuğu çiziyordu. Kullanıcı "Ankara 1.Lig 25/26" seçimini sekme
 * değiştirdikçe yeniden okumak/doğrulamak zorunda kalıyordu. Artık kapsam bir
 * kez üstte gösterilir (ScopeChip) ve segment değiştikçe sabit kalır.
 *
 * DERİN BAĞLANTI: `/(tabs)/ligler?tab=<puan|fikstur|istatistik|haberler|
 * arsiv>&leagueId=<id>`. Geçersiz değer (eski `oyuncular` dâhil) sessizce
 * "puan" olur;
 * `leagueId` verilirse kapsam o lige çevrilir (maç listesindeki lig başlığı
 * buraya bu parametreyle gelir).
 *
 * PERFORMANS: aynı anda YALNIZ bir segmentin listesi mount edilir; her segment
 * kendi sorgusunu `enabled` ile açar, arka plandaki segmentler istek atmaz.
 * Satır bileşenlerinin hepsi React.memo'lu ve yalnız ilkel prop alır.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  Image,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScopeChip } from "@/components/ScopeChip";
import {
  Badge,
  Chip,
  ChipGroup,
  EmptyState,
  ErrorState,
  FormChips,
  ListRow,
  MatchRow,
  ScreenHeader,
  SectionHeader,
  SkeletonListRow,
  SkeletonMatchRow,
  SkeletonStandings,
  Tabs,
  TeamLogo,
  Touchable,
  refreshControlProps,
  useHeaderScroll,
  useRefresh,
  type TabItem,
} from "@/components/ui";
import { getMatches } from "@/lib/api/matches";
import { getNewsFeed } from "@/lib/api/news";
import { getPlayerRankings } from "@/lib/api/players";
import { getStandings } from "@/lib/api/standings";
import { formatDayHeading, mediaUrl, stripHtml, timeAgo } from "@/lib/format";
import { queryKeys } from "@/lib/queryKeys";
import type { ApiMatch, NewsItem, StandingRow } from "@/lib/types";
import { useFavorite } from "@/providers/FavoriteProvider";
import { useScope } from "@/providers/ScopeProvider";
import {
  colors,
  defaultZoneRules,
  fonts,
  layout,
  palette,
  radius,
  space,
  textScale,
  touchSlop,
  type,
  zoneColor,
  zoneForRank,
} from "@/theme";

/* ══════════════════════════════════════════════════════════════════════════
   Segmentler ve rota parametresi
   ══════════════════════════════════════════════════════════════════════════ */

type LeagueTab = "puan" | "fikstur" | "istatistik" | "haberler" | "arsiv";

const TAB_ITEMS: TabItem<LeagueTab>[] = [
  { key: "puan", label: "Puan" },
  { key: "fikstur", label: "Fikstür" },
  { key: "istatistik", label: "İstatistik" },
  { key: "haberler", label: "Haberler" },
  { key: "arsiv", label: "Arşiv" },
];

const TAB_KEYS = TAB_ITEMS.map((item) => item.key);

/**
 * Rota anahtarını normalleştirir.
 *
 * TUZAK: `"PUAN".toLocaleLowerCase("tr")` noktasız ı üretir, düz `toLowerCase()`
 * ise "İ" için birleşik nokta bırakır; ikisi de ASCII rota anahtarıyla
 * eşleşmez. Önce I ailesi katlanır, sonra küçültülür.
 */
function normalizeKey(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.trim().replace(/[İIı]/g, "i").toLowerCase();
}

/** Takma adlar: bildirimden/menüden gelen farklı yazımlar da doğru segmente düşer. */
const TAB_ALIASES: Record<string, LeagueTab> = {
  standings: "puan",
  puandurumu: "puan",
  fikstur: "fikstur",
  fixtures: "fikstur",
  maclar: "fikstur",
  stats: "istatistik",
  istatistikler: "istatistik",
  news: "haberler",
  haber: "haberler",
  archive: "arsiv",
};

function resolveTab(raw: unknown): LeagueTab {
  const key = normalizeKey(raw);
  if ((TAB_KEYS as string[]).includes(key)) return key as LeagueTab;
  return TAB_ALIASES[key] ?? "puan";
}

/** Sorgu parametresi tek değer ya da dizi olarak gelebilir. */
function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/* ══════════════════════════════════════════════════════════════════════════
   Ekran kabuğu
   ══════════════════════════════════════════════════════════════════════════ */

export default function LeaguesScreen() {
  const scope = useScope();
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string; leagueId?: string }>();
  const { isFavoriteLeague, toggleFavoriteLeague } = useFavorite();
  const { scrollY, scrollProps } = useHeaderScroll();

  const [tab, setTab] = useState<LeagueTab>(() => resolveTab(firstParam(params.tab)));

  // Rota parametresi sonradan değişirse (bildirime dokunma, menüden derin
  // bağlantı) görünüm ona uyar.
  const routeTab = resolveTab(firstParam(params.tab));
  useEffect(() => {
    setTab(routeTab);
    scrollY.setValue(0);
  }, [routeTab, scrollY]);

  // `leagueId` parametresi kapsamı o lige çevirir (maç listesindeki lig başlığı).
  //
  // TUZAK: parametre TEK SEFERLİK bir komuttur, kalıcı bir kısıt değil. Efekt
  // `scope` nesnesine bağlanırsa (kimliği her kapsam değişiminde yenilenir)
  // kullanıcının sonraki lig seçimi anında rotadaki eski değere geri çevrilir;
  // şehir değişiminde ise ScopeProvider'ın "seçili lig listede yok → ilk lige
  // kay" düzeltmesiyle karşılıklı setState döngüsüne girilir. Bu yüzden yalnız
  // kararlı `selectLeague` referansına bağlanır, uygulanan değer ref'te
  // işaretlenir ve parametre rotadan düşürülür.
  const routeLeagueId = Number(firstParam(params.leagueId));
  const { selectLeague, leagueId: scopeLeagueId } = scope;
  const appliedLeagueRef = useRef<number | null>(null);
  useEffect(() => {
    if (!Number.isFinite(routeLeagueId) || routeLeagueId <= 0) {
      // Parametre düştü: bir sonraki derin bağlantı aynı ligi yeniden uygulayabilsin.
      appliedLeagueRef.current = null;
      return;
    }
    if (appliedLeagueRef.current === routeLeagueId) return;
    appliedLeagueRef.current = routeLeagueId;
    router.setParams({ leagueId: undefined });
    // Zaten o ligdeysek dokunma: `selectLeague` sezonu sıfırlar, kullanıcının
    // seçtiği (ör. arşiv) sezon boşuna kaybolur.
    if (routeLeagueId !== scopeLeagueId) selectLeague(routeLeagueId);
  }, [routeLeagueId, scopeLeagueId, selectLeague, router]);

  const changeTab = useCallback(
    (next: LeagueTab) => {
      setTab(next);
      scrollY.setValue(0); // Yeni listenin tepesindeyiz; başlık yeniden açılsın.
      router.setParams({ tab: next });
    },
    [router, scrollY],
  );

  const openScope = useCallback(() => scope.openScopeSheet("city"), [scope]);

  const leagueId = scope.leagueId;
  const leagueLabel = scope.leagueLabel;
  const leagueFavorite = isFavoriteLeague(leagueId);
  const toggleLeague = useCallback(() => {
    if (leagueId == null) return;
    toggleFavoriteLeague({ id: leagueId, name: leagueLabel || "Lig" });
  }, [leagueId, leagueLabel, toggleFavoriteLeague]);

  const actions = useMemo(
    () =>
      leagueId == null
        ? undefined
        : [
            {
              icon: (leagueFavorite ? "star" : "star-outline") as keyof typeof Ionicons.glyphMap,
              onPress: toggleLeague,
              tone: leagueFavorite ? ("warn" as const) : undefined,
              accessibilityLabel: leagueFavorite ? "Ligi favorilerden çıkar" : "Ligi favoriye al",
            },
          ],
    [leagueFavorite, leagueId, toggleLeague],
  );

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader
        title="Ligler"
        back
        /* Bu ekran sekme çubuğunda yuvası olmayan bir sekmedir (href: null) ve
           Menü'den açılır. Sekme gezgininde geri yığını olmayabilir; o durumda
           geldiği yere, yani Menü'ye dönülür. */
        onBack={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/menu"))}
        scrollY={scrollY}
        actions={actions}
        bottom={
          <View style={styles.headerBottom}>
            <View style={styles.scopeRow}>
              <ScopeChip variant="full" />
            </View>
            <Tabs items={TAB_ITEMS} value={tab} onChange={changeTab} sticky />
          </View>
        }
      />

      {tab === "puan" ? (
        <StandingsTab scrollProps={scrollProps} onPickScope={openScope} />
      ) : tab === "fikstur" ? (
        <FixturesTab scrollProps={scrollProps} onPickScope={openScope} />
      ) : tab === "istatistik" ? (
        <StatsTab scrollProps={scrollProps} onPickScope={openScope} />
      ) : tab === "haberler" ? (
        <NewsTab scrollProps={scrollProps} />
      ) : (
        <ArchiveTab scrollProps={scrollProps} onGoStandings={() => changeTab("puan")} />
      )}
    </SafeAreaView>
  );
}

/** Her segmentin listesine geçen ortak kaydırma bağlantısı. */
interface ScrollChrome {
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  scrollEventThrottle: number;
}

interface TabProps {
  scrollProps: ScrollChrome;
  onPickScope: () => void;
}

/** Kapsam seçilmemişken üç segmentin de gösterdiği ortak kart. */
const ScopeMissing = React.memo(function ScopeMissing({ onPress }: { onPress: () => void }) {
  return (
    <EmptyState
      icon="options-outline"
      title="Lig seçilmedi"
      body="Şehir, lig ve sezon seçince bu bölüm dolar."
      action={{ label: "Kapsam seç", onPress }}
    />
  );
});

/* ══════════════════════════════════════════════════════════════════════════
   1) PUAN — sıralama tablosu
   ══════════════════════════════════════════════════════════════════════════ */

/** Satır: sıra + amblem + ad/form iki satır. Sabit yükseklik `getItemLayout` içindir. */
const STANDING_ROW_HEIGHT = 60;

const StandingItem = React.memo(function StandingItem({
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
}: {
  rank: number;
  teamId: number;
  teamName: string;
  logo: string | null;
  played: number;
  goalDiff: number;
  points: number;
  last5: string;
  favorite: boolean;
  zone: string | null;
  onPress: (teamId: number) => void;
}) {
  const handlePress = useCallback(() => onPress(teamId), [onPress, teamId]);

  return (
    <Touchable style={styles.stRow} onPress={handlePress} feedback="row" haptic="selection">
      <View style={[styles.stZone, zone ? { backgroundColor: zone } : null]} />
      <Text style={styles.stRank} {...textScale.dense}>
        {rank}
      </Text>
      <TeamLogo name={teamName} logo={logo} size={layout.crestMd} />
      <View style={styles.stNameBox}>
        <View style={styles.stNameRow}>
          <Text
            style={[styles.stName, favorite ? styles.stNameFav : null]}
            numberOfLines={1}
            {...textScale.dense}
          >
            {teamName}
          </Text>
          {favorite ? <Ionicons name="star" size={11} color={colors.star} /> : null}
        </View>
        {last5 ? <FormChips form={last5} size="xs" /> : null}
      </View>
      <Text style={[styles.stNum, styles.stMuted]} {...textScale.dense}>
        {played}
      </Text>
      <Text
        style={[
          styles.stNum,
          goalDiff > 0 ? styles.stPos : goalDiff < 0 ? styles.stNeg : styles.stMuted,
        ]}
        {...textScale.dense}
      >
        {goalDiff > 0 ? `+${goalDiff}` : goalDiff}
      </Text>
      <Text style={[styles.stNum, styles.stPoints]} {...textScale.dense}>
        {points}
      </Text>
    </Touchable>
  );
});

function StandingsTab({ scrollProps, onPickScope }: TabProps) {
  const scope = useScope();
  const router = useRouter();
  const { isFavorite } = useFavorite();

  const scopeKey = {
    cityId: scope.cityId ?? undefined,
    leagueId: scope.leagueId ?? undefined,
    seasonId: scope.seasonId ?? undefined,
  };

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

  const refresh = useRefresh(query.refetch, { refreshing: query.isRefetching });
  const rows = useMemo(() => query.data ?? [], [query.data]);
  const zoneRules = useMemo(() => defaultZoneRules(rows.length), [rows.length]);
  const powerBalance = rows[0]?.standings_type === "gucdengesi";

  const openTeam = useCallback((teamId: number) => router.push(`/takim/${teamId}`), [router]);

  const renderItem = useCallback(
    ({ item, index }: { item: StandingRow; index: number }) => {
      const rank = index + 1;
      return (
        <StandingItem
          rank={rank}
          teamId={item.team_id}
          teamName={item.team_name}
          logo={item.logo}
          played={item.played}
          goalDiff={Number(item.goal_diff ?? 0)}
          points={item.display_points}
          last5={item.last5 ?? ""}
          favorite={isFavorite(item.team_id)}
          zone={zoneColor(palette, zoneForRank(rank, zoneRules))}
          onPress={openTeam}
        />
      );
    },
    [isFavorite, openTeam, zoneRules],
  );

  if (!scope.ready && !scope.loading) return <ScopeMissing onPress={onPickScope} />;
  if (query.isLoading || scope.loading) return <SkeletonStandings />;
  if (query.isError && rows.length === 0) {
    return <ErrorState error={query.error} onRetry={query.refetch} />;
  }

  return (
    <FlatList
      {...scrollProps}
      data={rows}
      keyExtractor={standingKey}
      renderItem={renderItem}
      getItemLayout={standingLayout}
      initialNumToRender={14}
      windowSize={8}
      contentContainerStyle={styles.standingsContent}
      refreshControl={
        <RefreshControl {...refreshControlProps(refresh.refreshing, refresh.onRefresh)} />
      }
      ListHeaderComponent={
        <>
          {query.isError ? <ErrorState error={query.error} variant="banner" /> : null}
          <View style={styles.stHead}>
            <View style={styles.stZone} />
            <Text style={styles.stHeadRank}>#</Text>
            <Text style={styles.stHeadTeam}>TAKIM</Text>
            <Text style={styles.stHeadNum}>O</Text>
            <Text style={styles.stHeadNum}>AV</Text>
            <Text style={styles.stHeadNum}>{powerBalance ? "GP" : "P"}</Text>
          </View>
        </>
      }
      ListEmptyComponent={
        <EmptyState
          icon="podium-outline"
          title="Puan tablosu boş"
          body="Bu sezonda henüz maç oynanmamış."
        />
      }
      ListFooterComponent={
        powerBalance ? (
          <Text style={styles.footnote} {...textScale.long}>
            Bu sezon Güç Dengesi puanlaması kullanılıyor: bir maçtan alınan puan
            rakibin güç endeksine göre değişir, toplam puan 0&apos;ın altına düşmez.
          </Text>
        ) : null
      }
    />
  );
}

const standingKey = (item: StandingRow) => String(item.team_id);
const standingLayout = (_data: ArrayLike<StandingRow> | null | undefined, index: number) => ({
  length: STANDING_ROW_HEIGHT,
  offset: STANDING_ROW_HEIGHT * index,
  index,
});

/* ══════════════════════════════════════════════════════════════════════════
   2) FİKSTÜR — güne göre öbeklenmiş maç listesi
   ══════════════════════════════════════════════════════════════════════════ */

interface DaySection {
  title: string;
  data: ApiMatch[];
}

/** Maç tarihi hem "2026-08-19" hem tam ISO gelebiliyor; gün anahtarı ilk 10 karakterdir. */
const dayKeyOf = (match: ApiMatch) => String(match.date ?? "").slice(0, 10);

const MatchItem = React.memo(function MatchItem({
  match,
  position,
  favorite,
  onOpen,
  onToggleFavorite,
}: {
  match: ApiMatch;
  position: "single" | "first" | "middle" | "last";
  favorite: boolean;
  onOpen: (id: number) => void;
  onToggleFavorite: (id: number) => void;
}) {
  const open = useCallback(() => onOpen(match.id), [match.id, onOpen]);
  const star = useCallback(() => onToggleFavorite(match.id), [match.id, onToggleFavorite]);
  return (
    <MatchRow
      match={match}
      position={position}
      metaMode="none"
      showFavorite
      isFavorite={favorite}
      onToggleFavorite={star}
      onPress={open}
    />
  );
});

function FixturesTab({ scrollProps, onPickScope }: TabProps) {
  const scope = useScope();
  const router = useRouter();
  const { isFavoriteMatch, toggleFavoriteMatch } = useFavorite();

  const scopeKey = {
    cityId: scope.cityId ?? undefined,
    leagueId: scope.leagueId ?? undefined,
    seasonId: scope.seasonId ?? undefined,
  };

  const query = useQuery({
    queryKey: queryKeys.matches(scopeKey),
    queryFn: () =>
      getMatches({
        leagueId: scope.leagueId ?? undefined,
        seasonId: scope.seasonId ?? undefined,
        limit: 1000,
      }),
    enabled: scope.ready,
    staleTime: 60_000,
  });

  const refresh = useRefresh(query.refetch, { refreshing: query.isRefetching });

  // Sunucu yeniden eskiye sıralı döner; fikstür eskiden yeniye okunur.
  const sections = useMemo<DaySection[]>(() => {
    const list = query.data ?? [];
    const buckets = new Map<string, ApiMatch[]>();
    for (const match of list) {
      const key = dayKeyOf(match);
      if (!key) continue;
      const bucket = buckets.get(key);
      if (bucket) bucket.push(match);
      else buckets.set(key, [match]);
    }
    return [...buckets.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
      .map(([key, data]) => ({
        title: formatDayHeading(key),
        data: [...data].sort((a, b) => String(a.time).localeCompare(String(b.time))),
      }));
  }, [query.data]);

  const openMatch = useCallback((id: number) => router.push(`/mac/${id}`), [router]);

  const renderItem = useCallback(
    ({ item, index, section }: { item: ApiMatch; index: number; section: DaySection }) => (
      <MatchItem
        match={item}
        position={
          section.data.length === 1
            ? "single"
            : index === 0
              ? "first"
              : index === section.data.length - 1
                ? "last"
                : "middle"
        }
        favorite={isFavoriteMatch(item.id)}
        onOpen={openMatch}
        onToggleFavorite={toggleFavoriteMatch}
      />
    ),
    [isFavoriteMatch, openMatch, toggleFavoriteMatch],
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: DaySection }) => (
      <SectionHeader
        title={section.title}
        meta={`${section.data.length} maç`}
        size="group"
        sticky
      />
    ),
    [],
  );

  if (!scope.ready && !scope.loading) return <ScopeMissing onPress={onPickScope} />;
  if (query.isLoading || scope.loading) {
    return (
      <View style={styles.listContent}>
        {SKELETON_ROWS.map((key) => (
          <SkeletonMatchRow key={key} />
        ))}
      </View>
    );
  }
  if (query.isError && sections.length === 0) {
    return <ErrorState error={query.error} onRetry={query.refetch} />;
  }

  return (
    <SectionList
      {...scrollProps}
      sections={sections}
      keyExtractor={matchKey}
      renderItem={renderItem}
      renderSectionHeader={renderSectionHeader}
      stickySectionHeadersEnabled
      initialNumToRender={12}
      maxToRenderPerBatch={12}
      windowSize={8}
      contentContainerStyle={styles.listContent}
      refreshControl={
        <RefreshControl {...refreshControlProps(refresh.refreshing, refresh.onRefresh)} />
      }
      ListHeaderComponent={query.isError ? <ErrorState error={query.error} variant="banner" /> : null}
      ListEmptyComponent={
        <EmptyState
          icon="calendar-outline"
          title="Fikstür boş"
          body="Bu sezon için henüz maç tanımlanmamış."
        />
      }
    />
  );
}

const matchKey = (item: ApiMatch) => String(item.id);
const SKELETON_ROWS = ["s1", "s2", "s3", "s4", "s5", "s6"] as const;

/* ══════════════════════════════════════════════════════════════════════════
   3) OYUNCULAR — KALDIRILDI

   Bu sekme, OYUNCULAR ANA SEKMESİYLE birebir aynı ekrandı: aynı uç
   (`/api/oyuncu-listesi`), aynı kapsam, aynı altı sıralama ölçütü
   (En Değerliler · Gol Krallığı · En Çok Maç · Puan/Maç · Gol/Maç · Kartlar),
   aynı podyum ve aynı satır düzeni. Yani bir kullanıcı gol krallığına iki
   ayrı menü basamağından ulaşıyordu.

   Kanonik kapı: alt çubuktaki OYUNCULAR sekmesi. Kapsam seçimi ikisinde de
   ortak (`ScopeProvider`) olduğu için buradan oraya geçen kullanıcı aynı
   lig ve sezonu görmeye devam eder — bilgi kaybı yoktur.
   ══════════════════════════════════════════════════════════════════════════ */

/** Sayıya çevir; sunucu bazı toplamları DİZE olarak döndürüyor. */
const num = (value: number | string | null | undefined) => Number(value ?? 0) || 0;

/* ══════════════════════════════════════════════════════════════════════════
   4) İSTATİSTİK — tablodan türeyen liderler + disiplin girişi
   ══════════════════════════════════════════════════════════════════════════ */

interface StatEntry {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  name: string;
  detail: string;
  logo?: string | null;
  teamId?: number | null;
  playerId?: number | null;
}

const StatItem = React.memo(function StatItem({
  icon,
  label,
  name,
  detail,
  logo,
  targetId,
  kind,
  position,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  name: string;
  detail: string;
  logo: string | null;
  targetId: number | null;
  kind: "team" | "player" | "none";
  position: "single" | "first" | "middle" | "last";
  onPress: (kind: "team" | "player", id: number) => void;
}) {
  const handlePress = useCallback(() => {
    if (kind === "none" || targetId == null) return;
    onPress(kind, targetId);
  }, [kind, onPress, targetId]);

  return (
    <ListRow
      position={position}
      title={name}
      subtitle={detail}
      value={label}
      onPress={kind === "none" || targetId == null ? undefined : handlePress}
      leading={
        logo != null || kind === "team" ? (
          <TeamLogo name={name} logo={logo} size={layout.crestLg} />
        ) : (
          { icon, tone: "brand" as const }
        )
      }
    />
  );
});

function StatsTab({ scrollProps, onPickScope }: TabProps) {
  const scope = useScope();
  const router = useRouter();

  const scopeKey = {
    cityId: scope.cityId ?? undefined,
    leagueId: scope.leagueId ?? undefined,
    seasonId: scope.seasonId ?? undefined,
  };

  const standings = useQuery({
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

  const scorers = useQuery({
    queryKey: queryKeys.playerRankings(scopeKey, "topScorers"),
    queryFn: () => getPlayerRankings(scopeKey, "topScorers"),
    enabled: scope.ready,
    staleTime: 60_000,
  });

  const cards = useQuery({
    queryKey: queryKeys.playerRankings(scopeKey, "mostCards"),
    queryFn: () => getPlayerRankings(scopeKey, "mostCards"),
    enabled: scope.ready,
    staleTime: 60_000,
  });

  const refetchAll = useCallback(() => {
    void standings.refetch();
    void scorers.refetch();
    void cards.refetch();
  }, [cards, scorers, standings]);

  const refresh = useRefresh(refetchAll, {
    refreshing: standings.isRefetching || scorers.isRefetching || cards.isRefetching,
  });

  const teamEntries = useMemo<StatEntry[]>(() => {
    const rows = (standings.data ?? []).filter((row) => row.played > 0);
    if (rows.length === 0) return [];
    const winsInLast5 = (row: StandingRow) =>
      (row.last5 ?? "").slice(-5).split("").filter((letter) => letter === "W").length;

    const leader = (standings.data ?? [])[0];
    const topScoring = [...rows].sort((a, b) => b.goals_for - a.goals_for)[0];
    const bestDefense = [...rows].sort((a, b) => a.goals_against - b.goals_against)[0];
    const inForm = [...rows].sort((a, b) => winsInLast5(b) - winsInLast5(a))[0];

    const entries: StatEntry[] = [];
    if (leader) {
      entries.push({
        key: "leader",
        icon: "trophy",
        label: "LİDER",
        name: leader.team_name,
        detail: `${leader.display_points} puan · ${leader.played} maç`,
        logo: leader.logo,
        teamId: leader.team_id,
      });
    }
    entries.push({
      key: "attack",
      icon: "football",
      label: "EN GOLCÜ",
      name: topScoring.team_name,
      detail: `${topScoring.goals_for} gol attı`,
      logo: topScoring.logo,
      teamId: topScoring.team_id,
    });
    entries.push({
      key: "defense",
      icon: "shield-checkmark",
      label: "EN AZ GOL YİYEN",
      name: bestDefense.team_name,
      detail: `${bestDefense.goals_against} gol yedi`,
      logo: bestDefense.logo,
      teamId: bestDefense.team_id,
    });
    entries.push({
      key: "form",
      icon: "flame",
      label: "FORMDA",
      name: inForm.team_name,
      detail: `Son 5: ${(inForm.last5 ?? "").slice(-5) || "—"}`,
      logo: inForm.logo,
      teamId: inForm.team_id,
    });
    return entries;
  }, [standings.data]);

  const playerEntries = useMemo<StatEntry[]>(() => {
    const entries: StatEntry[] = [];
    const topScorer = (scorers.data?.players ?? [])[0];
    const topCards = (cards.data?.players ?? [])[0];
    if (topScorer) {
      entries.push({
        key: "scorer",
        icon: "football-outline",
        label: "GOL KRALI",
        name: topScorer.name,
        detail: `${num(topScorer.goals)} gol · ${topScorer.teamName ?? "Takımsız"}`,
        playerId: topScorer.id,
      });
    }
    if (topCards) {
      entries.push({
        key: "cards",
        icon: "warning-outline",
        label: "EN ÇOK KART",
        name: topCards.name,
        detail: `${num(topCards.cards)} kart · ${topCards.teamName ?? "Takımsız"}`,
        playerId: topCards.id,
      });
    }
    return entries;
  }, [cards.data, scorers.data]);

  const openTarget = useCallback(
    (kind: "team" | "player", id: number) =>
      router.push(kind === "team" ? `/takim/${id}` : `/oyuncu/${id}`),
    [router],
  );

  const sections = useMemo(
    () => [
      { title: "Takım liderleri", data: teamEntries },
      { title: "Oyuncu liderleri", data: playerEntries },
    ],
    [playerEntries, teamEntries],
  );

  const renderItem = useCallback(
    ({ item, index, section }: { item: StatEntry; index: number; section: { data: StatEntry[] } }) => (
      <StatItem
        icon={item.icon}
        label={item.label}
        name={item.name}
        detail={item.detail}
        logo={item.logo ?? null}
        targetId={item.teamId ?? item.playerId ?? null}
        kind={item.teamId != null ? "team" : item.playerId != null ? "player" : "none"}
        position={
          section.data.length === 1
            ? "single"
            : index === 0
              ? "first"
              : index === section.data.length - 1
                ? "last"
                : "middle"
        }
        onPress={openTarget}
      />
    ),
    [openTarget],
  );

  const loading = standings.isLoading || scorers.isLoading || cards.isLoading;

  if (!scope.ready && !scope.loading) return <ScopeMissing onPress={onPickScope} />;
  if (loading || scope.loading) {
    return (
      <View style={styles.listContent}>
        {SKELETON_ROWS.map((key) => (
          <SkeletonListRow key={key} />
        ))}
      </View>
    );
  }

  return (
    <SectionList
      {...scrollProps}
      sections={sections.filter((section) => section.data.length > 0)}
      keyExtractor={statKey}
      renderItem={renderItem}
      renderSectionHeader={renderStatHeader}
      contentContainerStyle={styles.listContent}
      refreshControl={
        <RefreshControl {...refreshControlProps(refresh.refreshing, refresh.onRefresh)} />
      }
      /* Disiplin kartı kaldırıldı: `/cezalar` ekranının kanonik kapısı
         Menü → Bilgi → Cezalar'dır. İstatistik sekmesi istatistik gösterir. */
      ListEmptyComponent={
        <EmptyState
          icon="stats-chart-outline"
          title="İstatistik yok"
          body="Bu sezonda henüz oynanmış maç bulunmuyor."
        />
      }
    />
  );
}

const statKey = (item: StatEntry) => item.key;
const renderStatHeader = ({ section }: { section: { title: string } }) => (
  <SectionHeader title={section.title} />
);

/* ══════════════════════════════════════════════════════════════════════════
   5) HABERLER — editör haberleri + üretilmiş duyurular
   ══════════════════════════════════════════════════════════════════════════ */

type NewsFilter = "all" | NewsItem["kind"];

const NEWS_FILTERS: { key: NewsFilter; label: string }[] = [
  { key: "all", label: "Tümü" },
  { key: "news", label: "Haberler" },
  { key: "transfer", label: "Transferler" },
  { key: "penalty", label: "Cezalar" },
];

const NEWS_TONE: Record<NewsItem["kind"], "brand" | "info" | "danger"> = {
  news: "brand",
  transfer: "info",
  penalty: "danger",
};

const NEWS_LABEL: Record<NewsItem["kind"], string> = {
  news: "HABER",
  transfer: "TRANSFER",
  penalty: "DİSİPLİN",
};

const NewsItemRow = React.memo(function NewsItemRow({
  id,
  kind,
  title,
  summary,
  cover,
  when,
  onPress,
}: {
  id: string;
  kind: NewsItem["kind"];
  title: string;
  summary: string;
  cover: string | null;
  when: string;
  onPress: ((id: string) => void) | null;
}) {
  const handlePress = useCallback(() => onPress?.(id), [id, onPress]);
  const body = (
    <View style={styles.newsBody}>
      <View style={styles.newsMeta}>
        <Badge label={NEWS_LABEL[kind]} tone={NEWS_TONE[kind]} size="xs" />
        <Text style={styles.newsWhen} {...textScale.badge}>
          {when}
        </Text>
      </View>
      <Text style={styles.newsTitle} numberOfLines={2} {...textScale.dense}>
        {title}
      </Text>
      {summary ? (
        <Text style={styles.newsSummary} numberOfLines={2} {...textScale.long}>
          {summary}
        </Text>
      ) : null}
    </View>
  );

  if (!onPress) return <View style={styles.newsCard}>{body}</View>;

  return (
    <Touchable style={styles.newsCard} onPress={handlePress} feedback="card" haptic="selection">
      {cover ? (
        <View style={styles.newsCoverWrap}>
          <Image source={{ uri: cover }} style={styles.newsCover} resizeMode="cover" />
        </View>
      ) : null}
      {body}
    </Touchable>
  );
});

function NewsTab({ scrollProps }: { scrollProps: ScrollChrome }) {
  const scope = useScope();
  const router = useRouter();
  const [filter, setFilter] = useState<NewsFilter>("all");

  const scopeKey = {
    cityId: scope.cityId ?? undefined,
    leagueId: scope.leagueId ?? undefined,
    seasonId: scope.seasonId ?? undefined,
  };

  // Haberler kapsam seçilmeden de gösterilebilir: kapsamsız istek "tümü" demektir.
  const query = useQuery({
    queryKey: queryKeys.newsFeed(scopeKey),
    queryFn: () => getNewsFeed(scopeKey),
    staleTime: 2 * 60_000,
  });

  const refresh = useRefresh(query.refetch, { refreshing: query.isRefetching });

  const items = useMemo(() => {
    const all = query.data?.items ?? [];
    return filter === "all" ? all : all.filter((item) => item.kind === filter);
  }, [filter, query.data]);

  const openNews = useCallback(
    (id: string) => router.push({ pathname: "/haber/[id]", params: { id } }),
    [router],
  );

  const renderItem = useCallback(
    ({ item }: { item: NewsItem }) => (
      <NewsItemRow
        id={item.id}
        kind={item.kind}
        title={item.title}
        summary={stripHtml(item.summary ?? item.content, 140)}
        cover={mediaUrl(item.cover_image_url)}
        when={timeAgo(item.published_at)}
        // Yalnız editör haberinin detay sayfası var; üretilmiş duyurular
        // (transfer/disiplin) kendi başlığında zaten tam bilgiyi taşır.
        onPress={item.kind === "news" ? openNews : null}
      />
    ),
    [openNews],
  );

  if (query.isLoading) {
    return (
      <View style={styles.listContent}>
        {SKELETON_ROWS.map((key) => (
          <SkeletonListRow key={key} />
        ))}
      </View>
    );
  }
  if (query.isError && items.length === 0) {
    return <ErrorState error={query.error} onRetry={query.refetch} />;
  }

  return (
    <FlatList
      {...scrollProps}
      data={items}
      keyExtractor={newsKey}
      renderItem={renderItem}
      initialNumToRender={8}
      windowSize={8}
      contentContainerStyle={styles.listContent}
      refreshControl={
        <RefreshControl {...refreshControlProps(refresh.refreshing, refresh.onRefresh)} />
      }
      ListHeaderComponent={
        <View style={styles.newsHeader}>
          <ChipGroup>
            {NEWS_FILTERS.map((item) => (
              <Chip
                key={item.key}
                label={item.label}
                selected={item.key === filter}
                onPress={() => setFilter(item.key)}
              />
            ))}
          </ChipGroup>
          {query.isError ? <ErrorState error={query.error} variant="banner" /> : null}
        </View>
      }
      ListEmptyComponent={
        <EmptyState
          icon="newspaper-outline"
          title="Haber yok"
          body="Bu kapsamda yayımlanmış içerik bulunmuyor."
          variant="inline"
        />
      }
    />
  );
}

const newsKey = (item: NewsItem) => `${item.kind}-${item.id}`;

/* ══════════════════════════════════════════════════════════════════════════
   6) ARŞİV — geçmiş sezonlara geçiş
   ══════════════════════════════════════════════════════════════════════════ */

const SeasonItem = React.memo(function SeasonItem({
  seasonId,
  label,
  current,
  archived,
  favorite,
  position,
  onPress,
  onToggleFavorite,
}: {
  seasonId: number;
  label: string;
  current: boolean;
  archived: boolean;
  favorite: boolean;
  position: "single" | "first" | "middle" | "last";
  onPress: (seasonId: number) => void;
  onToggleFavorite: (seasonId: number, label: string) => void;
}) {
  const handlePress = useCallback(() => onPress(seasonId), [onPress, seasonId]);
  const handleStar = useCallback(
    () => onToggleFavorite(seasonId, label),
    [label, onToggleFavorite, seasonId],
  );

  return (
    <ListRow
      position={position}
      title={label}
      onPress={handlePress}
      leading={{ icon: "calendar-outline", tone: current ? "brand" : "neutral" }}
      trailing={
        <View style={styles.seasonTrailing}>
          {current ? <Badge label="ŞU AN" tone="brand" size="xs" /> : null}
          {!current && archived ? <Badge label="TAMAMLANDI" tone="neutral" size="xs" /> : null}
          {/* Sezon yıldızı ayrı dokunma alanıdır: satıra basmak sezona GEÇER,
              yıldız yalnız favoriye alır (eski Puan Durumu ekranındaki
              "Sezonu favoriye al" çipinin karşılığı). */}
          <Touchable
            onPress={handleStar}
            feedback="icon"
            haptic="light"
            hitSlop={touchSlop(20)}
            accessibilityRole="button"
            accessibilityLabel={favorite ? "Sezonu favorilerden çıkar" : "Sezonu favoriye al"}
          >
            <Ionicons
              name={favorite ? "star" : "star-outline"}
              size={18}
              color={favorite ? colors.star : colors.starEmpty}
            />
          </Touchable>
        </View>
      }
    />
  );
});

function ArchiveTab({
  scrollProps,
  onGoStandings,
}: {
  scrollProps: ScrollChrome;
  onGoStandings: () => void;
}) {
  const scope = useScope();
  const { isFavoriteSeason, toggleFavoriteSeason } = useFavorite();

  const openSeason = useCallback(
    (seasonId: number) => {
      scope.selectSeason(seasonId);
      onGoStandings();
    },
    [onGoStandings, scope],
  );

  const seasons = scope.seasons;

  const starSeason = useCallback(
    (seasonId: number, label: string) => toggleFavoriteSeason({ id: seasonId, name: label }),
    [toggleFavoriteSeason],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: { id: number; label: string; is_archived?: boolean }; index: number }) => (
      <SeasonItem
        seasonId={item.id}
        label={item.label}
        current={item.id === scope.seasonId}
        archived={Boolean(item.is_archived)}
        favorite={isFavoriteSeason(item.id)}
        position={
          seasons.length === 1
            ? "single"
            : index === 0
              ? "first"
              : index === seasons.length - 1
                ? "last"
                : "middle"
        }
        onPress={openSeason}
        onToggleFavorite={starSeason}
      />
    ),
    [isFavoriteSeason, openSeason, scope.seasonId, seasons.length, starSeason],
  );

  if (scope.loading) {
    return (
      <View style={styles.listContent}>
        {SKELETON_ROWS.map((key) => (
          <SkeletonListRow key={key} />
        ))}
      </View>
    );
  }

  return (
    <FlatList
      {...scrollProps}
      data={seasons}
      keyExtractor={seasonKey}
      renderItem={renderItem}
      getItemLayout={seasonLayout}
      contentContainerStyle={styles.listContent}
      ListHeaderComponent={
        <View style={styles.archiveIntro}>
          <Text style={styles.archiveHint} {...textScale.long}>
            Bir sezona dokununca uygulama o sezona geçer; puan durumu, fikstür ve
            oyuncular o sezonun verileriyle gezilir. Üstteki kapsam çipinden
            istediğin an güncel sezona dönebilirsin.
          </Text>
          <SectionHeader
            title={scope.leagueLabel || "Sezonlar"}
            meta={`${seasons.length} sezon`}
            action={{ label: "Lig değiştir", onPress: () => scope.openScopeSheet("league") }}
          />
        </View>
      }
      ListEmptyComponent={
        <EmptyState
          icon="archive-outline"
          title="Arşiv boş"
          body="Bu ligde listelenecek sezon bulunmuyor."
          action={{ label: "Lig seç", onPress: () => scope.openScopeSheet("league") }}
        />
      }
    />
  );
}

const seasonKey = (item: { id: number }) => String(item.id);
const seasonLayout = (
  _data: ArrayLike<{ id: number }> | null | undefined,
  index: number,
) => ({ length: layout.listRowHeight, offset: layout.listRowHeight * index, index });

/* ══════════════════════════════════════════════════════════════════════════ */

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  headerBottom: { gap: space.sm },
  scopeRow: { paddingHorizontal: layout.screenPadding, flexDirection: "row" },
  listContent: {
    paddingHorizontal: layout.screenPadding,
    paddingBottom: layout.tabBarHeight + space.xxl,
    flexGrow: 1,
  },
  footnote: {
    ...type.caption,
    color: colors.textTertiary,
    letterSpacing: 0,
    lineHeight: 18,
    paddingTop: space.md,
  },

  /* — Puan tablosu —
     DAR KENAR: bu tablo sekiz sütun taşıyor (bölge, sıra, arma, ad, O/AV/P,
     son 5) ve 360px'lik bir ekranda 20px kenarla takım adına 97px kalıyor.
     `screenPaddingDense` ile 113px'e çıkıyor — yoğun tablo düzenleri için
     ayrılan istisna tam olarak budur. Diğer beş sekme normal kenarı kullanır. */
  standingsContent: {
    paddingHorizontal: layout.screenPaddingDense,
    paddingBottom: layout.tabBarHeight + space.xxl,
    flexGrow: 1,
  },
  stHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingVertical: space.sm,
  },
  stHeadRank: { ...type.micro, color: colors.textTertiary, width: 20, textAlign: "center" },
  stHeadTeam: { ...type.micro, color: colors.textTertiary, flex: 1, marginLeft: layout.crestMd + space.sm },
  stHeadNum: { ...type.micro, color: colors.textTertiary, width: 30, textAlign: "center" },
  stRow: {
    height: STANDING_ROW_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.separator,
  },
  stZone: { width: 3, height: 28, borderRadius: radius.xs, backgroundColor: "transparent" },
  stRank: { ...type.tableNum, color: colors.textSecondary, width: 20, textAlign: "center" },
  stNameBox: { flex: 1, gap: 3 },
  stNameRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  stName: { ...type.body, color: colors.textPrimary, fontFamily: fonts.bold, flexShrink: 1 },
  stNameFav: { color: colors.brandAccent },
  stNum: { ...type.tableNum, width: 30, textAlign: "center" },
  stMuted: { color: colors.textSecondary },
  stPos: { color: colors.win, fontFamily: fonts.bold },
  stNeg: { color: colors.loss, fontFamily: fonts.bold },
  stPoints: { ...type.tableNumStrong, color: colors.textPrimary, width: 30, textAlign: "center" },

  /* — Oyuncular — */
  plHeader: { gap: space.sm, paddingBottom: space.sm },
  plLeading: { flexDirection: "row", alignItems: "center", gap: space.sm },
  plRank: { ...type.tableNum, color: colors.textTertiary, width: 18, textAlign: "center" },
  plMetric: { alignItems: "flex-end", minWidth: 44 },
  plMetricValue: { ...type.tableNumStrong, color: colors.brandAccent },
  plMetricUnit: { ...type.micro, color: colors.textTertiary },

  /* — İstatistik — */
  statFooter: { paddingTop: space.lg },

  /* — Haberler — */
  newsHeader: { gap: space.sm, paddingBottom: space.sm },
  newsCard: {
    backgroundColor: colors.surface1,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: space.sm,
    overflow: "hidden",
  },
  newsCoverWrap: { height: 140, backgroundColor: colors.surface2 },
  newsCover: { width: "100%", height: "100%" },
  newsBody: { padding: space.md, gap: space.xs },
  newsMeta: { flexDirection: "row", alignItems: "center", gap: space.sm },
  newsWhen: { ...type.micro, color: colors.textTertiary },
  newsTitle: { ...type.h3, color: colors.textPrimary },
  newsSummary: { ...type.bodySm, color: colors.textSecondary, lineHeight: 18 },

  /* — Arşiv — */
  archiveIntro: { gap: space.sm, paddingTop: space.sm },
  archiveHint: { ...type.bodySm, color: colors.textSecondary, lineHeight: 19 },
  seasonTrailing: { flexDirection: "row", alignItems: "center", gap: space.sm },
});
