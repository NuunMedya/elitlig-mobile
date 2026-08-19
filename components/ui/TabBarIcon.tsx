/**
 * TabBarIcon — sekme ikonu, rozeti ve aktif göstergesi (§4.29).
 *
 * NEDEN `tabBarBadge` KULLANILMIYOR: React Navigation'ın hazır rozeti platform
 * varsayılanı renkleri kullanır, tema paletine uymaz ve "canlı maç var" gibi
 * SAYISIZ bir durumu anlatamaz. Burada rozet elle çizilir:
 *   · `badge="live"` → nabız atan 6px kırmızı nokta (şu anda oynanan maç var)
 *   · `badge="dot"`  → sabit nokta (okunmamış bir şey var, sayısı önemsiz)
 *   · sayı           → 99+ ile sınırlanan sayaç
 * Rozetin çevresinde 2px zemin rengi halka vardır; ikonun çizgileriyle
 * karışmasın diye — koyu temada bu halka olmadan rozet ikona yapışık görünür.
 *
 * NEDEN MOR HAP DOLGUSU KALDIRILDI: eski tab bar aktif sekmeyi mor bir hapla
 * dolduruyordu; mor bu tasarımda geniş yüzey doldurmaz (§1.0). Aktif sekme
 * artık `brandAccent` ikon + üstte 2px `brand` gösterge çizgisidir.
 *
 * "Hareketi azalt" açıkken nabız durur, nokta sabit kalır (§5.8).
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import { colors, duration, radius, textScale, type } from "@/theme";
import { useReduceMotion } from "./LiveBadge";

export interface TabBarIconProps {
  /** Dolu varyantın adı — odaksızken sonuna "-outline" eklenir. */
  name: keyof typeof Ionicons.glyphMap;
  focused: boolean;
  color: string;
  size?: number;
  /** Sayısal rozet, canlı noktası veya sade nokta. */
  badge?: number | "live" | "dot";
  /** Üstte 2px aktif gösterge çizgisi (yeni tab bar düzeni). */
  indicator?: boolean;
}

/** 99'dan büyük sayaçlar rozete sığmaz. */
function formatCount(value: number): string {
  return value > 99 ? "99+" : String(value);
}

export const TabBarIcon = React.memo(function TabBarIcon({
  name,
  focused,
  color,
  size = 22,
  badge,
  indicator = false,
}: TabBarIconProps) {
  const reduceMotion = useReduceMotion();
  const pulse = useRef(new Animated.Value(0)).current;
  const isLive = badge === "live";

  useEffect(() => {
    if (!isLive || reduceMotion) {
      pulse.setValue(0);
      return;
    }
    const half = duration.pulse / 2;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: half,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: half,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [isLive, pulse, reduceMotion]);

  const iconName = (focused ? name : `${name}-outline`) as keyof typeof Ionicons.glyphMap;
  const hasCount = typeof badge === "number" && badge > 0;

  return (
    <View style={styles.container}>
      {indicator ? (
        <View style={[styles.indicator, focused ? styles.indicatorOn : null]} />
      ) : null}

      <View style={styles.iconBox}>
        <Ionicons name={iconName} size={size} color={color} />

        {isLive ? (
          <Animated.View
            style={[
              styles.liveDot,
              {
                opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 0.35] }),
                transform: [
                  { scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.35] }) },
                ],
              },
            ]}
          />
        ) : null}

        {badge === "dot" ? <View style={styles.dot} /> : null}

        {hasCount ? (
          <View style={styles.countBadge}>
            <Text style={styles.countText} {...textScale.badge}>
              {formatCount(badge)}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
  },
  /** Aktif göstergesi: ikonun 2px üstünde, sekme genişliğinin ortasında. */
  indicator: {
    position: "absolute",
    top: -8,
    width: 20,
    height: 2,
    borderRadius: radius.pill,
    backgroundColor: "transparent",
  },
  indicatorOn: {
    backgroundColor: colors.brand,
  },
  iconBox: {
    alignItems: "center",
    justifyContent: "center",
  },
  liveDot: {
    position: "absolute",
    top: -2,
    right: -4,
    width: 6,
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.live,
    borderWidth: 2,
    borderColor: colors.tabBar,
  },
  dot: {
    position: "absolute",
    top: -2,
    right: -4,
    width: 8,
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.live,
    borderWidth: 2,
    borderColor: colors.tabBar,
  },
  countBadge: {
    position: "absolute",
    top: -7,
    right: -12,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.live,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.tabBar,
  },
  countText: {
    ...type.micro,
    color: colors.textOnStatus,
  },
});
