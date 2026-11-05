/**
 * Adım ayrıntısı (alt sayfa): her alan düzenlenir (alan bırakılınca / seçim
 * yapılınca kaydedilir), durum, sorumlular, kontrol listesi, bağlantılar,
 * adımın aracı ("Aracı aç"), adıma bağlı sorular ve geçmiş / notlar.
 * "Yapılacaklara gönder" adımı kişisel görev olarak açar.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import React, { useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { ChipsField, DateField, SelectField, confirmAction } from "@/components/admin";
import { BottomSheet, Button, Chip, ChipGroup, Input, Touchable, withAlpha } from "@/components/ui";
import { createTodo } from "@/lib/api/todos";
import { errorText } from "@/lib/admin/errors";
import { formatDateTime } from "@/lib/admin/format";
import {
  ALERT_COLOR,
  NEUTRAL_COLOR,
  PRIORITIES,
  PRIORITY_META,
  STEP_STATUSES,
  STEP_STATUS_META,
  TOOL_KEYS,
  TOOL_META,
  isInternalLink,
  isStepOverdue,
  kindOf,
  normalizeLink,
  stageOf,
  stagesOf,
  validLink,
} from "@/lib/admin/projectUtils";
import { WEB_BASE_URL } from "@/lib/config";
import type { ChecklistItem, Priority, ProjectTool, Step, StepLink } from "@/lib/api/admin/projects";
import { colors, radius, space, textScale, type } from "@/theme";

import { NoteForm, Timeline } from "./Activity";
import { useProject } from "./ProjectContext";
import { QuestionForm, QuestionItem } from "./Questions";
import { Pill, SaveOnBlurInput, SubHead, openUrl } from "./ui";

const uid = () => `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function StepSheet({ step, onClose }: { step: Step | null; onClose: () => void }) {
  // Kapanış animasyonu sürerken içerik boşalmasın: son adım tutulur.
  const last = useRef<Step | null>(step);
  if (step) last.current = step;
  const shown = step ?? last.current;
  return (
    <BottomSheet visible={step != null} onClose={onClose} title="Adım ayrıntısı" snap="full">
      {shown ? <StepBody key={shown.id} step={shown} onClose={onClose} /> : <View />}
    </BottomSheet>
  );
}

function StepBody({ step, onClose }: { step: Step; onClose: () => void }) {
  const router = useRouter();
  const { data, ops, canEdit, settings, personName, directory, nav, notify } = useProject();
  const [sending, setSending] = useState(false);
  const save = (body: Partial<Step>) => ops.saveStep(step.id, body);
  const phase = data.phases.find((p) => p.id === step.phase_id);
  const tool = step.tool ? TOOL_META[step.tool] : null;
  const meta = STEP_STATUS_META[step.status] || STEP_STATUS_META.todo;
  const overdue = isStepOverdue(step);
  const questions = data.questions.filter((q) => q.step_id === step.id);
  const history = data.activities.filter((a) => a.step_id === step.id);
  const roleNames = useMemo(() => [...new Set([...settings.roles.map((r) => r.name), ...data.steps.flatMap((s) => s.responsible)])], [settings.roles, data.steps]);
  const personOf = (name: string) => {
    const r = settings.roles.find((x) => x.name === name);
    return r?.user_id ? personName(r.user_id) : r?.person || "";
  };
  const team = useMemo(() => new Set([data.item.owner_id, ...data.members.map((m) => m.user_id)]), [data.item.owner_id, data.members]);
  const assignOptions = useMemo(() => {
    const list = [...directory].sort((a, b) => Number(team.has(b.id)) - Number(team.has(a.id)));
    const opts = list.map((u) => ({ value: u.id, label: `${u.name}${u.me ? " (ben)" : ""}`, hint: team.has(u.id) ? "Proje ekibi" : "Diğer yönetim kullanıcısı" }));
    if (step.assignee_id && !directory.some((u) => u.id === step.assignee_id)) opts.push({ value: step.assignee_id, label: personName(step.assignee_id), hint: "Proje ekibi" });
    return opts;
  }, [directory, team, step.assignee_id, personName]);

  const sendTodo = async () => {
    setSending(true);
    try {
      const link = `${WEB_BASE_URL}/yonetim/araclar/projeler?proje=${data.item.id}&sekme=surec&adim=${step.id}`;
      const open = step.checklist.filter((c) => !c.done).map((c) => `- ${c.text}`);
      await createTodo({
        kind: "task",
        title: step.title,
        body: [`Proje: ${data.item.name}${phase ? ` · ${phase.name}` : ""}`, step.description, open.length ? open.join("\n") : null, link].filter(Boolean).join("\n\n"),
        priority: step.priority === "high" || step.priority === "urgent" ? "high" : "normal",
        due_at: step.due_date ? new Date(`${step.due_date}T18:00:00`).toISOString() : null,
      });
      notify("Yapılacaklar listenize eklendi.", "success", { label: "Aç", onPress: () => router.push("/yonetim/gorevler" as never) });
    } catch (err) {
      notify(errorText(err, "Yapılacaklara eklenemedi."), "danger");
    } finally {
      setSending(false);
    }
  };

  const remove = async () => {
    const ok = await confirmAction({ title: "Adım silinsin mi?", message: `"${step.title}" silinecek. Bağlı sorular ve notlar projede kalır.`, confirmLabel: "Sil", destructive: true });
    if (!ok) return;
    onClose();
    if (await ops.removeStep(step.id)) notify("Adım silindi.");
  };

  const toolStage = (step.tool === "leads" || step.tool === "suppliers") && step.tool_ref ? stageOf(settings, step.tool_ref, step.tool === "suppliers" ? "supplier" : "customer") : null;
  const toolHint =
    step.tool === "leads"
      ? `${toolStage ? `"${toolStage.label}" aşamasındaki` : "Projedeki"} kişiler bu adımın içinden yönetilir · ${data.leads.filter((l) => kindOf(l) === "customer" && (!step.tool_ref || l.stage === step.tool_ref)).length} kişi`
      : step.tool === "suppliers"
        ? `Tedarikçilerden fiyat alın, karşılaştırın; anlaşınca gidere yazılır · ${data.leads.filter((l) => kindOf(l) === "supplier" && (!step.tool_ref || l.stage === step.tool_ref)).length} tedarikçi`
        : step.tool === "finance"
          ? "Bu adımın gelir / gider kalemleri; ödenince muhasebe hesabına işlenir."
          : tool?.internal
            ? "Bu adımın içinden açılır."
            : tool?.route
              ? "Araçlar bölümünde açılır."
              : "Bu aracın mobil karşılığı yok; web panelinde açın.";

  return (
    <View style={styles.body}>
      <View style={styles.crumb}>
        <Pill label={phase?.name || "Aşamasız"} color={phase?.color || NEUTRAL_COLOR} />
        <Pill label={meta.label} color={meta.color} icon={meta.icon} />
        {overdue ? <Pill label="Gecikti" color={ALERT_COLOR} icon="warning-outline" /> : null}
      </View>
      <SaveOnBlurInput label="Adım adı" value={step.title} editable={canEdit} multiline onSave={(v) => { if (v.trim()) void save({ title: v.trim() }); }} />

      <ChipGroup contentPadding={0} scrollable={false}>
        {STEP_STATUSES.map((k) => (
          <Chip
            key={k}
            label={STEP_STATUS_META[k].label}
            icon={STEP_STATUS_META[k].icon}
            size="sm"
            selected={step.status === k}
            disabled={!canEdit}
            onPress={() => { if (step.status !== k) void save({ status: k }); }}
          />
        ))}
      </ChipGroup>

      {tool ? (
        <View style={[styles.toolCard, { backgroundColor: withAlpha(data.item.color || NEUTRAL_COLOR, 0.08) }]}>
          <Ionicons name={tool.icon} size={22} color={colors.brandAccent} />
          <View style={styles.flex}>
            <Text style={styles.toolTitle} {...textScale.dense}>{tool.label}</Text>
            <Text style={styles.small} {...textScale.dense}>{toolHint}</Text>
          </View>
          {tool.internal || tool.route ? <Button label="Aracı aç" size="sm" onPress={() => { onClose(); nav.openTool(step); }} /> : null}
        </View>
      ) : null}

      <SelectField<number>
        label="Aşama"
        value={step.phase_id}
        disabled={!canEdit}
        placeholder="Aşamasız"
        clearable
        options={[...data.phases].sort((a, b) => a.position - b.position).map((p) => ({ value: p.id, label: p.name }))}
        onChange={(v) => void save({ phase_id: v ?? null })}
      />
      <ChipsField<Priority>
        label="Öncelik"
        value={step.priority}
        onChange={(v) => { if (canEdit && typeof v === "string" && v !== step.priority) void save({ priority: v }); }}
        options={PRIORITIES.map((k) => ({ key: k, label: PRIORITY_META[k].label }))}
      />
      <SelectField<number>
        label="Atanan kişi"
        value={step.assignee_id}
        disabled={!canEdit}
        placeholder="Atanmadı"
        clearable
        valueLabel={step.assignee_id ? personName(step.assignee_id) : null}
        options={assignOptions}
        onChange={(v) => void save({ assignee_id: v ?? null })}
      />
      <View style={styles.row2}>
        <View style={styles.flex}>
          <DateField label="Başlangıç" value={step.start_date} clearable onChange={(v) => { if (canEdit) void save({ start_date: v }); }} />
        </View>
        <View style={styles.flex}>
          <DateField label="Son tarih" value={step.due_date} clearable error={overdue ? "Gecikti" : undefined} onChange={(v) => { if (canEdit) void save({ due_date: v }); }} />
        </View>
      </View>
      <SelectField<string>
        label="Araç"
        value={step.tool}
        disabled={!canEdit}
        placeholder="Araç yok"
        clearable
        options={TOOL_KEYS.map((k) => ({ value: k, label: TOOL_META[k].label, icon: TOOL_META[k].icon, hint: TOOL_META[k].internal ? "Proje içi" : "Araçlar" }))}
        onChange={(v) => void save({ tool: (v as ProjectTool) || null, tool_ref: null })}
      />
      {step.tool === "leads" || step.tool === "suppliers" ? (
        <SelectField<string>
          label={step.tool === "suppliers" ? "Tedarik aşaması" : "Kişi aşaması"}
          hint="araç bu aşamaya süzülü açılır"
          value={step.tool_ref}
          disabled={!canEdit}
          placeholder="Tüm aşamalar"
          clearable
          options={stagesOf(settings, step.tool === "suppliers" ? "supplier" : "customer").map((s) => ({ value: s.key, label: s.label }))}
          onChange={(v) => void save({ tool_ref: v || null })}
        />
      ) : null}

      <SubHead icon="people-outline" title="Sorumlular" />
      <Responsible value={step.responsible} roles={roleNames} personOf={personOf} disabled={!canEdit} onChange={(responsible) => void save({ responsible })} />

      <SaveOnBlurInput label="Açıklama / yapılacaklar" value={step.description} editable={canEdit} multiline numberOfLines={3} placeholder="Bu adımda ne yapılacak, ihtiyaçlar…" onSave={(v) => void save({ description: v })} />
      <SaveOnBlurInput label="Sonuç / cevap" hint="alınan karar, cevap, çıktı" value={step.result} editable={canEdit} multiline numberOfLines={3} placeholder="Ör. 3 tesis karşılaştırıldı, X seçildi." onSave={(v) => void save({ result: v })} />

      <SubHead icon="checkbox-outline" title="Kontrol listesi" count={step.checklist.length || undefined} />
      <Checklist items={step.checklist} disabled={!canEdit} onChange={(checklist) => void save({ checklist })} />

      <SubHead icon="link-outline" title="Bağlantılar" count={step.links.length || undefined} />
      <Links items={step.links} disabled={!canEdit} onChange={(links) => void save({ links })} />

      <SubHead icon="help-circle-outline" title="Sorular ve ihtiyaçlar" count={questions.length} />
      {canEdit ? <QuestionForm compact defaults={{ step_id: step.id }} /> : null}
      {questions.map((q) => <QuestionItem key={q.id} q={q} compact />)}
      {!questions.length ? <Text style={styles.small} {...textScale.dense}>Bu adıma bağlı soru yok.</Text> : null}

      <SubHead icon="time-outline" title="Geçmiş ve notlar" count={history.length} />
      {canEdit ? <NoteForm defaults={{ step_id: step.id }} /> : null}
      <Timeline items={history} empty="Bu adımda henüz not ya da değişiklik yok." />

      <Text style={styles.small} {...textScale.dense}>{step.updated_at ? `Son değişiklik ${formatDateTime(step.updated_at)}` : ""}</Text>
      <View style={styles.footer}>
        {canEdit ? <Button label="Sil" icon="trash-outline" variant="danger" size="sm" onPress={() => void remove()} /> : null}
        <View style={styles.flex} />
        <Button label={sending ? "Gönderiliyor…" : "Yapılacaklara gönder"} icon="checkbox-outline" variant="secondary" size="sm" loading={sending} onPress={() => void sendTodo()} />
      </View>
    </View>
  );
}

/* ------------------------------- sorumlular ------------------------------- */

