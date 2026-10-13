/**
 * FollowEventEditor — tek takibin bildirim türleri: "Hangi anlarda?"
 *
 * Takip bildirimleri ekranındaki kartın gövdesi ve "Takip et" sonrası açılan
 * alt sayfanın içeriği AYNI bileşendir; olaylar sunucu kataloğundan gelir
 * (çip başına bir olay), "Hepsi / Hiçbiri" toplu seçim yapar, sessize alınmış
 * takipte yalnız "Aç" düğmesi görünür, özelleştirilmiş takipte "Varsayılana
 * dön" çıkar.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useCallback } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Badge, Button, Chip, Touchable } from "@/components/ui";
import type { FollowEventInfo, FollowItem, FollowSettingsPatch } from "@/lib/api/favorites";
import { colors, space, textScale, type, upperTR } from "@/theme";

export interface FollowEventEditorProps {
  item: FollowItem;
  eventInfo: Map<string, FollowEventInfo>;
  onChange: (item: FollowItem, patch: FollowSettingsPatch) => void;
}

export const FollowEventEditor = React.memo(function FollowEventEditor({
  item,
  eventInfo,
  onChange,
}: FollowEventEditorProps) {
  const toggleMute = useCallback(() => onChange(item, { muted: !item.muted }), [item, onChange]);
  const setAll = useCallback(
    (value: boolean) => {
      const prefs: Record<string, boolean> = {};
      item.events.forEach((event) => {
        prefs[event] = value;
      });
      onChange(item, { prefs });
    },
    [item, onChange]
  );

  return (
    <View style={styles.body}>
      {item.muted ? (
        <View style={styles.mutedNote}>
          <Ionicons name="notifications-off-outline" size={16} color={colors.textSecondary} />
          <Text style={styles.mutedNoteText} {...textScale.long}>
            Sessizde: takip sürer, bildirim gelmez.
          </Text>
          <Button label="Aç" size="sm" variant="secondary" onPress={toggleMute} />
        </View>
      ) : (
        <>
          <View style={styles.head}>
            <Text style={styles.title} {...textScale.badge}>
              {upperTR("Hangi anlarda?")}
            </Text>
            <View style={styles.actions}>
              <Touchable feedback="chip" onPress={() => setAll(true)} accessibilityRole="button" style={styles.textButton}>
                <Text style={styles.textButtonLabel} {...textScale.dense}>
                  Hepsi
                </Text>
              </Touchable>
              <Touchable feedback="chip" onPress={() => setAll(false)} accessibilityRole="button" style={styles.textButton}>
                <Text style={styles.textButtonLabel} {...textScale.dense}>
                  Hiçbiri
                </Text>
              </Touchable>
            </View>
          </View>
          <View style={styles.events}>
            {item.events.map((event) => {
              const info = eventInfo.get(event);
              const on = Boolean(item.prefs[event]);
              return (
                <Chip
                  key={event}
                  label={info?.label ?? event}
                  icon={on ? "checkmark" : undefined}
                  selected={on}
                  onPress={() => onChange(item, { prefs: { [event]: !on } })}
                  testID={`follow-${item.type}-${item.id}-${event}`}
                />
              );
            })}
          </View>
        </>
      )}
      {item.customized ? (
        <View style={styles.resetRow}>
          <Badge label="Özelleştirildi" tone="brand" size="xs" />
          <Button
            label="Varsayılana dön"
            variant="ghost"
            size="sm"
            icon="refresh-outline"
            onPress={() => onChange(item, { reset: true })}
          />
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  body: { gap: space.md },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: { ...type.overline, color: colors.textTertiary },
  actions: { flexDirection: "row", gap: space.xs },
  textButton: { paddingHorizontal: space.sm, minHeight: 28, justifyContent: "center" },
  textButtonLabel: { ...type.label, color: colors.brandAccent },
  events: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  mutedNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  mutedNoteText: { ...type.bodySm, color: colors.textSecondary, flex: 1 },
  resetRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
});
