/**
 * SİSTEM / PERSONEL / İÇERİK KİTİ — yönetim modunun "sistem" araçlarının
 * (personel, değerlendirme, yetki, kayıtlar, analiz, içerik, yayın) ortak
 * SUNUM parçaları. Veri ve iş mantığı ekranlarda kalır; burada yalnız çizim.
 *
 *   · SysStage      — özet sahnesi: gece laciverti degrade + Aurora ışığı,
 *                     solda degrade IconTile, büyük Odometer sayı + yanında
 *                     cam alt sayaçlar (StageStat).
 *   · CountTiles    — yatay sayaç karoları (Odometer); dokununca süzgeç olur,
 *                     seçili karo ton çerçeveli.
 *   · SysGroup      — başlıklı kart: küçük IconTile + versal başlık + sağda
 *                     "Eylem ›"; içinde satırlar ince ayraçla (kart içinde kart yok).
 *   · SysRow        — grup içi satır: önde görsel, başlık + meta, sonda değer.
 *   · TaskCard      — "yapılacak" önerisi: ton IconTile + cümle + küçük düğme.
 *   · MeterRow      — etiket · değer + GradientBar (dağılım, oran).
 *   · ScorePlate    — puan plakası (Archivo, puan tonunda zemin).
 *
 * NEDEN AYRI DOSYA: ortak kit (components/ui) ve yönetim kabuğu başka
 * ekiplerin; bu alanın ekranları ortak dili burada yerel olarak toplar.
 * Hareket: yalnız tek seferlik giriş ve Odometer yayı; döngü yok (Aurora izinli).
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import React, { memo } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { Aurora, Button, GradientBar, IconTile, Odometer, Touchable, type IconTileTone, type Tone } from "@/components/ui";
import { colors, dividers, hairline, radius, space, textScale, type, upperTR } from "@/theme";

/* ═══════════════════════════════ TON ═══════════════════════════════ */

/** Badge tonunun ön plan rengi (şerit, nokta, sayaç). */
export function toneFg(tone: Tone | undefined): string {
  switch (tone) {
    case "live":
      return colors.live;
    case "win":
      return colors.win;
    case "warn":
      return colors.warn;
    case "danger":
      return colors.danger;
    case "info":
      return colors.info;
    case "brand":
      return colors.brandAccent;
    case "accent":
      return colors.accentText;
    default:
      return colors.textSecondary;
  }
}

/** Badge tonunun soluk zemini. */
export function toneBg(tone: Tone | undefined): string {
  switch (tone) {
    case "live":
      return colors.liveDim;
    case "win":
      return colors.winDim;
    case "warn":
      return colors.warnDim;
    case "danger":
      return colors.dangerDim;
    case "info":
      return colors.infoDim;
    case "brand":
      return colors.brandDim;
    case "accent":
      return colors.accentDim;
    default:
      return colors.surface3;
  }
}

/** Badge tonu → IconTile degradesi. */
export function toneTile(tone: Tone | undefined): IconTileTone {
  switch (tone) {
    case "live":
      return "pink";
    case "win":
      return "mint";
    case "warn":
      return "gold";
    case "danger":
      return "red";
    case "info":
    case "accent":
      return "cyan";
    case "brand":
      return "violet";
    default:
      return "neutral";
  }
}

/** 7,4 gibi Türkçe ondalık. */
export const trNum = (value: number | null | undefined, digits = 1) =>
  value == null || !Number.isFinite(value) ? "—" : value.toFixed(digits).replace(".", ",");

/* ═══════════════════════════════ SAHNE ═══════════════════════════════ */

export interface StageStatItem {
  label: string;
  value: string | number;
  tone?: Tone;
  icon?: keyof typeof Ionicons.glyphMap;
}

