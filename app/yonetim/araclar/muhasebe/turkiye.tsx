/**
 * TÜRKİYE GENELİ MUHASEBE — web Muhasebe → Türkiye Geneli
 * (nationalAccounting/NationalAccounting.js).
 *
 * Merkezin illerden alacağı maç başı ücretlerin defteri.
 *   İller          — devreden, maç, tahakkuk, tahsilat, kalan borç, son ödeme;
 *                    ile dokununca il hesabı (ay ay, sezon satırları, düzeltme)
 *   Aylık tablo    — il × ay: maç sayısı, tahakkuk, tahsilat ya da bakiye
 *   Tahsilatlar    — hangi tarihte hangi ilden ne alındığı
 *   Maç başı ücret — genel / il / il + sezon (bayilik) tarifeleri
 * Tahakkuk = oynanan maç × maç başı ücret. Satır tutarı elle düzeltilir,
 * aya ek kalem (eksi: indirim) eklenir.
 *
 * ERİŞİM: national_accounting.view + Türkiye geneli rol (sunucu
 * NATIONWIDE_ONLY ile reddeder). Yazma: national_accounting.manage.
 * Aylık tablo telefonda il başına ay şeridi olarak çizilir (web'de matris).
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { AdminScreen, Panel, RecordCard, StatRow, confirmAction, useAdminMutation } from "@/components/admin";
import { AccountingNav } from "@/components/admin/accounting/AccountingNav";
import { CityDetail, MonthRangeFields, NaEntrySheet, NaRateSheet, NationalWarnings, type NaEntryDialog } from "@/components/admin/accounting/national";
import { AccountStrip, Muted, Note } from "@/components/admin/accounting/parts";
import { TransferSheet } from "@/components/admin/accounting/financeSheets";
import { shareCsv } from "@/components/admin/accounting/share";
import { Button, Chip, ChipGroup, EmptyState, Input, SegmentedControl, SkeletonCard, Tabs, Touchable } from "@/components/ui";
import { hasAnyPermission } from "@/lib/admin/access";
import { errorText } from "@/lib/admin/errors";
import { formatDate } from "@/lib/admin/format";
import {
  NATIONAL_ACCOUNTING_PERMISSIONS,
  NATIONAL_PRESETS,
  RATE_SCOPES,
  balanceTone,
  createTransfer,
  isNationwideRole,
  listAccounts,
  monthLabel,
  money,
  naCreateEntry,
  naCreateRate,
  naOptions,
  naRates,
  naRemoveEntry,
  naRemoveRate,
  naStatement,
  naUpdateEntry,
  naUpdateRate,
  nationalCitiesCsv,
  nationalLinesCsv,
  shortMonth,
  type NaEntry,
  type NaEntryBody,
  type NaOptions,
  type NaRate,
  type NaRateBody,
} from "@/lib/api/admin/accounting";
import { useAuth } from "@/providers/AuthProvider";
import { colors, radius, space, textScale, type } from "@/theme";

type Tab = "cities" | "monthly" | "payments" | "rates";
type Metric = "matchCount" | "due" | "paid" | "balance";
const EMPTY_OPTIONS: NaOptions = { cities: [], seasons: [], paymentMethods: [], kinds: [] };
const KEY = ["admin", "national-accounting"] as const;

export default function NationalAccountingScreen() {
  const auth = useAuth();
  const qc = useQueryClient();
  const nationwide = isNationwideRole(auth.user);
  const canManage = hasAnyPermission(auth.user, ["national_accounting.manage"]);
  const [tab, setTab] = useState<Tab>("cities");
  const [preset, setPreset] = useState("year");
  const [range, setRange] = useState(() => NATIONAL_PRESETS[0].range());
  const [cityId, setCityId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [metric, setMetric] = useState<Metric>("matchCount");
  const [entry, setEntry] = useState<NaEntryDialog | null>(null);
  const [rate, setRate] = useState<{ rate?: NaRate; initial?: Partial<NaRate> } | null>(null);
  const [transfer, setTransfer] = useState(false);

  const statement = useQuery({ queryKey: [...KEY, "statement", range.from, range.to], queryFn: () => naStatement(range), enabled: nationwide, placeholderData: (p) => p });
  const rates = useQuery({ queryKey: [...KEY, "rates"], queryFn: naRates, enabled: nationwide });
  const opts = useQuery({ queryKey: [...KEY, "options"], queryFn: naOptions, enabled: nationwide, staleTime: 10 * 60_000 });
  const accounts = useQuery({ queryKey: ["admin", "finance", "accounts"], queryFn: () => listAccounts(), retry: false });
  const options = { ...EMPTY_OPTIONS, ...(opts.data || {}) };
  const data = statement.data;
  const totals = data?.totals;
  const rateList = rates.data?.items || [];
  const city = data && cityId ? data.cities.find((c) => c.cityId === cityId) || null : null;
  const visibleCities = useMemo(() => {
    const n = search.trim().toLocaleLowerCase("tr-TR");
    return data ? data.cities.filter((c) => !n || c.name.toLocaleLowerCase("tr-TR").includes(n)) : [];
  }, [data, search]);

  const invalidate = [[...KEY], ["admin", "finance"]];
  const saveEntry = useAdminMutation(({ body, id }: { body: NaEntryBody; id?: number | null }) => (id ? naUpdateEntry(id, body) : naCreateEntry(body)), {
    success: (r) => r?.message || "Kaydedildi.",
    invalidate,
    silentError: true,
  });
  const removeEntry = useAdminMutation((id: number) => naRemoveEntry(id), { success: "Kayıt silindi.", invalidate });
  const saveRate = useAdminMutation(({ body, id }: { body: NaRateBody; id?: number }) => (id ? naUpdateRate(id, body) : naCreateRate(body)), {
    success: (r) => r?.message || "Kaydedildi.",
    invalidate,
    silentError: true,
  });
  const removeRate = useAdminMutation((id: number) => naRemoveRate(id), { success: "Maç başı ücret silindi.", invalidate });
  const saveTransfer = useAdminMutation((v: { body: Parameters<typeof createTransfer>[0]; message: string }) => createTransfer(v.body), {
    success: (_r, v) => v.message,
    invalidate: [["admin", "finance"]],
    silentError: true,
  });

  const addEntry = (kind: "payment" | "charge") => setEntry({ kind, initial: city ? { cityId: city.cityId } : {} });
  const editEntry = (e: NaEntry) => setEntry({ kind: e.kind, initial: e, id: e.id });
  const askRemoveEntry = async () => {
    if (!entry?.id) return;
    if (await confirmAction({ title: "Bu kayıt silinsin mi?", confirmLabel: "Sil", destructive: true })) {
      removeEntry.mutate(entry.id);
      setEntry(null);
    }
  };
  const askRemoveRate = async () => {
    if (!rate?.rate) return;
    if (await confirmAction({ title: "Maç başı ücret silinsin mi?", message: "Hesaplar kalan tarifelere göre yeniden yapılır.", confirmLabel: "Sil", destructive: true })) {
      removeRate.mutate(rate.rate.id);
      setRate(null);
    }
  };

  const refresh = () => void qc.invalidateQueries({ queryKey: [...KEY] });

  return (
    <AdminScreen
      app="muhasebe"
      appTabs={city ? undefined : <AccountingNav current="turkiye" />}
      title={city ? `${city.name} hesabı` : "Türkiye Geneli"}
      subtitle="İl tahsilatları ve maç başı ücretler"
      permission={NATIONAL_ACCOUNTING_PERMISSIONS}
      onRefresh={refresh}
      refreshing={statement.isRefetching}
      actions={
        data && !city
          ? [{ icon: "share-outline", accessibilityLabel: "İller CSV paylaş", onPress: () => void shareCsv(`turkiye-muhasebe-${data.range.from}-${data.range.to}.csv`, nationalCitiesCsv(data)) }]
          : undefined
      }
    >
      {!nationwide ? (
        <EmptyState icon="lock-closed-outline" title="Türkiye geneli yetkililere açık" body="Türkiye geneli muhasebe yalnızca Türkiye geneli rollere açıktır." variant="inline" />
      ) : (
        <>
          {accounts.data ? <AccountStrip accounts={(accounts.data.items || []).filter((a) => !a.archived)} scope="national" onTransfer={() => setTransfer(true)} /> : null}

          {city ? <Button label="Tüm iller" icon="arrow-back" variant="ghost" size="sm" onPress={() => setCityId(null)} /> : null}

          {canManage ? (
            <View style={styles.row}>
              <Button label="Tahsilat ekle" icon="cash-outline" onPress={() => addEntry("payment")} style={styles.flex} />
              <Button label="Kalem ekle" icon="add" variant="secondary" onPress={() => addEntry("charge")} style={styles.flex} />
            </View>
          ) : null}

          <ChipGroup scrollable contentPadding={0}>
            {NATIONAL_PRESETS.map((p) => (
              <Chip key={p.key} label={p.label} size="sm" selected={preset === p.key} onPress={() => { setPreset(p.key); setRange(p.range()); }} />
            ))}
          </ChipGroup>
          <MonthRangeFields from={range.from} to={range.to} onChange={(r) => { setPreset("custom"); setRange(r); }} />

          {!city ? (
            <Tabs
              items={[
                { key: "cities", label: "İller" },
                { key: "monthly", label: "Aylık tablo" },
                { key: "payments", label: "Tahsilatlar" },
                { key: "rates", label: "Maç başı ücretler" },
              ]}
              value={tab}
              onChange={setTab}
              distribute="scroll"
            />
          ) : null}

          {statement.isLoading && !data ? (
            <>
              <SkeletonCard />
              <SkeletonCard />
            </>
          ) : statement.error && !data ? (
            <Note tone="danger" icon="alert-circle-outline" text={errorText(statement.error)} action={{ label: "Tekrar dene", onPress: refresh }} />
          ) : !data || !totals ? null : city ? (
            <CityDetail
              city={city}
              options={options}
              canManage={canManage}
              onEditEntry={editEntry}
              onOverride={(line) =>
                setEntry({
                  kind: "override",
                  initial: { cityId: line.cityId, period: line.period, seasonId: line.seasonId, amount: line.override ? line.override.amount : line.calculated, note: line.override?.note || "", line },
                  id: line.override?.id ?? null,
                })
              }
              onAddRate={(initial) => setRate({ initial })}
              onEditRate={(r) => setRate({ rate: r })}
            />
          ) : (
            <>
              <StatRow
                items={[
                  { label: `Toplam alacak · ${totals.debtorCount} il borçlu`, value: money(totals.balance), tone: balanceTone(totals.balance) },
                  { label: "Dönem tahakkuku", value: money(totals.due) },
                ]}
              />
              <StatRow
                items={[
                  { label: `Tahsilat · ${data.payments.length} ödeme`, value: money(totals.paid), tone: "win" },
                  { label: `Maç · ${totals.cityCount} il`, value: totals.matchCount.toLocaleString("tr-TR") },
                  { label: "Devreden", value: money(totals.opening), tone: balanceTone(totals.opening) },
                ]}
              />
              {totals.adjustment ? <Muted>{`Hesaplanan ${money(totals.calculated)} · düzeltme ${money(totals.adjustment, { signed: true })}`}</Muted> : <Muted>{`${monthLabel(data.range.from)} – ${monthLabel(data.range.to)}`}</Muted>}
              <NationalWarnings unassigned={data.unassignedMatches} noRates={!rates.isLoading && !rateList.length} canManage={canManage} onRates={() => setTab("rates")} />

              {tab === "cities" ? (
                <>
                  <Input variant="search" leadingIcon="search" value={search} onChangeText={setSearch} placeholder="İl ara" autoCapitalize="none" />
                  <Button label="Sezon satırları CSV" icon="share-outline" size="sm" variant="ghost" onPress={() => void shareCsv(`turkiye-muhasebe-satirlar-${data.range.from}-${data.range.to}.csv`, nationalLinesCsv(data))} />
                  {visibleCities.length ? (
                    visibleCities.map((c) => (
                      <RecordCard
                        key={c.cityId}
                        title={c.name}
                        subtitle={c.seasons.map((x) => x.seasonName).slice(0, 3).join(", ") || "—"}
                        meta={`Devreden ${money(c.opening)} · ${c.matchCount} maç · tahakkuk ${money(c.due)}${c.adjustment ? ` (düzeltme ${money(c.adjustment, { signed: true })})` : ""} · tahsilat ${money(c.paid)}`}
                        icon="location-outline"
                        value={money(c.balance)}
                        valueTone={balanceTone(c.balance)}
                        badges={[c.lastPayment ? { label: `Son ödeme ${formatDate(c.lastPayment.date)} · ${money(c.lastPayment.amount)}`, tone: "neutral" } : null]}
                        onPress={() => setCityId(c.cityId)}
                      />
                    ))
                  ) : (
                    <Muted>Bu dönemde maçı ya da hesabı olan il yok.</Muted>
                  )}
                  <Muted>{`Toplam: devreden ${money(totals.opening)} · ${totals.matchCount} maç · tahakkuk ${money(totals.due)} · tahsilat ${money(totals.paid)} · bakiye ${money(totals.balance)}`}</Muted>
                </>
              ) : null}

              {tab === "monthly" ? (
                <Panel title="İl × ay">
                  <SegmentedControl
                    items={[
                      { key: "matchCount", label: "Maç" },
                      { key: "due", label: "Tahakkuk" },
                      { key: "paid", label: "Tahsilat" },
                      { key: "balance", label: "Bakiye" },
                    ]}
                    value={metric}
                    onChange={setMetric}
                    stretch
                    size="sm"
                  />
                  {data.cities.map((c) => (
                    <View key={c.cityId} style={styles.matrixRow}>
                      <Touchable onPress={() => setCityId(c.cityId)} style={styles.matrixHead} accessibilityRole="button">
                        <Text style={styles.strong} {...textScale.dense}>
                          {c.name}
                        </Text>
                        <Text style={styles.num} {...textScale.dense}>
                          {metric === "matchCount" ? c.matchCount : money(metric === "balance" ? c.balance : c[metric])}
                        </Text>
                      </Touchable>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cells}>
                        {c.months.map((m) => (
                          <View key={m.period} style={styles.cell}>
                            <Text style={styles.cellLabel} {...textScale.badge}>
                              {shortMonth(m.period)}
                            </Text>
                            <Text style={[styles.cellValue, metric === "balance" ? { color: m.balance > 0 ? colors.danger : m.balance < 0 ? colors.win : colors.textPrimary } : null]} {...textScale.badge}>
                              {metric === "matchCount" ? m.matchCount || "·" : m[metric] ? money(m[metric]) : "·"}
                            </Text>
                          </View>
                        ))}
                      </ScrollView>
                    </View>
                  ))}
                  {metric !== "balance" ? (
                    <View style={styles.matrixRow}>
                      <View style={styles.matrixHead}>
                        <Text style={styles.strong} {...textScale.dense}>
                          Toplam
                        </Text>
                        <Text style={styles.num} {...textScale.dense}>
                          {metric === "matchCount" ? totals.matchCount : money(totals[metric])}
                        </Text>
                      </View>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cells}>
                        {data.monthly.map((m) => (
                          <View key={m.period} style={styles.cell}>
                            <Text style={styles.cellLabel} {...textScale.badge}>
                              {shortMonth(m.period)}
                            </Text>
                            <Text style={styles.cellValue} {...textScale.badge}>
                              {metric === "matchCount" ? m.matchCount : money(m[metric])}
                            </Text>
                          </View>
                        ))}
                      </ScrollView>
                    </View>
                  ) : null}
                </Panel>
              ) : null}

              {tab === "payments" ? (
                <Panel title={`Tahsilatlar · toplam ${money(totals.paid)}`}>
                  {data.payments.length ? (
                    data.payments.map((e) => (
                      <RecordCard
                        key={e.id}
                        title={e.cityName || "İl"}
                        subtitle={[options.paymentMethods.find((m) => m.key === e.paymentMethod)?.label, e.title, e.note].filter(Boolean).join(" · ") || null}
                        meta={formatDate(e.date)}
                        icon="cash-outline"
                        iconTone="win"
                        value={money(e.amount)}
                        valueTone="win"
                        onPress={canManage ? () => editEntry(e) : () => setCityId(e.cityId)}
                        onLongPress={() => setCityId(e.cityId)}
                      />
                    ))
                  ) : (
                    <Muted>Bu dönemde tahsilat yok.</Muted>
                  )}
                </Panel>
              ) : null}

              {tab === "rates" ? (
                <Panel title="Maç başı ücretler" action={canManage ? { label: "Ücret ekle", onPress: () => setRate({}) } : undefined}>
                  <Muted>Her il + ay + sezon için en özel ücret uygulanır: il + sezon &gt; il &gt; genel. Ücret değişince yeni ücreti başladığı aydan itibaren ekleyin; önceki aylar eski ücretle kalır.</Muted>
                  {rateList.length ? (
                    rateList.map((r) => (
                      <RecordCard
                        key={r.id}
                        title={r.cityName || "Tüm iller"}
                        subtitle={[r.seasonName ? `${r.seasonName}${r.leagueName ? ` · ${r.leagueName}` : ""}` : null, r.validFrom ? `${monthLabel(r.validFrom)}'dan itibaren` : "Baştan beri", r.note].filter(Boolean).join(" · ")}
                        icon="pricetag-outline"
                        value={money(r.fee)}
                        badges={[{ label: RATE_SCOPES[r.scope] || r.scope, tone: r.scope === "season" ? "brand" : r.scope === "city" ? "info" : "neutral" }]}
                        onPress={canManage ? () => setRate({ rate: r }) : undefined}
                      />
                    ))
                  ) : (
                    <Muted>Henüz ücret tanımlanmadı.</Muted>
                  )}
                </Panel>
              ) : null}
            </>
          )}
        </>
      )}

      <NaEntrySheet
        dialog={entry}
        options={options}
        onClose={() => setEntry(null)}
        onSave={(body, id) => saveEntry.mutateAsync({ body, id })}
        onDelete={entry?.id ? () => void askRemoveEntry() : undefined}
      />
      <NaRateSheet
        visible={rate != null}
        rate={rate?.rate}
        initial={rate?.initial}
        options={options}
        onClose={() => setRate(null)}
        onSave={(body, id) => saveRate.mutateAsync({ body, id })}
        onDelete={rate?.rate ? () => void askRemoveRate() : undefined}
      />
      <TransferSheet
        visible={transfer}
        onClose={() => setTransfer(false)}
        accounts={(accounts.data?.items || []).filter((a) => !a.archived)}
        onSubmit={(body, message) => saveTransfer.mutateAsync({ body, message })}
      />
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: space.sm },
  flex: { flex: 1 },
  strong: { ...type.label, color: colors.textPrimary },
  num: { ...type.numSmStrong, color: colors.textPrimary },
  matrixRow: { gap: space.xs, paddingVertical: space.xs },
  matrixHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cells: { gap: space.xs },
  cell: { minWidth: 64, padding: space.xs, borderRadius: radius.sm, backgroundColor: colors.surface2, gap: 2 },
  cellLabel: { ...type.micro, color: colors.textTertiary },
  cellValue: { ...type.caption, color: colors.textPrimary },
});
