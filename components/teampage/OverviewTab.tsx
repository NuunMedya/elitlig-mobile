/**
 * 1) GENEL — takımın bir ekranlık özeti.
 *
 * SIRA, KULLANICININ SORU SIRASIDIR:
 *   1. Sıradaki maç   — "ne zaman oynuyorlar?" (geri sayımlı)
 *   2. Form           — "nasıl gidiyorlar?" (son 5, tek bakışta)
 *   3. Puan durumu    — "ligde neredeler?" (üstte 2, altta 2 takım)
 *   4. Sezon özeti    — galibiyet oranı, G/B/M dengesi, gol sayıları, yorum
 *   5. Golcüler       — sezonun ilk üçü
 *   6. Kadro          — mevki dağılımı, kadroya kısayol
 *
 * Eski sürüm "Takım analizi" paragrafıyla açılıyordu: ekranın ilk yarısı
 * düz metindi ve asıl soru (sıradaki maç) kaydırmanın altında kalıyordu.
 * Paragraf artık sezon özeti kartının dipnotu; sayılar önce, yorum sonra.
 *
 * "H2H karşılaştır" düğmesi buradan KALKTI: aynı eylem kimlik şeridinde
 * ("Karşılaştır") zaten var; iki yerde iki ayrı düğme, iki ayrı iş sanılıyordu.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useMemo } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import {
  Card,
  EmptyState,
  PlayerRow,
  ProgressRing,
  SectionHeader,
  SkeletonCard,
  TeamRow,
  TeamRowHead,
} from "@/components/ui";
import { formatPercent } from "@/lib/format";
import type { ApiMatch, PlayerRankRow, StandingRow } from "@/lib/types";
import {
  colors,
  defaultZoneRules,
  elevate,
  layout,
  palette,
  positionColor,
  radius,
  space,
  textScale,
  type,
  zoneColor,
  zoneForRank,
} from "@/theme";
import { FormStrip } from "./FormStrip";
import {
  decimal,
  LINE_LABEL,
  LINE_ORDER,
  LINE_SHORT,
  num,
  type LogoFor,
  type PosLine,
  type TabShell,
} from "./model";
import { NextMatchCard } from "./NextMatchCard";
import { StackedBar } from "./StackedBar";

export interface OverviewTabProps extends TabShell {
  teamId: number;
  teamName: string;
  nextMatch: ApiMatch | null;
  /** Sıradaki maç gerçekten ileride mi (yoksa sonucu bekleyen geçmiş maç mı). */
  nextIsUpcoming: boolean;
  matchesLoading: boolean;
  recent: ApiMatch[];
  lineCounts: Record<PosLine, number>;
  squadTotal: number;
  squadLoading: boolean;
  neighbours: { row: StandingRow; rank: number }[];
  /** Puan durumundaki toplam takım sayısı — bölge rengi için. */
  tableSize: number;
  scopeReady: boolean;
  standingsLoading: boolean;
  standing: { row: StandingRow; position: number } | null;
  leagueLabel: string;
  topScorers: PlayerRankRow[];
  /** Otomatik Türkçe sezon yorumu; kapsam tutmuyorsa null. */
  analysis: string | null;
  logoFor: LogoFor;
  onOpenMatch: (matchId: number) => void;
  onOpenPlayer: (playerId: number) => void;
  onOpenTeam: (teamId: number) => void;
  onAddCalendar: (match: ApiMatch) => void;
  onPickScope: () => void;
  onOpenStandings: () => void;
  /** Sekme kısayolları — `changeTab` üzerinden, derin bağlantıyla aynı yol. */
  onOpenFixtures: () => void;
  onOpenResults: () => void;
  onOpenSquad: () => void;
}

