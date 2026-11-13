/**
 * GECE KİTİ — Gece temasının küçük, sık kullanılan yapı taşları.
 *
 *   <Odometer value={36} />            → rakamları araba saati gibi dönen sayı
 *   <RankBadge rank={1} />             → 1-2-3 için altın/gümüş/bronz madalya, diğerleri sade
 *   <IconTile icon="trophy" tone="violet" />  → degrade dolgulu ikon kutusu
 *   <GradientBar value={0.62} />       → soldan dolan, imza degradeli ilerleme çubuğu
 *
 * Hepsi "hareketi azalt" açıkken animasyonsuz çizilir ve renklerini temadan alır.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import React, { memo, useEffect, useRef } from "react";
import {
  Animated,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { colors, fonts, glowStyle, spring, textScale, type } from "@/theme";
import { useReduceMotion } from "./useReduceMotion";

/* ═══════════════════════════════ ODOMETER ═══════════════════════════════ */

export interface OdometerProps {
  value: number | string;
  /** Metin stili — punto ve satır yüksekliği buradan okunur. */
  style?: StyleProp<TextStyle>;
  /** Tek hane yüksekliği (px). Verilmezse stilin lineHeight'ı, o da yoksa 1.2×punto. */
  digitHeight?: number;
}

/**
 * ODOMETER ROLL: her hane 0-9 sütunu içinde yaylanarak hedef rakama döner.
 * Rakam olmayan karakterler (+, −, %, ') sabit çizilir.
 */
export const Odometer = memo(function Odometer({ value, style, digitHeight }: OdometerProps) {
  const flat = StyleSheet.flatten(style) ?? {};
  const fontSize = flat.fontSize ?? type.h2.fontSize ?? 18;
  const h = digitHeight ?? flat.lineHeight ?? Math.round(fontSize * 1.2);
  const chars = String(value).split("");
  return (
    <View style={styles.odoRow} accessible accessibilityLabel={String(value)}>
      {chars.map((ch, i) =>
        /[0-9]/.test(ch) ? (
          <OdometerDigit key={`${chars.length - i}`} digit={Number(ch)} height={h} style={style} />
        ) : (
          <Text key={`s${chars.length - i}`} style={[style, { lineHeight: h }]} {...textScale.badge}>
            {ch}
          </Text>
        ),
      )}
    </View>
  );
});

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

function OdometerDigit({ digit, height, style }: { digit: number; height: number; style?: StyleProp<TextStyle> }) {
  const reduceMotion = useReduceMotion();
  const y = useRef(new Animated.Value(-digit * height)).current;
  const first = useRef(true);
  useEffect(() => {
    if (first.current || reduceMotion) {
      first.current = false;
      y.setValue(-digit * height);
      return;
    }
    Animated.spring(y, { toValue: -digit * height, ...spring.slide }).start();
  }, [digit, height, reduceMotion, y]);
  return (
    <View style={{ height, overflow: "hidden" }}>
      <Animated.View style={{ transform: [{ translateY: y }] }}>
        {DIGITS.map((d) => (
          <Text key={d} style={[style, { height, lineHeight: height }]} {...textScale.badge}>
            {d}
          </Text>
        ))}
      </Animated.View>
    </View>
  );
}

/* ═══════════════════════════════ RANK BADGE ═══════════════════════════════ */

export interface RankBadgeProps {
  rank: number;
  size?: number;
  style?: StyleProp<ViewStyle>;
}

const MEDALS: Record<number, readonly [string, string]> = {
  1: colors.medalGold,
  2: colors.medalSilver,
  3: colors.medalBronze,
};
const MEDAL_INK = colors.medalInk;

