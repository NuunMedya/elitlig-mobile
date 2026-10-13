/**
 * SÜRE BANDI — işleyen bir son tarihi (savunma, itiraz, teklif) liste
 * başında tek bakışta söyler: ne, kimin için, ne kadar kaldı, ne yapmalı.
 *
 * NEDEN AYRI BİLEŞEN: aynı uyarı üç ekranda (Cezalarım, Tekliflerim, dosya
 * detayı) düz turuncu bir paragraf olarak yazılıyordu; kalan süre cümlenin
 * ortasında kayboluyordu. Burada süre kendi satırında, rakam tipinde durur
 * ve tüm bant dokunulabilirdir.
 *
 * TON: 24 saatten az kaldıysa `danger`, yoksa `warn`.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";
import { Touchable, toneColors, withAlpha } from "@/components/ui";
import { colors, hairline, radius, space, textScale, type } from "@/theme";

/** Kalan süre — "3 gün 4 sa", "17 sa 12 dk", "42 dk"; süre dolduysa null. */
export function remainingShort(iso?: string | null): string | null {
  if (!iso) return null;
  const left = new Date(iso).getTime() - Date.now();
  if (!Number.isFinite(left) || left <= 0) return null;
  const days = Math.floor(left / 86_400_000);
  const hours = Math.floor((left % 86_400_000) / 3_600_000);
  const minutes = Math.floor((left % 3_600_000) / 60_000);
  if (days > 0) return hours ? `${days} gün ${hours} sa` : `${days} gün`;
  if (hours > 0) return `${hours} sa ${minutes} dk`;
  return `${Math.max(1, minutes)} dk`;
}

/** Son tarihe 24 saatten az mı kaldı? */
export function isUrgentDeadline(iso?: string | null): boolean {
  if (!iso) return false;
  const left = new Date(iso).getTime() - Date.now();
  return left > 0 && left <= 86_400_000;
}

export interface DeadlineBannerProps {
  /** "Savunma süresi işliyor" */
  title: string;
  /** "Yıldızspor – Batıkent · Mert Yılmaz" */
  detail?: string | null;
  deadline: string | null;
  onPress?: () => void;
  /** Bandın sağındaki eylem metni ("Yanıtla"). */
  actionLabel?: string;
  style?: StyleProp<ViewStyle>;
}

export const DeadlineBanner = React.memo(function DeadlineBanner({
  title,
  detail,
  deadline,
  onPress,
  actionLabel = "Aç",
  style,
}: DeadlineBannerProps) {
  const left = remainingShort(deadline);
  if (!left) return null;
  const palette = toneColors(isUrgentDeadline(deadline) ? "danger" : "warn");

  const body = (
    <>
      <View style={[styles.pip, { backgroundColor: withAlpha(palette.fg, 0.14) }]}>
        <Ionicons name="time" size={18} color={palette.fg} />
      </View>
      <View style={styles.texts}>
        <Text style={[styles.title, { color: palette.fg }]} numberOfLines={1} {...textScale.dense}>
          {title}
        </Text>
        {detail ? (
          <Text style={styles.detail} numberOfLines={1} {...textScale.dense}>
            {detail}
          </Text>
        ) : null}
      </View>
      <View style={styles.right}>
        <Text style={[styles.left, { color: palette.fg }]} numberOfLines={1} {...textScale.badge}>
          {left}
        </Text>
        <Text style={styles.leftLabel} {...textScale.badge}>
          KALDI
        </Text>
      </View>
      {onPress ? <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} /> : null}
    </>
  );

  const boxStyle = [
    styles.box,
    { backgroundColor: palette.dim, borderColor: withAlpha(palette.fg, 0.3) },
    style,
  ];

  if (!onPress) return <View style={boxStyle}>{body}</View>;
  return (
    <Touchable
      feedback="card"
      haptic="selection"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${detail ?? ""}. ${left} kaldı. ${actionLabel}`}
      style={boxStyle}
    >
      {body}
    </Touchable>
  );
});

const styles = StyleSheet.create({
  box: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: hairline,
  },
  pip: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  texts: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  title: {
    ...type.label,
  },
  detail: {
    ...type.caption,
    color: colors.textSecondary,
  },
  right: {
    alignItems: "flex-end",
  },
  left: {
    ...type.tableNumStrong,
  },
  leftLabel: {
    ...type.overline,
    color: colors.textTertiary,
  },
});
