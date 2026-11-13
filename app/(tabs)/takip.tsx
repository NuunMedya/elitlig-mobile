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
  IconTile,
  ListRow,
  MatchCard,
  MatchCardRail,
  MetricGrid,
  MetricTile,
  Reveal,
  ScreenHeader,
  SectionHeader,
  SkeletonListRow,
  SkeletonMatchRow,
  Surface,
  refreshControlProps,
  useHeaderScroll,
  useRefresh,
  useToast,
} from "@/components/ui";
import type { IconTileTone, LeadingIcon } from "@/components/ui";
import { useLiveFavoriteCount } from "@/hooks/useLiveFavoriteCount";
import { useTeamLogos } from "@/hooks/useTeamLogos";
import { getMatch, getTeamMatches } from "@/lib/api/matches";
import { getLeagues } from "@/lib/api/meta";
import { timeAgo } from "@/lib/format";
import { matchState } from "@/lib/match";
import { queryKeys } from "@/lib/queryKeys";
import type { ApiMatch, NewsItem } from "@/lib/types";
import { useAuth } from "@/providers/AuthProvider";
import { useFavorite, type FavoriteScope, type FavoriteTeam, type FollowTarget } from "@/providers/FavoriteProvider";
import { useFollowFlow } from "@/providers/FollowFlowProvider";
import { useScope } from "@/providers/ScopeProvider";
import { colors, elevate, hairline, layout, radius, space, textScale, type } from "@/theme";

type Position = "single" | "first" | "middle" | "last";

function rowPosition(index: number, total: number): Position {
  if (total <= 1) return "single";
  if (index === 0) return "first";
  if (index === total - 1) return "last";
  return "middle";
}

/** Akış satırının ikonu — kaydın türü (`kind`) ne olduğunu söyler. */
const NEWS_ICON: Record<NewsItem["kind"], { icon: keyof typeof Ionicons.glyphMap; tone: IconTileTone }> = {
  news: { icon: "newspaper", tone: "cyan" },
  transfer: { icon: "swap-horizontal", tone: "violet" },
  penalty: { icon: "alert-circle", tone: "gold" },
};

function NewsTile({ kind }: { kind: NewsItem["kind"] }) {
  const look = NEWS_ICON[kind] ?? NEWS_ICON.news;
  return <IconTile icon={look.icon} tone={look.tone} size={36} glow={false} />;
}

