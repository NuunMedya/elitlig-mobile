/**
 * LİG YOLU ÇİZGİ FİLM KİTİ — Soyunma Odası, Stadyum Kantini ve Kariyer Yolu'nun
 * ortak oyun-içi parçaları (arcade oyunlarının dili):
 *   · kalın lacivert kontur (3 px), doygun gradyan dolgu, üstte beyaz parlama
 *   · altta koyu "dudak": düğme basınca dudağa çöker
 *   · lacivert HUD hapları, iri beyaz rakamlar (lacivert gölgeli)
 *   · stok rozetli tıknaz güçlendirici düğmesi
 * Renkler lib/game/cartoon.ts'ten gelir.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useRef, type ReactNode } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { useReduceMotion } from "@/components/ui/useReduceMotion";
import { CARTOON } from "@/lib/game/cartoon";
import { fonts, haptics, radius, space, textScale, type } from "@/theme";

export const OUT = 3;
const TOP = { x: 0.5, y: 0 } as const;
const BOTTOM = { x: 0.5, y: 1 } as const;

export type ToonTone = "pill" | "green" | "gold" | "red" | "blue" | "purple" | "pink" | "orange" | "teal";

export const TONES: Record<ToonTone, { fill: readonly [string, string]; lip: string; ink: string }> = {
  pill: { fill: CARTOON.pill, lip: CARTOON.outline, ink: CARTOON.white },
  green: { fill: CARTOON.green, lip: CARTOON.greenLip, ink: CARTOON.white },
  gold: { fill: CARTOON.gold, lip: CARTOON.goldLip, ink: CARTOON.goldInk },
  red: { fill: CARTOON.red, lip: CARTOON.redLip, ink: CARTOON.white },
  blue: { fill: CARTOON.blue, lip: CARTOON.blueLip, ink: CARTOON.white },
  purple: { fill: CARTOON.purple, lip: CARTOON.purpleLip, ink: CARTOON.white },
  pink: { fill: CARTOON.pink, lip: CARTOON.pinkLip, ink: CARTOON.white },
  orange: { fill: CARTOON.orange, lip: CARTOON.orangeLip, ink: CARTOON.white },
  teal: { fill: CARTOON.teal, lip: CARTOON.tealLip, ink: CARTOON.white },
};

/** Lacivert gölgeli beyaz metin (arcade rakamları). */
export const toonShadow = { textShadowColor: CARTOON.textShadow, textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0 } as const;

/** Değer değişince ölçek "pop" (yay, sonlu). */
export function usePop(value: unknown, peak = 1.3) {
  const v = useRef(new Animated.Value(1)).current;
  const prev = useRef(value);
  useEffect(() => {
    if (prev.current === value) return;
    prev.current = value;
    v.setValue(peak);
    Animated.spring(v, { toValue: 1, damping: 7, stiffness: 260, mass: 0.6, useNativeDriver: true }).start();
  }, [value, v, peak]);
  return v;
}

/**
 * TEK PAYLAŞILAN "nefes" sürücüsü: 0→1 doğrusal, sonlu tekrar (400 tur),
 * yerel sürücüde. Parçalar `wave(v, faz, genlik)` ile kendi fazında salınır;
 * böylece onlarca parça tek bir animasyon düğümünü paylaşır. Hareket azaltma
 * açıksa ya da `enabled` kapalıysa (duraklatma) durur.
 */
export function useIdleDriver(period = 2400, enabled = true) {
  const reduce = useReduceMotion();
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduce || !enabled) {
      v.stopAnimation();
      return;
    }
    const cycle = Animated.timing(v, { toValue: 1, duration: period, easing: Easing.linear, useNativeDriver: true });
    const loop = Animated.loop(cycle, { iterations: 400, resetBeforeIteration: true });
    loop.start();
    return () => loop.stop();
  }, [reduce, enabled, period, v]);
  return v;
}

const WAVE_IN = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1];
/** Sürücüden faz kaydırmalı sinüs (yaklaşık, 9 noktalı). */
export function wave(v: Animated.Value, phase: number, amp: number) {
  return v.interpolate({ inputRange: WAVE_IN, outputRange: WAVE_IN.map((x) => Math.sin((x + phase) * Math.PI * 2) * amp) });
}

/** Ara ara kıpırdayan düğme (kullanılabilir güçlendirici "beni kullan" der). */
function useWiggle(on: boolean) {
  const reduce = useReduceMotion();
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!on || reduce) {
      v.setValue(0);
      return;
    }
    const wiggleOnce = Animated.sequence([Animated.delay(2600), Animated.timing(v, { toValue: 1, duration: 560, easing: Easing.linear, useNativeDriver: true })]);
    const loop = Animated.loop(wiggleOnce, { iterations: 300, resetBeforeIteration: true });
    loop.start();
    return () => loop.stop();
  }, [on, reduce, v]);
  return v;
}

