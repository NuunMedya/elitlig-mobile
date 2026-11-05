/**
 * Maç Muhasebesi sekmeleri — web accounting/ AccountingOverview.js,
 * LedgerTable.js, AccountingReports.js, AccountingSettings.js
 * (GeneralEntriesView) mobil karşılıkları.
 *
 *   OverviewView  — özet göstergeler (önceki döneme göre değişim), hedef kâr,
 *                   dönem akışı, gider dağılımı, yapılacaklar, bugünün maçları,
 *                   borçlu takımlar, bekleyen personel, yaşlandırma, son işlemler, bütçe
 *   LedgerView    — gün gün maç kartları; gün ve maç toplu eylemleri; gün sonu kalemleri
 *   ReportsView   — aylık/haftalık/günlük kâr, dağılımlar, bütçe, yaşlandırma,
 *                   ödeme yöntemleri, haftanın günleri, saha/lig/sezon kârı (CSV)
 *   StaffView / TeamsView / GeneralView / MissingView
 *
 * NEDEN TABLO YOK: web defteri 15 sütunlu bir ızgara; telefonda maç kartı +
 * maç ayrıntısı alt sayfası (kutucuk düzenleme) aynı işi başparmakla yapar.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Panel, RecordCard, StatRow, ToggleField } from "@/components/admin";
import { Button, Chip, ChipGroup, EmptyState, Input, MetricGrid, MetricTile, SegmentedControl, Touchable } from "@/components/ui";
import { timeAgo } from "@/lib/admin/format";
import {
  ageInDays,
  allAccEntries,
  dayLabel,
  daysBetween,
  filterBookDays,
  isFullMonth,
  isLockedDay,
  matchHasPending,
  matchIsMissing,
  monthLabel,
  money,
  nextMonthDay,
  percent,
  periodCsv,
  rankCsv,
  shortDay,
  todayKey,
  type AccBook,
  type AccCategory,
  type AccDay,
  type AccEntry,
  type AccMatch,
  type AccPeriodRow,
  type AccRankRow,
  type AccStaffRow,
  type AccTeamRow,
} from "@/lib/api/admin/accounting";
import { colors, hairline, radius, space, textScale, type } from "@/theme";

import { BarRow, Muted, Note, TrendBars } from "../parts";
import { shareCsv } from "../share";

const delta = (current: number, previous?: number | null) => {
  if (previous == null || !Number.isFinite(Number(previous)) || Number(previous) === 0) return null;
  return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
};
const deltaText = (v: number | null) => (v == null ? "" : ` · ${v >= 0 ? "+" : "−"}%${String(Math.abs(v)).replace(".", ",")}`);

/* ------------------------------ özet göstergeler ------------------------------ */

export function SummaryKpis({ book }: { book: AccBook }) {
  const s = book.summary;
  const prev = book.previous?.summary;
  const cash = s.collected - s.paidOut;
  const target = book.settings?.monthlyTarget && book.reports.monthly.length <= 1 ? book.settings.monthlyTarget : null;
  const progress = target ? Math.max(0, Math.min(100, Math.round((s.net / target) * 100))) : null;
  return (
    <>
      <MetricGrid columns={2}>
        <MetricTile label="Toplam gelir" value={money(s.income)} hint={`${s.matchCount} maç · maç başı ${money(s.averageIncomePerMatch)}${deltaText(delta(s.income, prev?.income))}`} tone="win" icon="trending-up" />
        <MetricTile label="Toplam gider" value={money(s.expense)} hint={`Maç başı ${money(s.averageExpensePerMatch)}${deltaText(delta(s.expense, prev?.expense))}`} tone="danger" icon="trending-down" />
        <MetricTile label="Net kâr" value={money(s.net, { signed: true })} hint={`Marj ${percent(s.margin)} · maç başı ${money(s.averageNetPerMatch)}${deltaText(delta(s.net, prev?.net))}`} tone={s.net >= 0 ? "win" : "danger"} icon="scale-outline" />
        <MetricTile label="Kasa (nakit akışı)" value={money(cash, { signed: true })} hint={`Tahsil ${money(s.collected)} − ödenen ${money(s.paidOut)}`} tone={cash >= 0 ? "brand" : "danger"} icon="cash-outline" />
        <MetricTile label="Alacak" value={money(s.receivable)} hint={s.income ? `Gelirin %${Math.round((s.receivable / s.income) * 100)}'i bekliyor` : "—"} tone={s.receivable > 0 ? "warn" : "neutral"} icon="hourglass-outline" />
        <MetricTile label="Borç" value={money(s.payable)} hint={s.expense ? `Giderin %${Math.round((s.payable / s.expense) * 100)}'i bekliyor` : "—"} tone={s.payable > 0 ? "warn" : "neutral"} icon="time-outline" />
      </MetricGrid>
      {target ? (
        <Panel title="Aylık hedef kâr">
          <BarRow label={`${money(s.net)} / ${money(target)}`} value={`%${progress}`} ratio={(progress || 0) / 100} tone="brand" />
        </Panel>
      ) : null}
    </>
  );
}

export function BudgetPanel({ book, categories }: { book: AccBook; categories: AccCategory[] }) {
  const budgets = book.settings?.budgets || {};
  const keys = Object.keys(budgets).filter((k) => Number(budgets[k]) > 0);
  if (!keys.length) return null;
  const days = daysBetween(book.range.from, book.range.to) + 1;
  const factor = isFullMonth(book.range) ? 1 : days / 30.44;
  const rows = keys
    .map((k) => {
      const budget = Math.round(Number(budgets[k]) * factor);
      const actual = book.summary.byCategory[k] || 0;
      return { key: k, label: categories.find((c) => c.key === k)?.label || k, budget, actual, ratio: budget ? actual / budget : 0 };
    })
    .sort((a, b) => b.ratio - a.ratio);
  const totalBudget = rows.reduce((n, r) => n + r.budget, 0);
  const totalActual = rows.reduce((n, r) => n + r.actual, 0);
  return (
    <Panel title="Bütçe / gerçekleşen">
      <Muted>{`${isFullMonth(book.range) ? "Aylık bütçe" : `Aylık bütçe ${days} güne oranlandı`} · toplam ${money(totalActual)} / ${money(totalBudget)}`}</Muted>
      {rows.map((r) => {
        const pct = Math.round(r.ratio * 100);
        return <BarRow key={r.key} label={r.label} value={`%${pct}`} ratio={Math.min(1, r.ratio)} tone={pct > 100 ? "danger" : pct > 85 ? "warn" : "win"} sub={`${money(r.actual)} / ${money(r.budget)}`} />;
      })}
    </Panel>
  );
}

