/**
 * PROFİL KİTİ — takım ve oyuncu profillerinin ortak küçük yapı taşları.
 *
 * NEDEN BURADA (ortak kitte değil): ikinci turda takım ve oyuncu sayfaları
 * aynı "kimlik sahnesi" dilini konuşacak biçimde yeniden kuruldu; parçalar
 * yalnız bu iki alanda (teampage, playerpage, karşılaştırma ekranları)
 * kullanılıyor. Ortak kite (components/ui) taşınması gerekirse API'leri
 * oraya olduğu gibi geçebilir.
 *
 *   <HaloFrame size={84}>…</HaloFrame>   → degrade halkalı, parlayan çerçeve
 *   <StageStat value={97} label="PUAN" /> → sahnede Odometer'lı cam karo
 *   <FormCapsules form="GGBMG" />          → sahnede iri form kapsülleri
 *   <ResultPill result="W" text="3–1" />  → sonuç renginde skor hapı
 *   <MiniStat value="12" label="Maç" />   → kart içi küçük sayı hücresi
 *   <LeaderTile … />                       → istatistik lideri karosu
 *   <DuelBar label="Gol" a={70} b={33} />  → iki taraflı kıyas, kazanan vurgulu
 *   <DuelScore a={5} b={2} />              → kazanılan metrik sayısı (2 – 5)
 *
 * Hepsi renklerini temadan alır; hareket yalnız Odometer/Reveal üzerinden.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useMemo } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { Avatar, IconTile, Odometer, Touchable, type IconTileTone } from "@/components/ui";
import { colors, fonts, glowStyle, hairline, radius, space, textScale, type } from "@/theme";

/* ══════════════════════════════ HALO FRAME ══════════════════════════════ */

export interface HaloFrameProps {
  /** İçerik (arma/avatar) çapı. */
  size: number;
  /** Halka degradesi — verilmezse imza degradesi (mor → camgöbeği). */
  ring?: readonly [string, string];
  shape?: "circle" | "rounded";
  /** Halka kalınlığı ve halka ile içerik arası boşluk. */
  thickness?: number;
  gap?: number;
  /** Altındaki renkli ışık. */
  glow?: boolean;
  /** Boşluğun rengi — sahnede mürekkep, kâğıtta kart. */
  gapColor?: string;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

/** Kimlik görselinin halkası: degrade kenar + iç boşluk + parıltı. */
export const HaloFrame = React.memo(function HaloFrame({
  size,
  ring,
  shape = "circle",
  thickness = 3,
  gap = 3,
  glow = true,
  gapColor = colors.inkBlock,
  children,
  style,
}: HaloFrameProps) {
  const outer = size + (thickness + gap) * 2;
  const pair = ring ?? colors.gradientSignature;
  const outerRadius = shape === "circle" ? outer / 2 : Math.round(outer * 0.3);
  const innerRadius = shape === "circle" ? (outer - thickness * 2) / 2 : Math.max(0, outerRadius - thickness);
  return (
    <View
      style={[
        { width: outer, height: outer, borderRadius: outerRadius },
        glow ? glowStyle(pair[0], 2) : null,
        style,
      ]}
    >
      <LinearGradient
        colors={pair}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[StyleSheet.absoluteFill, { borderRadius: outerRadius }]}
      />
      <View
        style={[
          styles.haloInner,
          { margin: thickness, borderRadius: innerRadius, backgroundColor: gapColor },
        ]}
      >
        {children}
      </View>
    </View>
  );
});

/* ══════════════════════════════ STAGE STAT ══════════════════════════════ */

export interface StageStatProps {
  value: number | string;
  label: string;
  /** Rakam rengi — verilmezse beyaz. */
  color?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  /** Sayı ön eki/son eki (Odometer dışında sabit çizilir). */
  suffix?: string;
  style?: StyleProp<ViewStyle>;
  /** Vurgulu karo: üstte degrade ışık çizgisi. */
  highlight?: boolean;
}

