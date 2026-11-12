/**
 * TARİH ARALIĞI SEÇİCİ — uygulama içi takvim (yerel tarih seçici modülü yok).
 *
 * Ay ay gezilen 7 sütunlu takvim: ilk dokunuş başlangıç, ikincisi bitiş.
 * Bitiş başlangıçtan önceyse yeni başlangıç olur. Bugünden sonrası seçilemez
 * (gelecekte skor yok). Üstte hızlı seçimler: son 7 gün, son 30 gün, geçen
 * hafta, geçen ay. Günler İstanbul takvim günüdür.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { BottomSheet, Button, Chip, ChipGroup, Touchable } from "@/components/ui";
import {
  MONTHS_TR,
  WEEKDAYS_SHORT_TR,
  addDays,
  daysInMonth,
  firstWeekday,
  formatRange,
  isoDay,
  istanbulToday,
  monthRange,
  parseDay,
  weekRange,
  type DayRange,
} from "@/lib/leaderboard";
import { colors, radius, space, textScale, type } from "@/theme";

/** En eski seçilebilir gün — tablolar bundan önceye inmez. */
const MIN_DAY = "2024-01-01";

function presets(today: string): { key: string; label: string; range: DayRange }[] {
  const thisWeek = weekRange(today);
  const lastWeekEnd = addDays(thisWeek.from, -1);
  const thisMonth = monthRange(today);
  const lastMonth = monthRange(addDays(thisMonth.from, -1));
  return [
    { key: "7", label: "Son 7 gün", range: { from: addDays(today, -6), to: today } },
    { key: "30", label: "Son 30 gün", range: { from: addDays(today, -29), to: today } },
    { key: "lw", label: "Geçen hafta", range: { from: addDays(lastWeekEnd, -6), to: lastWeekEnd } },
    { key: "lm", label: "Geçen ay", range: lastMonth },
  ];
}

