/**
 * Bloom — bir öğenin ARKASINDAKİ yumuşak ışık.
 *
 * NEDEN VAR: skor tablosunda skor, mürekkep bloğun üstünde tek başına duran
 * bir rakam çiftiydi. Blok koyu, rakam beyaz — okunuyordu ama ekranın en
 * önemli bilgisi olduğuna dair hiçbir işaret taşımıyordu.
 *
 * Işık bunu anlatır: rakamın arkasından yayılan sönük bir hâle, gözü oraya
 * çeker ve blok "aydınlatılmış bir tabela" hâline gelir.
 *
 * NEDEN SVG: React Native'de radyal gradyan yok. Düz renkli bir daire de
 * hâle DEĞİLDİR — kenarı keskindir ve ekranda bir DİSK olarak görünür,
 * ışık olarak değil. Işığın tanımı zaten "merkezden kenara sönümlenen"dir;
 * bunu yalnız `RadialGradient` verir. `react-native-svg` uygulamada zaten
 * saha çizgileri için yüklü, yeni bağımlılık gelmiyor.
 *
 * YERLEŞİMİ ETKİLEMEZ: mutlak konumlu ve `pointerEvents="none"`. Çağıran
 * yalnız ölçüyü verir; hâle o ölçünün ortasına oturur.
 */

import React, { memo, useId } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Defs, Ellipse, RadialGradient, Stop } from "react-native-svg";

export interface BloomProps {
  /** Hâlenin genişliği. */
  width: number;
  /** Hâlenin yüksekliği — genişlikten küçük verilirse ışık yatay yayılır. */
  height: number;
  /** Işığın rengi. */
  color: string;
  /** Merkezdeki opaklık (0–1). Varsayılan 0.5; kenarda daima 0'a iner. */
  intensity?: number;
  style?: StyleProp<ViewStyle>;
}

export const Bloom = memo(function Bloom({
  width,
  height,
  color,
  intensity = 0.5,
  style,
}: BloomProps) {
  /*
   * Gradyan kimliği BENZERSİZ olmak zorunda. Aynı ekranda iki `Bloom` varsa
   * (ör. iki takımın skoru) ve ikisi de "bloom" kimliğini kullanırsa, SVG
   * tanım tablosunda ikincisi birincisini ezer ve iki hâle de aynı renkte
   * çizilir. `useId` her örneğe kendi kimliğini verir.
   */
  const id = `bloom-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

  return (
    <View style={[styles.wrap, { width, height }, style]} pointerEvents="none">
      <Svg width={width} height={height}>
        <Defs>
          <RadialGradient id={id} cx="50%" cy="50%" rx="50%" ry="50%">
            <Stop offset="0" stopColor={color} stopOpacity={intensity} />
            <Stop offset="0.55" stopColor={color} stopOpacity={intensity * 0.42} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Ellipse
          cx={width / 2}
          cy={height / 2}
          rx={width / 2}
          ry={height / 2}
          fill={`url(#${id})`}
        />
      </Svg>
    </View>
  );
});

const styles = StyleSheet.create({
  /* Ölçüsü verilen kutunun ORTASINA oturur: çağıranın içeriği hâlenin
     merkezinde kalsın diye kendi yarısı kadar yukarı-sola çekilir. */
  wrap: {
    position: "absolute",
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
  },
});
