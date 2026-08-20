/**
 * Lig grubu başlığı — maç listesinde blokları ayıran yapışkan (sticky) satır.
 *
 * NEDEN AYRI BİLEŞEN: SofaScore hissi "lige göre bloklar"dan gelir; başlık hem
 * grubun kimliği (logo + ad + şehir) hem de kontrol yüzeyidir (katla/aç,
 * favoriye al, lige git). Üç eylem tek satıra sığdığı için dokunma alanları
 * ayrılır: gövde ligi açar, chevron katlar, yıldız favoriler.
 *
 * KATLAMA: `LayoutAnimation` ile (reanimated yok). Chevron 150ms'de -90°
 * dönerek "aşağı bak" → "sağa bak" olur; ikon değiştirmek yerine döndürmek,
 * yarım kalan geçişlerde zıplamayı önler.
 */

import { memo, useCallback, useEffect, useRef } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import {
  animateNextLayout,
  colors,
  duration,
  easing,
  layout,
  radius,
  space,
  textScale,
  touchSlop,
  type,
} from "@/theme";
import { haptics } from "@/lib/haptics";
import { mediaUrl } from "@/lib/format";
import { TeamLogo } from "./TeamLogo";

export interface LeagueGroupHeaderProps {
  leagueName: string;
  cityName?: string | null;
  logo?: string | null;
  matchCount?: number;
  collapsed?: boolean;
  onToggle?: () => void;
  /** Ligi favoriye alma yıldızı */
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
  /** Lig sayfasına git */
  onPress?: () => void;
  sticky?: boolean;
}

export const LeagueGroupHeader = memo(function LeagueGroupHeader({
  leagueName,
  cityName,
  logo,
  matchCount,
  collapsed = false,
  onToggle,
  isFavorite = false,
  onToggleFavorite,
  onPress,
  sticky = false,
}: LeagueGroupHeaderProps) {
  const spin = useRef(new Animated.Value(collapsed ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(spin, {
      toValue: collapsed ? 1 : 0,
      duration: 150,
      easing: easing.standard,
      useNativeDriver: true,
    }).start();
  }, [collapsed, spin]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "-90deg"] });

  const handleToggle = useCallback(() => {
    if (!onToggle) {
      onPress?.();
      return;
    }
    haptics.select();
    animateNextLayout(duration.base);
    onToggle();
  }, [onToggle, onPress]);

  // Gövdeye basmak ligi açar; lig sayfası yoksa katlama görevini üstlenir.
  const handleBody = useCallback(() => {
    if (onPress) {
      haptics.select();
      onPress();
      return;
    }
    handleToggle();
  }, [onPress, handleToggle]);

  const handleFavorite = useCallback(() => {
    haptics.light();
    onToggleFavorite?.();
  }, [onToggleFavorite]);

  const hasLogo = Boolean(mediaUrl(logo));

  return (
    <View style={[styles.wrap, sticky && styles.sticky]}>
      <Pressable
        style={styles.body}
        onPress={handleBody}
        accessibilityRole="button"
        accessibilityLabel={
          matchCount != null ? `${leagueName}, ${matchCount} maç` : leagueName
        }
        accessibilityState={{ expanded: !collapsed }}
      >
        {hasLogo ? (
          <TeamLogo name={leagueName} logo={logo} size={18} />
        ) : (
          <Ionicons name="trophy-outline" size={14} color={colors.textTertiary} />
        )}

        <Text style={styles.name} numberOfLines={1} {...textScale.dense}>
          {leagueName}
          {cityName ? <Text style={styles.city}>{`  ·  ${cityName}`}</Text> : null}
        </Text>
      </Pressable>

      {matchCount != null ? (
        <Text style={styles.count} {...textScale.badge}>
          {matchCount}
        </Text>
      ) : null}

      {onToggleFavorite ? (
        <Pressable
          onPress={handleFavorite}
          hitSlop={touchSlop(24)}
          accessibilityRole="button"
          accessibilityState={{ selected: isFavorite }}
          accessibilityLabel={isFavorite ? `${leagueName} favorilerden çıkar` : `${leagueName} favorilere ekle`}
        >
          <Ionicons
            name={isFavorite ? "star" : "star-outline"}
            size={16}
            color={isFavorite ? colors.star : colors.starEmpty}
          />
        </Pressable>
      ) : null}

      {onToggle ? (
        <Pressable
          onPress={handleToggle}
          hitSlop={touchSlop(24)}
          accessibilityRole="button"
          accessibilityState={{ expanded: !collapsed }}
          accessibilityLabel={collapsed ? `${leagueName} maçlarını göster` : `${leagueName} maçlarını gizle`}
        >
          <Animated.View style={{ transform: [{ rotate }] }}>
            <Ionicons name="chevron-down" size={16} color={colors.textTertiary} />
          </Animated.View>
        </Pressable>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    height: 40,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: layout.rowPaddingH,
    backgroundColor: colors.surface2,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
  },
  // Yapışkan başlık listenin üstünde durur; alt kenar çizgisi içeriğin
  // başlığın altından "sızıyor" hissini keser.
  sticky: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  body: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    height: "100%",
  },
  name: {
    ...type.label,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  city: {
    ...type.micro,
    color: colors.textTertiary,
  },
  count: {
    ...type.micro,
    color: colors.textTertiary,
  },
});