export function DateRangeSheet({
  visible,
  initial,
  onClose,
  onApply,
}: {
  visible: boolean;
  initial?: DayRange | null;
  onClose: () => void;
  onApply: (range: DayRange) => void;
}) {
  const today = istanbulToday();
  const [start, setStart] = useState<string | null>(initial?.from ?? null);
  const [end, setEnd] = useState<string | null>(initial?.to ?? null);
  const anchor = parseDay(initial?.to ?? today) ?? parseDay(today)!;
  const [cursor, setCursor] = useState({ y: anchor.y, m: anchor.m });

  // Her açılışta son uygulanan aralıktan başla.
  useEffect(() => {
    if (!visible) return;
    setStart(initial?.from ?? null);
    setEnd(initial?.to ?? null);
    const a = parseDay(initial?.to ?? today);
    if (a) setCursor({ y: a.y, m: a.m });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const quick = useMemo(() => presets(today), [today]);

  const cells = useMemo(() => {
    const lead = firstWeekday(cursor.y, cursor.m);
    const count = daysInMonth(cursor.y, cursor.m);
    const out: (string | null)[] = Array.from({ length: lead }, () => null);
    for (let d = 1; d <= count; d += 1) out.push(isoDay(cursor.y, cursor.m, d));
    while (out.length % 7) out.push(null);
    return out;
  }, [cursor]);

  const todayParts = parseDay(today)!;
  const canNext = cursor.y < todayParts.y || (cursor.y === todayParts.y && cursor.m < todayParts.m);
  const canPrev = isoDay(cursor.y, cursor.m, 1) > MIN_DAY;
  const shift = (delta: number) =>
    setCursor((c) => {
      const m = c.m + delta;
      return { y: c.y + Math.floor(m / 12), m: ((m % 12) + 12) % 12 };
    });

  const pick = (day: string) => {
    if (!start || end) {
      setStart(day);
      setEnd(null);
    } else if (day < start) {
      setStart(day);
    } else {
      setEnd(day);
    }
  };

  const applyPreset = (range: DayRange) => {
    setStart(range.from);
    setEnd(range.to);
    const p = parseDay(range.to);
    if (p) setCursor({ y: p.y, m: p.m });
  };

  const ready = start != null && end != null;
  const summary = ready ? formatRange({ from: start!, to: end! }) : start ? "Bitiş gününü seç" : "Başlangıç gününü seç";

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Tarih aralığı"
      footer={
        <View style={styles.footer}>
          <Text style={styles.summary} numberOfLines={1} {...textScale.dense}>
            {summary}
          </Text>
          <Button
            label="Uygula"
            icon="checkmark"
            disabled={!ready}
            onPress={() => {
              if (start && end) onApply({ from: start, to: end });
            }}
          />
        </View>
      }
    >
      <ChipGroup contentPadding={0} style={styles.presets}>
        {quick.map((item) => (
          <Chip
            key={item.key}
            label={item.label}
            size="sm"
            selected={start === item.range.from && end === item.range.to}
            onPress={() => applyPreset(item.range)}
          />
        ))}
      </ChipGroup>

      <View style={styles.monthBar}>
        <Touchable
          onPress={() => shift(-1)}
          disabled={!canPrev}
          style={[styles.navBtn, !canPrev && styles.navOff]}
          accessibilityRole="button"
          accessibilityLabel="Önceki ay"
        >
          <Ionicons name="chevron-back" size={18} color={colors.textPrimary} />
        </Touchable>
        <Text style={styles.monthTitle} {...textScale.dense}>
          {`${MONTHS_TR[cursor.m]} ${cursor.y}`}
        </Text>
        <Touchable
          onPress={() => shift(1)}
          disabled={!canNext}
          style={[styles.navBtn, !canNext && styles.navOff]}
          accessibilityRole="button"
          accessibilityLabel="Sonraki ay"
        >
          <Ionicons name="chevron-forward" size={18} color={colors.textPrimary} />
        </Touchable>
      </View>

      <View style={styles.grid}>
        {WEEKDAYS_SHORT_TR.map((label) => (
          <View key={label} style={styles.cell}>
            <Text style={styles.weekday} {...textScale.badge}>
              {label}
            </Text>
          </View>
        ))}
        {cells.map((day, index) => {
          if (!day) return <View key={`e${index}`} style={styles.cell} />;
          const disabled = day > today || day < MIN_DAY;
          const isStart = day === start;
          const isEnd = day === end;
          const inside = start != null && end != null && day > start && day < end;
          const edge = isStart || isEnd;
          return (
            <View key={day} style={[styles.cell, inside && styles.cellInside, isStart && end && styles.cellStart, isEnd && styles.cellEnd]}>
              <Touchable
                onPress={() => pick(day)}
                disabled={disabled}
                haptic="light"
                style={[styles.day, edge && styles.dayEdge, day === today && !edge && styles.dayToday]}
                accessibilityRole="button"
                accessibilityState={{ selected: edge, disabled }}
                accessibilityLabel={day}
              >
                <Text
                  style={[styles.dayText, edge && styles.dayTextEdge, disabled && styles.dayTextOff]}
                  {...textScale.badge}
                >
                  {parseDay(day)!.d}
                </Text>
              </Touchable>
            </View>
          );
        })}
      </View>
    </BottomSheet>
  );
}

const CELL = 40;

const styles = StyleSheet.create({
  presets: { marginBottom: space.md },
  monthBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: space.sm },
  navBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface2,
  },
  navOff: { opacity: 0.35 },
  monthTitle: { ...type.h3, color: colors.textPrimary },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: { width: "14.2857%", height: CELL, alignItems: "center", justifyContent: "center", marginVertical: 1 },
  cellInside: { backgroundColor: colors.brandDim },
  cellStart: { backgroundColor: colors.brandDim, borderTopLeftRadius: radius.pill, borderBottomLeftRadius: radius.pill },
  cellEnd: { backgroundColor: colors.brandDim, borderTopRightRadius: radius.pill, borderBottomRightRadius: radius.pill },
  weekday: { ...type.micro, color: colors.textTertiary },
  day: { width: 36, height: 36, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  dayEdge: { backgroundColor: colors.brand },
  dayToday: { borderWidth: 1, borderColor: colors.brandBorder },
  dayText: { ...type.tableNum, color: colors.textPrimary },
  dayTextEdge: { color: colors.textOnBrand },
  dayTextOff: { color: colors.textDisabled },
  footer: { flexDirection: "row", alignItems: "center", gap: space.md },
  summary: { ...type.label, color: colors.textSecondary, flex: 1 },
});
