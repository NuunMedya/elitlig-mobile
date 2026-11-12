/**
 * Cüzdan şeridi — jeton, can (geri sayımla) ve yıldız hapları.
 *
 * Jeton → mağaza, can → can doldurma, yıldız → stadyum. Lig Yolu'nun her
 * ekranının tepesinde aynı yerde durur; kullanıcı kaynaklarını hep görür.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { Touchable } from "@/components/ui";
import type { PuzzleProfile } from "@/lib/puzzle/api";
import { useLifeCountdown } from "@/lib/puzzle/usePuzzle";
import { colors, fonts, hairline, radius, space, textScale, type } from "@/theme";

export function WalletBar({
  profile,
  onCoins,
  onLives,
  onStars,
  onDark,
  hideLives,
}: {
  profile: PuzzleProfile | undefined;
  /** Lig Yolu ana sayfası: canlar oyun başına olduğundan oyun kartlarında gösterilir. */
  hideLives?: boolean;
  onCoins?: () => void;
  onLives?: () => void;
  onStars?: () => void;
  onDark?: boolean;
}) {
  const life = useLifeCountdown(profile);
  return (
    <View style={styles.row}>
      {hideLives ? null : <Pill
        icon="heart"
        tint={colors.live}
        value={profile ? String(life.lives) : "–"}
        hint={life.label}
        onPress={onLives}
        label={`Can ${life.lives}${life.label && life.label !== "Dolu" ? `, sıradaki ${life.label}` : ""}`}
        onDark={onDark}
        plus={Boolean(profile && life.lives < profile.max_lives)}
      />}
      <Pill
        icon="disc"
        tint={colors.yellowCard}
        value={profile ? profile.coins.toLocaleString("tr-TR") : "–"}
        onPress={onCoins}
        label={`Jeton ${profile?.coins ?? 0}`}
        onDark={onDark}
        plus
      />
      <Pill
        icon="star"
        tint={colors.yellowCard}
        value={profile ? String(profile.stadium.available) : "–"}
        hint={profile ? "stadyum" : null}
        onPress={onStars}
        label={`Harcanabilir yıldız ${profile?.stadium.available ?? 0}`}
        onDark={onDark}
      />
    </View>
  );
}

function Pill({
  icon,
  tint,
  value,
  hint,
  onPress,
  label,
  onDark,
  plus,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
  value: string;
  hint?: string | null;
  onPress?: () => void;
  label: string;
  onDark?: boolean;
  plus?: boolean;
}) {
  return (
    <Touchable
      onPress={onPress}
      disabled={!onPress}
      haptic="selection"
      style={[styles.pill, onDark ? styles.pillDark : null]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons name={icon} size={18} color={tint} />
      <View style={styles.texts}>
        <Text style={[styles.value, onDark ? styles.valueDark : null]} numberOfLines={1} {...textScale.badge}>
          {value}
        </Text>
        {hint ? (
          <Text style={[styles.hint, onDark ? styles.hintDark : null]} numberOfLines={1} {...textScale.badge}>
            {hint}
          </Text>
        ) : null}
      </View>
      {plus && onPress ? <Ionicons name="add-circle" size={16} color={colors.brandAccent} /> : null}
    </Touchable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: space.sm },
  pill: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    minHeight: 40,
    paddingHorizontal: space.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  pillDark: { backgroundColor: colors.inkTile, borderColor: colors.inkTileBorder },
  texts: { flex: 1 },
  value: { ...type.label, fontFamily: fonts.bold, color: colors.textPrimary },
  valueDark: { color: colors.onDark },
  hint: { ...type.micro, color: colors.textTertiary },
  hintDark: { color: colors.onDarkMuted },
});
