/**
 * 2) FİKSTÜR / 3) SONUÇLAR — aya göre gruplu maç listesi.
 *
 * NE DEĞİŞTİ:
 *   - Liste AYLARA bölünür ("Ekim 2026", yapışkan başlık). 107 maçlık düz
 *     bir listede "geçen ay ne oynadılar?" sorusu ancak tarihleri tek tek
 *     okuyarak cevaplanıyordu.
 *   - Takım birden çok ligde oynuyorsa (FREELİG + FİKSTÜRLÜ LİG gibi) üstte
 *     lig çipleri belirir. Tek ligli takımda çip gürültüdür, çizilmez.
 *   - Sonuçlar listesinin tepesinde, seçili süzgece göre G/B/M karnesi ve
 *     gol sayıları durur: listenin ÖZETİ, listenin kendisinden önce.
 *   - Fikstürde saati geçmiş ama sonucu girilmemiş maçlar ayrı bir
 *     "Sonucu bekleniyor" grubunda en üstte durur; eskiden gelecekteki
 *     maçların arasına karışıyordu.
 *
 * İKİNCİ TUR — SATIR ANATOMİSİ: koca maç kartları (ekrana 2,5 maç) yerine
 * takımın GÖZÜNDEN okunan sıkı satırlar; ay grubu tek kartta, iç ayraçlı:
 *
 *   ┃ 12   (arma) VADİNİN ASLANLARI          [ 8–4 ]
 *   ┃ KAS  DEP · FREELİG · Ostim            G
 *
 *   - Solda sonuç renginde 3px şerit + tarih bloğu (gün iri, ay küçük).
 *   - Rakip arması + adı; altında İÇ/DEP, lig, saha.
 *   - Sağda skor TAKIMIN gözünden (önce bizim gol), sonuç renginde hap.
 *   - Fikstürde sağda saat + takvime ekle düğmesi.
 *   - Özet kartı: G/B/M renkli karolar + galibiyet halkası + gol satırı.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useCallback, useMemo, useState } from "react";
import { ScrollView, SectionList, StyleSheet, Text, View } from "react-native";
import {
  Card,
  Chip,
  ChipGroup,
  EmptyState,
  Odometer,
  ProgressRing,
  Reveal,
  SkeletonMatchRow,
  TeamLogo,
  Touchable,
} from "@/components/ui";
import { formatPercent, formatTime } from "@/lib/format";
import type { ApiMatch } from "@/lib/types";
import { colors, hairline, layout, radius, space, textScale, type, upperTR } from "@/theme";
import { splitDate } from "@/components/playerpage/MatchLogRow";
import {
  buildRecords,
  groupPosition,
  monthHeading,
  perspective,
  RESULT_LABEL,
  type GroupPosition,
  type LogoFor,
  type TabShell,
} from "./model";
import { ResultPill, resultColor } from "./ProfileKit";
import { StackedBar } from "./StackedBar";

interface MatchSection {
  key: string;
  title: string;
  /** Bu gruptaki maçlar takvime eklenebilir mi (gecikmiş grup hayır). */
  calendar: boolean;
  /** Gecikmiş (sonucu beklenen) grup — satırlar uyarı tonunda. */
  awaiting: boolean;
  data: ApiMatch[];
}

export interface MatchesTabProps extends TabShell {
  mode: "fixtures" | "results";
  /** Fikstür: gelecek maçlar (artan); sonuçlar: bitmiş maçlar (azalan). */
  matches: ApiMatch[];
  /** Yalnız fikstür: saati geçmiş, sonucu girilmemiş maçlar. */
  awaiting?: ApiMatch[];
  loading: boolean;
  logoFor: LogoFor;
  onOpenMatch: (matchId: number) => void;
  onAddCalendar: (match: ApiMatch) => void;
  teamId: number;
  teamName: string;
}

const ALL = "__all__";
const ROW_HEIGHT = 64;

