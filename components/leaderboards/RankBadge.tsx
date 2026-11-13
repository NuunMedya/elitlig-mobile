/**
 * Sıra rozeti — ilk üç madalyalı (altın · gümüş · bronz), sonrası düz rakam.
 *
 * İKİNCİ TUR: madalyalar Gece kitinin degrade + parıltılı rozetidir
 * (`components/ui` → `RankBadge`); Lig sekmesindeki podyum ve tablolarla
 * aynı madalya dili. Sırasız / uzun sıra düz rakam olarak kalır; kendi
 * satırında mor.
 */

import { StyleSheet, Text, View } from "react-native";

import { RankBadge as MedalBadge } from "@/components/ui";
import { colors, textScale, type } from "@/theme";

export function RankBadge({ rank, mine = false }: { rank: number | null | undefined; mine?: boolean }) {
  if (rank != null && rank >= 1 && rank <= 3) {
    return (
      <View style={styles.plain} accessibilityLabel={`${rank}. sıra`}>
        <MedalBadge rank={rank} size={28} />
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
  plain: { minWidth: SIZE, height: SIZE, alignItems: "center", justifyContent: "center" },
  plainText: { ...type.tableNumStrong, color: colors.textSecondary },
  plainTextLong: { ...type.numSmStrong },
  plainMine: { color: colors.brandAccent },
});
