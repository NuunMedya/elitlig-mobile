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
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ScopeChip } from "@/components/ScopeChip";
import {
  ActionRow,
  ActionTile,
  Button,
  EmptyState,
  ErrorState,
  FormChips,
  HeroCarousel,
  MatchRow,
  MetricGrid,
  MetricTile,
  ScreenHeader,
  SectionHeader,
  SkeletonCard,
  SkeletonHero,
  SkeletonMatchRow,
  SpotlightCard,
  TeamLogo,
  Touchable,
  refreshControlProps,
  useHeaderScroll,
  useRefresh,
  type HeroSlide,
} from "@/components/ui";
import { useTeamLogos } from "@/hooks/useTeamLogos";
import { useUnreadCount } from "@/hooks/useUnreadCount";
import { getLiveMatches, getMatches } from "@/lib/api/matches";
import { getMyMatchRequests, getTeamDashboard, getTeamMatches } from "@/lib/api/team";
import { getStandings } from "@/lib/api/standings";
import { formatDayHeading, mediaUrl, timeAgo } from "@/lib/format";
import { matchState } from "@/lib/match";
import { getNewsFeed } from "@/lib/api/news";
import { queryKeys } from "@/lib/queryKeys";
import type { ApiMatch, StandingRow } from "@/lib/types";
import { useAuth } from "@/providers/AuthProvider";
import { useFavorite } from "@/providers/FavoriteProvider";
import { useScope } from "@/providers/ScopeProvider";
import { colors, elevate, hairline, layout, radius, space, textScale, type } from "@/theme";

/** Takım başkanı sayılan profil tipleri (sunucudaki `profile_type` değerleri). */
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
const MiniStandingRow = React.memo(function MiniStandingRow({
  rank,
  teamId,
  teamName,
  logo,
  last5,
  points,
  highlighted,
  onPress,
}: {
  rank: number;
  teamId: number;
  teamName: string;
  logo: string | null;
  last5: string;
  points: number;
  highlighted: boolean;
  onPress: (teamId: number) => void;
}) {
  const handlePress = useCallback(() => onPress(teamId), [onPress, teamId]);
  return (
    <Touchable
      style={[styles.miniRow, highlighted ? styles.miniRowActive : null]}
      onPress={handlePress}
      feedback="row"
      haptic="selection"
    >
      <Text style={styles.miniRank} {...textScale.dense}>
        {rank}
      </Text>
      <TeamLogo name={teamName} logo={logo} size={20} />
      <Text style={styles.miniName} numberOfLines={1} {...textScale.dense}>
        {teamName}
      </Text>
      {last5 ? <FormChips form={last5} size="xs" limit={3} /> : null}
      <Text style={styles.miniPoints} {...textScale.dense}>
        {points}
      </Text>
    </Touchable>
  );
});

