/**
 * HESAPLAR VE VİRMAN — web Muhasebe → Hesaplar (tools/accounting/Accounts.js).
 *
 * Kişisel (Ön Muhasebe), il (Maç Muhasebesi), Türkiye geneli ve ortak/proje
 * kasa-banka hesapları. Kart: bakiye, gelir/gider/virman kırılımı, bekleyen
 * tahmin, bağlı ödeme yöntemi, kısıtlı/paylaşılmış rozetleri.
 *
 * EYLEMLER yetki düzeyine göre (web AccountCard menüsü):
 *   kayıt girebilir → gelir / gider ekle
 *   herkes          → hareketler, ekstre (ayrıntı ekranı)
 *   yönetebilir     → virman, düzenle, yetkiler, arşivle, sil (hareketi varsa arşivlenir)
 * Hesap açma, bir kapsamda `manage` erişimi olanlara görünür.
 *
 * Son virmanlar alttadır; dokununca düzenle / sil menüsü açılır.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { ActionSheet, AdminScreen, Panel, RecordCard, confirmAction, useAdminMutation, type SheetAction } from "@/components/admin";
import { AccountingNav } from "@/components/admin/accounting/AccountingNav";
import { ToolFab } from "@/components/admin/tools/ToolApp";
import {
  AccessSheet,
  AccountSheet,
  FinanceEntrySheet,
  TransferCard,
  TransferSheet,
} from "@/components/admin/accounting/financeSheets";
import { Muted, Note } from "@/components/admin/accounting/parts";
import { Chip, ChipGroup, EmptyState, FAB, MetricGrid, MetricTile, SkeletonCard } from "@/components/ui";
import { errorText } from "@/lib/admin/errors";
import {
  KIND_ICON,
  LEVELS,
  SCOPES,
  SCOPE_BOOK,
  SCOPE_LABEL,
  accountLevel,
  canManageAccount,
  canPostAccount,
  createAccount,
  createFinanceEntry,
  createTransfer,
  listAccounts,
  listTransfers,
  money,
  removeAccount,
  removeTransfer,
  setAccountAccess,
  statusLabel,
  updateAccount,
  updateTransfer,
  type AccountScope,
  type EntryType,
  type FinanceAccount,
  type FinanceAccountsResponse,
  type FinanceTransfer,
} from "@/lib/api/admin/accounting";
import { ApiError } from "@/lib/http";
import { colors, space, textScale, type } from "@/theme";

const KEY = ["admin", "finance"] as const;

export default function AccountsScreen() {
  const router = useRouter();
  const [scope, setScope] = useState<"all" | AccountScope>("all");
  const [menu, setMenu] = useState<FinanceAccount | null>(null);
  const [editing, setEditing] = useState<FinanceAccount | "new" | null>(null);
  const [transfer, setTransfer] = useState<{ transfer?: FinanceTransfer; from?: number } | null>(null);
  const [transferMenu, setTransferMenu] = useState<FinanceTransfer | null>(null);
  const [access, setAccess] = useState<FinanceAccount | null>(null);
  const [entry, setEntry] = useState<{ account: FinanceAccount; type: EntryType } | null>(null);

  const query = useQuery({ queryKey: [...KEY, "accounts"], queryFn: () => listAccounts() });
  const transfers = useQuery({ queryKey: [...KEY, "transfers"], queryFn: () => listTransfers() });
  const data = query.data;
  const accounts = useMemo(() => (data?.items || []).filter((a) => !a.archived), [data]);
  const postable = useMemo(() => accounts.filter(canPostAccount), [accounts]);
  const scopes = SCOPES.filter((s) => data?.access?.[s]?.view || accounts.some((a) => a.scope === s));
  const canCreate = SCOPES.some((s) => data?.access?.[s]?.manage);
  const canTransfer = accounts.filter(canManageAccount).length >= 2;
  const shown = accounts.filter((a) => scope === "all" || a.scope === scope);
  const totalOf = (s: AccountScope) => accounts.filter((a) => a.scope === s).reduce((n, a) => n + (Number(a.balance) || 0), 0);

  const refresh = () => {
    void query.refetch();
    void transfers.refetch();
  };
  const invalidate = [[...KEY]];

  const saveAccount = useAdminMutation(
    ({ body, id }: { body: Parameters<typeof createAccount>[0]; id?: number }) => (id ? updateAccount(id, body) : createAccount(body)),
    { success: (_r, v) => (v.id ? "Hesap güncellendi." : "Hesap açıldı."), invalidate, silentError: true }
  );
  const saveTransfer = useAdminMutation(
    ({ body, id }: { body: Parameters<typeof createTransfer>[0]; id?: number; message: string }) => (id ? updateTransfer(id, body) : createTransfer(body)),
    { success: (_r, v) => v.message, invalidate, silentError: true }
  );
  const saveAccess = useAdminMutation(({ id, body }: { id: number; body: Parameters<typeof setAccountAccess>[1] }) => setAccountAccess(id, body), {
    success: "Hesap yetkileri kaydedildi.",
    invalidate,
    silentError: true,
  });
  const addEntry = useAdminMutation(createFinanceEntry, {
    success: (res, body) =>
      body.status === "paid"
        ? `Hesaba işlendi: ${res?.item?.account_name || entry?.account.name || ""}`
        : `${body.type === "income" ? "Gelir" : "Gider"} kaydı eklendi (${statusLabel(body.status, body.type).toLocaleLowerCase("tr-TR")}).`,
    invalidate,
    silentError: true,
  });
  const archive = useAdminMutation((a: FinanceAccount) => updateAccount(a.id, { archived: true } as never), {
    success: (_r, a) => `"${a.name}" arşivlendi.`,
    invalidate,
  });
  const remove = useAdminMutation((a: FinanceAccount) => removeAccount(a.id), {
    success: (res) => (res?.archived ? res.message || "Hesap arşivlendi." : "Hesap kaldırıldı."),
    invalidate,
  });
  const dropTransfer = useAdminMutation((t: FinanceTransfer) => removeTransfer(t.id), { success: "Virman silindi.", invalidate });

  const openDetail = (a: FinanceAccount, tab: "entries" | "statement" = "entries") =>
    router.push({ pathname: "/yonetim/araclar/muhasebe/hesap/[id]", params: { id: String(a.id), tab } } as never);

  const menuActions = (a: FinanceAccount): SheetAction[] => {
    const post = canPostAccount(a);
    const manage = canManageAccount(a);
    return [
      { label: "Gelir ekle", icon: "trending-up", onPress: () => setEntry({ account: a, type: "income" }), hidden: !post },
      { label: "Gider ekle", icon: "trending-down", onPress: () => setEntry({ account: a, type: "expense" }), hidden: !post },
      { label: "Hareketler", icon: "list-outline", onPress: () => openDetail(a, "entries") },
      { label: "Ekstre", icon: "document-text-outline", onPress: () => openDetail(a, "statement") },
      { label: "Virman", icon: "swap-horizontal", onPress: () => setTransfer({ from: a.id }), hidden: !manage },
      { label: "Düzenle", icon: "create-outline", onPress: () => setEditing(a), hidden: !manage },
      { label: "Yetkiler", icon: "shield-checkmark-outline", hint: a.shared_with ? `${a.shared_with} kişi / rol / ekip` : "Kimler görür, kimler kayıt girer", onPress: () => setAccess(a), hidden: !manage },
      { label: "Arşivle", icon: "archive-outline", onPress: () => archive.mutate(a), hidden: !manage },
      {
        label: "Sil",
        icon: "trash-outline",
        danger: true,
        hint: "Hareketi varsa arşivlenir",
        hidden: !manage,
        onPress: async () => {
          if (await confirmAction({ title: "Hesap kaldırılsın mı?", message: `"${a.name}" kaldırılacak. Hareket ya da virman geçmişi varsa arşivlenir.`, confirmLabel: "Kaldır", destructive: true })) remove.mutate(a);
        },
      },
    ];
  };

  const loadError =
    query.error instanceof ApiError && query.error.status === 404 ? "Hesaplar ve Virman için sunucu güncellemesi henüz yayında değil." : query.error ? errorText(query.error) : null;

  return (
    <AdminScreen
      app="muhasebe"
      appTabs={<AccountingNav current="hesaplar" />}
      title="Hesaplar ve Virman"
      subtitle="Kasa · banka · aktarma"
      onRefresh={refresh}
      refreshing={query.isRefetching}
      actions={canTransfer ? [{ icon: "swap-horizontal", accessibilityLabel: "Virman yap", onPress: () => setTransfer({}) }] : undefined}
      overlay={canCreate ? <ToolFab app="muhasebe" label="Hesap aç" onPress={() => setEditing("new")} accessibilityLabel="Yeni hesap aç" /> : null}
    >
      {query.isLoading ? (
        <>
          <SkeletonCard />
          <SkeletonCard />
        </>
      ) : loadError ? (
        <Note tone="danger" icon="alert-circle-outline" text={loadError} action={{ label: "Tekrar dene", onPress: refresh }} />
      ) : (
        <>
          <MetricGrid columns={2}>
            <MetricTile label="Toplam bakiye" value={money(data?.totals?.all || 0)} hint={`${accounts.length} hesap · yalnız görebildikleriniz`} tone="brand" icon="business-outline" />
            {scopes.map((s) => (
              <MetricTile key={s} label={`${SCOPE_LABEL[s]} hesaplar`} value={money(data?.totals?.[s] ?? totalOf(s))} hint={SCOPE_BOOK[s]} onPress={() => setScope(s)} />
            ))}
          </MetricGrid>

          <ChipGroup scrollable contentPadding={0}>
            <Chip label="Tümü" count={accounts.length} selected={scope === "all"} onPress={() => setScope("all")} size="sm" />
            {scopes.map((s) => (
              <Chip key={s} label={SCOPE_LABEL[s]} count={accounts.filter((a) => a.scope === s).length} selected={scope === s} onPress={() => setScope(s)} size="sm" />
            ))}
          </ChipGroup>

          {shown.length ? (
            shown.map((a) => <AccountCard key={a.id} a={a} meta={data!} onPress={() => openDetail(a)} onMenu={() => setMenu(a)} />)
          ) : (
            <EmptyState
              icon="business-outline"
              title="Henüz hesap yok"
              body="Kasa, banka ya da kart hesabı açın. Hesabı bir ödeme yöntemine bağlarsanız o defterdeki ödenmiş kayıtlar bakiyeye kendiliğinden yansır."
              action={canCreate ? { label: "Hesap aç", onPress: () => setEditing("new") } : undefined}
              variant="inline"
            />
          )}

          <Panel title="Son virmanlar">
            {transfers.data?.items?.length ? (
              <View style={styles.list}>
                {transfers.data.items.slice(0, 50).map((t) => (
                  <TransferCard key={t.id} t={t} onPress={() => setTransferMenu(t)} />
                ))}
              </View>
            ) : (
              <Muted>Henüz virman yok.</Muted>
            )}
          </Panel>
        </>
      )}

      <ActionSheet visible={menu != null} onClose={() => setMenu(null)} title={menu?.name} actions={menu ? menuActions(menu) : []} />
      <ActionSheet
        visible={transferMenu != null}
        onClose={() => setTransferMenu(null)}
        title={transferMenu ? `Virman · ${money(transferMenu.amount)}` : undefined}
        actions={
          transferMenu
            ? [
                { label: "Düzenle", icon: "create-outline", onPress: () => setTransfer({ transfer: transferMenu }) },
                {
                  label: "Sil",
                  icon: "trash-outline",
                  danger: true,
                  onPress: async () => {
                    const t = transferMenu;
                    if (await confirmAction({ title: "Virman silinsin mi?", message: `${money(t.amount)} tutarındaki virman silinecek.`, confirmLabel: "Sil", destructive: true })) dropTransfer.mutate(t);
                  },
                },
              ]
            : []
        }
      />

      {data ? (
        <AccountSheet
          visible={editing != null}
          onClose={() => setEditing(null)}
          account={editing && editing !== "new" ? editing : null}
          meta={data}
          onSubmit={(body) => saveAccount.mutateAsync({ body, id: editing && editing !== "new" ? editing.id : undefined })}
        />
      ) : null}
      <TransferSheet
        visible={transfer != null}
        onClose={() => setTransfer(null)}
        accounts={accounts}
        transfer={transfer?.transfer}
        defaults={{ from: transfer?.from }}
        onSubmit={(body, message) => saveTransfer.mutateAsync({ body, id: transfer?.transfer?.id, message })}
      />
      <AccessSheet visible={access != null} account={access} onClose={() => setAccess(null)} onSubmit={(body) => saveAccess.mutateAsync({ id: access!.id, body })} />
      <FinanceEntrySheet
        visible={entry != null}
        onClose={() => setEntry(null)}
        accounts={postable}
        defaults={entry ? { type: entry.type, account_id: entry.account.id, status: "paid" } : undefined}
        title={entry ? `${entry.account.name} — ${entry.type === "income" ? "gelir ekle" : "gider ekle"}` : undefined}
        onSubmit={(body) => addEntry.mutateAsync(body)}
      />
    </AdminScreen>
  );
}

function AccountCard({ a, meta, onPress, onMenu }: { a: FinanceAccount; meta: FinanceAccountsResponse; onPress: () => void; onMenu: () => void }) {
  const level = accountLevel(a);
  const pending = a.pending || { income: 0, expense: 0 };
  const restricted = a.visibility === "restricted" || a.scope === "shared";
  const kindLabel = (meta.kinds || []).find((k) => k.key === a.kind)?.label || a.kind;
  const method = (meta.methods?.[a.scope] || []).find((m) => m.key === a.linked_method)?.label;
  const transfer = (a.transfersIn || 0) - (a.transfersOut || 0);
  return (
    <RecordCard
      title={a.name}
      subtitle={`${SCOPE_LABEL[a.scope]}${a.city_name ? ` · ${a.city_name}` : ""} · ${kindLabel}`}
      icon={KIND_ICON[a.kind] || "wallet-outline"}
      iconTone="brand"
      accentColor={a.color || colors.brand}
      value={money(a.balance)}
      valueTone={a.balance < 0 ? "danger" : "neutral"}
      onPress={onPress}
      onLongPress={onMenu}
      badges={[
        restricted ? { label: "Kısıtlı", icon: "lock-closed-outline", tone: "warn" } : null,
        a.shared_with ? { label: `Paylaşıldı (${a.shared_with})`, icon: "people-outline", tone: "info" } : null,
        level !== "manage" ? { label: level === "post" ? "Kayıt girebilirsiniz" : "Yalnız görüntüleme", tone: "neutral" } : null,
      ]}
      trailing={
        <Ionicons name="ellipsis-horizontal" size={20} color={colors.textTertiary} onPress={onMenu} accessibilityLabel={`${a.name} işlemleri`} />
      }
    >
      <View style={styles.parts}>
        <Part label="Gelir" value={money(a.income ?? Math.max(0, a.linked || 0))} color={colors.win} />
        <Part label="Gider" value={money(a.expense ?? Math.max(0, -(a.linked || 0)))} color={colors.danger} />
        <Part label="Virman" value={money(transfer, { signed: true })} />
      </View>
      {pending.income > 0 || pending.expense > 0 ? (
        <Text style={styles.pending} {...textScale.dense}>
          Bekleyen / tahmin: {pending.income > 0 ? `+${money(pending.income)} ` : ""}
          {pending.expense > 0 ? `−${money(pending.expense)}` : ""}
        </Text>
      ) : null}
      <Text style={styles.linked} {...textScale.dense}>
        {a.linked_method ? `${method || a.linked_method} hareketleri bağlı` : "Açılış + virman + doğrudan hareketler"}
        {` · ${LEVELS.find((l) => l.key === level)?.label}`}
      </Text>
    </RecordCard>
  );
}

function Part({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.part}>
      <Text style={styles.partLabel} {...textScale.badge}>
        {label}
      </Text>
      <Text style={[styles.partValue, color ? { color } : null]} numberOfLines={1} {...textScale.dense}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: space.sm },
  parts: { flexDirection: "row", gap: space.md, marginTop: space.xs },
  part: { flex: 1, gap: 2 },
  partLabel: { ...type.micro, color: colors.textTertiary },
  partValue: { ...type.numSm, color: colors.textPrimary },
  pending: { ...type.caption, color: colors.warn, marginTop: space.xs },
  linked: { ...type.caption, color: colors.textTertiary, marginTop: 2 },
});
