/**
 * KULÜP KİTİ — Kulübüm ve Takımım ikincil sayfalarının ortak küçük parçaları.
 *
 *   <InkStage>       koyu mor kimlik sahnesi (gradientInk + Aurora "stage")
 *   <StagePill>      sahne üstündeki cam hap (rol, lig, durum)
 *   <StageStats>     sahne altındaki cam şerit: etiket + dönen sayı (Odometer)
 *   <ListCard>       satır grubu kartı (kart içinde kart yok; satırlar ayraçlı)
 *   <ToneRow>        liste satırı: önde IconTile/görsel, başlık + meta, sonda değer
 *   <Delta>          ▲/▼ değişim metni (win/loss rengi)
 *   <SplitBar>       iki ya da daha çok parçalı oran çubuğu (gelir/gider, mevki)
 *
 * NEDEN AYRI DOSYA: aynı sahne/satır anatomisi Kulübüm, kasa, borsa, ilanlar
 * ve sponsorlarda tekrarlanıyor (bkz. docs/gece-temasi.md · Detay rehberi);
 * ortak kit (components/ui) bu tur değişmediği için yerel tutuldu.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { Aurora, IconTile, Odometer, Touchable, type IconTileTone, type Tone } from "@/components/ui";
import { formatDecimal } from "@/lib/format";
import { colors, fonts, hairline, radius, space, textScale, type, upperTR } from "@/theme";

type IconName = keyof typeof Ionicons.glyphMap;

/** Rozet tonu → degrade ikon kutusu tonu. */
export const TILE_TONE: Record<Tone, IconTileTone> = {
  neutral: "neutral",
  brand: "violet",
  accent: "cyan",
  live: "pink",
  win: "mint",
  warn: "gold",
  danger: "red",
  info: "cyan",
};

