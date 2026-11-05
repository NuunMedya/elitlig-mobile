/**
 * Ayarlar: proje bilgileri, müşteri ve tedarik aşamaları, görüşme sonuçları
 * (hızlı düğmeler), bütçe varsayılan hesabı, roller → kişi, listeler, üyeler
 * (yalnız sahip), şablon olarak kaydet / kopyala / sil / ayrıl.
 *
 * Her bölüm kendi taslağını tutar; değişiklik varsa altta "Geri al / Kaydet"
 * çıkar. Silinen aşamada kişi varsa sunucu STAGE_IN_USE der; kişilerin
 * taşınacağı aşama sorulup yeniden kaydedilir.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { ColorField, DateField, FormSheet, OptionSheet, Panel, SelectField, ChipsField, confirmAction } from "@/components/admin";
import { Avatar, Badge, Button, Input, Touchable, withAlpha } from "@/components/ui";
import { errorText } from "@/lib/admin/errors";
import { formatMoney } from "@/lib/admin/format";
import { PROJECT_COLORS, PROJECT_ICONS, PROJECT_STATUSES, PROJECT_STATUS_META, kindOf, outcomesOf, slugKey, stagesOf } from "@/lib/admin/projectUtils";
import {
  duplicateProject,
  leaveProject,
  removeProject,
  saveTemplate,
  type LeadKind,
  type LeadOutcome,
  type LeadStage,
  type ProjectRole,
  type ProjectSettings,
  type ProjectStatus,
} from "@/lib/api/admin/projects";
import { ApiError } from "@/lib/http";
import { colors, radius, space, textScale, type } from "@/theme";

import { useProjectAccounts } from "./LeadDialogs";
import { useProject } from "./ProjectContext";
import { Dot, ListEditor } from "./ui";

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
function move<T>(list: T[], i: number, dir: number): T[] {
  const j = i + dir;
  if (j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

function SaveBar({ dirty, busy, onSave, onReset }: { dirty: boolean; busy: boolean; onSave: () => void; onReset: () => void }) {
  if (!dirty) return null;
  return (
    <View style={styles.saveBar}>
      <Text style={styles.saveText} {...textScale.dense}>Kaydedilmemiş değişiklik var</Text>
      <Button label="Geri al" variant="ghost" size="sm" onPress={onReset} disabled={busy} />
      <Button label="Kaydet" size="sm" onPress={onSave} loading={busy} />
    </View>
  );
}

function IconBtn({ icon, label, onPress, disabled, danger }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <Touchable feedback="icon" onPress={onPress} disabled={disabled} style={[styles.iconBtn, disabled ? styles.off : null]} accessibilityRole="button" accessibilityLabel={label} hitSlop={6}>
      <Ionicons name={icon} size={18} color={danger ? colors.danger : colors.textSecondary} />
    </Touchable>
  );
}

/* ------------------------------ proje bilgileri ------------------------------ */

function InfoSection() {
  const { data, ops, canEdit, notify } = useProject();
  const p = data.item;
  const initial = { name: p.name, description: p.description, status: p.status, start_date: p.start_date || null, end_date: p.end_date || null, color: p.color, icon: p.icon };
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const dirty = !same(form, initial);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const save = async () => {
    if (!form.name.trim()) { notify("Proje adı zorunludur.", "danger"); return; }
    setBusy(true);
    const item = await ops.saveProject({ ...form, name: form.name.trim() });
    setBusy(false);
    if (item) notify("Proje bilgileri kaydedildi.");
  };
  const toggleArchive = async () => {
    const item = await ops.saveProject({ archived: !p.archived });
    if (item) notify(item.archived ? "Proje arşivlendi." : "Proje arşivden çıkarıldı.");
  };
  return (
    <Panel title="Proje bilgileri">
      <View style={styles.gap}>
        <Input label="Proje adı" value={form.name} onChangeText={(v) => set("name", v)} editable={canEdit} />
        <ChipsField<ProjectStatus>
          label="Durum"
          value={form.status}
          onChange={(v) => { if (canEdit && typeof v === "string") set("status", v); }}
          options={PROJECT_STATUSES.map((k) => ({ key: k, label: PROJECT_STATUS_META[k].label }))}
        />
        <Input label="Açıklama" value={form.description} onChangeText={(v) => set("description", v)} editable={canEdit} multiline numberOfLines={3} />
        <View style={styles.row2}>
          <View style={styles.flex}><DateField label="Başlangıç" value={form.start_date} clearable onChange={(v) => { if (canEdit) set("start_date", v); }} /></View>
          <View style={styles.flex}><DateField label="Bitiş" value={form.end_date} clearable onChange={(v) => { if (canEdit) set("end_date", v); }} /></View>
        </View>
        <ColorField label="Renk" value={form.color} palette={PROJECT_COLORS} onChange={(v) => { if (canEdit && v) set("color", v); }} />
        <Text style={styles.label} {...textScale.dense}>Simge</Text>
        <View style={styles.icons}>
          {Object.entries(PROJECT_ICONS).map(([k, name]) => (
            <Touchable
              key={k}
              feedback="icon"
              disabled={!canEdit}
              onPress={() => set("icon", k)}
              style={[styles.iconPick, form.icon === k ? { backgroundColor: withAlpha(form.color || PROJECT_COLORS[0], 0.18), borderColor: form.color } : null]}
              accessibilityRole="radio"
              accessibilityState={{ selected: form.icon === k }}
              accessibilityLabel={`Simge ${k}`}
            >
              <Ionicons name={name} size={20} color={form.icon === k ? form.color : colors.textSecondary} />
            </Touchable>
          ))}
        </View>
        {canEdit ? (
          <>
            <SaveBar dirty={dirty} busy={busy} onSave={() => void save()} onReset={() => setForm(initial)} />
            <Button label={p.archived ? "Arşivden çıkar" : "Arşivle"} icon="archive-outline" variant="secondary" size="sm" onPress={() => void toggleArchive()} />
          </>
        ) : null}
      </View>
    </Panel>
  );
}

