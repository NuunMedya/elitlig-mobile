/**
 * Maç Fotoğrafları Kaydırıcısı.
 *
 * Fotoğrafı olan tamamlanmış maçları ekran genişliğinde, sayfa sayfa kayan
 * kartlar olarak gösterir; altında `PagerDots` hangi karede olunduğunu söyler.
 * Her karta dokunulduğunda maç detayına gider.
 *
 * KART ANATOMİSİ: tam kapak fotoğrafı · üstte "BU MAÇ" / tarih cam hapı ·
 * dipte koyu perde üstünde iki arma adı ve büyük skor (Archivo).
 *
 * NEDEN KOYU PERDE TEMAYA BAĞLI DEĞİL: yazı bir FOTOĞRAFIN üstünde duruyor,
 * uygulamanın zemininin üstünde değil. Açık temada `scrimGradientBottom` beyaza
 * döner ve beyaz yazı kaybolurdu. Bu yüzden perde, koyu paletin zemin renginden
 * (`darkPalette.bg`) saydamlıkla TÜRETİLİR — sabit hex yazılmaz ama iki temada
 * da koyu kalır; yazı `onDark` tokenıyla okunur.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useMemo, useRef } from "react";
import { Animated, Image, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { PagerDots, Touchable, withAlpha } from "@/components/ui";
import { colors, dark as darkPalette, hairline, layout, radius, space, textScale, type } from "@/theme";
import { formatDateShort, mediaUrl } from "@/lib/format";
import { matchState } from "@/lib/match";
import type { ApiMatch } from "@/lib/types";

const CARD_RATIO = 16 / 10;

/** Fotoğraf üstü okunabilirlik perdesi — koyu paletin zemininden türetilir. */
const SCRIM = [withAlpha(darkPalette.bg, 0), withAlpha(darkPalette.bg, 0.88)] as const;

export function MatchPhotoSlider({ matches }: { matches: ApiMatch[] }) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const cardW = width - layout.screenPadding * 2;
  const step = cardW + space.sm;
  const scrollX = useRef(new Animated.Value(0)).current;
  const progress = useMemo(() => Animated.divide(scrollX, step), [scrollX, step]);

  const withPhoto = matches
    .filter((m) => matchState(m) === "finished" && m.match_picture)
    .slice(0, 10);

  if (withPhoto.length === 0) return null;
  const firstId = Number(matches[0]?.id);

  return (
    <View>
      <Animated.ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        decelerationRate="fast"
        snapToInterval={step}
        snapToAlignment="start"
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: true })}
      >
        {withPhoto.map((match) => {
          const photo = mediaUrl(match.match_picture);
          const hs = match.first_team_score ?? "-";
          const as = match.second_team_score ?? "-";
          const teams = `${match.first_team_name} - ${match.second_team_name}`;
          const current = Number(match.id) === firstId;

          return (
            <Touchable
              key={match.id}
              feedback="card"
              haptic="selection"
              onPress={() => router.push(`/mac/${match.id}`)}
              accessibilityRole="button"
              accessibilityLabel={`${teams}, ${hs} - ${as}. Maç detayını aç`}
              style={[styles.card, { width: cardW, height: Math.round(cardW / CARD_RATIO) }]}
            >
              {photo ? (
                <Image source={{ uri: photo }} style={styles.photo} resizeMode="cover" />
              ) : (
                <View style={[styles.photo, styles.photoFallback]} />
              )}
              <View style={styles.tag}>
                <Ionicons name={current ? "camera" : "time"} size={11} color={colors.onDark} />
                <Text style={styles.tagText} {...textScale.badge}>
                  {current ? "BU MAÇ" : formatDateShort(match.date)}
                </Text>
              </View>
              <LinearGradient colors={SCRIM} style={styles.gradient}>
                <View style={styles.scoreLine}>
                  <Text style={styles.team} numberOfLines={1} {...textScale.dense}>
                    {match.first_team_name}
                  </Text>
                  <Text style={styles.score} {...textScale.badge}>
                    {hs} – {as}
                  </Text>
                  <Text style={[styles.team, styles.teamAway]} numberOfLines={1} {...textScale.dense}>
                    {match.second_team_name}
                  </Text>
                </View>
              </LinearGradient>
            </Touchable>
          );
        })}
      </Animated.ScrollView>
      {withPhoto.length > 1 ? <PagerDots count={withPhoto.length} progress={progress} style={styles.dots} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: layout.screenPadding,
    gap: space.sm,
    paddingBottom: space.sm,
  },
  card: {
    borderRadius: radius.xl,
    overflow: "hidden",
    backgroundColor: colors.surface2,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  photo: {
    ...StyleSheet.absoluteFillObject,
  },
  /** Fotoğraf çözülemezse kart boş kalmasın: sönük marka zemini. */
  photoFallback: {
    backgroundColor: colors.brandDim,
  },
  tag: {
    position: "absolute",
    top: space.sm,
    left: space.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    height: 22,
    paddingHorizontal: space.sm,
    borderRadius: radius.pill,
    backgroundColor: withAlpha(darkPalette.bg, 0.55),
    borderWidth: hairline,
    borderColor: colors.inkPillBorder,
  },
  tagText: {
    ...type.overline,
    color: colors.onDark,
  },
  gradient: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: space.xxl,
    paddingHorizontal: space.md,
    paddingBottom: space.md,
  },
  scoreLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  team: {
    ...type.labelSm,
    color: colors.onDark,
    flex: 1,
    minWidth: 0,
  },
  teamAway: {
    textAlign: "right",
  },
  score: {
    ...type.scoreMd,
    color: colors.onDark,
  },
  dots: {
    marginTop: space.xs,
  },
});
