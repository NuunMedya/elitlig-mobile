/**
 * İSTATİSTİK YAPI TAŞLARI — oyuncu sayfalarının sayı kartları.
 *
 *   StatTiles  — 3–4 hücreli vurgu şeridi (gol/maç, ilk 11 oranı …).
 *   StatList   — başlıklı kart içinde etiket · değer satırları; satır
 *                isterse "maç başına" ikinci değeri ve oran çubuğunu taşır.
 *   BarList    — kırılım çubukları (golün nasıl atıldığı): pay + yüzde.
 *
 * Renk VERİDİR (Arena §1.1): çubuklar `accent`, mor değil — mor aksiyona
 * ayrılmıştır. Eski gol kırılımı mor çiziliyordu; bir veri çubuğunun düğme
 * rengini taşıması "buna dokun" diyordu.
 */

import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, hairline, radius, space, textScale, type } from "@/theme";
import { surfaces } from "./shared";

/* ─────────────────────────── StatTiles ─────────────────────────── */

export interface StatTile {
  key: string;
  value: string;
  label: string;
  /** Rakamın altındaki küçük açıklama ("133 maçta"). */
  hint?: string;
}

export const StatTiles = React.memo(function StatTiles({ tiles }: { tiles: StatTile[] }) {
  if (tiles.length === 0) return null;
  return (
    <View style={[surfaces.card, tileStyles.row]}>
      {tiles.map((tile, index) => (
        <View
          key={tile.key}
          style={[tileStyles.cell, index > 0 && tileStyles.divider]}
          accessible
          accessibilityLabel={`${tile.label.toLocaleLowerCase("tr-TR")} ${tile.value}${tile.hint ? `, ${tile.hint}` : ""}`}
        >
          <Text style={tileStyles.value} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} {...textScale.dense}>
            {tile.value}
          </Text>
          <Text style={tileStyles.label} numberOfLines={1} {...textScale.badge}>
            {tile.label}
          </Text>
          {tile.hint ? (
            <Text style={tileStyles.hint} numberOfLines={1} {...textScale.badge}>
              {tile.hint}
            </Text>
          ) : null}
        </View>
      ))}
    </View>
  );
});

const tileStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    paddingVertical: space.md,
  },
  cell: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: space.xs,
    gap: 2,
  },
  divider: {
    borderLeftWidth: hairline,
    borderLeftColor: colors.separator,
  },
  value: {
    ...type.metric,
    color: colors.textPrimary,
  },
  label: {
    ...type.overline,
    color: colors.textTertiary,
  },
  hint: {
    ...type.caption,
    color: colors.textTertiary,
  },
});

/* ─────────────────────────── StatList ─────────────────────────── */

export interface StatLine {
  label: string;
  value: string;
  /** Sağda, değerin altında küçük ikinci değer ("1,55 / maç"). */
  sub?: string;
  /** 0–1: satırın altına ince oran çubuğu çizer (ör. ilk 11 oranı). */
  share?: number;
}

export interface StatListProps {
  title: string;
  /** Başlığın sağındaki kısa not. */
  meta?: string;
  lines: StatLine[];
}

/** Değeri olmayan satır çağıran tarafta süzülür; boş liste kart çizmez. */
export const StatList = React.memo(function StatList({ title, meta, lines }: StatListProps) {
  if (lines.length === 0) return null;
  return (
    <View style={[surfaces.card, listStyles.card]}>
      <View style={listStyles.head}>
        <Text style={listStyles.title} {...textScale.dense}>
          {title}
        </Text>
        {meta ? (
          <Text style={listStyles.meta} {...textScale.dense}>
            {meta}
          </Text>
        ) : null}
      </View>
      {lines.map((line, index) => (
        <View
          key={line.label}
          style={[listStyles.line, index > 0 && listStyles.lineDivider]}
          accessible
          accessibilityLabel={`${line.label} ${line.value}${line.sub ? `, ${line.sub}` : ""}`}
        >
          <View style={listStyles.lineMain}>
            <Text style={listStyles.label} numberOfLines={1} {...textScale.dense}>
              {line.label}
            </Text>
            <View style={listStyles.values}>
              {line.sub ? (
                <Text style={listStyles.sub} numberOfLines={1} {...textScale.dense}>
                  {line.sub}
                </Text>
              ) : null}
              <Text style={listStyles.value} {...textScale.dense}>
                {line.value}
              </Text>
            </View>
          </View>
          {line.share != null ? (
            <View style={listStyles.track}>
              <View style={[listStyles.fill, { flex: Math.max(0, Math.min(1, line.share)) }]} />
              <View style={{ flex: 1 - Math.max(0, Math.min(1, line.share)) }} />
            </View>
          ) : null}
        </View>
      ))}
    </View>
  );
});

