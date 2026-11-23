/**
 * MatchesDock — Maçlar ekranının ALT ÇUBUĞU: alt menünün hemen üstünde yüzen
 * cam kart, TEK SATIR (telefonda dikey yer yemesin diye gün şeridi ile kapsam
 * seçici yan yana durur).
 *
 *   ╭──────────────────────────────────────────────╮
 *   │ [📅]  Pzt ▐Sal▌ Çar  Per │ 🌐 Tüm Türkiye ▾   │
 *   │        9  ▐10▌  11   12  │    Tüm iller      │
 *   │        ·  ▐ • ▌  ·       │                   │
 *   ╰──────────────────────────────────────────────╯
 *   ══════════════ alt menü ══════════════
 *
 * GÜN ŞERİDİ: dar ekranda seçili günün bir öncesi + iki sonrası (4 gün),
 * geniş ekranda üç öncesi + üç sonrası (7 gün). Kapsüle dokunmak o güne
 * gider. Maçlı günün altında nokta (canlıysa pembe). Uzak bir gün ya da
 * "Bugüne git" için soldaki takvim düğmesi; bugünden uzaktayken düğmede
 * küçük bir işaret durur. Seçili kapsül `gradientBrand` ile dolar; imza
 * degradesi (`gradientSignature`) çevresinde ince hale olarak durur.
 *
 * KAPSAM: `LeaguePicker compact` — kapsüllerle aynı yükseklikte iki satırlı
 * hap (il / lig · sezon).
 *
 * Canlı segmentinde gün kavramı yoktur: şeridin yerini aynı yükseklikte
 * "N canlı maç" özeti alır — çubuk zıplamaz.
 *
 * Eski props (`dayLabel`, `onPrevDay`, `onNextDay`) geriye uyum için durur;
 * `date` + `onSelectDate` verilmezse ‹ Bugün › gezgini çizilir.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { memo, useMemo } from "react";
import { StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { LeaguePicker } from "@/components/LeaguePicker";
import { LiveBadge, Touchable } from "@/components/ui";
import {
  colors,
  fonts,
  glowStyle,
  hairline,
  layout,
  radius,
  space,
  textScale,
  touchSlop,
  type,
  upperTR,
} from "@/theme";
import type { DayMarker } from "./CalendarSheet";
import { fromIso, shiftDays } from "./scoreUtils";

export interface MatchesDockProps {
  /** Canlı segmentinde gün şeridi yerine canlı özeti. */
  live: boolean;
  liveCount: number;
  /** Gün etiketi — "Bugün", "Yarın", "Cum 17 Eki". */
  dayLabel: string;
  isToday: boolean;
  /** Seçili günde maç var mı / canlı maç var mı. */
  hasMatches: boolean;
  hasLive: boolean;
  onPrevDay: () => void;
  onNextDay: () => void;
  onToday: () => void;
  onOpenCalendar: () => void;
  /** Gün şeridi — verilirse kapsüller çizilir. */
  date?: string;
  todayIso?: string;
  markers?: Record<string, DayMarker>;
  onSelectDate?: (iso: string) => void;
}

