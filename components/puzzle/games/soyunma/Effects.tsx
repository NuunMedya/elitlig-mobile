/**
 * Sonlu efektler: parıltı patlaması ve metin patlaması ("Harika!").
 * Hepsi tek Animated.Value ile, native sürücüde, bir kez oynar.
 */
import { memo, useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import { radius, space, textScale, type } from "@/theme";
import { SOYUNMA_LOCKER, SOYUNMA_UI as UI } from "@/lib/puzzle/soyunmaPalette";

const PARTICLES = 10;

interface SparkleProps {
  /** Değişince bir kez patlar (0 → yok). */
  token: number;
  /** Patlama yarıçapı. */
  spread: number;
}

function SparkleBurstBase({ token, spread }: SparkleProps) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!token) return;
    t.setValue(0);
    Animated.timing(t, { toValue: 1, duration: 760, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [token, t]);
  if (!token) return null;
  return (
    <View pointerEvents="none" style={styles.center}>
      {Array.from({ length: PARTICLES }, (_, i) => {
        const a = (i / PARTICLES) * Math.PI * 2 + (i % 2) * 0.3;
        const d = spread * (i % 2 ? 0.75 : 1);
        const s = i % 3 === 0 ? 7 : 5;
        return (
          <Animated.View
            key={i}
            style={[
              styles.particle,
              {
                width: s,
                height: s,
                marginLeft: -s / 2,
                marginTop: -s / 2,
                opacity: t.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 1, 0] }),
                transform: [
                  { translateX: t.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(a) * d] }) },
                  { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(a) * d] }) },
                  { rotate: "45deg" },
                  { scale: t.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0.4, 1.3, 0.2] }) },
                ],
              },
            ]}
          />
        );
      })}
    </View>
  );
}

export const SparkleBurst = memo(SparkleBurstBase);

interface BurstProps {
  /** Metin + kimlik; kimlik değişince yeniden oynar. */
  text: string | null;
  id: number;
  tone?: "win" | "brand" | "loss";
}

function TextBurstBase({ text, id, tone = "brand" }: BurstProps) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!text) return;
    t.setValue(0);
    Animated.timing(t, { toValue: 1, duration: 1150, easing: Easing.linear, useNativeDriver: true }).start();
  }, [id, text, t]);
  if (!text) return null;
  const bg = tone === "win" ? UI.green : tone === "loss" ? UI.red : UI.gold;
  const edge = tone === "win" ? UI.greenDeep : tone === "loss" ? UI.redDeep : UI.goldDeep;
  const fg = tone === "brand" ? UI.goldInk : UI.text;
  return (
    <View pointerEvents="none" style={styles.burstWrap}>
      <Animated.View
        style={[
          styles.burst,
          {
            backgroundColor: bg,
            borderColor: edge,
            opacity: t.interpolate({ inputRange: [0, 0.1, 0.75, 1], outputRange: [0, 1, 1, 0] }),
            transform: [
              { scale: t.interpolate({ inputRange: [0, 0.12, 0.22, 1], outputRange: [0.5, 1.18, 1, 1.02] }) },
              { translateY: t.interpolate({ inputRange: [0, 0.75, 1], outputRange: [0, -4, -26] }) },
            ],
          },
        ]}
      >
        <Text {...textScale.badge} style={[styles.burstText, { color: fg }, tone !== "brand" && styles.burstShadow]}>
          {text}
        </Text>
      </Animated.View>
    </View>
  );
}

export const TextBurst = memo(TextBurstBase);

const styles = StyleSheet.create({
  center: { position: "absolute", left: "50%", top: "50%", width: 0, height: 0 },
  particle: { position: "absolute", backgroundColor: SOYUNMA_LOCKER.sparkle, borderRadius: 1 },
  burstWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  burst: {
    paddingHorizontal: space.xl,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    borderWidth: 3,
    borderBottomWidth: 6,
  },
  burstText: { ...type.scoreLg },
  burstShadow: { textShadowColor: UI.textShadow, textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0 },
});