export function OverviewTab({
  scrollProps,
  refreshControl,
  teamId,
  teamName,
  nextMatch,
  nextIsUpcoming,
  matchesLoading,
  recent,
  lineCounts,
  squadTotal,
  squadLoading,
  neighbours,
  tableSize,
  scopeReady,
  standingsLoading,
  standing,
  leagueLabel,
  topScorers,
  analysis,
  logoFor,
  onOpenMatch,
  onOpenPlayer,
  onOpenTeam,
  onAddCalendar,
  onPickScope,
  onOpenStandings,
  onOpenFixtures,
  onOpenResults,
  onOpenSquad,
}: OverviewTabProps) {
  const zoneRules = useMemo(() => defaultZoneRules(tableSize), [tableSize]);

  return (
    <ScrollView
      {...scrollProps}
      refreshControl={refreshControl}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* 1–2 — Maçlar. Hiç maçı olmayan takımda iki ayrı boş durum (sıradaki
          maç yok + form yok) üst üste ekranın yarısını yiyordu; tek cümle yeter. */}
      {!matchesLoading && !nextMatch && recent.length === 0 ? (
        <>
          <SectionHeader title="Maçlar" />
          <EmptyState
            icon="calendar-outline"
            title="Henüz maç yok"
            body="Takımın fikstürü yayımlandığında sıradaki maç ve form burada görünecek."
            variant="inline"
            compact
          />
        </>
      ) : (
        <>
          <SectionHeader
            title={nextMatch && !nextIsUpcoming ? "Sonucu beklenen maç" : "Sıradaki maç"}
            action={nextMatch ? { label: "Fikstür", onPress: onOpenFixtures } : undefined}
          />
          {matchesLoading ? (
            <SkeletonCard lines={4} style={styles.inset} />
          ) : nextMatch ? (
            <NextMatchCard
              match={nextMatch}
              teamId={teamId}
              teamName={teamName}
              logoFor={logoFor}
              onOpen={onOpenMatch}
              onAddCalendar={onAddCalendar}
              style={styles.inset}
            />
          ) : (
            <EmptyState
              icon="calendar-outline"
              title="Yaklaşan maç yok"
              body="Fikstüre maç eklendiğinde burada geri sayımıyla görünecek."
              variant="inline"
              compact
            />
          )}

          <SectionHeader
            title="Form"
            action={recent.length ? { label: "Sonuçlar", onPress: onOpenResults } : undefined}
          />
          {matchesLoading ? (
            <SkeletonCard lines={2} style={styles.inset} />
          ) : recent.length ? (
            <Card padding="md" style={styles.inset}>
              <FormStrip
                matches={recent}
                teamId={teamId}
                teamName={teamName}
                logoFor={logoFor}
                onOpen={onOpenMatch}
              />
            </Card>
          ) : (
            <EmptyState
              icon="football-outline"
              title="Oynanmış maç yok"
              body="Takımın ilk maçı oynandığında form burada görünecek."
              variant="inline"
              compact
            />
          )}
        </>
      )}

      {/* 3 — Puan durumu */}
      <SectionHeader
        title="Puan durumu"
        meta={standing ? undefined : leagueLabel || undefined}
        action={standing ? { label: "Tablo", onPress: onOpenStandings } : undefined}
      />
      {standingsLoading ? (
        <SkeletonCard lines={5} style={styles.inset} />
      ) : !scopeReady ? (
        <EmptyState
          icon="options-outline"
          title="Kapsam seçilmedi"
          body="Şehir, lig ve sezon seçince tablo dolar."
          action={{ label: "Kapsam seç", onPress: onPickScope }}
          variant="inline"
          compact
        />
      ) : !standing ? (
        <EmptyState
          icon="podium-outline"
          title="Bu kapsamda tablo yok"
          body={`Takım ${leagueLabel || "seçili lig"} tablosunda değil. Kapsamı takımın ligine çevirebilirsin.`}
          action={{ label: "Kapsam seç", onPress: onPickScope }}
          variant="inline"
          compact
        />
      ) : (
        <View style={styles.table}>
          {leagueLabel ? (
            <View style={styles.tableCaption}>
              <Ionicons name="trophy-outline" size={13} color={colors.textTertiary} />
              <Text style={styles.tableCaptionText} numberOfLines={1} {...textScale.dense}>
                {leagueLabel}
              </Text>
            </View>
          ) : null}
          <TeamRowHead density="table" columns="short" />
          {neighbours.map(({ row, rank }) => (
            <TeamRow
              key={row.team_id}
              density="table"
              columns="short"
              rank={rank}
              teamId={Number(row.team_id)}
              name={row.team_name}
              logo={row.logo}
              played={row.played}
              wins={row.wins}
              draws={row.draws}
              losses={row.losses}
              goalDiff={num(row.goal_diff)}
              points={row.display_points}
              zone={zoneColor(palette, zoneForRank(rank, zoneRules))}
              highlighted={Number(row.team_id) === teamId}
              onPress={onOpenTeam}
            />
          ))}
        </View>
      )}

      {/* 4 — Sezon özeti */}
      {standing && standing.row.played > 0 ? (
        <>
          <SectionHeader title="Sezon özeti" />
          <SeasonSummary row={standing.row} analysis={analysis} />
        </>
      ) : null}

      {/* 5 — Golcüler */}
      <SectionHeader
        title="Golcüler"
        action={topScorers.length ? { label: "Kadro", onPress: onOpenSquad } : undefined}
      />
      {topScorers.length ? (
        <View style={styles.group}>
          {topScorers.map((player, index) => (
            <PlayerRow
              key={player.id}
              rank={index + 1}
              playerId={Number(player.id)}
              name={player.name}
              image={player.image ?? null}
              /* Meta gol TEKRAR ETMEZ: sağdaki sayı zaten gol. */
              meta={[`${num(player.matches)} maç`, `${num(player.assists)} asist`]}
              metric={num(player.goals)}
              onPress={onOpenPlayer}
              style={index > 0 ? styles.divided : undefined}
            />
          ))}
        </View>
      ) : (
        <EmptyState
          icon="football-outline"
          title="Gol kaydı yok"
          body="Seçili sezonda bu takımın oyuncularına yazılmış gol bulunmuyor."
          variant="inline"
          compact
        />
      )}

      {/* 6 — Kadro */}
      <SectionHeader
        title="Kadro"
        action={squadTotal > 0 ? { label: "Tümü", onPress: onOpenSquad } : undefined}
      />
      {squadLoading ? (
        <SkeletonCard lines={2} style={styles.inset} />
      ) : squadTotal > 0 ? (
        <Card padding="lg" onPress={onOpenSquad} style={styles.inset} contentStyle={styles.squadCard}>
          <SquadComposition counts={lineCounts} total={squadTotal} />
        </Card>
      ) : (
        <EmptyState
          icon="shirt-outline"
          title="Kadro kaydı yok"
          body="Bu takım için oyuncu kaydı bulunmuyor."
          variant="inline"
          compact
        />
      )}
    </ScrollView>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Sezon özeti — halka + G/B/M çubuğu + gol üçlüsü + yorum
   ══════════════════════════════════════════════════════════════════════════ */

const SeasonSummary = React.memo(function SeasonSummary({
  row,
  analysis,
}: {
  row: StandingRow;
  analysis: string | null;
}) {
  const played = num(row.played);
  const wins = num(row.wins);
  const draws = num(row.draws);
  const losses = num(row.losses);
  const goalsFor = num(row.goals_for);
  const goalsAgainst = num(row.goals_against);
  const winRate = played ? wins / played : 0;

  return (
    <Card padding="lg" style={styles.inset} contentStyle={styles.seasonCard}>
      <View style={styles.seasonTop}>
        <ProgressRing
          value={winRate}
          size={76}
          thickness={6}
          tone="win"
          label={formatPercent(winRate, { ratio: true })}
          sublabel="galibiyet"
          animate
        />
        <View style={styles.seasonRight}>
          <View style={styles.wdl}>
            <WdlCell label="Galibiyet" value={wins} color={colors.win} />
            <WdlCell label="Beraberlik" value={draws} color={colors.draw} />
            <WdlCell label="Mağlubiyet" value={losses} color={colors.loss} />
          </View>
          <StackedBar
            segments={[
              { key: "w", value: wins, color: colors.win },
              { key: "d", value: draws, color: colors.draw },
              { key: "l", value: losses, color: colors.loss },
            ]}
          />
          <Text style={styles.seasonPlayed} {...textScale.dense}>
            {played} maç oynandı
          </Text>
        </View>
      </View>

      <View style={styles.goalRow}>
        <GoalCell label="Attığı" value={String(goalsFor)} />
        <GoalCell label="Yediği" value={String(goalsAgainst)} />
        <GoalCell label="Maç başı gol" value={decimal(played ? goalsFor / played : 0)} />
      </View>

      {analysis ? (
        <Text style={styles.analysis} {...textScale.long}>
          {analysis}
        </Text>
      ) : null}
    </Card>
  );
});

const WdlCell = React.memo(function WdlCell({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <View style={styles.wdlCell} accessible accessibilityLabel={`${value} ${label.toLocaleLowerCase("tr-TR")}`}>
      <View style={styles.wdlLabelRow}>
        <View style={[styles.dot, { backgroundColor: color }]} />
        <Text style={styles.wdlValue} {...textScale.dense}>
          {value}
        </Text>
      </View>
      <Text style={styles.wdlLabel} numberOfLines={1} {...textScale.badge}>
        {label.toLocaleUpperCase("tr-TR")}
      </Text>
    </View>
  );
});

const GoalCell = React.memo(function GoalCell({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.goalCell} accessible accessibilityLabel={`${label} ${value}`}>
      <Text style={styles.goalValue} {...textScale.dense}>
        {value}
      </Text>
      <Text style={styles.goalLabel} numberOfLines={1} {...textScale.badge}>
        {label.toLocaleUpperCase("tr-TR")}
      </Text>
    </View>
  );
});

