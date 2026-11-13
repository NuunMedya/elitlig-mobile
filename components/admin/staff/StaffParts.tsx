/**
 * PERSONEL SUNUM PARÇALARI — personel listesi ve ayrıntısının ortak çizimi.
 *
 *   · dutyIcon / dutyTone  görev → ikon ve IconTile tonu (spiker mikrofon/mor,
 *                          reji kamera/camgöbeği, hakem bayrak/altın,
 *                          fotoğrafçı objektif/pembe, sağlıkçı çanta/nane).
 *   · StaffCard            kişi kartı: avatar (durum noktası) · ad · görev
 *                          pulları · il ve hesap hapları · sıradaki görev şeridi;
 *                          sağda puan plakası; altta görev / yaklaşan sayaçları.
 *   · DutyPill             görev pulu (ikon + ad, görev tonunda).
 *
 * Yalnız sunum; veri ekranlardan gelir.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import React, { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Avatar, Touchable, type IconTileTone } from "@/components/ui";
import { formatMatchWhen, scoreTone, type StaffMember } from "@/lib/api/admin/staff";
import { colors, hairline, radius, space, textScale, type } from "@/theme";

import { ScorePlate, trNum } from "../system/SysKit";

const DUTY_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  spiker: "mic",
  reji: "videocam",
  hakem: "flag",
  fotografci: "camera",
  saglikci: "medkit",
};
const DUTY_TONES: Record<string, IconTileTone> = {
  spiker: "violet",
  reji: "cyan",
  hakem: "gold",
  fotografci: "pink",
  saglikci: "mint",
};

export const dutyIcon = (key: string | null | undefined): keyof typeof Ionicons.glyphMap => DUTY_ICONS[key ?? ""] ?? "briefcase";
export const dutyTone = (key: string | null | undefined): IconTileTone => DUTY_TONES[key ?? ""] ?? "neutral";

/** Görev tonunun metin rengi (IconTile degradesinin ilk durağı). */
const dutyColor = (key: string) => {
  const tone = dutyTone(key);
  return tone === "neutral" ? colors.textSecondary : colors.tileTones[tone][0];
};

export function DutyPill({ duty, label }: { duty: string; label: string }) {
  const color = dutyColor(duty);
  return (
    <View style={[styles.duty, { borderColor: color }]}>
      <Ionicons name={dutyIcon(duty)} size={11} color={color} />
      <Text style={[styles.dutyText, { color: colors.textPrimary }]} numberOfLines={1} {...textScale.badge}>
        {label}
      </Text>
    </View>
  );
}

