import { useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing } from "@/constants/theme";
import { initials, mediaUrl } from "@/lib/format";

/**
 * Takım amblemi. Logolar veritabanında farklı biçimlerde duruyor ve bir kısmı
 * eksik; her durumda takım baş harfleriyle okunur bir yedek gösterilir.
 */
export function TeamCrest({
  name,
  logo,
  size = 36,
}: {
  name?: string | null;
  logo?: string | null;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  const uri = failed ? null : mediaUrl(logo);

  const box = {
    width: size,
    height: size,
    borderRadius: size / 4,
  };

  if (!uri) {
    return (
      <View style={[styles.fallback, box]}>
        <Text style={[styles.initials, { fontSize: size * 0.36 }]} numberOfLines={1}>
          {initials(name)}
        </Text>
      </View>
    );
  }

  return (
    <Image
      source={{ uri }}
      style={[styles.image, box]}
      resizeMode="contain"
      onError={() => setFailed(true)}
    />
  );
}

const styles = StyleSheet.create({
  image: {
    backgroundColor: colors.surfaceRaised,
  },
  fallback: {
    backgroundColor: colors.surfaceRaised,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.faint,
  },
  initials: {
    color: colors.muted,
    fontWeight: "800",
    letterSpacing: 0.5,
    paddingHorizontal: spacing.xs,
  },
});

/** Oyuncu fotoğrafı — aynı yedek mantığı, yuvarlak biçim. */
export function PlayerAvatar({
  name,
  image,
  size = 40,
}: {
  name?: string | null;
  image?: string | null;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  const uri = failed ? null : mediaUrl(image);
  const box = { width: size, height: size, borderRadius: radius.pill };

  if (!uri) {
    return (
      <View style={[styles.fallback, box]}>
        <Text style={[styles.initials, { fontSize: size * 0.36 }]}>{initials(name)}</Text>
      </View>
    );
  }

  return (
    <Image
      source={{ uri }}
      style={[styles.image, box]}
      resizeMode="cover"
      onError={() => setFailed(true)}
    />
  );
}
