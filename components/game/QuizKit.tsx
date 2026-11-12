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
import { memo, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Animated,
  AppState,
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
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";

import { useReduceMotion } from "@/components/ui";
import { CARTOON } from "@/lib/game/cartoon";
import { QUIZ, QUIZ_TONES, type QuizToneName } from "@/lib/game/quizPalette";
import { fonts, haptics, radius, space, textScale, type, upperTR } from "@/theme";

export const OUTLINE = 1;
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

/* ═════════════════════════ CANLILIK: SONLU ORTAK SAATLER ═════════════════════════ */

/**
 * Ekran odakta ve uygulama ön planda mı, ve oyun duraklatılmamış mı?
 * Ortam animasyonları (zemin, düğme nefesi, parlama) yalnız bu `true` iken
 * akar; "hareketi azalt" açıksa daima `false`.
 */
export function useAmbient(paused = false) {
  const reduceMotion = useReduceMotion();
  const [focused, setFocused] = useState(true);
  const [foreground, setForeground] = useState(AppState.currentState !== "background" && AppState.currentState !== "inactive");
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => setForeground(state === "active"));
    return () => sub.remove();
  }, []);
  return focused && foreground && !paused && !reduceMotion;
}

/** ~40 dakikalık tavan: döngüler sonludur (tasarım kuralı), oyun bundan kısa sürer. */
const AMBIENT_SPAN_MS = 40 * 60_000;

/**
 * Paylaşılan 0→1 testere saati (yerel sürücü). `active` false olunca olduğu
 * yerde donar, yeniden açılınca kaldığı fazdan sürer; söküldüğünde durur.
 * Bütün ortam parçaları bu tek değerden `interpolate` ile türetilir.
 */
export function useLoopClock(duration: number, active: boolean) {
  const v = useRef(new Animated.Value(0)).current;
  const last = useRef(0);
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let loop: Animated.CompositeAnimation | null = null;
    const iterations = Math.max(1, Math.ceil(AMBIENT_SPAN_MS / duration));
    const startLoop = () => {
      if (cancelled) return;
      v.setValue(0);
      loop = Animated.loop(Animated.timing(v, { toValue: 1, duration, easing: Easing.linear, useNativeDriver: true }), { iterations });
      loop.start();
    };
    const from = last.current;
    let head: Animated.CompositeAnimation | null = null;
    if (from > 0.002 && from < 0.998) {
      v.setValue(from);
      head = Animated.timing(v, { toValue: 1, duration: duration * (1 - from), easing: Easing.linear, useNativeDriver: true });
      head.start(({ finished }) => finished && startLoop());
    } else startLoop();
    return () => {
      cancelled = true;
      head?.stop();
      loop?.stop();
      v.stopAnimation((value) => {
        last.current = value;
      });
    };
  }, [active, duration, v]);
  return v;
}

type Clock = Animated.Value | Animated.AnimatedInterpolation<number>;

/** Saatten yumuşak (kosinüs) bir dalga: `phase` 0..1 kaydırır; lo → hi → lo. */
export function wave(clock: Clock, phase: number, lo: number, hi: number, samples = 12) {
  const inputRange: number[] = [];
  const outputRange: number[] = [];
  for (let k = 0; k <= samples; k++) {
    const t = k / samples;
    inputRange.push(t);
    outputRange.push(lo + (hi - lo) * (0.5 - 0.5 * Math.cos(2 * Math.PI * (t + phase))));
  }
  return clock.interpolate({ inputRange, outputRange });
}

/* ═════════════════════════ ZEMİN: SAKİN GECE ═════════════════════════ */

/**
 * Sade zemin: koyu indigo degrade, üstte tek yumuşak ışık halesi (çok yavaş
 * nefes alır) ve altta silik bir saha çizgisi. Kalabalık süs yok — göz soruda
 * kalsın. Hale ortak sonlu saatle yerel sürücüde akar; `paused`/odak dışı/arka
 * planda donar, "hareketi azalt"ta durağandır.
 */
