/**
 * StatsPane — sezonun lider tabloları (Lig merkezinin "İstatistik" bölmesi).
 *
 * ESKİ HÂL: her kategoriden yalnız BİRİNCİ, menü satırı biçiminde
 * ("CAPITAL FC · EN GOLCÜ ›"). Kimin ne kadar önde olduğu okunmuyordu.
 *
 * YENİ DÜZEN — ÜÇ KATMAN:
 *   1. Sezon özeti: oynanan maç · atılan gol · maç başı gol — tek ince
 *      kartta üç sütun (`SummaryStrip`; üç ayrı iri karo yerine).
 *      Puan tablosundan türetilir; her maç iki takımın "O" sütununda
 *      sayıldığı için maç sayısı ΣO / 2'dir.
 *   2. Takım liderleri: Hücum (atılan gol), Savunma (yenilen gol — az olan
 *      önde, çubuk ters), Form (son beş maçtan alınan puan).
 *   3. Oyuncu liderleri: Gol krallığı, Asist, Kart. Asist için ayrı uç yok;
 *      gol sıralaması yanıtı kapsamın TÜM oyuncularını ve asist alanını
 *      taşıdığı için asist sıralaması aynı yanıttan istemcide kurulur.
 *
 * İKİNCİ TUR — DÖRT KATMAN:
 *   1. LİG KARNESİ: `MetricGrid` (3×2) — maç, gol, gol/maç, asist, kart,
 *      takım. Rakam iri, etiket versal.
 *   2. KARŞILAŞTIRMALAR: tek kartta `StatBar`lar (galibiyetle biten /
 *      berabere, gol / asist, sarı / kırmızı) + iki `GradientBar` oranı
 *      (beraberlik oranı, asistli gol oranı). Lig "nasıl bir lig" sorusunun
 *      yanıtı.
 *   3. SEZONUN ENLERİ: 2×2 vurgu karoları — gol kralı, asist kralı, en golcü
 *      takım, en sağlam savunma. Her karo degrade ikon, arma/avatar ve iri
 *      değer taşır; dokununca ilgili sayfayı açar.
 *   4. LİDER TABLOLARI: ilk beşler (madalya, imza çubuğu, "Tüm sıralama").
 *
 * Her kart ilk beşi gösterir ve "Tüm sıralama" ile ilgili bölmeye (Puan ya da
 * Oyuncular, doğru ölçütle) geçer.
 *
 * Hükmen maç kayıtları (`JUNK_PLAYER`) oyuncu tablolarından ayıklanır; aksi
 * hâlde gol krallığını "HÜKMEN 1" kazanıyordu.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useCallback, useMemo } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  Avatar,
  EmptyState,
  ErrorState,
  GradientBar,
  IconTile,
  MetricGrid,
  MetricTile,
  Reveal,
  SectionHeader,
  Skeleton,
  SkeletonCard,
  StatBar,
  TeamLogo,
  Touchable,
  refreshControlProps,
  useRefresh,
  type IconTileTone,
} from "@/components/ui";
import { getPlayerRankings } from "@/lib/api/players";
import { getStandings } from "@/lib/api/standings";
import { formatDecimal, formatNumber } from "@/lib/format";
import { queryKeys } from "@/lib/queryKeys";
import type { PlayerRankRow, PlayerSort, StandingRow } from "@/lib/types";
import { useScope } from "@/providers/ScopeProvider";
import { colors, hairline, radius, space, textScale, type, upperTR } from "@/theme";
import { Leaderboard, type LeaderEntry } from "./Leaderboard";
import {
  JUNK_PLAYER,
  ScopeMissing,
  num,
  paneStyles,
  useScopeKey,
  type PaneProps,
} from "./shared";

const TOP = 5;

/** Son beş maçtan alınan puan: G=3, B=1. */
function formPoints(last5: string | null | undefined): number {
  return String(last5 ?? "")
    .slice(-5)
    .split("")
    .reduce((sum, letter) => {
      const up = letter.toLocaleUpperCase("tr-TR");
      if (up === "W" || up === "G") return sum + 3;
      if (up === "D" || up === "B") return sum + 1;
      return sum;
    }, 0);
}

const teamEntry = (row: StandingRow, value: number, meta: string): LeaderEntry => ({
  id: row.team_id,
  name: row.team_name,
  image: row.logo,
  value,
  meta,
});

