/**
 * "Gol videoları" şeridi (maç sayfası ve oyuncu profili). Canlı yayında
 * kaydedilen gol klipleri: kapak, dakika, iki satır yazı; dokununca tam ekran
 * oynatıcı açılır. Klip yoksa (ya da uç henüz yoksa) hiçbir şey çizilmez.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import React, { memo, useCallback, useMemo, useState } from "react";
import { FlatList, Image, StyleSheet, Text, View } from "react-native";

import { SectionHeader, TeamLogo, Touchable } from "@/components/ui";
import { clipLabel, listGoalClips, type GoalClip } from "@/lib/live/clips";
import { RIG } from "@/lib/live/rig";
import { formatDuration } from "@/lib/matchMedia";
import { colors, fonts, layout, radius, space, textScale, type } from "@/theme";

/** Maçın gol klipleri, dakika sırasıyla. Aynı sorgu anahtarı: şerit ve "Maçın golü" kartı tek istek paylaşır. */
export function useMatchGoalClips(matchId: number, live?: boolean, enabled = true): GoalClip[] {
  const query = useQuery({
    queryKey: ["goal-clips", "match", matchId],
    queryFn: () => listGoalClips({ match_id: matchId }),
    enabled: enabled && Number.isFinite(matchId) && matchId > 0,
    staleTime: live ? 20_000 : 5 * 60_000,
    refetchInterval: live ? 30_000 : false,
  });
  return useMemo(
    () => [...(query.data ?? [])].sort((a, b) => (Number(a.period) || 1) - (Number(b.period) || 1) || (Number(a.minute) || 0) - (Number(b.minute) || 0)),
    [query.data]
  );
}

/** Takım kimliği → arma ve ad (şeritteki kartlar için, isteğe bağlı). */
export interface ClipTeams {
  homeTeamId: number | null;
  awayTeamId: number | null;
  homeName?: string | null;
  awayName?: string | null;
  homeLogo?: string | null;
  awayLogo?: string | null;
}

/** Şeritteki bir kart: klip + iki satır yazı (+ isteğe bağlı arma). */
export interface ClipStripItem {
  clip: GoalClip;
  title: string;
  sub: string;
  team?: { name: string | null; logo: string | null } | null;
}

const CARD_WIDTH = 168;
const stripKey = (item: ClipStripItem) => String(item.clip.id);
const stripLayout = (_data: ArrayLike<ClipStripItem> | null | undefined, index: number) => ({
  length: CARD_WIDTH + space.sm,
  offset: (CARD_WIDTH + space.sm) * index,
  index,
});

/**
 * "Gol videoları" şeridi — yalnız kapak kartları (oynatıcı İÇERMEZ; dokununca
 * `onOpen` ile üst bileşendeki tam ekran oynatıcı açılır). Yatay liste
 * sanaldır: gol sayısı çok olan maçta kapakların hepsi birden çözülmez.
 */
export const GoalClipStrip = memo(function GoalClipStrip({
  items,
  onOpen,
  title = "Gol videoları",
  meta,
}: {
  items: ClipStripItem[];
  onOpen: (clipId: number) => void;
  title?: string;
  meta?: string;
}) {
  const renderItem = useCallback(
    ({ item }: { item: ClipStripItem }) => <ClipCard item={item} onOpen={onOpen} />,
    [onOpen],
  );
  if (!items.length) return null;
  return (
    <View style={styles.wrap}>
      <SectionHeader title={title} meta={meta ?? `${items.length} video`} />
      <FlatList
        horizontal
        data={items}
        keyExtractor={stripKey}
        renderItem={renderItem}
        getItemLayout={stripLayout}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.strip}
        initialNumToRender={3}
        maxToRenderPerBatch={3}
        windowSize={5}
      />
    </View>
  );
});

