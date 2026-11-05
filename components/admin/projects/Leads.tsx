/**
 * Kişiler (CRM): iki tür görüşme ayrı listelenir —
 *   Müşteri görüşmeleri (satış: aranacaklar → portföy, gelir) ve
 *   Tedarik görüşmeleri (maliyet: fiyat al → karşılaştır → anlaş, gider).
 * Liste ve pano (aşama sütunları; web'deki sürükle-bırak yerine kartı basılı
 * tutup aşama seçilir), süzgeçler (aşama, kaynak / kategori, sorumlu, bugün
 * aranacak / gecikmiş, arama), hızlı ekleme, tablodan ve Rehber'den aktarma,
 * CSV paylaşımı. Her satırda tek dokunuş Ara / WhatsApp.
 * Adımın aracı olarak açıldığında adımın aşamasına süzülü gelir.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { ActionSheet, OptionSheet, RecordCard, SelectField } from "@/components/admin";
import { Badge, Button, Chip, ChipGroup, EmptyState, Input, SegmentedControl, Touchable, withAlpha } from "@/components/ui";
import { formatMoney } from "@/lib/admin/format";
import {
  LEAD_EXPORT,
  LEAD_KINDS,
  SUPPLIER_EXPORT,
  digits,
  isLeadDue,
  isLeadOverdue,
  kindOf,
  matches,
  prettyPhone,
  priceComparison,
  stageOf,
  stagesOf,
  timeAgo,
  toCsv,
  whenLabel,
} from "@/lib/admin/projectUtils";
import type { Lead, LeadKind, LeadStage } from "@/lib/api/admin/projects";
import { colors, radius, space, textScale, type } from "@/theme";

import { DirectoryImportSheet } from "./DirectoryImport";
import { ImportLeadsSheet } from "./ImportSheets";
import { CloseSupplierSheet, LostSheet, WinSheet } from "./LeadDialogs";
import { useProject } from "./ProjectContext";
import { ContactActions, Dot, shareCsv, useChunk } from "./ui";

type DueFilter = "" | "due" | "overdue";

export function Leads({ fixedKind = null, initialStage = "" }: { fixedKind?: LeadKind | null; initialStage?: string }) {
  const { data, settings, canEdit, nav, ops, closed, personName, notify } = useProject();
  const [view, setView] = useState<"list" | "board">("list");
  const [kind, setKind] = useState<LeadKind>(fixedKind || (nav.params.tur === "tedarik" ? "supplier" : "customer"));
  const supplier = kind === "supplier";
  const stages = stagesOf(settings, kind);
  const [stage, setStage] = useState(initialStage && stages.some((x) => x.key === initialStage) ? initialStage : nav.params.asama && stages.some((x) => x.key === nav.params.asama) ? nav.params.asama : "");
  const [source, setSource] = useState("");
  const [owner, setOwner] = useState<number | null>(null);
  const [due, setDue] = useState<DueFilter>(nav.params.takip ? "due" : "");
  const [q, setQ] = useState("");
  const [importing, setImporting] = useState(false);
  const [picking, setPicking] = useState(false);
  const [menu, setMenu] = useState(false);
  const [winning, setWinning] = useState<Lead | null>(null);
  const [losing, setLosing] = useState<Lead | null>(null);
  const [moving, setMoving] = useState<Lead | null>(null);

  // Başka sekmeden süzgeçle gelindiyse (huni, "bugün aranacak") süzgeçleri yeniden kur.
  useEffect(() => {
    if (fixedKind) return;
    const k: LeadKind = nav.params.tur === "tedarik" ? "supplier" : nav.params.tur === "musteri" ? "customer" : kind;
    setKind(k);
    const st = nav.params.asama;
    setStage(st && stagesOf(settings, k).some((x) => x.key === st) ? st : "");
    setDue(nav.params.takip ? "due" : "");
  }, [nav.version]); // eslint-disable-line react-hooks/exhaustive-deps
  // Araç modu (fixedKind / initialStage) değişince bileşen anahtarla yeniden kurulur.

  const switchKind = (k: LeadKind) => {
    setKind(k);
    setStage("");
    setSource("");
  };
  const mine = useMemo(() => data.leads.filter((l) => kindOf(l) === kind), [data.leads, kind]);
  const kindCounts = useMemo(
    () => ({ customer: data.leads.filter((l) => kindOf(l) === "customer").length, supplier: data.leads.filter((l) => kindOf(l) === "supplier").length }),
    [data.leads]
  );
  const counts = useMemo(() => Object.fromEntries(stages.map((x) => [x.key, mine.filter((l) => l.stage === x.key).length])), [stages, mine]);
  const sources = [...new Set([...(supplier ? settings.supplier_categories || [] : settings.lead_sources), ...mine.map((l) => l.source)].filter(Boolean))];
  const owners = [...new Set(mine.map((l) => l.owner_id).filter((x): x is number => Boolean(x)))];
  const filtered = mine.filter(
    (l) =>
      (view === "board" || !stage || l.stage === stage) &&
      (!source || l.source === source) &&
      (!owner || l.owner_id === owner) &&
      (!due || (due === "due" ? isLeadDue(l, closed) : isLeadOverdue(l, closed))) &&
      matches(q, l.name, l.company, l.item, l.phone, digits(l.phone), l.email, l.city, l.note, l.next_action)
  );
  const sorted = useMemo(
    () =>
      [...filtered].sort((a, b) => {
        if (supplier) {
          const it = String(a.item || "~").localeCompare(String(b.item || "~"), "tr");
          if (it) return it;
          const av = a.value == null ? Infinity : Number(a.value);
          const bv = b.value == null ? Infinity : Number(b.value);
          if (av !== bv) return av - bv;
        }
        const ad = a.next_action_at && !closed.has(a.stage) ? new Date(a.next_action_at).getTime() : Infinity;
        const bd = b.next_action_at && !closed.has(b.stage) ? new Date(b.next_action_at).getTime() : Infinity;
        return ad - bd || String(b.updated_at).localeCompare(String(a.updated_at));
      }),
    [filtered, closed, supplier]
  );
  const chunk = useChunk(sorted);
  const bestIds = useMemo(() => new Set(supplier ? mine.map((l) => priceComparison(mine, l)[0]?.id).filter(Boolean) : []), [mine, supplier]);
  const dueCount = mine.filter((l) => isLeadDue(l, closed)).length;
  const overdueCount = mine.filter((l) => isLeadOverdue(l, closed)).length;

  const toStage = (lead: Lead, st: LeadStage) => {
    if (lead.stage === st.key) return;
    if (st.won && (supplier || !lead.portfolio_id)) { setWinning(lead); return; }
    if (st.lost) { setLosing(lead); return; }
    void ops.saveLead(lead.id, { stage: st.key }).then((item) => {
      if (item) notify(`${supplier && lead.company ? lead.company : lead.name} → ${st.label}`);
    });
  };
  const exportCsv = () =>
    void shareCsv(
      `${data.item.name} - ${supplier ? "tedarik" : "kisiler"}`,
      toCsv(supplier ? SUPPLIER_EXPORT(settings, personName) : LEAD_EXPORT(settings, personName), sorted)
    );

  return (
    <View style={styles.wrap}>
      {!fixedKind ? (
        <SegmentedControl
          items={LEAD_KINDS.map((k) => ({ key: k.key, label: `${k.short} ${kindCounts[k.key]}`, icon: k.icon }))}
          value={kind}
          onChange={switchKind}
        />
      ) : null}
      <View style={styles.row}>
        <View style={styles.flex}>
          <SegmentedControl
            items={[
              { key: "", label: "Hepsi" },
              { key: "due", label: `${supplier ? "Bugün" : "Bugün ara"}${dueCount ? ` ${dueCount}` : ""}`, dot: dueCount > 0 },
              { key: "overdue", label: `Gecikmiş${overdueCount ? ` ${overdueCount}` : ""}` },
            ]}
            value={due}
            onChange={(v) => setDue(v as DueFilter)}
            size="sm"
          />
        </View>
        <SegmentedControl
          items={[{ key: "list", label: "Liste", icon: "list-outline" }, { key: "board", label: "Pano", icon: "albums-outline" }]}
          value={view}
          onChange={setView}
          stretch={false}
          size="sm"
        />
      </View>
      <Input variant="search" value={q} onChangeText={setQ} placeholder={supplier ? "Tedarikçi, konu, telefon…" : "Ad, telefon, kurum, not…"} />
      {view === "list" ? (
        <ChipGroup contentPadding={0}>
          <Chip label="Tümü" count={mine.length} size="sm" selected={!stage} onPress={() => setStage("")} />
          {stages.map((x) => (
            <Chip key={x.key} label={x.label} count={counts[x.key] || 0} size="sm" selected={stage === x.key} onPress={() => setStage(stage === x.key ? "" : x.key)} />
          ))}
        </ChipGroup>
      ) : null}
      {sources.length || owners.length > 1 ? (
        <View style={styles.row}>
          {sources.length ? (
            <View style={styles.flex}>
              <SelectField<string>
                value={source || null}
                onChange={(v) => setSource(v || "")}
                placeholder={supplier ? "Tüm kategoriler" : "Tüm kaynaklar"}
                clearable
                icon="pricetags-outline"
                sheetTitle={supplier ? "Kategori" : "Kaynak"}
                options={sources.map((x) => ({ value: x, label: x }))}
              />
            </View>
          ) : null}
          {owners.length > 1 ? (
            <View style={styles.flex}>
              <SelectField<number>
                value={owner}
                onChange={setOwner}
                placeholder="Tüm sorumlular"
                clearable
                icon="person-outline"
                sheetTitle="Sorumlu"
                options={owners.map((o) => ({ value: o, label: personName(o) }))}
              />
            </View>
          ) : null}
        </View>
      ) : null}
      <View style={styles.tools}>
        <Button label="Aktar / paylaş" icon="swap-vertical-outline" variant="secondary" size="sm" onPress={() => setMenu(true)} />
      </View>

      {canEdit ? <QuickAdd key={`${kind}-${stage}`} kind={kind} stage={stage} /> : null}

      {view === "board" ? (
        <Board leads={filtered} stages={stages} kind={kind} onMove={setMoving} />
      ) : !sorted.length ? (
        <EmptyState
          variant="inline"
          icon={supplier ? "car-outline" : "people-outline"}
          title={mine.length ? (supplier ? "Bu süzgeçte tedarikçi yok" : "Bu süzgeçte kişi yok") : supplier ? "Henüz tedarik görüşmesi yok" : "Henüz kişi yok"}
          body={
            mine.length
              ? "Süzgeçleri değiştirin."
              : supplier
                ? "Fiyat alacağınız tedarikçileri (tesis, kupa / madalya, baskı…) ekleyin; teklifleri karşılaştırıp anlaşınca tutar gidere yazılır."
                : "Aranacak kişileri yukarıdan tek tek ekleyin, tablodan aktarın ya da Rehber'den seçin."
          }
          action={canEdit && !mine.length ? { label: "Rehberden ekle", onPress: () => setPicking(true) } : undefined}
          secondaryAction={canEdit && !mine.length ? { label: "Tablodan aktar", onPress: () => setImporting(true) } : undefined}
        />
      ) : (
        <>
          {chunk.shown.map((l) => (supplier ? (
            <SupplierRow key={l.id} lead={l} best={bestIds.has(l.id) && priceComparison(mine, l).length > 1} onMove={() => setMoving(l)} />
          ) : (
            <LeadRow key={l.id} lead={l} onMove={() => setMoving(l)} />
          )))}
          {chunk.more ? <Button label={`${chunk.more} kayıt daha göster`} variant="ghost" onPress={chunk.showMore} /> : null}
          <Text style={styles.foot} {...textScale.dense}>
            {sorted.length} {supplier ? "tedarikçi · konuya ve fiyata göre sıralı" : "kişi · sıralama: sonraki aksiyon tarihi"}
            {nav.toolStep ? " · bu adımın aracından" : ""}
            {canEdit ? " · aşama için basılı tutun" : ""}
          </Text>
        </>
      )}

      <ActionSheet
        visible={menu}
        onClose={() => setMenu(false)}
        title="Aktar ve paylaş"
        actions={[
          { label: "Rehberden ekle", hint: "Rehberim, Elitlig üye rehberi, portföy", icon: "book-outline", hidden: !canEdit, onPress: () => setPicking(true) },
          { label: "Tablodan aktar", hint: "Excel / CSV satırlarını yapıştırın", icon: "clipboard-outline", hidden: !canEdit, onPress: () => setImporting(true) },
          { label: "Listeyi CSV olarak paylaş", icon: "share-outline", disabled: !sorted.length, onPress: exportCsv },
        ]}
      />
      <OptionSheet<string>
        visible={moving != null}
        onClose={() => setMoving(null)}
        title={moving ? `Aşama: ${supplier && moving.company ? moving.company : moving.name}` : "Aşama"}
        value={moving?.stage}
        options={stages.map((s) => ({ value: s.key, label: s.label, hint: s.won ? (supplier ? "Anlaşıldı → gider" : "Kazanıldı → portföy") : s.lost ? (supplier ? "Vazgeçildi" : "Kaybedildi") : null }))}
        onSelect={(v) => {
          const l = moving;
          setMoving(null);
          const st = stages.find((s) => s.key === v);
          if (l && st) setTimeout(() => toStage(l, st), 250);
        }}
      />
      <ImportLeadsSheet visible={importing} onClose={() => setImporting(false)} kind={kind} stage={stage || undefined} />
      <DirectoryImportSheet visible={picking} onClose={() => setPicking(false)} kind={kind} stage={stage || undefined} />
      {kindOf(winning) === "supplier" ? <CloseSupplierSheet lead={winning} onClose={() => setWinning(null)} /> : <WinSheet lead={winning} onClose={() => setWinning(null)} />}
      <LostSheet lead={losing} onClose={() => setLosing(null)} />
    </View>
  );
}

/* --------------------------------- satırlar --------------------------------- */

