/**
 * Button — birincil ve ikincil eylem düğmesi.
 *
 * VARYANT FELSEFESİ:
 *  - `primary` mercan dolgudur ve bir ekranda TEK TANE bulunur. Dolgu düz renk
 *    değil `gradientBrand` iki durağıdır: düz mercan geniş bir dikdörtgende
 *    matlaşıp "boyanmış kutu" gibi görünüyordu; iki durak yüzeye hafif bir
 *    ışık verip düğmeyi kabartıyor. Metni `textOnBrand` (mürekkep) — mercan
 *    üstünde beyaz metin AA'yı geçmez.
 *  - `danger` DOLU KIRMIZI DEĞİLDİR: sönük zemin + kırmızı metin. Yıkıcı eylem
 *    sessiz görünür; asıl uyarıyı onay sheet'i verir.
 *
 * ÖLÇÜ: 30 / 36 / 42. Üçü de 44px'in altındadır ve `touchSlop` ile 44px'lik
 * dokunma alanına tamamlanır (bkz. `hitSlop`). 11–12px etiketin etrafında
 * 46px'lik bir kutu, düğmeyi metninden bağımsız bir blok gibi gösteriyordu.
 *
 * BASMA: hepsi opaklıkla söner (gradyan dolgu zemin değişimini gizlerdi).
 * `loading` sırasında GENİŞLİK KORUNUR — etiket görünmez olur ve göstergesi
 * üstüne biner; düğmenin zıplaması yerleşimi bozar.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import {
  colors,
  elevate,
  hairline,
  radius,
  space,
  textScale,
  touchSlop,
  type,
} from "@/theme";
import { Touchable, type HapticKind } from "./Pressable";

/**
 * Dolgunun ışık yönü — YATAY, SAĞDAN SOLA.
 *
 * Köşegendi (0,0 → 1,1); hap biçimli bir butonda köşegen geçiş yüzeyi
 * silindire çeviriyor, yani "boru" görünümü veriyordu. Uygulamadaki her
 * gradyan aynı eksende ışır (bkz. `GradientFill`).
 */
const GRADIENT_START = { x: 1, y: 0.5 } as const;
const GRADIENT_END = { x: 0, y: 0.5 } as const;

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  /** 30 / 36 / 42 — varsayılan "md". */
  size?: "sm" | "md" | "lg";
  icon?: keyof typeof Ionicons.glyphMap;
  iconPosition?: "left" | "right";
  /** Metin yerine ActivityIndicator; genişlik korunur. */
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  /**
   * Mürekkep blok üstünde mi. `secondary` cam bir pula, `ghost` beyaz metne
   * döner; `primary` ve `danger` iki zeminde de aynıdır.
   */
  onDark?: boolean;
  /** Varsayılan: primary → "medium", diğerleri → "light". */
  haptic?: "none" | "light" | "medium" | "success";
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
}

/*
 * ÖLÇÜ TİPOGRAFİYLE BİRLİKTE BÜYÜDÜ (30/36/42 → 38/44/52).
 *
 * Eski ölçüler 11px etiket için hesaplanmıştı; etiket 13px'e çıkınca 30px'lik
 * bir düğmede metnin üstünde ve altında 8px'ten az yer kalıyor ve düğme
 * "metne yapışmış bir şerit" gibi duruyordu. Yeni ölçülerde `lg` (52px) ve
 * `md` (44px) erişilebilirlik tabanı olan 44px'i KENDİ BAŞINA karşılıyor —
 * eskiden yalnız `hitSlop` ile tamamlanıyordu; birincil eylemin dokunma
 * alanının görünür alanıyla aynı olması, düğmenin sağlam hissettiren şeydir.
 */
const HEIGHTS = { sm: 38, md: 44, lg: 52 } as const;

