/**
 * NOT DEFTERİ PARÇALARI — liste maddeleri düzenleyici, etiket girişi, renk
 * seçici ve not kartı. Web elitlig-client tools/Notebook.js'teki
 * ChecklistEditor, TagInput, ColorPicker ve NoteCard'ın mobil karşılığı.
 *
 * Not renkleri VERİDİR (lib/admin/toolPalette.ts); kart zemini bu rengin
 * saydam tonudur, metin her iki temada da tema rengiyle okunur.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React, { memo, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";

import { Chip, ChipGroup, Touchable, withAlpha } from "@/components/ui";
import { NOTE_COLORS } from "@/lib/admin/toolPalette";
import { formatDate } from "@/lib/admin/format";
import type { ChecklistItem, ToolNote } from "@/lib/api/admin/tools";
import { colors, hairline, radius, space, textScale, touchSlop, type } from "@/theme";

/* ═══════════════════════════ LİSTE MADDELERİ ═══════════════════════════ */

export function ChecklistEditor({ items, onChange }: { items: ChecklistItem[]; onChange: (next: ChecklistItem[]) => void }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const text = draft.trim();
    if (!text) return;
    onChange([...items, { text, done: false }]);
    setDraft("");
  };
  const update = (index: number, patch: Partial<ChecklistItem>) =>
    onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  const remove = (index: number) => onChange(items.filter((_, i) => i !== index));
  // Bitenler alta: yapılacaklar önce okunur.
  const ordered = [
    ...items.map((item, index) => ({ item, index })).filter(({ item }) => !item.done),
    ...items.map((item, index) => ({ item, index })).filter(({ item }) => item.done),
  ];
  return (
    <View style={styles.check}>
      {ordered.map(({ item, index }) => (
        <View key={index} style={styles.checkRow}>
          <Touchable
            feedback="icon"
            haptic="selection"
            onPress={() => update(index, { done: !item.done })}
            hitSlop={touchSlop(22)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: item.done }}
            accessibilityLabel={item.text}
          >
            <Ionicons name={item.done ? "checkbox" : "square-outline"} size={22} color={item.done ? colors.brandAccent : colors.textTertiary} />
          </Touchable>
          <TextInput
            value={item.text}
            onChangeText={(text) => update(index, { text })}
            style={[styles.checkInput, item.done ? styles.done : null]}
            placeholderTextColor={colors.textTertiary}
            accessibilityLabel="Madde"
            maxLength={300}
          />
          <Touchable feedback="icon" onPress={() => remove(index)} hitSlop={touchSlop(18)} accessibilityLabel="Maddeyi sil">
            <Ionicons name="close" size={18} color={colors.textTertiary} />
          </Touchable>
        </View>
      ))}
      <View style={styles.checkRow}>
        <Ionicons name="add" size={22} color={colors.textTertiary} />
        <TextInput
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={add}
          onBlur={add}
          blurOnSubmit={false}
          returnKeyType="next"
          placeholder="Madde ekle"
          placeholderTextColor={colors.textTertiary}
          style={styles.checkInput}
          accessibilityLabel="Yeni madde"
          maxLength={300}
        />
      </View>
    </View>
  );
}

/* ═══════════════════════════ ETİKETLER ═══════════════════════════ */

