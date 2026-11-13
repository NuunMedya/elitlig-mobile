/**
 * AJANDA GÖRÜNÜMLERİ — ay ızgarası, saat ızgarası (hafta/gün), gün listesi
 * ve 60 günlük liste. Web elitlig-client tools/Agenda.js MonthView, TimeGrid,
 * DayList ve ListView'in mobil karşılığı.
 *
 * GECE TEMASI: ay ızgarası cam kartta, bugün imza degradeli daire, seçili
 * gün halka; etkinlik noktaları renkli kapsül. Gün listesi etkinlik
 * renginde yarı saydam kartlar: büyük Archivo saat, tür IconTile'ı, yer.
 *
 * MOBİL UYARLAMA: ay hücresi telefonda ~48px olduğundan etkinlik başlığı
 * yerine renkli noktalar çizilir; seçili günün listesi ızgaranın altında
 * durur (web'de yan panel). Hücreye basılı tutmak o güne yeni etkinlik açar
 * (web'de çift tıklama). Saat ızgarasında boş alana dokunmak o saate
 * etkinlik açar.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React, { memo, useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";

import { LinearGradient } from "expo-linear-gradient";

import { IconTile, Touchable, withAlpha, type IconTileTone } from "@/components/ui";
import { eventColor } from "@/lib/admin/toolPalette";
import { EVENT_CATEGORY_LABELS, RECURRENCE_LABELS, type AgendaOccurrence } from "@/lib/api/admin/tools";
import { colors, hairline, radius, space, textScale, type, upperTR } from "@/theme";

import {
  WEEKDAYS,
  formatClock,
  isoDate,
  itemsOnDay,
  layoutLanes,
  monthGrid,
  relativeDayLocal,
  sameDay,
  startOfDay,
} from "./agendaUtils";

const HOUR_PX = 52;

/** Etkinlik türü → IconTile simgesi ve tonu (kart kimliği). */
const CATEGORY_ICON: Record<string, { icon: keyof typeof Ionicons.glyphMap; tone: IconTileTone }> = {
  general: { icon: "calendar-outline", tone: "signature" },
  match: { icon: "football-outline", tone: "mint" },
  meeting: { icon: "people-outline", tone: "violet" },
  training: { icon: "fitness-outline", tone: "cyan" },
  deadline: { icon: "alarm-outline", tone: "red" },
  payment: { icon: "card-outline", tone: "gold" },
  personal: { icon: "person-outline", tone: "pink" },
};

/* ═══════════════════════════ AY ═══════════════════════════ */

export const MonthView = memo(function MonthView({
  cursor,
  items,
  selected,
  onSelect,
  onCreate,
}: {
  cursor: Date;
  items: AgendaOccurrence[];
  selected: Date;
  onSelect: (day: Date) => void;
  onCreate: (day: Date) => void;
}) {
  const days = useMemo(() => monthGrid(cursor.getFullYear(), cursor.getMonth()), [cursor]);
  const today = new Date();
  return (
    <View style={styles.month}>
      <View style={styles.weekRow}>
        {WEEKDAYS.map((name, i) => (
          <Text key={name} style={[styles.wd, i >= 5 ? styles.wdWeekend : null]} {...textScale.badge}>
            {upperTR(name)}
          </Text>
        ))}
      </View>
      {Array.from({ length: 6 }, (_, week) => (
        <View key={week} style={styles.weekRow}>
          {days.slice(week * 7, week * 7 + 7).map((day) => {
            const list = itemsOnDay(items, day);
            const outside = day.getMonth() !== cursor.getMonth();
            const isToday = sameDay(day, today);
            const isSelected = sameDay(day, selected);
            return (
              <Touchable
                key={day.toISOString()}
                feedback="none"
                haptic="selection"
                onPress={() => onSelect(day)}
                onLongPress={() => onCreate(day)}
                style={[styles.cell, isSelected ? styles.cellSelected : null]}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={`${day.toLocaleDateString("tr-TR", { day: "numeric", month: "long" })}, ${list.length} etkinlik`}
                accessibilityHint="Seçmek için dokun, etkinlik eklemek için basılı tut"
              >
                <View style={[styles.num, isSelected && !isToday ? styles.numSelected : null]}>
                  {isToday ? <LinearGradient colors={colors.gradientSignature} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, styles.numFill]} /> : null}
                  <Text
                    style={[styles.numText, outside ? styles.outside : null, isToday ? styles.numTodayText : null]}
                    {...textScale.badge}
                  >
                    {day.getDate()}
                  </Text>
                </View>
                <View style={styles.dots}>
                  {list.slice(0, 3).map((item) => (
                    <View
                      key={item.occurrence_key}
                      style={[styles.dot, { backgroundColor: eventColor(item) }, item.source === "todo" ? styles.dotTodo : null]}
                    />
                  ))}
                </View>
                {list.length > 3 ? (
                  <Text style={styles.more} {...textScale.badge}>
                    +{list.length - 3}
                  </Text>
                ) : null}
              </Touchable>
            );
          })}
        </View>
      ))}
    </View>
  );
});

