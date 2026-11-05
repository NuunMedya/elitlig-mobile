/**
 * Hesaplar ve Virman pencereleri — web tools/accounting/financeUi.js +
 * Accounts.js (EntryDialog, TransferDialog, AccountEditor, AccessDialog,
 * AclEditor, EntryList) mobil karşılıkları.
 *
 *   FinanceEntrySheet — hesap hareketi (gelir/gider; tahmin/bekliyor/ödendi/iptal)
 *   TransferSheet     — hesaplar arası aktarma, önizlemeli bakiye
 *   AccountSheet      — hesap aç / düzenle (kapsam, il, tür, bağlı yöntem, açılış)
 *   AccessSheet       — kimler görür + hesaba özel yetkiler (AclEditor)
 *   FinanceEntryCard  — hareket satırı (ödendi işaretle, düzenle, sil)
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import React, { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { RecordCard, SelectField, SegmentField, type FieldDef, type FormValues } from "@/components/admin";
import { BottomSheet, Button, Input, SegmentedControl, Touchable } from "@/components/ui";
import { errorText } from "@/lib/admin/errors";
import { formatDate } from "@/lib/admin/format";
import {
  ACCOUNT_COLORS,
  ENTRY_STATUS,
  LEVELS,
  SCOPES,
  SCOPE_BOOK,
  SCOPE_LABEL,
  accessOptions,
  amountInput,
  canManageAccount,
  cleanAcl,
  money,
  parseAmount,
  paidVerb,
  statusLabel,
  todayKey,
  type AccessLevel,
  type AccountBody,
  type AccountScope,
  type AclEntry,
  type EntryStatus,
  type FinanceAccount,
  type FinanceAccountsResponse,
  type FinanceEntry,
  type FinanceEntryBody,
  type TransferBody,
  type FinanceTransfer,
} from "@/lib/api/admin/accounting";
import { colors, hairline, radius, space, textScale, type } from "@/theme";

import { EditorSheet } from "./EditorSheet";
import { Muted, Note } from "./parts";

const str = (v: unknown) => (v == null ? "" : String(v));

/** Kapsama göre gruplanmış hesap seçenekleri. */
export function accountOptions(accounts: FinanceAccount[], filter: (a: FinanceAccount) => boolean = () => true) {
  return SCOPES.flatMap((scope) =>
    accounts
      .filter((a) => a.scope === scope && !a.archived && filter(a))
      .map((a) => ({
        value: String(a.id),
        label: `${a.name}${a.city_name ? ` · ${a.city_name}` : ""}`,
        hint: `${SCOPE_LABEL[scope]} · ${money(a.balance)}`,
      }))
  );
}

/* ------------------------------ hareket formu ------------------------------ */