export function AgingPanel({ book }: { book: AccBook }) {
  const aging = book.reports.aging;
  if (!aging) return null;
  const side = (rows: typeof aging.receivable, title: string, tone: "warn" | "danger") => {
    const total = rows.reduce((n, r) => n + r.amount, 0);
    return (
      <View style={styles.gap}>
        <Text style={styles.subTitle} {...textScale.dense}>
          {title} · {money(total)}
        </Text>
        {rows.map((r) => (
          <BarRow key={r.key} label={r.label} value={money(r.amount)} ratio={total ? r.amount / total : 0} tone={tone} sub={`${r.count} kayıt`} />
        ))}
      </View>
    );
  };
  return (
    <Panel title="Alacak / borç yaşlandırma">
      <Muted>Bekleyen kayıtların kaç gündür beklediği ({aging.asOf ? shortDay(aging.asOf) : "bugün"} itibarıyla).</Muted>
      {side(aging.receivable, "Alacak", "warn")}
      {side(aging.payable, "Borç", "danger")}
    </Panel>
  );
}

function Breakdown({ rows, total, tone, title }: { rows: { key: string; label: string; amount: number }[]; total: number; tone: "win" | "danger"; title: string }) {
  return (
    <Panel title={title}>
      {rows.length ? (
        rows.map((r) => <BarRow key={r.key} label={r.label} value={money(r.amount)} ratio={total ? r.amount / total : 0} tone={tone} sub={`%${total ? Math.round((r.amount / total) * 100) : 0}`} />)
      ) : (
        <Muted>Kayıt yok.</Muted>
      )}
    </Panel>
  );
}

/* --------------------------------- genel bakış --------------------------------- */

