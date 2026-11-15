/**
 * IntroSplash — uygulama açılışındaki ElitLig logo animasyonu.
 *
 * NE ZAMAN OYNAR: yalnız SOĞUK AÇILIŞTA. `index.js` kapısı tema ve font hazır
 * olunca yerel splash'i kapatır ve aynı karede bu sahneyi uygulamanın
 * ÜSTÜNE koyar. Uygulama altta normal açılır (veri yüklemesi beklemez);
 * sahne bitince saydamlaşarak uygulamaya geçer ve kaldırılır.
 *   · Tema değişimi yeniden yüklemesinde oynamaz (bkz. lib/themeTransition.ts).
 *   · Arka plandan dönüşte oynamaz: kapı yeniden kurulmaz; kurulsa bile
 *     (Android'de etkinlik yeniden yaratılırsa) modül düzeyindeki `played`
 *     bayrağı aynı JS çalışma ömründe ikinci kez oynatmaz.
 *
 * İLK KARE = YEREL SPLASH: zemin `introColors.stage` (app.json ile eş) ve
 * logo yerel splash'teki ölçüde (72dp görsel) ekranın tam ortasında durur.
 * Görsel BÜYÜK ölçüde yerleşir ve küçültülerek başlar; büyürken rasterin
 * kendisi büyütülmez, 3x ekranda da keskin kalır (kaynak 1024px).
 *
 * SAHNE (~2 sn):
 *   0–120     yerel splash'in birebir devamı (bekleme)
 *   120–760   logo yaylı büyüyerek yerine oturur; mor ışık ve hüzmeler açılır,
 *             logo bu sırada hafif lavantaya söner ("ışıklar kapalı")
 *   640–1500  oturma anında iki halka dalgası, kıvılcım patlaması, çekirdek
 *             parlaması
 *   780–1260  çapraz ışık süpürmesi logoyu soldan sağa yeniden beyaza yakar
 *   900–1300  alt satır yükselerek belirir
 *   1560–2000 sahne hafifçe büyüyüp saydamlaşır, altta uygulama görünür
 *
 * "Hareketi azalt" açıksa: ilk kare kısa bir süre durur ve yalnız solar.
 * Ekrana dokunmak sahneyi anında kapatır (kısa bir solma ile).
 *
 * Tüm hareket Reanimated ile UI iş parçacığında koşar; yeni yerel bağımlılık
 * yoktur (OTA ile gelir). Döngü yok: her değer tek seferlik zamanlamadır.
 */

