/**
 * PERSONEL KARNESİ — kişinin dönem özeti ve tüm form geçmişi.
 *
 * Web: evaluations/StaffCardTab.js sağ paneli. Üstte dört gösterge (alan
 * ortalamasıyla kıyas, önceki dönem, aksayan madde, hakediş), altında iki
 * görünüm: Özet (seyir, alanlar, güçlü / zayıf maddeler, kategoriler) ve
 * Geçmiş (notlar + formlar; forma dokununca cevaplar açılır). Karne CSV
 * olarak paylaşılabilir. Dönem ve süzgeçler liste ekranından gelir.
 */

import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { AdminScreen, InfoLine, Panel, RecordCard } from "@/components/admin";
import { shareCsv } from "@/components/admin/evaluations/shareCsv";
import { LevelBadge, ScoreBar } from "@/components/admin/evaluations/widgets";
import { Badge, EmptyState, ErrorState, MetricGrid, MetricTile, SegmentedControl, SkeletonCard } from "@/components/ui";
import {
  csvNumber,
  formatDay,
  formatDelta,
  formatPct,
  formatTl,
  getStaffCard,
  toCsv,
  type StaffCard,
} from "@/lib/api/admin/evaluations";
import { colors, space, textScale, type } from "@/theme";

const PERMS = ["evaluations.view"] as const;

