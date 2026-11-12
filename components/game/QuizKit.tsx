/**
 * BİLGİ YARIŞMASI ÇİZGİ FİLM KİTİ — Kim Bu?, Gol Düellosu, Kim Kazandı? ve
 * Günün Testi'nin ortak oyun-içi parçaları.
 *
 * Arcade oyunlarının (games/*.js) dili React Native'de: kalın lacivert
 * kontur, doygun düz dolgu + üstte beyaz parlama şeridi, altta koyu "dudak"
 * (basınca düğme dudağa çöker), gece stadyumu zemini. Uygulama başlığı
 * (ScreenHeader) yoktur: oyun bütün ekranı kaplar; köşedeki yuvarlak DURAKLAT
 * düğmesi "MOLA" kartını açar (devam et / oyundan çık).
 *
 * Renkler `lib/game/cartoon.ts` + `lib/game/quizPalette.ts`ten gelir.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter } from "expo-router";
import { memo, useCallback, useEffect, useRef, type ReactNode } from "react";
import {
  ActivityIndicator,
  Animated,
  BackHandler,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { useReduceMotion } from "@/components/ui";
import { CARTOON } from "@/lib/game/cartoon";
import { QUIZ, QUIZ_TONES, type QuizToneName } from "@/lib/game/quizPalette";
import { fonts, haptics, radius, space, textScale, type, upperTR } from "@/theme";

export const OUTLINE = 3;
const TOP = { x: 0.5, y: 0 } as const;
const BOTTOM = { x: 0.5, y: 1 } as const;

/* ═════════════════════════ ÇIKIŞ ═════════════════════════ */

/** Oyundan çık: geri gidilebiliyorsa geri, yoksa Oyun Merkezi. */
export function useExitGame() {
  const router = useRouter();
  return useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)/oyunlar");
  }, [router]);
}

/**
 * Android geri tuşu: `handler` true dönerse (olay tüketildi) ekran kapanmaz.
 * Yalnız ekran odaktayken dinlenir.
 */
export function useHardwareBack(handler: () => boolean) {
  const ref = useRef(handler);
  ref.current = handler;
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener("hardwareBackPress", () => ref.current());
      return () => sub.remove();
    }, []),
  );
}

/* ═════════════════════════ ZEMİN: GECE STADYUMU ═════════════════════════ */

const STARS = [
  [0.08, 0.05], [0.22, 0.11], [0.37, 0.04], [0.55, 0.09], [0.71, 0.03], [0.9, 0.08],
  [0.14, 0.19], [0.47, 0.16], [0.83, 0.17], [0.63, 0.22], [0.3, 0.25], [0.95, 0.27],
] as const;

/** Uzak şehir siluetleri: [sol %, genişlik %, yükseklik px]. */
const TOWERS = [
  [0, 0.12, 120], [0.1, 0.09, 170], [0.18, 0.13, 95], [0.3, 0.08, 150], [0.37, 0.12, 110],
  [0.5, 0.1, 185], [0.6, 0.12, 125], [0.71, 0.09, 160], [0.8, 0.12, 105], [0.9, 0.11, 145],
] as const;

