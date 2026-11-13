/**
 * Muhasebe ekranlarının küçük görsel parçaları.
 *
 * GECE TEMASI: oran çubukları degrade (GradientBar, yaylı dolum), trend
 * sütunları degrade + seçili ay vurgusu ve altında üç rakam kutusu; hesap
 * şeridi renk bantlı mini kartlar; Not solda ton şeridiyle cam kutu.
 *
 *   BarRow       — etiket + tutar + oran çubuğu (kategori, saha, bütçe, yaşlandırma)
 *   TrendBars    — ay/gün başına gelir-gider çift çubuğu; dokununca ayrıntı
 *   SuggestChips — "seçin ya da yazın" alanlarının öneri çipleri
 *   RangeBar     — ‹ dönem › gezinme şeridi
 *   AccountStrip — defterin üstünde o kapsamın kasa/banka hesapları
 *   Note         — açıklama / uyarı şeridi
 *
 * NEDEN GRAFİK KİTAPLIĞI YOK: web'deki SVG grafikler telefonda yatay kaydırma
 * istiyordu. Çubuklar View genişliğiyle çizilir; değer her zaman metin olarak
 * da yazılır (renk tek başına anlam taşımaz).
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { LinearGradient } from "expo-linear-gradient";

import { Button, Chip, ChipGroup, GradientBar, Touchable, toneColors, withAlpha, type Tone } from "@/components/ui";
import {
  KIND_ICON,
  canManageAccount,
  compactMoney,
  money,
  type AccountScope,
  type FinanceAccount,
} from "@/lib/api/admin/accounting";
import { colors, hairline, radius, space, textScale, type, upperTR } from "@/theme";

/* ------------------------------- BarRow ------------------------------- */

/** Çubuk tonu → degrade (tamam nane, gider kırmızı, bekleyen altın…). */
const BAR_GRADIENT: Partial<Record<Tone, readonly [string, string]>> = {
  win: [colors.tileTones.mint[1], colors.tileTones.mint[0]],
  danger: [colors.tileTones.red[1], colors.tileTones.red[0]],
  warn: [colors.tileTones.gold[1], colors.tileTones.gold[0]],
  info: [colors.tileTones.cyan[1], colors.tileTones.cyan[0]],
  accent: [colors.tileTones.cyan[1], colors.tileTones.cyan[0]],
  brand: colors.gradientSignature,
};

export function BarRow({
  label,
  value,
  ratio,
  tone = "brand",
  sub,
  onPress,
}: {
  label: string;
  value: string;
  ratio: number;
  tone?: Tone;
  sub?: string | null;
  onPress?: () => void;
}) {
  const pct = Math.max(0, Math.min(1, Number.isFinite(ratio) ? ratio : 0));
  const body = (
    <>
      <View style={styles.barHead}>
        <Text style={styles.barLabel} numberOfLines={1} {...textScale.dense}>
          {label}
        </Text>
        <Text style={[styles.barValue, { color: toneColors(tone).fg }]} numberOfLines={1} {...textScale.dense}>
          {value}
        </Text>
      </View>
      <GradientBar value={pct} height={8} gradient={BAR_GRADIENT[tone] ?? colors.gradientSignature} />
      {sub ? (
        <Text style={styles.barSub} numberOfLines={1} {...textScale.dense}>
          {sub}
        </Text>
      ) : null}
    </>
  );
  if (!onPress) return <View style={styles.bar}>{body}</View>;
  return (
    <Touchable onPress={onPress} style={styles.bar} accessibilityRole="button" accessibilityLabel={`${label}: ${value}`}>
      {body}
    </Touchable>
  );
}

/* ------------------------------ TrendBars ------------------------------ */

export interface TrendRow {
  key: string;
  label: string;
  title?: string;
  income: number;
  expense: number;
  net: number;
}

