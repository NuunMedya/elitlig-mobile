/**
 * Karşılaştırma sekmesi — İller (Türkiye geneli) ve Ligler / Sezonlar.
 *
 * Web: evaluations/CitiesTab.js + CompetitionsTab.js. Endeks sıralaması
 * kart listesi olarak verilir; bir satıra dokununca o il / lig / sezon
 * başlıktaki süzgece yazılır ve Genel Bakış'a dönülür (web ile aynı geçiş).
 * İki lig/sezonun yan yana kıyas tablosu telefonda okunmadığı için sıralı
 * listedeki değerlerle verilir.
 */

import { useQuery } from "@tanstack/react-query";
import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { RecordCard } from "@/components/admin";
import { EmptyState, ErrorState, SegmentedControl, SkeletonListRow } from "@/components/ui";
import {
  formatDelta,
  formatPct,
  formatTl,
  getCityComparison,
  getCompetitionComparison,
  type CompareRow,
  type FilterScope,
} from "@/lib/api/admin/evaluations";
import { colors, space, textScale, type } from "@/theme";

type Mode = "city" | "league" | "season";

export function CompareTab({
  range,
  scope,
  nationwide,
  onOpenCity,
  onOpenLeague,
  onOpenSeason,
}: {
  range: { from: string; to: string };
  scope: FilterScope;
  nationwide: boolean;
  onOpenCity: (id: string) => void;
  onOpenLeague: (id: string) => void;
  onOpenSeason: (id: string) => void;
}) {
  const [mode, setMode] = useState<Mode>(nationwide ? "city" : "league");
  // Bir lig seçiliyse o ligin sezonları kıyaslanır (web CompetitionsTab).
  const groupBy = mode === "season" || (mode === "league" && scope.leagueId) ? "season" : "league";

  const query = useQuery({
    queryKey: ["admin", "evaluations", "compare", mode, groupBy, range.from, range.to, scope.cityId ?? "", scope.leagueId ?? "", scope.seasonId ?? ""],
    queryFn: async (): Promise<CompareRow[]> =>
      mode === "city"
        ? (await getCityComparison({ ...range, ...scope })).items ?? []
        : (await getCompetitionComparison({ ...range, ...scope, groupBy })).items ?? [],
  });

  const items: { key: Mode; label: string }[] = [
    ...(nationwide ? [{ key: "city" as const, label: "İller" }] : []),
    { key: "league", label: "Ligler" },
    { key: "season", label: "Sezonlar" },
  ];

  return (
    <View style={styles.wrap}>
      <SegmentedControl<Mode> items={items} value={mode} onChange={setMode} size="sm" />
      <Text style={styles.muted} {...textScale.long}>
        Endeks; ortalama skor, kapsama ve aksama oranından hesaplanır. Bir satıra dokununca tüm sekmeler ona göre süzülür.
      </Text>
      {query.isLoading ? (
        <SkeletonListRow count={5} />
      ) : query.error ? (
        <ErrorState error={query.error} onRetry={query.refetch} variant="inline" />
      ) : !query.data?.length ? (
        <EmptyState icon="podium-outline" title="Karşılaştırılacak veri yok" body="Bu dönemde değerlendirme bulunamadı." variant="inline" />
      ) : (
        query.data.map((r) => {
          const id = String(r.cityId ?? r.id ?? "");
          return (
            <RecordCard
              key={`${mode}-${id}-${r.name}`}
              title={`${r.rank}. ${r.name}`}
              subtitle={[r.leagueName, r.city].filter(Boolean).join(" · ") || null}
              meta={`${r.evaluationCount} form · ${r.matchCount} maç · kapsama ${formatPct(r.coveragePct)} · aksama ${formatPct(r.failRate)}`}
              icon={mode === "city" ? "location-outline" : mode === "league" && groupBy === "league" ? "trophy-outline" : "calendar-outline"}
              value={r.index == null ? formatPct(r.averageScore) : String(r.index).replace(".", ",")}
              badges={[
                { label: `Skor ${formatPct(r.averageScore)}`, tone: "info" },
                r.change != null && r.change !== 0 ? { label: formatDelta(r.change), tone: r.change > 0 ? "win" : "danger" } : null,
                { label: formatTl(r.net, true), tone: r.net >= 0 ? "win" : "danger" },
              ]}
              onPress={() => {
                if (!id) return;
                if (mode === "city") onOpenCity(id);
                else if (groupBy === "season") onOpenSeason(id);
                else onOpenLeague(id);
              }}
            />
          );
        })
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  muted: { ...type.caption, color: colors.textTertiary },
});
