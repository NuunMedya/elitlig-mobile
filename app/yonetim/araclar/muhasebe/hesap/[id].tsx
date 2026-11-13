/**
 * HESAP AYRINTISI — web Accounts.js AccountDetail (Hareketler + Ekstre).
 *
 *   Hareketler : gerçekleşen gelir/gider, bekleyen + tahmin, tahmini net;
 *                tür ve durum süzgeci; ödendi işaretle, düzenle, sil (uzun bas).
 *                Gelir/gider ekleme yalnız "kayıt girebilir" düzeyinde.
 *   Ekstre     : tarih aralığı, devreden, yürüyen bakiye ve kapanış;
 *                CSV olarak paylaşılır.
 */

import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { AdminScreen, DateField, StatRow, confirmAction, useAdminMutation } from "@/components/admin";
import { LineRow, Lines, StageChip, ToolStage, categoryVisual } from "@/components/admin/tools/ToolKit";
import { FinanceEntryCard, FinanceEntrySheet } from "@/components/admin/accounting/financeSheets";
import { Muted, Note } from "@/components/admin/accounting/parts";
import { shareCsv } from "@/components/admin/accounting/share";
import { Button, Chip, ChipGroup, EmptyState, Reveal, SectionHeader, SegmentedControl, SkeletonListRow } from "@/components/ui";
import { errorText } from "@/lib/admin/errors";
import { formatDate } from "@/lib/admin/format";
import {
  ENTRY_STATUS,
  KIND_ICON,
  LEVELS,
  SCOPE_LABEL,
  STATEMENT_SOURCE,
  accountLevel,
  accountStatement,
  canPostAccount,
  compactMoney,
  createFinanceEntry,
  listAccounts,
  listFinanceEntries,
  money,
  removeFinanceEntry,
  toCsv,
  updateFinanceEntry,
  type EntryStatus,
  type EntryType,
  type FinanceAccount,
  type FinanceEntry,
} from "@/lib/api/admin/accounting";
import { colors, space, textScale, type } from "@/theme";

type Tab = "entries" | "statement";

export default function AccountDetailScreen() {
  const params = useLocalSearchParams<{ id: string; tab?: string }>();
  const id = Number(params.id);
  const [tab, setTab] = useState<Tab>(params.tab === "statement" ? "statement" : "entries");
  const accounts = useQuery({ queryKey: ["admin", "finance", "accounts"], queryFn: () => listAccounts() });
  const account = accounts.data?.items.find((a) => a.id === id) || null;
  const postable = useMemo(() => (accounts.data?.items || []).filter((a) => !a.archived && canPostAccount(a)), [accounts.data]);

  return (
    <AdminScreen
      app="muhasebe"
      title={account?.name || "Hesap"}
      subtitle={account ? `${SCOPE_LABEL[account.scope]}${account.city_name ? ` · ${account.city_name}` : ""}` : undefined}
      onRefresh={accounts.refetch}
      refreshing={accounts.isRefetching}
    >
      {accounts.isLoading ? (
        <SkeletonListRow count={4} />
      ) : !account ? (
        <EmptyState icon="business-outline" title="Hesap bulunamadı" body={accounts.error ? errorText(accounts.error) : "Hesap kaldırılmış ya da görme yetkiniz yok."} variant="inline" />
      ) : (
        <>
          <Reveal index={0}>
            <ToolStage
              icon={KIND_ICON[account.kind] ? (KIND_ICON[account.kind].replace("-outline", "") as "cash") : "wallet"}
              tone="mint"
              overline={`Bakiye · ${SCOPE_LABEL[account.scope]}`}
              value={money(account.balance)}
              valueTone={account.balance < 0 ? "danger" : undefined}
              caption={account.note || (account.linked_method ? "Defterdeki ödenmiş kayıtlar bakiyeye kendiliğinden yansır" : "Açılış + virman + doğrudan hareketler")}
              chips={
                <>
                  <StageChip icon="key-outline" label={LEVELS.find((l) => l.key === accountLevel(account))?.label || ""} />
                  {account.archived ? <StageChip icon="archive-outline" tone="warn" label="Arşivde" /> : null}
                  {account.pending?.income ? <StageChip icon="arrow-down" tone="win" label={`Bekleyen +${compactMoney(account.pending.income)}`} /> : null}
                  {account.pending?.expense ? <StageChip icon="arrow-up" tone="danger" label={`Bekleyen −${compactMoney(account.pending.expense)}`} /> : null}
                </>
              }
              stats={[
                { label: "Gelir", value: compactMoney(account.income ?? 0), tone: "win" },
                { label: "Gider", value: compactMoney(account.expense ?? 0), tone: "danger" },
                { label: "Virman", value: compactMoney((account.transfersIn || 0) - (account.transfersOut || 0)) },
              ]}
            />
          </Reveal>
          <SegmentedControl
            items={[
              { key: "entries", label: "Hareketler", icon: "list-outline" },
              { key: "statement", label: "Ekstre", icon: "document-text-outline" },
            ]}
            value={tab}
            onChange={setTab}
            stretch
          />
          {tab === "entries" ? <EntriesTab accountId={account.id} accountName={account.name} canPost={canPostAccount(account)} postable={postable} /> : <StatementTab accountId={account.id} accountName={account.name} />}
        </>
      )}
    </AdminScreen>
  );
}