export function FinanceEntrySheet({
  visible,
  onClose,
  entry,
  defaults,
  accounts,
  title,
  onSubmit,
}: {
  visible: boolean;
  onClose: () => void;
  entry?: FinanceEntry | null;
  defaults?: Partial<FinanceEntryBody>;
  /** Kayıt girilebilen hesaplar. */
  accounts: FinanceAccount[];
  title?: string;
  onSubmit: (body: FinanceEntryBody, editing: boolean) => Promise<unknown>;
}) {
  const editing = Boolean(entry?.id);
  const initial: FormValues = entry
    ? {
        ...entry,
        amount: amountInput(entry.amount),
        estimate: amountInput(entry.estimate),
        account_id: entry.account_id ? String(entry.account_id) : "",
      }
    : {
        type: defaults?.type || "income",
        amount: "",
        estimate: "",
        status: defaults?.status || "pending",
        entry_date: todayKey(),
        due_date: "",
        paid_date: "",
        category: "",
        party: "",
        description: "",
        document_no: "",
        note: "",
        account_id: defaults?.account_id ? String(defaults.account_id) : "",
      };
  const options = accountOptions(accounts);
  if (entry?.account_id && !options.some((o) => o.value === String(entry.account_id))) {
    options.push({ value: String(entry.account_id), label: entry.account_name || `Hesap #${entry.account_id}`, hint: "" });
  }

  const fields = (v: FormValues): FieldDef[] => {
    const income = v.type === "income";
    const statuses: EntryStatus[] = ["planned", "pending", "paid", ...(editing ? (["cancelled"] as EntryStatus[]) : [])];
    return [
      { key: "type", label: "Tür", kind: "segment", options: [{ value: "income", label: "Gelir" }, { value: "expense", label: "Gider" }] },
      { key: "amount", label: "Tutar (₺)", kind: "money", placeholder: "0,00", hint: "kesinleşen" },
      { key: "estimate", label: "Tahmini tutar (₺)", kind: "money", placeholder: "0,00", hint: "henüz kesin değilse" },
      { key: "status", label: "Durum", kind: "chips", required: true, options: statuses.map((s) => ({ value: s, label: statusLabel(s, String(v.type)) })) },
      { key: "account_id", label: "Hesap", kind: "select", required: true, options },
      { key: "entry_date", label: "İşlem tarihi", kind: "date" },
      { key: "due_date", label: income ? "Tahsil vadesi" : "Ödeme vadesi", kind: "date", clearable: true },
      { key: "paid_date", label: income ? "Tahsil tarihi" : "Ödeme tarihi", kind: "date", clearable: true, hint: editing ? "boşsa bugün" : "boşsa işlem tarihi", hidden: (x) => x.status !== "paid" },
      { key: "category", label: "Kategori", kind: "text", maxLength: 60 },
      { key: "party", label: "Cari (kişi / firma)", kind: "text", maxLength: 160, placeholder: "Ör. Kaya Spor" },
      { key: "document_no", label: "Belge / fatura no", kind: "text", maxLength: 60 },
      { key: "description", label: "Açıklama", kind: "text", maxLength: 255, placeholder: income ? "Ör. Ana sponsor 1. taksit" : "Ör. Kupa ve madalya siparişi" },
      { key: "note", label: "Not", kind: "multiline" },
    ];
  };

  return (
    <EditorSheet
      visible={visible}
      onClose={onClose}
      title={title || (editing ? "Kaydı düzenle" : initial.type === "income" ? "Gelir ekle" : "Gider ekle")}
      initial={initial}
      fields={fields}
      extra={(v) => (
        <Muted>
          {v.status === "paid"
            ? v.account_id
              ? "Kaydedince hesabın bakiyesine işlenir."
              : "Hesap seçilmezse bakiyeye işlenmez."
            : v.status === "planned"
              ? "Bütçe tahmini; bakiyeyi etkilemez."
              : "Bekleyen alacak / borç; ödendi işaretlenince bakiyeye işlenir."}
        </Muted>
      )}
      validate={(v) => {
        const amount = parseAmount(v.amount);
        const estimate = parseAmount(v.estimate);
        if (Number.isNaN(amount) || Number.isNaN(estimate)) return "Tutar geçersiz.";
        if (!((amount ?? 0) > 0) && !((estimate ?? 0) > 0)) return "Tutar ya da tahmini tutar girin.";
        return null;
      }}
      onSubmit={async (v) => {
        const amount = parseAmount(v.amount) ?? 0;
        const estimate = parseAmount(v.estimate) ?? 0;
        const body: FinanceEntryBody = {
          type: v.type as FinanceEntryBody["type"],
          amount: amount > 0 ? amount : null,
          estimate: estimate > 0 ? estimate : null,
          status: v.status as EntryStatus,
          entry_date: str(v.entry_date) || null,
          due_date: str(v.due_date) || null,
          category: str(v.category).trim() || null,
          party: str(v.party).trim() || null,
          description: str(v.description).trim() || null,
          document_no: str(v.document_no).trim() || null,
          note: str(v.note).trim() || null,
          account_id: v.account_id ? Number(v.account_id) : null,
        };
        // Ödendi girilen yeni kayıtta ödeme tarihi boşsa işlem tarihi sayılır.
        if (v.status === "paid" && (v.paid_date || (!editing && v.entry_date))) body.paid_date = str(v.paid_date) || str(v.entry_date);
        await onSubmit(body, editing);
      }}
    />
  );
}

