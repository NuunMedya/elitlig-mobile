/**
 * SectionHeader — bölüm/grup başlığı, yapışkan kullanılabilir.
 *
 * İKİ BOY, İKİ İŞ (`size`):
 *   · "section" (VARSAYILAN) — ekrandaki asıl bölüm başlığı. 18px, cümle
 *     düzeni, birincil mürekkep. Bir bölümün nerede başladığını UZAKTAN
 *     söyler.
 *   · "group" — yoğun bir listenin içindeki grup etiketi (lig adı, gün).
 *     11px büyük harf, ikincil mürekkep; altındaki veriyle yarışmaz.
 *
 * NEDEN DEĞİŞTİ: önceki sürümde TEK boy vardı ve o da "group" boyuydu — 10px
 * büyük harf. Ekranın her başlığı aynı sönük etiket olunca sayfa "gri bir
 * duvar" hâline geliyordu; kullanıcı nereye baktığını başlıktan değil ancak
 * içeriği okuyarak anlayabiliyordu. Asıl bölüm başlığı manşet olmalıdır.
 *
 * Türkçe büyük harf daima `upperTR()` ile yapılır (I/İ sorunu).
 *
 * YAPIŞKAN KULLANIM: `sticky` verildiğinde zemin OPAK `bg` olur ve alta
 * hairline eklenir; şeffaf bırakılırsa altından kayan satırlar başlığın
 * içinden geçer.
 *
 * İMZA ÖĞESİ — KALE DİREĞİ. Başlığın solunda 2×12px mercan dikey işaret durur.
 * Bu, ürünün "tebeşir çizgisi" dilinin en çok tekrar eden parçasıdır: saha
 * çizgileri dekor değil YAPISAL AYRAÇ olarak kullanılır ve bir bölümün nerede
 * başladığını renk değil GEOMETRİ söyler. Mercan burada aksiyon rengi olarak
 * değil işaret olarak durur; toplam alanı birkaç pikseldir, %5 kuralını
 * zorlamaz. `leading` (lig amblemi) verildiğinde işaret çizilmez — iki sol
 * gösterge yan yana gelirse ikisi de anlamını kaybeder.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useEffect, useMemo, useRef } from "react";
import { Animated, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import {
  colors,
  duration,
  easing,
  hairline,
  layout,
  space,
  textScale,
  type,
  upperTR,
} from "@/theme";
import { Touchable } from "./Pressable";

export interface SectionHeaderProps {
  title: string;
  /** Sağda gri sayaç/etiket: "8 maç" */
  meta?: string;
  /** Sol ikon (lig logosu veya Ionicon düğümü). */
  leading?: React.ReactNode;
  /** Katlanabilir grup başlığı. */
  collapsible?: boolean;
  collapsed?: boolean;
  onToggle?: () => void;
  /** Sağda eylem: "Tümü" */
  action?: { label: string; onPress: () => void };
  /** SectionList'te sticky ise: opak zemin + alt kenarlık. */
  sticky?: boolean;
  /**
   * Başlığın boyu. "section" ekranın bölüm başlığı, "group" yoğun liste içi
   * grup etiketi. Varsayılan "section".
   */
  size?: "section" | "group";
  /** Büyük harfe çevir. Varsayılan: "group" boyunda true, "section"da false. */
  uppercase?: boolean;
  /** Kale direği işareti. Varsayılan true; `leading` varsa yok sayılır. */
  mark?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export const SectionHeader = React.memo(function SectionHeader({
  title,
  meta,
  leading,
  collapsible,
  collapsed,
  onToggle,
  action,
  sticky,
  size = "section",
  uppercase,
  mark = true,
  style,
  testID,
}: SectionHeaderProps) {
  const spin = useRef(new Animated.Value(collapsed ? 0 : 1)).current;

  useEffect(() => {
    Animated.timing(spin, {
      toValue: collapsed ? 0 : 1,
      duration: duration.base,
      easing: easing.standard,
      useNativeDriver: true,
    }).start();
  }, [collapsed, spin]);

  const chevronStyle = useMemo(
    () => ({
      transform: [
        {
          rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "90deg"] }),
        },
      ],
    }),
    [spin],
  );

  const group = size === "group";
  const upper = uppercase ?? group;
  const label = upper ? upperTR(title) : title;

  const body = (
    <>
      {collapsible ? (
        <Animated.View style={chevronStyle}>
          <Ionicons name="chevron-forward" size={group ? 13 : 16} color={colors.textTertiary} />
        </Animated.View>
      ) : null}
      {leading ? (
        <View style={styles.leading}>{leading}</View>
      ) : mark ? (
        <View style={styles.mark} />
      ) : null}
      <Text
        style={[styles.title, group ? styles.titleGroup : styles.titleSection]}
        numberOfLines={1}
        {...textScale.dense}
      >
        {label}
      </Text>
      {meta ? (
        <Text
          style={[styles.meta, group ? styles.metaGroup : styles.metaSection]}
          numberOfLines={1}
          {...textScale.dense}
        >
          {meta}
        </Text>
      ) : null}
    </>
  );

  const containerStyle: StyleProp<ViewStyle> = [
    styles.header,
    group ? styles.headerGroup : styles.headerSection,
    leading ? styles.headerWithLeading : null,
    sticky ? styles.sticky : null,
    style,
  ];

  return (
    <View style={styles.wrapper} testID={testID}>
      {collapsible && onToggle ? (
        <Touchable
          feedback="row"
          haptic="selection"
          onPress={onToggle}
          accessibilityRole="button"
          accessibilityLabel={title}
          accessibilityState={{ expanded: !collapsed }}
          style={[containerStyle, styles.flex]}
        >
          {body}
        </Touchable>
      ) : (
        <View
          accessibilityRole="header"
          accessibilityLabel={meta ? `${title}, ${meta}` : title}
          style={[containerStyle, styles.flex]}
        >
          {body}
        </View>
      )}

      {action ? (
        <Touchable
          feedback="icon"
          haptic="none"
          onPress={action.onPress}
          accessibilityRole="button"
          accessibilityLabel={action.label}
          style={[styles.action, sticky ? styles.sticky : null]}
        >
          <Text style={styles.actionLabel} numberOfLines={1} {...textScale.dense}>
            {action.label}
          </Text>
          <Ionicons name="chevron-forward" size={15} color={colors.brandAccent} />
        </Touchable>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.m,
    paddingHorizontal: layout.screenPadding,
  },
  headerSection: {
    minHeight: 44,
  },
  headerGroup: {
    minHeight: 34,
    gap: space.s,
  },
  headerWithLeading: {
    minHeight: 48,
  },
  sticky: {
    backgroundColor: colors.bg,
    borderBottomWidth: hairline,
    borderBottomColor: colors.separator,
  },
  leading: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  /** Kale direği: mercan dikey işaret (imza öğesi). Başlıkla birlikte büyüdü. */
  mark: {
    width: 3,
    height: 18,
    borderRadius: 2,
    backgroundColor: colors.brand,
  },
  title: {
    flexShrink: 1,
  },
  titleSection: {
    ...type.h2,
    color: colors.textPrimary,
  },
  titleGroup: {
    ...type.overline,
    color: colors.textSecondary,
  },
  meta: {
    marginLeft: "auto",
  },
  metaSection: {
    ...type.bodySm,
    color: colors.textTertiary,
  },
  metaGroup: {
    ...type.micro,
    color: colors.textTertiary,
  },
  action: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: layout.screenPadding,
  },
  actionLabel: {
    ...type.label,
    color: colors.brandAccent,
  },
});
