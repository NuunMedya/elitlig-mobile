/**
 * FANTEZİ GÖRSEL DİLİ — küçük, paylaşılabilir parçalar.
 *
 * Yön: "ciddi spor uygulaması + küçük oyun dokunuşu". Veri önce gelir (net
 * rakam, sakin kartlar, tek vurgu rengi); oyun hissi yalnız mikro hareketle
 * (seçimde yaylı "pop", bir kez oynayan kutlama) ve saha dokusuyla verilir.
 * Bütün renkler aktif temadan (`@/theme`) gelir: açık ve koyu temada okunur.
 * Tahmin Ligi gibi diğer lig yarışmaları da bu parçaları kullanabilir.
 *
 *   <PopIn trigger={id}>          değer değişince bir kez yaylı büyüme
 *   <Panel title right>           veri kartı (başlık + sağ köşe)
 *   <StatChip label value tone>   etiketli küçük metrik hapı
 *   <PriceTag price trend>        kredi + trend oku
 *   <LineChip line>               mevki çipi (KL / DEF / OS / FOR)
 *   <FormBars values>             son 5 maç puanı mini çubukları
 *   <RoleBadge role>              kaptan "K" / yardımcı "Y" pulu
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { useReduceMotion } from "@/components/ui";
import { formatCredit, LINE_META, lineColor, pointsTone, type HintTone } from "@/lib/fantasy";
import type { FantasyLine } from "@/lib/api/community";
import { colors, hairline, radius, space, spring, textScale, type } from "@/theme";

/* ─────────────────────────── hareket ─────────────────────────── */

/** `trigger` değişince içerik bir kez yaylı biçimde büyür (seçim geri bildirimi). */
export function PopIn({ trigger, children, style, from = 0.86 }: { trigger: unknown; children: React.ReactNode; style?: StyleProp<ViewStyle>; from?: number }) {
  const reduce = useReduceMotion();
  const scale = useRef(new Animated.Value(1)).current;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (reduce) return;
    scale.setValue(from);
    Animated.spring(scale, { toValue: 1, ...spring.bounce }).start();
  }, [trigger, reduce, scale, from]);
  return <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>;
}

/* ─────────────────────────── kart ─────────────────────────── */

export function Panel({ title, right, children, style }: { title?: string; right?: React.ReactNode; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.panel, style]}>
      {title || right ? (
        <View style={styles.panelHead}>
          {title ? (
            <Text style={styles.panelTitle} {...textScale.dense}>
              {title}
            </Text>
          ) : (
            <View />
          )}
          {right}
        </View>
      ) : null}
      {children}
    </View>
  );
}

/* ─────────────────────────── çipler ─────────────────────────── */

const TONE: Record<HintTone | "neutral" | "accent", { fg: string; bg: string }> = {
  ok: { fg: colors.win, bg: colors.winDim },
  warn: { fg: colors.warn, bg: colors.warnDim },
  danger: { fg: colors.danger, bg: colors.dangerDim },
  neutral: { fg: colors.textSecondary, bg: colors.surface2 },
  accent: { fg: colors.accentText, bg: colors.accentDim },
};

export function StatChip({ label, value, tone = "neutral", icon }: { label?: string; value: string; tone?: keyof typeof TONE; icon?: keyof typeof Ionicons.glyphMap }) {
  const t = TONE[tone];
  return (
    <View style={[styles.chip, { backgroundColor: t.bg }]}>
      {icon ? <Ionicons name={icon} size={12} color={t.fg} /> : null}
      {label ? (
        <Text style={[styles.chipLabel, { color: t.fg }]} {...textScale.badge}>
          {label}
        </Text>
      ) : null}
      <Text style={[styles.chipValue, { color: t.fg }]} {...textScale.badge}>
        {value}
      </Text>
    </View>
  );
}

