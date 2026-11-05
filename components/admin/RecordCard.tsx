/**
 * RecordCard / Panel / StatusBadge / StatRow — yönetim listelerinin görsel atomları.
 *
 * RecordCard: tek kayıt satırı-kartı. Solda ikon/monogram/avatar, ortada
 * başlık + alt metin + meta satırı, sağda rozetler ve (dokunulabilirse) ok.
 * Uzun basma ikinci eylem için (ActionSheet açmak gibi).
 *
 * Panel: başlıklı yüzey (bölüm kartı). Ayrıntı ekranlarında alanları gruplar.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { Avatar, Badge, Touchable, type Tone } from "@/components/ui";
import { colors, hairline, radius, space, textScale, type } from "@/theme";

export interface BadgeSpec {
  label: string;
  tone?: Tone;
  icon?: keyof typeof Ionicons.glyphMap;
}

export interface RecordCardProps {
  title: string;
  subtitle?: string | null;
  meta?: string | null;
  icon?: keyof typeof Ionicons.glyphMap;
  iconTone?: Tone;
  avatar?: { name?: string | null; image?: string | null };
  /** Solda renk şeridi (not/etkinlik rengi). */
  accentColor?: string | null;
  badges?: (BadgeSpec | null | false | undefined)[];
  /** Sağda büyük değer (tutar, puan). */
  value?: string | null;
  valueTone?: Tone;
  onPress?: () => void;
  onLongPress?: () => void;
  trailing?: React.ReactNode;
  children?: React.ReactNode;
  muted?: boolean;
  style?: StyleProp<ViewStyle>;
  numberOfLines?: number;
}

const TONE_FG: Record<Tone, string> = {
  neutral: colors.textSecondary,
  brand: colors.brandAccent,
  accent: colors.accentText,
  live: colors.live,
  win: colors.win,
  warn: colors.warn,
  danger: colors.danger,
  info: colors.info,
};

const TONE_BG: Record<Tone, string> = {
  neutral: colors.surface3,
  brand: colors.brandDim,
  accent: colors.accentDim,
  live: colors.liveDim,
  win: colors.winDim,
  warn: colors.warnDim,
  danger: colors.dangerDim,
  info: colors.infoDim,
};

export const RecordCard = React.memo(function RecordCard({
  title,
  subtitle,
  meta,
  icon,
  iconTone = "neutral",
  avatar,
  accentColor,
  badges,
  value,
  valueTone = "neutral",
  onPress,
  onLongPress,
  trailing,
  children,
  muted,
  style,
  numberOfLines = 2,
}: RecordCardProps) {
  const shownBadges = (badges ?? []).filter(Boolean) as BadgeSpec[];
  const body = (
    <>
      {accentColor ? <View style={[styles.accent, { backgroundColor: accentColor }]} /> : null}
      {avatar ? (
        <Avatar name={avatar.name} image={avatar.image} size={40} />
      ) : icon ? (
        <View style={[styles.icon, { backgroundColor: TONE_BG[iconTone] }]}>
          <Ionicons name={icon} size={18} color={TONE_FG[iconTone]} />
        </View>
      ) : null}
      <View style={styles.main}>
        <Text style={[styles.title, muted ? styles.muted : null]} numberOfLines={numberOfLines} {...textScale.dense}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={numberOfLines} {...textScale.dense}>
            {subtitle}
          </Text>
        ) : null}
        {meta ? (
          <Text style={styles.meta} numberOfLines={1} {...textScale.dense}>
            {meta}
          </Text>
        ) : null}
        {shownBadges.length ? (
          <View style={styles.badges}>
            {shownBadges.map((b) => (
              <Badge key={b.label} label={b.label} tone={b.tone ?? "neutral"} icon={b.icon} size="xs" />
            ))}
          </View>
        ) : null}
        {children}
      </View>
      {value ? (
        <Text style={[styles.value, { color: TONE_FG[valueTone] }]} numberOfLines={1} {...textScale.dense}>
          {value}
        </Text>
      ) : null}
      {trailing}
      {onPress && !trailing ? <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} /> : null}
    </>
  );

  if (!onPress && !onLongPress) return <View style={[styles.card, style]}>{body}</View>;
  return (
    <Touchable
      onPress={onPress}
      onLongPress={onLongPress}
      haptic="selection"
      style={[styles.card, style]}
      accessibilityRole="button"
      accessibilityLabel={[title, subtitle, meta, value].filter(Boolean).join(", ")}
    >
      {body}
    </Touchable>
  );
});

