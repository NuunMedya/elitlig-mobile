/**
 * FORM KARTI — son maçlar sütun sütun: reyting · rakip amblemi · tarih ·
 * sonuç çizgisi. Altında son maçların ortalaması kariyer ortalamasıyla
 * kıyaslanır.
 *
 * NEDEN SÜTUN: "bu oyuncu şu an formda mı?" sorusu bir listeyle değil bir
 * DİZİYLE yanıtlanır. Altı sütun yan yana durunca göz soldan sağa okur ve
 * seyri kendisi çıkarır; eski tek başına çizgi grafiği (sparkline) hangi
 * noktanın hangi maç olduğunu söylemiyordu.
 *
 * REYTİNG NOKTAYLA YAZILIR ("7.3"): reyting hapı (RatingPill) ile aynı
 * biçim — aynı sayının iki yerde iki ayrı yazımı olmasın. Oranlar ("1,55
 * gol/maç") Türkçe virgülle yazılır; reyting bir skor tokenıdır.
 *
 * İKİNCİ TUR — REYTİNG SÜTUNLARI: her maç bir çubuktur; çubuğun boyu
 * reyting (0–10), rengi reyting tonu. Üstünde reyting hapı, altında rakip
 * arması ve sonuç harfi (G/B/M renkli kapsül), en altta tarih. Kariyer
 * ortalaması kesikli bir yatay çizgiyle çubukların üstüne serilir: hangi
 * maçların ortalamanın üstünde kaldığı tek bakışta görünür. Puanlanmamış maç
 * kısa, sönük bir taban çubuğudur.
 *
 * Sütunlar ESKİDEN YENİYE sıralıdır (sağdaki en son maç) — skor uygulamalarının
 * ortak okuma yönü. Her sütun maça gider.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { RatingPill, TeamLogo, Touchable, type FormResult } from "@/components/ui";
import { resultColor } from "@/components/teampage/ProfileKit";
import { formatDecimal, mediaUrl } from "@/lib/format";
import { colors, fonts, hairline, palette, radius, ratingColors, ratingLabel, space, textScale, type } from "@/theme";
import { surfaces } from "./shared";

export interface FormItem {
  matchId: number;
  opponent: string;
  opponentLogo: string | null;
  rating: number | null;
  result: FormResult | null;
  /** "4 Eki" biçiminde kısa tarih. */
  dateLabel: string;
  goals: number;
}

export interface FormStripProps {
  /** Eskiden yeniye. */
  items: FormItem[];
  onOpenMatch: (matchId: number) => void;
  /** Kariyer ortalaması — kıyas satırı için; yoksa satır çizilmez. */
  careerAverage: number | null;
  onSeeAll?: () => void;
  /** Sütun yuvası sayısı; maç azsa yuvalar SAĞA yaslı dolar (en son maç
      daima sağ kenarda — FormChips ile aynı okuma). Varsayılan 6. */
  slots?: number;
}

const LETTER: Record<FormResult, string> = { W: "G", D: "B", L: "M" };

/** Çubuk alanının yüksekliği — 10 puan bu boya denk gelir. */
const CHART = 76;
const barHeight = (rating: number | null) =>
  rating == null ? 6 : Math.max(8, Math.min(1, rating / 10) * CHART);

