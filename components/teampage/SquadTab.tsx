/**
 * 4) KADRO — mevkiye göre gruplu, sütunlu oyuncu listesi.
 *
 * ANATOMİ (skor uygulamalarının kadro tablosu):
 *
 *   ● ORTA SAHA · 26                         MAÇ  GOL  AST
 *   (◯) Doğukan YILDIRIM                      40   70    4
 *       Orta Saha · 7.4
 *
 *   - Avatar halkası mevki rengidir (theme/positions.ts); forma numarası
 *     biliniyorsa avatarın köşesinde.
 *   - Sayılar SÜTUNDUR, cümle değil. Eski satır "0 maç · 0 gol · 0 asist"
 *     yazıyordu: 116 satır boyunca aynı cümle, rakamlar hiç hizalanmıyordu.
 *     Sütunlu düzende göz aşağı doğru tarar ve en çok oynayanı bulur.
 *   - Grup içinde sıra: en çok maç → en çok gol → ad. Forma numarası çoğu
 *     oyuncuda girilmemiş; eski "forma no'ya göre" sıralama pratikte
 *     alfabetikti ve kadronun bel kemiği listenin ortasında kayboluyordu.
 *   - Bu sezon forma giymeyen oyuncunun sayıları sönük yazılır; sıfır bir
 *     bilgi değil, bir yokluktur.
 *
 * Üstte mevki çipleri (sayılarıyla): 116 kişilik bir kadroda "kalecilerimiz
 * kim?" sorusu tek dokunuşla cevaplanır. Dağılım çubuğu Genel sekmesinde;
 * burada çiplerin sayıları aynı bilgiyi taşıdığı için tekrar edilmez.
 */

import React, { useCallback, useMemo, useState } from "react";
import { ScrollView, SectionList, StyleSheet, Text, View } from "react-native";
import {
  Avatar,
  Chip,
  ChipGroup,
  EmptyState,
  RatingPill,
  SkeletonListRow,
  Touchable,
} from "@/components/ui";
import { colors, layout, radius, space, textScale, type, upperTR } from "@/theme";
import {
  cleanPosition,
  LINE_LABEL,
  LINE_ORDER,
  type GroupPosition,
  groupPosition,
  type PosLine,
  type SquadEntry,
  type TabShell,
} from "./model";
import { lineColor } from "./OverviewTab";

interface SquadSection {
  key: PosLine;
  title: string;
  data: SquadEntry[];
}

export interface SquadTabProps extends TabShell {
  squad: SquadEntry[];
  loading: boolean;
  seasonLabel: string;
  onOpenPlayer: (playerId: number) => void;
}

type LineFilter = PosLine | "ALL";

