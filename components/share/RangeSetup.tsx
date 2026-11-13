/**
 * Sıralama paylaşımlarının ayarı — "hangi 10 satır?".
 *
 * Kullanıcının takımı (ya da kendisi) listede varsa iki kip sunulur:
 * "Takımım çevresi" (odak ortalanmış 10'luk pencere, varsayılan) ve
 * "Aralık seç". Yoksa doğrudan soru sorulur: "Kaçıncı sıradan kaçıncı
 * sıraya?" — iki sayı seçici, varsayılan 1–10, en fazla 10 satır.
 */

import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { SegmentedControl, Stepper } from "@/components/ui";
import { clampRange } from "@/lib/share/format";
import { colors, radius, space, textScale, type } from "@/theme";

export type RangeMode = "focus" | "range";

export interface RangeSetupProps {
  total: number;
  from: number;
  to: number;
  onChange: (from: number, to: number) => void;
  /** Odak varsa kipler gösterilir. */
  focusLabel?: string | null;
  mode: RangeMode;
  onMode: (mode: RangeMode) => void;
  /** "takım" / "oyuncu" */
  noun?: string;
}

export const MAX_ROWS = 10;

export function RangeSetup({ total, from, to, onChange, focusLabel, mode, onMode, noun = "takım" }: RangeSetupProps) {
  const showRange = !focusLabel || mode === "range";
  const setFrom = (value: number) => {
    // Başlangıç değişince pencere boyu korunur (1–10 → 2–11): kullanıcı
    // aralığı kaydırır; bitiş listenin sonunu aşmaz.
    const size = Math.max(1, to - from + 1);
    const [a, b] = clampRange(total, value, value + size - 1, MAX_ROWS);
    onChange(a, b);
  };
  const setTo = (value: number) => {
    const b = Math.max(1, Math.min(total, value));
    const a = Math.min(from, b);
    onChange(Math.max(a, b - MAX_ROWS + 1), b);
  };

  return (
    <View style={styles.box}>
      {focusLabel ? (
        <SegmentedControl
          size="sm"
          items={[
            { key: "focus", label: focusLabel },
            { key: "range", label: "Aralık seç" },
          ]}
          value={mode}
          onChange={onMode}
        />
      ) : null}
      {showRange ? (
        <View style={styles.rangeRow}>
          <View style={styles.flex}>
            <Text style={styles.question} {...textScale.dense}>
              Kaçıncı sıradan kaçıncı sıraya?
            </Text>
            <Text style={styles.note} {...textScale.dense}>
              En fazla {MAX_ROWS} satır · {total} {noun}
            </Text>
          </View>
          <Stepper value={from} onChange={setFrom} min={1} max={total} size="sm" accessibilityLabel="Başlangıç sırası" />
          <Text style={styles.dash}>–</Text>
          <Stepper value={to} onChange={setTo} min={from} max={Math.min(total, from + MAX_ROWS - 1)} size="sm" accessibilityLabel="Bitiş sırası" />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface2,
  },
  rangeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.s,
  },
  flex: {
    flex: 1,
  },
  question: {
    ...type.labelSm,
    color: colors.textPrimary,
  },
  note: {
    ...type.meta,
    color: colors.textTertiary,
  },
  dash: {
    ...type.label,
    color: colors.textTertiary,
  },
});