function Responsible({ value, roles, onChange, disabled, personOf }: { value: string[]; roles: string[]; onChange: (v: string[]) => void; disabled?: boolean; personOf: (name: string) => string }) {
  const [draft, setDraft] = useState("");
  const add = (name: string | null) => {
    const v = String(name || "").trim().toLocaleUpperCase("tr-TR");
    if (!v || value.includes(v)) return;
    onChange([...value, v]);
    setDraft("");
  };
  const free = roles.filter((r) => !value.includes(r));
  return (
    <View style={styles.gap}>
      {value.length ? (
        <ChipGroup contentPadding={0} scrollable={false}>
          {value.map((r) => (
            <Chip key={r} label={personOf(r) ? `${r} · ${personOf(r)}` : r} size="sm" onDismiss={disabled ? undefined : () => onChange(value.filter((x) => x !== r))} />
          ))}
        </ChipGroup>
      ) : (
        <Text style={styles.small} {...textScale.dense}>Sorumlu yok</Text>
      )}
      {!disabled ? (
        <>
          {free.length ? (
            <SelectField<string>
              value={null}
              placeholder="Rol ekle"
              icon="add"
              sheetTitle="Rol ekle"
              options={free.map((r) => ({ value: r, label: r, hint: personOf(r) || null }))}
              onChange={(v) => add(v)}
            />
          ) : null}
          <Input
            size="sm"
            value={draft}
            onChangeText={setDraft}
            placeholder="Başka sorumlu yazın…"
            autoCapitalize="characters"
            returnKeyType="done"
            onSubmitEditing={() => add(draft)}
            trailing={draft.trim() ? <Button label="Ekle" size="sm" variant="ghost" onPress={() => add(draft)} /> : null}
          />
        </>
      ) : null}
    </View>
  );
}

