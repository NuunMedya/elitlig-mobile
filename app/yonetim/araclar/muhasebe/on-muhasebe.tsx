/**
 * ÖN MUHASEBE — web Muhasebe → Ön Muhasebe (tools/Ledger.js).
 *
 * Kişisel gelir-gider defteri; kayıtlar yalnız sahibine görünür.
 *   Üstte  : dönem seçimi (bu ay, geçen ay, çeyrek, yıl, son 12 ay, tümü,
 *            özel aralık), dönem özeti (gelir, gider, net, bekleyen alacak/
 *            borç, KDV dengesi) ve 12 aylık gelir-gider trendi.
 *   Sekmeler: Hareketler (arama + tür/durum/kategori/hesap süzgeci, toplam),
 *            Vade takibi (bekleyenler vade sırasıyla, kalan gün), Kategoriler
 *            (gelir/gider dağılımı) ve Cariler (kişi/firma bakiyeleri).
 * Göstergeye, kategoriye ya da cariye dokunmak Hareketler'i o süzgeçle açar.
 *
 * DIŞA AKTARMA: süzülmüş kayıtlar Excel uyumlu CSV olarak paylaşılır. Web'deki
 * "Rapor (yazdır)" tarayıcı yazdırmasıdır; telefonda karşılığı CSV paylaşımı.
 *
 * Dönem tercihi cihazda saklanır (web localStorage ile aynı anahtar).
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";

import { ActionSheet, AdminScreen, DateField, Panel, RecordCard, SelectField, StatRow, confirmAction, useAdminMutation, type FormValues } from "@/components/admin";
import { LedgerEntrySheet, blankLedger, ledgerToForm } from "@/components/admin/accounting/LedgerEntrySheet";
import { AccountStrip, BarRow, Muted, Note, TrendBars } from "@/components/admin/accounting/parts";
import { TransferSheet } from "@/components/admin/accounting/financeSheets";
import { shareCsv } from "@/components/admin/accounting/share";
import { Button, Chip, ChipGroup, EmptyState, Input, MetricGrid, MetricTile, SegmentedControl, SkeletonCard, Tabs } from "@/components/ui";
import { errorText } from "@/lib/admin/errors";
import { formatDate } from "@/lib/admin/format";
import {
  LEDGER_METHODS,
  LEDGER_PERIODS,
  LEDGER_STATUS_BY_TYPE,
  LEDGER_TYPE_LABELS,
  compactMoney,
  createLedgerEntry,
  createTransfer,
  filterLedger,
  getLedger,
  getToolContacts,
  isLedgerOverdue,
  ledgerCsv,
  ledgerPeriodRange,
  ledgerTotals,
  listAccounts,
  money,
  removeLedgerEntry,
  shortMonth,
  todayKey,
  updateLedgerEntry,
  type EntryType,
  type LedgerBody,
  type LedgerEntry,
  type LedgerFilters,
  type LedgerPeriod,
  type LedgerSummary,
} from "@/lib/api/admin/accounting";
import { space } from "@/theme";

const PERIOD_KEY = "tools:ledger:period";
type Tab = "entries" | "pending" | "categories" | "parties";
const EMPTY_FILTERS: LedgerFilters = { type: "", status: "", category: "", query: "", account: "" };
const EMPTY_SUMMARY: LedgerSummary = {
  income: 0, expense: 0, net: 0, receivable: 0, payable: 0, overdue: 0, overdue_amount: 0, vat_balance: 0, vat_collected: 0, vat_paid: 0, categories: [], parties: [],
};
const KEY = ["admin", "ledger"] as const;

export default function LedgerScreen() {
  const [period, setPeriod] = useState<LedgerPeriod>("this_month");
  const [custom, setCustom] = useState<{ from: string; to: string }>({ from: "", to: "" });
  const [tab, setTab] = useState<Tab>("entries");
  const [filters, setFilters] = useState<LedgerFilters>(EMPTY_FILTERS);
  const [editor, setEditor] = useState<{ initial: FormValues; id?: number; nonce: number } | null>(null);
  const [menu, setMenu] = useState<LedgerEntry | null>(null);
  const [transfer, setTransfer] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(PERIOD_KEY)
      .then((v) => {
        if (v && LEDGER_PERIODS.some((p) => p.key === v)) setPeriod(v as LedgerPeriod);
      })
      .catch(() => undefined);
  }, []);
  const choosePeriod = (key: LedgerPeriod) => {
    setPeriod(key);
    AsyncStorage.setItem(PERIOD_KEY, key).catch(() => undefined);
  };

  const range = useMemo(() => ledgerPeriodRange(period, new Date(), custom), [period, custom]);
  const query = useQuery({ queryKey: [...KEY, range.from, range.to], queryFn: () => getLedger({ from: range.from || undefined, to: range.to || undefined }) });
  const contacts = useQuery({ queryKey: ["admin", "tools", "contacts"], queryFn: getToolContacts, staleTime: 5 * 60_000 });
  const postable = useQuery({ queryKey: ["admin", "finance", "accounts", "postable"], queryFn: () => listAccounts({ postable: true }), retry: false });
  const allAccounts = useQuery({ queryKey: ["admin", "finance", "accounts"], queryFn: () => listAccounts(), retry: false });
  const accounts = useMemo(() => (postable.data?.items || []).filter((a) => !a.archived), [postable.data]);
  const accountName = (id: string | number) => accounts.find((a) => String(a.id) === String(id))?.name || `Hesap #${id}`;

  const items = query.data?.items || [];
  const summary = query.data?.summary || EMPTY_SUMMARY;
  const filtered = useMemo(() => filterLedger(items, filters), [items, filters]);
  const sums = useMemo(() => ledgerTotals(filtered), [filtered]);
  const categories = useMemo(() => [...new Set(items.map((e) => e.category).filter(Boolean) as string[])], [items]);
  const parties = useMemo(
    () => [...new Set([...items.map((e) => e.party), ...(contacts.data?.items || []).map((c) => c.company || c.name)].filter(Boolean) as string[])],
    [items, contacts.data]
  );
  const pending = useMemo(() => items.filter((e) => e.status === "pending").sort((a, b) => (a.due_date || "9999").localeCompare(b.due_date || "9999")), [items]);
  const periodLabel = LEDGER_PERIODS.find((p) => p.key === period)?.label;
  const hasFilter = Boolean(filters.type || filters.status || filters.category || filters.query || filters.account);
  const accountIds = [...new Set([...accounts.map((a) => String(a.id)), ...items.filter((e) => e.account_id).map((e) => String(e.account_id))])];

  const invalidate = [[...KEY], ["admin", "finance"]];
  const save = useAdminMutation(({ body, id }: { body: LedgerBody; id?: number | null }) => (id ? updateLedgerEntry(id, body) : createLedgerEntry(body)), {
    success: (res, v) => {
      const item = res?.item;
      const posted = item?.account_id && item.status === "paid" ? ` Hesaba işlendi: ${accountName(item.account_id)}.` : "";
      return `${v.id ? "Kayıt güncellendi." : "Kayıt eklendi."}${posted}`;
    },
    invalidate,
    silentError: true,
  });
  const remove = useAdminMutation((e: LedgerEntry) => removeLedgerEntry(e.id), { success: "Kayıt silindi.", invalidate });
  const markPaid = useAdminMutation((e: LedgerEntry) => updateLedgerEntry(e.id, { status: "paid", entry_date: todayKey() }), {
    success: (_r, e) => (e.type === "income" ? "Tahsil edildi olarak işaretlendi." : "Ödendi olarak işaretlendi."),
    invalidate,
  });
  const saveTransfer = useAdminMutation((v: { body: Parameters<typeof createTransfer>[0]; message: string }) => createTransfer(v.body), {
    success: (_r, v) => v.message,
    invalidate: [["admin", "finance"]],
    silentError: true,
  });

  const open = (initial: FormValues, id?: number) => setEditor({ initial, id, nonce: Date.now() });
  const askRemove = async (e: LedgerEntry) => {
    if (await confirmAction({ title: "Kayıt silinsin mi?", message: `"${e.description || LEDGER_TYPE_LABELS[e.type]}" silinecek.`, confirmLabel: "Sil", destructive: true })) {
      remove.mutate(e);
      setEditor(null);
    }
  };
  const go = (next: Partial<LedgerFilters>) => {
    setTab("entries");
    setFilters({ ...EMPTY_FILTERS, ...next });
  };
  const exportCsv = () => void shareCsv(`on-muhasebe-${range.from || "tum"}-${range.to || "kayitlar"}.csv`, ledgerCsv(filtered));
  const maxCategory = Math.max(1, ...summary.categories.map((c) => c.total));

  return (
    <AdminScreen
      title="Ön Muhasebe"
      subtitle="Kişisel gelir-gider defteri"
      onRefresh={query.refetch}
      refreshing={query.isRefetching}
      actions={filtered.length ? [{ icon: "share-outline", accessibilityLabel: "Kayıtları CSV olarak paylaş", onPress: exportCsv }] : undefined}
    >
      {allAccounts.data ? <AccountStrip accounts={(allAccounts.data.items || []).filter((a) => !a.archived)} scope="personal" onTransfer={() => setTransfer(true)} /> : null}

      <View style={styles.row}>
        <Button label="Gelir" icon="add" variant="secondary" onPress={() => open(blankLedger("income"))} style={styles.flex} />
        <Button label="Gider" icon="remove" variant="secondary" onPress={() => open(blankLedger("expense"))} style={styles.flex} />
      </View>

      <ChipGroup scrollable contentPadding={0}>
        {LEDGER_PERIODS.map((p) => (
          <Chip key={p.key} label={p.label} size="sm" selected={period === p.key} onPress={() => choosePeriod(p.key)} />
        ))}
      </ChipGroup>
      {period === "custom" ? (
        <View style={styles.row}>
          <View style={styles.flex}>
            <DateField label="Başlangıç" value={custom.from || null} onChange={(v) => setCustom((c) => ({ ...c, from: v || "" }))} clearable />
          </View>
          <View style={styles.flex}>
            <DateField label="Bitiş" value={custom.to || null} onChange={(v) => setCustom((c) => ({ ...c, to: v || "" }))} clearable />
          </View>
        </View>
      ) : null}
      <Muted>{range.from ? `${formatDate(range.from)} – ${formatDate(range.to)}` : "Tüm kayıtlar"}</Muted>

      {query.isLoading ? (
        <SkeletonCard />
      ) : query.error ? (
        <Note tone="danger" text={errorText(query.error)} action={{ label: "Tekrar dene", onPress: () => void query.refetch() }} />
      ) : (
        <MetricGrid columns={2}>
          <MetricTile label="Gelir" value={money(summary.income)} hint={`${periodLabel} · gerçekleşen`} tone="win" icon="trending-up" onPress={() => go({ type: "income" })} />
          <MetricTile label="Gider" value={money(summary.expense)} hint={`${periodLabel} · gerçekleşen`} tone="danger" icon="trending-down" onPress={() => go({ type: "expense" })} />
          <MetricTile
            label={summary.net >= 0 ? "Net kâr" : "Net zarar"}
            value={money(summary.net)}
            hint={summary.income ? `Kâr marjı %${Math.round((summary.net / summary.income) * 100)}` : "Gelir yok"}
            tone={summary.net >= 0 ? "brand" : "danger"}
            icon="scale-outline"
          />
          <MetricTile
            label="Bekleyen alacak"
            value={money(summary.receivable)}
            hint={summary.overdue ? `${summary.overdue} kayıt vadesi geçti` : "Tahsil edilecek"}
            tone={summary.overdue ? "warn" : "neutral"}
            icon="hand-left-outline"
            onPress={() => setTab("pending")}
          />
          <MetricTile label="Bekleyen borç" value={money(summary.payable)} hint="Ödenecek" icon="document-text-outline" onPress={() => setTab("pending")} />
          <MetricTile label="KDV dengesi" value={money(summary.vat_balance)} hint={`Hesaplanan ${compactMoney(summary.vat_collected)} · İndirilecek ${compactMoney(summary.vat_paid)}`} icon="pie-chart-outline" />
        </MetricGrid>
      )}

      <Panel title="Son 12 ay">
        <TrendBars
          rows={(query.data?.trend || []).map((m) => ({ key: m.month, label: shortMonth(m.month).split(" ")[0], title: shortMonth(m.month), income: m.income, expense: m.expense, net: m.net }))}
          emptyText="Gerçekleşen kayıt eklendikçe grafik dolacak."
        />
      </Panel>

      <Tabs
        items={[
          { key: "entries", label: "Hareketler" },
          { key: "pending", label: "Vade takibi", badge: pending.length || undefined },
          { key: "categories", label: "Kategoriler" },
          { key: "parties", label: "Cariler" },
        ]}
        value={tab}
        onChange={setTab}
        distribute="scroll"
      />

      {tab === "entries" ? (
        <>
          <Input variant="search" leadingIcon="search" value={filters.query} onChangeText={(q) => setFilters((f) => ({ ...f, query: q }))} placeholder="Açıklama, cari, belge no…" autoCapitalize="none" />
          <SegmentedControl
            items={[
              { key: "", label: "Tüm türler" },
              { key: "income", label: "Gelir" },
              { key: "expense", label: "Gider" },
            ]}
            value={filters.type}
            onChange={(k) => setFilters((f) => ({ ...f, type: k as LedgerFilters["type"] }))}
            stretch
            size="sm"
          />
          <ChipGroup scrollable contentPadding={0}>
            {([["", "Tüm durumlar"], ["paid", "Gerçekleşen"], ["pending", "Bekleyen"], ["overdue", "Vadesi geçen"]] as const).map(([k, l]) => (
              <Chip key={k || "all"} label={l} size="sm" selected={filters.status === k} onPress={() => setFilters((f) => ({ ...f, status: k }))} />
            ))}
          </ChipGroup>
          <View style={styles.row}>
            <View style={styles.flex}>
              <SelectField<string>
                label="Kategori"
                value={filters.category || null}
                placeholder="Tüm kategoriler"
                clearable
                options={[...categories, "Diğer"].map((c) => ({ value: c, label: c }))}
                onChange={(v) => setFilters((f) => ({ ...f, category: v || "" }))}
              />
            </View>
            {accountIds.length ? (
              <View style={styles.flex}>
                <SelectField<string>
                  label="Hesap"
                  value={filters.account || null}
                  placeholder="Tüm hesaplar"
                  clearable
                  options={[{ value: "none", label: "Hesap seçilmemiş" }, ...accountIds.map((id) => ({ value: id, label: accountName(id) }))]}
                  onChange={(v) => setFilters((f) => ({ ...f, account: v || "" }))}
                />
              </View>
            ) : null}
          </View>
          {hasFilter ? <Button label="Süzgeçleri temizle" icon="close" size="sm" variant="ghost" onPress={() => setFilters(EMPTY_FILTERS)} /> : null}
          {filtered.length ? (
            <>
              <StatRow
                items={[
                  { label: "Kayıt", value: sums.count },
                  { label: "Gelir", value: money(sums.income), tone: "win" },
                  { label: "Gider", value: money(sums.expense), tone: "danger" },
                  { label: "Net", value: money(sums.net), tone: sums.net >= 0 ? "win" : "danger" },
                ]}
              />
              <View style={styles.list}>
                {filtered.map((e) => (
                  <LedgerCard key={e.id} entry={e} accountName={accountName} onPress={() => open(ledgerToForm(e), e.id)} onLongPress={() => setMenu(e)} />
                ))}
              </View>
              <Muted>Düzenlemek için dokunun; tahsil/ödendi, benzerini ekle ve sil için basılı tutun.</Muted>
            </>
          ) : (
            <EmptyState
              icon="receipt-outline"
              title={items.length ? "Süzgece uyan kayıt yok" : "Bu dönemde kayıt yok"}
              body={items.length ? "Süzgeçleri değiştirip yeniden deneyin." : "İlk gelir ya da gider kaydınızı ekleyin."}
              action={items.length ? undefined : { label: "Kayıt ekle", onPress: () => open(blankLedger("expense")) }}
              variant="inline"
            />
          )}
        </>
      ) : null}

      {tab === "pending" ? (
        pending.length ? (
          <View style={styles.list}>
            {pending.map((e) => {
              const overdue = isLedgerOverdue(e);
              const days = e.due_date ? Math.round((new Date(`${e.due_date}T00:00:00`).getTime() - new Date(`${todayKey()}T00:00:00`).getTime()) / 86400000) : null;
              return (
                <RecordCard
                  key={e.id}
                  title={e.description || e.party || LEDGER_TYPE_LABELS[e.type]}
                  subtitle={`${e.party ? `${e.party} · ` : ""}${e.due_date ? `Vade ${formatDate(e.due_date)}` : "Vade belirtilmedi"}`}
                  icon={e.type === "income" ? "arrow-down" : "arrow-up"}
                  iconTone={e.type === "income" ? "win" : "danger"}
                  value={money(e.amount)}
                  valueTone={e.type === "income" ? "win" : "danger"}
                  badges={[
                    { label: e.type === "income" ? "Alacak" : "Borç", tone: e.type === "income" ? "win" : "danger" },
                    days != null ? { label: days < 0 ? `${-days} gün geçti` : days === 0 ? "Bugün" : `${days} gün kaldı`, tone: overdue ? "danger" : days <= 3 ? "warn" : "neutral" } : null,
                  ]}
                  onPress={() => open(ledgerToForm(e), e.id)}
                >
                  <View style={styles.inline}>
                    <Button label={e.type === "income" ? "Tahsil edildi" : "Ödendi"} icon="checkmark" size="sm" variant="secondary" onPress={() => markPaid.mutate(e)} />
                  </View>
                </RecordCard>
              );
            })}
          </View>
        ) : (
          <EmptyState icon="checkmark-circle-outline" title="Bekleyen alacak ya da borç yok" body="Durumu “Bekliyor” olan kayıtlar burada vade sırasıyla listelenir." variant="inline" />
        )
      ) : null}

      {tab === "categories" ? (
        summary.categories.length ? (
          (["income", "expense"] as EntryType[]).map((t) => {
            const list = summary.categories.filter((c) => c.type === t);
            const total = list.reduce((n, c) => n + c.total, 0);
            return (
              <Panel key={t} title={`${LEDGER_TYPE_LABELS[t]} dağılımı · ${money(total)}`}>
                {list.length ? (
                  list.map((c) => (
                    <BarRow
                      key={c.name}
                      label={c.name}
                      value={money(c.total)}
                      ratio={c.total / maxCategory}
                      tone={t === "income" ? "win" : "danger"}
                      sub={`${c.count} kayıt · %${total ? Math.round((c.total / total) * 100) : 0}`}
                      onPress={() => go({ type: t, category: c.name })}
                    />
                  ))
                ) : (
                  <Muted>Kayıt yok.</Muted>
                )}
              </Panel>
            );
          })
        ) : (
          <EmptyState icon="bar-chart-outline" title="Henüz kategori yok" variant="inline" />
        )
      ) : null}

      {tab === "parties" ? (
        summary.parties.length ? (
          <View style={styles.list}>
            {summary.parties.map((p) => (
              <RecordCard
                key={p.name}
                title={p.name}
                subtitle={`Tahsil edilen ${money(p.income)} · Ödenen ${money(p.expense)}`}
                meta={`${p.count} kayıt${p.receivable ? ` · Alacak ${money(p.receivable)}` : ""}${p.payable ? ` · Borç ${money(p.payable)}` : ""}`}
                icon="person-outline"
                value={money(p.balance)}
                valueTone={p.balance >= 0 ? "win" : "danger"}
                onPress={() => go({ query: p.name })}
              />
            ))}
          </View>
        ) : (
          <EmptyState icon="people-outline" title="Cari bilgisi olan kayıt yok" body="Kayıtlara cari (kişi / firma) yazdıkça bakiyeleri burada toplanır." variant="inline" />
        )
      ) : null}

      <ActionSheet
        visible={menu != null}
        onClose={() => setMenu(null)}
        title={menu ? menu.description || LEDGER_TYPE_LABELS[menu.type] : undefined}
        actions={
          menu
            ? [
                { label: menu.type === "income" ? "Tahsil edildi" : "Ödendi", icon: "checkmark-circle-outline", hidden: menu.status !== "pending", onPress: () => markPaid.mutate(menu) },
                { label: "Benzerini ekle", icon: "copy-outline", onPress: () => open(ledgerToForm(menu, { id: undefined, entry_date: todayKey(), status: "paid", due_date: "" })) },
                { label: "Düzenle", icon: "create-outline", onPress: () => open(ledgerToForm(menu), menu.id) },
                { label: "Sil", icon: "trash-outline", danger: true, onPress: () => void askRemove(menu) },
              ]
            : []
        }
      />

      {editor ? (
        <LedgerEntrySheet
          key={editor.nonce}
          visible
          onClose={() => setEditor(null)}
          initial={editor.initial}
          editingId={editor.id}
          categories={categories}
          parties={parties}
          accounts={accounts}
          accountName={accountName}
          onSubmit={(body, id) => save.mutateAsync({ body, id })}
          onDelete={editor.id ? () => { const e = items.find((x) => x.id === editor.id); if (e) void askRemove(e); } : undefined}
        />
      ) : null}
      <TransferSheet
        visible={transfer}
        onClose={() => setTransfer(false)}
        accounts={(allAccounts.data?.items || []).filter((a) => !a.archived)}
        onSubmit={(body, message) => saveTransfer.mutateAsync({ body, message })}
      />
    </AdminScreen>
  );
}

function LedgerCard({ entry: e, accountName, onPress, onLongPress }: { entry: LedgerEntry; accountName: (id: number) => string; onPress: () => void; onLongPress: () => void }) {
  const overdue = isLedgerOverdue(e);
  const method = LEDGER_METHODS.find((m) => m.key === e.method)?.label;
  return (
    <RecordCard
      title={e.description || LEDGER_TYPE_LABELS[e.type]}
      subtitle={[e.category, e.party].filter(Boolean).join(" · ") || null}
      meta={[formatDate(e.entry_date), method, e.account_id ? accountName(e.account_id) : null, e.document_no ? `Belge ${e.document_no}` : null].filter(Boolean).join(" · ")}
      icon={e.type === "income" ? "arrow-down" : "arrow-up"}
      iconTone={e.type === "income" ? "win" : "danger"}
      value={`${e.type === "income" ? "+" : "−"}${money(e.amount)}`}
      valueTone={e.type === "income" ? "win" : "danger"}
      badges={[
        { label: overdue ? "Vadesi geçti" : LEDGER_STATUS_BY_TYPE[e.type][e.status], tone: overdue ? "danger" : e.status === "paid" ? "win" : "warn" },
        e.status === "pending" && e.due_date ? { label: `Vade ${formatDate(e.due_date, false)}`, tone: "neutral" } : null,
        e.vat_rate ? { label: `KDV %${e.vat_rate}`, tone: "neutral" } : null,
      ]}
      onPress={onPress}
      onLongPress={onLongPress}
    />
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: space.sm },
  flex: { flex: 1 },
  list: { gap: space.sm },
  inline: { flexDirection: "row", marginTop: space.xs },
});
