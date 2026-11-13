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

import Ionicons from "@expo/vector-icons/Ionicons";

import { OptionSheet } from "@/components/admin";
import { MeterRow, ScorePlate, StageStat, SysGroup, SysRow, SysStage, toneBg, toneFg } from "@/components/admin/system/SysKit";
import { Button, Chip, ChipGroup, EmptyState, ErrorState, GradientBar, IconTile, Input, Reveal, SectionHeader, SegmentedControl, SkeletonCard } from "@/components/ui";
import {
  csvNumber,
  formatDay,
  formatPct,
  formatTl,
  getAnalysis,
  scoreLevel,
  toCsv,
  type EvalArea,
  type FilterScope,
} from "@/lib/api/admin/evaluations";
import { colors, hairline, radius, space, textScale, type } from "@/theme";

import { shareCsv } from "./shareCsv";
import { areaIcon, areaTone, DeltaPill, levelGradient, RankCard, ScoreDial, TrendColumns } from "./EvalParts";

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

  const coverageRatio = (coverage.coveragePct ?? 0) / 100;

  return (
    <View style={styles.wrap}>
      <ChipGroup scrollable contentPadding={0}>
        <Chip size="sm" icon="layers-outline" label={areas.find((a) => a.key === area)?.label ?? "Tüm alanlar"} selected={Boolean(area)} onPress={() => setAreaOpen(true)} onDismiss={area ? () => setArea(null) : undefined} />
      </ChipGroup>

      {/* Özet sahnesi: ortalama skor halkası + dönem sayaçları. */}
      <SysStage eyebrow={`${formatDay(data.range.from, false)} – ${formatDay(data.range.to, false)}`} title="Dönemin performans özeti">
        <View style={styles.stageRow}>
          <View style={styles.dialWrap}>
            <ScoreDial value={totals.averageScore} size={104} caption="ortalama" onDark />
            <View style={styles.stageDelta}>
              <DeltaPill value={totals.change.averageScore} />
            </View>
          </View>
          <View style={styles.stageGrid}>
            <View style={styles.cell}><StageStat label="Form" value={totals.evaluationCount} icon="document-text" /></View>
            <View style={styles.cell}><StageStat label="Kişi" value={totals.staffCount} icon="people" /></View>
            <View style={styles.cell}><StageStat label="Aksayan" value={formatPct(totals.failRate)} icon="warning" tone="warn" /></View>
            <View style={styles.cell}><StageStat label={hasPayout ? "Hakediş" : "Net"} value={hasPayout ? formatTl(totals.payout) : formatTl(totals.net, true)} icon="cash" tone={totals.net >= 0 ? "win" : "danger"} /></View>
          </View>
        </View>
        <Text style={styles.stageNote} {...textScale.dense}>
          Önceki dönemle kıyaslanıyor ({formatDay(data.previousRange.from, false)} – {formatDay(data.previousRange.to, false)}) · Bonus {formatTl(totals.bonus)} · Kesinti {formatTl(totals.deduction)}
        </Text>
      </SysStage>

      {/* Kapsama: kaç maç alanı dolduruldu, eksikler nerede. */}
      {coverage.matchCount > 0 ? (
        <SysGroup
          title="Form kapsaması"
          icon="checkmark-done"
          tone={pending.length ? "gold" : "mint"}
          action={pending.length ? { label: "Formlar", onPress: onGoForms } : undefined}
          flush
        >
          <View style={styles.coverage}>
            <View style={styles.coverageHead}>
              <Text style={styles.coverageValue} {...textScale.badge}>
                {formatPct(coverage.coveragePct)}
              </Text>
              <Text style={styles.muted} {...textScale.dense}>
                {coverage.done}/{coverage.slots} maç alanı
                {coverage.weekCount > 0 ? ` · sosyal medya ${coverage.weeksDone}/${coverage.weekCount} hafta` : ""}
              </Text>
            </View>
            <GradientBar value={coverageRatio} height={8} />
          </View>
          {pending.length ? (
            pending.slice(0, 4).map((m) => (
              <SysRow
                key={m.id}
                icon="clipboard"
                tone={m.doneCount ? "warn" : "danger"}
                title={m.label}
                meta={`${formatDay(m.day, false)} · ${m.areaCount - m.doneCount} alan eksik`}
                value={`${m.doneCount}/${m.areaCount}`}
                valueTone={m.doneCount ? "warn" : "danger"}
                onPress={() => router.push({ pathname: "/yonetim/degerlendirmeler/mac/[id]", params: { id: String(m.id), ids: pending.map((p) => p.id).join(",") } })}
              />
            ))
          ) : (
            <SysRow icon="checkmark-circle" tone="win" title="Tüm maçlar değerlendirildi" meta="Dönemde eksik form yok" />
          )}
          {pending.length > 4 ? <SysRow icon="ellipsis-horizontal" tone="neutral" title={`+${pending.length - 4} maç daha`} onPress={onGoForms} /> : null}
        </SysGroup>
      ) : null}

      {!totals.evaluationCount ? (
        <EmptyState icon="clipboard-outline" title="Bu dönemde değerlendirme yok" body="Formlar sekmesinden maç ya da hafta seçip form doldur." action={{ label: "Formlara git", onPress: onGoForms }} variant="inline" />
      ) : (
        <>
          <SysGroup title="Haftalık seyir" icon="trending-up" tone="cyan" hint="Ortalama skor, hafta hafta">
            <TrendColumns points={data.trend.map((p) => ({ label: p.label, value: p.averageScore, count: p.count }))} />
          </SysGroup>

          <SysGroup title="Alanlar" icon="layers" tone="violet" flush>
            {data.byArea.map((r, i) => (
              <View key={r.area} style={[styles.areaRow, i ? styles.rowRule : null]}>
                <IconTile icon={areaIcon(r.area)} tone={areaTone(r.area)} size={34} glow={false} />
                <View style={styles.flex}>
                  <View style={styles.areaTop}>
                    <Text style={styles.areaLabel} numberOfLines={1} {...textScale.dense}>
                      {r.label}
                    </Text>
                    <DeltaPill value={r.change} />
                    <Text style={styles.areaPct} {...textScale.badge}>
                      {formatPct(r.averageScore)}
                    </Text>
                  </View>
                  <GradientBar value={Math.max(0, Math.min(1, (r.averageScore ?? 0) / 100))} height={5} gradient={levelGradient(r.averageScore)} />
                  <Text style={styles.muted} numberOfLines={1} {...textScale.dense}>
                    {r.evaluationCount} form · aksayan {formatPct(r.failRate)} · net {formatTl(r.net, true)}
                  </Text>
                </View>
              </View>
            ))}
          </SysGroup>

          <SegmentedControl<View_>
            items={[
              { key: "staff", label: `Sıralama (${data.byStaff.length})` },
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
              {staffRows.map((r, i) => (
                <Reveal key={r.staffId} index={i}>
                  <RankCard
                    rank={r.rank}
                    name={r.name}
                    areas={r.areas}
                    score={r.averageScore}
                    change={r.change}
                    meta={`${r.evaluationCount} form · ${r.failCount || 0} aksayan · ${hasPayout ? formatTl(r.payout) : formatTl(r.net, true)}`}
                    onPress={() => router.push(staffCardHref(r.staffId, range, scope))}
                  />
                </Reveal>
              ))}
            </>
          ) : null}

          {view === "items" ? (
            <>
              <SectionHeader title="En çok aksayan işler" meta={`${weak.length} madde`} />
              {!weak.length ? (
                <EmptyState icon="checkmark-done-outline" title="Aksayan madde yok" variant="inline" compact />
              ) : (
                weak.map((r, i) => (
                  <Reveal key={r.questionId} index={i}>
                    <View style={styles.weak}>
                      <View style={styles.weakHead}>
                        <View style={[styles.weakRank, { backgroundColor: toneBg(scoreLevel(r.successPct).tone) }]}>
                          <Text style={[styles.weakRankText, { color: toneFg(scoreLevel(r.successPct).tone) }]} {...textScale.badge}>
                            {formatPct(r.successPct)}
                          </Text>
                        </View>
                        <View style={styles.flex}>
                          <Text style={styles.weakText} {...textScale.long}>
                            {r.text}
                          </Text>
                          <Text style={styles.muted} {...textScale.dense}>
                            {r.areaLabel}
                            {r.category ? ` · ${r.category}` : ""} ·{" "}
                            {r.type === "yes_no" ? `${r.answered} formda ${formatPct(r.yesRate)} yapıldı` : `ort. ${r.averageScore}/10`}
                          </Text>
                        </View>
                      </View>
                      <GradientBar value={Math.max(0, Math.min(1, (r.successPct ?? 0) / 100))} height={5} gradient={levelGradient(r.successPct)} />
                      {r.topFailers.length ? (
                        <ChipGroup scrollable contentPadding={0}>
                          {r.topFailers.map((f) => (
                            <Chip key={f.staffId} size="sm" icon="person-outline" label={`${f.name} ×${f.count}`} onPress={() => router.push(staffCardHref(f.staffId, range, scope))} />
                          ))}
                        </ChipGroup>
                      ) : null}
                      {r.comments[0] ? (
                        <View style={styles.quote}>
                          <Ionicons name="chatbubble-ellipses-outline" size={13} color={colors.textTertiary} />
                          <Text style={styles.quoteText} {...textScale.long}>
                            “{r.comments[0].text}”{r.comments[0].staffName ? ` — ${r.comments[0].staffName}` : ""}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  </Reveal>
                ))
              )}
              <SysGroup title="Kategoriler · başarı oranı" icon="pie-chart" tone="mint">
                {data.byCategory.map((r) => (
                  <MeterRow key={r.category} label={r.category} hint={`${r.answered} cevap · ${r.failCount} aksama`} value={formatPct(r.successPct)} ratio={(r.successPct ?? 0) / 100} gradient={levelGradient(r.successPct)} />
                ))}
              </SysGroup>
            </>
          ) : null}

          {view === "recent" ? (
            <>
              {data.recent.length ? <Button label="Kayıtları CSV paylaş" icon="share-outline" size="sm" variant="secondary" onPress={exportRecent} /> : null}
              <SysGroup flush>
                {(showAll ? data.recent : data.recent.slice(0, 12)).map((r, i) => (
                  <SysRow
                    key={r.id}
                    first={i === 0}
                    leading={<ScorePlate value={r.scorePct == null ? "—" : String(Math.round(r.scorePct))} tone={scoreLevel(r.scorePct).tone} size="sm" />}
                    title={r.label}
                    meta={[`${r.areaLabel} · ${r.staffName || `#${r.staffId}`}`, formatDay(r.periodDate, false), r.failCount ? `${r.failCount} aksayan` : null, formatTl(r.net, true)].filter(Boolean).join(" · ")}
                    onPress={
                      r.matchId
                        ? () => router.push({ pathname: "/yonetim/degerlendirmeler/mac/[id]", params: { id: String(r.matchId) } })
                        : () => router.push(staffCardHref(r.staffId, range, scope))
                    }
                  />
                ))}
              </SysGroup>
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
        rows.map((r, i) => (
          <Reveal key={r.staffId} index={i}>
            <RankCard
              rank={r.rank}
              name={r.name}
              areas={r.areas}
              score={r.averageScore}
              change={r.change}
              meta={`${r.evaluationCount} form`}
              onPress={() => router.push(staffCardHref(r.staffId, range, scope))}
            />
          </Reveal>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  flex: { flex: 1, minWidth: 0, gap: 4 },
  muted: { ...type.caption, color: colors.textTertiary },
  stageRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  dialWrap: { alignItems: "center", gap: space.xs, padding: space.xs, borderRadius: radius.pill, backgroundColor: colors.inkPill },
  stageDelta: { position: "absolute", bottom: -4 },
  stageGrid: { flex: 1, flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  cell: { width: "47%", flexGrow: 1, flexDirection: "row" },
  stageNote: { ...type.caption, color: colors.onDarkMuted },
  coverage: { gap: space.sm, paddingHorizontal: space.lg, paddingBottom: space.md },
  coverageHead: { flexDirection: "row", alignItems: "baseline", gap: space.sm },
  coverageValue: { ...type.scoreMd, color: colors.textPrimary },
  areaRow: { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md },
  rowRule: { borderTopWidth: hairline, borderTopColor: colors.separator },
  areaTop: { flexDirection: "row", alignItems: "center", gap: space.xs },
  areaLabel: { ...type.h4, color: colors.textPrimary, flexShrink: 1 },
  areaPct: { ...type.scoreXs, color: colors.textPrimary, marginLeft: "auto" },
  weak: { gap: space.sm, padding: space.md, borderRadius: radius.xl, backgroundColor: colors.surface1, borderWidth: hairline, borderColor: colors.border },
  weakHead: { flexDirection: "row", gap: space.md, alignItems: "flex-start" },
  weakRank: { minWidth: 52, paddingVertical: space.xs, paddingHorizontal: space.xs, borderRadius: radius.md, alignItems: "center" },
  weakRankText: { ...type.numSmStrong },
  weakText: { ...type.label, color: colors.textPrimary },
  quote: { flexDirection: "row", gap: space.xs, alignItems: "flex-start", padding: space.sm, borderRadius: radius.md, backgroundColor: colors.surface2 },
  quoteText: { ...type.caption, color: colors.textSecondary, flex: 1, fontStyle: "italic" },
});