/* ----------------------------- kontrol listesi ----------------------------- */

function Checklist({ items, onChange, disabled }: { items: ChecklistItem[]; onChange: (v: ChecklistItem[]) => void; disabled?: boolean }) {
  const [draft, setDraft] = useState("");
  const done = items.filter((c) => c.done).length;
  const add = () => {
    const t = draft.trim();
    if (!t) return;
    onChange([...items, { id: uid(), text: t, done: false }]);
    setDraft("");
  };
  return (
    <View style={styles.gap}>
      {items.length ? <Text style={styles.small} {...textScale.dense}>{done}/{items.length} tamam</Text> : null}
      {items.map((c) => (
        <View key={c.id} style={styles.checkRow}>
          <Touchable
            feedback="icon"
            haptic="selection"
            disabled={disabled}
            onPress={() => onChange(items.map((x) => (x.id === c.id ? { ...x, done: !x.done } : x)))}
            style={styles.checkHit}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: c.done }}
            accessibilityLabel={c.text}
          >
            <Ionicons name={c.done ? "checkbox" : "square-outline"} size={22} color={c.done ? colors.win : colors.textTertiary} />
            <Text style={[styles.checkText, c.done ? styles.strike : null]} {...textScale.long}>{c.text}</Text>
          </Touchable>
          {!disabled ? (
            <Touchable feedback="icon" onPress={() => onChange(items.filter((x) => x.id !== c.id))} accessibilityRole="button" accessibilityLabel={`${c.text} maddesini sil`} hitSlop={8}>
              <Ionicons name="close" size={18} color={colors.textTertiary} />
            </Touchable>
          ) : null}
        </View>
      ))}
      {!disabled ? (
        <Input size="sm" value={draft} onChangeText={setDraft} placeholder="Madde ekle…" leadingIcon="add" returnKeyType="done" blurOnSubmit={false} onSubmitEditing={add} />
      ) : null}
    </View>
  );
}

