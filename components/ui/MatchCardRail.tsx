/**
 * MatchCardRail — maç kartlarının YATAY şeridi.
 *
 * Özet ekranlarda (Ana Sayfa, takım genel bakışı) birkaç maçı alt alta dizmek
 * ekranın yarısını yiyordu. Şerit kartları yan yana koyar; bir sonraki kartın
 * kenarı görünür kalır ki kullanıcı kaydırılabildiğini anlasın. Tek maç
 * varsa kart tam genişlikte durur.
 */

import { memo } from "react";
import { ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { layout, space } from "@/theme";
import type { ApiMatch } from "@/lib/types";
import { MatchCard } from "./MatchCard";

export interface MatchCardRailProps {
  matches: ApiMatch[];
  logoFor: (teamId: number | null | undefined, teamName: string | null | undefined) => string | null;
  onOpen: (matchId: number) => void;
  showDate?: boolean;
  meta?: "league" | "field" | "none";
  highlightTeamId?: number | null;
  highlightTeamName?: string | null;
  /**
   * Ekran kenar dolgusu. Şerit kenardan kenara kayar (kabı dolgusuz olmalı),
   * ilk kart bu dolgudan başlar.
   */
  inset?: number;
}

export const MatchCardRail = memo(function MatchCardRail({
  matches,
  logoFor,
  onOpen,
  showDate = true,
  meta = "league",
  highlightTeamId,
  highlightTeamName,
  inset = layout.screenPadding,
}: MatchCardRailProps) {
  const { width } = useWindowDimensions();
  const single = matches.length === 1;
  const cardWidth = single ? width - inset * 2 : Math.min(320, Math.round((width - inset * 2) * 0.86));

  const cards = matches.map((match) => (
    <MatchCard
      key={match.id}
      match={match}
      homeLogo={logoFor(match.home_team_id, match.first_team_name)}
      awayLogo={logoFor(match.away_team_id, match.second_team_name)}
      meta={meta}
      showDate={showDate}
      highlightTeamId={highlightTeamId}
      highlightTeamName={highlightTeamName}
      onPress={() => onOpen(Number(match.id))}
      style={{ width: cardWidth }}
    />
  ));

  if (single) return <View style={{ paddingHorizontal: inset }}>{cards}</View>;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      decelerationRate="fast"
      snapToInterval={cardWidth + space.m}
      snapToAlignment="start"
      contentContainerStyle={[styles.content, { paddingHorizontal: inset }]}
    >
      {cards}
    </ScrollView>
  );
});

const styles = StyleSheet.create({
  content: {
    gap: space.m,
    paddingBottom: space.xs,
  },
});