/* ------------------------------ aşamalar ------------------------------ */

const KIND_TEXT = {
  customer: { stagesKey: "lead_stages", outcomesKey: "outcomes", moveKey: "move_stage_to", title: "Müşteri görüşmesi aşamaları", outcomesTitle: "Müşteri görüşme sonuçları (hızlı düğmeler)", won: "Kazanıldı", lost: "Kaybedildi", noun: "kişi", saved: "Kişi aşamaları kaydedildi." },
  supplier: { stagesKey: "supplier_stages", outcomesKey: "supplier_outcomes", moveKey: "move_supplier_stage_to", title: "Tedarik görüşmesi aşamaları", outcomesTitle: "Tedarik görüşme sonuçları", won: "Anlaşıldı", lost: "Vazgeçildi", noun: "tedarikçi", saved: "Tedarik aşamaları kaydedildi." },
} as const;

type DraftStage = LeadStage & { isNew?: boolean };

function StagesSection({ kind }: { kind: LeadKind }) {
  const { data, settings, ops, canEdit, notify } = useProject();
  const T = KIND_TEXT[kind];
  const current = stagesOf(settings, kind);
  const [stages, setStages] = useState<DraftStage[]>(current);
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<number | null>(null);
  const [conflict, setConflict] = useState<{ message: string; list: LeadStage[] } | null>(null);
  const dirty = !same(stages, current);
  const usage = useMemo(() => Object.fromEntries(current.map((s) => [s.key, data.leads.filter((l) => kindOf(l) === kind && l.stage === s.key).length])), [current, data.leads, kind]);

  const clean = (): LeadStage[] =>
    stages.map(({ isNew, ...s }) => ({ ...s, key: isNew ? slugKey(s.label, new Set(stages.filter((x) => x.key !== s.key).map((x) => x.key))) : s.key }));
  const save = async (moveTo?: string) => {
    if (stages.some((s) => !s.label.trim())) { notify("Aşama adları boş olamaz.", "danger"); return; }
    setBusy(true);
    const list = clean();
    try {
      const item = await ops.saveProject({ settings: { [T.stagesKey]: list } as Partial<ProjectSettings>, ...(moveTo ? { [T.moveKey]: moveTo } : {}) }, { rethrow: true });
      if (item) {
        setStages(stagesOf(item.settings, kind));
        setConflict(null);
        notify(T.saved);
        if (moveTo) void ops.reload();
      }
    } catch (err) {
      if (err instanceof ApiError && err.code === "STAGE_IN_USE") setConflict({ message: errorText(err), list });
      else notify(errorText(err, "Aşamalar kaydedilemedi."), "danger");
    } finally {
      setBusy(false);
    }
  };
  const editing = edit != null ? stages[edit] : null;

  return (
    <Panel title={`${T.title} · ${stages.length}`}>
      <View style={styles.gap}>
        <Text style={styles.muted} {...textScale.long}>
          {kind === "supplier"
            ? "Tedarik görüşmeleri bu aşamalardan geçer (fiyat istendi → alındı → değerlendirme → anlaşma). \"Anlaşıldı\" olunca tutar gidere yazılır."
            : "Kişiler bu aşamalardan geçer (pano sütunları). Bir aşama \"Kazanıldı\", bir ya da birkaçı \"Kaybedildi\" olabilir."}
        </Text>
        {stages.map((s, i) => (
          <View key={`${s.key}-${i}`} style={styles.editRow}>
            <Touchable onPress={canEdit ? () => setEdit(i) : undefined} disabled={!canEdit} style={styles.editMain} accessibilityRole="button" accessibilityLabel={`${s.label} düzenle`}>
              <Dot color={s.color} size={12} />
              <View style={styles.flex}>
                <Text style={styles.rowTitle} numberOfLines={1} {...textScale.dense}>{s.label}</Text>
                <Text style={styles.tiny} {...textScale.badge}>{usage[s.key] ? `${usage[s.key]} ${T.noun}` : s.isNew ? "yeni" : "boş"}</Text>
              </View>
              {s.won ? <Badge label={T.won} tone="win" size="xs" /> : null}
              {s.lost ? <Badge label={T.lost} tone="danger" size="xs" /> : null}
            </Touchable>
            {canEdit ? (
              <>
                <IconBtn icon="arrow-up" label={`${s.label} yukarı`} disabled={i === 0} onPress={() => setStages((l) => move(l, i, -1))} />
                <IconBtn icon="arrow-down" label={`${s.label} aşağı`} disabled={i === stages.length - 1} onPress={() => setStages((l) => move(l, i, 1))} />
                <IconBtn icon="trash-outline" label={`${s.label} aşamasını sil`} danger disabled={stages.length <= 1} onPress={() => setStages((l) => l.filter((_, j) => j !== i))} />
              </>
            ) : null}
          </View>
        ))}
        {canEdit ? (
          <>
            <Button
              label="Aşama ekle"
              icon="add"
              variant="ghost"
              size="sm"
              disabled={stages.length >= 20}
              onPress={() => setStages((list) => [...list, { key: slugKey("yeni_asama", new Set(list.map((s) => s.key))), label: "Yeni aşama", color: PROJECT_COLORS[list.length % PROJECT_COLORS.length], isNew: true }])}
            />
            <SaveBar dirty={dirty} busy={busy} onSave={() => void save()} onReset={() => setStages(current)} />
          </>
        ) : null}
      </View>
      <FormSheet
        visible={editing != null}
        onClose={() => setEdit(null)}
        title="Aşamayı düzenle"
        fields={[
          { key: "label", label: "Aşama adı", kind: "text", required: true, maxLength: 40 },
          { key: "color", label: "Renk", kind: "color", palette: PROJECT_COLORS },
          { key: "won", label: `${T.won} aşaması`, kind: "toggle", hint: "yalnız bir aşama olabilir" },
          { key: "lost", label: `${T.lost} aşaması`, kind: "toggle" },
        ]}
        initial={editing ? { label: editing.label, color: editing.color, won: Boolean(editing.won), lost: Boolean(editing.lost) } : {}}
        submitLabel="Uygula"
        onSubmit={(v) => {
          if (edit == null) return;
          const i = edit;
          const won = Boolean(v.won);
          const lost = !won && Boolean(v.lost);
          setStages((list) =>
            list.map((s, j) => {
              if (j === i) {
                return {
                  key: s.key,
                  label: String(v.label || "").trim(),
                  color: (v.color as string) || s.color,
                  ...(won ? { won: true } : {}),
                  ...(lost ? { lost: true } : {}),
                  ...(s.isNew ? { isNew: true } : {}),
                };
              }
              // "Kazanıldı" tek aşamada olabilir.
              if (won && s.won) {
                const { won: _drop, ...rest } = s;
                return rest;
              }
              return s;
            })
          );
        }}
      />
      <OptionSheet<string>
        visible={conflict != null}
        onClose={() => setConflict(null)}
        title={kind === "supplier" ? "Tedarikçiler hangi aşamaya taşınsın?" : "Kişiler hangi aşamaya taşınsın?"}
        options={(conflict?.list || []).map((s) => ({ value: s.key, label: s.label, hint: conflict?.message }))}
        onSelect={(v) => {
          setConflict(null);
          if (typeof v === "string") setTimeout(() => void save(v), 250);
        }}
      />
    </Panel>
  );
}

