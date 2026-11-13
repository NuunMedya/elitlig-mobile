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

import { MeterRow } from "@/components/admin/system/SysKit";
import { Badge, EmptyState, ErrorState, IconTile, RankBadge, Reveal, SegmentedControl, SkeletonListRow, Touchable } from "@/components/ui";
import {
  formatPct,
  formatTl,
  getCityComparison,
  getCompetitionComparison,
  type CompareRow,
  type FilterScope,
} from "@/lib/api/admin/evaluations";
import { colors, hairline, radius, space, textScale, type } from "@/theme";

import { DeltaPill, levelGradient } from "./EvalParts";

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
        query.data.map((r, i) => {
          const id = String(r.cityId ?? r.id ?? "");
          const icon = mode === "city" ? "location" : mode === "league" && groupBy === "league" ? "trophy" : "calendar";
          return (
            <Reveal key={`${mode}-${id}-${r.name}`} index={i}>
              <Touchable
                feedback="card"
                style={[styles.card, r.rank === 1 ? styles.cardTop : null]}
                accessibilityRole="button"
                accessibilityLabel={`${r.rank}. ${r.name}, endeks ${r.index ?? "—"}`}
                onPress={() => {
                  if (!id) return;
                  if (mode === "city") onOpenCity(id);
                  else if (groupBy === "season") onOpenSeason(id);
                  else onOpenLeague(id);
                }}
              >
                <View style={styles.head}>
                  <RankBadge rank={r.rank} size={28} />
                  <IconTile icon={icon} tone={mode === "city" ? "cyan" : groupBy === "league" ? "gold" : "violet"} size={34} glow={false} />
                  <View style={styles.flex}>
                    <Text style={styles.name} numberOfLines={1} {...textScale.dense}>
                      {r.name}
                    </Text>
                    <Text style={styles.muted} numberOfLines={1} {...textScale.dense}>
                      {[r.leagueName, r.city, `${r.matchCount} maç · ${r.evaluationCount} form · ${r.staffCount} kişi`].filter(Boolean).join(" · ")}
                    </Text>
                  </View>
                  <View style={styles.index}>
                    <Text style={styles.indexValue} {...textScale.badge}>
                      {r.index == null ? formatPct(r.averageScore) : String(r.index).replace(".", ",")}
                    </Text>
                    <Text style={styles.indexLabel} {...textScale.badge}>
                      {r.index == null ? "SKOR" : "ENDEKS"}
                    </Text>
                  </View>
                </View>
                <View style={styles.meters}>
                  <MeterRow label="Skor" value={formatPct(r.averageScore)} ratio={(r.averageScore ?? 0) / 100} gradient={levelGradient(r.averageScore)} leading={<DeltaPill value={r.change} />} />
                  <MeterRow label="Kapsama" value={formatPct(r.coveragePct)} ratio={(r.coveragePct ?? 0) / 100} />
                </View>
                <View style={styles.foot}>
                  <Badge label={`Aksama ${formatPct(r.failRate)}`} tone={(r.failRate ?? 0) > 15 ? "danger" : "neutral"} size="xs" />
                  <Badge label={formatTl(r.net, true)} tone={r.net >= 0 ? "win" : "danger"} size="xs" />
                  <Text style={styles.payout} {...textScale.badge}>
                    Hakediş {formatTl(r.payout)}
                  </Text>
                </View>
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
  flex: { flex: 1, minWidth: 0, gap: 2 },
  muted: { ...type.caption, color: colors.textTertiary },
  card: { gap: space.md, padding: space.md, borderRadius: radius.xl, backgroundColor: colors.surface1, borderWidth: hairline, borderColor: colors.border },
  cardTop: { borderColor: colors.brand, backgroundColor: colors.brandDim },
  head: { flexDirection: "row", alignItems: "center", gap: space.sm },
  name: { ...type.h4, color: colors.textPrimary },
  index: { alignItems: "flex-end" },
  indexValue: { ...type.scoreMd, color: colors.textPrimary },
  indexLabel: { ...type.nano, color: colors.textTertiary },
  meters: { gap: space.sm },
  foot: { flexDirection: "row", alignItems: "center", gap: space.xs, flexWrap: "wrap" },
  payout: { ...type.numSmStrong, color: colors.textSecondary, marginLeft: "auto" },
});
