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
 * İKİNCİ TUR: her bölüm kendi kart anatomisine kavuştu — denge kartında
 * halka + dört renkli sayı karosu, gol kartında Odometer'lı iki dev sayı ve
 * degrade trend çubukları, iç saha/deplasman iki taraflı başlık + StatBar,
 * rekorlar ikon karolu satırlar + sonuç hapı, disiplin kart biçimli
 * karolar, kulüp kaydı 3×2 sayı ızgarası.
 *
 * DÜZELTME: galibiyet halkası (`ProgressRing`) 0–1 arası değer bekler; eski
 * sürüm yüzde (81) veriyordu ve halka her takımda TAM doluydu.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useCallback } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import {
  Card,
  EmptyState,
  IconTile,
  Odometer,
  ProgressRing,
  Reveal,
  SectionHeader,
  SkeletonCard,
  StatBar,
  Touchable,
  type IconTileTone,
} from "@/components/ui";
import { formatDateShort, formatPercent } from "@/lib/format";
import { colors, elevate, hairline, layout, radius, space, textScale, type, upperTR } from "@/theme";
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
import { MiniStat, ResultPill } from "./ProfileKit";
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
  const diff = total.goalsFor - total.goalsAgainst;

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
          <SectionHeader title="Gol" />
          <SkeletonCard lines={3} style={styles.inset} />
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
          <Reveal>
            <Card padding="lg" style={styles.inset} contentStyle={styles.stack}>
              <View style={styles.ringRow}>
                <ProgressRing
                  value={winRate}
                  size={96}
                  thickness={8}
                  tone="win"
                  label={formatPercent(winRate, { ratio: true })}
                  sublabel="galibiyet"
                  animate
                />
                <View style={styles.balanceGrid}>
                  <View style={styles.balanceRow}>
                    <BalanceTile label="Galibiyet" value={total.wins} color={colors.win} bg={colors.winDim} />
                    <BalanceTile label="Beraberlik" value={total.draws} color={colors.draw} bg={colors.drawDim} />
                  </View>
                  <View style={styles.balanceRow}>
                    <BalanceTile label="Mağlubiyet" value={total.losses} color={colors.loss} bg={colors.lossDim} />
                    <BalanceTile
                      label="Averaj"
                      value={signed(diff)}
                      color={diff > 0 ? colors.win : diff < 0 ? colors.loss : colors.textPrimary}
                      bg={colors.surface2}
                    />
                  </View>
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
          </Reveal>

          {/* — Gol — */}
          <SectionHeader title="Gol" />
          <Card padding="lg" style={styles.inset} contentStyle={styles.stack}>
            <View style={styles.goalHead}>
              <BigNumber
                label="Attığı"
                value={total.goalsFor}
                hint={`maç başı ${decimal(total.played ? total.goalsFor / total.played : 0)}`}
                color={colors.accentText}
                icon="arrow-up-circle"
              />
              <View style={styles.goalDivider} />
              <BigNumber
                label="Yediği"
                value={total.goalsAgainst}
                hint={`maç başı ${decimal(total.played ? total.goalsAgainst / total.played : 0)}`}
                icon="arrow-down-circle"
                alignRight
              />
            </View>

            {records.trendFor.length >= 3 ? (
              <GoalTrend scored={records.trendFor} conceded={records.trendAgainst} />
            ) : null}

            <View style={styles.factRow}>
              <SmallFact icon="shield-checkmark" tone="mint" label="Gol yemeden" value={records.cleanSheets} />
              <SmallFact icon="remove-circle" tone="neutral" label="Gol atamadan" value={records.blankGames} />
              <SmallFact icon="flame" tone="pink" label="En uzun seri" value={records.longestWinRun} />
            </View>
          </Card>

          {/* — İç saha / deplasman — */}
          <SectionHeader title="İç saha · Deplasman" />
          <Card padding="lg" style={styles.inset} contentStyle={styles.stack}>
            <View style={styles.sidesHead}>
              <SideHead icon="home" label="İç saha" rate={pct(home.wins, home.played)} played={home.played} tone="cyan" />
              <View style={styles.vs}>
                <Text style={styles.vsText} {...textScale.badge}>
                  VS
                </Text>
              </View>
              <SideHead
                icon="airplane"
                label="Deplasman"
                rate={pct(away.wins, away.played)}
                played={away.played}
                tone="neutral"
                alignRight
              />
            </View>
            <View style={styles.bars}>
              <StatBar label="Galibiyet" home={home.wins} away={away.wins} animate={false} />
              <StatBar label="Beraberlik" home={home.draws} away={away.draws} animate={false} />
              <StatBar label="Mağlubiyet" home={home.losses} away={away.losses} animate={false} />
              <StatBar label="Atılan gol" home={home.goalsFor} away={away.goalsFor} animate={false} />
              <StatBar label="Yenilen gol" home={home.goalsAgainst} away={away.goalsAgainst} animate={false} />
            </View>
          </Card>

          {/* — Rekorlar — */}
          {records.bestWin || records.mostGoals || records.worstLoss ? (
            <>
              <SectionHeader title="Rekorlar" />
              <View style={styles.group}>
                {[
                  { key: "best", label: "En farklı galibiyet", item: records.bestWin, icon: "trophy" as const, tone: "gold" as const },
                  { key: "most", label: "En gollü maç", item: records.mostGoals, icon: "flame" as const, tone: "pink" as const },
                  { key: "worst", label: "En ağır yenilgi", item: records.worstLoss, icon: "trending-down" as const, tone: "red" as const },
                ]
                  .filter((entry) => entry.item)
                  .map((entry, index) => (
                    <RecordRow
                      key={entry.key}
                      label={entry.label}
                      icon={entry.icon}
                      tone={entry.tone}
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
            <CardCount label="Sarı kart" value={discipline.yellow} tone={colors.yellowCard} players={discipline.players} />
            <CardCount label="Kırmızı kart" value={discipline.red} tone={colors.redCard} players={discipline.players} />
          </View>
        </>
      ) : null}

      {/* — Kulüp kaydı — puan tablosuna değil takım kaydına dayanır, bu yüzden
          kapsam tutmasa da her zaman gösterilir. */}
      {career.matches > 0 ? (
        <>
          <SectionHeader title="Kulüp kaydı" meta="Tüm zamanlar" />
          <Card padding="md" style={styles.inset} contentStyle={styles.careerGrid}>
            <View style={styles.careerRow}>
              <MiniStat label="Maç" value={career.matches} roll />
              <MiniStat label="Atılan" value={career.goalsFor} color={colors.accentText} roll />
              <MiniStat label="Yenilen" value={career.goalsAgainst} roll />
            </View>
            <View style={styles.careerDivider} />
            <View style={styles.careerRow}>
              <MiniStat label="Galibiyet" value={career.wins} color={colors.win} roll />
              <MiniStat label="Beraberlik" value={career.draws} color={colors.draw} roll />
              <MiniStat label="Mağlubiyet" value={career.losses} color={colors.loss} roll />
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

const BalanceTile = React.memo(function BalanceTile({
  label,
  value,
  color,
  bg,
}: {
  label: string;
  value: number | string;
  color: string;
  bg: string;
}) {
  return (
    <View style={[styles.balanceTile, { backgroundColor: bg }]} accessible accessibilityLabel={`${label} ${value}`}>
      <Odometer value={value} style={[styles.balanceValue, { color }]} />
      <Text style={styles.balanceLabel} numberOfLines={1} {...textScale.badge}>
        {upperTR(label)}
      </Text>
    </View>
  );
});

const BigNumber = React.memo(function BigNumber({
  label,
  value,
  hint,
  color,
  icon,
  alignRight = false,
}: {
  label: string;
  value: number;
  hint: string;
  color?: string;
  icon: keyof typeof Ionicons.glyphMap;
  alignRight?: boolean;
}) {
  return (
    <View
      style={[styles.big, alignRight ? styles.bigRight : null]}
      accessible
      accessibilityLabel={`${label} ${value} gol, ${hint}`}
    >
      <View style={styles.bigLabelRow}>
        <Ionicons name={icon} size={13} color={color ?? colors.textTertiary} />
        <Text style={styles.bigLabel} {...textScale.badge}>
          {upperTR(label)}
        </Text>
      </View>
      <Odometer value={value} style={[styles.bigValue, color ? { color } : null]} />
      <Text style={styles.bigHint} {...textScale.dense}>
        {hint}
      </Text>
    </View>
  );
});

/** Çubuğun bir yarısının en büyük yüksekliği. */
const TREND_HALF = 38;

/**
 * GOL TRENDİ — son maçlar, ıraksak çubuk.
 *
 * Üstte atılan (imza degradesi), altta yenilen (nötr) gol; iki yarı AYNI
 * ölçeği paylaşır. Her çubuğun ucunda değeri yazar.
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
        {scored.map((goals, index) => {
          const up = Math.max(goals > 0 ? 4 : 0, (goals / max) * TREND_HALF);
          const down = Math.max(conceded[index] > 0 ? 4 : 0, (conceded[index] / max) * TREND_HALF);
          return (
            <View key={index} style={styles.trendCol}>
              <View style={styles.trendTop}>
                <Text style={styles.trendNum} {...textScale.badge}>
                  {goals}
                </Text>
                <View style={[styles.trendBar, { height: up }]}>
                  <LinearGradient
                    colors={colors.gradientSignature}
                    start={{ x: 0.5, y: 1 }}
                    end={{ x: 0.5, y: 0 }}
                    style={StyleSheet.absoluteFill}
                  />
                </View>
              </View>
              <View style={styles.trendBase} />
              <View style={styles.trendBottom}>
                <View style={[styles.trendBar, styles.trendBarDown, { height: down }]} />
                <Text style={styles.trendNum} {...textScale.badge}>
                  {conceded[index]}
                </Text>
              </View>
            </View>
          );
        })}
      </View>
      <View style={styles.trendAxis}>
        <Text style={styles.trendAxisText} {...textScale.badge}>
          ← Eski
        </Text>
        <Text style={styles.trendAxisText} {...textScale.badge}>
          Yeni →
        </Text>
      </View>
    </View>
  );
});

const SmallFact = React.memo(function SmallFact({
  icon,
  tone,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  tone: IconTileTone;
  label: string;
  value: number;
}) {
  return (
    <View style={styles.smallFact} accessible accessibilityLabel={`${label}: ${value} maç`}>
      <IconTile icon={icon} tone={tone} size={30} glow={false} />
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
  icon,
  label,
  rate,
  played,
  tone,
  alignRight = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  rate: number;
  played: number;
  tone: IconTileTone;
  alignRight?: boolean;
}) {
  return (
    <View style={[styles.side, alignRight ? styles.sideRight : null]}>
      <View style={[styles.sideTop, alignRight ? styles.sideTopRight : null]}>
        <IconTile icon={icon} tone={tone} size={26} glow={false} />
        <Text style={styles.sideLabel} {...textScale.badge}>
          {upperTR(label)}
        </Text>
      </View>
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
  icon,
  tone,
  item,
  divided,
  onOpen,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  tone: IconTileTone;
  item: MatchHighlight;
  divided: boolean;
  onOpen: (matchId: number) => void;
}) {
  const handlePress = useCallback(() => onOpen(Number(item.match.id)), [onOpen, item.match.id]);
  const result = item.ours > item.theirs ? "W" : item.ours < item.theirs ? "L" : "D";

  return (
    <Touchable
      feedback="row"
      haptic="selection"
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${item.ours}-${item.theirs}, ${item.opponent}, ${formatDateShort(item.match.date)}`}
      style={[styles.record, divided ? styles.divided : null]}
    >
      <IconTile icon={icon} tone={tone} size={38} glow={false} />
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
      <ResultPill result={result} text={`${item.ours}–${item.theirs}`} />
      <Ionicons name="chevron-forward" size={14} color={colors.textTertiary} />
    </Touchable>
  );
});

const CardCount = React.memo(function CardCount({
  label,
  value,
  tone,
  players,
}: {
  label: string;
  value: number;
  tone: string;
  players: number;
}) {
  return (
    <Card padding="lg" style={styles.cardHalf} contentStyle={styles.cardCount}>
      <View style={[styles.cardChip, { backgroundColor: tone }]} />
      <View style={styles.cardBody}>
        <Odometer value={value} style={styles.cardValue} />
        <Text style={styles.cardLabel} numberOfLines={1} {...textScale.badge}>
          {upperTR(label)}
        </Text>
        <Text style={styles.cardHint} numberOfLines={1} {...textScale.dense}>
          oyuncu başı {decimal(players ? value / players : 0, 2)}
        </Text>
      </View>
    </Card>
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
    borderWidth: hairline,
    borderColor: colors.border,
    ...elevate(1),
  },
  divided: {
    borderTopWidth: hairline,
    borderTopColor: colors.separator,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
  },

  /* — Denge — */
  ringRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.lg,
  },
  balanceGrid: {
    flex: 1,
    gap: space.sm,
  },
  balanceRow: {
    flexDirection: "row",
    gap: space.sm,
  },
  balanceTile: {
    flex: 1,
    paddingVertical: space.sm,
    paddingHorizontal: space.sm,
    borderRadius: radius.md,
    gap: space.xxs,
  },
  balanceValue: {
    ...type.metricSm,
  },
  balanceLabel: {
    ...type.overline,
    color: colors.textTertiary,
  },

  /* — Gol — */
  goalHead: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  goalDivider: {
    width: hairline,
    backgroundColor: colors.separator,
    marginHorizontal: space.lg,
  },
  big: {
    flex: 1,
    gap: space.xxs,
  },
  bigRight: {
    alignItems: "flex-end",
  },
  bigLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
  },
  bigLabel: {
    ...type.overline,
    color: colors.textTertiary,
  },
  bigValue: {
    ...type.scoreHero,
    color: colors.textPrimary,
  },
  bigHint: {
    ...type.caption,
    color: colors.textTertiary,
  },
  trend: {
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface2,
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
    marginRight: space.s,
  },
  trendBars: {
    flexDirection: "row",
    gap: space.xs,
  },
  trendCol: {
    flex: 1,
    alignItems: "center",
  },
  trendTop: {
    height: TREND_HALF + 14,
    justifyContent: "flex-end",
    alignItems: "center",
    alignSelf: "stretch",
  },
  trendBottom: {
    height: TREND_HALF + 14,
    justifyContent: "flex-start",
    alignItems: "center",
    alignSelf: "stretch",
  },
  trendBase: {
    alignSelf: "stretch",
    height: 1,
    backgroundColor: colors.border,
  },
  trendBar: {
    width: "70%",
    maxWidth: 16,
    borderRadius: 3,
    overflow: "hidden",
  },
  trendBarDown: {
    backgroundColor: colors.slate,
  },
  trendNum: {
    ...type.nano,
    color: colors.textTertiary,
  },
  trendAxis: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  trendAxisText: {
    ...type.meta,
    color: colors.textTertiary,
  },
  factRow: {
    flexDirection: "row",
    gap: space.sm,
  },
  smallFact: {
    flex: 1,
    alignItems: "center",
    gap: space.xs,
    paddingVertical: space.md,
    paddingHorizontal: space.xs,
    borderRadius: radius.lg,
    backgroundColor: colors.surface2,
  },
  smallValue: {
    ...type.metricSm,
    color: colors.textPrimary,
  },
  smallLabel: {
    ...type.caption,
    color: colors.textTertiary,
    textAlign: "center",
  },

  /* — İç saha / deplasman — */
  sidesHead: {
    flexDirection: "row",
    alignItems: "center",
  },
  side: {
    flex: 1,
    gap: space.xxs,
  },
  sideRight: {
    alignItems: "flex-end",
  },
  sideTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.s,
  },
  sideTopRight: {
    flexDirection: "row-reverse",
  },
  sideLabel: {
    ...type.overline,
    color: colors.textTertiary,
  },
  sideRate: {
    ...type.scoreMd,
    color: colors.textPrimary,
  },
  sideHint: {
    ...type.caption,
    color: colors.textTertiary,
  },
  vs: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface2,
  },
  vsText: {
    ...type.micro,
    color: colors.textTertiary,
  },
  bars: {
    gap: space.xs,
  },

  /* — Rekorlar — */
  record: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    minHeight: 68,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
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

  /* — Disiplin — */
  cardPair: {
    flexDirection: "row",
    gap: space.sm,
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
    width: 22,
    height: 30,
    borderRadius: radius.xs,
    transform: [{ rotate: "-8deg" }],
  },
  cardBody: {
    flex: 1,
    minWidth: 0,
  },
  cardValue: {
    ...type.metric,
    color: colors.textPrimary,
  },
  cardLabel: {
    ...type.overline,
    color: colors.textTertiary,
  },
  cardHint: {
    ...type.caption,
    color: colors.textTertiary,
  },

  /* — Kulüp kaydı — */
  careerGrid: {
    gap: space.md,
  },
  careerRow: {
    flexDirection: "row",
  },
  careerDivider: {
    height: hairline,
    backgroundColor: colors.separator,
  },
});