export function OverviewView({
  book,
  categories,
  canManage,
  onGoTab,
  onOpenMatch,
  onMarkPaid,
  onTeamStatement,
  onStaffStatement,
  onFillMatches,
}: {
  book: AccBook;
  categories: AccCategory[];
  canManage: boolean;
  onGoTab: (tab: string) => void;
  onOpenMatch: (m: AccMatch) => void;
  onMarkPaid: (ids: number[], message: string) => void;
  onTeamStatement: (row: AccTeamRow) => void;
  onStaffStatement: (row: AccStaffRow) => void;
  onFillMatches: (ids: number[]) => void;
}) {
  const r = book.reports;
  const s = book.summary;
  const today = todayKey();
  const todayMatches = book.days.find((d) => d.date === today)?.matches || [];
  const recent = useMemo(
    () =>
      allAccEntries(book)
        .filter((e) => e.updatedAt)
        .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
        .slice(0, 8),
    [book]
  );
  const debtors = r.teams.filter((t) => t.outstanding > 0).slice(0, 6);
  const staffPending = r.staff.filter((x) => x.pending > 0).sort((a, b) => b.pending - a.pending).slice(0, 6);
  const unpaidTasks = r.staff.reduce((n, x) => n + x.unpaidTasks, 0);
  const lockedIds = new Set(book.days.flatMap((d) => d.matches).filter((m) => m.locked).map((m) => m.id));
  const fillable = r.missing.filter((m) => !lockedIds.has(m.matchId)).map((m) => m.matchId);
  const allDone = !r.missing.length && !debtors.length && !staffPending.length && !unpaidTasks;
  const daily = r.daily.map((d) => ({ key: d.key, label: shortDay(d.key), title: dayLabel(d.key), income: d.income, expense: d.expense, net: d.net }));

  return (
    <View style={styles.gap}>
      <SummaryKpis book={book} />
      <Panel title="Dönem akışı" action={{ label: "Tüm raporlar", onPress: () => onGoTab("reports") }}>
        <TrendBars rows={daily} emptyText="Bu dönemde kayıt yok." />
      </Panel>
      <Breakdown title="Gider dağılımı" rows={r.expenseBreakdown} total={s.expense} tone="danger" />

      <Panel title="Yapılacaklar">
        {allDone ? (
          <Note tone="win" icon="checkmark-circle-outline" text="Her şey yolunda. Eksik giriş ya da bekleyen ödeme yok." />
        ) : (
          <View style={styles.gap}>
            {r.missing.length ? (
              <Todo icon="alert-circle-outline" tone="warn" title={`${r.missing.length} maçta eksik giriş`} body="Takım ücreti ya da gider girilmemiş.">
                {canManage && fillable.length ? <Button label="Doldur" icon="flash-outline" size="sm" onPress={() => onFillMatches(fillable)} /> : null}
                <Button label="Gör" size="sm" variant="ghost" onPress={() => onGoTab("missing")} />
              </Todo>
            ) : null}
            {s.receivable > 0 ? (
              <Todo icon="cash-outline" tone="win" title={`${money(s.receivable)} tahsil edilmedi`} body={`${r.teams.filter((t) => t.outstanding > 0).length} takımdan alacak.`}>
                <Button label="Takımlar" size="sm" variant="ghost" onPress={() => onGoTab("teams")} />
              </Todo>
            ) : null}
            {s.payable > 0 ? (
              <Todo icon="arrow-down-outline" tone="danger" title={`${money(s.payable)} ödenmedi`} body="Personel, saha ve diğer giderler.">
                <Button label="Personel" size="sm" variant="ghost" onPress={() => onGoTab("staff")} />
              </Todo>
            ) : null}
            {unpaidTasks > 0 ? (
              <Todo icon="help-circle-outline" tone="warn" title={`${unpaidTasks} görevin ücreti girilmemiş`} body="Görevlendirilmiş ama ödemesi yazılmamış personel.">
                <Button label="Gör" size="sm" variant="ghost" onPress={() => onGoTab("staff")} />
              </Todo>
            ) : null}
          </View>
        )}
        {todayMatches.length ? (
          <View style={styles.gap}>
            <Text style={styles.subTitle} {...textScale.dense}>
              Bugünün maçları
            </Text>
            {todayMatches.map((m) => (
              <RecordCard key={m.id} title={`${m.home} – ${m.away}`} meta={m.time || "—"} icon="football-outline" value={money(m.totals.net, { signed: true })} valueTone={m.totals.net >= 0 ? "win" : "danger"} onPress={() => onOpenMatch(m)} />
            ))}
          </View>
        ) : null}
      </Panel>

      <Panel title="Borçlu takımlar" action={{ label: "Tümü", onPress: () => onGoTab("teams") }}>
        {debtors.length ? (
          debtors.map((t) => {
            const age = ageInDays(t.oldestPending);
            return (
              <RecordCard
                key={String(t.teamId ?? t.name)}
                title={t.name}
                subtitle={age != null ? `${age} gündür bekliyor` : null}
                icon="shield-outline"
                value={money(t.outstanding)}
                valueTone="danger"
                onPress={() => onTeamStatement(t)}
                trailing={
                  canManage && t.pendingEntryIds.length ? (
                    <Touchable onPress={() => onMarkPaid(t.pendingEntryIds, `${t.name} takımının ${money(t.outstanding)} alacağı tahsil edildi olarak işaretlensin mi?`)} accessibilityRole="button" accessibilityLabel={`${t.name} tahsil edildi yap`}>
                      <Ionicons name="checkmark-circle-outline" size={22} color={colors.win} />
                    </Touchable>
                  ) : undefined
                }
              />
            );
          })
        ) : (
          <Muted>Tahsil edilmemiş takım ücreti yok.</Muted>
        )}
      </Panel>

      <Panel title="Ödeme bekleyen personel" action={{ label: "Tümü", onPress: () => onGoTab("staff") }}>
        {staffPending.length ? (
          staffPending.map((p) => (
            <RecordCard
              key={p.staffId}
              title={p.name}
              subtitle={`${p.tasks} görev`}
              icon="person-outline"
              value={money(p.pending)}
              valueTone="danger"
              onPress={() => onStaffStatement(p)}
              trailing={
                canManage && p.pendingEntryIds.length ? (
                  <Touchable onPress={() => onMarkPaid(p.pendingEntryIds, `${p.name} için ${money(p.pending)} ödendi olarak işaretlensin mi?`)} accessibilityRole="button" accessibilityLabel={`${p.name} ödendi yap`}>
                    <Ionicons name="checkmark-circle-outline" size={22} color={colors.win} />
                  </Touchable>
                ) : undefined
              }
            />
          ))
        ) : (
          <Muted>Bekleyen personel ödemesi yok.</Muted>
        )}
      </Panel>

      <AgingPanel book={book} />

      <Panel title="Son işlemler">
        {recent.length ? (
          recent.map((e) => (
            <RecordCard
              key={e.id}
              title={e.title || e.categoryLabel}
              subtitle={`${e.match ? `${e.match.home} – ${e.match.away}` : "Gün sonu / genel"} · ${shortDay(e.date)}`}
              meta={timeAgo(e.updatedAt)}
              icon={e.direction === "income" ? "arrow-down" : "arrow-up"}
              iconTone={e.direction === "income" ? "win" : "danger"}
              value={money(e.direction === "income" ? e.amount : -e.amount, { signed: true })}
              valueTone={e.direction === "income" ? "win" : "danger"}
            />
          ))
        ) : (
          <Muted>Bu dönemde kayıt yok.</Muted>
        )}
      </Panel>
      <BudgetPanel book={book} categories={categories} />
    </View>
  );
}

function Todo({ icon, tone, title, body, children }: { icon: keyof typeof Ionicons.glyphMap; tone: "warn" | "win" | "danger"; title: string; body: string; children?: React.ReactNode }) {
  const color = tone === "win" ? colors.win : tone === "danger" ? colors.danger : colors.warn;
  return (
    <View style={styles.todo}>
      <Ionicons name={icon} size={20} color={color} />
      <View style={styles.flex}>
        <Text style={styles.todoTitle} {...textScale.dense}>
          {title}
        </Text>
        <Text style={styles.todoBody} {...textScale.dense}>
          {body}
        </Text>
      </View>
      <View style={styles.todoActions}>{children}</View>
    </View>
  );
}

/* ----------------------------------- defter ----------------------------------- */

const completion = (m: AccMatch, keys: string[]) => (keys.length ? keys.filter((k) => m.cells[k]).length / keys.length : 1);

