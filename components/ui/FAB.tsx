/**
 * FAB — yüzen eylem düğmesi (§4.28).
 *
 * NE ZAMAN KULLANILIR: ekranın TEK ve baskın eylemi varsa (maç ekle, yeni
 * mesaj, oyuncu davet et). İkinci bir FAB eklenmez; iki eşit ağırlıkta eylem
 * varsa ikisi de alt eylem çubuğuna iner.
 *
 * NEDEN KAYDIRINCA GİZLENİR: FAB liste içeriğinin üstünü kapatır. Kullanıcı
 * aşağı kaydırıyorsa okumak istiyordur; düğme 200ms'de aşağı kaçar, yukarı
 * kaydırınca geri gelir. Gizlenme `translateY` iledir (`useNativeDriver: true`)
 * — düğme yerinden kalkmaz, yalnız görüntüsü kayar; dokunma alanı da onunla
 * birlikte kaybolur çünkü kapsayıcıya `pointerEvents` verilir.
 *
 * `useFabAutoHide()` kancası kaydırma yönünü sade bir `onScroll` ile okur;
 * `Animated.event` kullanılmaz, çünkü burada gereken sayısal konum değil YÖN
 * bilgisidir ve yön değişimi saniyede birkaç kez olur.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  StyleSheet,
  Text,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import {
  colors,
  duration,
  easing,
  elevate,
  fonts,
  layout,
  radius,
  space,
  textScale,
  type,
} from "@/theme";
import { useReduceMotion } from "./LiveBadge";
import { Touchable } from "./Pressable";

export interface FABProps {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  /** Genişleyen etiket — `extended` ile birlikte görünür. */
  label?: string;
  extended?: boolean;
  tone?: "brand" | "live";
  /** Tab bar / güvenli alan üstünde konumlanması için alt boşluk. */
  offsetBottom?: number;
  /** Kaydırma yönüne göre gizlenir; `useFabAutoHide()` çıktısı buraya verilir. */
  visible?: boolean;
  accessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
}

/** Gizlenirken kat edilen mesafe — düğme ekranın altından tamamen çıkar. */
const HIDE_DISTANCE = 80;

export const FAB = React.memo(function FAB({
  icon,
  onPress,
  label,
  extended = false,
  tone = "brand",
  offsetBottom = layout.tabBarHeight + space.lg,
  visible = true,
  accessibilityLabel,
  style,
}: FABProps) {
  const reduceMotion = useReduceMotion();
  const translateY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(translateY, {
      toValue: visible ? 0 : HIDE_DISTANCE,
      duration: reduceMotion ? duration.instant : duration.base,
      easing: visible ? easing.decelerate : easing.accelerate,
      useNativeDriver: true,
    }).start();
  }, [reduceMotion, translateY, visible]);

  const background = tone === "live" ? colors.live : colors.brand;
  const foreground = tone === "live" ? colors.textOnStatus : colors.textOnBrand;
  const showLabel = extended && Boolean(label);

  return (
    <Animated.View
      pointerEvents={visible ? "box-none" : "none"}
      style={[styles.wrapper, { bottom: offsetBottom }, { transform: [{ translateY }] }, style]}
    >
      <Touchable
        feedback="fab"
        haptic="medium"
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={[
          styles.fab,
          elevate(3),
          { backgroundColor: background },
          showLabel ? styles.extended : styles.round,
        ]}
      >
        <Ionicons name={icon} size={22} color={foreground} />
        {showLabel ? (
          <Text style={[styles.label, { color: foreground }]} numberOfLines={1} {...textScale.badge}>
            {label}
          </Text>
        ) : null}
      </Touchable>
    </Animated.View>
  );
});

/**
 * Kaydırma yönüne göre FAB görünürlüğü.
 * `threshold` küçük titreşimleri yutar; parmağın doğal salınımı düğmeyi
 * yanıp söndürmemeli.
 */
export function useFabAutoHide(threshold = 12): {
  visible: boolean;
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
} {
  const [visible, setVisible] = useState(true);
  const lastY = useRef(0);

  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = event.nativeEvent.contentOffset.y;
      const delta = y - lastY.current;
      if (Math.abs(delta) < threshold) return;
      lastY.current = y;
      // Listenin en tepesinde her zaman görünür kalsın.
      setVisible(delta < 0 || y <= 0);
    },
    [threshold],
  );

  return { visible, onScroll };
}

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    right: layout.screenPadding + space.xs,
  },
  fab: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
  },
  round: {
    width: 52,
    height: 52,
    borderRadius: radius.pill,
  },
  /** Etiketli hâl: yükseklik 44, yatay boşluk 16 (§4.28). */
  extended: {
    height: 44,
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
  },
  label: {
    ...type.label,
    fontFamily: fonts.bold,
  },
});
