/**
 * Maç sayfasının kâğıt yapı taşları — sekmelerin ortak dili.
 *
 * NEDEN YEREL: bunlar `components/ui`deki genel bileşenlerin maç sayfasına
 * özgü bileşimleridir (bir kart, bir künye satırı, bir takım cetveli). Genel
 * kitaplığa girecek kadar genel değiller; ama beş sekmede aynı görünmeleri
 * gerekiyor, bu yüzden tek yerde dururlar.
 *
 * KART KURALI (Arena §1.3): kart, birbirine ait satırları bir arada tutmak
 * içindir. Bölüm başlığı kartın DIŞINDA, kâğıtta durur; kartın içinde ikinci
 * bir başlık dili kurulmaz. İç içe kart yoktur.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React, { memo } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { TeamLogo, Touchable } from "@/components/ui";
import { colors, elevate, fonts, hairline, layout, radius, space, textScale, type } from "@/theme";

/** Kâğıt kart — beyaz dolgu, saç teli kenar, çok hafif gölge. */
export const PaperCard = memo(function PaperCard({
  children,
  style,
  padded = false,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** İçerik kendi dolgusunu taşımıyorsa kart 14px iç boşluk verir. */
  padded?: boolean;
}) {
  return <View style={[styles.card, padded ? styles.cardPadded : null, style]}>{children}</View>;
});

/**
 * Künye satırı — ikon · etiket · değer. Kartın içinde alt alta dizilir;
 * aradaki saç teli satırın kendisindedir (ilk satır hariç).
 */
export const InfoRow = memo(function InfoRow({
  icon,
  label,
  value,
  first = false,
  onPress,
  accessory,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  first?: boolean;
  onPress?: () => void;
  /** Değerin yerine (ya da yanına) çizilecek öğe — ör. YouTube işareti. */
  accessory?: React.ReactNode;
}) {
  const body = (
    <>
      <View style={styles.infoIcon}>
        <Ionicons name={icon} size={16} color={colors.textTertiary} />
      </View>
      <Text style={styles.infoLabel} numberOfLines={1} {...textScale.dense}>
        {label}
      </Text>
      {value ? (
        <Text style={styles.infoValue} numberOfLines={2} {...textScale.dense}>
          {value}
        </Text>
      ) : null}
      {accessory}
      {onPress ? <Ionicons name="chevron-forward" size={15} color={colors.textTertiary} /> : null}
    </>
  );

  if (onPress) {
    return (
      <Touchable
        feedback="row"
        haptic="selection"
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={value ? `${label}: ${value}` : label}
        style={[styles.infoRow, first ? null : styles.infoRowRuled]}
      >
        {body}
      </Touchable>
    );
  }
  return (
    <View
      style={[styles.infoRow, first ? null : styles.infoRowRuled]}
      accessible
      accessibilityLabel={value ? `${label}: ${value}` : label}
    >
      {body}
    </View>
  );
});

/**
 * TAKIM CETVELİ — iki taraflı karşılaştırmaların başlığı.
 *
 * Barlar ve sayılar iki renkle çizilir ama hangi rengin hangi takım olduğu
 * bir yerde yazmalıdır; okuyucu "soldaki ev sahibidir" varsayımını kendisi
 * kurmak zorunda kalmamalı. Cetvel bunu bir kez söyler: arma · ad · renk
 * noktası, solda ev sahibi, sağda deplasman.
 */
export const TeamLegend = memo(function TeamLegend({
  homeName,
  awayName,
  homeLogo,
  awayLogo,
  center,
}: {
  homeName: string;
  awayName: string;
  homeLogo: string | null;
  awayLogo: string | null;
  /** Ortaya konacak öğe (ör. karşılaşma sayısı). */
  center?: React.ReactNode;
}) {
  return (
    <View style={styles.legend}>
      <View style={styles.legendSide}>
        <TeamLogo name={homeName} logo={homeLogo} size={layout.crestMd} />
        <View style={styles.legendTexts}>
          <Text style={styles.legendName} numberOfLines={1} {...textScale.dense}>
            {homeName}
          </Text>
          <View style={[styles.legendKey, styles.legendKeyHome]} />
        </View>
      </View>
      {center ? <View style={styles.legendCenter}>{center}</View> : null}
      <View style={[styles.legendSide, styles.legendSideAway]}>
        <View style={[styles.legendTexts, styles.legendTextsAway]}>
          <Text style={[styles.legendName, styles.alignRight]} numberOfLines={1} {...textScale.dense}>
            {awayName}
          </Text>
          <View style={[styles.legendKey, styles.legendKeyAway]} />
        </View>
        <TeamLogo name={awayName} logo={awayLogo} size={layout.crestMd} />
      </View>
    </View>
  );
});

/** Sekme içeriğinin tepesindeki kısa açıklama satırı (gri, tek cümle). */
export const Hint = memo(function Hint({ children }: { children: string }) {
  return (
    <Text style={styles.hint} {...textScale.dense}>
      {children}
    </Text>
  );
});

const styles = StyleSheet.create({
  card: {
    ...elevate(1),
    marginHorizontal: layout.screenPadding,
    borderRadius: radius.xl,
    overflow: "hidden",
  },
  cardPadded: {
    padding: space.lg,
  },

  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.m,
    minHeight: layout.listRowHeight,
    paddingHorizontal: space.lg,
    paddingVertical: space.m,
  },
  infoRowRuled: {
    borderTopWidth: hairline,
    borderTopColor: colors.separator,
  },
  infoIcon: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    backgroundColor: colors.surface3,
    alignItems: "center",
    justifyContent: "center",
  },
  infoLabel: {
    ...type.body,
    color: colors.textSecondary,
    flexShrink: 0,
  },
  infoValue: {
    ...type.body,
    fontFamily: fonts.semibold,
    color: colors.textPrimary,
    flex: 1,
    textAlign: "right",
  },

  legend: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  legendSide: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  legendSideAway: {
    justifyContent: "flex-end",
  },
  legendTexts: {
    flexShrink: 1,
    minWidth: 0,
    gap: space.xs,
  },
  legendTextsAway: {
    alignItems: "flex-end",
  },
  legendName: {
    ...type.h4,
    color: colors.textPrimary,
  },
  legendKey: {
    width: 18,
    height: 4,
    borderRadius: radius.pill,
  },
  legendKeyHome: {
    backgroundColor: colors.accent,
  },
  legendKeyAway: {
    backgroundColor: colors.slate,
  },
  legendCenter: {
    alignItems: "center",
  },
  alignRight: {
    textAlign: "right",
  },

  hint: {
    ...type.bodySm,
    color: colors.textTertiary,
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.sm,
  },
});

/** Kartın kendi stillerini paylaşan sekmeler için (ör. FlatList satırının kart dilimleri). */
export { styles as partStyles };
