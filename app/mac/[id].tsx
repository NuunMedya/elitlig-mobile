/**
 * MAÇ DETAYI — uygulamanın en çok açılan ekranı ve gol bildiriminin varış noktası.
 *
 * NE: tek bir maçın sahnesi. Yukarıdan aşağı:
 *
 *   ┌ atmosfer (grafit + kapak dokusu, dipte kâğıda yıkanır) ─────────────┐
 *   │  ‹                                                         ⤴       │  şeffaf başlık
 *   │  ╭──────────────── skor tablosu (grafit kart) ────────────────╮    │
 *   │  │  LİG · SEZON   arma 13 – 9 arma   golcüler · künye · takip  │    │
 *   └──╰─────────────────────────────────────────────────────────────╯───┘
 *      Özet · Kadro · İstatistik · H2H · Puan                              kâğıt sekmeler
 *      ……… sekme içeriği (kâğıt) ………
 *
 * NEDEN KENDİ ATMOSFERİ (Arena §3, README "Maç detayı — sahne"): takım ve
 * oyuncu sayfaları kimliği grafit başlık bloğunun İÇİNDE taşır. Maç detayı
 * bir kimlik değil bir ANDIR; skor tablosu sahnenin üstünde duran bir nesne
 * olarak çizilir, sahne arkasında ışık gibi kâğıda yıkanır. Başlık
 * `transparent` kiptedir; kaydırınca tablo kapanır, başlık satırı grafitle
 * opaklaşır ve "ÖZM 13–9 VUR" kısaltmasını taşır; sekmeler kâğıtta yapışık
 * kalır.
 *
 * SABİT SEKMELER: Özet · Kadro · İstatistik · H2H · Puan — maçın durumuna ve
 * veriye göre gizlenmez, adı/sırası değişmez; verisi olmayan sekme kendi
 * içinde boş durum gösterir. Maç CANLIYKEN Özet'e yalnız kırmızı nokta
 * eklenir (eskiden canlı maçta ilk sekmenin adı "Canlı" oluyordu; ondan da
 * önce altı sekme vardı ve Özet ile Canlı aynı olayları iki kez gösteriyordu).
 *
 * EYLEMLER (detay sayfalarının ortak sözleşmesi):
 *   - PAYLAŞ başlığın SAĞ ÜSTÜNDEKİ tek ikon ("share-outline"): oynanmamış ve
 *     biten maçta `ShareScoreCard` görsel kartı, canlı maçta RN `Share` ile
 *     skor metni. Başka yerde paylaş düğmesi yok.
 *   - TAKİP = BİLDİRİM: skor tablosundaki "Takip et" `useFollowFlow().toggle`
 *     ile maçı takip eder ve bildirim türleri alt sayfasını açar; zil aynı
 *     alt sayfayı yeniden açar.
 *
 * NEDEN URL PARAMETRESİ: `/mac/<id>?tab=canli` gol ve "maç başladı"
 * bildirimlerinin varış noktasıdır; segment ekran durumunda değil ROTADA
 * taşınır. "canli" ile "ozet" aynı sekmeye çözülür (maç bittiğinde bildirime
 * dokunan kullanıcı hatasız Özet'e düşer).
 *
 * VERİ KAYNAKLARI (öncelik sırası korunur):
 *   1. maç kaydı     — lig, saha, tarih, kesinleşmiş skor, manşet, video
 *   2. kadro ucu     — oyuncu adları/fotoğrafları çözülmüş kadrolar
 *   3. canlı görüntü — YALNIZ maç canlıyken: skor, sayaç, olaylar
 *                      (useLiveMatch: anlık görüntü + soket, düşerse yoklama)
 *   4. takım maçları — form ve aralarındaki maçlar (Özet ve H2H)
 *   5. puan tablosu  — maçın kendi ligi/sezonu (Puan ve maç öncesi Özet)
 *
 * DOSYA DÜZENİ: bu dosya yalnız KABUKTUR — sorgular, türetmeler, başlık ve
 * sekme seçimi. Skor tablosu ve sekmeler `components/matchpage/` altındadır.
 */

