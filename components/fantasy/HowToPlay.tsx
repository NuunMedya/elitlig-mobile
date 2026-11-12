/** "Nasıl oynanır" — kuralların kısa listesi (lib/fantasy HOW_TO_PLAY). */

import Ionicons from "@expo/vector-icons/Ionicons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { HOW_TO_PLAY } from "@/lib/fantasy";
import { colors, radius, space, textScale, type } from "@/theme";

export function HowToPlay() {
  return (
    <View style={styles.list}>
      {HOW_TO_PLAY.map((item) => (
        <View key={item.title} style={styles.item}>
          <View style={styles.icon}>
            <Ionicons name={item.icon as keyof typeof Ionicons.glyphMap} size={16} color={colors.accentText} />
          </View>
          <View style={styles.body}>
            <Text style={styles.title} {...textScale.dense}>
              {item.title}
            </Text>
            <Text style={styles.text} {...textScale.long}>
              {item.body}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: space.lg, paddingBottom: space.xl },
  item: { flexDirection: "row", gap: space.md },
  icon: { width: 32, height: 32, borderRadius: radius.sm, alignItems: "center", justifyContent: "center", backgroundColor: colors.accentDim },
  body: { flex: 1, gap: space.xxs },
  title: { ...type.h4, color: colors.textPrimary },
  text: { ...type.bodySm, color: colors.textSecondary },
});
