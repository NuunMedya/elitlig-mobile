/**
 * GradientFill — bir yüzeyin ARKASINA serilen tek katmanlı gradyan.
 *
 * NEDEN AYRI BİLEŞEN: mor sistemde kart, düz dolgu değil ışıklı bir geçiştir
 * (üstte açık, altta bir tık koyu). Bu geçişi her kartın kendi `StyleSheet`i
 * içinde tekrar kurmak yerine tek bir mutlak konumlu katman kullanılır:
 * çağıran yalnız `<GradientFill radius={...} />` yazar, gradyanın hangi
 * duraklardan geçtiğine palet karar verir.
 *
 * NEDEN `absoluteFill`: gradyan katmanı YERLEŞİMİ ETKİLEMEZ. Kartın yüksekliği
 * içeriğinden gelir; gradyan sonradan altına serilir. Böylece mevcut hiçbir
 * ölçü değişmez ve katman sıralaması tek kuralla anlaşılır — GradientFill
 * daima ilk çocuktur, içerik onun üstünde çizilir.
 *
 * NEDEN `pointerEvents="none"`: dokunuşlar altındaki basılabilir kutuya
 * gitmeli; gradyan yalnız boyadır.
 *
 * KÖŞE YARIÇAPI ÇAĞIRANDAN GELİR: kapsayıcı `overflow: "hidden"` taşımıyorsa
 * (uzun listelerde bu maliyetlidir) gradyanın köşeleri kutununkiyle aynı
 * olmalıdır, yoksa kartın köşelerinden gradyan taşar.
 */

import { LinearGradient } from "expo-linear-gradient";
import { memo } from "react";
import { StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { colors, radius as radiusScale } from "@/theme";

/** Hangi gradyanın serileceği. Paletteki tokenların adlarıyla birebir eşleşir. */
export type GradientTone = "card" | "surface" | "ink" | "brand" | "accent" | "live";

const TONES: Record<GradientTone, readonly [string, string]> = {
  card: colors.gradientCard,
  surface: colors.gradientSurface,
  ink: colors.gradientInk,
  brand: colors.gradientBrand,
  accent: colors.gradientAccent,
  live: colors.gradientLive,
};

/**
 * Işık yönü. Kart ve yüzeyler DİKEY (üstten gelen ışık), kimlik ve aksiyon
 * blokları KÖŞEGEN geçer — köşegen, düz bir dikdörtgeni hafifçe kabartır.
 */
const VERTICAL_START = { x: 0.5, y: 0 } as const;
const VERTICAL_END = { x: 0.5, y: 1 } as const;
const DIAGONAL_START = { x: 0, y: 0 } as const;
const DIAGONAL_END = { x: 1, y: 1 } as const;

export interface GradientFillProps {
  /** Varsayılan "card". */
  tone?: GradientTone;
  /** Kutuyla AYNI köşe yarıçapı — çağıran `overflow: "hidden"` vermiyorsa şart. */
  radius?: keyof typeof radiusScale | number;
  /** Köşegen ışık. Varsayılan: ink/brand/accent/live köşegen, card/surface dikey. */
  diagonal?: boolean;
  style?: StyleProp<ViewStyle>;
}

export const GradientFill = memo(function GradientFill({
  tone = "card",
  radius,
  diagonal,
  style,
}: GradientFillProps) {
  const corner = typeof radius === "number" ? radius : radius ? radiusScale[radius] : undefined;
  const slanted = diagonal ?? tone !== "card";

  return (
    <LinearGradient
      colors={TONES[tone]}
      start={slanted ? DIAGONAL_START : VERTICAL_START}
      end={slanted ? DIAGONAL_END : VERTICAL_END}
      style={[StyleSheet.absoluteFill, corner == null ? null : { borderRadius: corner }, style]}
      pointerEvents="none"
    />
  );
});
