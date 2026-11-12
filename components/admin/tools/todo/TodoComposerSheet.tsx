/**
 * KART FORMU — yeni iş / görev ata / düzenle (web todos/TodoComposer.js).
 *
 * En üstte "Kendim için / Ekibe ata" (todos.assign yetkisi varsa). Sonra tür,
 * başlık, (ekipte) kişiler, ne zaman (Tarihsiz / Bugün / Yarın / Haftaya ya
 * da tarih-saat), öncelik; isteğe bağlı açıklama, aşamalar (her satır bir
 * aşama) ve oyuncu / takım / maç bağlantısı. Ekipte seçilen her kişiye ayrı
 * kart açılır.
 *
 * MOBİLDE YOK: "Aday önerisi" (haftanın enleri için ekipten aday isteme)
 * türü — lig/sezon/hafta kapsamı ve kategori seçimi Haftanın enleri
 * modülündedir; burada yalnız görev, hatırlatma ve not açılır.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { DateField, FieldLabel } from "@/components/admin";
import { BottomSheet, Button, Chip, ChipGroup, Input, SegmentedControl, Touchable } from "@/components/ui";
import { errorText } from "@/lib/admin/errors";
import {
  getTodoAssignees,
  lookupTodoLink,
  todoKeys,
  type TodoCreateInput,
  type TodoPatch,
  type TodoPriority,
  type TodoTask,
} from "@/lib/api/todos";
import { colors, hairline, radius, space, textScale, touchSlop, type } from "@/theme";

import { PersonDot } from "./TodoCards";
import { endOfDay } from "./boardUtils";

type Kind = "task" | "reminder" | "note";
const KINDS: { key: Kind; label: string; hint?: string; personal?: boolean }[] = [
  { key: "task", label: "Görev" },
  { key: "reminder", label: "Hatırlatma", hint: "Unutulmaması gereken küçük iş: maçın eksik detayı vb." },
  { key: "note", label: "Not", hint: "Öne çıkan oyuncu, fikir, gözlem — yalnızca sen görürsün", personal: true },
];
const PRIORITIES: { key: TodoPriority; label: string }[] = [
  { key: "low", label: "Düşük" },
  { key: "normal", label: "Normal" },
  { key: "high", label: "Yüksek" },
];

type LinkType = "player" | "team" | "match";
const LINK_LABELS: Record<LinkType, string> = { player: "Oyuncu", team: "Takım", match: "Maç" };
type Link = { type: LinkType; id: number; label: string } | null;

const pad = (n: number) => String(n).padStart(2, "0");
const toLocal = (iso: string | null | undefined) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const fromLocal = (value: string) => {
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5])) : new Date(value);
};
const QUICK_DUES = [
  { key: "today", label: "Bugün", make: () => endOfDay(0) },
  { key: "tomorrow", label: "Yarın", make: () => endOfDay(1) },
  { key: "week", label: "Haftaya", make: () => endOfDay(7) },
];

const linkFromTask = (task: TodoTask | null): Link => {
  if (!task) return null;
  if (task.player) return { type: "player", id: task.player.id, label: task.player.name };
  if (task.team) return { type: "team", id: task.team.id, label: task.team.name };
  if (task.match) return { type: "match", id: task.match.id, label: task.match.label };
  return null;
};

export interface ComposerState {
  task?: TodoTask | null;
  title?: string;
  audience?: "me" | "team";
}

export function TodoComposerSheet({
  state,
  canAssign,
  onClose,
  onCreate,
  onUpdate,
}: {
  state: ComposerState | null;
  canAssign: boolean;
  onClose: () => void;
  onCreate: (input: TodoCreateInput) => Promise<unknown>;
  onUpdate: (task: TodoTask, payload: TodoPatch) => Promise<unknown>;
}) {
  const task = state?.task ?? null;
  const editing = Boolean(task);
  const [audience, setAudience] = useState<"me" | "team">("me");
  const [kind, setKind] = useState<Kind>("task");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [priority, setPriority] = useState<TodoPriority>("normal");
  const [due, setDue] = useState("");
  const [steps, setSteps] = useState("");
  const [link, setLink] = useState<Link>(null);
  const [extras, setExtras] = useState({ body: false, steps: false, link: false });
  const [assigneeIds, setAssigneeIds] = useState<number[]>([]);
  const [assigneeSearch, setAssigneeSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!state) return;
    const t = state.task ?? null;
    setAudience(canAssign && !t && state.audience === "team" ? "team" : "me");
    setKind(((t?.kind as Kind) || "task") as Kind);
    setTitle(t?.title || state.title || "");
    setBody(t?.body || "");
    setPriority(t?.priority || "normal");
    setDue(toLocal(t?.dueAt));
    setSteps("");
    setLink(linkFromTask(t));
    setExtras({ body: Boolean(t?.body), steps: false, link: Boolean(linkFromTask(t)) });
    setAssigneeIds([]);
    setAssigneeSearch("");
    setError(null);
  }, [state, canAssign]);

  const team = canAssign && !editing && audience === "team";
  const assignable = team && kind !== "note";
  const kinds = KINDS.filter((k) => (team ? !k.personal : true));

  const assigneesQuery = useQuery({
    queryKey: todoKeys.assignees(""),
    queryFn: () => getTodoAssignees(),
    enabled: Boolean(state) && assignable,
    staleTime: 60_000,
  });
  const visibleAssignees = useMemo(() => {
    const needle = assigneeSearch.trim().toLocaleLowerCase("tr-TR");
    const list = assigneesQuery.data ?? [];
    return needle ? list.filter((item) => `${item.name} ${item.city || ""}`.toLocaleLowerCase("tr-TR").includes(needle)) : list;
  }, [assigneesQuery.data, assigneeSearch]);

  const quickDue = QUICK_DUES.find((q) => due && toLocal(q.make().toISOString()) === due)?.key || "";

  const submit = async () => {
    if (!title.trim()) {
      setError("Ne yapılacağını kısaca yazın.");
      return;
    }
    if (assignable && !assigneeIds.length) {
      setError("Görevi kime vereceğini seç.");
      return;
    }
    setBusy(true);
    setError(null);
    const common = {
      title: title.trim(),
      body,
      priority,
      due_at: due ? fromLocal(due).toISOString() : null,
      player_id: link?.type === "player" ? link.id : null,
      team_id: link?.type === "team" ? link.id : null,
      match_id: link?.type === "match" ? link.id : null,
    };
    try {
      if (editing && task) {
        await onUpdate(task, common);
      } else {
        const lines = steps.split("\n").map((l) => l.trim()).filter(Boolean);
        await onCreate({
          ...common,
          kind,
          assignee_ids: assignable && assigneeIds.length ? assigneeIds : undefined,
          checklist: lines.length ? lines.map((text) => ({ text })) : undefined,
        });
      }
      onClose();
    } catch (e) {
      setError(errorText(e, "Kart kaydedilemedi."));
    } finally {
      setBusy(false);
    }
  };

  const submitLabel = editing ? "Kaydet" : assigneeIds.length ? `${assigneeIds.length} kişiye ata` : team ? "Kişi seç" : "Listeme ekle";
  const hint = KINDS.find((k) => k.key === kind)?.hint;

  return (
    <BottomSheet
      visible={state != null}
      onClose={busy ? () => undefined : onClose}
      title={editing ? "Kartı düzenle" : canAssign ? "Yeni iş ya da görev" : "Yeni iş"}
      snap="full"
      footer={<Button label={submitLabel} icon={team ? "paper-plane-outline" : "checkmark"} onPress={submit} loading={busy} fullWidth haptic="success" />}
    >
      <View style={styles.fields}>
        {canAssign && !editing ? (
          <SegmentedControl
            items={[
              { key: "me", label: "Kendim için", icon: "person-outline" },
              { key: "team", label: "Ekibe ata", icon: "people-outline" },
            ]}
            value={audience}
            onChange={(next) => {
              setAudience(next);
              if (next === "me") setAssigneeIds([]);
              if (next === "team" && kind === "note") setKind("task");
            }}
          />
        ) : null}

        {!editing ? (
          <View style={styles.field}>
            <FieldLabel label="Tür" />
            <ChipGroup contentPadding={0}>
              {kinds.map((k) => (
                <Chip key={k.key} label={k.label} selected={kind === k.key} onPress={() => setKind(k.key)} size="sm" />
              ))}
            </ChipGroup>
            {hint ? (
              <Text style={styles.hint} {...textScale.dense}>
                {hint}
              </Text>
            ) : null}
          </View>
        ) : null}

        <Input label="Başlık *" value={title} onChangeText={setTitle} maxLength={200} placeholder={team ? "Ekip ne yapacak?" : "Ne yapılacak?"} autoFocus={!editing} />

        {assignable ? (
          <View style={styles.field}>
            <FieldLabel label="Kime atansın?" />
            <Text style={styles.hint} {...textScale.dense}>
              {assigneeIds.length ? `${assigneeIds.length} kişi seçildi · her birine ayrı kart açılır` : "Bir ya da birden fazla kişi seç"}
            </Text>
            <Input variant="search" value={assigneeSearch} onChangeText={setAssigneeSearch} placeholder="Kişi ya da il ara" leadingIcon="search" size="sm" />
            {assigneesQuery.isLoading ? <ActivityIndicator color={colors.textTertiary} /> : null}
            <View style={styles.people}>
              {visibleAssignees.length ? (
                visibleAssignees.slice(0, 60).map((person) => {
                  const on = assigneeIds.includes(person.id);
                  return (
                    <Touchable
                      key={person.id}
                      feedback="row"
                      haptic="selection"
                      onPress={() => setAssigneeIds((prev) => (prev.includes(person.id) ? prev.filter((id) => id !== person.id) : [...prev, person.id]))}
                      style={[styles.person, on ? styles.personOn : null]}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: on }}
                      accessibilityLabel={person.name}
                    >
                      <PersonDot person={person} size={26} />
                      <View style={styles.flex}>
                        <Text style={styles.personName} numberOfLines={1} {...textScale.dense}>
                          {person.isSelf ? `${person.name} (ben)` : person.name}
                        </Text>
                        {person.city ? (
                          <Text style={styles.hint} {...textScale.dense}>
                            {person.city}
                          </Text>
                        ) : null}
                      </View>
                      <Ionicons name={on ? "checkbox" : "square-outline"} size={22} color={on ? colors.brandAccent : colors.textTertiary} />
                    </Touchable>
                  );
                })
              ) : assigneesQuery.isLoading ? null : (
                <Text style={styles.hint} {...textScale.dense}>
                  Kullanıcı bulunamadı.
                </Text>
              )}
            </View>
          </View>
        ) : null}

        <View style={styles.field}>
          <FieldLabel label="Ne zaman?" />
          <ChipGroup contentPadding={0}>
            <Chip label="Tarihsiz" size="sm" selected={!due} onPress={() => setDue("")} />
            {QUICK_DUES.map((q) => (
              <Chip key={q.key} label={q.label} size="sm" selected={quickDue === q.key} onPress={() => setDue(toLocal(q.make().toISOString()))} />
            ))}
          </ChipGroup>
          <DateField withTime value={due || null} onChange={(v) => setDue(v || "")} clearable placeholder="Tarih ve saat seç" />
        </View>

        <View style={styles.field}>
          <FieldLabel label="Öncelik" />
          <SegmentedControl items={PRIORITIES.map((p) => ({ key: p.key, label: p.label, icon: p.key === "high" ? ("flag" as const) : undefined }))} value={priority} onChange={setPriority} size="sm" />
        </View>

        {extras.body ? <Input label="Açıklama" value={body} onChangeText={setBody} multiline numberOfLines={4} placeholder="Ayrıntı, bağlantı, not…" /> : null}
        {extras.steps && !editing ? (
          <Input label="Aşamalar (her satır bir aşama)" value={steps} onChangeText={setSteps} multiline numberOfLines={4} placeholder={"Kamerayı kur\nMikrofonu test et"} />
        ) : null}
        {extras.link ? (
          <View style={styles.field}>
            <FieldLabel label="Oyuncu, takım ya da maç" />
            <LinkPicker value={link} onChange={setLink} />
          </View>
        ) : null}

        {!extras.body || (!extras.steps && !editing) || !extras.link ? (
          <View style={styles.extras}>
            {!extras.body ? <Chip label="+ Açıklama" size="sm" onPress={() => setExtras((e) => ({ ...e, body: true }))} /> : null}
            {!extras.steps && !editing ? <Chip label="+ Aşamalar" size="sm" onPress={() => setExtras((e) => ({ ...e, steps: true }))} /> : null}
            {!extras.link ? <Chip label="+ Oyuncu / takım / maç bağla" size="sm" onPress={() => setExtras((e) => ({ ...e, link: true }))} /> : null}
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

/** Karta oyuncu, takım ya da maç bağlamak için arama (GET /api/todos/lookup). */
function LinkPicker({ value, onChange }: { value: Link; onChange: (link: Link) => void }) {
  const [kind, setKind] = useState<LinkType>(value?.type || "player");
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);
  const results = useQuery({
    queryKey: ["admin", "todos", "lookup", kind, debounced],
    queryFn: () => lookupTodoLink(kind, debounced),
    enabled: debounced.length >= 2,
  });

  if (value) {
    return (
      <View style={styles.linkChosen}>
        <Text style={styles.linkType} {...textScale.badge}>
          {LINK_LABELS[value.type]}
        </Text>
        <Text style={[styles.flex, styles.personName]} numberOfLines={2} {...textScale.dense}>
          {value.label}
        </Text>
        <Touchable feedback="icon" onPress={() => onChange(null)} hitSlop={touchSlop(20)} accessibilityLabel="Bağlantıyı kaldır">
          <Ionicons name="close-circle" size={20} color={colors.textTertiary} />
        </Touchable>
      </View>
    );
  }
  return (
    <View style={styles.field}>
      <SegmentedControl
        items={(Object.keys(LINK_LABELS) as LinkType[]).map((k) => ({ key: k, label: LINK_LABELS[k] }))}
        value={kind}
        onChange={(k) => setKind(k)}
        size="sm"
      />
      <Input variant="search" value={q} onChangeText={setQ} placeholder={`${LINK_LABELS[kind]} ara (en az 2 harf)`} leadingIcon="search" size="sm" />
      {debounced.length >= 2 ? (
        <View style={styles.results}>
          {results.isLoading ? (
            <Text style={styles.hint} {...textScale.dense}>
              Aranıyor…
            </Text>
          ) : !results.data?.length ? (
            <Text style={styles.hint} {...textScale.dense}>
              Sonuç yok.
            </Text>
          ) : (
            results.data.map((item) => (
              <Touchable
                key={item.id}
                feedback="row"
                onPress={() => {
                  onChange({ type: kind, id: item.id, label: item.label });
                  setQ("");
                }}
                style={styles.result}
                accessibilityRole="button"
              >
                <Text style={styles.personName} {...textScale.dense}>
                  {item.label}
                </Text>
                {item.sub ? (
                  <Text style={styles.hint} {...textScale.dense}>
                    {item.sub}
                  </Text>
                ) : null}
              </Touchable>
            ))
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  fields: { gap: space.lg },
  /* Gece teması: alan grupları cam kartlarda (FormSheet dili). */
  field: { gap: space.sm, padding: space.md, borderRadius: radius.xl, borderWidth: hairline, borderColor: colors.border, backgroundColor: colors.surface1 },
  hint: { ...type.caption, color: colors.textTertiary },
  error: { ...type.bodySm, color: colors.danger },
  people: { borderRadius: radius.lg, borderWidth: hairline, borderColor: colors.border, overflow: "hidden", backgroundColor: colors.surface2 },
  person: { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.md, paddingVertical: space.sm, borderTopWidth: hairline, borderTopColor: colors.separator },
  personOn: { backgroundColor: colors.brandDim },
  personName: { ...type.h4, color: colors.textPrimary },
  extras: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  linkChosen: { flexDirection: "row", alignItems: "center", gap: space.sm, padding: space.md, borderRadius: radius.lg, backgroundColor: colors.brandDim, borderWidth: hairline, borderColor: colors.brandBorder },
  linkType: { ...type.micro, color: colors.brandAccent },
  results: { borderRadius: radius.lg, borderWidth: hairline, borderColor: colors.border, overflow: "hidden", backgroundColor: colors.surface2 },
  result: { paddingHorizontal: space.md, paddingVertical: space.sm, borderTopWidth: hairline, borderTopColor: colors.separator, gap: 2 },
});
