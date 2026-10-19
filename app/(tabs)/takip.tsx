/**
 * TAKİP sekmesi — takip ettiğin takımlar, maçlar, ligler ve onlarla ilgili akış.
 *
 * NE (yukarıdan aşağı):
 *   1. TAKIMLARIM   yatay şerit: amblem + zil, son 5 maç formu, sıradaki maça
 *                   kalan süre; sonda "Takip et" (takım arama).
 *   2. MAÇLAR       her takımın en güncel maçı: canlı/sıradaki, yoksa son
 *                   biten (eski Ana Sayfa'nın "Takımların" şeridi).
 *   3. TAKİP ETTİĞİN MAÇLAR  tek tek takip edilen maçlar; kartın altında
 *                   yıldız (bırak) ve zil.
 *   4. AKIŞ         takip edilenlerle ilgili haber / transfer / disiplin
 *                   (components/follow/useFollowNews — süzgeç neden istemcide
 *                   orada anlatılır); tür etiketi kaydın `kind` alanından.
 *                   Transfer → oyuncu sayfası, disiplin → takım sayfası
 *                   (tekil haber ucu yalnız editör haberinde var).
 *   5. LİGLER       takip edilen lig / sezon / iller; dokununca Lig sekmesi o
 *                   kapsamla açılır, satırda yıldız + zil.
 *
 * BOŞ DURUM: takım takip edilmiyorsa şerit yerine TAKIM SEÇME IZGARASI çıkar
 * (components/follow/TeamPickerGrid — ilk açılışta da aynı ızgara). Izgara
 * seçili kapsamın puan tablosundan beslenir; bu yüzden üstünde küçük bir
 * `LeaguePicker` durur. Takip sekmesinin geri kalanı kapsamdan bağımsızdır.
 *
 * TAKİP = BİLDİRİM: bu ekrandaki her takip düğmesi `useFollowFlow()` kullanır
 * (takip et → bildirim türleri alt sayfası); her takip öğesinde `FollowBell`
 * o takibin bildirim türlerini açar. Başlıktaki zil bütün takip bildirimleri.
 *
 * NEDEN MAÇLAR İSTEMCİDE BİRLEŞİR: sunucuda "takiplerimin maçları" ucu yok;
 * takım başına `/maclar?team_id=` çekilir (tipik 1-5 takım), tek tek takip
 * edilen maçlar `/maclar/:id` ile tamamlanır. Canlı skor `useLiveFavoriteCount`
 * yoklamasından ezilir — o kanca zaten sekme rozetini besliyor.
 *
 * GİRİŞSİZ DE ÇALIŞIR: takipler cihazda saklanır; giriş yalnız bildirimleri
 * açar, üstteki bant bunu söyler.
 *
 * ESKİ ROTA: `/favoriler?tab=…` buraya yönlendirir (app/(tabs)/favoriler.tsx).
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useCallback, useMemo } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { FollowBell, FollowStar } from "@/components/FollowControls";
import { LeaguePicker } from "@/components/LeaguePicker";
import { FollowedTeamsStrip, type TeamStripSummary } from "@/components/follow/FollowedTeamsStrip";
import { TeamPickerGrid } from "@/components/follow/TeamPickerGrid";
import {
  belongsToTeam,
  byKickoffAsc,
  countdownLabel,
  dayKeyOf,
  nextAndLast,
  teamForm,
} from "@/components/follow/followMatches";
import { useFollowNews } from "@/components/follow/useFollowNews";
import {
  Button,
  ErrorState,
  ListRow,
  MatchCard,
  MatchCardRail,
  ScreenHeader,
  SectionHeader,
  SkeletonListRow,
  SkeletonMatchRow,
  Surface,
  refreshControlProps,
  useHeaderScroll,
  useRefresh,
} from "@/components/ui";
import type { LeadingIcon } from "@/components/ui";
import { useLiveFavoriteCount } from "@/hooks/useLiveFavoriteCount";
import { useTeamLogos } from "@/hooks/useTeamLogos";
import { getMatch, getTeamMatches } from "@/lib/api/matches";
import { timeAgo } from "@/lib/format";
import { matchState } from "@/lib/match";
import { queryKeys } from "@/lib/queryKeys";
import type { ApiMatch, NewsItem } from "@/lib/types";
import { useAuth } from "@/providers/AuthProvider";
import { useFavorite, type FavoriteScope, type FavoriteTeam, type FollowTarget } from "@/providers/FavoriteProvider";
import { useFollowFlow } from "@/providers/FollowFlowProvider";
import { useScope } from "@/providers/ScopeProvider";
import { colors, layout, radius, space, textScale, type } from "@/theme";

type Position = "single" | "first" | "middle" | "last";

function rowPosition(index: number, total: number): Position {
  if (total <= 1) return "single";
  if (index === 0) return "first";
  if (index === total - 1) return "last";
  return "middle";
}

/** Akış satırının ikonu — kaydın türü (`kind`) ne olduğunu söyler. */
const NEWS_ICON: Record<NewsItem["kind"], LeadingIcon> = {
  news: { icon: "newspaper-outline", tone: "neutral" },
  transfer: { icon: "swap-horizontal-outline", tone: "brand" },
  penalty: { icon: "alert-circle-outline", tone: "warn" },
};

