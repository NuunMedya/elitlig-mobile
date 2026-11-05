/**
 * Kişi kartı (alt sayfa): tek dokunuşla Ara / WhatsApp / E-posta, aşama,
 * HIZLI SONUÇ düğmeleri (tek dokunuşla görüşme kaydı: aşama ve sonraki arama
 * kendiliğinden ayarlanır), sonraki aksiyon (tarih-saat + ne yapılacak,
 * Bugün / Yarın / +3 gün / +1 hafta, Ajandaya ekle), ayrıntılı görüşme
 * kaydı, bilgiler (alan bırakılınca kaydedilir), kişinin soruları ve görüşme
 * geçmişi.
 *   Müşteri görüşmesi: satışı kapat → portföy (+ gelir kaydı).
 *   Tedarik görüşmesi: fiyat al, aynı konudaki tekliflerle karşılaştır,
 *   işlemi tamamla → gidere yaz.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { ChipsField, DateField, SelectField, confirmAction } from "@/components/admin";
import { Avatar, BottomSheet, Button, Chip, ChipGroup, Input, Touchable, withAlpha } from "@/components/ui";
import { errorText } from "@/lib/admin/errors";
import { formatMoney } from "@/lib/admin/format";
import {
  ACTIVITY_META,
  ALERT_COLOR,
  CONTACT_TYPES,
  QUICK_TYPES,
  QUOTE_COLOR,
  SUPPLIER_COLOR,
  UNKNOWN_STAGE_COLOR,
  WIN_COLOR,
  asksPrice,
  daysFromNowAt10,
  isLeadOverdue,
  isoToLocal,
  kindOf,
  localToIso,
  outcomesOf,
  prettyPhone,
  stageOf,
  stagesOf,
  whenLabel,
} from "@/lib/admin/projectUtils";
import { createAgendaEvent, getLeadDetail, projectKeys, type ActivityType, type Lead, type LeadOutcome } from "@/lib/api/admin/projects";
import { colors, radius, space, textScale, type } from "@/theme";

import { Timeline } from "./Activity";
import { CloseSupplierSheet, LostSheet, PriceCompare, PriceSheet, WinSheet } from "./LeadDialogs";
import { useProject } from "./ProjectContext";
import { QuestionForm, QuestionItem } from "./Questions";
import { ContactBar, Pill, SaveOnBlurInput, SubHead } from "./ui";

export function LeadSheet({ lead, stepId, onClose }: { lead: Lead | null; stepId?: number | null; onClose: () => void }) {
  return (
    <BottomSheet visible={lead != null} onClose={onClose} title={lead ? (kindOf(lead) === "supplier" ? "Tedarik görüşmesi" : "Kişi kartı") : undefined} snap="full">
      {lead ? <LeadBody lead={lead} stepId={stepId ?? null} onClose={onClose} /> : <View />}
    </BottomSheet>
  );
}

function LeadBody({ lead, stepId, onClose }: { lead: Lead; stepId: number | null; onClose: () => void }) {
  const router = useRouter();
  const { id, data, ops, settings, canEdit, closed, notify, personName, directory, nav } = useProject();
  const detail = useQuery({ queryKey: projectKeys.lead(id, lead.id), queryFn: () => getLeadDetail(id, lead.id) });
  const [quickType, setQuickType] = useState<ActivityType>("call");
  const [quickNote, setQuickNote] = useState("");
  const [busy, setBusy] = useState("");
  const [full, setFull] = useState(false);
  const [form, setForm] = useState<{ type: ActivityType; outcome: string | null; note: string; next_at: string | null; next_action: string }>({ type: "call", outcome: null, note: "", next_at: null, next_action: "" });
  const [nextAt, setNextAt] = useState<string | null>(isoToLocal(lead.next_action_at));
  const [nextText, setNextText] = useState(lead.next_action || "");
  const [winning, setWinning] = useState<Lead | null>(null);
  const [losing, setLosing] = useState<Lead | null>(null);
  const [pricing, setPricing] = useState<LeadOutcome | null>(null);
  const kind = kindOf(lead);
  const supplier = kind === "supplier";
  const stages = stagesOf(settings, kind);
  const outcomes = outcomesOf(settings, kind);
  const st = stageOf(settings, lead.stage, kind);
  const isClosed = closed.has(lead.stage);
  const save = (body: Partial<Lead>) => ops.saveLead(lead.id, body);

  useEffect(() => {
    setNextAt(isoToLocal(lead.next_action_at));
    setNextText(lead.next_action || "");
  }, [lead.next_action_at, lead.next_action]);

  // Kişinin geçmişi: projedeki kayıtlar (canlı) + sunucudan gelen tam liste.
  const local = data.activities.filter((a) => a.lead_id === lead.id);
  const ids = new Set(local.map((a) => a.id));
  const timeline = [...local, ...(detail.data?.activities || []).filter((a) => !ids.has(a.id))].sort(
    (a, b) => String(b.occurred_at).localeCompare(String(a.occurred_at)) || b.id - a.id
  );
  const questions = data.questions.filter((q) => q.lead_id === lead.id);

  const chooseStage = (key: string | null) => {
    if (!key || key === lead.stage) return;
    const next = stages.find((s) => s.key === key);
    if (next?.won && (supplier || !lead.portfolio_id)) { setWinning(lead); return; }
    if (next?.lost) { setLosing(lead); return; }
    void save({ stage: key });
  };

  const quick = async (outcome: LeadOutcome) => {
    setBusy(outcome.key);
    const res = await ops.logActivity({ lead_id: lead.id, ...(stepId ? { step_id: stepId } : {}), type: quickType, outcome: outcome.key, note: quickNote.trim() || null });
    setBusy("");
    if (res) {
      setQuickNote("");
      const next = res.lead?.next_action_at ? ` · sonraki: ${whenLabel(res.lead.next_action_at)}` : "";
      notify(`${ACTIVITY_META[quickType].short}: ${outcome.label}${next}`);
    }
  };
  const submitFull = async () => {
    if (!form.note.trim() && !form.outcome) return;
    setBusy("full");
    const body: Record<string, unknown> = { lead_id: lead.id, ...(stepId ? { step_id: stepId } : {}), type: form.type, outcome: form.outcome || null, note: form.note.trim() || null };
    if (form.next_at) {
      body.next_action_at = localToIso(form.next_at);
      body.next_action = form.next_action || null;
    }
    const res = await ops.logActivity(body);
    setBusy("");
    if (res) {
      setForm({ type: form.type, outcome: null, note: "", next_at: null, next_action: "" });
      notify("Görüşme kaydedildi.");
    }
  };
  const saveNext = async () => {
    const item = await save({ next_action_at: localToIso(nextAt), next_action: nextText.trim() || null } as Partial<Lead>);
    if (item) notify(nextAt ? `Sonraki aksiyon: ${whenLabel(item.next_action_at)}` : "Sonraki aksiyon temizlendi.");
  };
  const addToAgenda = async () => {
    if (!lead.next_action_at) return;
    try {
      const start = new Date(lead.next_action_at);
      await createAgendaEvent({
        title: `${lead.next_action || "Ara"}: ${lead.name}`,
        description: [data.item.name, lead.company, lead.phone && `Tel: ${prettyPhone(lead.phone)}`].filter(Boolean).join(" · "),
        category: "general",
        all_day: false,
        start_at: start.toISOString(),
        end_at: new Date(start.getTime() + 30 * 60000).toISOString(),
        recurrence: "none",
        remind_minutes: 15,
      });
      notify("Ajandaya eklendi.", "success", { label: "Ajandayı aç", onPress: () => router.push("/yonetim/araclar/ajanda" as never) });
    } catch (err) {
      notify(errorText(err, "Ajandaya eklenemedi."), "danger");
    }
  };
  const remove = async () => {
    const ok = await confirmAction({
      title: "Kişi silinsin mi?",
      message: `"${lead.name}" ve görüşme geçmişi silinecek.${lead.portfolio_id ? " Portföy kaydı kalır." : ""}`,
      confirmLabel: "Sil",
      destructive: true,
    });
    if (!ok) return;
    onClose();
    if (await ops.removeLead(lead.id)) notify("Kişi silindi.");
  };

  const sources = supplier ? settings.supplier_categories || [] : settings.lead_sources;
  const itemSuggestions = [...new Set(data.leads.filter((l) => kindOf(l) === "supplier" && l.item).map((l) => l.item))];

  return (
    <View style={styles.body}>
      <View style={styles.head}>
        <Avatar name={supplier ? lead.company || lead.name : lead.name} size={52} />
        <View style={styles.flex}>
          <SaveOnBlurInput value={lead.name} editable={canEdit} onSave={(v) => { if (v.trim()) void save({ name: v.trim() }); }} accessibilityLabel="Ad soyad" />
        </View>
      </View>
      <View style={styles.pills}>
        {supplier ? <Pill label={`Tedarik${lead.item ? ` · ${lead.item}` : ""}`} color={SUPPLIER_COLOR} icon="car-outline" /> : null}
        {supplier && lead.value != null ? <Pill label={`Teklif ${formatMoney(lead.value)}`} color={QUOTE_COLOR} icon="pricetag-outline" /> : null}
        {lead.portfolio_id ? <Pill label="Portföyde" color={WIN_COLOR} icon="briefcase-outline" /> : null}
        {lead.contact_count ? <Pill label={`${lead.contact_count} görüşme`} color={UNKNOWN_STAGE_COLOR} /> : null}
      </View>
      <SelectField<string>
        label="Aşama"
        value={lead.stage}
        disabled={!canEdit}
        icon="flag-outline"
        options={stages.map((s) => ({ value: s.key, label: s.label, hint: s.won ? (supplier ? "Anlaşıldı" : "Kazanıldı") : s.lost ? (supplier ? "Vazgeçildi" : "Kaybedildi") : null }))}
        valueLabel={st.label}
        onChange={chooseStage}
      />

      <ContactBar phone={lead.phone} email={lead.email} />

      {canEdit && !isClosed ? (
        <View style={styles.card}>
          <SubHead icon="flash-outline" title="Görüşme sonucu" />
          <ChipGroup contentPadding={0}>
            {QUICK_TYPES.map((k) => (
              <Chip key={k} label={ACTIVITY_META[k].short} icon={ACTIVITY_META[k].icon} size="sm" selected={quickType === k} onPress={() => setQuickType(k)} />
            ))}
          </ChipGroup>
          <Input size="sm" value={quickNote} onChangeText={setQuickNote} placeholder="Kısa not (isteğe bağlı) — ör. akşam 6'dan sonra arayın" />
          <View style={styles.outcomes}>
            {outcomes.map((o) => {
              const target = o.stage ? stageOf(settings, o.stage, kind) : null;
              const price = supplier && asksPrice(o);
              const c = target?.color || UNKNOWN_STAGE_COLOR;
              return (
                <Touchable
                  key={o.key}
                  feedback="card"
                  haptic="light"
                  disabled={Boolean(busy)}
                  onPress={() => (price ? setPricing(o) : void quick(o))}
                  style={[styles.outcome, { borderColor: withAlpha(c, 0.5), backgroundColor: withAlpha(c, 0.08) }]}
                  accessibilityRole="button"
                  accessibilityLabel={o.label}
                >
                  <Text style={styles.outcomeTitle} numberOfLines={2} {...textScale.dense}>{busy === o.key ? "Kaydediliyor…" : o.label}</Text>
                  <Text style={[styles.tiny, { color: c }]} numberOfLines={2} {...textScale.badge}>
                    {price ? "Tutar sorulur · " : ""}
                    {target ? target.label : "Aşama değişmez"}
                    {o.next_days != null ? ` · +${o.next_days} gün` : ""}
                  </Text>
                </Touchable>
              );
            })}
          </View>
        </View>
      ) : null}
      {lead.lost_reason && st.lost ? <Text style={styles.lost} {...textScale.long}>Kayıp nedeni: {lead.lost_reason}</Text> : null}

      <View style={[styles.card, isLeadOverdue(lead, closed) ? { borderColor: withAlpha(ALERT_COLOR, 0.5), borderWidth: 1 } : null]}>
        <SubHead icon="notifications-outline" title={`Sonraki aksiyon${lead.next_action_at ? ` · ${whenLabel(lead.next_action_at)}` : ""}`} />
        <DateField value={nextAt} onChange={(v) => { if (canEdit) setNextAt(v); }} withTime clearable placeholder="Tarih ve saat seç" />
        <Input size="sm" value={nextText} onChangeText={setNextText} editable={canEdit} placeholder="Ne yapılacak? (ör. Tekrar ara)" />
        {canEdit ? (
          <>
            <ChipGroup contentPadding={0}>
              {([[0, "Bugün"], [1, "Yarın"], [3, "+3 gün"], [7, "+1 hafta"]] as [number, string][]).map(([d, label]) => (
                <Chip key={d} label={label} size="sm" onPress={() => setNextAt(daysFromNowAt10(d))} />
              ))}
            </ChipGroup>
            <View style={styles.bar}>
              {lead.next_action_at ? <Button label="Ajandaya ekle" icon="calendar-outline" variant="ghost" size="sm" onPress={() => void addToAgenda()} /> : null}
              <View style={styles.flex} />
              <Button label="Kaydet" size="sm" onPress={() => void saveNext()} />
            </View>
          </>
        ) : null}
      </View>

      {canEdit ? (
        <View style={styles.card}>
          <Touchable onPress={() => setFull((f) => !f)} style={styles.toggle} accessibilityRole="button" accessibilityState={{ expanded: full }}>
            <Ionicons name="create-outline" size={16} color={colors.textSecondary} />
            <Text style={styles.toggleText} {...textScale.dense}>Ayrıntılı görüşme kaydı</Text>
            <View style={styles.flex} />
            <Ionicons name={full ? "chevron-up" : "chevron-down"} size={16} color={colors.textTertiary} />
          </Touchable>
          {full ? (
            <View style={styles.gap}>
              <ChipsField<ActivityType>
                label="Tür"
                value={form.type}
                onChange={(v) => { if (typeof v === "string") setForm((f) => ({ ...f, type: v })); }}
                options={CONTACT_TYPES.map((k) => ({ key: k, label: ACTIVITY_META[k].label }))}
              />
              <SelectField<string>
                label="Sonuç"
                value={form.outcome}
                placeholder="Sonuç yok (yalnız not)"
                clearable
                options={outcomes.map((o) => ({ value: o.key, label: o.label }))}
                onChange={(v) => setForm((f) => ({ ...f, outcome: v }))}
              />
              <Input label="Not" value={form.note} onChangeText={(v) => setForm((f) => ({ ...f, note: v }))} multiline numberOfLines={3} placeholder="Görüşmede ne konuşuldu?" />
              <DateField label="Sonraki aksiyon" hint="boşsa sonuca göre" value={form.next_at} withTime clearable onChange={(v) => setForm((f) => ({ ...f, next_at: v }))} />
              <Input label="Ne yapılacak?" value={form.next_action} onChangeText={(v) => setForm((f) => ({ ...f, next_action: v }))} />
              <View style={styles.bar}>
                <View style={styles.flex} />
                <Button label="Kaydı ekle" size="sm" loading={busy === "full"} disabled={!form.note.trim() && !form.outcome} onPress={() => void submitFull()} />
              </View>
            </View>
          ) : null}
        </View>
      ) : null}

      {supplier ? (
        <>
          <SubHead icon="scale-outline" title={`Fiyat karşılaştırması${lead.item ? ` · ${lead.item}` : ""}`} />
          <PriceCompare lead={lead} onOpen={nav.openLead} />
        </>
      ) : null}

      <SubHead icon="id-card-outline" title="Bilgiler" />
      <View style={styles.gap}>
        {supplier ? (
          <>
            <SaveOnBlurInput label="Tedarik konusu" hint="aynı konudaki teklifler karşılaştırılır" value={lead.item} editable={canEdit} placeholder="Ör. Kupa / madalya" onSave={(v) => void save({ item: v })} />
            {canEdit && itemSuggestions.length ? (
              <ChipGroup contentPadding={0}>
                {itemSuggestions.map((x) => <Chip key={x} label={x} size="sm" selected={x === lead.item} onPress={() => void save({ item: x })} />)}
              </ChipGroup>
            ) : null}
          </>
        ) : null}
        <SaveOnBlurInput label={supplier ? "Firma" : "Kurum / takım"} value={lead.company} editable={canEdit} onSave={(v) => void save({ company: v })} />
        <SaveOnBlurInput label={supplier ? "Yetkili / unvan" : "Unvan"} value={lead.title} editable={canEdit} onSave={(v) => void save({ title: v })} />
        <SaveOnBlurInput label="Telefon" value={lead.phone} editable={canEdit} keyboardType="phone-pad" onSave={(v) => void save({ phone: v })} />
        <SaveOnBlurInput label="E-posta" value={lead.email} editable={canEdit} keyboardType="email-address" autoCapitalize="none" onSave={(v) => void save({ email: v })} />
        <SaveOnBlurInput label="Şehir" value={lead.city} editable={canEdit} onSave={(v) => void save({ city: v })} />
        <SaveOnBlurInput label={supplier ? "Kategori" : "Kaynak"} value={lead.source} editable={canEdit} onSave={(v) => void save({ source: v })} />
        {canEdit && sources.length ? (
          <ChipGroup contentPadding={0}>
            {sources.map((x) => <Chip key={x} label={x} size="sm" selected={x === lead.source} onPress={() => void save({ source: x })} />)}
          </ChipGroup>
        ) : null}
        <SaveOnBlurInput
          label={supplier ? "Teklif (₺)" : "Değer (₺)"}
          value={lead.value == null ? "" : String(lead.value).replace(".", ",")}
          editable={canEdit}
          keyboardType="decimal-pad"
          onSave={(v) => void save({ value: (v === "" ? null : v) as unknown as number })}
        />
        <SelectField<number>
          label="Sorumlu"
          value={lead.owner_id}
          disabled={!canEdit}
          placeholder="Atanmadı"
          clearable
          valueLabel={lead.owner_id ? personName(lead.owner_id) : null}
          options={directory.map((u) => ({ value: u.id, label: `${u.name}${u.me ? " (ben)" : ""}` }))}
          onChange={(v) => void save({ owner_id: v ?? null })}
        />
        <SaveOnBlurInput label="Not" value={lead.note} editable={canEdit} multiline numberOfLines={3} onSave={(v) => void save({ note: v })} />
      </View>

      <SubHead icon="help-circle-outline" title="Soruları ve ihtiyaçları" count={questions.length} />
      {canEdit ? <QuestionForm compact defaults={{ lead_id: lead.id, ...(stepId ? { step_id: stepId } : {}) }} /> : null}
      {questions.map((q) => <QuestionItem key={q.id} q={q} compact />)}

      <SubHead icon="time-outline" title="Görüşme geçmişi" count={timeline.length} />
      <Timeline items={timeline} showLead={false} showStep empty="Henüz görüşme yok. Yukarıdaki sonuç düğmeleriyle tek dokunuşla kaydedin." />

      {canEdit ? (
        <View style={styles.footer}>
          <Button label="Sil" icon="trash-outline" variant="danger" size="sm" onPress={() => void remove()} />
          {!st.lost ? <Button label={supplier ? "Vazgeçildi" : "Kaybedildi"} icon="close-circle-outline" variant="secondary" size="sm" onPress={() => setLosing(lead)} /> : null}
          {supplier ? (
            !st.won ? <Button label="Tamamla → Gidere yaz" icon="receipt-outline" size="sm" onPress={() => setWinning(lead)} /> : null
          ) : !lead.portfolio_id ? (
            <Button label="Satışı kapat → Portföy" icon="trophy-outline" size="sm" onPress={() => setWinning(lead)} />
          ) : null}
        </View>
      ) : null}

      {supplier ? <CloseSupplierSheet lead={winning} onClose={() => setWinning(null)} /> : <WinSheet lead={winning} onClose={() => setWinning(null)} />}
      <LostSheet lead={losing} onClose={() => setLosing(null)} />
      <PriceSheet lead={lead} outcome={pricing} activityType={quickType} stepId={stepId} onClose={() => setPricing(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  body: { gap: space.md, paddingBottom: space.xl },
  gap: { gap: space.sm },
  flex: { flex: 1 },
  head: { flexDirection: "row", alignItems: "center", gap: space.md },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
  card: { gap: space.sm, padding: space.md, borderRadius: radius.xl, backgroundColor: colors.surface2 },
  outcomes: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  outcome: { width: "48%", flexGrow: 1, padding: space.sm, borderRadius: radius.md, borderWidth: 1, gap: space.xxs },
  outcomeTitle: { ...type.label, color: colors.textPrimary },
  tiny: { ...type.meta, color: colors.textTertiary },
  lost: { ...type.bodySm, color: colors.danger },
  bar: { flexDirection: "row", alignItems: "center", gap: space.sm },
  toggle: { flexDirection: "row", alignItems: "center", gap: space.sm },
  toggleText: { ...type.label, color: colors.textPrimary },
  footer: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: space.md },
});
