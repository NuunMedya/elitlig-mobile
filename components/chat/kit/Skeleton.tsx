/**
 * SOHBET İSKELETİ — yükleme yer tutucuları (sohbet paletiyle).
 *
 * Ortak `Skeleton` rengini tema paletinden alır ve maç / tablo şablonlarını da
 * taşır; mesajlar bölümünün ihtiyacı yalnız düz kutu ve liste satırıdır.
 * Parlama döngüsü YOKTUR: kutular durağandır (ek bir sonsuz animasyon açılmaz).
 */

import { memo } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { colors } from "@/lib/chatPalette";
import { layout, radius as radiusScale, space } from "@/theme";

export interface SkeletonProps {
  width?: number | `${number}%`;
  height?: number;
  radius?: keyof typeof radiusScale;
  style?: StyleProp<ViewStyle>;
}

export const Skeleton = memo(function Skeleton({ width = "100%", height = 12, radius = "xs", style }: SkeletonProps) {
  return <View accessible={false} importantForAccessibility="no-hide-descendants" style={[styles.box, { width, height, borderRadius: radiusScale[radius] }, style]} />;
});

/** Genel liste satırı iskeleti — isteğe bağlı avatar sütunuyla. */
export const SkeletonListRow = memo(function SkeletonListRow({ count = 8, avatar = true }: { count?: number; avatar?: boolean }) {
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel="İçerik yükleniyor">
      {Array.from({ length: count }, (_unused, index) => (
        <View key={index} style={styles.row}>
          {avatar ? <Skeleton width={40} height={40} radius="pill" /> : null}
          <View style={styles.text}>
            <Skeleton width={index % 2 ? "48%" : "60%"} height={13} />
            <Skeleton width={index % 2 ? "36%" : "30%"} height={10} />
          </View>
          <Skeleton width={24} height={10} />
        </View>
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  box: { backgroundColor: colors.skeletonBase },
  row: { minHeight: 60, flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: layout.screenPadding },
  text: { flex: 1, gap: space.s },
});