const NEWS_KIND_LABEL: Record<NewsItem["kind"], string> = {
  news: "Haber",
  transfer: "Transfer",
  penalty: "Disiplin",
};

/* ═════════════════════════ KÜÇÜK BİLEŞENLER ═════════════════════════ */

/** Girişsiz üst bant — takip cihazda çalışır, bildirim hesaba bağlıdır. */
const GuestBanner = React.memo(function GuestBanner({ onSignIn }: { onSignIn: () => void }) {
  return (
    <Surface level={1} radius="xl" style={styles.banner}>
      <View style={styles.bannerIcon}>
        <Ionicons name="notifications" size={17} color={colors.brandAccent} />
      </View>
      <Text style={styles.bannerText} {...textScale.dense}>
        Takiplerin bu cihazda. Giriş yap, gol ve sonuç bildirimi al.
      </Text>
      <Button label="Giriş yap" size="sm" variant="primary" onPress={onSignIn} />
    </Surface>
  );
});

/** Takip edilen tek maç — kart + alt şeritte yıldız (bırak) ve zil. */
const FollowedMatchCard = React.memo(function FollowedMatchCard({
  match,
  homeLogo,
  awayLogo,
  onOpen,
}: {
  match: ApiMatch;
  homeLogo: string | null;
  awayLogo: string | null;
  onOpen: (matchId: number) => void;
}) {
  const target = useMemo<FollowTarget>(
    () => ({
      type: "match",
      id: Number(match.id),
      name: `${match.first_team_name ?? "Ev sahibi"} – ${match.second_team_name ?? "Deplasman"}`,
    }),
    [match.id, match.first_team_name, match.second_team_name]
  );
  const open = useCallback(() => onOpen(Number(match.id)), [onOpen, match.id]);
  return (
    <MatchCard
      match={match}
      homeLogo={homeLogo}
      awayLogo={awayLogo}
      showDate
      onPress={open}
      footer={
        <View style={styles.matchFooter}>
          <Text style={styles.matchFooterText} numberOfLines={1} {...textScale.dense}>
            Maç takipte
          </Text>
          <FollowStar target={target} />
          <FollowBell target={target} size={16} />
        </View>
      }
    />
  );
});

/** Takip edilen lig / sezon / il satırı. */
const ScopeFollowRow = React.memo(function ScopeFollowRow({
  item,
  kind,
  position,
  onOpen,
}: {
  item: FavoriteScope;
  kind: "league" | "season" | "city";
  position: Position;
  onOpen: (item: FavoriteScope, kind: "league" | "season" | "city") => void;
}) {
  const target = useMemo<FollowTarget>(() => ({ type: kind, id: item.id, name: item.name }), [item.id, item.name, kind]);
  const open = useCallback(() => onOpen(item, kind), [item, kind, onOpen]);
  const icon: LeadingIcon =
    kind === "league"
      ? { icon: "trophy-outline", tone: "brand" }
      : kind === "season"
        ? { icon: "calendar-outline", tone: "brand" }
        : { icon: "location-outline", tone: "brand" };
  return (
    <ListRow
      leading={icon}
      title={item.name}
      subtitle={kind === "league" ? "Lig" : kind === "season" ? "Sezon" : "İl"}
      position={position}
      onPress={open}
      chevron={false}
      trailing={
        <View style={styles.rowControls}>
          <FollowStar target={target} />
          <FollowBell target={target} size={16} />
        </View>
      }
    />
  );
});