/** Gradyan yüz + parlama + kontur: hap, rozet, kart zemini. */
export function ToonFace({
  tone = "pill",
  r,
  style,
  children,
  shine = true,
}: {
  tone?: ToonTone;
  r: number;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
  shine?: boolean;
}) {
  const t = TONES[tone];
  return (
    <View style={[styles.face, { borderRadius: r }, style]}>
      <LinearGradient colors={t.fill} start={TOP} end={BOTTOM} style={StyleSheet.absoluteFill} />
      {shine ? <View style={[styles.shine, { borderRadius: r }]} /> : null}
      {children}
    </View>
  );
}

/** Lacivert HUD hapı: altta dudak, solda (taşan) ikon diski. */
export function HudPill({
  height,
  tone = "pill",
  disc,
  children,
  style,
  accessibilityLabel,
  scale,
}: {
  height: number;
  tone?: ToonTone;
  /** Solda taşan disk (ikon / jeton / arma). */
  disc?: ReactNode;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  scale?: Animated.Value;
}) {
  const lip = 3;
  return (
    <Animated.View
      style={[{ height: height + lip, justifyContent: "flex-start" }, style, scale ? { transform: [{ scale }] } : null]}
      accessible={Boolean(accessibilityLabel)}
      accessibilityLabel={accessibilityLabel}
    >
      <View style={[styles.lip, { top: lip, height, borderRadius: height / 2, backgroundColor: TONES[tone].lip }]} />
      <ToonFace tone={tone} r={height / 2} style={[styles.pillRow, { height, paddingLeft: disc ? height + space.xs : space.md }]}>
        {children}
      </ToonFace>
      {disc ? <View style={[styles.disc, { width: height + 4, height: height + 4, top: -2, left: -4 }]}>{disc}</View> : null}
    </Animated.View>
  );
}

/** Yuvarlak, konturlu, gradyanlı ikon diski. */
export function IconDisc({ icon, size, tone = "orange", color }: { icon: keyof typeof Ionicons.glyphMap; size: number; tone?: ToonTone; color?: string }) {
  const t = TONES[tone];
  return (
    <View style={{ width: size, height: size + 3 }}>
      <View style={[styles.lip, { top: 3, height: size, borderRadius: size / 2, backgroundColor: t.lip }]} />
      <ToonFace tone={tone} r={size / 2} style={[styles.center, { width: size, height: size }]}>
        <Ionicons name={icon} size={Math.round(size * 0.52)} color={color ?? t.ink} />
      </ToonFace>
    </View>
  );
}

/** Stok rozeti: kırmızı (stok) ya da yeşil "+" (mağaza). */
export function CountBadge({ value, size = 26, style }: { value: number; size?: number; style?: StyleProp<ViewStyle> }) {
  const has = value > 0;
  return (
    <View style={[styles.badge, { minWidth: size, height: size, borderRadius: size / 2, backgroundColor: has ? CARTOON.red[1] : CARTOON.green[1] }, style]}>
      {has ? (
        <Text {...textScale.badge} style={styles.badgeText}>
          {String(value)}
        </Text>
      ) : (
        <Ionicons name="add" size={Math.round(size * 0.62)} color={CARTOON.white} />
      )}
    </View>
  );
}

