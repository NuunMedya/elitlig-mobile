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
 * İKİNCİ TUR: sıradaki maç bir "bilet" kartı, form raylı zaman çizelgesi,
 * puan durumu kesitinin üstünde takımın konum kartı (sıra madalyası, lidere
 * ve komşulara puan farkı), sezon özeti halka + G/B/M çubukları + gol
 * karşılaştırması, golcülerin üstünde üç İSTATİSTİK LİDERİ karosu, kadro
 * dağılımı mevki renkli dört karo.
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
  GradientBar,
  PlayerRow,
  ProgressRing,
  RankBadge,
  Reveal,
  SectionHeader,
  SkeletonCard,
  StatBar,
  TeamRow,
  TeamRowHead,
} from "@/components/ui";
import { formatPercent } from "@/lib/format";
import type { ApiMatch, PlayerRankRow, StandingRow } from "@/lib/types";
import {
  colors,
  defaultZoneRules,
  elevate,
  hairline,
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
  perspective,
  type LogoFor,
  type PosLine,
  type TabShell,
} from "./model";
import { NextMatchCard } from "./NextMatchCard";
import { LeaderTile, MiniStat } from "./ProfileKit";
import { StackedBar } from "./StackedBar";

/** Genel sekmesinin üç istatistik lideri — sezonun sıralama listesinden. */
export interface TeamLeaders {
  goals: PlayerRankRow | null;
  assists: PlayerRankRow | null;
  matches: PlayerRankRow | null;
}

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
  /** Liderin puanı — konum kartındaki "lidere fark" için; yoksa çizilmez. */
  leaderPoints?: number | null;
  scopeReady: boolean;
  standingsLoading: boolean;
  standing: { row: StandingRow; position: number } | null;
  leagueLabel: string;
  topScorers: PlayerRankRow[];
  /** İstatistik liderleri (gol / asist / maç); verilmezse bölüm çizilmez. */
  leaders?: TeamLeaders;
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
  leaderPoints,
  scopeReady,
  standingsLoading,
  standing,
  leagueLabel,
  topScorers,
  leaders,
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

  /** Son beş maçın kısa karnesi — form kartının dipnotu. */
  const formFacts = useMemo(() => {
    let w = 0;
    let d = 0;
    let l = 0;
    let gf = 0;
    let ga = 0;
    for (const match of recent.slice(0, 5)) {
      const view = perspective(match, teamId, teamName);
      if (view.result === "W") w += 1;
      else if (view.result === "D") d += 1;
      else if (view.result === "L") l += 1;
      gf += view.ours ?? 0;
      ga += view.theirs ?? 0;
    }
    return { w, d, l, gf, ga, points: w * 3 + d };
  }, [recent, teamId, teamName]);

  const hasLeaders = Boolean(leaders && (leaders.goals || leaders.assists || leaders.matches));

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
            <Reveal scaleFrom={0.97}>
              <NextMatchCard
                match={nextMatch}
                teamId={teamId}
                teamName={teamName}
                logoFor={logoFor}
                onOpen={onOpenMatch}
                onAddCalendar={onAddCalendar}
                style={styles.inset}
              />
            </Reveal>
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
            meta={recent.length ? `Son ${Math.min(5, recent.length)} maç` : undefined}
            action={recent.length ? { label: "Sonuçlar", onPress: onOpenResults } : undefined}
          />
          {matchesLoading ? (
            <SkeletonCard lines={2} style={styles.inset} />
          ) : recent.length ? (
            <Card padding="md" style={styles.inset} contentStyle={styles.formCard}>
              <FormStrip
                matches={recent}
                teamId={teamId}
                teamName={teamName}
                logoFor={logoFor}
                onOpen={onOpenMatch}
              />
              <View style={styles.formFoot}>
                <FormFact label="Puan" value={`${formFacts.points}/${Math.min(5, recent.length) * 3}`} />
                <View style={styles.formFootDivider} />
                <FormFact label="Atılan" value={String(formFacts.gf)} color={colors.accentText} />
                <View style={styles.formFootDivider} />
                <FormFact label="Yenilen" value={String(formFacts.ga)} />
                <View style={styles.formFootDivider} />
                <FormFact
                  label="Karne"
                  value={`${formFacts.w}G ${formFacts.d}B ${formFacts.l}M`}
                />
              </View>
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

      {/* 3 — Puan durumu: konum kartı + takım vurgulu kesit */}
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
          <PositionBanner
            standing={standing}
            neighbours={neighbours}
            tableSize={tableSize}
            leaderPoints={leaderPoints ?? null}
            leagueLabel={leagueLabel}
          />
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
          <SectionHeader title="Sezon özeti" meta={`${num(standing.row.played)} maç`} />
          <SeasonSummary row={standing.row} analysis={analysis} />
        </>
      ) : null}

      {/* 5 — İstatistik liderleri + golcüler */}
      {hasLeaders && leaders ? (
        <>
          <SectionHeader title="İstatistik liderleri" action={{ label: "Kadro", onPress: onOpenSquad }} />
          <View style={[styles.inset, styles.leaders]}>
            {leaders.goals ? (
              <Reveal index={0} style={styles.leaderCell}>
                <LeaderTile
                  icon="football"
                  tone="pink"
                  category="Gol"
                  name={leaders.goals.name}
                  image={leaders.goals.image ?? null}
                  value={num(leaders.goals.goals)}
                  onPress={() => onOpenPlayer(Number(leaders.goals?.id))}
                />
              </Reveal>
            ) : null}
            {leaders.assists ? (
              <Reveal index={1} style={styles.leaderCell}>
                <LeaderTile
                  icon="git-branch"
                  tone="cyan"
                  category="Asist"
                  name={leaders.assists.name}
                  image={leaders.assists.image ?? null}
                  value={num(leaders.assists.assists)}
                  onPress={() => onOpenPlayer(Number(leaders.assists?.id))}
                />
              </Reveal>
            ) : null}
            {leaders.matches ? (
              <Reveal index={2} style={styles.leaderCell}>
                <LeaderTile
                  icon="shirt"
                  tone="violet"
                  category="Maç"
                  name={leaders.matches.name}
                  image={leaders.matches.image ?? null}
                  value={num(leaders.matches.matches)}
                  onPress={() => onOpenPlayer(Number(leaders.matches?.id))}
                />
              </Reveal>
            ) : null}
          </View>
        </>
      ) : null}

      <SectionHeader
        title="Golcüler"
        action={topScorers.length && !hasLeaders ? { label: "Kadro", onPress: onOpenSquad } : undefined}
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

