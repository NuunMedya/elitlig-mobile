/**
 * SectionHeader — bölüm/grup başlığı, yapışkan kullanılabilir (§4.4).
 *
 * NEDEN MİKRO + BÜYÜK HARF: başlık burada bir "etiket"tir, bir manşet değil.
 * 10px büyük harf + geniş harf aralığı, altındaki veriyle yarışmadan grubu
 * ayırır; bu, skor uygulamalarının gün/lig başlıklarındaki standart dildir.
 * Türkçe büyük harf daima `upperTR()` ile yapılır (I/İ sorunu).
 *
 * YAPIŞKAN KULLANIM: `sticky` verildiğinde zemin OPAK `bg` olur ve alta
 * hairline eklenir; şeffaf bırakılırsa altından kayan satırlar başlığın
 * içinden geçer.
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
  /** varsayılan true */
  uppercase?: boolean;
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
  uppercase = true,
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

  const label = uppercase ? upperTR(title) : title;

  const body = (
    <>
      {collapsible ? (
        <Animated.View style={chevronStyle}>
          <Ionicons name="chevron-forward" size={12} color={colors.textTertiary} />
        </Animated.View>
      ) : null}
      {leading ? <View style={styles.leading}>{leading}</View> : null}
      <Text style={styles.title} numberOfLines={1} {...textScale.dense}>
        {label}
      </Text>
      {meta ? (
        <Text style={styles.meta} numberOfLines={1} {...textScale.dense}>
          {meta}
        </Text>
      ) : null}
    </>
  );

  const containerStyle: StyleProp<ViewStyle> = [
    styles.header,
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
          <Ionicons name="chevron-forward" size={12} color={colors.brandAccent} />
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
    gap: space.s,
    height: 32,
    paddingHorizontal: layout.screenPadding,
  },
  headerWithLeading: {
    height: 40,
  },
  sticky: {
    backgroundColor: colors.bg,
    borderBottomWidth: hairline,
    borderBottomColor: colors.separator,
  },
  leading: {
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    ...type.micro,
    color: colors.textSecondary,
    flexShrink: 1,
  },
  meta: {
    ...type.micro,
    color: colors.textTertiary,
    marginLeft: "auto",
  },
  action: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: layout.screenPadding,
  },
  actionLabel: {
    ...type.caption,
    color: colors.brandAccent,
  },
});
