/**
 * Genel Bakış ve Personel Karnesi listesi.
 *
 * Web: evaluations/OverviewTab.js + StaffCardTab.js sol listesi. Dönemin
 * özeti: eksik formlar (maça dokun → form), temel göstergeler, alanlar,
 * personel sıralaması (kişiye dokun → karne), en çok aksayan maddeler,
 * kategoriler ve son kayıtlar (CSV paylaş). Tablo/ısı haritası görünümleri
 * telefonda okunmadığı için sıralı liste ve çubuk olarak verilir.
 */

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { OptionSheet, Panel, RecordCard } from "@/components/admin";
import { Button, Chip, ChipGroup, EmptyState, ErrorState, Input, MetricGrid, MetricTile, SegmentedControl, SkeletonCard } from "@/components/ui";
import {
  csvNumber,
  formatDay,
  formatDelta,
  formatPct,
  formatTl,
  getAnalysis,
  toCsv,
  type EvalArea,
  type FilterScope,
} from "@/lib/api/admin/evaluations";
import { colors, space, textScale, type } from "@/theme";

import { shareCsv } from "./shareCsv";
import { DeltaText, ScoreBar } from "./widgets";

type View_ = "staff" | "items" | "recent";
const SORTS = [
  { value: "score", label: "Skora göre" },
  { value: "change", label: "Değişime göre" },
  { value: "net", label: "Nete göre" },
  { value: "count", label: "Form sayısına göre" },
] as const;

export interface ReportProps {
  range: { from: string; to: string };
  scope: FilterScope;
  areas: EvalArea[];
  cityName?: string | null;
  canSubmit: boolean;
}

export const staffCardHref = (staffId: number, range: { from: string; to: string }, scope: FilterScope) => ({
  pathname: "/yonetim/degerlendirmeler/personel/[id]" as const,
  params: { id: String(staffId), from: range.from, to: range.to, cityId: scope.cityId ?? "", leagueId: scope.leagueId ?? "", seasonId: scope.seasonId ?? "" },
});

