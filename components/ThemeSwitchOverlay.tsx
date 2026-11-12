/**
 * ThemeSwitchOverlay — tema değişiminden sonraki ilk karede eski temanın
 * görüntüsünü yeni temanın ÜSTÜNDE tutar ve onu ortadan dışa doğru büyüterek
 * söndürür ("Portal Open"). Bkz. `lib/themeTransition.ts`.
 *
 * Görüntü dosyası animasyon bitince silinmez (geçici dizinde, sistem temizler);
 * kayıt ise açılışta okunur okunmaz silinir ki bir sonraki açılışta tekrar
 * oynamasın. "Hareketi azalt" açıkken kısa bir solmayla geçer.
 */

import React, { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, Image, StyleSheet, View } from "react-native";

export function ThemeSwitchOverlay({ uri, children }: { uri: string | null; children: React.ReactNode }) {
  const [visible, setVisible] = useState(Boolean(uri));
  const t = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!uri) return;
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((reduce) => {
        if (cancelled) return;
        Animated.timing(t, {
          toValue: 1,
          duration: reduce ? 180 : 620,
          delay: reduce ? 0 : 120,
          easing: Easing.bezier(0.2, 0.8, 0.25, 1),
          useNativeDriver: true,
        }).start(() => setVisible(false));
      });
    return () => {
      cancelled = true;
    };
  }, [t, uri]);

  return (
    <View style={styles.root}>
      {children}
      {visible && uri ? (
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            {
              opacity: t.interpolate({ inputRange: [0, 0.35, 1], outputRange: [1, 0.9, 0] }),
              transform: [{ scale: t.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] }) }],
            },
          ]}
        >
          <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