export const QuizBackdrop = memo(function QuizBackdrop({ paused = false }: { paused?: boolean }) {
  const { width, height } = useWindowDimensions();
  const live = useAmbient(paused);
  const glowClock = useLoopClock(9000, live);
  const glow = Math.max(width, height * 0.55) * 1.2;
  return (
    <View style={[StyleSheet.absoluteFill, styles.clip]} pointerEvents="none">
      <LinearGradient colors={QUIZ.base} start={TOP} end={BOTTOM} style={StyleSheet.absoluteFill} />
      <Animated.View
        style={[
          styles.glow,
          { width: glow, height: glow, left: (width - glow) / 2, top: -glow * 0.45 },
          { opacity: wave(glowClock, 0, 0.75, 1), transform: [{ scale: wave(glowClock, 0, 0.94, 1.04) }] },
        ]}
      >
        <Svg width={glow} height={glow}>
          <Defs>
            <RadialGradient id="quizGlow" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={QUIZ.glow} stopOpacity={0.32} />
              <Stop offset="0.6" stopColor={QUIZ.glow} stopOpacity={0.08} />
              <Stop offset="1" stopColor={QUIZ.glow} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect x="0" y="0" width={glow} height={glow} fill="url(#quizGlow)" />
        </Svg>
      </Animated.View>
      <View
        style={[
          styles.pitchArc,
          { width: width * 0.9, height: width * 0.9, borderRadius: width * 0.45, left: width * 0.05, top: height - width * 0.28 },
        ]}
      />
      <View style={[styles.pitchLine, { top: height - width * 0.28 + width * 0.45 }]} />
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

const LIP = { sm: 3, md: 3, lg: 4 } as const;
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
        <View style={styles.shine} />
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
  shine = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  accessibilityLabel: string;
  tone?: QuizToneName;
  size?: number;
  /** Yüzeyde ara ara kayan parlama şeridi (ortam canlıyken `true` ver). */
  shine?: boolean;
}) {
  const sink = useRef(new Animated.Value(0)).current;
  const glint = useLoopClock(4600, shine);
  const t = QUIZ_TONES[tone];
  const lip = 2;
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
        <Animated.View
          style={[
            styles.glint,
            {
              width: size * 0.26,
              height: size * 1.6,
              top: -size * 0.3,
              transform: [{ translateX: glint.interpolate({ inputRange: [0, 0.2, 1], outputRange: [-size, size, size] }) }, { rotate: "24deg" }],
            },
          ]}
        />
        <Ionicons name={icon} size={Math.round(size * 0.46)} color={tone === "gold" ? CARTOON.goldInk : CARTOON.white} />
      </Animated.View>
    </Pressable>
  );
}

/* ═════════════════════════ HAP, PANEL, KURDELE ═════════════════════════ */

/**
 * Değer değişince yaylı "zıplama" (ilk çizimde oynamaz). Yay 0'ın altına da
 * taşar: büyür → hafif küçülür → oturur. Sonludur.
 */
export function useBump(key: unknown, amount = 0.22) {
  const reduceMotion = useReduceMotion();
  const v = useRef(new Animated.Value(0)).current;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (reduceMotion) return;
    v.setValue(1);
    Animated.spring(v, { toValue: 0, friction: 3.5, tension: 170, useNativeDriver: true }).start();
  }, [key, reduceMotion, v]);
  return { value: v, style: { transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 1 + amount] }) }] } };
}

/** Arcade HUD hapı: lacivert, beyaz rakam. `bumpKey` değişince zıplar, `glowKey` değişince ateş halkası patlar. */
export function NavyPill({
  children,
  style,
  hot,
  accessibilityLabel,
  bumpKey,
  glowKey,
  outerStyle,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  hot?: boolean;
  accessibilityLabel?: string;
  bumpKey?: string | number;
  glowKey?: string | number;
  /** Zıplayan dış sarmalayıcının yerleşimi (flexShrink gibi). */
  outerStyle?: StyleProp<ViewStyle>;
}) {
  const pill = (
    <View style={[styles.pill, hot && styles.pillHot, style]} accessible={Boolean(accessibilityLabel)} accessibilityLabel={accessibilityLabel}>
      {children}
    </View>
  );
  if (bumpKey === undefined && glowKey === undefined) return pill;
  return (
    <BumpWrap bumpKey={bumpKey} glowKey={glowKey} style={outerStyle}>
      {pill}
    </BumpWrap>
  );
}