export const QuizBackdrop = memo(function QuizBackdrop() {
  const { width, height } = useWindowDimensions();
  const standTop = height * 0.72;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient colors={CARTOON.night} start={TOP} end={BOTTOM} style={StyleSheet.absoluteFill} />
      {STARS.map(([x, y], i) => (
        <View key={`s${i}`} style={[styles.star, { left: x * width, top: y * height, opacity: 0.4 + (i % 3) * 0.2 }]} />
      ))}
      <View style={[styles.moon, { left: width * 0.74, top: height * 0.07 }]} />

      {/* Projektör ışık hüzmeleri */}
      <View style={[styles.beam, { left: width * 0.1 - 35, top: height * 0.13, height: height * 0.62, transform: [{ rotate: "-24deg" }] }]} />
      <View style={[styles.beam, { right: width * 0.1 - 35, top: height * 0.13, height: height * 0.62, transform: [{ rotate: "24deg" }] }]} />
      <View style={[styles.pole, { left: width * 0.1, top: height * 0.13, height: standTop - height * 0.13 }]} />
      <View style={[styles.pole, { right: width * 0.1, top: height * 0.13, height: standTop - height * 0.13 }]} />
      <View style={[styles.lamp, { left: width * 0.1 - 17, top: height * 0.13 - 10 }]} />
      <View style={[styles.lamp, { right: width * 0.1 - 17, top: height * 0.13 - 10 }]} />

      {/* Şehir siluetleri ve ışıklı pencereler */}
      {TOWERS.map(([x, w, h], i) => (
        <View key={`t${i}`} style={[styles.tower, { left: x * width, width: w * width, height: h, top: standTop - h }]}>
          {Array.from({ length: Math.floor(h / 34) }, (_, row) => (
            <View key={row} style={styles.windowRow}>
              {[0, 1].map((col) => (
                <View key={col} style={[styles.window, (i + row + col) % 3 === 0 && styles.windowOff]} />
              ))}
            </View>
          ))}
        </View>
      ))}

      {/* Tribün + saha */}
      <View style={[styles.stand, { top: standTop, height: height * 0.11 }]}>
        <View style={styles.standLip} />
        {Array.from({ length: 3 }, (_, row) => (
          <View key={row} style={styles.crowdRow}>
            {Array.from({ length: 16 }, (_, k) => (
              <View key={k} style={[styles.head, (k + row) % 4 === 0 && styles.headLit]} />
            ))}
          </View>
        ))}
      </View>
      <LinearGradient colors={QUIZ.pitch} start={TOP} end={BOTTOM} style={[styles.pitch, { top: standTop + height * 0.11 }]}>
        <View style={[styles.pitchArc, { width: width * 0.7, height: width * 0.7, borderRadius: width * 0.35, left: width * 0.15 }]} />
      </LinearGradient>
    </View>
  );
});

/* ═════════════════════════ 3B DÜĞME ═════════════════════════ */

export interface CartoonButtonProps {
  label?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  tone?: QuizToneName;
  size?: "sm" | "md" | "lg";
  onPress?: () => void;
  disabled?: boolean;
  loading?: boolean;
  /** Renk tonu disabled iken de korunur (yalnız soluklaşır). */
  keepTone?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  /** Yüzün içine özel içerik (şık düğmesi gibi). Verilirse label/icon yerine geçer. */
  children?: ReactNode;
  faceStyle?: StyleProp<ViewStyle>;
  haptic?: boolean;
}

const LIP = { sm: 4, md: 5, lg: 6 } as const;
const HEIGHT = { sm: 40, md: 50, lg: 60 } as const;

