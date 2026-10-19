/**
 * İSTATİSTİK SEKMESİ — iki takımın sayıları karşılıklı barlarda.
 *
 * DÜZEN: tek kart. Tepede takım cetveli (hangi renk hangi takım), altında üç
 * grup — Hücum · Mücadele · Disiplin — grup adları kartın içinde ince versal
 * birer etiket. Kartın altında "En iyi oyuncular".
 *
 * NEDEN GRUPLU: on iki satırı düz sıralamak hepsini eşit önemde gösteren bir
 * döküm üretiyordu; okuyucu "bu takım nerede iyi" sorusunu ancak tek tek
 * karşılaştırarak yanıtlayabiliyordu. Grup adı soruyu kendisi sorar.
 *
 * NEDEN BU ÜÇ GRUP: sunucunun gerçekten tuttuğu olay kodları bu üç aileye
 * ayrılıyor. TOPLA OYNAMA YÜZDESİ VE xG BİLEREK YOK — şemada karşılıkları
 * bulunmuyor ve uydurulmuş bir yüzde, gerçek verinin yanında duran sahte bir
 * sayı olurdu. Tanınmayan kodlar "Mücadele"ye düşer: sunucuya yeni bir olay
 * kodu eklendiğinde ekran onu sessizce yutmaz.
 *
 * SIFIR SATIRLAR ELENİR — "Kırmızı kart 0–0" barı hiçbir şey söylemez. Goller
 * tek istisnadır: 0–0 da bir sonuçtur.
 */

import { useRouter } from "expo-router";
import React, { memo, useCallback, useMemo } from "react";
import { Animated, StyleSheet, Text, View, type RefreshControlProps } from "react-native";

import { Avatar, EmptyState, RatingPill, SectionHeader, StatBar, Touchable } from "@/components/ui";
import { colors, hairline, space, textScale, type, upperTR } from "@/theme";
import type { StatRow, TopPlayer } from "@/lib/matchStats";
import type { ApiMatch, MatchState } from "@/lib/types";
import { PaperCard, TeamLegend } from "./parts";
import { statLabel, type ScrollChrome } from "./shared";

const STAT_GROUPS: { title: string; labels: string[] }[] = [
  { title: "Hücum", labels: ["Goller", "Asistler", "Fırsat Yarat."] },
  { title: "Mücadele", labels: ["Kurtarışlar", "Kritik Blok", "Hava Topu", "İkili Müc."] },
  { title: "Disiplin", labels: ["Fauller", "Sarı Kart", "Kırmızı Kart", "Sakatlık", "Değişiklik"] },
];

interface StatSection {
  title: string;
  data: StatRow[];
}

export interface StatsTabProps {
  match: ApiMatch;
  state: MatchState;
  statRows: StatRow[];
  bestPlayers: TopPlayer[];
  homeLogo: string | null;
  awayLogo: string | null;
  scrollProps: ScrollChrome;
  refreshControl: React.ReactElement<RefreshControlProps>;
}