/** Bakiye eksiye düşebilir; kısa biçim: 12,4 B ₺ / 850 ₺. */
export function shortMoney(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const sign = value < 0 ? "−" : "";
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${sign}${formatDecimal(abs / 1_000_000, 1)} Mn ₺`;
  if (abs >= 1_000) return `${sign}${formatDecimal(abs / 1_000, 1)} B ₺`;
  return `${sign}${Math.round(abs)} ₺`;
}

/* ═══════════════════════════════ SAHNE ═══════════════════════════════ */

export function InkStage({
  children,
  style,
  onPress,
  accessibilityLabel,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  const body = (
    <>
      <LinearGradient colors={colors.gradientInk} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <Aurora variant="stage" style={StyleSheet.absoluteFill} />
      {children}
    </>
  );
  if (onPress) {
    return (
      <Touchable onPress={onPress} feedback="card" accessibilityRole="button" accessibilityLabel={accessibilityLabel} style={[styles.stage, style]}>
        {body}
      </Touchable>
    );
  }
  return <View style={[styles.stage, style]}>{body}</View>;
}

export function StagePill({ label, icon, tone = "brand" }: { label: string; icon?: IconName; tone?: "brand" | "muted" | "warn" | "win" | "danger" }) {
  const fg =
    tone === "brand" ? colors.brandOnDark : tone === "warn" ? colors.yellowCard : tone === "win" ? colors.win : tone === "danger" ? colors.liveOnDark : colors.onDarkMuted;
  return (
    <View style={[styles.pill, tone === "brand" ? styles.pillBrand : null]}>
      {icon ? <Ionicons name={icon} size={12} color={fg} /> : null}
      <Text style={[styles.pillText, { color: fg }]} numberOfLines={1} {...textScale.badge}>
        {upperTR(label)}
      </Text>
    </View>
  );
}

export interface StageStat {
  key: string;
  label: string;
  /** Dönen sayı (Odometer); rakam dışı karakterler sabit çizilir. */
  value: string | number;
  /** Sayının ardından küçük ek: "/14", "₺". */
  suffix?: string;
  color?: string;
  onPress?: () => void;
}

/** Sahne altı cam şerit — hücreler arasında saç teli ayraç. */
export function StageStats({ items, style }: { items: StageStat[]; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.stats, style]}>
      {items.map((item, index) => {
        const cell = (
          <>
            <Text style={styles.statLabel} numberOfLines={1} {...textScale.badge}>
              {upperTR(item.label)}
            </Text>
            <View style={styles.statValueRow}>
              <Odometer value={item.value} style={[styles.statValue, item.color ? { color: item.color } : null]} />
              {item.suffix ? (
                <Text style={styles.statSuffix} numberOfLines={1} {...textScale.badge}>
                  {item.suffix}
                </Text>
              ) : null}
            </View>
          </>
        );
        return (
          <React.Fragment key={item.key}>
            {index > 0 ? <View style={styles.statDivider} /> : null}
            {item.onPress ? (
              <Touchable
                onPress={item.onPress}
                feedback="row"
                style={styles.stat}
                accessibilityRole="button"
                accessibilityLabel={`${item.label} ${item.value}${item.suffix ?? ""}`}
              >
                {cell}
              </Touchable>
            ) : (
              <View style={styles.stat} accessible accessibilityLabel={`${item.label} ${item.value}${item.suffix ?? ""}`}>
                {cell}
              </View>
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
}

/* ═══════════════════════════════ LİSTE ═══════════════════════════════ */

export function ListCard({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.listCard, style]}>{children}</View>;
}

export interface ToneRowProps {
  icon?: IconName;
  tone?: IconTileTone;
  /** IconTile yerine özel görsel (Avatar, TeamLogo). */
  leading?: React.ReactNode;
  title: string;
  meta?: string | null;
  /** Sondaki sayı (Archivo, tablo hizalı). */
  value?: string | null;
  valueColor?: string;
  /** Sondaki rozet/düğme. */
  trailing?: React.ReactNode;
  /** Sol kenarda 3 px ton şeridi (seçili/acil satır). */
  stripe?: string;
  /** brandDim zemin + imza şerit (kendi takımı / seçili). */
  highlight?: boolean;
  onPress?: () => void;
  last?: boolean;
  accessibilityLabel?: string;
}

export const ToneRow = React.memo(function ToneRow({
  icon,
  tone = "neutral",
  leading,
  title,
  meta,
  value,
  valueColor,
  trailing,
  stripe,
  highlight,
  onPress,
  last,
  accessibilityLabel,
}: ToneRowProps) {
  const content = (
    <>
      {highlight ? (
        <LinearGradient colors={colors.gradientSignature} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={styles.stripe} />
      ) : stripe ? (
        <View style={[styles.stripe, { backgroundColor: stripe }]} />
      ) : null}
      {leading ?? (icon ? <IconTile icon={icon} tone={tone} size={38} glow={false} /> : null)}
      <View style={[styles.rowBody, !last && styles.rowDivider]}>
        <View style={styles.rowTexts}>
          <Text style={styles.rowTitle} numberOfLines={1} {...textScale.dense}>
            {title}
          </Text>
          {meta ? (
            <Text style={styles.rowMeta} numberOfLines={1} {...textScale.dense}>
              {meta}
            </Text>
          ) : null}
        </View>
        {value ? (
          <Text style={[styles.rowValue, valueColor ? { color: valueColor } : null]} numberOfLines={1} {...textScale.dense}>
            {value}
          </Text>
        ) : null}
        {trailing}
        {onPress ? <Ionicons name="chevron-forward" size={16} color={colors.textDisabled} /> : null}
      </View>
    </>
  );
  const label = accessibilityLabel ?? [title, meta, value].filter(Boolean).join(", ");
  if (onPress) {
    return (
      <Touchable
        onPress={onPress}
        feedback="row"
        haptic="selection"
        accessibilityRole="button"
        accessibilityLabel={label}
        style={[styles.row, highlight && styles.rowHighlight]}
      >
        {content}
      </Touchable>
    );
  }
  return (
    <View style={[styles.row, highlight && styles.rowHighlight]} accessible accessibilityLabel={label}>
      {content}
    </View>
  );
});

/* ═══════════════════════════════ SAYILAR ═══════════════════════════════ */

/** ▲ / ▼ değişim — pozitif `win`, negatif `loss`; sıfır nötr. */
export function Delta({ value, label, invert, style }: { value: number; label?: string; invert?: boolean; style?: StyleProp<ViewStyle> }) {
  const good = invert ? value < 0 : value > 0;
  const color = value === 0 ? colors.textTertiary : good ? colors.win : colors.loss;
  const arrow = value === 0 ? "•" : value > 0 ? "▲" : "▼";
  return (
    <View style={[styles.delta, style]}>
      <Text style={[styles.deltaText, { color }]} numberOfLines={1} {...textScale.badge}>
        {`${arrow} ${label ?? Math.abs(value)}`}
      </Text>
    </View>
  );
}

export interface SplitPart {
  key: string;
  value: number;
  color: string;
}

/** Parçalı oran çubuğu — toplam sıfırsa yalnız ray çizilir. */
export function SplitBar({ parts, height = 8, track, style }: { parts: SplitPart[]; height?: number; track?: string; style?: StyleProp<ViewStyle> }) {
  const total = parts.reduce((sum, part) => sum + Math.max(0, part.value), 0);
  return (
    <View style={[styles.split, { height, borderRadius: height / 2, backgroundColor: track ?? colors.surface3 }, style]}>
      {total > 0
        ? parts
            .filter((part) => part.value > 0)
            .map((part) => <View key={part.key} style={{ flex: part.value, backgroundColor: part.color }} />)
        : null}
    </View>
  );
}

/** Lejant hücresi: renk noktası + etiket + sayı. */
export function LegendItem({ color, label, value }: { color: string; label: string; value: string | number }) {
  return (
    <View style={styles.legend}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendLabel} numberOfLines={1} {...textScale.dense}>
        {label}
      </Text>
      <Text style={styles.legendValue} numberOfLines={1} {...textScale.badge}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: {
    borderRadius: radius.xxl,
    overflow: "hidden",
    backgroundColor: colors.inkBlock,
    padding: space.lg,
    gap: space.md,
    borderWidth: hairline,
    borderColor: colors.borderOnDark,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xxs,
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs,
    borderRadius: radius.pill,
    backgroundColor: colors.inkTile,
    borderWidth: hairline,
    borderColor: colors.inkTileBorder,
  },
  pillBrand: { backgroundColor: colors.inkPill, borderColor: colors.inkPillBorder },
  pillText: { ...type.micro },
  stats: {
    flexDirection: "row",
    borderRadius: radius.lg,
    backgroundColor: colors.inkTile,
    borderWidth: hairline,
    borderColor: colors.inkTileBorder,
  },
  stat: { flex: 1, gap: space.xxs, paddingVertical: space.sm, paddingHorizontal: space.sm },
  statDivider: { width: hairline, alignSelf: "stretch", backgroundColor: colors.borderOnDark },
  statLabel: { ...type.nano, color: colors.onDarkMuted },
  statValueRow: { flexDirection: "row", alignItems: "flex-end" },
  statValue: { ...type.scoreSm, color: colors.onDark },
  statSuffix: { ...type.numSm, color: colors.onDarkMuted, marginLeft: space.xxs, marginBottom: space.xxs },

  listCard: {
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
    overflow: "hidden",
  },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, paddingLeft: space.md, minHeight: 60 },
  rowHighlight: { backgroundColor: colors.brandDim },
  stripe: { position: "absolute", left: 0, top: 0, bottom: 0, width: 3 },
  rowBody: { flex: 1, flexDirection: "row", alignItems: "center", gap: space.sm, alignSelf: "stretch", paddingRight: space.md, paddingVertical: space.sm },
  rowDivider: { borderBottomWidth: hairline, borderBottomColor: colors.separator },
  rowTexts: { flex: 1, minWidth: 0, gap: space.xxs },
  rowTitle: { ...type.h4, color: colors.textPrimary },
  rowMeta: { ...type.caption, color: colors.textTertiary },
  rowValue: { ...type.tableNumStrong, color: colors.textPrimary },

  delta: { flexDirection: "row", alignItems: "center" },
  deltaText: { ...type.numSmStrong },

  split: { flexDirection: "row", overflow: "hidden", gap: space.xxs },
  legend: { flexDirection: "row", alignItems: "center", gap: space.xs, flexShrink: 1 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { ...type.caption, color: colors.textSecondary, flexShrink: 1 },
  legendValue: { ...type.numSmStrong, color: colors.textPrimary, fontFamily: fonts.bold },
});