/** Sahnede tek sayı: cam karo, Odometer ile dönen rakam, altında etiket. */
export const StageStat = React.memo(function StageStat({
  value,
  label,
  color,
  icon,
  suffix,
  style,
  highlight = false,
}: StageStatProps) {
  return (
    <View
      style={[styles.stageStat, style]}
      accessible
      accessibilityLabel={`${label.toLocaleLowerCase("tr-TR")} ${value}${suffix ?? ""}`}
    >
      {highlight ? (
        <LinearGradient
          colors={colors.gradientSignature}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.stageBeam}
        />
      ) : null}
      <View style={styles.stageValueRow}>
        <Odometer value={value} style={[styles.stageValue, color ? { color } : null]} />
        {suffix ? (
          <Text style={[styles.stageSuffix, color ? { color } : null]} {...textScale.badge}>
            {suffix}
          </Text>
        ) : null}
      </View>
      <View style={styles.stageLabelRow}>
        {icon ? <Ionicons name={icon} size={10} color={colors.onDarkMuted} /> : null}
        <Text style={styles.stageLabel} numberOfLines={1} {...textScale.badge}>
          {label}
        </Text>
      </View>
    </View>
  );
});

/* ══════════════════════════════ FORM CAPSULES ══════════════════════════════ */

export type KitResult = "W" | "D" | "L";

const LETTER: Record<KitResult, string> = { W: "G", D: "B", L: "M" };
const SPEECH: Record<KitResult, string> = { W: "Galibiyet", D: "Beraberlik", L: "Mağlubiyet" };

export function resultColor(result: KitResult | null | undefined): string {
  return result === "W" ? colors.win : result === "D" ? colors.draw : result === "L" ? colors.loss : colors.surface3;
}

export function resultDim(result: KitResult | null | undefined): string {
  return result === "W" ? colors.winDim : result === "D" ? colors.drawDim : result === "L" ? colors.lossDim : colors.surface3;
}

/** "WDL", "GBM", küçük harf — hepsi okunur. */
export function parseForm(raw: string | KitResult[] | null | undefined): KitResult[] {
  const list = Array.isArray(raw) ? raw : String(raw ?? "").split("");
  const out: KitResult[] = [];
  for (const ch of list) {
    const c = String(ch).trim().toLocaleUpperCase("tr-TR");
    if (c === "W" || c === "G") out.push("W");
    else if (c === "D" || c === "B" || c === "E") out.push("D");
    else if (c === "L" || c === "M" || c === "K") out.push("L");
  }
  return out;
}

export interface FormCapsulesProps {
  form: string | KitResult[];
  limit?: number;
}

/**
 * Sahnedeki form: soldan sağa eskiden yeniye, en yeni kapsül daha geniş ve
 * parlak. Harf daima yazılır — renk tek başına anlam taşımaz.
 */
export const FormCapsules = React.memo(function FormCapsules({ form, limit = 5 }: FormCapsulesProps) {
  const items = useMemo(() => parseForm(form).slice(-limit), [form, limit]);
  if (!items.length) return null;
  return (
    <View
      style={styles.capsRow}
      accessible
      accessibilityLabel={`Son ${items.length} maç: ${items.map((r) => SPEECH[r]).join(", ")}`}
    >
      {items.map((result, index) => {
        const last = index === items.length - 1;
        return (
          <View
            key={index}
            style={[
              styles.capsule,
              { backgroundColor: resultColor(result) },
              last ? [styles.capsuleLast, glowStyle(resultColor(result), 1)] : null,
            ]}
          >
            <Text style={styles.capsuleText} {...textScale.badge}>
              {LETTER[result]}
            </Text>
          </View>
        );
      })}
    </View>
  );
});

/* ══════════════════════════════ RESULT PILL ══════════════════════════════ */

export interface ResultPillProps {
  result: KitResult | null;
  text: string;
  size?: "sm" | "md";
  /** soft: açık zemin + renkli metin; solid: dolu zemin. */
  variant?: "soft" | "solid";
  style?: StyleProp<ViewStyle>;
}

export const ResultPill = React.memo(function ResultPill({
  result,
  text,
  size = "md",
  variant = "solid",
  style,
}: ResultPillProps) {
  const solid = variant === "solid" && result != null;
  return (
    <View
      style={[
        styles.pill,
        size === "sm" ? styles.pillSm : styles.pillMd,
        { backgroundColor: solid ? resultColor(result) : resultDim(result) },
        style,
      ]}
    >
      <Text
        style={[
          size === "sm" ? styles.pillTextSm : styles.pillTextMd,
          { color: solid ? colors.textOnStatus : result ? resultColor(result) : colors.textSecondary },
        ]}
        numberOfLines={1}
        {...textScale.badge}
      >
        {text}
      </Text>
    </View>
  );
});