import React, { memo, useCallback, useEffect, useRef, useState } from "react";
import { Image, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  interpolate,
  Extrapolation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import Svg, { Defs, Ellipse, Path, RadialGradient, Rect, Stop } from "react-native-svg";

import { introColors, type } from "@/theme";

const LOGO = require("../assets/images/splash-icon.png");

/** app.json → expo-splash-screen `imageWidth`. Değişirse burası da değişir. */
const NATIVE_IMAGE_WIDTH = 72;

/* — Zaman çizelgesi (ms) — */
const HOLD = 120;
const GROW = 640;
const LAND = HOLD + GROW - 120; // halkalar logo tam otururken patlar
const SWEEP_AT = 780;
const SWEEP_MS = 480;
const TAGLINE_AT = 900;
const EXIT_AT = 1560;
const EXIT_MS = 440;
const TOTAL = EXIT_AT + EXIT_MS;

/* — Hareketi azalt / dokunarak geçiş — */
const REDUCED_HOLD = 260;
const REDUCED_FADE = 300;
const SKIP_FADE = 220;

/** Hüzme sayısı ve kıvılcım sayısı. */
const RAYS = 18;
const SPARKS = 22;

/** Süpürme penceresinin eğimi. */
const SWEEP_ANGLE = 22;

/** Aynı JS ömründe ikinci kez oynamasın. */
let played = false;

/** Kapı bu sahneyi kurmalı mı? (Soğuk açılışta ilk kez → evet.) */
export function shouldPlayIntro(): boolean {
  return !played;
}

const ease = {
  out: Easing.bezier(0.16, 1, 0.3, 1),
  inOut: Easing.bezier(0.65, 0, 0.35, 1),
  in: Easing.bezier(0.55, 0, 1, 0.45),
};

/**
 * Sabit sözde-rastgele: kıvılcımlar her açılışta aynı yerde doğar
 * (Math.random her açılışta farklı bir "kaza" görüntüsü üretir).
 */
function seeded(i: number, salt: number): number {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

export const IntroSplash = memo(function IntroSplash({ onDone }: { onDone: () => void }) {
  const { width: W, height: H } = useWindowDimensions();
  const reduce = useReducedMotion();

  /* Logonun son ölçüsü; görsel kare (1024×1024). */
  const L = Math.round(Math.min(W * 0.54, 230));
  const startScale = NATIVE_IMAGE_WIDTH / L;

  /* Ana zaman ekseni değerleri. */
  const grow = useSharedValue(0); // 0 → 1: logo büyür
  const stage = useSharedValue(0); // 0 → 1: ışık/hüzme açılır
  const burst = useSharedValue(0); // 0 → 1: halka ve kıvılcım
  const sweep = useSharedValue(0); // 0 → 1: ışık süpürmesi
  const tagline = useSharedValue(0);
  const spin = useSharedValue(0); // hüzmelerin yavaş dönüşü
  const exit = useSharedValue(0); // 0 → 1: çıkış
  const fade = useSharedValue(1); // kökün opaklığı

  const [mounted, setMounted] = useState(true);
  const doneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const finish = useCallback(
    (after: number) => {
      if (doneTimer.current) clearTimeout(doneTimer.current);
      doneTimer.current = setTimeout(() => {
        setMounted(false);
        onDone();
      }, after);
    },
    [onDone],
  );

  useEffect(() => {
    played = true;
    if (reduce) {
      fade.value = withDelay(REDUCED_HOLD, withTiming(0, { duration: REDUCED_FADE }));
      finish(REDUCED_HOLD + REDUCED_FADE + 40);
      return;
    }
    grow.value = withDelay(HOLD, withTiming(1, { duration: GROW, easing: Easing.bezier(0.34, 1.36, 0.5, 1) }));
    stage.value = withDelay(HOLD, withTiming(1, { duration: 560, easing: ease.out }));
    spin.value = withDelay(HOLD, withTiming(1, { duration: TOTAL - HOLD, easing: Easing.linear }));
    burst.value = withDelay(LAND, withTiming(1, { duration: 900, easing: Easing.linear }));
    sweep.value = withDelay(SWEEP_AT, withTiming(1, { duration: SWEEP_MS, easing: ease.inOut }));
    tagline.value = withDelay(TAGLINE_AT, withTiming(1, { duration: 420, easing: ease.out }));
    exit.value = withDelay(EXIT_AT, withTiming(1, { duration: EXIT_MS, easing: ease.in }));
    fade.value = withDelay(EXIT_AT, withSequence(withTiming(1, { duration: 80 }), withTiming(0, { duration: EXIT_MS - 80, easing: ease.out })));
    finish(TOTAL + 40);
    return () => {
      if (doneTimer.current) clearTimeout(doneTimer.current);
    };
    // Sahne yalnız bir kez kurulur.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Dokun → geç. Süren zamanlamalar durdurulur, sahne kısa bir solmayla kalkar. */
  const skip = useCallback(() => {
    cancelAnimation(fade);
    fade.value = withTiming(0, { duration: SKIP_FADE, easing: ease.out });
    finish(SKIP_FADE + 20);
  }, [fade, finish]);

  const rootStyle = useAnimatedStyle(() => ({ opacity: fade.value }));

  /* Arka plan ışığı: düz splash renginden radyal mor sahneye. */
  const glowStyle = useAnimatedStyle(() => ({
    opacity: stage.value,
    transform: [{ scale: interpolate(stage.value, [0, 1], [1.25, 1]) + exit.value * 0.08 }],
  }));

  const raysStyle = useAnimatedStyle(() => ({
    opacity: interpolate(stage.value, [0, 1], [0, 1]) * interpolate(exit.value, [0, 1], [1, 0]),
    transform: [
      { rotate: `${interpolate(spin.value, [0, 1], [-8, 14])}deg` },
      { scale: interpolate(stage.value, [0, 1], [0.6, 1]) },
    ],
  }));

  const logoStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(grow.value, [0, 1], [startScale, 1]) * (1 + exit.value * 0.1) }],
  }));

  /* Logo büyürken lavantaya söner; süpürme onu yeniden beyaza yakar. */
  const whiteBaseStyle = useAnimatedStyle(() => ({
    opacity: interpolate(grow.value, [0.15, 0.7], [1, 0], Extrapolation.CLAMP),
  }));

  /* Logonun arkasındaki çekirdek parlaması: oturma anında nabız. */
  const coreStyle = useAnimatedStyle(() => {
    const pulse = interpolate(burst.value, [0, 0.12, 0.6], [0, 1, 0.45], Extrapolation.CLAMP);
    return {
      opacity: Math.max(stage.value * 0.45, pulse) * interpolate(exit.value, [0, 1], [1, 0.4]),
      transform: [{ scale: interpolate(burst.value, [0, 0.15, 1], [0.8, 1.15, 1], Extrapolation.CLAMP) }],
    };
  });

  const taglineStyle = useAnimatedStyle(() => ({
    opacity: tagline.value * interpolate(exit.value, [0, 0.6], [1, 0], Extrapolation.CLAMP),
    transform: [{ translateY: interpolate(tagline.value, [0, 1], [10, 0]) }],
  }));

  if (!mounted) return null;

  const cx = W / 2;
  const cy = H / 2;
  const R = Math.hypot(W, H) * 0.62; // hüzme yarıçapı: ekran köşelerine taşar
  const tagTop = cy + L * 0.44; // logo çiziminin alt kenarı ≈ merkez + 0.32L

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.root, rootStyle]}>
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={skip}
        accessibilityRole="button"
        accessibilityLabel="ElitLig"
        accessibilityHint="Açılış animasyonunu geçer"
      >
        {/* 1 · Radyal sahne: merkezde menekşe, kenarda derin mor. */}
        <Animated.View style={[StyleSheet.absoluteFill, glowStyle]} pointerEvents="none">
          <Svg width={W} height={H}>
            <Defs>
              <RadialGradient id="introStage" cx="50%" cy="50%" rx="75%" ry="60%" fx="50%" fy="50%">
                <Stop offset="0" stopColor={introColors.violet} stopOpacity={0.95} />
                <Stop offset="0.38" stopColor={introColors.stage} stopOpacity={1} />
                <Stop offset="1" stopColor={introColors.deep} stopOpacity={1} />
              </RadialGradient>
            </Defs>
            <Rect x={0} y={0} width={W} height={H} fill="url(#introStage)" />
          </Svg>
        </Animated.View>

        {/* 2 · Işık hüzmeleri: stadyum projektörü gibi merkezden yayılan sönük kamalar. */}
        <Animated.View
          pointerEvents="none"
          style={[styles.abs, { left: cx - R, top: cy - R, width: R * 2, height: R * 2 }, raysStyle]}
        >
          <Rays radius={R} />
        </Animated.View>

        {/* 3 · Halka dalgaları ve kıvılcımlar. */}
        <Ring progress={burst} cx={cx} cy={cy} size={L * 1.1} delay={0} />
        <Ring progress={burst} cx={cx} cy={cy} size={L * 1.1} delay={0.16} />
        {Array.from({ length: SPARKS }, (_, i) => (
          <Spark key={i} i={i} progress={burst} cx={cx} cy={cy} L={L} />
        ))}

        {/* 4 · Logo: çekirdek ışık + lavanta taban + beyaz taban + süpürme. */}
        <Animated.View
          pointerEvents="none"
          style={[styles.abs, { left: cx - L, top: cy - L, width: L * 2, height: L * 2 }, styles.center, coreStyle]}
        >
          <Svg width={L * 2} height={L * 2}>
            <Defs>
              <RadialGradient id="introCore" cx="50%" cy="50%" rx="50%" ry="50%">
                <Stop offset="0" stopColor={introColors.core} stopOpacity={0.85} />
                <Stop offset="0.4" stopColor={introColors.violet} stopOpacity={0.45} />
                <Stop offset="1" stopColor={introColors.violet} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Ellipse cx={L} cy={L} rx={L} ry={L} fill="url(#introCore)" />
          </Svg>
        </Animated.View>

        <Animated.View
          pointerEvents="none"
          style={[styles.abs, { left: cx - L / 2, top: cy - L / 2, width: L, height: L }, logoStyle]}
        >
          <Image source={LOGO} style={[styles.fill, { tintColor: introColors.logoDim }]} resizeMode="contain" />
          <Animated.View style={[StyleSheet.absoluteFill, whiteBaseStyle]}>
            <Image source={LOGO} style={styles.fill} resizeMode="contain" />
          </Animated.View>
          <SweepReveal progress={sweep} L={L} />
        </Animated.View>

        {/* 5 · Alt satır. */}
        <Animated.View pointerEvents="none" style={[styles.abs, styles.taglineWrap, { top: tagTop }, taglineStyle]}>
          <Text style={styles.tagline} allowFontScaling={false}>
            ŞEHRİNDEKİ AMATÖR LİG, CEBİNDE
          </Text>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
});

