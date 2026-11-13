/**
 * ARAÇ KİTİ — çalışma araçlarının (muhasebe, projeler, ajanda, rehber, tablolar,
 * not defteri, odak, hesap araçları, takım finansı) ortak görsel parçaları.
 * Yalnız bu alanda kullanılır; ortak yönetim kabuğu `components/admin/*`,
 * uygulama başlığı `ToolApp.tsx`'tir.
 *
 *   ToolStage    ekranın kimlik/özet sahnesi: gece laciverti degrade + Aurora,
 *                versal üst etiket, dönen büyük rakam (Odometer), altında
 *                artış/azalış hapları ve cam sayaç şeridi.
 *   StageChip    sahne üstündeki küçük hap (▲ gelir, ▼ gider, durum).
 *   Lines        tek kart içinde satırlar + iç ayraç (kart içinde kart yok).
 *   LineRow      liste satırı anatomisi: 40 px IconTile/Avatar · başlık h4 ·
 *                meta · sağda Archivo değer / rozet / chevron; seçili satırda
 *                brandDim zemin + solda 3 px imza şeridi.
 *   Delta        ▲/▼ yüzde ya da tutar farkı (win/loss renginde, metinle).
 *   TileButton   ızgara karosu: IconTile + başlık + kısa açıklama (+ rozet).
 *   categoryVisual  muhasebe kategorisi → ikon + IconTile tonu.
 *
 * HAREKET: Odometer (yaylı sayaç) ve çağıranın `Reveal`i; döngü yok (Aurora
 * kendi izinli bileşenidir).
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { Aurora, Avatar, Badge, IconTile, Odometer, Touchable, type IconTileTone, type Tone } from "@/components/ui";
import { colors, hairline, radius, space, textScale, type, upperTR } from "@/theme";

type IconName = keyof typeof Ionicons.glyphMap;

/* ═══════════════════════════════ SAHNE ═══════════════════════════════ */

export interface StageStat {
  label: string;
  value: string | number;
  tone?: "win" | "danger" | "warn" | "accent";
  onPress?: () => void;
}

/* Sahne iki temada da koyudur: tonlar temadan bağımsız parlak karo
   renklerinden (tileTones) gelir, açık temada da lacivert üstünde okunur. */
export const STAGE_TONE = {
  win: colors.tileTones.mint[0],
  danger: colors.tileTones.red[0],
  warn: colors.tileTones.gold[0],
  accent: colors.tileTones.cyan[0],
} as const;

export function ToolStage({
  icon,
  tone = "signature",
  overline,
  value,
  valueTone,
  caption,
  chips,
  stats,
  children,
  style,
  onPress,
  accessibilityLabel,
}: {
  icon?: IconName;
  tone?: IconTileTone;
  overline: string;
  /** Büyük rakam: sayı ya da biçimli metin ("48.250 ₺"); haneler döner. */
  value: string | number;
  valueTone?: "win" | "danger";
  caption?: string | null;
  chips?: React.ReactNode;
  stats?: StageStat[];
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  const body = (
    <>
      <LinearGradient colors={colors.gradientAdminStage} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} pointerEvents="none" />
      <Aurora variant="stage" />
      <View style={k.stageHead}>
        <View style={k.flex}>
          <Text style={k.stageOverline} numberOfLines={1} {...textScale.badge}>
            {upperTR(overline)}
          </Text>
          <Odometer value={value} style={[k.stageValue, valueTone ? { color: STAGE_TONE[valueTone] } : null]} />
          {caption ? (
            <Text style={k.stageCaption} numberOfLines={2} {...textScale.dense}>
              {caption}
            </Text>
          ) : null}
        </View>
        {icon ? <IconTile icon={icon} tone={tone} size={44} /> : null}
      </View>
      {chips ? <View style={k.stageChips}>{chips}</View> : null}
      {stats?.length ? <StageStats stats={stats} /> : null}
      {children}
    </>
  );
  if (onPress) {
    return (
      <Touchable feedback="card" onPress={onPress} style={[k.stage, style]} accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? `${overline}: ${value}`}>
        {body}
      </Touchable>
    );
  }
  return (
    <View style={[k.stage, style]} accessible={false}>
      {body}
    </View>
  );
}

