/**
 * KART AYRINTISI — web todos/TodoDrawer.js'in alt sayfa karşılığı.
 *
 * Durum (Yapılacak / Sürüyor / Tamamlandı — yalnız sahibi), açıklama,
 * bağlantılar, türüne göre iş alanı (maç görevi → maç masası, maç anı →
 * dakika ve tür, paylaşılan tablo → tabloyu aç), etiketler, aşamalar ve
 * atanmış kartta cevap. Altta: düzenle, sabitle, arşivle (bitmişse), sil.
 *
 * Haftanın enleri aday önerisi ve koordinasyon kartlarında öneriler salt
 * okunur listelenir; aday seçme ve yayına alma "Haftanın enleri" ekranında
 * yapılır (o modülün ekranı).
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";

import { FieldLabel } from "@/components/admin";
import { Badge, BottomSheet, Button, Chip, ChipGroup, Input, SegmentedControl, Touchable, withAlpha } from "@/components/ui";
import { errorText } from "@/lib/admin/errors";
import { TODO_LABEL_COLORS, todoLabelHex, type TodoLabelColor } from "@/lib/admin/toolPalette";
import type { TodoCatalog, TodoPatch, TodoStatus, TodoTask } from "@/lib/api/todos";
import { colors, hairline, radius, space, textScale, touchSlop, type } from "@/theme";

import { COLUMNS, KIND_ICONS, formatDue } from "./boardUtils";
import { MatchDeskPanel } from "./MatchDeskPanel";

const PERIOD_LABELS: Record<number, string> = { 1: "1. devre", 2: "2. devre", 3: "Uzatma" };

export function TodoDetailSheet({
  task,
  catalog,
  knownLabels,
  onClose,
  onPatch,
  onChange,
  onEdit,
  onRemove,
}: {
  task: TodoTask | null;
  catalog?: TodoCatalog;
  knownLabels: { text: string; color: string }[];
  onClose: () => void;
  onPatch: (task: TodoTask, payload: TodoPatch) => Promise<TodoTask | null>;
  onChange: (item: TodoTask) => void;
  onEdit: (task: TodoTask) => void;
  onRemove: (task: TodoTask) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState("");

  useEffect(() => {
    setResponse(task?.response || "");
    setError(null);
  }, [task?.id, task?.response]);

  const patch = async (payload: TodoPatch) => {
    if (!task) return null;
    setBusy(true);
    setError(null);
    try {
      return await onPatch(task, payload);
    } catch (e) {
      setError(errorText(e, "Kart güncellenemedi."));
      return null;
    } finally {
      setBusy(false);
    }
  };

  if (!task) return <BottomSheet visible={false} onClose={onClose}>{null}</BottomSheet>;
  const { permissions } = task;
  const late = task.overdue && task.status !== "done";
  const showResponse = permissions.isOwner && task.assignedBy && !["award_nomination", "award_coordination"].includes(task.kind);
  const momentLabel = (catalog?.moments || []).find((item) => item.key === task.moment?.category)?.label;

  return (
    <BottomSheet
      visible
      onClose={onClose}
      title={task.dutyLabel ? `${task.dutyLabel} görevi` : task.kindLabel}
      snap="full"
      footer={
        <View style={styles.footer}>
          {permissions.canEdit ? <FootBtn icon="create-outline" label="Düzenle" onPress={() => onEdit(task)} /> : null}
          {permissions.isOwner ? (
            <FootBtn icon={task.pinned ? "pin" : "pin-outline"} label={task.pinned ? "Sabit" : "Sabitle"} active={task.pinned} onPress={() => void patch({ pinned: !task.pinned })} disabled={busy} />
          ) : null}
          {permissions.isOwner && task.status === "done" ? (
            <FootBtn
              icon="archive-outline"
              label="Arşivle"
              onPress={async () => {
                const saved = await patch({ archived: true });
                if (saved) onClose();
              }}
              disabled={busy}
            />
          ) : null}
          {permissions.canDelete ? <FootBtn icon="trash-outline" label="Sil" danger onPress={() => onRemove(task)} disabled={busy} /> : null}
        </View>
      }
    >
      <View style={styles.wrap}>
        <View style={styles.head}>
          <Ionicons name={KIND_ICONS[task.kind] ?? "ellipse-outline"} size={20} color={colors.brandAccent} />
          <Text style={styles.title} {...textScale.dense}>
            {task.title}
          </Text>
        </View>
        <View style={styles.chips}>
          {task.match ? (
            <Badge
              label={`${task.match.label}${task.match.startsAt ? ` · ${formatDue(task.match.startsAt)}` : ""}${task.match.field ? ` · ${task.match.field}` : ""}`}
              icon="football-outline"
              size="sm"
            />
          ) : null}
          {task.dueAt && task.kind !== "match_duty" ? (
            <Badge label={`${late ? "Gecikti · " : "Son: "}${formatDue(task.dueAt)}`} tone={late ? "danger" : "neutral"} size="sm" icon="calendar-outline" />
          ) : null}
          {task.priority === "high" && task.kind !== "match_duty" ? <Badge label="Yüksek öncelik" tone="warn" size="sm" icon="flag" /> : null}
          {task.assignedBy ? <Badge label={`Atayan: ${task.assignedBy.name}`} size="sm" icon="person-outline" /> : null}
          {!permissions.isOwner ? <Badge label={`Atanan: ${task.owner?.name}`} size="sm" icon="person-outline" /> : null}
        </View>

        {permissions.canChangeStatus ? (
          <SegmentedControl<TodoStatus>
            items={COLUMNS.map((c) => ({ key: c.key, label: c.title, icon: c.key === "done" ? "checkmark" : c.key === "in_progress" ? "play" : "ellipse-outline" }))}
            value={task.status}
            onChange={(status) => status !== task.status && void patch({ status })}
          />
        ) : (
          <Text style={styles.muted} {...textScale.long}>
            {task.statusLabel} · {task.owner?.name} yürütüyor; durumu yalnızca o değiştirir.
          </Text>
        )}

        {task.body ? (
          <Text style={styles.body} selectable {...textScale.long}>
            {task.body}
          </Text>
        ) : null}
        {task.player ? (
          <Text style={styles.muted} {...textScale.dense}>
            Oyuncu: {task.player.name}
          </Text>
        ) : null}
        {task.team ? (
          <Text style={styles.muted} {...textScale.dense}>
            Takım: {task.team.name}
          </Text>
        ) : null}

        {task.kind === "match_moment" && task.moment ? (
          <View style={styles.moment}>
            <Text style={styles.minute} {...textScale.badge}>
              {task.moment.minute != null ? `${task.moment.minute}'` : "—"}
            </Text>
            <View style={styles.flex}>
              <Badge label={momentLabel || task.moment.category || "An"} tone="warn" size="sm" />
              {task.moment.period ? (
                <Text style={styles.muted} {...textScale.dense}>
                  {PERIOD_LABELS[task.moment.period]}
                </Text>
              ) : null}
            </View>
            {task.match ? (
              <Button label="Maça git" size="sm" variant="secondary" onPress={() => router.push({ pathname: "/mac/[id]", params: { id: String(task.match!.id) } })} />
            ) : null}
          </View>
        ) : null}

        {task.kind === "sheet_share" && task.sheet ? (
          <View style={styles.moment}>
            <Ionicons name="grid-outline" size={22} color={colors.brandAccent} />
            <View style={styles.flex}>
              <Text style={styles.h4} {...textScale.dense}>
                {task.sheet.title || "Tablo"}
              </Text>
              <Text style={styles.muted} {...textScale.dense}>
                {task.sheet.sharedBy ? `${task.sheet.sharedBy} paylaştı · ` : ""}
                {task.sheet.role === "editor" ? "Düzenleyebilirsiniz" : "Görüntüleyebilirsiniz"}
              </Text>
            </View>
            <Button label="Tabloyu aç" size="sm" onPress={() => router.push(`/yonetim/araclar/tablolar/${task.sheet!.id}` as never)} />
          </View>
        ) : null}

        {task.kind === "match_duty" ? <MatchDeskPanel task={task} onChange={onChange} /> : null}

        {(task.kind === "award_nomination" || task.kind === "award_coordination") ? (
          <View style={styles.award}>
            {task.categories?.length ? (
              <Text style={styles.muted} {...textScale.dense}>
                Kategoriler: {task.categories.map((c) => c.label).join(", ")}
              </Text>
            ) : null}
            {task.nominations?.length ? (
              task.nominations.map((n, i) => (
                <Text key={i} style={styles.bodySm} {...textScale.dense}>
                  {n.categoryLabel || n.category}: {n.player?.name || "—"}
                  {n.note ? ` · ${n.note}` : ""}
                </Text>
              ))
            ) : null}
            <Button label="Haftanın enleri ekranını aç" icon="ribbon-outline" size="sm" variant="secondary" onPress={() => router.push("/yonetim/haftanin-enleri" as never)} style={styles.start} />
          </View>
        ) : null}

        <LabelEditor task={task} knownLabels={knownLabels} busy={busy} onSave={(labels) => void patch({ labels })} />
        <ChecklistBlock task={task} busy={busy} onSave={(checklist) => void patch({ checklist })} />

        {showResponse ? (
          <View style={styles.block}>
            <Input label="Atayana cevabın / notun" value={response} onChangeText={setResponse} multiline numberOfLines={3} />
            {response !== (task.response || "") ? (
              <Button label="Cevabı kaydet" size="sm" variant="secondary" icon="send-outline" onPress={() => void patch({ response })} loading={busy} style={styles.start} />
            ) : null}
          </View>
        ) : null}
        {!permissions.isOwner && task.response ? (
          <View style={styles.reply}>
            <Text style={styles.label} {...textScale.dense}>
              Cevap
            </Text>
            <Text style={styles.body} {...textScale.long}>
              {task.response}
            </Text>
          </View>
        ) : null}
        {error ? (
          <Text style={styles.error} {...textScale.long}>
            {error}
          </Text>
        ) : null}
      </View>
    </BottomSheet>
  );
}

function FootBtn({
  icon,
  label,
  onPress,
  danger,
  active,
  disabled,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  danger?: boolean;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <Touchable feedback="icon" onPress={onPress} disabled={disabled} style={styles.foot} accessibilityRole="button" accessibilityLabel={label}>
      <Ionicons name={icon} size={22} color={danger ? colors.danger : active ? colors.brandAccent : colors.textSecondary} />
      <Text style={[styles.footText, danger ? styles.dangerText : null]} {...textScale.badge}>
        {label}
      </Text>
    </Touchable>
  );
}

/* ═══════════════════════════ ETİKETLER ═══════════════════════════ */

