/**
 * Takım amblemi — `components/TeamCrest.tsx` yerine geçer, görsel sözleşmesi aynıdır.
 *
 * NEDEN YEDEK ŞART: logolar veritabanında üç ayrı biçimde duruyor ve bir kısmı
 * hiç yok; `mediaUrl()` yer tutucu görselleri de (default_team.png) eler.
 * Adres çözülemezse ya da indirme hata verirse takımın baş harfleri gösterilir —
 * satır asla boş bir kutuyla kalmaz.
 *
 * FARKLAR (§4.11): köşe yarıçapı `size/5` (eski `size/4` fazla yuvarlaktı,
 * amblem "buton" gibi görünüyordu), yedek metin `textTertiary`, zemin `surface2`,
 * `loading` durumunda iskelet kutusu, kaybeden takım satırında `dimmed`.
 *
 * PERFORMANS: liste satırında iki kez render edilir; `memo` ile sarılı ve
 * ölçüye bağlı stil nesneleri `useMemo` ile tutulur (her satır render'ında yeni
 * nesne üretmek FlatList'te kayda değer çöp üretiyordu).
 */

import { memo, useEffect, useMemo, useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { colors, layout, radius, space, textScale, type } from "@/theme";
import { initials, mediaUrl } from "@/lib/format";

export interface TeamLogoProps {
  name?: string | null;
  logo?: string | null;
  /** Varsayılan layout.crestMd (24) */
  size?: number;
  /** Yuvarlak (oyuncu) veya köşeli (takım) */
  shape?: "rounded" | "circle";
  /** Kaybeden takım satırında %55 opaklık */
  dimmed?: boolean;
  /** Yükleme sırasında iskelet */
  loading?: boolean;
  /**
   * Zeminsiz/çerçevesiz çizim — kapak filigranı gibi dekoratif kullanımlar
   * için. Normal ambleme her zaman açık bir zemin verilir (koyu blok üstünde
   * bile arma okunur kalsın diye); filigranda o zemin, ekranda kocaman soluk
   * bir DİKDÖRTGEN olarak görünüyordu.
   */
  plain?: boolean;
}

export const TeamLogo = memo(function TeamLogo({
  name,
  logo,
  size = layout.crestMd,
  shape = "rounded",
  dimmed = false,
  loading = false,
  plain = false,
}: TeamLogoProps) {
  const [failed, setFailed] = useState(false);

  // Aynı satır başka bir takıma yeniden kullanıldığında (FlatList geri dönüşümü)
  // eski hatanın yeni logoyu gizlememesi için bayrak sıfırlanır.
  useEffect(() => setFailed(false), [logo]);

  const box = useMemo(
    () => ({
      width: size,
      height: size,
      borderRadius: shape === "circle" ? radius.pill : Math.round(size / 5),
    }),
    [size, shape],
  );

  // Yedek metin `micro` ağırlık/harf aralığını korur; yalnız punto ambleme göre
  // ölçeklenir — 56px'lik hero ambleminde 10px baş harf okunmuyor.
  const initialsSize = useMemo(() => ({ fontSize: Math.max(11, Math.round(size * 0.38)) }), [size]);

  const uri = failed || loading ? null : mediaUrl(logo);

  if (loading) {
    return <View style={[styles.skeleton, box]} accessibilityElementsHidden importantForAccessibility="no" />;
  }

  if (!uri) {
    return (
      <View
        style={[plain ? styles.plain : styles.fallback, box, dimmed && styles.dimmed]}
        accessibilityRole="image"
        accessibilityLabel={name ? `${name} amblemi` : "Takım amblemi"}
      >
        <Text style={[styles.initials, initialsSize]} numberOfLines={1} {...textScale.badge}>
          {initials(name)}
        </Text>
      </View>
    );
  }

  return (
    <Image
      source={{ uri }}
      style={[plain ? styles.plain : styles.image, box, dimmed && styles.dimmed]}
      resizeMode="contain"
      onError={() => setFailed(true)}
      accessibilityRole="image"
      accessibilityLabel={name ? `${name} amblemi` : "Takım amblemi"}
    />
  );
});

const styles = StyleSheet.create({
  image: {
    backgroundColor: colors.surface2,
  },
  /** Filigran: zemin ve çerçeve yok, yalnız görselin kendisi. */
  plain: {
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  fallback: {
    backgroundColor: colors.surface2,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  initials: {
    ...type.micro,
    color: colors.textTertiary,
    paddingHorizontal: space.xxs,
  },
  skeleton: {
    backgroundColor: colors.skeletonBase,
  },
  dimmed: {
    opacity: 0.55,
  },
});
