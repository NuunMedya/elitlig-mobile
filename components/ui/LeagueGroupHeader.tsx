/**
 * Lig grubu başlığı — maç listesinde blokları ayıran yapışkan (sticky) satır.
 *
 * NEDEN AYRI BİLEŞEN: SofaScore hissi "lige göre bloklar"dan gelir; başlık hem
 * grubun kimliği (logo + ad + şehir) hem de kontrol yüzeyidir. Dokunma
 * alanları ayrıdır: gövde ligi açar, raptiye ligi SABİTLER (cihazda; lig
 * listesinde ve lig seçicide üste çıkar), yıldız ligi TAKİP eder (bildirim),
 * chevron katlar. Sabitlemek ile takip etmek ayrı kavramlardır: biri düzen
 * tercihi, öteki bildirim aboneliği.
 *
 * `icon` verilirse kupa yerine o ikon menekşe pulda çizilir — Skorlar'daki
 * "Takip ettiklerin" grubu bir lig değildir ve lig gibi görünmemelidir.
 *
 * İKİ BİÇİM: varsayılan BİTİŞİK başlık, grubun kartının üst kapağıdır (altına
 * `MatchCard variant="compact"` satırları `position` ile dizilir); `detached`
 * ise kartlardan ayrı duran, dört köşesi yuvarlak bağımsız şerittir.
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
  hairline,
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
  /** Ligi takip yıldızı (`useFollowFlow().toggle({ type: "league", … })`). */
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
  /** Ligi sabitleme raptiyesi (`useScope().togglePinLeague`). */
  isPinned?: boolean;
  onTogglePin?: () => void;
  /** Lig olmayan gruplar için kupa yerine ikon (ör. "star" → Takip ettiklerin). */
  icon?: keyof typeof Ionicons.glyphMap;
  /** Lig sayfasına git */
  onPress?: () => void;
  sticky?: boolean;
  /** Kart listelerinde: başlık satırlara bitişmez, dört köşesi yuvarlak bir şerittir. */
  detached?: boolean;
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
  isPinned = false,
  onTogglePin,
  icon,
  onPress,
  sticky = false,
  detached = false,
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

  const handlePin = useCallback(() => {
    haptics.select();
    onTogglePin?.();
  }, [onTogglePin]);

  const hasLogo = Boolean(mediaUrl(logo));

  return (
    <View
      style={[
        styles.wrap,
        detached ? styles.detached : collapsed ? styles.attachedCollapsed : styles.attached,
        sticky && !detached && !collapsed ? styles.sticky : null,
      ]}
    >
      <Pressable
        style={styles.body}
        onPress={handleBody}
        accessibilityRole="button"
        accessibilityLabel={
          matchCount != null ? `${leagueName}, ${matchCount} maç` : leagueName
        }
        accessibilityState={{ expanded: !collapsed }}
      >
        <View style={[styles.mark, icon ? styles.markBrand : null]}>
          {icon ? (
            <Ionicons name={icon} size={13} color={colors.brandAccent} />
          ) : hasLogo ? (
            <TeamLogo name={leagueName} logo={logo} size={22} />
          ) : (
            <Ionicons name="trophy" size={13} color={colors.textSecondary} />
          )}
        </View>

        <View style={styles.texts}>
          <Text style={styles.name} numberOfLines={1} {...textScale.dense}>
            {leagueName}
          </Text>
          {cityName ? (
            <Text style={styles.city} numberOfLines={1} {...textScale.badge}>
              {cityName}
            </Text>
          ) : null}
        </View>
      </Pressable>

      {matchCount != null ? (
        <View style={styles.countPill}>
          <Text style={styles.count} {...textScale.badge}>
            {matchCount}
          </Text>
        </View>
      ) : null}

      {onTogglePin ? (
        <Pressable
          onPress={handlePin}
          hitSlop={touchSlop(28)}
          style={styles.iconButton}
          accessibilityRole="button"
          accessibilityState={{ selected: isPinned }}
          accessibilityLabel={isPinned ? `${leagueName} sabitlemesini kaldır` : `${leagueName} sabitle`}
        >
          <Ionicons
            name={isPinned ? "pin" : "pin-outline"}
            size={16}
            color={isPinned ? colors.brandAccent : colors.textTertiary}
          />
        </Pressable>
      ) : null}

      {onToggleFavorite ? (
        <Pressable
          onPress={handleFavorite}
          hitSlop={touchSlop(28)}
          style={styles.iconButton}
          accessibilityRole="button"
          accessibilityState={{ selected: isFavorite }}
          accessibilityLabel={isFavorite ? `${leagueName} takibini bırak` : `${leagueName} takip et`}
        >
          <Ionicons
            name={isFavorite ? "star" : "star-outline"}
            size={17}
            color={isFavorite ? colors.brand : colors.textTertiary}
          />
        </Pressable>
      ) : null}

      {onToggle ? (
        <Pressable
          onPress={handleToggle}
          hitSlop={touchSlop(28)}
          style={styles.iconButton}
          accessibilityRole="button"
          accessibilityState={{ expanded: !collapsed }}
          accessibilityLabel={collapsed ? `${leagueName} maçlarını göster` : `${leagueName} maçlarını gizle`}
        >
          <Animated.View style={{ transform: [{ rotate }] }}>
            <Ionicons name="chevron-down" size={17} color={colors.textTertiary} />
          </Animated.View>
        </Pressable>
      ) : null}
    </View>
  );
});

