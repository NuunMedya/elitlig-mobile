/**
 * TAKIM PROFİLİ — `/takim/[id]`
 *
 * NE: bir takımın kamuya açık bütün yüzü. SABİT altı sekme — veri durumuna
 * göre gizlenmez, sırası değişmez; verisi olmayan sekme kendi içinde boş
 * durum gösterir:
 *
 *   Genel · Fikstür · Sonuçlar · Kadro · İstatistik · Transferler
 *
 * EYLEMLER (detay sayfalarında ortak sözleşme):
 *   - PAYLAŞ başlığın SAĞ ÜSTÜNDE tek ikondur ("share-outline" →
 *     `TeamShareSheet`); başka yerde tekrarı yok.
 *   - TAKİP = BİLDİRİM: kimlik şeridindeki "Takip et" `useFollowFlow().toggle`
 *     çağırır — takip edilir ve o takibin bildirim türleri alt sayfası açılır;
 *     zil (`openSettings`) aynı alt sayfayı yeniden açar.
 *
 * DÜZEN (Arena "detay/kimlik" kalıbı): grafit sahne başlığı → kimlik (arma,
 * ad, lig · sezon, skor şeridi, form, takip eylemleri) → sekmeler → kâğıt
 * içerik. Sahne ekranda bir kez, tepede; kaydırınca kimlik kapanır ve ad
 * başlık satırına gelir (ScreenHeader'ın işi).
 *
 * DOSYA DÜZENİ: bu dosya yalnız VERİ ve KABUKTUR (sorgular, türetilmiş veri,
 * eylemler, sekme seçimi). Her sekmenin görünümü `components/teampage/`
 * altındadır; ortak hesaplar `components/teampage/model.ts`te.
 *
 * DERİN BAĞLANTI: `/takim/<id>?tab=<genel|fikstur|sonuclar|kadro|istatistik|
 * transfer>`. Tanınmayan değer sessizce "genel" olur; bildirimden gelen farklı
 * yazımlar (`squad`, `fixtures`, `results`…) takma ad tablosundan çözülür.
 *
 * VERİ MANTIĞI: takım kaydı `/takimlar/:id`, maçlar `/maclar?team_id`,
 * sezonluk sıra/puan/form puan durumundan, oyuncu katkıları oyuncu
 * sıralamasından süzülerek gelir. Ek uçlar: takım takipçi sayısı
 * (`/api/team-followers/:id/count`), şehir oyuncu listesi (mevki bilgisi
 * için) ve maç kadroları (forma no + maç puanı için).
 *
 * PERFORMANS: aynı anda YALNIZ bir segmentin listesi mount edilir. Maç kadrosu
 * sorguları (6 istek) yalnız Kadro segmentinde, haber akışı yalnız Transferler
 * segmentinde açılır. Geri sayım kendi küçük bileşeninde tıklar; saniyede bir
 * bütün ekranı değil yalnız o kutuları yeniler.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { FollowActions } from "@/components/FollowActions";
import {
  EmptyState,
  ErrorState,
  ScreenHeader,
  Skeleton,
  SkeletonCard,
  Tabs,
  useHeaderScroll,
  useRefresh,
  useToast,
  type TabItem,
} from "@/components/ui";
import { H2hSheet, type H2hRival } from "@/components/teampage/H2hSheet";
import { MatchesTab } from "@/components/teampage/MatchesTab";
import {
  buildAnalysis,
  buildRecords,
  lineOf,
  meaningful,
  num,
  splitByState,
  type PosLine,
  type SquadEntry,
} from "@/components/teampage/model";
import { OverviewTab } from "@/components/teampage/OverviewTab";
import { TeamShareSheet } from "@/components/teampage/ShareSheet";
import { SquadTab } from "@/components/teampage/SquadTab";
import { StatsTab } from "@/components/teampage/StatsTab";
import { TeamHero } from "@/components/teampage/TeamHero";
import { TransfersTab } from "@/components/teampage/TransfersTab";
import { useTeamLogos } from "@/hooks/useTeamLogos";
import { getMatchKadro, getTeamMatches } from "@/lib/api/matches";
import { getNewsFeed } from "@/lib/api/news";
import { getPlayerRankings, getPlayersByCity } from "@/lib/api/players";
import { getStandings } from "@/lib/api/standings";
import { getTeam } from "@/lib/api/teams";
import { addMatchToCalendar } from "@/lib/calendar";
import { get } from "@/lib/http";
import { queryKeys } from "@/lib/queryKeys";
import { useFavorite } from "@/providers/FavoriteProvider";
import { useFollowFlow } from "@/providers/FollowFlowProvider";
import { useScope } from "@/providers/ScopeProvider";
import type { ApiMatch, ApiPlayer, KadroPlayer, StandingRow } from "@/lib/types";
import { colors, layout, radius, space } from "@/theme";

/* ══════════════════════════════════════════════════════════════════════════
   Segmentler ve rota parametresi
   ══════════════════════════════════════════════════════════════════════════ */

