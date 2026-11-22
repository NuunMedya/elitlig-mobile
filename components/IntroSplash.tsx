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
 * SAHNE — "maç gecesi yayını" (~2.1 sn), az öğe, sert vuruş:
 *   0–110     yerel splash'in birebir devamı
 *   110–420   stadyum projektörleri köşelerden SIRAYLA, titreyerek yanar;
 *             sahne derin bir vinyete kararır, logo geri çekilip "yüklenir"
 *   ~470      ÇARPMA: logo sıkı bir aşmayla yerine kilitlenir — tek keskin
 *             şok dalgası, kısa beyaz flaş, renk sapmalı (camgöbeği/pembe)
 *             kenar, logonun çizgisinden geçen yatay ışık yarığı ve hafif
 *             kamera sarsıntısı
 *   820–1340  Türkiye'nin En "Elit" Ligi — harf aralığı daralarak oturur,
 *             "Elit" altın vurgulu
 *   1660–2100 sahne hafifçe büyüyüp saydamlaşır, altta uygulama görünür
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
  Extrapolation,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import Svg, { Defs, Ellipse, RadialGradient, Rect, Stop } from "react-native-svg";

import { introColors, type } from "@/theme";

const LOGO = require("../assets/images/splash-icon.png");

/** app.json → expo-splash-screen `imageWidth`. Değişirse burası da değişir. */
const NATIVE_IMAGE_WIDTH = 72;

/* — Zaman çizelgesi (ms) — */
const HOLD = 110;
const PULL = 190; // geri çekilme (yüklenme)
const SLAM = 170; // hızlanarak çarpma
const IMPACT = HOLD + PULL + SLAM; // ≈ 470
const LIGHTS_STAGGER = 70;
const TAGLINE_AT = 820;
const EXIT_AT = 1660;
const EXIT_MS = 440;
const TOTAL = EXIT_AT + EXIT_MS;

/* — Hareketi azalt / dokunarak geçiş — */
const REDUCED_HOLD = 260;
const REDUCED_FADE = 300;
const SKIP_FADE = 220;

/** Projektörler: köşe + yanma sırası. */
const FLOODLIGHTS = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
] as const;

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
  slam: Easing.bezier(0.7, 0, 0.84, 0),
};

