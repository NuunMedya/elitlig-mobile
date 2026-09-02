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
 * KARO İKİ TEMADA DA AÇIKTIR. Kulüp logoları açık zemine göre çizilir; koyu
 * temada karo `surface2` (koyu mor) olunca siyah ağırlıklı amblemler (FC
 * ANGARA) zeminde kayboluyordu — logo görseline dokunulamayacağına göre
 * arkasındaki karo açılır. Koyu temada karo `inverse` (açık blok), üstündeki
 * yedek baş harfler `onInverse`; açık temada `surface2` + `textTertiary`.
 * Karonun kenarı her iki temada hairline `border` (maketteki ".crest" gibi
 * köşeli, çerçeveli).
 *
 * PERFORMANS: liste satırında iki kez render edilir; `memo` ile sarılı ve
 * ölçüye bağlı stil nesneleri `useMemo` ile tutulur (her satır render'ında yeni
 * nesne üretmek FlatList'te kayda değer çöp üretiyordu).
 */

import { memo, useEffect, useMemo, useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { colors, hairline, isDark, layout, radius, space, textScale, type } from "@/theme";
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
  /**
   * Koyu bir bloğun üstünde ZEMİNSİZ (`plain`) çizim mi. Yedek baş harfler
   * normalde karonun mürekkebiyle çizilir; karo yokken mürekkep bir tabağın
   * üstünde görünmez olur (bu ligdeki takımların çoğunun logosu yok, yani
   * istisna değil VARSAYILAN durum). Bayrak baş harfleri `onDark`a çevirir.
   * Karolu çizimde yok sayılır — karo zaten açıktır.
   */
  onDark?: boolean;
}

export const TeamLogo = memo(function TeamLogo({
  name,
  logo,
  size = layout.crestMd,
  shape = "rounded",
  dimmed = false,
  loading = false,
  plain = false,
  onDark = false,
}: TeamLogoProps) {
  const [failed, setFailed] = useState(false);

  // Aynı satır başka bir takıma yeniden kullanıldığında (FlatList geri dönüşümü)
  // eski hatanın yeni logoyu gizlememesi için bayrak sıfırlanır.
  useEffect(() => setFailed(false), [logo]);

  const box = useMemo(
    () => ({
      width: size,
      height: size,
      // Yeni yarıçap ölçeğinde 1/5 fazla köşeli kalıyordu: amblem, yanındaki
      // 18px yarıçaplı kartın içinde "keskin" duruyordu. 1/3.2 aynı ailede.
      borderRadius: shape === "circle" ? radius.pill : Math.round(size / 3.2),
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
        <Text
          style={[styles.initials, initialsSize, plain && onDark ? styles.initialsOnDark : null]}
          numberOfLines={1}
          {...textScale.badge}
        >
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

/** Amblemin arkasındaki açık karo — iki temada da logodan açık kalır. */
const tile = {
  backgroundColor: isDark ? colors.inverse : colors.surface2,
  borderWidth: hairline,
  borderColor: colors.border,
} as const;

const styles = StyleSheet.create({
  image: {
    ...tile,
  },
  /** Filigran: zemin ve çerçeve yok, yalnız görselin kendisi. */
  plain: {
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  fallback: {
    ...tile,
    alignItems: "center",
    justifyContent: "center",
  },
  initials: {
    ...type.micro,
    // Baş harfler dar bir kutuya sığar: `micro` tokenının +0.4 harf aralığı
    // 22px'lik amblemde iki harfi kenara dayayıp üç nokta üretiyordu.
    letterSpacing: 0,
    // Karonun mürekkebi: koyu temada karo açık blok olduğu için `onInverse`.
    color: isDark ? colors.onInverse : colors.textTertiary,
    paddingHorizontal: space.xxs,
  },
  initialsOnDark: {
    color: colors.onDark,
  },
  skeleton: {
    backgroundColor: colors.skeletonBase,
  },
  dimmed: {
    opacity: 0.55,
  },
});