/** Başlık satırının yüksekliği — listeler `getItemLayout` için bunu kullanır. */
export const LEAGUE_GROUP_HEADER_HEIGHT = 48;

const styles = StyleSheet.create({
  wrap: {
    height: LEAGUE_GROUP_HEADER_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    paddingLeft: space.md,
    paddingRight: space.xs,
    backgroundColor: colors.surface1,
    borderColor: colors.border,
  },
  /**
   * BİTİŞİK (varsayılan): grubun kartının ÜST KAPAĞI. Alttaki satırlar
   * (`MatchCard variant="compact"`) kartın gövdesini ve alt köşelerini çizer;
   * başlık ile ilk satır arasında yalnız saç teli ayraç vardır. Lig kimliği
   * böylece maçlarından kopmaz — eski ayrı gri şerit, grubu "başlık + kartlar"
   * diye ikiye bölüyordu.
   */
  attached: {
    borderTopWidth: hairline,
    borderLeftWidth: hairline,
    borderRightWidth: hairline,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderBottomWidth: hairline,
    borderBottomColor: colors.separator,
  },
  /** Katlıyken satır yok: başlık tek başına, dört köşesi yuvarlak bir karttır. */
  attachedCollapsed: {
    borderWidth: hairline,
    borderRadius: radius.xl,
  },
  // Yapışkan başlık listenin üstünde durur; alt kenar biraz koyulaşır ki
  // altından kayan satırlarla karışmasın.
  sticky: {
    borderBottomColor: colors.border,
  },
  detached: {
    borderRadius: radius.xl,
    borderWidth: hairline,
  },
  body: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: space.m,
    height: "100%",
    minWidth: 0,
  },
  /** Lig işareti: amblem ya da kupa, küçük gri pulun içinde. */
  mark: {
    width: 26,
    height: 26,
    borderRadius: radius.sm,
    backgroundColor: colors.surface3,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  markBrand: {
    backgroundColor: colors.brandDim,
  },
  texts: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    ...type.h4,
    color: colors.textPrimary,
  },
  city: {
    ...type.caption,
    color: colors.textTertiary,
  },
  countPill: {
    minWidth: 24,
    height: 20,
    paddingHorizontal: space.s,
    borderRadius: radius.pill,
    backgroundColor: colors.surface3,
    alignItems: "center",
    justifyContent: "center",
  },
  count: {
    ...type.numSmStrong,
    color: colors.textSecondary,
  },
  iconButton: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
});
