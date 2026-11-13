/**
 * RecordCard / Panel / StatusBadge / StatRow — yönetim listelerinin görsel atomları.
 *
 * RecordCard: tek kayıt satırı-kartı. Solda ikon/monogram/avatar, ortada
 * başlık + alt metin + meta satırı, sağda rozetler ve (dokunulabilirse) ok.
 * Uzun basma ikinci eylem için (ActionSheet açmak gibi).
 *
 * Panel: başlıklı yüzey (bölüm kartı). Ayrıntı ekranlarında alanları gruplar.
 *
 * YÖNETİM TASARIM DİLİ (kayıt satırı — ~90 aracın listesi bu anatomiyle okunur):
 *   · Önde 40 px degrade `IconTile` (rozet tonu → karo tonu: brand mor,
 *     accent/info camgöbeği, live pembe, win nane, warn altın, danger kırmızı),
 *     ya da `Avatar`. İkon verilmezse önde hiçbir şey durmaz.
 *   · Başlık `h4` (tek/iki satır) → alt metin `bodySm` ikincil → meta satırı
 *     `caption` üçüncül, saat ikonuyla. Durum hapları en altta (`Badge` soft).
 *   · Sağda değer (Archivo `metricSm`, ton renginde) ya da chevron; eylem
 *     düğmesi `trailing` ile gelir.
 *   · `accentColor`: solda 3 px yuvarlak uçlu şerit (kartın kimlik rengi).
 *   · `muted`: arşiv/pasif kayıt — başlık soluk, ikon gri.
 *   · Panel: radius xl kart; başlıkta degrade ray + versal `overline`, sağda
 *     "Eylem ›". InfoLine: etiket solda %38 sütun, değer sağda, aralarında
 *     ince ayraç. StatRow: cam karo şeridi, Archivo rakam + versal etiket.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { Avatar, Badge, IconTile, Touchable, type IconTileTone, type Tone } from "@/components/ui";
import { colors, hairline, radius, space, textScale, type, upperTR } from "@/theme";

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

/** Rozet tonu → IconTile degradesi (önde duran karo). */
const TONE_TILE: Record<Tone, IconTileTone> = {
  neutral: "neutral",
  brand: "violet",
  accent: "cyan",
  live: "pink",
  win: "mint",
  warn: "gold",
  danger: "red",
  info: "cyan",
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
        <IconTile icon={icon} tone={muted ? "neutral" : TONE_TILE[iconTone]} size={40} glow={false} />
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
          <View style={styles.metaRow}>
            <Ionicons name="time-outline" size={12} color={colors.textTertiary} />
            <Text style={styles.meta} numberOfLines={1} {...textScale.dense}>
              {meta}
            </Text>
          </View>
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
        <Text style={[styles.value, { color: valueTone === "neutral" ? colors.textPrimary : TONE_FG[valueTone] }]} numberOfLines={1} {...textScale.dense}>
          {value}
        </Text>
      ) : null}
      {trailing}
      {onPress && !trailing ? (
        <View style={styles.chevron}>
          <Ionicons name="chevron-forward" size={14} color={colors.textTertiary} />
        </View>
      ) : null}
    </>
  );

  if (!onPress && !onLongPress) return <View style={[styles.card, muted ? styles.cardMuted : null, style]}>{body}</View>;
  return (
    <Touchable
      feedback="card"
      onPress={onPress}
      onLongPress={onLongPress}
      haptic="selection"
      style={[styles.card, muted ? styles.cardMuted : null, style]}
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
            <View style={styles.panelTitleRow}>
              <LinearGradient colors={colors.gradientSignature} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={styles.panelRail} />
              <Text style={styles.panelTitle} numberOfLines={1} accessibilityRole="header" accessibilityLabel={title} {...textScale.dense}>
                {upperTR(title)}
              </Text>
            </View>
          ) : <View />}
          {action ? (
            <Touchable onPress={action.onPress} accessibilityRole="button" feedback="none" style={styles.panelActionBox}>
              <Text style={styles.panelAction} {...textScale.dense}>
                {action.label}
              </Text>
              <Ionicons name="chevron-forward" size={13} color={colors.brandAccent} />
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
    minHeight: 64,
    paddingVertical: space.md,
    paddingHorizontal: space.md,
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
    overflow: "hidden",
  },
  cardMuted: { backgroundColor: colors.surface2 },
  accent: { position: "absolute", left: 0, top: space.md, bottom: space.md, width: 3, borderTopRightRadius: radius.pill, borderBottomRightRadius: radius.pill },
  main: { flex: 1, gap: 3 },
  title: { ...type.h4, color: colors.textPrimary },
  muted: { color: colors.textTertiary },
  subtitle: { ...type.bodySm, color: colors.textSecondary },
  metaRow: { flexDirection: "row", alignItems: "center", gap: space.xs },
  meta: { ...type.caption, color: colors.textTertiary, flexShrink: 1 },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: space.xs, marginTop: space.xxs },
  value: { ...type.metricSm, maxWidth: 140, textAlign: "right" },
  chevron: {
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface2,
  },
  panel: {
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
    gap: space.md,
    overflow: "hidden",
  },
  panelPadded: { padding: space.lg },
  panelHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md },
  panelHeadInset: { paddingHorizontal: space.lg, paddingTop: space.md },
  panelTitleRow: { flexDirection: "row", alignItems: "center", gap: space.sm, flexShrink: 1 },
  panelRail: { width: 3, height: 13, borderRadius: radius.pill },
  panelTitle: { ...type.overline, color: colors.textSecondary, flexShrink: 1 },
  panelActionBox: { flexDirection: "row", alignItems: "center", gap: 2 },
  panelAction: { ...type.labelSm, color: colors.brandAccent },
  info: {
    flexDirection: "row",
    gap: space.md,
    paddingVertical: space.xs,
    alignItems: "flex-start",
  },
  infoLabel: { ...type.bodySm, color: colors.textTertiary, width: "38%" },
  infoValue: { ...type.bodySm, fontFamily: type.label.fontFamily, color: colors.textPrimary, flex: 1 },
  stats: {
    flexDirection: "row",
    gap: space.sm,
  },
  stat: {
    flex: 1,
    alignItems: "flex-start",
    gap: space.xxs,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  statDivided: {},
  statValue: { ...type.metricSm, color: colors.textPrimary },
  statLabel: { ...type.micro, color: colors.textTertiary },
});