export function MatchesTab({
  mode,
  teamId,
  teamName,
  scrollProps,
  refreshControl,
  matches,
  awaiting = [],
  loading,
  logoFor,
  onOpenMatch,
  onAddCalendar,
}: MatchesTabProps) {
  const fixtures = mode === "fixtures";
  const [league, setLeague] = useState<string>(ALL);

  /** Takımın oynadığı ligler — maç sayısına göre çoktan aza. */
  const leagues = useMemo(() => {
    const counts = new Map<string, number>();
    for (const match of [...awaiting, ...matches]) {
      const name = String(match.league_name ?? "").trim();
      if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [matches, awaiting]);

  const pick = useCallback(
    (list: ApiMatch[]) =>
      league === ALL ? list : list.filter((match) => String(match.league_name ?? "").trim() === league),
    [league],
  );

  const filtered = useMemo(() => pick(matches), [pick, matches]);
  const filteredAwaiting = useMemo(() => pick(awaiting), [pick, awaiting]);

  const sections = useMemo<MatchSection[]>(() => {
    const out: MatchSection[] = [];
    if (fixtures && filteredAwaiting.length) {
      out.push({ key: "awaiting", title: "Sonucu bekleniyor", calendar: false, awaiting: true, data: filteredAwaiting });
    }
    for (const match of filtered) {
      const title = monthHeading(match.date);
      const last = out[out.length - 1];
      if (last && last.key === `m:${title}`) last.data.push(match);
      else out.push({ key: `m:${title}`, title, calendar: fixtures, awaiting: false, data: [match] });
    }
    return out;
  }, [filtered, filteredAwaiting, fixtures]);

  const records = useMemo(
    () => (fixtures ? null : buildRecords(filtered, teamId, teamName)),
    [fixtures, filtered, teamId, teamName],
  );

  const renderItem = useCallback(
    ({ item, index, section }: { item: ApiMatch; index: number; section: MatchSection }) => (
      <Reveal index={index} distance={6}>
        <TeamMatchRow
          match={item}
          logoFor={logoFor}
          fixture={fixtures}
          awaiting={section.awaiting}
          showCalendar={section.calendar}
          position={groupPosition(index, section.data.length)}
          teamId={teamId}
          teamName={teamName}
          onOpen={onOpenMatch}
          onAddCalendar={onAddCalendar}
        />
      </Reveal>
    ),
    [logoFor, fixtures, onOpenMatch, onAddCalendar, teamId, teamName],
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: MatchSection }) => (
      <View style={styles.monthHead}>
        <Ionicons
          name={section.awaiting ? "hourglass" : fixtures ? "calendar" : "time"}
          size={13}
          color={section.awaiting ? colors.warn : colors.brandAccent}
        />
        <Text style={styles.monthTitle} numberOfLines={1} {...textScale.dense}>
          {section.title}
        </Text>
        <View style={styles.monthCount}>
          <Text style={styles.monthCountText} {...textScale.badge}>
            {section.data.length} maç
          </Text>
        </View>
      </View>
    ),
    [fixtures],
  );

  if (loading) {
    return (
      <ScrollView {...scrollProps} contentContainerStyle={styles.content}>
        <SkeletonMatchRow count={6} />
      </ScrollView>
    );
  }

  const winRate = records && records.total.played ? records.total.wins / records.total.played : 0;

  const header = (
    <View style={styles.header}>
      {leagues.length > 1 ? (
        <ChipGroup style={styles.chips}>
          <Chip
            label="Tümü"
            selected={league === ALL}
            onPress={() => setLeague(ALL)}
            count={matches.length + (fixtures ? awaiting.length : 0)}
          />
          {leagues.map(([name, count]) => (
            <Chip
              key={name}
              label={name}
              selected={league === name}
              onPress={() => setLeague(name)}
              count={count}
            />
          ))}
        </ChipGroup>
      ) : null}

      {records && records.total.played > 0 ? (
        <Card padding="lg" style={styles.inset} contentStyle={styles.summary}>
          <View style={styles.summaryTop}>
            <ProgressRing
              value={winRate}
              size={68}
              thickness={6}
              tone="win"
              label={formatPercent(winRate, { ratio: true })}
              animate
            />
            <View style={styles.summaryTiles}>
              <SummaryCell value={records.total.played} label="Maç" />
              <SummaryCell value={records.total.wins} label="G" color={colors.win} bg={colors.winDim} />
              <SummaryCell value={records.total.draws} label="B" color={colors.draw} bg={colors.drawDim} />
              <SummaryCell value={records.total.losses} label="M" color={colors.loss} bg={colors.lossDim} />
            </View>
          </View>
          <StackedBar
            segments={[
              { key: "w", value: records.total.wins, color: colors.win },
              { key: "d", value: records.total.draws, color: colors.draw },
              { key: "l", value: records.total.losses, color: colors.loss },
            ]}
          />
          <View style={styles.summaryFoot}>
            <View style={styles.footItem}>
              <Ionicons name="football" size={13} color={colors.accentText} />
              <Text style={styles.footText} {...textScale.dense}>
                <Text style={styles.footStrong}>{records.total.goalsFor}</Text> gol attı
              </Text>
            </View>
            <View style={styles.footItem}>
              <Ionicons name="shield-half" size={13} color={colors.textTertiary} />
              <Text style={styles.footText} {...textScale.dense}>
                <Text style={styles.footStrong}>{records.total.goalsAgainst}</Text> gol yedi
              </Text>
            </View>
          </View>
        </Card>
      ) : null}
    </View>
  );

  return (
    <SectionList
      {...scrollProps}
      sections={sections}
      keyExtractor={matchKey}
      renderItem={renderItem}
      renderSectionHeader={renderSectionHeader}
      stickySectionHeadersEnabled
      refreshControl={refreshControl}
      contentContainerStyle={styles.content}
      ListHeaderComponent={header}
      ListFooterComponent={
        fixtures && filtered.length === 0 && filteredAwaiting.length > 0 ? (
          <EmptyState
            icon="calendar-outline"
            title="Planlanmış başka maç yok"
            body="Fikstüre yeni maç eklendiğinde burada görünecek."
            variant="inline"
            compact
          />
        ) : null
      }
      ListEmptyComponent={
        fixtures ? (
          <EmptyState
            icon="calendar-outline"
            title="Yaklaşan maç yok"
            body="Fikstüre maç eklendiğinde burada görünecek."
            variant="inline"
          />
        ) : (
          <EmptyState
            icon="football-outline"
            title="Sonuç yok"
            body="Bu takımın oynanmış maçı bulunmuyor."
            variant="inline"
          />
        )
      }
      showsVerticalScrollIndicator={false}
    />
  );
}

