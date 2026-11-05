/**
 * Maç sayfası — "Gol videoları" şeridi. Canlı yayında kaydedilen gol klipleri
 * dakika sırasıyla; dokununca oynatıcı açılır. Klip yoksa (ya da uç henüz
 * yoksa) hiçbir şey çizilmez.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import React, { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { SectionHeader, Touchable } from "@/components/ui";
import { clipLabel, listGoalClips, type GoalClip } from "@/lib/live/clips";
import { colors, radius, space, textScale, type } from "@/theme";

import { GoalClipPlayer } from "./GoalClipPlayer";

export function MatchGoalClips({
  matchId,
  nameOf,
  live,
}: {
  matchId: number;
  nameOf: (playerId?: number | null) => string | null;
  live?: boolean;
}) {
  const query = useQuery({
    queryKey: ["goal-clips", "match", matchId],
    queryFn: () => listGoalClips({ match_id: matchId }),
    staleTime: live ? 20_000 : 5 * 60_000,
    refetchInterval: live ? 30_000 : false,
  });
  const clips = useMemo(
    () => [...(query.data ?? [])].sort((a, b) => (Number(a.period) || 1) - (Number(b.period) || 1) || (Number(a.minute) || 0) - (Number(b.minute) || 0)),
    [query.data]
  );
  const [openId, setOpenId] = useState<number | null>(null);

  if (!clips.length) return null;

  const scorer = (clip: GoalClip) => nameOf(clip.player_id);

  return (
    <View style={styles.wrap}>
      <SectionHeader title="Gol videoları" meta={`${clips.length} gol`} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
        {clips.map((clip) => (
          <Touchable
            key={clip.id}
            style={styles.card}
            onPress={() => setOpenId(clip.id)}
            haptic="light"
            accessibilityLabel={`${clipLabel(clip)} ${scorer(clip) ?? ""} videosunu izle`}
          >
            <View style={styles.thumb}>
              <View style={styles.play}>
                <Ionicons name="play" size={16} color={colors.textOnBrand} />
              </View>
            </View>
            <Text style={styles.title} numberOfLines={1} {...textScale.dense}>
              {clipLabel(clip)}
            </Text>
            <Text style={styles.sub} numberOfLines={1} {...textScale.dense}>
              {scorer(clip) ?? "Oyuncu belirtilmedi"}
            </Text>
          </Touchable>
        ))}
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
  strip: { gap: space.sm, paddingRight: space.md },
  card: { width: 140, gap: space.xxs },
  thumb: {
    width: 140,
    aspectRatio: 16 / 9,
    borderRadius: radius.md,
    backgroundColor: colors.matchTint,
    alignItems: "center",
    justifyContent: "center",
  },
  play: { width: 34, height: 34, borderRadius: radius.pill, backgroundColor: colors.live, alignItems: "center", justifyContent: "center" },
  title: { ...type.label, color: colors.textPrimary },
  sub: { ...type.caption, color: colors.textSecondary },
});
