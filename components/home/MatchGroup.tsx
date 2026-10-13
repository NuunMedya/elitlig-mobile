/**
 * MatchGroup — birkaç maçın GRUPLU satır listesi (Ana Sayfa kesitleri).
 *
 * `MatchCard variant="compact"` satırlarını `position` ile tek bir kart gibi
 * dizer: ilk satır üst köşeleri, son satır alt köşeleri çizer, aradakiler
 * ayraç taşır. Kesitler kısa olduğu (en fazla beş satır) için sanal liste
 * gerekmez; satırlar düz `View` içinde çizilir.
 */

import React from "react";
import { View } from "react-native";
import { MatchCard } from "@/components/ui";
import type { ApiMatch } from "@/lib/types";

export interface MatchGroupProps {
  matches: ApiMatch[];
  logoFor: (teamId: number | null | undefined, teamName: string | null | undefined) => string | null;
  onOpen: (matchId: number) => void;
  /** Sol sütunda gün etiketi — farklı günlerden maçlar karışıyorsa. */
  showDate?: boolean;
  showVenue?: boolean;
  highlightTeamId?: number | null;
  highlightTeamName?: string | null;
}

function positionOf(index: number, total: number): "single" | "first" | "middle" | "last" {
  if (total <= 1) return "single";
  if (index === 0) return "first";
  if (index === total - 1) return "last";
  return "middle";
}

export const MatchGroup = React.memo(function MatchGroup({
  matches,
  logoFor,
  onOpen,
  showDate = false,
  showVenue = false,
  highlightTeamId,
  highlightTeamName,
}: MatchGroupProps) {
  return (
    <View>
      {matches.map((match, index) => (
        <MatchCard
          key={match.id}
          variant="compact"
          position={positionOf(index, matches.length)}
          match={match}
          homeLogo={logoFor(match.home_team_id, match.first_team_name)}
          awayLogo={logoFor(match.away_team_id, match.second_team_name)}
          showDate={showDate}
          showVenue={showVenue}
          highlightTeamId={highlightTeamId}
          highlightTeamName={highlightTeamName}
          onPress={() => onOpen(Number(match.id))}
        />
      ))}
    </View>
  );
});