function LeadRow({ lead, onMove }: { lead: Lead; onMove: () => void }) {
  const { settings, closed, nav, canEdit, personName } = useProject();
  const st = stageOf(settings, lead.stage, "customer");
  const overdue = isLeadOverdue(lead, closed);
  const due = isLeadDue(lead, closed);
  return (
    <RecordCard
      avatar={{ name: lead.name }}
      accentColor={st.color}
      title={lead.name}
      subtitle={[lead.company, lead.title, lead.city].filter(Boolean).join(" · ") || lead.source || prettyPhone(lead.phone) || null}
      meta={
        lead.next_action_at
          ? `${whenLabel(lead.next_action_at)}${lead.next_action ? ` · ${lead.next_action}` : ""}`
          : lead.last_contact_at
            ? `Son temas ${timeAgo(lead.last_contact_at)} · ${lead.contact_count} görüşme`
            : "Görüşülmedi"
      }
      value={lead.value != null ? formatMoney(lead.value, true) : null}
      badges={[
        { label: st.label, tone: "neutral" },
        overdue ? { label: "Gecikti", tone: "danger", icon: "alarm-outline" } : due ? { label: "Bugün", tone: "warn", icon: "notifications-outline" } : null,
        lead.portfolio_id ? { label: "Portföyde", tone: "win", icon: "briefcase-outline" } : null,
        lead.owner_id ? { label: personName(lead.owner_id).split(" ")[0], tone: "neutral", icon: "person-outline" } : null,
      ]}
      onPress={() => nav.openLead(lead.id)}
      onLongPress={canEdit ? onMove : undefined}
      trailing={<ContactActions phone={lead.phone} email={lead.email} name={lead.name} />}
    />
  );
}

