/**
 * Sorular: soru-cevap, ihtiyaçlar ve açık konular. Adıma ya da kişiye
 * bağlanır; cevap satır içinde girilir (girilince "Cevaplandı" olur),
 * kapatılır / yeniden açılır, onayla silinir. Süzgeç: durum, kategori, adım,
 * metin araması. Ana sayfadaki "Açık sorular"dan gelen soru (?soru=) vurgulu
 * ve en üstte gösterilir.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { ChipsField, DateField, SelectField, confirmAction } from "@/components/admin";
import { Badge, Button, Chip, ChipGroup, EmptyState, Input, SegmentedControl, Touchable, withAlpha } from "@/components/ui";
import { PRIORITIES, PRIORITY_META, QUESTION_STATUS_META, dueLabel, matches, timeAgo, todayIso } from "@/lib/admin/projectUtils";
import type { Priority, Question, QuestionStatus } from "@/lib/api/admin/projects";
import { colors, radius, space, textScale, type } from "@/theme";

import { useProject } from "./ProjectContext";
import { Pill } from "./ui";

export function QuestionForm({ defaults = {}, compact = false }: { defaults?: { step_id?: number | null; lead_id?: number | null }; compact?: boolean }) {
  const { data, ops, settings, notify } = useProject();
  const [open, setOpen] = useState(!compact);
  const [question, setQuestion] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [stepId, setStepId] = useState<number | null>(defaults.step_id ?? null);
  const [leadId, setLeadId] = useState<number | null>(defaults.lead_id ?? null);
  const [priority, setPriority] = useState<Priority>("normal");
  const [due, setDue] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [more, setMore] = useState(false);

  const submit = async () => {
    if (!question.trim()) return;
    setBusy(true);
    const item = await ops.addQuestion({
      question: question.trim(),
      category: category || null,
      priority,
      due_date: due || null,
      step_id: stepId,
      lead_id: leadId,
    });
    setBusy(false);
    if (item) {
      setQuestion("");
      setDue(null);
      notify("Soru eklendi.");
    }
  };

  if (!open) {
    return <Button label="Soru / ihtiyaç ekle" icon="add" variant="ghost" size="sm" onPress={() => setOpen(true)} />;
  }
  return (
    <View style={styles.form}>
      <Input value={question} onChangeText={setQuestion} placeholder="Soru, ihtiyaç ya da açık konu…" multiline numberOfLines={2} />
      <Touchable onPress={() => setMore((m) => !m)} style={styles.moreBtn} accessibilityRole="button">
        <Ionicons name={more ? "chevron-up" : "chevron-down"} size={14} color={colors.brandAccent} />
        <Text style={styles.moreText} {...textScale.dense}>Kategori, öncelik, tarih{!compact ? ", bağlantı" : ""}</Text>
      </Touchable>
      {more ? (
        <View style={styles.form}>
          {settings.question_categories.length ? (
            <ChipsField<string>
              label="Kategori"
              value={category}
              onChange={(v) => setCategory(typeof v === "string" ? v : null)}
              options={settings.question_categories.map((c) => ({ key: c, label: c }))}
            />
          ) : null}
          <ChipsField<Priority>
            label="Öncelik"
            value={priority}
            onChange={(v) => { if (typeof v === "string") setPriority(v); }}
            options={PRIORITIES.map((k) => ({ key: k, label: PRIORITY_META[k].label }))}
          />
          <DateField label="Son tarih" value={due} onChange={setDue} clearable />
          {!defaults.step_id && !compact ? (
            <SelectField<number> label="Adım" value={stepId} onChange={setStepId} placeholder="Adıma bağlı değil" clearable options={data.steps.map((s) => ({ value: s.id, label: s.title }))} />
          ) : null}
          {!defaults.lead_id && !compact ? (
            <SelectField<number> label="Kişi" value={leadId} onChange={setLeadId} placeholder="Kişiye bağlı değil" clearable options={data.leads.map((l) => ({ value: l.id, label: l.name }))} />
          ) : null}
        </View>
      ) : null}
      <View style={styles.formBar}>
        {compact ? <Button label="Vazgeç" variant="ghost" size="sm" onPress={() => setOpen(false)} /> : null}
        <Button label="Ekle" size="sm" onPress={() => void submit()} loading={busy} disabled={!question.trim()} />
      </View>
    </View>
  );
}

export function QuestionItem({ q, compact = false, highlight = false }: { q: Question; compact?: boolean; highlight?: boolean }) {
  const { data, ops, canEdit, nav, personName } = useProject();
  const [answer, setAnswer] = useState(q.answer || "");
  const [editing, setEditing] = useState(!q.answer && q.status === "open" && !compact && canEdit);
  useEffect(() => setAnswer(q.answer || ""), [q.answer]);
  const st = QUESTION_STATUS_META[q.status] || QUESTION_STATUS_META.open;
  const step = q.step_id ? data.steps.find((s) => s.id === q.step_id) : null;
  const lead = q.lead_id ? data.leads.find((l) => l.id === q.lead_id) : null;
  const overdue = q.status === "open" && q.due_date && q.due_date < todayIso();

  const saveAnswer = async () => {
    if ((answer || "") === (q.answer || "")) { setEditing(false); return; }
    const item = await ops.saveQuestion(q.id, { answer });
    if (item) setEditing(false);
  };
  const remove = async () => {
    const ok = await confirmAction({ title: "Soru silinsin mi?", message: q.question, confirmLabel: "Sil", destructive: true });
    if (ok) await ops.removeQuestion(q.id);
  };

  return (
    <View style={[styles.item, highlight ? { borderColor: st.color, backgroundColor: withAlpha(st.color, 0.06) } : null]}>
      <View style={styles.head}>
        <Pill label={st.label} color={st.color} />
        {q.category ? <Badge label={q.category} tone="neutral" size="xs" /> : null}
        {q.priority !== "normal" ? <Badge label={PRIORITY_META[q.priority]?.label} tone={q.priority === "low" ? "neutral" : "danger"} icon="flag-outline" size="xs" /> : null}
        {q.due_date ? <Badge label={dueLabel(q.due_date)} tone={overdue ? "danger" : "neutral"} icon="calendar-outline" size="xs" /> : null}
      </View>
      <Text style={styles.text} {...textScale.long}>{q.question}</Text>
      {!compact && (step || lead) ? (
        <ChipGroup contentPadding={0}>
          {step ? <Chip label={step.title} icon="git-branch-outline" size="sm" onPress={() => nav.openStep(step.id)} /> : null}
          {lead ? <Chip label={lead.name} icon="person-outline" size="sm" onPress={() => nav.openLead(lead.id)} /> : null}
        </ChipGroup>
      ) : null}
      {editing && canEdit ? (
        <View style={styles.form}>
          <Input value={answer} onChangeText={setAnswer} placeholder="Cevap…" multiline numberOfLines={2} />
          <View style={styles.formBar}>
            {q.answer ? <Button label="Vazgeç" variant="ghost" size="sm" onPress={() => { setAnswer(q.answer); setEditing(false); }} /> : null}
            <Button label="Cevabı kaydet" size="sm" onPress={() => void saveAnswer()} disabled={!answer.trim() && !q.answer} />
          </View>
        </View>
      ) : q.answer ? (
        <Touchable onPress={canEdit ? () => setEditing(true) : undefined} disabled={!canEdit} style={styles.answer} accessibilityLabel="Cevap">
          <Ionicons name="return-down-forward" size={16} color={colors.win} />
          <View style={styles.flex}>
            <Text style={styles.answerText} {...textScale.long}>{q.answer}</Text>
            <Text style={styles.small} {...textScale.dense}>
              {q.answered_by ? personName(q.answered_by) : ""}
              {q.answered_at ? ` · ${timeAgo(q.answered_at)}` : ""}
            </Text>
          </View>
          {canEdit ? <Ionicons name="create-outline" size={16} color={colors.textTertiary} /> : null}
        </Touchable>
      ) : null}
      {canEdit ? (
        <View style={styles.tools}>
          {!editing && !q.answer && q.status !== "closed" ? <Button label="Cevapla" icon="return-down-forward" variant="ghost" size="sm" onPress={() => setEditing(true)} /> : null}
          <View style={styles.flex} />
          {q.status !== "closed" ? (
            <Button label="Kapat" icon="lock-closed-outline" variant="ghost" size="sm" onPress={() => void ops.saveQuestion(q.id, { status: "closed" })} />
          ) : (
            <Button label="Yeniden aç" icon="lock-open-outline" variant="ghost" size="sm" onPress={() => void ops.saveQuestion(q.id, { status: "open" })} />
          )}
          <Touchable feedback="icon" onPress={() => void remove()} accessibilityRole="button" accessibilityLabel="Soruyu sil" hitSlop={8}>
            <Ionicons name="trash-outline" size={18} color={colors.danger} />
          </Touchable>
        </View>
      ) : null}
    </View>
  );
}

const STATUS_TABS: { key: "open" | "answered" | "closed" | "all"; label: string }[] = [
  { key: "open", label: "Açık" },
  { key: "answered", label: "Cevaplandı" },
  { key: "closed", label: "Kapandı" },
  { key: "all", label: "Tümü" },
];

export function Questions({ stepId = null }: { stepId?: number | null }) {
  const { data, canEdit, settings, nav } = useProject();
  const highlight = nav.params.soru ?? null;
  const [status, setStatus] = useState<"open" | "answered" | "closed" | "all">(highlight ? "all" : "open");
  const [category, setCategory] = useState("");
  const [step, setStep] = useState<number | null>(stepId);
  const [q, setQ] = useState("");
  useEffect(() => { if (highlight) setStatus("all"); }, [highlight, nav.version]);
  useEffect(() => setStep(stepId), [stepId]);

  const counts = useMemo(() => {
    const out: Record<string, number> = {};
    (Object.keys(QUESTION_STATUS_META) as QuestionStatus[]).forEach((k) => { out[k] = data.questions.filter((x) => x.status === k).length; });
    return out;
  }, [data.questions]);
  const cats = [...new Set([...settings.question_categories, ...data.questions.map((x) => x.category)].filter((x): x is string => Boolean(x)))];
  const stepsWithQ = data.steps.filter((s) => data.questions.some((x) => x.step_id === s.id));
  const shown = data.questions
    .filter((x) => (status === "all" || x.status === status) && (!category || x.category === category) && (!step || x.step_id === step) && matches(q, x.question, x.answer))
    .sort((a, b) => Number(b.id === highlight) - Number(a.id === highlight));

  return (
    <View style={styles.wrap}>
      <SegmentedControl
        items={STATUS_TABS.map((t) => ({ key: t.key, label: t.key !== "all" && counts[t.key] ? `${t.label} ${counts[t.key]}` : t.label }))}
        value={status}
        onChange={setStatus}
        size="sm"
      />
      <Input variant="search" value={q} onChangeText={setQ} placeholder="Soru ya da cevapta ara…" />
      {cats.length ? (
        <ChipGroup contentPadding={0}>
          <Chip label="Tüm kategoriler" size="sm" selected={!category} onPress={() => setCategory("")} />
          {cats.map((c) => <Chip key={c} label={c} size="sm" selected={category === c} onPress={() => setCategory(category === c ? "" : c)} />)}
        </ChipGroup>
      ) : null}
      {!stepId && stepsWithQ.length ? (
        <SelectField<number> value={step} onChange={setStep} placeholder="Tüm adımlar" clearable icon="git-branch-outline" sheetTitle="Adım" options={stepsWithQ.map((s) => ({ value: s.id, label: s.title }))} />
      ) : null}
      {canEdit ? (
        <View style={styles.card}>
          <QuestionForm defaults={stepId ? { step_id: stepId } : {}} />
        </View>
      ) : null}
      {!shown.length ? (
        <EmptyState
          variant="inline"
          icon="help-circle-outline"
          title={data.questions.length ? "Bu süzgeçte soru yok" : "Henüz soru yok"}
          body="Müşteri soruları, ihtiyaçlar ve karar bekleyen konuları yazın; cevapları buraya işleyin."
        />
      ) : (
        shown.map((x) => <QuestionItem key={x.id} q={x} highlight={highlight === x.id} />)
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  flex: { flex: 1 },
  card: { padding: space.md, borderRadius: radius.xl, backgroundColor: colors.surface1 },
  form: { gap: space.sm },
  formBar: { flexDirection: "row", justifyContent: "flex-end", gap: space.sm },
  moreBtn: { flexDirection: "row", alignItems: "center", gap: space.xs },
  moreText: { ...type.labelSm, color: colors.brandAccent },
  item: { gap: space.sm, padding: space.md, borderRadius: radius.xl, backgroundColor: colors.surface1, borderWidth: 1, borderColor: "transparent" },
  head: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.xs },
  text: { ...type.body, color: colors.textPrimary },
  answer: { flexDirection: "row", gap: space.sm, padding: space.sm, borderRadius: radius.md, backgroundColor: colors.winDim },
  answerText: { ...type.bodySm, color: colors.textPrimary },
  small: { ...type.caption, color: colors.textTertiary, marginTop: space.xxs },
  tools: { flexDirection: "row", alignItems: "center", gap: space.s },
});