/* ------------------------------ görüşme sonuçları ------------------------------ */

type DraftOutcome = LeadOutcome & { isNew?: boolean };

function OutcomesSection({ kind }: { kind: LeadKind }) {
  const { settings, ops, canEdit, notify } = useProject();
  const T = KIND_TEXT[kind];
  const current = outcomesOf(settings, kind);
  const [items, setItems] = useState<DraftOutcome[]>(current);
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<number | null>(null);
  const dirty = !same(items, current);
  const stages = stagesOf(settings, kind);
  const save = async () => {
    if (items.some((o) => !o.label.trim())) { notify("Sonuç adları boş olamaz.", "danger"); return; }
    setBusy(true);
    const taken = new Set<string>();
    const outcomes = items.map(({ isNew, ...o }) => {
      const key = isNew ? slugKey(o.label, new Set([...items.filter((x) => !x.isNew).map((x) => x.key), ...taken])) : o.key;
      taken.add(key);
      const out: LeadOutcome = { key, label: o.label.trim() };
      if (o.stage) out.stage = o.stage;
      if (o.next_days != null && String(o.next_days) !== "") out.next_days = Number(o.next_days);
      return out;
    });
    const item = await ops.saveProject({ settings: { [T.outcomesKey]: outcomes } as Partial<ProjectSettings> });
    setBusy(false);
    if (item) {
      setItems(outcomesOf(item.settings, kind));
      notify("Görüşme sonuçları kaydedildi.");
    }
  };
  const editing = edit != null ? items[edit] : null;
  return (
    <Panel title={`${T.outcomesTitle} · ${items.length}`}>
      <View style={styles.gap}>
        <Text style={styles.muted} {...textScale.long}>
          {kind === "supplier"
            ? "Tedarikçi kartındaki tek dokunuş düğmeleri. \"Fiyat alındı\" seçilince teklif tutarı sorulur ve aynı konudaki tekliflerle karşılaştırılır."
            : "Kişi kartındaki tek dokunuş düğmeleri. Seçilince görüşme kaydedilir, kişi hedef aşamaya geçer ve sonraki arama \"kaç gün sonra\" alanına göre (saat 10:00) planlanır."}
        </Text>
        {items.map((o, i) => {
          const target = o.stage ? stages.find((s) => s.key === o.stage) : null;
          return (
            <View key={`${o.key}-${i}`} style={styles.editRow}>
              <Touchable onPress={canEdit ? () => setEdit(i) : undefined} disabled={!canEdit} style={styles.editMain} accessibilityRole="button" accessibilityLabel={`${o.label} düzenle`}>
                <View style={styles.flex}>
                  <Text style={styles.rowTitle} numberOfLines={1} {...textScale.dense}>{o.label}</Text>
                  <Text style={styles.tiny} {...textScale.badge}>
                    {target ? `→ ${target.label}` : "Aşama değişmesin"}
                    {o.next_days != null ? ` · +${o.next_days} gün` : ""}
                  </Text>
                </View>
              </Touchable>
              {canEdit ? (
                <>
                  <IconBtn icon="arrow-up" label={`${o.label} yukarı`} disabled={i === 0} onPress={() => setItems((l) => move(l, i, -1))} />
                  <IconBtn icon="arrow-down" label={`${o.label} aşağı`} disabled={i === items.length - 1} onPress={() => setItems((l) => move(l, i, 1))} />
                  <IconBtn icon="trash-outline" label={`${o.label} sonucunu sil`} danger onPress={() => setItems((l) => l.filter((_, j) => j !== i))} />
                </>
              ) : null}
            </View>
          );
        })}
        {canEdit ? (
          <>
            <Button label="Sonuç ekle" icon="add" variant="ghost" size="sm" disabled={items.length >= 20} onPress={() => setItems((l) => [...l, { key: `yeni_${l.length}`, label: "Yeni sonuç", isNew: true }])} />
            <SaveBar dirty={dirty} busy={busy} onSave={() => void save()} onReset={() => setItems(current)} />
          </>
        ) : null}
      </View>
      <FormSheet
        visible={editing != null}
        onClose={() => setEdit(null)}
        title="Görüşme sonucu"
        fields={[
          { key: "label", label: "Sonuç", kind: "text", required: true, maxLength: 40 },
          { key: "stage", label: "Hedef aşama", kind: "select", placeholder: "Aşama değişmesin", options: stages.map((s) => ({ value: s.key, label: s.label })) },
          { key: "next_days", label: "Tekrar (gün)", kind: "number", hint: "0–90; boşsa sonraki arama planlanmaz" },
        ]}
        initial={editing ? { label: editing.label, stage: editing.stage || null, next_days: editing.next_days == null ? "" : String(editing.next_days) } : {}}
        submitLabel="Uygula"
        onSubmit={(v) => {
          if (edit == null) return;
          const nd = String(v.next_days ?? "").trim();
          if (nd && (!/^\d+$/.test(nd) || Number(nd) > 90)) throw new Error("Tekrar günü 0–90 arası olmalı.");
          setItems((list) => list.map((o, j) => (j === edit ? { ...o, label: String(v.label || "").trim(), stage: (v.stage as string) || undefined, next_days: nd === "" ? undefined : Number(nd) } : o)));
        }}
      />
    </Panel>
  );
}

