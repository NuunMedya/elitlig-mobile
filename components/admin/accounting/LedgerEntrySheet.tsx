/**
 * Ön Muhasebe kayıt formu — web tools/Ledger.js EntryForm.
 *
 * KDV dahil tutar + KDV oranı (matrah/KDV canlı önizleme), açıklama,
 * kategori ve cari (öneri çipleriyle "seçin ya da yazın"), işlem tarihi,
 * ödeme yöntemi, hesap (kasa/banka), durum (tahsil edildi / tahsil edilecek),
 * bekleyende vade, belge no, not. Yeni kayıtta "Kaydet ve yeni" tarih,
 * kategori, yöntem ve hesabı korur.
 */

import React from "react";

import { type FieldDef, type FormValues } from "@/components/admin";
import {
  LEDGER_METHODS,
  LEDGER_STATUS_BY_TYPE,
  PRESET_CATEGORIES,
  VAT_RATES,
  amountInput,
  money,
  parseAmount,
  splitVat,
  todayKey,
  type EntryType,
  type FinanceAccount,
  type LedgerBody,
  type LedgerEntry,
  type LedgerStatus,
} from "@/lib/api/admin/accounting";

import { EditorSheet } from "./EditorSheet";
import { accountOptions } from "./financeSheets";
import { Muted, SuggestChips } from "./parts";

export const blankLedger = (type: EntryType = "expense"): FormValues => ({
  type,
  amount: "",
  vat_rate: "0",
  category: "",
  party: "",
  description: "",
  entry_date: todayKey(),
  due_date: "",
  status: "paid",
  method: "cash",
  document_no: "",
  note: "",
  account_id: "",
});

export const ledgerToForm = (e: LedgerEntry, overrides: Partial<FormValues> = {}): FormValues => ({
  ...blankLedger(e.type),
  ...e,
  amount: amountInput(e.amount),
  vat_rate: String(e.vat_rate ?? 0),
  category: e.category || "",
  party: e.party || "",
  description: e.description || "",
  due_date: e.due_date || "",
  method: e.method || "cash",
  document_no: e.document_no || "",
  note: e.note || "",
  account_id: e.account_id ? String(e.account_id) : "",
  ...overrides,
});

const s = (v: unknown) => (v == null ? "" : String(v));

export function LedgerEntrySheet({
  visible,
  onClose,
  initial,
  editingId,
  categories,
  parties,
  accounts,
  accountName,
  onSubmit,
  onDelete,
}: {
  visible: boolean;
  onClose: () => void;
  initial: FormValues;
  editingId?: number | null;
  categories: string[];
  parties: string[];
  accounts: FinanceAccount[];
  accountName: (id: string) => string;
  onSubmit: (body: LedgerBody, editingId?: number | null) => Promise<unknown>;
  onDelete?: () => void;
}) {
  const editing = Boolean(editingId);
  const options = accountOptions(accounts);
  const current = s(initial.account_id);
  if (current && !options.some((o) => o.value === current)) options.push({ value: current, label: accountName(current), hint: "" });

  const fields = (v: FormValues): FieldDef[] => {
    const type = (v.type as EntryType) || "expense";
    const labels = LEDGER_STATUS_BY_TYPE[type];
    return [
      {
        key: "type",
        label: "Kayıt türü",
        kind: "segment",
        options: [{ value: "income", label: "Gelir" }, { value: "expense", label: "Gider" }],
        onChange: () => ({ category: "" }),
      },
      { key: "amount", label: "Tutar (KDV dahil, ₺)", kind: "money", required: true, placeholder: "0,00" },
      { key: "vat_rate", label: "KDV", kind: "segment", options: VAT_RATES.map((r) => ({ value: String(r), label: `%${r}` })) },
      { key: "description", label: "Açıklama", kind: "text", maxLength: 255, placeholder: type === "income" ? "Ör. Ekim ayı saha kirası tahsilatı" : "Ör. 12. hafta hakem ödemesi" },
      { key: "category", label: "Kategori", kind: "text", maxLength: 60, placeholder: "Aşağıdan seçin ya da yazın" },
      { key: "party", label: "Cari (kişi / firma)", kind: "text", maxLength: 120, placeholder: "Ör. Yıldız FK" },
      { key: "entry_date", label: "İşlem tarihi", kind: "date", required: true },
      { key: "method", label: "Ödeme yöntemi", kind: "select", options: LEDGER_METHODS.map((m) => ({ value: m.key, label: m.label })) },
      { key: "account_id", label: "Hesap (kasa / banka)", kind: "select", clearable: true, hint: "Seçilmezse ödeme yöntemine bağlı hesaba işlenir.", options },
      { key: "status", label: "Durum", kind: "segment", options: [{ value: "paid", label: labels.paid }, { value: "pending", label: labels.pending }] },
      { key: "due_date", label: "Vade tarihi", kind: "date", clearable: true, hidden: (x) => x.status !== "pending" },
      { key: "document_no", label: "Belge / fatura no", kind: "text", maxLength: 60 },
      { key: "note", label: "Not", kind: "multiline" },
    ];
  };

  return (
    <EditorSheet
      visible={visible}
      onClose={onClose}
      title={editing ? "Kaydı düzenle" : "Yeni kayıt"}
      initial={initial}
      fields={fields}
      extra={(v, set) => {
        const type = (v.type as EntryType) || "expense";
        const vat = splitVat(v.amount, Number(v.vat_rate));
        const cats = [...new Set([...PRESET_CATEGORIES[type], ...categories])];
        return (
          <>
            {Number(v.vat_rate) > 0 && vat.gross > 0 ? (
              <Muted>
                Matrah {money(vat.net)} + KDV {money(vat.vat)}
              </Muted>
            ) : null}
            <SuggestChips label="Kategori önerileri" items={cats} value={s(v.category)} onPick={(c) => set({ category: c })} />
            <SuggestChips label="Cari önerileri" items={parties.slice(0, 30)} value={s(v.party)} onPick={(p) => set({ party: p })} />
          </>
        );
      }}
      validate={(v) => {
        const amount = parseAmount(v.amount);
        if (amount == null || Number.isNaN(amount) || !(amount > 0)) return "Sıfırdan büyük bir tutar girin.";
        return null;
      }}
      secondary={editing && onDelete ? { label: "Sil", danger: true, onPress: onDelete } : undefined}
      saveAndNew={
        editing
          ? undefined
          : {
              reset: (v) => ({ ...blankLedger(v.type as EntryType), entry_date: v.entry_date, category: v.category, method: v.method, account_id: v.account_id }),
            }
      }
      onSubmit={async (v) => {
        const body: LedgerBody = {
          type: v.type as EntryType,
          amount: parseAmount(v.amount) as number,
          vat_rate: Number(v.vat_rate) || 0,
          category: s(v.category),
          party: s(v.party),
          description: s(v.description),
          entry_date: s(v.entry_date) || todayKey(),
          due_date: v.status === "pending" ? s(v.due_date) || null : null,
          status: v.status as LedgerStatus,
          method: s(v.method) || "cash",
          document_no: s(v.document_no),
          note: s(v.note),
          account_id: v.account_id ? Number(v.account_id) : null,
        };
        await onSubmit(body, editingId);
      }}
    />
  );
}
