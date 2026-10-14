/**
 * SIRADAKİ MAÇ KARTI — kulüp merkezlerinin "maç günü" bloğu.
 *
 * NE: rakip, gün/saat, ev/deplasman ve geri sayım tek kartta; kartın gövdesi
 * role göre değişir (`children`): başkanda yoklama ölçeri, oyuncuda
 * "geliyor musun?" yanıtı. Altta en fazla iki eylem durur.
 *
 * NEDEN KÂĞIT, SAHNE DEĞİL: Arena'da sahne (grafit) ekranda bir kez ve en
 * tepede kullanılır — o yer kulüp kimliğinindir. Maç kartı bir İŞ kartıdır;
 * kimliği gün etiketindeki menekşe vurgudan ve büyük rakip adından gelir.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";
import { Touchable } from "@/components/ui";
import { formatDateLong, formatTime } from "@/lib/format";
import { colors, elevate, hairline, layout, radius, space, textScale, type, upperTR } from "@/theme";

/** Maç gününe kalan gün: "Bugün", "Yarın", "3 gün" — geçmişte null. */
export function daysUntil(date?: string | null): string | null {
  if (!date) return null;
  const target = new Date(date);
  if (Number.isNaN(target.getTime())) return null;
  const start = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const diff = Math.round((start(target) - start(new Date())) / 86_400_000);
  if (diff < 0) return null;
  if (diff === 0) return "Bugün";
  if (diff === 1) return "Yarın";
  return `${diff} gün`;
}

/** "18 Ekim Cumartesi · 21:00" — göreli gün ("Yarın") geri sayım hapındadır. */
export function matchWhen(date?: string | null, time?: string | null): string {
  const day = formatDateLong(date);
  const clock = time ? formatTime(time) : "";
  return [day, clock].filter(Boolean).join(" · ");
}

export interface NextMatchCardProps {
  opponent: string | null;
  date: string | null;
  time: string | null;
  isHome: boolean;
  venue?: string | null;
  /** Karta dokununca (maç detayı). */
  onPress?: () => void;
  children?: React.ReactNode;
  /** Kartın altındaki eylem satırı (düğmeler). */
  footer?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export const NextMatchCard = React.memo(function NextMatchCard({
  opponent,
  date,
  time,
  isHome,
  venue,
  onPress,
  children,
  footer,
  style,
}: NextMatchCardProps) {
  const countdown = daysUntil(date);
  const imminent = countdown === "Bugün" || countdown === "Yarın";
  const meta = [isHome ? "Ev sahibi" : "Deplasman", venue].filter(Boolean).join(" · ");

  const head = (
    <View style={styles.head}>
      <View style={styles.headTexts}>
        <Text style={styles.when} numberOfLines={1} {...textScale.badge}>
          {upperTR(matchWhen(date, time) || "Tarih belirsiz")}
        </Text>
        <View style={styles.opponentRow}>
          <Text style={styles.vs} {...textScale.badge}>
            {isHome ? "vs" : "@"}
          </Text>
          <Text style={styles.opponent} numberOfLines={1} {...textScale.dense}>
            {opponent ?? "Rakip belirlenmedi"}
          </Text>
        </View>
        <Text style={styles.meta} numberOfLines={1} {...textScale.dense}>
          {meta}
        </Text>
      </View>
      {countdown ? (
        <View style={[styles.countdown, imminent ? styles.countdownHot : null]}>
          <Text style={[styles.countdownText, imminent ? styles.countdownTextHot : null]} {...textScale.badge}>
            {countdown}
          </Text>
        </View>
      ) : null}
      {onPress ? <Ionicons name="chevron-forward" size={14} color={colors.textTertiary} /> : null}
    </View>
  );

  return (
    <View style={[styles.card, style]}>
      {onPress ? (
        <Touchable
          feedback="row"
          haptic="selection"
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={`Sıradaki maç: ${opponent ?? "rakip belirlenmedi"}, ${matchWhen(date, time)}`}
        >
          {head}
        </Touchable>
      ) : (
        head
      )}
      {children ? <View style={styles.body}>{children}</View> : null}
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    ...elevate(1),
    marginHorizontal: layout.screenPadding,
    borderRadius: radius.lg,
    borderWidth: hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface1,
    overflow: "hidden",
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.m,
    paddingHorizontal: space.md,
    paddingVertical: space.m,
  },
  headTexts: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  when: {
    ...type.overline,
    color: colors.brandAccent,
  },
  opponentRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: space.s,
  },
  vs: {
    ...type.micro,
    color: colors.textTertiary,
  },
  opponent: {
    ...type.h3,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  meta: {
    ...type.caption,
    color: colors.textTertiary,
  },
  countdown: {
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs,
    borderRadius: radius.pill,
    backgroundColor: colors.surface3,
  },
  countdownHot: {
    backgroundColor: colors.brandDim,
  },
  countdownText: {
    ...type.micro,
    letterSpacing: 0,
    color: colors.textSecondary,
  },
  countdownTextHot: {
    color: colors.brandAccent,
  },
  body: {
    paddingHorizontal: space.md,
    paddingBottom: space.m,
  },
  footer: {
    flexDirection: "row",
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingBottom: space.m,
  },
});
