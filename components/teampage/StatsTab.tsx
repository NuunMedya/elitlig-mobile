/**
 * 5) İSTATİSTİK — denge, gol, iç saha/deplasman, rekorlar, disiplin.
 *
 * KAYNAK DÜRÜSTLÜĞÜ: bu sekmedeki sayıların üç ayrı kaynağı var ve her
 * bölüm hangisinden geldiğini başlığında söyler:
 *   - "Tüm maçlar"  → takımın bitmiş maç listesi (`/maclar?team_id`), bütün
 *                     ligler ve sezonlar. Eski sürüm bu sayıları "Sezon
 *                     dengesi" diye etiketliyordu; oysa 107 maçın hepsiydi.
 *   - "Disiplin"    → seçili sezonun oyuncu sıralaması.
 *   - "Kulüp kaydı" → takım kaydının kendi toplamları (sunucu tutar).
 *
 * DÜZELTME: galibiyet halkası (`ProgressRing`) 0–1 arası değer bekler; eski
 * sürüm yüzde (81) veriyordu ve halka her takımda TAM doluydu.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useCallback } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import {
  Card,
  EmptyState,
  ProgressRing,
  SectionHeader,
  SkeletonCard,
  StatBar,
  Touchable,
} from "@/components/ui";
import { formatDateShort, formatPercent } from "@/lib/format";
import { colors, elevate, layout, radius, space, textScale, type, upperTR } from "@/theme";
import {
  decimal,
  signed,
  TREND_SIZE,
  type CareerTotals,
  type Discipline,
  type MatchHighlight,
  type TabShell,
  type TeamRecords,
} from "./model";
import { StackedBar } from "./StackedBar";

export interface StatsTabProps extends TabShell {
  records: TeamRecords;
  /** Takım kaydının kendi toplamları — sezondan bağımsız, tüm zamanlar. */
  career: CareerTotals;
  discipline: Discipline;
  seasonLabel: string;
  loading: boolean;
  onOpenMatch: (matchId: number) => void;
}

const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);