const listStyles = StyleSheet.create({
  card: {
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.xs,
  },
  head: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: space.sm,
    paddingBottom: space.xs,
  },
  title: {
    ...type.h2,
    color: colors.textPrimary,
  },
  meta: {
    ...type.caption,
    color: colors.textTertiary,
  },
  line: {
    paddingVertical: space.m,
    gap: space.s,
  },
  lineDivider: {
    borderTopWidth: hairline,
    borderTopColor: colors.separator,
  },
  lineMain: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  label: {
    ...type.body,
    color: colors.textSecondary,
    flex: 1,
  },
  values: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: space.sm,
  },
  sub: {
    ...type.caption,
    color: colors.textTertiary,
  },
  value: {
    ...type.scoreXs,
    color: colors.textPrimary,
    minWidth: 28,
    textAlign: "right",
  },
  track: {
    flexDirection: "row",
    height: 4,
    borderRadius: radius.pill,
    overflow: "hidden",
    backgroundColor: colors.surface3,
  },
  fill: {
    height: 4,
    backgroundColor: colors.accent,
  },
});

/* ─────────────────────────── BarList ─────────────────────────── */

export interface BarItem {
  label: string;
  value: number;
}

export interface BarListProps {
  title: string;
  meta?: string;
  items: BarItem[];
}

/**
 * Kırılım çubukları. Çubuk boyu EN BÜYÜK paya göre ölçeklenir (en büyük pay
 * rayı doldurur), yüzde ise TOPLAMA göre yazılır — biri karşılaştırmayı,
 * öbürü gerçek oranı söyler.
 */
export const BarList = React.memo(function BarList({ title, meta, items }: BarListProps) {
  if (items.length === 0) return null;
  const sorted = [...items].sort((a, b) => b.value - a.value);
  const max = sorted[0]?.value ?? 0;
  const total = sorted.reduce((acc, item) => acc + item.value, 0);

  return (
    <View style={[surfaces.cardPadded, barStyles.card]}>
      <View style={listStyles.head}>
        <Text style={listStyles.title} {...textScale.dense}>
          {title}
        </Text>
        {meta ? (
          <Text style={listStyles.meta} {...textScale.dense}>
            {meta}
          </Text>
        ) : null}
      </View>
      {sorted.map((item) => {
        const ratio = max > 0 ? item.value / max : 0;
        const pct = total > 0 ? Math.round((item.value / total) * 100) : 0;
        return (
          <View
            key={item.label}
            style={barStyles.row}
            accessible
            accessibilityLabel={`${item.label}: ${item.value}, yüzde ${pct}`}
          >
            <View style={barStyles.rowHead}>
              <Text style={barStyles.label} numberOfLines={1} {...textScale.dense}>
                {item.label}
              </Text>
              <Text style={barStyles.pct} {...textScale.dense}>
                %{pct}
              </Text>
              <Text style={barStyles.value} {...textScale.dense}>
                {item.value}
              </Text>
            </View>
            <View style={barStyles.track}>
              <View style={[barStyles.fill, { flex: ratio }]} />
              <View style={{ flex: 1 - ratio }} />
            </View>
          </View>
        );
      })}
    </View>
  );
});

const barStyles = StyleSheet.create({
  card: {
    gap: space.md,
  },
  row: {
    gap: space.s,
  },
  rowHead: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: space.sm,
  },
  label: {
    ...type.body,
    color: colors.textSecondary,
    flex: 1,
  },
  pct: {
    ...type.tableNum,
    color: colors.textTertiary,
  },
  value: {
    ...type.tableNumStrong,
    color: colors.textPrimary,
    minWidth: 28,
    textAlign: "right",
  },
  track: {
    flexDirection: "row",
    height: 6,
    borderRadius: radius.pill,
    overflow: "hidden",
    backgroundColor: colors.surface3,
  },
  fill: {
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
});
