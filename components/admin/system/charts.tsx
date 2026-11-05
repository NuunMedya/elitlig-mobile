/**
 * Analiz ekranlarının görsel atomları (react-native-svg; yerel modül yok).
 *
 *   <TrendChart labels series type="line|bar" />  çizgi ya da çubuk grafik
 *   <BarList rows />                                yatay çubuklu sıralı liste
 *   <WeekHourGrid grid />                           gün × saat yoğunluk ızgarası
 *   <KpiTile label value previous />                gösterge + önceki döneme göre değişim
 *   <ShareCsvButton />                              tabloyu CSV metni olarak paylaşır
 *
 * NEDEN BASİT: web grafikleri fare üstü ipucu ve yakınlaştırma taşıyor;
 * telefonda dokunma ile bir sütun seçilir ve değeri grafiğin üstünde yazılır.
 * Seri renkleri tema tokenıdır; renk tek başına anlam taşımasın diye her
 * grafiğin altında etiketli açıklama vardır.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useMemo, useState } from "react";
import { Share, StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import Svg, { Line, Polyline, Rect } from "react-native-svg";

import { Touchable, withAlpha } from "@/components/ui";
import { deltaPct, fmtNum, toCsv } from "@/lib/api/admin/system";
import { colors, hairline, radius, space, textScale, type } from "@/theme";

/** Seri renkleri — sıra sabittir (ilk seri marka, ikinci aksan …). */
export const SERIES_COLORS = [colors.brandAccent, colors.accent, colors.info, colors.win, colors.warn, colors.danger, colors.textTertiary];

export interface ChartSeries {
  label: string;
  data: number[];
  color?: string;
}

