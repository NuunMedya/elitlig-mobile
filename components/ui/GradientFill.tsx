/**
 * GradientFill — bir yüzeyin ARKASINA serilen tek katmanlı gradyan.
 *
 * NEDEN AYRI BİLEŞEN: mor sistemde kart, düz dolgu değil ışıklı bir geçiştir
 * (sağda açık, solda bir tık sönük). Bu geçişi her kartın kendi `StyleSheet`i
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
 * IŞIK YÖNÜ: SAĞDAN SOLA, HER ZAMAN.
 *
 * NEDEN YATAY: dikey gradyan, geniş ve alçak bir kartın üstünde silindir
 * ("boru") etkisi yapar — üst kenar açık, alt kenar koyu olunca yüzey düz
 * durmaz, bükülmüş görünür. Yatay bir geçiş aynı yüzeyi düz bırakır ve
 * ışığın bir yönden geldiğini söyler.
 *
 * NEDEN SAĞDAN: `colors[0]` `start` noktasına düşer; başlangıç sağda olduğu
 * için gradyanın AÇIK ucu sağda, sönük ucu solda olur. Kartların içeriği
 * soldan başladığı için metin, gradyanın en sakin tarafında oturur.
 *
 * TEK YÖN, İSTİSNASIZ: köşegen ve dikey seçenekler kaldırıldı. Bir ekranda
 * üç farklı ışık yönü, hepsi doğru olsa bile "farklı yerlerden toplanmış"
 * hissi veriyordu.
 */
const START = { x: 1, y: 0.5 } as const;
const END = { x: 0, y: 0.5 } as const;

export interface GradientFillProps {
  /** Varsayılan "card". */
  tone?: GradientTone;
  /** Kutuyla AYNI köşe yarıçapı — çağıran `overflow: "hidden"` vermiyorsa şart. */
  radius?: keyof typeof radiusScale | number;
  style?: StyleProp<ViewStyle>;
}

export const GradientFill = memo(function GradientFill({
  tone = "card",
  radius,
  style,
}: GradientFillProps) {
  const corner = typeof radius === "number" ? radius : radius ? radiusScale[radius] : undefined;

  return (
    <LinearGradient
      colors={TONES[tone]}
      start={START}
      end={END}
      style={[StyleSheet.absoluteFill, corner == null ? null : { borderRadius: corner }, style]}
      pointerEvents="none"
    />
  );
});
