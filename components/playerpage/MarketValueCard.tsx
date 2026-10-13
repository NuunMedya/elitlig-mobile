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
 * YÜZDELİK DÜZELTMESİ: sunucu `percentile`ı 0–1 kesir olarak döndürür
 * (0.9999 = oyuncuların %99,99'undan değerli). Eski kart bunu `%1` diye
 * yazıyordu — yuvarlanmış kesir, anlamı ters. Burada "üst dilim" olarak
 * yazılır: 0.9999 → "İlk %1".
 */

import React, { useState } from "react";
import { StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import { Badge, Sparkline } from "@/components/ui";
import { formatDateShort, formatMoney } from "@/lib/format";
import { colors, hairline, space, textScale, type } from "@/theme";
import { decimalTR, num, surfaces } from "./shared";

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
    <View style={surfaces.card}>
      <View style={styles.body}>
        <View style={styles.head}>
          <Text style={styles.overline} {...textScale.badge}>
            PİYASA DEĞERİ
          </Text>
          {market.changeAmount !== 0 ? (
            <Badge
              label={`${rising ? "+" : ""}%${decimalTR(market.changePercentage)}`}
              tone={rising ? "win" : falling ? "danger" : "neutral"}
              icon={rising ? "trending-up" : "trending-down"}
              size="sm"
            />
          ) : null}
        </View>

        <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} {...textScale.dense}>
          {formatMoney(market.currentValue, market.currency)}
        </Text>

        {series.length > 1 ? (
          <View style={styles.chart} onLayout={onLayout}>
            {width > 0 ? <Sparkline values={series} width={width} height={48} thickness={2} /> : null}
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
          {ranks.map((rank, index) => (
            <View
              key={rank.key}
              style={[styles.rank, index > 0 && styles.rankDivider]}
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
  overline: {
    ...type.overline,
    color: colors.textTertiary,
  },
  value: {
    ...type.scoreLg,
    color: colors.textPrimary,
  },
  chart: {
    marginTop: space.s,
  },
  updated: {
    ...type.caption,
    color: colors.textTertiary,
  },
  ranks: {
    flexDirection: "row",
    borderTopWidth: hairline,
    borderTopColor: colors.separator,
    paddingVertical: space.m,
  },
  rank: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: space.xs,
    gap: 2,
  },
  rankDivider: {
    borderLeftWidth: hairline,
    borderLeftColor: colors.separator,
  },
  rankValue: {
    ...type.metricSm,
    color: colors.textPrimary,
  },
  rankLabel: {
    ...type.overline,
    color: colors.textTertiary,
  },
});