/* -------------------------------- bağlantılar -------------------------------- */

function Links({ items, onChange, disabled }: { items: StepLink[]; onChange: (v: StepLink[]) => void; disabled?: boolean }) {
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const add = () => {
    const u = normalizeLink(url);
    if (!validLink(u)) {
      setError("Bağlantı http(s)://, / (site içi), mailto: ya da tel: ile başlamalı.");
      return;
    }
    onChange([...items, { label: label.trim() || u, url: u }]);
    setLabel("");
    setUrl("");
    setError(null);
  };
  const open = (u: string) => void openUrl(isInternalLink(u) ? `${WEB_BASE_URL}${u}` : u);
  return (
    <View style={styles.gap}>
      {items.map((l, i) => (
        <View key={`${l.url}-${i}`} style={styles.linkRow}>
          <Touchable onPress={() => open(l.url)} style={styles.linkMain} accessibilityRole="link" accessibilityLabel={l.label}>
            <Ionicons name={/^mailto:/i.test(l.url) ? "mail-outline" : /^tel:/i.test(l.url) ? "call-outline" : "open-outline"} size={16} color={colors.brandAccent} />
            <View style={styles.flex}>
              <Text style={styles.linkLabel} numberOfLines={1} {...textScale.dense}>{l.label}</Text>
              <Text style={styles.tiny} numberOfLines={1} {...textScale.badge}>{l.url}</Text>
            </View>
          </Touchable>
          {!disabled ? (
            <Touchable feedback="icon" onPress={() => onChange(items.filter((_, j) => j !== i))} accessibilityRole="button" accessibilityLabel={`${l.label} bağlantısını kaldır`} hitSlop={8}>
              <Ionicons name="close" size={18} color={colors.textTertiary} />
            </Touchable>
          ) : null}
        </View>
      ))}
      {!items.length && disabled ? <Text style={styles.small} {...textScale.dense}>Bağlantı yok.</Text> : null}
      {!disabled ? (
        <>
          <Input size="sm" value={label} onChangeText={setLabel} placeholder="Ad (ör. Tesis haritası)" />
          <Input
            size="sm"
            value={url}
            onChangeText={(v) => { setUrl(v); setError(null); }}
            placeholder="https://… ya da /yonetim/…"
            autoCapitalize="none"
            keyboardType="url"
            error={error || undefined}
            trailing={url.trim() ? <Button label="Ekle" size="sm" variant="ghost" onPress={add} /> : null}
          />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  body: { gap: space.md, paddingBottom: space.xl },
  gap: { gap: space.sm },
  flex: { flex: 1 },
  row2: { flexDirection: "row", gap: space.sm },
  crumb: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
  small: { ...type.bodySm, color: colors.textTertiary },
  tiny: { ...type.meta, color: colors.textTertiary },
  toolCard: { flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md, borderRadius: radius.lg },
  toolTitle: { ...type.label, color: colors.textPrimary },
  checkRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  checkHit: { flex: 1, flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.xxs },
  checkText: { ...type.body, color: colors.textPrimary, flex: 1 },
  strike: { textDecorationLine: "line-through", color: colors.textTertiary },
  linkRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  linkMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.xs },
  linkLabel: { ...type.label, color: colors.brandAccent },
  footer: { flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: space.md },
});
