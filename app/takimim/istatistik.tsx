/**
 * DETAYLI İSTATİSTİKLER — takımın tüm maç geçmişi, lig/sezon süzgeciyle.
 * `/takimim/istatistik?sezon=<id>&lig=<id>`
 *
 * Web: pages/panel/PanelStatistics.js (scope="team"). Tek uç:
 * GET /api/panel/me/statistics?scope=team&season_id&league_id
 * (services/panelDetailedStats.js → teamStatistics). Süzgeç seçenekleri
 * yalnız GERÇEKTEN maç oynanmış lig-sezon kombinasyonlarıdır (`filters.combos`);
 * istemci kombinasyon uydurmaz.
 *
 * Sıra: kapsam çipleri → özet sayılar + form → iç saha / deplasman → maç başı
 * ortalama ve en büyük skorlar → en katkılı oyuncular → lig-sezon kırılımı →
 * maç kaydı. Puan durumu bloğu yalnız kapsam tek lig-sezona düştüğünde gelir.
 */

import { useQuery } from "@tanstack/react-query";
import { Redirect, useLocalSearchParams, useRouter, type Href } from "expo-router";
import React, { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { PanelCard, PanelEmpty, PanelRow, PanelSection, StatStrip, type StatItem } from "@/components/club/Panel";
import {
  Avatar,
  Chip,
  ChipGroup,
  ErrorState,
  FormChips,
  MetricGrid,
  MetricTile,
  ScreenHeader,
  SkeletonCard,
  StatBar,
  useHeaderScroll,
  useRefresh,
} from "@/components/ui";
import { getTeamStatistics, type StatCombo } from "@/lib/api/club/overview";
import { formatDateShort, formatDecimal, mediaUrl } from "@/lib/format";
import { useAuth } from "@/providers/AuthProvider";
import { colors, layout, radius, space, textScale, type } from "@/theme";

const comboKey = (combo: { season_id: number | null; league_id: number | null }) => `${combo.season_id ?? 0}:${combo.league_id ?? 0}`;
const comboLabel = (combo: StatCombo) => [combo.season_name, combo.league_name].filter(Boolean).join(" · ") || "Diğer maçlar";
const signed = (value: number) => (value > 0 ? `+${value}` : String(value));
const RESULT_LABEL = { W: "G", D: "B", L: "M" } as const;

export default function TeamStatisticsScreen() {
  const auth = useAuth();
  const router = useRouter();
  const { scrollY, scrollProps } = useHeaderScroll();
  const params = useLocalSearchParams<{ sezon?: string; lig?: string }>();
  const [filter, setFilter] = useState<{ seasonId: number | null; leagueId: number | null }>({
    seasonId: Number(params.sezon) || null,
    leagueId: Number(params.lig) || null,
  });

  const query = useQuery({
    queryKey: ["club", "statistics", filter.seasonId ?? 0, filter.leagueId ?? 0],
    queryFn: () => getTeamStatistics(filter),
    enabled: Boolean(auth.user),
    staleTime: 60_000,
    retry: false,
  });
  const refresh = useRefresh(query.refetch, { refreshing: query.isRefetching });
  const data = query.data;
  const combos = useMemo(() => data?.filters?.combos ?? [], [data]);

  const pick = (combo: StatCombo | null) => {
    const next = combo ? { seasonId: combo.season_id, leagueId: combo.league_id } : { seasonId: null, leagueId: null };
    setFilter(next);
    router.setParams({ sezon: next.seasonId ? String(next.seasonId) : undefined, lig: next.leagueId ? String(next.leagueId) : undefined });
  };

  if (!auth.user) return <Redirect href="/giris" />;

  const totals = data?.totals;
  const perMatch = data?.per_match;
  const activeKey = filter.seasonId || filter.leagueId ? comboKey({ season_id: filter.seasonId, league_id: filter.leagueId }) : null;

  const summary: StatItem[] = totals
    ? [
        { label: "Atılan", value: String(totals.goals_for), tone: "win" },
        { label: "Yenen", value: String(totals.goals_against), tone: totals.goals_against > totals.goals_for ? "danger" : "neutral" },
        { label: "Gol yemeden", value: String(totals.clean_sheets) },
        { label: "Gol atamadan", value: String(totals.failed_to_score), tone: totals.failed_to_score ? "danger" : "neutral" },
      ]
    : [];

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader title="Detaylı istatistikler" subtitle="Takımının tüm maç geçmişi" back scrollY={scrollY} />
      <ScrollView {...scrollProps} contentContainerStyle={styles.content} refreshControl={refresh.control}>
        {combos.length > 1 ? (
          <ChipGroup style={styles.chips}>
            <Chip size="sm" label="Tüm maçlar" selected={!activeKey} onPress={() => pick(null)} />
            {combos.map((combo) => (
              <Chip
                key={comboKey(combo)}
                size="sm"
                label={comboLabel(combo)}
                count={combo.matches}
                selected={activeKey === comboKey(combo)}
                onPress={() => pick(combo)}
              />
            ))}
          </ChipGroup>
        ) : null}

        {query.isLoading ? (
          <View style={styles.pad}>
            <SkeletonCard lines={3} />
            <SkeletonCard lines={4} />
          </View>
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={query.refetch} />
        ) : !data?.linked ? (
          <PanelSection title="İstatistik">
            <PanelEmpty icon="shield-outline" text="Yönettiğin bir takım görünmüyor." />
          </PanelSection>
        ) : !totals || totals.played === 0 ? (
          <PanelSection title="İstatistik">
            <PanelEmpty icon="football-outline" text="Bu kapsamda oynanmış maç yok." />
          </PanelSection>
        ) : (
          <>
            <View style={styles.pad}>
              <MetricGrid columns={3}>
                <MetricTile label="Maç" value={String(totals.played)} icon="football" />
                <MetricTile label="G-B-M" value={`${totals.wins}-${totals.draws}-${totals.losses}`} tone="brand" />
                <MetricTile
                  label="Averaj"
                  value={signed(totals.goal_diff)}
                  tone={totals.goal_diff > 0 ? "win" : totals.goal_diff < 0 ? "danger" : "neutral"}
                />
              </MetricGrid>
            </View>

            {data.form?.length ? (
              <PanelSection title="Form" meta={`son ${data.form.length} maç`}>
                <PanelCard>
                  <FormChips form={data.form} limit={10} size="sm" />
                </PanelCard>
              </PanelSection>
            ) : null}

            {data.standings ? (
              <PanelSection title="Puan durumu" meta={data.selection?.league_name ?? undefined}>
                <StatStrip
                  items={[
                    { label: "Sıra", value: data.standings.position ? `${data.standings.position}/${data.standings.team_count ?? "?"}` : "—", tone: "brand" },
                    { label: "Puan", value: String(data.standings.points) },
                    { label: "Oynanan", value: String(data.standings.played) },
                  ]}
                />
              </PanelSection>
            ) : null}

            <PanelSection title="Goller">
              <StatStrip items={summary} />
            </PanelSection>

            <PanelSection title="İç saha · Deplasman">
              <PanelCard style={styles.bars}>
                <StatBar label="Maç" home={totals.home.played} away={totals.away.played} />
                <StatBar label="Galibiyet" home={totals.home.wins} away={totals.away.wins} />
                <StatBar label="Atılan gol" home={totals.home.goals_for} away={totals.away.goals_for} />
                <StatBar label="Yenen gol" home={totals.home.goals_against} away={totals.away.goals_against} />
              </PanelCard>
            </PanelSection>

            {perMatch ? (
              <PanelSection title="Maç başına">
                <StatStrip
                  items={[
                    { label: "Atılan", value: formatDecimal(perMatch.scored, 2) },
                    { label: "Yenen", value: formatDecimal(perMatch.conceded, 2) },
                    { label: "Puan", value: formatDecimal(perMatch.points, 2) },
                    { label: "Galibiyet", value: `%${perMatch.win_ratio}`, tone: "win" },
                  ]}
                />
              </PanelSection>
            ) : null}

            {totals.biggest_win || totals.biggest_loss ? (
              <PanelSection title="En büyük skorlar">
                <PanelCard padded={false}>
                  {totals.biggest_win ? (
                    <PanelRow
                      icon="trending-up"
                      tone="win"
                      title={`${totals.biggest_win.score} · ${totals.biggest_win.opponent ?? "Rakip"}`}
                      hint={`En farklı galibiyet${totals.biggest_win.date ? ` · ${formatDateShort(totals.biggest_win.date)}` : ""}`}
                      last={!totals.biggest_loss}
                    />
                  ) : null}
                  {totals.biggest_loss ? (
                    <PanelRow
                      icon="trending-down"
                      tone="danger"
                      title={`${totals.biggest_loss.score} · ${totals.biggest_loss.opponent ?? "Rakip"}`}
                      hint={`En farklı mağlubiyet${totals.biggest_loss.date ? ` · ${formatDateShort(totals.biggest_loss.date)}` : ""}`}
                      last
                    />
                  ) : null}
                </PanelCard>
              </PanelSection>
            ) : null}

            {data.top_players?.length ? (
              <PanelSection title="En katkılı oyuncular" meta="gol + asist">
                <PanelCard padded={false}>
                  {data.top_players.map((player, index, list) => (
                    <PanelRow
                      key={player.id}
                      leading={<Avatar name={player.name} image={mediaUrl(player.image)} size={layout.crestMd} />}
                      title={player.name}
                      hint={[player.position, `${player.matches} maç`, player.rating != null ? `ort. ${formatDecimal(player.rating, 1)}` : null]
                        .filter(Boolean)
                        .join(" · ")}
                      value={`${player.goals}G ${player.assists}A`}
                      onPress={() => router.push(`/oyuncu/${player.id}`)}
                      last={index === list.length - 1}
                    />
                  ))}
                </PanelCard>
              </PanelSection>
            ) : null}

            {data.breakdown && data.breakdown.length > 1 ? (
              <PanelSection title="Lig ve sezon kırılımı">
                <PanelCard padded={false}>
                  {data.breakdown.map((row, index, list) => (
                    <PanelRow
                      key={`${row.season_id}:${row.league_id}`}
                      icon="trophy-outline"
                      tone="info"
                      title={[row.season_name, row.league_name].filter(Boolean).join(" · ") || "Diğer maçlar"}
                      hint={`${row.played} maç · ${row.wins}-${row.draws}-${row.losses} · ${row.goals_for}:${row.goals_against}`}
                      value={`${row.points} P`}
                      last={index === list.length - 1}
                    />
                  ))}
                </PanelCard>
              </PanelSection>
            ) : null}

            {data.match_log?.length ? (
              <PanelSection title="Maç kaydı" meta={`${data.match_log.length} maç`}>
                <PanelCard padded={false}>
                  {data.match_log.map((match, index, list) => (
                    <PanelRow
                      key={match.match_id}
                      leading={<ResultDot result={match.result} />}
                      title={`${match.is_home ? "" : "@ "}${match.opponent ?? "Rakip"}`}
                      hint={[formatDateShort(match.date), match.league_name].filter(Boolean).join(" · ")}
                      value={match.score}
                      onPress={() => router.push(`/mac/${match.match_id}` as Href)}
                      last={index === list.length - 1}
                    />
                  ))}
                </PanelCard>
              </PanelSection>
            ) : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function ResultDot({ result }: { result: "W" | "D" | "L" }) {
  const tone = result === "W" ? colors.win : result === "L" ? colors.danger : colors.draw;
  return (
    <View style={[styles.dot, { backgroundColor: tone }]}>
      <Text style={styles.dotText} {...textScale.badge}>
        {RESULT_LABEL[result]}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingBottom: space.giant, paddingTop: space.md },
  pad: { paddingHorizontal: layout.screenPadding, gap: space.md },
  chips: { marginBottom: space.md },
  bars: { gap: space.md },
  dot: { width: 26, height: 26, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  dotText: { ...type.labelXs, color: colors.textOnStatus },
});