const FormFact = React.memo(function FormFact({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <View style={styles.formFact} accessible accessibilityLabel={`${label} ${value}`}>
      <Text style={[styles.formFactValue, color ? { color } : null]} numberOfLines={1} {...textScale.dense}>
        {value}
      </Text>
      <Text style={styles.formFactLabel} numberOfLines={1} {...textScale.badge}>
        {label.toLocaleUpperCase("tr-TR")}
      </Text>
    </View>
  );
});

/* ══════════════════════════════════════════════════════════════════════════
   Konum kartı — madalya, sıra, komşulara ve lidere puan farkı
   ══════════════════════════════════════════════════════════════════════════ */

const PositionBanner = React.memo(function PositionBanner({
  standing,
  neighbours,
  tableSize,
  leaderPoints,
  leagueLabel,
}: {
  standing: { row: StandingRow; position: number };
  neighbours: { row: StandingRow; rank: number }[];
  tableSize: number;
  leaderPoints: number | null;
  leagueLabel: string;
}) {
  const points = num(standing.row.display_points);
  const above = neighbours.find((entry) => entry.rank === standing.position - 1);
  const below = neighbours.find((entry) => entry.rank === standing.position + 1);
  const leaderGap = leaderPoints != null && standing.position > 1 ? leaderPoints - points : null;
  const aboveGap = above ? num(above.row.display_points) - points : null;
  const belowGap = below ? points - num(below.row.display_points) : null;
  const progress = tableSize > 1 ? (tableSize - standing.position) / (tableSize - 1) : 1;

  return (
    <View style={styles.banner}>
      <View style={styles.bannerTop}>
        <RankBadge rank={standing.position} size={40} />
        <View style={styles.bannerBody}>
          <Text style={styles.bannerTitle} numberOfLines={1} {...textScale.dense}>
            {standing.position === 1 ? "Zirvede" : `${standing.position}. sırada`}
            {tableSize ? <Text style={styles.bannerOf}> / {tableSize} takım</Text> : null}
          </Text>
          {leagueLabel ? (
            <View style={styles.bannerLeague}>
              <Ionicons name="trophy-outline" size={11} color={colors.textTertiary} />
              <Text style={styles.bannerLeagueText} numberOfLines={1} {...textScale.dense}>
                {leagueLabel}
              </Text>
            </View>
          ) : null}
        </View>
        <View style={styles.bannerPoints}>
          <Text style={styles.bannerPointsValue} {...textScale.dense}>
            {points}
          </Text>
          <Text style={styles.bannerPointsLabel} {...textScale.badge}>
            PUAN
          </Text>
        </View>
      </View>
      <GradientBar value={progress} height={5} />
      <View style={styles.bannerGaps}>
        {leaderGap != null ? <GapChip label="Lidere" value={-leaderGap} /> : null}
        {aboveGap != null ? <GapChip label="Bir üste" value={-aboveGap} /> : null}
        {belowGap != null ? <GapChip label="Bir alta" value={belowGap} /> : null}
      </View>
    </View>
  );
});

