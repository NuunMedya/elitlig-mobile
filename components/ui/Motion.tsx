/**
 * HAREKET KİTİ — giriş, vurgu ve sayfa noktası animasyonlarının tek yeri.
 *
 * NEDEN AYRI DOSYA: ekranlar kendi `Animated.Value`sini, kendi süresini ve
 * kendi "hareketi azalt" denetimini yazınca her ekran başka bir hızda
 * konuşur. Buradaki dört parça süreyi `theme/motion` tokenlarından alır,
 * yalnız `opacity` ve `transform` oynatır (yerel sürücü — JS iş parçacığı
 * boşta kalır) ve sistem "Hareketi azalt" ayarına uyar.
 *
 * KURALLAR (bkz. docs/arena-tasarim-dili.md, LiveBadge.tsx):
 *   · Hareket BİLGİ taşır ya da girişi yumuşatır; süs için dönmez.
 *   · Sonsuz döngü YOK (döngülü animasyon yasak — check-tokens denetler). Her
 *     parça bir kez oynar ve durur.
 *   · Liste girişleri yalnız ilk ekran dolusu satırda oynar (`index` tavanı):
 *     kaydırırken beliren satırlar parlamaz, liste akıcı kalır.
 *
 *   <Reveal index={i}>…</Reveal>          → aşağıdan belirme (sıralı gecikme)
 *   <ScoreFlash value="2-1" active>…      → skor değişince bir kez büyür
 *   <Ping trigger={minute} color=… />     → canlı noktasının tek atımlık halkası
 *   <PagerDots count progress />          → kaydırmayla akan sayfa noktaları
 */

import React, { memo, useEffect, useMemo, useRef } from "react";
import { Animated, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { colors, duration, easing, radius, space } from "@/theme";
import { useReduceMotion } from "./useReduceMotion";

/* ═══════════════════════════════ REVEAL ═══════════════════════════════ */

/** Sıralı girişte iki öğe arası gecikme. */
const STAGGER_MS = 45;
/** Bu sıradan sonraki öğeler gecikmesiz (ve liste içinde animasyonsuz) gelir. */
const STAGGER_CAP = 8;

export interface RevealProps {
  children: React.ReactNode;
  /** Sıralı giriş için öğenin sırası (0, 1, 2…). */
  index?: number;
  /** Ek gecikme (ms) — sıra gecikmesine eklenir. */
  delay?: number;
  /** Başlangıç kayması (px). Varsayılan 10; 0 → yalnız opaklık. */
  distance?: number;
  /** Kayma ekseni. Varsayılan dikey. */
  axis?: "y" | "x";
  /** Hafif büyüyerek gelsin (kahraman öğeler: logo, kupa). */
  scaleFrom?: number;
  /**
   * `index` bu değeri aşarsa animasyon HİÇ oynamaz (liste satırları). Kaydırma
   * sırasında mount olan satırların belirip sönmesini önler.
   */
  limit?: number;
  /** false → doğrudan görünür (koşullu kullanım için). */
  enabled?: boolean;
  /** Değişince giriş yeniden oynar (adım/sekme değişimi). */
  replayKey?: string | number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * Aşağıdan (ya da yandan) yumuşak belirme. Bir kez oynar.
 *
 * `useNativeDriver: true` — yalnız opacity + transform. Sarmaladığı görünümün
 * düzenine dokunmaz (boyut değişmez), bu yüzden `getItemLayout` kullanan
 * listelerde de güvenlidir.
 */
export const Reveal = memo(function Reveal({
  children,
  index = 0,
  delay = 0,
  distance = 10,
  axis = "y",
  scaleFrom,
  limit,
  enabled = true,
  replayKey,
  style,
  testID,
}: RevealProps) {
  const reduceMotion = useReduceMotion();
  const skip = !enabled || (limit != null && index > limit);
  /* İlk değer 0 değil "atlanacaksa 1": animasyonsuz öğe bir kare bile
     görünmez kalmaz. */
  const progress = useRef(new Animated.Value(skip ? 1 : 0)).current;

  /* Sıra (index) ve gecikme yalnız İLK girişte kullanılır. Bağımlılık olsalardı,
     canlı yoklama/süzgeç yüzünden liste sırası kayınca ya da sanal liste satırı
     yeniden kullanınca satırlar yeniden görünmez olup belirirdi (titreşim). */
  const skipRef = useRef(skip);
  skipRef.current = skip;
  const delayRef = useRef(delay + Math.min(index, STAGGER_CAP) * STAGGER_MS);
  useEffect(() => {
    const skip = skipRef.current;
    if (skip || reduceMotion) {
      progress.setValue(1);
      return undefined;
    }
    progress.setValue(0);
    const run = Animated.timing(progress, {
      toValue: 1,
      duration: duration.slow,
      delay: delayRef.current,
      easing: easing.decelerate,
      useNativeDriver: true,
    });
    run.start();
    return () => run.stop();
    // replayKey bilinçli bağımlılık: değişince giriş yeniden oynar.
  }, [reduceMotion, progress, replayKey]);

  const animated = useMemo(() => {
    const transform: Animated.WithAnimatedArray<
      { translateY: Animated.AnimatedInterpolation<number> } | { translateX: Animated.AnimatedInterpolation<number> } | { scale: Animated.AnimatedInterpolation<number> }
    > = [];
    if (distance !== 0) {
      const shift = progress.interpolate({ inputRange: [0, 1], outputRange: [distance, 0] });
      transform.push(axis === "y" ? { translateY: shift } : { translateX: shift });
    }
    if (scaleFrom != null) {
      transform.push({ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [scaleFrom, 1] }) });
    }
    return { opacity: progress, transform };
  }, [progress, distance, axis, scaleFrom]);

  return (
    <Animated.View style={[style, animated]} testID={testID}>
      {children}
    </Animated.View>
  );
});