export function LedgerView({
  book,
  categories,
  missingCount,
  canManage,
  onOpenMatch,
  onMatchMenu,
  onDayMenu,
  onToggleEntry,
  onEditEntry,
}: {
  book: AccBook;
  categories: AccCategory[];
  missingCount: number;
  canManage: boolean;
  onOpenMatch: (m: AccMatch, list: AccMatch[]) => void;
  onMatchMenu: (m: AccMatch) => void;
  onDayMenu: (d: AccDay) => void;
  onToggleEntry: (e: AccEntry) => void;
  onEditEntry: (e: AccEntry) => void;
}) {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"all" | "missing" | "pending">("all");
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const days = useMemo(() => filterBookDays(book, { query, mode }), [book, query, mode]);
  const visibleMatches = useMemo(() => days.flatMap((d) => d.matches), [days]);
  const fixedKeys = categories.filter((c) => c.fixed).map((c) => c.key);
  const s = book.summary;
  const filling = useMemo(() => {
    const ms = book.days.flatMap((d) => d.matches);
    if (!ms.length || !fixedKeys.length) return null;
    const filled = ms.reduce((n, m) => n + fixedKeys.filter((k) => m.cells[k]).length, 0);
    return Math.round((filled / (ms.length * fixedKeys.length)) * 100);
  }, [book, fixedKeys]);
  const allDays = book.days.map((d) => d.date);
  const today = todayKey();

  return (
    <View style={styles.gap}>
      <StatRow
        items={[
          { label: "Gelir", value: money(s.income), tone: "win" },
          { label: "Gider", value: money(s.expense), tone: "danger" },
          { label: `Net · ${percent(s.margin)}`, value: money(s.net, { signed: true }), tone: s.net >= 0 ? "win" : "danger" },
          ...(filling != null ? [{ label: "Doluluk", value: `%${filling}` }] : []),
        ]}
      />
      <StatRow items={[{ label: "Alacak", value: money(s.receivable) }, { label: "Borç", value: money(s.payable) }]} />
      <Input variant="search" leadingIcon="search" value={query} onChangeText={setQuery} placeholder="Takım, saha ya da kalem ara" autoCapitalize="none" />
      <View style={styles.row}>
        <SegmentedControl
          items={[
            { key: "all", label: "Tümü" },
            { key: "missing", label: missingCount ? `Eksik (${missingCount})` : "Eksik" },
            { key: "pending", label: "Bekleyen" },
          ]}
          value={mode}
          onChange={setMode}
          size="sm"
          style={styles.flex}
        />
        <Touchable onPress={() => setCollapsed(collapsed.length ? [] : allDays)} accessibilityRole="button" style={styles.collapse}>
          <Ionicons name={collapsed.length ? "chevron-expand" : "chevron-collapse"} size={18} color={colors.textSecondary} />
        </Touchable>
      </View>
      {!days.length ? (
        <EmptyState icon="book-outline" title="Bu dönemde maç yok" body="Dönemi değiştirin ya da Ayarlar'dan sezon ekleyin." variant="inline" />
      ) : (
        days.map((day) => {
          const isCollapsed = collapsed.includes(day.date);
          const ratio = day.matches.length ? day.matches.reduce((n, m) => n + completion(m, fixedKeys), 0) / day.matches.length : 1;
          const locked = isLockedDay(book.settings, day.date);
          const full = book.days.find((d) => d.date === day.date) || day;
          return (
            <View key={day.date} style={styles.day}>
              <Touchable
                onPress={() => setCollapsed((p) => (p.includes(day.date) ? p.filter((x) => x !== day.date) : [...p, day.date]))}
                onLongPress={canManage ? () => onDayMenu(full) : undefined}
                style={styles.dayHead}
                accessibilityRole="button"
                accessibilityLabel={`${dayLabel(day.date)}. Net ${money(full.totals.net)}`}
              >
                <Ionicons name={isCollapsed ? "chevron-forward" : "chevron-down"} size={16} color={colors.textTertiary} />
                <View style={styles.flex}>
                  <Text style={styles.dayTitle} {...textScale.dense}>
                    {dayLabel(day.date)}
                    {day.date === today ? " · Bugün" : ""}
                    {locked ? " · kilitli" : ""}
                  </Text>
                  <Text style={styles.daySub} {...textScale.dense}>
                    {full.matches.length} maç · %{Math.round(ratio * 100)} dolu · Gelir {money(full.totals.income)} · Gider {money(full.totals.expense)}
                  </Text>
                </View>
                <Text style={[styles.dayNet, { color: full.totals.net >= 0 ? colors.win : colors.danger }]} {...textScale.dense}>
                  {money(full.totals.net, { signed: true })}
                </Text>
                {canManage ? (
                  <Touchable onPress={() => onDayMenu(full)} accessibilityRole="button" accessibilityLabel={`${dayLabel(day.date)} işlemleri`}>
                    <Ionicons name="ellipsis-horizontal" size={20} color={colors.textSecondary} />
                  </Touchable>
                ) : null}
              </Touchable>
              {isCollapsed ? null : (
                <View style={styles.gap}>
                  {day.matches.map((m) => {
                    const pct = Math.round(completion(m, fixedKeys) * 100);
                    return (
                      <RecordCard
                        key={m.id}
                        title={`${m.home} – ${m.away}`}
                        subtitle={[m.time, m.field, m.league && m.season ? `${m.league} · ${m.season}` : m.league].filter(Boolean).join(" · ") || null}
                        meta={`Gelir ${money(m.totals.income)} · Gider ${money(m.totals.expense)}${m.score ? ` · Skor ${m.score}` : ""}`}
                        icon="football-outline"
                        iconTone={pct === 100 ? "win" : pct ? "warn" : "neutral"}
                        value={money(m.totals.net, { signed: true })}
                        valueTone={m.totals.net >= 0 ? "win" : "danger"}
                        badges={[
                          { label: `%${pct}`, tone: pct === 100 ? "win" : "neutral" },
                          matchIsMissing(m) ? { label: "Eksik giriş", tone: "warn" } : null,
                          matchHasPending(m) ? { label: "Bekleyen var", tone: "info" } : null,
                          m.locked ? { label: "Kilitli", tone: "neutral", icon: "lock-closed-outline" } : null,
                          m.status === "taslak" ? { label: "Taslak", tone: "neutral" } : null,
                        ]}
                        onPress={() => onOpenMatch(m, visibleMatches)}
                        onLongPress={canManage ? () => onMatchMenu(m) : undefined}
                      />
                    );
                  })}
                  {day.entries.map((e) => (
                    <RecordCard
                      key={e.id}
                      title={`Gün sonu: ${e.title || e.categoryLabel}`}
                      subtitle={[e.categoryLabel, e.staffName].filter(Boolean).join(" · ")}
                      icon={e.direction === "income" ? "arrow-down" : "arrow-up"}
                      iconTone={e.direction === "income" ? "win" : "danger"}
                      value={money(e.direction === "income" ? e.amount : -e.amount, { signed: true })}
                      valueTone={e.direction === "income" ? "win" : "danger"}
                      badges={[{ label: e.status === "paid" ? "Ödendi" : "Bekliyor", tone: e.status === "paid" ? "win" : "warn" }]}
                      onPress={canManage && !locked ? () => onEditEntry(e) : undefined}
                      onLongPress={canManage ? () => onToggleEntry(e) : undefined}
                    />
                  ))}
                </View>
              )}
            </View>
          );
        })
      )}
      <Muted>Maça dokunun: kutucuklar, durum, personel, yöntem ve not. Basılı tutun: varsayılanla doldur, tahsil et, öde. Gün başlığındaki menüden gün sonu kalemi eklenir.</Muted>
    </View>
  );
}

