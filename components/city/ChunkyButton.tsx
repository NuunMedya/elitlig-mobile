/**
 * Alt dudaklı 3B oyun düğmesi (altın: geliştir / al · yeşil: topla / kurtar).
 * Kulüp Şehri, günlük ödül ve şehir pencerelerinin ortak birincil eylemi.
 * Renkler oyun dünyasınındır (iki temada aynı): lib/puzzle/cityPalette.ts.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { Touchable } from "@/components/ui";
import { CITY_UI } from "@/lib/puzzle/cityPalette";
import { fonts, radius, space, textScale, type } from "@/theme";

const TOP = { x: 0.5, y: 0 } as const;
const BOTTOM = { x: 0.5, y: 1 } as const;

export function ChunkyButton({
  label,
  icon,
  onPress,
  disabled,
  tone = "gold",
  small,
  accessibilityLabel,
  style,
}: {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  disabled?: boolean;
  tone?: "gold" | "green";
  small?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const fill = tone === "green" ? CITY_UI.green : CITY_UI.gold;
  const lip = tone === "green" ? CITY_UI.greenLip : CITY_UI.goldLip;
  const ink = tone === "green" ? CITY_UI.white : CITY_UI.ink;
  const h = small ? 38 : 52;
  return (
    <Touchable
      onPress={onPress}
      disabled={disabled}
      haptic="success"
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
      accessibilityLabel={accessibilityLabel ?? label}
      style={[small ? styles.chunkySmall : styles.chunky, { height: h + 4, opacity: disabled ? 0.45 : 1 }, style]}
    >
      <View style={[styles.lip, { height: h, backgroundColor: lip }]} />
      <LinearGradient colors={fill} start={TOP} end={BOTTOM} style={[styles.fill, { height: h }]}>
        {icon ? <Ionicons name={icon} size={small ? 15 : 20} color={ink} /> : null}
        <Text style={[small ? styles.textSmall : styles.text, { color: ink }]} numberOfLines={1} {...textScale.badge}>
          {label}
        </Text>
      </LinearGradient>
    </Touchable>
  );
}

const styles = StyleSheet.create({
  chunky: { alignSelf: "stretch" },
  chunkySmall: { minWidth: 76 },
  lip: { position: "absolute", top: 4, left: 0, right: 0, borderRadius: radius.pill },
  fill: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.xs, paddingHorizontal: space.md, borderRadius: radius.pill, borderWidth: 2, borderColor: CITY_UI.white },
  text: { ...type.label, fontFamily: fonts.bold, letterSpacing: 1 },
  textSmall: { ...type.label, fontFamily: fonts.bold },
});
