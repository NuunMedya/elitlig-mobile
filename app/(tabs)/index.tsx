/**
 * GENEL BAKIŞ — uygulamanın açılış ekranı ve tek bakışta durum özeti.
 *
 * NEDEN GERİ GELDİ: bir önceki düzende açılış doğrudan maç listesiydi ve
 * uygulamanın geri kalanı (takım paneli, kadro, maç talepleri, bildirimler)
 * Profil sekmesinin altındaki satırlardan ulaşılıyordu. Amatör ligde
 * kullanıcıların çoğu bir takıma bağlıdır ve açılışta üç soruyu sorar:
 *   1. Takımımın sıradaki / şu anki maçı ne durumda?
 *   2. Beni bekleyen bir iş var mı (talep, teklif, mesaj, kadro)?
 *   3. Bugün ligde ne oynanıyor?
 * Bu ekran üçünü de kaydırmadan yanıtlar; her biri kendi bölümünde ve hepsi
 * "dokun → asıl ekran" kapısıdır. Ekran hiçbir veriyi KOPYALAMAZ, yalnız
 * yönlendirir; asıl liste hep kendi sekmesindedir.
 *
 * NEDEN ROLE GÖRE DEĞİŞİR:
 *   · Takım başkanı  → Kulüp metrikleri + kadro/maç merkezi/talep kısayolları.
 *   · Oyuncu         → Sıradaki maçı, kadroda olup olmadığı, kariyer kapıları.
 *   · Misafir/taraftar→ Favori takım maçı, canlı maçlar, lig özeti.
 * Herkese aynı ekranı göstermek, kullanıcıların çoğu için ekranın yarısını
 * ölü alana çevirirdi.
 *
 * SORGU DİSİPLİNİ: girişsiz kullanıcıda panel sorguları HİÇ açılmaz
 * (`enabled`), kapsam hazır değilken lig sorguları açılmaz. Ekran açılışta en
 * fazla üç istek yapar; kalanları rol koşullarına bağlıdır.
 *
 * PERFORMANS: tek ScrollView değil, bölümlerden oluşan bir `ScrollView` +
 * memo'lu kart bileşenleri. Liste burada YOK — en fazla 5 satırlık kesitler
 * var; sanal listeye gerek duyacak uzunlukta hiçbir bölüm çizilmez.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useCallback, useMemo } from "react";
import { Image, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ScopeChip } from "@/components/ScopeChip";
import {
  ActionRow,
  ActionTile,
  Button,
  EmptyState,
  ErrorState,
  MatchRow,
  MetricGrid,
  MetricTile,
  PlayerRow,
  ScreenHeader,
  SectionHeader,
  SkeletonCard,
  SkeletonMatchRow,
  SpotlightCard,
  TeamRow,
  TeamRowHead,
  Touchable,
  refreshControlProps,
  useHeaderScroll,
  useRefresh,
} from "@/components/ui";
import { useTeamLogos } from "@/hooks/useTeamLogos";
import { useUnreadCount } from "@/hooks/useUnreadCount";
import { getLiveMatches, getMatches } from "@/lib/api/matches";
import { getPlayerRankings } from "@/lib/api/players";
import { getMyMatchRequests, getTeamDashboard, getTeamMatches } from "@/lib/api/team";
import { getStandings } from "@/lib/api/standings";
import { formatDayHeading, mediaUrl, timeAgo } from "@/lib/format";
import { matchState } from "@/lib/match";
import { getNewsFeed } from "@/lib/api/news";
import { queryKeys } from "@/lib/queryKeys";
import type { ApiMatch, NewsItem, StandingRow } from "@/lib/types";
import { useAuth } from "@/providers/AuthProvider";
import { useFavorite } from "@/providers/FavoriteProvider";
import { useScope } from "@/providers/ScopeProvider";
import {
  colors,
  defaultZoneRules,
  elevate,
  hairline,
  layout,
  palette,
  radius,
  space,
  textScale,
  type,
  zoneColor,
  zoneForRank,
} from "@/theme";

const PRESIDENT_PROFILES = new Set(["takim_baskani", "double"]);

/** Bölümlerde gösterilen en fazla satır sayısı — gerisi "Tümü" kapısından. */
const PREVIEW_LIMIT = 4;