function BumpWrap({ bumpKey, glowKey, style, children }: { bumpKey?: string | number; glowKey?: string | number; style?: StyleProp<ViewStyle>; children: ReactNode }) {
  const bump = useBump(bumpKey);
  const glow = useBump(glowKey, 1);
  return (
    <Animated.View style={[style, bump.style]}>
      {glowKey !== undefined ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.pillGlow,
            {
              opacity: glow.value.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 0.9, 0.2], extrapolate: "clamp" }),
              transform: [{ scaleX: glow.value.interpolate({ inputRange: [0, 1], outputRange: [1, 1.7], extrapolate: "clamp" }) }, { scaleY: glow.value.interpolate({ inputRange: [0, 1], outputRange: [1, 2.2], extrapolate: "clamp" }) }],
            },
          ]}
        />
      ) : null}
      {children}
    </Animated.View>
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
      {icon ? <Ionicons name={icon} size={14} color={ink} /> : null}
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
            <IconBubble icon="pause" tone="indigo" size={56} />
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

/**
 * Çocuğunu yaylı bir "pop" ile getirir (anahtar değişince yeniden oynar).
 * `from="right"`: sağdan dönerek süzülür (soru kartı); `bouncy`: daha
 * gevşek yay, hedefi aşıp geri oturur (şıklar).
 */
export function PopIn({
  children,
  style,
  delay = 0,
  from = "up",
  bouncy = false,
  skip = false,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  delay?: number;
  from?: "up" | "right";
  bouncy?: boolean;
  /** Animasyonsuz, doğrudan yerinde çiz. */
  skip?: boolean;
}) {
  const reduceMotion = useReduceMotion();
  const still = reduceMotion || skip;
  const v = useRef(new Animated.Value(still ? 1 : 0)).current;
  useEffect(() => {
    if (still) return;
    const spring = bouncy || from === "right" ? { friction: 5, tension: 120 } : { friction: 6, tension: 90 };
    const anim = Animated.sequence([Animated.delay(delay), Animated.spring(v, { toValue: 1, ...spring, useNativeDriver: true })]);
    anim.start();
    return () => anim.stop();
  }, [v, delay, still, bouncy, from]);
  const transform =
    from === "right"
      ? [
          { translateX: v.interpolate({ inputRange: [0, 1], outputRange: [90, 0] }) },
          { rotate: v.interpolate({ inputRange: [0, 1], outputRange: ["7deg", "0deg"] }) },
          { scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) },
        ]
      : [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [bouncy ? 36 : 24, 0] }) }, { scale: v.interpolate({ inputRange: [0, 1], outputRange: [bouncy ? 0.75 : 0.9, 1] }) }];
  return <Animated.View style={[style, { opacity: v.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 1, 1], extrapolate: "clamp" }), transform }]}>{children}</Animated.View>;
}

/** Boşta nefes alan düğme ölçeği: ortak saatten, sıraya göre kaydırılmış. */
export function breathStyle(clock: Animated.Value, index: number) {
  return { transform: [{ scale: wave(clock, index * 0.18, 1, 1.012) }] };
}

/**
 * Son saniyeler: her saniye değiştiğinde süre çubuğu sallanır ve nabız atar
 * (`on` iken). `pulse` 1→0 yayı kırmızı haleyi sürer. Sonludur.
 */
export function useUrgency(seconds: number, on: boolean) {
  const reduceMotion = useReduceMotion();
  const x = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!on || reduceMotion) return;
    pulse.setValue(1);
    Animated.parallel([
      Animated.spring(pulse, { toValue: 0, friction: 4, tension: 120, useNativeDriver: true }),
      Animated.sequence([3, -3, 2, -1, 0].map((toValue) => Animated.timing(x, { toValue, duration: 38, useNativeDriver: true }))),
    ]).start();
  }, [seconds, on, reduceMotion, pulse, x]);
  return {
    pulse,
    style: { transform: [{ translateX: x }, { scaleY: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.1] }) }] },
  };
}

