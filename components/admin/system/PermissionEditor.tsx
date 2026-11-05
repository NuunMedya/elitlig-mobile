/**
 * PermissionEditor — yetki gruplarını açılır bölümler hâlinde gösteren,
 * anahtarlarla (Toggle) düzenlenen yetki listesi. Web roles/PermissionEditor.js
 * karşılığı; hem rol şablonu hem kişi bazlı yetki hem toplu işlem kullanır.
 *
 * NE: üstte "N / M yetki açık" ölçeri ve arama, süzgeç çipleri (Tümü, Açık,
 * Kapalı, Şablondan/Varsayılandan farklı, Hassas), hızlı işlemler (tümünü aç /
 * kapat, görüntüleme yetkilerini aç, ekranın verdiği ek eylemler). Her grup
 * başlığında açık/toplam sayısı ve grubun tamamını açıp kapatan anahtar var;
 * satırda işlem türü, "Hassas" ve farkı rozetlerle görünür.
 *
 * NEDEN GRUPLAR KAPALI BAŞLAR: 150'ye yakın yetki tek listede telefonda
 * okunmaz. Arama ya da süzgeç kullanılınca eşleşen gruplar kendiliğinden açılır.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React, { memo, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Badge, Chip, ChipGroup, Input, Toggle, Touchable } from "@/components/ui";
import {
  isSensitivePermission,
  isViewPermission,
  permissionAction,
  type PermissionGroup,
  type PermissionItem,
} from "@/lib/api/admin/system";
import { colors, hairline, radius, space, textScale, type } from "@/theme";

type Filter = "all" | "on" | "off" | "changed" | "sensitive";

export interface PermissionEditorProps {
  groups: PermissionGroup[];
  draft: string[];
  onChange: (next: string[]) => void;
  readOnly?: boolean;
  /** Karşılaştırma listesi (rol varsayılanı ya da kişinin rol şablonu). */
  baseline?: { permissions: string[]; label: "Varsayılandan farklı" | "Şablondan farklı" } | null;
  /** Hızlı işlemler satırının sonuna eklenen düğmeler (ör. "Rol şablonunu uygula"). */
  extraActions?: { label: string; icon?: keyof typeof Ionicons.glyphMap; onPress: () => void }[];
}