export function CartoonButton({
  label,
  icon,
  tone = "green",
  size = "md",
  onPress,
  disabled,
  loading,
  keepTone,
  accessibilityLabel,
  style,
  children,
  faceStyle,
  haptic = true,
}: CartoonButtonProps) {
  const sink = useRef(new Animated.Value(0)).current;
  const lip = LIP[size];
  const off = disabled && !keepTone;
  const t = QUIZ_TONES[off ? "ghost" : tone];
  const pressTo = (to: number) =>
    Animated.timing(sink, { toValue: to, duration: to ? 60 : 120, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  const corner = size === "sm" ? radius.md : radius.lg;
  const textColor = tone === "gold" && !off ? CARTOON.goldInk : CARTOON.white;
  return (
    <Pressable
      onPress={() => {
        if (haptic) haptics.light();
        onPress?.();
      }}
      onPressIn={() => pressTo(1)}
      onPressOut={() => pressTo(0)}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: Boolean(disabled), busy: Boolean(loading) }}
      style={[{ paddingBottom: lip }, style]}
    >
      <View style={[styles.lip, { top: lip, borderRadius: corner, backgroundColor: t.lip }]} />
      <Animated.View
        style={[
          styles.face,
          { minHeight: children ? undefined : HEIGHT[size], borderRadius: corner },
          { transform: [{ translateY: sink.interpolate({ inputRange: [0, 1], outputRange: [0, lip] }) }] },
          faceStyle,
        ]}
      >
        <LinearGradient colors={t.fill} start={TOP} end={BOTTOM} style={StyleSheet.absoluteFill} />
        <View style={[styles.shine, { borderRadius: corner }]} />
        {children ?? (
          <View style={styles.btnRow}>
            {loading ? (
              <ActivityIndicator color={textColor} size="small" />
            ) : icon ? (
              <Ionicons name={icon} size={size === "lg" ? 22 : size === "md" ? 19 : 16} color={textColor} />
            ) : null}
            {label ? (
              <Text
                style={[size === "lg" ? styles.btnTextLg : size === "md" ? styles.btnText : styles.btnTextSm, { color: textColor }, textColor === CARTOON.white && styles.shadowed]}
                numberOfLines={1}
                {...textScale.badge}
              >
                {upperTR(label)}
              </Text>
            ) : null}
          </View>
        )}
      </Animated.View>
    </Pressable>
  );
}

/** Köşe düğmesi: yuvarlak 3B ikon (duraklat, ses, rekor tablosu). */
export function RoundButton({
  icon,
  onPress,
  accessibilityLabel,
  tone = "navy",
  size = 46,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  accessibilityLabel: string;
  tone?: QuizToneName;
  size?: number;
}) {
  const sink = useRef(new Animated.Value(0)).current;
  const t = QUIZ_TONES[tone];
  const lip = 4;
  const pressTo = (to: number) => Animated.timing(sink, { toValue: to, duration: to ? 60 : 120, useNativeDriver: true }).start();
  return (
    <Pressable
      onPress={() => {
        haptics.light();
        onPress();
      }}
      onPressIn={() => pressTo(1)}
      onPressOut={() => pressTo(0)}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={{ width: size, height: size + lip }}
    >
      <View style={[styles.roundLip, { width: size, height: size, borderRadius: size / 2, top: lip, backgroundColor: t.lip }]} />
      <Animated.View
        style={[
          styles.roundFace,
          { width: size, height: size, borderRadius: size / 2 },
          { transform: [{ translateY: sink.interpolate({ inputRange: [0, 1], outputRange: [0, lip] }) }] },
        ]}
      >
        <LinearGradient colors={t.fill} start={TOP} end={BOTTOM} style={StyleSheet.absoluteFill} />
        <View style={[styles.roundShine, { borderRadius: size / 2 }]} />
        <Ionicons name={icon} size={Math.round(size * 0.46)} color={tone === "gold" ? CARTOON.goldInk : CARTOON.white} />
      </Animated.View>
    </Pressable>
  );
}

/* ═════════════════════════ HAP, PANEL, KURDELE ═════════════════════════ */

/** Arcade HUD hapı: lacivert, beyaz rakam. */
export function NavyPill({
  children,
  style,
  hot,
  accessibilityLabel,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  hot?: boolean;
  accessibilityLabel?: string;
}) {
  return (
    <View style={[styles.pill, hot && styles.pillHot, style]} accessible={Boolean(accessibilityLabel)} accessibilityLabel={accessibilityLabel}>
      <LinearGradient colors={hot ? CARTOON.orange : CARTOON.pill} start={TOP} end={BOTTOM} style={StyleSheet.absoluteFill} />
      {children}
    </View>
  );
}

/** Beyaz çizgi film kartı: lacivert kontur + alt dudak. */
export function CartoonPanel({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={styles.panelWrap}>
      <View style={styles.panelLip} />
      <View style={[styles.panel, style]}>{children}</View>
    </View>
  );
}

