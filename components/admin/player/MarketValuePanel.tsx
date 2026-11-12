/**
 * Oyuncu profili → Piyasa değeri (web editor_pages/PlayerMarketValueSection.js).
 *
 * Değerin nasıl oluştuğunu gösterir (bileşen kırılımı, sıralamalar, değişim
 * geçmişi) ve yetkiye göre yeniden hesaplama (market_value.recalculate) ile
 * manuel değer düzeltmesi (market_value.settings) sunar.
 */

import { useQuery } from "@tanstack/react-query";
import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { FormSheet, useAdminMutation, type FormValues } from "@/components/admin";
import { GroupCard, Sparkline } from "@/components/admin/team/ManageKit";
import { Button, EmptyState, GradientBar, Odometer, ProgressRing, SkeletonCard } from "@/components/ui";
import { hasPermission } from "@/lib/admin/access";
import { formatDate, formatDateTime } from "@/lib/admin/format";
import {
  BREAKDOWN_LABELS,
  CALC_REASON_LABELS,
  POSITION_GROUP_LABELS,
  adjustPlayerValue,
  formatEtl,
  getPlayerBreakdown,
  getPlayerHistory,
  getPlayerMarketValue,
  parseNumber,
  recalculatePlayer,
} from "@/lib/api/admin/marketValue";
import { ApiError } from "@/lib/http";
import type { AuthUser } from "@/lib/types";
import { colors, hairline, radius, space, textScale, type, upperTR } from "@/theme";

