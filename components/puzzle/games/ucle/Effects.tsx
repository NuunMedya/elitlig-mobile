import React, { memo, useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
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
      Animated.spring(v, { toValue: 1, speed: 16, bounciness: 14, useNativeDriver: true }),
      Animated.delay(tone === "combo" ? 380 : 650),
      Animated.timing(v, { toValue: 2, duration: 300, easing: Easing.in(Easing.quad), useNativeDriver: true }),
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
            opacity: v.interpolate({ inputRange: [0, 0.4, 1, 2], outputRange: [0, 1, 1, 0] }),
            transform: [
              { scale: v.interpolate({ inputRange: [0, 1, 2], outputRange: [0.4, 1, 1.1] }) },
              { translateY: v.interpolate({ inputRange: [0, 1, 2], outputRange: [12, 0, -26] }) },
              { rotate: tone === "combo" ? "-4deg" : "0deg" },
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
    Animated.timing(v, { toValue: 1, duration: 1600, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
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
              opacity: v.interpolate({ inputRange: [0, 0.85, 1], outputRange: [1, 1, 0] }),
              transform: [
                { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, height * (0.6 + (i % 4) * 0.12)] }) },
                { translateX: v.interpolate({ inputRange: [0, 1], outputRange: [0, drift] }) },
                { rotate: v.interpolate({ inputRange: [0, 1], outputRange: ["0deg", `${(i % 2 ? 1 : -1) * (180 + i * 20)}deg`] }) },
              ],
            }}
          />
        );
      })}
    </View>
  );
});

const shadowText = { textShadowColor: UI.textShadow, textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0 } as const;

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: 0, right: 0, alignItems: "center" },
  combo: {
    paddingHorizontal: space.xl,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    backgroundColor: UI.gold,
    borderWidth: 3,
    borderBottomWidth: 6,
    borderColor: UI.goldDeep,
  },
  info: {
    paddingHorizontal: space.lg,
    paddingVertical: space.s,
    borderRadius: radius.pill,
    backgroundColor: UI.panel,
    borderWidth: 2,
    borderBottomWidth: 4,
    borderColor: UI.panelRim,
  },
  warn: {
    paddingHorizontal: space.lg,
    paddingVertical: space.s,
    borderRadius: radius.pill,
    backgroundColor: UI.red,
    borderWidth: 2,
    borderBottomWidth: 4,
    borderColor: UI.redDeep,
  },
  comboText: { ...type.scoreLg, color: UI.goldInk },
  infoText: { ...type.label, fontFamily: fonts.heading, color: UI.text, ...shadowText },
});