const matchKey = (item: ApiMatch) => String(item.id);

const SummaryCell = React.memo(function SummaryCell({
  value,
  label,
  color,
  bg,
}: {
  value: number;
  label: string;
  color?: string;
  bg?: string;
}) {
  return (
    <View
      style={[styles.summaryCell, { backgroundColor: bg ?? colors.surface2 }]}
      accessible
      accessibilityLabel={`${value} ${label.toLocaleLowerCase("tr-TR")}`}
    >
      <Odometer value={value} style={[styles.summaryValue, color ? { color } : null]} />
      <Text style={styles.summaryLabel} numberOfLines={1} {...textScale.badge}>
        {label.toLocaleUpperCase("tr-TR")}
      </Text>
    </View>
  );
});

/**
 * Takımın gözünden maç satırı. İşleyiciler burada maç id'sine bağlanır;
 * dışarıdan yalnız ilkel değerler ve sabit fonksiyonlar geçer (memo işler).
 */
const TeamMatchRow = React.memo(function TeamMatchRow({
  match,
  logoFor,
  fixture,
  awaiting,
  showCalendar,
  position,
  teamId,
  teamName,
  onOpen,
  onAddCalendar,
}: {
  match: ApiMatch;
  logoFor: LogoFor;
  fixture: boolean;
  awaiting: boolean;
  showCalendar: boolean;
  position: GroupPosition;
  teamId: number;
  teamName: string;
  onOpen: (matchId: number) => void;
  onAddCalendar: (match: ApiMatch) => void;
}) {
  const handleOpen = useCallback(() => onOpen(Number(match.id)), [onOpen, match.id]);
  const handleCalendar = useCallback(() => onAddCalendar(match), [onAddCalendar, match]);
  const view = perspective(match, teamId, teamName);
  const date = splitDate(match.date ?? null);
  const time = formatTime(match.time);
  const scored = !fixture && view.ours != null && view.theirs != null;
  const stripe = scored ? resultColor(view.result) : awaiting ? colors.warn : colors.brand;
  const meta = [view.home ? "İÇ" : "DEP", match.league_name ? upperTR(match.league_name) : null, match.match_field]
    .filter(Boolean)
    .join(" · ");

  return (
    <Touchable
      feedback="row"
      haptic="selection"
      onPress={handleOpen}
      accessibilityRole="button"
      accessibilityLabel={[
        `${view.opponentName} maçı`,
        view.home ? "iç saha" : "deplasman",
        scored ? `${view.ours}-${view.theirs}` : time,
        scored && view.result ? RESULT_LABEL[view.result] : null,
      ]
        .filter(Boolean)
        .join(", ")}
      style={[
        styles.row,
        position === "first" || position === "single" ? styles.rowFirst : styles.rowDivided,
        position === "last" || position === "single" ? styles.rowLast : null,
      ]}
    >
      <View style={[styles.stripe, { backgroundColor: stripe }]} />
      <View style={styles.dateBlock}>
        <Text style={styles.dateDay} {...textScale.badge}>
          {date?.day ?? "—"}
        </Text>
        <Text style={styles.dateMonth} {...textScale.badge}>
          {date?.month ?? ""}
        </Text>
      </View>
      <TeamLogo name={view.opponentName} logo={logoFor(view.opponentId, view.opponentName)} size={32} />
      <View style={styles.rowBody}>
        <Text style={styles.opponent} numberOfLines={1} {...textScale.dense}>
          {view.opponentName}
        </Text>
        <Text style={styles.rowMeta} numberOfLines={1} {...textScale.dense}>
          {meta}
        </Text>
      </View>
      {scored ? (
        <ResultPill result={view.result} text={`${view.ours}–${view.theirs}`} />
      ) : (
        <View style={styles.timeBox}>
          <Text style={[styles.time, awaiting ? styles.timeLate : null]} {...textScale.badge}>
            {time || "—"}
          </Text>
          {showCalendar ? (
            <Touchable
              onPress={handleCalendar}
              feedback="icon"
              haptic="light"
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Maçı takvime ekle"
              style={styles.calendar}
            >
              <Ionicons name="calendar-outline" size={15} color={colors.brandAccent} />
            </Touchable>
          ) : awaiting ? (
            <Ionicons name="hourglass-outline" size={14} color={colors.warn} />
          ) : null}
        </View>
      )}
    </Touchable>
  );
});

