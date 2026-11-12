/**
 * Fantezi kadrosu sahada: hücum üstte, kaleci altta. Mevkisi bilinmeyen
 * oyuncu orta sahaya dizilir. Boş yuvalar dokunulabilir "+" halkasıdır;
 * kaleci şartı varsa ve kaleci yoksa bir boş yuva kale önünde durur.
 *
 * Yuva: mevki renginde halka, avatar, soyad, alt hapta fiyat (ya da puan).
 * Kaptan "K", yardımcı "Y" pulu sağ üstte; kilitli oyuncuda kilit simgesi.
 * Yeni eklenen oyuncu bir kez yaylı biçimde belirir.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { Avatar, Touchable } from "@/components/ui";
import type { FantasyLine, FantasyPlayer } from "@/lib/api/community";
import { asLine, formatCredit, lineColor } from "@/lib/fantasy";
import { mediaUrl } from "@/lib/format";
import { colors, radius, space, textScale, type } from "@/theme";

import { PopIn, RoleBadge } from "./primitives";

const TOP = { x: 0.5, y: 0 } as const;
const BOTTOM = { x: 0.5, y: 1 } as const;
const ROWS: FantasyLine[] = ["FWD", "MID", "DEF", "GK"];

export interface PitchSlot {
  player: FantasyPlayer;
  captain?: boolean;
  vice?: boolean;
  locked?: boolean;
  /** Puan gösterilecekse (haftanın sonucu); yoksa fiyat. */
  points?: number | null;
  doubled?: boolean;
}

const surname = (name: string) => {
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? parts[parts.length - 1] : name;
};