function GapChip({ label, value }: { label: string; value: number }) {
  const color = value > 0 ? colors.win : value < 0 ? colors.loss : colors.textSecondary;
  const text = value > 0 ? `+${value}` : value < 0 ? `−${Math.abs(value)}` : "0";
  return (
    <View style={styles.gapChip} accessible accessibilityLabel={`${label} fark ${text} puan`}>
      <Text style={styles.gapLabel} {...textScale.badge}>
        {label}
      </Text>
      <Text style={[styles.gapValue, { color }]} {...textScale.badge}>
        {value > 0 ? "▲ " : value < 0 ? "▼ " : ""}
        {text}
      </Text>
    </View>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Sezon özeti — halka + G/B/M çubukları + gol karşılaştırması + yorum
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
  const points = num(row.display_points);

  return (
    <Card padding="lg" style={styles.inset} contentStyle={styles.seasonCard}>
      <View style={styles.seasonTop}>
        <ProgressRing
          value={winRate}
          size={92}
          thickness={8}
          tone="win"
          label={formatPercent(winRate, { ratio: true })}
          sublabel="galibiyet"
          animate
        />
        <View style={styles.seasonRight}>
          <WdlBar label="Galibiyet" value={wins} total={played} color={colors.win} />
          <WdlBar label="Beraberlik" value={draws} total={played} color={colors.draw} />
          <WdlBar label="Mağlubiyet" value={losses} total={played} color={colors.loss} />
        </View>
      </View>

      <View style={styles.goalBox}>
        <StatBar label="Atılan · Yenilen gol" home={goalsFor} away={goalsAgainst} animate={false} />
      </View>

      <View style={styles.goalRow}>
        <MiniStat label="Maç başı gol" value={decimal(played ? goalsFor / played : 0)} color={colors.accentText} />
        <View style={styles.vDivider} />
        <MiniStat label="Maç başı yenilen" value={decimal(played ? goalsAgainst / played : 0)} />
        <View style={styles.vDivider} />
        <MiniStat label="Maç başı puan" value={decimal(played ? points / played : 0, 2)} color={colors.brandAccent} />
      </View>

      {analysis ? (
        <View style={styles.analysisBox}>
          <Ionicons name="sparkles" size={14} color={colors.brandAccent} style={styles.analysisIcon} />
          <Text style={styles.analysis} {...textScale.long}>
            {analysis}
          </Text>
        </View>
      ) : null}
    </Card>
  );
});

/** G/B/M satırı: renk noktası, etiket, sayı ve oranına göre dolan çubuk. */
const WdlBar = React.memo(function WdlBar({
  label,
  value,
  total,
  color,
}: {
  label: string;
  value: number;
  total: number;
  color: string;
}) {
  return (
    <View style={styles.wdlRow} accessible accessibilityLabel={`${value} ${label.toLocaleLowerCase("tr-TR")}`}>
      <View style={styles.wdlHead}>
        <View style={[styles.dot, { backgroundColor: color }]} />
        <Text style={styles.wdlLabel} numberOfLines={1} {...textScale.dense}>
          {label}
        </Text>
        <Text style={styles.wdlValue} {...textScale.dense}>
          {value}
        </Text>
      </View>
      <GradientBar value={total ? value / total : 0} height={4} gradient={[color, color]} />
    </View>
  );
});