import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshControl, Share, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ShareScoreCard } from "@/components/ShareScoreCard";
import { HeadToHeadTab } from "@/components/matchpage/HeadToHeadTab";
import { LineupTab } from "@/components/matchpage/LineupTab";
import { MatchAtmosphere } from "@/components/matchpage/MatchAtmosphere";
import { PaperCard } from "@/components/matchpage/parts";
import { Scoreboard, ScoreboardSkeleton } from "@/components/matchpage/Scoreboard";
import { StandingsTab } from "@/components/matchpage/StandingsTab";
import { StatsTab } from "@/components/matchpage/StatsTab";
import { SummaryTab } from "@/components/matchpage/SummaryTab";
import {
  firstParam,
  resolveTab,
  teamCode,
  useGoalScorers,
  useHeadToHead,
  usePlayerNames,
  useSubstitutions,
  type MatchTab,
} from "@/components/matchpage/shared";
import {
  EmptyState,
  ErrorState,
  HeaderToneContext,
  ScreenHeader,
  Skeleton,
  Tabs,
  refreshControlProps,
  useHeaderScroll,
  useRefresh,
  type ScreenHeaderAction,
  type TabItem,
} from "@/components/ui";
import { useLiveMatch } from "@/hooks/useLiveMatch";
import { useTeamLogos } from "@/hooks/useTeamLogos";
import { getMatch, getMatchKadro, getTeamMatches } from "@/lib/api/matches";
import { getStandings } from "@/lib/api/standings";
import { addMatchToCalendar } from "@/lib/calendar";
import { formatDateShort, formatTime, mediaUrl, stripTeamSuffix } from "@/lib/format";
import { isTimelineEvent, matchState } from "@/lib/match";
import { buildContributions, buildStatRows, buildTopPlayers } from "@/lib/matchStats";
import { queryKeys } from "@/lib/queryKeys";
import { useFavorite } from "@/providers/FavoriteProvider";
import { useFollowFlow } from "@/providers/FollowFlowProvider";
import { useScope } from "@/providers/ScopeProvider";
import { colors, hairline, layout, space } from "@/theme";
import type { ApiMatchEvent, KadroPlayer, MatchState } from "@/lib/types";

