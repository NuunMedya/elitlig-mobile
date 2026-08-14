import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, StyleSheet, Text } from "react-native";
import { openLink } from "@/lib/links";
import { colors, radius, spacing, type } from "@/constants/theme";
import { youtubeChannelUrl, youtubeLiveUrl } from "@/lib/youtube";

/**
 * YouTube canlı yayın şeridi.
 *
 * Şehrin kanalı tanımlıysa görünür; canlı maç varken /live kısayoluna
 * (doğrudan yayına), yokken kanal sayfasına götürür.
 */
export function YoutubeBanner({
  cityLabel,
  live,
}: {
  cityLabel?: string | null;
  live: boolean;
}) {
  const url = live ? youtubeLiveUrl(cityLabel) : youtubeChannelUrl(cityLabel);
  if (!url) return null;

  return (
    <Pressable
      onPress={() => openLink(url)}
      style={({ pressed }) => [styles.banner, pressed && styles.pressed]}
    >
      <Ionicons name="logo-youtube" size={20} color="#FF0000" />
      <Text style={styles.text}>
        {live ? "Canlı yayını YouTube'da izle" : "YouTube kanalına git"}
      </Text>
      <Ionicons name="open-outline" size={16} color={colors.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: "#FDECEC",
    borderWidth: 1,
    borderColor: "#F6C9C9",
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    marginBottom: spacing.sm,
  },
  text: {
    ...type.small,
    color: colors.line,
    fontWeight: "700",
    flex: 1,
  },
  pressed: {
    opacity: 0.7,
  },
});