/**
 * Logoyu soldan sağa yeniden beyaza yakan çapraz ışık.
 *
 * Maske kütüphanesi kullanılmaz: kare, `SWEEP_ANGLE` kadar döndürülmüş ve
 * taşanı kırpan bir kutudur; içindeki pencere sağa doğru açılır, pencerenin
 * içindeki logo ise kutunun dönüşünü ve pencerenin kaymasını TERS yönde
 * uygular — böylece logo yerinde durur, yalnız çapraz bir kenarla açığa
 * çıkar. Açılan kenarda yumuşak bir parlama çizgisi koşar.
 */
function SweepReveal({ progress, L }: { progress: SharedValue<number>; L: number }) {
  const S = L * 1.6; // dönen kutunun kenarı: döndürüldüğünde logoyu tümüyle örter
  const off = (S - L) / 2;
  const band = L * 0.34;

  const windowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(progress.value, [0, 1], [-S, 0]) }],
  }));
  const innerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(progress.value, [0, 1], [S, 0]) }],
  }));
  const bandStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.08, 0.85, 1], [0, 1, 1, 0]),
    transform: [{ translateX: interpolate(progress.value, [0, 1], [-band / 2, S - band / 2]) }],
  }));

  return (
    <View
      pointerEvents="none"
      style={[styles.abs, { left: -off, top: -off, width: S, height: S }, styles.clip, { transform: [{ rotate: `${SWEEP_ANGLE}deg` }] }]}
    >
      <Animated.View style={[styles.abs, { left: 0, top: 0, width: S, height: S }, styles.clip, windowStyle]}>
        <Animated.View style={[styles.abs, { left: 0, top: 0, width: S, height: S }, innerStyle]}>
          <Image
            source={LOGO}
            resizeMode="contain"
            style={[styles.abs, { left: off, top: off, width: L, height: L, transform: [{ rotate: `${-SWEEP_ANGLE}deg` }] }]}
          />
        </Animated.View>
      </Animated.View>
      <Animated.View style={[styles.abs, { left: 0, top: 0, width: band, height: S }, bandStyle]}>
        <Svg width={band} height={S}>
          <Defs>
            <RadialGradient id="introBand" cx="50%" cy="50%" rx="50%" ry="50%">
              <Stop offset="0" stopColor={introColors.white} stopOpacity={0.75} />
              <Stop offset="0.45" stopColor={introColors.lavender} stopOpacity={0.28} />
              <Stop offset="1" stopColor={introColors.lavender} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Ellipse cx={band / 2} cy={S / 2} rx={band / 2} ry={S / 2} fill="url(#introBand)" />
        </Svg>
      </Animated.View>
    </View>
  );
}

