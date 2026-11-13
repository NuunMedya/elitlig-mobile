/**
 * 4) KADRO — mevkiye göre gruplu oyuncu KART IZGARASI.
 *
 * İKİNCİ TUR: sütunlu satır listesi iki sütunlu kart ızgarasına döndü.
 * Kadro bir "takım fotoğrafı"dır; satır tablosu bunu bir hesap dökümüne
 * çeviriyordu. Her kart:
 *
 *   ┌────────────────────┐
 *   │ 10            FOR  │   forma no (silik, iri) · mevki rozeti
 *   │      ( foto )      │   mevki renginde halka
 *   │  Doğukan YILDIRIM  │
 *   │     Orta Saha      │
 *   │  40    70    4     │   MAÇ · GOL · AST (sezon)
 *   └────────────────────┘
 *
 * - Grup başlığı yapışkandır: mevki renginde şerit + ad + sayı.
 * - Grup içinde sıra: en çok maç → en çok gol → ad (eski kurala sadık).
 * - Bu sezon forma giymeyen oyuncunun kartı sönük; sıfır bir yokluktur.
 * - Üstte mevki çipleri (sayılarıyla) filtre olarak kalır.
 */

import React, { useCallback, useMemo, useState } from "react";
import { ScrollView, SectionList, StyleSheet, Text, View } from "react-native";
import {
  Avatar,
  Chip,
  ChipGroup,
  EmptyState,
  RatingPill,
  Reveal,
  Skeleton,
  Touchable,
} from "@/components/ui";
import { colors, hairline, layout, radius, space, textScale, type } from "@/theme";
import {
  cleanPosition,
  LINE_LABEL,
  LINE_ORDER,
  LINE_SHORT,
  type PosLine,
  type SquadEntry,
  type TabShell,
} from "./model";
import { lineColor } from "./OverviewTab";

/** Izgara satırı: iki kart (son satırda tek kart kalabilir). */
interface SquadPair {
  key: string;
  items: SquadEntry[];
  /** Grup içindeki satır sırası — ilk satırlar `Reveal` ile gelir. */
  row: number;
}

interface SquadSection {
  key: PosLine;
  title: string;
  count: number;
  data: SquadPair[];
}

export interface SquadTabProps extends TabShell {
  squad: SquadEntry[];
  loading: boolean;
  seasonLabel: string;
  onOpenPlayer: (playerId: number) => void;
}

type LineFilter = PosLine | "ALL";

const AVATAR = 56;

export function SquadTab({ scrollProps, refreshControl, squad, loading, seasonLabel, onOpenPlayer }: SquadTabProps) {
  const [filter, setFilter] = useState<LineFilter>("ALL");

  const counts = useMemo(() => {
    const out: Record<PosLine, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0, OTHER: 0 };
    for (const entry of squad) out[entry.line] += 1;
    return out;
  }, [squad]);

  const sections = useMemo<SquadSection[]>(() => {
    const groups = new Map<PosLine, SquadEntry[]>();
    for (const entry of squad) {
      if (filter !== "ALL" && entry.line !== filter) continue;
      const list = groups.get(entry.line) ?? [];
      list.push(entry);
      groups.set(entry.line, list);
    }
    return LINE_ORDER.filter((line) => (groups.get(line)?.length ?? 0) > 0).map((line) => {
      const sorted = (groups.get(line) ?? []).sort(
        (a, b) => b.matches - a.matches || b.goals - a.goals || a.name.localeCompare(b.name, "tr-TR"),
      );
      const pairs: SquadPair[] = [];
      for (let index = 0; index < sorted.length; index += 2) {
        const items = sorted.slice(index, index + 2);
        pairs.push({ key: items.map((item) => item.id).join("-"), items, row: index / 2 });
      }
      return { key: line, title: LINE_LABEL[line], count: sorted.length, data: pairs };
    });
  }, [squad, filter]);

  const renderItem = useCallback(
    ({ item }: { item: SquadPair }) => (
      <View style={styles.pair}>
        {item.items.map((entry, index) => (
          <Reveal key={entry.id} index={item.row * 2 + index} style={styles.cell}>
            <SquadCard entry={entry} onPress={onOpenPlayer} />
          </Reveal>
        ))}
        {item.items.length === 1 ? <View style={styles.cell} /> : null}
      </View>
    ),
    [onOpenPlayer],
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: SquadSection }) => <LineHeader line={section.key} count={section.count} />,
    [],
  );

  if (loading) {
    return (
      <ScrollView {...scrollProps} contentContainerStyle={[styles.content, styles.skeleton]}>
        {[0, 1, 2].map((row) => (
          <View key={row} style={styles.pair}>
            <Skeleton height={196} radius="xl" style={styles.cell} />
            <Skeleton height={196} radius="xl" style={styles.cell} />
          </View>
        ))}
      </ScrollView>
    );
  }

  const header =
    squad.length > 0 ? (
      <View style={styles.header}>
        <ChipGroup>
          <Chip label="Tümü" selected={filter === "ALL"} onPress={() => setFilter("ALL")} count={squad.length} />
          {LINE_ORDER.filter((line) => counts[line] > 0).map((line) => (
            <Chip
              key={line}
              label={line === "OTHER" ? "Belirtilmemiş" : LINE_LABEL[line]}
              selected={filter === line}
              onPress={() => setFilter(line)}
              count={counts[line]}
            />
          ))}
        </ChipGroup>
        {seasonLabel ? (
          <Text style={styles.hint} {...textScale.dense}>
            Maç, gol ve asist {seasonLabel} kaydından; puan son maç kadrolarının ortalaması.
          </Text>
        ) : null}
      </View>
    ) : null;

  return (
    <SectionList
      {...scrollProps}
      sections={sections}
      keyExtractor={pairKey}
      renderItem={renderItem}
      renderSectionHeader={renderSectionHeader}
      stickySectionHeadersEnabled
      refreshControl={refreshControl}
      contentContainerStyle={styles.content}
      ListHeaderComponent={header}
      initialNumToRender={8}
      ListEmptyComponent={
        <EmptyState
          icon="shirt-outline"
          title="Kadro verisi yok"
          body="Bu takım için oyuncu kaydı bulunmuyor. Üstteki seçiciden takımın oynadığı lig ve sezonu seçmeyi deneyebilirsin."
          variant="inline"
        />
      }
      showsVerticalScrollIndicator={false}
    />
  );
}

