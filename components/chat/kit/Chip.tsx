/**
 * SOHBET KOPYASI — kaynağı `components/ui/Chip.tsx`.
 *
 * Mesajlar bölümü WhatsApp renk sistemini kullanır; ortak bileşen ise rengini
 * tema paletinden (mor) alır ve API'si değiştirilemez. Bu dosya kaynağın
 * BİREBİR kopyasıdır; tek fark `colors` / `elevate`in `@/lib/chatPalette`ten
 * gelmesidir. Kaynakta davranış değişirse buraya da taşınmalıdır.
 *
 * BİLİNÇLİ FARK: çip WhatsApp süzgeç hapı gibi çizilir — seçili değilken gri
 * dolgu (çerçevesiz), seçiliyken açık yeşil dolgu + koyu yeşil metin.
 */

/**
 * Chip / ChipGroup — filtre çipleri (§4.5).
 *
 * Maç listesinde gün ve "takımım" filtresi, oyuncularda mevki, puan
 * durumunda favoriler, lig seçicinin sabitlenmiş lig çipleri hep bu çiptir.
 *
 * SEÇİM DİLİ (Arena): seçili çip DÜZ marka dolgusu + beyaz metindir;
 * seçili değilse beyaz kâğıt hap + hairline kenarlık. Gri kâğıt zeminde beyaz
 * hap net ayrışır, seçilen tek hap ise ekranda "şu an bu" diyen tek renktir.
 * `tone="live"` gibi anlamlı bir ton verildiğinde seçili hâl morun yerine o
 * tonun sönük dolgusunu alır — "canlı" filtresi kırmızı okunmalıdır, mor değil.
 *
 * SAHNE ÜSTÜNDE (HeaderToneContext "ink"): seçili olmayan çip cam pula
 * (`inkPill`) döner; beyaz kâğıt hap grafit blokta delik gibi duruyordu.
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
import { fonts, hairline, layout, radius, space, textScale, touchSlop, type } from "@/theme";
import { colors, wa } from "@/lib/chatPalette";
import { toneColors, withAlpha, type Tone } from "./tones";
import { useHeaderTone } from "@/components/ui/HeaderTone";
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
  const height = size === "sm" ? 28 : 32;
  const surface = useHeaderTone("paper");
  const onInk = surface === "ink";

  const { boxStyle, fg } = useMemo<{ boxStyle: ViewStyle; fg: string }>(() => {
    /* Seçili + pasif çip "şu anki değer" demektir (ör. mevcut öncelik): seçili
       görünür, sönmez. Pasiflik yalnız seçili olmayan çipi gri yapar. */
    if (!selected) {
      return {
        boxStyle: onInk
          ? { backgroundColor: colors.inkPill, borderColor: colors.inkPillBorder }
          : { backgroundColor: wa.chip, borderColor: wa.chip },
        fg: disabled
          ? onInk
            ? colors.onDarkMuted
            : colors.textDisabled
          : onInk
            ? colors.onDark
            : wa.chipText,
      };
    }
    /* Seçili: marka (ve nötr) DÜZ dolgu; anlamlı tonlar sönük dolgu + kendi
       renginde metin — orada anlam RENKTEN okunur. */
    if (tone === "brand" || tone === "neutral") {
      return {
        boxStyle: { backgroundColor: wa.chipSelected, borderColor: wa.chipSelected },
        fg: wa.chipSelectedText,
      };
    }
    const t = toneColors(tone);
    return {
      boxStyle: { backgroundColor: t.dim, borderColor: withAlpha(t.fg, 0.35) },
      fg: t.fg,
    };
  }, [disabled, onInk, selected, tone]);

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
        { height, paddingHorizontal: size === "sm" ? space.m : space.md + space.xxs },
        boxStyle,
        disabled && !selected ? styles.disabled : null,
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
    fontFamily: fonts.semibold,
  },
  disabled: {
    opacity: 0.5,
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
