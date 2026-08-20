/**
 * Toggle — ayar anahtarı (şartnamedeki `Switch`, §4.30).
 *
 * NEDEN "Toggle": React Native'in kendi `Switch` bileşeniyle ad çakışmasın
 * diye. İçeride yine yerel `Switch` kullanılır — platformun kendi anahtarı
 * erişilebilirlik (VoiceOver/TalkBack "açık/kapalı") ve dokunma alanı
 * açısından elle yazılan bir anahtardan daima üstündür; bize düşen yalnızca
 * renkleri temaya bağlamak.
 *
 * HAPTİK: değer değişimi bir SEÇİM'dir (§5.3) → `haptics.select()`. Satır
 * içinde kullanıldığında ListRow da haptik tetikler; theme/motion.ts'teki
 * 300 ms throttle ikisinin üst üste binmesini engeller.
 */

import React, { useCallback } from "react";
import { Platform, StyleSheet, Switch } from "react-native";
import { colors, haptics } from "@/theme";

export interface ToggleProps {
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
  /** Değişimde dokunsal geri bildirim — varsayılan true. */
  haptic?: boolean;
  accessibilityLabel?: string;
  testID?: string;
}

export const Toggle = React.memo(function Toggle({
  value,
  onValueChange,
  disabled,
  haptic = true,
  accessibilityLabel,
  testID,
}: ToggleProps) {
  const handleChange = useCallback(
    (next: boolean) => {
      if (haptic) haptics.select();
      onValueChange(next);
    },
    [haptic, onValueChange],
  );

  return (
    <Switch
      value={value}
      onValueChange={handleChange}
      disabled={disabled}
      testID={testID}
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: value, disabled }}
      trackColor={{ true: colors.brand, false: colors.surface3 }}
      thumbColor={Platform.OS === "android" ? colors.surface1 : undefined}
      ios_backgroundColor={colors.surface3}
      style={[styles.base, disabled ? styles.disabled : null]}
    />
  );
});

const styles = StyleSheet.create({
  base: {
    // Android'de anahtar iOS'takinden belirgin küçüktür; yoğun satır düzeninde
    // iki platformun optik ağırlığı yakınlaşsın diye hafifçe büyütülür.
    transform: Platform.OS === "android" ? [{ scaleX: 1.1 }, { scaleY: 1.1 }] : undefined,
  },
  disabled: {
    opacity: 0.5,
  },
});