type TeamTab = "genel" | "fikstur" | "sonuclar" | "kadro" | "istatistik" | "transfer";

const TAB_ITEMS: TabItem<TeamTab>[] = [
  { key: "genel", label: "Genel" },
  { key: "fikstur", label: "Fikstür" },
  { key: "sonuclar", label: "Sonuçlar" },
  { key: "kadro", label: "Kadro" },
  { key: "istatistik", label: "İstatistik" },
  { key: "transfer", label: "Transferler" },
];

const TAB_KEYS: string[] = TAB_ITEMS.map((item) => item.key);

/**
 * Rota anahtarını normalleştirir.
 *
 * TUZAK: `"KADRO".toLocaleLowerCase("tr")` noktasız ı üretir, düz
 * `toLowerCase()` ise "İ" için birleşik nokta bırakır; ikisi de ASCII rota
 * anahtarıyla eşleşmez. Önce I ailesi katlanır, sonra küçültülür.
 */
function normalizeKey(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.trim().replace(/[İIı]/g, "i").toLowerCase();
}

/** Takma adlar: bildirimden/menüden gelen farklı yazımlar da doğru segmente düşer. */
const TAB_ALIASES: Record<string, TeamTab> = {
  overview: "genel",
  ozet: "genel",
  fixtures: "fikstur",
  fikstür: "fikstur",
  maclar: "fikstur",
  results: "sonuclar",
  sonuclar: "sonuclar",
  squad: "kadro",
  kadrolar: "kadro",
  stats: "istatistik",
  istatistikler: "istatistik",
  transfers: "transfer",
  transferler: "transfer",
};

function resolveTab(raw: unknown): TeamTab {
  const key = normalizeKey(raw);
  if (TAB_KEYS.includes(key)) return key as TeamTab;
  return TAB_ALIASES[key] ?? "genel";
}

/** Sorgu parametresi tek değer ya da dizi olarak gelebilir. */
function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/* ══════════════════════════════════════════════════════════════════════════
   Sunucu uçları — bu ekrana özgü, paylaşılan api modüllerinde karşılığı yok
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Takımı kaç kişinin takip ettiği (sunucu sözleşmesi: TAKIM için ayrı uç;
 * `/api/favorites/matches/:id/count` MAÇ takipçisini sayar, karıştırma).
 * Oturum gerektirmez — misafir de sosyal kanıtı görür.
 */
function getTeamFollowerCount(teamId: number) {
  return get<{ teamId?: number; count?: number }>(`/api/team-followers/${teamId}/count`, undefined, {
    retry: false,
  });
}

/* ══════════════════════════════════════════════════════════════════════════
   Ekran
   ══════════════════════════════════════════════════════════════════════════ */