/* ══════════════════════════════ MINI STAT ══════════════════════════════ */

export interface MiniStatProps {
  value: string | number;
  label: string;
  color?: string;
  /** Rakam Odometer ile dönsün. */
  roll?: boolean;
  align?: "center" | "left";
  style?: StyleProp<ViewStyle>;
}

/** Kart içi sayı hücresi — büyük rakam, altında küçük büyük-harf etiket. */
export const MiniStat = React.memo(function MiniStat({
  value,
  label,
  color,
  roll = false,
  align = "center",
  style,
}: MiniStatProps) {
  return (
    <View
      style={[styles.mini, align === "left" ? styles.miniLeft : null, style]}
      accessible
      accessibilityLabel={`${label} ${value}`}
    >
      {roll ? (
        <Odometer value={value} style={[styles.miniValue, color ? { color } : null]} />
      ) : (
        <Text style={[styles.miniValue, color ? { color } : null]} numberOfLines={1} {...textScale.dense}>
          {value}
        </Text>
      )}
      <Text style={styles.miniLabel} numberOfLines={1} {...textScale.badge}>
        {label.toLocaleUpperCase("tr-TR")}
      </Text>
    </View>
  );
});

/* ══════════════════════════════ LEADER TILE ══════════════════════════════ */

export interface LeaderTileProps {
  icon: keyof typeof Ionicons.glyphMap;
  tone: IconTileTone;
  category: string;
  name: string;
  image: string | null;
  value: number | string;
  unit?: string;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

/** İstatistik lideri: kategori ikonu, oyuncu, dev rakam. */
export const LeaderTile = React.memo(function LeaderTile({
  icon,
  tone,
  category,
  name,
  image,
  value,
  unit,
  onPress,
  style,
}: LeaderTileProps) {
  return (
    <Touchable
      feedback="card"
      haptic="selection"
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityLabel={`${category} lideri ${name}, ${value} ${unit ?? ""}`}
      style={[styles.leader, style]}
    >
      <View style={styles.leaderHead}>
        <IconTile icon={icon} tone={tone} size={28} glow={false} />
        <Text style={styles.leaderCategory} numberOfLines={1} {...textScale.badge}>
          {category.toLocaleUpperCase("tr-TR")}
        </Text>
      </View>
      <View style={styles.leaderValueRow}>
        <Odometer value={value} style={styles.leaderValue} />
        {unit ? (
          <Text style={styles.leaderUnit} {...textScale.badge}>
            {unit}
          </Text>
        ) : null}
      </View>
      <View style={styles.leaderPerson}>
        <Avatar name={name} image={image} size={22} />
        <Text style={styles.leaderName} numberOfLines={2} {...textScale.dense}>
          {name}
        </Text>
      </View>
    </Touchable>
  );
});

/* ══════════════════════════════ DUEL BAR ══════════════════════════════ */

/** Kıyas tarafları: A camgöbeği (veri), B mor (marka) — ikisi de "eşit" renk. */
export const DUEL_A = colors.accent;
export const DUEL_B = colors.brand;
const DUEL_A_TEXT = colors.accentText;
const DUEL_B_TEXT = colors.brandAccent;

export type DuelWinner = "a" | "b" | "tie" | null;

/** Kazanan taraf — `lowerIsBetter` kartlar gibi metrikler içindir. */
export function duelWinner(a: number, b: number, lowerIsBetter = false): DuelWinner {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  if (a === b) return "tie";
  return (a > b) !== lowerIsBetter ? "a" : "b";
}

function duelText(value: number, unit?: string): string {
  if (!Number.isFinite(value)) return "—";
  const text = Number.isInteger(value) ? String(value) : value.toFixed(1).replace(".", ",");
  return unit ? `${text}${unit}` : text;
}

export interface DuelBarProps {
  label: string;
  a: number;
  b: number;
  unit?: string;
  /** Küçük değer kazanır (kart, yenilen gol). */
  lowerIsBetter?: boolean;
  /** Bir tarafın verisi yok — iki taraf sönük, kazanan işaretlenmez. */
  neutral?: boolean;
}

/**
 * İKİ TARAFLI KIYAS SATIRI: değerler iki uçta, başlık ortada; iki yarım ray
 * merkezden dışa dolar. Kazanan tarafın değeri kendi renginde dolu hapta,
 * çubuğu tam renkte; kaybeden sönük. Beraberlikte iki taraf da nötr.
 */
export const DuelBar = React.memo(function DuelBar({ label, a, b, unit, lowerIsBetter = false, neutral = false }: DuelBarProps) {
  const winner = neutral ? null : duelWinner(a, b, lowerIsBetter);
  const total = Math.max(0, a) + Math.max(0, b);
  const shareA = total > 0 ? Math.max(0, a) / total : 0;
  const shareB = total > 0 ? Math.max(0, b) / total : 0;
  return (
    <View
      style={styles.duel}
      accessible
      accessibilityLabel={`${label}: ${duelText(a, unit)} – ${duelText(b, unit)}${
        winner === "a" ? ", sol taraf önde" : winner === "b" ? ", sağ taraf önde" : winner === "tie" ? ", eşit" : ""
      }`}
    >
      <View style={styles.duelHead}>
        <View style={[styles.duelValueBox, winner === "a" ? { backgroundColor: DUEL_A } : null]}>
          <Text
            style={[styles.duelValue, winner === "a" ? styles.duelValueWin : winner === "b" ? styles.duelValueLose : null]}
            numberOfLines={1}
            {...textScale.dense}
          >
            {duelText(a, unit)}
          </Text>
        </View>
        <Text style={styles.duelLabel} numberOfLines={1} {...textScale.dense}>
          {label}
        </Text>
        <View style={[styles.duelValueBox, styles.duelValueBoxRight, winner === "b" ? { backgroundColor: DUEL_B } : null]}>
          <Text
            style={[
              styles.duelValue,
              winner === "b" ? styles.duelValueWinB : winner === "a" ? styles.duelValueLose : null,
            ]}
            numberOfLines={1}
            {...textScale.dense}
          >
            {duelText(b, unit)}
          </Text>
        </View>
      </View>
      <View style={styles.duelTrack}>
        <View style={[styles.duelHalf, styles.duelHalfLeft]}>
          <View
            style={[
              styles.duelFill,
              {
                width: `${Math.round(shareA * 100)}%`,
                backgroundColor: neutral ? colors.slateSoft : DUEL_A,
                opacity: winner === "b" ? 0.4 : 1,
              },
            ]}
          />
        </View>
        <View style={styles.duelHalf}>
          <View
            style={[
              styles.duelFill,
              {
                width: `${Math.round(shareB * 100)}%`,
                backgroundColor: neutral ? colors.slateSoft : DUEL_B,
                opacity: winner === "a" ? 0.4 : 1,
              },
            ]}
          />
        </View>
      </View>
    </View>
  );
});

/* ══════════════════════════════ DUEL SCORE ══════════════════════════════ */

export interface DuelScoreProps {
  /** Her tarafın kazandığı metrik sayısı. */
  a: number;
  b: number;
  /** Koyu sahne üstünde mi (beyaz metin). */
  onDark?: boolean;
  caption?: string;
}

/** Kıyasın skor tabelası: "5 – 2", kazanan tarafın sayısı kendi renginde. */
export const DuelScore = React.memo(function DuelScore({ a, b, onDark = false, caption = "kazanılan metrik" }: DuelScoreProps) {
  const base = onDark ? colors.onDark : colors.textPrimary;
  const muted = onDark ? colors.onDarkMuted : colors.textTertiary;
  return (
    <View style={styles.duelScore} accessible accessibilityLabel={`Kazanılan metrik: sol ${a}, sağ ${b}`}>
      <View style={styles.duelScoreRow}>
        <Odometer value={a} style={[styles.duelScoreNum, { color: a > b ? (onDark ? colors.accent : DUEL_A_TEXT) : base }]} />
        <Text style={[styles.duelScoreDash, { color: muted }]} {...textScale.badge}>
          –
        </Text>
        <Odometer value={b} style={[styles.duelScoreNum, { color: b > a ? (onDark ? colors.brandOnDark : DUEL_B_TEXT) : base }]} />
      </View>
      <Text style={[styles.duelScoreCaption, { color: muted }]} numberOfLines={1} {...textScale.badge}>
        {caption.toLocaleUpperCase("tr-TR")}
      </Text>
    </View>
  );
});

/* ══════════════════════════════ STİLLER ══════════════════════════════ */

const styles = StyleSheet.create({
  duel: {
    gap: space.s,
    paddingVertical: space.s,
  },
  duelHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  duelValueBox: {
    minWidth: 48,
    paddingHorizontal: space.sm,
    height: 26,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "flex-start",
  },
  duelValueBoxRight: {
    alignSelf: "flex-end",
  },
  duelValue: {
    ...type.tableNumStrong,
    color: colors.textPrimary,
  },
  duelValueWin: {
    color: colors.textOnAccent,
  },
  duelValueWinB: {
    color: colors.textOnBrand,
  },
  duelValueLose: {
    color: colors.textTertiary,
  },
  duelLabel: {
    ...type.labelSm,
    color: colors.textSecondary,
    flex: 1,
    textAlign: "center",
  },
  duelTrack: {
    flexDirection: "row",
    gap: space.xs,
  },
  duelHalf: {
    flex: 1,
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surface3,
    overflow: "hidden",
    flexDirection: "row",
  },
  duelHalfLeft: {
    flexDirection: "row-reverse",
  },
  duelFill: {
    height: 6,
    borderRadius: radius.pill,
  },
  duelScore: {
    alignItems: "center",
    gap: space.xxs,
  },
  duelScoreRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.s,
  },
  duelScoreNum: {
    ...type.scoreLg,
  },
  duelScoreDash: {
    ...type.scoreMd,
  },
  duelScoreCaption: {
    ...type.overline,
  },

  haloInner: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },

  stageStat: {
    flex: 1,
    alignItems: "center",
    gap: space.xxs,
    paddingTop: space.m,
    paddingBottom: space.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.inkTile,
    borderWidth: hairline,
    borderColor: colors.inkTileBorder,
    overflow: "hidden",
  },
  stageBeam: {
    position: "absolute",
    top: 0,
    left: space.md,
    right: space.md,
    height: 2,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 2,
  },
  stageValueRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  stageValue: {
    ...type.metricSm,
    color: colors.onDark,
  },
  stageSuffix: {
    ...type.metricSm,
    color: colors.onDark,
  },
  stageLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xxs,
  },
  stageLabel: {
    ...type.overline,
    color: colors.onDarkMuted,
  },

  capsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
  },
  capsule: {
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  capsuleLast: {
    width: 34,
  },
  capsuleText: {
    ...type.nano,
    fontFamily: fonts.bold,
    color: colors.textOnStatus,
  },

  pill: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
  },
  pillSm: {
    minWidth: 40,
    height: 20,
    paddingHorizontal: space.s,
  },
  pillMd: {
    minWidth: 50,
    height: 26,
    paddingHorizontal: space.sm,
  },
  pillTextSm: {
    ...type.numSmStrong,
  },
  pillTextMd: {
    ...type.tableNumStrong,
  },

  mini: {
    flex: 1,
    alignItems: "center",
    gap: space.xxs,
  },
  miniLeft: {
    alignItems: "flex-start",
  },
  miniValue: {
    ...type.metricSm,
    color: colors.textPrimary,
  },
  miniLabel: {
    ...type.overline,
    color: colors.textTertiary,
  },

  leader: {
    flex: 1,
    minWidth: 0,
    padding: space.md,
    gap: space.sm,
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  leaderHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.s,
  },
  leaderCategory: {
    ...type.overline,
    color: colors.textTertiary,
    flexShrink: 1,
  },
  leaderValueRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: space.xxs,
  },
  leaderValue: {
    ...type.scoreLg,
    color: colors.textPrimary,
  },
  leaderUnit: {
    ...type.caption,
    color: colors.textTertiary,
    marginBottom: space.xs,
  },
  leaderPerson: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space.s,
  },
  leaderName: {
    ...type.labelXs,
    color: colors.textSecondary,
    flexShrink: 1,
  },
});
