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

import { RecordCard } from "@/components/admin";
import { Chip, ChipGroup, EmptyState, ErrorState, Input, SegmentedControl, SkeletonListRow } from "@/components/ui";
import {
  formatDay,
  formatPct,
  formatTl,
  listEvalMatches,
  listWeeks,
  presetRange,
  type FilterScope,
} from "@/lib/api/admin/evaluations";
import { colors, space, textScale, type } from "@/theme";

import { ScoreBar } from "./widgets";

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
        <View style={styles.summary}>
          <Text style={styles.muted} {...textScale.dense}>
            {summary.done}/{summary.slots} alan · {summary.matchCount} maç · {summary.completeCount} maç tamam
          </Text>
          <ScoreBar value={summary.coveragePct} />
        </View>
      ) : null}
      {query.isLoading ? (
        <SkeletonListRow count={5} />
      ) : query.error ? (
        <ErrorState error={query.error} onRetry={query.refetch} variant="inline" />
      ) : !visible.length ? (
        <EmptyState icon="calendar-outline" title="Maç yok" body="Bu dönemde ya da aramayla eşleşen değerlendirilecek maç bulunamadı." variant="inline" />
      ) : (
        visible.map((m) => {
          const complete = m.doneCount === m.areaCount;
          return (
            <RecordCard
              key={m.id}
              title={m.label}
              subtitle={[formatDay(m.day, false), m.time, showCity ? m.city : null, scope.leagueId ? null : m.league, scope.seasonId ? null : m.season].filter(Boolean).join(" · ")}
              icon={complete ? "checkmark-done-outline" : "clipboard-outline"}
              iconTone={complete ? "win" : m.doneCount ? "warn" : "neutral"}
              value={m.doneCount ? formatPct(m.averageScore) : null}
              badges={[
                { label: complete ? "Tamam" : `${m.doneCount}/${m.areaCount}`, tone: complete ? "win" : m.doneCount ? "warn" : "neutral" },
                ...areas.map((a) => {
                  const done = m.areas[a.key];
                  return done ? { label: a.label, tone: done.failCount ? ("danger" as const) : ("info" as const) } : null;
                }),
              ]}
              onPress={() => router.push({ pathname: "/yonetim/degerlendirmeler/mac/[id]", params: { id: String(m.id), ids: order } })}
            />
          );
        })
      )}
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
        (query.data ?? []).map((w) => (
          <RecordCard
            key={w.weekStart}
            title={w.label}
            subtitle={w.evaluations.length ? `${w.evaluations.length} kişi değerlendirildi` : "Değerlendirme yok"}
            icon="share-social-outline"
            iconTone={w.evaluations.length ? "win" : "neutral"}
            value={w.evaluations.length ? formatPct(w.averageScore) : "Bekliyor"}
            badges={[w.current ? { label: "Bu hafta", tone: "accent" } : null, w.evaluations.length ? { label: formatTl(w.net, true), tone: w.net >= 0 ? "win" : "danger" } : null]}
            onPress={() =>
              router.push({
                pathname: "/yonetim/degerlendirmeler/hafta/[week]",
                params: { week: w.weekStart, cityId: scope.cityId ?? "", cityName: cityName ?? "", nationwide: nationwide ? "1" : "" },
              })
            }
          />
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  summary: { gap: space.xs },
  muted: { ...type.caption, color: colors.textTertiary },
});
