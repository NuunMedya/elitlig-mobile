/**
 * ChalkArc — orta yuvarlak yayı. İmza öğesinin ikinci parçası.
 *
 * NE: sahanın orta yuvarlağının bir parçası, çok düşük opaklıkta, skor
 * bloğunun ARKASINDA duran tek bir eğri. Resim değil GEOMETRİ — inline SVG
 * path, tek `A` komutu.
 *
 * NEDEN: bir skor bloğunun arkasında ne olduğu ürünün kimliğini belirler.
 * Gradient koyarsanız 2015 uygulaması, bulanık cam koyarsanız 2021 şablonu
 * olur. Saha çizgisi koyarsanız futbol olur. Opaklık %4'tür: bakınca
 * görülmez, olmayınca eksikliği hissedilir — dekorasyonun doğru dozu budur.
 *
 * NEDEN TEK YAY: tam daire çizmek "logo" gibi durur ve skorla yarışır. Yayın
 * yalnız üst parçası, kadrajın dışına taşarak devam ediyor izlenimi verir;
 * bu, editoryal tasarımda "kadraj tesadüfi değil" hissini kuran şeydir.
 *
 * KULLANIM: mutlak konumlu bir katman olarak, içeriğin arkasına konur.
 *
 *   <View>
 *     <ChalkArc width={w} height={120} />
 *     <ScoreBlock />
 *   </View>
 */

import { memo } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Path } from "react-native-svg";
import { colors } from "@/theme";

export interface ChalkArcProps {
  /** Katmanın genişliği — genelde ekran genişliği. */
  width: number;
  /** Katmanın yüksekliği. */
  height: number;
  /**
   * Yayın yarıçapı. Varsayılan olarak genişliğin %62'si: yay kadrajın iki
   * yanından taşar ve "devam ediyor" okunur.
   */
  radius?: number;
  /** Çizgi kalınlığı. Varsayılan 1.5 — tebeşir inceliği. */
  thickness?: number;
  /** Varsayılan `chalkInk` (kağıt üstünde mürekkep tebeşiri). */
  color?: string;
  style?: StyleProp<ViewStyle>;
}

export const ChalkArc = memo(function ChalkArc({
  width,
  height,
  radius,
  thickness = 1.5,
  color = colors.chalkInk,
  style,
}: ChalkArcProps) {
  if (width <= 0 || height <= 0) return null;

  const r = radius ?? width * 0.62;
  const cx = width / 2;
  // Merkez kadrajın ALTINDA: görünen parça yayın üst kavsi olur.
  const cy = height * 0.94 + r * 0.42;

  // Yayın kadraj kenarlarıyla kesiştiği noktalar; yarıçap kadrajdan büyük
  // olduğu için daima iki kenarda da kesişir.
  const dx = Math.min(r, cx);
  const dy = Math.sqrt(Math.max(0, r * r - dx * dx));
  const y = cy - dy;

  const d = `M ${cx - dx} ${y} A ${r} ${r} 0 0 1 ${cx + dx} ${y}`;

  return (
    <View style={[StyleSheet.absoluteFill, style]} pointerEvents="none">
      <Svg width={width} height={height}>
        <Path d={d} stroke={color} strokeWidth={thickness} fill="none" />
      </Svg>
    </View>
  );
});
