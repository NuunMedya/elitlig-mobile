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
 * Sütunlar ESKİDEN YENİYE sıralıdır (sağdaki en son maç) — skor uygulamalarının
 * ortak okuma yönü. Her sütun maça gider.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { RatingPill, TeamLogo, Touchable, type FormResult } from "@/components/ui";
import { formatDecimal, mediaUrl } from "@/lib/format";
import { colors, hairline, radius, ratingLabel, space, textScale, type } from "@/theme";
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

const RESULT_COLOR: Record<FormResult, string> = {
  W: colors.win,
  D: colors.draw,
  L: colors.loss,
};

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

      <View style={styles.columns}>
        {items.map((item) => (
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
            <TeamLogo name={item.opponent} logo={mediaUrl(item.opponentLogo)} size={30} />
            <Text style={styles.date} numberOfLines={1} {...textScale.badge}>
              {item.dateLabel}
            </Text>
            {/* Sonuç çizgisi: renk G/B/M'yi söyler; sonuç yoksa hairline. */}
            <View
              style={[
                styles.result,
                { backgroundColor: item.result ? RESULT_COLOR[item.result] : colors.border },
              ]}
            />
          </Touchable>
        ))}
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
                  <View style={styles.delta}>
                    <Ionicons
                      name={delta > 0 ? "arrow-up" : "arrow-down"}
                      size={11}
                      color={delta > 0 ? colors.win : colors.loss}
                    />
                    {/* Ok rengi sonucu söyler (grafik, 3:1); rakam mürekkeptir —
                        yeşil metin beyaz kartta AA'yı geçmez. */}
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
            <Text style={styles.footValue} {...textScale.dense}>
              {goals}
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );
});

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
  date: {
    ...type.micro,
    color: colors.textTertiary,
    letterSpacing: 0,
  },
  result: {
    width: 18,
    height: 3,
    borderRadius: 2,
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
  delta: {
    flexDirection: "row",
    alignItems: "center",
  },
  deltaText: {
    ...type.micro,
    letterSpacing: 0,
    color: colors.textSecondary,
  },
});