const playerEntry = (row: PlayerRankRow, value: number): LeaderEntry => ({
  id: row.id,
  name: row.name,
  image: row.image ?? null,
  meta: row.teamName || "Takımsız",
  value,
});

/* ══════════════════════════════════════════════════════════════════════════
   Sezonun enleri — 2×2 vurgu karosu
   ══════════════════════════════════════════════════════════════════════════ */

interface Highlight {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  tone: IconTileTone;
  kind: "team" | "player";
  entry: LeaderEntry;
  unit: string;
}

const HighlightTile = React.memo(function HighlightTile({
  item,
  onPress,
}: {
  item: Highlight;
  onPress: (kind: "team" | "player", id: number) => void;
}) {
  const press = useCallback(() => onPress(item.kind, item.entry.id), [item.entry.id, item.kind, onPress]);
  const value = item.entry.display ?? formatNumber(item.entry.value);
  return (
    <Touchable
      feedback="card"
      haptic="selection"
      onPress={press}
      style={styles.hl}
      accessibilityRole="button"
      accessibilityLabel={`${item.label}: ${item.entry.name}, ${value} ${item.unit}`}
    >
      <View style={styles.hlTop}>
        <IconTile icon={item.icon} tone={item.tone} size={28} glow={false} />
        <Text style={styles.hlLabel} numberOfLines={2} {...textScale.badge}>
          {upperTR(item.label)}
        </Text>
      </View>
      <View style={styles.hlValueRow}>
        <Text style={styles.hlValue} numberOfLines={1} {...textScale.dense}>
          {value}
        </Text>
        <Text style={styles.hlUnit} {...textScale.badge}>
          {item.unit}
        </Text>
      </View>
      <View style={styles.hlWho}>
        {item.kind === "team" ? (
          <TeamLogo name={item.entry.name} logo={item.entry.image ?? null} size={20} />
        ) : (
          <Avatar name={item.entry.name} image={item.entry.image ?? null} size={22} />
        )}
        <Text style={styles.hlName} numberOfLines={1} {...textScale.dense}>
          {item.entry.name}
        </Text>
      </View>
    </Touchable>
  );
});

/* ══════════════════════════════════════════════════════════════════════════
   Karşılaştırma kartı — StatBar + oran çubukları
   ══════════════════════════════════════════════════════════════════════════ */

const RatioLine = React.memo(function RatioLine({
  label,
  value,
  caption,
}: {
  label: string;
  value: number;
  caption: string;
}) {
  return (
    <View style={styles.ratio}>
      <View style={styles.ratioTop}>
        <Text style={styles.ratioLabel} {...textScale.dense}>
          {label}
        </Text>
        <Text style={styles.ratioValue} {...textScale.dense}>
          {`%${Math.round(value * 100)}`}
        </Text>
      </View>
      <GradientBar value={value} height={6} />
      <Text style={styles.ratioCaption} {...textScale.dense}>
        {caption}
      </Text>
    </View>
  );
});

/** StatBar'ın iki ucunun ne olduğunu söyleyen küçük anahtar. */
const SidesKey = React.memo(function SidesKey({ left, right }: { left: string; right: string }) {
  return (
    <View style={styles.sides}>
      <Text style={[styles.sideText, styles.sideLeft]} numberOfLines={1} {...textScale.badge}>
        {upperTR(left)}
      </Text>
      <Text style={[styles.sideText, styles.sideRight]} numberOfLines={1} {...textScale.badge}>
        {upperTR(right)}
      </Text>
    </View>
  );
});

export interface StatsPaneProps extends PaneProps {
  /** "Tüm sıralama" → Oyuncular bölmesi, verilen ölçütle. */
  onOpenPlayers?: (sort: PlayerSort) => void;
  /** "Tüm sıralama" → Puan bölmesi. */
  onOpenStandings?: () => void;
}

