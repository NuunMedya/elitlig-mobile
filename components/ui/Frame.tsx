/**
 * Frame — kartın çerçevesi.
 *
 * ARENA'DA İKİ BİÇİM:
 *  · `tone="light"` (kâğıt): DÜZ hairline kenarlık (`border`) + `elevate`
 *    gölgesi. Eski "ışıklı" gradyan kenar beyazdan beyaza geçiyordu ve gri
 *    kâğıtta kenar hiç görünmüyordu; kart bulanık bir leke gibi kalıyordu.
 *    Net bir 1px çizgi, kartı kâğıttan kesin biçimde ayırır.
 *  · `tone="dark"` (sahne): 1px GRADYAN kenar (`rimDark`). Grafit blokta düz
 *    çizgi sert durur; üstten gelen sönük ışık bloğu kâğıttan kaldırır.
 *    Teknik: dış katman gradyanla dolu ve `padding: 1`; iç katman kartın kendi
 *    zemini. Aradaki 1px, gradyanın görünen tek parçası — yani kenar. İç
 *    yarıçap dıştan 1 eksiktir ki çerçeve dört köşede eşit kalınlıkta kalsın.
 *
 * ZEMİN İKİ BİÇİMDE VERİLEBİLİR:
 *   · `surface` — düz renk (varsayılan `surface1`)
 *   · `gradient` — iki duraklı yüzey gradyanı (skor tablosu, sahne panel)
 * İkisi birden verilirse gradyan kazanır; `surface` yükleme öncesi yedektir.
 */

import React, { memo } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { colors, elevate, hairline, radius as radiusScale, type ElevationLevel } from "@/theme";

/** Sahne kenarının yönü — `GradientFill` ile aynı eksende değil, BİLEREK: ışık üstten gelir. */
const RIM_START = { x: 0.5, y: 0 } as const;
const RIM_END = { x: 0.5, y: 1 } as const;

export type FrameTone = "light" | "dark";

export interface FrameProps {
  children: React.ReactNode;
  /** Kenar tonu: açık yüzeyler için `light`, mürekkep bloklar için `dark`. */
  tone?: FrameTone;
  /** Köşe yarıçapı — token adı ya da doğrudan piksel. Varsayılan `xl` (Arena kartı). */
  radius?: keyof typeof radiusScale | number;
  /** İç zemin düz renk. `gradient` verilirse yalnız yedek olarak kalır. */
  surface?: string;
  /** İç zemin gradyanı (ör. `colors.gradientInk`). */
  gradient?: readonly [string, string];
  /** Gradyan zeminin yönü — varsayılan yatay, sağdan sola (yüzey kuralı). */
  gradientStart?: { x: number; y: number };
  gradientEnd?: { x: number; y: number };
  /** Gölge kademesi; 0 gölgesiz. */
  elevation?: ElevationLevel;
  /** Dış kaba uygulanır (kenar boşluğu, genişlik). */
  style?: StyleProp<ViewStyle>;
  /** İç kaba uygulanır (dolgu, hizalama). */
  contentStyle?: StyleProp<ViewStyle>;
  testID?: string;
}

/** Yüzey gradyanları uygulamada daima sağdan sola (bkz. check-tokens). */
const SURFACE_START = { x: 1, y: 0.5 } as const;
const SURFACE_END = { x: 0, y: 0.5 } as const;

const RIM_WIDTH = 1;

export const Frame = memo(function Frame({
  children,
  tone = "light",
  radius = "xl",
  surface,
  gradient,
  gradientStart,
  gradientEnd,
  elevation = 1,
  style,
  contentStyle,
  testID,
}: FrameProps) {
  const outer = typeof radius === "number" ? radius : radiusScale[radius];

  const gradientLayer = gradient ? (
    <LinearGradient
      colors={gradient}
      start={gradientStart ?? SURFACE_START}
      end={gradientEnd ?? SURFACE_END}
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
    />
  ) : null;

  if (tone === "light") {
    /* Kâğıt kart: tek kutu. Gölge kutunun kendisinde (iç kapta `overflow:
       hidden` gölgeyi kesmesin diye içerik ayrı bir kapta kırpılır). */
    return (
      <View
        style={[
          elevation ? elevate(elevation) : styles.flatBorder,
          { borderRadius: outer, backgroundColor: surface ?? colors.surface1 },
          style,
        ]}
        testID={testID}
      >
        <View style={[styles.inner, { borderRadius: Math.max(0, outer - hairline) }, contentStyle]}>
          {gradientLayer}
          {children}
        </View>
      </View>
    );
  }

  const inner = Math.max(0, outer - RIM_WIDTH);

  return (
    <LinearGradient
      colors={colors.rimDark}
      start={RIM_START}
      end={RIM_END}
      style={[
        styles.rim,
        { borderRadius: outer },
        elevation ? elevate(elevation) : null,
        // `elevate` kendi zeminini ve kenarlığını taşır; kenar gradyanı görünsün.
        elevation ? styles.rimOverElevation : null,
        style,
      ]}
      testID={testID}
    >
      <View style={[styles.inner, { borderRadius: inner }, contentStyle]}>
        {gradientLayer}
        <View style={[styles.fill, { backgroundColor: surface ?? colors.surface1 }]} />
        {children}
      </View>
    </LinearGradient>
  );
});

const styles = StyleSheet.create({
  rim: {
    padding: RIM_WIDTH,
  },
  /* `elevate(n)` kendi `backgroundColor`ını taşır ve gradyan katmanının
     zeminini ezer; sıfırlanmazsa kenar gradyanı hiç görünmez. */
  rimOverElevation: {
    backgroundColor: "transparent",
    borderWidth: 0,
  },
  /** Gölgesiz kâğıt kart: yalnız hairline kenarlık. */
  flatBorder: {
    borderWidth: hairline,
    borderColor: colors.border,
  },
  inner: {
    overflow: "hidden",
  },
  /* Düz zemin, gradyanın ALTINDA duran yedek katman: gradyan verilmişse
     görünmez, verilmemişse kartın zemini odur. `absoluteFill` olduğu için
     içeriğin yerleşimini etkilemez. */
  fill: {
    ...StyleSheet.absoluteFillObject,
    zIndex: -1,
  },
});
