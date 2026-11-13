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

import { LinearGradient } from "expo-linear-gradient";

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
            {selected ? (
              <LinearGradient colors={colors.gradientSignature} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={styles.rail} />
            ) : null}
            <View style={[styles.knob, selected ? styles.knobOn : null]}>
              {selected ? <Ionicons name="checkmark" size={13} color={colors.textOnBrand} /> : null}
            </View>
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
    borderRadius: radius.lg,
    borderWidth: hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface2,
    overflow: "hidden",
  },
  rowSelected: { borderColor: colors.brandBorder, backgroundColor: colors.brandDim },
  rail: { position: "absolute", left: 0, top: 0, bottom: 0, width: 3 },
  knob: {
    width: 20,
    height: 20,
    marginTop: 1,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  knobOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  texts: { flex: 1, gap: 2 },
  label: { ...type.label, color: colors.textPrimary },
  hint: { ...type.caption, color: colors.textSecondary },
});