/** Sahne altındaki cam sayaç şeridi (ToolStage içinde ya da tek başına koyu blokta). */
export function StageStats({ stats }: { stats: StageStat[] }) {
  return (
    <View style={k.stageStats}>
      {stats.map((s, i) => {
        const color = s.tone ? STAGE_TONE[s.tone] : colors.onDark;
        const inner = (
          <>
            {typeof s.value === "number" ? (
              <Odometer value={s.value} style={[k.stageStatValue, { color }]} />
            ) : (
              <Text style={[k.stageStatValue, { color }]} numberOfLines={1} adjustsFontSizeToFit {...textScale.badge}>
                {s.value}
              </Text>
            )}
            <Text style={k.stageStatLabel} numberOfLines={1} {...textScale.badge}>
              {upperTR(s.label)}
            </Text>
          </>
        );
        return s.onPress ? (
          <Touchable
            key={s.label}
            feedback="chip"
            onPress={s.onPress}
            style={[k.stageStat, i ? k.stageStatDivided : null]}
            accessibilityRole="button"
            accessibilityLabel={`${s.label}: ${s.value}`}
          >
            {inner}
          </Touchable>
        ) : (
          <View key={s.label} style={[k.stageStat, i ? k.stageStatDivided : null]} accessible accessibilityLabel={`${s.label}: ${s.value}`}>
            {inner}
          </View>
        );
      })}
    </View>
  );
}

/** Koyu sahne üstünde küçük hap. */
export function StageChip({ label, icon, tone = "plain" }: { label: string; icon?: IconName; tone?: "plain" | "win" | "danger" | "warn" | "accent" }) {
  const fg = tone === "plain" ? colors.onDark : STAGE_TONE[tone];
  return (
    <View style={k.stageChip}>
      {icon ? <Ionicons name={icon} size={12} color={fg} /> : <View style={[k.stageChipDot, { backgroundColor: fg }]} />}
      <Text style={[k.stageChipText, { color: fg }]} numberOfLines={1} {...textScale.badge}>
        {label}
      </Text>
    </View>
  );
}

/* ═══════════════════════════════ SATIRLAR ═══════════════════════════════ */

/** Tek kart; çocuklar arasına iç ayraç koyar (null çocuklar atlanır). */
export function Lines({ children, style, inset = 66 }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; inset?: number }) {
  const items = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={[k.lines, style]}>
      {items.map((child, i) => (
        <React.Fragment key={i}>
          {i ? <View style={[k.divider, { marginLeft: inset }]} /> : null}
          {child}
        </React.Fragment>
      ))}
    </View>
  );
}

const VALUE_TONE: Record<Tone, string> = {
  neutral: colors.textPrimary,
  brand: colors.brandAccent,
  accent: colors.accentText,
  live: colors.live,
  win: colors.win,
  warn: colors.warn,
  danger: colors.danger,
  info: colors.info,
};

export function LineRow({
  icon,
  tone = "violet",
  avatar,
  leading,
  title,
  sub,
  meta,
  metaIcon,
  value,
  valueTone = "neutral",
  valueSub,
  badge,
  chevron,
  trailing,
  selected,
  stripe,
  muted,
  onPress,
  onLongPress,
  accessibilityLabel,
  children,
}: {
  icon?: IconName;
  tone?: IconTileTone;
  avatar?: { name?: string | null; image?: string | null };
  leading?: React.ReactNode;
  title: string;
  sub?: string | null;
  meta?: string | null;
  metaIcon?: IconName;
  value?: string | null;
  valueTone?: Tone;
  valueSub?: string | null;
  badge?: { label: string; tone?: Tone; icon?: IconName } | null;
  chevron?: boolean;
  trailing?: React.ReactNode;
  selected?: boolean;
  /** Solda 3 px kimlik şeridi (veri rengi). */
  stripe?: string | null;
  muted?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  accessibilityLabel?: string;
  children?: React.ReactNode;
}) {
  const lead = leading ?? (avatar ? <Avatar name={avatar.name} image={avatar.image} size={40} /> : icon ? <IconTile icon={icon} tone={muted ? "neutral" : tone} size={40} glow={false} /> : null);
  const body = (
    <>
      {selected ? (
        <LinearGradient colors={colors.gradientSignature} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={k.rowStripe} />
      ) : stripe ? (
        <View style={[k.rowStripe, { backgroundColor: stripe }]} />
      ) : null}
      {lead}
      <View style={k.rowBody}>
        <Text style={[k.rowTitle, muted ? k.rowMuted : null]} numberOfLines={2} {...textScale.dense}>
          {title}
        </Text>
        {sub ? (
          <Text style={k.rowSub} numberOfLines={1} {...textScale.dense}>
            {sub}
          </Text>
        ) : null}
        {meta ? (
          <View style={k.rowMetaLine}>
            {metaIcon ? <Ionicons name={metaIcon} size={11} color={colors.textTertiary} /> : null}
            <Text style={k.rowMeta} numberOfLines={1} {...textScale.dense}>
              {meta}
            </Text>
          </View>
        ) : null}
        {children}
      </View>
      {value || badge || trailing ? (
        <View style={k.rowEnd}>
          {value ? (
            <Text style={[k.rowValue, { color: VALUE_TONE[valueTone] }]} numberOfLines={1} {...textScale.badge}>
              {value}
            </Text>
          ) : null}
          {valueSub ? (
            <Text style={k.rowValueSub} numberOfLines={1} {...textScale.badge}>
              {valueSub}
            </Text>
          ) : null}
          {badge ? <Badge label={badge.label} tone={badge.tone} icon={badge.icon} size="xs" /> : null}
          {trailing}
        </View>
      ) : null}
      {chevron ? <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} /> : null}
    </>
  );
  const style = [k.row, selected ? k.rowSelected : null];
  if (!onPress && !onLongPress) return <View style={style}>{body}</View>;
  return (
    <Touchable
      feedback="row"
      onPress={onPress}
      onLongPress={onLongPress}
      style={style}
      accessibilityRole="button"
      accessibilityState={selected ? { selected } : undefined}
      accessibilityLabel={accessibilityLabel ?? [title, sub, meta, value, badge?.label].filter(Boolean).join(", ")}
    >
      {body}
    </Touchable>
  );
}

