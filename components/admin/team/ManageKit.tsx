/**
 * YÖNETİM KAYIT KİTİ — takım, oyuncu, üye, disiplin ve onay kuyruğu ekranlarının
 * ortak parçaları (yalnız bu alan; ortak yönetim kabuğu `components/admin/*`).
 *
 *   CountStrip     ekranın tepesindeki sayaç şeridi: cam karolar, dönen rakam
 *                  (Odometer), ton noktası; basılabilir karo filtre seçer.
 *   IdentityStage  kimlik sahnesi (takım / oyuncu / üye detayı): gece laciverti
 *                  + Aurora, büyük görsel, ad, haplar, beyaz rakam şeridi.
 *   EntityCard     varlık kartı (takım / oyuncu / üye): öndeki görsel, başlık,
 *                  meta, durum hapları, eksik bilgi uyarısı, alt rakam hücreleri.
 *   RequestCard    onay kuyruğu kartı: kimden / ne zaman / öncelik, içerik,
 *                  altta belirgin Onayla / Reddet.
 *   DangerNote     yıkıcı işlemin net uyarısı (kırmızı / altın kutu).
 *   SelectionBar   toplu işlemde seçim sayacı + eylemler.
 *   PositionAvatar mevki halkalı avatar (halka rengi = hat, yanında 3 harf).
 *   StagePill      koyu sahne üstü küçük hap.
 *   GroupCard      gruplu form / bölüm kartı (versal başlık + satırlar).
 *
 * Kurallar docs/gece-temasi.md "Detay rehberi" ile aynı: çıplak renk yok,
 * rakamlar Archivo, haplar Badge tonları, tek seferlik giriş hareketi.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import {
  Aurora,
  Avatar,
  Badge,
  Button,
  Chip,
  IconTile,
  Odometer,
  Touchable,
  type IconTileTone,
  type Tone,
} from "@/components/ui";
import { OptionSheet, type Option } from "@/components/admin/OptionSheet";
import { positionLine } from "@/lib/api/team";
import { colors, hairline, positionBadge, positionColor, radius, space, textScale, type, upperTR } from "@/theme";

type IconName = keyof typeof Ionicons.glyphMap;

export const TONE_FG: Record<Tone, string> = {
  neutral: colors.textSecondary,
  brand: colors.brandAccent,
  accent: colors.accentText,
  live: colors.live,
  win: colors.win,
  warn: colors.warn,
  danger: colors.danger,
  info: colors.info,
};

export const TONE_TILE: Record<Tone, IconTileTone> = {
  neutral: "neutral",
  brand: "violet",
  accent: "cyan",
  live: "pink",
  win: "mint",
  warn: "gold",
  danger: "red",
  info: "cyan",
};

/* ═══════════════════════════════ SAYAÇ ŞERİDİ ═══════════════════════════════ */

export interface CountItem {
  key?: string;
  label: string;
  value: number | string;
  tone?: Tone;
  icon?: IconName;
  /** Seçili filtre karosu (brandDim zemin + imza şeridi). */
  selected?: boolean;
  onPress?: () => void;
  hint?: string | null;
}

