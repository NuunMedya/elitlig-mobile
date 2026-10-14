/**
 * PANEL KİTİ — Yönetim sekmesinin (tek kulüp paneli) sade yapı taşları.
 *
 * NEDEN AYRI BİR KİT: kulüp paneli eskiden iki ekrandı (Yönetim sekmesi +
 * `/takimim`) ve ikisi de büyük karolar, grafit kimlik kartı, iri bölüm
 * başlıklarıyla aynı bilgiyi iki kez gösteriyordu. Panel artık TEK ekran ve
 * "az mürekkep, çok bilgi" ilkesiyle kurulur:
 *
 *   · Bölüm başlığı 10px büyük-harf etiket (overline), sağında tek bağlantı.
 *   · Kartlar beyaz yüzey + kıl çizgisi; gölge, gradyan, sahne yok.
 *   · Satırlar 13px başlık + 11px ipucu; ikon 14px, 26px'lik sönük kare.
 *   · Rakamlar tabular ve Archivo (metricSm 18) — panelin tek "yüksek sesi".
 *
 * Bu dosya yalnız TASARIM tokenlarını kullanır (theme); çıplak hex yok.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";
import { Avatar, FormChips, TeamLogo, Touchable, toneColors, type Tone } from "@/components/ui";
import { colors, hairline, layout, radius, space, textScale, type, upperTR } from "@/theme";

type IconName = keyof typeof Ionicons.glyphMap;

/* ══════════════════════════════ BÖLÜM ══════════════════════════════ */

export function PanelSection({
  title,
  meta,
  action,
  children,
  style,
}: {
  title: string;
  meta?: string;
  action?: { label: string; onPress: () => void };
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.section, style]}>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle} numberOfLines={1} {...textScale.badge}>
          {upperTR(title)}
          {meta ? <Text style={styles.sectionMeta}>{`  ·  ${meta}`}</Text> : null}
        </Text>
        {action ? (
          <Touchable onPress={action.onPress} hitSlop={10} accessibilityRole="button">
            <Text style={styles.sectionAction} {...textScale.dense}>
              {action.label}
            </Text>
          </Touchable>
        ) : null}
      </View>
      {children}
    </View>
  );
}

/* ══════════════════════════════ KART ══════════════════════════════ */

export function PanelCard({
  children,
  style,
  padded = true,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** false: satır listeleri için (satırlar kendi dolgusunu taşır). */
  padded?: boolean;
}) {
  return <View style={[styles.card, padded && styles.cardPadded, style]}>{children}</View>;
}

/* ══════════════════════════════ SATIR ══════════════════════════════ */

export interface PanelRowProps {
  icon?: IconName;
  tone?: Tone;
  title: string;
  hint?: string | null;
  /** Sağda düz değer ("14", "2 açık"). */
  value?: string | null;
  /** Sağda dolu sayı rozeti — yalnız > 0 ise çizilir. */
  count?: number;
  onPress?: () => void;
  /** Kart içindeki son satır: alt çizgi çizilmez. */
  last?: boolean;
  leading?: React.ReactNode;
}

export const PanelRow = React.memo(function PanelRow({
  icon,
  tone = "brand",
  title,
  hint,
  value,
  count,
  onPress,
  last,
  leading,
}: PanelRowProps) {
  const tc = toneColors(tone);
  const body = (
    <View style={[styles.row, !last && styles.rowDivider]}>
      {leading ??
        (icon ? (
          <View style={[styles.rowIcon, { backgroundColor: tc.dim }]}>
            <Ionicons name={icon} size={14} color={tc.fg} />
          </View>
        ) : null)}
      <View style={styles.rowTexts}>
        <Text style={styles.rowTitle} numberOfLines={1} {...textScale.dense}>
          {title}
        </Text>
        {hint ? (
          <Text style={styles.rowHint} numberOfLines={1} {...textScale.dense}>
            {hint}
          </Text>
        ) : null}
      </View>
      {value ? (
        <Text style={styles.rowValue} numberOfLines={1} {...textScale.dense}>
          {value}
        </Text>
      ) : null}
      {count && count > 0 ? (
        <View style={[styles.count, { backgroundColor: tc.solidBg }]}>
          <Text style={[styles.countText, { color: tc.solidFg }]} {...textScale.badge}>
            {count > 99 ? "99+" : count}
          </Text>
        </View>
      ) : null}
      {onPress ? <Ionicons name="chevron-forward" size={13} color={colors.textTertiary} /> : null}
    </View>
  );
  if (!onPress) return body;
  return (
    <Touchable onPress={onPress} accessibilityRole="button" accessibilityLabel={hint ? `${title}, ${hint}` : title}>
      {body}
    </Touchable>
  );
});