export function PermissionEditor({ groups, draft, onChange, readOnly, baseline, extraActions }: PermissionEditorProps) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const draftSet = useMemo(() => new Set(draft), [draft]);
  const defaults = useMemo(() => new Set(baseline?.permissions ?? []), [baseline]);
  const allKeys = useMemo(() => groups.flatMap((g) => g.permissions.map((p) => p.key)), [groups]);

  const visible = useMemo(() => {
    const text = search.trim().toLocaleLowerCase("tr-TR");
    const matches = (item: PermissionItem) => {
      const on = draftSet.has(item.key);
      if (filter === "on" && !on) return false;
      if (filter === "off" && on) return false;
      if (filter === "changed" && (!baseline || on === defaults.has(item.key))) return false;
      if (filter === "sensitive" && !isSensitivePermission(item.key)) return false;
      return true;
    };
    return groups
      .map((group) => {
        const groupHit = text && `${group.label} ${group.description ?? ""}`.toLocaleLowerCase("tr-TR").includes(text);
        const items = group.permissions.filter(
          (item) => matches(item) && (!text || groupHit || `${item.label} ${item.key}`.toLocaleLowerCase("tr-TR").includes(text))
        );
        return items.length ? { group, items } : null;
      })
      .filter(Boolean) as { group: PermissionGroup; items: PermissionItem[] }[];
  }, [groups, search, filter, draftSet, defaults, baseline]);

  const autoOpen = Boolean(search.trim()) || filter !== "all";
  const isOpen = (key: string) => autoOpen || Boolean(expanded[key]);
  const allOpen = visible.length > 0 && visible.every((v) => isOpen(v.group.key));

  const toggle = (key: string) => {
    if (readOnly) return;
    onChange(draftSet.has(key) ? draft.filter((k) => k !== key) : [...draft, key]);
  };
  const setGroup = (group: PermissionGroup, on: boolean) => {
    if (readOnly) return;
    const keys = group.permissions.map((p) => p.key);
    onChange(on ? [...new Set([...draft, ...keys])] : draft.filter((k) => !keys.includes(k)));
  };

  const percent = allKeys.length ? Math.round((draft.length / allKeys.length) * 100) : 0;
  const filters: { key: Filter; label: string }[] = [
    { key: "all", label: "Tümü" },
    { key: "on", label: "Açık" },
    { key: "off", label: "Kapalı" },
    ...(baseline ? [{ key: "changed" as Filter, label: baseline.label }] : []),
    { key: "sensitive", label: "Hassas" },
  ];

  return (
    <View style={styles.root}>
      <View style={styles.meter} accessible accessibilityLabel={`${draft.length} / ${allKeys.length} yetki açık`}>
        <Text style={styles.meterText} {...textScale.dense}>
          <Text style={styles.meterValue}>{draft.length}</Text> / {allKeys.length} yetki açık
        </Text>
        <View style={styles.meterTrack}>
          <View style={[styles.meterFill, { width: `${percent}%` }]} />
        </View>
      </View>

      <Input
        variant="search"
        leadingIcon="search"
        value={search}
        onChangeText={setSearch}
        placeholder="Modül ya da yetki ara"
        autoCorrect={false}
        autoCapitalize="none"
        clearButtonMode="while-editing"
      />

      <ChipGroup scrollable contentPadding={0}>
        {filters.map((f) => (
          <Chip key={f.key} label={f.label} size="sm" selected={filter === f.key} onPress={() => setFilter(f.key)} />
        ))}
      </ChipGroup>

      {!readOnly ? (
        <ChipGroup scrollable contentPadding={0}>
          <Chip label="Tümünü aç" icon="checkmark-done-outline" size="sm" onPress={() => onChange([...allKeys])} />
          <Chip label="Tümünü kapat" icon="close-outline" size="sm" onPress={() => onChange([])} />
          <Chip
            label="Görüntüleme yetkilerini aç"
            icon="eye-outline"
            size="sm"
            onPress={() => onChange([...new Set([...draft, ...allKeys.filter(isViewPermission)])])}
          />
          {extraActions?.map((a) => (
            <Chip key={a.label} label={a.label} icon={a.icon} size="sm" onPress={a.onPress} />
          ))}
        </ChipGroup>
      ) : null}

      {!autoOpen && visible.length ? (
        <Touchable
          onPress={() => setExpanded(allOpen ? {} : Object.fromEntries(visible.map((v) => [v.group.key, true])))}
          style={styles.expandAll}
          accessibilityRole="button"
        >
          <Text style={styles.link} {...textScale.dense}>
            {allOpen ? "Tüm modülleri daralt" : "Tüm modülleri aç"}
          </Text>
        </Touchable>
      ) : null}

      {!visible.length ? (
        <Text style={styles.empty} {...textScale.dense}>
          Süzgeçle eşleşen yetki yok.
        </Text>
      ) : (
        visible.map(({ group, items }) => {
          const keys = group.permissions.map((p) => p.key);
          const onCount = keys.filter((k) => draftSet.has(k)).length;
          const open = isOpen(group.key);
          return (
            <View key={group.key} style={styles.group}>
              <View style={styles.groupHead}>
                <Touchable
                  onPress={() => setExpanded((prev) => ({ ...prev, [group.key]: !open }))}
                  style={styles.groupTitle}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: open }}
                  accessibilityLabel={`${group.label}, ${onCount} / ${keys.length} açık`}
                >
                  <Ionicons name={open ? "chevron-down" : "chevron-forward"} size={16} color={colors.textTertiary} />
                  <View style={styles.groupText}>
                    <Text style={styles.groupLabel} numberOfLines={2} {...textScale.dense}>
                      {group.label}
                    </Text>
                    {group.description && open ? (
                      <Text style={styles.groupDesc} numberOfLines={3} {...textScale.dense}>
                        {group.description}
                      </Text>
                    ) : null}
                  </View>
                  <Badge
                    label={`${onCount}/${keys.length}`}
                    tone={onCount === 0 ? "neutral" : onCount === keys.length ? "win" : "brand"}
                    size="xs"
                  />
                </Touchable>
                <Toggle
                  value={onCount === keys.length}
                  onValueChange={(v) => setGroup(group, v)}
                  disabled={readOnly}
                  accessibilityLabel={`${group.label} modülünün tüm yetkileri`}
                />
              </View>
              {open
                ? items.map((item) => (
                    <PermissionRow
                      key={item.key}
                      item={item}
                      on={draftSet.has(item.key)}
                      changed={baseline ? draftSet.has(item.key) !== defaults.has(item.key) : false}
                      baselineLabel={baseline?.label === "Şablondan farklı" ? "şablonda" : "varsayılanda"}
                      readOnly={readOnly}
                      onToggle={toggle}
                    />
                  ))
                : null}
            </View>
          );
        })
      )}
    </View>
  );
}