/** Hareket satırı. */
export function FinanceEntryCard({
  entry,
  showAccount,
  onPaid,
  onEdit,
  onRemove,
}: {
  entry: FinanceEntry;
  showAccount?: boolean;
  onPaid?: (e: FinanceEntry) => void;
  onEdit?: (e: FinanceEntry) => void;
  onRemove?: (e: FinanceEntry) => void;
}) {
  const st = ENTRY_STATUS[entry.status] || ENTRY_STATUS.pending;
  const open = entry.status === "planned" || entry.status === "pending";
  const editable = entry.can_edit !== false;
  const sub = [
    entry.category,
    entry.party,
    showAccount ? entry.account_name || (entry.account_id ? `Hesap #${entry.account_id}` : "Hesap seçilmedi") : null,
    entry.due_date && open ? `Vade ${formatDate(entry.due_date)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const date = entry.status === "paid" ? entry.paid_date || entry.entry_date : entry.entry_date;
  return (
    <RecordCard
      title={entry.description || entry.category || (entry.type === "income" ? "Gelir" : "Gider")}
      subtitle={sub || null}
      meta={`${formatDate(date)}${entry.amount == null && entry.estimate != null ? " · tahmini" : ""}`}
      icon={entry.type === "income" ? "trending-up" : "trending-down"}
      iconTone={entry.type === "income" ? "win" : "danger"}
      badges={[{ label: statusLabel(entry.status, entry.type), tone: st.tone, icon: st.icon }]}
      value={`${entry.type === "income" ? "+" : "−"}${money(entry.effective)}`}
      valueTone={entry.status === "cancelled" ? "neutral" : entry.type === "income" ? "win" : "danger"}
      muted={entry.status === "cancelled"}
      onPress={editable && onEdit ? () => onEdit(entry) : undefined}
      onLongPress={editable && onRemove ? () => onRemove(entry) : undefined}
    >
      {open && editable && onPaid ? (
        <View style={styles.inlineAction}>
          <Button label={paidVerb(entry.type)} icon="checkmark" size="sm" variant="secondary" onPress={() => onPaid(entry)} />
        </View>
      ) : null}
    </RecordCard>
  );
}

/* --------------------------------- virman --------------------------------- */

export function TransferSheet({
  visible,
  onClose,
  accounts,
  transfer,
  defaults,
  onSubmit,
}: {
  visible: boolean;
  onClose: () => void;
  accounts: FinanceAccount[];
  transfer?: FinanceTransfer | null;
  defaults?: { from?: number; to?: number };
  onSubmit: (body: TransferBody, message: string) => Promise<unknown>;
}) {
  const manageable = accounts.filter((a) => canManageAccount(a) && !a.archived);
  const find = (id: unknown) => accounts.find((a) => String(a.id) === String(id));
  return (
    <EditorSheet
      visible={visible}
      onClose={onClose}
      title={transfer ? "Virmanı düzenle" : "Hesaplar arası aktarma (virman)"}
      submitLabel="Aktar"
      initial={{
        from: str(transfer?.from_account_id || defaults?.from || ""),
        to: str(transfer?.to_account_id || defaults?.to || ""),
        amount: transfer ? amountInput(transfer.amount) : "",
        date: transfer?.transfer_date || todayKey(),
        note: transfer?.note || "",
      }}
      fields={(v) => [
        { key: "from", label: "Kaynak hesap", kind: "select", required: true, options: accountOptions(manageable, (a) => String(a.id) !== str(v.to)) },
        { key: "to", label: "Hedef hesap", kind: "select", required: true, options: accountOptions(manageable, (a) => String(a.id) !== str(v.from)) },
        { key: "amount", label: "Tutar (₺)", kind: "money", required: true, placeholder: "0,00" },
        { key: "date", label: "Tarih", kind: "date", required: true },
        { key: "note", label: "Açıklama", kind: "text", placeholder: "örn. Kasım il payı merkeze" },
      ]}
      extra={(v) => {
        const from = find(v.from);
        const to = find(v.to);
        const amount = parseAmount(v.amount);
        if (!from || !to || !amount || !(amount > 0)) return null;
        return (
          <View style={styles.preview}>
            <PreviewSide name={from.name} before={from.balance} after={from.balance - amount} />
            <Ionicons name="arrow-forward" size={18} color={colors.textTertiary} />
            <PreviewSide name={to.name} before={to.balance} after={to.balance + amount} />
          </View>
        );
      }}
      validate={(v) => {
        const amount = parseAmount(v.amount);
        if (!amount || Number.isNaN(amount) || amount <= 0) return "Sıfırdan büyük bir tutar girin.";
        if (v.from === v.to) return "Kaynak ve hedef hesap farklı olmalı.";
        return null;
      }}
      onSubmit={async (v) => {
        const amount = parseAmount(v.amount) as number;
        const from = find(v.from);
        const to = find(v.to);
        await onSubmit(
          { from_account_id: Number(v.from), to_account_id: Number(v.to), amount, date: str(v.date), note: str(v.note) || null },
          `${from?.name ?? "Kaynak"} → ${to?.name ?? "Hedef"}: ${money(amount)} aktarıldı.`
        );
      }}
    />
  );
}

function PreviewSide({ name, before, after }: { name: string; before: number; after: number }) {
  return (
    <View style={styles.previewSide}>
      <Text style={styles.previewName} numberOfLines={1} {...textScale.dense}>
        {name}
      </Text>
      <Text style={styles.previewBefore} {...textScale.dense}>
        {money(before)}
      </Text>
      <Text style={[styles.previewAfter, { color: after < before ? colors.danger : colors.win }]} {...textScale.dense}>
        → {money(after)}
      </Text>
    </View>
  );
}

/* --------------------------------- hesap --------------------------------- */

export function AccountSheet({
  visible,
  onClose,
  account,
  meta,
  onSubmit,
}: {
  visible: boolean;
  onClose: () => void;
  account?: FinanceAccount | null;
  meta: FinanceAccountsResponse;
  onSubmit: (body: AccountBody, editing: boolean) => Promise<unknown>;
}) {
  const scopes = SCOPES.filter((s) => meta.access?.[s]?.manage);
  const [acl, setAcl] = useState<AclEntry[]>([]);
  const options = useAccessOptions(visible && !account);
  const used = (v: FormValues) =>
    new Set(
      (meta.items || [])
        .filter((a) => !a.archived && a.id !== account?.id && a.scope === v.scope && (v.scope !== "city" || String(a.city_id) === str(v.city_id)) && a.linked_method)
        .map((a) => a.linked_method as string)
    );
  return (
    <EditorSheet
      visible={visible}
      onClose={() => {
        setAcl([]);
        onClose();
      }}
      title={account ? "Hesabı düzenle" : "Yeni hesap"}
      initial={{
        scope: account?.scope || scopes[0] || "personal",
        city_id: str(account?.city_id || meta.cities?.[0]?.id || ""),
        name: account?.name || "",
        kind: account?.kind || "kasa",
        linked_method: account?.linked_method || "",
        opening_balance: account ? amountInput(account.opening_balance) : "0",
        opening_date: account?.opening_date || todayKey(),
        color: account?.color || ACCOUNT_COLORS[0],
        note: account?.note || "",
      }}
      fields={(v) => {
        const shared = v.scope === "shared";
        const taken = used(v);
        const list: FieldDef[] = [];
        if (!account) {
          list.push({
            key: "scope",
            label: "Defter",
            kind: "chips",
            required: true,
            options: scopes.map((s) => ({ value: s, label: s === "shared" ? "Ortak / proje hesabı" : `${SCOPE_LABEL[s]} · ${SCOPE_BOOK[s]}` })),
            onChange: () => ({ linked_method: "" }),
          });
          list.push({ key: "city_id", label: "İl", kind: "select", required: true, options: (meta.cities || []).map((c) => ({ value: String(c.id), label: c.name })), hidden: (x) => x.scope !== "city" });
        }
        list.push(
          { key: "name", label: "Hesap adı", kind: "text", required: true, placeholder: shared ? "örn. Elit Junior Cup" : "örn. Ankara il kasası" },
          { key: "kind", label: "Tür", kind: "select", options: (meta.kinds || []).map((k) => ({ value: k.key, label: k.label })) },
          {
            key: "linked_method",
            label: "Defterden bağlanan ödeme yöntemi",
            kind: "select",
            hint: "Ödenmiş kayıtlar bakiyeye eklenir. Boş: açılış + virman + doğrudan hareketler.",
            clearable: true,
            hidden: (x) => x.scope === "shared",
            options: (meta.methods?.[v.scope as AccountScope] || []).map((m) => ({
              value: m.key,
              label: m.label,
              hint: taken.has(m.key) ? "Başka hesaba bağlı" : null,
            })),
          },
          { key: "opening_balance", label: "Açılış bakiyesi (₺)", kind: "money" },
          { key: "opening_date", label: "Açılış tarihi", kind: "date", hint: "Öncesindeki kayıtlar sayılmaz." },
          { key: "color", label: "Renk", kind: "color", palette: ACCOUNT_COLORS },
          { key: "note", label: "Not", kind: "text", placeholder: "IBAN, şube, sorumlu…" }
        );
        return list;
      }}
      header={(v) =>
        !account && v.scope === "shared" ? (
          <Note icon="lock-closed-outline" text="Ortak hesabı yalnız siz, admin ve yetki verdiğiniz kişiler görür. Yetkilendirilen kişi diğer hesapları görmez." />
        ) : null
      }
      extra={() =>
        account ? null : (
          <View style={styles.aclBox}>
            <Text style={styles.sectionTitle} {...textScale.dense}>
              Yetki verilecek kişiler (isteğe bağlı)
            </Text>
            <AclEditor value={acl} onChange={setAcl} options={options.data} loading={options.isLoading} />
          </View>
        )
      }
      validate={(v) => {
        if (!str(v.name).trim()) return "Hesap adı gerekli.";
        if (Number.isNaN(parseAmount(v.opening_balance))) return "Açılış bakiyesi geçersiz.";
        if (v.linked_method && v.scope !== "shared" && used(v).has(str(v.linked_method))) return "Bu ödeme yöntemi başka bir hesaba bağlı.";
        return null;
      }}
      onSubmit={async (v) => {
        const shared = v.scope === "shared";
        const body: AccountBody = {
          name: str(v.name).trim(),
          kind: str(v.kind) || "kasa",
          linked_method: shared ? null : str(v.linked_method) || null,
          opening_balance: parseAmount(v.opening_balance) ?? 0,
          opening_date: str(v.opening_date) || null,
          color: str(v.color) || ACCOUNT_COLORS[0],
          note: str(v.note),
        };
        if (!account) {
          body.scope = v.scope as AccountScope;
          if (v.scope === "city") body.city_id = Number(v.city_id);
          if (acl.length) body.acl = cleanAcl(acl);
        }
        await onSubmit(body, Boolean(account));
        setAcl([]);
      }}
    />
  );
}

/* --------------------------------- yetkiler --------------------------------- */

function useAccessOptions(enabled: boolean) {
  return useQuery({ queryKey: ["admin", "finance", "access-options"], queryFn: accessOptions, enabled, staleTime: 5 * 60_000 });
}

const ACL_TYPES = [
  { key: "user" as const, label: "Kullanıcı" },
  { key: "role" as const, label: "Rol" },
  { key: "project" as const, label: "Proje ekibi" },
];
const aclKey = (e: AclEntry) => `${e.type}:${e.id ?? e.role}`;
const ACL_ICON: Record<AclEntry["type"], keyof typeof Ionicons.glyphMap> = { user: "person-outline", role: "pricetag-outline", project: "git-branch-outline" };

export function AclEditor({
  value,
  onChange,
  options,
  loading,
}: {
  value: AclEntry[];
  onChange: (next: AclEntry[]) => void;
  options?: Awaited<ReturnType<typeof accessOptions>>;
  loading?: boolean;
}) {
  const [kind, setKind] = useState<AclEntry["type"]>("user");
  const [q, setQ] = useState("");
  const [level, setLevel] = useState<AccessLevel>("view");
  const levels = options?.levels?.length ? options.levels : LEVELS;
  const taken = useMemo(() => new Set(value.map(aclKey)), [value]);
  const users = useMemo(() => {
    const n = q.trim().toLocaleLowerCase("tr-TR");
    return (options?.users || [])
      .filter((u) => !taken.has(`user:${u.id}`) && (!n || [u.name, u.username, u.city, u.role_label].some((x) => String(x || "").toLocaleLowerCase("tr-TR").includes(n))))
      .slice(0, 6);
  }, [options, q, taken]);
  const add = (entry: AclEntry) => {
    if (taken.has(aclKey(entry))) return;
    onChange([...value, { ...entry, level }]);
  };
  const levelLabel = (k: AccessLevel) => levels.find((l) => l.key === k)?.label || k;
  const nextLevel = (k: AccessLevel): AccessLevel => (k === "view" ? "post" : k === "post" ? "manage" : "view");

  return (
    <View style={styles.acl}>
      {value.length ? (
        value.map((e, i) => (
          <View key={aclKey(e)} style={styles.aclRow}>
            <Ionicons name={ACL_ICON[e.type]} size={16} color={colors.textSecondary} />
            <View style={styles.aclWho}>
              <Text style={styles.aclName} numberOfLines={1} {...textScale.dense}>
                {e.label || aclKey(e)}
              </Text>
              <Text style={styles.aclType} {...textScale.dense}>
                {ACL_TYPES.find((t) => t.key === e.type)?.label}
              </Text>
            </View>
            <Touchable
              onPress={() => onChange(value.map((x, j) => (j === i ? { ...x, level: nextLevel(x.level) } : x)))}
              style={styles.levelPill}
              accessibilityRole="button"
              accessibilityLabel={`${e.label || aclKey(e)} yetki düzeyi: ${levelLabel(e.level)}. Değiştir`}
            >
              <Text style={styles.levelText} {...textScale.dense}>
                {levelLabel(e.level)}
              </Text>
            </Touchable>
            <Touchable onPress={() => onChange(value.filter((_, j) => j !== i))} accessibilityRole="button" accessibilityLabel={`${e.label || aclKey(e)} yetkisini kaldır`}>
              <Ionicons name="close-circle" size={20} color={colors.textTertiary} />
            </Touchable>
          </View>
        ))
      ) : (
        <Muted>Henüz kimseye bu hesaba özel yetki verilmedi.</Muted>
      )}
      <SegmentField<AclEntry["type"]> label="Yetki verilecek" value={kind} onChange={setKind} options={ACL_TYPES} />
      <SegmentField<AccessLevel> label="Eklenecek düzey" value={level} onChange={setLevel} options={levels.map((l) => ({ key: l.key, label: l.label }))} />
      {kind === "user" ? (
        <View style={styles.aclAdd}>
          <Input variant="search" leadingIcon="search" value={q} onChangeText={setQ} placeholder="Ad, kullanıcı adı ya da il ile ara" autoCapitalize="none" />
          {loading ? <Muted>Kullanıcılar yükleniyor…</Muted> : null}
          {users.map((u) => (
            <Touchable key={u.id} onPress={() => { add({ type: "user", id: u.id, label: u.name, level }); setQ(""); }} style={styles.userRow} accessibilityRole="button" accessibilityLabel={`${u.name} ekle`}>
              <View style={styles.aclWho}>
                <Text style={styles.aclName} {...textScale.dense}>
                  {u.name}
                  {u.me ? " (ben)" : ""}
                </Text>
                <Text style={styles.aclType} {...textScale.dense}>
                  {[u.username && `@${u.username}`, u.role_label, u.city].filter(Boolean).join(" · ")}
                </Text>
              </View>
              <Ionicons name="add-circle-outline" size={20} color={colors.brandAccent} />
            </Touchable>
          ))}
          {!loading && options && !users.length ? <Muted>Eşleşen yönetim kullanıcısı yok.</Muted> : null}
        </View>
      ) : kind === "role" ? (
        <SelectField<string>
          label="Rol ekle"
          value={null}
          placeholder="Rol seçin"
          options={(options?.roles || []).filter((r) => !taken.has(`role:${r.key}`)).map((r) => ({ value: r.key, label: r.label }))}
          onChange={(key) => {
            const r = options?.roles.find((x) => x.key === key);
            if (r) add({ type: "role", role: r.key, label: `${r.label} (rol)`, level });
          }}
        />
      ) : (
        <SelectField<string>
          label="Proje ekibi ekle"
          value={null}
          placeholder="Proje seçin"
          hint="Proje izleyicileri en fazla görüntüler."
          options={(options?.projects || []).filter((p) => !taken.has(`project:${p.id}`)).map((p) => ({ value: String(p.id), label: p.name }))}
          onChange={(id) => {
            const p = options?.projects.find((x) => String(x.id) === id);
            if (p) add({ type: "project", id: p.id, label: `${p.name} ekibi`, level });
          }}
        />
      )}
      <View style={styles.levels}>
        {LEVELS.map((l) => (
          <Text key={l.key} style={styles.levelHelp} {...textScale.long}>
            <Text style={styles.levelHelpStrong}>{l.label}: </Text>
            {l.help}
          </Text>
        ))}
      </View>
    </View>
  );
}

export function AccessSheet({
  visible,
  account,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  account: FinanceAccount | null;
  onClose: () => void;
  onSubmit: (body: { visibility?: "scope" | "restricted"; acl: AclEntry[] }) => Promise<unknown>;
}) {
  const options = useAccessOptions(visible);
  const shared = account?.scope === "shared";
  const [visibility, setVisibility] = useState<"scope" | "restricted">("scope");
  const [acl, setAcl] = useState<AclEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [lastId, setLastId] = useState<number | null>(null);
  if (account && visible && lastId !== account.id) {
    setLastId(account.id);
    setVisibility(shared ? "restricted" : account.visibility || "scope");
    setAcl((account.acl || []).map((e) => ({ ...e })));
    setFailure(null);
  }
  const scopeText = account?.scope === "personal" ? "Yalnız ben (hesabın sahibi)" : account?.scope === "city" ? "İl muhasebe yetkisi olanlar" : "Türkiye geneli muhasebe yetkisi olanlar";
  const close = () => {
    setLastId(null);
    onClose();
  };
  const save = async () => {
    setBusy(true);
    setFailure(null);
    try {
      await onSubmit({ ...(shared ? {} : { visibility }), acl: cleanAcl(acl) });
      close();
    } catch (error) {
      setFailure(errorText(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <BottomSheet
      visible={visible && Boolean(account)}
      onClose={busy ? () => undefined : close}
      title={account ? `${account.name} — yetkiler` : "Yetkiler"}
      snap="full"
      footer={<Button label="Yetkileri kaydet" icon="shield-checkmark-outline" onPress={save} loading={busy} fullWidth haptic="success" />}
    >
      <View style={styles.acl}>
        <Text style={styles.sectionTitle} {...textScale.dense}>
          Kimler görür?
        </Text>
        {shared ? (
          <Note icon="lock-closed-outline" text="Ortak / proje hesabı her zaman kısıtlıdır: yalnız hesabı açan, admin ve aşağıda yetki verilenler görür." />
        ) : (
          <>
            <SegmentedControl
              items={[
                { key: "scope", label: "Kapsam yetkisine göre" },
                { key: "restricted", label: "Yalnız seçilenler" },
              ]}
              value={visibility}
              onChange={setVisibility}
              stretch
              size="sm"
            />
            <Muted>
              {visibility === "scope"
                ? `${scopeText} + aşağıdakiler.`
                : "Hesabı açan, admin ve aşağıda yetki verilenler; diğer muhasebe yetkilileri görmez."}
            </Muted>
          </>
        )}
        {options.error ? <Note tone="danger" text={errorText(options.error)} /> : null}
        <Text style={styles.sectionTitle} {...textScale.dense}>
          Hesaba özel yetkiler ({acl.length})
        </Text>
        <AclEditor value={acl} onChange={setAcl} options={options.data} loading={options.isLoading} />
        {failure ? (
          <Text style={styles.failure} {...textScale.long}>
            {failure}
          </Text>
        ) : null}
      </View>
    </BottomSheet>
  );
}

/** Tek virman satırı. */
export function TransferCard({ t, onPress }: { t: FinanceTransfer; onPress?: () => void }) {
  return (
    <RecordCard
      title={`${t.from_name || `Hesap #${t.from_account_id}`} → ${t.to_name || `Hesap #${t.to_account_id}`}`}
      subtitle={t.note || null}
      meta={formatDate(t.transfer_date)}
      icon="swap-horizontal"
      iconTone="brand"
      value={money(t.amount)}
      onPress={onPress}
    />
  );
}

const styles = StyleSheet.create({
  inlineAction: { flexDirection: "row", marginTop: space.xs },
  preview: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface2,
  },
  previewSide: { flex: 1, gap: 2 },
  previewName: { ...type.caption, color: colors.textSecondary },
  previewBefore: { ...type.numSmStrong, color: colors.textPrimary },
  previewAfter: { ...type.caption },
  aclBox: { gap: space.sm, paddingTop: space.sm, borderTopWidth: hairline, borderTopColor: colors.separator },
  sectionTitle: { ...type.label, color: colors.textPrimary },
  acl: { gap: space.md },
  aclRow: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.xs },
  aclWho: { flex: 1, gap: 2 },
  aclName: { ...type.bodySm, color: colors.textPrimary },
  aclType: { ...type.caption, color: colors.textTertiary },
  aclAdd: { gap: space.xs },
  userRow: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.sm, borderBottomWidth: hairline, borderBottomColor: colors.separator },
  levelPill: { paddingHorizontal: space.sm, paddingVertical: space.xs, borderRadius: radius.pill, backgroundColor: colors.brandDim },
  levelText: { ...type.caption, color: colors.brandAccent },
  levels: { gap: space.xs },
  levelHelp: { ...type.caption, color: colors.textTertiary },
  levelHelpStrong: { color: colors.textSecondary },
  failure: { ...type.bodySm, color: colors.danger },
});
