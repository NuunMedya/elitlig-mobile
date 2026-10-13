/**
 * FollowedSpotlight · FollowedHint — Skorlar listesinin tepesi.
 *
 *   FollowedSpotlight  Takip edilen takımın CANLI ya da BUGÜNKÜ maçı, grafit
 *                      sahnede (`SpotlightCard`). Ekrandaki TEK sahne budur ve
 *                      listenin en üstündedir (Arena: sahne bir kez, tepede).
 *                      Takip edilen takımın o gün maçı yoksa vitrin YOKTUR —
 *                      yerine "sıradaki lig maçı" gibi bir yedek uydurulmaz.
 *   FollowedHint       "Takip ettiklerin" grubu boşken çizilen tek satırlık
 *                      ince ipucu. Boş bir kart ya da yer tutucu satır yerine
 *                      durumu söyler ve tek eylem verir.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { memo, useCallback } from "react";
import { StyleSheet, Text, View } from "react-native";

import { SpotlightCard, Touchable, matchDayLabel } from "@/components/ui";
import { formatDayHeading, formatTime } from "@/lib/format";
import { matchState } from "@/lib/match";
import type { ApiMatch } from "@/lib/types";
import { colors, fonts, hairline, radius, space, textScale, type } from "@/theme";
import { matchDay } from "./scoreUtils";

export interface FollowedSpotlightProps {
  match: ApiMatch;
  homeLogo: string | null;
  awayLogo: string | null;
  onOpen: (match: ApiMatch) => void;
}

export const FollowedSpotlight = memo(function FollowedSpotlight({
  match,
  homeLogo,
  awayLogo,
  onOpen,
}: FollowedSpotlightProps) {
  const state = matchState(match);
  const live = state === "live";
  const scheduled = state === "scheduled";
  const handlePress = useCallback(() => onOpen(match), [onOpen, match]);

  // Etiket "Canlı" OLAMAZ: rozet zaten "CANLI" yazıyor.
  const eyebrow = live ? "Takımın sahada" : scheduled ? "Takımının bugünkü maçı" : "Takımın bugün oynadı";

  return (
    <View style={styles.spotWrap}>
      <SpotlightCard
        eyebrow={eyebrow}
        context={match.league_name || undefined}
        live={live}
        home={{
          name: match.first_team_name || "Ev sahibi",
          logo: homeLogo,
          score: scheduled ? null : match.first_team_score,
        }}
        away={{
          name: match.second_team_name || "Deplasman",
          logo: awayLogo,
          score: scheduled ? null : match.second_team_score,
        }}
        statusText={formatTime(match.time) || undefined}
        statusCaption={matchDayLabel(match.date) || undefined}
        footnote={[formatDayHeading(matchDay(match)), match.match_field].filter(Boolean).join(" · ")}
        onPress={handlePress}
        testID="scores-spotlight"
      />
    </View>
  );
});

export interface FollowedHintProps {
  text: string;
  actionLabel?: string;
  onAction?: () => void;
}

export const FollowedHint = memo(function FollowedHint({ text, actionLabel, onAction }: FollowedHintProps) {
  return (
    <View style={styles.hint} testID="followed-hint">
      <Ionicons name="star-outline" size={14} color={colors.textTertiary} />
      <Text style={styles.hintText} numberOfLines={1} {...textScale.dense}>
        {text}
      </Text>
      {actionLabel && onAction ? (
        <Touchable
          feedback="chip"
          haptic="selection"
          onPress={onAction}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          style={styles.hintAction}
        >
          <Text style={styles.hintActionText} {...textScale.dense}>
            {actionLabel}
          </Text>
        </Touchable>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  spotWrap: {
    paddingTop: space.lg,
  },
  hint: {
    marginTop: space.lg,
    height: 40,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingLeft: space.md,
    paddingRight: space.xs,
    borderRadius: radius.md,
    borderWidth: hairline,
    borderColor: colors.border,
    borderStyle: "dashed",
  },
  hintText: {
    ...type.bodySm,
    color: colors.textSecondary,
    flex: 1,
  },
  hintAction: {
    height: 32,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  hintActionText: {
    ...type.label,
    fontFamily: fonts.semibold,
    color: colors.brandAccent,
  },
});
