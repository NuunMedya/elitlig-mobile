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

import { FormSheet, InfoLine, Panel, useAdminMutation, type FormValues } from "@/components/admin";
import { Button, EmptyState, SkeletonCard } from "@/components/ui";
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
import { colors, radius, space, textScale, type } from "@/theme";

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
  return (
    <Panel title="PİYASA DEĞERİ">
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
          <Text style={styles.value} {...textScale.dense}>
            {formatEtl(mv.currentValue)}
          </Text>
          {mv.changeAmount ? (
            <Text style={[styles.change, { color: mv.changeAmount > 0 ? colors.win : colors.danger }]} {...textScale.dense}>
              {mv.changeAmount > 0 ? "Arttı" : "Düştü"}: {formatEtl(Math.abs(mv.changeAmount))} (%{Math.abs(mv.changePercentage)})
            </Text>
          ) : null}
          <InfoLine label="Piyasa skoru" value={`${Number(mv.marketScore).toFixed(1)} / 100`} />
          <InfoLine label="Genel sıra" value={mv.globalRank != null ? String(mv.globalRank) : "—"} />
          <InfoLine label="İl sırası" value={mv.cityRank != null ? String(mv.cityRank) : "—"} />
          <InfoLine
            label={`Mevki sırası (${POSITION_GROUP_LABELS[mv.positionGroup ?? ""] ?? mv.positionGroup ?? "—"})`}
            value={mv.positionRank != null ? String(mv.positionRank) : "—"}
          />
          <InfoLine label="Gelişim puanı" value={mv.growthPoints != null ? Number(mv.growthPoints).toFixed(1) : "—"} />
          <InfoLine label="Son hesap" value={mv.lastCalculatedAt ? formatDateTime(mv.lastCalculatedAt) : "—"} />

          {breakdown.data ? (
            <View style={styles.stack}>
              <Text style={styles.section} {...textScale.dense}>
                DEĞER NASIL OLUŞTU?
              </Text>
              {Object.entries(BREAKDOWN_LABELS).map(([key, label]) => {
                const score = breakdown.data?.[key];
                if (typeof score !== "number") return null;
                const pct = Math.min(100, Math.max(0, score));
                return (
                  <View key={key} style={styles.bar} accessibilityLabel={`${label}: ${Math.round(score)}`}>
                    <Text style={styles.barLabel} numberOfLines={1} {...textScale.dense}>
                      {label}
                    </Text>
                    <View style={styles.track}>
                      <View style={[styles.fill, { width: `${pct}%` }]} />
                    </View>
                    <Text style={styles.barValue} {...textScale.dense}>
                      {Math.round(score)}
                    </Text>
                  </View>
                );
              })}
            </View>
          ) : null}

          {history.data?.length ? (
            <View style={styles.stack}>
              <Text style={styles.section} {...textScale.dense}>
                DEĞİŞİM GEÇMİŞİ
              </Text>
              {history.data.map((h) => (
                <InfoLine
                  key={h.id}
                  label={`${formatDate(h.createdAt)} · ${CALC_REASON_LABELS[h.calculation_reason] ?? h.calculation_reason}`}
                  value={`${h.old_value != null ? formatEtl(h.old_value) : "—"} → ${formatEtl(h.new_value)}`}
                />
              ))}
            </View>
          ) : null}

          <View style={styles.row}>
            {canRecalc ? (
              <Button label="Yeniden hesapla" icon="refresh" size="sm" variant="secondary" loading={recalc.isPending} onPress={() => recalc.mutate(undefined)} />
            ) : null}
            {canAdjust ? <Button label="Değeri düzelt" icon="create-outline" size="sm" variant="ghost" onPress={() => setAdjusting(true)} /> : null}
          </View>
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
    </Panel>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.sm },
  row: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  value: { ...type.metricSm, color: colors.textPrimary },
  change: { ...type.bodySm },
  section: { ...type.overline, color: colors.textTertiary, marginTop: space.sm },
  bar: { flexDirection: "row", alignItems: "center", gap: space.sm },
  barLabel: { ...type.caption, color: colors.textSecondary, width: 130 },
  track: { flex: 1, height: 6, borderRadius: radius.pill, backgroundColor: colors.surface3, overflow: "hidden" },
  fill: { height: 6, borderRadius: radius.pill, backgroundColor: colors.brandAccent },
  barValue: { ...type.numSmStrong, color: colors.textPrimary, width: 28, textAlign: "right" },
});