/* --------------------------- bütçe ve muhasebe --------------------------- */

function FinanceSection() {
  const router = useRouter();
  const { settings, ops, canEdit, notify } = useProject();
  const fin = useProjectAccounts();
  const [accountId, setAccountId] = useState<number | null>(settings.default_account_id ?? null);
  const [busy, setBusy] = useState(false);
  const accounts = fin.data?.accounts || [];
  const dirty = (settings.default_account_id ?? null) !== accountId;
  const save = async () => {
    setBusy(true);
    const item = await ops.saveProject({ settings: { default_account_id: accountId } });
    setBusy(false);
    if (item) {
      notify("Varsayılan hesap kaydedildi.");
      void fin.refetch();
    }
  };
  return (
    <Panel title="Bütçe ve muhasebe">
      <View style={styles.gap}>
        <SelectField<number>
          label="Varsayılan hesap"
          hint="yeni bütçe kalemleri ve kapanan görüşmeler bu hesaba yazılır"
          value={accountId}
          disabled={!canEdit}
          placeholder="Hesap seçilmedi"
          clearable
          valueLabel={accountId && !accounts.some((a) => a.id === accountId) ? `Hesap #${accountId} (kayıt yetkiniz yok)` : null}
          options={accounts.map((a) => ({ value: a.id, label: a.name, hint: a.balance != null ? formatMoney(a.balance) : null }))}
          onChange={setAccountId}
        />
        {canEdit ? <SaveBar dirty={dirty} busy={busy} onSave={() => void save()} onReset={() => setAccountId(settings.default_account_id ?? null)} /> : null}
        <Text style={styles.muted} {...textScale.long}>
          Listede yalnız kayıt girebildiğiniz hesaplar var. Projeye özel kasa için Muhasebe'de Ortak / proje hesabı açın; hesabın görünürlüğünü ve yetkililerini Muhasebe → Hesaplar'dan yönetin.
        </Text>
        <Button label="Muhasebe → Hesaplar" icon="receipt-outline" variant="secondary" size="sm" onPress={() => router.push("/yonetim/araclar/muhasebe" as never)} />
      </View>
    </Panel>
  );
}