const AVATAR = 38;
const COL = 34;

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
    return LINE_ORDER.filter((line) => (groups.get(line)?.length ?? 0) > 0).map((line) => ({
      key: line,
      title: LINE_LABEL[line],
      data: (groups.get(line) ?? []).sort(
        (a, b) =>
          b.matches - a.matches ||
          b.goals - a.goals ||
          a.name.localeCompare(b.name, "tr-TR"),
      ),
    }));
  }, [squad, filter]);

  const renderItem = useCallback(
    ({ item, index, section }: { item: SquadEntry; index: number; section: SquadSection }) => (
      <SquadRow entry={item} position={groupPosition(index, section.data.length)} onPress={onOpenPlayer} />
    ),
    [onOpenPlayer],
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: SquadSection }) => <LineHeader line={section.key} count={section.data.length} />,
    [],
  );

  if (loading) {
    return (
      <ScrollView {...scrollProps} contentContainerStyle={styles.content}>
        <SkeletonListRow count={8} />
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
      keyExtractor={squadKey}
      renderItem={renderItem}
      renderSectionHeader={renderSectionHeader}
      stickySectionHeadersEnabled
      refreshControl={refreshControl}
      contentContainerStyle={styles.content}
      ListHeaderComponent={header}
      initialNumToRender={14}
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

const squadKey = (item: SquadEntry) => String(item.id);

/** Yapışkan mevki başlığı + sütun etiketleri — satırla AYNI sütun sabitleri. */
const LineHeader = React.memo(function LineHeader({ line, count }: { line: PosLine; count: number }) {
  return (
    <View style={styles.lineHeader}>
      <View style={[styles.lineDot, { backgroundColor: lineColor(line) }]} />
      <Text style={styles.lineTitle} numberOfLines={1} {...textScale.dense}>
        {upperTR(LINE_LABEL[line])}
      </Text>
      <Text style={styles.lineCount} {...textScale.dense}>
        {count}
      </Text>
      <View style={styles.cols}>
        {["MAÇ", "GOL", "AST"].map((label) => (
          <Text key={label} style={styles.colHead} {...textScale.badge}>
            {label}
          </Text>
        ))}
      </View>
    </View>
  );
});

const SquadRow = React.memo(function SquadRow({
  entry,
  position,
  onPress,
}: {
  entry: SquadEntry;
  position: GroupPosition;
  onPress: (playerId: number) => void;
}) {
  const handlePress = useCallback(() => onPress(entry.id), [onPress, entry.id]);
  const played = entry.matches > 0;
  const positionText = cleanPosition(entry.position);
  const ring = lineColor(entry.line);

  return (
    <Touchable
      feedback="row"
      haptic="selection"
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`${entry.name}${positionText ? `, ${positionText}` : ""}${entry.jersey ? `, ${entry.jersey} numara` : ""}, ${entry.matches} maç, ${entry.goals} gol, ${entry.assists} asist`}
      style={[
        styles.row,
        position === "first" || position === "single" ? styles.rowFirst : styles.rowDivided,
        position === "last" || position === "single" ? styles.rowLast : null,
      ]}
    >
      <View style={[styles.ring, { borderColor: ring }]}>
        <Avatar name={entry.name} image={entry.image} size={AVATAR} jersey={entry.jersey} />
      </View>
      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={1} {...textScale.dense}>
          {entry.name}
        </Text>
        <View style={styles.subRow}>
          <Text style={styles.sub} numberOfLines={1} {...textScale.dense}>
            {positionText || (played ? "Mevki girilmemiş" : "Bu sezon forma giymedi")}
          </Text>
          <RatingPill value={entry.rating} size="sm" hideEmpty />
        </View>
      </View>
      <View style={styles.cols}>
        <Text style={[styles.num, played ? null : styles.numMuted]} {...textScale.dense}>
          {entry.matches}
        </Text>
        <Text style={[styles.num, entry.goals > 0 ? styles.numStrong : styles.numMuted]} {...textScale.dense}>
          {entry.goals}
        </Text>
        <Text style={[styles.num, entry.assists > 0 ? null : styles.numMuted]} {...textScale.dense}>
          {entry.assists}
        </Text>
      </View>
    </Touchable>
  );
});

const styles = StyleSheet.create({
  content: {
    paddingBottom: space.huge,
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
    paddingHorizontal: layout.screenPadding + space.md,
    paddingTop: space.lg,
    paddingBottom: space.sm,
    backgroundColor: colors.bg,
  },
  lineDot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
  },
  lineTitle: {
    ...type.overline,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  lineCount: {
    ...type.tableNum,
    color: colors.textTertiary,
  },
  cols: {
    marginLeft: "auto",
    flexDirection: "row",
  },
  colHead: {
    ...type.micro,
    color: colors.textTertiary,
    width: COL,
    textAlign: "center",
  },

  /* — Satır: grup kartının parçası, köşeler konuma göre — */
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.m,
    minHeight: 62,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    marginHorizontal: layout.screenPadding,
    backgroundColor: colors.surface1,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  rowFirst: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
  },
  rowDivided: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
  },
  rowLast: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
  },
  ring: {
    width: AVATAR + 6,
    height: AVATAR + 6,
    borderRadius: radius.pill,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  body: {
    flex: 1,
    minWidth: 0,
    gap: space.xxs,
  },
  name: {
    ...type.h4,
    color: colors.textPrimary,
  },
  subRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.s,
  },
  sub: {
    ...type.caption,
    color: colors.textTertiary,
    flexShrink: 1,
  },
  num: {
    ...type.tableNum,
    color: colors.textPrimary,
    width: COL,
    textAlign: "center",
  },
  numStrong: {
    ...type.tableNumStrong,
  },
  /* Sıfır sönük ama OKUNUR: textDisabled kâğıtta 2,4:1 kalıyordu. */
  numMuted: {
    color: colors.textTertiary,
  },
});
