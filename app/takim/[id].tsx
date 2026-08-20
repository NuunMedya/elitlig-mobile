/**
 * TAKIM PROFİLİ — `/takim/[id]`
 *
 * NE: bir takımın kamuya açık bütün yüzü. Eskiden üç sekmeydi (Sonuçlar,
 * Fikstür, Kadro); şartname §5.1 gereği ALTI segmente açıldı:
 *
 *   Genel · Fikstür · Sonuçlar · Kadro · İstatistik · Transferler
 *
 * DERİN BAĞLANTI: `/takim/<id>?tab=<genel|fikstur|sonuclar|kadro|istatistik|
 * transfer>`. Tanınmayan değer sessizce "genel" olur; bildirimden gelen farklı
 * yazımlar (`squad`, `fixtures`, `results`…) takma ad tablosundan çözülür.
 *
 * VERİ MANTIĞI KORUNDU: takım kaydı `/takimlar/:id`, maçlar `/maclar?team_id`,
 * sezonluk sıra/puan/form puan durumundan, oyuncu katkıları oyuncu
 * sıralamasından süzülerek gelir — tıpkı önceki sürümdeki gibi. ÜSTÜNE eklenen
 * uçlar: takım takipçi sayısı (`/api/team-followers/:id/count`), şehir oyuncu
 * listesi (mevki bilgisi için) ve maç kadroları (forma no + maç puanı için).
 *
 * PERFORMANS: aynı anda YALNIZ bir segmentin listesi mount edilir. Maç kadrosu
 * sorguları (6 istek) yalnız Kadro segmentinde, haber akışı yalnız Transferler
 * segmentinde açılır. Geri sayım kendi küçük bileşeninde tıklar; saniyede bir
 * bütün ekranı değil yalnız o satırı yeniler.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useQueries, useQuery } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Sharing from "expo-sharing";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type RefreshControlProps,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import ViewShot, { captureRef } from "react-native-view-shot";
import {
  Avatar,
  Badge,
  BottomSheet,
  Button,
  Card,
  EmptyState,
  ErrorState,
  FormChips,
  KeyValueRow,
  ListRow,
  MatchRow,
  ProgressRing,
  RatingPill,
  ScreenHeader,
  SectionHeader,
  SegmentedControl,
  SkeletonCard,
  SkeletonHero,
  SkeletonListRow,
  SkeletonMatchRow,
  StatBar,
  Tabs,
  TeamLogo,
  Touchable,
  useHeaderScroll,
  useRefresh,
  useToast,
  type SegmentedItem,
  type TabItem,
} from "@/components/ui";
import { useTeamLogos } from "@/hooks/useTeamLogos";
import { getMatchKadro, getTeamMatches } from "@/lib/api/matches";
import { getNewsFeed } from "@/lib/api/news";
import { getPlayerRankings, getPlayersByCity } from "@/lib/api/players";
import { getStandings } from "@/lib/api/standings";
import { POSITIONS } from "@/lib/api/team";
import { getTeam } from "@/lib/api/teams";
import { addMatchToCalendar } from "@/lib/calendar";
import { formatDateShort, formatTime, timeAgo } from "@/lib/format";
import { get } from "@/lib/http";
import { matchState } from "@/lib/match";
import { queryKeys } from "@/lib/queryKeys";
import { useFavorite } from "@/providers/FavoriteProvider";
import { useScope } from "@/providers/ScopeProvider";
import type { ApiMatch, ApiPlayer, KadroPlayer, NewsItem, PlayerRankRow, StandingRow } from "@/lib/types";
import { colors, layout, radius, space, textScale, type, upperTR } from "@/theme";

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
   Mevki sözlüğü — kadro gruplaması
   ══════════════════════════════════════════════════════════════════════════ */

type PosLine = "GK" | "DEF" | "MID" | "FWD" | "OTHER";

const LINE_ORDER: PosLine[] = ["GK", "DEF", "MID", "FWD", "OTHER"];

const LINE_LABEL: Record<PosLine, string> = {
  GK: "Kaleci",
  DEF: "Defans",
  MID: "Orta saha",
  FWD: "Forvet",
  OTHER: "Diğer",
};

/** Sunucudaki kısaltma sözlüğü (KL, STP, MOS…) → hat. */
const LINE_BY_CODE = new Map<string, PosLine>(POSITIONS.map((item) => [item.code, item.line as PosLine]));

/**
 * Mevki alanını hatta çevirir.
 *
 * NEDEN İKİ YOL: `PlayerTeams.team_position` kısaltma saklar (KL/STP/MOS),
 * `Players.player_position` ise serbest Türkçe metindir ("Kaleci", "Sol Bek").
 * Uç hangisini döndürürse döndürsün aynı gruba düşmeli.
 */
function lineOf(position?: string | null): PosLine {
  const raw = String(position ?? "").trim();
  if (!raw) return "OTHER";

  const code = LINE_BY_CODE.get(raw.toLocaleUpperCase("tr-TR"));
  if (code) return code;

  const text = raw.toLocaleLowerCase("tr-TR");
  if (text.includes("kaleci") || text.includes("kale")) return "GK";
  if (
    text.includes("defans") ||
    text.includes("stoper") ||
    text.includes("bek") ||
    text.includes("libero")
  ) {
    return "DEF";
  }
  if (
    text.includes("orta saha") ||
    text.includes("ortasaha") ||
    text.includes("kanat") ||
    text.includes("ofansif") ||
    text.includes("defansif")
  ) {
    return "MID";
  }
  if (text.includes("forvet") || text.includes("santr") || text.includes("golcü")) return "FWD";
  return "OTHER";
}

/* ══════════════════════════════════════════════════════════════════════════
   Maç yardımcıları
   ══════════════════════════════════════════════════════════════════════════ */

/** Maçın başlangıç anı (ms). Saat boşsa gün başı sayılır. */
function matchTime(match: ApiMatch): number {
  return new Date(`${String(match.date).slice(0, 10)}T${match.time || "00:00:00"}`).getTime();
}

interface SplitMatches {
  /** Canlı + zamanlanmış — canlı olan en başta (zamanı geçmiştir). */
  upcoming: ApiMatch[];
  /** Bitmiş maçlar, yeniden eskiye. */
  recent: ApiMatch[];
}

function splitByState(matches: ApiMatch[]): SplitMatches {
  const upcoming: ApiMatch[] = [];
  const recent: ApiMatch[] = [];
  for (const match of matches) {
    const state = matchState(match);
    if (state === "finished") recent.push(match);
    else upcoming.push(match); // zamanlanmış VE canlı
  }
  upcoming.sort((a, b) => matchTime(a) - matchTime(b));
  recent.sort((a, b) => matchTime(b) - matchTime(a));
  return { upcoming, recent };
}

interface Perspective {
  home: boolean;
  ours: number | null;
  theirs: number | null;
  opponentName: string;
  opponentId: number | null;
  result: "W" | "D" | "L" | null;
}

/** Maçı bu takımın gözünden okur: rakip, skorlar, sonuç. */
function perspective(match: ApiMatch, teamId: number, teamName: string): Perspective {
  const home = Number(match.home_team_id) === teamId || match.first_team_name === teamName;
  const ours = home ? match.first_team_score : match.second_team_score;
  const theirs = home ? match.second_team_score : match.first_team_score;
  return {
    home,
    ours: ours == null ? null : Number(ours),
    theirs: theirs == null ? null : Number(theirs),
    opponentName: String((home ? match.second_team_name : match.first_team_name) ?? ""),
    opponentId: (home ? match.away_team_id : match.home_team_id) ?? null,
    result:
      ours == null || theirs == null ? null : ours > theirs ? "W" : ours < theirs ? "L" : "D",
  };
}

