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
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useCallback, useMemo, useState } from "react";
import { ScrollView, SectionList, StyleSheet, Text, View } from "react-native";
import {
  Card,
  Chip,
  ChipGroup,
  EmptyState,
  MatchCard,
  SectionHeader,
  SkeletonMatchRow,
  Touchable,
} from "@/components/ui";
import type { ApiMatch } from "@/lib/types";
import { colors, layout, radius, space, textScale, type } from "@/theme";
import {
  buildRecords,
  monthHeading,
  type LogoFor,
  type TabShell,
} from "./model";
import { StackedBar } from "./StackedBar";

interface MatchSection {
  key: string;
  title: string;
  /** Bu gruptaki maçlar takvime eklenebilir mi (gecikmiş grup hayır). */
  calendar: boolean;
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
      out.push({ key: "awaiting", title: "Sonucu bekleniyor", calendar: false, data: filteredAwaiting });
    }
    for (const match of filtered) {
      const title = monthHeading(match.date);
      const last = out[out.length - 1];
      if (last && last.key === `m:${title}`) last.data.push(match);
      else out.push({ key: `m:${title}`, title, calendar: fixtures, data: [match] });
    }
    return out;
  }, [filtered, filteredAwaiting, fixtures]);

  const records = useMemo(
    () => (fixtures ? null : buildRecords(filtered, teamId, teamName)),
    [fixtures, filtered, teamId, teamName],
  );

  const renderItem = useCallback(
    ({ item, section }: { item: ApiMatch; section: MatchSection }) => (
      <FixtureListItem
        match={item}
        homeLogo={logoFor(item.home_team_id, item.first_team_name)}
        awayLogo={logoFor(item.away_team_id, item.second_team_name)}
        showCalendar={section.calendar}
        teamId={teamId}
        teamName={teamName}
        onOpen={onOpenMatch}
        onAddCalendar={onAddCalendar}
      />
    ),
    [logoFor, onOpenMatch, onAddCalendar, teamId, teamName],
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: MatchSection }) => (
      <SectionHeader
        title={section.title}
        meta={`${section.data.length} maç`}
        size="group"
        sticky
        uppercase={false}
      />
    ),
    [],
  );

  if (loading) {
    return (
      <ScrollView {...scrollProps} contentContainerStyle={styles.content}>
        <SkeletonMatchRow count={6} />
      </ScrollView>
    );
  }

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
          <View style={styles.summaryRow}>
            <SummaryCell value={records.total.played} label="Maç" />
            <SummaryCell value={records.total.wins} label="Galibiyet" color={colors.win} />
            <SummaryCell value={records.total.draws} label="Beraberlik" color={colors.draw} />
            <SummaryCell value={records.total.losses} label="Mağlubiyet" color={colors.loss} />
          </View>
          <StackedBar
            segments={[
              { key: "w", value: records.total.wins, color: colors.win },
              { key: "d", value: records.total.draws, color: colors.draw },
              { key: "l", value: records.total.losses, color: colors.loss },
            ]}
          />
          <Text style={styles.summaryFoot} {...textScale.dense}>
            {records.total.goalsFor} gol attı · {records.total.goalsAgainst} gol yedi
          </Text>
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
}: {
  value: number;
  label: string;
  color?: string;
}) {
  return (
    <View style={styles.summaryCell} accessible accessibilityLabel={`${value} ${label.toLocaleLowerCase("tr-TR")}`}>
      <View style={styles.summaryLabelRow}>
        {color ? <View style={[styles.dot, { backgroundColor: color }]} /> : null}
        <Text style={styles.summaryValue} {...textScale.dense}>
          {value}
        </Text>
      </View>
      <Text style={styles.summaryLabel} numberOfLines={1} {...textScale.badge}>
        {label.toLocaleUpperCase("tr-TR")}
      </Text>
    </View>
  );
});

/**
 * Satır sarmalayıcı. VARLIK NEDENİ: `MatchCard` memo'lu ama `onPress` her
 * render'da yeniden üretilse memo işe yaramaz; işleyiciler burada maç id'sine
 * bağlanır, dışarıdan yalnız ilkel değerler ve sabit fonksiyonlar geçer.
 */
const FixtureListItem = React.memo(function FixtureListItem({
  match,
  homeLogo,
  awayLogo,
  showCalendar,
  teamId,
  teamName,
  onOpen,
  onAddCalendar,
}: {
  match: ApiMatch;
  homeLogo: string | null;
  awayLogo: string | null;
  showCalendar: boolean;
  teamId: number;
  teamName: string;
  onOpen: (matchId: number) => void;
  onAddCalendar: (match: ApiMatch) => void;
}) {
  const handleOpen = useCallback(() => onOpen(Number(match.id)), [onOpen, match.id]);
  const handleCalendar = useCallback(() => onAddCalendar(match), [onAddCalendar, match]);

  return (
    <MatchCard
      match={match}
      homeLogo={homeLogo}
      awayLogo={awayLogo}
      meta="league"
      showDate
      showVenue
      highlightTeamId={teamId}
      highlightTeamName={teamName}
      onPress={handleOpen}
      style={styles.matchCard}
      footer={
        showCalendar ? (
          <Touchable
            style={styles.calendarAction}
            onPress={handleCalendar}
            feedback="icon"
            haptic="light"
            accessibilityRole="button"
            accessibilityLabel="Maçı takvime ekle"
          >
            <Ionicons name="calendar-outline" size={16} color={colors.brandAccent} />
            <Text style={styles.calendarActionText}>Takvime ekle</Text>
          </Touchable>
        ) : undefined
      }
    />
  );
});

const styles = StyleSheet.create({
  content: {
    paddingBottom: space.huge,
  },
  header: {
    paddingTop: space.md,
    gap: space.md,
  },
  chips: {
    flexGrow: 0,
  },
  inset: {
    marginHorizontal: layout.screenPadding,
  },
  summary: {
    gap: space.md,
  },
  summaryRow: {
    flexDirection: "row",
  },
  summaryCell: {
    flex: 1,
    gap: 1,
  },
  summaryValue: {
    ...type.metricSm,
    color: colors.textPrimary,
  },
  summaryLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.s,
  },
  summaryLabel: {
    ...type.micro,
    color: colors.textTertiary,
    flexShrink: 1,
  },
  summaryFoot: {
    ...type.caption,
    color: colors.textTertiary,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
  },
  matchCard: {
    marginHorizontal: layout.screenPadding,
    marginBottom: space.m,
  },
  calendarAction: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.s,
    height: 28,
  },
  calendarActionText: {
    ...type.label,
    color: colors.brandAccent,
  },
});