function EntriesTab({ accountId, accountName, canPost, postable }: { accountId: number; accountName: string; canPost: boolean; postable: FinanceAccount[] }) {
  const [typeFilter, setTypeFilter] = useState<"" | EntryType>("");
  const [status, setStatus] = useState<"" | EntryStatus>("");
  const [editing, setEditing] = useState<{ entry?: FinanceEntry; type?: EntryType } | null>(null);
  const query = useQuery({
    queryKey: ["admin", "finance", "entries", accountId, typeFilter, status],
    queryFn: () => listFinanceEntries({ account_id: accountId, type: typeFilter || undefined, status: status || undefined }),
  });
  const invalidate = [["admin", "finance"]];
  const markPaid = useAdminMutation((e: FinanceEntry) => updateFinanceEntry(e.id, { status: "paid" }), {
    success: (_r, e) => `Hesaba işlendi: ${accountName} (${e.type === "income" ? "+" : "−"}${money(e.effective)})`,
    invalidate,
  });
  const remove = useAdminMutation((e: FinanceEntry) => removeFinanceEntry(e.id), { success: "Kayıt silindi.", invalidate });
  const save = useAdminMutation(
    ({ body, entryId }: { body: Parameters<typeof createFinanceEntry>[0]; entryId?: number }) => (entryId ? updateFinanceEntry(entryId, body) : createFinanceEntry(body)),
    {
      success: (_r, v) => (v.entryId ? "Kayıt güncellendi." : `${v.body.type === "income" ? "Gelir" : "Gider"} kaydı eklendi${v.body.status === "paid" ? " ve hesaba işlendi" : ""}.`),
      invalidate,
      silentError: true,
    }
  );
  const t = query.data?.totals;
  const ask = async (e: FinanceEntry) => {
    if (await confirmAction({ title: "Kayıt silinsin mi?", message: `"${e.description || "Kayıt"}" silinecek.`, confirmLabel: "Sil", destructive: true })) remove.mutate(e);
  };

  return (
    <>
      {t ? (
        <StatRow
          items={[
            { label: "Gerçekleşen gelir", value: money(t.paid_income), tone: "win" },
            { label: "Gerçekleşen gider", value: money(t.paid_expense), tone: "danger" },
            { label: "Bekleyen + tahmin", value: money(t.open_income - t.open_expense, { signed: true }) },
            { label: "Tahmini net", value: money(t.estimate_net), tone: t.estimate_net < 0 ? "danger" : undefined },
          ]}
        />
      ) : null}
      <SegmentedControl
        items={[
          { key: "", label: "Tümü" },
          { key: "income", label: "Gelir" },
          { key: "expense", label: "Gider" },
        ]}
        value={typeFilter}
        onChange={(k) => setTypeFilter(k as "" | EntryType)}
        stretch
        size="sm"
      />
      <ChipGroup scrollable contentPadding={0}>
        <Chip label="Tüm durumlar" size="sm" selected={!status} onPress={() => setStatus("")} />
        {(Object.keys(ENTRY_STATUS) as EntryStatus[]).map((k) => (
          <Chip key={k} label={k === "paid" ? "Ödendi / tahsil edildi" : ENTRY_STATUS[k].label} size="sm" selected={status === k} onPress={() => setStatus(k)} />
        ))}
      </ChipGroup>
      {canPost ? (
        <View style={styles.actions}>
          <Button label="Gelir" icon="add" size="sm" variant="secondary" onPress={() => setEditing({ type: "income" })} style={styles.flex} />
          <Button label="Gider" icon="remove" size="sm" variant="secondary" onPress={() => setEditing({ type: "expense" })} style={styles.flex} />
        </View>
      ) : null}
      {query.isLoading ? (
        <SkeletonListRow count={4} />
      ) : query.error ? (
        <Note tone="danger" text={errorText(query.error)} action={{ label: "Tekrar dene", onPress: () => void query.refetch() }} />
      ) : query.data?.items.length ? (
        <View style={styles.list}>
          <Lines>
          {query.data.items.map((e) => (
            <FinanceEntryCard
              key={e.id}
              entry={e}
              onPaid={canPost ? (x) => markPaid.mutate(x) : undefined}
              onEdit={canPost ? (x) => setEditing({ entry: x }) : undefined}
              onRemove={canPost ? ask : undefined}
            />
          ))}
          </Lines>
          {canPost ? <Muted>Kaydı düzenlemek için dokunun, silmek için basılı tutun.</Muted> : null}
        </View>
      ) : (
        <EmptyState icon="receipt-outline" title="Hareket yok" body="Gelir ya da gider ekleyin; ödenenler hesabın bakiyesine işlenir." variant="inline" />
      )}
      <FinanceEntrySheet
        visible={editing != null}
        onClose={() => setEditing(null)}
        entry={editing?.entry}
        defaults={{ type: editing?.type, account_id: accountId }}
        accounts={postable}
        onSubmit={(body) => save.mutateAsync({ body, entryId: editing?.entry?.id })}
      />
    </>
  );
}

