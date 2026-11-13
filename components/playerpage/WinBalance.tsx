/**
 * GALİBİYET DENGESİ — tek yığılmış çubuk + büyük oran.
 *
 * Eski tasarım bir halka + üç ayrı çubuk kullanıyordu: aynı bilgi dört kez
 * çiziliyor ve kartın yarısını kaplıyordu. Tek yığılmış çubuk üç payı AYNI
 * eksende gösterir — "55'e 17" oranı göze doğrudan gelir. Büyük rakam yalnız
 * galibiyet oranıdır; çünkü sorulan soru odur.
 *
 * İKİNCİ TUR: oran artık halkadır (ProgressRing, galibiyet tonu) ve üç pay
 * renkli zeminli sayı karolarında Odometer ile döner; yığılmış çubuk altta
 * payların oranını tek eksende verir.
 *
 * Renk SONUÇTUR (Arena §1.1): win / draw / loss. Lejant metni mürekkeptir,
 * renk yalnız noktada — yeşil metin beyaz kartta AA'yı geçmez.
 */

import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Odometer, ProgressRing } from "@/components/ui";
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
    { key: "W", label: "Galibiyet", value: wins, color: colors.win, bg: colors.winDim },
    { key: "D", label: "Beraberlik", value: draws, color: colors.draw, bg: colors.drawDim },
    { key: "L", label: "Mağlubiyet", value: losses, color: colors.loss, bg: colors.lossDim },
  ];

  return (
    <View style={[surfaces.cardPadded, styles.card]}>
      <View style={styles.head}>
        <Text style={styles.title} {...textScale.dense}>
          {title}
        </Text>
        <Text style={styles.sub} {...textScale.dense}>
          {total} sonuçlanmış maç
        </Text>
      </View>

      <View style={styles.main}>
        <View accessible accessibilityLabel={`Galibiyet oranı yüzde ${rate}`}>
          <ProgressRing value={wins / total} size={84} thickness={7} tone="win" label={`%${rate}`} sublabel="galibiyet" animate />
        </View>
        <View style={styles.tiles}>
          {parts.map((part) => (
            <View
              key={part.key}
              style={[styles.tile, { backgroundColor: part.bg }]}
              accessible
              accessibilityLabel={`${part.value} ${part.label.toLocaleLowerCase("tr-TR")}`}
            >
              <Odometer value={part.value} style={[styles.tileValue, { color: part.color }]} />
              <Text style={styles.tileLabel} numberOfLines={1} {...textScale.badge}>
                {part.label.toLocaleUpperCase("tr-TR")}
              </Text>
            </View>
          ))}
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
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    gap: space.md,
  },
  head: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: space.sm,
  },
  title: {
    ...type.h2,
    color: colors.textPrimary,
  },
  sub: {
    ...type.caption,
    color: colors.textTertiary,
  },
  main: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.lg,
  },
  tiles: {
    flex: 1,
    gap: space.xs,
  },
  tile: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderRadius: radius.md,
  },
  tileValue: {
    ...type.scoreSm,
  },
  tileLabel: {
    ...type.overline,
    color: colors.textSecondary,
  },
  bar: {
    flexDirection: "row",
    gap: 2,
    height: 8,
    borderRadius: radius.pill,
    overflow: "hidden",
  },
  segment: {
    height: 8,
  },
});
