/**
 * Maç Fotoğrafları Sliderı.
 *
 * Fotoğrafı olan tamamlanmış maçları yatay kaydırmalı kart olarak gösterir;
 * her karta dokunulduğunda maç detayına gider.
 *
 * TOKEN GEÇİŞİ: `@/constants/theme` kapısı kapatıldı; renk/uzay/tipografi
 * `@/theme`ten, basma geri bildirimi `Touchable`dan geliyor.
 *
 * NEDEN KOYU GRADYAN TEMAYA BAĞLI DEĞİL: yazı bir FOTOĞRAFIN üstünde duruyor,
 * uygulamanın zemininin üstünde değil. Açık temada `scrimGradientBottom` beyaza
 * döner ve beyaz yazı kaybolurdu. Bu yüzden perde, koyu paletin zemin renginden
 * (`darkPalette.bg`) saydamlıkla TÜRETİLİR — sabit hex yazılmaz ama iki temada
 * da koyu kalır; yazı `textOnStatus` (dolgu üstü metin) tokenıyla okunur.
 */

import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { Image, ScrollView, StyleSheet, Text, View } from "react-native";
import { Touchable, withAlpha } from "@/components/ui";
import { colors, dark as darkPalette, radius, space, textScale, type } from "@/theme";
import { mediaUrl } from "@/lib/format";
import { matchState } from "@/lib/match";
import type { ApiMatch } from "@/lib/types";

const CARD_W = 260;
const CARD_H = 160;

/** Fotoğraf üstü okunabilirlik perdesi — koyu paletin zemininden türetilir. */
const SCRIM = [withAlpha(darkPalette.bg, 0), withAlpha(darkPalette.bg, 0.85)] as const;

export function MatchPhotoSlider({ matches }: { matches: ApiMatch[] }) {
  const router = useRouter();

  const withPhoto = matches
    .filter((m) => matchState(m) === "finished" && m.match_picture)
    .slice(0, 10);

  if (withPhoto.length === 0) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      decelerationRate="fast"
      snapToInterval={CARD_W + space.sm}
      snapToAlignment="start"
    >
      {withPhoto.map((match) => {
        const photo = mediaUrl(match.match_picture);
        const hs = match.first_team_score ?? "-";
        const as = match.second_team_score ?? "-";
        const teams = `${match.first_team_name} - ${match.second_team_name}`;

        return (
          <Touchable
            key={match.id}
            feedback="card"
            haptic="selection"
            onPress={() => router.push(`/mac/${match.id}`)}
            accessibilityRole="button"
            accessibilityLabel={`${teams}, ${hs} - ${as}. Maç detayını aç`}
            style={styles.card}
          >
            {photo ? (
              <Image source={{ uri: photo }} style={styles.photo} resizeMode="cover" />
            ) : (
              <View style={[styles.photo, styles.photoFallback]} />
            )}
            <LinearGradient colors={SCRIM} style={styles.gradient}>
              <Text style={styles.score} {...textScale.dense}>
                {hs} – {as}
              </Text>
              <Text style={styles.teams} numberOfLines={1} {...textScale.dense}>
                {teams}
              </Text>
            </LinearGradient>
          </Touchable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: space.md,
    gap: space.sm,
    paddingBottom: space.sm,
  },
  card: {
    width: CARD_W,
    height: CARD_H,
    borderRadius: radius.lg,
    overflow: "hidden",
    backgroundColor: colors.surface2,
  },
  photo: {
    ...StyleSheet.absoluteFillObject,
  },
  /** Fotoğraf çözülemezse kart boş kalmasın: sönük marka zemini. */
  photoFallback: {
    backgroundColor: colors.brandDim,
  },
  gradient: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
    padding: space.m,
    gap: space.xxs,
  },
  score: {
    ...type.scoreMd,
    color: colors.textOnStatus,
  },
  teams: {
    ...type.caption,
    color: withAlpha(colors.textOnStatus, 0.85),
  },
});
