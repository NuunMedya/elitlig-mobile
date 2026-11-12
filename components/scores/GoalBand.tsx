/**
 * GoalBand — Skorlar'ın Canlı bakışında son atılan golü söyleyen tek satır.
 *
 * NEDEN PUSH'TAN DEĞİL YOKLAMADAN: gol push'u yalnız bildirime izin vermiş VE
 * o maçı/takımı takip eden kullanıcıya gider. Ekran açıkken golü herkesin
 * görmesi gerekir; bant iki yoklama arasındaki SKOR FARKINDAN üretilir (bkz.
 * `detectGoal`) — ek istek yok, izin gerekmez.
 *
 * Kırmızı yalnız "GOL" etiketinde ve ikonda: canlılık sinyali, süs değil.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { IconTile, Reveal, Touchable } from "@/components/ui";
import { colors, hairline, radius, space, textScale, touchSlop, type, upperTR } from "@/theme";
import type { GoalNews } from "./scoreUtils";

export interface GoalBandProps {
  goal: GoalNews;
  onOpen: () => void;
  onDismiss: () => void;
}

export const GoalBand = memo(function GoalBand({ goal, onOpen, onDismiss }: GoalBandProps) {
  return (
    <Reveal scaleFrom={0.94} distance={0} replayKey={goal.at}>
    <Touchable
      feedback="row"
      haptic="selection"
      onPress={onOpen}
      style={styles.band}
      accessibilityRole="button"
      accessibilityLabel={`Gol. ${goal.scoringTeam}. ${goal.homeTeam} ${goal.score} ${goal.awayTeam}. Maçı açmak için dokun.`}
      testID="goal-band"
    >
      <IconTile icon="football" tone="pink" size={32} />
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={1} {...textScale.badge}>
          {upperTR(`Gol · ${goal.scoringTeam}`)}
        </Text>
        <Text style={styles.text} numberOfLines={1} {...textScale.dense}>
          {goal.homeTeam} <Text style={styles.score}>{goal.score.replace("-", " – ")}</Text> {goal.awayTeam}
        </Text>
      </View>
      <Touchable
        feedback="icon"
        onPress={onDismiss}
        hitSlop={touchSlop(20)}
        accessibilityRole="button"
        accessibilityLabel="Gol bandını kapat"
      >
        <Ionicons name="close" size={16} color={colors.textSecondary} />
      </Touchable>
    </Touchable>
    </Reveal>
  );
});

const styles = StyleSheet.create({
  band: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    backgroundColor: colors.liveDim,
    borderRadius: radius.lg,
    borderWidth: hairline,
    borderColor: colors.liveGlow,
    paddingLeft: space.s,
    paddingRight: space.md,
    paddingVertical: space.s,
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    ...type.micro,
    color: colors.live,
  },
  text: {
    ...type.bodySm,
    color: colors.textPrimary,
  },
  score: {
    ...type.numSmStrong,
    color: colors.live,
  },
});