export function OverviewTab({ range, scope, areas, cityName, onGoForms }: ReportProps & { onGoForms: () => void }) {
  const router = useRouter();
  const [area, setArea] = useState<string | null>(null);
  const [view, setView] = useState<View_>("staff");
  const [sort, setSort] = useState<(typeof SORTS)[number]["value"]>("score");
  const [sortOpen, setSortOpen] = useState(false);
  const [areaOpen, setAreaOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const query = useQuery({
    queryKey: ["admin", "evaluations", "analysis", range.from, range.to, area ?? "", scope.cityId ?? "", scope.leagueId ?? "", scope.seasonId ?? ""],
    queryFn: () => getAnalysis({ ...range, area: area ?? undefined, ...scope }),
  });
  const data = query.data;

  const staffRows = useMemo(() => {
    if (!data) return [];
    const sorters = {
      score: (a: (typeof data.byStaff)[number], b: (typeof data.byStaff)[number]) => (b.averageScore ?? -1) - (a.averageScore ?? -1),
      change: (a: (typeof data.byStaff)[number], b: (typeof data.byStaff)[number]) => (b.change ?? -999) - (a.change ?? -999),
      net: (a: (typeof data.byStaff)[number], b: (typeof data.byStaff)[number]) => b.net - a.net,
      count: (a: (typeof data.byStaff)[number], b: (typeof data.byStaff)[number]) => b.evaluationCount - a.evaluationCount,
    };
    return [...data.byStaff].sort(sorters[sort]);
  }, [data, sort]);

  if (query.isLoading) return <SkeletonCard />;
  if (query.error || !data) return <ErrorState error={query.error} onRetry={query.refetch} variant="inline" />;

  const { totals, coverage } = data;
  const hasPayout = totals.baseFee > 0;
  const pending = coverage.pendingMatches ?? [];
  const weak = data.byQuestion.filter((r) => r.successPct != null).slice(0, 8);

  const exportRecent = () => {
    const suffix = cityName ? `-${cityName.toLocaleLowerCase("tr-TR").replace(/\s+/g, "-")}` : "";
    void shareCsv(
      `mac-degerlendirmeleri${suffix}-${data.range.from}-${data.range.to}.csv`,
      toCsv(
        ["Tarih", "Maç / Hafta", "Alan", "Personel", "Skor (%)", "Aksayan madde", "Bonus", "Kesinti", "Net", "Taban ücret", "Hakediş", "Değerlendiren", "Not"],
        data.recent.map((r) => [
          r.periodDate,
          r.label,
          r.areaLabel,
          r.staffName || r.staffId,
          csvNumber(r.scorePct),
          r.failCount,
          csvNumber(r.bonus),
          csvNumber(r.deduction),
          csvNumber(r.net),
          csvNumber(r.baseFee),
          csvNumber(r.payout),
          r.evaluatorName || "",
          r.note || "",
        ])
      )
    );
  };

  return (
    <View style={styles.wrap}>
      <ChipGroup scrollable contentPadding={0}>
        <Chip size="sm" icon="layers-outline" label={areas.find((a) => a.key === area)?.label ?? "Tüm alanlar"} selected={Boolean(area)} onPress={() => setAreaOpen(true)} onDismiss={area ? () => setArea(null) : undefined} />
      </ChipGroup>
      <Text style={styles.range} {...textScale.dense}>
        {formatDay(data.range.from, false)} – {formatDay(data.range.to, false)} · önceki dönemle ({formatDay(data.previousRange.from, false)} – {formatDay(data.previousRange.to, false)}) kıyaslanıyor
      </Text>

      {coverage.matchCount > 0 ? (
        pending.length ? (
          <Panel title={`${pending.length} maçta eksik form var`} action={{ label: "Formlara git", onPress: onGoForms }}>
            <Text style={styles.muted} {...textScale.long}>
              {coverage.done}/{coverage.slots} maç alanı değerlendirildi
              {coverage.weekCount > 0 ? ` · sosyal medya ${coverage.weeksDone}/${coverage.weekCount} hafta` : ""}
            </Text>
            {pending.slice(0, 4).map((m) => (
              <RecordCard
                key={m.id}
                title={m.label}
                subtitle={formatDay(m.day, false)}
                icon="clipboard-outline"
                iconTone="warn"
                value={`${m.doneCount}/${m.areaCount}`}
                onPress={() => router.push({ pathname: "/yonetim/degerlendirmeler/mac/[id]", params: { id: String(m.id), ids: pending.map((p) => p.id).join(",") } })}
              />
            ))}
            {pending.length > 4 ? <Button label={`+${pending.length - 4} maç daha`} variant="ghost" size="sm" onPress={onGoForms} /> : null}
          </Panel>
        ) : (
          <Text style={styles.done} {...textScale.long}>
            Dönemdeki tüm maçlar değerlendirildi.
          </Text>
        )
      ) : null}

      <MetricGrid columns={2}>
        <MetricTile
          label="Ortalama skor"
          value={formatPct(totals.averageScore)}
          hint={`${totals.evaluationCount} form · ${totals.staffCount} kişi${totals.change.averageScore != null ? ` · ${formatDelta(totals.change.averageScore)}` : ""}`}
          icon="speedometer-outline"
          tone="brand"
        />
        <MetricTile label="Kapsama" value={formatPct(coverage.coveragePct)} hint={coverage.slots ? `${coverage.done}/${coverage.slots} maç alanı` : "Dönemde maç yok"} icon="checkmark-done-outline" />
        <MetricTile
          label="Aksayan madde"
          value={formatPct(totals.failRate)}
          hint={`${totals.failCount} madde${totals.change.failRate != null ? ` · ${formatDelta(totals.change.failRate)}` : ""}`}
          icon="warning-outline"
          tone="warn"
        />
        <MetricTile
          label={hasPayout ? "Hakediş" : "Net bonus / kesinti"}
          value={hasPayout ? formatTl(totals.payout) : formatTl(totals.net, true)}
          hint={`Bonus ${formatTl(totals.bonus)} · Kesinti ${formatTl(totals.deduction)}`}
          icon="cash-outline"
          tone={totals.net >= 0 ? "win" : "danger"}
        />
      </MetricGrid>

      {!totals.evaluationCount ? (
        <EmptyState icon="clipboard-outline" title="Bu dönemde değerlendirme yok" body="Formlar sekmesinden maç ya da hafta seçip form doldur." action={{ label: "Formlara git", onPress: onGoForms }} variant="inline" />
      ) : (
        <>
          <Panel title="Haftalık seyir · ortalama skor">
            {data.trend.map((p) => (
              <View key={p.label} style={styles.barRow}>
                <Text style={styles.barLabel} numberOfLines={1} {...textScale.dense}>
                  {p.label}
                </Text>
                <View style={styles.flex}>
                  <ScoreBar value={p.averageScore} compact />
                </View>
              </View>
            ))}
          </Panel>

          <Panel title="Alanlar">
            {data.byArea.map((r) => (
              <View key={r.area} style={styles.areaRow}>
                <View style={styles.flex}>
                  <Text style={styles.areaLabel} {...textScale.dense}>
                    {r.label}
                  </Text>
                  <Text style={styles.muted} {...textScale.dense}>
                    {r.evaluationCount} form · aksayan {formatPct(r.failRate)} · net {formatTl(r.net, true)}
                  </Text>
                </View>
                <View style={styles.areaScore}>
                  <ScoreBar value={r.averageScore} compact />
                  <DeltaText value={r.change} />
                </View>
              </View>
            ))}
          </Panel>

          <SegmentedControl<View_>
            items={[
              { key: "staff", label: `Personel (${data.byStaff.length})` },
              { key: "items", label: "Maddeler" },
              { key: "recent", label: `Kayıtlar (${data.recent.length})` },
            ]}
            value={view}
            onChange={setView}
            size="sm"
          />

          {view === "staff" ? (
            <>
              <ChipGroup scrollable contentPadding={0}>
                <Chip size="sm" icon="swap-vertical-outline" label={SORTS.find((s) => s.value === sort)?.label ?? "Sırala"} onPress={() => setSortOpen(true)} />
              </ChipGroup>
              {staffRows.map((r) => (
                <RecordCard
                  key={r.staffId}
                  title={`${r.rank}. ${r.name}`}
                  subtitle={r.areas.map((a) => a.label).join(", ")}
                  meta={`${r.evaluationCount} form · ${r.failCount || 0} aksayan · ${hasPayout ? formatTl(r.payout) : formatTl(r.net, true)}`}
                  avatar={{ name: r.name }}
                  value={formatPct(r.averageScore)}
                  valueTone={r.averageScore == null ? "neutral" : r.averageScore >= 70 ? "win" : r.averageScore >= 50 ? "warn" : "danger"}
                  badges={[r.change != null && r.change !== 0 ? { label: formatDelta(r.change), tone: r.change > 0 ? "win" : "danger" } : null]}
                  onPress={() => router.push(staffCardHref(r.staffId, range, scope))}
                />
              ))}
            </>
          ) : null}

          {view === "items" ? (
            <>
              <Panel title="En çok aksayan işler">
                {!weak.length ? (
                  <Text style={styles.muted} {...textScale.long}>
                    Aksayan madde yok.
                  </Text>
                ) : (
                  weak.map((r) => (
                    <View key={r.questionId} style={styles.weak}>
                      <Text style={styles.areaLabel} {...textScale.long}>
                        {r.text}
                      </Text>
                      <Text style={styles.muted} {...textScale.dense}>
                        {r.areaLabel}
                        {r.category ? ` · ${r.category}` : ""} ·{" "}
                        {r.type === "yes_no" ? `${r.answered} formda ${formatPct(r.yesRate)} yapıldı` : `ort. ${r.averageScore}/10`}
                      </Text>
                      <ScoreBar value={r.successPct} />
                      {r.topFailers.length ? (
                        <ChipGroup scrollable contentPadding={0}>
                          {r.topFailers.map((f) => (
                            <Chip key={f.staffId} size="sm" label={`${f.name} ×${f.count}`} onPress={() => router.push(staffCardHref(f.staffId, range, scope))} />
                          ))}
                        </ChipGroup>
                      ) : null}
                      {r.comments[0] ? (
                        <Text style={styles.muted} {...textScale.long}>
                          “{r.comments[0].text}”{r.comments[0].staffName ? ` — ${r.comments[0].staffName}` : ""}
                        </Text>
                      ) : null}
                    </View>
                  ))
                )}
              </Panel>
              <Panel title="Kategoriler · başarı oranı">
                {data.byCategory.map((r) => (
                  <View key={r.category} style={styles.areaRow}>
                    <View style={styles.flex}>
                      <Text style={styles.areaLabel} {...textScale.dense}>
                        {r.category}
                      </Text>
                      <Text style={styles.muted} {...textScale.dense}>
                        {r.answered} cevap · {r.failCount} aksama
                      </Text>
                    </View>
                    <ScoreBar value={r.successPct} compact />
                  </View>
                ))}
              </Panel>
            </>
          ) : null}

          {view === "recent" ? (
            <>
              {data.recent.length ? <Button label="Kayıtları CSV paylaş" icon="share-outline" size="sm" variant="secondary" onPress={exportRecent} /> : null}
              {(showAll ? data.recent : data.recent.slice(0, 12)).map((r) => (
                <RecordCard
                  key={r.id}
                  title={r.label}
                  subtitle={`${r.areaLabel} · ${r.staffName || `#${r.staffId}`}`}
                  meta={[formatDay(r.periodDate, false), r.evaluatorName].filter(Boolean).join(" · ")}
                  icon="document-text-outline"
                  value={formatPct(r.scorePct)}
                  badges={[r.failCount ? { label: `${r.failCount} aksayan`, tone: "danger" } : null, { label: formatTl(r.net, true), tone: r.net >= 0 ? "win" : "danger" }]}
                  onPress={
                    r.matchId
                      ? () => router.push({ pathname: "/yonetim/degerlendirmeler/mac/[id]", params: { id: String(r.matchId) } })
                      : () => router.push(staffCardHref(r.staffId, range, scope))
                  }
                />
              ))}
              {data.recent.length > 12 ? (
                <Button label={showAll ? "Daha az göster" : `Tümünü göster (${data.recent.length})`} variant="ghost" size="sm" onPress={() => setShowAll((v) => !v)} />
              ) : null}
            </>
          ) : null}
        </>
      )}

      <OptionSheet<string>
        visible={areaOpen}
        onClose={() => setAreaOpen(false)}
        title="Alan"
        clearable
        options={areas.map((a) => ({ value: a.key, label: a.label }))}
        value={area}
        onSelect={(v) => {
          setArea((v as string | null) ?? null);
          setAreaOpen(false);
        }}
      />
      <OptionSheet<string>
        visible={sortOpen}
        onClose={() => setSortOpen(false)}
        title="Sıralama"
        options={SORTS.map((s) => ({ value: s.value, label: s.label }))}
        value={sort}
        onSelect={(v) => {
          if (v) setSort(v as typeof sort);
          setSortOpen(false);
        }}
      />
    </View>
  );
}

/** Personel Karnesi sekmesi: dönemde değerlendirilen kişiler → karne. */
export function StaffListTab({ range, scope }: ReportProps) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const query = useQuery({
    queryKey: ["admin", "evaluations", "analysis", range.from, range.to, "", scope.cityId ?? "", scope.leagueId ?? "", scope.seasonId ?? ""],
    queryFn: () => getAnalysis({ ...range, ...scope }),
  });
  const rows = (query.data?.byStaff ?? []).filter((r) => !q.trim() || r.name.toLocaleLowerCase("tr-TR").includes(q.trim().toLocaleLowerCase("tr-TR")));
  if (query.isLoading) return <SkeletonCard />;
  if (query.error) return <ErrorState error={query.error} onRetry={query.refetch} variant="inline" />;
  return (
    <View style={styles.wrap}>
      <Input variant="search" leadingIcon="search" value={q} onChangeText={setQ} placeholder="Personel ara" autoCorrect={false} />
      {!rows.length ? (
        <EmptyState icon="person-outline" title="Kimse yok" body="Bu dönemde değerlendirilen personel bulunamadı." variant="inline" />
      ) : (
        rows.map((r) => (
          <RecordCard
            key={r.staffId}
            title={`${r.rank}. ${r.name}`}
            subtitle={`${r.areas.map((a) => a.label).join(", ")} · ${r.evaluationCount} form`}
            avatar={{ name: r.name }}
            value={formatPct(r.averageScore)}
            badges={[r.change != null && r.change !== 0 ? { label: formatDelta(r.change), tone: r.change > 0 ? "win" : "danger" } : null]}
            onPress={() => router.push(staffCardHref(r.staffId, range, scope))}
          />
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  flex: { flex: 1 },
  range: { ...type.caption, color: colors.textTertiary },
  muted: { ...type.caption, color: colors.textTertiary },
  done: { ...type.bodySm, color: colors.win },
  barRow: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: 2 },
  barLabel: { ...type.caption, color: colors.textSecondary, width: 72 },
  areaRow: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.xs },
  areaLabel: { ...type.bodySm, color: colors.textPrimary },
  areaScore: { alignItems: "flex-end", gap: 2, width: 130 },
  weak: { gap: space.xs, paddingVertical: space.sm },
});
