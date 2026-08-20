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
}

export const Avatar = memo(function Avatar({
  name,
  image,
  size = 32,
  status = "none",
  jersey,
  badge,
  ring = "none",
}: AvatarProps) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [image]);

  const uri = failed ? null : mediaUrl(image);

  const box = useMemo(
    () => ({ width: size, height: size, borderRadius: radius.pill }),
    [size],
  );
  const wrap = useMemo(
    () => (ring === "none" ? { width: size, height: size } : { width: size + 8, height: size + 8, padding: 2 }),
    [size, ring],
  );
  const initialsSize = useMemo(() => ({ fontSize: Math.max(9, Math.round(size * 0.36)) }), [size]);

  return (
    <View
      style={[styles.wrap, wrap, ring !== "none" && styles.ring, ring === "live" && styles.ringLive]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={name ? `${name} fotoğrafı` : "Profil fotoğrafı"}
    >
      {uri ? (
        <Image source={{ uri }} style={[styles.image, box]} resizeMode="cover" onError={() => setFailed(true)} />
      ) : (
        <View style={[styles.fallback, box]}>
          <Text style={[styles.initials, initialsSize]} numberOfLines={1} {...textScale.badge}>
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
    borderRadius: radius.pill,
  },
  ringLive: {
    borderColor: colors.live,
  },
  image: {
    backgroundColor: colors.surface2,
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
  },
  jersey: {
    position: "absolute",
    top: -2,
    left: -2,
    width: 16,
    height: 16,
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
