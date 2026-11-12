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

import Ionicons from "@expo/vector-icons/Ionicons";

import { AdminScreen, InfoLine } from "@/components/admin";
import { areaIcon, areaTone, levelGradient, ScoreDial } from "@/components/admin/evaluations/EvalParts";
import { CountTiles, MeterRow, ScorePlate, StageStat, SysGroup, SysStage, toneFg } from "@/components/admin/system/SysKit";
import { shareCsv } from "@/components/admin/evaluations/shareCsv";
import { Avatar, Badge, EmptyState, ErrorState, GradientBar, IconTile, RankBadge, Reveal, SegmentedControl, SkeletonCard, Touchable, type IconTileTone } from "@/components/ui";
import { isoDay } from "@/lib/admin/format";
import {
  csvNumber,
  formatDay,
  formatDelta,
  formatPct,
  formatTl,
  getStaffCard,
  scoreLevel,
  toCsv,
  type StaffCard,
} from "@/lib/api/admin/evaluations";
import { colors, hairline, radius, space, textScale, type } from "@/theme";

const PERMS = ["evaluations.view"] as const;

export default function StaffCardScreen() {
  const p = useLocalSearchParams<{ id: string; from?: string; to?: string; cityId?: string; leagueId?: string; seasonId?: string }>();
  const staffId = Number(p.id);
  const router = useRouter();
  const [view, setView] = useState<"summary" | "history">("summary");
  const [expanded, setExpanded] = useState<number | null>(null);
  const range = { from: p.from || "2020-01-01", to: p.to || isoDay() };
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
          {/* Karne sahnesi: kişi, sıra, skor halkası ve alan ortalamasıyla kıyas. */}
          <SysStage>
            <View style={styles.hero}>
              <Avatar name={data.staff.fullName} size={52} ring="brand" />
              <View style={styles.flex}>
                <Text style={styles.eyebrow} {...textScale.badge}>
                  {s.rank ? `${s.peerCount} KİŞİ İÇİNDE ${s.rank}. SIRA` : "PERSONEL KARNESİ"}
                </Text>
                <Text style={styles.heroName} numberOfLines={1} {...textScale.dense}>
                  {data.staff.fullName}
                </Text>
                <Text style={styles.heroMeta} numberOfLines={1} {...textScale.dense}>
                  {data.byArea.map((a) => a.label).join(", ") || "Değerlendirme yok"}
                </Text>
              </View>
              {s.rank ? <RankBadge rank={s.rank} size={34} /> : null}
            </View>
            {data.history.length ? (
              <View style={styles.stageRow}>
                <ScoreDial value={s.averageScore} size={96} onDark />
                <View style={styles.stageGrid}>
                  <View style={styles.cell}>
                    <StageStat label="Alan ort." value={formatPct(s.peerAverage)} icon="people" />
                  </View>
                  <View style={styles.cell}>
                    <StageStat label="Fark" value={s.gap == null ? "—" : formatDelta(s.gap)} icon="swap-vertical" tone={(s.gap ?? 0) >= 0 ? "win" : "danger"} />
                  </View>
                  <View style={styles.cell}>
                    <StageStat label="Önceki" value={s.previous.averageScore == null ? "—" : formatPct(s.previous.averageScore)} icon="time" />
                  </View>
                  <View style={styles.cell}>
                    <StageStat label="Form" value={s.evaluationCount} icon="document-text" />
                  </View>
                </View>
              </View>
            ) : null}
          </SysStage>

          {!data.history.length ? (
            <EmptyState icon="person-outline" title="Bu dönemde değerlendirme yok" variant="inline" />
          ) : (
            <>
              <CountTiles
                items={[
                  { key: "fail", label: "Aksayan", value: formatPct(s.failRate), icon: "warning-outline", tone: "warn" },
                  { key: "bonus", label: "Bonus", value: formatTl(s.bonus), icon: "add-circle-outline", tone: "win" },
                  { key: "pay", label: hasPayout ? "Hakediş" : "Net", value: hasPayout ? formatTl(s.payout) : formatTl(s.net, true), icon: "cash-outline", tone: s.net >= 0 ? "win" : "danger" },
                ]}
              />
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
                  <QuestionList title="Güçlü yanlar" icon="thumbs-up" tone="mint" items={data.strengths} empty="Henüz yeterli veri yok." />
                  <QuestionList title="Gelişmesi gerekenler" icon="construct" tone="red" items={data.weaknesses} empty="Aksayan madde yok." />
                  <SysGroup title="Alanlar · alan ortalamasıyla" icon="layers" tone="violet">
                    {data.byArea.map((a) => (
                      <View key={a.area} style={styles.areaRow}>
                        <IconTile icon={areaIcon(a.area)} tone={areaTone(a.area)} size={30} glow={false} />
                        <View style={styles.flex}>
                          <MeterRow label={a.label} hint={`${a.evaluationCount} form`} value={formatPct(a.averageScore)} ratio={(a.averageScore ?? 0) / 100} gradient={levelGradient(a.averageScore)} />
                          <View style={styles.peer}>
                            <View style={[styles.peerMark, { left: `${Math.max(0, Math.min(100, a.peerAverage ?? 0))}%` }]} />
                          </View>
                          <Text style={styles.meta} {...textScale.dense}>
                            Alan ortalaması {formatPct(a.peerAverage)}
                            {a.gap != null ? ` · ${formatDelta(a.gap)}` : ""}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </SysGroup>
                  {data.byCategory.length ? (
                    <SysGroup title="Kategoriler" icon="pie-chart" tone="cyan">
                      {data.byCategory.map((c) => (
                        <MeterRow key={c.category} label={c.category} hint={`${c.answered} cevap · ${c.failCount} aksama`} value={formatPct(c.successPct)} ratio={(c.successPct ?? 0) / 100} gradient={levelGradient(c.successPct)} />
                      ))}
                    </SysGroup>
                  ) : null}
                </>
              ) : (
                <>
                  {data.notes.length ? (
                    <SysGroup title="Notlar" icon="chatbubbles" tone="gold">
                      {data.notes.map((n) => (
                        <View key={n.id} style={styles.note}>
                          <Text style={styles.noteMeta} {...textScale.badge}>
                            {`${formatDay(n.date, false)} · ${n.label}`.toLocaleUpperCase("tr-TR")}
                          </Text>
                          <Text style={styles.label} {...textScale.long}>
                            “{n.note}”
                          </Text>
                        </View>
                      ))}
                    </SysGroup>
                  ) : null}
                  {data.history.map((row, i) => {
                    const open = expanded === row.id;
                    return (
                      <Reveal key={row.id} index={i}>
                        <Touchable
                          feedback="card"
                          style={[styles.hist, open ? styles.histOpen : null]}
                          onPress={() => setExpanded(open ? null : row.id)}
                          onLongPress={row.matchId ? () => router.push({ pathname: "/yonetim/degerlendirmeler/mac/[id]", params: { id: String(row.matchId) } }) : undefined}
                          accessibilityRole="button"
                          accessibilityState={{ expanded: open }}
                          accessibilityLabel={`${row.label}, ${formatPct(row.scorePct)}`}
                        >
                          <View style={styles.histHead}>
                            <ScorePlate value={row.scorePct == null ? "—" : String(Math.round(row.scorePct))} tone={scoreLevel(row.scorePct).tone} size="sm" />
                            <View style={styles.flex}>
                              <Text style={styles.histTitle} numberOfLines={1} {...textScale.dense}>
                                {row.label}
                              </Text>
                              <Text style={styles.meta} numberOfLines={1} {...textScale.dense}>
                                {row.areaLabel} · {formatDay(row.periodDate, false)}
                              </Text>
                              <View style={styles.badges}>
                                {row.failCount ? <Badge label={`${row.failCount} aksayan`} tone="danger" size="xs" /> : null}
                                <Badge label={hasPayout ? formatTl(row.payout) : formatTl(row.net, true)} tone={row.net >= 0 ? "win" : "danger"} size="xs" />
                              </View>
                            </View>
                            <Ionicons name={open ? "chevron-up" : "chevron-down"} size={16} color={colors.textTertiary} />
                          </View>
                          {open ? (
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
                              {!row.answers.length && !row.note ? (
                                <Text style={styles.meta} {...textScale.dense}>
                                  Bu formun ayrıntısı yok.
                                </Text>
                              ) : null}
                            </View>
                          ) : null}
                        </Touchable>
                      </Reveal>
                    );
                  })}
                </>
              )}
            </>
          )}
        </>
      )}
    </AdminScreen>
  );
}

