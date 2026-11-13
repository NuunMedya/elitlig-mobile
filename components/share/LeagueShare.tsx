/**
 * Lig sayfasının paylaşım girişi — açık sekmeye göre:
 *
 *   Puan       → puan durumu (10 takımlık pencere: takımın varsa onu
 *                ortalayan dilim, yoksa "kaçıncı sıradan kaçıncı sıraya?")
 *   Oyuncular  → gol krallığı / asist krallığı / … (aynı pencere mantığı;
 *                kendin ya da takımından en iyi sıradaki oyuncu odaktır)
 *   Fikstür    → seçilen günün maç programı / sonuçları
 *
 * Veri bölmelerin kullandığı sorgu anahtarlarıyla çekilir; bölme açıksa
 * React Query önbelleği doğrudan kullanılır, ek istek atılmaz.
 */

import { useQuery } from "@tanstack/react-query";
import React, { useEffect, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";

import { Chip, ChipGroup } from "@/components/ui";
import { useTeamLogos } from "@/hooks/useTeamLogos";
import { getMatches } from "@/lib/api/matches";
import { getPlayerRankings } from "@/lib/api/players";
import { getStandings } from "@/lib/api/standings";
import { formatDayHeading } from "@/lib/format";
import { matchState } from "@/lib/match";
import { queryKeys } from "@/lib/queryKeys";
import { clampRange, focusWindow, num } from "@/lib/share/format";
import type { ApiMatch, PlayerRankRow, PlayerSort } from "@/lib/types";
import { useScope } from "@/providers/ScopeProvider";
import { space } from "@/theme";
import { instagramHandle } from "./MatchShare";
import { MAX_ROWS, RangeSetup, type RangeMode } from "./RangeSetup";
import { ShareStudio } from "./ShareStudio";
import { fixturesTemplates } from "./templates/fixtures";
import { playersTemplates, type RankedPlayer } from "./templates/players";
import { tableTemplates } from "./templates/table";
import { pickFocusTeam, useShareFocus } from "./useShareFocus";

export type LeagueShareTab = "puan" | "oyuncular" | "fikstur";

/* Oyuncular bölmesindeki ölçütlerin paylaşılabilir olanları — sıralama
   kuralları bölmedekiyle aynı (değer, sonra gol, sonra maç). */
type MetricKey = "topScorers" | "mostAssists" | "mostValuable" | "mostMatches" | "goalsPerMatch";
const goals = (r: PlayerRankRow) => num(r.goals);
const assists = (r: PlayerRankRow) => num(r.assists);
const matches = (r: PlayerRankRow) => num(r.matches);
const points = (r: PlayerRankRow) => num(r.points);
const METRICS: { key: MetricKey; label: string; unit: string; value: (r: PlayerRankRow) => number; text: (r: PlayerRankRow) => string; tie: ((r: PlayerRankRow) => number)[] }[] = [
  { key: "topScorers", label: "Gol krallığı", unit: "gol", value: goals, text: (r) => String(goals(r)), tie: [assists, matches] },
  { key: "mostAssists", label: "Asist krallığı", unit: "asist", value: assists, text: (r) => String(assists(r)), tie: [goals, matches] },
  { key: "mostValuable", label: "En değerliler", unit: "puan", value: points, text: (r) => String(points(r)), tie: [goals, matches] },
  { key: "mostMatches", label: "En çok maç", unit: "maç", value: matches, text: (r) => String(matches(r)), tie: [goals] },
  {
    key: "goalsPerMatch",
    label: "Gol / maç",
    unit: "gol/maç",
    value: (r) => num(r.goalsPerMatch),
    text: (r) => num(r.goalsPerMatch).toFixed(2).replace(".", ","),
    tie: [goals, matches],
  },
];
const JUNK_PLAYER = /hükmen|hukmen|antpl/i;

const dayKeyOf = (match: ApiMatch) => String(match.date ?? "").slice(0, 10);

export interface LeagueShareProps {
  visible: boolean;
  onClose: () => void;
  tab: LeagueShareTab;
  /** Oyuncular bölmesinin açılış ölçütü (İstatistik → "Tüm sıralama"). */
  initialSort?: PlayerSort;
}

export function LeagueShare({ visible, onClose, tab, initialSort }: LeagueShareProps) {
  const scope = useScope();
  const teams = useTeamLogos();
  const focus = useShareFocus(visible);
  const scopeKey = useMemo(
    () => ({ cityId: scope.cityId ?? undefined, leagueId: scope.leagueId ?? undefined, seasonId: scope.seasonId ?? undefined }),
    [scope.cityId, scope.leagueId, scope.seasonId],
  );
  const footer = instagramHandle(scope.cityLabel) ?? scope.cityLabel ?? null;
  const common = { league: scope.leagueLabel || null, season: scope.seasonLabel || null, city: scope.cityLabel || null, footer };

  /* ---- sorgular: bölmelerle aynı anahtar ---- */
  const standingsQuery = useQuery({
    queryKey: queryKeys.standings(scopeKey),
    queryFn: () => getStandings({ cityId: scope.cityId as number, leagueId: scope.leagueId as number, seasonId: scope.seasonId as number }),
    enabled: visible && tab === "puan" && scope.ready,
    staleTime: 60_000,
  });
  const rankingsQuery = useQuery({
    queryKey: queryKeys.playerRankings(scopeKey, "topScorers"),
    queryFn: () => getPlayerRankings(scopeKey, "topScorers"),
    enabled: visible && tab === "oyuncular" && scope.ready,
    staleTime: 60_000,
  });
  const matchesQuery = useQuery({
    queryKey: queryKeys.matches(scopeKey),
    queryFn: () => getMatches({ leagueId: scope.leagueId ?? undefined, seasonId: scope.seasonId ?? undefined, limit: 1000 }),
    enabled: visible && tab === "fikstur" && scope.ready,
    staleTime: 60_000,
  });

  /* ---- pencere ayarı (puan + oyuncular) ---- */
  const [mode, setMode] = useState<RangeMode>("focus");
  const [range, setRange] = useState<[number, number]>([1, MAX_ROWS]);
  const [metric, setMetric] = useState<MetricKey>(
    initialSort && METRICS.some((m) => m.key === initialSort) ? (initialSort as MetricKey) : "topScorers",
  );

  /* ---- Puan ---- */
  const standings = useMemo(() => standingsQuery.data ?? [], [standingsQuery.data]);
  const focusTeamId = useMemo(
    () => pickFocusTeam(focus, (id) => standings.some((row) => Number(row.team_id) === id)),
    [focus, standings],
  );

  /* ---- Oyuncular ---- */
  const active = METRICS.find((m) => m.key === metric) ?? METRICS[0];
  const ranked = useMemo(() => {
    const list = (rankingsQuery.data?.players ?? []).filter((p) => p.name && !JUNK_PLAYER.test(p.name));
    const keys = [active.value, ...active.tie];
    return [...list].sort((a, b) => {
      for (const key of keys) {
        const diff = key(b) - key(a);
        if (diff) return diff;
      }
      return 0;
    });
  }, [active, rankingsQuery.data]);
  const focusPlayerId = useMemo(() => {
    if (focus.playerId && ranked.some((p) => Number(p.id) === focus.playerId)) return focus.playerId;
    const team = pickFocusTeam(focus, (id) => ranked.some((p) => Number(p.teamId) === id));
    return team != null ? Number(ranked.find((p) => Number(p.teamId) === team)?.id) || null : null;
  }, [focus, ranked]);
  /* Kip düğmesinin etiketi kısa tutulur (iki parçalı seçici dar). */
  const focusName = tab === "oyuncular" && focusPlayerId != null && focusPlayerId === focus.playerId ? "Benim sıram" : "Takımım";

  const total = tab === "puan" ? standings.length : ranked.length;
  const focusRank =
    tab === "puan"
      ? focusTeamId != null
        ? standings.findIndex((r) => Number(r.team_id) === focusTeamId) + 1
        : 0
      : focusPlayerId != null
        ? ranked.findIndex((p) => Number(p.id) === focusPlayerId) + 1
        : 0;
  const useFocus = focusRank > 0 && mode === "focus";
  const [from, to] = useFocus ? focusWindow(total, focusRank, MAX_ROWS) : clampRange(total, range[0], range[1], MAX_ROWS);

  // Liste değişince (lig/sezon) seçilen aralık yeni boya oturur.
  useEffect(() => {
    if (total > 0 && range[0] > total) setRange(clampRange(total, 1, MAX_ROWS, MAX_ROWS));
  }, [range, total]);

  /* ---- Fikstür ---- */
  const days = useMemo(() => {
    const map = new Map<string, ApiMatch[]>();
    for (const match of matchesQuery.data ?? []) {
      const key = dayKeyOf(match);
      if (!key) continue;
      map.set(key, [...(map.get(key) ?? []), match]);
    }
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  }, [matchesQuery.data]);
  const todayKey = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }, []);
  const defaultDay = useMemo(() => {
    const next = days.find(([key, list]) => key >= todayKey && list.some((m) => matchState(m) !== "finished"));
    return (next ?? days.filter(([key]) => key <= todayKey).pop() ?? days[0])?.[0] ?? null;
  }, [days, todayKey]);
  const [pickedDay, setPickedDay] = useState<string | null>(null);
  const day = pickedDay && days.some(([key]) => key === pickedDay) ? pickedDay : defaultDay;
  /* Gün şeridi: seçili günün çevresindeki 12 gün (sezon yüzlerce gün olabilir). */
  const dayChips = useMemo(() => {
    const index = Math.max(0, days.findIndex(([key]) => key === day));
    const start = Math.max(0, Math.min(index - 5, days.length - 12));
    return days.slice(start, start + 12);
  }, [day, days]);

  /* ---- şablonlar ---- */
  const templates = useMemo(() => {
    if (tab === "puan") {
      if (!standings.length) return [];
      return tableTemplates({
        rows: standings.map((row) => ({ ...row, logo: row.logo || teams.logoFor(row.team_id, row.team_name) })),
        from,
        to,
        focusTeamId,
        ...common,
      });
    }
    if (tab === "oyuncular") {
      if (!ranked.length) return [];
      const rows: RankedPlayer[] = ranked.slice(from - 1, to).map((p, index) => ({
        rank: from + index,
        id: Number(p.id),
        name: p.name,
        image: p.image ?? null,
        teamName: p.teamName ?? null,
        teamLogo: teams.logoFor(p.teamId ?? null, p.teamName ?? null),
        value: active.text(p),
        amount: active.value(p),
        sub: null,
      }));
      return playersTemplates({ rows, metricLabel: active.label, unit: active.unit, focusId: focusPlayerId, ...common });
    }
    const list = (days.find(([key]) => key === day)?.[1] ?? []).slice().sort((a, b) => String(a.time).localeCompare(String(b.time)));
    if (!list.length) return [];
    const allDone = list.every((m) => matchState(m) === "finished");
    return fixturesTemplates({
      title: formatDayHeading(day),
      kicker: allDone ? "Sonuçlar" : "Maç programı",
      matches: list.map((m) => ({
        id: m.id,
        home: { name: m.first_team_name, logo: teams.logoFor(m.home_team_id, m.first_team_name) },
        away: { name: m.second_team_name, logo: teams.logoFor(m.away_team_id, m.second_team_name) },
        homeScore: m.first_team_score,
        awayScore: m.second_team_score,
        finished: matchState(m) === "finished",
        time: m.time,
        venue: m.match_field ?? null,
      })),
      ...common,
    });
    // `common` her çizimde yeni bir nesne; içeriği kapsam etiketlerinden gelir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, standings, ranked, from, to, focusTeamId, focusPlayerId, active, days, day, teams, scope.leagueLabel, scope.seasonLabel, scope.cityLabel]);

  const loading =
    !scope.ready ||
    (tab === "puan" && standingsQuery.isLoading) ||
    (tab === "oyuncular" && rankingsQuery.isLoading) ||
    (tab === "fikstur" && matchesQuery.isLoading);

  const setup =
    tab === "fikstur" ? (
      dayChips.length > 1 ? (
        <ChipGroup contentPadding={0}>
          {dayChips.map(([key]) => (
            <Chip key={key} size="sm" label={formatDayHeading(key)} selected={key === day} onPress={() => setPickedDay(key)} />
          ))}
        </ChipGroup>
      ) : null
    ) : total > 0 ? (
      <View style={styles.setup}>
        {tab === "oyuncular" ? (
          <ChipGroup contentPadding={0}>
            {METRICS.map((m) => (
              <Chip key={m.key} size="sm" label={m.label} selected={m.key === metric} onPress={() => setMetric(m.key)} />
            ))}
          </ChipGroup>
        ) : null}
        <RangeSetup
          total={total}
          from={useFocus ? from : range[0]}
          to={useFocus ? to : range[1]}
          onChange={(a, b) => setRange([a, b])}
          focusLabel={focusRank > 0 ? focusName : null}
          mode={mode}
          onMode={(next) => {
            if (next === "range") setRange([from, to]);
            setMode(next);
          }}
          noun={tab === "puan" ? "takım" : "oyuncu"}
        />
      </View>
    ) : null;

  const title = tab === "puan" ? "Puan durumu" : tab === "oyuncular" ? active.label : "Fikstür";
  return (
    <ShareStudio
      visible={visible}
      onClose={onClose}
      title={title}
      subtitle={[scope.leagueLabel, scope.seasonLabel].filter(Boolean).join(" · ")}
      templates={templates}
      fileParts={[tab === "puan" ? "puan-durumu" : tab === "oyuncular" ? metric : "fikstur", scope.leagueLabel]}
      setup={setup}
      status={
        loading
          ? { kind: "loading" }
          : templates.length === 0
            ? { kind: "empty", message: tab === "fikstur" ? "Bu ligde paylaşılacak maç yok." : "Bu sezonda paylaşılacak sıralama yok." }
            : null
      }
    />
  );
}

const styles = StyleSheet.create({
  setup: {
    gap: space.sm,
  },
});