/** Kartın üst kenarına oturan kurdele. */
export function Ribbon({ label, icon, fill = QUIZ.ribbon }: { label: string; icon?: keyof typeof Ionicons.glyphMap; fill?: readonly [string, string] }) {
  const ink = fill === QUIZ.ribbonGold ? CARTOON.goldInk : CARTOON.white;
  return (
    <View style={styles.ribbon}>
      <LinearGradient colors={fill} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
      <View style={styles.ribbonShine} />
      {icon ? <Ionicons name={icon} size={16} color={ink} /> : null}
      <Text style={[styles.ribbonText, { color: ink }, ink === CARTOON.white && styles.shadowed]} numberOfLines={1} {...textScale.badge}>
        {upperTR(label)}
      </Text>
    </View>
  );
}

/** Yuvarlak ikon kabarcığı (giriş kartı, kurallar). */
export function IconBubble({ icon, tone = "orange", size = 56 }: { icon: keyof typeof Ionicons.glyphMap; tone?: QuizToneName; size?: number }) {
  const t = QUIZ_TONES[tone];
  return (
    <View style={[styles.bubble, { width: size, height: size, borderRadius: size / 2 }]}>
      <LinearGradient colors={t.fill} start={TOP} end={BOTTOM} style={StyleSheet.absoluteFill} />
      <View style={[styles.roundShine, { borderRadius: size / 2 }]} />
      <Ionicons name={icon} size={Math.round(size * 0.48)} color={tone === "gold" ? CARTOON.goldInk : CARTOON.white} />
    </View>
  );
}

/* ═════════════════════════ MOLA KARTI ═════════════════════════ */

export function PauseOverlay({
  visible,
  onResume,
  onExit,
  extra,
  note,
  resumeLabel = "Devam et",
}: {
  visible: boolean;
  onResume: () => void;
  onExit: () => void;
  /** Ek düğmeler (rekor tablosu, ses…). */
  extra?: ReactNode;
  note?: string;
  resumeLabel?: string;
}) {
  const reduceMotion = useReduceMotion();
  const pop = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!visible) {
      pop.setValue(0);
      return;
    }
    if (reduceMotion) pop.setValue(1);
    else Animated.spring(pop, { toValue: 1, friction: 6, tension: 120, useNativeDriver: true }).start();
  }, [visible, pop, reduceMotion]);
  if (!visible) return null;
  return (
    <View style={styles.overlay} accessibilityViewIsModal>
      <Animated.View style={[styles.scrim, { opacity: pop.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: "clamp" }) }]} />
      <Animated.View
        style={[
          styles.pauseWrap,
          { transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) }], opacity: pop.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 1], extrapolate: "clamp" }) },
        ]}
      >
        <CartoonPanel style={styles.pauseCard}>
          <View style={styles.pauseIcon}>
            <IconBubble icon="pause" tone="purple" size={64} />
          </View>
          <Text style={styles.pauseTitle} {...textScale.dense}>
            Oyun duraklatıldı
          </Text>
          {note ? (
            <Text style={styles.pauseNote} {...textScale.long}>
              {note}
            </Text>
          ) : null}
          <CartoonButton label={resumeLabel} icon="play" tone="green" size="lg" onPress={onResume} style={styles.stretch} />
          <CartoonButton label="Oyundan çık" icon="exit-outline" tone="red" size="md" onPress={onExit} style={styles.stretch} />
          {extra ? <View style={styles.pauseExtra}>{extra}</View> : null}
        </CartoonPanel>
        <View style={styles.pauseRibbon} pointerEvents="none">
          <Ribbon label="Mola" icon="cafe" />
        </View>
      </Animated.View>
    </View>
  );
}

/* ═════════════════════════ PARLAMA ═════════════════════════ */

