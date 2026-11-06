/**
 * Maç sayfası — "Gol videoları" şeridi. Canlı yayında kaydedilen gol klipleri
 * dakika sırasıyla: kapak, dakika, golcü ve takım arması; dokununca oynatıcı
 * açılır. Klip yoksa (ya da uç henüz yoksa) hiçbir şey çizilmez.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import React, { useMemo, useState } from "react";
import { Image, ScrollView, StyleSheet, Text, View } from "react-native";

import { SectionHeader, TeamLogo, Touchable } from "@/components/ui";
import { clipLabel, listGoalClips, type GoalClip } from "@/lib/live/clips";
import { RIG } from "@/lib/live/rig";
import { formatDuration } from "@/lib/matchMedia";
import { colors, fonts, layout, radius, space, textScale, type } from "@/theme";

import { GoalClipPlayer } from "./GoalClipPlayer";

/** Maçın gol klipleri, dakika sırasıyla. Aynı sorgu anahtarı: şerit ve "Maçın golü" kartı tek istek paylaşır. */
export function useMatchGoalClips(matchId: number, live?: boolean): GoalClip[] {
  const query = useQuery({
    queryKey: ["goal-clips", "match", matchId],
    queryFn: () => listGoalClips({ match_id: matchId }),
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

export function MatchGoalClips({
  matchId,
  nameOf,
  live,
  teams,
}: {
  matchId: number;
  nameOf: (playerId?: number | null) => string | null;
  live?: boolean;
  teams?: ClipTeams;
}) {
  const clips = useMatchGoalClips(matchId, live);
  const [openId, setOpenId] = useState<number | null>(null);

  if (!clips.length) return null;

  const scorer = (clip: GoalClip) => nameOf(clip.player_id);
  const teamOf = (clip: GoalClip) => {
    if (!teams || clip.team_id == null) return null;
    if (Number(clip.team_id) === teams.homeTeamId) return { name: teams.homeName ?? null, logo: teams.homeLogo ?? null };
    if (Number(clip.team_id) === teams.awayTeamId) return { name: teams.awayName ?? null, logo: teams.awayLogo ?? null };
    return null;
  };

  return (
    <View style={styles.wrap}>
      <SectionHeader title="Gol videoları" meta={`${clips.length} gol`} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
        {clips.map((clip) => {
          const team = teamOf(clip);
          const duration = formatDuration(clip.duration_ms);
          return (
            <Touchable
              key={clip.id}
              style={styles.card}
              onPress={() => setOpenId(clip.id)}
              haptic="light"
              accessibilityRole="button"
              accessibilityLabel={`${clipLabel(clip)} ${scorer(clip) ?? ""} videosunu izle`}
            >
              <View style={styles.thumb}>
                {clip.poster_url ? <Image source={{ uri: clip.poster_url }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
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
                    {scorer(clip) ?? clipLabel(clip)}
                  </Text>
                  <Text style={styles.sub} numberOfLines={1} {...textScale.dense}>
                    {[clip.own_goal ? "Kendi kalesine" : null, team?.name].filter(Boolean).join(" · ") || clipLabel(clip)}
                  </Text>
                </View>
              </View>
            </Touchable>
          );
        })}
      </ScrollView>
      <GoalClipPlayer
        visible={openId != null}
        initialId={openId}
        clips={clips}
        onClose={() => setOpenId(null)}
        nameFor={scorer}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  strip: { gap: space.sm, paddingHorizontal: layout.screenPadding },
  card: { width: 168, gap: space.xs },
  thumb: {
    width: 168,
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
