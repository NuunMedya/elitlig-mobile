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

/* ══════════════════════════════ STİLLER ══════════════════════════════ */

const styles = StyleSheet.create({
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
