import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing } from "@/constants/theme";

/**
 * Özellik bandı — ana ekranda yatay kaydırmalı kısa yollar.
 * Günün Testi tamamlanmışsa yeşil onay, diğerleri varsayılan.
 */

const DAY_KEY = (day: string) => `elitlig.gunun.${day}.v1`;

interface Feature {
  emoji: string;
  label: string;
  route: string;
  accent: string;
  done?: boolean;
}

export function FeatureBand() {
  const router = useRouter();
  const today  = new Date().toISOString().slice(0, 10);
  const [testDone, setTestDone] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(DAY_KEY(today)).then((v) => setTestDone(Boolean(v)));
  }, [today]);

  const features: Feature[] = [
    { emoji: "🧠", label: "Günün\nTesti",      route: "/gunun",    accent: colors.turf,   done: testDone },
    { emoji: "🔥", label: "Seri\nModu",        route: "/arena",    accent: "#E8600A" },
    { emoji: "⚽", label: "Top\nSektir",       route: "/sektir",   accent: colors.green },
    { emoji: "🕵️", label: "Kim\nBu?",          route: "/kimbu",    accent: "#8B5CF6" },
    { emoji: "🚩", label: "Slalom",            route: "/slalom",   accent: "#DC2626" },
    { emoji: "📊", label: "Rekor\nTablosu",    route: "/siralama", accent: "#0EA5E9" },
    { emoji: "🇹🇷", label: "Türkiye\nSıralaması", route: "/turkiye", accent: "#E8B00A" },
  ];

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.band}
      style={styles.wrap}
    >
      {features.map((f) => (
        <Pressable
          key={f.route}
          onPress={() => router.push(f.route as any)}
          style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
        >
          <View style={[styles.iconBox, { backgroundColor: f.accent + "18" }]}>
            <Text style={styles.emoji}>{f.emoji}</Text>
            {f.done ? (
              <View style={styles.doneBadge}>
                <Text style={styles.doneTick}>✓</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.label} numberOfLines={2}>{f.label}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flexGrow: 0, marginBottom: spacing.sm },
  band: {
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  chip: {
    alignItems: "center",
    gap: 6,
    width: 64,
  },
  iconBox: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  emoji: { fontSize: 24 },
  doneBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.green,
    alignItems: "center",
    justifyContent: "center",
  },
  doneTick: {
    fontSize: 10,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  label: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.line,
    textAlign: "center",
    lineHeight: 13,
  },
  pressed: { opacity: 0.7 },
});