export default function MatchDetailScreen() {
  const params = useLocalSearchParams<{ id: string; tab?: string }>();
  const router = useRouter();
  const scope = useScope();
  const teams = useTeamLogos();
  const { isFavoriteMatch } = useFavorite();
  const flow = useFollowFlow();
  const { scrollY, scrollProps } = useHeaderScroll();

  const matchId = Number(firstParam(params.id));
  const validId = Number.isFinite(matchId) && matchId > 0;

  /* ---- Sekme: rotadan gelir, rotaya yazılır ---- */
  const routeTab = resolveTab(firstParam(params.tab));
  const [tab, setTab] = useState<MatchTab>(routeTab);

  useEffect(() => {
    setTab(routeTab);
    scrollY.setValue(0);
  }, [routeTab, scrollY]);

  /* ---- Sorgular ---- */
  const matchQuery = useQuery({
    queryKey: queryKeys.match(matchId),
    queryFn: () => getMatch(matchId, ["timeline"]),
    enabled: validId,
  });

  const kadroQuery = useQuery({
    queryKey: [...queryKeys.match(matchId), "kadro"],
    queryFn: () => getMatchKadro(matchId),
    enabled: validId,
    staleTime: 5 * 60_000,
  });

  const match = matchQuery.data;

  /*
   * KADRO ADLARI TEK YERDE TEMİZLENİR.
   *
   * Kayıtların bir bölümünde oyuncu adı takım adıyla birlikte girilmiş
   * ("Yusuf YILDIRIM İNFERNO FK"). Bu ad ekranda beş ayrı yerde okunuyor
   * (golcüler, zaman tüneli, saha, en iyi oyuncular, kadro satırı); her
   * birinde ayrı ayrı kırpmak yerine kadro yükünün KENDİSİ bir kez düzeltilir
   * — `lib/matchStats` türetmeleri de temiz adı görür.
   */
  const kadro = useMemo(() => {
    const raw = kadroQuery.data;
    if (!raw) return raw;
    const home = match?.first_team_name;
    const away = match?.second_team_name;
    const clean = (rows: KadroPlayer[] | undefined) =>
      (rows ?? []).map((row) => {
        const source = row.playerName ?? row.guestName ?? null;
        const tidy = stripTeamSuffix(source, home, away);
        if (!tidy || tidy === source) return row;
        return {
          ...row,
          playerName: row.playerName ? tidy : row.playerName,
          guestName: row.guestName ? tidy : row.guestName,
        };
      });
    return { ...raw, home: clean(raw.home), away: clean(raw.away) };
  }, [kadroQuery.data, match?.first_team_name, match?.second_team_name]);

  const state: MatchState = match ? matchState(match) : "scheduled";
  const live = state === "live";

  const { snapshot, realtime } = useLiveMatch(validId ? matchId : null, live);

  /**
   * Takım kimlikleri. Eski maçlarda `home_team_id` boş olabilir; kadro ucu bu
   * durumda ev/deplasmanı çözer, o da yoksa ada göre eşleşme denenir.
   */
  const homeTeamId = useMemo(() => {
    if (!match) return null;
    const resolved = match.home_team_id ?? kadro?.meta?.home_team_id ?? teams.idFor(null, match.first_team_name);
    return Number(resolved) || null;
  }, [match, kadro, teams]);

  const awayTeamId = useMemo(() => {
    if (!match) return null;
    const resolved = match.away_team_id ?? kadro?.meta?.away_team_id ?? teams.idFor(null, match.second_team_name);
    return Number(resolved) || null;
  }, [match, kadro, teams]);

  /*
   * İLK SEKME TEK: canlıyken anahtarı "canli", değilken "ozet". Rotadan
   * hangisi gelirse gelsin maçın o anki durumuna çözülür; böylece bildirimle
   * gelen `?tab=canli` maç bitmişse hatasız Özet'i açar.
   */
  const firstTab: MatchTab = live ? "canli" : "ozet";
  const activeTab: MatchTab = tab === "ozet" || tab === "canli" ? firstTab : tab;

  const tabItems = useMemo<TabItem<MatchTab>[]>(
    () => [
      /* Etiket SABİT ("Özet"); canlıyken yalnız kırmızı nokta eklenir —
         sekme seti ve adları maçın durumuna göre değişmez. */
      live ? { key: "canli", label: "Özet", badge: "dot" } : { key: "ozet", label: "Özet" },
      { key: "kadro", label: "Kadro" },
      { key: "istatistik", label: "İstatistik" },
      { key: "h2h", label: "H2H" },
      { key: "puan", label: "Puan" },
    ],
    [live],
  );

  const changeTab = useCallback(
    (next: MatchTab) => {
      setTab(next);
      scrollY.setValue(0); // Yeni listenin tepesindeyiz; başlık yeniden açılsın.
      router.setParams({ tab: next });
    },
    [router, scrollY],
  );

  /* ---- Takım maçları: Özet (form, aralarındaki maçlar, fotoğraflar) ve H2H ---- */
  const wantsTeamMatches = activeTab === "h2h" || activeTab === firstTab;

  const homeMatchesQuery = useQuery({
    queryKey: queryKeys.teamMatches(homeTeamId ?? 0),
    queryFn: () => getTeamMatches(homeTeamId as number),
    enabled: wantsTeamMatches && Boolean(homeTeamId),
    staleTime: 60_000,
  });

  const awayMatchesQuery = useQuery({
    queryKey: queryKeys.teamMatches(awayTeamId ?? 0),
    queryFn: () => getTeamMatches(awayTeamId as number),
    enabled: wantsTeamMatches && Boolean(awayTeamId),
    staleTime: 60_000,
  });

  /* ---- Puan durumu: maçın KENDİ ligi/sezonu (ekrandaki kapsam değil) ---- */
  const standingsScope = useMemo(
    () => ({
      cityId: match?.city_id ?? scope.cityId ?? undefined,
      leagueId: match?.league_id ?? undefined,
      seasonId: match?.season_id ?? undefined,
    }),
    [match?.city_id, match?.league_id, match?.season_id, scope.cityId],
  );
  const scoped = Boolean(standingsScope.leagueId && standingsScope.seasonId);

  /* Maç öncesi Özet de iki takımın tablodaki yerini gösterir. */
  const wantsStandings = activeTab === "puan" || (state === "scheduled" && activeTab === "ozet");

  const standingsQuery = useQuery({
    queryKey: queryKeys.standings(standingsScope),
    queryFn: () =>
      getStandings({
        cityId: standingsScope.cityId as number,
        leagueId: standingsScope.leagueId as number,
        seasonId: standingsScope.seasonId as number,
      }),
    enabled: wantsStandings && scoped,
    staleTime: 60_000,
  });

  /* ---- Olaylar ve türetilmiş veriler ---- */
  const events = useMemo<ApiMatchEvent[]>(
    () => snapshot?.events ?? match?.timeline ?? [],
    [snapshot?.events, match?.timeline],
  );

  /** Zaman tüneli: eskiden yeniye. Sekme kendi sırasını kendisi seçer. */
  const timeline = useMemo(
    () =>
      events
        .filter(isTimelineEvent)
        .slice()
        .sort((a, b) => (a.dakika ?? 0) - (b.dakika ?? 0) || a.id - b.id),
    [events],
  );

  const statRows = useMemo(() => buildStatRows(events, homeTeamId, awayTeamId), [events, homeTeamId, awayTeamId]);
  const bestPlayers = useMemo(() => buildTopPlayers(events, kadro), [events, kadro]);
  const contributions = useMemo(() => buildContributions(events, kadro), [events, kadro]);

  const nameOf = usePlayerNames(kadro);
  const substitutions = useSubstitutions(events);
  const scorers = useGoalScorers(events, homeTeamId, awayTeamId, nameOf);

  const homeLogo = teams.logoFor(match?.home_team_id, match?.first_team_name);
  const awayLogo = teams.logoFor(match?.away_team_id, match?.second_team_name);

  const homeScore = snapshot?.homeScore ?? match?.first_team_score ?? null;
  const awayScore = snapshot?.awayScore ?? match?.second_team_score ?? null;

  const meetings = useHeadToHead({
    match,
    homeTeamId,
    awayTeamId,
    homeMatches: homeMatchesQuery.data,
    awayMatches: awayMatchesQuery.data,
  });

  /* ---- Takip, takvim, paylaşım ---- */
  const favorite = isFavoriteMatch(matchId);

  /**
   * TAKİP = BİLDİRİM: "Takip et" maçı takip eder ve o maçın bildirim türleri
   * alt sayfasını açar (useFollowFlow); takip ediliyorsa bırakır. Zil aynı
   * alt sayfayı yeniden açar — misafirde alt sayfa giriş çağrısı gösterir.
   */
  const followTarget = useMemo(
    () => ({
      type: "match" as const,
      id: matchId,
      name: match ? `${match.first_team_name} – ${match.second_team_name}` : "Maç",
    }),
    [match, matchId],
  );

  const toggleFollow = useCallback(() => {
    if (!validId) return;
    flow.toggle(followTarget);
  }, [flow, followTarget, validId]);

  const openNotifications = useCallback(() => flow.openSettings(followTarget), [flow, followTarget]);

  const addToCalendar = useCallback(() => {
    if (match) void addMatchToCalendar(match);
  }, [match]);

  /*
   * PAYLAŞIM TEK KAPIDAN: başlıktaki paylaş ikonu. Oynanmamış ve biten maçta
   * görsel kart (Maç Günü / Maç Sonu) açılır; canlı maçta görsel kart yoktur
   * (skor her an değişiyor), skor metin olarak paylaşılır. Eskiden Özet'in
   * sonunda ikinci bir mor "Paylaş" düğmesi daha vardı.
   */
  const [shareOpen, setShareOpen] = useState(false);
  const shareText = useCallback(() => {
    if (!match) return;
    const score =
      state === "scheduled"
        ? `${formatDateShort(match.date)} ${formatTime(match.time)}`
        : `${homeScore ?? 0} - ${awayScore ?? 0}`;
    const lines = [
      `${match.first_team_name} ${score} ${match.second_team_name}`,
      [match.league_name, match.match_season].filter(Boolean).join(" · "),
      match.match_field ? `Saha: ${match.match_field}` : null,
      "ElitLig",
    ].filter(Boolean) as string[];
    void Share.share({ message: lines.join("\n") });
  }, [awayScore, homeScore, match, state]);

  const actions = useMemo<ScreenHeaderAction[]>(() => {
    if (!match) return [];
    return [
      {
        icon: "share-outline",
        onPress: live ? shareText : () => setShareOpen(true),
        accessibilityLabel: live ? "Skoru paylaş" : state === "finished" ? "Sonucu paylaş" : "Maç gününü paylaş",
      },
    ];
  }, [live, match, shareText, state]);

  /* ---- Yenileme: açık olan sekmenin kaynaklarını tazeler ---- */
  const refetchAll = useCallback(() => {
    void matchQuery.refetch();
    void kadroQuery.refetch();
    if (wantsTeamMatches) {
      void homeMatchesQuery.refetch();
      void awayMatchesQuery.refetch();
    }
    if (wantsStandings && scoped) void standingsQuery.refetch();
  }, [awayMatchesQuery, homeMatchesQuery, kadroQuery, matchQuery, scoped, standingsQuery, wantsStandings, wantsTeamMatches]);

  const refresh = useRefresh(refetchAll, { refreshing: matchQuery.isRefetching });

  /* ---- Erken çıkışlar: geçersiz bağlantı, yükleniyor, hata ---- */
  if (!validId || matchQuery.isLoading || matchQuery.isError || !match) {
    return (
      <MatchFallback
        kind={!validId ? "invalid" : matchQuery.isLoading ? "loading" : "error"}
        error={matchQuery.error}
        onRetry={() => void matchQuery.refetch()}
        onHome={() => router.replace("/")}
      />
    );
  }

  const refreshControl = <RefreshControl {...refreshControlProps(refresh.refreshing, refresh.onRefresh)} />;

  /* Daralan başlıktaki kısaltma: "ÖZM 13–9 VUR" / "MİX – MEN". */
  const compactTitle =
    state === "scheduled"
      ? `${teamCode(match.first_team_name)} – ${teamCode(match.second_team_name)}`
      : `${teamCode(match.first_team_name)} ${homeScore ?? 0}–${awayScore ?? 0} ${teamCode(match.second_team_name)}`;

  return (
    <View style={styles.screen}>
      <MatchStage photo={mediaUrl(match.match_picture)}>
        <ScreenHeader
          title={compactTitle}
          back
          transparent
          onDark
          surface={colors.matchTint}
          scrollY={scrollY}
          actions={actions}
          hero={
            <View style={styles.hero}>
              <Scoreboard
                match={match}
                state={state}
                snapshot={snapshot}
                homeScore={homeScore}
                awayScore={awayScore}
                homeLogo={homeLogo}
                awayLogo={awayLogo}
                homeTeamId={homeTeamId}
                awayTeamId={awayTeamId}
                scorers={scorers}
                timeline={timeline}
                following={favorite}
                onToggleFollow={toggleFollow}
                onOpenNotifications={openNotifications}
                onAddToCalendar={addToCalendar}
              />
            </View>
          }
          bottom={
            /* Sekmeler KÂĞITTA: başlık şeffaf kipte "ink" tonu yayıyor; şerit
               onun dışında, kâğıdın üstünde durduğu için tonu burada düzeltilir. */
            <HeaderToneContext.Provider value="paper">
              <Tabs items={tabItems} value={activeTab} onChange={changeTab} sticky surface={colors.matchCanvas} />
            </HeaderToneContext.Provider>
          }
        />
      </MatchStage>

      {activeTab === "ozet" || activeTab === "canli" ? (
        <SummaryTab
          match={match}
          state={state}
          snapshot={snapshot}
          realtime={realtime}
          timeline={timeline}
          homeTeamId={homeTeamId}
          awayTeamId={awayTeamId}
          nameOf={nameOf}
          bestPlayers={bestPlayers}
          statRows={statRows}
          meetings={meetings}
          homeMatches={homeMatchesQuery.data}
          awayMatches={awayMatchesQuery.data}
          standings={standingsQuery.data}
          homeLogo={homeLogo}
          awayLogo={awayLogo}
          onOpenTab={changeTab}
          scrollProps={scrollProps}
          refreshControl={refreshControl}
        />
      ) : activeTab === "kadro" ? (
        <LineupTab
          match={match}
          kadro={kadro}
          loading={kadroQuery.isLoading}
          error={kadroQuery.isError ? kadroQuery.error : null}
          onRetry={kadroQuery.refetch}
          contributions={contributions}
          substitutions={substitutions}
          homeLogo={homeLogo}
          awayLogo={awayLogo}
          scrollProps={scrollProps}
          refreshControl={refreshControl}
        />
      ) : activeTab === "istatistik" ? (
        <StatsTab
          match={match}
          state={state}
          statRows={statRows}
          bestPlayers={bestPlayers}
          homeLogo={homeLogo}
          awayLogo={awayLogo}
          scrollProps={scrollProps}
          refreshControl={refreshControl}
        />
      ) : activeTab === "h2h" ? (
        <HeadToHeadTab
          match={match}
          meetings={meetings}
          homeTeamId={homeTeamId}
          awayTeamId={awayTeamId}
          homeMatches={homeMatchesQuery.data}
          awayMatches={awayMatchesQuery.data}
          loading={homeMatchesQuery.isLoading || awayMatchesQuery.isLoading}
          homeLogo={homeLogo}
          awayLogo={awayLogo}
          scrollProps={scrollProps}
          refreshControl={refreshControl}
        />
      ) : (
        <StandingsTab
          rows={standingsQuery.data}
          loading={standingsQuery.isLoading}
          error={standingsQuery.isError ? standingsQuery.error : null}
          onRetry={standingsQuery.refetch}
          scoped={scoped}
          leagueLabel={[match.league_name, match.match_season].filter(Boolean).join(" · ") || null}
          homeTeamId={homeTeamId}
          awayTeamId={awayTeamId}
          scrollProps={scrollProps}
          refreshControl={refreshControl}
        />
      )}

      {state !== "live" ? (
        <ShareScoreCard
          mode={state === "finished" ? "fulltime" : "matchday"}
          match={match}
          homeScore={homeScore}
          awayScore={awayScore}
          mvp={bestPlayers[0] ?? null}
          stats={statRows}
          contributions={contributions}
          homeLogo={homeLogo}
          awayLogo={awayLogo}
          visible={shareOpen}
          onClose={() => setShareOpen(false)}
          hideTrigger
        />
      ) : null}
    </View>
  );
}

