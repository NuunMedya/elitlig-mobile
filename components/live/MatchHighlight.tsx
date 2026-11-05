/**
 * Maç sayfası — "Maç özeti" videosu. Yayın stüdyosunda maçın tekrarlarından
 * üretilip yüklenir (GET /maclar/:id → highlight). Önce kapak görseli ve
 * oynat düğmesi çizilir; dokununca oynatıcı yüklenir (veri harcamasın diye).
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useVideoPlayer, VideoView } from "expo-video";
import React, { useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";

import { SectionHeader, Touchable } from "@/components/ui";
import { RIG } from "@/lib/live/rig";
import { colors, radius, space, textScale, type } from "@/theme";

export interface MatchHighlightProps {
  highlight: { url: string; poster_url: string | null; duration_ms: number | null } | null | undefined;
}

export function MatchHighlight({ highlight }: MatchHighlightProps) {
  const [playing, setPlaying] = useState(false);
  if (!highlight?.url || !/^https?:\/\//i.test(highlight.url)) return null;
  const minutes = highlight.duration_ms ? Math.max(1, Math.round(highlight.duration_ms / 60000)) : null;

  return (
    <View style={styles.wrap}>
      <SectionHeader title="Maç özeti" meta={minutes ? `${minutes} dk` : undefined} />
      <View style={styles.video}>
        {playing ? (
          <Player url={highlight.url} />
        ) : (
          <Touchable style={StyleSheet.absoluteFill} onPress={() => setPlaying(true)} accessibilityLabel="Maç özetini izle" haptic="light">
            {highlight.poster_url ? <Image source={{ uri: highlight.poster_url }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
            <View style={styles.center}>
              <View style={styles.play}>
                <Ionicons name="play" size={22} color={colors.textOnBrand} />
              </View>
              <Text style={styles.caption} {...textScale.dense}>
                Özeti izle
              </Text>
            </View>
          </Touchable>
        )}
      </View>
    </View>
  );
}

function Player({ url }: { url: string }) {
  const player = useVideoPlayer(url, (p) => {
    p.play();
  });
  return <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls allowsFullscreen />;
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  video: { width: "100%", aspectRatio: 16 / 9, borderRadius: radius.lg, overflow: "hidden", backgroundColor: RIG.stage },
  center: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", gap: space.xs },
  play: { width: 52, height: 52, borderRadius: radius.pill, backgroundColor: colors.live, alignItems: "center", justifyContent: "center" },
  caption: { ...type.label, color: RIG.text },
});