export function CountStrip({ items, style }: { items: CountItem[]; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[kit.strip, style]}>
      {items.map((item) => {
        const color = item.tone && item.tone !== "neutral" ? TONE_FG[item.tone] : colors.textPrimary;
        const body = (
          <>
            {item.selected ? (
              <LinearGradient colors={colors.gradientSignature} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={kit.stripRail} />
            ) : null}
            <View style={kit.stripHead}>
              {item.icon ? (
                <Ionicons name={item.icon} size={12} color={item.tone ? TONE_FG[item.tone] : colors.textTertiary} />
              ) : item.tone ? (
                <View style={[kit.stripDot, { backgroundColor: TONE_FG[item.tone] }]} />
              ) : null}
              <Text style={kit.stripLabel} numberOfLines={1} {...textScale.badge}>
                {upperTR(item.label)}
              </Text>
            </View>
            {typeof item.value === "number" ? (
              <Odometer value={item.value} style={[kit.stripValue, { color }]} />
            ) : (
              <Text style={[kit.stripValue, { color }]} numberOfLines={1} adjustsFontSizeToFit {...textScale.badge}>
                {item.value}
              </Text>
            )}
            {item.hint ? (
              <Text style={kit.stripHint} numberOfLines={1} {...textScale.badge}>
                {item.hint}
              </Text>
            ) : null}
          </>
        );
        const tileStyle = [kit.stripTile, item.selected ? kit.stripTileOn : null];
        return item.onPress ? (
          <Touchable
            key={item.key ?? item.label}
            feedback="card"
            haptic="selection"
            onPress={item.onPress}
            style={tileStyle}
            accessibilityRole="button"
            accessibilityState={{ selected: !!item.selected }}
            accessibilityLabel={`${item.label}: ${item.value}`}
          >
            {body}
          </Touchable>
        ) : (
          <View key={item.key ?? item.label} style={tileStyle} accessible accessibilityLabel={`${item.label}: ${item.value}`}>
            {body}
          </View>
        );
      })}
    </View>
  );
}

/* ═══════════════════════════════ SEÇİCİ ÇİP ═══════════════════════════════ */

/**
 * Filtre şeridinde yer kaplamayan seçici: çip mevcut değeri gösterir, basınca
 * OptionSheet açılır. Değer seçiliyken çip dolu (seçili) çizilir.
 */