/** Dizeden gelen toplamları sayıya çevirir (MySQL sürücüsü metin döndürür). */
const num = (value: number | string | null | undefined): number => Number(value ?? 0) || 0;

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
  const { isFavorite, toggleFavorite } = useFavorite();
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

  const { upcoming, recent } = useMemo(
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
        // Sayılar SEZON katkısıdır (bölüm başlığı öyle diyor); sıralama
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

  const squadSections = useMemo(() => {
    const groups = new Map<PosLine, SquadEntry[]>();
    for (const entry of squad) {
      const list = groups.get(entry.line) ?? [];
      list.push(entry);
      groups.set(entry.line, list);
    }
    return LINE_ORDER.filter((line) => (groups.get(line)?.length ?? 0) > 0).map((line) => ({
      key: line,
      title: LINE_LABEL[line],
      data: (groups.get(line) ?? []).sort(
        (a, b) =>
          (a.jersey ?? 999) - (b.jersey ?? 999) || a.name.localeCompare(b.name, "tr-TR"),
      ),
    }));
  }, [squad]);

  /** Genel segmentindeki "kadro özeti" — hat başına oyuncu sayısı. */
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

  /** Puan tablosunda takımın çevresi: üstünde 2, altında 2 takım. */
  const neighbourRows = useMemo(() => {
    const rows = standingsQuery.data ?? [];
    if (!standing) return [];
    const index = standing.position - 1;
    const from = Math.max(0, index - 2);
    return rows.slice(from, index + 3).map((row, offset) => ({ row, rank: from + offset + 1 }));
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

  /** H2H için rakip listesi — puan tablosundaki diğer takımlar. */
  const rivals = useMemo(
    () => (standingsQuery.data ?? []).filter((row) => Number(row.team_id) !== teamId),
    [standingsQuery.data, teamId],
  );

  const nextMatch = upcoming[0] ?? null;
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

  const handleToggleFavorite = useCallback(() => {
    if (!team) return;
    const next = !favorite;
    toggleFavorite({ id: teamId, name: team.team_name, logo: team.logo });
    toast.show(
      next
        ? {
            message: `${team.team_name} favorilerinde · Maç bildirimleri gelecek`,
            tone: "success",
            icon: "star",
            haptic: "success",
          }
        : { message: `${team.team_name} favorilerden çıkarıldı`, tone: "neutral", icon: "star-outline" },
    );
  }, [team, favorite, teamId, toggleFavorite, toast]);

  const openMatch = useCallback((matchId: number) => router.push(`/mac/${matchId}`), [router]);
  const openPlayer = useCallback((playerId: number) => router.push(`/oyuncu/${playerId}`), [router]);
  const openTeam = useCallback((otherId: number) => router.push(`/takim/${otherId}`), [router]);
  const openNews = useCallback(
    (newsId: string) => router.push({ pathname: "/haber/[id]", params: { id: newsId } }),
    [router],
  );

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

  /** Rakip seçilince eski ekrandaki karşılaştırma sayfasına aynı parametrelerle gidilir. */
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

  const headerActions = useMemo(
    () => [
      {
        icon: "share-social-outline" as keyof typeof Ionicons.glyphMap,
        onPress: openShare,
        accessibilityLabel: "Takım kartını paylaş",
      },
    ],
    [openShare],
  );

  /* ------------------------------ Kabuk ------------------------------ */

  const hero = useMemo(
    () =>
      team ? (
        <TeamHero
          teamName={team.team_name}
          logo={team.logo ?? null}
          city={team.city ?? null}
          league={team.current_league ?? null}
          rank={standing?.position ?? null}
          points={standing ? standing.row.display_points : null}
          form={standing?.row.last5 ?? ""}
          followers={followerCount ?? null}
          favorite={favorite}
          onToggleFavorite={handleToggleFavorite}
          onShare={openShare}
        />
      ) : null,
    [team, standing, followerCount, favorite, handleToggleFavorite, openShare],
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
        <ScreenHeader title="Takım" back />
        <SkeletonHero />
        <SkeletonMatchRow count={4} />
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
        title={team.team_name}
        subtitle={team.current_league ?? team.city ?? undefined}
        back
        scrollY={scrollY}
        actions={headerActions}
        bottom={<Tabs items={TAB_ITEMS} value={tab} onChange={changeTab} sticky />}
      />

      {tab === "genel" ? (
        <GeneralTab
          scrollProps={scrollProps}
          refreshControl={refresh.control}
          header={hero}
          teamId={teamId}
          teamName={team.team_name}
          nextMatch={nextMatch}
          recent={recent}
          lineCounts={lineCounts}
          squadLoading={rosterQuery.isLoading && squad.length === 0}
          neighbours={neighbourRows}
          scopeReady={scope.ready}
          hasStanding={Boolean(standing)}
          leagueLabel={scope.leagueLabel}
          topScorers={topScorers}
          analysis={analysis}
          canCompare={rivals.length > 0}
          logoFor={logos.logoFor}
          onOpenMatch={openMatch}
          onOpenPlayer={openPlayer}
          onOpenTeam={openTeam}
          onAddCalendar={addToCalendar}
          onPickScope={scope.openScopeSheet}
          onCompare={openH2h}
        />
      ) : tab === "fikstur" ? (
        <MatchesTab
          mode="fixtures"
          scrollProps={scrollProps}
          refreshControl={refresh.control}
          header={hero}
          matches={upcoming}
          loading={matchesQuery.isLoading}
          logoFor={logos.logoFor}
          onOpenMatch={openMatch}
          onAddCalendar={addToCalendar}
        />
      ) : tab === "sonuclar" ? (
        <MatchesTab
          mode="results"
          scrollProps={scrollProps}
          refreshControl={refresh.control}
          header={hero}
          matches={recent}
          loading={matchesQuery.isLoading}
          logoFor={logos.logoFor}
          onOpenMatch={openMatch}
          onAddCalendar={addToCalendar}
        />
      ) : tab === "kadro" ? (
        <SquadTab
          scrollProps={scrollProps}
          refreshControl={refresh.control}
          header={hero}
          sections={squadSections}
          loading={(rosterQuery.isLoading || rankingsQuery.isLoading) && squad.length === 0}
          seasonLabel={scope.seasonLabel}
          onOpenPlayer={openPlayer}
        />
      ) : tab === "istatistik" ? (
        <StatsTab
          scrollProps={scrollProps}
          refreshControl={refresh.control}
          header={hero}
          records={records}
          career={career}
          discipline={discipline}
          loading={matchesQuery.isLoading}
        />
      ) : (
        <TransfersTab
          scrollProps={scrollProps}
          refreshControl={refresh.control}
          header={hero}
          items={transfers}
          loading={newsQuery.isLoading}
          error={newsQuery.isError ? newsQuery.error : null}
          onRetry={newsQuery.refetch}
          onOpenNews={openNews}
        />
      )}

      <H2hSheet visible={h2hOpen} onClose={closeH2h} rivals={rivals} onPick={pickRival} />

      <TeamShareSheet
        visible={shareOpen}
        onClose={closeShare}
        teamName={team.team_name}
        logo={team.logo ?? null}
        rank={standing?.position ?? null}
        row={standing?.row ?? null}
        onError={() => toast.show({ message: "Görsel oluşturulamadı", tone: "danger" })}
      />
    </SafeAreaView>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Ortak tipler
   ══════════════════════════════════════════════════════════════════════════ */

interface SquadEntry {
  id: number;
  name: string;
  image: string | null;
  position: string | null;
  line: PosLine;
  jersey: number | null;
  matches: number;
  goals: number;
  assists: number;
  /** Son maçların kadro puanı ortalaması; puan girilmemişse null. */
  rating: number | null;
}

interface ScrollChrome {
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  scrollEventThrottle: number;
}

interface TabShell {
  scrollProps: ScrollChrome;
  /** `useRefresh().control` — RefreshControl düğümü; tipi açık yazılmalı,
      aksi hâlde `ReactElement<unknown>` FlatList'in beklediğine oturmaz. */
  refreshControl: React.ReactElement<RefreshControlProps>;
  header: React.ReactNode;
}

type LogoFor = (teamId?: number | null, teamName?: string | null) => string | null;

/* ══════════════════════════════════════════════════════════════════════════
   HERO — kimlik, sezon özeti, takipçi, favori
   ══════════════════════════════════════════════════════════════════════════ */

const TeamHero = React.memo(function TeamHero({
  teamName,
  logo,
  city,
  league,
  rank,
  points,
  form,
  followers,
  favorite,
  onToggleFavorite,
  onShare,
}: {
  teamName: string;
  logo: string | null;
  city: string | null;
  league: string | null;
  rank: number | null;
  points: number | null;
  form: string;
  followers: number | null;
  favorite: boolean;
  onToggleFavorite: () => void;
  onShare: () => void;
}) {
  const place = [city, league].filter(Boolean).join(" · ");

  return (
    <View style={styles.hero}>
      <View style={styles.heroTop}>
        <TeamLogo name={teamName} logo={logo} size={layout.crestXl} />
        <View style={styles.heroIdentity}>
          <Text style={styles.heroName} numberOfLines={2} {...textScale.dense}>
            {teamName}
          </Text>
          {place ? (
            <Text style={styles.heroPlace} numberOfLines={1} {...textScale.dense}>
              {place}
            </Text>
          ) : null}
          <View style={styles.heroBadges}>
            {rank != null ? <Badge label={`${rank}. sıra`} tone="brand" size="sm" /> : null}
            {points != null ? <Badge label={`${points} puan`} tone="neutral" size="sm" /> : null}
            {followers != null ? (
              <Text style={styles.heroFollowers} {...textScale.dense}>
                {followers} takipçi
              </Text>
            ) : null}
          </View>
        </View>
      </View>

      {form ? (
        <View style={styles.heroForm}>
          <Text style={styles.heroFormLabel} {...textScale.badge}>
            SON 5
          </Text>
          <FormChips form={form} size="sm" />
        </View>
      ) : null}

      <View style={styles.heroActions}>
        <Button
          label={favorite ? "Favorilerde" : "Favoriye ekle"}
          icon={favorite ? "star" : "star-outline"}
          variant={favorite ? "secondary" : "primary"}
          onPress={onToggleFavorite}
          style={styles.heroPrimary}
          accessibilityLabel={favorite ? "Takımı favorilerden çıkar" : "Takımı favoriye al"}
          accessibilityHint={
            favorite ? undefined : "Bu takımın maç bildirimleri telefonuna gelir"
          }
        />
        <Button
          label="Paylaş"
          icon="share-social-outline"
          variant="ghost"
          onPress={onShare}
          accessibilityLabel="Takım kartını paylaş"
        />
      </View>
    </View>
  );
});

/* ══════════════════════════════════════════════════════════════════════════
   GERİ SAYIM — yalnız kendi satırını yeniler
   ══════════════════════════════════════════════════════════════════════════ */

const pad = (value: number) => String(value).padStart(2, "0");

const Countdown = React.memo(function Countdown({ targetMs }: { targetMs: number }) {
  const [now, setNow] = useState(() => Date.now());
  // Bir saatten uzaksa dakikada bir, yakınsa saniyede bir tıklar; uzak maçta
  // saniyelik render israfı olmasın diye eşik geçildiğinde etki yeniden kurulur.
  const fine = targetMs - now < 3_600_000;

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), fine ? 1000 : 60_000);
    return () => clearInterval(timer);
  }, [fine, targetMs]);

  const diff = targetMs - now;
  if (diff <= 0) {
    return (
      <Text style={styles.countdownValue} {...textScale.dense}>
        Başlamak üzere
      </Text>
    );
  }

  const total = Math.floor(diff / 1000);
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;

  const label =
    days > 0
      ? `${days} gün ${hours} saat`
      : hours > 0
        ? `${hours} sa ${pad(minutes)} dk`
        : `${pad(minutes)}:${pad(seconds)}`;

  return (
    <Text style={styles.countdownValue} {...textScale.dense}>
      {label}
    </Text>
  );
});