export function TrendIcon({ trend, size = 12 }: { trend?: string; size?: number }) {
  if (trend === "up") return <Ionicons name="caret-up" size={size} color={colors.win} accessibilityLabel="Fiyat yükseldi" />;
  if (trend === "down") return <Ionicons name="caret-down" size={size} color={colors.danger} accessibilityLabel="Fiyat düştü" />;
  return null;
}

export function PriceTag({ price, trend, prevPrice, compact }: { price: number; trend?: string; prevPrice?: number | null; compact?: boolean }) {
  return (
    <View style={styles.price} accessibilityLabel={`${formatCredit(price)} kredi${prevPrice != null && prevPrice !== price ? `, geçen hafta ${formatCredit(prevPrice)}` : ""}`}>
      <Text style={compact ? styles.priceTextSm : styles.priceText} {...textScale.badge}>
        {formatCredit(price)}
      </Text>
      <TrendIcon trend={trend} />
    </View>
  );
}

export function LineChip({ line, label }: { line: FantasyLine; label?: string }) {
  const color = lineColor(line);
  return (
    <View style={[styles.line, { borderColor: color }]}>
      <Text style={[styles.lineText, { color }]} {...textScale.badge}>
        {label ?? LINE_META[line].short}
      </Text>
    </View>
  );
}

/** Son 5 maçın puanı: çubuk yüksekliği puanla, rengi seviyeyle; oynamadığı maç çizgi. */
export function FormBars({ values, height = 18 }: { values: (number | null)[] | undefined; height?: number }) {
  const list = (values ?? []).slice(-5);
  const padded: (number | null | undefined)[] = [...Array(Math.max(0, 5 - list.length)).fill(undefined), ...list];
  const max = 16;
  return (
    <View style={[styles.bars, { height }]} accessibilityLabel={`Son maçlar: ${list.map((v) => (v == null ? "oynamadı" : v)).join(", ") || "veri yok"}`}>
      {padded.map((value, i) => {
        const h = value == null ? 2 : Math.max(3, Math.round((Math.min(Math.max(value, 0), max) / max) * height));
        return <View key={i} style={[styles.bar, { height: h, backgroundColor: value === undefined ? colors.separator : pointsTone(value) }]} />;
      })}
    </View>
  );
}

export function RoleBadge({ role, size = 18 }: { role: "captain" | "vice"; size?: number }) {
  const captain = role === "captain";
  return (
    <View
      style={[styles.role, { width: size, height: size, backgroundColor: captain ? colors.textPrimary : colors.surface1, borderColor: colors.textPrimary }]}
      accessibilityLabel={captain ? "Kaptan" : "Yardımcı kaptan"}
    >
      <Text style={[styles.roleText, { color: captain ? colors.bg : colors.textPrimary }]} {...textScale.badge}>
        {captain ? "K" : "Y"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.xl,
    borderWidth: hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface1,
  },
  panelHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm },
  panelTitle: { ...type.h3, color: colors.textPrimary },
  chip: { flexDirection: "row", alignItems: "center", gap: space.xxs, paddingHorizontal: space.s, paddingVertical: space.xxs, borderRadius: radius.pill },
  chipLabel: { ...type.caption },
  chipValue: { ...type.numSmStrong },
  price: { flexDirection: "row", alignItems: "center", gap: space.xxs },
  priceText: { ...type.scoreXs, color: colors.textPrimary },
  priceTextSm: { ...type.numSmStrong, color: colors.textPrimary },
  line: { minWidth: 30, alignItems: "center", paddingHorizontal: space.xs, paddingVertical: 1, borderRadius: radius.xs, borderWidth: 1 },
  lineText: { ...type.micro },
  bars: { flexDirection: "row", alignItems: "flex-end", gap: space.xxs },
  bar: { width: 5, borderRadius: 2 },
  role: { alignItems: "center", justifyContent: "center", borderRadius: radius.pill, borderWidth: 1.5 },
  roleText: { ...type.nano },
});