/* ---------------------------------- raporlar ---------------------------------- */

type SortKey = "net" | "income" | "expense" | "matchCount";

function RankPanel({ title, rows, nameOf, subOf, csvName }: { title: string; rows: AccRankRow[]; nameOf: (r: AccRankRow) => string; subOf?: (r: AccRankRow) => string | undefined; csvName: string }) {
  const [sort, setSort] = useState<SortKey>("net");
  const sorted = [...rows].sort((a, b) => (b[sort] as number) - (a[sort] as number));
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.net)));
  return (
    <Panel title={title} action={rows.length ? { label: "CSV", onPress: () => void shareCsv(`${csvName}.csv`, rankCsv(rows, nameOf)) } : undefined}>
      {rows.length ? (
        <>
          <ChipGroup scrollable contentPadding={0}>
            {([["net", "Net kâr"], ["income", "Gelir"], ["expense", "Gider"], ["matchCount", "Maç"]] as [SortKey, string][]).map(([k, l]) => (
              <Chip key={k} label={l} size="sm" selected={sort === k} onPress={() => setSort(k)} />
            ))}
          </ChipGroup>
          {sorted.map((r) => (
            <BarRow
              key={String(r.key)}
              label={`${nameOf(r)}${subOf?.(r) ? ` · ${subOf(r)}` : ""}`}
              value={money(r.net, { signed: true })}
              ratio={Math.abs(r.net) / max}
              tone={r.net >= 0 ? "win" : "danger"}
              sub={`${r.matchCount} maç · gelir ${money(r.income)} · gider ${money(r.expense)}${r.matchCount ? ` · maç başı ${money(r.net / r.matchCount)}` : ""}`}
            />
          ))}
        </>
      ) : (
        <Muted>Kayıt yok.</Muted>
      )}
    </Panel>
  );
}

export function ReportsView({ book, categories }: { book: AccBook; categories: AccCategory[] }) {
  const r = book.reports;
  const [period, setPeriod] = useState<"monthly" | "weekly" | "daily">(r.monthly.length > 1 ? "monthly" : "daily");
  const [cumulative, setCumulative] = useState(true);
  const periods = {
    monthly: { title: "Aylık kâr", rows: r.monthly, label: (x: AccPeriodRow) => monthLabel(x.key), short: (x: AccPeriodRow) => monthLabel(x.key).slice(0, 3) },
    weekly: { title: "Haftalık kâr", rows: r.weekly, label: (x: AccPeriodRow) => `${x.week}. hafta (${shortDay(x.from)}–${shortDay(x.to)})`, short: (x: AccPeriodRow) => `${x.week}. hf` },
    daily: { title: "Günlük kâr", rows: r.daily, label: (x: AccPeriodRow) => dayLabel(x.key), short: (x: AccPeriodRow) => shortDay(x.key) },
  };
  const current = periods[period];
  let running = 0;
  const totals = current.rows.reduce((t, x) => ({ m: t.m + x.matchCount, i: t.i + x.income, e: t.e + x.expense, n: t.n + x.net }), { m: 0, i: 0, e: 0, n: 0 });
  const maxNet = Math.max(1, ...current.rows.map((x) => Math.abs(x.net)));
  const maxWeek = Math.max(1, ...(r.byWeekday || []).map((x) => Math.abs(x.net)));
  return (
    <View style={styles.gap}>
      <SummaryKpis book={book} />
      <Panel title={current.title} action={current.rows.length ? { label: "CSV", onPress: () => void shareCsv(`kar-${period}-${book.range.from}_${book.range.to}.csv`, periodCsv(current.rows, current.label)) } : undefined}>
        <SegmentedControl
          items={[
            { key: "monthly", label: "Aylık" },
            { key: "weekly", label: "Haftalık" },
            { key: "daily", label: "Günlük" },
          ]}
          value={period}
          onChange={setPeriod}
          stretch
          size="sm"
        />
        <TrendBars rows={current.rows.map((x) => ({ key: x.key, label: current.short(x), title: current.label(x), income: x.income, expense: x.expense, net: x.net }))} emptyText="Kayıt yok." />
        <ToggleField label="Kümülatif net göster" value={cumulative} onChange={setCumulative} />
        {current.rows.map((x) => {
          running += x.net;
          return (
            <BarRow
              key={x.key}
              label={current.label(x)}
              value={money(cumulative ? running : x.net, { signed: true })}
              ratio={Math.abs(x.net) / maxNet}
              tone={x.net >= 0 ? "win" : "danger"}
              sub={`${x.matchCount} maç · gelir ${money(x.income)} · gider ${money(x.expense)} · marj ${percent(x.margin)} · alacak ${money(x.receivable)} · borç ${money(x.payable)}${cumulative ? ` · dönem ${money(x.net, { signed: true })}` : ""}`}
            />
          );
        })}
        {current.rows.length ? <Muted>{`Toplam: ${totals.m} maç · gelir ${money(totals.i)} · gider ${money(totals.e)} · net ${money(totals.n, { signed: true })}`}</Muted> : null}
      </Panel>
      <Breakdown title="Gider dağılımı (kalem bazlı)" rows={r.expenseBreakdown} total={book.summary.expense} tone="danger" />
      <Breakdown title="Gelir dağılımı" rows={r.incomeBreakdown} total={book.summary.income} tone="win" />
      <BudgetPanel book={book} categories={categories} />
      <AgingPanel book={book} />
      <Panel title="Ödeme yöntemleri">
        <Muted>Tahsil edilen / ödenen kayıtların yönteme göre dağılımı.</Muted>
        {r.byMethod?.length ? (
          r.byMethod.map((m) => <RecordCard key={m.key} title={m.label} subtitle={`${m.count} kayıt`} icon="card-outline" value={`+${money(m.income)} / −${money(m.expense)}`} />)
        ) : (
          <Muted>Ödenmiş kayıt yok.</Muted>
        )}
      </Panel>
      <Panel title="Haftanın günlerine göre">
        {r.byWeekday?.length ? (
          r.byWeekday.map((w) => (
            <BarRow
              key={w.key}
              label={w.label}
              value={money(w.net, { signed: true })}
              ratio={Math.abs(w.net) / maxWeek}
              tone={w.net >= 0 ? "win" : "danger"}
              sub={`${w.matchCount} maç${w.matchCount ? ` · maç başı ${money(w.net / w.matchCount)}` : ""}`}
            />
          ))
        ) : (
          <Muted>Kayıt yok.</Muted>
        )}
      </Panel>
      <RankPanel title="Saha bazlı kâr" rows={r.byField} nameOf={(x) => String(x.key)} csvName="saha-kar" />
      <RankPanel title="Lig bazlı kâr" rows={r.byLeague} nameOf={(x) => String(x.key)} csvName="lig-kar" />
      <RankPanel title="Sezon bazlı kâr" rows={r.bySeason} nameOf={(x) => x.name || String(x.key)} subOf={(x) => x.league} csvName="sezon-kar" />
    </View>
  );
}