/* ══════════════════════════════════════════════════════════════════════════
   1) GENEL
   ══════════════════════════════════════════════════════════════════════════ */

interface GeneralTabProps extends TabShell {
  teamId: number;
  teamName: string;
  nextMatch: ApiMatch | null;
  recent: ApiMatch[];
  lineCounts: Record<PosLine, number>;
  squadLoading: boolean;
  neighbours: { row: StandingRow; rank: number }[];
  scopeReady: boolean;
  hasStanding: boolean;
  leagueLabel: string;
  topScorers: PlayerRankRow[];
  /** Otomatik Türkçe sezon yorumu; kapsam tutmuyorsa null. */
  analysis: string | null;
  canCompare: boolean;
  logoFor: LogoFor;
  onOpenMatch: (matchId: number) => void;
  onOpenPlayer: (playerId: number) => void;
  onOpenTeam: (teamId: number) => void;
  onAddCalendar: (match: ApiMatch) => void;
  onPickScope: () => void;
  onCompare: () => void;
}

function GeneralTab({
  scrollProps,
  refreshControl,
  header,
  teamId,
  teamName,
  nextMatch,
  recent,
  lineCounts,
  squadLoading,
  neighbours,
  scopeReady,
  hasStanding,
  leagueLabel,
  topScorers,
  analysis,
  canCompare,
  logoFor,
  onOpenMatch,
  onOpenPlayer,
  onOpenTeam,
  onAddCalendar,
  onPickScope,
  onCompare,
}: GeneralTabProps) {
  const lastFive = useMemo(() => recent.slice(0, 5), [recent]);

  return (
    <ScrollView
      {...scrollProps}
      refreshControl={refreshControl}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {header}

      {/* Sezon yorumu — puan tablosundaki satırdan otomatik üretilir */}
      {analysis ? (
        <>
          <SectionHeader title="Takım analizi" />
          <Card padding="md">
            <Text style={styles.analysisText} {...textScale.long}>
              {analysis}
            </Text>
          </Card>
        </>
      ) : null}

      {/* Sıradaki maç — geri sayımlı */}
      <SectionHeader title="Sıradaki maç" />
      {nextMatch ? (
        <NextMatchCard
          match={nextMatch}
          teamId={teamId}
          teamName={teamName}
          logoFor={logoFor}
          onOpen={onOpenMatch}
          onAddCalendar={onAddCalendar}
        />
      ) : (
        <EmptyState
          icon="calendar-outline"
          title="Yaklaşan maç yok"
          body="Fikstüre maç eklendiğinde burada geri sayımıyla görünecek."
          variant="inline"
          compact
        />
      )}

      {/* Son 5 maç */}
      <SectionHeader title="Son 5 maç" meta={recent.length ? `${recent.length} maç` : undefined} />
      {lastFive.length ? (
        <View style={styles.group}>
          {lastFive.map((match, index) => (
            <TeamMatchRow
              key={match.id}
              match={match}
              homeLogo={logoFor(match.home_team_id, match.first_team_name)}
              awayLogo={logoFor(match.away_team_id, match.second_team_name)}
              position={groupPosition(index, lastFive.length)}
              myTeamId={teamId}
              myTeamName={teamName}
              onOpen={onOpenMatch}
            />
          ))}
        </View>
      ) : (
        <EmptyState
          icon="football-outline"
          title="Oynanmış maç yok"
          body="Bu takımın tamamlanmış maçı bulunmuyor."
          variant="inline"
          compact
        />
      )}

      {/* Kadro özeti */}
      <SectionHeader title="Kadro özeti" />
      {squadLoading ? (
        <SkeletonCard lines={2} />
      ) : (
        <Card padding="md">
          <View style={styles.lineRow}>
            {LINE_ORDER.filter((line) => line !== "OTHER" || lineCounts.OTHER > 0).map((line) => (
              <View key={line} style={styles.lineCell}>
                <Text style={styles.lineValue} {...textScale.dense}>
                  {lineCounts[line]}
                </Text>
                <Text style={styles.lineLabel} numberOfLines={1} {...textScale.badge}>
                  {upperTR(LINE_LABEL[line])}
                </Text>
              </View>
            ))}
          </View>
        </Card>
      )}

      {/* Puan durumundaki konum */}
      <SectionHeader title="Puan durumundaki yeri" meta={leagueLabel || undefined} />
      {!scopeReady ? (
        <EmptyState
          icon="options-outline"
          title="Kapsam seçilmedi"
          body="Şehir, lig ve sezon seçince tablo dolar."
          action={{ label: "Kapsam seç", onPress: onPickScope }}
          variant="inline"
          compact
        />
      ) : !hasStanding ? (
        <EmptyState
          icon="podium-outline"
          title="Bu kapsamda tablo yok"
          body="Takım seçili lig ve sezonda oynamıyor. Üstteki seçiciden takımın ligini seçebilirsin."
          action={{ label: "Kapsam seç", onPress: onPickScope }}
          variant="inline"
          compact
        />
      ) : (
        <View style={styles.group}>
          {neighbours.map(({ row, rank }, index) => (
            <MiniStandingRow
              key={row.team_id}
              rank={rank}
              teamId={Number(row.team_id)}
              teamName={row.team_name}
              logo={row.logo}
              played={row.played}
              points={row.display_points}
              highlighted={Number(row.team_id) === teamId}
              position={groupPosition(index, neighbours.length)}
              onPress={onOpenTeam}
            />
          ))}
        </View>
      )}

      {canCompare ? (
        <Button
          label="H2H karşılaştır"
          icon="swap-horizontal-outline"
          variant="secondary"
          onPress={onCompare}
          style={styles.compareButton}
        />
      ) : null}

      {/* En çok gol atan 3 oyuncu */}
      <SectionHeader title="En çok gol atanlar" />
      {topScorers.length ? (
        <View style={styles.group}>
          {topScorers.map((player, index) => (
            <ScorerRow
              key={player.id}
              rank={index + 1}
              playerId={Number(player.id)}
              name={player.name}
              image={player.image ?? null}
              goals={num(player.goals)}
              assists={num(player.assists)}
              matches={num(player.matches)}
              position={groupPosition(index, topScorers.length)}
              onPress={onOpenPlayer}
            />
          ))}
        </View>
      ) : (
        <EmptyState
          icon="football-outline"
          title="Gol kaydı yok"
          body="Seçili sezonda bu takımın oyuncularına yazılmış gol bulunmuyor."
          variant="inline"
          compact
        />
      )}
    </ScrollView>
  );
}