/* ═══════════════════════════════ SAYI ═══════════════════════════════ */

/** ▲ / ▼ değişim; `goodWhenUp` false ise artış kırmızıdır (gider). */
export function Delta({ value, text, goodWhenUp = true, onDark }: { value: number; text?: string; goodWhenUp?: boolean; onDark?: boolean }) {
  if (!Number.isFinite(value) || value === 0) {
    return (
      <Text style={[k.delta, { color: onDark ? colors.onDarkMuted : colors.textTertiary }]} {...textScale.badge}>
        = {text ?? "değişim yok"}
      </Text>
    );
  }
  const up = value > 0;
  const good = up === goodWhenUp;
  const color = onDark ? (good ? STAGE_TONE.win : STAGE_TONE.danger) : good ? colors.win : colors.loss;
  return (
    <Text style={[k.delta, { color }]} accessibilityLabel={`${up ? "artış" : "azalış"} ${text ?? ""}`} {...textScale.badge}>
      {up ? "▲" : "▼"} {text ?? `%${Math.abs(Math.round(value))}`}
    </Text>
  );
}

/* ═══════════════════════════════ KARO ═══════════════════════════════ */

export function TileButton({
  icon,
  tone = "violet",
  title,
  hint,
  badge,
  onPress,
  style,
}: {
  icon: IconName;
  tone?: IconTileTone;
  title: string;
  hint?: string | null;
  badge?: { label: string; tone?: Tone } | null;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Touchable feedback="card" haptic="light" onPress={onPress} style={[k.tile, style]} accessibilityRole="button" accessibilityLabel={[title, hint, badge?.label].filter(Boolean).join(". ")}>
      <View style={k.tileHead}>
        <IconTile icon={icon} tone={tone} size={40} />
        {badge ? <Badge label={badge.label} tone={badge.tone} size="xs" /> : <Ionicons name="arrow-forward" size={15} color={colors.textTertiary} />}
      </View>
      <Text style={k.tileTitle} numberOfLines={1} {...textScale.dense}>
        {title}
      </Text>
      {hint ? (
        <Text style={k.tileHint} numberOfLines={2} {...textScale.dense}>
          {hint}
        </Text>
      ) : null}
    </Touchable>
  );
}

/* ═══════════════════════════════ KATEGORİ ═══════════════════════════════ */

