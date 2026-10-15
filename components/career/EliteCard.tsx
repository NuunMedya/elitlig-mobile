/**
 * ELİT KART — oyuncunun gerçek maç verisinden hesaplanan FIFA tarzı kartı
 * (GET /api/career/me ya da /api/career/players/:id → `card`).
 *
 * OVR, kademe (Çaylak · Bronz · Gümüş · Altın · Elit), "Formda" rozeti (son
 * 7 günde haftanın enlerinde) ve altı değer. Değerler yalnız sahadan gelir;
 * oyunlar kartı değiştirmez.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { Avatar } from "@/components/ui";
import type { EliteCard as EliteCardData } from "@/lib/api/career";
import { TIER_ACCENT, TIER_GRADIENTS } from "@/lib/careerTiers";
import { mediaUrl } from "@/lib/format";
import { colors, radius, space, textScale, type, upperTR } from "@/theme";

const LINE_SHORT: Record<EliteCardData["line"], string> = { GK: "KL", DEF: "DEF", MID: "OS", FWD: "FOR", ANY: "OYN" };

function statRows(card: EliteCardData): [string, number][] {
  const s = card.stats;
  return card.line === "GK"
    ? [["KAL", s.kalecilik], ["FRM", s.form], ["TEC", s.tecrube], ["DEF", s.savunma], ["PAS", s.pas], ["DİS", s.disiplin]]
    : [["ŞUT", s.sut], ["PAS", s.pas], ["DEF", s.savunma], ["FRM", s.form], ["TEC", s.tecrube], ["DİS", s.disiplin]];
}

export const EliteCard = React.memo(function EliteCard({ card, level }: { card: EliteCardData; level?: number | null }) {
  const key = card.in_form ? "formda" : card.tier;
  const accent = TIER_ACCENT[key];
  const rows = statRows(card);
  return (
    <LinearGradient
      colors={TIER_GRADIENTS[key]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.card, { borderColor: accent }]}
      accessible
      accessibilityLabel={`${card.name}, Elit Kart ${card.tier_label}, genel ${card.ovr}`}
    >
      <View style={styles.top}>
        <View style={styles.ovrBlock}>
          <Text style={[styles.ovr, { color: accent }]} {...textScale.dense}>
            {card.ovr}
          </Text>
          <Text style={styles.line} {...textScale.badge}>
            {LINE_SHORT[card.line]}
          </Text>
        </View>
        <Avatar name={card.name} image={mediaUrl(card.image)} size={72} />
        <View style={styles.badges}>
          <Text style={[styles.tier, { color: accent }]} {...textScale.badge}>
            {upperTR(card.in_form ? "Formda" : card.tier_label)}
          </Text>
          {level ? (
            <View style={styles.levelPill}>
              <Ionicons name="star" size={10} color={colors.onDark} />
              <Text style={styles.levelText} {...textScale.badge}>
                {`SV ${level}`}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
      <Text style={styles.name} numberOfLines={1} {...textScale.dense}>
        {card.name}
      </Text>
      <View style={[styles.divider, { backgroundColor: accent }]} />
      <View style={styles.stats}>
        {rows.map(([label, value]) => (
          <View key={label} style={styles.stat}>
            <Text style={styles.statValue} {...textScale.dense}>
              {value}
            </Text>
            <Text style={styles.statLabel} {...textScale.badge}>
              {label}
            </Text>
          </View>
        ))}
      </View>
      <Text style={styles.footer} {...textScale.badge}>
        {`${card.totals.matches} maç · ${card.totals.goals} gol · ${card.totals.assists} asist${card.totals.rating ? ` · ${card.totals.rating.toFixed(1)} reyting` : ""}`}
      </Text>
    </LinearGradient>
  );
});

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.xl,
    borderWidth: 2,
    padding: space.md,
    gap: space.s,
  },
  top: { flexDirection: "row", alignItems: "center", gap: space.md },
  ovrBlock: { alignItems: "center", minWidth: 56 },
  ovr: { ...type.scoreHero },
  line: { ...type.overline, color: colors.onDark },
  badges: { flex: 1, alignItems: "flex-end", gap: space.xs },
  tier: { ...type.overline },
  levelPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xxs,
    paddingHorizontal: space.s,
    paddingVertical: space.xxs,
    borderRadius: radius.pill,
    backgroundColor: colors.overlay,
  },
  levelText: { ...type.overline, color: colors.onDark },
  name: { ...type.h2, color: colors.onDark },
  divider: { height: 1, opacity: 0.5 },
  stats: { flexDirection: "row", justifyContent: "space-between" },
  stat: { alignItems: "center", minWidth: 40 },
  statValue: { ...type.h3, color: colors.onDark },
  statLabel: { ...type.overline, color: colors.onDarkMuted },
  footer: { ...type.caption, color: colors.onDarkMuted, textAlign: "center" },
});