/** Grup içindeki satırın köşe/ayraç konumu. */
function groupPosition(index: number, total: number): "single" | "first" | "middle" | "last" {
  if (total <= 1) return "single";
  if (index === 0) return "first";
  if (index === total - 1) return "last";
  return "middle";
}

const NextMatchCard = React.memo(function NextMatchCard({
  match,
  teamId,
  teamName,
  logoFor,
  onOpen,
  onAddCalendar,
}: {
  match: ApiMatch;
  teamId: number;
  teamName: string;
  logoFor: LogoFor;
  onOpen: (matchId: number) => void;
  onAddCalendar: (match: ApiMatch) => void;
}) {
  const view = perspective(match, teamId, teamName);
  const handleOpen = useCallback(() => onOpen(Number(match.id)), [onOpen, match.id]);
  const handleCalendar = useCallback(() => onAddCalendar(match), [onAddCalendar, match]);
  const target = matchTime(match);
  const live = matchState(match) === "live";

  return (
    <Card padding="md" onPress={handleOpen}>
      <View style={styles.nextTop}>
        <TeamLogo name={view.opponentName} logo={logoFor(view.opponentId, view.opponentName)} size={layout.crestLg} />
        <View style={styles.nextInfo}>
          <Text style={styles.nextOpponent} numberOfLines={1} {...textScale.dense}>
            {view.opponentName}
          </Text>
          <Text style={styles.nextMeta} numberOfLines={1} {...textScale.dense}>
            {formatDateShort(match.date)} · {formatTime(match.time)} ·{" "}
            {view.home ? "İç saha" : "Deplasman"}
            {match.match_field ? ` · ${match.match_field}` : ""}
          </Text>
        </View>
        {live ? <Badge label="CANLI" tone="live" variant="solid" size="sm" /> : null}
      </View>

      {!live && Number.isFinite(target) ? (
        <View style={styles.countdown}>
          <Ionicons name="time-outline" size={14} color={colors.brandAccent} />
          <Text style={styles.countdownLabel} {...textScale.badge}>
            KALAN
          </Text>
          <Countdown targetMs={target} />
        </View>
      ) : null}

      <Button
        label="Takvime ekle"
        icon="calendar-outline"
        variant="secondary"
        size="sm"
        onPress={handleCalendar}
        style={styles.nextCalendar}
      />
    </Card>
  );
});

const MiniStandingRow = React.memo(function MiniStandingRow({
  rank,
  teamId,
  teamName,
  logo,
  played,
  points,
  highlighted,
  position,
  onPress,
}: {
  rank: number;
  teamId: number;
  teamName: string;
  logo: string | null;
  played: number;
  points: number;
  highlighted: boolean;
  position: "single" | "first" | "middle" | "last";
  onPress: (teamId: number) => void;
}) {
  const handlePress = useCallback(() => onPress(teamId), [onPress, teamId]);

  return (
    <ListRow
      leading={
        <View style={styles.miniLead}>
          <Text style={styles.miniRank} {...textScale.dense}>
            {rank}
          </Text>
          <TeamLogo name={teamName} logo={logo} size={layout.crestMd} />
        </View>
      }
      title={teamName}
      value={`${played} maç`}
      badge={<Badge label={String(points)} tone={highlighted ? "brand" : "neutral"} size="sm" />}
      highlighted={highlighted}
      chevron={false}
      position={position}
      onPress={handlePress}
    />
  );
});

const ScorerRow = React.memo(function ScorerRow({
  rank,
  playerId,
  name,
  image,
  goals,
  assists,
  matches,
  position,
  onPress,
}: {
  rank: number;
  playerId: number;
  name: string;
  image: string | null;
  goals: number;
  assists: number;
  matches: number;
  position: "single" | "first" | "middle" | "last";
  onPress: (playerId: number) => void;
}) {
  const handlePress = useCallback(() => onPress(playerId), [onPress, playerId]);

  return (
    <ListRow
      leading={
        <View style={styles.miniLead}>
          <Text style={styles.miniRank} {...textScale.dense}>
            {rank}
          </Text>
          <Avatar name={name} image={image} size={32} />
        </View>
      }
      title={name}
      subtitle={`${matches} maç · ${assists} asist`}
      badge={<Badge label={`${goals} gol`} tone="win" size="sm" />}
      position={position}
      onPress={handlePress}
    />
  );
});

/* ══════════════════════════════════════════════════════════════════════════
   2) FİKSTÜR / 3) SONUÇLAR
   ══════════════════════════════════════════════════════════════════════════ */

interface MatchesTabProps extends TabShell {
  mode: "fixtures" | "results";
  matches: ApiMatch[];
  loading: boolean;
  logoFor: LogoFor;
  onOpenMatch: (matchId: number) => void;
  onAddCalendar: (match: ApiMatch) => void;
}

function MatchesTab({
  mode,
  scrollProps,
  refreshControl,
  header,
  matches,
  loading,
  logoFor,
  onOpenMatch,
  onAddCalendar,
}: MatchesTabProps) {
  const fixtures = mode === "fixtures";

  const renderItem = useCallback(
    ({ item, index }: { item: ApiMatch; index: number }) => (
      <FixtureListItem
        match={item}
        homeLogo={logoFor(item.home_team_id, item.first_team_name)}
        awayLogo={logoFor(item.away_team_id, item.second_team_name)}
        position={groupPosition(index, matches.length)}
        showCalendar={fixtures}
        onOpen={onOpenMatch}
        onAddCalendar={onAddCalendar}
      />
    ),
    [logoFor, matches.length, fixtures, onOpenMatch, onAddCalendar],
  );

  if (loading) {
    return (
      <ScrollView {...scrollProps} contentContainerStyle={styles.content}>
        {header}
        <SkeletonMatchRow count={6} />
      </ScrollView>
    );
  }

  return (
    <FlatList
      {...scrollProps}
      data={matches}
      keyExtractor={matchKey}
      renderItem={renderItem}
      refreshControl={refreshControl}
      contentContainerStyle={styles.content}
      ListHeaderComponent={
        /* Hero yüksekliği içerikle değiştiği için `getItemLayout` KURULMAZ:
           sabit satır yüksekliğiyle hesaplanan ofset başlığı yok sayar ve
           kaydırma konumu kayar. */
        <>
          {header}
          <SectionHeader
            title={fixtures ? "Fikstür" : "Sonuçlar"}
            meta={matches.length ? `${matches.length} maç` : undefined}
          />
        </>
      }
      ListEmptyComponent={
        fixtures ? (
          <EmptyState
            icon="calendar-outline"
            title="Yaklaşan maç yok"
            body="Fikstüre maç eklendiğinde burada görünecek."
            variant="inline"
          />
        ) : (
          <EmptyState
            icon="football-outline"
            title="Sonuç yok"
            body="Bu takımın oynanmış maçı bulunmuyor."
            variant="inline"
          />
        )
      }
      showsVerticalScrollIndicator={false}
    />
  );
}

const matchKey = (item: ApiMatch) => String(item.id);