const SLOP = touchSlop(36);
/** Şerit: dar ekranda seçili günden 1 önce + 2 sonra, genişte 3 + 3. */
const NARROW_DAYS = { before: 1, after: 2 } as const;
const WIDE_DAYS = { before: 3, after: 3 } as const;
/** Bu genişlikten itibaren 7 gün sığar (tablet / yatay). */
const WIDE_BREAKPOINT = 600;
const WEEKDAYS_SHORT = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"] as const;

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
  date,
  todayIso,
  markers,
  onSelectDate,
}: MatchesDockProps) {
  const { width } = useWindowDimensions();
  const span = width >= WIDE_BREAKPOINT ? WIDE_DAYS : NARROW_DAYS;
  const days = useMemo(() => {
    if (!date) return [];
    const list: string[] = [];
    for (let i = -span.before; i <= span.after; i += 1) list.push(shiftDays(date, i));
    return list;
  }, [date, span]);

  const strip = date && onSelectDate;

  return (
    <View style={styles.dock} testID="matches-dock">
      {/* — SOL: gün şeridi / canlı özeti — */}
      {live ? (
        <View style={styles.liveRow} accessibilityRole="text">
          <View style={[styles.liveOrb, liveCount > 0 ? styles.liveOrbOn : null]}>
            {liveCount > 0 ? (
              <LiveBadge compact />
            ) : (
              <Ionicons name="radio-outline" size={14} color={colors.textTertiary} />
            )}
          </View>
          <View style={styles.flex}>
            <Text style={styles.liveTitle} numberOfLines={1} {...textScale.dense}>
              {liveCount > 0 ? `${liveCount} canlı maç` : "Şu an canlı maç yok"}
            </Text>
            <Text style={styles.liveMeta} numberOfLines={1} {...textScale.dense}>
              {liveCount > 0 ? "Skorlar kendiliğinden yenilenir" : "Maç başlayınca burada belirir"}
            </Text>
          </View>
          <Touchable
            feedback="chip"
            haptic="selection"
            onPress={onToday}
            hitSlop={SLOP}
            style={styles.calendarBtn}
            accessibilityRole="button"
            accessibilityLabel="Bugünün maçlarına dön"
          >
            <Ionicons name="calendar-outline" size={18} color={colors.brandAccent} />
          </Touchable>
        </View>
      ) : strip ? (
        <View style={styles.stripRow}>
          <Touchable
            feedback="icon"
            haptic="selection"
            onPress={onOpenCalendar}
            hitSlop={SLOP}
            style={styles.calendarBtn}
            accessibilityRole="button"
            accessibilityLabel={`${dayLabel}. Takvimi aç${isToday ? "" : ", bugüne dönmek için de"}`}
          >
            <Ionicons name="calendar-outline" size={18} color={colors.brandAccent} />
            {!isToday ? <View style={styles.awayDot} /> : null}
          </Touchable>
          <View style={styles.days}>
            {days.map((iso) => (
              <DayCapsule
                key={iso}
                iso={iso}
                selected={iso === date}
                today={iso === todayIso}
                marker={markers?.[iso]}
                onSelect={onSelectDate}
              />
            ))}
          </View>
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
            style={styles.ghostPill}
            accessibilityRole="button"
            accessibilityLabel={`${dayLabel}. Takvimi aç`}
          >
            <Text style={styles.ghostPillText} numberOfLines={1} {...textScale.dense}>
              {dayLabel}
            </Text>
            {hasMatches ? <View style={[styles.navDot, hasLive ? styles.dotLive : null]} /> : null}
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
        </View>
      )}

      {/* — SAĞ: kapsam — */}
      <View style={[styles.picker, width >= WIDE_BREAKPOINT ? styles.pickerWide : null]}>
        <LeaguePicker allowAll compact />
      </View>
    </View>
  );
});

/** Tek gün kapsülü — gün kısaltması, gün numarası, maç noktası. */
const DayCapsule = memo(function DayCapsule({
  iso,
  selected,
  today,
  marker,
  onSelect,
}: {
  iso: string;
  selected: boolean;
  today: boolean;
  marker?: DayMarker;
  onSelect: (iso: string) => void;
}) {
  const d = fromIso(iso);
  const weekday = today ? "Bugün" : WEEKDAYS_SHORT[d.getDay()];
  const has = Boolean(marker?.count);
  const label = `${d.getDate()} ${weekday}${has ? `, ${marker?.count} maç` : ", maç yok"}${
    marker?.live ? ", canlı maç var" : ""
  }`;

  return (
    <Touchable
      feedback="chip"
      haptic="selection"
      onPress={() => onSelect(iso)}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      style={[styles.capsuleHit, selected ? glowStyle(colors.glow, 1) : null]}
    >
      {selected ? (
        <LinearGradient
          colors={colors.gradientSignature}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.halo}
        >
          <LinearGradient
            colors={colors.gradientBrand}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.capsuleFill}
          >
            <CapsuleBody weekday={weekday} day={d.getDate()} selected has={has} live={Boolean(marker?.live)} />
          </LinearGradient>
        </LinearGradient>
      ) : (
        <View style={[styles.capsule, today ? styles.capsuleToday : null]}>
          <CapsuleBody weekday={weekday} day={d.getDate()} selected={false} has={has} live={Boolean(marker?.live)} />
        </View>
      )}
    </Touchable>
  );
});