function LabelEditor({
  task,
  knownLabels,
  busy,
  onSave,
}: {
  task: TodoTask;
  knownLabels: { text: string; color: string }[];
  busy: boolean;
  onSave: (labels: { text: string; color: string }[]) => void;
}) {
  const editable = Boolean(task.permissions?.isOwner || task.permissions?.canEdit);
  const labels = task.labels || [];
  const [text, setText] = useState("");
  const [color, setColor] = useState<TodoLabelColor>("blue");
  if (!labels.length && !editable) return null;
  const has = (value: string) => labels.some((l) => l.text.toLocaleLowerCase("tr-TR") === value.toLocaleLowerCase("tr-TR"));
  const add = (label: { text: string; color: string }) => {
    if (!label.text.trim() || has(label.text)) return;
    onSave([...labels, { text: label.text.trim(), color: label.color }]);
  };
  const suggestions = knownLabels.filter((l) => !has(l.text)).slice(0, 8);
  return (
    <View style={styles.block}>
      <FieldLabel label="Etiketler" />
      <View style={styles.chips}>
        {labels.length ? (
          labels.map((label) => {
            const hex = todoLabelHex(label.color);
            return (
              <View key={label.text} style={[styles.labelChip, { backgroundColor: withAlpha(hex, 0.18), borderColor: hex }]}>
                <Text style={styles.labelText} {...textScale.dense}>
                  {label.text}
                </Text>
                {editable ? (
                  <Touchable feedback="icon" onPress={() => onSave(labels.filter((l) => l.text !== label.text))} disabled={busy} hitSlop={touchSlop(16)} accessibilityLabel={`${label.text} etiketini kaldır`}>
                    <Ionicons name="close" size={14} color={colors.textSecondary} />
                  </Touchable>
                ) : null}
              </View>
            );
          })
        ) : (
          <Text style={styles.muted} {...textScale.dense}>
            Etiket yok.
          </Text>
        )}
      </View>
      {editable ? (
        <>
          {suggestions.length ? (
            <ChipGroup contentPadding={0}>
              {suggestions.map((label) => (
                <Chip key={label.text} label={`+ ${label.text}`} size="sm" onPress={() => add(label)} disabled={busy} />
              ))}
            </ChipGroup>
          ) : null}
          <View style={styles.addRow}>
            <TextInput
              value={text}
              onChangeText={setText}
              maxLength={24}
              placeholder="Yeni etiket (Acil, Yayın…)"
              placeholderTextColor={colors.textTertiary}
              style={styles.addInput}
              onSubmitEditing={() => {
                add({ text, color });
                setText("");
              }}
              accessibilityLabel="Yeni etiket"
            />
            <Button
              label="Ekle"
              size="sm"
              variant="secondary"
              disabled={busy || !text.trim()}
              onPress={() => {
                add({ text, color });
                setText("");
              }}
            />
          </View>
          <View style={styles.swatches} accessibilityRole="radiogroup" accessibilityLabel="Etiket rengi">
            {TODO_LABEL_COLORS.map((item) => (
              <Touchable
                key={item.key}
                feedback="icon"
                haptic="selection"
                onPress={() => setColor(item.key)}
                style={[styles.swatch, { backgroundColor: item.hex }, color === item.key ? styles.swatchOn : null]}
                accessibilityRole="radio"
                accessibilityState={{ selected: color === item.key }}
                accessibilityLabel={item.label}
              >
                {color === item.key ? <Ionicons name="checkmark" size={14} color={colors.onDark} /> : null}
              </Touchable>
            ))}
          </View>
        </>
      ) : null}
    </View>
  );
}

