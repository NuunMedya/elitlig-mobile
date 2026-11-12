/**
 * Sıra rozeti — ilk üç madalyalı (altın · gümüş · bronz), sonrası düz rakam.
 * Madalya kendi zeminini taşır: açık ve koyu temada aynı okunur.
 */

import { StyleSheet, Text, View } from "react-native";

import { BOARD_MEDALS, medalFor } from "@/lib/leaderboardPalette";
import { colors, radius, textScale, type } from "@/theme";

export function RankBadge({ rank, mine = false }: { rank: number | null | undefined; mine?: boolean }) {
  const medal = rank != null ? medalFor(rank) : null;
  if (medal) {
    const tone = BOARD_MEDALS[medal];
    return (
      <View
        style={[styles.medal, { backgroundColor: tone.bg, borderColor: tone.edge }]}
        accessibilityLabel={`${rank}. sıra`}
      >
        <Text style={[styles.medalText, { color: tone.ink }]} {...textScale.badge}>
          {rank}
        </Text>
      </View>
    );
  }
  const label = rank == null ? "–" : String(rank);
  return (
    <View style={styles.plain} accessibilityLabel={rank != null ? `${rank}. sıra` : "Sırasız"}>
      <Text
        style={[styles.plainText, label.length > 3 ? styles.plainTextLong : null, mine ? styles.plainMine : null]}
        numberOfLines={1}
        {...textScale.badge}
      >
        {label}
      </Text>
    </View>
  );
}

const SIZE = 30;

const styles = StyleSheet.create({
  medal: {
    width: SIZE,
    height: SIZE,
    borderRadius: radius.pill,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  medalText: { ...type.tableNumStrong },
  plain: { minWidth: SIZE, height: SIZE, alignItems: "center", justifyContent: "center" },
  plainText: { ...type.tableNumStrong, color: colors.textSecondary },
  plainTextLong: { ...type.numSmStrong },
  plainMine: { color: colors.brandAccent },
});
