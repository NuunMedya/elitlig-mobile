/**
 * KULÜP ŞEHRİ 2.0 · FAZ 5 — ŞEHİR ZİYARETİ parçaları.
 *
 *   · VisitEntryCard — şehir ekranında "Şehirleri gez" girişi (aldığın alkış).
 *   · VisitCityRow — ziyaret listesindeki şehir satırı.
 *   · VisitPrivacyRow — "Şehrimi ziyarete kapat" anahtarı (ziyaret alanında).
 *
 * Ziyaret salt okunurdur: başka şehrin kasası, telefonu, akademi oyuncuları
 * hiç gösterilmez (sunucu da yollamaz).
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { StyleSheet, Text, View } from "react-native";

import { Avatar, Toggle, Touchable } from "@/components/ui";
import type { City2VisitCard, City2VisitSummary } from "@/lib/puzzle/city2";
import { seasonTierStyle } from "@/lib/puzzle/cityPalette";
import { colors, fonts, hairline, radius, space, textScale, type } from "@/theme";

import { PrestigeStars } from "./Season";
import { cardStyle, fmt } from "./shared";

export function VisitEntryCard({ visit, onPress }: { visit: City2VisitSummary; onPress: () => void }) {
  return (
    <Touchable onPress={onPress} feedback="card" style={styles.entry} accessibilityRole="button" accessibilityLabel={`Şehirleri gez. Şehrin ${visit.applause} alkış aldı`}>
      <View style={styles.entryIcon}>
        <Ionicons name="compass" size={22} color={colors.brandAccent} />
      </View>
      <View style={styles.flex}>
        <Text style={styles.entryTitle} {...textScale.dense}>
          Şehirleri gez
        </Text>
        <Text style={styles.entryMeta} numberOfLines={1} {...textScale.dense}>
          {visit.closed ? "Şehrin ziyarete kapalı" : `Şehrin ${fmt(visit.applause)} alkış aldı${visit.today ? ` · bugün ${fmt(visit.today)}` : ""}`}
        </Text>
      </View>
      <View style={styles.entryChip}>
        <Ionicons name="hand-left" size={12} color={colors.brandAccent} />
        <Text style={styles.entryChipText} {...textScale.badge}>
          Alkışla
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
    </Touchable>
  );
}

export function VisitCityRow({ c, onPress }: { c: City2VisitCard; onPress: () => void }) {
  const framed = Boolean(c.frame);
  const frame = seasonTierStyle(c.frame);
  return (
    <Touchable onPress={onPress} feedback="row" style={styles.row} accessibilityRole="button" accessibilityLabel={`${c.name}, ${c.city ?? ""}, lig ${c.step_label ?? c.rung}, ${c.beauty} güzellik`}>
      <View style={[styles.avatarRing, framed ? { borderColor: frame.colors[1] } : null]}>
        <Avatar name={c.name} size={40} />
      </View>
      <View style={styles.flex}>
        <View style={styles.nameLine}>
          <Text style={styles.name} numberOfLines={1} {...textScale.dense}>
            {c.name}
          </Text>
          {c.prestige > 0 ? <PrestigeStars count={c.prestige} size={11} /> : null}
        </View>
        <Text style={styles.meta} numberOfLines={1} {...textScale.dense}>
          {[c.step_label ? `Lig ${c.step_label}` : null, c.step_title, c.city].filter(Boolean).join(" · ")}
        </Text>
      </View>
      <View style={styles.values}>
        <View style={styles.valueLine}>
          <Ionicons name="sparkles" size={12} color={colors.brandAccent} />
          <Text style={styles.value} {...textScale.badge}>
            {fmt(c.beauty)}
          </Text>
        </View>
        <View style={styles.valueLine}>
          <Ionicons name="hand-left-outline" size={11} color={colors.textTertiary} />
          <Text style={styles.sub} {...textScale.badge}>
            {fmt(c.applause)}
          </Text>
        </View>
      </View>
    </Touchable>
  );
}

export function VisitPrivacyRow({ label, help, value, disabled, onChange }: { label: string; help: string | null; value: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <Touchable
      feedback="row"
      onPress={() => !disabled && onChange(!value)}
      style={styles.privacy}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled: Boolean(disabled) }}
      accessibilityLabel={`${label}. ${value ? "açık" : "kapalı"}`}
    >
      <Ionicons name={value ? "eye-off" : "eye-outline"} size={18} color={colors.textSecondary} />
      <View style={styles.flex}>
        <Text style={styles.privacyTitle} {...textScale.dense}>
          {label}
        </Text>
        <Text style={styles.privacyHelp} {...textScale.long}>
          {help ?? "Açıkken şehrin başka üyelere gösterilmez ve ziyaret listelerinde çıkmaz."}
        </Text>
      </View>
      <Toggle value={value} onValueChange={onChange} disabled={disabled} accessibilityLabel={label} />
    </Touchable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  entry: { ...cardStyle, flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md },
  entryIcon: { width: 44, height: 44, borderRadius: radius.lg, alignItems: "center", justifyContent: "center", backgroundColor: colors.brandDim },
  entryTitle: { ...type.h3, color: colors.textPrimary },
  entryMeta: { ...type.caption, color: colors.textTertiary },
  entryChip: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: space.sm, height: 24, borderRadius: radius.pill, backgroundColor: colors.brandDim },
  entryChipText: { ...type.labelXs, color: colors.brandAccent },

  row: { ...cardStyle, flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.m, paddingHorizontal: space.md, borderRadius: radius.lg },
  avatarRing: { padding: 2, borderRadius: radius.pill, borderWidth: 2, borderColor: "transparent" },
  nameLine: { flexDirection: "row", alignItems: "center", gap: space.xs },
  name: { ...type.h4, fontFamily: fonts.semibold, color: colors.textPrimary, flexShrink: 1 },
  meta: { ...type.caption, color: colors.textTertiary },
  values: { alignItems: "flex-end", gap: 2 },
  valueLine: { flexDirection: "row", alignItems: "center", gap: 3 },
  value: { ...type.numSmStrong, color: colors.textPrimary },
  sub: { ...type.caption, color: colors.textTertiary },

  privacy: { ...cardStyle, flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md, borderWidth: hairline },
  privacyTitle: { ...type.h4, color: colors.textPrimary },
  privacyHelp: { ...type.caption, color: colors.textTertiary },
});
