/**
 * DÖNEM TABLOSU — sezon sezon (ya da lig·sezon) sayılar, en altta toplam.
 *
 * Herkese açık profil "Sezon sezon" (M · G · SK · KK · Ø), üye paneli "Dönem
 * dönem" (M · G · A · Ø) çizer; sütunlar çağırandan gelir, düzen ortaktır.
 *
 * TASARIM:
 *   - Sayı sütunları sabit genişlikte ve tabular — alt alta rakamlar hizalı.
 *   - Her satırın altında ince bir GOL PAYI çizgisi: satırın gol sayısının en
 *     golcü dönemine oranı. Tablo böylece hem okunur hem "en iyi sezonu
 *     hangisi" sorusunu tek bakışta yanıtlar. (Veri rengi: accent.)
 *   - Reyting hapı yalnız puanlanmış dönemde; puansız dönem tire değil boş.
 */

import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { RatingPill } from "@/components/ui";
import { colors, hairline, radius, space, textScale, type } from "@/theme";
import { surfaces } from "./shared";

export interface StatColumn {
  key: string;
  label: string;
}

export interface StatRow {
  key: string;
  title: string;
  subtitle?: string;
  /** `columns` sırasıyla değerler. */
  values: (number | string)[];
  rating: number | null;
  /** 0–1 — satırın altındaki pay çizgisi; verilmezse çizilmez. */
  share?: number;
}

export interface StatTableProps {
  columns: StatColumn[];
  rows: StatRow[];
  /** Toplam satırı (kariyer); verilmezse çizilmez. */
  total?: Omit<StatRow, "key" | "share">;
}

export const StatTable = React.memo(function StatTable({ columns, rows, total }: StatTableProps) {
  return (
    <View style={surfaces.card}>
      <View style={styles.head}>
        <Text style={[styles.th, styles.colTitle]} {...textScale.badge}>
          DÖNEM
        </Text>
        {columns.map((column) => (
          <Text key={column.key} style={[styles.th, styles.colNum]} {...textScale.badge}>
            {column.label}
          </Text>
        ))}
        <Text style={[styles.th, styles.colRating]} {...textScale.badge}>
          PUAN
        </Text>
      </View>

      {rows.map((row) => (
        <View key={row.key} style={styles.row}>
          <View style={styles.rowMain}>
            <View style={styles.colTitle}>
              <Text style={styles.title} numberOfLines={1} {...textScale.dense}>
                {row.title}
              </Text>
              {row.subtitle ? (
                <Text style={styles.subtitle} numberOfLines={1} {...textScale.dense}>
                  {row.subtitle}
                </Text>
              ) : null}
            </View>
            {row.values.map((value, index) => (
              <Text
                key={columns[index]?.key ?? index}
                style={[styles.num, styles.colNum, Number(value) === 0 && styles.numZero]}
                {...textScale.dense}
              >
                {value}
              </Text>
            ))}
            <View style={styles.colRating}>
              <RatingPill value={row.rating} size="sm" hideEmpty />
            </View>
          </View>
          {row.share != null ? (
            <View style={styles.share}>
              <View style={[styles.shareFill, { flex: Math.max(0, Math.min(1, row.share)) }]} />
              <View style={{ flex: 1 - Math.max(0, Math.min(1, row.share)) }} />
            </View>
          ) : null}
        </View>
      ))}

      {total ? (
        <View style={[styles.row, styles.totalRow]}>
          <View style={styles.rowMain}>
            <View style={styles.colTitle}>
              <Text style={styles.totalTitle} numberOfLines={1} {...textScale.badge}>
                {total.title}
              </Text>
              {total.subtitle ? (
                <Text style={styles.subtitle} numberOfLines={1} {...textScale.dense}>
                  {total.subtitle}
                </Text>
              ) : null}
            </View>
            {total.values.map((value, index) => (
              <Text key={columns[index]?.key ?? index} style={[styles.numStrong, styles.colNum]} {...textScale.dense}>
                {value}
              </Text>
            ))}
            <View style={styles.colRating}>
              <RatingPill value={total.rating} size="sm" hideEmpty />
            </View>
          </View>
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.sm,
    borderBottomWidth: hairline,
    borderBottomColor: colors.separator,
  },
  th: {
    ...type.overline,
    color: colors.textTertiary,
    textAlign: "center",
  },
  row: {
    paddingHorizontal: space.lg,
    paddingVertical: space.m,
    gap: space.s,
    borderTopWidth: hairline,
    borderTopColor: colors.separator,
  },
  rowMain: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
  },
  /* İlk satırın üst çizgisi başlığın alt çizgisiyle çakışmasın. */
  colTitle: {
    flex: 1,
    minWidth: 0,
    textAlign: "left",
    gap: 1,
  },
  colNum: {
    width: 30,
    textAlign: "center",
  },
  colRating: {
    width: 44,
    alignItems: "flex-end",
    textAlign: "right",
  },
  title: {
    ...type.h4,
    color: colors.textPrimary,
  },
  subtitle: {
    ...type.caption,
    color: colors.textTertiary,
  },
  num: {
    ...type.tableNum,
    color: colors.textPrimary,
  },
  /* Sıfır bilgi değil boşluktur: sönük yazılır, satırın asıl sayıları öne çıkar. */
  numZero: {
    color: colors.textTertiary,
  },
  numStrong: {
    ...type.tableNumStrong,
    color: colors.textPrimary,
  },
  share: {
    flexDirection: "row",
    height: 3,
    borderRadius: radius.pill,
    overflow: "hidden",
    backgroundColor: colors.surface3,
  },
  shareFill: {
    height: 3,
    backgroundColor: colors.accent,
  },
  totalRow: {
    backgroundColor: colors.surface2,
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
  },
  totalTitle: {
    ...type.overline,
    color: colors.textPrimary,
  },
});