export function TrendChart({
  labels,
  series,
  type: kind = "line",
  height = 180,
  format = fmtNum,
}: {
  labels: string[];
  series: ChartSeries[];
  type?: "line" | "bar";
  height?: number;
  format?: (value: number) => string;
}) {
  const [width, setWidth] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const count = labels.length;
  const max = useMemo(() => Math.max(1, ...series.flatMap((s) => s.data.map((v) => Number(v) || 0))), [series]);

  if (!count || !series.length) {
    return (
      <Text style={styles.empty} {...textScale.dense}>
        Bu aralıkta veri yok.
      </Text>
    );
  }

  const onLayout = (e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width));
  const pad = 4;
  const innerH = height - pad * 2;
  const step = count > 1 ? (width - pad * 2) / (count - 1) : 0;
  const slot = width / count;
  const y = (v: number) => pad + innerH - (Math.max(0, Number(v) || 0) / max) * innerH;
  const x = (i: number) => (kind === "bar" ? slot * i + slot / 2 : count > 1 ? pad + step * i : width / 2);
  const shown = picked != null && picked < count ? picked : count - 1;

  return (
    <View style={styles.chart}>
      <View style={styles.readout}>
        <Text style={styles.readoutLabel} {...textScale.dense}>
          {labels[shown]}
        </Text>
        <View style={styles.readoutValues}>
          {series.map((s, i) => (
            <Text key={s.label} style={[styles.readoutValue, { color: s.color ?? SERIES_COLORS[i] }]} {...textScale.badge}>
              {format(Number(s.data[shown]) || 0)}
            </Text>
          ))}
        </View>
      </View>
      <View onLayout={onLayout} style={{ height }}>
        {width > 0 ? (
          <Svg width={width} height={height}>
            {[0.25, 0.5, 0.75].map((f) => (
              <Line key={f} x1={0} x2={width} y1={pad + innerH * f} y2={pad + innerH * f} stroke={colors.separator} strokeWidth={hairline} />
            ))}
            <Line x1={0} x2={width} y1={pad + innerH} y2={pad + innerH} stroke={colors.border} strokeWidth={1} />
            {kind === "bar"
              ? series.map((s, si) => {
                  const barW = Math.max(2, (slot * 0.7) / series.length);
                  return s.data.map((v, i) => {
                    const top = y(v);
                    return (
                      <Rect
                        key={`${si}-${i}`}
                        x={slot * i + slot * 0.15 + barW * si}
                        y={top}
                        width={barW}
                        height={Math.max(0, pad + innerH - top)}
                        rx={Math.min(3, barW / 2)}
                        fill={s.color ?? SERIES_COLORS[si]}
                        opacity={picked == null || picked === i ? 1 : 0.45}
                      />
                    );
                  });
                })
              : series.map((s, si) => (
                  <Polyline
                    key={s.label}
                    points={s.data.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ")}
                    fill="none"
                    stroke={s.color ?? SERIES_COLORS[si]}
                    strokeWidth={2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                ))}
            {kind === "line" ? (
              <Line x1={x(shown)} x2={x(shown)} y1={pad} y2={pad + innerH} stroke={colors.borderStrong} strokeWidth={1} strokeDasharray="3 3" />
            ) : null}
          </Svg>
        ) : null}
        {/* Dokunma katmanı: sütuna dokunmak o günün değerini üstte yazar. */}
        <View style={StyleSheet.absoluteFill}>
          <View style={styles.hitRow}>
            {labels.map((label, i) => (
              <Touchable
                key={`${label}-${i}`}
                style={styles.hit}
                onPress={() => setPicked((p) => (p === i ? null : i))}
                feedback="none"
                accessibilityLabel={`${label}: ${series.map((s) => `${s.label} ${format(Number(s.data[i]) || 0)}`).join(", ")}`}
              />
            ))}
          </View>
        </View>
      </View>
      <View style={styles.axis}>
        <Text style={styles.axisText} {...textScale.badge}>
          {labels[0]}
        </Text>
        {count > 2 ? (
          <Text style={styles.axisText} {...textScale.badge}>
            {labels[Math.floor(count / 2)]}
          </Text>
        ) : null}
        <Text style={styles.axisText} {...textScale.badge}>
          {labels[count - 1]}
        </Text>
      </View>
      {series.length > 1 ? (
        <View style={styles.legend}>
          {series.map((s, i) => (
            <View key={s.label} style={styles.legendItem}>
              <View style={[styles.swatch, { backgroundColor: s.color ?? SERIES_COLORS[i] }]} />
              <Text style={styles.legendText} {...textScale.dense}>
                {s.label}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export interface BarRow {
  key: string;
  label: string;
  value: number;
  note?: string;
  color?: string;
}

export function BarList({
  rows,
  limit = 8,
  emptyText = "Veri yok.",
  format = fmtNum,
  onSelect,
}: {
  rows: BarRow[];
  limit?: number;
  emptyText?: string;
  format?: (value: number) => string;
  onSelect?: (row: BarRow) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  if (!rows.length) {
    return (
      <Text style={styles.empty} {...textScale.dense}>
        {emptyText}
      </Text>
    );
  }
  const max = Math.max(1, ...rows.map((r) => Number(r.value) || 0));
  const total = rows.reduce((sum, r) => sum + (Number(r.value) || 0), 0);
  const shown = expanded ? rows : rows.slice(0, limit);
  return (
    <View style={styles.bars}>
      {shown.map((row) => {
        const body = (
          <>
            <View style={styles.barHead}>
              <Text style={styles.barLabel} numberOfLines={1} {...textScale.dense}>
                {row.label}
              </Text>
              <Text style={styles.barValue} {...textScale.badge}>
                {format(row.value)}
                {total ? <Text style={styles.barShare}>  %{Math.round(((Number(row.value) || 0) / total) * 100)}</Text> : null}
              </Text>
            </View>
            <View style={styles.barTrack}>
              <View
                style={[
                  styles.barFill,
                  { width: `${Math.max(2, ((Number(row.value) || 0) / max) * 100)}%`, backgroundColor: row.color ?? colors.brandAccent },
                ]}
              />
            </View>
            {row.note ? (
              <Text style={styles.barNote} numberOfLines={1} {...textScale.dense}>
                {row.note}
              </Text>
            ) : null}
          </>
        );
        return onSelect ? (
          <Touchable key={row.key} onPress={() => onSelect(row)} style={styles.barRow} accessibilityRole="button">
            {body}
          </Touchable>
        ) : (
          <View key={row.key} style={styles.barRow}>
            {body}
          </View>
        );
      })}
      {rows.length > limit ? (
        <Touchable onPress={() => setExpanded((v) => !v)} style={styles.moreBtn} accessibilityRole="button">
          <Text style={styles.moreText} {...textScale.dense}>
            {expanded ? "Daha az göster" : `Tümünü göster (${rows.length})`}
          </Text>
        </Touchable>
      ) : null}
    </View>
  );
}

const WEEKDAYS = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];

/** 7 × 24 yoğunluk ızgarası (Türkiye saati). Hücre opaklığı değerle artar. */
export function WeekHourGrid({ grid, unit = "görüntüleme" }: { grid?: number[][] | null; unit?: string }) {
  const [picked, setPicked] = useState<{ d: number; h: number } | null>(null);
  if (!grid?.length) {
    return (
      <Text style={styles.empty} {...textScale.dense}>
        Bu aralıkta veri yok.
      </Text>
    );
  }
  const max = Math.max(1, ...grid.flat());
  const value = picked ? grid[picked.d]?.[picked.h] ?? 0 : null;
  return (
    <View style={styles.week}>
      <Text style={styles.weekReadout} {...textScale.dense}>
        {picked ? `${WEEKDAYS[picked.d]} ${String(picked.h).padStart(2, "0")}:00 · ${fmtNum(value)} ${unit}` : "Bir hücreye dokun: o saatin değeri burada yazar."}
      </Text>
      {grid.map((row, d) => (
        <View key={WEEKDAYS[d] ?? d} style={styles.weekRow}>
          <Text style={styles.weekDay} {...textScale.badge}>
            {WEEKDAYS[d]}
          </Text>
          {row.map((v, h) => {
            const level = v ? Math.max(0.12, v / max) : 0;
            const on = picked?.d === d && picked?.h === h;
            return (
              <Touchable
                key={h}
                onPress={() => setPicked(on ? null : { d, h })}
                feedback="none"
                style={[
                  styles.weekCell,
                  { backgroundColor: level ? withAlpha(colors.brandAccent, level) : colors.surface3 },
                  on ? styles.weekCellOn : null,
                ]}
                accessibilityLabel={`${WEEKDAYS[d]} ${h}:00, ${fmtNum(v)} ${unit}`}
              />
            );
          })}
        </View>
      ))}
      <View style={styles.weekAxis}>
        {[0, 6, 12, 18, 23].map((h) => (
          <Text key={h} style={styles.axisText} {...textScale.badge}>
            {String(h).padStart(2, "0")}
          </Text>
        ))}
      </View>
    </View>
  );
}

export function KpiTile({
  label,
  value,
  previous,
  format = fmtNum,
  lowerIsBetter,
  hint,
}: {
  label: string;
  value: unknown;
  previous?: unknown;
  format?: (value: number) => string;
  lowerIsBetter?: boolean;
  hint?: string;
}) {
  const change = previous === undefined ? null : deltaPct(value, previous);
  const good = change == null || Math.abs(change) < 0.5 ? null : lowerIsBetter ? change < 0 : change > 0;
  return (
    <View style={styles.kpi} accessible accessibilityLabel={`${label}: ${value == null ? "yok" : format(Number(value))}`}>
      <Text style={styles.kpiLabel} numberOfLines={2} {...textScale.badge}>
        {label}
      </Text>
      <Text style={styles.kpiValue} numberOfLines={1} adjustsFontSizeToFit {...textScale.badge}>
        {value == null ? "—" : format(Number(value))}
      </Text>
      {change != null ? (
        <View style={styles.kpiDelta}>
          <Ionicons
            name={Math.abs(change) < 0.5 ? "remove" : change > 0 ? "arrow-up" : "arrow-down"}
            size={12}
            color={good == null ? colors.textTertiary : good ? colors.win : colors.danger}
          />
          <Text style={[styles.kpiDeltaText, { color: good == null ? colors.textTertiary : good ? colors.win : colors.danger }]} {...textScale.badge}>
            %{Math.abs(change).toLocaleString("tr-TR")}
          </Text>
        </View>
      ) : hint ? (
        <Text style={styles.kpiHint} numberOfLines={1} {...textScale.badge}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

/** İki sütunlu KpiTile ızgarası. */
export function KpiGrid({ children }: { children: React.ReactNode }) {
  return <View style={styles.kpiGrid}>{children}</View>;
}

/** Tabloyu CSV metni olarak sistemin paylaşım sayfasına verir (dosya modülü gerekmez). */
export function ShareCsvButton({
  title,
  columns,
  rows,
}: {
  title: string;
  columns: { key: string; label: string }[];
  rows: Record<string, unknown>[];
}) {
  if (!rows.length) return null;
  return (
    <Touchable
      onPress={() => void Share.share({ title, message: toCsv(columns, rows) })}
      style={styles.share}
      accessibilityRole="button"
      accessibilityLabel={`${title} tablosunu CSV olarak paylaş`}
    >
      <Ionicons name="share-outline" size={14} color={colors.brandAccent} />
      <Text style={styles.shareText} {...textScale.dense}>
        CSV paylaş
      </Text>
    </Touchable>
  );
}

const styles = StyleSheet.create({
  chart: { gap: space.xs },
  empty: { ...type.bodySm, color: colors.textTertiary, paddingVertical: space.sm },
  readout: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: space.sm },
  readoutLabel: { ...type.caption, color: colors.textTertiary },
  readoutValues: { flexDirection: "row", gap: space.md },
  readoutValue: { ...type.numSmStrong },
  hitRow: { flex: 1, flexDirection: "row" },
  hit: { flex: 1 },
  axis: { flexDirection: "row", justifyContent: "space-between" },
  axisText: { ...type.micro, color: colors.textTertiary },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: space.md, marginTop: space.xs },
  legendItem: { flexDirection: "row", alignItems: "center", gap: space.xs },
  swatch: { width: 10, height: 10, borderRadius: radius.xs },
  legendText: { ...type.caption, color: colors.textSecondary },
  bars: { gap: space.sm },
  barRow: { gap: space.xxs },
  barHead: { flexDirection: "row", justifyContent: "space-between", gap: space.sm },
  barLabel: { ...type.bodySm, color: colors.textPrimary, flex: 1 },
  barValue: { ...type.numSmStrong, color: colors.textPrimary },
  barShare: { ...type.micro, color: colors.textTertiary },
  barTrack: { height: 6, borderRadius: radius.pill, backgroundColor: colors.surface3, overflow: "hidden" },
  barFill: { height: 6, borderRadius: radius.pill },
  barNote: { ...type.micro, color: colors.textTertiary },
  moreBtn: { alignSelf: "flex-start", paddingVertical: space.xs },
  moreText: { ...type.label, color: colors.brandAccent },
  week: { gap: 2 },
  weekReadout: { ...type.caption, color: colors.textSecondary, marginBottom: space.xs },
  weekRow: { flexDirection: "row", alignItems: "center", gap: 1 },
  weekDay: { ...type.micro, color: colors.textTertiary, width: 28 },
  weekCell: { flex: 1, aspectRatio: 1, borderRadius: 2 },
  weekCellOn: { borderWidth: 1, borderColor: colors.textPrimary },
  weekAxis: { flexDirection: "row", justifyContent: "space-between", paddingLeft: 28, marginTop: space.xxs },
  kpiGrid: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  kpi: {
    flexBasis: "47%",
    flexGrow: 1,
    padding: space.md,
    gap: space.xxs,
    borderRadius: radius.lg,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  kpiLabel: { ...type.micro, color: colors.textTertiary },
  kpiValue: { ...type.metricSm, color: colors.textPrimary },
  kpiDelta: { flexDirection: "row", alignItems: "center", gap: 2 },
  kpiDeltaText: { ...type.micro },
  kpiHint: { ...type.micro, color: colors.textTertiary },
  share: { flexDirection: "row", alignItems: "center", gap: space.xs, paddingVertical: space.xs },
  shareText: { ...type.label, color: colors.brandAccent },
});