/** Merkezden yayılan, uca doğru sönen ince kamalar. */
const Rays = memo(function Rays({ radius }: { radius: number }) {
  const d: string[] = [];
  for (let i = 0; i < RAYS; i += 1) {
    const a = (i / RAYS) * Math.PI * 2;
    // Kama genişliği hafifçe değişir: düzenli bir "güneş" değil, ışık hissi.
    const half = (0.012 + seeded(i, 3) * 0.022) * Math.PI;
    const x1 = radius + Math.cos(a - half) * radius;
    const y1 = radius + Math.sin(a - half) * radius;
    const x2 = radius + Math.cos(a + half) * radius;
    const y2 = radius + Math.sin(a + half) * radius;
    d.push(`M${radius} ${radius}L${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}Z`);
  }
  return (
    <Svg width={radius * 2} height={radius * 2}>
      <Defs>
        <RadialGradient id="introRay" cx="50%" cy="50%" rx="50%" ry="50%">
          <Stop offset="0.06" stopColor={introColors.lavender} stopOpacity={0.2} />
          <Stop offset="0.3" stopColor={introColors.lavender} stopOpacity={0.07} />
          <Stop offset="0.75" stopColor={introColors.lavender} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Path d={d.join("")} fill="url(#introRay)" />
    </Svg>
  );
});