/** Mini puan tablosunda gösterilen sıra sayısı. */
const MINI_TABLE_LIMIT = 5;

const pad2 = (value: number) => String(value).padStart(2, "0");

/** Cihazın bugünü — sunucu saati değil; gün şeridi de aynı kaynağı kullanır. */
function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

const matchDay = (match: ApiMatch) => String(match.date ?? "").slice(0, 10);

/** "18:30" → dakikaya çevrilmiş sıralama anahtarı. Boş saat sona düşer. */
function kickoffKey(match: ApiMatch): number {
  const [hour, minute] = String(match.time ?? "").split(":");
  const value = Number(hour) * 60 + Number(minute);
  return Number.isFinite(value) ? value : 24 * 60;
}

/* ══════════════════════════════════════════════════════════════════════════
   Küçük yapı taşları
   ══════════════════════════════════════════════════════════════════════════ */

/** Bölüm başlığı + "Tümü" kapısı. SectionHeader'ın ekran içi sarmalayıcısı. */
const Block = React.memo(function Block({
  title,
  meta,
  actionLabel,
  onAction,
  children,
}: {
  title: string;
  meta?: string;
  actionLabel?: string;
  onAction?: () => void;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.block}>
      <SectionHeader
        title={title}
        meta={meta}
        action={actionLabel && onAction ? { label: actionLabel, onPress: onAction } : undefined}
      />
      {children}
    </View>
  );
});

/** Mini puan tablosu satırı — sıra, amblem, ad, form, puan. */
/**
 * HABER ŞERİDİ — kapağı olan son beş haber, yatay kaydırmalı kompakt kartlar.
 *
 * NEDEN KARUSEL DEĞİL: eski 16:10 manşet karuseli sayfanın en üstünde
 * 240px'lik bir fotoğrafla açılıyordu; kullanıcının ilk gördüğü şey ligin
 * verisi değil bir haber görseliydi ve sayfa "dergi" gibi okunuyordu. Genel
 * Bakış bir ARAÇ sayfasıdır: önce maç, puan ve gol; haber en altta, küçük
 * kartlarda. Kart 200px genişlikte, görsel 16:10, iki satır başlık.
 */
const NEWS_CARD_WIDTH = 200;

const NewsStrip = React.memo(function NewsStrip({
  items,
  onOpen,
}: {
  items: NewsItem[];
  onOpen: (id: NewsItem["id"]) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.newsStrip}
      decelerationRate="fast"
      snapToInterval={NEWS_CARD_WIDTH + space.sm}
      snapToAlignment="start"
    >
      {items.map((item) => (
        <Touchable
          key={item.id}
          feedback="card"
          haptic="selection"
          onPress={() => onOpen(item.id)}
          style={styles.newsCard}
          accessibilityRole="button"
          accessibilityLabel={item.title}
        >
          <Image
            source={{ uri: mediaUrl(item.cover_image_url) ?? undefined }}
            style={styles.newsImage}
            resizeMode="cover"
            accessibilityIgnoresInvertColors
          />
          <View style={styles.newsBody}>
            {item.category_label || item.category ? (
              <Text style={styles.newsEyebrow} numberOfLines={1} {...textScale.badge}>
                {String(item.category_label ?? item.category).toLocaleUpperCase("tr-TR")}
              </Text>
            ) : null}
            <Text style={styles.newsTitle} numberOfLines={2} {...textScale.dense}>
              {item.title}
            </Text>
            <Text style={styles.newsMeta} numberOfLines={1} {...textScale.dense}>
              {timeAgo(item.published_at)}
            </Text>
          </View>
        </Touchable>
      ))}
    </ScrollView>
  );
});

