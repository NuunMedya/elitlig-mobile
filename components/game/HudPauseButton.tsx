/**
 * OYUN İÇİ DURDUR DÜĞMESİ — oyunun kendi HUD'unun bir parçası gibi görünen
 * yuvarlak, kabartmalı düğme (yüz + alt dudak + ince kenar).
 *
 * Uygulama başlığı / şeridi YOK: oyunlar tam ekrandır. Düğmeyi ya oyunun
 * kendi HUD satırı çizer (Lig Yolu RN bulmacaları: `onPause` ile), ya da
 * WebView oyunlarında kabuk sağ üst köşeye bindirir (oyunun Canvas HUD'u o
 * köşeyi `hudInset` ile boş bırakır). Her oyun kendi renk dilini `skin` ile
 * verir; varsayılan, arcade oyunlarının lacivert HUD haplarıdır.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { Touchable } from "@/components/ui";
import { CARTOON } from "@/lib/game/cartoon";
import { radius, touchSlop } from "@/theme";

export interface HudButtonSkin {
  /** Düğme yüzü. */
  face: string;
  /** Alttaki koyu dudak (kabartma derinliği). */
  lip: string;
  /** Yüzün ince kenarı. */
  edge: string;
  /** Simge rengi. */
  ink: string;
}

/** Arcade (Canvas) oyunlarının lacivert HUD hapı ile aynı dil. */
export const ARCADE_HUD_SKIN: HudButtonSkin = {
  face: CARTOON.pill[0],
  lip: CARTOON.shadow,
  edge: CARTOON.glassEdge,
  ink: CARTOON.white,
};

/** Kabartma derinliği (px). */
const LIP = 3;

export function HudPauseButton({
  onPress,
  size = 42,
  skin = ARCADE_HUD_SKIN,
  icon = "pause",
  label = "Oyunu durdur",
  style,
}: {
  onPress: () => void;
  /** Dış çap (dudak dahil yükseklik size + 3). */
  size?: number;
  skin?: HudButtonSkin;
  icon?: keyof typeof Ionicons.glyphMap;
  label?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Touchable
      onPress={onPress}
      hitSlop={touchSlop(size)}
      accessibilityRole="button"
      accessibilityLabel={label}
      haptic="light"
      style={[{ width: size, height: size + LIP }, style]}
    >
      <View style={[styles.lip, { width: size, height: size, borderRadius: radius.pill, backgroundColor: skin.lip }]} />
      <View style={[styles.face, { width: size, height: size, borderRadius: radius.pill, backgroundColor: skin.face, borderColor: skin.edge }]}>
        <Ionicons name={icon} size={Math.round(size * 0.46)} color={skin.ink} />
      </View>
    </Touchable>
  );
}

const styles = StyleSheet.create({
  lip: { position: "absolute", left: 0, top: LIP },
  face: { position: "absolute", left: 0, top: 0, alignItems: "center", justifyContent: "center", borderWidth: 1.5 },
});

/**
 * Tam ekran (WebView) oyunlarda kabuğun bindirdiği durdur düğmesinin yeri:
 * güvenli alanın içinde, sağ üst köşe (px).
 */
export const OVERLAY_PAUSE = { top: 10, right: 12, size: 42 } as const;
/** Canvas HUD'unun boş bırakacağı sağ üst köşe (durdur düğmesi), CSS px. */
export const PAUSE_HUD_INSET = { top: 0, right: 64 } as const;