/* ══════════════════════════════════════════════════════════════════════════
   Ekran
   ══════════════════════════════════════════════════════════════════════════ */

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
  const { width } = useWindowDimensions();

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

    if (todayMatches.length) {
      return { match: todayMatches[0], eyebrow: "Bugün", live: false as const };
    }
    return null;
  }, [allMatches, favorite.favorites, liveMatches, team, teamMatchesQuery.data, today, todayMatches]);

  /**
   * Karusel slaytları.
   *
   * MANŞET TAM CÜMLEDİR: haberin kendi başlığı kullanılır, "Bunu görmelisiniz"
   * gibi bir tıklama tuzağı üretilmez. Başlık iki satırda bitmiyorsa zaten
   * manşet değildir; kart onu kırpar, biz kısaltmayız.
   *
   * EN FAZLA BEŞ: karusel bir akış değil bir VİTRİNDİR. Beşten fazlası
   * gösterge segmentlerini okunmaz inceliğe indiriyor ve kimse sonuna kadar
   * kaydırmıyor. Kalan haberler kendi sekmesinde duruyor.
   */
  const heroSlides = useMemo<HeroSlide[]>(() => {
    const items = newsQuery.data?.items ?? [];
    return items
      .filter((item) => Boolean(item.cover_image_url))
      .slice(0, 5)
      .map((item) => ({
        key: item.id,
        image: mediaUrl(item.cover_image_url),
        eyebrow: item.category_label ?? item.category ?? null,
        headline: item.title,
        meta: [scope.leagueLabel, timeAgo(item.published_at)].filter(Boolean).join(" · "),
        onPress: () => go(`/haber/${item.id}`),
      }));
  }, [newsQuery.data, scope.leagueLabel, go]);

  /* ------------------------------- ÇİZİM ---------------------------------- */

  const openMatch = useCallback((id: number) => router.push(`/mac/${id}`), [router]);
  const openTeam = useCallback((teamId: number) => router.push(`/takim/${teamId}`), [router]);

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
        overline="ELİTLİG"
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
        bottom={
          <View style={styles.headerBottom}>
            <ScopeChip />
          </View>
        }
      />

      <ScrollView
        {...scrollProps}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl {...refreshControlProps(refresh.refreshing, refresh.onRefresh)} />
        }
      >
        {/* ── 0) MANŞET KARUSELİ ────────────────────────────────────────── */}
        {newsQuery.isLoading && !heroSlides.length ? (
          <View style={[styles.heroBox, styles.heroSkeleton]}>
            <SkeletonHero />
          </View>
        ) : heroSlides.length ? (
          <HeroCarousel
            slides={heroSlides}
            width={width}
            inset={layout.screenPadding}
            style={styles.heroBox}
          />
        ) : null}

        {/* ── 1) VİTRİN ─────────────────────────────────────────────────── */}
        <View style={styles.spotlightBox}>
          {scopeBusy && !spotlight ? (
            <SkeletonCard />
          ) : spotlight?.match ? (
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
              footnote={[
                formatDayHeading(matchDay(spotlight.match)),
                spotlight.match.match_field,
              ]
                .filter(Boolean)
                .join(" · ")}
              onPress={() => openMatch(spotlight.match!.id)}
            />
          ) : spotlight?.teamMatch ? (
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
          ) : null}
        </View>

        {/* ── 2) KISAYOLLAR — role göre ─────────────────────────────────── */}
        <View style={styles.shortcuts}>
          {isPresident ? (
            <ActionRow columns={4}>
              <ActionTile icon="people" label="Kadro" onPress={() => go("/takimim/kadro")} />
              <ActionTile
                icon="clipboard"
                label="Maç Merkezi"
                onPress={() => go("/takimim/mac-merkezi")}
              />
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
              <ActionTile
                icon="swap-horizontal"
                label="Teklifler"
                tone="accent"
                onPress={() => go("/tekliflerim")}
              />
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
              <ActionTile
                icon="game-controller"
                label="Oyunlar"
                tone="accent"
                onPress={() => go("/(tabs)/oyunlar")}
              />
            </ActionRow>
          )}
        </View>

        {/* ── 3) KULÜP METRİKLERİ — yalnız başkan ───────────────────────── */}
        {isPresident ? (
          <Block
            title="Kulübüm"
            meta={team?.team_name ?? undefined}
            actionLabel="Panel"
            onAction={() => go("/takimim")}
          >
            <View style={styles.blockBody}>
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
          <Block
            title="Canlı"
            meta={`${liveMatches.length} maç`}
            actionLabel="Tümü"
            onAction={() => go("/canli")}
          >
            {liveMatches.slice(0, PREVIEW_LIMIT).map((match, index, list) => (
              <MatchRow
                key={match.id}
                match={match}
                homeLogo={teams.logoFor(match.home_team_id, match.first_team_name)}
                awayLogo={teams.logoFor(match.away_team_id, match.second_team_name)}
                myTeamId={team?.id ?? null}
                myTeamName={team?.team_name ?? null}
                metaMode="none"
                position={
                  list.length === 1
                    ? "single"
                    : index === 0
                      ? "first"
                      : index === list.length - 1
                        ? "last"
                        : "middle"
                }
                onPress={() => openMatch(match.id)}
              />
            ))}
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
            <>
              <SkeletonMatchRow />
              <SkeletonMatchRow />
              <SkeletonMatchRow />
            </>
          ) : matchesQuery.isError ? (
            <ErrorState error={matchesQuery.error} variant="banner" />
          ) : previewMatches.length ? (
            previewMatches.slice(0, PREVIEW_LIMIT).map((match, index, list) => (
              <MatchRow
                key={match.id}
                match={match}
                homeLogo={teams.logoFor(match.home_team_id, match.first_team_name)}
                awayLogo={teams.logoFor(match.away_team_id, match.second_team_name)}
                myTeamId={team?.id ?? null}
                myTeamName={team?.team_name ?? null}
                metaMode="none"
                position={
                  list.length === 1
                    ? "single"
                    : index === 0
                      ? "first"
                      : index === list.length - 1
                        ? "last"
                        : "middle"
                }
                onPress={() => openMatch(match.id)}
              />
            ))
          ) : (
            <EmptyState
              icon="calendar-outline"
              title="Maç yok"
              body="Bu ligde yaklaşan maç görünmüyor."
              variant="inline"
            />
          )}
        </Block>

        {/* ── 6) MİNİ PUAN TABLOSU ──────────────────────────────────────── */}
        {standings.length ? (
          <Block
            title="Puan durumu"
            meta={scope.leagueLabel || undefined}
            actionLabel="Tümü"
            onAction={() => go("/(tabs)/takimlar")}
          >
            <View style={styles.miniTable}>
              {standings.slice(0, MINI_TABLE_LIMIT).map((row: StandingRow, index) => (
                <MiniStandingRow
                  key={row.team_id}
                  rank={index + 1}
                  teamId={row.team_id}
                  teamName={row.team_name}
                  logo={row.logo}
                  last5={row.last5 ?? ""}
                  points={row.display_points}
                  highlighted={row.team_id === team?.id || favorite.isFavorite(row.team_id)}
                  onPress={openTeam}
                />
              ))}
            </View>
          </Block>
        ) : null}

        {/* ── 7) MİSAFİR ÇAĞRISI ────────────────────────────────────────── */}
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

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  headerBottom: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: layout.screenPadding,
    paddingBottom: space.sm,
  },
  content: {
    paddingBottom: space.huge,
  },
  /* Karusel tam genişlik kaydırır; kenar boşluğu içeride `inset` ile verilir. */
  heroBox: {
    paddingTop: space.m,
    paddingBottom: space.s,
  },
  /* İskelet kaydırmıyor; kenar boşluğunu kendisi taşır. */
  heroSkeleton: {
    paddingHorizontal: layout.screenPadding,
  },
  spotlightBox: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.m,
  },
  shortcuts: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.md,
  },
  /* Bölümler arası nefes — kompakt ritim. */
  block: {
    paddingTop: space.lg,
  },
  blockBody: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.xs,
  },

  /* — Mini puan tablosu — */
  miniTable: {
    marginHorizontal: layout.screenPadding,
    borderRadius: radius.lg,
    overflow: "hidden",
    ...elevate(1),
  },
  miniRow: {
    height: 40,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: space.m,
    borderBottomWidth: hairline,
    borderBottomColor: colors.separator,
  },
  miniRowActive: {
    backgroundColor: colors.surface2,
  },
  miniRank: {
    ...type.tableNum,
    color: colors.textTertiary,
    width: 20,
    textAlign: "center",
  },
  miniName: {
    ...type.bodySm,
    color: colors.textPrimary,
    flex: 1,
  },
  miniPoints: {
    ...type.tableNumStrong,
    color: colors.textPrimary,
    minWidth: 24,
    textAlign: "right",
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