export default function OverviewScreen() {
  const router = useRouter();
  const auth = useAuth();
  const scope = useScope();
  const favorite = useFavorite();
  const unread = useUnreadCount();
  const teams = useTeamLogos();
  const { scrollY, scrollProps } = useHeaderScroll();

  const user = auth.user;
  const signedIn = Boolean(user);
  const isPresident = Boolean(user && PRESIDENT_PROFILES.has(String(user.profile_type ?? "")));

  const today = useMemo(() => todayIso(), []);
  const go = useCallback((route: string) => router.push(route as never), [router]);

  const scopeKey = {
    cityId: scope.cityId ?? undefined,
    leagueId: scope.leagueId ?? undefined,
    seasonId: scope.seasonId ?? undefined,
  };

  /* ---------------------------- SORGULAR ---------------------------------- */

  /* Canlı maçlar kapsam bağımsızdır: kullanıcı kendi liginde maç yokken bile
     "şu an bir şey oynanıyor mu" sorusunun yanıtını almalı. */
  const liveQuery = useQuery({
    queryKey: queryKeys.liveMatches(scopeKey),
    queryFn: () => getLiveMatches({ leagueId: scope.leagueId ?? undefined }),
    enabled: scope.ready,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  const matchesQuery = useQuery({
    queryKey: queryKeys.matches(scopeKey),
    queryFn: () =>
      getMatches({
        leagueId: scope.leagueId ?? undefined,
        seasonId: scope.seasonId ?? undefined,
        limit: 300,
      }),
    enabled: scope.ready,
    staleTime: 60_000,
  });

  /*
    MANŞET KAYNAĞI — haber akışı. Editör haberleri, tamamlanan transferler ve
    disiplin kararları tek uçtan geliyor; karusel bunların KAPAK GÖRSELİ OLAN
    ilk beşini gösterir. Görselsiz bir manşet 16:10'luk bir kutuda boş koyu
    blok demektir, o yüzden elenirler.
  */
  const newsQuery = useQuery({
    queryKey: queryKeys.newsFeed(scopeKey),
    queryFn: () => getNewsFeed(scopeKey),
    enabled: scope.ready,
    staleTime: 5 * 60_000,
  });

  const standingsQuery = useQuery({
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

  /* Gol krallığı — sayfanın "kim atıyor" sorusu; ilk üç yeter, gerisi
     Oyuncular sekmesinde. */
  const scorersQuery = useQuery({
    queryKey: queryKeys.playerRankings(scopeKey, "topScorers"),
    queryFn: () => getPlayerRankings(scopeKey, "topScorers"),
    enabled: scope.ready,
    staleTime: 5 * 60_000,
  });

  /* Panel sorguları YALNIZ başkanda açılır: misafir ve sıradan oyuncu için
     403 dönerdi ve boş yere ağ trafiği üretirdi. */
  const dashboardQuery = useQuery({
    queryKey: ["takim", "dashboard"],
    queryFn: getTeamDashboard,
    enabled: isPresident,
    staleTime: 120_000,
    retry: false,
  });

  const teamMatchesQuery = useQuery({
    queryKey: ["takim", "matches"],
    queryFn: getTeamMatches,
    enabled: isPresident,
    staleTime: 120_000,
    retry: false,
  });

  const requestsQuery = useQuery({
    queryKey: ["team", "match-requests"],
    queryFn: () => getMyMatchRequests("all"),
    enabled: isPresident,
    staleTime: 120_000,
    retry: false,
  });

  const refresh = useRefresh(
    async () => {
      await Promise.all([
        liveQuery.refetch(),
        matchesQuery.refetch(),
        standingsQuery.refetch(),
        isPresident ? dashboardQuery.refetch() : Promise.resolve(),
        isPresident ? teamMatchesQuery.refetch() : Promise.resolve(),
        isPresident ? requestsQuery.refetch() : Promise.resolve(),
      ]);
    },
    { refreshing: liveQuery.isRefetching || matchesQuery.isRefetching },
  );

  /* ---------------------------- TÜRETİLEN VERİ ---------------------------- */

  const liveMatches = useMemo(() => liveQuery.data ?? [], [liveQuery.data]);

  const allMatches = useMemo(() => matchesQuery.data ?? [], [matchesQuery.data]);

  const todayMatches = useMemo(
    () =>
      allMatches
        .filter((match) => matchDay(match) === today)
        .sort((a, b) => kickoffKey(a) - kickoffKey(b)),
    [allMatches, today],
  );

  /** Bugün maç yoksa vitrin bir sonraki maç gününü gösterir — boş bölüm çizmez. */
  const nextDay = useMemo(() => {
    if (todayMatches.length) return null;
    const upcoming = allMatches
      .filter((match) => matchDay(match) > today)
      .sort((a, b) => (matchDay(a) < matchDay(b) ? -1 : 1));
    return upcoming.length ? matchDay(upcoming[0]) : null;
  }, [allMatches, today, todayMatches.length]);

  const nextDayMatches = useMemo(
    () =>
      nextDay
        ? allMatches
            .filter((match) => matchDay(match) === nextDay)
            .sort((a, b) => kickoffKey(a) - kickoffKey(b))
        : [],
    [allMatches, nextDay],
  );

  const standings = useMemo(() => standingsQuery.data ?? [], [standingsQuery.data]);

  const team = dashboardQuery.data?.team ?? null;

  /** Kulübün lig sırası — puan tablosundan bulunur, ayrı istek yoktur. */
  const teamRank = useMemo(() => {
    if (!team) return null;
    const index = standings.findIndex((row) => row.team_id === team.id);
    return index >= 0 ? index + 1 : null;
  }, [standings, team]);

  const pendingRequests = useMemo(
    () => (requestsQuery.data?.items ?? []).filter((item) => item.status === "pending").length,
    [requestsQuery.data],
  );

  const rosterCount = useMemo(() => {
    const roster = dashboardQuery.data?.roster;
    if (!roster) return null;
    return roster.contracted.length + roster.withoutContract.length;
  }, [dashboardQuery.data]);

  /**
   * VİTRİN MAÇI — öncelik sırası:
   *   1. Kulübün / favori takımın CANLI maçı
   *   2. Herhangi bir canlı maç
   *   3. Kulübün sıradaki maçı
   *   4. Bugünün ilk maçı
   * Hiçbiri yoksa vitrin çizilmez; boş bir hero kart ekranın en değerli
   * alanını harcar.
   */
  const spotlight = useMemo(() => {
    const teamIds = new Set<number>(favorite.favorites.map((entry) => entry.id));
    if (team) teamIds.add(team.id);

    /* Eski maç kayıtlarında takım id'si boştur; ada göre de eşleşmek gerekir
       (useTeamLogos ile aynı iki yollu eşleştirme mantığı). */
    const teamNames = new Set<string>(
      favorite.favorites.map((entry) => entry.name.trim().toLocaleLowerCase("tr-TR")),
    );
    if (team?.team_name) teamNames.add(team.team_name.trim().toLocaleLowerCase("tr-TR"));

    const involves = (match: ApiMatch) =>
      teamIds.has(Number(match.home_team_id)) ||
      teamIds.has(Number(match.away_team_id)) ||
      teamNames.has(String(match.first_team_name ?? "").trim().toLocaleLowerCase("tr-TR")) ||
      teamNames.has(String(match.second_team_name ?? "").trim().toLocaleLowerCase("tr-TR"));

    const mine = liveMatches.find(involves);
    if (mine) return { match: mine, eyebrow: "Takımın sahada", live: true as const };

    if (liveMatches.length) {
      // Etiket "Canlı" OLAMAZ: kartın solundaki canlı rozeti zaten "CANLI"
      // yazıyor ve ikisi yan yana "CANLI CANLI" olarak okunuyordu.
      return { match: liveMatches[0], eyebrow: "Şu an oynanıyor", live: true as const };
    }

    const upcoming = teamMatchesQuery.data?.upcoming ?? [];
    if (upcoming.length) {
      const next = upcoming[0];
      return {
        teamMatch: next,
        eyebrow: "Sıradaki maçın",
        live: false as const,
      };
    }

    const nextOwn = allMatches
      .filter((match) => involves(match) && matchDay(match) >= today)
      .sort((a, b) =>
        matchDay(a) === matchDay(b) ? kickoffKey(a) - kickoffKey(b) : matchDay(a) < matchDay(b) ? -1 : 1,
      )[0];
    if (nextOwn) return { match: nextOwn, eyebrow: "Sıradaki maç", live: false as const };

    /* Sırf "bugün bir maç var" diye vitrin kurulmaz: aynı maç hemen altındaki
       "Bugün" listesinde zaten duruyor ve ekranda iki kez görünüyordu. Vitrin
       yalnız CANLI ya da KULLANICININ maçı için vardır. */
    return null;
  }, [allMatches, favorite.favorites, liveMatches, team, teamMatchesQuery.data, today]);

  /** Kapağı olan son beş haber — şerit görselsiz haber çizmez. */
  const news = useMemo<NewsItem[]>(
    () => (newsQuery.data?.items ?? []).filter((item) => Boolean(item.cover_image_url)).slice(0, 5),
    [newsQuery.data],
  );

  const scorers = useMemo(() => (scorersQuery.data?.players ?? []).slice(0, 3), [scorersQuery.data]);
  const zoneRules = useMemo(() => defaultZoneRules(standings.length), [standings.length]);

  /* ------------------------------- ÇİZİM ---------------------------------- */

  const openMatch = useCallback((id: number) => router.push(`/mac/${id}`), [router]);
  const openTeam = useCallback((teamId: number) => router.push(`/takim/${teamId}`), [router]);
  const openPlayer = useCallback((playerId: number) => router.push(`/oyuncu/${playerId}`), [router]);

  const scopeBusy = scope.loading || (scope.ready && matchesQuery.isLoading);

  const previewMatches = todayMatches.length ? todayMatches : nextDayMatches;
  const previewTitle = todayMatches.length
    ? "Bugün"
    : nextDay
      ? formatDayHeading(nextDay)
      : "Yaklaşan";

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader
        title="Genel Bakış"
        /* Kapsam bloğun üst başlığında, dokunulur: kâğıttaki ayrı kapsam satırı
           aynı bilgiyi ikinci kez yazıyordu. */
        scope={<ScopeChip tone="ink" />}
        scrollY={scrollY}
        actions={[
          {
            icon: "search-outline",
            accessibilityLabel: "Ara",
            onPress: () => go("/ara"),
          },
          {
            icon: "notifications-outline",
            accessibilityLabel: "Bildirimler",
            badge: unread.notifications > 0 ? unread.notifications : undefined,
            onPress: () => go(signedIn ? "/bildirimler" : "/giris"),
          },
        ]}
      />

      <ScrollView
        {...scrollProps}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl {...refreshControlProps(refresh.refreshing, refresh.onRefresh)} />
        }
      >
        {/* ── 1) VİTRİN — yalnız canlı maç ya da kullanıcının maçı ─────── */}
        {scopeBusy && !spotlight ? (
          <View style={styles.pad}>
            <SkeletonCard />
          </View>
        ) : spotlight?.match ? (
          <View style={styles.pad}>
            <SpotlightCard
              eyebrow={spotlight.eyebrow}
              context={spotlight.match.league_name ?? scope.leagueLabel}
              live={spotlight.live}
              home={{
                name: spotlight.match.first_team_name ?? "Ev sahibi",
                logo: teams.logoFor(spotlight.match.home_team_id, spotlight.match.first_team_name),
                score: matchState(spotlight.match) === "scheduled" ? null : spotlight.match.first_team_score,
              }}
              away={{
                name: spotlight.match.second_team_name ?? "Deplasman",
                logo: teams.logoFor(spotlight.match.away_team_id, spotlight.match.second_team_name),
                score: matchState(spotlight.match) === "scheduled" ? null : spotlight.match.second_team_score,
              }}
              statusText={spotlight.match.time ?? undefined}
              footnote={[formatDayHeading(matchDay(spotlight.match)), spotlight.match.match_field]
                .filter(Boolean)
                .join(" · ")}
              onPress={() => openMatch(spotlight.match!.id)}
            />
          </View>
        ) : spotlight?.teamMatch ? (
          <View style={styles.pad}>
            <SpotlightCard
              eyebrow={spotlight.eyebrow}
              context={scope.leagueLabel}
              home={{ name: spotlight.teamMatch.first_team_name }}
              away={{ name: spotlight.teamMatch.second_team_name }}
              statusText={spotlight.teamMatch.time ?? undefined}
              footnote={[
                formatDayHeading(String(spotlight.teamMatch.date ?? "").slice(0, 10)),
                spotlight.teamMatch.match_field,
              ]
                .filter(Boolean)
                .join(" · ")}
              onPress={() => go(`/takimim/mac/${spotlight.teamMatch!.id}`)}
            />
          </View>
        ) : null}

        {/* ── 2) KISAYOLLAR — role göre ─────────────────────────────────── */}
        <View style={[styles.pad, styles.shortcuts]}>
          {isPresident ? (
            <ActionRow columns={4}>
              <ActionTile icon="people" label="Kadro" onPress={() => go("/takimim/kadro")} />
              <ActionTile icon="clipboard" label="Maç Merkezi" onPress={() => go("/takimim/mac-merkezi")} />
              <ActionTile
                icon="add-circle"
                label="Maç Al"
                tone="accent"
                badge={pendingRequests}
                onPress={() => go("/takimim/mac-al")}
              />
              <ActionTile
                icon="chatbubbles"
                label="Mesajlar"
                badge={unread.messages}
                onPress={() => go("/mesajlarim")}
              />
            </ActionRow>
          ) : signedIn ? (
            <ActionRow columns={4}>
              <ActionTile icon="football" label="Maçlarım" onPress={() => go("/oyuncum?tab=maclarim")} />
              <ActionTile icon="swap-horizontal" label="Teklifler" tone="accent" onPress={() => go("/tekliflerim")} />
              <ActionTile
                icon="chatbubbles"
                label="Mesajlar"
                badge={unread.messages}
                onPress={() => go("/mesajlarim")}
              />
              <ActionTile icon="star" label="Favoriler" onPress={() => go("/(tabs)/favoriler")} />
            </ActionRow>
          ) : (
            <ActionRow columns={4}>
              <ActionTile icon="radio" label="Canlı" tone="live" onPress={() => go("/canli")} />
              <ActionTile icon="trophy" label="Ligler" onPress={() => go("/(tabs)/ligler")} />
              <ActionTile icon="star" label="Favoriler" onPress={() => go("/(tabs)/favoriler")} />
              <ActionTile icon="game-controller" label="Oyunlar" tone="accent" onPress={() => go("/(tabs)/oyunlar")} />
            </ActionRow>
          )}
        </View>

        {/* ── 3) KULÜP METRİKLERİ — yalnız başkan ───────────────────────── */}
        {isPresident ? (
          <Block title="Kulübüm" meta={team?.team_name ?? undefined} actionLabel="Panel" onAction={() => go("/takimim")}>
            <View style={styles.pad}>
              <MetricGrid columns={2}>
                <MetricTile
                  label="Lig sırası"
                  value={teamRank ? `${teamRank}.` : "—"}
                  hint={scope.leagueLabel || undefined}
                  tone="accent"
                  icon="podium-outline"
                  onPress={() => go("/(tabs)/takimlar")}
                />
                <MetricTile
                  label="Puan"
                  value={String(team?.team_points ?? 0)}
                  hint={`${team?.total_matches ?? 0} maç`}
                  icon="star-outline"
                />
                <MetricTile
                  label="Kadro"
                  value={rosterCount === null ? "—" : String(rosterCount)}
                  hint="oyuncu"
                  icon="people-outline"
                  onPress={() => go("/takimim/kadro")}
                />
                <MetricTile
                  label="Bekleyen talep"
                  value={String(pendingRequests)}
                  hint="maç talebi"
                  tone={pendingRequests > 0 ? "warn" : "neutral"}
                  icon="time-outline"
                  onPress={() => go("/takimim/mac-al")}
                />
              </MetricGrid>
            </View>
          </Block>
        ) : null}

        {/* ── 4) CANLI ──────────────────────────────────────────────────── */}
        {liveMatches.length ? (
          <Block title="Canlı" meta={`${liveMatches.length} maç`} actionLabel="Tümü" onAction={() => go("/canli")}>
            <View style={styles.group}>
              {liveMatches.slice(0, PREVIEW_LIMIT).map((match, index, list) => (
                <MatchRow
                  key={match.id}
                  match={match}
                  homeLogo={teams.logoFor(match.home_team_id, match.first_team_name)}
                  awayLogo={teams.logoFor(match.away_team_id, match.second_team_name)}
                  myTeamId={team?.id ?? null}
                  myTeamName={team?.team_name ?? null}
                  metaMode="none"
                  position={groupPosition(index, list.length)}
                  onPress={() => openMatch(match.id)}
                />
              ))}
            </View>
          </Block>
        ) : null}

        {/* ── 5) BUGÜN / YAKLAŞAN ───────────────────────────────────────── */}
        <Block
          title={previewTitle}
          meta={previewMatches.length ? `${previewMatches.length} maç` : undefined}
          actionLabel="Maçlar"
          onAction={() => go("/(tabs)/maclar")}
        >
          {scopeBusy ? (
            <View style={styles.group}>
              <SkeletonMatchRow />
              <SkeletonMatchRow />
              <SkeletonMatchRow />
            </View>
          ) : matchesQuery.isError ? (
            <ErrorState error={matchesQuery.error} variant="banner" />
          ) : previewMatches.length ? (
            <View style={styles.group}>
              {previewMatches.slice(0, PREVIEW_LIMIT).map((match, index, list) => (
                <MatchRow
                  key={match.id}
                  match={match}
                  homeLogo={teams.logoFor(match.home_team_id, match.first_team_name)}
                  awayLogo={teams.logoFor(match.away_team_id, match.second_team_name)}
                  myTeamId={team?.id ?? null}
                  myTeamName={team?.team_name ?? null}
                  metaMode="none"
                  position={groupPosition(index, list.length)}
                  onPress={() => openMatch(match.id)}
                />
              ))}
            </View>
          ) : (
            <EmptyState icon="calendar-outline" title="Maç yok" body="Bu ligde yaklaşan maç görünmüyor." variant="inline" />
          )}
        </Block>

        {/* ── 6) PUAN DURUMU — ilk beş, tablo yoğunluğu ──────────────────── */}
        {standings.length ? (
          <Block
            title="Puan durumu"
            meta={scope.leagueLabel || undefined}
            actionLabel="Tümü"
            onAction={() => go("/(tabs)/takimlar")}
          >
            <View style={styles.group}>
              <TeamRowHead density="table" />
              {standings.slice(0, MINI_TABLE_LIMIT).map((row: StandingRow, index) => {
                const rank = index + 1;
                return (
                  <TeamRow
                    key={row.team_id}
                    density="table"
                    rank={rank}
                    teamId={row.team_id}
                    name={row.team_name}
                    logo={row.logo}
                    played={row.played}
                    wins={row.wins}
                    draws={row.draws}
                    losses={row.losses}
                    goalDiff={Number(row.goal_diff ?? 0)}
                    points={row.display_points}
                    zone={zoneColor(palette, zoneForRank(rank, zoneRules))}
                    highlighted={row.team_id === team?.id || favorite.isFavorite(row.team_id)}
                    onPress={openTeam}
                    style={index < MINI_TABLE_LIMIT - 1 ? styles.groupRow : null}
                  />
                );
              })}
            </View>
          </Block>
        ) : null}

        {/* ── 7) GOL KRALLIĞI — ilk üç ───────────────────────────────────── */}
        {scorers.length ? (
          <Block title="Gol krallığı" meta="gol" actionLabel="Tümü" onAction={() => go("/(tabs)/oyuncular")}>
            <View style={styles.group}>
              {scorers.map((player, index) => (
                <PlayerRow
                  key={player.id}
                  rank={index + 1}
                  playerId={player.id}
                  name={player.name}
                  image={player.image ?? null}
                  meta={[`${Number(player.matches) || 0} maç`, player.teamName || null]}
                  metric={Number(player.goals) || 0}
                  onPress={openPlayer}
                  style={index < scorers.length - 1 ? styles.groupRow : null}
                />
              ))}
            </View>
          </Block>
        ) : null}

        {/* ── 8) HABERLER — en altta, kompakt şerit ──────────────────────── */}
        {news.length ? (
          <Block title="Haberler" actionLabel="Tümü" onAction={() => go("/(tabs)/ligler?tab=haberler")}>
            <NewsStrip items={news} onOpen={(id) => go(`/haber/${id}`)} />
          </Block>
        ) : null}

        {/* ── 9) MİSAFİR ÇAĞRISI ────────────────────────────────────────── */}
        {!signedIn ? (
          <View style={styles.guestCard}>
            <Ionicons name="log-in-outline" size={22} color={colors.brandAccent} />
            <View style={styles.guestTexts}>
              <Text style={styles.guestTitle} {...textScale.dense}>
                Kulübünü yönet
              </Text>
              <Text style={styles.guestBody} {...textScale.dense}>
                Giriş yapınca kadro, maç talepleri, teklifler ve mesajlar burada görünür.
              </Text>
            </View>
            <Button label="Giriş yap" size="sm" onPress={() => go("/giris")} />
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

/** Grup içi konum — köşe yuvarlaması ve ayraç bundan gelir. */
function groupPosition(index: number, total: number): "single" | "first" | "middle" | "last" {
  if (total <= 1) return "single";
  if (index === 0) return "first";
  if (index === total - 1) return "last";
  return "middle";
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    paddingTop: space.sm,
    paddingBottom: space.huge,
  },
  /** Ekran kenarı — her blok aynı hizada başlar. */
  pad: {
    paddingHorizontal: layout.screenPadding,
  },
  shortcuts: {
    paddingTop: space.xs,
  },
  /* Bölümler arası tek ritim: 16px. */
  block: {
    paddingTop: space.lg,
  },
  /**
   * GRUP KABI — ekrandaki HER liste aynı kenar boşluğunda, aynı kabukta:
   * 14px köşe, saç teli kenarlık, kâğıttan bir kademe koyu zemin. Kapsız
   * satırlar ekranın iki ucuna uzanıp bölüm başlığıyla farklı hizada
   * duruyordu; tek kap, tek hiza.
   */
  group: {
    marginHorizontal: layout.screenPadding,
    borderRadius: radius.lg,
    borderWidth: hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface1,
    overflow: "hidden",
  },
  /** Grup içi ayraç — satırın kendi ayracı yoksa. */
  groupRow: {
    borderBottomWidth: hairline,
    borderBottomColor: colors.separator,
  },

  /* — Haber şeridi — */
  newsStrip: {
    paddingHorizontal: layout.screenPadding,
    gap: space.sm,
  },
  newsCard: {
    width: NEWS_CARD_WIDTH,
    borderRadius: radius.lg,
    borderWidth: hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface1,
    overflow: "hidden",
  },
  newsImage: {
    width: "100%",
    aspectRatio: 16 / 10,
    backgroundColor: colors.surface3,
  },
  newsBody: {
    padding: space.m,
    gap: space.xxs,
  },
  newsEyebrow: {
    ...type.overline,
    color: colors.brandAccent,
  },
  newsTitle: {
    ...type.h4,
    color: colors.textPrimary,
    minHeight: type.h4.lineHeight * 2,
  },
  newsMeta: {
    ...type.caption,
    color: colors.textTertiary,
  },

  /* — Misafir çağrısı — */
  guestCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    marginHorizontal: layout.screenPadding,
    marginTop: space.lg,
    padding: space.md,
    borderRadius: radius.lg,
    ...elevate(1),
    borderColor: colors.brandBorder,
  },
  guestTexts: {
    flex: 1,
    gap: 2,
  },
  guestTitle: {
    ...type.h3,
    color: colors.textPrimary,
  },
  guestBody: {
    ...type.caption,
    color: colors.textTertiary,
  },
});
