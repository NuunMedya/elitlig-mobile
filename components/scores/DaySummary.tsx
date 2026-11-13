/**
 * DaySummary — Maçlar ekranının ÖZET BLOĞU: seçili günün dört rakamı tek cam
 * şeritte.
 *
 *   ┌──────────────────────────────────────────────┐
 *   │ BUGÜN                     12 MAÇ · 3 LİG      │
 *   │ 12 Kasım Perşembe                             │
 *   │ ┌─────────┐ ┌─────────┐ ┌─────────┐           │
 *   │ │● 2      │ │✓ 6      │ │◷ 4      │           │
 *   │ │ CANLI   │ │ BİTTİ   │ │ YAKLAŞAN│           │
 *   │ └─────────┘ └─────────┘ └─────────┘           │
 *   │ ▬▬▬▬▬▬▬▬▬▬▬▬▬▬░░░░░░░░  günün %50'si oynandı  │
 *   └──────────────────────────────────────────────┘
 *
 * NEDEN: eski ekran başlıktan doğrudan lig gruplarına iniyordu; "bugün ne
 * kadar maç var, kaçı bitti" sorusu satır saymadan cevaplanamıyordu. Üç hap
 * aynı zamanda kısayoldur — dokununca ilgili segmente geçer (segment
 * denetimi başlıkta durmaya devam eder; bu hap yalnız bir sıçrama noktası).
 *
 * Canlı segmentinde gün yoktur: blok "şu an" özetine döner (canlı maç, lig ve
 * şehir sayısı).
 *
 * Rakamlar `Odometer` ile döner — yoklama yeni sonuç getirince sayaç kayar.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { GradientBar, Odometer, Touchable } from "@/components/ui";
import { colors, fonts, hairline, radius, space, textScale, type, upperTR } from "@/theme";

export type SummaryKey = "canli" | "bitti" | "yaklasan";

export interface DaySummaryProps {
  /** "Bugün", "Yarın", "Dün" ya da "Cum 17 Eki". */
  dayLabel: string;
  /** Uzun tarih: "12 Kasım Perşembe". */
  dateLong: string;
  total: number;
  live: number;
  finished: number;
  scheduled: number;
  leagueCount: number;
  /** Canlı segmentinde "şu an" özeti. */
  liveMode?: boolean;
  /** Canlı modda: kaç ayrı şehirde maç oynanıyor. */
  cityCount?: number;
  /** Seçili segment — eşleşen hap vurgulanır. */
  active?: string;
  onPick?: (key: SummaryKey) => void;
}

interface PillSpec {
  key: SummaryKey;
  label: string;
  value: number;
  icon: keyof typeof Ionicons.glyphMap;
  ink: string;
  dim: string;
}

