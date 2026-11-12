/**
 * Sonlu efektler: parıltı patlaması ve metin patlaması ("Harika!").
 * Hepsi tek Animated.Value ile, native sürücüde, bir kez oynar.
 */
import { memo, useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import { radius, space, textScale, type } from "@/theme";
import { CARTOON } from "@/lib/game/cartoon";
import { SOYUNMA_LOCKER, SOYUNMA_UI as UI } from "@/lib/puzzle/soyunmaPalette";

const PARTICLES = 14;
const CONFETTI = [CARTOON.star, CARTOON.heart, CARTOON.blue[1], CARTOON.green[1], CARTOON.purple[1], CARTOON.white];

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
      {/* Halka parlaması: açılıp sönen beyaz halka. */}
      <Animated.View
        style={[
          styles.ring,
          {
            width: spread * 1.2,
            height: spread * 1.2,
            marginLeft: -spread * 0.6,
            marginTop: -spread * 0.6,
            borderRadius: spread * 0.6,
            opacity: t.interpolate({ inputRange: [0, 0.1, 0.6], outputRange: [0, 1, 0], extrapolate: "clamp" }),
            transform: [{ scale: t.interpolate({ inputRange: [0, 0.6], outputRange: [0.2, 1.5], extrapolate: "clamp" }) }],
          },
        ]}
      />
      {Array.from({ length: PARTICLES }, (_, i) => {
        const a = (i / PARTICLES) * Math.PI * 2 + (i % 2) * 0.3;
        const d = spread * (i % 2 ? 0.75 : 1);
        const s = i % 3 === 0 ? 9 : 6;
        return (
          <Animated.View
            key={i}
            style={[
              styles.particle,
              {
                backgroundColor: CONFETTI[i % CONFETTI.length],
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
  const edge = CARTOON.outline;
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
              { scaleX: t.interpolate({ inputRange: [0, 0.12, 0.2, 0.28, 1], outputRange: [0.4, 1.25, 0.94, 1, 1.02] }) },
              { scaleY: t.interpolate({ inputRange: [0, 0.12, 0.2, 0.28, 1], outputRange: [0.4, 0.86, 1.1, 1, 1.02] }) },
              { rotate: "-3deg" },
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
  ring: { position: "absolute", borderWidth: 4, borderColor: CARTOON.white },
  particle: { position: "absolute", backgroundColor: SOYUNMA_LOCKER.sparkle, borderRadius: 1, borderWidth: 1, borderColor: CARTOON.outline },
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
