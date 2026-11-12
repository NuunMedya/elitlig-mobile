/**
 * MAÇ VE LİG OPERASYONLARI KİTİ — yönetim modunun maç/lig ekranlarının ortak
 * sunum parçaları (yalnız çizim; veri ve iş mantığı ekranlarda kalır).
 *
 *   · OpsStage      — kimlik sahnesi: gece laciverti degrade + Aurora ışığı.
 *   · StatusTiles   — durum sayaçları (taslak / zamanlandı / canlı / bitti);
 *                     Odometer rakam, dokununca süzgeç olur.
 *   · OpsMatchCard  — maç kaydı kartı: durum şeridi, takım logoları, skor
 *                     plakası, saat/saha hapları ve eksik bilgi uyarıları.
 *   · DayHeader     — gün bölümü başlığı: takvim pulu + gün adı + durum hapı.
 *   · InfoPill      — küçük cam hap (ikon + metin, istenirse uyarı tonu).
 *   · OpsGroup      — gruplu form/bilgi kartı: degrade ray + versal başlık.
 *   · OpsRow        — liste satırı anatomisi: IconTile/logo + başlık + meta + değer.
 *
 * NEDEN AYRI DOSYA: ortak kit (components/ui) ve yönetim kabuğu başka ekiplerin;
 * maç/lig ekranlarının ortak dili burada yerel olarak toplanır.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import React, { memo } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { Aurora, Badge, IconTile, Odometer, TeamLogo, Touchable, type IconTileTone, type Tone } from "@/components/ui";
import { colors, fonts, hairline, layout, radius, space, textScale, type } from "@/theme";

export const upperTR = (value: string) => value.toLocaleUpperCase("tr-TR");

/* ═══════════════════════════════ TON SÖZLÜĞÜ ═══════════════════════════════ */

/** Badge tonunun ön plan rengi — şerit, nokta ve sayaç rengi buradan. */
export function toneColor(tone: Tone | undefined): string {
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
      return colors.textTertiary;
  }
}

/* ═══════════════════════════════ SAHNE ═══════════════════════════════ */

export function OpsStage({
  children,
  style,
  height = 220,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Aurora ışık alanının yüksekliği. */
  height?: number;
}) {
  return (
    <View style={[styles.stage, style]}>
      <LinearGradient colors={colors.gradientAdminStage} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} />
      <Aurora variant="stage" height={height} />
      {children}
    </View>
  );
}

/** Sahne içi küçük cam karo: ikon + versal etiket + değer. */
export function StageTile({ icon, label, value, tone }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string | number; tone?: Tone }) {
  return (
    <View style={styles.stageTile} accessible accessibilityLabel={`${label}: ${value}`}>
      <View style={styles.stageTileHead}>
        <Ionicons name={icon} size={11} color={tone ? toneColor(tone) : colors.onDarkMuted} />
        <Text style={styles.stageTileLabel} numberOfLines={1} {...textScale.badge}>
          {upperTR(label)}
        </Text>
      </View>
      {typeof value === "number" ? (
        <Odometer value={value} style={styles.stageTileValue} />
      ) : (
        <Text style={styles.stageTileValue} numberOfLines={1} adjustsFontSizeToFit {...textScale.badge}>
          {value}
        </Text>
      )}
    </View>
  );
}

/* ═══════════════════════════════ DURUM SAYAÇLARI ═══════════════════════════════ */

export interface StatusTileItem<K extends string = string> {
  key: K;
  label: string;
  value: number;
  tone?: Tone;
  icon?: keyof typeof Ionicons.glyphMap;
}

/**
 * Yatay sayaç karoları. `value` seçili karoyu vurgular (brandDim zemin + ton
 * çerçevesi); seçili karoya yeniden dokunmak süzgeci kaldırır (`onChange(null)`).
 */