export function TagInput({
  tags,
  onChange,
  suggestions = [],
}: {
  tags: string[];
  onChange: (next: string[]) => void;
  suggestions?: string[];
}) {
  const [draft, setDraft] = useState("");
  const has = (tag: string) => tags.some((t) => t.toLocaleLowerCase("tr-TR") === tag.toLocaleLowerCase("tr-TR"));
  const add = (value: string) => {
    const tag = value.trim().replace(/^#/, "").replace(/,$/, "").trim();
    setDraft("");
    if (!tag || has(tag)) return;
    onChange([...tags, tag].slice(0, 12));
  };
  const rest = suggestions.filter((tag) => !has(tag)).slice(0, 10);
  return (
    <View style={styles.tags}>
      <View style={styles.tagWrap}>
        {tags.map((tag) => (
          <Chip key={tag} label={`#${tag}`} size="sm" selected onDismiss={() => onChange(tags.filter((t) => t !== tag))} />
        ))}
        <TextInput
          value={draft}
          onChangeText={(text) => (text.endsWith(",") ? add(text) : setDraft(text))}
          onSubmitEditing={() => add(draft)}
          onBlur={() => draft && add(draft)}
          blurOnSubmit={false}
          placeholder={tags.length ? "Etiket ekle" : "Etiket ekle (ör. toplantı)"}
          placeholderTextColor={colors.textTertiary}
          style={styles.tagInput}
          autoCapitalize="none"
          accessibilityLabel="Etiket"
          maxLength={30}
        />
      </View>
      {rest.length ? (
        <ChipGroup contentPadding={0}>
          {rest.map((tag) => (
            <Chip key={tag} label={`+ #${tag}`} size="sm" onPress={() => add(tag)} />
          ))}
        </ChipGroup>
      ) : null}
    </View>
  );
}

/* ═══════════════════════════ RENK SEÇİCİ ═══════════════════════════ */

export function NoteColorPicker({ value, onChange }: { value: string | null | undefined; onChange: (color: string) => void }) {
  return (
    <View style={styles.colors} accessibilityRole="radiogroup" accessibilityLabel="Not rengi">
      {NOTE_COLORS.map((color) => {
        const active = (value || "") === color.key;
        return (
          <Touchable
            key={color.key || "none"}
            feedback="icon"
            haptic="selection"
            onPress={() => onChange(color.key)}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            accessibilityLabel={color.label}
            style={[
              styles.swatch,
              color.key ? { backgroundColor: color.key } : styles.swatchNone,
              active ? styles.swatchActive : null,
            ]}
          >
            {!color.key ? <Ionicons name="ban-outline" size={16} color={colors.textTertiary} /> : active ? <Ionicons name="checkmark" size={16} color={colors.inkBlock} /> : null}
          </Touchable>
        );
      })}
    </View>
  );
}

/* ═══════════════════════════ NOT KARTI ═══════════════════════════ */

export const NoteCard = memo(function NoteCard({
  note,
  onOpen,
  onToggleItem,
  onTogglePin,
  onMore,
  onTag,
}: {
  note: ToolNote;
  onOpen: (note: ToolNote) => void;
  onToggleItem: (note: ToolNote, index: number) => void;
  onTogglePin: (note: ToolNote) => void;
  onMore: (note: ToolNote) => void;
  onTag: (tag: string) => void;
}) {
  const done = note.checklist.filter((item) => item.done).length;
  const tint = note.color ? { backgroundColor: withAlpha(note.color, 0.22), borderLeftColor: note.color } : null;
  const empty = !note.title && !note.body && !note.checklist.length;
  return (
    <Touchable
      feedback="card"
      onPress={() => onOpen(note)}
      onLongPress={() => onMore(note)}
      style={[styles.card, note.color ? styles.cardColored : null, tint]}
      accessibilityRole="button"
      accessibilityLabel={note.title || "Başlıksız not"}
      accessibilityHint="Düzenlemek için dokun, seçenekler için basılı tut"
    >
      <View style={styles.cardHead}>
        <Text style={[styles.cardTitle, note.title ? null : styles.cardTitleMuted]} numberOfLines={2} {...textScale.dense}>
          {note.title || (empty ? "Boş not" : note.kind === "checklist" ? "Liste" : "Başlıksız not")}
        </Text>
        <Touchable
          feedback="icon"
          haptic="light"
          onPress={() => onTogglePin(note)}
          hitSlop={touchSlop(18)}
          accessibilityLabel={note.pinned ? "Sabitlemeyi kaldır" : "Sabitle"}
          accessibilityState={{ selected: note.pinned }}
        >
          <Ionicons name={note.pinned ? "pin" : "pin-outline"} size={18} color={note.pinned ? colors.brandAccent : colors.textTertiary} />
        </Touchable>
      </View>

      {note.kind === "text" && note.body ? (
        <Text style={styles.cardBody} numberOfLines={6} {...textScale.long}>
          {note.body}
        </Text>
      ) : null}

      {note.kind === "checklist" && note.checklist.length ? (
        <View style={styles.cardList}>
          {note.checklist.slice(0, 8).map((item, index) => (
            <Touchable
              key={index}
              feedback="none"
              haptic="selection"
              onPress={() => onToggleItem(note, index)}
              style={styles.cardItem}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: item.done }}
              accessibilityLabel={item.text}
            >
              <Ionicons name={item.done ? "checkbox" : "square-outline"} size={18} color={item.done ? colors.brandAccent : colors.textTertiary} />
              <Text style={[styles.cardItemText, item.done ? styles.done : null]} numberOfLines={1} {...textScale.dense}>
                {item.text}
              </Text>
            </Touchable>
          ))}
          {note.checklist.length > 8 ? (
            <Text style={styles.meta} {...textScale.dense}>
              +{note.checklist.length - 8} madde
            </Text>
          ) : null}
          <View style={styles.progress} accessibilityLabel={`${note.checklist.length} maddeden ${done} tanesi tamam`}>
            <View style={[styles.progressFill, { width: `${(done / note.checklist.length) * 100}%` }]} />
          </View>
        </View>
      ) : null}

      {note.tags.length ? (
        <View style={styles.cardTags}>
          {note.tags.map((tag) => (
            <Touchable key={tag} feedback="chip" onPress={() => onTag(tag)} style={styles.tagPill} accessibilityLabel={`${tag} etiketine göre süz`}>
              <Text style={styles.tagPillText} {...textScale.badge}>
                #{tag}
              </Text>
            </Touchable>
          ))}
        </View>
      ) : null}

      <View style={styles.cardFoot}>
        <Text style={styles.meta} {...textScale.dense}>
          {formatDate(note.updatedAt, false)}
        </Text>
        <Touchable feedback="icon" onPress={() => onMore(note)} hitSlop={touchSlop(20)} accessibilityLabel="Not seçenekleri">
          <Ionicons name="ellipsis-horizontal" size={20} color={colors.textSecondary} />
        </Touchable>
      </View>
    </Touchable>
  );
});