export const IntroSplash = memo(function IntroSplash({ onDone }: { onDone: () => void }) {
  const { width: W, height: H } = useWindowDimensions();
  const reduce = useReducedMotion();

  /* Logonun son ölçüsü; görsel kare (1024×1024). */
  const L = Math.round(Math.min(W * 0.56, 236));
  const startScale = NATIVE_IMAGE_WIDTH / L;

  const logoScale = useSharedValue(startScale);
  const dark = useSharedValue(0); // 0 → 1: vinyet sahnesi
  const impact = useSharedValue(0); // 0 → 1: çarpma anı efektleri (doğrusal)
  const tagline = useSharedValue(0);
  const spacing = useSharedValue(0); // 0 → 1: harf aralığı daralır
  const exit = useSharedValue(0);
  const fade = useSharedValue(1);
  const l0 = useSharedValue(0);
  const l1 = useSharedValue(0);
  const l2 = useSharedValue(0);
  const l3 = useSharedValue(0);
  const lights = [l0, l1, l2, l3];

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
    // Logo: geri çekil → hızlanarak çarp → sıkı aşma → otur.
    logoScale.value = withDelay(
      HOLD,
      withSequence(
        withTiming(startScale * 0.8, { duration: PULL, easing: ease.inOut }),
        withTiming(1.13, { duration: SLAM, easing: ease.slam }),
        withTiming(0.97, { duration: 90, easing: ease.out }),
        withTiming(1, { duration: 160, easing: ease.out }),
      ),
    );
    dark.value = withDelay(HOLD, withTiming(1, { duration: 320, easing: ease.out }));
    // Projektörler sırayla, titreyerek yanar; çarpmadan sonra sakin bir seviyeye iner.
    lights.forEach((l, i) => {
      l.value = withDelay(
        HOLD + 40 + i * LIGHTS_STAGGER,
        withSequence(
          withTiming(1, { duration: 40 }),
          withTiming(0.2, { duration: 50 }),
          withTiming(0.9, { duration: 50 }),
          withTiming(0.45, { duration: 40 }),
          withTiming(1, { duration: 60 }),
          withTiming(0.6, { duration: 700, easing: ease.out }),
        ),
      );
    });
    impact.value = withDelay(IMPACT, withTiming(1, { duration: 700, easing: Easing.linear }));
    tagline.value = withDelay(TAGLINE_AT, withTiming(1, { duration: 320, easing: ease.out }));
    spacing.value = withDelay(TAGLINE_AT, withTiming(1, { duration: 560, easing: ease.out }));
    exit.value = withDelay(EXIT_AT, withTiming(1, { duration: EXIT_MS, easing: ease.in }));
    fade.value = withDelay(EXIT_AT + 60, withTiming(0, { duration: EXIT_MS - 60, easing: ease.out }));
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

  const vignetteStyle = useAnimatedStyle(() => ({ opacity: dark.value }));

  /* Kamera sarsıntısı: çarpmada kısa, sönümlü titreşim (yalnız sahne, zemin değil). */
  const shakeStyle = useAnimatedStyle(() => {
    const p = interpolate(impact.value, [0, 0.36], [0, 1], Extrapolation.CLAMP);
    const damp = p >= 1 ? 0 : 1 - p;
    return {
      transform: [
        { translateX: Math.sin(p * Math.PI * 7) * 6 * damp },
        { translateY: Math.sin(p * Math.PI * 5 + 0.6) * 3.5 * damp },
        { scale: 1 + exit.value * 0.06 },
      ],
    };
  });

  const logoStyle = useAnimatedStyle(() => ({ transform: [{ scale: logoScale.value }] }));

  /* Renk sapması: çarpmada iki renkli kopya yana kayar ve hızla logoya geri oturur. */
  const chromaA = useAnimatedStyle(() => {
    const p = interpolate(impact.value, [0, 0.3], [0, 1], Extrapolation.CLAMP);
    return {
      opacity: impact.value <= 0 ? 0 : interpolate(p, [0, 0.1, 1], [0, 0.9, 0]),
      transform: [{ translateX: interpolate(p, [0, 1], [-9, 0]) }],
    };
  });
  const chromaB = useAnimatedStyle(() => {
    const p = interpolate(impact.value, [0, 0.3], [0, 1], Extrapolation.CLAMP);
    return {
      opacity: impact.value <= 0 ? 0 : interpolate(p, [0, 0.1, 1], [0, 0.9, 0]),
      transform: [{ translateX: interpolate(p, [0, 1], [9, 0]) }],
    };
  });

  /* Çekirdek ışık: çarpmada parlar, sonra sakin bir hâleye iner. */
  const coreStyle = useAnimatedStyle(() => ({
    opacity:
      Math.max(dark.value * 0.35, interpolate(impact.value, [0, 0.06, 0.6], [0, 1, 0.55], Extrapolation.CLAMP)) *
      interpolate(exit.value, [0, 1], [1, 0.3]),
    transform: [{ scale: interpolate(impact.value, [0, 0.1, 1], [0.7, 1.12, 1], Extrapolation.CLAMP) }],
  }));

  /* Tek keskin şok dalgası. */
  const ringStyle = useAnimatedStyle(() => {
    const p = interpolate(impact.value, [0, 0.55], [0, 1], Extrapolation.CLAMP);
    const eased = 1 - Math.pow(1 - p, 4);
    return {
      opacity: impact.value <= 0 ? 0 : interpolate(p, [0, 0.05, 1], [0, 1, 0]),
      transform: [{ scale: interpolate(eased, [0, 1], [0.5, 3.2]) }],
    };
  });

  /* Kısa beyaz flaş. */
  const flashStyle = useAnimatedStyle(() => ({
    opacity: impact.value <= 0 ? 0 : interpolate(impact.value, [0, 0.03, 0.22], [0, 0.32, 0], Extrapolation.CLAMP),
  }));

  /* Yatay ışık yarığı: logonun alt çizgisinden ortadan dışa açılır ve söner. */
  const slashStyle = useAnimatedStyle(() => {
    const p = interpolate(impact.value, [0, 0.7], [0, 1], Extrapolation.CLAMP);
    return {
      opacity: impact.value <= 0 ? 0 : interpolate(p, [0, 0.06, 0.45, 1], [0, 1, 0.7, 0]),
      transform: [{ scaleX: interpolate(1 - Math.pow(1 - p, 3), [0, 1], [0.1, 1]) }],
    };
  });

  const taglineStyle = useAnimatedStyle(() => ({
    opacity: tagline.value * interpolate(exit.value, [0, 0.6], [1, 0], Extrapolation.CLAMP),
    letterSpacing: interpolate(spacing.value, [0, 1], [9, 0.4]),
    transform: [{ translateY: interpolate(tagline.value, [0, 1], [8, 0]) }],
  }));

  if (!mounted) return null;

  const cx = W / 2;
  const cy = H / 2;
  const ringSize = L * 0.9;
  /* Logonun yatay çizgisi görselin ~%41 yüksekliğindedir: yarık oradan geçer. */
  const slashY = cy - L * 0.09;
  const slashW = W * 1.3;
  const tagTop = cy + L * 0.42;

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.root, rootStyle]}>
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={skip}
        accessibilityRole="button"
        accessibilityLabel="ElitLig"
        accessibilityHint="Açılış animasyonunu geçer"
      >
        {/* 1 · Derin vinyet: merkezde menekşe, kenarda neredeyse siyah. */}
        <Animated.View style={[StyleSheet.absoluteFill, vignetteStyle]} pointerEvents="none">
          <Svg width={W} height={H}>
            <Defs>
              <RadialGradient id="introStage" cx="50%" cy="50%" rx="70%" ry="55%" fx="50%" fy="50%">
                <Stop offset="0" stopColor={introColors.violet} stopOpacity={0.7} />
                <Stop offset="0.42" stopColor={introColors.stage} stopOpacity={1} />
                <Stop offset="1" stopColor={introColors.deep} stopOpacity={1} />
              </RadialGradient>
            </Defs>
            <Rect x={0} y={0} width={W} height={H} fill="url(#introStage)" />
          </Svg>
        </Animated.View>

        {/* 2 · Stadyum projektörleri: köşelerden merkeze uzanan ışık konileri. */}
        {FLOODLIGHTS.map((f, i) => (
          <Floodlight key={i} index={i} corner={f} W={W} H={H} level={lights[i]} exit={exit} />
        ))}

        {/* 3 · Sarsılan sahne: hâle, şok dalgası, logo, yarık, alt satır. */}
        <Animated.View style={[StyleSheet.absoluteFill, shakeStyle]} pointerEvents="none">
          <Animated.View
            style={[styles.abs, { left: cx - L, top: cy - L, width: L * 2, height: L * 2 }, coreStyle]}
          >
            <Svg width={L * 2} height={L * 2}>
              <Defs>
                <RadialGradient id="introCore" cx="50%" cy="50%" rx="50%" ry="50%">
                  <Stop offset="0" stopColor={introColors.core} stopOpacity={0.8} />
                  <Stop offset="0.38" stopColor={introColors.violet} stopOpacity={0.4} />
                  <Stop offset="1" stopColor={introColors.violet} stopOpacity={0} />
                </RadialGradient>
              </Defs>
              <Ellipse cx={L} cy={L} rx={L} ry={L} fill="url(#introCore)" />
            </Svg>
          </Animated.View>

          <Animated.View
            style={[
              styles.abs,
              styles.ring,
              {
                left: cx - ringSize / 2,
                top: cy - ringSize / 2,
                width: ringSize,
                height: ringSize,
                borderRadius: ringSize / 2,
              },
              ringStyle,
            ]}
          />

          <Animated.View style={[styles.abs, { left: cx - L / 2, top: cy - L / 2, width: L, height: L }, logoStyle]}>
            <Animated.View style={[StyleSheet.absoluteFill, chromaA]}>
              <Image source={LOGO} style={[styles.fill, { tintColor: introColors.chromaCyan }]} resizeMode="contain" />
            </Animated.View>
            <Animated.View style={[StyleSheet.absoluteFill, chromaB]}>
              <Image source={LOGO} style={[styles.fill, { tintColor: introColors.chromaPink }]} resizeMode="contain" />
            </Animated.View>
            <Image source={LOGO} style={styles.fill} resizeMode="contain" />
          </Animated.View>

          <Animated.View
            style={[styles.abs, { left: cx - slashW / 2, top: slashY - 14, width: slashW, height: 28 }, slashStyle]}
          >
            <Svg width={slashW} height={28}>
              <Defs>
                <RadialGradient id="introSlashSoft" cx="50%" cy="50%" rx="50%" ry="50%">
                  <Stop offset="0" stopColor={introColors.lavender} stopOpacity={0.55} />
                  <Stop offset="1" stopColor={introColors.lavender} stopOpacity={0} />
                </RadialGradient>
                <RadialGradient id="introSlashCore" cx="50%" cy="50%" rx="50%" ry="50%">
                  <Stop offset="0" stopColor={introColors.white} stopOpacity={1} />
                  <Stop offset="0.6" stopColor={introColors.lavender} stopOpacity={0.6} />
                  <Stop offset="1" stopColor={introColors.lavender} stopOpacity={0} />
                </RadialGradient>
              </Defs>
              <Ellipse cx={slashW / 2} cy={14} rx={slashW / 2} ry={14} fill="url(#introSlashSoft)" />
              <Ellipse cx={slashW / 2} cy={14} rx={slashW * 0.42} ry={1.6} fill="url(#introSlashCore)" />
            </Svg>
          </Animated.View>

          <View style={[styles.abs, styles.taglineWrap, { top: tagTop }]}>
            <Animated.Text style={[styles.tagline, taglineStyle]} allowFontScaling={false}>
              Türkiye'nin En <Text style={styles.elit}>"Elit"</Text> Ligi
            </Animated.Text>
          </View>
        </Animated.View>

        {/* 4 · Çarpma flaşı. */}
        <Animated.View style={[StyleSheet.absoluteFill, styles.flash, flashStyle]} pointerEvents="none" />
      </Pressable>
    </Animated.View>
  );
});

