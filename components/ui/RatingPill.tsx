/**
 * Reyting hapı — 0–10 arası oyuncu/takım puanı.
 *
 * NEDEN RENK SKALASI: SofaScore kalıbı; göz, tabloda tek tek sayı okumadan
 * "kim iyi oynadı"yı renkten çıkarır. Ama renk TEK BAŞINA anlam taşımaz —
 * hapın içinde daima sayının kendisi yazar (renk körlüğü ve ekran okuyucu).
 *
 * Renk seçimi `theme/rating.ts` içindeki tek kaynaktan gelir; bileşen eşik
 * bilmez. Tüm rakamlar tabular olduğu için genişlik 7.4 → 10.0 geçişinde
 * oynamaz; minimum genişlik 30 ile tablo sütunu hizalı kalır.
 */

import { memo, useMemo } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import { StyleSheet, Text, View } from "react-native";
import { colors, palette, radius, ratingColors, ratingLabel, textScale, type } from "@/theme";

export interface RatingPillProps {
  /** 0–10 arası reyting; yoksa "—" */
  value: number | null | undefined;
  /** 18 / 22 / 28 yükseklik */
  size?: "sm" | "md" | "lg";
  /** Maçın adamı — altın çerçeve + yıldız */
  best?: boolean;
  /** Reyting yoksa "—" yerine hiç render etme */
  hideEmpty?: boolean;
}

export const RatingPill = memo(function RatingPill({
  value,
  size = "md",
  best = false,
  hideEmpty = false,
}: RatingPillProps) {
  const empty = value == null || !Number.isFinite(value);
  const tone = useMemo(() => ratingColors(palette, value), [value]);

  if (empty && hideEmpty) return null;

  return (
    <View
      style={[
        styles.pill,
        SIZE_STYLE[size],
        { backgroundColor: tone.bg },
        best && styles.best,
      ]}
      accessible
      accessibilityRole="text"
      accessibilityLabel={empty ? "Reyting yok" : `Reyting ${ratingLabel(value)}${best ? ", maçın adamı" : ""}`}
    >
      <Text style={[styles.text, TEXT_SIZE_STYLE[size], { color: tone.fg }]} {...textScale.badge}>
        {ratingLabel(value)}
      </Text>
      {best ? <Ionicons name="star" size={8} color={colors.zoneChampion} style={styles.star} /> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  pill: {
    minWidth: 30,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.xs,
  },
  best: {
    borderWidth: 1,
    borderColor: colors.zoneChampion,
  },
  // Yıldız hapın dışına taşar; dokunma alanını etkilemesin diye mutlak konumlu.
  star: {
    position: "absolute",
    top: -3,
    left: -3,
  },
  text: {
    ...type.tableNumStrong,
  },
  sm: { height: 18, paddingHorizontal: 4 },
  md: { height: 22, paddingHorizontal: 6 },
  lg: { height: 28, paddingHorizontal: 8 },
  textSm: { fontSize: 11, lineHeight: 14 },
  textMd: { fontSize: 13, lineHeight: 16 },
  textLg: { fontSize: 15, lineHeight: 18 },
});

/** Stil aramaları modül seviyesinde sabitlenir — render başına nesne üretilmez. */
const SIZE_STYLE = { sm: styles.sm, md: styles.md, lg: styles.lg } as const;
const TEXT_SIZE_STYLE = { sm: styles.textSm, md: styles.textMd, lg: styles.textLg } as const;
