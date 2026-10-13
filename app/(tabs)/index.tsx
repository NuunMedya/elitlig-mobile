/**
 * ANA SAYFA — uygulamanın açılış ekranı ve tek bakışta durum özeti.
 *
 * Amatör ligde kullanıcıların çoğu bir takıma bağlıdır ve açılışta üç soruyu
 * sorar:
 *   1. Şu an bir şey oynanıyor mu, takımımın maçı ne durumda?
 *   2. Beni bekleyen bir iş var mı (talep, teklif, mesaj, kadro)?
 *   3. Ligde bugün ne var, tablo ne durumda, kim atıyor?
 * Ekran üçünü de bu SIRAYLA yanıtlar; her bölüm "dokun → asıl ekran"
 * kapısıdır. Ekran hiçbir listeyi KOPYALAMAZ, yalnız kesitini gösterir.
 *
 * BİLGİ SIRASI (Arena: "ilk ekranda kullanıcının en çok baktığı şey en üstte"):
 *   1. VİTRİN    — sahne yüzeyinde tek maç: canlı > kullanıcının > sıradaki.
 *   2. KISAYOL   — role göre dört kapı (başkan / oyuncu / misafir).
 *   3. KULÜBÜM   — yalnız başkan: sıra, puan, kadro, bekleyen talep.
 *   4. CANLI     — vitrindekinin dışındaki canlı maçlar.
 *   5. TAKIMLARIN— takip edilen takımların en güncel maçı (şerit).
 *   6. BUGÜN     — günün programı (yoksa sıradaki maç günü), satır listesi.
 *   7. PUAN      — ilk beş.
 *   8. GOLCÜLER  — ilk üç.
 *   9. HABERLER  — en altta, kompakt şerit.
 *
 * NEDEN SAHNE TEK VE TEPEDE: Arena'da grafit sahne "skor anı"dır ve ekranda
 * bir kez kullanılır. Vitrin kâğıdın ilk öğesidir; altındaki her şey kâğıttır.
 *
 * NEDEN KAPSAM ÇİPİ (eski üç kutulu kapsam bandı yerine): bant ekranın
 * tepesinde ~130px yiyor ve vitrini ilk ekranın ortasına itiyordu. Kapsam bir
 * AYARDIR, içerik değil; Maçlar sekmesindeki gibi başlığın üst satırında bir
 * kez yazılır ve dokununca kapsam sayfası açılır.
 *
 * SORGU DİSİPLİNİ: girişsiz kullanıcıda panel sorguları HİÇ açılmaz
 * (`enabled`), kapsam hazır değilken lig sorguları açılmaz.
 *
 * PERFORMANS: bölümler en fazla beş satırlık kesitlerdir; sanal listeye gerek
 * duyacak uzunlukta hiçbir bölüm çizilmez.
 */

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useCallback, useMemo } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { HomeSection } from "@/components/home/HomeSection";
import { MatchGroup } from "@/components/home/MatchGroup";
import { NewsStrip } from "@/components/home/NewsStrip";
import { PromptCard } from "@/components/home/PromptCard";
import { ScopeChip } from "@/components/ScopeChip";
import {
  ActionRow,
  ActionTile,
  EmptyState,
  ErrorState,
  LiveBadge,
  MatchCardRail,
  MetricGrid,
  MetricTile,
  PlayerRow,
  ScreenHeader,
  SkeletonHero,
  SkeletonMatchRow,
  SpotlightCard,
  TeamRow,
  TeamRowHead,
  matchDayLabel,
  refreshControlProps,
  useHeaderScroll,
  useRefresh,
} from "@/components/ui";
import type { SpotlightCardProps } from "@/components/ui";
import { useTeamLogos } from "@/hooks/useTeamLogos";
import { useUnreadCount } from "@/hooks/useUnreadCount";
import { getLiveMatches, getMatches } from "@/lib/api/matches";
import { getPlayerRankings } from "@/lib/api/players";
import { getMyMatchRequests, getTeamDashboard, getTeamMatches } from "@/lib/api/team";
import type { TeamMatch } from "@/lib/api/team";
import { getStandings } from "@/lib/api/standings";
import { formatDayHeading, formatTime } from "@/lib/format";
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
  hairline,
  layout,
  palette,
  radius,
  space,
  zoneColor,
  zoneForRank,
} from "@/theme";

const PRESIDENT_PROFILES = new Set(["takim_baskani", "double"]);

/** Bölümlerde gösterilen en fazla satır sayısı — gerisi "Tümü" kapısından. */
const PREVIEW_LIMIT = 5;
/** Canlı kesitinde en fazla satır. */
const LIVE_LIMIT = 4;
/** Mini puan tablosunda gösterilen sıra sayısı. */
const MINI_TABLE_LIMIT = 5;