function SupplierRow({ lead, best, onMove }: { lead: Lead; best: boolean; onMove: () => void }) {
  const { settings, closed, nav, canEdit } = useProject();
  const st = stageOf(settings, lead.stage, "supplier");
  const overdue = isLeadOverdue(lead, closed);
  const due = isLeadDue(lead, closed);
  return (
    <RecordCard
      avatar={{ name: lead.company || lead.name }}
      accentColor={st.color}
      title={lead.company || lead.name}
      subtitle={[lead.item || "Konu yok", lead.source].filter(Boolean).join(" · ")}
      meta={lead.next_action_at ? `${whenLabel(lead.next_action_at)}${lead.next_action ? ` · ${lead.next_action}` : ""}` : [lead.company ? lead.name : "", prettyPhone(lead.phone)].filter(Boolean).join(" · ") || null}
      value={lead.value != null ? formatMoney(lead.value, true) : "Fiyat yok"}
      valueTone={best ? "win" : "neutral"}
      badges={[
        { label: st.label, tone: "neutral" },
        best ? { label: "En uygun teklif", tone: "win", icon: "ribbon-outline" } : null,
        overdue ? { label: "Gecikti", tone: "danger" } : due ? { label: "Bugün", tone: "warn" } : null,
      ]}
      onPress={() => nav.openLead(lead.id)}
      onLongPress={canEdit ? onMove : undefined}
      trailing={<ContactActions phone={lead.phone} name={lead.company || lead.name} />}
    />
  );
}

