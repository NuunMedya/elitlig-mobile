/**
 * Süreç: aşamalara göre adımlar.
 *
 * Web'deki sürükle-bırak sıralama telefonda "taşı" menüsüne çevrildi: adıma
 * basılı tutunca Yukarı / Aşağı / Başka aşamaya taşı, durum değiştir ve sil
 * gelir; aşama başlığındaki menüde düzenle, adım ekle, yukarı / aşağı taşı ve
 * sil. Hızlı durum (soldaki daire = tamamlandı), aşama içi hızlı ekleme,
 * süzgeçler (arama, durum, gecikenler, sorumlu rol, atanan, tamamlananları
 * gizle), tablodan aktarma ve CSV paylaşımı.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { ActionSheet, FormSheet, OptionSheet, SelectField, ToggleField, confirmAction, type SheetAction } from "@/components/admin";
import { Avatar, Badge, Button, Chip, ChipGroup, EmptyState, Input, Touchable, withAlpha } from "@/components/ui";
import {
  CLOSED_STEP,
  NEUTRAL_COLOR,
  PRIORITY_META,
  PROJECT_COLORS,
  STEP_EXPORT,
  STEP_STATUSES,
  STEP_STATUS_META,
  TOOL_META,
  dueLabel,
  groupSteps,
  isStepOverdue,
  matches,
  toCsv,
  todayIso,
} from "@/lib/admin/projectUtils";
import type { Phase, Step, StepStatus } from "@/lib/api/admin/projects";
import { colors, radius, space, textScale, type } from "@/theme";

import { ImportStepsSheet } from "./ImportSheets";
import { useProject } from "./ProjectContext";
import { ProgressBar, shareCsv } from "./ui";

const NONE = "none";
const keyOf = (phaseId: number | null) => (phaseId == null ? NONE : String(phaseId));

export function Process() {
  const ctx = useProject();
  const { data, ops, canEdit, personName, nav, notify, settings, me } = ctx;
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"" | "overdue" | StepStatus>("");
  const [role, setRole] = useState<string | null>(null);
  const [assignee, setAssignee] = useState<string | null>(null);
  const [hideDone, setHideDone] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [phaseEdit, setPhaseEdit] = useState<Phase | "new" | null>(null);
  const [importing, setImporting] = useState(false);
  const [stepMenu, setStepMenu] = useState<Step | null>(null);
  const [phaseMenu, setPhaseMenu] = useState<Phase | null>(null);
  const [statusFor, setStatusFor] = useState<Step | null>(null);
  const [moveFor, setMoveFor] = useState<Step | null>(null);
  const [addingIn, setAddingIn] = useState<string | null>(null);
  const [phaseDelete, setPhaseDelete] = useState<{ phase: Phase; run: (p?: Record<string, string>, label?: string) => Promise<void> } | null>(null);
  const today = todayIso();

  // Genel bakıştan bir aşamaya gelindiyse yalnız o aşama açık kalır.
  const focusPhase = nav.params.asamaid;
  useEffect(() => {
    if (!focusPhase) return;
    setCollapsed(new Set([...data.phases.map((p) => String(p.id)), NONE].filter((k) => k !== String(focusPhase))));
  }, [focusPhase, nav.version]); // eslint-disable-line react-hooks/exhaustive-deps

  const groups = useMemo(() => groupSteps(data.phases, data.steps), [data.phases, data.steps]);
  const openQuestions = useMemo(() => {
    const m = new Map<number, number>();
    data.questions.forEach((x) => {
      if (x.step_id && x.status === "open") m.set(x.step_id, (m.get(x.step_id) || 0) + 1);
    });
    return m;
  }, [data.questions]);
  const roles = useMemo(() => [...new Set([...settings.roles.map((r) => r.name), ...data.steps.flatMap((s) => s.responsible)])], [settings.roles, data.steps]);
  const assignees = useMemo(() => [...new Set(data.steps.map((s) => s.assignee_id).filter((x): x is number => Boolean(x)))], [data.steps]);

  const filtering = Boolean(q || status || role || assignee || hideDone);
  const visible = (s: Step) =>
    (!status || (status === "overdue" ? isStepOverdue(s, today) : s.status === status)) &&
    (!role || s.responsible.includes(role)) &&
    (!assignee || (assignee === "me" ? s.assignee_id === me : assignee === "none" ? !s.assignee_id : String(s.assignee_id) === assignee)) &&
    (!hideDone || !CLOSED_STEP.has(s.status)) &&
    matches(q, s.title, s.description, s.result, s.responsible.join(" "));
  const shownCount = data.steps.filter(visible).length;

  const toggle = (key: string) =>
    setCollapsed((c) => {
      const n = new Set(c);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  const allKeys = groups.map((g) => keyOf(g.phase?.id ?? null));

  /* ----------------------------- taşıma ----------------------------- */
  const listsNow = () => new Map(groups.map((g) => [keyOf(g.phase?.id ?? null), g.steps.map((s) => s.id)]));
  const toPhase = (key: string) => (key === NONE ? null : Number(key));
  const moveWithin = async (step: Step, dir: -1 | 1) => {
    const key = keyOf(step.phase_id);
    const list = listsNow().get(key) || [];
    const i = list.indexOf(step.id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    await ops.reorder(list.map((id) => ({ id, phase_id: toPhase(key) })));
  };
  const moveTo = async (step: Step, phaseId: number | null) => {
    const source = keyOf(step.phase_id);
    const target = keyOf(phaseId);
    if (source === target) return;
    const lists = listsNow();
    if (!lists.has(target)) lists.set(target, []);
    lists.set(source, (lists.get(source) || []).filter((x) => x !== step.id));
    lists.get(target)!.push(step.id);
    const order = [target, source].flatMap((key) => (lists.get(key) || []).map((id) => ({ id, phase_id: toPhase(key) })));
    if (await ops.reorder(order)) notify(`"${step.title}" taşındı.`);
  };
  const movePhase = async (phase: Phase, dir: -1 | 1) => {
    const ids = groups.filter((g) => g.phase).map((g) => g.phase!.id);
    const i = ids.indexOf(phase.id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    await ops.reorder(null, ids);
  };

  const removeStep = async (step: Step) => {
    const ok = await confirmAction({ title: "Adım silinsin mi?", message: `"${step.title}" silinecek. Bağlı sorular ve notlar projede kalır.`, confirmLabel: "Sil", destructive: true });
    if (ok && (await ops.removeStep(step.id))) notify("Adım silindi.");
  };

  const removePhase = (phase: Phase) => {
    const count = data.steps.filter((s) => s.phase_id === phase.id).length;
    const run = async (params?: Record<string, string>, label?: string) => {
      const ok = await confirmAction({
        title: "Aşama silinsin mi?",
        message: `"${phase.name}" aşamasında ${count} adım var.${label ? ` ${label}` : ""}`,
        confirmLabel: "Aşamayı sil",
        destructive: true,
      });
      if (ok && (await ops.removePhase(phase.id, params))) notify("Aşama silindi.");
    };
    if (!count) {
      void run();
      return;
    }
    setPhaseDelete({ phase, run });
  };

  const stepActions = (s: Step): SheetAction[] => {
    const list = listsNow().get(keyOf(s.phase_id)) || [];
    const i = list.indexOf(s.id);
    return [
      { label: "Ayrıntıları aç", icon: "open-outline", onPress: () => nav.openStep(s.id) },
      { label: "Durumu değiştir", icon: "swap-horizontal-outline", hidden: !canEdit, onPress: () => setStatusFor(s) },
      { label: "Yukarı taşı", icon: "arrow-up", hidden: !canEdit, disabled: i <= 0, onPress: () => void moveWithin(s, -1) },
      { label: "Aşağı taşı", icon: "arrow-down", hidden: !canEdit, disabled: i < 0 || i >= list.length - 1, onPress: () => void moveWithin(s, 1) },
      { label: "Başka aşamaya taşı", icon: "git-compare-outline", hidden: !canEdit, onPress: () => setMoveFor(s) },
      { label: "Adımı sil", icon: "trash-outline", danger: true, hidden: !canEdit, onPress: () => void removeStep(s) },
    ];
  };
  const phaseActions = (phase: Phase): SheetAction[] => {
    const ids = groups.filter((g) => g.phase).map((g) => g.phase!.id);
    const i = ids.indexOf(phase.id);
    return [
      { label: "Aşamayı düzenle", icon: "create-outline", onPress: () => setPhaseEdit(phase) },
      {
        label: "Adım ekle",
        icon: "add",
        onPress: () => {
          setCollapsed((c) => {
            const n = new Set(c);
            n.delete(String(phase.id));
            return n;
          });
          setAddingIn(String(phase.id));
        },
      },
      { label: "Yukarı taşı", icon: "arrow-up", disabled: i <= 0, onPress: () => void movePhase(phase, -1) },
      { label: "Aşağı taşı", icon: "arrow-down", disabled: i >= ids.length - 1, onPress: () => void movePhase(phase, 1) },
      { label: "Aşamayı sil", icon: "trash-outline", danger: true, onPress: () => removePhase(phase) },
    ];
  };

  const exportCsv = () => {
    const ordered = groups.flatMap((g) => g.steps);
    void shareCsv(`${data.item.name} - adimlar`, toCsv(STEP_EXPORT(data.phases, personName), ordered));
  };

  return (
    <View style={styles.wrap}>
      <Input variant="search" value={q} onChangeText={setQ} placeholder="Adım ara…" />
      <ChipGroup contentPadding={0}>
        <Chip label="Tümü" size="sm" selected={!status} onPress={() => setStatus("")} />
        <Chip label="Gecikenler" size="sm" tone="danger" selected={status === "overdue"} onPress={() => setStatus(status === "overdue" ? "" : "overdue")} />
        {STEP_STATUSES.map((k) => (
          <Chip key={k} label={STEP_STATUS_META[k].label} size="sm" selected={status === k} onPress={() => setStatus(status === k ? "" : k)} />
        ))}
      </ChipGroup>
      <View style={styles.row2}>
        <View style={styles.flex}>
          <SelectField<string>
            value={role}
            onChange={setRole}
            placeholder="Tüm sorumlular"
            clearable
            icon="person-circle-outline"
            sheetTitle="Sorumlu rol"
            options={roles.map((r) => ({ value: r, label: r }))}
          />
        </View>
        <View style={styles.flex}>
          <SelectField<string>
            value={assignee}
            onChange={setAssignee}
            placeholder="Herkes"
            clearable
            icon="person-outline"
            sheetTitle="Atanan"
            valueLabel={assignee === "me" ? "Bana atananlar" : assignee === "none" ? "Atanmamış" : assignee ? personName(Number(assignee)) : null}
            options={[
              ...(me ? [{ value: "me", label: "Bana atananlar" }] : []),
              { value: "none", label: "Atanmamış" },
              ...assignees.filter((a) => a !== me).map((a) => ({ value: String(a), label: personName(a) })),
            ]}
          />
        </View>
      </View>
      <ToggleField label="Tamamlananları gizle" value={hideDone} onChange={setHideDone} />
      <View style={styles.tools}>
        <Button
          label={collapsed.size ? "Tümünü aç" : "Tümünü kapat"}
          icon={collapsed.size ? "chevron-down" : "chevron-up"}
          variant="ghost"
          size="sm"
          onPress={() => setCollapsed(collapsed.size ? new Set() : new Set(allKeys))}
        />
        <View style={styles.flex} />
        <Button label="CSV" icon="share-outline" variant="secondary" size="sm" onPress={exportCsv} disabled={!data.steps.length} />
        {canEdit ? <Button label="Aktar" icon="clipboard-outline" variant="secondary" size="sm" onPress={() => setImporting(true)} /> : null}
        {canEdit ? <Button label="Aşama" icon="add" size="sm" onPress={() => setPhaseEdit("new")} /> : null}
      </View>
      {filtering ? (
        <Touchable
          onPress={() => {
            setQ("");
            setStatus("");
            setRole(null);
            setAssignee(null);
            setHideDone(false);
          }}
          accessibilityRole="button"
        >
          <Text style={styles.filterInfo} {...textScale.dense}>
            {shownCount} / {data.steps.length} adım gösteriliyor · <Text style={styles.link}>Süzgeçleri temizle</Text>
          </Text>
        </Touchable>
      ) : null}

      {!groups.length ? (
        <EmptyState
          variant="inline"
          icon="git-branch-outline"
          title="Süreç boş"
          body="Aşama ekleyip adımlarınızı yazın ya da tablodan aktarın."
          action={canEdit ? { label: "İlk aşamayı ekle", onPress: () => setPhaseEdit("new") } : undefined}
        />
      ) : null}

      {groups.map(({ phase, steps }, gi) => {
        const key = keyOf(phase?.id ?? null);
        const shown = steps.filter(visible);
        if (filtering && !shown.length && steps.length) return null;
        const counted = steps.filter((s) => s.status !== "skipped");
        const doneN = steps.filter((s) => s.status === "done").length;
        const pct = counted.length ? Math.round((doneN / counted.length) * 100) : 0;
        const late = steps.filter((s) => isStepOverdue(s, today)).length;
        const isCollapsed = collapsed.has(key) && !(filtering && shown.length);
        const color = phase?.color || NEUTRAL_COLOR;
        return (
          <View key={key} style={[styles.phase, { borderLeftColor: color }]}>
            <View style={styles.phaseHead}>
              <Touchable onPress={() => toggle(key)} style={styles.phaseToggle} accessibilityRole="button" accessibilityState={{ expanded: !isCollapsed }}>
                <Ionicons name={isCollapsed ? "chevron-forward" : "chevron-down"} size={16} color={colors.textSecondary} />
                <View style={[styles.phaseNum, { backgroundColor: withAlpha(color, 0.16) }]}>
                  <Text style={[styles.phaseNumText, { color }]} {...textScale.badge}>{phase ? gi + 1 : "–"}</Text>
                </View>
                <View style={styles.flex}>
                  <Text style={styles.phaseName} numberOfLines={2} {...textScale.dense}>{phase?.name || "Aşamasız adımlar"}</Text>
                  <View style={styles.phaseStats}>
                    {late ? <Badge label={`${late} geciken`} tone="danger" size="xs" /> : null}
                    <Text style={styles.small} {...textScale.dense}>{doneN}/{steps.length} · %{pct}</Text>
                  </View>
                </View>
              </Touchable>
              {canEdit && phase ? (
                <Touchable feedback="icon" onPress={() => setPhaseMenu(phase)} accessibilityRole="button" accessibilityLabel={`${phase.name} aşaması işlemleri`} hitSlop={8} style={styles.more}>
                  <Ionicons name="ellipsis-horizontal" size={20} color={colors.textSecondary} />
                </Touchable>
              ) : null}
            </View>
            <ProgressBar value={pct} color={color} thin />
            {phase?.note && !isCollapsed ? <Text style={styles.phaseNote} {...textScale.long}>{phase.note}</Text> : null}
            {!isCollapsed ? (
              <View style={styles.steps}>
                {shown.map((s) => (
                  <StepRow key={s.id} step={s} questionCount={openQuestions.get(s.id) || 0} today={today} onMenu={() => setStepMenu(s)} onStatus={() => setStatusFor(s)} />
                ))}
                {!steps.length ? <Text style={styles.small} {...textScale.dense}>Bu aşamada adım yok.</Text> : null}
                {canEdit ? <InlineAdd phaseId={phase?.id ?? null} autoFocus={addingIn === key} onDone={() => setAddingIn(null)} /> : null}
              </View>
            ) : null}
          </View>
        );
      })}
      {groups.length && canEdit ? (
        <Text style={styles.hint} {...textScale.dense}>Adıma dokunun: ayrıntılar · Basılı tutun: taşı, durum, sil.</Text>
      ) : null}

      <ActionSheet visible={stepMenu != null} onClose={() => setStepMenu(null)} title={stepMenu?.title} actions={stepMenu ? stepActions(stepMenu) : []} />
      <ActionSheet visible={phaseMenu != null} onClose={() => setPhaseMenu(null)} title={phaseMenu?.name} actions={phaseMenu ? phaseActions(phaseMenu) : []} />
      <OptionSheet<string>
        visible={statusFor != null}
        onClose={() => setStatusFor(null)}
        title="Adım durumu"
        value={statusFor?.status}
        options={STEP_STATUSES.map((k) => ({ value: k, label: STEP_STATUS_META[k].label, icon: STEP_STATUS_META[k].icon }))}
        onSelect={(v) => {
          const s = statusFor;
          setStatusFor(null);
          if (s && typeof v === "string" && v !== s.status) void ops.saveStep(s.id, { status: v as StepStatus });
        }}
      />
      <OptionSheet<string>
        visible={moveFor != null}
        onClose={() => setMoveFor(null)}
        title="Hangi aşamaya taşınsın?"
        value={moveFor ? keyOf(moveFor.phase_id) : null}
        options={[...[...data.phases].sort((a, b) => a.position - b.position).map((p) => ({ value: String(p.id), label: p.name })), { value: NONE, label: "Aşamasız" }]}
        onSelect={(v) => {
          const s = moveFor;
          setMoveFor(null);
          if (s && typeof v === "string") void moveTo(s, toPhase(v));
        }}
      />
      <ActionSheet
        visible={phaseDelete != null}
        onClose={() => setPhaseDelete(null)}
        title={phaseDelete ? `"${phaseDelete.phase.name}" — adımlar ne olsun?` : undefined}
        actions={
          phaseDelete
            ? [
                { label: "Aşamasız kalsın", icon: "remove-circle-outline", onPress: () => void phaseDelete.run(undefined, "Adımlar aşamasız kalacak.") },
                ...data.phases
                  .filter((p) => p.id !== phaseDelete.phase.id)
                  .map((p) => ({ label: `"${p.name}" aşamasına taşı`, icon: "arrow-forward" as const, onPress: () => void phaseDelete.run({ move_to: String(p.id) }, `Adımlar "${p.name}" aşamasına taşınacak.`) })),
                { label: "Adımları da sil", icon: "trash-outline" as const, danger: true, onPress: () => void phaseDelete.run({ delete_steps: "1" }, "Adımlar da silinecek.") },
              ]
            : []
        }
      />
      <PhaseSheet phase={phaseEdit} onClose={() => setPhaseEdit(null)} onDelete={(p) => removePhase(p)} />
      <ImportStepsSheet visible={importing} onClose={() => setImporting(false)} />
    </View>
  );
}

/* ------------------------------- adım satırı ------------------------------- */

function StepRow({ step, questionCount, today, onMenu, onStatus }: { step: Step; questionCount: number; today: string; onMenu: () => void; onStatus: () => void }) {
  const { canEdit, ops, nav, personName, settings, nav: { openTool } } = useProject();
  const meta = STEP_STATUS_META[step.status] || STEP_STATUS_META.todo;
  const overdue = isStepOverdue(step, today);
  const tool = step.tool ? TOOL_META[step.tool] : null;
  const done = step.status === "done";
  const checklistDone = step.checklist.filter((c) => c.done).length;
  const pr = PRIORITY_META[step.priority];
  const roleWho = (name: string) => {
    const r = settings.roles.find((x) => x.name === name);
    const who = r?.user_id ? personName(r.user_id) : r?.person;
    return who ? `${name} · ${who.split(" ")[0]}` : name;
  };

  return (
    <View style={[styles.step, step.status === "skipped" ? styles.dim : null]}>
      <Touchable
        feedback="icon"
        haptic="light"
        disabled={!canEdit}
        onPress={() => void ops.saveStep(step.id, { status: done ? "todo" : "done" })}
        style={[styles.check, { borderColor: meta.color, backgroundColor: done ? meta.color : "transparent" }]}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: done }}
        accessibilityLabel={done ? `${step.title}: tamamlanmadı olarak işaretle` : `${step.title}: tamamlandı olarak işaretle`}
        hitSlop={8}
      >
        <Ionicons name={done ? "checkmark" : meta.icon} size={done ? 16 : 14} color={done ? colors.onDark : meta.color} />
      </Touchable>
      <Touchable onPress={() => nav.openStep(step.id)} onLongPress={onMenu} style={styles.stepMain} accessibilityRole="button" accessibilityLabel={step.title}>
        <Text style={[styles.stepTitle, done ? styles.strike : null]} numberOfLines={3} {...textScale.dense}>{step.title}</Text>
        <View style={styles.metaRow}>
          {step.responsible.map((r) => (
            <Badge key={r} label={roleWho(r)} tone="neutral" size="xs" />
          ))}
          {step.due_date ? <Badge label={dueLabel(step.due_date)} tone={overdue ? "danger" : "neutral"} icon="calendar-outline" size="xs" /> : null}
          {step.checklist.length ? <Badge label={`${checklistDone}/${step.checklist.length}`} tone={checklistDone === step.checklist.length ? "win" : "neutral"} icon="checkbox-outline" size="xs" /> : null}
          {questionCount ? <Badge label={String(questionCount)} tone="warn" icon="help-circle-outline" size="xs" /> : null}
          {step.links.length ? <Badge label={String(step.links.length)} tone="neutral" icon="link-outline" size="xs" /> : null}
          {step.result ? <Badge label="Sonuç" tone="win" icon="chatbox-outline" size="xs" /> : null}
          {pr && step.priority !== "normal" ? <Badge label={pr.label} tone={step.priority === "low" ? "neutral" : "danger"} icon="flag-outline" size="xs" /> : null}
        </View>
        <View style={styles.sideRow}>
          <Touchable onPress={onStatus} disabled={!canEdit} style={[styles.statusPill, { backgroundColor: withAlpha(meta.color, 0.14) }]} accessibilityRole="button" accessibilityLabel={`Durum: ${meta.label}`}>
            <Text style={[styles.statusText, { color: meta.color }]} {...textScale.badge}>{meta.label}</Text>
            {canEdit ? <Ionicons name="chevron-down" size={12} color={meta.color} /> : null}
          </Touchable>
          {tool ? (
            <Touchable onPress={() => openTool(step)} style={styles.toolBtn} accessibilityRole="button" accessibilityLabel={`Aracı aç: ${tool.label}`}>
              <Ionicons name={tool.icon} size={12} color={colors.brandAccent} />
              <Text style={styles.toolText} numberOfLines={1} {...textScale.badge}>{tool.label.split(" /")[0]}</Text>
            </Touchable>
          ) : null}
          <View style={styles.flex} />
          {step.assignee_id ? <Avatar name={personName(step.assignee_id)} size={22} /> : null}
        </View>
      </Touchable>
    </View>
  );
}