export const FormStrip = React.memo(function FormStrip({
  items,
  onOpenMatch,
  careerAverage,
  onSeeAll,
  slots = 6,
}: FormStripProps) {
  const slotWidth = { width: `${100 / Math.max(slots, items.length)}%` as const };
  const rated = items.map((item) => item.rating).filter((value): value is number => value != null);
  const recentAverage = rated.length ? rated.reduce((acc, value) => acc + value, 0) / rated.length : null;
  const delta =
    recentAverage != null && careerAverage != null ? recentAverage - careerAverage : null;
  const goals = items.reduce((acc, item) => acc + item.goals, 0);

  return (
    <View style={[surfaces.card, styles.card]}>
      <View style={styles.head}>
        <Text style={styles.title} {...textScale.dense}>
          Form
        </Text>
        <Text style={styles.meta} {...textScale.dense}>
          Son {items.length} maç
        </Text>
        {onSeeAll ? (
          <Touchable
            feedback="chip"
            haptic="selection"
            onPress={onSeeAll}
            accessibilityRole="button"
            accessibilityLabel="Tüm maçlar"
            hitSlop={8}
            style={styles.seeAll}
          >
            <Text style={styles.seeAllText} {...textScale.dense}>
              Tümü
            </Text>
            <Ionicons name="chevron-forward" size={12} color={colors.brandAccent} />
          </Touchable>
        ) : null}
      </View>

      <View style={styles.chartWrap}>
        {careerAverage != null ? (
          <View
            pointerEvents="none"
            style={[styles.avgLine, { bottom: CHART_BOTTOM + barHeight(careerAverage) }]}
          >
            <Text style={styles.avgLabel} {...textScale.badge}>
              ORT {ratingLabel(careerAverage)}
            </Text>
          </View>
        ) : null}
        <View style={styles.columns}>
          {items.map((item) => {
            const tone = ratingColors(palette, item.rating);
            return (
              <Touchable
                key={item.matchId}
                feedback="chip"
                haptic="selection"
                onPress={() => onOpenMatch(item.matchId)}
                accessibilityRole="button"
                accessibilityLabel={`${item.opponent} maçı, ${item.dateLabel}${
                  item.rating != null ? `, puan ${ratingLabel(item.rating)}` : ""
                }`}
                style={[styles.column, slotWidth]}
              >
                <RatingPill value={item.rating} size="sm" />
                <View style={styles.barArea}>
                    <View
                      style={[
                        styles.bar,
                        {
                          height: barHeight(item.rating),
                          backgroundColor: item.rating == null ? colors.surface3 : tone.fg,
                        },
                      ]}
                    />
                </View>
                <TeamLogo name={item.opponent} logo={mediaUrl(item.opponentLogo)} size={24} />
                <View style={[styles.resultChip, { backgroundColor: resultColor(item.result) }]}>
                  <Text style={[styles.resultText, item.result ? null : styles.resultTextMuted]} {...textScale.badge}>
                    {item.result ? LETTER[item.result] : "–"}
                  </Text>
                </View>
                <Text style={styles.date} numberOfLines={1} {...textScale.badge}>
                  {item.dateLabel}
                </Text>
              </Touchable>
            );
          })}
        </View>
      </View>

      {recentAverage != null || goals > 0 ? (
        <View style={styles.footer}>
          {recentAverage != null ? (
            <View style={styles.footCell}>
              <Text style={styles.footLabel} {...textScale.badge}>
                {rated.length === items.length ? `SON ${items.length} ORT.` : `${rated.length} PUANLI MAÇ`}
              </Text>
              <View style={styles.footValueRow}>
                <Text style={styles.footValue} {...textScale.dense}>
                  {ratingLabel(recentAverage)}
                </Text>
                {delta != null && Math.abs(delta) >= 0.05 ? (
                  <View style={[styles.delta, { backgroundColor: delta > 0 ? colors.winDim : colors.lossDim }]}>
                    <Ionicons
                      name={delta > 0 ? "caret-up" : "caret-down"}
                      size={10}
                      color={delta > 0 ? colors.win : colors.loss}
                    />
                    <Text style={styles.deltaText} {...textScale.badge}>
                      {formatDecimal(Math.abs(delta))}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
          ) : null}
          {careerAverage != null ? (
            <View style={[styles.footCell, styles.footDivider]}>
              <Text style={styles.footLabel} {...textScale.badge}>
                KARİYER ORT.
              </Text>
              <Text style={styles.footValue} {...textScale.dense}>
                {ratingLabel(careerAverage)}
              </Text>
            </View>
          ) : null}
          <View style={[styles.footCell, styles.footDivider]}>
            <Text style={styles.footLabel} {...textScale.badge}>
              GOL
            </Text>
            <Text style={[styles.footValue, goals > 0 ? styles.footAccent : null]} {...textScale.dense}>
              {goals}
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );
});

/** Çubuk alanının altındaki içerik yüksekliği: arma 24 + kapsül 16 + tarih 13 + aralar. */
const CHART_BOTTOM = space.md + 24 + 16 + 13 + space.s * 3 + space.xs;

const styles = StyleSheet.create({
  card: {
    paddingTop: space.md,
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: space.lg,
  },
  title: {
    ...type.h2,
    color: colors.textPrimary,
  },
  meta: {
    ...type.caption,
    color: colors.textTertiary,
    flex: 1,
  },
  seeAll: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    minHeight: 28,
  },
  seeAllText: {
    ...type.label,
    color: colors.brandAccent,
  },
  chartWrap: {
    position: "relative",
  },
  avgLine: {
    position: "absolute",
    left: space.lg,
    right: space.lg,
    height: 0,
    borderTopWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.brandBorder,
  },
  avgLabel: {
    position: "absolute",
    right: 0,
    top: -14,
    ...type.nano,
    color: colors.brandAccent,
  },
  columns: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingHorizontal: space.sm,
    paddingTop: space.md,
    paddingBottom: space.md,
  },
  column: {
    alignItems: "center",
    gap: space.s,
    paddingVertical: space.xs,
    borderRadius: radius.md,
  },
  barArea: {
    height: CHART,
    justifyContent: "flex-end",
  },
  bar: {
    width: 14,
    borderRadius: radius.pill,
  },
  resultChip: {
    minWidth: 18,
    height: 16,
    paddingHorizontal: space.xs,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  resultText: {
    ...type.nano,
    fontFamily: fonts.bold,
    color: colors.textOnStatus,
  },
  resultTextMuted: {
    color: colors.textTertiary,
  },
  date: {
    ...type.micro,
    color: colors.textTertiary,
    letterSpacing: 0,
  },
  footer: {
    flexDirection: "row",
    borderTopWidth: hairline,
    borderTopColor: colors.separator,
    paddingVertical: space.m,
  },
  footCell: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  footDivider: {
    borderLeftWidth: hairline,
    borderLeftColor: colors.separator,
  },
  footLabel: {
    ...type.overline,
    color: colors.textTertiary,
  },
  footValueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
  },
  footValue: {
    ...type.metricSm,
    color: colors.textPrimary,
  },
  footAccent: {
    color: colors.accentText,
  },
  delta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 1,
    paddingHorizontal: space.xs,
    paddingVertical: 1,
    borderRadius: radius.pill,
  },
  deltaText: {
    ...type.micro,
    letterSpacing: 0,
    color: colors.textSecondary,
  },
});
