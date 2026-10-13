/**
 * StatsPane — sezonun lider tabloları (Lig merkezinin "İstatistik" bölmesi).
 *
 * ESKİ HÂL: her kategoriden yalnız BİRİNCİ, menü satırı biçiminde
 * ("CAPITAL FC · EN GOLCÜ ›"). Kimin ne kadar önde olduğu okunmuyordu.
 *
 * YENİ DÜZEN — ÜÇ KATMAN:
 *   1. Sezon özeti: oynanan maç · atılan gol · maç başı gol (MetricGrid).
 *      Puan tablosundan türetilir; her maç iki takımın "O" sütununda
 *      sayıldığı için maç sayısı ΣO / 2'dir.
 *   2. Takım liderleri: Hücum (atılan gol), Savunma (yenilen gol — az olan
 *      önde, çubuk ters), Form (son beş maçtan alınan puan).
 *   3. Oyuncu liderleri: Gol krallığı, Asist, Kart. Asist için ayrı uç yok;
 *      gol sıralaması yanıtı kapsamın TÜM oyuncularını ve asist alanını
 *      taşıdığı için asist sıralaması aynı yanıttan istemcide kurulur.
 *
 * Her kart ilk beşi gösterir ve "Tüm sıralama" ile ilgili bölmeye (Puan ya da
 * Oyuncular, doğru ölçütle) geçer.
 *
 * Hükmen maç kayıtları (`JUNK_PLAYER`) oyuncu tablolarından ayıklanır; aksi
 * hâlde gol krallığını "HÜKMEN 1" kazanıyordu.
 */

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useCallback, useMemo } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import {
  EmptyState,
  ErrorState,
  MetricGrid,
  MetricTile,
  SkeletonCard,
  refreshControlProps,
  useRefresh,
} from "@/components/ui";
import { getPlayerRankings } from "@/lib/api/players";
import { getStandings } from "@/lib/api/standings";
import { queryKeys } from "@/lib/queryKeys";
import type { PlayerRankRow, PlayerSort, StandingRow } from "@/lib/types";
import { useScope } from "@/providers/ScopeProvider";
import { layout, space } from "@/theme";
import { Leaderboard, type LeaderEntry } from "./Leaderboard";
import { JUNK_PLAYER, PaneLabel, ScopeMissing, num, paneStyles, useScopeKey, type PaneProps } from "./shared";

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

/** Türkçe ondalık: 3.42 → "3,42". */
const decimal = (value: number, digits = 2) => value.toFixed(digits).replace(".", ",");

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

  /* — Sezon özeti — */
  const summary = useMemo(() => {
    const rows = standings.data ?? [];
    const played = rows.reduce((sum, row) => sum + num(row.played), 0);
    const goals = rows.reduce((sum, row) => sum + num(row.goals_for), 0);
    const matches = Math.round(played / 2);
    return { matches, goals, perMatch: matches > 0 ? goals / matches : 0 };
  }, [standings.data]);

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

  const openTeam = useCallback((id: number) => router.push(`/takim/${id}`), [router]);
  const openPlayer = useCallback((id: number) => router.push(`/oyuncu/${id}`), [router]);

  const loading = standings.isLoading || scorers.isLoading || cards.isLoading;
  const hasTeams = teamBoards.attack.length > 0;
  const hasPlayers =
    playerBoards.goals.length + playerBoards.assists.length + playerBoards.discipline.length > 0;

  if (!scope.ready && !scope.loading) return <ScopeMissing />;
  if (loading || scope.loading) {
    return (
      <View style={paneStyles.skeleton}>
        <SkeletonCard lines={1} />
        <SkeletonCard lines={5} />
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
            <MetricGrid columns={3}>
              <MetricTile label="Maç" value={String(summary.matches)} icon="football-outline" />
              <MetricTile label="Gol" value={String(summary.goals)} icon="flame-outline" />
              <MetricTile
                label="Gol / Maç"
                value={decimal(summary.perMatch)}
                tone="accent"
                icon="trending-up-outline"
              />
            </MetricGrid>
          ) : null}

          {hasPlayers ? (
            <View>
              <PaneLabel title="Oyuncu liderleri" />
              <View style={styles.cards}>
                <Leaderboard
                  title="Gol krallığı"
                  unit="Gol"
                  icon="football"
                  kind="player"
                  entries={playerBoards.goals}
                  onPressEntry={openPlayer}
                  onSeeAll={onOpenPlayers ? () => onOpenPlayers("topScorers") : undefined}
                />
                <Leaderboard
                  title="Asist"
                  unit="Asist"
                  icon="git-pull-request-outline"
                  kind="player"
                  entries={playerBoards.assists}
                  onPressEntry={openPlayer}
                />
                <Leaderboard
                  title="Kart"
                  unit="Kart"
                  icon="albums-outline"
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
              <PaneLabel title="Takım liderleri" />
              <View style={styles.cards}>
                <Leaderboard
                  title="Hücum"
                  unit="Atılan gol"
                  icon="flash-outline"
                  kind="team"
                  entries={teamBoards.attack}
                  onPressEntry={openTeam}
                  onSeeAll={onOpenStandings}
                />
                <Leaderboard
                  title="Savunma"
                  unit="Yenilen gol"
                  icon="shield-checkmark-outline"
                  kind="team"
                  entries={teamBoards.defense}
                  invert
                  onPressEntry={openTeam}
                />
                <Leaderboard
                  title="Form"
                  unit="Puan · son 5"
                  icon="pulse-outline"
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

const styles = StyleSheet.create({
  stack: {
    gap: layout.sectionGap,
  },
  cards: {
    gap: space.md,
  },
});
