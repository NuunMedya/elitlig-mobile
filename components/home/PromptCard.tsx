/**
 * PromptCard — Ana Sayfa'nın tek cümlelik davet kartı ("Takımını takip et",
 * "Kulübünü yönet").
 *
 * ANATOMİ: renkli ikon pulu · başlık + tek cümle · sağda eylem (düğme ya da
 * chevron). Kart beyaz kâğıt kartıdır; marka rengi yalnız pulda ve eylemde
 * durur — davet, içeriğin arasında bağırmadan durmalı.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Button, Touchable } from "@/components/ui";
import { colors, elevate, radius, space, textScale, type } from "@/theme";

export interface PromptCardProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
  /** Verilirse sağda düğme çizilir; verilmezse kartın tamamı basılır. */
  actionLabel?: string;
  onPress: () => void;
}

export const PromptCard = React.memo(function PromptCard({
  icon,
  title,
  body,
  actionLabel,
  onPress,
}: PromptCardProps) {
  const inner = (
    <>
      <View style={styles.icon}>
        <Ionicons name={icon} size={20} color={colors.brandAccent} />
      </View>
      <View style={styles.texts}>
        <Text style={styles.title} {...textScale.dense}>
          {title}
        </Text>
        <Text style={styles.body} {...textScale.dense}>
          {body}
        </Text>
      </View>
      {actionLabel ? (
        <Button label={actionLabel} size="sm" onPress={onPress} />
      ) : (
        <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
      )}
    </>
  );

  if (actionLabel) return <View style={styles.card}>{inner}</View>;

  return (
    <Touchable
      feedback="card"
      haptic="selection"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={styles.card}
    >
      {inner}
    </Touchable>
  );
});

const styles = StyleSheet.create({
  card: {
    ...elevate(1),
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: radius.xl,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.brandDim,
    alignItems: "center",
    justifyContent: "center",
  },
  texts: {
    flex: 1,
    gap: 2,
  },
  title: {
    ...type.h3,
    color: colors.textPrimary,
  },
  body: {
    ...type.bodySm,
    color: colors.textSecondary,
  },
});