/* ----------------------------------- pano ----------------------------------- */

function Board({ leads, stages, kind, onMove }: { leads: Lead[]; stages: LeadStage[]; kind: LeadKind; onMove: (l: Lead) => void }) {
  const { closed, nav, canEdit } = useProject();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.board}>
      {stages.map((s) => {
        const col = leads.filter((l) => l.stage === s.key);
        const value = col.reduce((n, l) => n + (Number(l.value) || 0), 0);
        return (
          <View key={s.key} style={[styles.col, { borderTopColor: s.color }]}>
            <View style={styles.colHead}>
              <Dot color={s.color} size={8} />
              <Text style={styles.colTitle} numberOfLines={1} {...textScale.dense}>{s.label}</Text>
              <Badge label={col.length} tone="neutral" size="xs" />
              {s.won ? <Ionicons name={kind === "supplier" ? "hand-left-outline" : "trophy-outline"} size={14} color={s.color} /> : null}
            </View>
            {value > 0 ? <Text style={styles.colValue} {...textScale.badge}>{formatMoney(value, true)}</Text> : null}
            {col.map((l) => {
              const overdue = isLeadOverdue(l, closed);
              return (
                <Touchable
                  key={l.id}
                  feedback="card"
                  onPress={() => nav.openLead(l.id)}
                  onLongPress={canEdit ? () => onMove(l) : undefined}
                  style={[styles.lcard, { borderLeftColor: withAlpha(s.color, 0.7) }]}
                  accessibilityRole="button"
                  accessibilityLabel={l.name}
                >
                  <Text style={styles.lname} numberOfLines={2} {...textScale.dense}>{kind === "supplier" ? l.company || l.name : l.name}</Text>
                  {kind === "supplier" ? (
                    l.item || l.source ? <Text style={styles.small} numberOfLines={1} {...textScale.dense}>{[l.item, l.source].filter(Boolean).join(" · ")}</Text> : null
                  ) : l.company || l.city ? (
                    <Text style={styles.small} numberOfLines={1} {...textScale.dense}>{[l.company, l.city].filter(Boolean).join(" · ")}</Text>
                  ) : null}
                  {l.next_action_at ? (
                    <Text style={[styles.small, overdue ? styles.alert : null]} numberOfLines={1} {...textScale.dense}>
                      {whenLabel(l.next_action_at)}{l.next_action ? ` · ${l.next_action}` : ""}
                    </Text>
                  ) : null}
                  <View style={styles.lfoot}>
                    {l.contact_count ? <Text style={styles.tiny} {...textScale.badge}>{l.contact_count} görüşme</Text> : null}
                    {l.value != null ? <Text style={styles.lvalue} {...textScale.dense}>{formatMoney(l.value, true)}</Text> : null}
                    <View style={styles.flex} />
                    <ContactActions phone={l.phone} name={l.name} />
                  </View>
                </Touchable>
              );
            })}
            {!col.length ? <Text style={styles.small} {...textScale.dense}>Boş</Text> : null}
          </View>
        );
      })}
    </ScrollView>
  );
}

