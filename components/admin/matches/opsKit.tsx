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

/* ═══════════════════════════════ KAYIT KARTI ═══════════════════════════════ */

export interface OpsSpec {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  /** "warn" eksik bilgi, "win" tamam; verilmezse nötr. */
  tone?: Tone;
}

/**
 * Lig/sezon/kitapçık/kura kaydı: solda IconTile (ya da logo), başlık + alt
 * metin, altında ikonlu "özellik" hapları; sağda Archivo değer ya da durum
 * rozeti. Solda 3 px şerit kaydın durum rengidir.
 */
export const OpsRecord = memo(function OpsRecord({
  icon,
  tone = "violet",
  leading,
  title,
  subtitle,
  specs,
  status,
  value,
  valueLabel,
  rail,
  muted,
  footer,
  onPress,
  accessibilityLabel,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  tone?: IconTileTone;
  leading?: React.ReactNode;
  title: string;
  subtitle?: string | null;
  specs?: (OpsSpec | null | false | undefined)[];
  status?: { label: string; tone: Tone; dot?: boolean } | null;
  value?: string | number | null;
  valueLabel?: string;
  rail?: Tone | null;
  muted?: boolean;
  footer?: React.ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  const list = (specs ?? []).filter(Boolean) as OpsSpec[];
  const body = (
    <>
      {rail ? <View style={[styles.recRail, { backgroundColor: toneColor(rail) }]} /> : null}
      <View style={styles.recTop}>
        {leading ?? (icon ? <IconTile icon={icon} tone={muted ? "neutral" : tone} size={42} glow={!muted} /> : null)}
        <View style={styles.flex}>
          <View style={styles.recTitleRow}>
            <Text style={[styles.recTitle, muted ? styles.recMuted : null]} numberOfLines={1} {...textScale.dense}>
              {title}
            </Text>
          </View>
          {subtitle ? (
            <Text style={styles.recSub} numberOfLines={1} {...textScale.dense}>
              {subtitle}
            </Text>
          ) : null}
          {status ? (
            <View style={styles.recStatus}>
              <Badge label={status.label} tone={status.tone} size="xs" dot={status.dot} />
            </View>
          ) : null}
        </View>
        {value != null && value !== "" ? (
          <View style={styles.recValueBox}>
            <Text style={styles.recValue} numberOfLines={1} {...textScale.badge}>
              {value}
            </Text>
            {valueLabel ? (
              <Text style={styles.recValueLabel} numberOfLines={1} {...textScale.badge}>
                {upperTR(valueLabel)}
              </Text>
            ) : null}
          </View>
        ) : null}
        {onPress ? <Ionicons name="chevron-forward" size={15} color={colors.textTertiary} /> : null}
      </View>
      {list.length ? (
        <View style={styles.recSpecs}>
          {list.map((spec) => (
            <InfoPill key={`${spec.icon}-${spec.label}`} icon={spec.icon} label={spec.label} tone={spec.tone} />
          ))}
        </View>
      ) : null}
      {footer}
    </>
  );
  const label = accessibilityLabel ?? [title, subtitle, status?.label, value].filter(Boolean).join(", ");
  return onPress ? (
    <Touchable feedback="card" onPress={onPress} style={[styles.rec, muted ? styles.recMutedBox : null]} accessibilityRole="button" accessibilityLabel={label}>
      {body}
    </Touchable>
  ) : (
    <View style={[styles.rec, muted ? styles.recMutedBox : null]} accessible accessibilityLabel={label}>
      {body}
    </View>
  );
});

/* ═══════════════════════════════ ADIM RAYI ═══════════════════════════════ */

export interface StepRailItem<K extends string> {
  key: K;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  done?: boolean;
  /** Etiketin yanında küçük sayaç ("7/11"). */
  meta?: string;
}

/**
 * Sihirbaz adım göstergesi: numaralı yuvarlak duraklar, aralarında imza
 * degradesiyle dolan çizgi. Biten adım yeşil onay taşır. Dokununca adım değişir.
 */
export function StepRail<K extends string>({ items, value, onChange }: { items: StepRailItem<K>[]; value: K; onChange: (key: K) => void }) {
  const active = Math.max(0, items.findIndex((i) => i.key === value));
  return (
    <View style={styles.rail} accessibilityRole="tablist">
      <View style={[styles.railTrack, { left: `${50 / items.length}%`, right: `${50 / items.length}%` }]} pointerEvents="none">
        <View style={styles.railBase} />
        <LinearGradient
          colors={colors.gradientSignature}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={[styles.railFill, { width: items.length > 1 ? `${(active / (items.length - 1)) * 100}%` : "0%" }]}
        />
      </View>
      {items.map((item, index) => {
        const on = index === active;
        const passed = index < active;
        return (
          <Touchable
            key={item.key}
            feedback="none"
            haptic="selection"
            onPress={() => onChange(item.key)}
            style={styles.railStep}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${index + 1}. adım: ${item.label}${item.done ? ", tamam" : ""}`}
          >
            <View style={[styles.railDot, on ? styles.railDotOn : passed ? styles.railDotPassed : null]}>
              {on ? <LinearGradient colors={colors.gradientSignature} style={[StyleSheet.absoluteFill, styles.railDotFill]} /> : null}
              <Ionicons name={item.icon} size={16} color={on ? colors.onDark : colors.textSecondary} />
              {item.done && !on ? (
                <View style={styles.railDone}>
                  <Ionicons name="checkmark" size={9} color={colors.textOnStatus} />
                </View>
              ) : null}
            </View>
            <Text style={[styles.railLabel, on ? styles.railLabelOn : null]} numberOfLines={1} {...textScale.badge}>
              {item.label}
            </Text>
            {item.meta ? (
              <Text style={styles.railMeta} numberOfLines={1} {...textScale.badge}>
                {item.meta}
              </Text>
            ) : null}
          </Touchable>
        );
      })}
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

  rail: {
    flexDirection: "row",
    paddingVertical: space.md,
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.glassLine,
  },
  railTrack: { position: "absolute", top: space.md + 17, height: 2 },
  railBase: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.surface3, borderRadius: 1 },
  railFill: { position: "absolute", left: 0, top: 0, bottom: 0, borderRadius: 1 },
  railStep: { flex: 1, alignItems: "center", gap: space.xxs },
  railDot: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: space.xxs,
  },
  railDotOn: { borderColor: colors.brandBorder },
  railDotPassed: { backgroundColor: colors.brandDim, borderColor: colors.brandBorder },
  railDotFill: { borderRadius: 18 },
  railDone: {
    position: "absolute",
    right: -3,
    top: -3,
    width: 15,
    height: 15,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.win,
    borderWidth: 2,
    borderColor: colors.surface1,
  },
  railLabel: { ...type.labelXs, color: colors.textSecondary },
  railLabelOn: { color: colors.textPrimary },
  railMeta: { ...type.nano, color: colors.textTertiary },

  rec: {
    gap: space.m,
    padding: space.md,
    paddingLeft: space.md + space.xxs,
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.glassLine,
    overflow: "hidden",
  },
  recMutedBox: { backgroundColor: colors.surface2 },
  recRail: { position: "absolute", left: 0, top: 0, bottom: 0, width: 3 },
  recTop: { flexDirection: "row", alignItems: "center", gap: space.md },
  recTitleRow: { flexDirection: "row", alignItems: "center", gap: space.xs },
  recTitle: { ...type.h3, color: colors.textPrimary, flexShrink: 1 },
  recMuted: { color: colors.textSecondary },
  recSub: { ...type.caption, color: colors.textTertiary, marginTop: space.xxs },
  recStatus: { flexDirection: "row", marginTop: space.xs },
  recValueBox: { alignItems: "flex-end", minWidth: 36 },
  recValue: { ...type.scoreSm, color: colors.textPrimary },
  recValueLabel: { ...type.overline, color: colors.textTertiary },
  recSpecs: { flexDirection: "row", flexWrap: "wrap", gap: space.xs, paddingLeft: 42 + space.md },
});

/* ═══════════════════════════════ EK PARÇALAR (adım içleri) ═══════════════════════════════
 * Maç öncesi / maç sonu adımlarının ve lig ayarı düzenleyicilerinin ortak
 * parçaları. Geriye uyumlu eklemedir; yukarıdaki API değişmez.
 *
 *   · NextStepCard — "sıradaki adım" kartı: degrade IconTile + versal üst
 *                    etiket + başlık + açıklama; sağda yuvarlak ok düğmesi.
 *   · CheckGrid    — hazırlık denetimi: üstte yüzde + GradientBar, altında
 *                    iki sütun onay/eksik satırları.
 *   · FieldPair    — iki form alanını yan yana dizer (tarih + saat gibi).
 *   · VersusDivider — iki takım seçimi arasındaki "VS" ayracı.
 *   · MiniStat     — kart içi küçük rakam hücresi (Archivo + versal etiket).
 */

export function NextStepCard({
  icon,
  overline = "Sıradaki adım",
  title,
  text,
  tone = "signature",
  onPress,
  actionLabel,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  overline?: string;
  title: string;
  text?: string | null;
  tone?: IconTileTone;
  onPress?: () => void;
  actionLabel?: string;
}) {
  const body = (
    <>
      <LinearGradient colors={colors.gradientSignature} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={kit.nextRail} />
      <IconTile icon={icon} tone={tone} size={44} />
      <View style={styles.flex}>
        <Text style={kit.nextOver} numberOfLines={1} {...textScale.badge}>
          {upperTR(overline)}
        </Text>
        <Text style={kit.nextTitle} numberOfLines={1} {...textScale.dense}>
          {title}
        </Text>
        {text ? (
          <Text style={kit.nextText} {...textScale.long}>
            {text}
          </Text>
        ) : null}
      </View>
      {onPress ? (
        <View style={kit.nextGo}>
          <LinearGradient colors={colors.gradientSignature} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, kit.nextGoFill]} />
          <Ionicons name="arrow-forward" size={18} color={colors.onDark} />
        </View>
      ) : null}
    </>
  );
  return onPress ? (
    <Touchable feedback="card" onPress={onPress} style={kit.next} accessibilityRole="button" accessibilityLabel={`${actionLabel ?? title}. ${text ?? ""}`}>
      {body}
    </Touchable>
  ) : (
    <View style={kit.next} accessible accessibilityLabel={`${title}. ${text ?? ""}`}>
      {body}
    </View>
  );
}

export interface CheckItem {
  label: string;
  ok: boolean;
  /** Eksikken gösterilen kısa not; verilmezse "Eksik". */
  hint?: string;
  /** Zorunlu değilse eksik uyarı tonu yerine nötr görünür. */
  optional?: boolean;
  /** Etiketin yanında küçük sayaç ("7/11"). */
  meta?: string;
  /** Verilirse satır dokunulabilir olur (ilgili bölüme git). */
  onPress?: () => void;
}

export function CheckGrid({
  title = "Hazırlık",
  items,
  style,
  footer,
}: {
  title?: string;
  items: CheckItem[];
  style?: StyleProp<ViewStyle>;
  /** Kartın dibinde ek satır (kaydedilmemiş değişiklik notu gibi). */
  footer?: React.ReactNode;
}) {
  const done = items.filter((i) => i.ok).length;
  const ratio = items.length ? done / items.length : 0;
  const full = done === items.length;
  const missingRequired = items.filter((i) => !i.ok && !i.optional).length;
  return (
    <View style={[styles.group, kit.checkBox, style]} accessible accessibilityLabel={`${title}: ${done}/${items.length} tamam`}>
      <View style={kit.checkHead}>
        <View style={styles.flex}>
          <Text style={styles.groupTitle} {...textScale.dense}>
            {upperTR(title)}
          </Text>
          <Text style={kit.checkSub} numberOfLines={1} {...textScale.dense}>
            {full ? "Her şey hazır" : missingRequired ? `${missingRequired} zorunlu bilgi eksik` : "Zorunlu bilgiler tamam"}
          </Text>
        </View>
        <Text style={[kit.checkPct, full || !missingRequired ? { color: colors.win } : null]} {...textScale.badge}>
          {done}
          <Text style={kit.checkPctOf}>/{items.length}</Text>
        </Text>
      </View>
      <GradientBarLite value={ratio} />
      <View style={kit.checkGrid}>
        {items.map((item) => {
          const fg = item.ok ? colors.win : item.optional ? colors.textTertiary : colors.warn;
          const Cell = item.onPress ? Touchable : View;
          const cellProps = item.onPress
            ? {
                onPress: item.onPress,
                feedback: "row" as const,
                haptic: "selection" as const,
                accessibilityRole: "button" as const,
                accessibilityLabel: `${item.label}${item.meta ? ` ${item.meta}` : ""}, ${item.ok ? "tamam" : "eksik"}. Bölüme git`,
              }
            : {};
          return (
            <Cell key={item.label} style={[kit.checkCell, item.onPress ? kit.checkCellTap : null]} {...cellProps}>
              <View style={[kit.checkIcon, { backgroundColor: item.ok ? colors.winDim : item.optional ? colors.surface2 : colors.warnDim }]}>
                <Ionicons name={item.ok ? "checkmark" : item.optional ? "remove" : "alert"} size={12} color={fg} />
              </View>
              <View style={styles.flex}>
                <Text style={kit.checkLabel} numberOfLines={1} {...textScale.dense}>
                  {item.label}
                  {item.meta ? <Text style={kit.checkMeta}>{`  ${item.meta}`}</Text> : null}
                </Text>
                {!item.ok ? (
                  <Text style={[kit.checkHint, { color: fg }]} numberOfLines={1} {...textScale.dense}>
                    {item.hint ?? (item.optional ? "İsteğe bağlı" : "Eksik")}
                  </Text>
                ) : null}
              </View>
            </Cell>
          );
        })}
      </View>
      {footer}
    </View>
  );
}

/** GradientBar'ın hareketsiz, bağımlılıksız küçük eşi (kit içi). */
function GradientBarLite({ value }: { value: number }) {
  const v = Math.max(0, Math.min(1, value));
  return (
    <View style={kit.barTrack}>
      <LinearGradient
        colors={v >= 1 ? [colors.win, colors.win] : colors.gradientSignature}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={[kit.barFill, { width: `${v * 100}%` }]}
      />
    </View>
  );
}

export function FieldPair({ children }: { children: React.ReactNode }) {
  return (
    <View style={kit.pair}>
      {React.Children.map(children, (child) => (child ? <View style={styles.flex}>{child}</View> : null))}
    </View>
  );
}

export function VersusDivider({ label = "VS" }: { label?: string }) {
  return (
    <View style={kit.vs} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={kit.vsLine} />
      <View style={kit.vsBadge}>
        <Text style={kit.vsText} {...textScale.badge}>
          {label}
        </Text>
      </View>
      <View style={kit.vsLine} />
    </View>
  );
}

export function MiniStat({ label, value, tone, style }: { label: string; value: string | number; tone?: Tone; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[kit.mini, style]} accessible accessibilityLabel={`${label}: ${value}`}>
      {typeof value === "number" ? (
        <Odometer value={value} style={[kit.miniValue, tone ? { color: toneColor(tone) } : null]} />
      ) : (
        <Text style={[kit.miniValue, tone ? { color: toneColor(tone) } : null]} numberOfLines={1} {...textScale.badge}>
          {value}
        </Text>
      )}
      <Text style={kit.miniLabel} numberOfLines={1} {...textScale.badge}>
        {upperTR(label)}
      </Text>
    </View>
  );
}

const kit = StyleSheet.create({
  next: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    padding: space.md,
    paddingLeft: space.lg,
    borderRadius: radius.xl,
    backgroundColor: colors.brandDim,
    borderWidth: hairline,
    borderColor: colors.brandBorder,
    overflow: "hidden",
  },
  nextRail: { position: "absolute", left: 0, top: 0, bottom: 0, width: 3 },
  nextOver: { ...type.overline, color: colors.brandAccent },
  nextTitle: { ...type.h3, color: colors.textPrimary, marginTop: space.xxs },
  nextText: { ...type.caption, color: colors.textSecondary, marginTop: space.xxs },
  nextGo: { width: 40, height: 40, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  nextGoFill: { borderRadius: radius.pill },

  checkBox: { gap: space.m },
  checkHead: { flexDirection: "row", alignItems: "flex-end", gap: space.md },
  checkSub: { ...type.h4, color: colors.textPrimary, marginTop: space.xxs },
  checkPct: { ...type.scoreMd, color: colors.textPrimary },
  checkPctOf: { ...type.scoreXs, color: colors.textTertiary },
  checkGrid: { flexDirection: "row", flexWrap: "wrap", rowGap: space.m },
  checkCell: { width: "50%", flexDirection: "row", alignItems: "center", gap: space.s, paddingRight: space.s },
  checkIcon: { width: 22, height: 22, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  checkCellTap: { minHeight: 36, borderRadius: radius.md },
  checkLabel: { ...type.labelSm, color: colors.textPrimary },
  checkMeta: { ...type.numSm, color: colors.textTertiary },
  checkHint: { ...type.meta },
  barTrack: { height: 6, borderRadius: 3, backgroundColor: colors.surface3, overflow: "hidden" },
  barFill: { height: 6, borderRadius: 3 },

  pair: { flexDirection: "row", gap: space.m },

  vs: { flexDirection: "row", alignItems: "center", gap: space.m, marginVertical: -space.xs },
  vsLine: { flex: 1, height: hairline, backgroundColor: colors.separator },
  vsBadge: {
    paddingHorizontal: space.m,
    paddingVertical: space.xxs,
    borderRadius: radius.pill,
    backgroundColor: colors.surface2,
    borderWidth: hairline,
    borderColor: colors.glassLine,
  },
  vsText: { ...type.overline, color: colors.brandAccent },

  mini: {
    flex: 1,
    alignItems: "center",
    paddingVertical: space.m,
    borderRadius: radius.lg,
    backgroundColor: colors.surface2,
    borderWidth: hairline,
    borderColor: colors.glassLine,
    gap: space.xxs,
  },
  miniValue: { ...type.scoreMd, color: colors.textPrimary },
  miniLabel: { ...type.overline, color: colors.textTertiary },
});

/**
 * Numaralı form bölümü (sihirbaz sayfaları): sıra pulu (tamamsa yeşil onay) +
 * versal başlık + isteğe bağlı sağ öğe; içerik cam kartta.
 */
export function NumberedSection({
  index,
  title,
  done,
  right,
  children,
  style,
}: {
  index: number;
  title: string;
  done?: boolean;
  right?: React.ReactNode;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.group, style]}>
      <View style={styles.groupHead}>
        <View style={[kit2.dot, done ? kit2.dotDone : null]}>
          {done ? (
            <Ionicons name="checkmark" size={12} color={colors.textOnStatus} />
          ) : (
            <Text style={kit2.no} {...textScale.badge}>
              {index}
            </Text>
          )}
        </View>
        <Text style={[styles.groupTitle, styles.flex]} numberOfLines={1} accessibilityRole="header" {...textScale.dense}>
          {upperTR(title)}
        </Text>
        {right}
      </View>
      {children}
    </View>
  );
}

const kit2 = StyleSheet.create({
  dot: { width: 22, height: 22, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.brandAccent },
  dotDone: { backgroundColor: colors.win },
  no: { ...type.numSmStrong, color: colors.onDark },
});

/** Büyük rakamın altındaki ± düğme çifti (sayaç hücreleri; değer ayrı çizilir). */
export function BumpButtons({ value, min, max, step = 1, onChange, label }: { value: number; min: number; max: number; step?: number; onChange: (v: number) => void; label: string }) {
  return (
    <View style={kit3.row}>
      {([-step, step] as const).map((d) => {
        const next = value + d;
        const off = next < min || next > max;
        return (
          <Touchable
            key={d}
            onPress={() => !off && onChange(next)}
            disabled={off}
            haptic="selection"
            feedback="icon"
            style={[kit3.btn, off ? kit3.off : null]}
            accessibilityRole="button"
            accessibilityLabel={`${label} ${d > 0 ? "artır" : "azalt"}`}
          >
            <Ionicons name={d > 0 ? "add" : "remove"} size={16} color={colors.textPrimary} />
          </Touchable>
        );
      })}
    </View>
  );
}

const kit3 = StyleSheet.create({
  row: { flexDirection: "row", gap: space.xs },
  btn: {
    width: 38,
    height: 32,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.glassLine,
  },
  off: { opacity: 0.35 },
});
