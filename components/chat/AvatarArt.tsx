/**
 * SOHBET AVATARI — Gece dili (ikinci tur). Gelen kutusu, sohbet başlığı ve
 * kişi / grup bilgisi aynı avatarı çizer:
 *
 *   · Fotoğraf → takım arması (kırpılmadan) → resmî sohbet (mor degrade daire)
 *     → grup / takım (degrade ikon karosu) → baş harfler (sakin gri daire).
 *   · `ring`: avatarın çevresinde İMZA DEGRADESİ halka (okunmamış, kimlik).
 *   · `online`: sağ altta nane nokta; halkası zemin renginde (`dotRing`).
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { memo, useEffect, useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";

import type { ConversationType } from "@/lib/api/chat";
import { avatarTone, colors, wa } from "@/lib/chatPalette";
import { initials, mediaUrl } from "@/lib/format";
import { hairline, radius, textScale, type } from "@/theme";

const AVATAR = 50;


export interface InboxAvatarProps {
  type: ConversationType | "person";
  title: string;
  image?: string | null;
  /** Sohbet / kişi kimliği (çağıranlar verir; avatar rengi artık sohbete göre değişmez). */
  seed?: number | string;
  /** Yönetim gelen kutusu: yazışmanın sahibi (takım / oyuncu / üye) gösterilir. */
  owner?: boolean;
  online?: boolean;
  /** Okunmamış: avatarın çevresinde imza degradesi halka. */
  ring?: boolean;
  /** Avatar çapı (varsayılan 50). */
  size?: number;
  /** Çevrimiçi noktasının halka rengi (avatarın oturduğu zemin). */
  dotRing?: string;
}

/**
 * Fotoğraf → takım arması (kırpılmadan) → resmî sohbet (mor degrade daire) →
 * grup / takım (degrade ikon karosu) → baş harfler (sakin gri daire).
 */
export const InboxAvatar = memo(function InboxAvatar({ type: kind, title, image, owner = false, online = false, ring = false, size = AVATAR, dotRing }: InboxAvatarProps) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [image]);
  const uri = failed ? null : mediaUrl(image);
  const official = !owner && (kind === "management" || kind === "admin");
  const group = kind === "group" || kind === "team";
  const box = size + 6;
  const fill = { width: size, height: size, borderRadius: radius.pill };
  const dot = Math.max(12, Math.round(size * 0.3));
  const tileFill = official ? colors.gradientBrand : kind === "team" ? colors.tileTones.violet : colors.tileTones.cyan;

  return (
    <View style={[styles.avatarBox, { width: box, height: box }]}>
      {ring ? (
        <LinearGradient colors={colors.gradientSignature} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, styles.ring]} />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.ring, styles.ringIdle]} />
      )}
      <View style={[styles.avatarInner, { width: size + 2, height: size + 2 }]}>
        {uri ? (
          <Image
            source={{ uri }}
            style={[fill, kind === "team" ? styles.avatarCrest : null]}
            resizeMode={kind === "team" ? "contain" : "cover"}
            // Profil fotoğrafları kamera çıktısıdır; "resize" olmadan Android'de tam boyutta çözülür.
            resizeMethod="resize"
            onError={() => setFailed(true)}
          />
        ) : official || group ? (
          <View style={[fill, styles.avatarCenter, styles.clip]}>
            <LinearGradient
              colors={tileFill}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <Ionicons name={official ? (kind === "admin" ? "notifications" : "shield-checkmark") : kind === "team" ? "shield-half" : "people"} size={Math.round(size * 0.46)} color={colors.onDark} />
          </View>
        ) : (
          <View style={[fill, styles.avatarCenter, styles.avatarPlain]}>
            <Text style={[styles.avatarInitials, size < 44 ? styles.avatarInitialsSm : size >= 72 ? styles.avatarInitialsLg : null]} numberOfLines={1} {...textScale.badge}>{initials(title)}</Text>
          </View>
        )}
      </View>
      {online ? <View style={[styles.online, { width: dot, height: dot }, dotRing ? { borderColor: dotRing } : null]} /> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  avatarBox: { alignItems: "center", justifyContent: "center" },
  ring: { borderRadius: radius.pill },
  ringIdle: { borderWidth: hairline, borderColor: colors.border },
  avatarInner: { borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface1 },
  avatarCenter: { alignItems: "center", justifyContent: "center" },
  avatarPlain: { backgroundColor: avatarTone.bg },
  clip: { overflow: "hidden" },
  avatarCrest: { backgroundColor: colors.surface1, borderWidth: hairline, borderColor: colors.border },
  avatarInitials: { ...type.h2, color: avatarTone.ink },
  avatarInitialsSm: { ...type.label },
  avatarInitialsLg: { ...type.display, color: avatarTone.ink },
  /* Çevrimiçi noktası: kart zemini renginde halkayla avatardan ayrılır. */
  online: { position: "absolute", right: 1, bottom: 1, borderRadius: radius.pill, borderWidth: 2.5, borderColor: colors.surface1, backgroundColor: wa.online },
});
