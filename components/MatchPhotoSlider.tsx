import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing, type } from "@/constants/theme";
import { mediaUrl } from "@/lib/media";
import { matchState } from "@/lib/match";
import type { ApiMatch } from "@/lib/types";

/**
 * Maç Fotoğrafları Sliderı
 * Fotoğrafı olan tamamlanmış maçları yatay kaydırmalı kart olarak gösterir.
 * Her karta dokunulduğunda maç detayına gider.
 */
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
      snapToInterval={CARD_W + spacing.sm}
      snapToAlignment="start"
    >
      {withPhoto.map((match) => {
        const photo = mediaUrl(match.match_picture);
        const hs = match.first_team_score ?? "-";
        const as = match.second_team_score ?? "-";

        return (
          <Pressable
            key={match.id}
            onPress={() => router.push(`/mac/${match.id}`)}
            style={({ pressed }) => [styles.card, pressed && styles.pressed]}
          >
            {photo ? (
              <Image source={{ uri: photo }} style={styles.photo} resizeMode="cover" />
            ) : (
              <View style={[styles.photo, styles.photoFallback]} />
            )}
            <LinearGradient
              colors={["transparent", "rgba(0,0,0,0.85)"]}
              style={styles.gradient}
            >
              <Text style={styles.score}>{hs} – {as}</Text>
              <Text style={styles.teams} numberOfLines={1}>
                {match.first_team_name} vs {match.second_team_name}
              </Text>

            </LinearGradient>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const CARD_W = 260;

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
    paddingBottom: spacing.sm,
  },
  card: {
    width: CARD_W,
    height: 160,
    borderRadius: radius.md,
    overflow: "hidden",
    backgroundColor: colors.surfaceRaised,
  },
  photo: {
    ...StyleSheet.absoluteFillObject,
  },
  photoFallback: {
    backgroundColor: colors.turfDim,
  },
  gradient: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
    padding: spacing.sm + 2,
    gap: 2,
  },
  score: {
    fontSize: 22,
    fontWeight: "900",
    color: "#FFFFFF",
    letterSpacing: -0.5,
    fontVariant: ["tabular-nums"],
  },
  teams: {
    fontSize: 11,
    fontWeight: "700",
    color: "rgba(255,255,255,0.85)",
  },

  pressed: { opacity: 0.85 },
});