const styles = StyleSheet.create({
  content: {
    paddingBottom: space.huge,
  },
  inset: {
    marginHorizontal: layout.screenPadding,
  },
  header: {
    paddingTop: space.md,
    gap: space.md,
  },
  chips: {},

  /* — Özet — */
  summary: {
    gap: space.md,
  },
  summaryTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
  },
  summaryTiles: {
    flex: 1,
    flexDirection: "row",
    gap: space.xs,
  },
  summaryCell: {
    flex: 1,
    alignItems: "center",
    paddingVertical: space.sm,
    borderRadius: radius.md,
    gap: space.xxs,
  },
  summaryValue: {
    ...type.metricSm,
    color: colors.textPrimary,
  },
  summaryLabel: {
    ...type.overline,
    color: colors.textTertiary,
  },
  summaryFoot: {
    flexDirection: "row",
    gap: space.lg,
  },
  footItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
  },
  footText: {
    ...type.caption,
    color: colors.textTertiary,
  },
  footStrong: {
    ...type.numSmStrong,
    color: colors.textPrimary,
  },

  /* — Ay başlığı (yapışkan) — */
  monthHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.s,
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.xl,
    paddingBottom: space.sm,
    backgroundColor: colors.bg,
  },
  monthTitle: {
    ...type.h3,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  monthCount: {
    marginLeft: "auto",
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs,
    borderRadius: radius.pill,
    backgroundColor: colors.surface3,
  },
  monthCountText: {
    ...type.micro,
    color: colors.textSecondary,
  },

  /* — Satır: grup kartının parçası — */
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.m,
    minHeight: ROW_HEIGHT,
    paddingVertical: space.sm,
    paddingLeft: space.md + 3,
    paddingRight: space.md,
    marginHorizontal: layout.screenPadding,
    backgroundColor: colors.surface1,
    borderLeftWidth: hairline,
    borderRightWidth: hairline,
    borderColor: colors.border,
    overflow: "hidden",
  },
  rowFirst: {
    borderTopWidth: hairline,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
  },
  rowDivided: {
    borderTopWidth: hairline,
    borderTopColor: colors.separator,
  },
  rowLast: {
    borderBottomWidth: hairline,
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
  },
  stripe: {
    position: "absolute",
    left: 0,
    top: space.m,
    bottom: space.m,
    width: 3,
    borderTopRightRadius: 3,
    borderBottomRightRadius: 3,
  },
  dateBlock: {
    width: 30,
    alignItems: "center",
  },
  dateDay: {
    ...type.scoreXs,
    color: colors.textPrimary,
  },
  dateMonth: {
    ...type.micro,
    color: colors.textTertiary,
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  opponent: {
    ...type.h4,
    color: colors.textPrimary,
  },
  rowMeta: {
    ...type.caption,
    color: colors.textTertiary,
  },
  timeBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  time: {
    ...type.scoreXs,
    color: colors.textPrimary,
  },
  timeLate: {
    color: colors.warn,
  },
  calendar: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brandDim,
  },
});
