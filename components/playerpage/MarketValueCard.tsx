/**
 * PİYASA DEĞERİ KARTI — değer, değişim, seyir çizgisi ve sıralar.
 *
 * DÜZEN: üstte etiket + değişim rozeti, altında değer (tek satır, sığmazsa
 * punto küçülür — para birimi rakamdan kopmaz), ortada son ölçümlerin seyir
 * çizgisi, altta sıra hücreleri.
 *
 * NEDEN ÇİZGİ (eski sütun şeridi yerine): 16 ölçümlük sütun dizisi bir
 * histogram gibi okunuyordu — "hangi ay kaç" sorusu. Sorulan soru "değer
 * yükseliyor mu" olduğu için tek çizgi (Sparkline, veri rengi) yeter.
 *
 * İKİNCİ TUR: kart bir KİMLİK anıdır — koyu mürekkep zemin + aurora ışığı,
 * beyaz dev değer, camgöbeği seyir çizgisi, sıralar cam karolarda. Değişim
 * rozeti ▲/▼ ile nane/kırmızı.
 *
 * YÜZDELİK DÜZELTMESİ: sunucu `percentile`ı 0–1 kesir olarak döndürür
 * (0.9999 = oyuncuların %99,99'undan değerli). Eski kart bunu `%1` diye
 * yazıyordu — yuvarlanmış kesir, anlamı ters. Burada "üst dilim" olarak
 * yazılır: 0.9999 → "İlk %1".
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useState } from "react";
import { StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import { Aurora, Sparkline } from "@/components/ui";
import { formatDateShort, formatMoney } from "@/lib/format";
import { colors, dark, hairline, radius, space, textScale, type } from "@/theme";
import { decimalTR, num } from "./shared";

/* Yüzey gradyanı yatay, sağdan sola. */
const INK_START = { x: 1, y: 0.5 };
const INK_END = { x: 0, y: 0.5 };

export interface MarketValueData {
  currentValue: number;
  changeAmount: number;
  changePercentage: number;
  globalRank: number | null;
  cityRank: number | null;
  positionRank: number | null;
  percentile: number | null;
  lastCalculatedAt: string | null;
  currency: string;
}

export interface MarketValueCardProps {
  market: MarketValueData;
  /** Eskiden yeniye değerler; ikiden azsa çizgi çizilmez. */
  series: number[];
}

/** 0–1 kesir ya da 0–100 yüzde → "üst dilim" yüzdesi (en az 1). */
function topShare(percentile: number): number {
  const fraction = percentile > 1 ? percentile / 100 : percentile;
  const top = (1 - fraction) * 100;
  return Math.max(1, Math.ceil(top));
}

export const MarketValueCard = React.memo(function MarketValueCard({ market, series }: MarketValueCardProps) {
  const [width, setWidth] = useState(0);
  const onLayout = (event: LayoutChangeEvent) => setWidth(Math.round(event.nativeEvent.layout.width));

  const rising = market.changeAmount > 0;
  const falling = market.changeAmount < 0;

  const ranks: { key: string; label: string; value: string }[] = [];
  if (market.globalRank != null) ranks.push({ key: "tr", label: "TÜRKİYE", value: `${market.globalRank}.` });
  if (market.cityRank != null) ranks.push({ key: "city", label: "ŞEHİR", value: `${market.cityRank}.` });
  if (market.positionRank != null) ranks.push({ key: "pos", label: "MEVKİ", value: `${market.positionRank}.` });
  if (market.percentile != null && num(market.percentile) > 0) {
    ranks.push({ key: "pct", label: "DİLİM", value: `İlk %${topShare(num(market.percentile))}` });
  }

  return (
    <View style={styles.card}>
      <View style={styles.clip}>
        <LinearGradient colors={colors.gradientInk} start={INK_START} end={INK_END} style={StyleSheet.absoluteFill} />
        <Aurora variant="stage" style={StyleSheet.absoluteFill} />
      </View>
      <View style={styles.body}>
        <View style={styles.head}>
          <View style={styles.overlineRow}>
            <Ionicons name="diamond" size={12} color={colors.brandOnDark} />
            <Text style={styles.overline} {...textScale.badge}>
              PİYASA DEĞERİ
            </Text>
          </View>
          {/* Oran yalnız ANLAMLIYSA: ilk değerlemeden (≈0) sonraki değişim
              "+%69393" gibi bir sayı üretiyor — bilgi değil gürültü. */}
          {market.changeAmount !== 0 && Math.abs(market.changePercentage) < 1000 ? (
            <View style={styles.change}>
              <Ionicons
                name={rising ? "caret-up" : "caret-down"}
                size={11}
                color={rising ? dark.win : falling ? dark.loss : colors.onDarkMuted}
              />
              <Text
                style={[styles.changeText, { color: rising ? dark.win : falling ? dark.loss : colors.onDark }]}
                {...textScale.badge}
              >
                {`${rising ? "+" : ""}%${decimalTR(market.changePercentage)}`}
              </Text>
            </View>
          ) : null}
        </View>

        <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} {...textScale.dense}>
          {formatMoney(market.currentValue, market.currency)}
        </Text>

        {series.length > 1 ? (
          <View style={styles.chart} onLayout={onLayout}>
            {width > 0 ? <Sparkline values={series} width={width} height={56} thickness={2.5} color={dark.accent} /> : null}
          </View>
        ) : null}

        {market.lastCalculatedAt ? (
          <Text style={styles.updated} {...textScale.dense}>
            Son güncelleme {formatDateShort(market.lastCalculatedAt)}
            {series.length > 1 ? ` · son ${series.length} ölçüm` : ""}
          </Text>
        ) : null}
      </View>

      {ranks.length ? (
        <View style={styles.ranks}>
          {ranks.map((rank) => (
            <View
              key={rank.key}
              style={styles.rank}
              accessible
              accessibilityLabel={`${rank.label.toLocaleLowerCase("tr-TR")} sırası ${rank.value}`}
            >
              <Text style={styles.rankValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} {...textScale.dense}>
                {rank.value}
              </Text>
              <Text style={styles.rankLabel} numberOfLines={1} {...textScale.badge}>
                {rank.label}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.xl,
  },
  clip: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: radius.xl,
    overflow: "hidden",
    borderWidth: hairline,
    borderColor: colors.inkTileBorder,
  },
  body: {
    padding: space.lg,
    gap: space.s,
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
  },
  overlineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
  },
  overline: {
    ...type.overline,
    color: colors.brandOnDark,
  },
  change: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs,
    borderRadius: radius.pill,
    backgroundColor: colors.inkPill,
    borderWidth: hairline,
    borderColor: colors.inkPillBorder,
  },
  changeText: {
    ...type.numSmStrong,
  },
  value: {
    ...type.scoreLg,
    color: colors.onDark,
  },
  chart: {
    marginTop: space.s,
  },
  updated: {
    ...type.caption,
    color: colors.onDarkMuted,
  },
  ranks: {
    flexDirection: "row",
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingBottom: space.lg,
  },
  rank: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: space.xs,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    backgroundColor: colors.inkTile,
    borderWidth: hairline,
    borderColor: colors.inkTileBorder,
    gap: 2,
  },
  rankValue: {
    ...type.metricSm,
    color: colors.onDark,
  },
  rankLabel: {
    ...type.overline,
    color: colors.onDarkMuted,
  },
});