function StatementTab({ accountId, accountName }: { accountId: number; accountName: string }) {
  const [range, setRange] = useState<{ from: string | null; to: string | null }>({ from: null, to: null });
  const query = useQuery({
    queryKey: ["admin", "finance", "statement", accountId, range.from, range.to],
    queryFn: () => accountStatement(accountId, { from: range.from || undefined, to: range.to || undefined }),
  });
  const data = query.data;
  const exportCsv = () => {
    if (!data) return;
    void shareCsv(
      `ekstre-${accountName}-${range.from || "bas"}_${range.to || "son"}.csv`,
      toCsv([
        ["Tarih", "Açıklama", "Cari", "Kaynak", "Tutar", "Bakiye"],
        ["", "Devreden", "", "", "", data.opening],
        ...data.items.map((m) => [m.date, m.title, m.party || "", STATEMENT_SOURCE[m.source] || m.source, m.amount, m.balance]),
        ["", "Kapanış", "", "", "", data.closing],
      ])
    );
  };
  return (
    <>
      <View style={styles.actions}>
        <View style={styles.flex}>
          <DateField label="Başlangıç" value={range.from} clearable onChange={(v) => setRange((r) => ({ ...r, from: v }))} />
        </View>
        <View style={styles.flex}>
          <DateField label="Bitiş" value={range.to} clearable onChange={(v) => setRange((r) => ({ ...r, to: v }))} />
        </View>
      </View>
      {data ? (
        <StatRow
          items={[
            { label: "Devreden", value: money(data.opening) },
            { label: "Kapanış", value: money(data.closing), tone: data.closing < 0 ? "danger" : "brand" },
            { label: "Hareket", value: data.items.length },
          ]}
        />
      ) : null}
      {query.isLoading ? (
        <SkeletonListRow count={4} />
      ) : query.error ? (
        <Note tone="danger" text={errorText(query.error)} />
      ) : data?.items.length ? (
        <View style={styles.list}>
          <SectionHeader title="Ekstre" meta={`${data.items.length} hareket`} inset="flush" action={{ label: "CSV paylaş", onPress: exportCsv }} />
          <Lines>
            {data.items.map((m, i) => {
              const visual = m.source === "transfer" ? { icon: "swap-horizontal" as const, tone: "violet" as const } : categoryVisual(m.title, m.amount >= 0 ? "income" : "expense");
              return (
                <LineRow
                  key={`${m.source}-${m.ref}-${i}`}
                  icon={visual.icon}
                  tone={visual.tone}
                  title={m.title}
                  sub={[m.party, m.note].filter(Boolean).join(" · ") || null}
                  meta={`${formatDate(m.date)} · ${STATEMENT_SOURCE[m.source] || m.source}`}
                  value={money(m.amount, { signed: true })}
                  valueTone={m.amount >= 0 ? "win" : "danger"}
                  valueSub={`Bakiye ${money(m.balance)}`}
                />
              );
            })}
          </Lines>
        </View>
      ) : (
        <EmptyState icon="document-text-outline" title="Bu aralıkta hareket yok" variant="inline" />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  pills: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
  actions: { flexDirection: "row", gap: space.sm },
  flex: { flex: 1 },
  list: { gap: space.sm },
  balance: { ...type.caption, color: colors.textSecondary },
});