const styles = StyleSheet.create({
  check: { gap: space.xs },
  checkRow: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 40 },
  checkInput: { flex: 1, ...type.body, color: colors.textPrimary, paddingVertical: space.s },
  done: { textDecorationLine: "line-through", color: colors.textTertiary },

  tags: { gap: space.sm },
  tagWrap: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.xs },
  tagInput: { minWidth: 120, flexGrow: 1, ...type.body, color: colors.textPrimary, paddingVertical: space.s },

  colors: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  swatch: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: hairline,
    borderColor: colors.border,
  },
  swatchNone: { backgroundColor: colors.surface2 },
  swatchActive: { borderWidth: 2, borderColor: colors.brandAccent },

  card: {
    padding: space.md,
    gap: space.sm,
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  cardColored: { borderLeftWidth: 4 },
  cardHead: { flexDirection: "row", alignItems: "flex-start", gap: space.sm },
  cardTitle: { flex: 1, ...type.h3, color: colors.textPrimary },
  cardTitleMuted: { color: colors.textSecondary },
  cardBody: { ...type.body, color: colors.textPrimary },
  cardList: { gap: space.xxs },
  cardItem: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.xxs },
  cardItemText: { flex: 1, ...type.bodySm, color: colors.textPrimary },
  progress: { height: 4, borderRadius: radius.pill, backgroundColor: colors.surface3, overflow: "hidden", marginTop: space.xs },
  progressFill: { height: 4, backgroundColor: colors.brandAccent },
  cardTags: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
  tagPill: { paddingHorizontal: space.sm, paddingVertical: space.xxs, borderRadius: radius.pill, backgroundColor: colors.surface3 },
  tagPillText: { ...type.caption, color: colors.textSecondary },
  cardFoot: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  meta: { ...type.caption, color: colors.textTertiary },
});