/** Sıralama rozeti: ilk üç madalya degradesi + parıltı; diğerleri yalnız rakam. */
export const RankBadge = memo(function RankBadge({ rank, size = 24, style }: RankBadgeProps) {
  const medal = MEDALS[rank];
  if (!medal) {
    return (
      <View style={[styles.rankPlain, { width: size, height: size }, style]}>
        <Text style={styles.rankPlainText} {...textScale.badge}>
          {rank}
        </Text>
      </View>
    );
  }
  return (
    <View style={[{ width: size, height: size, borderRadius: size / 2 }, glowStyle(medal[1], 1), style]}>
      <LinearGradient
        colors={medal}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 1 }}
        style={[StyleSheet.absoluteFill, { borderRadius: size / 2 }]}
      />
      <View style={styles.rankCenter}>
        <Text style={[styles.rankMedalText, { color: MEDAL_INK }]} {...textScale.badge}>
          {rank}
        </Text>
      </View>
    </View>
  );
});

/* ═══════════════════════════════ ICON TILE ═══════════════════════════════ */

export type IconTileTone = "violet" | "cyan" | "pink" | "mint" | "gold" | "red" | "signature" | "neutral";

/** Degrade çiftleri — iki temada da koyu/doygun; üstündeki ikon beyazdır. */
export const ICON_TILE_TONES: Record<IconTileTone, readonly [string, string]> = colors.tileTones;

export interface IconTileProps {
  icon: keyof typeof Ionicons.glyphMap;
  tone?: IconTileTone;
  size?: number;
  /** Altında hafif renkli parıltı. */
  glow?: boolean;
  style?: StyleProp<ViewStyle>;
}

export const IconTile = memo(function IconTile({ icon, tone = "violet", size = 40, glow = true, style }: IconTileProps) {
  const pair = ICON_TILE_TONES[tone];
  const r = Math.round(size * 0.32);
  return (
    <View
      style={[
        { width: size, height: size, borderRadius: r, alignItems: "center", justifyContent: "center" },
        glow ? glowStyle(pair[1], 1) : null,
        style,
      ]}
    >
      <LinearGradient
        colors={pair}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[StyleSheet.absoluteFill, { borderRadius: r }]}
      />
      <Ionicons name={icon} size={Math.round(size * 0.5)} color={colors.onDark} />
    </View>
  );
});

/* ═══════════════════════════════ GRADIENT BAR ═══════════════════════════════ */

export interface GradientBarProps {
  /** 0–1 arası doluluk. */
  value: number;
  height?: number;
  /** Degrade; verilmezse imza degradesi. */
  gradient?: readonly [string, string];
  /** Ray rengi; verilmezse `surface3`. */
  track?: string;
  style?: StyleProp<ViewStyle>;
}

/** FLOW FILL: değer değişince yaylanarak dolan çubuk. */
export const GradientBar = memo(function GradientBar({ value, height = 6, gradient, track, style }: GradientBarProps) {
  const reduceMotion = useReduceMotion();
  const v = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const fill = useRef(new Animated.Value(reduceMotion ? v : 0)).current;
  useEffect(() => {
    if (reduceMotion) {
      fill.setValue(v);
      return;
    }
    Animated.spring(fill, { toValue: v, ...spring.slide, useNativeDriver: false }).start();
  }, [fill, reduceMotion, v]);
  return (
    <View
      style={[{ height, borderRadius: height / 2, backgroundColor: track ?? colors.surface3, overflow: "hidden" }, style]}
    >
      <Animated.View
        style={{
          height,
          borderRadius: height / 2,
          overflow: "hidden",
          width: fill.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }),
        }}
      >
        <LinearGradient
          colors={gradient ?? colors.gradientSignature}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </View>
  );
});

const styles = StyleSheet.create({
  odoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  rankPlain: {
    alignItems: "center",
    justifyContent: "center",
  },
  rankPlainText: {
    ...type.label,
    fontFamily: fonts.display,
    color: colors.textTertiary,
  },
  rankCenter: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  rankMedalText: {
    ...type.label,
    fontFamily: fonts.bold,
  },
});
