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

import { Badge, GradientBar, IconTile, TeamLogo, Touchable } from "@/components/ui";
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
  const total = group.slots.length || group.slot_count || 0;
  const fill = total ? Math.min(1, (group.team_count ?? 0) / total) : 0;

  const renderSlot = (slot: GroupSlot, index: number, inPair: boolean) => {
    const resolved = Boolean(slot.resolved_team_id);
    const isEmpty = slot.source_type === SLOT_SOURCES.EMPTY;
    const isTeam = slot.source_type === SLOT_SOURCES.TEAM;
    return (
      <Touchable
        key={slot.id}
        onPress={canEdit ? () => onSlot(group, slot) : undefined}
        onLongPress={canEdit ? () => onSlotMenu(group, slot, index) : undefined}
        disabled={!canEdit}
        style={[styles.slot, inPair ? styles.slotPair : index > 0 ? styles.slotDivider : null]}
        accessibilityRole="button"
        accessibilityLabel={`${slot.slot_order}. kutu: ${resolved ? slot.resolved_team_name : isEmpty ? "boş" : slot.source_label}`}
        accessibilityHint={canEdit ? "Kaynağı seçmek için dokun, taşımak için basılı tut" : undefined}
      >
        <View style={[styles.order, resolved ? styles.orderOn : null]}>
          <Text style={[styles.orderText, resolved ? styles.orderTextOn : null]} {...textScale.badge}>
            {slot.slot_order}
          </Text>
        </View>
        {resolved ? (
          <TeamLogo name={slot.resolved_team_name} logo={slot.resolved_team_logo} size={26} />
        ) : (
          <View style={[styles.placeholder, isEmpty ? null : styles.placeholderSource]}>
            <Ionicons name={isEmpty ? "add" : "git-pull-request-outline"} size={13} color={isEmpty ? colors.textTertiary : colors.info} />
          </View>
        )}
        <View style={styles.slotText}>
          <Text style={[styles.slotName, resolved ? null : styles.slotPending]} numberOfLines={1} {...textScale.dense}>
            {resolved ? slot.resolved_team_name : isEmpty ? "Boş kutu" : "Belirlenmedi"}
          </Text>
          {!isTeam && !isEmpty && slot.source_label ? (
            <Text style={styles.source} numberOfLines={1} {...textScale.dense}>
              ← {slot.source_label}
            </Text>
          ) : isEmpty && canEdit ? (
            <Text style={styles.source} numberOfLines={1} {...textScale.dense}>
              Doldurmak için dokun
            </Text>
          ) : null}
        </View>
        {canEdit ? <Ionicons name="chevron-forward" size={14} color={colors.textTertiary} /> : null}
      </Touchable>
    );
  };

  const pairs: GroupSlot[][] = [];
  if (isStage) for (let i = 0; i < group.slots.length; i += 2) pairs.push(group.slots.slice(i, i + 2));

  return (
    <View style={styles.card}>
      <Touchable onPress={() => onMenu(group)} style={styles.head} accessibilityRole="button" accessibilityLabel={`${group.group_name} işlemleri`}>
        <IconTile icon={isStage ? "git-merge" : "grid"} tone={isStage ? "cyan" : "violet"} size={38} glow={false} />
        <View style={styles.headText}>
          <Text style={styles.title} numberOfLines={1} {...textScale.dense}>
            {group.group_name}
          </Text>
          <Text style={styles.sub} numberOfLines={1} {...textScale.dense}>
            {[
              GROUP_KIND_LABELS[group.group_kind] ?? "Grup",
              isStage ? `${group.matchup_count} eşleşme` : GROUP_FORMAT_LABELS[group.group_format] ?? "Serbest",
              group.double_round ? "Rövanşlı" : null,
              group.group_priority != null ? `Sıra ${group.group_priority}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </Text>
        </View>
        {group.show_in_bracket === false ? <Badge label="Şemada gizli" tone="warn" size="xs" /> : null}
        <View style={styles.menuBtn}>
          <Ionicons name="ellipsis-horizontal" size={18} color={colors.textSecondary} />
        </View>
      </Touchable>

      <View style={styles.fillRow}>
        <GradientBar value={fill} height={4} style={styles.fillBar} gradient={fill >= 1 ? [colors.win, colors.win] : undefined} />
        <Text style={styles.fillText} {...textScale.badge}>
          {group.team_count}/{total} dolu
        </Text>
      </View>

      {group.slots.length === 0 ? (
        <Text style={styles.empty} {...textScale.long}>
          Henüz kutu yok. Menüden {isStage ? "eşleşme" : "takım"} ekleyerek iskeleti oluştur.
        </Text>
      ) : isStage ? (
        /* Etap: ardışık ikililer eşleşme kartı olarak, aralarında VS. */
        <View style={styles.pairs}>
          {pairs.map((pair, p) => (
            <View key={pair[0].id} style={styles.pair}>
              <Text style={styles.pairTitle} {...textScale.badge}>
                {p + 1}. EŞLEŞME
              </Text>
              {renderSlot(pair[0], p * 2, true)}
              {pair[1] ? (
                <>
                  <View style={styles.vs}>
                    <View style={styles.vsLine} />
                    <Text style={styles.vsText} {...textScale.badge}>VS</Text>
                    <View style={styles.vsLine} />
                  </View>
                  {renderSlot(pair[1], p * 2 + 1, true)}
                </>
              ) : null}
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.list}>{group.slots.map((slot, index) => renderSlot(slot, index, false))}</View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.glassLine,
    overflow: "hidden",
    paddingBottom: space.sm,
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.sm,
  },
  headText: { flex: 1, minWidth: 0, gap: space.xxs },
  title: { ...type.h3, color: colors.textPrimary },
  sub: { ...type.caption, color: colors.textTertiary },
  menuBtn: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface3 },
  fillRow: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.lg, paddingBottom: space.sm },
  fillBar: { flex: 1 },
  fillText: { ...type.numSmStrong, color: colors.textSecondary },
  empty: { ...type.bodySm, color: colors.textTertiary, paddingHorizontal: space.lg, paddingBottom: space.md },
  list: { marginHorizontal: space.sm, borderRadius: radius.lg, backgroundColor: colors.surface2, overflow: "hidden" },
  pairs: { gap: space.sm, paddingHorizontal: space.sm },
  pair: {
    borderRadius: radius.lg,
    backgroundColor: colors.surface2,
    borderWidth: hairline,
    borderColor: colors.border,
    paddingTop: space.s,
    overflow: "hidden",
  },
  pairTitle: { ...type.overline, color: colors.accentText, paddingHorizontal: space.md },
  vs: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.md },
  vsLine: { flex: 1, height: hairline, backgroundColor: colors.separator },
  vsText: { ...type.overline, color: colors.textTertiary },
  slot: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.s,
    minHeight: 50,
  },
  slotPair: {},
  slotDivider: { borderTopWidth: hairline, borderTopColor: colors.separator },
  order: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface3 },
  orderOn: { backgroundColor: colors.brandDim },
  orderText: { ...type.nano, color: colors.textTertiary },
  orderTextOn: { color: colors.brandAccent },
  placeholder: {
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  placeholderSource: { borderColor: colors.info, borderStyle: "solid", backgroundColor: colors.infoDim },
  slotText: { flex: 1, minWidth: 0 },
  slotName: { ...type.h4, color: colors.textPrimary },
  slotPending: { color: colors.textTertiary },
  source: { ...type.caption, color: colors.textTertiary },
});
