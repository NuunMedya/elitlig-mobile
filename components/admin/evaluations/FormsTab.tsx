/**
 * Formlar sekmesi — değerlendirme yapılan yer.
 *
 * Web: evaluations/MatchFormsTab.js (sol liste) ve WeeklyTab.js (haftalar).
 * Telefonda iki bölmeli düzen yerine liste → ayrıntı: maça dokununca maç
 * formu ekranı (alan sekmeleriyle), haftaya dokununca hafta formu açılır.
 * Maç ekranına görünen listenin sırası verilir; "Kaydet ve sonraki" bir
 * sonraki eksik maça oradan geçer.
 */

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Badge, Chip, ChipGroup, EmptyState, ErrorState, GradientBar, Input, ProgressRing, Reveal, SegmentedControl, SkeletonListRow, Touchable } from "@/components/ui";
import { CountTiles, ScorePlate } from "@/components/admin/system/SysKit";
import {
  formatDay,
  formatPct,
  formatTl,
  listEvalMatches,
  listWeeks,
  presetRange,
  scoreLevel,
  type FilterScope,
} from "@/lib/api/admin/evaluations";
import { colors, hairline, radius, space, textScale, type } from "@/theme";

import { AreaDots, levelGradient } from "./EvalParts";


const PRESETS = [
  { key: "week", label: "Bu hafta" },
  { key: "14", label: "Son 14 gün" },
  { key: "30", label: "Son 30 gün" },
  { key: "month", label: "Bu ay" },
  { key: "90", label: "Son 90 gün" },
];

const STATUS = [
  { key: "", label: "Tümü" },
  { key: "pending", label: "Eksik" },
  { key: "done", label: "Tamamlanan" },
];

type Mode = "matches" | "weekly";

export function FormsTab({
  scope,
  cityName,
  showCity,
  nationwide,
}: {
  scope: FilterScope;
  cityName?: string | null;
  showCity: boolean;
  nationwide: boolean;
}) {
  const [mode, setMode] = useState<Mode>("matches");
  return (
    <View style={styles.wrap}>
      <SegmentedControl<Mode>
        items={[
          { key: "matches", label: "Maçlar" },
          { key: "weekly", label: "Sosyal medya (haftalık)" },
        ]}
        value={mode}
        onChange={setMode}
        size="sm"
      />
      {mode === "matches" ? (
        <MatchList scope={scope} showCity={showCity} />
      ) : (
        <WeekList scope={scope} cityName={cityName} nationwide={nationwide} />
      )}
    </View>
  );
}

function MatchList({ scope, showCity }: { scope: FilterScope; showCity: boolean }) {
  const router = useRouter();
  const [preset, setPreset] = useState("14");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const range = useMemo(() => presetRange(preset), [preset]);

  const query = useQuery({
    queryKey: ["admin", "evaluations", "matches", range.from, range.to, status, scope.cityId ?? "", scope.leagueId ?? "", scope.seasonId ?? ""],
    queryFn: () => listEvalMatches({ ...range, status, ...scope }),
  });

  const visible = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("tr-TR");
    const items = query.data?.items ?? [];
    if (!needle) return items;
    return items.filter((m) => [m.label, m.field, m.league].filter(Boolean).join(" ").toLocaleLowerCase("tr-TR").includes(needle));
  }, [query.data, search]);
  const areas = query.data?.areas ?? [];
  const summary = query.data?.summary;
  const order = visible.map((m) => m.id).join(",");

  return (
    <View style={styles.wrap}>
      <ChipGroup scrollable contentPadding={0}>
        {PRESETS.map((p) => (
          <Chip key={p.key} size="sm" label={p.label} selected={preset === p.key} onPress={() => setPreset(p.key)} />
        ))}
      </ChipGroup>
      <ChipGroup scrollable contentPadding={0}>
        {STATUS.map((s) => (
          <Chip key={s.key} size="sm" label={s.label} selected={status === s.key} onPress={() => setStatus(s.key)} />
        ))}
      </ChipGroup>
      <Input variant="search" leadingIcon="search" value={search} onChangeText={setSearch} placeholder="Takım, saha, lig ara" autoCorrect={false} />
      {summary && summary.matchCount > 0 ? (
        <CountTiles
          items={[
            { key: "cov", label: "Kapsama", value: formatPct(summary.coveragePct), icon: "pie-chart-outline", tone: "brand" },
            { key: "done", label: "Tamam maç", value: summary.completeCount, icon: "checkmark-done", tone: "win" },
            { key: "none", label: "Hiç yok", value: summary.untouchedCount, icon: "alert-circle-outline", tone: "danger" },
          ]}
        />
      ) : null}
      {query.isLoading ? (
        <SkeletonListRow count={5} />
      ) : query.error ? (
        <ErrorState error={query.error} onRetry={query.refetch} variant="inline" />
      ) : !visible.length ? (
        <EmptyState icon="calendar-outline" title="Maç yok" body="Bu dönemde ya da aramayla eşleşen değerlendirilecek maç bulunamadı." variant="inline" />
      ) : (
        visible.map((m, i) => {
          const complete = m.doneCount === m.areaCount;
          const ratio = m.areaCount ? m.doneCount / m.areaCount : 0;
          return (
            <Reveal key={m.id} index={i}>
              <Touchable
                feedback="card"
                style={[styles.card, complete ? styles.cardDone : null]}
                onPress={() => router.push({ pathname: "/yonetim/degerlendirmeler/mac/[id]", params: { id: String(m.id), ids: order } })}
                accessibilityRole="button"
                accessibilityLabel={`${m.label}, ${m.doneCount}/${m.areaCount} alan değerlendirildi`}
              >
                <DayStamp day={m.day} time={m.time} />
                <View style={styles.flex}>
                  <Text style={styles.title} numberOfLines={2} {...textScale.dense}>
                    {m.label}
                  </Text>
                  <Text style={styles.muted} numberOfLines={1} {...textScale.dense}>
                    {[m.field, showCity ? m.city : null, scope.leagueId ? null : m.league, scope.seasonId ? null : m.season].filter(Boolean).join(" · ")}
                  </Text>
                  <AreaDots areas={areas} done={m.areas} />
                </View>
                <View style={styles.side}>
                  <ProgressRing value={ratio} size={46} thickness={5} tone={complete ? "win" : m.doneCount ? "warn" : "neutral"} label={`${m.doneCount}/${m.areaCount}`} />
                  {m.doneCount ? (
                    <Text style={styles.avg} {...textScale.badge}>
                      {formatPct(m.averageScore)}
                    </Text>
                  ) : null}
                </View>
              </Touchable>
            </Reveal>
          );
        })
      )}
    </View>
  );
}

