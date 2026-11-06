/**
 * VideoCard — maç sayfasındaki doğrudan video (MP4) kartı: başlık, kapak ve
 * oynat düğmesi. Dokununca oynatıcı aynı yerde yüklenir (veri harcamasın diye).
 *
 * Kullananlar: MatchHighlight (maç özeti), maç sonu röportajı, "Maçın golü" /
 * "Maçın kurtarışı" kartları ve yayın kaydı (doğrudan video ise).
 *
 * Kapak yoksa ya da yüklenemezse koyu sahne + oynat düğmesi kalır; kart hiçbir
 * durumda boş bir kutuya dönmez.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useVideoPlayer, VideoView } from "expo-video";
import React, { useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";

import { SectionHeader, Touchable } from "@/components/ui";
import { RIG } from "@/lib/live/rig";
import { colors, fonts, layout, radius, space, textScale, type } from "@/theme";

export type VideoBadgeTone = "live" | "brand" | "gold";

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
  /** Kapağın sol üstündeki rozet, ör. "MAÇIN GOLÜ". */
  badge?: string;
  badgeTone?: VideoBadgeTone;
  /** Kapağın sağ altındaki süre / dakika, ör. "3:05". */
  corner?: string | null;
  /** Bölüm başlığı çizilmesin (kart başka bir başlığın altındaysa). */
  hideHeader?: boolean;
  /** Videonun altındaki satır (ör. oyuncu bilgisi). */
  footer?: React.ReactNode;
}

export function VideoCard({
  title,
  url,
  posterUrl,
  meta,
  cta,
  accessibilityLabel,
  icon = "play",
  badge,
  badgeTone = "brand",
  corner,
  hideHeader = false,
  footer,
}: VideoCardProps) {
  const [playing, setPlaying] = useState(false);
  const [posterFailed, setPosterFailed] = useState(false);
  const poster = posterUrl && !posterFailed ? posterUrl : null;
  return (
    <View style={styles.wrap}>
      {hideHeader ? null : <SectionHeader title={title} meta={meta} />}
      <View style={[styles.frame, footer ? styles.frameWithFooter : null]}>
        <View style={styles.video}>
          {playing ? (
            <Player url={url} />
          ) : (
            <Touchable style={StyleSheet.absoluteFill} onPress={() => setPlaying(true)} accessibilityLabel={accessibilityLabel} accessibilityRole="button" haptic="light">
              {poster ? (
                <Image source={{ uri: poster }} style={StyleSheet.absoluteFill} resizeMode="cover" onError={() => setPosterFailed(true)} />
              ) : null}
              <View style={styles.shade} />
              {badge ? (
                <View style={[styles.badge, badgeTone === "live" ? styles.badgeLive : badgeTone === "gold" ? styles.badgeGold : null]}>
                  {badgeTone === "live" ? <View style={styles.liveDot} /> : null}
                  <Text style={[styles.badgeText, badgeTone === "gold" ? styles.badgeTextGold : null]} numberOfLines={1} {...textScale.badge}>
                    {badge}
                  </Text>
                </View>
              ) : null}
              <View style={styles.center}>
                <View style={styles.play}>
                  <Ionicons name={icon} size={22} color={colors.textOnBrand} />
                </View>
                <Text style={styles.caption} {...textScale.dense}>
                  {cta}
                </Text>
              </View>
              {corner ? (
                <View style={styles.corner}>
                  <Text style={styles.cornerText} {...textScale.badge}>
                    {corner}
                  </Text>
                </View>
              ) : null}
            </Touchable>
          )}
        </View>
        {footer}
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
  frame: { marginHorizontal: layout.screenPadding, borderRadius: radius.lg, overflow: "hidden" },
  frameWithFooter: { backgroundColor: colors.elevated, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  video: { width: "100%", aspectRatio: 16 / 9, overflow: "hidden", backgroundColor: RIG.stage },
  shade: { ...StyleSheet.absoluteFillObject, backgroundColor: RIG.glass, opacity: 0.35 },
  center: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", gap: space.xs },
  play: { width: 52, height: 52, borderRadius: radius.pill, backgroundColor: colors.live, alignItems: "center", justifyContent: "center" },
  caption: { ...type.label, color: RIG.text },
  badge: {
    position: "absolute",
    top: space.sm,
    left: space.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs,
    borderRadius: radius.pill,
    backgroundColor: RIG.glass,
  },
  badgeLive: { backgroundColor: RIG.live },
  badgeGold: { backgroundColor: colors.star },
  liveDot: { width: 7, height: 7, borderRadius: radius.pill, backgroundColor: RIG.text },
  badgeText: { ...type.micro, fontFamily: fonts.bold, color: RIG.text, letterSpacing: 0.8 },
  badgeTextGold: { color: RIG.stage },
  corner: {
    position: "absolute",
    right: space.sm,
    bottom: space.sm,
    paddingHorizontal: space.xs,
    paddingVertical: space.xxs,
    borderRadius: radius.sm,
    backgroundColor: RIG.glass,
  },
  cornerText: { ...type.micro, fontFamily: fonts.semibold, color: RIG.text },
});
