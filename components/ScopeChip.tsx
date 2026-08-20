/**
 * ScopeChip — başlık satırının İÇİNDE yaşayan kapsam göstergesi.
 *
 * NEDEN VAR: eski `<ScopeBar />` beş ekranda tekrar eden, üç çipli, kalıcı
 * olarak ~48px dikey alan yiyen bir şeritti. Kapsam bilgisi ekranda sürekli
 * durması gereken bir VERİ değil, ara sıra değiştirilen bir AYAR'dır: tek satır
 * özet + dokununca açılan alt sayfa yeterli. Çip başlık satırına girdiği için
 * ek dikey alan maliyeti sıfırdır.
 *
 * Dokununca ScopeProvider'daki tek örnek ScopeSheet açılır (her ekran kendi
 * modalını yaratmaz).
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useCallback, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Touchable } from "@/components/ui";
import { useScope } from "@/providers/ScopeProvider";
import { colors, radius, space, textScale, touchSlop, type } from "@/theme";

export interface ScopeChipProps {
  /** "full" = şehir · lig · sezon, "city" = yalnız şehir. Varsayılan "full". */
  variant?: "full" | "city";
  /** Verilmezse kapsam sayfası açılır. */
  onPress?: () => void;
  testID?: string;
}

/**
 * "2025/26" → "25/26", "2025-2026" → "25/26".
 * Sezon etiketi çipin en az bilgi taşıyan ama en uzun parçasıdır; kısaltılınca
 * lig adı için yer açılır.
 */
function shortSeason(label: string): string {
  const match = label.trim().match(/^(\d{2})?(\d{2})\s*[/\-–]\s*(\d{2})?(\d{2})$/);
  if (!match) return label.trim();
  return `${match[2]}/${match[4]}`;
}

/** "1. Lig" → "1.Lig": tek satırda kalması için ligdeki nokta boşluğu atılır. */
function shortLeague(label: string): string {
  return label.trim().replace(/^(\d+)\.\s+/, "$1.");
}

export const ScopeChip = React.memo(function ScopeChip({
  variant = "full",
  onPress,
  testID,
}: ScopeChipProps) {
  const scope = useScope();
  const { openScopeSheet } = scope;

  const handlePress = useCallback(() => {
    if (onPress) {
      onPress();
      return;
    }
    openScopeSheet("city");
  }, [onPress, openScopeSheet]);

  const label = useMemo(() => {
    const city = scope.cityLabel || "Şehir";
    if (variant === "city") return city;
    const parts = [city];
    if (scope.leagueLabel) parts.push(shortLeague(scope.leagueLabel));
    if (scope.seasonLabel) parts.push(shortSeason(scope.seasonLabel));
    return parts.join(" · ");
  }, [variant, scope.cityLabel, scope.leagueLabel, scope.seasonLabel]);

  return (
    <Touchable
      feedback="chip"
      haptic="selection"
      onPress={handlePress}
      style={styles.chip}
      hitSlop={touchSlop(32)}
      accessibilityRole="button"
      accessibilityLabel={`Kapsam: ${label}`}
      accessibilityHint="Şehir, lig ve sezon seçmek için dokunun"
      testID={testID}
    >
      <View style={styles.inner}>
        <Text
          style={styles.label}
          numberOfLines={1}
          ellipsizeMode="tail"
          {...textScale.dense}
        >
          {label}
        </Text>
        <Ionicons name="chevron-down" size={13} color={colors.textSecondary} />
      </View>
    </Touchable>
  );
});

const styles = StyleSheet.create({
  chip: {
    height: 32,
    justifyContent: "center",
    borderRadius: radius.md,
    // Çerçevesiz: başlıkla aynı zemine oturur, kutu çizmez.
    paddingHorizontal: 0,
  },
  inner: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
  },
  label: {
    ...type.label,
    color: colors.textSecondary,
    // İki satıra taşmasın diye: uzun kapsam adı sonundan kırpılır.
    flexShrink: 1,
    maxWidth: 220,
  },
});
