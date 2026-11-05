/**
 * Bütçe: projenin gelir / gider kalemleri (tahmin → bekliyor → ödendi); her
 * kalem bir muhasebe hesabına bağlanır. "Ödendi" / "Tahsil edildi"
 * işaretlenince tutar hesabın bakiyesine işlenir (Muhasebe → Hesaplar).
 * Adımın aracı olarak açıldığında yalnız o adımın kalemleri görünür, yeni
 * kalem adıma bağlanır.
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { ActionSheet, FormSheet, Panel, RecordCard, confirmAction, type FieldDef, type FormValues } from "@/components/admin";
import { Button, ErrorState, MetricGrid, MetricTile, SegmentedControl, SkeletonListRow } from "@/components/ui";
import { errorText } from "@/lib/admin/errors";
import { formatDate, formatMoney } from "@/lib/admin/format";
import { ENTRY_STATUS_META, entryStatusLabel, entryTotals, isoDate, moneyText, paidVerb, parseAmount } from "@/lib/admin/projectUtils";
import {
  createEntry,
  getProjectFinance,
  projectKeys,
  removeEntry,
  updateEntry,
  type EntryInput,
  type EntryStatus,
  type EntryType,
  type FinanceEntry,
} from "@/lib/api/admin/projects";
import { colors, radius, space, textScale, type } from "@/theme";

import { useProject } from "./ProjectContext";
import { Pill } from "./ui";

const STATUS_FILTERS: { key: "" | EntryStatus; label: string }[] = [
  { key: "", label: "Tümü" },
  { key: "planned", label: "Tahmin" },
  { key: "pending", label: "Bekliyor" },
  { key: "paid", label: "Gerçekleşen" },
];

export function Budget({ stepId = null }: { stepId?: number | null }) {
  const router = useRouter();
  const { id, data: project, settings, canEdit, notify, ops } = useProject();
  const queryClient = useQueryClient();
  const fin = useQuery({ queryKey: projectKeys.finance(id), queryFn: () => getProjectFinance(id) });
  const [status, setStatus] = useState<"" | EntryStatus>("");
  const [editing, setEditing] = useState<{ entry?: FinanceEntry; type: EntryType } | null>(null);
  const [menuFor, setMenuFor] = useState<FinanceEntry | null>(null);
  const data = fin.data;
  const editable = canEdit && data?.can_edit !== false;
  const step = stepId ? project.steps.find((s) => s.id === stepId) : null;

  const scoped = useMemo(() => (data?.items || []).filter((e) => !stepId || e.step_id === stepId), [data, stepId]);
  const totals = useMemo(() => (stepId ? entryTotals(scoped) : data?.totals || entryTotals(scoped)), [stepId, scoped, data]);
  const shown = scoped.filter((e) => !status || e.status === status);
  const income = shown.filter((e) => e.type === "income");
  const expense = shown.filter((e) => e.type === "expense");
  const defaultAccount = data?.accounts?.find((a) => a.id === data.default_account_id);

  const changed = () => {
    void queryClient.invalidateQueries({ queryKey: projectKeys.finance(id) });
    void ops.reload();
  };
  const markPaid = async (e: FinanceEntry) => {
    try {
      const res = await updateEntry(id, e.id, { status: "paid" });
      const name = res?.item?.account_name || e.account_name;
      notify(name ? `Hesaba işlendi: ${name}` : `${paidVerb(e.type)} olarak işaretlendi (hesap seçilmediği için bakiyeye işlenmedi).`);
      changed();
    } catch (err) {
      notify(errorText(err, "Kayıt güncellenemedi."), "danger");
    }
  };
  const remove = async (e: FinanceEntry) => {
    const ok = await confirmAction({
      title: "Bütçe kalemi silinsin mi?",
      message: `"${e.description || e.category || "Kalem"}" silinecek.${e.status === "paid" && e.account_id ? " Hesabın bakiyesinden de düşer." : ""}`,
      confirmLabel: "Sil",
      destructive: true,
    });
    if (!ok) return;
    try {
      await removeEntry(id, e.id);
      notify("Bütçe kalemi silindi.");
      changed();
    } catch (err) {
      notify(errorText(err, "Silinemedi."), "danger");
    }
  };

  if (fin.isLoading) return <View style={styles.wrap}>{[0, 1, 2].map((i) => <SkeletonListRow key={i} />)}</View>;
  if (!data) return <ErrorState error={fin.error} onRetry={() => void fin.refetch()} variant="inline" />;

  const sum = (items: FinanceEntry[]) => items.filter((e) => e.status !== "cancelled").reduce((n, e) => n + (Number(e.effective) || 0), 0);
  const list = (items: FinanceEntry[], kind: EntryType) =>
    !items.length ? (
      <Text style={styles.muted} {...textScale.long}>
        {status ? "Bu durumda kalem yok." : kind === "income" ? "Henüz gelir kalemi yok (sponsorluk, katılım ücreti, bilet…)." : "Henüz gider kalemi yok (tesis, ödül, ekipman…). Tedarik görüşmesi tamamlanınca buraya yazılır."}
      </Text>
    ) : (
      items.map((e) => {
        const st = ENTRY_STATUS_META[e.status] || ENTRY_STATUS_META.pending;
        const open = e.status === "planned" || e.status === "pending";
        const sub = [e.lead_name, e.step_title && `Adım: ${e.step_title}`, e.category, e.party, e.account_name || (e.account_id ? `Hesap #${e.account_id}` : "Hesap seçilmedi"), e.due_date && open ? `Vade ${formatDate(e.due_date, false)}` : null, e.document_no]
          .filter(Boolean)
          .join(" · ");
        const can = editable && e.can_edit !== false;
        return (
          <RecordCard
            key={e.id}
            icon={e.type === "income" ? "trending-up" : "trending-down"}
            iconTone={e.type === "income" ? "win" : "danger"}
            title={e.description || e.category || (e.type === "income" ? "Gelir" : "Gider")}
            subtitle={sub || null}
            meta={formatDate(e.status === "paid" ? e.paid_date || e.entry_date : e.entry_date)}
            value={`${e.type === "income" ? "+" : "−"}${formatMoney(e.effective)}${e.amount == null && e.estimate != null ? " (tahmini)" : ""}`}
            valueTone={e.status === "cancelled" ? "neutral" : e.type === "income" ? "win" : "danger"}
            muted={e.status === "cancelled"}
            onPress={can ? () => setMenuFor(e) : undefined}
          >
            <View style={styles.cardFoot}>
              <Pill label={entryStatusLabel(e.status, e.type)} color={st.color} icon={st.icon} />
              {open && can ? <Button label={paidVerb(e.type)} icon="checkmark" variant="ghost" size="sm" onPress={() => void markPaid(e)} /> : null}
            </View>
          </RecordCard>
        );
      })
    );

  return (
    <View style={styles.wrap}>
      <MetricGrid columns={2}>
        <MetricTile label="Tahmini net" value={formatMoney(totals.estimate_net, true)} hint={`Gelir ${formatMoney(totals.estimate_income, true)} − gider ${formatMoney(totals.estimate_expense, true)}`} tone="brand" />
        <MetricTile label="Gerçekleşen net" value={formatMoney(totals.paid_net, true)} hint="hesaplara işlenen" tone={totals.paid_net < 0 ? "danger" : "win"} />
        <MetricTile label="Tahmini gelir" value={formatMoney(totals.estimate_income, true)} hint={`${formatMoney(totals.paid_income, true)} tahsil edildi`} />
        <MetricTile label="Tahmini gider" value={formatMoney(totals.estimate_expense, true)} hint={`${formatMoney(totals.paid_expense, true)} ödendi`} />
        <MetricTile label="Tahsil edilecek" value={formatMoney(totals.open_income, true)} hint={`bekleyen ${formatMoney(totals.pending_income, true)} · tahmin ${formatMoney(totals.planned_income, true)}`} />
        <MetricTile label="Ödenecek" value={formatMoney(totals.open_expense, true)} hint={`bekleyen ${formatMoney(totals.pending_expense, true)} · tahmin ${formatMoney(totals.planned_expense, true)}`} tone={totals.pending_expense > 0 ? "warn" : "neutral"} />
      </MetricGrid>
      <SegmentedControl items={STATUS_FILTERS} value={status} onChange={setStatus} size="sm" />
      {step ? <Pill label={`Adım: ${step.title}`} color={project.item.color} icon="git-branch-outline" /> : null}
      <Text style={styles.muted} {...textScale.dense}>{defaultAccount ? `Varsayılan hesap: ${defaultAccount.name}` : "Varsayılan hesap seçilmedi"}</Text>
      {editable ? (
        <View style={styles.actions}>
          <Button label="Gelir ekle" icon="add" variant="secondary" size="sm" onPress={() => setEditing({ type: "income" })} />
          <Button label="Gider ekle" icon="remove" size="sm" onPress={() => setEditing({ type: "expense" })} />
        </View>
      ) : null}
      {!data.accounts?.length && editable ? (
        <View style={styles.notice}>
          <Text style={styles.noticeText} {...textScale.long}>
            Kayıt girebileceğiniz bir muhasebe hesabı yok. Kalemler yine tutulur; "Ödendi" olunca bakiyeye işlenmesi için Muhasebe'de bir Ortak / proje hesabı açın ya da hesaba yetki isteyin.
          </Text>
          <Button label="Muhasebe" variant="ghost" size="sm" onPress={() => router.push("/yonetim/araclar/muhasebe" as never)} />
        </View>
      ) : null}

      <Panel title={`Gelirler · ${income.length} · ${formatMoney(sum(income), true)}`}>
        <View style={styles.list}>{list(income, "income")}</View>
      </Panel>
      <Panel title={`Giderler · ${expense.length} · ${formatMoney(sum(expense), true)}`}>
        <View style={styles.list}>{list(expense, "expense")}</View>
      </Panel>
      <Text style={styles.muted} {...textScale.long}>
        Tahmin: bütçe öngörüsü · Bekliyor: kesinleşti, ödeme bekleniyor · Ödendi / tahsil edildi: hesabın bakiyesine işlendi.
      </Text>

      <ActionSheet
        visible={menuFor != null}
        onClose={() => setMenuFor(null)}
        title={menuFor?.description || menuFor?.category || "Kalem"}
        actions={
          menuFor
            ? [
                { label: paidVerb(menuFor.type), icon: "checkmark-circle-outline", hidden: !(menuFor.status === "planned" || menuFor.status === "pending"), onPress: () => void markPaid(menuFor) },
                { label: "Düzenle", icon: "create-outline", onPress: () => setEditing({ entry: menuFor, type: menuFor.type }) },
                { label: "Sil", icon: "trash-outline", danger: true, onPress: () => void remove(menuFor) },
              ]
            : []
        }
      />
      <EntrySheet
        editing={editing}
        onClose={() => setEditing(null)}
        accounts={data.accounts || []}
        categories={settings.finance_categories || []}
        defaultAccountId={data.default_account_id}
        stepId={stepId}
        onSubmit={async (body) => {
          const res = editing?.entry ? await updateEntry(id, editing.entry.id, body) : await createEntry(id, body);
          const name = res?.item?.account_name;
          notify(body.status === "paid" && name ? `Hesaba işlendi: ${name}` : editing?.entry ? "Bütçe kalemi güncellendi." : `${body.type === "income" ? "Gelir" : "Gider"} kalemi eklendi.`);
          changed();
        }}
      />
    </View>
  );
}

/** Gelir / gider kaydı formu (web financeUi EntryDialog alanları). */
function EntrySheet({
  editing,
  onClose,
  accounts,
  categories,
  defaultAccountId,
  stepId,
  onSubmit,
}: {
  editing: { entry?: FinanceEntry; type: EntryType } | null;
  onClose: () => void;
  accounts: { id: number; name: string; balance?: number | null }[];
  categories: string[];
  defaultAccountId: number | null;
  stepId: number | null;
  onSubmit: (body: EntryInput) => Promise<void>;
}) {
  const { data } = useProject();
  const entry = editing?.entry;
  const isEdit = Boolean(entry);
  const fields: FieldDef[] = [
    { key: "type", label: "Tür", kind: "segment", options: [{ value: "income", label: "Gelir" }, { value: "expense", label: "Gider" }] },
    { key: "amount", label: "Tutar (₺)", kind: "money", hint: "kesinleşen" },
    { key: "estimate", label: "Tahmini tutar (₺)", kind: "money", hint: "henüz kesin değilse" },
    {
      key: "status",
      label: "Durum",
      kind: "chips",
      options: (["planned", "pending", "paid", ...(isEdit ? ["cancelled"] : [])] as EntryStatus[]).map((s) => ({ value: s, label: ENTRY_STATUS_META[s].label })),
    },
    {
      key: "account_id",
      label: "Hesap",
      kind: "select",
      placeholder: "Hesap seçilmedi (bakiyeye işlenmez)",
      options: accounts.map((a) => ({ value: a.id, label: a.name, hint: a.balance != null ? formatMoney(a.balance) : null })),
      valueLabel: (v) => (v.account_id && !accounts.some((a) => a.id === v.account_id) ? entry?.account_name || `Hesap #${v.account_id}` : null),
    },
    { key: "entry_date", label: "İşlem tarihi", kind: "date" },
    { key: "due_date", label: "Vade", kind: "date" },
    { key: "paid_date", label: "Ödeme / tahsil tarihi", kind: "date", hint: isEdit ? "boşsa bugün" : "boşsa işlem tarihi", hidden: (v) => v.status !== "paid" },
    { key: "category", label: "Kategori", kind: "text", maxLength: 60, hint: categories.length ? categories.slice(0, 5).join(", ") : undefined },
    { key: "party", label: "Cari", kind: "text", hint: "kişi / firma", maxLength: 160 },
    { key: "document_no", label: "Belge / fatura no", kind: "text", maxLength: 60 },
    {
      key: "lead_id",
      label: "Kişi / tedarikçi",
      kind: "select",
      placeholder: "Bağlı değil",
      options: data.leads.map((l) => ({ value: l.id, label: `${l.kind === "supplier" ? "Tedarik · " : ""}${l.company ? `${l.name} · ${l.company}` : l.name}` })),
    },
    { key: "step_id", label: "Adım", kind: "select", placeholder: "Bağlı değil", options: data.steps.map((s) => ({ value: s.id, label: s.title })) },
    { key: "description", label: "Açıklama", kind: "text", maxLength: 255 },
    { key: "note", label: "Not", kind: "multiline" },
  ];
  const initial: FormValues = entry
    ? {
        ...entry,
        amount: moneyText(entry.amount),
        estimate: moneyText(entry.estimate),
        entry_date: entry.entry_date || isoDate(),
      }
    : { type: editing?.type || "income", status: "planned", account_id: defaultAccountId || null, step_id: stepId || null, entry_date: isoDate() };

  return (
    <FormSheet
      visible={editing != null}
      onClose={onClose}
      title={isEdit ? "Kaydı düzenle" : editing?.type === "income" ? "Gelir ekle" : "Gider ekle"}
      fields={fields}
      initial={initial}
      onSubmit={async (v) => {
        const amount = parseAmount(v.amount);
        const estimate = parseAmount(v.estimate);
        if (Number.isNaN(amount) || Number.isNaN(estimate)) throw new Error("Tutar geçersiz.");
        if (!(amount && amount > 0) && !(estimate && estimate > 0)) throw new Error("Tutar ya da tahmini tutar girin.");
        const str = (x: unknown) => (String(x ?? "").trim() || null);
        const body: EntryInput = {
          type: (v.type as EntryType) || "income",
          amount: amount && amount > 0 ? amount : null,
          estimate: estimate && estimate > 0 ? estimate : null,
          status: (v.status as EntryStatus) || "planned",
          entry_date: (v.entry_date as string) || null,
          due_date: (v.due_date as string) || null,
          category: str(v.category),
          party: str(v.party),
          description: str(v.description),
          document_no: str(v.document_no),
          note: str(v.note),
          account_id: v.account_id ? Number(v.account_id) : null,
          lead_id: v.lead_id ? Number(v.lead_id) : null,
          step_id: v.step_id ? Number(v.step_id) : null,
        };
        if (body.status === "paid" && (v.paid_date || (!isEdit && v.entry_date))) body.paid_date = (v.paid_date as string) || (v.entry_date as string);
        await onSubmit(body);
      }}
    />
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  list: { gap: space.sm },
  muted: { ...type.bodySm, color: colors.textTertiary },
  actions: { flexDirection: "row", gap: space.sm, justifyContent: "flex-end" },
  cardFoot: { flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: space.s },
  notice: { gap: space.sm, padding: space.md, backgroundColor: colors.infoDim, borderRadius: radius.md },
  noticeText: { ...type.bodySm, color: colors.textPrimary },
});
