/**
 * GALİBİYET DENGESİ — tek yığılmış çubuk + büyük oran.
 *
 * Eski tasarım bir halka + üç ayrı çubuk kullanıyordu: aynı bilgi dört kez
 * çiziliyor ve kartın yarısını kaplıyordu. Tek yığılmış çubuk üç payı AYNI
 * eksende gösterir — "55'e 17" oranı göze doğrudan gelir. Büyük rakam yalnız
 * galibiyet oranıdır; çünkü sorulan soru odur.
 *
 * Renk SONUÇTUR (Arena §1.1): win / draw / loss. Lejant metni mürekkeptir,
 * renk yalnız noktada — yeşil metin beyaz kartta AA'yı geçmez.
 */

import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, radius, space, textScale, type } from "@/theme";
import { surfaces } from "./shared";

export interface WinBalanceProps {
  wins: number;
  draws: number;
  losses: number;
  /** Başlık; varsayılan "Galibiyet dengesi". */
  title?: string;
}

export const WinBalance = React.memo(function WinBalance({
  wins,
  draws,
  losses,
  title = "Galibiyet dengesi",
}: WinBalanceProps) {
  const total = wins + draws + losses;
  if (total <= 0) return null;
  const rate = Math.round((wins / total) * 100);

  const parts = [
    { key: "W", label: "Galibiyet", value: wins, color: colors.win },
    { key: "D", label: "Beraberlik", value: draws, color: colors.draw },
    { key: "L", label: "Mağlubiyet", value: losses, color: colors.loss },
  ];

  return (
    <View style={[surfaces.cardPadded, styles.card]}>
      <View style={styles.head}>
        <View style={styles.headText}>
          <Text style={styles.title} {...textScale.dense}>
            {title}
          </Text>
          <Text style={styles.sub} {...textScale.dense}>
            {total} sonuçlanmış maç
          </Text>
        </View>
        <View style={styles.rate} accessible accessibilityLabel={`Galibiyet oranı yüzde ${rate}`}>
          <Text style={styles.rateValue} {...textScale.dense}>
            %{rate}
          </Text>
          <Text style={styles.rateLabel} {...textScale.badge}>
            GALİBİYET
          </Text>
        </View>
      </View>

      {/* Yığılmış çubuk — sıfır olan pay çizilmez, segmentler arası 2px nefes. */}
      <View style={styles.bar} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {parts
          .filter((part) => part.value > 0)
          .map((part) => (
            <View key={part.key} style={[styles.segment, { flex: part.value, backgroundColor: part.color }]} />
          ))}
      </View>

      <View style={styles.legend}>
        {parts.map((part) => (
          <View
            key={part.key}
            style={styles.legendItem}
            accessible
            accessibilityLabel={`${part.value} ${part.label.toLocaleLowerCase("tr-TR")}`}
          >
            <View style={[styles.dot, { backgroundColor: part.color }]} />
            <Text style={styles.legendValue} {...textScale.dense}>
              {part.value}
            </Text>
            <Text style={styles.legendLabel} numberOfLines={1} {...textScale.dense}>
              {part.label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    gap: space.md,
  },
  head: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: space.md,
  },
  headText: {
    flex: 1,
    gap: 2,
  },
  title: {
    ...type.h2,
    color: colors.textPrimary,
  },
  sub: {
    ...type.caption,
    color: colors.textTertiary,
  },
  rate: {
    alignItems: "flex-end",
  },
  rateValue: {
    ...type.scoreLg,
    color: colors.textPrimary,
  },
  rateLabel: {
    ...type.overline,
    color: colors.textTertiary,
  },
  bar: {
    flexDirection: "row",
    height: 10,
    gap: 2,
    borderRadius: radius.pill,
    overflow: "hidden",
  },
  segment: {
    height: 10,
  },
  legend: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: space.sm,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    flexShrink: 1,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
  },
  legendValue: {
    ...type.tableNumStrong,
    color: colors.textPrimary,
  },
  legendLabel: {
    ...type.caption,
    color: colors.textSecondary,
    flexShrink: 1,
  },
});
