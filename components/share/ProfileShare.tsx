/**
 * Profil sayfalarının paylaşım girişleri.
 *
 *   TeamShare    — takım sayfası: Sezon kartı · Sıra rozeti · Puan tablosu
 *                  (takımı ortalayan 10'luk pencere) · Takım odağı
 *   PlayerShare  — oyuncu sayfası: Oyuncu kartı · Poster
 *   WeeklyShare  — haftanın enleri: Haftanın oyuncusu · Kadro · Ödüller
 *
 * Veriler sayfanın elindeki sorgu sonuçlarıdır; ek istek atılmaz.
 */

import React, { useMemo } from "react";

import { useTeamLogos } from "@/hooks/useTeamLogos";
import type { WeeklyAwardItem, WeeklyAwardSet } from "@/lib/api/weeklyAwards";
import { focusWindow, num } from "@/lib/share/format";
import type { StandingRow } from "@/lib/types";
import { useScope } from "@/providers/ScopeProvider";
import { instagramHandle } from "./MatchShare";
import { ShareStudio } from "./ShareStudio";
import { playerTemplates, teamTemplates } from "./templates/profiles";
import { tableTemplates } from "./templates/table";
import { weeklyTemplates, type WeeklyPerson } from "./templates/weekly";

/* ══════════════════════════ TAKIM ══════════════════════════ */

export interface TeamShareProps {
  visible: boolean;
  onClose: () => void;
  teamId: number;
  name: string;
  logo: string | null;
  league: string | null;
  season: string | null;
  city: string | null;
  /** Takımın ligindeki puan tablosu (sayfanın sorgusu). */
  standings: StandingRow[] | undefined;
}

export function TeamShare({ visible, onClose, teamId, name, logo, league, season, city, standings }: TeamShareProps) {
  const teams = useTeamLogos();
  const templates = useMemo(() => {
    const rows = standings ?? [];
    const index = rows.findIndex((row) => Number(row.team_id) === teamId);
    const row = index >= 0 ? rows[index] : null;
    const footer = instagramHandle(city) ?? city;
    const list = teamTemplates({
      name,
      logo,
      league,
      season,
      city,
      footer,
      rank: row ? index + 1 : null,
      teams: rows.length,
      points: row ? num(row.display_points) : null,
      played: num(row?.played),
      wins: num(row?.wins),
      draws: num(row?.draws),
      losses: num(row?.losses),
      goalsFor: num(row?.goals_for),
      goalsAgainst: num(row?.goals_against),
      last5: row?.last5 ?? "",
    });
    if (row) {
      const [from, to] = focusWindow(rows.length, index + 1, 10);
      const table = tableTemplates({
        rows: rows.map((item) => ({ ...item, logo: item.logo || teams.logoFor(item.team_id, item.team_name) })),
        from,
        to,
        focusTeamId: teamId,
        league,
        season,
        city,
        footer,
      });
      list.push({ ...table[0], label: "Puan tablosu" }, { ...table[1], label: "Tablo odağı" });
    }
    return list;
  }, [city, league, logo, name, season, standings, teamId, teams]);

  return (
    <ShareStudio
      visible={visible}
      onClose={onClose}
      title="Takım kartı"
      subtitle={[name, league].filter(Boolean).join(" · ")}
      templates={templates}
      fileParts={["takim", name]}
    />
  );
}

/* ══════════════════════════ OYUNCU ══════════════════════════ */

export interface PlayerShareProps {
  visible: boolean;
  onClose: () => void;
  name: string;
  image: string | null;
  position: string | null;
  jersey: number | null;
  teamName: string | null;
  teamLogo: string | null;
  matches: number;
  goals: number;
  assists: number | null;
  average: number | null;
  wins: number;
  draws: number;
  losses: number;
  city: string | null;
}

