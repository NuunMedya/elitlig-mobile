/**
 * TAHMİN LİGİ BAŞLIĞI — saha zemininde sezon özeti.
 *
 * Koyu saha yeşili (`gradientPitch`, iki temada da koyu) üstünde ince tebeşir
 * çizgileri: orta saha çizgisi, orta yuvarlak ve iki ceza sahası. Oyun hissi
 * buradan gelir; içerik ise bir skor tablosu gibi sade: sezon puanı, sıra,
 * tam skor sayısı ve altında form çipleri (isabet, seri).
 *
 * Giriş yapılmamışsa aynı yüzey "nasıl oynanır" kartına dönüşür.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { memo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Line, Rect } from "react-native-svg";

import { Button } from "@/components/ui";
import { colors, radius, space, textScale, type, upperTR } from "@/theme";

import type { FormSummary } from "./shared";

export interface PredictionHeroProps {
  signedIn: boolean;
  onSignIn: () => void;
  season: { rank: number; points: number; exact: number } | null;
  totalPlayers: number | null;
  form: FormSummary | null;
  /** Sunucunun puan cetveli (`points`); yoksa varsayılanlar. */
  rules?: Record<string, number> | null;
}

const PITCH_TOP = { x: 0.5, y: 0 };
const PITCH_BOTTOM = { x: 0.5, y: 1 };

export const PredictionHero = memo(function PredictionHero({ signedIn, onSignIn, season, totalPlayers, form, rules }: PredictionHeroProps) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const r = (key: string, fallback: number) => (rules && typeof rules[key] === "number" ? rules[key] : fallback);
  const legend = `Tam skor ${r("exact", 5)} · Fark ${r("diff", 3)} · Sonuç ${r("result", 2)} · Golcü +${r("scorer", 3)}`;

  return (
    <View style={styles.wrap} onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      <LinearGradient colors={colors.gradientPitch} start={PITCH_TOP} end={PITCH_BOTTOM} style={StyleSheet.absoluteFill} />
      {size.w > 0 ? <PitchLines width={size.w} height={size.h} /> : null}

      <View style={styles.head}>
        <Text style={styles.overline} {...textScale.badge}>
          {upperTR("Tahmin Ligi · Sezon")}
        </Text>
        {signedIn && season ? (
          <View style={styles.rankPill} accessibilityLabel={`Sezon sıran ${season.rank}${totalPlayers ? `, ${totalPlayers} oyuncu` : ""}`}>
            <Ionicons name="podium-outline" size={12} color={colors.onPitch} />
            <Text style={styles.rankPillText} {...textScale.badge}>
              {`${season.rank}.${totalPlayers ? ` / ${totalPlayers}` : ""}`}
            </Text>
          </View>
        ) : null}
      </View>

      {signedIn ? (
        <>
          <View style={styles.stats}>
            <Stat label="Puan" value={season ? String(season.points) : "0"} big />
            <View style={styles.statRule} />
            <Stat label="Sıra" value={season ? `${season.rank}.` : "—"} />
            <View style={styles.statRule} />
            <Stat label="Tam skor" value={season ? String(season.exact) : "0"} />
          </View>
          {form && form.graded > 0 ? (
            <View style={styles.chips}>
              <FormChip icon="analytics-outline" label={`İsabet %${form.accuracy ?? 0}`} />
              <FormChip icon="flame-outline" label={form.streak > 0 ? `Seri ${form.streak}` : "Seri yok"} />
              <FormChip icon="time-outline" label={`Son ${form.graded}: +${form.points}`} />
            </View>
          ) : null}
        </>
      ) : (
        <View style={styles.guest}>
          <Text style={styles.guestTitle} {...textScale.long}>
            Skoru bil, puanı topla
          </Text>
          <Text style={styles.guestBody} {...textScale.long}>
            Gerçek maçlara skor tahmini yap; puanların Kariyer Modu'na XP olarak geçer.
          </Text>
          <Button label="Giriş yap" size="sm" onDark onPress={onSignIn} style={styles.guestButton} />
        </View>
      )}

      <View style={styles.legend}>
        <Text style={styles.legendText} numberOfLines={1} adjustsFontSizeToFit {...textScale.dense}>
          {legend}
        </Text>
      </View>
    </View>
  );
});