/* ══════════════════════════════════════════════════════════════════════════
   Kadro dağılımı — mevki renkleriyle tek çubuk
   ══════════════════════════════════════════════════════════════════════════ */

export const SquadComposition = React.memo(function SquadComposition({
  counts,
  total,
  hideChevron = false,
}: {
  counts: Record<PosLine, number>;
  total: number;
  /** Kart basılabilir değilse (Kadro sekmesinin kendisi) chevron çizilmez. */
  hideChevron?: boolean;
}) {
  const lines = LINE_ORDER.filter((line) => counts[line] > 0);

  return (
    <>
      <View style={styles.squadHead}>
        <Text style={styles.squadTotal} {...textScale.dense}>
          {total}
        </Text>
        <Text style={styles.squadUnit} {...textScale.dense}>
          oyuncu
        </Text>
        {hideChevron ? null : (
          <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} style={styles.squadChevron} />
        )}
      </View>
      <StackedBar
        segments={lines.map((line) => ({
          key: line,
          value: counts[line],
          color: lineColor(line),
        }))}
        height={10}
      />
      <View style={styles.legend}>
        {lines.map((line) => (
          <View
            key={line}
            style={styles.legendItem}
            accessible
            accessibilityLabel={`${LINE_LABEL[line]} ${counts[line]}`}
          >
            <View style={[styles.dot, { backgroundColor: lineColor(line) }]} />
            <Text style={styles.legendLabel} {...textScale.badge}>
              {line === "OTHER" ? "Belirtilmemiş" : LINE_SHORT[line]}
            </Text>
            <Text style={styles.legendValue} {...textScale.dense}>
              {counts[line]}
            </Text>
          </View>
        ))}
      </View>
    </>
  );
});

