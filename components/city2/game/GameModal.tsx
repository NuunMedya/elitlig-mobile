/**
 * ŞEHİR PENCERESİ (küçük) — karartılmış şehrin üstünde ahşap çerçeveli oyun
 * penceresi: kurdele başlık, kırmızı kapat, kaydırılan içerik, altta düğmeler.
 *
 *   · surface="paper" (varsayılan): krem parşömen, oyun renkleri (iki temada
 *     aynı) — şehir ayarları, haberler, renkler, cüzdanlar.
 *   · surface="page": temaya uyan sayfa — uygulama bileşenlerini (cüzdan
 *     kartları, form kartı) olduğu gibi taşıyan pencereler.
 */

import React, { useEffect, useRef } from "react";
import { Animated, Modal, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";

import { useReduceMotion } from "@/components/ui";
import { CG } from "@/lib/puzzle/cityGamePalette";
import { space } from "@/theme";

import { WoodFrame } from "./CityGameKit";

export function GameModal({
  visible,
  onClose,
  title,
  surface = "paper",
  footer,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  surface?: "paper" | "page";
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  const reduce = useReduceMotion();
  const { width, height } = useWindowDimensions();
  const pop = useRef(new Animated.Value(reduce ? 1 : 0)).current;
  useEffect(() => {
    if (!visible) return;
    if (reduce) {
      pop.setValue(1);
      return;
    }
    pop.setValue(0);
    Animated.spring(pop, { toValue: 1, friction: 6, tension: 90, useNativeDriver: true }).start();
  }, [pop, reduce, visible]);
  if (!visible) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.dim}>
        <Animated.View
          accessibilityViewIsModal
          style={{ width: Math.min(420, width - space.lg * 2), maxHeight: height - 110, opacity: pop, transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) }] }}
        >
          <WoodFrame ribbon={title} onClose={onClose} surface={surface} innerStyle={styles.inner}>
            <ScrollView style={styles.scroll} contentContainerStyle={styles.body} bounces={false} showsVerticalScrollIndicator={false}>
              {children}
            </ScrollView>
            {footer ? <View style={styles.foot}>{footer}</View> : null}
          </WoodFrame>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  dim: { flex: 1, backgroundColor: CG.dim, alignItems: "center", justifyContent: "center", paddingVertical: space.xl },
  inner: { paddingTop: space.xl },
  scroll: { flexGrow: 0, flexShrink: 1 },
  body: { paddingHorizontal: space.md, paddingBottom: space.md, gap: space.sm },
  foot: { paddingHorizontal: space.md, paddingBottom: space.md, gap: space.sm },
});