function Stat({ label, value, big = false }: { label: string; value: string; big?: boolean }) {
  return (
    <View style={styles.stat} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text style={big ? styles.statBig : styles.statValue} {...textScale.badge}>
        {value}
      </Text>
      <Text style={styles.statLabel} {...textScale.badge}>
        {upperTR(label)}
      </Text>
    </View>
  );
}

function FormChip({ icon, label }: { icon: keyof typeof Ionicons.glyphMap; label: string }) {
  return (
    <View style={styles.chip}>
      <Ionicons name={icon} size={12} color={colors.onPitch} />
      <Text style={styles.chipText} {...textScale.badge}>
        {label}
      </Text>
    </View>
  );
}

/** Tebeşir çizgileri — yatay saha: orta çizgi, orta yuvarlak, iki ceza sahası. */
function PitchLines({ width, height }: { width: number; height: number }) {
  const cx = width / 2;
  const cy = height / 2;
  const box = { w: Math.min(56, width * 0.14), h: height * 0.56 };
  const stroke = colors.chalk;
  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Rect x={10} y={10} width={width - 20} height={height - 20} rx={6} stroke={stroke} strokeWidth={1} fill="none" />
      <Line x1={cx} y1={10} x2={cx} y2={height - 10} stroke={stroke} strokeWidth={1} />
      <Circle cx={cx} cy={cy} r={Math.min(46, height * 0.26)} stroke={stroke} strokeWidth={1} fill="none" />
      <Circle cx={cx} cy={cy} r={2} fill={stroke} />
      <Rect x={10} y={cy - box.h / 2} width={box.w} height={box.h} stroke={stroke} strokeWidth={1} fill="none" />
      <Rect x={width - 10 - box.w} y={cy - box.h / 2} width={box.w} height={box.h} stroke={stroke} strokeWidth={1} fill="none" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: radius.xxl,
    overflow: "hidden",
    backgroundColor: colors.pitch,
    paddingHorizontal: space.xl,
    paddingTop: space.lg,
    paddingBottom: space.md,
    gap: space.md,
  },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  overline: { ...type.overline, color: colors.onDarkMuted },
  rankPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    paddingHorizontal: space.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.inkPill,
    borderWidth: 1,
    borderColor: colors.inkPillBorder,
  },
  rankPillText: { ...type.numSmStrong, color: colors.onPitch },
  stats: { flexDirection: "row", alignItems: "flex-end" },
  stat: { flex: 1, alignItems: "center", gap: 2 },
  statRule: { width: 1, height: 28, backgroundColor: colors.borderOnDark, marginBottom: space.s },
  statBig: { ...type.scoreHero, color: colors.onPitch },
  statValue: { ...type.scoreMd, color: colors.onPitch },
  statLabel: { ...type.overline, color: colors.onDarkMuted },
  chips: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: space.s },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.inkPill,
    borderWidth: 1,
    borderColor: colors.inkPillBorder,
  },
  chipText: { ...type.labelXs, color: colors.onPitch },
  guest: { alignItems: "center", gap: space.s, paddingVertical: space.xs },
  guestTitle: { ...type.h2, color: colors.onPitch, textAlign: "center" },
  guestBody: { ...type.bodySm, color: colors.onDarkMuted, textAlign: "center" },
  guestButton: { marginTop: space.xs, minWidth: 160, alignSelf: "center" },
  legend: { alignItems: "center", paddingTop: space.xs },
  legendText: { ...type.caption, color: colors.onDarkMuted },
});
