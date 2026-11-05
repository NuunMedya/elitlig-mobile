/**
 * Muhasebe ekranlarının küçük görsel parçaları.
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

import { Button, Chip, ChipGroup, Touchable, toneColors, type Tone } from "@/components/ui";
import {
  KIND_ICON,
  canManageAccount,
  compactMoney,
  money,
  type AccountScope,
  type FinanceAccount,
} from "@/lib/api/admin/accounting";
import { colors, hairline, radius, space, textScale, type } from "@/theme";

/* ------------------------------- BarRow ------------------------------- */

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
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${pct * 100}%`, backgroundColor: toneColors(tone).fg }]} />
      </View>
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
              <View style={[styles.trendBar, { height: `${(r.income / max) * 100}%`, backgroundColor: colors.win }]} />
              <View style={[styles.trendBar, { height: `${(r.expense / max) * 100}%`, backgroundColor: colors.danger }]} />
            </View>
            <Text style={styles.trendLabel} numberOfLines={1} {...textScale.badge}>
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
          <View style={styles.legendRow}>
            <Legend color={colors.win} text={`Gelir ${compactMoney(current.income)}`} />
            <Legend color={colors.danger} text={`Gider ${compactMoney(current.expense)}`} />
            <Text style={[styles.legendText, { color: current.net >= 0 ? colors.win : colors.danger }]} {...textScale.dense}>
              Net {money(current.net, { signed: true })}
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function Legend({ color, text }: { color: string; text: string }) {
  return (
    <View style={styles.legend}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendText} {...textScale.dense}>
        {text}
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
            onPress={() => router.push({ pathname: "/yonetim/araclar/muhasebe/hesap/[id]", params: { id: String(a.id) } } as never)}
            style={[styles.stripChip, { borderLeftColor: a.color || colors.brand }]}
            accessibilityRole="button"
            accessibilityLabel={`${a.name}: ${money(a.balance)}`}
          >
            <Ionicons name={KIND_ICON[a.kind] || "wallet-outline"} size={14} color={colors.textSecondary} />
            <View>
              <Text style={styles.stripName} numberOfLines={1} {...textScale.dense}>
                {a.name}
                {a.linked_method ? " · bağlı" : ""}
              </Text>
              <Text style={[styles.stripValue, a.balance < 0 ? { color: colors.danger } : null]} {...textScale.dense}>
                {money(a.balance)}
              </Text>
            </View>
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
    <View style={[styles.note, { backgroundColor: toneColors(tone).dim }]}>
      <Ionicons name={icon} size={16} color={toneColors(tone).fg} />
      <Text style={[styles.noteText, { color: toneColors(tone).fg }]} {...textScale.long}>
        {text}
      </Text>
      {action ? (
        <Touchable onPress={action.onPress} accessibilityRole="button">
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
  bar: { gap: space.xs, paddingVertical: space.xs },
  barHead: { flexDirection: "row", justifyContent: "space-between", gap: space.sm },
  barLabel: { ...type.bodySm, color: colors.textPrimary, flex: 1 },
  barValue: { ...type.numSmStrong },
  barSub: { ...type.caption, color: colors.textTertiary },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.surface3, overflow: "hidden" },
  fill: { height: 6, borderRadius: 3 },

  trend: { gap: space.sm },
  trendRow: { gap: space.xs, alignItems: "flex-end" },
  trendCol: { width: 40, alignItems: "center", gap: space.xs, paddingVertical: space.xs, borderRadius: radius.sm },
  trendColOn: { backgroundColor: colors.surface3 },
  trendBars: { height: 96, flexDirection: "row", alignItems: "flex-end", gap: 3 },
  trendBar: { width: 10, minHeight: 2, borderRadius: 2 },
  trendLabel: { ...type.micro, color: colors.textTertiary },
  trendInfo: { gap: space.xs },
  trendTitle: { ...type.label, color: colors.textPrimary },
  legendRow: { flexDirection: "row", flexWrap: "wrap", gap: space.md, alignItems: "center" },
  legend: { flexDirection: "row", alignItems: "center", gap: space.xs },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { ...type.caption, color: colors.textSecondary },

  suggest: { gap: space.xs },
  suggestLabel: { ...type.caption, color: colors.textTertiary },

  range: { flexDirection: "row", alignItems: "center", gap: space.sm },
  rangeBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface2,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  rangeLabel: {
    flex: 1,
    height: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.xs,
    borderRadius: radius.md,
    backgroundColor: colors.surface2,
    borderWidth: hairline,
    borderColor: colors.border,
    paddingHorizontal: space.sm,
  },
  rangeText: { ...type.label, color: colors.textPrimary },

  strip: { gap: space.sm, padding: space.md, borderRadius: radius.lg, backgroundColor: colors.surface1, borderWidth: hairline, borderColor: colors.border },
  stripRow: { gap: space.sm, alignItems: "center" },
  stripChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingVertical: space.xs,
    paddingHorizontal: space.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.surface2,
    borderLeftWidth: 3,
  },
  stripName: { ...type.caption, color: colors.textSecondary, maxWidth: 160 },
  stripValue: { ...type.numSmStrong, color: colors.textPrimary },
  stripActions: { flexDirection: "row", gap: space.sm },

  note: { flexDirection: "row", alignItems: "flex-start", gap: space.sm, padding: space.md, borderRadius: radius.md },
  noteText: { ...type.bodySm, flex: 1 },
  noteAction: { ...type.label },

  rows: { gap: space.sm },
  muted: { ...type.bodySm, color: colors.textTertiary },
});
