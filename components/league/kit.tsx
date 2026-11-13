/**
 * LİG KİTİ — Lig sekmesi bölmelerinin ve sıralama ekranlarının ortak küçük
 * yapı taşları (Gece teması, ikinci tur).
 *
 *   <StageCard>…</StageCard>          → mürekkep degradesi + sahne aurorası; özet bloğu
 *   <SignatureStripe />               → satırın solunda 3px imza degradesi (seçili / takip)
 *   <StatPill value="103" unit="gol"/>→ listede vurgulu istatistik değeri
 *   <ZoneKey items=[…] />             → puan tablosu bölge renk anahtarı (çip şeridi)
 *   <StageStat label value />         → sahne üstündeki küçük sayı hücresi
 *
 * NEDEN BURADA: ortak kit (`components/ui`) başka bir ajanın alanı; bu
 * parçalar yalnız Lig/sıralama ekranlarının dilidir. Renkler tokenlardan,
 * puntolar `type.*`tan gelir; sürekli döngü yok (aurora kitin kendi bileşeni).
 */

import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { Aurora, Odometer } from "@/components/ui";
import { colors, glowStyle, hairline, radius, space, textScale, type, upperTR } from "@/theme";

/* ═══════════════════════════════ SAHNE KARTI ═══════════════════════════════ */

/**
 * Özet bloğu zemini: `gradientInk` + `<Aurora variant="stage" />`. Üstündeki
 * metin daima `onDark` / `onDarkMuted` — iki temada da koyu sahne.
 */
export const StageCard = React.memo(function StageCard({
  children,
  style,
  testID,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  return (
    <View style={[styles.stage, style]} testID={testID}>
      <LinearGradient
        colors={colors.gradientInk}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <Aurora variant="stage" />
      {children}
    </View>
  );
});

/** Sahne üstünde küçük sayı hücresi: üstte versal etiket, altta dönen rakam. */
export const StageStat = React.memo(function StageStat({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string | number;
  accent?: boolean;
}) {
  return (
    <View style={styles.stageStat}>
      <Odometer value={value} style={[styles.stageStatValue, accent ? styles.stageStatAccent : null]} />
      <Text style={styles.stageStatLabel} numberOfLines={1} {...textScale.badge}>
        {upperTR(label)}
      </Text>
    </View>
  );
});

/* ═══════════════════════════════ İMZA ŞERİDİ ═══════════════════════════════ */

/** Satırın sol kenarında 3px imza degradesi — kullanıcının kendisi / takımı. */
export const SignatureStripe = React.memo(function SignatureStripe({ inset = 0 }: { inset?: number }) {
  return (
    <LinearGradient
      pointerEvents="none"
      colors={colors.gradientSignature}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      style={[styles.stripe, { top: inset, bottom: inset }]}
    />
  );
});

/* ═══════════════════════════════ DEĞER HAPI ═══════════════════════════════ */

export type StatPillTone = "brand" | "neutral" | "gold";

/**
 * Listede vurgulu istatistik değeri: rakam Archivo, birim küçük. Lider
 * satırında `gold`, seçili ölçütte `brand`, ikincil sütunda `neutral`.
 */
export const StatPill = React.memo(function StatPill({
  value,
  unit,
  tone = "brand",
  minWidth = 44,
}: {
  value: string;
  unit?: string;
  tone?: StatPillTone;
  minWidth?: number;
}) {
  return (
    <View
      style={[
        styles.pill,
        { minWidth },
        tone === "brand" ? styles.pillBrand : tone === "gold" ? styles.pillGold : styles.pillNeutral,
      ]}
    >
      <Text
        style={[
          styles.pillValue,
          tone === "brand" ? styles.pillValueBrand : tone === "gold" ? styles.pillValueGold : null,
        ]}
        numberOfLines={1}
        {...textScale.dense}
      >
        {value}
      </Text>
      {unit ? (
        <Text style={styles.pillUnit} numberOfLines={1} {...textScale.badge}>
          {unit}
        </Text>
      ) : null}
    </View>
  );
});

/* ═══════════════════════════════ BÖLGE ANAHTARI ═══════════════════════════════ */

export interface ZoneKeyItem {
  key: string;
  color: string;
  label: string;
  /** "1.", "2–3.", "338–339." */
  range?: string;
}

/** Puan tablosunun renk anahtarı — tablonun ÜSTÜNDE, tek satır çip şeridi. */
export const ZoneKey = React.memo(function ZoneKey({ items }: { items: ZoneKeyItem[] }) {
  if (items.length === 0) return null;
  return (
    <View style={styles.zoneKey} accessibilityRole="text" accessibilityLabel="Bölge renk anahtarı">
      {items.map((item) => (
        <View key={item.key} style={styles.zoneChip}>
          <View style={[styles.zoneSwatch, { backgroundColor: item.color }]} />
          <Text style={styles.zoneLabel} numberOfLines={2} {...textScale.dense}>
            {item.label}
            {item.range ? <Text style={styles.zoneRange}>{`  ${item.range}`}</Text> : null}
          </Text>
        </View>
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  stage: {
    borderRadius: radius.xxl,
    overflow: "hidden",
    borderWidth: hairline,
    borderColor: colors.borderOnDark,
    backgroundColor: colors.inkBlock,
    ...glowStyle(colors.glow, 1),
  },
  stageStat: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    gap: space.xxs,
  },
  stageStatValue: {
    ...type.metricSm,
    color: colors.onDark,
  },
  stageStatAccent: {
    color: colors.brandOnDark,
  },
  stageStatLabel: {
    ...type.overline,
    color: colors.onDarkMuted,
  },
  stripe: {
    position: "absolute",
    left: 0,
    width: 3,
    borderTopRightRadius: 3,
    borderBottomRightRadius: 3,
  },
  pill: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "center",
    gap: space.xxs,
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs + 1,
    borderRadius: radius.pill,
    borderWidth: hairline,
  },
  pillBrand: {
    backgroundColor: colors.brandDim,
    borderColor: colors.brandBorder,
  },
  pillGold: {
    backgroundColor: colors.warnDim,
    borderColor: colors.warnDim,
  },
  pillNeutral: {
    backgroundColor: colors.surface2,
    borderColor: colors.border,
  },
  pillValue: {
    ...type.scoreXs,
    color: colors.textPrimary,
  },
  pillValueBrand: {
    color: colors.brandAccent,
  },
  pillValueGold: {
    color: colors.textPrimary,
  },
  pillUnit: {
    ...type.meta,
    color: colors.textTertiary,
  },
  zoneKey: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.s,
  },
  zoneChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.s,
    paddingLeft: space.s,
    paddingRight: space.sm,
    paddingVertical: space.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
    maxWidth: "100%",
  },
  zoneSwatch: {
    width: 3,
    height: 12,
    borderRadius: 2,
  },
  zoneLabel: {
    ...type.labelXs,
    color: colors.textSecondary,
    flexShrink: 1,
  },
  zoneRange: {
    ...type.numSm,
    color: colors.textTertiary,
  },
});
