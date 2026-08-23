/**
 * Frame — IŞIKLI ÇERÇEVE. Ürünün en çok tekrar eden görsel imzası.
 *
 * NEDEN VAR: kartlar `borderWidth: hairline` + düz bir kenar rengiyle
 * çiziliyordu. Bu, her arayüzde bulunan "genel geçer" bir kenarlıktır ve
 * hiçbir şey söylemez — kart, kâğıttan kesilmiş bir dikdörtgen gibi durur.
 *
 * Gerçek bir nesnenin kenarı ışığa göre davranır: ışık üstten geliyorsa üst
 * yay parlak, alt yay sönüktür. `Frame` bunu 1px'lik bir GRADYAN kenarla
 * kurar ve kart, kâğıdın üstüne KONMUŞ bir nesneye dönüşür.
 *
 * NASIL ÇALIŞIR: React Native'de gradyan kenarlık diye bir şey yok. Teknik
 * şu: dış katman gradyanla dolu ve `padding: 1`; iç katman kartın kendi
 * zeminiyle dolu. Aradaki 1px, gradyanın görünen tek parçası — yani kenar.
 *
 * İÇ YARIÇAP DIŞTAN 1 EKSİK olmak zorunda. Aynı yarıçap verilirse iç köşe
 * dış köşeden daha "geniş" kalır ve kenarlık köşelerde kalınlaşır: göz bunu
 * "köşeleri bulanık kart" olarak okur. Bir eksiltmek çerçeveyi dört köşede
 * de eşit kalınlıkta tutar.
 *
 * ZEMİN İKİ BİÇİMDE VERİLEBİLİR:
 *   · `surface` — düz renk (varsayılan `surface1`)
 *   · `gradient` — iki duraklı yüzey gradyanı (skor tablosu, mürekkep panel)
 * İkisi birden verilirse gradyan kazanır; `surface` yükleme öncesi yedektir.
 */

import React, { memo } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { colors, elevate, radius as radiusScale, type ElevationLevel } from "@/theme";

/** Kenarın yönü — `GradientFill` ile aynı eksende değil, BİLEREK. */
const RIM_START = { x: 0.5, y: 0 } as const;
const RIM_END = { x: 0.5, y: 1 } as const;

export type FrameTone = "light" | "dark";

export interface FrameProps {
  children: React.ReactNode;
  /** Kenar tonu: açık yüzeyler için `light`, mürekkep bloklar için `dark`. */
  tone?: FrameTone;
  /** Köşe yarıçapı — token adı ya da doğrudan piksel. Varsayılan `lg`. */
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
  radius = "lg",
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
  const inner = Math.max(0, outer - RIM_WIDTH);
  const rim = tone === "dark" ? colors.rimDark : colors.rimLight;

  return (
    <LinearGradient
      colors={rim}
      start={RIM_START}
      end={RIM_END}
      style={[
        styles.rim,
        { borderRadius: outer },
        elevation ? elevate(elevation) : null,
        // `elevate` kendi zeminini taşır; kenar gradyanı onun ÜSTÜNDE olmalı.
        elevation ? styles.rimOverElevation : null,
        style,
      ]}
      testID={testID}
    >
      <View style={[styles.inner, { borderRadius: inner }, contentStyle]}>
        {gradient ? (
          <LinearGradient
            colors={gradient}
            start={gradientStart ?? SURFACE_START}
            end={gradientEnd ?? SURFACE_END}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
        ) : null}
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