/* ---------------------------------- personel ---------------------------------- */

export function StaffView({ book, categories, canManage, onMarkPaid, onStatement, onExport }: { book: AccBook; categories: AccCategory[]; canManage: boolean; onMarkPaid: (ids: number[], message: string) => void; onStatement: (r: AccStaffRow) => void; onExport: () => void }) {
  const [query, setQuery] = useState("");
  const [onlyPending, setOnlyPending] = useState(false);
  const [sort, setSort] = useState<"earned" | "pending" | "tasks" | "name">("earned");
  const labels = Object.fromEntries(categories.map((c) => [c.key, c.label]));
  const rows = book.reports.staff
    .filter((r) => r.name.toLocaleLowerCase("tr").includes(query.toLocaleLowerCase("tr")))
    .filter((r) => !onlyPending || r.pending > 0 || r.unpaidTasks > 0)
    .sort((a, b) => (sort === "name" ? a.name.localeCompare(b.name, "tr") : (b[sort] as number) - (a[sort] as number)));
  const t = rows.reduce((acc, r) => ({ tasks: acc.tasks + r.tasks, earned: acc.earned + r.earned, paid: acc.paid + r.paid, pending: acc.pending + r.pending }), { tasks: 0, earned: 0, paid: 0, pending: 0 });
  return (
    <View style={styles.gap}>
      <Muted>Görev sayısı maç görevlendirmelerinden, kazanç girilen ödemelerden gelir. Kutucukta personel seçilmemişse ödeme maçın görevlisine yazılır.</Muted>
      <StatRow
        items={[
          { label: "Hak ediş", value: money(t.earned) },
          { label: "Ödenen", value: money(t.paid), tone: "win" },
          { label: "Bekleyen", value: money(t.pending), tone: t.pending ? "danger" : undefined },
          { label: "Görev", value: t.tasks },
        ]}
      />
      <Input variant="search" leadingIcon="search" value={query} onChangeText={setQuery} placeholder="Personel ara" autoCapitalize="none" />
      <ToggleField label="Yalnızca bekleyenler" value={onlyPending} onChange={setOnlyPending} />
      <ChipGroup scrollable contentPadding={0}>
        {([["earned", "Kazanç"], ["pending", "Bekleyen"], ["tasks", "Görev"], ["name", "Ad"]] as const).map(([k, l]) => (
          <Chip key={k} label={l} size="sm" selected={sort === k} onPress={() => setSort(k)} />
        ))}
        <Chip label="CSV" icon="share-outline" size="sm" onPress={onExport} />
      </ChipGroup>
      {!rows.length ? <Muted>Bu dönemde görev alan personel yok.</Muted> : null}
      {rows.map((r) => (
        <RecordCard
          key={r.staffId}
          title={r.name}
          subtitle={`${r.tasks} görev · ${r.matchCount} maç · görev başı ${money(r.average)}`}
          meta={Object.entries(r.byCategory).map(([k, a]) => `${labels[k] || k}: ${money(a)}`).join(" · ") || null}
          icon="person-outline"
          value={money(r.earned)}
          badges={[
            { label: `Ödenen ${money(r.paid)}`, tone: "win" },
            r.pending > 0 ? { label: `Bekleyen ${money(r.pending)}`, tone: "danger" } : null,
            r.unpaidTasks > 0 ? { label: `${r.unpaidTasks} görev ücretsiz`, tone: "warn" } : null,
          ]}
          onPress={() => onStatement(r)}
        >
          {canManage && r.pendingEntryIds.length ? (
            <View style={styles.inline}>
              <Button label="Ödendi yap" icon="checkmark" size="sm" variant="secondary" onPress={() => onMarkPaid(r.pendingEntryIds, `${r.name} için ${money(r.pending)} ödendi olarak işaretlensin mi?`)} />
            </View>
          ) : null}
        </RecordCard>
      ))}
    </View>
  );
}

