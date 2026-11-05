/**
 * SaveBar — kaydedilmemiş değişiklik çubuğu (ekranın altında sabit).
 *
 * NE: "3 değişiklik · +2 açılacak · −1 kapanacak" özeti, ilk üç değişikliğin
 * adı ve Vazgeç / Kaydet düğmeleri. Web rp-savebar karşılığı. AdminScreen'in
 * `overlay` alanına verilir; yalnız değişiklik varken çizilir.
 */

import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/ui";
import { colors, elevate, hairline, layout, radius, space, textScale, type } from "@/theme";

export function SaveBar({
  title,
  added = 0,
  removed = 0,
  extra,
  changes,
  saving,
  onCancel,
  onSave,
  saveLabel = "Kaydet",
}: {
  title: string;
  added?: number;
  removed?: number;
  /** Ek satır (ör. "Ünvan: Basın Sorumlusu"). */
  extra?: string | null;
  /** Değişen yetkilerin adları ("+ Maç ekleme"). İlk üçü yazılır. */
  changes?: string[];
  saving?: boolean;
  onCancel?: () => void;
  onSave: () => void;
  saveLabel?: string;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, space.md) }]}>
      <View style={styles.summary}>
        <Text style={styles.title} numberOfLines={1} {...textScale.dense}>
          {title}
          {added ? <Text style={styles.plus}>  +{added} açılacak</Text> : null}
          {removed ? <Text style={styles.minus}>  −{removed} kapanacak</Text> : null}
        </Text>
        {extra ? (
          <Text style={styles.list} numberOfLines={1} {...textScale.dense}>
            {extra}
          </Text>
        ) : null}
        {changes?.length ? (
          <Text style={styles.list} numberOfLines={1} {...textScale.dense}>
            {changes.slice(0, 3).join(" · ")}
            {changes.length > 3 ? " …" : ""}
          </Text>
        ) : null}
      </View>
      <View style={styles.actions}>
        {onCancel ? <Button label="Vazgeç" variant="ghost" size="sm" onPress={onCancel} disabled={saving} /> : null}
        <Button label={saveLabel} size="sm" onPress={onSave} loading={saving} haptic="success" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.md,
    backgroundColor: colors.elevated,
    borderTopWidth: hairline,
    borderTopColor: colors.border,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    ...elevate(3),
  },
  summary: { flex: 1, gap: 2 },
  title: { ...type.h4, color: colors.textPrimary },
  plus: { ...type.caption, color: colors.win },
  minus: { ...type.caption, color: colors.danger },
  list: { ...type.caption, color: colors.textTertiary },
  actions: { flexDirection: "row", gap: space.xs },
});