export function Panel({
  title,
  action,
  children,
  style,
  padded = true,
}: {
  title?: string;
  action?: { label: string; onPress: () => void };
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
}) {
  return (
    <View style={[styles.panel, padded ? styles.panelPadded : null, style]}>
      {title || action ? (
        <View style={[styles.panelHead, padded ? null : styles.panelHeadInset]}>
          {title ? (
            <Text style={styles.panelTitle} {...textScale.dense}>
              {title}
            </Text>
          ) : <View />}
          {action ? (
            <Touchable onPress={action.onPress} accessibilityRole="button">
              <Text style={styles.panelAction} {...textScale.dense}>
                {action.label}
              </Text>
            </Touchable>
          ) : null}
        </View>
      ) : null}
      {children}
    </View>
  );
}

/** Etiket–değer satırı (Panel içinde). */
export function InfoLine({ label, value, tone }: { label: string; value: React.ReactNode; tone?: Tone }) {
  return (
    <View style={styles.info}>
      <Text style={styles.infoLabel} {...textScale.dense}>
        {label}
      </Text>
      {typeof value === "string" || typeof value === "number" ? (
        <Text style={[styles.infoValue, tone ? { color: TONE_FG[tone] } : null]} {...textScale.dense} selectable>
          {value === "" ? "—" : value}
        </Text>
      ) : (
        value ?? <Text style={styles.infoValue}>—</Text>
      )}
    </View>
  );
}

/** Yatay sayaç şeridi: [{label, value, tone}] */
export function StatRow({
  items,
  style,
}: {
  items: { label: string; value: string | number; tone?: Tone; onPress?: () => void }[];
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.stats, style]}>
      {items.map((item, index) => {
        const content = (
          <>
            <Text style={[styles.statValue, item.tone ? { color: TONE_FG[item.tone] } : null]} numberOfLines={1} adjustsFontSizeToFit {...textScale.badge}>
              {item.value}
            </Text>
            <Text style={styles.statLabel} numberOfLines={2} {...textScale.badge}>
              {item.label}
            </Text>
          </>
        );
        const cellStyle = [styles.stat, index ? styles.statDivided : null];
        return item.onPress ? (
          <Touchable key={item.label} onPress={item.onPress} style={cellStyle} accessibilityRole="button">
            {content}
          </Touchable>
        ) : (
          <View key={item.label} style={cellStyle}>
            {content}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
    overflow: "hidden",
  },
  accent: { position: "absolute", left: 0, top: 0, bottom: 0, width: 4 },
  icon: { width: 36, height: 36, borderRadius: radius.sm, alignItems: "center", justifyContent: "center" },
  main: { flex: 1, gap: 2 },
  title: { ...type.h4, color: colors.textPrimary },
  muted: { color: colors.textTertiary },
  subtitle: { ...type.bodySm, color: colors.textSecondary },
  meta: { ...type.caption, color: colors.textTertiary },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: space.xs, marginTop: space.xs },
  value: { ...type.numSmStrong, maxWidth: 140 },
  panel: {
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
    gap: space.sm,
    overflow: "hidden",
  },
  panelPadded: { padding: space.lg },
  panelHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  panelHeadInset: { paddingHorizontal: space.lg, paddingTop: space.md },
  panelTitle: { ...type.overline, color: colors.textTertiary },
  panelAction: { ...type.label, color: colors.brandAccent },
  info: { flexDirection: "row", gap: space.md, paddingVertical: space.xs, alignItems: "flex-start" },
  infoLabel: { ...type.bodySm, color: colors.textTertiary, width: 120 },
  infoValue: { ...type.bodySm, color: colors.textPrimary, flex: 1 },
  stats: {
    flexDirection: "row",
    borderRadius: radius.lg,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
    paddingVertical: space.md,
  },
  stat: { flex: 1, alignItems: "center", gap: 2, paddingHorizontal: space.xs },
  statDivided: { borderLeftWidth: hairline, borderLeftColor: colors.separator },
  statValue: { ...type.metricSm, color: colors.textPrimary },
  statLabel: { ...type.micro, color: colors.textTertiary, textAlign: "center" },
});