export function TrendBars({ rows, emptyText = "Kayıt eklendikçe grafik dolacak." }: { rows: TrendRow[]; emptyText?: string }) {
  const [active, setActive] = useState<number | null>(rows.length ? rows.length - 1 : null);
  const max = Math.max(1, ...rows.map((r) => Math.max(r.income, r.expense)));
  const empty = !rows.some((r) => r.income || r.expense);
  const current = active != null ? rows[active] : null;
  if (!rows.length || empty) {
    return (
      <Text style={styles.muted} {...textScale.long}>
        {emptyText}
      </Text>
    );
  }
  return (
    <View style={styles.trend}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.trendRow}>
        {rows.map((r, i) => (
          <Touchable
            key={r.key}
            onPress={() => setActive(i)}
            style={[styles.trendCol, active === i ? styles.trendColOn : null]}
            accessibilityRole="button"
            accessibilityLabel={`${r.title || r.label}: gelir ${money(r.income)}, gider ${money(r.expense)}`}
          >
            <View style={styles.trendBars}>
              <LinearGradient
                colors={[colors.tileTones.mint[0], colors.tileTones.mint[1]]}
                style={[styles.trendBar, { height: `${Math.max(2, (r.income / max) * 100)}%` }, active === i ? null : styles.trendDim]}
              />
              <LinearGradient
                colors={[colors.tileTones.red[0], colors.tileTones.red[1]]}
                style={[styles.trendBar, { height: `${Math.max(2, (r.expense / max) * 100)}%` }, active === i ? null : styles.trendDim]}
              />
            </View>
            <Text style={[styles.trendLabel, active === i ? styles.trendLabelOn : null]} numberOfLines={1} {...textScale.badge}>
              {r.label}
            </Text>
          </Touchable>
        ))}
      </ScrollView>
      {current ? (
        <View style={styles.trendInfo}>
          <Text style={styles.trendTitle} {...textScale.dense}>
            {current.title || current.label}
          </Text>
          <View style={styles.trendFigures}>
            <TrendFigure color={colors.win} label="Gelir" value={compactMoney(current.income)} />
            <TrendFigure color={colors.danger} label="Gider" value={compactMoney(current.expense)} />
            <TrendFigure color={current.net >= 0 ? colors.win : colors.danger} label="Net" value={money(current.net, { signed: true })} strong />
          </View>
        </View>
      ) : null}
    </View>
  );
}

function TrendFigure({ color, label, value, strong }: { color: string; label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.figure}>
      <View style={styles.legend}>
        <View style={[styles.legendDot, { backgroundColor: color }]} />
        <Text style={styles.legendText} {...textScale.badge}>
          {upperTR(label)}
        </Text>
      </View>
      <Text style={[styles.figureValue, strong ? { color } : null]} numberOfLines={1} adjustsFontSizeToFit {...textScale.badge}>
        {value}
      </Text>
    </View>
  );
}

/* ----------------------------- SuggestChips ----------------------------- */

export function SuggestChips({ items, value, onPick, label }: { items: string[]; value?: string; onPick: (v: string) => void; label?: string }) {
  if (!items.length) return null;
  return (
    <View style={styles.suggest}>
      {label ? (
        <Text style={styles.suggestLabel} {...textScale.dense}>
          {label}
        </Text>
      ) : null}
      <ChipGroup scrollable contentPadding={0}>
        {items.map((item) => (
          <Chip key={item} label={item} size="sm" selected={value === item} onPress={() => onPick(item)} />
        ))}
      </ChipGroup>
    </View>
  );
}

/* ------------------------------- RangeBar ------------------------------- */

export function RangeBar({ label, onPrev, onNext, onPick }: { label: string; onPrev?: () => void; onNext?: () => void; onPick?: () => void }) {
  return (
    <View style={styles.range}>
      {onPrev ? (
        <Touchable onPress={onPrev} style={styles.rangeBtn} accessibilityRole="button" accessibilityLabel="Önceki dönem">
          <Ionicons name="chevron-back" size={18} color={colors.textPrimary} />
        </Touchable>
      ) : null}
      <Touchable onPress={onPick} disabled={!onPick} style={styles.rangeLabel} accessibilityRole="button" accessibilityLabel={`Dönem: ${label}. Değiştir`}>
        <Ionicons name="calendar-outline" size={16} color={colors.textSecondary} />
        <Text style={styles.rangeText} numberOfLines={1} {...textScale.dense}>
          {label}
        </Text>
        {onPick ? <Ionicons name="chevron-down" size={14} color={colors.textTertiary} /> : null}
      </Touchable>
      {onNext ? (
        <Touchable onPress={onNext} style={styles.rangeBtn} accessibilityRole="button" accessibilityLabel="Sonraki dönem">
          <Ionicons name="chevron-forward" size={18} color={colors.textPrimary} />
        </Touchable>
      ) : null}
    </View>
  );
}

