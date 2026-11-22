/**
 * Maç detayının paylaşım girişi — oynanmamış maçta MAÇ GÜNÜ (Afiş · Karşı
 * karşıya · Geri sayım), biten maçta MAÇ SONUCU (Skor · Kazanan · Golcüler ·
 * Künye · İstatistik · Maçın yıldızı · Golcü; veri yoksa ilgili tasarım
 * listeden düşer). Veri sayfanın zaten türettiği değerlerden gelir; ek istek
 * atılmaz.
 */

import React, { useMemo } from "react";
import { instagramUrl } from "@/lib/socials";
import type { StatRow, TopPlayer } from "@/lib/matchStats";
import type { ApiMatch } from "@/lib/types";
import { ShareStudio } from "./ShareStudio";
import { matchTemplates, type MatchShareData } from "./templates/match";

type Line = { name: string; minute: number | null; ownGoal?: boolean };

export function instagramHandle(city?: string | null): string | null {
  const url = instagramUrl(city);
  const handle = url?.split("instagram.com/")[1]?.replace(/\/+$/, "");
  return handle ? `@${handle}` : null;
}

export interface MatchShareProps {
  visible: boolean;
  onClose: () => void;
  match: ApiMatch;
  finished: boolean;
  homeScore: number | null;
  awayScore: number | null;
  homeLogo: string | null;
  awayLogo: string | null;
  homeTeamId: number | null;
  awayTeamId: number | null;
  scorers: { home: Line[]; away: Line[] };
  bestPlayers: TopPlayer[];
  stats: StatRow[];
}

export function MatchShare({
  visible,
  onClose,
  match,
  finished,
  homeScore,
  awayScore,
  homeLogo,
  awayLogo,
  homeTeamId,
  awayTeamId,
  scorers,
  bestPlayers,
  stats,
}: MatchShareProps) {
  const data = useMemo<MatchShareData>(() => {
    const home = { name: match.first_team_name, logo: homeLogo };
    const away = { name: match.second_team_name, logo: awayLogo };
    const top = bestPlayers[0] ?? null;
    const teamOf = (teamId: number | null) =>
      teamId != null ? (Number(teamId) === homeTeamId ? home : Number(teamId) === awayTeamId ? away : null) : null;
    const mvpTeam = teamOf(top?.teamId ?? null);
    return {
      id: match.id,
      home,
      away,
      homeScore,
      awayScore,
      finished,
      date: match.date,
      time: match.time,
      venue: match.match_field ?? null,
      league: match.league_name ?? null,
      season: match.match_season ?? null,
      city: match.city ?? null,
      footer: instagramHandle(match.city) ?? match.city ?? null,
      scorers: { home: scorers.home, away: scorers.away },
      mvp: top
        ? { name: top.name, image: top.image, goals: top.goals, assists: top.assists, rating: top.rating, team: mvpTeam }
        : null,
      players: bestPlayers.map((p) => ({ name: p.name, image: p.image, goals: p.goals, assists: p.assists, rating: p.rating, team: teamOf(p.teamId) })),
      stats,
    };
  }, [awayLogo, awayScore, awayTeamId, bestPlayers, finished, homeLogo, homeScore, homeTeamId, match, scorers, stats]);

  const templates = useMemo(() => matchTemplates(data), [data]);

  return (
    <ShareStudio
      visible={visible}
      onClose={onClose}
      title={finished ? "Maç sonucu" : "Maç günü"}
      subtitle={`${match.first_team_name} – ${match.second_team_name}`}
      templates={templates}
      fileParts={[finished ? "mac-sonucu" : "mac-gunu", match.id]}
      initialTheme="gece"
    />
  );
}