export function PlayerShare(props: PlayerShareProps) {
  const scope = useScope();
  const { visible, onClose, ...data } = props;
  const templates = useMemo(
    () =>
      playerTemplates({
        ...data,
        league: scope.leagueLabel || null,
        city: data.city ?? scope.cityLabel ?? null,
        footer: instagramHandle(data.city ?? scope.cityLabel) ?? data.city ?? null,
      }),
    // Alanlar tek tek izlenir; `data` her çizimde yeni bir nesne.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scope.leagueLabel, scope.cityLabel, ...Object.values(data)],
  );
  return (
    <ShareStudio
      visible={visible}
      onClose={onClose}
      title="Oyuncu kartı"
      subtitle={[data.name, data.teamName].filter(Boolean).join(" · ")}
      templates={templates}
      fileParts={["oyuncu", data.name]}
    />
  );
}

/* ══════════════════════════ HAFTANIN ENLERİ ══════════════════════════ */

const AWARD_LABELS: Record<string, string> = {
  WEEKLY_PLAYER: "Haftanın oyuncusu",
  WEEKLY_GOALKEEPER: "Haftanın kalecisi",
  WEEKLY_DEFENDER: "Haftanın defansı",
  WEEKLY_MIDFIELDER: "Haftanın orta sahası",
  WEEKLY_FORWARD: "Haftanın forveti",
  WEEKLY_FAIR_PLAY: "Fair play",
  WEEKLY_TEAM: "Haftanın takımı",
};
const AWARD_ORDER = Object.keys(AWARD_LABELS);

const LINE_OF: Record<string, WeeklyPerson["line"]> = { GK: "GK", DEF: "DEF", MID: "MID", FWD: "FWD" };

function person(item: WeeklyAwardItem): WeeklyPerson {
  const slot = String(item.position_slot ?? "").replace(/\d+$/, "").toUpperCase();
  const isTeam = !item.player_id && Boolean(item.team_id || item.team_name);
  return {
    id: item.id,
    award: item.award_type,
    label: AWARD_LABELS[item.award_type] ?? "Ödül",
    name: item.player_name ?? item.team_name ?? "—",
    image: item.player_img,
    isTeam,
    teamName: isTeam ? item.team_name : item.player_team_name,
    teamLogo: isTeam ? item.team_logo : item.player_team_logo,
    line: LINE_OF[slot] ?? null,
    goals: num(item.stats?.goals),
    assists: num(item.stats?.assists),
    rating: item.stats?.rating ? Number(item.stats.rating) : null,
  };
}

export function WeeklyShare({
  visible,
  onClose,
  set,
  weekLabel,
}: {
  visible: boolean;
  onClose: () => void;
  set: WeeklyAwardSet | null;
  weekLabel: string;
}) {
  const scope = useScope();
  const templates = useMemo(() => {
    if (!set) return [];
    const items = set.items ?? [];
    const honors = items
      .filter((item) => item.award_type !== "WEEKLY_SQUAD_PLAYER")
      .sort((a, b) => AWARD_ORDER.indexOf(a.award_type) - AWARD_ORDER.indexOf(b.award_type))
      .map(person);
    const squad = items
      .filter((item) => item.award_type === "WEEKLY_SQUAD_PLAYER")
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map(person);
    return weeklyTemplates({
      week: weekLabel,
      formation: set.formation,
      star: honors.find((p) => p.award === "WEEKLY_PLAYER") ?? null,
      honors,
      squad,
      league: scope.leagueLabel || null,
      season: scope.seasonLabel || null,
      city: scope.cityLabel || null,
      footer: instagramHandle(scope.cityLabel) ?? scope.cityLabel ?? null,
    });
  }, [scope.cityLabel, scope.leagueLabel, scope.seasonLabel, set, weekLabel]);

  return (
    <ShareStudio
      visible={visible}
      onClose={onClose}
      title="Haftanın enleri"
      subtitle={[weekLabel, scope.leagueLabel].filter(Boolean).join(" · ")}
      templates={templates}
      fileParts={["haftanin-enleri", weekLabel]}
      status={templates.length ? null : { kind: "empty", message: "Bu hafta paylaşılacak ödül yok." }}
    />
  );
}