/* ═══════════════════════════ SAAT IZGARASI ═══════════════════════════ */

export function TimeGrid({
  days,
  items,
  onCreate,
  onOpen,
}: {
  days: Date[];
  items: AgendaOccurrence[];
  onCreate: (day: Date, hour: number) => void;
  onOpen: (item: AgendaOccurrence) => void;
}) {
  const scrollRef = useRef<ScrollView>(null);
  const [now, setNow] = useState(() => new Date());
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => scrollRef.current?.scrollTo({ y: HOUR_PX * 7.5, animated: false }), 0);
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => {
      clearTimeout(t);
      clearInterval(timer);
    };
  }, []);
  const hours = Array.from({ length: 24 }, (_, h) => h);
  const gutter = 40;
  const colWidth = width ? (width - gutter) / days.length : 0;
  const single = days.length === 1;

  return (
    <View style={styles.time} onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
      <View style={styles.timeHead}>
        <View style={{ width: gutter }} />
        {days.map((day) => {
          const allDay = itemsOnDay(items, day).filter((item) => item.all_day || item.source === "todo");
          const isToday = sameDay(day, now);
          return (
            <View key={day.toISOString()} style={[styles.timeDay, { width: colWidth || undefined }]}>
              {!single ? (
                <>
                  <Text style={[styles.timeWd, isToday ? styles.todayText : null]} {...textScale.badge}>
                    {WEEKDAYS[(day.getDay() + 6) % 7]}
                  </Text>
                  <Text style={[styles.timeNum, isToday ? styles.todayText : null]} {...textScale.badge}>
                    {day.getDate()}
                  </Text>
                </>
              ) : null}
              {allDay.slice(0, single ? 6 : 2).map((item) => (
                <Touchable
                  key={item.occurrence_key}
                  feedback="chip"
                  onPress={() => onOpen(item)}
                  style={[styles.allDay, { backgroundColor: withAlpha(eventColor(item), 0.2), borderColor: eventColor(item) }, item.source === "todo" ? styles.dashed : null]}
                  accessibilityLabel={`${item.source === "todo" ? "Yapılacak" : "Tüm gün"}: ${item.title}`}
                >
                  <Text style={styles.allDayText} numberOfLines={1} {...textScale.badge}>
                    {item.title}
                  </Text>
                </Touchable>
              ))}
              {allDay.length > (single ? 6 : 2) ? (
                <Text style={styles.more} {...textScale.badge}>
                  +{allDay.length - (single ? 6 : 2)}
                </Text>
              ) : null}
            </View>
          );
        })}
      </View>
      <ScrollView ref={scrollRef} style={styles.timeScroll} nestedScrollEnabled>
        <View style={[styles.grid, { height: HOUR_PX * 24 }]}>
          <View style={{ width: gutter }}>
            {hours.map((h) => (
              <Text key={h} style={[styles.hour, { top: h * HOUR_PX - 6 }]} {...textScale.badge}>
                {h ? `${String(h).padStart(2, "0")}:00` : ""}
              </Text>
            ))}
          </View>
          {days.map((day) => {
            const timed = itemsOnDay(items, day).filter((item) => !item.all_day && item.source !== "todo");
            const boxes = layoutLanes(timed, day);
            return (
              <Touchable
                key={day.toISOString()}
                feedback="none"
                onPress={(event) => onCreate(day, Math.max(0, Math.min(23, Math.floor(event.nativeEvent.locationY / HOUR_PX))))}
                style={[styles.col, { width: colWidth || undefined }]}
                accessibilityLabel={`${day.toLocaleDateString("tr-TR", { weekday: "long", day: "numeric" })} — etkinlik eklemek için dokun`}
              >
                {hours.map((h) => (
                  <View key={h} pointerEvents="none" style={[styles.line, { top: h * HOUR_PX }]} />
                ))}
                {sameDay(day, now) ? (
                  <View pointerEvents="none" style={[styles.now, { top: ((now.getHours() * 60 + now.getMinutes()) / 60) * HOUR_PX }]} />
                ) : null}
                {boxes.map(({ item, lane, lanes, top, height }) => {
                  const color = eventColor(item);
                  const laneWidth = colWidth ? (colWidth - 2) / lanes : 0;
                  return (
                    <Touchable
                      key={item.occurrence_key}
                      feedback="card"
                      onPress={() => onOpen(item)}
                      style={[
                        styles.block,
                        {
                          top: (top / 60) * HOUR_PX,
                          height: Math.max(22, (height / 60) * HOUR_PX - 2),
                          left: 1 + lane * laneWidth,
                          width: laneWidth ? laneWidth - 2 : undefined,
                          backgroundColor: withAlpha(color, 0.22),
                          borderLeftColor: color,
                        },
                      ]}
                      accessibilityLabel={`${formatClock(item.occurrence_start)} ${item.title}`}
                    >
                      <Text style={styles.blockTitle} numberOfLines={single ? 2 : 3} {...textScale.badge}>
                        {item.title}
                      </Text>
                      {single || lanes === 1 ? (
                        <Text style={styles.blockMeta} numberOfLines={1} {...textScale.badge}>
                          {formatClock(item.occurrence_start)}
                          {item.occurrence_end ? ` – ${formatClock(item.occurrence_end)}` : ""}
                          {single && item.location ? ` · ${item.location}` : ""}
                        </Text>
                      ) : null}
                    </Touchable>
                  );
                })}
              </Touchable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

/* ═══════════════════════════ GÜN LİSTESİ ═══════════════════════════ */

export function DayList({ items, onOpen, emptyText }: { items: AgendaOccurrence[]; onOpen: (item: AgendaOccurrence) => void; emptyText?: string }) {
  if (!items.length) {
    return emptyText ? (
      <Text style={styles.empty} {...textScale.long}>
        {emptyText}
      </Text>
    ) : null;
  }
  return (
    <View style={styles.dayList}>
      {items.map((item) => {
        const isTodo = item.source === "todo";
        const color = eventColor(item);
        return (
          <Touchable
            key={item.occurrence_key}
            feedback="card"
            onPress={() => onOpen(item)}
            style={[styles.dayItem, { backgroundColor: withAlpha(color, 0.1), borderColor: withAlpha(color, 0.3) }]}
            accessibilityRole="button"
            accessibilityLabel={`${item.all_day ? "Tüm gün" : formatClock(item.occurrence_start)} ${item.title}`}
          >
            <View style={[styles.bar, { backgroundColor: color }, isTodo ? styles.barTodo : null]} />
            <View style={styles.dayTime}>
              <Text style={styles.dayTimeText} {...textScale.badge}>
                {isTodo ? "Son" : item.all_day ? "Tüm" : formatClock(item.occurrence_start)}
              </Text>
              {item.occurrence_end && !item.all_day && !isTodo ? (
                <Text style={styles.dayTimeEnd} {...textScale.badge}>
                  {formatClock(item.occurrence_end)}
                </Text>
              ) : isTodo ? (
                <Text style={styles.dayTimeEnd} {...textScale.badge}>
                  {formatClock(item.occurrence_start)}
                </Text>
              ) : (
                <Text style={styles.dayTimeEnd} {...textScale.badge}>
                  gün
                </Text>
              )}
            </View>
            <IconTile icon={isTodo ? "checkbox-outline" : CATEGORY_ICON[item.category]?.icon ?? "calendar-outline"} tone={isTodo ? "neutral" : CATEGORY_ICON[item.category]?.tone ?? "signature"} size={36} glow={false} />
            <View style={styles.dayMain}>
              <Text style={styles.dayTitle} numberOfLines={2} {...textScale.dense}>
                {item.title}
              </Text>
              <View style={styles.dayMetaRow}>
                <Ionicons name={item.location ? "location-outline" : "pricetag-outline"} size={12} color={colors.textTertiary} />
                <Text style={styles.dayMeta} numberOfLines={1} {...textScale.dense}>
                  {isTodo ? "Yapılacak" : EVENT_CATEGORY_LABELS[item.category] ?? "Genel"}
                  {item.location ? ` · ${item.location}` : ""}
                  {item.recurrence && item.recurrence !== "none" ? ` · ${RECURRENCE_LABELS[item.recurrence]}` : ""}
                </Text>
                {item.remind_minutes != null && !isTodo ? <Ionicons name="notifications-outline" size={12} color={colors.textTertiary} accessibilityLabel="hatırlatmalı" /> : null}
              </View>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
          </Touchable>
        );
      })}
    </View>
  );
}

/* ═══════════════════════════ LİSTE (60 GÜN) ═══════════════════════════ */

export function groupByDay(items: AgendaOccurrence[]): { key: string; title: string; hint: string; items: AgendaOccurrence[] }[] {
  const map = new Map<string, AgendaOccurrence[]>();
  for (const item of items) {
    const key = isoDate(new Date(item.occurrence_start));
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  }
  return [...map.entries()].map(([key, list]) => {
    const [y, m, d] = key.split("-").map(Number);
    const date = new Date(y, m - 1, d, 12);
    return {
      key,
      title: relativeDayLocal(date),
      hint: date.toLocaleDateString("tr-TR", { day: "numeric", month: "long" }),
      items: itemsOnDay(list, startOfDay(date)),
    };
  });
}

const styles = StyleSheet.create({
  month: { gap: 2, padding: space.sm, borderRadius: radius.xl, borderWidth: hairline, borderColor: colors.border, backgroundColor: colors.surface1 },
  weekRow: { flexDirection: "row" },
  wd: { flex: 1, textAlign: "center", ...type.nano, color: colors.textTertiary, paddingVertical: space.xs },
  wdWeekend: { color: colors.brandAccent },
  cell: {
    flex: 1,
    height: 54,
    alignItems: "center",
    paddingTop: space.xs,
    gap: space.xxs,
    borderRadius: radius.sm,
  },
  cellSelected: { backgroundColor: colors.brandDim },
  num: { width: 30, height: 30, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  numFill: { borderRadius: radius.pill },
  numSelected: { borderWidth: 1.5, borderColor: colors.brandAccent },
  numText: { ...type.tableNum, color: colors.textPrimary },
  numTodayText: { color: colors.onDark },
  outside: { color: colors.textDisabled },
  dots: { flexDirection: "row", gap: 3 },
  dot: { width: 8, height: 4, borderRadius: 2 },
  dotTodo: { borderRadius: 1 },
  more: { ...type.nano, color: colors.textTertiary },

  time: { flex: 1 },
  timeHead: {
    flexDirection: "row",
    borderBottomWidth: hairline,
    borderBottomColor: colors.separator,
    paddingBottom: space.xs,
  },
  timeDay: { alignItems: "stretch", gap: 2, paddingHorizontal: 1 },
  timeWd: { ...type.micro, color: colors.textTertiary, textAlign: "center" },
  timeNum: { ...type.tableNumStrong, color: colors.textPrimary, textAlign: "center" },
  todayText: { color: colors.brandAccent },
  allDay: { borderRadius: radius.xs, borderLeftWidth: 3, paddingHorizontal: 3, paddingVertical: 1 },
  dashed: { borderStyle: "dashed", borderWidth: 1 },
  allDayText: { ...type.nano, color: colors.textPrimary },
  timeScroll: { flex: 1 },
  grid: { flexDirection: "row" },
  hour: { position: "absolute", right: space.xs, ...type.nano, color: colors.textTertiary },
  col: { height: HOUR_PX * 24, borderLeftWidth: hairline, borderLeftColor: colors.separator },
  line: { position: "absolute", left: 0, right: 0, height: hairline, backgroundColor: colors.separator },
  now: { position: "absolute", left: 0, right: 0, height: 2, backgroundColor: colors.live },
  block: {
    position: "absolute",
    borderRadius: radius.xs,
    borderLeftWidth: 3,
    paddingHorizontal: 3,
    paddingVertical: 2,
    overflow: "hidden",
  },
  blockTitle: { ...type.labelXs, color: colors.textPrimary },
  blockMeta: { ...type.nano, color: colors.textSecondary },

  empty: { ...type.bodySm, color: colors.textTertiary, paddingVertical: space.md },
  dayList: { gap: space.sm },
  dayItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    minHeight: 64,
    paddingVertical: space.sm,
    paddingRight: space.md,
    borderRadius: radius.lg,
    borderWidth: hairline,
    overflow: "hidden",
  },
  bar: { width: 4, alignSelf: "stretch" },
  barTodo: { opacity: 0.6 },
  dayTime: { width: 50, alignItems: "center" },
  dayTimeText: { ...type.metricSm, color: colors.textPrimary },
  dayTimeEnd: { ...type.numSm, color: colors.textTertiary },
  dayMain: { flex: 1, gap: 2 },
  dayTitle: { ...type.h4, color: colors.textPrimary },
  dayMetaRow: { flexDirection: "row", alignItems: "center", gap: space.xs },
  dayMeta: { flex: 1, ...type.caption, color: colors.textTertiary },
});