/** Doğru/yanlış anında bütün ekranı bir an yeşil/kırmızı boyar (sonlu). */
export function useFlash() {
  const value = useRef(new Animated.Value(0)).current;
  const fire = useCallback(() => {
    value.setValue(0);
    Animated.sequence([
      Animated.timing(value, { toValue: 1, duration: 90, useNativeDriver: true }),
      Animated.timing(value, { toValue: 0, duration: 520, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start();
  }, [value]);
  return { value, fire };
}

export function FlashLayer({ value, ok }: { value: Animated.Value; ok: boolean }) {
  return <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: ok ? QUIZ.flashOk : QUIZ.flashBad, opacity: value }]} />;
}

/** Doğru şık zıplar, yanlış seçim sallanır (sonlu animasyonlar). */
export function useAnswerFx(good: boolean, bad: boolean) {
  const reduceMotion = useReduceMotion();
  const scale = useRef(new Animated.Value(1)).current;
  const x = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!good || reduceMotion) return;
    scale.setValue(1.12);
    Animated.spring(scale, { toValue: 1, friction: 3, tension: 160, useNativeDriver: true }).start();
  }, [good, reduceMotion, scale]);
  useEffect(() => {
    if (!bad || reduceMotion) return;
    Animated.sequence([12, -10, 8, -5, 2, 0].map((toValue) => Animated.timing(x, { toValue, duration: 45, useNativeDriver: true }))).start();
  }, [bad, reduceMotion, x]);
  return { style: { transform: [{ scale }, { translateX: x }] } };
}

/** Çocuğunu yaylı bir "pop" ile getirir (anahtar değişince yeniden oynar). */
export function PopIn({ children, style, delay = 0 }: { children: ReactNode; style?: StyleProp<ViewStyle>; delay?: number }) {
  const reduceMotion = useReduceMotion();
  const v = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;
  useEffect(() => {
    if (reduceMotion) return;
    Animated.sequence([Animated.delay(delay), Animated.spring(v, { toValue: 1, friction: 6, tension: 90, useNativeDriver: true })]).start();
  }, [v, delay, reduceMotion]);
  return (
    <Animated.View
      style={[style, { opacity: v.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 1, 1], extrapolate: "clamp" }), transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }, { scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) }] }]}
    >
      {children}
    </Animated.View>
  );
}

/* ═════════════════════════ STİLLER ═════════════════════════ */

export const cartoonText = StyleSheet.create({
  shadow: { textShadowColor: CARTOON.textShadow, textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0 },
});