/* ═════════════════════════ EKRAN ═════════════════════════ */

export default function TakipScreen() {
  const router = useRouter();
  const auth = useAuth();
  const queryClient = useQueryClient();
  const scope = useScope();
  const flow = useFollowFlow();
  const { logoFor } = useTeamLogos();
  // Yoklamayı sekme çubuğundaki örnek yapar; burada yalnız önbellek okunur.
  const live = useLiveFavoriteCount({ poll: false });
  const { scrollY, scrollProps } = useHeaderScroll();
  const { favorites, favoriteLeagues, favoriteSeasons, favoriteCities, favoriteMatches, isFollowing } =
    useFavorite();

  /* ---- Takım maçları ---- */

  const teamQueries = useQueries({
    queries: favorites.map((team) => ({
      queryKey: queryKeys.teamMatches(team.id),
      queryFn: () => getTeamMatches(team.id),
      staleTime: 60_000,
    })),
  });

  const teamPool = useMemo(() => {
    const map = new Map<number, ApiMatch>();
    teamQueries.forEach((query) => query.data?.forEach((row) => row?.id != null && map.set(Number(row.id), row)));
    // Canlı yoklaması en taze skoru taşır.
    live.matches.forEach((match) => map.has(Number(match.id)) && map.set(Number(match.id), match));
    return Array.from(map.values());
  }, [teamQueries, live.matches]);

  /** Takım başına: form, sayaç ve en güncel maç. Sorgusu bitmeyen takım özetsiz kalır (iskelet). */
  const { summaries, teamMatches } = useMemo(() => {
    const today = dayKeyOf(new Date());
    const now = new Date();
    const map = new Map<number, TeamStripSummary>();
    const picked = new Map<number, ApiMatch>();
    favorites.forEach((team, index) => {
      if (!teamQueries[index]?.data) return;
      const own = teamPool.filter((match) => belongsToTeam(match, team));
      const { next, last } = nextAndLast(own, team, today);
      map.set(team.id, {
        form: teamForm(own, team),
        countdown: next ? countdownLabel(next, now) : "",
        live: next ? matchState(next) === "live" : false,
      });
      const chosen = next ?? last;
      if (chosen) picked.set(Number(chosen.id), chosen);
    });
    return { summaries: map, teamMatches: Array.from(picked.values()).sort(byKickoffAsc) };
  }, [favorites, teamPool, teamQueries]);

  /* ---- Tek tek takip edilen maçlar ---- */

  const matchQueries = useQueries({
    queries: favoriteMatches.map((id) => ({
      queryKey: queryKeys.match(id),
      queryFn: () => getMatch(id),
      staleTime: 60_000,
    })),
  });

  const followedMatches = useMemo(() => {
    const liveById = new Map(live.matches.map((match) => [Number(match.id), match]));
    return matchQueries
      .map((query) => query.data)
      .filter((match): match is ApiMatch => Boolean(match?.id))
      .map((match) => liveById.get(Number(match.id)) ?? match)
      .sort(byKickoffAsc);
  }, [matchQueries, live.matches]);

  /* ---- Akış ---- */

  const news = useFollowNews({
    teams: favorites,
    leagues: favoriteLeagues,
    seasons: favoriteSeasons,
    cities: favoriteCities,
    scopeCityId: scope.cityId,
  });

  /* ---- Durum ---- */

  const scopeRows = useMemo(
    () => [
      ...favoriteLeagues.map((item) => ({ item, kind: "league" as const })),
      ...favoriteSeasons.map((item) => ({ item, kind: "season" as const })),
      ...favoriteCities.map((item) => ({ item, kind: "city" as const })),
    ],
    [favoriteCities, favoriteLeagues, favoriteSeasons]
  );

  const hasTeams = favorites.length > 0;
  const teamsLoading = hasTeams && teamQueries.some((query) => query.isLoading);
  const teamsError = teamQueries.find((query) => query.isError)?.error ?? null;
  const matchesLoading = matchQueries.some((query) => query.isLoading);
  const refreshing = [...teamQueries, ...matchQueries].some((query) => query.isRefetching);

  const refetchAll = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["matches"] });
    void queryClient.invalidateQueries({ queryKey: ["news"] });
    void queryClient.invalidateQueries({ queryKey: ["standings"] });
  }, [queryClient]);

  const refresh = useRefresh(refetchAll, { refreshing });

  /* ---- Gezinme ---- */

  const openMatch = useCallback((matchId: number) => router.push(`/mac/${matchId}`), [router]);
  const openTeam = useCallback((teamId: number) => router.push(`/takim/${teamId}`), [router]);
  const openTeamSearch = useCallback(() => router.push("/ara?tip=takim"), [router]);
  /** Akış satırının rotası useFollowNews'te çözülür (haber / oyuncu / takım). */
  const openHref = useCallback((href: string) => router.push(href as never), [router]);
  const openSignIn = useCallback(() => router.push("/giris"), [router]);

  const openScope = useCallback(
    (item: FavoriteScope, kind: "league" | "season" | "city") => {
      if (kind === "league") {
        // Takip kaydı ligin ilini tutmaz; sabitlenmiş lig kaydı tutar. Varsa
        // il + lig birlikte atlanır, yoksa seçili ilde lig seçilir.
        const pinned = scope.pinnedLeagues.find((entry) => entry.leagueId === item.id);
        if (pinned) scope.jumpTo(pinned.cityId, item.id);
        else scope.selectLeague(item.id);
      } else if (kind === "season") {
        scope.selectSeason(item.id);
      } else {
        scope.selectCity(item.id);
      }
      router.push("/(tabs)/ligler");
    },
    [router, scope]
  );

  const followTeam = useCallback(
    (team: FavoriteTeam) => flow.follow({ type: "team", id: team.id, name: team.name, logo: team.logo ?? null }),
    [flow]
  );
  const isTeamFollowed = useCallback((teamId: number) => isFollowing("team", teamId), [isFollowing]);
  const teamLogo = useCallback((team: FavoriteTeam) => logoFor(team.id, team.name), [logoFor]);

  /* ---- Çizim ---- */

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader
        title="Takip ettiklerin"
        back
        /* Sekme çubuğunda yuvası olmayan bir sekmedir (href: null); Menü'den,
           Maçlar'daki ipucundan ve takip bildirimlerinden açılır. Geri yığını
           yoksa Menü'ye döner — eskiden geri düğmesi yoktu ve ekran çıkmazdı. */
        onBack={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/menu"))}
        scrollY={scrollY}
        actions={[
          { icon: "search-outline", onPress: openTeamSearch, accessibilityLabel: "Takım ara" },
          {
            icon: "notifications-outline",
            onPress: () => router.push("/takip-bildirimleri"),
            accessibilityLabel: "Takip bildirimleri",
          },
        ]}
      />

      <ScrollView
        {...scrollProps}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl {...refreshControlProps(refresh.refreshing, refresh.onRefresh)} />}
      >
        {auth.user ? null : (
          <View style={styles.pad}>
            <GuestBanner onSignIn={openSignIn} />
          </View>
        )}

        {/* ── 1) TAKIMLARIM ── */}
        {hasTeams ? (
          <>
            <SectionHeader
              title="Takımlarım"
              meta={`${favorites.length} takım`}
              action={{ label: "Takip et", onPress: openTeamSearch }}
            />
            <FollowedTeamsStrip
              teams={favorites}
              summaries={summaries}
              logoFor={teamLogo}
              onOpenTeam={openTeam}
              onAdd={openTeamSearch}
            />

            {/* ── 2) MAÇLAR ── */}
            <SectionHeader title="Maçlar" meta={teamMatches.length ? `${teamMatches.length} maç` : undefined} />
            {teamsLoading && !teamMatches.length ? (
              <View style={styles.pad}>
                <SkeletonMatchRow count={2} />
              </View>
            ) : teamsError && !teamMatches.length ? (
              <View style={styles.pad}>
                <ErrorState error={teamsError} variant="banner" onRetry={refetchAll} />
              </View>
            ) : teamMatches.length ? (
              <MatchCardRail matches={teamMatches} logoFor={logoFor} onOpen={openMatch} />
            ) : (
              <Text style={[styles.pad, styles.note]} {...textScale.long}>
                Takımlarının kayıtlı maçı yok. Fikstür açılınca burada görünür.
              </Text>
            )}
          </>
        ) : (
          <>
            <SectionHeader title="Takımını seç" />
            <Text style={[styles.pad, styles.lead]} {...textScale.long}>
              Takip ettiğin takımların maçları, formu ve haberleri burada toplanır; gol ve sonuç bildirimi gelir.
            </Text>
            <View style={styles.picker}>
              <LeaguePicker pinned={false} step="league" />
            </View>
            <View style={styles.pad}>
              <TeamPickerGrid isSelected={isTeamFollowed} onPress={followTeam} testID="takip-team-grid" />
            </View>
            <Button
              label="Takım ara"
              icon="search-outline"
              variant="ghost"
              size="sm"
              onPress={openTeamSearch}
              style={styles.searchLink}
            />
          </>
        )}

        {/* ── 3) TAKİP ETTİĞİN MAÇLAR ── */}
        {favoriteMatches.length ? (
          <>
            <SectionHeader title="Takip ettiğin maçlar" meta={`${favoriteMatches.length} maç`} />
            <View style={[styles.pad, styles.stack]}>
              {matchesLoading && !followedMatches.length ? (
                <SkeletonMatchRow count={Math.min(favoriteMatches.length, 2)} />
              ) : (
                followedMatches.map((match) => (
                  <FollowedMatchCard
                    key={match.id}
                    match={match}
                    homeLogo={logoFor(match.home_team_id, match.first_team_name)}
                    awayLogo={logoFor(match.away_team_id, match.second_team_name)}
                    onOpen={openMatch}
                  />
                ))
              )}
            </View>
          </>
        ) : null}

        {/* ── 4) AKIŞ: haber / transfer / disiplin ── */}
        {hasTeams || scopeRows.length ? (
          <>
            <SectionHeader title="Akış" meta={news.items.length ? `${news.items.length} kayıt` : undefined} />
            <View style={styles.pad}>
              {news.loading && !news.items.length ? (
                <SkeletonListRow count={3} />
              ) : news.error && !news.items.length ? (
                <ErrorState error={news.error} variant="banner" onRetry={news.refetch} />
              ) : news.items.length ? (
                news.items.map(({ item, reason, href }, index) => (
                  <ListRow
                    key={`${item.kind}:${item.id}`}
                    leading={NEWS_ICON[item.kind] ?? NEWS_ICON.news}
                    title={item.title}
                    subtitle={[item.category_label ?? NEWS_KIND_LABEL[item.kind], reason, timeAgo(item.published_at)]
                      .filter(Boolean)
                      .join(" · ")}
                    position={rowPosition(index, news.items.length)}
                    onPress={href ? () => openHref(href) : undefined}
                    chevron={Boolean(href)}
                  />
                ))
              ) : (
                <Text style={styles.note} {...textScale.long}>
                  Takip ettiklerinle ilgili yeni haber, transfer ya da disiplin kararı yok.
                </Text>
              )}
            </View>
          </>
        ) : null}

        {/* ── 5) LİGLER ── */}
        {scopeRows.length ? (
          <>
            <SectionHeader title="Ligler" meta={`${scopeRows.length} takip`} />
            <View style={styles.pad}>
              {scopeRows.map(({ item, kind }, index) => (
                <ScopeFollowRow
                  key={`${kind}:${item.id}`}
                  item={item}
                  kind={kind}
                  position={rowPosition(index, scopeRows.length)}
                  onOpen={openScope}
                />
              ))}
            </View>
          </>
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
  /* flexGrow YOK: web'de yatay ScrollView'lar (şerit, maç rayı) varsayılan
     flexGrow taşır; içerik kabı büyürse boş alanı onlar doldurup uzar. */
  content: {
    paddingBottom: layout.tabBarHeight + space.xxl,
  },
  pad: {
    paddingHorizontal: layout.screenPadding,
  },
  stack: {
    gap: space.m,
  },
  picker: {
    marginTop: space.md,
    marginBottom: space.md,
  },
  lead: {
    ...type.bodySm,
    color: colors.textSecondary,
  },
  note: {
    ...type.bodySm,
    color: colors.textTertiary,
  },
  searchLink: {
    alignSelf: "center",
    marginTop: space.sm,
  },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingVertical: space.md,
    paddingLeft: space.lg,
    paddingRight: space.md,
    marginTop: space.sm,
    borderRadius: radius.xl,
  },
  bannerIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.brandDim,
    alignItems: "center",
    justifyContent: "center",
  },
  bannerText: {
    ...type.bodySm,
    color: colors.textSecondary,
    flex: 1,
  },
  matchFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  matchFooterText: {
    ...type.caption,
    color: colors.textTertiary,
    flex: 1,
  },
  rowControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
  },
});
