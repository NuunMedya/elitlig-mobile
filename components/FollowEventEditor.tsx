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
import { Badge, Button, IconTile, Touchable, type IconTileTone } from "@/components/ui";
import type { FollowEventInfo, FollowItem, FollowSettingsPatch } from "@/lib/api/favorites";
import { colors, hairline, radius, space, textScale, type, upperTR } from "@/theme";

export interface FollowEventEditorProps {
  item: FollowItem;
  eventInfo: Map<string, FollowEventInfo>;
  onChange: (item: FollowItem, patch: FollowSettingsPatch) => void;
}

/**
 * Olay anahtarı → ikon ve ton. Sunucu kataloğu yeni olay eklerse nötr zil
 * ile çizilir; ekran kırılmaz.
 */
const EVENT_LOOK: Record<string, { icon: keyof typeof Ionicons.glyphMap; tone: IconTileTone }> = {
  goal: { icon: "football", tone: "mint" },
  match_start: { icon: "play", tone: "pink" },
  kickoff: { icon: "play", tone: "pink" },
  result: { icon: "flag", tone: "violet" },
  final: { icon: "flag", tone: "violet" },
  red_card: { icon: "square", tone: "red" },
  halftime: { icon: "pause", tone: "cyan" },
  news: { icon: "newspaper", tone: "gold" },
  transfer: { icon: "swap-horizontal", tone: "cyan" },
  new_match: { icon: "calendar", tone: "signature" },
  fixture: { icon: "calendar", tone: "signature" },
  schedule_change: { icon: "time", tone: "gold" },
  reschedule: { icon: "time", tone: "gold" },
  reminder: { icon: "alarm", tone: "violet" },
};

const lookOf = (key: string) => EVENT_LOOK[key] ?? { icon: "notifications" as const, tone: "neutral" as IconTileTone };

/**
 * YENİ GÖRÜNÜM: olaylar düz çip yerine iki sütunlu ANAHTAR KAROLARIDIR —
 * ikon kutusu (olayın kimliği), ad ve sağ üstte işaret halkası. Açık karo mor
 * çerçeveli ve ikon kutusu renkli; kapalı karo sönük ve ikon nötr. Üstte
 * "4/5 açık" sayacı ile Hepsi/Hiçbiri hap düğmeleri.
 */
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

  const onCount = item.events.filter((event) => item.prefs[event]).length;
  const allOn = onCount === item.events.length;
  const noneOn = onCount === 0;

  return (
    <View style={styles.body}>
      {item.muted ? (
        <View style={styles.mutedNote}>
          <IconTile icon="notifications-off" tone="neutral" size={32} glow={false} />
          <View style={styles.mutedText}>
            <Text style={styles.mutedTitle} {...textScale.dense}>
              Sessizde
            </Text>
            <Text style={styles.mutedNoteText} {...textScale.long}>
              Takip sürer, bildirim gelmez.
            </Text>
          </View>
          <Button label="Sesi aç" size="sm" variant="primary" icon="notifications" onPress={toggleMute} />
        </View>
      ) : (
        <>
          <View style={styles.head}>
            <Text style={styles.title} {...textScale.badge}>
              {upperTR("Hangi anlarda?")}
            </Text>
            <Text style={styles.count} {...textScale.dense}>
              {onCount}/{item.events.length}
            </Text>
            <View style={styles.actions}>
              <Touchable
                feedback="chip"
                onPress={() => setAll(true)}
                accessibilityRole="button"
                accessibilityState={{ disabled: allOn }}
                style={[styles.pillButton, allOn ? styles.pillButtonOn : null]}
              >
                <Text style={[styles.pillLabel, allOn ? styles.pillLabelOn : null]} {...textScale.dense}>
                  Hepsi
                </Text>
              </Touchable>
              <Touchable
                feedback="chip"
                onPress={() => setAll(false)}
                accessibilityRole="button"
                accessibilityState={{ disabled: noneOn }}
                style={[styles.pillButton, noneOn ? styles.pillButtonOn : null]}
              >
                <Text style={[styles.pillLabel, noneOn ? styles.pillLabelOn : null]} {...textScale.dense}>
                  Hiçbiri
                </Text>
              </Touchable>
            </View>
          </View>
          <View style={styles.events}>
            {item.events.map((event) => {
              const info = eventInfo.get(event);
              const on = Boolean(item.prefs[event]);
              const look = lookOf(event);
              const label = info?.label ?? event;
              return (
                <Touchable
                  key={event}
                  feedback="chip"
                  haptic="selection"
                  onPress={() => onChange(item, { prefs: { [event]: !on } })}
                  accessibilityRole="switch"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={label}
                  style={[styles.tile, on ? styles.tileOn : null]}
                  testID={`follow-${item.type}-${item.id}-${event}`}
                >
                  <IconTile icon={look.icon} tone={on ? look.tone : "neutral"} size={28} glow={false} />
                  <Text style={[styles.tileLabel, on ? null : styles.tileLabelOff]} numberOfLines={1} {...textScale.dense}>
                    {label}
                  </Text>
                  <View style={[styles.check, on ? styles.checkOn : null]}>
                    {on ? <Ionicons name="checkmark" size={11} color={colors.textOnBrand} /> : null}
                  </View>
                </Touchable>
              );
            })}
          </View>
        </>
      )}
      {item.customized ? (
        <View style={styles.resetRow}>
          <Badge label="Özelleştirildi" tone="brand" size="xs" icon="options" />
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
    gap: space.sm,
  },
  title: { ...type.overline, color: colors.textTertiary },
  count: { ...type.numSmStrong, color: colors.brandAccent, flex: 1 },
  actions: { flexDirection: "row", gap: space.xs },
  pillButton: {
    paddingHorizontal: space.m,
    minHeight: 28,
    justifyContent: "center",
    borderRadius: radius.pill,
    borderWidth: hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface2,
  },
  pillButtonOn: {
    backgroundColor: colors.brandDim,
    borderColor: colors.brandBorder,
  },
  pillLabel: { ...type.labelSm, color: colors.textSecondary },
  pillLabelOn: { color: colors.brandAccent },
  events: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  tile: {
    width: "48%",
    flexGrow: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingVertical: space.s,
    paddingLeft: space.s,
    paddingRight: space.sm,
    borderRadius: radius.md,
    borderWidth: hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface2,
  },
  tileOn: {
    borderColor: colors.brandBorder,
    backgroundColor: colors.brandDim,
  },
  tileLabel: { ...type.labelSm, color: colors.textPrimary, flex: 1 },
  tileLabelOff: { color: colors.textTertiary },
  check: {
    width: 16,
    height: 16,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  checkOn: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  mutedNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  mutedText: { flex: 1, gap: space.px },
  mutedTitle: { ...type.h4, color: colors.textPrimary },
  mutedNoteText: { ...type.bodySm, color: colors.textSecondary },
  resetRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
});