export function MarketValuePanel({ playerId, user }: { playerId: number; user: AuthUser | null }) {
  const canRecalc = hasPermission(user, "market_value.recalculate");
  const canAdjust = hasPermission(user, "market_value.settings");
  const [adjusting, setAdjusting] = useState(false);
  const KEY = ["admin", "market-value", "player", playerId] as const;

  const value = useQuery({
    queryKey: KEY,
    queryFn: () =>
      getPlayerMarketValue(playerId).catch((e) => {
        // 404 = henüz hesaplanmamış; boş durum gösterilir.
        if (e instanceof ApiError && e.status === 404) return null;
        throw e;
      }),
  });
  const breakdown = useQuery({ queryKey: [...KEY, "breakdown"], queryFn: () => getPlayerBreakdown(playerId).catch(() => null), enabled: Boolean(value.data) });
  const history = useQuery({ queryKey: [...KEY, "history"], queryFn: () => getPlayerHistory(playerId).catch(() => []), enabled: Boolean(value.data) });

  const recalc = useAdminMutation(() => recalculatePlayer(playerId), {
    success: (r) =>
      r?.newValue != null ? `Yeniden hesaplandı: ${formatEtl(r.currentValue)} → ${formatEtl(r.newValue)}` : r?.message || "Hesaplanacak veri bulunamadı.",
    invalidate: [KEY, ["admin", "market-value"]],
  });

  const adjust = useAdminMutation(
    (v: FormValues) => {
      const n = parseNumber(v.newValue);
      if (!(n > 0)) throw new Error("Geçerli bir değer girin (ETL).");
      return adjustPlayerValue(playerId, n, String(v.note ?? "").trim());
    },
    { success: (r) => `Değer güncellendi: ${formatEtl(r.oldValue)} → ${formatEtl(r.newValue)}`, invalidate: [KEY, ["admin", "market-value"]] }
  );

  const mv = value.data;
  /* Geçmiş en yeniden eskiye gelir; grafik eskiden yeniye çizilir. */
  const series = [...(history.data ?? [])].reverse();
  const points = series.length ? [series[0].old_value ?? series[0].new_value, ...series.map((h) => h.new_value)] : [];
  const up = (mv?.changeAmount ?? 0) > 0;
  const groupLabel = POSITION_GROUP_LABELS[mv?.positionGroup ?? ""] ?? mv?.positionGroup ?? "Mevki";

  return (
    <GroupCard
      title="Piyasa değeri"
      icon="trending-up"
      tone="mint"
      action={canAdjust && mv ? { label: "Düzelt", onPress: () => setAdjusting(true) } : undefined}
    >
      {value.isLoading ? (
        <SkeletonCard />
      ) : !mv ? (
        <EmptyState
          icon="trending-up-outline"
          variant="inline"
          compact
          title="Henüz hesaplanmamış"
          body="Bu oyuncu için piyasa değeri hesaplanmamış."
          action={canRecalc ? { label: "Şimdi hesapla", onPress: () => recalc.mutate(undefined) } : undefined}
        />
      ) : (
        <View style={styles.stack}>
          {/* DEĞER BLOĞU — büyük rakam + değişim oku + skor çubuğu. */}
          <View style={styles.hero}>
            <View style={styles.flex}>
              <View style={styles.valueRow}>
                <Odometer value={Math.round(mv.currentValue).toLocaleString("tr-TR")} style={styles.value} />
                <Text style={styles.unit} {...textScale.badge}>
                  ETL
                </Text>
              </View>
              {mv.changeAmount ? (
                <View style={[styles.change, { backgroundColor: up ? colors.winDim : colors.lossDim }]}>
                  <Text style={[styles.changeText, { color: up ? colors.win : colors.loss }]} {...textScale.badge}>
                    {up ? "▲" : "▼"} {formatEtl(Math.abs(mv.changeAmount))} · %{Math.abs(mv.changePercentage)}
                  </Text>
                </View>
              ) : (
                <Text style={styles.caption} {...textScale.dense}>
                  Son hesaptan beri değişmedi
                </Text>
              )}
            </View>
            <ProgressRing value={Math.min(1, Number(mv.marketScore) / 100)} size={64} thickness={6} tone="brand" label={Number(mv.marketScore).toFixed(0)} sublabel="skor" animate />
          </View>

          {points.length >= 2 ? <Sparkline values={points} height={76} /> : null}

          <View style={styles.ranks}>
            {[
              { label: "Genel", value: mv.globalRank },
              { label: "İl", value: mv.cityRank },
              { label: groupLabel, value: mv.positionRank },
            ].map((r, i) => (
              <View key={r.label} style={[styles.rank, i ? styles.rankDivided : null]}>
                <Text style={styles.rankValue} numberOfLines={1} {...textScale.badge}>
                  {r.value != null ? `#${r.value}` : "—"}
                </Text>
                <Text style={styles.rankLabel} numberOfLines={1} {...textScale.badge}>
                  {upperTR(r.label)}
                </Text>
              </View>
            ))}
          </View>

          {breakdown.data ? (
            <View style={styles.block}>
              <Text style={styles.section} {...textScale.dense}>
                DEĞER NASIL OLUŞTU?
              </Text>
              {Object.entries(BREAKDOWN_LABELS).map(([key, label]) => {
                const score = breakdown.data?.[key];
                if (typeof score !== "number") return null;
                return (
                  <View key={key} style={styles.bar} accessibilityLabel={`${label}: ${Math.round(score)}`}>
                    <View style={styles.barHead}>
                      <Text style={styles.barLabel} numberOfLines={1} {...textScale.dense}>
                        {label}
                      </Text>
                      <Text style={styles.barValue} {...textScale.dense}>
                        {Math.round(score)}
                      </Text>
                    </View>
                    <GradientBar value={score / 100} height={5} />
                  </View>
                );
              })}
            </View>
          ) : null}

          {history.data?.length ? (
            <View style={styles.block}>
              <Text style={styles.section} {...textScale.dense}>
                DEĞİŞİM GEÇMİŞİ
              </Text>
              {history.data.map((h, i) => {
                const diff = h.old_value != null ? h.new_value - h.old_value : 0;
                return (
                  <View key={h.id} style={[styles.hist, i ? styles.histDivided : null]}>
                    <View style={styles.flex}>
                      <Text style={styles.histTitle} numberOfLines={1} {...textScale.dense}>
                        {CALC_REASON_LABELS[h.calculation_reason] ?? h.calculation_reason}
                      </Text>
                      <Text style={styles.caption} {...textScale.dense}>
                        {formatDate(h.createdAt)} · {formatEtl(h.new_value)}
                      </Text>
                    </View>
                    <Text style={[styles.histDiff, { color: diff > 0 ? colors.win : diff < 0 ? colors.loss : colors.textTertiary }]} {...textScale.badge}>
                      {diff > 0 ? "+" : diff < 0 ? "−" : ""}
                      {diff ? Math.abs(Math.round(diff)).toLocaleString("tr-TR") : "0"}
                    </Text>
                  </View>
                );
              })}
            </View>
          ) : null}

          <Text style={styles.caption} {...textScale.dense}>
            Gelişim puanı {mv.growthPoints != null ? Number(mv.growthPoints).toFixed(1) : "—"} · son hesap {mv.lastCalculatedAt ? formatDateTime(mv.lastCalculatedAt) : "—"}
          </Text>
          {canRecalc ? (
            <Button label="Yeniden hesapla" icon="refresh" variant="secondary" fullWidth loading={recalc.isPending} onPress={() => recalc.mutate(undefined)} />
          ) : null}
        </View>
      )}

      <FormSheet
        visible={adjusting}
        onClose={() => setAdjusting(false)}
        title="Değeri düzelt"
        intro="Formülün ürettiği değeri yönetici kararıyla ezer; geçmişe 'Yönetici düzeltmesi' olarak işlenir."
        fields={[
          { key: "newValue", label: "Yeni değer (ETL)", kind: "money", required: true },
          { key: "note", label: "Gerekçe", kind: "multiline", maxLength: 500 },
        ]}
        submitLabel="Değeri kaydet"
        onSubmit={(v) => adjust.mutateAsync(v)}
      />
    </GroupCard>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.lg },
  flex: { flex: 1, minWidth: 0 },
  hero: { flexDirection: "row", alignItems: "center", gap: space.md },
  valueRow: { flexDirection: "row", alignItems: "flex-end", gap: space.xs },
  value: { ...type.scoreLg, color: colors.textPrimary },
  unit: { ...type.labelSm, color: colors.textTertiary, marginBottom: space.xs },
  change: { alignSelf: "flex-start", marginTop: space.xs, paddingHorizontal: space.sm, paddingVertical: space.xxs, borderRadius: radius.pill },
  changeText: { ...type.numSmStrong },
  caption: { ...type.caption, color: colors.textTertiary },
  ranks: { flexDirection: "row", borderRadius: radius.lg, backgroundColor: colors.surface2, paddingVertical: space.md },
  rank: { flex: 1, alignItems: "center", gap: 2, paddingHorizontal: space.xs },
  rankDivided: { borderLeftWidth: hairline, borderLeftColor: colors.separator },
  rankValue: { ...type.scoreSm, color: colors.textPrimary },
  rankLabel: { ...type.micro, color: colors.textTertiary },
  block: { gap: space.sm },
  section: { ...type.overline, color: colors.textTertiary },
  bar: { gap: space.xs },
  barHead: { flexDirection: "row", justifyContent: "space-between", gap: space.sm },
  barLabel: { ...type.labelSm, color: colors.textSecondary, flex: 1 },
  barValue: { ...type.numSmStrong, color: colors.textPrimary },
  hist: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.sm },
  histDivided: { borderTopWidth: hairline, borderTopColor: colors.separator },
  histTitle: { ...type.label, color: colors.textPrimary },
  histDiff: { ...type.tableNumStrong },
});
