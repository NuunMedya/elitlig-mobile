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

import { Badge, Chip, ChipGroup, GradientBar, IconTile, Input, ProgressRing, Toggle, Touchable, type IconTileTone } from "@/components/ui";
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
      {/* Kapsama kartı: halka + sayı + modül modül ince şeritler. */}
      <View style={styles.meter} accessible accessibilityLabel={`${draft.length} / ${allKeys.length} yetki açık`}>
        <ProgressRing value={percent / 100} size={58} thickness={6} tone="brand" label={`%${percent}`} />
        <View style={styles.meterBody}>
          <Text style={styles.meterText} {...textScale.dense}>
            <Text style={styles.meterValue}>{draft.length}</Text> / {allKeys.length} yetki açık
          </Text>
          <View style={styles.meterStrips}>
            {groups.map((g) => {
              const n = g.permissions.filter((p) => draftSet.has(p.key)).length;
              return <GradientBar key={g.key} value={g.permissions.length ? n / g.permissions.length : 0} height={4} style={styles.meterStrip} />;
            })}
          </View>
          <Text style={styles.meterHint} {...textScale.dense}>
            {groups.length} modül · {groups.filter((g) => g.permissions.every((p) => draftSet.has(p.key))).length} tam açık
          </Text>
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
            <View key={group.key} style={[styles.group, open ? styles.groupOpen : null]}>
              <View style={styles.groupHead}>
                <Touchable
                  onPress={() => setExpanded((prev) => ({ ...prev, [group.key]: !open }))}
                  style={styles.groupTitle}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: open }}
                  accessibilityLabel={`${group.label}, ${onCount} / ${keys.length} açık`}
                >
                  <IconTile icon={groupIcon(group.key)} tone={onCount ? groupTone(group.key) : "neutral"} size={34} glow={false} />
                  <View style={styles.groupText}>
                    <View style={styles.groupTop}>
                      <Text style={styles.groupLabel} numberOfLines={1} {...textScale.dense}>
                        {group.label}
                      </Text>
                      <Ionicons name={open ? "chevron-up" : "chevron-down"} size={14} color={colors.textTertiary} />
                    </View>
                    <View style={styles.groupMeter}>
                      <GradientBar value={keys.length ? onCount / keys.length : 0} height={4} style={styles.flex} />
                      <Text style={[styles.groupCount, onCount === keys.length ? { color: colors.win } : null]} {...textScale.badge}>
                        {onCount}/{keys.length}
                      </Text>
                    </View>
                    {group.description && open ? (
                      <Text style={styles.groupDesc} numberOfLines={3} {...textScale.dense}>
                        {group.description}
                      </Text>
                    ) : null}
                  </View>
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

/** İşlem türü → ikon (satırın önündeki küçük pul). */
const VERB_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  view: "eye-outline",
  directory: "eye-outline",
  create: "add",
  update: "create-outline",
  delete: "trash-outline",
  purge: "flame-outline",
  restore: "arrow-undo-outline",
  manage: "settings-outline",
  settings: "options-outline",
  publish: "megaphone-outline",
  review: "checkmark-done-outline",
  assign: "person-add-outline",
  archive: "archive-outline",
  submit: "send-outline",
  roles: "key-outline",
};

const GROUP_ICONS: Record<string, [keyof typeof Ionicons.glyphMap, IconTileTone]> = {
  matches: ["football", "mint"],
  teams: ["shield", "cyan"],
  players: ["person", "cyan"],
  staff: ["people", "violet"],
  evaluations: ["clipboard", "gold"],
  news: ["newspaper", "pink"],
  permissions: ["key", "red"],
  users: ["id-card", "red"],
  trash: ["trash", "neutral"],
  finance: ["cash", "mint"],
  accounting: ["cash", "mint"],
  messages: ["chatbubbles", "pink"],
  leagues: ["trophy", "gold"],
  broadcast: ["videocam", "red"],
  analytics: ["stats-chart", "cyan"],
};
const groupIcon = (key: string) => GROUP_ICONS[key]?.[0] ?? "grid";
const groupTone = (key: string): IconTileTone => GROUP_ICONS[key]?.[1] ?? "violet";

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
  const verb = String(item.key).split(".").pop() ?? "";
  return (
    <View style={[styles.row, on ? styles.rowOn : null]}>
      {sensitive ? <View style={styles.sensitiveStripe} /> : null}
      <View style={[styles.verb, { backgroundColor: on ? (sensitive ? colors.warnDim : colors.brandDim) : colors.surface2 }]}>
        <Ionicons name={VERB_ICONS[verb] ?? "ellipse-outline"} size={13} color={on ? (sensitive ? colors.warn : colors.brandAccent) : colors.textTertiary} />
      </View>
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
  flex: { flex: 1 },
  meter: { flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md, borderRadius: radius.xl, backgroundColor: colors.surface1, borderWidth: hairline, borderColor: colors.border },
  meterBody: { flex: 1, gap: space.xs },
  meterText: { ...type.bodySm, color: colors.textSecondary },
  meterValue: { ...type.scoreSm, color: colors.textPrimary },
  meterStrips: { flexDirection: "row", gap: 3 },
  meterStrip: { flex: 1 },
  meterHint: { ...type.caption, color: colors.textTertiary },
  expandAll: { alignSelf: "flex-start", paddingVertical: space.xs },
  link: { ...type.label, color: colors.brandAccent },
  empty: { ...type.bodySm, color: colors.textTertiary, paddingVertical: space.md },
  group: {
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
    overflow: "hidden",
  },
  groupOpen: { borderColor: colors.borderStrong },
  groupHead: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingRight: space.md },
  groupTitle: { flex: 1, flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md },
  groupText: { flex: 1, gap: 4 },
  groupTop: { flexDirection: "row", alignItems: "center", gap: space.xs },
  groupLabel: { ...type.h4, color: colors.textPrimary, flexShrink: 1 },
  groupMeter: { flexDirection: "row", alignItems: "center", gap: space.sm },
  groupCount: { ...type.numSmStrong, color: colors.textSecondary, minWidth: 32, textAlign: "right" },
  groupDesc: { ...type.caption, color: colors.textTertiary },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    minHeight: 56,
    borderTopWidth: hairline,
    borderTopColor: colors.separator,
  },
  rowOn: {},
  sensitiveStripe: { position: "absolute", left: 0, top: space.sm, bottom: space.sm, width: 3, borderTopRightRadius: 3, borderBottomRightRadius: 3, backgroundColor: colors.warn },
  verb: { width: 28, height: 28, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  rowText: { flex: 1, gap: space.xxs },
  rowLabel: { ...type.label, color: colors.textPrimary },
  rowOff: { color: colors.textSecondary },
  tags: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.xs },
  code: { ...type.micro, color: colors.textTertiary },
});