export default function StaffCardScreen() {
  const p = useLocalSearchParams<{ id: string; from?: string; to?: string; cityId?: string; leagueId?: string; seasonId?: string }>();
  const staffId = Number(p.id);
  const router = useRouter();
  const [view, setView] = useState<"summary" | "history">("summary");
  const [expanded, setExpanded] = useState<number | null>(null);
  const range = { from: p.from || "2020-01-01", to: p.to || new Date().toISOString().slice(0, 10) };
  const scope = { cityId: p.cityId || "", leagueId: p.leagueId || "", seasonId: p.seasonId || "" };

  const query = useQuery({
    queryKey: ["admin", "evaluations", "staffCard", staffId, range.from, range.to, scope.cityId, scope.leagueId, scope.seasonId],
    queryFn: () => getStaffCard(staffId, { ...range, ...scope }),
  });
  const data = query.data;
  const s = data?.summary;
  const hasPayout = Boolean(s && s.baseFee > 0);

  const exportHistory = (report: StaffCard) =>
    void shareCsv(
      `karne-${report.staff.fullName.replace(/\s+/g, "-")}-${report.range.from}-${report.range.to}.csv`,
      toCsv(
        ["Tarih", "Maç / Hafta", "Alan", "Soru", "Cevap", "Açıklama", "Tutar", "Form skoru (%)", "Form neti"],
        report.history.flatMap((row) =>
          row.answers.map((a) => [
            row.periodDate,
            row.label,
            row.areaLabel,
            a.text,
            a.na ? "Uygulanamaz" : a.type === "yes_no" ? (a.value ? "Yapıldı" : "Yapılmadı") : `${a.value}/10`,
            a.comment || "",
            csvNumber(a.amount ?? null),
            csvNumber(row.scorePct),
            csvNumber(row.net),
          ])
        )
      )
    );

  return (
    <AdminScreen
      title={data?.staff.fullName ?? "Personel karnesi"}
      subtitle={data ? `${formatDay(data.range.from, false)} – ${formatDay(data.range.to, false)}` : undefined}
      permission={PERMS}
      onRefresh={query.refetch}
      refreshing={query.isRefetching}
      actions={data?.history.length ? [{ icon: "share-outline", onPress: () => exportHistory(data), accessibilityLabel: "Karneyi CSV paylaş" }] : undefined}
    >
      {query.isLoading ? (
        <SkeletonCard />
      ) : query.error || !data || !s ? (
        <ErrorState error={query.error} onRetry={query.refetch} variant="inline" />
      ) : (
        <>
          <View style={styles.head}>
            <Text style={styles.meta} {...textScale.long}>
              {data.byArea.map((a) => a.label).join(", ") || "Değerlendirme yok"}
              {s.rank ? ` · ${s.peerCount} kişi içinde ${s.rank}. sırada` : ""}
            </Text>
            <LevelBadge value={s.averageScore} />
          </View>
          {!data.history.length ? (
            <EmptyState icon="person-outline" title="Bu dönemde değerlendirme yok" variant="inline" />
          ) : (
            <>
              <MetricGrid columns={2}>
                <MetricTile label="Ortalama skor" value={formatPct(s.averageScore)} hint={`Alan ort. ${formatPct(s.peerAverage)}${s.gap != null ? ` · ${formatDelta(s.gap)}` : ""}`} tone="brand" icon="speedometer-outline" />
                <MetricTile
                  label="Önceki dönem"
                  value={s.previous.averageScore == null ? "—" : formatPct(s.previous.averageScore)}
                  hint={s.change.averageScore != null ? formatDelta(s.change.averageScore) : undefined}
                  icon="time-outline"
                />
                <MetricTile label="Aksayan madde" value={formatPct(s.failRate)} hint={`${s.failCount} madde · ${s.evaluationCount} form`} tone="warn" icon="warning-outline" />
                <MetricTile
                  label={hasPayout ? "Hakediş" : "Net"}
                  value={hasPayout ? formatTl(s.payout) : formatTl(s.net, true)}
                  hint={`Bonus ${formatTl(s.bonus)} · Kesinti ${formatTl(s.deduction)}`}
                  tone={s.net >= 0 ? "win" : "danger"}
                  icon="cash-outline"
                />
              </MetricGrid>

              <SegmentedControl<"summary" | "history">
                items={[
                  { key: "summary", label: "Özet" },
                  { key: "history", label: `Geçmiş (${data.history.length})` },
                ]}
                value={view}
                onChange={setView}
                size="sm"
              />

              {view === "summary" ? (
                <>
                  <QuestionList title="Güçlü yanlar" items={data.strengths} empty="Henüz yeterli veri yok." />
                  <QuestionList title="Gelişmesi gerekenler" items={data.weaknesses} empty="Aksayan madde yok." />
                  <Panel title="Alanlar">
                    {data.byArea.map((a) => (
                      <View key={a.area} style={styles.row}>
                        <View style={styles.flex}>
                          <Text style={styles.label} {...textScale.dense}>
                            {a.label}
                          </Text>
                          <Text style={styles.meta} {...textScale.dense}>
                            {a.evaluationCount} form · ort. {formatPct(a.peerAverage)}
                            {a.gap != null ? ` · ${formatDelta(a.gap)}` : ""}
                          </Text>
                        </View>
                        <ScoreBar value={a.averageScore} compact />
                      </View>
                    ))}
                  </Panel>
                  {data.byCategory.length ? (
                    <Panel title="Kategoriler">
                      {data.byCategory.map((c) => (
                        <View key={c.category} style={styles.row}>
                          <View style={styles.flex}>
                            <Text style={styles.label} {...textScale.dense}>
                              {c.category}
                            </Text>
                            <Text style={styles.meta} {...textScale.dense}>
                              {c.answered} cevap · {c.failCount} aksama
                            </Text>
                          </View>
                          <ScoreBar value={c.successPct} compact />
                        </View>
                      ))}
                    </Panel>
                  ) : null}
                </>
              ) : (
                <>
                  {data.notes.length ? (
                    <Panel title="Notlar">
                      {data.notes.map((n) => (
                        <View key={n.id} style={styles.note}>
                          <Text style={styles.meta} {...textScale.dense}>
                            {formatDay(n.date, false)} · {n.label}
                          </Text>
                          <Text style={styles.label} {...textScale.long}>
                            {n.note}
                          </Text>
                        </View>
                      ))}
                    </Panel>
                  ) : null}
                  {data.history.map((row) => (
                    <RecordCard
                      key={row.id}
                      title={row.label}
                      subtitle={`${row.areaLabel} · ${formatDay(row.periodDate, false)}`}
                      icon="document-text-outline"
                      value={formatPct(row.scorePct)}
                      badges={[
                        row.failCount ? { label: `${row.failCount} aksayan`, tone: "danger" } : null,
                        { label: hasPayout ? formatTl(row.payout) : formatTl(row.net, true), tone: row.net >= 0 ? "win" : "danger" },
                      ]}
                      onPress={() => setExpanded(expanded === row.id ? null : row.id)}
                      onLongPress={row.matchId ? () => router.push({ pathname: "/yonetim/degerlendirmeler/mac/[id]", params: { id: String(row.matchId) } }) : undefined}
                      trailing={<Badge label={expanded === row.id ? "Kapat" : "Cevaplar"} size="xs" />}
                    >
                      {expanded === row.id ? (
                        <View style={styles.answers}>
                          {row.answers.map((a) => (
                            <InfoLine
                              key={a.questionId}
                              label={a.text}
                              value={`${a.na ? "Uygulanamaz" : a.type === "yes_no" ? (a.value ? "Yapıldı" : "Yapılmadı") : `${a.value}/10`}${a.amount ? ` · ${formatTl(a.amount, true)}` : ""}${a.comment ? ` · “${a.comment}”` : ""}`}
                              tone={a.points != null && a.points < 5 ? "danger" : undefined}
                            />
                          ))}
                          {row.note ? <InfoLine label="Not" value={row.note} /> : null}
                          {row.evaluatorName ? <InfoLine label="Değerlendiren" value={row.evaluatorName} /> : null}
                        </View>
                      ) : null}
                    </RecordCard>
                  ))}
                </>
              )}
            </>
          )}
        </>
      )}
    </AdminScreen>
  );
}

function QuestionList({ title, items, empty }: { title: string; items: StaffCard["strengths"]; empty: string }) {
  return (
    <Panel title={title}>
      {!items.length ? (
        <Text style={styles.meta} {...textScale.long}>
          {empty}
        </Text>
      ) : (
        items.map((q) => (
          <View key={q.questionId} style={styles.row}>
            <View style={styles.flex}>
              <Text style={styles.label} {...textScale.long}>
                {q.text}
              </Text>
              <Text style={styles.meta} {...textScale.dense}>
                {q.areaLabel} · {q.answered} cevap{q.failCount ? ` · ${q.failCount} aksama` : ""} · ort. {formatPct(q.peerSuccessPct)}
              </Text>
            </View>
            <Text style={styles.pct} {...textScale.dense}>
              {formatPct(q.successPct)}
            </Text>
          </View>
        ))
      )}
    </Panel>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: space.sm },
  flex: { flex: 1 },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.xs },
  label: { ...type.bodySm, color: colors.textPrimary },
  meta: { ...type.caption, color: colors.textTertiary, flexShrink: 1 },
  pct: { ...type.numSmStrong, color: colors.textPrimary },
  note: { gap: 2, paddingVertical: space.xs },
  answers: { marginTop: space.sm },
});
