/**
 * MAÇ YILDIZI (Ekonomi A1) — gerçek maçta oynamak şehre yıldız getirir.
 *
 * Yayınlanan her maç: 25 yıldız + performans bonusu (en çok +50): gol 10,
 * asist 8, reyting ≥7,5 → 10 / ≥8,5 → 20, galibiyet 8, gol yemeden (KL/DEF)
 * 10, maçın oyuncusu 15. Haftada (Pzt–Paz) en çok 2 maç sayılır.
 *
 *   · MatchStarsChip: cüzdanda "Bu hafta maç yıldızı: 1/2 maç · 63 yıldız".
 *   · MatchStarsSheet: haftanın durumu, kurallar ve son maçların dökümü.
 * Eski sunucu (`match_detail` yok) için ikisi de çizilmez.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, Text, View } from "react-native";

import { BottomSheet, Touchable } from "@/components/ui";
import { CARTOON } from "@/lib/game/cartoon";
import type { MatchStarsDetail, MatchStarsEntry } from "@/lib/puzzle/api";
import { CITY_UI } from "@/lib/puzzle/cityPalette";
import { colors, fonts, hairline, radius, space, textScale, type } from "@/theme";

const TOP = { x: 0.5, y: 0 } as const;
const BOTTOM = { x: 0.5, y: 1 } as const;
const LEFT = { x: 0, y: 0.5 } as const;
const RIGHT = { x: 1, y: 0.5 } as const;
const fmt = (n: number) => n.toLocaleString("tr-TR");
const dateText = (iso: string) => {
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toLocaleDateString("tr-TR", { day: "numeric", month: "short", weekday: "short" }) : "";
};

const PARTS: { key: keyof MatchStarsEntry["breakdown"]; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "goal", label: "Gol", icon: "football" },
  { key: "assist", label: "Asist", icon: "git-merge" },
  { key: "rating", label: "Reyting", icon: "star-half" },
  { key: "win", label: "Galibiyet", icon: "trophy" },
  { key: "clean_sheet", label: "Gol yemeden", icon: "shield-checkmark" },
  { key: "motm", label: "Maçın oyuncusu", icon: "medal" },
];

export function matchWeekLine(detail: MatchStarsDetail) {
  const w = detail.week;
  return `Bu hafta maç yıldızı: ${w.matches}/${w.cap_matches} maç · ${fmt(w.stars)} yıldız`;
}

export function MatchStarsChip({ detail, onPress }: { detail: MatchStarsDetail; onPress: () => void }) {
  return (
    <Touchable onPress={onPress} haptic="selection" style={styles.chip} accessibilityRole="button" accessibilityLabel={`${matchWeekLine(detail)}. Ayrıntı`}>
      <LinearGradient colors={CITY_UI.green} start={TOP} end={BOTTOM} style={styles.chipIcon}>
        <Ionicons name="football" size={16} color={CITY_UI.white} />
      </LinearGradient>
      <Text style={styles.chipText} numberOfLines={2} {...textScale.dense}>
        {matchWeekLine(detail)}
      </Text>
      <Ionicons name="chevron-forward" size={16} color={CITY_UI.muted} />
    </Touchable>
  );
}

export function MatchStarsSheet({ visible, onClose, detail, total }: { visible: boolean; onClose: () => void; detail: MatchStarsDetail | undefined; total: number }) {
  if (!detail) return null;
  const w = detail.week;
  const r = detail.rules;
  const matchProg = Math.min(1, w.matches / Math.max(1, w.cap_matches));
  const starProg = Math.min(1, w.stars / Math.max(1, w.cap_stars));
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Maç yıldızı" snap="full">
      <View style={styles.sheet}>
        <View style={styles.hero}>
          <LinearGradient colors={CARTOON.pill} start={TOP} end={BOTTOM} style={StyleSheet.absoluteFill} />
          <View style={styles.heroTop}>
            <LinearGradient colors={CITY_UI.green} start={TOP} end={BOTTOM} style={styles.heroIcon}>
              <Ionicons name="football" size={26} color={CITY_UI.white} />
            </LinearGradient>
            <View style={styles.heroTexts}>
              <Text style={styles.heroBig} {...textScale.dense}>
                {fmt(w.stars)} yıldız
              </Text>
              <Text style={styles.heroSub} {...textScale.dense}>
                bu hafta · toplam {fmt(total)} maç yıldızı
              </Text>
            </View>
          </View>
          <Meter label="Sayılan maç" value={`${w.matches}/${w.cap_matches}`} progress={matchProg} />
          <Meter label="Haftalık tavan" value={`${fmt(w.stars)}/${fmt(w.cap_stars)}`} progress={starProg} />
        </View>

        <View style={styles.rules}>
          <Text style={styles.sectionTitle} {...textScale.dense}>
            Nasıl hesaplanır?
          </Text>
          <RuleRow icon="body" label="Maçta oynamak" value={`+${r.base}`} />
          <RuleRow icon="football" label="Gol (her biri)" value={`+${r.goal}`} />
          <RuleRow icon="git-merge" label="Asist (her biri)" value={`+${r.assist}`} />
          <RuleRow icon="star-half" label="Reyting 7,5+ / 8,5+" value={`+${r.rating75} / +${r.rating85}`} />
          <RuleRow icon="trophy" label="Galibiyet" value={`+${r.win}`} />
          <RuleRow icon="shield-checkmark" label="Gol yemeden (kaleci, defans)" value={`+${r.clean_sheet}`} />
          <RuleRow icon="medal" label="Maçın oyuncusu" value={`+${r.motm}`} />
          <Text style={styles.rulesFoot} {...textScale.long}>
            Bonus en çok +{r.bonus_cap}. Haftada (Pazartesi–Pazar) en çok {r.week_matches} maç sayılır; yalnız yayınlanan maçlar. XP de ayrıca yazılır.
          </Text>
        </View>

        <View style={styles.recent}>
          <Text style={styles.sectionTitle} {...textScale.dense}>
            Son maçların
          </Text>
          {detail.recent.length ? (
            detail.recent.map((m) => <MatchRow key={m.match_id} m={m} cap={r.week_matches} />)
          ) : (
            <Text style={styles.empty} {...textScale.long}>
              Henüz maç yıldızın yok. Takımının yayınlanan maçlarında oynadıkça burada görünür (profilin bir oyuncuya bağlı olmalı).
            </Text>
          )}
        </View>
      </View>
    </BottomSheet>
  );
}

function Meter({ label, value, progress }: { label: string; value: string; progress: number }) {
  return (
    <View style={styles.meter}>
      <View style={styles.meterHead}>
        <Text style={styles.meterLabel} {...textScale.dense}>
          {label}
        </Text>
        <Text style={styles.meterValue} {...textScale.badge}>
          {value}
        </Text>
      </View>
      <View style={styles.track}>
        <LinearGradient colors={CARTOON.gold} start={LEFT} end={RIGHT} style={[styles.fill, { width: `${Math.max(progress > 0 ? 6 : 0, progress * 100)}%` }]} />
      </View>
    </View>
  );
}

function RuleRow({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  return (
    <View style={styles.rule}>
      <Ionicons name={icon} size={16} color={colors.brandAccent} />
      <Text style={styles.ruleLabel} {...textScale.dense}>
        {label}
      </Text>
      <Text style={styles.ruleValue} {...textScale.badge}>
        {value}
      </Text>
    </View>
  );
}

function MatchRow({ m, cap }: { m: MatchStarsEntry; cap: number }) {
  const parts = PARTS.filter((p) => (m.breakdown[p.key] ?? 0) > 0);
  return (
    <View style={[styles.match, m.counted ? null : styles.matchOff]}>
      <View style={styles.matchHead}>
        <View style={styles.matchTexts}>
          <Text style={styles.matchLabel} numberOfLines={1} {...textScale.dense}>
            {m.label}
          </Text>
          <Text style={styles.matchDate} {...textScale.dense}>
            {dateText(m.date)}
          </Text>
        </View>
        <View style={[styles.matchStars, m.counted ? null : styles.matchStarsOff]}>
          <Ionicons name="star" size={14} color={m.counted ? CARTOON.goldInk : colors.textTertiary} />
          <Text style={[styles.matchStarsText, m.counted ? null : styles.matchStarsTextOff]} {...textScale.badge}>
            {m.counted ? `+${m.stars}` : "0"}
          </Text>
        </View>
      </View>
      {m.counted ? (
        <View style={styles.parts}>
          <View style={styles.part}>
            <Text style={styles.partText} {...textScale.badge}>
              Oynadın +{m.base}
            </Text>
          </View>
          {parts.map((p) => (
            <View key={p.key} style={styles.part}>
              <Ionicons name={p.icon} size={11} color={colors.brandAccent} />
              <Text style={styles.partText} {...textScale.badge}>
                {p.label} +{m.breakdown[p.key]}
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.matchOffText} {...textScale.dense}>
          Haftalık {cap} maç sınırının dışında: sayılmadı
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { flexDirection: "row", alignItems: "center", gap: space.sm, padding: space.sm, borderRadius: radius.lg, backgroundColor: CITY_UI.chip },
  chipIcon: { width: 30, height: 30, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  chipText: { ...type.bodySm, fontFamily: fonts.bold, color: CITY_UI.white, flex: 1 },

  sheet: { gap: space.lg, paddingBottom: space.lg },
  sectionTitle: { ...type.h3, fontFamily: fonts.bold, color: colors.textPrimary },
  hero: { gap: space.md, padding: space.lg, borderRadius: radius.xxl, overflow: "hidden" },
  heroTop: { flexDirection: "row", alignItems: "center", gap: space.md },
  heroIcon: { width: 52, height: 52, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: CARTOON.white },
  heroTexts: { flex: 1, gap: 2 },
  heroBig: { ...type.display, fontFamily: fonts.bold, color: CARTOON.white },
  heroSub: { ...type.bodySm, color: CITY_UI.muted },
  meter: { gap: space.xs },
  meterHead: { flexDirection: "row", justifyContent: "space-between" },
  meterLabel: { ...type.caption, color: CITY_UI.muted },
  meterValue: { ...type.label, fontFamily: fonts.bold, color: CARTOON.white },
  track: { height: 10, borderRadius: radius.pill, backgroundColor: CARTOON.track, overflow: "hidden" },
  fill: { height: 10, borderRadius: radius.pill },

  rules: { gap: space.xs, padding: space.md, borderRadius: radius.xl, backgroundColor: colors.surface2, borderWidth: hairline, borderColor: colors.border },
  rule: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 28 },
  ruleLabel: { ...type.body, color: colors.textPrimary, flex: 1 },
  ruleValue: { ...type.label, fontFamily: fonts.bold, color: colors.win },
  rulesFoot: { ...type.caption, color: colors.textSecondary, marginTop: space.xs },

  recent: { gap: space.sm },
  empty: { ...type.bodySm, color: colors.textSecondary },
  match: { gap: space.sm, padding: space.md, borderRadius: radius.xl, backgroundColor: colors.surface1, borderWidth: hairline, borderColor: colors.border },
  matchOff: { backgroundColor: colors.surface3 },
  matchHead: { flexDirection: "row", alignItems: "center", gap: space.sm },
  matchTexts: { flex: 1, gap: 1 },
  matchLabel: { ...type.h3, fontFamily: fonts.bold, color: colors.textPrimary },
  matchDate: { ...type.caption, color: colors.textSecondary },
  matchStars: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: space.sm, height: 30, borderRadius: radius.pill, backgroundColor: CARTOON.star },
  matchStarsOff: { backgroundColor: colors.surface2 },
  matchStarsText: { ...type.scoreXs, color: CARTOON.goldInk },
  matchStarsTextOff: { color: colors.textTertiary },
  parts: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
  part: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: space.sm, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: colors.brandDim },
  partText: { ...type.micro, fontFamily: fonts.bold, color: colors.brandAccent },
  matchOffText: { ...type.caption, color: colors.textSecondary },
});