/* ═══════════════════════════ AŞAMALAR ═══════════════════════════ */

function ChecklistBlock({
  task,
  busy,
  onSave,
}: {
  task: TodoTask;
  busy: boolean;
  onSave: (items: { id?: string; text: string; done: boolean }[]) => void;
}) {
  const [text, setText] = useState("");
  const editable = Boolean(task.permissions?.isOwner || task.permissions?.canEdit);
  const items = task.checklist || [];
  if (!items.length && !editable) return null;
  const done = items.filter((i) => i.done).length;
  const save = (next: typeof items) => onSave(next.map(({ id, text: t, done: d }) => ({ id, text: t, done: d })));
  const add = () => {
    const value = text.trim();
    if (!value) return;
    setText("");
    onSave([...items.map(({ id, text: t, done: d }) => ({ id, text: t, done: d })), { text: value, done: false }]);
  };
  return (
    <View style={styles.block}>
      <FieldLabel label={`Aşamalar${items.length ? ` · ${done}/${items.length}` : ""}`} />
      {items.map((item) => (
        <View key={item.id} style={styles.checkRow}>
          <Touchable
            feedback="icon"
            haptic="selection"
            disabled={!editable || busy}
            onPress={() => save(items.map((row) => (row.id === item.id ? { ...row, done: !row.done } : row)))}
            style={styles.checkMain}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: item.done }}
            accessibilityLabel={item.text}
          >
            <Ionicons name={item.done ? "checkbox" : "square-outline"} size={20} color={item.done ? colors.brandAccent : colors.textTertiary} />
            <Text style={[styles.bodySm, styles.flex, item.done ? styles.doneText : null]} {...textScale.dense}>
              {item.text}
            </Text>
          </Touchable>
          {editable ? (
            <Touchable feedback="icon" onPress={() => save(items.filter((row) => row.id !== item.id))} disabled={busy} hitSlop={touchSlop(18)} accessibilityLabel={`${item.text} aşamasını kaldır`}>
              <Ionicons name="close" size={18} color={colors.textTertiary} />
            </Touchable>
          ) : null}
        </View>
      ))}
      {editable ? (
        <View style={styles.addRow}>
          <TextInput
            value={text}
            onChangeText={setText}
            maxLength={200}
            placeholder="Aşama ekle (örn. Kamera şarjı)"
            placeholderTextColor={colors.textTertiary}
            style={styles.addInput}
            onSubmitEditing={add}
            accessibilityLabel="Yeni aşama"
          />
          <Button label="Ekle" size="sm" variant="secondary" disabled={busy || !text.trim()} onPress={add} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  wrap: { gap: space.lg },
  head: { flexDirection: "row", alignItems: "flex-start", gap: space.sm },
  title: { flex: 1, ...type.h1, color: colors.textPrimary },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.xs, alignItems: "center" },
  body: { ...type.body, color: colors.textPrimary },
  bodySm: { ...type.bodySm, color: colors.textPrimary },
  h4: { ...type.h4, color: colors.textPrimary },
  muted: { ...type.caption, color: colors.textTertiary },
  label: { ...type.label, color: colors.textSecondary },
  error: { ...type.bodySm, color: colors.danger },
  doneText: { textDecorationLine: "line-through", color: colors.textTertiary },
  moment: { flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md, borderRadius: radius.lg, backgroundColor: colors.surface2 },
  minute: { ...type.scoreLg, color: colors.textPrimary },
  award: { gap: space.xs, padding: space.md, borderRadius: radius.lg, backgroundColor: colors.surface2 },
  start: { alignSelf: "flex-start" },
  block: { gap: space.sm },
  reply: { gap: space.xs, padding: space.md, borderRadius: radius.md, backgroundColor: colors.surface2 },
  labelChip: { flexDirection: "row", alignItems: "center", gap: space.xs, paddingHorizontal: space.sm, paddingVertical: space.xxs, borderRadius: radius.xs, borderWidth: hairline },
  labelText: { ...type.labelSm, color: colors.textPrimary },
  addRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  addInput: {
    flex: 1,
    ...type.body,
    color: colors.textPrimary,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    borderWidth: hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface2,
  },
  swatches: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  swatch: { width: 28, height: 28, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  swatchOn: { borderWidth: 2, borderColor: colors.textPrimary },
  checkRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  checkMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.xxs },
  footer: { flexDirection: "row", justifyContent: "space-around" },
  foot: { alignItems: "center", gap: 2, paddingHorizontal: space.md, paddingVertical: space.xs },
  footText: { ...type.caption, color: colors.textSecondary },
  dangerText: { color: colors.danger },
});