/* ------------------------------ roller ------------------------------ */

function RolesSection() {
  const { settings, ops, canEdit, notify, directory, data, personName } = useProject();
  const [roles, setRoles] = useState<ProjectRole[]>(settings.roles);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState("");
  const [edit, setEdit] = useState<number | null>(null);
  const dirty = !same(roles, settings.roles);
  const used = useMemo(() => {
    const m = new Map<string, number>();
    data.steps.forEach((s) => s.responsible.forEach((r) => m.set(r, (m.get(r) || 0) + 1)));
    return m;
  }, [data.steps]);
  const missing = [...used.keys()].filter((r) => !roles.some((x) => x.name === r));
  const addRole = (name: string) => {
    const v = String(name || "").trim().toLocaleUpperCase("tr-TR");
    if (!v) return;
    setRoles((l) => (l.some((r) => r.name === v) ? l : [...l, { name: v, user_id: null, person: null }]));
    setDraft("");
  };
  const save = async () => {
    setBusy(true);
    const item = await ops.saveProject({ settings: { roles: roles.map((r) => ({ name: r.name, user_id: r.user_id || null, person: r.user_id ? null : r.person || null })) } });
    setBusy(false);
    if (item) {
      setRoles(item.settings.roles);
      notify("Roller kaydedildi.");
    }
  };
  const editing = edit != null ? roles[edit] : null;
  return (
    <Panel title={`Roller ve sorumlu kişiler · ${roles.length}`}>
      <View style={styles.gap}>
        <Text style={styles.muted} {...textScale.long}>Adımlardaki sorumlu rollerini (MÜDÜR, PAZARLAMA SORUMLUSU…) kişilere eşleyin; adım listesinde rolün yanında kişinin adı görünür.</Text>
        {roles.map((r, i) => (
          <View key={`${r.name}-${i}`} style={styles.editRow}>
            <Touchable onPress={canEdit ? () => setEdit(i) : undefined} disabled={!canEdit} style={styles.editMain} accessibilityRole="button" accessibilityLabel={`${r.name} kişisi`}>
              <View style={styles.flex}>
                <Text style={styles.rowTitle} numberOfLines={1} {...textScale.dense}>{r.name}</Text>
                <Text style={styles.tiny} {...textScale.badge}>
                  {used.get(r.name) || 0} adım · {r.user_id ? personName(r.user_id) : r.person || "kişi atanmadı"}
                </Text>
              </View>
            </Touchable>
            {canEdit ? <IconBtn icon="trash-outline" danger label={`${r.name} rolünü sil`} onPress={() => setRoles((l) => l.filter((_, j) => j !== i))} /> : null}
          </View>
        ))}
        {canEdit ? (
          <>
            <Input
              size="sm"
              value={draft}
              onChangeText={setDraft}
              placeholder="Yeni rol (ör. SAHA SORUMLUSU)"
              autoCapitalize="characters"
              returnKeyType="done"
              onSubmitEditing={() => addRole(draft)}
              trailing={draft.trim() ? <Button label="Rol ekle" size="sm" variant="ghost" onPress={() => addRole(draft)} /> : null}
            />
            {missing.length ? <Button label={`Adımlardaki ${missing.length} rolü ekle`} variant="ghost" size="sm" onPress={() => missing.forEach(addRole)} /> : null}
            <SaveBar dirty={dirty} busy={busy} onSave={() => void save()} onReset={() => setRoles(settings.roles)} />
          </>
        ) : null}
      </View>
      <FormSheet
        visible={editing != null}
        onClose={() => setEdit(null)}
        title={editing?.name || "Rol"}
        intro="Bir yönetim kullanıcısı seçin ya da kişinin adını yazın."
        fields={[
          { key: "user_id", label: "Yönetim kullanıcısı", kind: "select", placeholder: "Seçilmedi", options: directory.map((u) => ({ value: u.id, label: `${u.name}${u.me ? " (ben)" : ""}` })) },
          { key: "person", label: "ya da kişinin adı", kind: "text", hidden: (v) => Boolean(v.user_id) },
        ]}
        initial={editing ? { user_id: editing.user_id, person: editing.person || "" } : {}}
        submitLabel="Uygula"
        onSubmit={(v) => {
          if (edit == null) return;
          setRoles((list) => list.map((r, j) => (j === edit ? { ...r, user_id: v.user_id ? Number(v.user_id) : null, person: v.user_id ? null : String(v.person || "") || null } : r)));
        }}
      />
    </Panel>
  );
}