/* ---------------------------------- takımlar ---------------------------------- */

export function TeamsView({ book, canManage, onMarkPaid, onStatement, onExport }: { book: AccBook; canManage: boolean; onMarkPaid: (ids: number[], message: string) => void; onStatement: (r: AccTeamRow) => void; onExport: () => void }) {
  const [onlyDebt, setOnlyDebt] = useState(false);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"outstanding" | "billed" | "matches" | "name">("outstanding");
  const rows = book.reports.teams
    .filter((r) => !onlyDebt || r.outstanding > 0)
    .filter((r) => r.name.toLocaleLowerCase("tr").includes(query.toLocaleLowerCase("tr")))
    .sort((a, b) => (sort === "name" ? a.name.localeCompare(b.name, "tr") : (b[sort] as number) - (a[sort] as number)));
  const t = rows.reduce((acc, r) => ({ billed: acc.billed + r.billed, collected: acc.collected + r.collected, outstanding: acc.outstanding + r.outstanding }), { billed: 0, collected: 0, outstanding: 0 });
  const debtors = rows.filter((r) => r.outstanding > 0).length;
  return (
    <View style={styles.gap}>
      <Muted>Takımlardan alınacak maç ücretleri: faturalanan, tahsil edilen ve kalan alacak. Takıma dokunup ekstresini açın, WhatsApp'a paylaşın.</Muted>
      <StatRow
        items={[
          { label: "Faturalanan", value: money(t.billed) },
          { label: "Tahsil edilen", value: money(t.collected), tone: "win" },
          { label: "Kalan alacak", value: money(t.outstanding), tone: t.outstanding ? "danger" : undefined },
          { label: `Oran · ${debtors} borçlu`, value: t.billed ? `%${Math.round((t.collected / t.billed) * 100)}` : "—" },
        ]}
      />
      <Input variant="search" leadingIcon="search" value={query} onChangeText={setQuery} placeholder="Takım ara" autoCapitalize="none" />
      <ToggleField label="Yalnızca borçlu takımlar" value={onlyDebt} onChange={setOnlyDebt} />
      <ChipGroup scrollable contentPadding={0}>
        {([["outstanding", "Alacak"], ["billed", "Faturalanan"], ["matches", "Maç"], ["name", "Ad"]] as const).map(([k, l]) => (
          <Chip key={k} label={l} size="sm" selected={sort === k} onPress={() => setSort(k)} />
        ))}
        <Chip label="CSV" icon="share-outline" size="sm" onPress={onExport} />
      </ChipGroup>
      {!rows.length ? <Muted>Kayıt yok.</Muted> : null}
      {rows.map((r) => {
        const age = ageInDays(r.oldestPending);
        return (
          <RecordCard
            key={String(r.teamId ?? r.name)}
            title={r.name}
            subtitle={`${r.matches} maç · ücret girilen ${r.matches - r.unbilledMatches} · faturalanan ${money(r.billed)} · tahsil ${money(r.collected)}`}
            icon="shield-outline"
            value={money(r.outstanding)}
            valueTone={r.outstanding > 0 ? "danger" : "neutral"}
            badges={[
              r.unbilledMatches > 0 ? { label: `${r.unbilledMatches} eksik`, tone: "warn" } : null,
              age != null ? { label: `${age} gün`, tone: age > 30 ? "danger" : age > 7 ? "warn" : "neutral" } : null,
              r.billed ? { label: `%${Math.round((r.collected / r.billed) * 100)} tahsil`, tone: "info" } : null,
            ]}
            onPress={() => onStatement(r)}
          >
            {canManage && r.pendingEntryIds.length ? (
              <View style={styles.inline}>
                <Button label="Tahsil edildi yap" icon="checkmark" size="sm" variant="secondary" onPress={() => onMarkPaid(r.pendingEntryIds, `${r.name} takımının ${money(r.outstanding)} alacağı tahsil edildi olarak işaretlensin mi?`)} />
              </View>
            ) : null}
          </RecordCard>
        );
      })}
    </View>
  );
}

/* -------------------------------- genel kayıtlar -------------------------------- */

