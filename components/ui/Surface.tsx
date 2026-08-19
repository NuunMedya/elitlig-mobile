/**
 * Surface — tüm yüzey bileşenlerinin tabanı (§4.1).
 *
 * NEDEN: koyu temada katmanlar gölgeyle değil YÜZEY FARKI + 1px KENARLIK ile
 * ayrılır (§3.3). Bu kuralı her kartın kendi StyleSheet'inde tekrar yazmak
 * yerine `elevate(level)` çıktısını uygulayan tek bir kutu kullanılır; tema
 * değişince (açık temada gölge) tüm yüzeyler tek noktadan doğru davranır.
 *
 * Kendi başına iç boşluk VERMEZ (`inset` hariç) — yerleşim kararı üst
 * bileşenindir; Surface yalnızca "hangi katmandayım" sorusunu cevaplar.
 */

import React, { useMemo } from "react";
import { View, type ViewProps, type ViewStyle } from "react-native";
import { elevate, layout, radius as radiusScale, type ElevationLevel } from "@/theme";

export interface SurfaceProps extends ViewProps {
  /** Yükselti katmanı — varsayılan 1 (satır/kart). */
  level?: ElevationLevel;
  /** Köşe yarıçapı tokenı — varsayılan "none". */
  radius?: keyof typeof radiusScale;
  /** Kenarlık — varsayılan: level >= 1 için true. */
  bordered?: boolean;
  /** Yatay 12px iç boşluk (ekran kenar boşluğuyla aynı). */
  inset?: boolean;
  children?: React.ReactNode;
}

export const Surface = React.memo(function Surface({
  level = 1,
  radius = "none",
  bordered,
  inset,
  style,
  children,
  ...rest
}: SurfaceProps) {
  const surfaceStyle = useMemo<ViewStyle>(() => {
    const base = elevate(level);
    const withBorder = (bordered ?? level >= 1) ? base : { ...base, borderWidth: 0 };
    return {
      ...withBorder,
      ...(radius === "none" ? null : { borderRadius: radiusScale[radius] }),
      ...(inset ? { paddingHorizontal: layout.rowPaddingH } : null),
    };
  }, [bordered, inset, level, radius]);

  return (
    <View {...rest} style={[surfaceStyle, style]}>
      {children}
    </View>
  );
});
