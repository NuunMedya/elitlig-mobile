/**
 * ŞEHİR PENCERESİ — akademi, sezon, takım, ziyaret, sıralama ve liglerin
 * tam ekran oyun penceresi. Gece mavisi zemin, ortada kurdele başlık, sağ
 * üstte kırmızı kapat düğmesi, solda yuvarlak eylem düğmeleri; içerik ahşap
 * çerçevenin içindeki krem PARŞÖMENDE (iki temada aynı; iç parçalar
 * lib/puzzle/cityGamePalette `CP` paletiyle çizilir).
 *
 * Şehrin içinde katman olarak (CityNavProvider) ve kendi rotasında aynı
 * görünür; kapatma `useCityNav().close` ile (katmanda şehre döner, rotada
 * geri gider). Android geri tuşu katmanı şehrin ekranı kapatır.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Touchable, type ScreenHeaderAction } from "@/components/ui";
import { CG } from "@/lib/puzzle/cityGamePalette";
import { fonts, layout, radius, space, textScale, touchSlop, type } from "@/theme";

import { BOTTOM, CloseBubble, Ribbon, TOP } from "./CityGameKit";
import { useCityNav } from "./CityNav";

export function CityWindow({
  title,
  subtitle,
  actions,
  bottom,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string | null;
  /** Sol üstte yuvarlak düğmeler (ScreenHeader eylemleriyle aynı biçim). */
  actions?: ScreenHeaderAction[];
  /** Başlığın altında (sekmeler). */
  bottom?: React.ReactNode;
  onClose?: () => void;
  children: React.ReactNode;
}) {
  const nav = useCityNav();
  const insets = useSafeAreaInsets();
  const close = onClose ?? nav.close;
  return (
    <View style={styles.screen}>
      <LinearGradient colors={CG.windowBg} start={TOP} end={BOTTOM} style={StyleSheet.absoluteFill} />
      <View style={[styles.head, { paddingTop: insets.top + space.xs }]}>
        <View style={styles.headRow}>
          <View style={styles.side}>
            {nav.inCity ? null : (
              <Touchable onPress={close} hitSlop={touchSlop(40)} haptic="light" accessibilityRole="button" accessibilityLabel="Geri" style={styles.icon}>
                <Ionicons name="chevron-back" size={22} color={CG.white} />
              </Touchable>
            )}
            {(actions ?? []).slice(0, 2).map((a) => (
              <Touchable key={a.accessibilityLabel} onPress={a.onPress} hitSlop={touchSlop(40)} haptic="selection" accessibilityRole="button" accessibilityLabel={a.accessibilityLabel} style={styles.icon}>
                <Ionicons name={a.icon} size={20} color={CG.white} />
                {a.badge ? <View style={styles.dot} /> : null}
              </Touchable>
            ))}
          </View>
          <View style={styles.titleWrap}>
            <Ribbon title={title} />
          </View>
          <View style={[styles.side, styles.sideRight]}>
            <CloseBubble onPress={close} label={nav.inCity ? "Şehre dön" : "Kapat"} />
          </View>
        </View>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1} {...textScale.dense}>
            {subtitle}
          </Text>
        ) : null}
        {bottom ? <View style={styles.bottom}>{bottom}</View> : null}
      </View>
      <View style={[styles.frameWrap, { paddingBottom: Math.max(insets.bottom, space.sm) }]}>
        <View style={styles.frameLip} />
        <LinearGradient colors={CG.wood} start={TOP} end={BOTTOM} style={styles.frame}>
          <LinearGradient colors={CG.paper} start={TOP} end={BOTTOM} style={styles.page}>
            {children}
          </LinearGradient>
        </LinearGradient>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: CG.windowBg[2] },
  head: { paddingHorizontal: layout.screenPadding, paddingBottom: space.sm, gap: space.xs },
  headRow: { flexDirection: "row", alignItems: "center", minHeight: 52 },
  side: { width: 92, flexDirection: "row", alignItems: "center", gap: space.xs },
  sideRight: { justifyContent: "flex-end" },
  titleWrap: { flex: 1, alignItems: "center", paddingHorizontal: space.md },
  icon: { width: 40, height: 40, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: CG.inkShadow, borderWidth: 2, borderColor: CG.white },
  dot: { position: "absolute", top: -2, right: -2, width: 12, height: 12, borderRadius: radius.pill, backgroundColor: CG.badge, borderWidth: 2, borderColor: CG.white },
  subtitle: { ...type.labelSm, fontFamily: fonts.bold, color: CG.white, textAlign: "center", opacity: 0.88 },
  bottom: { marginTop: space.xs },
  frameWrap: { flex: 1, paddingHorizontal: space.sm },
  frameLip: { position: "absolute", left: space.sm, right: space.sm, top: 6, bottom: 0, borderTopLeftRadius: radius.xxl, borderTopRightRadius: radius.xxl, backgroundColor: CG.woodLip },
  frame: { flex: 1, padding: 6, borderRadius: radius.xxl, borderWidth: 2, borderColor: CG.woodEdge },
  page: { flex: 1, borderRadius: radius.xl, overflow: "hidden", borderWidth: 2, borderColor: CG.paperEdge },
});