const MONTHS = ["OCA", "ŞUB", "MAR", "NİS", "MAY", "HAZ", "TEM", "AĞU", "EYL", "EKİ", "KAS", "ARA"];

/** Takvim pulu: gün sayısı + ay (+ saat). */
function DayStamp({ day, time, accent }: { day: string | null; time?: string | null; accent?: boolean }) {
  const m = String(day ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return (
    <View style={[styles.stamp, accent ? styles.stampAccent : null]}>
      <Text style={styles.stampDay} {...textScale.badge}>
        {m ? Number(m[3]) : "–"}
      </Text>
      <Text style={styles.stampMonth} {...textScale.badge}>
        {m ? MONTHS[Number(m[2]) - 1] : ""}
      </Text>
      {time ? (
        <Text style={styles.stampTime} {...textScale.badge}>
          {time}
        </Text>
      ) : null}
    </View>
  );
}

function WeekList({ scope, cityName, nationwide }: { scope: FilterScope; cityName?: string | null; nationwide: boolean }) {
  const router = useRouter();
  const query = useQuery({
    queryKey: ["admin", "evaluations", "weeks", scope.cityId ?? ""],
    queryFn: () => listWeeks({ count: 16, cityId: scope.cityId }),
  });
  return (
    <View style={styles.wrap}>
      {scope.leagueId || scope.seasonId ? (
        <Text style={styles.muted} {...textScale.long}>
          Sosyal medya formları haftalıktır ve bir lige bağlı değildir; lig / sezon süzgeci burada uygulanmaz.
        </Text>
      ) : null}
      {query.isLoading ? (
        <SkeletonListRow count={5} />
      ) : query.error ? (
        <ErrorState error={query.error} onRetry={query.refetch} variant="inline" />
      ) : (
        (query.data ?? []).map((w, i) => {
          const done = w.evaluations.length > 0;
          return (
            <Reveal key={w.weekStart} index={i}>
              <Touchable
                feedback="card"
                style={[styles.card, w.current ? styles.cardCurrent : null]}
                accessibilityRole="button"
                accessibilityLabel={`${w.label}, ${done ? `${w.evaluations.length} kişi değerlendirildi` : "bekliyor"}`}
                onPress={() =>
                  router.push({
                    pathname: "/yonetim/degerlendirmeler/hafta/[week]",
                    params: { week: w.weekStart, cityId: scope.cityId ?? "", cityName: cityName ?? "", nationwide: nationwide ? "1" : "" },
                  })
                }
              >
                <DayStamp day={w.weekStart} accent={w.current} />
                <View style={styles.flex}>
                  <View style={styles.row}>
                    <Text style={styles.title} numberOfLines={1} {...textScale.dense}>
                      {w.label}
                    </Text>
                    {w.current ? <Badge label="Bu hafta" tone="accent" size="xs" /> : null}
                  </View>
                  <Text style={styles.muted} numberOfLines={1} {...textScale.dense}>
                    {done ? `${w.evaluations.map((e) => e.staffName).filter(Boolean).join(", ")} · ${formatTl(w.net, true)}` : "Sosyal medya formu bekliyor"}
                  </Text>
                  {done ? <GradientBar value={Math.max(0, Math.min(1, (w.averageScore ?? 0) / 100))} height={5} gradient={levelGradient(w.averageScore)} /> : null}
                </View>
                {done ? (
                  <ScorePlate value={formatPct(w.averageScore)} tone={scoreLevel(w.averageScore).tone} size="sm" />
                ) : (
                  <Badge label="Bekliyor" tone="warn" size="xs" />
                )}
              </Touchable>
            </Reveal>
          );
        })
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  flex: { flex: 1, minWidth: 0, gap: 4 },
  row: { flexDirection: "row", alignItems: "center", gap: space.xs },
  muted: { ...type.caption, color: colors.textTertiary },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    padding: space.md,
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  cardDone: { borderColor: colors.winDim },
  cardCurrent: { backgroundColor: colors.brandDim, borderColor: colors.brand },
  title: { ...type.h4, color: colors.textPrimary, flexShrink: 1 },
  side: { alignItems: "center", gap: 2 },
  avg: { ...type.numSmStrong, color: colors.textSecondary },
  stamp: { width: 50, paddingVertical: space.xs, borderRadius: radius.lg, alignItems: "center", backgroundColor: colors.surface2, borderWidth: hairline, borderColor: colors.border },
  stampAccent: { backgroundColor: colors.accentDim, borderColor: colors.accentText },
  stampDay: { ...type.scoreSm, color: colors.textPrimary },
  stampMonth: { ...type.micro, color: colors.brandAccent },
  stampTime: { ...type.nano, color: colors.textTertiary, marginTop: 2 },
});