const styles = StyleSheet.create({
  stretch: { alignSelf: "stretch" },
  dim: { opacity: 0.5 },
  shadowed: { textShadowColor: CARTOON.textShadow, textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0 },

  star: { position: "absolute", width: 3, height: 3, borderRadius: 2, backgroundColor: QUIZ.star },
  moon: { position: "absolute", width: 46, height: 46, borderRadius: radius.pill, backgroundColor: CARTOON.moon, opacity: 0.9 },
  beam: {
    position: "absolute",
    width: 70,
    backgroundColor: QUIZ.beam,
    borderBottomLeftRadius: radius.pill,
    borderBottomRightRadius: radius.pill,
    transformOrigin: "top",
  },
  pole: { position: "absolute", width: 6, backgroundColor: QUIZ.pole },
  lamp: { position: "absolute", width: 40, height: 16, borderRadius: radius.xs, backgroundColor: QUIZ.lamp, borderWidth: 2, borderColor: CARTOON.outline },
  tower: { position: "absolute", backgroundColor: CARTOON.skyline, paddingTop: space.md, gap: space.md, alignItems: "center" },
  windowRow: { flexDirection: "row", gap: space.sm },
  window: { width: 7, height: 9, backgroundColor: CARTOON.window, borderRadius: 1 },
  windowOff: { opacity: 0.15 },
  stand: { position: "absolute", left: 0, right: 0, backgroundColor: QUIZ.stand, paddingTop: space.sm, gap: space.xs, overflow: "hidden" },
  standLip: { position: "absolute", top: 0, left: 0, right: 0, height: 5, backgroundColor: QUIZ.standTop },
  crowdRow: { flexDirection: "row", justifyContent: "space-around" },
  head: { width: 9, height: 9, borderRadius: radius.xs, backgroundColor: QUIZ.crowd },
  headLit: { backgroundColor: CARTOON.skylineFar },
  pitch: { position: "absolute", left: 0, right: 0, bottom: 0, overflow: "hidden" },
  pitchArc: { position: "absolute", top: -12, borderWidth: 3, borderColor: QUIZ.pitchLine },

  lip: { position: "absolute", left: 0, right: 0, bottom: 0, borderWidth: OUTLINE, borderColor: CARTOON.outline },
  face: {
    borderWidth: OUTLINE,
    borderColor: CARTOON.outline,
    overflow: "hidden",
    justifyContent: "center",
    paddingHorizontal: space.lg,
  },
  shine: { position: "absolute", top: 3, left: 8, right: 8, height: "32%", backgroundColor: CARTOON.shine },
  btnRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.sm },
  btnTextLg: { ...type.h1, fontFamily: fonts.bold, letterSpacing: 0.6 },
  btnText: { ...type.h2, fontFamily: fonts.bold, letterSpacing: 0.5 },
  btnTextSm: { ...type.label, fontFamily: fonts.bold, letterSpacing: 0.4 },

  roundLip: { position: "absolute", left: 0, borderWidth: OUTLINE, borderColor: CARTOON.outline },
  roundFace: { alignItems: "center", justifyContent: "center", overflow: "hidden", borderWidth: OUTLINE, borderColor: CARTOON.outline },
  roundShine: { position: "absolute", top: 3, left: "20%", right: "20%", height: "30%", backgroundColor: CARTOON.shine },

  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    minHeight: 36,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: CARTOON.outline,
  },
  pillHot: { borderColor: CARTOON.orangeLip },

  panelWrap: { alignSelf: "stretch" },
  panelLip: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 6,
    bottom: -6,
    borderRadius: radius.xxl,
    backgroundColor: CARTOON.outline,
  },
  panel: {
    backgroundColor: CARTOON.card,
    borderRadius: radius.xxl,
    borderWidth: OUTLINE,
    borderColor: CARTOON.outline,
    padding: space.lg,
  },

  ribbon: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    alignSelf: "center",
    paddingHorizontal: space.xl,
    paddingVertical: space.s,
    borderRadius: radius.md,
    borderWidth: OUTLINE,
    borderColor: CARTOON.outline,
    overflow: "hidden",
  },
  ribbonShine: { position: "absolute", top: 2, left: 6, right: 6, height: "35%", borderRadius: radius.xs, backgroundColor: CARTOON.shine },
  ribbonText: { ...type.h2, fontFamily: fonts.bold, letterSpacing: 1.2 },

  bubble: { alignItems: "center", justifyContent: "center", overflow: "hidden", borderWidth: OUTLINE, borderColor: CARTOON.outline },

  overlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", padding: space.xl, zIndex: 50 },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: CARTOON.dim },
  pauseWrap: { width: "100%", maxWidth: 360, paddingTop: 18 },
  pauseRibbon: { position: "absolute", top: 0, left: 0, right: 0, alignItems: "center" },
  pauseCard: { alignItems: "center", gap: space.md, paddingTop: space.xxxl },
  pauseIcon: { marginTop: -space.xs },
  pauseTitle: { ...type.display, fontFamily: fonts.bold, color: CARTOON.cardInk, textAlign: "center" },
  pauseNote: { ...type.bodySm, fontFamily: fonts.semibold, color: CARTOON.cardMuted, textAlign: "center" },
  pauseExtra: { flexDirection: "row", gap: space.sm, alignSelf: "stretch" },
});
