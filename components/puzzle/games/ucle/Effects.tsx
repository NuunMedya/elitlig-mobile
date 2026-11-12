import React, { memo, useEffect, useRef, useState } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { fonts, radius, space, textScale, type } from "@/theme";
import { UCLE_UI as UI } from "@/lib/puzzle/uclePalette";

interface PopProps {
  text: string;
  /** "combo" büyük ve parlak; "info" sakin bilgi balonu. */
  tone: "combo" | "info" | "warn";
  top: number;
}

/** Metin patlaması: "Harika!", "Kilit açıldı!" — büyüyüp yükselir, söner. */
function PopTextBase({ text, tone, top }: PopProps) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.sequence([
      Animated.spring(v, {
        toValue: 1,
        speed: 16,
        bounciness: 14,
        useNativeDriver: true,
      }),
      Animated.delay(tone === "combo" ? 380 : 650),
      Animated.timing(v, {
        toValue: 2,
        duration: 300,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();
  }, [v, tone]);
  const style = tone === "combo" ? styles.combo : tone === "warn" ? styles.warn : styles.info;
  const textStyle = tone === "combo" ? styles.comboText : styles.infoText;
  return (
    <View pointerEvents="none" style={[styles.wrap, { top }]}>
      <Animated.View
        style={[
          style,
          {
            opacity: v.interpolate({
              inputRange: [0, 0.4, 1, 2],
              outputRange: [0, 1, 1, 0],
            }),
            transform: [
              {
                scale: v.interpolate({
                  inputRange: [0, 1, 2],
                  outputRange: [0.4, 1, 1.1],
                }),
              },
              {
                translateY: v.interpolate({
                  inputRange: [0, 1, 2],
                  outputRange: [12, 0, -26],
                }),
              },
              {
                rotate:
                  tone === "combo"
                    ? v.interpolate({
                        inputRange: [0, 0.5, 1, 2],
                        outputRange: ["-14deg", "5deg", "-4deg", "-2deg"],
                      })
                    : "0deg",
              },
            ],
          },
        ]}
      >
        <Text style={textStyle} {...textScale.badge}>
          {text}
        </Text>
      </Animated.View>
    </View>
  );
}

export const PopText = memo(PopTextBase);

/** Kazanınca tahtanın üstünde süzülen konfeti (sonlu). */
export const Confetti = memo(function Confetti({ width, height, palette }: { width: number; height: number; palette: string[] }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, {
      toValue: 1,
      duration: 1600,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [v]);
  const bits = 22;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: "hidden" }]}>
      {Array.from({ length: bits }, (_, i) => {
        const x0 = (width * ((i * 37) % 100)) / 100;
        const drift = ((i % 5) - 2) * 18;
        const size = 6 + (i % 3) * 3;
        return (
          <Animated.View
            key={i}
            style={{
              position: "absolute",
              left: x0,
              top: -12,
              width: size,
              height: size * 1.6,
              borderRadius: size / 3,
              backgroundColor: palette[i % palette.length],
              opacity: v.interpolate({
                inputRange: [0, 0.85, 1],
                outputRange: [1, 1, 0],
              }),
              transform: [
                {
                  translateY: v.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, height * (0.6 + (i % 4) * 0.12)],
                  }),
                },
                {
                  translateX: v.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, drift],
                  }),
                },
                {
                  rotate: v.interpolate({
                    inputRange: [0, 1],
                    outputRange: ["0deg", `${(i % 2 ? 1 : -1) * (180 + i * 20)}deg`],
                  }),
                },
              ],
            }}
          />
        );
      })}
    </View>
  );
});

/**
 * Tahtanın üstünden ara ara geçen eğik ışık süpürmesi. Her süpürme sonlu
 * bir animasyondur; bir sonraki zamanlayıcıyla tetiklenir (bileşen kalkınca
 * ya da `active` kapanınca temizlenir).
 */
export const BoardShine = memo(function BoardShine({ width, height, active }: { width: number; height: number; active: boolean }) {
  const t = useRef(new Animated.Value(0)).current;
  const [round, setRound] = useState(0);
  useEffect(() => {
    t.setValue(0);
    const anim = Animated.timing(t, {
      toValue: 1,
      duration: 1200,
      delay: round === 0 ? 900 : 0,
      easing: Easing.inOut(Easing.quad),
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [round, t]);
  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(() => setRound((r) => r + 1), 7500 + (round % 3) * 1500);
    return () => clearTimeout(timer);
  }, [active, round]);
  const band = Math.max(80, width * 0.32);
  return (
    <View pointerEvents="none" style={[styles.shineClip, { width, height, borderRadius: radius.xxl }]}>
      <Animated.View
        style={{
          position: "absolute",
          top: -height * 0.1,
          width: band,
          height: height * 1.2,
          opacity: t.interpolate({
            inputRange: [0, 0.1, 0.85, 1],
            outputRange: [0, 1, 1, 0],
          }),
          transform: [
            {
              translateX: t.interpolate({
                inputRange: [0, 1],
                outputRange: [-band * 1.6, width + band * 0.6],
              }),
            },
            { rotate: "16deg" },
          ],
        }}
      >
        <Svg width="100%" height="100%" viewBox="0 0 10 10" preserveAspectRatio="none">
          <Defs>
            <LinearGradient id="ucsweep" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor={UI.text} stopOpacity={0} />
              <Stop offset="0.5" stopColor={UI.text} stopOpacity={0.32} />
              <Stop offset="1" stopColor={UI.text} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Rect x={0} y={0} width={10} height={10} fill="url(#ucsweep)" />
        </Svg>
      </Animated.View>
    </View>
  );
});

const shadowText = {
  textShadowColor: UI.textShadow,
  textShadowOffset: { width: 0, height: 1 },
  textShadowRadius: 3,
} as const;

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: 0, right: 0, alignItems: "center" },
  shineClip: { position: "absolute", left: 0, top: 0, overflow: "hidden" },
  combo: {
    paddingHorizontal: space.xl,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    backgroundColor: UI.white,
    borderWidth: 1,
    borderBottomWidth: 3,
    borderColor: UI.outline,
  },
  info: {
    paddingHorizontal: space.lg,
    paddingVertical: space.s,
    borderRadius: radius.pill,
    backgroundColor: UI.panel,
    borderWidth: 1,
    borderBottomWidth: 3,
    borderColor: UI.outline,
  },
  warn: {
    paddingHorizontal: space.lg,
    paddingVertical: space.s,
    borderRadius: radius.pill,
    backgroundColor: UI.red,
    borderWidth: 1,
    borderBottomWidth: 3,
    borderColor: UI.outline,
  },
  comboText: { ...type.scoreLg, color: UI.ink },
  infoText: {
    ...type.h2,
    fontFamily: fonts.bold,
    color: UI.text,
    ...shadowText,
  },
});