/**
 * Satır sarmalayıcı. VARLIK NEDENİ: `MatchRow` memo'lu ama `onPress` her
 * render'da yeniden üretilse memo işe yaramaz; işleyiciler burada maç id'sine
 * bağlanır, dışarıdan yalnız ilkel değerler ve sabit fonksiyonlar geçer.
 */
const FixtureListItem = React.memo(function FixtureListItem({
  match,
  homeLogo,
  awayLogo,
  position,
  showCalendar,
  onOpen,
  onAddCalendar,
}: {
  match: ApiMatch;
  homeLogo: string | null;
  awayLogo: string | null;
  position: "single" | "first" | "middle" | "last";
  showCalendar: boolean;
  onOpen: (matchId: number) => void;
  onAddCalendar: (match: ApiMatch) => void;
}) {
  const handleOpen = useCallback(() => onOpen(Number(match.id)), [onOpen, match.id]);
  const handleCalendar = useCallback(() => onAddCalendar(match), [onAddCalendar, match]);

  if (!showCalendar) {
    return (
      <MatchRow
        match={match}
        homeLogo={homeLogo}
        awayLogo={awayLogo}
        position={position}
        metaMode="league"
        showFavorite={false}
        onPress={handleOpen}
      />
    );
  }

  const corner =
    position === "first"
      ? styles.cornerTop
      : position === "last"
        ? styles.cornerBottom
        : position === "single"
          ? styles.cornerAll
          : null;

  return (
    <View style={[styles.fixtureRow, corner]}>
      <View style={styles.fixtureMain}>
        <MatchRow
          match={match}
          homeLogo={homeLogo}
          awayLogo={awayLogo}
          position={position}
          metaMode="league"
          showFavorite={false}
          onPress={handleOpen}
        />
      </View>
      <Touchable
        style={styles.calendarButton}
        onPress={handleCalendar}
        feedback="icon"
        haptic="light"
        accessibilityRole="button"
        accessibilityLabel="Maçı takvime ekle"
      >
        <Ionicons name="calendar-outline" size={18} color={colors.brandAccent} />
      </Touchable>
    </View>
  );
});

/** Genel segmentindeki "son 5 maç" satırı — takvim düğmesi olmadan. */
const TeamMatchRow = React.memo(function TeamMatchRow({
  match,
  homeLogo,
  awayLogo,
  position,
  myTeamId,
  myTeamName,
  onOpen,
}: {
  match: ApiMatch;
  homeLogo: string | null;
  awayLogo: string | null;
  position: "single" | "first" | "middle" | "last";
  myTeamId: number;
  myTeamName: string;
  onOpen: (matchId: number) => void;
}) {
  const handleOpen = useCallback(() => onOpen(Number(match.id)), [onOpen, match.id]);

  return (
    <MatchRow
      match={match}
      homeLogo={homeLogo}
      awayLogo={awayLogo}
      position={position}
      metaMode="league"
      showFavorite={false}
      myTeamId={myTeamId}
      myTeamName={myTeamName}
      onPress={handleOpen}
    />
  );
});

/* ══════════════════════════════════════════════════════════════════════════
   4) KADRO — pozisyona göre gruplu
   ══════════════════════════════════════════════════════════════════════════ */

interface SquadSection {
  key: PosLine;
  title: string;
  data: SquadEntry[];
}

interface SquadTabProps extends TabShell {
  sections: SquadSection[];
  loading: boolean;
  seasonLabel: string;
  onOpenPlayer: (playerId: number) => void;
}

function SquadTab({
  scrollProps,
  refreshControl,
  header,
  sections,
  loading,
  seasonLabel,
  onOpenPlayer,
}: SquadTabProps) {
  const renderItem = useCallback(
    ({ item, index, section }: { item: SquadEntry; index: number; section: SquadSection }) => (
      <SquadRow
        playerId={item.id}
        name={item.name}
        image={item.image}
        jersey={item.jersey}
        matches={item.matches}
        goals={item.goals}
        assists={item.assists}
        rating={item.rating}
        position={groupPosition(index, section.data.length)}
        onPress={onOpenPlayer}
      />
    ),
    [onOpenPlayer],
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: SquadSection }) => (
      <SectionHeader title={section.title} meta={`${section.data.length} oyuncu`} sticky />
    ),
    [],
  );

  if (loading) {
    return (
      <ScrollView {...scrollProps} contentContainerStyle={styles.content}>
        {header}
        <SkeletonListRow count={8} />
      </ScrollView>
    );
  }

  return (
    <SectionList
      {...scrollProps}
      sections={sections}
      keyExtractor={squadKey}
      renderItem={renderItem}
      renderSectionHeader={renderSectionHeader}
      stickySectionHeadersEnabled
      refreshControl={refreshControl}
      contentContainerStyle={styles.content}
      ListHeaderComponent={
        <>
          {header}
          {seasonLabel ? (
            <Text style={styles.squadHint} {...textScale.dense}>
              Sezon katkıları · {seasonLabel}
            </Text>
          ) : null}
        </>
      }
      ListEmptyComponent={
        <EmptyState
          icon="shirt-outline"
          title="Kadro verisi yok"
          body="Bu takım için oyuncu kaydı bulunmuyor. Üstteki seçiciden takımın oynadığı lig ve sezonu seçmeyi deneyebilirsin."
          variant="inline"
        />
      }
      showsVerticalScrollIndicator={false}
    />
  );
}

const squadKey = (item: SquadEntry) => String(item.id);

const SquadRow = React.memo(function SquadRow({
  playerId,
  name,
  image,
  jersey,
  matches,
  goals,
  assists,
  rating,
  position,
  onPress,
}: {
  playerId: number;
  name: string;
  image: string | null;
  jersey: number | null;
  matches: number;
  goals: number;
  assists: number;
  rating: number | null;
  position: "single" | "first" | "middle" | "last";
  onPress: (playerId: number) => void;
}) {
  const handlePress = useCallback(() => onPress(playerId), [onPress, playerId]);

  return (
    <ListRow
      leading={<Avatar name={name} image={image} size={34} jersey={jersey} />}
      title={name}
      subtitle={`${matches} maç · ${goals} gol · ${assists} asist`}
      trailing={
        <View style={styles.squadTrailing}>
          <RatingPill value={rating} size="sm" hideEmpty />
          <Ionicons name="chevron-forward" size={14} color={colors.textTertiary} />
        </View>
      }
      position={position}
      onPress={handlePress}
    />
  );
});

/* ══════════════════════════════════════════════════════════════════════════
   5) İSTATİSTİK — rekorlar, gol dağılımı, disiplin
   ══════════════════════════════════════════════════════════════════════════ */

interface SideRecord {
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
}

interface MatchHighlight {
  match: ApiMatch;
  ours: number;
  theirs: number;
  opponent: string;
}

interface TeamRecords {
  total: SideRecord;
  home: SideRecord;
  away: SideRecord;
  cleanSheets: number;
  blankGames: number;
  bestWin: MatchHighlight | null;
  mostGoals: MatchHighlight | null;
  worstLoss: MatchHighlight | null;
}

/**
 * Takım performansını otomatik Türkçe metne çevirir (eski ekrandan KORUNAN
 * işlev).
 *
 * DÜZELTME: eski sürüm form dizisinde "G"/"M" harflerini arıyordu; oysa
 * `StandingRow.last5` İngilizce harf taşır ("WDLWW"). Sayaçlar hiç dolmuyordu,
 * form cümlesi hiç yazılmıyordu. Artık W/L üzerinden sayılıyor.
 */