/** Mevki rengi — bilinmeyen hat nötr gri (theme/positions.ts). */
export function lineColor(line: PosLine): string {
  return line === "OTHER" ? colors.slateSoft : positionColor(palette, line);
}

const styles = StyleSheet.create({
  content: {
    paddingTop: space.xs,
    paddingBottom: space.huge,
  },
  inset: {
    marginHorizontal: layout.screenPadding,
  },
  group: {
    marginHorizontal: layout.screenPadding,
    borderRadius: radius.xl,
    overflow: "hidden",
    backgroundColor: colors.surface1,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    ...elevate(1),
  },
  divided: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
  },

  /* — Mini tablo — */
  table: {
    marginHorizontal: layout.screenPadding,
    borderRadius: radius.xl,
    overflow: "hidden",
    backgroundColor: colors.surface1,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingBottom: space.xs,
    ...elevate(1),
  },
  tableCaption: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    paddingHorizontal: space.md,
    paddingTop: space.md,
  },
  tableCaptionText: {
    ...type.caption,
    color: colors.textTertiary,
    flexShrink: 1,
  },

  /* — Sezon özeti — */
  seasonCard: {
    gap: space.lg,
  },
  seasonTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.lg,
  },
  seasonRight: {
    flex: 1,
    gap: space.sm,
  },
  wdl: {
    flexDirection: "row",
  },
  wdlCell: {
    flex: 1,
    gap: 1,
  },
  wdlValue: {
    ...type.metricSm,
    color: colors.textPrimary,
  },
  wdlLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.s,
  },
  wdlLabel: {
    ...type.micro,
    color: colors.textTertiary,
    flexShrink: 1,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
  },
  seasonPlayed: {
    ...type.caption,
    color: colors.textTertiary,
  },
  goalRow: {
    flexDirection: "row",
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
  },
  goalCell: {
    flex: 1,
    alignItems: "center",
    gap: space.xxs,
  },
  goalValue: {
    ...type.scoreSm,
    color: colors.textPrimary,
  },
  goalLabel: {
    ...type.micro,
    color: colors.textTertiary,
  },
  analysis: {
    ...type.bodySm,
    color: colors.textSecondary,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
  },

  /* — Kadro — */
  squadCard: {
    gap: space.md,
  },
  squadHead: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: space.s,
  },
  squadTotal: {
    ...type.metric,
    color: colors.textPrimary,
  },
  squadUnit: {
    ...type.body,
    color: colors.textSecondary,
  },
  squadChevron: {
    marginLeft: "auto",
    alignSelf: "center",
  },
  legend: {
    flexDirection: "row",
    flexWrap: "wrap",
    columnGap: space.lg,
    rowGap: space.s,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
  },
  legendLabel: {
    ...type.micro,
    color: colors.textTertiary,
  },
  legendValue: {
    ...type.tableNumStrong,
    color: colors.textPrimary,
  },
});
