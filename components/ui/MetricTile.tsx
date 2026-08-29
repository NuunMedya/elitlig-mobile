/**
 * MetricTile — "tek rakam + ne olduğu" kutusu, ve onları dizen MetricGrid.
 *
 * NEDEN VAR: Genel Bakış ve panel ekranlarında tekrar eden desen "büyük bir
 * sayı + üstünde küçük büyük-harf etiket"tir (kadro mevcudu, kasa, sıradaki
 * maça kalan gün, bekleyen talep). Bu desen daha önce her ekranda elle
 * kuruluyordu ve her seferinde biraz farklı çıkıyordu: kimi yerde 18px kalın,
 * kimi yerde 22px; kimi yerde etiket üstte, kimi yerde altta. Tek bileşen
 * hem bu kaymayı bitirir hem de yoğunluk kararını (yükseklik 66px) tek
 * yerde tutar.
 *
 * DÜZEN KARARI — ETİKET ÜSTTE: göz önce "ne" sonra "kaç" okur; sayı altta
 * durunca ızgaradaki bütün sayılar aynı taban çizgisine oturur ve satır
 * "tablo" gibi taranabilir hâle gelir. Etiket altta olsaydı her kutunun
 * sayısı, etiketin satır sayısına göre farklı yükseklikte dururdu.
 *
 * RENK KURALI: sayı varsayılan olarak `textPrimary`dir. `tone` verildiğinde
 * yalnız SAYI renklenir, kutunun zemini değil — dört kutunun dördü de renkli
 * zeminliyse hiçbiri öne çıkmaz. Aksan (`accent`) "bu ekranın ana rakamı"
 * demektir ve ekran başına en fazla bir kez kullanılmalıdır.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { colors, elevate, radius, space, textScale, type, upperTR } from "@/theme";
import { GradientFill } from "./GradientFill";
import { Touchable } from "./Pressable";

/** Sayının rengi. Zemin hiçbir tonda değişmez (bkz. dosya başlığı). */
export type MetricTone = "neutral" | "accent" | "brand" | "win" | "warn" | "danger" | "live";

const TONE_COLORS: Record<MetricTone, string> = {
  neutral: colors.textPrimary,
  accent: colors.accentText,
  brand: colors.brandAccent,
  win: colors.win,
  warn: colors.warn,
  danger: colors.danger,
  live: colors.live,
};

export interface MetricTileProps {
  /** Üstteki küçük büyük-harf etiket. */
  label: string;
  /** Ana değer — sayı ya da kısa metin ("3", "12.500 ₺", "—"). */
  value: string;
  /** Değerin altındaki tek satır açıklama ("son 5 maç"). */
  hint?: string;
  tone?: MetricTone;
  /** Etiketin solundaki 12px ikon. */
  icon?: keyof typeof Ionicons.glyphMap;
  /** Basılabilirse sağ altta chevron belirir. */
  onPress?: () => void;
  /** Izgara içinde eşit paylaşım için — MetricGrid bunu kendi verir. */
  flex?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export const MetricTile = React.memo(function MetricTile({
  label,
  value,
  hint,
  tone = "neutral",
  icon,
  onPress,
  flex,
  style,
  testID,
}: MetricTileProps) {
  const body = (
    <>
      <GradientFill radius="lg" />
      <View style={styles.labelRow}>
        {icon ? <Ionicons name={icon} size={15} color={colors.textTertiary} /> : null}
        <Text style={styles.label} numberOfLines={1} {...textScale.badge}>
          {upperTR(label)}
        </Text>
      </View>

      <Text
        style={[styles.value, { color: TONE_COLORS[tone] }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
        {...textScale.dense}
      >
        {value}
      </Text>

      {hint ? (
        <Text style={styles.hint} numberOfLines={1} {...textScale.dense}>
          {hint}
        </Text>
      ) : null}
    </>
  );

  const boxStyle: StyleProp<ViewStyle> = [styles.box, flex ? styles.flex : null, style];

  if (!onPress) {
    return (
      <View style={boxStyle} testID={testID} accessibilityLabel={`${label}: ${value}`}>
        {body}
      </View>
    );
  }

  return (
    <Touchable
      feedback="card"
      haptic="selection"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
      style={boxStyle}
      testID={testID}
    >
      {body}
      <Ionicons
        name="chevron-forward"
        size={16}
        color={colors.textDisabled}
        style={styles.chevron}
      />
    </Touchable>
  );
});

/**
 * MetricGrid — kutuları eşit genişlikte satırlara dizer.
 *
 * `columns` verilmezse çocuk sayısına göre seçilir: 2 çocuk → 2, 3 → 3,
 * 4 ve üstü → 2 (dört kutuyu tek satıra sıkıştırmak sayıları okunmaz kılar;
 * 2×2 ızgara aynı alanı kullanır ve rakamlar büyük kalır).
 */
export interface MetricGridProps {
  children: React.ReactNode;
  columns?: 2 | 3;
  style?: StyleProp<ViewStyle>;
}

export const MetricGrid = React.memo(function MetricGrid({
  children,
  columns,
  style,
}: MetricGridProps) {
  const items = React.Children.toArray(children).filter(Boolean);
  const cols = columns ?? (items.length === 3 ? 3 : 2);

  const rows: React.ReactNode[][] = [];
  for (let index = 0; index < items.length; index += cols) {
    rows.push(items.slice(index, index + cols));
  }

  return (
    <View style={[styles.grid, style]}>
      {rows.map((row, rowIndex) => (
        <View key={rowIndex} style={styles.gridRow}>
          {row.map((child, columnIndex) => (
            <View key={columnIndex} style={styles.flex}>
              {child}
            </View>
          ))}
          {/* Son satır eksikse boş yer tutucu: kutular sola yaslanmasın,
              genişlikleri diğer satırlarla aynı kalsın. */}
          {row.length < cols
            ? Array.from({ length: cols - row.length }, (_, index) => (
                <View key={`gap-${index}`} style={styles.flex} />
              ))
            : null}
        </View>
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  box: {
    /* `type.metric` 16 → 26px oldu (satır yüksekliği 31); 66px'lik kutuda
       rakam + etiket artık sığmıyordu. */
    minHeight: 84,
    justifyContent: "center",
    gap: 2,
    paddingHorizontal: space.m,
    paddingVertical: space.md,
    borderRadius: radius.lg,
    ...elevate(1),
  },
  flex: {
    flex: 1,
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  label: {
    ...type.overline,
    color: colors.textTertiary,
    flexShrink: 1,
  },
  value: {
    ...type.metric,
  },
  hint: {
    ...type.caption,
    color: colors.textTertiary,
  },
  chevron: {
    position: "absolute",
    top: space.sm,
    right: space.sm,
  },
  grid: {
    gap: space.sm,
  },
  gridRow: {
    flexDirection: "row",
    gap: space.sm,
  },
});
