/**
 * InboxStrip — Profil'in "bekleyen işler" şeridi: Bildirimler · Mesajlar.
 *
 * NEDEN İKİ KUTU, LİSTE SATIRI DEĞİL: Arena'nın merkez kalıbı "kimlik → bekleyen
 * işler → kapılar"dır. Okunmamış bildirim ve mesaj, Profil'e girmenin en sık
 * nedenidir; menünün ortasında iki satır olarak durduklarında sayı rozeti
 * diğer satırların arasında kayboluyordu. Yan yana iki kutu, sayıyı kahraman
 * yapar (`metricSm`, Archivo) ve "her şey okundu" durumunu da açıkça söyler.
 *
 * RENK SİNYALDİR: sayı varsa kutunun ikon pulu `live` (kırmızı) olur ve sayı
 * mürekkep renginde büyür; sayı yoksa ikon nötr, metin "Hepsi okundu" der.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Touchable } from "@/components/ui";
import { colors, elevate, hairline, radius, space, textScale, type } from "@/theme";

export interface InboxItem {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  count: number;
  /** Sayı 0 iken alttaki satır. */
  idleLabel: string;
  onPress: () => void;
}

export const InboxStrip = React.memo(function InboxStrip({ items }: { items: InboxItem[] }) {
  return (
    <View style={styles.row}>
      {items.map((item) => (
        <InboxTile key={item.key} item={item} />
      ))}
    </View>
  );
});

const InboxTile = React.memo(function InboxTile({ item }: { item: InboxItem }) {
  const active = item.count > 0;
  const countLabel = item.count > 99 ? "99+" : String(item.count);
  return (
    <Touchable
      feedback="card"
      haptic="selection"
      onPress={item.onPress}
      accessibilityRole="button"
      accessibilityLabel={active ? `${item.title}, ${countLabel} okunmamış` : `${item.title}, ${item.idleLabel}`}
      style={styles.tile}
    >
      <View style={styles.top}>
        <View style={[styles.icon, active ? styles.iconActive : null]}>
          <Ionicons name={item.icon} size={17} color={active ? colors.live : colors.textSecondary} />
        </View>
        <Ionicons name="chevron-forward" size={14} color={colors.textDisabled} />
      </View>
      <Text style={styles.title} numberOfLines={1} {...textScale.dense}>
        {item.title}
      </Text>
      {active ? (
        <View style={styles.countRow}>
          <Text style={styles.count} {...textScale.dense}>
            {countLabel}
          </Text>
          <Text style={styles.countUnit} {...textScale.dense}>
            yeni
          </Text>
        </View>
      ) : (
        <Text style={styles.idle} numberOfLines={1} {...textScale.dense}>
          {item.idleLabel}
        </Text>
      )}
    </Touchable>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: space.sm,
    marginTop: space.md,
  },
  tile: {
    flex: 1,
    padding: space.md,
    gap: space.xxs,
    borderRadius: radius.lg,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
    ...elevate(1),
  },
  top: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: space.s,
  },
  icon: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface2,
  },
  iconActive: {
    backgroundColor: colors.liveDim,
  },
  title: {
    ...type.h3,
    color: colors.textPrimary,
  },
  countRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: space.xs,
    minHeight: 22,
  },
  count: {
    ...type.metricSm,
    color: colors.textPrimary,
  },
  countUnit: {
    ...type.bodySm,
    color: colors.textSecondary,
  },
  idle: {
    ...type.bodySm,
    color: colors.textTertiary,
    minHeight: 22,
    lineHeight: 22,
  },
});