export function FantasyPitch({
  slots,
  empty = 0,
  emptyGk = false,
  onSlotPress,
  onEmptyPress,
  height,
}: {
  slots: PitchSlot[];
  empty?: number;
  emptyGk?: boolean;
  onSlotPress?: (player: FantasyPlayer) => void;
  onEmptyPress?: (line: FantasyLine | "ALL") => void;
  height?: number;
}) {
  const rows = ROWS.map((line) => {
    const players = slots.filter((slot) => {
      const own = asLine(slot.player.line);
      return line === "MID" ? own === "MID" || own === "ANY" : own === line;
    });
    let blanks = 0;
    if (line === "GK" && emptyGk) blanks = 1;
    if (line === "MID") blanks = Math.max(0, empty - (emptyGk ? 1 : 0));
    return { line, players, blanks };
  }).filter((row) => row.players.length || row.blanks || row.line === "GK");

  // Yuva ~88 px (halka + ad + hap); satır sayısına göre saha uzar.
  const pitchHeight = height ?? Math.max(300, rows.length * 92 + space.xl);
  return (
    <View style={[styles.pitch, { height: pitchHeight }]}>
      <LinearGradient colors={colors.gradientPitch} start={TOP} end={BOTTOM} style={StyleSheet.absoluteFill} />
      {/* tebeşir çizgileri */}
      <View pointerEvents="none" style={styles.outline} />
      <View pointerEvents="none" style={styles.halfway} />
      <View pointerEvents="none" style={styles.circle} />
      <View pointerEvents="none" style={styles.boxBottom} />
      <View pointerEvents="none" style={styles.boxTop} />
      <View style={styles.rows}>
        {rows.map((row) => (
          <View key={row.line} style={styles.row}>
            {row.players.map((slot) => (
              <PopIn key={slot.player.id} trigger={slot.player.id} from={0.6}>
                <Token slot={slot} onPress={onSlotPress ? () => onSlotPress(slot.player) : undefined} />
              </PopIn>
            ))}
            {Array.from({ length: row.blanks }, (_, i) => (
              <Blank key={`b${i}`} label={row.line === "GK" ? "Kaleci" : "Oyuncu"} onPress={onEmptyPress ? () => onEmptyPress(row.line === "GK" ? "GK" : "ALL") : undefined} />
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

function Token({ slot, onPress }: { slot: PitchSlot; onPress?: () => void }) {
  const { player } = slot;
  const line = asLine(player.line);
  const showPoints = slot.points != null;
  return (
    <Touchable feedback="icon" haptic="selection" onPress={onPress} disabled={!onPress} accessibilityLabel={`${player.name}${slot.captain ? ", kaptan" : slot.vice ? ", yardımcı kaptan" : ""}`}>
      <View style={styles.token}>
        <View style={[styles.ring, { borderColor: lineColor(line) }]}>
          <Avatar name={player.name} image={mediaUrl(player.image)} size={44} />
          {slot.captain || slot.vice ? (
            <View style={styles.role}>
              <RoleBadge role={slot.captain ? "captain" : "vice"} />
            </View>
          ) : null}
          {slot.locked ? (
            <View style={styles.lock}>
              <Ionicons name="lock-closed" size={10} color={colors.onPitch} />
            </View>
          ) : null}
        </View>
        <Text style={styles.name} numberOfLines={1} {...textScale.badge}>
          {surname(player.name)}
        </Text>
        <View style={[styles.pill, showPoints && slot.doubled && styles.pillHot]}>
          <Text style={[styles.pillText, showPoints && slot.doubled && styles.pillTextHot]} {...textScale.badge}>
            {showPoints ? `${slot.points} p` : formatCredit(player.price)}
          </Text>
        </View>
      </View>
    </Touchable>
  );
}

function Blank({ label, onPress }: { label: string; onPress?: () => void }) {
  return (
    <Touchable feedback="icon" haptic="selection" onPress={onPress} disabled={!onPress} accessibilityLabel={`${label} ekle`}>
      <View style={styles.token}>
        <View style={styles.blank}>
          <Ionicons name="add" size={22} color={colors.onPitch} />
        </View>
        <Text style={styles.blankText} {...textScale.badge}>
          {label}
        </Text>
      </View>
    </Touchable>
  );
}

const TOKEN_W = 68;

const styles = StyleSheet.create({
  pitch: { borderRadius: radius.xxl, overflow: "hidden", backgroundColor: colors.pitch },
  outline: { position: "absolute", top: space.sm, bottom: space.sm, left: space.sm, right: space.sm, borderWidth: 1, borderColor: colors.chalk, borderRadius: radius.sm },
  halfway: { position: "absolute", left: space.sm, right: space.sm, top: "50%", height: 1, backgroundColor: colors.chalk },
  circle: { position: "absolute", width: 72, height: 72, left: "50%", top: "50%", marginLeft: -36, marginTop: -36, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.chalk },
  boxBottom: { position: "absolute", bottom: space.sm, left: "28%", right: "28%", height: 44, borderWidth: 1, borderBottomWidth: 0, borderColor: colors.chalk },
  boxTop: { position: "absolute", top: space.sm, left: "28%", right: "28%", height: 44, borderWidth: 1, borderTopWidth: 0, borderColor: colors.chalk },
  rows: { flex: 1, justifyContent: "space-evenly", paddingVertical: space.s },
  row: { flexDirection: "row", justifyContent: "center", gap: space.lg },
  token: { width: TOKEN_W, alignItems: "center", gap: space.xxs },
  ring: { padding: 2, borderRadius: radius.pill, borderWidth: 2, backgroundColor: colors.surface1 },
  role: { position: "absolute", top: -4, right: -6 },
  lock: { position: "absolute", bottom: -2, left: -4, width: 18, height: 18, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.inkBlock },
  name: { ...type.labelXs, color: colors.onPitch, maxWidth: TOKEN_W },
  pill: { paddingHorizontal: space.s, paddingVertical: 1, borderRadius: radius.pill, backgroundColor: colors.surface1 },
  pillHot: { backgroundColor: colors.win },
  pillText: { ...type.numSmStrong, color: colors.textPrimary },
  pillTextHot: { color: colors.textOnStatus },
  blank: { width: 52, height: 52, borderRadius: radius.pill, borderWidth: 1.5, borderStyle: "dashed", borderColor: colors.onPitch, alignItems: "center", justifyContent: "center", opacity: 0.85 },
  blankText: { ...type.labelXs, color: colors.onPitch, opacity: 0.85 },
});