/**
 * Tek projektör: köşeden ekran merkezine uzanan, köşede parlak ve uca doğru
 * sönen dar bir ışık konisi. Titreme `level` değerinden gelir.
 */
function Floodlight({
  index,
  corner,
  W,
  H,
  level,
  exit,
}: {
  index: number;
  corner: { x: number; y: number };
  W: number;
  H: number;
  level: SharedValue<number>;
  exit: SharedValue<number>;
}) {
  const style = useAnimatedStyle(() => ({
    opacity: level.value * interpolate(exit.value, [0, 1], [1, 0]),
  }));

  const x0 = corner.x * W;
  const y0 = corner.y * H;
  const dx = W / 2 - x0;
  const dy = H / 2 - y0;
  const len = Math.hypot(dx, dy) * 1.05;
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  const id = `introBeam${index}`;

  return (
    <Animated.View style={[StyleSheet.absoluteFill, style]} pointerEvents="none">
      <Svg width={W} height={H}>
        <Defs>
          {/* Odak elipsin köşe ucunda: ışık kaynağı orada, koni merkeze doğru söner. */}
          <RadialGradient id={id} cx="50%" cy="50%" rx="50%" ry="50%" fx="2%" fy="50%">
            <Stop offset="0" stopColor={introColors.white} stopOpacity={0.5} />
            <Stop offset="0.18" stopColor={introColors.lavender} stopOpacity={0.2} />
            <Stop offset="0.6" stopColor={introColors.lavender} stopOpacity={0.05} />
            <Stop offset="1" stopColor={introColors.lavender} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Ellipse
          cx={x0 + len / 2}
          cy={y0}
          rx={len / 2}
          ry={W * 0.13}
          fill={`url(#${id})`}
          transform={`rotate(${angle.toFixed(2)} ${x0} ${y0})`}
        />
      </Svg>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: introColors.stage,
    zIndex: 1000,
    elevation: 1000,
  },
  abs: { position: "absolute" },
  fill: { width: "100%", height: "100%" },
  ring: {
    borderWidth: 2,
    borderColor: introColors.lavender,
  },
  flash: {
    backgroundColor: introColors.white,
  },
  taglineWrap: {
    left: 0,
    right: 0,
    alignItems: "center",
  },
  tagline: {
    ...type.h1,
    color: introColors.tagline,
  },
  elit: {
    color: introColors.gold,
    textShadowColor: introColors.goldGlow,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
  },
});
