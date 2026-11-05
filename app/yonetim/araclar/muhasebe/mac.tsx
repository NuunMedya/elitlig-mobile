/**
 * MAÇ MUHASEBESİ — web Muhasebe → Maç Muhasebesi (accounting/AccountingAdmin.js).
 *
 * İl defteri: maç maç takımlardan alınan ücretler ve saha/hakem/call center/
 * spiker/reji/sağlıkçı/fotoğrafçı/sosyal medya giderleri; gün sonu kalemleri,
 * gün ve ay toplamları; kâr, tahsilat ve personel raporları.
 *
 *   Genel Bakış · Defter · Raporlar · Personel · Takım Tahsilatları ·
 *   Genel Kayıtlar · Eksikler · Ayarlar
 *
 * KAPSAM: il rolü kendi ilinin defterini açar; Türkiye geneli kullanıcı
 * (il seçerek görüntülemiyorsa) il seçer ya da tüm illerin ortak defterini
 * görür (?cityId). Yazma eylemleri accounting.manage ister; yalnız
 * accounting.view olan kullanıcı her şeyi salt okunur görür.
 *
 * İLK KURULUM: deftere dahil sezon seçilmemişse sezon seçici açılır.
 * DIŞA AKTARMA: defter, dönem özeti, personel ve takım raporları CSV olarak
 * paylaşılır (web "Dışa aktar" menüsü). Silinen kalem toast'taki "Geri al"
 * ile aynı bilgilerle yeniden oluşturulur; toplu ödendi işareti de geri alınır.
 *
 * Masaüstü-özel süsler (klavye kısayolları, sütun gizleme, satır yoğunluğu,
 * tablo/kart geçişi, yazdır) telefonda yoktur: defter zaten kart görünümüdür.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";

import { ActionSheet, AdminScreen, DateField, Panel, SelectField, confirmAction } from "@/components/admin";
import { GeneralEntrySheet, StatementSheet } from "@/components/admin/accounting/match/MatchSheets";
import { MatchSettings, SeasonPicker } from "@/components/admin/accounting/match/MatchSettings";
import { MatchSheet } from "@/components/admin/accounting/match/MatchSheet";
import {
  GeneralView,
  LedgerView,
  MissingView,
  OverviewView,
  ReportsView,
  StaffView,
  TeamsView,
} from "@/components/admin/accounting/match/MatchViews";
import { AccountStrip, Muted, Note, RangeBar } from "@/components/admin/accounting/parts";
import { TransferSheet } from "@/components/admin/accounting/financeSheets";
import { shareCsv } from "@/components/admin/accounting/share";
import { BottomSheet, Button, Chip, ChipGroup, SkeletonCard, Tabs, useToast } from "@/components/ui";
import { hasAnyPermission } from "@/lib/admin/access";
import { errorText } from "@/lib/admin/errors";
import {
  ACCOUNTING_PERMISSIONS,
  MATCH_PRESETS,
  accApplyDefaults,
  accBook,
  accCreateEntry,
  accDeleteEntry,
  accMeta,
  accSaveCells,
  accSaveSettings,
  accSeasons,
  accSetStatus,
  accStaff,
  accUpdateEntry,
  allMatches,
  bookCsv,
  createTransfer,
  currentMonthRange,
  isNationwideUser,
  listAccounts,
  listCities,
  money,
  nextMonthDay,
  pendingIds,
  rangeLabel,
  shiftRange,
  shortDay,
  staffCsv,
  staffStatement,
  summaryCsv,
  teamStatement,
  teamsCsv,
  type AccDay,
  type AccEntry,
  type AccEntryBody,
  type AccMatch,
  type AccSettings,
  type AccStaffRow,
  type AccTeamRow,
  type CellBody,
  type DayRange,
} from "@/lib/api/admin/accounting";
import { useAuth } from "@/providers/AuthProvider";
import { space } from "@/theme";

const TABS = [
  { key: "overview", label: "Genel Bakış" },
  { key: "ledger", label: "Defter" },
  { key: "reports", label: "Raporlar" },
  { key: "staff", label: "Personel" },
  { key: "teams", label: "Takım Tahsilatları" },
  { key: "general", label: "Genel Kayıtlar" },
  { key: "missing", label: "Eksikler" },
  { key: "settings", label: "Ayarlar" },
] as const;
type TabKey = (typeof TABS)[number]["key"];
const PREF = { city: "acc.pref.city", tab: "acc.pref.tab" };

export default function MatchAccountingScreen() {
  const auth = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const nationwide = isNationwideUser(auth.user);
  const canManage = hasAnyPermission(auth.user, ["accounting.manage"]);

  const [cityId, setCityId] = useState<string>("");
  const [tab, setTab] = useState<TabKey>("ledger");
  const [range, setRange] = useState<DayRange>(currentMonthRange);
  const [seasonFilter, setSeasonFilter] = useState<number[]>([]);
  const [setupSeasons, setSetupSeasons] = useState<number[] | null>(null);
  const [rangeSheet, setRangeSheet] = useState(false);
  const [exportSheet, setExportSheet] = useState(false);
  const [drawer, setDrawer] = useState<{ id: number; list: number[] } | null>(null);
  const [statement, setStatement] = useState<{ kind: "team"; row: AccTeamRow } | { kind: "staff"; row: AccStaffRow } | null>(null);
  const [matchMenu, setMatchMenu] = useState<AccMatch | null>(null);
  const [dayMenu, setDayMenu] = useState<AccDay | null>(null);
  const [entrySheet, setEntrySheet] = useState<{ entry?: AccEntry; date?: string } | null>(null);
  const [busy, setBusy] = useState<"" | "defaults" | "settings">("");
  const [transfer, setTransfer] = useState(false);

  useEffect(() => {
    AsyncStorage.multiGet([PREF.city, PREF.tab])
      .then((pairs) => {
        const [city, savedTab] = pairs.map(([, v]) => v);
        if (city && nationwide) setCityId(city);
        if (savedTab && TABS.some((t) => t.key === savedTab)) setTab(savedTab as TabKey);
      })
      .catch(() => undefined);
  }, [nationwide]);
  const chooseTab = (key: TabKey) => {
    setTab(key);
    AsyncStorage.setItem(PREF.tab, key).catch(() => undefined);
  };
  const chooseCity = (id: string) => {
    setCityId(id);
    setSeasonFilter([]);
    AsyncStorage.setItem(PREF.city, id).catch(() => undefined);
  };

  const scope = useMemo(() => (nationwide && cityId ? { cityId } : {}), [nationwide, cityId]);
  const scopeKey = scope.cityId || "own";
  const cities = useQuery({ queryKey: ["admin", "accounting", "cities"], queryFn: listCities, enabled: nationwide, staleTime: 10 * 60_000 });
  const meta = useQuery({ queryKey: ["admin", "accounting", "meta", scopeKey], queryFn: () => accMeta(scope) });
  const seasons = useQuery({ queryKey: ["admin", "accounting", "seasons", scopeKey], queryFn: () => accSeasons(scope) });
  const staff = useQuery({ queryKey: ["admin", "accounting", "staff", scopeKey], queryFn: () => accStaff(scope).catch(() => ({ items: [] })) });
  const book = useQuery({
    queryKey: ["admin", "accounting", "book", scopeKey, range.from, range.to, seasonFilter.join(",")],
    queryFn: () => accBook({ ...range, seasonIds: seasonFilter }, scope),
    placeholderData: (prev) => prev,
  });
  const accounts = useQuery({ queryKey: ["admin", "finance", "accounts"], queryFn: () => listAccounts(), retry: false });

  const data = book.data;
  const categories = meta.data?.categories || [];
  const paymentMethods = meta.data?.paymentMethods || [];
  const settings = data?.settings;
  const hasSeasons = (settings?.seasonIds || []).length > 0;
  const staffList = staff.data?.items || [];
  const knownFields = useMemo(() => [...new Set(allMatches(data).map((m) => m.field).filter(Boolean) as string[])], [data]);
  const reports = data?.reports;
  const badges: Partial<Record<TabKey, number>> = {
    missing: reports?.missing?.length || 0,
    teams: reports?.teams?.filter((r) => r.outstanding > 0).length || 0,
    staff: reports?.staff?.filter((r) => r.pending > 0).length || 0,
  };

  /* ----------------------------- yazma işlemleri ----------------------------- */

  const refreshBook = () => qc.invalidateQueries({ queryKey: ["admin", "accounting", "book"] });
  const run = async <T,>(fn: () => Promise<T>, opts: { success?: string | ((r: T) => string); action?: { label: string; onPress: () => void } } = {}): Promise<boolean> => {
    try {
      const result = await fn();
      if (opts.success) toast.show({ message: typeof opts.success === "function" ? opts.success(result) : opts.success, tone: "success", action: opts.action, duration: opts.action ? 7000 : undefined });
      await refreshBook();
      // Ödenmiş kayıtlar bağlı hesapların bakiyesini değiştirir.
      void qc.invalidateQueries({ queryKey: ["admin", "finance"] });
      return true;
    } catch (error) {
      toast.show({ message: errorText(error), tone: "danger" });
      return false;
    }
  };

  const saveCells = (matchId: number, cells: Record<string, CellBody>) => run(() => accSaveCells(matchId, cells, scope), { success: "Maç kaydedildi." });
  const createEntry = (body: AccEntryBody, success = "Kalem eklendi.") => run(() => accCreateEntry(body, scope), { success });
  const updateEntry = (id: number, body: Partial<AccEntryBody>) => run(() => accUpdateEntry(id, body, scope));

  const restoreEntry = (entry: AccEntry) => {
    const category = categories.find((c) => c.key === entry.category);
    if (category?.fixed && entry.matchId) {
      return run(
        () =>
          accSaveCells(entry.matchId as number, {
            [entry.category]: { amount: entry.amount, status: entry.status, paymentMethod: entry.paymentMethod, note: entry.note, ...(entry.direction === "expense" ? { staffId: entry.staffId } : {}) },
          }, scope),
        { success: "Kayıt geri alındı." }
      );
    }
    return run(
      () =>
        accCreateEntry({
          matchId: entry.matchId,
          date: entry.matchId ? undefined : entry.date,
          category: entry.category,
          title: entry.title,
          amount: entry.amount,
          status: entry.status,
          paymentMethod: entry.paymentMethod,
          staffId: entry.staffId,
          seasonId: entry.seasonId,
          note: entry.note,
        }, scope),
      { success: "Kayıt geri alındı." }
    );
  };

  const deleteEntry = async (entry: AccEntry) => {
    const ok = await confirmAction({ title: "Kalem silinsin mi?", message: `"${entry.title || entry.categoryLabel}" (${money(entry.amount)}) silinecek. Hemen ardından "Geri al" ile kurtarabilirsiniz.`, confirmLabel: "Sil", destructive: true });
    if (!ok) return;
    setEntrySheet(null);
    await run(() => accDeleteEntry(entry.id, scope), { success: "Kalem silindi.", action: { label: "Geri al", onPress: () => void restoreEntry(entry) } });
  };

  const markPaid = async (ids: number[], message: string) => {
    if (!ids.length) return;
    if (!(await confirmAction({ title: "Ödeme durumu", message, confirmLabel: "Evet, işaretle" }))) return;
    await run(() => accSetStatus(ids, "paid", scope), {
      success: (r) => `${r.updated} kayıt güncellendi.`,
      action: { label: "Geri al", onPress: () => void run(() => accSetStatus(ids, "pending", scope), { success: "Geri alındı." }) },
    });
  };

  const fillMatches = async (matchIds: number[], label?: string) => {
    if (!matchIds.length) return;
    const ok = await confirmAction({
      title: "Varsayılanlarla doldur",
      message: `${label || `${matchIds.length} maçın`} BOŞ kutucukları Ayarlar'daki varsayılan tutarlar ve saha/takım/personel tarifeleriyle doldurulsun mu? Dolu kutucuklara dokunulmaz.`,
      confirmLabel: "Doldur",
    });
    if (!ok) return;
    setBusy("defaults");
    await run(() => accApplyDefaults({ ...range, seasonIds: seasonFilter, matchIds }, scope), {
      success: (r) => (r.created ? `${r.matches} maçta ${r.created} kutucuk dolduruldu.` : "Doldurulacak boş kutucuk yok (ya da Ayarlar'da varsayılan tutar girilmemiş)."),
    });
    setBusy("");
  };

  const applyDefaults = async () => {
    const ok = await confirmAction({
      title: "Varsayılanları uygula",
      message: `${rangeLabel(range)} dönemindeki maçların BOŞ kutucukları Ayarlar'daki varsayılan tutarlar ve tarifelerle doldurulsun mu? Dolu kutucuklara ve kilitli döneme dokunulmaz.`,
      confirmLabel: "Uygula",
    });
    if (!ok) return;
    setBusy("defaults");
    await run(() => accApplyDefaults({ ...range, seasonIds: seasonFilter }, scope), {
      success: (r) => (r.created ? `${r.matches} maçta ${r.created} kutucuk dolduruldu.${r.locked ? ` ${r.locked} kilitli maç atlandı.` : ""}` : "Doldurulacak boş kutucuk yok (ya da Ayarlar'da varsayılan tutar girilmemiş)."),
    });
    setBusy("");
  };

  const onMatchAction = (m: AccMatch, action: "defaults" | "collect" | "pay") => {
    const label = `${m.home} - ${m.away}`;
    if (action === "defaults") return void fillMatches([m.id], `${label} maçının`);
    if (action === "collect") {
      const ids = pendingIds([m], { income: true });
      if (!ids.length) toast.show({ message: "Bu maçta bekleyen takım ücreti yok." });
      else void markPaid(ids, `${label}: takım ücretleri tahsil edildi olarak işaretlensin mi?`);
    }
    if (action === "pay") {
      const ids = pendingIds([m], { expense: true });
      if (!ids.length) toast.show({ message: "Bu maçta bekleyen gider yok." });
      else void markPaid(ids, `${label}: ${ids.length} gider ödendi olarak işaretlensin mi?`);
    }
  };

  const onDayAction = (d: AccDay, action: "defaults" | "collect" | "pay" | "entry") => {
    const label = rangeLabel({ from: d.date, to: d.date });
    if (action === "entry") return setEntrySheet({ date: d.date });
    if (action === "defaults") return void fillMatches(d.matches.filter((m) => !m.locked).map((m) => m.id), `${label} günündeki maçların`);
    if (action === "collect") {
      const ids = pendingIds(d.matches, { income: true });
      if (!ids.length) toast.show({ message: "Bu günde bekleyen takım ücreti yok." });
      else void markPaid(ids, `${label}: ${ids.length} takım ücreti tahsil edildi olarak işaretlensin mi?`);
    }
    if (action === "pay") {
      const ids = pendingIds(d.matches, { expense: true, dayEntries: d.entries });
      if (!ids.length) toast.show({ message: "Bu günde bekleyen gider yok." });
      else void markPaid(ids, `${label}: ${ids.length} gider ödendi olarak işaretlensin mi?`);
    }
  };

  const saveSettings = async (next: Partial<AccSettings>) => {
    setBusy("settings");
    try {
      await accSaveSettings(next, scope);
      toast.show({ message: "Muhasebe ayarları kaydedildi.", tone: "success" });
      setSeasonFilter([]);
      setSetupSeasons(null);
      await qc.invalidateQueries({ queryKey: ["admin", "accounting"] });
    } catch (error) {
      toast.show({ message: errorText(error), tone: "danger" });
    } finally {
      setBusy("");
    }
  };

  const saveTransfer = async (body: Parameters<typeof createTransfer>[0], message: string) => {
    await createTransfer(body);
    toast.show({ message, tone: "success" });
    void qc.invalidateQueries({ queryKey: ["admin", "finance"] });
  };

  /* ----------------------------- maç ayrıntısı ----------------------------- */

  const matchesById = useMemo(() => new Map(allMatches(data).map((m) => [m.id, m])), [data]);
  const drawerMatch = drawer ? matchesById.get(drawer.id) || null : null;
  const drawerList = drawer ? drawer.list.filter((id) => matchesById.has(id)) : [];
  const drawerIndex = drawerMatch ? drawerList.indexOf(drawerMatch.id) : -1;
  const openMatch = (m: AccMatch, list?: AccMatch[]) => setDrawer({ id: m.id, list: (list && list.some((x) => x.id === m.id) ? list : allMatches(data)).map((x) => x.id) });
  const statementRows = useMemo(() => {
    if (!statement || !data) return [];
    return statement.kind === "team" ? teamStatement(data, statement.row) : staffStatement(data, statement.row);
  }, [statement, data]);

  const exportItems = data
    ? [
        { label: "Defter (Excel / CSV)", icon: "book-outline" as const, onPress: () => void shareCsv(`muhasebe-${range.from}_${range.to}.csv`, bookCsv(data, categories)) },
        { label: "Dönem özeti (CSV)", icon: "pie-chart-outline" as const, onPress: () => void shareCsv(`ozet-${range.from}_${range.to}.csv`, summaryCsv(data, categories)) },
        { label: "Personel raporu (CSV)", icon: "people-outline" as const, onPress: () => void shareCsv(`personel-${range.from}_${range.to}.csv`, staffCsv(data)) },
        { label: "Takım tahsilatları (CSV)", icon: "shield-outline" as const, onPress: () => void shareCsv(`takimlar-${range.from}_${range.to}.csv`, teamsCsv(data)) },
      ]
    : [];

  const setup = setupSeasons ?? seasons.data?.selectedSeasonIds ?? [];
  const cityName = data?.book?.cityName || meta.data?.book?.cityName;
  const loadError = book.error || meta.error;

  return (
    <AdminScreen
      title="Maç Muhasebesi"
      subtitle={cityName ? `İl defteri · ${cityName}` : nationwide ? "Tüm iller (ortak defter)" : "İl defteri"}
      permission={ACCOUNTING_PERMISSIONS}
      onRefresh={() => void qc.invalidateQueries({ queryKey: ["admin", "accounting"] })}
      refreshing={book.isRefetching}
      actions={hasSeasons ? [{ icon: "share-outline", accessibilityLabel: "Dışa aktar", onPress: () => setExportSheet(true) }] : undefined}
    >
      {accounts.data ? (
        <AccountStrip accounts={(accounts.data.items || []).filter((a) => !a.archived)} scope="city" cityId={data?.book?.cityId ?? (cityId || null)} onTransfer={() => setTransfer(true)} />
      ) : null}

      {nationwide ? (
        <SelectField<string>
          label="İl"
          value={cityId || ""}
          options={[{ value: "", label: "Tüm iller (ortak defter)" }, ...(cities.data || []).map((c) => ({ value: String(c.id), label: c.city_name }))]}
          onChange={(v) => chooseCity(v || "")}
        />
      ) : null}

      <RangeBar label={rangeLabel(range)} onPrev={() => setRange((r) => shiftRange(r, -1))} onNext={() => setRange((r) => shiftRange(r, 1))} onPick={() => setRangeSheet(true)} />

      {hasSeasons && data?.selectedSeasons && data.selectedSeasons.length > 1 ? (
        <ChipGroup scrollable contentPadding={0}>
          <Chip label="Tüm sezonlar" size="sm" selected={!seasonFilter.length} onPress={() => setSeasonFilter([])} />
          {data.selectedSeasons.map((s) => {
            const on = seasonFilter.includes(s.id);
            return <Chip key={s.id} label={`${s.league} · ${s.name}`} size="sm" selected={on} onPress={() => setSeasonFilter(on ? seasonFilter.filter((x) => x !== s.id) : [...seasonFilter, s.id])} />;
          })}
        </ChipGroup>
      ) : null}

      {settings?.lockedUntil ? (
        <Note icon="lock-closed-outline" tone="warn" text={`${rangeLabel({ from: settings.lockedUntil, to: settings.lockedUntil })} dahil öncesi kilitli: tutarlar değiştirilemez.`} action={{ label: "Ayarlar", onPress: () => chooseTab("settings") }} />
      ) : null}

      {hasSeasons && canManage ? <Button label="Varsayılanları uygula" icon="flash-outline" variant="secondary" onPress={() => void applyDefaults()} loading={busy === "defaults"} /> : null}

      <Tabs items={TABS.map((t) => ({ key: t.key, label: t.label, badge: badges[t.key] || undefined }))} value={tab} onChange={chooseTab} distribute="scroll" />

      {book.isLoading && !data ? (
        <>
          <SkeletonCard />
          <SkeletonCard />
        </>
      ) : loadError && !data ? (
        <Note tone="danger" icon="alert-circle-outline" text={errorText(loadError)} action={{ label: "Tekrar dene", onPress: () => void book.refetch() }} />
      ) : !hasSeasons && tab !== "settings" ? (
        <Panel title="Başlamak için muhasebeye dahil edilecek lig ve sezonları seçin">
          <Muted>Örneğin "Freelig · 15. Sezon". Birden fazla lig ve sezon seçebilirsiniz; defterde ve raporlarda yalnızca seçtikleriniz görünür. Seçimi sonra Ayarlar'dan değiştirebilirsiniz.</Muted>
          {canManage ? (
            <>
              <SeasonPicker leagues={seasons.data?.leagues || []} selected={setup} onChange={setSetupSeasons} />
              <Button
                label={setup.length ? `${setup.length} sezonla başla` : "Sezon seçin"}
                disabled={!setup.length}
                loading={busy === "settings"}
                onPress={() => void saveSettings({ seasonIds: setup })}
                fullWidth
              />
            </>
          ) : (
            <Note tone="warn" text="Sezon seçimi için muhasebe yönetim yetkisi gerekir." />
          )}
        </Panel>
      ) : data ? (
        <View style={styles.panel}>
          {tab === "overview" ? (
            <OverviewView
              book={data}
              categories={categories}
              canManage={canManage}
              onGoTab={(k) => chooseTab(k as TabKey)}
              onOpenMatch={(m) => openMatch(m)}
              onMarkPaid={(ids, msg) => void markPaid(ids, msg)}
              onTeamStatement={(row) => setStatement({ kind: "team", row })}
              onStaffStatement={(row) => setStatement({ kind: "staff", row })}
              onFillMatches={(ids) => void fillMatches(ids)}
            />
          ) : null}
          {tab === "ledger" ? (
            <LedgerView
              book={data}
              categories={categories}
              missingCount={badges.missing || 0}
              canManage={canManage}
              onOpenMatch={openMatch}
              onMatchMenu={setMatchMenu}
              onDayMenu={setDayMenu}
              onToggleEntry={(e) => void updateEntry(e.id, { status: e.status === "paid" ? "pending" : "paid" })}
              onEditEntry={(e) => setEntrySheet({ entry: e })}
            />
          ) : null}
          {tab === "reports" ? <ReportsView book={data} categories={categories} /> : null}
          {tab === "staff" ? (
            <StaffView book={data} categories={categories} canManage={canManage} onMarkPaid={(ids, msg) => void markPaid(ids, msg)} onStatement={(row) => setStatement({ kind: "staff", row })} onExport={() => void shareCsv(`personel-${range.from}_${range.to}.csv`, staffCsv(data))} />
          ) : null}
          {tab === "teams" ? (
            <TeamsView book={data} canManage={canManage} onMarkPaid={(ids, msg) => void markPaid(ids, msg)} onStatement={(row) => setStatement({ kind: "team", row })} onExport={() => void shareCsv(`takim-tahsilat-${range.from}_${range.to}.csv`, teamsCsv(data))} />
          ) : null}
          {tab === "general" ? (
            <GeneralView
              book={data}
              paymentMethods={paymentMethods}
              canManage={canManage}
              onAdd={() => setEntrySheet({})}
              onEdit={(e) => setEntrySheet({ entry: e })}
              onToggle={(e) => void updateEntry(e.id, { status: e.status === "paid" ? "pending" : "paid" })}
              onDelete={(e) => void deleteEntry(e)}
              onCopyNext={(e) =>
                void createEntry(
                  { date: nextMonthDay(e.date), category: e.category, title: e.title, amount: e.amount, status: "pending", paymentMethod: e.paymentMethod, seasonId: e.seasonId, staffId: e.staffId, note: e.note },
                  `"${e.title || e.categoryLabel}" ${shortDay(nextMonthDay(e.date))} tarihine kopyalandı.`
                )
              }
            />
          ) : null}
          {tab === "missing" ? <MissingView book={data} canManage={canManage} onOpenMatch={(m) => openMatch(m)} onFill={(ids) => void fillMatches(ids)} /> : null}
          {tab === "settings" ? (
            <MatchSettings
              settings={settings}
              leagues={seasons.data?.leagues || []}
              categories={categories}
              knownFields={knownFields}
              teams={reports?.teams || []}
              staff={staffList}
              canManage={canManage}
              busy={busy === "settings"}
              onSave={(next) => void saveSettings(next)}
              onError={(text) => toast.show({ message: text, tone: "danger" })}
            />
          ) : null}
        </View>
      ) : null}

      {/* Dönem seçimi */}
      <BottomSheet visible={rangeSheet} onClose={() => setRangeSheet(false)} title="Dönem" snap="content">
        <View style={styles.sheet}>
          <ChipGroup>
            {MATCH_PRESETS.map((p) => {
              const v = p.range();
              return <Chip key={p.key} label={p.label} selected={v.from === range.from && v.to === range.to} onPress={() => { setRange(v); setRangeSheet(false); }} />;
            })}
          </ChipGroup>
          <DateField label="Başlangıç" value={range.from} onChange={(v) => v && setRange((r) => ({ from: v, to: v > r.to ? v : r.to }))} />
          <DateField label="Bitiş" value={range.to} onChange={(v) => v && setRange((r) => ({ from: v < r.from ? v : r.from, to: v }))} />
        </View>
      </BottomSheet>

      <ActionSheet visible={exportSheet} onClose={() => setExportSheet(false)} title="Dışa aktar" actions={exportItems} />

      <ActionSheet
        visible={matchMenu != null}
        onClose={() => setMatchMenu(null)}
        title={matchMenu ? `${matchMenu.home} – ${matchMenu.away}` : undefined}
        actions={
          matchMenu
            ? [
                { label: "Maçı aç", icon: "open-outline", onPress: () => openMatch(matchMenu) },
                { label: "Varsayılanlarla doldur", icon: "flash-outline", hidden: matchMenu.locked, onPress: () => onMatchAction(matchMenu, "defaults") },
                { label: "Takım ücretlerini tahsil edildi yap", icon: "cash-outline", onPress: () => onMatchAction(matchMenu, "collect") },
                { label: "Giderleri ödendi yap", icon: "checkmark-done-outline", onPress: () => onMatchAction(matchMenu, "pay") },
                { label: "Başlıklı kalem ekle", icon: "add-circle-outline", hidden: matchMenu.locked, onPress: () => openMatch(matchMenu) },
              ]
            : []
        }
      />
      <ActionSheet
        visible={dayMenu != null}
        onClose={() => setDayMenu(null)}
        title={dayMenu ? rangeLabel({ from: dayMenu.date, to: dayMenu.date }) : undefined}
        actions={
          dayMenu
            ? [
                { label: "Gün sonu kalemi ekle", icon: "add-circle-outline", hidden: Boolean(settings?.lockedUntil && dayMenu.date <= settings.lockedUntil), onPress: () => onDayAction(dayMenu, "entry") },
                { label: "Boş kutucukları varsayılanla doldur", icon: "flash-outline", onPress: () => onDayAction(dayMenu, "defaults") },
                { label: "Takım ücretlerini tahsil edildi yap", icon: "cash-outline", onPress: () => onDayAction(dayMenu, "collect") },
                { label: "Giderleri ödendi yap", icon: "checkmark-done-outline", onPress: () => onDayAction(dayMenu, "pay") },
              ]
            : []
        }
      />

      <MatchSheet
        match={drawerMatch}
        categories={categories}
        paymentMethods={paymentMethods}
        staff={staffList}
        settings={settings}
        canManage={canManage}
        position={{ index: drawerIndex, total: drawerList.length, hasPrev: drawerIndex > 0, hasNext: drawerIndex >= 0 && drawerIndex < drawerList.length - 1 }}
        onNavigate={(d) => {
          const next = drawerList[drawerIndex + d];
          if (next != null && drawer) setDrawer({ ...drawer, id: next });
        }}
        onClose={() => setDrawer(null)}
        onSaveCells={saveCells}
        onCreateEntry={(b) => createEntry(b)}
        onUpdateEntry={updateEntry}
        onDeleteEntry={(e) => void deleteEntry(e)}
        onError={(text) => toast.show({ message: text, tone: "danger" })}
      />

      {entrySheet ? (
        <GeneralEntrySheet
          key={entrySheet.entry?.id ?? `new-${entrySheet.date ?? ""}`}
          visible
          onClose={() => setEntrySheet(null)}
          entry={entrySheet.entry}
          date={entrySheet.date}
          categories={categories}
          paymentMethods={paymentMethods}
          seasons={data?.selectedSeasons || []}
          staff={staffList}
          onCreate={(b) => createEntry(b, "Kayıt eklendi.")}
          onUpdate={updateEntry}
          onDelete={(e) => void deleteEntry(e)}
        />
      ) : null}

      {statement ? (
        <StatementSheet
          visible
          onClose={() => setStatement(null)}
          kind={statement.kind}
          name={statement.row.name}
          rangeText={rangeLabel(range)}
          rows={statementRows}
          canManage={canManage}
          onMarkPaid={(ids, msg) => void markPaid(ids, msg)}
          onOpenMatch={(m) => {
            setStatement(null);
            openMatch(m);
          }}
        />
      ) : null}

      <TransferSheet
        visible={transfer}
        onClose={() => setTransfer(false)}
        accounts={(accounts.data?.items || []).filter((a) => !a.archived)}
        onSubmit={saveTransfer}
      />
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  panel: { gap: space.md },
  sheet: { gap: space.md },
});