const CATEGORY_RULES: [RegExp, IconName, IconTileTone][] = [
  [/saha|kira/i, "business-outline", "cyan"],
  [/hakem/i, "flag-outline", "gold"],
  [/sponsor/i, "ribbon-outline", "violet"],
  [/katılım|aidat|takım|ücret/i, "people-outline", "mint"],
  [/ödül|kupa/i, "trophy-outline", "gold"],
  [/forma|malzeme|ekipman/i, "shirt-outline", "pink"],
  [/yayın|prodüksiyon|reklam/i, "videocam-outline", "red"],
  [/ulaşım|taksi|yol/i, "car-outline", "cyan"],
  [/personel|maaş|spiker|foto/i, "person-outline", "violet"],
  [/vergi|harç|sgk|kdv/i, "document-text-outline", "neutral"],
  [/organizasyon|etkinlik/i, "sparkles-outline", "pink"],
  [/su|ikram|buz/i, "water-outline", "cyan"],
  [/fatura|internet|abonelik/i, "receipt-outline", "neutral"],
];

/** Kategori adı → ikon + ton (eşleşmezse gelir nane ↓, gider kırmızı ↑). */
export function categoryVisual(name: string | null | undefined, kind: "income" | "expense"): { icon: IconName; tone: IconTileTone } {
  const text = name || "";
  for (const [re, icon, tone] of CATEGORY_RULES) if (re.test(text)) return { icon, tone };
  return kind === "income" ? { icon: "arrow-down", tone: "mint" } : { icon: "arrow-up", tone: "red" };
}

/* ═══════════════════════════════ STİL ═══════════════════════════════ */

const k = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  stage: {
    borderRadius: radius.xxl,
    overflow: "hidden",
    backgroundColor: colors.adminBar,
    padding: space.lg,
    gap: space.md,
    borderWidth: hairline,
    borderColor: colors.inkTileBorder,
  },
  stageHead: { flexDirection: "row", alignItems: "flex-start", gap: space.md },
  stageOverline: { ...type.overline, color: colors.onDarkMuted, marginBottom: space.xs },
  stageValue: { ...type.scoreHero, color: colors.onDark },
  stageCaption: { ...type.bodySm, color: colors.onDarkMuted, marginTop: space.xs },
  stageChips: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
  stageStats: {
    flexDirection: "row",
    borderRadius: radius.lg,
    backgroundColor: colors.inkTile,
    borderWidth: hairline,
    borderColor: colors.inkTileBorder,
    paddingVertical: space.md,
  },
  stageStat: { flex: 1, alignItems: "center", gap: space.xxs, paddingHorizontal: space.xs },
  stageStatDivided: { borderLeftWidth: hairline, borderLeftColor: colors.inkTileBorder },
  stageStatValue: { ...type.metricSm, color: colors.onDark },
  stageStatLabel: { ...type.micro, color: colors.onDarkMuted },
  stageChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs + 1,
    borderRadius: radius.pill,
    backgroundColor: colors.inkPill,
    borderWidth: hairline,
    borderColor: colors.inkPillBorder,
    maxWidth: "100%",
  },
  stageChipDot: { width: 6, height: 6, borderRadius: radius.pill },
  stageChipText: { ...type.labelXs, flexShrink: 1 },

  lines: {
    borderRadius: radius.xl,
    borderWidth: hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface1,
    overflow: "hidden",
  },
  divider: { height: hairline, backgroundColor: colors.separator },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    minHeight: 60,
    paddingVertical: space.m,
    paddingHorizontal: space.md,
  },
  rowSelected: { backgroundColor: colors.brandDim },
  rowStripe: { position: "absolute", left: 0, top: space.sm, bottom: space.sm, width: 3, borderTopRightRadius: radius.pill, borderBottomRightRadius: radius.pill },
  rowBody: { flex: 1, minWidth: 0, gap: 2 },
  rowTitle: { ...type.h4, color: colors.textPrimary },
  rowMuted: { color: colors.textTertiary },
  rowSub: { ...type.bodySm, color: colors.textSecondary },
  rowMetaLine: { flexDirection: "row", alignItems: "center", gap: space.xxs + 1 },
  rowMeta: { ...type.caption, color: colors.textTertiary, flexShrink: 1 },
  rowEnd: { alignItems: "flex-end", gap: space.xxs, maxWidth: "45%" },
  rowValue: { ...type.metricSm },
  rowValueSub: { ...type.micro, color: colors.textTertiary },

  delta: { ...type.labelXs },

  tile: {
    flexBasis: "47%",
    flexGrow: 1,
    gap: space.xs,
    padding: space.md,
    borderRadius: radius.xl,
    borderWidth: hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface1,
    minHeight: 120,
  },
  tileHead: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: space.xs },
  tileTitle: { ...type.h3, color: colors.textPrimary },
  tileHint: { ...type.caption, color: colors.textSecondary },
});