/** Boş durum kartının üç kazanımı. */
const INTRO_PERKS: { icon: keyof typeof Ionicons.glyphMap; label: string }[] = [
  { icon: "football", label: "Maçlar" },
  { icon: "pulse", label: "Form" },
  { icon: "notifications", label: "Gol bildirimi" },
];

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
      <IconTile icon="notifications" tone="violet" size={36} glow={false} />
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
  const toast = useToast();
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

  /**
   * Takip edilen lig / sezon / il → Lig sekmesi, DOĞRU kapsamla.
   *
   * Takip kaydı ligin ilini tutmaz. Eskiden başka ildeki bir lige dokununca
   * `selectLeague` seçili ilde o kimliği arıyor, bulamayınca ScopeProvider
   * sessizce ilin İLK ligine kayıyordu: kullanıcı "X Ligi"ne dokunup başka
   * bir ligin tablosunu görüyordu. Artık lig seçili ilde yoksa diğer illerin
   * lig listeleri (küçük, 10 dk önbellekli) taranır ve il + lig birlikte
   * atlanır; hiçbir yerde yoksa (arşivlenmiş) kullanıcıya söylenir.
   */
  const openScope = useCallback(
    async (item: FavoriteScope, kind: "league" | "season" | "city") => {
      if (kind === "league") {
        const pinned = scope.pinnedLeagues.find((entry) => entry.leagueId === item.id);
        if (item.id === scope.leagueId) {
          // Zaten bu ligdeyiz: `selectLeague` sezonu sıfırlar, dokunma.
        } else if (pinned) {
          scope.jumpTo(pinned.cityId, item.id);
        } else if (scope.leagues.some((league) => league.id === item.id)) {
          scope.selectLeague(item.id);
        } else {
          const lists = await Promise.all(
            scope.cities
              .filter((city) => city.id !== scope.cityId)
              .map((city) =>
                queryClient
                  .fetchQuery({
                    queryKey: queryKeys.leagues(city.id),
                    queryFn: () => getLeagues(city.id),
                    staleTime: 10 * 60_000,
                  })
                  .then((leagues) => ({ cityId: city.id, leagues }))
                  .catch(() => null),
              ),
          );
          const home = lists.find((entry) => entry?.leagues.some((league) => league.id === item.id));
          if (!home) {
            toast.show({ message: `${item.name} şu an yayında değil ya da arşivlenmiş.`, tone: "neutral" });
            return;
          }
          scope.jumpTo(home.cityId, item.id);
        }
      } else if (kind === "season") {
        if (item.id !== scope.seasonId) {
          if (!scope.seasons.some((season) => season.id === item.id)) {
            // Sezon başka bir ligin: yanlış ligde seçmek yerine seçiciye yönlendir.
            toast.show({ message: "Bu sezon başka bir ligde. Lig seçiciden açabilirsin.", tone: "neutral" });
            scope.openScopeSheet("league");
            return;
          }
          scope.selectSeason(item.id);
        }
      } else if (item.id !== scope.cityId) {
        scope.selectCity(item.id);
      }
      router.push("/(tabs)/ligler");
    },
    [queryClient, router, scope, toast]
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
          <Reveal style={styles.pad}>
            <GuestBanner onSignIn={openSignIn} />
          </Reveal>
        )}

        {/* ── ÖZET — kaç takım, maç ve lig takipte. ── */}
        {hasTeams || favoriteMatches.length || scopeRows.length ? (
          <Reveal style={[styles.pad, styles.summary]}>
            <MetricGrid columns={3}>
              <MetricTile label="Takım" value={String(favorites.length)} icon="shield-half" tone="brand" />
              <MetricTile
                label="Maç"
                value={String(teamMatches.length + followedMatches.length)}
                icon="football"
                tone="live"
              />
              <MetricTile label="Lig" value={String(scopeRows.length)} icon="trophy" tone="warn" />
            </MetricGrid>
          </Reveal>
        ) : null}

        {/* ── 1) TAKIMLARIM ── */}
        {hasTeams ? (
          <>
            <SectionHeader
              title="Takımlarım"
              icon="shield-half"
              iconTone="violet"
              meta={`${favorites.length}`}
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
            <SectionHeader
              title="Maçlar"
              icon="football"
              iconTone="pink"
              subtitle="Her takımın en güncel maçı"
              meta={teamMatches.length ? `${teamMatches.length}` : undefined}
            />
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
            {/* BOŞ DURUM KARTI — takip neyi getirir, üç hapla. */}
            <Reveal style={styles.pad}>
              <View style={styles.intro}>
                <IconTile icon="star" tone="signature" size={44} />
                <View style={styles.introBody}>
                  <Text style={styles.introTitle} {...textScale.dense}>
                    Takımını seç
                  </Text>
                  <Text style={styles.lead} {...textScale.long}>
                    Maçları, formu ve haberleri burada toplanır; gol ve sonuç bildirimi gelir.
                  </Text>
                  <View style={styles.introPerks}>
                    {INTRO_PERKS.map((perk) => (
                      <View key={perk.label} style={styles.introPerk}>
                        <Ionicons name={perk.icon} size={12} color={colors.accentText} />
                        <Text style={styles.introPerkText} {...textScale.badge}>
                          {perk.label}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              </View>
            </Reveal>
            <SectionHeader title="Ligin takımları" icon="trophy" iconTone="gold" subtitle="Puan sırasıyla; dokun, takip et" />
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
            <SectionHeader
              title="Takip ettiğin maçlar"
              icon="star"
              iconTone="gold"
              meta={`${favoriteMatches.length}`}
            />
            <View style={[styles.pad, styles.stack]}>
              {matchesLoading && !followedMatches.length ? (
                <SkeletonMatchRow count={Math.min(favoriteMatches.length, 2)} />
              ) : !followedMatches.length ? (
                /* Sorgular bitti ama tek maç bile gelmedi (ağ hatası ya da maç
                   silinmiş): başlığın altında boşluk yerine ne olduğunu söyle. */
                <ErrorState
                  error={matchQueries.find((query) => query.isError)?.error ?? null}
                  variant="banner"
                  onRetry={refetchAll}
                />
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
            <SectionHeader
              title="Akış"
              icon="newspaper"
              iconTone="cyan"
              subtitle="Haber, transfer ve disiplin"
              meta={news.items.length ? `${news.items.length}` : undefined}
            />
            <View style={styles.pad}>
              {news.loading && !news.items.length ? (
                <SkeletonListRow count={3} />
              ) : news.error && !news.items.length ? (
                <ErrorState error={news.error} variant="banner" onRetry={news.refetch} />
              ) : news.items.length ? (
                news.items.map(({ item, reason, href }, index) => (
                  <ListRow
                    key={`${item.kind}:${item.id}`}
                    leading={<NewsTile kind={item.kind} />}
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
            <SectionHeader title="Ligler" icon="trophy" iconTone="gold" meta={`${scopeRows.length}`} />
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
  summary: {
    marginTop: space.sm,
  },
  intro: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space.md,
    marginTop: space.sm,
    padding: space.lg,
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
    ...elevate(1),
  },
  introBody: { flex: 1, minWidth: 0, gap: space.xs },
  introTitle: { ...type.h2, color: colors.textPrimary },
  introPerks: { flexDirection: "row", flexWrap: "wrap", gap: space.xs, marginTop: space.xs },
  introPerk: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: space.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.accentDim,
    borderWidth: hairline,
    borderColor: colors.accentBorder,
  },
  introPerkText: { ...type.micro, color: colors.accentText },
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