export const StaffCard = memo(function StaffCard({ item, onPress }: { item: StaffMember; onPress: () => void }) {
  const passive = (item.status || "active") !== "active";
  const duties = item.duties?.length ? item.duties : [item.duty].filter(Boolean) as string[];
  const labels = item.dutyLabels?.length ? item.dutyLabels : [item.dutyLabel].filter(Boolean) as string[];
  const tone = scoreTone(item.average);
  return (
    <Touchable
      feedback="card"
      onPress={onPress}
      style={[styles.card, passive ? styles.cardMuted : null]}
      accessibilityRole="button"
      accessibilityLabel={`${item.fullName}, ${labels.join(", ") || "görev seçilmedi"}${passive ? ", pasif" : ""}`}
    >
      <View style={styles.top}>
        <View>
          <Avatar name={item.fullName} size={46} ring={item.linkedUser ? "brand" : "none"} />
          <View style={[styles.statusDot, { backgroundColor: passive ? colors.textTertiary : colors.win }]} />
        </View>
        <View style={styles.main}>
          <Text style={[styles.name, passive ? styles.nameMuted : null]} numberOfLines={1} {...textScale.dense}>
            {item.fullName}
          </Text>
          <View style={styles.duties}>
            {duties.length ? (
              duties.map((d, i) => <DutyPill key={d} duty={d} label={labels[i] ?? d} />)
            ) : (
              <Text style={styles.meta} {...textScale.dense}>
                Görev seçilmedi
              </Text>
            )}
          </View>
          <View style={styles.metaRow}>
            <Ionicons name="location-outline" size={11} color={item.city ? colors.textTertiary : colors.warn} />
            <Text style={[styles.meta, !item.city ? { color: colors.warn } : null]} numberOfLines={1} {...textScale.dense}>
              {item.city || "İl yok"}
            </Text>
            <Text style={styles.metaSep}>·</Text>
            <Ionicons name={item.linkedUser ? "key" : "key-outline"} size={11} color={item.linkedUser ? colors.brandAccent : colors.textTertiary} />
            <Text style={[styles.meta, item.linkedUser ? { color: colors.brandAccent } : null]} numberOfLines={1} {...textScale.dense}>
              {item.linkedUser ? (item.linkedUser.username ? `@${item.linkedUser.username}` : item.linkedUser.name) : "Hesap yok"}
            </Text>
            {passive ? (
              <>
                <Text style={styles.metaSep}>·</Text>
                <Text style={styles.meta} {...textScale.dense}>
                  Pasif
                </Text>
              </>
            ) : null}
          </View>
        </View>
        <ScorePlate value={trNum(item.average)} tone={item.average == null ? "neutral" : tone} caption="puan" size="sm" />
      </View>

      <View style={styles.foot}>
        <View style={styles.counter}>
          <Text style={styles.counterValue} {...textScale.badge}>
            {item.matchCount || 0}
          </Text>
          <Text style={styles.counterLabel} {...textScale.badge}>
            görev
          </Text>
        </View>
        <View style={styles.counter}>
          <Text style={[styles.counterValue, item.upcomingCount ? { color: colors.accentText } : null]} {...textScale.badge}>
            {item.upcomingCount || 0}
          </Text>
          <Text style={styles.counterLabel} {...textScale.badge}>
            yaklaşan
          </Text>
        </View>
        <View style={styles.next}>
          {item.nextMatch ? <LinearGradient colors={colors.gradientSignature} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={styles.nextRail} /> : null}
          <Text style={styles.nextText} numberOfLines={1} {...textScale.dense}>
            {item.nextMatch
              ? `${formatMatchWhen(item.nextMatch)} · ${item.nextMatch.label}`
              : item.lastMatch
                ? `Son: ${formatMatchWhen(item.lastMatch)} · ${item.lastMatch.label}`
                : item.phone || "Henüz görev yok"}
          </Text>
        </View>
      </View>
    </Touchable>
  );
});

const styles = StyleSheet.create({
  card: {
    gap: space.md,
    padding: space.md,
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  cardMuted: { backgroundColor: colors.surface2 },
  top: { flexDirection: "row", alignItems: "flex-start", gap: space.md },
  statusDot: { position: "absolute", right: 0, bottom: 0, width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: colors.surface1 },
  main: { flex: 1, minWidth: 0, gap: space.xs },
  name: { ...type.h4, color: colors.textPrimary },
  nameMuted: { color: colors.textTertiary },
  duties: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
  duty: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: space.sm, paddingVertical: 2, borderRadius: radius.pill, borderWidth: 1 },
  dutyText: { ...type.labelXs },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 4, flexWrap: "wrap" },
  meta: { ...type.caption, color: colors.textTertiary },
  metaSep: { ...type.caption, color: colors.textTertiary, marginHorizontal: 2 },
  foot: { flexDirection: "row", alignItems: "center", gap: space.md, paddingTop: space.sm, borderTopWidth: hairline, borderTopColor: colors.separator },
  counter: { flexDirection: "row", alignItems: "baseline", gap: 3 },
  counterValue: { ...type.scoreXs, color: colors.textPrimary },
  counterLabel: { ...type.caption, color: colors.textTertiary },
  next: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: space.xs, justifyContent: "flex-end" },
  nextRail: { width: 3, height: 14, borderRadius: 2 },
  nextText: { ...type.caption, color: colors.textSecondary, flexShrink: 1 },
});