/**
 * Sahne kabı: atmosfer + başlık. Güvenli alanı atmosfer boyar (durum çubuğunun
 * arkası da sahnedir); başlık şeffaf kipte güvenli alan hilesi uygulamadığı
 * için üst boşluğu burada verilir.
 */
function MatchStage({
  photo,
  wash = true,
  children,
}: {
  photo: string | null;
  wash?: boolean;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.stage, { paddingTop: insets.top }]}>
      <MatchAtmosphere photo={photo} wash={wash} />
      {children}
    </View>
  );
}

/**
 * Maç yüklenmeden önceki üç hâl — aynı sahnede.
 *
 * YÜKLENİYOR: boş bir başlık + dönen çember değil, sayfanın kendisi: atmosfer,
 * içi boş skor tablosu, kâğıtta iskelet satırlar. Veri gelince yerleşim
 * kaymaz, yalnız içerik dolar.
 */
function MatchFallback({
  kind,
  error,
  onRetry,
  onHome,
}: {
  kind: "invalid" | "loading" | "error";
  error: unknown;
  onRetry: () => void;
  onHome: () => void;
}) {
  return (
    <View style={styles.screen}>
      <MatchStage photo={null} wash={kind === "loading"}>
        <ScreenHeader
          title="Maç"
          back
          transparent
          onDark
          surface={colors.matchTint}
          hero={
            kind === "loading" ? (
              <View style={styles.hero}>
                <ScoreboardSkeleton />
              </View>
            ) : undefined
          }
        />
      </MatchStage>

      {kind === "loading" ? (
        <BodySkeleton />
      ) : kind === "invalid" ? (
        <EmptyState
          icon="alert-circle-outline"
          title="Maç bulunamadı"
          body="Bağlantıdaki maç numarası okunamadı. Maç listesinden yeniden açmayı dene."
          action={{ label: "Maçlara dön", onPress: onHome }}
        />
      ) : (
        <ErrorState error={error} onRetry={onRetry} />
      )}
    </View>
  );
}

