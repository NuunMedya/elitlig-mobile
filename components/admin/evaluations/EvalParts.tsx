/**
 * DEĞERLENDİRME SUNUM PARÇALARI — Genel bakış, formlar, karne ve
 * karşılaştırma ekranlarının ortak çizimi (yalnız sunum).
 *
 *   · areaIcon / areaTone   alan → ikon ve IconTile tonu
 *   · levelGradient         skor seviyesine göre degrade (çubuk ve halka)
 *   · ScoreDial             ProgressRing halka + seviye etiketi
 *   · TrendColumns          haftalık seyir: degrade dikey sütunlar, değeri
 *                           üstünde; son sütun imza degradesiyle vurgulu
 *   · RankCard              sıralama satırı: RankBadge · avatar · ad · alan
 *                           pulları · skor çubuğu · değişim
 *   · AreaDots              maçın alan durumları (dolu = değerlendirildi,
 *                           kırmızı = aksayan madde var)
 *   · DeltaPill             ▲/▼ değişim hapı (win/loss)
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import React, { memo } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { Avatar, GradientBar, IconTile, ProgressRing, RankBadge, Reveal, Touchable, type IconTileTone } from "@/components/ui";
import { AREA_ICONS, formatDelta, formatPct, scoreLevel, type EvalArea } from "@/lib/api/admin/evaluations";
import { colors, hairline, radius, space, textScale, type } from "@/theme";

import { toneFg } from "../system/SysKit";

const AREA_TONES: Record<string, IconTileTone> = {
  hakem: "gold",
  spiker: "violet",
  reji: "cyan",
  fotografci: "pink",
  saglikci: "mint",
  call_center: "neutral",
  sosyal_medya: "signature",
};

export const areaTone = (key: string): IconTileTone => AREA_TONES[key] ?? "violet";
export const areaIcon = (key: string): keyof typeof Ionicons.glyphMap =>
  ((AREA_ICONS[key] ?? "clipboard-outline").replace("-outline", "") as keyof typeof Ionicons.glyphMap);

/** Skor seviyesi → degrade (Zayıf kırmızı … Mükemmel nane). */
export function levelGradient(value: number | null | undefined): readonly [string, string] {
  const tone = scoreLevel(value).tone;
  if (tone === "win") return colors.tileTones.mint;
  if (tone === "info") return colors.gradientSignature;
  if (tone === "warn") return colors.tileTones.gold;
  if (tone === "danger") return colors.tileTones.red;
  return [colors.surface3, colors.surface3];
}

export function DeltaPill({ value, suffix = "", upIsGood = true }: { value: number | null | undefined; suffix?: string; upIsGood?: boolean }) {
  if (value == null || value === 0) return null;
  const good = upIsGood ? value > 0 : value < 0;
  const fg = good ? colors.win : colors.loss;
  return (
    <View style={[styles.delta, { backgroundColor: good ? colors.winDim : colors.lossDim }]}>
      <Ionicons name={value > 0 ? "caret-up" : "caret-down"} size={9} color={fg} />
      <Text style={[styles.deltaText, { color: fg }]} {...textScale.badge}>
        {formatDelta(Math.abs(value), suffix).replace(/^[+−-]/, "")}
      </Text>
    </View>
  );
}

export function ScoreDial({ value, size = 92, caption, onDark }: { value: number | null | undefined; size?: number; caption?: string; onDark?: boolean }) {
  const level = scoreLevel(value);
  const big = size >= 90;
  return (
    <View style={[styles.dial, { width: size, height: size }]} accessible accessibilityLabel={`${formatPct(value)} ${caption ?? level.label}`}>
      <ProgressRing value={Math.max(0, Math.min(1, (value ?? 0) / 100))} size={size} thickness={big ? 9 : 7} tone={level.tone === "neutral" ? "brand" : level.tone} />
      <View style={styles.dialCenter} pointerEvents="none">
        <Text style={[big ? styles.dialValue : styles.dialValueSm, { color: onDark ? colors.onDark : colors.textPrimary }]} numberOfLines={1} adjustsFontSizeToFit {...textScale.badge}>
          {formatPct(value)}
        </Text>
        <Text style={[styles.dialCaption, { color: onDark ? colors.onDarkMuted : colors.textTertiary }]} numberOfLines={1} {...textScale.badge}>
          {(caption ?? level.label).toLocaleUpperCase("tr-TR")}
        </Text>
      </View>
    </View>
  );
}

