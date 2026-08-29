/**
 * Badge — sayı, durum ve kısa etiket rozeti (§4.8).
 *
 * NEDEN BURADA: `Tone` tipi ve ton→renk çözümlemesi bu dosyada yaşar, çünkü
 * rozet API'si baştan sona ton üstüne kuruludur. ListRow, Chip ve KeyValueRow
 * aynı sözlüğü buradan içe aktarır; ton tablosunun tek kopyası olsun diye
 * ayrı bir types dosyası açılmadı.
 *
 * KURAL: rozet metni ASLA ölçeklenmez (`textScale.badge`) — 16/20 px'lik
 * kutuya sığması gerekir, kullanıcı yazı tipini büyüttüğünde taşar. 99'dan
 * büyük sayılar "99+" olur; menüde "127 bildirim" satırı bozmaz.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useMemo } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { colors, radius, space, textScale, type } from "@/theme";

/** Anlamsal renk tonu — tüm ui bileşenlerinin ortak sözlüğü (§4.3). */
export type Tone = "neutral" | "brand" | "live" | "win" | "warn" | "danger" | "info";

export interface ToneColors {
  /** Metin/ikon rengi (soft ve outline varyantlarında). */
  fg: string;
  /** Sönük dolgu — soft varyantın zemini. */
  dim: string;
  /** Dolu varyantın zemini. */
  solidBg: string;
  /** Dolu varyantın metni. */
  solidFg: string;
}

const TONES: Record<Tone, ToneColors> = {
  neutral: {
    fg: colors.textSecondary,
    dim: colors.surface3,
    solidBg: colors.draw,
    solidFg: colors.textOnStatus,
  },
  brand: {
    fg: colors.brandAccent,
    dim: colors.brandDim,
    solidBg: colors.brand,
    solidFg: colors.textOnBrand,
  },
  live: { fg: colors.live, dim: colors.liveDim, solidBg: colors.live, solidFg: colors.textOnStatus },
  win: { fg: colors.win, dim: colors.winDim, solidBg: colors.win, solidFg: colors.textOnStatus },
  warn: { fg: colors.warn, dim: colors.warnDim, solidBg: colors.warn, solidFg: colors.textOnStatus },
  danger: {
    fg: colors.danger,
    dim: colors.dangerDim,
    solidBg: colors.danger,
    solidFg: colors.textOnStatus,
  },
  info: { fg: colors.info, dim: colors.infoDim, solidBg: colors.info, solidFg: colors.textOnStatus },
};

/** Ton adından renk üçlüsünü verir. */
export function toneColors(tone: Tone = "neutral"): ToneColors {
  return TONES[tone];
}

/**
 * Hex renge alfa ekler (#RRGGBB → #RRGGBBAA). Palet renkleri katı hex olduğu
 * için "canlı kenarlığı %40" gibi kuralları hex'i bozmadan uygulamanın tek
 * yolu budur; rgba() string'i üretmek paletteki değeri parçalamayı gerektirir.
 * Zaten alfalı (rgba/8 haneli) bir değer gelirse dokunulmaz.
 */
export function withAlpha(color: string, opacity: number): string {
  if (!color.startsWith("#") || color.length !== 7) return color;
  const clamped = Math.max(0, Math.min(1, opacity));
  const alpha = Math.round(clamped * 255)
    .toString(16)
    .padStart(2, "0");
  return `${color}${alpha}`;
}

export interface BadgeProps {
  label?: string | number;
  tone?: Tone | "neutralSolid";
  /** varsayılan "soft" */
  variant?: "soft" | "solid" | "outline";
  /** 16 / 20 yükseklik — varsayılan "sm" */
  size?: "xs" | "sm";
  icon?: keyof typeof Ionicons.glyphMap;
  /** label yoksa 8px nokta rozeti */
  dot?: boolean;
  /** Sekme/ikon üstü konumlandırma */
  floating?: boolean;
  style?: StyleProp<ViewStyle>;
  /** Ekran okuyucu metni — verilmezse etiketin kendisi okunur. */
  accessibilityLabel?: string;
}

/** 99 üstü sayılar rozete sığmaz; SofaScore/Maçkolik kuralı: "99+". */
function formatLabel(label: string | number): string {
  if (typeof label === "number") return label > 99 ? "99+" : String(label);
  return label;
}

export const Badge = React.memo(function Badge({
  label,
  tone = "neutral",
  variant = "soft",
  size = "sm",
  icon,
  dot,
  floating,
  style,
  accessibilityLabel,
}: BadgeProps) {
  const solidNeutral = tone === "neutralSolid";
  const t = toneColors(solidNeutral ? "neutral" : tone);
  const effectiveVariant = solidNeutral ? "solid" : variant;

  const text = label == null ? null : formatLabel(label);
  const numeric = typeof label === "number";

  const boxStyle = useMemo<ViewStyle>(() => {
    if (effectiveVariant === "solid") return { backgroundColor: t.solidBg };
    if (effectiveVariant === "outline") {
      return { backgroundColor: "transparent", borderWidth: 1, borderColor: t.fg };
    }
    return { backgroundColor: t.dim };
  }, [effectiveVariant, t]);

  const fg = effectiveVariant === "solid" ? t.solidFg : t.fg;

  if (dot && text == null) {
    return (
      <View
        accessible={false}
        importantForAccessibility="no"
        style={[
          styles.dot,
          { backgroundColor: effectiveVariant === "outline" ? "transparent" : t.solidBg },
          effectiveVariant === "outline" ? { borderWidth: 1, borderColor: t.fg } : null,
          floating ? styles.floatingDot : null,
          style,
        ]}
      />
    );
  }

  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={accessibilityLabel ?? (text ?? undefined)}
      style={[
        styles.box,
        size === "xs" ? styles.boxXs : styles.boxSm,
        numeric ? styles.pill : null,
        boxStyle,
        floating ? styles.floating : null,
        style,
      ]}
    >
      {icon ? <Ionicons name={icon} size={size === "xs" ? 8 : 10} color={fg} /> : null}
      {text != null ? (
        <Text style={[styles.label, { color: fg }]} numberOfLines={1} {...textScale.badge}>
          {text}
        </Text>
      ) : null}
    </View>
  );
});

/** Nokta rozetinin çapı — yarıçapı bundan TÜRER, elle yazılmaz. */
const DOT = 9;

const styles = StyleSheet.create({
  box: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    borderRadius: radius.xs,
    paddingHorizontal: space.s,
  },
  /* YÜKSEKLİK METNİN SATIR YÜKSEKLİĞİNDEN TÜRER. `type.micro` bu sürümde
     8 → 10px oldu (satır yüksekliği 13); 14px'lik kutu o metni kırpıyordu.
     Kutu = satır yüksekliği + 2×dikey nefes. */
  boxXs: {
    height: 18,
    minWidth: 18,
    paddingHorizontal: space.xs,
  },
  boxSm: {
    height: 22,
    minWidth: 22,
  },
  /** Sayısal rozetler hap biçimindedir — "99+" da aynı yüksekliği korur. */
  pill: {
    borderRadius: radius.pill,
  },
  label: {
    ...type.micro,
  },
  dot: {
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
  },
  floating: {
    position: "absolute",
    top: -6,
    right: -10,
  },
  floatingDot: {
    position: "absolute",
    top: -2,
    right: -4,
  },
});