function QuestionList({ title, icon, tone, items, empty }: { title: string; icon: React.ComponentProps<typeof Ionicons>["name"]; tone: IconTileTone; items: StaffCard["strengths"]; empty: string }) {
  return (
    <SysGroup title={title} icon={icon} tone={tone}>
      {!items.length ? (
        <Text style={styles.meta} {...textScale.long}>
          {empty}
        </Text>
      ) : (
        items.map((q) => (
          <View key={q.questionId} style={styles.q}>
            <View style={styles.qHead}>
              <Text style={[styles.label, styles.flex]} {...textScale.long}>
                {q.text}
              </Text>
              <Text style={[styles.pct, { color: toneFg(scoreLevel(q.successPct).tone) }]} {...textScale.badge}>
                {formatPct(q.successPct)}
              </Text>
            </View>
            <GradientBar value={Math.max(0, Math.min(1, (q.successPct ?? 0) / 100))} height={5} gradient={levelGradient(q.successPct)} />
            <Text style={styles.meta} {...textScale.dense}>
              {q.areaLabel} · {q.answered} cevap{q.failCount ? ` · ${q.failCount} aksama` : ""} · herkes {formatPct(q.peerSuccessPct)}
            </Text>
          </View>
        ))
      )}
    </SysGroup>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0, gap: 2 },
  hero: { flexDirection: "row", alignItems: "center", gap: space.md },
  eyebrow: { ...type.overline, color: colors.adminAccent },
  heroName: { ...type.h2, color: colors.onDark },
  heroMeta: { ...type.caption, color: colors.onDarkMuted },
  stageRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  stageGrid: { flex: 1, flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  cell: { width: "47%", flexGrow: 1, flexDirection: "row" },
  areaRow: { flexDirection: "row", alignItems: "flex-start", gap: space.md },
  peer: { height: 8, marginTop: -7 },
  peerMark: { position: "absolute", top: 0, width: 2, height: 8, marginLeft: -1, borderRadius: 1, backgroundColor: colors.textPrimary },
  label: { ...type.bodySm, color: colors.textPrimary },
  meta: { ...type.caption, color: colors.textTertiary, flexShrink: 1 },
  pct: { ...type.scoreXs },
  q: { gap: space.xs },
  qHead: { flexDirection: "row", alignItems: "flex-start", gap: space.sm },
  note: { gap: 2, paddingLeft: space.sm, borderLeftWidth: 2, borderLeftColor: colors.adminAccent },
  noteMeta: { ...type.micro, color: colors.textTertiary },
  hist: { gap: space.sm, padding: space.md, borderRadius: radius.xl, backgroundColor: colors.surface1, borderWidth: hairline, borderColor: colors.border },
  histOpen: { borderColor: colors.brand },
  histHead: { flexDirection: "row", alignItems: "center", gap: space.md },
  histTitle: { ...type.h4, color: colors.textPrimary },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: space.xs, marginTop: 2 },
  answers: { paddingTop: space.sm, borderTopWidth: hairline, borderTopColor: colors.separator },
});
