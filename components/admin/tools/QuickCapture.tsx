/**
 * HIZLI KAYIT — tek satırda görev, not, etkinlik ya da gider.
 *
 * Masaüstü Elitlig Araçlar'daki ⌃⌥N penceresinin telefon karşılığı: türü seç,
 * yaz, gönder. Görev ve etkinlikte "yarın 14:00 sahayı ara !" gibi yazılan
 * gün, saat ve öncelik başlıktan ayıklanır; giderde tutar başa yazılır
 * ("1.250 hakem ücreti"). Ne anlaşıldığı gönderilmeden ÖNCE alt satırda
 * gösterilir; kayıt sonrası toast'taki "Aç" ilgili araca götürür.
 *
 * Yazı kaydedilemezse kutuda kalır (kullanıcı yazdığını kaybetmez).
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";

import { Touchable, useToast } from "@/components/ui";
import { errorText } from "@/lib/admin/errors";
import { parseQuickAmount, parseQuickTask } from "@/lib/admin/quickParse";
import { TOOL_APPS, type ToolAppKey } from "@/lib/admin/toolApps";
import { createLedgerEntry, money, todayKey } from "@/lib/api/admin/accounting";
import { createEvent, createNote, toolKeys } from "@/lib/api/admin/tools";
import { createTodo, todoKeys } from "@/lib/api/todos";
import { colors, hairline, radius, space, textScale, touchSlop, type } from "@/theme";

import { formatDue } from "./todo/boardUtils";

type Kind = "task" | "note" | "event" | "expense";

const KINDS: { key: Kind; label: string; app: ToolAppKey; icon: keyof typeof Ionicons.glyphMap; placeholder: string }[] = [
  { key: "task", label: "Görev", app: "gorevler", icon: "checkbox-outline", placeholder: "yarın 14:00 sahayı ara !" },
  { key: "note", label: "Not", app: "not-defteri", icon: "document-text-outline", placeholder: "Aklına geleni yaz…" },
  { key: "event", label: "Etkinlik", app: "ajanda", icon: "calendar-outline", placeholder: "cuma 19:00 yönetim toplantısı" },
  { key: "expense", label: "Gider", app: "muhasebe", icon: "wallet-outline", placeholder: "1.250 hakem ücreti" },
];

export function QuickCapture() {
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<Kind>("task");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const meta = KINDS.find((k) => k.key === kind)!;
  const app = TOOL_APPS[meta.app];
  const parsed = useMemo(() => (kind === "task" || kind === "event" ? parseQuickTask(text) : null), [kind, text]);
  const amount = useMemo(() => (kind === "expense" ? parseQuickAmount(text) : null), [kind, text]);

  const hint = (() => {
    if (!text.trim()) {
      return kind === "expense"
        ? "Önce tutar, sonra açıklama. Bugün, nakit, ödendi olarak yazılır."
        : kind === "note"
          ? "Not defterine eklenir."
          : kind === "event"
            ? "Gün ve saat yazarsan ajandaya o saate eklenir; yazmazsan bir saat sonrasına."
            : "Gün, saat ve ! (önemli) yazıdan anlaşılır.";
    }
    if (kind === "expense") return amount ? `${money(amount.amount)} gider${amount.description ? ` · ${amount.description}` : ""}` : "Tutarı başa yaz: örn. 1.250 hakem ücreti";
    if (parsed) return [parsed.dueAt ? formatDue(parsed.dueAt) : kind === "event" ? "Bir saat sonra" : "Tarihsiz", parsed.priority === "high" && kind === "task" ? "Önemli" : null, `“${parsed.title}”`].filter(Boolean).join(" · ");
    return "Not defterine eklenir.";
  })();

  const submit = async () => {
    const value = text.trim();
    if (!value || busy) return;
    if (kind === "expense" && !amount) {
      toast.show({ message: "Tutarı başa yaz: örn. 1.250 hakem ücreti", tone: "danger" });
      return;
    }
    setBusy(true);
    try {
      if (kind === "task" && parsed) {
        await createTodo({ kind: "task", title: parsed.title.slice(0, 200), due_at: parsed.dueAt, priority: parsed.priority });
        void queryClient.invalidateQueries({ queryKey: todoKeys.all });
      } else if (kind === "note") {
        const [first, ...rest] = value.split("\n");
        await createNote(rest.length ? { title: first.slice(0, 200), body: rest.join("\n") } : { title: "", body: first });
        void queryClient.invalidateQueries({ queryKey: toolKeys.notesAll() });
      } else if (kind === "event" && parsed) {
        // Saat yazılmadıysa (yalnız gün) tüm gün etkinliği; hiçbir şey yazılmadıysa bir saat sonrası.
        const allDay = Boolean(parsed.dueAt) && !parsed.hasTime;
        const start = parsed.dueAt ? new Date(parsed.dueAt) : new Date(Date.now() + 3_600_000);
        if (allDay) start.setHours(0, 0, 0, 0);
        const end = allDay ? new Date(start.getFullYear(), start.getMonth(), start.getDate(), 23, 59) : new Date(start.getTime() + 3_600_000);
        await createEvent({
          title: parsed.title.slice(0, 200),
          description: null,
          location: null,
          category: "general",
          color: null,
          all_day: allDay,
          start_at: start.toISOString(),
          end_at: end.toISOString(),
          recurrence: "none",
          repeat_until: null,
          remind_minutes: allDay ? null : 30,
        });
        void queryClient.invalidateQueries({ queryKey: toolKeys.eventsAll() });
      } else if (kind === "expense" && amount) {
        await createLedgerEntry({
          type: "expense",
          amount: amount.amount,
          vat_rate: 0,
          category: "",
          party: "",
          description: amount.description,
          entry_date: todayKey(),
          due_date: null,
          status: "paid",
          method: "cash",
          document_no: "",
          note: "",
          account_id: null,
        });
        void queryClient.invalidateQueries({ queryKey: ["admin", "ledger"] });
        void queryClient.invalidateQueries({ queryKey: ["admin", "finance"] });
      }
      void queryClient.invalidateQueries({ queryKey: toolKeys.overview() });
      setText("");
      toast.show({ message: `${meta.label} kaydedildi.`, tone: "success", action: { label: "Aç", onPress: () => router.push(app.route as never) } });
    } catch (error) {
      toast.show({ message: errorText(error, `${meta.label} kaydedilemedi. Bağlantını kontrol edip tekrar dene.`), tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.box}>
      <View style={styles.kinds} accessibilityRole="tablist">
        {KINDS.map((item) => {
          const selected = item.key === kind;
          const identity = TOOL_APPS[item.app];
          return (
            <Touchable
              key={item.key}
              feedback="chip"
              haptic="selection"
              onPress={() => setKind(item.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={`Hızlı kayıt türü: ${item.label}`}
              style={[styles.kind, selected ? { backgroundColor: identity.accent } : { backgroundColor: identity.accentSoft }]}
            >
              <Ionicons name={item.icon} size={15} color={selected ? identity.onAccent : identity.accent} />
              <Text style={[styles.kindLabel, { color: selected ? identity.onAccent : identity.accent }]} numberOfLines={1} {...textScale.badge}>
                {item.label}
              </Text>
            </Touchable>
          );
        })}
      </View>
      <View style={styles.line}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={meta.placeholder}
          placeholderTextColor={colors.textTertiary}
          style={styles.input}
          multiline={kind === "note"}
          returnKeyType={kind === "note" ? "default" : "send"}
          onSubmitEditing={kind === "note" ? undefined : () => void submit()}
          blurOnSubmit={false}
          maxLength={kind === "note" ? 5000 : 200}
          accessibilityLabel={`Hızlı ${meta.label.toLocaleLowerCase("tr-TR")} kaydı`}
        />
        <Touchable
          feedback="icon"
          haptic="success"
          onPress={() => void submit()}
          disabled={busy || !text.trim()}
          hitSlop={touchSlop(34)}
          accessibilityLabel="Kaydet"
          style={[styles.send, { backgroundColor: app.accent }, busy || !text.trim() ? styles.off : null]}
        >
          <Ionicons name="arrow-up" size={18} color={app.onAccent} />
        </Touchable>
      </View>
      <Text style={styles.hint} numberOfLines={2} accessibilityLiveRegion="polite" {...textScale.dense}>
        {hint}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: space.sm, padding: space.md, borderRadius: radius.xl, borderWidth: hairline, borderColor: colors.border, backgroundColor: colors.surface1 },
  kinds: { flexDirection: "row", gap: space.xs },
  kind: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.xxs, minHeight: 34, borderRadius: radius.pill, paddingHorizontal: space.xs },
  kindLabel: { ...type.labelSm },
  line: { flexDirection: "row", alignItems: "flex-end", gap: space.sm },
  input: { flex: 1, ...type.body, color: colors.textPrimary, paddingVertical: space.sm, maxHeight: 120 },
  send: { width: 34, height: 34, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", marginBottom: space.xxs },
  off: { opacity: 0.4 },
  hint: { ...type.caption, color: colors.textTertiary },
});