/** Bütün ekranı sarsan kısa titreşim (yanlış cevap). */
export function useScreenShake() {
  const reduceMotion = useReduceMotion();
  const x = useRef(new Animated.Value(0)).current;
  const y = useRef(new Animated.Value(0)).current;
  const fire = useCallback(() => {
    if (reduceMotion) return;
    const steps = [
      [8, -2],
      [-7, 2],
      [5, -1],
      [-3, 1],
      [0, 0],
    ];
    Animated.parallel([
      Animated.sequence(steps.map(([toValue]) => Animated.timing(x, { toValue, duration: 45, useNativeDriver: true }))),
      Animated.sequence(steps.map(([, toValue]) => Animated.timing(y, { toValue, duration: 45, useNativeDriver: true }))),
    ]).start();
  }, [reduceMotion, x, y]);
  return { fire, style: { transform: [{ translateX: x }, { translateY: y }] } };
}

/**
 * Doğru cevapta yıldızlar `from` noktasından kavis çizerek puan hapına
 * (`to`) uçar; ilki varınca `onArrive` çağrılır (hap zıplasın). Sonlu;
 * "hareketi azalt"ta çizilmez.
 */
export function StarFlight({
  trigger,
  from,
  to,
  count = 4,
  onArrive,
}: {
  trigger: number;
  from: { x: number; y: number };
  to: { x: number; y: number };
  count?: number;
  onArrive?: () => void;
}) {
  const reduceMotion = useReduceMotion();
  const anims = useRef(Array.from({ length: 8 }, () => new Animated.Value(0))).current;
  const arrive = useRef(onArrive);
  arrive.current = onArrive;
  useEffect(() => {
    if (!trigger || reduceMotion) return;
    anims.forEach((a) => a.setValue(0));
    const run = Animated.stagger(
      55,
      anims.slice(0, count).map((a) => Animated.timing(a, { toValue: 1, duration: 720, easing: Easing.in(Easing.quad), useNativeDriver: true })),
    );
    let landed = false;
    const t = setTimeout(() => {
      landed = true;
      arrive.current?.();
    }, 720);
    run.start();
    return () => {
      if (!landed) clearTimeout(t);
    };
  }, [trigger, reduceMotion, anims, count]);
  if (!trigger || reduceMotion) return null;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {anims.slice(0, count).map((a, i) => {
        const spread = (i - (count - 1) / 2) * 26;
        return (
          <Animated.View
            key={`${trigger}-${i}`}
            style={[
              styles.flyStar,
              {
                left: from.x - 13,
                top: from.y - 13,
                opacity: a.interpolate({ inputRange: [0, 0.08, 0.9, 1], outputRange: [0, 1, 1, 0] }),
                transform: [
                  { translateX: a.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, spread, dx] }) },
                  { translateY: a.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, -50 - (i % 2) * 24, dy] }) },
                  { rotate: a.interpolate({ inputRange: [0, 1], outputRange: ["0deg", i % 2 ? "160deg" : "-160deg"] }) },
                  { scale: a.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0.4, 1.1, 0.5] }) },
                ],
              },
            ]}
          >
            <Ionicons name="star" size={20} color={QUIZ.accent} />
          </Animated.View>
        );
      })}
    </View>
  );
}

/**
 * Ekranı soldan sağa süpüren kurdele afiş ("SEVİYE 3!"). `trigger` her
 * arttığında bir kez oynar; dekoratiftir (bilgi HUD'da da yazar).
 */
export function SweepBanner({
  trigger,
  label,
  icon = "trending-up",
  top = 0.36,
  fill = QUIZ.ribbonGold,
}: {
  trigger: number;
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  top?: number;
  fill?: readonly [string, string];
}) {
  const reduceMotion = useReduceMotion();
  const { width, height } = useWindowDimensions();
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!trigger || reduceMotion) return;
    v.setValue(0);
    const anim = Animated.sequence([
      Animated.spring(v, { toValue: 1, friction: 7, tension: 70, useNativeDriver: true }),
      Animated.delay(700),
      Animated.timing(v, { toValue: 2, duration: 380, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
    ]);
    anim.start();
    return () => anim.stop();
  }, [trigger, reduceMotion, v]);
  if (!trigger || reduceMotion) return null;
  const ink = fill === QUIZ.ribbonGold ? CARTOON.goldInk : CARTOON.white;
  return (
    <Animated.View
      pointerEvents="none"
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={[
        styles.banner,
        {
          top: height * top,
          opacity: v.interpolate({ inputRange: [0, 0.2, 1.8, 2], outputRange: [0, 1, 1, 0] }),
          transform: [{ translateX: v.interpolate({ inputRange: [0, 1, 2], outputRange: [-width, 0, width] }) }],
        },
      ]}
    >
      <LinearGradient colors={fill} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
      <Ionicons name={icon} size={22} color={ink} />
      <Text style={[styles.bannerText, { color: ink }, ink === CARTOON.white && styles.shadowed]} numberOfLines={1} {...textScale.badge}>
        {upperTR(label)}
      </Text>
    </Animated.View>
  );
}