function buildAnalysis(row: StandingRow, teamName: string, position: number): string {
  const { played, wins, draws, losses, goals_for, goals_against, goal_diff, last5 } = row;
  if (!played) return `${teamName} bu sezon henüz maç oynamadı.`;

  const winRate = Math.round((wins / played) * 100);
  const form = last5 ? String(last5).slice(-5).split("") : [];
  const formWins = form.filter((letter) => letter === "W").length;
  const formLosses = form.filter((letter) => letter === "L").length;

  let text = `${teamName} bu sezon ${played} maç oynadı; ${wins} galibiyet, ${draws} beraberlik, ${losses} mağlubiyet aldı. `;
  text += `Ligde ${position}. sırada yer alıyor. `;

  if (goal_diff > 0) {
    text += `${goals_for} gol atıp ${goals_against} gol yiyerek +${goal_diff} averajla avantajlı konumda. `;
  } else if (goal_diff < 0) {
    text += `${goals_for} gol atıp ${goals_against} gol yiyerek ${goal_diff} averajla geride. `;
  } else {
    text += `${goals_for} gol atıp ${goals_against} gol yedi, averajı dengede. `;
  }

  if (winRate === 100) {
    text += "Kusursuz galibiyet oranıyla sezona damga vuruyor.";
  } else if (winRate >= 70) {
    text += `%${winRate} galibiyet oranıyla güçlü bir sezonu sürdürüyor.`;
  } else if (winRate >= 50) {
    text += `%${winRate} galibiyet oranıyla ligde rekabetçi konumunu koruyor.`;
  } else if (winRate >= 30) {
    text += `%${winRate} galibiyet oranıyla iyileşme arayan bir grafik çiziyor.`;
  } else {
    text += "Zorlu bir dönemden geçiyor; toparlanma adına kritik maçlar önünde.";
  }

  if (form.length >= 3) {
    if (formWins >= 3) text += ` Son maçlardaki ${formWins} galibiyet moralleri yüksek tutuyor.`;
    else if (formLosses >= 3) text += ` Ancak son ${formLosses} mağlubiyetle form kaybı yaşıyor.`;
  }

  return text.trim();
}

const emptySide = (): SideRecord => ({
  played: 0,
  wins: 0,
  draws: 0,
  losses: 0,
  goalsFor: 0,
  goalsAgainst: 0,
});

/** Bitmiş maçlardan takım rekorlarını çıkarır. Uydurma yok, hepsi sayım. */
function buildRecords(recent: ApiMatch[], teamId: number, teamName: string): TeamRecords {
  const total = emptySide();
  const home = emptySide();
  const away = emptySide();
  let cleanSheets = 0;
  let blankGames = 0;
  let bestWin: MatchHighlight | null = null;
  let mostGoals: MatchHighlight | null = null;
  let worstLoss: MatchHighlight | null = null;

  for (const match of recent) {
    const view = perspective(match, teamId, teamName);
    if (view.ours == null || view.theirs == null) continue;

    const side = view.home ? home : away;
    for (const bucket of [total, side]) {
      bucket.played += 1;
      bucket.goalsFor += view.ours;
      bucket.goalsAgainst += view.theirs;
      if (view.result === "W") bucket.wins += 1;
      else if (view.result === "D") bucket.draws += 1;
      else bucket.losses += 1;
    }

    if (view.theirs === 0) cleanSheets += 1;
    if (view.ours === 0) blankGames += 1;

    const highlight: MatchHighlight = {
      match,
      ours: view.ours,
      theirs: view.theirs,
      opponent: view.opponentName,
    };
    if (view.result === "W") {
      const margin = view.ours - view.theirs;
      if (!bestWin || margin > bestWin.ours - bestWin.theirs) bestWin = highlight;
    }
    if (!mostGoals || view.ours > mostGoals.ours) mostGoals = highlight;
    if (view.result === "L") {
      const margin = view.theirs - view.ours;
      if (!worstLoss || margin > worstLoss.theirs - worstLoss.ours) worstLoss = highlight;
    }
  }

  return { total, home, away, cleanSheets, blankGames, bestWin, mostGoals, worstLoss };
}

const highlightText = (item: MatchHighlight | null): string =>
  item ? `${item.ours}-${item.theirs} · ${item.opponent}` : "—";

interface CareerTotals {
  matches: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
}

interface StatsTabProps extends TabShell {
  records: TeamRecords;
  /** Takım kaydının kendi toplamları — sezondan bağımsız, tüm zamanlar. */
  career: CareerTotals;
  discipline: { yellow: number; red: number; players: number };
  loading: boolean;
}

function StatsTab({
  scrollProps,
  refreshControl,
  header,
  records,
  career,
  discipline,
  loading,
}: StatsTabProps) {
  const { total, home, away } = records;
  const winRate = total.played ? Math.round((total.wins / total.played) * 100) : 0;

  return (
    <ScrollView
      {...scrollProps}
      refreshControl={refreshControl}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {header}

      {/* Tüm zamanlar — puan tablosuna değil takım kaydına dayanır, bu yüzden
          kapsam tutmasa da her zaman gösterilir. */}
      {career.matches > 0 ? (
        <>
          <SectionHeader title="Tüm zamanlar" meta={`${career.matches} maç`} />
          <Card padding="md">
            <View style={styles.careerRow}>
              <CareerCell label="Maç" value={career.matches} />
              <CareerCell label="G" value={career.wins} tone={colors.win} />
              <CareerCell label="B" value={career.draws} />
              <CareerCell label="M" value={career.losses} tone={colors.loss} />
              <CareerCell label="A" value={career.goalsFor} />
              <CareerCell label="Y" value={career.goalsAgainst} />
            </View>
          </Card>
        </>
      ) : null}

      {loading ? (
        <SkeletonCard lines={4} />
      ) : total.played === 0 ? (
        <EmptyState
          icon="stats-chart-outline"
          title="İstatistik yok"
          body="Takımın tamamlanmış maçı olmadığı için rekor çıkarılamıyor."
          variant="inline"
        />
      ) : (
        <>
          {/* Rekorlar */}
          <SectionHeader title="Takım rekorları" meta={`${total.played} maç`} />
          <View style={styles.group}>
            <KeyValueRow label="En farklı galibiyet" value={highlightText(records.bestWin)} numeric position="first" />
            <KeyValueRow label="En çok gol attığı maç" value={highlightText(records.mostGoals)} numeric position="middle" />
            <KeyValueRow label="En ağır yenilgi" value={highlightText(records.worstLoss)} numeric position="middle" />
            <KeyValueRow
              label="Gol yemeden bitirdiği maç"
              value={`${records.cleanSheets}`}
              numeric
              position="middle"
            />
            <KeyValueRow label="Gol atamadığı maç" value={`${records.blankGames}`} numeric position="last" />
          </View>

          {/* Galibiyet oranı */}
          <SectionHeader title="Sezon dengesi" />
          <Card padding="md">
            <View style={styles.ringRow}>
              <ProgressRing
                value={winRate}
                size={78}
                tone="win"
                label={`%${winRate}`}
                sublabel="galibiyet"
              />
              <View style={styles.ringLegend}>
                <LegendItem label="Galibiyet" value={total.wins} tone={colors.win} />
                <LegendItem label="Beraberlik" value={total.draws} tone={colors.draw} />
                <LegendItem label="Mağlubiyet" value={total.losses} tone={colors.loss} />
                <LegendItem label="Averaj" value={total.goalsFor - total.goalsAgainst} tone={colors.brandAccent} />
              </View>
            </View>
          </Card>

          {/* İç saha / deplasman dağılımı */}
          <SectionHeader title="İç saha · Deplasman" />
          <Card padding="md">
            <View style={styles.barHead}>
              <Text style={styles.barSideLabel} {...textScale.badge}>
                {upperTR("İç saha")}
              </Text>
              <Text style={[styles.barSideLabel, styles.barSideRight]} {...textScale.badge}>
                {upperTR("Deplasman")}
              </Text>
            </View>
            <StatBar label="Oynanan" home={home.played} away={away.played} />
            <StatBar label="Galibiyet" home={home.wins} away={away.wins} />
            <StatBar label="Atılan gol" home={home.goalsFor} away={away.goalsFor} />
            <StatBar label="Yenilen gol" home={home.goalsAgainst} away={away.goalsAgainst} />
          </Card>

          {/* Disiplin */}
          <SectionHeader title="Disiplin" meta={discipline.players ? `${discipline.players} oyuncu` : undefined} />
          <Card padding="md">
            <View style={styles.cardRow}>
              <CardCount label="Sarı kart" value={discipline.yellow} tone={colors.yellowCard} />
              <CardCount label="Kırmızı kart" value={discipline.red} tone={colors.redCard} />
            </View>
            <Text style={styles.disciplineHint} {...textScale.dense}>
              Kart sayıları seçili sezonun oyuncu sıralamasından toplanır.
            </Text>
          </Card>
        </>
      )}
    </ScrollView>
  );
}

const CareerCell = React.memo(function CareerCell({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: string;
}) {
  return (
    <View style={styles.careerCell}>
      <Text style={[styles.careerValue, tone ? { color: tone } : null]} {...textScale.dense}>
        {value}
      </Text>
      <Text style={styles.careerLabel} numberOfLines={1} {...textScale.badge}>
        {upperTR(label)}
      </Text>
    </View>
  );
});