/**
 * Kâğıt iskeleti — sekmelerin gerçek düzeninin taklidi: bölüm başlığı + kart
 * içinde ikonlu satırlar. Genel `SkeletonCard` kenardan kenara uzanıyor ve
 * sayfanın kart diline (14px kenar, 18px köşe) benzemiyordu.
 */
function BodySkeleton() {
  return (
    <View style={styles.loading} accessibilityLabel="Maç yükleniyor">
      <View style={styles.skeletonTabs}>
        {[44, 52, 72, 36, 40].map((width, index) => (
          <Skeleton key={index} width={width} height={14} />
        ))}
      </View>
      <Skeleton width={128} height={16} style={styles.skeletonTitle} />
      <PaperCard>
        {[0, 1, 2, 3, 4].map((row) => (
          <View key={row} style={[styles.skeletonRow, row > 0 ? styles.skeletonRuled : null]}>
            <Skeleton width={28} height={28} radius="sm" />
            <Skeleton width={row % 2 ? 140 : 96} height={12} />
            <View style={styles.flex} />
            <Skeleton width={row % 2 ? 48 : 72} height={12} />
          </View>
        ))}
      </PaperCard>
    </View>
  );
}

const styles = StyleSheet.create({
  /* Sayfa kâğıdı: atmosferin son durağıyla birebir aynı ton. */
  screen: {
    flex: 1,
    backgroundColor: colors.matchCanvas,
  },
  stage: {
    overflow: "hidden",
  },
  hero: {
    paddingTop: space.xs,
    paddingBottom: space.lg,
  },
  loading: {
    paddingTop: space.lg,
  },
  skeletonTabs: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xxl,
    paddingHorizontal: layout.screenPadding + space.sm,
    paddingBottom: space.lg,
  },
  skeletonTitle: {
    marginHorizontal: layout.screenPadding,
    marginTop: space.sm,
    marginBottom: space.md,
  },
  skeletonRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    height: layout.listRowHeight,
    paddingHorizontal: space.lg,
  },
  skeletonRuled: {
    borderTopWidth: hairline,
    borderTopColor: colors.separator,
  },
  flex: {
    flex: 1,
  },
});