export function StatsTab({
  match,
  state,
  statRows,
  bestPlayers,
  homeLogo,
  awayLogo,
  scrollProps,
  refreshControl,
}: StatsTabProps) {
  const router = useRouter();

  const sections = useMemo<StatSection[]>(() => {
    const byLabel = new Map(statRows.map((row) => [row.label, row]));
    const known = new Set(STAT_GROUPS.flatMap((group) => group.labels));
    const unknown = statRows.filter((row) => !known.has(row.label));
    const keep = (row: StatRow) => row.label === "Goller" || row.home > 0 || row.away > 0;

    return STAT_GROUPS.map((group) => {
      const rows = group.labels
        .map((label) => byLabel.get(label))
        .filter((row): row is StatRow => row != null);
      const data = (group.title === "Mücadele" ? [...rows, ...unknown] : rows).filter(keep);
      return { title: group.title, data };
    }).filter((section) => section.data.length > 0);
  }, [statRows]);

  const openPlayer = useCallback((playerId: number) => router.push(`/oyuncu/${playerId}`), [router]);

  /* Oynanmamış maçın istatistiği olamaz; boş kart yerine ne zaman geleceğini söyle. */
  if (state === "scheduled") {
    return (
      <EmptyState
        icon="stats-chart-outline"
        title="Maç henüz oynanmadı"
        body="Maç başladığında goller, kurtarışlar ve kartlar burada iki takım karşılaştırmalı görünür."
      />
    );
  }

  /* Yalnız "Goller" satırı varsa (çoğu amatör maç) bölümler yine de anlamlı:
     gol karşılaştırması tek başına da bir istatistiktir. */
  const onlyGoals = sections.length === 1 && sections[0].data.length === 1;

  return (
    <Animated.ScrollView {...scrollProps} refreshControl={refreshControl} contentContainerStyle={styles.content}>
      <PaperCard>
        <TeamLegend
          homeName={match.first_team_name}
          awayName={match.second_team_name}
          homeLogo={homeLogo}
          awayLogo={awayLogo}
        />
        {sections.map((section) => (
          <View key={section.title} style={styles.group}>
            <Text style={styles.groupTitle} {...textScale.badge}>
              {upperTR(section.title)}
            </Text>
            {section.data.map((row) => (
              <StatBar key={row.label} label={statLabel(row.label)} home={row.home} away={row.away} />
            ))}
          </View>
        ))}
        {onlyGoals ? (
          <Text style={styles.note} {...textScale.dense}>
            Bu maç için yalnız goller girilmiş. Kurtarış, fırsat ve kart kayıtları girildikçe burada çıkar.
          </Text>
        ) : null}
      </PaperCard>

      {bestPlayers.length ? (
        <>
          <SectionHeader title="En iyi oyuncular" meta="reytinge göre" />
          <PaperCard>
            {bestPlayers.map((player, index) => (
              <TopPlayerRow key={player.playerId} player={player} rank={index + 1} onOpen={openPlayer} />
            ))}
          </PaperCard>
        </>
      ) : null}
    </Animated.ScrollView>
  );
}

const TopPlayerRow = memo(function TopPlayerRow({
  player,
  rank,
  onOpen,
}: {
  player: TopPlayer;
  rank: number;
  onOpen: (playerId: number) => void;
}) {
  const open = useCallback(() => onOpen(player.playerId), [onOpen, player.playerId]);
  const meta = [
    player.goals ? `${player.goals} gol` : null,
    player.assists ? `${player.assists} asist` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Touchable
      feedback="row"
      haptic="selection"
      onPress={open}
      style={[styles.topRow, rank > 1 ? styles.ruled : null]}
      accessibilityRole="button"
      accessibilityLabel={`${rank}. ${player.name}${meta ? `, ${meta}` : ""}`}
    >
      <Text style={[styles.rank, rank === 1 ? styles.rankFirst : null]} {...textScale.dense}>
        {rank}
      </Text>
      <Avatar name={player.name} image={player.image} size={36} />
      <View style={styles.topTexts}>
        <Text style={styles.topName} numberOfLines={1} {...textScale.dense}>
          {player.name}
        </Text>
        <Text style={styles.topMeta} numberOfLines={1} {...textScale.dense}>
          {meta || "Katkı kaydı yok"}
        </Text>
      </View>
      <RatingPill value={player.rating} size="md" best={rank === 1} />
    </Touchable>
  );
});

const styles = StyleSheet.create({
  content: {
    paddingTop: space.lg,
    paddingBottom: space.huge * 2,
  },
  ruled: {
    borderTopWidth: hairline,
    borderTopColor: colors.separator,
  },
  group: {
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.xs,
    borderTopWidth: hairline,
    borderTopColor: colors.separator,
  },
  groupTitle: {
    ...type.overline,
    color: colors.textTertiary,
    paddingBottom: space.xxs,
  },
  note: {
    ...type.bodySm,
    color: colors.textTertiary,
    paddingHorizontal: space.lg,
    paddingBottom: space.lg,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.m,
    minHeight: 64,
    paddingHorizontal: space.lg,
  },
  rank: {
    ...type.tableNumStrong,
    color: colors.textTertiary,
    width: 16,
    textAlign: "center",
  },
  rankFirst: {
    color: colors.textPrimary,
  },
  topTexts: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  topName: {
    ...type.h3,
    color: colors.textPrimary,
  },
  topMeta: {
    ...type.caption,
    color: colors.textTertiary,
  },
});
