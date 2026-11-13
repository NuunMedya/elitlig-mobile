/**
 * DateSheet — harici paket gerektirmeyen tarih (ve isteğe bağlı saat) seçici.
 *
 * NE: aylık ızgara (Pazartesi başlar) + saat/dakika adımlayıcıları. Değer
 * "YYYY-MM-DD" (yalnız tarih) ya da "YYYY-MM-DDTHH:mm" (saatli, yerel
 * İstanbul saati) olarak döner. Sunucuya giderken ekran gerektiği biçime
 * çevirir; çoğu yönetim ucu bu iki biçimi doğrudan kabul eder.
 *
 * KURGU (yönetim tasarım dili): üstte seçilen günün büyük özeti (gün adı +
 * tarih + saat, Archivo); hemen altında kısayol çipleri (Bugün · Yarın ·
 * Haftaya); ay gezinme cam yuvarlak düğmeli; günler yuvarlak hücre — seçili
 * gün marka degradesi + parıltı, bugün ince halka, hafta sonu soluk mor.
 * Saat ve dakika iki cam karoda adımlayıcı.
 *
 * NEDEN YEREL PAKET YOK: @react-native-community/datetimepicker yerel modül
 * ister ve yeni mağaza sürümü gerektirir; bu seçici her sürümde çalışır.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { LinearGradient } from "expo-linear-gradient";

import { BottomSheet, Button, Chip, ChipGroup, Touchable } from "@/components/ui";
import { isoDay } from "@/lib/admin/format";
import { colors, fonts, glowStyle, hairline, radius, space, textScale, touchSlop, type, upperTR } from "@/theme";

const MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const WEEKDAYS = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];
const DAY_NAMES = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];

/** "YYYY-MM-DD" + n gün (yerel takvim). */
function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d + n);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
const pad = (n: number) => String(n).padStart(2, "0");

export interface DateSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  /** "YYYY-MM-DD" ya da "YYYY-MM-DDTHH:mm" */
  value?: string | null;
  withTime?: boolean;
  onSelect: (value: string | null) => void;
  clearable?: boolean;
  /** Dakika adımı (varsayılan 5). */
  minuteStep?: number;
}

export function DateSheet({
  visible,
  onClose,
  title = "Tarih seç",
  value,
  withTime,
  onSelect,
  clearable,
  minuteStep = 5,
}: DateSheetProps) {
  const initial = value || isoDay();
  const [day, setDay] = useState(initial.slice(0, 10));
  const [cursor, setCursor] = useState(initial.slice(0, 7));
  const [hour, setHour] = useState(Number(initial.slice(11, 13)) || 20);
  const [minute, setMinute] = useState(Number(initial.slice(14, 16)) || 0);

  useEffect(() => {
    if (!visible) return;
    const v = value || isoDay();
    setDay(v.slice(0, 10));
    setCursor(v.slice(0, 7));
    if (v.length > 10) {
      setHour(Number(v.slice(11, 13)) || 0);
      setMinute(Number(v.slice(14, 16)) || 0);
    }
  }, [visible, value]);

  const year = Number(cursor.slice(0, 4));
  const month = Number(cursor.slice(5, 7)) - 1;
  const today = isoDay();

  const cells = useMemo(() => {
    const first = new Date(year, month, 1);
    const lead = (first.getDay() + 6) % 7;
    const days = new Date(year, month + 1, 0).getDate();
    const list: (string | null)[] = [];
    for (let i = 0; i < lead; i += 1) list.push(null);
    for (let d = 1; d <= days; d += 1) list.push(`${year}-${pad(month + 1)}-${pad(d)}`);
    while (list.length % 7 !== 0) list.push(null);
    return list;
  }, [year, month]);

  const shift = (delta: number) => {
    const date = new Date(year, month + delta, 1);
    setCursor(`${date.getFullYear()}-${pad(date.getMonth() + 1)}`);
  };

  const jump = (iso: string) => {
    setDay(iso);
    setCursor(iso.slice(0, 7));
  };

  const [sy, sm, sd] = day.split("-").map(Number);
  const selectedDate = new Date(sy, (sm || 1) - 1, sd || 1);

  const confirm = () => {
    onSelect(withTime ? `${day}T${pad(hour)}:${pad(minute)}` : day);
    onClose();
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={title}
      footer={
        <View style={styles.footer}>
          {clearable ? (
            <Button
              label="Temizle"
              size="lg"
              variant="ghost"
              onPress={() => {
                onSelect(null);
                onClose();
              }}
            />
          ) : null}
          <Button label="Tamam" onPress={confirm} style={styles.ok} size="lg" />
        </View>
      }
    >
      <View style={styles.summary}>
        <View style={styles.flex}>
          <Text style={styles.summaryDay} {...textScale.badge}>
            {upperTR(DAY_NAMES[selectedDate.getDay()])}
            {day === today ? " · BUGÜN" : ""}
          </Text>
          <Text style={styles.summaryDate} numberOfLines={1} {...textScale.badge}>
            {selectedDate.getDate()} {MONTHS[selectedDate.getMonth()]} {selectedDate.getFullYear()}
          </Text>
        </View>
        {withTime ? (
          <Text style={styles.summaryTime} {...textScale.badge}>
            {pad(hour)}:{pad(minute)}
          </Text>
        ) : null}
      </View>

      <ChipGroup scrollable contentPadding={0} style={styles.quick}>
        {[
          { label: "Bugün", iso: today },
          { label: "Yarın", iso: addDays(today, 1) },
          { label: "Haftaya", iso: addDays(today, 7) },
        ].map((q) => (
          <Chip key={q.label} label={q.label} size="sm" selected={day === q.iso} onPress={() => jump(q.iso)} />
        ))}
      </ChipGroup>

      <View style={styles.nav}>
        <Touchable onPress={() => shift(-1)} hitSlop={touchSlop(36)} accessibilityLabel="Önceki ay" style={styles.navButton} feedback="icon">
          <Ionicons name="chevron-back" size={20} color={colors.textPrimary} />
        </Touchable>
        <Text style={styles.month} {...textScale.dense}>
          {MONTHS[month]} {year}
        </Text>
        <Touchable onPress={() => shift(1)} hitSlop={touchSlop(36)} accessibilityLabel="Sonraki ay" style={styles.navButton} feedback="icon">
          <Ionicons name="chevron-forward" size={20} color={colors.textPrimary} />
        </Touchable>
      </View>
      <View style={styles.grid}>
        {WEEKDAYS.map((w, i) => (
          <Text key={w} style={[styles.weekday, i >= 5 ? styles.weekend : null]} {...textScale.badge}>
            {w}
          </Text>
        ))}
        {cells.map((iso, index) =>
          iso ? (
            <View key={iso} style={styles.cell}>
              <Touchable
                onPress={() => setDay(iso)}
                haptic="selection"
                feedback="icon"
                style={[styles.dayDot, iso === day ? styles.dayOn : iso === today ? styles.dayToday : null]}
                accessibilityLabel={iso}
                accessibilityState={{ selected: iso === day }}
              >
                {iso === day ? (
                  <LinearGradient colors={colors.gradientBrand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, styles.dayFill]} />
                ) : null}
                <Text
                  style={[styles.cellText, index % 7 >= 5 ? styles.weekendText : null, iso === day ? styles.cellTextOn : null, iso === today && iso !== day ? styles.cellTextToday : null]}
                  {...textScale.badge}
                >
                  {Number(iso.slice(8))}
                </Text>
              </Touchable>
            </View>
          ) : (
            <View key={`e${index}`} style={styles.cell} />
          )
        )}
      </View>
      {withTime ? (
        <View style={styles.timeRow}>
          <Spinner label="Saat" value={hour} onChange={(v) => setHour((v + 24) % 24)} step={1} />
          <Text style={styles.colon}>:</Text>
          <Spinner label="Dakika" value={minute} onChange={(v) => setMinute((v + 60) % 60)} step={minuteStep} />
        </View>
      ) : null}
    </BottomSheet>
  );
}

