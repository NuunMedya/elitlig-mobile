/**
 * Card — başlıklı içerik bloğu (§4.2).
 *
 * KURAL: LİSTE ASLA KART İÇİNE SARILMAZ. Kart, "Genel Bakış", "Kasa özeti"
 * gibi tek parça bir bloğu çerçevelemek içindir; liste ise `ListRow` grubudur.
 * İki listeyi karta sarmak, iç içe iki köşe yarıçapı ve iki kenarlık üretir —
 * yoğun düzenin en hızlı bozulma biçimi budur.
 *
 * Başlık satırı 36px'tir ve ALTINA AYRAÇ ÇİZİLMEZ; başlıkla gövdeyi 8px'lik
 * nefes boşluğu ayırır. Ayraç yalnızca footer'ın üstünde vardır, çünkü orası
 * gerçekten farklı bir bölgedir (eylem/özet).
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { colors, elevate, hairline, radius as radiusScale, space, textScale, type } from "@/theme";
import { Touchable } from "./Pressable";
import { Surface, type SurfaceProps } from "./Surface";

export interface CardProps extends SurfaceProps {
  title?: string;
  subtitle?: string;
  /** Sağ üstte metin + chevron; basılınca onPress. */
  action?: { label: string; onPress: () => void };
  /** İçerik iç boşluğu — varsayılan "md" (12). */
  padding?: keyof typeof space;
  footer?: React.ReactNode;
  /** Kartın tamamı basılabilirse: ölçek 0.985 + surface2 zemin (§5.2). */
  onPress?: () => void;
  contentStyle?: StyleProp<ViewStyle>;
}

export const Card = React.memo(function Card({
  title,
  subtitle,
  action,
  padding = "md",
  footer,
  onPress,
  children,
  level = 1,
  radius = "lg",
  bordered,
  style,
  contentStyle,
  testID,
  ...rest
}: CardProps) {
  const pad = space[padding];

  const inner = (
    <>
      {title || action ? (
        <View style={[styles.header, { paddingHorizontal: pad, paddingTop: pad }]}>
          <View style={styles.headerTexts}>
            <Text style={styles.title} numberOfLines={1} {...textScale.dense}>
              {title}
            </Text>
            {subtitle ? (
              <Text style={styles.subtitle} numberOfLines={2} {...textScale.dense}>
                {subtitle}
              </Text>
            ) : null}
          </View>

          {action ? (
            <Touchable
              feedback="icon"
              haptic="none"
              onPress={action.onPress}
              accessibilityRole="button"
              accessibilityLabel={action.label}
              style={styles.action}
            >
              <Text style={styles.actionLabel} numberOfLines={1} {...textScale.dense}>
                {action.label}
              </Text>
              <Ionicons name="chevron-forward" size={14} color={colors.brandAccent} />
            </Touchable>
          ) : null}
        </View>
      ) : null}

      {children != null ? (
        <View
          style={[
            {
              paddingHorizontal: pad,
              paddingBottom: pad,
              // Başlık varsa gövdeyle arasında 8px nefes boşluğu kalır (§4.2).
              paddingTop: title || action ? space.sm : pad,
            },
            contentStyle,
          ]}
        >
          {children}
        </View>
      ) : null}

      {footer ? (
        <View style={[styles.footer, { paddingHorizontal: pad, paddingVertical: space.m }]}>
          {footer}
        </View>
      ) : null}
    </>
  );

  if (onPress) {
    return (
      <Touchable
        feedback="card"
        haptic="selection"
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={title}
        testID={testID}
        style={[
          styles.pressableSurface,
          { borderRadius: radiusScale[radius] },
          bordered === false ? styles.noBorder : null,
          style,
        ]}
      >
        {inner}
      </Touchable>
    );
  }

  return (
    <Surface {...rest} level={level} radius={radius} bordered={bordered} style={style} testID={testID}>
      {inner}
    </Surface>
  );
});

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
    minHeight: 36,
  },
  headerTexts: {
    flex: 1,
    gap: 2,
  },
  title: {
    ...type.h2,
    color: colors.textPrimary,
  },
  subtitle: {
    ...type.bodySm,
    color: colors.textTertiary,
  },
  action: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingVertical: space.xs,
    paddingLeft: space.sm,
  },
  actionLabel: {
    ...type.label,
    color: colors.brandAccent,
  },
  footer: {
    borderTopWidth: hairline,
    borderTopColor: colors.separator,
  },
  /**
   * Basılabilir kart Surface'i saramaz (basma tepkisi kutunun kendisinde
   * olmalı), bu yüzden 1. seviye yüzey burada elle kurulur.
   */
  pressableSurface: {
    ...elevate(1),
  },
  noBorder: {
    borderWidth: 0,
  },
});
