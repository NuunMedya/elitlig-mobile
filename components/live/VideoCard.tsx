/**
 * VideoCard — maç sayfasındaki doğrudan video (MP4) kartı: başlık, kapak ve
 * oynat düğmesi. Dokununca oynatıcı yüklenir (veri harcamasın diye).
 *
 * Kullananlar: MatchHighlight (maç özeti) ve maç sonu röportajı.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useVideoPlayer, VideoView } from "expo-video";
import React, { useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";

import { SectionHeader, Touchable } from "@/components/ui";
import { RIG } from "@/lib/live/rig";
import { colors, radius, space, textScale, type } from "@/theme";

export interface VideoCardProps {
  title: string;
  url: string;
  posterUrl?: string | null;
  meta?: string;
  /** Oynat düğmesinin altındaki yazı, ör. "Özeti izle". */
  cta: string;
  /** Erişilebilirlik etiketi, ör. "Maç özetini izle". */
  accessibilityLabel: string;
  icon?: keyof typeof Ionicons.glyphMap;
}

export function VideoCard({ title, url, posterUrl, meta, cta, accessibilityLabel, icon = "play" }: VideoCardProps) {
  const [playing, setPlaying] = useState(false);
  return (
    <View style={styles.wrap}>
      <SectionHeader title={title} meta={meta} />
      <View style={styles.video}>
        {playing ? (
          <Player url={url} />
        ) : (
          <Touchable style={StyleSheet.absoluteFill} onPress={() => setPlaying(true)} accessibilityLabel={accessibilityLabel} haptic="light">
            {posterUrl ? <Image source={{ uri: posterUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
            <View style={styles.center}>
              <View style={styles.play}>
                <Ionicons name={icon} size={22} color={colors.textOnBrand} />
              </View>
              <Text style={styles.caption} {...textScale.dense}>
                {cta}
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
