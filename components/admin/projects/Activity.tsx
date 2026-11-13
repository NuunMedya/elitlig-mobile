/**
 * İletişim: projenin tüm iletişim geçmişi (aramalar, WhatsApp, e-posta,
 * toplantı, notlar ve sistemin yazdığı durum değişiklikleri). Gün başlıklı
 * zaman çizelgesi; tür / kişi / adım süzgeci, sistem kayıtlarını gizleme,
 * hızlı not ekleme ve (sahip ya da kaydı yazan için) onaylı silme.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { SelectField, ToggleField, confirmAction } from "@/components/admin";
import { Button, Chip, ChipGroup, EmptyState, Input, Touchable, withAlpha } from "@/components/ui";
import { ACTIVITY_META, CONTACT_TYPES, kindOf, outcomeOf, relativeDayLabel, timeAgo, whenLabel } from "@/lib/admin/projectUtils";
import type { Activity as ActivityRow, ActivityType } from "@/lib/api/admin/projects";
import { colors, hairline, radius, space, textScale, type } from "@/theme";
import { MiniStat } from "@/components/admin/matches/opsKit";

import { useProject } from "./ProjectContext";
import { useChunk } from "./ui";

export function NoteForm({ defaults = {} }: { defaults?: Record<string, unknown> }) {
  const { ops, notify } = useProject();
  const [note, setNote] = useState("");
  const [kind, setKind] = useState<ActivityType>("note");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!note.trim()) return;
    setBusy(true);
    const res = await ops.logActivity({ ...defaults, type: kind, note: note.trim() });
    setBusy(false);
    if (res) {
      setNote("");
      notify("Kayıt eklendi.");
    }
  };
  return (
    <View style={styles.form}>
      <ChipGroup contentPadding={0}>
        {CONTACT_TYPES.map((k) => (
          <Chip key={k} label={ACTIVITY_META[k].short} icon={ACTIVITY_META[k].icon} size="sm" selected={kind === k} onPress={() => setKind(k)} />
        ))}
      </ChipGroup>
      <Input value={note} onChangeText={setNote} placeholder={kind === "note" ? "Not ekle…" : "Ne konuşuldu?"} multiline numberOfLines={2} />
      <View style={styles.formBar}>
        <Button label="Ekle" size="sm" onPress={() => void submit()} loading={busy} disabled={!note.trim()} />
      </View>
    </View>
  );
}

export function Timeline({ items, empty = "Kayıt yok.", showLead = true, showStep = false }: { items: ActivityRow[]; empty?: string; showLead?: boolean; showStep?: boolean }) {
  const { data, settings, personName, nav, canEdit, isOwner, ops, me } = useProject();
  const chunk = useChunk(items, 60);
  if (!items.length) {
    return <Text style={styles.muted} {...textScale.long}>{empty}</Text>;
  }
  let lastDay = "";
  const remove = async (a: ActivityRow) => {
    const ok = await confirmAction({ title: "Kayıt silinsin mi?", message: a.note || ACTIVITY_META[a.type]?.label, confirmLabel: "Sil", destructive: true });
    if (ok) await ops.removeActivity(a.id);
  };
  return (
    <View>
      {chunk.shown.map((a, index) => {
        const m = ACTIVITY_META[a.type] || ACTIVITY_META.note;
        const outcome = a.outcome ? outcomeOf(settings, a.outcome, kindOf(data.leads.find((x) => x.id === a.lead_id))) : null;
        const lead = showLead && a.lead_id ? data.leads.find((l) => l.id === a.lead_id) : null;
        const step = showStep && a.step_id ? data.steps.find((s) => s.id === a.step_id) : null;
        const dayKey = String(a.occurred_at || "").slice(0, 10);
        const header = dayKey !== lastDay ? relativeDayLabel(a.occurred_at) : null;
        lastDay = dayKey;
        const system = a.type === "status" || a.type === "system";
        const canRemove = canEdit && (isOwner || (!system && a.created_by === me));
        const next = chunk.shown[index + 1];
        const lastOfDay = !next || String(next.occurred_at || "").slice(0, 10) !== dayKey;
        return (
          <React.Fragment key={a.id}>
            {header ? (
              <View style={styles.dayRow}>
                <Text style={styles.day} {...textScale.dense}>
                  {header.toLocaleUpperCase("tr-TR")}
                </Text>
                <View style={styles.dayLine} />
              </View>
            ) : null}
            <View style={[styles.row, system ? styles.system : null]}>
              <View style={styles.rail}>
                <View style={[styles.icon, { backgroundColor: withAlpha(m.color, 0.16), borderColor: withAlpha(m.color, 0.4) }]}>
                  <Ionicons name={m.icon} size={14} color={m.color} />
                </View>
                {!lastOfDay ? <View style={styles.railLine} /> : null}
              </View>
              <View style={styles.flex}>
                <View style={styles.headRow}>
                  <Text style={styles.title} {...textScale.dense}>{m.short}</Text>
                  {outcome ? <Text style={styles.outcome} numberOfLines={1} {...textScale.dense}>{outcome.label}</Text> : null}
                  <View style={styles.flex} />
                  <Text style={styles.tiny} {...textScale.badge}>{timeAgo(a.occurred_at)}</Text>
                  {canRemove ? (
                    <Touchable feedback="icon" onPress={() => void remove(a)} accessibilityRole="button" accessibilityLabel="Kaydı sil" hitSlop={8}>
                      <Ionicons name="trash-outline" size={15} color={colors.textTertiary} />
                    </Touchable>
                  ) : null}
                </View>
                {lead || step ? (
                  <ChipGroup contentPadding={0}>
                    {lead ? <Chip label={lead.name} icon="person-outline" size="sm" onPress={() => nav.openLead(lead.id)} /> : null}
                    {step ? <Chip label={step.title} icon="git-branch-outline" size="sm" onPress={() => nav.openStep(step.id)} /> : null}
                  </ChipGroup>
                ) : null}
                {a.note ? <Text style={styles.note} {...textScale.long}>{a.note}</Text> : null}
                <Text style={styles.tiny} {...textScale.badge}>
                  {a.created_by ? personName(a.created_by) : "Sistem"}
                  {a.next_action_at ? ` · sonraki: ${whenLabel(a.next_action_at)}` : ""}
                </Text>
              </View>
            </View>
          </React.Fragment>
        );
      })}
      {chunk.more ? <Button label={`${chunk.more} kayıt daha göster`} variant="ghost" onPress={chunk.showMore} /> : null}
    </View>
  );
}

export function Activity({ stepId = null }: { stepId?: number | null }) {
  const { data, canEdit } = useProject();
  const [kind, setKind] = useState<string>("");
  const [lead, setLead] = useState<number | null>(null);
  const [step, setStep] = useState<number | null>(stepId);
  const [hideSystem, setHideSystem] = useState(false);
  const leadsWith = useMemo(() => data.leads.filter((l) => data.activities.some((a) => a.lead_id === l.id)), [data.leads, data.activities]);
  const stepsWith = useMemo(() => data.steps.filter((s) => data.activities.some((a) => a.step_id === s.id)), [data.steps, data.activities]);
  const scopeStep = stepId ?? step;
  const shown = data.activities.filter(
    (a) =>
      (!kind || (kind === "contact" ? CONTACT_TYPES.includes(a.type) && a.type !== "note" : a.type === kind)) &&
      (!lead || a.lead_id === lead) &&
      (!scopeStep || a.step_id === scopeStep) &&
      (!hideSystem || (a.type !== "status" && a.type !== "system"))
  );
  const calls = data.activities.filter((a) => a.type === "call").length;

  return (
    <View style={styles.wrap}>
      <View style={styles.stats}>
        <MiniStat label="Kayıt" value={data.activities.length} />
        <MiniStat label="Arama" value={calls} tone="info" />
        <MiniStat label="Temas" value={data.activities.filter((a) => CONTACT_TYPES.includes(a.type) && a.type !== "note").length} tone="brand" />
      </View>
      <ChipGroup contentPadding={0}>
        <Chip label="Tümü" size="sm" selected={!kind} onPress={() => setKind("")} />
        <Chip label="Yalnız temaslar" size="sm" selected={kind === "contact"} onPress={() => setKind(kind === "contact" ? "" : "contact")} />
        {(Object.keys(ACTIVITY_META) as ActivityType[]).map((k) => (
          <Chip key={k} label={ACTIVITY_META[k].short} icon={ACTIVITY_META[k].icon} size="sm" selected={kind === k} onPress={() => setKind(kind === k ? "" : k)} />
        ))}
      </ChipGroup>
      <View style={styles.row2}>
        <View style={styles.flex}>
          <SelectField<number> value={lead} onChange={setLead} placeholder="Tüm kişiler" clearable icon="person-outline" sheetTitle="Kişi" options={leadsWith.map((l) => ({ value: l.id, label: l.name }))} />
        </View>
        {!stepId ? (
          <View style={styles.flex}>
            <SelectField<number> value={step} onChange={setStep} placeholder="Tüm adımlar" clearable icon="git-branch-outline" sheetTitle="Adım" options={stepsWith.map((s) => ({ value: s.id, label: s.title }))} />
          </View>
        ) : null}
      </View>
      <ToggleField label="Sistem kayıtlarını gizle" value={hideSystem} onChange={setHideSystem} hint="Durum değişiklikleri ve otomatik kayıtlar" />
      {canEdit ? (
        <View style={styles.card}>
          <NoteForm defaults={{ ...(scopeStep ? { step_id: scopeStep } : {}), ...(lead ? { lead_id: lead } : {}) }} />
        </View>
      ) : null}
      {!shown.length ? (
        <EmptyState variant="inline" icon="time-outline" title="Kayıt yok" body="Kişilerle yapılan görüşmeler, notlar ve durum değişiklikleri burada birikir." />
      ) : (
        <View style={styles.card}>
          <Timeline items={shown} showStep />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  flex: { flex: 1 },
  row2: { flexDirection: "row", gap: space.sm },
  card: { padding: space.md, borderRadius: radius.xl, backgroundColor: colors.surface1, borderWidth: hairline, borderColor: colors.glassLine },
  stats: { flexDirection: "row", gap: space.sm },
  form: { gap: space.sm },
  formBar: { flexDirection: "row", justifyContent: "flex-end" },
  muted: { ...type.bodySm, color: colors.textTertiary },
  dayRow: { flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: space.sm, marginBottom: space.xs },
  day: { ...type.overline, color: colors.brandAccent },
  dayLine: { flex: 1, height: hairline, backgroundColor: colors.separator },
  row: { flexDirection: "row", gap: space.m },
  rail: { alignItems: "center", width: 30 },
  railLine: { flex: 1, width: 2, borderRadius: 1, backgroundColor: colors.separator, marginVertical: space.xxs },
  system: { opacity: 0.75 },
  icon: { width: 30, height: 30, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  headRow: { flexDirection: "row", alignItems: "center", gap: space.s },
  title: { ...type.label, color: colors.textPrimary },
  outcome: { ...type.labelSm, color: colors.brandAccent, flexShrink: 1 },
  note: { ...type.bodySm, color: colors.textPrimary, marginTop: space.xs, padding: space.sm, borderRadius: radius.md, backgroundColor: colors.surface2 },
  tiny: { ...type.meta, color: colors.textTertiary, marginTop: space.xxs, marginBottom: space.sm },
});
