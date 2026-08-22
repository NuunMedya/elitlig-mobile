/**
 * Chip / ChipGroup — filtre çipleri (§4.5).
 *
 * Maç listesinde gün ve "takımım" filtresi, oyuncularda mevki, puan
 * durumunda favoriler, ScopeBar'da şehir/lig/sezon hep bu çiptir.
 *
 * SEÇİM DİLİ: seçili çip MOR DOLGU + beyaz metindir; seçili değilse yalnız
 * `surface2` zemin ve hairline kenarlık taşır. Mor burada geniş yüzey
 * doldurmaz (§1.0), 26–32px'lik bir hapta aksan olarak kalır. `tone="live"`
 * gibi anlamlı bir ton verildiğinde seçili hâl morun yerine o tonun sönük
 * dolgusunu alır — "canlı" filtresi kırmızı okunmalıdır, mor değil.
 *
 * ChipGroup yatay kaydırmalıdır; KAYDIRMA HAPTİK ÜRETMEZ (§5.3), yalnız çip
 * SEÇİMİ titrer.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useMemo } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { colors, hairline, layout, radius, space, textScale, touchSlop, type } from "@/theme";
import { toneColors, withAlpha, type Tone } from "./Badge";
import { Touchable } from "./Pressable";

export interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  /** Sağda × — seçili filtreyi kaldırma. */
  onDismiss?: () => void;
  /** Seçiliyken dolgu rengi kaynağı. */
  tone?: Tone;
  /** 26 / 32 yükseklik — varsayılan "md". */
  size?: "sm" | "md";
  /** Sağda sayı rozeti. */
  count?: number;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export const Chip = React.memo(function Chip({
  label,
  selected,
  onPress,
  icon,
  onDismiss,
  tone = "brand",
  size = "md",
  count,
  disabled,
  style,
  testID,
}: ChipProps) {
  const height = size === "sm" ? 26 : 32;

  const { boxStyle, fg } = useMemo(() => {
    if (disabled) {
      return {
        boxStyle: { backgroundColor: colors.surface2, borderColor: colors.border } as ViewStyle,
        fg: colors.textDisabled,
      };
    }
    if (!selected) {
      return {
        boxStyle: { backgroundColor: colors.surface2, borderColor: colors.border } as ViewStyle,
        fg: colors.textSecondary,
      };
    }
    /* SEÇİLİ FİLTRE MERCAN DEĞİL KOYU BLOKTUR.
       Mercan AKSİYON rengidir: dokununca bir şey OLAN öğeler için. Bir filtre
       chip'i ise bir DURUM bildirir. Seçili her filtreyi mercanla doldurmak,
       bir lig şeridinde mercanı ekranın onda birine yayıyor ve gerçek aksiyon
       (birincil buton) kalabalıkta kayboluyordu. Koyu blok seçimi en yüksek
       kontrastla söyler ve mercanı asıl işine bırakır.

       Anlamlı tonlar (canlı, kazanç, uyarı…) sönük dolgu + kendi renginde
       metin alır — orada anlam RENKTEN okunur. */
    if (tone === "brand" || tone === "neutral") {
      return {
        boxStyle: { backgroundColor: colors.inverse, borderColor: "transparent" } as ViewStyle,
        fg: colors.onInverse,
      };
    }
    const t = toneColors(tone);
    return {
      boxStyle: { backgroundColor: t.dim, borderColor: withAlpha(t.fg, 0.4) } as ViewStyle,
      fg: t.fg,
    };
  }, [disabled, selected, tone]);

  return (
    <Touchable
      feedback="chip"
      haptic={selected ? "none" : "selection"}
      onPress={onPress}
      disabled={disabled || !onPress}
      hitSlop={touchSlop(height)}
      accessibilityRole="button"
      accessibilityLabel={count == null ? label : `${label}, ${count}`}
      accessibilityState={{ selected: Boolean(selected), disabled: Boolean(disabled) }}
      testID={testID}
      style={[
        styles.chip,
        { height, paddingHorizontal: size === "sm" ? space.m : space.md },
        boxStyle,
        style,
      ]}
    >
      {icon ? <Ionicons name={icon} size={size === "sm" ? 12 : 14} color={fg} /> : null}

      <Text
        style={[size === "sm" ? styles.labelSm : styles.label, { color: fg }]}
        numberOfLines={1}
        {...textScale.dense}
      >
        {label}
      </Text>

      {count != null ? (
        <Text style={[styles.count, { color: fg }]} numberOfLines={1} {...textScale.badge}>
          {count > 99 ? "99+" : count}
        </Text>
      ) : null}

      {onDismiss ? (
        <Touchable
          feedback="icon"
          haptic="light"
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel={`${label} filtresini kaldır`}
        >
          <Ionicons name="close" size={size === "sm" ? 12 : 14} color={fg} />
        </Touchable>
      ) : null}
    </Touchable>
  );
});

export interface ChipGroupProps {
  children: React.ReactNode;
  /** varsayılan true → yatay ScrollView */
  scrollable?: boolean;
  /** varsayılan 6 */
  gap?: number;
  /** varsayılan layout.screenPadding */
  contentPadding?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export const ChipGroup = React.memo(function ChipGroup({
  children,
  scrollable = true,
  gap = space.s,
  contentPadding = layout.screenPadding,
  style,
  testID,
}: ChipGroupProps) {
  const content: ViewStyle = {
    gap,
    paddingHorizontal: contentPadding,
    alignItems: "center",
  };

  if (!scrollable) {
    return (
      <View style={[styles.wrap, content, style]} testID={testID}>
        {children}
      </View>
    );
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={content}
      style={[styles.scroll, style]}
      testID={testID}
    >
      {children}
    </ScrollView>
  );
});

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.xs,
    borderRadius: radius.pill,
    borderWidth: hairline,
  },
  label: {
    ...type.label,
  },
  labelSm: {
    ...type.caption,
  },
  count: {
    ...type.micro,
    opacity: 0.85,
  },
  scroll: {
    flexGrow: 0,
  },
  wrap: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
});
