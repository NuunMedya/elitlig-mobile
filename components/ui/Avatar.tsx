/**
 * Oyuncu/kullanıcı avatarı — `PlayerAvatar` mantığının genişletilmiş hâli.
 *
 * Yedek davranış korunur: fotoğraf yoksa ya da yüklenemezse baş harfler.
 * Eklenenler (§4.23): 2px halka (marka/canlı vurgusu), forma numarası rozeti,
 * çevrimiçi noktası ve serbest bir rozet düğümü (kaptan bandı vb.).
 *
 * NEDEN HALKA DIŞARIDA: halkayı `borderWidth` ile fotoğrafın üstüne koymak
 * görseli kırpıyor; bu yüzden halka dış kapsayıcıdadır ve 2px boşlukla
 * fotoğrafı çevreler — kapsayıcının ölçüsü `size + 8` olur, çağıran taraf
 * yerleşimi buna göre kurgular.
 *
 * KARE BİÇİM (`shape="square"`): oyuncu profilinin üst bloğunda kullanılır.
 * Orada fotoğraf 88px'e çıkıyor ve dairesel hâli, aynı ekrandaki dairesel
 * TAKIM AMBLEMLERİYLE aynı silueti paylaşıp "bu hangisi" tereddüdü
 * yaratıyordu. Yumuşak köşeli kare, oyuncuyu kulüpten ayırır.
 */

import { memo, useEffect, useMemo, useState, type ReactNode } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { colors, radius, textScale, type } from "@/theme";
import { initials, mediaUrl } from "@/lib/format";

export interface AvatarProps {
  name?: string | null;
  image?: string | null;
  /** Varsayılan 32 */
  size?: number;
  /** Sağ altta durum noktası */
  status?: "online" | "offline" | "none";
  /** Sol üstte forma numarası rozeti */
  jersey?: number | null;
  /** Kaptan bandı vb. — sağ üstte gösterilir */
  badge?: ReactNode;
  /** 2px halka */
  ring?: "none" | "brand" | "live";
  /** Biçim. Varsayılan dairesel; kare biçim büyük profil fotoğrafı içindir. */
  shape?: "circle" | "square";
  /**
   * SAHA ÜSTÜNDE mi çiziliyor. Varsayılan yüzey (`surface2`) temayla döner ve
   * koyu temada derin yeşil sahanın üstünde koyu bir disk oluyordu; oyuncu
   * işareti orada formaya benzemeli, yani DAİMA AÇIK kalmalı.
   */
  onPitch?: boolean;
}

export const Avatar = memo(function Avatar({
  name,
  image,
  size = 32,
  status = "none",
  jersey,
  badge,
  ring = "none",
  shape = "circle",
  onPitch = false,
}: AvatarProps) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [image]);

  const uri = failed ? null : mediaUrl(image);

  // Kare biçimde yarıçap ölçüye göre ölçeklenir ama radius.lg'yi (kart
  // yarıçapı) geçmez: iç eleman daima dış elemandan küçük yarıçaplı kalır.
  const corner = shape === "square" ? Math.min(radius.lg, Math.round(size * 0.18)) : radius.pill;

  const box = useMemo(
    () => ({ width: size, height: size, borderRadius: corner }),
    [size, corner],
  );
  const wrap = useMemo(
    () =>
      ring === "none"
        ? { width: size, height: size, borderRadius: corner }
        : { width: size + 8, height: size + 8, padding: 2, borderRadius: corner + 2 },
    [size, ring, corner],
  );
  const initialsSize = useMemo(() => ({ fontSize: Math.max(11, Math.round(size * 0.38)) }), [size]);

  return (
    <View
      style={[styles.wrap, wrap, ring !== "none" && styles.ring, ring === "live" && styles.ringLive]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={name ? `${name} fotoğrafı` : "Profil fotoğrafı"}
    >
      {uri ? (
        <Image
          source={{ uri }}
          style={[styles.image, onPitch && styles.onPitchSurface, box]}
          resizeMode="cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <View style={[styles.fallback, onPitch && styles.onPitchSurface, box]}>
          <Text
            style={[styles.initials, onPitch && styles.onPitchInitials, initialsSize]}
            numberOfLines={1}
            {...textScale.badge}
          >
            {initials(name)}
          </Text>
        </View>
      )}

      {jersey != null ? (
        <View style={styles.jersey}>
          <Text style={styles.jerseyText} {...textScale.badge}>
            {jersey}
          </Text>
        </View>
      ) : null}

      {badge ? <View style={styles.badge}>{badge}</View> : null}

      {status !== "none" ? (
        <View style={[styles.status, status === "online" ? styles.statusOnline : styles.statusOffline]} />
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  ring: {
    borderWidth: 2,
    borderColor: colors.brandBorder,
    // borderRadius BURADA DEĞİL: kare biçimde `wrap` içindeki değeri ezerdi.
  },
  ringLive: {
    borderColor: colors.live,
  },
  image: {
    backgroundColor: colors.surface2,
  },
  /**
   * Saha üstündeki disk DAİMA BEYAZDIR. `surface1` temayla döner ve koyu
   * temada derin yeşilin üstünde koyu bir disk üretiyordu; oyuncu işareti
   * orada beyaz formaya benzemeli. Rakam/baş harf de sabit mürekkeptir.
   */
  onPitchSurface: {
    backgroundColor: colors.onPitch,
    borderColor: colors.onPitch,
  },
  onPitchInitials: {
    color: colors.gradientInk[1],
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
    // Baş harfler dar bir kutuya sığar: `micro` tokenının +0.4 harf aralığı
    // 22px'lik amblemde iki harfi kenara dayayıp üç nokta üretiyordu.
    letterSpacing: 0,
    color: colors.textTertiary,
  },
  jersey: {
    position: "absolute",
    top: -2,
    left: -2,
    width: 17,
    height: 17,
    borderRadius: radius.pill,
    backgroundColor: colors.surface3,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  jerseyText: {
    ...type.micro,
    color: colors.textSecondary,
    letterSpacing: 0,
  },
  badge: {
    position: "absolute",
    top: -2,
    right: -2,
  },
  status: {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: 10,
    height: 10,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: colors.surface1,
  },
  statusOnline: {
    backgroundColor: colors.win,
  },
  statusOffline: {
    backgroundColor: colors.textTertiary,
  },
});