export function SysStage({
  eyebrow,
  title,
  icon,
  tone = "violet",
  value,
  valueLabel,
  stats,
  children,
  style,
}: {
  eyebrow?: string;
  title?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  tone?: IconTileTone;
  /** Sahnenin kahraman sayısı. */
  value?: string | number;
  valueLabel?: string;
  stats?: StageStatItem[];
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.stage, style]}>
      <LinearGradient colors={colors.gradientAdminStage} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} />
      <Aurora variant="stage" height={200} />
      {eyebrow || title || icon ? (
        <View style={styles.stageHead}>
          {icon ? <IconTile icon={icon} tone={tone} size={36} /> : null}
          <View style={styles.flex}>
            {eyebrow ? (
              <Text style={styles.stageEyebrow} numberOfLines={1} {...textScale.badge}>
                {upperTR(eyebrow)}
              </Text>
            ) : null}
            {title ? (
              <Text style={styles.stageTitle} numberOfLines={2} {...textScale.dense}>
                {title}
              </Text>
            ) : null}
          </View>
        </View>
      ) : null}
      {value != null || stats?.length ? (
        <View style={[styles.stageBody, (stats?.length ?? 0) > 2 ? styles.stageBodyStack : null]}>
          {value != null ? (
            <View style={[styles.stageHero, (stats?.length ?? 0) > 2 ? styles.stageHeroRow : null]} accessible accessibilityLabel={`${valueLabel ?? ""} ${value}`}>
              {typeof value === "number" ? (
                <Odometer value={value} style={styles.stageValue} />
              ) : (
                <Text style={styles.stageValue} numberOfLines={1} adjustsFontSizeToFit {...textScale.badge}>
                  {value}
                </Text>
              )}
              {valueLabel ? (
                <Text style={styles.stageValueLabel} numberOfLines={2} {...textScale.badge}>
                  {upperTR(valueLabel)}
                </Text>
              ) : null}
            </View>
          ) : null}
          {stats?.length ? (
            <View style={[styles.stageStats, (stats?.length ?? 0) > 2 ? null : styles.stageStatsSide]}>
              {stats.map((s) => (
                <StageStat key={s.label} {...s} />
              ))}
            </View>
          ) : null}
        </View>
      ) : null}
      {children}
    </View>
  );
}

export function StageStat({ label, value, tone, icon }: StageStatItem) {
  return (
    <View style={styles.stageStat} accessible accessibilityLabel={`${label}: ${value}`}>
      <View style={styles.stageStatHead}>
        {icon ? <Ionicons name={icon} size={11} color={tone ? stageTone(tone) : colors.onDarkMuted} /> : <View style={[styles.dot, { backgroundColor: tone ? stageTone(tone) : colors.onDarkMuted }]} />}
        <Text style={styles.stageStatLabel} numberOfLines={1} {...textScale.badge}>
          {upperTR(label)}
        </Text>
      </View>
      {typeof value === "number" ? (
        <Odometer value={value} style={styles.stageStatValue} />
      ) : (
        <Text style={styles.stageStatValue} numberOfLines={1} adjustsFontSizeToFit {...textScale.badge}>
          {value}
        </Text>
      )}
    </View>
  );
}

/** Koyu sahne üstünde okunur ton (iki temada sahne koyu). */
function stageTone(tone: Tone): string {
  switch (tone) {
    case "win":
      return colors.tileTones.mint[0];
    case "warn":
      return colors.adminAccent;
    case "danger":
    case "live":
      return colors.tileTones.pink[0];
    case "info":
    case "accent":
      return colors.tileTones.cyan[0];
    default:
      return colors.onDarkMuted;
  }
}

/* ═══════════════════════════════ SAYAÇ KAROLARI ═══════════════════════════════ */

export interface CountTileItem<K extends string = string> {
  key: K;
  label: string;
  value: number | string;
  tone?: Tone;
  icon?: keyof typeof Ionicons.glyphMap;
}