/* ------------------------------ listeler ------------------------------ */

const LIST_KEYS: { key: "portfolio_categories" | "lead_sources" | "question_categories" | "supplier_categories" | "finance_categories"; label: string }[] = [
  { key: "portfolio_categories", label: "Portföy kategorileri" },
  { key: "lead_sources", label: "Kişi kaynakları" },
  { key: "question_categories", label: "Soru kategorileri" },
  { key: "supplier_categories", label: "Tedarik kategorileri" },
  { key: "finance_categories", label: "Bütçe (gelir / gider) kategorileri" },
];

function ListsSection() {
  const { settings, ops, canEdit, notify } = useProject();
  const initial = Object.fromEntries(LIST_KEYS.map((k) => [k.key, settings[k.key] || []])) as Record<(typeof LIST_KEYS)[number]["key"], string[]>;
  const [lists, setLists] = useState(initial);
  const [busy, setBusy] = useState(false);
  const dirty = !same(lists, initial);
  const save = async () => {
    setBusy(true);
    const item = await ops.saveProject({ settings: lists });
    setBusy(false);
    if (item) notify("Listeler kaydedildi.");
  };
  return (
    <Panel title="Listeler">
      <View style={styles.gap}>
        {LIST_KEYS.map((k) => (
          <View key={k.key} style={styles.gapSm}>
            <Text style={styles.label} {...textScale.dense}>{k.label}</Text>
            <ListEditor items={lists[k.key]} disabled={!canEdit} onChange={(v) => setLists((l) => ({ ...l, [k.key]: v }))} placeholder="Ekle…" />
          </View>
        ))}
        {canEdit ? <SaveBar dirty={dirty} busy={busy} onSave={() => void save()} onReset={() => setLists(initial)} /> : null}
      </View>
    </Panel>
  );
}

/* ------------------------------ üyeler ------------------------------ */

