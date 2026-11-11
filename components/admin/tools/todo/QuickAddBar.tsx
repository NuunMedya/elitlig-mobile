/**
 * HIZLI EKLEME — başlığı yaz, isteğe bağlı gün ve önem seç, gönder
 * (web todos/QuickAddBar.js). Açıklama, aşama, bağlantı ya da kişiye atama
 * gerekiyorsa "Ayrıntılı" yazılan başlıkla tam formu açar.
 *
 * DOĞAL DİL (masaüstü hızlı kayıt ile aynı): "yarın 14:00 sahayı ara !" yazınca
 * gün, saat ve öncelik başlıktan ayıklanır; ne anlaşıldığı kutunun altında
 * gönderilmeden ÖNCE gösterilir. Yazıdan anlaşılan tarih çiplerdeki seçimin
 * önüne geçer (lib/admin/quickParse.ts).
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";

import { DateSheet } from "@/components/admin";
import { Chip, ChipGroup, Touchable } from "@/components/ui";
import { parseQuickTask } from "@/lib/admin/quickParse";
import { TOOL_APPS } from "@/lib/admin/toolApps";
import type { TodoPriority } from "@/lib/api/todos";
import { colors, hairline, radius, space, textScale, touchSlop, type } from "@/theme";

import { endOfDay, formatDue } from "./boardUtils";

const APP = TOOL_APPS.gorevler;

type When = "" | "today" | "tomorrow" | "pick";

const pad = (n: number) => String(n).padStart(2, "0");
const toDateInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Seçilen gün → gün sonu (23:59) ISO; listede saatsiz "Bugün / Yarın" görünür. */
export function dueFromChoice(when: When, picked: string): string | null {
  if (when === "today") return endOfDay(0).toISOString();
  if (when === "tomorrow") return endOfDay(1).toISOString();
  if (when === "pick" && picked) {
    const [y, m, d] = picked.split("-").map(Number);
    return new Date(y, m - 1, d, 23, 59).toISOString();
  }
  return null;
}

export function QuickAddBar({
  onAdd,
  onDetailed,
  detailedLabel = "Ayrıntılı",
  defaultWhen = "",
  placeholder,
  hint,
}: {
  onAdd: (payload: { title: string; due_at: string | null; priority: TodoPriority }) => Promise<boolean>;
  onDetailed: (title: string) => void;
  detailedLabel?: string;
  defaultWhen?: When;
  placeholder?: string;
  hint?: string;
}) {
  const [title, setTitle] = useState("");
  const [when, setWhen] = useState<When>(defaultWhen);
  const [picked, setPicked] = useState(() => toDateInput(endOfDay(2)));
  const [pickOpen, setPickOpen] = useState(false);
  const [important, setImportant] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => setWhen(defaultWhen), [defaultWhen]);

  const parsed = useMemo(() => parseQuickTask(title), [title]);
  const understood = [parsed.dueAt ? formatDue(parsed.dueAt) : null, parsed.priority === "high" && !important ? "Önemli" : null].filter(Boolean).join(" · ");

  const submit = async () => {
    const value = title.trim();
    if (!value || busy) return;
    setBusy(true);
    const ok = await onAdd({
      title: (parsed.title || value).slice(0, 200),
      due_at: parsed.dueAt ?? dueFromChoice(when, picked),
      priority: important || parsed.priority === "high" ? "high" : "normal",
    });
    setBusy(false);
    if (ok) {
      setTitle("");
      setImportant(false);
    }
  };

  const pickedLabel = (() => {
    const [y, m, d] = picked.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
  })();

  return (
    <View style={styles.box}>
      <View style={styles.line}>
        <Ionicons name="add" size={22} color={APP.accent} />
        <TextInput
          value={title}
          onChangeText={setTitle}
          maxLength={200}
          placeholder={placeholder || "Ne yapılacak? Örn. yarın 14:00 sahayı ara !"}
          placeholderTextColor={colors.textTertiary}
          style={styles.input}
          returnKeyType="send"
          onSubmitEditing={submit}
          blurOnSubmit={false}
          accessibilityLabel="Yeni iş"
        />
        <Touchable
          feedback="icon"
          haptic="success"
          onPress={submit}
          disabled={busy || !title.trim()}
          style={[styles.send, { backgroundColor: APP.accent }, !title.trim() ? styles.sendOff : null]}
          hitSlop={touchSlop(32)}
          accessibilityLabel="Ekle"
        >
          <Ionicons name="arrow-up" size={18} color={APP.onAccent} />
        </Touchable>
      </View>
      {understood ? (
        <View style={styles.understood} accessibilityLiveRegion="polite">
          <Ionicons name="sparkles-outline" size={14} color={APP.accent} />
          <Text style={[styles.understoodText, { color: APP.accent }]} numberOfLines={1} {...textScale.dense}>
            {understood}
          </Text>
          <Text style={styles.hint} numberOfLines={1} {...textScale.dense}>
            “{parsed.title}”
          </Text>
        </View>
      ) : null}
      <ChipGroup contentPadding={0}>
        <Chip label="Tarihsiz" size="sm" selected={when === ""} onPress={() => setWhen("")} />
        <Chip label="Bugün" icon="sunny-outline" size="sm" selected={when === "today"} onPress={() => setWhen("today")} />
        <Chip label="Yarın" size="sm" selected={when === "tomorrow"} onPress={() => setWhen("tomorrow")} />
        <Chip
          label={when === "pick" ? pickedLabel : "Tarih seç"}
          icon="calendar-outline"
          size="sm"
          selected={when === "pick"}
          onPress={() => {
            setWhen("pick");
            setPickOpen(true);
          }}
        />
        <Chip label="Önemli" icon="flag" size="sm" tone="warn" selected={important} onPress={() => setImportant((v) => !v)} />
        <Chip label={detailedLabel} icon="arrow-forward" size="sm" onPress={() => {
          onDetailed(title.trim());
          setTitle("");
        }} />
      </ChipGroup>
      {hint ? (
        <Text style={styles.hint} {...textScale.dense}>
          {hint}
        </Text>
      ) : null}
      <DateSheet visible={pickOpen} onClose={() => setPickOpen(false)} title="Son gün" value={picked} onSelect={(v) => v && setPicked(v.slice(0, 10))} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.xl,
    borderWidth: hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface1,
  },
  line: { flexDirection: "row", alignItems: "center", gap: space.sm },
  input: { flex: 1, ...type.body, color: colors.textPrimary, paddingVertical: space.xs },
  send: { width: 32, height: 32, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  sendOff: { opacity: 0.4 },
  hint: { ...type.caption, color: colors.textTertiary, flexShrink: 1 },
  understood: { flexDirection: "row", alignItems: "center", gap: space.xs },
  understoodText: { ...type.labelSm },
});