/* ----------------------------- AccountStrip ----------------------------- */

export function AccountStrip({
  accounts,
  scope,
  cityId,
  onTransfer,
}: {
  accounts: FinanceAccount[];
  scope: AccountScope;
  cityId?: number | string | null;
  onTransfer?: () => void;
}) {
  const router = useRouter();
  const list = accounts.filter((a) => a.scope === scope && !a.archived && (scope !== "city" || !cityId || Number(a.city_id) === Number(cityId)));
  const canTransfer = accounts.filter((a) => canManageAccount(a) && !a.archived).length >= 2;
  return (
    <View style={styles.strip}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.stripRow}>
        {list.map((a) => (
          <Touchable
            key={a.id}
            feedback="card"
            onPress={() => router.push({ pathname: "/yonetim/araclar/muhasebe/hesap/[id]", params: { id: String(a.id) } } as never)}
            style={styles.stripCard}
            accessibilityRole="button"
            accessibilityLabel={`${a.name}: ${money(a.balance)}`}
          >
            <View style={[styles.stripBand, { backgroundColor: a.color || colors.brand }]} />
            <View style={styles.stripHead}>
              <View style={[styles.stripIcon, { backgroundColor: withAlpha(a.color || colors.brand, 0.2) }]}>
                <Ionicons name={KIND_ICON[a.kind] || "wallet-outline"} size={14} color={a.color || colors.brandAccent} />
              </View>
              <Text style={styles.stripName} numberOfLines={1} {...textScale.dense}>
                {a.name}
              </Text>
            </View>
            <Text style={[styles.stripValue, a.balance < 0 ? { color: colors.danger } : null]} numberOfLines={1} adjustsFontSizeToFit {...textScale.badge}>
              {money(a.balance)}
            </Text>
            {a.linked_method ? (
              <Text style={styles.stripMeta} numberOfLines={1} {...textScale.badge}>
                Defterle bağlı
              </Text>
            ) : null}
          </Touchable>
        ))}
        {!list.length ? (
          <Text style={styles.muted} {...textScale.dense}>
            Bu defter için kasa/banka hesabı tanımlı değil.
          </Text>
        ) : null}
      </ScrollView>
      <View style={styles.stripActions}>
        {onTransfer ? <Button label="Virman" icon="swap-horizontal" size="sm" variant="secondary" onPress={onTransfer} disabled={!canTransfer} /> : null}
        <Button label="Hesaplar" icon="business-outline" size="sm" variant="ghost" onPress={() => router.push("/yonetim/araclar/muhasebe/hesaplar" as never)} />
      </View>
    </View>
  );
}

/* --------------------------------- Note --------------------------------- */

export function Note({ text, tone = "info", icon = "information-circle-outline", action }: { text: string; tone?: Tone; icon?: keyof typeof Ionicons.glyphMap; action?: { label: string; onPress: () => void } }) {
  return (
    <View style={[styles.note, { backgroundColor: toneColors(tone).dim, borderColor: withAlpha(toneColors(tone).fg, 0.28) }]}>
      <View style={[styles.noteRail, { backgroundColor: toneColors(tone).fg }]} />
      <Ionicons name={icon} size={18} color={toneColors(tone).fg} />
      <Text style={[styles.noteText, { color: colors.textPrimary }]} {...textScale.long}>
        {text}
      </Text>
      {action ? (
        <Touchable onPress={action.onPress} accessibilityRole="button" feedback="chip" style={[styles.noteActionBox, { borderColor: withAlpha(toneColors(tone).fg, 0.4) }]}>
          <Text style={[styles.noteAction, { color: toneColors(tone).fg }]} {...textScale.dense}>
            {action.label}
          </Text>
        </Touchable>
      ) : null}
    </View>
  );
}