const LegendItem = React.memo(function LegendItem({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: tone }]} />
      <Text style={styles.legendLabel} numberOfLines={1} {...textScale.dense}>
        {label}
      </Text>
      <Text style={styles.legendValue} {...textScale.dense}>
        {value}
      </Text>
    </View>
  );
});

const CardCount = React.memo(function CardCount({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <View style={styles.cardCount}>
      <View style={[styles.cardChip, { backgroundColor: tone }]} />
      <Text style={styles.cardValue} {...textScale.dense}>
        {value}
      </Text>
      <Text style={styles.cardLabel} numberOfLines={1} {...textScale.badge}>
        {upperTR(label)}
      </Text>
    </View>
  );
});

/* ══════════════════════════════════════════════════════════════════════════
   6) TRANSFERLER
   ══════════════════════════════════════════════════════════════════════════ */

interface TransfersTabProps extends TabShell {
  items: NewsItem[];
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  onOpenNews: (newsId: string) => void;
}

/**
 * Transfer hareketleri.
 *
 * SUNUCUDA "gelen/giden" AYRIMI VEREN KAMUYA AÇIK UÇ YOK: transfer teklifleri
 * (`/api/transfer-offers/*`) yalnız takım başkanının panelinde görünür. Kamuya
 * açık tek kaynak, tamamlanan transferleri de yayımlayan haber akışıdır
 * (`/api/news/feed` → `kind: "transfer"`). Bu yüzden liste "hareket" olarak
 * gösterilir; yön bilgisi UYDURULMAZ, kayıt yoksa boş durum çizilir.
 */
function TransfersTab({
  scrollProps,
  refreshControl,
  header,
  items,
  loading,
  error,
  onRetry,
  onOpenNews,
}: TransfersTabProps) {
  return (
    <ScrollView
      {...scrollProps}
      refreshControl={refreshControl}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {header}
      <SectionHeader title="Transfer hareketleri" meta={items.length ? `${items.length} kayıt` : undefined} />

      {loading ? (
        <SkeletonListRow count={4} />
      ) : error ? (
        <ErrorState error={error} onRetry={onRetry} variant="inline" />
      ) : items.length === 0 ? (
        <EmptyState
          icon="swap-horizontal-outline"
          title="Bu sezon transfer kaydı yok"
          body="Takıma gelen ya da takımdan ayrılan oyuncu duyurusu bulunmuyor."
          variant="inline"
        />
      ) : (
        <View style={styles.group}>
          {items.map((item, index) => (
            <TransferRow
              key={item.id}
              newsId={item.id}
              title={item.title}
              summary={item.summary ?? null}
              publishedAt={item.published_at ?? null}
              position={groupPosition(index, items.length)}
              onPress={onOpenNews}
            />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const TransferRow = React.memo(function TransferRow({
  newsId,
  title,
  summary,
  publishedAt,
  position,
  onPress,
}: {
  newsId: string;
  title: string;
  summary: string | null;
  publishedAt: string | null;
  position: "single" | "first" | "middle" | "last";
  onPress: (newsId: string) => void;
}) {
  const handlePress = useCallback(() => onPress(newsId), [onPress, newsId]);

  return (
    <ListRow
      leading={{ icon: "swap-horizontal-outline", tone: "brand" }}
      title={title}
      subtitle={summary ?? undefined}
      value={publishedAt ? timeAgo(publishedAt) : undefined}
      position={position}
      onPress={handlePress}
    />
  );
});

/* ══════════════════════════════════════════════════════════════════════════
   H2H — rakip seçici (eski ekrandaki karşılaştırma kısayolu korunur)
   ══════════════════════════════════════════════════════════════════════════ */

function H2hSheet({
  visible,
  onClose,
  rivals,
  onPick,
}: {
  visible: boolean;
  onClose: () => void;
  rivals: StandingRow[];
  onPick: (rivalId: number, rivalName: string) => void;
}) {
  const renderItem = useCallback(
    ({ item, index }: { item: StandingRow; index: number }) => (
      <RivalRow
        teamId={Number(item.team_id)}
        teamName={item.team_name}
        logo={item.logo}
        points={item.display_points}
        position={groupPosition(index, rivals.length)}
        onPress={onPick}
      />
    ),
    [rivals.length, onPick],
  );

  return (
    // Liste kendi kaydırmasını yönetir; sheet'in ScrollView'ü kapatılır.
    <BottomSheet visible={visible} onClose={onClose} title="Rakip seç" snap="half" scrollable={false}>
      <FlatList
        data={rivals}
        keyExtractor={rivalKey}
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
      />
    </BottomSheet>
  );
}

const rivalKey = (item: StandingRow) => String(item.team_id);

const RivalRow = React.memo(function RivalRow({
  teamId,
  teamName,
  logo,
  points,
  position,
  onPress,
}: {
  teamId: number;
  teamName: string;
  logo: string | null;
  points: number;
  position: "single" | "first" | "middle" | "last";
  onPress: (teamId: number, teamName: string) => void;
}) {
  const handlePress = useCallback(() => onPress(teamId, teamName), [onPress, teamId, teamName]);

  return (
    <ListRow
      leading={<TeamLogo name={teamName} logo={logo} size={layout.crestMd} />}
      title={teamName}
      value={`${points} puan`}
      position={position}
      onPress={handlePress}
    />
  );
});

/* ══════════════════════════════════════════════════════════════════════════
   PAYLAŞIM KARTI — takım istatistik kartı, iki boyda
   ══════════════════════════════════════════════════════════════════════════ */

type ShareFormat = "story" | "post";

const SHARE_WIDTH = 264;
const SHARE_FORMATS: Record<ShareFormat, { label: string; height: number }> = {
  story: { label: "Hikâye 9:16", height: Math.round((SHARE_WIDTH * 16) / 9) },
  post: { label: "Gönderi 3:4", height: Math.round((SHARE_WIDTH * 4) / 3) },
};

const SHARE_ITEMS: SegmentedItem<ShareFormat>[] = [
  { key: "story", label: SHARE_FORMATS.story.label },
  { key: "post", label: SHARE_FORMATS.post.label },
];

function TeamShareSheet({
  visible,
  onClose,
  teamName,
  logo,
  rank,
  row,
  onError,
}: {
  visible: boolean;
  onClose: () => void;
  teamName: string;
  logo: string | null;
  rank: number | null;
  row: StandingRow | null;
  onError: () => void;
}) {
  const [format, setFormat] = useState<ShareFormat>("story");
  const [busy, setBusy] = useState(false);
  const shotRef = useRef<View>(null);

  const share = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const uri = await captureRef(shotRef, { format: "png", quality: 1 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: "image/png" });
      } else {
        onError();
      }
    } catch {
      onError();
    } finally {
      setBusy(false);
    }
  }, [busy, onError]);

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Takımı paylaş" snap="full">
      <SegmentedControl items={SHARE_ITEMS} value={format} onChange={setFormat} />

      <View style={styles.shareCardWrap}>
        <ViewShot ref={shotRef} options={{ format: "png", quality: 1 }}>
          <View style={[styles.shareCard, { height: SHARE_FORMATS[format].height }]}>
            <LinearGradient
              colors={[colors.brand, colors.brandStrong]}
              style={styles.shareStrip}
            />
            <View style={styles.shareBody}>
              <View style={styles.shareTop}>
                <Text style={styles.shareBrand} {...textScale.badge}>
                  elitlig
                </Text>
                <Text style={styles.shareKicker} {...textScale.badge}>
                  {upperTR("Takım istatistikleri")}
                </Text>
              </View>

              <View style={styles.shareTeam}>
                <TeamLogo name={teamName} logo={logo} size={52} />
                <View style={styles.shareTeamInfo}>
                  <Text style={styles.shareTeamName} numberOfLines={2} {...textScale.badge}>
                    {upperTR(teamName)}
                  </Text>
                  {row ? (
                    <View style={styles.shareRankRow}>
                      {rank != null ? <Badge label={`${rank}. sıra`} tone="brand" size="sm" /> : null}
                      <Badge label={`${row.display_points} puan`} tone="neutral" size="sm" />
                    </View>
                  ) : null}
                </View>
              </View>

              {row ? (
                <>
                  <View style={styles.shareStats}>
                    <ShareStat label="G" value={row.wins} />
                    <ShareStat label="B" value={row.draws} />
                    <ShareStat label="M" value={row.losses} />
                    <ShareStat label="O" value={row.played} />
                  </View>

                  <View style={styles.shareGoals}>
                    <ShareStat label="Atılan" value={row.goals_for} />
                    <ShareStat label="Yenilen" value={row.goals_against} tone={colors.loss} />
                    <ShareStat
                      label="Averaj"
                      value={row.goal_diff}
                      tone={row.goal_diff >= 0 ? colors.win : colors.loss}
                    />
                  </View>

                  {row.last5 ? (
                    <View style={styles.shareForm}>
                      <Text style={styles.shareFormLabel} {...textScale.badge}>
                        SON 5
                      </Text>
                      <FormChips form={row.last5} size="sm" />
                    </View>
                  ) : null}
                </>
              ) : (
                <Text style={styles.shareNoData} {...textScale.badge}>
                  Bu kapsamda sezon verisi yok
                </Text>
              )}

              <View style={styles.shareSpacer} />
              <Text style={styles.shareFooter} {...textScale.badge}>
                ELİTLİG.COM
              </Text>
            </View>
          </View>
        </ViewShot>
      </View>

      <Button
        label={busy ? "Hazırlanıyor" : "Paylaş"}
        icon="share-social"
        onPress={share}
        loading={busy}
        fullWidth
      />
      <Text style={styles.shareHint} {...textScale.dense}>
        İndirmek için: Paylaş → Görüntüyü Kaydet
      </Text>
    </BottomSheet>
  );
}

const ShareStat = React.memo(function ShareStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: string;
}) {
  return (
    <View style={styles.shareStat}>
      <Text style={[styles.shareStatValue, tone ? { color: tone } : null]} {...textScale.badge}>
        {value}
      </Text>
      <Text style={styles.shareStatLabel} numberOfLines={1} {...textScale.badge}>
        {upperTR(label)}
      </Text>
    </View>
  );
});

