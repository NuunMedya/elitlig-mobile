/**
 * KeyValueRow — "etiket ↔ değer" satırı (§4.25).
 *
 * Maç bilgisi (saha, hakem, tarih), takım künyesi, sözleşme kalemleri ve
 * ayarlardaki sürüm/kullanıcı satırları hep bu bileşendir.
 *
 * NEDEN NOKTA DOLGUSU YOK: etiketle değer arasını noktayla doldurmak (·····)
 * eski masaüstü tablolarının alışkanlığıdır; mobilde satırı gürültüyle
 * doldurur. Temiz boşluk, göz için daha hızlı bir hizadır.
 *
 * `numeric` verildiğinde değer tabular rakamlarla yazılır: alt alta gelen para
 * ve tarih değerleri sütun gibi hizalanır.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useCallback } from "react";
import {
  Alert,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { colors, hairline, haptics, layout, radius, space, textScale, touchSlop, type } from "@/theme";
import { toneColors, type Tone } from "./Badge";
import { Touchable } from "./Pressable";

export interface KeyValueRowProps {
  label: string;
  value: string | number | React.ReactNode;
  /** Değerin rengi. */
  tone?: Tone;
  /** Etiketin yanında bilgi ikonu — basınca açıklama. */
  info?: { title: string; body: string };
  /**
   * Açıklamayı özel bir yüzeyde (BottomSheet) göstermek için. Verilmezse
   * platformun kendi uyarısı kullanılır — bileşen kütüphanesi tek başına
   * çalışsın diye sheet'e bağımlılık kurulmaz.
   */
  onInfoPress?: (info: { title: string; body: string }) => void;
  /** Uzun basınca kopyalama isteği. */
  copyable?: boolean;
  /**
   * Kopyalama gerçekleştiricisi. Projede pano paketi (expo-clipboard) KURULU
   * DEĞİL; kopyalama işini ekran üstlenir, satır yalnızca isteği iletir.
   */
  onCopy?: (text: string) => void;
  position?: "single" | "first" | "middle" | "last";
  /** Değer monospace/tabular (para, tarih, ID). */
  numeric?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export const KeyValueRow = React.memo(function KeyValueRow({
  label,
  value,
  tone,
  info,
  onInfoPress,
  copyable,
  onCopy,
  position = "single",
  numeric,
  style,
  testID,
}: KeyValueRowProps) {
  const isText = typeof value === "string" || typeof value === "number";
  const valueColor = tone && tone !== "neutral" ? toneColors(tone).fg : colors.textPrimary;
  const showDivider = position === "first" || position === "middle";

  const handleInfo = useCallback(() => {
    if (!info) return;
    if (onInfoPress) onInfoPress(info);
    else Alert.alert(info.title, info.body);
  }, [info, onInfoPress]);

  const handleLongPress = useCallback(() => {
    if (!copyable || !isText) return;
    haptics.light();
    onCopy?.(String(value));
  }, [copyable, isText, onCopy, value]);

  const body = (
    <>
      <View style={styles.labelBox}>
        <Text style={styles.label} numberOfLines={1} {...textScale.dense}>
          {label}
        </Text>
        {info ? (
          <Touchable
            feedback="icon"
            haptic="none"
            onPress={handleInfo}
            hitSlop={touchSlop(14)}
            accessibilityRole="button"
            accessibilityLabel={`${label} hakkında bilgi`}
          >
            <Ionicons name="information-circle-outline" size={14} color={colors.textTertiary} />
          </Touchable>
        ) : null}
      </View>

      {isText ? (
        <Text
          style={[styles.value, numeric ? styles.valueNumeric : null, { color: valueColor }]}
          numberOfLines={1}
          {...textScale.dense}
        >
          {value}
        </Text>
      ) : (
        <View style={styles.valueNode}>{value}</View>
      )}

      {showDivider ? <View pointerEvents="none" style={styles.divider} /> : null}
    </>
  );

  const containerStyle: StyleProp<ViewStyle> = [
    styles.row,
    position === "single" ? styles.single : null,
    position === "first" ? styles.first : null,
    position === "last" ? styles.last : null,
    style,
  ];

  if (copyable && isText) {
    return (
      <Touchable
        feedback="row"
        haptic="none"
        onLongPress={handleLongPress}
        delayLongPress={350}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${String(value)}`}
        accessibilityHint="Kopyalamak için basılı tutun"
        style={containerStyle}
        testID={testID}
      >
        {body}
      </Touchable>
    );
  }

  return (
    <View
      accessible
      accessibilityLabel={isText ? `${label}: ${String(value)}` : label}
      style={containerStyle}
      testID={testID}
    >
      {body}
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.md,
    height: 40,
    paddingHorizontal: layout.rowPaddingH,
    backgroundColor: colors.surface1,
  },
  single: {
    borderRadius: radius.lg,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  first: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
  },
  last: {
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
  },
  labelBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    flexShrink: 1,
  },
  label: {
    ...type.bodySm,
    color: colors.textSecondary,
    flexShrink: 1,
  },
  value: {
    ...type.bodySm,
    fontWeight: "600",
    textAlign: "right",
    flexShrink: 1,
    maxWidth: "62%",
  },
  valueNumeric: {
    fontVariant: ["tabular-nums"],
  },
  valueNode: {
    flexShrink: 0,
    alignItems: "flex-end",
  },
  divider: {
    position: "absolute",
    left: layout.rowPaddingH,
    right: 0,
    bottom: 0,
    height: hairline,
    backgroundColor: colors.separator,
  },
});