export function CountTiles<K extends string>({
  items,
  value,
  onChange,
  style,
}: {
  items: CountTileItem<K>[];
  value?: K | null;
  /** Verilirse karolar süzgeçtir; seçili karoya yeniden dokunmak kaldırır. */
  onChange?: (key: K | null) => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.tiles, style]}>
      {items.map((item) => {
        const on = value === item.key;
        const fg = toneFg(item.tone);
        const body = (
          <>
            <View style={styles.tileHead}>
              {item.icon ? <Ionicons name={item.icon} size={12} color={fg} /> : <View style={[styles.dot, { backgroundColor: fg }]} />}
              <Text style={[styles.tileLabel, on ? { color: colors.textPrimary } : null]} numberOfLines={1} {...textScale.badge}>
                {upperTR(item.label)}
              </Text>
            </View>
            {typeof item.value === "number" ? (
              <Odometer value={item.value} style={styles.tileValue} />
            ) : (
              <Text style={styles.tileValue} numberOfLines={1} adjustsFontSizeToFit {...textScale.badge}>
                {item.value}
              </Text>
            )}
            {on ? <View style={[styles.tileUnder, { backgroundColor: fg }]} /> : null}
          </>
        );
        return onChange ? (
          <Touchable
            key={item.key}
            feedback="card"
            haptic="selection"
            onPress={() => onChange(on ? null : item.key)}
            style={[styles.tile, on ? [styles.tileOn, { borderColor: fg }] : null]}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${item.label}: ${item.value}`}
          >
            {body}
          </Touchable>
        ) : (
          <View key={item.key} style={styles.tile} accessible accessibilityLabel={`${item.label}: ${item.value}`}>
            {body}
          </View>
        );
      })}
    </View>
  );
}

/* ═══════════════════════════════ GRUP KARTI ═══════════════════════════════ */

export function SysGroup({
  title,
  icon,
  tone = "violet",
  hint,
  action,
  right,
  children,
  flush,
  style,
}: {
  title?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  tone?: IconTileTone;
  hint?: string;
  action?: { label: string; onPress: () => void };
  right?: React.ReactNode;
  children?: React.ReactNode;
  /** Satırlar kenara dayanır (iç dolgu yok). */
  flush?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.group, style]}>
      {title ? (
        <View style={styles.groupHead}>
          {icon ? <IconTile icon={icon} tone={tone} size={26} glow={false} /> : <LinearGradient colors={colors.gradientSignature} style={styles.rail} />}
          <View style={styles.flex}>
            <Text style={styles.groupTitle} numberOfLines={1} accessibilityRole="header" {...textScale.dense}>
              {upperTR(title)}
            </Text>
            {hint ? (
              <Text style={styles.groupHint} numberOfLines={2} {...textScale.dense}>
                {hint}
              </Text>
            ) : null}
          </View>
          {right}
          {action ? (
            <Touchable onPress={action.onPress} accessibilityRole="button" style={styles.groupAction} hitSlop={8}>
              <Text style={styles.groupActionText} {...textScale.dense}>
                {action.label}
              </Text>
              <Ionicons name="chevron-forward" size={13} color={colors.brandAccent} />
            </Touchable>
          ) : null}
        </View>
      ) : null}
      <View style={flush ? null : styles.groupBody}>{children}</View>
    </View>
  );
}

/* ═══════════════════════════════ SATIR ═══════════════════════════════ */

export const SysRow = memo(function SysRow({
  leading,
  icon,
  tone,
  title,
  meta,
  value,
  valueTone,
  trailing,
  onPress,
  first,
  selected,
  muted,
  accessibilityLabel,
}: {
  leading?: React.ReactNode;
  icon?: keyof typeof Ionicons.glyphMap;
  tone?: Tone;
  title: string;
  meta?: string | null;
  value?: string | number | null;
  valueTone?: Tone;
  trailing?: React.ReactNode;
  onPress?: () => void;
  /** İlk satırın üstünde ayraç çizilmez. */
  first?: boolean;
  selected?: boolean;
  muted?: boolean;
  accessibilityLabel?: string;
}) {
  const body = (
    <>
      {!first ? <View style={styles.rowRule} /> : null}
      {selected ? <LinearGradient colors={colors.gradientSignature} style={styles.rowStripe} /> : null}
      {leading ?? (icon ? <IconTile icon={icon} tone={toneTile(tone)} size={34} glow={false} /> : null)}
      <View style={styles.flex}>
        <Text style={[styles.rowTitle, muted ? { color: colors.textTertiary } : null]} numberOfLines={1} {...textScale.dense}>
          {title}
        </Text>
        {meta ? (
          <Text style={styles.rowMeta} numberOfLines={2} {...textScale.dense}>
            {meta}
          </Text>
        ) : null}
      </View>
      {value != null && value !== "" ? (
        <Text style={[styles.rowValue, valueTone ? { color: toneFg(valueTone) } : null]} numberOfLines={1} {...textScale.badge}>
          {value}
        </Text>
      ) : null}
      {trailing}
      {onPress && !trailing ? <Ionicons name="chevron-forward" size={15} color={colors.textTertiary} /> : null}
    </>
  );
  const style = [styles.row, selected ? styles.rowSelected : null];
  return onPress ? (
    <Touchable feedback="row" onPress={onPress} style={style} accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? title}>
      {body}
    </Touchable>
  ) : (
    <View style={style} accessible={Boolean(accessibilityLabel)} accessibilityLabel={accessibilityLabel}>
      {body}
    </View>
  );
});

/* ═══════════════════════════════ ÖNERİ KARTI ═══════════════════════════════ */

export function TaskCard({
  icon,
  tone = "warn",
  title,
  body,
  action,
  onPress,
  busy,
  disabled,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  tone?: Tone;
  title: string;
  body?: string;
  action?: string;
  onPress?: () => void;
  busy?: boolean;
  disabled?: boolean;
}) {
  return (
    <View style={[styles.task, { borderColor: toneBg(tone) }]}>
      <View style={[styles.taskStripe, { backgroundColor: toneFg(tone) }]} />
      <IconTile icon={icon} tone={toneTile(tone)} size={34} glow={false} />
      <View style={styles.flex}>
        <Text style={styles.taskTitle} numberOfLines={2} {...textScale.dense}>
          {title}
        </Text>
        {body ? (
          <Text style={styles.taskBody} {...textScale.long}>
            {body}
          </Text>
        ) : null}
        {action && onPress ? (
          <View style={styles.taskAction}>
            <Button label={action} size="sm" variant="secondary" loading={busy} disabled={disabled} onPress={onPress} />
          </View>
        ) : null}
      </View>
    </View>
  );
}

/* ═══════════════════════════════ ÖLÇER ═══════════════════════════════ */

export function MeterRow({
  label,
  value,
  ratio,
  hint,
  gradient,
  leading,
}: {
  label: string;
  value: string;
  /** 0..1 */
  ratio: number;
  hint?: string;
  gradient?: readonly [string, string];
  leading?: React.ReactNode;
}) {
  return (
    <View style={styles.meter} accessible accessibilityLabel={`${label}: ${value}`}>
      <View style={styles.meterHead}>
        {leading}
        <Text style={styles.meterLabel} numberOfLines={1} {...textScale.dense}>
          {label}
        </Text>
        {hint ? (
          <Text style={styles.meterHint} numberOfLines={1} {...textScale.dense}>
            {hint}
          </Text>
        ) : null}
        <Text style={styles.meterValue} {...textScale.badge}>
          {value}
        </Text>
      </View>
      <GradientBar value={Math.max(0, Math.min(1, ratio || 0))} height={6} gradient={gradient} />
    </View>
  );
}

/* ═══════════════════════════════ PUAN PLAKASI ═══════════════════════════════ */

export function ScorePlate({ value, tone, size = "md", caption }: { value: string; tone?: Tone; size?: "sm" | "md" | "lg"; caption?: string }) {
  const dim = size === "lg" ? 64 : size === "sm" ? 40 : 50;
  return (
    <View style={[styles.plate, { width: dim, minHeight: dim, backgroundColor: toneBg(tone), borderColor: toneFg(tone) }]}>
      <Text style={[size === "lg" ? styles.plateLg : size === "sm" ? styles.plateSm : styles.plateMd, { color: toneFg(tone) }]} numberOfLines={1} adjustsFontSizeToFit {...textScale.badge}>
        {value}
      </Text>
      {caption ? (
        <Text style={[styles.plateCaption, { color: toneFg(tone) }]} numberOfLines={1} {...textScale.badge}>
          {upperTR(caption)}
        </Text>
      ) : null}
    </View>
  );
}

/* ═══════════════════════════════ STİLLER ═══════════════════════════════ */

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  dot: { width: 6, height: 6, borderRadius: 3 },

  stage: {
    borderRadius: radius.xl,
    overflow: "hidden",
    padding: space.lg,
    gap: space.md,
    borderWidth: hairline,
    borderColor: colors.glassBorder,
  },
  stageHead: { flexDirection: "row", alignItems: "center", gap: space.md },
  stageEyebrow: { ...type.overline, color: colors.adminAccent },
  stageTitle: { ...type.h3, color: colors.onDark },
  stageBody: { flexDirection: "row", alignItems: "flex-end", gap: space.md },
  stageBodyStack: { flexDirection: "column", alignItems: "stretch" },
  stageHero: { minWidth: 84, gap: 2 },
  stageHeroRow: { flexDirection: "row", alignItems: "flex-end", gap: space.sm },
  stageValue: { ...type.scoreHero, color: colors.onDark },
  stageValueLabel: { ...type.micro, color: colors.onDarkMuted, paddingBottom: 6, flexShrink: 1 },
  stageStats: { flexDirection: "row", gap: space.sm },
  stageStatsSide: { flex: 1 },
  stageStat: {
    flex: 1,
    minWidth: 0,
    gap: 2,
    paddingHorizontal: space.sm,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    backgroundColor: colors.inkPill,
    borderWidth: hairline,
    borderColor: colors.inkPillBorder,
  },
  stageStatHead: { flexDirection: "row", alignItems: "center", gap: 4 },
  stageStatLabel: { ...type.nano, color: colors.onDarkMuted, flexShrink: 1 },
  stageStatValue: { ...type.scoreSm, color: colors.onDark },

  tiles: { flexDirection: "row", gap: space.sm },
  tile: {
    flex: 1,
    minWidth: 0,
    minHeight: 68,
    justifyContent: "space-between",
    gap: space.xs,
    padding: space.sm + space.xxs,
    borderRadius: radius.lg,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
    overflow: "hidden",
  },
  tileOn: { backgroundColor: colors.brandDim, borderWidth: 1 },
  tileHead: { flexDirection: "row", alignItems: "center", gap: 5 },
  tileLabel: { ...type.nano, color: colors.textTertiary, flexShrink: 1 },
  tileValue: { ...type.metric, color: colors.textPrimary },
  tileUnder: { position: "absolute", left: space.md, right: space.md, bottom: 0, height: 3, borderTopLeftRadius: 3, borderTopRightRadius: 3 },

  group: {
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
    overflow: "hidden",
  },
  groupHead: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.xs },
  rail: { width: 3, height: 14, borderRadius: radius.pill },
  groupTitle: { ...type.overline, color: colors.textSecondary },
  groupHint: { ...type.caption, color: colors.textTertiary },
  groupAction: { flexDirection: "row", alignItems: "center", gap: 2 },
  groupActionText: { ...type.labelSm, color: colors.brandAccent },
  groupBody: { paddingHorizontal: space.lg, paddingBottom: space.md, paddingTop: space.xs, gap: space.md },

  row: { flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 58, paddingHorizontal: space.lg, paddingVertical: space.sm },
  rowSelected: { backgroundColor: colors.brandDim },
  rowStripe: { position: "absolute", left: 0, top: space.sm, bottom: space.sm, width: 3, borderTopRightRadius: 3, borderBottomRightRadius: 3 },
  rowRule: { ...dividers.inset, position: "absolute", top: 0, left: space.lg, right: 0, marginLeft: 0 },
  rowTitle: { ...type.h4, color: colors.textPrimary },
  rowMeta: { ...type.caption, color: colors.textTertiary },
  rowValue: { ...type.scoreXs, color: colors.textPrimary },

  task: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space.md,
    padding: space.md,
    paddingLeft: space.lg,
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: 1,
    overflow: "hidden",
  },
  taskStripe: { position: "absolute", left: 0, top: space.md, bottom: space.md, width: 3, borderTopRightRadius: 3, borderBottomRightRadius: 3 },
  taskTitle: { ...type.label, color: colors.textPrimary },
  taskBody: { ...type.caption, color: colors.textSecondary, marginTop: 2 },
  taskAction: { flexDirection: "row", marginTop: space.sm },

  meter: { gap: space.xs },
  meterHead: { flexDirection: "row", alignItems: "center", gap: space.sm },
  meterLabel: { ...type.bodySm, color: colors.textPrimary, flexShrink: 1 },
  meterHint: { ...type.caption, color: colors.textTertiary, flex: 1 },
  meterValue: { ...type.numSmStrong, color: colors.textPrimary, marginLeft: "auto" },

  plate: { borderRadius: radius.md, borderWidth: hairline, alignItems: "center", justifyContent: "center", paddingHorizontal: 4, paddingVertical: 4 },
  plateSm: { ...type.scoreXs },
  plateMd: { ...type.scoreSm },
  plateLg: { ...type.scoreMd },
  plateCaption: { ...type.nano },
});