export function StatsTab({
  scrollProps,
  refreshControl,
  records,
  career,
  discipline,
  seasonLabel,
  loading,
  onOpenMatch,
}: StatsTabProps) {
  const { total, home, away } = records;
  const winRate = total.played ? total.wins / total.played : 0;

  return (
    <ScrollView
      {...scrollProps}
      refreshControl={refreshControl}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {loading ? (
        <>
          <SectionHeader title="Genel denge" />
          <SkeletonCard lines={4} style={styles.inset} />
        </>
      ) : total.played === 0 ? (
        <EmptyState
          icon="stats-chart-outline"
          title="İstatistik yok"
          body="Takımın tamamlanmış maçı olmadığı için istatistik çıkarılamıyor."
          variant="inline"
        />
      ) : (
        <>
          {/* — Genel denge — */}
          <SectionHeader title="Genel denge" meta={`Tüm maçlar · ${total.played}`} />
          <Card padding="lg" style={styles.inset} contentStyle={styles.stack}>
            <View style={styles.ringRow}>
              <ProgressRing
                value={winRate}
                size={88}
                thickness={7}
                tone="win"
                label={formatPercent(winRate, { ratio: true })}
                sublabel="galibiyet"
                animate
              />
              <View style={styles.legend}>
                <LegendItem label="Galibiyet" value={String(total.wins)} color={colors.win} />
                <LegendItem label="Beraberlik" value={String(total.draws)} color={colors.draw} />
                <LegendItem label="Mağlubiyet" value={String(total.losses)} color={colors.loss} />
                <LegendItem label="Averaj" value={signed(total.goalsFor - total.goalsAgainst)} />
              </View>
            </View>
            <StackedBar
              segments={[
                { key: "w", value: total.wins, color: colors.win },
                { key: "d", value: total.draws, color: colors.draw },
                { key: "l", value: total.losses, color: colors.loss },
              ]}
            />
          </Card>

          {/* — Gol — */}
          <SectionHeader title="Gol" />
          <Card padding="lg" style={styles.inset} contentStyle={styles.stack}>
            <View style={styles.goalHead}>
              <BigNumber
                label="Attığı"
                value={total.goalsFor}
                hint={`maç başı ${decimal(total.played ? total.goalsFor / total.played : 0)}`}
                color={colors.accentText}
              />
              <View style={styles.goalDivider} />
              <BigNumber
                label="Yediği"
                value={total.goalsAgainst}
                hint={`maç başı ${decimal(total.played ? total.goalsAgainst / total.played : 0)}`}
              />
            </View>

            {records.trendFor.length >= 3 ? (
              <GoalTrend scored={records.trendFor} conceded={records.trendAgainst} />
            ) : null}

            <View style={styles.factRow}>
              <SmallFact icon="shield-checkmark-outline" label="Gol yemeden" value={records.cleanSheets} />
              <SmallFact icon="remove-circle-outline" label="Gol atamadan" value={records.blankGames} />
              <SmallFact icon="flame-outline" label="Galibiyet serisi" value={records.longestWinRun} />
            </View>
          </Card>

          {/* — İç saha / deplasman — */}
          <SectionHeader title="İç saha · Deplasman" />
          <Card padding="lg" style={styles.inset}>
            <View style={styles.sidesHead}>
              <SideHead label="İç saha" rate={pct(home.wins, home.played)} played={home.played} />
              <SideHead label="Deplasman" rate={pct(away.wins, away.played)} played={away.played} alignRight />
            </View>
            <StatBar label="Galibiyet" home={home.wins} away={away.wins} />
            <StatBar label="Beraberlik" home={home.draws} away={away.draws} />
            <StatBar label="Mağlubiyet" home={home.losses} away={away.losses} />
            <StatBar label="Atılan gol" home={home.goalsFor} away={away.goalsFor} />
            <StatBar label="Yenilen gol" home={home.goalsAgainst} away={away.goalsAgainst} />
          </Card>

          {/* — Rekorlar — */}
          {records.bestWin || records.mostGoals || records.worstLoss ? (
            <>
              <SectionHeader title="Rekorlar" />
              <View style={styles.group}>
                {[
                  { key: "best", label: "En farklı galibiyet", item: records.bestWin },
                  { key: "most", label: "En gollü maç", item: records.mostGoals },
                  { key: "worst", label: "En ağır yenilgi", item: records.worstLoss },
                ]
                  .filter((entry) => entry.item)
                  .map((entry, index) => (
                    <RecordRow
                      key={entry.key}
                      label={entry.label}
                      item={entry.item as MatchHighlight}
                      divided={index > 0}
                      onOpen={onOpenMatch}
                    />
                  ))}
              </View>
            </>
          ) : null}
        </>
      )}

      {/* — Disiplin (sezon) — */}
      {discipline.players > 0 ? (
        <>
          <SectionHeader title="Disiplin" meta={seasonLabel || undefined} />
          <View style={[styles.inset, styles.cardPair]}>
            <CardCount label="Sarı kart" value={discipline.yellow} tone={colors.yellowCard} />
            <CardCount label="Kırmızı kart" value={discipline.red} tone={colors.redCard} />
          </View>
        </>
      ) : null}

      {/* — Kulüp kaydı — puan tablosuna değil takım kaydına dayanır, bu yüzden
          kapsam tutmasa da her zaman gösterilir. */}
      {career.matches > 0 ? (
        <>
          <SectionHeader title="Kulüp kaydı" meta={`${career.matches} maç`} />
          <Card padding="lg" style={styles.inset}>
            <View style={styles.careerRow}>
              <CareerCell label="Maç" value={career.matches} />
              <CareerCell label="G" value={career.wins} color={colors.win} />
              <CareerCell label="B" value={career.draws} color={colors.draw} />
              <CareerCell label="M" value={career.losses} color={colors.loss} />
              <CareerCell label="Atılan" value={career.goalsFor} />
              <CareerCell label="Yenilen" value={career.goalsAgainst} />
            </View>
          </Card>
        </>
      ) : null}
    </ScrollView>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Parçalar
   ══════════════════════════════════════════════════════════════════════════ */

const LegendItem = React.memo(function LegendItem({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <View style={styles.legendItem}>
      {/* Rengi olmayan satır (averaj) hizayı korur, nokta çizmez. */}
      <View style={[styles.dot, { backgroundColor: color ?? "transparent" }]} />
      <Text style={styles.legendLabel} numberOfLines={1} {...textScale.dense}>
        {label}
      </Text>
      <Text style={styles.legendValue} {...textScale.dense}>
        {value}
      </Text>
    </View>
  );
});

const BigNumber = React.memo(function BigNumber({
  label,
  value,
  hint,
  color,
}: {
  label: string;
  value: number;
  hint: string;
  color?: string;
}) {
  return (
    <View style={styles.big} accessible accessibilityLabel={`${label} ${value} gol, ${hint}`}>
      <Text style={styles.bigLabel} {...textScale.badge}>
        {upperTR(label)}
      </Text>
      <Text style={[styles.bigValue, color ? { color } : null]} {...textScale.dense}>
        {value}
      </Text>
      <Text style={styles.bigHint} {...textScale.dense}>
        {hint}
      </Text>
    </View>
  );
});

/** Çubuğun bir yarısının en büyük yüksekliği. */
const TREND_HALF = 34;

/**
 * GOL TRENDİ — son maçlar, ıraksak çubuk.
 *
 * Üstte atılan (veri rengi), altta yenilen (nötr) gol; iki yarı AYNI ölçeği
 * paylaşır. İki ayrı çizgi (Sparkline) denendi: her çizgi kendi min/maks'ına
 * ölçeklendiği için 2 golün bir çizgide tepe, ötekinde dip görünüyordu.
 */
const GoalTrend = React.memo(function GoalTrend({
  scored,
  conceded,
}: {
  scored: number[];
  conceded: number[];
}) {
  const max = Math.max(1, ...scored, ...conceded);
  return (
    <View
      style={styles.trend}
      accessible
      accessibilityLabel={`Son ${scored.length} maçta atılan goller ${scored.join(", ")}; yenilen goller ${conceded.join(", ")}`}
    >
      <View style={styles.trendHead}>
        <Text style={styles.trendTitle} {...textScale.badge}>
          {upperTR(`Son ${Math.min(TREND_SIZE, scored.length)} maç`)}
        </Text>
        <View style={styles.trendLegend}>
          <View style={[styles.dot, { backgroundColor: colors.accent }]} />
          <Text style={styles.trendLegendText} {...textScale.badge}>
            Atılan
          </Text>
          <View style={[styles.dot, { backgroundColor: colors.slate }]} />
          <Text style={styles.trendLegendText} {...textScale.badge}>
            Yenilen
          </Text>
        </View>
      </View>
      <View style={styles.trendBars}>
        {scored.map((goals, index) => (
          <View key={index} style={styles.trendCol}>
            <View style={styles.trendTop}>
              <View
                style={[
                  styles.trendBar,
                  styles.trendBarUp,
                  { height: Math.max(goals > 0 ? 3 : 0, (goals / max) * TREND_HALF) },
                ]}
              />
            </View>
            <View style={styles.trendBase} />
            <View style={styles.trendBottom}>
              <View
                style={[
                  styles.trendBar,
                  styles.trendBarDown,
                  { height: Math.max(conceded[index] > 0 ? 3 : 0, (conceded[index] / max) * TREND_HALF) },
                ]}
              />
            </View>
          </View>
        ))}
      </View>
      <View style={styles.trendAxis}>
        <Text style={styles.trendAxisText} {...textScale.badge}>
          Eski
        </Text>
        <Text style={styles.trendAxisText} {...textScale.badge}>
          Yeni
        </Text>
      </View>
    </View>
  );
});

const SmallFact = React.memo(function SmallFact({
  icon,
  label,
  value,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  value: number;
}) {
  return (
    <View style={styles.smallFact} accessible accessibilityLabel={`${label}: ${value} maç`}>
      <Ionicons name={icon} size={16} color={colors.textTertiary} />
      <Text style={styles.smallValue} {...textScale.dense}>
        {value}
      </Text>
      <Text style={styles.smallLabel} numberOfLines={2} {...textScale.badge}>
        {label}
      </Text>
    </View>
  );
});

const SideHead = React.memo(function SideHead({
  label,
  rate,
  played,
  alignRight = false,
}: {
  label: string;
  rate: number;
  played: number;
  alignRight?: boolean;
}) {
  return (
    <View style={[styles.side, alignRight ? styles.sideRight : null]}>
      <Text style={styles.sideLabel} {...textScale.badge}>
        {upperTR(label)}
      </Text>
      <Text style={styles.sideRate} {...textScale.dense}>
        %{rate}
      </Text>
      <Text style={styles.sideHint} {...textScale.dense}>
        {played} maçta galibiyet
      </Text>
    </View>
  );
});

const RecordRow = React.memo(function RecordRow({
  label,
  item,
  divided,
  onOpen,
}: {
  label: string;
  item: MatchHighlight;
  divided: boolean;
  onOpen: (matchId: number) => void;
}) {
  const handlePress = useCallback(() => onOpen(Number(item.match.id)), [onOpen, item.match.id]);
  const result = item.ours > item.theirs ? "W" : item.ours < item.theirs ? "L" : "D";
  const bg = result === "W" ? colors.win : result === "L" ? colors.loss : colors.draw;

  return (
    <Touchable
      feedback="row"
      haptic="selection"
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${item.ours}-${item.theirs}, ${item.opponent}, ${formatDateShort(item.match.date)}`}
      style={[styles.record, divided ? styles.divided : null]}
    >
      <View style={styles.recordBody}>
        <Text style={styles.recordLabel} {...textScale.badge}>
          {upperTR(label)}
        </Text>
        <Text style={styles.recordOpponent} numberOfLines={1} {...textScale.dense}>
          {item.opponent}
        </Text>
        <Text style={styles.recordMeta} numberOfLines={1} {...textScale.dense}>
          {[item.home ? "İç saha" : "Deplasman", formatDateShort(item.match.date), item.match.league_name]
            .filter(Boolean)
            .join(" · ")}
        </Text>
      </View>
      <View style={[styles.recordScore, { backgroundColor: bg }]}>
        <Text style={styles.recordScoreText} {...textScale.badge}>
          {item.ours}–{item.theirs}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={14} color={colors.textTertiary} />
    </Touchable>
  );
});

const CardCount = React.memo(function CardCount({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <Card padding="lg" style={styles.cardHalf} contentStyle={styles.cardCount}>
      <View style={[styles.cardChip, { backgroundColor: tone }]} />
      <View>
        <Text style={styles.cardValue} {...textScale.dense}>
          {value}
        </Text>
        <Text style={styles.cardLabel} numberOfLines={1} {...textScale.badge}>
          {upperTR(label)}
        </Text>
      </View>
    </Card>
  );
});

const CareerCell = React.memo(function CareerCell({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color?: string;
}) {
  return (
    <View style={styles.careerCell}>
      <Text style={styles.careerValue} {...textScale.dense}>
        {value}
      </Text>
      <View style={styles.careerLabelRow}>
        {color ? <View style={[styles.dotSm, { backgroundColor: color }]} /> : null}
        <Text style={styles.careerLabel} numberOfLines={1} {...textScale.badge}>
          {upperTR(label)}
        </Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  content: {
    paddingTop: space.xs,
    paddingBottom: space.huge,
  },
  inset: {
    marginHorizontal: layout.screenPadding,
  },
  stack: {
    gap: space.lg,
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
  dot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
  },
  dotSm: {
    width: 6,
    height: 6,
    borderRadius: radius.pill,
  },

  /* — Genel denge — */
  ringRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xl,
  },
  legend: {
    flex: 1,
    gap: space.sm,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  legendLabel: {
    ...type.bodySm,
    color: colors.textSecondary,
    flex: 1,
  },
  legendValue: {
    ...type.tableNumStrong,
    color: colors.textPrimary,
  },

  /* — Gol — */
  goalHead: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  goalDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: colors.separator,
    marginHorizontal: space.lg,
  },
  big: {
    flex: 1,
    gap: space.xxs,
  },
  bigLabel: {
    ...type.overline,
    color: colors.textTertiary,
  },
  bigValue: {
    ...type.metric,
    color: colors.textPrimary,
  },
  bigHint: {
    ...type.caption,
    color: colors.textTertiary,
  },
  trend: {
    gap: space.sm,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
  },
  trendHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  trendTitle: {
    ...type.overline,
    color: colors.textTertiary,
  },
  trendLegend: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
  },
  trendLegendText: {
    ...type.caption,
    color: colors.textTertiary,
    marginRight: space.sm,
  },
  trendBars: {
    flexDirection: "row",
    gap: space.s,
  },
  trendCol: {
    flex: 1,
    alignItems: "center",
  },
  trendTop: {
    height: TREND_HALF,
    width: "100%",
    justifyContent: "flex-end",
    alignItems: "center",
  },
  trendBottom: {
    height: TREND_HALF,
    width: "100%",
    justifyContent: "flex-start",
    alignItems: "center",
  },
  trendBase: {
    height: 1,
    width: "100%",
    backgroundColor: colors.border,
  },
  trendBar: {
    width: "70%",
    maxWidth: 16,
  },
  trendBarUp: {
    backgroundColor: colors.accent,
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
  },
  trendBarDown: {
    backgroundColor: colors.slate,
    borderBottomLeftRadius: 3,
    borderBottomRightRadius: 3,
  },
  trendAxis: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: -space.xs,
  },
  trendAxisText: {
    ...type.caption,
    color: colors.textTertiary,
  },
  factRow: {
    flexDirection: "row",
    gap: space.sm,
  },
  smallFact: {
    flex: 1,
    gap: space.xxs,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface2,
  },
  smallValue: {
    ...type.metricSm,
    color: colors.textPrimary,
  },
  smallLabel: {
    ...type.caption,
    color: colors.textTertiary,
  },

  /* — İç saha / deplasman — */
  sidesHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: space.md,
  },
  side: {
    gap: 1,
  },
  sideRight: {
    alignItems: "flex-end",
  },
  sideLabel: {
    ...type.overline,
    color: colors.textTertiary,
  },
  sideRate: {
    ...type.metricSm,
    color: colors.textPrimary,
  },
  sideHint: {
    ...type.caption,
    color: colors.textTertiary,
  },

  /* — Rekorlar — */
  record: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    minHeight: 72,
  },
  recordBody: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  recordLabel: {
    ...type.overline,
    color: colors.textTertiary,
  },
  recordOpponent: {
    ...type.h4,
    color: colors.textPrimary,
  },
  recordMeta: {
    ...type.caption,
    color: colors.textTertiary,
  },
  recordScore: {
    minWidth: 56,
    alignItems: "center",
    paddingVertical: space.xs,
    paddingHorizontal: space.sm,
    borderRadius: radius.sm,
  },
  recordScoreText: {
    ...type.scoreSm,
    color: colors.textOnStatus,
  },

  /* — Disiplin — */
  cardPair: {
    flexDirection: "row",
    gap: space.md,
  },
  cardHalf: {
    flex: 1,
  },
  cardCount: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
  },
  cardChip: {
    width: 18,
    height: 26,
    borderRadius: radius.xs,
    transform: [{ rotate: "-8deg" }],
  },
  cardValue: {
    ...type.metric,
    color: colors.textPrimary,
  },
  cardLabel: {
    ...type.micro,
    color: colors.textTertiary,
  },

  /* — Kulüp kaydı — */
  careerRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  careerCell: {
    flex: 1,
    alignItems: "center",
    gap: space.xxs,
  },
  careerValue: {
    ...type.scoreSm,
    color: colors.textPrimary,
  },
  careerLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  careerLabel: {
    ...type.micro,
    color: colors.textTertiary,
  },
});