const pairKey = (item: SquadPair) => item.key;

/** Yapışkan mevki başlığı — mevki renginde şerit, ad, sayı. */
const LineHeader = React.memo(function LineHeader({ line, count }: { line: PosLine; count: number }) {
  const color = lineColor(line);
  return (
    <View style={styles.lineHeader}>
      <View style={[styles.lineStripe, { backgroundColor: color }]} />
      <Text style={styles.lineTitle} numberOfLines={1} {...textScale.dense}>
        {LINE_LABEL[line]}
      </Text>
      {line !== "OTHER" ? (
        <View style={[styles.lineCode, { borderColor: color }]}>
          <Text style={[styles.lineCodeText, { color }]} {...textScale.badge}>
            {LINE_SHORT[line]}
          </Text>
        </View>
      ) : null}
      <Text style={styles.lineCount} {...textScale.dense}>
        {count} oyuncu
      </Text>
    </View>
  );
});

const SquadCard = React.memo(function SquadCard({
  entry,
  onPress,
}: {
  entry: SquadEntry;
  onPress: (playerId: number) => void;
}) {
  const handlePress = useCallback(() => onPress(entry.id), [onPress, entry.id]);
  const played = entry.matches > 0;
  const positionText = cleanPosition(entry.position);
  const ring = lineColor(entry.line);

  return (
    <Touchable
      feedback="card"
      haptic="selection"
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`${entry.name}${positionText ? `, ${positionText}` : ""}${entry.jersey ? `, ${entry.jersey} numara` : ""}, ${entry.matches} maç, ${entry.goals} gol, ${entry.assists} asist`}
      style={[styles.card, played ? null : styles.cardIdle]}
    >
      <View style={[styles.cardGlow, { backgroundColor: ring }]} />
      <View style={styles.cardTop}>
        <Text style={styles.jersey} {...textScale.badge}>
          {entry.jersey != null ? entry.jersey : ""}
        </Text>
        {entry.line !== "OTHER" ? (
          <View style={[styles.posChip, { backgroundColor: ring }]}>
            <Text style={styles.posChipText} {...textScale.badge}>
              {LINE_SHORT[entry.line]}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={[styles.ring, { borderColor: ring }]}>
        <Avatar name={entry.name} image={entry.image} size={AVATAR} />
      </View>

      <View style={styles.identity}>
        <Text style={styles.name} numberOfLines={2} {...textScale.dense}>
          {entry.name}
        </Text>
        <View style={styles.subRow}>
          <Text style={styles.sub} numberOfLines={1} {...textScale.dense}>
            {positionText || (played ? "Mevki girilmemiş" : "Bu sezon oynamadı")}
          </Text>
          <RatingPill value={entry.rating} size="sm" hideEmpty />
        </View>
      </View>

      <View style={styles.stats}>
        <CardStat value={entry.matches} label="MAÇ" muted={!played} />
        <View style={styles.statDivider} />
        <CardStat value={entry.goals} label="GOL" strong={entry.goals > 0} muted={entry.goals === 0} />
        <View style={styles.statDivider} />
        <CardStat value={entry.assists} label="AST" muted={entry.assists === 0} />
      </View>
    </Touchable>
  );
});

function CardStat({ value, label, strong, muted }: { value: number; label: string; strong?: boolean; muted?: boolean }) {
  return (
    <View style={styles.stat}>
      <Text
        style={[styles.statValue, strong ? styles.statStrong : null, muted ? styles.statMuted : null]}
        {...textScale.dense}
      >
        {value}
      </Text>
      <Text style={styles.statLabel} {...textScale.badge}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: space.huge,
  },
  skeleton: {
    paddingTop: space.lg,
    gap: space.sm,
  },
  header: {
    paddingTop: space.md,
    gap: space.md,
    paddingBottom: space.xs,
  },
  hint: {
    ...type.caption,
    color: colors.textTertiary,
    paddingHorizontal: layout.screenPadding,
  },

  /* — Mevki başlığı (yapışkan): opak kâğıt zemin — */
  lineHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.lg,
    paddingBottom: space.sm,
    backgroundColor: colors.bg,
  },
  lineStripe: {
    width: 4,
    height: 18,
    borderRadius: 2,
  },
  lineTitle: {
    ...type.h2,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  lineCode: {
    paddingHorizontal: space.s,
    paddingVertical: 1,
    borderRadius: radius.xs,
    borderWidth: 1,
  },
  lineCodeText: {
    ...type.micro,
  },
  lineCount: {
    ...type.caption,
    color: colors.textTertiary,
    marginLeft: "auto",
  },

  /* — Izgara — */
  pair: {
    flexDirection: "row",
    gap: space.sm,
    paddingHorizontal: layout.screenPadding,
    marginBottom: space.sm,
  },
  cell: {
    flex: 1,
    minWidth: 0,
  },
  card: {
    alignItems: "center",
    paddingTop: space.sm,
    paddingBottom: space.md,
    paddingHorizontal: space.md,
    gap: space.sm,
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
    overflow: "hidden",
  },
  cardIdle: {
    opacity: 0.72,
  },
  /* Kartın tepesinde mevki renginde ince ışık. */
  cardGlow: {
    position: "absolute",
    top: 0,
    left: space.xl,
    right: space.xl,
    height: 3,
    borderBottomLeftRadius: 3,
    borderBottomRightRadius: 3,
  },
  cardTop: {
    alignSelf: "stretch",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 20,
  },
  jersey: {
    ...type.scoreSm,
    color: colors.textTertiary,
  },
  posChip: {
    paddingHorizontal: space.s,
    paddingVertical: 1,
    borderRadius: radius.pill,
  },
  posChipText: {
    ...type.micro,
    color: colors.textOnStatus,
  },
  ring: {
    width: AVATAR + 8,
    height: AVATAR + 8,
    borderRadius: radius.pill,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    marginTop: -space.sm,
  },
  identity: {
    alignSelf: "stretch",
    alignItems: "center",
    gap: space.xxs,
    minHeight: 54,
  },
  name: {
    ...type.h4,
    color: colors.textPrimary,
    textAlign: "center",
  },
  subRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
  },
  sub: {
    ...type.caption,
    color: colors.textTertiary,
    flexShrink: 1,
  },
  stats: {
    alignSelf: "stretch",
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: space.s,
    borderRadius: radius.md,
    backgroundColor: colors.surface2,
  },
  statDivider: {
    width: hairline,
    alignSelf: "stretch",
    backgroundColor: colors.separator,
  },
  stat: {
    flex: 1,
    alignItems: "center",
  },
  statValue: {
    ...type.tableNumStrong,
    color: colors.textPrimary,
  },
  statStrong: {
    color: colors.brandAccent,
  },
  /* Sıfır sönük ama OKUNUR: textDisabled kâğıtta 2,4:1 kalıyordu. */
  statMuted: {
    color: colors.textTertiary,
  },
  statLabel: {
    ...type.overline,
    color: colors.textTertiary,
  },
});
