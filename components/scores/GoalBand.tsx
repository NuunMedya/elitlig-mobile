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
import { StyleSheet, Text } from "react-native";

import { Touchable } from "@/components/ui";
import { colors, radius, space, textScale, touchSlop, type, upperTR } from "@/theme";
import type { GoalNews } from "./scoreUtils";

export interface GoalBandProps {
  goal: GoalNews;
  onOpen: () => void;
  onDismiss: () => void;
}

export const GoalBand = memo(function GoalBand({ goal, onOpen, onDismiss }: GoalBandProps) {
  return (
    <Touchable
      feedback="row"
      haptic="selection"
      onPress={onOpen}
      style={styles.band}
      accessibilityRole="button"
      accessibilityLabel={`Gol. ${goal.scoringTeam}. ${goal.homeTeam} ${goal.score} ${goal.awayTeam}. Maçı açmak için dokun.`}
      testID="goal-band"
    >
      <Ionicons name="football" size={14} color={colors.live} />
      <Text style={styles.title} {...textScale.badge}>
        {upperTR("Gol")}
      </Text>
      <Text style={styles.text} numberOfLines={1} {...textScale.dense}>
        {`${goal.scoringTeam} · ${goal.homeTeam} ${goal.score} ${goal.awayTeam}`}
      </Text>
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
  );
});

const styles = StyleSheet.create({
  band: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    backgroundColor: colors.liveDim,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  title: {
    ...type.micro,
    color: colors.live,
  },
  text: {
    ...type.bodySm,
    color: colors.textPrimary,
    flex: 1,
  },
});
