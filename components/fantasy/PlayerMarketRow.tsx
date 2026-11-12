/**
 * Pazar satırı: oyuncu, mevki çipi, takım, son 5 maç çubukları, form ve
 * fiyat (+ trend). "Aktif değil" ve engel gerekçesi (bütçe, takım sınırı,
 * maç başladı…) satırın içinde yazılı durur; engelli satır sönük ve kapalı.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React, { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Avatar, Touchable } from "@/components/ui";
import type { FantasyPlayer } from "@/lib/api/community";
import { asLine, formatNumber } from "@/lib/fantasy";
import { mediaUrl } from "@/lib/format";
import { colors, hairline, radius, space, textScale, type } from "@/theme";

import { FormBars, LineChip, PriceTag } from "./primitives";

export const PlayerMarketRow = memo(function PlayerMarketRow({
  player,
  blocker,
  onPress,
}: {
  player: FantasyPlayer;
  blocker: string | null;
  onPress: (player: FantasyPlayer) => void;
}) {
  const line = asLine(player.line);
  const meta = [player.teamName, player.matches != null ? `${player.matches} maç` : null].filter(Boolean).join(" · ");
  return (
    <Touchable feedback="row" haptic="selection" disabled={Boolean(blocker)} onPress={() => onPress(player)} accessibilityLabel={`${player.name}, ${blocker ?? "ekle"}`}>
      <View style={[styles.row, blocker ? styles.dim : null]}>
        <Avatar name={player.name} image={mediaUrl(player.image)} size={40} />
        <View style={styles.main}>
          <View style={styles.titleRow}>
            <LineChip line={line} />
            <Text style={styles.name} numberOfLines={1} {...textScale.dense}>
              {player.name}
            </Text>
          </View>
          <Text style={styles.meta} numberOfLines={1} {...textScale.dense}>
            {meta}
          </Text>
          {player.inactive || blocker ? (
            <View style={styles.flags}>
              {player.inactive ? (
                <View style={styles.flag}>
                  <Ionicons name="moon" size={10} color={colors.warn} />
                  <Text style={[styles.flagText, { color: colors.warn }]} {...textScale.badge}>
                    aktif değil
                  </Text>
                </View>
              ) : null}
              {blocker ? (
                <Text style={styles.blocker} {...textScale.badge}>
                  {blocker}
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>
        <View style={styles.form}>
          <FormBars values={player.last5} />
          <Text style={styles.formText} numberOfLines={1} {...textScale.badge}>
            {`form ${formatNumber(player.form)}`}
          </Text>
        </View>
        <View style={styles.priceCol}>
          <PriceTag price={player.price} trend={player.trend} prevPrice={player.prevPrice} />
          <Text style={styles.unit} {...textScale.badge}>
            kredi
          </Text>
        </View>
      </View>
    </Touchable>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.m,
    paddingVertical: space.m,
    paddingHorizontal: space.xs,
    borderBottomWidth: hairline,
    borderBottomColor: colors.separator,
  },
  dim: { opacity: 0.45 },
  main: { flex: 1, minWidth: 0, gap: space.xxs },
  titleRow: { flexDirection: "row", alignItems: "center", gap: space.s },
  name: { ...type.label, color: colors.textPrimary, flexShrink: 1 },
  meta: { ...type.caption, color: colors.textTertiary },
  flags: { flexDirection: "row", alignItems: "center", gap: space.sm },
  flag: { flexDirection: "row", alignItems: "center", gap: space.xxs, paddingHorizontal: space.xs, borderRadius: radius.xs, backgroundColor: colors.warnDim },
  flagText: { ...type.micro },
  blocker: { ...type.micro, color: colors.textTertiary },
  form: { alignItems: "center", gap: space.xxs, width: 54 },
  formText: { ...type.meta, color: colors.textTertiary },
  priceCol: { alignItems: "flex-end", width: 46 },
  unit: { ...type.meta, color: colors.textTertiary },
});
