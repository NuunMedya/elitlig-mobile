/**
 * MUHASEBE MERKEZİ — web /yonetim/araclar/muhasebe (AccountingHub).
 *
 * Dört bölüm tek yerde; her biri ayrı ekranda düzenlenir:
 *   Hesaplar ve Virman · Ön Muhasebe · Maç Muhasebesi · Türkiye Geneli
 *
 * GÖRÜNÜRLÜK web visibleSections ile birebir: Maç Muhasebesi accounting.*
 * yetkisiyle, Türkiye Geneli national_accounting.* yetkisi + Türkiye geneli
 * rolle görünür; Hesaplar ve Ön Muhasebe her yönetim kullanıcısına açık.
 *
 * ÖZET: hesapların toplam bakiyesi ve kapsam toplamları üstte; virman
 * düğmesi en az iki yönetilebilir hesap varsa açılır (web "Virman").
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";

import { ActionSheet, AdminScreen, Panel, RecordCard, useAdminMutation } from "@/components/admin";
import { AccountingNav } from "@/components/admin/accounting/AccountingNav";
import { TransferSheet } from "@/components/admin/accounting/financeSheets";
import { Note } from "@/components/admin/accounting/parts";
import { ToolFab, ToolSummary } from "@/components/admin/tools/ToolApp";
import { HubGrid, HubTile, MetricGrid, MetricTile, SkeletonCard, Touchable, useToast, type HubTone } from "@/components/ui";
import { hasAnyPermission } from "@/lib/admin/access";
import { errorText } from "@/lib/admin/errors";
import { formatDate } from "@/lib/admin/format";
import { parseQuickAmount } from "@/lib/admin/quickParse";
import { TOOL_APPS } from "@/lib/admin/toolApps";
import {
  LEDGER_TYPE_LABELS,
  SCOPES,
  SCOPE_BOOK,
  SCOPE_LABEL,
  canManageAccount,
  compactMoney,
  createLedgerEntry,
  createTransfer,
  getLedger,
  ledgerPeriodRange,
  listAccounts,
  money,
  todayKey,
  visibleSections,
} from "@/lib/api/admin/accounting";
import { ApiError } from "@/lib/http";
import { useAuth } from "@/providers/AuthProvider";
import { colors, hairline, radius, space, textScale, touchSlop, type } from "@/theme";

const TONES: Record<string, HubTone> = { hesaplar: "brand", "on-muhasebe": "win", mac: "accent", turkiye: "info" };
const APP = TOOL_APPS.muhasebe;
const LEDGER_ROUTE = "/yonetim/araclar/muhasebe/on-muhasebe";

export default function AccountingHubScreen() {
  const auth = useAuth();
  const router = useRouter();
  const toast = useToast();
  const [transfer, setTransfer] = useState(false);
  const [adding, setAdding] = useState(false);
  const [quick, setQuick] = useState("");
  const sections = visibleSections(auth.user, (perms) => hasAnyPermission(auth.user, perms));
  const finance = useQuery({ queryKey: ["admin", "finance", "accounts"], queryFn: () => listAccounts() });
  const accounts = (finance.data?.items || []).filter((a) => !a.archived);
  const canTransfer = accounts.filter(canManageAccount).length >= 2;
  const scopes = SCOPES.filter((s) => finance.data?.access?.[s]?.view || accounts.some((a) => a.scope === s));

  // Bu ayın kişisel defteri: özet rakamları ve son hareketler (Ön Muhasebe ile aynı önbellek anahtarı).
  const range = useMemo(() => ledgerPeriodRange("this_month", new Date()), []);
  const ledger = useQuery({ queryKey: ["admin", "ledger", range.from, range.to], queryFn: () => getLedger({ from: range.from || undefined, to: range.to || undefined }) });
  const summary = ledger.data?.summary;
  const recent = useMemo(
    () => [...(ledger.data?.items || [])].sort((a, b) => (b.entry_date || "").localeCompare(a.entry_date || "") || b.id - a.id).slice(0, 5),
    [ledger.data]
  );

  const save = useAdminMutation((args: { body: Parameters<typeof createTransfer>[0]; message: string }) => createTransfer(args.body), {
    success: (_r, v) => v.message,
    invalidate: [["admin", "finance"]],
    silentError: true,
  });

  /** Hızlı gider: "1.250 hakem ücreti" → bugünün tarihiyle, nakit, ödendi (masaüstü hızlı kayıt ile aynı). */
  const quickExpense = useAdminMutation(
    (input: { amount: number; description: string }) =>
      createLedgerEntry({
        type: "expense",
        amount: input.amount,
        vat_rate: 0,
        category: "",
        party: "",
        description: input.description,
        entry_date: todayKey(),
        due_date: null,
        status: "paid",
        method: "cash",
        document_no: "",
        note: "",
        account_id: null,
      }),
    {
      success: (_r, v) => `${money(v.amount)} gider kaydedildi${v.description ? `: ${v.description}` : ""}.`,
      invalidate: [["admin", "ledger"], ["admin", "finance"], ["admin", "tools"]],
      onSuccess: () => setQuick(""),
    }
  );
  const parsedQuick = parseQuickAmount(quick);
  const submitQuick = () => {
    if (quickExpense.isPending || !quick.trim()) return;
    if (!parsedQuick) {
      toast.show({ message: "Tutarı başa yaz: örn. 1.250 hakem ücreti", tone: "danger" });
      return;
    }
    quickExpense.mutate(parsedQuick);
  };
  const openLedger = (yeni?: "income" | "expense") => router.push((yeni ? { pathname: LEDGER_ROUTE, params: { yeni } } : LEDGER_ROUTE) as never);

  const financeError =
    finance.error instanceof ApiError && finance.error.status === 404
      ? "Hesaplar ve Virman için sunucu güncellemesi henüz yayında değil."
      : finance.error
        ? errorText(finance.error)
        : null;

  return (
    <AdminScreen
      app="muhasebe"
      appTabs={<AccountingNav current="ozet" />}
      title="Muhasebe"
      subtitle={finance.data ? `Toplam bakiye ${money(finance.data.totals?.all || 0)}` : "Hesaplar, defterler ve virman"}
      onRefresh={() => {
        void finance.refetch();
        void ledger.refetch();
      }}
      refreshing={finance.isRefetching || ledger.isRefetching}
      actions={canTransfer ? [{ icon: "swap-horizontal", accessibilityLabel: "Virman yap", onPress: () => setTransfer(true) }] : undefined}
      overlay={<ToolFab app="muhasebe" label="Yeni kayıt" onPress={() => setAdding(true)} onLongPress={() => openLedger("expense")} accessibilityLabel="Yeni gelir, gider ya da virman" />}
    >
      <View style={styles.quick}>
        <Ionicons name="flash-outline" size={20} color={APP.accent} />
        <TextInput
          value={quick}
          onChangeText={setQuick}
          placeholder="Hızlı gider: 1.250 hakem ücreti"
          placeholderTextColor={colors.textTertiary}
          style={styles.quickInput}
          returnKeyType="send"
          onSubmitEditing={submitQuick}
          maxLength={200}
          accessibilityLabel="Hızlı gider kaydı; önce tutar, sonra açıklama"
        />
        <Touchable
          feedback="icon"
          haptic="success"
          onPress={submitQuick}
          disabled={quickExpense.isPending || !quick.trim()}
          hitSlop={touchSlop(32)}
          accessibilityLabel="Gideri kaydet"
          style={[styles.quickSend, { backgroundColor: APP.accent }, !quick.trim() ? styles.off : null]}
        >
          <Ionicons name="arrow-up" size={18} color={APP.onAccent} />
        </Touchable>
      </View>
      <Text style={styles.hintText} {...textScale.dense}>
        {parsedQuick
          ? `${money(parsedQuick.amount)} gider${parsedQuick.description ? ` · ${parsedQuick.description}` : ""} · bugün, nakit, ödendi`
          : "Bugünün tarihiyle, nakit ve ödendi olarak Ön Muhasebe'ye yazılır. Ayrıntı için Yeni kayıt."}
      </Text>

      {ledger.isLoading ? (
        <SkeletonCard />
      ) : summary ? (
        <ToolSummary
          app="muhasebe"
          stats={[
            { label: "BU AY GELİR", value: compactMoney(summary.income), tone: "win", onPress: () => openLedger() },
            { label: "BU AY GİDER", value: compactMoney(summary.expense), tone: "danger", onPress: () => openLedger() },
            { label: summary.net >= 0 ? "NET KÂR" : "NET ZARAR", value: compactMoney(summary.net), tone: summary.net >= 0 ? "accent" : "danger", onPress: () => openLedger() },
          ]}
        />
      ) : ledger.error ? (
        <Note tone="danger" text={errorText(ledger.error)} icon="alert-circle-outline" action={{ label: "Tekrar dene", onPress: () => void ledger.refetch() }} />
      ) : null}

      {summary && (summary.receivable || summary.payable) ? (
        <Note
          tone={summary.overdue ? "warn" : "info"}
          icon="hourglass-outline"
          text={`Bekleyen alacak ${money(summary.receivable)} · bekleyen borç ${money(summary.payable)}${summary.overdue ? ` · ${summary.overdue} kaydın vadesi geçti` : ""}`}
          action={{ label: "Vade takibi", onPress: () => openLedger() }}
        />
      ) : null}

      {finance.isLoading ? (
        <SkeletonCard />
      ) : financeError ? (
        <Note tone="danger" text={financeError} icon="alert-circle-outline" action={{ label: "Tekrar dene", onPress: () => void finance.refetch() }} />
      ) : (
        <MetricGrid columns={2}>
          <MetricTile label="Toplam bakiye" value={money(finance.data?.totals?.all || 0)} hint={`${accounts.length} hesap · görebildikleriniz`} icon="business-outline" tone="brand" onPress={() => router.push("/yonetim/araclar/muhasebe/hesaplar" as never)} />
          {scopes.map((s) => (
            <MetricTile
              key={s}
              label={`${SCOPE_LABEL[s]} hesaplar`}
              value={money(finance.data?.totals?.[s] ?? accounts.filter((a) => a.scope === s).reduce((n, a) => n + (Number(a.balance) || 0), 0))}
              hint={SCOPE_BOOK[s]}
            />
          ))}
        </MetricGrid>
      )}

      {recent.length ? (
        <Panel title="Son hareketler" action={{ label: "Tümü", onPress: () => openLedger() }}>
          <View style={styles.list}>
            {recent.map((e) => (
              <RecordCard
                key={e.id}
                title={e.description || e.party || LEDGER_TYPE_LABELS[e.type]}
                subtitle={[e.category, e.party].filter(Boolean).join(" · ") || null}
                meta={formatDate(e.entry_date)}
                icon={e.type === "income" ? "arrow-down" : "arrow-up"}
                iconTone={e.type === "income" ? "win" : "danger"}
                value={`${e.type === "income" ? "+" : "−"}${money(e.amount)}`}
                valueTone={e.type === "income" ? "win" : "danger"}
                badges={e.status === "pending" ? [{ label: "Bekliyor", tone: "warn" }] : undefined}
                onPress={() => openLedger()}
              />
            ))}
          </View>
        </Panel>
      ) : null}

      <Panel title="Bölümler">
        <HubGrid inset="flush">
          {sections.map((s) => (
            <HubTile
              key={s.key}
              icon={s.icon}
              title={s.label}
              subtitle={s.key === "hesaplar" && finance.data ? money(finance.data.totals?.all || 0) : s.hint}
              tone={TONES[s.key]}
              onPress={() => router.push(s.route as never)}
            />
          ))}
        </HubGrid>
      </Panel>

      {sections.length < 4 ? (
        <View style={styles.hint}>
          <Text style={styles.hintText} {...textScale.long}>
            Maç Muhasebesi il muhasebe yetkisiyle, Türkiye Geneli ise Türkiye geneli muhasebe yetkisi ve Türkiye geneli rolle görünür.
          </Text>
        </View>
      ) : null}

      <ActionSheet
        visible={adding}
        onClose={() => setAdding(false)}
        title="Yeni kayıt"
        actions={[
          { label: "Gider ekle", icon: "arrow-up-circle-outline", onPress: () => openLedger("expense") },
          { label: "Gelir ekle", icon: "arrow-down-circle-outline", onPress: () => openLedger("income") },
          { label: "Virman yap", icon: "swap-horizontal", hidden: !canTransfer, onPress: () => setTransfer(true) },
          { label: "Maç muhasebesine git", icon: "football-outline", hidden: !sections.some((x) => x.key === "mac"), onPress: () => router.push("/yonetim/araclar/muhasebe/mac" as never) },
        ]}
      />

      <TransferSheet
        visible={transfer}
        onClose={() => setTransfer(false)}
        accounts={accounts}
        onSubmit={(body, message) => save.mutateAsync({ body, message })}
      />
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  quick: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: space.md,
    minHeight: 52,
    borderRadius: radius.xl,
    borderWidth: hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface1,
  },
  quickInput: { flex: 1, ...type.body, color: colors.textPrimary, paddingVertical: space.sm },
  quickSend: { width: 32, height: 32, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  off: { opacity: 0.4 },
  list: { gap: space.sm },
  hint: { paddingHorizontal: space.xs },
  hintText: { ...type.caption, color: colors.textTertiary },
});