/* ═════════════════════════ STİLLER ═════════════════════════ */

export const cartoonText = StyleSheet.create({
  shadow: { textShadowColor: QUIZ.textShadow, textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },
});

const styles = StyleSheet.create({
  clip: { overflow: "hidden" },
  stretch: { alignSelf: "stretch" },
  dim: { opacity: 0.5 },
  shadowed: { textShadowColor: QUIZ.textShadow, textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },

  glow: { position: "absolute" },
  pitchArc: { position: "absolute", borderWidth: 1.5, borderColor: QUIZ.pitchFaint },
  pitchLine: { position: "absolute", left: 0, right: 0, height: 1.5, backgroundColor: QUIZ.pitchFaint },

  lip: { position: "absolute", left: 0, right: 0, bottom: 0 },
  face: {
    overflow: "hidden",
    justifyContent: "center",
    paddingHorizontal: space.lg,
  },
  shine: { position: "absolute", top: 0, left: 0, right: 0, height: "45%", backgroundColor: QUIZ.shineFaint },
  btnRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.sm },
  btnTextLg: { ...type.h1, fontFamily: fonts.bold, letterSpacing: 0.6 },
  btnText: { ...type.h2, fontFamily: fonts.bold, letterSpacing: 0.5 },
  btnTextSm: { ...type.label, fontFamily: fonts.bold, letterSpacing: 0.4 },

  roundLip: { position: "absolute", left: 0 },
  roundFace: { alignItems: "center", justifyContent: "center", overflow: "hidden", borderWidth: 1, borderColor: QUIZ.edgeLight },
  roundShine: { position: "absolute", top: 0, left: 0, right: 0, height: "45%", backgroundColor: QUIZ.shineFaint },

  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    minHeight: 36,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    overflow: "hidden",
    backgroundColor: QUIZ.hudPill,
    borderWidth: 1,
    borderColor: QUIZ.edgeLight,
  },
  pillHot: { backgroundColor: QUIZ.hudPillHot, borderColor: QUIZ.accentSoft },
  pillGlow: { ...StyleSheet.absoluteFillObject, borderRadius: radius.pill, backgroundColor: QUIZ.fireGlow },
  glint: { position: "absolute", left: 0, backgroundColor: QUIZ.glint },
  flyStar: { position: "absolute" },
  banner: {
    position: "absolute",
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
    paddingVertical: space.md,
    overflow: "hidden",
    zIndex: 40,
    shadowColor: QUIZ.cardShadow,
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  bannerText: { ...type.h1, fontFamily: fonts.bold, letterSpacing: 1.2 },

  panelWrap: { alignSelf: "stretch" },
  panelLip: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 4,
    bottom: -4,
    borderRadius: radius.xxl,
    backgroundColor: QUIZ.cardLipSoft,
  },
  panel: {
    backgroundColor: CARTOON.card,
    borderRadius: radius.xxl,
    padding: space.lg,
    shadowColor: QUIZ.cardShadow,
    shadowOpacity: 0.3,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },

  ribbon: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    alignSelf: "center",
    paddingHorizontal: space.xl,
    paddingVertical: space.s,
    borderRadius: radius.pill,
    overflow: "hidden",
    shadowColor: QUIZ.cardShadow,
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  ribbonText: { ...type.label, fontFamily: fonts.bold, letterSpacing: 1 },

  bubble: { alignItems: "center", justifyContent: "center", overflow: "hidden" },

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