/* ═════════════════════════════ SCORE FLASH ═════════════════════════════ */

export interface ScoreFlashProps {
  children: React.ReactNode;
  /** Skorun anahtarı ("2-1"). Değişince (ilk çizim hariç) bir kez oynar. */
  value: string | number;
  /** Yalnız canlı maçta oynasın; kapalıyken sarmalayıcı düz bir View'dur. */
  active?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * Skor değişim vurgusu: rakam 140ms'de %16 büyür, 760ms'de yerine oturur.
 * İlk çizimde OYNAMAZ — liste açılınca on canlı maç birden zıplamasın.
 */
export const ScoreFlash = memo(function ScoreFlash({ children, value, active = true, style }: ScoreFlashProps) {
  const reduceMotion = useReduceMotion();
  const pulse = useRef(new Animated.Value(0)).current;
  const previous = useRef(value);

  useEffect(() => {
    if (previous.current === value) return undefined;
    previous.current = value;
    if (!active || reduceMotion) return undefined;
    pulse.setValue(0);
    const run = Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 140, easing: easing.decelerate, useNativeDriver: true }),
      Animated.timing(pulse, {
        toValue: 0,
        duration: duration.flash - 140,
        easing: easing.standard,
        useNativeDriver: true,
      }),
    ]);
    run.start();
    return () => run.stop();
  }, [value, active, reduceMotion, pulse]);

  const scale = useMemo(() => pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.16] }), [pulse]);

  return <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>;
});

/* ════════════════════════════════ PING ════════════════════════════════ */

export interface PingProps {
  /** Değişince halka bir kez yayılır (canlı dakika, okunmamış sayısı). */
  trigger: string | number | null | undefined;
  /** Halkanın rengi. */
  color: string;
  /** Çekirdek noktanın çapı; halka bunun ~3 katına yayılır. */
  size?: number;
  /** İlk çizimde de oynasın mı (varsayılan evet: "canlı" girişi). */
  onMount?: boolean;
}

/**
 * Tek atımlık yayılan halka — canlı noktasının "şu an değişti" işareti.
 * SONSUZ NABIZ DEĞİLDİR: yalnız `trigger` değiştiğinde (dakika ilerledi)
 * bir kez oynar; on maçlık listede sürekli hareket üretmez. Kendi kutusunu
 * mutlak konumla doldurur — ebeveyn noktayı ortalayan kutu olmalıdır.
 */
export const Ping = memo(function Ping({ trigger, color, size = 6, onMount = true }: PingProps) {
  const reduceMotion = useReduceMotion();
  const wave = useRef(new Animated.Value(1)).current;
  const first = useRef(true);

  useEffect(() => {
    const isFirst = first.current;
    first.current = false;
    if (reduceMotion || (isFirst && !onMount)) return undefined;
    wave.setValue(0);
    const run = Animated.timing(wave, {
      toValue: 1,
      duration: duration.flash,
      easing: easing.decelerate,
      useNativeDriver: true,
    });
    run.start();
    return () => run.stop();
  }, [trigger, reduceMotion, onMount, wave]);

  const ring = useMemo(
    () => ({
      opacity: wave.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 0.55, 0] }),
      transform: [{ scale: wave.interpolate({ inputRange: [0, 1], outputRange: [1, 3.2] }) }],
    }),
    [wave],
  );

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.ping,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: color },
        ring,
      ]}
    />
  );
});

/* ═════════════════════════════ PAGER DOTS ═════════════════════════════ */

export interface PagerDotsProps {
  count: number;
  /** Sayfa ilerlemesi (0 … count-1) — `scrollX / width` ile beslenen değer. */
  progress: Animated.AnimatedInterpolation<number> | Animated.Value;
  /** Koyu sahne üstünde mi. */
  onDark?: boolean;
  style?: StyleProp<ViewStyle>;
}

const DOT = 6;
const DOT_WIDE = 20;

/**
 * Sayfa noktaları — etkin nokta uzar ve parlar; geçiş parmakla birlikte akar.
 * Genişlik animasyonu yerel sürücüde çalışmadığı için uzun nokta `scaleX` ile
 * çizilir: her nokta sabit 20px yuvada durur, dar hâli 6/20 ölçeğidir.
 */
export const PagerDots = memo(function PagerDots({ count, progress, onDark = false, style }: PagerDotsProps) {
  const dots = useMemo(
    () =>
      Array.from({ length: count }, (_, index) => {
        const inputRange = [index - 1, index, index + 1];
        return {
          key: index,
          style: {
            opacity: progress.interpolate({ inputRange, outputRange: [0.35, 1, 0.35], extrapolate: "clamp" }),
            transform: [
              {
                scaleX: progress.interpolate({
                  inputRange,
                  outputRange: [DOT / DOT_WIDE, 1, DOT / DOT_WIDE],
                  extrapolate: "clamp",
                }),
              },
            ],
          },
        };
      }),
    [count, progress],
  );

  return (
    <View style={[styles.dots, style]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {dots.map((dot) => (
        <View key={dot.key} style={styles.dotSlot}>
          <Animated.View style={[styles.dot, onDark ? styles.dotOnDark : null, dot.style]} />
        </View>
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  ping: {
    position: "absolute",
  },
  dots: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.xxs,
  },
  dotSlot: {
    width: DOT_WIDE,
    height: DOT,
    alignItems: "center",
    justifyContent: "center",
  },
  dot: {
    width: DOT_WIDE,
    height: DOT,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
  },
  dotOnDark: {
    backgroundColor: colors.brandOnDark,
  },
});
