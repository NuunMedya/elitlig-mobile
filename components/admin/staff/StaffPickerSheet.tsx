/**
 * StaffPickerSheet — bir görev için personel seçimi (alt sayfa).
 *
 * Web features/staff/StaffPicker.js'in mobil karşılığı: o görevi yapanlar
 * üstte ("Spiker olanlar"), diğer personel altta. Arama ad üzerinde yerel
 * yapılır. "Görevi boşalt" satırı seçimi kaldırır.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useEffect, useMemo, useState } from "react";
import { SectionList, StyleSheet, Text, View } from "react-native";

import { BottomSheet, Input, Touchable } from "@/components/ui";
import type { StaffMember } from "@/lib/api/admin/staff";
import { colors, hairline, radius, space, textScale, type } from "@/theme";

export function StaffPickerSheet({
  visible,
  onClose,
  title,
  primaryLabel,
  primary,
  others,
  value,
  onSelect,
  warning,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  primaryLabel: string;
  primary: StaffMember[];
  others: StaffMember[];
  value: string;
  onSelect: (staffId: string) => void;
  /** Çakışma uyarısı (aynı saatte başka maçta görevli). */
  warning?: string | null;
}) {
  const [q, setQ] = useState("");
  useEffect(() => {
    if (visible) setQ("");
  }, [visible]);

  const sections = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase("tr-TR");
    const match = (p: StaffMember) => !needle || p.fullName.toLocaleLowerCase("tr-TR").includes(needle);
    return [
      { title: primaryLabel, data: primary.filter(match) },
      { title: "Diğer personel", data: others.filter(match) },
    ].filter((s) => s.data.length);
  }, [q, primary, others, primaryLabel]);

  const pick = (id: string) => {
    onSelect(id);
    onClose();
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} title={title} snap="full" scrollable={false}>
      <View style={styles.wrap}>
        {warning ? (
          <View style={styles.warn}>
            <Ionicons name="time-outline" size={16} color={colors.warn} />
            <Text style={styles.warnText} {...textScale.long}>
              {warning}
            </Text>
          </View>
        ) : null}
        <Input variant="search" leadingIcon="search" value={q} onChangeText={setQ} placeholder="Personel ara" autoCorrect={false} />
        <SectionList
          sections={sections}
          keyExtractor={(item) => String(item.id)}
          keyboardShouldPersistTaps="handled"
          stickySectionHeadersEnabled={false}
          ListHeaderComponent={
            value ? (
              <Touchable style={styles.row} onPress={() => pick("")} accessibilityRole="button">
                <Ionicons name="close-circle-outline" size={20} color={colors.danger} />
                <Text style={[styles.name, styles.danger]} {...textScale.dense}>
                  Görevi boşalt
                </Text>
              </Touchable>
            ) : null
          }
          renderSectionHeader={({ section }) => (
            <Text style={styles.section} {...textScale.dense}>
              {section.title}
            </Text>
          )}
          renderItem={({ item }) => {
            const selected = String(item.id) === value;
            return (
              <Touchable style={styles.row} onPress={() => pick(String(item.id))} accessibilityRole="button" accessibilityState={{ selected }}>
                <View style={styles.texts}>
                  <Text style={styles.name} {...textScale.dense}>
                    {item.fullName}
                  </Text>
                  <Text style={styles.meta} numberOfLines={1} {...textScale.dense}>
                    {[item.dutyLabels?.join(", "), item.phone].filter(Boolean).join(" · ") || "Görev seçilmedi"}
                  </Text>
                </View>
                {selected ? <Ionicons name="checkmark" size={20} color={colors.brandAccent} /> : null}
              </Touchable>
            );
          }}
          ListEmptyComponent={
            <Text style={styles.meta} {...textScale.long}>
              Bu maçın ilinde seçilebilecek personel yok.
            </Text>
          }
        />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, gap: space.sm },
  warn: { flexDirection: "row", gap: space.sm, alignItems: "flex-start", padding: space.sm, backgroundColor: colors.warnDim, borderRadius: radius.sm },
  warnText: { ...type.caption, color: colors.textPrimary, flex: 1 },
  section: { ...type.overline, color: colors.textTertiary, paddingTop: space.md, paddingBottom: space.xs },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.md, borderBottomWidth: hairline, borderBottomColor: colors.separator },
  texts: { flex: 1, gap: 2 },
  name: { ...type.body, color: colors.textPrimary },
  meta: { ...type.caption, color: colors.textTertiary },
  danger: { color: colors.danger },
});
