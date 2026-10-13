/**
 * FollowActions — detay sayfası kimliklerinin altındaki eylem şeridi.
 *
 * NEDEN: takip etmek eskiden başlık satırındaki küçük bir yıldız ikonuydu;
 * "bu takımın bildirimlerini nasıl alırım" sorusunun cevabı ise Profil →
 * Tercihler → Takip Bildirimleri'nin üç basamak altındaydı. Şerit ikisini
 * kimliğin hemen altına, metinli düğmeler olarak koyar:
 *
 *   [ ★ Takip ediliyor ]  [ 🔔 Bildirimler ]  [ ⇄ Karşılaştır ]
 *
 * Zil yalnız takip edilen varlıkta görünür (takip edilmeyen şeyin bildirimi
 * olmaz) ve takip bildirimleri ekranını o takibin ayarları AÇIK olarak açar.
 * Mor bloğun üstünde durduğu için renkler `onDark` ailesindendir.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Touchable } from "@/components/ui";
import { colors, fonts, radius, space, textScale, type } from "@/theme";

export interface FollowExtraAction {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}

export interface FollowActionsProps {
  following: boolean;
  onToggleFollow: () => void;
  /** Verilirse ve takip ediliyorsa zil düğmesi çizilir. */
  onOpenNotifications?: () => void;
  extra?: FollowExtraAction[];
  /** Düğme metinleri — varsayılan "Takip et" / "Takip ediliyor". */
  labels?: { follow: string; following: string };
}

const DEFAULT_LABELS = { follow: "Takip et", following: "Takip ediliyor" };

export const FollowActions = React.memo(function FollowActions({
  following,
  onToggleFollow,
  onOpenNotifications,
  extra = [],
  labels = DEFAULT_LABELS,
}: FollowActionsProps) {
  return (
    <View style={styles.row}>
      <Touchable
        feedback="button"
        haptic="light"
        onPress={onToggleFollow}
        accessibilityRole="button"
        accessibilityState={{ selected: following }}
        accessibilityLabel={following ? `${labels.following}. Takibi bırak` : labels.follow}
        style={[styles.pill, following ? styles.pillOn : styles.pillPrimary]}
      >
        <Ionicons
          name={following ? "checkmark-circle" : "star"}
          size={15}
          color={following ? colors.onDark : colors.textOnBrand}
        />
        <Text style={[styles.label, following ? styles.labelOn : styles.labelPrimary]} {...textScale.dense}>
          {following ? labels.following : labels.follow}
        </Text>
      </Touchable>

      {following && onOpenNotifications ? (
        <Touchable
          feedback="button"
          haptic="selection"
          onPress={onOpenNotifications}
          accessibilityRole="button"
          accessibilityLabel="Bildirim ayarları"
          style={[styles.pill, styles.pillGhost]}
        >
          <Ionicons name="notifications" size={15} color={colors.onDark} />
          <Text style={[styles.label, styles.labelOn]} {...textScale.dense}>
            Bildirimler
          </Text>
        </Touchable>
      ) : null}

      {extra.map((action) => (
        <Touchable
          key={action.label}
          feedback="button"
          haptic="selection"
          onPress={action.onPress}
          accessibilityRole="button"
          accessibilityLabel={action.label}
          style={[styles.pill, styles.pillGhost]}
        >
          <Ionicons name={action.icon} size={15} color={colors.onDark} />
          <Text style={[styles.label, styles.labelOn]} {...textScale.dense}>
            {action.label}
          </Text>
        </Touchable>
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.s,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    height: 34,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
  },
  pillPrimary: {
    backgroundColor: colors.brand,
  },
  pillOn: {
    backgroundColor: colors.inkPill,
    borderWidth: 1,
    borderColor: colors.brandOnDark,
  },
  pillGhost: {
    backgroundColor: colors.inkPill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.inkPillBorder,
  },
  label: {
    ...type.label,
    fontFamily: fonts.semibold,
  },
  labelPrimary: { color: colors.textOnBrand },
  labelOn: { color: colors.onDark },
});
