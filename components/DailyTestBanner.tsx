import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing } from "@/constants/theme";

/**
 * Günün Testi çağrı bandı — ana ekranda QuickChip'lerin yerini alır.
 * AsyncStorage'den bugünün sonucunu okur:
 * - Tamamlanmamışsa: "Bugünün testini çöz!" CTA
 * - Tamamlanmışsa: skor + "Tekrar oyna" seçeneği
 */

const DAY_KEY = (day: string) => `elitlig.gunun.${day}.v1`;

export function DailyTestBanner() {
  const router = useRouter();
  const today  = new Date().toISOString().slice(0, 10);
  const dayLabel = new Date().toLocaleDateString("tr-TR", {
    day: "numeric", month: "long",
  }).toLocaleUpperCase("tr-TR");

  const [result, setResult] = useState<{ score: number; correct: number } | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(DAY_KEY(today)).then((v) => {
      if (v) {
        try { setResult(JSON.parse(v)); } catch {}
      }
      setLoaded(true);
    });
  }, [today]);

  if (!loaded) return null;

  const done = result != null;

  return (
    <Pressable
      onPress={() => router.push("/gunun")}
      style={({ pressed }) => [styles.banner, done && styles.bannerDone, pressed && styles.pressed]}
    >
      <Text style={styles.emoji}>{done ? "✅" : "🧠"}</Text>
      <View style={styles.body}>
        <Text style={styles.label}>{dayLabel} · GÜNÜN TESTİ</Text>
        {done ? (
          <Text style={styles.title}>
            {result!.correct}/10 doğru — {result!.score} puan 🎉
          </Text>
        ) : (
          <Text style={styles.title}>Bugünün testini çözdün mü?</Text>
        )}
        <Text style={styles.sub}>
          {done ? "Antrenman turunu tekrar oyna" : "Herkese aynı 10 soru — kıyas kültürü"}
        </Text>
      </View>
      <View style={[styles.pill, done && styles.pillDone]}>
        <Text style={styles.pillText}>{done ? "Tekrar" : "Başla"}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.turf,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  bannerDone: {
    backgroundColor: colors.turfDim,
    borderWidth: 1,
    borderColor: colors.turf + "55",
  },
  emoji: { fontSize: 22 },
  body: { flex: 1, gap: 2 },
  label: {
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.8,
    color: "rgba(255,255,255,0.7)",
  },
  labelDone: { color: colors.turf },
  title: {
    fontSize: 13,
    fontWeight: "900",
    color: "#FFFFFF",
    letterSpacing: -0.2,
  },
  sub: {
    fontSize: 10,
    fontWeight: "600",
    color: "rgba(255,255,255,0.65)",
  },
  pill: {
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  pillDone: {
    backgroundColor: colors.turf,
  },
  pillText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  pressed: { opacity: 0.8 },
});
