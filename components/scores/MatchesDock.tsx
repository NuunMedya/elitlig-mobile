/**
 * MatchesDock — Maçlar ekranının ALT ÇUBUĞU: tek satır, iki kontrol.
 *
 *   ┌───────────────────────────────────────────────┐
 *   │ [🏆 Ankara · FREELİG · 15. Sezon ▾]  ‹ Bugün › │
 *   └───────────────────────────────────────────────┘
 *   ══════════════ alt menü ══════════════
 *
 * NEDEN TEK SATIR: ilk sürümde segment + lig seçici + gün şeridi alt menünün
 * üstünde üç kat oluyordu; ekranın alt üçte biri süzgece gidiyordu. Segment
 * (Tümü · Canlı · Bitti · Yaklaşan) yeniden başlığa çıktı; altta yalnız
 * başparmağın en sık değiştirdiği iki şey kaldı: KAPSAM ve GÜN.
 *
 * GÜN GEZGİNİ: ‹ / › bir gün kaydırır; ortadaki etiket ("Bugün", "Yarın",
 * "Cum 17 Eki") dokununca aylık takvimi açar. Seçili gün bugün değilse
 * etiketin yanında küçük "bugüne dön" düğmesi çıkar. Seçili günde maç varsa
 * etiketin altında nokta (canlıysa kırmızı) durur.
 *
 * Canlı segmentinde gün kavramı yoktur: gezginin yerini aynı genişlikte
 * "N canlı" özeti alır — çubuk zıplamaz.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { LeaguePicker } from "@/components/LeaguePicker";
import { LiveBadge, Touchable } from "@/components/ui";
import { colors, fonts, hairline, layout, radius, space, textScale, touchSlop, type } from "@/theme";

export interface MatchesDockProps {
  /** Canlı segmentinde gün gezgini yerine canlı özeti. */
  live: boolean;
  liveCount: number;
  /** Gün etiketi — "Bugün", "Yarın", "Cum 17 Eki". */
  dayLabel: string;
  isToday: boolean;
  /** Seçili günde maç var mı / canlı maç var mı (etiket altı nokta). */
  hasMatches: boolean;
  hasLive: boolean;
  onPrevDay: () => void;
  onNextDay: () => void;
  onToday: () => void;
  onOpenCalendar: () => void;
}

const SLOP = touchSlop(36);

export const MatchesDock = memo(function MatchesDock({
  live,
  liveCount,
  dayLabel,
  isToday,
  hasMatches,
  hasLive,
  onPrevDay,
  onNextDay,
  onToday,
  onOpenCalendar,
}: MatchesDockProps) {
  return (
    <View style={styles.dock}>
      <View style={styles.picker}>
        <LeaguePicker allowAll pinned={false} flush />
      </View>

      {live ? (
        <View style={styles.liveBox} accessibilityRole="text">
          {liveCount > 0 ? <LiveBadge compact /> : null}
          <Text style={styles.liveText} numberOfLines={1} {...textScale.dense}>
            {liveCount > 0 ? `${liveCount} canlı` : "Canlı yok"}
          </Text>
        </View>
      ) : (
        <View style={styles.dayNav}>
          <Touchable
            feedback="icon"
            haptic="selection"
            onPress={onPrevDay}
            hitSlop={SLOP}
            style={styles.arrow}
            accessibilityRole="button"
            accessibilityLabel="Önceki gün"
          >
            <Ionicons name="chevron-back" size={16} color={colors.textSecondary} />
          </Touchable>

          <Touchable
            feedback="chip"
            haptic="selection"
            onPress={onOpenCalendar}
            style={styles.day}
            accessibilityRole="button"
            accessibilityLabel={`${dayLabel}. Takvimi aç`}
          >
            <Text style={[styles.dayText, isToday && styles.dayTextToday]} numberOfLines={1} {...textScale.dense}>
              {dayLabel}
            </Text>
            <View style={[styles.dot, hasMatches ? (hasLive ? styles.dotLive : styles.dotOn) : null]} />
          </Touchable>

          <Touchable
            feedback="icon"
            haptic="selection"
            onPress={onNextDay}
            hitSlop={SLOP}
            style={styles.arrow}
            accessibilityRole="button"
            accessibilityLabel="Sonraki gün"
          >
            <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
          </Touchable>

          {isToday ? null : (
            <Touchable
              feedback="icon"
              haptic="selection"
              onPress={onToday}
              hitSlop={SLOP}
              style={styles.today}
              accessibilityRole="button"
              accessibilityLabel="Bugüne dön"
            >
              <Ionicons name="return-down-back" size={14} color={colors.brandAccent} />
            </Touchable>
          )}
        </View>
      )}
    </View>
  );
});

const BAR_HEIGHT = 50;

const styles = StyleSheet.create({
  dock: {
    height: BAR_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: layout.screenPadding,
    backgroundColor: colors.surface1,
    borderTopWidth: hairline,
    borderTopColor: colors.border,
  },
  picker: {
    flex: 1,
    minWidth: 0,
  },
  dayNav: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xxs,
  },
  arrow: {
    width: 26,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  /** Gün etiketi hapı — dokununca takvim. */
  day: {
    minWidth: 74,
    height: 32,
    paddingHorizontal: space.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surface2,
    borderWidth: hairline,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  dayText: {
    ...type.labelSm,
    fontFamily: fonts.semibold,
    color: colors.textPrimary,
  },
  dayTextToday: {
    color: colors.brandAccent,
  },
  dot: {
    width: 4,
    height: 4,
    marginTop: 2,
    borderRadius: 2,
    backgroundColor: "transparent",
  },
  dotOn: {
    backgroundColor: colors.brandAccent,
  },
  dotLive: {
    backgroundColor: colors.live,
  },
  today: {
    width: 28,
    height: 28,
    marginLeft: space.xxs,
    borderRadius: radius.pill,
    backgroundColor: colors.brandDim,
    alignItems: "center",
    justifyContent: "center",
  },
  liveBox: {
    height: 32,
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surface2,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  liveText: {
    ...type.caption,
    color: colors.textSecondary,
  },
});