export const Button = React.memo(function Button({
  label,
  onPress,
  variant = "primary",
  size = "md",
  icon,
  iconPosition = "left",
  loading,
  disabled,
  fullWidth,
  onDark = false,
  haptic,
  style,
  accessibilityLabel,
  accessibilityHint,
  testID,
}: ButtonProps) {
  const height = HEIGHTS[size];
  const isDisabled = Boolean(disabled || loading);

  const boxStyle: ViewStyle =
    variant === "primary"
      ? // Gradyan yüklenemezse (web/eski cihaz) düz mercan zemin altta durur.
        // SIRA ÖNEMLİ: `elevate` kendi zeminini taşır, mercan ondan SONRA gelmeli.
        { ...elevate(1), borderWidth: 0, backgroundColor: colors.brand }
      : variant === "secondary"
        ? onDark
          // Cam pul: mürekkep bloğun üstünde beyazın %22'si + tebeşir çerçeve.
          ? { backgroundColor: colors.chalk, borderWidth: 1, borderColor: colors.chalk }
          : { backgroundColor: colors.surface2, borderWidth: hairline, borderColor: colors.border }
        : variant === "danger"
          ? { backgroundColor: colors.dangerDim }
          : { backgroundColor: "transparent" };

  const fg =
    variant === "primary"
      ? colors.textOnBrand
      : variant === "danger"
        ? colors.danger
        : onDark
          ? colors.onDark
          : variant === "ghost"
            ? colors.brandAccent
            : colors.textPrimary;

  const labelStyle: StyleProp<TextStyle> = [
    size === "lg" ? styles.labelLg : size === "sm" ? styles.labelSm : styles.labelMd,
    { color: fg },
    loading ? styles.labelHidden : null,
  ];

  const iconNode = icon ? (
    <Ionicons
      name={icon}
      size={size === "lg" ? 16 : 14}
      color={fg}
      style={loading ? styles.labelHidden : null}
    />
  ) : null;

  const effectiveHaptic: HapticKind = haptic ?? (variant === "primary" ? "medium" : "light");

  return (
    <Touchable
      feedback="button"
      haptic={isDisabled ? "none" : effectiveHaptic}
      onPress={onPress}
      disabled={isDisabled}
      hitSlop={height < 44 ? touchSlop(height) : undefined}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: isDisabled, busy: Boolean(loading) }}
      testID={testID}
      style={[
        styles.base,
        {
          height,
          paddingHorizontal: size === "sm" ? space.md : size === "lg" ? space.lg : space.md,
        },
        boxStyle,
        fullWidth ? styles.fullWidth : null,
        disabled ? styles.disabled : null,
        style,
      ]}
    >
      {variant === "primary" ? (
        /*
         * TEK KATMAN. Gradyanın üstüne bir de "üst ışık" (üst yarıya serilen
         * %10 beyaz) konmuştu; kubbe hissi vermesi bekleniyordu ama keskin
         * kenarlı bir katman düğmeyi tam ortasından ikiye bölen yatay bir
         * DİKİŞ olarak görünüyordu — üst yarı açık, alt yarı koyu iki ayrı
         * mor. Işık yalnız gradyandan gelir; başka dolgu yok.
         */
        <LinearGradient
          colors={colors.gradientBrand}
          start={GRADIENT_START}
          end={GRADIENT_END}
          style={styles.primaryFill}
          pointerEvents="none"
        />
      ) : null}

      {iconPosition === "left" ? iconNode : null}
      <Text style={labelStyle} numberOfLines={1} {...textScale.dense}>
        {label}
      </Text>
      {iconPosition === "right" ? iconNode : null}

      {loading ? (
        <View pointerEvents="none" style={styles.loadingLayer}>
          <ActivityIndicator size="small" color={fg} />
        </View>
      ) : null}
    </Touchable>
  );
});

const styles = StyleSheet.create({
  base: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.s,
    // KÖŞE 12px, HAP DEĞİL: tam yuvarlak düğme, keskinleşen köşe ölçeğinde
    // (kart 14) ekrandaki en oval nesne olarak kalıyor ve kullanıcının "fazla
    // oval" dediği şeyin ta kendisiydi. Kart içi köşe (radius.md) düğmeyi
    // kartın diliyle aynı aileye sokar.
    borderRadius: radius.md,
    alignSelf: "flex-start",
  },
  fullWidth: {
    alignSelf: "stretch",
    width: "100%",
  },
  /** Gradyan dolgu — içeriğin ALTINDA, köşeleri kutuyla aynı. */
  primaryFill: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: radius.pill,
  },
  disabled: {
    opacity: 0.45,
  },
  /* Düğme etiketleri tek ailede (Inter SemiBold) kalır: Archivo rakam ailesidir,
     düğme metninde kullanılınca arayüz iki sesle konuşmuş oluyordu. */
  labelSm: {
    ...type.label,
  },
  labelMd: {
    ...type.h4,
  },
  labelLg: {
    ...type.h3,
  },
  /** Yükleniyorken etiket görünmez olur ama YERİNİ KORUR. */
  labelHidden: {
    opacity: 0,
  },
  loadingLayer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
});