/* ══════════════════════════ ARAÇ IZGARASI ══════════════════════════ */

export interface PanelTool {
  key: string;
  icon: IconName;
  label: string;
  href: string;
  count?: number;
  tone?: Tone;
}

/**
 * Dört sütunlu sade araç ızgarası: ikon + 11px etiket, rozet yalnız iş varsa.
 * Karo değil, çizgisiz düğme — panelin en sık kullanılan kapıları.
 */
export const ToolGrid = React.memo(function ToolGrid({
  tools,
  go,
}: {
  tools: PanelTool[];
  go: (href: string) => void;
}) {
  return (
    <PanelCard style={styles.toolGrid} padded={false}>
      {tools.map((tool) => {
        const tc = toneColors(tool.tone ?? "brand");
        return (
          <Touchable
            key={tool.key}
            style={styles.tool}
            onPress={() => go(tool.href)}
            accessibilityRole="button"
            accessibilityLabel={tool.count ? `${tool.label}, ${tool.count} yeni` : tool.label}
          >
            <View style={[styles.toolIcon, { backgroundColor: tc.dim }]}>
              <Ionicons name={tool.icon} size={16} color={tc.fg} />
              {tool.count ? (
                <View style={styles.toolBadge}>
                  <Text style={styles.toolBadgeText} {...textScale.badge}>
                    {tool.count > 9 ? "9+" : tool.count}
                  </Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.toolLabel} numberOfLines={1} {...textScale.badge}>
              {tool.label}
            </Text>
          </Touchable>
        );
      })}
    </PanelCard>
  );
});

/* ══════════════════════════ SAYI ŞERİDİ ══════════════════════════ */

export interface StatItem {
  label: string;
  value: string;
  tone?: "neutral" | "win" | "danger" | "brand";
  onPress?: () => void;
}

const STAT_COLOR = {
  neutral: colors.textPrimary,
  win: colors.win,
  danger: colors.danger,
  brand: colors.brandAccent,
} as const;

export const StatStrip = React.memo(function StatStrip({
  items,
  style,
}: {
  items: StatItem[];
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <PanelCard style={[styles.strip, style]} padded={false}>
      {items.map((item, index) => {
        const cell = (
          <View style={[styles.stat, index > 0 && styles.statDivider]}>
            <Text
              style={[styles.statValue, { color: STAT_COLOR[item.tone ?? "neutral"] }]}
              numberOfLines={1}
              adjustsFontSizeToFit
              {...textScale.dense}
            >
              {item.value}
            </Text>
            <Text style={styles.statLabel} numberOfLines={1} {...textScale.badge}>
              {upperTR(item.label)}
            </Text>
          </View>
        );
        return item.onPress ? (
          <Touchable key={item.label} onPress={item.onPress} style={styles.flex} accessibilityRole="button">
            {cell}
          </Touchable>
        ) : (
          <View key={item.label} style={styles.flex}>
            {cell}
          </View>
        );
      })}
    </PanelCard>
  );
});

/* ══════════════════════════ KİMLİK SATIRI ══════════════════════════ */

/**
 * Sade kimlik: 40px amblem/foto, ad, bağlam ve tek satırda olgular.
 * Eski grafit "hero" kartının yerini alır — kimlik paneli taşımaz, adlandırır.
 */
export const IdentityRow = React.memo(function IdentityRow({
  kind,
  name,
  image,
  role,
  context,
  facts,
  form,
  onPress,
}: {
  kind: "team" | "player";
  name: string;
  image: string | null;
  role?: string;
  context?: string | null;
  facts?: { label: string; value: string }[];
  form?: string | null;
  onPress?: () => void;
}) {
  const body = (
    <PanelCard style={styles.identity}>
      <View style={styles.identityTop}>
        {kind === "team" ? (
          <TeamLogo name={name} logo={image} size={40} />
        ) : (
          <Avatar name={name} image={image} size={40} />
        )}
        <View style={styles.rowTexts}>
          {role ? (
            <Text style={styles.identityRole} numberOfLines={1} {...textScale.badge}>
              {upperTR(role)}
            </Text>
          ) : null}
          <Text style={styles.identityName} numberOfLines={1} {...textScale.dense}>
            {name}
          </Text>
          {context ? (
            <Text style={styles.rowHint} numberOfLines={1} {...textScale.dense}>
              {context}
            </Text>
          ) : null}
        </View>
        {form ? <FormChips form={form} size="xs" /> : null}
        {onPress ? <Ionicons name="chevron-forward" size={13} color={colors.textTertiary} /> : null}
      </View>
      {facts && facts.length ? (
        <View style={styles.facts}>
          {facts.map((fact, index) => (
            <View key={fact.label} style={[styles.fact, index > 0 && styles.statDivider]}>
              <Text style={styles.factValue} numberOfLines={1} {...textScale.dense}>
                {fact.value}
              </Text>
              <Text style={styles.statLabel} numberOfLines={1} {...textScale.badge}>
                {upperTR(fact.label)}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </PanelCard>
  );
  if (!onPress) return body;
  return (
    <Touchable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${name} sayfası`}>
      {body}
    </Touchable>
  );
});

/* ══════════════════════════ HAZIRLIK ADIMLARI ══════════════════════════ */

export type StepState = "done" | "warn" | "todo";

export interface PrepStep {
  key: string;
  label: string;
  detail: string;
  state: StepState;
  onPress?: () => void;
}

const STEP_ICON: Record<StepState, IconName> = {
  done: "checkmark-circle",
  warn: "alert-circle",
  todo: "ellipse-outline",
};

const STEP_COLOR: Record<StepState, string> = {
  done: colors.win,
  warn: colors.warn,
  todo: colors.textTertiary,
};

/**
 * Maç hazırlığı kontrol listesi — "maça hazır mıyız?" sorusunun yanıtı.
 * Her adım gerçek veriden durum alır (yoklama sayısı, kayıtlı kadro) ve
 * dokununca ilgili sekmeyi açar. Hazırlık yüzdesi başlıkta yazar.
 */
export const PrepChecklist = React.memo(function PrepChecklist({ steps }: { steps: PrepStep[] }) {
  return (
    <View>
      {steps.map((step, index) => (
        <Touchable
          key={step.key}
          onPress={step.onPress}
          disabled={!step.onPress}
          accessibilityRole="button"
          accessibilityLabel={`${step.label}: ${step.detail}`}
        >
          <View style={[styles.step, index < steps.length - 1 && styles.rowDivider]}>
            <Ionicons name={STEP_ICON[step.state]} size={16} color={STEP_COLOR[step.state]} />
            <Text style={styles.stepLabel} numberOfLines={1} {...textScale.dense}>
              {step.label}
            </Text>
            <Text
              style={[styles.stepDetail, step.state === "warn" && { color: colors.warn }]}
              numberOfLines={1}
              {...textScale.dense}
            >
              {step.detail}
            </Text>
            {step.onPress ? <Ionicons name="chevron-forward" size={13} color={colors.textTertiary} /> : null}
          </View>
        </Touchable>
      ))}
    </View>
  );
});

/** Hazırlık adımlarından tek ilerleme oranı (uyarılı adım yarım sayılır). */
export function prepProgress(steps: PrepStep[]): number {
  if (!steps.length) return 0;
  const score = steps.reduce((sum, step) => sum + (step.state === "done" ? 1 : step.state === "warn" ? 0.5 : 0), 0);
  return Math.round((score / steps.length) * 100);
}

/** İnce ilerleme çubuğu (4px). */
export function ThinProgress({ value, tone = "brand" }: { value: number; tone?: Tone }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <View style={styles.progressTrack}>
      <View style={[styles.progressFill, { flex: clamped, backgroundColor: toneColors(tone).fg }]} />
      <View style={{ flex: 100 - clamped }} />
    </View>
  );
}

/* ══════════════════════════════ BOŞ HÂL ══════════════════════════════ */

export function PanelEmpty({
  icon,
  text,
  action,
}: {
  icon: IconName;
  text: string;
  action?: { label: string; onPress: () => void };
}) {
  return (
    <PanelCard style={styles.empty}>
      <Ionicons name={icon} size={15} color={colors.textTertiary} />
      <Text style={styles.emptyText} numberOfLines={2} {...textScale.dense}>
        {text}
      </Text>
      {action ? (
        <Touchable onPress={action.onPress} hitSlop={10} accessibilityRole="button">
          <Text style={styles.sectionAction} {...textScale.dense}>
            {action.label}
          </Text>
        </Touchable>
      ) : null}
    </PanelCard>
  );
}

/* ══════════════════════════════ STİLLER ══════════════════════════════ */

export const panelStyles = StyleSheet.create({
  pad: { paddingHorizontal: layout.screenPadding },
});

const styles = StyleSheet.create({
  flex: { flex: 1 },

  section: { marginTop: space.xl, paddingHorizontal: layout.screenPadding, gap: space.sm },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm },
  sectionTitle: { ...type.overline, color: colors.textTertiary, flexShrink: 1 },
  sectionMeta: { ...type.overline, color: colors.textTertiary, letterSpacing: 0.4 },
  sectionAction: { ...type.caption, color: colors.brandAccent },

  card: {
    backgroundColor: colors.surface1,
    borderRadius: radius.lg,
    borderWidth: hairline,
    borderColor: colors.border,
    overflow: "hidden",
  },
  cardPadded: { padding: space.md },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.m,
    minHeight: 44,
    paddingHorizontal: space.md,
    paddingVertical: space.s,
  },
  rowDivider: { borderBottomWidth: hairline, borderBottomColor: colors.separator },
  rowIcon: { width: 26, height: 26, borderRadius: radius.sm, alignItems: "center", justifyContent: "center" },
  rowTexts: { flex: 1, minWidth: 0, gap: 1 },
  rowTitle: { ...type.h4, color: colors.textPrimary },
  rowHint: { ...type.caption, color: colors.textTertiary },
  rowValue: { ...type.tableNum, color: colors.textSecondary },
  count: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: space.xs,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  countText: { ...type.micro, letterSpacing: 0 },

  toolGrid: { flexDirection: "row", flexWrap: "wrap", paddingVertical: space.s },
  tool: { width: "25%", alignItems: "center", gap: space.xs, paddingVertical: space.s },
  toolIcon: { width: 34, height: 34, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  toolBadge: {
    position: "absolute",
    top: -4,
    right: -6,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: colors.surface1,
  },
  toolBadgeText: { ...type.micro, color: colors.textOnBrand, letterSpacing: 0 },
  toolLabel: { ...type.caption, color: colors.textSecondary },

  strip: { flexDirection: "row" },
  stat: { alignItems: "center", paddingVertical: space.m, paddingHorizontal: space.xs, gap: 2 },
  statDivider: { borderLeftWidth: hairline, borderLeftColor: colors.separator },
  statValue: { ...type.metricSm },
  statLabel: { ...type.micro, color: colors.textTertiary },

  identity: { gap: space.md },
  identityTop: { flexDirection: "row", alignItems: "center", gap: space.m },
  identityRole: { ...type.micro, color: colors.brandAccent },
  identityName: { ...type.h3, color: colors.textPrimary },
  facts: {
    flexDirection: "row",
    borderTopWidth: hairline,
    borderTopColor: colors.separator,
    paddingTop: space.m,
  },
  fact: { flex: 1, alignItems: "center", gap: 2 },
  factValue: { ...type.tableNumStrong, color: colors.textPrimary },

  step: { flexDirection: "row", alignItems: "center", gap: space.m, minHeight: 40, paddingVertical: space.s },
  stepLabel: { ...type.h4, color: colors.textPrimary, flexShrink: 0 },
  stepDetail: { ...type.caption, color: colors.textTertiary, flex: 1, textAlign: "right" },

  progressTrack: {
    flexDirection: "row",
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.surface3,
    overflow: "hidden",
  },
  progressFill: { borderRadius: radius.pill },

  empty: { flexDirection: "row", alignItems: "center", gap: space.m },
  emptyText: { ...type.bodySm, color: colors.textSecondary, flex: 1 },
});