function MembersSection() {
  const { data, ops, isOwner, notify, directory } = useProject();
  const base = data.members.map((m) => ({ user_id: m.user_id, role: m.role, name: m.name }));
  const [members, setMembers] = useState(base);
  const [busy, setBusy] = useState(false);
  const dirty = !same(members.map(({ user_id, role }) => ({ user_id, role })), data.members.map(({ user_id, role }) => ({ user_id, role })));
  const available = directory.filter((u) => u.id !== data.item.owner_id && !members.some((m) => m.user_id === u.id));
  const save = async () => {
    setBusy(true);
    const res = await ops.setMembers(members.map(({ user_id, role }) => ({ user_id, role })));
    setBusy(false);
    if (res) {
      setMembers(res.map((m) => ({ ...m })));
      notify("Üyeler kaydedildi.");
    }
  };
  return (
    <Panel title={`Üyeler · ${data.members.length + 1}`}>
      <View style={styles.gap}>
        <View style={styles.member}>
          <Avatar name={data.item.owner_name || "Sahip"} size={34} />
          <View style={styles.flex}>
            <Text style={styles.rowTitle} {...textScale.dense}>{data.item.owner_name || "Proje sahibi"}</Text>
            <Text style={styles.tiny} {...textScale.badge}>Sahip</Text>
          </View>
        </View>
        {members.map((m, i) => (
          <View key={m.user_id} style={styles.member}>
            <Avatar name={m.name || `#${m.user_id}`} size={34} />
            <View style={styles.flex}>
              <Text style={styles.rowTitle} {...textScale.dense}>{m.name || `#${m.user_id}`}</Text>
              <Text style={styles.tiny} {...textScale.badge}>{m.role === "viewer" ? "Yalnız görür" : "Düzenler"}</Text>
            </View>
            {isOwner ? (
              <>
                <Button
                  label={m.role === "viewer" ? "Düzenleyebilsin" : "Yalnız görsün"}
                  variant="ghost"
                  size="sm"
                  onPress={() => setMembers((l) => l.map((x, j) => (j === i ? { ...x, role: x.role === "viewer" ? "editor" : "viewer" } : x)))}
                />
                <IconBtn icon="person-remove-outline" danger label={`${m.name} üyeliğini kaldır`} onPress={() => setMembers((l) => l.filter((_, j) => j !== i))} />
              </>
            ) : null}
          </View>
        ))}
        {isOwner ? (
          <>
            <SelectField<number>
              value={null}
              placeholder="Üye ekle"
              icon="person-add-outline"
              sheetTitle="Yönetim kullanıcısı"
              options={available.map((u) => ({ value: u.id, label: u.name, hint: u.city || null }))}
              onChange={(v) => {
                const u = directory.find((x) => x.id === v);
                if (u) setMembers((l) => [...l, { user_id: u.id, role: "editor", name: u.name }]);
              }}
            />
            <SaveBar dirty={dirty} busy={busy} onSave={() => void save()} onReset={() => setMembers(base)} />
          </>
        ) : (
          <Text style={styles.muted} {...textScale.dense}>Üyeleri yalnız proje sahibi değiştirebilir.</Text>
        )}
      </View>
    </Panel>
  );
}

/* ------------------------------ proje işlemleri ------------------------------ */