export function StatsPane({ scrollProps, onOpenPlayers, onOpenStandings }: StatsPaneProps) {
  const scope = useScope();
  const scopeKey = useScopeKey();
  const router = useRouter();

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

  /* Kart liderleri AYNI yanıttan çıkar: `/api/oyuncu-listesi` hangi `sort` ile
     çağrılırsa çağrılsın sezonun tüm oyuncularını aynı alanlarla döndürür;
     ikinci bir ≈1 MB'lık "mostCards" isteği yalnız sırayı değiştiriyordu. */
  const cards = scorers;

  const refetchAll = useCallback(() => {
    void standings.refetch();
    void scorers.refetch();
  }, [scorers, standings]);

  const refresh = useRefresh(refetchAll, {
    refreshing: standings.isRefetching || scorers.isRefetching,
  });

  /* — Sezon özeti — */
  const summary = useMemo(() => {
    const rows = standings.data ?? [];
    const played = rows.reduce((sum, row) => sum + num(row.played), 0);
    const goals = rows.reduce((sum, row) => sum + num(row.goals_for), 0);
    const matches = Math.round(played / 2);
    const draws = Math.round(rows.reduce((sum, row) => sum + num(row.draws), 0) / 2);
    return { matches, goals, draws, teams: rows.length, perMatch: matches > 0 ? goals / matches : 0 };
  }, [standings.data]);

  /* — Oyuncu toplamları (asist, kart) — aynı yanıttan. */
  const playerTotals = useMemo(() => {
    const pool = (scorers.data?.players ?? []).filter((row) => row.name && !JUNK_PLAYER.test(row.name));
    return pool.reduce(
      (acc, row) => ({
        goals: acc.goals + num(row.goals),
        assists: acc.assists + num(row.assists),
        yellow: acc.yellow + num(row.yellow),
        red: acc.red + num(row.red),
        players: acc.players + 1,
      }),
      { goals: 0, assists: 0, yellow: 0, red: 0, players: 0 },
    );
  }, [scorers.data]);

  /* — Takım liderleri — */
  const teamBoards = useMemo(() => {
    const rows = (standings.data ?? []).filter((row) => num(row.played) > 0);
    const attack = [...rows]
      .sort((a, b) => num(b.goals_for) - num(a.goals_for))
      .slice(0, TOP)
      .map((row) => teamEntry(row, num(row.goals_for), `${num(row.played)} maç`));
    const defense = [...rows]
      .sort((a, b) => num(a.goals_against) - num(b.goals_against) || num(b.played) - num(a.played))
      .slice(0, TOP)
      .map((row) => teamEntry(row, num(row.goals_against), `${num(row.played)} maç`));
    const form = [...rows]
      .filter((row) => String(row.last5 ?? "").length > 0)
      .sort((a, b) => formPoints(b.last5) - formPoints(a.last5))
      .slice(0, TOP)
      .map((row) => teamEntry(row, formPoints(row.last5), "son 5 maç"));
    return { attack, defense, form };
  }, [standings.data]);

  /* — Oyuncu liderleri — */
  const playerBoards = useMemo(() => {
    const pool = (scorers.data?.players ?? []).filter((row) => row.name && !JUNK_PLAYER.test(row.name));
    const goals = [...pool]
      .sort((a, b) => num(b.goals) - num(a.goals))
      .filter((row) => num(row.goals) > 0)
      .slice(0, TOP)
      .map((row) => playerEntry(row, num(row.goals)));
    const assists = [...pool]
      .filter((row) => num(row.assists) > 0)
      .sort((a, b) => num(b.assists) - num(a.assists) || num(a.matches) - num(b.matches))
      .slice(0, TOP)
      .map((row) => playerEntry(row, num(row.assists)));
    const cardPool = (cards.data?.players ?? []).filter((row) => row.name && !JUNK_PLAYER.test(row.name));
    const discipline = [...cardPool]
      .filter((row) => num(row.cards) > 0)
      .sort((a, b) => num(b.cards) - num(a.cards))
      .slice(0, TOP)
      .map((row) => playerEntry(row, num(row.cards)));
    return { goals, assists, discipline };
  }, [cards.data, scorers.data]);

  const highlights = useMemo<Highlight[]>(() => {
    const out: Highlight[] = [];
    if (playerBoards.goals[0])
      out.push({ key: "g", label: "Gol kralı", icon: "football", tone: "gold", kind: "player", entry: playerBoards.goals[0], unit: "gol" });
    if (playerBoards.assists[0])
      out.push({ key: "a", label: "Asist kralı", icon: "git-pull-request", tone: "cyan", kind: "player", entry: playerBoards.assists[0], unit: "asist" });
    if (teamBoards.attack[0])
      out.push({ key: "h", label: "En golcü takım", icon: "flash", tone: "pink", kind: "team", entry: teamBoards.attack[0], unit: "gol" });
    if (teamBoards.defense[0])
      out.push({ key: "d", label: "En sağlam savunma", icon: "shield-checkmark", tone: "mint", kind: "team", entry: teamBoards.defense[0], unit: "gol yedi" });
    return out;
  }, [playerBoards, teamBoards]);

  const openTeam = useCallback((id: number) => router.push(`/takim/${id}`), [router]);
  const openPlayer = useCallback((id: number) => router.push(`/oyuncu/${id}`), [router]);
  const openHighlight = useCallback(
    (kind: "team" | "player", id: number) => (kind === "team" ? openTeam(id) : openPlayer(id)),
    [openPlayer, openTeam],
  );

  const loading = standings.isLoading || scorers.isLoading || cards.isLoading;
  const hasTeams = teamBoards.attack.length > 0;
  const hasPlayers =
    playerBoards.goals.length + playerBoards.assists.length + playerBoards.discipline.length > 0;

  if (!scope.ready && !scope.loading) return <ScopeMissing />;
  if (loading || scope.loading) {
    return (
      <View style={paneStyles.skeleton}>
        <View style={styles.skeletonGrid}>
          {SKELETON_TILES.map((key) => (
            <Skeleton key={key} height={84} radius="lg" style={styles.skeletonTile} />
          ))}
        </View>
        <SkeletonCard lines={4} />
        <SkeletonCard lines={5} />
      </View>
    );
  }
  if (standings.isError && scorers.isError) {
    return <ErrorState error={standings.error} onRetry={refetchAll} />;
  }

  return (
    <ScrollView
      {...scrollProps}
      contentContainerStyle={paneStyles.content}
      refreshControl={
        <RefreshControl {...refreshControlProps(refresh.refreshing, refresh.onRefresh)} />
      }
    >
      {!hasTeams && !hasPlayers ? (
        <EmptyState
          icon="stats-chart-outline"
          title="İstatistik yok"
          body="Bu sezonda henüz oynanmış maç bulunmuyor. İlk maçlardan sonra liderler burada sıralanır."
        />
      ) : (
        <View style={styles.stack}>
          {standings.isError || scorers.isError || cards.isError ? (
            <ErrorState error={standings.error ?? scorers.error ?? cards.error} variant="banner" />
          ) : null}

          {summary.matches > 0 ? (
            <Reveal index={0}>
              <MetricGrid columns={3}>
                <MetricTile label="Maç" value={formatNumber(summary.matches)} icon="football-outline" />
                <MetricTile label="Gol" value={formatNumber(summary.goals)} icon="flame-outline" tone="brand" />
                <MetricTile
                  label="Gol/Maç"
                  value={formatDecimal(summary.perMatch, 2)}
                  icon="trending-up-outline"
                  tone="accent"
                />
                <MetricTile label="Asist" value={formatNumber(playerTotals.assists)} icon="git-pull-request-outline" />
                <MetricTile
                  label="Kart"
                  value={formatNumber(playerTotals.yellow + playerTotals.red)}
                  icon="albums-outline"
                  tone="warn"
                />
                <MetricTile label="Takım" value={formatNumber(summary.teams)} icon="shield-outline" />
              </MetricGrid>
            </Reveal>
          ) : null}

          {summary.matches > 0 ? (
            <Reveal index={1}>
              <SectionHeader title="Ligin karakteri" inset="flush" size="group" />
              <View style={styles.compare}>
                <SidesKey left="Galibiyetle biten" right="Berabere" />
                <StatBar
                  label="Maç sonucu"
                  home={Math.max(0, summary.matches - summary.draws)}
                  away={summary.draws}
                  animate={false}
                />
                {playerTotals.goals > 0 ? (
                  <>
                    <SidesKey left="Gol" right="Asist" />
                    <StatBar label="Gol · asist" home={playerTotals.goals} away={playerTotals.assists} animate={false} />
                  </>
                ) : null}
                {playerTotals.yellow + playerTotals.red > 0 ? (
                  <>
                    <SidesKey left="Sarı kart" right="Kırmızı kart" />
                    <StatBar label="Disiplin" home={playerTotals.yellow} away={playerTotals.red} animate={false} />
                  </>
                ) : null}
                <View style={styles.compareDivider} />
                <RatioLine
                  label="Beraberlik oranı"
                  value={summary.matches > 0 ? summary.draws / summary.matches : 0}
                  caption={`${formatNumber(summary.draws)} maç berabere bitti`}
                />
                {playerTotals.goals > 0 ? (
                  <RatioLine
                    label="Asistli gol oranı"
                    value={Math.min(1, playerTotals.assists / playerTotals.goals)}
                    caption={`${formatNumber(playerTotals.assists)} asist · ${formatNumber(playerTotals.goals)} oyuncu golü`}
                  />
                ) : null}
              </View>
            </Reveal>
          ) : null}

          {highlights.length > 0 ? (
            <Reveal index={2}>
              <SectionHeader title="Sezonun enleri" inset="flush" size="group" />
              <View style={styles.hlGrid}>
                {highlights.map((item) => (
                  <HighlightTile key={item.key} item={item} onPress={openHighlight} />
                ))}
              </View>
            </Reveal>
          ) : null}

          {hasPlayers ? (
            <View>
              <SectionHeader title="Oyuncu liderleri" inset="flush" size="group" />
              <View style={styles.cards}>
                <Leaderboard
                  title="Gol krallığı"
                  unit="Gol"
                  icon="football"
                  tone="gold"
                  kind="player"
                  entries={playerBoards.goals}
                  onPressEntry={openPlayer}
                  onSeeAll={onOpenPlayers ? () => onOpenPlayers("topScorers") : undefined}
                />
                <Leaderboard
                  title="Asist"
                  unit="Asist"
                  icon="git-pull-request"
                  tone="cyan"
                  kind="player"
                  entries={playerBoards.assists}
                  onPressEntry={openPlayer}
                />
                <Leaderboard
                  title="Kart"
                  unit="Kart"
                  icon="albums"
                  tone="red"
                  kind="player"
                  entries={playerBoards.discipline}
                  onPressEntry={openPlayer}
                  onSeeAll={onOpenPlayers ? () => onOpenPlayers("mostCards") : undefined}
                />
              </View>
            </View>
          ) : null}

          {hasTeams ? (
            <View>
              <SectionHeader title="Takım liderleri" inset="flush" size="group" />
              <View style={styles.cards}>
                <Leaderboard
                  title="Hücum"
                  unit="Atılan gol"
                  icon="flash"
                  tone="pink"
                  kind="team"
                  entries={teamBoards.attack}
                  onPressEntry={openTeam}
                  onSeeAll={onOpenStandings}
                />
                <Leaderboard
                  title="Savunma"
                  unit="Yenilen gol"
                  icon="shield-checkmark"
                  tone="mint"
                  kind="team"
                  entries={teamBoards.defense}
                  invert
                  onPressEntry={openTeam}
                />
                <Leaderboard
                  title="Form"
                  unit="Puan · son 5"
                  icon="pulse"
                  tone="violet"
                  kind="team"
                  entries={teamBoards.form}
                  onPressEntry={openTeam}
                />
              </View>
            </View>
          ) : null}
        </View>
      )}
    </ScrollView>
  );
}

