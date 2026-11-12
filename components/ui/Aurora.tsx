/**
 * Aurora — GECE TEMASININ ATMOSFERİ.
 *
 * Ekranın tepesinde (ya da bir kimlik bloğunun içinde) yavaşça yer değiştiren
 * üç yumuşak ışık lekesi: mor, camgöbeği ve pembe. ui_motion_prompts'un
 * "Aurora Background" / "Mesh Gradient" desenlerinin uygulamadaki karşılığıdır.
 *
 * NASIL ÇİZİLİR: React Native'de radyal gradyan yok; her leke bir SVG
 * `RadialGradient` dairesidir (renk → saydam). Lekeler `Animated` ile yerel
 * sürücüde (transform) kayar ve büyüyüp küçülür; JS iş parçacığını meşgul
 * etmez. Dokunmayı engellemez (`pointerEvents="none"`).
 *
 * KİPLER:
 *   · `header` (varsayılan): kâğıt başlığın arkasında, sayfaya taşan ışık.
 *     Renkleri temadan gelir (`auroraViolet/Cyan/Pink`); açık temada çok daha
 *     sönüktür.
 *   · `stage`: koyu kimlik bloğunun (giriş, maç kapağı) içinde; iki temada da
 *     parlak, çünkü zemin iki temada da koyudur.
 *
 * "Hareketi azalt" açıkken lekeler durur ama ışık kalır.
 */

import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Circle, Defs, RadialGradient, Stop } from "react-native-svg";
import { ambient, colors } from "@/theme";
import { useReduceMotion } from "./useReduceMotion";

export interface AuroraProps {
  variant?: "header" | "stage";
  /** Işık alanının yüksekliği (genişlik tam ekran). Verilmezse ebeveyni doldurur. */
  height?: number;
  /**
   * Alt kenarda söndürülecek zemin rengi: ışık bu renge yumuşakça erir, kesik
   * görünmez. Kâğıt başlıkta `colors.bg`.
   */
  fadeTo?: string;
  style?: StyleProp<ViewStyle>;
}

interface Blob {
  color: string;
  size: number;
  /** Başlangıç konumu: genişliğin / yüksekliğin oranı. */
  x: number;
  y: number;
  /** Kayma yönü (px) ve süre çarpanı. */
  dx: number;
  dy: number;
  speed: number;
}

const STAGE = {
  violet: "rgba(110, 91, 255, 0.75)",
  cyan: "rgba(56, 198, 255, 0.45)",
  pink: "rgba(255, 92, 168, 0.35)",
};

let gradientSeq = 0;

export function Aurora({ variant = "header", height, fadeTo, style }: AuroraProps) {
  const reduceMotion = useReduceMotion();
  const stage = variant === "stage";
  const blobs: Blob[] = [
    { color: stage ? STAGE.violet : colors.auroraViolet, size: 340, x: -0.25, y: -0.55, dx: 60, dy: 30, speed: 1 },
    { color: stage ? STAGE.cyan : colors.auroraCyan, size: 280, x: 0.55, y: -0.4, dx: -50, dy: 40, speed: 1.25 },
    { color: stage ? STAGE.pink : colors.auroraPink, size: 220, x: 0.2, y: -0.05, dx: 50, dy: -30, speed: 1.1 },
  ];

  return (
    <View pointerEvents="none" style={[styles.wrap, height != null ? { height, bottom: undefined } : null, style]}>
      {blobs.map((blob, index) => (
        <AuroraBlob key={index} blob={blob} height={height ?? 240} reduceMotion={reduceMotion} />
      ))}
      {fadeTo ? (
        <LinearGradient
          colors={[`${fadeTo}00`, fadeTo]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={styles.fade}
        />
      ) : null}
    </View>
  );
}

function AuroraBlob({ blob, height, reduceMotion }: { blob: Blob; height: number; reduceMotion: boolean }) {
  const t = useRef(new Animated.Value(0)).current;
  const id = useRef(`aur${gradientSeq++}`).current;

  useEffect(() => {
    if (reduceMotion) {
      t.setValue(0.5);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(t, {
          toValue: 1,
          duration: ambient.aurora * blob.speed,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(t, {
          toValue: 0,
          duration: ambient.aurora * blob.speed,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [blob.speed, reduceMotion, t]);

  const transform = [
    { translateX: t.interpolate({ inputRange: [0, 1], outputRange: [0, blob.dx] }) },
    { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, blob.dy] }) },
    { scale: t.interpolate({ inputRange: [0, 1], outputRange: [1, 1.15] }) },
  ];

  return (
    <Animated.View
      style={[
        styles.blob,
        {
          width: blob.size,
          height: blob.size,
          left: `${blob.x * 100}%`,
          top: blob.y * height,
          transform,
        },
      ]}
    >
      <Svg width={blob.size} height={blob.size}>
        <Defs>
          <RadialGradient id={id} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={blob.color} stopOpacity={1} />
            <Stop offset="0.55" stopColor={blob.color} stopOpacity={0.45} />
            <Stop offset="1" stopColor={blob.color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={blob.size / 2} cy={blob.size / 2} r={blob.size / 2} fill={`url(#${id})`} />
      </Svg>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
  },
  fade: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 80,
  },
  blob: {
    position: "absolute",
  },
});