function CapsuleBody({
  weekday,
  day,
  selected,
  has,
  live,
}: {
  weekday: string;
  day: number;
  selected: boolean;
  has: boolean;
  live: boolean;
}) {
  return (
    <>
      <Text
        style={[styles.weekday, selected ? styles.onBrandMuted : null]}
        numberOfLines={1}
        {...textScale.badge}
      >
        {upperTR(weekday)}
      </Text>
      <Text style={[styles.dayNum, selected ? styles.onBrand : null]} {...textScale.badge}>
        {day}
      </Text>
      <View
        style={[
          styles.dot,
          has ? (live ? styles.dotLive : selected ? styles.dotOnBrand : styles.dotOn) : null,
        ]}
      />
    </>
  );
}

const CAPSULE_H = 48;

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  /** Yüzen cam kart — alt menünün hemen üstünde. */
  dock: {
    marginHorizontal: layout.screenPadding,
    marginBottom: space.sm,
    marginTop: space.xs,
    padding: space.s,
    flexDirection: "row",
    alignItems: "center",
    gap: space.s,
    borderRadius: radius.xxl,
    backgroundColor: colors.glass,
    borderWidth: hairline,
    borderColor: colors.glassLine,
    ...glowStyle(colors.shadowColor, 1),
  },

  /* — Gün şeridi — */
  stripRow: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
  },
  calendarBtn: {
    width: 36,
    height: CAPSULE_H,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brandDim,
  },
  /** Bugünden uzaktayken takvim düğmesindeki işaret ("bugüne dön" buradan). */
  awayDot: {
    position: "absolute",
    top: space.s,
    right: space.s,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.brandAccent,
  },
  days: {
    flex: 1,
    flexDirection: "row",
    gap: space.xxs,
  },
  capsuleHit: {
    flex: 1,
    height: CAPSULE_H,
    borderRadius: radius.lg,
  },
  capsule: {
    flex: 1,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
    gap: space.px,
  },
  capsuleToday: {
    borderWidth: hairline,
    borderColor: colors.brandBorder,
  },
  halo: {
    flex: 1,
    padding: 1.5,
    borderRadius: radius.lg,
  },
  capsuleFill: {
    flex: 1,
    borderRadius: radius.lg - 1.5,
    alignItems: "center",
    justifyContent: "center",
    gap: space.px,
  },
  weekday: {
    ...type.nano,
    fontFamily: fonts.semibold,
    color: colors.textTertiary,
  },
  dayNum: {
    ...type.scoreXs,
    color: colors.textPrimary,
  },
  onBrand: {
    color: colors.textOnBrand,
  },
  onBrandMuted: {
    color: colors.textOnBrand,
    opacity: 0.8,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: "transparent",
  },
  dotOn: { backgroundColor: colors.brandAccent },
  dotOnBrand: { backgroundColor: colors.textOnBrand },
  dotLive: { backgroundColor: colors.live },

  /* — Eski gezgin (geriye uyum) — */
  dayNav: {
    flex: 1,
    minWidth: 0,
    height: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.xs,
  },
  arrow: {
    width: 30,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  navDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.brandAccent,
  },

  /* — Canlı özeti — */
  liveRow: {
    flex: 1,
    minWidth: 0,
    height: CAPSULE_H,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: space.xs,
  },
  liveOrb: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface2,
  },
  liveOrbOn: {
    backgroundColor: colors.liveDim,
  },
  liveTitle: {
    ...type.h4,
    color: colors.textPrimary,
  },
  liveMeta: {
    ...type.caption,
    color: colors.textTertiary,
  },

  /* — Kapsam (sağ) — */
  picker: {
    width: "40%",
    maxWidth: 200,
    flexDirection: "row",
  },
  pickerWide: {
    width: 240,
    maxWidth: 240,
  },
  ghostPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    height: 32,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    backgroundColor: colors.brandDim,
  },
  ghostPillText: {
    ...type.label,
    color: colors.brandAccent,
  },
});
