/**
 * NOT DÜZENLEYİCİ — alt sayfada tek not.
 *
 * YENİ NOT: "Kaydet" ile oluşturulur (boşsa kapanır).
 * VAR OLAN NOT: web'deki gibi yazarken kendiliğinden kaydedilir (700 ms
 * bekleme); "Bitti" bekleyen değişikliği hemen yazar ve kapatır. Kayıt
 * durumu altta görünür ("Kaydediliyor…", "Kaydedildi").
 *
 * Metin ↔ liste dönüşümü web kuralıyla aynıdır: metnin her satırı madde olur,
 * maddeler "• " ile metne döner.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";

import { BottomSheet, Button, Touchable, withAlpha } from "@/components/ui";
import { errorText } from "@/lib/admin/errors";
import { formatDateTime } from "@/lib/admin/format";
import type { NoteInput, ToolNote } from "@/lib/api/admin/tools";
import { colors, hairline, radius, space, textScale, touchSlop, type } from "@/theme";

import { ChecklistEditor, NoteColorPicker, TagInput } from "./NoteParts";

export interface NoteDraft {
  id?: number;
  kind: "text" | "checklist";
  title: string;
  body: string;
  checklist: { text: string; done: boolean }[];
  tags: string[];
  color: string;
  pinned: boolean;
  updatedAt?: string;
}

export const emptyDraft = (kind: "text" | "checklist" = "text"): NoteDraft => ({
  kind,
  title: "",
  body: "",
  checklist: [],
  tags: [],
  color: "",
  pinned: false,
});

export const draftFromNote = (note: ToolNote): NoteDraft => ({
  id: note.id,
  kind: note.kind,
  title: note.title || "",
  body: note.body || "",
  checklist: note.checklist ?? [],
  tags: note.tags ?? [],
  color: note.color || "",
  pinned: note.pinned,
  updatedAt: note.updatedAt,
});

const payloadOf = (draft: NoteDraft): NoteInput => ({
  kind: draft.kind,
  title: draft.title,
  body: draft.body,
  checklist: draft.checklist,
  tags: draft.tags,
  color: draft.color || null,
  pinned: draft.pinned,
});

type SaveState = "saved" | "dirty" | "saving" | { error: string };

export function NoteEditorSheet({
  visible,
  initial,
  tagSuggestions,
  onClose,
  onCreate,
  onUpdate,
  onDelete,
  onArchive,
}: {
  visible: boolean;
  initial: NoteDraft | null;
  tagSuggestions: string[];
  onClose: () => void;
  onCreate: (input: NoteInput) => Promise<unknown>;
  onUpdate: (id: number, input: NoteInput) => Promise<unknown>;
  onDelete: (id: number) => void;
  onArchive?: (id: number) => void;
}) {
  const [draft, setDraft] = useState<NoteDraft>(initial ?? emptyDraft());
  const [state, setState] = useState<SaveState>("saved");
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(draft);
  latest.current = draft;
  const editing = Boolean(draft.id);

  useEffect(() => {
    if (visible) {
      setDraft(initial ?? emptyDraft());
      setState("saved");
    }
  }, [visible, initial]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const persist = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    const value = latest.current;
    if (!value.id) return;
    setState("saving");
    try {
      await onUpdate(value.id, payloadOf(value));
      setState("saved");
    } catch (error) {
      setState({ error: errorText(error, "Kaydedilemedi.") });
    }
  }, [onUpdate]);

  const change = (patch: Partial<NoteDraft>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
    if (!latest.current.id) return;
    setState("dirty");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void persist(), 700);
  };

  const toggleKind = () => {
    if (draft.kind === "text") {
      const lines = (draft.body || "")
        .split("\n")
        .map((line) => line.replace(/^\s*[-*•]\s*/, "").trim())
        .filter(Boolean);
      change({ kind: "checklist", checklist: [...draft.checklist, ...lines.map((text) => ({ text, done: false }))], body: "" });
    } else {
      change({ kind: "text", body: [draft.body, ...draft.checklist.map((item) => `• ${item.text}`)].filter(Boolean).join("\n"), checklist: [] });
    }
  };

  const close = () => {
    if (editing && state === "dirty") void persist();
    onClose();
  };

  const createNow = async () => {
    const hasContent = draft.title.trim() || draft.body.trim() || draft.checklist.length;
    if (!hasContent) {
      onClose();
      return;
    }
    setBusy(true);
    try {
      await onCreate(payloadOf(draft));
      onClose();
    } catch (error) {
      setState({ error: errorText(error, "Not kaydedilemedi.") });
    } finally {
      setBusy(false);
    }
  };

  const stateText =
    state === "saving" ? "Kaydediliyor…" : state === "dirty" ? "Yazılıyor…" : state === "saved" ? (editing ? "Kaydedildi" : "") : state.error;

  return (
    <BottomSheet
      visible={visible}
      onClose={close}
      title={editing ? "Not" : draft.kind === "checklist" ? "Yeni liste" : "Yeni not"}
      snap="full"
      footer={
        <View style={styles.footer}>
          {editing ? (
            <Touchable feedback="icon" onPress={() => onDelete(draft.id!)} style={styles.footIcon} accessibilityLabel="Notu sil" hitSlop={touchSlop(24)}>
              <Ionicons name="trash-outline" size={22} color={colors.danger} />
            </Touchable>
          ) : null}
          {editing && onArchive ? (
            <Touchable feedback="icon" onPress={() => onArchive(draft.id!)} style={styles.footIcon} accessibilityLabel="Arşivle ya da arşivden çıkar" hitSlop={touchSlop(24)}>
              <Ionicons name="archive-outline" size={22} color={colors.textSecondary} />
            </Touchable>
          ) : null}
          <Text
            style={[styles.state, typeof state === "object" ? styles.stateError : null]}
            numberOfLines={2}
            accessibilityLiveRegion="polite"
            {...textScale.dense}
          >
            {state === "saved" && editing ? "Kaydedildi" : stateText}
          </Text>
          {editing ? (
            <Button label="Bitti" onPress={close} size="md" />
          ) : (
            <Button label="Kaydet" onPress={createNow} loading={busy} size="md" haptic="success" />
          )}
        </View>
      }
    >
      <View style={[styles.editor, draft.color ? { backgroundColor: withAlpha(draft.color, 0.18), borderColor: draft.color } : null]}>
        <View style={styles.top}>
          <TextInput
            value={draft.title}
            onChangeText={(title) => change({ title })}
            placeholder="Başlık"
            placeholderTextColor={colors.textTertiary}
            style={styles.title}
            maxLength={200}
            accessibilityLabel="Başlık"
          />
          <Touchable
            feedback="icon"
            haptic="light"
            onPress={() => change({ pinned: !draft.pinned })}
            hitSlop={touchSlop(22)}
            accessibilityLabel={draft.pinned ? "Sabitlemeyi kaldır" : "Sabitle"}
            accessibilityState={{ selected: draft.pinned }}
          >
            <Ionicons name={draft.pinned ? "pin" : "pin-outline"} size={22} color={draft.pinned ? colors.brandAccent : colors.textSecondary} />
          </Touchable>
        </View>
        {draft.kind === "text" ? (
          <TextInput
            value={draft.body}
            onChangeText={(body) => change({ body })}
            placeholder="Notunuzu yazın…"
            placeholderTextColor={colors.textTertiary}
            style={styles.body}
            multiline
            textAlignVertical="top"
            autoFocus={!editing}
            accessibilityLabel="Not"
          />
        ) : (
          <ChecklistEditor items={draft.checklist} onChange={(checklist) => change({ checklist })} />
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.label} {...textScale.dense}>
          Etiketler
        </Text>
        <TagInput tags={draft.tags} onChange={(tags) => change({ tags })} suggestions={tagSuggestions} />
      </View>

      <View style={styles.section}>
        <Text style={styles.label} {...textScale.dense}>
          Renk
        </Text>
        <NoteColorPicker value={draft.color} onChange={(color) => change({ color })} />
      </View>

      <Button
        label={draft.kind === "text" ? "Listeye çevir" : "Metne çevir"}
        icon={draft.kind === "text" ? "list-outline" : "reorder-four-outline"}
        variant="secondary"
        size="sm"
        onPress={toggleKind}
        style={styles.kindBtn}
      />

      {draft.updatedAt ? (
        <Text style={styles.meta} {...textScale.dense}>
          Son düzenleme: {formatDateTime(draft.updatedAt)}
        </Text>
      ) : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  footer: { flexDirection: "row", alignItems: "center", gap: space.md },
  footIcon: { padding: space.xs },
  state: { flex: 1, ...type.caption, color: colors.textTertiary, textAlign: "right" },
  stateError: { color: colors.danger },
  editor: {
    padding: space.md,
    gap: space.sm,
    borderRadius: radius.lg,
    borderWidth: hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface1,
  },
  top: { flexDirection: "row", alignItems: "center", gap: space.sm },
  title: { flex: 1, ...type.h2, color: colors.textPrimary, paddingVertical: space.xs },
  body: { ...type.bodyLg, color: colors.textPrimary, minHeight: 180 },
  section: { gap: space.sm, marginTop: space.lg },
  label: { ...type.label, color: colors.textSecondary },
  kindBtn: { alignSelf: "flex-start", marginTop: space.lg },
  meta: { ...type.caption, color: colors.textTertiary, marginTop: space.md },
});
