/**
 * Mobil reji — olayın oyuncusunu seçme katmanı (yatay ekrana göre ızgara).
 *
 * Kadrodaki oyuncular (önce İlk 11, sonra yedekler) iki-üç sütunlu ızgarada
 * gelir; tek dokunuş olayı kaydeder. "Oyuncusuz kaydet" gol/kartı oyuncu
 * bilgisi olmadan yazar (sonra masaüstü rejiden düzeltilebilir).
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import type { SquadPlayer } from "@/components/admin/matches/model";
import { Touchable } from "@/components/ui";
import { RIG } from "@/lib/live/rig";
import { radius, space, type } from "@/theme";

export interface PlayerPickerProps {
  title: string;
  subtitle?: string;
  players: SquadPlayer[];
  accent: string;
  busy?: boolean;
  onPick: (playerId: string | null) => void;
  onClose: () => void;
  /** "Oyuncusuz kaydet" düğmesinin metni; null → düğme gizli (oyuncu zorunlu). */
  skipLabel?: string | null;
  /** Grup başlıkları (değişiklikte "SAHADA" / "YEDEK" gibi). */
  starterLabel?: string;
  otherLabel?: string;
  /** Kadro boşken gösterilen açıklama. */
  emptyText?: string;
}

export function PlayerPicker({
  title,
  subtitle,
  players,
  accent,
  busy,
  onPick,
  onClose,
  skipLabel = "Oyuncusuz kaydet",
  starterLabel = "İLK 11",
  otherLabel = "YEDEKLER",
  emptyText = "Bu takımın maç kadrosu girilmemiş. Olayı oyuncusuz kaydedebilirsin.",
}: PlayerPickerProps) {
  const starters = players.filter((p) => p.role === "starter");
  const others = players.filter((p) => p.role !== "starter");
  const renderGroup = (label: string, list: SquadPlayer[]) =>
    list.length ? (
      <View style={styles.group}>
        <Text style={styles.groupTitle} allowFontScaling={false}>
          {label}
        </Text>
        <View style={styles.grid}>
          {list.map((p) => (
            <Touchable
              key={p.id}
              style={styles.cell}
              onPress={() => onPick(p.id)}
              disabled={busy}
              accessibilityLabel={p.name}
              haptic="selection"
            >
              <View style={[styles.number, { borderColor: accent }]}>
                <Text style={styles.numberText} allowFontScaling={false}>
                  {p.number || "–"}
                </Text>
              </View>
              <Text style={styles.name} numberOfLines={1} allowFontScaling={false}>
                {p.name}
              </Text>
            </Touchable>
          ))}
        </View>
      </View>
    ) : null;

  return (
    <View style={styles.backdrop}>
      <View style={styles.sheet}>
        <View style={styles.head}>
          <View style={styles.flex}>
            <Text style={styles.title} allowFontScaling={false}>
              {title}
            </Text>
            {subtitle ? (
              <Text style={styles.subtitle} allowFontScaling={false}>
                {subtitle}
              </Text>
            ) : null}
          </View>
          {skipLabel ? (
            <Touchable style={styles.skip} onPress={() => onPick(null)} disabled={busy} accessibilityLabel={skipLabel}>
              <Text style={styles.skipText} allowFontScaling={false}>
                {skipLabel}
              </Text>
            </Touchable>
          ) : null}
          <Touchable style={styles.close} onPress={onClose} accessibilityLabel="Vazgeç">
            <Ionicons name="close" size={20} color={RIG.text} />
          </Touchable>
        </View>
        {players.length ? (
          <ScrollView contentContainerStyle={styles.body}>
            {renderGroup(starterLabel, starters)}
            {renderGroup(otherLabel, others)}
          </ScrollView>
        ) : (
          <View style={styles.empty}>
            <Text style={styles.subtitle} allowFontScaling={false}>
              {emptyText}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: RIG.glass,
    alignItems: "center",
    justifyContent: "center",
    padding: space.lg,
  },
  sheet: {
    width: "100%",
    maxWidth: 720,
    maxHeight: "100%",
    backgroundColor: RIG.panel,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: RIG.line,
    overflow: "hidden",
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: RIG.line,
  },
  flex: { flex: 1, minWidth: 0 },
  title: { ...type.h3, color: RIG.text },
  subtitle: { ...type.caption, color: RIG.textSoft, marginTop: space.xxs },
  skip: {
    paddingHorizontal: space.md,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: RIG.panelStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  skipText: { ...type.label, color: RIG.text },
  close: { width: 40, height: 40, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: RIG.panelSoft },
  body: { padding: space.lg, gap: space.md },
  group: { gap: space.sm },
  groupTitle: { ...type.micro, color: RIG.textMute },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  cell: {
    width: "31.5%",
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: space.sm,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: RIG.panelSoft,
  },
  number: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  numberText: { ...type.numSmStrong, color: RIG.text },
  name: { ...type.label, color: RIG.text, flex: 1 },
  empty: { padding: space.lg },
});