function Spinner({ label, value, onChange, step }: { label: string; value: number; onChange: (v: number) => void; step: number }) {
  return (
    <View style={styles.spinner}>
      <Touchable onPress={() => onChange(value + step)} hitSlop={touchSlop(32)} accessibilityLabel={`${label} artır`} feedback="icon" style={styles.spinButton}>
        <Ionicons name="chevron-up" size={20} color={colors.textSecondary} />
      </Touchable>
      <Text style={styles.spinValue} {...textScale.badge}>{pad(value)}</Text>
      <Text style={styles.spinLabel} {...textScale.badge}>{upperTR(label)}</Text>
      <Touchable onPress={() => onChange(value - step)} hitSlop={touchSlop(32)} accessibilityLabel={`${label} azalt`} feedback="icon" style={styles.spinButton}>
        <Ionicons name="chevron-down" size={20} color={colors.textSecondary} />
      </Touchable>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  summary: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.xl,
    backgroundColor: colors.brandDim,
    borderWidth: hairline,
    borderColor: colors.brandBorder,
  },
  summaryDay: { ...type.overline, color: colors.brandAccent },
  summaryDate: { ...type.scoreSm, color: colors.textPrimary, marginTop: space.xxs },
  summaryTime: { ...type.scoreMd, color: colors.brandAccent },
  quick: { marginTop: space.md },
  nav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: space.md, paddingBottom: space.sm },
  navButton: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface2,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  month: { ...type.h3, color: colors.textPrimary },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  weekday: { width: `${100 / 7}%`, textAlign: "center", ...type.micro, color: colors.textTertiary, paddingVertical: space.xs },
  weekend: { color: colors.brandAccent },
  cell: { width: `${100 / 7}%`, aspectRatio: 1.1, alignItems: "center", justifyContent: "center" },
  dayDot: { width: 38, height: 38, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  dayOn: { ...glowStyle(colors.glow, 1) },
  dayFill: { borderRadius: radius.pill },
  dayToday: { borderWidth: 1.5, borderColor: colors.brandBorder },
  cellText: { ...type.tableNum, color: colors.textPrimary },
  weekendText: { color: colors.textSecondary },
  cellTextOn: { color: colors.textOnBrand, fontFamily: fonts.bold },
  cellTextToday: { color: colors.brandAccent, fontFamily: fonts.bold },
  timeRow: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: space.lg, paddingVertical: space.lg },
  colon: { ...type.scoreMd, color: colors.textTertiary },
  spinner: {
    alignItems: "center",
    gap: space.xxs,
    width: 96,
    paddingVertical: space.sm,
    borderRadius: radius.xl,
    backgroundColor: colors.surface2,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  spinButton: { width: 40, height: 32, alignItems: "center", justifyContent: "center" },
  spinValue: { ...type.scoreMd, color: colors.textPrimary },
  spinLabel: { ...type.nano, color: colors.textTertiary },
  footer: { flexDirection: "row", gap: space.sm, justifyContent: "flex-end" },
  ok: { flex: 1 },
});
