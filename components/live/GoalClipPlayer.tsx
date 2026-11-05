/**
 * GOL VİDEOSU OYNATICI — oyuncu profili ve maç sayfası için alt sayfa.
 *
 * Birden çok klip varsa altta sıra şeridi; ilk klip sesi kapalı kendiliğinden
 * başlar (kullanıcı sesi açabilir). Oynatıcı expo-video.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useVideoPlayer, VideoView } from "expo-video";
import React, { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { BottomSheet, Touchable } from "@/components/ui";
import { clipLabel, type GoalClip } from "@/lib/live/clips";
import { RIG } from "@/lib/live/rig";
import { colors, radius, space, textScale, type } from "@/theme";

export interface GoalClipPlayerProps {
  clips: GoalClip[];
  /** Açılışta gösterilecek klip (yoksa ilki). */
  initialId?: number | null;
  visible: boolean;
  onClose: () => void;
  /** Başlık altı (ör. "Ankara Gençlikspor 3–1 Karadeniz FK"). */
  subtitle?: string | null;
  /** Klibin altında gösterilecek ad (ör. golcünün adı). */
  nameFor?: (clip: GoalClip) => string | null;
}

export function GoalClipPlayer({ clips, initialId, visible, onClose, subtitle, nameFor }: GoalClipPlayerProps) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (!visible) return;
    const at = clips.findIndex((c) => c.id === initialId);
    setIndex(at >= 0 ? at : 0);
  }, [visible, initialId, clips]);

  const current = clips[index] ?? null;

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Gol videosu" snap="content" scrollable={false}>
      {current ? (
        <View style={styles.stack}>
          <ClipVideo key={current.id} url={current.url} active={visible} />
          <View style={styles.meta}>
            <View style={styles.flex}>
              <Text style={styles.title} {...textScale.dense}>
                {clipLabel(current)}
                {nameFor?.(current) ? ` · ${nameFor(current)}` : ""}
              </Text>
              {subtitle || current.match ? (
                <Text style={styles.sub} numberOfLines={1} {...textScale.dense}>
                  {subtitle ?? matchTitle(current)}
                </Text>
              ) : null}
            </View>
            {clips.length > 1 ? (
              <View style={styles.nav}>
                <Touchable
                  style={styles.navBtn}
                  onPress={() => setIndex((i) => Math.max(0, i - 1))}
                  disabled={index === 0}
                  accessibilityLabel="Önceki gol"
                >
                  <Ionicons name="chevron-back" size={18} color={index === 0 ? colors.textTertiary : colors.textPrimary} />
                </Touchable>
                <Text style={styles.count} {...textScale.dense}>
                  {index + 1}/{clips.length}
                </Text>
                <Touchable
                  style={styles.navBtn}
                  onPress={() => setIndex((i) => Math.min(clips.length - 1, i + 1))}
                  disabled={index >= clips.length - 1}
                  accessibilityLabel="Sonraki gol"
                >
                  <Ionicons name="chevron-forward" size={18} color={index >= clips.length - 1 ? colors.textTertiary : colors.textPrimary} />
                </Touchable>
              </View>
            ) : null}
          </View>
          {clips.length > 1 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
              {clips.map((clip, i) => (
                <Touchable
                  key={clip.id}
                  style={[styles.chip, i === index && styles.chipOn]}
                  onPress={() => setIndex(i)}
                  accessibilityLabel={clipLabel(clip)}
                >
                  <Ionicons name="play" size={11} color={i === index ? colors.textOnBrand : colors.textSecondary} />
                  <Text style={[styles.chipText, i === index && styles.chipTextOn]} {...textScale.dense}>
                    {clipLabel(clip)}
                  </Text>
                </Touchable>
              ))}
            </ScrollView>
          ) : null}
        </View>
      ) : null}
    </BottomSheet>
  );
}

function ClipVideo({ url, active }: { url: string; active: boolean }) {
  const player = useVideoPlayer(url, (p) => {
    p.loop = true;
    p.muted = true;
  });
  useEffect(() => {
    if (active) player.play();
    else player.pause();
  }, [active, player]);
  return (
    <View style={styles.video}>
      <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls allowsFullscreen />
    </View>
  );
}

function matchTitle(clip: GoalClip): string {
  const m = clip.match;
  if (!m) return "";
  const score = m.home_team_score != null && m.away_team_score != null ? ` ${m.home_team_score}–${m.away_team_score} ` : " – ";
  return `${m.home_team_name ?? "Ev sahibi"}${score}${m.away_team_name ?? "Deplasman"}`;
}

const styles = StyleSheet.create({
  stack: { gap: space.md, paddingBottom: space.md },
  flex: { flex: 1, minWidth: 0 },
  video: { width: "100%", aspectRatio: 16 / 9, borderRadius: radius.lg, overflow: "hidden", backgroundColor: RIG.stage },
  meta: { flexDirection: "row", alignItems: "center", gap: space.sm },
  title: { ...type.h4, color: colors.textPrimary },
  sub: { ...type.caption, color: colors.textSecondary, marginTop: space.xxs },
  nav: { flexDirection: "row", alignItems: "center", gap: space.xs },
  navBtn: { width: 34, height: 34, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface2 },
  count: { ...type.numSmStrong, color: colors.textSecondary },
  strip: { gap: space.xs },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    height: 30,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surface2,
  },
  chipOn: { backgroundColor: colors.brand },
  chipText: { ...type.caption, color: colors.textSecondary },
  chipTextOn: { color: colors.textOnBrand },
});