const PermissionRow = memo(function PermissionRow({
  item,
  on,
  changed,
  baselineLabel,
  readOnly,
  onToggle,
}: {
  item: PermissionItem;
  on: boolean;
  changed: boolean;
  baselineLabel: string;
  readOnly?: boolean;
  onToggle: (key: string) => void;
}) {
  const action = permissionAction(item.key);
  const sensitive = isSensitivePermission(item.key);
  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <Text style={[styles.rowLabel, on ? null : styles.rowOff]} {...textScale.dense}>
          {item.label}
        </Text>
        <View style={styles.tags}>
          <Text style={styles.code} {...textScale.badge}>
            {item.key}
          </Text>
          {action ? <Badge label={action} size="xs" /> : null}
          {sensitive ? <Badge label="Hassas" tone="warn" icon="shield-half-outline" size="xs" /> : null}
          {changed ? (
            <Badge label={on ? `+ ${baselineLabel} kapalı` : `− ${baselineLabel} açık`} tone={on ? "win" : "danger"} size="xs" />
          ) : null}
        </View>
      </View>
      <Toggle value={on} onValueChange={() => onToggle(item.key)} disabled={readOnly} accessibilityLabel={item.label} />
    </View>
  );
});

const styles = StyleSheet.create({
  root: { gap: space.sm },
  meter: { gap: space.xs },
  meterText: { ...type.bodySm, color: colors.textSecondary },
  meterValue: { ...type.numSmStrong, color: colors.textPrimary },
  meterTrack: { height: 6, borderRadius: radius.pill, backgroundColor: colors.surface3, overflow: "hidden" },
  meterFill: { height: 6, borderRadius: radius.pill, backgroundColor: colors.brandAccent },
  expandAll: { alignSelf: "flex-start", paddingVertical: space.xs },
  link: { ...type.label, color: colors.brandAccent },
  empty: { ...type.bodySm, color: colors.textTertiary, paddingVertical: space.md },
  group: {
    borderRadius: radius.lg,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
    overflow: "hidden",
  },
  groupHead: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingRight: space.md },
  groupTitle: { flex: 1, flexDirection: "row", alignItems: "center", gap: space.sm, padding: space.md },
  groupText: { flex: 1, gap: 2 },
  groupLabel: { ...type.h4, color: colors.textPrimary },
  groupDesc: { ...type.caption, color: colors.textTertiary },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderTopWidth: hairline,
    borderTopColor: colors.separator,
  },
  rowText: { flex: 1, gap: space.xxs },
  rowLabel: { ...type.bodySm, color: colors.textPrimary },
  rowOff: { color: colors.textSecondary },
  tags: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.xs },
  code: { ...type.micro, color: colors.textTertiary },
});
