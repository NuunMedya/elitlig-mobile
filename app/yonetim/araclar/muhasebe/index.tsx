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
 * TASARIM: gece sahnesinde toplam bakiye (dönen rakam) + bu ayın gelir/gider
 * hapları + net/alacak/borç cam sayaçları; hap biçimli hızlı gider kutusu;
 * hesaplar renk degradeli yatay kart rayı; son hareketler kategori karolu
 * tek kart; defterler degrade karo ızgarası.
 *
 * ÖZET: hesapların toplam bakiyesi ve kapsam toplamları üstte; virman
 * düğmesi en az iki yönetilebilir hesap varsa açılır (web "Virman").
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { LinearGradient } from "expo-linear-gradient";

import { ActionSheet, AdminScreen, useAdminMutation } from "@/components/admin";
import { Pop } from "@/components/admin/home/AppTiles";
import { LineRow, Lines, StageChip, TileButton, ToolStage, categoryVisual } from "@/components/admin/tools/ToolKit";
import { AccountingNav } from "@/components/admin/accounting/AccountingNav";
import { TransferSheet } from "@/components/admin/accounting/financeSheets";
import { Note } from "@/components/admin/accounting/parts";
import { ToolFab } from "@/components/admin/tools/ToolApp";
import { EmptyState, Reveal, SectionHeader, SkeletonCard, Touchable, useToast, withAlpha, type IconTileTone } from "@/components/ui";
import { hasAnyPermission } from "@/lib/admin/access";
import { errorText } from "@/lib/admin/errors";
import { formatDate } from "@/lib/admin/format";
import { parseQuickAmount } from "@/lib/admin/quickParse";
import { TOOL_APPS } from "@/lib/admin/toolApps";
import {
  KIND_ICON,
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
import { colors, hairline, layout, radius, space, textScale, touchSlop, type, upperTR } from "@/theme";

const TONES: Record<string, IconTileTone> = { hesaplar: "violet", "on-muhasebe": "mint", mac: "cyan", turkiye: "gold" };
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
      {finance.isLoading ? (
        <SkeletonCard />
      ) : financeError ? (
        <Note tone="danger" text={financeError} icon="alert-circle-outline" action={{ label: "Tekrar dene", onPress: () => void finance.refetch() }} />
      ) : (
        <Reveal index={0}>
          <ToolStage
            icon="wallet"
            tone="mint"
            overline="Toplam bakiye · tüm hesaplar"
            value={money(finance.data?.totals?.all || 0)}
            valueTone={(finance.data?.totals?.all || 0) < 0 ? "danger" : undefined}
            caption={`${accounts.length} hesap · görebildikleriniz`}
            onPress={() => router.push("/yonetim/araclar/muhasebe/hesaplar" as never)}
            chips={
              summary ? (
                <>
                  <StageChip icon="arrow-down" tone="win" label={`Bu ay gelir ${compactMoney(summary.income)}`} />
                  <StageChip icon="arrow-up" tone="danger" label={`Gider ${compactMoney(summary.expense)}`} />
                </>
              ) : null
            }
            stats={
              summary
                ? [
                    { label: summary.net >= 0 ? "Net kâr" : "Net zarar", value: compactMoney(summary.net), tone: summary.net >= 0 ? "win" : "danger", onPress: () => openLedger() },
                    { label: "Alacak", value: compactMoney(summary.receivable), tone: summary.receivable ? "warn" : undefined, onPress: () => openLedger() },
                    { label: "Borç", value: compactMoney(summary.payable), tone: summary.payable ? "danger" : undefined, onPress: () => openLedger() },
                  ]
                : undefined
            }
          />
        </Reveal>
      )}

      <View style={styles.quick}>
        <View style={[styles.quickIcon, { backgroundColor: APP.accentSoft }]}>
          <Ionicons name="flash" size={16} color={APP.accent} />
        </View>
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
          hitSlop={touchSlop(36)}
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

      {ledger.error ? (
        <Note tone="danger" text={errorText(ledger.error)} icon="alert-circle-outline" action={{ label: "Tekrar dene", onPress: () => void ledger.refetch() }} />
      ) : null}

      {summary?.overdue ? (
        <Note
          tone="warn"
          icon="hourglass-outline"
          text={`${summary.overdue} kaydın vadesi geçti · bekleyen alacak ${money(summary.receivable)}`}
          action={{ label: "Vade takibi", onPress: () => openLedger() }}
        />
      ) : null}

      {accounts.length ? (
        <View style={styles.section}>
          <SectionHeader title="Hesaplarım" meta={`${accounts.length}`} inset="flush" action={{ label: "Tümü", onPress: () => router.push("/yonetim/araclar/muhasebe/hesaplar" as never) }} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.railScroller} contentContainerStyle={styles.rail}>
            {accounts.map((a, index) => (
              <Reveal key={a.id} index={index} axis="x">
                <Touchable
                  feedback="card"
                  onPress={() => router.push({ pathname: "/yonetim/araclar/muhasebe/hesap/[id]", params: { id: String(a.id) } } as never)}
                  style={styles.account}
                  accessibilityRole="button"
                  accessibilityLabel={`${a.name}, ${SCOPE_LABEL[a.scope]}: ${money(a.balance)}`}
                >
                  <LinearGradient colors={[withAlpha(a.color || colors.brand, 0.34), withAlpha(a.color || colors.brand, 0.06)]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                  <View style={styles.accountHead}>
                    <View style={[styles.accountIcon, { backgroundColor: a.color || colors.brand }]}>
                      <Ionicons name={KIND_ICON[a.kind] || "wallet-outline"} size={15} color={colors.onDark} />
                    </View>
                    <Text style={styles.accountScope} numberOfLines={1} {...textScale.badge}>
                      {upperTR(SCOPE_LABEL[a.scope])}
                    </Text>
                  </View>
                  <Text style={styles.accountName} numberOfLines={1} {...textScale.dense}>
                    {a.name}
                  </Text>
                  <Text style={[styles.accountValue, a.balance < 0 ? { color: colors.danger } : null]} numberOfLines={1} adjustsFontSizeToFit {...textScale.badge}>
                    {money(a.balance)}
                  </Text>
                  {a.pending && (a.pending.income || a.pending.expense) ? (
                    <Text style={styles.accountMeta} numberOfLines={1} {...textScale.badge}>
                      Bekleyen {a.pending.income ? `+${compactMoney(a.pending.income)}` : ""}
                      {a.pending.income && a.pending.expense ? " / " : ""}
                      {a.pending.expense ? `−${compactMoney(a.pending.expense)}` : ""}
                    </Text>
                  ) : (
                    <Text style={styles.accountMeta} numberOfLines={1} {...textScale.badge}>
                      {SCOPE_BOOK[a.scope]}
                    </Text>
                  )}
                </Touchable>
              </Reveal>
            ))}
          </ScrollView>
        </View>
      ) : null}

      <View style={styles.section}>
        <SectionHeader title="Son hareketler" meta="Bu ay" inset="flush" action={recent.length ? { label: "Tümü", onPress: () => openLedger() } : undefined} />
        {ledger.isLoading ? (
          <SkeletonCard />
        ) : recent.length ? (
          <Lines>
            {recent.map((e, index) => {
              const visual = categoryVisual(e.category, e.type);
              return (
                <Reveal key={e.id} index={index}>
                  <LineRow
                    icon={visual.icon}
                    tone={visual.tone}
                    title={e.description || e.party || LEDGER_TYPE_LABELS[e.type]}
                    sub={[e.category, e.party].filter(Boolean).join(" · ") || null}
                    meta={formatDate(e.entry_date)}
                    metaIcon="time-outline"
                    value={`${e.type === "income" ? "+" : "−"}${money(e.amount)}`}
                    valueTone={e.type === "income" ? "win" : "danger"}
                    badge={e.status === "pending" ? { label: e.type === "income" ? "Tahsil edilecek" : "Ödenecek", tone: "warn" } : null}
                    onPress={() => openLedger()}
                  />
                </Reveal>
              );
            })}
          </Lines>
        ) : (
          <EmptyState compact variant="inline" icon="receipt-outline" title="Bu ay kayıt yok" body="Gelir ve giderlerinizi hızlı gider kutusundan ya da Yeni kayıt ile ekleyin." />
        )}
      </View>

      <View style={styles.section}>
        <SectionHeader title="Defterler" inset="flush" />
        <View style={styles.grid}>
          {sections.map((s, index) => (
            <Pop key={s.key} index={index} style={styles.cell}>
              <TileButton
                icon={s.icon}
                tone={TONES[s.key]}
                title={s.label}
                hint={s.key === "hesaplar" && finance.data ? `${money(finance.data.totals?.all || 0)} · ${s.hint}` : s.hint}
                onPress={() => router.push(s.route as never)}
                style={styles.tile}
              />
            </Pop>
          ))}
        </View>
      </View>

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
  section: { gap: space.sm, marginTop: space.sm },
  quick: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingLeft: space.sm,
    paddingRight: space.sm,
    minHeight: 54,
    borderRadius: radius.pill,
    borderWidth: hairline,
    borderColor: colors.glassLine,
    backgroundColor: colors.glass,
  },
  quickIcon: { width: 34, height: 34, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  quickInput: { flex: 1, ...type.body, color: colors.textPrimary, paddingVertical: space.sm },
  quickSend: { width: 36, height: 36, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  off: { opacity: 0.4 },
  railScroller: { marginHorizontal: -layout.screenPadding },
  rail: { gap: space.sm, paddingHorizontal: layout.screenPadding },
  account: {
    width: 176,
    minHeight: 132,
    gap: space.xxs,
    padding: space.md,
    borderRadius: radius.xl,
    borderWidth: hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface1,
    overflow: "hidden",
  },
  accountHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: space.sm },
  accountIcon: { width: 30, height: 30, borderRadius: radius.sm, alignItems: "center", justifyContent: "center" },
  accountScope: { ...type.nano, color: colors.textSecondary },
  accountName: { ...type.labelSm, color: colors.textSecondary },
  accountValue: { ...type.metric, color: colors.textPrimary },
  accountMeta: { ...type.micro, color: colors.textTertiary },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  cell: { flexBasis: "47%", flexGrow: 1 },
  tile: { flexBasis: "auto" },
  hint: { paddingHorizontal: space.xs },
  hintText: { ...type.caption, color: colors.textTertiary, paddingHorizontal: space.sm },
});