export default function TeamDetailScreen() {
  const { id, tab: tabParam } = useLocalSearchParams<{ id: string; tab?: string }>();
  const teamId = Number(id);
  const validId = Number.isFinite(teamId) && teamId > 0;

  const router = useRouter();
  const scope = useScope();
  const logos = useTeamLogos();
  const toast = useToast();
  const { isFavorite } = useFavorite();
  const flow = useFollowFlow();
  const { scrollY, scrollProps } = useHeaderScroll();

  const [tab, setTab] = useState<TeamTab>(() => resolveTab(firstParam(tabParam)));
  const [shareOpen, setShareOpen] = useState(false);
  const [h2hOpen, setH2hOpen] = useState(false);

  // Rota parametresi sonradan değişirse (bildirim, menü, geri) görünüm ona uyar.
  const routeTab = resolveTab(firstParam(tabParam));
  useEffect(() => {
    setTab(routeTab);
    scrollY.setValue(0);
  }, [routeTab, scrollY]);

  const changeTab = useCallback(
    (next: TeamTab) => {
      setTab(next);
      scrollY.setValue(0); // Yeni listenin tepesindeyiz; başlık yeniden açılsın.
      router.setParams({ tab: next });
    },
    [router, scrollY],
  );

  const scopeKey = useMemo(
    () => ({
      cityId: scope.cityId ?? undefined,
      leagueId: scope.leagueId ?? undefined,
      seasonId: scope.seasonId ?? undefined,
    }),
    [scope.cityId, scope.leagueId, scope.seasonId],
  );

  /* ---------------------------- Sorgular ---------------------------- */

  const teamQuery = useQuery({
    queryKey: queryKeys.team(teamId),
    queryFn: () => getTeam(teamId),
    enabled: validId,
  });

  const matchesQuery = useQuery({
    queryKey: queryKeys.teamMatches(teamId),
    queryFn: () => getTeamMatches(teamId),
    enabled: validId,
    staleTime: 60_000,
  });

  const standingsQuery = useQuery({
    queryKey: queryKeys.standings(scopeKey),
    queryFn: () =>
      getStandings({ cityId: scope.cityId!, leagueId: scope.leagueId!, seasonId: scope.seasonId! }),
    enabled: scope.ready,
  });

  const rankingsQuery = useQuery({
    queryKey: queryKeys.playerRankings(scopeKey, "topScorers"),
    queryFn: () => getPlayerRankings(scopeKey, "topScorers"),
    enabled: scope.ready,
    staleTime: 5 * 60_000,
  });

  const team = teamQuery.data;
  const teamName = team?.team_name ?? "";
  const teamCity = team?.city ?? "";

  /** Mevki bilgisi yalnız oyuncu kayıtlarında var; kadro gruplaması buna dayanır. */
  const rosterQuery = useQuery({
    queryKey: ["players", "by-city", teamCity] as const,
    queryFn: () => getPlayersByCity(teamCity),
    enabled: Boolean(teamCity),
    staleTime: 10 * 60_000,
  });

  const followersQuery = useQuery({
    queryKey: ["favorites", "team-count", teamId] as const,
    queryFn: () => getTeamFollowerCount(teamId),
    enabled: validId,
    staleTime: 5 * 60_000,
  });

  /** Transfer kaydı yalnız haber akışında yayımlanıyor (bkz. TransfersTab). */
  const newsQuery = useQuery({
    queryKey: queryKeys.newsFeed(scopeKey),
    queryFn: () => getNewsFeed(scopeKey),
    enabled: tab === "transfer" && scope.ready,
    staleTime: 5 * 60_000,
  });

  /* --------------------------- Türetilmiş veri --------------------------- */

  const standing = useMemo(() => {
    const rows = standingsQuery.data ?? [];
    const index = rows.findIndex((row) => Number(row.team_id) === teamId);
    return index >= 0 ? { row: rows[index] as StandingRow, position: index + 1 } : null;
  }, [standingsQuery.data, teamId]);

  const { upcoming, awaiting, recent } = useMemo(
    () => splitByState(matchesQuery.data ?? []),
    [matchesQuery.data],
  );

  /** Sezonluk katkılar — sıralama listesinden bu takımın oyuncuları. */
  const rankedPlayers = useMemo(
    () => (rankingsQuery.data?.players ?? []).filter((row) => Number(row.teamId) === teamId),
    [rankingsQuery.data, teamId],
  );

  /** Kadro sorguları yalnız Kadro segmentinde: forma no ve maç puanı buradan. */
  const kadroMatches = useMemo(() => (tab === "kadro" ? recent.slice(0, 6) : []), [tab, recent]);

  const kadroQueries = useQueries({
    queries: kadroMatches.map((match) => ({
      queryKey: [...queryKeys.match(Number(match.id)), "kadro"] as const,
      queryFn: () => getMatchKadro(Number(match.id)),
      staleTime: 60 * 60_000,
    })),
  });

  /** Oyuncu id → { forma no, puan ortalaması } — son maçların kadrolarından. */
  const kadroFacts = useMemo(() => {
    const facts = new Map<number, { jersey: number | null; sum: number; count: number }>();
    const feed = (rows: KadroPlayer[] | undefined) => {
      for (const row of rows ?? []) {
        if (Number(row.takim_id ?? row.team_id) !== teamId) continue;
        const playerId = Number(row.playerId ?? row.oyuncu_id ?? 0);
        if (!playerId || row.isGuest) continue;
        const entry = facts.get(playerId) ?? { jersey: null, sum: 0, count: 0 };
        const jersey = Number(row.number);
        if (entry.jersey == null && Number.isFinite(jersey) && jersey > 0) entry.jersey = jersey;
        const puan = row.puan == null ? NaN : Number(row.puan);
        if (Number.isFinite(puan)) {
          entry.sum += puan;
          entry.count += 1;
        }
        facts.set(playerId, entry);
      }
    };
    for (const query of kadroQueries) {
      feed(query.data?.home);
      feed(query.data?.away);
    }
    return facts;
  }, [kadroQueries, teamId]);

  /**
   * Kadro: mevki (şehir oyuncu listesi) + sezon katkısı (sıralama listesi) +
   * forma no / puan (maç kadroları) birleşimi. Hangi kaynak eksikse o alan boş
   * kalır; UYDURULMAZ.
   */
  const squad = useMemo<SquadEntry[]>(() => {
    const byId = new Map<number, SquadEntry>();

    const roster: ApiPlayer[] = (rosterQuery.data ?? []).filter(
      (player) => Number(player.team_id) === teamId,
    );
    for (const player of roster) {
      const playerId = Number(player.id);
      if (!playerId) continue;
      byId.set(playerId, {
        id: playerId,
        name: String(player.player_name ?? "").trim(),
        image: player.player_img ?? null,
        position: player.player_position ?? null,
        line: lineOf(player.player_position),
        jersey: null,
        // Sayılar SEZON katkısıdır (Kadro sekmesi öyle diyor); sıralama
        // listesinde satırı olmayan oyuncu o sezon forma giymemiştir.
        // Kariyer toplamını buraya yazmak etiketi yalancı yapardı.
        matches: 0,
        goals: 0,
        assists: 0,
        rating: null,
      });
    }

    for (const row of rankedPlayers) {
      const playerId = Number(row.id);
      if (!playerId) continue;
      const existing = byId.get(playerId);
      const merged: SquadEntry = existing ?? {
        id: playerId,
        name: String(row.name ?? "").trim(),
        image: row.image ?? null,
        position: null,
        line: "OTHER",
        jersey: null,
        matches: 0,
        goals: 0,
        assists: 0,
        rating: null,
      };
      // Sezon içi sayımlar kariyer toplamından daha anlamlı: sıralama kazanır.
      merged.matches = num(row.matches);
      merged.goals = num(row.goals);
      merged.assists = num(row.assists);
      if (!merged.image && row.image) merged.image = row.image;
      byId.set(playerId, merged);
    }

    for (const entry of byId.values()) {
      const fact = kadroFacts.get(entry.id);
      if (!fact) continue;
      entry.jersey = fact.jersey;
      entry.rating = fact.count > 0 ? fact.sum / fact.count : null;
    }

    return [...byId.values()].filter((entry) => entry.name.length > 0);
  }, [rosterQuery.data, rankedPlayers, kadroFacts, teamId]);

  /** Genel segmentindeki kadro dağılımı — hat başına oyuncu sayısı. */
  const lineCounts = useMemo(() => {
    const counts: Record<PosLine, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0, OTHER: 0 };
    for (const entry of squad) counts[entry.line] += 1;
    return counts;
  }, [squad]);

  const topScorers = useMemo(
    () =>
      [...rankedPlayers]
        .sort((a, b) => num(b.goals) - num(a.goals) || num(b.assists) - num(a.assists))
        .filter((row) => num(row.goals) > 0)
        .slice(0, 3),
    [rankedPlayers],
  );

  const records = useMemo(() => buildRecords(recent, teamId, teamName), [recent, teamId, teamName]);

  const discipline = useMemo(() => {
    let yellow = 0;
    let red = 0;
    for (const row of rankedPlayers) {
      yellow += num(row.yellow);
      red += num(row.red);
    }
    return { yellow, red, players: rankedPlayers.length };
  }, [rankedPlayers]);

  /** Puan tablosunda takımın çevresi: üstünde 2, altında 2 takım (kenarda
      kalırsa pencere içeri kayar ki satır sayısı hep beş olsun). */
  const neighbourRows = useMemo(() => {
    const rows = standingsQuery.data ?? [];
    if (!standing) return [];
    const index = standing.position - 1;
    const from = Math.max(0, Math.min(index - 2, rows.length - 5));
    return rows.slice(from, from + 5).map((row, offset) => ({ row, rank: from + offset + 1 }));
  }, [standingsQuery.data, standing]);

  const transfers = useMemo(() => {
    const items = newsQuery.data?.items ?? [];
    if (!teamName) return [];
    const needle = teamName.trim().toLocaleLowerCase("tr-TR");
    return items.filter(
      (item) =>
        item.kind === "transfer" &&
        `${item.title} ${item.summary ?? ""}`.toLocaleLowerCase("tr-TR").includes(needle),
    );
  }, [newsQuery.data, teamName]);

  const analysis = useMemo(
    () => (standing ? buildAnalysis(standing.row, teamName, standing.position) : null),
    [standing, teamName],
  );

  /** Tüm zamanlar künyesi — takım kaydının kendi toplamları. */
  const career = useMemo(
    () => ({
      matches: num(team?.total_matches),
      wins: num(team?.team_wins),
      draws: num(team?.team_draws),
      losses: num(team?.team_losses),
      goalsFor: num(team?.goals_scored),
      goalsAgainst: num(team?.goals_conceded),
    }),
    [team],
  );

  /** H2H için rakip listesi — puan tablosundaki diğer takımlar, sırasıyla. */
  const rivals = useMemo<H2hRival[]>(
    () =>
      (standingsQuery.data ?? [])
        .map((row, index) => ({ row, rank: index + 1 }))
        .filter(({ row }) => Number(row.team_id) !== teamId),
    [standingsQuery.data, teamId],
  );

  /* Sıradaki maç: canlı ya da saati gelmemiş ilk maç; yoksa sonucu bekleyen
     en yeni maç (kart onu "sonucu girilmedi" diye işaretler). */
  const nextMatch: ApiMatch | null = upcoming[0] ?? awaiting[awaiting.length - 1] ?? null;
  const favorite = isFavorite(teamId);
  const followerCount = followersQuery.data?.count;

  /* ------------------------------ Eylemler ------------------------------ */

  const handleRefresh = useCallback(async () => {
    await Promise.all([
      teamQuery.refetch(),
      matchesQuery.refetch(),
      standingsQuery.refetch(),
      rankingsQuery.refetch(),
      followersQuery.refetch(),
    ]);
  }, [teamQuery, matchesQuery, standingsQuery, rankingsQuery, followersQuery]);

  const refresh = useRefresh(handleRefresh, {
    refreshing:
      matchesQuery.isRefetching || standingsQuery.isRefetching || rankingsQuery.isRefetching,
  });

  /*
   * SAVUNMA: `team_name` şemada zorunlu ama sunucu kısmi bir kayıt
   * döndürdüğünde ekran adsız kalıyordu. Ad tek yerde güvenli hâle getirilir.
   */
  const teamLabel = team?.team_name || "İsimsiz takım";

  /** Takip hedefi — TAKİP = BİLDİRİM akışına (useFollowFlow) giden tek kimlik. */
  const followTarget = useMemo(
    () => ({ type: "team" as const, id: teamId, name: teamLabel, logo: team?.logo ?? null }),
    [teamId, teamLabel, team?.logo],
  );

  /* Takip et → takip edilir ve o takibin bildirim türleri alt sayfası açılır;
     takip ediliyorsa bırakılır (bildirim akışın kendisinde). */
  const handleToggleFavorite = useCallback(() => {
    if (!team) return;
    flow.toggle(followTarget);
  }, [team, flow, followTarget]);

  const openMatch = useCallback((matchId: number) => router.push(`/mac/${matchId}`), [router]);
  const openPlayer = useCallback((playerId: number) => router.push(`/oyuncu/${playerId}`), [router]);
  const openTeam = useCallback((otherId: number) => router.push(`/takim/${otherId}`), [router]);
  /*
   * Transfer kayıtları haber AKIŞINDA yayımlanır ama tekil haber ucunda
   * karşılıkları yoktur (`/api/news/transfer-…` → 404). Kayıt `meta` içinde
   * oyuncu kimliği taşıyorsa (savunmacı okunur) oyuncu sayfası açılır;
   * yoksa haber detayı denenir.
   */
  const openNews = useCallback(
    (newsId: string) => {
      const item = transfers.find((entry) => entry.id === newsId) as
        | { meta?: { player_id?: number | string | null } }
        | undefined;
      const playerId = Number(item?.meta?.player_id);
      if (Number.isFinite(playerId) && playerId > 0) {
        router.push(`/oyuncu/${playerId}`);
        return;
      }
      router.push({ pathname: "/haber/[id]", params: { id: newsId } });
    },
    [router, transfers],
  );
  const openStandings = useCallback(
    () => router.push({ pathname: "/(tabs)/ligler", params: { tab: "puan" } }),
    [router],
  );
  /** Zil: bu takibin bildirim türleri (misafirde alt sayfa giriş çağrısı gösterir). */
  const openNotifications = useCallback(() => flow.openSettings(followTarget), [flow, followTarget]);

  const addToCalendar = useCallback(
    async (match: ApiMatch) => {
      try {
        await addMatchToCalendar(match);
        toast.show({ message: "Maç takvime eklendi", tone: "success", icon: "calendar" });
      } catch {
        toast.show({ message: "Takvime eklenemedi", tone: "danger" });
      }
    },
    [toast],
  );

  const openShare = useCallback(() => setShareOpen(true), []);
  const closeShare = useCallback(() => setShareOpen(false), []);
  const openH2h = useCallback(() => setH2hOpen(true), []);
  const closeH2h = useCallback(() => setH2hOpen(false), []);
  const shareError = useCallback(
    () => toast.show({ message: "Görsel oluşturulamadı", tone: "danger" }),
    [toast],
  );

  /* Sekme kısayolları — `changeTab`tan geçer ki rota parametresi ve kaydırma
     sıfırlaması derin bağlantıyla birebir aynı yolu izlesin. */
  const openFixtures = useCallback(() => changeTab("fikstur"), [changeTab]);
  const openResults = useCallback(() => changeTab("sonuclar"), [changeTab]);
  const openSquad = useCallback(() => changeTab("kadro"), [changeTab]);

  /** Rakip seçilince karşılaştırma sayfasına aynı parametrelerle gidilir. */
  const pickRival = useCallback(
    (rivalId: number, rivalName: string) => {
      setH2hOpen(false);
      router.push({
        pathname: "/h2h",
        params: {
          homeId: String(teamId),
          homeName: teamName,
          awayId: String(rivalId),
          awayName: rivalName,
        },
      });
    },
    [router, teamId, teamName],
  );

  /*
   * BAŞLIK EYLEMİ: yalnız paylaş. Takip yıldızı eskiden burada da vardı;
   * kimlik şeridindeki "Takip et" düğmesiyle aynı işi yapan ikinci bir
   * denetim, hangisinin "asıl" olduğunu sorduruyordu. Takip tek yerde,
   * metinli düğmede; başlık satırı sayfadan çıkan eylemleri (paylaş) taşır.
   */
  const headerActions = useMemo(
    () => [
      {
        icon: "share-outline" as keyof typeof Ionicons.glyphMap,
        onPress: openShare,
        accessibilityLabel: "Takım kartını paylaş",
      },
    ],
    [openShare],
  );

  /* ------------------------------ Kabuk ------------------------------ */

  /*
   * KİMLİK BLOĞUN İÇİNDE: `ScreenHeader`ın `hero` yuvasına gider; başlık
   * satırının altında, sekmelerin üstünde, aynı sahne yüzeyinde durur.
   *
   * KADRO sayısı Kadro sekmesinin gösterdiği listeden gelir (şehir oyuncu
   * kaydı + sezon sıralaması); liste henüz yoksa hücre çizilmez, sayı
   * UYDURULMAZ.
   */
  const hero = useMemo(
    () =>
      team ? (
        <TeamHero
          teamName={teamLabel}
          logo={team.logo ?? null}
          city={team.city ?? null}
          league={meaningful(team.current_league)}
          season={meaningful(team.current_season)}
          /* Sıfır takipçi sosyal kanıt değil, eksikliktir; yazılmaz. */
          followers={followerCount ? followerCount : null}
          rank={standing?.position ?? null}
          points={standing ? standing.row.display_points : null}
          goalDiff={standing ? num(standing.row.goal_diff) : null}
          squadCount={squad.length > 0 ? squad.length : null}
          form={standing?.row.last5 ?? ""}
          record={
            standing
              ? {
                  played: num(standing.row.played),
                  wins: num(standing.row.wins),
                  draws: num(standing.row.draws),
                  losses: num(standing.row.losses),
                }
              : null
          }
          actions={
            <FollowActions
              following={favorite}
              onToggleFollow={handleToggleFavorite}
              onOpenNotifications={openNotifications}
              extra={rivals.length > 0 ? [{ icon: "git-compare-outline", label: "Karşılaştır", onPress: openH2h }] : []}
            />
          }
        />
      ) : null,
    [team, teamLabel, followerCount, standing, squad.length, favorite, handleToggleFavorite, openNotifications, rivals.length, openH2h],
  );

  if (!validId) {
    return (
      <SafeAreaView style={styles.screen} edges={["top"]}>
        <ScreenHeader title="Takım" back />
        <EmptyState
          icon="alert-circle-outline"
          title="Takım bulunamadı"
          body="Bağlantıdaki takım numarası geçersiz."
        />
      </SafeAreaView>
    );
  }

  if (teamQuery.isLoading) {
    return (
      <SafeAreaView style={styles.screen} edges={["top"]}>
        {/* İskelet, gelecek düzenin şeklini taklit eder: sahne + kimlik
            yeri, ardından kâğıtta kartlar. Yükleme bitince sayfa zıplamaz. */}
        <ScreenHeader title="" back variant="stage" hero={<HeroSkeleton />} />
        <View style={styles.loadingBody}>
          <SkeletonCard lines={4} style={styles.inset} />
          <SkeletonCard lines={2} style={styles.inset} />
        </View>
      </SafeAreaView>
    );
  }

  if (teamQuery.isError || !team) {
    return (
      <SafeAreaView style={styles.screen} edges={["top"]}>
        <ScreenHeader title="Takım" back />
        <ErrorState error={teamQuery.error} onRetry={teamQuery.refetch} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader
        title={teamLabel}
        back
        scrollY={scrollY}
        actions={headerActions}
        hero={hero}
        tabs={<Tabs items={TAB_ITEMS} value={tab} onChange={changeTab} sticky />}
      />

      {tab === "genel" ? (
        <OverviewTab
          scrollProps={scrollProps}
          refreshControl={refresh.control}
          teamId={teamId}
          teamName={teamLabel}
          nextMatch={nextMatch}
          nextIsUpcoming={upcoming.length > 0}
          matchesLoading={matchesQuery.isLoading}
          recent={recent}
          lineCounts={lineCounts}
          squadTotal={squad.length}
          squadLoading={rosterQuery.isLoading && squad.length === 0}
          neighbours={neighbourRows}
          tableSize={standingsQuery.data?.length ?? 0}
          scopeReady={scope.ready}
          /* Kapsam henüz çözülürken "Kapsam seçilmedi" demek yanlış olur: iskelet. */
          standingsLoading={scope.loading || standingsQuery.isLoading}
          standing={standing}
          leagueLabel={scope.leagueLabel}
          topScorers={topScorers}
          analysis={analysis}
          logoFor={logos.logoFor}
          onOpenMatch={openMatch}
          onOpenPlayer={openPlayer}
          onOpenTeam={openTeam}
          onAddCalendar={addToCalendar}
          onPickScope={scope.openScopeSheet}
          onOpenStandings={openStandings}
          onOpenFixtures={openFixtures}
          onOpenResults={openResults}
          onOpenSquad={openSquad}
        />
      ) : tab === "fikstur" ? (
        <MatchesTab
          mode="fixtures"
          scrollProps={scrollProps}
          refreshControl={refresh.control}
          matches={upcoming}
          awaiting={awaiting}
          loading={matchesQuery.isLoading}
          logoFor={logos.logoFor}
          onOpenMatch={openMatch}
          onAddCalendar={addToCalendar}
          teamId={teamId}
          teamName={teamLabel}
        />
      ) : tab === "sonuclar" ? (
        <MatchesTab
          mode="results"
          scrollProps={scrollProps}
          refreshControl={refresh.control}
          matches={recent}
          loading={matchesQuery.isLoading}
          logoFor={logos.logoFor}
          onOpenMatch={openMatch}
          onAddCalendar={addToCalendar}
          teamId={teamId}
          teamName={teamLabel}
        />
      ) : tab === "kadro" ? (
        <SquadTab
          scrollProps={scrollProps}
          refreshControl={refresh.control}
          squad={squad}
          loading={(rosterQuery.isLoading || rankingsQuery.isLoading) && squad.length === 0}
          seasonLabel={scope.seasonLabel}
          onOpenPlayer={openPlayer}
        />
      ) : tab === "istatistik" ? (
        <StatsTab
          scrollProps={scrollProps}
          refreshControl={refresh.control}
          records={records}
          career={career}
          discipline={discipline}
          seasonLabel={scope.seasonLabel}
          loading={matchesQuery.isLoading}
          onOpenMatch={openMatch}
        />
      ) : (
        <TransfersTab
          scrollProps={scrollProps}
          refreshControl={refresh.control}
          items={transfers}
          loading={newsQuery.isLoading}
          error={newsQuery.isError ? newsQuery.error : null}
          onRetry={newsQuery.refetch}
          onOpenNews={openNews}
        />
      )}

      <H2hSheet visible={h2hOpen} onClose={closeH2h} teamName={teamLabel} rivals={rivals} onPick={pickRival} />

      <TeamShareSheet
        visible={shareOpen}
        onClose={closeShare}
        teamName={teamLabel}
        logo={team.logo ?? null}
        context={[meaningful(team.current_league), meaningful(team.current_season)]
          .filter(Boolean)
          .join(" · ")
          .toLocaleUpperCase("tr-TR")}
        rank={standing?.position ?? null}
        row={standing?.row ?? null}
        onError={shareError}
      />
    </SafeAreaView>
  );
}

/**
 * Kimlik iskeleti — sahnenin üstünde. `Skeleton` kâğıt tonunda çizer; sahnede
 * parlak bir leke olmasın diye opaklığı düşürülür.
 */
function HeroSkeleton() {
  return (
    <View style={styles.heroSkeleton}>
      <View style={styles.heroSkeletonTop}>
        <Skeleton width={64} height={64} radius="lg" />
        <View style={styles.heroSkeletonText}>
          <Skeleton width="40%" height={10} />
          <Skeleton width="75%" height={20} />
          <Skeleton width="50%" height={10} />
        </View>
      </View>
      <Skeleton height={56} radius="lg" />
      <Skeleton height={40} radius="pill" />
    </View>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Stiller
   ══════════════════════════════════════════════════════════════════════════ */

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  inset: {
    marginHorizontal: layout.screenPadding,
  },
  loadingBody: {
    paddingTop: space.xl,
    gap: space.lg,
  },
  heroSkeleton: {
    paddingHorizontal: layout.screenPadding,
    paddingBottom: space.md,
    gap: space.md,
    opacity: 0.12,
  },
  heroSkeletonTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
  },
  heroSkeletonText: {
    flex: 1,
    gap: space.sm,
    borderRadius: radius.md,
  },
});