/* ══════════════════════════════════════════════════════════════════════════
   Kadro dağılımı — mevki renkli dört karo + tek çubuk
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
  const known = LINE_ORDER.filter((line) => line !== "OTHER");

  return (
    <>
      <View style={styles.squadHead}>
        <Text style={styles.squadTotal} {...textScale.dense}>
          {total}
        </Text>
        <Text style={styles.squadUnit} {...textScale.dense}>
          kayıtlı oyuncu
        </Text>
        {hideChevron ? null : (
          <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} style={styles.squadChevron} />
        )}
      </View>
      <View style={styles.lineTiles}>
        {known.map((line) => (
          <View
            key={line}
            style={[styles.lineTile, counts[line] > 0 ? null : styles.lineTileEmpty]}
            accessible
            accessibilityLabel={`${LINE_LABEL[line]} ${counts[line]}`}
          >
            <View style={[styles.lineTileBar, { backgroundColor: lineColor(line) }]} />
            <Text style={[styles.lineTileValue, { color: counts[line] > 0 ? lineColor(line) : colors.textTertiary }]} {...textScale.dense}>
              {counts[line]}
            </Text>
            <Text style={styles.lineTileLabel} {...textScale.badge}>
              {LINE_SHORT[line]}
            </Text>
          </View>
        ))}
      </View>
      <StackedBar
        segments={lines.map((line) => ({
          key: line,
          value: counts[line],
          color: lineColor(line),
        }))}
        height={6}
      />
      {counts.OTHER > 0 ? (
        <Text style={styles.squadNote} {...textScale.dense}>
          {counts.OTHER} oyuncunun mevkisi girilmemiş.
        </Text>
      ) : null}
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
    borderWidth: hairline,
    borderColor: colors.border,
    ...elevate(1),
  },
  divided: {
    borderTopWidth: hairline,
    borderTopColor: colors.separator,
  },

  /* — Form kartı — */
  formCard: {
    gap: space.md,
  },
  formFoot: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: space.md,
    borderTopWidth: hairline,
    borderTopColor: colors.separator,
  },
  formFootDivider: {
    width: hairline,
    alignSelf: "stretch",
    backgroundColor: colors.separator,
  },
  formFact: {
    flex: 1,
    alignItems: "center",
    gap: space.xxs,
  },
  formFactValue: {
    ...type.tableNumStrong,
    color: colors.textPrimary,
  },
  formFactLabel: {
    ...type.overline,
    color: colors.textTertiary,
  },

  /* — Mini tablo + konum kartı — */
  table: {
    marginHorizontal: layout.screenPadding,
    borderRadius: radius.xl,
    overflow: "hidden",
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
    paddingBottom: space.xs,
    ...elevate(1),
  },
  banner: {
    padding: space.md,
    gap: space.m,
    backgroundColor: colors.brandDim,
    borderBottomWidth: hairline,
    borderBottomColor: colors.separator,
  },
  bannerTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
  },
  bannerBody: {
    flex: 1,
    minWidth: 0,
    gap: space.xxs,
  },
  bannerTitle: {
    ...type.h3,
    color: colors.textPrimary,
  },
  bannerOf: {
    ...type.bodySm,
    color: colors.textTertiary,
  },
  bannerLeague: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
  },
  bannerLeagueText: {
    ...type.caption,
    color: colors.textTertiary,
    flexShrink: 1,
  },
  bannerPoints: {
    alignItems: "flex-end",
  },
  bannerPointsValue: {
    ...type.scoreMd,
    color: colors.brandAccent,
  },
  bannerPointsLabel: {
    ...type.overline,
    color: colors.textTertiary,
  },
  bannerGaps: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.s,
  },
  gapChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs,
    borderRadius: radius.pill,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  gapLabel: {
    ...type.caption,
    color: colors.textTertiary,
  },
  gapValue: {
    ...type.numSmStrong,
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
    gap: space.m,
  },
  wdlRow: {
    gap: space.xs,
  },
  wdlHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.s,
  },
  wdlLabel: {
    ...type.labelSm,
    color: colors.textSecondary,
    flex: 1,
  },
  wdlValue: {
    ...type.tableNumStrong,
    color: colors.textPrimary,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
  },
  goalBox: {
    paddingTop: space.md,
    borderTopWidth: hairline,
    borderTopColor: colors.separator,
  },
  goalRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: space.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.surface2,
  },
  vDivider: {
    width: hairline,
    alignSelf: "stretch",
    backgroundColor: colors.separator,
  },
  analysisBox: {
    flexDirection: "row",
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: colors.brandDim,
  },
  analysisIcon: {
    marginTop: space.xxs,
  },
  analysis: {
    ...type.bodySm,
    color: colors.textSecondary,
    flex: 1,
  },

  /* — Liderler — */
  leaders: {
    flexDirection: "row",
    gap: space.sm,
  },
  leaderCell: {
    flex: 1,
    minWidth: 0,
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
  lineTiles: {
    flexDirection: "row",
    gap: space.sm,
  },
  lineTile: {
    flex: 1,
    alignItems: "center",
    paddingTop: space.m,
    paddingBottom: space.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surface2,
    overflow: "hidden",
    gap: space.xxs,
  },
  lineTileEmpty: {
    opacity: 0.6,
  },
  lineTileBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 3,
  },
  lineTileValue: {
    ...type.metricSm,
  },
  lineTileLabel: {
    ...type.overline,
    color: colors.textTertiary,
  },
  squadNote: {
    ...type.caption,
    color: colors.textTertiary,
  },
});