/** Basit etiket-değer satırı dizisi için ince ayraçlı liste. */
export function Rows({ children }: { children: React.ReactNode }) {
  return <View style={styles.rows}>{children}</View>;
}

export function Muted({ children }: { children: React.ReactNode }) {
  return (
    <Text style={styles.muted} {...textScale.long}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  bar: { gap: space.xs + 2, paddingVertical: space.xs + 2 },
  barHead: { flexDirection: "row", justifyContent: "space-between", gap: space.sm },
  barLabel: { ...type.bodySm, color: colors.textPrimary, flex: 1 },
  barValue: { ...type.tableNumStrong },
  barSub: { ...type.caption, color: colors.textTertiary },

  trend: { gap: space.md },
  trendRow: { gap: space.xs, alignItems: "flex-end" },
  trendCol: { width: 42, alignItems: "center", gap: space.xs, paddingVertical: space.sm, borderRadius: radius.md },
  trendColOn: { backgroundColor: colors.brandDim },
  trendBars: { height: 120, flexDirection: "row", alignItems: "flex-end", gap: 3 },
  trendBar: { width: 11, borderTopLeftRadius: 4, borderTopRightRadius: 4, borderBottomLeftRadius: 1, borderBottomRightRadius: 1 },
  trendDim: { opacity: 0.55 },
  trendLabel: { ...type.micro, color: colors.textTertiary },
  trendLabelOn: { color: colors.textPrimary },
  trendFigures: { flexDirection: "row", gap: space.sm },
  figure: { flex: 1, gap: space.xxs, padding: space.sm, borderRadius: radius.md, backgroundColor: colors.surface2 },
  figureValue: { ...type.tableNumStrong, color: colors.textPrimary },
  trendInfo: { gap: space.xs },
  trendTitle: { ...type.h4, color: colors.textPrimary },
  legendRow: { flexDirection: "row", flexWrap: "wrap", gap: space.md, alignItems: "center" },
  legend: { flexDirection: "row", alignItems: "center", gap: space.xs },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { ...type.nano, color: colors.textTertiary },

  suggest: { gap: space.xs },
  suggestLabel: { ...type.caption, color: colors.textTertiary },

  range: { flexDirection: "row", alignItems: "center", gap: space.sm },
  rangeBtn: {
    width: 42,
    height: 42,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.glass,
    borderWidth: hairline,
    borderColor: colors.glassLine,
  },
  rangeLabel: {
    flex: 1,
    height: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.glass,
    borderWidth: hairline,
    borderColor: colors.glassLine,
    paddingHorizontal: space.md,
  },
  rangeText: { ...type.h4, color: colors.textPrimary },

  strip: { gap: space.sm },
  stripRow: { gap: space.sm, alignItems: "center" },
  stripCard: {
    width: 168,
    gap: space.xs,
    padding: space.md,
    paddingTop: space.md + 2,
    borderRadius: radius.lg,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
    overflow: "hidden",
  },
  stripBand: { position: "absolute", top: 0, left: 0, right: 0, height: 3 },
  stripHead: { flexDirection: "row", alignItems: "center", gap: space.xs },
  stripIcon: { width: 24, height: 24, borderRadius: radius.xs, alignItems: "center", justifyContent: "center" },
  stripName: { ...type.labelSm, color: colors.textSecondary, flex: 1 },
  stripValue: { ...type.metricSm, color: colors.textPrimary },
  stripMeta: { ...type.nano, color: colors.textTertiary },
  stripActions: { flexDirection: "row", gap: space.sm },

  note: { flexDirection: "row", alignItems: "center", gap: space.sm, padding: space.md, paddingLeft: space.md + 2, borderRadius: radius.lg, borderWidth: hairline, overflow: "hidden" },
  noteRail: { position: "absolute", left: 0, top: 0, bottom: 0, width: 3 },
  noteText: { ...type.bodySm, flex: 1 },
  noteActionBox: { paddingHorizontal: space.sm, paddingVertical: space.xs, borderRadius: radius.pill, borderWidth: hairline },
  noteAction: { ...type.labelSm },

  rows: { gap: space.sm },
  muted: { ...type.bodySm, color: colors.textTertiary },
});