/** Logodan dışa doğru genişleyip sönen ince halka. */
function Ring({
  progress,
  cx,
  cy,
  size,
  delay,
}: {
  progress: SharedValue<number>;
  cx: number;
  cy: number;
  size: number;
  delay: number;
}) {
  const style = useAnimatedStyle(() => {
    const p = interpolate(progress.value, [delay, delay + 0.75], [0, 1], Extrapolation.CLAMP);
    const eased = 1 - Math.pow(1 - p, 3);
    return {
      opacity: p <= 0 ? 0 : interpolate(p, [0, 0.15, 1], [0, 0.85, 0]),
      transform: [{ scale: interpolate(eased, [0, 1], [0.55, 2.3]) }],
    };
  });
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.abs,
        styles.ring,
        { left: cx - size / 2, top: cy - size / 2, width: size, height: size, borderRadius: size / 2 },
        style,
      ]}
    />
  );
}

/** Oturma anında merkezden saçılan tek bir kıvılcım. */
function Spark({
  i,
  progress,
  cx,
  cy,
  L,
}: {
  i: number;
  progress: SharedValue<number>;
  cx: number;
  cy: number;
  L: number;
}) {
  const angle = (i / SPARKS) * Math.PI * 2 + seeded(i, 1) * 0.5;
  const from = L * (0.28 + seeded(i, 2) * 0.12);
  const to = L * (0.75 + seeded(i, 4) * 0.65);
  const size = 2 + Math.round(seeded(i, 5) * 3);
  const lag = seeded(i, 6) * 0.18;
  const color = introColors.sparks[i % introColors.sparks.length];
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);

  const style = useAnimatedStyle(() => {
    const p = interpolate(progress.value, [lag, lag + 0.8], [0, 1], Extrapolation.CLAMP);
    const eased = 1 - Math.pow(1 - p, 3);
    const r = from + (to - from) * eased;
    return {
      opacity: p <= 0 ? 0 : interpolate(p, [0, 0.12, 0.7, 1], [0, 1, 0.7, 0]),
      transform: [{ translateX: dx * r }, { translateY: dy * r + p * 10 }, { scale: 1 - p * 0.4 }],
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.abs,
        { left: cx - size / 2, top: cy - size / 2, width: size, height: size, borderRadius: size / 2, backgroundColor: color },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: introColors.stage,
    zIndex: 1000,
    elevation: 1000,
  },
  abs: { position: "absolute" },
  center: { alignItems: "center", justifyContent: "center" },
  fill: { width: "100%", height: "100%" },
  clip: { overflow: "hidden" },
  ring: {
    borderWidth: 1.5,
    borderColor: introColors.lavender,
  },
  taglineWrap: {
    left: 0,
    right: 0,
    alignItems: "center",
  },
  tagline: {
    ...type.labelSm,
    letterSpacing: 2.2,
    color: introColors.tagline,
  },
});