/** Kalın 3B düğme (yüz + dudak, basınca çöker). İçerik serbest. */
export function Button3D({
  tone = "green",
  height,
  onPress,
  disabled,
  accessibilityLabel,
  accessibilityRole = "button",
  style,
  faceStyle,
  children,
  badge,
  testID,
  r,
  wiggle = false,
}: {
  wiggle?: boolean;
  tone?: ToonTone;
  height: number;
  onPress?: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  accessibilityRole?: "button";
  style?: StyleProp<ViewStyle>;
  faceStyle?: StyleProp<ViewStyle>;
  children: ReactNode;
  /** Sağ üst köşe rozeti (stok). */
  badge?: ReactNode;
  testID?: string;
  r?: number;
}) {
  const sink = useRef(new Animated.Value(0)).current;
  const wig = useWiggle(wiggle && !disabled);
  const lip = height >= 52 ? 6 : 5;
  const corner = r ?? Math.min(radius.xl, height / 2);
  const to = (v: number) => Animated.timing(sink, { toValue: v, duration: v ? 60 : 140, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  return (
    <Pressable
      onPress={() => {
        haptics.light();
        onPress?.();
      }}
      onPressIn={() => to(1)}
      onPressOut={() => to(0)}
      disabled={disabled}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: Boolean(disabled) }}
      hitSlop={4}
      testID={testID}
      style={[{ height: height + lip }, disabled ? styles.off : null, style]}
    >
      <Animated.View
        style={{
          height: height + lip,
          transform: [
            { rotate: wig.interpolate({ inputRange: [0, 0.15, 0.35, 0.55, 0.75, 1], outputRange: ["0deg", "-5deg", "4deg", "-3deg", "1.5deg", "0deg"] }) },
            { scale: wig.interpolate({ inputRange: [0, 0.15, 0.5, 1], outputRange: [1, 1.08, 1.02, 1] }) },
          ],
        }}
      >
      <View style={[styles.lip, { top: lip, height, borderRadius: corner, backgroundColor: TONES[tone].lip }]} />
      <Animated.View style={{ height, transform: [{ translateY: sink.interpolate({ inputRange: [0, 1], outputRange: [0, lip] }) }] }}>
        <ToonFace tone={tone} r={corner} style={[styles.btnRow, { height }, faceStyle]}>
          {children}
        </ToonFace>
        {badge ? <View style={styles.badgeHost}>{badge}</View> : null}
      </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

/** Güçlendirici: ikon diski + etiket + stok rozeti. */
export function BoosterButton3D({
  icon,
  label,
  stock,
  onPress,
  disabled,
  height,
  tone = "blue",
  accessibilityLabel,
  style,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  stock: number;
  onPress: () => void;
  disabled?: boolean;
  height: number;
  tone?: ToonTone;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const disc = Math.round(height - 14);
  const t = TONES[tone];
  return (
    <Button3D
      tone={tone}
      height={height}
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={accessibilityLabel ?? `${label}, stok ${stock}`}
      style={style}
      faceStyle={styles.boosterFace}
      wiggle={stock > 0}
      badge={<CountBadge value={stock} />}
    >
      <View style={[styles.boosterDisc, { width: disc, height: disc, borderRadius: disc / 2 }]}>
        <Ionicons name={icon} size={Math.round(disc * 0.58)} color={t.lip} />
      </View>
      <Text {...textScale.badge} style={[styles.boosterText, { color: t.ink }, t.ink === CARTOON.white ? toonShadow : null]} numberOfLines={2}>
        {label.toLocaleUpperCase("tr-TR")}
      </Text>
    </Button3D>
  );
}

/** Beyaz çizgi film kartı (lacivert kontur + koyu alt dudak). */
export function ToonCard({ children, style, r = radius.xxl }: { children: ReactNode; style?: StyleProp<ViewStyle>; r?: number }) {
  return (
    <View style={styles.cardWrap}>
      <View style={[styles.cardLip, { borderRadius: r }]} />
      <View style={[styles.card, { borderRadius: r }, style]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  face: { overflow: "hidden", borderWidth: OUT, borderColor: CARTOON.outline },
  shine: { position: "absolute", top: 3, left: "10%", right: "10%", height: "18%", minHeight: 4, maxHeight: 8, backgroundColor: CARTOON.shine },
  lip: { position: "absolute", left: 0, right: 0, borderWidth: OUT, borderColor: CARTOON.outline },
  pillRow: { flexDirection: "row", alignItems: "center", gap: space.xs, paddingRight: space.md },
  disc: { position: "absolute", alignItems: "center", justifyContent: "center" },
  center: { alignItems: "center", justifyContent: "center" },
  badge: {
    paddingHorizontal: space.xs,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: CARTOON.white,
  },
  badgeText: { ...type.numSmStrong, fontFamily: fonts.bold, color: CARTOON.white, ...toonShadow },
  badgeHost: { position: "absolute", top: -10, right: -8 },
  btnRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.sm, paddingHorizontal: space.md },
  off: { opacity: 0.5 },
  boosterFace: { justifyContent: "flex-start", paddingLeft: space.s, paddingRight: space.md },
  boosterDisc: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: CARTOON.white,
    borderWidth: 2,
    borderColor: CARTOON.outline,
  },
  boosterText: { ...type.label, fontFamily: fonts.bold, letterSpacing: 0.5, flexShrink: 1 },
  cardWrap: { alignSelf: "stretch" },
  cardLip: { position: "absolute", left: 0, right: 0, top: 6, bottom: -6, backgroundColor: CARTOON.outline },
  card: { backgroundColor: CARTOON.card, borderWidth: OUT, borderColor: CARTOON.outline, padding: space.lg },
});
