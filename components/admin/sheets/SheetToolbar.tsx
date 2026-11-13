/**
 * SheetToolbar — düzenleyicinin yatay kayan araç şeridi + renk seçici.
 *
 * Araçlar ekrandan liste olarak gelir (kalın, hizalama, biçim, Σ, doldur,
 * sırala, satır/sütun …); şerit yalnız çizer. Ayraç için `{ key, divider }`.
 * Renk seçici web paletinin aynısını (lib/admin/sheetEngine) kullanır.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { BottomSheet, Touchable } from "@/components/ui";
import { colors, hairline, radius, space, textScale, type } from "@/theme";

export type ToolItem =
  | { key: string; divider: true }
  | {
      key: string;
      icon?: keyof typeof Ionicons.glyphMap;
      text?: string;
      label: string;
      onPress: () => void;
      active?: boolean;
      disabled?: boolean;
      /** Simgenin altındaki renk şeridi (yazı / dolgu rengi). */
      swatch?: string | null;
    };

export function SheetToolbar({ tools }: { tools: ToolItem[] }) {
  return (
    <View style={styles.wrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always" contentContainerStyle={styles.row}>
        {tools.map((t) =>
          "divider" in t ? (
            <View key={t.key} style={styles.divider} />
          ) : (
            <Touchable
              key={t.key}
              onPress={t.onPress}
              disabled={t.disabled}
              feedback="button"
              style={[styles.tool, t.active ? styles.toolOn : null, t.disabled ? styles.disabled : null]}
              accessibilityLabel={t.label}
              accessibilityState={{ selected: Boolean(t.active), disabled: Boolean(t.disabled) }}
            >
              {t.icon ? <Ionicons name={t.icon} size={18} color={t.active ? colors.brandAccent : colors.textSecondary} /> : null}
              {t.text ? (
                <Text style={[styles.toolText, t.active ? styles.toolTextOn : null]} {...textScale.badge}>
                  {t.text}
                </Text>
              ) : null}
              {t.swatch !== undefined ? <View style={[styles.swatch, { backgroundColor: t.swatch || colors.surface3 }]} /> : null}
            </Touchable>
          )
        )}
      </ScrollView>
    </View>
  );
}

export function ColorSheet({
  visible,
  onClose,
  title,
  palette,
  value,
  onPick,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  palette: readonly string[];
  value?: string | null;
  onPick: (color: string) => void;
}) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title={title}>
      <View style={styles.palette}>
        {palette.map((c) => (
          <Touchable
            key={c || "none"}
            onPress={() => {
              onPick(c);
              onClose();
            }}
            feedback="chip"
            style={[styles.color, c ? { backgroundColor: c } : styles.none, (value || "") === c ? styles.colorOn : null]}
            accessibilityLabel={c ? `Renk ${c}` : "Renk yok"}
          >
            {!c ? <Ionicons name="close" size={18} color={colors.textTertiary} /> : null}
          </Touchable>
        ))}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: colors.surface1, borderBottomWidth: hairline, borderBottomColor: colors.glassLine },
  row: { alignItems: "center", gap: space.xxs, paddingHorizontal: space.sm, paddingVertical: space.xs },
  tool: {
    minWidth: 38,
    height: 36,
    paddingHorizontal: space.s,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: hairline,
    borderColor: "transparent",
  },
  toolOn: { backgroundColor: colors.brandDim, borderColor: colors.brandBorder },
  disabled: { opacity: 0.35 },
  toolText: { ...type.labelSm, color: colors.textSecondary },
  toolTextOn: { color: colors.brandAccent },
  swatch: { position: "absolute", left: space.s, right: space.s, bottom: 4, height: 3, borderRadius: radius.none },
  divider: { width: hairline, height: 22, backgroundColor: colors.border, marginHorizontal: space.xs },
  palette: { flexDirection: "row", flexWrap: "wrap", gap: space.md, paddingBottom: space.lg, justifyContent: "center" },
  color: { width: 44, height: 44, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", borderWidth: hairline, borderColor: colors.border },
  none: { backgroundColor: colors.surface3 },
  colorOn: { borderWidth: 3, borderColor: colors.brandAccent, transform: [{ scale: 1.08 }] },
});
