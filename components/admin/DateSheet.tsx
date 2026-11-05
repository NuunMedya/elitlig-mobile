/**
 * DateSheet — harici paket gerektirmeyen tarih (ve isteğe bağlı saat) seçici.
 *
 * NE: aylık ızgara (Pazartesi başlar) + saat/dakika adımlayıcıları. Değer
 * "YYYY-MM-DD" (yalnız tarih) ya da "YYYY-MM-DDTHH:mm" (saatli, yerel
 * İstanbul saati) olarak döner. Sunucuya giderken ekran gerektiği biçime
 * çevirir; çoğu yönetim ucu bu iki biçimi doğrudan kabul eder.
 *
 * NEDEN YEREL PAKET YOK: @react-native-community/datetimepicker yerel modül
 * ister ve yeni mağaza sürümü gerektirir; bu seçici her sürümde çalışır.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { BottomSheet, Button, Touchable } from "@/components/ui";
import { isoDay } from "@/lib/admin/format";
import { colors, fonts, radius, space, textScale, touchSlop, type } from "@/theme";

const MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const WEEKDAYS = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];
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
              variant="ghost"
              onPress={() => {
                onSelect(null);
                onClose();
              }}
            />
          ) : null}
          <Button label="Tamam" onPress={confirm} style={styles.ok} />
        </View>
      }
    >
      <View style={styles.nav}>
        <Touchable onPress={() => shift(-1)} hitSlop={touchSlop(24)} accessibilityLabel="Önceki ay">
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </Touchable>
        <Text style={styles.month} {...textScale.dense}>
          {MONTHS[month]} {year}
        </Text>
        <Touchable onPress={() => shift(1)} hitSlop={touchSlop(24)} accessibilityLabel="Sonraki ay">
          <Ionicons name="chevron-forward" size={22} color={colors.textPrimary} />
        </Touchable>
      </View>
      <View style={styles.grid}>
        {WEEKDAYS.map((w) => (
          <Text key={w} style={styles.weekday} {...textScale.badge}>
            {w}
          </Text>
        ))}
        {cells.map((iso, index) =>
          iso ? (
            <Touchable
              key={iso}
              onPress={() => setDay(iso)}
              haptic="selection"
              style={[styles.cell, iso === day ? styles.cellOn : iso === today ? styles.cellToday : null]}
              accessibilityLabel={iso}
            >
              <Text style={[styles.cellText, iso === day ? styles.cellTextOn : null]} {...textScale.badge}>
                {Number(iso.slice(8))}
              </Text>
            </Touchable>
          ) : (
            <View key={`e${index}`} style={styles.cell} />
          )
        )}
      </View>
      <Touchable onPress={() => { setDay(today); setCursor(today.slice(0, 7)); }} style={styles.todayLink}>
        <Text style={styles.todayText} {...textScale.dense}>Bugün</Text>
      </Touchable>
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
      <Touchable onPress={() => onChange(value + step)} hitSlop={touchSlop(24)} accessibilityLabel={`${label} artır`}>
        <Ionicons name="chevron-up" size={22} color={colors.textSecondary} />
      </Touchable>
      <Text style={styles.spinValue} {...textScale.badge}>{pad(value)}</Text>
      <Touchable onPress={() => onChange(value - step)} hitSlop={touchSlop(24)} accessibilityLabel={`${label} azalt`}>
        <Ionicons name="chevron-down" size={22} color={colors.textSecondary} />
      </Touchable>
    </View>
  );
}

const styles = StyleSheet.create({
  nav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: space.sm },
  month: { ...type.h3, color: colors.textPrimary },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  weekday: { width: `${100 / 7}%`, textAlign: "center", ...type.micro, color: colors.textTertiary, paddingVertical: space.xs },
  cell: { width: `${100 / 7}%`, aspectRatio: 1.15, alignItems: "center", justifyContent: "center", borderRadius: radius.md },
  cellOn: { backgroundColor: colors.brand },
  cellToday: { backgroundColor: colors.brandDim },
  cellText: { ...type.body, color: colors.textPrimary },
  cellTextOn: { color: colors.textOnBrand, fontFamily: fonts.bold },
  todayLink: { alignSelf: "center", paddingVertical: space.sm },
  todayText: { ...type.label, color: colors.brandAccent },
  timeRow: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: space.lg, paddingVertical: space.md },
  colon: { ...type.scoreMd, color: colors.textPrimary },
  spinner: { alignItems: "center", gap: space.xs },
  spinValue: { ...type.scoreMd, color: colors.textPrimary },
  footer: { flexDirection: "row", gap: space.sm, justifyContent: "flex-end" },
  ok: { flex: 1 },
});