/* ------------------------------- hızlı ekleme ------------------------------- */

function QuickAdd({ stage, kind }: { stage: string; kind: LeadKind }) {
  const { ops, settings, notify, nav } = useProject();
  const stages = stagesOf(settings, kind);
  const supplier = kind === "supplier";
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [company, setCompany] = useState("");
  const [item, setItem] = useState("");
  const [st, setSt] = useState(stage || stages[0]?.key || "");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!name.trim()) return;
    setBusy(true);
    const body: Partial<Lead> = supplier
      ? { kind, name: name.trim(), phone, item: item.trim() || "", stage: st }
      : { name: name.trim(), phone, company, stage: st };
    const created = await ops.addLead(body);
    setBusy(false);
    if (created) {
      setName("");
      setPhone("");
      setCompany("");
      notify(`${created.name} eklendi.`, "success", { label: "Aç", onPress: () => nav.openLead(created.id) });
    }
  };
  if (!open) {
    return <Button label={supplier ? "Tedarikçi ekle" : "Kişi ekle"} icon="person-add-outline" variant="secondary" onPress={() => setOpen(true)} />;
  }
  return (
    <View style={styles.quick}>
      <Input size="sm" value={name} onChangeText={setName} placeholder={supplier ? "Tedarikçi / firma" : "Ad soyad / kurum"} autoFocus />
      <Input size="sm" value={phone} onChangeText={setPhone} placeholder="Telefon" keyboardType="phone-pad" />
      {supplier ? (
        <>
          <Input size="sm" value={item} onChangeText={setItem} placeholder="Konu (ör. Kupa / madalya)" />
          {(settings.supplier_categories || []).length ? (
            <ChipGroup contentPadding={0}>
              {(settings.supplier_categories || []).map((c) => <Chip key={c} label={c} size="sm" selected={item === c} onPress={() => setItem(c)} />)}
            </ChipGroup>
          ) : null}
        </>
      ) : (
        <Input size="sm" value={company} onChangeText={setCompany} placeholder="Kurum / takım" />
      )}
      <SelectField<string> value={st} onChange={(v) => setSt(v || stages[0]?.key || "")} sheetTitle="Aşama" icon="flag-outline" options={stages.map((s) => ({ value: s.key, label: s.label }))} />
      <View style={styles.quickBar}>
        <Button label="Kapat" variant="ghost" size="sm" onPress={() => setOpen(false)} />
        <View style={styles.flex} />
        <Button label="Ekle" size="sm" onPress={() => void submit()} loading={busy} disabled={!name.trim()} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  flex: { flex: 1 },
  row: { flexDirection: "row", gap: space.sm, alignItems: "center" },
  tools: { flexDirection: "row", justifyContent: "flex-end" },
  foot: { ...type.caption, color: colors.textTertiary, textAlign: "center" },
  small: { ...type.bodySm, color: colors.textSecondary },
  tiny: { ...type.meta, color: colors.textTertiary },
  alert: { color: colors.danger },
  board: { gap: space.sm, paddingRight: space.lg },
  col: { width: 250, gap: space.s, padding: space.sm, borderRadius: radius.lg, backgroundColor: colors.surface2, borderTopWidth: 3 },
  colHead: { flexDirection: "row", alignItems: "center", gap: space.xs },
  colTitle: { ...type.label, color: colors.textPrimary, flex: 1 },
  colValue: { ...type.meta, color: colors.textTertiary },
  lcard: { gap: space.xxs, padding: space.sm, borderRadius: radius.md, backgroundColor: colors.surface1, borderLeftWidth: 3 },
  lname: { ...type.label, color: colors.textPrimary },
  lfoot: { flexDirection: "row", alignItems: "center", gap: space.s, marginTop: space.xxs },
  lvalue: { ...type.labelSm, color: colors.textPrimary },
  quick: { gap: space.sm, padding: space.md, borderRadius: radius.xl, backgroundColor: colors.surface1 },
  quickBar: { flexDirection: "row", alignItems: "center" },
});
