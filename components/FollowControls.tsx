/**
 * FollowStar · FollowBell — listelerdeki takip denetimleri.
 *
 *   FollowStar  Satır içi takip yıldızı (Puan tablosu, maç satırı, takım
 *               ızgarası). Takip ederken `useFollowFlow().toggle` çağrılır:
 *               takip edilince bildirim türleri alt sayfası açılır, bırakınca
 *               kısa bir bildirim düşer.
 *   FollowBell  Takip edilen öğenin zili (Takip sekmesindeki her öğe). O
 *               takibin bildirim türlerini aynı alt sayfada açar; sessize
 *               alınmışsa üstü çizili zil görünür.
 *
 * Arena: takip yıldızı `brand` rengidir (aksiyon/seçili), zil nötr pul.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useCallback } from "react";
import { StyleSheet } from "react-native";
import { Touchable } from "@/components/ui";
import { useFollowSettings } from "@/hooks/useFollowSettings";
import { useFavorite, type FollowTarget } from "@/providers/FavoriteProvider";
import { useFollowFlow } from "@/providers/FollowFlowProvider";
import { colors, radius, touchSlop } from "@/theme";

export interface FollowControlProps {
  target: FollowTarget;
  /** İkon boyu (varsayılan 18). */
  size?: number;
  testID?: string;
}

export const FollowStar = React.memo(function FollowStar({ target, size = 18, testID }: FollowControlProps) {
  const { isFollowing } = useFavorite();
  const flow = useFollowFlow();
  const on = isFollowing(target.type, target.id);
  const handlePress = useCallback(() => flow.toggle(target), [flow, target]);
  return (
    <Touchable
      feedback="icon"
      haptic={on ? "light" : "success"}
      onPress={handlePress}
      hitSlop={touchSlop(size + 12)}
      style={styles.star}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      accessibilityLabel={on ? `${target.name} takibini bırak` : `${target.name} takip et`}
      testID={testID ?? `follow-star-${target.type}-${target.id}`}
    >
      <Ionicons name={on ? "star" : "star-outline"} size={size} color={on ? colors.brand : colors.textTertiary} />
    </Touchable>
  );
});

export const FollowBell = React.memo(function FollowBell({ target, size = 18, testID }: FollowControlProps) {
  const flow = useFollowFlow();
  const settings = useFollowSettings();
  const muted = Boolean(settings.find(target.type, target.id)?.muted);
  const handlePress = useCallback(() => flow.openSettings(target), [flow, target]);
  return (
    <Touchable
      feedback="icon"
      haptic="selection"
      onPress={handlePress}
      hitSlop={touchSlop(36)}
      style={[styles.bell, muted ? styles.bellMuted : null]}
      accessibilityRole="button"
      accessibilityLabel={`${target.name} bildirim türleri`}
      testID={testID ?? `follow-bell-${target.type}-${target.id}`}
    >
      <Ionicons
        name={muted ? "notifications-off-outline" : "notifications-outline"}
        size={size}
        color={muted ? colors.textTertiary : colors.textSecondary}
      />
    </Touchable>
  );
});

const styles = StyleSheet.create({
  star: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  bell: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface2,
  },
  bellMuted: {
    backgroundColor: colors.surface3,
  },
});