export function PickerChip<V extends string | number>({
  icon,
  placeholder,
  title,
  value,
  options,
  loadOptions,
  queryKey,
  onChange,
  clearable = true,
  highlight,
}: {
  icon?: IconName;
  placeholder: string;
  title: string;
  value: V | null | undefined;
  options?: Option<V>[];
  loadOptions?: (q: string) => Promise<Option<V>[]>;
  queryKey?: readonly unknown[];
  onChange: (value: V | null) => void;
  clearable?: boolean;
  /** Seçili görünümü zorla (sıralama çipi gibi daima değeri olanlarda false). */
  highlight?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [picked, setPicked] = React.useState<string | null>(null);
  const label = value != null ? options?.find((o) => o.value === value)?.label ?? picked ?? String(value) : placeholder;
  const on = highlight ?? (value != null && clearable);
  return (
    <>
      <Chip
        label={label}
        icon={icon}
        size="sm"
        selected={on}
        onPress={() => setOpen(true)}
        onDismiss={on && clearable ? () => onChange(null) : undefined}
      />
      <OptionSheet<V>
        visible={open}
        onClose={() => setOpen(false)}
        title={title}
        options={options}
        loadOptions={loadOptions}
        queryKey={queryKey}
        value={value ?? null}
        clearable={clearable}
        onSelect={(v, option) => {
          const one = Array.isArray(option) ? option[0] : option;
          setPicked(one?.label ?? null);
          onChange((Array.isArray(v) ? v[0] : v) ?? null);
        }}
      />
    </>
  );
}

/* ═══════════════════════════════ KİMLİK SAHNESİ ═══════════════════════════════ */

export interface StageStat {
  label: string;
  value: number | string;
  tone?: "warn" | "win" | "danger";
}

export function IdentityStage({
  leading,
  overline,
  title,
  subtitle,
  pills,
  stats,
  footer,
  style,
}: {
  leading?: React.ReactNode;
  overline?: string | null;
  title: string;
  subtitle?: string | null;
  pills?: React.ReactNode;
  stats?: StageStat[];
  footer?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[kit.stage, style]}>
      <LinearGradient colors={colors.gradientAdminStage} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} />
      <Aurora variant="stage" />
      <View style={kit.stageHead}>
        {leading}
        <View style={kit.flex}>
          {overline ? (
            <Text style={kit.stageOverline} numberOfLines={1} {...textScale.badge}>
              {upperTR(overline)}
            </Text>
          ) : null}
          <Text style={kit.stageTitle} numberOfLines={2} accessibilityRole="header" {...textScale.dense}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={kit.stageSub} numberOfLines={2} {...textScale.dense}>
              {subtitle}
            </Text>
          ) : null}
          {pills ? <View style={kit.stagePills}>{pills}</View> : null}
        </View>
      </View>
      {stats?.length ? (
        <View style={kit.stageStats}>
          {stats.map((s, i) => (
            <View key={s.label} style={[kit.stageStat, i ? kit.stageStatDivided : null]} accessible accessibilityLabel={`${s.label}: ${s.value}`}>
              {typeof s.value === "number" ? (
                <Odometer value={s.value} style={[kit.stageStatValue, s.tone ? { color: STAGE_TONE[s.tone] } : null]} />
              ) : (
                <Text style={[kit.stageStatValue, s.tone ? { color: STAGE_TONE[s.tone] } : null]} numberOfLines={1} adjustsFontSizeToFit {...textScale.badge}>
                  {s.value}
                </Text>
              )}
              <Text style={kit.stageStatLabel} numberOfLines={1} {...textScale.badge}>
                {upperTR(s.label)}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
      {footer}
    </View>
  );
}

const STAGE_TONE = { warn: colors.adminAccent, win: colors.win, danger: colors.danger } as const;

/** Koyu sahne üstünde küçük hap (rol, durum, lig). */
export function StagePill({ label, icon, tone = "plain" }: { label: string; icon?: IconName; tone?: "plain" | "gold" | "win" | "warn" | "danger" }) {
  const fg =
    tone === "gold" ? colors.adminAccent : tone === "win" ? colors.win : tone === "warn" ? colors.warn : tone === "danger" ? colors.danger : colors.onDark;
  return (
    <View style={kit.stagePill}>
      {icon ? <Ionicons name={icon} size={11} color={fg} /> : <View style={[kit.stagePillDot, { backgroundColor: fg }]} />}
      <Text style={[kit.stagePillText, { color: fg }]} numberOfLines={1} {...textScale.badge}>
        {label}
      </Text>
    </View>
  );
}

/* ═══════════════════════════════ VARLIK KARTI ═══════════════════════════════ */

export interface EntityStat {
  label: string;
  value: string | number;
  tone?: Tone;
}

export interface EntityPill {
  label: string;
  tone?: Tone;
  icon?: IconName;
}

export function EntityCard({
  leading,
  title,
  overline,
  subtitle,
  meta,
  pills,
  warning,
  stats,
  trailing,
  selected,
  muted,
  onPress,
  onLongPress,
  footer,
  style,
  accessibilityLabel,
}: {
  leading?: React.ReactNode;
  title: string;
  overline?: string | null;
  subtitle?: string | null;
  meta?: string | null;
  pills?: (EntityPill | null | false | undefined)[];
  /** Eksik bilgi uyarısı ("Logo yok · lig atanmamış"). */
  warning?: string | null;
  stats?: EntityStat[];
  trailing?: React.ReactNode;
  selected?: boolean;
  muted?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  footer?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const shown = (pills ?? []).filter(Boolean) as EntityPill[];
  const body = (
    <>
      {selected ? (
        <LinearGradient colors={colors.gradientSignature} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={kit.cardRail} />
      ) : null}
      <View style={kit.cardTop}>
        {leading}
        <View style={kit.flex}>
          {overline ? (
            <Text style={kit.cardOverline} numberOfLines={1} {...textScale.badge}>
              {upperTR(overline)}
            </Text>
          ) : null}
          <Text style={[kit.cardTitle, muted ? kit.mutedText : null]} numberOfLines={2} {...textScale.dense}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={kit.cardSub} numberOfLines={2} {...textScale.dense}>
              {subtitle}
            </Text>
          ) : null}
          {meta ? (
            <Text style={kit.cardMeta} numberOfLines={1} {...textScale.dense}>
              {meta}
            </Text>
          ) : null}
          {shown.length ? (
            <View style={kit.pills}>
              {shown.map((p) => (
                <Badge key={p.label} label={p.label} tone={p.tone ?? "neutral"} icon={p.icon} size="xs" />
              ))}
            </View>
          ) : null}
        </View>
        {trailing ?? (onPress ? (
          <View style={kit.chevron}>
            <Ionicons name="chevron-forward" size={14} color={colors.textTertiary} />
          </View>
        ) : null)}
      </View>
      {warning ? (
        <View style={kit.warning}>
          <Ionicons name="alert-circle" size={13} color={colors.warn} />
          <Text style={kit.warningText} numberOfLines={2} {...textScale.dense}>
            {warning}
          </Text>
        </View>
      ) : null}
      {stats?.length ? (
        <View style={kit.cardStats}>
          {stats.map((s, i) => (
            <View key={s.label} style={[kit.cardStat, i ? kit.cardStatDivided : null]}>
              <Text
                style={[kit.cardStatValue, s.tone && s.tone !== "neutral" ? { color: TONE_FG[s.tone] } : null]}
                numberOfLines={1}
                adjustsFontSizeToFit
                {...textScale.badge}
              >
                {s.value}
              </Text>
              <Text style={kit.cardStatLabel} numberOfLines={1} {...textScale.badge}>
                {upperTR(s.label)}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
      {footer}
    </>
  );
  const cardStyle = [kit.card, muted ? kit.cardMuted : null, selected ? kit.cardSelected : null, style];
  if (!onPress && !onLongPress) return <View style={cardStyle}>{body}</View>;
  return (
    <Touchable
      feedback="card"
      haptic="selection"
      onPress={onPress}
      onLongPress={onLongPress}
      style={cardStyle}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      accessibilityLabel={accessibilityLabel ?? [title, subtitle, meta].filter(Boolean).join(", ")}
    >
      {body}
    </Touchable>
  );
}

/* ═══════════════════════════════ MEVKİ HALKASI ═══════════════════════════════ */

export function PositionAvatar({
  name,
  image,
  position,
  size = 44,
  jersey,
  dimmed,
}: {
  name?: string | null;
  image?: string | null;
  position?: string | null;
  size?: number;
  jersey?: number | null;
  dimmed?: boolean;
}) {
  const line = position ? positionLine(position) : null;
  const ring = dimmed ? colors.border : positionColor(colors, line);
  return (
    <View style={kit.posWrap}>
      <View style={[kit.posRing, { borderColor: ring, borderRadius: (size + 6) / 2, width: size + 6, height: size + 6 }]}>
        <Avatar name={name} image={image} size={size} />
      </View>
      {jersey != null ? (
        <View style={kit.jersey}>
          <Text style={kit.jerseyText} {...textScale.badge}>
            {jersey}
          </Text>
        </View>
      ) : null}
      <View style={[kit.posTag, { backgroundColor: ring }]}>
        <Text style={kit.posTagText} {...textScale.badge}>
          {positionBadge(line)}
        </Text>
      </View>
    </View>
  );
}

/* ═══════════════════════════════ ONAY KUYRUĞU ═══════════════════════════════ */

export function RequestCard({
  leading,
  who,
  when,
  priority,
  title,
  subtitle,
  status,
  children,
  onApprove,
  onReject,
  approveLabel = "Onayla",
  rejectLabel = "Reddet",
  busy,
  onPress,
  extraActions,
  done,
  style,
}: {
  leading?: React.ReactNode;
  /** Kimden (ad + kısa bağlam). */
  who: string;
  /** Ne zaman ("3 saat önce"). */
  when?: string | null;
  /** Öncelik / bekleme hapı. */
  priority?: EntityPill | null;
  title: string;
  subtitle?: string | null;
  /** Kuyruk dışı durum hapı (onaylandı / reddedildi). */
  status?: EntityPill | null;
  children?: React.ReactNode;
  onApprove?: () => void;
  onReject?: () => void;
  approveLabel?: string;
  rejectLabel?: string;
  busy?: boolean;
  onPress?: () => void;
  extraActions?: React.ReactNode;
  /** Sonuçlanmış istek: eylem çubuğu yerine durum. */
  done?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const accent = priority?.tone && priority.tone !== "neutral" ? TONE_FG[priority.tone] : null;
  const head = (
    <>
      {accent && !done ? <View style={[kit.reqAccent, { backgroundColor: accent }]} /> : null}
      <View style={kit.reqHead}>
        {leading}
        <View style={kit.flex}>
          <Text style={kit.reqWho} numberOfLines={1} {...textScale.dense}>
            {who}
          </Text>
          {when ? (
            <View style={kit.reqWhenRow}>
              <Ionicons name="time-outline" size={11} color={colors.textTertiary} />
              <Text style={kit.reqWhen} numberOfLines={1} {...textScale.dense}>
                {when}
              </Text>
            </View>
          ) : null}
        </View>
        {status ? (
          <Badge label={status.label} tone={status.tone ?? "neutral"} icon={status.icon} size="xs" />
        ) : priority ? (
          <Badge label={priority.label} tone={priority.tone ?? "neutral"} icon={priority.icon} size="xs" />
        ) : null}
      </View>
      <View style={kit.reqBody}>
        <Text style={kit.reqTitle} numberOfLines={3} {...textScale.dense}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={kit.reqSub} numberOfLines={3} {...textScale.dense}>
            {subtitle}
          </Text>
        ) : null}
        {children}
      </View>
    </>
  );
  return (
    <View style={[kit.req, done ? kit.cardMuted : null, style]}>
      {onPress ? (
        <Touchable feedback="row" onPress={onPress} accessibilityRole="button" accessibilityLabel={`${who}: ${title}`}>
          {head}
        </Touchable>
      ) : (
        head
      )}
      {!done && (onApprove || onReject || extraActions) ? (
        <View style={kit.reqActions}>
          {onReject ? (
            <Button label={rejectLabel} icon="close" variant="secondary" size="md" onPress={onReject} disabled={busy} style={kit.reqBtn} />
          ) : null}
          {onApprove ? (
            <Button label={approveLabel} icon="checkmark" size="md" onPress={onApprove} loading={busy} style={kit.reqBtn} />
          ) : null}
          {extraActions}
        </View>
      ) : null}
    </View>
  );
}

/** İsteğin önce → sonra değişikliği (alan: eski ▸ yeni). */
export function DiffLine({ label, from, to }: { label: string; from?: string | null; to?: string | null }) {
  return (
    <View style={kit.diff}>
      <Text style={kit.diffLabel} numberOfLines={1} {...textScale.badge}>
        {upperTR(label)}
      </Text>
      <View style={kit.diffRow}>
        <Text style={kit.diffFrom} numberOfLines={2} {...textScale.dense}>
          {from || "—"}
        </Text>
        <Ionicons name="arrow-forward" size={12} color={colors.textTertiary} />
        <Text style={kit.diffTo} numberOfLines={2} {...textScale.dense}>
          {to || "—"}
        </Text>
      </View>
    </View>
  );
}

/* ═══════════════════════════════ UYARI ═══════════════════════════════ */

export function DangerNote({
  title,
  body,
  tone = "danger",
  icon,
  style,
}: {
  title: string;
  body?: string | null;
  tone?: "danger" | "warn" | "info";
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
}) {
  const fg = tone === "danger" ? colors.danger : tone === "warn" ? colors.warn : colors.info;
  const bg = tone === "danger" ? colors.dangerDim : tone === "warn" ? colors.warnDim : colors.infoDim;
  return (
    <View style={[kit.note, { backgroundColor: bg, borderColor: fg }, style]} accessibilityRole="alert">
      <Ionicons name={icon ?? (tone === "info" ? "information-circle" : "warning")} size={18} color={fg} />
      <View style={kit.flex}>
        <Text style={[kit.noteTitle, { color: fg }]} {...textScale.dense}>
          {title}
        </Text>
        {body ? (
          <Text style={kit.noteBody} {...textScale.long}>
            {body}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/* ═══════════════════════════════ SEÇİM ÇUBUĞU ═══════════════════════════════ */

export function SelectionBar({
  count,
  noun = "seçili",
  onClear,
  children,
  style,
}: {
  count: number;
  noun?: string;
  onClear?: () => void;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[kit.sel, style]}>
      <View style={kit.selHead}>
        <View style={kit.selCount}>
          <LinearGradient colors={colors.gradientBrand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          <Odometer value={count} style={kit.selCountText} />
        </View>
        <Text style={kit.selLabel} numberOfLines={1} {...textScale.dense}>
          {noun}
        </Text>
        {onClear && count ? (
          <Touchable onPress={onClear} feedback="none" accessibilityRole="button" accessibilityLabel="Seçimi temizle" style={kit.selClear}>
            <Ionicons name="close-circle" size={16} color={colors.textTertiary} />
            <Text style={kit.selClearText} {...textScale.dense}>
              Temizle
            </Text>
          </Touchable>
        ) : null}
      </View>
      {children ? <View style={kit.selActions}>{children}</View> : null}
    </View>
  );
}

/* ═══════════════════════════════ GRUP KARTI ═══════════════════════════════ */

export function GroupCard({
  title,
  icon,
  tone = "violet",
  step,
  action,
  children,
  style,
  padded = true,
}: {
  title: string;
  icon?: IconName;
  tone?: IconTileTone;
  /** Adımlı formlarda "1", "2"… */
  step?: number;
  action?: { label: string; onPress: () => void };
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
}) {
  return (
    <View style={[kit.group, padded ? kit.groupPadded : null, style]}>
      <View style={[kit.groupHead, padded ? null : kit.groupHeadInset]}>
        {step != null ? (
          <View style={kit.step}>
            <LinearGradient colors={colors.gradientBrand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
            <Text style={kit.stepText} {...textScale.badge}>
              {step}
            </Text>
          </View>
        ) : icon ? (
          <IconTile icon={icon} tone={tone} size={26} glow={false} />
        ) : (
          <LinearGradient colors={colors.gradientSignature} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={kit.groupRail} />
        )}
        <Text style={kit.groupTitle} numberOfLines={1} accessibilityRole="header" {...textScale.dense}>
          {upperTR(title)}
        </Text>
        {action ? (
          <Touchable onPress={action.onPress} feedback="none" accessibilityRole="button" style={kit.groupAction}>
            <Text style={kit.groupActionText} {...textScale.dense}>
              {action.label}
            </Text>
            <Ionicons name="chevron-forward" size={13} color={colors.brandAccent} />
          </Touchable>
        ) : null}
      </View>
      {children}
    </View>
  );
}

/** Grup kartında etiket–değer satırı (ikonlu, ince ayraçlı). */
export function FactRow({
  icon,
  label,
  value,
  tone,
  last,
  onPress,
}: {
  icon?: IconName;
  label: string;
  value?: React.ReactNode;
  tone?: Tone;
  last?: boolean;
  onPress?: () => void;
}) {
  const empty = value == null || value === "" || value === "—";
  const content = (
    <>
      {icon ? <Ionicons name={icon} size={15} color={colors.textTertiary} /> : null}
      <Text style={kit.factLabel} numberOfLines={1} {...textScale.dense}>
        {label}
      </Text>
      {typeof value === "string" || typeof value === "number" || value == null ? (
        <Text
          style={[kit.factValue, empty ? kit.factEmpty : null, tone ? { color: TONE_FG[tone] } : null]}
          numberOfLines={2}
          selectable
          {...textScale.dense}
        >
          {empty ? "—" : value}
        </Text>
      ) : (
        <View style={kit.factNode}>{value}</View>
      )}
      {onPress ? <Ionicons name="chevron-forward" size={13} color={colors.textTertiary} /> : null}
    </>
  );
  const rowStyle = [kit.fact, last ? null : kit.factDivided];
  return onPress ? (
    <Touchable onPress={onPress} style={rowStyle} accessibilityRole="button">
      {content}
    </Touchable>
  ) : (
    <View style={rowStyle}>{content}</View>
  );
}

const kit = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  mutedText: { color: colors.textTertiary },

  /* sayaç şeridi */
  strip: { flexDirection: "row", gap: space.sm },
  stripTile: {
    flex: 1,
    minWidth: 0,
    gap: space.xxs,
    paddingHorizontal: space.md,
    paddingTop: space.md,
    paddingBottom: space.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
    overflow: "hidden",
  },
  stripTileOn: { backgroundColor: colors.brandDim, borderColor: colors.brandBorder },
  stripRail: { position: "absolute", left: 0, right: 0, top: 0, height: 3 },
  stripHead: { flexDirection: "row", alignItems: "center", gap: space.xs },
  stripDot: { width: 6, height: 6, borderRadius: radius.pill },
  stripLabel: { ...type.micro, color: colors.textTertiary, flexShrink: 1 },
  stripValue: { ...type.metric, color: colors.textPrimary },
  stripHint: { ...type.meta, color: colors.textTertiary },

  /* kimlik sahnesi */
  stage: {
    borderRadius: radius.xxl,
    overflow: "hidden",
    backgroundColor: colors.adminBar,
    padding: space.lg,
    gap: space.lg,
    borderWidth: hairline,
    borderColor: colors.inkTileBorder,
  },
  stageHead: { flexDirection: "row", alignItems: "center", gap: space.lg },
  stageOverline: { ...type.overline, color: colors.adminAccent },
  stageTitle: { ...type.display, color: colors.onDark },
  stageSub: { ...type.bodySm, color: colors.onDarkMuted, marginTop: space.xxs },
  stagePills: { flexDirection: "row", flexWrap: "wrap", gap: space.xs, marginTop: space.sm },
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
  stagePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs,
    borderRadius: radius.pill,
    backgroundColor: colors.inkPill,
    borderWidth: hairline,
    borderColor: colors.inkPillBorder,
    maxWidth: "100%",
  },
  stagePillDot: { width: 6, height: 6, borderRadius: radius.pill },
  stagePillText: { ...type.labelXs, flexShrink: 1 },

  /* varlık kartı */
  card: {
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
    padding: space.md,
    gap: space.md,
    overflow: "hidden",
  },
  cardMuted: { backgroundColor: colors.surface2 },
  cardSelected: { backgroundColor: colors.brandDim, borderColor: colors.brandBorder },
  cardRail: { position: "absolute", left: 0, top: 0, bottom: 0, width: 3 },
  cardTop: { flexDirection: "row", alignItems: "center", gap: space.md },
  cardOverline: { ...type.overline, color: colors.textTertiary, marginBottom: 1 },
  cardTitle: { ...type.h3, color: colors.textPrimary },
  cardSub: { ...type.bodySm, color: colors.textSecondary, marginTop: 1 },
  cardMeta: { ...type.caption, color: colors.textTertiary, marginTop: 2 },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: space.xs, marginTop: space.s },
  chevron: {
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface2,
  },
  warning: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.s,
    paddingHorizontal: space.md,
    paddingVertical: space.s,
    borderRadius: radius.md,
    backgroundColor: colors.warnDim,
  },
  warningText: { ...type.labelXs, color: colors.warn, flex: 1 },
  cardStats: {
    flexDirection: "row",
    borderRadius: radius.md,
    backgroundColor: colors.surface2,
    paddingVertical: space.sm,
  },
  cardStat: { flex: 1, alignItems: "center", gap: 1, paddingHorizontal: space.xs },
  cardStatDivided: { borderLeftWidth: hairline, borderLeftColor: colors.separator },
  cardStatValue: { ...type.scoreXs, color: colors.textPrimary },
  cardStatLabel: { ...type.micro, color: colors.textTertiary },

  /* mevki halkası */
  posWrap: { alignItems: "center" },
  posRing: { borderWidth: 2, alignItems: "center", justifyContent: "center" },
  posTag: {
    marginTop: -8,
    paddingHorizontal: space.xs,
    borderRadius: radius.pill,
    minWidth: 26,
    alignItems: "center",
  },
  posTagText: { ...type.nano, color: colors.onDark },
  jersey: {
    position: "absolute",
    top: -4,
    right: -6,
    minWidth: 20,
    height: 20,
    paddingHorizontal: space.xxs,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface3,
    borderWidth: hairline,
    borderColor: colors.borderStrong,
  },
  jerseyText: { ...type.numSmStrong, color: colors.textPrimary },

  /* onay kuyruğu */
  req: {
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
    overflow: "hidden",
  },
  reqAccent: { position: "absolute", left: 0, top: space.md, bottom: space.md, width: 3, borderTopRightRadius: radius.pill, borderBottomRightRadius: radius.pill, zIndex: 1 },
  reqHead: { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.md, paddingTop: space.md },
  reqWho: { ...type.label, color: colors.textPrimary },
  reqWhenRow: { flexDirection: "row", alignItems: "center", gap: space.xxs, marginTop: 1 },
  reqWhen: { ...type.caption, color: colors.textTertiary },
  reqBody: { paddingHorizontal: space.md, paddingTop: space.sm, paddingBottom: space.md, gap: space.s },
  reqTitle: { ...type.h3, color: colors.textPrimary },
  reqSub: { ...type.bodySm, color: colors.textSecondary },
  reqActions: {
    flexDirection: "row",
    gap: space.sm,
    padding: space.sm,
    borderTopWidth: hairline,
    borderTopColor: colors.separator,
    backgroundColor: colors.surface2,
  },
  reqBtn: { flex: 1 },
  diff: { gap: 2, paddingVertical: space.xs },
  diffLabel: { ...type.micro, color: colors.textTertiary },
  diffRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  diffFrom: { ...type.bodySm, color: colors.textTertiary, textDecorationLine: "line-through", flexShrink: 1 },
  diffTo: { ...type.label, color: colors.textPrimary, flexShrink: 1 },

  /* uyarı */
  note: {
    flexDirection: "row",
    gap: space.md,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: hairline,
    alignItems: "flex-start",
  },
  noteTitle: { ...type.label },
  noteBody: { ...type.bodySm, color: colors.textSecondary, marginTop: 2 },

  /* seçim çubuğu */
  sel: {
    borderRadius: radius.xl,
    backgroundColor: colors.brandDim,
    borderWidth: hairline,
    borderColor: colors.brandBorder,
    padding: space.md,
    gap: space.md,
  },
  selHead: { flexDirection: "row", alignItems: "center", gap: space.sm },
  selCount: {
    minWidth: 34,
    height: 34,
    paddingHorizontal: space.sm,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  selCountText: { ...type.scoreSm, color: colors.textOnBrand },
  selLabel: { ...type.h4, color: colors.textPrimary, flex: 1 },
  selClear: { flexDirection: "row", alignItems: "center", gap: space.xxs },
  selClearText: { ...type.labelSm, color: colors.textSecondary },
  selActions: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },

  /* grup kartı */
  group: {
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
    gap: space.md,
    overflow: "hidden",
  },
  groupPadded: { padding: space.lg },
  groupHead: { flexDirection: "row", alignItems: "center", gap: space.sm },
  groupHeadInset: { paddingHorizontal: space.lg, paddingTop: space.lg },
  groupRail: { width: 3, height: 14, borderRadius: radius.pill },
  groupTitle: { ...type.overline, color: colors.textSecondary, flex: 1 },
  groupAction: { flexDirection: "row", alignItems: "center", gap: 2 },
  groupActionText: { ...type.labelSm, color: colors.brandAccent },
  step: { width: 24, height: 24, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  stepText: { ...type.numSmStrong, color: colors.textOnBrand },
  fact: { flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 44, paddingVertical: space.sm },
  factDivided: { borderBottomWidth: hairline, borderBottomColor: colors.separator },
  factLabel: { ...type.bodySm, color: colors.textTertiary, width: "36%" },
  factValue: { ...type.label, color: colors.textPrimary, flex: 1, textAlign: "right" },
  factEmpty: { color: colors.textDisabled },
  factNode: { flex: 1, alignItems: "flex-end" },
});
