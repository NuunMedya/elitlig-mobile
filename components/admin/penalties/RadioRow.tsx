/**
 * RadioRow / RadioGroup — başlık + açıklamalı tek seçim satırları.
 *
 * NE: web'deki `pen-radio` kartlarının mobil karşılığı (ceza aşaması, süre
 * türü, savunma kararı). Seçenek açıklaması uzun olduğu için çip ya da
 * segment yerine dikey liste kullanılır.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { Touchable } from "@/components/ui";
import { colors, hairline, radius, space, textScale, type } from "@/theme";

export interface RadioOption<V extends string> {
  value: V;
  label: string;
  hint?: string;
}

export function RadioGroup<V extends string>({
  options,
  value,
  onChange,
  disabled,
}: {
  options: RadioOption<V>[];
  value: V | null | undefined;
  onChange: (value: V) => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.group}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Touchable
            key={option.value}
            onPress={() => onChange(option.value)}
            disabled={disabled}
            haptic="selection"
            style={[styles.row, selected ? styles.rowSelected : null]}
            accessibilityRole="radio"
            accessibilityState={{ selected, disabled }}
            accessibilityLabel={option.hint ? `${option.label}. ${option.hint}` : option.label}
          >
            <Ionicons
              name={selected ? "radio-button-on" : "radio-button-off"}
              size={20}
              color={selected ? colors.brandAccent : colors.textTertiary}
            />
            <View style={styles.texts}>
              <Text style={styles.label} {...textScale.dense}>
                {option.label}
              </Text>
              {option.hint ? (
                <Text style={styles.hint} {...textScale.dense}>
                  {option.hint}
                </Text>
              ) : null}
            </View>
          </Touchable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: space.sm },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space.md,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface1,
  },
  rowSelected: { borderColor: colors.brandAccent, backgroundColor: colors.brandDim },
  texts: { flex: 1, gap: 2 },
  label: { ...type.label, color: colors.textPrimary },
  hint: { ...type.caption, color: colors.textSecondary },
});