/* ------------------------------ satır içi ekleme ------------------------------ */

function InlineAdd({ phaseId, autoFocus, onDone }: { phaseId: number | null; autoFocus?: boolean; onDone?: () => void }) {
  const { ops } = useProject();
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    const t = title.trim();
    if (!t || busy) return;
    setBusy(true);
    const ok = await ops.addStep({ title: t, phase_id: phaseId });
    setBusy(false);
    if (ok) setTitle("");
  };
  return (
    <Input
      size="sm"
      value={title}
      onChangeText={setTitle}
      placeholder="Adım ekle…"
      leadingIcon="add"
      autoFocus={autoFocus}
      editable={!busy}
      returnKeyType="done"
      blurOnSubmit={false}
      onSubmitEditing={() => void submit()}
      onBlur={onDone}
      trailing={
        title.trim() ? (
          <Touchable feedback="icon" onPress={() => void submit()} accessibilityRole="button" accessibilityLabel="Adımı ekle" hitSlop={8}>
            <Ionicons name="arrow-up-circle" size={24} color={colors.brandAccent} />
          </Touchable>
        ) : null
      }
    />
  );
}

/* ------------------------------- aşama formu ------------------------------- */

function PhaseSheet({ phase, onClose, onDelete }: { phase: Phase | "new" | null; onClose: () => void; onDelete: (p: Phase) => void }) {
  const { data, ops, notify } = useProject();
  const editing = phase && phase !== "new" ? phase : null;
  return (
    <FormSheet
      visible={phase != null}
      onClose={onClose}
      title={editing ? "Aşamayı düzenle" : "Yeni aşama"}
      fields={[
        { key: "name", label: "Aşama adı", kind: "text", required: true },
        { key: "color", label: "Renk", kind: "color", palette: PROJECT_COLORS },
        { key: "note", label: "Not", kind: "multiline", hint: "isteğe bağlı" },
      ]}
      initial={editing ? { name: editing.name, color: editing.color, note: editing.note } : { color: PROJECT_COLORS[data.phases.length % PROJECT_COLORS.length] }}
      onSubmit={async (v) => {
        const body = { name: String(v.name || "").trim(), color: (v.color as string) || PROJECT_COLORS[0], note: String(v.note || "") };
        const item = editing ? await ops.savePhase(editing.id, body) : await ops.addPhase(body);
        if (!item) throw new Error("Aşama kaydedilemedi.");
        notify(editing ? "Aşama güncellendi." : "Aşama eklendi.");
      }}
      secondary={editing ? { label: "Sil", danger: true, onPress: () => { onClose(); setTimeout(() => onDelete(editing), 300); } } : undefined}
    />
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  flex: { flex: 1 },
  row2: { flexDirection: "row", gap: space.sm },
  tools: { flexDirection: "row", alignItems: "center", gap: space.s, flexWrap: "wrap" },
  filterInfo: { ...type.bodySm, color: colors.textSecondary },
  link: { color: colors.brandAccent },
  small: { ...type.bodySm, color: colors.textTertiary },
  hint: { ...type.caption, color: colors.textTertiary, textAlign: "center" },
  phase: {
    backgroundColor: colors.surface1,
    borderRadius: radius.xl,
    borderLeftWidth: 4,
    padding: space.md,
    gap: space.sm,
  },
  phaseHead: { flexDirection: "row", alignItems: "center", gap: space.sm },
  phaseToggle: { flex: 1, flexDirection: "row", alignItems: "center", gap: space.sm },
  phaseNum: { width: 26, height: 26, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  phaseNumText: { ...type.labelXs },
  phaseName: { ...type.label, color: colors.textPrimary },
  phaseStats: { flexDirection: "row", alignItems: "center", gap: space.s, marginTop: space.xxs },
  phaseNote: { ...type.bodySm, color: colors.textSecondary },
  more: { padding: space.xs },
  steps: { gap: space.s },
  step: {
    flexDirection: "row",
    gap: space.sm,
    paddingVertical: space.s,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
  },
  dim: { opacity: 0.55 },
  check: { width: 28, height: 28, borderRadius: radius.pill, borderWidth: 2, alignItems: "center", justifyContent: "center", marginTop: space.xxs },
  stepMain: { flex: 1, gap: space.xs },
  stepTitle: { ...type.body, color: colors.textPrimary },
  strike: { textDecorationLine: "line-through", color: colors.textTertiary },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
  sideRow: { flexDirection: "row", alignItems: "center", gap: space.s },
  statusPill: { flexDirection: "row", alignItems: "center", gap: space.xxs, paddingHorizontal: space.s, paddingVertical: space.xxs, borderRadius: radius.pill },
  statusText: { ...type.labelXs },
  toolBtn: { flexDirection: "row", alignItems: "center", gap: space.xxs, paddingHorizontal: space.s, paddingVertical: space.xxs, borderRadius: radius.pill, backgroundColor: colors.brandDim, maxWidth: 150 },
  toolText: { ...type.labelXs, color: colors.brandAccent },
});
