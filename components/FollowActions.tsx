/**
 * FollowActions — detay sayfası kimliklerinin altındaki eylem şeridi.
 *
 * NEDEN: takip etmek eskiden başlık satırındaki küçük bir yıldız ikonuydu;
 * "bu takımın bildirimlerini nasıl alırım" sorusunun cevabı ise Profil →
 * Tercihler → Takip Bildirimleri'nin üç basamak altındaydı. Şerit ikisini
 * kimliğin hemen altına, metinli düğmeler olarak koyar:
 *
 *   [ ★ Takip et ]  [ ⇄ Karşılaştır ]
 *   [ ✓ Takip ediliyor ]  [ 🔔 ]  [ ⇄ Karşılaştır ]
 *
 * Zil yalnız takip edilen varlıkta görünür (takip edilmeyen şeyin bildirimi
 * olmaz) ve takip bildirimleri ekranını o takibin ayarları AÇIK olarak açar.
 *
 * ŞERİT SATIRI DOLDURUR: düğmeler içerik genişliğinden başlar ve kalan yeri
 * paylaşır (`flexGrow`). Eskiden sola yaslı iki hap sahnenin sağında boş bir
 * delik bırakıyordu; eylem şeridi gibi değil, unutulmuş iki etiket gibi
 * duruyordu. Sığmayan düğme alt satıra iner ve orada tam genişliğe yayılır.
 *
 * YÜZEYİ KENDİSİ ÖĞRENİR: sahne başlığının içinde (`HeaderToneContext`
 * "ink") grafit üstü renkler, dışında kâğıt renkleri kullanılır. Çağıranların
 * bir şey geçmesi gerekmez; prop sözleşmesi değişmedi.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Touchable, useHeaderTone } from "@/components/ui";
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
  const ink = useHeaderTone("ink") === "ink";
  const t = ink ? onInk : onPaper;

  return (
    <View style={styles.row}>
      {/* Birincil eylem: takip edilmiyorsa dolu marka düğmesi; ediliyorsa
          sessiz düğme + marka renkli onay. Seçili durum dolguyla değil
          işaretle söylenir — "Takip ediliyor" ikinci bir çağrı değildir. */}
      <Touchable
        feedback="button"
        haptic={following ? "light" : "success"}
        onPress={onToggleFollow}
        accessibilityRole="button"
        accessibilityState={{ selected: following }}
        accessibilityLabel={following ? `${labels.following}. Takibi bırak` : labels.follow}
        style={[styles.button, following ? t.quiet : styles.primary]}
      >
        <Ionicons
          name={following ? "checkmark-circle" : "star"}
          size={16}
          color={following ? t.accentColor : colors.textOnBrand}
        />
        <Text
          style={[styles.label, following ? t.label : styles.labelPrimary]}
          numberOfLines={1}
          {...textScale.dense}
        >
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
          style={[styles.button, styles.iconButton, t.quiet]}
        >
          <Ionicons name="notifications-outline" size={18} color={t.iconColor} />
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
          style={[styles.button, t.quiet]}
        >
          <Ionicons name={action.icon} size={16} color={t.iconColor} />
          <Text style={[styles.label, t.label]} numberOfLines={1} {...textScale.dense}>
            {action.label}
          </Text>
        </Touchable>
      ))}
    </View>
  );
});

/** Düğme yüksekliği — 40px görsel, dokunma hedefi `Touchable` ile 44'e tamamlanır. */
const BUTTON_HEIGHT = 40;

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.sm,
  },
  button: {
    flexGrow: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.s,
    height: BUTTON_HEIGHT,
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
  },
  /* Zil METİNSİZ, kare: üç metinli düğme 360px'lik ekrana sığmıyor, şerit
     iki satıra kırılıp sahneyi uzatıyordu. Zil evrensel bir simgedir;
     ekran okuyucu "Bildirim ayarları" okur. */
  iconButton: {
    flexGrow: 0,
    width: BUTTON_HEIGHT,
    paddingHorizontal: 0,
  },
  primary: {
    backgroundColor: colors.brand,
  },
  label: {
    ...type.label,
    fontFamily: fonts.semibold,
  },
  labelPrimary: { color: colors.textOnBrand },
});

/* Sahne (grafit) üstü: cam dolgu + ince açık kenar. */
const inkStyles = StyleSheet.create({
  quiet: {
    backgroundColor: colors.inkPill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.inkPillBorder,
  },
  label: { color: colors.onDark },
});

/* Kâğıt üstü: beyaz kart düğmesi + kenarlık. */
const paperStyles = StyleSheet.create({
  quiet: {
    backgroundColor: colors.surface1,
    borderWidth: 1,
    borderColor: colors.border,
  },
  label: { color: colors.textPrimary },
});

const onInk = {
  quiet: inkStyles.quiet,
  label: inkStyles.label,
  iconColor: colors.onDark,
  accentColor: colors.brandOnDark,
};

const onPaper = {
  quiet: paperStyles.quiet,
  label: paperStyles.label,
  iconColor: colors.textSecondary,
  accentColor: colors.brand,
};
