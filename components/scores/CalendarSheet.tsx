/**
 * CalendarSheet — Skorlar'ın "uzak bir güne atla" ay takvimi.
 *
 * NE: alt sayfada aylık ızgara; maçlı günlerde nokta (canlı varsa kırmızı),
 * seçili gün menekşe, bugün vurgulu. Altta "Bugüne git".
 *
 * NEDEN HARİCİ PAKET YOK: tek ihtiyaç uzak bir güne atlamak; hazır takvim
 * kütüphaneleri kendi tema/dil katmanını getiriyor ve paketi büyütüyor.
 * 42 hücrelik ızgara + iki ok yeterli. Hafta Pazartesi başlar.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { BottomSheet, Touchable } from "@/components/ui";
import { colors, fonts, radius, space, textScale, touchSlop, type } from "@/theme";
import { MONTHS_TR, pad2 } from "./scoreUtils";

/** Haftanın ilk günü Pazartesi — takvim ızgarası bu sırayı izler. */
const WEEKDAYS_TR = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"] as const;

export interface DayMarker {
  count: number;
  live?: boolean;
}

export const CalendarSheet = memo(function CalendarSheet({
  visible,
  onClose,
  value,
  todayIso,
  markers,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  value: string;
  todayIso: string;
  markers: Record<string, DayMarker>;
  onSelect: (iso: string) => void;
}) {
  const [cursor, setCursor] = useState(() => value.slice(0, 7));

  // Sayfa her açılışta seçili ayı gösterir (kullanıcı geçen sefer nereye
  // kaydırdıysa orada başlamak kafa karıştırıcı olurdu).
  useEffect(() => {
    if (visible) setCursor(value.slice(0, 7));
  }, [visible, value]);

  const year = Number(cursor.slice(0, 4));
  const month = Number(cursor.slice(5, 7)) - 1;

  const goPrev = useCallback(() => {
    const date = new Date(year, month - 1, 1);
    setCursor(`${date.getFullYear()}-${pad2(date.getMonth() + 1)}`);
  }, [year, month]);

  const goNext = useCallback(() => {
    const date = new Date(year, month + 1, 1);
    setCursor(`${date.getFullYear()}-${pad2(date.getMonth() + 1)}`);
  }, [year, month]);

  /** Ay ızgarası: baştaki boş hücreler + ayın günleri (tam haftalara tamamlanır). */
  const cells = useMemo(() => {
    const first = new Date(year, month, 1);
    const lead = (first.getDay() + 6) % 7; // Pazartesi = 0
    const days = new Date(year, month + 1, 0).getDate();
    const list: (string | null)[] = [];
    for (let i = 0; i < lead; i += 1) list.push(null);
    for (let day = 1; day <= days; day += 1) list.push(`${year}-${pad2(month + 1)}-${pad2(day)}`);
    while (list.length % 7 !== 0) list.push(null);
    return list;
  }, [year, month]);

  const jumpToToday = useCallback(() => onSelect(todayIso), [onSelect, todayIso]);

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Tarih seç" snap="content">
      <View style={styles.calNav}>
        <Touchable
          feedback="icon"
          haptic="selection"
          onPress={goPrev}
          hitSlop={touchSlop(32)}
          accessibilityLabel="Önceki ay"
          style={styles.calNavButton}
        >
          <Ionicons name="chevron-back" size={20} color={colors.textSecondary} />
        </Touchable>

        <Text style={styles.calTitle} {...textScale.dense}>
          {`${MONTHS_TR[month] ?? ""} ${year}`}
        </Text>

        <Touchable
          feedback="icon"
          haptic="selection"
          onPress={goNext}
          hitSlop={touchSlop(32)}
          accessibilityLabel="Sonraki ay"
          style={styles.calNavButton}
        >
          <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
        </Touchable>
      </View>

      <View style={styles.calGrid}>
        {WEEKDAYS_TR.map((label) => (
          <View key={label} style={styles.calCell}>
            <Text style={styles.calWeekday} {...textScale.badge}>
              {label}
            </Text>
          </View>
        ))}

        {cells.map((iso, index) =>
          iso === null ? (
            <View key={`bos-${index}`} style={styles.calCell} />
          ) : (
            <CalendarDay
              key={iso}
              iso={iso}
              selected={iso === value}
              today={iso === todayIso}
              marker={markers[iso]}
              onSelect={onSelect}
            />
          ),
        )}
      </View>

      <Touchable
        feedback="button"
        haptic="selection"
        onPress={jumpToToday}
        accessibilityLabel="Bugüne git"
        style={styles.calToday}
      >
        <Ionicons name="today-outline" size={15} color={colors.brandAccent} />
        <Text style={styles.calTodayText} {...textScale.dense}>
          Bugüne git
        </Text>
      </Touchable>
    </BottomSheet>
  );
});

const CalendarDay = memo(function CalendarDay({
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
  const handlePress = useCallback(() => onSelect(iso), [onSelect, iso]);
  const day = Number(iso.slice(8, 10));

  return (
    <View style={styles.calCell}>
      <Touchable
        feedback="chip"
        haptic="selection"
        onPress={handlePress}
        accessibilityLabel={`${day} ${MONTHS_TR[Number(iso.slice(5, 7)) - 1]}`}
        accessibilityState={{ selected }}
        style={[styles.calDay, selected && styles.calDaySelected]}
      >
        <Text
          style={[
            styles.calDayText,
            today && !selected && styles.calDayToday,
            selected && styles.calDayTextSelected,
          ]}
          {...textScale.dense}
        >
          {day}
        </Text>
        <View
          style={[
            styles.calDot,
            marker ? (marker.live ? styles.calDotLive : styles.calDotOn) : null,
            selected && marker ? styles.calDotSelected : null,
          ]}
        />
      </Touchable>
    </View>
  );
});

const styles = StyleSheet.create({
  /* Takvim sayfası */
  calNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: space.sm,
  },
  calNavButton: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  calTitle: {
    ...type.h2,
    color: colors.textPrimary,
  },
  calGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  calCell: {
    width: "14.2857%",
    alignItems: "center",
    justifyContent: "center",
  },
  calWeekday: {
    ...type.micro,
    color: colors.textTertiary,
    paddingVertical: space.xs,
  },
  calDay: {
    width: 38,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    gap: space.xxs,
  },
  calDaySelected: {
    backgroundColor: colors.brand,
  },
  calDayText: {
    ...type.tableNum,
    color: colors.textPrimary,
  },
  calDayToday: {
    color: colors.brandAccent,
    fontFamily: fonts.bold,
  },
  calDayTextSelected: {
    color: colors.textOnBrand,
    fontFamily: fonts.bold,
  },
  // Nokta her hücrede yer tutar; böylece maçlı/maçsız günlerde rakam zıplamaz.
  calDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "transparent",
  },
  calDotOn: {
    backgroundColor: colors.brandAccent,
  },
  calDotLive: {
    backgroundColor: colors.live,
  },
  calDotSelected: {
    backgroundColor: colors.textOnBrand,
  },
  calToday: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.s,
    marginTop: space.md,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.brandDim,
  },
  calTodayText: {
    ...type.label,
    color: colors.brandAccent,
  },
});