export function StatusTiles<K extends string>({
  items,
  value,
  onChange,
  style,
}: {
  items: StatusTileItem<K>[];
  value?: K | null;
  onChange?: (key: K | null) => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.tiles, style]}>
      {items.map((item) => {
        const on = value === item.key;
        const fg = toneColor(item.tone);
        const body = (
          <>
            <View style={styles.tileHead}>
              {item.icon ? (
                <Ionicons name={item.icon} size={12} color={fg} />
              ) : (
                <View style={[styles.tileDot, { backgroundColor: fg }]} />
              )}
              <Text style={[styles.tileLabel, on ? styles.tileLabelOn : null]} numberOfLines={1} {...textScale.badge}>
                {upperTR(item.label)}
              </Text>
            </View>
            <Odometer value={item.value} style={[styles.tileValue, item.value > 0 && item.tone === "live" ? { color: colors.live } : null]} />
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
            accessibilityLabel={`${item.label}: ${item.value}${on ? ", seçili süzgeç" : ""}`}
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

/* ═══════════════════════════════ HAP ═══════════════════════════════ */

export const InfoPill = memo(function InfoPill({
  icon,
  label,
  tone,
  strong,
  onDark,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  label: string;
  /** "warn" / "danger" eksik bilgi uyarısı; verilmezse nötr cam hap. */
  tone?: Tone;
  /** Archivo rakam (saat gibi). */
  strong?: boolean;
  /** Koyu sahne üstünde. */
  onDark?: boolean;
}) {
  const fg = tone ? toneColor(tone) : onDark ? colors.onDark : colors.textSecondary;
  const bg = tone === "warn" ? colors.warnDim : tone === "danger" ? colors.dangerDim : tone === "live" ? colors.liveDim : tone === "win" ? colors.winDim : onDark ? colors.inkPill : colors.surface3;
  return (
    <View style={[styles.pill, { backgroundColor: bg }, onDark ? styles.pillDark : null]}>
      {icon ? <Ionicons name={icon} size={11} color={fg} /> : null}
      <Text style={[strong ? styles.pillStrong : styles.pillText, { color: fg }]} numberOfLines={1} {...textScale.badge}>
        {label}
      </Text>
    </View>
  );
});

/* ═══════════════════════════════ MAÇ KARTI ═══════════════════════════════ */

/** Kartın sabit yüksekliği (liste `getItemLayout` için) — uyarı satırı dahil. */
export const OPS_MATCH_CARD_HEIGHT = 118;

export interface OpsMatchCardProps {
  home: string;
  away: string;
  homeLogo?: string | null;
  awayLogo?: string | null;
  homeScore?: number | null;
  awayScore?: number | null;
  /** Skor gösterilsin mi (taslak/zamanlanmış maçta saat görünür). */
  scored: boolean;
  /** "20:30" */
  time?: string | null;
  field?: string | null;
  statusLabel: string;
  statusTone: Tone;
  live?: boolean;
  /** Eksik bilgi uyarıları ("Saha yok", "Sonuç bekliyor"). */
  warnings?: { label: string; tone?: Tone; icon?: keyof typeof Ionicons.glyphMap }[];
  /** Kartın altında küçük not (lig adı vb.). */
  meta?: string | null;
  onPress?: () => void;
  accessibilityLabel?: string;
}

export const OpsMatchCard = memo(function OpsMatchCard({
  home,
  away,
  homeLogo,
  awayLogo,
  homeScore,
  awayScore,
  scored,
  time,
  field,
  statusLabel,
  statusTone,
  live,
  warnings,
  meta,
  onPress,
  accessibilityLabel,
}: OpsMatchCardProps) {
  const rail = toneColor(statusTone);
  const h = Number(homeScore ?? 0);
  const a = Number(awayScore ?? 0);
  const homeLead = scored && h > a;
  const awayLead = scored && a > h;
  const tail = warnings?.length ? warnings : null;

  return (
    <Touchable
      feedback="card"
      onPress={onPress}
      style={[styles.card, live ? styles.cardLive : null]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? `${home} – ${away}, ${statusLabel}`}
    >
      <View style={[styles.cardRail, { backgroundColor: rail }]} />
      <View style={styles.cardBody}>
        <View style={styles.cardTop}>
          <Badge label={upperTR(statusLabel)} tone={statusTone} size="xs" dot={live} />
          {/* Saat, oynanmamış maçta plakada durur; burada yalnız skorlu maçta. */}
          {time && scored ? <InfoPill icon="time-outline" label={time} strong /> : null}
          {field ? (
            <View style={styles.flexShrink}>
              <InfoPill icon="location-outline" label={field} />
            </View>
          ) : null}
          <View style={styles.flex} />
          <Ionicons name="chevron-forward" size={14} color={colors.textTertiary} />
        </View>

        <View style={styles.cardMain}>
          <View style={styles.teams}>
            <View style={styles.teamLine}>
              <TeamLogo name={home} logo={homeLogo} size={24} />
              <Text style={[styles.teamName, awayLead ? styles.teamDim : null]} numberOfLines={1} {...textScale.dense}>
                {home || "Ev sahibi"}
              </Text>
            </View>
            <View style={styles.teamLine}>
              <TeamLogo name={away} logo={awayLogo} size={24} />
              <Text style={[styles.teamName, homeLead ? styles.teamDim : null]} numberOfLines={1} {...textScale.dense}>
                {away || "Deplasman"}
              </Text>
            </View>
          </View>
          <ScorePlate scored={scored} home={h} away={a} time={time} live={live} />
        </View>

        <View style={styles.cardFoot}>
          {tail ? (
            tail.slice(0, 3).map((w) => <InfoPill key={w.label} icon={w.icon ?? "alert-circle"} label={w.label} tone={w.tone ?? "warn"} />)
          ) : meta ? (
            <Text style={styles.cardMeta} numberOfLines={1} {...textScale.dense}>
              {meta}
            </Text>
          ) : (
            <View style={styles.okRow}>
              <Ionicons name="checkmark-circle" size={12} color={colors.win} />
              <Text style={styles.cardMeta} numberOfLines={1} {...textScale.dense}>
                Bilgiler tam
              </Text>
            </View>
          )}
        </View>
      </View>
    </Touchable>
  );
});

/** Skor plakası: oynanmış/canlı maçta iki satır rakam, değilse saat. */
export function ScorePlate({
  scored,
  home,
  away,
  time,
  live,
  size = "md",
}: {
  scored: boolean;
  home: number;
  away: number;
  time?: string | null;
  live?: boolean;
  size?: "md" | "lg";
}) {
  const big = size === "lg";
  if (!scored) {
    return (
      <View style={[styles.plate, styles.plateIdle, big ? styles.plateLg : null]}>
        <Text style={[styles.plateTime, big ? styles.plateTimeLg : null]} {...textScale.badge}>
          {time || "––:––"}
        </Text>
        <Text style={styles.plateCaption} {...textScale.badge}>
          {time ? "BAŞLAMA" : "SAAT YOK"}
        </Text>
      </View>
    );
  }
  return (
    <View style={[styles.plate, big ? styles.plateLg : null]}>
      <LinearGradient colors={live ? colors.gradientLive : colors.gradientInk} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <Text style={[styles.plateDigit, big ? styles.plateDigitLg : null, home < away ? styles.plateDigitDim : null]} {...textScale.badge}>
        {home}
      </Text>
      <View style={styles.plateRule} />
      <Text style={[styles.plateDigit, big ? styles.plateDigitLg : null, away < home ? styles.plateDigitDim : null]} {...textScale.badge}>
        {away}
      </Text>
    </View>
  );
}

/* ═══════════════════════════════ GÜN BAŞLIĞI ═══════════════════════════════ */

const MONTHS = ["OCA", "ŞUB", "MAR", "NİS", "MAY", "HAZ", "TEM", "AĞU", "EYL", "EKİ", "KAS", "ARA"];

export const DAY_HEADER_HEIGHT = 56;

/** Takvim pulu (gün sayısı + ay) + başlık + durum hapı + adet. */
export function DayHeader({
  day,
  title,
  statusLabel,
  tone,
  count,
  live,
}: {
  /** "2026-11-14" */
  day?: string | null;
  title: string;
  statusLabel?: string;
  tone?: Tone;
  count: number;
  live?: boolean;
}) {
  const m = String(day ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return (
    <View style={styles.dayHead} accessibilityRole="header" accessibilityLabel={`${title}, ${statusLabel ?? ""}, ${count} maç`}>
      <View style={[styles.dayStamp, live ? styles.dayStampLive : null]}>
        {live ? (
          <Ionicons name="radio" size={16} color={colors.live} />
        ) : m ? (
          <>
            <Text style={styles.dayNum} {...textScale.badge}>
              {Number(m[3])}
            </Text>
            <Text style={styles.dayMonth} {...textScale.badge}>
              {MONTHS[Number(m[2]) - 1] ?? ""}
            </Text>
          </>
        ) : (
          <Ionicons name="help" size={14} color={colors.textTertiary} />
        )}
      </View>
      <View style={styles.flex}>
        <Text style={styles.dayTitle} numberOfLines={1} {...textScale.dense}>
          {title}
        </Text>
        <View style={styles.dayMetaRow}>
          {statusLabel ? <View style={[styles.dayDot, { backgroundColor: toneColor(tone) }]} /> : null}
          <Text style={styles.dayMeta} numberOfLines={1} {...textScale.dense}>
            {[statusLabel, `${count} maç`].filter(Boolean).join(" · ")}
          </Text>
        </View>
      </View>
    </View>
  );
}

/* ═══════════════════════════════ GRUP KARTI ═══════════════════════════════ */

/** Gruplu kart: solda degrade ray + versal başlık; isteğe bağlı sağ eylem/ikon. */
export function OpsGroup({
  title,
  icon,
  tone = "violet",
  hint,
  right,
  children,
  style,
  flush,
}: {
  title: string;
  icon?: keyof typeof Ionicons.glyphMap;
  tone?: IconTileTone;
  hint?: string;
  right?: React.ReactNode;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** İçerik kenara yaslı (satır listeleri). */
  flush?: boolean;
}) {
  return (
    <View style={[styles.group, flush ? styles.groupFlush : null, style]}>
      <View style={[styles.groupHead, flush ? styles.groupHeadFlush : null]}>
        {icon ? <IconTile icon={icon} tone={tone} size={28} glow={false} /> : <LinearGradient colors={colors.gradientSignature} style={styles.groupRail} />}
        <View style={styles.flex}>
          <Text style={styles.groupTitle} numberOfLines={1} accessibilityRole="header" {...textScale.dense}>
            {upperTR(title)}
          </Text>
          {hint ? (
            <Text style={styles.groupHint} {...textScale.long}>
              {hint}
            </Text>
          ) : null}
        </View>
        {right}
      </View>
      {children}
    </View>
  );
}

/* ═══════════════════════════════ SATIR ═══════════════════════════════ */

export function OpsRow({
  icon,
  tone = "violet",
  leading,
  title,
  meta,
  value,
  badge,
  onPress,
  divider,
  selected,
  accessibilityLabel,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  tone?: IconTileTone;
  leading?: React.ReactNode;
  title: string;
  meta?: string | null;
  value?: string | number | null;
  badge?: { label: string; tone: Tone } | null;
  onPress?: () => void;
  divider?: boolean;
  selected?: boolean;
  accessibilityLabel?: string;
}) {
  const body = (
    <>
      {selected ? <LinearGradient colors={colors.gradientSignature} style={styles.rowRail} /> : null}
      {leading ?? (icon ? <IconTile icon={icon} tone={tone} size={38} glow={false} /> : null)}
      <View style={styles.flex}>
        <Text style={styles.rowTitle} numberOfLines={1} {...textScale.dense}>
          {title}
        </Text>
        {meta ? (
          <Text style={styles.rowMeta} numberOfLines={1} {...textScale.dense}>
            {meta}
          </Text>
        ) : null}
      </View>
      {badge ? <Badge label={badge.label} tone={badge.tone} size="xs" /> : null}
      {value != null && value !== "" ? (
        <Text style={styles.rowValue} numberOfLines={1} {...textScale.badge}>
          {value}
        </Text>
      ) : null}
      {onPress ? <Ionicons name="chevron-forward" size={15} color={colors.textTertiary} /> : null}
    </>
  );
  const rowStyle = [styles.row, divider ? styles.rowDivider : null, selected ? styles.rowSelected : null];
  return onPress ? (
    <Touchable onPress={onPress} feedback="row" style={rowStyle} accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? [title, meta].filter(Boolean).join(", ")}>
      {body}
    </Touchable>
  ) : (
    <View style={rowStyle} accessible accessibilityLabel={accessibilityLabel ?? [title, meta].filter(Boolean).join(", ")}>
      {body}
    </View>
  );
}

/* ═══════════════════════════════ STİLLER ═══════════════════════════════ */

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  flexShrink: { flexShrink: 1, minWidth: 0 },

  stage: {
    borderRadius: radius.xxl,
    overflow: "hidden",
    backgroundColor: colors.adminBar,
    padding: space.lg,
    gap: space.md,
    borderWidth: hairline,
    borderColor: colors.inkTileBorder,
  },
  stageTile: {
    flex: 1,
    minWidth: 0,
    paddingVertical: space.sm,
    paddingHorizontal: space.m,
    borderRadius: radius.md,
    backgroundColor: colors.inkTile,
    borderWidth: hairline,
    borderColor: colors.inkTileBorder,
    gap: space.xxs,
  },
  stageTileHead: { flexDirection: "row", alignItems: "center", gap: space.xs },
  stageTileLabel: { ...type.overline, color: colors.onDarkMuted, flexShrink: 1 },
  stageTileValue: { ...type.metricSm, color: colors.onDark },

  tiles: { flexDirection: "row", gap: space.sm },
  tile: {
    flex: 1,
    minWidth: 0,
    paddingTop: space.m,
    paddingBottom: space.m,
    paddingHorizontal: space.m,
    borderRadius: radius.lg,
    backgroundColor: colors.glass,
    borderWidth: hairline,
    borderColor: colors.glassLine,
    gap: space.xs,
    overflow: "hidden",
  },
  tileOn: { backgroundColor: colors.brandDim, borderWidth: 1 },
  tileHead: { flexDirection: "row", alignItems: "center", gap: space.xs },
  tileDot: { width: 6, height: 6, borderRadius: 3 },
  tileLabel: { ...type.overline, color: colors.textTertiary, flexShrink: 1 },
  tileLabelOn: { color: colors.textPrimary },
  tileValue: { ...type.metric, color: colors.textPrimary },
  tileUnder: { position: "absolute", left: 0, right: 0, bottom: 0, height: 3 },

  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    paddingHorizontal: space.s,
    height: 20,
    borderRadius: radius.pill,
    maxWidth: "100%",
  },
  pillDark: { borderWidth: hairline, borderColor: colors.inkPillBorder },
  pillText: { ...type.labelXs, flexShrink: 1 },
  pillStrong: { ...type.numSmStrong, flexShrink: 1 },

  card: {
    height: OPS_MATCH_CARD_HEIGHT,
    flexDirection: "row",
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.glassLine,
    overflow: "hidden",
  },
  cardLive: { borderColor: colors.live, borderWidth: 1 },
  cardRail: { width: 3 },
  cardBody: {
    flex: 1,
    minWidth: 0,
    paddingVertical: space.m,
    paddingLeft: space.md,
    paddingRight: space.md,
    gap: space.s,
  },
  cardTop: { flexDirection: "row", alignItems: "center", gap: space.xs, height: 20 },
  cardMain: { flexDirection: "row", alignItems: "center", gap: space.md, flex: 1 },
  teams: { flex: 1, minWidth: 0, gap: space.xs },
  teamLine: { flexDirection: "row", alignItems: "center", gap: space.sm, height: 24 },
  teamName: { ...type.h4, color: colors.textPrimary, flex: 1 },
  teamDim: { color: colors.textTertiary },
  cardFoot: { flexDirection: "row", alignItems: "center", gap: space.xs, height: 20, overflow: "hidden" },
  cardMeta: { ...type.caption, color: colors.textTertiary, flexShrink: 1 },
  okRow: { flexDirection: "row", alignItems: "center", gap: space.xs },

  plate: {
    width: 46,
    height: 52,
    borderRadius: radius.md,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  plateLg: { width: 64, height: 76, borderRadius: radius.lg },
  plateIdle: { backgroundColor: colors.surface3, borderWidth: hairline, borderColor: colors.border, gap: space.xxs, width: 58 },
  plateTime: { ...type.scoreXs, color: colors.textPrimary },
  plateTimeLg: { ...type.scoreSm },
  plateCaption: { ...type.overline, color: colors.textTertiary },
  plateDigit: { ...type.scoreXs, color: colors.onDark, lineHeight: 20 },
  plateDigitLg: { ...type.scoreMd },
  plateDigitDim: { color: colors.onDarkMuted },
  plateRule: { width: 18, height: hairline, backgroundColor: colors.borderOnDark, marginVertical: space.xxs },

  dayHead: {
    height: DAY_HEADER_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingTop: space.sm,
    paddingHorizontal: space.xxs,
  },
  dayStamp: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.glass,
    borderWidth: hairline,
    borderColor: colors.glassLine,
  },
  dayStampLive: { backgroundColor: colors.liveDim, borderColor: colors.live },
  dayNum: { ...type.scoreXs, color: colors.textPrimary, lineHeight: 17 },
  dayMonth: { ...type.overline, color: colors.brandAccent, lineHeight: 11 },
  dayTitle: { ...type.h3, color: colors.textPrimary },
  dayMeta: { ...type.caption, color: colors.textTertiary, flexShrink: 1 },
  dayMetaRow: { flexDirection: "row", alignItems: "center", gap: space.xs },
  dayDot: { width: 6, height: 6, borderRadius: 3 },

  group: {
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.glassLine,
    padding: space.lg,
    gap: space.md,
    overflow: "hidden",
  },
  groupFlush: { paddingHorizontal: 0, paddingBottom: space.xs, gap: space.xs },
  groupHead: { flexDirection: "row", alignItems: "center", gap: space.m },
  groupHeadFlush: { paddingHorizontal: space.lg },
  groupRail: { width: 3, height: 16, borderRadius: 2 },
  groupTitle: { ...type.overline, color: colors.textSecondary },
  groupHint: { ...type.caption, color: colors.textTertiary, marginTop: space.xxs },

  row: {
    minHeight: 60,
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: layout.rowPaddingH,
    paddingVertical: space.sm,
  },
  rowDivider: { borderTopWidth: hairline, borderTopColor: colors.separator },
  rowSelected: { backgroundColor: colors.brandDim },
  rowRail: { position: "absolute", left: 0, top: 0, bottom: 0, width: 3 },
  rowTitle: { ...type.h4, color: colors.textPrimary },
  rowMeta: { ...type.caption, color: colors.textTertiary, marginTop: space.xxs },
  rowValue: { ...type.tableNumStrong, fontFamily: fonts.bold, color: colors.textPrimary },
});
