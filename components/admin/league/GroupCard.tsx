/**
 * Tek grup / etap kartı (web editor_pages/groups/GroupCard.js).
 *
 * Kart kurgunun iskeletidir: her satır bir katılımcı kutusudur. Dokununca
 * "bu kutuyu ne dolduracak?" sayfası açılır; uzun basınca taşı / boşalt
 * menüsü (masaüstündeki sürükle-bırak yerine). Etaplarda ardışık ikililer bir
 * eşleşmedir; eşleşme başlığı kutuların üstünde görünür.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { Panel } from "@/components/admin";
import { Badge, TeamLogo, Touchable } from "@/components/ui";
import { GROUP_FORMAT_LABELS, GROUP_KIND_LABELS, SLOT_SOURCES, type GroupSlot, type SeasonGroup } from "@/lib/api/admin/leagues";
import { colors, hairline, radius, space, textScale, type } from "@/theme";

export function GroupCard({
  group,
  canEdit,
  onMenu,
  onSlot,
  onSlotMenu,
}: {
  group: SeasonGroup;
  canEdit: boolean;
  onMenu: (group: SeasonGroup) => void;
  onSlot: (group: SeasonGroup, slot: GroupSlot) => void;
  onSlotMenu: (group: SeasonGroup, slot: GroupSlot, index: number) => void;
}) {
  const isStage = group.group_kind === "etap";
  return (
    <Panel padded={false}>
      <Touchable onPress={() => onMenu(group)} style={styles.head} accessibilityRole="button" accessibilityLabel={`${group.group_name} işlemleri`}>
        <View style={styles.headText}>
          <Text style={styles.title} {...textScale.dense}>
            {group.group_name}
          </Text>
          <View style={styles.badges}>
            <Badge label={GROUP_KIND_LABELS[group.group_kind] ?? "Grup"} tone={isStage ? "accent" : "brand"} size="xs" />
            <Badge label={isStage ? `${group.matchup_count} eşleşme` : `${group.slot_count} kutu`} size="xs" />
            <Badge label={`${group.team_count} dolu`} size="xs" />
            {group.group_priority != null ? <Badge label={`Sıra ${group.group_priority}`} size="xs" /> : null}
            {!isStage ? <Badge label={GROUP_FORMAT_LABELS[group.group_format] ?? "Serbest"} size="xs" /> : null}
            {group.double_round ? <Badge label="Rövanşlı" size="xs" /> : null}
            {group.show_in_bracket === false ? <Badge label="Şemada gizli" tone="warn" size="xs" /> : null}
          </View>
        </View>
        <Ionicons name="ellipsis-horizontal" size={20} color={colors.textSecondary} />
      </Touchable>

      {group.slots.length === 0 ? (
        <Text style={styles.empty} {...textScale.long}>
          Henüz kutu yok. Menüden {isStage ? "eşleşme" : "takım"} ekleyerek iskeleti oluştur.
        </Text>
      ) : (
        <View>
          {group.slots.map((slot, index) => {
            const startsMatchup = isStage && index % 2 === 0;
            const resolved = Boolean(slot.resolved_team_id);
            const isEmpty = slot.source_type === SLOT_SOURCES.EMPTY;
            const isTeam = slot.source_type === SLOT_SOURCES.TEAM;
            return (
              <React.Fragment key={slot.id}>
                {startsMatchup ? (
                  <Text style={styles.divider} {...textScale.badge}>
                    {Math.floor(index / 2) + 1}. EŞLEŞME
                  </Text>
                ) : null}
                <Touchable
                  onPress={canEdit ? () => onSlot(group, slot) : undefined}
                  onLongPress={canEdit ? () => onSlotMenu(group, slot, index) : undefined}
                  disabled={!canEdit}
                  style={styles.slot}
                  accessibilityRole="button"
                  accessibilityLabel={`${slot.slot_order}. kutu: ${resolved ? slot.resolved_team_name : isEmpty ? "boş" : slot.source_label}`}
                  accessibilityHint={canEdit ? "Kaynağı seçmek için dokun, taşımak için basılı tut" : undefined}
                >
                  <Text style={styles.order} {...textScale.dense}>
                    {slot.slot_order}
                  </Text>
                  {resolved ? (
                    <TeamLogo name={slot.resolved_team_name} logo={slot.resolved_team_logo} size={24} />
                  ) : (
                    <View style={styles.placeholder}>
                      <Ionicons name={isEmpty ? "add" : "help"} size={14} color={colors.textTertiary} />
                    </View>
                  )}
                  <View style={styles.slotText}>
                    <Text style={[styles.slotName, resolved ? null : styles.slotPending]} numberOfLines={1} {...textScale.dense}>
                      {resolved ? slot.resolved_team_name : isEmpty ? "Boş — doldurmak için dokun" : "Belirlenmedi"}
                    </Text>
                    {!isTeam && !isEmpty && slot.source_label ? (
                      <Text style={styles.source} numberOfLines={1} {...textScale.dense}>
                        {slot.source_label}
                      </Text>
                    ) : null}
                  </View>
                  {canEdit ? <Ionicons name="chevron-forward" size={14} color={colors.textTertiary} /> : null}
                </Touchable>
              </React.Fragment>
            );
          })}
        </View>
      )}
    </Panel>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.sm,
  },
  headText: { flex: 1, gap: space.xs },
  title: { ...type.h4, color: colors.textPrimary },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
  empty: { ...type.bodySm, color: colors.textTertiary, paddingHorizontal: space.lg, paddingBottom: space.lg },
  divider: {
    ...type.overline,
    color: colors.textTertiary,
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    paddingBottom: space.xxs,
  },
  slot: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderTopWidth: hairline,
    borderTopColor: colors.separator,
    minHeight: 48,
  },
  order: { ...type.numSmStrong, color: colors.textTertiary, width: 22, textAlign: "right" },
  placeholder: {
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    borderWidth: hairline,
    borderColor: colors.border,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  slotText: { flex: 1 },
  slotName: { ...type.body, color: colors.textPrimary },
  slotPending: { color: colors.textTertiary },
  source: { ...type.caption, color: colors.textTertiary },
});