/* ══════════════════════════════════════════════════════════════════════════
   Stiller
   ══════════════════════════════════════════════════════════════════════════ */

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    paddingBottom: space.huge,
  },
  group: {
    marginHorizontal: layout.screenPadding,
    borderRadius: radius.lg,
    overflow: "hidden",
  },

  /* — Hero — */
  hero: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.md,
    paddingBottom: space.lg,
    gap: space.md,
  },
  heroTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
  },
  heroIdentity: {
    flex: 1,
    minWidth: 0,
    gap: space.xs,
  },
  heroName: {
    ...type.h1,
    color: colors.textPrimary,
  },
  heroPlace: {
    ...type.bodySm,
    color: colors.textSecondary,
  },
  heroBadges: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: space.s,
  },
  heroFollowers: {
    ...type.caption,
    color: colors.textTertiary,
  },
  heroForm: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  heroFormLabel: {
    ...type.micro,
    color: colors.textTertiary,
  },
  heroActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  heroPrimary: {
    flex: 1,
  },

  /* — Sıradaki maç — */
  nextTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
  },
  nextInfo: {
    flex: 1,
    minWidth: 0,
    gap: space.xxs,
  },
  nextOpponent: {
    ...type.h3,
    color: colors.textPrimary,
  },
  nextMeta: {
    ...type.bodySm,
    color: colors.textSecondary,
  },
  countdown: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.s,
    marginTop: space.md,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface3,
  },
  countdownLabel: {
    ...type.micro,
    color: colors.textTertiary,
  },
  countdownValue: {
    ...type.scoreSm,
    color: colors.textPrimary,
    marginLeft: "auto",
  },
  nextCalendar: {
    marginTop: space.md,
  },

  /* — Kadro özeti — */
  lineRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  lineCell: {
    flex: 1,
    alignItems: "center",
    gap: space.xxs,
  },
  lineValue: {
    ...type.scoreMd,
    color: colors.textPrimary,
  },
  lineLabel: {
    ...type.micro,
    color: colors.textTertiary,
  },

  /* — Mini tablo / gol krallığı — */
  miniLead: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  miniRank: {
    ...type.tableNum,
    color: colors.textTertiary,
    width: 18,
    textAlign: "center",
  },

  /* — Maç listeleri — */
  fixtureRow: {
    flexDirection: "row",
    alignItems: "stretch",
    // Takvim sütunu satırın gövdesine yapışık durur; köşe yuvarlaması
    // gruptaki konuma göre BURADA kesilir, yoksa düğme köşeden taşar.
    overflow: "hidden",
  },
  cornerTop: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
  },
  cornerBottom: {
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
  },
  cornerAll: {
    borderRadius: radius.lg,
  },
  fixtureMain: {
    flex: 1,
    minWidth: 0,
  },
  calendarButton: {
    width: layout.minTouch,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface1,
  },

  /* — Kadro — */
  squadHint: {
    ...type.caption,
    color: colors.textTertiary,
    paddingHorizontal: layout.screenPadding,
    paddingBottom: space.sm,
  },
  squadTrailing: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.s,
  },

  analysisText: {
    ...type.body,
    color: colors.textSecondary,
  },
  compareButton: {
    marginHorizontal: layout.screenPadding,
    marginTop: space.md,
  },

  /* — İstatistik — */
  careerRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  careerCell: {
    flex: 1,
    alignItems: "center",
    gap: space.xxs,
  },
  careerValue: {
    ...type.scoreSm,
    color: colors.textPrimary,
  },
  careerLabel: {
    ...type.micro,
    color: colors.textTertiary,
  },
  ringRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.lg,
  },
  ringLegend: {
    flex: 1,
    gap: space.s,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
  },
  legendLabel: {
    ...type.bodySm,
    color: colors.textSecondary,
    flex: 1,
  },
  legendValue: {
    ...type.tableNumStrong,
    color: colors.textPrimary,
  },
  barHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: space.sm,
  },
  barSideLabel: {
    ...type.micro,
    color: colors.textTertiary,
  },
  barSideRight: {
    textAlign: "right",
  },
  cardRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  cardCount: {
    flex: 1,
    alignItems: "center",
    gap: space.xs,
  },
  cardChip: {
    width: 14,
    height: 20,
    borderRadius: radius.xs,
  },
  cardValue: {
    ...type.scoreMd,
    color: colors.textPrimary,
  },
  cardLabel: {
    ...type.micro,
    color: colors.textTertiary,
  },
  disciplineHint: {
    ...type.caption,
    color: colors.textTertiary,
    marginTop: space.md,
  },

  /* — Paylaşım kartı — */
  shareCardWrap: {
    alignItems: "center",
    paddingVertical: space.lg,
  },
  shareCard: {
    width: SHARE_WIDTH,
    borderRadius: radius.xl,
    overflow: "hidden",
    backgroundColor: colors.surface1,
    borderWidth: 1,
    borderColor: colors.border,
  },
  shareStrip: {
    height: 8,
  },
  shareBody: {
    flex: 1,
    padding: space.lg,
    gap: space.md,
  },
  shareTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  shareBrand: {
    ...type.h3,
    color: colors.brandAccent,
  },
  shareKicker: {
    ...type.micro,
    color: colors.textTertiary,
  },
  shareTeam: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
  },
  shareTeamInfo: {
    flex: 1,
    minWidth: 0,
    gap: space.s,
  },
  shareTeamName: {
    ...type.h2,
    color: colors.textPrimary,
  },
  shareRankRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.s,
    flexWrap: "wrap",
  },
  shareStats: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: space.md,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.separator,
  },
  shareGoals: {
    flexDirection: "row",
    alignItems: "center",
  },
  shareStat: {
    flex: 1,
    alignItems: "center",
    gap: space.xxs,
  },
  shareStatValue: {
    ...type.scoreMd,
    color: colors.textPrimary,
  },
  shareStatLabel: {
    ...type.micro,
    color: colors.textTertiary,
  },
  shareForm: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  shareFormLabel: {
    ...type.micro,
    color: colors.textTertiary,
  },
  shareNoData: {
    ...type.bodySm,
    color: colors.textTertiary,
  },
  shareSpacer: {
    flex: 1,
  },
  shareFooter: {
    ...type.micro,
    color: colors.textTertiary,
    textAlign: "center",
  },
  shareHint: {
    ...type.caption,
    color: colors.textTertiary,
    textAlign: "center",
    marginTop: space.sm,
  },
});