export const DaySummary = memo(function DaySummary({
  dayLabel,
  dateLong,
  total,
  live,
  finished,
  scheduled,
  leagueCount,
  liveMode = false,
  cityCount = 0,
  active,
  onPick,
}: DaySummaryProps) {
  if (liveMode) {
    return (
      <View style={styles.card} testID="day-summary">
        <View style={styles.liveRow}>
          <View style={[styles.liveOrb, live > 0 ? styles.liveOrbOn : null]}>
            <Ionicons name="radio" size={18} color={live > 0 ? colors.live : colors.textTertiary} />
          </View>
          <View style={styles.flex}>
            <Text style={styles.overline} {...textScale.badge}>
              {upperTR("Şu an sahada")}
            </Text>
            <Text style={styles.title} numberOfLines={1} {...textScale.dense}>
              {live > 0 ? "Canlı maçlar sürüyor" : "Şu anda canlı maç yok"}
            </Text>
          </View>
        </View>
        <View style={styles.statsRow}>
          <LiveStat value={live} label="canlı maç" tone={colors.live} />
          <View style={styles.statDivider} />
          <LiveStat value={leagueCount} label="lig" tone={colors.textPrimary} />
          <View style={styles.statDivider} />
          <LiveStat value={cityCount} label="şehir" tone={colors.textPrimary} />
        </View>
      </View>
    );
  }

  const pills: PillSpec[] = [
    { key: "canli", label: "Canlı", value: live, icon: "radio", ink: colors.live, dim: colors.liveDim },
    { key: "bitti", label: "Bitti", value: finished, icon: "checkmark-done", ink: colors.win, dim: colors.winDim },
    { key: "yaklasan", label: "Yaklaşan", value: scheduled, icon: "time", ink: colors.accentText, dim: colors.accentDim },
  ];
  const played = total > 0 ? finished / total : 0;

  return (
    <View style={styles.card} testID="day-summary">
      <View style={styles.head}>
        <View style={styles.flex}>
          <Text style={styles.overline} {...textScale.badge}>
            {upperTR(dayLabel)}
          </Text>
          <Text style={styles.title} numberOfLines={1} {...textScale.dense}>
            {dateLong}
          </Text>
        </View>
        <View style={styles.totalBox} accessible accessibilityLabel={`${total} maç, ${leagueCount} lig`}>
          <Odometer value={total} style={styles.totalValue} />
          <Text style={styles.totalLabel} numberOfLines={1} {...textScale.badge}>
            {upperTR(`maç · ${leagueCount} lig`)}
          </Text>
        </View>
      </View>

      <View style={styles.pills}>
        {pills.map((pill) => {
          const selected = active === pill.key;
          return (
            <Touchable
              key={pill.key}
              feedback="chip"
              haptic="selection"
              onPress={onPick ? () => onPick(pill.key) : undefined}
              disabled={!onPick}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`${pill.label}: ${pill.value} maç`}
              style={[styles.pill, selected ? { borderColor: pill.ink, backgroundColor: pill.dim } : null]}
            >
              <View style={[styles.pillIcon, { backgroundColor: pill.dim }]}>
                <Ionicons name={pill.icon} size={12} color={pill.ink} />
              </View>
              <View style={styles.pillText}>
                <Odometer value={pill.value} style={[styles.pillValue, pill.value > 0 ? { color: pill.ink } : null]} />
                <Text style={styles.pillLabel} numberOfLines={1} {...textScale.badge}>
                  {upperTR(pill.label)}
                </Text>
              </View>
            </Touchable>
          );
        })}
      </View>

      {total > 0 ? (
        <View style={styles.progressRow}>
          <GradientBar value={played} height={5} style={styles.flex} />
          <Text style={styles.progressText} numberOfLines={1} {...textScale.badge}>
            {finished === total ? "Günün tüm maçları bitti" : `${finished}/${total} tamamlandı`}
          </Text>
        </View>
      ) : null}
    </View>
  );
});

function LiveStat({ value, label, tone }: { value: number; label: string; tone: string }) {
  return (
    <View style={styles.liveStat} accessible accessibilityLabel={`${value} ${label}`}>
      <Odometer value={value} style={[styles.liveStatValue, { color: value > 0 ? tone : colors.textTertiary }]} />
      <Text style={styles.pillLabel} numberOfLines={1} {...textScale.badge}>
        {upperTR(label)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  /** Cam şerit: yarı saydam dolgu + ışıklı kenar (gerçek bulanıklık yok). */
  card: {
    marginTop: space.md,
    padding: space.md,
    gap: space.md,
    borderRadius: radius.xl,
    backgroundColor: colors.glass,
    borderWidth: hairline,
    borderColor: colors.glassLine,
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
  },
  overline: {
    ...type.overline,
    color: colors.brandAccent,
  },
  title: {
    ...type.h2,
    color: colors.textPrimary,
    marginTop: space.xxs,
  },
  totalBox: {
    alignItems: "flex-end",
  },
  totalValue: {
    ...type.metric,
    color: colors.textPrimary,
  },
  totalLabel: {
    ...type.micro,
    color: colors.textTertiary,
  },
  pills: {
    flexDirection: "row",
    gap: space.sm,
  },
  pill: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: space.s,
    paddingVertical: space.s,
    paddingHorizontal: space.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surface2,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  pillIcon: {
    width: 24,
    height: 24,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  pillText: {
    flex: 1,
    minWidth: 0,
  },
  pillValue: {
    ...type.metricSm,
    color: colors.textTertiary,
  },
  pillLabel: {
    ...type.micro,
    color: colors.textTertiary,
  },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  progressText: {
    ...type.caption,
    fontFamily: fonts.semibold,
    color: colors.textSecondary,
  },

  /* — Canlı modu — */
  liveRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
  },
  liveOrb: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface2,
  },
  liveOrbOn: {
    backgroundColor: colors.liveDim,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: space.sm,
    borderTopWidth: hairline,
    borderTopColor: colors.separator,
  },
  liveStat: {
    flex: 1,
    alignItems: "center",
  },
  liveStatValue: {
    ...type.metric,
  },
  statDivider: {
    width: hairline,
    height: 28,
    backgroundColor: colors.separator,
  },
});
