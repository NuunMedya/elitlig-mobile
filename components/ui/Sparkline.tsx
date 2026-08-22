/**
 * Sparkline — bir dizinin gidişatını tek satırda gösteren minik çizgi.
 *
 * NEREDE: oyuncu profilinde son 10 maçın reyting seyri, takım profilinde puan
 * eğrisi. Eksen yok, ızgara yok, etiket yok — sparkline bir grafik değil bir
 * CÜMLEDİR: "yükseliyor" ya da "düşüyor" der ve susar.
 *
 * NEDEN NOKTA YOK (son nokta hariç): her veri noktasına daire koymak, 10
 * elemanlı bir dizide çizgiden çok noktaya bakılmasına yol açar. Yalnız SON
 * nokta işaretlenir çünkü tek gerçekten önemli değer odur: şu an nerede.
 *
 * RENK: mavi — bu bir VERİ öğesidir, aksiyon değil. Mercan burada kullanılmaz.
 *
 * DEĞER YOKSA: tek bir hairline çizilir ve `null` döndürülmez; boş bir kutu
 * yerine "veri yok" da bir bilgidir ve düzeni bozmaz.
 */

import { memo } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { colors } from "@/theme";

export interface SparklineProps {
  /** Zaman sırasına göre değerler (eskiden yeniye). */
  values: number[];
  width: number;
  /** Varsayılan 28 — satır yüksekliğini bozmayan tek ölçü. */
  height?: number;
  /** Çizgi kalınlığı. Varsayılan 1.5. */
  thickness?: number;
  color?: string;
  /** Son noktayı işaretle. Varsayılan true. */
  markLast?: boolean;
  style?: StyleProp<ViewStyle>;
}

export const Sparkline = memo(function Sparkline({
  values,
  width,
  height = 28,
  thickness = 1.5,
  color = colors.accent,
  markLast = true,
  style,
}: SparklineProps) {
  const clean = values.filter((v) => Number.isFinite(v));
  const pad = thickness + 1; // uçlar kırpılmasın

  if (width <= 0 || height <= 0) return null;

  // Tek değer ya da hiç değer: düz bir hairline. Boşluk bırakmaktan iyidir.
  if (clean.length < 2) {
    return (
      <View style={[{ width, height }, style]}>
        <Svg width={width} height={height}>
          <Path
            d={`M ${pad} ${height / 2} L ${width - pad} ${height / 2}`}
            stroke={colors.border}
            strokeWidth={thickness}
            fill="none"
          />
        </Svg>
      </View>
    );
  }

  const min = Math.min(...clean);
  const max = Math.max(...clean);
  // Düz bir dizide (hepsi aynı) çizgi ortadan geçsin; sıfıra bölme de olmasın.
  const span = max - min || 1;

  const points = clean.map((v, i) => {
    const x = pad + (i / (clean.length - 1)) * (width - pad * 2);
    const y = height - pad - ((v - min) / span) * (height - pad * 2);
    return [x, y] as const;
  });

  const d = points.map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const [lastX, lastY] = points[points.length - 1];

  return (
    <View style={[{ width, height }, style]} pointerEvents="none">
      <Svg width={width} height={height}>
        <Path d={d} stroke={color} strokeWidth={thickness} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        {markLast ? (
          <Circle cx={lastX} cy={lastY} r={thickness + 1} fill={color} stroke={colors.surface1} strokeWidth={1} />
        ) : null}
      </Svg>
    </View>
  );
});