const ClipCard = memo(function ClipCard({ item, onOpen }: { item: ClipStripItem; onOpen: (clipId: number) => void }) {
  const { clip, team } = item;
  const [posterFailed, setPosterFailed] = useState(false);
  const duration = formatDuration(clip.duration_ms);
  const open = useCallback(() => onOpen(clip.id), [onOpen, clip.id]);
  return (
    <Touchable
      style={styles.card}
      onPress={open}
      haptic="light"
      accessibilityRole="button"
      accessibilityLabel={`${clipLabel(clip)} ${item.title} videosunu izle`}
    >
      <View style={styles.thumb}>
        {clip.poster_url && !posterFailed ? (
          <Image
            source={{ uri: clip.poster_url }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
            resizeMethod="resize"
            onError={() => setPosterFailed(true)}
          />
        ) : null}
        <View style={styles.play}>
          <Ionicons name="play" size={16} color={colors.textOnBrand} />
        </View>
        {clip.minute != null ? (
          <View style={styles.minute}>
            <Text style={styles.minuteText} {...textScale.badge}>
              {`${clip.minute}'`}
            </Text>
          </View>
        ) : null}
        {duration ? (
          <View style={styles.duration}>
            <Text style={styles.durationText} {...textScale.badge}>
              {duration}
            </Text>
          </View>
        ) : null}
      </View>
      <View style={styles.body}>
        {team ? <TeamLogo name={team.name} logo={team.logo} size={22} /> : null}
        <View style={styles.flex}>
          <Text style={styles.title} numberOfLines={1} {...textScale.dense}>
            {item.title}
          </Text>
          <Text style={styles.sub} numberOfLines={1} {...textScale.dense}>
            {item.sub}
          </Text>
        </View>
      </View>
    </Touchable>
  );
});

/** Maç sayfası şeridi: kartta golcü ve takımı. Oynatıcı üst bileşendedir (SummaryTab). */
export const MatchGoalClips = memo(function MatchGoalClips({
  clips,
  nameOf,
  teams,
  onOpen,
}: {
  clips: GoalClip[];
  nameOf: (playerId?: number | null) => string | null;
  teams?: ClipTeams;
  onOpen: (clipId: number) => void;
}) {
  const items = useMemo<ClipStripItem[]>(
    () =>
      clips.map((clip) => {
        const team =
          !teams || clip.team_id == null
            ? null
            : Number(clip.team_id) === teams.homeTeamId
              ? { name: teams.homeName ?? null, logo: teams.homeLogo ?? null }
              : Number(clip.team_id) === teams.awayTeamId
                ? { name: teams.awayName ?? null, logo: teams.awayLogo ?? null }
                : null;
        return {
          clip,
          team,
          title: nameOf(clip.player_id) ?? clipLabel(clip),
          sub: [clip.own_goal ? "Kendi kalesine" : null, team?.name].filter(Boolean).join(" · ") || clipLabel(clip),
        };
      }),
    [clips, nameOf, teams],
  );
  return <GoalClipStrip items={items} onOpen={onOpen} meta={`${clips.length} gol`} />;
});

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  strip: { gap: space.sm, paddingHorizontal: layout.screenPadding },
  card: { width: CARD_WIDTH, gap: space.xs },
  thumb: {
    width: CARD_WIDTH,
    aspectRatio: 16 / 9,
    borderRadius: radius.md,
    backgroundColor: colors.matchTint,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  play: { width: 34, height: 34, borderRadius: radius.pill, backgroundColor: colors.live, alignItems: "center", justifyContent: "center" },
  minute: {
    position: "absolute",
    left: space.xs,
    bottom: space.xs,
    paddingHorizontal: space.xs,
    paddingVertical: space.px,
    borderRadius: radius.xs,
    backgroundColor: colors.star,
  },
  minuteText: { ...type.micro, fontFamily: fonts.bold, color: RIG.stage },
  duration: {
    position: "absolute",
    right: space.xs,
    bottom: space.xs,
    paddingHorizontal: space.xs,
    paddingVertical: space.px,
    borderRadius: radius.xs,
    backgroundColor: RIG.glass,
  },
  durationText: { ...type.micro, fontFamily: fonts.semibold, color: RIG.text },
  body: { flexDirection: "row", alignItems: "center", gap: space.s },
  flex: { flex: 1, minWidth: 0 },
  title: { ...type.label, color: colors.textPrimary },
  sub: { ...type.caption, color: colors.textSecondary },
});