export function TrendColumns({ points, height = 120 }: { points: { label: string; value: number | null; count?: number }[]; height?: number }) {
  if (!points.length) return null;
  return (
    <View style={styles.cols} accessible accessibilityLabel={points.map((p) => `${p.label} ${formatPct(p.value)}`).join(", ")}>
      {points.map((p, i) => {
        const last = i === points.length - 1;
        const h = Math.max(4, ((p.value ?? 0) / 100) * height);
        return (
          <View key={`${p.label}-${i}`} style={styles.col}>
            <Text style={[styles.colValue, last ? { color: colors.textPrimary } : null]} numberOfLines={1} {...textScale.badge}>
              {p.value == null ? "—" : Math.round(p.value)}
            </Text>
            <View style={[styles.colTrack, { height }]}>
              <Reveal index={i}>
                <LinearGradient
                  colors={last ? colors.gradientSignature : levelGradient(p.value)}
                  start={{ x: 0, y: 1 }}
                  end={{ x: 0, y: 0 }}
                  style={[styles.colFill, { height: h, opacity: last ? 1 : 0.75 }]}
                />
              </Reveal>
            </View>
            <Text style={[styles.colLabel, last ? { color: colors.textPrimary } : null]} numberOfLines={1} {...textScale.badge}>
              {p.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

export const RankCard = memo(function RankCard({
  rank,
  name,
  areas,
  score,
  change,
  meta,
  onPress,
}: {
  rank: number;
  name: string;
  areas: { area: string; label: string }[];
  score: number | null;
  change: number | null;
  meta: string;
  onPress: () => void;
}) {
  const level = scoreLevel(score);
  return (
    <Touchable feedback="card" onPress={onPress} style={styles.rank} accessibilityRole="button" accessibilityLabel={`${rank}. ${name}, ${formatPct(score)}`}>
      <RankBadge rank={rank} size={26} />
      <Avatar name={name} size={40} />
      <View style={styles.flex}>
        <View style={styles.rankTop}>
          <Text style={styles.rankName} numberOfLines={1} {...textScale.dense}>
            {name}
          </Text>
          <DeltaPill value={change} />
        </View>
        <View style={styles.rankAreas}>
          {areas.map((a) => (
            <View key={a.area} style={styles.areaChip}>
              <Ionicons name={areaIcon(a.area)} size={10} color={colors.tileTones[areaTone(a.area)]?.[0] ?? colors.textSecondary} />
              <Text style={styles.areaChipText} {...textScale.badge}>
                {a.label}
              </Text>
            </View>
          ))}
          <Text style={styles.rankMeta} numberOfLines={1} {...textScale.dense}>
            {meta}
          </Text>
        </View>
        <GradientBar value={Math.max(0, Math.min(1, (score ?? 0) / 100))} height={5} gradient={levelGradient(score)} />
      </View>
      <View style={styles.rankScore}>
        <Text style={[styles.rankPct, { color: level.tone === "neutral" ? colors.textTertiary : toneFg(level.tone) }]} {...textScale.badge}>
          {formatPct(score)}
        </Text>
        <Text style={styles.rankLevel} {...textScale.badge}>
          {level.label}
        </Text>
      </View>
    </Touchable>
  );
});

export function AreaDots({ areas, done }: { areas: EvalArea[]; done: Record<string, { failCount: number } | undefined> }) {
  return (
    <View style={styles.dots}>
      {areas.map((a) => {
        const d = done[a.key];
        const fg = d ? (d.failCount ? colors.danger : colors.win) : colors.textTertiary;
        return (
          <View
            key={a.key}
            style={[styles.dotChip, d ? { backgroundColor: d.failCount ? colors.dangerDim : colors.winDim, borderColor: "transparent" } : null]}
            accessible
            accessibilityLabel={`${a.label}: ${d ? (d.failCount ? "aksayan madde var" : "değerlendirildi") : "bekliyor"}`}
          >
            <Ionicons name={areaIcon(a.key)} size={11} color={fg} />
          </View>
        );
      })}
    </View>
  );
}

/** Alan seçici: yatay kaydırılan alan karoları (ikon · ad · durum). */
export function AreaPicker({
  items,
  value,
  onChange,
}: {
  items: { key: string; label: string; status: string; tone: "win" | "warn" | "danger" | "neutral" }[];
  value: string | null;
  onChange: (key: string) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.picker}>
      {items.map((a) => {
        const on = a.key === value;
        return (
          <Touchable
            key={a.key}
            feedback="card"
            haptic="selection"
            onPress={() => onChange(a.key)}
            style={[styles.pick, on ? styles.pickOn : null]}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${a.label}, ${a.status}`}
          >
            {on ? <LinearGradient colors={colors.gradientSignature} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.pickRail} /> : null}
            <IconTile icon={areaIcon(a.key)} tone={a.tone === "neutral" && !on ? "neutral" : areaTone(a.key)} size={30} glow={on} />
            <Text style={[styles.pickLabel, on ? { color: colors.textPrimary } : null]} numberOfLines={1} {...textScale.dense}>
              {a.label}
            </Text>
            <View style={styles.pickStatus}>
              <View style={[styles.pickDot, { backgroundColor: a.tone === "neutral" ? colors.textTertiary : toneFg(a.tone) }]} />
              <Text style={styles.pickStatusText} numberOfLines={1} {...textScale.badge}>
                {a.status}
              </Text>
            </View>
          </Touchable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  picker: { gap: space.sm, paddingRight: space.lg },
  pick: { width: 92, alignItems: "center", gap: 4, paddingVertical: space.sm, paddingHorizontal: space.xs, borderRadius: radius.xl, backgroundColor: colors.surface1, borderWidth: hairline, borderColor: colors.border, overflow: "hidden" },
  pickOn: { backgroundColor: colors.brandDim, borderColor: colors.brand },
  pickRail: { position: "absolute", top: 0, left: 0, right: 0, height: 3 },
  pickLabel: { ...type.labelSm, color: colors.textSecondary },
  pickStatus: { flexDirection: "row", alignItems: "center", gap: 3 },
  pickDot: { width: 5, height: 5, borderRadius: 3 },
  pickStatusText: { ...type.nano, color: colors.textTertiary },
  flex: { flex: 1, minWidth: 0, gap: 4 },
  delta: { flexDirection: "row", alignItems: "center", gap: 2, paddingHorizontal: 5, paddingVertical: 1, borderRadius: radius.pill },
  deltaText: { ...type.nano },
  dial: { alignItems: "center", justifyContent: "center" },
  dialCenter: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", paddingHorizontal: 14 },
  dialValue: { ...type.scoreMd },
  dialValueSm: { ...type.scoreXs },
  dialCaption: { ...type.nano },

  cols: { flexDirection: "row", alignItems: "flex-end", gap: space.sm },
  col: { flex: 1, alignItems: "center", gap: 4 },
  colValue: { ...type.numSmStrong, color: colors.textSecondary },
  colTrack: { width: "100%", maxWidth: 34, justifyContent: "flex-end", borderRadius: radius.md, backgroundColor: colors.surface2, overflow: "hidden" },
  colFill: { width: "100%", borderRadius: radius.md },
  colLabel: { ...type.micro, color: colors.textTertiary },

  rank: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  rankTop: { flexDirection: "row", alignItems: "center", gap: space.xs },
  rankName: { ...type.h4, color: colors.textPrimary, flexShrink: 1 },
  rankAreas: { flexDirection: "row", alignItems: "center", gap: space.xs, flexWrap: "wrap" },
  areaChip: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 6, paddingVertical: 1, borderRadius: radius.pill, backgroundColor: colors.surface3 },
  areaChipText: { ...type.labelXs, color: colors.textSecondary },
  rankMeta: { ...type.caption, color: colors.textTertiary, flexShrink: 1 },
  rankScore: { alignItems: "flex-end", minWidth: 58 },
  rankPct: { ...type.scoreSm },
  rankLevel: { ...type.micro, color: colors.textTertiary },

  dots: { flexDirection: "row", gap: 4, flexWrap: "wrap" },
  dotChip: { width: 24, height: 24, borderRadius: 8, alignItems: "center", justifyContent: "center", borderWidth: hairline, borderColor: colors.border, backgroundColor: colors.surface2 },
});