const pad2 = (value: number) => String(value).padStart(2, "0");

/** Cihazın bugünü — sunucu saati değil; gün şeridi de aynı kaynağı kullanır. */
function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

const matchDay = (match: { date?: string | null }) => String(match.date ?? "").slice(0, 10);

/** "18:30" → dakikaya çevrilmiş sıralama anahtarı. Boş saat sona düşer. */
function kickoffKey(match: ApiMatch): number {
  const [hour, minute] = String(match.time ?? "").split(":");
  const value = Number(hour) * 60 + Number(minute);
  return Number.isFinite(value) ? value : 24 * 60;
}

const byKickoff = (a: ApiMatch, b: ApiMatch) =>
  matchDay(a) === matchDay(b) ? kickoffKey(a) - kickoffKey(b) : matchDay(a) < matchDay(b) ? -1 : 1;

/**
 * Vitrin kartının alanları — maç kaydından (ApiMatch ya da kulübün TeamMatch
 * kaydı) üretilir. Oynanmamış maçta skor yerine saat, altında gün yazar.
 */
function spotlightFields(
  match: ApiMatch | TeamMatch,
  logoFor: (id: number | null | undefined, name: string | null | undefined) => string | null,
): Pick<SpotlightCardProps, "home" | "away" | "statusText" | "statusCaption" | "footnote"> {
  const scheduled =
    matchState({
      mac_durumu: match.mac_durumu as ApiMatch["mac_durumu"],
      is_it_fixture: "is_it_fixture" in match ? match.is_it_fixture : 1,
      first_team_score: match.first_team_score,
      second_team_score: match.second_team_score,
    }) === "scheduled";
  return {
    home: {
      name: match.first_team_name ?? "Ev sahibi",
      logo: logoFor(match.home_team_id, match.first_team_name),
      score: scheduled ? null : match.first_team_score,
    },
    away: {
      name: match.second_team_name ?? "Deplasman",
      logo: logoFor(match.away_team_id, match.second_team_name),
      score: scheduled ? null : match.second_team_score,
    },
    statusText: formatTime(match.time) || undefined,
    statusCaption: matchDayLabel(match.date) || undefined,
    footnote: [formatDayHeading(matchDay(match)), match.match_field].filter(Boolean).join(" · "),
  };
}

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

  /* Canlı maçlar lig kapsamına bağlıdır ama sezondan bağımsızdır: kullanıcı
     bir sezona bakarken ligde başka bir konferansın maçı oynanıyor olabilir. */
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

  /* Haber akışı — editör haberleri, transferler ve disiplin kararları tek
     uçtan gelir; şerit KAPAK GÖRSELİ OLAN ilk beşini gösterir. */
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

  /* Gol krallığı — "kim atıyor" sorusu; ilk üç yeter, gerisi Lig sekmesinde. */
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
        scorersQuery.refetch(),
        newsQuery.refetch(),
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
    () => allMatches.filter((match) => matchDay(match) === today).sort(byKickoff),
    [allMatches, today],
  );

  /** Bugün maç yoksa kesit bir sonraki maç gününü gösterir — boş bölüm çizmez. */
  const nextDay = useMemo(() => {
    if (todayMatches.length) return null;
    const upcoming = allMatches.filter((match) => matchDay(match) > today).sort(byKickoff);
    return upcoming.length ? matchDay(upcoming[0]) : null;
  }, [allMatches, today, todayMatches.length]);

  const nextDayMatches = useMemo(
    () => (nextDay ? allMatches.filter((match) => matchDay(match) === nextDay).sort(byKickoff) : []),
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

  /** Kullanıcının takımları (favoriler + kulübü) — id ve ad ile iki yollu eşleşme. */
  const involves = useMemo(() => {
    const ids = new Set<number>(favorite.favorites.map((entry) => entry.id));
    if (team) ids.add(team.id);
    const names = new Set<string>(
      favorite.favorites.map((entry) => entry.name.trim().toLocaleLowerCase("tr-TR")),
    );
    if (team?.team_name) names.add(team.team_name.trim().toLocaleLowerCase("tr-TR"));
    return (match: ApiMatch) =>
      ids.has(Number(match.home_team_id)) ||
      ids.has(Number(match.away_team_id)) ||
      names.has(String(match.first_team_name ?? "").trim().toLocaleLowerCase("tr-TR")) ||
      names.has(String(match.second_team_name ?? "").trim().toLocaleLowerCase("tr-TR"));
  }, [favorite.favorites, team]);

  /**
   * VİTRİN MAÇI — öncelik sırası:
   *   1. Kulübün / favori takımın CANLI maçı
   *   2. Herhangi bir canlı maç
   *   3. Kulübün sıradaki maçı (maç merkezi kaydı)
   *   4. Favori takımın sıradaki maçı
   *   5. Ligin sıradaki maçı (bugün ya da bir sonraki maç günü)
   * Vitrindeki maç aşağıdaki kesitlerden ÇIKARILIR; aynı maç ekranda iki kez
   * görünmez.
   */
  const spotlight = useMemo(():
    | { match: ApiMatch; eyebrow: string; live: boolean }
    | { teamMatch: TeamMatch; eyebrow: string; live: false }
    | null => {
    const mine = liveMatches.find(involves);
    if (mine) return { match: mine, eyebrow: "Takımın sahada", live: true };

    // Etiket "Canlı" OLAMAZ: rozet zaten "CANLI" yazıyor.
    if (liveMatches.length) return { match: liveMatches[0], eyebrow: "Şu an oynanıyor", live: true };

    const upcoming = teamMatchesQuery.data?.upcoming ?? [];
    if (upcoming.length) return { teamMatch: upcoming[0], eyebrow: "Sıradaki maçın", live: false };

    const nextOwn = allMatches
      .filter((match) => involves(match) && matchDay(match) >= today && matchState(match) !== "finished")
      .sort(byKickoff)[0];
    if (nextOwn) return { match: nextOwn, eyebrow: "Takımının sıradaki maçı", live: false };

    const nextLeague =
      todayMatches.find((match) => matchState(match) === "scheduled") ?? nextDayMatches[0];
    if (nextLeague) return { match: nextLeague, eyebrow: "Sıradaki maç", live: false };

    return null;
  }, [allMatches, involves, liveMatches, nextDayMatches, teamMatchesQuery.data, today, todayMatches]);

  const spotlightId = spotlight && "match" in spotlight ? Number(spotlight.match.id) : null;

  /** Canlı kesiti — vitrindeki maç hariç. */
  const otherLive = useMemo(
    () => liveMatches.filter((match) => Number(match.id) !== spotlightId),
    [liveMatches, spotlightId],
  );

  /**
   * TAKİP ETTİĞİN TAKIMLAR — seçili kapsamdaki maçlarından her takım için
   * en güncel olanı: önce canlı/yaklaşan ilk maç, yoksa son oynanan maç.
   */
  const followedMatches = useMemo(() => {
    if (!favorite.favorites.length) return [];
    const picked = new Map<number, ApiMatch>();
    const sorted = [...allMatches].sort(byKickoff);
    for (const fav of favorite.favorites) {
      const name = fav.name.trim().toLocaleLowerCase("tr-TR");
      const own = sorted.filter(
        (match) =>
          Number(match.home_team_id) === fav.id ||
          Number(match.away_team_id) === fav.id ||
          String(match.first_team_name ?? "").trim().toLocaleLowerCase("tr-TR") === name ||
          String(match.second_team_name ?? "").trim().toLocaleLowerCase("tr-TR") === name,
      );
      const next = own.find((match) => matchDay(match) >= today && matchState(match) !== "finished");
      const last = [...own].reverse().find((match) => matchState(match) === "finished");
      const chosen = next ?? last;
      if (chosen && Number(chosen.id) !== spotlightId) picked.set(chosen.id, chosen);
    }
    return [...picked.values()];
  }, [allMatches, favorite.favorites, today, spotlightId]);

  /** Günün kesiti — vitrindeki ve canlı kesitindeki maçlar hariç. */
  const previewDay = todayMatches.length ? today : nextDay;
  const previewMatches = useMemo(() => {
    const liveIds = new Set(liveMatches.map((match) => Number(match.id)));
    const source = todayMatches.length ? todayMatches : nextDayMatches;
    return source.filter((match) => Number(match.id) !== spotlightId && !liveIds.has(Number(match.id)));
  }, [liveMatches, nextDayMatches, spotlightId, todayMatches]);
  const previewTotal = todayMatches.length || nextDayMatches.length;
  const previewTitle = todayMatches.length ? "Bugün" : nextDay ? formatDayHeading(nextDay) : "Yaklaşan";

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
  const openDay = useCallback(
    () => go(previewDay ? `/(tabs)/maclar?date=${previewDay}` : "/(tabs)/maclar"),
    [go, previewDay],
  );

  const scopeBusy = scope.loading || (scope.ready && matchesQuery.isLoading);
  const highlightId = team?.id ?? null;
  const highlightName = team?.team_name ?? null;

  /* ── 1) VİTRİN ── */
  let hero: React.ReactNode = null;
  if (spotlight && "match" in spotlight) {
    const match = spotlight.match;
    hero = (
      <SpotlightCard
        eyebrow={spotlight.eyebrow}
        context={match.league_name || scope.leagueLabel || undefined}
        live={spotlight.live}
        {...spotlightFields(match, teams.logoFor)}
        onPress={() => openMatch(Number(match.id))}
      />
    );
  } else if (spotlight && "teamMatch" in spotlight) {
    const match = spotlight.teamMatch;
    hero = (
      <SpotlightCard
        eyebrow={spotlight.eyebrow}
        context={scope.leagueLabel || undefined}
        {...spotlightFields(match, teams.logoFor)}
        onPress={() => go(`/takimim/mac/${match.id}`)}
      />
    );
  } else if (scopeBusy || (scope.ready && liveQuery.isLoading)) {
    hero = <SkeletonHero />;
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader
        title="Ana Sayfa"
        scope={<ScopeChip />}
        scrollY={scrollY}
        actions={[
          { icon: "search-outline", accessibilityLabel: "Ara", onPress: () => go("/ara") },
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
        {!scope.ready && !scope.loading ? (
          <EmptyState
            icon="options-outline"
            title="Lig seçilmedi"
            body="Maçları, puan durumunu ve golcüleri görmek için şehir, lig ve sezon seç."
            action={{ label: "Kapsam seç", onPress: () => scope.openScopeSheet("city") }}
          />
        ) : null}

        {hero ? <View style={styles.pad}>{hero}</View> : null}

        {/* ── 2) KISAYOLLAR — role göre ── */}
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
              <ActionTile icon="chatbubbles" label="Mesajlar" badge={unread.messages} onPress={() => go("/mesajlarim")} />
            </ActionRow>
          ) : signedIn ? (
            <ActionRow columns={4}>
              <ActionTile icon="football" label="Maçlarım" onPress={() => go("/oyuncum?tab=maclarim")} />
              <ActionTile icon="swap-horizontal" label="Teklifler" tone="accent" onPress={() => go("/tekliflerim")} />
              <ActionTile icon="chatbubbles" label="Mesajlar" badge={unread.messages} onPress={() => go("/mesajlarim")} />
              <ActionTile icon="star" label="Favoriler" onPress={() => go("/(tabs)/favoriler")} />
            </ActionRow>
          ) : (
            <ActionRow columns={4}>
              <ActionTile icon="radio" label="Canlı" tone="live" onPress={() => go("/canli")} />
              <ActionTile icon="trophy" label="Puan" onPress={() => go("/(tabs)/ligler?tab=puan")} />
              <ActionTile icon="star" label="Takip" onPress={() => go("/(tabs)/favoriler?tab=takimlar")} />
              <ActionTile icon="game-controller" label="Oyunlar" tone="accent" onPress={() => go("/(tabs)/oyunlar")} />
            </ActionRow>
          )}
        </View>

        {/* ── 3) KULÜBÜM — yalnız başkan ── */}
        {isPresident ? (
          <HomeSection title="Kulübüm" meta={team?.team_name ?? undefined} actionLabel="Panel" onAction={() => go("/takimim")}>
            <MetricGrid columns={2}>
              <MetricTile
                label="Lig sırası"
                value={teamRank ? `${teamRank}.` : "—"}
                hint={scope.leagueLabel || undefined}
                tone="accent"
                icon="podium-outline"
                onPress={() => go("/(tabs)/ligler?tab=puan")}
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
          </HomeSection>
        ) : null}

        {/* ── 4) CANLI — vitrindeki hariç ── */}
        {otherLive.length ? (
          <HomeSection
            title="Canlı"
            leading={<LiveBadge compact />}
            meta={`${liveMatches.length} maç`}
            actionLabel="Tümü"
            onAction={() => go("/canli")}
          >
            <MatchGroup
              matches={otherLive.slice(0, LIVE_LIMIT)}
              logoFor={teams.logoFor}
              onOpen={openMatch}
              highlightTeamId={highlightId}
              highlightTeamName={highlightName}
            />
          </HomeSection>
        ) : null}

        {/* ── 5) TAKİP ETTİĞİN TAKIMLAR ── */}
        {favorite.favorites.length ? (
          followedMatches.length ? (
            <HomeSection
              title="Takımların"
              meta={`${favorite.favorites.length} takım`}
              actionLabel="Yönet"
              onAction={() => go("/(tabs)/favoriler?tab=takimlar")}
              bleed
            >
              <MatchCardRail matches={followedMatches} logoFor={teams.logoFor} onOpen={openMatch} />
            </HomeSection>
          ) : null
        ) : signedIn || !scopeBusy ? (
          <View style={[styles.pad, styles.prompt]}>
            <PromptCard
              icon="star"
              title="Takımını takip et"
              body="Maçları burada öne çıksın, gol ve sonuç bildirimleri gelsin."
              onPress={() => go("/(tabs)/ligler?tab=takimlar")}
            />
          </View>
        ) : null}

        {/* ── 6) BUGÜN / SIRADAKİ MAÇ GÜNÜ ── */}
        {scopeBusy ? (
          <HomeSection title="Bugün">
            <View style={styles.group}>
              <SkeletonMatchRow count={3} />
            </View>
          </HomeSection>
        ) : matchesQuery.isError ? (
          <HomeSection title="Bugün">
            <ErrorState error={matchesQuery.error} variant="banner" onRetry={() => void matchesQuery.refetch()} />
          </HomeSection>
        ) : previewMatches.length ? (
          <HomeSection
            title={previewTitle}
            meta={`${previewTotal} maç`}
            actionLabel="Tümü"
            onAction={openDay}
          >
            <MatchGroup
              matches={previewMatches.slice(0, PREVIEW_LIMIT)}
              logoFor={teams.logoFor}
              onOpen={openMatch}
              showVenue
              highlightTeamId={highlightId}
              highlightTeamName={highlightName}
            />
          </HomeSection>
        ) : scope.ready && !spotlight && !liveMatches.length ? (
          <HomeSection title="Maçlar" actionLabel="Fikstür" onAction={() => go("/(tabs)/maclar")}>
            <View style={styles.emptyCard}>
              <EmptyState
                icon="calendar-outline"
                title="Yaklaşan maç yok"
                body="Bu lig ve sezonda planlanmış maç görünmüyor."
                variant="inline"
                compact
              />
            </View>
          </HomeSection>
        ) : null}

        {/* ── 7) PUAN DURUMU — ilk beş ── */}
        {standings.length ? (
          <HomeSection
            title="Puan durumu"
            meta={scope.leagueLabel || undefined}
            actionLabel="Tümü"
            onAction={() => go("/(tabs)/ligler?tab=puan")}
          >
            <View style={styles.group}>
              <TeamRowHead density="table" />
              {standings.slice(0, MINI_TABLE_LIMIT).map((row: StandingRow, index, list) => {
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
                    style={index < list.length - 1 ? styles.groupRow : null}
                  />
                );
              })}
            </View>
          </HomeSection>
        ) : null}

        {/* ── 8) GOL KRALLIĞI — ilk üç ── */}
        {scorers.length ? (
          <HomeSection title="Gol krallığı" actionLabel="Tümü" onAction={() => go("/(tabs)/ligler?tab=oyuncular")}>
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
          </HomeSection>
        ) : null}

        {/* ── 9) HABERLER — en altta, kompakt şerit ── */}
        {news.length ? (
          <HomeSection title="Haberler" actionLabel="Tümü" onAction={() => go("/(tabs)/ligler?tab=haberler")} bleed>
            <NewsStrip items={news} onOpen={(id) => go(`/haber/${id}`)} />
          </HomeSection>
        ) : null}

        {/* ── 10) MİSAFİR ÇAĞRISI ── */}
        {!signedIn ? (
          <View style={[styles.pad, styles.guest]}>
            <PromptCard
              icon="shield-half"
              title="Kulübünü yönet"
              body="Kadro, maç talepleri, teklifler ve mesajlar giriş yapınca burada."
              actionLabel="Giriş yap"
              onPress={() => go("/giris")}
            />
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
  content: {
    paddingTop: space.xs,
    paddingBottom: layout.tabBarHeight + space.xxl,
  },
  /** Ekran kenarı — her blok aynı hizada başlar. */
  pad: {
    paddingHorizontal: layout.screenPadding,
  },
  shortcuts: {
    paddingTop: space.md,
  },
  prompt: {
    paddingTop: layout.sectionGap,
  },
  guest: {
    paddingTop: layout.sectionGap,
  },
  /**
   * GRUP KABI — tablo ve oyuncu kesitleri aynı kabukta: kart yarıçapı, saç
   * teli kenarlık, beyaz yüzey. Satırlar ayracı kendisi çizer.
   */
  group: {
    borderRadius: radius.xl,
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
  emptyCard: {
    borderRadius: radius.xl,
    borderWidth: hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface1,
  },
});