function ActionsSection() {
  const router = useRouter();
  const { data, isOwner, notify } = useProject();
  const [dialog, setDialog] = useState<"template" | "copy" | null>(null);
  const p = data.item;
  const remove = async () => {
    const ok = await confirmAction({
      title: "Proje silinsin mi?",
      message: `"${p.name}" kalıcı olarak silinecek: ${data.steps.length} adım, ${data.leads.length} kişi, ${data.questions.length} soru ve tüm geçmiş. Portföy kayıtları korunur.`,
      confirmLabel: "Kalıcı olarak sil",
      destructive: true,
    });
    if (!ok) return;
    try {
      await removeProject(p.id);
      notify("Proje silindi.");
      router.replace("/yonetim/araclar/projeler" as never);
    } catch (err) {
      notify(errorText(err, "Silinemedi."), "danger");
    }
  };
  const leave = async () => {
    const ok = await confirmAction({ title: "Projeden ayrılınsın mı?", message: `"${p.name}" projesine erişiminiz kalkacak.`, confirmLabel: "Ayrıl", destructive: true });
    if (!ok) return;
    try {
      await leaveProject(p.id);
      notify("Projeden ayrıldınız.");
      router.replace("/yonetim/araclar/projeler" as never);
    } catch (err) {
      notify(errorText(err, "Ayrılınamadı."), "danger");
    }
  };
  return (
    <Panel title="Proje işlemleri">
      <View style={styles.gap}>
        <ActionCard icon="bookmark-outline" title="Şablon olarak kaydet" body="Aşamalar, adımlar, roller ve ayarlar; kişiler ve notlar hariç." onPress={() => setDialog("template")} />
        <ActionCard icon="copy-outline" title="Kopyasını oluştur" body="Aynı süreçle yeni bir proje (adımlar baştan başlar)." onPress={() => setDialog("copy")} />
        {isOwner ? (
          <ActionCard icon="trash-outline" danger title="Projeyi sil" body="Adımlar, kişiler, sorular ve geçmiş silinir; portföy kayıtları kalır." onPress={() => void remove()} />
        ) : (
          <ActionCard icon="exit-outline" danger title="Projeden ayrıl" body="Sahip sizi yeniden ekleyebilir." onPress={() => void leave()} />
        )}
      </View>
      <FormSheet
        visible={dialog != null}
        onClose={() => setDialog(null)}
        title={dialog === "template" ? "Şablon olarak kaydet" : "Projeyi kopyala"}
        submitLabel={dialog === "template" ? "Şablonu kaydet" : "Kopyala"}
        fields={[
          { key: "name", label: dialog === "template" ? "Şablon adı" : "Yeni proje adı", kind: "text", required: true },
          ...(dialog === "template" ? [{ key: "description", label: "Açıklama", kind: "multiline" as const }] : []),
        ]}
        initial={{ name: dialog === "template" ? p.name : `${p.name} (kopya)`, description: p.description || "" }}
        onSubmit={async (v) => {
          const name = String(v.name || "").trim();
          if (dialog === "template") {
            await saveTemplate({ project_id: p.id, name, description: String(v.description || "") || null });
            notify("Şablon kaydedildi. Yeni proje açarken seçebilirsiniz.");
          } else {
            const res = await duplicateProject(p.id, { name });
            notify(`Kopya oluşturuldu (${res.created?.steps ?? 0} adım).`);
            router.replace({ pathname: "/yonetim/araclar/projeler/[id]", params: { id: String(res.item.id) } } as never);
          }
        }}
      />
    </Panel>
  );
}

function ActionCard({ icon, title, body, onPress, danger }: { icon: keyof typeof Ionicons.glyphMap; title: string; body: string; onPress: () => void; danger?: boolean }) {
  return (
    <Touchable feedback="card" onPress={onPress} style={[styles.action, danger ? styles.actionDanger : null]} accessibilityRole="button" accessibilityLabel={title}>
      <Ionicons name={icon} size={22} color={danger ? colors.danger : colors.brandAccent} />
      <View style={styles.flex}>
        <Text style={[styles.rowTitle, danger ? { color: colors.danger } : null]} {...textScale.dense}>{title}</Text>
        <Text style={styles.muted} {...textScale.dense}>{body}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
    </Touchable>
  );
}

export function Settings() {
  const { canEdit } = useProject();
  return (
    <View style={styles.wrap}>
      {!canEdit ? (
        <Text style={styles.notice} {...textScale.long}>Bu projeyi yalnız görüntüleyebilirsiniz; ayarları proje sahibi ya da düzenleyici üyeler değiştirir.</Text>
      ) : null}
      <InfoSection />
      <StagesSection kind="customer" />
      <OutcomesSection kind="customer" />
      <StagesSection kind="supplier" />
      <OutcomesSection kind="supplier" />
      <FinanceSection />
      <RolesSection />
      <MembersSection />
      <ListsSection />
      <ActionsSection />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  gap: { gap: space.md },
  gapSm: { gap: space.xs },
  flex: { flex: 1 },
  row2: { flexDirection: "row", gap: space.sm },
  label: { ...type.label, color: colors.textSecondary },
  muted: { ...type.bodySm, color: colors.textTertiary },
  tiny: { ...type.meta, color: colors.textTertiary },
  notice: { ...type.bodySm, color: colors.textPrimary, padding: space.md, borderRadius: radius.lg, backgroundColor: colors.infoDim },
  saveBar: { flexDirection: "row", alignItems: "center", gap: space.s, padding: space.sm, borderRadius: radius.md, backgroundColor: colors.warnDim },
  saveText: { ...type.labelSm, color: colors.textPrimary, flex: 1 },
  icons: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  iconPick: { width: 44, height: 44, borderRadius: radius.md, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border },
  editRow: { flexDirection: "row", alignItems: "center", gap: space.xs },
  editMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.s },
  rowTitle: { ...type.label, color: colors.textPrimary },
  iconBtn: { padding: space.xs },
  off: { opacity: 0.3 },
  member: { flexDirection: "row", alignItems: "center", gap: space.sm },
  action: { flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md, borderRadius: radius.lg, backgroundColor: colors.surface2 },
  actionDanger: { backgroundColor: colors.dangerDim },
});