export function GeneralView({
  book,
  paymentMethods,
  canManage,
  onAdd,
  onEdit,
  onToggle,
  onCopyNext,
  onDelete,
}: {
  book: AccBook;
  paymentMethods: { key: string; label: string }[];
  canManage: boolean;
  onAdd: () => void;
  onEdit: (e: AccEntry) => void;
  onToggle: (e: AccEntry) => void;
  onCopyNext: (e: AccEntry) => void;
  onDelete: (e: AccEntry) => void;
}) {
  const [filter, setFilter] = useState<"all" | "expense" | "income" | "pending">("all");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<number | null>(null);
  const q = query.trim().toLocaleLowerCase("tr");
  const entries = book.days
    .flatMap((d) => d.entries)
    .filter((e) => filter === "all" || (filter === "pending" ? e.status === "pending" : e.direction === filter))
    .filter((e) => !q || `${e.title || ""} ${e.categoryLabel} ${e.note || ""}`.toLocaleLowerCase("tr").includes(q))
    .sort((a, b) => b.date.localeCompare(a.date));
  const income = entries.filter((e) => e.direction === "income").reduce((n, e) => n + e.amount, 0);
  const expense = entries.filter((e) => e.direction === "expense").reduce((n, e) => n + e.amount, 0);
  return (
    <View style={styles.gap}>
      <Muted>Maça bağlı olmayan kalemler: kira, ekipman, reklam, sponsor geliri, gün sonu giderleri. Defterde ilgili günün sonunda da görünür.</Muted>
      {canManage ? <Button label="Kayıt ekle" icon="add" onPress={onAdd} /> : null}
      <SegmentedControl
        items={[
          { key: "all", label: "Tümü" },
          { key: "expense", label: "Gider" },
          { key: "income", label: "Gelir" },
          { key: "pending", label: "Bekleyen" },
        ]}
        value={filter}
        onChange={setFilter}
        stretch
        size="sm"
      />
      <Input variant="search" leadingIcon="search" value={query} onChangeText={setQuery} placeholder="Kayıtlarda ara" autoCapitalize="none" />
      {entries.length ? (
        <StatRow
          items={[
            { label: "Gelir", value: money(income), tone: "win" },
            { label: "Gider", value: money(expense), tone: "danger" },
            { label: "Net", value: money(income - expense, { signed: true }), tone: income - expense >= 0 ? "win" : "danger" },
          ]}
        />
      ) : (
        <Muted>Bu dönemde genel kayıt yok.</Muted>
      )}
      {entries.map((e) => {
        const locked = isLockedDay(book.settings, e.date);
        const expanded = open === e.id;
        return (
          <RecordCard
            key={e.id}
            title={e.title || "—"}
            subtitle={[e.categoryLabel, e.staffName, paymentMethods.find((m) => m.key === e.paymentMethod)?.label].filter(Boolean).join(" · ")}
            meta={[`${shortDay(e.date)}.${e.date.slice(0, 4)}`, e.note].filter(Boolean).join(" · ")}
            icon={e.direction === "income" ? "arrow-down" : "arrow-up"}
            iconTone={e.direction === "income" ? "win" : "danger"}
            value={money(e.direction === "income" ? e.amount : -e.amount, { signed: true })}
            valueTone={e.direction === "income" ? "win" : "danger"}
            badges={[{ label: e.status === "paid" ? "Ödendi" : "Bekliyor", tone: e.status === "paid" ? "win" : "warn" }, locked ? { label: "Kilitli", icon: "lock-closed-outline", tone: "neutral" } : null]}
            onPress={canManage ? () => setOpen(expanded ? null : e.id) : undefined}
          >
            {expanded ? (
              <View style={styles.actionsRow}>
                <Button label={e.status === "paid" ? "Bekliyor yap" : "Ödendi yap"} size="sm" variant="secondary" onPress={() => onToggle(e)} />
                {!locked ? <Button label="Düzenle" size="sm" variant="secondary" onPress={() => onEdit(e)} /> : null}
                <Button label={`Sonraki aya (${shortDay(nextMonthDay(e.date))})`} size="sm" variant="ghost" onPress={() => onCopyNext(e)} />
                {!locked ? <Button label="Sil" size="sm" variant="danger" onPress={() => onDelete(e)} /> : null}
              </View>
            ) : null}
          </RecordCard>
        );
      })}
    </View>
  );
}

/* ----------------------------------- eksikler ----------------------------------- */

export function MissingView({ book, canManage, onOpenMatch, onFill }: { book: AccBook; canManage: boolean; onOpenMatch: (m: AccMatch) => void; onFill: (ids: number[]) => void }) {
  const [kind, setKind] = useState<"all" | "income" | "expense">("all");
  const all = book.reports.missing;
  const rows = all.filter((r) => kind === "all" || (kind === "income" ? r.noIncome : r.noExpense));
  const byId = new Map(book.days.flatMap((d) => d.matches).map((m) => [m.id, m]));
  const fillable = rows.filter((r) => !byId.get(r.matchId)?.locked).map((r) => r.matchId);
  if (!all.length) return <Note tone="win" icon="checkmark-circle-outline" text="Tüm maçların gelir ve gider girişleri tamam." />;
  return (
    <View style={styles.gap}>
      <Muted>Takım ücreti ya da hiçbir gideri girilmemiş maçlar. Maça dokunup tamamlayın ya da varsayılan tutarlarla toplu doldurun.</Muted>
      <SegmentedControl
        items={[
          { key: "all", label: `Tümü (${all.length})` },
          { key: "income", label: `Ücret yok (${all.filter((r) => r.noIncome).length})` },
          { key: "expense", label: `Gider yok (${all.filter((r) => r.noExpense).length})` },
        ]}
        value={kind}
        onChange={setKind}
        stretch
        size="sm"
      />
      {canManage && fillable.length ? <Button label={`${fillable.length} maçı varsayılanla doldur`} icon="flash-outline" onPress={() => onFill(fillable)} /> : null}
      {rows.map((r) => {
        const m = byId.get(r.matchId);
        return (
          <RecordCard
            key={r.matchId}
            title={r.label}
            subtitle={`${dayLabel(r.date)}${m?.field ? ` · ${m.field}` : ""}`}
            icon="alert-circle-outline"
            iconTone="warn"
            badges={[
              r.noIncome ? { label: "Takım ücreti yok", tone: "warn" } : null,
              r.noExpense ? { label: "Gider yok", tone: "warn" } : null,
              r.status === "taslak" ? { label: "Taslak", tone: "neutral" } : null,
              m?.locked ? { label: "Kilitli", icon: "lock-closed-outline", tone: "neutral" } : null,
            ]}
            onPress={m ? () => onOpenMatch(m) : undefined}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  gap: { gap: space.sm },
  flex: { flex: 1 },
  row: { flexDirection: "row", alignItems: "center", gap: space.sm },
  inline: { flexDirection: "row", marginTop: space.xs },
  actionsRow: { flexDirection: "row", flexWrap: "wrap", gap: space.xs, marginTop: space.xs },
  subTitle: { ...type.label, color: colors.textPrimary },
  todo: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.xs, borderBottomWidth: hairline, borderBottomColor: colors.separator },
  todoTitle: { ...type.bodySm, color: colors.textPrimary },
  todoBody: { ...type.caption, color: colors.textTertiary },
  todoActions: { flexDirection: "row", gap: space.xs },
  collapse: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: radius.md, backgroundColor: colors.surface2 },
  day: { gap: space.sm },
  dayHead: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.sm, borderBottomWidth: hairline, borderBottomColor: colors.separator },
  dayTitle: { ...type.label, color: colors.textPrimary },
  daySub: { ...type.caption, color: colors.textTertiary },
  dayNet: { ...type.numSmStrong },
});
