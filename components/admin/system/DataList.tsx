/**
 * DataList — web analiz tablolarının (DataTable) telefon karşılığı.
 *
 * NE: her satır bir kayıt; üstte ana sütun (sayfa yolu, sözcük, ekran adı),
 * altında diğer sütunlar "Etiket değer" çiftleri olarak sarar. İlk N satır
 * görünür, "Tümünü göster" ile açılır; "CSV paylaş" tabloyu metin olarak
 * paylaşım sayfasına verir. Sıralama sunucunun sırasıdır (web varsayılanı).
 *
 * NEDEN TABLO DEĞİL: 6–8 sütunlu tablo telefonda yatay kaydırma ister ve
 * sayfa yolu gibi uzun metinler kırpılır; sarmalayan satır hepsini okutur.
 */

import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Touchable } from "@/components/ui";
import { fmtNum } from "@/lib/api/admin/system";
import { colors, hairline, space, textScale, type } from "@/theme";

import { ShareCsvButton } from "./charts";

export interface DataColumn<T> {
  key: string;
  label: string;
  /** Ekranda gösterilecek metin (varsayılan: sayıysa biçimli sayı). */
  render?: (row: T) => string;
}

export function DataList<T extends Record<string, unknown>>({
  rows,
  primary,
  primaryLabel,
  columns,
  limit = 8,
  emptyText = "Veri yok.",
  csvTitle,
  onPress,
}: {
  rows: T[];
  primary: (row: T) => string;
  /** CSV'de ana sütunun başlığı. */
  primaryLabel: string;
  columns: DataColumn<T>[];
  limit?: number;
  emptyText?: string;
  /** Verilirse "CSV paylaş" bağlantısı çıkar. */
  csvTitle?: string;
  onPress?: (row: T) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  if (!rows.length) {
    return (
      <Text style={styles.empty} {...textScale.dense}>
        {emptyText}
      </Text>
    );
  }
  const shown = expanded ? rows : rows.slice(0, limit);
  const show = (row: T, col: DataColumn<T>) => {
    if (col.render) return col.render(row);
    const v = row[col.key];
    return typeof v === "number" ? fmtNum(v) : v == null || v === "" ? "—" : String(v);
  };
  return (
    <View>
      {shown.map((row, index) => {
        const body = (
          <>
            <Text style={styles.primary} numberOfLines={2} {...textScale.dense}>
              {primary(row)}
            </Text>
            <Text style={styles.cols} {...textScale.dense}>
              {columns.map((col, i) => (
                <Text key={col.key}>
                  {i ? "   " : ""}
                  <Text style={styles.colLabel}>{col.label} </Text>
                  <Text style={styles.colValue}>{show(row, col)}</Text>
                </Text>
              ))}
            </Text>
          </>
        );
        const style = [styles.row, index ? styles.rowBorder : null];
        return onPress ? (
          <Touchable key={index} onPress={() => onPress(row)} style={style} accessibilityRole="button">
            {body}
          </Touchable>
        ) : (
          <View key={index} style={style}>
            {body}
          </View>
        );
      })}
      <View style={styles.foot}>
        {rows.length > limit ? (
          <Touchable onPress={() => setExpanded((v) => !v)} accessibilityRole="button">
            <Text style={styles.link} {...textScale.dense}>
              {expanded ? "Daha az göster" : `Tümünü göster (${rows.length})`}
            </Text>
          </Touchable>
        ) : (
          <View />
        )}
        {csvTitle ? (
          <ShareCsvButton
            title={csvTitle}
            columns={[{ key: "__primary", label: primaryLabel }, ...columns.map((c) => ({ key: c.key, label: c.label }))]}
            rows={rows.map((row) => ({ __primary: primary(row), ...Object.fromEntries(columns.map((c) => [c.key, show(row, c)])) }))}
          />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { ...type.bodySm, color: colors.textTertiary, paddingVertical: space.sm },
  row: { paddingVertical: space.sm, gap: space.xxs },
  rowBorder: { borderTopWidth: hairline, borderTopColor: colors.separator },
  primary: { ...type.bodySm, color: colors.textPrimary },
  cols: { ...type.caption, color: colors.textSecondary },
  colLabel: { color: colors.textTertiary },
  colValue: { color: colors.textPrimary },
  foot: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingTop: space.xs },
  link: { ...type.label, color: colors.brandAccent },
});