const SKELETON_TILES = ["t1", "t2", "t3", "t4", "t5", "t6"] as const;

const styles = StyleSheet.create({
  stack: {
    gap: space.xl,
  },
  cards: {
    gap: space.md,
  },
  skeletonGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.sm,
  },
  skeletonTile: {
    width: "31.5%",
  },
  /* — Karşılaştırma kartı — */
  compare: {
    gap: space.s,
    padding: space.md,
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  compareDivider: {
    height: hairline,
    backgroundColor: colors.separator,
    marginVertical: space.s,
  },
  sides: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: space.xs,
  },
  sideText: {
    ...type.overline,
    color: colors.textTertiary,
    flexShrink: 1,
  },
  sideLeft: {
    color: colors.accentText,
  },
  sideRight: {
    textAlign: "right",
  },
  ratio: {
    gap: space.s,
    paddingVertical: space.xs,
  },
  ratioTop: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
  },
  ratioLabel: {
    ...type.h4,
    color: colors.textPrimary,
  },
  ratioValue: {
    ...type.scoreSm,
    color: colors.brandAccent,
  },
  ratioCaption: {
    ...type.caption,
    color: colors.textTertiary,
  },
  /* — Sezonun enleri — */
  hlGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.sm,
  },
  hl: {
    width: "48.6%",
    flexGrow: 1,
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  hlTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  hlLabel: {
    ...type.overline,
    color: colors.textTertiary,
    flex: 1,
  },
  hlValueRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: space.xs,
  },
  hlValue: {
    ...type.scoreLg,
    color: colors.textPrimary,
  },
  hlUnit: {
    ...type.caption,
    color: colors.textTertiary,
  },
  hlWho: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.s,
  },
  hlName: {
    ...type.labelSm,
    color: colors.textSecondary,
    flex: 1,
  },
});
